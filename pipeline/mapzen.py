"""DEM da Terra a partir dos Mapzen Terrain Tiles (AWS, público, sem login).

Mesma fonte e mesmo método do notebook do Protótipo 1 (Etapa 4.2):
tiles GeoTIFF no zoom 12 -> mosaico -> reprojeção bilinear para UTM a 100 m.
Os tiles baixados ficam em pipeline/cache/mapzen para não baixar de novo.
"""
from __future__ import annotations

from pathlib import Path

import mercantile
import numpy as np
import rasterio
import requests
from pyproj import Transformer
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif"
CACHE = Path(__file__).resolve().parent / "cache" / "mapzen"
SOURCE = {
    "name": "Mapzen Terrain Tiles (AWS Open Data, elevation-tiles-prod)",
    "url": "https://registry.opendata.aws/terrain-tiles/",
}


def utm_epsg(lat: float, lon: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def _tile_path(t) -> Path:
    return CACHE / str(t.z) / str(t.x) / f"{t.y}.tif"


def _download(t, session: requests.Session, log=None) -> Path:
    path = _tile_path(t)
    if path.exists() and path.stat().st_size > 0:
        return path
    url = TILE_URL.format(z=t.z, x=t.x, y=t.y)
    r = session.get(url, timeout=60)
    if log is not None:
        log.request(url, r.status_code)
    r.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)
    return path


def fetch_utm(xmin: float, ymin: float, xmax: float, ymax: float, epsg: int,
              res: float = 100, zoom: int = 12, log=None) -> tuple[np.ndarray, object]:
    """Retorna (elevação float32 com NaN, transform) na grade UTM [xmin,xmax] x [ymin,ymax]."""
    to_geo = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    corners = [to_geo.transform(x, y) for x, y in
               [(xmin, ymin), (xmin, ymax), (xmax, ymin), (xmax, ymax)]]
    west, east = min(c[0] for c in corners), max(c[0] for c in corners)
    south, north = min(c[1] for c in corners), max(c[1] for c in corners)
    tiles = list(mercantile.tiles(west, south, east, north, zooms=[zoom]))
    with requests.Session() as s:
        paths = [_download(t, s, log) for t in tiles]
    srcs = [rasterio.open(p) for p in paths]
    try:
        mosaic, transform = merge(srcs)
        src_crs, src_nodata = srcs[0].crs, srcs[0].nodata
    finally:
        for src in srcs:
            src.close()
    width = int(round((xmax - xmin) / res))
    height = int(round((ymax - ymin) / res))
    out = np.full((height, width), -9999, dtype=np.float32)
    dst_transform = from_origin(xmin, ymax, res, res)
    reproject(source=mosaic[0], destination=out,
              src_transform=transform, src_crs=src_crs, src_nodata=src_nodata,
              dst_transform=dst_transform, dst_crs=f"EPSG:{epsg}", dst_nodata=-9999,
              resampling=Resampling.bilinear)
    return np.where(out == -9999, np.nan, out), dst_transform
