"""Evidências além do relevo para cada célula da Terra (catálogo de 522 células).

Gera data/evidence/earth_cells.json + data/evidence/manifest.json. Cada valor guarda a origem:
observed (observado por sensor), model_estimate (estimativa de modelo), contextual (mapa/reanálise
regional) — e nunca entra no ranking topográfico, que continua igual.

Fontes (todas públicas, sem login):
  ESA WorldCover 2021 v200, 10 m ............ cobertura do solo (observed, classificação de imagem)
  ISRIC SoilGrids 2.0, 250 m (WCS) ........... areia/silte/argila/fragmentos/densidade 0–5 cm,
                                               média e quantis 5% / 95% (model_estimate)
  Macrostrat API v2 .......................... unidade geológica mapeada (contextual)
  NASA POWER climatologia (MERRA-2/CERES) .... temperatura, chuva, radiação, umidade, vento por mês
                                               (contextual, ~0,5° — regional, não da célula)
  JRC Global Surface Water 1984–2021, 30 m ... ocorrência histórica de água (observed, Landsat)

Uso:  python pipeline/build_evidence.py            (usa cache em pipeline/cache/evidence)
"""
from __future__ import annotations

import json
import math
import os
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "evidence"
CACHE = ROOT / "pipeline" / "cache" / "evidence"
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("VSI_CACHE", "TRUE")
UA = {"User-Agent": "ARA-evidence/1.0 (NASA Space Apps 2026 project)"}
HALF_KM = 2.5

WORLDCOVER = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
WC_CLASSES = {10: "Árvores", 20: "Arbustos", 30: "Campo/gramíneas", 40: "Agricultura", 50: "Área construída",
              60: "Solo exposto / vegetação rala", 70: "Neve e gelo", 80: "Água", 90: "Áreas úmidas", 95: "Mangue", 100: "Musgos e líquens"}
SOILGRIDS = ("https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
             "&COVERAGEID={prop}_0-5cm_{stat}&FORMAT=image/tiff&SUBSET=long({w},{e})&SUBSET=lat({s},{n})"
             "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326")
# propriedade: (fator para a unidade de exibição, unidade, nome)
SOIL_PROPS = {"sand": (0.1, "%", "Areia"), "silt": (0.1, "%", "Silte"), "clay": (0.1, "%", "Argila"),
              "cfvo": (0.1, "% vol", "Fragmentos grossos"), "bdod": (0.01, "g/cm³", "Densidade aparente")}
SOIL_STATS = {"mean": "mean", "Q0.05": "q05", "Q0.95": "q95"}
MACRO = "https://macrostrat.org/api/v2/geologic_units/map?lat={lat}&lng={lon}"
MACRO_SRC = "https://macrostrat.org/api/v2/defs/sources?source_id={ids}"
POWER = ("https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,"
         "ALLSKY_SFC_SW_DWN,RH2M,WS2M&community=AG&longitude={lon}&latitude={lat}&format=JSON")
JRC = "/vsicurl/https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_{tile}v1_4_2021.tif"


def get_json(url, key):
    p = CACHE / "json" / (key + ".json")
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    p.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(5):
        try:
            r = requests.get(url, headers=UA, timeout=90)
            r.raise_for_status()
            d = r.json()
            p.write_text(json.dumps(d), encoding="utf-8")
            return d
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                print("   ! falhou", key, e)
                return None
            time.sleep(3 * (attempt + 1))


def bbox(cell, half_km=HALF_KM):
    dlat = half_km / 111.32
    dlon = dlat / max(math.cos(math.radians(cell["lat"])), 1e-6)
    return cell["lon"] - dlon, cell["lat"] - dlat, cell["lon"] + dlon, cell["lat"] + dlat


