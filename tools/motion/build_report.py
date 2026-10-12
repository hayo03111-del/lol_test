"""스킬별 모션/판정 타이밍 비교표(CSV + JSON) 생성.

입력(docs/motion/):
  glb_clips.json                 - GLB 클립 이름·길이(glb_clips.py)
  wiki_cast_times.json           - PC 위키 시전 시간(출처·상태 포함)
  video_sources.json             - 공식 영상 출처·확보 상태·실패 사유
  game_timing_events.json        - 브라우저 측정: 시전→최초 피해/투사체/시각효과(16ms 폴링)
  game_timing_clips_unlock.json  - 브라우저 측정: 재생 클립 순서·행동 잠금 해제 시각(8ms 폴링)
  video_events_<champ>_<slot>.json (있으면) - video_events.py로 공식 영상에서 뽑은 이벤트
출력: docs/motion/motion_timing.csv, docs/motion/motion_timing.json

지표는 서로 다른 것으로 취급한다: 위키 시전 시간 / 클립(모션) 길이 / 행동 잠금 해제 / 투사체 생성 / 최초 피해.
확인되지 않은 값은 비워 두고 상태 칸에 사유를 적는다(실측값으로 표시하지 않음).
"""
import csv
import json
import os
import sys

D = sys.argv[1] if len(sys.argv) > 1 else 'docs/motion'
load = lambda n: json.load(open(os.path.join(D, n), encoding='utf-8'))
glb = load('glb_clips.json'); wiki = load('wiki_cast_times.json'); vids = load('video_sources.json')
ev = load('game_timing_events.json'); cu = load('game_timing_clips_unlock.json')
champ_data_names = {}
try:
    import re
    src = open('src/champions/champion_data.js', encoding='utf-8').read()
    for cid in glb:
        m = re.search(r'\n  ' + cid + r': \{(.*?)\n  \w+: \{', src, re.S)
        block = m.group(1) if m else ''
        for s in 'QWER':
            mm = re.search(r'\n    ' + s + r': \{\s*(?://[^\n]*\n\s*)*name: \'([^\']+)\'', block)
            champ_data_names[(cid, s)] = mm.group(1) if mm else ''
except Exception:
    pass

# 피해가 없는 것이 정상인 스킬(원작 기준) - 피해 미발생을 버그로 표시하지 않기 위함
NO_DAMAGE_EXPECTED = {('garen', 'W'), ('masteryi', 'W'), ('masteryi', 'E'), ('masteryi', 'R'), ('leesin', 'W'), ('nautilus', 'W'),
                      ('yasuo', 'W'), ('yasuo', 'R'), ('yone', 'E'), ('sett', 'Q'), ('mordekaiser', 'W'), ('mordekaiser', 'R'),
                      ('nilah', 'W'), ('chogath', 'E'), ('ezreal', 'W'), ('ashe', 'Q'), ('ashe', 'E'), ('varus', 'W'), ('darius', 'E')}
