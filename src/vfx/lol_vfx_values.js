/* lol_vfx_values.js — 89차: 원작 파티클 값 계산(THREE 없이 순수 계산 - 단위 테스트 대상)
 * 의미는 lol-meta-wiki의 VfxEmitterDefinitionData 문서("Animated values", "Clocks", 각 필드 설명)를 그대로 따른다.
 *  - 값(ValueFloat/Vector2/3/Color): dynamics가 있으면 곡선(times/values, 선형 보간, 양끝 고정)이 값이고 scalar의 constantValue는 무시,
 *    없으면 constantValue. 곡선 결과에 채널별 확률표(probabilityTables)를 곱한다(무작위 수로 keyTimes→keyValues 보간, 표가 비면 singleValue).
 *  - 적분값(IntegratedValue*: rotation0, worldAcceleration, particleUVScrollRate, particleUVRotateRate): dynamics 곡선만 수명에 걸쳐 적분한다.
 *    constantValue만 있으면 "평생 고정량"(constantValue × 수명, 가속은 × 수명²)이다.
 */
// 확률표 하나: 무작위 수 r(0..1)로 곱할 값을 찾는다.
function lolVfxProbability(table, r) {
  if (!table) return 1;
  const kt = table.keyTimes || [], kv = table.keyValues || [];
  if (!kt.length || !kv.length) return table.singleValue != null ? table.singleValue : 1;
  return lolVfxCurve1(kt, kv, r);
}
// 스칼라 곡선 보간(양끝 고정)
function lolVfxCurve1(times, values, t) {
  const n = Math.min(times.length, values.length);
  if (n === 0) return 0;
  if (n === 1 || t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  for (let i = 1; i < n; i++) {
    if (t <= times[i]) {
      const t0 = times[i - 1], t1 = times[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      return values[i - 1] + (values[i] - values[i - 1]) * f;
    }
  }
  return values[n - 1];
}
// 값의 채널 수(0이면 스칼라)
function lolVfxDims(v) {
  const c = v && v.constantValue;
  if (Array.isArray(c)) return c.length;
  const d = v && v.dynamics && v.dynamics.values && v.dynamics.values[0];
  return Array.isArray(d) ? d.length : 0;
}
// 값 하나를 t에서 샘플링. rnd: 채널별 무작위 수를 주는 함수(i => 0..1). 스칼라는 숫자, 벡터는 배열을 돌려준다.
function lolVfxSample(v, t, rnd, fallback) {
  if (v == null) return fallback;
  const dyn = v.dynamics;
  const dims = lolVfxDims(v);
  if (dyn && dyn.values && dyn.values.length) {
    const times = dyn.times || [], tables = dyn.probabilityTables || [];
    if (dims === 0) {
      const base = lolVfxCurve1(times, dyn.values, t);
      return base * (tables[0] ? lolVfxProbability(tables[0], rnd ? rnd(0) : Math.random()) : 1);
    }
    const out = new Array(dims);
    for (let c = 0; c < dims; c++) {
      const col = dyn.values.map((x) => x[c]);
      out[c] = lolVfxCurve1(times, col, t) * (tables[c] ? lolVfxProbability(tables[c], rnd ? rnd(c) : Math.random()) : 1);
    }
    return out;
  }
  const c = v.constantValue;
  if (c == null) return fallback;
  return Array.isArray(c) ? c.slice() : c;
}
// 적분값: 수명 lifeSec 동안 age 비율 t까지 누적한 양(속도 곡선의 적분, 단위는 원래 값 × 초).
// dynamics가 없으면 constantValue × lifeSec(고정량, 움직이지 않는다).
function lolVfxIntegrate(v, t, lifeSec, rnd) {
  const dims = lolVfxDims(v);
  const zero = dims ? new Array(dims).fill(0) : 0;
  if (v == null) return zero;
  const dyn = v.dynamics;
  if (!(dyn && dyn.values && dyn.values.length)) {
    const c = v.constantValue;
    if (c == null) return zero;
    return Array.isArray(c) ? c.map((x) => x * lifeSec) : c * lifeSec;
  }
  if (!(lifeSec > 0) || !Number.isFinite(lifeSec)) return zero; // 수명이 무한이면 적분값은 쓰지 않는다(문서: 유한 수명이 필요)
  const times = dyn.times || [], tables = dyn.probabilityTables || [];
  const integ1 = (vals) => { // 구간별 사다리꼴 적분(곡선 자체가 선형이라 정확)
    const n = Math.min(times.length, vals.length);
    const f = (x) => lolVfxCurve1(times, vals, x);
    const pts = [0];
    for (let i = 0; i < n; i++) if (times[i] > 0 && times[i] < t) pts.push(times[i]);
    pts.push(t);
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += (f(pts[i - 1]) + f(pts[i])) * 0.5 * (pts[i] - pts[i - 1]);
    return s * lifeSec;
  };
  if (dims === 0) return integ1(dyn.values) * (tables[0] ? lolVfxProbability(tables[0], rnd ? rnd(0) : Math.random()) : 1);
  const out = new Array(dims);
  for (let c = 0; c < dims; c++) out[c] = integ1(dyn.values.map((x) => x[c])) * (tables[c] ? lolVfxProbability(tables[c], rnd ? rnd(c) : Math.random()) : 1);
  return out;
}
// 두 번 적분(worldAcceleration → 변위). dynamics가 없으면 constantValue × 수명²의 고정 변위.
function lolVfxIntegrate2(v, t, lifeSec) {
  const dims = lolVfxDims(v) || 3;
  if (v == null) return new Array(dims).fill(0);
  const dyn = v.dynamics;
  if (!(dyn && dyn.values && dyn.values.length)) {
    const c = v.constantValue || [0, 0, 0];
    return c.map((x) => x * lifeSec * lifeSec);
  }
  if (!(lifeSec > 0) || !Number.isFinite(lifeSec)) return new Array(dims).fill(0);
  const steps = 32, out = new Array(dims).fill(0);
  for (let c = 0; c < dims; c++) {
    const vals = dyn.values.map((x) => x[c]);
    let vel = 0, pos = 0, prevA = lolVfxCurve1(dyn.times, vals, 0);
    for (let k = 1; k <= steps; k++) {
      const x = t * k / steps, a = lolVfxCurve1(dyn.times, vals, x), dx = (t / steps) * lifeSec;
      const newVel = vel + (prevA + a) * 0.5 * dx;
      pos += (vel + newVel) * 0.5 * dx; vel = newVel; prevA = a;
    }
    out[c] = pos;
  }
  return out;
}

// 에미터 위상: (시스템 시각 - timeBeforeFirstEmission) / D, D는 lifetime·timeActiveDuringPeriod·period 중 설정된 가장 작은 값(없으면 0).
function lolVfxEmitterPhase(em, systemTime) {
  const cands = [em.lifetime, em.timeActiveDuringPeriod, em.period].filter((x) => x != null && x > 0);
  if (!cands.length) return 0;
  return (systemTime - (em.timeBeforeFirstEmission || 0)) / Math.min(...cands);
}
// 이 시각에 방출할 수 있는가(문서 "Emission"): 첫 방출 전·끝난 뒤·주기 밖이면 안 된다.
function lolVfxCanEmit(em, systemTime) {
  if (systemTime < (em.timeBeforeFirstEmission || 0)) return false;
  if (em.lifetime != null && em.lifetime >= 0 && systemTime > em.lifetime) return false;
  if (em.timeActiveDuringPeriod != null) {
    if (!(em.timeActiveDuringPeriod > 0)) return false;
    const local = em.period != null && em.period > 0 ? systemTime % em.period : systemTime;
    if (local >= em.timeActiveDuringPeriod) return false;
  }
  return true;
}
// 한 단계에 낼 입자 수: (지난 방출 뒤 흐른 시간 × rate)를 내림, 한 단계 최대 rate*0.33+1, 전체 1000.
function lolVfxEmitCount(rate, accumSec, firstEmission, hasVariableStartTime) {
  let n = Math.floor(accumSec * rate);
  n = Math.min(n, Math.floor(rate * 0.33 + 1), 1000);
  if (firstEmission && n <= 0 && !hasVariableStartTime) n = 1;
  return Math.max(0, n);
}
// EffectsQuality(0 아주 낮음 … 4 아주 높음)별 importance 존재 여부·방출 배율(문서 표 그대로).
function lolVfxImportanceExists(importance, quality) {
  const none = [[0, 1, 5], [0, 1, 5], [0, 1], [0, 4], [4]][quality];
  return !none.includes(importance);
}
function lolVfxImportanceRate(importance, quality) {
  const table = [[0.05, 0.10, 0.20], [0.10, 0.20, 0.40], [0.20, 0.40, 0.60], [0.50, 1, 1], [1, 1, 1]][quality];
  return importance <= 2 ? table[importance] : 1;
}
// 회전 합성: Z → X → Y 순서(도). 3x3 행렬(행 우선)로 돌려준다.
function lolVfxEulerZXY(deg) {
  const r = Math.PI / 180, [ax, ay, az] = [deg[0] * r, deg[1] * r, deg[2] * r];
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  return lolVfxMat3Mul(Ry, lolVfxMat3Mul(Rx, Rz)); // 먼저 Z, 다음 X, 마지막 Y
}
function lolVfxMat3Mul(a, b) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
function lolVfxMat3Apply(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
function lolVfxAxisAngle(axis, deg) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1, x = axis[0] / l, y = axis[1] / l, z = axis[2] / l, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
// 생성 모양(SpawnShape): { offset:[x,y,z], rot: 3x3 } - 회전은 오프셋·속도·가속을 함께 돌린다. rand()는 0..1.
function lolVfxSampleShape(shape, phase, rand) {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (!shape) return { offset: [0, 0, 0], raw: [0, 0, 0], rot: I };
  const fill = ((shape.flags || 0) & 1) !== 0;
  const t = shape.__type;
  if (t === 'VfxShapeLegacy') {
    const off = lolVfxSample(shape.emitOffset, phase, () => rand(), [0, 0, 0]) || [0, 0, 0];
    let rot = I;
    const angles = shape.emitRotationAngles || [], axes = shape.emitRotationAxes || [];
    for (let i = 0; i < angles.length && i < axes.length; i++) rot = lolVfxMat3Mul(lolVfxAxisAngle(axes[i], lolVfxSample(angles[i], phase, () => rand(), 0) || 0), rot);
    return { offset: lolVfxMat3Apply(rot, off), raw: off, rot };
  }
  if (t === 'VfxShapeBox') {
    const s = shape.Size || [0, 0, 0];
    const off = [(rand() * 2 - 1) * s[0], (rand() * 2 - 1) * s[1], fill ? (rand() * 2 - 1) * s[2] : s[2]];
    let rot = I;
    if (!fill) rot = lolVfxMat3Mul(lolVfxAxisAngle([0, 0, 1], 90 * Math.floor(rand() * 4)), lolVfxAxisAngle([0, 1, 0], 90 * Math.floor(rand() * 4)));
    return { offset: lolVfxMat3Apply(rot, off), raw: off, rot };
  }
  if (t === 'VfxShapeCylinder') {
    const r = fill ? rand() * (shape.radius || 0) : (shape.radius || 0);
    const off = [r, rand() * (shape.height || 0), 0];
    const rot = lolVfxAxisAngle([0, 1, 0], rand() * 360);
    return { offset: lolVfxMat3Apply(rot, off), raw: off, rot };
  }
  if (t === 'VfxShapeSphere') {
    const r = fill ? rand() * (shape.radius || 0) : (shape.radius || 0);
    const off = [r, 0, 0];
    const rot = lolVfxMat3Mul(lolVfxAxisAngle([0, 1, 0], rand() * 360), lolVfxAxisAngle([0, 0, 1], rand() * 360)); // Y 다음 Z
    return { offset: lolVfxMat3Apply(rot, off), raw: off, rot };
  }
  return { offset: [0, 0, 0], raw: [0, 0, 0], rot: I };
}
// 색 조회 좌표(colorLookUpType 0 상수, 1 수명, 2 속도, 3 태어날 때 무작위)
function lolVfxColorLookup(type, scale, offset, ageFrac, speed, birthRand) {
  switch (type) {
    case 1: return scale * ageFrac + offset;
    case 2: return scale * speed + offset;
    case 3: return scale * birthRand + offset;
    default: return scale;
  }
}
// 플립북 칸 번호(문서: startFrame부터 numFrames 고리, 무작위 시작은 numFrames × 공유 무작위 수만큼 연속 오프셋)
function lolVfxFrame(em, ageSec, birthFrameRateMul, sharedRand) {
  const n = Math.max(1, em.numFrames || 1), start = em.startFrame || 0;
  if (n <= 1) return start;
  const rate = (em.frameRate || 0) * (birthFrameRateMul == null ? 1 : birthFrameRateMul);
  let f = rate > 0 ? ageSec * rate : 0;
  if (em.isRandomStartFrame) f += n * sharedRand;
  return start + (Math.floor(f) % n + n) % n;
}
