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
  // moveSpeed/magicPenFlat/슬로우저항/강인함은 신발(장화류)에서만 나오는
  // 값이지만, 범용 필드로 둔다(나중에 다른 아이템도 같은 스탯을 가질 수
  // 있으므로 "신발 전용"으로 하드코딩하지 않는다).
  ctrl.itemBonusMoveSpeedLol = 0; ctrl.itemBonusMagicPenFlat = 0;
  // 전설급 2차분(비상의 월갑/선체파괴자 등)부터 "이동속도 4%"처럼 LoL
  // 원본 고정 수치가 아니라 퍼센트로 주는 이동속도 스탯이 처음 등장한다 -
  // itemBonusMoveSpeedLol(고정)과 완전히 별개 필드로 둔다.
  ctrl.itemBonusMoveSpeedPercent = 0;
  // 톱날 단검(물리 관통력 10) - 마법사의 신발(고정 마법 관통력)과 동일한
  // 원칙의 고정 방어구 관통력. 최후의 속삭임(방어구 관통력 %)과는 완전히
  // 별개 필드다(calculateDamage()에서 고정 관통을 퍼센트 관통보다 먼저 적용).
  ctrl.itemBonusArmorPenFlat = 0;
  ctrl.itemSlowResistPercent = 0; ctrl.itemTenacityPercent = 0;
  // 서사급 아이템 1차분 - 처형인의 대검(그리버스)/흡혈의 낫(물리 흡혈)/
  // 최후의 속삭임(방어구 관통)/억겁의 카탈리스트(피해 시 마나 회복).
  ctrl.itemGrievousOnHitPercent = 0; ctrl.itemGrievousOnHitDurationSec = 0;
  ctrl.itemPhysicalVampPercent = 0; ctrl.itemManaOnDamagePercent = 0;
  // 방어구 관통은 실제 LoL처럼 곱연산으로 누적한다(아이템이 여러 개여도
  // 합연산보다 곱연산이 정확하다) - (1-관통%)들의 곱을 저장해뒀다가
  // calculateDamage()에서 armor에 그대로 곱한다.
  ctrl.itemBonusArmorPenMultiplier = 1;
  // 역병의 보석/공허의지팡이(마법 관통력 13%/40%) - 방어구 관통력과 동일한
  // 원칙(곱연산)의 마법저항력 버전. 지금까지는 마법 관통력이 전부 고정
  // 수치(마법사의 신발)뿐이라 이 필드가 필요 없었다.
  ctrl.itemBonusMagicPenMultiplier = 1;
  // 정령의형상(무한한 활력) - "자신이 받는 모든 체력 회복 및 보호막 효과가
  // 25% 증가". 이 엔진의 모든 회복/보호막 경로를 전부 건드릴 수는 없어
  // (챔피언 파일마다 따로 구현된 자체 회복 스킬은 한계로 남긴다 - README 명시),
  // 공용 경로(기본 재생/HoT 큐/흡혈/생명선 보호막)에만 적용한다.
  ctrl.itemHealingReceivedBonusPercent = 0;
  // 월석재생기(별빛 은총) - 회복(30%)과 보호막(35%) 증폭률이 서로 다른
  // 최초의 아이템이라, 위 itemHealingReceivedBonusPercent(회복 전용)와
  // 별개로 보호막 전용 필드를 둔다. 정령의형상/금지된 우상처럼 회복·
  // 보호막 증폭률이 같은 아이템은 item.healingReceivedBonusPercent 하나로
  // 양쪽 필드에 동일하게 더해진다(아래 집계 루프 참고).
  ctrl.itemShieldReceivedBonusPercent = 0;
  // 무한의 대검 - 치명타 피해량 +30%(영구 스탯, calculateDamage()가 각
  // 챔피언이 넘기는 critMultiplier에 더해서 읽는다).
  ctrl.itemBonusCritDamagePercent = 0;
  // 악의(경멸) - "궁극기 가속" - 스킬 가속(itemBonusAbilityHaste)과 별개로
  // R 쿨다운에만 더해진다(abilityHasteCooldown()의 slot==='R' 분기 참고).
  ctrl.itemBonusUltimateHaste = 0;
  // 라바돈의 죽음모자(미구현)/어둠불꽃횃불(어둠불꽃) - "총 주문력 N% 증가"
  // 계열은 합연산이 아니라 최종 주문력에 곱하는 배율이다 - character_controller.js의
  // recomputeStats()가 itemBonusAP에 (1+이 값)을 곱한다.
  ctrl.itemTotalApMultiplierBonus = 0;
  const applyOne = (item) => {
    if (!item) return;
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
    ctrl.itemBonusMoveSpeedLol += s.moveSpeed || 0;
    ctrl.itemBonusMoveSpeedPercent += s.moveSpeedPercent || 0;
    ctrl.itemBonusMagicPenFlat += s.magicPenFlat || 0;
    ctrl.itemBonusCritDamagePercent += item.critDamagePercent || 0;
    ctrl.itemAllDamageVampPercent += item.allDamageVampPercent || 0;
    ctrl.itemMinionBonusDamage += item.minionBonusDamage || 0;
    ctrl.itemOnHitHeal += item.onHitHeal || 0;
    // 신속의 장화(둔화 저항)/헤르메스의 발걸음(강인함) - 둘 다 "더 센 쪽
    // 하나만 적용"이 아니라 실제 LoL처럼 단순 합산(이 데모엔 둘 다 가질
    // 방법이 마땅치 않아 사실상 하나만 적용되지만, 합산해도 안전하다).
    ctrl.itemSlowResistPercent += item.slowResistPercent || 0;
    ctrl.itemTenacityPercent += item.tenacityPercent || 0;
    if (item.grievousOnHitPassive) {
      ctrl.itemGrievousOnHitPercent = Math.max(ctrl.itemGrievousOnHitPercent, item.grievousOnHitPassive.percent);
      ctrl.itemGrievousOnHitDurationSec = Math.max(ctrl.itemGrievousOnHitDurationSec, item.grievousOnHitPassive.durationSec);
    }
    ctrl.itemPhysicalVampPercent += item.physicalVampPercent || 0;
    ctrl.itemManaOnDamagePercent += item.manaOnDamagePercent || 0;
    if (item.armorPenPercent) ctrl.itemBonusArmorPenMultiplier *= (1 - item.armorPenPercent);
    if (item.magicPenPercent) ctrl.itemBonusMagicPenMultiplier *= (1 - item.magicPenPercent);
    ctrl.itemBonusArmorPenFlat += item.armorPenFlat || 0;
    // 암흑의 인장(영광)의 동적 주문력 - 아이템을 들고 있을 때만 적용된다
    // (팔면 중첩 자체는 남아있어도 더 이상 스탯에 반영되지 않는다).
    if (item.gloryPassive) ctrl.itemBonusAP += (ctrl._itemGloryStacks || 0) * item.gloryPassive.apPerStack;
    // 메자이의 영혼약탈자 - 10중첩 이상일 때 이동속도 10% 상승(암흑의
    // 인장에는 없는 전용 추가 효과). gloryPassive와 동일하게 "들고 있을
    // 때만" 적용되고 중첩 자체는 ctrl 레벨 상태라 팔아도 남는다.
    if (item.soulboundMsPassive && (ctrl._itemGloryStacks || 0) >= item.soulboundMsPassive.stackThreshold) {
      ctrl.itemBonusMoveSpeedPercent += item.soulboundMsPassive.moveSpeedPercent;
    }
    // 탐욕의 군화(학살)의 동적 흡혈 - 중첩당 0.6%씩 추가.
    if (item.slaughterPassive) ctrl.itemAllDamageVampPercent += (ctrl._itemSlaughterStacks || 0) * item.slaughterPassive.vampPerStack;
    // 여신의 눈물(마나순환)으로 이미 얻은 최대 마나 - 누적값을 그대로 더한다.
    if (item.manaCirculationPassive && ctrl._itemTearState) ctrl.itemBonusMana += ctrl._itemTearState.gained || 0;
    // 윤 탈 야생화살(연습이 치명타를 낳는다)의 영구 누적 치명타 확률 -
    // 암흑의 인장(영광)/탐욕의 군화(학살)와 동일한 패턴(아이템을 들고
    // 있을 때만 적용, 중첩 자체는 팔아도 남아있음).
    if (item.permanentCritPassive) ctrl.itemBonusCritChance += ctrl._itemPermCritBonus || 0;
    // 악의(경멸) - 궁극기 가속.
    ctrl.itemBonusUltimateHaste += item.ultimateHasteFlat || 0;
    // 정령의형상(무한한 활력)/금지된 우상 - 회복·보호막 증폭률이 같은
    // 숫자라 양쪽 필드에 동일하게 더한다.
    ctrl.itemHealingReceivedBonusPercent += item.healingReceivedBonusPercent || 0;
    ctrl.itemShieldReceivedBonusPercent += item.healingReceivedBonusPercent || 0;
    // 월석재생기(별빛 은총) - 회복/보호막 증폭률이 서로 다른 경우.
    if (item.healAndShieldPowerPassive) {
      ctrl.itemHealingReceivedBonusPercent += item.healAndShieldPowerPassive.healPercent || 0;
      ctrl.itemShieldReceivedBonusPercent += item.healAndShieldPowerPassive.shieldPercent || 0;
    }
    // 어둠불꽃횃불(어둠불꽃) - 불타는 대상 하나당 총 주문력 4% 증가. 현재
    // 불타고 있는 대상 수(_itemBlackfireBurnTargets)는 itemOnDamageDealt()가
    // DOT를 걸 때 기록하고 itemSystemTick()이 만료분을 정리한다.
    if (item.blackfirePassive) ctrl.itemTotalApMultiplierBonus += (ctrl._itemBlackfireStacks || 0) * item.blackfirePassive.apPercentPerStack;
    // 라바돈의 죽음모자(신비한 작품) - "총 주문력 30% 증가"는 고정 배율이라
    // 단순 합연산(위 블록처럼 동적 계산이 필요 없음).
    ctrl.itemTotalApMultiplierBonus += item.totalApMultiplierPercent || 0;
    // 영겁의지팡이(불멸의 시간) - 60초마다 쌓이는 체력/마나/주문력 중첩.
    // 중첩 자체(ctrl._itemTimelessStacks)는 암흑의 인장 영광과 동일하게
    // 팔아도 남지만, 스탯 반영은 아이템을 들고 있을 때만 적용된다.
    if (item.timelessPassive) {
      const st = ctrl._itemTimelessStacks || 0;
      ctrl.itemBonusAP += st * item.timelessPassive.apPerStack;
      ctrl.itemBonusMaxHp += st * item.timelessPassive.hpPerStack;
      ctrl.itemBonusMana += st * item.timelessPassive.manaPerStack;
    }
    // 강철심장(거인의 흡수) - "그 피해의 10%만큼 최대 체력을 부여" - 매번
    // 발동할 때마다 영구적으로 쌓이는 추가 최대 체력(암흑의 인장 영광과
    // 동일한 "중첩 상태는 ctrl에, 적용은 들고 있을 때만" 패턴).
    if (item.giantAbsorbPassive) ctrl.itemBonusMaxHp += ctrl._itemHeartsteelPermanentHpGain || 0;
    // 균열생성기(공허의 부패) - 전투 중 누적 추가 피해가 최대치에 도달하면
    // 모든 피해 흡혈(근접/원거리)을 추가로 얻는다.
    if (item.combatRampPassive && item.combatRampPassive.onMaxVamp && ctrl._itemCombatRampVampApplied) {
      const vp = item.combatRampPassive.onMaxVamp;
      ctrl.itemAllDamageVampPercent += _itemIsMelee(ctrl) ? vp.meleePercent : vp.rangedPercent;
    }
  };
  for (const slot of (ctrl.items || [])) applyOne(ITEM_DATA[slot.id]);
  if (ctrl.boots) applyOne(ITEM_DATA[ctrl.boots.id]);
  // 약간 신비한 신발에서 넘어온 이동속도 보너스(carryoverMoveSpeedOnUpgrade) -
  // 신발을 "신고 있을 때만" 적용된다(둘 다 벗으면 당연히 0, _buyBoots()에서
  // 영구 플래그로 못박아뒀으므로 지금 신은 신발 종류와 무관하게 계속 더해진다).
  if (ctrl.boots && ctrl._itemBootsExtraMoveSpeedLol) ctrl.itemBonusMoveSpeedLol += ctrl._itemBootsExtraMoveSpeedLol;
  // 영약(강철/마법/분노)의 지속시간 중 스탯 - 인벤토리 아이템이 아니라
  // 별도 상태(ctrl._itemActiveElixir)라 위 applyOne() 루프를 거치지 않으므로
  // 마지막에 한 번 더 더한다(위 캐리오버 보너스와 동일한 위치/원칙).
  if (ctrl._itemActiveElixir) {
    const eff = ITEM_DATA[ctrl._itemActiveElixir.id].elixirEffect;
    if (eff.maxHp) ctrl.itemBonusMaxHp += eff.maxHp;
    if (eff.attackDamage) ctrl.itemBonusAD += eff.attackDamage;
    if (eff.abilityPower) ctrl.itemBonusAP += eff.abilityPower;
    if (eff.mpRegenPercent) ctrl.itemBonusMpRegenPercent += eff.mpRegenPercent;
    if (eff.tenacityPercent) ctrl.itemTenacityPercent += eff.tenacityPercent;
  }
  // 경탄(마나무네/무라마나) - "마나의 2%만큼 추가 공격력". 최대 마나 자체가
  // 이 함수가 끝난 뒤 recomputeStats()에서야 계산되므로(순환 의존), 챔피언
  // 기본 최대 마나(computeChampionStats)를 직접 다시 구해 방금 합산을
  // 끝낸 itemBonusMana와 더해서 "지금 이 순간의 정확한 총 최대 마나"를
  // 쓴다(한 프레임 뒤처진 근사가 아니라 항상 정확한 값).
  const aweSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].aweBonusAdPercentOfMana);
  if (aweSlot) {
    const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
    const totalMaxMp = (baseStats ? baseStats.maxMp : 0) + (ctrl.itemBonusMana || 0);
    ctrl.itemBonusAD += totalMaxMp * ITEM_DATA[aweSlot.id].aweBonusAdPercentOfMana;
  }
  // 스테락의도전(잡아채는 발톱) - "기본 50%의 추가 공격력"은 챔피언 기본
  // 공격력의 50%를 보너스 공격력으로 얻는다는 뜻 - 경탄과 동일한 이유로
  // computeChampionStats()에서 (레벨별로 자라는) 기본 공격력을 다시 구해 쓴다.
  const sterakSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].bonusAdPercentOfBaseAd);
  if (sterakSlot) {
    const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
    const baseAd = baseStats ? baseStats.attackDamage : 0;
    ctrl.itemBonusAD += baseAd * ITEM_DATA[sterakSlot.id].bonusAdPercentOfBaseAd;
  }
  // 경탄(대천사의지팡이/대천사의포옹) - 마나무네/무라마나의 경탄과 동일한
  // 구조지만 공격력이 아니라 주문력을 준다.
  const apAweSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].aweBonusApPercentOfMana);
  if (apAweSlot) {
    const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
    const totalMaxMp = (baseStats ? baseStats.maxMp : 0) + (ctrl.itemBonusMana || 0);
    ctrl.itemBonusAP += totalMaxMp * ITEM_DATA[apAweSlot.id].aweBonusApPercentOfMana;
  }
  // 균열생성기(공허의 마력) - "추가 체력의 2%만큼 주문력". 스테락의도전과
  // 동일한 이유로 recomputeStats() 이전인 지금 "추가 체력"을 직접 합산해 쓴다
  // (itemBonusMaxHp는 위 applyOne() 루프에서 이미 다 더해진 상태).
  const riftmakerSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].apPercentOfBonusHp);
  if (riftmakerSlot) {
    const bonusHp = (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0);
    ctrl.itemBonusAP += bonusHp * ITEM_DATA[riftmakerSlot.id].apPercentOfBonusHp;
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
// slot(선택) - 악의(경멸)의 "궁극기 가속"은 R 쿨다운에만 더해지므로,
// R을 설정하는 호출에서만 itemBonusUltimateHaste를 함께 넣는다(호출하는
// 쪽이 slot을 안 넘기면 기존처럼 스킬 가속만 적용 - 하위 호환).
function abilityHasteCooldown(ctrl, baseCd, slot) {
  // itemDynamicAbilityHaste - 끝없는 갈망(기아)처럼 추가 공격력에 비례해
  // 매 순간 바뀌는 스킬 가속(itemSystemTick에서 매 프레임 재계산 - 지배자의
  // 피갑옷의 itemDynamicBonusAD와 동일한 패턴). 정적인 itemBonusAbilityHaste
  // (구매/판매 시에만 재계산)와 별도 필드로 둔다.
  let ah = (ctrl && ((ctrl.itemBonusAbilityHaste || 0) + (ctrl.itemDynamicAbilityHaste || 0))) || 0;
  if (slot === 'R') ah += (ctrl && ctrl.itemBonusUltimateHaste) || 0;
  if (ah <= 0) return baseCd;
  return baseCd * (100 / (100 + ah));
}

// 상점 - 요청대로 "기지 구역(isPositionInBaseZone) 안에서만" 구매 가능.
// 아군/적군/플레이어 시스템 - 예전에는 "BLUE가 플레이어 진영"이라는 고정
// 전제를 'BLUE' 리터럴로 하드코딩했지만, 이제 ctrl.team(PLAYER_TEAM)을
// 그대로 읽는다(turret_system.js의 BASE_ZONE_RADIUS 주석이 이미 "나중에
// 만들 상점도 재사용" 의도를 명시해뒀다).
// 유일 아이템(uniqueGroup) 검사 - 같은 그룹 태그를 가진 아이템을 이미
// 들고 있으면 true(충돌). excludeIds에 들어있는 id는 "이번 조합으로
// 소모될 하위템"이라 충돌 판정에서 제외한다(buildOrBuyItem()이 티아맷을
// 소모해 거대한히드라가 되는 경우처럼, 상위템으로 자연 승급하는 건 막으면
// 안 되므로).
function _itemUniqueGroupConflict(ctrl, item, excludeIds) {
  if (!item.uniqueGroup) return false;
  return (ctrl.items || []).some((s) => {
    if (excludeIds && excludeIds.has(s.id)) return false;
    const other = ITEM_DATA[s.id];
    return other && other.uniqueGroup === item.uniqueGroup;
  });
}
function buyItem(ctrl, itemId) {
  const item = ITEM_DATA[itemId];
  if (!item) { console.warn('[ITEM] 알 수 없는 아이템:', itemId); return false; }
  if (typeof isPositionInBaseZone === 'function' && !isPositionInBaseZone(ctrl.root.position, ctrl.team || PLAYER_TEAM)) {
    console.warn('[ITEM] 기지(상점 구역) 안에서만 구매할 수 있습니다.');
    return false;
  }
  // 유일 아이템(티아맷/히드라류, 여신의 눈물/마나무네/무라마나 등) - 같은
  // 계열을 이미 들고 있으면 직접 구매 자체를 막는다(QA 요청 - 원문에
  // "유일 아이템" 표현은 없지만 실제 LoL 규칙을 그대로 반영).
  if (_itemUniqueGroupConflict(ctrl, item, null)) {
    console.warn(`[ITEM] ${item.nameKo}: 유일 아이템(같은 계열)을 이미 보유하고 있습니다.`);
    return false;
  }
  // 신발은 "하나밖에 사지 못한다"(원문) - 6칸 인벤토리가 아니라 전용
  // boots 슬롯으로 간다(buyBoots()가 기존 신발 교체/환급까지 처리).
  if (item.isBoots) return _buyBoots(ctrl, item);
  // 트린켓(투명 와드)은 상점에서 구매하는 게 아니라 기본 장착이다 -
  // 방어적 가드(ITEM_CATEGORIES에서 이미 제외했지만, 실수로 다시
  // 노출되더라도 6칸 인벤토리를 공짜로 채우는 경로로 새지 않게 막는다).
  if (item.trinket) { console.warn('[ITEM] 트린켓은 상점에서 구매하지 않습니다(기본 장착).'); return false; }
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

// 조합(하위템 → 완제품) 시스템 - 서사급 아이템부터 실제로 쓰인다.
// recipe: ['longSword', 'longSword']처럼 같은 id가 여러 번 들어갈 수
// 있다(티아맷 "롱소드 2개" 등) - 개수를 세어 그만큼 보유 중인지 확인한다.
function _recipeCounts(recipe) {
  const counts = {};
  for (const id of recipe) counts[id] = (counts[id] || 0) + 1;
  return counts;
}
function hasComponents(ctrl, recipe) {
  const counts = _recipeCounts(recipe);
  for (const id in counts) {
    const have = (ctrl.items || []).filter((s) => s.id === id).length;
    if (have < counts[id]) return false;
  }
  return true;
}
// 조합 비용 = 완제품 가격 - 하위템 가격 합(실제 LoL과 동일한 "차액만
// 지불" 원칙). 가격 원문 누락으로 추측 가격(priceGuessed)을 쓴 하위템
// 때문에 합이 완제품보다 비싸지는 경우(예: 강철인장 - item_data.js 주석
// 참고)에 대비해 0 밑으로는 내려가지 않게 막는다.
function combineCost(item) {
  const sum = (item.recipe || []).reduce((s, id) => s + ((ITEM_DATA[id] && ITEM_DATA[id].cost) || 0), 0);
  return Math.max(0, item.cost - sum);
}
// 상점 버튼 하나가 "조합"과 "완제품 직접 구매"를 모두 처리한다(실제 LoL
// 상점과 동일한 UX) - 하위템을 전부 갖고 있으면 그것들을 소모하고 차액만
// 받고, 아니면 완제품 가격 그대로 받는다(buyItem()으로 위임, 6칸 한도
// 등 기존 검증을 그대로 재사용).
function buildOrBuyItem(ctrl, itemId) {
  const item = ITEM_DATA[itemId];
  if (!item) { console.warn('[ITEM] 알 수 없는 아이템:', itemId); return false; }
  if (!item.recipe || !item.recipe.length || !hasComponents(ctrl, item.recipe)) {
    return buyItem(ctrl, itemId);
  }
  if (typeof isPositionInBaseZone === 'function' && !isPositionInBaseZone(ctrl.root.position, ctrl.team || PLAYER_TEAM)) {
    console.warn('[ITEM] 기지(상점 구역) 안에서만 조합할 수 있습니다.');
    return false;
  }
  // 유일 아이템 검사 - 이번 조합이 소모할 하위템(item.recipe)은 충돌
  // 판정에서 제외한다(예: 티아맷을 소모해 거대한히드라가 되는 건 "같은
  // 계열을 이미 들고 있다"고 막으면 안 된다 - 자연스러운 업그레이드이므로).
  if (_itemUniqueGroupConflict(ctrl, item, new Set(item.recipe))) {
    console.warn(`[ITEM] ${item.nameKo}: 유일 아이템(같은 계열)을 이미 보유하고 있습니다.`);
    return false;
  }
  const cost = combineCost(item);
  if ((ctrl.gold || 0) < cost) { console.warn('[ITEM] 골드가 부족합니다(조합 비용).'); return false; }
  // 하위템 소모 - 개수만큼 각 id의 슬롯을 하나씩 제거한다. 소모(N개) 후
  // 완제품(1개)을 더하므로 칸 수는 절대 늘지 않는다(N>=1) - 인벤토리
  // 한도를 별도로 확인할 필요가 없다.
  const counts = _recipeCounts(item.recipe);
  for (const id in counts) {
    for (let i = 0; i < counts[id]; i++) {
      const idx = ctrl.items.findIndex((s) => s.id === id);
      if (idx >= 0) ctrl.items.splice(idx, 1);
    }
  }
  ctrl.gold -= cost;
  ctrl.items.push({ id: itemId, count: 1 });
  recomputeItemStats(ctrl);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  console.log(`[ITEM] ${item.nameKo} 조합 완료 (차액 ${cost}원)`);
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

// 신발 전용 구매 - "신발은 하나밖에 사지 못한다"(원문)를 그대로 따라
// 6칸 인벤토리가 아니라 ctrl.boots 전용 슬롯 하나만 쓴다. 이미 다른
// 신발을 신고 있으면 "교체"로 취급해 기존 신발 가격을 전액 환급한다
// (판매가 아니라 업그레이드 개념이므로 70%가 아니라 100%).
function _buyBoots(ctrl, item) {
  if (ctrl.boots && ctrl.boots.id === item.id) { console.warn('[ITEM] 이미 장착 중인 신발입니다.'); return false; }
  if ((ctrl.gold || 0) < item.cost) { console.warn('[ITEM] 골드가 부족합니다.'); return false; }
  if (ctrl.boots) {
    const old = ITEM_DATA[ctrl.boots.id];
    ctrl.gold += (old && old.cost) || 0;
    // 약간 신비한 신발 "조합해도(다른 신발로 바꿔도) 이동속도 상승 효과는
    // 계속 유지된다" - 지금 벗는 신발이 그것이었다면, 보너스를 영구
    // 플래그로 못박아 새 신발에도 계속 적용되게 한다(이후 또 다른 신발로
    // 갈아 신어도 이 플래그는 그대로 남는다).
    if (old && old.carryoverMoveSpeedOnUpgrade) {
      ctrl._itemBootsExtraMoveSpeedLol = Math.max(ctrl._itemBootsExtraMoveSpeedLol || 0, old.carryoverMoveSpeedOnUpgrade);
    }
  }
  ctrl.gold -= item.cost;
  ctrl.boots = { id: item.id };
  recomputeItemStats(ctrl);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  return true;
}

// 신발 판매(70%, 다른 일반 아이템과 동일한 판매 규칙) - 교체가 아니라
// 그냥 벗어서 파는 경우(버튼/슬롯 클릭)에 쓴다.
function sellBoots(ctrl) {
  if (!ctrl || !ctrl.boots) return false;
  const item = ITEM_DATA[ctrl.boots.id];
  ctrl.boots = null;
  ctrl.gold = (ctrl.gold || 0) + Math.floor(((item && item.cost) || 0) * 0.7);
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
  if (!item) return false;
  // 활성 사용 아이템(티아맷의 "초승달" 등) - 중첩/충전 소모가 없는 대신
  // 아이템 자체 쿨다운이 있다. 소비 아이템과 분기를 분리한다.
  if (item.activeAbility) return _useActiveAbilityItem(ctrl, item);
  // 거대한히드라(거대한 초승달) - 즉시 피해가 아니라 "다음 쪼개기 한 번"을
  // 강화하는 무장형 액티브.
  if (item.empoweredCleaveActive) return _useEmpoweredCleaveActive(ctrl, item);
  // 발걸음분쇄기(파괴의 충격파) - 즉시 발동형 범위 피해+둔화+이동속도.
  if (item.shockwaveActive) return _useShockwaveActive(ctrl, item);
  // 요우무의 유령검(망령의 발걸음) - 이동속도 버프(즉시 발동형이지만
  // 피해가 없다는 점이 위 두 액티브와 다르다).
  if (item.ghostStepActive) return _useGhostStepActive(ctrl, item);
  // 마법공학 로켓 벨트(초음속) - 즉시 발동형 범위 마법 피해(돌진 이동
  // 자체는 생략 - item_data.js 주석 참고).
  if (item.rocketbeltActive) return _useRocketbeltActive(ctrl, item);
  // 슈렐리아의군가(고무적인 연설) - 요우무의 유령검(망령의 발걸음)과
  // 동일한 구조(즉시 발동형 자가 이동속도 버프, 근접/원거리 구분 없음).
  if (item.teamMoveSpeedActive) return _useTeamMoveSpeedActive(ctrl, item);
  // 마법공학총검(번개 화살) - 자기 주변이 아니라 "현재 선택한 적 챔피언
  // 1명"을 노리는 최초의 아이템 액티브.
  if (item.noxiousBladeActive) return _useNoxiousBladeActive(ctrl, item);
  // 존야의모래시계(시간 정지)/추적자의 팔목 보호대(시간 정지, 1회 한정) -
  // 둘 다 동일한 경직 효과를 공유한다.
  if (item.stasisActive) return _useStasisActive(ctrl, item);
  // 제어 와드 - 인벤토리 중첩 소모형이지만 회복이 아니라 와드 설치가
  // 목적이라 별도 함수로 분리한다(투명 와드의 placeWard()와 유사한 구조,
  // 다만 트린켓 전용 슬롯이 아니라 6칸 인벤토리를 쓴다).
  if (item.wardPlacement) return _useControlWard(ctrl, slotIndex, item);
  // 영약(강철/마법/분노) - 중첩/충전이 아니라 "마시면 바로 소모"되는
  // 1회성 아이템. 상호 배타적 지속 버프라 별도 상태(_itemActiveElixir)로 관리한다.
  if (item.elixirEffect) return _useElixir(ctrl, slotIndex, item);
  if (!item.consumable) { console.warn('[ITEM] 사용할 수 없는 아이템입니다.'); return false; }
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

// 티아맷 "초승달" 등 능동 사용 아이템 - 자체 쿨다운만 확인하고(소지 여부는
// useItem()이 이미 인벤토리 슬롯에서 꺼내 확인했으므로 여기선 다시 보지
// 않는다), 구조물을 제외한 주변 적에게 물리 피해를 입힌다(원문 그대로).
function _useActiveAbilityItem(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  ctrl._itemActiveCooldownUntil[item.id] = now + item.activeAbility.cooldownSec * 1000;
  const raw = item.activeAbility.percentAD * (ctrl.stats.attackDamage || 0);
  if (raw > 0 && typeof findEnemiesInRadius === 'function') {
    const hits = findEnemiesInRadius(ctrl.root.position, item.activeAbility.radius);
    for (const { unit } of hits) {
      if (!unit || unit.hp <= 0 || unit.isTurret || unit.isInhibitor || unit.isNexus) continue; // 구조물 제외(원문 그대로)
      applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    }
  }
  console.log(`[ITEM] ${item.nameKo}(${item.activeAbility.nameKo}) 사용`);
  return true;
}

// 거대한히드라 "거대한 초승달" - 즉시 피해를 주지 않고, 다음 쪼개기 한
// 번(기본 공격 1회)의 대상/주변 피해량을 강화하는 무장(armed) 상태로
// 만든다(광휘의 검 스펠블레이드 "다음 평타 강화" 구조를 재사용).
function _useEmpoweredCleaveActive(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  ctrl._itemActiveCooldownUntil[item.id] = now + item.empoweredCleaveActive.cooldownSec * 1000;
  ctrl._itemEmpoweredCleaveArmed = true;
  console.log(`[ITEM] ${item.nameKo}(${item.empoweredCleaveActive.nameKo}) 무장`);
  return true;
}

// 발걸음분쇄기 "파괴의 충격파" - 즉시 발동형 범위 물리 피해 + 챔피언
// 대상 둔화 + 맞은 챔피언 수에 비례한 자신의 이동속도 증가(3초에 걸쳐
// 선형 감쇠 - 01_status_effect_system.js의 MS_BUFF decayLinear 재사용).
function _useShockwaveActive(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  const p = item.shockwaveActive;
  ctrl._itemActiveCooldownUntil[item.id] = now + p.cooldownSec * 1000;
  const isMelee = _itemIsMelee(ctrl);
  const raw = (isMelee ? p.meleePercentAD : p.rangedPercentAD) * (ctrl.stats.attackDamage || 0);
  let championHits = 0;
  if (raw > 0 && typeof findEnemiesInRadius === 'function') {
    const hits = findEnemiesInRadius(ctrl.root.position, p.radius);
    for (const { unit } of hits) {
      if (!unit || unit.hp <= 0 || unit.isTurret || unit.isInhibitor || unit.isNexus) continue; // 구조물 제외(원문 그대로)
      applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
      if (unit.isChampion && typeof applyStatus === 'function') {
        applyStatus(unit, { id: 'itemHydraShockwaveSlow', type: 'SLOW', duration: p.slowDurationSec, value: p.slowPercent, source: ctrl });
        championHits += 1;
      }
    }
  }
  if (championHits > 0 && typeof applyStatus === 'function') {
    applyStatus(ctrl, { id: 'itemHydraShockwaveMs', type: 'MS_BUFF', duration: p.msDurationSec, value: championHits * p.msPerChampionHitPercent, decayLinear: true });
  }
  console.log(`[ITEM] ${item.nameKo}(${p.nameKo}) 사용 - 챔피언 ${championHits}명 적중`);
  return true;
}

// 요우무의 유령검(망령의 발걸음) - 근접/원거리에 따라 다른 지속시간·
// 이동속도 증가(유체화는 유령무희와 동일한 이유로 실질 효과 없음).
function _useGhostStepActive(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  const p = item.ghostStepActive;
  ctrl._itemActiveCooldownUntil[item.id] = now + p.cooldownSec * 1000;
  const isMelee = _itemIsMelee(ctrl);
  if (typeof applyStatus === 'function') {
    applyStatus(ctrl, { id: 'itemGhostStepMs', type: 'MS_BUFF', duration: isMelee ? p.meleeDurationSec : p.rangedDurationSec, value: isMelee ? p.meleeMsPercent : p.rangedMsPercent });
  }
  console.log(`[ITEM] ${item.nameKo}(${p.nameKo}) 사용`);
  return true;
}

// 슈렐리아의군가(고무적인 연설) - "주변 아군의 이동 속도를 4초 동안 30%
// 상승시킵니다"를 1인용 데모 한계로 자신에게만 적용한다(아군 전체 효과
// 아이템의 공용 한계 - 세계지도집 계열과 동일한 전례).
function _useTeamMoveSpeedActive(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  const p = item.teamMoveSpeedActive;
  ctrl._itemActiveCooldownUntil[item.id] = now + p.cooldownSec * 1000;
  if (typeof applyStatus === 'function') {
    applyStatus(ctrl, { id: 'itemShurelyasSpeech', type: 'MS_BUFF', duration: p.durationSec, value: p.msPercent });
  }
  console.log(`[ITEM] ${item.nameKo}(${p.nameKo}) 사용`);
  return true;
}

// 마법공학 로켓 벨트(초음속) - "지정 방향으로 돌진하며 부채꼴 모양으로
// 100+주문력10% 마법 피해를 입히는 마법 탄환을 발사합니다." 돌진으로
// 인한 실제 이동은 생략하고(item_data.js 주석 참고), 자기 주변 범위
// (findEnemiesInRadius - 티아맷/발걸음분쇄기와 동일한 패턴) 마법 피해만
// 재현한다.
function _useRocketbeltActive(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  const p = item.rocketbeltActive;
  ctrl._itemActiveCooldownUntil[item.id] = now + p.cooldownSec * 1000;
  const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
  const raw = p.baseDmg + ap * p.apPercent;
  if (typeof findEnemiesInRadius === 'function') {
    const hits = findEnemiesInRadius(ctrl.root.position, p.radius);
    for (const { unit } of hits) {
      // 구조물을 제외하지 않는다 - 티아맷/발걸음분쇄기와 달리 원문에
      // "구조물 제외" 문구가 없다(이 프로젝트의 확립된 원칙 - QA 재점검에서
      // 근거 없는 구조물 제외를 여러 번 버그로 찾아 고친 적이 있다).
      if (!unit || unit.hp <= 0) continue;
      applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    }
  }
  console.log(`[ITEM] ${item.nameKo}(${p.nameKo}) 사용`);
  return true;
}

// 마법공학총검(번개 화살) - "적 챔피언에게 충격을 줘 (175~253(레벨비례)+
// 주문력30%)의 마법 피해를 입히고 1.5초 동안 25% 둔화시킵니다." 지금까지
// 모든 아이템 액티브는 "자기 주변 범위"(findEnemiesInRadius)였지만, 이
// 아이템은 원문상 명백히 단일 대상 지정 스킬이다 - 이 엔진에서 "현재
// 선택한 대상"을 가리키는 기존 필드(ctrl.currentTarget, 다른 챔피언들의
// 단일 대상 스킬이 이미 쓰는 것과 동일)를 그대로 재사용한다. 사거리는
// 원문에 없어 검사하지 않는다(명시적 단순화).
function _useNoxiousBladeActive(ctrl, item) {
  const now = performance.now();
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
  const target = ctrl.currentTarget;
  if (!target || target.hp <= 0 || !target.isChampion) { console.warn(`[ITEM] ${item.nameKo}: 적 챔피언을 먼저 선택해야 합니다.`); return false; }
  const p = item.noxiousBladeActive;
  ctrl._itemActiveCooldownUntil[item.id] = now + p.cooldownSec * 1000;
  const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
  const base = _itemScaleByLevel(ctrl, p.minDmg, p.maxDmg, p.levelMin, p.levelMax);
  applyDamage(target, { rawDamage: base + ap * p.apPercent, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  if (typeof applyStatus === 'function') {
    applyStatus(target, { id: 'itemNoxiousBladeSlow', type: 'SLOW', duration: p.slowDurationSec, value: p.slowPercent, source: ctrl });
  }
  console.log(`[ITEM] ${item.nameKo}(${p.nameKo}) 사용`);
  return true;
}

// 존야의모래시계(시간 정지)/추적자의 팔목 보호대(시간 정지, 1회 한정) -
// "경직: 무적 및 대상으로 지정할 수 없는 상태가 되지만, 그동안 움직일 수
// 없습니다." 기존 isUntargetable(수호천사 환생이 쓰는 것과 동일한 필드 -
// 무적+대상 지정 불가)에 더해 STUN 상태이상(이동/스킬 시전을 막는 기존
// 공용 isStunned() 판정)을 함께 걸어 "움직일 수 없음"까지 재현한다.
// maxUses가 있으면(추적자의 팔목 보호대) 쿨다운이 아니라 횟수로 제한하고,
// 사용 후 transformsAfterUse로 자기 자신을 변신시킨다.
function _useStasisActive(ctrl, item) {
  const now = performance.now();
  const p = item.stasisActive;
  if (p.maxUses) {
    ctrl._itemStasisUsesLeft = ctrl._itemStasisUsesLeft || {};
    const used = ctrl._itemStasisUsesLeft[item.id] || 0;
    if (used >= p.maxUses) { console.warn(`[ITEM] ${item.nameKo}: 더 이상 사용할 수 없습니다(1회 한정).`); return false; }
    ctrl._itemStasisUsesLeft[item.id] = used + 1;
  } else {
    ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
    const readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
    if (now < readyAt) { console.warn(`[ITEM] ${item.nameKo} 재사용 대기시간 중입니다.`); return false; }
    ctrl._itemActiveCooldownUntil[item.id] = now + p.cooldownSec * 1000;
  }
  ctrl.isUntargetable = true;
  ctrl._itemStasisUntil = Math.max(ctrl._itemStasisUntil || 0, now + p.durationSec * 1000);
  if (typeof applyStatus === 'function') {
    applyStatus(ctrl, { id: 'itemStasisStun', type: 'STUN', duration: p.durationSec });
  }
  if (p.transformsAfterUse) {
    const slot = (ctrl.items || []).find((s) => s.id === item.id);
    if (slot) slot.id = p.transformsAfterUse;
    if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  }
  console.log(`[ITEM] ${item.nameKo}(${p.nameKo}) 사용`);
  return true;
}

function _itemTickActiveHeals(ctrl, dt) {
  if (!ctrl._itemActiveHeals || !ctrl._itemActiveHeals.length) return;
  // 정령의형상(무한한 활력) 증폭 + 그리버스 감소 - 체력 물약/억겁의
  // 카탈리스트·영겁의지팡이 "영원" 등 이 큐를 쓰는 모든 HoT에 공통
  // 적용된다(01_status_effect_system.js의 getHealReceivedMultiplier 참고 -
  // 보호막은 이 함수가 건드리지 않는 별개 시스템이라 영향받지 않는다).
  const healMult = getHealReceivedMultiplier(ctrl);
  for (const heal of ctrl._itemActiveHeals) {
    const step = Math.min(dt, heal.remainingSec);
    ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + heal.perSec * healMult * step);
    heal.remainingSec -= step;
  }
  // 아이템을 팔거나 다 써도(인벤토리에서 이미 제거됨) 이미 시작된 회복은
  // 실제 LoL처럼 끝까지 진행되므로, 이 목록은 items 배열과 무관하게 돈다.
  ctrl._itemActiveHeals = ctrl._itemActiveHeals.filter((h) => h.remainingSec > 1e-6);
}

// 사라진 양피지(깨우치기)의 마나 HoT - _itemTickActiveHeals와 완전히
// 동일한 구조(마나 상한 클램프만 다름).
function _itemTickActiveManaRestores(ctrl, dt) {
  if (!ctrl._itemActiveManaRestores || !ctrl._itemActiveManaRestores.length) return;
  for (const restore of ctrl._itemActiveManaRestores) {
    const step = Math.min(dt, restore.remainingSec);
    if ((ctrl.maxMp || 0) > 0) ctrl.mp = Math.min(ctrl.maxMp, (ctrl.mp || 0) + restore.perSec * step);
    restore.remainingSec -= step;
  }
  ctrl._itemActiveManaRestores = ctrl._itemActiveManaRestores.filter((r) => r.remainingSec > 1e-6);
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
  // 정령의형상(무한한 활력) - 인내의 집중력(평시/전투 강화) 둘 다에 적용.
  // 그리버스 치유 감소도 같은 지점에 곱한다(위 _itemTickActiveHeals 주석 참고).
  const healMult = getHealReceivedMultiplier(ctrl);
  if (item.champDamageRegen && typeof ctrl._itemLastTookChampionDamageAt === 'number'
      && (now - ctrl._itemLastTookChampionDamageAt) <= item.champDamageRegen.durationSec * 1000) {
    const isMelee = !!(ctrl.stats && ctrl.stats.attackRange <= 300);
    const total = isMelee ? item.champDamageRegen.meleeMaxHp : item.champDamageRegen.rangedMaxHp;
    const perSec = total / item.champDamageRegen.durationSec;
    ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + perSec * healMult * dt);
    return;
  }
  if (!item.regenPassive) return;
  ctrl._itemTick = ctrl._itemTick || {};
  const key = 'hp_' + item.id;
  ctrl._itemTick[key] = (ctrl._itemTick[key] || 0) + dt;
  while (ctrl._itemTick[key] >= item.regenPassive.tickSec) {
    ctrl._itemTick[key] -= item.regenPassive.tickSec;
    ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + item.regenPassive.hpPerTick * healMult);
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
  _itemTickActiveManaRestores(ctrl, dt);
  _itemTickTrinketRecharge(ctrl, dt);
  _itemTickWardExpiry(ctrl, dt);
  if (typeof _itemTickElixirExpiry === 'function') _itemTickElixirExpiry(ctrl);
  const now = performance.now();
  // 아이템을 팔아도(인벤토리에서 이미 사라짐) 이미 걸린 보호막/흡혈
  // 버프는 실제 LoL처럼 원래 지속시간만큼 유지되므로, 인벤토리 유무와
  // 무관하게 매 프레임 만료만 확인한다(월식/멜모셔스의 아귀가 공용으로 씀).
  if (ctrl._itemShieldExpiresAt && now >= ctrl._itemShieldExpiresAt) {
    ctrl.shield = 0;
    ctrl._itemShieldExpiresAt = 0;
  }
  // 마법광학 장치 C44(비전 조준)/고속연사포(저격수)가 공용으로 쓰는 임시
  // 사거리 보너스 - 보호막 만료와 동일한 패턴(아이템을 팔아도 이미 걸린
  // 버프는 원래 지속시간만큼 유지).
  if (ctrl._itemTempAttackRangeExpiresAt && now >= ctrl._itemTempAttackRangeExpiresAt) {
    ctrl._itemTempAttackRangeBonusLol = 0;
    ctrl._itemTempAttackRangeExpiresAt = 0;
  }
  // 벼락폭풍검(창공)의 임시 물리 관통력 - 동일한 패턴.
  if (ctrl._itemTempArmorPenFlatExpiresAt && now >= ctrl._itemTempArmorPenFlatExpiresAt) {
    ctrl.itemTempArmorPenFlat = 0;
    ctrl._itemTempArmorPenFlatExpiresAt = 0;
  }
  // 경계(빛과 어둠) - 빛(방어력/마법저항력)과 어둠(방어구/마법 관통력)
  // 둘 다 5초가 지나면 독립적으로 사라진다(재적중 전까지는 유지).
  if (ctrl._itemSentinelLightExpiresAt && now >= ctrl._itemSentinelLightExpiresAt) {
    ctrl._itemSentinelLightExpiresAt = 0; ctrl._itemSentinelLightStacks = 0;
    if (ctrl.itemTempArmorBonus || ctrl.itemTempMrBonus) { ctrl.itemTempArmorBonus = 0; ctrl.itemTempMrBonus = 0; ctrl.recomputeStats(); }
  }
  if (ctrl._itemSentinelDarkExpiresAt && now >= ctrl._itemSentinelDarkExpiresAt) {
    ctrl._itemSentinelDarkExpiresAt = 0; ctrl._itemSentinelDarkStacks = 0;
    ctrl.itemTempArmorPenPercent = 0; ctrl.itemTempMagicPenPercent = 0;
  }
  // 오만(명성) - 90초가 지나면 공격력 보너스와 처치 누적 둘 다 사라진다
  // (다음 처치부터 다시 12부터 새로 쌓인다).
  if (ctrl._itemHubrisExpiresAt && now >= ctrl._itemHubrisExpiresAt) {
    ctrl._itemHubrisExpiresAt = 0; ctrl._itemHubrisKillCount = 0;
    if (ctrl.itemTempADBonus) { ctrl.itemTempADBonus = 0; ctrl.recomputeStats(); }
  }
  // 요우무의 유령검(출몰) - "전투 이탈" 판정이 없어 최근 챔피언 피해를
  // 주거나 받은 적 없는 시간을 기존 공용 타임스탬프(_itemLastDealtChampionDamageAt/
  // _itemLastTookChampionDamageAt)로 근사한다. MS_BUFF_FLAT(기존 가속/
  // 열정과 동일한 타입)을 매 프레임 다시 걸어 "전투 중이 되는 즉시" 자연
  // 소멸하게 한다(지속시간을 아주 짧게 주고 매 프레임 갱신하는 방식).
  const ghostbladeSlot = (ctrl.items || []).find((s) => s.id === 'youmuusGhostblade');
  if (ghostbladeSlot) {
    const p = ITEM_DATA.youmuusGhostblade.outOfCombatMsPassive;
    const outOfCombat = (now - (ctrl._itemLastDealtChampionDamageAt || 0)) > p.outOfCombatSec * 1000
      && (now - (ctrl._itemLastTookChampionDamageAt || 0)) > p.outOfCombatSec * 1000;
    if (outOfCombat && typeof applyStatus === 'function') {
      const isMelee = _itemIsMelee(ctrl);
      applyStatus(ctrl, { id: 'itemYoumuuOutOfCombatMs', type: 'MS_BUFF_FLAT', duration: 0.5, value: isMelee ? p.meleeAmount : p.rangedAmount });
    }
  }
  // 버그 방지: 멜모셔스의 아귀(생명선)와 끝없는 갈망(포식) 둘 다 "일정
  // 시간 동안 전능 흡혈 증가"를 같은 임시 필드에 쓴다 - 한쪽이 다른
  // 쪽을 덮어쓰지 않도록 둘 중 더 큰 값(겹치면 더 센 효과)을 쓴다.
  const mawOmnivamp = (ctrl._itemMawOmnivampUntil && now < ctrl._itemMawOmnivampUntil)
    ? ITEM_DATA.maw.lifelinePassive.omnivampPercentAfterTrigger : 0;
  const feastOmnivamp = (ctrl._itemFeastOmnivampUntil && now < ctrl._itemFeastOmnivampUntil)
    ? ITEM_DATA.eternalThirst.feastPassive.omnivampPercent : 0;
  ctrl._itemTempVampPercent = Math.max(mawOmnivamp, feastOmnivamp);
  // 스테락의도전(생명선) - 맞지 않아도 4.5초에 걸쳐 보호막이 녹아내린다.
  // ctrl.shield는 여러 아이템이 공유하는 단일 필드라 "줄어드는 상한선"
  // 역할만 한다 - 실제로 흡수에 쓰여 이미 그보다 작아져 있으면 그대로 둔다
  // (한계(명시): 이 시점에 다른 아이템의 보호막이 이 상한보다 커도 함께
  // 깎일 수 있다 - ctrl.shield가 아이템 출처를 구분하지 않는 기존 공용
  // 필드라는 설계를 그대로 따른 결과).
  if (ctrl._itemSterakShieldState) {
    const st = ctrl._itemSterakShieldState;
    const remainFrac = Math.max(0, 1 - (now - st.startedAt) / 1000 / st.decaySec);
    const cap = st.maxAmount * remainFrac;
    if (cap <= 0.01) { ctrl._itemSterakShieldState = null; ctrl.shield = Math.min(ctrl.shield || 0, 0); }
    else if ((ctrl.shield || 0) > cap) { ctrl.shield = cap; }
  }
  // 죽음의무도(고통 무시) - 지연 피해 묶음 진행.
  _itemTickDeathsDanceDot(ctrl, dt);
  // 수호천사(환생) - 경직 시간이 끝나면 대상 지정 불가를 풀고 체력 50%/
  // 마나 100%로 부활시킨다("회복"이 아니라 그 비율로 직접 맞춘다 - 실제
  // LoL 수호천사도 더하는 게 아니라 그 비율로 부활시킨다).
  if (ctrl._itemGuardianAngelStasisUntil && now >= ctrl._itemGuardianAngelStasisUntil) {
    ctrl._itemGuardianAngelStasisUntil = 0;
    ctrl.isUntargetable = false;
    const p = ITEM_DATA.guardianAngel.revivePassive;
    ctrl.hp = (ctrl.maxHp || 0) * p.healHpPercent;
    if ((ctrl.maxMp || 0) > 0) ctrl.mp = (ctrl.maxMp || 0) * p.healMpPercent;
    updateBars(ctrl);
    console.log('[ITEM] 수호천사 - 환생 종료(체력/마나 회복)');
  }
  // 지배자의 피갑옷(폭정/응징) - 체력 비율에 따라 매 순간 바뀌는 동적
  // 공격력 보너스라 recomputeItemStats()(구매/판매 시에만 재계산)가 아니라
  // 여기서 매 프레임 다시 계산한다. 소지하지 않으면 0으로 되돌린다.
  const bloodmailSlot = (ctrl.items || []).find((s) => s.id === 'overlordsBloodmail');
  if (!bloodmailSlot) {
    if (ctrl.itemDynamicBonusAD) { ctrl.itemDynamicBonusAD = 0; ctrl.recomputeStats(); }
  } else {
    const p1 = ITEM_DATA.overlordsBloodmail.tyrannyPassive;
    const p2 = ITEM_DATA.overlordsBloodmail.vengeancePassive;
    const bonusHp = (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0);
    const tyrannyAD = bonusHp * p1.bonusHpToAdPercent;
    const maxHp = ctrl.maxHp || 1;
    const missingPercent = Math.max(0, Math.min(1, 1 - (ctrl.hp || 0) / maxHp));
    const vengeanceRatio = Math.min(1, missingPercent / (1 - p2.maxAtHpPercent)); // 체력 30%(=missing 70%) 지점에서 1.0 도달
    const vengeanceAD = (ctrl.stats.attackDamage || 0) * p2.maxAdPercent * vengeanceRatio;
    const newDynamicAD = tyrannyAD + vengeanceAD;
    if (Math.abs(newDynamicAD - (ctrl.itemDynamicBonusAD || 0)) > 1e-6) {
      ctrl.itemDynamicBonusAD = newDynamicAD;
      ctrl.recomputeStats();
    }
  }
  // 끝없는 갈망(기아) - 추가 공격력에 비례해 매 순간 바뀌는 스킬 가속이라
  // 위 폭정/응징과 동일한 패턴으로 매 프레임 다시 계산한다(ctrl.stats에는
  // 반영되지 않는 값이라 recomputeStats() 호출은 필요 없다 - abilityHasteCooldown()이
  // 직접 이 필드를 읽는다).
  const eternalThirstTickSlot = (ctrl.items || []).find((s) => s.id === 'eternalThirst');
  if (!eternalThirstTickSlot) {
    ctrl.itemDynamicAbilityHaste = 0;
  } else {
    const p = ITEM_DATA.eternalThirst.faminePassive;
    const isMelee = _itemIsMelee(ctrl);
    ctrl.itemDynamicAbilityHaste = p.flatAbilityHaste + _itemBonusAD(ctrl) * (isMelee ? p.meleeBonusAdPercent : p.rangedBonusAdPercent);
  }
  // 쇼진의창(집중된 의지) - 스택 지속시간이 끝나면 초기화하고, 매 프레임
  // 현재 스택 수에서 다시 계산한 증폭률을 ctrl.itemSpellDamageAmpPercent에
  // 써넣는다(calculateDamage()가 이 필드를 읽는다).
  const shojinSlot = (ctrl.items || []).find((s) => s.id === 'shojinSpear');
  if (!shojinSlot) {
    ctrl._itemShojinStacks = 0; ctrl.itemSpellDamageAmpPercent = 0;
  } else {
    if (now >= (ctrl._itemShojinExpiresAt || 0)) ctrl._itemShojinStacks = 0;
    ctrl.itemSpellDamageAmpPercent = (ctrl._itemShojinStacks || 0) * ITEM_DATA.shojinSpear.focusedWillPassive.percentPerStack;
  }
  // 마나순환 변신("360의 최대 마나에 도달하면") - 조합(recipe) 소모가
  // 아니라 "자기 자신이 다른 완제품으로 바뀌는" 메커니즘이라 buildOrBuyItem()과
  // 별개로 여기서 직접 처리한다. 골드는 들지 않는다(원문에 추가 비용 언급
  // 없음). 버그 수정(QA) - 예전에는 s.id === 'manamune'로 하드코딩돼 있어서,
  // 대천사의지팡이(마나무네와 동일한 transformsInto+manaCirculationPassive
  // 조합)가 추가되면 대천사의 포옹으로 전혀 변신하지 못하는 잠재 버그였다 -
  // 암흑의 인장 영광과 동일한 이유로 필드 보유 여부 기반 범용 탐색으로 고쳤다.
  const transformSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].transformsInto && ITEM_DATA[s.id].manaCirculationPassive);
  if (transformSlot) {
    const fromItem = ITEM_DATA[transformSlot.id];
    const p = fromItem.manaCirculationPassive;
    if ((ctrl._itemTearState && ctrl._itemTearState.gained >= p.maxManaCap)) {
      const toId = fromItem.transformsInto;
      transformSlot.id = toId;
      ctrl._itemTearState = null; // 변신 완제품은 더 이상 마나순환 충전이 필요 없다
      recomputeItemStats(ctrl);
      if (typeof updateItemUI === 'function') updateItemUI(ctrl);
      console.log(`[ITEM] ${fromItem.nameKo} -> ${ITEM_DATA[toId].nameKo} 변신 완료`);
    }
  }
  // 폭풍갈퀴/고속연사포 공용 "충전 상태" - 이동하거나 공격하면 충전되고
  // (원문: "이동하거나 공격하면 충전 상태로 공격할 수 있습니다"), 충전이
  // 꽉 차면 다음 기본 공격에서 소모된다(소모 자체는 itemOnBasicAttackHit()).
  // "충전까지 걸리는 시간"이 원문에 없어(item_data.js의 durationGuessed
  // 참고) 가만히 있으면(IDLE) 진행도가 그대로 멈추는 것으로 해석했다
  // (0으로 리셋하지 않음 - "이동하거나 공격하면"이 "계속 움직여야만
  // 쌓인다"는 뜻이지 "멈추면 초기화된다"는 뜻은 아니므로).
  const chargeSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].chargePassive);
  if (!chargeSlot) {
    ctrl._itemChargeProgress = 0; ctrl._itemChargeReady = false;
  } else if (!ctrl._itemChargeReady) {
    const p = ITEM_DATA[chargeSlot.id].chargePassive;
    if (ctrl.state === STATE.MOVE || ctrl.state === STATE.ATTACK) {
      ctrl._itemChargeProgress = (ctrl._itemChargeProgress || 0) + dt;
      if (ctrl._itemChargeProgress >= p.chargeTimeSec) ctrl._itemChargeReady = true;
    }
  }
  // 기괴한 가면(광기)/리안드리의 고통(고난)/균열생성기(공허의 부패) 공용
  // "전투 중 누적 추가 피해" - 아이템을 들고 있지 않으면 0으로 되돌리고,
  // 들고 있으면 최근 챔피언 피해를 주거나받은 적 없는 시간(outOfCombatSec)을
  // 기준으로 전투 이탈 즉시 0으로 리셋한다(요우무의 유령검 "출몰"과 동일한
  // 전투 판정 근사). 최대치 도달 여부(onMaxVamp용)는 바뀔 때만 재계산한다.
  const rampSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].combatRampPassive);
  if (!rampSlot) {
    if (ctrl._itemCombatRampPercent || ctrl._itemCombatRampVampApplied) {
      ctrl._itemCombatRampPercent = 0; ctrl._itemCombatRampVampApplied = false;
    }
  } else {
    const p = ITEM_DATA[rampSlot.id].combatRampPassive;
    const inCombat = (now - (ctrl._itemLastDealtChampionDamageAt || 0)) <= p.outOfCombatSec * 1000
      || (now - (ctrl._itemLastTookChampionDamageAt || 0)) <= p.outOfCombatSec * 1000;
    ctrl._itemCombatRampPercent = inCombat ? Math.min(p.maxPercent, (ctrl._itemCombatRampPercent || 0) + p.percentPerSec * dt) : 0;
    const atMax = p.onMaxVamp && ctrl._itemCombatRampPercent >= p.maxPercent - 1e-6;
    if (!!atMax !== !!ctrl._itemCombatRampVampApplied) {
      ctrl._itemCombatRampVampApplied = !!atMax;
      recomputeItemStats(ctrl);
    }
  }
  // 신록의 장벽/벤시의장막(무효화) - 재사용대기시간이 끝나면 방어막이
  // "생성"된다(실제로 막는 건 itemOnTakeDamage()). 벤시의장막은 챔피언에게
  // 피해를 입히면 재사용대기시간이 초기화되는 조항이 추가로 있다
  // (itemOnDamageDealt() 참고) - 아이템을 안 들고 있으면 상태를 전부 지운다.
  const nullifySlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].nullifyPassive);
  if (!nullifySlot) {
    ctrl._itemNullifyReadyAt = 0; ctrl._itemNullifyShieldUp = false;
  } else if (!ctrl._itemNullifyShieldUp && now >= (ctrl._itemNullifyReadyAt || 0)) {
    ctrl._itemNullifyShieldUp = true;
    console.log(`[ITEM] ${ITEM_DATA[nullifySlot.id].nameKo} - 무효화 방어막 생성`);
  }
  // 존야의모래시계(시간 정지)/추적자의 팔목 보호대 - 경직(무적+대상 지정
  // 불가) 시간이 끝나면 대상 지정 불가를 풀어준다(수호천사 환생과 동일한
  // 패턴이지만, 죽었다가 부활하는 게 아니므로 체력/마나 회복은 없다).
  if (ctrl._itemStasisUntil && now >= ctrl._itemStasisUntil) {
    ctrl._itemStasisUntil = 0;
    ctrl.isUntargetable = false;
    console.log('[ITEM] 시간 정지 종료');
  }
  // 강철심장(거인의 흡수) - "700 사거리 내 챔피언을 상대로 3초간 충전."
  // 현재 선택한 대상(ctrl.currentTarget)이 사거리 내 챔피언인 동안에만
  // 진행되고, 벗어나거나 다른 대상으로 바뀌면 처음부터 다시 쌓인다.
  const heartsteelSlot = (ctrl.items || []).find((s) => s.id === 'heartsteel');
  if (!heartsteelSlot) {
    ctrl._itemHeartsteelProgress = 0; ctrl._itemHeartsteelChargeTarget = null;
  } else if (!ctrl._itemHeartsteelReady) {
    const p = ITEM_DATA.heartsteel.giantAbsorbPassive;
    const target = ctrl.currentTarget;
    const inRange = target && target.hp > 0 && target.isChampion && typeof getHorizontalDistance === 'function' && typeof worldDistanceToLol === 'function'
      && worldDistanceToLol(getHorizontalDistance(ctrl.root.position, target.mesh ? target.mesh.position : target.root.position)) <= p.rangeLol;
    const targetKey = inRange ? _itemTargetKey(target) : null;
    const icdOk = !targetKey || (now >= ((ctrl._itemHeartsteelIcdUntil || {})[targetKey] || 0));
    if (inRange && icdOk) {
      if (ctrl._itemHeartsteelChargeTarget !== targetKey) { ctrl._itemHeartsteelChargeTarget = targetKey; ctrl._itemHeartsteelProgress = 0; }
      ctrl._itemHeartsteelProgress = (ctrl._itemHeartsteelProgress || 0) + dt;
      if (ctrl._itemHeartsteelProgress >= p.chargeSec) { ctrl._itemHeartsteelReady = true; ctrl._itemHeartsteelReadyTargetKey = targetKey; }
    } else {
      ctrl._itemHeartsteelProgress = 0; ctrl._itemHeartsteelChargeTarget = null;
    }
  }
  // 강철심장(거인) - 최대 체력 1000당 모델 크기 3% 증가(최대 30%, 시각
  // 효과 - 전투 수치에는 영향 없음).
  if (heartsteelSlot && ctrl.root && ctrl.root.scale) {
    const p = ITEM_DATA.heartsteel.titanicPassive;
    const scaleBonus = Math.min(p.maxScalePercent, ((ctrl.maxHp || 0) / p.hpPerScaleStep) * p.scalePercentPerStep);
    const s = 1 + scaleBonus;
    if (Math.abs((ctrl._itemHeartsteelScale || 1) - s) > 1e-4) { ctrl._itemHeartsteelScale = s; ctrl.root.scale.setScalar(s); }
  } else if (!heartsteelSlot && ctrl._itemHeartsteelScale && ctrl._itemHeartsteelScale !== 1 && ctrl.root && ctrl.root.scale) {
    ctrl._itemHeartsteelScale = 1; ctrl.root.scale.setScalar(1);
  }
  // 워모그의 갑옷(워모그의 심장) - 추가 체력 2000 이상일 때, 챔피언에게
  // 8초(비챔피언에게는 3초) 동안 피해를 입지 않으면 초당 3% 체력 회복.
  const warmogsSlot = (ctrl.items || []).find((s) => s.id === 'warmogsArmor');
  if (warmogsSlot) {
    const p = ITEM_DATA.warmogsArmor.warmogsHeartPassive;
    const bonusHp = (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0);
    const safeFromChamp = (now - (ctrl._itemLastTookChampionDamageAt || 0)) > p.champOutOfCombatSec * 1000;
    const safeFromAny = (now - (ctrl._itemLastTookAnyDamageAt || 0)) > p.nonChampOutOfCombatSec * 1000;
    if (bonusHp >= p.bonusHpThreshold && safeFromChamp && safeFromAny) {
      // 그리버스 치유 감소도 같은 지점에 곱한다(위 _itemTickActiveHeals 주석 참고).
      const healMult = getHealReceivedMultiplier(ctrl);
      ctrl.hp = Math.min(ctrl.maxHp, (ctrl.hp || 0) + (ctrl.maxHp || 0) * p.percentPerSec * healMult * dt);
    }
  }
  // 끝없는 절망(고뇌) - 챔피언과 전투 중일 때 4초마다 주변 적 챔피언에게
  // 추가체력3% 마법 피해 + 입힌 피해 합의 250%만큼 체력 회복.
  const despairSlot = (ctrl.items || []).find((s) => s.id === 'endlessDespair');
  if (!despairSlot) {
    ctrl._itemAgonyTick = 0;
  } else {
    const p = ITEM_DATA.endlessDespair.agonyPassive;
    const inCombat = (now - (ctrl._itemLastDealtChampionDamageAt || 0)) <= p.outOfCombatSec * 1000
      || (now - (ctrl._itemLastTookChampionDamageAt || 0)) <= p.outOfCombatSec * 1000;
    if (!inCombat) { ctrl._itemAgonyTick = 0; }
    else {
      ctrl._itemAgonyTick = (ctrl._itemAgonyTick || 0) + dt;
      if (ctrl._itemAgonyTick >= p.intervalSec) {
        ctrl._itemAgonyTick -= p.intervalSec;
        const bonusHp = (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0);
        const raw = bonusHp * p.bonusHpPercent;
        let totalDealt = 0;
        if (raw > 0 && typeof findEnemiesInRadius === 'function') {
          const hits = findEnemiesInRadius(ctrl.root.position, p.radius);
          for (const { unit } of hits) {
            if (!unit || unit.hp <= 0 || !unit.isChampion) continue;
            totalDealt += applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
          }
        }
        if (totalDealt > 0) {
          // 그리버스 치유 감소도 같은 지점에 곱한다(위 _itemTickActiveHeals 주석 참고).
          const healMult = getHealReceivedMultiplier(ctrl);
          ctrl.hp = Math.min(ctrl.maxHp, (ctrl.hp || 0) + totalDealt * p.healPercentOfDamage * healMult);
        }
      }
    }
  }
  // 해신작쇼(공허 태생의 저항력) - 챔피언과 5초 이상 "끊기지 않고" 전투를
  // 벌이면 전투가 끝날 때까지 추가 방어력/마법저항력 30% 증가(기존 임시
  // 스탯 필드 재사용). 전투 시작 시각(_itemAbyssalCombatStartAt)은 전투가
  // 끊기는 즉시(요우무의 유령검과 동일한 5초 기준) 초기화된다.
  const abyssalSlot = (ctrl.items || []).find((s) => s.id === 'abyssalMask');
  if (!abyssalSlot) {
    if (ctrl._itemAbyssalBuffActive) { ctrl._itemAbyssalBuffActive = false; ctrl.itemTempArmorBonus = 0; ctrl.itemTempMrBonus = 0; ctrl.recomputeStats(); }
    ctrl._itemAbyssalCombatStartAt = 0;
  } else {
    const p = ITEM_DATA.abyssalMask.voidbornResiliencePassive;
    const inCombat = (now - (ctrl._itemLastDealtChampionDamageAt || 0)) <= p.outOfCombatSec * 1000
      || (now - (ctrl._itemLastTookChampionDamageAt || 0)) <= p.outOfCombatSec * 1000;
    if (!inCombat) {
      ctrl._itemAbyssalCombatStartAt = 0;
      if (ctrl._itemAbyssalBuffActive) { ctrl._itemAbyssalBuffActive = false; ctrl.itemTempArmorBonus = 0; ctrl.itemTempMrBonus = 0; ctrl.recomputeStats(); }
    } else {
      if (!ctrl._itemAbyssalCombatStartAt) ctrl._itemAbyssalCombatStartAt = now;
      const qualifies = (now - ctrl._itemAbyssalCombatStartAt) >= p.combatDurationSec * 1000;
      if (qualifies && !ctrl._itemAbyssalBuffActive) {
        ctrl._itemAbyssalBuffActive = true;
        ctrl.itemTempArmorBonus = (ctrl.itemBonusArmor || 0) * p.bonusPercent;
        ctrl.itemTempMrBonus = (ctrl.itemBonusMr || 0) * p.bonusPercent;
        ctrl.recomputeStats();
        console.log('[ITEM] 해신작쇼 - 공허 태생의 저항력 발동');
      }
    }
  }
  // 천상의 이의(산의 축복) - 챔피언에게 받은 피해의 2초 보호막(DAMAGE_REDUCTION
  // 재사용)이 자연 만료되는 순간을 "보호막이 깨졌다"로 보고 주변에 둔화
  // 충격파를 방출한다. 유지되는 동안은(재적중으로 계속 갱신) 아무 일도
  // 일어나지 않는다 - itemOnTakeDamage()가 매 챔피언 피해마다 갱신한다.
  const celestialSlot = (ctrl.items || []).find((s) => s.id === 'celestialOpposition');
  if (!celestialSlot) {
    ctrl._itemCelestialShieldActive = false;
  } else if (ctrl._itemCelestialShieldActive && now >= (ctrl._itemCelestialShieldExpiresAt || 0)) {
    ctrl._itemCelestialShieldActive = false;
    const p = ITEM_DATA.celestialOpposition.mountainsBlessingPassive;
    if (typeof findEnemiesInRadius === 'function' && typeof applyStatus === 'function') {
      const hits = findEnemiesInRadius(ctrl.root.position, p.radius);
      for (const { unit } of hits) {
        if (!unit || unit.hp <= 0) continue;
        applyStatus(unit, { id: 'itemCelestialShockwaveSlow', type: 'SLOW', duration: p.slowDurationSec, value: p.slowPercent, source: ctrl });
      }
    }
    console.log('[ITEM] 천상의 이의 - 산의 축복 보호막 소멸(충격파)');
  }
  // 세계지도집/룬 나침반(재물 공유) - 충전 재생. "첫 충전은 게임 시작
  // 65초 후"(firstChargeDelaySec) - 그 전에는 0회, 그 뒤로는 20초마다
  // 1회씩 최대 3회까지 채워진다(트린켓 재충전과 동일한 구조).
  const spoilsSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].spoilsOfWarPassive);
  if (!spoilsSlot) {
    ctrl._itemSpoilsCharges = 0; ctrl._itemSpoilsFirstChargeGranted = false;
  } else {
    const p = ITEM_DATA[spoilsSlot.id].spoilsOfWarPassive;
    if (!ctrl._itemSpoilsFirstChargeGranted) {
      const gameTimeSec = typeof getTurretGameTimeSec === 'function' ? getTurretGameTimeSec() : p.firstChargeDelaySec;
      if (gameTimeSec >= p.firstChargeDelaySec) { ctrl._itemSpoilsFirstChargeGranted = true; ctrl._itemSpoilsCharges = 1; }
    } else if ((ctrl._itemSpoilsCharges || 0) < p.maxCharges) {
      ctrl._itemTick = ctrl._itemTick || {};
      ctrl._itemTick.spoilsRecharge = (ctrl._itemTick.spoilsRecharge || 0) + dt;
      while (ctrl._itemTick.spoilsRecharge >= p.rechargeSec && (ctrl._itemSpoilsCharges || 0) < p.maxCharges) {
        ctrl._itemTick.spoilsRecharge -= p.rechargeSec;
        ctrl._itemSpoilsCharges = (ctrl._itemSpoilsCharges || 0) + 1;
      }
    }
  }
  // 세계의 결실 + 5종 업그레이드(10초당 골드5) - 재물 공유와 달리 조건
  // 없이 시간이 지나면 그냥 지급된다.
  const giptSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].goldPerIntervalPassive);
  if (giptSlot) {
    const p = ITEM_DATA[giptSlot.id].goldPerIntervalPassive;
    ctrl._itemTick = ctrl._itemTick || {};
    ctrl._itemTick.goldInterval = (ctrl._itemTick.goldInterval || 0) + dt;
    while (ctrl._itemTick.goldInterval >= p.intervalSec) {
      ctrl._itemTick.goldInterval -= p.intervalSec;
      ctrl.gold = (ctrl.gold || 0) + p.gold;
      if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
    }
  }
  // 영겁의지팡이(불멸의 시간) - 60초마다 체력/마나/주문력 중첩 획득, 최대
  // 중첩 도달 시 1회 레벨업. 아이템을 팔면(인벤토리에서 사라지면) 더 이상
  // 진행되지 않지만, 이미 쌓인 중첩(_itemTimelessStacks)은 암흑의 인장
  // 영광과 동일하게 그대로 남는다(다만 스탯 반영은 들고 있을 때만).
  const timelessSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].timelessPassive);
  if (timelessSlot) {
    const p = ITEM_DATA[timelessSlot.id].timelessPassive;
    ctrl._itemTick = ctrl._itemTick || {};
    const key = 'timeless';
    ctrl._itemTick[key] = (ctrl._itemTick[key] || 0) + dt;
    while (ctrl._itemTick[key] >= p.intervalSec && (ctrl._itemTimelessStacks || 0) < p.maxStacks) {
      ctrl._itemTick[key] -= p.intervalSec;
      ctrl._itemTimelessStacks = (ctrl._itemTimelessStacks || 0) + 1;
      recomputeItemStats(ctrl);
      if (ctrl._itemTimelessStacks >= p.maxStacks && p.levelUpOnMax && !ctrl._itemTimelessLeveledUp) {
        ctrl._itemTimelessLeveledUp = true;
        if (typeof ctrl.levelUp === 'function') ctrl.levelUp();
        console.log('[ITEM] 영겁의지팡이 - 불멸의 시간 최대 중첩 도달(레벨 1 상승)');
      }
    }
  }
  // 어둠불꽃횃불(어둠불꽃) - 현재 불타고 있는 대상 수(_itemBlackfireBurnTargets,
  // itemOnDamageDealt()가 기록)를 매 프레임 정리해서 만료된 대상을 뺀다.
  if (ctrl._itemBlackfireBurnTargets && ctrl._itemBlackfireBurnTargets.size) {
    let changed = false;
    for (const [key, expiresAt] of ctrl._itemBlackfireBurnTargets) {
      if (now >= expiresAt) { ctrl._itemBlackfireBurnTargets.delete(key); changed = true; }
    }
    const newCount = ctrl._itemBlackfireBurnTargets.size;
    if (changed || newCount !== (ctrl._itemBlackfireStacks || 0)) {
      ctrl._itemBlackfireStacks = newCount;
      recomputeItemStats(ctrl);
    }
  }
  // 폭풍쇄도(질풍) - 2초 뒤 예약된 단일 대상 타격을 진행한다. "가격 전에
  // 대상이 사망할 경우 즉시 폭발해 넓은 범위에 피해를 입힙니다" - 아직
  // 타격 시각이 안 됐어도 대상이 이미 죽어 있으면 그 자리에서 즉시
  // 폭발시킨다(원문 그대로, 타이머를 기다리지 않음).
  if (ctrl._itemGaleQueue && ctrl._itemGaleQueue.length) {
    const gp = ITEM_DATA.tempestStaff.galePassive;
    const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
    const raw = gp.baseDmg + ap * gp.apPercent;
    const remaining = [];
    for (const g of ctrl._itemGaleQueue) {
      if (g.target.hp <= 0) {
        if (typeof findEnemiesInRadius === 'function') {
          const hits = findEnemiesInRadius(g.target.mesh ? g.target.mesh.position : ctrl.root.position, gp.explosionRadius);
          for (const { unit } of hits) {
            if (!unit || unit.hp <= 0) continue;
            applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
          }
        }
        console.log('[ITEM] 폭풍쇄도 - 질풍(대상 사망, 즉시 폭발)');
      } else if (now >= g.triggerAt) {
        applyDamage(g.target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
        console.log('[ITEM] 폭풍쇄도 - 질풍 타격');
      } else {
        remaining.push(g);
      }
    }
    ctrl._itemGaleQueue = remaining;
  }
  if (!ctrl.items || !ctrl.items.length) return;
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
  if (!source || !(finalDmg > 0)) return;
  // 멜모셔스의 아귀(생명선) - 발동 후 일정 시간 모든 피해 흡혈 10% 추가.
  // 인벤토리 기반 영구 스탯(itemAllDamageVampPercent, recomputeItemStats()가
  // 채움)과 달리 시간 제한 임시 보너스라 itemSystemTick()이 매 프레임
  // _itemTempVampPercent에 다시 써넣는다(0 또는 부여량 둘 중 하나로
  // 덮어쓰기만 하므로 매 프레임 호출해도 누적되지 않는다).
  const vampPercent = (source.itemAllDamageVampPercent || 0) + (source._itemTempVampPercent || 0);
  if (!(vampPercent > 0)) return;
  if (typeof source.hp !== 'number' || typeof source.maxHp !== 'number') return;
  // 정령의형상(무한한 활력) - 흡혈도 "자신이 받는 체력 회복"에 해당한다.
  // 그리버스 치유 감소 - 실제 LoL에서도 흡혈/스펠뱀프는 그리버스의 직접
  // 적용 대상이다(위 _itemTickActiveHeals 주석 참고).
  const healMult = getHealReceivedMultiplier(source);
  source.hp = Math.min(source.maxHp, source.hp + finalDmg * vampPercent * healMult);
}

