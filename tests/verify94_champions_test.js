// 94차 감사(docs/COMBAT_AUDIT.md 5절) 챔피언별 "수정 완료, 검증 미완료" 항목 검증 -
// 세트(Q 평타 초기화·손 순서·패시브 시간 초과, W 발사 순간 원점, E 커서 방향), 레넥톤(Q 행동 비점유·잠금, E 지나간 유닛),
// 바루스(Q 충전 중 W, R 오한 중첩), 아리(W 우회, R 도착 뒤 탄환, E 이번 프레임 구간 판정 P7), 야스오(E 중 점멸 C7), 럭스(E 둔화 잔류 1초), 닐라(E 중 R, E 끝 평타 초기화),
// 요네(R 판정 원점), 리 신(W 아군 미니언), 초가스(Q 시전 끝 행동 해제), 벡스(R2 대상 추적), 모데카이저(Q 방향).
// combat_round3_test.js와 같은 방식: 실제 src를 vm에 올리고 Object.create(CharacterController.prototype)로 뼈대만 만든다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
let timers = [];
let timerSeq = 0;
function fakeSetTimeout(fn, ms) { const id = ++timerSeq; timers.push({ id, fn, at: now + Math.max(0, ms || 0) }); return id; }
function fakeClearTimeout(id) { timers = timers.filter((t) => t.id !== id); }
function fakeSetInterval(fn, ms) {
  const id = ++timerSeq; const every = Math.max(1, ms || 0);
  const tick = () => { timers.push({ id, fn: () => { tick(); fn(); }, at: now + every }); };
  tick(); return id;
}
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
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }
  setY(y) { this.y = y; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceToSquared(v) { const d = this.distanceTo(v); return d * d; }
  applyQuaternion() { return this; }
  lerpVectors(a, b, t) { this.x = a.x + (b.x - a.x) * t; this.y = a.y + (b.y - a.y) * t; this.z = a.z + (b.z - a.z) * t; return this; }
}
const toasts = [];
const stubs = {
  performance: { now: () => now },
  console: { log() {}, warn() {}, error: console.error },
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, setInterval: fakeSetInterval, clearInterval: fakeClearTimeout,
  controller: null,
  PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  getArmorShredPercent: () => 0, getMagicDamageReductionPercent: () => 0, getMrShredFlat: () => 0,
  itemSystemTick: () => {}, updateBars: () => {}, updateSkillUI: () => {}, refreshUnitCcTags: () => {},
  emitGameEvent: () => {}, _evId: () => null,
  updateExpUI: () => {}, showSkillToast: (m) => toasts.push(m), updateStateLabel: () => {},
  damageEnemy: (enemy, dmg) => { enemy.hp = Math.max(0, enemy.hp - dmg); },
  placedDummies: [],
  vfx: { spawn: () => {}, groundShapeFlash: () => {}, groundShockwave: () => {} },
  applyDamageToMinion: (m, r) => { m.hp -= r.rawDamage; return r.rawDamage; },
  nilahVfx2: new Proxy({}, { get: () => () => null }), nilahVfx: new Proxy({}, { get: () => () => null }),
  minions: [], abilityHasteCooldown: (c, cd) => cd,
  targetRing: { clear() {}, attachTo() {} },
  attackStartHitPair: () => null, attackClipTimeScale: () => 1, attackHitClipTimeScale: () => 1,
  document: { getElementById: () => null },
  window: {},
  scene: { add() {}, remove() {} },
  THREE: { Vector3, LoopOnce: 2200, LoopRepeat: 2201, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
};
const context = vm.createContext(stubs);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
vm.runInContext([
  'src/core/00_global_constants.js', 'src/core/01_status_effect_system.js', 'src/core/shield_system.js', 'src/core/01_hit_detection.js',
  'src/core/skill_timing_database.js', 'src/animation/attack_sequence.js',
  'src/champions/champion_data.js', 'src/champions/champion_ability_database.js',
  'src/core/character_controller.js', 'src/core/controller_movement.js', 'src/core/controller_combat.js',
  'src/core/controller_casting.js', 'src/core/controller_lifecycle.js',
  'src/champions/garen.js', 'src/champions/darius.js', 'src/champions/masteryi.js', 'src/champions/leesin.js',
  'src/champions/renekton.js', 'src/champions/ahri.js', 'src/champions/varus.js', 'src/champions/sett.js',
  'src/champions/lux.js', 'src/champions/nilah.js', 'src/champions/yone.js', 'src/champions/chogath.js',
  'src/champions/vex.js', 'src/champions/mordekaiser.js', 'src/champions/yasuo.js',
].map(read).join('\n') + '\n' + read('src/world/mordekaiser_death_realm.js').match(/function canRealmInteract[\s\S]*?\n}\n/)[0] + `
this.CharacterController = CharacterController;
this.STATE = STATE;
this.applyStatus = applyStatus;
this.getStatus = getStatus;
this.lolRangeToWorld = lolRangeToWorld;
this.setMinions = (m) => { minions = m; };
this.CHAMPION_DATA = CHAMPION_DATA;
this.setController = (c) => { controller = c; };
this.computeChampionStats = computeChampionStats;
`, context);
const { CharacterController, STATE, applyStatus, getStatus, lolRangeToWorld, setController, computeChampionStats } = context;
context.showSkillToast = (m) => toasts.push(m); // 01_hit_detection.js의 실제 함수(DOM)를 기록용으로 바꾼다

