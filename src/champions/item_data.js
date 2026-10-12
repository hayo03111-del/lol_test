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
    // 발화 - 스킬로 피해를 입히면(원문 그대로 스킬 한정 - item_system.js의
    // _itemIsAbilityDamage로 평타/도트 틱/아이템 효과 피해는 제외) 3초간
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
  // - "스킬로 피해를 입히면" 계열은 applyDamage()가 넘기는 피해 메타
  //   (isBasicAttack/isStatusTick/isItemEffect)로 스킬 피해만 골라 발동한다
  //   (item_system.js의 _itemIsAbilityDamage 참고).
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
    // 버그 수정(9차분 작업 중 발견): 원문(651~653줄)은 하위템으로 "곡궁,
    // 음전자 망토,곡궁"을 명시하는데, 지금까지는 음전자 망토(negatronMantle,
    // 이번에 처음 추가)가 없어 그 자리에 마법무효화의 망토(negatronCloak)를
    // 직접 썼다 - 완제품 자체 스탯(마법저항력 45)은 음전자 망토 쪽 수치와
    // 이미 일치해 전투 밸런스엔 영향이 없었지만, 조합 비용/상점의 "하위템"
    // 표시가 원문과 달랐다. 이번에 하위템이 생겨 정확한 재료로 바로잡는다.
    id: 'witsEnd', nameKo: '마법사의 최후', cost: 2800, recipe: ['recurveBow', 'negatronMantle', 'recurveBow'],
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

  // 끝없는 갈망 - 원문에는 "공격력 65" 한 줄뿐, 고유 패시브 설명이 전혀
  // 없었다(QA 요청 "고유효과가 없다면 찾아서 추가하라"). 이름(영문 "Endless
  // Hunger")과 하위템(콜필드의 전투망치+곡괭이)으로 실제 LoL 아이템을
  // 특정해 위키로 교차검증했다 - 기아(Famine, 추가 공격력 비례 스킬
  // 가속)와 포식(Feast, 처치 관여 시 흡혈full) 두 고유 패시브를 확인해
  // 추가한다(apSourceWiki와 동일한 성격의 passiveSourceWiki). 원문에 있는
  // 수치(가격 3100/하위템 3종 - 실제 LoL은 하위템이 2종뿐이라 약간 다름/
  // 공격력 65)는 "수치를 지어내지 않는다" 원칙에 따라 원문 그대로 둔다.
  eternalThirst: {
    id: 'eternalThirst', nameKo: '끝없는 갈망', cost: 3100, recipe: ['caulfieldsWarhammer', 'pickaxe', 'longSword'],
    stats: { attackDamage: 65 },
    passiveSourceWiki: true,
    // 기아 - 추가 공격력에 비례한 스킬 가속(근접이 더 높게 성장 - 위키
    // 기준 근접 13%/원거리 10%, 기본 +5). 다른 아이템 보너스를 더 살수록
    // 계속 바뀌는 동적 수치라 지배자의 피갑옷(폭정/응징)과 동일한 패턴
    // (itemSystemTick에서 매 프레임 재계산)으로 처리한다.
    faminePassive: { flatAbilityHaste: 5, meleeBonusAdPercent: 0.13, rangedBonusAdPercent: 0.10 },
    // 포식 - "3초 안에 피해를 입힌 챔피언이 죽으면 8초간 흡혈 15%". 오만
    // (명성)/죽음의무도(반항)과 완전히 동일한 구조·동일한 한계(이 데모는
    // 플레이어를 공격하는 적 챔피언 AI가 없어 "적 챔피언이 죽는" 일 자체가
    // 실전에서는 벌어지지 않는다 - itemOnChampionDeath() 주석 참고)를
    // 공유하는 범용 훅으로 둔다.
    feastPassive: { windowSec: 3.0, omnivampPercent: 0.15, durationSec: 8.0 },
  },

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

  // [전설급 아이템] 4차분 - 정수약탈자~도미닉 경의 인사(치명타 계열 10종,
  // 원문 814~913줄). 이번 배치에 새로 필요한 중간 조립 아이템 4종(열정의
  // 검/정찰병의 새총/절정의 화살/꽁지깃)도 함께 반영한다 - 2차분 때와 같은
  // 이유로(하위템을 숨기면 조합 자체가 성립하지 않음) 전부 독립적으로
  // 구매 가능한 서사급 탭 아이템으로 넣는다.
  zealSword: { id: 'zealSword', nameKo: '열정의 검', cost: 1200, recipe: ['cloakOfAgility', 'dagger'], stats: { attackSpeedPercent: 0.15, critChance: 0.15, moveSpeedPercent: 0.04 } },
  // 정찰병의 새총 "명중" - 챔피언에게 피해를 입히면(적중 시 효과) 40
  // 고정 마법 피해(재사용대기 40초) + 기본 공격 시(대상 불문) 이 쿨다운이
  // 1초 추가로 감소한다(공격하면서 싸우면 사실상 훨씬 자주 발동).
  scoutsSlingshot: {
    id: 'scoutsSlingshot', nameKo: '정찰병의 새총', cost: 600, recipe: ['dagger', 'dagger'],
    stats: { attackSpeedPercent: 0.20 },
    markmanshipPassive: { icdSec: 40, bonusMagicDamage: 40, cdrPerAttackSec: 1 },
  },
  peakArrow: { id: 'peakArrow', nameKo: '절정의 화살', cost: 1300, recipe: ['longSword', 'cloakOfAgility'], stats: { attackDamage: 15, critChance: 0.20 } },
  tailFeather: { id: 'tailFeather', nameKo: '꽁지깃', cost: 775, recipe: ['longSword'], stats: { attackDamage: 15, moveSpeedPercent: 0.04 } },

  // 정수약탈자 - 주문 검(스펠블레이드) 계열이지만 기존 삼위일체(순수 AD%)와
  // 달리 치명타 확률에도 비례하는 새 변형이다. sheen/trinityForce와 동일한
  // spellbladePassive 필드를 그대로 쓰되, 치명타 확률 비례 추가 항
  // (bonusPerCritChance/manaPerCritChance)을 선택적으로 더 두고 기존
  // 아이템들은 안 써서(undefined->0) 전혀 영향받지 않게 한다.
  essenceReaver: {
    id: 'essenceReaver', nameKo: '정수약탈자', cost: 3050, recipe: ['sheen', 'caulfieldsWarhammer', 'cloakOfAgility'],
    stats: { attackDamage: 50, abilityHaste: 20, critChance: 0.25 },
    spellbladePassive: { bonusAdPercent: 1.25, bonusPerCritChance: 50, manaAdPercent: 0.63, manaPerCritChance: 25, procCooldownSec: 1.5 },
  },
  // 징수의 총 - 죽음(처형)은 "이 피해로 체력이 5% 밑으로 떨어질 '만큼'
  // 이면" 완전히 처형한다는 뜻으로 해석했다(실제 LoL 수확자와 동일한
  // 취지 - 정확히 0 이하가 아니라 5% 문턱 전부를 처형 범위로 본다).
  // 세금(처치 시 +25골드)은 기존 "챔피언 처치 관여" 공용 훅
  // (itemOnChampionTakedown - 암흑의 인장/탐욕의 군화가 이미 쓰던 지점)을
  // 그대로 재사용한다.
  collector: {
    id: 'collector', nameKo: '징수의 총', cost: 3000, recipe: ['pickaxe', 'serratedDirk', 'cloakOfAgility'],
    stats: { attackDamage: 50, critChance: 0.25 }, armorPenFlat: 10,
    executePassive: { hpThresholdPercent: 0.05 },
    taxPassive: { goldOnTakedown: 25 },
  },
  // 마법광학 장치 C44 - 확대(거리 비례 추가 피해, 500거리에서 최대 10%) +
  // 비전 조준(피해 입힌 챔피언이 3초 내 사망 시 8초간 사거리+100). 후자는
  // 죽음의무도 "반항"과 동일한 이유(이 데모엔 플레이어를 공격하는 적 AI가
  // 없어 실제로 발동할 조건이 생기지 않음)로 범용 훅만 정확히 만들어두고
  // README에 한계를 명시한다.
  magicOpticsC44: {
    id: 'magicOpticsC44', nameKo: '마법광학 장치 C44', cost: 2800, recipe: ['pickaxe', 'peakArrow', 'longSword'],
    stats: { attackDamage: 55, critChance: 0.25 },
    magnifyPassive: { maxBonusPercent: 0.10, maxDistanceLol: 500 },
    arcaneFocusPassive: { windowSec: 3.0, bonusRangeLol: 100, bonusDurationSec: 8.0 },
  },
  // 윤 탈 야생화살 - "연습이 치명타를 낳는다"(영구 치명타 누적, 최대 25%) +
  // "명중"(적 챔피언 공격 시 6초간 공격속도+30%, 재사용대기 30초, 기본
  // 공격 시 1초/치명타 적중 시 추가 2초 감소).
  rageblade: {
    id: 'rageblade', nameKo: '윤 탈 야생화살', cost: 3000, recipe: ['bfSword', 'scoutsSlingshot', 'longSword'],
    stats: { attackDamage: 50, attackSpeedPercent: 0.45 },
    permanentCritPassive: { meleeCritPerHit: 0.004, rangedCritPerHit: 0.002, maxCritChance: 0.25 },
    marksmanshipActivePassive: { icdSec: 30, attackSpeedBonusPercent: 0.30, buffDurationSec: 6.0, cdrPerAttackSec: 1, cdrPerCritSec: 2 },
  },
  // 크라켄 학살자 - 벼락(3번째 평타마다 잃은 체력 비례 추가 물리 피해,
  // 8~18레벨 구간에서 선형 성장). 원문에 레벨 구간 밖(1~7, 19+)의 수치가
  // 없어 7레벨 이하는 8레벨 값, 19레벨 이상은 18레벨 값으로 고정한다(흔한
  // "구간 성장" 해석). 괄호 안의 1.75배 값(262.5~350/210~280)은 모든
  // 다른 수치와 정확히 1.75배 관계라 "비챔피언(몬스터) 대상" 값으로 읽었다 -
  // 이 프로젝트엔 정글 몬스터가 없어 사실상 쓰이지 않는다(명시적 한계,
  // 선체파괴자의 에픽 몬스터 분기와 동일한 성격).
  krakenSlayer: {
    id: 'krakenSlayer', nameKo: '크라켄 학살자', cost: 3000, recipe: ['tailFeather', 'phageAxe', 'recurveBow'],
    stats: { attackDamage: 45, attackSpeedPercent: 0.40, moveSpeedPercent: 0.04 },
    boltsPassive: { hitsNeeded: 3, meleeMin: 150, meleeMax: 200, rangedMin: 120, rangedMax: 160, levelMin: 8, levelMax: 18 },
  },
  // 폭풍갈퀴 - 충전 상태(이동하거나 공격하면 충전되고, 충전 상태에서
  // 공격하면 소모) + 번개(충전 소모 시 100 추가 마법 피해 + 1.5초간
  // 이동속도 45%). "충전까지 걸리는 시간"이 원문에 없어(durationGuessed)
  // 실제 LoL 폭풍갈퀴류 아이템의 근사치(2초)를 썼다.
  stormrazor: {
    id: 'stormrazor', nameKo: '폭풍갈퀴', cost: 3200, recipe: ['bfSword', 'cloakOfAgility', 'scoutsSlingshot'],
    stats: { attackDamage: 50, attackSpeedPercent: 0.20, critChance: 0.25 },
    chargePassive: { chargeTimeSec: 2.0, durationGuessed: true, bonusMagicDamage: 100, msBuffPercent: 0.45, msBuffDurationSec: 1.5 },
  },
  // 유령무희 - 망령의 왈츠(상시 유체화 - 이동 시 미니언/챔피언과 충돌하지
  // 않음). 지속시간/트리거 조건이 원문에 없고 "유체화 상태가 됩니다"만
  // 적혀 있어 상시 지속 패시브로 해석했다. 한계(명시): 이 프로젝트는
  // 미니언/챔피언과의 물리적 충돌(이동 차단) 자체를 구현하지 않은 완전한
  // 자유 이동 모델이라, "유체화"가 막아줄 충돌이 애초에 존재하지 않는다 -
  // 즉 이 패시브는 사실상 평소와 차이가 없는 무해한 플래그로만 반영한다.
  phantomDancer: {
    id: 'phantomDancer', nameKo: '유령무희', cost: 2650, recipe: ['dagger', 'zealSword', 'dagger'],
    stats: { attackSpeedPercent: 0.65, critChance: 0.25, moveSpeedPercent: 0.10 },
    ghostingPassive: true,
  },
  // 고속연사포 - 저격수(충전 상태로 공격 시 40 추가 마법 피해 + 사거리
  // 35% 증가, 최대 150유닛까지만). 폭풍갈퀴와 같은 충전 상태 메커니즘을
  // 공유한다(chargePassive).
  rapidFireCannon: {
    id: 'rapidFireCannon', nameKo: '고속연사포', cost: 2650, recipe: ['zealSword', 'scoutsSlingshot'],
    stats: { attackSpeedPercent: 0.35, critChance: 0.25, moveSpeedPercent: 0.04 },
    chargePassive: { chargeTimeSec: 2.0, durationGuessed: true, bonusMagicDamage: 40, bonusRangePercent: 0.35, bonusRangeCapLol: 150 },
  },
  // 나보리 명멸검 - 깨달음(기본 공격 시 기본 스킬 남은 쿨다운 15% 감소).
  // "남은" 쿨다운이라 즉시 쓸 재사용대기시간이 없으면(쿨다운 중이 아니면)
  // 효과가 없다 - 기존 챔피언 쿨다운 필드(cooldowns.Q/W/E/R)를 직접
  // 비율로 줄인다.
  naboriFlickerblade: {
    id: 'naboriFlickerblade', nameKo: '나보리 명멸검', cost: 2650, recipe: ['dagger', 'zealSword', 'dagger'],
    stats: { attackSpeedPercent: 0.40, critChance: 0.25, moveSpeedPercent: 0.04 },
    enlightenmentPassive: { cdrPercentOfRemaining: 0.15 },
  },
  // 도미닉 경의 인사 - 거인 학살자(대상 추가 체력 비례 챔피언 대상 추가
  // 피해, 최대 15%, 추가 체력 1500에서 최대 도달 - 지배자의 피갑옷
  // "응징"과 동일한 선형 보간 패턴을 재사용한다).
  lordDominiksRegards: {
    id: 'lordDominiksRegards', nameKo: '도미닉 경의 인사', cost: 3300, recipe: ['lastWhisper', 'peakArrow'],
    stats: { attackDamage: 35, critChance: 0.25 }, armorPenPercent: 0.35,
    giantSlayerPassive: { maxBonusPercent: 0.15, maxAtBonusHp: 1500 },
  },

  // [전설급 아이템] 5차분 - 필멸자의 운명~세릴다의 원한(치명타 계열 나머지
  // 11종, 원문 915~1023줄). 이번에 새로 필요해진 하위템 "야수화"도 함께
  // 반영한다. "최후의 대검"(필멸자의 운명의 하위템)은 원문 전체에서 이
  // 한 곳에만 등장하고 별도 정의가 없다 - 다른 9개 아이템이 전부
  // "최후의 속삭임"이라고 정확히 적는 것과 비교하면 오탈자일 가능성이
  // 매우 높아, lastWhisper로 해석했다(명시적 해석 - 존재하지 않는 id를
  // 만들거나 가격을 지어내지 않는다는 원칙과 동일한 선상에서, 유일하게
  // 합리적인 기존 아이템에 매칭했다).
  feralization: { id: 'feralization', nameKo: '야수화', cost: 1337, recipe: ['glowingMote', 'pickaxe'], stats: { attackDamage: 25, abilityHaste: 10 }, armorPenFlat: 5 },

  // 필멸자의 운명 - 고통스러운 상처는 처형인의 대검과 완전히 동일한
  // grievousOnHitPassive 필드를 재사용한다(이미 챔피언 대상 물리 피해
  // 시 그리버스를 거는 공용 로직이 있음 - 새 코드 불필요).
  mortalReminder: {
    id: 'mortalReminder', nameKo: '필멸자의 운명', cost: 3000, recipe: ['executionersCalling', 'lastWhisper', 'cloakOfAgility'],
    stats: { attackDamage: 35, critChance: 0.25 }, armorPenPercent: 0.30,
    grievousOnHitPassive: { percent: 0.40, durationSec: 3.0 },
  },

  // 경계 - 그림자(기본 공격 시 고정+추가공격력%+주문력% 온히트 마법 피해) +
  // 빛과 어둠(챔피언 상대 기본 공격마다 번갈아 빛/어둠을 적용 - 빛은
  // 방어력+마법저항력, 어둠은 방어구 관통력+마법 관통력을 얻고 각각 최대
  // 3중첩까지 쌓인다. 1중첩 수치(6~8, 레벨비례)의 정확히 3배가 "최대"로
  // 명시돼 있어 중첩 해석이 원문과 정확히 일치한다).
  vigilance: {
    id: 'vigilance', nameKo: '경계', cost: 3000, recipe: ['phageAxe', 'recurveBow'],
    stats: { attackDamage: 30, attackSpeedPercent: 0.35 },
    onHitHybridPassive: { flat: 30, bonusAdPercent: 0.10, apPercent: 0.10 },
    lightDarkPassive: { lightArmorMrMin: 6, lightArmorMrMax: 8, levelMin: 1, levelMax: 18, darkPenPercentPerStack: 0.10, maxStacks: 3, durationSec: 5.0 },
  },

  // 구인수의 격노검 - 분노(기본 공격 시 고정 마법 피해, 기존
  // onHitFlatMagicDamage 재사용) + 들끓는 일격(공격속도 스택 최대 4,
  // 32%, 최대 중첩 도달 시 3번째 평타마다 적중 시 효과 2회 적용 - "분노"의
  // 고정 마법 피해가 두 번 들어간다).
  wrathblade: {
    id: 'wrathblade', nameKo: '구인수의 격노검', cost: 3000, recipe: ['amplifyingTome', 'recurveBow', 'pickaxe'],
    stats: { attackDamage: 30, abilityPower: 30, attackSpeedPercent: 0.25 },
    onHitFlatMagicDamage: 30,
    ragingBlowsPassive: { asPerStack: 0.08, maxStacks: 4, doubleProcHitsNeeded: 3 },
  },

  // 무한의 대검 - 치명타 피해량(critDamagePercent)은 이번에 새로 만든
  // 전역 필드로, calculateDamage()가 각 챔피언이 넘기는 critMultiplier에
  // 더해서 반영한다(공용 필드가 아니라 호출부마다 다른 값을 넘기는 구조라
  // 이렇게 할 수밖에 없다 - 00_global_constants.js 주석 참고).
  infinityEdge: {
    id: 'infinityEdge', nameKo: '무한의 대검', cost: 3500, recipe: ['bfSword', 'pickaxe', 'cloakOfAgility'],
    stats: { attackDamage: 75, critChance: 0.25 },
    critDamagePercent: 0.30,
  },

  // 불멸의 철갑궁 - 생명선. 멜모셔스의 아귀(공격력 비례)/스테락의도전
  // (추가 체력 비례)과 또 다른 세 번째 형태 - 레벨에 선형 비례하는
  // "고정" 보호막(levelScaledShield 플래그로 구분)이고, 스테락의도전과
  // 달리 감쇠 없이 3초간 그대로 유지된다(원문에 "점차 감소" 언급 없음).
  immortalShieldbow: {
    id: 'immortalShieldbow', nameKo: '불멸의 철갑궁', cost: 3000, recipe: ['pickaxe', 'peakArrow'],
    stats: { attackDamage: 55, critChance: 0.25 },
    lifelinePassive: { hpThresholdPercent: 0.30, icdSec: 90, shieldDurationSec: 3.0, levelScaledShield: true, meleeShieldMin: 400, meleeShieldMax: 700, rangedShieldMin: 320, rangedShieldMax: 560, levelMin: 1, levelMax: 18 },
  },

  // 피바라기 - 생명력 회복(physicalVampPercent, 기존 필드 재사용) +
  // 영액의 보호막(흡혈로 최대 체력을 초과해 회복하려는 양을 보호막으로
  // 전환, 레벨 8~18 구간 선형 성장 - "8레벨부터 증가한다"를 다른
  // 아이템들과 동일한 8~18 레벨 구간 관례로 해석했다. 8레벨 미만은
  // 8레벨 값(165)으로 고정).
  bloodthirster: {
    id: 'bloodthirster', nameKo: '피바라기', cost: 3400, recipe: ['bfSword', 'pickaxe', 'vampiricScepter'],
    stats: { attackDamage: 80 }, physicalVampPercent: 0.15,
    overhealShieldPassive: { minShield: 165, maxShield: 315, levelMin: 8, levelMax: 18 },
  },

  // 요우무의 유령검 - 출몰(전투 이탈 시 이동속도 증가 - 이 프로젝트엔
  // "전투 이탈" 판정이 없어 기존 마나 재생 패시브가 쓰던 "최근 챔피언
  // 피해를 주거나/받은 적 없음" 타임스탬프를 그대로 재사용한다. "얼마나
  // 지나야 전투 이탈로 보는지"가 원문에 없어 다른 전투 판정 윈도우와
  // 비슷한 5초로 근사했다 - durationGuessed) + 망령의 발걸음(사용형
  // 액티브, 45초 쿨다운 - 이동속도 증가 + 유체화(유령무희와 동일한 이유로
  // 실질적 효과는 없음 - 명시적 한계)).
  youmuusGhostblade: {
    id: 'youmuusGhostblade', nameKo: '요우무의 유령검', cost: 2800, recipe: ['serratedDirk', 'tailFeather', 'longSword'],
    stats: { attackDamage: 55, moveSpeedPercent: 0.04 }, armorPenFlat: 18,
    outOfCombatMsPassive: { meleeAmount: 20, rangedAmount: 10, outOfCombatSec: 5.0, durationGuessed: true },
    ghostStepActive: { nameKo: '망령의 발걸음', cooldownSec: 45, meleeDurationSec: 6.0, rangedDurationSec: 4.0, meleeMsPercent: 0.20, rangedMsPercent: 0.15 },
  },

  // 벼락폭풍검 - 전류 자극(적 챔피언에게 스킬로 피해를 입히면 충전 상태
  // 준비 - 폭풍갈퀴/고속연사포의 "이동/공격으로 충전"과는 트리거 자체가
  // 달라 별도 필드(skillChargePassive)로 둔다) + 창공(충전 소모 시
  // 4초간 물리 관통력 획득 + 대상 현재 체력 비례 추가 물리 피해, 비챔피언
  // 대상 최대 200).
  stormsurge: {
    id: 'stormsurge', nameKo: '벼락폭풍검', cost: 3000, recipe: ['feralization', 'longSword', 'longSword'],
    stats: { attackDamage: 55, abilityHaste: 10 }, armorPenFlat: 10,
    skillChargePassive: {},
    skywardPassive: { durationSec: 4.0, meleeArmorPenFlat: 15, rangedArmorPenFlat: 12, meleeCurrentHpPercent: 0.09, rangedCurrentHpPercent: 0.07, nonChampionCap: 200 },
  },

  // 오만 - 명성(피해를 입힌 챔피언이 3초 안에 죽으면 90초간 공격력 증가,
  // 처치할 때마다 추가로 쌓인다 - 지배자의 피갑옷/도미닉 경의 인사 등과
  // 동일한 "적 AI 없음" 한계를 그대로 안고 있지만, 정확하게 구현해둔다).
  hubris: {
    id: 'hubris', nameKo: '오만', cost: 2800, recipe: ['serratedDirk', 'caulfieldsWarhammer'],
    stats: { attackDamage: 55, abilityHaste: 10 }, armorPenFlat: 18,
    renownPassive: { windowSec: 3.0, baseAD: 12, adPerKill: 3, durationSec: 90 },
  },

  // 요새파괴자 - 성형작약(스킬로 챔피언에게 피해 시 추가 고정 피해, 자신의
  // 물리 방어구 관통력 비례, 재사용대기 20초) + 파괴 공작(처치 관여 시
  // 90초간 "파괴 공작" 보유 - 그 상태로 에픽 몬스터/포탑 공격 시 3초에
  // 걸친 거대한 고정 피해. 이 프로젝트엔 정글 몬스터가 없어 포탑 분기만
  // 구현한다(명시적 한계 - 선체파괴자 등과 동일한 성격). "스킬로" 피해를
  // 입히는 트리거는 원문 그대로 스킬 피해에만 발동한다.
  fortressBreaker: {
    id: 'fortressBreaker', nameKo: '요새파괴자', cost: 3000, recipe: ['feralization', 'serratedDirk'],
    stats: { attackDamage: 55, abilityHaste: 15 }, armorPenFlat: 22,
    shapedChargePassive: { icdSec: 20, meleeFlat: 50, meleeArmorPenPercentOfStat: 1.50, rangedFlat: 15, rangedArmorPenPercentOfStat: 0.75 },
    sabotagePassive: { windowSec: 3.0, durationSec: 90, dotDurationSec: 3.0, meleeFlat: 300, meleeArmorPenPercentOfStat: 25.0, rangedFlat: 240, rangedArmorPenPercentOfStat: 20.0 },
  },

  // 세릴다의 원한 - 매서운 추위(스킬로 체력 50% 이하인 적에게 피해를
  // 입히면 1초간 30% 둔화 - "스킬로"는 다른 아이템과 동일한 한계로 평타+
  // 스킬 전체에 근사한다).
  serylasGrudge: {
    id: 'serylasGrudge', nameKo: '세릴다의 원한', cost: 3000, recipe: ['caulfieldsWarhammer', 'lastWhisper'],
    stats: { attackDamage: 45, abilityHaste: 15 }, armorPenPercent: 0.35,
    frostPassive: { hpThresholdPercent: 0.50, slowPercent: 0.30, slowDurationSec: 1.0 },
  },

  // [전설급 아이템] 6차분 - 주문력 계열 시작. 메자이의 영혼약탈자(원문
  // 1025~1032줄)는 암흑의 인장의 직접 업그레이드다 - gloryPassive 필드를
  // 공유하는 두 번째 아이템이라, 이번에 item_system.js의 itemOnChampionTakedown()/
  // itemOnChampionDeath()에 있던 "darkSeal로 하드코딩된" 숨은 버그를 먼저
  // 고쳤다(QA 재점검 - README 참고). 어시스트(중첩 2회)는 이 데모에
  // "아군 챔피언" 개념이 없어 암흑의 인장 때와 동일하게 구현하지 않는다.
  mejaisSoulstealer: {
    id: 'mejaisSoulstealer', nameKo: '메자이의 영혼약탈자', cost: 1500, recipe: ['darkSeal'],
    stats: { abilityPower: 20, maxHp: 100 },
    gloryPassive: { apPerStack: 5, maxStacks: 25, takedownStacks: 4, deathLossStacks: 10 },
    // 10중첩 이상일 때 이동 속도 10% 상승 - 암흑의 인장에는 없는 메자이의
    // 영혼약탈자만의 추가 효과라 별도 필드로 둔다.
    soulboundMsPassive: { stackThreshold: 10, moveSpeedPercent: 0.10 },
  },

  // [전설급 아이템] 7차분 - 주문력 계열 본격 시작(영겁의지팡이~균열생성기).
  // 원문(1034~1150줄)의 하위템 중 5종(사라진 양피지/악마의 마법서/마법공학
  // 교류 발전기/에테르 환영/기괴한 가면)은 지금까지 읽지 않았던 원문
  // 앞부분(460~579줄 - 에픽 아이템 모음)에 전부 완전한 스탯으로 정의돼
  // 있었다 - 위키를 참고할 필요 없이 원문만으로 전부 채웠다. 위키는
  // "영겁의지팡이"의 "최대 중첩에 도달하면 레벨이 오릅니다"라는 원문 문장이
  // 오역/수사적 표현이 아니라 실제 LoL 아이템(Rod of Ages)의 진짜 메커니즘
  // (스택 10개를 채우면 챔피언 레벨이 1 오름)이라는 것만 교차검증했다.
  lostChapter: {
    id: 'lostChapter', nameKo: '사라진 양피지', cost: 1200, recipe: ['amplifyingTome', 'sapphireCrystal', 'glowingMote'],
    stats: { abilityPower: 40, mana: 300, abilityHaste: 10 },
    // 깨우치기 - "레벨 업하면 3초 동안 최대 마나의 20%를 회복합니다."
    // 레벨업 훅(itemOnLevelUp)이 character_controller.js의 levelUp()에서
    // 새로 호출된다(아래 rodOfAges의 "불멸의 시간"으로 인한 레벨업도
    // 동일한 levelUp()을 거치므로 자동으로 함께 발동한다).
    enlightenPassive: { manaPercentOverTime: 0.20, durationSec: 3.0 },
  },
  fiendishCodex: {
    id: 'fiendishCodex', nameKo: '악마의 마법서', cost: 850, recipe: ['amplifyingTome', 'glowingMote'],
    stats: { abilityPower: 25, abilityHaste: 10 },
  },
  hextechAlternator: {
    id: 'hextechAlternator', nameKo: '마법공학 교류 발전기', cost: 1100, recipe: ['amplifyingTome'],
    stats: { abilityPower: 45 },
    // 자극 - "챔피언에게 피해를 입히면 65의 마법 피해를 추가로 입힙니다"
    // (재사용대기시간 40초). 루덴의메아리/로켓벨트/폭풍쇄도/그림자불꽃/
    // 마법공학총검 등 이 아이템을 하위템으로 쓰는 완제품들은 전부 자기
    // 고유의 이름 붙은 패시브를 따로 갖고 있어(원문에 "자극"을 다시 언급한
    // 곳이 없음), 이 패시브는 교류 발전기를 완제품으로 바꾸지 않고 그
    // 자체로 들고 있을 때만 적용된다(다른 하위템들과 동일한 원칙 - 완제품은
    // 자기 스탯/패시브를 전부 새로 명시한다).
    procOnChampionDamagePassive: { icdSec: 40, flatMagicDamage: 65 },
  },
  aetherialWisp: {
    id: 'aetherialWisp', nameKo: '에테르 환영', cost: 900, recipe: ['amplifyingTome'],
    stats: { abilityPower: 30, moveSpeedPercent: 0.04 },
  },
  hauntingGuise: {
    id: 'hauntingGuise', nameKo: '기괴한 가면', cost: 1300, recipe: ['amplifyingTome', 'rubyCrystal'],
    stats: { abilityPower: 30, maxHp: 200 },
    // 광기 - "적 챔피언과 전투 중 매초 2%의 추가 피해(최대 6%)". "전투 중"의
    // 정확한 판정 기준(몇 초간 피해를 안 주고받아야 이탈로 보는지)이 원문에
    // 없어, 이미 있는 요우무의 유령검 "출몰"의 5초 기준을 그대로 재사용했다
    // (durationGuessed - item_data.js 공용 관례).
    combatRampPassive: { percentPerSec: 0.02, maxPercent: 0.06, outOfCombatSec: 5.0, durationGuessed: true },
  },

  rodOfAges: {
    id: 'rodOfAges', nameKo: '영겁의지팡이', cost: 2600, recipe: ['blastingWand', 'catalystOfAeons'],
    stats: { abilityPower: 45, maxHp: 350, mana: 400 },
    // 영원 - 억겁의 카탈리스트와 완전히 동일한 문구/수치(원문 1042~1043줄이
    // 511줄과 토씨 하나 안 틀리고 같다). itemOnManaSpent()가 'catalystOfAeons'
    // id로 하드코딩돼 있던 걸 manaSpentToHealPercent 필드 보유 여부로 범용화
    // 했다(암흑의 인장 영광 하드코딩 버그와 동일한 패턴 - QA 재점검).
    manaOnDamagePercent: 0.07, manaSpentToHealPercent: 0.25, manaSpentHealCapPerSec: 20,
    // 불멸의 시간 - 60초마다 체력10/마나20/주문력3씩 최대 10중첩(체력100/
    // 마나200/주문력30)까지 쌓이고, 10중첩에 도달하는 "그 순간" 챔피언
    // 레벨이 1 오른다(위키로 교차검증한 실제 메커니즘 - 아래 주석 참고).
    timelessPassive: { intervalSec: 60, hpPerStack: 10, manaPerStack: 20, apPerStack: 3, maxStacks: 10, levelUpOnMax: true },
  },
  archangelsStaff: {
    id: 'archangelsStaff', nameKo: '대천사의지팡이', cost: 2900, recipe: ['tearOfGoddess', 'lostChapter', 'fiendishCodex'],
    stats: { abilityPower: 70, mana: 600, abilityHaste: 25 },
    // 경탄(마나1%)의 주문력) - 마나무네/무라마나의 aweBonusAdPercentOfMana와
    // 동일한 구조지만 공격력이 아니라 주문력을 주므로 별도 필드로 둔다.
    aweBonusApPercentOfMana: 0.01,
    // 마나순환 - 여신의 눈물/마나무네와 수치가 다르다(원문을 다시 확인한
    // 결과 충전 5회·적중당 5마나로 챔피언 배수 언급이 없음 - 추측이 아니라
    // 원문 1053~1054줄을 그대로 옮긴 값).
    manaCirculationPassive: { maxManaPerHit: 5, maxManaPerChampionHit: 5, maxManaCap: 360, maxCharges: 5, rechargeSec: 8 },
    transformsInto: 'seraphsEmbrace',
    // 유일 아이템(마나순환 계열) - 마나무네/무라마나와 같은 그룹에 둬서
    // 대천사의지팡이 계열과 동시에 들 수 없게 한다(실제 LoL과 동일).
    uniqueGroup: 'manaCirculation',
  },
  seraphsEmbrace: {
    id: 'seraphsEmbrace', nameKo: '대천사의포옹', cost: 0, hiddenFromShop: true, // 대천사의지팡이가 변신해서만 얻는다
    stats: { abilityPower: 70, mana: 1000, abilityHaste: 25 },
    aweBonusApPercentOfMana: 0.02,
    uniqueGroup: 'manaCirculation',
    // 생명선 - "체력이 30% 밑으로 떨어질 만큼 피해를 입으면 3초 동안
    // (마나18%)의 피해를 흡수하는 보호막"(재사용대기 90초). 멜모셔스의
    // 아귀(AD 비례)/스테락의도전(추가체력 비례)/불멸의 철갑궁(레벨 비례)에
    // 이은 네 번째 생명선 형태 - 마나 비례라 manaPercentShield로 구분한다.
    lifelinePassive: { manaPercentShield: true, hpThresholdPercent: 0.30, shieldManaPercent: 0.18, shieldDurationSec: 3.0, icdSec: 90 },
  },
  malignance: {
    id: 'malignance', nameKo: '악의', cost: 2700, recipe: ['lostChapter', 'blastingWand'],
    stats: { abilityPower: 90, mana: 600, abilityHaste: 15 },
    // 경멸 - "궁극기 가속이 20 증가합니다." 스킬 가속(abilityBonusHaste)과
    // 별개로 R 쿨다운에만 적용되는 전용 필드. character_controller.js의
    // _dispatchCast()가 공용 지점이므로 거기서 마지막으로 시전한 슬롯(R
    // 여부)만 기록해두면(ctrl._itemLastCastSlot) 챔피언 파일을 건드리지
    // 않고도 R 전용 가속을 구현할 수 있다.
    ultimateHasteFlat: 20,
    // 증오안개 - "궁극기로 적 챔피언에게 피해를 입힐 때마다 3초 동안 대상
    // 발밑의 지면을 불태워 매초 60+주문력5%의 마법 피해를 입히고 마법
    // 저항력을 10 감소시킵니다. 입힌 피해량에 따라 반경이 늘어납니다(최대
    // 반경 550)." 반경이 피해량에 따라 늘어나는 정확한 비례식은 원문에
    // 없어(최대값 550 자체는 원문 수치 그대로 - 추측 아님), 매 발동마다
    // 원문이 준 최대 반경을 그대로 쓰는 것으로 단순화했다(비례식만 생략 -
    // radiusGuessed는 "반경 수치 자체"가 추측일 때 쓰는 플래그라 여기선
    // 쓰지 않는다). "궁극기로"는 ctrl._itemLastCastSlot==='R'이고 그
    // 캐스트로부터 짧은 시간(rDamageWindowMs) 안에 이 피해가 발생했는지로
    // 판정한다(원문에 정확한 판정 창이 없어 durationGuessed류로 플래그).
    hatefogPassive: { dmgPerSec: 60, apPercentPerSec: 0.05, mrShred: 10, durationSec: 3.0, maxRadius: 550, rDamageWindowMs: 500, rDamageWindowGuessed: true },
  },
  blackfireTorch: {
    id: 'blackfireTorch', nameKo: '어둠불꽃횃불', cost: 2800, recipe: ['lostChapter', 'embersOfFate'],
    stats: { abilityPower: 80, mana: 600, abilityHaste: 20 },
    // 악의의 불길 - 운명의 재(embersOfFate)의 발화와 동일한 트리거 근사
    // (스킬+평타 전체)로, 주문력 비례가 추가된 버전. 몬스터는 매초 20의
    // "추가" 피해(원문 그대로 - 기본 20+AP2%에 20을 더함).
    burnOnDamagePassive: { id: 'blackfireTorchBurn', durationSec: 3.0, baseDmgPerSec: 20, apPercentPerSec: 0.02, monsterBonusPerSec: 20 },
    // 어둠불꽃 - "악의의 불길에 영향을 받는 적 챔피언/에픽 몬스터/대형
    // 몬스터 하나당 주문력 4% 증가." 이 엔진엔 에픽/대형 몬스터 구분이 없어
    // (훈련용 더미를 포함한) 챔피언 단위로만 센다 - item_system.js의
    // _itemBlackfireBurnTargets가 현재 불타고 있는 대상 수를 추적한다.
    // "주문력 N% 증가"는 합연산이 아니라 라바돈의 죽음모자와 같은 총
    // 주문력 곱연산(itemTotalApMultiplierBonus, 이번에 새로 만든 공용 필드)이다.
    blackfirePassive: { apPercentPerStack: 0.04 },
  },
  ludensEcho: {
    id: 'ludensEcho', nameKo: '루덴의메아리', cost: 2750, recipe: ['lostChapter', 'hextechAlternator'],
    stats: { abilityPower: 100, mana: 600, abilityHaste: 10 },
    // 메아리(재사용대기 12초) - "메아리 6개 발사, 주 대상+주변 적에게
    // (75+주문력5%) 추가 마법 피해. 남은 메아리는 주 대상에게 20%씩 발사."
    // 이 엔진엔 "주변 적 여러 명"을 동시에 쫓아다니는 광역 투사체 시스템이
    // 없어, 주변에 다른 적이 전혀 없을 때의 실제 LoL 수치(모든 메아리가
    // 주 대상에게 집중 - 기본 100% + 나머지 5발×20% = 총 200%)로 단순화했다.
    ludensEchoPassive: { icdSec: 12, baseDmg: 75, apPercent: 0.05, totalEchoes: 6, redirectPercent: 0.20 },
  },
  hextechRocketbelt: {
    id: 'hextechRocketbelt', nameKo: '마법공학 로켓 벨트', cost: 2650, recipe: ['hextechAlternator', 'kircheisShard', 'rubyCrystal'],
    stats: { abilityPower: 60, maxHp: 350, abilityHaste: 20 },
    // 초음속(재사용대기 50초) - "지정 방향으로 돌진하며 부채꼴로 100+
    // 주문력10% 마법 피해, 지형은 통과 불가." 이 프로젝트의 돌진(점멸형
    // 이동)은 챔피언마다 제각각 구현돼 있고 아이템 공용 경로에서 캐릭터를
    // 실제로 옮기는 범용 함수가 없어(명시적 한계 - 챔피언 파일을 전부
    // 건드리는 위험을 피함), 돌진으로 인한 이동 자체는 생략하고 자신 주변
    // 범위(findEnemiesInRadius - 다른 액티브 아이템들과 동일한 패턴) 마법
    // 피해만 재현했다. 반경은 원문에 없어 추측(radiusGuessed).
    rocketbeltActive: { nameKo: '초음속', cooldownSec: 50, baseDmg: 100, apPercent: 0.10, radius: 400, radiusGuessed: true },
  },
  rylaisCrystalScepter: {
    id: 'rylaisCrystalScepter', nameKo: '라일라이의수정홀', cost: 2600, recipe: ['blastingWand', 'giantsBelt', 'amplifyingTome'],
    stats: { abilityPower: 65, maxHp: 400 },
    // 서리 - "스킬로 적에게 피해를 입히면 1초 동안 30% 둔화" (다른
    // 아이템들과 동일한 스킬+평타 근사, 챔피언/미니언 구분 없이 원문 그대로 적용).
    frostOnDamagePassive: { slowPercent: 0.30, slowDurationSec: 1.0 },
  },
  liandrysTorment: {
    id: 'liandrysTorment', nameKo: '리안드리의 고통', cost: 3000, recipe: ['hauntingGuise', 'embersOfFate'],
    stats: { abilityPower: 60, maxHp: 300 },
    // 고통 - "스킬로 피해를 입히면 3초 동안 적을 불태워 매초 최대 체력의
    // 2%에 해당하는 마법 피해." 적용 시점의 최대 체력을 스냅샷해서 3초간
    // 균등하게 나눠 입힌다(운명의 재 등 기존 DOT들과 동일한 totalDamage/
    // duration 모델 - 매 틱 다시 계산하지 않음, 명시적 단순화).
    burnPercentMaxHpPassive: { id: 'liandrysBurn', durationSec: 3.0, percentOfMaxHpPerSec: 0.02 },
    // 고난 - 기괴한 가면의 "광기"와 완전히 동일한 문구/수치(원문 1127~1128줄).
    combatRampPassive: { percentPerSec: 0.02, maxPercent: 0.06, outOfCombatSec: 5.0, durationGuessed: true },
  },
  cosmicDrive: {
    id: 'cosmicDrive', nameKo: '우주의추진력', cost: 3000, recipe: ['kircheisShard', 'aetherialWisp', 'fiendishCodex'],
    stats: { abilityPower: 70, maxHp: 350, abilityHaste: 25, moveSpeedPercent: 0.04 },
    // 마법의 춤 - "적 챔피언에게 마법 또는 고정 피해를 입히면 4초 동안
    // 이동 속도가 20 증가합니다." 기존 MS_BUFF_FLAT(칠흑의양날도끼 "열정" 등)을
    // 재사용 - 재적중 시 지속시간만 갱신되고 중첩되지 않는다.
    dancePassive: { msFlat: 20, durationSec: 4.0 },
  },
  riftmaker: {
    id: 'riftmaker', nameKo: '균열생성기', cost: 3100, recipe: ['hauntingGuise', 'fiendishCodex'],
    stats: { abilityPower: 70, maxHp: 350, abilityHaste: 15 },
    // 공허의 부패 - 기괴한 가면/리안드리의 고통과 같은 구조의 전투 중
    // 누적 추가 피해지만 최대치가 8%로 더 높고, 최대치에 도달하면 모든
    // 피해 흡혈(근접10%｜원거리6%)을 추가로 얻는다(onMaxVamp).
    combatRampPassive: {
      percentPerSec: 0.02, maxPercent: 0.08, outOfCombatSec: 5.0, durationGuessed: true,
      onMaxVamp: { meleePercent: 0.10, rangedPercent: 0.06 },
    },
    // 공허의 마력 - "추가 체력의 2%만큼 주문력을 얻습니다." 스테락의도전의
    // bonusAdPercentOfBaseAd(기본 공격력 비례)와 유사한 구조지만 이쪽은
    // "추가 체력"(itemBonusMaxHp 등 합산된 보너스 최대 체력) 비례다.
    apPercentOfBonusHp: 0.02,
  },

  // [전설급 아이템] 8차분 - 주문력 계열 2차(황혼과새벽~마법공학총검, 7종 +
  // 하위템 1종). 원문(1151~1214줄). 신규 하위템은 "역병의 보석" 하나뿐이고
  // (490~494줄에 이미 완전한 스탯으로 있었다), 나머지 하위템은 전부 기존
  // 아이템 재사용이다. "에테르 환영"이 리치베인 쪽 원문(1172줄)에서는
  // "애테르 환영"으로 오타가 나 있지만, 스탯이 동일한 같은 아이템을
  // 가리키는 게 명백해 같은 id(aetherialWisp)로 매핑했다.
  plagueGem: {
    id: 'plagueGem', nameKo: '역병의 보석', cost: 1100, recipe: ['amplifyingTome'],
    stats: { abilityPower: 25 },
    // 마법 관통력 13%(퍼센트) - 공허의지팡이(40%)와 공용 필드
    // (magicPenPercent, 이번에 새로 추가한 곱연산 관통력)를 쓴다.
    magicPenPercent: 0.13,
  },
  duskAndDawn: {
    id: 'duskAndDawn', nameKo: '황혼과새벽', cost: 3100, recipe: ['sheen', 'blastingWand', 'kircheisShard', 'dagger'],
    stats: { abilityPower: 60, maxHp: 300, attackSpeedPercent: 0.20, abilityHaste: 20 },
    // 주문 검 - 기존 spellbladePassive를 확장했다(damageType: 마법 피해로
    // 전환, bonusApPercent 신규 추가, extraProc: "적중 시 효과를 추가로
    // 1회 적용"을 스펠블레이드 자체 피해가 2번 들어가는 것으로 단순화 -
    // 이 엔진엔 "다른 온히트 효과들을 전부 다시 트리거"하는 범용 재생
    // 시스템이 없어, 가장 직접적인 해석인 "이 피해 자체가 한 번 더"로
    // 근사했다) + 체력 회복(주문력10%+추가체력3%).
    spellbladePassive: {
      procCooldownSec: 1.5, bonusAdPercent: 0.75, bonusApPercent: 0.10, damageType: 'MAGICAL', extraProc: true,
      healApPercent: 0.10, healBonusHpPercent: 0.03,
    },
  },
  nashorsTooth: {
    id: 'nashorsTooth', nameKo: '내셔의이빨', cost: 2900, recipe: ['recurveBow', 'blastingWand', 'fiendishCodex'],
    stats: { abilityPower: 80, attackSpeedPercent: 0.50, abilityHaste: 15 },
    // 이케시아의 이빨 - "기본 공격 시 15+주문력15%의 마법 피해(적중 시
    // 효과)". 기존 onHitFlatMagicDamage(순수 숫자)와 달리 주문력 비례가
    // 있어 별도 객체 필드로 둔다.
    onHitMagicDamagePassive: { flat: 15, apPercent: 0.15 },
  },
  lichBane: {
    id: 'lichBane', nameKo: '리치베인', cost: 2900, recipe: ['sheen', 'aetherialWisp', 'blastingWand'],
    stats: { abilityPower: 100, moveSpeedPercent: 0.06, abilityHaste: 10 },
    // 주문 검(마법 피해, 공격력75%+주문력45%) + "주문 검을 사용 가능할 때
    // 50%의 공격속도를 얻습니다" - attackSpeedWhileReadyPercent는
    // character_controller.js가 매 프레임 itemSpellbladeReadyAttackSpeedPercent()로
    // 읽어 "무장 중인 동안만" 적용한다(영구 스탯이 아님).
    spellbladePassive: { procCooldownSec: 1.5, bonusAdPercent: 0.75, bonusApPercent: 0.45, damageType: 'MAGICAL', attackSpeedWhileReadyPercent: 0.50 },
  },
  voidStaff: {
    id: 'voidStaff', nameKo: '공허의지팡이', cost: 3000, recipe: ['plagueGem', 'blastingWand'],
    stats: { abilityPower: 95 },
    magicPenPercent: 0.40,
  },
  tempestStaff: {
    id: 'tempestStaff', nameKo: '폭풍쇄도', cost: 2800, recipe: ['hextechAlternator', 'aetherialWisp'],
    stats: { abilityPower: 90, magicPenFlat: 15, moveSpeedPercent: 0.06 },
    // 폭풍 약탈자 - "2.5초 내로 챔피언 최대 체력의 25%에 해당하는 피해를
    // 입히면 질풍을 적용"(대상별 재사용대기시간 30초로 해석 - "폭풍
    // 약탈자(30초)"가 쿨다운 표기와 같은 자리에 있다). 질풍 - 2초 후 단일
    // 대상 125+주문력10% 마법 피해, 가격 전에 대상이 죽으면 즉시 넓은
    // 범위에 폭발(반경은 원문에 없어 추측 - radiusGuessed).
    squallPassive: { windowSec: 2.5, hpThresholdPercent: 0.25, icdSec: 30 },
    galePassive: { delaySec: 2.0, baseDmg: 125, apPercent: 0.10, explosionRadius: 400, radiusGuessed: true },
  },
  shadowflame: {
    id: 'shadowflame', nameKo: '그림자불꽃', cost: 3200, recipe: ['hextechAlternator', 'needlesslyLargeRod'],
    stats: { abilityPower: 110, magicPenFlat: 15 },
    // 잿덩이꽃 - 체력 40% 이하인 적에게 마법/고정 피해 시 20% 추가 피해.
    // "치명타 피해량 관련 능력치는 잿덩이꽃의 추가 피해량에만 영향을
    // 줍니다" - 무한의 대검 등 itemBonusCritDamagePercent가 이 20%
    // 자체에만 곱해진다(전체 피해가 아니라).
    cinderbloomPassive: { hpThresholdPercent: 0.40, bonusPercent: 0.20 },
  },
  hextechGunblade: {
    id: 'hextechGunblade', nameKo: '마법공학총검', cost: 3000, recipe: ['vampiricScepter', 'hextechAlternator', 'amplifyingTome'],
    stats: { attackDamage: 40, abilityPower: 80 }, allDamageVampPercent: 0.10,
    // 번개 화살(재사용대기 60초) - 적 챔피언 전용 단일 대상 액티브(이
    // 엔진에서 "자기 주변 범위"가 아니라 "현재 선택한 적 챔피언 1명"을
    // 노리는 최초의 아이템 액티브 - ctrl.currentTarget을 그대로 쓴다).
    // 175~253은 레벨 비례(원문에 정확한 구간이 없어 챔피언 전체 레벨
    // 범위인 1~18로 해석 - 두 끝값(175/253) 자체는 원문 수치 그대로).
    noxiousBladeActive: { nameKo: '번개 화살', cooldownSec: 60, minDmg: 175, maxDmg: 253, levelMin: 1, levelMax: 18, apPercent: 0.30, slowPercent: 0.25, slowDurationSec: 1.5 },
  },

  // [전설급 아이템] 9차분 - 방어형/유틸 아이템(벤시의장막~해신작쇼, 8종 +
  // 하위템 6종). 원문(1216~1288줄 + 521~610줄의 하위템). 라바돈의
  // 죽음모자만 원문에 자체 주문력 수치가 빠져 있어(조합 비용/패시브는
  // 있는데 "주문력 N" 줄만 누락 - 명백한 전사 누락) 위키로 교차검증해서
  // 130(실제 LoL과 조합 비용 3500원까지 정확히 일치)을 채웠다.
  negatronMantle: {
    id: 'negatronMantle', nameKo: '음전자 망토', cost: 850, recipe: ['negatronCloak'],
    stats: { magicResist: 45 },
  },
  chainmailVest: {
    id: 'chainmailVest', nameKo: '쇠사슬조끼', cost: 800, recipe: ['chainVest'],
    stats: { armor: 40 },
  },
  crystallineBracer: {
    id: 'crystallineBracer', nameKo: '수정 팔 보호구', cost: 800, recipe: ['rubyCrystal', 'rejuvenationBead'],
    stats: { maxHp: 200, hpRegenPercent: 1.0 },
  },
  ghostlyHood: {
    id: 'ghostlyHood', nameKo: '망령의 두건', cost: 1250, recipe: ['rubyCrystal', 'negatronCloak', 'rejuvenationBead'],
    stats: { maxHp: 200, magicResist: 35, hpRegenPercent: 1.0 },
  },
  verdantBarrier: {
    id: 'verdantBarrier', nameKo: '신록의 장벽', cost: 1600, recipe: ['negatronCloak', 'amplifyingTome', 'amplifyingTome'],
    stats: { abilityPower: 40, magicResist: 25 },
    // 무효화(60초) - 벤시의장막과 달리 "챔피언에게 피해를 입으면 재사용
    // 대기시간이 초기화됩니다" 조항이 원문에 없다(그 조항은 벤시의장막
    // 전용 - 1223줄에만 있고 이 하위템 자체 설명(541~547줄)엔 없음).
    nullifyPassive: { icdSec: 60 },
  },
  // 추적자의 팔목 보호대 - "시간 정지"를 한 번만 쓸 수 있는 소모성 액티브
  // (존야의모래시계와 완전히 동일한 경직 효과를 공유 - stasisActive 재사용,
  // maxUses:1로만 구분). 한 번 쓰면 부러진 팔목 보호대로 자동 변신하지만
  // (조각난 시간 - "상점에서 부서진 팔목 보호대만 살 수 있다"), 스탯은
  // 동일하고 존야의모래시계로 조합하는 데도 아무 지장이 없다(원문 그대로).
  pursuerWristGuard: {
    id: 'pursuerWristGuard', nameKo: '추적자의 팔목 보호대', cost: 1600, recipe: ['amplifyingTome', 'chainVest', 'amplifyingTome'],
    stats: { abilityPower: 40, armor: 25 },
    stasisActive: { nameKo: '시간 정지', durationSec: 2.50, maxUses: 1, transformsAfterUse: 'brokenWristGuard' },
  },
  brokenWristGuard: {
    id: 'brokenWristGuard', nameKo: '부러진 팔목 보호대', cost: 0, hiddenFromShop: true, // 추적자의 팔목 보호대가 액티브를 쓰면 변신(직접 구매 불가)
    stats: { abilityPower: 40, armor: 25 },
    // 조각난 시간 - "팔목 보호대는 망가졌지만 업그레이드는 가능합니다."
    // 액티브(시간 정지)는 이미 소모돼 더 이상 없고, 상위 조합(존야의모래시계)
    // 재료 자격만 그대로 유지한다(stasisActive 필드 자체가 없음).
  },

  banshees: {
    id: 'banshees', nameKo: '벤시의장막', cost: 3000, recipe: ['needlesslyLargeRod', 'verdantBarrier'],
    stats: { abilityPower: 105, magicResist: 40 },
    // 무효화(40초) + "챔피언에게 피해를 입으면 아이템 재사용 대기시간이
    // 초기화됩니다"(resetOnChampionDamage) - 신록의 장벽에는 없는 벤시의장막
    // 전용 추가 조항. 원문 그대로("초기화") 보수적으로 해석해, 이미 방어막이
    // 떠 있는 상태에서는 건드리지 않고 "아직 충전 중일 때"만 타이머를 다시
    // 0부터 센다(이미 생긴 방어막을 도로 없애지 않는 쪽이 안전한 해석).
    nullifyPassive: { icdSec: 40, resetOnChampionDamage: true },
  },
  zhonyasHourglass: {
    id: 'zhonyasHourglass', nameKo: '존야의모래시계', cost: 3250, recipe: ['needlesslyLargeRod', 'pursuerWristGuard'],
    stats: { abilityPower: 105, armor: 50 },
    stasisActive: { nameKo: '시간 정지', cooldownSec: 120, durationSec: 2.50 },
  },
  rabadonsDeathcap: {
    id: 'rabadonsDeathcap', nameKo: '라바돈의 죽음모자', cost: 3500, recipe: ['needlesslyLargeRod', 'needlesslyLargeRod'],
    // 주문력 130 - 원문에 수치가 누락돼 위키로 교차검증(위 배치 주석 참고).
    stats: { abilityPower: 130 }, apSourceWiki: true,
    // 신비한 작품 - "총 주문력이 30% 증가합니다"(itemTotalApMultiplierBonus 재사용).
    totalApMultiplierPercent: 0.30,
  },
  heartsteel: {
    id: 'heartsteel', nameKo: '강철심장', cost: 3000, recipe: ['giantsBelt', 'crystallineBracer', 'giantsBelt'],
    stats: { maxHp: 900, hpRegenPercent: 1.0 },
    // 거인의 흡수(대상별 재사용대기 30초) - "700 사거리 내 챔피언을 상대로
    // 3초간 충전, 충전된 공격은 70+체력6% 추가 물리 피해 + 그 피해의 10%만큼
    // 영구 최대 체력 획득." 12차: 사거리 안 적 챔피언마다 따로 충전(원작 방식, item_system.js).
    giantAbsorbPassive: { rangeLol: 700, chargeSec: 3.0, icdSec: 30, flatDmg: 70, bonusHpPercent: 0.06, maxHpGainPercent: 0.10 },
    // 거인 - "최대 체력 1000당 크기가 3% 증가(최대 30%)". 전투에 영향을 주는
    // 수치가 아니라 모델 크기(시각 효과)라 ctrl.root.scale에 직접 반영한다.
    titanicPassive: { hpPerScaleStep: 1000, scalePercentPerStep: 0.03, maxScalePercent: 0.30 },
  },
  warmogsArmor: {
    id: 'warmogsArmor', nameKo: '워모그의 갑옷', cost: 3100, recipe: ['giantsBelt', 'giantsBelt', 'crystallineBracer'],
    // 워모그의 활력 - "아이템 체력의 12%에 해당하는 추가 체력". 1000(이
    // 아이템 자신이 주는 체력)의 12%=120을 더해 1120을 그대로 최종 스탯으로
    // 박아뒀다(자기 자신을 참조하는 1회성 파생값이라 별도 공용 필드를 만들
    // 필요가 없었다).
    stats: { maxHp: 1120, hpRegenPercent: 1.0 },
    // 워모그의 심장 - "추가 체력이 2000 이상일 때, 8초 동안 피해를 입지
    // 않으면 초당 3% 체력 회복(챔피언이 아닌 대상에게는 3초)". 챔피언
    // 전용/비챔피언 전용 두 타임스탬프(_itemLastTookChampionDamageAt,
    // 이번에 새로 만든 _itemLastTookAnyDamageAt)를 따로 확인한다.
    warmogsHeartPassive: { bonusHpThreshold: 2000, champOutOfCombatSec: 8.0, nonChampOutOfCombatSec: 3.0, percentPerSec: 0.03 },
  },
  endlessDespair: {
    id: 'endlessDespair', nameKo: '끝없는 절망', cost: 2800, recipe: ['chainmailVest', 'kircheisShard', 'rubyCrystal'],
    stats: { maxHp: 400, armor: 50, abilityHaste: 15 },
    // 고뇌 - "챔피언과 전투 중일 때 4초마다 주변 적 챔피언에게 추가체력3%
    // 마법 피해 + 피해량의 250%만큼 체력 회복." "전투 중" 판정은 요우무의
    // 유령검 "출몰"과 동일한 5초 기준(durationGuessed)을 재사용한다. 반경은
    // 원문에 없어 추측(radiusGuessed).
    agonyPassive: { intervalSec: 4.0, bonusHpPercent: 0.03, healPercentOfDamage: 2.50, radius: 400, radiusGuessed: true, outOfCombatSec: 5.0, durationGuessed: true },
  },
  spiritVisage: {
    id: 'spiritVisage', nameKo: '정령의형상', cost: 2700, recipe: ['ghostlyHood', 'kircheisShard'],
    stats: { maxHp: 400, magicResist: 50, abilityHaste: 10, hpRegenPercent: 1.0 },
    // 무한한 활력 - "자신이 받는 모든 체력 회복 및 보호막 효과가 25% 증가."
    // 이 엔진의 공용 회복/보호막 경로(기본 재생/HoT 큐/흡혈/생명선)에만
    // 적용된다 - 챔피언마다 따로 구현된 자체 회복 스킬은 한계로 남긴다
    // (스킬 가속과 동일한 "9개 챔피언 한정" 성격의 한계 - README 명시).
    healingReceivedBonusPercent: 0.25,
  },
  abyssalMask: {
    id: 'abyssalMask', nameKo: '해신작쇼', cost: 3200, recipe: ['chainmailVest', 'negatronMantle', 'giantsBelt'],
    stats: { maxHp: 350, armor: 45, magicResist: 45 },
    // 공허 태생의 저항력 - "챔피언과 5초 이상 전투를 벌이면 강화되어 전투가
    // 끝날 때까지 추가 방어력 및 마법 저항력이 30% 증가." 기존 임시 스탯
    // 인프라(itemTempArmorBonus/itemTempMrBonus)를 재사용 - "전투 종료"
    // 판정은 다른 아이템들과 동일한 5초 이탈 기준을 그대로 쓴다.
    voidbornResiliencePassive: { combatDurationSec: 5.0, bonusPercent: 0.30, outOfCombatSec: 5.0, durationGuessed: true },
  },

  // [서포터 아이템] 세계지도집 -> 룬 나침반 -> 세계의 결실 -> 5종 업그레이드
  // (원문 79~112줄 + 1290~1362줄). 이 프로젝트에 "아군 챔피언"/"포지션"
  // 개념이 없어(어시스트를 구현하지 않은 것과 동일한 이유) 서포터 전용
  // 제한(배정이 서포터가 아니면 구매 불가)과 "근처 아군"을 요구하는
  // 조건은 "플레이어 자신"으로 근사한다 - 아래 각 패시브 주석 참고.
  worldAtlas: {
    id: 'worldAtlas', nameKo: '세계지도집', cost: 0,
    stats: { maxHp: 30, hpRegenPercent: 0.25, mpRegenPercent: 0.25 },
    // 서포터 퀘스트 - "이 아이템으로 400골드를 획득하면 룬 나침반으로
    // 변합니다." "이 아이템으로"는 재물 공유(spoilsOfWarPassive)로 번
    // 골드만 센다는 뜻으로 해석했다(일반 골드 전체가 아님) - 아래
    // _itemGrantSupportGold()가 이 누적을 전담한다.
    questPassive: { goldThreshold: 400, transformsInto: 'runesteelSpaulders' },
    // 재물 공유(재사용대기 20초, 최대 충전 3회, 첫 충전은 게임 시작 65초
    // 후) - 미니언 처형은 원문대로 "아군 챔피언 근처에서"만 발동한다(아군
    // 더미 기준 - ally_system.js). 범위 1050은 미확인(이전 서포터 아이템
    // 공개 수치). 미니언 처형 문턱(근접50%｜원거리30%)과 충전 소모는 원문
    // 93~95줄의 상세 설명을 그대로 반영했다.
    spoilsOfWarPassive: {
      maxCharges: 3, rechargeSec: 20, firstChargeDelaySec: 65, allyNearbyRadius: 1050, allyNearbyRadiusGuessed: true,
      meleeDamageGold: 22, rangedDamageGold: 20, minionGold: 15,
      minionHpThresholdMelee: 0.50, minionHpThresholdRanged: 0.30,
    },
  },
  runesteelSpaulders: {
    id: 'runesteelSpaulders', nameKo: '룬나침반', cost: 0, hiddenFromShop: true, // 세계지도집의 퀘스트 완료로만 얻는다
    stats: { maxHp: 100, hpRegenPercent: 0.5, mpRegenPercent: 0.5 },
    questPassive: { goldThreshold: 800, transformsInto: 'bountyOfWorlds' },
    spoilsOfWarPassive: {
      maxCharges: 3, rechargeSec: 20, firstChargeDelaySec: 65, allyNearbyRadius: 1050, allyNearbyRadiusGuessed: true,
      meleeDamageGold: 24, rangedDamageGold: 22, minionGold: 20,
      minionHpThresholdMelee: 0.50, minionHpThresholdRanged: 0.30,
    },
    // 아이템사용(충전량 3회, 상점 이용 시 재충전) - 기존 제어 와드와 같은
    // 필드(wardPlacement)를 쓰되 maxStack이 아니라 maxCharges로 소모된다
    // (_useControlWard()를 이번에 범용화했다 - item_system.js 주석 참고).
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 3, refillOnShopUse: true,
  },
  bountyOfWorlds: {
    id: 'bountyOfWorlds', nameKo: '세계의 결실', cost: 0, hiddenFromShop: true, // 룬 나침반의 퀘스트 완료로만 얻는다
    stats: { maxHp: 200, hpRegenPercent: 0.75, mpRegenPercent: 0.75 },
    // 10초당 골드 5 - 여기서부터는 재물 공유 대신 시간당 고정 골드로
    // 바뀐다(원문에 재물 공유 문구가 다시 나오지 않음).
    goldPerIntervalPassive: { gold: 5, intervalSec: 10 },
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 4, refillOnShopUse: true,
    // "비용 소모 없이 피의 노래/천상의 이의/꿈 생성기/자자크의 세계가시/
    // 태양의 썰매로 업그레이드할 수 있습니다" - 아래 5종이 전부
    // recipe:['bountyOfWorlds']+cost:0이라 기존 buildOrBuyItem()이 이미
    // "조합 비용 0원"으로 그대로 처리한다(새 메커니즘 불필요).
  },
  zaZaksRealmspike: {
    id: 'zaZaksRealmspike', nameKo: '자자크의 세계가시', cost: 0, recipe: ['bountyOfWorlds'],
    stats: { maxHp: 200, hpRegenPercent: 0.75, mpRegenPercent: 0.75 },
    goldPerIntervalPassive: { gold: 5, intervalSec: 10 },
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 4, refillOnShopUse: true,
    // 공허 폭발(재사용대기 10초) - "챔피언에게 스킬로 피해를 입히면"(평타+
    // 스킬 전체 근사) 대상 위치에 폭발 - 대상+주변 적에게 10+주문력15%+
    // 최대체력3% 마법 피해. "몬스터 대상 추가 피해량은 최대 300" - 최대
    // 체력 비례 항을 몬스터 한정 300으로 캡한다(챔피언은 캡 없음). 반경은
    // 원문에 없어 추측(radiusGuessed).
    voidBurstPassive: { icdSec: 10, baseDmg: 10, apPercent: 0.15, maxHpPercent: 0.03, monsterMaxHpBonusCap: 300, radius: 400, radiusGuessed: true },
  },
  bloodsong: {
    id: 'bloodsong', nameKo: '피의 노래', cost: 0, recipe: ['bountyOfWorlds'],
    stats: { maxHp: 200, hpRegenPercent: 0.75, mpRegenPercent: 0.75 },
    goldPerIntervalPassive: { gold: 5, intervalSec: 10 },
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 4, refillOnShopUse: true,
    // 주문 검(1.5초) - "기본공격력 신규 100%"(신규=순수 base AD 100%,
    // 다른 스펠블레이드 계열과 동일한 "기본공격력" 표현 - QA 재점검으로
    // 전부 base AD를 쓰도록 고친 공용 로직을 그대로 재사용) + 약점 노출
    // (대상이 챔피언이면 4초간 받는 피해 근접8%｜원거리5% 증가 - 새
    // VULNERABLE 상태이상, calculateDamage()가 최종 피해에 곱한다).
    spellbladePassive: { procCooldownSec: 1.5, bonusAdPercent: 1.0, exposeWeaknessPassive: { durationSec: 4.0, meleePercent: 0.08, rangedPercent: 0.05 } },
  },
  solsticeSleigh: {
    id: 'solsticeSleigh', nameKo: '태양의 썰매', cost: 0, recipe: ['bountyOfWorlds'],
    stats: { maxHp: 200, hpRegenPercent: 0.75, mpRegenPercent: 0.75 },
    goldPerIntervalPassive: { gold: 5, intervalSec: 10 },
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 4, refillOnShopUse: true,
    // 썰매 질주(재사용대기 30초) - "적 챔피언을 둔화 또는 이동 불가 상태로
    // 만들면 50~230(레벨비례) 체력 회복 + 자신과 주변 체력이 가장 낮은
    // 아군이 2.5초간 이동속도 20% 획득." 아군이 없는 이 데모는 자신에게만
    // 이동속도를 적용한다(명시적 한계 - 어시스트 생략과 동일한 이유).
    ccTriggerPassive: { icdSec: 30, minHeal: 50, maxHeal: 230, levelMin: 1, levelMax: 18, msPercent: 0.20, msDurationSec: 2.5, allyRadius: 1000, allyRadiusGuessed: true },
  },
  dreamMaker: {
    id: 'dreamMaker', nameKo: '꿈 생성기', cost: 0, recipe: ['bountyOfWorlds'],
    stats: { maxHp: 200, hpRegenPercent: 0.75, mpRegenPercent: 0.75 },
    goldPerIntervalPassive: { gold: 5, intervalSec: 10 },
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 4, refillOnShopUse: true,
    // 꿈 생성기(8초) - 8초마다 파란/보라 꿈 거품을 얻고, 다른 아군 챔피언을
    // 회복시키거나 보호막을 씌우면 두 거품을 3초 동안 그 아군에게 넘긴다.
    // 파란 거품: 미니언이 아닌 출처의 다음 피해를 50~194(내 레벨) 감소.
    // 보라 거품: 그 아군의 다음 피해 공격/스킬에 40~160(내 레벨) 추가 마법
    // 피해(챔피언 아닌 대상 광역 피해는 33.3%). 수치는 공개 자료(26.11) 기준 -
    // 원본 자료에 수치가 없었다. 아군 더미는 공격하지 않아 보라 거품은 걸리기만
    // 하고 터지지 않는다.
    dreamBubblePassive: { intervalSec: 8, allyDurationSec: 3, blueMin: 50, blueMax: 194, purpleMin: 40, purpleMax: 160, purpleNonChampionAoePercent: 0.333, levelMin: 1, levelMax: 18 },
  },
  celestialOpposition: {
    id: 'celestialOpposition', nameKo: '천상의 이의', cost: 0, recipe: ['bountyOfWorlds'],
    stats: { maxHp: 200, hpRegenPercent: 0.75, mpRegenPercent: 0.75 },
    goldPerIntervalPassive: { gold: 5, intervalSec: 10 },
    wardPlacement: { placeRange: 600, visionRadius: 900, durationSec: 60, hitsToDestroy: 1 },
    durationSecGuessed: true,
    maxCharges: 4, refillOnShopUse: true,
    // 산의 축복 - "챔피언으로부터 받는 피해가 근접35%｜원거리25% 감소,
    // 챔피언에게 피해를 받은 후 2초간 지속, 보호막이 깨지면(=2초 뒤
    // 자연 만료) 주변에 충격파(1.5초 50% 둔화). 18초 동안 피해를 받지
    // 않으면 효과가 초기화됩니다"는 "다시 맞으면 2초가 갱신될 뿐이라 18초
    // 리셋은 이 단순화에서 관찰 가능한 차이를 만들지 않는다"고 판단해
    // 별도 구현 없이 생략했다(명시적 근사). 반경은 원문에 없어 추측
    // (radiusGuessed). 기존 DAMAGE_REDUCTION 상태이상을 재사용한다.
    mountainsBlessingPassive: { meleePercent: 0.35, rangedPercent: 0.25, durationSec: 2.0, slowPercent: 0.50, slowDurationSec: 1.5, radius: 400, radiusGuessed: true },
  },

  // ==========================================================================
  // 원문의 마지막 배치(625~1420줄 "[전설급 아이템]" 섹션의 끝) - 전부
  // "아군"을 대상으로 하는 엔챈트형 아이템들(슈렐리아의군가/월석재생기/
  // 강철의 솔라리 팬던트/밴들파이프/제국의명령)과 그 공용 하위템(밴들유리
  // 거울) + 서사급 섹션에서 지금까지 빠져 있던 금지된 우상. 이 배치를
  // 끝으로 원문(7ad78971-___.txt, 1420줄)의 전체 아이템 목록을 다 반영했다.
  // ==========================================================================
  // 밴들유리 거울 - 요정의 부적+증폭의 고서+빛나는 티끌 조합, 아래 5종
  // 엔챈트 아이템의 공용 하위템(실제 LoL의 Bandleglass Mirror).
  bandleglassMirror: {
    id: 'bandleglassMirror', nameKo: '밴들유리 거울', cost: 900, recipe: ['faerieCharm', 'amplifyingTome', 'glowingMote'],
    stats: { abilityPower: 20, mpRegenPercent: 1.0, abilityHaste: 10 },
  },
  // 금지된 우상 - 서사급 섹션(요정의 부적 바로 다음 줄)에 있었지만 지금까지
  // 구현되지 않았던 아이템(이 문서 전체에서 다른 완제품의 하위템으로도
  // 쓰이지 않는 독립 아이템). "체력 회복 및 보호막 8%"는 정령의형상(무한한
  // 활력)과 같은 성격의 효과라 동일한 필드(healingReceivedBonusPercent)를
  // 재사용한다 - 다만 금지된 우상 자신은 받는 회복/보호막 쪽(itemHealingReceivedBonusPercent/
  // itemShieldReceivedBonusPercent) 둘 다 똑같이 8%라 숫자가 갈리지 않는다.
  forbiddenIdol: {
    id: 'forbiddenIdol', nameKo: '금지된 우상', cost: 600, recipe: ['faerieCharm'],
    stats: { mpRegenPercent: 0.5 },
    healingReceivedBonusPercent: 0.08,
  },

  // 슈렐리아의군가 - "고무적인 연설"(사용 시 이동속도 버프). 원문은 "주변
  // 아군"에게 적용되지만 1인용 데모라 자신에게만 적용한다(세계지도집
  // 계열과 동일한 공용 한계).
  shurelyasBattlesong: {
    id: 'shurelyasBattlesong', nameKo: '슈렐리아의군가', cost: 2200, recipe: ['aetherialWisp', 'bandleglassMirror'],
    stats: { abilityPower: 50, abilityHaste: 15, moveSpeedPercent: 0.04, mpRegenPercent: 1.25 },
    teamMoveSpeedActive: { nameKo: '고무적인 연설', cooldownSec: 75, msPercent: 0.30, durationSec: 4.0, allyRadius: 1000, allyRadiusGuessed: true },
  },
  // 월석재생기 - "별빛 은총". 원문 자체가 "근처에 아군이 없으면 같은
  // 대상(=자기 자신)에게 적용"이라는 조항을 명시하고 있고, 이 데모는
  // 아군이 존재하지 않아 그 조항이 "항상" 성립한다 - 즉 "자신에게 걸리는
  // 회복/보호막이 30%/35% 증가"로 정확히 근사된다(아군에게 돌아갈 때의
  // 재분배 동작만 생략 - 받는 사람이 자신뿐이라 관찰 가능한 차이가 없다).
  moonstoneRenewer: {
    id: 'moonstoneRenewer', nameKo: '월석재생기', cost: 2200, recipe: ['kircheisShard', 'bandleglassMirror'],
    stats: { abilityPower: 25, maxHp: 200, abilityHaste: 20, mpRegenPercent: 1.25 },
    // 별빛 은총 - 아군을 회복/보호막시키면 그 양의 30%(회복)/35%(보호막)를
    // 근처 다른 아군에게도 주고, 근처에 다른 아군이 없으면 같은 대상에게 준다.
    // 자기 자신에게 쓰는 회복/보호막에는 적용되지 않는다(아군 대상 효과).
    // 연쇄 범위 800은 공개 자료 기준.
    healAndShieldPowerPassive: { healPercent: 0.30, shieldPercent: 0.35, chainRadius: 800 },
  },
  // 강철의 솔라리 팬던트 - "헌신"(주변 "아군들"에게 보호막 - 월석재생기와
  // 달리 "근처에 아군이 없으면 자신에게" 같은 자기 대상 전환 조항이 원문에
  // 전혀 없다). 이 데모에 아군이 없는 이상 조건을 만족할 대상이 아예
  // 존재하지 않아 고유 패시브를 구현하지 않는다(명시적 스킵 - 꿈 생성기와
  // 동일한 성격의 한계, docs/KNOWN_LIMITATIONS.md 참고). 스탯만 제공한다.
  ironSolariLocket: {
    id: 'ironSolariLocket', nameKo: '강철의 솔라리 팬던트', cost: 2200, recipe: ['kircheisShard', 'chainVest', 'negatronCloak'],
    stats: { maxHp: 200, armor: 30, magicResist: 30, abilityHaste: 10 },
    // 헌신(사용) - 자신과 주변 아군에게 아군 레벨 비례 보호막, 2.5초에 걸쳐
    // 감소. 보호막 290~360은 공개 자료(26.20) 기준. 재사용 대기시간과 범위는
    // 미확인(이전 시즌 자료/일반적인 값).
    devotionActive: { nameKo: '헌신', cooldownSec: 90, shieldMin: 290, shieldMax: 360, levelMin: 1, levelMax: 18, decaySec: 2.5, radius: 850, cooldownGuessed: true, radiusGuessed: true },
  },
  // 밴들파이프 - "팡파르"(적을 둔화/이동 불가시키면 이동속도+공격속도).
  // "자신을 포함한 주변 아군"이라 자신에게는 원문 그대로 적용되고, 다른
  // 아군에게 나가는 부분만 관찰 불가능한 생략이다(1인용 데모 공용 한계).
  bandlePipe: {
    id: 'bandlePipe', nameKo: '밴들파이프', cost: 2300, recipe: ['kircheisShard', 'chainVest', 'negatronCloak'],
    stats: { maxHp: 200, armor: 20, magicResist: 20, abilityHaste: 15 },
    fanfarePassive: { meleeDurationSec: 8, rangedDurationSec: 4, msFlat: 20, meleeAsPercent: 0.30, rangedAsPercent: 0.20, allyRadius: 1000, allyRadiusGuessed: true },
  },
  // 제국의명령 - "통제"(이동 불가 스킬 전용 스킬 가속 +20)는 어떤 스킬이
  // "이동 불가"를 거는지 챔피언별로 태그하는 시스템이 없어 구현하지 않는다
  // (docs/KNOWN_LIMITATIONS.md 명시 - 수치를 지어내지 않는다는 원칙과
  // 동일한 이유로, "항상 켜진 스킬 가속"처럼 부정확하게 근사하지 않고
  // 아예 생략한다). "명령"(이동 불가 적중 시 취약 표식)만 구현한다.
  imperialMandate: {
    id: 'imperialMandate', nameKo: '제국의명령', cost: 2400, recipe: ['amplifyingTome', 'bandleglassMirror', 'amplifyingTome'],
    stats: { abilityPower: 60, abilityHaste: 15, mpRegenPercent: 1.50 },
    commandPassive: { vulnerablePercent: 0.07, durationSec: 4.0 },
    // 통제 - "이동 불가 효과를 지닌 스킬의 스킬 가속이 20 증가"(원문). 어떤
    // 스킬이 이동 불가를 거는지는 item_system.js의 IMMOBILIZING_SKILL_SLOTS 참고.
    controlPassive: { abilityHaste: 20 },
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
  'zealSword', 'scoutsSlingshot', 'peakArrow', 'tailFeather',
  'essenceReaver', 'collector', 'magicOpticsC44', 'rageblade', 'krakenSlayer', 'stormrazor', 'phantomDancer', 'rapidFireCannon', 'naboriFlickerblade', 'lordDominiksRegards',
  'feralization',
  'mortalReminder', 'vigilance', 'wrathblade', 'infinityEdge', 'immortalShieldbow', 'bloodthirster', 'youmuusGhostblade', 'stormsurge', 'hubris', 'fortressBreaker', 'serylasGrudge',
  'mejaisSoulstealer',
  'lostChapter', 'fiendishCodex', 'hextechAlternator', 'aetherialWisp', 'hauntingGuise',
  'rodOfAges', 'archangelsStaff', 'seraphsEmbrace', 'malignance', 'blackfireTorch', 'ludensEcho', 'hextechRocketbelt', 'rylaisCrystalScepter', 'liandrysTorment', 'cosmicDrive', 'riftmaker',
  'plagueGem', 'duskAndDawn', 'nashorsTooth', 'lichBane', 'voidStaff', 'tempestStaff', 'shadowflame', 'hextechGunblade',
  'negatronMantle', 'chainmailVest', 'crystallineBracer', 'ghostlyHood', 'verdantBarrier', 'pursuerWristGuard', 'brokenWristGuard',
  'banshees', 'zhonyasHourglass', 'rabadonsDeathcap', 'heartsteel', 'warmogsArmor', 'endlessDespair', 'spiritVisage', 'abyssalMask',
  'worldAtlas', 'runesteelSpaulders', 'bountyOfWorlds', 'zaZaksRealmspike', 'bloodsong', 'solsticeSleigh', 'dreamMaker', 'celestialOpposition',
  'bandleglassMirror', 'forbiddenIdol', 'shurelyasBattlesong', 'moonstoneRenewer', 'ironSolariLocket', 'bandlePipe', 'imperialMandate',
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
  { id: 'epic', nameKo: '서사급', items: ['executionersCalling', 'vampiricScepter', 'lastWhisper', 'tiamat', 'sheen', 'embersOfFate', 'catalystOfAeons', 'devourerAxe', 'phageAxe', 'recurveBow', 'serratedDirk', 'spellbinder', 'caulfieldsWarhammer', 'tunnelers', 'ascendedPauldrons', 'kircheisShard', 'giantsBelt', 'ironSeal', 'zealSword', 'scoutsSlingshot', 'peakArrow', 'tailFeather', 'feralization', 'lostChapter', 'fiendishCodex', 'hextechAlternator', 'aetherialWisp', 'hauntingGuise', 'plagueGem', 'negatronMantle', 'chainmailVest', 'crystallineBracer', 'ghostlyHood', 'verdantBarrier', 'pursuerWristGuard', 'bandleglassMirror', 'forbiddenIdol'] },
  // 무라마나/대천사의포옹은 각각 마나무네/대천사의지팡이가 변신해서만
  // 얻으므로(hiddenFromShop) 이 탭에 넣지 않는다.
  { id: 'legendary', nameKo: '전설급', items: ['trinityForce', 'bladeOfTheRuinedKing', 'witsEnd', 'eclipse', 'manamune', 'maw', 'shojinSpear', 'hullbreaker', 'blackCleaver', 'divineSunderer', 'eternalThirst', 'overlordsBloodmail', 'titanicHydra', 'hydraOfHeroism', 'sterakssGage', 'deathsDance', 'guardianAngel', 'essenceReaver', 'collector', 'magicOpticsC44', 'rageblade', 'krakenSlayer', 'stormrazor', 'phantomDancer', 'rapidFireCannon', 'naboriFlickerblade', 'lordDominiksRegards', 'mortalReminder', 'vigilance', 'wrathblade', 'infinityEdge', 'immortalShieldbow', 'bloodthirster', 'youmuusGhostblade', 'stormsurge', 'hubris', 'fortressBreaker', 'serylasGrudge', 'mejaisSoulstealer', 'rodOfAges', 'archangelsStaff', 'malignance', 'blackfireTorch', 'ludensEcho', 'hextechRocketbelt', 'rylaisCrystalScepter', 'liandrysTorment', 'cosmicDrive', 'riftmaker', 'duskAndDawn', 'nashorsTooth', 'lichBane', 'voidStaff', 'tempestStaff', 'shadowflame', 'hextechGunblade', 'banshees', 'zhonyasHourglass', 'rabadonsDeathcap', 'heartsteel', 'warmogsArmor', 'endlessDespair', 'spiritVisage', 'abyssalMask', 'shurelyasBattlesong', 'moonstoneRenewer', 'ironSolariLocket', 'bandlePipe', 'imperialMandate'] },
  // 서포터 아이템(세계지도집 퀘스트 라인) - 무라마나/대천사의포옹과 동일한
  // 이유로 변신 전용 2종(룬나침반/세계의 결실)은 숨기고, 구매 가능한
  // 시작 아이템(세계지도집)과 그 최종 업그레이드 5종만 노출한다.
  { id: 'support', nameKo: '서포터', items: ['worldAtlas', 'zaZaksRealmspike', 'bloodsong', 'solsticeSleigh', 'dreamMaker', 'celestialOpposition'] },
];
