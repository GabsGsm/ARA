"""Gera o catálogo fixo de Lua e Marte e os atributos de cada local.

Entradas:
    data/source/prototipo1_app_data.json   (Jezero 01-04, do Protótipo 1)
    pipeline/moon_sites.json               (regiões do Artemis III)
    data/moon_sites_attrs.json             (opcional, gerado por build_moon_sites.py)
Saídas:
    data/catalog.json
    data/planet_sites.json
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import terrain

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "data"
MARS_R_KM = 3389.5
MOON_R_KM = 1737.4

CTX_SOURCE = {"name": "NASA/USGS Mars 2020 TRN CTX DTM mosaic (Jezero, 20 m)",
              "url": "https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic"}
CRISM_SOURCE = {"name": "Valantinas et al. (2026), Jezero Western Rim Mineral Maps v1.0 (CRISM), CC BY 4.0",
                "url": "https://doi.org/10.5281/zenodo.22257754"}
LOLA_SOURCE = {"name": "LRO LOLA polar DEM (NASA Goddard PGDA)", "url": "https://pgda.gsfc.nasa.gov/products/90"}
ARTEMIS_SOURCE = {"name": "NASA: Artemis III candidate landing regions (Oct 2024)", "url": "https://www.nasa.gov/?p=748006"}


def bbox_from_center(lat, lon, radius_km, half_km=terrain.CELL_KM / 2):
    dlat = math.degrees(half_km / radius_km)
    dlon = dlat / max(math.cos(math.radians(lat)), 1e-6)
    return [round(lon - dlon, 6), round(lat - dlat, 6), round(lon + dlon, 6), round(lat + dlat, 6)]


# Centros (linha, coluna) dos setores no DEM CTX original de 20 m (1512 x 1596 px), do notebook/mock
JEZERO_PX = {"Jezero_01": (380, 320), "Jezero_02": (720, 760), "Jezero_03": (1100, 1200), "Jezero_04": (1047, 334)}
JEZERO_IMG = {"src": "img/jezero_ctx_dem.png", "frame_px": [1512, 1596],
              "caption": "DEM CTX de Jezero (NASA/USGS), elevação em falsa cor"}


def mars_sites(p1):
    topo = {t["regiao"]: t for t in p1["topografia"]}
    geo = {g["regiao"]: g for g in p1["coordenadas_jezero"]}
    geo["Jezero_04"] = p1["coordenadas_jezero_04"]
    integ = {}
    for row in p1["analise_integrada"]:
        integ.setdefault(row["setor_marte"], row)
    cat, attrs = [], {}
    for key in sorted(k for k in topo if k.startswith("Jezero")):
        g, t, a = geo[key], topo[key], integ[key]
        sid = key.lower()
        lat, lon = g["latitude_centro"], g["longitude_centro"]
        bbox = ([g["longitude_min"], g["latitude_min"], g["longitude_max"], g["latitude_max"]]
                if "longitude_min" in g else bbox_from_center(lat, lon, MARS_R_KM))
        cat.append({"id": sid, "body": "mars", "name": key.replace("_", " "), "group": "Cratera Jezero",
                    "kind": "landing_site",
                    "why": "Área de pouso do Perseverance; a NASA usou Jezero como exemplo de Zona de Exploração para missões humanas",
                    "center": {"lat": lat, "lon": lon}, "bbox": bbox,
                    "cell_km": terrain.CELL_KM, "res_m": terrain.RES_M,
                    "image": JEZERO_IMG | {"box_px": [JEZERO_PX[key][1] - 125, JEZERO_PX[key][0] - 125, 250, 250]},
                    "sources": [CTX_SOURCE, CRISM_SOURCE]})
        attrs[sid] = {
            "terrain": {k: t[v] for k, v in terrain.PROTOTYPE1_KEYS.items()} | {"valid_pct": 100.0},
            "thermal": None,
            "mineralogy": {"source": "CRISM", "coverage_pct": a["cobertura_crism_pct"],
                           "classes": a["classes_crism"],
                           "note": "0% coverage means no overlap with the map, not absence of minerals"},
            "run_id": "prototype1-colab",
        }
    return cat, attrs


def moon_sites():
    cfg = json.loads((HERE / "moon_sites.json").read_text(encoding="utf-8"))
    computed_path = DATA / "moon_sites_attrs.json"
    computed = json.loads(computed_path.read_text(encoding="utf-8")) if computed_path.exists() else {}
    cat, attrs = [], {}
    for s in cfg["sites"]:
        if not s.get("mvp") and s["id"] not in computed:
            continue
        c = computed.get(s["id"], {})
        ready = bool(c.get("terrain"))
        lat, lon = s["lat"], s["lon"]
        cat.append({"id": s["id"], "body": "moon", "name": s["name"], "group": "Região candidata Artemis III",
                    "kind": "landing_region",
                    "why": "Região candidata da NASA ao pouso do Artemis III, perto do polo sul lunar",
                    "center": {"lat": lat, "lon": lon} if lat is not None else None,
                    "bbox": bbox_from_center(lat, lon, MOON_R_KM) if lat is not None else None,
                    "cell_km": terrain.CELL_KM, "res_m": terrain.RES_M,
                    "image": {"src": f"img/{s['id']}.png", "caption": "Relevo sombreado LOLA (NASA Goddard PGDA)"},
                    "status": "ready" if ready else "pending",
                    "sources": [ARTEMIS_SOURCE, LOLA_SOURCE]})
        attrs[s["id"]] = {"terrain": c.get("terrain"), "thermal": c.get("thermal"),
                          "mineralogy": None, "run_id": c.get("run_id")}
    return cat, attrs


def main():
    p1 = json.loads((DATA / "source" / "prototipo1_app_data.json").read_text(encoding="utf-8"))
    mcat, mattrs = mars_sites(p1)
    lcat, lattrs = moon_sites()
    (DATA / "catalog.json").write_text(json.dumps({"version": "1.0", "sites": lcat + mcat},
                                                  ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "planet_sites.json").write_text(json.dumps(mattrs | lattrs, ensure_ascii=False, indent=1),
                                            encoding="utf-8")
    ready = sum(1 for v in (mattrs | lattrs).values() if v["terrain"])
    print(f"catalog.json: {len(lcat)} Lua + {len(mcat)} Marte; {ready} com atributos")


if __name__ == "__main__":
    main()
