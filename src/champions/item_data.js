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
  rejuvenationBead: { id: 'rejuvenationBead', nameKo: '원기 회복의 구슬', cost: 150, stats: { hpRegenPercent: 1.0 }, priceGuessed: true }, // 가격 원문 누락 - 실제 LoL 가격 사용
  amplifyingTome: { id: 'amplifyingTome', nameKo: '증폭의 고사', cost: 400, stats: { abilityPower: 20 } },
  chainVest: { id: 'chainVest', nameKo: '천갑옷', cost: 800, stats: { armor: 15 }, priceGuessed: true }, // 가격 원문 누락 - 실제 LoL 가격 사용
  bfSword: { id: 'bfSword', nameKo: 'B.F. 대검', cost: 1300, stats: { attackDamage: 40 }, priceGuessed: true }, // 가격 원문 누락 - 실제 LoL 가격 사용

  // [신발] - "신발은 하나밖에 사지 못한다"(원문) - 6칸 인벤토리와 완전히
  // 별개인 전용 슬롯(ctrl.boots, 트린켓과 동일한 구조)에 들어간다. 다른
  // 신발을 사면 기존 신발은 자동으로 "교체"되어 전액 환급된다(판매가
  // 아니라 업그레이드 개념 - item_system.js의 buyBoots() 참고).
  // moveSpeed는 다른 stats와 달리 LoL 원본 단위 그대로 둔다 -
  // recomputeStats()에서 lolRangeToWorld()로 변환해 더한다(기본 이동속도
  // 자체가 그 변환을 거쳐 월드 단위로 저장되는 것과 동일한 원칙).
  boots: { id: 'boots', nameKo: '장화', cost: 300, stats: { moveSpeed: 25 }, isBoots: true },
  // 약간 신비한 신발: 원문에 가격이 없다. "조합 시 장화 대신 쓸 수 있고
  // 그 효과가 상위 신발에도 유지된다"는 조합 전용 메커니즘은 이 프로젝트에
  // 아이템 조합(하위템 자동 소모) 시스템 자체가 없어 구현하지 않았다 -
  // 기본 이동속도(25+10)만 가진 장화의 대체 버전으로 단순화했다.
  slightlyMagicalBoots: { id: 'slightlyMagicalBoots', nameKo: '약간 신비한 신발', cost: 300, stats: { moveSpeed: 35 }, isBoots: true, priceGuessed: true },
  berserkersGreaves: { id: 'berserkersGreaves', nameKo: '광전사의 군화', cost: 1100, stats: { attackSpeedPercent: 0.30, moveSpeed: 45 }, isBoots: true },
  sorcerersShoes: { id: 'sorcerersShoes', nameKo: '마법사의 신발', cost: 1100, stats: { magicPenFlat: 12, moveSpeed: 45 }, isBoots: true },
  // 명석함의 아이오니아 장화 - "아이오니아의 통찰"(소환사 주문 가속 +10)은
  // 이 프로젝트에 소환사 주문 시스템 자체가 없어 생략했다(스킬 가속 10은 그대로 적용).
  ionianBootsOfLucidity: { id: 'ionianBootsOfLucidity', nameKo: '명석함의 아이오니아 장화', cost: 900, stats: { abilityHaste: 10, moveSpeed: 45 }, isBoots: true },
  // 신속의 장화 - "날쌘 발걸음"(둔화 효과 25% 감소)은 slowResistPercent로
  // 구현한다(01_status_effect_system.js의 applyStatus()가 SLOW 효과의
  // 세기 자체를 이 비율만큼 깎는다 - 지속시간이 아니라 세기 감소라는
  // 실제 "둔화 저항"의 의미와 일치).
  bootsOfSwiftness: { id: 'bootsOfSwiftness', nameKo: '신속의 장화', cost: 1000, stats: { moveSpeed: 55 }, isBoots: true, slowResistPercent: 0.25 },
  // 판금 장화 - "판금"(기본 공격으로 받는 피해 10% 감소)은 이 1인 연습
  // 시뮬레이터에 플레이어를 공격하는 AI 자체가 없어 트리거될 상황이 없다
  // (도란의 방패 "피격 후 회복"과 동일한 이유) - 데이터만 두고 실제 피해
  // 감소 훅은 연결하지 않았다.
  platedSteelcaps: { id: 'platedSteelcaps', nameKo: '판금 장화', cost: 1200, stats: { armor: 25, moveSpeed: 45 }, isBoots: true, reducedBasicAttackDamagePercent: 0.10 },
  // 헤르메스의 발걸음 - "강인함 30%"는 tenacityPercent로 구현한다
  // (applyStatus()가 기절/도발/공포/침묵/변이 등 행동 불가 CC의 지속시간을
  // 이 비율만큼 깎는다 - 원문 그대로 "공중에 뜨거나(KNOCKUP) 제압
  // (SUPPRESSION) 당했을 때는 효과 없음"을 반영해 그 둘은 제외한다).
  mercurysTreads: { id: 'mercurysTreads', nameKo: '헤르메스의 발걸음', cost: 1250, stats: { magicResist: 20, moveSpeed: 45 }, isBoots: true, tenacityPercent: 0.30 },
  // 탐욕의 군화 - "학살"(챔피언 처치 관여 시 흡혈 0.6%씩 최대 10중첩)은
  // 암흑의 인장(영광)과 동일한 처형 판정 지점(itemOnChampionTakedown)을
  // 재사용해서 구현한다.
  bootsOfGreed: {
    id: 'bootsOfGreed', nameKo: '탐욕의 군화', cost: 1000, stats: { moveSpeed: 45 }, isBoots: true,
    allDamageVampPercent: 0.04,
    slaughterPassive: { vampPerStack: 0.006, maxStacks: 10 },
  },

  // [서사급 아이템] 1차분 - 전체 목록은 30종이 넘어서, 이번 라운드는 조합
  // (하위템→완제품) 시스템을 제대로 만드는 데 집중하고 메커니즘이 서로
  // 겹치지 않는 대표 7종만 먼저 구현했다(나머지는 다음 배치 - README 명시).
  // `recipe`는 "하위템" 목록(같은 아이템 여러 개면 그만큼 반복) - 전부
  // 이미 있는 기본 아이템 id를 그대로 가리킨다. 조합 비용(완제품 가격 -
  // 하위템 가격 합)은 item_system.js의 combineCost()가 자동으로 계산하므로
  // 여기 따로 적지 않는다.
  //
  // 의도적으로 뺀 항목: "강철인장"(원문 가격 1100원, 하위템 롱소드+천갑옷
  // 2개 = 350+800+800=1950원로 완제품 가격보다 하위템 가격 합이 더 큰
  // 모순이 있다 - 숫자를 지어내지 않는다는 원칙에 따라 추측으로 고치지
  // 않고 이번 배치에서 제외했다. 가격 정보가 더 확인되면 추가할 수 있다).
  executionersCalling: {
    id: 'executionersCalling', nameKo: '처형인의 대검', cost: 800, recipe: ['longSword'],
    stats: { attackDamage: 15 },
    // 고통스러운 상처: 챔피언에게 물리 피해를 입히면 3초간 40% 고통스러운
    // 상처(그리버스 - 치유/회복 효과 감소. 바루스 E가 이미 쓰던 GRIEVOUS
    // 상태이상 타입을 그대로 재사용).
    grievousOnHitPassive: { percent: 0.40, durationSec: 3.0 },
  },
  vampiricScepter: {
    id: 'vampiricScepter', nameKo: '흡혈의 낫', cost: 900, recipe: ['longSword'],
    stats: { attackDamage: 15 },
    // 생명력 흡수(물리 피해 전용) - 도란류의 "모든 피해 흡혈"(흡혈)과
    // 구분되는 별도 수치(물리 피해에만 적용)다.
    physicalVampPercent: 0.07,
  },
  lastWhisper: {
    id: 'lastWhisper', nameKo: '최후의 속삭임', cost: 1450, recipe: ['longSword', 'longSword'],
    stats: { attackDamage: 20 },
    armorPenPercent: 0.18,
  },
  tiamat: {
    id: 'tiamat', nameKo: '티아맷', cost: 1200, recipe: ['longSword', 'longSword'],
    stats: { attackDamage: 25 },
    // 쪼개기(패시브) - 기본 공격 시 대상 주변 적에게 추가 물리 피해(근거리
    // 40%｜원거리 20%의 공격력). 구조물에는 적용하지 않는다(원문 그대로).
    cleavePassive: { meleePercent: 0.40, rangedPercent: 0.20, radius: 400 },
    // 초승달(사용 시, 10초 쿨다운) - 주변 적에게 공격력 75% 물리 피해.
    activeAbility: { nameKo: '초승달', cooldownSec: 10, percentAD: 0.75, radius: 400 },
  },
  sheen: {
    id: 'sheen', nameKo: '광휘의 검', cost: 900, recipe: ['glowingMote'],
    // 주문 검(스펠블레이드) - 스킬을 사용하면 1.5초 자체 쿨다운으로 무장되고,
    // 그 상태에서 다음 기본 공격 적중 시 공격력 100%의 추가 물리 피해를
    // 입힌다. "스킬 사용" 판정은 character_controller.js의 공용 라우팅
    // 지점(_dispatchCast)에서 잡는다 - 챔피언마다 스킬이 실제로 "성공"
    // 했는지까지는 구분하지 않고 "시전 시도"를 근사로 쓴다(명시적 근사).
    spellbladePassive: { procCooldownSec: 1.5, bonusAdPercent: 1.0 },
  },
  embersOfFate: {
    id: 'embersOfFate', nameKo: '운명의 재', cost: 900, recipe: ['amplifyingTome'],
    stats: { abilityPower: 30 },
    // 발화 - 챔피언/더미 대상 피해를 입히면(스킬 한정이 원문이지만, 여신의
    // 눈물과 동일한 이유로 평타+스킬 전체 피해를 트리거로 근사했다) 3초간
    // 불태워 매초 5의 마법 고정 피해(이미 있는 DOT 상태이상 타입 - 다리우스
    // 출혈이 쓰던 것과 동일한 범용 틱 시스템을 재사용). 몬스터(미니언)
    // 대상의 추가 피해(+10/초)는 이번 범위에서는 생략했다(챔피언/더미 전용).
    burnOnDamagePassive: { id: 'embersOfFateBurn', durationSec: 3.0, dmgPerSec: 5 },
  },
  catalystOfAeons: {
    id: 'catalystOfAeons', nameKo: '억겁의 카탈리스트', cost: 1300, recipe: ['rubyCrystal', 'sapphireCrystal'],
    stats: { maxHp: 350, mana: 300 },
    // 영원 - "챔피언에게 피해를 입으면 감소 전 피해량의 7%만큼 마나 회복"만
    // 구현했다. "스킬 사용 시 소모한 마나의 25%만큼 체력 회복(초당 최대
    // 20 HoT)" 서브 효과는 "이번 스킬이 정확히 얼마의 마나를 썼는가"를
    // 챔피언마다 다른 비용 차감 코드를 건드리지 않고는 범용으로 알아낼
    // 방법이 없어(여신의 눈물 때와 같은 한계) 생략했다 - 명시적 근사.
    manaOnDamagePercent: 0.07,
  },
};
const ITEM_ORDER = [
  'doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm',
  'cull', 'darkSeal', 'tearOfGoddess', 'healthPotion', 'refillablePotion', 'stealthWard',
  'pickaxe', 'dagger', 'longSword', 'rubyCrystal', 'glowingMote', 'negatronCloak',
  'cloakOfAgility', 'blastingWand', 'sapphireCrystal', 'needlesslyLargeRod',
  'faerieCharm', 'rejuvenationBead', 'amplifyingTome', 'chainVest', 'bfSword',
  'boots', 'slightlyMagicalBoots', 'berserkersGreaves', 'sorcerersShoes',
  'ionianBootsOfLucidity', 'bootsOfSwiftness', 'platedSteelcaps', 'mercurysTreads', 'bootsOfGreed',
  'executionersCalling', 'vampiricScepter', 'lastWhisper', 'tiamat', 'sheen', 'embersOfFate', 'catalystOfAeons',
];
// 상점 UI 카테고리 - 탭으로 묶어서 보여줄 때 쓴다(global_system_instances.js).
const ITEM_CATEGORIES = [
  { id: 'starter', nameKo: '시작 아이템', items: ['doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm', 'cull', 'darkSeal', 'tearOfGoddess'] },
  { id: 'consumable', nameKo: '소모품', items: ['healthPotion', 'refillablePotion'] }, // 투명 와드(트린켓)는 상점에서 사는 게 아니라 기본 장착 - 아래 트린켓 슬롯에 표시
  { id: 'basic', nameKo: '기본 아이템', items: ['pickaxe', 'dagger', 'longSword', 'rubyCrystal', 'glowingMote', 'negatronCloak', 'cloakOfAgility', 'blastingWand', 'sapphireCrystal', 'needlesslyLargeRod', 'faerieCharm', 'rejuvenationBead', 'amplifyingTome', 'chainVest', 'bfSword'] },
  { id: 'boots', nameKo: '신발', items: ['boots', 'slightlyMagicalBoots', 'berserkersGreaves', 'sorcerersShoes', 'ionianBootsOfLucidity', 'bootsOfSwiftness', 'platedSteelcaps', 'mercurysTreads', 'bootsOfGreed'] },
  { id: 'epic', nameKo: '서사급', items: ['executionersCalling', 'vampiricScepter', 'lastWhisper', 'tiamat', 'sheen', 'embersOfFate', 'catalystOfAeons'] },
];
