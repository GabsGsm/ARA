"""Converte os dados do mock v7.3 (Protótipo 1) nos arquivos do ARA.

Uso:
    python pipeline/convert_mock.py                       # usa mock/TerraMatch_AI_Mission_Control_v7_3.html
    python pipeline/convert_mock.py --html outro.html

Saídas:
    data/source/prototipo1_app_data.json  (o objeto DATA do mock, sem mudanças)
    data/earth_grid.json                  (só se ainda não existir: as 4 regiões da Terra
                                           do Protótipo 1 como células de exemplo)

Serve para o front começar antes da grade real ficar pronta.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import terrain

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source" / "prototipo1_app_data.json"
GRID = ROOT / "data" / "earth_grid.json"

EARTH_SITES = {  # coordenadas usadas no notebook do Protótipo 1
    "Atacama_01": ("Valle de la Luna, Atacama (Chile)", -22.9112, -68.3230),
    "Death_Valley_01": ("Death Valley (USA)", 36.420, -116.812),
    "Timanfaya_01": ("Timanfaya, Lanzarote (Spain)", 29.035, -13.783),
    "Wadi_Rum_01": ("Wadi Rum (Jordan)", 29.640, 35.434),
}


def extract_data(html: str) -> dict:
    m = re.search(r"const DATA = (\{.*?\});\n", html, re.S)
    if not m:
        raise SystemExit("Objeto DATA não encontrado no HTML.")
    return json.loads(m.group(1))


def earth_example(data: dict) -> dict:
    topo = {t["regiao"]: t for t in data["topografia"]}
    geo = {g["regiao"]: g for g in data["geologia_terra"]}
    rows, known, context = [], {}, {}
    for key, (name, lat, lon) in EARTH_SITES.items():
        t = topo[key]
        cid = "p1_" + key.lower()
        rows.append([cid, "prototipo1", lat, lon,
                     round(t["declividade_media_graus"], 6), round(t["declividade_p90_graus"], 6),
                     round(t["rugosidade_media_m"], 6), round(t["rugosidade_p90_m"], 6),
                     round(t["amplitude_topografica_m"], 6), 100.0])
        known[cid] = name
        g = geo.get(key, {})
        context[cid] = {
            "lithology": [x["classe"] for x in g.get("litologias_especificas", [])],
            "geology_classes": [x["classe"] for x in g.get("classes_gerais", [])],
            "geology_source": g.get("fonte"),
            "mineralogy_verified": g.get("mineralogia_espectral_verificada", False),
        }
    return {
        "version": "1.0", "cell_km": terrain.CELL_KM, "res_m": terrain.RES_M,
        "dem": "Mapzen Terrain Tiles z12 (Prototype 1)",
        "regions": [{"id": "prototipo1", "name": "Locais do Protótipo 1 (escolhidos à mão)",
                     "why": "Análogos conhecidos usados no Protótipo 1; mantidos como referência"}],
        "columns": ["id", "region", "lat", "lon", "slope_mean_deg", "slope_p90_deg",
                    "roughness_mean_m", "roughness_p90_m", "relief_m", "valid_pct"],
        "rows": rows, "known_analogs": known, "context": context, "run_ids": ["prototype1-mock-v7.3"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default=str(ROOT / "mock" / "TerraMatch_AI_Mission_Control_v7_3.html"))
    args = ap.parse_args()
    data = extract_data(Path(args.html).read_text(encoding="utf-8"))
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    SOURCE.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"DATA do mock salvo em {SOURCE.relative_to(ROOT)}")
    if not GRID.exists():
        GRID.write_text(json.dumps(earth_example(data), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Grade de exemplo criada em {GRID.relative_to(ROOT)} (4 células do Protótipo 1)")
    else:
        print(f"{GRID.relative_to(ROOT)} já existe; não foi alterado")


if __name__ == "__main__":
    main()
