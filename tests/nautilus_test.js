// 노틸러스 전투 로직 테스트 - combat_core_bugfix_test.js와 같은 방식으로
// 실제 character_controller.js + nautilus.js를 로드하고, 무거운 생성자는
// 부르지 않고 Object.create(CharacterController.prototype)로 뼈대만 만든다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
class Vector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  divideScalar(s){return this.multiplyScalar(1/s);}
  setY(y){this.y=y;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  applyQuaternion(){return this;}
  lerpVectors(a,b,t){this.x=a.x+(b.x-a.x)*t;this.y=a.y+(b.y-a.y)*t;this.z=a.z+(b.z-a.z)*t;return this;}
}
const ARENA = 50;
const stubs = {
  performance: { now: () => now },
  console,
  setTimeout: () => 0, clearTimeout: () => {},
  controller: null,
  PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  getArmorShredPercent: () => 0, getMagicDamageReductionPercent: () => 0, getMrShredFlat: () => 0,
  itemSystemTick: () => {}, updateBars: () => {}, updateSkillUI: () => {}, refreshUnitCcTags: () => {},
  showSkillToast: () => {},
  damageEnemy: (enemy, dmg) => { enemy.hp = Math.max(0, enemy.hp - dmg); },
  placedDummies: [],
  vfx: { spawn: () => {} },
  document: { getElementById: () => null },
  window: { HOWLING_ABYSS_MAP: {
    isInsidePlayableArea: (p) => Math.abs(p.x) <= ARENA && Math.abs(p.z) <= ARENA,
    clampPosition: (p) => { p.x = Math.max(-ARENA, Math.min(ARENA, p.x)); p.z = Math.max(-ARENA, Math.min(ARENA, p.z)); return p; },
  } },
  THREE: { Vector3, LoopOnce: 2200, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
};
const context = vm.createContext(stubs);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
vm.runInContext([
  read('src/core/00_global_constants.js'),
  read('src/core/01_status_effect_system.js'), read('src/core/shield_system.js'),
  read('src/core/01_hit_detection.js'),
  read('src/champions/champion_data.js'),
  read('src/champions/champion_ability_database.js'),
  read('src/core/character_controller.js'),
  read('src/core/controller_movement.js'),
  read('src/core/controller_combat.js'),
  read('src/core/controller_casting.js'),
  read('src/core/controller_lifecycle.js'),
  read('src/champions/nautilus.js'),
].join('\n') + `
this.CharacterController = CharacterController;
this.CHAMPION_DATA = CHAMPION_DATA;
this.STATE = STATE;
this.lolRangeToWorld = lolRangeToWorld;
this.getSlowPercent = getSlowPercent;
this.hasStatus = hasStatus;
this.getStatus = getStatus;
this.tickStatusEffects = typeof tickStatusEffects === 'function' ? tickStatusEffects : null;
this.setController = (c) => { controller = c; };
`, context);
const { CharacterController, CHAMPION_DATA, lolRangeToWorld, getSlowPercent, hasStatus, getStatus, setController } = context;
const D = CHAMPION_DATA.nautilus;

function makeNaut(overrides = {}) {
  const c = Object.create(CharacterController.prototype);
  Object.assign(c, {
    championId: 'nautilus', team: 'BLUE', isChampion: true,
    root: { position: new Vector3(0, 0, 0), quaternion: {}, rotation: { y: 0 } },
    hp: 2000, maxHp: 2000, mp: 1000, maxMp: 1000, shield: 0, statusEffects: [],
    champLevel: 1, skillLevels: { Q: 1, W: 1, E: 1, R: 1 },
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 100, armor: 30, magicResist: 30, attackRange: 175 },
    collisionRadius: 0.5, attackOverrides: [], subStates: {},
    abilityResolver: { championId: 'nautilus' },
    passiveState: { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0 },
    state: 'IDLE', currentActionKey: null, currentPhase: null, currentTarget: null,
    _actionTimers: [],
    clips: ['Spell1', 'Spell1_Idle', 'Spell1_Dash', 'Spell3', 'Spell4', 'Attack1', 'Attack2', 'Attack3', 'Attack4'].map((name) => ({ name, duration: 1 })), played: [],
    playFirstAvailable(names) { this.played.push(names[0]); }, faceDirectionInstant() {}, setState(s) { this.state = s; },
    _clearActionTimers() {}, _resumeAfterAction() { this.resumed = (this.resumed || 0) + 1; },
  }, overrides);
  c._nautilusReset();
  setController(c);
  return c;
}
function makeEnemy(x, z, overrides = {}) {
  const pos = new Vector3(x, 0, z);
  return Object.assign({ isChampion: true, team: 'RED', hp: 5000, maxHp: 5000, armor: 0, magicResist: 0, statusEffects: [], collisionRadius: 0.5, mesh: { position: pos }, root: { position: pos } }, overrides);
}
function step(c, totalSec, dt = 1 / 60) {
  for (let t = 0; t < totalSec; t += dt) {
    now += dt * 1000;
    c._nautilusUpdate(dt);
    if (c._dashState) { const p = c._dashState; p.elapsed += dt; const k = Math.min(1, p.elapsed / p.duration); c.root.position.lerpVectors(p.from, p.to, k); if (k >= 1) c._dashState = null; }
    for (const u of stubs.placedDummies) { const p = u._pullState; if (!p) continue; p.elapsed += dt; const k = Math.min(1, p.elapsed / p.duration); u.mesh.position.lerpVectors(p.from, p.to, k); if (k >= 1) u._pullState = null; }
  }
}
const mag = (lvl, arr, ratio, ap) => arr[lvl - 1] + ratio * ap;

