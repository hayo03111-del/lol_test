// 아이템 시스템 - 구매/판매/사용/스탯 합산/틱형 패시브(재생·마나회복·충전).
// 기존 챔피언 전용 임시 버프 필드(bonusAD 등)와 완전히 분리된 itemBonus*
// 필드를 recomputeStats()가 읽어가므로, 여기서는 "합산해서 채워 넣기"와
// "값이 바뀔 때 recomputeStats() 재호출"만 책임진다.
//
// 인벤토리 슬롯 형태: ctrl.items = [{ id, count, charges? }, ...]
// - count: 쌓이는 소비 아이템(체력 물약)의 중첩 개수. 일반 스탯 아이템은
//   항상 count:1이고, 같은 아이템을 두 번 사면 슬롯을 하나 더 차지한다
//   (실제 도란 시리즈처럼 "중첩되지 않는" 아이템과 동일).
// - charges: "상점에 들르면 충전되는" 단일 아이템(충전형 물약)의 남은
//   사용 횟수. count와 별개 축이다(충전형 물약은 count:1 고정, charges만 줄어든다).

function recomputeItemStats(ctrl) {
  if (!ctrl) return;
  ctrl.itemBonusAD = 0; ctrl.itemBonusAP = 0; ctrl.itemBonusMaxHp = 0; ctrl.itemBonusMana = 0;
  ctrl.itemBonusArmor = 0; ctrl.itemBonusMr = 0; ctrl.itemBonusAttackSpeedPercent = 0;
  ctrl.itemAllDamageVampPercent = 0; ctrl.itemMinionBonusDamage = 0; ctrl.itemOnHitHeal = 0;
  ctrl.itemBonusCritChance = 0; ctrl.itemBonusAbilityHaste = 0;
  ctrl.itemBonusHpRegenPercent = 0; ctrl.itemBonusMpRegenPercent = 0;
  for (const slot of (ctrl.items || [])) {
    const item = ITEM_DATA[slot.id];
    if (!item) continue;
    const s = item.stats || {};
    ctrl.itemBonusAD += s.attackDamage || 0;
    ctrl.itemBonusAP += s.abilityPower || 0;
    ctrl.itemBonusMaxHp += s.maxHp || 0;
    ctrl.itemBonusMana += s.mana || 0;
    ctrl.itemBonusArmor += s.armor || 0;
    ctrl.itemBonusMr += s.magicResist || 0;
    ctrl.itemBonusAttackSpeedPercent += s.attackSpeedPercent || 0;
    ctrl.itemBonusCritChance += s.critChance || 0;
    ctrl.itemBonusAbilityHaste += s.abilityHaste || 0;
    ctrl.itemBonusHpRegenPercent += s.hpRegenPercent || 0;
    ctrl.itemBonusMpRegenPercent += s.mpRegenPercent || 0;
    ctrl.itemAllDamageVampPercent += item.allDamageVampPercent || 0;
    ctrl.itemMinionBonusDamage += item.minionBonusDamage || 0;
    ctrl.itemOnHitHeal += item.onHitHeal || 0;
    // 암흑의 인장(영광)의 동적 주문력 - 아이템을 들고 있을 때만 적용된다
    // (팔면 중첩 자체는 남아있어도 더 이상 스탯에 반영되지 않는다).
    if (item.gloryPassive) ctrl.itemBonusAP += (ctrl._itemGloryStacks || 0) * item.gloryPassive.apPerStack;
    // 여신의 눈물(마나순환)으로 이미 얻은 최대 마나 - 누적값을 그대로 더한다.
    if (item.manaCirculationPassive && ctrl._itemTearState) ctrl.itemBonusMana += ctrl._itemTearState.gained || 0;
  }
  ctrl.recomputeStats();
}