const AA = { clips: ['Attack1'], startup: 0.2, recovery: 0.4, cancelToMove: true, cancelToSpell: true, cancelable: true };
function makeActionData() { return { w: { clips: ['Spell2'], buffDuration: 0 }, death: { clips: [] }, recall: { clips: [] }, attack1: { ...AA }, attack2: { ...AA }, attack3: { ...AA }, attack4: { ...AA }, crit: { ...AA } }; }
// 뼈대 컨트롤러. _resumeAfterAction은 실제 함수를 쓰고(선입력 처리 경로), 걷기 복귀만 기록한다.
function makeChamp(championId, overrides = {}) {
  const c = Object.create(CharacterController.prototype);
  Object.assign(c, {
    championId, team: 'BLUE', isChampion: true,
    root: { position: new Vector3(0, 0, 0), quaternion: { clone() { return { invert() { return this; } }; } }, rotation: { y: 0 } },
    hp: 1000, maxHp: 2000, mp: 1000, maxMp: 1000, shield: 0, statusEffects: [],
    champLevel: 1, skillLevels: { Q: 1, W: 1, E: 1, R: 1 },
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackSpeedMultiplier: 1, minAttackSpeed: 0.2, maxAttackSpeed: 2.5, bonusAttackSpeedPercent: 0, windupPercent: 0.2, abilityPower: 0, ...computeChampionStats(championId, 1), critChance: 0 },
    itemBonusAD: 0, bonusAD: 0, collisionRadius: 0.5, attackOverrides: [], subStates: {}, _transientMoveClipNames: new Set(),
    passiveState: { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0 }, abilityResolver: { championId },
    sequencePlayer: { isPlaying: false, play() {}, cancel() {}, update() {} },
    state: 'IDLE', currentActionKey: null, currentPhase: null, currentTarget: null, targetPos: null,
    pendingMove: null, pendingCast: null, moveDir: new Vector3(0, 0, 0),
    _actionTimers: [], _pendingTimeouts: [], _actionSerial: 0, actionData: makeActionData(),
    clips: [], played: [], comboIndex: 0,
    playFirstAvailable(names) { this.played.push(names && names[0]); return null; },
    crossFadeTo() {}, crossFadeToClip() {}, findAnimation() { return null; }, resolveClip() { return null; },
    faceDirectionInstant() {}, setState(s) { this.state = s; }, recomputeStats() {},
    _returnToLocomotion() { this.returned = (this.returned || 0) + 1; this.currentActionKey = null; this.currentPhase = null; },
    _getBonusAD() { return (this.itemBonusAD || 0) + (this.bonusAD || 0); },
  }, overrides);
  c._freshChampionStates();
  setController(c);
  return c;
}
// 실제 시전 대신 어떤 슬롯이 나갔는지만 기록한다(공통 시전 규칙만 본다).
function recordDispatch(c) { c.dispatched = []; c._dispatchCast = function(slot) { this.dispatched.push(slot); }; return c; }
function makeEnemy(x, z, overrides = {}) {
  const pos = new Vector3(x, 0, z);
  return Object.assign({ isChampion: true, team: 'RED', hp: 3000, maxHp: 3000, armor: 0, magicResist: 0, statusEffects: [], collisionRadius: 0.5, mesh: { position: pos }, root: { position: pos } }, overrides);
}
const P = (x, z) => new Vector3(x, 0, z);
function setEnemies(...list) { stubs.placedDummies.length = 0; stubs.placedDummies.push(...list); return list; }
// runAction을 가로채 onFire·faceDir 등 옵션만 받아 둔다(애니메이션 없이 판정 시점만 직접 부른다).
function captureRunAction(c) {
  c.ran = [];
  c.runAction = function(key, st, opts = {}) { this.ran.push({ key, opts }); this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.state = st; this._attackMarkPending = false; };
  return c;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const CHAMPION_DATA_R = (id, slot = 'R') => context.CHAMPION_DATA[id][slot];

// ===== 세트 =====
{
  // Q: 평타 초기화(RESET_SLOTS)
  const c = makeChamp('sett');
  c._attackReadyAt = now + 5000; c._attackWindupEndsAt = 0;
  c._activateAttackOverrideFromDb('Q', 6);
  assert(c._attackReadyAt === 0 && c.attackOverrides.some((o) => o.id === 'Q'), '세트 Q: 강화 평타 등록과 함께 평타 타이머를 초기화한다');
  // Q 강화 평타 두 방은 왼손 → 오른손(오른손은 선딜이 짧다)
  c._settQOnCast();
  assert(c._sett.qHandStep === 0 && c.comboIndex === 0, '세트 Q: 시전하면 손 순서를 왼손부터 다시 센다');
  captureRunAction(c);
  const t = makeEnemy(0, 1);
  c.currentTarget = t; c._attackReadyAt = 0;
  c._beginAttackSwing();
  c.currentActionKey = null; c.currentPhase = null; c.state = STATE.IDLE; c._attackReadyAt = 0;
  c._beginAttackSwing();
  const [s1, s2] = c.ran;
  assert(c.ran.length === 2 && c._sett.qHandStep === 2 && s2.opts.startupOverride < s1.opts.startupOverride - 1e-6,
    '세트 Q: 강화 평타 2회는 왼손 → 오른손(두 번째는 오른손이라 선딜이 짧다 - 예전엔 둘 다 왼손)');
  // 패시브: 왼손 뒤 2초 넘게 안 치면 다시 왼손
  const p = makeChamp('sett');
  p.comboIndex = 1; p._sett.lastPunchAt = now - 2500;
  p._settPassiveTimeoutTick();
  assert(p.comboIndex === 0, '세트 패시브: 왼손 뒤 2초가 지나면 다음 공격이 다시 왼손(예전엔 검사가 항상 꺼져 있었다)');
  const p2 = makeChamp('sett');
  p2.comboIndex = 1; p2._sett.lastPunchAt = now - 1000;
  p2._settPassiveTimeoutTick();
  assert(p2.comboIndex === 1, '세트 패시브: 2초 안이면 오른손 차례 유지');
}
{
  // W: 발사 순간 세트가 있는 자리에서 나간다
  const c = captureRunAction(makeChamp('sett'));
  c._settWApplyShield = () => {}; c._activateWSubState = () => {};
  let origin = null, fwd = null;
  c._settWOnCast = (o, f) => { origin = o.clone(); fwd = f.clone(); };
  c._castW(P(0, 10), true);
  const w = c.ran.find((r) => r.key === 'w');
  c.root.position.set(4, 0, 0); // 준비 중 점멸
  w.opts.onFire();
  assert(origin && near(origin.x, 4) && near(fwd.z, 1) && near(fwd.x, 0), '세트 W: 준비 중 점멸하면 주먹은 새 자리에서, 방향은 처음 조준한 그대로 나간다');
}
{
  // E: 커서 방향을 축으로
  const c = captureRunAction(makeChamp('sett'));
  c.actionData.e1 = { clips: ['Spell3'], startup: 0.25, recovery: 0.25 };
  c.currentTarget = makeEnemy(5, 0);
  let facing = null;
  c._settEOnCast = (f) => { facing = f.clone(); };
  c._castE(P(0, 5), true);
  const e = c.ran.find((r) => r.key === 'e1');
  e.opts.onFire();
  assert(facing && near(facing.z, 1) && near(facing.x, 0), '세트 E: 대상이 옆에 있어도 커서 방향을 축으로 양쪽을 나눈다');
  const d = captureRunAction(makeChamp('sett'));
  d.actionData.e1 = { clips: ['Spell3'], startup: 0.25, recovery: 0.25 };
  d.currentTarget = makeEnemy(5, 0);
  let f2 = null; d._settEOnCast = (f) => { f2 = f.clone(); };
  d._castE(null, true);
  d.ran.find((r) => r.key === 'e1').opts.onFire();
  assert(f2 && near(f2.x, 1), '세트 E: 커서 좌표가 없을 때만 예전처럼 대상 방향');
}

// ===== 레넥톤 =====
{
  // Q: 이동 중에 쓰면 행동 상태를 잡지 않고, 0.25초 동안 평타·E·R만 잠근다. 피해는 즉시.
  const c = makeChamp('renekton');
  const hit = makeEnemy(0, 1);
  setEnemies(hit);
  c.state = STATE.MOVE; c.targetPos = P(0, 20); c._attackReadyAt = 0;
  c._renektonCastQ(P(0, 5), false);
  assert(c.state === STATE.MOVE && c.currentActionKey == null && c.targetPos != null, '레넥톤 Q: 이동 중에 쓰면 행동을 차지하지 않고 계속 걷는다');
  assert(c._castLock && c._castLock.slots.join() === 'E,R' && near(c._castLock.until - now, 250) && near(c._attackReadyAt - now, 250), '레넥톤 Q: 0.25초 동안 E·R(스킬 잠금)과 평타(평타 타이머)만 잠근다');
  assert(hit.hp < 3000, '레넥톤 Q: 시전 시간 없이 즉시 판정');
  recordDispatch(c);
  c.castAbility('E', P(0, 5));
  assert(c.dispatched.length === 0 && c.pendingCast && c.pendingCast.slot === 'E', '레넥톤 Q 직후 E: 잠금 동안 선입력으로 보관');
  // 서 있을 때 Q → W는 바로(Q 행동 키가 있어도)
  const d = recordDispatch(makeChamp('renekton'));
  setEnemies();
  d._renektonCastQ(P(0, 5), false);
  assert(d.currentActionKey === 'renektonQ', '레넥톤 Q(서서 사용): 0.25초 짧은 행동 키를 잡는다');
  d.castAbility('W', P(0, 5));
  assert(d.dispatched.join() === 'W', '레넥톤 Q 중 W: 0.25초 잠금과 무관하게 바로 시전(Q→W 연계)');
  setEnemies();
}
{
  // E: 돌진이 실제로 지나간 구간에 닿은 적만 맞는다
  const c = makeChamp('renekton');
  const leaver = makeEnemy(0, 1.5), joiner = makeEnemy(3, 3);
  setEnemies(leaver, joiner);
  c._renektonCastE(P(0, 10), false);
  const ds = c._dashState;
  assert(ds && typeof ds.onTick === 'function', '레넥톤 E: 돌진에 지나간 구간 판정(onTick)을 단다');
  // 첫 프레임: 출발 직후 leaver가 길에서 비켜 나가고, 돌진 도중 joiner가 길로 들어온다(로더의 돌진 진행을 그대로 흉내).
  leaver.mesh.position.set(5, 0, 1.5);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const prev = c.root.position.clone();
    c.root.position.lerpVectors(ds.from, ds.to, i / steps);
    if (i === 3) joiner.mesh.position.set(0, 0, 3);
    ds.onTick(prev, c.root.position.clone());
  }
  c._dashState = null;
  advance(ds.duration * 1000 + 5);
  assert(joiner.hp < 3000 && leaver.hp === 3000, '레넥톤 E: 시전 순간이 아니라 돌진이 지나갈 때 닿은 적만 맞는다(빠져나간 적 제외·새로 들어온 적 포함)');
  assert(c._renekton.eSecondReadyUntil > now, '레넥톤 E: 지나가며 맞힌 적이 있으면 E2가 열린다');
  setEnemies();
}