// 생명력 흡수(흡혈의 낫) - "모든 피해 흡혈"(위 applyItemVamp)과 달리
// 물리 피해에만 적용된다. 실제 LoL 생명력 흡수도 기본 공격/물리 스킬
// 모두에 적용되므로 damageType만으로 판정한다.
function applyItemPhysicalVamp(source, finalDmg, damageType) {
  if (!source || !(source.itemPhysicalVampPercent > 0) || !(finalDmg > 0)) return;
  if (damageType !== DAMAGE_TYPE.PHYSICAL) return;
  if (typeof source.hp !== 'number' || typeof source.maxHp !== 'number') return;
  // 정령의형상(무한한 활력). 그리버스 치유 감소도 같은 지점에 곱한다
  // (applyItemVamp와 동일한 이유 - 생명력 흡수도 그리버스의 직접 적용 대상).
  const healAmt = finalDmg * source.itemPhysicalVampPercent * getHealReceivedMultiplier(source);
  // 피바라기(영액의 보호막) - 생명력 흡수 전용 아이템이라 생명력 회복
  // (physicalVampPercent)은 흡혈의 낫 등과 공용 필드를 그대로 쓰지만,
  // "최대 체력을 초과하는 회복분을 보호막으로 전환"하는 건 피바라기만의
  // 효과라 보유 여부를 따로 확인한다.
  const bloodthirsterSlot = (source.items || []).find((s) => s.id === 'bloodthirster');
  if (bloodthirsterSlot) {
    const overflow = Math.max(0, (source.hp + healAmt) - source.maxHp);
    source.hp = Math.min(source.maxHp, source.hp + healAmt);
    if (overflow > 0) {
      const p = ITEM_DATA.bloodthirster.overhealShieldPassive;
      const cap = _itemScaleByLevel(source, p.minShield, p.maxShield, p.levelMin, p.levelMax);
      source.shield = Math.min(cap, (source.shield || 0) + overflow);
      // 보호막 소스가 뒤섞여 있어도(생명선류와 동일한 한계) 지속시간은
      // 기존 공용 만료 필드를 그대로 쓴다 - 명시적 지속시간이 원문에
      // 없어, 흡혈로 계속 전환되는 한 유지되다가 8초 동안 흡혈이 없으면
      // 사라지는 것으로 근사한다(durationGuessed).
      source._itemShieldExpiresAt = performance.now() + 8.0 * 1000;
    }
    return;
  }
  source.hp = Math.min(source.maxHp, source.hp + healAmt);
}

