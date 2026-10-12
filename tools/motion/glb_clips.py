"""GLB 애니메이션 클립 이름·길이 파서.

사용법: python3 tools/motion/glb_clips.py <출력 JSON> <챔피언ID=파일.glb> ...
클립 길이는 glTF animation sampler의 input accessor(시간축) max 값의 최댓값이다(초 단위, 파일에 기록된 그대로).
GLB 파일 자체는 저장소에 넣지 않는다 - 결과 JSON만 남긴다.
"""
import json
import struct
import sys


def parse_glb(path):
    b = open(path, 'rb').read()
    magic, _version, _length = struct.unpack('<4sII', b[:12])
    if magic != b'glTF':
        raise ValueError('not a GLB: ' + path)
    chunk_len = struct.unpack('<I', b[12:16])[0]
    gltf = json.loads(b[20:20 + chunk_len])
    accessors = gltf.get('accessors', [])
    clips = []
    for anim in gltf.get('animations', []):
        dur = 0.0
        for sampler in anim.get('samplers', []):
            acc = accessors[sampler['input']]
            if acc.get('max'):
                dur = max(dur, float(acc['max'][0]))
        clips.append({'name': anim.get('name', ''), 'durationSec': round(dur, 4), 'channels': len(anim.get('channels', []))})
    return {'file': path.split('/')[-1], 'clipCount': len(clips), 'clips': clips}


def main():
    out = sys.argv[1]
    result = {}
    for arg in sys.argv[2:]:
        cid, path = arg.split('=', 1)
        result[cid] = parse_glb(path)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print('parsed', len(result), 'GLB files ->', out)


if __name__ == '__main__':
    main()
