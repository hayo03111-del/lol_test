#!/usr/bin/env python3
"""룬 데이터·아이콘 받기(52차) - assets/runes/<룬 id>.png, assets/runes/tree_<id>.png, assets/runes/shard_<이름>.png
+ src/core/rune_meta.js(RUNE_TREES: 5개 빌드·줄·룬 한글 이름·짧은 설명, RUNE_SHARDS: 능력치 파편 3줄).

Data Dragon GitHub 미러(noxelisdev/LoL_DDragon, latest)의 ko_KR runesReforged.json과 perk-images 그림을 쓴다.
사용법: python3 tools/fetch_rune_data.py
"""
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'runes')
MIRROR = 'https://raw.githubusercontent.com/noxelisdev/LoL_DDragon/master'
# 능력치 파편(현재 원작 3줄) - 값은 src/core/rune_system.js RUNE_SHARD_EFFECTS
SHARDS = [
    [('adaptive', 'StatModsAdaptiveForceIcon', '적응형 능력치 +9'), ('as', 'StatModsAttackSpeedIcon', '공격 속도 +10%'), ('ah', 'StatModsCDRScalingIcon', '스킬 가속 +8')],
    [('adaptive', 'StatModsAdaptiveForceIcon', '적응형 능력치 +9'), ('ms', 'StatModsMovementSpeedIcon', '이동 속도 +2%'), ('hpScale', 'StatModsHealthScalingIcon', '체력 +10~180(레벨 비례)')],
    [('hp', 'StatModsHealthPlusIcon', '체력 +65'), ('tenacity', 'StatModsTenacityIcon', '강인함 및 둔화 저항 +10%'), ('hpScale', 'StatModsHealthScalingIcon', '체력 +10~180(레벨 비례)')],
]


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def clean(t):
    t = re.sub(r'<br\s*/?>', ' ', t or '')
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', t)).strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    trees = json.loads(fetch(f'{MIRROR}/latest/data/ko_KR/runesReforged.json'))
    jobs, out_trees = [], []
    for t in trees:
        jobs.append((f'tree_{t["id"]}.png', t['icon']))
        slots = []
        for s in t['slots']:
            row = []
            for r in s['runes']:
                jobs.append((f'{r["id"]}.png', r['icon']))
                row.append({'id': r['id'], 'key': r['key'], 'name': r['name'], 'desc': clean(r['shortDesc'])})
            slots.append(row)
        out_trees.append({'id': t['id'], 'key': t['key'], 'name': t['name'], 'slots': slots})
    shard_rows = []
    for row in SHARDS:
        r = []
        for key, file, label in row:
            jobs.append((f'shard_{key}.png', f'perk-images/StatMods/{file}.png'))
            r.append({'key': key, 'name': label})
        shard_rows.append(r)

    def get(job):
        name, path = job
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(fetch(f'{MIRROR}/img/{path}'))
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(get, jobs))
    try:  # 원본은 256px - HUD·로비에는 96px면 충분(용량 1/10)
        from PIL import Image
        for name, _ in jobs:
            p = os.path.join(OUT, name)
            im = Image.open(p)
            if im.width > 96:
                im.convert('RGBA').resize((96, 96), Image.LANCZOS).save(p, optimize=True)
    except ImportError:
        pass
    with open(os.path.join(ROOT, 'src', 'core', 'rune_meta.js'), 'w', encoding='utf8') as f:
        f.write('// 자동 생성(tools/fetch_rune_data.py) - Data Dragon ko_KR runesReforged.json. 아이콘: assets/runes/<id>.png, tree_<id>.png, shard_<key>.png\n')
        f.write('const RUNE_TREES = ' + json.dumps(out_trees, ensure_ascii=False, indent=1) + ';\n')
        f.write('const RUNE_SHARD_ROWS = ' + json.dumps(shard_rows, ensure_ascii=False, indent=1) + ';\n')
    print(f'룬 빌드 {len(out_trees)}개, 그림 {len(jobs)}개')


if __name__ == '__main__':
    main()
