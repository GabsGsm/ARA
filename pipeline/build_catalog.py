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
JEZERO_IMG = {"src": "data/img/jezero_ctx_dem.png", "frame_px": [1512, 1596],
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


THERMAL_NOTE_MOON = "Temperatura modelada (Diviner PRP), média espacial do recorte; não entra no ranking"
THERMAL_NOTE_MARS = "THEMIS: uma única observação ao entardecer; cobertura parcial do recorte"


def moon_thermal_display(t):
    if not t:
        return None
    return [{"label": "Temperatura média anual", "value": t.get("temp_mean_annual_k"), "unit": "K"},
            {"label": "Máxima diária (média anual)", "value": t.get("temp_max_annual_mean_k"), "unit": "K"},
            {"label": "Mínima entre as médias anuais", "value": t.get("temp_mean_annual_lowest_k"), "unit": "K"}]


def mars_thermal(delivery_site):
    t = (delivery_site or {}).get("thermal")
    if not t:
        return None
    bt = t.get("brightness_temperature") or {}
    t = dict(t)
    t["display"] = [
        {"label": "Inércia térmica (THEMIS, 1 km)", "value": t.get("thermal_inertia_mean"), "unit": "J m⁻² K⁻¹ s⁻½"},
        {"label": "Temperatura de brilho (THEMIS, 1 observação)", "value": bt.get("temperature_mean_k"), "unit": "K",
         "note": (f"{bt.get('coverage_pct'):.2f}".rstrip("0").rstrip(".").replace(".", ",")
                  + "% do recorte coberto · 06/05/2016, ~19h23 hora local em Marte; não é média anual")
         if bt.get("coverage_pct") is not None else None},
    ]
    t["note"] = THERMAL_NOTE_MARS
    return t


def moon_sites_from_delivery(folder: Path):
    cat_in = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    sites_in = json.loads((folder / "planet_sites.json").read_text(encoding="utf-8"))
    rec_path = folder / "terrain_recomputed.json"
    recomputed = json.loads(rec_path.read_text(encoding="utf-8"))["sites"] if rec_path.exists() else {}
    integ_path = folder / "ara_lua_integracao_final.json"
    pending = json.loads(integ_path.read_text(encoding="utf-8")).get("site_centers_pending_final_validation", False) \
        if integ_path.exists() else False
    names = {"mons_mouton_01": "Mons Mouton", "malapert_massif_01": "Malapert Massif",
             "haworth_01": "Haworth", "nobile_rim_01": "Nobile Rim 1"}
    cat, attrs = [], {}
    for s in cat_in["sites"]:
        sid = s["id"]
        src = list(s.get("sources", []))
        if not any("Diviner" in x["name"] for x in src):
            src.append({"name": "NASA LRO Diviner PRP",
                        "url": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab"})
        src += [ARTEMIS_SOURCE, {"name": "Chandrayaan-1 Moon Mineralogy Mapper (M3), indicadores exploratórios",
                                 "url": "https://pds-imaging.jpl.nasa.gov/volumes/m3.html"}]
        cat.append({"id": sid, "body": "moon", "name": names.get(sid, s["name"]),
                    "group": "Região candidata Artemis III", "kind": "landing_region",
                    "why": "Região candidata da NASA ao pouso do Artemis III, perto do polo sul lunar",
                    "center": s["center"], "bbox": s["bbox"], "cell_km": s.get("cell_km", 5), "res_m": s.get("res_m", 100),
                    "image": {"src": f"data/img/{sid}.png", "caption": "Relevo LOLA (100 m), cores = elevação"},
                    "status": "ready", "center_pending_validation": pending, "sources": src})
        d = sites_in.get(sid, {})
        thermal = dict(d["thermal"]) if d.get("thermal") else None
        if thermal:
            thermal["display"] = moon_thermal_display(thermal)
            thermal["note"] = THERMAL_NOTE_MOON
        mineral = dict(d["mineralogy"]) if d.get("mineralogy") else None
        if mineral:
            b1, b2 = mineral.get("band_1um") or {}, mineral.get("band_2um") or {}
            if b1.get("median_apparent_depth") is not None:
                mineral["summary"] = (f"M3 exploratório: profundidade aparente da banda de 1 µm {b1['median_apparent_depth']:.2f}"
                                      f" e de 2 µm {b2.get('median_apparent_depth', 0):.2f}; classificação mineral não validada")
            else:
                mineral["summary"] = "M3: cobertura espectral do recorte não confirmada; classificação mineral não validada"
        attrs[sid] = {"terrain": recomputed.get(sid) or d.get("terrain"), "delivered_terrain": d.get("terrain"),
                      "thermal": thermal, "mineralogy": mineral, "run_id": d.get("run_id")}
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
                    "image": {"src": f"data/img/{s['id']}.png", "caption": "Relevo sombreado LOLA (NASA Goddard PGDA)"},
                    "status": "ready" if ready else "pending",
                    "sources": [ARTEMIS_SOURCE, LOLA_SOURCE]})
        attrs[s["id"]] = {"terrain": c.get("terrain"), "thermal": c.get("thermal"),
                          "mineralogy": None, "run_id": c.get("run_id")}
    return cat, attrs


def main():
    p1 = json.loads((DATA / "source" / "prototipo1_app_data.json").read_text(encoding="utf-8"))
    mcat, mattrs = mars_sites(p1)
    mars_delivery = DATA / "source" / "delivery_mars" / "planet_sites.json"
    if mars_delivery.exists():
        md = json.loads(mars_delivery.read_text(encoding="utf-8"))
        for sid in mattrs:
            mattrs[sid]["thermal"] = mars_thermal(md.get(sid))
        for s in mcat:
            s["sources"] = s["sources"] + [{"name": "Mars Odyssey THEMIS: inércia térmica (Huang 2026, 1 km) e temperatura de brilho",
                                            "url": "https://pds-geosciences.wustl.edu/missions/odyssey/themis.htm"}]
    moon_delivery = DATA / "source" / "delivery_moon"
    lcat, lattrs = moon_sites_from_delivery(moon_delivery) if (moon_delivery / "catalog.json").exists() else moon_sites()
    (DATA / "catalog.json").write_text(json.dumps({"version": "1.0", "sites": lcat + mcat},
                                                  ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "planet_sites.json").write_text(json.dumps(mattrs | lattrs, ensure_ascii=False, indent=1),
                                            encoding="utf-8")
    ready = sum(1 for v in (mattrs | lattrs).values() if v["terrain"])
    print(f"catalog.json: {len(lcat)} Lua + {len(mcat)} Marte; {ready} com atributos")


if __name__ == "__main__":
    main()