// 멜모셔스의 아귀(생명선) - 플레이어 자신이 피해를 "받을" 때 호출되는
// 훅(character_controller.js의 takeDamage()에서 호출 - 지금까지 아이템
// 시스템은 전부 "피해를 입힐 때" 훅뿐이었는데, 이건 최초로 "입을 때" 훅이
// 필요한 아이템이다). 마법 피해로 체력이 30% 밑으로 떨어질 "만큼"의
// 피해를 받으면(이미 있는 보호막은 먼저 그 피해를 흡수한다고 가정하고
// 계산) 2.5초간 보호막 + 전투가 끝날 때까지(이 프로젝트엔 "전투 이탈"
// 판정이 없어 보호막과 같은 길이로 근사) 모든 피해 흡혈 10%.
// 피해를 "받기" 직전에 불리는 공용 훅(character_controller.js의
// takeDamage()가 방어력/마법저항 감소까지 적용한 remaining 값을 넘긴다).
// 원래는 멜모셔스의 아귀(마법 피해 전용) 하나만 있어 void 반환이었지만,
// 죽음의무도(고통 무시)가 "받는 피해 일부를 지연 피해로 돌린다"는, 실제로
// 이번에 받는 피해량 자체를 바꿔야 하는 효과라서 반환값을 쓰는 구조로
// 바꿨다 - 호출부(takeDamage())는 `itemOnTakeDamage(...) ?? remaining`로
// undefined(아무것도 안 바꿈)와 "새 피해량"을 모두 안전하게 받는다.
function itemOnTakeDamage(ctrl, incomingDamage, damageType, source) {
  if (!ctrl) return incomingDamage;
  let remaining = incomingDamage;
  const now = performance.now();

  // 신록의 장벽/벤시의장막(무효화) - "적의 다음 스킬을 막아 주는 주문
  // 방어막"을 이 엔진의 공용 한계(스킬/평타 구분 불가)에 따라 "다음 피해
  // 1회 전체 무효화"로 근사한다. 방어막이 떠 있으면 이번 피해를 통째로
  // 막고 소모한다 - itemSystemTick()이 재사용대기시간 뒤에 다시 생성한다.
  if (ctrl._itemNullifyShieldUp) {
    const nullifySlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].nullifyPassive);
    if (nullifySlot) {
      const p = ITEM_DATA[nullifySlot.id].nullifyPassive;
      ctrl._itemNullifyShieldUp = false;
      ctrl._itemNullifyReadyAt = now + p.icdSec * 1000;
      console.log(`[ITEM] ${ITEM_DATA[nullifySlot.id].nameKo} - 무효화 발동(피해 완전 차단)`);
      return 0;
    }
  }

  // 천상의 이의(산의 축복) - "챔피언으로부터 받는 피해가 근접35%｜원거리
  // 25% 감소. 챔피언에게 피해를 받은 후 2초 동안 지속됩니다." 기존
  // DAMAGE_REDUCTION 상태이상(character_controller.js의 takeDamage()가
  // 이미 getDamageReductionPercent()로 읽어 적용함)을 재사용해서 새 피해
  // 감소 경로를 만들지 않는다 - 재적중 시 2초가 그대로 갱신되고, 자연
  // 만료되는 순간을 itemSystemTick()이 "보호막이 깨짐"으로 보고 충격파를
  // 낸다. 이 효과 자체가 "받는 피해를 줄이는" 것이라 이번 피해(remaining)
  // 에는 적용하지 않는다(다음 피해부터 적용 - 원문이 "받은 후"라고
  // 명시해 이미 걸려있던 상태에서만 줄어드는 것으로 해석했다).
  const celestialSlot = (ctrl.items || []).find((s) => s.id === 'celestialOpposition');
  if (celestialSlot && source && source.isChampion && typeof applyStatus === 'function') {
    const p = ITEM_DATA.celestialOpposition.mountainsBlessingPassive;
    const isMelee = _itemIsMelee(ctrl);
    applyStatus(ctrl, { id: 'itemCelestialBlessing', type: 'DAMAGE_REDUCTION', duration: p.durationSec, value: isMelee ? p.meleePercent : p.rangedPercent });
    ctrl._itemCelestialShieldActive = true;
    ctrl._itemCelestialShieldExpiresAt = now + p.durationSec * 1000;
  }

  // 멜모셔스의 아귀 - 생명선(마법 피해 전용, 원문 그대로).
  const mawSlot = (ctrl.items || []).find((s) => s.id === 'maw');
  if (mawSlot && damageType === DAMAGE_TYPE.MAGICAL && (ctrl._itemMawIcdUntil || 0) <= now) {
    const p = ITEM_DATA.maw.lifelinePassive;
    const hpAfter = (ctrl.hp || 0) - Math.max(0, remaining - (ctrl.shield || 0));
    if (hpAfter < (ctrl.maxHp || 0) * p.hpThresholdPercent) {
      ctrl._itemMawIcdUntil = now + p.icdSec * 1000;
      const isMelee = _itemIsMelee(ctrl);
      const shieldBase = isMelee ? p.meleeShieldBase : p.rangedShieldBase;
      const shieldBonusPercent = isMelee ? p.meleeShieldBonusAdPercent : p.rangedShieldBonusAdPercent;
      // 정령의형상(무한한 활력)/월석재생기(별빛 은총) - 생명선 보호막도
      // "받는 보호막"에 해당한다(보호막 전용 증폭률 사용).
      const shieldAmt = (shieldBase + _itemBonusAD(ctrl) * shieldBonusPercent) * (1 + (ctrl.itemShieldReceivedBonusPercent || 0));
      ctrl.shield = Math.max(ctrl.shield || 0, shieldAmt);
      ctrl._itemShieldExpiresAt = Math.max(ctrl._itemShieldExpiresAt || 0, now + p.shieldDurationSec * 1000);
      ctrl._itemMawOmnivampUntil = now + p.omnivampDurationSec * 1000;
      console.log('[ITEM] 멜모셔스의 아귀 - 생명선 발동');
    }
  }

  // 스테락의도전 - 생명선. 멜모셔스의 아귀와 달리 피해 종류를 가리지
  // 않는다(원문에 "마법 피해로"라는 제한이 없음). 보호막은 추가 체력의
  // 60% 그 자체(정액+비례 조합이 아님)이고, 맞지 않아도 4.5초에 걸쳐
  // 점차 녹아내린다(itemSystemTick()의 _itemSterakShieldState가 담당).
  const sterakSlot = (ctrl.items || []).find((s) => s.id === 'sterakssGage');
  if (sterakSlot && (ctrl._itemSterakIcdUntil || 0) <= now) {
    const p = ITEM_DATA.sterakssGage.lifelinePassive;
    const hpAfter = (ctrl.hp || 0) - Math.max(0, remaining - (ctrl.shield || 0));
    if (hpAfter < (ctrl.maxHp || 0) * p.hpThresholdPercent) {
      ctrl._itemSterakIcdUntil = now + p.icdSec * 1000;
      const bonusHp = (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0);
      const shieldAmt = bonusHp * p.bonusHpShieldPercent * (1 + (ctrl.itemShieldReceivedBonusPercent || 0));
      ctrl.shield = Math.max(ctrl.shield || 0, shieldAmt);
      ctrl._itemSterakShieldState = { maxAmount: shieldAmt, startedAt: now, decaySec: p.shieldDecaySec };
      console.log('[ITEM] 스테락의도전 - 생명선 발동');
    }
  }

  // 불멸의 철갑궁 - 생명선. 멜모셔스의 아귀/스테락의도전과 또 다른 세
  // 번째 형태(레벨 비례 "고정" 보호막, 감쇠 없이 3초 그대로 유지) - 피해
  // 종류는 가리지 않는다(원문에 제한 없음).
  const shieldbowSlot = (ctrl.items || []).find((s) => s.id === 'immortalShieldbow');
  if (shieldbowSlot && (ctrl._itemShieldbowIcdUntil || 0) <= now) {
    const p = ITEM_DATA.immortalShieldbow.lifelinePassive;
    const hpAfter = (ctrl.hp || 0) - Math.max(0, remaining - (ctrl.shield || 0));
    if (hpAfter < (ctrl.maxHp || 0) * p.hpThresholdPercent) {
      ctrl._itemShieldbowIcdUntil = now + p.icdSec * 1000;
      const isMelee = _itemIsMelee(ctrl);
      const shieldAmt = (isMelee
        ? _itemScaleByLevel(ctrl, p.meleeShieldMin, p.meleeShieldMax, p.levelMin, p.levelMax)
        : _itemScaleByLevel(ctrl, p.rangedShieldMin, p.rangedShieldMax, p.levelMin, p.levelMax)) * (1 + (ctrl.itemShieldReceivedBonusPercent || 0));
      ctrl.shield = Math.max(ctrl.shield || 0, shieldAmt);
      ctrl._itemShieldExpiresAt = Math.max(ctrl._itemShieldExpiresAt || 0, now + p.shieldDurationSec * 1000);
      console.log('[ITEM] 불멸의 철갑궁 - 생명선 발동');
    }
  }

  // 대천사의포옹 - 생명선. 위 세 형태와 또 다른 네 번째 형태(최대 마나
  // 비례 보호막, 감쇠 없이 3초 그대로 유지) - 피해 종류는 가리지 않는다
  // (원문에 제한 없음).
  const seraphSlot = (ctrl.items || []).find((s) => s.id === 'seraphsEmbrace');
  if (seraphSlot && (ctrl._itemSeraphIcdUntil || 0) <= now) {
    const p = ITEM_DATA.seraphsEmbrace.lifelinePassive;
    const hpAfter = (ctrl.hp || 0) - Math.max(0, remaining - (ctrl.shield || 0));
    if (hpAfter < (ctrl.maxHp || 0) * p.hpThresholdPercent) {
      ctrl._itemSeraphIcdUntil = now + p.icdSec * 1000;
      const shieldAmt = (ctrl.maxMp || 0) * p.shieldManaPercent * (1 + (ctrl.itemShieldReceivedBonusPercent || 0));
      ctrl.shield = Math.max(ctrl.shield || 0, shieldAmt);
      ctrl._itemShieldExpiresAt = Math.max(ctrl._itemShieldExpiresAt || 0, now + p.shieldDurationSec * 1000);
      console.log('[ITEM] 대천사의포옹 - 생명선 발동');
    }
  }

  // 죽음의무도 - 고통 무시. 받는 피해의 일부(근접 30%｜원거리 10%)를
  // 즉시 받는 대신 3초에 걸쳐 나눠 받는 지연 피해로 돌린다. 여러 번
  // 맞으면 각 타격이 독립된 지연 피해 묶음을 만든다(겹쳐 쌓인다 - 원문에
  // "기존 묶음과 합쳐진다" 같은 언급이 없어 가장 단순하고 안전한 해석).
  const ddSlot = (ctrl.items || []).find((s) => s.id === 'deathsDance');
  if (ddSlot && remaining > 0) {
    const p = ITEM_DATA.deathsDance.ignorePainPassive;
    const isMelee = _itemIsMelee(ctrl);
    const deferPercent = isMelee ? p.meleeDeferPercent : p.rangedDeferPercent;
    const deferredAmount = remaining * deferPercent;
    if (deferredAmount > 0) {
      remaining -= deferredAmount;
      ctrl._itemDeathsDanceDot = ctrl._itemDeathsDanceDot || [];
      ctrl._itemDeathsDanceDot.push({
        perSec: deferredAmount / p.deferDurationSec,
        remainingSec: p.deferDurationSec,
        sourceKey: source ? _itemTargetKey(source) : null,
      });
    }
  }

  return remaining;
}

