// 94차 구조물·게임 시계 회귀 테스트 - 게임 시계(시뮬레이션 시간, 일시정지 중 멈춤), 포탑 대상 유지 시 팀·세계 검사,
// 게임 종료 뒤 포탑 사격 중지, 가열 초기화(5초)가 게임 시계를 따름, 회복 유물 초기화.
// 실제 src 파일(00_global_constants, turret_system, aram_features)을 vm으로 불러온다.
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
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
let wall = 5e6;
const ctx = {
  console: { log() {}, warn: console.warn, error: console.error }, Math, performance: { now: () => wall },
  THREE: { Vector3, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  controller: null, dummy: null, placedDummies: [], minions: [], BASE_UNIT: 1, gameEnded: false,
};
vm.createContext(ctx);
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const realm = rd('src/world/mordekaiser_death_realm.js').match(/function canRealmInteract[\s\S]*?\n}\n/)[0];
vm.runInContext([rd('src/core/00_global_constants.js'), realm, rd('src/world/turret_system.js'), rd('src/world/aram_features.js'),
  'function findMinionsOfTypesNear() { return []; } var MINION_TYPE = { SUPER: "super", SIEGE: "siege" };',
  'this.api = { getTurretGameTimeSec, advanceTurretGameClock, resetTurretGameClock, setTurretGameTimeSec, isValidTurretTarget, getTurretAttackTarget, getTurretHeatMultiplierAndRegister, resetAramRelics, aramRelics, lolRangeToWorld, TURRET_TYPE, setEnded: (v) => { gameEnded = v; }, setController: (c) => { controller = c; } };'].join('\n'), ctx);
const A = ctx.api;

// --- 게임 시계: 실제 시간이 아니라 진행한 시뮬레이션 시간 ---
{
  A.resetTurretGameClock();
  wall += 60000; // 실제로 60초가 흘러도(일시정지·느린 프레임)
  assert(A.getTurretGameTimeSec() === 0, '게임 시계: 시뮬레이션을 진행하지 않으면 실제 시간이 흘러도 멈춰 있다(일시정지)');
  for (let i = 0; i < 20; i++) A.advanceTurretGameClock(0.05);
  assert(Math.abs(A.getTurretGameTimeSec() - 1) < 1e-9, '게임 시계: 프레임 dt 누적만큼 간다(0.05 x 20 = 1초)');
  A.advanceTurretGameClock(NaN); A.advanceTurretGameClock(-1);
  assert(Math.abs(A.getTurretGameTimeSec() - 1) < 1e-9, '게임 시계: NaN·음수 dt는 무시');
  A.setTurretGameTimeSec(300);
  assert(A.getTurretGameTimeSec() === 300, '게임 시계: 연습 도구용 시각 지정');
  A.resetTurretGameClock();
  assert(A.getTurretGameTimeSec() === 0, '게임 시계: 초기화하면 0초');
}
// --- 포탑 대상 유효성: 팀·세계 ---
{
  const L = A.lolRangeToWorld;
  const turret = { team: 'RED', mesh: { position: new Vector3(0, 0, 0) }, realmId: 'main', type: A.TURRET_TYPE.OUTER1 };
  const champ = { team: 'BLUE', hp: 500, root: { position: new Vector3(L(300), 0, 0) }, collisionRadius: L(65), realmId: 'main', isChampion: true };
  assert(A.isValidTurretTarget(turret, champ), '포탑 대상: 사거리 안의 적 챔피언은 유효');
  champ.realmId = 'deathRealm1';
  assert(!A.isValidTurretTarget(turret, champ), '포탑 대상: 죽음의 세계로 간 대상은 이미 노리던 대상이라도 놓는다');
  champ.realmId = 'main';
  const ally = { team: 'RED', hp: 500, mesh: { position: new Vector3(L(100), 0, 0) }, collisionRadius: L(48), realmId: 'main' };
  assert(!A.isValidTurretTarget(turret, ally), '포탑 대상: 같은 팀은 대상이 아니다');
  turret.attackTarget = champ; champ.realmId = 'deathRealm1';
  A.setController(champ);
  assert(A.getTurretAttackTarget(turret) !== champ, '포탑 대상 유지: 다른 세계로 간 현재 대상을 계속 쏘지 않는다');
  A.setController(null);
}
// --- 가열: 5초 초기화가 게임 시계를 따른다(일시정지 중 실제 시간으로 풀리지 않음) ---
{
  A.resetTurretGameClock();
  const t = { heatStacks: 0 };
  A.getTurretHeatMultiplierAndRegister(t); A.getTurretHeatMultiplierAndRegister(t);
  const stacks = t.heatStacks;
  wall += 10000; // 일시정지 10초
  const m = A.getTurretHeatMultiplierAndRegister(t);
  assert(stacks === 2 && m > 1, '가열: 일시정지로 실제 시간이 흘러도 가열 단계가 풀리지 않는다');
  for (let i = 0; i < 120; i++) A.advanceTurretGameClock(0.05); // 게임 시간 6초(초기화 기준 5초)
  assert(A.getTurretHeatMultiplierAndRegister(t) === 1, '가열: 게임 시간 5초 넘게 챔피언을 안 맞히면 처음 단계로');
}
// --- 회복 유물 초기화 ---
{
  const mk = (first) => ({ firstSec: first, nextSpawnAt: 999, active: true, beamAt: 12, _beamDone: true, picker: {}, pickedTeam: 'BLUE', orb: { visible: true }, beam: { material: { opacity: 0.5 } } });
  A.aramRelics.push(mk(105), mk(150));
  A.resetAramRelics();
  const ok = A.aramRelics.every((r) => !r.active && r.beamAt == null && !r._beamDone && r.picker == null && r.nextSpawnAt === r.firstSec && !r.orb.visible && r.beam.material.opacity === 0);
  assert(ok, '회복 유물: 게임 초기화 때 활성·빛줄기·다음 등장 시각이 처음으로(1:45/2:30)');
  A.aramRelics.length = 0;
}
