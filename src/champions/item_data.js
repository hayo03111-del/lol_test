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
    // 유일 아이템(마나순환 계열) - manamune/muramana 주석 참고.
    uniqueGroup: 'manaCirculation',
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
  // 제어 와드 - 트린켓(투명 와드)과 달리 6칸 인벤토리를 차지하는 "구매하는"
  // 와드다(원문: "최대 2개의 제어 와드를 소지할 수 있습니다" - maxStack:2로
  // 구현, 체력 물약과 동일한 중첩 방식). 지속시간이 없는(파괴되기 전까지
  // 영구) 와드라서 아주 긴 값(99999초)으로 사실상 영구에 근사한다.
  // 설치 사정거리/시야 범위는 원문에 수치가 없어 실제 LoL 값(각각 600/900)을
  // 사용했다(명시). "노출된 투명 와드 비활성화"/"평타4대로 파괴"/
  // "최초 발견·제거 골드"는 투명 와드와 동일한 이유(이 1인 연습
  // 시뮬레이터에는 적이 와드를 공격하거나 와드끼리 상호작용할 적 AI 자체가
  // 없음)로 생략한다.
  controlWard: {
    id: 'controlWard', nameKo: '제어 와드', cost: 75, maxStack: 2,
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 99999, hitsToDestroy: 4 },
    placeRangeGuessed: true,
  },
  // 영약(소모품) 3종 - 전부 "3분 동안 지속, 다른 종류의 영약을 마시면
  // 기존 효과가 사라진다"(원문)는 상호 배타적 버프라서 ctrl._itemActiveElixir
  // 하나로 어떤 영약을 마셨는지 관리한다(item_system.js의 _useElixir() 참고).
  // 강철의 영약 "거대해짐"/"지나간 자리의 아군 이동속도 버프"는 이 1인
  // 연습 시뮬레이터에 아군 챔피언 개념이 없어 생략(크기 변화는 순수 시각
  // 효과라 생략해도 수치에는 영향 없음).
  elixirOfIron: {
    id: 'elixirOfIron', nameKo: '강철의 영약', cost: 500, consumableType: 'elixir',
    elixirEffect: { durationSec: 180, maxHp: 300, tenacityPercent: 0.25 },
  },
  // 마법의 영약 - "챔피언이나 포탑에 피해를 입히면 25의 추가 고정 피해"는
  // onHitFlatDamage로, "챔피언이 대상일 경우 재사용대기시간 5초"(포탑은
  // 원문에 재사용대기시간 언급이 없어 매번 발동)는 onHitChampionIcdSec으로 구현한다.
  elixirOfSorcery: {
    id: 'elixirOfSorcery', nameKo: '마법의 영약', cost: 500, consumableType: 'elixir',
    elixirEffect: { durationSec: 180, abilityPower: 50, mpRegenPercent: 0.15, onHitFlatDamage: 25, onHitChampionIcdSec: 5 },
  },
  // 분노의 영약 - "챔피언 대상 물리 피해 흡혈 12% 증가"는 흡혈의 낫의
  // physicalVampPercent(대상 불문)와 달리 챔피언 대상 전용이라 별도 필드
  // (championPhysicalVampPercent)로 구분해서 구현한다(item_system.js의
  // itemOnDamageDealt()가 target.isChampion으로 게이팅).
  elixirOfWrath: {
    id: 'elixirOfWrath', nameKo: '분노의 영약', cost: 500, consumableType: 'elixir',
    elixirEffect: { durationSec: 180, attackDamage: 30, championPhysicalVampPercent: 0.12 },
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
  // 약간 신비한 신발: 원문에 가격이 없다(명시적 근사 가격). "장화 대신
  // 조합 재료로 쓸 수 있고, 그렇게 만든 상위 신발도 이 이동속도 상승
  // 효과를 계속 유지한다" - item_system.js의 _buyBoots()가 "현재 신던
  // 신발이 이거였는데 다른 신발로 바꾸는 순간" 그 보너스를 영구 플래그
  // (_itemBootsExtraMoveSpeedLol)로 못박아 넘겨준다(신발을 갈아 신어도 유지).
  slightlyMagicalBoots: {
    id: 'slightlyMagicalBoots', nameKo: '약간 신비한 신발', cost: 300, stats: { moveSpeed: 35 }, isBoots: true, priceGuessed: true,
    carryoverMoveSpeedOnUpgrade: 10,
  },
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
  // 강철인장 - QA 재확인 결과 재반영. 원문 가격은 1100원이고 하위템은
  // 롱소드+천갑옷 2개인데, 천갑옷 가격(800원)이 원문에 없어 실제 LoL
  // 가격을 썼더니(priceGuessed) 하위템 합(350+800+800=1950원)이 완제품
  // 가격보다 커지는 모순이 생긴다. 하지만 이 모순은 "천갑옷 쪽의 추측
  // 가격"에서 비롯된 것이지 강철인장 자신의 가격(1100원은 원문 값 그대로)이
  // 틀린 게 아니다 - 두 값 중 하나를 지어내 맞추는 대신 그대로 두고,
  // combineCost()가 이미 0 밑으로 안 내려가게 막아뒀으므로(실제로는 "거의
  // 공짜로 조합되는" 결과가 된다) 안전하게 반영할 수 있다. 죽음의무도/
  // 수호천사가 하위템으로 참조하므로 이 아이템 자체도 반드시 있어야 한다.
  ironSeal: {
    id: 'ironSeal', nameKo: '강철인장', cost: 1100, recipe: ['longSword', 'chainVest', 'chainVest'],
    stats: { attackDamage: 15, armor: 30 },
  },
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
    // 유일 아이템(hydra 계열) - 원문에 "유일 아이템"이라는 표현은 없지만,
    // 실제 LoL에서 티아맷/그 상위템(거대한히드라/발걸음분쇄기 등)은 전부
    // "히드라류" 하나만 보유할 수 있는 유일 아이템이다. buyItem()/
    // buildOrBuyItem()이 이 uniqueGroup을 공유하는 아이템을 이미 들고
    // 있으면 구매/조합 자체를 막는다(QA 요청으로 추가 - item_system.js의
    // uniqueGroup 검사 참고).
    uniqueGroup: 'hydra',
    // 쪼개기(패시브) - 기본 공격 시 대상 주변 적에게 추가 물리 피해(근거리
    // 40%｜원거리 20%의 공격력). 구조물에는 적용하지 않는다(원문 그대로).
    // radiusGuessed: 원문에 반경 수치가 전혀 없다 - 실제 LoL 티아맷 쪼개기의
    // 근사 반경(250)을 그대로 썼다(수치를 지어내지 않는다는 원칙에 따라
    // "출처가 원문이 아님"을 명시적으로 표시 - priceGuessed와 동일한 취지).
    cleavePassive: { meleePercent: 0.40, rangedPercent: 0.20, radius: 250, radiusGuessed: true },
    // 초승달(사용 시, 10초 쿨다운) - 주변 적에게 공격력 75% 물리 피해.
    // radiusGuessed: 역시 원문에 반경 수치가 없다 - 실제 LoL 초승달 액티브의
    // 근사 반경(400)을 썼다.
    activeAbility: { nameKo: '초승달', cooldownSec: 10, percentAD: 0.75, radius: 400, radiusGuessed: true },
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
    // 출혈이 쓰던 것과 동일한 범용 틱 시스템을 재사용). 몬스터(미니언) 대상은
    // 매초 15(5+10)의 추가 피해(원문 "몬스터에게는 매초 15의 추가 피해")를
    // 입힌다 - exp_level_system.js의 updateMinionCombat()에 미니언용
    // tickStatusEffects() 호출을 새로 추가해서 실제로 틱이 돌게 만들었다
    // (이 프로젝트에 미니언 DOT를 실제로 진행시키는 코드가 아예 없었다).
    burnOnDamagePassive: { id: 'embersOfFateBurn', durationSec: 3.0, dmgPerSec: 5, monsterDmgPerSec: 15 },
  },
  catalystOfAeons: {
    id: 'catalystOfAeons', nameKo: '억겁의 카탈리스트', cost: 1300, recipe: ['rubyCrystal', 'sapphireCrystal'],
    stats: { maxHp: 350, mana: 300 },
    // 영원 - "챔피언에게 피해를 입으면 감소 전 피해량의 7%만큼 마나 회복".
    manaOnDamagePercent: 0.07,
    // "스킬 사용 시 소모한 마나의 25%만큼 체력 회복(초당 최대 20 HoT)" -
    // "이번 스킬이 정확히 얼마의 마나를 썼는가"를 안전하게 알아낼 수 있는
    // 유일한 지점은 character_controller.js의 공용 비용 지불 헬퍼
    // _payCost()뿐이다(스킬 가속과 동일한 조사 결과 - 가렌/모데카이저/
    // 세트/초가스/아리/애쉬/바루스/다리우스/이즈리얼/벡스/마스터 이/
    // 리 신(R)은 전부 이걸 거친다). 렉사이(Q/W)/야스오/닐라/요네는 각자
    // 파일에서 마나를 직접 차감해 이 지점을 거치지 않으므로 이 아이템의
    // 이 서브 효과는 그 4개 챔피언에서는 작동하지 않는다(README에 명시).
    manaSpentToHealPercent: 0.25, manaSpentHealCapPerSec: 20,
  },

  // [전설급 아이템] 2차분 - 삼위일체~지배자의 피갑옷(사용자가 올려준 원본
  // 텍스트 625~758줄). 복잡한 적중 시 효과가 많아 하나씩 신중하게 구현한다.
  // 공용 엔지니어링 메모(item_system.js 상단 참고):
  // - "스킬로 피해를 입히면" 계열은 전부 기존 여신의 눈물/운명의 재와 동일한
  //   이유(스킬/평타 구분 플래그가 없음)로 "평타+스킬 피해 전체"에 근사한다.
  // - 기본 공격 전용 효과(안개의 검/쪼기/충격/선장/라이트쉴드 타격 등)는
  //   itemOnBasicAttackHit()(광휘의 검/티아맷이 이미 쓰던 공용 훅)에서
  //   처리한다 - 이 훅은 applyDamage()"안"이 아니라 메인 평타의 applyDamage()가
  //   이미 끝난 "뒤"에 별도로 불리므로, 안에서 다시 applyDamage()를 불러도
  //   무한 재귀가 생기지 않는다(기존 광휘의 검/티아맷과 동일한 안전 지점).
  trinityForce: {
    id: 'trinityForce', nameKo: '삼위일체', cost: 3333, recipe: ['sheen', 'devourerAxe', 'phageAxe'],
    stats: { attackDamage: 36, attackSpeedPercent: 0.30, maxHp: 333, abilityHaste: 15 },
    // 주문 검(기존 광휘의 검과 동일한 메커니즘, 배율만 100%->200%) - 광휘의
    // 검을 하위템으로 먹었으니 spellbladePassive를 그대로 재사용하되 배율만
    // 덮어쓴다(item_system.js의 itemOnBasicAttackHit()이 이 필드를 읽는다).
    spellbladePassive: { procCooldownSec: 1.5, bonusAdPercent: 2.0 },
    // 가속 - 유닛(챔피언/더미/미니언/구조물 전부, 원문에 제한이 없음) 기본
    // 공격 시 2초간 이동속도 +20(퍼센트가 아니라 고정 수치 - MS_BUFF_FLAT).
    onHitMoveSpeedFlatPassive: { amount: 20, durationSec: 2.0 },
  },
  // 탐식의 망치/온기가 필요한 자의 도끼 - 삼위일체의 재료지만, 원문에
  // 자기 자신의 독자적인 가격/스탯/패시브가 전부 있는 "에픽" 등급
  // 아이템이다(실제 LoL처럼 조합 재료도 그 자체로 구매 가능 - 숨기면
  // 조합 시스템이 영영 발동하지 못한다). 탐식의 망치 "분노"는 삼위일체의
  // "가속"과 완전히 동일한 수치라 같은 필드(onHitMoveSpeedFlatPassive)를 재사용한다.
  devourerAxe: {
    id: 'devourerAxe', nameKo: '탐식의 망치', cost: 1100, recipe: ['rubyCrystal', 'longSword'],
    stats: { attackDamage: 15, maxHp: 200 },
    onHitMoveSpeedFlatPassive: { amount: 20, durationSec: 2.0 },
  },
  // 온기가 필요한 자의 도끼 - 원문에 고유 패시브 설명이 없다(스탯 두 줄뿐).
  phageAxe: { id: 'phageAxe', nameKo: '온기가 필요한 자의 도끼', cost: 1200, recipe: ['longSword', 'dagger', 'longSword'], stats: { attackDamage: 20, attackSpeedPercent: 0.20 } },

  bladeOfTheRuinedKing: {
    id: 'bladeOfTheRuinedKing', nameKo: '몰락한 왕의 검', cost: 3200, recipe: ['vampiricScepter', 'recurveBow', 'pickaxe'],
    stats: { attackDamage: 40, attackSpeedPercent: 0.25 },
    physicalVampPercent: 0.10,
    // 안개의 검 - 기본 공격 시 "적 현재 체력"의 근접9%|원거리6%를 추가
    // 물리 피해로. 미니언/정글 몬스터 대상은 최대 100으로 캡(원문).
    mistsEdgePassive: { meleePercentCurrentHp: 0.09, rangedPercentCurrentHp: 0.06, nonChampionCap: 100 },
    // 할퀴는 그림자 - 챔피언에게 "3회" 기본 공격을 가하면 1초간 30% 둔화
    // (재사용대기시간 15초 - 챔피언에게만 적용, 원문이 챔피언으로 한정).
    scurryingStrikePassive: { hitsNeeded: 3, slowPercent: 0.30, slowDurationSec: 1.0, icdSec: 15 },
  },
  // 곡궁("독침": 기본 공격 시 15의 물리 피해 적중 시 효과) - 몰락한 왕의
  // 검/마법사의 최후 둘 다의 재료이면서 그 자체로도 완결된 에픽 아이템.
  recurveBow: { id: 'recurveBow', nameKo: '곡궁', cost: 700, recipe: ['dagger'], stats: { attackSpeedPercent: 0.15 }, onHitFlatPhysicalPassive: 15 },

  // 마법사의 최후 - 원문에 공격력/주문력이 전혀 없다(공격속도/마저/강인함 +
  // 온히트 고정 마법피해 뿐) - 수치를 지어내지 않고 그대로 비워둔다.
  witsEnd: {
    id: 'witsEnd', nameKo: '마법사의 최후', cost: 2800, recipe: ['recurveBow', 'negatronCloak', 'recurveBow'],
    stats: { attackSpeedPercent: 0.50, magicResist: 45 },
    tenacityPercent: 0.20,
    onHitFlatMagicDamage: 45,
  },

  eclipse: {
    id: 'eclipse', nameKo: '월식', cost: 2900, recipe: ['caulfieldsWarhammer', 'pickaxe', 'longSword'],
    stats: { attackDamage: 60, abilityHaste: 15 },
    // 늘 떠오르는 달 - 2초 내 "별개의" 기본 공격 또는 스킬로 같은 챔피언을
    // 2회 맞히면(icd 6초) 최대 체력 비례 추가 피해 + 2초 보호막(추가 공격력 비례).
    everRisingMoonPassive: {
      windowSec: 2.0, icdSec: 6.0,
      meleeMaxHpPercent: 0.08, rangedMaxHpPercent: 0.05,
      meleeShieldBase: 150, meleeShieldBonusAdPercent: 0.40,
      rangedShieldBase: 75, rangedShieldBonusAdPercent: 0.20,
      shieldDurationSec: 2.0,
    },
  },
  serratedDirk: { id: 'serratedDirk', nameKo: '톱날 단검', cost: 1000, recipe: ['longSword'], stats: { attackDamage: 20 }, armorPenFlat: 10 },

  // 마나무네 - "360의 최대 마나에 도달하면 무라마나로 변합니다"는 아래
  // muramana 완제품과 거의 동일한 스탯을 갖되 "충격"(온히트/스킬 적중 추가
  // 물리 피해)이 아직 없는 전 단계다. 조합 시스템(recipe)과는 별개로,
  // 아이템 하나가 "자기 자신을 다른 완제품으로 바꾸는" 변신 메커니즘은
  // buildOrBuyItem()의 하위템 소모 방식과 다르므로 item_system.js에
  // 전용 함수(_itemTickManamuneTransform)로 처리한다.
  manamune: {
    id: 'manamune', nameKo: '마나무네', cost: 2900, recipe: ['tearOfGoddess', 'caulfieldsWarhammer', 'longSword'],
    stats: { attackDamage: 35, mana: 500, abilityHaste: 15 },
    aweBonusAdPercentOfMana: 0.02,
    manaCirculationPassive: { maxManaPerHit: 3, maxManaPerChampionHit: 6, maxManaCap: 360, maxCharges: 4, rechargeSec: 8 },
    transformsInto: 'muramana',
    // 유일 아이템(마나순환 계열) - 실제 LoL에서 여신의 눈물/마나무네/
    // 무라마나는 전부 같은 "마나순환" 유일 아이템 그룹이다(티아맷/히드라와
    // 동일한 이유로 추가 - QA 요청).
    uniqueGroup: 'manaCirculation',
  },
  muramana: {
    id: 'muramana', nameKo: '무라마나', cost: 0, hiddenFromShop: true, // 마나무네가 변신해서만 얻는다(직접 구매 불가)
    stats: { attackDamage: 35, mana: 1000, abilityHaste: 15 },
    aweBonusAdPercentOfMana: 0.02,
    uniqueGroup: 'manaCirculation',
    // 충격 - 챔피언 기본 공격 시 마나의 1.2% 추가 물리(적중 시 효과),
    // 챔피언 대상 스킬 피해 시 근접 마나4%｜원거리 마나3% 추가 물리.
    shockPassive: { onHitManaPercent: 0.012, onAbilityHitMeleeManaPercent: 0.04, onAbilityHitRangedManaPercent: 0.03 },
  },

  maw: {
    id: 'maw', nameKo: '멜모셔스의 아귀', cost: 3100, recipe: ['spellbinder', 'caulfieldsWarhammer'],
    stats: { attackDamage: 60, magicResist: 40, abilityHaste: 15 },
    // 생명선 - 마법 피해로 체력이 30% 밑으로 떨어질 때 2.5초간 보호막
    // (근접200+추가AD150%｜원거리150+추가AD112.5%), 재사용대기시간 90초.
    // 발동하면 전투가 끝날 때까지(마지막 전투 행동 후 N초 - 이 프로젝트에
    // "전투 이탈" 판정이 따로 없어 생명선 보호막과 같은 길이로 근사) 모든
    // 피해 흡혈 10%를 얻는다.
    lifelinePassive: {
      hpThresholdPercent: 0.30, icdSec: 90, shieldDurationSec: 2.5,
      meleeShieldBase: 200, meleeShieldBonusAdPercent: 1.50,
      rangedShieldBase: 150, rangedShieldBonusAdPercent: 1.125,
      omnivampPercentAfterTrigger: 0.10, omnivampDurationSec: 2.5,
    },
  },
  // 주문포식자 - 원문에 레벨 비례 보호막(근접110~280｜원거리83~210)을 주는
  // 자체 "생명선"이 있지만, 멜모셔스의 아귀가 이미 같은 이름의 상위
  // 효과(추가 공격력 비례)를 갖고 있어 사실상 중복이고, 레벨 보간까지
  // 구현하면 이번 12종 범위를 벗어난다 - 주문포식자 자체의 생명선은
  // 생략하고 스탯(공격력/마법저항력)만 정확히 반영한다(명시적 범위 한계).
  spellbinder: { id: 'spellbinder', nameKo: '주문포식자', cost: 1300, recipe: ['longSword', 'longSword', 'negatronCloak'], stats: { attackDamage: 25, magicResist: 25 } },

  shojinSpear: {
    id: 'shojinSpear', nameKo: '쇼진의창', cost: 3100, recipe: ['pickaxe', 'tunnelers', 'rubyCrystal'],
    stats: { attackDamage: 45, maxHp: 450, abilityHaste: 25 }, // "드래곤의 힘"(기본 스킬 가속 +25)은 abilityHaste에 합산
    // 집중된 의지 - 스킬로 피해를 입힐 때마다 스택(최대 4, 스택당 3%,
    // 6초 지속·재적중 시 갱신) - 입히는 모든 피해에 곱연산으로 적용된다
    // (calculateDamage() 참고, ctrl.itemSpellDamageAmpPercent 필드 재사용).
    focusedWillPassive: { percentPerStack: 0.03, maxStacks: 4, durationSec: 6.0 },
  },
  caulfieldsWarhammer: { id: 'caulfieldsWarhammer', nameKo: '콜필드의 전투망치', cost: 1050, recipe: ['longSword', 'glowingMote', 'longSword'], stats: { attackDamage: 20, abilityHaste: 10 } },

  hullbreaker: {
    id: 'hullbreaker', nameKo: '선체파괴자', cost: 3000, recipe: ['tunnelers', 'ascendedPauldrons', 'pickaxe'],
    stats: { attackDamage: 40, maxHp: 500, moveSpeedPercent: 0.04 },
    // 선장 - 챔피언/에픽 몬스터 대상 5번째 기본 공격마다 추가 물리 피해.
    // 구조물 대상은 배율이 더 커진다. "승선 부대"(주변 공성/슈퍼 미니언
    // 방어력·마법저항력 버프)는 미니언에 임시 버프를 안전하게 걸었다가
    // 범위를 벗어나면 정확히 되돌리는 틱 구조가 필요해 이번 범위에서는
    // 생략한다(핵심 패시브인 "선장"만 구현 - 명시적 한계).
    captainPassive: {
      hitsNeeded: 5,
      meleePercentBaseAd: 1.20, meleePercentMaxHp: 0.05,
      rangedPercentBaseAd: 0.84, rangedPercentMaxHp: 0.035,
      meleeStructurePercentBaseAd: 3.00, meleeStructurePercentMaxHp: 0.10,
      rangedStructurePercentBaseAd: 2.10, rangedStructurePercentMaxHp: 0.07,
    },
  },
  tunnelers: { id: 'tunnelers', nameKo: '땅굴 채굴기', cost: 1150, recipe: ['longSword', 'rubyCrystal'], stats: { attackDamage: 15, maxHp: 250 } },
  ascendedPauldrons: { id: 'ascendedPauldrons', nameKo: '비상의 월갑', cost: 800, recipe: ['rubyCrystal'], stats: { maxHp: 200, moveSpeedPercent: 0.04 } },

  blackCleaver: {
    id: 'blackCleaver', nameKo: '칠흑의양날도끼', cost: 3000, recipe: ['devourerAxe', 'kircheisShard', 'pickaxe'],
    stats: { attackDamage: 45, maxHp: 400, abilityHaste: 20 },
    // 깎아내기 - 챔피언에게 물리 피해를 입힐 때마다 방어력 감소 스택(최대
    // 5, 스택당 6%, 6초 지속) - 기존 ARMOR_SHRED 상태이상 타입을 재사용한다
    // (가렌 E/레넥톤 E가 이미 쓰던 것과 동일한 타입, getArmorShredPercent()가
    // 자동으로 최신값을 읽는다).
    carvePassive: { shredPerStack: 0.06, maxStacks: 5, durationSec: 6.0 },
    // 열정 - 물리 피해를 입히면(대상 불문) 2초간 이동속도 +20(근접)/+10(원거리) -
    // MS_BUFF_FLAT 재사용.
    ragePassive: { meleeAmount: 20, rangedAmount: 10, durationSec: 2.0 },
  },
  kircheisShard: { id: 'kircheisShard', nameKo: '점화석', cost: 800, recipe: ['rubyCrystal', 'glowingMote'], stats: { maxHp: 200, abilityHaste: 10 } },

  divineSunderer: {
    id: 'divineSunderer', nameKo: '갈라진하늘', cost: 3100, recipe: ['tunnelers', 'caulfieldsWarhammer'],
    stats: { attackDamage: 45, maxHp: 450, abilityHaste: 10 },
    // 라이트쉴드 타격 - 대상(챔피언)별 재사용대기시간 10초. "치명타 적용,
    // 일반 치명타 피해량의 80%" 부분은 이 프로젝트의 치명타 배율 시스템과
    // 엮으면 챔피언마다 다른 critMultiplier를 전부 따라가야 해서 범위가
    // 과도하게 커진다 - 대신 설명된 수치 그대로(근접 기본공격력90%｜원거리
    // 기본공격력45% + 잃은 체력 4%)의 고정 보너스 물리 피해 + 그만큼 회복으로
    // 단순화했다(명시적 근사 - "치명타 적용" 연출만 생략, 수치는 원문 그대로).
    lightshieldStrikePassive: {
      icdPerTargetSec: 10,
      meleeBaseAdPercent: 0.90, rangedBaseAdPercent: 0.45,
      missingHpHealPercent: 0.04,
    },
  },

  // 끝없는 갈망 - 원문에 고유 패시브 설명이 전혀 없다(공격력 65 한 줄뿐).
  // 수치를 지어내지 않는다는 원칙에 따라 패시브를 추가하지 않고 순수
  // 스탯 아이템 그대로 둔다.
  eternalThirst: { id: 'eternalThirst', nameKo: '끝없는 갈망', cost: 3100, recipe: ['caulfieldsWarhammer', 'pickaxe', 'longSword'], stats: { attackDamage: 65 } },

  overlordsBloodmail: {
    id: 'overlordsBloodmail', nameKo: '지배자의 피갑옷', cost: 3300, recipe: ['tunnelers', 'tunnelers'],
    stats: { attackDamage: 35, maxHp: 550 },
    // 폭정/응징 - 둘 다 체력에 비례해 매 순간 바뀌는 동적 공격력 보너스라
    // recomputeItemStats()(구매/판매 시에만 재계산)가 아니라 itemSystemTick()
    // (매 프레임)에서 ctrl.itemDynamicBonusAD를 다시 계산한다.
    tyrannyPassive: { bonusHpToAdPercent: 0.025 },
    // 응징 - 잃은 체력 비율에 선형 비례해 공격력 최대 12%까지 증가, 체력
    // 30% 지점에서 이미 최대치에 도달(그 아래로는 더 늘지 않음 - 원문
    // "체력이 30% 아래일 경우 최대 응징 추가 효과가 적용됩니다").
    vengeancePassive: { maxAdPercent: 0.12, maxAtHpPercent: 0.30 },
  },

  // [전설급 아이템] 3차분 - 거대한히드라~수호천사(원문 760~812줄).
  giantsBelt: { id: 'giantsBelt', nameKo: '거인의 허리띠', cost: 900, recipe: ['rubyCrystal'], stats: { maxHp: 350 } },

  // 거대한히드라/발걸음분쇄기 공용 "쪼개기" - 기본 공격 적중 시 대상 본인에게
  // 최대체력 비례 추가 물리 피해 + "대상 뒤의 적들"에게 더 센 최대체력
  // 비례 물리 피해. 방향성("대상 뒤")은 이 프로젝트에 적 전용 좌표/진행
  // 방향 판정이 없어 티아맷 쪼개기와 동일한 "주변 반경" 판정으로 근사한다
  // (명시적 근사 - item_system.js 주석 참고). 구조물에는 적용하지 않는다(원문 그대로).
  titanicHydra: {
    id: 'titanicHydra', nameKo: '거대한히드라', cost: 3300, recipe: ['tiamat', 'tunnelers', 'giantsBelt'],
    stats: { attackDamage: 40, maxHp: 600 },
    uniqueGroup: 'hydra', // 티아맷 주석 참고
    // radiusGuessed: 쪼개기 반경도 원문에 수치가 없다 - 티아맷과 동일한
    // 근사 반경(250)을 썼다.
    cleaveMaxHpPassive: { meleeTargetPercent: 0.01, rangedTargetPercent: 0.005, meleeSplashPercent: 0.03, rangedSplashPercent: 0.015, radius: 250, radiusGuessed: true },
    // 거대한 초승달 - 즉시 피해를 주는 게 아니라 "다음 쪼개기"를 강화하는
    // 무장형 액티브(광휘의 검 스펠블레이드와 비슷한 "다음 평타 강화" 구조를
    // 재사용) - 10초 재사용대기시간.
    empoweredCleaveActive: { nameKo: '거대한 초승달', cooldownSec: 10, meleeTargetBonusPercent: 0.04, rangedTargetBonusPercent: 0.02, meleeSplashBonusPercent: 0.09, rangedSplashBonusPercent: 0.045 },
  },
  // 발걸음분쇄기 - 같은 "쪼개기" 패시브에 공격속도까지 추가되고, 액티브는
  // 즉시 발동형(범위 피해+둔화+적중당 이동속도 증가)으로 다르다.
  hydraOfHeroism: {
    id: 'hydraOfHeroism', nameKo: '발걸음분쇄기', cost: 3300, recipe: ['tiamat', 'devourerAxe', 'dagger'],
    stats: { attackDamage: 40, attackSpeedPercent: 0.25, maxHp: 450 },
    uniqueGroup: 'hydra', // 티아맷 주석 참고
    cleaveMaxHpPassive: { meleeTargetPercent: 0.01, rangedTargetPercent: 0.005, meleeSplashPercent: 0.03, rangedSplashPercent: 0.015, radius: 250, radiusGuessed: true },
    // 파괴의 충격파 - 즉시 범위 물리 피해 + 35% 둔화 + 맞은 챔피언 하나당
    // 35% 추가 이동속도(3초에 걸쳐 감소) - 재사용대기시간 15초.
    // radiusGuessed: 원문에 반경 수치가 없다 - 티아맷 초승달과 동일한
    // 근사 반경(400, 패시브 쪼개기보다 넓은 "범위형 액티브"이므로 더 크게)을 썼다.
    // durationGuessed: "35% 둔화시키고"까지만 있고 둔화 지속시간이 원문에
    // 없다(이동속도 쪽은 "3초에 걸쳐 감소"로 명시돼 있어 msDurationSec은
    // 원문 값) - 이 문서의 다른 짧은 군중 제어 지속시간과 비슷한 수준인
    // 2초를 근사치로 썼다.
    shockwaveActive: { nameKo: '파괴의 충격파', cooldownSec: 15, meleePercentAD: 0.80, rangedPercentAD: 0.40, radius: 400, radiusGuessed: true, slowPercent: 0.35, slowDurationSec: 2.0, durationGuessed: true, msPerChampionHitPercent: 0.35, msDurationSec: 3.0 },
  },

  sterakssGage: {
    id: 'sterakssGage', nameKo: '스테락의도전', cost: 3200, recipe: ['pickaxe', 'tunnelers', 'rubyCrystal'],
    stats: { maxHp: 400 },
    tenacityPercent: 0.20,
    // 잡아채는 발톱 - "기본 50%의 추가 공격력"은 챔피언 기본(레벨) 공격력의
    // 50%를 보너스 공격력으로 얻는다는 뜻으로 해석했다(마나무네 "경탄"과
    // 동일한 이유로 computeChampionStats()에서 기본 공격력을 다시 구해 쓴다).
    bonusAdPercentOfBaseAd: 0.50,
    // 생명선 - 멜모셔스의 아귀와 달리 피해 종류를 가리지 않는다(원문에
    // "마법 피해로"라는 제한이 없음 - "피해를 입으면"). 보호막은 추가 체력
    // 비례(정액+비례 없이 추가 체력의 60% 그 자체), 4.5초에 걸쳐 점차
    // 감소한다. "8초간 크기 10% 증가"는 순수 시각 효과라 생략한다.
    lifelinePassive: { hpThresholdPercent: 0.30, icdSec: 90, shieldDecaySec: 4.5, bonusHpShieldPercent: 0.60 },
  },

  deathsDance: {
    id: 'deathsDance', nameKo: '죽음의무도', cost: 3300, recipe: ['ironSeal', 'caulfieldsWarhammer'],
    stats: { attackDamage: 60, armor: 50, abilityHaste: 15 },
    // 고통 무시 - 받는 피해의 일부(근접 30%｜원거리 10%)를 즉시 받는 대신
    // 3초에 걸쳐 나눠 받는다. 반항 - 피해를 입힌 챔피언이 3초 안에 죽으면
    // 그 지속 피해가 사라지고 2초에 걸쳐 추가 공격력 75%만큼 회복한다.
    ignorePainPassive: { meleeDeferPercent: 0.30, rangedDeferPercent: 0.10, deferDurationSec: 3.0 },
    defiancePassive: { windowSec: 3.0, healBonusAdPercent: 0.75, healDurationSec: 2.0 },
  },
  guardianAngel: {
    id: 'guardianAngel', nameKo: '수호천사', cost: 3200, recipe: ['ironSeal', 'bfSword'],
    stats: { attackDamage: 55, armor: 45 },
    // 환생 - 치명적인 피해를 받아도 쓰러지지 않고 4초간 경직(무적+대상 지정
    // 불가, 기존 isUntargetable 재사용)된 뒤 체력 50%/마나 100% 회복.
    // 재사용대기시간 300초.
    revivePassive: { stasisDurationSec: 4.0, icdSec: 300, healHpPercent: 0.50, healMpPercent: 1.0 },
  },
};
const ITEM_ORDER = [
  'doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm',
  'cull', 'darkSeal', 'tearOfGoddess', 'healthPotion', 'refillablePotion', 'stealthWard',
  'controlWard', 'elixirOfIron', 'elixirOfSorcery', 'elixirOfWrath',
  'pickaxe', 'dagger', 'longSword', 'rubyCrystal', 'glowingMote', 'negatronCloak',
  'cloakOfAgility', 'blastingWand', 'sapphireCrystal', 'needlesslyLargeRod',
  'faerieCharm', 'rejuvenationBead', 'amplifyingTome', 'chainVest', 'bfSword',
  'boots', 'slightlyMagicalBoots', 'berserkersGreaves', 'sorcerersShoes',
  'ionianBootsOfLucidity', 'bootsOfSwiftness', 'platedSteelcaps', 'mercurysTreads', 'bootsOfGreed',
  'executionersCalling', 'vampiricScepter', 'lastWhisper', 'tiamat', 'sheen', 'embersOfFate', 'catalystOfAeons',
  'devourerAxe', 'phageAxe', 'recurveBow', 'serratedDirk', 'spellbinder', 'caulfieldsWarhammer', 'tunnelers', 'ascendedPauldrons', 'kircheisShard', 'ironSeal',
  'trinityForce', 'bladeOfTheRuinedKing', 'witsEnd', 'eclipse', 'manamune', 'muramana', 'maw', 'shojinSpear', 'hullbreaker', 'blackCleaver', 'divineSunderer', 'eternalThirst', 'overlordsBloodmail',
  'giantsBelt', 'titanicHydra', 'hydraOfHeroism', 'sterakssGage', 'deathsDance', 'guardianAngel',
];
// 상점 UI 카테고리 - 탭으로 묶어서 보여줄 때 쓴다(global_system_instances.js).
const ITEM_CATEGORIES = [
  { id: 'starter', nameKo: '시작 아이템', items: ['doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm', 'cull', 'darkSeal', 'tearOfGoddess'] },
  { id: 'consumable', nameKo: '소모품', items: ['healthPotion', 'refillablePotion', 'controlWard', 'elixirOfIron', 'elixirOfSorcery', 'elixirOfWrath'] }, // 투명 와드(트린켓)는 상점에서 사는 게 아니라 기본 장착 - 아래 트린켓 슬롯에 표시
  { id: 'basic', nameKo: '기본 아이템', items: ['pickaxe', 'dagger', 'longSword', 'rubyCrystal', 'glowingMote', 'negatronCloak', 'cloakOfAgility', 'blastingWand', 'sapphireCrystal', 'needlesslyLargeRod', 'faerieCharm', 'rejuvenationBead', 'amplifyingTome', 'chainVest', 'bfSword'] },
  { id: 'boots', nameKo: '신발', items: ['boots', 'slightlyMagicalBoots', 'berserkersGreaves', 'sorcerersShoes', 'ionianBootsOfLucidity', 'bootsOfSwiftness', 'platedSteelcaps', 'mercurysTreads', 'bootsOfGreed'] },
  // 중간 조립 아이템(전설급 2차분의 하위템이면서 그 자체로도 완결된 에픽
  // 아이템)도 여기 함께 넣는다 - 실제 LoL 상점도 조합 재료를 "서사급" 탭
  // 하나에서 같이 보여준다.
  { id: 'epic', nameKo: '서사급', items: ['executionersCalling', 'vampiricScepter', 'lastWhisper', 'tiamat', 'sheen', 'embersOfFate', 'catalystOfAeons', 'devourerAxe', 'phageAxe', 'recurveBow', 'serratedDirk', 'spellbinder', 'caulfieldsWarhammer', 'tunnelers', 'ascendedPauldrons', 'kircheisShard', 'giantsBelt', 'ironSeal'] },
  // 무라마나는 마나무네가 변신해서만 얻으므로(hiddenFromShop) 이 탭에 넣지 않는다.
  { id: 'legendary', nameKo: '전설급', items: ['trinityForce', 'bladeOfTheRuinedKing', 'witsEnd', 'eclipse', 'manamune', 'maw', 'shojinSpear', 'hullbreaker', 'blackCleaver', 'divineSunderer', 'eternalThirst', 'overlordsBloodmail', 'titanicHydra', 'hydraOfHeroism', 'sterakssGage', 'deathsDance', 'guardianAngel'] },
];
