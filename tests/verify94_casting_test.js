// 94차 감사(docs/COMBAT_AUDIT.md) "수정 완료, 검증 미완료" 항목 검증 - 시전·입력과 평타.
// C2(전용 행동 키 후딜 취소), C3(_castLock 선입력), C4(명령이 선입력 취소), C9(시전 중 귀환 금지),
// A1(비대상 대상 해제), A2(선딜 중 대상 사망), A3(행동 불가 뒤 평타 재개), A4(레넥톤 평타 공용 규칙), A5(사망 시 명령 정리).
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
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, clearInterval: () => {},
  controller: null,
  PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  getArmorShredPercent: () => 0, getMagicDamageReductionPercent: () => 0, getMrShredFlat: () => 0,
  itemSystemTick: () => {}, updateBars: () => {}, updateSkillUI: () => {}, refreshUnitCcTags: () => {},
  emitGameEvent: () => {}, _evId: () => null,
  updateExpUI: () => {}, showSkillToast: (m) => toasts.push(m), updateStateLabel: () => {},
  damageEnemy: (enemy, dmg) => { enemy.hp = Math.max(0, enemy.hp - dmg); },
  placedDummies: [],
  vfx: { spawn: () => {} },
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
  'src/session/game_commands.js',
].map(read).join('\n') + `
this.CharacterController = CharacterController;
this.STATE = STATE;
this.applyStatus = applyStatus;
this.LocalSession = LocalSession;
this.setController = (c) => { controller = c; };
this.computeChampionStats = computeChampionStats;
`, context);
const { CharacterController, STATE, applyStatus, LocalSession, setController, computeChampionStats } = context;
context.showSkillToast = (m) => toasts.push(m); // 01_hit_detection.js의 실제 함수(DOM)를 기록용으로 바꾼다

