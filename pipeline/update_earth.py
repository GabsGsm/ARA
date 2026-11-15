"""Atualiza o lado da Terra de uma vez: baixa o relevo, calcula as células e refaz o que depende delas.

Passos (na ordem):
    1. build_earth_grid.py   relevo Mapzen (AWS, sem cadastro) -> células 5 x 5 km em data/earth_grid.json
    2. enrich_context.py     geologia (Macrostrat) das melhores células de cada local fixo
    3. stability.py          estabilidade do ranking (2.000 conjuntos de pesos)
    4. build_simulation.py   variantes de qualidade dos dados para as melhores células

Precisa de internet. Rodar na raiz do projeto:
    python pipeline/update_earth.py                       # todas as regiões de pipeline/regions.json
    python pipeline/update_earth.py --region lut --region pinacate
    python pipeline/update_earth.py --skip-download       # só refaz 2-4 (ex.: depois de mudar pesos)
Depois: npm run dev para conferir, e git add data/ && git commit && git push.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def step(name, *args):
    print(f"\n=== {name} {' '.join(args)}", flush=True)
    t = time.time()
    env = dict(os.environ, PYTHONUTF8="1")  # acentos no Windows
    subprocess.run([sys.executable, str(HERE / name), *args], check=True, cwd=HERE.parent, env=env)
    print(f"--- {name}: {time.time() - t:.0f} s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", action="append", help="id em pipeline/regions.json (padrão: todas)")
    ap.add_argument("--top", type=int, default=20, help="melhores células por local para geologia/simulação")
    ap.add_argument("--skip-download", action="store_true")
    args = ap.parse_args()

    regions = args.region or [r["id"] for r in json.loads((HERE / "regions.json").read_text(encoding="utf-8"))["regions"]]
    if not args.skip_download:
        step("build_earth_grid.py", *sum((["--region", r] for r in regions), []))
    step("enrich_context.py", "--top", str(args.top))
    step("stability.py")
    step("build_simulation.py", "--top", str(args.top))
    print("\nPronto. Confira com: npm run dev")


if __name__ == "__main__":
    main()
