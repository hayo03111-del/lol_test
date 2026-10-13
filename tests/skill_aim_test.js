// 스킬 조준(skill_aim_system.js) 순수 계산 테스트 - 브라우저 없이 computeSkillAim / skillAimIsInstant만 검증한다.
// 조준 모양·폭·사거리가 각 스킬의 실제 판정 코드와 같은 값을 쓰는지, 지점 스킬이 사거리 밖 커서를 최대 사거리로
// 당기는지, 재시전처럼 조준 없이 나가는 상태를 즉시 시전으로 보는지 확인한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else { pass++; console.log('ok:', msg); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  applyQuaternion() { return this; }
  setY(y) { this.y = y; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
let now = 1000;
const ctx = vm.createContext({ console, performance: { now: () => now }, THREE: { Vector3: Vec3, MathUtils: { degToRad: (d) => d * Math.PI / 180 } }, localStorage: { getItem: () => null, setItem() {} } });
const src = ['src/core/00_global_constants.js', 'src/champions/champion_data.js', 'src/rendering/skill_aim_system.js']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
vm.runInContext(src + '\nthis.CD = CHAMPION_DATA; this.computeSkillAim = computeSkillAim; this.skillAimIsInstant = skillAimIsInstant; this.SKILL_AIM = SKILL_AIM; this.W = lolRangeToWorld; this.BASE_UNIT = BASE_UNIT;', ctx);
const { CD, computeSkillAim, skillAimIsInstant, SKILL_AIM, W } = ctx;

function champ(id, extra = {}) {
  return Object.assign({ championId: id, root: { position: new Vec3(0, 0, 0), quaternion: {} }, skillLevels: { Q: 1, W: 1, E: 1, R: 1 },
    collisionRadius: W(65), _champData: () => CD[id] }, extra);
}
const at = (lol) => new Vec3(0, 0, W(lol)); // 커서: 정면(+z)으로 lol 만큼

// 1) 모든 챔피언·슬롯에 조준 정의가 있고, 조준형은 NaN 없이 계산된다.
for (const id of Object.keys(CD)) {
  for (const slot of ['Q', 'W', 'E', 'R']) {
    const spec = SKILL_AIM[id] && SKILL_AIM[id][slot];
    assert(!!spec, `${id} ${slot} 조준 정의 있음`);
    if (!spec || spec.type === 'instant') continue;
    const aim = computeSkillAim(champ(id, { _varus: { qCharge: { startedAt: now - 500 } } }), slot, at(300));
    const nums = [aim.rangeWorld, ...(aim.segments || []).flatMap((s) => [s.len, s.width]), aim.radiusWorld, aim.angleDeg].filter((v) => v !== undefined);
    assert(aim && nums.every((v) => Number.isFinite(v) && v >= 0), `${id} ${slot} 조준 값이 유한한 수`);
  }
}

// 2) 고정 길이 직선: 이즈리얼 Q는 커서 거리와 무관하게 1200 길이, 폭 120(판정 findFirstInLine 반폭 60).
{
  const a = computeSkillAim(champ('ezreal'), 'Q', at(300));
  assert(a.type === 'line' && near(a.segments[0].len, W(1200)) && near(a.segments[0].width, W(120)), '이즈리얼 Q 직선 1200 x 120');
}
// 3) 지점 원: 초가스 Q는 사거리 밖 커서를 950으로 당긴다(판정 코드 Math.min(rawDist, range)).
{
  const far = computeSkillAim(champ('chogath'), 'Q', at(2000));
  const mid = computeSkillAim(champ('chogath'), 'Q', at(500));
  assert(near(far.center.z, W(950)) && near(far.radiusWorld, W(250)), '초가스 Q: 사거리 밖 커서는 950에, 반경 250');
  assert(near(mid.center.z, W(500)), '초가스 Q: 사거리 안 커서는 그 자리');
}
// 4) 벡스 E 반경은 거리에 비례(200 → 300).
{
  assert(near(computeSkillAim(champ('vex'), 'E', at(800)).radiusWorld, W(300)), '벡스 E: 최대 사거리에서 반경 300');
  assert(near(computeSkillAim(champ('vex'), 'E', at(400)).radiusWorld, W(250)), '벡스 E: 사거리 절반에서 반경 250');
}
// 5) 모데카이저 E: 지정 지점(700으로 당김)에서 모데카이저 쪽으로 길이 800 직사각형.
{
  const a = computeSkillAim(champ('mordekaiser'), 'E', at(1000));
  assert(near(a.segments[0].start, W(700 - 800)) && near(a.segments[0].len, W(800)) && near(a.segments[0].width, W(200)), '모데카이저 E 직사각형 (700-800 ~ 700) x 200');
}
// 6) 닐라 Q: 커서까지(최대 600) 직선, 폭 = impactRadius(판정 반폭 impactRadius/2).
{
  assert(near(computeSkillAim(champ('nilah'), 'Q', at(300)).segments[0].len, W(300)), '닐라 Q: 커서까지 300');
  assert(near(computeSkillAim(champ('nilah'), 'Q', at(900)).segments[0].len, W(600)), '닐라 Q: 사거리 600으로 당김');
}
// 7) 상태에 따라 바뀌는 조준: 야스오 Q 3타(회오리) 1150 x 180, 요네 Q 강화 시 돌진 + 돌풍 구간.
{
  const y1 = computeSkillAim(champ('yasuo', { _yasuo: { qStacks: 0 } }), 'Q', at(300));
  const y3 = computeSkillAim(champ('yasuo', { _yasuo: { qStacks: 2 } }), 'Q', at(300));
  assert(near(y1.segments[0].len, W(475)) && near(y1.segments[0].width, W(80)), '야스오 Q 1·2타 475 x 80');
  assert(near(y3.segments[0].len, W(1150)) && near(y3.segments[0].width, W(180)), '야스오 Q 3타 회오리 1150 x 180');
  const yo = computeSkillAim(champ('yone', { _yone: { qStacks: 2 } }), 'Q', at(300));
  assert(yo.segments.length === 2 && near(yo.segments[0].len, W(450)) && near(yo.segments[0].width, W(100)) && near(yo.segments[1].len, W(500)) && near(yo.segments[1].width, W(80)), '요네 Q 강화: 450 x 100 + 500 x 80');
}
// 8) 리 신 Q 폭은 판정 코드(findFirstInLine 반폭 BASE_UNIT*0.6 월드) 그대로.
assert(near(computeSkillAim(champ('leesin'), 'Q', at(300)).segments[0].width, ctx.BASE_UNIT * 1.2), '리 신 Q 폭 = 판정 반폭 x2');
// 9) 야스오 W 바람 장막: 앞쪽 width*0.75 지점, 길이 width(1레벨 320).
{
  const a = computeSkillAim(champ('yasuo'), 'W', at(300));
  assert(near(a.wall.dist, W(320) * 0.75) && near(a.wall.length, W(320)), '야스오 W: 320*0.75 지점, 길이 320');
}
// 10) 바루스 Q 충전: 0초 925, 0.75초 1262.5, 1.5초 이상 1600.
{
  const len = (ms) => computeSkillAim(champ('varus', { _varus: { qCharge: { startedAt: now - ms } } }), 'Q', at(300)).segments[0].len;
  assert(near(len(0), W(925)) && near(len(750), W(1262.5)) && near(len(3000), W(1600)), '바루스 Q 충전 사거리 925 → 1600 (1.5초)');
  assert(computeSkillAim(champ('varus', { _varus: { qCharge: null } }), 'Q', at(300)).charging === false, '바루스 Q 충전 아님이면 charging=false');
}
// 11) 즉시 시전: 자기 강화는 항상, 재시전 창은 그 동안만.
{
  assert(skillAimIsInstant(champ('garen'), 'Q') && skillAimIsInstant(champ('masteryi'), 'W'), '가렌 Q·마스터 이 W 즉시 시전');
  assert(!skillAimIsInstant(champ('garen'), 'R'), '가렌 R은 대상 조준');
  assert(skillAimIsInstant(champ('yone', { _yone: { eSpirit: {} } }), 'E') && !skillAimIsInstant(champ('yone', { _yone: { eSpirit: null } }), 'E'), '요네 E: 영혼 상태면 재시전(즉시)');
  assert(skillAimIsInstant(champ('leesin', { _leesin: { qMarkTarget: {}, qMarkExpiresAt: now + 1000, wMarkReadyUntil: 0 } }), 'Q'), '리 신 Q 2타 즉시');
  assert(!skillAimIsInstant(champ('leesin', { _leesin: { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0 } }), 'Q'), '리 신 Q 1타는 조준');
}
// 12) 초가스 R 사거리는 포식 중첩에 따라 늘어난다(175 + 2.5 x 중첩).
assert(near(computeSkillAim(champ('chogath', { _chogath: { predationStacks: 4 } }), 'R', at(100)).rangeWorld, W(185)), '초가스 R 사거리 175 + 2.5x4');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : `\nALL CHECKS PASSED (${pass})`);
