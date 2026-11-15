"""Ranking com os pesos padrão e estabilidade frente aos pesos.

Mesmo método do Protótipo 1: 2.000 vetores de pesos Dirichlet(1,1,1), semente 42,
o primeiro vetor substituído pelos pesos padrão (0,40/0,35/0,25).
Como a grade tem muitas células, além de "% em 1º" guarda "% no top K" (K = 10).
A estabilidade NÃO depende dos pesos escolhidos no app, então é pré-calculada aqui.

Uso:
    python pipeline/stability.py
Saída:
    data/stability.json   {site_id: {cell_id: {"top1_pct": .., "topk_pct": ..}}}
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import terrain

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def distances(site_vec, cells, weights, scales):
    """site_vec (F,), cells (N,F), weights (S,F) ou (F,) -> (S,N) ou (N,)."""
    d2 = ((cells - site_vec) / scales) ** 2
    return np.sqrt(np.einsum("...f,nf->...n", weights, d2))


def stability(site_vec, cells, default_w, scales, draws=2000, seed=42, top_k=10):
    rng = np.random.default_rng(seed)
    w = rng.dirichlet(np.ones(len(default_w)), size=draws)
    w[0] = default_w
    d = distances(site_vec, cells, w, scales)                 # (S, N)
    top1 = np.bincount(np.argmin(d, axis=1), minlength=len(cells)) / draws * 100
    k = min(top_k, len(cells))
    topk_idx = np.argpartition(d, k - 1, axis=1)[:, :k] if k < len(cells) else np.tile(np.arange(len(cells)), (draws, 1))
    topk = np.bincount(topk_idx.ravel(), minlength=len(cells)) / draws * 100
    return top1, topk


def main():
    cfg = json.loads((DATA / "config.json").read_text(encoding="utf-8"))
    grid = json.loads((DATA / "earth_grid.json").read_text(encoding="utf-8"))
    sites = json.loads((DATA / "planet_sites.json").read_text(encoding="utf-8"))
    attrs = terrain.RANK_ATTRS
    col = {c: i for i, c in enumerate(grid["columns"])}
    cells = np.array([[r[col[a]] for a in attrs] for r in grid["rows"]], dtype=float)
    ids = [r[0] for r in grid["rows"]]
    scales = np.array([cfg["attributes"][a]["scale"] for a in attrs], dtype=float)
    default_w = np.array([cfg["objectives"]["default"]["weights"][a] for a in attrs], dtype=float)
    st = cfg["stability"]
    out = {}
    for sid, s in sites.items():
        if not s.get("terrain"):
            continue
        vec = np.array([s["terrain"][a] for a in attrs], dtype=float)
        top1, topk = stability(vec, cells, default_w, scales, st["draws"], st["seed"], st["top_k"])
        out[sid] = {ids[i]: {"top1_pct": round(float(top1[i]), 2), "topk_pct": round(float(topk[i]), 2)}
                    for i in np.nonzero(topk > 0)[0]}
    (DATA / "stability.json").write_text(json.dumps({"method": st, "sites": out}, ensure_ascii=False),
                                         encoding="utf-8")
    print(f"stability.json: {len(out)} locais, {len(ids)} células")


if __name__ == "__main__":
    main()
