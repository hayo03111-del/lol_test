// 실제 GLB가 있는 5명(가렌/다리우스/마스터 이/리 신/노틸러스) 시스템 재점검 회귀 테스트.
// combat_core_bugfix_test.js / nautilus_test.js와 같은 방식으로 실제 소스를 VM에
// 로드하고, 무거운 생성자 대신 Object.create(CharacterController.prototype)로 뼈대만
// 만든다. setTimeout은 가짜 시계(now)에 맞춰 직접 돌리는 큐로 대체한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

let now = 1000000;
let timers = [];
let timerSeq = 0;
function fakeSetTimeout(fn, ms) { const id = ++timerSeq; timers.push({ id, fn, at: now + Math.max(0, ms || 0) }); return id; }
function fakeClearTimeout(id) { timers = timers.filter((t) => t.id !== id); }
function advance(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    now = Math.max(now, t.at);
    t.fn();
  }
  now = end;
}

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
const stubs = {
  performance: { now: () => now },
  console: { log() {}, warn() {}, error: console.error },
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, clearInterval: () => {},
  controller: null,
  PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  getArmorShredPercent: () => 0, getMagicDamageReductionPercent: () => 0, getMrShredFlat: () => 0,
  itemSystemTick: () => {}, updateBars: () => {}, updateSkillUI: () => {}, refreshUnitCcTags: () => {},
  updateExpUI: () => {}, showSkillToast: () => {},
  damageEnemy: (enemy, dmg) => {
    const floor = enemy.isTrainingDummy ? Math.max(1, Math.round(enemy.maxHp * 0.02)) : 0;
    enemy.hp = Math.max(floor, enemy.hp - dmg);
  },
  placedDummies: [],
  vfx: { spawn: () => {} },
  document: { getElementById: () => null },
  window: {},
  THREE: { Vector3, LoopOnce: 2200, LoopRepeat: 2201, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
};
const context = vm.createContext(stubs);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
vm.runInContext([
  'src/core/00_global_constants.js', 'src/core/01_status_effect_system.js', 'src/core/01_hit_detection.js',
  'src/core/skill_timing_database.js',
  'src/champions/champion_data.js', 'src/champions/champion_ability_database.js',
  'src/core/character_controller.js', 'src/core/controller_movement.js', 'src/core/controller_combat.js',
  'src/core/controller_casting.js', 'src/core/controller_lifecycle.js',
  'src/champions/garen.js', 'src/champions/darius.js', 'src/champions/masteryi.js',
  'src/champions/leesin.js', 'src/champions/nautilus.js',
].map(read).join('\n') + `
this.CharacterController = CharacterController;
this.CHAMPION_DATA = CHAMPION_DATA;
this.STATE = STATE;
this.applyStatus = applyStatus;
this.applyDamage = applyDamage;
this.getStatus = getStatus;
this.getSlowPercent = getSlowPercent;
this.getAttackSpeedBuffPercent = getAttackSpeedBuffPercent;
this.getTenacity = getTenacity;
this.computeChampionStats = computeChampionStats;
this.lolRangeToWorld = lolRangeToWorld;
this.setController = (c) => { controller = c; };
`, context);
const { CharacterController, CHAMPION_DATA, STATE, applyStatus, applyDamage, getStatus, getSlowPercent,
  getAttackSpeedBuffPercent, getTenacity, computeChampionStats, lolRangeToWorld, setController } = context;

function makeChamp(championId, clipNames = [], overrides = {}) {
  const c = Object.create(CharacterController.prototype);
  Object.assign(c, {
    championId, team: 'BLUE', isChampion: true,
    root: { position: new Vector3(0, 0, 0), quaternion: {}, rotation: { y: 0 } },
    hp: 1000, maxHp: 2000, mp: 1000, maxMp: 1000, shield: 0, statusEffects: [],
    champLevel: 1, skillLevels: { Q: 1, W: 1, E: 1, R: 1 },
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 1.5, critChance: 0, critMultiplier: 1.75, baseAttackSpeed: 0.625, bonusAttackSpeedPercent: 0 },
    itemBonusAD: 0, bonusAD: 0, bonusArmor: 0, bonusMr: 0,
    itemHealingReceivedBonusPercent: 0, itemShieldReceivedBonusPercent: 0,
    collisionRadius: 0.5, attackOverrides: [], subStates: {}, _transientMoveClipNames: new Set(),
    abilityResolver: { championId },
    passiveState: { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0 },
    state: 'IDLE', currentActionKey: null, currentPhase: null, currentTarget: null, targetPos: null,
    pendingMove: null, pendingCast: null, moveDir: new Vector3(0, 0, 0),
    _actionTimers: [], _actionSerial: 0,
    clips: clipNames.map((name) => (typeof name === 'string' ? { name, duration: 1 } : name)),
    played: [],
    playFirstAvailable(names) { const n = names.find((x) => this.clips.some((c2) => c2.name === x)) || names[0]; this.played.push(n); this.currentClipKey = n; },
    crossFadeTo(names) { this.playFirstAvailable(names); },
    findAnimation(name) { return this.clips.find((c2) => c2.name === name) || null; },
    faceDirectionInstant() {}, setState(s) { this.state = s; }, recomputeStats() {},
    _resumeAfterAction() { this.resumed = (this.resumed || 0) + 1; this.currentActionKey = null; },
    _returnToLocomotion() { this.returned = (this.returned || 0) + 1; this.played.push('LOCOMOTION'); this.currentClipKey = 'LOCOMOTION'; },
    _getBonusAD() { return (this.itemBonusAD || 0) + (this.bonusAD || 0); },
  }, overrides);
  c._freshChampionStates();
  setController(c);
  return c;
}
function makeEnemy(x, z, overrides = {}) {
  const pos = new Vector3(x, 0, z);
  return Object.assign({ isChampion: true, team: 'RED', hp: 3000, maxHp: 3000, armor: 0, magicResist: 0, statusEffects: [], collisionRadius: 0.5, mesh: { position: pos }, root: { position: pos } }, overrides);
}