// 죽음의무도(고통 무시)의 지연 피해 묶음을 매 프레임 진행한다 - 아이템을
// 팔아도 이미 걸린 지연 피해는 끝까지 간다는 원칙은 다른 지속 효과
// (_itemTickActiveHeals 등)와 동일하다. 이 지연 피해는 takeDamage()를
// 다시 거치지 않고 직접 hp를 깎는다(이미 방어력/마법저항 감소까지 끝난
// "최종" 피해량이므로 또 감소를 적용하면 이중 적용이 된다).
function _itemTickDeathsDanceDot(ctrl, dt) {
  if (!ctrl._itemDeathsDanceDot || !ctrl._itemDeathsDanceDot.length) return;
  for (const dot of ctrl._itemDeathsDanceDot) {
    const step = Math.min(dt, dot.remainingSec);
    ctrl.hp = Math.max(0, (ctrl.hp || 0) - dot.perSec * step);
    dot.remainingSec -= step;
  }
  ctrl._itemDeathsDanceDot = ctrl._itemDeathsDanceDot.filter((d) => d.remainingSec > 1e-6);
  // 한계(명시): 수호천사(환생)는 takeDamage()의 "치명적 피해 직전" 지점만
  // 가로채므로, 이 지연 피해로 죽는 경우는 환생이 발동하지 않는다(지연
  // 피해는 takeDamage()를 거치지 않는 별도 경로이기 때문 - item_data.js/
  // README의 다른 명시적 근사들과 동일한 성격의 한계).
  if (ctrl.hp <= 0 && ctrl.state !== STATE.DEAD && typeof ctrl._die === 'function') ctrl._die();
}