// ===== 바루스 =====
{
  const c = recordDispatch(makeChamp('varus'));
  c.state = STATE.Q_CAST; c.currentActionKey = 'varusQCharge'; c.currentPhase = 'ACTIVE'; c._varus.qCharge = { startedAt: now };
  c.castAbility('W', P(0, 5));
  assert(c.dispatched.join() === 'W' && c.currentActionKey === 'varusQCharge', '바루스 W: Q 충전 중에도 바로 쓰고 충전은 그대로');
}
{
  const c = makeChamp('varus');
  const t = makeEnemy(0, 3);
  c._varusRHit(t, P(0, 1));
  const st0 = getStatus(t, 'varusBlight');
  advance(2100);
  const st = getStatus(t, 'varusBlight');
  assert(!st0 && st && st.stacks === 3, '바루스 R: 사슬에 묶인 챔피언은 속박 동안 오한 3중첩을 차례로 얻는다');
  const m = makeChamp('varus');
  const minion = makeEnemy(0, 3, { isChampion: false, isMinion: true });
  m._varusRHit(minion, P(0, 1));
  advance(2100);
  assert(!getStatus(minion, 'varusBlight'), '바루스 R: 오한 중첩은 챔피언에게만');
}

// ===== 아리 =====
{
  const c = recordDispatch(makeChamp('ahri'));
  c.state = STATE.E_CAST; c.currentActionKey = 'ahriE'; c.currentPhase = 'STARTUP';
  c.castAbility('W', P(0, 5));
  assert(c.dispatched.join() === 'W' && c.currentActionKey === 'ahriE', '아리 W: E 시전 시간 중에도 바로 쓴다(선입력 없이)');
}
{
  const c = makeChamp('ahri');
  const spawns = [];
  stubs.projectiles = { spawn: (o) => spawns.push(o) };
  const nearStart = makeEnemy(-1, 0), mover = makeEnemy(20, 4);
  setEnemies(nearStart, mover);
  c._ahriCastR(P(0, 4), true);
  assert(spawns.length === 0 && c._ahri.rDash, '아리 R: 시전 순간에는 탄환을 쏘지 않는다(돌진 먼저)');
  mover.mesh.position.set(0, 0, 5); // 돌진 중 도착 지점 근처로 들어온 적
  for (let i = 0; i < 40 && c._ahri.rDash; i++) c._ahriTickRDash(0.05);
  const targets = spawns.map((s) => s.target);
  const from = spawns[0] && spawns[0].from;
  assert(targets.includes(mover) && from && near(from.z, c.root.position.z) && near(from.x, c.root.position.x), '아리 R: 도착한 뒤 아리가 있는 자리에서 그때 주변의 적에게 탄환을 쏜다');
  delete stubs.projectiles;
  setEnemies();
}

