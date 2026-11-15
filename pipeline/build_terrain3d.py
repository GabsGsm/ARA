"""Cenas 3D do ARA: relevo + imagem reais de Marte, da Lua e da Terra na MESMA grade local.

Cada cena vira três arquivos em data/terrain/:
    <id>.json      metadados: centro, tamanho, faixa de elevação, fontes, pontos de interesse, trajetos
    <id>_h.png     relevo em 16 bits guardado em PNG RGB (R*256+G = 0..65535 -> min..max metros)
    <id>_c.jpg     imagem (ortofoto) alinhada ao relevo (só Marte e Terra; a Lua usa luz física no navegador)

Todas as fontes são reamostradas para uma grade azimutal equidistante centrada no sítio (metros
de verdade em x/y), então Jezero, o polo sul lunar e o Vale da Morte ficam na mesma escala e
podem ser comparados lado a lado.

Fontes (todas públicas, lidas por partes direto dos servidores, sem baixar arquivos inteiros):
  Marte  CTX DTM 20 m + CTX ortho 6 m (USGS/JPL, Mars 2020 TRN), cor Viking MDIM 2.1 (NASA Mars Trek)
         cratera inteira: CTX DEM 20 m + ortho 5 m (JPL Science Investigation Maps)
         trajeto e paradas do Perseverance (NASA/JPL MMGIS)
  Lua    LOLA LDEM_80S_40MPP_ADJ (NASA Goddard PGDA, Barker et al.)
  Terra  Terrain Tiles (AWS Open Data, Mapzen/Terrarium) + Esri World Imagery

Uso, na raiz do projeto:
    python pipeline/build_terrain3d.py            # todas as cenas
    python pipeline/build_terrain3d.py --only jezero_01 haworth_01
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image, ImageFilter
from rasterio.warp import transform as warp_transform
from rasterio.windows import Window
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "terrain"
CACHE = ROOT / "pipeline" / "cache"
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")
os.environ.setdefault("VSI_CACHE", "TRUE")

R_MARS, R_MOON = 3396190.0, 1737400.0
M20 = "/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/"
SRC = {
    "ctx_dtm": M20 + "CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
    "ctx_ortho": M20 + "CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif",
    "crater_dtm": M20 + "CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif",
    "crater_ortho": M20 + "CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif",
    "lola": "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_40MPP_ADJ.TIF",
}
VIKING = "https://trek.nasa.gov/tiles/Mars/EQ/Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
TOP_EARTH = 3  # cenas 3D para os 3 melhores análogos de cada sítio
UA = {"User-Agent": "ARA-terrain3d/1.0 (NASA Space Apps 2026 project)"}

CITE = {
    "ctx": {"name": "CTX DTM 20 m e ortomosaico 6 m de Jezero (Mars 2020 TRN)", "by": "NASA/JPL-Caltech/MSSS · USGS Astrogeology",
            "url": "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/"},
    "crater": {"name": "CTX DEM 20 m e ortomosaico 5 m da cratera Jezero (Science Investigation Maps)", "by": "NASA/JPL-Caltech · USGS",
               "url": "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/"},
    "viking": {"name": "Viking MDIM 2.1 colorido (232 m) — só a cor", "by": "NASA Solar System Treks", "url": "https://trek.nasa.gov/mars/"},
    "mmgis": {"name": "Trajeto e paradas do Perseverance", "by": "NASA/JPL-Caltech MMGIS", "url": "https://mars.nasa.gov/mars2020/mission/where-is-the-rover/"},
    "lola": {"name": "LOLA LDEM_80S_40MPP_ADJ (40 m)", "by": "NASA Goddard PGDA · Barker et al. (2021)", "url": "https://pgda.gsfc.nasa.gov/products/90"},
    "terrarium": {"name": "Terrain Tiles (SRTM/NED/ETOPO, ~10–30 m)", "by": "AWS Open Data · Mapzen", "url": "https://registry.opendata.aws/terrain-tiles/"},
    "esri": {"name": "World Imagery", "by": "Esri, Maxar, Earthstar Geographics", "url": "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"},
}


# ---------------------------------------------------------------------------- grade local
def local_grid(lat0, lon0, size_m, n, radius=None):
    """Centros dos pixels (n x n) de uma grade azimutal equidistante centrada em (lat0, lon0).
    Linha 0 = norte. Devolve lon, lat (graus) e a string CRS da grade."""
    if radius:
        crs = f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +R={radius} +units=m +no_defs"
        geo = f"+proj=longlat +R={radius} +no_defs"
    else:
        crs = f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +ellps=WGS84 +units=m +no_defs"
        geo = "EPSG:4326"
    step = size_m / n
    c = (np.arange(n) + 0.5) * step - size_m / 2
    xx, yy = np.meshgrid(c, -c)
    lon, lat = warp_transform(crs, geo, xx.ravel(), yy.ravel())
    return np.asarray(lon).reshape(n, n), np.asarray(lat).reshape(n, n), crs, geo


def to_uv(lat0, lon0, size_m, lats, lons, radius=None):
    """lat/lon -> (u, v) em 0..1 dentro da cena (u leste, v sul)."""
    crs = (f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +R={radius} +units=m +no_defs" if radius
           else f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +ellps=WGS84 +units=m +no_defs")
    geo = f"+proj=longlat +R={radius} +no_defs" if radius else "EPSG:4326"
    x, y = warp_transform(geo, crs, list(lons), list(lats))
    return [((xi + size_m / 2) / size_m, (size_m / 2 - yi) / size_m) for xi, yi in zip(x, y)]


# ---------------------------------------------------------------------------- leitura de rasters
def sample_raster(path, geo_crs, lon, lat, max_px=None, nodata_fill=True):
    """Amostra (bilinear) um raster remoto nos pontos lon/lat, lendo só a janela necessária.
    max_px limita o tamanho lido (usa decimação/overview) para cenas grandes."""
    with rasterio.open(path) as d:
        xs, ys = warp_transform(geo_crs, d.crs, lon.ravel().tolist(), lat.ravel().tolist())
        inv = ~d.transform
        cols, rows = inv * (np.asarray(xs), np.asarray(ys))
        c0, c1 = int(max(0, math.floor(cols.min()) - 2)), int(min(d.width, math.ceil(cols.max()) + 3))
        r0, r1 = int(max(0, math.floor(rows.min()) - 2)), int(min(d.height, math.ceil(rows.max()) + 3))
        if c1 <= c0 or r1 <= r0:
            raise ValueError(f"cena fora da cobertura de {path.split('/')[-1]}")
        win = Window(c0, r0, c1 - c0, r1 - r0)
        f = 1
        if max_px and max(win.width, win.height) > max_px:
            f = max(win.width, win.height) / max_px
        out_shape = (max(2, int(round(win.height / f))), max(2, int(round(win.width / f))))
        arr = d.read(1, window=win, out_shape=out_shape, resampling=rasterio.enums.Resampling.bilinear if f > 1 else rasterio.enums.Resampling.nearest).astype(np.float32)
        nod = d.nodata
        bad = ~np.isfinite(arr) | ((arr == nod) if nod is not None and np.isfinite(nod) else False) | (arr < -1e30)
        if nodata_fill and bad.any() and (~bad).any():
            arr[bad] = np.nan
        fy, fx = win.height / out_shape[0], win.width / out_shape[1]
        rr, cc = (rows - r0) / fy - 0.5, (cols - c0) / fx - 0.5   # índice do centro do pixel lido
        filled = np.where(np.isnan(arr), np.nanmean(arr) if np.isfinite(arr).any() else 0, arr)
        vals = map_coordinates(filled, [rr, cc], order=1, mode="nearest")
        valid = map_coordinates((~np.isnan(arr)).astype(np.float32), [rr, cc], order=1, mode="nearest")
        native = abs(d.res[0]) * f
    return vals.reshape(lon.shape), valid.reshape(lon.shape) > 0.5, native


def fetch_tile(url, kind):
    p = CACHE / "tiles" / kind / url.split("://", 1)[1].replace("/", "_").replace("?", "_")
    if p.exists():
        return Image.open(p).copy()
    p.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=40)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            p.write_bytes(r.content)
            return Image.open(io.BytesIO(r.content)).copy()
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                print(f"   ! falhou {url}: {e}")
                return None
            time.sleep(2 * (attempt + 1))


def sample_xyz(template, kind, lon, lat, z, decode, channels):
    """Amostra uma camada de tiles Web Mercator (Terrarium, Esri) nos pontos lon/lat."""
    n = 2 ** z
    px = (lon + 180) / 360 * n * 256
    lr = np.radians(lat)
    py = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n * 256
    tx0, tx1 = int(px.min() // 256), int(px.max() // 256)
    ty0, ty1 = int(py.min() // 256), int(py.max() // 256)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mosaic = np.zeros((H, W, channels), np.float32)
    from concurrent.futures import ThreadPoolExecutor
    jobs = [(tx, ty) for tx in range(tx0, tx1 + 1) for ty in range(ty0, ty1 + 1)]
    with ThreadPoolExecutor(8) as pool:  # baixa em paralelo (o cache em disco evita baixar de novo)
        tiles = list(pool.map(lambda t: fetch_tile(template.format(z=z, x=t[0], y=t[1]), kind), jobs))
    for (tx, ty), im in zip(jobs, tiles):
        if im is None:
            continue
        mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = decode(im)
    rr, cc = py - ty0 * 256 - 0.5, px - tx0 * 256 - 0.5
    return np.stack([map_coordinates(mosaic[..., k], [rr, cc], order=1, mode="nearest") for k in range(channels)], -1)


def terrarium_decode(im):
    a = np.asarray(im.convert("RGB"), np.float32)
    return ((a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256) - 32768)[..., None]


def viking_color(lon, lat, z=7):
    """Cor do mosaico Viking (Mars Trek, grade equiretangular 2:1)."""
    px = (lon + 180) / 360 * 256 * 2 ** (z + 1)
    py = (90 - lat) / 180 * 256 * 2 ** z
    tx0, tx1, ty0, ty1 = int(px.min() // 256), int(px.max() // 256), int(py.min() // 256), int(py.max() // 256)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, 3), np.float32)
    ok = False
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            im = fetch_tile(VIKING.format(z=z, x=tx, y=ty), "viking")
            if im is not None:
                ok = True
                mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = np.asarray(im.convert("RGB"), np.float32)
    if not ok:
        return None
    rr, cc = py - ty0 * 256 - 0.5, px - tx0 * 256 - 0.5
    return np.stack([map_coordinates(mosaic[..., k], [rr, cc], order=1, mode="nearest") for k in range(3)], -1)


# ---------------------------------------------------------------------------- saída
def save_height(path, h):
    lo, hi = float(np.nanmin(h)), float(np.nanmax(h))
    q = np.round((h - lo) / max(hi - lo, 1e-6) * 65535).astype(np.uint32)
    # 16 bits em dois canais de 8 (R = byte alto, G = byte baixo): o navegador lê exato via canvas
    rgb = np.stack([(q >> 8).astype(np.uint8), (q & 255).astype(np.uint8), np.zeros_like(q, np.uint8)], -1)
    Image.fromarray(rgb).save(path, optimize=True)
    return lo, hi


def colorize_mars(gray, color):
    """CTX (pancromático, detalhe) + Viking (cor, 232 m): mantém o detalhe do CTX e a cor real de Marte."""
    g = gray.astype(np.float32)
    g = (g - np.percentile(g, 1)) / max(np.percentile(g, 99.5) - np.percentile(g, 1), 1)
    g = np.clip(g, 0, 1)
    if color is None:
        ramp = np.array([[52, 30, 22], [128, 74, 48], [190, 128, 88], [236, 196, 150]], np.float32)
        idx = g * 3
        i0 = np.clip(idx.astype(int), 0, 2)
        t = (idx - i0)[..., None]
        return ramp[i0] * (1 - t) + ramp[i0 + 1] * t
    c = color / max(np.percentile(color.mean(-1), 60), 1) * 0.62
    lum = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)), np.float32) / 255
    detail = (g + 0.04) / (lum + 0.04)
    out = c * (0.35 + 0.95 * g[..., None]) * np.clip(detail, 0.6, 1.6)[..., None] ** 0.35
    return np.clip(out * 255, 0, 255)


def _metrics(w, res):
    from scipy.ndimage import uniform_filter
    gy, gx = np.gradient(w, res)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    m = uniform_filter(w, 3)
    rough = np.sqrt(np.maximum(uniform_filter(w * w, 3) - m * m, 0))
    return {"slope_mean_deg": round(float(slope.mean()), 3), "roughness_mean_m": round(float(rough.mean()), 3),
            "relief_m": round(float(w.max() - w.min()), 1)}


def slope_stats(h, res, inner_frac=0.5):
    """Métricas do ARA na janela central (a célula de 5 km): na resolução da cena e reamostradas
    a 100 m — esta última é a do método do ARA, comparável ao catálogo."""
    n = h.shape[0]
    a, b = int(round(n * (1 - inner_frac) / 2)), int(round(n * (1 + inner_frac) / 2))
    w = h[a:b, a:b].astype(np.float64)
    out = {"window_m": round(res * (b - a)), "native": _metrics(w, res) | {"res_m": round(res, 2)}}
    k = max(1, int(round(100 / res)))
    m = (w.shape[0] // k) * k
    w100 = w[:m, :m].reshape(m // k, k, m // k, k).mean(axis=(1, 3))
    out["at_100m"] = _metrics(w100, res * k) | {"res_m": round(res * k, 1)}
    return out


# ---------------------------------------------------------------------------- cenas
def mars_scene(sc):
    lat0, lon0, size = sc["lat"], sc["lon"], sc["size_m"]
    big = sc.get("overview")
    n_h, n_c = sc.get("n_h", 512), sc.get("n_c", 2048)
    lon, lat, _, geo = local_grid(lat0, lon0, size, n_h, R_MARS)
    dtm = SRC["crater_dtm"] if big else SRC["ctx_dtm"]
    h, ok, native = sample_raster(dtm, geo, lon, lat, max_px=900 if big else None)
    lonc, latc, _, _ = local_grid(lat0, lon0, size, n_c, R_MARS)
    gray, _, native_c = sample_raster(SRC["crater_ortho"] if big else SRC["ctx_ortho"], geo, lonc, latc, max_px=2600 if big else None)
    color = viking_color(lonc, latc)
    rgb = colorize_mars(gray, color)
    srcs = [CITE["crater" if big else "ctx"], CITE["viking"], CITE["mmgis"]]
    return h, ok, native, rgb, native_c, srcs


def moon_scene(sc):
    lon, lat, _, geo = local_grid(sc["lat"], sc["lon"], sc["size_m"], sc.get("n_h", 512), R_MOON)
    h, ok, native = sample_raster(SRC["lola"], geo, lon, lat, max_px=1000)
    return h, ok, native, None, None, [CITE["lola"]]


def earth_scene(sc):
    size = sc["size_m"]
    lon, lat, _, _ = local_grid(sc["lat"], sc["lon"], size, sc.get("n_h", 512))
    zt = 14 if size <= 12000 else 12
    h = sample_xyz(TERRARIUM, "terrarium", lon, lat, zt, terrarium_decode, 1)[..., 0]
    lonc, latc, _, _ = local_grid(sc["lat"], sc["lon"], size, sc.get("n_c", 2048))
    zi = 15 if size <= 12000 else 13  # ~4 m/px: basta para a imagem final de 2048 px em 10 km
    rgb = sample_xyz(ESRI, "esri", lonc, latc, zi, lambda im: np.asarray(im.convert("RGB"), np.float32), 3)
    native = 40075016 * math.cos(math.radians(sc["lat"])) / (256 * 2 ** zt)
    native_c = 40075016 * math.cos(math.radians(sc["lat"])) / (256 * 2 ** zi)
    return h, np.ones_like(h, bool), native, rgb, native_c, [CITE["terrarium"], CITE["esri"]]


# ---------------------------------------------------------------------------- Perseverance
def perseverance(sc):
    tr = CACHE / "M20_traverse.json"
    wp = CACHE / "M20_waypoints.json"
    for f, u in ((tr, "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json"),
                 (wp, "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json")):
        if not f.exists():
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(requests.get(u, headers=UA, timeout=120).content)
    pts = []
    for feat in json.loads(tr.read_text())["features"]:
        for lon, lat, *_ in feat["geometry"]["coordinates"]:
            if not pts or (abs(pts[-1][0] - lat) + abs(pts[-1][1] - lon)) > 2e-6:
                pts.append((lat, lon))
    uv = to_uv(sc["lat"], sc["lon"], sc["size_m"], [p[0] for p in pts], [p[1] for p in pts], R_MARS)
    # só os trechos dentro da cena, simplificados (passo mínimo ~ 1/1500 da cena)
    runs, cur, last = [], [], None
    for u, v in uv:
        inside = -0.01 <= u <= 1.01 and -0.01 <= v <= 1.01
        if not inside:
            if len(cur) > 1:
                runs.append(cur)
            cur, last = [], None
            continue
        if last is None or abs(u - last[0]) + abs(v - last[1]) > 1 / 1500:
            cur.append([round(u, 5), round(v, 5)]); last = (u, v)
    if len(cur) > 1:
        runs.append(cur)
    stops = []
    for f in json.loads(wp.read_text())["features"]:
        p = f["properties"]
        stops.append((p["lat"], p["lon"], p["sol"], p.get("dist_total_m", 0), p.get("tilt")))
    uvs = to_uv(sc["lat"], sc["lon"], sc["size_m"], [s[0] for s in stops], [s[1] for s in stops], R_MARS)
    sols = [{"u": round(u, 5), "v": round(v, 5), "sol": s[2], "km": round((s[3] or 0) / 1000, 2), "tilt": round(s[4] or 0, 1)}
            for (u, v), s in zip(uvs, stops) if -0.05 <= u <= 1.05 and -0.05 <= v <= 1.05]
    return {"name": "Trajeto do Perseverance (sol 14 → 2022)", "source": "NASA/JPL MMGIS", "runs": runs, "stops": sols}


# Pontos de interesse com coordenadas publicadas (NASA/JPL, USGS, NASA Artemis)
POI = {
    "mars": [
        ("Octavia E. Butler — pouso do Perseverance", 18.44463, 77.45089, "landing"),
        ("Delta oeste de Jezero (região)", 18.50, 77.40, "feature"),
    ],
    "moon": [
        ("Polo Sul", -90.0, 0.0, "feature"),
        ("Cratera Shackleton", -89.67, 129.78, "feature"),
        ("Cratera de Gerlache", -88.5, -87.1, "feature"),
    ],
}


def scenes():
    cat = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
    grid = json.loads((DATA / "earth_grid.json").read_text(encoding="utf-8"))
    out = []
    for s in cat["sites"]:
        out.append({"id": s["id"], "body": s["body"], "name": s["name"], "group": s.get("group", ""),
                    "lat": s["center"]["lat"], "lon": s["center"]["lon"], "size_m": 10000, "cell_m": 5000, "kind": "site"})
    # Terra: as células do Protótipo 1 + as TOP_EARTH melhores de cada sítio no ranking do ARA (pesos padrão)
    cols = grid["columns"]
    cells = [dict(zip(cols, row)) for row in grid["rows"]]
    cfg = json.loads((DATA / "config.json").read_text(encoding="utf-8"))
    ps = json.loads((DATA / "planet_sites.json").read_text(encoding="utf-8"))
    attrs, w = list(cfg["attributes"]), cfg["objectives"]["default"]["weights"]
    scale = {a: cfg["attributes"][a]["scale"] for a in attrs}
    wanted = {c["id"] for c in cells if c["id"].startswith("p1_")}
    for site in ps.values():
        t = site.get("terrain")
        if t:
            dist = lambda c: math.sqrt(sum(w[a] * ((t[a] - c[a]) / scale[a]) ** 2 for a in attrs))  # noqa: E731
            wanted |= {c["id"] for c in sorted(cells, key=dist)[:TOP_EARTH]}
    regions = {r["id"]: r["name"].split(",")[0].split(" (")[0] for r in grid["regions"]}
    for r in cells:
        if r["id"] not in wanted:
            continue
        name = grid.get("known_analogs", {}).get(r["id"]) or f"{regions.get(r['region'], r['region'])} · célula {r['id'].rsplit('_', 1)[-1]}"
        out.append({"id": r["id"], "body": "earth", "name": name, "group": "Análogo terrestre",
                    "lat": r["lat"], "lon": r["lon"], "size_m": 10000, "cell_m": 5000, "kind": "analog"})
    out.append({"id": "jezero_crater", "body": "mars", "name": "Cratera Jezero (visão geral)", "group": "Cratera Jezero",
                "lat": 18.40, "lon": 77.58, "size_m": 60000, "overview": True, "n_h": 640, "n_c": 3072, "kind": "overview"})
    out.append({"id": "lunar_south_pole", "body": "moon", "name": "Polo sul da Lua (regiões Artemis III)", "group": "Regiões candidatas Artemis III",
                "lat": -87.6, "lon": 12.0, "size_m": 180000, "n_h": 720, "kind": "overview"})
    return out


def build(sc):
    t0 = time.time()
    body = sc["body"]
    fn = {"mars": mars_scene, "moon": moon_scene, "earth": earth_scene}[body]
    h, ok, native, rgb, native_c, srcs = fn(sc)
    if not ok.all():
        print(f"   aviso: {100 * (1 - ok.mean()):.1f}% sem dado (preenchido)")
    n = h.shape[0]
    res = sc["size_m"] / n
    lo, hi = save_height(OUT / f"{sc['id']}_h.png", h)
    meta = {k: sc[k] for k in ("id", "body", "name", "group", "lat", "lon", "size_m", "kind")}
    meta["cell_m"] = sc.get("cell_m")
    meta["height"] = {"file": f"{sc['id']}_h.png", "n": n, "min": round(lo, 2), "max": round(hi, 2),
                      "res_m": round(res, 2), "native_res_m": round(native, 1), "valid_pct": round(100 * float(ok.mean()), 1)}
    if rgb is not None:
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(OUT / f"{sc['id']}_c.jpg", quality=80, optimize=True, progressive=True)
        meta["color"] = {"file": f"{sc['id']}_c.jpg", "n": rgb.shape[0], "native_res_m": round(native_c, 1)}
    meta["stats_inner"] = slope_stats(h, res, (sc.get("cell_m") or sc["size_m"] / 2) / sc["size_m"])
    radius = R_MARS if body == "mars" else R_MOON if body == "moon" else None
    pois = []
    for name, la, lo_, kind in POI.get(body, []):
        (u, v), = to_uv(sc["lat"], sc["lon"], sc["size_m"], [la], [lo_], radius)
        if 0.02 <= u <= 0.98 and 0.02 <= v <= 0.98:
            pois.append({"name": name, "u": round(u, 4), "v": round(v, 4), "kind": kind})
    if sc.get("kind") == "overview":
        cat = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
        for s in cat["sites"]:
            if s["body"] != body:
                continue
            (u, v), = to_uv(sc["lat"], sc["lon"], sc["size_m"], [s["center"]["lat"]], [s["center"]["lon"]], radius)
            if 0 <= u <= 1 and 0 <= v <= 1:
                pois.append({"name": s["name"], "u": round(u, 4), "v": round(v, 4), "kind": "site", "site": s["id"],
                             "half": round(2500 / sc["size_m"], 4)})
    meta["pois"] = pois
    if body == "mars":
        p = perseverance(sc)
        if p["runs"]:
            meta["paths"] = [p]
    meta["sources"] = srcs
    meta["built_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (OUT / f"{sc['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"   ok {sc['id']}: {n}px, {lo:.0f}..{hi:.0f} m, nativo {native:.1f} m, {time.time() - t0:.0f}s")
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    idx_path = OUT / "index.json"
    old = {m["id"]: m for m in json.loads(idx_path.read_text(encoding="utf-8"))["scenes"]} if idx_path.exists() else {}
    for sc in scenes():
        if a.only and sc["id"] not in a.only:
            if sc["id"] in old:
                index.append(old[sc["id"]])
            continue
        print(f"-> {sc['id']} ({sc['body']}, {sc['size_m'] / 1000:.0f} km)")
        try:
            m = build(sc)
            index.append({k: m[k] for k in ("id", "body", "name", "group", "kind", "lat", "lon", "size_m", "cell_m")} | {"stats_inner": m["stats_inner"]})
        except Exception as e:  # noqa: BLE001
            print(f"   ERRO {sc['id']}: {e}")
            if sc["id"] in old:
                index.append(old[sc["id"]])
    idx_path.write_text(json.dumps({"version": 1, "scenes": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(index)} cenas em {OUT}")


if __name__ == "__main__":
    sys.exit(main())
