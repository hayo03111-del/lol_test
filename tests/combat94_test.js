// 94차 공통 전투 규칙 회귀 테스트 - 투사체(비대상 뒤 재추적 금지·바람 장막 팀/연속 판정·챔피언 교체 시 비플레이어 투사체 유지),
// 연속 원형 판정, 범위 판정과 시야, 상태 효과(잘못된 지속시간·정지·강제 이동 제한·자기 둔화와 강인함), 보호막 지속시간 검사.
// 실제 src 파일(00_global_constants, 01_status_effect_system, shield_system, 01_hit_detection, projectile_system)을 vm으로 불러온다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  setY(y) { this.y = y; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyQuaternion() { return this; }
}
let now = 1e6;
const ctx = {
  console, Math, performance: { now: () => now },
  THREE: { Vector3, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
  controller: null, dummy: null, placedDummies: [], turrets: [], inhibitorBuildings: [], nexusBuildings: [], minions: [],
  visionSystem: null, BASE_UNIT: 1,
};
vm.createContext(ctx);
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const realm = rd('src/world/mordekaiser_death_realm.js').match(/function canRealmInteract[\s\S]*?\n}\n/)[0];
vm.runInContext([rd('src/core/00_global_constants.js'), rd('src/core/01_status_effect_system.js'), rd('src/core/shield_system.js'), realm,
  rd('src/core/01_hit_detection.js'), rd('src/core/projectile_system.js'),
  'function yasuoWindwallOffsetWorld(w) { return 0; }',
  'this.api = { ProjectileSystem, lolRangeToWorld, findEnemiesInRadius, findFirstInLine, isInSweptCircle, applyStatus, isStunned, addShield, tickStatusEffects, hasStatus, setWorld: (w) => { controller = w.controller || null; dummy = w.dummy || null; placedDummies = w.placedDummies || []; minions = w.minions || []; visionSystem = w.visionSystem || null; } };'].join('\n'), ctx);
const A = ctx.api;
const L = A.lolRangeToWorld;
const unit = (x, z, lolR = 65, extra = {}) => Object.assign({ mesh: { position: new Vector3(x, 0, z) }, hp: 100, maxHp: 100, team: 'RED', collisionRadius: L(lolR), statusEffects: [] }, extra);
const player = { team: 'BLUE', root: { position: new Vector3(0, 0, 0) }, hp: 500, maxHp: 500, championId: 'garen', statusEffects: [] };
const newPS = () => {
  const ps = new A.ProjectileSystem({ add() {}, remove() {} }, { spawn() {} });
  ps._acquireArrowMesh = () => ({ group: { position: new Vector3(), quaternion: { setFromUnitVectors() {} }, scale: { setScalar() {} }, visible: true }, tipMat: { color: { set() {} }, emissive: { set() {} } } });
  ps._releaseArrowMesh = () => {};
  return ps;
};
const run = (ps, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) { now += dt * 1000; ps.update(dt); } };

