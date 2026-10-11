/* ============================================================
   아군 챔피언 시스템(순수 로직)
   ------------------------------------------------------------
   이 데모는 1인 플레이라 아군 챔피언이 없었다. 원작에서 "아군"이 필요한
   효과(꿈 생성기, 강철의 솔라리 팬던트, 월석재생기, 슈렐리아의군가,
   밴들파이프, 태양의 썰매, 세계지도집, 리 신 W, 닐라 패시브 공유 등)를
   그대로 재현하려고, 적 허수아비처럼 직접 설치하는 "아군 더미"(world/
   ally_dummy.js)를 추가했다. 이 파일은 렌더링 없이 아군 목록/범위 탐색/
   아군 회복·보호막만 다룬다.

   아군 더미는 공격하지 않는다(적 허수아비와 같은 연습용 표적) - 그래서
   "아군의 다음 공격/스킬"에 붙는 효과(꿈 생성기 보라 거품 등)는 걸리기는
   하지만 터질 일이 없다.
   ============================================================ */

const placedAllies = [];
globalThis.placedAllies = placedAllies; // 닐라 패시브(_nilahAllyCandidates)가 이 이름으로 찾는다

// source(보통 플레이어)를 제외한 살아 있는 아군 챔피언.
function getAllyChampions(source = null) {
  const out = [];
  for (const a of placedAllies) if (a && a.hp > 0 && a !== source) out.push(a);
  return out;
}

function findAlliesInRadius(center, lolRadius, { exclude = [] } = {}) {
  const radius = lolRangeToWorld(lolRadius);
  const out = [];
  for (const a of placedAllies) {
    if (!a || a.hp <= 0 || exclude.includes(a)) continue;
    const d = getHorizontalDistance(getWorldPosition(a), getWorldPosition(center) || center);
    if (d <= radius + getCollisionRadius(a)) out.push({ unit: a, distance: d });
  }
  out.sort((x, y) => x.distance - y.distance);
  return out;
}

// 아군의 보호막은 여러 출처를 따로 들고 있다가(지속시간/감쇠가 서로 다름)
// 합계를 a.shield에 반영한다.
function _allyRecomputeShield(a) {
  a.shield = (a.shieldEntries || []).reduce((s, e) => s + e.amount, 0);
}

// 아군에게 회복을 준다. 대상의 받는 회복 배율(정령의형상/그리버스)을 적용하고
// 실제 회복량을 돌려준다. noItemHook은 월석재생기 연쇄처럼 "회복이 다시
// 회복을 부르는" 재귀를 막기 위한 플래그다.
function healAlly(source, target, amount, { noItemHook = false } = {}) {
  if (!target || target.hp <= 0 || !(amount > 0)) return 0;
  const eff = amount * getHealReceivedMultiplier(target);
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + eff);
  if (!noItemHook && source && typeof itemOnAllyHealOrShield === 'function') itemOnAllyHealOrShield(source, target, 'heal', eff);
  return target.hp - before;
}

// 아군에게 보호막을 준다. decay면 지속시간에 걸쳐 선형으로 줄어든다.
function shieldAlly(source, target, amount, durationSec, { decay = false, id = null, noItemHook = false } = {}) {
  if (!target || target.hp <= 0 || !(amount > 0)) return 0;
  const eff = amount * getShieldReceivedMultiplier(target);
  target.shieldEntries = target.shieldEntries || [];
  if (id) target.shieldEntries = target.shieldEntries.filter((e) => e.id !== id);
  target.shieldEntries.push({ id, amount: eff, expiresAt: performance.now() + durationSec * 1000, decayPerSec: decay && durationSec > 0 ? eff / durationSec : 0 });
  _allyRecomputeShield(target);
  if (!noItemHook && source && typeof itemOnAllyHealOrShield === 'function') itemOnAllyHealOrShield(source, target, 'shield', eff, { durationSec, decay });
  return eff;
}

// 아군이 피해를 받을 때(damageEnemy가 호출) - 꿈 생성기 파란 거품(미니언이
// 아닌 출처의 다음 피해 감소)과 보호막 흡수를 처리하고 남은 피해를 돌려준다.
function allyAbsorbIncoming(a, dmg, result) {
  let remaining = dmg;
  const now = performance.now();
  const src = result && result.source;
  if (a._dreamBlue && a._dreamBlue.expiresAt > now && !(src && src.isMinion)) {
    remaining = Math.max(0, remaining - a._dreamBlue.amount);
    a._dreamBlue = null;
  }
  for (const e of (a.shieldEntries || [])) {
    if (remaining <= 0) break;
    const take = Math.min(e.amount, remaining);
    e.amount -= take; remaining -= take;
  }
  if (a.shieldEntries) a.shieldEntries = a.shieldEntries.filter((e) => e.amount > 1e-6);
  _allyRecomputeShield(a);
  return remaining;
}

function tickAllyUnits(dt) {
  const now = performance.now();
  for (const a of placedAllies) {
    if (!a) continue;
    if (a.shieldEntries && a.shieldEntries.length) {
      for (const e of a.shieldEntries) if (e.decayPerSec > 0) e.amount = Math.max(0, e.amount - e.decayPerSec * dt);
      a.shieldEntries = a.shieldEntries.filter((e) => e.expiresAt > now && e.amount > 1e-6);
      _allyRecomputeShield(a);
    }
    if (a._dreamBlue && a._dreamBlue.expiresAt <= now) a._dreamBlue = null;
    if (a._dreamPurple && a._dreamPurple.expiresAt <= now) a._dreamPurple = null;
    if (typeof a.onTick === 'function') a.onTick(dt);
  }
}
