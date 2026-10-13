/* ============================================================
   TURRET SYSTEM (칼바람 나락 포탑) - 사용자 제공 명세 기준
   ------------------------------------------------------------
   이 프로젝트에는 아직 미니언/소환수(티버·새끼거미·하이머딩거
   포탑 등)/샤코 상자/요릭 소환물/팀(아군)/골드/와드(투명 감지 대상)
   시스템이 없다. 그런 시스템이 있어야만 의미가 생기는 부분(공격
   우선순위 1~7단계, 이중 갑옷의 "적 미니언 존재" 판정, 미니언 %HP
   피해 대상)은 실제 판정 함수/수식은 정확히 만들어두되, 지금은
   "해당 유닛 타입이 아직 없음" 결과로 안전하게 폴백한다 - 나중에
   미니언/소환수 시스템이 추가되면 그 검색 함수 내부만 채우면 나머지
   전부(가열 중/이중 갑옷/보상 등)가 그대로 맞물려 동작한다(요청 47
   "하나의 중앙 계산 함수로 통합" 원칙).
   게임 내 실제 골드/팀 시스템이 없으므로 "아군 전원에게 골드 지급"은
   지금은 controller.gold(플레이어 자신)에 적립하는 것으로 대체한다.
   ============================================================ */
const TURRET_TYPE = {
  OUTER1: 'outer1', OUTER2: 'outer2', INHIBITOR: 'inhibitor',
  NEXUS_TWIN: 'nexusTwin', NEXUS_WELL: 'nexusWell',
};

// 명세에 없는 수치는 만들지 않는다는 원칙을 지키되, 포탑이 최소한
// 동작하려면 반드시 있어야 하는데 명세에 아예 빠진 값(공격 사거리)은
// 실제 LoL 표준 포탑 사거리(775)를 임시값으로 쓴다 - 정확한 값이
// 확정되면 이 상수 하나만 바꾸면 된다.
const TURRET_ATTACK_RANGE_LOL = 775;
// Phase 2 요청 13 "포탑 공격 연결" - 이건 게임 수치(데미지/공격속도/사거리)가
// 아니라 순수 "발사~명중까지 화살이 날아가는 시간"을 결정하는 연출용
// 파라미터라서 "명세에 없는 수치를 만들지 않는다" 원칙(위 TURRET_ATTACK_RANGE_LOL
// 주석)의 적용 대상이 아니다 - 실제 LoL 포탑 사거리(775) 기준으로도
// 비행시간이 약 0.14초 이내가 되도록 챔피언 평타 투사체 기본값(30)보다
// 빠르게 잡아서, 기존처럼 "즉시 명중"에 가깝게 느껴지되 눈에는 보이도록 했다.
const TURRET_PROJECTILE_SPEED = 55;
const TURRET_ARMOR_PEN_PERCENT = 0.30; // 요청 12
const TURRET_HEAT_RESET_SEC = 5;       // 요청 16
const TURRET_HEAT_STEP = 0.5;          // 요청 14
const TURRET_HEAT_MAX_STACKS = 3;      // +50%*3 = +150% 상한(요청 14)
const TURRET_BASTION_DURATION_SEC = 20;      // 요청 28
const TURRET_BASTION_ARMOR_PER_ENEMY = 20;   // 요청 26
// 명세에 "방패가 정확히 언제 파괴되는가"의 수치(예: 몇 대 맞으면
// 깨지는지)가 없다 - 임의로 새 수치를 만들지 말라는 원칙에 따라, 가장
// 보수적인 기본값(포탑 체력이 30% 밑으로 떨어지면 방패가 깨진 것으로
// 간주)을 채택했다. 정확한 기준이 확정되면 이 상수 하나만 바꾸면 된다.
const TURRET_SHIELD_BREAK_HP_PERCENT = 0.30;
// 요청 31/32 - 미니언 %HP 피해 표준화 공식(미니언 타입이 실제로
// 생기면 target.minionType가 아래 키 중 하나와 일치해야 한다).
const TURRET_MINION_DAMAGE_PERCENT = { melee: 0.45, caster: 0.70, siege: 0.14, super: 0.05 };

// A. 포탑 능력치 - 하나의 데이터 정의(요청 47), 하드코딩 여러 곳에
// 흩어놓지 않는다. destroyGoldOverride: 사용자가 이번에 추가로 지시한
// 규칙("방패/요새화가 없는 포탑은 파괴 시 150골드") - 문서 29절의
// 기본 보상표보다 이 값이 있으면 그것을 우선한다.
const TURRET_DATA = {
  [TURRET_TYPE.OUTER1]: {
    name: '1차 외곽 포탑', maxHp: 5000, hpRegenPerSec: 0,
    adMin: 182, adMax: 350, adGrowthStartSec: 30, adGrowthEndSec: 810, adGrowthStepSec: 60, adGrowthPerStep: 12,
    attackSpeed: 0.83, armor: 40, magicResist: 40,
    goldReward: 250, xpReward: 0, destroyGoldOverride: null,
    hasFortification: true, fortificationEndSec: 300, fortificationReduction: 0.85,
    hasShield: true, shieldDamageReductionPercent: 0.17, hasBastion: true,
  },
  [TURRET_TYPE.OUTER2]: {
    name: '2차 외곽 포탑', maxHp: 4000, hpRegenPerSec: 0,
    adMin: 187, adMax: 427, adGrowthStartSec: 180, adGrowthEndSec: 1020, adGrowthStepSec: 60, adGrowthPerStep: 16,
    attackSpeed: 0.83,
    armorMin: 55, armorMax: 70, mrMin: 55, mrMax: 70,
    armorMrGrowthStartSec: 960, armorMrGrowthEndSec: 1800, armorMrGrowthStepSec: 60, armorMrGrowthPerStep: 1,
    goldReward: 675, xpReward: 0, destroyGoldOverride: null,
    hasFortification: false,
    hasShield: true, shieldDamageReductionPercent: 0.17, hasBastion: true,
  },
  [TURRET_TYPE.INHIBITOR]: {
    name: '억제기 포탑', maxHp: 3500, hpRegenPerSec: 3,
    adMin: 187, adMax: 427, adGrowthStartSec: 180, adGrowthEndSec: 1020, adGrowthStepSec: 60, adGrowthPerStep: 16,
    attackSpeed: 0.83, armor: 70, magicResist: 70,
    goldReward: 375, xpReward: 0,
    hasFortification: false, hasShield: false, hasBastion: false,
    // 사용자 요청: "방패나 요새화 효과가 없으며, 파괴 시 아군 전원에
    // 150골드" - 억제기 포탑은 위 hasFortification/hasShield가 둘 다
    // false라 이 규칙과 정확히 일치한다. 원래 명세(375골드) 대신 이
    // 값을 사용한다.
    destroyGoldOverride: 150,
  },
  [TURRET_TYPE.NEXUS_TWIN]: {
    name: '쌍둥이 포탑', maxHp: 3000, hpRegenPerSec: 6,
    adMin: 165, adMax: 405, adGrowthStartSec: 180, adGrowthEndSec: 1020, adGrowthStepSec: 60, adGrowthPerStep: 16,
    attackSpeed: 0.83, armor: 70, magicResist: 70,
    goldReward: 50, xpReward: 0,
    hasFortification: false, hasShield: false, hasBastion: false,
    // 쌍둥이 포탑도 방패/요새화가 둘 다 없으므로 동일 규칙 적용(50골드 대신 150골드).
    destroyGoldOverride: 150,
  },
  [TURRET_TYPE.NEXUS_WELL]: {
    name: '우물(기지)', maxHp: Infinity, hpRegenPerSec: 0,
    indestructible: true, // 요청 6/43: 공격 불가, 파괴 불가
    wellDamagePerSec: 2000, goldReward: 0, xpReward: 0,
  },
};

// 게임 전체 타이머(요청 35 "포탑 생성 시점이 아니라 게임 전체 타이머
// 기준"). 이 데모에는 아직 "매치 시작" 개념이 없어 이 모듈이 로드된
// 시점을 0초로 삼는다 - 나중에 실제 라운드/매치 시스템이 생기면 이
// 함수 하나만 그 타이머를 참조하도록 바꾸면 된다.
const TURRET_GAME_START_MS = performance.now();
function getTurretGameTimeSec() { return (performance.now() - TURRET_GAME_START_MS) / 1000; }

// B. 게임 시간 기반 능력치 증가 - A(포탑 능력치)와 분리된 별도 함수지만,
// 최종 사용값은 이 함수 하나로 중앙화한다(요청 47 getTurretStats).
function getTurretStats(turret, gameTimeSec = getTurretGameTimeSec()) {
  const data = TURRET_DATA[turret.type];
  if (data.indestructible) return { attackDamage: 0, armor: 0, magicResist: 0 };
  const ticks = (t, start, end, step) => {
    if (t < start) return 0;
    const maxTicks = Math.floor((end - start) / step);
    return Math.min(maxTicks, Math.floor((t - start) / step));
  };
  const adTicks = ticks(gameTimeSec, data.adGrowthStartSec, data.adGrowthEndSec, data.adGrowthStepSec);
  const attackDamage = Math.min(data.adMin + adTicks * data.adGrowthPerStep, data.adMax);
  let armor = data.armor, magicResist = data.magicResist;
  if (data.armorMrGrowthStartSec != null) {
    const defTicks = ticks(gameTimeSec, data.armorMrGrowthStartSec, data.armorMrGrowthEndSec, data.armorMrGrowthStepSec);
    armor = Math.min(data.armorMin + defTicks * data.armorMrGrowthPerStep, data.armorMax);
    magicResist = Math.min(data.mrMin + defTicks * data.armorMrGrowthPerStep, data.mrMax);
  }
  return { attackDamage, armor, magicResist };
}