// ------------------------------------------------------------------
// 패시브 - 강력한 일격
// ------------------------------------------------------------------
{
  const c = makeNaut({ champLevel: 6 });
  const e = makeEnemy(0, 1);
  stubs.placedDummies = [e];
  const hp0 = e.hp;
  c._nautilusOnBasicAttackHit(e);
  const expected = D.passive.bonusDamageAtLevel1 + (D.passive.bonusDamageAtLevel18 - D.passive.bonusDamageAtLevel1) * 5 / 17; // 14~116 레벨 비례(PC 위키 V13.3)
  assert(Math.abs((hp0 - e.hp) - expected) < 1e-6, `패시브: 첫 공격 추가 물리 피해 ${expected}(레벨 6)`);
  const root = getStatus(e, 'nautilusPassive_root');
  assert(root && root.type === 'ROOT' && Math.abs(root.duration - 1.0) < 1e-9, '패시브: 레벨 6 속박 1초');
  const hp1 = e.hp;
  now += 3000;
  c._nautilusOnBasicAttackHit(e);
  assert(e.hp === hp1, '패시브: 같은 대상에게 6초 안에는 다시 발동하지 않는다');
  now += 3100;
  c._nautilusOnBasicAttackHit(e);
  assert(e.hp < hp1, '패시브: 6초가 지나면 같은 대상에게 다시 발동');
  const other = makeEnemy(0, 2);
  stubs.placedDummies.push(other);
  const hpO = other.hp;
  c._nautilusOnBasicAttackHit(other);
  assert(other.hp < hpO, '패시브: 다른 대상에게는 따로 발동');
}

// ------------------------------------------------------------------
// Q - 닻줄 견인
// ------------------------------------------------------------------
{
  const c = makeNaut();
  const dist = lolRangeToWorld(800);
  const e = makeEnemy(0, dist);
  stubs.placedDummies = [e];
  const hp0 = e.hp, mp0 = c.mp;
  c._nautilusCastQ(new Vector3(0, 0, dist), false);
  assert(c.mp === mp0 - D.Q.mana && c.cooldowns.Q > 0, 'Q: 마나 60 소모, 재사용 대기시간 시작');
  assert(c.currentActionKey === 'nautilusQ', 'Q: 시전 중 행동 잠금');
  step(c, D.Q.castTimeSec + dist / lolRangeToWorld(D.Q.missileSpeed) + 0.05);
  const expected = mag(1, D.Q.damageByLevel, D.Q.apRatio, 100);
  assert(Math.abs((hp0 - e.hp) - expected) < 1e-6, `Q: 적중 시 마법 피해 ${expected}`);
  assert(hasStatus(e, 'STUN'), 'Q: 끌려오는 동안 대상 기절');
  step(c, 1.0);
  const gap = Math.abs(e.mesh.position.z - c.root.position.z);
  assert(c.root.position.z > dist * 0.3 && e.mesh.position.z < dist * 0.7, `Q: 서로 끌려가 중간에서 만난다(노틸러스 z=${c.root.position.z.toFixed(2)}, 대상 z=${e.mesh.position.z.toFixed(2)})`);
  assert(gap < 2.0, 'Q: 만난 뒤 거리가 충돌 반경 수준');
  assert(c.currentActionKey === null && c.resumed > 0, 'Q: 끌려간 뒤 행동 잠금 해제');
  assert(c.played.join(',') === 'Spell1,Spell1_Idle,Spell1_Dash', `Q: 실제 노틸러스.glb 클립 순서 - 던지기→닻 비행→끌려감(${c.played.join(',')})`);
}
{
  const c = makeNaut();
  stubs.placedDummies = [];
  c._nautilusCastQ(new Vector3(0, 0, 1), false);
  const cd0 = c.cooldowns.Q, mpAfterCast = c.mp;
  step(c, 2.0);
  assert(c.cooldowns.Q === cd0 && c.mp === mpAfterCast, 'Q: 아무것도 못 맞히면 환급 없음');
  assert(c.root.position.z === 0, 'Q: 빗나가면 노틸러스는 제자리');
}
{
  const c = makeNaut();
  c.root.position.set(0, 0, ARENA - lolRangeToWorld(300));
  stubs.placedDummies = [];
  c._nautilusCastQ(new Vector3(0, 0, ARENA + 10), false);
  const cdFull = c.cooldowns.Q, mpAfterCast = c.mp;
  step(c, 0.6);
  assert(Math.abs(c.cooldowns.Q - cdFull * 0.5) < 1e-6, 'Q: 지형(맵 경계)에 맞으면 남은 재사용 대기시간 50% 환급');
  assert(Math.abs(c.mp - (mpAfterCast + D.Q.mana * 0.5)) < 1e-6, 'Q: 지형에 맞으면 마나 50% 환급');
  step(c, 1.0);
  assert(c.root.position.z > ARENA - lolRangeToWorld(100), `Q: 지형 쪽으로 노틸러스가 끌려간다(z=${c.root.position.z.toFixed(2)})`);
}

