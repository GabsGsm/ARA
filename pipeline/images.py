"""PNG de relevo sombreado de um recorte (para o catálogo do app)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


def hillshade(z: np.ndarray, res: float = 100, azimuth: float = 315, altitude: float = 45) -> np.ndarray:
    z = np.where(np.isfinite(z), z, np.nanmean(z))
    dy, dx = np.gradient(z, res, res)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    az, alt = np.radians(azimuth), np.radians(altitude)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(hs, 0, 1)


def save_png(z: np.ndarray, path: Path, res: float = 100, size: int = 400) -> None:
    img = Image.fromarray((hillshade(z, res) * 255).astype(np.uint8), mode="L")
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.BILINEAR).save(path, optimize=True)