// 피해 1건을 처리하는 공용 훅 - applyDamage()(챔피언/더미)와
// applyDamageToMinion()(미니언, fromPlayer일 때만) 양쪽에서 호출한다.
// 그리버스/마나 회복처럼 "챔피언에게"로 명시된 효과는 함수 내부에서
// target.isChampion으로 직접 걸러지므로, 미니언 대상으로 호출돼도
// 안전하게 no-op된다. 여신의 눈물(마나순환)/처형인의 대검(그리버스)/
// 억겁의 카탈리스트(피해 시 마나 회복)/운명의 재(발화 DOT)를 전부
// 여기서 처리한다.
function itemOnDamageDealt(ctrl, target, finalDmg, damageType) {
  // 처형인의 대검 - 챔피언 대상 물리 피해에 그리버스(고통스러운 상처)를 건다.
  if (target.isChampion && damageType === DAMAGE_TYPE.PHYSICAL && ctrl.itemGrievousOnHitPercent > 0 && typeof applyStatus === 'function') {
    applyStatus(target, { id: 'itemGrievousWounds', type: 'GRIEVOUS', duration: ctrl.itemGrievousOnHitDurationSec, value: ctrl.itemGrievousOnHitPercent, source: ctrl });
  }
  // 억겁의 카탈리스트 - 챔피언에게 피해를 입히면 그 피해량의 7%만큼 마나 회복.
  if (target.isChampion && ctrl.itemManaOnDamagePercent > 0 && (ctrl.maxMp || 0) > 0) {
    ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + finalDmg * ctrl.itemManaOnDamagePercent);
  }
  // 운명의 재(발화) - 챔피언/더미/미니언 대상 피해 전체를 트리거로 근사
  // (item_data.js 주석 참고 - "스킬 적중 시"를 평타+스킬 전체로 근사).
  // 몬스터(미니언) 대상은 원문 그대로 더 센 초당 피해(monsterDmgPerSec)를
  // 쓴다. 같은 id로 다시 걸면 지속시간이 갱신될 뿐 중첩되지 않는다
  // (01_status_effect_system.js의 upsert 원칙 그대로).
  const embersSlot = (ctrl.items || []).find((s) => s.id === 'embersOfFate');
  if (embersSlot && typeof applyStatus === 'function') {
    const p = ITEM_DATA.embersOfFate.burnOnDamagePassive;
    const perSec = target.isMinion ? p.monsterDmgPerSec : p.dmgPerSec;
    applyStatus(target, { id: p.id, type: 'DOT', duration: p.durationSec, totalDamage: perSec * p.durationSec, damageType: DAMAGE_TYPE.MAGICAL, tickInterval: 1.0, source: ctrl });
  }
  // 마나순환(여신의 눈물/마나무네 공용) - 챔피언/더미/미니언 대상 피해를
  // 입힐 때마다 충전 1개를 소모해 최대 마나를 얻는다(챔피언 상대는 2배,
  // 누적 360 한도). 마나무네도 같은 패시브를 가지므로 id를 하드코딩하지
  // 않고 manaCirculationPassive 필드 보유 여부로 찾는다 - 그래야 여신의
  // 눈물을 조합해 마나무네가 된 뒤에도(_itemTearState는 ctrl 레벨 상태라
  // 그대로 이어짐) 충전이 계속 쌓여 360 마나 도달 시 무라마나로 변신할 수 있다.
  const tearSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].manaCirculationPassive);
  if (tearSlot) {
    const p = ITEM_DATA[tearSlot.id].manaCirculationPassive;
    ctrl._itemTearState = ctrl._itemTearState || { charges: p.maxCharges, gained: 0 };
    const st = ctrl._itemTearState;
    if (st.gained < p.maxManaCap && st.charges > 0) {
      st.charges -= 1;
      const gain = Math.min(target.isChampion ? p.maxManaPerChampionHit : p.maxManaPerHit, p.maxManaCap - st.gained);
      st.gained += gain;
      recomputeItemStats(ctrl);
      ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + gain); // 늘어난 최대 마나만큼 현재 마나도 함께 채워준다(실제 여신의 눈물과 동일)
    }
  }
  // 마법의 영약(챔피언 대상) - "챔피언이나 포탑에 피해를 입히면 25의
  // 추가 고정 피해. 챔피언이 대상일 경우 재사용대기시간 5초"(원문). 포탑
  // 쪽은 이 함수가 아예 호출되지 않는 경로라 별도의 좁은 훅
  // itemOnDamageDealtToTurret()(00_global_constants.js의 applyDamage()
  // 포탑 분기에서 직접 호출)이 처리한다. 미니언 대상은 원문에 언급이
  // 없어 적용하지 않는다(수치를 지어내지 않는다는 원칙).
  if (ctrl._itemActiveElixir && ctrl._itemActiveElixir.id === 'elixirOfSorcery' && target.isChampion) {
    const eff = ITEM_DATA.elixirOfSorcery.elixirEffect;
    const nowMs = performance.now();
    if ((ctrl._itemActiveElixir.sorceryIcdUntil || 0) <= nowMs) {
      ctrl._itemActiveElixir.sorceryIcdUntil = nowMs + eff.onHitChampionIcdSec * 1000;
      // applyDamage()를 다시 부르면 그 함수가 또 itemOnDamageDealt()를
      // 호출해 무한 재귀로 이어진다(이 함수 자체가 applyDamage()에서
      // 불리는 중이므로) - 고정 피해라 방어력/마법저항력 계산이 필요
      // 없으므로, 더미의 학습용 체력 바닥(2%) 보호만 그대로 재현해
      // target.hp를 직접 깎는다(실드/처형 판정 등은 이 부가 효과의
      // 성격상 생략 - 메인 스킬 피해가 아니라 작은 보조 효과이므로).
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - eff.onHitFlatDamage);
    }
  }
  // 분노의 영약 - "챔피언 대상 물리 피해 흡혈이 12% 증가합니다"(원문).
  // 흡혈의 낫(physicalVampPercent)과 달리 챔피언 대상 전용이라 별도
  // 필드로 구분해서 구현했다(일반 흡혈의 낫은 미니언/더미/챔피언 가리지
  // 않음 - 이 둘을 같은 필드로 합치면 분노의 영약만의 "챔피언 전용"
  // 제약이 사라진다).
  if (ctrl._itemActiveElixir && ctrl._itemActiveElixir.id === 'elixirOfWrath' && target.isChampion && damageType === DAMAGE_TYPE.PHYSICAL) {
    const eff = ITEM_DATA.elixirOfWrath.elixirEffect;
    if (typeof ctrl.hp === 'number' && typeof ctrl.maxHp === 'number') {
      ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + finalDmg * eff.championPhysicalVampPercent);
    }
  }
  // 전설급 2차분 - "스킬로 피해를 입히면" 계열(월식/무라마나 충격/쇼진의창)은
  // 평타 경로에서 이미 호출되는 것과 동일한 공용 함수를 재사용해서 평타+
  // 스킬 양쪽에서 동작하게 한다(여신의 눈물 때와 동일한 "스킬/평타 구분
  // 불가" 근사 - item_data.js 주석 참고).
  _itemEclipseOnHit(ctrl, target);
  _itemMuramanaShockOnHit(ctrl, target, false);
  // 쇼진의창(집중된 의지) - 피해를 입힐 때마다 스택(최대 4, 스택당 3%,
  // 6초 지속·재적중 시 갱신) - 실제 수치 반영은 itemSystemTick()이 매
  // 프레임 ctrl.itemSpellDamageAmpPercent에 다시 써넣는다(calculateDamage()
  // 가 매 프레임이 아니라 피해가 발생할 때마다 호출되므로, "스택이 아직
  // 안 꺼졌는지"는 여기서 매번 갱신해도 안전하다 - 중복 호출 방지 로직
  // 불필요, 그냥 스택+시간만 갱신).
  const shojinSlot = (ctrl.items || []).find((s) => s.id === 'shojinSpear');
  if (shojinSlot) {
    const p = ITEM_DATA.shojinSpear.focusedWillPassive;
    const now = performance.now();
    if (now >= (ctrl._itemShojinExpiresAt || 0)) ctrl._itemShojinStacks = 0;
    ctrl._itemShojinStacks = Math.min(p.maxStacks, (ctrl._itemShojinStacks || 0) + 1);
    ctrl._itemShojinExpiresAt = now + p.durationSec * 1000;
  }
  // 칠흑의양날도끼 - 깎아내기(챔피언 대상 물리 피해 시 방어력 감소 스택,
  // 기존 ARMOR_SHRED 상태이상 재사용 - getArmorShredPercent()가 자동으로
  // 최신값을 읽는다) + 열정(물리 피해를 입히면 대상 불문 자신에게 이동속도
  // 버프, MS_BUFF_FLAT 재사용).
  const blackCleaverSlot = (ctrl.items || []).find((s) => s.id === 'blackCleaver');
  if (blackCleaverSlot && damageType === DAMAGE_TYPE.PHYSICAL) {
    if (target.isChampion && typeof applyStatus === 'function') {
      const p = ITEM_DATA.blackCleaver.carvePassive;
      const now = performance.now();
      const existing = (target.statusEffects || []).find((e) => e.id === 'itemBlackCleaverShred' && e.expiresAt > now);
      const prevStacks = existing ? Math.round(existing.value / p.shredPerStack) : 0;
      const newStacks = Math.min(p.maxStacks, prevStacks + 1);
      applyStatus(target, { id: 'itemBlackCleaverShred', type: 'ARMOR_SHRED', duration: p.durationSec, value: newStacks * p.shredPerStack, source: ctrl });
    }
    if (typeof applyStatus === 'function') {
      const rp = ITEM_DATA.blackCleaver.ragePassive;
      const isMelee = _itemIsMelee(ctrl);
      applyStatus(ctrl, { id: 'itemBlackCleaverRage', type: 'MS_BUFF_FLAT', duration: rp.durationSec, value: isMelee ? rp.meleeAmount : rp.rangedAmount });
    }
  }

  // [전설급 4차분]
  // 징수의 총(죽음) - 이 피해로 체력이 5% 밑으로 "떨어질 만큼"이면
  // 완전히 처형한다. itemOnDamageDealt()는 target.takeDamage()/
  // damageEnemy()가 finalDmg를 적용하기 "전"에 불리므로, target.hp를
  // finalDmg와 정확히 같은 값으로 미리 맞춰두면 뒤이은 정상 차감이
  // 0까지 정확히 깎아준다(처형 판정/학습용 더미의 2% 바닥도 기존 로직이
  // 그대로 처리 - 더미는 damageEnemy()가 늘 그렇듯 2%에서 멈춘다).
  const collectorSlot = (ctrl.items || []).find((s) => s.id === 'collector');
  if (collectorSlot && target.isChampion && target.hp > 0) {
    const p = ITEM_DATA.collector.executePassive;
    const hpAfterPercent = (target.hp - finalDmg) / (target.maxHp || 1);
    if (hpAfterPercent > 0 && hpAfterPercent < p.hpThresholdPercent) {
      target.hp = finalDmg;
    }
  }
  // 정찰병의 새총(명중) - 챔피언에게 피해를 입히면 40 고정 마법 피해
  // 추가(재사용대기 40초, 기본 공격 시 1초씩 추가 감소 - 위
  // itemOnBasicAttackHit()의 _itemScoutsReadyAt 감소 참고). calculateDamage()로
  // 수치만 뽑아 직접 차감하는 재귀 안전 패턴(마법의 영약과 동일).
  const scoutsOnHitSlot = (ctrl.items || []).find((s) => s.id === 'scoutsSlingshot');
  if (scoutsOnHitSlot && target.isChampion) {
    const p = ITEM_DATA.scoutsSlingshot.markmanshipPassive;
    const now = performance.now();
    if ((ctrl._itemScoutsReadyAt || 0) <= now) {
      ctrl._itemScoutsReadyAt = now + p.icdSec * 1000;
      const bonusDmg = calculateDamage({ rawDamage: p.bonusMagicDamage, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, target, source: ctrl });
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - bonusDmg);
    }
  }
  // 마법광학 장치 C44(비전 조준) - "피해를 입힌 챔피언이 3초 안에 사망하면"
  // 판정을 위해, 방금 피해를 입힌 대상과 시각을 기록해둔다. 실제 발동(사거리
  // +100, 8초)은 itemOnChampionDeath()에서 처리한다(죽음의무도 "반항"과
  // 동일한 구조 - 이 데모는 적 AI가 없어 실제 발동 조건이 생기지 않지만
  // 정확하게 구현해둔다 - item_data.js 주석 참고).
  const magicOpticsSlot = (ctrl.items || []).find((s) => s.id === 'magicOpticsC44');
  if (magicOpticsSlot && target.isChampion) {
    const p = ITEM_DATA.magicOpticsC44.arcaneFocusPassive;
    ctrl._itemArcaneFocusTargets = ctrl._itemArcaneFocusTargets || new Map();
    ctrl._itemArcaneFocusTargets.set(_itemTargetKey(target), performance.now() + p.windowSec * 1000);
  }
  // 도미닉 경의 인사(거인 학살자) - 챔피언 대상 추가 체력 비례 추가 피해,
  // 최대 15%(추가 체력 1500에서 최대 도달) - 지배자의 피갑옷 "응징"과
  // 동일한 선형 보간. 추가 물리 피해를 한 번 더 입히는 방식으로 근사한다
  // (이미 끝난 메인 평타/스킬 자체를 소급 증폭할 수 없는 건 다른 "거리
  // 비례 피해"류와 동일한 한계).
  const giantSlayerSlot = (ctrl.items || []).find((s) => s.id === 'lordDominiksRegards');
  if (giantSlayerSlot && target.isChampion) {
    const p = ITEM_DATA.lordDominiksRegards.giantSlayerPassive;
    // bonusHp 근사: 이 프로젝트의 더미/가상 대상엔 "챔피언 기본 체력"을
    // 따로 구할 길이 없는 경우가 있어, target.bonusHealth가 있으면 그걸
    // 우선 쓰고 없으면 maxHp 전체를 "추가 체력"으로 간주한다(더미 기본
    // 체력 300은 임의의 연습용 수치라 기준 삼기 애매하므로 이렇게 둔다 -
    // 명시적 근사).
    const effectiveBonusHp = typeof target.bonusHealth === 'number' ? target.bonusHealth : (target.maxHp || 0);
    const ratio = Math.min(1, effectiveBonusHp / p.maxAtBonusHp);
    // 버그 수정: 거인 학살자는 "피해량의 N%만큼 증폭"이지 새로 추가되는
    // 별개의 물리 피해가 아니다 - finalDmg는 이미 방어력/마법저항력
    // 감소가 전부 끝난 "최종" 수치이므로, 그 비율만큼을 그대로 더해야
    // 한다. calculateDamage()를 다시 거치면 이미 끝난 감소를 한 번 더
    // 적용하는 이중 감소가 되고, 데미지 타입도 늘 물리로 고정돼 있어서
    // 원래 피해가 마법 피해였을 경우(예: 주문력도 있는 챔피언의 스킬)
    // 방어력이 아니라 마법저항력 기준으로 계산돼야 하는데 그러지 못했다.
    const bonusRaw = ratio * p.maxBonusPercent * finalDmg;
    if (bonusRaw > 0) {
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - bonusRaw);
    }
  }

  // 벼락폭풍검(전류 자극) - "스킬로 챔피언에게 피해를 입히면" 충전 상태가
  // 준비된다(다른 아이템들과 동일한 한계로 평타+스킬 전체에 근사한다 -
  // 이 함수 자체가 이미 "스킬이든 평타든 피해를 입히면" 공용 경로이므로
  // 추가 근사 없이 자연스럽게 맞물린다).
  const stormsurgeDmgSlot = (ctrl.items || []).find((s) => s.id === 'stormsurge');
  if (stormsurgeDmgSlot && target.isChampion) ctrl._itemSkillChargeReady = true;

  // 오만(명성) - 피해를 입힌 챔피언을 기록해둔다(itemOnChampionDeath()가
  // 3초 안의 죽음을 판정). 죽음의무도 "반항"/마법광학 장치 C44 "비전
  // 조준"과 동일한 구조·동일한 한계(적 AI 없음)를 공유한다.
  const hubrisSlot = (ctrl.items || []).find((s) => s.id === 'hubris');
  if (hubrisSlot && target.isChampion) {
    const p = ITEM_DATA.hubris.renownPassive;
    ctrl._itemHubrisTargets = ctrl._itemHubrisTargets || new Map();
    ctrl._itemHubrisTargets.set(_itemTargetKey(target), performance.now() + p.windowSec * 1000);
  }

  // 끝없는 갈망(포식) - 위 오만(명성)과 동일한 추적 구조.
  const eternalThirstSlot = (ctrl.items || []).find((s) => s.id === 'eternalThirst');
  if (eternalThirstSlot && target.isChampion) {
    const p = ITEM_DATA.eternalThirst.feastPassive;
    ctrl._itemEternalThirstTargets = ctrl._itemEternalThirstTargets || new Map();
    ctrl._itemEternalThirstTargets.set(_itemTargetKey(target), performance.now() + p.windowSec * 1000);
  }

  // 요새파괴자(성형작약) - 챔피언에게 스킬로 피해를 입히면(평타+스킬 근사)
  // 추가 고정 피해, 자신의 물리 방어구 관통력 비례(재사용대기 20초).
  // calculateDamage()를 다시 거치지 않고 "고정 피해"를 그대로 깎는다
  // (TRUE 취급 - 마법의 영약의 고정 피해와 동일한 패턴).
  const fortressDmgSlot = (ctrl.items || []).find((s) => s.id === 'fortressBreaker');
  if (fortressDmgSlot && target.isChampion) {
    const p = ITEM_DATA.fortressBreaker.shapedChargePassive;
    const now = performance.now();
    if ((ctrl._itemShapedChargeReadyAt || 0) <= now) {
      ctrl._itemShapedChargeReadyAt = now + p.icdSec * 1000;
      const isMelee = _itemIsMelee(ctrl);
      const flat = isMelee ? p.meleeFlat : p.rangedFlat;
      const penMult = isMelee ? p.meleeArmorPenPercentOfStat : p.rangedArmorPenPercentOfStat;
      const extra = flat + (ctrl.itemBonusArmorPenFlat || 0) * penMult;
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - extra);
    }
  }

  // 세릴다의 원한(매서운 추위) - 스킬로(평타+스킬 근사) 체력 50% 이하인
  // 적에게 피해를 입히면 1초간 30% 둔화.
  const seryldaSlot = (ctrl.items || []).find((s) => s.id === 'serylasGrudge');
  if (seryldaSlot && (target.hp / (target.maxHp || 1)) <= ITEM_DATA.serylasGrudge.frostPassive.hpThresholdPercent && typeof applyStatus === 'function') {
    const p = ITEM_DATA.serylasGrudge.frostPassive;
    applyStatus(target, { id: 'itemSeryldaSlow', type: 'SLOW', duration: p.slowDurationSec, value: p.slowPercent, source: ctrl });
  }

  // [전설급 7차분 - 주문력]
  // 기괴한 가면(광기)/리안드리의 고통(고난)/균열생성기(공허의 부패) 공용
  // "전투 중 누적 추가 피해" - 이미 끝난 최종 피해(finalDmg)에 비율만
  // 더한다(도미닉 경의 인사 거인 학살자와 동일한 이중 감소 방지 패턴).
  if (target.isChampion && (ctrl._itemCombatRampPercent || 0) > 0) {
    const bonus = finalDmg * ctrl._itemCombatRampPercent;
    const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
    target.hp = Math.max(minHp, (target.hp || 0) - bonus);
  }

  // 마법공학 교류 발전기(자극) - 챔피언에게 피해를 입히면 65의 추가 마법
  // 피해(재사용대기 40초). 정찰병의 새총 "명중"과 동일한 패턴(calculateDamage()로
  // 수치만 뽑아 직접 차감 - 재귀 안전).
  const procSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].procOnChampionDamagePassive);
  if (procSlot && target.isChampion) {
    const p = ITEM_DATA[procSlot.id].procOnChampionDamagePassive;
    const now = performance.now();
    ctrl._itemProcReadyAt = ctrl._itemProcReadyAt || {};
    if ((ctrl._itemProcReadyAt[procSlot.id] || 0) <= now) {
      ctrl._itemProcReadyAt[procSlot.id] = now + p.icdSec * 1000;
      const bonusDmg = calculateDamage({ rawDamage: p.flatMagicDamage, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, target, source: ctrl });
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - bonusDmg);
    }
  }

  // 어둠불꽃횃불(악의의 불길) - 운명의 재와 동일한 트리거 근사(스킬+평타
  // 전체)로 3초간 불태우며, 주문력 비례가 추가된다. 몬스터는 매초 20의
  // 추가 피해(원문 "추가" 그대로 - 기본값에 더해서 입힘). 동시에 현재
  // 불타는 대상 Map(_itemBlackfireBurnTargets)에 기록해서 "어둠불꽃"(총
  // 주문력 증가) 스택 수의 근거로 쓴다.
  const blackfireSlot = (ctrl.items || []).find((s) => s.id === 'blackfireTorch');
  if (blackfireSlot && typeof applyStatus === 'function') {
    const p = ITEM_DATA.blackfireTorch.burnOnDamagePassive;
    const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
    const perSec = (p.baseDmgPerSec + ap * p.apPercentPerSec) + (target.isMinion ? p.monsterBonusPerSec : 0);
    applyStatus(target, { id: p.id, type: 'DOT', duration: p.durationSec, totalDamage: perSec * p.durationSec, damageType: DAMAGE_TYPE.MAGICAL, tickInterval: 1.0, source: ctrl });
    if (target.isChampion || target.isTrainingDummy) {
      ctrl._itemBlackfireBurnTargets = ctrl._itemBlackfireBurnTargets || new Map();
      ctrl._itemBlackfireBurnTargets.set(_itemTargetKey(target), performance.now() + p.durationSec * 1000);
    }
  }

  // 루덴의메아리(메아리, 재사용대기 12초) - "메아리 6개, 주 대상+주변
  // 적에게 (75+주문력5%), 남은 메아리는 주 대상에게 20%씩" - 이 엔진은
  // 근처 여러 적을 동시에 추적하는 광역 시스템이 없어, 주변에 다른 적이
  // 없을 때의 실제 수치(= 기본 100% + 나머지 5발×20% = 총 200%)로
  // 단순화해 전부 주 대상에게 집중시켰다(item_data.js 주석 참고).
  const ludensSlot = (ctrl.items || []).find((s) => s.id === 'ludensEcho');
  if (ludensSlot && target.isChampion) {
    const p = ITEM_DATA.ludensEcho.ludensEchoPassive;
    const now = performance.now();
    if ((ctrl._itemLudensReadyAt || 0) <= now) {
      ctrl._itemLudensReadyAt = now + p.icdSec * 1000;
      const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
      const full = p.baseDmg + ap * p.apPercent;
      const total = full * (1 + (p.totalEchoes - 1) * p.redirectPercent);
      const bonusDmg = calculateDamage({ rawDamage: total, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, target, source: ctrl });
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - bonusDmg);
    }
  }

  // 라일라이의수정홀(서리) - 적에게 피해를 입히면 1초간 30% 둔화(원문에
  // 챔피언 전용 언급이 없어 미니언/챔피언 모두 적용).
  const rylaiSlot = (ctrl.items || []).find((s) => s.id === 'rylaisCrystalScepter');
  if (rylaiSlot && typeof applyStatus === 'function') {
    const p = ITEM_DATA.rylaisCrystalScepter.frostOnDamagePassive;
    applyStatus(target, { id: 'itemRylaiSlow', type: 'SLOW', duration: p.slowDurationSec, value: p.slowPercent, source: ctrl });
  }

  // 리안드리의 고통(고통) - 3초간 적을 불태워 매초 최대 체력 2%의 마법
  // 피해(적용 시점 최대 체력을 스냅샷 - item_data.js 주석 참고).
  const liandrySlot = (ctrl.items || []).find((s) => s.id === 'liandrysTorment');
  if (liandrySlot && typeof applyStatus === 'function') {
    const p = ITEM_DATA.liandrysTorment.burnPercentMaxHpPassive;
    const totalDamage = (target.maxHp || 0) * p.percentOfMaxHpPerSec * p.durationSec;
    applyStatus(target, { id: p.id, type: 'DOT', duration: p.durationSec, totalDamage, damageType: DAMAGE_TYPE.MAGICAL, tickInterval: 1.0, source: ctrl });
  }

  // 우주의추진력(마법의 춤) - 적 챔피언에게 마법 또는 고정 피해를 입히면
  // 4초간 이동 속도 +20(칠흑의양날도끼 "열정"과 동일한 MS_BUFF_FLAT 재사용 -
  // 재적중 시 지속시간만 갱신, 중첩 없음).
  const cosmicSlot = (ctrl.items || []).find((s) => s.id === 'cosmicDrive');
  if (cosmicSlot && target.isChampion && (damageType === DAMAGE_TYPE.MAGICAL || damageType === DAMAGE_TYPE.TRUE) && typeof applyStatus === 'function') {
    const p = ITEM_DATA.cosmicDrive.dancePassive;
    applyStatus(ctrl, { id: 'itemCosmicDriveMs', type: 'MS_BUFF_FLAT', duration: p.durationSec, value: p.msFlat });
  }

  // 악의(증오안개) - "궁극기로 적 챔피언에게 피해를 입힐 때마다" - R
  // 시전 직후 짧은 시간(rDamageWindowMs) 안에 발생한 피해만 "궁극기로
  // 입힌 피해"로 근사한다(_dispatchCast()가 기록하는 ctrl._itemLastCastSlot -
  // 챔피언 파일을 건드리지 않고 R 여부를 구분하는 유일한 지점).
  const malignanceSlot = (ctrl.items || []).find((s) => s.id === 'malignance');
  if (malignanceSlot && target.isChampion && typeof applyStatus === 'function') {
    const p = ITEM_DATA.malignance.hatefogPassive;
    const now = performance.now();
    if (ctrl._itemLastCastSlot === 'R' && (now - (ctrl._itemLastCastSlotAt || 0)) <= p.rDamageWindowMs) {
      const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
      const perSec = p.dmgPerSec + ap * p.apPercentPerSec;
      applyStatus(target, { id: 'itemMalignanceHatefogBurn', type: 'DOT', duration: p.durationSec, totalDamage: perSec * p.durationSec, damageType: DAMAGE_TYPE.MAGICAL, tickInterval: 1.0, source: ctrl });
      applyStatus(target, { id: 'itemMalignanceHatefogMrShred', type: 'MR_SHRED', duration: p.durationSec, value: p.mrShred, source: ctrl });
    }
  }

  // 폭풍쇄도(폭풍 약탈자) - "2.5초 내로 챔피언 최대 체력의 25%에 해당하는
  // 피해를 입히면 질풍을 적용"(대상별 재사용대기시간 30초). 누적 피해를
  // 롤링 윈도우(2.5초)로 추적하다가 문턱을 넘으면 질풍을 큐에 등록하고
  // (실제 타격은 itemSystemTick()이 2초 뒤에 처리), 즉시 누적을 초기화한다.
  const tempestSlot = (ctrl.items || []).find((s) => s.id === 'tempestStaff');
  if (tempestSlot && target.isChampion) {
    const sp = ITEM_DATA.tempestStaff.squallPassive;
    const now = performance.now();
    ctrl._itemSquallState = ctrl._itemSquallState || new Map();
    const key = _itemTargetKey(target);
    let st = ctrl._itemSquallState.get(key);
    if (!st || now - st.windowStart > sp.windowSec * 1000) st = { sum: 0, windowStart: now };
    st.sum += finalDmg;
    ctrl._itemSquallState.set(key, st);
    ctrl._itemGaleIcdUntil = ctrl._itemGaleIcdUntil || new Map();
    const icdUntil = ctrl._itemGaleIcdUntil.get(key) || 0;
    if (st.sum >= (target.maxHp || 0) * sp.hpThresholdPercent && now >= icdUntil) {
      ctrl._itemGaleIcdUntil.set(key, now + sp.icdSec * 1000);
      ctrl._itemSquallState.delete(key);
      const gp = ITEM_DATA.tempestStaff.galePassive;
      ctrl._itemGaleQueue = ctrl._itemGaleQueue || [];
      ctrl._itemGaleQueue.push({ target, triggerAt: now + gp.delaySec * 1000 });
      console.log('[ITEM] 폭풍쇄도 - 질풍 적용');
    }
  }

  // 그림자불꽃(잿덩이꽃) - 체력 40% 이하인 적에게 마법/고정 피해 시 20%
  // 추가 피해. "치명타 피해량 관련 능력치는 잿덩이꽃의 추가 피해량에만
  // 영향을 줍니다" - 무한의 대검 등 itemBonusCritDamagePercent가 이
  // 20%(bonusPercent) 자체에만 곱해진다(전체 피해가 아니라 이 보너스에만).
  const shadowflameSlot = (ctrl.items || []).find((s) => s.id === 'shadowflame');
  if (shadowflameSlot && (damageType === DAMAGE_TYPE.MAGICAL || damageType === DAMAGE_TYPE.TRUE)
      && (target.hp / (target.maxHp || 1)) <= ITEM_DATA.shadowflame.cinderbloomPassive.hpThresholdPercent) {
    const p = ITEM_DATA.shadowflame.cinderbloomPassive;
    const critDmgBonus = (ctrl.itemBonusCritDamagePercent || 0);
    const bonus = finalDmg * p.bonusPercent * (1 + critDmgBonus);
    if (bonus > 0) {
      const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
      target.hp = Math.max(minHp, (target.hp || 0) - bonus);
    }
  }

  // 벤시의장막(무효화) - "챔피언에게 피해를 입으면 재사용 대기시간이
  // 초기화됩니다." 이미 방어막이 떠 있는 상태는 건드리지 않고(보수적
  // 해석 - item_data.js 주석 참고), 아직 충전 중일 때만 타이머를 다시
  // 지금부터 전체 재사용대기시간만큼 센다.
  const banshSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].nullifyPassive && ITEM_DATA[s.id].nullifyPassive.resetOnChampionDamage);
  if (banshSlot && target.isChampion && !ctrl._itemNullifyShieldUp) {
    ctrl._itemNullifyReadyAt = performance.now() + ITEM_DATA[banshSlot.id].nullifyPassive.icdSec * 1000;
  }

  // 세계지도집/룬 나침반(재물 공유 - 챔피언/구조물 피해) - "스킬 및 기본
  // 공격으로 챔피언 및 구조물에 피해를 입히면 (근거리22｜원거리20)골드를
  // 획득합니다." 충전을 소모한다(미니언 처형과 충전을 공유 - 아래
  // itemOnBasicAttackHit() 참고).
  const spoilsSlotD = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].spoilsOfWarPassive);
  if (spoilsSlotD && (target.isChampion || _itemIsStructure(target)) && (ctrl._itemSpoilsCharges || 0) > 0) {
    const item = ITEM_DATA[spoilsSlotD.id];
    const p = item.spoilsOfWarPassive;
    ctrl._itemSpoilsCharges -= 1;
    const gold = _itemIsMelee(ctrl) ? p.meleeDamageGold : p.rangedDamageGold;
    _itemGrantSupportGold(ctrl, spoilsSlotD, item, gold);
    console.log(`[ITEM] ${item.nameKo} - 재물 공유 발동(피해, +${gold}골드)`);
  }

  // 자자크의 세계가시(공허 폭발, 재사용대기 10초) - "챔피언에게 스킬로
  // 피해를 입히면"(평타+스킬 전체 근사) 대상 위치에서 폭발 - 대상+주변
  // 적에게 10+주문력15%+최대체력3% 마법 피해(몬스터는 최대체력 항을
  // 300으로 캡).
  const zazakSlot = (ctrl.items || []).find((s) => s.id === 'zaZaksRealmspike');
  if (zazakSlot && target.isChampion) {
    const p = ITEM_DATA.zaZaksRealmspike.voidBurstPassive;
    const nowZ = performance.now();
    if ((ctrl._itemZazakReadyAt || 0) <= nowZ) {
      ctrl._itemZazakReadyAt = nowZ + p.icdSec * 1000;
      const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
      const doBurst = (unit) => {
        if (!unit || unit.hp <= 0) return;
        const hpBonus = unit.isMinion ? Math.min(p.monsterMaxHpBonusCap, (unit.maxHp || 0) * p.maxHpPercent) : (unit.maxHp || 0) * p.maxHpPercent;
        applyDamage(unit, { rawDamage: p.baseDmg + ap * p.apPercent + hpBonus, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
      };
      doBurst(target);
      if (typeof findEnemiesInRadius === 'function') {
        const hits = findEnemiesInRadius(target.mesh ? target.mesh.position : ctrl.root.position, p.radius);
        for (const { unit } of hits) { if (unit && unit !== target) doBurst(unit); }
      }
      console.log('[ITEM] 자자크의 세계가시 - 공허 폭발 발동');
    }
  }
}

// 마법의 영약의 포탑 전용 분기 - 00_global_constants.js의 applyDamage()가
// 포탑 대상일 때(itemOnDamageDealt()는 호출되지 않는 완전히 별개 경로)
// 직접 호출한다. 포탑 쪽은 원문에 재사용대기시간 언급이 없어 매번
// 발동한다(챔피언 대상만 5초 쿨다운 - 위 itemOnDamageDealt() 참고).
function itemOnDamageDealtToTurret(ctrl, turret, finalDmg) {
  if (!ctrl._itemActiveElixir || ctrl._itemActiveElixir.id !== 'elixirOfSorcery') return;
  if (!turret || turret.destroyed) return;
  const eff = ITEM_DATA.elixirOfSorcery.elixirEffect;
  applyDamageToTurret(turret, { rawDamage: eff.onHitFlatDamage, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 }, { source: ctrl });
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

// 억겁의 카탈리스트 - "스킬 사용 시 소모한 마나의 25%에 해당하는 체력을
// 회복합니다. 스킬 사용 1회당 초당 최대 20의 체력을 회복합니다." 기존
// _itemActiveHeals(HoT) 목록에 등록해 itemSystemTick()이 매 프레임
// 진행하게 한다 - 속도(초당량)는 20을 넘지 않되, 총량(manaSpent*25%)은
// 전부 전달해야 하므로 필요하면 1초보다 길게 늘려서 깎아 보낸다.
// 한계(명시): _payCost()를 거치지 않고 각 챔피언 파일에서 직접
// this.mp -= ... 로 마나를 깎는 스킬(리 신 Q/W, 야스오, 닐라, 요네)은
// 이 훅을 타지 않는다 - 스킬 가속(abilityHasteCooldown)과 동일한 한계.
function itemOnManaSpent(ctrl, manaSpent) {
  if (!ctrl || !manaSpent || manaSpent <= 0) return;
  // 버그 수정(QA) - 'catalystOfAeons' id로 하드코딩돼 있었다. 영겁의지팡이가
  // 억겁의 카탈리스트와 완전히 동일한 "영원" 패시브(manaSpentToHealPercent)를
  // 갖게 되면서, 암흑의 인장(영광)/마나무네(마나순환) 때와 동일한 하드코딩
  // 버그가 될 뻔했다 - 필드 보유 여부로 범용 탐색하도록 미리 고쳤다.
  const slot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].manaSpentToHealPercent);
  if (!slot) return;
  const p = ITEM_DATA[slot.id];
  const totalHeal = manaSpent * p.manaSpentToHealPercent;
  if (totalHeal <= 0) return;
  const perSec = Math.min(p.manaSpentHealCapPerSec, totalHeal);
  const remainingSec = totalHeal / perSec;
  ctrl._itemActiveHeals = ctrl._itemActiveHeals || [];
  ctrl._itemActiveHeals.push({ perSec, remainingSec });
}