// 스킬 가속(빛나는 티끌 등) - 쿨다운을 "설정하는" 순간에 곱한다(공식:
// 실제 LoL의 재사용 대기시간 공식 cd/(1+AH/100)과 동일).
// 한계(명시): 이 프로젝트는 가렌/모데카이저/세트/초가스/아리/애쉬/바루스
// 정도만 character_controller.js의 공용 castAbility()/_castCustomSequence()
// 경로로 쿨다운을 설정하고, 렉사이/야스오/다리우스/닐라/벡스/이즈리얼/
// 요네/마스터 이/리 신은 각자 챔피언 파일에서 `this.cooldowns.X = ...`를
// 직접 설정한다(스킬마다 레벨별 수식이 달라 처음부터 공용 함수를 거치지
// 않는 구조) - 이 아이템 하나를 위해 9개 챔피언 파일의 수십 군데를 전부
// 고치는 건 위험도가 너무 커서, 이번 범위에서는 공용 경로만 적용하고
// 나머지는 README에 한계로 명시한다.
function abilityHasteCooldown(ctrl, baseCd) {
  const ah = (ctrl && ctrl.itemBonusAbilityHaste) || 0;
  if (ah <= 0) return baseCd;
  return baseCd * (100 / (100 + ah));
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
  if ((ctrl.gold || 0) < item.cost) { console.warn('[ITEM] 골드가 부족합니다.'); return false; }
  ctrl.items = ctrl.items || [];
  if (item.maxStack) {
    // 쌓이는 소비 아이템 - "최대로 보유할 수 있는 수"는 슬롯 하나의 중첩
    // 한도가 아니라 전체 보유 개수 한도다(실제 체력 물약처럼 슬롯을
    // 새로 만들어 우회할 수 없다). 버그 수정: 예전에는 기존 슬롯이 이미
    // 꽉 찼을 때 그냥 "새 칸을 또 만들어서" 한도를 우회하는 잘못된
    // 동작이었다 - 전체 보유량을 먼저 확인해 한도 도달 시 구매 자체를 막는다.
    const totalHeld = ctrl.items.filter((s) => s.id === itemId).reduce((sum, s) => sum + s.count, 0);
    if (totalHeld >= item.maxStack) {
      console.warn(`[ITEM] 최대로 보유할 수 있는 수를 초과했습니다(최대 ${item.maxStack}개).`);
      return false;
    }
    const existing = ctrl.items.find((s) => s.id === itemId);
    if (existing) {
      existing.count += 1;
    } else {
      if (ctrl.items.length >= 6) { console.warn('[ITEM] 인벤토리가 가득 찼습니다(최대 6칸).'); return false; }
      ctrl.items.push({ id: itemId, count: 1 });
    }
  } else {
    if (ctrl.items.length >= 6) { console.warn('[ITEM] 인벤토리가 가득 찼습니다(최대 6칸).'); return false; }
    const slot = { id: itemId, count: 1 };
    if (item.maxCharges) slot.charges = item.maxCharges;
    ctrl.items.push(slot);
  }
  ctrl.gold -= item.cost;
  // 충전형 물약 "상점을 이용할 때마다 새로 생성됩니다" - 이번 구매를 포함해
  // 상점을 이용한 것이므로, 이미 보유 중인 충전형 아이템도 전부 재충전한다.
  for (const slot of ctrl.items) {
    const d = ITEM_DATA[slot.id];
    if (d && d.refillOnShopUse && d.maxCharges) slot.charges = d.maxCharges;
  }
  recomputeItemStats(ctrl);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  return true;
}

// 판매가 70%(실제 LoL과 동일한 근사치) - 중첩된 소비 아이템은 칸 전체(개수만큼)를 한 번에 판다.
function sellItem(ctrl, slotIndex) {
  const slot = ctrl.items && ctrl.items[slotIndex];
  if (!slot) return false;
  const item = ITEM_DATA[slot.id];
  if (!item) return false;
  ctrl.items.splice(slotIndex, 1);
  ctrl.gold = (ctrl.gold || 0) + Math.floor((item.cost || 0) * (slot.count || 1) * 0.7);
  recomputeItemStats(ctrl);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  return true;
}

// 사용 아이템(체력 물약/충전형 물약) - 숫자 키(1~6) 또는 인벤토리 슬롯
// 클릭으로 호출된다. 중첩/충전 소모 로직만 여기서 처리하고, 실제 회복은
// 공용 지속 회복(HoT) 목록(_itemActiveHeals)에 등록해 itemSystemTick이
// 매 프레임 진행한다.
function useItem(ctrl, slotIndex) {
  if (!ctrl) return false;
  const slot = ctrl.items && ctrl.items[slotIndex];
  if (!slot) return false;
  const item = ITEM_DATA[slot.id];
  if (!item || !item.consumable) { console.warn('[ITEM] 사용할 수 없는 아이템입니다.'); return false; }
  if (item.maxCharges) {
    if (!(slot.charges > 0)) { console.warn('[ITEM] 충전량이 없습니다.'); return false; }
    slot.charges -= 1;
  } else if (item.maxStack) {
    if (!(slot.count > 0)) return false;
    slot.count -= 1;
    if (slot.count <= 0) {
      const idx = ctrl.items.indexOf(slot);
      if (idx >= 0) ctrl.items.splice(idx, 1);
    }
  }
  ctrl._itemActiveHeals = ctrl._itemActiveHeals || [];
  ctrl._itemActiveHeals.push({ perSec: item.consumable.healAmount / item.consumable.healDurationSec, remainingSec: item.consumable.healDurationSec });
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  return true;
}