// --- 투사체: 대상이 한 번 비대상이 되면 끝까지 빗나간다 ---
{
  const tgt = unit(10, 0); A.setWorld({ controller: player, minions: [tgt] });
  const ps = newPS(); let hits = 0;
  ps.spawn({ from: new Vector3(0, 0, 0), target: tgt, speed: 4, onHit: () => hits++ });
  tgt.isUntargetable = true; run(ps, 0.3); tgt.isUntargetable = false; run(ps, 4);
  assert(hits === 0 && ps.totalMisses === 1, '투사체: 비행 중 대상이 비대상이 됐다 풀려도 다시 쫓아가 맞히지 않는다');
}
// --- 바람 장막: 팀 없는(플레이어) 투사체는 통과, 적 팀 투사체는 막힘, 빠른 적 투사체도 연속 판정으로 막힘 ---
{
  const yas = { team: 'BLUE', championId: 'yasuo', root: { position: new Vector3(0, 0, 0) }, _yasuo: { windwall: { origin: new Vector3(5, 0, 0), dir: new Vector3(1, 0, 0), width: 8 } }, statusEffects: [], hp: 500, maxHp: 500 };
  const far = unit(20, 0); A.setWorld({ controller: yas, minions: [far] });
  const ps = newPS(); let mine = 0, theirs = 0, fast = 0;
  ps.spawn({ from: new Vector3(0, 0, 0), target: far, speed: 10, onHit: () => mine++ });
  run(ps, 3);
  assert(mine === 1, '바람 장막: 팀이 없는 플레이어 투사체(표식 눈덩이 등)는 막지 않는다');
  const yTarget = { team: 'BLUE', mesh: { position: new Vector3(0, 0, 0) }, hp: 100, maxHp: 100, collisionRadius: L(65), statusEffects: [] };
  ps.spawn({ from: new Vector3(20, 0, 0), target: yTarget, speed: 8, team: 'RED', onHit: () => theirs++ });
  run(ps, 4);
  assert(theirs === 0, '바람 장막: 적 팀 투사체는 막는다');
  ps.spawn({ from: new Vector3(20, 0, 0), target: yTarget, speed: 30, team: 'RED', onHit: () => fast++ }); // 한 프레임 1.5 > 장막 두께 0.9
  run(ps, 2);
  assert(fast === 0, '바람 장막: 한 프레임에 장막 두께를 건너뛰는 빠른 적 투사체도 막는다(연속 판정)');
}
// --- 챔피언 교체(clear): 플레이어 투사체만 지우고 팀이 붙은 미니언 투사체는 남긴다 ---
{
  const tgt = unit(10, 0); A.setWorld({ controller: player, minions: [tgt] });
  const ps = newPS();
  ps.spawn({ from: new Vector3(0, 0, 0), target: tgt, speed: 4, onHit() {} });
  ps.spawn({ from: new Vector3(0, 0, 0), target: tgt, speed: 4, team: 'BLUE', onHit() {} });
  ps.clear();
  assert(ps.projectiles.length === 1 && ps.projectiles[0].team === 'BLUE', 'clear(): 미니언(팀 있는) 투사체는 그대로 날아간다');
}
// --- 연속 원형 판정 ---
{
  const u = unit(5, 0.5, 30);
  assert(A.isInSweptCircle(u, new Vector3(0, 0, 0), new Vector3(10, 0, 0), L(40)), '연속 원형 판정: 이번 프레임에 지나간 구간 옆의 대상을 맞힌다');
  assert(!A.isInSweptCircle(u, new Vector3(0, 0, 0), new Vector3(10, 0, 0), 0.01), '연속 원형 판정: 폭 밖이면 빗나간다');
  assert(!A.isInSweptCircle(unit(20, 0, 30), new Vector3(0, 0, 0), new Vector3(10, 0, 0), L(40)), '연속 원형 판정: 구간 끝 너머는 빗나간다');
}
// --- 범위·스킬샷 판정은 시야와 무관 ---
{
  const hidden = unit(1, 0); A.setWorld({ controller: player, minions: [hidden], visionSystem: { enabled: true, isVisible: () => false } });
  assert(A.findEnemiesInRadius(new Vector3(0, 0, 0), 300).length === 1, '범위 판정: 안 보이는(덤불·안개) 적도 맞는다');
  assert(A.findFirstInLine(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 500, 0.5) === hidden, '직선 판정: 안 보이는 적도 맞는다');
  A.setWorld({ controller: player, minions: [] });
}
// --- 상태 효과 ---
{
  const d = unit(0, 0);
  assert(A.applyStatus(d, { id: 'bad', type: 'KNOCKUP', duration: NaN }) === null && !d._yasuoAirborne, 'applyStatus: NaN 지속시간은 걸지 않는다(높이 NaN 방지)');
  assert(A.applyStatus(d, { id: 'zero', type: 'STUN', duration: 0 }) === null && !A.isStunned(d), 'applyStatus: 0초 효과는 걸지 않는다');
  const c = unit(0, 0, 65, { itemTenacityPercent: 0.3 });
  A.applyStatus(c, { id: 'itemStasisStun', type: 'STASIS', duration: 2.5 });
  const st = c.statusEffects.find((e) => e.id === 'itemStasisStun');
  assert(A.isStunned(c) && st && Math.abs(st.duration - 2.5) < 1e-9, '정지(존야): 행동 불가이고 강인함으로 줄지 않는다(2.5초 그대로)');
  const v = unit(0, 0, 65, { itemTenacityPercent: 0.3, itemSlowResistPercent: 0.25 });
  A.applyStatus(v, { id: 'varusQ_chargeSlow', type: 'SLOW', duration: 4, value: 0.2, source: v });
  const sl = v.statusEffects[0];
  assert(Math.abs(sl.duration - 4) < 1e-9 && Math.abs(sl.value - 0.2) < 1e-9, '자기 둔화(바루스 Q 충전): 강인함·둔화 저항을 받지 않는다');
  // 속박 + 도발: 강제 이동하지 않는다
  const src = unit(10, 0); const t = unit(0, 0, 65, { attackRange: 0 });
  A.applyStatus(t, { id: 'taunt', type: 'TAUNT', duration: 2, value: 1, source: src });
  A.applyStatus(t, { id: 'root', type: 'ROOT', duration: 2, value: 1 });
  const x0 = t.mesh.position.x; A.tickStatusEffects(t, 0.5);
  assert(t.mesh.position.x === x0, '강제 이동: 속박 중에는 도발돼도 걸어가지 않는다');
  const t2 = unit(0, 0, 65, { attackRange: 0 });
  A.applyStatus(t2, { id: 'taunt', type: 'TAUNT', duration: 2, value: 1, source: src });
  A.tickStatusEffects(t2, 0.5);
  assert(t2.mesh.position.x > 0, '강제 이동: 다른 제한이 없으면 도발한 쪽으로 걸어간다');
}
// --- 보호막 지속시간 ---
{
  const u = unit(0, 0);
  assert(A.addShield(u, 'bad', 100, NaN) === 0 && !(u.shield > 0), '보호막: NaN 지속시간 보호막은 만들지 않는다(예전엔 영구)');
  assert(A.addShield(u, 'ok', 100, 2) > 0 && u.shield === 100, '보호막: 정상 지속시간은 그대로');
}
