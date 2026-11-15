"""Atributos dos locais fixos da Lua a partir de um DEM polar do LOLA.

DEM recomendado (GeoTIFF polar estereográfico, 80-90°S, PGDA/NASA Goddard):
    https://pgda.gsfc.nasa.gov/products/90   ->  LDEM_80S_40MPP_ADJ.TIF (~685 MB)
    (LDEM_80S_20MPP_ADJ.TIF tem 20 m como o CTX de Marte, mas ~2,6 GB)

Uso:
    python pipeline/build_moon_sites.py --dem /caminho/LDEM_80S_40MPP_ADJ.TIF

Processo igual ao de Jezero: janela de 5 x 5 km ao redor do centro, agregação por
média para 100 m (50 x 50 px) e os mesmos atributos de terrain.py.
Na faixa 84-90°S a escala da projeção polar varia menos de 0,3%.

Saídas:
    data/moon_sites_attrs.json       (atributos por local)
    pipeline/cache/planet_moon.npz   (recortes para a simulação)
    data/runs/<run_id>.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds

import images
import terrain
from run_log import Run

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "data" / "moon_sites_attrs.json"
HALF = terrain.CELL_KM * 1000 / 2


def cut_site(src, lat, lon):
    """Recorte 5x5 km agregado a 100 m (50x50) centrado em (lat, lon) lunar."""
    crs = CRS.from_user_input(src.crs.to_wkt())
    to_proj = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    x, y = to_proj.transform(lon, lat)
    xmin, ymin, xmax, ymax = x - HALF, y - HALF, x + HALF, y + HALF
    win = from_bounds(xmin, ymin, xmax, ymax, src.transform).round_offsets().round_lengths()
    data = src.read(1, window=win, boundless=True, fill_value=src.nodata if src.nodata is not None else np.nan,
                    masked=True).astype(np.float64).filled(np.nan)
    out = np.full((terrain.CELL_PX, terrain.CELL_PX), np.nan, dtype=np.float64)
    reproject(source=data, destination=out,
              src_transform=src.window_transform(win), src_crs=src.crs, src_nodata=np.nan,
              dst_transform=from_origin(xmin, ymax, terrain.RES_M, terrain.RES_M),
              dst_crs=src.crs, dst_nodata=np.nan, resampling=Resampling.average)
    return out, (x, y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem", required=True, help="GeoTIFF LOLA polar (ex.: LDEM_80S_40MPP_ADJ.TIF)")
    ap.add_argument("--all", action="store_true", help="processa todos os sites com lat/lon, não só mvp=true")
    args = ap.parse_args()

    cfg = json.loads((HERE / "moon_sites.json").read_text(encoding="utf-8"))
    sites = [s for s in cfg["sites"] if s["lat"] is not None and (args.all or s.get("mvp"))]
    if not sites:
        raise SystemExit("Nenhum site com lat/lon em pipeline/moon_sites.json. Preencha o centro dos recortes.")

    run = Run("build_moon_sites.py", {"dem": Path(args.dem).name, "res_m": terrain.RES_M,
                                       "cell_km": terrain.CELL_KM, "resampling": "average"})
    run.source("LRO LOLA polar DEM (PGDA, Barker et al.)", url="https://pgda.gsfc.nasa.gov/products/90",
               product_id=Path(args.dem).name)
    results, ids, dems = {}, [], []
    with rasterio.open(args.dem) as src:
        for s in sites:
            z, (x, y) = cut_site(src, s["lat"], s["lon"])
            attrs = terrain.compute_attributes(z)
            status = "ok" if attrs else "insufficient_valid_pixels"
            print(f"{s['id']}: {status}")
            results[s["id"]] = {"name": s["name"], "lat": s["lat"], "lon": s["lon"],
                                "proj_xy_m": [round(x, 1), round(y, 1)], "terrain": attrs,
                                "status": status, "run_id": run.id}
            if attrs:
                ids.append(s["id"])
                dems.append(z.astype(np.float32))
                images.relief_png(z, ROOT / "data" / "img" / f"{s['id']}.png")
    if dems:
        (HERE / "cache").mkdir(exist_ok=True)
        np.savez_compressed(HERE / "cache" / "planet_moon.npz", ids=np.array(ids), dems=np.stack(dems))
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    run.save(outputs=[str(OUT.relative_to(ROOT))])
    print(f"Salvo: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