// ===== 럭스 E: 영역을 벗어나도 1초 더 둔화 =====
{
  const c = makeChamp('lux');
  const t = makeEnemy(0, 5);
  setEnemies(t);
  c._lux.zone = { ready: true, end: P(0, 5), lvl: 1, expiresAt: now + 5000, area: null };
  c._luxTickZone(0.016);
  const st = getStatus(t, 'luxE_slow');
  assert(st && near(st.expiresAt - now, 1000), '럭스 E: 영역 안 둔화는 1초 지속(예전 0.25초)으로 걸린다');
  t.mesh.position.set(20, 0, 20); // 영역을 벗어남
  now += 600;
  c._luxTickZone(0.016);
  const st2 = getStatus(t, 'luxE_slow');
  assert(st2 && st2.expiresAt > now, '럭스 E: 영역을 벗어난 뒤 0.6초에도 둔화가 남아 있다');
  now += 500;
  assert(!(getStatus(t, 'luxE_slow') && getStatus(t, 'luxE_slow').expiresAt > now), '럭스 E: 벗어난 지 1초가 지나면 둔화가 끝난다');
  c._lux.zone = null;
  setEnemies();
}

// ===== 닐라 =====
{
  const c = recordDispatch(makeChamp('nilah'));
  c.state = STATE.E_CAST; c.currentActionKey = 'nilahE'; c.currentPhase = 'ACTIVE'; c._nilah.eDash = { from: P(0, 0), to: P(0, 3) };
  c.castAbility('R', P(0, 5));
  assert(c.dispatched.join() === 'R', '닐라 R: E 돌진 중에도 바로 시전');
  const d = makeChamp('nilah');
  d._nilah.eDash = { from: P(0, 0), to: P(0, 3) };
  d.currentActionKey = 'nilahE'; d.currentPhase = 'ACTIVE';
  let eEndFired = false;
  d._actionTimers.push(fakeSetTimeout(() => { eEndFired = true; }, 100));
  d._nilahCastR(true);
  assert(d.currentActionKey === 'nilahR' && d._nilah.rSeq, '닐라 E 중 R: R이 시작된다');
  advance(150);
  assert(eEndFired, '닐라 E 중 R: 돌진 중이면 E의 끝 처리 타이머를 지우지 않는다');
}
{
  const c = makeChamp('nilah');
  setEnemies();
  c._attackReadyAt = now + 3000; c._attackWindupEndsAt = 0;
  try { c._nilahResolveEDashEnd({ from: P(0, 0), to: P(0, 3) }); } catch (e) { /* 끝 처리의 연출(VFX)은 이 검사와 무관 */ }
  assert(c._attackReadyAt === 0, '닐라 E: 돌진이 끝나면 평타 타이머를 초기화한다');
}

