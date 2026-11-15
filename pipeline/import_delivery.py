"""Importa as entregas científicas de Lua e Marte (pacotes ARA_Lua_* e ARA_Marte_*).

Uso (pastas descompactadas):
    python pipeline/import_delivery.py --moon /caminho/ARA_Lua/ARA --mars /caminho/ARA_Marte/ARA

O que faz:
  - copia delivery/moon/*.json e delivery/mars/*.json para data/source/delivery_*/ (rastreio);
  - confere os atributos de relevo recalculando com terrain.py a partir dos DEMs de 100 m;
  - gera imagens de relevo limpas em data/img/<id>.png;
  - guarda os recortes 50x50 em pipeline/cache/ para a simulação de qualidade
    (Lua, Marte e as 4 células da Terra do Protótipo 1).
Depois rode: build_catalog.py, stability.py, build_simulation.py.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import rasterio

import images
import terrain

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "data" / "source"
IMG = ROOT / "data" / "img"
CACHE = HERE / "cache"
P1_EARTH = {"atacama_01": "p1_atacama_01", "death_valley_01": "p1_death_valley_01",
            "timanfaya_01": "p1_timanfaya_01", "wadi_rum_01": "p1_wadi_rum_01"}


def read_dem(path: Path) -> np.ndarray:
    with rasterio.open(path) as s:
        return s.read(1, masked=True).astype(np.float64).filled(np.nan)


def check(site_id, z, delivered):
    ours = terrain.compute_attributes(z)
    worst = max(abs(ours[k] - delivered[k]) / max(abs(delivered[k]), 1e-9)
                for k in terrain.RANK_ATTRS if k in delivered)
    status = "ok" if worst < 1e-3 else f"DIFERENTE ({worst:.2%})"
    print(f"  {site_id}: atributos {status}")
    return worst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--moon", type=Path, help="pasta ARA do pacote da Lua")
    ap.add_argument("--mars", type=Path, help="pasta ARA do pacote de Marte")
    args = ap.parse_args()
    CACHE.mkdir(exist_ok=True)

    if args.moon:
        print("Lua:")
        out = SRC / "delivery_moon"
        out.mkdir(parents=True, exist_ok=True)
        for f in (args.moon / "delivery" / "moon").glob("*.json"):
            shutil.copy2(f, out / f.name)
        for f in (args.moon / "results" / "moon").glob("ara_lua_integracao_final.json"):
            shutil.copy2(f, out / f.name)
        sites = json.loads((out / "planet_sites.json").read_text(encoding="utf-8"))
        ids, dems, recomputed = [], [], {}
        for sid, s in sites.items():
            dem = args.moon / "data" / "processed" / "moon" / f"{sid}_dem_100m.tif"
            if not dem.exists():
                print(f"  {sid}: DEM não encontrado")
                continue
            z = read_dem(dem)
            check(sid, z, s["terrain"])
            # Mesmo método de Marte e da Terra (Protótipo 1): declividade inclui a borda do recorte.
            # A entrega da Lua descartou a borda de 1 px; os valores entregues ficam em delivered_terrain.
            recomputed[sid] = terrain.compute_attributes(z)
            images.relief_png(z, IMG / f"{sid}.png")
            ids.append(sid)
            dems.append(z.astype(np.float32))
        np.savez_compressed(CACHE / "planet_moon.npz", ids=np.array(ids), dems=np.stack(dems))
        (out / "terrain_recomputed.json").write_text(json.dumps(
            {"method": "terrain.py (Prototype 1): slope incl. 1-px border, roughness std 3x3, relief max-min",
             "sites": recomputed}, indent=1), encoding="utf-8")

    if args.mars:
        print("Marte:")
        out = SRC / "delivery_mars"
        out.mkdir(parents=True, exist_ok=True)
        for f in (args.mars / "delivery" / "mars").glob("*.json"):
            if f.name != "terramatch_app_data_original.json":
                shutil.copy2(f, out / f.name)
        sites = json.loads((out / "planet_sites.json").read_text(encoding="utf-8"))
        proc = args.mars / "source" / "terramatch" / "processed"
        ids, dems = [], []
        for sid, s in sites.items():
            z = read_dem(proc / f"{sid}_dem_100m.tif")
            rec = s["terrain"]["records"][0]
            check(sid, z, {k: rec[v] for k, v in terrain.PROTOTYPE1_KEYS.items() if v in rec})
            ids.append(sid)
            dems.append(z.astype(np.float32))
        np.savez_compressed(CACHE / "planet_mars.npz", ids=np.array(ids), dems=np.stack(dems))
        e_ids, e_dems = [], []
        for name, cid in P1_EARTH.items():
            p = proc / f"{name}_dem_100m.tif"
            if p.exists():
                e_ids.append(cid)
                e_dems.append(read_dem(p).astype(np.float32))
        if e_ids:
            np.savez_compressed(CACHE / "earth_prototipo1.npz", ids=np.array(e_ids), dems=np.stack(e_dems))
            print(f"  Terra (Protótipo 1): {len(e_ids)} recortes guardados para a simulação")
        jez = proc / "jezero_setores.png"
        if jez.exists():
            shutil.copy2(jez, IMG / "jezero_setores.png")
    print("Pronto. Agora: build_catalog.py, stability.py, build_simulation.py")


if __name__ == "__main__":
    main()
