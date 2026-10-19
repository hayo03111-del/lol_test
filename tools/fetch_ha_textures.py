#!/usr/bin/env python3
"""칼바람 나락 원작 지형 텍스처 받기(74차) - assets/maps/howling_abyss/<이름>.png

CommunityDragon(raw.communitydragon.org)의 howling_abyss kitpiece 텍스처를 저장소로 받아 둔다. 맵 코드
(src/world/howling_abyss.js useOriginal)는 이 폴더를 먼저 찾고, 없으면 CommunityDragon에서 바로 받고, 그것도 안 되면
코드로 그린 텍스처를 쓴다. 저장소에 받아 두면 CommunityDragon에 접속할 수 없는 곳에서도 원작 텍스처가 보인다.

사용법: python3 tools/fetch_ha_textures.py   (raw.communitydragon.org에 접속할 수 있어야 한다)
"""
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'maps', 'howling_abyss')
BASE = 'https://raw.communitydragon.org/latest/game/assets/maps/kitpieces/howling_abyss/textures/'
# 맵 코드가 쓰는 텍스처(useOriginal 호출과 같은 목록)
NAMES = [
    'structure_lane_ground.png', 'structure_base_ground.png', 'structure_lane_walls.png', 'structure_lane_walls2.png',
    'basesnow.png', 'prop_icecliff_h.png', 'prop_icecliff_f.png', 'prop_ice_chunksa.png', 'prop_icecliff_snowtransition.png',
]


def main():
    os.makedirs(OUT, exist_ok=True)
    failed = []
    for name in NAMES:
        try:
            with urllib.request.urlopen(BASE + name, timeout=60) as r:
                data = r.read()
            with open(os.path.join(OUT, name), 'wb') as f:
                f.write(data)
            print(f'ok   {name} ({len(data):,} bytes)')
        except Exception as e:  # noqa: BLE001 - 어떤 실패든 이름만 모아 알린다
            failed.append(name)
            print(f'FAIL {name}: {e}')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