// ==================================================================
// 가렌
// ==================================================================
{
  const G = CHAMPION_DATA.garen;
  const c = makeChamp('garen');
  const e = makeEnemy(0, 1);
  stubs.placedDummies = [e];
  const hp0 = e.hp;
  c._garenQOnHit(e);
  assert(near(hp0 - e.hp, 30 + 0.5 * 100), '가렌 Q: 추가 피해 = 30 + 공격력 50% (평타 피해에 더해지는 몫만)');
  assert(G.Q.enhancedWindow === 4.5, '가렌 Q: 강화 평타 유효 시간 데이터 4.5초');

  // W 보호막 - 추가 체력 기준 + 강인함 60%
  const base = computeChampionStats('garen', 1).maxHp;
  const c2 = makeChamp('garen', [], { maxHp: base + 500, hp: base + 500 });
  c2._garenWOnCast();
  assert(near(c2.shield, 65 + 0.18 * 500), `가렌 W: 보호막 = 65 + 추가 체력(500)의 18% (= ${65 + 90})`);
  assert(near(getTenacity(c2), 0.6), '가렌 W: 0.75초 동안 강인함 60%');
  applyStatus(c2, { id: 'testStun', type: 'STUN', duration: 1, value: 1 });
  assert(near(getStatus(c2, 'testStun').duration, 0.4), '가렌 W: 강인함 60%가 기절 1초를 0.4초로 줄인다');
  c2.itemTenacityPercent = 0.3;
  assert(near(getTenacity(c2), 1 - 0.4 * 0.7), '강인함: 아이템 30% + 가렌 W 60%는 곱연산(1-(0.7×0.4))');
  now += 1000;
  assert(near(getTenacity(c2), 0.3), '가렌 W: 0.75초 뒤 강인함 버프 종료(아이템 몫만 남음)');

  // W 패시브 - 처치 스택(공용 처치 판정), 허수아비 바닥 반복 타격은 제외, 상한 30
  const c3 = makeChamp('garen');
  const victim = makeEnemy(0, 1, { hp: 10, maxHp: 1000 });
  stubs.placedDummies = [victim];
  applyDamage(victim, { rawDamage: 50, damageType: 'TRUE', isCritical: false, critMultiplier: 1 });
  assert(near(c3.bonusArmor, 0.2) && near(c3.bonusMr, 0.2), '가렌 W 패시브: 평타/스킬 무엇이든 처치하면 방어력/마저 +0.2');
  const dummy = makeEnemy(0, 1, { isTrainingDummy: true, hp: 20, maxHp: 1000 }); // 2% 바닥 = 20
  applyDamage(dummy, { rawDamage: 50, damageType: 'TRUE', isCritical: false, critMultiplier: 1 });
  assert(near(c3.bonusArmor, 0.2), '가렌 W 패시브: 이미 2% 바닥에 멈춘 허수아비를 때리는 건 처치로 치지 않는다');
  c3._garenCourageStacks = 29.9; c3.bonusArmor = 50; // 다른 효과의 bonusArmor 20 포함
  c3._garenOnTakedown(); c3._garenOnTakedown();
  assert(near(c3._garenCourageStacks, 30) && near(c3.bonusArmor, 50.1), '가렌 W 패시브: 상한 30은 용기 스택에만 걸리고 다른 bonusArmor는 자르지 않는다');

  // R 기본 피해 150 + 잃은 체력 25%
  const r = makeEnemy(0, 1, { hp: 2000, maxHp: 3000 });
  c._garenROnHit(r);
  assert(near(2000 - r.hp, 150 + 0.25 * 1000), '가렌 R: 150 + 대상 잃은 체력의 25% 고정 피해');

  // E - 대상별 6타 방어력 감소, 미니언 제외
  const ce = makeChamp('garen', [], { stats: Object.assign({}, c.stats, { attackDamage: 100 }) });
  const a = makeEnemy(0, 0.5);
  const minion = makeEnemy(0.3, 0.3, { isChampion: false, isMinion: false });
  stubs.placedDummies = [a, minion];
  ce.currentActionKey = 'eChannel'; ce._eChannelTimer = 0; ce._eChannelDuration = 100; ce._eChannelDamageAccum = 0;
  ce._eHitInterval = 0.1; ce._eHitsDone = 0; ce._eHitsPerTarget = new Map();
  ce._endEChannel = () => {};
  for (let i = 0; i < 5; i++) ce.updateEChannel(0.1);
  const late = makeEnemy(-0.3, 0.3);
  stubs.placedDummies.push(late);
  ce.updateEChannel(0.1); // a: 6타째
  assert(!!getStatus(a, 'garenE_shred'), '가렌 E: 6번 맞은 챔피언은 방어력 25% 감소');
  assert(!getStatus(late, 'garenE_shred'), '가렌 E: 늦게 들어온 챔피언은 자기 적중 횟수 6회 전엔 감소 없음(예전엔 전체 회전 수 기준)');
  assert(!getStatus(minion, 'garenE_shred'), '가렌 E: 방어력 감소는 챔피언에게만');
  for (let i = 0; i < 5; i++) ce.updateEChannel(0.1);
  assert(!!getStatus(late, 'garenE_shred'), '가렌 E: 늦게 들어온 챔피언도 자기 6타째에 감소');
}

