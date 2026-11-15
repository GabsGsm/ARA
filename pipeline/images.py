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


# Paleta de relevo (baixo -> alto), parecida com a "terrain" do matplotlib, sem depender dele
_STOPS = np.array([0.0, 0.15, 0.35, 0.55, 0.75, 1.0])
_COLORS = np.array([[40, 70, 160], [30, 150, 200], [70, 190, 110], [235, 225, 130], [150, 105, 80], [250, 250, 250]], float)


def relief_png(z: np.ndarray, path: Path, res: float = 100, size: int = 480) -> None:
    """Relevo colorido com sombreamento, sem eixos (para os cartões do app)."""
    zz = np.where(np.isfinite(z), z, np.nanmean(z))
    t = (zz - zz.min()) / max(float(zz.max() - zz.min()), 1e-6)
    rgb = np.stack([np.interp(t, _STOPS, _COLORS[:, i]) for i in range(3)], axis=-1)
    shade = 0.55 + 0.45 * hillshade(z, res)[..., None]
    img = Image.fromarray(np.clip(rgb * shade, 0, 255).astype(np.uint8), mode="RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.BICUBIC).save(path, optimize=True)