function _itemTickActiveHeals(ctrl, dt) {
  if (!ctrl._itemActiveHeals || !ctrl._itemActiveHeals.length) return;
  for (const heal of ctrl._itemActiveHeals) {
    const step = Math.min(dt, heal.remainingSec);
    ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + heal.perSec * step);
    heal.remainingSec -= step;
  }
  // 아이템을 팔거나 다 써도(인벤토리에서 이미 제거됨) 이미 시작된 회복은
  // 실제 LoL처럼 끝까지 진행되므로, 이 목록은 items 배열과 무관하게 돈다.
  ctrl._itemActiveHeals = ctrl._itemActiveHeals.filter((h) => h.remainingSec > 1e-6);
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

// 여신의 눈물(마나순환) 충전 재생 - 8초마다 1충전, 최대 4충전.
function _itemTickTearRecharge(ctrl, item, dt) {
  const p = item.manaCirculationPassive;
  ctrl._itemTearState = ctrl._itemTearState || { charges: p.maxCharges, gained: 0 };
  const st = ctrl._itemTearState;
  if (st.charges >= p.maxCharges) return;
  ctrl._itemTick = ctrl._itemTick || {};
  const key = 'tearRecharge';
  ctrl._itemTick[key] = (ctrl._itemTick[key] || 0) + dt;
  while (ctrl._itemTick[key] >= p.rechargeSec && st.charges < p.maxCharges) {
    ctrl._itemTick[key] -= p.rechargeSec;
    st.charges += 1;
  }
}

// character_controller.js의 update()가 매 프레임 호출(_asheUpdate(dt) 등과
// 동일한 패턴). 지속 회복(_itemActiveHeals)은 아이템을 하나도 안 갖고
// 있어도(다 써서 인벤토리에서 빠진 뒤) 계속 진행돼야 하므로 먼저 처리하고,
// 그 외 장착 아이템 전용 틱은 items가 비어 있으면 즉시 return해서 평소엔
// 비용이 0이다.
function itemSystemTick(ctrl, dt) {
  if (!ctrl) return;
  _itemTickActiveHeals(ctrl, dt);
  _itemTickTrinketRecharge(ctrl, dt);
  _itemTickWardExpiry(ctrl, dt);
  if (!ctrl.items || !ctrl.items.length) return;
  const now = performance.now();
  for (const slot of ctrl.items) {
    const item = ITEM_DATA[slot.id];
    if (!item) continue;
    if (item.manaRegenPassive) _itemTickManaRegen(ctrl, item, dt, now);
    if (item.regenPassive || item.champDamageRegen) _itemTickHpRegen(ctrl, item, dt, now);
    if (item.manaCirculationPassive) _itemTickTearRecharge(ctrl, item, dt);
  }
}

// 모든 피해 흡혈(도란의 검/활) - applyDamage()/applyDamageToMinion() 양쪽에서
// 공용으로 호출한다(구조물 피해는 실제 LoL처럼 흡혈이 붙지 않으므로 호출하지 않음).
function applyItemVamp(source, finalDmg) {
  if (!source || !(source.itemAllDamageVampPercent > 0) || !(finalDmg > 0)) return;
  if (typeof source.hp !== 'number' || typeof source.maxHp !== 'number') return;
  source.hp = Math.min(source.maxHp, source.hp + finalDmg * source.itemAllDamageVampPercent);
}

