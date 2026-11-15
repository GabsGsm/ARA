"""Camadas de Marte para o Mineral Explorer: minerais (CRISM + CaSSIS) e inércia térmica (THEMIS 2026) de Jezero.

Saída em data/minerals/:
  jezero_crism_all.png, jezero_crism_<classe>.png   unidades minerais (RGBA, 18 m, transparente fora do mapa)
  jezero_themis_ti.png                               inércia térmica 1 km colorida (transparente sem dado)
  jezero_themis_ul.png                               % de pixels de 100 m que são só limite superior
  jezero.json                                        limites geográficos, classes, áreas, escala de cores,
                                                     histogramas por setor do ARA e proveniência

Fontes:
  Valantinas et al. (2026) Jezero Western Rim Mineral Maps v1.0, Zenodo 10.5281/zenodo.22257754, CC BY 4.0
  Huang (2026) THEMIS nighttime thermal inertia, 1 km browse, Zenodo 23527756, CC BY 4.0 (MC-13)
"""
from __future__ import annotations

import csv
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "minerals"
CACHE = ROOT / "pipeline" / "cache"
UA = {"User-Agent": "ARA-minerals/1.0 (NASA Space Apps 2026 project)"}
R_MARS = 3396190.0
CRISM_ZIP = "https://zenodo.org/api/records/22257754/files/jezero_rim_maps_v1_core.zip/content"
THEMIS = "https://zenodo.org/api/records/23527756/files/THEMIS_TI_2026_MC13_ti_1km.tif/content"
# área do mapa térmico (cratera Jezero e arredores)
TI_BOUNDS = (76.95, 18.05, 78.20, 18.80)  # lon_min, lat_min, lon_max, lat_max


def download(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(url, headers=UA, timeout=300)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def crism():
    root = CACHE / "crism"
    tif = root / "jezero_rim_maps_v1" / "01_geologic_map" / "geologic_map_CRISM_CaSSIS.tif"
    if not tif.exists():
        zipfile.ZipFile(download(CRISM_ZIP, root / "core.zip")).extractall(root)
    classes = []
    with open(tif.parent / "class_dictionary.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            classes.append({"value": int(r["value"]), "name": r["display_name"], "spectral": r["interp_field_value"],
                            "color": [int(r["red"]), int(r["green"]), int(r["blue"])]})
    with rasterio.open(tif) as d:
        a = d.read(1)
        b = d.bounds
        res_deg = d.res[0]
    lat_mid = (b.bottom + b.top) / 2
    px_m = res_deg * math.pi / 180 * R_MARS
    px_area_km2 = (px_m * px_m * math.cos(math.radians(lat_mid))) / 1e6
    rgba_all = np.zeros(a.shape + (4,), np.uint8)
    for c in classes:
        m = a == c["value"]
        c["area_km2"] = round(float(m.sum()) * px_area_km2, 2)
        c["file"] = f"jezero_crism_{c['value']}.png"
        one = np.zeros(a.shape + (4,), np.uint8)
        one[m, :3] = c["color"]; one[m, 3] = 255
        rgba_all[m, :3] = c["color"]; rgba_all[m, 3] = 255
        Image.fromarray(one).save(OUT / c["file"], optimize=True)
    Image.fromarray(rgba_all).save(OUT / "jezero_crism_all.png", optimize=True)
    mapped = float((a > 0).sum()) * px_area_km2
    return {
        "file": "jezero_crism_all.png", "bounds": [[b.bottom, b.left], [b.top, b.right]], "resolution_m": round(px_m),
        "mapped_area_km2": round(mapped, 1), "classes": classes,
        "source": {"name": "Jezero Western Rim Mineral Maps v1.0 (CRISM + CaSSIS/HiRISE)", "authors": "Valantinas et al. (2026)",
                   "doi": "10.5281/zenodo.22257754", "license": "CC BY 4.0", "instrument": "MRO CRISM (FRT00005850 e outros) + TGO CaSSIS + HiRISE",
                   "method": "Classes pelo absorvedor dominante em espectros CRISM com razão; unidades inferidas por CaSSIS onde não há CRISM",
                   "paper": "Partially altered olivine in the western rim of Jezero crater, Mars (GRL, em revisão)"},
        "caveats": ["'Fraco/forte' é a expressão da banda de 1 µm, não a abundância modal.",
                    "Fora do contorno colorido não há mapa — ausência de cor não é ausência de mineral.",
                    "Mapa da borda oeste; não cobre a cratera inteira."],
    }