# ---------------------------------------------------------------------------- WorldCover
def wc_tile(lat, lon):
    la, lo = math.floor(lat / 3) * 3, math.floor(lon / 3) * 3
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def worldcover(cell):
    w, s, e, n = bbox(cell)
    counts = defaultdict(int)
    tiles = {wc_tile(la, lo) for la in (s, n) for lo in (w, e)}
    for t in tiles:
        try:
            with rasterio.open(WORLDCOVER.format(tile=t)) as d:
                win = from_bounds(max(w, d.bounds.left), max(s, d.bounds.bottom), min(e, d.bounds.right), min(n, d.bounds.top), d.transform)
                a = d.read(1, window=win.round_offsets().round_lengths())
                v, c = np.unique(a, return_counts=True)
                for vi, ci in zip(v.tolist(), c.tolist()):
                    counts[vi] += ci
        except Exception as ex:  # noqa: BLE001
            print("   ! WorldCover", t, ex)
    tot = sum(c for v, c in counts.items() if v != 0)
    if not tot:
        return None
    frac = {WC_CLASSES.get(v, str(v)): round(100 * c / tot, 2) for v, c in sorted(counts.items(), key=lambda x: -x[1]) if v != 0}
    pct = lambda vals: round(100 * sum(counts.get(v, 0) for v in vals) / tot, 1)  # noqa: E731
    return {"fractions_pct": frac, "bare_pct": pct([60]), "vegetation_pct": pct([10, 20, 30, 40, 90, 95, 100]),
            "built_pct": pct([50]), "water_pct": pct([80]), "snow_ice_pct": pct([70]), "pixels": tot}


# ---------------------------------------------------------------------------- SoilGrids
def soil_rasters(region, cells):
    """Um recorte por região e propriedade (evita milhares de requisições)."""
    ws = [bbox(c) for c in cells]
    w, s, e, n = min(b[0] for b in ws) - 0.02, min(b[1] for b in ws) - 0.02, max(b[2] for b in ws) + 0.02, max(b[3] for b in ws) + 0.02
    out = {}
    for prop in SOIL_PROPS:
        for stat, short in SOIL_STATS.items():
            p = CACHE / "soilgrids" / f"{region}_{prop}_{short}.tif"
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                url = SOILGRIDS.format(prop=prop, stat=stat, w=round(w, 4), e=round(e, 4), s=round(s, 4), n=round(n, 4))
                for attempt in range(4):
                    try:
                        r = requests.get(url, headers=UA, timeout=180)
                        r.raise_for_status()
                        if not r.content.startswith(b"II") and not r.content.startswith(b"MM"):
                            raise RuntimeError(r.text[:200])
                        p.write_bytes(r.content)
                        break
                    except Exception as ex:  # noqa: BLE001
                        if attempt == 3:
                            print("   ! SoilGrids", region, prop, stat, ex)
                        time.sleep(4 * (attempt + 1))
            if p.exists():
                out[(prop, short)] = p
    return out


def soil_cell(cell, rasters):
    w, s, e, n = bbox(cell)
    res = {}
    valid = None
    for prop, (k, unit, name) in SOIL_PROPS.items():
        vals = {}
        for short in SOIL_STATS.values():
            p = rasters.get((prop, short))
            if not p:
                continue
            with rasterio.open(p) as d:
                a = d.read(1, window=from_bounds(w, s, e, n, d.transform).round_offsets().round_lengths()).astype(float)
                nod = d.nodata
            ok = np.isfinite(a) & (a > 0) & ((a != nod) if nod is not None else True)
            if ok.sum() == 0:
                continue
            vals[short] = round(float(np.mean(a[ok])) * k, 2)
            if short == "mean":
                valid = round(100 * float(ok.mean()), 1)
        if vals:
            res[prop] = {"name": name, "unit": unit, **vals}
    if not res:
        return None
    return {"depth": "0–5 cm", "properties": res, "valid_pct": valid,
            "note": "Previsões de modelo (aprendizado de máquina), não amostras de campo; q05/q95 = faixa de incerteza do modelo."}