// ------------------------------------------------------------------
// W - 타이탄의 분노
// ------------------------------------------------------------------
{
  const c = makeNaut();
  stubs.placedDummies = [];
  c._nautilusCastW(false);
  const shield = D.W.shieldByLevel[0] + 2000 * D.W.shieldMaxHpPercentByLevel[0] / 100;
  assert(Math.abs(c.shield - shield) < 1e-6, `W: 보호막 ${shield}(50 + 최대체력 8%)`);
  assert(c._nautilusWActive(), 'W: 보호막이 있는 동안 활성');
  assert(c.attackOverrides.some((o) => o.id === 'W'), 'W: 지속시간 동안 평타 모션 대체(Attack4) 등록');
  const t = makeEnemy(0, 1), near = makeEnemy(lolRangeToWorld(200), 1), far = makeEnemy(lolRangeToWorld(900), 1);
  stubs.placedDummies = [t, near, far];
  c._nautilusApplyWOnHit(t);
  const dot = getStatus(t, 'nautilusW_dot');
  const total = mag(1, D.W.onHitDamageByLevel, D.W.onHitApRatio, 100);
  assert(dot && Math.abs(dot.totalDamage - total) < 1e-6 && dot.duration === 2, `W: 평타 대상에게 2초간 마법 피해 ${total}`);
  assert(!!getStatus(near, 'nautilusW_dot'), 'W: 대상 주변(350) 적에게도 피해');
  assert(!getStatus(far, 'nautilusW_dot'), 'W: 범위 밖 적은 제외');

  c.shield -= shield; // 보호막이 피해로 전부 깨짐
  c._nautilusTickW();
  assert(!c._nautilusWActive() && !c.attackOverrides.some((o) => o.id === 'W'), 'W: 보호막이 깨지면 추가 피해/모션 대체 즉시 종료');
}
{
  const c = makeNaut();
  c.shield = 100; // 다른 출처의 보호막
  c._nautilusCastW(false);
  now += D.W.durationSec * 1000 + 10;
  c._nautilusTickW();
  assert(Math.abs(c.shield - 100) < 1e-6, 'W: 지속시간이 끝나면 W 보호막 잔량만 사라지고 다른 보호막은 남는다');
}
{
  const c = makeNaut({ itemShieldReceivedBonusPercent: 0.25 });
  c._nautilusCastW(false);
  const shield = (D.W.shieldByLevel[0] + 2000 * D.W.shieldMaxHpPercentByLevel[0] / 100) * 1.25;
  assert(Math.abs(c.shield - shield) < 1e-6, 'W: 보호막 효과 증가(정령의형상 등)가 적용된다');
}

