// 아이템 시스템 - 구매/판매/스탯 합산/틱형 패시브(재생·마나회복).
// 기존 챔피언 전용 임시 버프 필드(bonusAD 등)와 완전히 분리된 itemBonus*
// 필드를 recomputeStats()가 읽어가므로, 여기서는 "합산해서 채워 넣기"와
// "값이 바뀔 때 recomputeStats() 재호출"만 책임진다.

function recomputeItemStats(ctrl) {
  if (!ctrl) return;
  ctrl.itemBonusAD = 0; ctrl.itemBonusAP = 0; ctrl.itemBonusMaxHp = 0; ctrl.itemBonusMana = 0;
  ctrl.itemBonusArmor = 0; ctrl.itemBonusMr = 0; ctrl.itemBonusAttackSpeedPercent = 0;
  ctrl.itemAllDamageVampPercent = 0; ctrl.itemMinionBonusDamage = 0;
  for (const itemId of (ctrl.items || [])) {
    const item = ITEM_DATA[itemId];
    if (!item) continue;
    const s = item.stats || {};
    ctrl.itemBonusAD += s.attackDamage || 0;
    ctrl.itemBonusAP += s.abilityPower || 0;
    ctrl.itemBonusMaxHp += s.maxHp || 0;
    ctrl.itemBonusMana += s.mana || 0;
    ctrl.itemBonusArmor += s.armor || 0;
    ctrl.itemBonusMr += s.magicResist || 0;
    ctrl.itemBonusAttackSpeedPercent += s.attackSpeedPercent || 0;
    ctrl.itemAllDamageVampPercent += item.allDamageVampPercent || 0;
    ctrl.itemMinionBonusDamage += item.minionBonusDamage || 0;
  }
  ctrl.recomputeStats();
}

// 상점 - 요청대로 "기지 구역(isPositionInBaseZone) 안에서만" 구매 가능.
// BLUE가 플레이어 진영이라는 이 데모의 고정 전제를 그대로 따른다(turret_system.js
// 의 BASE_ZONE_RADIUS 주석이 이미 "나중에 만들 상점도 재사용" 의도를 명시해뒀다).
function buyItem(ctrl, itemId) {
  const item = ITEM_DATA[itemId];
  if (!item) { console.warn('[ITEM] 알 수 없는 아이템:', itemId); return false; }
  if (typeof isPositionInBaseZone === 'function' && !isPositionInBaseZone(ctrl.root.position, 'BLUE')) {
    console.warn('[ITEM] 기지(상점 구역) 안에서만 구매할 수 있습니다.');
    return false;
  }
  if ((ctrl.items || []).length >= 6) { console.warn('[ITEM] 인벤토리가 가득 찼습니다(최대 6칸).'); return false; }
  if ((ctrl.gold || 0) < item.cost) { console.warn('[ITEM] 골드가 부족합니다.'); return false; }
  ctrl.gold -= item.cost;
  ctrl.items.push(itemId);
  recomputeItemStats(ctrl);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  return true;
}

// 판매가 70%(실제 LoL과 동일한 근사치).
function sellItem(ctrl, slotIndex) {
  const itemId = ctrl.items && ctrl.items[slotIndex];
  if (!itemId) return false;
  const item = ITEM_DATA[itemId];
  ctrl.items.splice(slotIndex, 1);
  ctrl.gold = (ctrl.gold || 0) + Math.floor((item.cost || 0) * 0.7);
  recomputeItemStats(ctrl);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  return true;
}

function _itemTickManaRegen(ctrl, item, dt, now) {
  const p = item.manaRegenPassive;
  ctrl._itemTick = ctrl._itemTick || {};
  const key = 'mana_' + item.id;
  ctrl._itemTick[key] = (ctrl._itemTick[key] || 0) + dt;
  while (ctrl._itemTick[key] >= 1) {
    ctrl._itemTick[key] -= 1;
    const inCombat = (now - (ctrl._itemLastDealtChampionDamageAt || 0)) <= p.combatWindowSec * 1000;
    const manaPerSec = inCombat ? p.combatManaPerSec : p.baseManaPerSec;
    if ((ctrl.maxMp || 0) > 0 && ctrl.mp < ctrl.maxMp) {
      ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + manaPerSec);
    } else {
      ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + manaPerSec * p.noManaHpRegenPercent);
    }
  }
}

function _itemTickHpRegen(ctrl, item, dt, now) {
  // 전투 강화 회복(피격 후 8초)이 활성화된 동안은 평시 재생(5초마다 4) 대신
  // 이 수치가 대체 적용된다(실제 아이템 설명과 동일한 "대체" 관계).
  // 버그 수정: `ctrl._itemLastTookChampionDamageAt &&`처럼 진위값으로 검사하면
  // 그 값이 정확히 0일 때(틱 함수 자체 테스트처럼 now=0에서 "방금 맞음"을
  // 재현하는 경우 등) false로 취급돼 강화 회복이 누락된다 - 항상 숫자인지만
  // 확인하고 시간 차 계산으로 판정한다.
  if (item.champDamageRegen && typeof ctrl._itemLastTookChampionDamageAt === 'number'
      && (now - ctrl._itemLastTookChampionDamageAt) <= item.champDamageRegen.durationSec * 1000) {
    const isMelee = !!(ctrl.stats && ctrl.stats.attackRange <= 300);
    const total = isMelee ? item.champDamageRegen.meleeMaxHp : item.champDamageRegen.rangedMaxHp;
    const perSec = total / item.champDamageRegen.durationSec;
    ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + perSec * dt);
    return;
  }
  if (!item.regenPassive) return;
  ctrl._itemTick = ctrl._itemTick || {};
  const key = 'hp_' + item.id;
  ctrl._itemTick[key] = (ctrl._itemTick[key] || 0) + dt;
  while (ctrl._itemTick[key] >= item.regenPassive.tickSec) {
    ctrl._itemTick[key] -= item.regenPassive.tickSec;
    ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + item.regenPassive.hpPerTick);
  }
}

// character_controller.js의 update()가 매 프레임 호출(_asheUpdate(dt) 등과
// 동일한 패턴). 장착 아이템이 없으면 즉시 return해서 평소엔 비용이 0.
function itemSystemTick(ctrl, dt) {
  if (!ctrl || !ctrl.items || !ctrl.items.length) return;
  const now = performance.now();
  for (const itemId of ctrl.items) {
    const item = ITEM_DATA[itemId];
    if (!item) continue;
    if (item.manaRegenPassive) _itemTickManaRegen(ctrl, item, dt, now);
    if (item.regenPassive || item.champDamageRegen) _itemTickHpRegen(ctrl, item, dt, now);
  }
}

// 모든 피해 흡혈(도란의 검/활) - applyDamage()/applyDamageToMinion() 양쪽에서
// 공용으로 호출한다(구조물 피해는 실제 LoL처럼 흡혈이 붙지 않으므로 호출하지 않음).
function applyItemVamp(source, finalDmg) {
  if (!source || !(source.itemAllDamageVampPercent > 0) || !(finalDmg > 0)) return;
  if (typeof source.hp !== 'number' || typeof source.maxHp !== 'number') return;
  source.hp = Math.min(source.maxHp, source.hp + finalDmg * source.itemAllDamageVampPercent);
}
