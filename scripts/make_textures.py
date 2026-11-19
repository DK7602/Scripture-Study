#!/usr/bin/env python3
"""Seamless textures for the printed-Bible look.

  public/textures/paper.webp    warm parchment grain (multiplied over the page colour)
  public/textures/leather.webp  pebbled leather grain (overlaid on the green top bar)

All noise is made periodic (FFT-filtered or drawn with wrap-around) so the tiles repeat without seams.
Usage: python3 scripts/make_textures.py
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "textures")
rng = np.random.default_rng(7)


def periodic_noise(n: int, power: float, lo: float = 0, hi: float = 1e9) -> np.ndarray:
    """Tileable fractal noise: white noise shaped by 1/f^power in the frequency domain, band-limited to [lo, hi]."""
    f = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(f, f)
    r = np.hypot(fx, fy)
    r[0, 0] = 1
    amp = 1 / r**power
    amp[(r < lo) | (r > hi)] = 0
    amp[0, 0] = 0
    spec = np.fft.fft2(rng.standard_normal((n, n))) * amp
    out = np.real(np.fft.ifft2(spec))
    return (out - out.mean()) / (out.std() + 1e-9)


def paper(n: int = 640) -> Image.Image:
    blotch = periodic_noise(n, 2.4, hi=12)  # large soft stains
    mottle = periodic_noise(n, 1.6, lo=8, hi=80)  # cloudy mottling
    grain = periodic_noise(n, 0.4, lo=90)  # fine tooth
    d = 0.030 * blotch + 0.020 * mottle + 0.024 * grain
    d += 0.012 * np.clip(blotch - 1.6, 0, None)  # a few darker age spots

    # fibres: short wavy strokes, darker and lighter, drawn with wrap-around
    fib = Image.new("L", (n * 3, n * 3), 128)
    dr = ImageDraw.Draw(fib)
    for _ in range(int(n * 1.1)):
        x, y = rng.uniform(n, 2 * n, 2)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(6, 26)
        pts = []
        for t in np.linspace(0, 1, 6):
            wob = np.sin(t * np.pi * rng.uniform(1, 3)) * rng.uniform(0, 2.5)
            pts.append((x + np.cos(ang) * ln * t - np.sin(ang) * wob, y + np.sin(ang) * ln * t + np.cos(ang) * wob))
        val = int(rng.choice([255, 40]))
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                dr.line([(px + ox, py + oy) for px, py in pts], fill=val, width=1)
    fib = fib.filter(ImageFilter.GaussianBlur(0.6))
    fa = (np.asarray(fib, dtype=np.float32)[n : 2 * n, n : 2 * n] - 128) / 127
    d += 0.018 * fa

    d = d - d.min()
    d = d / d.max() * 0.14  # 0 .. 14 % darkening
    # browner where darker: darken blue most, red least
    rgb = np.stack([1 - d * 0.78, 1 - d * 0.95, 1 - d * 1.30], axis=-1)
    return Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), "RGB")


def leather(n: int = 320) -> Image.Image:
    # cellular (Worley) creases between pebbles, tileable by wrapping the feature points
    pts = rng.uniform(0, n, (int(n * n / 26), 2))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    f1 = np.full((n, n), 1e9, np.float32)
    f2 = np.full((n, n), 1e9, np.float32)
    for ox in (-n, 0, n):
        for oy in (-n, 0, n):
            for px, py in pts:
                cx, cy = px + ox, py + oy
                if cx < -20 or cx > n + 20 or cy < -20 or cy > n + 20:
                    continue
                x0, x1 = int(max(0, cx - 12)), int(min(n, cx + 12))
                y0, y1 = int(max(0, cy - 12)), int(min(n, cy + 12))
                if x0 >= x1 or y0 >= y1:
                    continue
                dd = np.hypot(xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy)
                sub1, sub2 = f1[y0:y1, x0:x1], f2[y0:y1, x0:x1]
                closer = dd < sub1
                sub2[:] = np.where(closer, sub1, np.minimum(sub2, dd))
                sub1[:] = np.where(closer, dd, sub1)
    crease = np.clip((f2 - f1) / 2.2, 0, 1)  # 0 in the creases, 1 on the pebbles
    pebble = 1 - np.clip(f1 / 5.0, 0, 1) ** 2  # domed pebbles
    v = 0.45 * crease + 0.2 * pebble + 0.3 * periodic_noise(n, 1.8, lo=2, hi=24) + 0.08 * periodic_noise(n, 0.3, lo=60)
    v = (v - v.mean()) / (v.std() + 1e-9)
    g = 0.5 + 0.075 * v  # centred on 50 % grey so "overlay" leaves the colour unchanged on average
    img = Image.fromarray(np.clip(g * 255, 0, 255).astype(np.uint8), "L")
    return img.filter(ImageFilter.GaussianBlur(0.35)).convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    p = paper()
    p.save(os.path.join(OUT, "paper.webp"), quality=93, method=6)
    lth = leather()
    lth.save(os.path.join(OUT, "leather.webp"), quality=80, method=6)
    for f in ("paper.webp", "leather.webp"):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