// ==================================================================
// 다리우스
// ==================================================================
{
  const c = makeChamp('darius');
  const e = makeEnemy(0, 1);
  stubs.placedDummies = [e];
  c._dariusApplyBleed(e); c._dariusApplyBleed(e);
  assert(c._dariusLiveStacks(e) === 2, '다리우스 패시브: 출혈 2중첩');
  now += 6000;
  assert(c._dariusLiveStacks(e) === 0, '다리우스 패시브: 출혈(5초)이 끝나면 중첩도 사라진다');
  c._dariusApplyBleed(e);
  assert(c._dariusLiveStacks(e) === 1, '다리우스 패시브: 만료 후 다시 때리면 1중첩부터');
  for (let i = 0; i < 4; i++) c._dariusApplyBleed(e);
  assert(c._dariusLiveStacks(e) === 5 && c.bonusAD > 0, '다리우스 패시브: 5중첩 시 녹서스의 힘(공격력 증가)');
  const fresh = makeEnemy(0, 2);
  c._dariusApplyBleed(fresh);
  assert(c._dariusLiveStacks(fresh) === 5, '다리우스 녹서스의 힘: 지속 중 새 대상도 즉시 최대 중첩');

  // Q 회복 - 챔피언 도끼날 적중 수 기준, 잃은 체력의 17%/명, 최대 51%
  const cq = makeChamp('darius', [], { hp: 1000, maxHp: 2000 });
  const minion = makeEnemy(0, 3, { isChampion: false });
  assert(cq._dariusQOnHit(minion, lolRangeToWorld(400)) === false, '다리우스 Q: 미니언은 회복 대상 수에 포함되지 않는다');
  assert(cq._dariusQOnHit(makeEnemy(0, 3), lolRangeToWorld(100)) === false, '다리우스 Q: 자루(안쪽) 적중은 회복 없음');
  assert(cq._dariusQOnHit(makeEnemy(0, 3), lolRangeToWorld(400)) === true, '다리우스 Q: 도끼날 챔피언 적중은 회복 대상');
  cq._dariusQHeal(2);
  assert(near(cq.hp, 1000 + 1000 * 0.34), '다리우스 Q: 챔피언 2명 → 잃은 체력의 34% 회복(한 번만)');
  const cq2 = makeChamp('darius', [], { hp: 1000, maxHp: 2000 });
  cq2._dariusQHeal(5);
  assert(near(cq2.hp, 1000 + 1000 * 0.51), '다리우스 Q: 회복 상한 51%(잃은 체력 기준)');

  // W 둔화 90% / E 패시브 방관 상시 / R은 살아있는 중첩만
  const cw = makeChamp('darius');
  const wt = makeEnemy(0, 1);
  cw._dariusWOnHit(wt);
  assert(near(getStatus(wt, 'dariusW_slow').value, 0.9), '다리우스 W: 90% 둔화');
  cw.skillLevels.E = 3; cw._dariusPassiveTick();
  assert(near(cw.armorPenPercent, 0.30), '다리우스 E 패시브: E를 쓰지 않아도 E 레벨대로 방어구 관통 적용');
  const cr = makeChamp('darius');
  const rt = makeEnemy(0, 1, { hp: 3000, maxHp: 3000 });
  for (let i = 0; i < 3; i++) cr._dariusApplyBleed(rt);
  now += 6000;
  const hpBefore = rt.hp;
  cr._dariusROnHit(rt);
  assert(near(hpBefore - rt.hp, CHAMPION_DATA.darius.R.minDamageByLevel[0]), '다리우스 R: 이미 끝난 출혈 중첩은 추가 피해에 포함되지 않는다');
  // R 도약
  const cl = makeChamp('darius');
  const far = makeEnemy(0, 4);
  cl._dariusStartRLeap(far);
  assert(cl._dashState && near(cl._dashState.to.z, 4 - 0.5 - 0.5, 1e-6), '다리우스 R: 대상 바로 앞까지 도약(_dashState)');
}

