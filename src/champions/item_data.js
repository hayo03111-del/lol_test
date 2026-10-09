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
  // 투명 와드(트린켓) - 실제 LoL처럼 6칸 인벤토리와 완전히 별개인 전용
  // 슬롯(ctrl.trinket)에 들어간다(돈으로 사지 않고 기본 장착). 재사용
  // 대기시간(170~90초)과 와드 지속시간(90~120초)은 게임 시간에 따라
  // 선형으로 보간된다 - 원문에 정확한 보간 구간이 나와있지 않아, 20분
  // (1200초) 시점에 후반 값에 도달한다고 근사했다(명시적 근사치).
  stealthWard: {
    id: 'stealthWard', nameKo: '투명 와드', cost: 0, trinket: true,
    maxCharges: 2,
    rechargeSecEarly: 170, rechargeSecLate: 90, scaleFullAtSec: 1200,
    wardDurationEarlySec: 90, wardDurationLateSec: 120,
    placeRange: 550, visionRadius: 900, hitsToDestroy: 3,
  },
  // [기본 아이템] - 대부분 순수 스탯 아이템. 가격이 원문 텍스트에 없던
  // 3종(원기 회복의 구슬/천갑옷/B.F. 대검)은 공식적으로 잘 알려진 실제
  // LoL 가격을 그대로 썼다(명시적으로 표시 - 사용자가 준 텍스트에는
  // 가격 줄이 누락되어 있었다).
  pickaxe: { id: 'pickaxe', nameKo: '곡괭이', cost: 875, stats: { attackDamage: 25 } },
  dagger: { id: 'dagger', nameKo: '단검', cost: 250, stats: { attackSpeedPercent: 0.25 } },
  longSword: { id: 'longSword', nameKo: '롱소드', cost: 350, stats: { attackDamage: 10 } },
  rubyCrystal: { id: 'rubyCrystal', nameKo: '루비 수정', cost: 400, stats: { maxHp: 150 } },
  glowingMote: { id: 'glowingMote', nameKo: '빛나는 티끌', cost: 250, stats: { abilityHaste: 5 } },
  negatronCloak: { id: 'negatronCloak', nameKo: '마법무효화의 망토', cost: 400, stats: { magicResist: 20 } },
  cloakOfAgility: { id: 'cloakOfAgility', nameKo: '민첩성의 망토', cost: 600, stats: { critChance: 0.15 } },
  blastingWand: { id: 'blastingWand', nameKo: '방출의 마법봉', cost: 850, stats: { abilityPower: 45 } },
  sapphireCrystal: { id: 'sapphireCrystal', nameKo: '사파이어 수정', cost: 300, stats: { mana: 300 } },
  needlesslyLargeRod: { id: 'needlesslyLargeRod', nameKo: '쓸데없이 큰 지팡이', cost: 1200, stats: { abilityPower: 65 } },
  faerieCharm: { id: 'faerieCharm', nameKo: '요정의 부적', cost: 200, stats: { mpRegenPercent: 0.5 } },
  rejuvenationBead: { id: 'rejuvenationBead', nameKo: '원기 회복의 구슬', cost: 150, stats: { hpRegenPercent: 1.0 } }, // 가격 원문 누락 - 실제 LoL 가격 사용
  amplifyingTome: { id: 'amplifyingTome', nameKo: '증폭의 고사', cost: 400, stats: { abilityPower: 20 } },
  chainVest: { id: 'chainVest', nameKo: '천갑옷', cost: 800, stats: { armor: 15 } }, // 가격 원문 누락 - 실제 LoL 가격 사용
  bfSword: { id: 'bfSword', nameKo: 'B.F. 대검', cost: 1300, stats: { attackDamage: 40 } }, // 가격 원문 누락 - 실제 LoL 가격 사용
};
const ITEM_ORDER = [
  'doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm',
  'cull', 'darkSeal', 'tearOfGoddess', 'healthPotion', 'refillablePotion', 'stealthWard',
  'pickaxe', 'dagger', 'longSword', 'rubyCrystal', 'glowingMote', 'negatronCloak',
  'cloakOfAgility', 'blastingWand', 'sapphireCrystal', 'needlesslyLargeRod',
  'faerieCharm', 'rejuvenationBead', 'amplifyingTome', 'chainVest', 'bfSword',
];
