/* ============================================================
   0-A0Y. 기획안 기준 챔피언 데이터 (레벨/스킬레벨 스케일링)
   ------------------------------------------------------------
   가렌/다리우스: 기획안.txt 수치를 그대로 데이터화하고 실제 전투
   로직(_castQ/_castW/_castE/_castR, _beginAttackSwing, 패시브 틱)에
   연결한다. 세트/모데카이저/노틸러스는 이번 1차 작업에서는 "기본
   스탯/성장/패시브 설명"까지만 데이터로 반영해 레벨업/스탯창이
   정상 동작하게 하고, 스킬 실전 로직(Q/W/E/R 세부 판정)은 다음
   단계에서 이어서 구현한다(섹션 19 STEP 10 순서를 따름). 기획안에
   없는 수치는 절대 임의로 만들어 넣지 않는다(섹션 3/18 원칙).
   ============================================================ */
function growLinear(base, growth, level) { return base + growth * (level - 1); }
function growPercent(base, growthPercent, level) { return base * (1 + (growthPercent / 100) * (level - 1)); }
// 챔피언 "기본 스탯" 성장 공식(원작): 기본 + 성장 × (레벨-1) × (0.7025 + 0.0175 × (레벨-1)).
// 18레벨 값은 단순 직선과 같지만 중간 레벨에서는 더 낮다. 버그 수정: 예전엔 스탯에도
// growLinear(단순 직선)를 써서 2~17레벨 체력/공격력/방어력 등이 원작보다 높았다.
// (growLinear는 아리 패시브 회복처럼 "레벨에 정비례"하는 스킬 수치용으로 그대로 둔다.)
function statGrowthFactor(level) { const n = Math.max(0, (level || 1) - 1); return n * (0.7025 + 0.0175 * n); }
function growStat(base, growth, level) { return base + (growth || 0) * statGrowthFactor(level); }

