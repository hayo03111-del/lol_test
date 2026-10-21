// 3차 점검 회귀 테스트: 평타 선딜/공속 계수, 피해 감소 곱연산, Data Dragon 대조 수치, 7챔피언 PC 위키 대조 수정.
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
  THREE: { Vector3, LoopOnce: 2200, LoopRepeat: 2201, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
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
  'src/champions/leesin.js', 'src/champions/nautilus.js', 'src/champions/yasuo.js', 'src/champions/yone.js',
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
this.calculateDamage = calculateDamage;
this.isStunned = isStunned;
this.isRooted = isRooted;
this.tickStatusEffects = tickStatusEffects;
this.getMoveSpeedBuffPercent = getMoveSpeedBuffPercent;
this.getWindupDuration = getWindupDuration;
this.getDamageReductionPercent = getDamageReductionPercent;
this.SKILL_TIMING_DATABASE = SKILL_TIMING_DATABASE;
this.applyMoveSpeedSoftCap = applyMoveSpeedSoftCap;
this.resistDamageMultiplier = resistDamageMultiplier;
this.prdConstant = prdConstant;
this.isGhosted = isGhosted;
this.setController = (c) => { controller = c; };
`, context);
const { CharacterController, CHAMPION_DATA, STATE, applyStatus, applyDamage, getStatus, getSlowPercent,
  getAttackSpeedBuffPercent, getTenacity, computeChampionStats, lolRangeToWorld, setController, worldDistanceToLol, calculateDamage, isStunned, isRooted, tickStatusEffects, getMoveSpeedBuffPercent, getFinalAttackSpeed, getWindupDuration, getDamageReductionPercent, applyMoveSpeedSoftCap, resistDamageMultiplier, prdConstant, isGhosted } = context;

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




stubs.scene = { add() {}, remove() {} };
// --- 평타 선딜(PC 위키 공식) / 공속 계수 ---
{
  const g = computeChampionStats('garen', 1);
  const st = { baseAttackSpeed: g.baseAttackSpeed, levelBonusAttackSpeed: 0, bonusAttackSpeedPercent: 1.0, attackSpeedMultiplier: 1, minAttackSpeed: 0.2, maxAttackSpeed: 2.5, windupPercent: 0.18, windupModifier: 0.5, attackSpeedRatio: g.baseAttackSpeed };
  const baseWindup = 0.18 / 0.625, cur = 1 / getFinalAttackSpeed(st);
  assert(near(getWindupDuration(st), baseWindup + 0.5 * (cur * 0.18 - baseWindup)), '선딜: 가렌 18%·보정 0.5 공식(공속이 올라도 선딜이 절반만 줄어듦)');
  assert(CHAMPION_DATA.nautilus.stats.windupPercent === 0.30637 && CHAMPION_DATA.leesin.stats.windupPercent === 0.19531, '선딜: 챔피언별 PC 위키 값(노틸러스 30.637%, 리 신 19.531%)');
  const n = computeChampionStats('nautilus', 1);
  const ns = { baseAttackSpeed: n.baseAttackSpeed, attackSpeedRatio: n.attackSpeedRatio, levelBonusAttackSpeed: 0, bonusAttackSpeedPercent: 1.0, attackSpeedMultiplier: 1, minAttackSpeed: 0.2, maxAttackSpeed: 2.5 };
  assert(near(getFinalAttackSpeed(ns), 0.706 + 0.612 * 1.0), '공속 계수: 노틸러스 총 공속 = 0.706 + 추가 공속 × 0.612');
}
// --- 피해 감소: 서로 다른 출처 곱연산, 같은 그룹 최대값, 포탑 절반 ---
{
  const u = { statusEffects: [] };
  applyStatus(u, { id: 'a', type: 'DAMAGE_REDUCTION', duration: 5, value: 0.3 });
  applyStatus(u, { id: 'b', type: 'DAMAGE_REDUCTION', duration: 5, value: 0.5 });
  assert(near(getDamageReductionPercent(u), 1 - 0.7 * 0.5), '피해 감소: 다른 출처는 곱연산(30%+50% → 65%)');
  const y = { statusEffects: [] };
  applyStatus(y, { id: 'w1', type: 'DAMAGE_REDUCTION', drGroup: 'g', duration: 5, value: 0.7, halfVsTurret: true });
  applyStatus(y, { id: 'w2', type: 'DAMAGE_REDUCTION', drGroup: 'g', duration: 5, value: 0.45, halfVsTurret: true });
  assert(near(getDamageReductionPercent(y), 0.7), '피해 감소: 같은 스킬 단계(drGroup)는 최대값만(마스터 이 명상 70%)');
  assert(near(getDamageReductionPercent(y, { isTurret: true }), 0.35), '피해 감소: 명상은 포탑 피해에 절반만');
}
// --- 마스터 이 Q: 총 공격력 70%, 일반 치명타 배율, 몬스터 추가 ---
{
  const c = makeChamp('masteryi');
  const alpha = { q: CHAMPION_DATA.masteryi.Q, lvl: 1, alreadyHitCount: new Map(), maxHits: 4 };
  const t = makeEnemy(0, 1);
  alpha.currentTarget = t;
  assert(near(c._masteryiCalcAlphaStrikeDamage(alpha, 0), 20 + 0.7 * 100), '마스터 이 Q: 20 + 총 공격력 70%');
  assert(near(c._masteryiCalcAlphaStrikeCritDamage(alpha, 0), (20 + 70) * 1.75), '마스터 이 Q 치명타: 일반 치명타 배율(1.75)');
  alpha.currentTarget = makeEnemy(0, 1, { isMonster: true, isChampion: false });
  assert(near(c._masteryiCalcAlphaStrikeDamage(alpha, 0), 20 + 70 + 60), '마스터 이 Q: 몬스터 추가 피해 60(1랭크)');
}
// --- 마스터 이 W: 초당 2연속 공격 중첩, 피해 감소 0.5초 잔존 ---
{
  const c = makeChamp('masteryi', [], { hp: 1000, maxHp: 2000 });
  c._masteryiArmPassiveAttack = () => { c.armed = true; };
  c.currentActionKey = 'masteryiW'; c._masteryi.attackCount = 0; c._masteryi.wStackAccum = 0;
  c._masteryiWTick(1.0); c._masteryiWTick(1.0); c._masteryiWTick(1.0); c._masteryiWTick(1.0);
  assert(c._masteryi.attackCount === 3 && c.armed, '마스터 이 W: 1초마다 2연속 공격 중첩 1, 최대 3(다음 평타가 2연속)');
  c.mixer = { removeEventListener() {} };
  c._masteryiEndMeditate('natural');
  assert(!!getStatus(c, 'masteryiW_linger'), '마스터 이 W: 채널 종료 후 피해 감소 0.5초 잔존');
}
// --- 다리우스 ---
{
  const c = makeChamp('darius');
  const handleT = makeEnemy(0, 1);
  c._dariusQOnHit(handleT, lolRangeToWorld(100));
  assert(c._dariusLiveStacks(handleT) === 0, '다리우스 Q: 자루에 맞은 적은 출혈 중첩 없음(PC 위키)');
  assert(CHAMPION_DATA.darius.passive.dotTickInterval === 1.25, '다리우스 출혈: 1.25초마다 틱');
  const r = makeEnemy(0, 1, { hp: 50, maxHp: 3000 });
  c._dariusROnHit(r);
  assert(c.bonusAD > 0, '다리우스 R: 챔피언 처치 시 녹서스의 힘 발동');
  const fl = makeEnemy(0, 1, { isTrainingDummy: true, hp: 60, maxHp: 3000 });
  const c2 = makeChamp('darius'); c2._rRecastReadyUntil = 0;
  c2._dariusROnHit(fl);
  assert(!c2._rRecastReadyUntil, '다리우스 R: 2% 바닥 허수아비 반복 타격은 처치 아님(무한 재시전 방지)');
  const c3 = makeChamp('darius', [], { mp: 0, maxMp: 500 }); c3.cooldowns.W = 5;
  const armored = makeEnemy(0, 1, { hp: 45, maxHp: 3000, armor: 100 }); // 원본 50 > 45지만 방어력 후 25
  c3._dariusWOnHit(armored);
  assert(c3.cooldowns.W === 5, '다리우스 W: 방어력 적용 후 피해로 처치 판정(처치 아니면 환급 없음)');
}
// --- 리 신 / 가렌 / 노틸러스 / 야스오 ---
{
  assert(CHAMPION_DATA.leesin.W.shieldByLevel[0] === 60 && CHAMPION_DATA.leesin.W.shieldByLevel[4] === 240, '리 신 W: 방호 보호막 60~240(26.10)');
  timers = [];
  const g = makeChamp('garen'); g._payCost = () => true;
  const t = makeEnemy(0, lolRangeToWorld(200), { hp: 2000, maxHp: 3000 });
  g.currentTarget = t; g.currentActionKey = 'eChannel';
  g._garenCastRDuringE();
  advance(500);
  assert(t.hp < 2000 && g.currentActionKey === 'eChannel', '가렌: E 회전 중 R 사용 가능, 회전은 유지');
  assert(CHAMPION_DATA.nautilus.R.castTimeSec === 0.46 && CHAMPION_DATA.nautilus.stats.ad === 58 && CHAMPION_DATA.nautilus.stats.attackSpeed === 0.706, '노틸러스: R 시전 0.46초, 기본 공격력 58·공속 0.706(Data Dragon)');
  const n = makeChamp('nautilus', [], { champLevel: 1 }); n._nautilusReset();
  const e = makeEnemy(0, 1);
  const hp0 = e.hp; n._nautilusOnBasicAttackHit(e);
  assert(near(hp0 - e.hp, 14), '노틸러스 패시브: 1레벨 추가 피해 14(예전 8)');
  // 야스오 Q 적중 시 효과: 첫 대상만
  const y = makeChamp('yasuo');
  const calls = [];
  stubs.itemOnBasicAttackHit = (ctrl, target, crit, opts) => calls.push({ target, opts });
  vm.runInContext('itemOnBasicAttackHit = this.itemOnBasicAttackHit;', context);
  const a = makeEnemy(0, 1), b = makeEnemy(0, 2);
  y._yasuoQHitConsumed = false; y._yasuoQCritRoll = false;
  y._yasuoApplyQHit(a); y._yasuoApplyQHit(b);
  assert(calls.length === 1 && calls[0].target === a && calls[0].opts.fromAbility, '야스오 Q: 처음 맞은 대상에게만 적중 시 효과(주문검 제외 옵션)');
  assert(CHAMPION_DATA.yasuo.R.knockupDuration === 1 && CHAMPION_DATA.yasuo.stats.adGrowth === 2.5, '야스오: R 공중에 뜸 1초, 레벨당 공격력 2.5(PC 위키)');
}

// ================= 4차: 추가 전투 요소 =================
{
  assert(applyMoveSpeedSoftCap(400) === 400 && near(applyMoveSpeedSoftCap(450), 415 + 35 * 0.8) && near(applyMoveSpeedSoftCap(600), 415 + 75 * 0.8 + 110 * 0.5) && near(applyMoveSpeedSoftCap(200), 210), '이동 속도 소프트캡(415 초과 80%, 490 초과 50%, 220 미만 50%)');
  assert(near(resistDamageMultiplier(100), 0.5) && near(resistDamageMultiplier(-20), 2 - 100 / 120), '음수 저항: 2 - 100/(100 - 저항)');
  const tgt = { magicResist: 5, statusEffects: [{ type: 'MR_SHRED', value: 15, expiresAt: now + 5000 }] };
  assert(near(calculateDamage({ rawDamage: 100, damageType: 'MAGICAL', target: tgt, source: {} }), 100 * (2 - 100 / 110)), '고정 마법 저항 감소는 음수까지 내려가 피해가 증가(예전엔 0에서 멈춤)');
  assert(near(prdConstant(0.25), 0.0847, 2e-4) && near(prdConstant(0.5), 0.3021, 2e-4), '치명타 PRD 상수(원작 알려진 값: 25%→0.0847, 50%→0.302)');
  const c = makeChamp('garen'); c.stats.critChance = 0.25;
  let hits = 0; for (let i = 0; i < 40000; i++) if (c._rollBasicAttackCrit()) hits++;
  assert(Math.abs(hits / 40000 - 0.25) < 0.01, '치명타 PRD: 장기 평균은 표기 확률(25%) 그대로');
}
{
  const c = makeChamp('garen', [], { champLevel: 5 });
  CharacterController.prototype.recomputeStats.call(c);
  c.hp = c.maxHp - 300;
  const before = c.maxHp;
  c.champLevel = 6; CharacterController.prototype.recomputeStats.call(c);
  assert(near(c.maxHp - c.hp, 300), '레벨업: 늘어난 최대 체력만큼 현재 체력도 증가(잃은 체력 300 유지 - 원작)');
  c.itemBonusMaxHp = 400; CharacterController.prototype.recomputeStats.call(c);
  assert(near(c.maxHp - c.hp, 300), '체력 아이템 구매: 현재 체력도 같이 증가');
  c.itemBonusMaxHp = 0; CharacterController.prototype.recomputeStats.call(c);
  assert(c.hp <= c.maxHp, '판매: 현재 체력은 새 최대치로만 잘림');
}
{
  const y = makeChamp('masteryi'); y._payCost = () => true; y.setSubState = () => {};
  y._masteryiCastR(true);
  assert(isGhosted(y), '마스터 이 R: 유령화(유닛 통과)');
  const y2 = makeChamp('masteryi'); y2.cooldowns.Q = 10;
  const t = makeEnemy(0, 1, { hp: 10, maxHp: 1000 });
  y2._onBasicAttackHit(t, null, true, null, false);
  assert(near(y2.cooldowns.Q, 10 * 0.3 - 1) || y2.cooldowns.Q < 10 * 0.3 + 0.01, '마스터 이: 평타로 챔피언 처치 시 기본 스킬 쿨감 70% 발동(예전엔 누락)');
}
{
  const l = makeChamp('leesin', [], { hp: 500, maxHp: 1000 });
  applyStatus(l, { id: 'leesinW_vamp', type: 'LEESIN_W_VAMP', duration: 4, value: 0.1 });
  const t = makeEnemy(0, 1); t._lastDamageTakenAmount = 100;
  l._leesin.passiveHitsLeft = 0;
  l._leesinOnBasicAttackHit(t);
  assert(near(l.hp, 510), '리 신 W2: 패시브 없이도 평타 흡혈 적용(예전엔 패시브 횟수가 있어야만)');
  l._leesin.passiveHitsLeft = 2; const mp0 = l.mp; // 패시브 버프(3초) 없음
  l._leesinOnBasicAttackHit(t);
  assert(l.mp === mp0 && l._leesin.passiveHitsLeft === 0, '리 신 패시브: 3초 버프가 끝나면 남은 기력 회복 횟수도 소멸');
}