# ---------------------------------------------------------------------------- Macrostrat
def geology(cell):
    d = get_json(MACRO.format(lat=round(cell["lat"], 5), lon=round(cell["lon"], 5)), f"macro_{cell['id']}")
    units = (d or {}).get("success", {}).get("data", [])
    if not units:
        return None
    order = {"large": 0, "medium": 1, "small": 2, "tiny": 3}
    units.sort(key=lambda u: order.get(u.get("scale"), 9))
    u = units[0]
    return {"name": u.get("name"), "strat_name": u.get("strat_name") or None, "lith": u.get("lith") or None,
            "descrip": (u.get("descrip") or "")[:400] or None, "age": {"top": u.get("t_int_name"), "bottom": u.get("b_int_name"),
            "best": u.get("best_int_name"), "t_ma": u.get("t_age"), "b_ma": u.get("b_age")},
            "scale": u.get("scale"), "source_id": u.get("source_id"), "map_id": u.get("map_id"), "n_units_at_point": len(units)}


# ---------------------------------------------------------------------------- NASA POWER
def power_key(lat, lon):
    # a grade do POWER é ~0,5° × 0,625°: células próximas compartilham o mesmo pixel
    return f"{round(lat * 2) / 2:.1f}_{round(lon / 0.625) * 0.625:.3f}"


def climate(lat, lon):
    k = power_key(lat, lon)
    la, lo = k.split("_")
    d = get_json(POWER.format(lat=la, lon=lo), f"power_{k}")
    p = (d or {}).get("properties", {}).get("parameter")
    if not p:
        return k, None
    months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    out = {}
    for name, series in p.items():
        out[name] = {"annual": series.get("ANN"), "monthly": [series.get(m) for m in months]}
    hdr = d.get("header", {})
    import re
    mm = re.search(r"\(([^)]+)\)", hdr.get("range", ""))
    return k, {"pixel": [float(la), float(lo)], "params": out, "period": (mm.group(1).replace(" - ", "–") if mm else hdr.get("range", "")),
               "units": {k2: v.get("units") for k2, v in d.get("parameters", {}).items()}}


# ---------------------------------------------------------------------------- JRC água
def jrc_tile(lat, lon):
    lo = math.floor(lon / 10) * 10
    la = math.ceil(lat / 10) * 10
    return f"{abs(lo)}{'E' if lo >= 0 else 'W'}_{abs(la)}{'N' if la >= 0 else 'S'}"


def water(cell):
    w, s, e, n = bbox(cell)
    try:
        with rasterio.open(JRC.format(tile=jrc_tile(cell["lat"], cell["lon"]))) as d:
            a = d.read(1, window=from_bounds(w, s, e, n, d.transform).round_offsets().round_lengths())
    except Exception as ex:  # noqa: BLE001
        print("   ! JRC", cell["id"], ex)
        return None
    valid = a <= 100  # 255 = sem dado
    if not valid.any():
        return None
    v = a[valid]
    return {"any_water_pct": round(100 * float((v > 0).mean()), 2), "occurrence_max_pct": int(v.max()),
            "frequent_water_pct": round(100 * float((v >= 50).mean()), 2), "valid_pct": round(100 * float(valid.mean()), 1)}