// 기본 스탯/쿨다운/비용/사거리는 라이엇 공식 Data Dragon 16.20.1(PC 최신)과 전수 대조했다
// (tools/ddragon_compare.js 결과 - 레벨당 공격력은 Data Dragon이 0으로 내보내는 알려진 문제로 제외).
const CHAMPION_DATA = {
  yasuo: {
    displayName: '야스오',
    stats: {
      hp: 590, hpGrowth: 110, hpRegen: 6.5, hpRegenGrowth: 0.9,
      ad: 60, adGrowth: 2.5, attackSpeed: 0.697, attackSpeedGrowthPercent: 3.5,
      armor: 32, armorGrowth: 4.6, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 345, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 22%, 공속 계수 0.67
      windupPercent: 0.22, attackSpeedRatio: 0.67,
    },
    passive: {
      name: '낭인의 길',
      // 의지(Intent): 다른 모든 출처의 치명타 확률 2배(V14.10에 2.5→2), 100% 초과분
      // 1%당 추가 공격력 0.5. 치명타 피해 감소는 V15.4에서 삭제됐다 - 치명타 배율은
      // 다른 챔피언과 같은 기본값(stats.critMultiplier)+무한의 대검 보너스를 쓴다.
      // 예전 구조는 아이템이 없어도 치명타 확률을 항상 100%로 고정했다.
      critChanceMultiplier: 2.0, overcapCritToAd: 0.5,
      // 결의(Resolve): 이동한 거리 59/52.5/46(레벨 구간) 유닛마다 기류 1, 100에서
      // 챔피언/몬스터에게 피해를 받으면 1초 동안 보호막 125~600(레벨 비례).
      // 레벨 구간 1/7/13 확인(PC 위키 + 공략 "based on level 1 / 7 / 13").
      flowMax: 100, shieldBase: 125, shieldPerLevel: 27.941, shieldDurationSec: 1,
      flowUnitsPerStack: { breakpoints: [1, 7, 13], values: [59, 52.5, 46] },
    },
    Q: {
      // 쿨다운 4초·시전 시간 0.35초는 스킬 레벨과 무관한 고정 기준값이다(요네와 동일 -
      // 요네.bin YoneQ 수치와 champion_data 요네 주석 참고). 예전 [4,3.33,…,1.33]/
      // [0.4,…,0.13]은 "추가 공속에 따라 줄어드는 범위"를 레벨별 값으로 잘못 옮긴 것이었다.
      // 추가 공속 1%당 쿨다운 0.6%(최대 66.67%), 시전 시간 0.41667%(최대 50%) 감소.
      name: '강철 폭풍', cooldown: [4, 4, 4, 4, 4], range: 475, width: 80,
      damageByLevel: [20,45,70,95,120], totalAdRatio: 1.05,
      stackDuration: 6, knockupDuration: 1, tornadoRange: 1150, circleRadius: 375,
      castTime: [0.35, 0.35, 0.35, 0.35, 0.35],
      cdReductionPerBonusAs: 0.6, cdReductionMax: 0.6667, castReductionPerBonusAs: 0.41667, castReductionMax: 0.5,
      tornadoWidth: 180, tornadoSpeed: 1200, // PC 위키 야스오 문서: 회오리 사거리 1150, 폭 180, 속도 1200
      damageType: 'PHYSICAL',
    },
    W: {
      name: '바람 장막', cooldown: [25,23,21,19,17], range: 400,
      width: [320,390,460,530,600], duration: 4, damageType: 'NONE',
      castTimeSec: 0.013, // PC 위키(야스오 문서): 시전 시간 0.013초, 시전 중 이동 가능
    },
    E: {
      // 대상을 "관통해" 고정 거리(475)만큼 돌진, 돌진 속도 750 + 이동 속도의 60%.
      name: '질풍검', cooldown: [0.5,0.4,0.3,0.2,0.1], range: 475, dashDistance: 475, dashSpeedBase: 750, dashSpeedMsRatio: 0.6,
      damageMin: [70,85,100,115,130], damageMax: [140,170,200,230,260],
      bonusAdRatioMin: 0.2, bonusAdRatioMax: 0.4, apRatioMin: 0.6, apRatioMax: 1.2,
      targetCooldown: [10,9,8,7,6], stackDuration: 5, stackBonusPercent: 25, maxStacks: 4,
      damageType: 'MAGICAL',
    },
    R: {
      name: '최후의 숨결', cooldown: [70,50,30], range: 1400,
      // 대상(공중에 뜬 적 챔피언) 주변 400 안의 공중에 뜬 적 챔피언 전부를 1초 동안 띄운다(PC 위키).
      // 피해 계수는 "추가" 공격력 150%.
      damageByLevel: [200,350,500], bonusAdRatio: 1.5, knockupDuration: 1, targetRadius: 400,
      armorIgnoreBonusPercent: 0.60, buffDuration: 15, damageType: 'PHYSICAL',
    },
  },
  // 요네: LoL 공식 위키(wiki.leagueoflegends.com/en-us/Yone, V26.10 최종 수정
  // 기준) + 나무위키(요네 문서)를 기준으로 반영한 수치. 야스오와 형제
  // 챔피언이며 Q/패시브 치명타 배율/공속비례 쿨감(1.67% 공속당 1% 감소)
  // 수치가 야스오와 "완전히 동일"하다는 것이 나무위키에 명시돼 있어
  // 그 부분은 야스오 로직/공식을 그대로 재사용한다. 야스오와 달리
  // 요네에게는 이동 누적형 패시브 보호막(낭인의 길의 Flow)이 없다 -
  // 요네의 "Flow" 자원은 전혀 다른 용도(E 영혼해방 지속시간 타이머,
  // 최대 500 = 5.00초를 센티초 단위로 표시)이므로 야스오의
  // _yasuoGainFlowFromMovement/_yasuoOnTakeDamage 패시브 보호막 로직을
  // 요네에 이식하지 않는다(원작에 없는 효과를 만들어 넣지 않는다는 원칙).
  yone: {
    displayName: '요네',
    stats: {
      hp: 620, hpGrowth: 105, hpRegen: 7.5, hpRegenGrowth: 0.75,
      ad: 62, adGrowth: 2, attackSpeed: 0.625, attackSpeedGrowthPercent: 3.5,
      armor: 33, armorGrowth: 4.6, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 345, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 22%
      windupPercent: 0.22,
    },
    passive: {
      name: '사냥꾼의 길',
      // Way of the Hunter: 다른 모든 출처의 치명타 확률이 2배로 적용되고,
      // 100%를 초과하는 치명타 확률 1%당 추가 공격력 0.5를 얻는다. 치명타
      // 피해량은 감소한다.
      // 수치 출처 갱신(요네.bin 실데이터, YonePassive.CritDamageMod=0.95):
      // 전역 기본 치명타 배율(critDamageMultiplier=2.0, CharacterRecord)에
      // CritDamageMod(0.95)를 곱해 190%가 된다. 이전에는 리그 오브 레전드
      // 위키 문서 텍스트("180%")를 그대로 반영했으나, 실제 게임 bin
      // 수치를 우선한다는 원칙(프로젝트 공통 원칙 - 닐라 등에서도 이미
      // 적용된 선례)에 따라 bin 값(190%)으로 교체한다. 무한의 검 보너스
      // (+27%p)는 위키에 나온 그대로 가산한다: 190%+27%=217%.
      // 업데이트(PC 패치 기록 대조): 위 190%는 "기본 치명타 피해 200%" 시절 기준이었다.
      // 현재 PC 기본 치명타 피해는 175%이고 요네는 치명타 피해 10% 감소(V14.20에서 -20%→-10%)
      // → 175% × 0.9 = 157.5%. 무한의 대검 보너스는 calculateDamage/Q 계산에서 더한다.
      critChanceMultiplier: 2.0, overcapCritToAd: 0.5,
      critDamage: 1.575, critDamageModifier: 0.9,
      // Steel and Spirit: 평타가 강철 검/아자카나의 검을 번갈아 사용하며,
      // 아자카나의 검 공격은 물리 50% + 마법 50%로 나뉘어 들어간다.
      // (요네.bin YonePassive.MagicDamageSplit=0.5로 재확인됨)
      azakanaSwordSplitRatio: 0.5,
    },
    Q: {
      name: '필멸의 검',
      // 공식 수치(요네.bin YoneQ 실데이터로 재확인):
      // QBaseCastTime=0.35, QAttackSpeedCastReductionPercent/Max=0.41667/0.5
      // (시전시간 최대 50% 감소 -> 0.175), QAttackSpeedCDPercent/Max=0.6/0.6667
      // (쿨다운 최대 66.67% 감소 -> 1.33). 레벨별 배열이 아니라 스킬 레벨
      // 무관 고정 기준값이므로 5칸 배열은 전부 같은 값으로 채운다.
      cooldown: [4,4,4,4,4], castTime: [0.35,0.35,0.35,0.35,0.35],
      range: 450, width: 80,
      // 2중첩(폭풍 구름) 강화 시: 요네 "본체"는 450만 돌진하지만(Q3MaxDistance/
      // MinDistance=450), 돌풍 "투사체"는 그 방향으로 계속 나아가 총 950까지
      // 적을 판정한다(YoneQ3Missile.castRange=950) - 즉 본체 돌진 거리(450)와
      // 돌풍 판정 사거리(950)가 서로 다르다(이전 구현은 이 둘을 혼동해서
      // 본체까지 950 이동시켰다 - bin 데이터로 수정).
      dashRange: 450, missileRange: 950, dashAoEWidth: 100, missileWidth: 80,
      dashSpeed: 1500,
      damageByLevel: [25,50,75,100,125], totalAdRatio: 1.10,
      stackDuration: 6, maxStacks: 2, knockupDuration: 0.75,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '영혼 가르기',
      cooldown: 14, cooldownFloor: 6, castTime: 0.5, castTimeFloor: 0.19,
      range: 700, angleDeg: 80,
      // 수치 출처 갱신(요네.bin YoneW 실데이터로 재확인):
      // MaxHealthDamage(레벨1~5) = 7/8/9/10/11% (이전에 위키 문서 프로즈를
      // 옮기며 8/9/10/11/12%로 한 칸씩 밀려 잘못 반영했던 것을 수정).
      // 재수정(PC 위키 패치 기록 + RiftPatchNotes 두 출처 일치): 현재 8/9/10/11/12%(V25.8/26.10
      // 하향, 이전 10~14%). 위 "bin 7~11%"는 bin 배열의 0번(0랭크 자리)부터 읽어 한 칸 밀린
      // 것으로 보인다 - 공개 패치 기록 값으로 되돌린다.
      totalMixedDamageByLevel: [10,20,30,40,50], maxHpRatioByLevel: [8,9,10,11,12],
      // WShield 공식(bin GameCalculation): ByCharLevelInterpolation(40 -> 90,
      // 챔피언 레벨 1~18) + 보너스AD*0.65. 이전에 위키 문서의 "95.88"은
      // 오독이었다(bin 원본은 90.0으로 명시) - bin 수치로 교체.
      // 계수 65% 확정(PC 위키 - 75%는 아레나 전용 값이었다).
      shieldBase: 40, shieldGrowth: (90 - 40) / 17, shieldBonusAdRatio: 0.65,
      shieldDuration: 1.5, shieldFirstChampionBonusPercent: 100, shieldPerExtraChampionPercent: 50,
      // MinimumDamageMinions(bin ByCharLevelBreakpoints): 1레벨 30, 이후
      // 레벨당 +10(2~8레벨) -> 9레벨부터 +20/레벨(9~13) -> 14레벨부터
      // +40/레벨(14~18). MonsterDamageCap(bin, 레벨별 명시 배열): 1레벨
      // 140부터 레벨당 +10. 위키 프로즈("40-490"/"150-340")는 부정확한
      // 요약이었음 - bin 원본 수치로 교체하고 계단 규칙 자체를 저장한다.
      minDamageVsMinionBreakpoints: { level1: 30, steps: [{ fromLevel: 2, perLevel: 10 }, { fromLevel: 9, perLevel: 20 }, { fromLevel: 14, perLevel: 40 }] },
      maxDamageVsMonsterBase: 140, maxDamageVsMonsterPerLevel: 10,
      damageType: 'MIXED_PHYSICAL_MAGIC',
    },
    E: {
      name: '영혼해방',
      cooldown: [22,19,16,13,10], range: 300, dashSpeed: 1200,
      spiritFormDuration: 5, recastMinDelay: 0.5,
      recastCastTimeSec: 0.225, // PC 위키: 재시전 시전 시간 0.225초(최초 돌진은 시전 시간 없음)
      moveSpeedBonusMin: 0.10, moveSpeedBonusMax: 0.30, // bin StartingMS=0.10, MovementSpeed=0.30로 재확인
      markPercentByLevel: [25,27.5,30,32.5,35], // bin DeathmarkPercent(레벨1~5)로 재확인 - 명칭은 내부적으로 공유되는 스크립트 잔재(탈론류)이지만 수치 자체는 위키와 정확히 일치
      damageType: 'TRUE',
    },
    R: {
      name: '운명봉인',
      // bin YoneR로 재확인: BlinkDistanceBehindTarget=200(기존 가정과 일치),
      // ADRatio=0.8은 mStatFormula=2(보너스 스탯) 기준 - 총 AD가 아니라
      // 보너스 AD에 곱한다(기존 구현과 일치).
      cooldown: [120,100,80], castTime: 0.75, range: 1000, width: 225,
      totalMixedDamageByLevel: [200,400,600], bonusAdRatio: 0.80,
      stunDuration: 1, knockupDuration: 0.75, pullSpeed: 3000, blinkDistanceBehindTarget: 200,
      damageType: 'MIXED_PHYSICAL_MAGIC',
    },
  },
  renekton: {
    displayName: '레넥톤',
    stats: {
      hp: 660, hpGrowth: 111, hpRegen: 8, hpRegenGrowth: 0.75,
      ad: 69, adGrowth: 3.1, attackSpeed: 0.665, attackSpeedGrowthPercent: 2.75,
      armor: 35, armorGrowth: 5.2, mr: 28, mrGrowth: 2.05,
      range: 125, moveSpeed: 345, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 17.73%
      windupPercent: 0.1773,
    },
    // PC 위키: 평타당 분노 5, 체력 50% 미만이면 분노 획득 50% 증가, 12초 비전투 후 0.25초마다 1씩(초당 4) 감소.
    passive: { name: '분노의 지배', rageMax: 100, empoweredThreshold: 50, lowHpThreshold: 0.5, lowHpMultiplier: 1.5, combatExitSec: 12, rageDecayInterval: 0.25, rageDecayAmount: 1 },
    Q: {
      name: '양떼 도륙', cooldown: 7, mana: 0, range: 325, damageByLevel: [60,90,120,150,180], bonusAdRatio: 1.0,
      healNonChampion: [2,3,4,5,6], healNonChampionAdRatio: 0.02,
      healChampion: [12,20,28,36,44], healChampionAdRatio: 0.17, healChampionCap: [50,75,100,125,150],
      empoweredDamageByLevel: [90,135,180,225,270], empoweredBonusAdRatio: 1.4, // PC 위키: 5레벨 270(예전 275)
      empoweredHealNonChampion: [6,9,12,15,18], empoweredHealNonChampionAdRatio: 0.06,
      empoweredHealChampion: [36,60,84,108,132], empoweredHealChampionAdRatio: 0.51,
      empoweredHealChampionCap: [200,300,400,500,600], nonChampionRage: 2.5, championRage: 10, maxRageGenerated: 30,
      damageType: 'PHYSICAL'
    },
    W: {
      name: '무자비한 포식자', cooldown: [16,14,12,10,8], mana: 0, range: 175,
      damageByLevel: [10,40,70,100,130], totalAdRatio: 1.5, hits: 2, stunDuration: 0.75,
      empoweredDamageByLevel: [15,60,105,150,195], empoweredTotalAdRatio: 2.25, empoweredHits: 3, empoweredStunDuration: 1.5,
      bonusChampionRage: 10, empowerWindowSec: 7, damageType: 'PHYSICAL', // PC 위키: 7초 안의 다음 평타 강화
      castTimeSec: 0.2, postHitLockSec: 0.528, // PC 위키: 강화 평타 시전 0.2초, 이후 0.528초 이동·Q·E 불가(R로 해제)
    },
    E: {
      name: '자르고 토막내기', cooldown: [16,14.5,13,11.5,10], mana: 0, range: 450, // Data Dragon: 돌진 450(예전 550)
      damageByLevel: [40,70,100,130,160], bonusAdRatio: 0.9,
      empoweredDamageByLevel: [70,115,160,205,250], empoweredBonusAdRatio: 1.35,
      armorShredByLevel: [25,27.5,30,32.5,35], armorShredDuration: 4,
      firstRageNonChampion: 2, firstRageChampion: 10, damageType: 'PHYSICAL'
    },
    R: {
      name: '강신', cooldown: [120,100,80], mana: 0, range: 350, castTime: 0.125, duration: 15,
      bonusMaxHp: [300,500,700], immediateRage: 20, ragePerSecond: 5,
      sizeIncreasePercent: 20, // 28차: PC 위키 Dominus - 크기 20% 증가(Unit size 표: 판정 반경 80 → 96)
      damagePerSecond: [60,150,240], bonusAdRatio: 0.1, apRatio: 0.1, tickSec: 0.5, bonusAttackRange: 25, damageType: 'MAGICAL' // PC 위키: 0.5초마다 30/75/120(+추가 AD 5%+AP 5%), 사거리 +25
    },
  },
  garen: {
    displayName: '가렌',
    stats: {
      hp: 690, hpGrowth: 98, hpRegen: 8, hpRegenGrowth: 0.5,
      ad: 69, adGrowth: 4.5, attackSpeed: 0.625, attackSpeedGrowthPercent: 3.65,
      armor: 38, armorGrowth: 4.2, mr: 32, mrGrowth: 1.55,
      range: 175, moveSpeed: 340, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 18% (보정 0.5)
      windupPercent: 0.18, windupModifier: 0.5,
    },
    passive: {
      name: '인내심',
      desc: '8초 동안 피해를 입지 않거나 적 스킬에 맞지 않으면 5초마다 최대 체력의 일정 비율만큼 회복한다.',
      noDamageWindow: 8, tickInterval: 5,
      healPercentByLevel: [1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 3.3, 4.1, 4.9, 5.7, 6.5, 7.3, 8.1, 8.5, 8.9, 9.3, 9.7, 10.1],
    },
    Q: {
      name: '결정타', cooldown: 8, mana: 0,
      moveSpeedBonusPercent: 35, moveSpeedDurationByLevel: [1.4, 1.95, 2.5, 3.05, 3.6],
      // 위키: "추가 물리 피해 30/60/90/120/150 (+ 공격력 50%)" - 평타 피해(공격력 100%)에
      // "더해지는" 값이다(합계 = 30~150 + 공격력 150%). 예전 adRatio: 1.5는 합계 계수를
      // 추가 피해 계수 자리에 넣어 평타 피해까지 AD 100%가 이중으로 들어갔다.
      damageByLevel: [30, 60, 90, 120, 150], adRatio: 0.5, silenceDuration: 1.5, enhancedWindow: 4.5,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '용기', cooldown: [22, 19.5, 17, 14.5, 12], mana: 0,
      damageReductionPercentByLevel: [25, 29, 33, 37, 41], reductionDuration: 4,
      // 보호막 계수는 "추가 체력"의 18%(위키 "+ 18% bonus health") - 최대 체력 전체가 아니다.
      // 같은 0.75초 동안 강인함 60%도 함께 얻는다.
      shieldBaseByLevel: [65, 85, 105, 125, 145], shieldBonusHpPercent: 18, shieldDuration: 0.75,
      tenacityPercent: 60, tenacityDuration: 0.75,
      // 패시브: 유닛(미니언/몬스터/챔피언)을 "처치"할 때마다 방어력/마법 저항력 0.2, 최대 30.
      onTakedownArmor: 0.2, onTakedownMr: 0.2, onTakedownCap: 30,
    },
    E: {
      name: '심판', cooldown: [9, 8.25, 7.5, 6.75, 6], mana: 0, range: 325, spinDuration: 3, baseHits: 7,
      perHitDamageByLevel: [4, 7, 10, 13, 16], adRatioByLevel: [0.4, 0.43, 0.46, 0.49, 0.52],
      nearestBonusPercent: 25, critMultiplier: 1.3, nonChampionDamagePercent: 75, // PC 위키: 미니언·몬스터 75%
      armorShredPercent: 25, armorShredDuration: 6, armorShredHitsNeeded: 6,
      damageType: 'PHYSICAL',
    },
    R: {
      name: '데마시아의 정의', cooldown: [120, 100, 80], mana: 0, range: 400, castTime: 0.435,
      // 원작 PC 툴팁/패치 기록: 고정 피해 150/250/350 (+ 대상 잃은 체력의 25/30/35%).
      // 예전 125/200/275는 어떤 패치 기록에서도 확인되지 않는 값이라 바로잡았다.
      baseDamageByLevel: [150, 250, 350], missingHpPercentByLevel: [25, 30, 35],
      damageType: 'TRUE',
    },
  },
  darius: {
    displayName: '다리우스',
    stats: {
      hp: 652, hpGrowth: 114, hpRegen: 10, hpRegenGrowth: 0.95,
      ad: 64, adGrowth: 5, attackSpeed: 0.625, attackSpeedGrowthPercent: 1,
      armor: 37, armorGrowth: 5.2, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 340, mana: 263, manaGrowth: 58, manaRegen: 6.6, manaRegenGrowth: 0.35,
      // PC 위키 기본 스탯: 평타 선딜 20% (보정 0.5)
      windupPercent: 0.20, windupModifier: 0.5,
    },
    passive: {
      name: '과다출혈',
      desc: '기본 공격/공격 스킬이 대상에게 5초에 걸친 물리 피해 출혈을 남긴다(최대 5중첩). 몬스터에는 250% 피해.',
      // PC 위키: 중첩당 1.25초마다 3.25~7.5(+추가 공격력 7.5%) = 5초간 4틱(예전 1초 간격은 오류).
      maxStacks: 5, dotDuration: 5, dotTickInterval: 1.25,
      // 1중첩 총 피해 13~30(레벨당 +1) + 0.3 추가AD, 최대(5)중첩 총 피해 65~150(레벨당 +5) + 1.5 추가AD
      oneStackBase: 13, oneStackGrowth: 1, oneStackBonusAdRatio: 0.3,
      maxStackBase: 65, maxStackGrowth: 5, maxStackBonusAdRatio: 1.5,
      empoweredDuration: 5, monsterMultiplier: 2.5,
      // 공격력증가량(최대 중첩 시 5초 AD버프): 30~230(PC 위키·패치 기록), 10렙까지 +5, 13렙까지 +10, 이후 +25.
      // (예전 주석의 "280"은 오래된 템플릿 값 - 아래 계산 결과는 원래부터 230이었다.)
      empoweredAdByLevel: (() => {
        const arr = [30];
        for (let lvl = 2; lvl <= 18; lvl++) {
          let step = lvl <= 10 ? 5 : (lvl <= 13 ? 10 : 25);
          arr.push(arr[lvl - 2] + step);
        }
        return arr;
      })(),
    },
    Q: {
      name: '학살', cooldown: [9, 8, 7, 6, 5], manaByLevel: [25, 30, 35, 40, 45],
      range: 425, handleRange: 205, prepDuration: 0.75,
      bladeDamageByLevel: [50, 80, 110, 140, 170], bladeAdRatioByLevel: [1.0, 1.1, 1.2, 1.3, 1.4],
      handleDamageByLevel: [17.5, 28, 38.5, 49, 59.5], handleAdRatioByLevel: [0.35, 0.385, 0.42, 0.455, 0.49],
      healPercentOfLostHp: 17, healCapPercent: 51, damageType: 'PHYSICAL',
    },
    W: {
      // 원작 위키: "4초 안의 다음 기본 공격이 사거리 +25, 추가 물리 피해, 대상 90% 둔화(1초)".
      // 예전 slowPercent 40은 E(포획) 둔화 값과 혼동된 것으로 보인다.
      name: '마비의 일격', cooldown: 5, mana: 40, rangeBonus: 25, empowerWindow: 4,
      bonusAdRatioByLevel: [0.4, 0.45, 0.5, 0.55, 0.6], slowPercent: 90, slowDuration: 1,
      killManaRefundPercent: 90, killCdrPercent: 50, damageType: 'PHYSICAL',
    },
    E: {
      name: '포획', cooldown: [26, 23.5, 21, 18.5, 16], manaByLevel: [70, 60, 50, 40, 30],
      // 전방 부채꼴(50°, 반경 535) 안의 모든 적을 끌어온다.
      range: 535, castTime: 0.25, slowPercent: 40, slowDuration: 1, coneAngleDeg: 50, // PC 위키 Template:Data Darius/Apprehend: 각도 50°
      armorPenPercentByLevel: [20, 25, 30, 35, 40],
    },
    R: {
      name: '녹서스의 단두대', cooldown: [120, 100, 80], manaByLevel: [100, 100, 0],
      range: 460, castTime: 0.36, recastWindow: 20,
      minDamageByLevel: [125, 250, 375], maxDamageByLevel: [250, 500, 750],
      minAdRatio: 0.75, maxAdRatio: 1.5, perStackBonusPercent: 20,
      fearDuration: 1.5, damageType: 'TRUE',
    },
  },
  // 세트/모데카이저/노틸러스: 기본 스탯+패시브 설명만 우선 반영(다음 단계에서 Q/W/E/R 실전 로직 추가 예정)
  sett: {
    displayName: '세트',
    stats: {
      hp: 670, hpGrowth: 114, hpRegen: 7, hpRegenGrowth: 0.5,
      ad: 60, adGrowth: 4, attackSpeed: 0.625, attackSpeedGrowthPercent: 1.75,
      armor: 33, armorGrowth: 4.7, mr: 28, mrGrowth: 2.05,
      range: 125, moveSpeed: 340, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 21.429%
      windupPercent: 0.21429,
    },
    passive: {
      name: '투기장의 투지',
      desc: '왼손-오른손 번갈아 기본 공격(오른손이 추가 물리피해 + 8배 공격속도로 즉시 이어짐). 왼손 이후 2초 안에 오른손이 안 나가면 다시 왼손부터.',
      // PC 위키 Template:Data Sett/Pit Grit(V25.17): 오른손 추가 피해 5~100(레벨 비례) + 추가 AD 55%.
      // 레벨 사이 곡선은 공개돼 있지 않아 1→18 선형 보간(rightPunchCurveGuessed). 예전 5+5×(레벨-1)=5~90은 옛 값.
      rightPunchDamageAtLevel1: 5, rightPunchDamageAtLevel18: 100, rightPunchCurveGuessed: true, rightPunchBonusAdRatio: 0.55,
      rightHandAttackSpeedMultiplier: 8, leftHandTimeoutSec: 2,
      // 잃은 체력 5%당 초당 추가 체력 재생(PC 위키: 0.5초마다 0.075/0.25/0.5/1/1.025/1.05 → 초당 2배).
      // 6단계가 어느 레벨에 적용되는지는 위키에 없다 - 앞 4단계는 기존 1/6/11/16, 뒤 2단계는 17/18로
      // 추정(regenBreakpointsGuessed).
      regenByLevelBreakpoints: { breakpoints: [1, 6, 11, 16, 17, 18], values: [0.15, 0.5, 1, 2, 2.05, 2.1] }, regenBreakpointsGuessed: true,
    },
    Q: {
      name: '주먹다짐', cooldown: [9, 8, 7, 6, 5], mana: 0,
      moveSpeedBonusPercent: 30, moveSpeedDuration: 1.5, leftHandRangeBonus: 50,
      // PC 위키 Template:Data Sett/Knuckle Down: 10~50 + 대상 최대 체력의 (1% + 공격력 100당 1/1.5/2/2.5/3%).
      // 버그 수정: 예전엔 "공격력 100당 %"를 공격력 × 0.01~0.03 고정 피해로 계산했고, 기본 체력 비율도
      // 1~3%로 들어가 있었다(V14.5부터 전 레벨 1%).
      perHitFlatByLevel: [10, 20, 30, 40, 50], perHitMaxHpPercent: 1, perHitMaxHpPercentPer100AdByLevel: [1, 1.5, 2, 2.5, 3],
      damageType: 'PHYSICAL',
    },
    W: {
      name: '강펀치', cooldown: [18, 16.5, 15, 13.5, 12], mana: 0,
      gritMaxHpPercent: 50, gritDecayDelay: 4, gritDecayPercentPerSec: 30, shieldDuration: 3,
      shieldDecayDelaySec: 0.75, // PC 위키: 보호막 3초, 0.75초 뒤부터 감소
      // PC 위키 Template:Data Sett/Haymaker: 80~160 + 소모한 투지의 (25% + 추가 공격력 100당 25%).
      // 버그 수정: 예전엔 추가 공격력 25%를 고정 피해로 더했다(투지 비율에 붙는 계수였음).
      damageBaseByLevel: [80, 100, 120, 140, 160], gritSpendPercent: 25, gritSpendPercentPer100BonusAd: 25,
      range: 790, damageType: 'TRUE',
      // 버그 수정(공식 수치 확인함 - League Wiki Sett/Patch_history:
      // "Target Range: 790. Width: 805 / 180. Angle: 27°."): 예전엔
      // 공식 발표치를 못 찾아서 "전방으로 갈수록 넓어지는 사다리꼴"이라는
      // 서술만으로 근사했는데, 실제 폭은 원거리(끝) 805 / 근거리(중심) 180
      // 였다 - half-width로 환산하면 끝=402.5, 중심=90. 예전 근사값
      // (중심 55, 끝 220)은 실제 폭의 절반 정도로 너무 좁았다.
      centerHalfWidth: 90, endHalfWidth: 402.5,
    },
    E: {
      name: '안면강타', cooldown: [16, 14.5, 13, 11.5, 10], mana: 0, range: 490,
      damageByLevel: [50, 70, 90, 110, 130], adRatio: 0.6, slowPercent: 70, slowDuration: 0.5, stunDuration: 1,
      monsterBonusDamageMin: 125, monsterBonusDamageMax: 250, // 챔피언 레벨(1~18)에 선형 보간, 몬스터 전용
      damageType: 'PHYSICAL',
    },
    R: {
      name: '대미 장식', cooldown: [120, 100, 80], mana: 0, range: 400,
      maxDamageByLevel: [200, 300, 400], bonusAdRatio: 1.2, bonusHpPercentByLevel: [40, 50, 60],
      // 버그 수정(공식 수치 확인함 - League Wiki/공략 사이트 교차 확인):
      // "Enemies within the epicenter take [center] damage, and other
      // enemies hit by the shockwave take damage reduced by up to 75%
      // based on proximity" - 실제 수치(50/75/100, +30% 보너스 AD,
      // +10/12.5/15% 보너스체력)를 확인해보니 center 값의 정확히 25%다
      // (50/200=75/300=100/400=0.25, 1.2*0.25=0.3, 40*0.25=10 등 전부
      // 정확히 일치) - 즉 "충격파" 감쇠는 착지 중심에서 100% -> Effect
      // Radius 끝에서 25%로 선형 감소하는 하나의 공식이다. 별도의
      // shockwave 전용 계수를 새로 만들지 않고 falloff 비율(0.25~1.0)만
      // center 공식에 곱해서 구현한다.
      shockwaveFalloffFloor: 0.25,
      carryDistance: 600, slideDistance: 250, impactRadius: 600, // 공식 확인: "carry forward 600 units", "quickly sliding forward 250 units", "Effect Radius: 600"
      slowPercent: 99, slowDuration: 1, damageType: 'PHYSICAL',
    },
  },
  nilah: {
    displayName: '닐라',
    stats: {
      hp: 570, hpGrowth: 101, hpRegen: 6, hpRegenGrowth: 0.9,
      ad: 58, adGrowth: 2, attackSpeed: 0.697, attackSpeedGrowthPercent: 1.25,
      armor: 27, armorGrowth: 4.2, mr: 32, mrGrowth: 2.05,
      range: 225, moveSpeed: 340, mana: 350, manaGrowth: 35, manaRegen: 8.2, manaRegenGrowth: 0.7,
      // PC 위키 기본 스탯: 평타 선딜 22%
      windupPercent: 0.22,
    },
    passive: {
      name: '영원한 기쁨',
      xpLostCompensationPercent: 50,
      allyHealBonusPercent: 7.5, allyShieldBonusPercent: 15,
      sharedShieldMaxDuration: 4,
      qOverhealShieldDuration: 4,
      rOverhealShieldDuration: 6,
    },
    Q: {
      name: '무형의 검', cooldown: 4, mana: 30, range: 600,
      // 데이터 수정(실제 bin 확인): Q의 실제 판정 폭은 150이 아니라 80이다
      // (NilahQ의 mLineWidth=80, 그리고 화면 표시용 TargeterDefinitionLine의
      // lineWidth도 레벨별로 전부 80으로 일치 - 두 값이 서로 다른 소스에서
      // 같은 숫자로 확인됨). 예전 150은 정확한 근거 없이 들어간 값이었다.
      // E 돌진 중 Q(웨이브)는 완전히 다른 오브젝트(NilahEQMis)라 폭도
      // 다르다 - mLineWidth=125, mMissileSpec.mMissileWidth도 125로 확인.
      impactRadius: 80, waveImpactRadius: 125, coneAngleDeg: 60,
      // 데이터 수정(현재 패치 기준 실제 값 확인): 패시브의 크리티컬 확률 기반
      // 방어구 관통/생명흡수는 출시 초기 수치(30%/20%)가 그대로 남아있었다.
      // 여러 차례 밸런스 패치를 거쳐 현재는 방어구 관통 0~33%, 생명흡수 0~15%
      // (크리티컬 확률에 비례)로 확정되어 있다.
      // V26.01: 방어구 관통 0~33% → 0~30%. 흡혈(챔피언 대상 회복)은 현재 0~20%(PC 위키).
      armorPenFromCritPercent: 30, lifestealFromCritPercent: 20,
      damageBaseByLevel: [0,10,20,30,40], totalAdRatio: 1.0,
      critMultiplier: 1.7, critMultiplierIE: 1.91,
      rangeBonus: 125, empoweredDuration: 4,
      attackSpeedStartPercent: 10, attackSpeedPerChampionLevelPercent: 2.941, attackSpeedMaxPercent: 60,
      // 닐라 Q 공격 속도 증가는 스킬 랭크가 아니라 챔피언 레벨에 따라 10%에서 시작해
      // 레벨당 +2.941%씩 증가하며 최대 60%에서 제한한다.
      extraConeTotalAdRatio: 1.0, coneDuration: 4,
      // 데이터 수정: Q 강화 평타(원뿔 범위 공격)의 몬스터(정글 몹 등) 대상
      // 피해가 100%(1.0)로 잘못 들어가 있었다 - 실제로는 미니언 33%, 몬스터
      // 10%(0.1)로 훨씬 낮게 감소된다. 몬스터 피해가 그대로 100%면 정글
      // 상대 전투력이 실제 게임보다 훨씬 강하게 계산된다.
      // (실제 bin의 MonsterMod는 1.0(=100%)로 나오지만, 이 bin 자체가
      // 출시 초기 스냅샷으로 확인된 값들이 여럿 섞여 있어 - 위키의 "몬스터
      // 대상 10%로 감소"가 이후 패치로 추가된 최신 값으로 보고 유지한다.)
      minionDamageMultiplier: 0.33, monsterDamageMultiplier: 0.10, executeMinionHp: 20,
    },
    W: {
      name: '승리의 장막', cooldown: [26,25,24,23,22], mana: [60,45,30,15,0],
      duration: 2.25, allyDuration: 1.5, range: 150, moveSpeedPercent: [15,17.5,20,22.5,25],
      magicDamageReductionPercent: 25,
      // 데이터 추가(실제 bin 확인 - ExtensionBonus 구현): 아군과 효과를
      // 공유하는 판정 범위. duration(2.25) - allyDuration(1.5) =
      // ExtensionBonus(0.75)가 정확히 일치해서, "이 범위 안에 머무는 동안은
      // 공유 지속시간이 닐라 본인 지속시간까지 늘어난다"는 의도로 해석했다.
      areaTriggerSize: 150,
    },
    E: {
      name: '급류', cooldown: 0.5,
      // 데이터 수정: E 마나 비용이 40으로 되어 있었는데, 현재 패치 기준
      // 실제 값은 30이다(위키 3곳 이상 교차 확인).
      mana: 40, range: 550, maxCharges: 2, // Data Dragon 16.20.1: 40(예전 30)
      // 데이터 수정: 재충전 시간 [26,22.5,19,15.5,12]는 출시 초반 상향
      // 이후의 값(12.13 패치에서 강화 시간이 늘어난 값)이 그대로 남아있던
      // 것으로 보인다 - 이후 다시 조정되어 현재는 [22,19.5,17,14.5,12]다.
      rechargeTime: [22,19.5,17,14.5,12], damageByLevel: [60,70,80,90,100], bonusAdRatio: 0.2,
      // 데이터 수정(실제 bin 확인): E의 실제 판정 폭은 50이다(NilahE의
      // mLineWidth=50, 그리고 화면 표시용 TargeterDefinitionLine의
      // lineWidth도 레벨별로 전부 50 - 두 소스가 일치해서 신뢰도가 높다).
      // 예전 0.28(world 단위, 약 27.8 LoL 단위 상당)은 근사치였는데,
      // 실제 값(25, =50의 절반)으로 정확히 환산해서 대체한다.
      dashDuration: 0.16, pathHalfWidthWorld: lolRangeToWorld(25),
    },
    R: {
      name: '환희', cooldown: [110,95,80], mana: 100, damageRadius: 450, healRadius: 1500,
      channelDuration: 1, tickInterval: 0.25,
      // 버그 수정: 틱(0.25초×4회)마다 총합값(60/100/140 + 40%)을 넣어 4배 피해가 들어갔다.
      // PC 위키: 틱당 15/25/35 + 추가 AD 10%(총 60/100/140 + 40%).
      tickDamageByLevel: [15,25,35], tickBonusAdRatio: 0.1,
      finalDamageByLevel: [125,225,325], finalBonusAdRatio: 1.0,
      healBasePercent: 20, healCritPercentPerCrit: 0.3, nonChampionHealMultiplier: 0.10,
      shieldDuration: 6,
      // 데이터 추가(실제 bin 확인): 지금까지는 "초과 회복량을 보호막으로
      // 전환"만 구현되어 있었는데, 실제 스펠 데이터에 이것과는 별개로
      // ShieldCalc(ShieldBase + 100% 보너스AD)라는 확정 보호막 공식이 따로
      // 있다. ShieldBase 배열([15,65,115,165,215,265,315])은 인덱스 0이
      // 아니라 1/2/3번째가 실제 랭크 1/2/3 값이다 - DamageBase 배열도 같은
      // 구조([-10,0,10,20,30,40,50])이고 그 인덱스 1/2/3(0,10,20 -> 아니,
      // 정확히는 인덱스 순서 확인: 실제로 이미 검증된 finalDamageByLevel
      // [125,225,325]와 DamageBase 인덱스 1~3이 정확히 일치한다) - 그래서
      // ShieldBase도 같은 규칙으로 인덱스 1~3인 [65,115,165]를 실제 랭크
      // 1/2/3 값으로 사용한다.
      // 예전 "시전 즉시 고정 보호막(ShieldBase + 추가 AD 100%)"은 PC 위키 어디에도 없어 제거 - 원작 R의
      // 보호막은 초과 회복량 전환(6초)뿐이다.
      // 미구현이었던 부분 추가: 원작 R은 "각 타격마다 대상을 10% 슬로우
      // (3초, 다시 맞으면 갱신)"시킨다 - 지금까지 데미지/끌어당기기만
      // 구현되어 있고 슬로우 자체가 완전히 빠져 있었다.
      slowPercent: 10, slowDuration: 3,
    },
  },
  mordekaiser: {
    displayName: '모데카이저',
    stats: {
      hp: 645, hpGrowth: 104, hpRegen: 5, hpRegenGrowth: 0.75,
      ad: 61, adGrowth: 4, attackSpeed: 0.625, attackSpeedGrowthPercent: 1,
      armor: 37, armorGrowth: 4.2, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 335, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 21.133%
      windupPercent: 0.21133,
    },
    passive: {
      name: '암흑 탄생',
      desc: '기본 공격에 주문력 40% 추가 마법 피해. 기본 스킬/공격 3회 적중 시 4초간 오라 피해+이동속도(적중마다 갱신).',
      apRatio: 0.4, hitsForAura: 3, auraDuration: 4,
      // PC 위키: 초당 5(+주문력 30%)(+대상 최대 체력 1~5%, 레벨 비례). 레벨 사이 곡선은 공개돼 있지 않아
      // 1→18 선형 보간(auraHpCurveGuessed). 예전엔 1% 고정이었다.
      auraDamagePerSec: 5, auraApRatio: 0.3, auraTargetMaxHpPercentAtLevel1: 1, auraTargetMaxHpPercentAtLevel18: 5, auraHpCurveGuessed: true,
      auraTickSec: 0.25, // 피해는 짧은 틱으로 나눠 들어감(원작 0.125초 단위 - 여기선 0.25초)
      // 이동 속도 3/6/9%(레벨 비례): V10.1에 3% 고정으로 내려갔다가 V12.8에 3/6/9%로 복구(PC 위키).
      // 레벨 구간(1/6/11)은 위키에 없어 추정(auraMsBreakpointsGuessed).
      auraMoveSpeedByLevel: { breakpoints: [1, 6, 11], values: [3, 6, 9] }, auraMsBreakpointsGuessed: true, auraRange: 375,
      stackDuration: 4, // 중첩은 챔피언/대형 몬스터 적중마다 1, 4초 지속(적중 시 갱신), 최대 3
    },
    Q: {
      // PC 위키: 사거리 625(가장자리 22.5~625), 폭 90~150의 전방 직사각형 판정. 예전 575 + 지점 원형 판정은 근거 없음.
      name: '말살', cooldown: [8, 7, 6, 5, 4], mana: 0, range: 625, width: 150,
      damageByLevel: [80, 115, 150, 185, 220], bonusAdRatio: 1.2, apRatio: 0.7,
      // 챔피언 레벨(스킬 레벨과 별개) 보너스 고정 피해: 10레벨부터 매
      // 레벨 +5, 18레벨에 45로 최대(요청 그대로 "0~45(10레벨부터 5씩 증가)").
      // 단일 대상 적중 시 보너스%까지 함께 곱해진다(사용자가 준 "최대
      // 마법피해" 수치의 +67.5 = 45×1.5와 정확히 일치 - Node로 검증 완료).
      // V26.20: 0~45 → 0~63(레벨 비례). 10레벨부터 레벨당 +7로 18레벨 63(예전 +5×9=45와 같은 구조로 추정).
      levelBonusDamage: { startLevel: 10, perLevel: 7, maxLevel: 18 },
      singleTargetBonusPercentByLevel: [30, 35, 40, 45, 50], damageType: 'MAGICAL',
    },
    W: {
      name: '불멸', cooldown: [12, 11, 10, 9, 8], mana: 0,
      dealtDamageBankPercent: 45, takenDamageBankPercent: 7.5, nonChampionBankPercent: 25, // 챔피언 아닌 유닛 피해는 75% 감소 흡수 = 25%만 반영
      minShieldMaxHpPercent: 5, maxShieldMaxHpPercent: 30, shieldDecayDuration: 4, // PC 위키: 보호막 4초(감소) - 예전 6초
      recastHealPercentByLevel: [35, 37.5, 40, 42.5, 45],
      recastMinDelaySec: 0.5, // PC 위키(Indestructible 템플릿): 첫 시전 0.5초 뒤 재시전 가능
    },
    E: {
      // PC 위키: 시전 사거리 700, 판정 직사각형 길이 800·폭 200, 0.5초 뒤 250 유닛 끌어당김.
      name: '죽음의 손아귀', cooldown: [16, 14, 12, 10, 8], mana: 0, range: 700, areaLength: 800, areaWidth: 200, pullDistance: 250,
      magicPenPercentByLevel: [5, 7.5, 10, 12.5, 15],
      damageByLevel: [60, 80, 100, 120, 140], apRatio: 0.45, pullDelay: 0.5, damageType: 'MAGICAL',
    },
    R: {
      name: '죽음의 세계', cooldown: [120, 110, 100] /* Data Dragon 16.20.1 */, mana: 0, range: 650, castTime: 0.5,
      duration: 7, statStealPercent: 10, // PC 위키 V26.15(13% → 10%): 대상 현재 체력·공격력·주문력·공속·방어력·마저 10%, 크기 ±10%
      realmRadius: 1200, // PC 위키: 일반 맵 지형을 그대로 가진 반경 1200 경기장(중심은 커뮤니티 자료 - mordekaiser_death_realm.js)
    },
  },
  nautilus: {
    displayName: '노틸러스',
    stats: {
      hp: 646, hpGrowth: 100, hpRegen: 8.5, hpRegenGrowth: 0.55,
      ad: 58, adGrowth: 3.3, attackSpeed: 0.706, attackSpeedGrowthPercent: 1,
      armor: 39, armorGrowth: 4.95, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 325, mana: 400, manaGrowth: 47, manaRegen: 8.65, manaRegenGrowth: 0.5,
      // PC 위키 기본 스탯: 평타 선딜 30.637%, 공속 계수 0.612
      windupPercent: 0.30637, attackSpeedRatio: 0.612,
    },
    // 수치 출처: 사용자 원본 자료에는 노틸러스 스킬 수치가 없다(패시브 설명만
    // 있음). 공개 LoL 자료를 웹 검색 스니펫으로 교차 확인한 값을 쓰고, 확인하지
    // 못한 값은 옆에 "미확인"으로 표시했다 - 원문을 받으면 그 값만 바꾸면 된다.
    passive: {
      name: '강력한 일격', desc: '첫 공격이 추가 물리 피해 + 속박(동일 대상 6초 1회).',
      // PC 위키 V13.3: 8~110 → 14~116(레벨 비례). 128이라는 값은 어떤 패치 기록에도 없어 116으로 확정.
      bonusDamageAtLevel1: 14, bonusDamageAtLevel18: 116,
      rootByLevel: { breakpoints: [1, 6, 11, 16], values: [0.75, 1.0, 1.25, 1.5] }, // PC 위키: 0.75~1.5초(V9.12). 구간 1/6/11/16은 미확인
      sameTargetCooldownSec: 5, // PC 위키 패치 기록 V13.24: 같은 대상 재발동 6초 → 5초(이후 되돌린 기록 없음)
    },
    Q: {
      name: '닻줄 견인', cooldown: [14, 13, 12, 11, 10], mana: 60, range: 1150,
      damageByLevel: [85, 125, 165, 205, 245], apRatio: 0.9, damageType: 'MAGICAL', // 26.18 피해 조정 반영, AP 계수 90%
      missileSpeed: 2000, width: 180, // PC 위키 Template:Data Nautilus/Dredge Line: 속도 2000, 폭 180(가장자리)
      castTimeSec: 0.25, // PC 위키: 시전 시간 0.25
      pullDurationSec: 0.9, stunDurationSec: 1, // 28차: PC 위키 - 적 명중 시 서로 0.9초에 걸쳐 끌려가고 대상 1초 기절(30차: 0.9초 = 최대 사거리 기준으로 해석, 가까우면 더 빨리)
      terrainRefundPercent: 50, // 지형에 맞으면 재사용 대기시간·마나 50% 환급
    },
    W: {
      name: '타이탄의 분노', cooldown: 12, mana: 60, durationSec: 6,
      shieldByLevel: [50, 60, 70, 80, 90], shieldMaxHpPercentByLevel: [8, 9, 10, 11, 12],
      onHitDamageByLevel: [30, 40, 50, 60, 70], onHitApRatio: 0.4, onHitDotDurationSec: 2, splashRadius: 350,
      damageType: 'MAGICAL',
    },
    E: {
      name: '역류', cooldown: [7, 6.5, 6, 5.5, 5], mana: [50, 60, 70, 80, 90], radius: 600,
      damageByLevel: [55, 90, 125, 160, 195], apRatio: 0.5, damageType: 'MAGICAL',
      // PC 위키: 폭발 3회(의도된 간격 0.25초), 두 번째 이후 폭발은 50% 피해, 둔화는 1.5초에 걸쳐 감쇠(2→1.5초 패치).
      explosionCount: 3, subsequentDamagePercent: 50,
      explosionIntervalSec: 0.25,
      // PC 위키(노틸러스 문서): 시전 시간 0.25초. 폭발은 시전이 끝난 뒤 0 / 0.297 / 0.561초(의도는 0.25 간격, 위키 실측 유효 시각).
      castTimeSec: 0.25, explosionOffsetsSec: [0, 0.297, 0.561],
      slowPercentByLevel: [30, 35, 40, 45, 50], slowDecaySec: 1.5,
    },
    R: {
      name: '폭뢰', cooldown: [120, 100, 80], mana: 100, range: 825,
      damageByLevel: [150, 275, 400], apRatio: 0.8,
      pathDamageByLevel: [125, 175, 225], pathApRatio: 0.4,
      stunByLevel: [1, 1.5, 2], // 주 대상 에어본+기절 총합
      pathKnockupSec: 1, // PC 위키: 경로 폭발에 맞은 적은 1초 공중에 뜸(0.5초 → 1초 패치). 예전 0.75는 근거 없던 값
      // PC 위키(노틸러스 문서·Depth Charge 템플릿): 경로는 0.264초마다 충격파 위치에서 반경 225 폭발(예전엔 미확인 폭 300의 연속 판정).
      pathEruptionRadius: 225, pathEruptionIntervalSec: 0.264,
      // PC 위키 Template:Data Nautilus/Depth Charge: 시전 0.46초, 충격파 속도 275에서 초당 +466.67 가속.
      shockwaveSpeed: 275, shockwaveAccelPerSec: 466.67,
      castTimeSec: 0.46,
      damageType: 'MAGICAL',
    },
  },
  rammus: {
    displayName: '람머스',
    // 38차. 수치 출처: 기본 스탯·재사용 대기시간·마나·사거리는 Data Dragon 16.20.1(GitHub 미러). 스킬 수치는 25.12 개편
    // (+25.13) 패치 노트·위키 패치 기록 요약을 검색으로 교차 확인한 값. 확인하지 못한 값은 "추정"으로 표시했다.
    stats: {
      hp: 645, hpGrowth: 100, hpRegen: 8, hpRegenGrowth: 0.55,
      ad: 65, adGrowth: 2.75, attackSpeed: 0.7, attackSpeedGrowthPercent: 2.215, // adGrowth: Data Dragon이 0으로 내보내는 알려진 문제 - 2.75는 추정
      armor: 35, armorGrowth: 4.5, mr: 32, mrGrowth: 2.05,
      range: 125, moveSpeed: 335, mana: 310, manaGrowth: 33, manaRegen: 7.85, manaRegenGrowth: 0.5,
      windupPercent: 0.2292, // 39차: LeagueSandbox Rammus.json(4.20) AttackDelayCastOffsetPercent -0.0708 → 0.3 - 0.0708
    },
    passive: {
      name: '가시박힌 껍질', desc: '총 방어력과 총 마법 저항력의 15%만큼 추가 공격력을 얻습니다.',
      armorToAdPercent: 15, mrToAdPercent: 15, // 25.12: 평타 추가 마법 피해 → 총 방어력·마저 15% 추가 공격력
    },
    Q: {
      name: '대회전', cooldown: [12, 10.5, 9, 7.5, 6], mana: 60, damageType: 'MAGICAL', // 재사용 대기시간은 구르기가 끝난 뒤부터 돈다
      damageByLevel: [80, 120, 160, 200, 240], apRatio: 1.0, // 25.12: 80~200 → 80~240. AP 100%
      rollDurationSec: 6, recastLockSec: 1, // 최대 6초, 1초 뒤부터 재사용으로 끝낼 수 있다
      msPercentPerSecAt1: 25, msPercentPerSecAt18: 40.83, msPercentCapAt1: 150, msPercentCapAt18: 245, // 초당 이동 속도 증가율·최대치(레벨 비례)
      impactRadius: 250, knockbackDistance: 125, knockbackSec: 0.15, stunSec: 0.4, // knockbackSec(밀려나는 시간)은 추정
      slowPercentByLevel: [40, 50, 60, 70, 80], slowDurationSec: 1,
      // 공 회전 속도 - 수치 공개 없음(추정). 원작은 거리만큼 굴러가는 것보다 훨씬 빨리 돈다:
      // 제자리에서도 초당 spinBaseRevPerSec 바퀴 + 실제 굴러간 거리 회전 × spinRollMult
      spinBaseRevPerSec: 1.5, spinRollMult: 2.2,
    },
    W: {
      name: '몸 말아 웅크리기', cooldown: 7, mana: 40, durationSec: 7, recastLockSec: 0.5, // 25.12: 6 → 7초. recastLockSec는 추정
      bonusArmorByLevel: [27, 32, 37, 42, 47], bonusMrByLevel: [27, 32, 37, 42, 47], // 25.13
      armorPercentByLevel: [30, 37.5, 45, 52.5, 60], // 총 방어력 비례 추가 방어력 - 25.12 이전 기록 값(현재 값 추정)
      returnDamageByLevel: [15, 25, 35, 45, 55], returnArmorRatio: 0.1, damageType: 'MAGICAL', // 반사 피해 - 추정(확인 못 함)
    },
    E: {
      name: '광란의 도발', cooldown: 12, mana: 50, range: 325,
      tauntDurationByLevel: [1.2, 1.4, 1.6, 1.8, 2.0], // 추정(25.12에서 없어진 공속 버프 지속시간과 같은 값)
    },
    R: {
      name: '지진 폭격', cooldown: [120, 105, 90], mana: 100, damageType: 'MAGICAL',
      damageByLevel: [150, 250, 350], apRatio: 0.6, structureDamageMultiplier: 2, // 25.12: 100~250 → 150~350. 구조물 2배(위키)
      slowPercentByLevel: [30, 40, 50], slowDurationSec: 1.5, aftershockCount: 3, aftershockDurationSec: 3.5, // 여진은 둔화만(25.12에서 여진 피해 삭제)
      powerballKnockupSec: 1, // 대회전 중 사용 시 중앙 적 공중에 뜸 + 대회전 피해(1초는 검색 자료 하나 - 추정)
      radius: 300, centerRadius: 150, rangeBase: 800, rangeBonusMsRatio: 1.0, jumpSec: 0.75, // 추정: 범위·중앙 반경·사거리(기본 + 추가 이동 속도)·도약 시간
    },
  },
  masteryi: {
    displayName: '마스터 이',
    stats: {
      hp: 640, hpGrowth: 105, hpRegen: 7.5, hpRegenGrowth: 0.65,
      ad: 65, adGrowth: 2.5, attackSpeed: 0.679, attackSpeedGrowthPercent: 2.5,
      armor: 33, armorGrowth: 5, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 355, mana: 251, manaGrowth: 42, manaRegen: 7.25, manaRegenGrowth: 0.45,
      // PC 위키 기본 스탯: 평타 선딜 24.375%
      windupPercent: 0.24375,
    },
    passive: {
      name: '2연속 공격',
      desc: '매 4번째 기본 공격마다 2연속 공격(2번째 타격은 0.5 공격력의 추가 물리피해, 치명타 적용 가능).',
      everyNAttacks: 4, secondHitAdRatio: 0.5,
    },
    Q: {
      name: '일격필살', cooldown: [20, 19.5, 19, 18.5, 18], manaByLevel: [50, 55, 60, 65, 70], range: 600,
      // PC 위키 Template:Data Master Yi/Alpha Strike: 20~100 + 총 공격력 70%, 몬스터 추가 60~160
      // (V25.16), 치명타는 일반 치명타 배율(V25.16에 치명타 추가 피해 계수 75%→100%).
      baseDamageByLevel: [20, 40, 60, 80, 100], adRatio: 0.7,
      monsterBonusDamageByLevel: [60, 85, 110, 135, 160],
      extraHitPercent: 25, hitCount: 4, hitIntervalSec: 0.2, basicAttackCdrSec: 1,
      damageType: 'PHYSICAL',
      // Alpha Strike 상태머신 전용 설정(요청 문서 1, 섹션 32 "숫자를 코드
      // 곳곳에 흩어지지 않게 한 곳에 모은다"). onHitModifier는 라이브 수치
      // (75%) 그대로.
      //
      // 버그 수정(월드 거리 시스템 통합): 예전에는 이 프로젝트가 사거리를
      // LoL 원본 그대로 저장하면서도(range 600) 실제 판정 함수는 그 숫자를
      // world 거리로 잘못 취급해서, 재등장 거리/추적 거리 같은 값을
      // "target.collisionRadius × 3.2" 같은 스킬 전용 임시 근사치로
      // 우회해야 했다. 이제 lolRangeToWorld()가 프로젝트 전체에서 LoL→World
      // 변환을 통일해서 처리하므로, 원작 그대로의 LoL 원본 수치를 데이터에
      // 그대로 적고 소비하는 쪽에서 lolRangeToWorld()만 거치면 된다.
      onHitModifier: 0.75,
      reappearDistance: 75, // 원작 그대로: primaryTarget 기준 75 units 앞(LoL 단위)
      // 재등장 위치 문서 섹션 10/11: 원작은 주 대상 이동을 최대 2000 units
      // 까지 따라가고, 그보다 멀어지면(순간이동 등) 더 이상 추적하지 않는다
      // - 이제 실제 LoL 원본 수치(2000)를 그대로 쓴다.
      maxPrimaryTargetFollowDistance: 2000,
      // 벽 충돌 문서 섹션 16: 75 -> 60 -> 45 -> 30 -> 15 units처럼 점진적으로
      // 거리를 줄여가며 안전한 위치를 찾는다. reappearDistance(75) 기준
      // 배율(1.0~0.2)로 근사 - 실제 거리는 소비하는 쪽에서
      // lolRangeToWorld(reappearDistance * step)로 계산한다.
      reappearDistanceShrinkSteps: [1.0, 0.8, 0.6, 0.4, 0.2],
    },
    W: {
      name: '명상', cooldown: 10, manaFlat: 40, manaPercentMaxPerSec: 6, channelDuration: 4,
      healPerSecByLevel: [30, 50, 70, 90, 110], totalHealByLevel: [120, 200, 280, 360, 440],
      healApRatio: 1.0, healMissingHpBonusMaxPercent: 100,
      burstReductionPercent: 70, burstReductionDuration: 0.5,
      sustainedReductionByLevel: [45, 47.5, 50, 52.5, 55],
    },
    E: {
      name: '우주류 검술', cooldown: 14, mana: 0, buffDuration: 5,
      trueDamageByLevel: [20, 25, 30, 35, 40], bonusAdRatio: 0.35, damageType: 'TRUE',
    },
    R: {
      name: '최후의 전사', cooldown: 85, mana: 100, duration: 7, takedownExtendSec: 7,
      attackSpeedPercentByLevel: [25, 45, 65], moveSpeedPercentByLevel: [35, 45, 55],
    },
  },
  chogath: {
    displayName: '초가스',
    stats: {
      hp: 644, hpGrowth: 94, hpRegen: 9, hpRegenGrowth: 0.85,
      ad: 69, adGrowth: 4.2, attackSpeed: 0.658, attackSpeedGrowthPercent: 1.44,
      armor: 38, armorGrowth: 4.5, mr: 32, mrGrowth: 2.05,
      range: 125, moveSpeed: 345, mana: 270, manaGrowth: 60, manaRegen: 7.2, manaRegenGrowth: 0.45,
      // PC 위키 기본 스탯: 평타 선딜 21.9%
      windupPercent: 0.219,
    },
    passive: {
      name: '육식', desc: '유닛 처치 시 체력/마나 회복(레벨 비례).',
      healBase: 16, healPerLevel: 2, manaBase: 4.44, manaPerLevel: 0.28,
    },
    Q: {
      // V25.23: 80/140/200/260/320 → 80/135/190/245/300. 마나 50(Data Dragon), 폭발 반경 250, 지연 0.627초(PC 위키).
      name: '파열', cooldown: 6 /* Data Dragon 16.20.1 */, mana: 50, range: 950, castTime: 0.5 /* PC 위키(예전 0.25) */, impactDelay: 0.627, radius: 250,
      damageByLevel: [80, 135, 190, 245, 300], apRatio: 1.0,
      knockupDuration: 1, slowPercent: 60, slowDuration: 1.5, damageType: 'MAGICAL',
    },
    W: {
      // V25.23: 80/135/190/245/300 → 80/130/180/230/280. 마나 70~90(Data Dragon).
      name: '흉포한 울부짖음', cooldown: [11, 10.5, 10, 9.5, 9] /* Data Dragon 16.20.1 */, mana: [70, 75, 80, 85, 90],
      range: 650, coneAngleDeg: 60, castTime: 0.5, // PC 위키 시전 0.5초(예전 0.25초 고정 타이머)
      damageByLevel: [80, 130, 180, 230, 280], apRatio: 0.7,
      silenceDurationByLevel: [1.6, 1.7, 1.8, 1.9, 2.0], damageType: 'MAGICAL',
    },
    E: {
      name: '날카로운 가시', cooldown: [8, 7, 6, 5, 4], mana: 30, charges: 3, rangeMax: 500,
      perHitDamageByLevel: [30, 50, 70, 90, 110], apRatio: 0.3, // V26.17: 20~100 → 30~110
      perHitMaxHpPercentByLevel: [2.5, 2.85, 3.2, 3.55, 3.9], perStackMaxHpPercent: 0.5,
      slowPercentByLevel: [30, 35, 40, 45, 50], slowDuration: 1.5, damageType: 'MAGICAL',
    },
    R: {
      name: '포식', cooldown: [80, 70, 60], mana: 100, castTime: 0.25 /* PC 위키(예전 즉시) */, rangeBase: 175, rangePerStack: 2.5, // 버그 수정: 175가 맞음(Leaguepedia 패치 기록 "RANGE: 150 ⇒ 175" 확인) - 200은 잘못된 값이었음
      championDamageByLevel: [300, 475, 650], championApRatio: 0.5, championBonusHpRatio: 0.1,
      nonChampionDamage: 1200, nonChampionApRatio: 0.5, nonChampionBonusHpRatio: 0.1,
      hpGrowthByLevel: [80, 120, 160], nonEpicStackCap: 6, damageType: 'TRUE',
    },
  },
  leesin: {
    displayName: '리 신',
    stats: {
      hp: 645, hpGrowth: 108, hpRegen: 7.5, hpRegenGrowth: 0.7,
      ad: 66, adGrowth: 3.4, attackSpeed: 0.651, attackSpeedGrowthPercent: 3,
      armor: 36, armorGrowth: 4.5, mr: 32, mrGrowth: 2.05,
      range: 125, moveSpeed: 345,
      // 리 신은 마나 대신 기력(에너지)을 쓴다 - 레벨에 따라 늘지 않는 고정
      // 자원 풀이라 mana/manaGrowth로 그대로 재사용한다(기존 자원 시스템
      // 확장, 새 자원 시스템을 따로 만들지 않음). manaRegen은 다른 챔피언과 같이
      // "5초당" 회복량으로 해석된다(regenTick이 /5) - 기력 50/5초 = 초당 10(원작과 동일).
      mana: 200, manaGrowth: 0, manaRegen: 50, manaRegenGrowth: 0,
      // PC 위키 기본 스탯: 평타 선딜 19.531%
      windupPercent: 0.19531,
    },
    passive: {
      name: '질풍격',
      desc: '스킬 사용 시 다음 2회 평타 공격속도 +40%. 1타에 기력, 2타에 절반 기력 회복(레벨 구간별).',
      attackSpeedBonusPercent: 40, durationSec: 3,
      energyByLevelBreakpoints1: { breakpoints: [1, 7, 13], values: [20, 30, 40] },
      energyByLevelBreakpoints2: { breakpoints: [1, 7, 13], values: [10, 15, 20] },
    },
    Q: {
      name: '음파/공명의 일격', cooldown: [10, 9, 8, 7, 6], energy1: 50, energy2: 25,
      range1: 1100, range2: 1250, markDuration: 3, castTimeSec: 0.25, missileSpeed: 1800,
      damageByLevel: [60, 90, 120, 150, 180], bonusAdRatio: 0.9,
      maxDamageByLevel: [120, 180, 240, 300, 360], maxBonusAdRatio: 1.8,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '방호/강철의 의지', cooldown: 7, energy1: 50, energy2: 25,
      range1: 700, markDuration: 3,
      // PC 위키 Template:Data Lee Sin/Safeguard: 70/115/160/205/250 (+ 주문력 80%).
      shieldByLevel: [70, 115, 160, 205, 250], shieldApRatio: 0.8, shieldDuration: 2,
      lifestealPercentByLevel: [10, 14, 18, 22, 26], lifestealDuration: 4,
    },
    E: {
      name: '폭풍/무력화', cooldown: 8, energy1: 50, energy2: 25,
      range: 450, markDuration: 3, castTimeSec: 0.25,
      damageByLevel: [35, 60, 85, 110, 135], adRatio: 0.9,
      slowPercentByLevel: [35, 45, 55, 65, 75], slowDuration: 4, damageType: 'MAGICAL',
    },
    R: {
      name: '용의 분노', cooldown: [110, 85, 60], mana: 0, range: 375,
      damageByLevel: [175, 400, 625], bonusAdRatio: 2.0,
      // PC 위키: 800 밀어냄(0.8초 동안), 대상 공중에 뜸 1초, 충돌한 적도 공중에 뜸 1초(확인). 예전 1200은 출처 불명.
      knockbackDistance: 800, knockbackSec: 0.8, airborneDuration: 1, castTimeSec: 0.25, collisionAirborneSec: 1,
      collisionBonusHpRatioByLevel: [12, 15, 18], damageType: 'PHYSICAL',
    },
  },
  vex: {
  displayName: '벡스',

     stats: {
     hp: 590, hpGrowth: 104, hpRegen: 6.5, hpRegenGrowth: 0.6,
     ad: 54, adGrowth: 2.75, attackSpeed: 0.669, attackSpeedGrowthPercent: 1,
     armor: 23, armorGrowth: 4.45, mr: 28, mrGrowth: 1.3,
     range: 550, moveSpeed: 335,
     mana: 490, manaGrowth: 32, manaRegen: 6, manaRegenGrowth: 0.8,
      // PC 위키 기본 스탯: 평타 선딜 15.625%, 공속 계수 0.625
      windupPercent: 0.15625, attackSpeedRatio: 0.625,
     },

     passive: {
      name: '파멸과 우울',
      desc: '주기적으로 다음 기본 스킬이 적을 공포에 빠뜨린다,주변 적이 돌진하거나 순간적으로 이동할 때마다 벡스가 적에게 6초 동안 우울 표식을 남깁니다. 벡스의 다음 기본 공격은 우울 상태의 적에게 마법 피해를 추가로 입히며, 이 스킬의 재사용 대기시간이 25% 감소합니다.',
      // PC 위키(Template:Data_Vex/Doom_'n_Gloom) + 공식 패치 노트(14.5, 25.S1.1 - 40% AP는 스위프트플레이 전용으로 판단).
      // 파멸: 정적 재사용 대기시간(스킬 가속 무관), 다음 기본 스킬(Q/W/E)이 적중한 적을 공포. 대기시간은 기본 스킬 시전 시 시작.
      doomCooldownByLevel: { breakpoints: [1, 6, 11, 16], values: [25, 22, 19, 16] },
      fearDurationByLevel: { breakpoints: [1, 6, 11, 16], values: [0.75, 1, 1.25, 1.5] },
      doomBreakpointsGuessed: true, // 4단계 값의 레벨 구간(1/6/11/16)은 출처에 없어 추정
      // 공포 중 둔화 60~99%(벡스에게서 멀수록 큼). 최대가 되는 거리는 출처에 없어 800(E 사거리)으로 추정.
      fearSlowMin: 0.60, fearSlowMax: 0.99, fearSlowFullDistance: 800, fearSlowDistanceGuessed: true,
      // 우울: 반경 1600 안에서 돌진/점멸한 적 챔피언·몬스터에 6초 표식. E 적중도 표식. 다음 평타/기본 스킬 적중이 소모.
      gloomRadius: 1600, gloomDuration: 6,
      // 소모 피해 40~150(레벨) + 주문력 25%. 레벨 사이 곡선은 출처에 없어 1~18 선형(위키 현행 표기는 40~162.94로 엇갈림).
      gloomDamageAtLevel1: 40, gloomDamageAtLevel18: 150, gloomApRatio: 0.25, gloomCurveGuessed: true,
      // 챔피언 이외 대상: 40/45/50/55/60% 피해, 재사용 대기시간 10% 환급(챔피언 25%). 5단계 레벨 구간은 추정.
      gloomNonChampionPercentByLevel: { breakpoints: [1, 5, 9, 13, 17], values: [40, 45, 50, 55, 60] },
      gloomRefundChampionPercent: 25, gloomRefundNonChampionPercent: 10,
      // E로 처치 시 파멸 재사용 대기시간 환급(V14.5): 챔피언 25%, 그 외 10%.
      eKillRefundChampionPercent: 25, eKillRefundNonChampionPercent: 10,
      },

     Q: {
      name: '오싹한 미사일',
     cooldown: [8, 7, 6, 5, 4], mana: [45, 50, 55, 60, 65], // Data Dragon
     // PC 위키 Template:Data Vex/Mistral Bolt: 시전 0.15초, 속도 600 → 500 유닛 이동 후 3200으로 가속하며
     // 폭이 360 → 160으로 좁아진다(가장자리 기준 전체 폭). 관통.
     range: 1200,speed1: 600, speed2: 3200, castTimeSec: 0.15,
     accelerationDistance: 500, width: 360, widthAfterAccel: 160,
     // V26.13: 기본 피해 70/115/160/205/250(+주문력 70%) - PC 위키.
     damageByLevel: [70, 115, 160, 205, 250],
     apRatio: 0.7, piercesUnits: true,
      damageType: 'MAGICAL',
     //적중한 적에게 우울 소모
     //폭이 넓다가 일정시간 후 폭이 좁아짐
     },

     W: {
      name: '거리 두기', cooldown: [16, 15, 14, 13, 12] /* Data Dragon 16.20.1 */, mana: 75,
      range: 475, castTimeSec: 0.25, damageByLevel: [80, 120, 160, 200, 240], // PC 위키: 시전 0.25초(이동 가능), 반경 475
      // PC 위키: 보호막 50/75/100/125/150(+주문력 75%), 2.5초. 예전 50~170은 주문력 80% 시절 기본값.
      apRatio: 0.3, shieldByLevel: [50, 75, 100, 125, 150], shieldApRatio: 0.75, shieldDuration: 2.5,
      damageType: 'MAGICAL',
      //적에게 적중하면 우울을 소모
     },

     E: {
      name: '커지는 안개', cooldown: 12 /* Data Dragon 16.20.1 */, mana: [70, 80, 90, 100, 110], // Data Dragon
      // PC 위키: 시전 0.25초, 지정 지점까지 날아가 폭발 - 반경 200~300(시전 거리 비례). 피해 수치는 최신 PC 출처가
      // 엇갈려 기존 값 유지(미확인). 투사체 속도 1300은 PC 위키(Template:Data_Vex/Looming_Darkness)로 확인.
      // PC 위키 Template:Data_Vex/Looming_Darkness·패치 기록: 50/70/90/110/130(+주문력 40~60%). 예전 60~240(+40%)은 옛 값.
      range: 800, castTimeSec: 0.25, radiusMin: 200, radiusMax: 300, missileSpeed: 1300, damageByLevel: [50, 70, 90, 110, 130],
      apRatioByLevel: [0.4, 0.45, 0.5, 0.55, 0.6], slowPercentByLevel: [30, 35, 40, 45, 50],
      slowDuration: 2, damageType: 'MAGICAL',
      piercesUnits: true,
      //챔피언을 처치하면 파멸과 우울 재사용 대기시간의 25%를 돌려받음
      //적중한 적에게 우울 적용
     },

     R: {
      name: '끝없는 추적', cooldown: [140, 120, 100], mana: 100,
      // 28차: 방향 지정 스킬샷(예전 targetRequired:true는 원작과 달랐다). PC 위키 Template:Data Vex/Shadow Surge:
      // 사거리 2000/2500/3000, 폭 260, 속도 1600(투사체) • 2200(재시전 돌진).
      range: [2000, 2500, 3000], width: 260, missileSpeed: 1600, dashSpeed: 2200, damageByLevel: [75, 125, 175],
      apRatio: 0.2, recastRange: [2000, 2500, 3000],
      recastDamageByLevel: [150, 250, 350], recastApRatio: 0.5,
      recastEnabled: true, resetOnKill: true,
      damageType: 'MAGICAL',
      //첫 번째로 적중한 적 챔피언에게 4초 동안 표식을 남김
      //표식이 남은 챔피언이 이 스킬로 피해를 입은 뒤 8초 이내에 사망할 경우, 재사용 대기시간이 초기화됨

    },
   },
  // 이즈리얼: 이 환경에서는 외부 위키/공략 사이트 접근이 네트워크 정책으로
  // 차단돼 있어(wiki.leagueoflegends.com/fandom/mobafire/metabot 전부
  // EGRESS_BLOCKED), 다른 챔피언들처럼 실시간으로 위키 원문을 대조하지는
  // 못했다. 아래 수치는 이즈리얼 킷이 여러 시즌에 걸쳐 유지해 온 잘 알려진
  // 형태(스킬샷 Q/마킹형 W/블링크+유도탄 E/광역 관통 R, 패시브 공속 중첩)를
  // 기준으로 작성한 근사치이며, 최신 패치의 정확한 수치와는 다를 수 있다
  // (섹션 3/18 원칙 - 자료 없는 수치를 확정값처럼 서술하지 않는다는 취지로
  // 이 주석을 남긴다).
  // 이즈리얼: 사용자가 직접 제공한 실제 게임 데이터 파일(ezreal.bin/
  // ezreal.bin.json - CharacterRecord + SpellObject 덤프)로 아래 수치
  // 전부를 재검증했다(이전 버전은 위키 접근이 막혀 있어 킷의 잘 알려진
  // 형태만으로 작성한 근사치였다 - 이번에 실 데이터로 교체).
  // 인덱싱 규칙(수치 배열 해석): DataValues/cooldownTime류 7칸 배열은
  // index0이 사용되지 않는 자리(placeholder)이고 실제 랭크 1~5는
  // index1~5에 들어있다(R의 cooldownTime=[10,120,105,90,10,10,10]에서
  // 채우기 값 10이 앞뒤로 반복되고 실제 3랭크 값(120/105/90)이 index1~3에
  // 있는 것으로 확정 - R은 랭크가 3개뿐이라 index4~6은 그대로 채우기 값).
  // 반면 mana/manaValues류 6칸 배열은 index0부터 바로 랭크1이다(R의
  // mana=[100,100,100,0,0,0]에서 실제 3랭크 값이 index0~2에 있고 나머지가
  // 0으로 채워진 것으로 확정).
  ezreal: {
    displayName: '이즈리얼',
    stats: {
      // CharacterRecords/Root 그대로: baseHPModifiable/hpPerLevelModifiable/
      // baseDamageModifiable/damagePerLevelModifiable/baseArmorModifiable/
      // armorPerLevelModifiable/baseMR/mrPerLevel/baseMoveSpeedModifiable/
      // attackRangeModifiable/attackSpeedModifiable/attackSpeedPerLevelModifiable/
      // primaryAbilityResource(arType=0 마나, 기본 375).
      // hpRegen/hpRegenGrowth와 manaGrowth/manaRegen/manaRegenGrowth는
      // CharacterRecord에 이름 없는 해시 필드로만 들어있어(예:
      // baseStaticHPRegenModifiable=0.8) 이 프로젝트가 쓰는 "HP5" 단위와
      // 직접 대응이 불확실하다 - 다른 챔피언들과 동일한 관례(예: 다리우스
      // hpRegen=10)에 맞춰 커뮤니티에 잘 알려진 근사치를 그대로 둔다.
      hp: 600, hpGrowth: 102, hpRegen: 4, hpRegenGrowth: 0.65,
      ad: 60, adGrowth: 3.75, attackSpeed: 0.625, attackSpeedGrowthPercent: 2.5,
      armor: 24, armorGrowth: 4.2, mr: 33, mrGrowth: 1.1,
      range: 550, moveSpeed: 325, mana: 375, manaGrowth: 70, manaRegen: 8.5, manaRegenGrowth: 1,
      // PC 위키 기본 스탯: 평타 선딜 18.839%
      windupPercent: 0.18839,
    },
    passive: {
      name: '치솟는 마력',
      desc: '스킬로 적을 적중시키면 몇 초간 공격속도가 증가하며, 최대 5중첩까지 쌓인다(적중마다 지속시간 갱신).',
      // EzrealPassive.DataValues 그대로: AttackSpeedPerStack=0.10,
      // StackDuration=6, MaxStacks=5 (전부 랭크 무관 고정값).
      perStackPercent: 10, maxStacks: 5, duration: 6,
    },
    Q: {
      name: '신비의 사격',
      desc: '직선으로 기력탄을 발사해 처음 적중한 대상에게 물리 피해를 입힌다. 적중 시 신비의 사격 자신을 포함한 모든 기본 스킬의 재사용 대기시간이 감소한다(나무위키 이즈리얼 문서: "신비한 화살 자체도 효과를 받으니").',
      // EzrealQ 그대로: cooldownTime(7칸, index1~5)=[5.5,5.25,5.0,4.75,4.5],
      // manaValues(6칸, index0~4)=[28,31,34,37,40], castRange=1200(실제
      // 판정 사거리 - castRangeDisplayOverride 1150은 UI 표시 전용),
      // mLineWidth=60. BaseDamage(index1~5)=[20,45,70,95,120],
      // BaseDamageADRatio=1.30(총 공격력 기준 - mStatFormula 표기가 없어
      // 다른 스킬들과 달리 보너스 공격력이 아니라 "총" 공격력에 곱한다),
      // BaseDamageAPRatio=0.40, CDRefund(적중 시 다른 기본 스킬 쿨다운
      // 감소량)=1.5.
      cooldown: [5.5, 5.25, 5.0, 4.75, 4.5], mana: [28, 31, 34, 37, 40], range: 1200, width: 120, // PC 위키: 폭 120(예전 60), 속도 2000
      damageByLevel: [20, 45, 70, 95, 120], totalAdRatio: 1.3, apRatio: 0.4,
      cdrOnHitSeconds: 1.5, damageType: 'PHYSICAL',
    },
    W: {
      name: '정수의 흐름',
      desc: '직선으로 정수 구체를 발사한다. 챔피언·에픽 몬스터·포탑·억제기·넥서스에 처음 맞은 대상에게는 4초간 표식만 남기며(미니언/일반 몬스터는 그냥 통과), 즉시 피해는 없다. 표식이 남아있는 동안 이즈리얼의 기본 공격이나 다른 스킬이 그 대상을 적중시키면 표식이 터지며 마법 피해를 입힌다. 스킬로 터뜨리면 그 스킬의 마나 소모량 + 60을 돌려받는다.',
      // 정정(나무위키/커뮤니티드래곤 실제 정수의 흐름 명세로 재검증 - 비주얼
      // 업데이트(8.20 패치) 이후 현재까지 유지되는 핵심 메커니즘이다):
      // 이 스킬은 "적중 즉시 피해"가 아니라 "표식 → (기본공격/스킬로) 폭발"
      // 구조다. 예전 버전의 이 프로젝트는 정반대로 - 즉시 피해를 주고
      // "표식엔 폭발 메커니즘이 없다"고 명시적으로 되어 있었는데, 이는
      // bin 덤프의 ManaReturn=60 필드를 "구슬이 빗나갔을 때의 환불"로
      // 잘못 해석한 결과였다. 실제로는 "스킬로 표식을 터뜨렸을 때"의 마나
      // 환불량이 ManaReturn(=60, 그 스킬 자체 마나 소모량에 추가로 더함)이다.
      // cooldownTime 전 랭크 8 고정, manaValues 전 랭크 50 고정,
      // castRange=1200(표시 1150), mLineWidth=60.
      // BaseDamage(index1~5)=[80,135,190,245,300] (+1.0 추가 공격력)
      // (+0.90 주문력) - 이 피해는 폭발(detonate) 시에만 들어간다.
      // DetonationTimeout(표식 지속시간)=4.
      cooldown: 8, mana: 50, range: 1200, width: 60,
      damageByLevel: [80, 135, 190, 245, 300], bonusAdRatio: 1.0, apRatio: 0.9,
      markDuration: 4, manaRefundOnDetonate: 60,
      damageType: 'MAGICAL',
    },
    E: {
      name: '비전 이동',
      desc: '지정한 위치로 순간이동한 뒤, 가장 가까운 적에게 유도탄을 발사해 마법 피해를 입힌다(정기 방출로 표식이 남은 대상을 우선 조준).',
      // EzrealE(블링크 본체) 그대로: cooldownTime(index1~5)=
      // [26,23,20,17,14], manaValues 전 랭크 70 고정, castRangeDisplayOverride
      // =475(실제 블링크 거리 - 내부 castRange 25000은 Location 타겟 스킬
      // 특유의 엔진용 값이라 그대로 쓰면 안 됨). BaseDamage(index1~5)=
      // [80,130,180,230,280], 데미지 공식: 보너스AD*0.6 + EAPRatio(0.75)*AP.
      // 정정(나무위키 능력치 표 - "475/750, 각각 이동 거리와 유도 화살
      // 사거리"): 블링크 사거리(475)와 유도탄 탐색 사거리(750)가 서로
      // 다르다. 이전 버전은 EzrealEMissile의 castRangeDisplayOverride
      // 필드값(1175)을 그대로 boltRange로 썼었는데, Q/W처럼 "표시값 <
      // 실제값" 관례가 E 유도탄에도 그대로 적용된다는 확인 없이 가져온
      // 값이었다 - 나무위키가 명시하는 현재 유도 사거리 750으로 교체.
      cooldown: [26, 23, 20, 17, 14], mana: 70, range: 475,
      boltRange: 750, damageByLevel: [80, 130, 180, 230, 280], bonusAdRatio: 0.6, apRatio: 0.75,
      damageType: 'MAGICAL',
    },
    R: {
      name: '정조준 사격',
      desc: '집중 시전 후 맵을 가로지르는 광선을 발사해 그 경로에 있는 모든 적에게 물리 피해를 입힌다. 한 번에 여러 적을 맞힐수록 대상별 피해가 감소하며, 미니언/몬스터에게는 피해가 크게 감소한다.',
      // EzrealR 그대로: cooldownTime(index1~3)=[120,105,90](랭크 3개뿐),
      // manaValues(index0~2)=[100,100,100], castRange=25000(사실상 맵
      // 전역 - Location 타겟이라 실제로는 이 값 자체가 "제한 없음"에 가까운
      // 엔진용 상한치), mLineWidth=160, spellCastTime=1.0.
      // BaseDamage(index1~3)=[350,550,750], 데미지 공식: 보너스AD*1.0(=
      // StatByCoefficientCalculationPart 계수) + RAPRatio(1.10)*AP.
      // DamageReductionPerHit=0.10(적중당 10%p 감소), MinimumDamagePercent
      // =0.30(최소 30%까지만 감소). BaseDamageMinionMonster(index1~3)=
      // [150,225,300) - 챔피언 대상 BaseDamage 대비 약 40~43% 수준이라
      // minionDamageMultiplier로 그 비율(0.4)만 단순화해서 반영한다(실제
      // 공식은 미니언/몬스터 전용 추가 계수가 하나 더 있지만 이 데모
      // 범위에서는 근사치로 충분).
      // PC 위키: 폭 320, 미니언/일반 몬스터 50% 피해. 예전 "대상마다 10%씩 감소(최소 30%)·미니언 40%"는
      // PC 판에 없는 규칙이라 제거.
      cooldown: [120, 105, 90], mana: 100, range: 25000, width: 320, castTime: 1,
      damageByLevel: [350, 550, 750], bonusAdRatio: 1.0, apRatio: 1.1,
      // 정정: 나무위키 능력치 표/본문 모두 "마법 피해"로 명시한다
      // ("이즈리얼이 거대한 에너지파를 발사하여 마법 피해를 입힙니다").
      // 이전 값(PHYSICAL)은 잘못된 데이터였다.
      minionDamageMultiplier: 0.5, damageType: 'MAGICAL',
    },
  },
  // 아리: 사용자가 직접 제공한 실제 게임 데이터 파일(ahri.bin/ahri.bin.json -
  // CharacterRecord + SpellObject 덤프)로 검증한 수치. 아리의 각 스킬은
  // "플레이어에게 보이는 캐스트 오브젝트"(AhriQ/AhriW/AhriE/AhriR - 쿨다운/
  // 마나/사거리/애니메이션을 들고 있음)와 "실제 피해를 적용하는 하위
  // 미사일 오브젝트"(AhriQMissile/AhriQReturnMissile/AhriWDamageMissile/
  // AhriEMissile/AhriRMissile - mEffectAmount+mCoefficient로 실제 적용
  // 피해량을 들고 있음)가 분리되어 있다. 두 쪽 수치가 서로 다를 때는
  // CastOnHit/CastOnMovementComplete로 실제 피해를 적용하는 쪽(미사일)을
  // 우선한다(다른 챔피언들과 동일한 원칙 - bin 원본 수치를 그대로 반영).
  // bin의 7칸 배열(cooldownTime/BaseDamage 등)은 index 1~5가 실제 스킬
  // 레벨 1~5(이즈리얼과 동일한 관례), R 계열은 3칸(index 1~3)만 쓰인다.
  ahri: {
    displayName: '아리',
    // CharacterRecords/Root 그대로: baseHPModifiable=590/hpPerLevel=104,
    // baseStaticHPRegen=0.5(+0.12/lvl, 이 프로젝트의 HP5 관례에 맞춰 5배),
    // primaryAbilityResource(마나) 베이스=418(+25/lvl), 마나 재생 필드는
    // 이름 없는 해시({c4ab3550}=1.6,{3a509002}=0.16)였지만 실제 공개된
    // 아리 마나 재생(8, +0.8/lvl - 5배 환산과 정확히 일치)과 대조해
    // 확정했다. baseDamage=53(+3), armor=21(+4.2), MR=30(+1.3),
    // moveSpeed=330, attackRange=550, attackSpeed=0.668(+2.2%/lvl).
    stats: {
      hp: 590, hpGrowth: 104, hpRegen: 2.5, hpRegenGrowth: 0.6,
      ad: 53, adGrowth: 3, attackSpeed: 0.668, attackSpeedGrowthPercent: 2.2,
      armor: 21, armorGrowth: 4.2, mr: 30, mrGrowth: 1.3,
      range: 550, moveSpeed: 330, mana: 418, manaGrowth: 25, manaRegen: 8, manaRegenGrowth: 0.8,
      // PC 위키 기본 스탯: 평타 선딜 20%, 공속 계수 0.625
      windupPercent: 0.20, attackSpeedRatio: 0.625,
    },
    passive: {
      name: '정기 흡수',
      desc: '미니언/몬스터를 9마리 처치할 때마다 체력을 회복한다. 적 챔피언 처치에 관여하면 즉시 더 큰 체력을 회복한다.',
      // AhriPassive.DataValues 그대로: MaxStacks=9(랭크 무관 고정).
      // ChampionHeal/MinionHeal은 ByCharLevelInterpolation(시작값 -> 18레벨
      // 값) + AP 계수 형태라, 이 프로젝트의 growLinear(base, growth, level)
      // 관례에 맞춰 growth = (끝값-시작값)/17로 환산해 그대로 재사용한다
      // (요네 W 보호막 공식과 동일한 변환 방식 - champion_data.js 916행 참고).
      maxStacks: 9,
      minionHealBase: 35, minionHealGrowth: (95 - 35) / 17, minionHealApRatio: 0.2,
      championHealBase: 75, championHealGrowth: (165 - 75) / 17, championHealApRatio: 0.3,
    },
    Q: {
      name: '현혹의 구슬',
      desc: '구슬을 던졌다가 되돌려 받는다. 나갈 때 마법 피해, 돌아올 때 같은 양을 고정 피해로 입힌다.',
      // 2026-08-27 리그 오브 레전드 위키(wiki.leagueoflegends.com/en-us/Ahri, V26.06 기준)
      // 실 데이터로 재검증 - 기존 구현(사용자 제공 bin 원본 해석)은 나갈 때/돌아올 때
      // 피해량과 AP 계수가 서로 다른 비대칭 구조였으나(out 50~170/AP40%,
      // return 55~135/AP60%), 실제 최신 클라이언트 툴팁은 완전히 동일하다:
      // "Damage Per Pass: 35/60/85/110/135 (+50% AP)"로 나가는 패스와 돌아오는
      // 패스가 같은 값이며, "Total Mixed Damage: 70/120/170/220/270 (+100% AP)"는
      // 이 값의 정확히 2배 - 즉 돌아올 때는 나갈 때와 같은 수치를 피해 속성만
      // 마법->고정(진정한 피해)으로 바꿔 그대로 다시 적용하는 구조다.
      // 사거리(RANGE)는 900, 폭(WIDTH)은 200(가장자리 기준)으로 갱신 -
      // 기존 970/100은 예전 패치 값으로 확인됨.
      cooldown: [7, 7, 7, 7, 7], mana: [55, 65, 75, 85, 95], range: 900, width: 200,
      damageByLevel: [35, 60, 85, 110, 135], apRatio: 0.5,
      outDamageType: 'MAGICAL', returnDamageType: 'TRUE',
      // 구슬 이동은 위키에 "SPEED: 1550 • 60 - 2600"로 명시 - 나갈 때는 고정
      // 1550, 돌아올 때는 60에서 시작해 최대 2600까지 가속된다.
      outSpeed: 1550,
      returnSpeed: 60, returnMaxSpeed: 2600, returnAccel: 1900,
    },
    W: {
      name: '여우불',
      desc: '짧은 이동 속도 증가 효과를 얻고, 여우불 3개를 소환한다. 여우불은 주변 적을 자동으로 공격한다.',
      // AhriW(캐스트) 그대로: cooldownTime(index1~5)=[9,8,7,6,5], manaValues
      // 전 랭크 30 고정. DataValues: MovementSpeed=0.40(+2초), BaseDamage
      // (index1~5)=[40,60,80,100,120], APRatio=0.40, RepeatDamageMod=0.40
      // (같은 여우불의 2번째 이후 공격은 40%만), MinionBonusDamageMultiplier=2
      // /MinionBonusDamageThreshold=0.20(체력 20% 이하 미니언에게는 2배
      // 피해 - 라스트히트 보정), AcquisitionRange=550(+BonusAcquisitionRange
      // 725, 한 번 물었던 대상은 더 멀리 가도 유지), InitialDelay=0.25/
      // SecondaryDelay=0.4(첫 공격까지/이후 공격 간격), FlameDuration=2.5,
      // OrbitRadius=150(아리 주변을 도는 반지름).
      cooldown: [9, 8, 7, 6, 5], mana: 30, range: 600,
      acquisitionRange: 550, bonusAcquisitionRange: 725,
      moveSpeedPercent: 40, moveSpeedDuration: 2,
      damageByLevel: [40, 60, 80, 100, 120], apRatio: 0.4, repeatDamageMod: 0.4,
      minionBonusMultiplier: 2, minionBonusThresholdPercent: 20,
      initialDelay: 0.25, secondaryDelay: 0.4, flameDuration: 2.5, orbitRadius: 150,
      damageType: 'MAGICAL',
    },
    E: {
      name: '매혹',
      desc: '입맞춤을 날려 적중한 적에게 마법 피해를 입히고 매혹시킨다. 매혹된 적은 이동기가 즉시 중단되며, 지속시간 동안 아리 쪽으로 이동한다.',
      // 2026-08-27 리그 오브 레전드 위키(V26.06 기준)로 재검증 - 기존 구현은
      // 여러 패치 이전의 낡은 수치였다(피해량 80~300/AP90%, 지속시간
      // 1.05~1.65는 현재 값보다 한 단계 낮은 예전 값). 실제 최신 값:
      // COST 60/COOLDOWN 12(고정)/RANGE 1000(중심 기준)/WIDTH 120(가장자리 기준)/
      // SPEED 1550. Magic Damage 80~240(+85% AP, V25.08에서 60%->75%->85%로
      // 인상 확정), Disable Duration 1.2~1.8초(V25.12에서 1.2~2초였던 것이
      // 낮은 레벨 위주로 축소된 값). 나무위키 확인: 매혹 적중 시 3초간
      // 아리의 스킬 피해(현혹의 구슬 귀환 고정 피해 포함) 20% 증가 디버프도
      // 함께 걸린다(스킬 데미지만 증가, 룬/아이템/소환사 주문 제외).
      cooldown: [12, 12, 12, 12, 12], mana: 60, range: 1000, width: 120, speed: 1550,
      damageByLevel: [80, 120, 160, 200, 240], apRatio: 0.85, damageType: 'MAGICAL',
      charmDurationByLevel: [1.2, 1.35, 1.5, 1.65, 1.8],
      // 매혹 대상이 아리 스킬 피해 20%를 더 받던 효과는 리워크로 삭제됨(PC 위키 패치 기록) - 0으로 끔.
      charmSkillDamageAmpPercent: 0, charmSkillDamageAmpDuration: 0,
    },
    R: {
      name: '혼령 질주',
      desc: '지정한 방향으로 돌진하며 주변 적에게 정기 탄환을 발사한다. 기본 3회까지 사용할 수 있으며, 적 챔피언 처치에 관여하면 재사용 횟수를 회복한다.',
      // AhriR(캐스트) 그대로: cooldownTime(index1~3)=[140,120,100], manaValues
      // 전 랭크 100 고정. DataValues: RBaseDamage(index1~3)=[75,125,175],
      // RAPCoefficient=0.35(AP 비율), RMaxTargetsPerCast=3, RMaxCasts=3,
      // RDashDistance=500, RBaseDashSpeed=1200, RRecastWindow=15(초),
      // RAcquisitionRange=600(탄환이 적을 찾는 반경), RResetCasts=1(챔피언
      // 처치 관여 시 돌진 재사용 횟수 +1).
      cooldown: [140, 120, 100], mana: 100,
      damageByLevel: [75, 125, 175], apRatio: 0.35,
      recastLockoutSec: 1, // 28차: PC 위키 - 재시전 사이 1초 고정 대기(스킬 가속 영향 없음)
      dashDistance: 500, dashSpeed: 1200, maxCasts: 3, maxTargetsPerCast: 3,
      recastWindow: 15, acquisitionRange: 600, resetCastsOnTakedown: 1,
      recastWindowExtendOnTakedown: 10,
      damageType: 'MAGICAL',
    },
  },
  // 바루스(Varus): 사용자가 제공한 실제 게임 데이터 파일(varus.bin/
  // varus.bin.json - CharacterRecord + SpellObject 덤프)로 작성한 수치.
  // 이 세션은 네트워크 정책상 wiki.leagueoflegends.com/leagueoflegends.
  // fandom.com/metabot.gg 전부 EGRESS_BLOCKED라(이즈리얼 최초 버전과
  // 동일한 제약) 실시간 위키 원문 전체 대조는 하지 못했고, 대신 웹 검색
  // 스니펫으로 W(오한의 화살통)의 세 수치 - 스택당 최대 체력 비례 피해
  // (3/3.5/4/4.5/5%), 소모 시 잃은 체력 비례 추가 피해(6/8/10/12/14%),
  // 스택당 재사용 대기시간 감소(13%, 최대 39%) - 는 정확히 교차 확인했다.
  // 이 세 값이 검색 결과와 정확히 일치한다는 것은 곧 "7칸 배열은 index0이
  // 사용되지 않는 자리이고 실제 랭크 1~5는 index1~5"라는 이 프로젝트의
  // 기존 인덱싱 관례(이즈리얼/아리 데이터 상단 주석 참고)가 이 bin
  // 파일에도 동일하게 적용된다는 뜻이라, 교차 확인이 안 된 나머지 수치
  // (Q/E/R 피해량·쿨다운 등)도 전부 같은 관례로 해석해 반영했다 - 단,
  // Q의 tADRatioMax처럼 배열 첫 값이 0/음수 sentinel이 아니라 자연스럽게
  // 이어지는 등차수열인 필드는 index0을 그대로 랭크1로 썼다(예: cooldown
  // [17,16,15,14,13,12,11] -> 랭크1~5=17~13). 기본 스탯(HP/마나/방어력/
  // 마저/공격속도 등)은 CharacterRecords/Root의 이름 있는 필드를 그대로
  // 가져왔고(HP5/MP5는 다른 챔피언과 동일한 관례로 원본 초당 재생 필드
  // x5 - baseStaticHPRegen 0.7x5=3.5, arBaseStaticRegen 1.6x5=8 등), 이
  // 값들은 공개적으로 잘 알려진 바루스 기본 스탯과 정확히 일치한다.
  varus: {
    displayName: '바루스',
    stats: {
      hp: 600, hpGrowth: 105, hpRegen: 3.5, hpRegenGrowth: 0.55,
      ad: 59, adGrowth: 3.4, attackSpeed: 0.658, attackSpeedGrowthPercent: 3.5,
      armor: 24, armorGrowth: 4, mr: 33, mrGrowth: 1.1,
      range: 575, moveSpeed: 330, mana: 320, manaGrowth: 40, manaRegen: 8, manaRegenGrowth: 0.8,
      // PC 위키 기본 스탯: 평타 선딜 17.544%
      windupPercent: 0.17544,
    },
    passive: {
      name: '살아있는 복수',
      desc: '유닛을 처치하면 공격 속도가 증가하고(레벨 비례 10/15/20%), 적 챔피언 처치에 관여하면 대신 30%를 얻는다(지속 5/7/9/11초, 레벨 비례). 얻은 추가 공격 속도의 일부만큼 공격력도 증가한다.',
      // PC 위키(V26.02/V26.12 반영): 유닛 처치 시 공속 10/15/20%(레벨 비례), 챔피언 처치 관여 시 30%,
      // 지속 5/7/9/11초(1/6/11/16레벨 - 예전 bin 주석의 ByCharLevelBreakpoints와 일치). 추가 공속의
      // 11%(처치)/33%(관여)만큼 공격력도 얻는다.
      // 버그 수정: 예전 구현은 같은 bin 값(챔피언 50%/그 외 10%, 전환 25/10)을 "같은 대상을 계속 공격하면
      // 공속이 점점 오른다"로 잘못 해석해, 처치와 무관하게 평타만으로 공속이 최대 50%까지 올랐다.
      // 처치 공속의 레벨 구간(1/7/13)은 위키에 없어 추정(killAsBreakpointsGuessed).
      killAsByLevel: { breakpoints: [1, 7, 13], values: [10, 15, 20] }, killAsBreakpointsGuessed: true,
      takedownAsPercent: 30,
      durationByLevel: { breakpoints: [1, 6, 11, 16], values: [5, 7, 9, 11] },
      killAdPerBonusAsPercent: 0.11, takedownAdPerBonusAsPercent: 0.33,
    },
    Q: {
      name: '꿰뚫는 화살',
      desc: '충전할수록 사거리(1.5초)와 피해량(1.25초)이 늘어나는 관통 화살을 발사한다. 충전 중에는 20% 느려진 채 움직일 수 있고, 4초 안에 다시 누르지 않으면 취소되며 마나 절반을 돌려받는다. 오한(블라이트) 표식이 있는 대상을 맞히면 표식을 함께 터뜨리며, 이때는 잃은 체력 비례 추가 마법 피해와 재사용 대기시간 감소가 충전량에 비례해 더 크게 붙는다.',
      cooldown: [16, 15, 14, 13, 12], mana: [50, 55, 60, 65, 70],
      minRange: 925, maxRange: 1600, chargeDuration: 1.25, minChargeDamageRatio: 0.667,
      // PC 위키: 충전 중 20% 둔화, 최대 4초 유지(넘기면 취소되고 마나 50% 환급), 사거리는 처음 1.5초·효과는 처음 1.25초 동안 증가.
      rangeChargeDuration: 1.5, maxHoldSec: 4, holdTimeoutManaRefundPercent: 50, chargeSelfSlowPercent: 20,
      // V26.05: 최대 기본 피해 80/150/220/290/360, 현재 최대 계수 추가 AD 120%(PC 위키). 예전 값은 총 AD 130~170%.
      damageMaxByLevel: [80, 150, 220, 290, 360], bonusAdRatioMax: 1.2,
      missileSpeed: 1500, width: 75, damageType: 'PHYSICAL',
    },
    W: {
      name: '오한의 화살통',
      desc: '기본 공격이 추가 마법 피해를 입히고 오한(블라이트)을 남긴다(최대 3중첩, 중첩당 6초). 사용하면 사거리 내 오한이 남은 대상 하나를 골라 오한을 모두 터뜨려 중첩당 대상 최대 체력 비례 마법 피해를 입히고, 자신의 기본 스킬 재사용 대기시간을 중첩당 13%(최대 39%) 감소시킨다. Q로 터뜨리면 잃은 체력 비례 추가 피해와 더 큰 재사용 대기시간 감소가 함께 붙는다.',
      cooldown: 40, range: 750, maxStacks: 3, stackDuration: 6,
      // V26.12: 4/13/22/31/40, V26.03: 주문력 25%(예전엔 추가 AD 35%로 잘못 들어가 있었다).
      onHitDamageByLevel: [4, 13, 22, 31, 40], onHitApRatio: 0.25,
      detonatePercentMaxHpByLevel: [3, 3.5, 4, 4.5, 5],
      qConsumeMissingHpPercentByLevel: [6, 8, 10, 12, 14], qConsumeMaxChargeMultiplier: 1.5,
      cdrPerStackPercent: 13, cdrMaxBonusPercentFromCharge: 50,
      damageType: 'MAGICAL',
    },
    E: {
      name: '화살비',
      desc: '지정한 지역에 화살비를 퍼부어 범위 내 적에게 물리 피해를 입힌다. 떨어진 자리는 잠시 저주받은 땅이 되어 적의 이동 속도를 늦추고 자가 회복/재생을 약화시킨다.',
      cooldown: [18, 16, 14, 12, 10], mana: 90, range: 925, radius: 300,
      damageByLevel: [60, 90, 120, 150, 180], bonusAdRatio: 0.9,
      slowPercentByLevel: [30, 35, 40, 45, 50], zoneDuration: 4,
      grievousPercent: 40, grievousDuration: 0.5,
      missileSpeed: 1750, damageType: 'PHYSICAL',
    },
    R: {
      name: '속박의 사슬',
      desc: '직선으로 부패의 사슬을 날려 처음 맞힌 적 챔피언에게 마법 피해를 입히고 속박한다. 이후 사슬이 근처의 감염되지 않은 적 챔피언에게도 퍼져나가 닿는 대로 함께 피해를 입히고 속박한다.',
      // 28차(요청 "범위가 이상할 정도로 넓음"): PC 위키(wiki.leagueoflegends.com Varus, Chain of Corruption) 폭 240·
      // 속도 1500·사거리 1370·확산(테더) 반경 650으로 바꿨다. 예전 폭 450·사거리 1300·속도 1200·확산 600은 bin 해석값이었는데
      // 폭이 거의 두 배였다.
      cooldown: [100, 80, 60], mana: 100, range: 1370, width: 240,
      damageByLevel: [150, 250, 350], apRatio: 1.0, rootDuration: 2,
      missileSpeed: 1500, spreadRange: 650, spreadTickInterval: 0.5, spreadTimeWindow: 1.75,
      damageType: 'MAGICAL',
    },
  },
  // 애쉬(Ashe): 사용자가 제공한 실제 애쉬.glb(87노드/24클립, 사용자 업로드본)로
  // 모션을 구현했다. 이 세션도 조직 네트워크 정책상 wiki.leagueoflegends.com/
  // leagueoflegends.fandom.com/mobafire.com/공식 KR 챔피언 페이지 전부
  // EGRESS_BLOCKED라 실시간 툴팁 원문 전체 대조는 하지 못했다 - 대신
  // WebSearch 스니펫으로 얻을 수 있었던 조각 정보를 교차 확인해 최대한
  // 반영했고, 그마저도 확인이 안 된 수치는 이 프로젝트의 "수치 임의
  // 발명 금지" 원칙에 따라 명시적으로 근사값임을 밝혀둔다(정확한 최신
  // 패치 수치는 실제 위키 접근이 가능해지면 다시 검증이 필요하다 - README
  // 참고).
  // - 기본 스탯: 오랫동안 거의 변하지 않은 것으로 널리 알려진 애쉬의 표준
  //   스탯(사거리 600 - 원거리 챔피언 중 최장급, 공격속도 성장치가 유독
  //   낮은 것이 특징)을 사용했다. HP5/마나5는 다른 챔피언과 동일한 관례로
  //   "5초당" 수치를 그대로 저장한다.
  // - 패시브(서리 화살): WebSearch 스니펫(Fandom 미러)에서 "5-35%(레벨
  //   비례) 둔화 + 궁사의 집중 활성 중 +20%, 치명타는 추가 피해 대신
  //   40-60%(레벨 비례)의 강화 둔화(1초에 걸쳐 일반 세기로 감쇠)"를
  //   확인했다. 감쇠(decay) 부분은 이 프로젝트의 SLOW 상태이상 시스템이
  //   지속시간 동안 감쇠하는 기능이 아직 없어 고정 세기로 근사한다.
  // - Q(궁사의 집중): WebSearch에서 확인한 현재(리워크 이후) 버전 수치 -
  //   평타 4중첩(공격마다 갱신), 최대 중첩에서 사용하면 6초간 공격속도
  //   20/30/40/50/60%를 얻고, 그 동안의 "첫" 평타가 6발의 화살로 갈라져
  //   나가며 총 132/138/144/150/156%의 물리 피해를 맞은 대상들이 나눠
  //   받는다(대상이 하나뿐이면 그 하나가 전부 받음).
  // - W(일제 사격)/E(매 날리기): 쿨다운/피해량(W)은 WebSearch 스니펫으로
  //   확인했으나 사거리/폭(W)과 사거리/재사용형태(E)는 스니펫마다 다른
  //   패치의 수치가 섞여 나와 신뢰도 높은 확정을 하지 못했다 - 오랫동안
  //   널리 알려진 근사값(사거리 등)을 사용하고 아래 각 필드 주석에 근사
  //   여부를 명시했다. E는 순수 정찰(시야) 스킬인데, 이 프로젝트에 새로
  //   추가한 시야 시스템(src/core/vision_system.js)을 통해 실제로 해당
  //   지점에 실제로 시야를 밝힌다(비행 경로 자체의 실시간 시야까지는
  //   구현하지 않음 - 도착 지점 기준 원형 시야로 근사).
  // - R(마법의 수정화살): 전 맵 사거리(Global) 스킬샷이라는 점, 기절
  //   지속시간이 비행 거리에 비례한다는 점, 주 대상 외 주변 적도 같은
  //   피해를 받지만 기절은 걸리지 않는다는 점을 WebSearch로 확인했다.
  //   "Global" 사거리는 이 프로젝트에서 이미 이즈리얼 R(정조준 사격,
  //   ezreal.js의 _ezrealCastR/range||20000)이 쓰는 관례(20000)를 그대로
  //   재사용한다 - 새로운 "글로벌 사거리" 개념을 따로 만들지 않는다.
  ashe: {
    displayName: '애쉬',
    stats: {
      hp: 610, hpGrowth: 101, hpRegen: 3.5, hpRegenGrowth: 0.55,
      ad: 59, adGrowth: 3.3, attackSpeed: 0.658, attackSpeedGrowthPercent: 3,
      armor: 26, armorGrowth: 4.6, mr: 33, mrGrowth: 1.1,
      range: 600, moveSpeed: 325, mana: 280, manaGrowth: 35, manaRegen: 7, manaRegenGrowth: 0.65,
      // PC 위키 기본 스탯: 평타 선딜 21.93%
      windupPercent: 0.2193,
    },
    passive: {
      name: '서리 화살',
      desc: '애쉬의 기본 공격은 대상을 둔화시킨다. 치명타는 추가 피해 대신 훨씬 강한 둔화를 적용한다(1초에 걸쳐 원래 세기로 감쇠).',
      // PC 위키 Frost Shot: 2초간 20~30%(레벨 비례) 둔화, 치명타는 둔화 2배(40~60%)로 시작해 첫 1초에 걸쳐
      // 원래 세기로 감소. 치명타는 추가 피해가 없고, 대신 평타가 치명타 확률 비례 추가 피해(0~100%, 무한의
      // 대검 +0~30%)를 준다. 레벨 사이 곡선은 공개돼 있지 않아 선형 보간(slowCurveGuessed).
      // 예전 5/15/25/35%·1초·Q 활성 중 +20%(현재 판에서 삭제됨)는 옛 값.
      slowPercentAtLevel1: 20, slowPercentAtLevel18: 30, slowCurveGuessed: true,
      slowDurationSec: 2.0, critSlowMultiplier: 2, critDecaySec: 1.0,
      critChanceBonusDamageRatio: 1.0, critChanceBonusDamageRatioIE: 0.3,
      // 매 기본 공격마다 짧은(1초) 시야를 대상 방향으로 부여 - 공식 설명
      // "기본 공격이 짧은 시야를 부여한다"를 새 시야 시스템(vision_system.js)에
      // 연결한 것. 공식 수치(반경) 미확인이라 근사값.
      attackVisionRadius: 500, attackVisionDurationSec: 1.0,
    },
    Q: {
      name: '궁사의 집중',
      desc: '기본 공격마다 집중 중첩을 얻는다(최대 4중첩, 공격할 때마다 지속시간 갱신). 최대 중첩에서 사용하면 중첩을 모두 소모해 6초간 공격 속도를 얻고, 그 동안의 첫 기본 공격이 강력한 다발 공격(화살 6발)으로 바뀌어 총 피해를 맞은 대상들에게 나누어 입힌다.',
      maxStacks: 4, stackWindowSec: 4.0, buffDurationSec: 6.0,
      // PC 위키: 6초간 공속 20/25/30/35/40%, 그동안 모든 평타가 대상에게 화살 5발(발당 AD 22~26%,
      // 총 110~130%)의 다발 공격으로 바뀐다. 시전 후 첫 다발은 1발 더(6발, 총 132~156%). 화살마다 서리 화살,
      // 적중 시 효과는 다발당 1회. 마나 30(Data Dragon).
      // 버그 수정: 예전 구현은 "시전 후 첫 평타 1번만, 주변 여러 대상에 나눠서"였다.
      attackSpeedPercentByLevel: [20, 25, 30, 35, 40],
      flurryArrowCount: 5, firstFlurryBonusArrows: 1,
      flurryArrowAdPercentByLevel: [22, 23, 24, 25, 26],
      flurryMissileSpeed: 3200,
      cooldown: 0, mana: 30,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '일제 사격',
      desc: '전방에 부채꼴로 여러 발의 화살을 발사한다. 화살들은 서로 다른 대상을 노리지만, 한 대상은 한 번만 피해를 입는다.',
      // PC 위키 Template:Data Ashe/Volley: 60/95/130/165/200(+추가 AD 100%), 화살 7~11발, 부채꼴 27.75/37/37/
      // 46.25/46.25°, 사거리 1200. 마나 75~55(Data Dragon).
      cooldown: [18, 14.5, 11, 7.5, 4] /* Data Dragon 16.20.1 */, mana: [75, 70, 65, 60, 55],
      range: 1200, coneAngleDegByLevel: [27.75, 37, 37, 46.25, 46.25], arrowsByLevel: [7, 8, 9, 10, 11],
      damageByLevel: [60, 95, 130, 165, 200], bonusAdRatio: 1.0,
      castTimeSec: 0.25,
      damageType: 'PHYSICAL',
    },
    E: {
      name: '매 날리기',
      desc: '매의 영혼을 지정한 위치로 보내 경로와 도착 지점의 시야를 밝힌다. 피해를 주지 않는 순수 정찰 스킬이다.',
      // PC 위키/Data Dragon: 충전 2회, 재충전 90/80/70/60/50초, 사용 간격 5초, 마나 없음
      // (예전엔 충전 시스템이 없다며 20~12초 단일 쿨다운·마나 40으로 근사했었다).
      cooldown: 5, mana: 0, maxCharges: 2, rechargeTime: [90, 80, 70, 60, 50],
      // PC 위키 Template:Data_Ashe/Hawkshot: 속도 1400, 시야 반경 1000. 경로 시야는 100 유닛마다 0.5초씩 갱신,
      // 도착 지점 5초. (예전 1700/900, 경로 시야 미구현)
      range: 4000, missileSpeed: 1400,
      visionRadius: 1000, visionDurationSec: 5.0, pathVisionStepLol: 100, pathVisionSec: 0.5,
      castTimeSec: 0.25,
    },
    R: {
      name: '마법의 수정화살',
      desc: '전 맵 사거리로 거대한 얼음 화살을 발사한다. 처음 맞힌 적 챔피언에게 마법 피해를 입히고 기절시키며(비행 거리가 길수록 기절 시간 증가), 주변의 다른 적에게도 같은 피해를 입히지만 기절은 걸지 않는다.',
      cooldown: [100, 80, 60] /* Data Dragon 16.20.1 */, mana: 100, // Data Dragon: 100(예전 150~200)
      range: 20000, // "글로벌" 사거리 - ezreal.js의 R(정조준 사격)과 동일한 관례(20000) 재사용
      missileSpeed: 1500, missileMaxSpeed: 2100, width: 260, // PC 위키: 폭 260
      missileSpeedBySecond: [1500, 1700, 1900, 2100], // PC 위키: 비행 시간(초)에 따라 1500/1700/1900/2100
      damageByLevel: [200, 400, 600], apRatio: 1.2,
      splashDamagePercent: 100, splashRadius: 400, // 주변 적도 같은 피해 + 서리 화살(PC 위키). 반경 400은 6차에 PC 위키로 확인
      // 기절 1~3.5초(비행 거리 비례). 최대가 되는 거리는 위키·패치 기록에 숫자가 없어 1500으로 추정(예전 20000은 사실상
      // 항상 최소 1초라 거리 비례가 작동하지 않았다). ashe.bin.json을 받으면 확정값으로 바꾼다.
      minStunSec: 1.0, maxStunSec: 3.5, maxStunLolDistance: 1500, maxStunDistanceGuessed: true,
      castTimeSec: 0.25, // PC 위키 Template:Data Ashe/Enchanted Crystal Arrow(예전 0.5)
      visionRadius: 900, visionDurationSec: 3.0, // 비행 경로/명중 지점에도 짧은 시야(공식 설명: "1초간 경로의 시야를 밝힌다" - 근사)
      damageType: 'MAGICAL',
    },
  },
 };

