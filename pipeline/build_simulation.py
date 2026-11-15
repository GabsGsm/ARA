"""Simulação de qualidade dos dados: recalcula os atributos com dados piorados de propósito.

Variantes (sobre o mesmo recorte 50x50 a 100 m):
    res_300  menor resolução: média em blocos 3x3 -> 300 m/pixel
    gap_30   faixa contínua de 30% do recorte sem dados (posição sorteada, semente fixa)
    noise_5  ruído gaussiano de 5 m na elevação

Entradas (recortes salvos pelos outros scripts):
    pipeline/cache/earth_<regiao>.npz     (build_earth_grid.py)
    pipeline/cache/planet_moon.npz        (build_moon_sites.py)
    --mars-tif jezero_01=/caminho/jezero_01_dem_100m.tif   (GeoTIFFs de 100 m do Colab do Protótipo 1)
Saída:
    data/simulation.json  (só os locais fixos e as 50 melhores células de cada local)

Uso:
    python pipeline/build_simulation.py --mars-tif jezero_01=.../jezero_01_dem_100m.tif ...
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import terrain
from stability import distances

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "data"
CACHE = HERE / "cache"
SEED = 7

VARIANTS = [
    {"id": "base", "label": "Dados originais (100 m)", "kind": "base"},
    {"id": "res_300", "label": "Resolução menor (300 m)", "kind": "resolution"},
    {"id": "gap_30", "label": "30% da área sem dados", "kind": "missing"},
    {"id": "noise_5", "label": "Ruído na elevação (±5 m)", "kind": "noise"},
]
KEEP = terrain.RANK_ATTRS + ["valid_pct"]


def degrade(z: np.ndarray, vid: str, rng: np.random.Generator):
    if vid == "base":
        return terrain.compute_attributes(z)
    if vid == "res_300":
        n = (z.shape[0] // 3) * 3
        zz = z[:n, :n].reshape(n // 3, 3, n // 3, 3).mean(axis=(1, 3))
        return terrain.compute_attributes(zz, res=300)
    if vid == "gap_30":
        zz = z.copy()
        h = int(round(z.shape[0] * 0.30))
        start = int(rng.integers(0, z.shape[0] - h + 1))
        zz[start:start + h, :] = np.nan
        return terrain.compute_attributes(zz, min_valid=0.5)
    if vid == "noise_5":
        return terrain.compute_attributes(z + rng.normal(0, 5, z.shape))
    raise ValueError(vid)


def simulate(z):
    rng = np.random.default_rng(SEED)
    out = {}
    for v in VARIANTS:
        a = degrade(np.asarray(z, dtype=np.float64), v["id"], rng)
        out[v["id"]] = {k: round(a[k], 3) for k in KEEP} if a else None
    return out


def load_npz(pattern):
    found = {}
    for p in CACHE.glob(pattern):
        d = np.load(p)
        found.update(dict(zip(d["ids"].tolist(), d["dems"])))
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mars-tif", action="append", default=[], help="site_id=caminho.tif (100 m, 50x50)")
    ap.add_argument("--top", type=int, default=50)
    args = ap.parse_args()

    planet = load_npz("planet_*.npz")
    if args.mars_tif:
        import rasterio
        for item in args.mars_tif:
            sid, path = item.split("=", 1)
            with rasterio.open(path) as src:
                planet[sid] = src.read(1, masked=True).astype(np.float64).filled(np.nan)
    earth = load_npz("earth_*.npz")

    cfg = json.loads((DATA / "config.json").read_text(encoding="utf-8"))
    grid = json.loads((DATA / "earth_grid.json").read_text(encoding="utf-8"))
    sites = json.loads((DATA / "planet_sites.json").read_text(encoding="utf-8"))
    attrs = terrain.RANK_ATTRS
    col = {c: i for i, c in enumerate(grid["columns"])}
    cells = np.array([[r[col[a]] for a in attrs] for r in grid["rows"]], dtype=float)
    ids = [r[0] for r in grid["rows"]]
    scales = np.array([cfg["attributes"][a]["scale"] for a in attrs])
    w = np.array([cfg["objectives"]["default"]["weights"][a] for a in attrs])

    wanted = set()
    for sid, s in sites.items():
        if s.get("terrain") and len(ids):
            d = distances(np.array([s["terrain"][a] for a in attrs]), cells, w, scales)
            wanted.update(ids[i] for i in np.argsort(d)[:args.top])

    # incremental: mantém o que já foi simulado e só (re)calcula o que tem recorte disponível aqui.
    # Assim dá para rodar só com as regiões novas da Terra sem ter os recortes de Lua/Marte no computador.
    old = {}
    if (DATA / "simulation.json").exists():
        old = json.loads((DATA / "simulation.json").read_text(encoding="utf-8"))
    keep_earth = {k: v for k, v in old.get("earth", {}).items() if k in wanted}
    out = {"variants": VARIANTS, "seed": SEED, "planet": dict(old.get("planet", {})), "earth": keep_earth}
    for sid, z in planet.items():
        out["planet"][sid] = simulate(z)
    for cid in sorted(wanted & set(earth)):
        out["earth"][cid] = simulate(earth[cid])
    (DATA / "simulation.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"simulation.json: {len(out['planet'])} locais fixos, {len(out['earth'])} células da Terra")
    missing = [sid for sid, s in sites.items() if s.get("terrain") and sid not in out["planet"]]
    if missing:
        print(f"Aviso: sem simulação para {missing}. Rode build_moon_sites.py / import_delivery.py ou passe --mars-tif.")


if __name__ == "__main__":
    main()