// ===== 요네 R: 판정은 시전이 끝나는 순간의 자리에서(방향은 조준 그대로) =====
{
  const c = makeChamp('yone');
  const oldLine = makeEnemy(0, 5), newLine = makeEnemy(6, 5);
  setEnemies(oldLine, newLine);
  c._yoneCastR(P(0, 10), true);
  assert(c.currentActionKey === 'yoneR', '요네 R: 시전 시작');
  c.root.position.set(6, 0, 0); // 시전 중 점멸
  try { advance((CHAMPION_DATA_R('yone').castTime || 0.75) * 1000 + 5); } catch (e) { /* 판정 뒤 연출(블링크·VFX) 오류는 이 검사와 무관 */ }
  assert(newLine.hp < 3000 && oldLine.hp === 3000, '요네 R: 시전 중 점멸하면 새 자리에서 조준 방향으로 판정한다(예전엔 시작 위치)');
  setEnemies();
}

// ===== 리 신 W: 아군 미니언에게 방호 =====
{
  const c = makeChamp('leesin');
  const allyMinion = { team: 'BLUE', hp: 300, maxHp: 300, isMinion: true, collisionRadius: 0.4, mesh: { position: P(0, 4) } };
  const enemyMinion = { team: 'RED', hp: 300, maxHp: 300, isMinion: true, collisionRadius: 0.4, mesh: { position: P(4, 0) } };
  context.setMinions([allyMinion, enemyMinion]);
  assert(c._leesinPickWMinion(P(0, 4.1)) === allyMinion, '리 신 W: 커서 근처의 아군 미니언을 방호 대상으로 고른다');
  assert(c._leesinPickWMinion(P(4, 0)) == null, '리 신 W: 적 미니언은 고르지 않는다');
  c._leesinPlayCast = () => {}; c._leesinApplySelfWShield = (amt) => { c.selfShield = amt; };
  c._leesinCastW(false, P(0, 4.1));
  assert(c._dashState && near(c._dashState.to.x, 0) && c._dashState.to.z > 3 && c._dashState.to.z < 4 && c.selfShield > 0 && c.cooldowns.W > 0,
    '리 신 W: 아군 미니언에게 돌진하고 자기 보호막을 얻는다(예전엔 빈 땅으로 처리돼 거부)');
  allyMinion.hp = 0;
  assert(c._leesinPickWMinion(P(0, 4.1)) == null, '리 신 W: 죽은 아군 미니언은 고르지 않는다');
  context.setMinions([]);
}

