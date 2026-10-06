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

const CHAMPION_DATA = {
  yasuo: {
    displayName: '야스오',
    stats: {
      hp: 590, hpGrowth: 110, hpRegen: 6.5, hpRegenGrowth: 0.9,
      ad: 60, adGrowth: 3, attackSpeed: 0.697, attackSpeedGrowthPercent: 3.5,
      armor: 32, armorGrowth: 4.6, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 345, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
    },
    passive: {
      name: '낭인의 길',
      flowMax: 100, shieldBase: 125, shieldPerLevel: 27.941,
      critChanceBonus: 1.0, critDamage: 1.80, critDamageWithIE: 2.073,
      overcapCritToAd: 0.5, flowDistance: 59.5,
    },
    Q: {
      name: '강철 폭풍', cooldown: [4, 3.33, 2.66, 2.0, 1.33], range: 450,
      damageByLevel: [20,45,70,95,120], totalAdRatio: 1.05,
      critTotalAdRatio: 1.65375, critTotalAdRatioIE: 2.03175,
      stackDuration: 6, knockupDuration: 1, tornadoRange: 1150, circleRadius: 375,
      castTime: [0.4,0.333,0.266,0.2,0.13], attackSpeedCap: 1.43,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '바람 장막', cooldown: [25,23,21,19,17], range: 400,
      width: [320,390,460,530,600], duration: 4, damageType: 'NONE',
    },
    E: {
      name: '질풍검', cooldown: [0.5,0.4,0.3,0.2,0.1], range: 475,
      damageMin: [70,85,100,115,130], damageMax: [140,170,200,230,260],
      bonusAdRatioMin: 0.2, bonusAdRatioMax: 0.4, apRatioMin: 0.6, apRatioMax: 1.2,
      targetCooldown: [10,9,8,7,6], stackDuration: 5, stackBonusPercent: 25, maxStacks: 4,
      damageType: 'MAGICAL',
    },
    R: {
      name: '최후의 숨결', cooldown: [70,50,30], range: 1400,
      damageByLevel: [200,350,500], bonusAdRatio: 1.5, knockupDuration: 1,
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
      critChanceMultiplier: 2.0, overcapCritToAd: 0.5,
      critDamage: 1.90, critDamageWithIE: 2.17,
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
      range: 600, angleDeg: 80,
      // 수치 출처 갱신(요네.bin YoneW 실데이터로 재확인):
      // MaxHealthDamage(레벨1~5) = 7/8/9/10/11% (이전에 위키 문서 프로즈를
      // 옮기며 8/9/10/11/12%로 한 칸씩 밀려 잘못 반영했던 것을 수정).
      totalMixedDamageByLevel: [10,20,30,40,50], maxHpRatioByLevel: [7,8,9,10,11],
      // WShield 공식(bin GameCalculation): ByCharLevelInterpolation(40 -> 90,
      // 챔피언 레벨 1~18) + 보너스AD*0.65. 이전에 위키 문서의 "95.88"은
      // 오독이었다(bin 원본은 90.0으로 명시) - bin 수치로 교체.
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
      armor: 35, armorGrowth: 5.2, mr: 32, mrGrowth: 2.05,
      range: 125, moveSpeed: 345, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
    },
    passive: { name: '분노의 지배', rageMax: 100, empoweredThreshold: 50, lowHpThreshold: 0.5, lowHpMultiplier: 1.5, combatExitSec: 12, rageDecayInterval: 5, rageDecayAmount: 20 },
    Q: {
      name: '양떼 도륙', cooldown: 7, mana: 0, range: 325, damageByLevel: [60,90,120,150,180], bonusAdRatio: 1.0,
      healNonChampion: [2,3,4,5,6], healNonChampionAdRatio: 0.02,
      healChampion: [12,20,28,36,44], healChampionAdRatio: 0.17, healChampionCap: [50,75,100,125,150],
      empoweredDamageByLevel: [90,135,180,225,275], empoweredBonusAdRatio: 1.4,
      empoweredHealNonChampion: [6,9,12,15,18], empoweredHealNonChampionAdRatio: 0.06,
      empoweredHealChampion: [36,60,84,108,132], empoweredHealChampionAdRatio: 0.51,
      empoweredHealChampionCap: [200,300,400,500,600], nonChampionRage: 2.5, championRage: 10, maxRageGenerated: 30,
      damageType: 'PHYSICAL'
    },
    W: {
      name: '무자비한 포식자', cooldown: [16,14,12,10,8], mana: 0, range: 175,
      damageByLevel: [10,40,70,100,130], totalAdRatio: 1.5, hits: 2, stunDuration: 0.75,
      empoweredDamageByLevel: [15,60,105,150,195], empoweredTotalAdRatio: 2.25, empoweredHits: 3, empoweredStunDuration: 1.5,
      bonusChampionRage: 10, damageType: 'PHYSICAL'
    },
    E: {
      name: '자르고 토막내기', cooldown: [16,14.5,13,11.5,10], mana: 0, range: 550,
      damageByLevel: [40,70,100,130,160], bonusAdRatio: 0.9,
      empoweredDamageByLevel: [70,115,160,205,250], empoweredBonusAdRatio: 1.35,
      armorShredByLevel: [25,27.5,30,32.5,35], armorShredDuration: 4,
      firstRageNonChampion: 2, firstRageChampion: 10, damageType: 'PHYSICAL'
    },
    R: {
      name: '강신', cooldown: [120,100,80], mana: 0, range: 350, castTime: 0.125, duration: 15,
      bonusMaxHp: [300,500,700], immediateRage: 20, ragePerSecond: 5,
      damagePerSecond: [60,150,240], bonusAdRatio: 0.1, apRatio: 0.1, damageType: 'MAGICAL'
    },
  },
  garen: {
    displayName: '가렌',
    stats: {
      hp: 690, hpGrowth: 98, hpRegen: 8, hpRegenGrowth: 0.5,
      ad: 69, adGrowth: 4.5, attackSpeed: 0.625, attackSpeedGrowthPercent: 3.65,
      armor: 38, armorGrowth: 4.2, mr: 32, mrGrowth: 1.55,
      range: 175, moveSpeed: 340, mana: 0, manaGrowth: 0, manaRegen: 0, manaRegenGrowth: 0,
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
      damageByLevel: [30, 60, 90, 120, 150], adRatio: 1.5, silenceDuration: 1.5, enhancedWindow: 4.5,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '용기', cooldown: [22, 19.5, 17, 14.5, 12], mana: 0,
      damageReductionPercentByLevel: [25, 29, 33, 37, 41], reductionDuration: 4,
      shieldBaseByLevel: [65, 85, 105, 125, 145], shieldBonusHpPercent: 18, shieldDuration: 0.75,
      onTakedownArmor: 0.2, onTakedownMr: 0.2, onTakedownCap: 30,
    },
    E: {
      name: '심판', cooldown: [9, 8.25, 7.5, 6.75, 6], mana: 0, range: 325, spinDuration: 3, baseHits: 7,
      perHitDamageByLevel: [4, 7, 10, 13, 16], adRatioByLevel: [0.4, 0.43, 0.46, 0.49, 0.52],
      nearestBonusPercent: 25, critMultiplier: 1.3,
      armorShredPercent: 25, armorShredDuration: 6, armorShredHitsNeeded: 6,
      damageType: 'PHYSICAL',
    },
    R: {
      name: '데마시아의 정의', cooldown: [120, 100, 80], mana: 0, range: 400, castTime: 0.435,
      baseDamageByLevel: [125, 200, 275], missingHpPercentByLevel: [25, 30, 35],
      damageType: 'TRUE',
    },
  },
  darius: {
    displayName: '다리우스',
    stats: {
      hp: 652, hpGrowth: 114, hpRegen: 10, hpRegenGrowth: 0.95,
      ad: 64, adGrowth: 5, attackSpeed: 0.625, attackSpeedGrowthPercent: 1,
      armor: 37, armorGrowth: 5.2, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 340, mana: 263, manaGrowth: 57.5, manaRegen: 6.6, manaRegenGrowth: 0.35,
    },
    passive: {
      name: '과다출혈',
      desc: '기본 공격/공격 스킬이 대상에게 5초에 걸친 물리 피해 출혈을 남긴다(최대 5중첩). 몬스터에는 250% 피해.',
      maxStacks: 5, dotDuration: 5, dotTickInterval: 1,
      // 1중첩 총 피해 13~30(레벨당 +1) + 0.3 추가AD, 최대(5)중첩 총 피해 65~150(레벨당 +5) + 1.5 추가AD
      oneStackBase: 13, oneStackGrowth: 1, oneStackBonusAdRatio: 0.3,
      maxStackBase: 65, maxStackGrowth: 5, maxStackBonusAdRatio: 1.5,
      empoweredDuration: 5, monsterMultiplier: 2.5,
      // 공격력증가량(최대 중첩 시 5초 AD버프): 30~280, 10렙까지 +5, 13렙까지 +10, 이후 +25
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
      name: '마비의 일격', cooldown: 5, mana: 40, rangeBonus: 25,
      bonusAdRatioByLevel: [0.4, 0.45, 0.5, 0.55, 0.6], slowPercent: 40, slowDuration: 1,
      killManaRefundPercent: 90, killCdrPercent: 50, damageType: 'PHYSICAL',
    },
    E: {
      name: '포획', cooldown: [26, 23.5, 21, 18.5, 16], manaByLevel: [70, 60, 50, 40, 30],
      range: 535, castTime: 0.25, slowPercent: 40, slowDuration: 1,
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
    },
    passive: {
      name: '투기장의 투지',
      desc: '왼손-오른손 번갈아 기본 공격(오른손이 추가 물리피해 + 8배 공격속도로 즉시 이어짐). 왼손 이후 2초 안에 오른손이 안 나가면 다시 왼손부터.',
      rightPunchDamageBase: 5, rightPunchDamageGrowth: 5, rightPunchBonusAdRatio: 0.55,
      rightHandAttackSpeedMultiplier: 8, leftHandTimeoutSec: 2,
      // 초당 추가 체력 재생 수치(레벨 구간별): 1/6/11/16레벨에 적용.
      regenByLevelBreakpoints: { breakpoints: [1, 6, 11, 16], values: [0.15, 0.5, 1, 2] },
    },
    Q: {
      name: '주먹다짐', cooldown: [9, 8, 7, 6, 5], mana: 0,
      moveSpeedBonusPercent: 30, moveSpeedDuration: 1.5, leftHandRangeBonus: 50,
      perHitFlatByLevel: [10, 20, 30, 40, 50], perHitMaxHpPercentByLevel: [1, 1.5, 2, 2.5, 3], perHitAdRatioByLevel: [0.01, 0.015, 0.02, 0.025, 0.03],
      damageType: 'PHYSICAL',
    },
    W: {
      name: '강펀치', cooldown: [18, 16.5, 15, 13.5, 12], mana: 0,
      gritMaxHpPercent: 50, gritDecayDelay: 4, gritDecayPercentPerSec: 30, shieldDuration: 3,
      damageBaseByLevel: [80, 100, 120, 140, 160], gritSpendPercent: 25, bonusAdRatio: 0.25,
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
      armorPenFromCritPercent: 33, lifestealFromCritPercent: 15,
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
      mana: 30, range: 550, maxCharges: 2,
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
      tickDamageByLevel: [60,100,140], tickBonusAdRatio: 0.4,
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
      shieldBaseByLevel: [65,115,165], shieldBonusAdRatio: 1.0,
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
    },
    passive: {
      name: '암흑 탄생',
      desc: '기본 공격에 주문력 40% 추가 마법 피해. 기본 스킬/공격 3회 적중 시 4초간 오라 피해+이동속도(적중마다 갱신).',
      apRatio: 0.4, hitsForAura: 3, auraDuration: 4,
      auraDamagePerSec: 5, auraApRatio: 0.3, auraTargetMaxHpPercent: 1, // 최소치(1~5%는 레벨 비례, 여기선 최소치만 사용 - 정밀 곡선 미공개)
      auraMoveSpeedPercent: 3, auraRange: 375,
    },
    Q: {
      name: '말살', cooldown: [8, 7, 6, 5, 4], mana: 0, range: 575,
      damageByLevel: [80, 115, 150, 185, 220], bonusAdRatio: 1.2, apRatio: 0.7,
      // 챔피언 레벨(스킬 레벨과 별개) 보너스 고정 피해: 10레벨부터 매
      // 레벨 +5, 18레벨에 45로 최대(요청 그대로 "0~45(10레벨부터 5씩 증가)").
      // 단일 대상 적중 시 보너스%까지 함께 곱해진다(사용자가 준 "최대
      // 마법피해" 수치의 +67.5 = 45×1.5와 정확히 일치 - Node로 검증 완료).
      levelBonusDamage: { startLevel: 10, perLevel: 5, maxLevel: 18 },
      singleTargetBonusPercentByLevel: [30, 35, 40, 45, 50], damageType: 'MAGICAL',
    },
    W: {
      name: '불멸', cooldown: [12, 11, 10, 9, 8], mana: 0,
      dealtDamageBankPercent: 45, takenDamageBankPercent: 7.5, nonChampionBankPercent: 25, // 챔피언 아닌 유닛 피해는 75% 감소 흡수 = 25%만 반영
      minShieldMaxHpPercent: 5, maxShieldMaxHpPercent: 30, shieldDecayDuration: 6,
      recastHealPercentByLevel: [35, 37.5, 40, 42.5, 45],
    },
    E: {
      name: '죽음의 손아귀', cooldown: [16, 14, 12, 10, 8], mana: 0, range: 900,
      magicPenPercentByLevel: [5, 7.5, 10, 12.5, 15],
      damageByLevel: [60, 80, 100, 120, 140], apRatio: 0.45, pullDelay: 0.5, damageType: 'MAGICAL',
    },
    R: {
      name: '죽음의 세계', cooldown: [140, 120, 100], mana: 0, range: 650, castTime: 0.5,
      duration: 7, statStealPercent: 10, // 훔치는 주요 능력치 비율 - 이 데모에선 방어력/마저만 실제 전투에 영향을 주므로 그 둘만 반영
    },
  },
  nautilus: {
    displayName: '노틸러스',
    stats: {
      hp: 646, hpGrowth: 100, hpRegen: 8.5, hpRegenGrowth: 0.55,
      ad: 61, adGrowth: 3.3, attackSpeed: 0.613, attackSpeedGrowthPercent: 1,
      armor: 39, armorGrowth: 4.65, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 325, mana: 400, manaGrowth: 47, manaRegen: 8.63, manaRegenGrowth: 0.5,
    },
    passive: { name: '강력한 일격', desc: '첫 공격이 추가 물리 피해 + 속박(동일 대상 6초 1회).' },
  },
  masteryi: {
    displayName: '마스터 이',
    stats: {
      hp: 640, hpGrowth: 105, hpRegen: 7.5, hpRegenGrowth: 0.65,
      ad: 65, adGrowth: 2.5, attackSpeed: 0.679, attackSpeedGrowthPercent: 2.5,
      armor: 33, armorGrowth: 4.5, mr: 32, mrGrowth: 2.05,
      range: 175, moveSpeed: 355, mana: 251, manaGrowth: 42, manaRegen: 7.26, manaRegenGrowth: 0.45,
    },
    passive: {
      name: '2연속 공격',
      desc: '매 4번째 기본 공격마다 2연속 공격(2번째 타격은 0.5 공격력의 추가 물리피해, 치명타 적용 가능).',
      everyNAttacks: 4, secondHitAdRatio: 0.5,
    },
    Q: {
      name: '일격필살', cooldown: [20, 19.5, 19, 18.5, 18], manaByLevel: [50, 55, 60, 65, 70], range: 600,
      baseDamageByLevel: [20, 40, 60, 80, 100], bonusAdRatio: 0.7,
      critDamageByLevel: [40, 80, 120, 160, 200], critBonusAdRatio: 1.4,
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
      hp: 640, hpGrowth: 110, hpRegen: 9, hpRegenGrowth: 0.85,
      ad: 69, adGrowth: 4.2, attackSpeed: 0.625, attackSpeedGrowthPercent: 1.44,
      armor: 38, armorGrowth: 5, mr: 32, mrGrowth: 2.05,
      range: 125, moveSpeed: 345, mana: 270, manaGrowth: 60, manaRegen: 7.2, manaRegenGrowth: 0.45,
    },
    passive: {
      name: '육식', desc: '유닛 처치 시 체력/마나 회복(레벨 비례).',
      healBase: 16, healPerLevel: 2, manaBase: 4.44, manaPerLevel: 0.28,
    },
    Q: {
      name: '파열', cooldown: 7, mana: 60, range: 950, castTime: 0.25, impactDelay: 0.625,
      damageByLevel: [80, 140, 200, 260, 320], apRatio: 1.0,
      knockupDuration: 1, slowPercent: 60, slowDuration: 1.5, damageType: 'MAGICAL',
    },
    W: {
      name: '흉포한 울부짖음', cooldown: [13, 12, 11, 10, 9], manaByLevel: [70, 80, 90, 100, 110],
      range: 650, coneAngleDeg: 60,
      damageByLevel: [80, 135, 190, 245, 300], apRatio: 0.7,
      silenceDurationByLevel: [1.6, 1.7, 1.8, 1.9, 2.0], damageType: 'MAGICAL',
    },
    E: {
      name: '날카로운 가시', cooldown: [8, 7, 6, 5, 4], mana: 30, charges: 3, rangeMax: 500,
      perHitDamageByLevel: [20, 40, 60, 80, 100], apRatio: 0.3,
      perHitMaxHpPercentByLevel: [2.5, 2.85, 3.2, 3.55, 3.9], perStackMaxHpPercent: 0.5,
      slowPercentByLevel: [30, 35, 40, 45, 50], slowDuration: 1.5, damageType: 'MAGICAL',
    },
    R: {
      name: '포식', cooldown: [80, 70, 60], mana: 100, rangeBase: 175, rangePerStack: 2.5, // 버그 수정: 175가 맞음(Leaguepedia 패치 기록 "RANGE: 150 ⇒ 175" 확인) - 200은 잘못된 값이었음
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
      // 확장, 새 자원 시스템을 따로 만들지 않음). manaRegen은 "기력회복:50"을
      // 초당 회복량으로 그대로 사용한다.
      mana: 200, manaGrowth: 0, manaRegen: 50, manaRegenGrowth: 0,
    },
    passive: {
      name: '질풍격',
      desc: '스킬 사용 시 다음 2회 평타 공격속도 +40%. 1타에 기력, 2타에 절반 기력 회복(레벨 구간별).',
      attackSpeedBonusPercent: 40,
      energyByLevelBreakpoints1: { breakpoints: [1, 7, 13], values: [20, 30, 40] },
      energyByLevelBreakpoints2: { breakpoints: [1, 7, 13], values: [10, 15, 20] },
    },
    Q: {
      name: '음파/공명의 일격', cooldown: [10, 9, 8, 7, 6], energy1: 50, energy2: 25,
      range1: 1200, range2: 1250, markDuration: 3,
      damageByLevel: [60, 90, 120, 150, 180], bonusAdRatio: 0.9,
      maxDamageByLevel: [120, 180, 240, 300, 360], maxBonusAdRatio: 1.8,
      damageType: 'PHYSICAL',
    },
    W: {
      name: '방호/강철의 의지', cooldown: 7, energy1: 50, energy2: 25,
      range1: 700, markDuration: 3,
      shieldByLevel: [60, 105, 150, 195, 240], shieldApRatio: 0.8, shieldDuration: 2,
      lifestealPercentByLevel: [10, 14, 18, 22, 26], lifestealDuration: 4,
    },
    E: {
      name: '폭풍/무력화', cooldown: 8, energy1: 50, energy2: 25,
      range: 450, markDuration: 3,
      damageByLevel: [35, 60, 85, 110, 135], adRatio: 0.9,
      slowPercentByLevel: [35, 45, 55, 65, 75], slowDuration: 4, damageType: 'MAGICAL',
    },
    R: {
      name: '용의 분노', cooldown: [110, 85, 60], mana: 0, range: 375,
      damageByLevel: [175, 400, 625], bonusAdRatio: 2.0,
      knockbackDistance: 1200, airborneDuration: 1,
      collisionBonusHpRatioByLevel: [12, 15, 18], damageType: 'PHYSICAL',
    },
  },
  vex: {
  displayName: '벡스',

     stats: {
     hp: 630, hpGrowth: 104, hpRegen: 6.5, hpRegenGrowth: 0.55,
     ad: 54, adGrowth: 2.75, attackSpeed: 0.669, attackSpeedGrowthPercent: 1.36,
     armor: 23, armorGrowth: 4, mr: 30, mrGrowth: 1.3,
     range: 550, moveSpeed: 335,
     mana: 490, manaGrowth: 32, manaRegen: 8, manaRegenGrowth: 0.8,
     },

     passive: {
      name: '파멸과 우울',
      desc: '주기적으로 다음 기본 스킬이 적을 공포에 빠뜨린다,주변 적이 돌진하거나 순간적으로 이동할 때마다 벡스가 적에게 6초 동안 우울 표식을 남깁니다. 벡스의 다음 기본 공격은 우울 상태의 적에게 마법 피해를 추가로 입히며, 이 스킬의 재사용 대기시간이 25% 감소합니다.',
      fearCooldown: [25, 22, 19, 16],
      //챔피언 이외의 대상에게 감소된 피해를 입히고 이 스킬의 재사용 대기시간을 10% 돌려받음
      //E 스킬로 공포에 빠진 적은 벡스에게서 멀어질수록 더 느려짐
      },

     Q: {
      name: '오싹한 미사일',
     cooldown: [8, 7, 6, 5, 4], mana: 45,
     range: 1200,speed1: 600, speed2: 3200,
     accelerationDistance: 500, width: 180,
     damageByLevel: [75, 115, 155, 195, 235],
     apRatio: 0.6, piercesUnits: true,
      damageType: 'MAGICAL',
     //적중한 적에게 우울 소모
     //폭이 넓다가 일정시간 후 폭이 좁아짐
     }, 

     W: { 
      name: '거리 두기', cooldown: 13, mana: 75,
      range: 475, damageByLevel: [80, 120, 160, 200, 240],
      apRatio: 0.3, shieldByLevel: [50, 80, 110, 140, 170], shieldApRatio: 0.75, shieldDuration: 2,
      shieldApRatio: 0.75, damageType: 'MAGICAL',
      //적에게 적중하면 우울을 소모
     },

     E: {
      name: '커지는 안개', cooldown: [13, 12, 11, 10, 9], mana: 70,
      range: 800, damageByLevel: [60, 105, 150, 195, 240],
      apRatio: 0.4, slowPercentByLevel: [30, 35, 40, 45, 50],
      slowDuration: 2, damageType: 'MAGICAL',
      piercesUnits: true, 
      //챔피언을 처치하면 파멸과 우울 재사용 대기시간의 25%를 돌려받음
      //적중한 적에게 우울 적용
     },

     R: {
      name: '끝없는 추적', cooldown: [140, 120, 100], mana: 100, targetRequired: true,
      range: [2000, 2500, 3000], damageByLevel: [75, 125, 175],
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
      hp: 600, hpGrowth: 102, hpRegen: 4.7, hpRegenGrowth: 0.55,
      ad: 60, adGrowth: 3.75, attackSpeed: 0.625, attackSpeedGrowthPercent: 2.5,
      armor: 24, armorGrowth: 4.2, mr: 33, mrGrowth: 1.1,
      range: 550, moveSpeed: 325, mana: 375, manaGrowth: 45, manaRegen: 8.5, manaRegenGrowth: 0.65,
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
      cooldown: [5.5, 5.25, 5.0, 4.75, 4.5], mana: [28, 31, 34, 37, 40], range: 1200, width: 60,
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
      cooldown: [120, 105, 90], mana: 100, range: 25000, width: 160, castTime: 1,
      damageByLevel: [350, 550, 750], bonusAdRatio: 1.0, apRatio: 1.1,
      falloffPerUnitPercent: 10, minDamagePercent: 30,
      // 정정: 나무위키 능력치 표/본문 모두 "마법 피해"로 명시한다
      // ("이즈리얼이 거대한 에너지파를 발사하여 마법 피해를 입힙니다").
      // 이전 값(PHYSICAL)은 잘못된 데이터였다.
      minionDamageMultiplier: 0.4, damageType: 'MAGICAL',
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
      desc: '입맞춤을 날려 적중한 적에게 마법 피해를 입히고 매혹시킨다. 매혹된 적은 이동기가 즉시 중단되며, 지속시간 동안 아리 쪽으로 이동한다. 매혹된 적은 3초간 아리의 스킬 피해를 20% 더 받는다.',
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
      charmSkillDamageAmpPercent: 20, charmSkillDamageAmpDuration: 3,
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
      armor: 24, armorGrowth: 4.6, mr: 30, mrGrowth: 1.3,
      range: 575, moveSpeed: 330, mana: 320, manaGrowth: 40, manaRegen: 8, manaRegenGrowth: 0.8,
    },
    passive: {
      name: '살아있는 복수',
      desc: '적 챔피언을 공격하면 그 대상에게 갈수록 커지는 공격 속도를 얻는다(챔피언 대상 최대 50%, 그 외 대상 최대 10% - 챔피언 레벨에 따라 5~15초에 걸쳐 최대치 도달). 이렇게 얻은 보너스 공격 속도의 일부는 공격력으로도 함께 전환된다.',
      championAsCap: 0.5, nonChampionAsCap: 0.1,
      // ASDuration(최대치까지 걸리는 시간) - bin ByCharLevelBreakpoints:
      // 1레벨 5초, 6/11/16/21/26레벨마다 +2초.
      rampDurationBreakpoints: { breakpoints: [1, 6, 11, 16, 21, 26], values: [5, 7, 9, 11, 13, 15] },
      adPerASPointChampion: 25, adPerASPointNonChampion: 10,
      // AP 전환(AStoAPChampion/Minion)도 bin에 동일하게 존재하지만, 이
      // 데모에는 주문력 아이템 시스템이 없어(항상 abilityPower=0, 다른
      // 챔피언들과 동일한 원칙 - apRatio류 필드를 기록만 하고 실제 로직은
      // 추가하지 않음) 수치만 기록해두고 별도 로직은 만들지 않는다.
      apPerASPointChampion: 25, apPerASPointNonChampion: 10,
      newAsCap: 3.33,
    },
    Q: {
      name: '꿰뚫는 화살',
      desc: '충전할수록 사거리와 피해량이 늘어나는 관통 화살을 발사한다(최대 1.25초 충전). 다시 누르면 그 시점의 충전량으로 즉시 발사한다. 오한(블라이트) 표식이 있는 대상을 맞히면 표식을 함께 터뜨리며, 이때는 잃은 체력 비례 추가 마법 피해와 재사용 대기시간 감소가 충전량에 비례해 더 크게 붙는다.',
      cooldown: [16, 15, 14, 13, 12], mana: [50, 55, 60, 65, 70],
      minRange: 925, maxRange: 1600, chargeDuration: 1.25, minChargeDamageRatio: 0.667,
      damageMaxByLevel: [80, 160, 240, 320, 400], totalAdRatioMax: [1.3, 1.4, 1.5, 1.6, 1.7],
      missileSpeed: 1500, width: 75, damageType: 'PHYSICAL',
    },
    W: {
      name: '오한의 화살통',
      desc: '기본 공격이 추가 마법 피해를 입히고 오한(블라이트)을 남긴다(최대 3중첩, 중첩당 6초). 사용하면 사거리 내 오한이 남은 대상 하나를 골라 오한을 모두 터뜨려 중첩당 대상 최대 체력 비례 마법 피해를 입히고, 자신의 기본 스킬 재사용 대기시간을 중첩당 13%(최대 39%) 감소시킨다. Q로 터뜨리면 잃은 체력 비례 추가 피해와 더 큰 재사용 대기시간 감소가 함께 붙는다.',
      cooldown: 40, range: 750, maxStacks: 3, stackDuration: 6,
      onHitDamageByLevel: [8, 17, 26, 35, 44], onHitBonusAdRatio: 0.35,
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
      cooldown: [100, 80, 60], mana: 100, range: 1300, width: 450,
      damageByLevel: [150, 250, 350], apRatio: 1.0, rootDuration: 2,
      missileSpeed: 1200, spreadRange: 600, spreadTickInterval: 0.5, spreadTimeWindow: 1.75,
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
    maxHp: growLinear(s.hp, s.hpGrowth, level),
    hpRegen: growLinear(s.hpRegen, s.hpRegenGrowth, level),
    maxMp: growLinear(s.mana, s.manaGrowth, level),
    mpRegen: growLinear(s.manaRegen || 0, s.manaRegenGrowth || 0, level),
    attackDamage: growLinear(s.ad, s.adGrowth, level),
    baseAttackSpeed: growPercent(s.attackSpeed, s.attackSpeedGrowthPercent, level),
    armor: growLinear(s.armor, s.armorGrowth, level),
    magicResist: growLinear(s.mr, s.mrGrowth, level),
    // 버그 수정: s.range/s.moveSpeed는 LoL 원본 수치(예: 175, 340)다. 여기서
    // 딱 한 번 WORLD_DISTANCE_SCALE로 변환해서, 이 값을 그대로 받는
    // this.stats.attackRange/baseMoveSpeed는 항상 월드 단위로 일관되게
    // 유지된다(isInAttackRange/getFinalMoveSpeed 등 소비하는 쪽은 그대로
    // 둬도 자동으로 올바르게 동작).
    attackRange: lolRangeToWorld(s.range),
    baseMoveSpeed: lolRangeToWorld(s.moveSpeed),
  };
}


