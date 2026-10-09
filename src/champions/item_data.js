// 아이템 시스템 - 1차분(도란 시리즈 5종) + 2차분(남은 시작 아이템 중 이
// 프로젝트 구조로 구현 가능한 것들 + 체력/충전형 물약). 사용자가 보내준
// 한국어 아이템 텍스트 원문의 수치를 그대로 옮긴다. stats는
// recomputeItemStats()(item_system.js)가 그대로 합산해 itemBonus* 필드에
// 반영하고, 그 외 패시브(흡혈/도움의 손길/재생 등)는 item_system.js의
// 전용 틱/훅 함수들이 아이템별 설정 객체를 읽어 처리한다.
//
// [시작 아이템] 중 의도적으로 생략한 항목(수치를 지어내지 않는다는 원칙에
// 따라, 없는 시스템을 새로 발명하지 않고 생략 - Vision System 때와 동일한
// 원칙):
// - 새끼 이끼쿵쿵이/화염발톱/바람돌이(정글 동료): 정글 몬스터 캠프와
//   소환사 주문 "강타" 자체가 이 프로젝트에 없다(허수아비 하나와
//   미니언/포탑/넥서스만 존재). 이 둘을 전부 새로 만드는 건 아이템
//   하나의 범위를 벗어난다.
// - 세계지도집/룬나침반(서포터 아이템): "아군 챔피언", 팀 골드 공유,
//   포지션(서포터) 배정, 와드 설치 자체가 이 프로젝트에 없다(1인 연습
//   시뮬레이터라 애초에 아군이라는 개념이 없음).
const ITEM_DATA = {
  doransBlade: {
    id: 'doransBlade', nameKo: '도란의 검', cost: 450,
    stats: { attackDamage: 10, maxHp: 80 },
    allDamageVampPercent: 0.025, // 모든 피해 흡혈 2.5%
  },
  doransRing: {
    id: 'doransRing', nameKo: '도란의 반지', cost: 400,
    stats: { abilityPower: 18, maxHp: 90 },
    minionBonusDamage: 5, // 도움의 손길
    // 흡수: 매초 1마나 회복, 챔피언에게 피해를 입힌 후 5초간 매초 2마나로
    // 증가. 마나를 회복할 수 없으면(마나 없음/풀마나) 대신 그 수치의 45%만큼 체력 회복.
    manaRegenPassive: { baseManaPerSec: 1, combatManaPerSec: 2, combatWindowSec: 5, noManaHpRegenPercent: 0.45 },
  },
  doransShield: {
    id: 'doransShield', nameKo: '도란의 방패', cost: 450,
    stats: { maxHp: 110 },
    minionBonusDamage: 5, // 도움의 손길
    regenPassive: { hpPerTick: 4, tickSec: 5 }, // 인내의 집중력(평시)
    // 인내의 집중력(전투): 챔피언에게 피해를 입으면 8초 동안 최대
    // (근거리 40 | 원거리 30)의 체력을 회복(평시 재생을 대체).
    champDamageRegen: { durationSec: 8, meleeMaxHp: 40, rangedMaxHp: 30 },
  },
  doransBow: {
    id: 'doransBow', nameKo: '도란의 활', cost: 400,
    stats: { attackDamage: 8, attackSpeedPercent: 0.15 },
    allDamageVampPercent: 0.015, // 모든 피해 흡혈 1.5%
  },
  doransHelm: {
    id: 'doransHelm', nameKo: '도란의 투구', cost: 450,
    stats: { maxHp: 150, armor: 8, magicResist: 8 },
    minionBonusDamage: 5, // 도움의 손길
  },
  cull: {
    id: 'cull', nameKo: '수확의 낫', cost: 450,
    stats: { attackDamage: 7 },
    // 수확: 기본 공격 적중 시 체력 3 회복 + 미니언 처치 시 1골드(최대
    // 100골드 누적) - 한도에 도달하면 350골드를 한 번에 더 받는다(실제
    // 게임에서는 이 시점에 상위 아이템으로 자동 변하지만, 그 상위 아이템은
    // 이번 범위에 없어 한도 도달 후에는 추가 골드 지급만 멈춘다).
    onHitHeal: 3,
    harvestPassive: { minionGoldPerKill: 1, minionGoldCap: 100, bonusGoldAtCap: 350 },
  },
  darkSeal: {
    id: 'darkSeal', nameKo: '암흑의 인장', cost: 350,
    stats: { abilityPower: 15 },
    // 영광: 챔피언 처치 관여 시 중첩(최대 10), 사망 시 5 중첩 소실, 중첩당
    // 주문력 4. 이 데모는 어시스트 개념(아군 챔피언) 자체가 없어 처치(킬)
    // 관여만 구현한다 - 처형 판정(markExecute) 지점을 "처치"로 재사용한다.
    gloryPassive: { apPerStack: 4, maxStacks: 10, takedownStacks: 2, deathLossStacks: 5 },
  },
  tearOfGoddess: {
    id: 'tearOfGoddess', nameKo: '여신의 눈물', cost: 400,
    stats: { mana: 240 },
    minionBonusDamage: 5, // 도움의 손길
    // 마나순환: 챔피언을 상대로는 2배. "스킬 적중 시"가 원문이지만, 이
    // 프로젝트는 챔피언 스킬 피해 호출 대부분이 기본 공격과 동일한
    // applyDamage() 공용 진입점을 거치면서도 "스킬이냐 평타냐"를 구분하는
    // 공용 플래그가 없다(일부 챔피언만 source를 넘김) - 모든 챔피언 파일을
    // 건드리지 않고는 정확히 구분할 수 없어, 챔피언/더미 대상 피해 전체
    // (스킬+평타)를 트리거로 근사했다(README에 명시).
    manaCirculationPassive: { maxManaPerHit: 3, maxManaPerChampionHit: 6, maxManaCap: 360, maxCharges: 4, rechargeSec: 8 },
  },
  healthPotion: {
    id: 'healthPotion', nameKo: '체력 물약', cost: 50,
    maxStack: 5,
    consumable: { healAmount: 120, healDurationSec: 15 },
  },
  refillablePotion: {
    id: 'refillablePotion', nameKo: '충전형 물약', cost: 150,
    maxCharges: 2, refillOnShopUse: true,
    consumable: { healAmount: 100, healDurationSec: 12 },
  },
};
const ITEM_ORDER = [
  'doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm',
  'cull', 'darkSeal', 'tearOfGoddess', 'healthPotion', 'refillablePotion',
];