// 사라진 양피지(깨우치기) - "레벨 업하면 3초 동안 최대 마나의 20%를
// 회복합니다." character_controller.js의 levelUp()(수동 레벨업 버튼/EXP
// 자동 레벨업/영겁의지팡이 "불멸의 시간" 모두 동일한 이 메서드 하나를
// 거친다)이 호출하는 공용 훅. _itemActiveHeals(HoT)와 동일한 구조의
// 전용 큐(_itemActiveManaRestores)로 진행한다(체력이 아니라 마나라 따로 둠).
function itemOnLevelUp(ctrl) {
  if (!ctrl) return;
  const slot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].enlightenPassive);
  if (!slot || !((ctrl.maxMp || 0) > 0)) return;
  const p = ITEM_DATA[slot.id].enlightenPassive;
  const totalRestore = (ctrl.maxMp || 0) * p.manaPercentOverTime;
  if (totalRestore <= 0) return;
  ctrl._itemActiveManaRestores = ctrl._itemActiveManaRestores || [];
  ctrl._itemActiveManaRestores.push({ perSec: totalRestore / p.durationSec, remainingSec: p.durationSec });
  console.log('[ITEM] 사라진 양피지 - 깨우치기 발동(마나 회복)');
}

// 태양의 썰매(썰매 질주) - "적 챔피언을 둔화 또는 이동 불가 상태로 만들면
// 50~230(레벨비례) 체력 회복 + 자신과 주변 체력이 가장 낮은 아군이 2.5초간
// 이동속도 20% 획득." 01_status_effect_system.js의 applyStatus() 공용
// 진입점이 호출한다(어떤 챔피언의 어떤 CC 스킬이든 자동으로 맞물림).
// 아군이 없는 이 데모는 자신에게만 이동속도를 적용한다(명시적 한계).
// target/effectType(선택) - 밴들파이프(팡파르)는 자신이 건 둔화/이동
// 불가(태양의 썰매와 동일한 넓은 집합)에 반응하고, 제국의명령(명령)은
// 그중 "이동 불가"만(둔화 제외) 걸린 "대상"을 표식해야 하므로 추가했다
// (호출하는 쪽 - 01_status_effect_system.js의 applyStatus() - 이 둘을
// 안 넘기면 기존처럼 태양의 썰매만 동작 - 하위 호환).
function itemOnSlowOrImmobilize(ctrl, target, effectType) {
  if (!ctrl) return;
  const sleighSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].ccTriggerPassive);
  if (sleighSlot) {
    const p = ITEM_DATA[sleighSlot.id].ccTriggerPassive;
    const now = performance.now();
    if ((ctrl._itemSleighIcdUntil || 0) <= now) {
      ctrl._itemSleighIcdUntil = now + p.icdSec * 1000;
      const heal = _itemScaleByLevel(ctrl, p.minHeal, p.maxHeal, p.levelMin, p.levelMax);
      if (typeof ctrl.hp === 'number' && typeof ctrl.maxHp === 'number') ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + heal);
      if (typeof applyStatus === 'function') {
        applyStatus(ctrl, { id: 'itemSolsticeSleighMs', type: 'MS_BUFF', duration: p.msDurationSec, value: p.msPercent });
      }
      console.log('[ITEM] 태양의 썰매 - 썰매 질주 발동');
    }
  }

  // 밴들파이프(팡파르) - "적 챔피언을 둔화시키거나 이동 불가 상태로
  // 만들면" 근접8초｜원거리4초간 이동속도 +20(고정) + 자신(및 "주변
  // 아군" - 1인용 데모라 자신으로 근사)의 공격속도 근접+30%｜원거리+20%.
  // 재사용대기시간 없이 매번 지속시간을 "갱신"한다(applyStatus가 같은
  // id를 다시 걸면 자동으로 지속시간을 덮어쓴다 - 원문에 쿨다운 표기가
  // 없으므로 그대로 따른다).
  const fanfareSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].fanfarePassive);
  if (fanfareSlot && typeof applyStatus === 'function') {
    const p = ITEM_DATA[fanfareSlot.id].fanfarePassive;
    const isMelee = _itemIsMelee(ctrl);
    const dur = isMelee ? p.meleeDurationSec : p.rangedDurationSec;
    applyStatus(ctrl, { id: 'itemFanfareMs', type: 'MS_BUFF_FLAT', duration: dur, value: p.msFlat });
    applyStatus(ctrl, { id: 'itemFanfareAs', type: 'AS_BUFF', duration: dur, value: isMelee ? p.meleeAsPercent : p.rangedAsPercent });
    console.log('[ITEM] 밴들파이프 - 팡파르 발동');
  }

  // 제국의명령(명령) - "통제"(이동 불가 스킬 전용 스킬 가속)는 챔피언별로
  // 어떤 스킬이 "이동 불가"를 거는지 태그하는 시스템이 없어 구현하지
  // 않는다(docs/KNOWN_LIMITATIONS.md 명시). "명령"만 구현한다 - 둔화가
  // 아니라 "이동 불가"(기절/속박/제압/공중에 뜸/매혹)에 걸렸을 때만,
  // 대상이 챔피언이면 4초간 취약 표식(VULNERABLE 7%)을 남긴다. 같은
  // 표식을 다시 걸면 "중첩 없이 지속시간만 연장"(원문 그대로) - applyStatus가
  // 같은 id의 상태이상을 다시 걸면 자동으로 덮어써서 지속시간이 연장되므로
  // 별도 처리가 필요 없다.
  const mandateSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].commandPassive);
  const IMMOBILIZE_TYPES = ['STUN', 'ROOT', 'SUPPRESSION', 'KNOCKUP', 'CHARM']; // 둔화(SLOW) 제외
  if (mandateSlot && target && target.isChampion && IMMOBILIZE_TYPES.includes(effectType) && typeof applyStatus === 'function') {
    const p = ITEM_DATA[mandateSlot.id].commandPassive;
    applyStatus(target, { id: 'itemImperialMandateVulnerable', type: 'VULNERABLE', duration: p.durationSec, value: p.vulnerablePercent, source: ctrl });
    console.log('[ITEM] 제국의명령 - 명령 발동(취약 표식)');
  }
}

// 챔피언 처치 관여 시 중첩을 얻는 아이템들(암흑의 인장의 영광, 탐욕의
// 군화의 학살) - applyDamage()의 처형 판정 지점에서 호출한다. 어시스트는
// "아군 챔피언" 개념이 없는 이 데모 구조상 구현하지 않는다(item_data.js 주석 참고).
function itemOnChampionTakedown(ctrl) {
  if (!ctrl) return;
  let changed = false;
  // 버그 수정(메자이의 영혼약탈자 추가 전 QA): 이 블록이 'darkSeal' id로
  // 하드코딩돼 있었다 - 암흑의 인장을 메자이의 영혼약탈자로 조합(업그레이드)한
  // 뒤에는 인벤토리에 더 이상 'darkSeal'이 없으므로 이 조건이 항상
  // 거짓이 되어 처치해도 중첩이 전혀 쌓이지 않는 잠재 버그였다(지금까지는
  // gloryPassive를 가진 아이템이 암흑의 인장 하나뿐이라 드러나지 않았을
  // 뿐). gloryPassive 필드 보유 여부로 범용 탐색하고, 그 아이템 자신의
  // takedownStacks/maxStacks를 쓴다 - 메자이의 영혼약탈자(중첩당 5주문력,
  // 최대 25, 처치당 4)로 업그레이드해도 암흑의 인장 때 쌓인 중첩
  // (_itemGloryStacks, ctrl 레벨 상태라 조합해도 그대로 이어짐)이 자연스럽게
  // 이어지고, 더 커진 상한(25)까지 계속 쌓인다.
  const gloryItemSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].gloryPassive);
  if (gloryItemSlot) {
    const p = ITEM_DATA[gloryItemSlot.id].gloryPassive;
    ctrl._itemGloryStacks = Math.min(p.maxStacks, (ctrl._itemGloryStacks || 0) + p.takedownStacks);
    changed = true;
  }
  if (ctrl.boots && ctrl.boots.id === 'bootsOfGreed') {
    const p = ITEM_DATA.bootsOfGreed.slaughterPassive;
    ctrl._itemSlaughterStacks = Math.min(p.maxStacks, (ctrl._itemSlaughterStacks || 0) + 1);
    changed = true;
  }
  // 징수의 총(세금) - 챔피언 처치 시 추가 골드. 이 처형 판정 지점은
  // 학습용 더미의 "죽었어야 할 타격"도 똑같이 처치로 취급하므로(암흑의
  // 인장 영광과 동일한 기존 원칙), 더미를 상대로도 테스트/실제 플레이
  // 양쪽에서 똑같이 골드가 들어온다.
  const collectorSlot = (ctrl.items || []).find((s) => s.id === 'collector');
  if (collectorSlot) {
    ctrl.gold = (ctrl.gold || 0) + ITEM_DATA.collector.taxPassive.goldOnTakedown;
    if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  }
  // 요새파괴자(파괴 공작) - 처치 관여 시 90초간 "파괴 공작" 무장(다음
  // 포탑 기본 공격에서 소모 - itemOnBasicAttackHit() 참고).
  const fortressSlot = (ctrl.items || []).find((s) => s.id === 'fortressBreaker');
  if (fortressSlot) {
    ctrl._itemSabotageArmedUntil = performance.now() + ITEM_DATA.fortressBreaker.sabotagePassive.durationSec * 1000;
  }
  if (changed) recomputeItemStats(ctrl);
}

// 암흑의 인장(영광) - 사망 시 중첩 소실(_die()에서 호출). 죽음의무도
// (반항)의 "상대가 죽으면" 판정도 같은 진입점에서 함께 처리한다.
function itemOnChampionDeath(ctrl) {
  // 버그 수정: 위 itemOnChampionTakedown()과 동일한 이유로 'darkSeal'
  // 하드코딩을 없애고, 현재 들고 있는 gloryPassive 아이템(암흑의 인장
  // 또는 메자이의 영혼약탈자) 자신의 deathLossStacks를 쓴다. 이미 팔아서
  // 둘 다 없으면(중첩은 ctrl에 남아있어도) 사망 손실 자체를 적용하지
  // 않는다 - "어떤 아이템 기준으로 깎을지" 알 수 없는 상태이므로, 기존
  // "아이템을 팔아도 중첩은 남지만 스탯엔 더 이상 반영 안 됨" 원칙과
  // 동일하게 가장 보수적으로(그대로 둠) 처리한다.
  const gloryItemSlot = (ctrl && ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].gloryPassive);
  if (ctrl && ctrl._itemGloryStacks > 0 && gloryItemSlot) {
    const p = ITEM_DATA[gloryItemSlot.id].gloryPassive;
    ctrl._itemGloryStacks = Math.max(0, ctrl._itemGloryStacks - p.deathLossStacks);
    recomputeItemStats(ctrl);
  }
  // 아래 두 블록(반항/비전 조준)은 둘 다 "이 ctrl이 방금 죽었는데, 그
  // 전에 이 ctrl을 공격한 전역 controller가 있다면 반응한다"는 동일한
  // 구조라 공용으로 한 번만 가드를 계산해서 공유한다 - 버그 수정(이전
  // 버전): 반항 쪽에서 쓰던 `return`들이 함수 전체를 끝내버려서, 나중에
  // 추가한 비전 조준 로직이 전혀 실행되지 않는 문제가 있었다. 이제는
  // 가드를 통과하면 두 블록 모두 독립적으로(return 없이) 이어서 확인한다.
  const deadKey = ctrl ? _itemTargetKey(ctrl) : null;
  const hasAttackerContext = deadKey != null && typeof controller !== 'undefined' && controller && controller !== ctrl;

  // 죽음의무도(반항) - "피해를 입힌 챔피언이 3초 안에 죽으면" 그 지연
  // 피해가 사라지고 대신 추가 공격력 75%만큼 2초에 걸쳐 회복한다. 이
  // 프로젝트는 플레이어를 공격하는 적 AI가 없는 구조라(itemOnChampionTakedown
  // 위 주석 참고 - 어시스트와 동일한 성격의 한계) 실제 플레이로는 이
  // 조건이 발생하지 않지만, 향후 적 AI가 추가되면 자동으로 맞물리도록
  // 범용 훅으로 둔다. 지연 피해 자체가 정확히 3초(원문의 반항 판정
  // 시간과 동일)만 유지되므로, "아직 배열에 남아있다"는 것 자체가 곧
  // "3초 이내"라는 뜻이라 별도 타임스탬프 비교가 필요 없다.
  if (hasAttackerContext && controller._itemDeathsDanceDot && controller._itemDeathsDanceDot.length) {
    const before = controller._itemDeathsDanceDot.length;
    controller._itemDeathsDanceDot = controller._itemDeathsDanceDot.filter((d) => d.sourceKey !== deadKey);
    if (controller._itemDeathsDanceDot.length !== before) {
      const p = ITEM_DATA.deathsDance.defiancePassive;
      const healTotal = _itemBonusAD(controller) * p.healBonusAdPercent;
      if (healTotal > 0) {
        controller._itemActiveHeals = controller._itemActiveHeals || [];
        controller._itemActiveHeals.push({ perSec: healTotal / p.healDurationSec, remainingSec: p.healDurationSec });
      }
      console.log('[ITEM] 죽음의무도 - 반항 발동(지연 피해 제거 + 회복)');
    }
  }

  // 마법광학 장치 C44(비전 조준) - "피해를 입힌 챔피언이 3초 안에
  // 사망하면 8초 동안 사거리 +100". 위와 동일한 한계(적 AI 없음)를
  // 공유한다 - itemOnDamageDealt()가 기록해둔 _itemArcaneFocusTargets
  // 맵에서 이 ctrl(방금 죽은 대상)에 대한 기록이 아직 유효한지 확인한다.
  if (hasAttackerContext && controller._itemArcaneFocusTargets) {
    const expiresAt = controller._itemArcaneFocusTargets.get(deadKey);
    if (typeof expiresAt === 'number' && performance.now() <= expiresAt) {
      controller._itemArcaneFocusTargets.delete(deadKey);
      const p = ITEM_DATA.magicOpticsC44.arcaneFocusPassive;
      controller._itemTempAttackRangeBonusLol = Math.max(controller._itemTempAttackRangeBonusLol || 0, p.bonusRangeLol);
      controller._itemTempAttackRangeExpiresAt = Math.max(controller._itemTempAttackRangeExpiresAt || 0, performance.now() + p.bonusDurationSec * 1000);
      console.log('[ITEM] 마법광학 장치 C44 - 비전 조준 발동(사거리 증가)');
    }
  }

  // 오만(명성) - 피해를 입힌 챔피언이 3초 안에 죽으면 90초간 공격력
  // 증가, 처치할 때마다 "처치한 챔피언 하나당 3"만큼 더 쌓인다(기존
  // 90초 창을 다시 90초로 늘려서 연속 처치 시 계속 이어지게 한다).
  if (hasAttackerContext && controller._itemHubrisTargets) {
    const expiresAt = controller._itemHubrisTargets.get(deadKey);
    if (typeof expiresAt === 'number' && performance.now() <= expiresAt) {
      controller._itemHubrisTargets.delete(deadKey);
      const p = ITEM_DATA.hubris.renownPassive;
      controller._itemHubrisKillCount = (controller._itemHubrisKillCount || 0) + 1;
      controller.itemTempADBonus = p.baseAD + p.adPerKill * controller._itemHubrisKillCount;
      controller._itemHubrisExpiresAt = performance.now() + p.durationSec * 1000;
      controller.recomputeStats();
      console.log('[ITEM] 오만 - 명성 발동(공격력 증가, 처치 ' + controller._itemHubrisKillCount + '회)');
    }
  }

  // 끝없는 갈망(포식) - 위 오만(명성)과 완전히 동일한 구조(피해를 입힌
  // 챔피언이 3초 안에 죽으면 8초간 전능 흡혈 15%).
  if (hasAttackerContext && controller._itemEternalThirstTargets) {
    const expiresAt = controller._itemEternalThirstTargets.get(deadKey);
    if (typeof expiresAt === 'number' && performance.now() <= expiresAt) {
      controller._itemEternalThirstTargets.delete(deadKey);
      const p = ITEM_DATA.eternalThirst.feastPassive;
      controller._itemFeastOmnivampUntil = performance.now() + p.durationSec * 1000;
      console.log('[ITEM] 끝없는 갈망 - 포식 발동(전능 흡혈 증가)');
    }
  }
}

// 수호천사 - 환생. takeDamage()에서 "이번 피해로 hp가 0 이하가 됐다"고
// 판정된 직후, _die()를 부르기 "직전"에 호출한다(치명적 피해 1회만
// 가로채는 구조 - 리메이크 전 "치명적 피해를 막는" 아이템들과 동일한
// 지점). 쿨다운 안이거나 아이템이 없으면 false를 반환해 평소처럼 죽는다.
function itemOnLethalDamage(ctrl) {
  if (!ctrl) return false;
  const slot = (ctrl.items || []).find((s) => s.id === 'guardianAngel');
  if (!slot) return false;
  const p = ITEM_DATA.guardianAngel.revivePassive;
  const now = performance.now();
  if ((ctrl._itemGuardianAngelIcdUntil || 0) > now) return false;
  ctrl._itemGuardianAngelIcdUntil = now + p.icdSec * 1000;
  // 경직 - 기존 isUntargetable(알파 스트라이크 등 다른 챔피언이 이미
  // 쓰던 "모든 피격 판정에서 확인" 플래그)을 그대로 재사용하면 추가
  // 무적/대상 지정 불가 코드를 새로 짤 필요가 없다(takeDamage() 맨 위의
  // `if (this.isUntargetable) return;`). hp를 0으로 두면 다른 곳에서
  // "이미 죽었다"고 오해할 수 있어 1로 고정해둔다.
  ctrl.hp = 1;
  ctrl.isUntargetable = true;
  ctrl._itemGuardianAngelStasisUntil = now + p.stasisDurationSec * 1000;
  console.log('[ITEM] 수호천사 - 환생 발동(경직 시작)');
  return true;
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
// 크라켄 학살자(벼락)에서 처음 쓴 "레벨 구간(levelMin~levelMax)에 선형
// 비례" 패턴을 공용 함수로 뽑아낸다 - 경계(빛과 어둠)/불멸의 철갑궁
// (생명선)/피바라기(영액의 보호막)도 전부 같은 모양의 레벨 성장 수치를
// 쓴다. 구간 밖(레벨 미만/초과)은 각각 경계값으로 고정(클램프)한다.
function _itemScaleByLevel(ctrl, a, b, levelMin, levelMax) {
  const level = Math.max(levelMin, Math.min(levelMax, (ctrl && ctrl.champLevel) || levelMin));
  const t = (level - levelMin) / (levelMax - levelMin);
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

// 사정거리 clamp(목표 지점이 설치 사정거리 밖이면 실제 LoL처럼 그 방향
// 최대 사거리에 놓는다) - 투명 와드/제어 와드가 공용으로 쓴다.
function _clampWardTargetPos(ctrl, worldPoint, placeRangeLol) {
  const origin = ctrl.root.position;
  const maxWorldRange = lolRangeToWorld(placeRangeLol);
  const dir = new THREE.Vector3().subVectors(worldPoint, origin);
  dir.y = 0;
  const dist = dir.length();
  const finalPos = dist > maxWorldRange && dist > 0
    ? origin.clone().add(dir.normalize().multiplyScalar(maxWorldRange))
    : worldPoint.clone();
  finalPos.y = 0;
  return finalPos;
}
// 시야 부여 + 지상 마커 메시 생성 + ctrl._placedWards 등록 - 투명 와드/
// 제어 와드가 공용으로 쓴다(색만 다르게 해서 구분 - 제어 와드는 실제
// LoL처럼 분홍색 계열).
function _spawnWardMarker(ctrl, finalPos, durationSec, hitsToDestroy, visionRadius, colorHex) {
  if (typeof visionSystem !== 'undefined' && visionSystem) visionSystem.grantVision(finalPos, visionRadius, durationSec);
  const ward = { position: finalPos.clone(), hitsRemaining: hitsToDestroy, expiresAt: performance.now() + durationSec * 1000, mesh: null };
  if (typeof scene !== 'undefined' && typeof THREE !== 'undefined') {
    const geo = new THREE.ConeGeometry(lolRangeToWorld(26), lolRangeToWorld(55), 6);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85 });
    ward.mesh = new THREE.Mesh(geo, mat);
    ward.mesh.position.copy(finalPos);
    ward.mesh.position.y = lolRangeToWorld(27);
    scene.add(ward.mesh);
  }
  ctrl._placedWards = ctrl._placedWards || [];
  ctrl._placedWards.push(ward);
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

  const finalPos = _clampWardTargetPos(ctrl, worldPoint, data.placeRange);
  ctrl.trinket.charges -= 1;
  const durationSec = _itemScaleByGameTime(data.wardDurationEarlySec, data.wardDurationLateSec, data.scaleFullAtSec);
  _spawnWardMarker(ctrl, finalPos, durationSec, data.hitsToDestroy, data.visionRadius, 0x3fae6a);
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  console.log(`[WARD] 투명 와드 설치 (지속시간 ${durationSec.toFixed(0)}초, 남은 충전 ${ctrl.trinket.charges}/${data.maxCharges})`);
  return true;
}