// C. 공격 대상 우선순위. 1~7순위 검색 함수는 전부 지금 이 프로젝트에
// 없는 유닛 타입(샤코 상자/챔피언 소환수/공성·슈퍼미니언/요릭 소환물/
// 전사·마법사 미니언)을 찾는 자리표시자다 - 항상 빈 배열을 반환하므로
// 실제로는 8순위(적 챔피언)까지 그대로 내려간다. 이후 해당 유닛
// 시스템이 생기면 이 함수들 내부만 채우면 된다(우선순위 배열 구조/
// getTurretAttackTarget은 손댈 필요 없음).
function findShacoBoxesNear(turret) { return []; } // TODO: 샤코 상자 시스템 추가 시 구현
function findChampionSummonsNear(turret) { return []; } // TODO: 티버/새끼거미/하이머딩거 포탑 등
function findSuperOrSiegeMinionsNear(turret) { return findMinionsOfTypesNear(turret, [MINION_TYPE.SUPER, MINION_TYPE.SIEGE]); }
function findYorickMistWalkersNear(turret) { return []; } // TODO: 요릭 소환물 추가 시 구현
function findMeleeMinionsNear(turret) { return findMinionsOfTypesNear(turret, [MINION_TYPE.MELEE]); }
function findCasterMinionsNear(turret) { return findMinionsOfTypesNear(turret, [MINION_TYPE.CASTER]); }
function findYorickMistMaidenNear(turret) { return []; } // TODO: 요릭 소환물 추가 시 구현
function findEnemyChampionsNear(turret) {
  // 지금 이 데모에서 "적 챔피언"으로 실존하는 유일한 대상은 플레이어
  // 자신이다(허수아비는 isChampion:true지만 포탑의 실제 교전 대상은
  // 아니다 - 세트 R과 같은 이유로 챔피언 취급될 뿐, 이 포탑 시스템은
  // 플레이어를 직접 상대하도록 설계). 아군/적군/플레이어 시스템 - 예전에는
  // "플레이어는 항상 RED와만 적대"를 `turret.team !== 'RED'` 리터럴로
  // 하드코딩했지만, 이제 플레이어 자신의 `.team`(controller.team)과
  // generic하게 비교한다 - 같은 팀(BLUE) 포탑에는 이 우선순위가 여전히
  // 적용되지 않는다(동작은 그대로, 가정만 데이터 기반으로 바뀜).
  if (typeof controller === 'undefined' || !controller || controller.hp <= 0) return [];
  if (!isEnemyUnit(turret, controller)) return [];
  if (controller.state === STATE.DEAD || controller.isUntargetable) return []; // 요청 13 단서: 무적/대상 지정 불가 상태는 별도 처리
  // 버그 수정(모데카이저 R "죽음의 세계" 명세 9절 "메인 월드 포탑은 죽음의
  // 세계 내부의 챔피언을 대상으로 지정할 수 없다"): 포탑은 항상 메인
  // 월드(realmId='main')에 속해 있으므로, 플레이어가 죽음의 세계로
  // 들어가 있으면(realmId가 'main'이 아니면) canRealmInteract()가 자동으로
  // false를 반환해 포탑이 그 플레이어를 아예 후보에서 제외한다 - 새
  // 판정 시스템을 만들지 않고 기존 realmId 태그 하나만 재사용한다.
  if (!canRealmInteract(turret, controller)) return [];
  const range = lolRangeToWorld(TURRET_ATTACK_RANGE_LOL);
  const dist = getHorizontalDistance(getWorldPosition(turret), getWorldPosition(controller));
  return dist <= range ? [controller] : [];
}
function isValidTurretTarget(turret, target) {
  if (!target || target.hp <= 0) return false;
  if (target.isUntargetable) return false; // 무적/대상 지정 불가(요청 13 단서, 22 단서)
  const range = lolRangeToWorld(TURRET_ATTACK_RANGE_LOL);
  return getHorizontalDistance(getWorldPosition(turret), getWorldPosition(target)) <= range;
}
// 요청 8/9 - 8단계 우선순위를 순서대로 확인하고, 요청 10(현재 대상
// 유지) - 이미 있던 대상이 여전히 유효하면 재계산 없이 그대로 둔다.
function getTurretAttackTarget(turret) {
  if (turret.attackTarget && isValidTurretTarget(turret, turret.attackTarget)) return turret.attackTarget;
  const priorityGroups = [
    findShacoBoxesNear(turret), findChampionSummonsNear(turret),
    findSuperOrSiegeMinionsNear(turret), findYorickMistWalkersNear(turret),
    findMeleeMinionsNear(turret), findCasterMinionsNear(turret),
    findYorickMistMaidenNear(turret),
  ];
  for (const group of priorityGroups) {
    if (group.length) { turret._lastMinionSeenAt = getTurretGameTimeSec(); return group[0]; }
  }
  // 버그 수정(사용자 지적 "미니언과 포탑을 같이 때리고 있는데 포탑을
  // 공격하면 그 어그로가 바로 나에게 오는것") - 우선순위 자체는 이미
  // 미니언이 챔피언보다 항상 먼저였다(동일한 사거리 기준). 문제는 "찰나의
  // 공백" 이었다 - 락 걸린 미니언이 죽는 순간 그 프레임에 마침 사거리
  // 안에 다른 미니언이 하나도 없으면(전투 중 흔한 상황) 곧바로 챔피언으로
  // 넘어가버렸다. 미니언이 실제로 일정 시간(1.2초) 이상 안 보였을 때만
  // 챔피언을 새로 대상으로 고려한다 - 이미 챔피언을 공격 중이던 경우는
  // 위 lock에서 그대로 유지되므로 이 유예와 무관하다(신규 전환에만 적용).
  const champs = findEnemyChampionsNear(turret);
  if (champs.length) {
    const lastSeen = turret._lastMinionSeenAt != null ? turret._lastMinionSeenAt : -Infinity;
    if (getTurretGameTimeSec() - lastSeen >= 1.2) return champs[0];
  }
  return null;
}

// D. 이중 갑옷 - 요청 21 "이중 갑옷 판정과 공격 대상 선택을 동일한
// 시스템으로 만들지 마라": 이 함수는 getTurretAttackTarget()과 완전히
// 독립적으로 "적 미니언이 근처에 살아있는가"만 확인한다.
function hasLiveEnemyMinionsNear(turret) {
  // 요청 34/45(5/6번 오류 방지) - 오직 미니언(전사/원거리/공성/슈퍼)만
  // 이중 갑옷을 해제한다. 챔피언/소환수/샤코 상자 등은 여기 전혀
  // 관여하지 않는다(이 함수는 미니언 유무만 확인).
  const range = lolRangeToWorld(TURRET_ATTACK_RANGE_LOL);
  return minions.some((m) => !m.isDead && m.team !== turret.team && canRealmInteract(turret, m) && getHorizontalDistance(getWorldPosition(turret), m.mesh.position) <= range);
}
function isDoubleArmorActive(turret) {
  const data = TURRET_DATA[turret.type];
  if (!data || data.indestructible) return false;
  return !hasLiveEnemyMinionsNear(turret); // 지금은 미니언이 없으므로 항상 ON(요청 18과 정확히 일치)
}

// 요새화(요청 23) - 1차 외곽 전용, 5분(300초) 이후 자동 해제.
function isFortificationActive(turret, gameTimeSec = getTurretGameTimeSec()) {
  const data = TURRET_DATA[turret.type];
  return !!(data.hasFortification && gameTimeSec < data.fortificationEndSec);
}
// 포탑 방패(요청 24/25) - 원거리 챔피언/미니언 공격만 17% 감소.
function isShieldActive(turret) {
  const data = TURRET_DATA[turret.type];
  if (!data.hasShield || turret.destroyed) return false;
  return (turret.hp / turret.maxHp) > TURRET_SHIELD_BREAK_HP_PERCENT;
}
// 방벽(요청 26/27/28) - 방패가 "방금" 깨진 순간에만 20초 타이머를
// 새로 건다(매 프레임 재발동되지 않게 _shieldWasActive로 엣지 감지).
// 추가 Armor/MR은 고정값이 아니라 매번 실시간으로 다시 계산한다(요청 27).
function updateTurretBastion(turret) {
  const data = TURRET_DATA[turret.type];
  if (!data.hasBastion) return;
  const shieldNow = isShieldActive(turret);
  if (turret._shieldWasActive && !shieldNow && !turret.destroyed) {
    turret.bastionEndsAt = getTurretGameTimeSec() + TURRET_BASTION_DURATION_SEC;
    console.log(`[TURRET] ${data.name} 방벽 발동`);
  }
  turret._shieldWasActive = shieldNow;
}
function getBastionBonus(turret) {
  const data = TURRET_DATA[turret.type];
  if (!data.hasBastion || !turret.bastionEndsAt || getTurretGameTimeSec() >= turret.bastionEndsAt) return { armor: 0, magicResist: 0 };
  const enemyCount = findEnemyChampionsNear(turret).length; // 지금은 0 또는 1(플레이어)
  const bonus = enemyCount * TURRET_BASTION_ARMOR_PER_ENEMY;
  return { armor: bonus, magicResist: bonus };
}

