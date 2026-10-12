/* ------------------------------------------------------------
   보호막(원작 모델 이식)
   원작은 보호막마다 별도 인스턴스(출처·양·지속시간·감소)를 두고, 서로 다른 보호막은 더해진다.
   받는 피해는 "먼저 만료되는 보호막"부터 깎는다. 예전 엔진은 unit.shield 숫자 하나에 챔피언·아이템이
   각자 몫을 따로 추적하며 더하거나(max) 덮어써서, 다른 보호막을 지우거나 되살리는 버그가 반복됐다.
   unit.shieldEntries = [{ id, amount, initial, expiresAt, decayStartAt, decayPerSec }]
   unit.shield는 합계(플레이어는 접근자 속성, 그 외 유닛은 매번 다시 계산해 넣는 숫자).
   ------------------------------------------------------------ */
function _shieldHost(u) {
  if (!u) return null;
  if (!Array.isArray(u.shieldEntries)) Object.defineProperty(u, 'shieldEntries', { value: [], writable: true, configurable: true, enumerable: false });
  return u.shieldEntries;
}
function recomputeShield(u) {
  const list = _shieldHost(u); if (!list) return 0;
  const total = list.reduce((s, e) => s + Math.max(0, e.amount), 0);
  // 플레이어(CharacterController)는 shield가 접근자라 합계를 직접 읽는다. 그 외 유닛은 숫자 필드에 반영.
  const desc = Object.getOwnPropertyDescriptor(u, 'shield');
  if (!(desc && (desc.get || desc.set)) && !(typeof CharacterController !== 'undefined' && u instanceof CharacterController)) u.shield = total;
  return total;
}
// 보호막 추가. id가 같으면 기존 것을 교체(같은 스킬 재시전은 중첩하지 않음). durationSec이 null이면 무기한.
// decay: 지속시간(감소 시작 지연 뒤 남은 시간)에 걸쳐 0까지 선형 감소.
function addShield(u, id, amount, durationSec, { decay = false, decayDelaySec = 0, replace = true } = {}) {
  const list = _shieldHost(u); if (!list || !(amount > 0)) return 0;
  const now = performance.now();
  if (replace && id != null) for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) list.splice(i, 1);
  const expiresAt = durationSec == null ? Infinity : now + durationSec * 1000;
  const decaySpan = durationSec == null ? 0 : Math.max(0, durationSec - decayDelaySec);
  list.push({ id, amount, initial: amount, expiresAt, decayStartAt: now + decayDelaySec * 1000, decayPerSec: decay && decaySpan > 0 ? amount / decaySpan : 0 });
  recomputeShield(u);
  return amount;
}
function getShieldById(u, id) {
  const list = _shieldHost(u); if (!list) return 0;
  return list.filter((e) => e.id === id).reduce((s, e) => s + e.amount, 0);
}
// id 보호막을 제거하고 제거된 양을 돌려준다.
function removeShield(u, id) {
  const list = _shieldHost(u); if (!list) return 0;
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) { removed += list[i].amount; list.splice(i, 1); }
  recomputeShield(u);
  return removed;
}
// id 보호막의 남은 양을 최대 cap으로 제한(피바라기 상한 등).
function capShield(u, id, cap) {
  const list = _shieldHost(u); if (!list) return;
  for (const e of list) if (e.id === id && e.amount > cap) e.amount = Math.max(0, cap);
  recomputeShield(u);
}
function clearShields(u) { const list = _shieldHost(u); if (list) list.length = 0; recomputeShield(u); }
// 매 프레임: 만료 제거 + 선형 감소.
function tickShields(u, dt) {
  const list = _shieldHost(u); if (!list || !list.length) return;
  const now = performance.now();
  let changed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.decayPerSec > 0 && now >= e.decayStartAt) { e.amount = Math.max(0, e.amount - e.decayPerSec * dt); changed = true; }
    if (now >= e.expiresAt || e.amount <= 1e-6) { list.splice(i, 1); changed = true; }
  }
  if (changed) recomputeShield(u);
}
// 피해 흡수: 먼저 만료되는 보호막부터 깎고 남은 피해를 돌려준다.
function absorbShieldDamage(u, dmg) {
  const list = _shieldHost(u); if (!list || !list.length || !(dmg > 0)) return dmg;
  let remaining = dmg;
  list.sort((a, b) => a.expiresAt - b.expiresAt);
  for (const e of list) {
    if (remaining <= 0) break;
    const take = Math.min(e.amount, remaining);
    e.amount -= take; remaining -= take;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].amount <= 1e-6) list.splice(i, 1);
  recomputeShield(u);
  return remaining;
}