// ===== 초가스 Q: 시전 시간이 끝나면 행동을 놓고, 파열은 따로 터진다 =====
{
  const c = makeChamp('chogath');
  const t = makeEnemy(0, 5);
  setEnemies(t);
  const q = CHAMPION_DATA_R('chogath', 'Q');
  c._chogathCastQ(P(0, 5), true);
  assert(c.currentActionKey === 'chogathQ', '초가스 Q: 시전 시작');
  advance(q.castTime * 1000 + 5);
  assert(c.currentActionKey == null && c.canStartNewAction() && t.hp === 3000, '초가스 Q: 시전 시간이 끝나면 곧바로 다른 행동 가능(폭발 전)');
  advance(q.impactDelay * 1000 + 5);
  assert(t.hp < 3000, '초가스 Q: 행동을 놓아도 파열은 예정대로 터진다');
  setEnemies();
}

// ===== 벡스 R2: 대상을 따라가서 도착할 때 피해 =====
{
  const c = makeChamp('vex');
  const t = makeEnemy(0, 6);
  setEnemies(t);
  c._vex.recastTarget = t; c._vex.recastReadyUntil = now + 5000;
  c._vexCastR(P(0, 6), false);
  assert(c.currentActionKey === 'vexRRecast' && c._vex.dashFollow === t, '벡스 R2: 표식 대상을 따라가는 돌진 시작');
  t.mesh.position.set(4, 0, 8); // 돌진 중 대상이 움직임
  let arrived = false;
  for (let i = 0; i < 100 && c._vex.dashActive; i++) { c._vexUpdateR(0.016); now += 16; }
  arrived = !c._vex.dashActive;
  const d = Math.hypot(c.root.position.x - 4, c.root.position.z - 8);
  assert(arrived && d <= t.collisionRadius + c.collisionRadius + 1e-6 && t.hp < 3000, '벡스 R2: 움직인 대상의 지금 위치까지 따라가 도착할 때 피해를 준다');
  assert(c.currentActionKey == null, '벡스 R2: 도착하면 행동이 끝난다');
  setEnemies();
}

