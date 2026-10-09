// 아이템 시스템 - 1차분(도란 시리즈 5종). 사용자가 보내준 한국어 아이템
// 텍스트 원문(도란의 검/반지/방패/활/투구)의 수치를 그대로 옮긴다.
// stats는 recomputeItemStats()(item_system.js)가 그대로 합산해 itemBonus*
// 필드에 반영하고, 그 외 패시브(흡혈/도움의 손길/재생)는 item_system.js의
// 전용 틱/훅 함수들이 아이템별 설정 객체를 읽어 처리한다.
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
};
const ITEM_ORDER = ['doransBlade', 'doransRing', 'doransShield', 'doransBow', 'doransHelm'];