// 제어 와드 설치 - useItem()에서 호출된다. 숫자키/인벤토리 클릭 둘 다
// "클릭 시점의 마우스 월드 좌표"를 넘길 방법이 없으므로(useItem(ctrl,
// slotIndex)는 슬롯 번호만 받는 공용 진입점 - 체력 물약 등 다른 소비
// 아이템과 동일한 호출 규약을 그대로 따른다), 트린켓의 인벤토리 클릭
// 폴백과 동일하게 "캐릭터 정면"에 설치한다.
// 버그 수정 전까지는 wardPlacement를 가진 아이템이 전부 제어 와드처럼
// "소모되면 인벤토리 칸에서 완전히 사라지는" slot.count(maxStack) 방식
// 하나만 지원했다. 서포터 아이템 계열(세계지도집/룬 나침반/세계의 결실 +
// 5종 업그레이드)의 와드는 "충전량 N회, 상점 이용 시 재충전"(체력 물약과
// 동일한 maxCharges+refillOnShopUse 패턴)이라 그대로 재사용하면 slot.count가
// undefined라서 와드가 무한정 나가는 잠재 버그가 될 뻔했다 - item.maxCharges
// 보유 여부로 두 소모 방식을 분기한다(제어 와드 등 기존 maxStack 아이템은
// 동작이 전혀 바뀌지 않는다 - 회귀 없음).
function _useControlWard(ctrl, slotIndex, item) {
  const slot = ctrl.items && ctrl.items[slotIndex];
  if (!slot || slot.id !== item.id) return false;
  if (item.maxCharges && !(slot.charges > 0)) { console.warn('[ITEM] 충전량이 없습니다.'); return false; }
  const p = item.wardPlacement;
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ctrl.root.quaternion);
  const targetPoint = ctrl.root.position.clone().add(forward.multiplyScalar(lolRangeToWorld(300)));
  const finalPos = _clampWardTargetPos(ctrl, targetPoint, p.placeRange);
  if (item.maxCharges) {
    slot.charges -= 1;
  } else {
    slot.count -= 1;
    if (slot.count <= 0) {
      const idx = ctrl.items.indexOf(slot);
      if (idx >= 0) ctrl.items.splice(idx, 1);
    }
  }
  _spawnWardMarker(ctrl, finalPos, p.durationSec, p.hitsToDestroy, p.visionRadius, 0xd23fae);
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  console.log(`[WARD] 제어 와드 설치 (${item.nameKo})`);
  return true;
}

/* ============================================================
   영약(소모품) - 강철/마법/분노 3종. "다른 종류의 영약을 마시면 기존
   영약의 효과가 사라집니다"(원문) - ctrl._itemActiveElixir 하나로
   어떤 영약이 켜져 있는지 관리하고, 다른 종류를 마시면 그 자리에서
   교체한다. 스탯(체력/공격력/주문력/마나 재생/강인함)은
   recomputeItemStats()가 매번 마지막에 한 번 더해 넣고(아래), 적중 시
   효과(마법의 영약 고정 피해/분노의 영약 챔피언 전용 흡혈)는
   itemOnDamageDealt()에 훅을 추가했다.
   ============================================================ */
function _useElixir(ctrl, slotIndex, item) {
  const slot = ctrl.items && ctrl.items[slotIndex];
  if (!slot || slot.id !== item.id) return false;
  // 소모 - 중첩/충전 없이 1회 사용으로 인벤토리에서 완전히 사라진다.
  const idx = ctrl.items.indexOf(slot);
  if (idx >= 0) ctrl.items.splice(idx, 1);
  ctrl._itemActiveElixir = { id: item.id, expiresAt: performance.now() + item.elixirEffect.durationSec * 1000, sorceryIcdUntil: 0 };
  recomputeItemStats(ctrl);
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  console.log(`[ITEM] ${item.nameKo} 사용 (${item.elixirEffect.durationSec}초)`);
  return true;
}
// 지속시간 만료 - itemSystemTick()에서 매 프레임 확인한다(인벤토리
// 아이템 배열과 무관한 별도 상태라 그 루프 밖에서 따로 처리해야 한다).
function _itemTickElixirExpiry(ctrl) {
  if (!ctrl._itemActiveElixir) return;
  if (performance.now() < ctrl._itemActiveElixir.expiresAt) return;
  console.log(`[ITEM] ${ITEM_DATA[ctrl._itemActiveElixir.id].nameKo} 효과 종료`);
  ctrl._itemActiveElixir = null;
  recomputeItemStats(ctrl);
}

/* ============================================================
   서사급 아이템 1차분 전용 공용 훅(광휘의 검/티아맷) - 둘 다
   character_controller.js의 기존 공용 지점(_onBasicAttackHit/
   _dispatchCast) 하나에서만 호출되므로, 어떤 챔피언이 들고 있어도
   자동으로 동작한다.
   ============================================================ */

// 주문 검(스펠블레이드)을 가진 아이템 - 광휘의 검 또는 삼위일체(삼위일체는
// 광휘의 검을 하위템으로 먹으므로 실제로는 둘 중 하나만 인벤토리에 있다).
function _itemSpellbladeSlot(ctrl) {
  return (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].spellbladePassive);
}
// 리치베인 - "주문 검을 사용 가능할 때 50%의 공격 속도를 얻습니다."
// 스펠블레이드가 "무장된(armed) 동안만" 켜지는 임시 버프라 영구 스탯
// (itemBonusAttackSpeedPercent)과 분리해, character_controller.js의
// update()가 매 프레임 호출해 공격속도에 직접 더한다(가속/감속 상태처럼
// 지속시간을 따로 관리할 필요 없이, 무장이 풀리는 순간 자동으로 0이 된다).
function itemSpellbladeReadyAttackSpeedPercent(ctrl) {
  if (!ctrl || !ctrl._itemSheenArmed) return 0;
  const slot = _itemSpellbladeSlot(ctrl);
  if (!slot) return 0;
  return ITEM_DATA[slot.id].spellbladePassive.attackSpeedWhileReadyPercent || 0;
}
// _dispatchCast()에서 호출 - 스킬을 시전하면 주문 검(스펠블레이드)을
// 무장시킨다(자체 1.5초 쿨다운 - 연속 시전해도 그보다 자주 재무장되지
// 않는다).
function itemOnAbilityDispatch(ctrl) {
  const slot = _itemSpellbladeSlot(ctrl);
  if (!slot) return;
  const p = ITEM_DATA[slot.id].spellbladePassive;
  const now = performance.now();
  if ((ctrl._itemSheenReadyAt || 0) > now) return;
  ctrl._itemSheenReadyAt = now + p.procCooldownSec * 1000;
  ctrl._itemSheenArmed = true;
}

// 전설급 아이템들의 "적 챔피언" 식별 키 - Map 기반 중첩/쿨다운 추적에 쓴다
// (야스오 E의 eTargetCooldowns가 이미 쓰던 것과 동일한 패턴).
function _itemTargetKey(t) { return (t && (t.id || t.uuid)) || t; }
// "추가 공격력"(아이템/챔피언 전용 임시 버프로 얻은 AD, 기본 AD 제외) -
// 이 프로젝트엔 챔피언 기본 AD만 따로 캐시해두는 필드가 없어, 아이템
// AD(itemBonusAD)와 챔피언 전용 임시 버프(bonusAD) 합으로 근사한다.
function _itemBonusAD(ctrl) { return (ctrl.itemBonusAD || 0) + (ctrl.bonusAD || 0); }
function _itemIsMelee(ctrl) { return !!(ctrl.stats && ctrl.stats.attackRange <= 300); }
function _itemIsStructure(u) { return !!(u && (u.isTurret || u.isInhibitor || u.isNexus)); }

// 서포터 아이템(세계지도집 퀘스트 라인) 공용 골드 지급 - 재물 공유(피해/
// 미니언 처형)와 10초당 골드(goldPerIntervalPassive)가 전부 이 함수 하나를
// 거친다. item.questPassive가 있으면(세계지도집/룬 나침반) 이 아이템
// "자신"으로 번 골드만 누적해서(일반 골드 전체가 아님 - 원문 "이 아이템으로
// 400골드를 획득하면") 문턱에 도달하는 순간 다음 단계로 변신시킨다.
function _itemGrantSupportGold(ctrl, slot, item, amount) {
  if (!(amount > 0)) return;
  ctrl.gold = (ctrl.gold || 0) + amount;
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (!item.questPassive) return;
  ctrl._itemQuestGoldEarned = (ctrl._itemQuestGoldEarned || 0) + amount;
  if (ctrl._itemQuestGoldEarned < item.questPassive.goldThreshold) return;
  const toId = item.questPassive.transformsInto;
  const toItem = ITEM_DATA[toId];
  if (!toItem) return;
  slot.id = toId;
  ctrl._itemQuestGoldEarned = 0;
  // 다음 단계가 충전형 와드를 가진 아이템이면(룬나침반/세계의 결실) 변신
  // 즉시 충전을 가득 채운다 - 실제 LoL도 퀘스트 완료로 받은 새 아이템은
  // 바로 쓸 수 있는 상태로 지급된다(상점 재방문을 기다릴 필요 없음).
  if (toItem.maxCharges) slot.charges = toItem.maxCharges;
  recomputeItemStats(ctrl);
  if (typeof updateItemUI === 'function') updateItemUI(ctrl);
  console.log(`[ITEM] ${item.nameKo} -> ${toItem.nameKo} 퀘스트 완료(변신)`);
}