// E. 가열 중(요청 14~17) - 챔피언 적중에만 반응하고, 미니언/소환수/
// 샤코 상자/요릭 소환물 공격으로는 절대 증가하지 않는다(호출부에서
// "대상이 챔피언일 때만" 이 함수를 부르는 것으로 그 요구를 만족시킨다 -
// 함수 자체에 챔피언 판정을 넣지 않아, 나중에 실제로 미니언 대상
// 호출 경로가 생겨도 실수로 여기서 걸러지길 기대하지 않고 호출부
// 책임을 명확히 한다).
function getTurretHeatMultiplierAndRegister(turret) {
  const now = performance.now();
  if (!turret.heatStacks || (now - (turret.lastChampionHitAt || 0)) / 1000 > TURRET_HEAT_RESET_SEC) turret.heatStacks = 0;
  const multiplier = 1 + Math.min(turret.heatStacks, TURRET_HEAT_MAX_STACKS) * TURRET_HEAT_STEP;
  turret.heatStacks = Math.min(turret.heatStacks + 1, TURRET_HEAT_MAX_STACKS);
  turret.lastChampionHitAt = now;
  return multiplier;
}

// F/G/H - 관통 탄환(챔피언 대상에만 30% 방어구 관통)/회피 관통(발사된
// 공격은 target 참조를 그대로 추적하므로 이동/점멸로 피할 수 없음)/
// 파수꾼의 눈(이 데모에는 투명 상태 유닛 자체가 없어 트리거될 일이
// 없다 - TODO로 남김, 가짜 필드를 새로 만들지 않는다).
// getTurretDamage(turret, target) - 포탑이 주는 피해 계산 하나로 통합(요청 47).
function getTurretDamage(turret, target) {
  const stats = getTurretStats(turret);
  const isChamp = !!target.isChampion;
  if (!isChamp && target.minionType && TURRET_MINION_DAMAGE_PERCENT[target.minionType] != null) {
    // 요청 31~33: 미니언 %HP 피해는 방어구/관통 계산을 전혀 적용하지
    // 않는다 - TRUE로 취급해서 calculateDamage()의 armor 분기를 타지
    // 않게 한다(챔피언용 AD/관통/Armor 계산과 완전히 분리).
    return { rawDamage: (target.maxHp || 0) * TURRET_MINION_DAMAGE_PERCENT[target.minionType], damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 };
  }
  const heatMultiplier = isChamp ? getTurretHeatMultiplierAndRegister(turret) : 1; // 요청 17: 챔피언 대상일 때만 가열 중 적용/증가
  return {
    rawDamage: stats.attackDamage * heatMultiplier,
    damageType: DAMAGE_TYPE.PHYSICAL,
    isCritical: false, critMultiplier: 1,
    armorPenPercent: isChamp ? TURRET_ARMOR_PEN_PERCENT : 0, // 요청 12: 챔피언 대상에만 30% 관통
  };
}

// 포탑이 받는 피해 계산 - getTurretDamageReduction(요청 47)을 하나로
// 통합해서, 방패→이중갑옷→요새화 순서(요청 38)를 여기 한 곳에서만
// 처리한다. calculateDamage()는 기존 시스템을 그대로 재사용(turret.armor/
// magicResist는 매 프레임 getTurretStats()로 최신화돼 있다) - Armor 기반
// 피해 계산 자체를 새로 만들지 않는다.
function applyDamageToTurret(turret, result, sourceInfo = {}) {
  const data = TURRET_DATA[turret.type];
  if (!turret || turret.destroyed || data.indestructible) return 0;
  // 죽음의 세계 격리(명세 9절 "포탑 생성/영향 금지"의 반대 방향 - 죽음의
  // 세계 안에 있는 챔피언도 메인 월드 포탑에 피해를 줄 수 없다): 실제로는
  // 플레이어가 이미 멀리 떨어진 죽음의 세계 구역으로 이동해 있어 사거리
  // 밖이라 거의 트리거되지 않지만, 판정을 명확히 하기 위해 방어적으로
  // 추가한다.
  if (sourceInfo.source && !canRealmInteract(turret, sourceInfo.source)) return 0;
  // 요청("포탑 공격 이벤트를 기준으로 디버깅") - GLB_DEBUG일 때만 스냅샷을
  // 뜬다(평상시 비용 0, snapshotTurretGLBState는 GLB_DEBUG=false면 즉시 null).
  const beforeSnap = snapshotTurretGLBState(turret, 'before-damage');
  const hpBefore = Number(turret.hp);
  let finalDmg = calculateDamage({ ...result, target: turret });
  if (!Number.isFinite(finalDmg) || finalDmg < 0) {
    console.warn('[TURRET] invalid damage ignored', { type: turret.type, finalDmg, result });
    return 0;
  }
  if (turret.usingRealModel && turret.mesh) turret.mesh.visible = true;
  if (data.hasShield && isShieldActive(turret) && (sourceInfo.isRanged || sourceInfo.isMinion)) {
    finalDmg *= (1 - data.shieldDamageReductionPercent); // 요청 25: 근접 챔피언에는 적용 안 함
  }
  if (isDoubleArmorActive(turret)) finalDmg *= 0.20; // 요청 18: 80% 감소
  if (isFortificationActive(turret)) finalDmg *= (1 - data.fortificationReduction); // 요청 23
  // 구조물 HP는 외부 애니메이션/렌더링 상태와 분리한다.
  // 실제 피해가 적용된 뒤의 HP를 명확히 기록해 '한 번 맞자마자 사라짐'
  // 현상을 게임 로직/모델 가시성 중 어느 쪽에서도 조용히 삼키지 않게 한다.
  turret.hp = Math.max(0, turret.hp - finalDmg);
  console.log(`[TURRET DAMAGE] ${turret.team}/${turret.type}: ${hpBefore.toFixed(2)} -> ${turret.hp.toFixed(2)} (raw=${Number(result.rawDamage||0).toFixed(2)}, final=${finalDmg.toFixed(2)})`);
  updateTurretVisual(turret);
  if (turret.hp <= 0) destroyTurret(turret);
  if (GLB_DEBUG && beforeSnap) {
    requestAnimationFrame(() => {
      const afterSnap = snapshotTurretGLBState(turret, 'after-damage+1frame');
      compareTurretGLBSnapshots(beforeSnap, afterSnap, turret);
    });
  }
  return finalDmg;
}

// L. 포탑 보상 + 요청 30 "파괴 이벤트 한 번만" - destroyed 플래그로 중복 방지.
function destroyTurret(turret) {
  if (turret.destroyed) return;
  turret.destroyed = true;
  const data = TURRET_DATA[turret.type];
  const goldAmount = data.destroyGoldOverride != null ? data.destroyGoldOverride : data.goldReward;
  // 팀 시스템 추가(요청): 플레이어는 항상 적 진영과 적대 관계라는 기존
  // 설계를 유지하므로, 적 구조물이 파괴됐을 때만 플레이어에게 골드를
  // 준다 - 자기 진영 구조물이 미니언 전투로 파괴돼도 골드를 받지
  // 않는다(원래 있던 "아군 전원 = 플레이어 하나" 단순화는 그대로 유지).
  // 아군/적군/플레이어 시스템 - 'RED' 리터럴 대신 controller.team과 generic 비교.
  if (typeof controller !== 'undefined' && controller && isEnemyUnit(turret, controller)) {
    controller.gold = (controller.gold || 0) + goldAmount;
    console.log(`[TURRET] ${data.name} 파괴! +${goldAmount} Gold (누적 ${controller.gold})`);
    updateGoldDisplay();
  } else {
    console.log(`[TURRET] ${turret.team} ${data.name} 파괴!`);
  }
  if (turret.labelDiv) turret.labelDiv.style.opacity = '0.25';
  turret._turretVisualState = 'DESTROYING';
  turret._turretDestroyElapsed = 0;
  turret._turretDestroyDuration = 0.38;
  turret._turretDestroyStartPos = turret.mesh ? turret.mesh.position.clone() : null;
  turret._turretDestroyStartScale = turret.mesh ? turret.mesh.scale.clone() : null;
  turret._turretDestroyStartRotation = turret.mesh ? turret.mesh.rotation.clone() : null;
  if (turret.usingRealModel && turret.mesh) {
    // GLB Destroyed 클립은 사용하지 않는다. GLB 내부의 visibility/scale/bone
    // 트랙 때문에 포탑이 '한 대 맞자마자 사라지는' 현상이 재발할 수 있기 때문이다.
    // 대신 매우 짧은 절차 애니메이션만 수행한 뒤 파괴 상태의 정지 포즈로 남긴다.
    turret.mesh.visible = true;
    turret.mesh.traverse(o => { o.visible = true; if (o.isMesh) o.frustumCulled = false; });
  } else if (turret.body && turret.body.material) {
    turret.body.material.color = new THREE.Color(0x222222);
  }
  if (controller && controller.currentTarget === turret) { controller.currentTarget = null; targetRing.clear(); }
  checkWinCondition();
}

