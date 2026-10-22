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
// 95차: 아군 후보는 판정하는 쪽(source, 없으면 지금 행동 중인 챔피언)과 같은 팀의 아군 더미·챔피언(적 챔피언 봇의 아군은 다른 적 봇).
function _allyCandidates(source) {
  const me = source || (typeof combatPerspective === 'function' ? combatPerspective() : null);
  const team = (me && me.team) || PLAYER_TEAM;
  const list = [...placedAllies, ...(typeof listChampionUnits === 'function' ? listChampionUnits() : [])];
  return list.filter((a) => a && a !== me && (a.team || PLAYER_TEAM) === team && a.hp > 0 && a.state !== 'DEAD');
}
function getAllyChampions(source = null) {
  const out = [];
  for (const a of _allyCandidates(source)) if (!source || typeof canRealmInteract !== 'function' || canRealmInteract(source, a)) out.push(a); // 죽음의 세계 안에서는 바깥 아군과 상호작용 불가
  return out;
}

function findAlliesInRadius(center, lolRadius, { exclude = [] } = {}) {
  const radius = lolRangeToWorld(lolRadius);
  const out = [];
  for (const a of _allyCandidates(null)) {
    if (!a || a.hp <= 0 || exclude.includes(a)) continue;
    const d = getHorizontalDistance(getWorldPosition(a), getWorldPosition(center) || center);
    if (d <= radius + getCollisionRadius(a)) out.push({ unit: a, distance: d });
  }
  out.sort((x, y) => x.distance - y.distance);
  return out;
}

// 아군의 보호막은 여러 출처를 따로 들고 있다가(지속시간/감쇠가 서로 다름)
// 합계를 a.shield에 반영한다.
// 95차: 보호막 구현을 하나로 - 아군 보호막도 공용 보호막(shield_system.js: addShield·absorbShieldDamage·tickShields)을 쓴다.
// 예전엔 아군 더미 전용 목록·흡수·감소 코드가 따로 있어 두 구현이 조금씩 달랐다(적 챔피언 봇의 아군인 봇에도 같은 경로).
function _allyRecomputeShield(a) { recomputeShield(a); }

// 아군에게 회복을 준다. 대상의 받는 회복 배율(정령의형상/그리버스)을 적용하고
// 실제 회복량을 돌려준다. noItemHook은 월석재생기 연쇄처럼 "회복이 다시
// 회복을 부르는" 재귀를 막기 위한 플래그다.
function healAlly(source, target, amount, { noItemHook = false } = {}) {
  if (!target || target.hp <= 0 || !(amount > 0)) return 0;
  // 83차: 칼바람 오라 - 남에게 주는 치유는 50%(자기 치유는 제외), 챔피언별 치유 보정도 적용.
  const bal = typeof getAramBalance === 'function' ? getAramBalance(source) : null;
  const aura = (source && source !== target && typeof isAramRulesActive === 'function' && isAramRulesActive()) ? 0.5 : 1;
  const eff = amount * aura * (1 + ((bal && bal.healing) || 0)) * getHealReceivedMultiplier(target);
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + eff);
  if (!noItemHook && source && typeof itemOnAllyHealOrShield === 'function') itemOnAllyHealOrShield(source, target, 'heal', eff);
  return target.hp - before;
}

// 아군에게 보호막을 준다. decay면 지속시간에 걸쳐 선형으로 줄어든다.
function shieldAlly(source, target, amount, durationSec, { decay = false, id = null, noItemHook = false } = {}) {
  if (!target || target.hp <= 0 || !(amount > 0)) return 0;
  const eff = amount * getShieldReceivedMultiplier(target);
  if (!addShield(target, id, eff, durationSec, { decay })) return 0;
  if (!noItemHook && source && typeof itemOnAllyHealOrShield === 'function') itemOnAllyHealOrShield(source, target, 'shield', eff, { durationSec, decay });
  return eff;
}

// 아군이 피해를 받을 때(damageEnemy가 호출) - 꿈 생성기 파란 거품(미니언이
// 아닌 출처의 다음 피해 감소)과 보호막 흡수를 처리하고 남은 피해를 돌려준다.
function allyAbsorbIncoming(a, dmg, result) {
  if (typeof itemExtraAllyIncoming === 'function') dmg = itemExtraAllyIncoming(a, dmg, result); // 71차: 기사의 맹세
  let remaining = dmg;
  const now = performance.now();
  const src = result && result.source;
  if (a._dreamBlue && a._dreamBlue.expiresAt > now && !(src && src.isMinion)) {
    remaining = Math.max(0, remaining - a._dreamBlue.amount);
    a._dreamBlue = null;
  }
  // 83차: 먼저 만료되는 보호막부터(원작). 피해 종류 전용 보호막은 그 종류만, 같은 종류면 먼저 깎인다(공용 absorbShieldDamage).
  return absorbShieldDamage(a, remaining, (result && result.damageType) || null);
}

function tickAllyUnits(dt) {
  const now = performance.now();
  for (const a of placedAllies) {
    if (!a) continue;
    tickShields(a, dt);
    if (a._dreamBlue && a._dreamBlue.expiresAt <= now) a._dreamBlue = null;
    if (a._dreamPurple && a._dreamPurple.expiresAt <= now) a._dreamPurple = null;
    if (typeof a.onTick === 'function') a.onTick(dt);
  }
}
