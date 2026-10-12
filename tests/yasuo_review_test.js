// 야스오 시스템 재점검 회귀 테스트(치명타 '의지', Q 피해/쿨다운/판정, EQ, 회오리, 결의 보호막, E 돌진, R 대상/피해, 바람 장막).
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
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  distanceToSquared(v){const d=this.distanceTo(v);return d*d;}
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
  THREE: { Vector3, LoopOnce: 2200, LoopRepeat: 2201, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), smoothstep: (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); } } },
};
const context = vm.createContext(stubs);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
vm.runInContext([
  'src/core/00_global_constants.js', 'src/core/01_status_effect_system.js', 'src/core/shield_system.js', 'src/core/01_hit_detection.js',
  'src/core/skill_timing_database.js',
  'src/champions/champion_data.js', 'src/champions/champion_ability_database.js',
  'src/core/character_controller.js', 'src/core/controller_movement.js', 'src/core/controller_combat.js',
  'src/core/controller_casting.js', 'src/core/controller_lifecycle.js',
  'src/champions/garen.js', 'src/champions/darius.js', 'src/champions/masteryi.js',
  'src/champions/leesin.js', 'src/champions/nautilus.js', 'src/champions/yasuo.js',
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
this.worldDistanceToLol = worldDistanceToLol;
this.getFinalAttackSpeed = getFinalAttackSpeed;
this.setController = (c) => { controller = c; };
`, context);
const { CharacterController, CHAMPION_DATA, STATE, applyStatus, applyDamage, getStatus, getSlowPercent,
  getAttackSpeedBuffPercent, getTenacity, computeChampionStats, lolRangeToWorld, setController, worldDistanceToLol } = context;

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


const Y = CHAMPION_DATA.yasuo;
const realRecompute = CharacterController.prototype.recomputeStats;
function makeYasuo(overrides = {}) {
  const c = makeChamp('yasuo', ['Spell1A', 'Spell1B', 'Spell1C', 'Spell1_Dash', 'Spell2_0', 'Spell2_90', 'Spell2_-90', 'Spell2_180', 'Spell2_-180', 'Spell2_BASE', 'Spell3', 'Spell4'], overrides);
  c.stats.critChance = 0; c.mp = 0;
  c.runAction = function(key, state, opts) { this.lastRunAction = { key, opts }; this.currentActionKey = key; };
  return c;
}
function recompute(c) {
  c.itemBonusAD = c.itemBonusAD || 0;
  realRecompute.call(c);
}

// --- 패시브 "의지": 치명타 2배, 초과분 공격력 ---
{
  const c = makeYasuo({ champLevel: 1 });
  c.maxHp = 0; c.hp = 0;
  c.itemBonusCritChance = 0;
  recompute(c);
  assert(c.stats.critChance === 0, '야스오 의지: 아이템 치명타가 없으면 치명타 확률 0(예전엔 항상 100%)');
  const baseAd = c.stats.attackDamage;
  c.itemBonusCritChance = 0.25; recompute(c);
  assert(near(c.stats.critChance, 0.5), '야스오 의지: 치명타 25% → 50%(2배)');
  c.itemBonusCritChance = 0.6; recompute(c);
  assert(near(c.stats.critChance, 1) && near(c.stats.attackDamage - baseAd, 20 * 0.5), '야스오 의지: 60%×2=120% → 100% + 초과 20%×0.5 = 공격력 +10');
  c.itemBonusCritChance = 0.6; recompute(c);
  assert(near(c.stats.attackDamage - baseAd, 10), '야스오 의지: 다시 계산해도 초과분 공격력이 중복으로 쌓이지 않음');
}

// --- Q 피해: 치명타 이중 적용 제거, 치명타는 AD 계수 부분에만 ---
{
  const c = makeYasuo();
  const e = makeEnemy(0, 1);
  c.stats.critChance = 0;
  c._yasuoQCritRoll = false;
  const hp0 = e.hp; c._yasuoApplyQHit(e);
  assert(near(hp0 - e.hp, 20 + 100 * 1.05), '야스오 Q: 비치명타 = 20 + 공격력 105%');
  c._yasuoQCritRoll = true;
  const hp1 = e.hp; c._yasuoApplyQHit(e);
  assert(near(hp1 - e.hp, 20 + 100 * 1.05 * 1.75), '야스오 Q: 치명타 = 20 + 공격력 105% × 치명타 배율 1.75(예전엔 배율이 두 번 곱해짐)');
  c._yasuoQCritRoll = null;
}

// --- Q 쿨다운/시전 시간: 추가 공속 비례(요네와 같은 관계식), 레벨 무관 기준값 ---
{
  const c = makeYasuo({ champLevel: 1 });
  c.skillLevels.Q = 5;
  c.stats.baseAttackSpeed = Y.stats.attackSpeed; c.stats.bonusAttackSpeedPercent = 0;
  assert(near(c._yasuoQCooldown(), 4) && near(c._yasuoQCastTime(), 0.35), '야스오 Q: 추가 공속 0이면 쿨다운 4초/시전 0.35초(스킬 레벨 무관, 예전엔 5레벨이면 1.33초)');
  c.stats.bonusAttackSpeedPercent = 0.5;
  assert(near(c._yasuoQCooldown(), 4 * (1 - 0.30)), '야스오 Q: 추가 공속 50% → 쿨다운 30% 감소(1%당 0.6%)');
  c.stats.bonusAttackSpeedPercent = 0.02;
  assert(c._yasuoQCooldown() > 3.9, '야스오 Q: 추가 공속 2%로 곧바로 최대 감소에 붙던 버그 수정');
  c.stats.bonusAttackSpeedPercent = 3;
  assert(near(c._yasuoQCooldown(), 4 * (1 - 0.6667)) && near(c._yasuoQCastTime(), 0.35 * 0.5), '야스오 Q: 감소 상한(쿨다운 66.67%, 시전 50%)');
}

// --- Q1 직선 판정 ---
{
  const c = makeYasuo();
  const front = makeEnemy(0, lolRangeToWorld(300));
  const side = makeEnemy(lolRangeToWorld(200), lolRangeToWorld(300));
  const back = makeEnemy(0, -lolRangeToWorld(200));
  stubs.placedDummies = [front, side, back];
  const hits = c._yasuoFindQTargets(new Vector3(0, 0, 1), Y.Q.range);
  assert(hits.length === 1 && hits[0] === front, '야스오 Q1: 폭 80 직선 안의 적만(옆/뒤 제외, 예전엔 인자 오류로 원형 판정)');
}

// --- EQ: 돌진 끝에서 원형 판정, 3중첩 EQ도 회오리 사거리(1150)가 아니라 원 반경 ---
{
  timers = [];
  const c = makeYasuo();
  const near1 = makeEnemy(0, lolRangeToWorld(200));
  const far1 = makeEnemy(0, lolRangeToWorld(900));
  stubs.placedDummies = [near1, far1];
  c._yasuo.qStacks = 2;
  c._yasuoResolveEQ({ tornado: true, stackBefore: 2, dir: new Vector3(0, 0, 1) });
  assert(!!getStatus(near1, 'yasuoQKnockup') && !getStatus(far1, 'yasuoQKnockup'), '야스오 EQ3: 원(375) 안만 공중에 뜸(예전엔 1150 안 전부)');
  assert(c._yasuo.qStacks === 0, '야스오 EQ3: 중첩 소모');
  // 실제 E 중 Q 입력 → 돌진 종료 시 판정
  const c2 = makeYasuo();
  c2._payCost = () => true;
  const t = makeEnemy(0, lolRangeToWorld(300));
  stubs.placedDummies = [t];
  c2.currentActionKey = 'yasuoE'; c2.currentPhase = 'ACTIVE';
  c2._yasuo.eDashStart = new Vector3(0, 0, 0); c2._yasuo.eDashEnd = new Vector3(0, 0, lolRangeToWorld(250)); c2._yasuo.eDashDuration = 0.3;
  c2._yasuoCastQ(null, true);
  assert(t.hp === 3000 && c2._yasuo.eqPending, '야스오 EQ: 돌진 중에는 아직 판정하지 않고 예약');
  c2._yasuoFinishEDash();
  assert(t.hp < 3000 && c2._yasuo.qStacks === 1, '야스오 EQ: 돌진이 끝나는 순간 주변 판정 + 중첩 1');
}

// --- Q3 회오리: 폭은 "전체 폭", 날리는 순간 중첩 소모 ---
{
  const c = makeYasuo();
  c._yasuo.qStacks = 2;
  c._yasuoStartQ3Tornado(new Vector3(0, 0, 1));
  assert(c._yasuo.qStacks === 0, '야스오 Q3: 회오리를 날리는 순간 중첩 소모(예전엔 비행이 끝난 뒤)');
  assert(near(c._yasuo.qTornadoTravel.halfWidth, lolRangeToWorld(Y.Q.tornadoWidth) / 2), '야스오 Q3: 반폭 = 폭/2(예전엔 폭 값을 반폭으로 써서 2배 넓음)');
}

// --- 결의: 기류는 LoL 거리 기준, 보호막 1초, 챔피언/몬스터 피해에만 ---
{
  const c = makeYasuo({ champLevel: 1 });
  c._yasuo.flow = 0; c._yasuo.lastMovePosition = c.root.position.clone();
  c.root.position.z = lolRangeToWorld(590);
  c._yasuoGainFlowFromMovement(0.1);
  assert(near(c._yasuo.flow, 10, 1e-6), '야스오 결의: 590유닛 이동 → 기류 10(59유닛당 1, 예전엔 월드 거리 기준이라 거의 안 참)');
  c._yasuo.flow = 100;
  c._yasuoOnTakeDamage({ isMinion: true });
  assert(c.shield === 0 && c._yasuo.flow === 100, '야스오 결의: 미니언 피해로는 보호막이 안 터짐');
  c._yasuoOnTakeDamage({ isChampion: true });
  assert(near(c.shield, Y.passive.shieldBase) && c._yasuo.flow === 0, '야스오 결의: 챔피언 피해 → 보호막 125(1레벨), 기류 0');
  now += 1100;
  c._yasuoTick(0.016); context.tickShields(c, 0.016); // 만료는 공용 보호막 틱이 처리
  assert(c.shield === 0, '야스오 결의: 보호막은 1초 뒤 사라짐(예전엔 영구)');
}

// --- E: 대상을 관통해 고정 475, 속도 750+0.6×이속 ---
{
  timers = [];
  const c = makeYasuo();
  c._payCost = () => true;
  const t = makeEnemy(0, lolRangeToWorld(200));
  stubs.placedDummies = [t];
  c.currentTarget = t;
  c.stats.moveSpeed = 0; // getFinalMoveSpeed 폴백 → 데이터 이동 속도 345
  c._yasuoCastE(null, true);
  assert(near(c._yasuo.eDashEnd.z, lolRangeToWorld(475)), '야스오 E: 대상을 지나 475만큼 돌진(예전엔 대상 앞에서 멈춤)');
  // 피해는 돌진이 대상(200 지점)에 닿는 순간 - 돌진이 끝나기 전에 들어간다.
  const hp0 = t.hp;
  let steps = 0;
  while (t.hp === hp0 && c._yasuo.eDashStart && steps < 200) { c._yasuoTick(0.01); steps++; }
  assert(t.hp < hp0 && !!c._yasuo.eDashStart, '야스오 E: 대상에 닿는 순간 피해(돌진 종료 전)');
  const hpHit = t.hp;
  while (c._yasuo.eDashStart && steps < 400) { c._yasuoTick(0.01); steps++; }
  assert(t.hp === hpHit, '야스오 E: 피해는 한 번만');
}

// --- R: 챔피언만, 기준 대상 주변 400, 추가 공격력 계수 ---
{
  const c = makeYasuo();
  const a = makeEnemy(0, lolRangeToWorld(600));
  const b = makeEnemy(lolRangeToWorld(300), lolRangeToWorld(600));
  const farUp = makeEnemy(0, lolRangeToWorld(1300));
  const minion = makeEnemy(-lolRangeToWorld(100), lolRangeToWorld(600), { isChampion: false });
  for (const u of [a, b, farUp, minion]) applyStatus(u, { id: 'k', type: 'KNOCKUP', duration: 1, value: 1 });
  stubs.placedDummies = [a, b, farUp, minion];
  const targets = c._yasuoFindRTargets(a);
  assert(targets.includes(a) && targets.includes(b) && !targets.includes(farUp), '야스오 R: 기준 대상 주변 400 안의 공중에 뜬 챔피언만(예전엔 야스오 주변 1400 전부)');
  assert(!targets.includes(minion), '야스오 R: 미니언은 대상이 아니다');
  c._payCost = () => true; c.setSubState = () => {};
  c.currentTarget = a;
  const hp0 = a.hp;
  c._yasuoCastR(true);
  c.lastRunAction.opts.onFire();
  assert(near(hp0 - a.hp, Y.R.damageByLevel[0] + 1.5 * c._getBonusAD()), '야스오 R: 200 + "추가" 공격력 150%(예전엔 총 공격력 150%)');
}

// --- 공용: 추가 공격력에는 레벨 성장분이 들어가지 않는다 ---
{
  const c = makeChamp('garen', [], { champLevel: 18 });
  c.stats.attackDamage = computeChampionStats('garen', 18).attackDamage + 40;
  assert(near(CharacterController.prototype._getBonusAD.call(c), 40), '공용 _getBonusAD: 18레벨 성장 공격력은 추가 공격력이 아니다(아이템 40만)');
}