# 코드 확인으로 원인이 밝혀진 항목(측정값만으로는 알 수 없는 것)
INVESTIGATED = {
    ('vex', 'W'): '전용 구현 없음: 공용 대체 경로가 선택 대상에게 고정 피해만 줌(범위·보호막·둔화 없음). 측정 시 대상 미선택이라 피해 0',
    ('vex', 'E'): '전용 구현 없음: 공용 대체 경로(선택 대상 고정 피해) - 범위·둔화·우울 표식 없음',
    ('vex', 'Q'): '전용 구현 없음: 공용 직선 판정 대체 경로',
    ('chogath', 'W'): '부채꼴 판정 방향이 조준(마우스) 방향이 아니라 캐릭터의 현재 바라보는 방향 - 측정 시 빗나감',
    ('renekton', 'Q'): '피해 시점을 클립 길이×0.62 타이머로 정함 - 위키는 시전 시간 없음(즉시)',
    ('nilah', 'Q'): '위키 0.35~0.28초인데 측정 1.14초 - 원인 조사 필요',
}
COND = 'Chromium 1194(swiftshader) 240x135, 약 46fps, 게임 시간/실제 시간 1.016, 측정 오차 ≈ ±(프레임 22ms + 폴링 간격)'
rows = []
for cid in glb:
    clips = {c['name']: c['durationSec'] for c in glb[cid]['clips']}
    for s in 'QWER':
        w = wiki.get(cid, {}).get(s, {}); v = vids.get(cid, {}).get(s, {})
        e = ev.get(cid, {}).get(s, {}); u = cu.get(cid, {}).get(s, {})
        seq = [x for x in (u.get('clips') or []) if x]
        first = u.get('clip')
        clip_sec = clips.get(first)
        dmg = e.get('dmgMs'); proj = e.get('projectileMs'); unlock = u.get('unlockMs')
        vfx = next((x['ms'] for x in (e.get('events') or []) if x['k'].startswith('vfx:')), None)
        cast = w.get('castTimeSec')
        flags = []
        if cast is not None and dmg is not None and dmg + 40 < cast * 1000:
            flags.append('피해가 위키 시전 시간보다 먼저 발생')
        if dmg is None and (cid, s) not in NO_DAMAGE_EXPECTED:
            flags.append('측정 중 피해 미발생(버그 또는 측정 조건 확인 필요)')
        if cast is not None and dmg is not None and dmg - cast * 1000 > 400 and proj is None:
            flags.append('투사체 없이 시전 시간보다 0.4초 이상 늦게 피해')
        if cast is not None and proj is not None and proj + 40 < cast * 1000:
            flags.append('투사체가 위키 시전 시간보다 먼저 생성')
        if clip_sec and unlock and unlock > clip_sec * 1000 + 300:
            flags.append('행동 잠금이 클립 길이보다 0.3초 이상 김')
        vid_file = os.path.join(D, f'video_events_{cid}_{s}.json')
        video_onset = None
        if os.path.exists(vid_file):
            ve = json.load(open(vid_file, encoding='utf-8'))
            if ve.get('events', {}).get('motion_onset'):
                video_onset = ve['events']['motion_onset']['t']
        status = w.get('status', 'unknown')
        conf = 'high' if status == 'confirmed' and dmg is not None else ('medium' if status in ('confirmed', 'confirmed-db', 'conflict') else 'low')
        rows.append({
            'champion': cid, 'skill': s, 'skillName': champ_data_names.get((cid, s), ''),
            'videoUrl': v.get('url', ''), 'videoUrlStatus': v.get('urlStatus', ''), 'videoMeta': v.get('metadata', ''), 'videoSegment': v.get('segment', ''),
            'videoMediaStatus': v.get('mediaStatus', ''), 'videoFailureReason': v.get('failureReason', ''), 'videoMotionOnsetSec': video_onset,
            'glbFirstClip': first or '', 'glbFirstClipSec': clip_sec, 'glbClipSequence': ' > '.join(seq),
            'wikiCastTimeSec': cast, 'wikiStatus': status, 'wikiSource': w.get('source', ''), 'wikiNote': w.get('note', ''),
            'gameFirstVfxMs': vfx, 'gameProjectileMs': proj, 'gameFirstDamageMs': dmg, 'gameUnlockMs': unlock,
            'damageMinusWikiCastMs': (None if (dmg is None or cast is None) else round(dmg - cast * 1000)),
            'measurementConditions': COND, 'confidence': conf, 'flags': '; '.join(flags), 'investigation': INVESTIGATED.get((cid, s), ''),
        })
with open(os.path.join(D, 'motion_timing.json'), 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
with open(os.path.join(D, 'motion_timing.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    wr = csv.DictWriter(f, fieldnames=list(rows[0].keys())); wr.writeheader(); wr.writerows(rows)
print(len(rows), 'rows ->', os.path.join(D, 'motion_timing.csv'))