def main():
    grid = json.loads((DATA / "earth_grid.json").read_text(encoding="utf-8"))
    cols = grid["columns"]
    cells = [dict(zip(cols, r)) for r in grid["rows"]]
    OUT.mkdir(parents=True, exist_ok=True)
    by_region = defaultdict(list)
    for c in cells:
        by_region[c["region"]].append(c)

    out_cells, climates, src_ids = {}, {}, set()
    t0 = time.time()
    for region, rc in by_region.items():
        print(f"-> {region}: {len(rc)} células")
        span = max(max(c["lat"] for c in rc) - min(c["lat"] for c in rc), max(c["lon"] for c in rc) - min(c["lon"] for c in rc))
        # região compacta: um recorte de solo por propriedade; células espalhadas (Protótipo 1): um recorte por célula
        shared = soil_rasters(region, rc) if span <= 3 else None
        for i, c in enumerate(rc):
            rasters = shared if shared is not None else soil_rasters(c["id"], [c])
            rec = {}
            wc = worldcover(c)
            if wc:
                rec["landcover"] = wc
            so = soil_cell(c, rasters)
            if so:
                rec["soil"] = so
            g = geology(c)
            if g:
                rec["geology"] = g
                if g.get("source_id"):
                    src_ids.add(g["source_id"])
            k, cl = climate(c["lat"], c["lon"])
            if cl:
                climates[k] = cl
                rec["climate_key"] = k
            wa = water(c)
            if wa:
                rec["water"] = wa
            out_cells[c["id"]] = rec
            if i % 25 == 0:
                print(f"   {i + 1}/{len(rc)}  ({time.time() - t0:.0f}s)")

    sources = {}
    ids = sorted(src_ids)
    for i in range(0, len(ids), 40):
        d = get_json(MACRO_SRC.format(ids=",".join(map(str, ids[i:i + 40]))), f"macro_src_{i}")
        for s in (d or {}).get("success", {}).get("data", []):
            sources[s["source_id"]] = {"name": s.get("name"), "ref_title": s.get("ref_title"), "authors": s.get("authors"),
                                       "year": s.get("ref_year"), "url": s.get("url"), "scale": s.get("scale")}

    (OUT / "earth_cells.json").write_text(json.dumps({"version": 1, "cells": out_cells, "climate": climates,
                                                       "geology_sources": sources}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manifest = {
        "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "window": "célula de 5 × 5 km centrada no ponto da grade do ARA",
        "datasets": [
            {"id": "worldcover", "name": "ESA WorldCover 10 m 2021 v200", "origin": "observed", "resolution_m": 10, "period": "2021",
             "url": "https://esa-worldcover.org/en/data-access", "license": "CC BY 4.0", "doi": "10.5281/zenodo.7254221",
             "caveats": ["Classificação de imagens Sentinel-1/2; não mede mineral nem propriedade mecânica do solo."]},
            {"id": "soilgrids", "name": "ISRIC SoilGrids 2.0 (0–5 cm)", "origin": "model_estimate", "resolution_m": 250,
             "url": "https://isric.org/explore/soilgrids/", "license": "CC BY 4.0", "doi": "10.5194/soil-7-217-2021",
             "caveats": ["Predição de modelo, não amostra de campo.", "Desertos extremos e afloramentos rochosos têm poucas amostras de treino.",
                         "Não converter em tração, afundamento ou capacidade de suporte sem ensaio."]},
            {"id": "macrostrat", "name": "Macrostrat geologic map units (API v2)", "origin": "contextual",
             "url": "https://macrostrat.org", "license": "CC BY 4.0",
             "caveats": ["Litologia mapeada em escala regional; não é identificação mineral.", "Unidade no centro da célula; a célula pode cruzar várias unidades."]},
            {"id": "power", "name": "NASA POWER climatologia (MERRA-2 / CERES)", "origin": "contextual", "resolution_m": 55000,
             "url": "https://power.larc.nasa.gov/", "license": "NASA (uso livre, citar)",
             "caveats": ["Média de longo prazo num pixel de ~0,5°; contexto regional, não medição atual nem da célula."]},
            {"id": "jrc_gsw", "name": "JRC Global Surface Water v1.4 — ocorrência", "origin": "observed", "resolution_m": 30, "period": "1984–2021",
             "url": "https://global-surface-water.appspot.com/", "license": "CC BY 4.0", "doi": "10.1038/nature20584",
             "caveats": ["Água detectada pelo Landsat entre 1984 e 2021; não cobre depois de 2021 nem umidade do solo."]},
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out_cells)} células, {len(climates)} pixels de clima, {len(sources)} fontes geológicas — {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
