// 5차 점검 회귀 테스트: 나머지 10챔피언(세트/모데카이저/레넥톤/닐라/초가스/이즈리얼/애쉬/바루스/벡스/아리) PC 위키·Data Dragon 대조 수정.
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
let lastIntervalFn = null; // setInterval은 마지막 콜백만 잡아 두고 테스트에서 직접 호출한다
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
  setLength(n){return this.normalize().multiplyScalar(n);}
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
  setInterval: (fn) => { lastIntervalFn = fn; return 4242; },
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
  projectiles: { spawned: [], spawn(o) { this.spawned.push(o); } },
  applyDamageToMinion: (m, r) => { m.hp = Math.max(0, m.hp - r.rawDamage); return r.rawDamage; },
  killMinion: () => {}, getHorizontalDistanceOf: () => 0, abilityHasteCooldown: (c, cd) => cd,
  vfx: { spawn: () => {} },
  document: { getElementById: () => null },
  window: {},
  THREE: { Vector3, DoubleSide: 2, RingGeometry: class {}, MeshBasicMaterial: class {}, FogExp2: class {},
    Mesh: class { constructor() { this.position = new Vector3(); this.rotation = {}; this.userData = {}; this.parent = null; } },
    LoopOnce: 2200, LoopRepeat: 2201, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
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
  'src/champions/sett.js', 'src/champions/mordekaiser.js', 'src/champions/renekton.js', 'src/champions/nilah.js',
  'src/champions/chogath.js', 'src/champions/ezreal.js', 'src/champions/ashe.js', 'src/champions/varus.js',
  'src/champions/vex.js', 'src/world/mordekaiser_death_realm.js',
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
this.vexNotifyEnemyDash = vexNotifyEnemyDash;
this.getArmorShredPercent = getArmorShredPercent;
this.getMrShredFlat = getMrShredFlat;
this.addShield = addShield;
this.getShieldById = getShieldById;
this.BASE_UNIT = BASE_UNIT;
this.getAllEnemyUnits = getAllEnemyUnits;
this.canRealmInteract = canRealmInteract;
this.constrainUnitPosition = constrainUnitPosition;
this.clearStatus = clearStatus;
this.getDeathRealm = getDeathRealm;
this.chogathFeastBonus = chogathFeastBonus;
this.setUnitSizeMod = setUnitSizeMod;
this.addShield = addShield;
this.absorbShieldDamage = absorbShieldDamage;
this.isTaunted = isTaunted;
this.getTauntSource = getTauntSource;
this.getAttackSpeedReductionMultiplier = getAttackSpeedReductionMultiplier;
this.getFinalAttackSpeed = getFinalAttackSpeed;
`, context);
const { CharacterController, CHAMPION_DATA, STATE, applyStatus, applyDamage, getStatus, getSlowPercent,
  getAttackSpeedBuffPercent, getTenacity, computeChampionStats, lolRangeToWorld, setController, worldDistanceToLol, calculateDamage, isStunned, isRooted, tickStatusEffects, getMoveSpeedBuffPercent, getFinalAttackSpeed, getWindupDuration, getDamageReductionPercent, applyMoveSpeedSoftCap, resistDamageMultiplier, prdConstant, isGhosted, vexNotifyEnemyDash } = context;

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
const enemies = () => stubs.placedDummies;
function place(u) { stubs.placedDummies.push(u); return u; }
function clearPlaced() { stubs.placedDummies.length = 0; }

// --- 세트 ---
{
  const c = makeChamp('sett', [], { stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, critChance: 0, critMultiplier: 1.75, bonusAttackSpeedPercent: 0 } });
  const t = makeEnemy(0, 1);
  c._sett.qUsesRemaining = 2;
  const before = t.hp; c._settQOnHit(t);
  assert(near(before - t.hp, 10 + 3000 * (1 + 1 * 1) / 100), '세트 Q: 10 + 대상 최대 체력 (1% + 공격력 100당 1%) - 공격력 고정 피해 아님');
  c.bonusAD = 100; c._sett.wPendingSpent = 300; clearPlaced(); const t2 = place(makeEnemy(0, 3));
  const b2 = t2.hp; c._settWOnCast(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
  assert(near(b2 - t2.hp, 80 + 300 * (0.25 + 0.25)), 'Sett W: 80 + spent Grit x (25% + 25% per 100 bonus AD)');
  c.bonusAD = 0; c._sett.gritEntries = [{ amount: 400, gainedAt: now }]; c.shield = 0;
  c._settWApplyShield();
  context.tickShields(c, 0.5); const s1 = c.shield; // 보호막 인스턴스 모델의 공용 틱
  advance(800); context.tickShields(c, 0.5);
  assert(near(s1, 400) && c.shield < 400, '세트 W 보호막: 0.75초 동안 그대로, 이후 감소');
  c.champLevel = 18; c._sett.qUsesRemaining = 0; clearPlaced(); const t3 = makeEnemy(0, 1); const b3 = t3.hp;
  c._settOnBasicAttackHit(t3, 'RIGHT');
  assert(near(b3 - t3.hp, 100), '세트 패시브: 18레벨 오른손 추가 피해 100(PC 위키 5~100)');
}
// --- 모데카이저 ---
{
  const c = makeChamp('mordekaiser', [], { maxHp: 2000 });
  const minion = makeEnemy(0, 1, { isChampion: false, isMinion: true });
  c._mordeOnDealtHit(minion, 100); c._mordeOnDealtHit(minion, 100); c._mordeOnDealtHit(minion, 100);
  assert((c._morde.hitStacks || 0) === 0 && !(c._morde.auraExpiresAt > now), '모데카이저 패시브: 미니언 적중은 중첩 없음');
  assert(near(c._morde.dealtBank, 3 * 100 * 0.45 * 0.25), '모데카이저 W: 챔피언 아닌 대상은 저장 효율 25%');
  const champ = makeEnemy(0, 1);
  c._mordeOnDealtHit(champ, 100); c._mordeOnDealtHit(champ, 100); c._mordeOnDealtHit(champ, 100);
  assert(c._morde.auraExpiresAt > now, '모데카이저 패시브: 챔피언 3회 적중 → 오라');
  advance(4100);
  c._mordeOnDealtHit(champ, 100);
  assert(c._morde.hitStacks === 1 && c._morde.auraExpiresAt < now, '모데카이저 패시브: 중첩 4초 만료 후 다시 1부터');
  const lb = CHAMPION_DATA.mordekaiser.Q.levelBonusDamage;
  assert(Math.min(lb.maxLevel - lb.startLevel + 1, 18 - lb.startLevel + 1) * lb.perLevel === 63, '모데카이저 Q: 18레벨 추가 피해 63(V26.20)');
  assert(CHAMPION_DATA.mordekaiser.W.shieldDecayDuration === 4, '모데카이저 W: 보호막 4초');
  {
    let recasts = 0; c._mordeWOnCast = () => {}; c._mordeWOnRecast = () => { recasts++; };
    c._morde.wShieldActiveUntil = 0; c.cooldowns.W = 0; c.mp = 1000;
    c._mordeCastW(true);
    c._mordeCastW(true);
    assert(recasts === 0 && c._morde.wShieldActiveUntil > now, '모데카이저 W: 첫 시전 직후(0.5초 전)에는 재시전 안 됨');
    advance(510);
    c._mordeCastW(true);
    assert(recasts === 1 && c._morde.wShieldActiveUntil === 0, '모데카이저 W: 0.5초 뒤 재시전으로 회복 전환');
  }
}
// --- 레넥톤 ---
{
  const c = makeChamp('renekton', [], { hp: 2000, maxHp: 2000 });
  c._renekton.rage = 50; c._renekton.lastCombatAt = now - 12000; c._renekton.nextRageDecayAt = 0;
  c._renektonTick(0); advance(1000); c._renektonTick(0);
  assert(near(c._renekton.rage, 46), '레넥톤 패시브: 비전투 12초 뒤 초당 4 감소(0.25초마다 1)');
  c._renekton.rage = 0;
  const t = makeEnemy(0, 1);
  const seq = { target: t, empowered: false, hits: 2, hitIndex: 0, raw: 100, stun: 0.75 };
  c._renektonResolveWHit(seq); seq.hitIndex = 1; c._renektonResolveWHit(seq);
  assert(near(c._renekton.rage, 5 + 10 + 5), '레넥톤 W: 챔피언 추가 분노 10은 1회(타격마다 평타 분노 5)');
  c._renekton.rage = 0; c.cooldowns.W = 0; c._renektonCastW(null, false);
  advance(7100); c._renektonTick(0);
  assert(!c._renekton.wArmed, '레넥톤 W: 7초 안에 평타가 없으면 강화 해제');
  {
    const t2 = makeEnemy(0, 1); const hp0 = t2.hp;
    c._renekton.wSeq = { target: t2, empowered: false, hits: 2, hitIndex: 0, elapsed: 0, raw: 100, stun: 0.75 };
    c.currentActionKey = 'renektonW'; c.currentPhase = 'ACTIVE';
    c._renektonTick(0.19);
    assert(t2.hp === hp0, '레넥톤 W: 시전 시간 0.2초 전에는 타격 없음');
    c._renektonTick(0.02);
    assert(t2.hp < hp0 && !c._renekton.wSeq && c.currentActionKey === 'renektonW', '레넥톤 W: 0.2초에 2회 타격 판정, 이후 잠금 유지');
    advance(500);
    assert(c.currentActionKey === 'renektonW', '레넥톤 W: 타격 뒤 0.528초 동안 잠금(0.5초 시점 유지)');
    advance(40);
    assert(c.currentActionKey == null, '레넥톤 W: 0.528초 뒤 잠금 해제');
  }
  assert(CHAMPION_DATA.renekton.Q.empoweredDamageByLevel[4] === 270 && CHAMPION_DATA.renekton.E.range === 450, '레넥톤: 강화 Q 5레벨 270, E 돌진 450');
}
// --- 닐라 ---
{
  const r = CHAMPION_DATA.nilah.R;
  assert(r.tickDamageByLevel[0] === 15 && near(r.tickBonusAdRatio, 0.1) && r.channelDuration / r.tickInterval === 4, '닐라 R: 틱당 15 + 추가 AD 10%(4틱 = 60 + 40%)');
  assert(r.shieldBaseByLevel == null, '닐라 R: PC 판에 없는 시전 즉시 고정 보호막 제거');
  assert(CHAMPION_DATA.nilah.Q.armorPenFromCritPercent === 30 && CHAMPION_DATA.nilah.Q.lifestealFromCritPercent === 20 && CHAMPION_DATA.nilah.E.mana === 40, '닐라: 방관 30%·흡혈 20%(V26.01), E 마나 40');
  const c = makeChamp('nilah');
  c.itemBonusCritDamagePercent = 0.3;
  assert(near(c._nilahQCritMultiplier(), CHAMPION_DATA.nilah.Q.critMultiplierIE), '닐라 Q: 무한의 대검 보유 시 치명타 배율 적용(예전엔 항상 미적용)');
}
// --- 초가스 ---
{
  const c = makeChamp('chogath', [], { maxHp: 2000 });
  c.recomputeStats = function () {};
  const minion = makeEnemy(0, 1, { isChampion: false, isMinion: true, hp: 5000, maxHp: 5000 });
  const b = minion.hp; c._chogathROnHit(minion);
  assert(b - minion.hp > 1100, '초가스 R: 미니언에게는 챔피언 피해(300)가 아니라 1200(비챔피언)');
  for (let i = 0; i < 8; i++) c._chogathROnHit(makeEnemy(0, 1, { isChampion: false, isMinion: true, hp: 10, maxHp: 10 }));
  assert(c._chogath.predationStacks === 6, '초가스 R: 미니언으로 얻는 중첩은 최대 6');
  assert(CHAMPION_DATA.chogath.Q.damageByLevel[4] === 300 && CHAMPION_DATA.chogath.W.damageByLevel[4] === 280 && CHAMPION_DATA.chogath.E.perHitDamageByLevel[0] === 30, '초가스: V25.23 Q/W 피해, V26.17 E 기본 피해');
}
// --- 이즈리얼 R ---
{
  const r = CHAMPION_DATA.ezreal.R;
  assert(r.falloffPerUnitPercent == null && r.minionDamageMultiplier === 0.5 && r.width === 320, '이즈리얼 R: 맞힌 수 감소 없음, 미니언 50%, 폭 320');
}
// --- 애쉬 ---
{
  const c = makeChamp('ashe');
  const t = makeEnemy(0, 1);
  c._asheApplyFrostShot(t, false);
  assert(near(getSlowPercent(t), 0.2) && near(getStatus(t, 'asheFrostShot').duration, 2), '애쉬 패시브: 1레벨 20% 둔화 2초');
  const t2 = makeEnemy(0, 1); c._asheApplyFrostShot(t2, true);
  const s0 = getSlowPercent(t2); advance(500); const s05 = getSlowPercent(t2); advance(600); const s11 = getSlowPercent(t2);
  assert(near(s0, 0.4) && near(s05, 0.3, 1e-3) && near(s11, 0.2), '애쉬 패시브: 치명타 둔화 40% → 1초에 걸쳐 20%로 감소');
  c.stats.critChance = 0.5;
  assert(near(c._asheBasicAttackDamageMultiplier(), 1.5), '애쉬 패시브: 평타 추가 피해 = 치명타 확률 × 100%');
  stubs.projectiles.spawned.length = 0;
  c.stats.critChance = 0;
  c._asheFireFlurry(t, new Vector3(0, 0, 0), new Vector3(0, 0, 1), false, true);
  const first = stubs.projectiles.spawned.length;
  c._asheFireFlurry(t, new Vector3(0, 0, 0), new Vector3(0, 0, 1), false, false);
  assert(first === 6 && stubs.projectiles.spawned.length - first === 5, '애쉬 Q: 첫 다발 6발, 이후 다발 5발(모든 평타)');
  const b = t.hp; stubs.projectiles.spawned[0].onHit(t);
  assert(near(b - t.hp, 0.22 * 100), '애쉬 Q: 화살당 공격력 22%(1랭크)');
  c.skillLevels.E = 1; c._ashe.eCharges = 2; c.cooldowns.E = 0;
  c._asheCastE(new Vector3(0, 0, 5), false); c.cooldowns.E = 0; c._asheCastE(new Vector3(0, 0, 5), false); c.cooldowns.E = 0;
  const charges0 = c._ashe.eCharges; c._asheCastE(new Vector3(0, 0, 5), false);
  assert(charges0 === 0 && c._ashe.eCharges === 0, '애쉬 E: 충전 2회');
  advance(90100); c._asheUpdate(0);
  assert(c._ashe.eCharges === 1, '애쉬 E: 90초마다 1회 재충전(1랭크)');
}
// --- 바루스 ---
{
  const c = makeChamp('varus', [], { stats: { attackDamage: 100, abilityPower: 100, armor: 30, magicResist: 30, critChance: 0, critMultiplier: 1.75, bonusAttackSpeedPercent: 0 } });
  const t = makeEnemy(0, 1);
  for (let i = 0; i < 5; i++) c._varusOnBasicAttackHit(t);
  c._varusLvTick(0.1);
  assert(!getStatus(c, 'varusLivingVengeance'), '바루스 패시브: 평타만으로는 공속이 오르지 않음(처치 필요)');
  c._varusOnKill(makeEnemy(0, 1, { isChampion: false }), false);
  assert(near(getStatus(c, 'varusLivingVengeance').value, 0.10), '바루스 패시브: 유닛 처치 → 공속 10%(1레벨)');
  c._varusOnKill(t, true);
  assert(near(getStatus(c, 'varusLivingVengeance').value, 0.30), '바루스 패시브: 챔피언 처치 관여 → 30%');
  c._varusOnKill(makeEnemy(0, 1, { isChampion: false }), false);
  assert(near(getStatus(c, 'varusLivingVengeance').value, 0.30), '바루스 패시브: 관여 강화는 유닛 처치로 덮이지 않음');
  advance(5100); c._varusLvTick(0.1);
  assert(!getStatus(c, 'varusLivingVengeance') && !c.bonusAD, '바루스 패시브: 1레벨 5초 후 종료');
  const t2 = makeEnemy(0, 1); const b = t2.hp;
  c.skillLevels.W = 1; c._varusOnBasicAttackHit(t2);
  assert(near(b - t2.hp, 4 + 0.25 * 100), '바루스 W: 적중 시 4 + 주문력 25%');
  c._varusCastW(null, false);
  assert(c._varus.wEmpowerQ === true, '바루스 W 사용: 다음 Q 강화(오한을 즉시 터뜨리지 않음)');
}
// --- 6차: 남은 미확인 항목 재확인 ---
{
  assert(CHAMPION_DATA.nautilus.passive.bonusDamageAtLevel18 === 116 && !CHAMPION_DATA.nautilus.passive.bonusDamageGuessed, '노틸러스 패시브: 14~116(V13.3) 확정');
  assert(CHAMPION_DATA.leesin.R.collisionAirborneSec === 1 && !CHAMPION_DATA.leesin.R.collisionAirborneGuessed, '리 신 R: 충돌 공중에 뜸 1초 확정');
  assert(!CHAMPION_DATA.yasuo.passive.flowBreakpointsGuessed, '야스오 기류 구간 1/7/13 확정');
  const dm = CHAMPION_DATA.darius.passive.empoweredAdByLevel;
  assert(dm[0] === 30 && dm[17] === 230, '다리우스 녹서스의 힘 30~230');
  const c = makeChamp('mordekaiser'); c.champLevel = 11; c.stats.percentMoveSpeedBonus = 0;
  c._morde.auraExpiresAt = now + 4000; c._mordePassiveAuraTick(0);
  assert(near(c.stats.percentMoveSpeedBonus, 0.09), '모데카이저 오라 이동 속도 11레벨 9%(3/6/9%)');
  assert(CHAMPION_DATA.ahri.E.charmSkillDamageAmpPercent === 0, '아리 E: 리워크로 삭제된 피해 증폭 제거');
}

// --- 7차: 타이밍 측정으로 드러난 문제 수정 ---
{
  // 벡스 W: 0.25초 뒤 보호막 + 반경 피해(예전엔 공용 대체 경로 - 선택 대상 고정 피해만)
  clearPlaced();
  const c = makeChamp('vex', [], { stats: { attackDamage: 50, abilityPower: 100, armor: 30, magicResist: 30, critChance: 0, critMultiplier: 1.75, bonusAttackSpeedPercent: 0 } });
  const e = place(makeEnemy(0, 1));
  c._vexCastW(null, false);
  assert(c.shield === 0 && e.hp === 3000, '벡스 W: 시전 시간(0.25초) 전에는 효과 없음');
  advance(260);
  assert(near(c.shield, 50 + 0.75 * 100) && near(3000 - e.hp, 80 + 0.3 * 100), '벡스 W: 보호막 50+AP 75%, 반경 피해 80+AP 30%');
  advance(2600); c._vexTickWShield();
  assert(near(c.shield, 0), '벡스 W: 보호막 2.5초 후 제거');
  // 벡스 Q: 0.15초 뒤 발사, 관통 파동
  c.canStartNewAction = () => true;
  const hp0 = e.hp;
  c._vexCastQ(new Vector3(0, 0, 5), false);
  advance(160);
  assert(!!c._vex.qTravel, '벡스 Q: 시전 0.15초 뒤 파동 발사');
  c._vexTickQ(1.0);
  assert(near(hp0 - e.hp, 70 + 0.7 * 100), '벡스 Q: 70 + AP 70%');
  // 벡스 E: 0.25초 뒤 발사, 착탄 시 피해 + 둔화
  c._vexCastE(new Vector3(0, 0, 1), false);
  advance(260);
  c._vexTickE(5.0);
  assert(getSlowPercent(e) > 0, '벡스 E: 착탄 범위 둔화');
}
{
  // 공용 전투 규칙(PC 위키 Stacking/Armor penetration/Tenacity/Crowd control)
  const t = makeEnemy(0, 1);
  applyStatus(t, { id: 'a', type: 'ARMOR_SHRED', duration: 5, value: 0.2 });
  applyStatus(t, { id: 'b', type: 'ARMOR_SHRED', duration: 5, value: 0.3 });
  assert(near(context.getArmorShredPercent(t), 0.44), '% 방어력 감소는 서로 곱연산(20% + 30% = 44%)');
  applyStatus(t, { id: 'm1', type: 'MR_SHRED', duration: 5, value: 10 });
  applyStatus(t, { id: 'm2', type: 'MR_SHRED', duration: 5, value: 5 });
  assert(near(context.getMrShredFlat(t), 15), '고정 마법 저항 감소는 서로 더해짐');
  const c = makeChamp('yasuo');
  applyStatus(c, { id: 'ten', type: 'TENACITY', duration: 5, value: 0.5 });
  applyStatus(c, { id: 'sl', type: 'SLOW', duration: 2, value: 0.3 });
  assert(near(getStatus(c, 'sl').duration, 1), '강인함은 둔화 지속시간도 줄인다');
  applyStatus(c, { id: 'up', type: 'KNOCKUP', duration: 1, value: 1 });
  assert(near(getStatus(c, 'up').duration, 1), '강인함은 에어본에는 적용되지 않는다');
  c.statusEffects = [];
  applyStatus(c, { id: 'rt', type: 'ROOT', duration: 2, value: 1 });
  assert(c._isMovementAbility('E') === true && c._isMovementAbility('W') === false, '야스오 E는 이동 스킬, W는 아님');
  const mp0 = c.mp; c.castAbility('E', null);
  assert(c.mp === mp0 && c.currentActionKey == null, '속박 중에는 이동 스킬(야스오 E)을 쓸 수 없다');
  c.startRecall();
  assert(c.state !== 'RECALL', '속박 중에는 귀환할 수 없다');
}
{
  // 가렌 인내심: 챔피언·포탑·에픽 몬스터에게 "실제로" 피해를 입었을 때만 멈춘다(PC 위키)
  const c = makeChamp('garen', [], { hp: 1000, maxHp: 2000 });
  c.passiveState.lastDamageTakenAt = 0;
  c.takeDamage(50, { isMinion: true }, 'PHYSICAL');
  assert(c.passiveState.lastDamageTakenAt === 0, '가렌 인내심: 미니언 피해로는 멈추지 않는다');
  c.shield = 100; c.takeDamage(50, { isChampion: true }, 'PHYSICAL');
  assert(c.passiveState.lastDamageTakenAt === 0, '가렌 인내심: 보호막에 전부 막힌 피해로는 멈추지 않는다');
  c.shield = 0; c.takeDamage(50, { isChampion: true }, 'PHYSICAL');
  assert(c.passiveState.lastDamageTakenAt === now, '가렌 인내심: 챔피언에게 실제 피해를 입으면 멈춘다');
  c.passiveState.lastDamageTakenAt = 0; c.takeDamage(50, { isTurret: true }, 'PHYSICAL');
  assert(c.passiveState.lastDamageTakenAt === now, '가렌 인내심: 포탑 피해로도 멈춘다');
}
{
  // 다리우스 R: 피해를 준 뒤 출혈 1중첩(PC 위키 Hemorrhage)
  const c = makeChamp('darius');
  const t = makeEnemy(0, 1);
  c._dariusROnHit(t);
  assert(c._dariusLiveStacks(t) === 1, '다리우스 R: 단두대 적중 후 출혈 1중첩');
}
{
  // 모데카이저 W 보호막: 피해로 깎인 보호막이 감소 틱에 되살아나지 않고, 다른 보호막을 덮어쓰지 않는다
  const c = makeChamp('mordekaiser', [], { maxHp: 2000 });
  c.shield = 100; c._morde.dealtBank = 0;
  c._mordeWOnCast();
  const w = 2000 * 0.05; // 최소 5%
  assert(Math.abs(c.shield - (100 + w)) < 1e-6, '모데카이저 W: 기존 보호막에 더해진다(덮어쓰지 않음)');
  context.absorbShieldDamage(c, 80); // 피해로 80 흡수(먼저 끝나는 W 보호막부터)
  const before = c.shield;
  now += 200; context.tickShields(c, 0.2); // 감소 틱(공용 보호막 틱)
  assert(c.shield <= before + 1e-9, '모데카이저 W: 감소 틱이 피해로 깎인 보호막을 되살리지 않는다');
  const healBefore = c.hp; c._mordeWOnRecast();
  assert(c.hp > healBefore && context.getShieldById(c, 'mordeW') === 0 && near(c.shield, 100), '모데카이저 W: 재시전 시 W 몫만 회복으로 전환(다른 보호막 100은 유지, 피해는 먼저 끝나는 W부터 흡수)');
}
{
  // 다리우스 R: 시전 후 0.25초 Q/E 불가(PC 위키 Noxian Guillotine)
  const c = makeChamp('darius');
  c._dariusRQeLockUntil = now + 250;
  const mp0 = c.mp, cdQ = c.cooldowns.Q, cdE = c.cooldowns.E;
  c._castQ(null, false); c._castE(null, false);
  assert(c.mp === mp0 && c.cooldowns.Q === cdQ && c.cooldowns.E === cdE && c.currentActionKey == null, '다리우스 R: 시전 직후 0.25초 동안 Q/E 시전 안 됨');
}
{
  // 벡스 패시브(파멸과 우울) - PC 위키 + 공식 패치 노트
  clearPlaced();
  const c = makeChamp('vex', [], { stats: { attackDamage: 50, abilityPower: 100, armor: 30, magicResist: 30, critChance: 0, critMultiplier: 1.75, bonusAttackSpeedPercent: 0 } });
  const e = place(makeEnemy(0, 1));
  c.canStartNewAction = () => true;
  const castAt = now;
  c._vexCastQ(new Vector3(0, 0, 5), false); advance(160); c._vexTickQ(1.0);
  const fear = getStatus(e, 'vexDoomFear');
  assert(!!fear && fear.type === 'FEAR' && near(fear.duration, 0.75), '벡스 파멸: 준비된 상태의 다음 기본 스킬(Q)이 1레벨 0.75초 공포');
  assert(isStunned(e), '벡스 파멸: 공포 중에는 행동 불가(CC)');
  assert(near(c._vex.doomReadyAt - castAt, 25000), '벡스 파멸: 정적 대기시간 25초, 기본 스킬 시전 시점부터');
  e.statusEffects = []; c.cooldowns.Q = 0;
  c._vexCastQ(new Vector3(0, 0, 5), false); advance(160); c._vexTickQ(1.0);
  assert(!getStatus(e, 'vexDoomFear'), '벡스 파멸: 대기시간 중 기본 스킬은 공포 없음');
  c._vexMarkGloom(e);
  const before = c._vex.doomReadyAt, hp1 = e.hp;
  c._vexOnBasicAttackHit(e);
  assert(near(hp1 - e.hp, 40 + 0.25 * 100), '벡스 우울: 평타가 표식 소모 - 1레벨 40 + 주문력 25%');
  assert(near(before - c._vex.doomReadyAt, 25000 * 0.25) && !c._vex.gloom.has(e), '벡스 우울: 챔피언 소모 시 파멸 대기시간 25% 환급, 표식 제거');
  const minion = place(makeEnemy(0, 1.2, { isChampion: false }));
  c._vexMarkGloom(minion); const mhp = minion.hp;
  c._vexOnBasicAttackHit(minion);
  assert(near(mhp - minion.hp, (40 + 25) * 0.4), '벡스 우울: 챔피언 이외 대상은 1레벨 40% 피해');
  advance(6100);
  c._vexMarkGloom(e); advance(6100); const hp2 = e.hp; c._vexOnBasicAttackHit(e);
  assert(e.hp === hp2, '벡스 우울: 표식은 6초 뒤 만료');
  c._vexCastE(new Vector3(0, 0, 1), false); advance(260); c._vexTickE(5.0);
  assert(c._vex.gloom.has(e), '벡스 E: 적중한 적에게 우울 표식');
  const far = place(makeEnemy(0, lolRangeToWorld(1700))); const near1 = place(makeEnemy(0, lolRangeToWorld(1500)));
  vexNotifyEnemyDash(far); vexNotifyEnemyDash(near1);
  assert(!c._vex.gloom.has(far) && c._vex.gloom.has(near1), '벡스 우울: 반경 1600 안에서 돌진한 적만 표식');
  // 공포 이동: 시전자에게서 멀어진다
  e.statusEffects = []; c._vexApplyFear(e);
  const z0 = e.mesh.position.z; tickStatusEffects(e, 0.1);
  assert(e.mesh.position.z > z0, '벡스 파멸: 공포 대상은 벡스에게서 멀어지는 방향으로 이동');
}
{
  // 이즈리얼 Q: 시전 0.25초 뒤 발사(예전엔 즉시)
  clearPlaced(); place(makeEnemy(0, 1));
  const c = makeChamp('ezreal');
  stubs.projectiles.spawned.length = 0;
  c._ezrealCastQ(new Vector3(0, 0, 5), false);
  const before = stubs.projectiles.spawned.length;
  advance(260);
  assert(before === 0 && stubs.projectiles.spawned.length === 1, '이즈리얼 Q: 시전 0.25초 뒤 투사체 생성');
}
{
  // 초가스 W: 조준 방향으로 판정(캐릭터가 반대쪽을 보고 있어도)
  clearPlaced();
  const behind = place(makeEnemy(0, -1));
  const c = makeChamp('chogath');
  c.canStartNewAction = () => true;
  c.root.quaternion = {}; // 기본 정면 +Z(적은 -Z 쪽)
  c._chogathCastW(false, new Vector3(0, 0, -1));
  advance(510);
  assert(behind.hp < 3000, '초가스 W: 마우스로 겨눈 방향의 적에게 적중(시전 0.5초)');
}

// --- 챔피언 간 상태 격리(13차): 교체 후 이전 챔피언의 지연 판정·잠금·보호막·비대상이 남지 않는다 ---
stubs.targetRing = { clear() {} };
{
  clearPlaced();
  const behind = place(makeEnemy(0, -1));
  const c = makeChamp('chogath');
  c.canStartNewAction = () => true;
  c._chogathCastW(false, new Vector3(0, 0, -1));
  c.applyChampionData('garen');
  advance(600);
  assert(behind.hp === 3000, '교체 격리: 초가스 W 시전 직후 가렌으로 바꾸면 0.5초 뒤 판정이 나가지 않는다');
  let fired = 0;
  c._champTimeout(() => { fired++; }, 100);
  c._champInterval(() => { fired++; }, 100);
  c.applyChampionData('darius');
  advance(500);
  assert(fired === 0, '교체 격리: _champTimeout/_champInterval로 건 지연 실행은 교체 시 모두 취소');
  c._champTimeout(() => { fired++; }, 100);
  advance(150);
  assert(fired === 1, '교체 격리: 교체 이후 새로 건 챔피언 타이머는 정상 실행');
}
{
  const c = makeChamp('masteryi');
  c.model = { visible: false };
  c.isUntargetable = true;
  c._masteryi.alpha = { pausedBuffs: [] };
  c.currentActionKey = 'masteryiQ';
  c.applyChampionData('garen');
  assert(c.isUntargetable === false && c.model.visible === true, '교체 격리: 마스터 이 Q 도중 교체해도 비대상/모델 숨김이 남지 않는다');
}
{
  const c = makeChamp('nilah');
  c.applyChampionData('nilah');
  const nilahRadius = c.collisionRadius;
  c.attackOverrides = [{ id: 'garenQ' }]; c.subStates = { yasuoQ3: now + 5000 };
  c._dariusRQeLockUntil = now + 250; c.magicPenPercent = 0.2; c._eHitCountThisCast = 7;
  c.passiveState.lastDamageTakenAt = now;
  context.addShield(c, 'settW', 300, 3);
  c.applyChampionData('garen');
  // 25차: 판정 반경(collisionRadius)은 둘 다 원작 기본 65라 같다 - 닐라 전용인 지형 충돌 반경(32)·선택 반경(120)이 남지 않는지 본다.
  assert(near(nilahRadius, context.lolRangeToWorld(65)) && near(c.collisionRadius, context.lolRangeToWorld(65))
    && near(c.pathingRadius, context.lolRangeToWorld(35)) && near(c.selectionRadius, context.lolRangeToWorld(75)), '교체 격리: 닐라 전용 충돌 반경이 다른 챔피언에 남지 않는다');
  assert(c.attackOverrides.length === 0 && Object.keys(c.subStates).length === 0, '교체 격리: 평타 강화/서브 상태 초기화');
  assert(c._dariusRQeLockUntil === 0 && c.magicPenPercent === 0 && c._eHitCountThisCast === 0, '교체 격리: 다리우스 R 잠금/모데 E 마법 관통/가렌 E 타격 수 초기화');
  assert(c.passiveState.lastDamageTakenAt === 0, '교체 격리: 패시브 비전투 시각 초기화(가렌 패시브가 이전 피격 시각을 물려받지 않음)');
  assert(c.shield === 0 && !context.getShieldById(c, 'settW'), '교체 격리: 이전 챔피언의 보호막 인스턴스 제거');
}
{
  // 세트 R 도중 사망: 잡힌 대상의 제압이 풀린다
  const c = makeChamp('sett', [], { actionData: { death: { clips: ['Death'] } }, _pendingTimeouts: [], _clearPending() {} });
  const t = makeEnemy(0, 1);
  t.isGrabbedBySett = true;
  applyStatus(t, { id: 'settR_suppress', type: 'SUPPRESSION', duration: 2 });
  c._sett.rSeq = { target: t };
  c._die();
  assert(t.isGrabbedBySett === false && !getStatus(t, 'settR_suppress') && c._sett.rSeq === null, '세트 R 도중 사망: 대상의 제압/잡힘 상태가 풀린다');
}
{
  // 세트 R 시퀀스 도중 교체: 시퀀스 취소(onCancel)가 먼저 R을 끝내도 정리 함수가 null을 넘겨 오류가 나지 않는다
  const c = makeChamp('sett');
  const t = makeEnemy(0, 1);
  t.isGrabbedBySett = true;
  c._sett.rSeq = { target: t };
  c.sequencePlayer = { isPlaying: true, cancel() { this.isPlaying = false; if (c._sett.rSeq) c._settEndR(c._sett.rSeq, true); } };
  let threw = null;
  try { c.applyChampionData('garen'); } catch (e) { threw = e; }
  assert(!threw && t.isGrabbedBySett === false && c.championId === 'garen', `교체 격리: 세트 R 도중 교체해도 오류 없이 대상이 풀린다${threw ? ' (' + threw.message + ')' : ''}`);
}

// --- 모데카이저 죽음의 세계(원작 이식) ---
{
  clearPlaced(); timers = []; // 앞 테스트(세트 사망)의 부활 타이머가 여기서 돌지 않게
  const realC = CharacterController.prototype.recomputeStats;
  const c = makeChamp('mordekaiser', [], { recomputeStats: realC, champLevel: 11, bonusMaxHp: 0, itemBonusMaxHp: 0, stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, critChance: 0, critMultiplier: 1.75, bonusAttackSpeedPercent: 0 } });
  c.recomputeStats(); c.hp = c.maxHp * 0.5;
  const pos0 = c.root.position.clone();
  const t = place(makeEnemy(0, lolRangeToWorld(400), { armor: 30, magicResist: 30, attackDamage: 6, attackSpeed: 0.7, abilityPower: 0 }));
  t.mesh.scale = { v: 1, setScalar(x) { this.v = x; } };
  c.root.scale = { v: 1, setScalar(x) { this.v = x; } };
  const outsider = place(makeEnemy(lolRangeToWorld(300), 0));
  const mat = { opacity: 1, transparent: false, clone() { return { opacity: 1, transparent: false, dispose() {} }; } };
  const om = { isMesh: true, material: mat };
  outsider.mesh.userData = {}; outsider.mesh.traverse = (fn) => { fn(outsider.mesh); fn(om); };
  outsider.labelDiv = { style: { visibility: '' } };
  const maxHp0 = c.maxHp;
  c._mordeROnHit(t);
  const realm = context.getDeathRealm(c.realmId);
  assert(c.root.position.distanceTo(pos0) < 1e-9 && near(t.mesh.position.z, lolRangeToWorld(400)), '모데 R: 순간이동 없이 둘 다 제자리에 남는다(원작 - 일반 맵 위 경기장)');
  assert(realm && near(realm.radius, lolRangeToWorld(1200)) && near(realm.center.z, 0) && near(realm.center.x, 0), '모데 R: 반경 1200 경기장, 중심은 시전 순간 모데카이저 위치(28차 요청)');
  assert(outsider.labelDiv.style.visibility === 'hidden', '모데 R: 바깥 유닛 체력 바·이름표 숨김(28차)');
  assert(near(t.armor, 27) && near(t.magicResist, 27) && near(t.maxHp, 2700) && near(t.hp, 2700) && near(t.attackDamage, 5.4) && near(t.attackSpeed, 0.63), '모데 R: 대상 현재 능력치 10% 강탈(방어·마저·최대 체력·공격력·공속)');
  assert(near(c.bonusArmor, 3) && near(c.bonusMr, 3) && near(c.bonusAD, 0.6) && near(c.maxHp, maxHp0 + 300), '모데 R: 모데카이저가 훔친 만큼 얻는다');
  assert(near(c.hp / c.maxHp, 0.5), '모데 R: 최대 체력을 얻어도 현재 체력 비율 유지(PC 위키)');
  assert(near(c._morde.rStolenAsBonus * (c.stats.attackSpeedRatio || c.stats.baseAttackSpeed), 0.07), '모데 R: 대상 공속 10%를 고정 공속으로 얻는다(추가 공속 비율로 환산)');
  const enemies1 = context.getAllEnemyUnits();
  assert(enemies1.length === 1 && enemies1[0] === t && context.getAllEnemyUnits(true).includes(outsider), '모데 R: 안에서는 대상만 상호작용, 바깥 목록은 혼령 표시용으로만 조회');
  assert(om.material !== mat && om.material.opacity < 0.5, '모데 R: 바깥 유닛은 반투명 혼령으로 보인다');
  advance(300); c._mordeUpdateR();
  assert(near(c._sizeScale, 1.1) && near(t.mesh.scale.v, 0.9), '모데 R: 크기 모데카이저 +10%, 대상 -10%(0.25초에 걸쳐)');
  // 경계: 경기장 밖으로 밀려나면(돌진·이동) 경계 안으로 되돌린다
  c.root.position.set(0, 0, -lolRangeToWorld(2000));
  c._mordeUpdateR();
  assert(c.root.position.distanceTo(realm.center) <= realm.radius + 1e-6, '모데 R: 경계는 통과할 수 없다(경계 안으로 되돌림)');
  const posBeforeEnd = c.root.position.clone();
  advance(7000); c._mordeUpdateR();
  assert(!c._morde.isInDeathRealm && c.realmId === 'main' && t.realmId === 'main', '모데 R: 7초 뒤 종료, 둘 다 일반 세계로');
  assert(near(t.mesh.scale.v, 1) && c._sizeScale > 1.09, '모데 R(83차): 끝나면 대상은 즉시 원래 크기, 모데카이저는 아직 큼(0.25초에 걸쳐 작아짐)');
  advance(300); c._mordeUpdateR();
  assert(near(c._sizeScale, 1), '모데 R(83차): 0.25초 뒤 모데카이저도 원래 크기');
  assert(c.root.position.distanceTo(posBeforeEnd) < 1e-9, '모데 R: 끝나도 들어가기 전 위치로 되돌리지 않는다(그 자리에서 복귀)');
  assert(near(t.armor, 30) && near(t.maxHp, 3000) && near(t.attackDamage, 6) && near(c.bonusArmor, 0) && near(c.maxHp, maxHp0), '모데 R: 종료 시 훔친 능력치 반환');
  assert(om.material === mat && !context.getDeathRealm('deathRealm_1'), '모데 R: 종료 시 혼령 표시·경기장 정리');
  // 대상이 안에서 죽으면 부활할 때까지 유지
  c.cooldowns.R = 0; t.hp = 3000;
  c._mordeROnHit(t);
  t.hp = 0; c._mordeUpdateR();
  assert(!c._morde.isInDeathRealm && c._morde.rKept && c.bonusArmor > 0, '모데 R: 대상이 안에서 죽으면 일찍 끝나고 훔친 능력치는 유지');
  advance(400); c._mordeUpdateR();
  assert(c._sizeScale > 1.05, '모데 R(83차): 대상이 죽어 능력치를 들고 있는 동안 크기도 유지 ' + c._sizeScale);
  c._mordeUpdateR();
  assert(c._morde.rKept && c.bonusArmor > 0, '모데 R: 대상이 죽어 있는 동안 계속 유지');
  t.hp = 1000; c._mordeUpdateR();
  assert(!c._morde.rKept && near(c.bonusArmor, 0) && near(c.maxHp, maxHp0), '모데 R: 대상이 부활하면 유지하던 능력치 반환');
}

// --- 죽음의 세계 + CC 원작 규칙(15차) ---
{
  // 구조물은 모든 세계에 존재(PC 위키): 포탑은 죽음의 세계 안 유닛도 정상 공격, 안에서도 구조물을 칠 수 있다
  const turret = { isStructure: true, isTurret: true, team: 'RED', hp: 5000, maxHp: 5000, statusEffects: [], mesh: { position: new Vector3(0, 0, 3) } };
  assert(context.canRealmInteract(turret, { realmId: 'deathRealm_9' }) && context.canRealmInteract({ realmId: 'deathRealm_9' }, turret), '죽음의 세계: 구조물은 모든 세계와 상호작용(PC 위키)');
  assert(!context.canRealmInteract({ realmId: 'deathRealm_9' }, { realmId: 'main' }), '죽음의 세계: 일반 유닛은 다른 세계와 상호작용 불가(그대로)');
  // 구조물은 CC 면역
  applyStatus(turret, { id: 'x', type: 'STUN', duration: 1, value: 1 });
  applyStatus(turret, { id: 'y', type: 'SLOW', duration: 1, value: 0.5 });
  assert(turret.statusEffects.length === 0, 'CC: 구조물은 기절·둔화에 걸리지 않는다');
  // 매혹·공포는 시전자가 죽으면 풀린다
  const src = { isChampion: true, hp: 100, root: { position: new Vector3(0, 0, 0) }, collisionRadius: 0.5 };
  const e = makeEnemy(0, 3);
  applyStatus(e, { id: 'ahriCharm', type: 'CHARM', duration: 2, value: 1, source: src });
  src.hp = 0; tickStatusEffects(e, 0.016);
  assert(!getStatus(e, 'ahriCharm'), 'CC: 매혹은 시전자가 죽으면 풀린다(PC 위키)');
  // 강제 이동은 죽음의 세계 경계에서 멈춘다
  const realm = { center: new Vector3(0, 0, 0), radius: 5 };
  const pos = new Vector3(0, 0, 20);
  context.constrainUnitPosition({ collisionRadius: 0.5 }, pos, realm);
  assert(near(pos.length(), 4.5), '강제 이동: 경계(반경 − 충돌 반경)에서 멈춘다');
  // 공중에 뜸(KNOCKUP)은 강인함 무시, 매혹은 강인함 적용
  const ten = makeEnemy(0, 3, { itemTenacityPercent: 0.5 });
  const k = applyStatus(ten, { id: 'k', type: 'KNOCKUP', duration: 1, value: 1 });
  const ch = applyStatus(ten, { id: 'c', type: 'CHARM', duration: 1, value: 1, source: { hp: 1, root: { position: new Vector3() } } });
  assert(near(k.duration, 1) && near(ch.duration, 0.5), 'CC: 공중에 뜸은 강인함 무시, 매혹은 강인함 적용');
}

// --- 움직임·스킬 동작(16차) ---
{
  // 바루스 Q: 충전 중 20% 둔화, 1.25초에 자동 발사하지 않음, 4초 넘기면 취소 + 마나 50% 환급(PC 위키)
  timers = []; clearPlaced();
  const c = makeChamp('varus', ['Spell1_Idle', 'Spell1_Walk'], { mp: 500, maxMp: 500 });
  c.updateBars = () => {};
  c._varusCastQ(new Vector3(0, 0, 5), false);
  const manaAfter = c.mp;
  assert(c._varus.qCharge && getSlowPercent(c) > 0.19 && getSlowPercent(c) < 0.21, '바루스 Q: 충전 중 20% 둔화');
  advance(1300);
  assert(!!c._varus.qCharge && c.currentActionKey === 'varusQCharge', '바루스 Q: 1.25초가 지나도 자동 발사하지 않는다(최대 4초 유지)');
  advance(2800);
  const paid = CHAMPION_DATA.varus.Q.mana[0];
  assert(!c._varus.qCharge && c.currentActionKey == null && near(c.mp, manaAfter + paid * 0.5) && getSlowPercent(c) === 0, '바루스 Q: 4초 넘기면 취소, 마나 50% 환급, 둔화 해제');
}
{
  // 바루스 Q 사거리는 1.5초, 피해는 1.25초에 걸쳐 증가
  const q = CHAMPION_DATA.varus.Q;
  assert(q.rangeChargeDuration === 1.5 && q.chargeDuration === 1.25 && q.maxHoldSec === 4 && q.chargeSelfSlowPercent === 20, '바루스 Q 데이터: 사거리 1.5초·효과 1.25초·최대 4초·둔화 20%');
}
{
  // 바루스 E 더럽혀진 땅(17차): 4초 지대 - 나중에 들어온 적도 둔화, 지대가 끝나면 더 걸지 않는다
  timers = []; clearPlaced();
  stubs.skillTelegraphs = { spawned: [], spawn(o) { this.spawned.push(o); return o; } };
  const inZone = place(makeEnemy(0, 3)), late = place(makeEnemy(20, 20));
  const c = makeChamp('varus', ['Spell3']);
  c._varusCastE(new Vector3(0, 0, 3), false);
  advance(800); // 81차: 시전 0.242초 + 착탄 0.5초
  assert(getSlowPercent(inZone) > 0 && getSlowPercent(late) === 0, '바루스 E: 착탄 지대 안의 적만 둔화');
  assert(stubs.skillTelegraphs.spawned.some((o) => o.shape === 'circle' && o.duration === 4 && o.radius === 300), '바루스 E: 반경 300·4초 지대 표시(모두에게 보이는 예고)');
  late.mesh.position.set(0, 0, 3);
  lastIntervalFn();
  assert(getSlowPercent(late) > 0, '바루스 E: 지대에 나중에 들어온 적도 둔화(예전엔 착탄 순간만)');
  now += 4100; late.statusEffects = []; lastIntervalFn();
  assert(getSlowPercent(late) === 0, '바루스 E: 4초 뒤 지대가 사라지면 더 이상 둔화하지 않는다');
}

// --- 79차: 보류했던 스킬 판정 형태 ---
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 세트 W: 시작 폭 300(반폭 150) → 끝 620, 중앙 70, 반경 720 원과 교집합
  timers = []; clearPlaced();
  const c = makeChamp('sett');
  c.bonusAD = 0; c._sett.wPendingSpent = 0;
  const startSide = place(makeEnemy(L(140), L(10), tiny)), startOut = place(makeEnemy(L(170), L(10), tiny));
  const center = place(makeEnemy(L(30), L(400), tiny)), cornerOut = place(makeEnemy(L(300), L(690), tiny));
  const hp0 = [startSide, startOut, center, cornerOut].map((u) => u.hp);
  c._settWOnCast(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
  assert(startSide.hp < hp0[0] && startOut.hp === hp0[1], '세트 W(79차): 시작 폭 300 - 옆 140은 맞고 170은 빗나감');
  assert(center.hp < hp0[2], '세트 W(79차): 중앙 띠(반폭 35) 안 적중');
  assert(cornerOut.hp === hp0[3], '세트 W(79차): 사다리꼴 끝 모서리라도 반경 720 원 밖이면 빗나감');
}
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 초가스 E: 평타 방향 직선(650) 위 모든 적, 폭 340(+30/중첩)
  timers = []; clearPlaced();
  const c = makeChamp('chogath');
  c._chogath.eChargesRemaining = 3; c._chogath.predationStacks = 0;
  const t = place(makeEnemy(0, L(150), tiny)), behind = place(makeEnemy(L(150), L(500), tiny)), wide = place(makeEnemy(L(200), L(400), tiny)), far = place(makeEnemy(0, L(700), tiny));
  const hp0 = [t, behind, wide, far].map((u) => u.hp);
  c._chogathEOnHit(t);
  assert(t.hp < hp0[0] && behind.hp < hp0[1], '초가스 E(79차): 평타 대상 뒤 직선 위 적도 가시에 맞는다');
  assert(wide.hp === hp0[2] && far.hp === hp0[3], '초가스 E(79차): 폭(반폭 170)·사거리(650) 밖은 빗나감');
  assert(c._chogath.eChargesRemaining === 2, '초가스 E(79차): 여러 명을 맞혀도 충전은 1회만 소모');
  c._chogath.predationStacks = 17; // 81차: 추가 크기 100%(17×6%, 상한) → 폭 500(반폭 250)
  c._chogathEOnHit(t);
  assert(wide.hp < hp0[2], '초가스 E(79차): 크기 중첩으로 폭이 넓어진다(최대 500)');
}
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 모데카이저 Q: 시작 폭 90 → 끝 폭 150
  timers = []; clearPlaced();
  const c = makeChamp('mordekaiser');
  const nearSide = place(makeEnemy(L(60), L(30), tiny)), farSide = place(makeEnemy(L(60), L(600), tiny));
  const hp0 = [nearSide, farSide].map((u) => u.hp);
  c._mordeQOnCast(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
  assert(nearSide.hp === hp0[0] && farSide.hp < hp0[1], '모데 Q(79차): 가까운 쪽은 좁고(반폭 ~46) 먼 쪽은 넓다(반폭 ~74)');
}
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 세트 E: 좌우 450, 앞뒤 폭 280의 직사각형
  timers = []; clearPlaced();
  const c = makeChamp('sett');
  const left = place(makeEnemy(L(-400), L(100), tiny)), right = place(makeEnemy(L(400), L(-100), tiny)), front = place(makeEnemy(L(-100), L(300), tiny));
  c._settEOnCast(new Vector3(0, 0, 1));
  assert(isStunned(left) && isStunned(right), '세트 E(79차): 양옆(앞뒤 140 이내) 적은 끌려와 기절');
  assert(!getStatus(front, 'settE_slow') && front.hp === 3000, '세트 E(79차): 정면 300(앞뒤 폭 밖)은 맞지 않는다');
}

// --- 80차: 전 챔피언 사거리·폭 대조 ---
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 노틸러스 E: 파동마다 고리 0~350 / 215~465 / 350~590
  timers = []; clearPlaced();
  const c = makeChamp('nautilus');
  const close = place(makeEnemy(0, L(100), tiny)), mid = place(makeEnemy(0, L(400), tiny)), outer = place(makeEnemy(0, L(550), tiny));
  const seq = { fired: 0, hitCounts: new Map(), lvl: 1 };
  const hits = [];
  for (let i = 0; i < 3; i++) { seq.fired = i; const hp = [close, mid, outer].map((u) => u.hp); c._nautilusExplodeE(seq); hits.push([close, mid, outer].map((u, k) => u.hp < hp[k])); }
  assert(JSON.stringify(hits) === JSON.stringify([[true, false, false], [false, true, false], [false, true, true]]), '노틸러스 E(80차): 파동별 고리 범위(가까운 대상은 첫 파동만) ' + JSON.stringify(hits));
}
{
  // 초가스 R: 중첩당 +2.5, 최대 +25(사거리 200)
  const c = makeChamp('chogath');
  const r = CHAMPION_DATA.chogath.R;
  assert(r.rangeBase + Math.min(r.rangeBonusCap, r.rangePerStack * 40) === 200, '초가스 R(80차): 40중첩이어도 사거리 200에서 상한');
}
{
  // 세트 Q: 강화된 2회 공격 모두 사거리 +50
  const c = makeChamp('sett');
  c._sett.qUsesRemaining = 2; c.comboIndex = 1;
  assert(near(c._settLeftHandRangeBonusWorld(), lolRangeToWorld(50)), '세트 Q(80차): 오른손 공격도 사거리 +50');
}

// --- 81차: 보류 항목 전부 ---
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 바루스 E: 시전 0.242초 뒤가 아니라 그 뒤 0.5초에 착탄
  timers = []; clearPlaced();
  stubs.skillTelegraphs = { spawned: [], spawn(o) { this.spawned.push(o); return o; } };
  const t = place(makeEnemy(0, 3));
  const c = makeChamp('varus', ['Spell3']);
  const hp0 = t.hp;
  c._varusCastE(new Vector3(0, 0, 3), false);
  advance(500);
  assert(t.hp === hp0, '바루스 E(81차): 0.5초 착탄 지연 전에는 피해 없음');
  advance(300);
  assert(t.hp < hp0, '바루스 E(81차): 착탄 후 피해');
}
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 모데카이저 E: 판정 끝 = 지정 지점 + 200(최대 900)
  timers = []; clearPlaced();
  const c = makeChamp('mordekaiser');
  const beyond = place(makeEnemy(0, L(880), tiny)), tooFar = place(makeEnemy(0, L(950), tiny));
  const hits = c._mordeEAreaHits(new Vector3(0, 0, 0), new Vector3(0, 0, 1), L(700));
  assert(hits.includes(beyond) && !hits.includes(tooFar), '모데 E(81차): 700 지점 시전 시 880은 닿고 950은 안 닿는다');
}
{
  // 초가스: 포식 중첩 → 크기·평타 사거리(R 레벨별, 상한)
  const c = makeChamp('chogath');
  c.skillLevels.R = 3; c._chogath.predationStacks = 5;
  const b = context.chogathFeastBonus ? context.chogathFeastBonus(c) : null;
  if (b) {
    assert(near(b.attackRangeLol, 38.5) && b.sizePercent === 50, '초가스 R(81차): 3레벨 5중첩 = 사거리 +38.5, 크기 +50%');
    c._chogath.predationStacks = 30; const b2 = context.chogathFeastBonus(c);
    assert(b2.attackRangeLol === 75 && b2.sizePercent === 100, '초가스 R(81차): 사거리 +75, 크기 100%에서 상한');
  }
}
{
  const L = lolRangeToWorld, tiny = { collisionRadius: 0.001 };
  // 리 신 Q2: 표식 대상이 1250 밖이면 재시전 불가(기력 소모 없음)
  timers = []; clearPlaced();
  const c = makeChamp('leesin');
  const t = place(makeEnemy(0, L(1400), tiny));
  c._leesin.qMarkTarget = t; c._leesin.qMarkExpiresAt = now + 3000; c.mp = 200;
  c._leesinCastQ(null, false);
  assert(c.mp === 200 && c._leesin.qMarkTarget === t, '리 신 Q2(81차): 1250 밖 표식 대상에게는 재시전되지 않는다');
}

// --- 82차: 초가스 포식 크기 ---
{
  const c = makeChamp('chogath');
  const label = { position: { y: 3 } };
  c._hpLabel3d = label; c._hpLabelBaseY = 3; c._sizeScale = 1;
  c.skillLevels.R = 3; c._chogath.predationStacks = 5; // +50%
  for (let i = 0; i < 60; i++) c._tickSizeScale(1 / 30);
  assert(near(c._sizeScale, 1.5, 1e-3) && near(label.position.y, 0.5 + 2.5 * 1.5, 1e-2), '초가스(82차): 5중첩(3레벨) → 크기 1.5배, 체력바도 같이 올라감');
  c._chogath.predationStacks = 40;
  for (let i = 0; i < 60; i++) c._tickSizeScale(1 / 30);
  assert(near(c._sizeScale, 2, 1e-3), '초가스(82차): 크기는 최대 2배(추가 100%)');
  const g = makeChamp('garen'); g._tickSizeScale(1 / 30);
  assert((g._sizeScale || 1) === 1, '초가스(82차): 다른 챔피언은 크기 변화 없음');
}

// --- 83차: 크기 효과는 더해진다 ---
{
  const c = makeChamp('mordekaiser');
  context.setUnitSizeMod(c, 'heartsteel', 1.12); context.setUnitSizeMod(c, 'mordeR', 1.1);
  assert(near(c._sizeScale, 1.22), '크기(83차): 강철심장 +12%와 모데 R +10%는 더해져 +22%(예전엔 서로 덮어씀)');
  context.setUnitSizeMod(c, 'mordeR', 1);
  assert(near(c._sizeScale, 1.12), '크기(83차): 한 효과가 끝나도 다른 효과는 남는다');
}


// --- 83차: 전투 규칙 정밀화 ---
{
  const { calculateDamage, applyStatus } = context;
  // 음수 방어력에는 % 방어력 감소가 적용되지 않는다
  const neg = { armor: -20, statusEffects: [] };
  const d0 = calculateDamage({ rawDamage: 100, target: neg, source: {} });
  applyStatus(neg, { id: 'shred', type: 'ARMOR_SHRED', duration: 5, value: 0.3 });
  const d1 = calculateDamage({ rawDamage: 100, target: neg, source: {} });
  assert(near(d0, d1, 1e-9) && d0 > 100, '83차: 음수 방어력에는 % 감소가 적용되지 않는다(피해가 줄지 않음)');
  // 고정 방어력 감소는 음수로도 내려간다
  const t2 = { armor: 10, statusEffects: [] };
  applyStatus(t2, { id: 'flat', type: 'ARMOR_SHRED_FLAT', duration: 5, value: 30 });
  assert(near(calculateDamage({ rawDamage: 100, target: t2, source: {} }), 100 * (2 - 100 / 120), 1e-6), '83차: 고정 방어력 감소(10-30=-20)는 음수 방어력 피해 증가로 이어진다');
  // 추가 방어 관통(야스오 R 등)은 % 관통 뒤 추가 방어력 몫에만
  const t3 = { armor: 200, baseArmor: 100, statusEffects: [] };
  const dPen = calculateDamage({ rawDamage: 100, target: t3, source: {}, armorPenPercent: 0.5, bonusArmorIgnorePercent: 0.5 });
  assert(near(dPen, 100 * 100 / (100 + 75), 1e-6), '83차: 방어력 200(추가 100) → % 관통 50% → 100, 추가 몫 50의 50% 관통 → 75');
}
{
  // 마법 전용 보호막은 마법 피해만 막는다(같은 종류면 일반 보호막보다 먼저)
  const u = { statusEffects: [] };
  context.addShield(u, 'generic', 100, 5);
  context.addShield(u, 'maw', 100, 10, { onlyType: 'MAGICAL' });
  assert(context.absorbShieldDamage(u, 150, 'PHYSICAL') === 50, '83차: 물리 피해는 마법 전용 보호막을 건너뛴다');
  const u2 = { statusEffects: [] };
  context.addShield(u2, 'generic', 100, 5); context.addShield(u2, 'maw', 100, 10, { onlyType: 'MAGICAL' });
  context.absorbShieldDamage(u2, 80, 'MAGICAL');
  assert(near(u2.shield, 120), '83차: 마법 피해는 마법 전용 보호막부터 깎는다(일반 보호막 100 그대로)');
}
{
  // 강인함: 0.3초 미만으로 줄지 않음, 아이템 곱연산은 item_system에서(여기선 룬+상태)
  const u = { statusEffects: [], runeTenacity: 0.9 };
  context.applyStatus(u, { id: 's', type: 'STUN', duration: 1, value: 1 });
  assert(near(u.statusEffects[0].duration, 0.3), '83차: 강인함이 커도 기절은 0.3초 미만으로 줄지 않는다');
  // 도발된 대상은 기절이 아니라 시전자를 공격한다
  const src = { hp: 100, mesh: { position: new Vector3(0, 0, 0) } };
  const t = { statusEffects: [], mesh: { position: new Vector3(0, 0, 1) } };
  context.applyStatus(t, { id: 'taunt', type: 'TAUNT', duration: 1, value: 1, source: src });
  assert(!isStunned(t) && context.isTaunted(t) && context.getTauntSource(t) === src, '83차: 도발은 행동 불가(기절)가 아니라 시전자 공격 강제');
  // 공속 감소는 곱연산
  const a = { statusEffects: [] };
  context.applyStatus(a, { id: 'a1', type: 'AS_REDUCTION', duration: 2, value: 0.2 });
  context.applyStatus(a, { id: 'a2', type: 'AS_REDUCTION', duration: 2, value: 0.15 });
  assert(near(context.getAttackSpeedReductionMultiplier(a), 0.8 * 0.85), '83차: 공격 속도 감소는 출처끼리 곱연산(총 공속에 곱함)');
}
{
  // 요네 치명타 + 무한의 대검: (1.75 + 0.3) × 0.9
  const c = makeChamp('yone');
  c.recomputeStats && c.stats; c.stats.critDamageModifier = 0.9; c.itemBonusCritDamagePercent = 0.3;
  const d = context.calculateDamage({ rawDamage: 100, damageType: 'TRUE', isCritical: true, critMultiplier: 1.575, target: { statusEffects: [] }, source: c });
  assert(near(d, 184.5, 1e-6), '83차: 요네 치명타 보정은 대검 보너스까지 더한 총 배율에 곱한다(184.5) ' + d);
}
{
  // 칼바람 규칙: 맵이 깔렸을 때만. 리 신 +5% 피해, 1500 거리 = 22.5% 감소, 궁극기는 제외
  context.howlingAbyssStructuresSpawned = true;
  const c = makeChamp('leesin');
  const far = makeEnemy(0, lolRangeToWorld(1500), { armor: 0 });
  const dNear = context.calculateDamage({ rawDamage: 100, damageType: 'TRUE', target: makeEnemy(0, 1, { armor: 0 }), source: c });
  const dFar = context.calculateDamage({ rawDamage: 100, damageType: 'TRUE', target: far, source: c });
  const dUlt = context.calculateDamage({ rawDamage: 100, damageType: 'TRUE', target: far, source: c, isUltimate: true });
  assert(near(dNear, 105) && near(dFar, 105 * 0.775) && near(dUlt, 105), '83차: 칼바람 - 리 신 피해 +5%, 1500 거리 22.5% 감소, 궁극기는 감소 제외');
  context.howlingAbyssStructuresSpawned = false;
}
