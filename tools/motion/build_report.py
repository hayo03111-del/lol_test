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
    ('vex', 'Q'): '7차에서 전용 구현(가속 파동, 관통). 위 측정값은 7차 수정 후 값',
    ('vex', 'W'): '7차에서 전용 구현(보호막 + 반경 피해, 시전 중 이동 가능). 잠금 해제가 짧은 것은 이동 허용 때문',
    ('vex', 'E'): '7차에서 전용 구현(지정 지점 폭발 + 둔화). 투사체 속도 1300은 추정값',
    ('chogath', 'W'): '7차에서 판정 방향을 조준(마우스) 방향으로 수정',
    ('renekton', 'Q'): '7차에서 즉시 판정 + 0.25초 평타 금지로 수정(위키: 시전 시간 없음)',
    ('nilah', 'Q'): '7차에서 판정을 시전 시간(0.35~0.28초)으로 옮김. 남은 모션(nilahQTail)은 이동·평타·스킬로 언제든 끊김 - 잠금 플래그는 실제 행동 제약 아님',
    ('nilah', 'R'): '8차 확인: 채널 내내 이동 가능(canMove=true), 평타·스킬만 막힘. 코드상 잠금 = 선딜 0.16 + 채널 1.0 + 종료 후 0.12~0.32초. 측정 2.2초는 저프레임(17fps)에서 프레임당 dt 0.05초 제한으로 채널이 실제 약 1.75초 걸린 측정 조건 영향. 종료 후 0.32초 잠금의 원작 근거는 미확인',
    ('garen', 'Q'): '8차 수정: 강화 평타 오버라이드에 cancelToMove/cancelToSpell이 없어 적중 후 후딜(공격속도 기준 약 1.2초) 동안 이동이 대기열에만 쌓였음 → 일반 평타처럼 취소 허용. 측정의 잠금 해제값은 입력 없이 둔 경우라 그대로이며, 브라우저에서 후딜 시작 시 이동 명령이 즉시 반영되는 것 확인',
    ('darius', 'W'): '8차 수정(가렌 Q와 같은 원인): 강화 평타 후딜 중 이동·스킬 취소 허용. 브라우저에서 확인',
    ('mordekaiser', 'R'): '8차 확인: 코드상 잠금 = 시전 0.5초(위키) + 엔진 여유 0.15초 = 0.65초. 측정 0.97초와의 차이는 setTimeout 지연(swiftshader 부하)으로 판단 - 실제 GPU 브라우저에서는 미확인',
}
VIDEO_METHOD = 'video_events.py: 프레임 차분 움직임 에너지(시전 시작·모션 피크) + HSV V>=230 밝은 영역 증가(이펙트 출현). 검증: 자체 녹화 6건 중 이펙트 4건 ±70ms, 시전 시작 2건 검출 실패'
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
        video_onset = None; video_peaks = ''; video_effect = None
        if os.path.exists(vid_file):
            ve = json.load(open(vid_file, encoding='utf-8'))
            vev = ve.get('events', {})
            if vev.get('motion_onset'):
                video_onset = vev['motion_onset']['t']
            video_peaks = ' '.join(str(p['t']) for p in (vev.get('motion_peaks') or []))
            if vev.get('effect_onsets'):
                video_effect = vev['effect_onsets'][0]['t']
            video_status = '분석됨(영상 시각 기준, 게임 측정과 기준점 정렬 전 - 신뢰도 low)'
        else:
            video_status = '미비교: 영상 미확보 - ' + (v.get('mediaStatus') or '상태 없음')
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
            # 영상 비교 칸(뒤에 추가 - 기존 칸 순서 유지). 영상에서 관찰한 이펙트 출현은 실제 피해 판정과 같은 값으로 취급하지 않는다.
            'videoMotionPeaksSec': video_peaks, 'videoObservedEffectSec': video_effect,
            'videoComparisonStatus': video_status, 'videoAnalysisMethod': VIDEO_METHOD if video_onset is not None or video_effect is not None else '',
        })
with open(os.path.join(D, 'motion_timing.json'), 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
with open(os.path.join(D, 'motion_timing.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    wr = csv.DictWriter(f, fieldnames=list(rows[0].keys())); wr.writeheader(); wr.writerows(rows)
print(len(rows), 'rows ->', os.path.join(D, 'motion_timing.csv'))
