"""Gera a textura equiretangular (mapa 2:1) usada para girar Marte e a Lua em 360°.

As fotos dos planetas mostram só um hemisfério. Este script "desenrola" esse
hemisfério (projeção ortográfica -> equiretangular) e completa o lado de trás com a
mesma foto girada 180°, misturando as duas faces numa faixa larga (sem emenda). A iluminação que vem na foto é neutralizada
(dividida por um borrão grande), porque o site aplica luz e sombra fixas por cima.

Uso, na raiz do projeto:
    python tools/make_globe_texture.py design/originais/mars.png web/img/mars-tex.jpg
    python tools/make_globe_texture.py design/originais/moon.png web/img/moon-tex.jpg --gray --flatten 0.3 --gain 1.3
"""
from __future__ import annotations

import argparse

import numpy as np
from PIL import Image, ImageFilter


def build(src: str, dst: str, width: int = 2048, k: float = 0.68, flatten: float = 0.6, gray: bool = False, blur_r: float = 0.45, gain_all: float = 1.0) -> None:
    im = Image.open(src).convert("RGBA")
    alpha = np.asarray(im.split()[3])
    ys, xs = np.nonzero(alpha > 128)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = min(xs.max() - xs.min(), ys.max() - ys.min()) / 2 * 0.985

    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    if flatten:
        # tira o sombreado da foto: divide pela luminância borrada (só dentro do disco)
        lum = rgb.mean(axis=2)
        mask = alpha > 128
        filled = np.where(mask, lum, lum[mask].mean()).clip(0, 255).astype(np.uint8)
        blur = np.asarray(Image.fromarray(filled, "L").filter(ImageFilter.GaussianBlur(float(r) * blur_r)), dtype=np.float32)
        gain = (lum[mask].mean() / np.maximum(blur, 8.0)) ** flatten
        rgb = np.clip(rgb * gain[..., None], 0, 255)
    # corta reflexos estourados (brilho da foto na borda do disco)
    lum2 = rgb.mean(axis=2)
    cap = np.percentile(lum2[alpha > 128], 97)
    rgb = rgb * np.minimum(1.0, cap / np.maximum(lum2, 1.0))[..., None]
    if not gray:
        # reflexos da foto ficam claros e sem cor: puxa esses pontos para a cor média do planeta
        disc = alpha > 128
        mx, mn = rgb.max(axis=2), rgb.min(axis=2)
        sat = (mx - mn) / np.maximum(mx, 1.0)
        lum3 = rgb.mean(axis=2)
        med_s, med_l = np.median(sat[disc]), np.median(lum3[disc])
        med_rgb = np.median(rgb[disc], axis=0)
        m = np.clip((med_s * 0.85 - sat) / (med_s * 0.35), 0, 1) * np.clip((lum3 - med_l) / 35.0, 0, 1)
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(6)), dtype=np.float32)[..., None] / 255
        rgb = rgb * (1 - m) + (med_rgb * 1.08) * m
    rgb = rgb * gain_all
    if gray:
        g = rgb.mean(axis=2, keepdims=True)
        rgb = g * np.array([1.0, 0.985, 0.955], dtype=np.float32)  # cinza levemente quente

    h = width // 2
    u = (np.arange(width) + 0.5) / width * 2 * np.pi - np.pi        # longitude -pi..pi
    v = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi                 # latitude pi/2..-pi/2
    lon, lat = np.meshgrid(u, v)
    alon = np.abs(lon)

    def sample(lo, la):
        sx = cx + r * np.cos(la) * np.sin(lo * k)                     # k evita a borda esticada do disco
        sy = cy - r * np.sin(la)
        xi = np.clip(np.round(sx).astype(int), 0, rgb.shape[1] - 1)
        yi = np.clip(np.round(sy).astype(int), 0, rgb.shape[0] - 1)
        return rgb[yi, xi]

    # frente: a foto. Lado de trás: a mesma foto girada 180° (outra "face").
    # Como só usamos a fração k da longitude, a frente continua válida um pouco além
    # de 90°; as duas faces se misturam numa faixa larga, sem espelho e sem corte.
    lim = min(np.pi / 2 / k, np.radians(170)) - 0.02
    front = sample(np.clip(lon, -lim, lim), lat)
    back = sample(lon - np.sign(lon) * np.pi, -lat)
    lo_, hi_ = np.radians(72), min(lim, np.radians(128))
    w = np.clip((alon - lo_) / (hi_ - lo_), 0, 1)[..., None]
    w = w * w * (3 - 2 * w)                                            # transição suave
    tex = front * (1 - w) + back * w
    tex = np.clip(tex, 0, 255).astype(np.uint8)
    Image.fromarray(tex).save(dst, quality=88, optimize=True, progressive=True)
    print(f"{dst}: {width}x{h}  centro=({cx:.0f},{cy:.0f}) raio={r:.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--width", type=int, default=2048)
    ap.add_argument("--k", type=float, default=0.68, help="fração da longitude da foto usada (0-1)")
    ap.add_argument("--flatten", type=float, default=0.6, help="0 mantém o sombreado da foto, 1 remove tudo")
    ap.add_argument("--blur", type=float, default=0.45, help="raio do borrão (fração do raio) usado para tirar o sombreado")
    ap.add_argument("--gain", type=float, default=1.0, help="multiplica o brilho")
    ap.add_argument("--gray", action="store_true", help="textura em tons de cinza (Lua)")
    a = ap.parse_args()
    build(a.src, a.dst, a.width, a.k, a.flatten, a.gray, a.blur, a.gain)