// N. 포탑 HP 재생(요청 34) - 파괴된 포탑은 재생하지 않는다.
function updateTurretRegeneration(turret, dt) {
  const data = TURRET_DATA[turret.type];
  if (turret.destroyed || data.indestructible || !data.hpRegenPerSec) return;
  turret.hp = Math.min(turret.maxHp, turret.hp + data.hpRegenPerSec * dt);
}

function updateTurretVisual(turret) {
  const pct = Math.max(0, (turret.hp / turret.maxHp) * 100);
  if (turret.labelDiv) {
    const bar = turret.labelDiv.querySelector('.hpBarInner');
    if (bar) bar.style.width = pct + '%';
  }
  if (turret.body && turret.body.material && !turret.destroyed) {
    // 버그 수정(Phase 1 요청 5: "Hit Flash와 Material 충돌 검사" -
    // "반복 setTimeout 누적 여부 확인") - 120ms 안에 여러 번 맞으면 매번
    // 새 setTimeout이 쌓였고, 그중 가장 먼저 걸린 타이머가 나중 피격의
    // 발광까지 조기에 꺼버렸다(실제로는 문제였는지 몰랐던 잠재 버그 -
    // 이전 타이머를 취소하지 않고 계속 새로 만들기만 했음). 인스턴스당
    // 타이머 id를 하나만 유지해서 새 피격이 들어오면 이전 예약을 취소하고
    // 다시 예약한다. 파괴 연출(Destroyed 재생) 도중에 뒤늦게 발화해
    // emissiveIntensity를 건드리지 않도록 turret.destroyed도 재확인한다.
    clearTimeout(turret._hitFlashTimerId);
    turret.body.material.emissive = new THREE.Color(0xff3333);
    turret.body.material.emissiveIntensity = 0.8;
    // 재검증(2차) 수정: 콜백은 "끄기"만 하므로 destroyed 여부와 무관하게
    // 항상 0으로 되돌려야 한다 - 직전 수정에서 !turret.destroyed 가드를
    // 여기에도 걸었더니, 파괴되기 직전 마지막 피격의 발광이 꺼지지 않고
    // Destroyed 연출 내내 시뻘겋게 눌어붙어 있는 새 버그가 생겼다(원래
    // 코드는 이 가드가 아예 없어서 이 문제가 없었다). 새 발광을 "켜는"
    // 쪽(위 if문의 !turret.destroyed)만 막으면 충분하고, "끄는" 쪽은 항상
    // 실행되어야 한다.
    turret._hitFlashTimerId = setTimeout(() => {
      if (turret.body && turret.body.material) turret.body.material.emissiveIntensity = 0;
    }, 120);
  }
}

