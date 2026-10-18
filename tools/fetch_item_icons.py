#!/usr/bin/env python3
"""아이템 아이콘 받기(35차) - assets/items/<아이템 id>.png  (+36차: 소환사 주문 assets/spells/<주문 id>.png)

ITEM_DATA(src/champions/item_data.js)의 한글 이름을 라이엇 Data Dragon(ko_KR item.json)의 이름과 맞춰
원작 아이템 번호를 찾고, 그 번호의 아이콘(64x64 png)을 받는다. 같은 이름이 여러 번호로 있으면
(아레나·무작위 총력전 등 모드별 사본) 소환사의 협곡 > 칼바람 > 구매 가능 > 작은 번호 순으로 고른다.
이름이 원작과 달라 자동으로 못 맞추는 것은 아래 MANUAL에 번호를 직접 적었다.

Data Dragon 본 서버(ddragon.leagueoflegends.com)가 막힌 환경을 위해 GitHub 미러
(InFinity54/LoL_DDragon, latest)에서 받는다. 사용자가 직접 준 그림이 assets/items/_user/<id>.webp에
있으면 그것을 128x128로 줄여 대신 쓴다(도란 아이템 5종 - 원작과 같은 그림의 고해상도본).

사용법: python3 tools/fetch_item_icons.py   (node, Pillow 필요)
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'items')
USER_DIR = os.path.join(OUT, '_user')
MIRROR = 'https://raw.githubusercontent.com/InFinity54/LoL_DDragon/master/latest'
# 이 프로젝트의 이름이 원작 한글 이름과 달라 자동으로 못 맞추는 것(원작 번호).
MANUAL = {
    'amplifyingTome': '1052',     # 증폭의 고서
    'maw': '3156',                # 맬모셔스의 아귀
    'brokenWristGuard': '2421',   # 부서진 팔목 보호대
    'banshees': '3102',           # 밴시의 장막
    'ironSolariLocket': '3190',   # 강철의 솔라리 펜던트
    'chainVest': '1029',          # 천 갑옷(이 프로젝트 id는 chainVest지만 능력치·이름은 천 갑옷)
}


# 36차: 소환사 주문(src/core/summoner_spells.js의 id → Data Dragon 이름).
SPELLS = {
    'flash': 'SummonerFlash', 'heal': 'SummonerHeal', 'ghost': 'SummonerHaste', 'barrier': 'SummonerBarrier',
    'exhaust': 'SummonerExhaust', 'ignite': 'SummonerDot', 'cleanse': 'SummonerBoost', 'clarity': 'SummonerMana',
    'mark': 'SummonerSnowball',
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def our_items():
    js = (
        "const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);"
        f"vm.runInContext(fs.readFileSync({json.dumps(os.path.join(ROOT, 'src/champions/item_data.js'))},'utf8')+';this.D=ITEM_DATA;',c);"
        "console.log(JSON.stringify(Object.fromEntries(Object.entries(c.D).map(([k,v])=>[k,v.nameKo]))));"
    )
    return json.loads(subprocess.check_output(['node', '-e', js]))


def main():
    from PIL import Image
    ko = json.loads(fetch(f'{MIRROR}/data/ko_KR/item.json'))['data']
    norm = lambda s: re.sub(r"[\s'’:.\-·,()]", '', s).lower()
    by_name = {}
    for num, it in ko.items():
        by_name.setdefault(norm(it['name']), []).append(num)

    def rank(num):
        it = ko[num]
        maps = it.get('maps', {})
        return (not maps.get('11'), not maps.get('12'), not it.get('gold', {}).get('purchasable'), int(num))

    mapping, missing = {}, []
    for key, name in our_items().items():
        if key in MANUAL:
            mapping[key] = MANUAL[key]
            continue
        cands = by_name.get(norm(name))
        if not cands:
            missing.append(f'{key} ({name})')
            continue
        mapping[key] = sorted(cands, key=rank)[0]

    os.makedirs(OUT, exist_ok=True)

    def save(item):
        key, num = item
        dest = os.path.join(OUT, f'{key}.png')
        user = os.path.join(USER_DIR, f'{key}.webp')
        if os.path.exists(user):
            Image.open(user).convert('RGB').resize((128, 128), Image.LANCZOS).save(dest, optimize=True)
            return key, 'user'
        with open(dest, 'wb') as f:
            f.write(fetch(f'{MIRROR}/img/item/{num}.png'))
        return key, 'ddragon'

    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(save, sorted(mapping.items())))
    with open(os.path.join(OUT, 'mapping.json'), 'w', encoding='utf8') as f:
        json.dump({k: {'riotItemId': v, 'riotNameKo': ko[v]['name']} for k, v in sorted(mapping.items())}, f, ensure_ascii=False, indent=1)
    print(f'{len(results)}개 저장 (직접 준 그림 {sum(1 for _, s in results if s == "user")}개)')
    spell_dir = os.path.join(ROOT, 'assets', 'spells')
    os.makedirs(spell_dir, exist_ok=True)
    for sid, dd in SPELLS.items():
        with open(os.path.join(spell_dir, f'{sid}.png'), 'wb') as f:
            f.write(fetch(f'{MIRROR}/img/spell/{dd}.png'))
    print(f'소환사 주문 아이콘 {len(SPELLS)}개 저장')
    if missing:
        print('이름을 못 맞춘 아이템(MANUAL에 추가 필요):', ', '.join(missing))
        sys.exit(1)


if __name__ == '__main__':
    main()
