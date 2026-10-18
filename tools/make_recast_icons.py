#!/usr/bin/env python3
"""재시전 대체 그림 만들기(52차) - 원작 재시전 아이콘(야스오 Q3 회오리 등)은 Data Dragon·접근 가능한 미러에 없어서,
그 스킬의 원래 아이콘을 회오리 모양으로 비틀고 색을 입혀 "<칸>2.png"를 만든다. 원작 그림을 구하면 같은 이름으로 덮어쓰면 된다.

사용법: python3 tools/make_recast_icons.py   (numpy, Pillow) → 그 다음 python3 tools/fetch_champion_icons.py(메타 갱신)
"""
import os
import numpy as np
from PIL import Image, ImageEnhance

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ICONS = os.path.join(ROOT, 'assets', 'champion_icons')
# (챔피언, 칸, 회오리 세기, 색(RGB 곱))
TARGETS = [('yasuo', 'Q', 2.6, (0.75, 1.0, 1.25)), ('yone', 'Q', 2.2, (1.15, 0.85, 1.2))]


def swirl(img, strength):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    dx, dy = xx - cx, yy - cy
    r = np.sqrt(dx * dx + dy * dy)
    rmax = min(cx, cy)
    theta = np.arctan2(dy, dx) + strength * np.clip(1 - r / rmax, 0, 1) ** 2
    sx = np.clip(cx + r * np.cos(theta), 0, w - 1).astype(np.int32)
    sy = np.clip(cy + r * np.sin(theta), 0, h - 1).astype(np.int32)
    return Image.fromarray(a[sy, sx].astype(np.uint8), 'RGBA')


def main():
    for cid, slot, strength, tint in TARGETS:
        src = os.path.join(ICONS, cid, f'{slot}.png')
        if not os.path.exists(src):
            continue
        im = swirl(Image.open(src), strength)
        arr = np.asarray(im).astype(np.float32)
        arr[..., :3] = np.clip(arr[..., :3] * np.array(tint, np.float32), 0, 255)
        im = ImageEnhance.Contrast(Image.fromarray(arr.astype(np.uint8), 'RGBA')).enhance(1.15)
        im.save(os.path.join(ICONS, cid, f'{slot}2.png'))
        print('made', cid, slot + '2.png')


if __name__ == '__main__':
    main()
