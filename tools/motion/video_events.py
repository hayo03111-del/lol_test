"""영상에서 모션/이펙트 이벤트 시점을 추출한다(OpenCV + ffmpeg).

사용법:
  PYTHONPATH=<opencv/numpy 경로> python3 tools/motion/video_events.py <영상> <출력 JSON> [--frames-dir DIR] [--roi x,y,w,h] [--baseline 0.3,0.8]
  --baseline: 기준 시점(동기화 번쩍임, 없으면 영상 시작)부터 시전 전 대기 구간(초). 공식 영상은 구간을 직접 지정한다.

추출 지표(모두 영상 타임스탬프 기준, 초):
  - sync_flash: 화면 전체가 하얗게 번쩍인 프레임(측정용 동기화 표식. 공식 영상에는 보통 없음)
  - motion_onset: 정지 구간 뒤 움직임 에너지가 기준치(중앙값 + 4×MAD)를 처음 넘은 프레임 = 시전 시작 추정
  - motion_peaks: 움직임 에너지의 국소 최대(주요 모션 변화 추정)
  - effect_onsets: 밝은 픽셀(HSV V>=230) 면적이 급증한 프레임 = 투사체/피격 이펙트 출현 추정
프레임 타임스탬프는 컨테이너의 PTS(CAP_PROP_POS_MSEC)를 그대로 쓰고, 공칭 fps도 함께 기록한다.
이 값들은 "추정"이다 - 피해 판정 자체는 영상에 보이지 않으므로 피격 이펙트로 간접 추정할 뿐이다.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np


def ffmpeg_exe():
    if os.environ.get('FFMPEG'):
        return os.environ['FFMPEG']
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


def extract_frames(video, out_dir, fps=None):
    os.makedirs(out_dir, exist_ok=True)
    cmd = [ffmpeg_exe(), '-v', 'error', '-i', video]
    if fps:
        cmd += ['-vf', f'fps={fps}']
    cmd += ['-frame_pts', '1', os.path.join(out_dir, 'f_%06d.png')]
    subprocess.run(cmd, check=True)


def analyze(video, roi=None, baseline=(0.3, 0.8)):
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise RuntimeError('영상을 열 수 없음: ' + video)
    nominal_fps = cap.get(cv2.CAP_PROP_FPS) or 0
    ts, motion, bright, mean_lum = [], [], [], []
    prev = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if roi:
            x, y, w, h = roi
            frame = frame[y:y + h, x:x + w]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        ts.append(t)
        mean_lum.append(float(gray.mean()) / 255.0)
        bright.append(float((hsv[:, :, 2] >= 230).mean()))
        motion.append(0.0 if prev is None else float(cv2.absdiff(gray, prev).mean()) / 255.0)
        prev = gray
    cap.release()
    ts = np.array(ts); motion = np.array(motion); bright = np.array(bright); mean_lum = np.array(mean_lum)
    n = len(ts)
    if n < 3:
        raise RuntimeError('프레임이 너무 적음')
    # PTS가 비어 있으면 공칭 fps로 대체
    if not np.any(ts > 0) and nominal_fps:
        ts = np.arange(n) / nominal_fps
    dts = np.diff(ts)
    measured_fps = float(1.0 / np.median(dts)) if len(dts) and np.median(dts) > 0 else nominal_fps

    events = {}
    flash = np.where(mean_lum > 0.9)[0]
    events['sync_flash'] = [{'frame': int(i), 't': round(float(ts[i]), 4)} for i in _group(flash)]
    # 기준 구간: 마지막 동기화 번쩍임 이후(영상 앞부분의 로딩 화면 등은 통계에서 제외).
    start = (events['sync_flash'][-1]['frame'] + 4) if events['sync_flash'] else 1
    events['reference'] = events['sync_flash'][-1] if events['sync_flash'] else {'frame': 0, 't': round(float(ts[0]), 4)}
    m = motion.copy()
    m[:start] = 0
    # 기준선: 기준 시점 뒤 baseline 구간(시전 전 대기 동작). 대기 동작의 최대 움직임보다 뚜렷이 큰 첫 프레임을
    # 시전 시작으로 본다 - 대기(숨쉬기) 모션을 시전으로 오검출하지 않기 위함.
    ref_t = events['reference']['t']
    bmask = (ts >= ref_t + baseline[0]) & (ts <= ref_t + baseline[1])
    if bmask.sum() >= 3:
        base = m[bmask]
        thr = max(float(base.max()) * 1.5, float(base.mean() + 5 * base.std()), 1e-4)
        start = max(start, int(np.argmax(ts > ref_t + baseline[1])))
    else:
        seg = m[start:] if n > start + 2 else m[1:]
        med = float(np.median(seg)); mad = float(np.median(np.abs(seg - med))) or 1e-6
        thr = max(med + 4 * mad, med * 3, 1e-4)
    onset = next((i for i in range(start, n) if m[i] > thr), None)
    events['motion_onset'] = None if onset is None else {'frame': int(onset), 't': round(float(ts[onset]), 4)}
    peaks = [i for i in range(max(start, 1), n - 1) if m[i] > thr and m[i] >= m[i - 1] and m[i] >= m[i + 1]]
    peaks = sorted(peaks, key=lambda i: -m[i])[:8]
    events['motion_peaks'] = sorted([{'frame': int(i), 't': round(float(ts[i]), 4), 'energy': round(float(m[i]), 5)} for i in peaks], key=lambda e: e['frame'])
    db = np.diff(bright, prepend=bright[0])
    dseg = db[start:] if n > start + 2 else db
    bmed = float(np.median(dseg)); bmad = float(np.median(np.abs(dseg - bmed))) or 1e-6
    bthr = max(bmed + 6 * bmad, 2e-4)
    eff = [i for i in range(start, n) if db[i] > bthr]
    events['effect_onsets'] = [{'frame': int(i), 't': round(float(ts[i]), 4), 'brightAreaDelta': round(float(db[i]), 5)} for i in _group(np.array(eff, dtype=int))][:8]
    return {
        'video': os.path.basename(video), 'frames': n, 'nominalFps': round(nominal_fps, 3), 'measuredFps': round(measured_fps, 3),
        'durationSec': round(float(ts[-1]), 4), 'frameTimeErrorSec': round(1.0 / measured_fps, 4) if measured_fps else None,
        'thresholds': {'motion': thr, 'brightDelta': bthr}, 'events': events,
        'series': {'t': [round(float(x), 4) for x in ts], 'motion': [round(float(x), 5) for x in motion], 'brightArea': [round(float(x), 5) for x in bright]},
    }


def _group(idx):
    """연속된 프레임 묶음의 첫 프레임만 남긴다."""
    out = []
    last = None
    for i in list(idx):
        if last is None or i > last + 1:
            out.append(int(i))
        last = i
    return out


def main():
    video, out = sys.argv[1], sys.argv[2]
    roi = None
    if '--roi' in sys.argv:
        roi = tuple(int(v) for v in sys.argv[sys.argv.index('--roi') + 1].split(','))
    baseline = (0.3, 0.8)
    if '--baseline' in sys.argv:
        baseline = tuple(float(v) for v in sys.argv[sys.argv.index('--baseline') + 1].split(','))
    res = analyze(video, roi, baseline)
    res['baselineWindowSec'] = baseline
    if '--frames-dir' in sys.argv:
        extract_frames(video, sys.argv[sys.argv.index('--frames-dir') + 1])
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    ev = res['events']
    print(res['video'], f"{res['frames']} frames @ {res['measuredFps']}fps", 'onset', ev['motion_onset'], 'flash', ev['sync_flash'][:2])


if __name__ == '__main__':
    main()
