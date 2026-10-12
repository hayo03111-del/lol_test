// 요네 시스템 점검 + 공용 전투 규칙(관통 순서, 피해 감소, 성장 공식, 공속, 생명력 흡수, 속박/침묵, DOT 갱신) 회귀 테스트.
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
this.setController = (c) => { controller = c; };
`, context);
const { CharacterController, CHAMPION_DATA, STATE, applyStatus, applyDamage, getStatus, getSlowPercent,
  getAttackSpeedBuffPercent, getTenacity, computeChampionStats, lolRangeToWorld, setController, worldDistanceToLol, calculateDamage, isStunned, isRooted, tickStatusEffects, getMoveSpeedBuffPercent, getFinalAttackSpeed } = context;

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
const YD = CHAMPION_DATA.yone;
function makeYone(overrides = {}) {
  const c = makeChamp('yone', ['Spell2', 'Spell3_Dash', 'Spell4'], overrides);
  c.stats.critChance = 0; c.mp = 0;
  c.sequencePlayer = { play() {}, cancel() {}, isPlaying: false };
  c.resolveClip = (names) => null;
  c._yone = { qStacks: 0, qStackExpiresAt: 0, azakanaNext: false, eSpirit: null, wShieldUntil: 0, wShieldApplied: 0 };
  c._yoneSpawnBodyHusk = () => null; c._yoneSetSpiritTint = () => {}; c._yoneCleanupSpiritVisuals = () => {};
  c._yoneUpdateSpiritBeam = () => {};
  c.root.quaternion = { clone() { return this; }, copy() { return this; } };
  c._yoneEnsureMarkIndicator = () => {}; c._yoneUpdateMarkIndicators = () => {};
  return c;
}

// --- 요네 Q: 직선 판정, 치명타는 AD 부분에만 ---
{
  const c = makeYone();
  const front = makeEnemy(0, lolRangeToWorld(300));
  const side = makeEnemy(lolRangeToWorld(150), lolRangeToWorld(300));
  stubs.placedDummies = [front, side];
  const hits = c._yoneFindQTargets(new Vector3(0, 0, 1), YD.Q.range);
  assert(hits.length === 1 && hits[0] === front, '요네 Q: 폭 80 직선(옆 150 떨어진 적 제외, 예전 부채꼴)');
  c._yoneQCritRoll = true;
  const hp0 = front.hp; c._yoneApplyQHit(front);
  assert(near(hp0 - front.hp, YD.Q.damageByLevel[0] + 100 * YD.Q.totalAdRatio * 1.75), '요네 Q 치명타: 25 + AD 110% × 치명타 배율 1.75(기본 피해엔 미적용)');
  c._yoneQCritRoll = null;
}
// --- 요네 Q 쿨다운/시전: bin 관계식 ---
{
  const c = makeYone();
  c.stats.bonusAttackSpeedPercent = 0.5;
  assert(near(c._yoneQCooldown(), 4 * (1 - 0.30)) && near(c._yoneQCastTime(), 0.35 * (1 - 0.208335)), '요네 Q: 추가 공속 50% → 쿨다운 30%/시전 20.8% 감소(1%당 0.6%/0.41667%)');
}
// --- 요네 W: 최대 체력 8%(1레벨), 보호막은 자기 몫만, 몬스터는 챔피언 적중 아님 ---
{
  timers = [];
  const c = makeYone();
  c._payCost = () => true; c.skillLevels.W = 1;
  const champ = makeEnemy(0, lolRangeToWorld(300), { maxHp: 3000, hp: 3000 });
  stubs.placedDummies = [champ];
  c.shield = 50; // 다른 출처 보호막
  c._yoneCastW(new Vector3(0, 0, 1), true);
  advance(600);
  const expectW = YD.W.totalMixedDamageByLevel[0] + 3000 * 0.08;
  assert(near(3000 - champ.hp, expectW), '요네 W: 10 + 최대 체력 8%(1레벨, 예전 7% - 한 칸 밀림)');
  assert(c.shield > 50 && context.getShieldById(c, 'yoneW') > 0, '요네 W: 보호막을 기존 보호막 위에 더함');
  now += 2000; c._yoneTick(0.016); context.tickShields(c, 0.016);
  assert(near(c.shield, 50), '요네 W: 만료 시 W 몫만 걷어내고 다른 보호막(50)은 유지(예전엔 0으로 지움)');
}
// --- 요네 E: 정신체는 대상 지정 가능, 표식은 챔피언·실제 피해 기준, 일반 평타도 표식 ---
{
  timers = [];
  const c = makeYone();
  c._payCost = () => true;
  c._yoneCastE(new Vector3(0, 0, 1), true);
  assert(!c.isUntargetable, '요네 E: 정신체(요네 본인)는 대상 지정 가능(예전엔 5초 무적)');
  const champ = makeEnemy(0, 1, { armor: 100 });
  const mon = makeEnemy(0, 1, { isChampion: false, isMonster: true });
  c._yoneRecordMark(champ, 50);
  c._yoneRecordMark(mon, 50);
  const key = champ;
  assert(near(c._yone.eSpirit.marks.get(key), 50 * 0.25), '요네 E: 챔피언에게 "실제로 입힌" 피해의 25% 저장');
  assert(!c._yone.eSpirit.marks.has(mon), '요네 E: 몬스터는 표식 대상이 아니다');
}
// --- 요네 R: 블링크는 마지막 "챔피언" 뒤 200 ---
{
  timers = [];
  const c = makeYone();
  c._payCost = () => true;
  const champ = makeEnemy(0, lolRangeToWorld(400));
  const minion = makeEnemy(0, lolRangeToWorld(800), { isChampion: false }); // 비챔피언 유닛(미니언 대용 - 미니언 전용 피해 경로는 이 테스트에 로드하지 않음)
  stubs.placedDummies = [champ, minion];
  c._yoneCastR(new Vector3(0, 0, 1), true);
  advance(800);
  assert(near(c.root.position.z, lolRangeToWorld(600), 1e-6), '요네 R: 미니언이 더 멀리 있어도 마지막 챔피언(400) 뒤 200으로 블링크');
  const R = YD.R;
  assert(champ.hp < 3000 && !getStatus(champ, 'yoneRStun'), '요네 R: 베는 순간 피해, 끌려가는 순간 기절 해제');
  advance(500);
  assert(!!getStatus(champ, 'yoneRKnockup'), '요네 R: 끌려간 뒤 공중에 뜸');
}

// ================= 공용 전투 규칙 =================
{
  const atk = { itemBonusArmorPenFlat: 10, itemBonusArmorPenMultiplier: 0.82 };
  const tgt = { armor: 100, statusEffects: [] };
  const dmg = calculateDamage({ rawDamage: 200, damageType: 'PHYSICAL', target: tgt, source: atk });
  assert(near(dmg, 200 * 100 / (100 + (100 * 0.82 - 10))), '관통 순서: % 관통 → 고정 관통(원작)');
  // 피해 감소 이중 적용 제거(takeDamage가 있는 대상은 calculateDamage에서 감소 미적용)
  const withTake = { magicResist: 0, statusEffects: [{ type: 'DAMAGE_REDUCTION', value: 0.3, expiresAt: now + 5000 }], takeDamage() {} };
  assert(near(calculateDamage({ rawDamage: 100, damageType: 'MAGICAL', target: withTake }), 100), '피해 감소: 피격 처리가 있는 대상은 계산 단계에서 감소하지 않음(예전엔 마법 피해에 두 번)');
  const dummyT = { armor: 0, statusEffects: [{ type: 'DAMAGE_REDUCTION', value: 0.3, expiresAt: now + 5000 }] };
  assert(near(calculateDamage({ rawDamage: 100, damageType: 'PHYSICAL', target: dummyT }), 70), '피해 감소: 허수아비처럼 피격 처리가 없는 대상은 물리 피해에도 감소 적용(예전엔 미적용)');
}
{
  const s9 = computeChampionStats('garen', 9), s1 = computeChampionStats('garen', 1), s18 = computeChampionStats('garen', 18);
  const g = CHAMPION_DATA.garen.stats;
  assert(near(s18.maxHp, g.hp + g.hpGrowth * 17), '성장 공식: 18레벨은 직선과 동일');
  assert(near(s9.maxHp, g.hp + g.hpGrowth * 8 * (0.7025 + 0.0175 * 8)), '성장 공식: 9레벨 = 기본 + 성장×8×(0.7025+0.0175×8)(원작)');
  assert(s1.baseAttackSpeed === g.attackSpeed && s18.levelBonusAttackSpeed > 0, '공격 속도: 기본값 고정 + 레벨 성장은 추가 공속으로 분리');
  const st = { baseAttackSpeed: 0.625, levelBonusAttackSpeed: 0.5, bonusAttackSpeedPercent: 0.5, attackSpeedMultiplier: 1, minAttackSpeed: 0.2, maxAttackSpeed: 2.5 };
  assert(near(getFinalAttackSpeed(st), 0.625 * 2), '공격 속도: 레벨 성장 + 아이템 공속은 합산(예전엔 곱연산)');
  st.bonusAttackSpeedPercent = 10;
  assert(near(getFinalAttackSpeed(st), 2.5), '공격 속도 상한 2.5');
}
{
  const u = { statusEffects: [] };
  applyStatus(u, { id: 'r', type: 'ROOT', duration: 1, value: 1 });
  assert(!isStunned(u) && isRooted(u), '속박: 이동만 막고 공격/스킬은 막지 않는다(기절과 구분)');
  const m = { statusEffects: [] };
  applyStatus(m, { id: 'a', type: 'MS_BUFF', duration: 2, value: 0.2 });
  applyStatus(m, { id: 'b', type: 'MS_BUFF', duration: 2, value: 0.35 });
  assert(near(getMoveSpeedBuffPercent(m), 0.55), '이동 속도: 서로 다른 % 증가는 합산(예전엔 최대값 하나)');
}
{
  // DOT 재적용 시 틱 진행도 유지(다리우스 출혈 갱신)
  const t = makeEnemy(0, 1, { hp: 1000, maxHp: 1000, armor: 0 });
  applyStatus(t, { id: 'bleed', type: 'DOT', duration: 5, tickInterval: 1, totalDamage: 50, damageType: 'TRUE' });
  for (let i = 0; i < 6; i++) { tickStatusEffects(t, 0.9); now += 900; applyStatus(t, { id: 'bleed', type: 'DOT', duration: 5, tickInterval: 1, totalDamage: 50, damageType: 'TRUE' }); }
  assert(t.hp < 1000, 'DOT: 틱 간격보다 짧게 계속 갱신해도 피해가 들어간다(예전엔 0)');
}
