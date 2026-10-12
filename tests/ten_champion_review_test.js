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
  projectiles: { spawned: [], spawn(o) { this.spawned.push(o); } },
  applyDamageToMinion: (m, r) => { m.hp = Math.max(0, m.hp - r.rawDamage); return r.rawDamage; },
  killMinion: () => {}, getHorizontalDistanceOf: () => 0, abilityHasteCooldown: (c, cd) => cd,
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
  'src/champions/leesin.js', 'src/champions/nautilus.js', 'src/champions/yasuo.js', 'src/champions/yone.js',
  'src/champions/sett.js', 'src/champions/mordekaiser.js', 'src/champions/renekton.js', 'src/champions/nilah.js',
  'src/champions/chogath.js', 'src/champions/ezreal.js', 'src/champions/ashe.js', 'src/champions/varus.js',
  'src/champions/vex.js',
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
  c._settShieldDecayTick(0.5); const s1 = c.shield;
  advance(800); c._settShieldDecayTick(0.5);
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