// ------------------------------------------------------------------
// E - 역류
// ------------------------------------------------------------------
{
  const c = makeNaut();
  const e = makeEnemy(0, lolRangeToWorld(300));
  const out = makeEnemy(0, lolRangeToWorld(900));
  stubs.placedDummies = [e, out];
  const hp0 = e.hp;
  c._nautilusCastE(false);
  const base = mag(1, D.E.damageByLevel, D.E.apRatio, 100);
  assert(e.hp === hp0 && c.currentActionKey === 'nautilusE', 'E: 시전 시간(0.25초) 동안은 폭발 전(행동 잠금)');
  step(c, D.E.castTimeSec + 0.001);
  assert(Math.abs((hp0 - e.hp) - base) < 1e-6, `E: 시전 시간 뒤 첫 폭발 ${base}`);
  assert(c.currentActionKey == null, 'E: 첫 폭발과 함께 행동 잠금 해제');
  const slow0 = getSlowPercent(e);
  assert(Math.abs(slow0 - 0.30) < 0.01, `E: 30% 둔화(${slow0.toFixed(3)})`);
  step(c, 0.25);
  assert(Math.abs((hp0 - e.hp) - base) < 1e-6, 'E: 두 번째 폭발은 시전 종료 0.297초 뒤(0.25초 시점엔 아직 1회)');
  step(c, 0.06);
  assert(Math.abs((hp0 - e.hp) - base * 1.5) < 1e-6, 'E: 0.297초 시점에 두 번째 폭발(50%)');
  step(c, D.E.explosionOffsetsSec[2] - 0.31 + 0.01);
  const total = base * (1 + 2 * D.E.subsequentDamagePercent / 100);
  assert(Math.abs((hp0 - e.hp) - total) < 1e-6, `E: 3회 폭발, 두 번째부터 50% - 총 ${total}`);
  assert(out.hp === out.maxHp, 'E: 범위(600) 밖은 피해 없음');
  now += 750;
  const slowMid = getSlowPercent(e);
  assert(slowMid < 0.30 && slowMid > 0, `E: 둔화가 시간에 따라 감소(${slowMid.toFixed(3)})`);
}

// ------------------------------------------------------------------
// R - 폭뢰
// ------------------------------------------------------------------
{
  const c = makeNaut();
  const d = lolRangeToWorld(700);
  const target = makeEnemy(0, d);
  const onPath = makeEnemy(0, d * 0.5);
  stubs.placedDummies = [target, onPath];
  c.currentTarget = target;
  c._nautilusCastR(false);
  assert(c.mp === 1000 - D.R.mana, 'R: 마나 100');
  // 충격파는 가속한다(275 + 초당 466.67): 도착 시간 t는 275t + 466.67t²/2 = 거리(LoL 단위).
  const dLol = d / lolRangeToWorld(1), a = D.R.shockwaveAccelPerSec, v0 = D.R.shockwaveSpeed;
  const arrive = (-v0 + Math.sqrt(v0 * v0 + 2 * a * dLol)) / a;
  // 경로 위 적: 맞는 순간 에어본이 걸렸는지 그때 확인(가속 때문에 주 대상 도착 시점엔 이미 끝났을 수 있음).
  let pathKnocked = false, elapsedR = 0;
  while (elapsedR < D.R.castTimeSec + arrive + 0.05) { step(c, 1 / 60); elapsedR += 1 / 60; if (hasStatus(onPath, 'KNOCKUP')) pathKnocked = true; }
  const main = mag(1, D.R.damageByLevel, D.R.apRatio, 100);
  const pathDmg = mag(1, D.R.pathDamageByLevel, D.R.pathApRatio, 100);
  assert(Math.abs((target.maxHp - target.hp) - main) < 1e-6, `R: 주 대상 피해 ${main}`);
  const k = getStatus(target, 'nautilusR_knockup');
  assert(k && k.type === 'KNOCKUP' && k.duration === 1, 'R: 주 대상 1초(1레벨) 에어본/기절');
  assert(Math.abs((onPath.maxHp - onPath.hp) - pathDmg) < 1e-6, `R: 경로 위 적 피해 ${pathDmg}`);
  assert(pathKnocked, 'R: 경로 위 적 에어본');
}
{
  const c = makeNaut();
  const far = makeEnemy(0, lolRangeToWorld(1200));
  stubs.placedDummies = [far];
  c.currentTarget = far;
  c._nautilusCastR(false);
  assert(c.mp === 1000 && c.cooldowns.R === 0, 'R: 사거리(825) 밖이면 시전 안 됨');
  const minion = makeEnemy(0, 1, { isChampion: false, isMinion: true });
  c.currentTarget = minion;
  c._nautilusCastR(false);
  assert(c.cooldowns.R === 0, 'R: 챔피언만 대상으로 지정 가능');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
