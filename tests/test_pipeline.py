"""Testes do pipeline sem rede.  Rodar:  python -m pytest tests  (ou python tests/test_pipeline.py)"""
import json
import math
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import terrain  # noqa: E402
from build_earth_grid import cells_from_raster  # noqa: E402
from build_simulation import simulate  # noqa: E402
from stability import distances  # noqa: E402


def notebook_calcular_atributos(dem, resolucao=100, janela=3):
    """Cópia literal da função do notebook do Protótipo 1 (Etapa 4.3), sem os asserts."""
    from scipy.ndimage import uniform_filter
    elevacao = np.asarray(dem, dtype=np.float64)
    valido = np.isfinite(elevacao)
    dz_dy, dz_dx = np.gradient(elevacao, resolucao, resolucao)
    declividade = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    declividade[~valido] = np.nan
    pesos = valido.astype(np.float64)
    alturas = np.where(valido, elevacao, 0.0)
    contagem = uniform_filter(pesos, size=janela, mode="constant", cval=0)
    media = uniform_filter(alturas, size=janela, mode="constant", cval=0) / np.maximum(contagem, 1e-12)
    media2 = uniform_filter(alturas ** 2, size=janela, mode="constant", cval=0) / np.maximum(contagem, 1e-12)
    rugosidade = np.sqrt(np.maximum(media2 - media ** 2, 0))
    rugosidade[contagem < 0.999999] = np.nan
    return {
        "slope_mean_deg": float(np.nanmean(declividade)),
        "slope_median_deg": float(np.nanmedian(declividade)),
        "slope_p90_deg": float(np.nanpercentile(declividade, 90)),
        "roughness_mean_m": float(np.nanmean(rugosidade)),
        "roughness_p90_m": float(np.nanpercentile(rugosidade, 90)),
        "relief_m": float(np.nanmax(elevacao) - np.nanmin(elevacao)),
    }


def synthetic_dem(n=50, seed=1):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] * 100.0
    return 0.05 * x + 30 * np.sin(y / 700) + rng.normal(0, 4, (n, n))


def test_terrain_matches_notebook():
    z = synthetic_dem()
    ours, ref = terrain.compute_attributes(z), notebook_calcular_atributos(z)
    for k, v in ref.items():
        assert math.isclose(ours[k], v, rel_tol=1e-12), k


def test_plane_slope():
    y, x = np.mgrid[0:50, 0:50] * 100.0
    a = terrain.compute_attributes(0.1 * x)
    assert math.isclose(a["slope_mean_deg"], math.degrees(math.atan(0.1)), rel_tol=1e-9)
    assert math.isclose(a["relief_m"], 0.1 * 49 * 100, rel_tol=1e-9)


def test_invalid_crop_rejected():
    z = synthetic_dem()
    z[:10, :] = np.nan  # 20% inválido
    assert terrain.compute_attributes(z) is None


def test_distances_reproduce_prototype1():
    data = json.loads((ROOT / "data" / "source" / "prototipo1_app_data.json").read_text(encoding="utf-8"))
    topo = {t["regiao"]: t for t in data["topografia"]}
    keys = ["declividade_media_graus", "rugosidade_media_m", "amplitude_topografica_m"]
    for r in data["ranking"]:
        a = np.array([topo[r["setor_marte"]][k] for k in keys])
        b = np.array([[topo[r["candidato_terra"]][k] for k in keys]])
        d = distances(a, b, np.array([0.40, 0.35, 0.25]), np.array([10.0, 15.0, 500.0]))[0]
        assert math.isclose(d, r["distancia_topografica"], rel_tol=1e-9)


def test_grid_cells_and_known_marker():
    epsg, xmin, ymax = 32719, 500000.0, 7470000.0
    z = np.vstack([np.hstack([synthetic_dem(seed=i + 3 * j) for i in range(3)]) for j in range(2)])
    z[0:50, 100:150] = np.nan  # uma célula sem dados
    from pyproj import Transformer
    lon, lat = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True).transform(xmin + 7500, ymax - 2500)
    rows, ids, dems, known = cells_from_raster(z, xmin, ymax, epsg, "test", [{"name": "K", "lat": lat, "lon": lon}])
    assert len(rows) == 5 and len(dems) == 5
    assert known == {"test_000001": "K"}
    assert all(len(r) == 10 for r in rows)


def test_moon_cut_on_synthetic_polar_dem():
    import rasterio
    from rasterio.transform import from_origin
    from build_moon_sites import cut_site
    crs = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
    res, n = 40.0, 2000  # 80 x 80 km em volta do polo
    x0 = -n * res / 2
    xs = x0 + (np.arange(n) + 0.5) * res
    z = np.tile(0.1 * xs, (n, 1)).astype(np.float32)  # plano inclinado em x: 5,71°
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "moon.tif"
        with rasterio.open(path, "w", driver="GTiff", height=n, width=n, count=1, dtype="float32",
                           crs=crs, transform=from_origin(x0, -x0, res, res), nodata=-9999) as dst:
            dst.write(z, 1)
        with rasterio.open(path) as src:
            crop, _ = cut_site(src, -89.5, 45.0)
    a = terrain.compute_attributes(crop)
    assert crop.shape == (50, 50)
    assert math.isclose(a["slope_mean_deg"], math.degrees(math.atan(0.1)), rel_tol=5e-3)  # 40 m -> 100 m não é razão inteira


def test_simulation_variants():
    out = simulate(synthetic_dem())
    assert set(out) == {"base", "res_300", "gap_30", "noise_5"}
    assert all(v is not None for v in out.values())
    assert out["gap_30"]["valid_pct"] == 70.0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