// 포탑 생성 - createDummyEnemy()와 동일한 셰이프(mesh/body/hp/armor/
// magicResist/radius 등)로 만들어서, getWorldPosition/getCollisionRadius/
// calculateDamage 등 기존 공용 함수들이 전부 그대로 재사용된다(요청 21
// "같은 기능의 새 시스템을 중복으로 만들지 마라").
function createTurret(type, position, team = 'RED') {
  const data = TURRET_DATA[type];
  const isWell = !!data.indestructible;
  // 버그 수정(사용자 지적 "우물은 특정 구조물이 아니라 그냥 영역이
  // 나눠져있는 땅이야") - 우물은 더 이상 세워진 3D 오브젝트가 아니라,
  // 바닥에 붙은 얇은 구역 표시(데칼)일 뿐이다. 충돌도 없고(챔피언/미니언이
  // 그 위를 그냥 지나다닐 수 있음) 이름표/HP바도 없다 - 아래에서 일반
  // 포탑 생성 로직을 전부 건너뛰고 최소한의 평면 하나만 만든다. 실제
  // 피해/회복 판정(요청 - 상대팀 진입 시 피해, 자기팀 회복)은 updateNexusWell()
  // 이 이 오브젝트의 위치+radius만 갖고 그대로 처리한다(로직은 그대로 유지).
  if (isWell) {
    const zoneRadius = BASE_UNIT * 8; // 실제 LoL 기지 우물 구역 정도의 넉넉한 크기
    const zoneMat = new THREE.MeshBasicMaterial({
      color: team === 'BLUE' ? 0x2a6fd0 : 0xd0402a, transparent: true, opacity: 0.16,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const zoneMesh = new THREE.Mesh(new THREE.CircleGeometry(zoneRadius, 32), zoneMat);
    zoneMesh.rotation.x = -Math.PI / 2;
    zoneMesh.position.set(position.x, 0.03, position.z); // 바닥(24차부터 높이 0) 바로 위에 얇게 깔림
    zoneMesh.renderOrder = -1;
    scene.add(zoneMesh);
    // 은은한 테두리 링으로 구역 경계를 표시(요청: "영역이 나눠져있는 땅" -
    // 실제로 경계가 있다는 걸 시각적으로 알 수 있게).
    const ringMat = new THREE.MeshBasicMaterial({ color: zoneMat.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(zoneRadius - 0.15, zoneRadius, 48), ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(position.x, 0.035, position.z);
    scene.add(ringMesh);
    return {
      mesh: zoneMesh, body: zoneMesh, type, team,
      hp: Infinity, maxHp: Infinity, radius: zoneRadius, collisionRadius: 0, // 충돌 없음(요청)
      isTurret: true, isStructure: false, isChampion: false, isMonster: true, isTrainingDummy: false, destroyed: false,
      isUntargetable: true, mixer: null,
    };
  }
  // 요청("포탑을 1.2배만 키우고") - 3.0배 → 3.6배로 확대(현재 크기의 1.2배).
  let height = BASE_UNIT * 3.6;
  let radius = BASE_UNIT * 0.765; // GLB가 로드되면 아래에서 실측값으로 교체된다
  // 버그 수정(사용자 지적 "억제기와 억제기 포탑은 다른 것"): TURRET_TYPE.
  // INHIBITOR는 실제로는 "파괴되면 슈퍼 미니언이 나오는 게임로직을 가진
  // 포탑"(=억제기 포탑, 실제 억제기를 지키는 3번째 타워 개념)이지 억제기
  // 건물 그 자체가 아니다 - 억제기 건물(억제기.glb)은 createInhibitorBuilding()
  // 이 별도로 blueInhibitor/redInhibitor 에셋을 써서 만든다.
  const teamLower = team.toLowerCase();
  const typedAssetKey = `${teamLower}${type[0].toUpperCase()}${type.slice(1)}Turret`;
  const fallbackAssetKey = `${teamLower}Turret`;
  const assetKey = (typedAssetKey && minionBuildingAssets[typedAssetKey]) ? typedAssetKey
    : ((fallbackAssetKey && minionBuildingAssets[fallbackAssetKey]) ? fallbackAssetKey : null);
  const asset = assetKey && minionBuildingAssets[assetKey];
  let group, body, mixer = null, actions = null, usingRealModel = false;
  if (asset) {
    // 요청("포탑을 1.2배만 키우고") - BASE_UNIT의 3.0배 → 3.6배로 확대.
    const inst = instantiateMinionBuildingAsset(assetKey, BASE_UNIT * 3.6, true);
    group = inst.root; body = inst.body; mixer = inst.mixer; actions = inst.actions;
    usingRealModel = true;
    // 버그 수정: 이름표/HP 바(labelDiv)를 이 아래에서 예전 임시 도형용
    // height(2.6)로 고정 배치하고 있었다 - 실제 포탑 GLB는 그보다 훨씬
    // 커서(약 9~10 유닛) 이름표가 포탑 몸통 중간에 파묻혀 보였다. 실제
    // 로드된 모델의 진짜 높이로 교체한다.
    height = inst.height;
    // 요청("glb크기까지 계산해서 못 뚫고 다니게") - 충돌/클릭 판정 반경도
    // 추정치 대신 GLB 실측 가로/세로 폭으로 교체한다. 너무 작은 값(모델이
    // 기형적으로 얇을 때)으로 판정이 무의미해지지 않도록 최소값은 유지한다.
    if (inst.radius > 0.05) radius = inst.radius;
  } else {
    const bodyGeo = new THREE.CylinderGeometry(radius * 0.6, radius, height, 8);
    // GLB 미로딩 시 임시 도형 색상도 팀별로 구분(요청: 시각적으로 RED/BLUE 구분).
    const bodyColor = team === 'BLUE' ? 0x3a6ea5 : 0xaa4433;
    // 요청("GLB 적용 전 도형을 투명색으로 형상만 보이게") - 예전엔 이
    // 임시 도형이 불투명해서 마치 완성된 모델처럼 보였다. 지금은 채우기를
    // 거의 투명하게 낮추고, 대신 밝은 윤곽선(wireframe)만 또렷하게 남겨서
    // "GLB가 아직 안 걸렸다"는 게 한눈에 보이게 한다.
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false });
    body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height / 2;
    body.castShadow = false; body.receiveShadow = false; // 투명 placeholder는 그림자를 드리울 필요가 없다
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), new THREE.LineBasicMaterial({ color: bodyColor }));
    outline.position.copy(body.position);
    group = new THREE.Group(); group.add(body); group.add(outline);
  }
  group.position.copy(position);
  // 요청("아래팀 포탑 반대 바라보게 하기") - 지금까지 포탑 모델에 회전을
  // 전혀 주지 않아서, GLB 원본이 향하는 기본 방향 그대로 양 진영에 똑같이
  // 놓였다 - 그래서 한쪽 진영(아래=RED)은 라인 반대 방향(등 돌린 채)을
  // 보고 있었다. RED만 Y축 180도 회전시켜서 중앙 라인 쪽을 보게 한다.
  group.rotation.y = (team === 'RED') ? Math.PI : 0;
  scene.add(group);
  group.add(createBlobShadow(radius * 1.6)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자

  const labelDiv = document.createElement('div');
  labelDiv.id = 'enemyLabel';
  // 버그 수정("실제 롤을 보고... 포탑도") - hpBarInner의 CSS 기본 배경색이
  // 항상 빨강으로 고정돼 있어서 BLUE 포탑도 체력바가 빨갛게 보였다.
  // 진영 색을 인라인 스타일로 직접 지정해 덮어쓴다.
  const hpFillColor = team === 'BLUE' ? '#4f8fe0' : '#e0473f';
  labelDiv.innerHTML = `${data.name}<div class="hpBarOuter"><div class="hpBarInner" style="background:${hpFillColor}"></div></div>`;
  const label = new CSS2DObject(labelDiv);
  label.position.set(0, height + 0.2, 0);
  group.add(label);

  const turret = {
    mesh: group, body, labelDiv, label, labelHeight: height + 0.2, type, team,
    mixer, actions, currentAction: null, currentClipName: null, usingRealModel,
    hp: data.maxHp, maxHp: data.maxHp,
    armor: data.armor || data.armorMin || 0, magicResist: data.magicResist || data.mrMin || 0,
    radius, collisionRadius: radius, selectionRadius: radius * 1.3,
    attackCooldown: 0, attackTarget: null,
    isTurret: true, isStructure: true, isChampion: false, isMonster: true, isTrainingDummy: false, destroyed: false,
    isUntargetable: false,
  };
  if (usingRealModel) {
    turret._shieldStageIndex = 0;
    turret._turretVisualState = 'PRE_DESTROY';
    turret._turretBaseScale = group.scale.clone();
    turret._turretBaseRotation = group.rotation.clone();
    // 포탑 생존 상태에서는 GLB AnimationMixer를 아예 사용하지 않는다.
    // Idle/Shield 클립의 본·스케일·visibility 트랙이 피격 시 모델을 숨기는
    // 문제를 완전히 우회하고, 정지된 원본 포즈만 사용한다.
    if (mixer) mixer.stopAllAction();
    turret.mixer = null;
    turret.actions = {};
  }
  return turret;
}

// 요청 7절 "포탑에는 방패가 존재하며 파괴된 방패 개수에 따라 모델 상태를
// 변경한다" - 몇 %에서 정확히 몇 번째 방패가 깨지는지는 명세에 없어(임의로
// 새 수치를 만들지 말라는 원칙에 따라) 체력 100%~0%를 5단계로 균등
// 분할해서 매핑했다(Idle1_Base, stage1, stage2, State2, State3 순). HP/
// 공격 시스템에는 전혀 손대지 않는 순수 시각 갱신이다(요청 7 "방패 상태
// 전환 때문에 HP나 공격 시스템이 초기화되면 안 된다"). INHIBITOR 타입도
// 이제 포탑 GLB를 쓰므로(위 createTurret 주석 참고) 동일하게 적용된다.
function updateTurretShieldStageVisual(turret) {
  if (!turret || !turret.usingRealModel || !turret.mesh || turret.destroyed) return;
  // 생존 중에는 어떤 GLB 애니메이션도 재생하지 않는다.
  turret.mesh.visible = true;
  turret.mesh.scale.copy(turret._turretBaseScale || new THREE.Vector3(1,1,1));
  turret.mesh.rotation.copy(turret._turretBaseRotation || turret.mesh.rotation);
  turret.mesh.updateMatrixWorld(true);
  turret.mesh.traverse((o) => {
    o.visible = true;
    if (o.isMesh) {
      o.frustumCulled = false;
      o.layers.enableAll();
    }
  });
}


// 버그 수정("포탑 공격 시 GLB 투명화") - 이 자리에 있던 updateTurretRenderSafety()
// 함수를 완전히 제거했다(아래 updateTurretCombat 안의 상세 설명 참고).
// 카메라가 포탑 가까이 갈 때마다 그 포탑 material의 depthWrite를 매 프레임
// false로 바꾸고 renderOrder를 20으로 올리던 코드였는데, 이 조건 자체가
// "포탑을 공격 중"인 상황과 사실상 동일해서 정확히 신고된 증상과 일치했다.

function updateTurretCombat(turret, dt) {
  // 요청("챔피언과 포탑,억제기,넥서스도 [체력바를] 고정") - 다른 무언가가
  // 실수로 건드리거나 부동소수점 오차가 쌓여도 항상 제자리를 유지하도록
  // 매 프레임 다시 못박는다(미니언 체력바와 동일한 원칙).
  if (turret.label) turret.label.position.set(0, turret.labelHeight, 0);
  const data = TURRET_DATA[turret.type];
  if (turret.maxHp !== data.maxHp && Number.isFinite(data.maxHp)) turret.maxHp = data.maxHp;
  if (turret.usingRealModel && turret.mesh) turret.mesh.visible = true;
  if (data.indestructible) { if (turret.mixer) safeMixerUpdate(turret.mixer, dt, `well:${turret.team}`); updateNexusWell(turret, dt); return; } // 우물은 완전히 별도 로직(요청 6) - 항상 매 프레임 그대로 유지
  if (turret.destroyed) {
    // 파괴 순간/이후도 게임 오브젝트와 모델 가시성을 완전히 분리한다.
    if (turret.usingRealModel && turret.mesh) {
      turret.mesh.visible = true;
      turret.mesh.traverse(o => { o.visible = true; if (o.isMesh) o.frustumCulled = false; });
      if (turret._turretVisualState === 'DESTROYING') {
        turret._turretDestroyElapsed = Math.min(turret._turretDestroyDuration || 0.38, (turret._turretDestroyElapsed || 0) + dt);
        const p = Math.min(1, turret._turretDestroyElapsed / (turret._turretDestroyDuration || 0.38));
        if (turret._turretDestroyStartScale) {
          const k = 1 - 0.08 * p;
          turret.mesh.scale.copy(turret._turretDestroyStartScale).multiplyScalar(k);
        }
        if (turret._turretDestroyStartRotation) {
          turret.mesh.rotation.copy(turret._turretDestroyStartRotation);
          turret.mesh.rotation.z += (turret.team === 'RED' ? -1 : 1) * 0.07 * p;
        }
        if (p >= 1) turret._turretVisualState = 'POST_DESTROY';
      }
    }
    return;
  }
  // 중요: 살아있는 포탑의 GLB AnimationMixer는 갱신하지 않는다.
  // 현재 포탑 GLB의 Idle/State 클립에는 수많은 본의 scale/translation/rotation
  // 트랙이 들어 있어, 피격 직후 프레임이 바뀌면서 모델이 순간적으로
  // 사라지거나 튀는 렌더링 회귀가 발생할 수 있다. 포탑 전투 판정은 그대로
  // 유지하고, 모델 애니메이션만 정지한다. 실제 파괴 시에는 위 destroyed
  // 분기에서 Destroyed 클립을 정상적으로 갱신한다.
  // 버그 수정("포탑 공격 시 GLB 투명화") - 여기서 updateTurretRenderSafety()를
  // 호출해 카메라가 포탑에 가까워질 때마다 그 포탑 material의 depthWrite를
  // false로, renderOrder를 20으로 매 프레임 바꾸고 있었다. 이 조건("카메라가
  // 포탑 반경*1.7 이내")은 포탑을 공격/근접전 중일 때 거의 항상 참이 되므로,
  // "포탑을 공격하는 순간 GLB가 이상해진다"는 증상과 트리거 조건이 정확히
  // 일치한다. depthWrite=false + 높은 renderOrder 조합은 불투명 오브젝트의
  // 깊이 버퍼 기여를 끄고 그리기 순서를 뒤로 미루는 조합이라, 근처의 다른
  // 오브젝트(챔피언/미니언 등)와 그리기 순서가 꼬이면서 서로 비쳐 보이는
  // 정확히 "투명화"로 보이는 현상을 만들 수 있다. 이 파일 전체에서 매
  // 프레임 depthWrite/renderOrder를 건드리는 곳은 여기 한 곳뿐이었다 -
  // 카메라가 포탑에 가까워졌을 때 미니언이 안 보이는 원래 문제(요청 6-B)는
  // frustumCulled=false(이미 위에서 항상 적용 중)만으로도 충분히 완화되므로,
  // 이 depthWrite/renderOrder 조작 자체를 제거한다.
  const stats = getTurretStats(turret);
  const bastion = getBastionBonus(turret);
  turret.armor = stats.armor + bastion.armor;       // applyDamageToTurret이 참조하는 최신 방어 스탯
  turret.magicResist = stats.magicResist + bastion.magicResist;
  updateTurretRegeneration(turret, dt);
  updateTurretBastion(turret);
  updateTurretShieldStageVisual(turret);
  turret.attackCooldown = Math.max(0, turret.attackCooldown - dt);
  const target = getTurretAttackTarget(turret);
  turret.attackTarget = target;
  if (!target || turret.attackCooldown > 0) return;
  turret.attackCooldown = 1 / data.attackSpeed; // 요청 7: 포탑 자신의 Attack Speed 사용 - Phase 2에서도 절대 변경하지 않음
  const result = getTurretDamage(turret, target);
  const origin = getWorldPosition(turret).clone().add(new THREE.Vector3(0, BASE_UNIT * 1.6, 0));
  vfx.spawn('basicAttack', origin, new THREE.Vector3().subVectors(getWorldPosition(target), origin).normalize());
  // 요청 11(유지): 이미 발사된 공격은 대상이 바뀌어도 그대로 완료한다 -
  // target을 이 시점에 값으로 캡처해서 넘기므로(클로저), 다음 공격부터만
  // 새 우선순위가 반영된다.
  // Phase 2 요청 13 "포탑 공격 연결" - 예전에는 이 자리에서 즉시
  // applyDamageToMinion/applyDamage를 호출해서 "공격 판정 == 명중"이
  // 동시에 일어났다. 이제 실제로 이동하는 Projectile을 하나 쏘고
  // Projectile이 도착했을 때만 피해를 적용한다. 공격속도(바로 위에서
  // 이미 소모 완료)/사거리/우선순위(getTurretAttackTarget)/데미지 계산
  // (getTurretDamage - 방패·이중갑옷·요새화 전부 이미 반영된 result)은
  // 전부 이 시점에 그대로 끝나 있다 - Phase 2는 "판정 이후 명중까지의
  // 이동 연출"만 추가할 뿐, 수치는 하나도 바뀌지 않는다.
  // 버그 수정(유지): target이 미니언이면 일반 applyDamage()(→damageEnemy())를
  // 타면 안 된다 - damageEnemy()는 죽으면 "4초 뒤 풀피로 부활"하는
  // 학습용 더미 전용 분기까지 함께 갖고 있어서, 미니언이 실제로 죽어
  // 사라지고 골드/경험치를 지급해야 하는 killMinion() 흐름과 충돌한다.
  projectiles.spawn({
    from: origin, target, speed: TURRET_PROJECTILE_SPEED,
    color: turret.team === 'BLUE' ? 0x8fc7ff : 0xff8f8f,
    realmId: turret.realmId, // Phase 2 요청 17 - 발사 시점 realm 스냅샷(포탑은 realmId가 바뀌지 않지만 대칭성을 위해 항상 넘긴다)
    fromTurret: true, // 버그 수정(요청 27): 야스오 바람 장막은 포탑 공격/광선을 막지 않는다 -
    // ProjectileSystem.update()의 windwall 충돌 검사가 이 플래그를 보고 포탑 발사체는 건너뛴다.
    onHit: (t) => { if (t.isMinion) applyDamageToMinion(t, result); else applyDamage(t, { ...result, isBasicAttack: true, source: turret }); },
  });
}
// O. 우물(기지) - 요청 6/43: 일반 포탑 전투 시스템을
// 전혀 사용하지 않는 완전히 독립된 로직. 공격속도/Armor/MR/가열중/
// 관통탄환/공격우선순위 전부 미적용, 매초 고정 2000 트루 데미지만 적용.
const WELL_HEAL_HP_PER_SEC = 400; // 요청("자기 진영 우물에서는 hp와 마나를 회복") - 실제 LoL 기지 분수처럼 빠르게 채워준다
const WELL_HEAL_MP_PER_SEC = 300;
// 요청("기지 안에 들어갈 수 있게 해서 그 범위 안에서 힐/마나회복이 되게
// 하고, 나중에 상점도 그 안에서만 쓸 수 있게 할거야") - 우물의 좁은
// 충돌 반경(공격 판정용)과 별개로, "기지 안"이라고 부를 만한 훨씬 넓은
// 구역을 우물 위치를 중심으로 정의한다. 회복은 이 구역 전체에서 적용되고,
// 나중에 만들 상점도 이 구역 판정 함수를 그대로 재사용하면 된다.
const BASE_ZONE_RADIUS = BASE_UNIT * 22;
function getTeamWell(team) { return turrets.find((t) => t.type === TURRET_TYPE.NEXUS_WELL && t.team === team); }
// 요청("미니언은 넥서스에서 소환되게 해줘") - 스폰 지점 계산에 쓴다.
function getTeamNexus(team) { return nexusBuildings.find((n) => n.team === team); }
function isPositionInBaseZone(position, team) {
  const well = getTeamWell(team);
  if (!well) return false;
  return getHorizontalDistance(getWorldPosition(well), position) <= BASE_ZONE_RADIUS;
}
function updateNexusWell(well, dt) {
  const data = TURRET_DATA[TURRET_TYPE.NEXUS_WELL];
  // 요청("자기진영의 넥서스오벨리스크는 공격하지 않아. 상대팀이 우물에
  // 들어왔을 때 상대팀을 공격하는게 넥서스오벨리스크야") - 이 우물이
  // 자기 진영(well.team)과 같은 유닛은 절대 공격하지 않고, 다른 진영
  // 유닛만 공격한다. 플레이어는 기존 설계대로 항상 BLUE 진영 취급
  // (PLAYER_TEAM 상수) - RED 우물만 플레이어를 공격하고, BLUE(자기
  // 진영) 우물은 플레이어를 공격하지 않는다. 공격 판정은 우물 자체의
  // 좁은 충돌 반경(well.radius)만 쓴다 - 기지 전체를 위험 지대로 만들면
  // 안 되므로 회복 구역(BASE_ZONE_RADIUS)과는 의도적으로 분리했다.
  if (typeof controller !== 'undefined' && controller && controller.hp > 0 && controller.state !== STATE.DEAD
      && well.team !== PLAYER_TEAM && canRealmInteract(well, controller)) {
    const dist = getHorizontalDistance(getWorldPosition(well), controller.root.position);
    if (dist <= well.radius) {
      applyDamage(controller, { rawDamage: data.wellDamagePerSec * dt, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, source: well, isStatusTick: true });
    }
  }
  // 적 미니언도 같은 원칙으로 상대 진영 우물 범위에 들어오면 공격당한다.
  if (typeof minions !== 'undefined') {
    for (const m of minions) {
      if (m.isDead || m.team === well.team) continue;
      const dist = getHorizontalDistance(getWorldPosition(well), m.mesh.position);
      if (dist <= well.radius) {
        applyDamageToMinion(m, { rawDamage: data.wellDamagePerSec * dt, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 });
      }
    }
  }
  // 요청("기지 안에 들어갈 수 있게 해서 그 범위 안에서 힐/마나회복") -
  // 우물의 좁은 충돌 반경이 아니라 기지 전체 구역(BASE_ZONE_RADIUS)
  // 안에 있으면 회복된다.
  if (typeof controller !== 'undefined' && controller && controller.hp > 0 && controller.state !== STATE.DEAD
      && well.team === PLAYER_TEAM && canRealmInteract(well, controller)) {
    if (isPositionInBaseZone(controller.root.position, well.team) && (controller.hp < controller.maxHp || controller.mp < controller.maxMp)) {
      controller.hp = Math.min(controller.maxHp, controller.hp + WELL_HEAL_HP_PER_SEC * dt);
      controller.mp = Math.min(controller.maxMp, controller.mp + WELL_HEAL_MP_PER_SEC * dt);
      updateBars(controller);
    }
  }
}

let turrets = [];
function updateTurrets(dt) { for (const t of turrets) updateTurretCombat(t, dt); }
// destroyTurret()에서 참조하는 즉시 갱신 헬퍼 - 이미 매 프레임 도는
// updateDebugPanel()을 그대로 재사용한다(새 UI 갱신 시스템을 만들지 않음).
// 요청("ui적용해줘") - 새 HUD의 골드 표시(#goldAmount)도 여기서 같이
// 갱신한다. 골드가 바뀌는 지점(포탑/미니언 처치 등)에서만 호출되는
// 이벤트 기반 함수라 매 프레임 갱신 부담이 없다.
function updateGoldDisplay() {
  if (typeof updateDebugPanel === 'function') updateDebugPanel();
  const el = document.getElementById('goldAmount');
  if (el && controller) el.textContent = Math.floor(controller.gold || 0).toLocaleString();
  // 미니언/포탑 처치처럼 아이템 구매 없이 골드만 바뀌는 경우에도 상점의
  // "구매 가능 여부" 표시(unaffordable 회색 처리)가 따라오도록 갱신한다.
  if (typeof renderShopPanel === 'function') renderShopPanel();
}

// 넥서스(요청 문서 5절) - 양 진영(RED/BLUE) 각각 실제 HP/team/구조물
// 타입/파괴 상태를 갖는 진짜 게임 오브젝트로 확장했다(기존에는 파괴
// 로직이 없는 순수 장식 건물이었다). "우물(기지)"(장식/파괴불가/
// 매초 트루 데미지)은 이 오브젝트와 완전히 별개로, 기존 TURRET_TYPE.
// NEXUS_WELL이 이미 그 역할을 정확히 수행하고 있어(공격불가/파괴불가)
// 그대로 재사용한다(요청 6절 - 새 시스템 중복 생성 금지). "넥서스
// 오벨리스크"는 넥서스와 같은 자리의 장식물로, 실제 넥서스 GLB 자체에
// 포함된 것으로 보고 별도 오브젝트를 만들지 않는다(사용자가 올려준
// 실제 칼바람 나락 미니맵 확인 결과).
// 요청("방어력과 마법 저항력이 제대로 작동하게 해줘") - 실제 LoL 위키
// 확인 결과 넥서스/억제기 둘 다 방어력 20을 갖고 있는데(마법저항력은
// 0으로 원래도 맞음) 지금까지 이 코드에서는 armor:0으로 하드코딩돼
// 있어서 물리 피해가 전혀 감쇄되지 않고 있었다. 겸사겸사 확인해보니
// 넥서스 체력도 3500으로 잘못 들어가 있어(실제 5500) 같이 바로잡았다.
const NEXUS_MAX_HP = 5500; // 실제 LoL 넥서스 체력 표준값(수정: 3500 -> 5500)
const NEXUS_ARMOR = 20; // 실제 LoL 넥서스 방어력 표준값(마법저항력은 0이 맞음)
let nexusBuildings = [];
// radiusWorld: 원작 충돌 반경(칼바람 배치가 넘긴다). 주면 GLB가 없을 때의 임시 도형도 그 크기로 만든다.
function createNexusBuilding(position, team = 'RED', radiusWorld = null) {
  const assetKey = team.toLowerCase() + 'Nexus';
  const asset = minionBuildingAssets[assetKey];
  let group, body, mixer = null, actions = null, usingRealModel = false;
  let nexusRadius = radiusWorld || BASE_UNIT * 4.5; // GLB가 로드되면 아래에서 실측값으로 교체된다
  if (asset) {
    // 버그 수정("GLB 적용해도 미니언 이외는 적용 안 됨"): 원본 GLB 크기
    // 그대로 쓰지 않고 BASE_UNIT 기준으로 정규화한다(기존 장식 넥서스
    // placeholder 크기(반지름 1.1*BASE_UNIT)와 비슷한 체감으로 맞춤).
    // 요청("넥서스와 억제기도 크기를 키워줘") - 2.2배 → 6배로 확대.
    // 요청("넥서스를 1.5배 키워줘") - 6배 → 9배로 추가 확대.
    const inst = instantiateMinionBuildingAsset(assetKey, BASE_UNIT * 9.0, true);
    group = inst.root; body = inst.body; mixer = inst.mixer; actions = inst.actions;
    usingRealModel = true;
    // 요청("glb크기까지 계산해서 못 뚫고 다니게") - 충돌 반경도 추정치
    // 대신 GLB 실측 가로/세로 폭으로 교체한다.
    // 버그 수정(같은 원인 - 억제기와 동일하게 bounding box 전체를 그대로
    // 쓰면 바닥 장식까지 충돌 범위에 포함된다): 충돌 목적으로는 60%만 사용.
    if (inst.radius > 0.05 && !radiusWorld) nexusRadius = inst.radius * 0.6;
  } else {
    // 요청("넥서스를 1.5배 키워줘") - 3.0 → 4.5로 확대.
    const bodyGeo = new THREE.IcosahedronGeometry(nexusRadius, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: team === 'BLUE' ? 0x2a4a7a : 0x7a2a2a, roughness: 0.5 });
    body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = nexusRadius; body.castShadow = true;
    group = new THREE.Group(); group.add(body);
  }
  group.position.copy(position);
  // 버그 수정(억제기와 동일한 원인 - "치우쳐져 보임") - 넥서스도 팀별
  // 회전이 없었다. 포탑/억제기와 동일한 규칙을 적용한다.
  group.rotation.y = (team === 'RED') ? Math.PI : 0;
  scene.add(group);
  group.add(createBlobShadow(nexusRadius * 1.4)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자
  const label = `${team} nexus`;
  // 요청("챔피언과 포탑,억제기,넥서스도 [체력바를]") - 넥서스에는 HP
  // 표시가 아예 없었다. 포탑/억제기와 동일한 방식(CSS2DObject, 고정 높이,
  // 진영 색)으로 새로 만든다.
  const hpFillColor = team === 'BLUE' ? '#4f8fe0' : '#e0473f';
  const labelDiv = document.createElement('div');
  labelDiv.id = 'enemyLabel';
  labelDiv.innerHTML = `${team} 넥서스<div class="hpBarOuter"><div class="hpBarInner" style="background:${hpFillColor}"></div></div>`;
  const labelHeight = BASE_UNIT * 9.0 + 0.2;
  const label3d = new CSS2DObject(labelDiv);
  label3d.position.set(0, labelHeight, 0);
  group.add(label3d);
  const nexus = {
    mesh: group, body: body || group, mixer, actions, currentAction: null, currentClipName: null, usingRealModel,
    type: 'nexus', team, hp: NEXUS_MAX_HP, maxHp: NEXUS_MAX_HP, armor: NEXUS_ARMOR, magicResist: 0,
    radius: nexusRadius, collisionRadius: nexusRadius,
    isNexus: true, isStructure: true, isChampion: false, isMonster: true, isTurret: false, isMinion: false,
    destroyed: false, isUntargetable: false, labelDiv, label: label3d, labelHeight,
  };
  if (usingRealModel) {
    // 요청 10절 "게임 시작 시 Nexus_spawn을 한 번 실행" → Idle1_Base로 전환.
    const spawnAction = playAssetClip(nexus, label, NEXUS_MODEL_CLIPS.spawn, { fade: 0, loopOnce: true });
    if (spawnAction) {
      const dur = (spawnAction.getClip().duration / (spawnAction.timeScale || 1)) * 1000;
      setTimeout(() => playAssetClip(nexus, label, NEXUS_MODEL_CLIPS.idle), dur);
    } else {
      playAssetClip(nexus, label, NEXUS_MODEL_CLIPS.idle);
    }
  }
  return nexus;
}
function applyDamageToNexus(nexus, result) {
  if (!nexus || nexus.destroyed) return 0;
  const finalDmg = calculateDamage({ ...result, target: nexus });
  nexus.hp = Math.max(0, nexus.hp - finalDmg);
  if (nexus.labelDiv) {
    const bar = nexus.labelDiv.querySelector('.hpBarInner');
    if (bar) bar.style.width = Math.max(0, (nexus.hp / nexus.maxHp) * 100) + '%';
  }
  if (nexus.hp <= 0) destroyNexus(nexus);
  return finalDmg;
}
function destroyNexus(nexus) {
  if (nexus.destroyed) return;
  nexus.destroyed = true;
  console.log(`[NEXUS] ${nexus.team} 넥서스 파괴!`);
  if (nexus.labelDiv) nexus.labelDiv.style.opacity = '0.25';
  if (nexus.usingRealModel) playAssetClip(nexus, `${nexus.team} nexus`, NEXUS_MODEL_CLIPS.death, { fade: 0.3, loopOnce: true });
  else if (nexus.body && nexus.body.material) nexus.body.material.color = new THREE.Color(0x222222);
  checkWinCondition();
}
function updateNexusBuildingAnim(dt) {
  for (const n of nexusBuildings) {
    if (n.mixer) safeMixerUpdate(n.mixer, dt, `nexus:${n.team}`);
    if (n.label) n.label.position.set(0, n.labelHeight, 0); // 요청("고정") - 매 프레임 제자리 재확인
  }
}

// 억제기 건물(요청 문서 4절) - "억제기 포탑"(TURRET_TYPE.INHIBITOR, 포탑
// GLB를 쓰는 별도 구조물)과는 완전히 다른 오브젝트다. type="inhibitor"로
// 명확히 구분하고, 독립적인 HP/파괴 판정을 가진다. blueInhibitor/
// redInhibitor GLB 슬롯(이미 MINION_BUILDING_ASSET_SLOTS에 정의돼 있던
// 로딩 파이프라인)을 그대로 재사용한다 - 새 로딩 시스템을 만들지 않는다.
const INHIBITOR_MAX_HP = 4000; // 실제 LoL 억제기 체력 표준값
const INHIBITOR_ARMOR = 20; // 요청("방어력과 마법 저항력이 제대로 작동하게") - 실제 LoL 억제기 방어력 표준값(마법저항력은 0이 맞음)
const INHIBITOR_RESPAWN_SEC = 300; // 실제 LoL 5분 재생성
let inhibitorBuildings = [];
// radiusWorld: 원작 충돌 반경(칼바람 배치가 넘긴다). 주면 GLB가 없을 때의 임시 도형도 그 크기로 만든다.
function createInhibitorBuilding(position, team = 'RED', radiusWorld = null) {
  const assetKey = team.toLowerCase() + 'Inhibitor';
  const asset = minionBuildingAssets[assetKey];
  let group, body, mixer = null, actions = null, usingRealModel = false;
  let inhibRadius = radiusWorld || BASE_UNIT * 2.4; // GLB가 로드되면 아래에서 실측값으로 교체된다
  if (asset) {
    // 버그 수정("GLB 적용해도 미니언 이외는 적용 안 됨"): 원본 GLB 크기
    // 그대로 쓰지 않고 BASE_UNIT 기준으로 정규화한다(기존 억제기
    // placeholder 크기(반지름 0.85*BASE_UNIT)와 비슷한 체감으로 맞춤).
    // 요청("넥서스와 억제기도 크기를 키워줘") - 1.8배 → 5배로 확대.
    const inst = instantiateMinionBuildingAsset(assetKey, BASE_UNIT * 5.0, true);
    group = inst.root; body = inst.body; mixer = inst.mixer; actions = inst.actions;
    usingRealModel = true;
    // 요청("glb크기까지 계산해서 못 뚫고 다니게") - 충돌 반경도 추정치
    // 대신 GLB 실측 가로/세로 폭으로 교체한다.
    // 버그 수정(사용자 지적 "억제기 못넘어가는 범위가 너무 큰거 같아") -
    // 실제 GLB를 직접 열어 확인해보니 X범위 -2.07~1.73, Z범위 -1.74~1.74로
    // bounding box 전체를 그대로 반경으로 쓰면(이전 코드) 바닥에 넓게 깔린
    // 장식용 얼음 조각/받침대까지 전부 "못 지나가는 벽"이 돼서 실제 몸통보다
    // 훨씬 큰 범위가 막혀 있었다. 충돌 목적으로는 60%만 사용한다(시각적
    // 크기는 그대로, 부딪히는 범위만 더 실제 몸통에 가깝게 줄임).
    if (inst.radius > 0.05 && !radiusWorld) inhibRadius = inst.radius * 0.6;
  } else {
    const bodyGeo = new THREE.DodecahedronGeometry(inhibRadius, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: team === 'BLUE' ? 0x3a5a8a : 0x8a3a3a, roughness: 0.55 });
    body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = inhibRadius; body.castShadow = true;
    group = new THREE.Group(); group.add(body);
  }
  group.position.copy(position);
  // 버그 수정(사용자 지적 "크리스탈 부분이 중앙에 있어보이게 살짝만 옆으로") -
  // 실제 GLB 본 구조를 열어보니 크리스탈 뭉치(crystals)는 자기 부모 기준
  // 로컬 원점(0,0,0)에 있는데, 전체 bounding box 중심 정렬(instantiateMinionBuildingAsset)
  // 은 비대칭인 받침대/기둥 메시까지 포함해서 계산하다 보니 크리스탈이
  // 살짝 옆으로 밀려 보인다. "살짝만" 요청대로 작은 보정값만 더한다 -
  // RED는 180도 회전돼 있어 로컬 X가 뒤집히므로 부호를 반대로 적용한다.
  // (GLB 모델 보정이라 임시 도형에는 적용하지 않는다 - 원작 좌표에서 0.5만큼 밀려 버린다.)
  const INHIBITOR_CRYSTAL_OFFSET = 0.5;
  if (usingRealModel) group.position.x += (team === 'RED' ? 1 : -1) * INHIBITOR_CRYSTAL_OFFSET;
  // 버그 수정(사용자 지적 "억제기가 살짝 옆쪽으로 치우쳐져있고") - 포탑엔
  // 이미 팀별 회전을 줬는데(아래팀=RED만 180도) 억제기/넥서스에는 회전을
  // 아예 준 적이 없었다 - 그래서 좌우 비대칭인 모델이 한쪽 팀에서는 항상
  // 옆으로 돌아간 채(등을 보이거나 옆면을 보이는 식으로) 놓여 있었다.
  // 포탑과 동일한 규칙을 그대로 적용한다.
  group.rotation.y = (team === 'RED') ? Math.PI : 0;
  scene.add(group);
  group.add(createBlobShadow(inhibRadius * 1.4)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자
  const labelDiv = document.createElement('div');
  labelDiv.id = 'enemyLabel';
  // 버그 수정("실제 롤을 보고... 억제기도") - 포탑과 동일하게 hpBarInner
  // 기본색이 항상 빨강이라 BLUE 억제기도 빨갛게 보였다. 진영 색을 인라인
  // 스타일로 직접 지정한다.
  const hpFillColor = team === 'BLUE' ? '#4f8fe0' : '#e0473f';
  labelDiv.innerHTML = `${team} 억제기<div class="hpBarOuter"><div class="hpBarInner" style="background:${hpFillColor}"></div></div>`;
  const label3d = new CSS2DObject(labelDiv);
  label3d.position.set(0, BASE_UNIT * 5.5, 0);
  group.add(label3d);
  const labelKey = `${team} inhibitor`;
  const inhibitor = {
    mesh: group, body: body || group, labelDiv, label: label3d, labelHeight: BASE_UNIT * 5.5, mixer, actions, currentAction: null, currentClipName: null, usingRealModel,
    type: 'inhibitor', team, hp: INHIBITOR_MAX_HP, maxHp: INHIBITOR_MAX_HP, armor: INHIBITOR_ARMOR, magicResist: 0,
    radius: inhibRadius, collisionRadius: inhibRadius,
    isInhibitor: true, isStructure: true, isChampion: false, isMonster: true, isTurret: false, isMinion: false,
    destroyed: false, isUntargetable: false, position: position.clone(),
  };
  if (usingRealModel) {
    const spawnAction = playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.spawn, { fade: 0, loopOnce: true });
    if (spawnAction) {
      const dur = (spawnAction.getClip().duration / (spawnAction.timeScale || 1)) * 1000;
      setTimeout(() => playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.idle), dur);
    } else {
      playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.idle);
    }
  }
  return inhibitor;
}
function updateInhibitorVisual(inhibitor) {
  const pct = Math.max(0, (inhibitor.hp / inhibitor.maxHp) * 100);
  if (inhibitor.labelDiv) {
    const bar = inhibitor.labelDiv.querySelector('.hpBarInner');
    if (bar) bar.style.width = pct + '%';
  }
}
function applyDamageToInhibitor(inhibitor, result) {
  if (!inhibitor || inhibitor.destroyed) return 0;
  // 요청("방어력이 제대로 작동하게") - 실제 LoL 위키: "방어구 관통은
  // 억제기의 방어력에 영향을 주지 않는다." 공격자가 armorPenPercent를
  // 실어 보내도(방어구 관통 아이템/스킬) 여기서 강제로 0으로 덮어써서
  // 억제기 방어력 20이 항상 그대로 적용되게 한다.
  const finalDmg = calculateDamage({ ...result, target: inhibitor, armorPenPercent: 0 });
  inhibitor.hp = Math.max(0, inhibitor.hp - finalDmg);
  updateInhibitorVisual(inhibitor);
  if (inhibitor.hp <= 0) destroyInhibitor(inhibitor);
  return finalDmg;
}
function destroyInhibitor(inhibitor) {
  if (inhibitor.destroyed) return;
  inhibitor.destroyed = true;
  console.log(`[INHIBITOR] ${inhibitor.team} 억제기 파괴! ${INHIBITOR_RESPAWN_SEC}초 후 재생성`);
  const labelKey = `${inhibitor.team} inhibitor`;
  if (inhibitor.labelDiv) inhibitor.labelDiv.style.opacity = '0.25';
  if (inhibitor.usingRealModel) playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.death, { fade: 0.3, loopOnce: true });
  else if (inhibitor.body && inhibitor.body.material) inhibitor.body.material.color = new THREE.Color(0x222222);
  setTimeout(() => respawnInhibitor(inhibitor), INHIBITOR_RESPAWN_SEC * 1000);
}
function respawnInhibitor(inhibitor) {
  inhibitor.destroyed = false;
  inhibitor.hp = inhibitor.maxHp;
  updateInhibitorVisual(inhibitor);
  if (inhibitor.labelDiv) inhibitor.labelDiv.style.opacity = '1';
  const labelKey = `${inhibitor.team} inhibitor`;
  if (inhibitor.usingRealModel) {
    const spawnAction = playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.spawn, { fade: 0.2, loopOnce: true });
    if (spawnAction) {
      const dur = (spawnAction.getClip().duration / (spawnAction.timeScale || 1)) * 1000;
      setTimeout(() => playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.idle), dur);
    } else {
      playAssetClip(inhibitor, labelKey, INHIBITOR_MODEL_CLIPS.idle);
    }
  } else if (inhibitor.body && inhibitor.body.material) {
    inhibitor.body.material.color = new THREE.Color(inhibitor.team === 'BLUE' ? 0x3a5a8a : 0x8a3a3a);
  }
  console.log(`[INHIBITOR] ${inhibitor.team} 억제기 재생성`);
}
function isTeamInhibitorDestroyed(team) {
  return inhibitorBuildings.some((i) => i.team === team && i.destroyed);
}
function updateInhibitorBuildingAnim(dt) {
  for (const i of inhibitorBuildings) {
    if (i.mixer) safeMixerUpdate(i.mixer, dt, `inhibitor:${i.team}`);
    if (i.label) i.label.position.set(0, i.labelHeight, 0); // 요청("고정") - 매 프레임 제자리 재확인
  }
}

// 요청 문서 12/13절: 넥서스가 파괴되면 해당 팀의 패배 상태가 된다. 이
// 프로젝트에 기존 승패 UI가 없어(검색 결과 없음) 최소한의 배너만 새로
// 추가한다 - 기존 UI 시스템을 갈아엎지 않는다.
let gameEnded = false;
function checkWinCondition() {
  if (gameEnded) return;
  const dead = nexusBuildings.find((n) => n.destroyed);
  if (!dead) return;
  gameEnded = true;
  const winner = dead.team === 'RED' ? 'BLUE' : 'RED';
  console.log(`[GAME] ${winner} 팀 승리! (${dead.team} 넥서스 파괴)`);
  const banner = document.createElement('div');
  banner.textContent = `${winner} WINS`;
  banner.style.cssText = `position:fixed;top:14%;left:50%;transform:translate(-50%,0);
    font:bold 48px/1 sans-serif;letter-spacing:.08em;color:${winner === 'RED' ? '#ff5555' : '#55aaff'};
    text-shadow:0 0 18px rgba(0,0,0,.85),0 0 4px #000;z-index:9999;pointer-events:none;`;
  document.body.appendChild(banner);
}