// 거대한히드라/발걸음분쇄기 공용 "쪼개기" - 대상에게 자신의 최대 체력
// 비례 추가 물리 피해 + "대상 뒤의 적들"에게 더 센 최대 체력 비례 물리
// 피해(실제 LoL 거대한히드라도 대상이 아니라 "자신의" 최대 체력이 기준).
// 방향성("대상 뒤")은 이 프로젝트에 적 전용 좌표/진행 방향 판정이 없어
// 티아맷 쪼개기와 동일한 "주변 반경" 판정으로 근사한다(명시적 근사).
// 구조물에는 적용하지 않는다(원문: "구조물에는 쪼개기의 충격파가 발동되지
// 않습니다"). 거대한히드라의 "거대한 초승달"이 무장돼 있으면 다음 쪼개기
// 한 번만 수치를 강화하고 소모한다.
function _itemCleaveOnHit(ctrl, target) {
  if (!target || _itemIsStructure(target)) return;
  const slot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].cleaveMaxHpPassive);
  if (!slot) return;
  const item = ITEM_DATA[slot.id];
  const p = item.cleaveMaxHpPassive;
  const isMelee = _itemIsMelee(ctrl);
  let targetPercent = isMelee ? p.meleeTargetPercent : p.rangedTargetPercent;
  let splashPercent = isMelee ? p.meleeSplashPercent : p.rangedSplashPercent;
  if (ctrl._itemEmpoweredCleaveArmed && item.empoweredCleaveActive) {
    ctrl._itemEmpoweredCleaveArmed = false;
    const ep = item.empoweredCleaveActive;
    targetPercent += isMelee ? ep.meleeTargetBonusPercent : ep.rangedTargetBonusPercent;
    splashPercent += isMelee ? ep.meleeSplashBonusPercent : ep.rangedSplashBonusPercent;
  }
  const basis = ctrl.maxHp || 0;
  const targetRaw = targetPercent * basis;
  if (targetRaw > 0) applyDamage(target, { rawDamage: targetRaw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  const splashRaw = splashPercent * basis;
  if (splashRaw > 0 && typeof findEnemiesInRadius === 'function') {
    const hits = findEnemiesInRadius(target.mesh ? target.mesh.position : ctrl.root.position, p.radius);
    for (const { unit } of hits) {
      if (!unit || unit === target || unit.hp <= 0 || _itemIsStructure(unit)) continue;
      applyDamage(unit, { rawDamage: splashRaw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    }
  }
}

// _onBasicAttackHit()에서 호출 - 광휘의 검/삼위일체가 무장돼 있으면
// 소모하며 추가 물리 피해를 입히고, 티아맷을 들고 있으면 매 평타마다
// 주변 적에게 쪼개기(물리 피해)를 입힌다. 대상 종류를 가리지 않는
// applyDamage()를 그대로 써서 미니언/포탑에도 자동으로 맞는 피해로 들어간다.
// 전설급 2차분(삼위일체~지배자의 피갑옷) 추가분은 이 함수 끝에 이어붙였다 -
// 이 훅은 메인 평타의 applyDamage()가 이미 끝난 "뒤"에 불리므로, 안에서
// 다시 applyDamage()를 호출해도 무한 재귀가 생기지 않는다(기존 광휘의
// 검/티아맷과 동일한 안전 지점 - item_data.js 상단 주석 참고).
function itemOnBasicAttackHit(ctrl, target, isCritical) {
  // 세계지도집/룬 나침반(재물 공유 - 미니언 처형) - "일정 체력(근거리
  // 챔피언은 50%, 원거리 챔피언은 30%) 이하인 미니언을 평타로 치면 스택을
  // 하나 소모하여 골드를 같이 받는다"(원문 93~95줄). 위 itemOnDamageDealt()의
  // 챔피언/구조물 피해 지급과 같은 충전 풀을 공유한다.
  const spoilsSlotA = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].spoilsOfWarPassive);
  if (spoilsSlotA && target.isMinion && (ctrl._itemSpoilsCharges || 0) > 0) {
    const item = ITEM_DATA[spoilsSlotA.id];
    const p = item.spoilsOfWarPassive;
    const threshold = _itemIsMelee(ctrl) ? p.minionHpThresholdMelee : p.minionHpThresholdRanged;
    if ((target.hp / (target.maxHp || 1)) <= threshold) {
      ctrl._itemSpoilsCharges -= 1;
      _itemGrantSupportGold(ctrl, spoilsSlotA, item, p.minionGold);
      console.log(`[ITEM] ${item.nameKo} - 재물 공유 발동(미니언 처형, +${p.minionGold}골드)`);
    }
  }
  // 강철심장(거인의 흡수) - 충전이 끝난 상태에서, 충전을 시작했던 바로 그
  // 대상을 기본 공격으로 맞히면 70+체력6% 추가 물리 피해 + 그 피해의 10%만큼
  // 영구 최대 체력 획득(대상별 재사용대기시간 30초).
  if (ctrl._itemHeartsteelReady && _itemTargetKey(target) === ctrl._itemHeartsteelReadyTargetKey) {
    ctrl._itemHeartsteelReady = false; ctrl._itemHeartsteelProgress = 0; ctrl._itemHeartsteelChargeTarget = null;
    const p = ITEM_DATA.heartsteel.giantAbsorbPassive;
    const bonusDmg = p.flatDmg + (ctrl.maxHp || 0) * p.bonusHpPercent;
    applyDamage(target, { rawDamage: bonusDmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    // 영구 최대 체력 획득분은 암흑의 인장 영광/영겁의지팡이 불멸의 시간과
    // 동일한 패턴 - 중첩 상태(_itemHeartsteelPermanentHpGain)를 따로 저장해두고
    // recomputeItemStats()의 applyOne()이 매번 다시 더해 넣는다(여기서
    // itemBonusMaxHp를 직접 건드리면 다음 recomputeItemStats() 호출 때
    // 통째로 리셋되어 사라진다).
    ctrl._itemHeartsteelPermanentHpGain = (ctrl._itemHeartsteelPermanentHpGain || 0) + bonusDmg * p.maxHpGainPercent;
    recomputeItemStats(ctrl);
    ctrl._itemHeartsteelIcdUntil = ctrl._itemHeartsteelIcdUntil || {};
    ctrl._itemHeartsteelIcdUntil[ctrl._itemHeartsteelReadyTargetKey] = performance.now() + p.icdSec * 1000;
    console.log('[ITEM] 강철심장 - 거인의 흡수 발동');
  }
  if (ctrl._itemSheenArmed) {
    ctrl._itemSheenArmed = false;
    const spellbladeSlot = _itemSpellbladeSlot(ctrl);
    if (spellbladeSlot) {
      const p = ITEM_DATA[spellbladeSlot.id].spellbladePassive;
      // 버그 수정(QA - "주문 검과 주문검 상위템 시리즈" 재점검): 원문을 다시
      // 확인해보니 삼위일체("기본 공격력 200%")/정수약탈자("기본공격력 125%
      // + 기본공격력 63%")/황혼과새벽("기본공격력 75%")/리치베인("기본공격력
      // 75%")/피의 노래("기본공격력 100%") 전부 예외 없이 "기본공격력"(base
      // AD, 아이템으로 늘어난 보너스 공격력 제외)을 쓰는데, 지금까지는
      // ctrl.stats.attackDamage(현재 "총" 공격력)를 그대로 곱하고 있었다 -
      // 즉 삼위일체/정수약탈자/황혼과새벽/리치베인 4종 전부 공격력 아이템을
      // 더 살수록 스펠블레이드 피해까지 같이 부풀려지는 잘못된 동작이었다.
      // 스테락의도전 "잡아채는 발톱"/경탄(마나무네)과 동일한 이유로
      // computeChampionStats()에서 레벨별 기본 공격력을 다시 구해 쓴다.
      const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
      const baseAd = (baseStats && typeof baseStats.attackDamage === 'number') ? baseStats.attackDamage : (ctrl.stats.attackDamage || 0);
      // 정수약탈자 - 삼위일체(순수 AD%)와 달리 치명타 확률에도 비례하는
      // 추가 항(bonusPerCritChance/manaPerCritChance)이 있다. 기존
      // 아이템들은 이 필드가 없어(undefined -> 0) 그대로 동작한다.
      // 황혼과새벽/리치베인(주문력 계열 스펠블레이드) - bonusApPercent와
      // damageType(기본 PHYSICAL, 둘 다 'MAGICAL')을 추가했다. 기존 AD
      // 스펠블레이드 아이템들은 이 필드들이 없어(undefined -> 0/기본값)
      // 그대로 동작한다(회귀 없음).
      const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
      const bonus = p.bonusAdPercent * baseAd + (p.bonusApPercent || 0) * ap + (p.bonusPerCritChance || 0) * (ctrl.stats.critChance || 0);
      const dmgType = p.damageType === 'MAGICAL' ? DAMAGE_TYPE.MAGICAL : DAMAGE_TYPE.PHYSICAL;
      if (bonus > 0) {
        // 황혼과새벽(주문 검) - "적중 시 효과를 추가로 1회 적용합니다"를
        // 이 피해 자체가 한 번 더 들어가는 것으로 단순화했다(item_data.js
        // 주석 참고) - extraProc이 없는 기존 아이템은 1회만 적용된다.
        const procs = p.extraProc ? 2 : 1;
        for (let i = 0; i < procs; i++) applyDamage(target, { rawDamage: bonus, damageType: dmgType, isCritical: false, critMultiplier: 1, source: ctrl });
      }
      if ((p.manaAdPercent || p.manaPerCritChance) && (ctrl.maxMp || 0) > 0) {
        const manaGain = (p.manaAdPercent || 0) * baseAd + (p.manaPerCritChance || 0) * (ctrl.stats.critChance || 0);
        if (manaGain > 0) ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + manaGain);
      }
      // 피의 노래(약점 노출) - 대상이 챔피언일 경우 4초간 받는 피해량 증가
      // (근접 8%｜원거리 5%). 기존 피해량 증폭 상태이상(쇼진의창의
      // itemSpellDamageAmpPercent는 "자신이 주는" 피해 증폭이라 달라서,
      // "대상이 받는" 피해 증폭은 새 상태이상 타입(VULNERABLE)을 쓴다.
      if (p.exposeWeaknessPassive && target.isChampion && typeof applyStatus === 'function') {
        const ew = p.exposeWeaknessPassive;
        const isMelee = _itemIsMelee(ctrl);
        applyStatus(target, { id: 'itemBloodsongExposeWeakness', type: 'VULNERABLE', duration: ew.durationSec, value: isMelee ? ew.meleePercent : ew.rangedPercent, source: ctrl });
      }
      // 황혼과새벽 - "사용자의 체력을 (주문력10%+추가체력3%)만큼 회복".
      if (p.healApPercent || p.healBonusHpPercent) {
        const bonusHp = (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0);
        const heal = (p.healApPercent || 0) * ap + (p.healBonusHpPercent || 0) * bonusHp;
        if (heal > 0 && typeof ctrl.hp === 'number' && typeof ctrl.maxHp === 'number') ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + heal);
      }
    }
  }
  const tiamatSlot = (ctrl.items || []).find((s) => s.id === 'tiamat');
  if (tiamatSlot && !_itemIsStructure(target)) {
    const p = ITEM_DATA.tiamat.cleavePassive;
    const isMelee = _itemIsMelee(ctrl);
    const raw = (isMelee ? p.meleePercent : p.rangedPercent) * (ctrl.stats.attackDamage || 0);
    if (raw > 0 && typeof findEnemiesInRadius === 'function') {
      const hits = findEnemiesInRadius(target.mesh ? target.mesh.position : ctrl.root.position, p.radius);
      for (const { unit } of hits) {
        if (!unit || unit === target || unit.hp <= 0 || unit.isTurret || unit.isInhibitor || unit.isNexus) continue;
        applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
      }
    }
  }

  // 거대한히드라/발걸음분쇄기 공용 "쪼개기" - 티아맷 쪼개기와 별개 필드
  // (cleaveMaxHpPassive, 대상이 아니라 "자신의" 최대 체력 비례 - 실제
  // 거대한히드라도 자기 최대 체력 기준이다).
  _itemCleaveOnHit(ctrl, target);

  // 가속(삼위일체)/분노(탐식의 망치) - 기본 공격 시 2초간 이동속도
  // +20(고정 수치) - MS_BUFF_FLAT 재사용. 대상 제한 없음(원문 그대로).
  const msFlatSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].onHitMoveSpeedFlatPassive);
  if (msFlatSlot && typeof applyStatus === 'function') {
    const p = ITEM_DATA[msFlatSlot.id].onHitMoveSpeedFlatPassive;
    applyStatus(ctrl, { id: 'itemOnHitMsFlat', type: 'MS_BUFF_FLAT', duration: p.durationSec, value: p.amount });
  }
  // 곡궁(독침)/마법사의 최후(쪼기) - 기본 공격 시 고정 추가 피해(적중 시 효과).
  // 버그 수정(QA 재점검 - 4차분에서 찾은 것과 동일한 종류): 원문("기본
  // 공격 시 15의 물리 피해") 어디에도 "구조물 제외" 언급이 없는데 구조물
  // 제외 가드가 들어가 있었다 - 포탑 대상에도 그대로 적용되게 고친다.
  const onHitPhysSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && typeof ITEM_DATA[s.id].onHitFlatPhysicalPassive === 'number');
  if (onHitPhysSlot) {
    applyDamage(target, { rawDamage: ITEM_DATA[onHitPhysSlot.id].onHitFlatPhysicalPassive, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  }
  // 버그 수정: 마법사의 최후(쪼기)도 원문에 구조물 제외 언급이 없다 -
  // 동일하게 제거한다(구인수의 격노검 "분노"도 같은 필드를 공유하므로
  // 같이 적용된다 - 원문에도 역시 구조물 제외가 없음).
  const onHitMagicSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && typeof ITEM_DATA[s.id].onHitFlatMagicDamage === 'number');
  if (onHitMagicSlot) {
    const flatMagic = ITEM_DATA[onHitMagicSlot.id].onHitFlatMagicDamage;
    applyDamage(target, { rawDamage: flatMagic, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    // 구인수의 격노검(들끓는 일격) - 최대 중첩(4, 공격속도 32%) 도달 시
    // 3번째 기본 공격마다 "분노"(위에서 이미 적용한 고정 마법 피해)를
    // 한 번 더 입힌다. 다른 아이템(마법사의 최후 등)은 ragingBlowsPassive가
    // 없어 이 블록이 전혀 실행되지 않는다.
    if (ITEM_DATA[onHitMagicSlot.id].ragingBlowsPassive) {
      const rp = ITEM_DATA[onHitMagicSlot.id].ragingBlowsPassive;
      const now = performance.now();
      const stacksKey = 'itemWrathbladeAS';
      const existing = (ctrl.statusEffects || []).find((e) => e.id === stacksKey && e.expiresAt > now);
      const prevStacks = existing ? Math.round(existing.value / rp.asPerStack) : 0;
      const newStacks = Math.min(rp.maxStacks, prevStacks + 1);
      if (typeof applyStatus === 'function') {
        // AS 스택 지속시간이 원문에 없다(durationGuessed) - 다른 짧은
        // 온히트 버프와 비슷한 4초로 근사, 재적중 시 갱신된다.
        applyStatus(ctrl, { id: stacksKey, type: 'AS_BUFF', duration: 4.0, durationGuessed: true, value: newStacks * rp.asPerStack });
      }
      if (newStacks >= rp.maxStacks) {
        ctrl._itemWrathbladeMaxStackHits = (ctrl._itemWrathbladeMaxStackHits || 0) + 1;
        if (ctrl._itemWrathbladeMaxStackHits >= rp.doubleProcHitsNeeded) {
          ctrl._itemWrathbladeMaxStackHits = 0;
          applyDamage(target, { rawDamage: flatMagic, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
        }
      } else {
        ctrl._itemWrathbladeMaxStackHits = 0; // 최대 중첩이 풀리면(공격 공백) 카운트도 초기화
      }
    }
  }
  // 내셔의이빨(이케시아의 이빨) - 기본 공격 시 15+주문력15% 온히트 마법
  // 피해. 기존 onHitFlatMagicDamage(순수 숫자)와 달리 주문력 비례가 있어
  // 별도 객체 필드(onHitMagicDamagePassive)로 둔다 - 원문에 구조물 제외
  // 언급이 없어 제외하지 않는다.
  const onHitMagicApSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].onHitMagicDamagePassive);
  if (onHitMagicApSlot) {
    const p = ITEM_DATA[onHitMagicApSlot.id].onHitMagicDamagePassive;
    const ap = (ctrl.stats && ctrl.stats.abilityPower) || 0;
    applyDamage(target, { rawDamage: p.flat + ap * p.apPercent, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  }
  // 경계(그림자) - 기본 공격 시 고정+추가공격력%+주문력% 온히트 마법 피해.
  // 버그 수정(QA 재점검): 원문에 구조물 제외 언급이 없는데 다른 코드를
  // 베끼면서 구조물 제외 가드가 들어가 있었다 - 제거한다.
  const hybridSlot = (ctrl.items || []).find((s) => s.id === 'vigilance');
  if (hybridSlot) {
    const p = ITEM_DATA.vigilance.onHitHybridPassive;
    const raw = p.flat + _itemBonusAD(ctrl) * p.bonusAdPercent + (ctrl.stats.abilityPower || 0) * p.apPercent;
    if (raw > 0) applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  }
  // 경계(빛과 어둠) - 챔피언 상대 기본 공격마다 빛/어둠을 번갈아 적용하고
  // 각각 최대 3중첩까지 쌓인다(만료되면 다음 적용 때 1부터 다시 시작).
  if (hybridSlot && target.isChampion) {
    const now = performance.now();
    const lp = ITEM_DATA.vigilance.lightDarkPassive;
    ctrl._itemSentinelNextLight = ctrl._itemSentinelNextLight !== false; // 최초 호출은 빛부터
    if (ctrl._itemSentinelNextLight) {
      if (now >= (ctrl._itemSentinelLightExpiresAt || 0)) ctrl._itemSentinelLightStacks = 0;
      ctrl._itemSentinelLightStacks = Math.min(lp.maxStacks, (ctrl._itemSentinelLightStacks || 0) + 1);
      ctrl._itemSentinelLightExpiresAt = now + lp.durationSec * 1000;
      const perStack = _itemScaleByLevel(ctrl, lp.lightArmorMrMin, lp.lightArmorMrMax, lp.levelMin, lp.levelMax);
      ctrl.itemTempArmorBonus = perStack * ctrl._itemSentinelLightStacks;
      ctrl.itemTempMrBonus = perStack * ctrl._itemSentinelLightStacks;
      ctrl.recomputeStats();
    } else {
      if (now >= (ctrl._itemSentinelDarkExpiresAt || 0)) ctrl._itemSentinelDarkStacks = 0;
      ctrl._itemSentinelDarkStacks = Math.min(lp.maxStacks, (ctrl._itemSentinelDarkStacks || 0) + 1);
      ctrl._itemSentinelDarkExpiresAt = now + lp.durationSec * 1000;
      const pen = lp.darkPenPercentPerStack * ctrl._itemSentinelDarkStacks;
      ctrl.itemTempArmorPenPercent = pen;
      ctrl.itemTempMagicPenPercent = pen;
    }
    ctrl._itemSentinelNextLight = !ctrl._itemSentinelNextLight;
  }

  // 몰락한 왕의 검 - 안개의 검(적 현재 체력 비례 물리 피해, 미니언/정글
  // 몬스터는 최대 100으로 캡) + 할퀴는 그림자(챔피언 3회 피격 시 둔화,
  // 효과 자체는 15초 재사용대기시간).
  const botrkSlot = (ctrl.items || []).find((s) => s.id === 'bladeOfTheRuinedKing');
  if (botrkSlot && !_itemIsStructure(target)) {
    const p = ITEM_DATA.bladeOfTheRuinedKing.mistsEdgePassive;
    const isMelee = _itemIsMelee(ctrl);
    let raw = (isMelee ? p.meleePercentCurrentHp : p.rangedPercentCurrentHp) * (target.hp || 0);
    if (!target.isChampion) raw = Math.min(raw, p.nonChampionCap);
    if (raw > 0) applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    if (target.isChampion) {
      const sp = ITEM_DATA.bladeOfTheRuinedKing.scurryingStrikePassive;
      ctrl._itemBotrkHitCounts = ctrl._itemBotrkHitCounts || new Map();
      const key = _itemTargetKey(target);
      const count = (ctrl._itemBotrkHitCounts.get(key) || 0) + 1;
      if (count >= sp.hitsNeeded) {
        ctrl._itemBotrkHitCounts.set(key, 0);
        const now = performance.now();
        if ((ctrl._itemBotrkSlowIcdUntil || 0) <= now && typeof applyStatus === 'function') {
          ctrl._itemBotrkSlowIcdUntil = now + sp.icdSec * 1000;
          applyStatus(target, { id: 'itemBotrkSlow', type: 'SLOW', duration: sp.slowDurationSec, value: sp.slowPercent, source: ctrl });
        }
      } else {
        ctrl._itemBotrkHitCounts.set(key, count);
      }
    }
  }

  // 월식/무라마나 - 기본 공격 경로. 스킬 적중 경로는 itemOnDamageDealt()에서
  // 같은 공용 함수를 호출한다(아래 _itemEclipseOnHit/_itemMuramanaShockOnHit).
  _itemEclipseOnHit(ctrl, target);
  _itemMuramanaShockOnHit(ctrl, target, true);

  // 선체파괴자(선장) - 챔피언/구조물 대상 5번째 기본 공격마다 추가 물리
  // 피해(구조물 대상은 배율이 더 커진다). 이 프로젝트엔 정글 몬스터가
  // 없어 "에픽 몬스터" 대상 분기는 실현되지 않는다(명시적 한계).
  const hullbreakerSlot = (ctrl.items || []).find((s) => s.id === 'hullbreaker');
  if (hullbreakerSlot) {
    const p = ITEM_DATA.hullbreaker.captainPassive;
    ctrl._itemHullbreakerCount = (ctrl._itemHullbreakerCount || 0) + 1;
    if (ctrl._itemHullbreakerCount >= p.hitsNeeded) {
      ctrl._itemHullbreakerCount = 0;
      const isStructure = _itemIsStructure(target);
      if (target.isChampion || isStructure) {
        const isMelee = _itemIsMelee(ctrl);
        // 버그 수정(QA - "기본공격력" 재점검): 필드 이름(PercentBaseAd)은
        // 이미 기본 공격력을 의도했지만, 실제로는 ctrl.stats.attackDamage
        // (아이템까지 전부 합친 "총" 공격력)를 읽고 있었다 - 원문("근거리
        // 기본공격력 120%" 등)대로 진짜 기본 공격력만 쓰도록 고친다.
        const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
        const baseAd = (baseStats && typeof baseStats.attackDamage === 'number') ? baseStats.attackDamage : (ctrl.stats.attackDamage || 0);
        const maxHp = ctrl.maxHp || 0;
        const raw = isStructure
          ? (isMelee ? p.meleeStructurePercentBaseAd * baseAd + p.meleeStructurePercentMaxHp * maxHp : p.rangedStructurePercentBaseAd * baseAd + p.rangedStructurePercentMaxHp * maxHp)
          : (isMelee ? p.meleePercentBaseAd * baseAd + p.meleePercentMaxHp * maxHp : p.rangedPercentBaseAd * baseAd + p.rangedPercentMaxHp * maxHp);
        if (raw > 0) applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
      }
    }
  }

  // 갈라진하늘(라이트쉴드 타격) - 대상(챔피언)별 10초 재사용대기시간.
  // "치명타 적용" 연출은 이미 끝난 메인 평타에 되돌려 적용할 수 없어
  // 생략하고(명시적 근사 - item_data.js 주석 참고), 회복 효과(근접
  // 기본공격력90%｜원거리45% + 잃은 체력 4%)만 그대로 구현한다.
  const dsSlot = (ctrl.items || []).find((s) => s.id === 'divineSunderer');
  if (dsSlot && target.isChampion) {
    const p = ITEM_DATA.divineSunderer.lightshieldStrikePassive;
    ctrl._itemDivineSundererIcd = ctrl._itemDivineSundererIcd || new Map();
    const key = _itemTargetKey(target);
    const now = performance.now();
    if ((ctrl._itemDivineSundererIcd.get(key) || 0) <= now) {
      ctrl._itemDivineSundererIcd.set(key, now + p.icdPerTargetSec * 1000);
      const isMelee = _itemIsMelee(ctrl);
      const healPercent = isMelee ? p.meleeBaseAdPercent : p.rangedBaseAdPercent;
      const missingHp = Math.max(0, (target.maxHp || 0) - (target.hp || 0));
      // 버그 수정(QA - "기본공격력" 재점검): 위 선체파괴자와 동일한 문제 -
      // 필드 이름은 BaseAdPercent인데 실제로는 총 공격력을 읽고 있었다.
      const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
      const baseAd = (baseStats && typeof baseStats.attackDamage === 'number') ? baseStats.attackDamage : (ctrl.stats.attackDamage || 0);
      const healAmt = healPercent * baseAd + missingHp * p.missingHpHealPercent;
      ctrl.hp = Math.min(ctrl.maxHp, (ctrl.hp || 0) + healAmt);
    }
  }

  // [전설급 4차분] 정찰병의 새총/윤 탈 야생화살의 "명중" 계열 - 기본 공격
  // 시(대상 불문) 재사용대기시간을 추가로 깎는다(치명타 적중 시 윤 탈
  // 야생화살은 더 깎인다). 발동(마법 피해/공격속도 버프) 자체는 각각
  // itemOnDamageDealt()/아래 블록에서 처리하고, 여기서는 "공격했다"는
  // 신호로 쿨다운만 줄인다 - readyAt(절대 시각)을 그만큼 앞당기는 방식.
  const scoutsSlot = (ctrl.items || []).find((s) => s.id === 'scoutsSlingshot');
  if (scoutsSlot) {
    ctrl._itemScoutsReadyAt = (ctrl._itemScoutsReadyAt || 0) - ITEM_DATA.scoutsSlingshot.markmanshipPassive.cdrPerAttackSec * 1000;
  }
  const ragebladeSlot = (ctrl.items || []).find((s) => s.id === 'rageblade');
  if (ragebladeSlot) {
    const rp = ITEM_DATA.rageblade;
    const now = performance.now();
    // 연습이 치명타를 낳는다 - 영구 누적(최대 25%). 암흑의 인장(영광)과
    // 동일한 패턴으로, recomputeItemStats()가 매번 0으로 초기화하는
    // itemBonusCritChance가 아니라 별도 영구 필드(_itemPermCritBonus)에
    // 쌓아두고 recomputeItemStats()에서 다시 더한다(구매/판매해도 유지).
    const isMelee = _itemIsMelee(ctrl);
    const perHit = isMelee ? rp.permanentCritPassive.meleeCritPerHit : rp.permanentCritPassive.rangedCritPerHit;
    const before = ctrl._itemPermCritBonus || 0;
    ctrl._itemPermCritBonus = Math.min(rp.permanentCritPassive.maxCritChance, before + perHit);
    if (ctrl._itemPermCritBonus !== before) recomputeItemStats(ctrl);
    // 명중 - 적 챔피언 공격 시(기본 공격) 6초간 공격속도+30%, 재사용대기
    // 30초. 기본 공격 시(대상 불문) 1초, 치명타 적중 시 추가 2초 감소.
    ctrl._itemRagebladeReadyAt = ctrl._itemRagebladeReadyAt || now;
    if (target.isChampion && now >= ctrl._itemRagebladeReadyAt && typeof applyStatus === 'function') {
      ctrl._itemRagebladeReadyAt = now + rp.marksmanshipActivePassive.icdSec * 1000;
      applyStatus(ctrl, { id: 'itemRagebladeMarksmanship', type: 'AS_BUFF', duration: rp.marksmanshipActivePassive.buffDurationSec, value: rp.marksmanshipActivePassive.attackSpeedBonusPercent });
    }
    const cdr = rp.marksmanshipActivePassive.cdrPerAttackSec + (isCritical ? rp.marksmanshipActivePassive.cdrPerCritSec : 0);
    ctrl._itemRagebladeReadyAt -= cdr * 1000;
  }

  // 마법광학 장치 C44 - 확대(거리 비례 추가 물리 피해, 500거리에서 최대
  // 10%). 이미 끝난 메인 평타 자체를 소급해서 증폭할 방법이 없어(명시적
  // 근사 - 다른 "이미 끝난 평타는 못 고친다" 항목과 동일한 성격), 별도의
  // 추가 물리 피해 한 번으로 근사한다. 버그 수정: 원문에 "구조물 제외"
  // 같은 언급이 전혀 없는데도(티아맷/히드라류 쪼개기와 달리) 다른 온히트
  // 패시브를 베껴 구조물 제외를 넣었던 실수를 바로잡는다 - 구조물(포탑)
  // 대상에게도 그대로 적용된다.
  const magnifySlot = (ctrl.items || []).find((s) => s.id === 'magicOpticsC44');
  if (magnifySlot && typeof getHorizontalDistance === 'function' && typeof getWorldPosition === 'function') {
    const p = ITEM_DATA.magicOpticsC44.magnifyPassive;
    const distWorld = getHorizontalDistance(getWorldPosition(ctrl), getWorldPosition(target));
    const distLol = typeof worldDistanceToLol === 'function' ? worldDistanceToLol(distWorld) : distWorld;
    const ratio = Math.max(0, Math.min(1, distLol / p.maxDistanceLol));
    const bonusRaw = ratio * p.maxBonusPercent * (ctrl.stats.attackDamage || 0);
    if (bonusRaw > 0) applyDamage(target, { rawDamage: bonusRaw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  }

  // 크라켄 학살자(벼락) - 대상별 3번째 기본 공격마다 잃은 체력 비례 추가
  // 물리 피해(8~18레벨 선형 성장). 몰락한 왕의 검의 "할퀴는 그림자"와
  // 동일한 "대상별 카운터" 패턴(_itemTargetKey Map).
  // 버그 수정: 원문에 구조물 제외 언급이 없는데도(티아맷/히드라류 쪼개기와
  // 달리) 구조물을 제외하고 있었다 - 포탑 대상에게도 그대로 적용된다.
  const krakenSlot = (ctrl.items || []).find((s) => s.id === 'krakenSlayer');
  if (krakenSlot) {
    const p = ITEM_DATA.krakenSlayer.boltsPassive;
    ctrl._itemKrakenHitCounts = ctrl._itemKrakenHitCounts || new Map();
    const key = _itemTargetKey(target);
    const count = (ctrl._itemKrakenHitCounts.get(key) || 0) + 1;
    if (count >= p.hitsNeeded) {
      ctrl._itemKrakenHitCounts.set(key, 0);
      const isMelee = _itemIsMelee(ctrl);
      const min = isMelee ? p.meleeMin : p.rangedMin;
      const max = isMelee ? p.meleeMax : p.rangedMax;
      const level = Math.max(p.levelMin, Math.min(p.levelMax, ctrl.champLevel || p.levelMin));
      const levelRatio = (level - p.levelMin) / (p.levelMax - p.levelMin);
      const raw = min + (max - min) * levelRatio;
      if (raw > 0) applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    } else {
      ctrl._itemKrakenHitCounts.set(key, count);
    }
  }

  // 폭풍갈퀴/고속연사포 공용 "충전 상태" 소모 - 기본 공격 시 충전돼 있으면
  // 소모하며 각자의 효과를 낸다(충전 축적은 itemSystemTick()이 담당).
  const chargeSlot = (ctrl.items || []).find((s) => ITEM_DATA[s.id] && ITEM_DATA[s.id].chargePassive);
  if (chargeSlot && ctrl._itemChargeReady) {
    ctrl._itemChargeReady = false;
    ctrl._itemChargeProgress = 0;
    const p = ITEM_DATA[chargeSlot.id].chargePassive;
    // 버그 수정: 원문에 구조물 제외 언급이 없다 - 포탑을 평타로 밀 때도
    // 그대로 적용된다(마법 피해로 들어가므로 포탑의 물리 방어력을 무시한다는
    // 차이만 있을 뿐, 발동 자체를 막을 이유가 없다).
    if (p.bonusMagicDamage) {
      applyDamage(target, { rawDamage: p.bonusMagicDamage, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: ctrl });
    }
    if (p.msBuffPercent && typeof applyStatus === 'function') {
      applyStatus(ctrl, { id: 'itemChargeMsBuff', type: 'MS_BUFF', duration: p.msBuffDurationSec, value: p.msBuffPercent });
    }
    if (p.bonusRangePercent) {
      // 고속연사포(저격수) - "사거리 35% 증가(최대 150유닛)"에 지속시간이
      // 원문에 없다(durationGuessed) - 충전 소모형 버프답게 짧게 유지되는
      // 것으로 보고 다른 충전형 효과(폭풍갈퀴 "번개"의 1.5초)와 동일한
      // 값을 근사치로 썼다. _itemTempAttackRangeBonusLol/만료는
      // 마법광학 장치 C44 "비전 조준"과 공용 필드를 쓴다(character_controller.js의
      // update()가 매 프레임 적용).
      const baseRangeLol = typeof worldDistanceToLol === 'function' ? worldDistanceToLol(ctrl._attackRangeBaseWorld || ctrl.stats.attackRange || 0) : 0;
      const bonusLol = Math.min(p.bonusRangeCapLol, baseRangeLol * p.bonusRangePercent);
      ctrl._itemTempAttackRangeBonusLol = Math.max(ctrl._itemTempAttackRangeBonusLol || 0, bonusLol);
      ctrl._itemTempAttackRangeExpiresAt = Math.max(ctrl._itemTempAttackRangeExpiresAt || 0, performance.now() + 1.5 * 1000);
    }
  }

  // 나보리 명멸검(깨달음) - 기본 공격 시 기본 스킬(Q/W/E/R)의 "남은"
  // 재사용대기시간을 15% 줄인다. 쿨다운 중이 아니면(cooldowns.X가 0 또는
  // 음수) 당연히 효과가 없다.
  const naboriSlot = (ctrl.items || []).find((s) => s.id === 'naboriFlickerblade');
  if (naboriSlot && ctrl.cooldowns) {
    const pct = ITEM_DATA.naboriFlickerblade.enlightenmentPassive.cdrPercentOfRemaining;
    for (const key of ['Q', 'W', 'E', 'R']) {
      if (ctrl.cooldowns[key] > 0) ctrl.cooldowns[key] *= (1 - pct);
    }
  }

  // 벼락폭풍검(창공) - "전류 자극"(스킬로 챔피언에게 피해 -> itemOnDamageDealt()가
  // 충전 준비)이 끝난 뒤, 다음 기본 공격에서 소모한다. 4초간 물리 관통력
  // 획득(임시 버프, itemTempArmorPenFlat) + 대상 현재 체력 비례 추가
  // 물리 피해(비챔피언 최대 200).
  const stormsurgeSlot = (ctrl.items || []).find((s) => s.id === 'stormsurge');
  if (stormsurgeSlot && ctrl._itemSkillChargeReady && !_itemIsStructure(target)) {
    ctrl._itemSkillChargeReady = false;
    const p = ITEM_DATA.stormsurge.skywardPassive;
    const isMelee = _itemIsMelee(ctrl);
    const now = performance.now();
    ctrl.itemTempArmorPenFlat = isMelee ? p.meleeArmorPenFlat : p.rangedArmorPenFlat;
    ctrl._itemTempArmorPenFlatExpiresAt = now + p.durationSec * 1000;
    let raw = (isMelee ? p.meleeCurrentHpPercent : p.rangedCurrentHpPercent) * (target.hp || 0);
    if (!target.isChampion) raw = Math.min(raw, p.nonChampionCap);
    if (raw > 0) applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  }

  // 요새파괴자(파괴 공작) - 처치 관여 후 90초 안에, 포탑 대상 다음 기본
  // 공격 시 3초에 걸친 거대한 고정 피해(자신의 물리 방어구 관통력 비례).
  // 에픽 몬스터 분기는 이 프로젝트에 정글 몬스터가 없어 생략한다.
  const fortressSlot = (ctrl.items || []).find((s) => s.id === 'fortressBreaker');
  if (fortressSlot && _itemIsStructure(target) && (ctrl._itemSabotageArmedUntil || 0) > performance.now()) {
    ctrl._itemSabotageArmedUntil = 0;
    const p = ITEM_DATA.fortressBreaker.sabotagePassive;
    const isMelee = _itemIsMelee(ctrl);
    const flat = isMelee ? p.meleeFlat : p.rangedFlat;
    const penMult = isMelee ? p.meleeArmorPenPercentOfStat : p.rangedArmorPenPercentOfStat;
    const totalDamage = flat + (ctrl.itemBonusArmorPenFlat || 0) * penMult;
    if (totalDamage > 0 && typeof applyStatus === 'function') {
      applyStatus(target, { id: 'itemFortressBreakerSabotage', type: 'DOT', duration: p.dotDurationSec, totalDamage, damageType: DAMAGE_TYPE.TRUE, tickInterval: 1.0, source: ctrl });
    }
  }
}

// 월식("늘 떠오르는 달") - 2초 내 "별개의" 기본 공격 또는 스킬로 같은
// 챔피언을 2회 맞히면(효과 자체 재사용대기시간 6초) 최대 체력 비례
// 추가 피해 + 추가 공격력 비례 보호막. 기본 공격/스킬 적중 양쪽에서
// 공용으로 호출되므로(itemOnBasicAttackHit/itemOnDamageDealt), 스킬
// 경로(itemOnDamageDealt 내부, applyDamage() 재귀 금지 구역)에서도
// 안전하도록 calculateDamage()로 수치만 뽑아 target.hp를 직접 깎는다.
function _itemEclipseOnHit(ctrl, target) {
  if (!target || !target.isChampion) return; // 원문: "한 챔피언에게"
  const slot = (ctrl.items || []).find((s) => s.id === 'eclipse');
  if (!slot) return;
  const p = ITEM_DATA.eclipse.everRisingMoonPassive;
  const now = performance.now();
  if ((ctrl._itemEclipseIcdUntil || 0) > now) return;
  ctrl._itemEclipseHits = ctrl._itemEclipseHits || new Map();
  const key = _itemTargetKey(target);
  const rec = ctrl._itemEclipseHits.get(key);
  if (!rec || now > rec.windowExpiresAt) {
    ctrl._itemEclipseHits.set(key, { windowExpiresAt: now + p.windowSec * 1000 });
    return;
  }
  ctrl._itemEclipseHits.delete(key);
  ctrl._itemEclipseIcdUntil = now + p.icdSec * 1000;
  const isMelee = _itemIsMelee(ctrl);
  const rawDamage = (isMelee ? p.meleeMaxHpPercent : p.rangedMaxHpPercent) * (target.maxHp || 0);
  const finalDmg = calculateDamage({ rawDamage, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, target, source: ctrl });
  const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
  target.hp = Math.max(minHp, (target.hp || 0) - finalDmg);
  const shieldBase = isMelee ? p.meleeShieldBase : p.rangedShieldBase;
  const shieldBonusPercent = isMelee ? p.meleeShieldBonusAdPercent : p.rangedShieldBonusAdPercent;
  const shieldAmt = shieldBase + _itemBonusAD(ctrl) * shieldBonusPercent;
  ctrl.shield = Math.max(ctrl.shield || 0, shieldAmt);
  ctrl._itemShieldExpiresAt = Math.max(ctrl._itemShieldExpiresAt || 0, now + p.shieldDurationSec * 1000);
}

// 무라마나("충격") - 챔피언 대상 기본 공격 시 마나의 1.2% 추가 물리
// (적중 시 효과), 챔피언 대상 스킬 피해 시 근접 마나4%｜원거리 마나3%
// 추가 물리. isBasicAttack 플래그로 두 경로를 구분하지만 원문을 다시
// 읽어보니 둘 다 "챔피언에게"로 한정돼 있다 - 버그 수정: 기본 공격
// 쪽을 "구조물만 제외"로 잘못 구현해뒀었다(미니언에게도 발동하던 상태).
function _itemMuramanaShockOnHit(ctrl, target, isBasicAttack) {
  const slot = (ctrl.items || []).find((s) => s.id === 'muramana');
  if (!slot || !target) return;
  const p = ITEM_DATA.muramana.shockPassive;
  if (isBasicAttack) {
    if (!target.isChampion) return; // 원문: "챔피언에게 기본 공격 시"
    const raw = p.onHitManaPercent * (ctrl.maxMp || 0);
    if (raw > 0) applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: ctrl });
  } else {
    if (!target.isChampion) return; // 원문: "챔피언에게"
    const isMelee = _itemIsMelee(ctrl);
    const pct = isMelee ? p.onAbilityHitMeleeManaPercent : p.onAbilityHitRangedManaPercent;
    const rawDamage = pct * (ctrl.maxMp || 0);
    if (rawDamage <= 0) return;
    // itemOnDamageDealt() 내부(스킬 피해 경로)에서 호출되므로 applyDamage()를
    // 다시 부르면 무한 재귀 - calculateDamage()로 수치만 뽑아 직접 차감한다
    // (마법의 영약 "고정 피해" 훅과 동일한 안전 패턴).
    const finalDmg = calculateDamage({ rawDamage, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, target, source: ctrl });
    const minHp = target.isTrainingDummy ? Math.max(1, Math.round((target.maxHp || 0) * 0.02)) : 0;
    target.hp = Math.max(minHp, (target.hp || 0) - finalDmg);
  }
}
