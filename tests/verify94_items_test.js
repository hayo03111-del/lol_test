// 94차 감사(docs/COMBAT_AUDIT.md) "수정 완료, 검증 미완료" 항목 검증 - 아이템.
// C8(행동 불가 중 아이템 사용 금지, 정화형 예외), C10(티아맷·히드라가 평타 후딜을 끊음), S7(아이템 보호막에 칼바람 보호막 보정).
// 실제 src(00_global_constants, 01_status_effect_system, shield_system, 01_hit_detection, item_data, item_system, item_extra_system)를 vm으로 불러온다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
let now = 1e6;
const warns = [];
let aramBalance = null;
const ctx = {
  console: { log() {}, warn() {}, error: console.error }, Math, performance: { now: () => now },
  THREE: { Vector3, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
  document: { getElementById: () => null, querySelectorAll: () => [] }, window: {},
  controller: null, PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  updateGoldDisplay() {}, updateItemUI() {}, updateBars() {}, refreshUnitCcTags() {}, showSkillToast() {},
  isPositionInBaseZone: () => true,
  findEnemiesInRadius: () => [],
  getAramBalance: () => aramBalance,
};
vm.createContext(ctx);
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
vm.runInContext([
  rd('src/core/00_global_constants.js'), rd('src/core/01_status_effect_system.js'), rd('src/core/shield_system.js'), rd('src/core/01_hit_detection.js'),
  rd('src/champions/item_data.js'), rd('src/core/item_system.js'), rd('src/core/item_extra_system.js'),
  'this.api = { useItem, itemOnTakeDamage, applyStatus, isCrowdControlled, STATE, ITEM_DATA };',
].join('\n'), ctx);
const A = ctx.api;
ctx.itemWarn = (m) => warns.push(m); // 실제 함수(DOM 토스트)를 기록용으로
ctx.getAramBalance = () => aramBalance; // champion_data.js를 불러오지 않으므로 칼바람 보정은 여기서 정한다

function makeCtrl(items, extra = {}) {
  const c = {
    championId: 'garen', team: 'BLUE', isChampion: true, root: { position: new Vector3(0, 0, 0) },
    items: items.map((id) => ({ id })), hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, statusEffects: [], champLevel: 9,
    stats: { attackDamage: 100, abilityPower: 0, attackRange: 1.5 }, state: 'IDLE',
    currentActionKey: null, currentPhase: null, phaseCancelable: false,
    resetAttackTimer() { this._attackReadyAt = 0; this.timerReset = (this.timerReset || 0) + 1; },
    _clearActionTimers() { this.timersCleared = (this.timersCleared || 0) + 1; },
    setState(s) { this.state = s; },
    _resumeAfterAction() { this.resumed = (this.resumed || 0) + 1; },
  };
  return Object.assign(c, extra);
}

// ===== C8: 행동 불가(기절) 중에는 아이템 액티브를 쓸 수 없다 - 정화형(수은)만 예외 =====
{
  const c = makeCtrl(['zhonyasHourglass', 'tiamat', 'quicksilverSash']);
  A.applyStatus(c, { id: 'stun', type: 'STUN', duration: 2, value: 1 });
  assert(A.isCrowdControlled(c), 'C8 준비: 기절 상태');
  warns.length = 0;
  const z = A.useItem(c, 0, {});
  assert(z === false && !c.isUntargetable && !c.statusEffects.some((e) => e.type === 'STASIS') && warns.some((m) => /행동 불가/.test(m)), 'C8: 기절 중에는 존야(정지)를 쓸 수 없다');
  const t = A.useItem(c, 1, {});
  assert(t === false && !(c._itemActiveCooldownUntil && c._itemActiveCooldownUntil.tiamat), 'C8: 기절 중에는 티아맷 액티브도 쓸 수 없다(재사용 대기도 돌지 않음)');
  const q = A.useItem(c, 2, {});
  assert(q === true && !A.isCrowdControlled(c), 'C8: 정화형 액티브(수은 장식띠)는 기절 중에도 써서 기절을 푼다');
  const free = makeCtrl(['zhonyasHourglass']);
  assert(A.useItem(free, 0, {}) === true && free.statusEffects.some((e) => e.type === 'STASIS'), 'C8: 행동 불가가 아니면 존야는 그대로 쓴다');
}

// ===== C10: 티아맷·히드라 사용은 평타 후딜을 끊고 바로 다음 평타로(선딜 중에는 끊지 않음) =====
{
  const c = makeCtrl(['tiamat'], { state: A.STATE.ATTACK, currentActionKey: 'attack1', currentPhase: 'RECOVERY', _attackReadyAt: now + 800 });
  assert(A.useItem(c, 0, {}) === true, 'C10 준비: 티아맷 사용');
  assert(c._attackReadyAt === 0 && c.currentActionKey == null && c.currentPhase == null && c.state === A.STATE.IDLE && c.timersCleared === 1 && c.resumed === 1,
    'C10: 평타 후딜(RECOVERY) 중 티아맷은 평타 타이머를 지우고 남은 후딜 모션을 끊은 뒤 곧바로 재교전');
  const d = makeCtrl(['ravenousHydra'], { state: A.STATE.ATTACK, currentActionKey: 'attack2', currentPhase: 'STARTUP', _attackReadyAt: now + 800 });
  A.useItem(d, 0, {});
  assert(d.currentActionKey === 'attack2' && d.currentPhase === 'STARTUP' && !d.timersCleared && !d.resumed, 'C10: 선딜(아직 안 맞힘) 중에는 평타를 끊지 않는다(굶주린 히드라)');
  const e = makeCtrl(['tiamat'], { state: 'Q_CAST', currentActionKey: 'garenQ', currentPhase: 'RECOVERY' });
  A.useItem(e, 0, {});
  assert(e.currentActionKey === 'garenQ' && !e.timersCleared, 'C10: 평타가 아닌 스킬 후딜은 끊지 않는다');
}

// ===== S7: 아이템 생명선 보호막에 칼바람 보호막 보정(getShieldReceivedMultiplier)이 곱해진다 =====
{
  const p = A.ITEM_DATA.seraphsEmbrace.lifelinePassive;
  aramBalance = { shielding: 0.2 };
  const c = makeCtrl(['seraphsEmbrace'], { hp: 400, maxHp: 1000, maxMp: 1000, itemShieldReceivedBonusPercent: 0.1 });
  A.itemOnTakeDamage(c, 200, 'PHYSICAL', null);
  const expected = 1000 * p.shieldManaPercent * 1.1 * 1.2;
  assert(near(c.shield, expected), `S7: 대천사의 포옹 생명선 보호막 = 최대 마나 비례 × 받는 보호막 증가(1.1) × 칼바람 보정(1.2) = ${expected.toFixed(1)}`);
  aramBalance = null;
  const d = makeCtrl(['seraphsEmbrace'], { hp: 400, maxHp: 1000, maxMp: 1000 });
  A.itemOnTakeDamage(d, 200, 'PHYSICAL', null);
  assert(near(d.shield, 1000 * p.shieldManaPercent), 'S7: 칼바람 보정이 없으면 기본값 그대로');
  const s = A.ITEM_DATA.sterakssGage.lifelinePassive;
  aramBalance = { shielding: -0.1 };
  const g = makeCtrl(['sterakssGage'], { hp: 400, maxHp: 1000, itemBonusMaxHp: 500 });
  A.itemOnTakeDamage(g, 200, 'PHYSICAL', null);
  assert(near(g._itemSterakShieldState.maxAmount, 500 * s.bonusHpShieldPercent * 0.9), 'S7: 스테락의 도전 보호막도 칼바람 보정(-10%)을 받는다');
  aramBalance = null;
}
