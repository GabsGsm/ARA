"""Centros das regiões do Artemis III a partir dos contornos oficiais do USGS.

Fonte (CC0): McClernan, M. T. (2024), Down Selected Artemis III Candidate Landing Site
Navigational Grids, USGS data release, https://doi.org/10.5066/P1MEQ6UK
(regiões vindas do LROC QuickMap; shapefiles em projeção polar estereográfica lunar).

Passo a passo:
  1. Baixar o data release (link "View Data Release" no DOI acima) e descompactar numa pasta.
  2. python pipeline/moon_regions_from_usgs.py --folder /caminho/da/pasta
     -> preenche lat/lon de cada região em pipeline/moon_sites.json (centro da região)
  3. Rodar build_moon_sites.py normalmente.

O script procura, para cada região, um shapefile cujo caminho contenha o nome da região
(ex.: "Mons_Mouton", "Malapert_Massif") e de preferência a grade de 1 km (mais leve).
O centro é o centróide da união das células, convertido para latitude/longitude lunar
pela própria projeção do arquivo.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
from pyproj import CRS, Transformer

HERE = Path(__file__).resolve().parent
SITES = HERE / "moon_sites.json"
DOI = "https://doi.org/10.5066/P1MEQ6UK"


def key(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def pick_shapefile(folder: Path, region_name: str) -> list[Path]:
    k = key(region_name)
    found = [p for p in folder.rglob("*.shp") if k in key(str(p.relative_to(folder)))]
    # "Mons Mouton" também casa com "Mons Mouton Plateau": descartar quando o nome for mais longo
    if region_name.lower() == "mons mouton":
        found = [p for p in found if "plateau" not in str(p).lower()]
    one_km = [p for p in found if "1km" in key(p.name) or "1km" in key(str(p.parent))]
    return one_km or found


def region_center(paths: list[Path]):
    frames = [gpd.read_file(p) for p in paths]
    crs = frames[0].crs
    if crs is None:
        raise ValueError(f"Shapefile sem projeção: {paths[0]}")
    geom = gpd.GeoSeries(
        [g for f in frames for g in f.to_crs(crs).geometry], crs=crs).union_all()
    c = geom.centroid
    proj = CRS.from_user_input(crs)
    to_geo = Transformer.from_crs(proj, proj.geodetic_crs, always_xy=True)
    lon, lat = to_geo.transform(c.x, c.y)
    minx, miny, maxx, maxy = geom.bounds
    return round(lat, 5), round(lon, 5), round((maxx - minx) / 1000, 2), round((maxy - miny) / 1000, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", required=True, help="pasta com o data release do USGS descompactado")
    args = ap.parse_args()
    folder = Path(args.folder)
    cfg = json.loads(SITES.read_text(encoding="utf-8"))
    for s in cfg["sites"]:
        paths = pick_shapefile(folder, s["name"])
        if not paths:
            print(f"{s['name']}: shapefile não encontrado")
            continue
        lat, lon, w_km, h_km = region_center(paths)
        s.update({"lat": lat, "lon": lon, "region_extent_km": [w_km, h_km],
                  "center_source": f"Centroid of USGS region outline ({DOI})"})
        print(f"{s['name']}: lat {lat}, lon {lon}  (região ~{w_km} x {h_km} km; {len(paths)} arquivo(s))")
    cfg["source"] = DOI
    SITES.write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Atualizado: {SITES.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