// 여신의 눈물(마나순환) - 챔피언/더미 대상 피해를 입힐 때마다 충전 1개를
// 소모해 최대 마나를 얻는다(챔피언 상대는 2배, 누적 360 한도). applyDamage()
// 에서 호출한다 - 근사 범위는 item_data.js의 tearOfGoddess 주석 참고.
function itemOnDamageDealt(ctrl, target) {
  const slot = (ctrl.items || []).find((s) => s.id === 'tearOfGoddess');
  if (!slot) return;
  const p = ITEM_DATA.tearOfGoddess.manaCirculationPassive;
  ctrl._itemTearState = ctrl._itemTearState || { charges: p.maxCharges, gained: 0 };
  const st = ctrl._itemTearState;
  if (st.gained >= p.maxManaCap || st.charges <= 0) return;
  st.charges -= 1;
  const gain = Math.min(target.isChampion ? p.maxManaPerChampionHit : p.maxManaPerHit, p.maxManaCap - st.gained);
  st.gained += gain;
  recomputeItemStats(ctrl);
  ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + gain); // 늘어난 최대 마나만큼 현재 마나도 함께 채워준다(실제 여신의 눈물과 동일)
}

// 수확의 낫 - 플레이어가 마지막으로 때린 미니언이 죽을 때 killMinion()이 호출.
function itemOnMinionKillByPlayer(ctrl) {
  const slot = (ctrl.items || []).find((s) => s.id === 'cull');
  if (!slot) return;
  const p = ITEM_DATA.cull.harvestPassive;
  if ((ctrl._itemCullGold || 0) >= p.minionGoldCap) return; // 한도 도달 - 더 이상 추가 골드 없음(상위 아이템 전환 없음)
  ctrl._itemCullGold = (ctrl._itemCullGold || 0) + p.minionGoldPerKill;
  ctrl.gold = (ctrl.gold || 0) + p.minionGoldPerKill;
  if (ctrl._itemCullGold >= p.minionGoldCap) {
    ctrl.gold += p.bonusGoldAtCap;
    console.log('[ITEM] 수확의 낫 한도 도달 - 보너스 골드 +' + p.bonusGoldAtCap);
  }
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
}

// 암흑의 인장(영광) - 챔피언 처치 관여 시 중첩 획득(applyDamage()의 처형
// 판정 지점에서 호출). 어시스트는 "아군 챔피언" 개념이 없는 이 데모 구조상
// 구현하지 않는다(item_data.js 주석 참고).
function itemOnChampionTakedown(ctrl) {
  const slot = (ctrl.items || []).find((s) => s.id === 'darkSeal');
  if (!slot) return;
  const p = ITEM_DATA.darkSeal.gloryPassive;
  ctrl._itemGloryStacks = Math.min(p.maxStacks, (ctrl._itemGloryStacks || 0) + p.takedownStacks);
  recomputeItemStats(ctrl);
}

// 암흑의 인장(영광) - 사망 시 중첩 소실(_die()에서 호출).
function itemOnChampionDeath(ctrl) {
  if (!ctrl || !(ctrl._itemGloryStacks > 0)) return;
  const p = ITEM_DATA.darkSeal.gloryPassive;
  ctrl._itemGloryStacks = Math.max(0, ctrl._itemGloryStacks - p.deathLossStacks);
  recomputeItemStats(ctrl);
}

/* ============================================================
   트린켓(투명 와드) - 6칸 인벤토리와 완전히 별개인 전용 슬롯
   (ctrl.trinket). 골드로 사지 않고 기본 장착되어 있으며(실제 LoL과
   동일), 시야는 이미 있는 vision_system.js의 grantVision() 범용
   진입점을 그대로 재사용한다(vision_system.js 주석이 "나중에 와드
   개념을 추가하면 이 함수를 재사용하라"고 이미 명시해뒀던 지점).
   ============================================================ */

// 게임 경과 시간(초)에 따라 a(초반값)->b(후반값)로 선형 보간한다.
// scaleFullAtSec 시점 이후로는 b에서 고정된다.
function _itemScaleByGameTime(a, b, scaleFullAtSec) {
  const gameTimeSec = typeof getTurretGameTimeSec === 'function' ? getTurretGameTimeSec() : scaleFullAtSec;
  const t = Math.max(0, Math.min(1, gameTimeSec / scaleFullAtSec));
  return a + (b - a) * t;
}

