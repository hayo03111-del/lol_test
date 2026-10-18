#!/usr/bin/env python3
"""챔피언 패시브·스킬 아이콘 받기(48차) - assets/champion_icons/<챔피언 id>/{icon,P,Q,W,E,R}.png + meta.json
(+ 50차: 능력치 칸 아이콘 assets/stat_icons/<이름>.png - 원작 능력치 아이콘, noxelisdev/LoL_DDragon extras/statistics)

Data Dragon GitHub 미러(InFinity54/LoL_DDragon, latest)의 champion/<Key>.json(ko_KR)에서 패시브·스킬 그림 파일명과
한글 패시브 이름·설명을 읽어 아이콘(64x64 png)을 받는다. meta.json에는 패시브 이름·설명(HUD 툴팁용)을 적는다.

사용법: python3 tools/fetch_champion_icons.py
"""
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'champion_icons')
MIRROR = 'https://raw.githubusercontent.com/InFinity54/LoL_DDragon/master/latest'
# 이 프로젝트의 챔피언 id → Data Dragon 키
CHAMPS = {
    'garen': 'Garen', 'darius': 'Darius', 'masteryi': 'MasterYi', 'leesin': 'LeeSin', 'nautilus': 'Nautilus', 'yasuo': 'Yasuo',
    'yone': 'Yone', 'sett': 'Sett', 'mordekaiser': 'Mordekaiser', 'renekton': 'Renekton', 'nilah': 'Nilah', 'chogath': 'Chogath',
    'ezreal': 'Ezreal', 'ashe': 'Ashe', 'varus': 'Varus', 'ahri': 'Ahri', 'vex': 'Vex', 'rammus': 'Rammus', 'lux': 'Lux',
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def clean(text):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', text or '')).strip()


def one(item):
    cid, key = item
    data = json.loads(fetch(f'{MIRROR}/data/ko_KR/champion/{key}.json'))['data'][key]
    d = os.path.join(OUT, cid)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'icon.png'), 'wb') as f:  # 초상화(정사각형 챔피언 그림)
        f.write(fetch(f'{MIRROR}/img/champion/{data["image"]["full"]}'))
    with open(os.path.join(d, 'P.png'), 'wb') as f:
        f.write(fetch(f'{MIRROR}/img/passive/{data["passive"]["image"]["full"]}'))
    for slot, sp in zip('QWER', data['spells']):
        with open(os.path.join(d, f'{slot}.png'), 'wb') as f:
            f.write(fetch(f'{MIRROR}/img/spell/{sp["image"]["full"]}'))
    return cid, {'passiveName': data['passive']['name'], 'passiveDesc': clean(data['passive']['description']),
                 'spellNames': {s: sp['name'] for s, sp in zip('QWER', data['spells'])}}


# 50차: 능력치 칸 아이콘 - 원작 능력치 아이콘(Data Dragon에는 없고 noxelisdev/LoL_DDragon의 extras/statistics에 있다)
STATS_SRC = 'https://raw.githubusercontent.com/noxelisdev/LoL_DDragon/master/extras/statistics'
STAT_ICONS = ['ability_power', 'armor', 'armor_pen', 'attack_damage', 'attack_speed', 'cdr_reduction', 'critical_chance', 'health',
              'health_regen', 'life_steal', 'magic_pen', 'magic_resist', 'mana', 'mana_regen', 'move_speed', 'omnivamp', 'range', 'tenacity']


def main():
    os.makedirs(OUT, exist_ok=True)
    stat_dir = os.path.join(ROOT, 'assets', 'stat_icons')
    os.makedirs(stat_dir, exist_ok=True)
    for name in STAT_ICONS:
        with open(os.path.join(stat_dir, f'{name}.png'), 'wb') as f:
            f.write(fetch(f'{STATS_SRC}/{name}.png'))
    with ThreadPoolExecutor(6) as ex:
        meta = dict(ex.map(one, sorted(CHAMPS.items())))
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    # 파일로 바로 연 index.html(file://)에서도 쓰도록 소스로도 넣는다(빌드에 포함).
    with open(os.path.join(ROOT, 'src', 'core', 'champion_icon_meta.js'), 'w', encoding='utf8') as f:
        f.write('// 자동 생성(tools/fetch_champion_icons.py) - Data Dragon ko_KR 패시브 이름·설명, 스킬 이름. 아이콘: assets/champion_icons/<id>/{P,Q,W,E,R}.png\n')
        f.write('const CHAMPION_ICON_META = ' + json.dumps(meta, ensure_ascii=False, indent=1) + ';\n')
    print(f'{len(meta)}명 아이콘 저장')


if __name__ == '__main__':
    main()