// ==================================================================
// 마스터 이
// ==================================================================
{
  const c = makeChamp('masteryi');
  applyStatus(c, { id: 'a', type: 'AS_BUFF', duration: 5, value: 0.2 });
  applyStatus(c, { id: 'b', type: 'MASTERYI_R_AS', duration: 5, value: 0.25 });
  assert(near(getAttackSpeedBuffPercent(c), 0.45), '공격 속도 버프: 서로 다른 버프는 합산(예전 max)');

  c._payCost = () => true; c.setSubState = () => {};
  applyStatus(c, { id: 'oldSlow', type: 'SLOW', duration: 3, value: 0.5 });
  c._masteryiCastR(true);
  assert(!c.statusEffects.some((s) => s.type === 'SLOW'), '마스터 이 R: 시전 시 둔화 제거');
  assert(applyStatus(c, { id: 'newSlow', type: 'SLOW', duration: 3, value: 0.5 }) === null && getSlowPercent(c) === 0, '마스터 이 R: 지속 중 둔화 면역');

  // Q - 같은 대상 반복 타격만 25%
  const cq = makeChamp('masteryi');
  const A = makeEnemy(0, 1), B = makeEnemy(0, 2);
  const alpha = { q: CHAMPION_DATA.masteryi.Q, lvl: 1, alreadyHitCount: new Map(), maxHits: 4 };
  const full = CHAMPION_DATA.masteryi.Q.baseDamageByLevel[0] + CHAMPION_DATA.masteryi.Q.adRatio * 100; // 20 + 총 AD 70%(PC 위키)
  const a0 = A.hp; cq._masteryiResolveAlphaStrikeHit(alpha, A, 0);
  const b0 = B.hp; cq._masteryiResolveAlphaStrikeHit(alpha, B, 1);
  assert(near(a0 - A.hp, full) && near(b0 - B.hp, full), '마스터 이 Q: 두 번째 타격이라도 처음 맞는 대상은 100% 피해');
  const a1 = A.hp; cq._masteryiResolveAlphaStrikeHit(alpha, A, 2);
  assert(near(a1 - A.hp, full * 0.25), '마스터 이 Q: 같은 대상 추가 타격은 25%');

  // W - 채널 동안 매 초 회복(중간에 끊어도 그만큼 회복)
  const cw = makeChamp('masteryi', [], { hp: 1000, maxHp: 2000 });
  cw.currentActionKey = 'masteryiW';
  cw._masteryiWTick(1.0);
  const W = CHAMPION_DATA.masteryi.W;
  assert(near(cw.hp, 1000 + W.healPerSecByLevel[0] * 1.5), '마스터 이 W: 1초 채널 → 초당 회복 × (1 + 잃은 체력 50%)');

  // 2연속 공격 2타에도 E 고정 피해
  const ce = makeChamp('masteryi');
  applyStatus(ce, { id: 'masteryiE', type: 'MASTERYI_E', duration: 5, value: 1 });
  ce._masteryi.attackCount = 3;
  const t = makeEnemy(0, 1, { armor: 0 });
  const t0 = t.hp;
  ce._masteryiOnBasicAttackHit(t);
  const E = CHAMPION_DATA.masteryi.E;
  assert(near(t0 - t.hp, 100 * 0.5 + 2 * E.trueDamageByLevel[0]), '마스터 이: 2연속 공격 2타에도 E 고정 피해가 붙는다');

  // 처치 판정 - 허수아비도 챔피언 역할, 단 2% 바닥 반복 타격은 제외
  assert(ce._masteryiIsChampionTarget(makeEnemy(0, 1, { isTrainingDummy: true, hp: 500, maxHp: 1000 })), '마스터 이: 허수아비(챔피언 역할)도 처치 판정 대상');
  assert(!ce._masteryiIsChampionTarget(makeEnemy(0, 1, { isTrainingDummy: true, hp: 20, maxHp: 1000 })), '마스터 이: 2% 바닥 허수아비 반복 타격은 처치 아님');
}

