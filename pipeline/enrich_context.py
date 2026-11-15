"""Contexto geológico (Macrostrat API v2) para as melhores células de cada local fixo.

Mesmo método do Protótipo 1 (Etapa 7.1): 5 pontos por recorte (centro e 4 pontos internos),
rota /geologic_units/map. Litologia mapeada não é mineralogia verificada.

Uso:
    python pipeline/enrich_context.py --top 50
Atualiza data/earth_grid.json -> "context".
"""
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import requests

import terrain
from run_log import Run
from stability import distances

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
API = "https://macrostrat.org/api/v2/geologic_units/map"
OFFSETS = [(0.0, 0.0), (-0.3, -0.3), (-0.3, 0.3), (0.3, -0.3), (0.3, 0.3)]  # fração do lado (5 km)

RULES = [  # do notebook (Etapa 7.2), simplificado
    ("Sandstone", ["sandstone", "arenito"]),
    ("Basalt", ["basalt"]),
    ("Carbonate", ["limestone", "dolomite", "carbonate"]),
    ("Siliciclastic", ["siltstone", "shale", "mudstone", "conglomerate", "siliciclastic"]),
    ("Volcanic", ["volcanic", "andesite", "rhyolite", "tuff", "ignimbrite"]),
    ("Plutonic", ["granite", "diorite", "gabbro", "plutonic"]),
    ("Metamorphic", ["metamorphic", "gneiss", "schist", "quartzite"]),
    ("Sediment", ["alluvium", "sand", "gravel", "sediment", "unconsolidated"]),
]


def classify(text: str) -> str | None:
    t = (text or "").lower()
    for name, keys in RULES:
        if any(k in t for k in keys):
            return name
    return None


def points(lat, lon):
    dlat = math.degrees(terrain.CELL_KM / 6371.0)
    dlon = dlat / max(math.cos(math.radians(lat)), 1e-6)
    return [(lat + a * dlat, lon + b * dlon) for a, b in OFFSETS]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=50)
    args = ap.parse_args()
    cfg = json.loads((DATA / "config.json").read_text(encoding="utf-8"))
    grid = json.loads((DATA / "earth_grid.json").read_text(encoding="utf-8"))
    sites = json.loads((DATA / "planet_sites.json").read_text(encoding="utf-8"))
    attrs = terrain.RANK_ATTRS
    col = {c: i for i, c in enumerate(grid["columns"])}
    cells = np.array([[r[col[a]] for a in attrs] for r in grid["rows"]], dtype=float)
    scales = np.array([cfg["attributes"][a]["scale"] for a in attrs])
    w = np.array([cfg["objectives"]["default"]["weights"][a] for a in attrs])
    wanted = set()
    for s in sites.values():
        if s.get("terrain"):
            d = distances(np.array([s["terrain"][a] for a in attrs]), cells, w, scales)
            wanted.update(int(i) for i in np.argsort(d)[:args.top])

    run = Run("enrich_context.py", {"top": args.top, "points_per_cell": len(OFFSETS)})
    run.source("Macrostrat API v2 /geologic_units/map (CC-BY 4.0)", url=API)
    ctx = grid.setdefault("context", {})
    with requests.Session() as s:
        for i in sorted(wanted):
            row = grid["rows"][i]
            cid = row[0]
            if cid in ctx:
                continue
            liths, classes = [], {}
            for lat, lon in points(row[col["lat"]], row[col["lon"]]):
                try:
                    r = s.get(API, params={"lat": round(lat, 5), "lng": round(lon, 5)}, timeout=30)
                    run.request(r.url, r.status_code)
                    for u in r.json().get("success", {}).get("data", []):
                        text = u.get("lith") or u.get("name") or ""
                        liths.append(text)
                        c = classify(text)
                        if c:
                            classes[c] = classes.get(c, 0) + 1
                except Exception as e:  # noqa: BLE001 - registrar e seguir
                    run.request(API, f"error: {e}")
                time.sleep(0.2)
            ctx[cid] = {"lithology": sorted(classes, key=classes.get, reverse=True),
                        "raw": sorted(set(liths))[:8], "geology_source": "Macrostrat API v2",
                        "points": len(OFFSETS), "mineralogy_verified": False}
            print(f"{cid}: {ctx[cid]['lithology'] or 'sem litologia'}")
    (DATA / "earth_grid.json").write_text(json.dumps(grid, ensure_ascii=False, separators=(",", ":")),
                                          encoding="utf-8")
    run.save(outputs=["data/earth_grid.json"])


if __name__ == "__main__":
    main()
