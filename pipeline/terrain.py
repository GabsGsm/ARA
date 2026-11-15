"""Atributos topográficos de um recorte DEM a 100 m/pixel.

Porte direto de `calcular_atributos` do notebook do Protótipo 1 (Etapa 4.3):
- declividade: np.gradient com o tamanho do pixel em metros;
- rugosidade: desvio-padrão local em janela 3 x 3 (300 m a 100 m/pixel),
  descartando pixels de borda que não têm a janela completa;
- amplitude: máximo - mínimo do recorte.

A mesma função é usada para Marte, Lua e Terra.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import uniform_filter

RES_M = 100          # resolução de análise (m/pixel)
CELL_KM = 5          # lado do recorte (km)
CELL_PX = CELL_KM * 1000 // RES_M   # 50 pixels
MIN_VALID = 0.95     # mesma exigência do notebook (>= 95% de pixels válidos)


def slope_deg(z: np.ndarray, res: float = RES_M) -> np.ndarray:
    dz_dy, dz_dx = np.gradient(z, res, res)
    s = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    s[~np.isfinite(z)] = np.nan
    return s


def roughness_m(z: np.ndarray, window: int = 3) -> np.ndarray:
    valid = np.isfinite(z)
    w = valid.astype(np.float64)
    h = np.where(valid, z, 0.0)
    count = uniform_filter(w, size=window, mode="constant", cval=0)
    mean = uniform_filter(h, size=window, mode="constant", cval=0) / np.maximum(count, 1e-12)
    mean2 = uniform_filter(h ** 2, size=window, mode="constant", cval=0) / np.maximum(count, 1e-12)
    r = np.sqrt(np.maximum(mean2 - mean ** 2, 0))
    r[count < 0.999999] = np.nan
    return r


def compute_attributes(dem, res: float = RES_M, window: int = 3,
                       min_valid: float = MIN_VALID) -> dict | None:
    """Retorna os atributos do recorte, ou None se houver menos de `min_valid` de pixels válidos."""
    z = np.asarray(dem, dtype=np.float64)
    valid_frac = float(np.isfinite(z).mean())
    if valid_frac < min_valid:
        return None
    s = slope_deg(z, res)
    r = roughness_m(z, window)
    if not np.isfinite(s).any() or not np.isfinite(r).any():
        return None
    return {
        "slope_mean_deg": float(np.nanmean(s)),
        "slope_median_deg": float(np.nanmedian(s)),
        "slope_p90_deg": float(np.nanpercentile(s, 90)),
        "roughness_mean_m": float(np.nanmean(r)),
        "roughness_p90_m": float(np.nanpercentile(r, 90)),
        "relief_m": float(np.nanmax(z) - np.nanmin(z)),
        "valid_pct": round(valid_frac * 100, 2),
    }


# Atributos usados no ranking e suas chaves no JSON do Protótipo 1
RANK_ATTRS = ["slope_mean_deg", "roughness_mean_m", "relief_m"]
PROTOTYPE1_KEYS = {
    "slope_mean_deg": "declividade_media_graus",
    "slope_median_deg": "declividade_mediana_graus",
    "slope_p90_deg": "declividade_p90_graus",
    "roughness_mean_m": "rugosidade_media_m",
    "roughness_p90_m": "rugosidade_p90_m",
    "relief_m": "amplitude_topografica_m",
}