// ==================================================================
// 리 신
// ==================================================================
const LEE_CLIPS = [
  { name: 'Spell1', duration: 1.167 }, { name: 'Spell1_ToIdle', duration: 0.967 }, { name: 'Spell1_B.ASU_LeeSin.anm', duration: 0.667 },
  { name: 'Spell2', duration: 1.333 }, { name: 'Spell2_ToIdle', duration: 1.267 },
  { name: 'Spell2b_Idle.ASU_LeeSin.anm', duration: 0.833 }, { name: 'Spell2b_Run.ASU_LeeSin.anm', duration: 0.667 },
  { name: 'Spell3', duration: 2.167 }, { name: 'Spell3_ToIdle', duration: 1.033 },
  { name: 'Spell3_b_idle.ASU_LeeSin.anm', duration: 0.767 }, { name: 'Spell3_b_moving.ASU_LeeSin.anm', duration: 1.167 },
  { name: 'Spell4', duration: 0.3 }, { name: 'Spell4_ToIdle', duration: 0.967 },
];
{
{
  timers = [];
  // E1: 0.25초만 묶이고(예전 2.167초), 입력이 없으면 Spell3 → Spell3_ToIdle → Idle
  const c = makeChamp('leesin', LEE_CLIPS);
  const e = makeEnemy(0, 1);
  stubs.placedDummies = [e];
  c.canStartNewAction = () => true;
  c._leesinCastE(true);
  assert(c.currentActionKey === 'leesinE' && c._isLeeSinCastLock(), '리 신 E: 시전 직후 행동 잠금');
  advance(260);
  assert(c.currentActionKey === null, '리 신 E: 원작 시전 시간 0.25초 뒤 잠금 해제(예전엔 Spell3 길이 2.17초)');
  // 판정(폭풍 피해)은 이제 시전 시간이 끝나는 0.25초에 발생하므로 패시브도 그때 걸린다.
  assert(near(getStatus(c, 'leesinPassive_as').duration, 3), '리 신 패시브: 공격 속도 버프 3초(E 판정 시점)');
  advance(3500); // Spell3 나머지(1.87초) + Spell3_ToIdle(1.03초)
  assert(c.played.includes('Spell3_ToIdle') && c.played[c.played.length - 1] === 'LOCOMOTION', '리 신 E: 입력이 없으면 Spell3 → Spell3_ToIdle → Idle');

}
{
  // E2(재시전 창 3초 안): 4초에 걸쳐 약해지는 둔화 + 전용 정지 클립
  timers = [];
  const c = makeChamp('leesin', LEE_CLIPS);
  const e = makeEnemy(0, 1);
  stubs.placedDummies = [e];
  c.canStartNewAction = () => true;
  c._leesinCastE(true);
  advance(500);
  c._leesinCastE(true);
  const slow = getStatus(e, 'leesinE_slow');
  assert(slow && slow.decayLinear && slow.duration === 4, '리 신 E2: 4초에 걸쳐 감소하는 둔화');
  assert(c.played[c.played.length - 1] === 'Spell3_b_idle.ASU_LeeSin.anm', '리 신 E2: 실제 GLB 전용 클립(Spell3_b_idle) 재생');
}

  // Q1: 0.25초 잠금 + 복귀 클립 이름 오타 수정(Spell1_ToIdle)
  timers = [];
  const cq = makeChamp('leesin', LEE_CLIPS);
  cq.canStartNewAction = () => true;
  stubs.placedDummies = [];
  cq._leesinCastQ(new Vector3(0, 0, 5), true);
  assert(cq.currentActionKey === 'leesinQ', '리 신 Q1: 시전 시간 동안 행동 잠금(평타가 Spell1을 바로 덮지 않음)');
  advance(260);
  assert(cq.currentActionKey === null, '리 신 Q1: 0.25초 뒤 잠금 해제');
  advance(2500);
  assert(cq.played.includes('Spell1_ToIdle'), '리 신 Q1: 실제 클립명 Spell1_ToIdle로 복귀(예전 Spell1_Toldle 오타)');

  // Q2: 피해는 돌진 도착 시점
  timers = [];
  const c2 = makeChamp('leesin', LEE_CLIPS);
  const m = makeEnemy(0, 4, { hp: 1000, maxHp: 2000 });
  c2._leesin.qMarkTarget = m; c2._leesin.qMarkExpiresAt = now + 3000;
  c2._leesinCastQ(null, true);
  assert(m.hp === 1000, '리 신 Q2: 돌진 시작 순간엔 아직 피해 없음');
  advance(400);
  const Q = CHAMPION_DATA.leesin.Q;
  const expect = Q.damageByLevel[0] + (Q.maxDamageByLevel[0] - Q.damageByLevel[0]) * 0.5;
  assert(near(1000 - m.hp, expect), '리 신 Q2: 도착 시점에 잃은 체력(50%) 비례 피해');

  // R: 0.25초 뒤 착탄 + 경로 충돌
  timers = [];
  const cr = makeChamp('leesin', LEE_CLIPS);
  cr.canStartNewAction = () => true; cr._payCost = () => true;
  const kicked = makeEnemy(0, 0.8, { bonusHealth: 1000 });
  const behind = makeEnemy(0, 0.8 + lolRangeToWorld(600));
  const side = makeEnemy(5, 0.8 + lolRangeToWorld(600));
  stubs.placedDummies = [kicked, behind, side];
  cr.currentTarget = kicked;
  cr._leesinCastR(true);
  assert(kicked.hp === 3000, '리 신 R: 시전 즉시가 아니라 시전 시간 뒤 착탄');
  advance(260);
  const R = CHAMPION_DATA.leesin.R;
  assert(near(3000 - kicked.hp, R.damageByLevel[0]), '리 신 R: 착탄 피해');
  advance(1100);
  assert(near(3000 - behind.hp, R.damageByLevel[0] + 1000 * 0.12) && !!getStatus(behind, 'leesinR_collide_air'), '리 신 R: 날아가는 대상과 부딪힌 적은 피해(+차인 대상 추가 체력 12%) + 공중에 뜸');
  assert(side.hp === 3000, '리 신 R: 경로 밖의 적은 충돌 없음');
}

// ==================================================================
// 노틸러스 - 패시브 전용 모션
// ==================================================================
{
  const c = makeChamp('nautilus', ['Attack1', 'Attack4', 'Passive']);
  c._nautilusReset();
  const e = makeEnemy(0, 1);
  c._nautilusArmPassiveAnim(e);
  const ov = c.attackOverrides.find((o) => o.id === 'nautilusPassive');
  assert(ov && ov.clips[0] === 'Passive' && ov.priority > 10, '노틸러스: 패시브가 터질 평타는 실제 GLB의 Passive 클립(W보다 우선)');
  c._nautilus.passiveReadyAt.set(e, now + 6000);
  c._nautilusArmPassiveAnim(e);
  assert(!c.attackOverrides.some((o) => o.id === 'nautilusPassive'), '노틸러스: 같은 대상 쿨다운 중엔 일반 평타 모션');
}