// 스킬레벨(Q/W/E/R 1~5, R 1~3) 배열에서 값을 꺼낸다. 스칼라면 그대로 반환.
function skillVal(v, skillLevel) {
  if (v == null) return null;
  if (Array.isArray(v)) return v[Math.max(0, Math.min(v.length - 1, skillLevel - 1))];
  return v;
}
// 챔피언 레벨 구간(예: 세트 패시브 "1/6/11/16레벨에 적용")별 값을 꺼낸다.
// level 이하인 가장 마지막 breakpoint의 값을 사용한다.
function valueByBreakpoints({ breakpoints, values }, level) {
  let v = values[0];
  for (let i = 0; i < breakpoints.length; i++) if (level >= breakpoints[i]) v = values[i];
  return v;
}
// 챔피언ID+레벨로 최종 스탯을 계산해 CharacterController.stats/maxHp/maxMp에 반영한다.
function computeChampionStats(championId, level) {
  const cd = CHAMPION_DATA[championId];
  if (!cd) return null;
  const s = cd.stats;
  return {
    maxHp: growStat(s.hp, s.hpGrowth, level),
    hpRegen: growStat(s.hpRegen, s.hpRegenGrowth, level),
    maxMp: growStat(s.mana, s.manaGrowth, level),
    mpRegen: growStat(s.manaRegen || 0, s.manaRegenGrowth || 0, level),
    attackDamage: growStat(s.ad, s.adGrowth, level),
    // 공격 속도: 1레벨 기본값은 그대로 두고, 레벨 성장분은 "추가 공격 속도"로 따로 둔다
    // (원작 공식: 최종 = 기본 × (1 + 레벨 성장% + 아이템/버프 추가%)). 버그 수정: 예전엔
    // 성장분을 기본값에 곱해 넣어 아이템 공속과 곱연산이 됐다(원작은 합산).
    baseAttackSpeed: s.attackSpeed,
    levelBonusAttackSpeed: ((s.attackSpeedGrowthPercent || 0) / 100) * statGrowthFactor(level),
    armor: growStat(s.armor, s.armorGrowth, level),
    magicResist: growStat(s.mr, s.mrGrowth, level),
    // 버그 수정: s.range/s.moveSpeed는 LoL 원본 수치(예: 175, 340)다. 여기서
    // 딱 한 번 WORLD_DISTANCE_SCALE로 변환해서, 이 값을 그대로 받는
    // this.stats.attackRange/baseMoveSpeed는 항상 월드 단위로 일관되게
    // 유지된다(isInAttackRange/getFinalMoveSpeed 등 소비하는 쪽은 그대로
    // 둬도 자동으로 올바르게 동작).
    attackRange: lolRangeToWorld(s.range),
    baseMoveSpeed: lolRangeToWorld(s.moveSpeed),
    // 평타 선딜%/보정치/공속 계수(PC 위키 기본 스탯 상자). 값이 없는 챔피언은 엔진 기본값 유지.
    windupPercent: s.windupPercent,
    windupModifier: s.windupModifier,
    attackSpeedRatio: s.attackSpeedRatio,
  };
}