// 트린켓 충전 재생 - 게임 시간에 따라 170~90초로 선형 단축된다.
function _itemTickTrinketRecharge(ctrl, dt) {
  if (!ctrl || !ctrl.trinket) return;
  const data = ITEM_DATA[ctrl.trinket.id];
  if (!data || !data.maxCharges) return;
  if (ctrl.trinket.charges >= data.maxCharges) return;
  ctrl._itemTick = ctrl._itemTick || {};
  const key = 'trinketRecharge';
  ctrl._itemTick[key] = (ctrl._itemTick[key] || 0) + dt;
  // 재충전 1회 걸릴 때마다 그 시점 기준으로 다시 계산한다(while 루프 중
  // 게임 시간이 스케일 구간을 넘나들어도 항상 "현재" 재사용 대기시간을 쓴다).
  while (ctrl.trinket.charges < data.maxCharges) {
    const rechargeSec = _itemScaleByGameTime(data.rechargeSecEarly, data.rechargeSecLate, data.scaleFullAtSec);
    if (ctrl._itemTick[key] < rechargeSec) break;
    ctrl._itemTick[key] -= rechargeSec;
    ctrl.trinket.charges += 1;
    if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  }
}

// 설치된 와드의 만료(시각 효과 정리) - 실제 시야 만료는 VisionSystem의
// temporarySources가 자체적으로 처리하므로, 여기서는 지상에 놓인 마커
// 메시만 같은 시각에 치운다.
function _itemTickWardExpiry(ctrl, dt) {
  if (!ctrl || !ctrl._placedWards || !ctrl._placedWards.length) return;
  const now = performance.now();
  ctrl._placedWards = ctrl._placedWards.filter((w) => {
    if (now < w.expiresAt) return true;
    if (w.mesh && typeof scene !== 'undefined') scene.remove(w.mesh);
    return false;
  });
}

// 투명 와드 설치 - Q/W/E/R과 동일하게 키 입력 시 마우스 월드 좌표를 받아
// 즉시 시전한다(character_controller.js에서 직접 호출하지 않고 전역
// 키바인드(global_system_instances.js)에서 바로 호출 - 아이템은 챔피언
// 고유 스킬이 아니므로 castAbility()를 거치지 않는다).
function placeWard(ctrl, worldPoint) {
  if (!ctrl || !ctrl.trinket) { console.warn('[WARD] 장착한 트린켓이 없습니다.'); return false; }
  const data = ITEM_DATA[ctrl.trinket.id];
  if (!data) return false;
  if (!(ctrl.trinket.charges > 0)) { console.warn('[WARD] 충전량이 없습니다.'); return false; }
  if (!worldPoint) return false;

  // 설치 사정거리(550) 밖을 클릭하면 실제 LoL처럼 그 방향 최대 사거리에 놓인다.
  const origin = ctrl.root.position;
  const maxWorldRange = lolRangeToWorld(data.placeRange);
  const dir = new THREE.Vector3().subVectors(worldPoint, origin);
  dir.y = 0;
  const dist = dir.length();
  const finalPos = dist > maxWorldRange && dist > 0
    ? origin.clone().add(dir.normalize().multiplyScalar(maxWorldRange))
    : worldPoint.clone();
  finalPos.y = 0;

  ctrl.trinket.charges -= 1;

  const durationSec = _itemScaleByGameTime(data.wardDurationEarlySec, data.wardDurationLateSec, data.scaleFullAtSec);
  if (typeof visionSystem !== 'undefined' && visionSystem) visionSystem.grantVision(finalPos, data.visionRadius, durationSec);

  const ward = { position: finalPos.clone(), hitsRemaining: data.hitsToDestroy, expiresAt: performance.now() + durationSec * 1000, mesh: null };
  if (typeof scene !== 'undefined' && typeof THREE !== 'undefined') {
    const geo = new THREE.ConeGeometry(lolRangeToWorld(26), lolRangeToWorld(55), 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3fae6a, transparent: true, opacity: 0.85 });
    ward.mesh = new THREE.Mesh(geo, mat);
    ward.mesh.position.copy(finalPos);
    ward.mesh.position.y = lolRangeToWorld(27);
    scene.add(ward.mesh);
  }
  ctrl._placedWards = ctrl._placedWards || [];
  ctrl._placedWards.push(ward);
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  console.log(`[WARD] 투명 와드 설치 (지속시간 ${durationSec.toFixed(0)}초, 남은 충전 ${ctrl.trinket.charges}/${data.maxCharges})`);
  return true;
}