def ramp(t):
    """Escala perceptual escura→clara (azul-petróleo → sálvia → creme → dourado)."""
    stops = np.array([[8, 29, 58], [27, 94, 120], [69, 160, 140], [190, 210, 140], [250, 220, 120], [242, 140, 40]], np.float32)
    x = np.clip(t, 0, 1) * (len(stops) - 1)
    i = np.clip(np.floor(x).astype(int), 0, len(stops) - 2)
    f = (x - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def themis(sectors):
    tif = download(THEMIS, CACHE / "themis" / "THEMIS_TI_2026_MC13_ti_1km.tif")
    lon0, lat0, lon1, lat1 = TI_BOUNDS
    with rasterio.open(tif) as d:
        xs = [R_MARS * math.radians(lon0), R_MARS * math.radians(lon1)]
        ys = [R_MARS * math.radians(lat0), R_MARS * math.radians(lat1)]
        win = from_bounds(xs[0], ys[0], xs[1], ys[1], d.transform).round_offsets().round_lengths()
        ti = d.read(1, window=win).astype(np.float64)
        ul = d.read(2, window=win).astype(np.float64)
        tr = d.window_transform(win)
        scale = d.scales[0] if d.scales and d.scales[0] not in (0, None) else 0.1
    nod = 65535
    valid = ti != nod
    tiv = np.where(valid, ti * 0.1, np.nan)  # fator 0,1 do README
    ulv = np.where(ul != nod, ul, np.nan)
    lo, hi = np.nanpercentile(tiv, 2), np.nanpercentile(tiv, 98)
    rgb = ramp((tiv - lo) / (hi - lo))
    rgba = np.zeros(ti.shape + (4,), np.uint8)
    rgba[..., :3] = np.nan_to_num(rgb).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 235, 0)
    Image.fromarray(rgba).resize((ti.shape[1] * 8, ti.shape[0] * 8), Image.NEAREST).save(OUT / "jezero_themis_ti.png", optimize=True)
    ulrgba = np.zeros(ti.shape + (4,), np.uint8)
    ulrgba[..., 0] = 239; ulrgba[..., 1] = 143; ulrgba[..., 2] = 128
    ulrgba[..., 3] = np.where(np.isfinite(ulv), np.clip(ulv / 100 * 255, 0, 255), 0).astype(np.uint8)
    Image.fromarray(ulrgba).resize((ti.shape[1] * 8, ti.shape[0] * 8), Image.NEAREST).save(OUT / "jezero_themis_ul.png", optimize=True)
    # limites reais da janela lida (alinhada à grade de 1 km)
    left, top = tr * (0, 0)
    right, bottom = tr * (ti.shape[1], ti.shape[0])
    deg = lambda v: math.degrees(v / R_MARS)  # noqa: E731
    bounds = [[deg(bottom), deg(left)], [deg(top), deg(right)]]
    # histograma global e por setor (5 km)
    edges = np.linspace(math.floor(lo / 25) * 25, math.ceil(hi / 25) * 25, 17)
    hist = np.histogram(tiv[np.isfinite(tiv)], bins=edges)[0].tolist()
    lats = np.array([deg(top - (r + 0.5) * 1000) for r in range(ti.shape[0])])
    lons = np.array([deg(left + (c + 0.5) * 1000) for c in range(ti.shape[1])])
    LON, LAT = np.meshgrid(lons, lats)
    per = {}
    for s in sectors:
        dlat = 2.5 / (math.pi * R_MARS / 180 / 1000)
        dlon = dlat / math.cos(math.radians(s["lat"]))
        m = (np.abs(LAT - s["lat"]) <= dlat) & (np.abs(LON - s["lon"]) <= dlon)
        v = tiv[m]
        v = v[np.isfinite(v)]
        per[s["id"]] = {"n_cells": int(m.sum()), "n_valid": int(v.size), "median": round(float(np.median(v)), 1) if v.size else None,
                        "p10": round(float(np.percentile(v, 10)), 1) if v.size else None, "p90": round(float(np.percentile(v, 90)), 1) if v.size else None,
                        "upper_limit_pct_mean": round(float(np.nanmean(ulv[m])), 1) if m.any() else None,
                        "hist": np.histogram(v, bins=edges)[0].tolist() if v.size else []}
    return {
        "file": "jezero_themis_ti.png", "upper_limit_file": "jezero_themis_ul.png", "bounds": bounds, "resolution_m": 1000,
        "unit": "J m⁻² K⁻¹ s⁻½", "scale_factor": 0.1, "range": [round(lo, 1), round(hi, 1)], "hist_edges": [round(e, 1) for e in edges.tolist()], "hist": hist,
        "valid_pct": round(100 * float(valid.mean()), 1), "sectors": per,
        # grade de valores (para consultar ao clicar): linhas de norte para sul, null = sem dado
        "grid": {"rows": ti.shape[0], "cols": ti.shape[1],
                 "ti": [[None if not np.isfinite(v) else round(float(v), 1) for v in row] for row in tiv],
                 "ul": [[None if not np.isfinite(v) else int(v) for v in row] for row in ulv]},
        "colors": [[8, 29, 58], [27, 94, 120], [69, 160, 140], [190, 210, 140], [250, 220, 120], [242, 140, 40]],
        "source": {"name": "A new global thermal inertia map of Mars from THEMIS nighttime images — 1 km browse (MC-13)", "authors": "Huang (2026)",
                   "doi": "10.5281/zenodo.23527756", "full_product": "10.57760/sciencedb.016s5", "license": "CC BY 4.0", "instrument": "Mars Odyssey THEMIS (noturno)",
                   "method": "Mediana de ln(TI) nas células de 100 m válidas e sem limite superior; banda 2 = % de limites superiores"},
        "caveats": ["Trabalho descrito como submetido, ainda sem revisão por pares.", "Nível absoluto incerto em ~12–24%.",
                    "Inércia térmica não é temperatura nem medida direta de granulometria, mineral ou coesão.",
                    "Para escalas abaixo de alguns km, usar o produto de 100 m."],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cat = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))
    sectors = [{"id": s["id"], "name": s["name"], "lat": s["center"]["lat"], "lon": s["center"]["lon"], "bbox": s["bbox"]}
               for s in cat["sites"] if s["body"] == "mars"]
    out = {"version": 1, "sectors": sectors, "crism": crism(), "themis": themis(sectors)}
    (OUT / "jezero.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("CRISM:", out["crism"]["mapped_area_km2"], "km² mapeados;", [(c["name"], c["area_km2"]) for c in out["crism"]["classes"]])
    print("THEMIS:", out["themis"]["range"], {k: v["median"] for k, v in out["themis"]["sectors"].items()})


if __name__ == "__main__":
    main()
