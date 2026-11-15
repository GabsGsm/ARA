"""Grade de células de 5 x 5 km da Terra com atributos topográficos.

Uso:
    python pipeline/build_earth_grid.py --region atacama
    python pipeline/build_earth_grid.py --region atacama --region lut

Saídas:
    data/earth_grid.json            (atualiza só as regiões processadas)
    pipeline/cache/earth_<id>.npz   (recortes 50x50 para a simulação de qualidade)
    data/runs/<run_id>.json         (registro de rastreio)
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from pyproj import Transformer

import terrain
from run_log import Run

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GRID = ROOT / "data" / "earth_grid.json"
CACHE = HERE / "cache"
CELL_M = terrain.CELL_KM * 1000
COLUMNS = ["id", "region", "lat", "lon", "slope_mean_deg", "slope_p90_deg",
           "roughness_mean_m", "roughness_p90_m", "relief_m", "valid_pct"]


def region_utm_box(bbox, epsg):
    """bbox geográfico -> caixa UTM alinhada à grade de 5 km."""
    w, s, e, n = bbox
    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    xs, ys = zip(*[to_utm.transform(x, y) for x, y in [(w, s), (w, n), (e, s), (e, n)]])
    xmin = math.floor(min(xs) / CELL_M) * CELL_M
    ymin = math.floor(min(ys) / CELL_M) * CELL_M
    xmax = math.ceil(max(xs) / CELL_M) * CELL_M
    ymax = math.ceil(max(ys) / CELL_M) * CELL_M
    return xmin, ymin, xmax, ymax


def cells_from_raster(z, xmin, ymax, epsg, region_id, known=()):
    """Corta o raster UTM (100 m) em células de 50x50 px e calcula os atributos.

    Função pura (sem rede), usada também nos testes."""
    px = terrain.CELL_PX
    to_geo = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    known_cells = {}
    for k in known:
        kx, ky = to_utm.transform(k["lon"], k["lat"])
        known_cells[(int((ymax - ky) // CELL_M), int((kx - xmin) // CELL_M))] = k["name"]
    rows, dems, ids, known_out = [], [], [], {}
    ny, nx = z.shape[0] // px, z.shape[1] // px
    for i in range(ny):
        for j in range(nx):
            crop = z[i * px:(i + 1) * px, j * px:(j + 1) * px]
            attrs = terrain.compute_attributes(crop)
            if attrs is None:
                continue
            cx = xmin + (j + 0.5) * CELL_M
            cy = ymax - (i + 0.5) * CELL_M
            lon, lat = to_geo.transform(cx, cy)
            cid = f"{region_id}_{i:03d}{j:03d}"
            rows.append([cid, region_id, round(lat, 5), round(lon, 5)] +
                        [round(attrs[c], 4) for c in COLUMNS[4:]])
            dems.append(crop.astype(np.float32))
            ids.append(cid)
            if (i, j) in known_cells:
                known_out[cid] = known_cells[(i, j)]
    return rows, ids, dems, known_out


def load_grid():
    if GRID.exists():
        return json.loads(GRID.read_text(encoding="utf-8"))
    return {"version": "1.0", "cell_km": terrain.CELL_KM, "res_m": terrain.RES_M,
            "dem": "Mapzen Terrain Tiles z12", "regions": [], "columns": COLUMNS,
            "rows": [], "known_analogs": {}, "context": {}, "run_ids": []}


def merge_region(grid, region, rows, known, run_id):
    rid = region["id"]
    grid["regions"] = [r for r in grid["regions"] if r["id"] != rid] + [
        {k: region[k] for k in ("id", "name", "bbox", "why") if k in region}]
    grid["rows"] = [r for r in grid["rows"] if r[1] != rid] + rows
    grid["known_analogs"] = {k: v for k, v in grid.get("known_analogs", {}).items()
                             if not k.startswith(rid + "_")} | known
    grid["columns"] = COLUMNS
    grid.setdefault("run_ids", []).append(run_id)
    return grid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", action="append", required=True, help="id em regions.json")
    ap.add_argument("--zoom", type=int, default=12)
    args = ap.parse_args()

    import mapzen  # importa aqui para os testes não exigirem rede
    regions = {r["id"]: r for r in json.loads((HERE / "regions.json").read_text())["regions"]}
    grid = load_grid()
    for rid in args.region:
        region = regions[rid]
        w, s, e, n = region["bbox"]
        epsg = mapzen.utm_epsg((s + n) / 2, (w + e) / 2)
        xmin, ymin, xmax, ymax = region_utm_box(region["bbox"], epsg)
        run = Run("build_earth_grid.py", {"region": region, "epsg": epsg, "zoom": args.zoom,
                                           "res_m": terrain.RES_M, "cell_km": terrain.CELL_KM,
                                           "roughness_window_px": 3, "resampling": "bilinear"})
        run.source(**mapzen.SOURCE)
        print(f"[{rid}] baixando Mapzen para {(xmax - xmin) / 1000:.0f} x {(ymax - ymin) / 1000:.0f} km (EPSG:{epsg})")
        z, _ = mapzen.fetch_utm(xmin, ymin, xmax, ymax, epsg, terrain.RES_M, args.zoom, log=run)
        rows, ids, dems, known = cells_from_raster(z, xmin, ymax, epsg, rid, region.get("known", []))
        total = (z.shape[0] // terrain.CELL_PX) * (z.shape[1] // terrain.CELL_PX)
        run.data["quality"] = {"cells_total": total, "cells_valid": len(rows),
                               "raster_valid_pct": round(float(np.isfinite(z).mean() * 100), 2)}
        CACHE.mkdir(exist_ok=True)
        np.savez_compressed(CACHE / f"earth_{rid}.npz", ids=np.array(ids), dems=np.stack(dems))
        path = run.save(outputs=[str(GRID.relative_to(ROOT))])
        grid = merge_region(grid, region, rows, known, run.id)
        print(f"[{rid}] {len(rows)}/{total} células válidas; registro: {path.name}")
    GRID.write_text(json.dumps(grid, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Grade salva: {GRID} ({len(grid['rows'])} células)")


if __name__ == "__main__":
    main()
