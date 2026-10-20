#!/usr/bin/env python3
"""89차: 원작 파티클 엔진(src/vfx)의 기본값 표를 만든다.

LeagueToolkit/lol-meta-wiki의 db/meta.db.json(게임 클라이언트에서 뽑은 클래스·필드·기본값 목록)에서 VFX 관련 클래스의
최신 판 필드 기본값을 읽어 src/vfx/lol_vfx_defaults.js로 쓴다. bin 파일은 기본값과 다른 필드만 담기 때문에, 엔진은
이 표로 빠진 필드를 채운다(예: particleLifetime 3초, alphaRef 5, isLocalOrientation 켜짐).
사용법: python3 tools/gen_lol_vfx_defaults.py <meta.db.json 경로>
"""
import json, sys, os

PREFIXES = ('Vfx', 'Value', 'IntegratedValue', 'Flex')
db = json.load(open(sys.argv[1]))
classes = db['classes']
byhash = {k: c.get('name') or k for k, c in classes.items()}
out = {}
for k, c in classes.items():
    name = c.get('name')
    if not name or not name.startswith(PREFIXES):
        continue
    rev = c['revisions'][-1]
    if rev.get('to'):
        continue
    fields, types = {}, {}
    # 부모 클래스 필드도 물려받는다(예: IntegratedValueFloat ← ValueFloat)
    chain, seen = [k], set()
    while chain:
        ck = chain.pop()
        if ck in seen or ck not in classes:
            continue
        seen.add(ck)
        cc = classes[ck]
        for pk, p in cc.get('properties', {}).items():
            r = p['revisions'][-1]
            if r.get('to'):
                continue
            fname = p.get('name') or pk
            if fname in fields:
                continue
            fields[fname] = r.get('default')
            t = r.get('type') or []
            kind = t[0] if t else None
            ref = next((x for x in t[1:] if isinstance(x, str) and x.startswith('0x') and x != '0x0'), None)
            types[fname] = [kind, byhash.get(ref) if ref else None, t[2] if len(t) > 2 and t[2] not in ('0x0',) else None]
        chain.extend(cc['revisions'][-1].get('bases') or [])
    out[name] = {'bases': [byhash.get(b, b) for b in (rev.get('bases') or [])], 'defaults': fields, 'types': types}

dst = os.path.join(os.path.dirname(__file__), '..', 'src', 'vfx', 'lol_vfx_defaults.js')
with open(dst, 'w') as f:
    f.write('// 89차: tools/gen_lol_vfx_defaults.py가 lol-meta-wiki의 meta.db.json에서 만든 표 - 손으로 고치지 말 것.\n')
    f.write('// 원작 VFX 클래스별 필드 기본값(defaults)과 필드 종류(types: [종류, 참조 클래스, 원소 종류])와 부모 클래스(bases).\n')
    f.write('const LOL_VFX_SCHEMA = ' + json.dumps(out, separators=(',', ':'), sort_keys=True) + ';\n')
print('classes:', len(out), '->', os.path.normpath(dst), os.path.getsize(dst), 'bytes')