// ===== 모데카이저 Q: 시전 중 자리가 바뀌면 새 자리에서 조준 지점 쪽으로 =====
{
  const c = captureRunAction(makeChamp('mordekaiser'));
  c.actionData.qForward = c.actionData.qLeft = c.actionData.qRight = c.actionData.qBack = { clips: ['Spell1'], startup: 0.5, recovery: 0.3 };
  let qDir = null;
  c._mordeQOnCast = (o, d) => { qDir = d.clone(); };
  c._castQ(P(0, 5), true);
  const run = c.ran[c.ran.length - 1];
  assert(run && typeof run.opts.onFire === 'function', '모데카이저 Q: 시전 시작');
  c.root.position.set(5, 0, 0); // 시전 중 밀려남/점멸
  run.opts.onFire();
  assert(qDir && near(qDir.x, -Math.SQRT1_2, 1e-6) && near(qDir.z, Math.SQRT1_2, 1e-6), '모데카이저 Q: 내리치는 순간 새 자리에서 처음 조준한 지점 쪽으로(예전엔 시전 때 방향)');
}

// ===== P7: 아리 E는 이번 프레임에 지나간 구간만 판정(이미 지나간 길로 들어온 적은 매혹되지 않음) =====
{
  const c = makeChamp('ahri');
  const late = makeEnemy(0, 1); // 구슬이 이미 지나간 자리
  setEnemies(late);
  const lw = (lol) => lolRangeToWorld(lol);
  c._ahri.eTravel = { origin: P(0, 0), dir: P(0, 1), traveled: lw(400), maxDist: lw(1000), speed: lw(1550), halfWidth: 60, lvl: 1, sprite: null };
  c._ahriTickETravel(0.016);
  assert(!getStatus(late, 'ahriCharm') && late.hp === 3000 && c._ahri.eTravel, 'P7 아리 E: 구슬이 이미 지나간 길에 뒤늦게 들어온 적은 매혹되지 않는다');
  const ahead = makeEnemy(0, c._ahri.eTravel.origin.z + c._ahri.eTravel.traveled + lw(30));
  setEnemies(late, ahead);
  for (let i = 0; i < 10 && c._ahri.eTravel; i++) c._ahriTickETravel(0.016);
  assert(getStatus(ahead, 'ahriCharm') && !getStatus(late, 'ahriCharm'), 'P7 아리 E: 앞으로 지나가는 구간의 적은 맞는다');
  setEnemies();
}

// ===== C7: 야스오 E 돌진 중 점멸하면 점멸 지점에서 돌진이 끝나고 EQ가 거기서 판정된다 =====
{
  const c = makeChamp('yasuo');
  let eqAt = null;
  c._yasuoResolveEQ = () => { eqAt = c.root.position.clone(); };
  c._yasuoApplyEDashDamage = () => {};
  c.state = STATE.E_CAST; c.currentActionKey = 'yasuoE'; c.currentPhase = 'ACTIVE';
  Object.assign(c._yasuo, { eDashStart: P(0, 0), eDashEnd: P(0, 4), eDashElapsed: 0.1, eDashDuration: 0.4, eqPending: { slot: 'Q' } });
  c._yasuoOnFlash(P(0, 1), P(3, 1));
  assert(c.root.position.x === 3 && c.root.position.z === 1 && eqAt && eqAt.x === 3 && c._yasuo.eDashStart == null && c.currentActionKey == null,
    'C7 야스오 E 중 점멸: 점멸 지점에서 돌진이 끝나고 예약된 EQ도 그 자리에서 판정');
}