const AA = { clips: ['Attack1'], startup: 0.2, recovery: 0.4, cancelToMove: true, cancelToSpell: true, cancelable: true };
function makeActionData() { return { death: { clips: [] }, recall: { clips: [] }, attack1: { ...AA }, attack2: { ...AA }, attack3: { ...AA }, attack4: { ...AA }, crit: { ...AA } }; }
// 뼈대 컨트롤러. _resumeAfterAction은 실제 함수를 쓰고(선입력 처리 경로), 걷기 복귀만 기록한다.
function makeChamp(championId, overrides = {}) {
  const c = Object.create(CharacterController.prototype);
  Object.assign(c, {
    championId, team: 'BLUE', isChampion: true,
    root: { position: new Vector3(0, 0, 0), quaternion: {}, rotation: { y: 0 } },
    hp: 1000, maxHp: 2000, mp: 1000, maxMp: 1000, shield: 0, statusEffects: [],
    champLevel: 1, skillLevels: { Q: 1, W: 1, E: 1, R: 1 },
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackSpeedMultiplier: 1, minAttackSpeed: 0.2, maxAttackSpeed: 2.5, bonusAttackSpeedPercent: 0, windupPercent: 0.2, ...computeChampionStats(championId, 1), critChance: 0 },
    itemBonusAD: 0, bonusAD: 0, collisionRadius: 0.5, attackOverrides: [], subStates: {}, _transientMoveClipNames: new Set(),
    passiveState: { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0 },
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

// ===== C2: 챔피언 전용 행동 키(actionData 없음) + 후딜(RECOVERY, 끊을 수 있음) → 바로 새 스킬 =====
{
  const c = recordDispatch(makeChamp('ahri'));
  c.state = STATE.Q_CAST; c.currentActionKey = 'ahriQ'; c.currentPhase = 'RECOVERY'; c.phaseCancelable = true;
  c.castAbility('E', P(0, 5));
  assert(c.dispatched.join() === 'E' && c.currentActionKey == null && c.pendingCast == null, 'C2: 전용 행동 키(아리 Q) 후딜 중 누른 E는 남은 모션을 끊고 바로 시전');
  const d = recordDispatch(makeChamp('lux'));
  d.state = STATE.Q_CAST; d.currentActionKey = 'luxQ'; d.currentPhase = 'STARTUP'; d.phaseCancelable = false;
  d.castAbility('E', P(0, 5));
  assert(d.dispatched.length === 0 && d.pendingCast && d.pendingCast.slot === 'E' && d.currentActionKey === 'luxQ', 'C2: 같은 전용 키라도 시전 시간(STARTUP) 중에는 끊지 않고 선입력으로 보관');
  const e = recordDispatch(makeChamp('renekton'));
  e.state = STATE.W_CAST; e.currentActionKey = 'renektonW'; e.currentPhase = 'RECOVERY'; e.phaseCancelable = false;
  e.castAbility('Q', P(0, 5));
  assert(e.dispatched.length === 0 && e.pendingCast && e.pendingCast.slot === 'Q', 'C2: 끊을 수 없는 후딜(phaseCancelable=false)은 끊지 않고 선입력만');
  // 선입력은 후딜이 끊을 수 있게 되면 _flushBufferedCast가 쓴다
  d.currentPhase = 'RECOVERY'; d.phaseCancelable = true;
  d._flushBufferedCast();
  assert(d.dispatched.join() === 'E' && d.pendingCast == null, 'C2: 보관한 선입력은 앞 스킬이 끊을 수 있는 후딜에 들어가면 바로 나간다(_flushBufferedCast)');
  // 1.5초보다 오래된 선입력은 버린다
  const f = recordDispatch(makeChamp('lux'));
  f.state = STATE.Q_CAST; f.currentActionKey = 'luxQ'; f.currentPhase = 'STARTUP';
  f.castAbility('W', P(0, 5));
  now += 1600; f.currentPhase = 'RECOVERY'; f.phaseCancelable = true;
  f._flushBufferedCast();
  assert(f.dispatched.length === 0 && f.pendingCast == null, 'C2: 1.5초보다 오래 기다린 선입력은 버린다');
}

// ===== C3: _castLock - 잠긴 칸 입력은 선입력으로 보관했다가 잠금이 풀리면 시전 =====
{
  const c = recordDispatch(makeChamp('renekton'));
  c._castLock = { until: now + 250, slots: ['E', 'R'] };
  c.castAbility('E', P(0, 5));
  assert(c.dispatched.length === 0 && c.pendingCast && c.pendingCast.slot === 'E', 'C3: 잠금(_castLock) 중 잠긴 칸(E) 입력은 버리지 않고 선입력으로 보관');
  c._flushBufferedCast();
  assert(c.dispatched.length === 0 && c.pendingCast, 'C3: 잠금이 풀리기 전에는 선입력을 쓰지 않는다');
  c.castAbility('W', P(0, 5));
  assert(c.dispatched.join() === 'W', 'C3: 잠기지 않은 칸(W)은 잠금 중에도 바로 시전');
  c.pendingCast = { slot: 'E', mouseWorldPoint: P(0, 5), at: now };
  now += 300;
  c._flushBufferedCast();
  assert(c.dispatched.join() === 'W,E' && c.pendingCast == null, 'C3: 잠금이 풀리면 보관한 E가 자동으로 나간다');
}

// ===== C4: 이동·정지·공격·공격 이동·귀환 명령은 선입력을 지운다(시전 명령은 지우지 않음) =====
{
  const c = makeChamp('garen');
  const calls = [];
  c.moveTo = () => { calls.push('move'); return true; };
  c.selectTarget = () => { calls.push('attack'); return true; };
  c.attackMoveTo = () => { calls.push('attackMove'); return null; };
  c.startRecall = () => { calls.push('recall'); };
  c.castAbility = (slot) => { calls.push('cast' + slot); };
  const enemy = makeEnemy(0, 3);
  stubs.findEntityById = (id) => (id === 7 ? enemy : null);
  const s = new LocalSession();
  const cmds = [
    { type: 'move', point: { x: 1, z: 1 } }, { type: 'stop' }, { type: 'attack', targetId: 7 },
    { type: 'attackMove', point: { x: 2, z: 2 } }, { type: 'recall' },
  ];
  let allCleared = true;
  for (const cmd of cmds) {
    c.pendingCast = { slot: 'Q', mouseWorldPoint: null, at: now };
    const r = s.submit(cmd);
    if (!r.ok || c.pendingCast !== null) allCleared = false;
  }
  assert(allCleared && calls.join() === 'move,move,attack,attackMove,recall', 'C4: 이동·정지·공격·공격 이동·귀환 명령은 기억해 둔 스킬 선입력을 지운다');
  c.pendingCast = { slot: 'Q', mouseWorldPoint: null, at: now };
  s.submit({ type: 'cast', slot: 'W' });
  assert(c.pendingCast && c.pendingCast.slot === 'Q', 'C4: 다른 스킬 시전 명령은 선입력을 지우지 않는다(최신 입력이 castAbility에서 덮어씀)');
}

// ===== C9: 스킬 시전·돌진·충전 중에는 귀환을 시작하지 않는다(평타 중은 취소하고 귀환) =====
{
  const busyCases = [
    ['스킬 시전 중', (c) => { c.state = STATE.Q_CAST; c.currentActionKey = 'garenQ'; c.currentPhase = 'STARTUP'; }],
    ['돌진 중', (c) => { c._dashState = { elapsed: 0, duration: 0.3 }; }],
    ['바루스 Q 충전 중', (c) => { c._varus.qCharge = { startedAt: now }; }],
  ];
  for (const [label, setup] of busyCases) {
    toasts.length = 0;
    const c = makeChamp('varus');
    setup(c);
    const key = c.currentActionKey;
    c.startRecall();
    assert(c.state !== STATE.RECALL && c.currentActionKey === key && toasts.some((m) => /스킬 사용 중/.test(m)), `C9: ${label}에는 귀환을 시작하지 않고 진행 중 상태를 지우지 않는다`);
  }
  const a = makeChamp('garen');
  const t = makeEnemy(0, 1);
  a.state = STATE.ATTACK; a.currentActionKey = 'attack1'; a.currentPhase = 'STARTUP'; a.currentTarget = t;
  a.startRecall();
  assert(a.state === STATE.RECALL && a.currentActionKey == null && a.currentTarget == null, 'C9: 평타 중에는 평타를 취소하고 귀환한다(예전 동작 유지)');
}

// ===== A1: 비대상 유닛은 공격 대상으로 정하지 못하고, 추격 중 비대상이 되면 대상을 놓는다 =====
{
  const c = makeChamp('garen');
  const u = makeEnemy(0, 1, { isUntargetable: true });
  c.selectTarget(u);
  assert(c.currentTarget == null && !c.attackOrderActive, 'A1: 비대상 유닛은 selectTarget으로 대상이 되지 않는다');
  const d = makeChamp('garen');
  const far = makeEnemy(0, 30);
  d.currentTarget = far; far.isUntargetable = true; d.isChasing = true;
  d._tryEngageTarget();
  assert(d.currentTarget == null && d.isChasing === false, 'A1: 추격·교전 시점(_tryEngageTarget)에 대상이 비대상이면 대상을 놓는다');
}

// ===== A1·A2: 선딜 끝(onFire)에 대상이 비대상/사망이면 대상을 놓고 타이머를 돌려받는다 =====
function swingAt(c, target) {
  let captured = null;
  c.runAction = function(key, st, opts) { captured = opts; this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.state = st; this._attackMarkPending = false; };
  c.currentTarget = target;
  c._attackReadyAt = 0;
  c._beginAttackSwing();
  return captured;
}
{
  const c = makeChamp('garen');
  const t = makeEnemy(0, 1);
  const opts = swingAt(c, t);
  assert(opts && typeof opts.onFire === 'function' && c._attackReadyAt > now, 'A2 준비: 공용 평타 스윙이 시작되고 평타 타이머가 돈다');
  t.hp = 0;
  opts.onFire();
  assert(c.currentTarget == null && c._attackReadyAt === 0 && c.currentActionKey == null && c.state === STATE.IDLE, 'A2: 선딜 중 대상이 죽으면 대상을 놓고 평타 타이머를 돌려받는다(빈 공격 없음)');
  const d = makeChamp('garen');
  const u = makeEnemy(0, 1);
  const o2 = swingAt(d, u);
  u.isUntargetable = true;
  let hitCalls = 0; d._onBasicAttackHit = () => { hitCalls++; };
  o2.onFire();
  assert(d.currentTarget == null && d._attackReadyAt === 0 && hitCalls === 0, 'A1: 선딜 중 대상이 비대상이 되면 대상을 놓는다(준비 동작 무한 반복 방지)');
}

// ===== A3: 행동 불가로 막힌 평타는 풀리면 대기 루프가 다시 친다 =====
{
  const c = makeChamp('garen');
  const t = makeEnemy(0, 1);
  applyStatus(c, { id: 'stun', type: 'STUN', duration: 1, value: 1 });
  c.currentTarget = t;
  c._beginAttackSwing();
  assert(c._awaitingAttackTimer === true, 'A3: 기절 중 평타 시도는 버리지 않고 _awaitingAttackTimer를 다시 건다');
  let swings = 0;
  c.runAction = function(key, st) { swings++; this.currentActionKey = key; this.state = st; this._attackMarkPending = false; };
  c._updateAttackTimerWait();
  assert(swings === 0, 'A3: 기절이 남아 있는 동안에는 다시 치지 않는다');
  now += 1100;
  c._updateAttackTimerWait();
  assert(swings === 1 && c.state === STATE.ATTACK, 'A3: 기절이 풀리면 같은 대상에게 평타를 다시 시작한다');
  // 선딜 도중 기절 → 취소, 타이머 반환, 대상 유지, 풀리면 재개
  const d = makeChamp('garen');
  const t2 = makeEnemy(0, 1);
  const opts = swingAt(d, t2);
  applyStatus(d, { id: 'stun', type: 'STUN', duration: 0.5, value: 1 });
  opts.onFire();
  assert(d.currentTarget === t2 && d._awaitingAttackTimer === true && d._attackReadyAt === 0, 'A3: 선딜 중 기절되면 평타를 취소하되 대상은 유지하고 재개 대기');
}

// ===== A4: 레넥톤 평타 - 침묵에 막히지 않고, 행동 불가면 재개 대기, 선딜 끝 공용 검사 =====
{
  const c = makeChamp('renekton');
  c._renekton.wArmed = false;
  const t = makeEnemy(0, 1);
  applyStatus(c, { id: 'sil', type: 'SILENCE', duration: 2, value: 1 });
  const opts = swingAt(c, t);
  assert(opts && /^renektonAA/.test(c.currentActionKey), 'A4: 레넥톤 평타는 침묵 중에도 나간다(원작 - 침묵은 스킬만 막음)');
  t.isUntargetable = true;
  opts.onFire();
  assert(c.currentTarget == null && c.currentActionKey == null, 'A4: 레넥톤 평타도 선딜 끝에 대상이 비대상이면 대상을 놓고 취소');
  const d = makeChamp('renekton');
  d._renekton.wArmed = false;
  applyStatus(d, { id: 'stun', type: 'STUN', duration: 1, value: 1 });
  d.currentTarget = makeEnemy(0, 1);
  d._beginAttackSwing();
  assert(d._awaitingAttackTimer === true && d.currentActionKey == null, 'A4: 레넥톤도 기절 중 평타는 재개 대기(_awaitingAttackTimer)로 남긴다');
}

// ===== A5: 사망 시 공격 이동·CC 중 이동 예약·자동 대상·평타 대기·잠금이 모두 지워진다 =====
{
  const c = makeChamp('garen');
  c._clearPending = () => {};
  Object.assign(c, {
    _attackMoveDest: P(5, 5), _attackMoveOpts: { championsOnly: false }, _ccBufferedMove: P(3, 3), _awaitingAttackTimer: true,
    attackOrderActive: true, attackOrderAnchor: {}, _autoAcquired: true, _approachCast: { slot: 'Q' }, _bufferedSummoner: { slot: 'F' },
    _castLock: { until: now + 1000, slots: ['E'] }, pendingCast: { slot: 'Q' }, pendingMove: P(1, 1), currentTarget: makeEnemy(0, 1),
  });
  c.hp = 0;
  c._die();
  const cleared = c._attackMoveDest == null && c._attackMoveOpts == null && c._ccBufferedMove == null && c._awaitingAttackTimer === false
    && !c.attackOrderActive && c.attackOrderAnchor == null && !c._autoAcquired && c._approachCast == null && c._bufferedSummoner == null
    && c._castLock == null && c.pendingCast == null && c.pendingMove == null && c.currentTarget == null && c.state === STATE.DEAD;
  assert(cleared, 'A5: 사망 시 공격 이동·행동 불가 중 이동 예약·자동 대상·평타 대기·스킬 잠금·선입력이 모두 지워진다');
  c._updateAttackTimerWait();
  assert(c.state === STATE.DEAD && c.targetPos == null, 'A5: 사망 뒤 대기 루프가 남은 명령으로 걸어가지 않는다');
}
