// Node vm harness for the "전설급 아이템" batch (삼위일체~지배자의 피갑옷),
// sourced directly from the user's original uploaded item text (lines 625-758).
// Tests every unique mechanic precisely against the source wording.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 1000000;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const appliedStatuses = [];
const dealtDamages = [];
const dealtToTurret = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  getTurretGameTimeSec: () => 0,
  getGrievousPercent: () => 0,
  getHealReceivedMultiplier: (t) => 1 + ((t && t.itemHealingReceivedBonusPercent) || 0),
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: (target, effect) => {
    appliedStatuses.push({ target, effect });
    target.statusEffects = target.statusEffects || [];
    const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
    const rec = { ...effect, expiresAt: now + effect.duration * 1000 };
    if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
    return rec;
  },
  findEnemiesInRadius: () => [],
  applyDamage: (target, result) => {
    dealtDamages.push({ target, result });
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  applyDamageToTurret: (turret, result) => { dealtToTurret.push({ turret, result }); turret.hp -= result.rawDamage; return result.rawDamage; },
  // 테스트 대상(makeTarget)은 전부 armor:0/magicResist:0이므로 단순화된
  // calculateDamage 스텁으로도 "방어력 0이면 피해 그대로 들어간다"는
  // 실제 공식과 동일한 결과를 낸다(치명타 배율만 반영).
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  // 경탄(마나무네/무라마나) 계산이 참조하는 "챔피언 기본 최대 마나" -
  // makeFakeCtrl()의 recomputeStats() 스텁이 쓰는 기본값(500)과 맞춘다.
  // attackDamage:100 - 버그 수정(QA, "기본공격력" 재점검) 이후 스펠블레이드/
  // 선장 등이 진짜로 computeChampionStats()의 기본 공격력을 읽으므로,
  // makeFakeCtrl()의 기본 공격력(100, 아래 recomputeStats 참고)과 맞춘다.
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 100 }),
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.hasComponents = hasComponents;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnAbilityDispatch = itemOnAbilityDispatch;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnDamageDealtToTurret = itemOnDamageDealtToTurret;
this.itemOnTakeDamage = itemOnTakeDamage;
this.applyItemVamp = applyItemVamp;
this.getArmorShredPercent = (target) => {
  if (!target || !target.statusEffects) return 0;
  const nowMs = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'ARMOR_SHRED' && e.expiresAt > nowMs) v = Math.max(v, e.value);
  return v;
};
this.getFlatMoveSpeedBuff = (target) => {
  if (!target || !target.statusEffects) return 0;
  const nowMs = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'MS_BUFF_FLAT' && e.expiresAt > nowMs) v = Math.max(v, e.value);
  return v;
};
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, hasComponents, itemSystemTick,
  itemOnAbilityDispatch, itemOnBasicAttackHit, itemOnDamageDealt, itemOnDamageDealtToTurret, itemOnTakeDamage,
  applyItemVamp, getArmorShredPercent, getFlatMoveSpeedBuff,
} = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1000000, boots: null, team: 'BLUE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null, bonusAD: 0, bonusMaxHp: 0,
    _itemSheenArmed: false, _itemSheenReadyAt: 0, _itemActiveCooldownUntil: {},
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [], statusEffects: [],
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500,
    championId: 'testchamp',
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340, baseMoveSpeed: 340, percentMoveSpeedBonus: 0, flatMoveSpeedBonus: 0 },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [] }, overrides);
}

// ========================================================================
// 삼위일체 (Trinity Force): spellblade(200% AD) + 가속(on-hit MS+20/2s)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'sheen');
  buyItem(ctrl, 'devourerAxe');
  buyItem(ctrl, 'phageAxe');
  buildOrBuyItem(ctrl, 'trinityForce');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'trinityForce', '삼위일체: 조합 시 하위템 3종이 소모되고 완제품 하나만 남는다');
  assert(ctrl.stats.attackDamage === 136 && ctrl.maxHp === 2333, '삼위일체: 공격력 +36/체력 +333 정확히 적용');
  itemOnAbilityDispatch(ctrl);
  assert(ctrl._itemSheenArmed === true, '삼위일체: 스킬 시전 시 스펠블레이드 무장');
  dealtDamages.length = 0;
  const t1 = makeTarget();
  itemOnBasicAttackHit(ctrl, t1, false);
  // 버그 수정(QA, "기본공격력" 재점검): 원문("기본 공격력 200%")은 아이템으로
  // 늘어난 "총" 공격력이 아니라 챔피언 고유의 "기본" 공격력(여기서는 스텁
  // 기준 100)만 가리킨다 - ctrl.stats.attackDamage(136, 아이템 보너스 포함)가
  // 아니라 기본값 100을 기준으로 200%(=200)가 들어가야 정확하다.
  assert(dealtDamages.length >= 1 && Math.abs(dealtDamages[0].result.rawDamage - 100 * 2.0) < 1e-6, '삼위일체: 스펠블레이드가 "기본" 공격력 200%(광휘의 검의 2배) 추가 물리 피해(총 공격력이 아님)');
  assert(Math.abs(getFlatMoveSpeedBuff(ctrl) - 20) < 1e-9, '삼위일체: 기본 공격 시 가속(이동속도 +20 고정) 적용');
}

// 탐식의 망치 standalone - "분노"(동일한 on-hit MS 패시브)도 독립적으로 작동
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'devourerAxe');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget(), false);
  assert(Math.abs(getFlatMoveSpeedBuff(ctrl) - 20) < 1e-9, '탐식의 망치(단독 보유): "분노" 패시브로 이동속도 +20 적용');
}

// ========================================================================
// 몰락한 왕의 검: 안개의 검(현재 체력%) + 할퀴는 그림자(3타 둔화, 15초 icd)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'vampiricScepter'); buyItem(ctrl, 'recurveBow'); buyItem(ctrl, 'pickaxe');
  buildOrBuyItem(ctrl, 'bladeOfTheRuinedKing');
  assert(ctrl.stats.attackDamage === 140 && Math.abs(ctrl.itemBonusAttackSpeedPercent - 0.25) < 1e-9, '몰락한 왕의 검: 공격력 +40/공격속도 +25% 적용');
  assert(Math.abs(ctrl.itemPhysicalVampPercent - 0.10) < 1e-9, '몰락한 왕의 검: 생명력 흡수 10% 적용');

  const champTarget = makeTarget({ hp: 1000, maxHp: 1000 });
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, champTarget, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 1000 * 0.09) < 1e-6, '안개의 검(근접): 적 현재 체력의 9% 추가 물리 피해 (챔피언은 캡 없음)');

  const minionTarget = makeTarget({ isChampion: false, isMinion: true, hp: 5000, maxHp: 5000 });
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, minionTarget, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 100) < 1e-6, '안개의 검: 미니언/정글 몬스터 대상은 최대 100으로 캡(체력 5000의 9%=450이어도 100으로 제한)');

  // 할퀴는 그림자: 3타째에 슬로우, 15초 icd
  appliedStatuses.length = 0;
  const slowTarget = makeTarget();
  itemOnBasicAttackHit(ctrl, slowTarget, false);
  itemOnBasicAttackHit(ctrl, slowTarget, false);
  assert(!appliedStatuses.some((a) => a.effect.id === 'itemBotrkSlow'), '할퀴는 그림자: 1~2타에는 둔화가 걸리지 않는다');
  itemOnBasicAttackHit(ctrl, slowTarget, false);
  assert(appliedStatuses.some((a) => a.effect.id === 'itemBotrkSlow' && Math.abs(a.effect.value - 0.30) < 1e-9), '할퀴는 그림자: 3타째에 30% 둔화(1초) 적용');
  appliedStatuses.length = 0;
  itemOnBasicAttackHit(ctrl, slowTarget, false); itemOnBasicAttackHit(ctrl, slowTarget, false); itemOnBasicAttackHit(ctrl, slowTarget, false);
  assert(!appliedStatuses.some((a) => a.effect.id === 'itemBotrkSlow'), '할퀴는 그림자: 발동 직후 15초 재사용대기시간 중에는 3타가 다시 쌓여도 재발동하지 않는다');
  now += 15100;
  appliedStatuses.length = 0;
  itemOnBasicAttackHit(ctrl, slowTarget, false); itemOnBasicAttackHit(ctrl, slowTarget, false); itemOnBasicAttackHit(ctrl, slowTarget, false);
  assert(appliedStatuses.some((a) => a.effect.id === 'itemBotrkSlow'), '할퀴는 그림자: 15초 재사용대기시간이 지나면 다시 3타로 발동 가능');
}

// 곡궁 standalone("독침") / 마법사의 최후("쪼기")
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'recurveBow');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget(), false);
  assert(dealtDamages.length === 1 && dealtDamages[0].result.rawDamage === 15 && dealtDamages[0].result.damageType === 'PHYSICAL', '곡궁(독침): 기본 공격 시 15 고정 물리 피해');
}
{
  const ctrl = makeFakeCtrl();
  // 버그 수정(9차분) - 원문은 "음전자 망토"(negatronMantle)를 하위템으로
  // 명시한다. 이번에 그 아이템이 추가되면서 witsEnd의 recipe도 바로잡혔다.
  buyItem(ctrl, 'recurveBow'); buyItem(ctrl, 'negatronMantle'); buyItem(ctrl, 'recurveBow');
  buildOrBuyItem(ctrl, 'witsEnd');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'witsEnd', '마법사의 최후: 곡궁 2개 + 음전자 망토 조합 완료');
  assert(Math.abs(ctrl.itemBonusAttackSpeedPercent - 0.50) < 1e-9 && ctrl.stats.magicResist === 75 && Math.abs(ctrl.itemTenacityPercent - 0.20) < 1e-9, '마법사의 최후: 공속+50%/마저+45/강인함20% (공격력·주문력 없음 - 원문 그대로)');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget(), false);
  assert(dealtDamages.length === 1 && dealtDamages[0].result.rawDamage === 45 && dealtDamages[0].result.damageType === 'MAGICAL', '쪼기: 기본 공격 시 45 고정 마법 피해');
}

// ========================================================================
// 월식: 2초 내 별개의 공격/스킬 2회(6초 icd) -> 최대체력% 피해 + 보호막
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'caulfieldsWarhammer'); buyItem(ctrl, 'pickaxe'); buyItem(ctrl, 'longSword');
  buildOrBuyItem(ctrl, 'eclipse');
  assert(ctrl.stats.attackDamage === 160, '월식: 공격력 +60 적용');
  const target = makeTarget({ hp: 1000, maxHp: 1000 });
  itemOnBasicAttackHit(ctrl, target, false); // 1st hit (basic attack)
  assert(ctrl.shield === 0, '월식: 1타만으로는 아직 발동하지 않는다');
  itemOnDamageDealt(ctrl, target, 10, 'MAGICAL'); // 2nd hit via an ability within the window
  const expectedDmg = 0.08 * 1000; // melee
  assert(Math.abs((1000 - target.hp) - expectedDmg) < 1e-6, '늘 떠오르는 달: 2초 내 별개의 평타+스킬 2회로 최대 체력 8%(근접) 추가 물리 피해');
  const expectedShield = 150 + ctrl.itemBonusAD * 0.40;
  assert(Math.abs(ctrl.shield - expectedShield) < 1e-6, '늘 떠오르는 달: 150 + 추가 공격력 40%의 보호막 획득');
  assert(ctrl._itemShieldExpiresAt > now, '늘 떠오르는 달: 보호막에 만료 시각이 설정된다(2초 지속)');
  // icd: 즉시 다시 2회 때려도 재발동하지 않음
  ctrl.shield = 0;
  itemOnBasicAttackHit(ctrl, target, false); itemOnDamageDealt(ctrl, target, 10, 'MAGICAL');
  assert(ctrl.shield === 0, '늘 떠오르는 달: 발동 직후 6초 재사용대기시간 중에는 재발동하지 않는다');
  now += 6100;
  itemOnBasicAttackHit(ctrl, target, false); itemOnDamageDealt(ctrl, target, 10, 'MAGICAL');
  assert(ctrl.shield > 0, '늘 떠오르는 달: 6초 재사용대기시간 후 다시 발동 가능');
  // window expiry: 2초가 지나면 1타가 리셋되어 2타로 인정 안 됨
  now += 6100;
  const target2 = makeTarget({ hp: 1000, maxHp: 1000 });
  itemOnBasicAttackHit(ctrl, target2, false);
  now += 2100; // window(2s) expires
  const hpBefore = target2.hp;
  itemOnDamageDealt(ctrl, target2, 10, 'MAGICAL');
  assert(target2.hp === hpBefore, '늘 떠오르는 달: 2초 윈도우가 지나면 그 전 타격은 리셋되어 2회로 인정되지 않는다');
}

// ========================================================================
// 마나무네 -> 무라마나 변신 + 경탄 + 충격
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tearOfGoddess'); buyItem(ctrl, 'caulfieldsWarhammer'); buyItem(ctrl, 'longSword');
  buildOrBuyItem(ctrl, 'manamune');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'manamune', '마나무네: 조합 완료');
  assert(ctrl.maxMp === 1000, '마나무네: 마나 +500 적용 (기본 500 + 500 = 1000)');
  assert(Math.abs(ctrl.stats.attackDamage - (100 + 35 + 1000 * 0.02)) < 1e-6, '마나무네: 공격력 +35 + 경탄(마나 2% = 20) 적용');

  // 마나순환으로 360 마나를 채우면 무라마나로 변신. _itemTickTearRecharge()는
  // performance.now()가 아니라 itemSystemTick()에 넘기는 dt를 누적해서
  // 재충전 시간을 재므로(프레임 델타 기반), now와 dt를 함께 전진시켜야
  // 실제로 충전이 돌아온다(now만 돌리면 재충전 타이머가 전혀 안 움직인다).
  let hits = 0;
  while (ctrl.items[0].id === 'manamune' && hits < 300) {
    itemOnDamageDealt(ctrl, makeTarget(), 10, 'PHYSICAL');
    hits++;
    now += 2100;
    itemSystemTick(ctrl, 2.1);
  }
  assert(ctrl.items[0].id === 'muramana', '마나무네: 마나순환으로 최대 마나 360 누적 시 무라마나로 자동 변신');
  assert(ctrl.maxMp === 1500, '무라마나: 변신 후 마나 +1000 적용 (기본 500 + 1000 = 1500)');

  // 충격: 기본 공격 시 마나의 1.2% 추가 물리
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget(), false);
  const shockHit = dealtDamages.find((d) => Math.abs(d.result.rawDamage - ctrl.maxMp * 0.012) < 1e-6);
  assert(!!shockHit, '충격: 기본 공격 시 마나의 1.2% 추가 물리 피해');

  // 충격: 챔피언 대상 스킬 피해 시 근접 마나4% 추가 물리(itemOnDamageDealt 경로, target.hp 직접 차감)
  const abilityTarget = makeTarget({ hp: 100000, maxHp: 100000 });
  const hpBeforeAbility = abilityTarget.hp;
  itemOnDamageDealt(ctrl, abilityTarget, 10, 'MAGICAL');
  const expectedShock = ctrl.maxMp * 0.04; // melee
  assert(Math.abs((hpBeforeAbility - abilityTarget.hp) - expectedShock) < 1e-6, '충격: 챔피언 대상 스킬 피해 시 근접 마나 4% 추가 물리 피해(무한 재귀 없이 안전하게 처리)');
}

// ========================================================================
// 멜모셔스의 아귀: 생명선(마법 피해로 30% 밑 하락 시 보호막) + 발동 후 흡혈 10%
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'spellbinder'); buyItem(ctrl, 'caulfieldsWarhammer');
  buildOrBuyItem(ctrl, 'maw');
  assert(ctrl.stats.attackDamage === 160 && ctrl.stats.magicResist === 70, '멜모셔스의 아귀: 공격력 +60/마법저항력 +40 적용');
  ctrl.hp = ctrl.maxHp * 0.5; // 현재 50%
  itemOnTakeDamage(ctrl, ctrl.maxHp * 0.05, 'MAGICAL'); // 50%->45%, 30% 밑으로 안 떨어짐
  assert(ctrl.shield === 0, '생명선: 체력이 30% 밑으로 떨어지지 않을 피해에는 발동하지 않는다');
  itemOnTakeDamage(ctrl, ctrl.maxHp * 0.30, 'MAGICAL'); // 45%->15%, 30% 밑으로 떨어짐
  assert(ctrl.shield > 0, '생명선: 마법 피해로 체력이 30% 밑으로 떨어질 만큼이면 보호막 발동');
  const expectedShield = 200 + ctrl.itemBonusAD * 1.50; // melee
  assert(Math.abs(ctrl.shield - expectedShield) < 1e-6, '생명선: 200 + 추가 공격력 150%의 보호막(근접)');
  // 발동 후 모든 피해 흡혈 10%
  itemSystemTick(ctrl, 0.1);
  ctrl.hp = 1000;
  applyItemVamp(ctrl, 100);
  assert(Math.abs(ctrl.hp - 1010) < 1e-6, '생명선 발동 후: 모든 피해 흡혈 10% 획득(100 피해의 10%=10 회복)');
  // icd: 90초 전에는 재발동 안 함
  ctrl.shield = 0;
  itemOnTakeDamage(ctrl, ctrl.maxHp * 0.30, 'MAGICAL');
  assert(ctrl.shield === 0, '생명선: 90초 재사용대기시간 중에는 재발동하지 않는다');
  now += 90100;
  itemOnTakeDamage(ctrl, ctrl.maxHp * 0.30, 'MAGICAL');
  assert(ctrl.shield > 0, '생명선: 90초 재사용대기시간 후 재발동 가능');
  // 물리 피해에는 발동하지 않음
  const ctrl2 = makeFakeCtrl();
  buyItem(ctrl2, 'spellbinder'); buyItem(ctrl2, 'caulfieldsWarhammer'); buildOrBuyItem(ctrl2, 'maw');
  ctrl2.hp = ctrl2.maxHp * 0.5;
  itemOnTakeDamage(ctrl2, ctrl2.maxHp * 0.30, 'PHYSICAL');
  assert(ctrl2.shield === 0, '생명선: 물리 피해로는 발동하지 않는다(원문: "마법 피해를 입으면")');
}

// ========================================================================
// 쇼진의창: 드래곤의 힘(스킬 가속 25) + 집중된 의지(스택당 3%, 최대 4, 6초)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'pickaxe'); buyItem(ctrl, 'tunnelers'); buyItem(ctrl, 'rubyCrystal');
  buildOrBuyItem(ctrl, 'shojinSpear');
  assert(Math.abs(ctrl.itemBonusAbilityHaste - 25) < 1e-9, '쇼진의창: 드래곤의 힘(기본 스킬 가속 +25) 적용');
  itemSystemTick(ctrl, 0.1);
  assert(ctrl.itemSpellDamageAmpPercent === 0, '집중된 의지: 피해를 아직 입히지 않았으면 증폭 0%');
  for (let i = 0; i < 4; i++) itemOnDamageDealt(ctrl, makeTarget(), 10, 'MAGICAL');
  itemSystemTick(ctrl, 0.1);
  assert(Math.abs(ctrl.itemSpellDamageAmpPercent - 0.12) < 1e-9, '집중된 의지: 4스택(최대)에서 12%(스택당 3%) 증폭');
  for (let i = 0; i < 3; i++) itemOnDamageDealt(ctrl, makeTarget(), 10, 'MAGICAL'); // 5번째도 4스택 캡 유지
  itemSystemTick(ctrl, 0.1);
  assert(Math.abs(ctrl.itemSpellDamageAmpPercent - 0.12) < 1e-9, '집중된 의지: 최대 4중첩을 넘지 않는다');
  now += 6100; // 6초 지속시간 만료
  itemSystemTick(ctrl, 0.1);
  assert(ctrl.itemSpellDamageAmpPercent === 0, '집중된 의지: 6초간 재적중이 없으면 스택이 전부 사라진다');
}

// ========================================================================
// 선체파괴자: 선장(5번째 기본 공격마다 추가 피해, 구조물은 배율 증가)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tunnelers'); buyItem(ctrl, 'ascendedPauldrons'); buyItem(ctrl, 'pickaxe');
  buildOrBuyItem(ctrl, 'hullbreaker');
  assert(ctrl.stats.attackDamage === 140 && ctrl.maxHp === 2500, '선체파괴자: 공격력 +40/체력 +500 적용');
  const champTarget = makeTarget({ hp: 100000, maxHp: 100000 });
  dealtDamages.length = 0;
  for (let i = 0; i < 4; i++) itemOnBasicAttackHit(ctrl, champTarget, false);
  assert(dealtDamages.length === 0, '선장: 1~4타에는 추가 피해가 없다');
  itemOnBasicAttackHit(ctrl, champTarget, false); // 5th
  assert(dealtDamages.length === 1, '선장: 5번째 기본 공격에 추가 물리 피해 발동');
  // 버그 수정(QA, "기본공격력" 재점검): ctrl.stats.attackDamage(140, 아이템
  // 보너스 포함)가 아니라 진짜 기본 공격력(스텁 기준 100)을 써야 한다.
  const expectedChamp = 1.20 * 100 + 0.05 * ctrl.maxHp; // melee, champion
  assert(Math.abs(dealtDamages[0].result.rawDamage - expectedChamp) < 1e-6, '선장(챔피언, 근접): "기본" 공격력 120% + 체력 5%(총 공격력이 아님)');
  // 구조물 대상은 배율이 더 크다
  const turret = makeTarget({ isChampion: false, isTurret: true, hp: 100000, maxHp: 100000 });
  dealtDamages.length = 0;
  for (let i = 0; i < 5; i++) itemOnBasicAttackHit(ctrl, turret, false);
  const expectedStructure = 3.00 * 100 + 0.10 * ctrl.maxHp; // melee, structure, "기본" 공격력 기준
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - expectedStructure) < 1e-6, '선장(구조물, 근접): "기본" 공격력 300% + 체력 10%(챔피언 대상보다 배율이 크다, 총 공격력이 아님)');
  // 미니언 대상으로 5번째를 채우면 카운트만 소모되고 보너스는 없음
  const minion = makeTarget({ isChampion: false, isMinion: true, hp: 100000, maxHp: 100000 });
  dealtDamages.length = 0;
  for (let i = 0; i < 5; i++) itemOnBasicAttackHit(ctrl, minion, false);
  assert(dealtDamages.length === 0, '선장: 미니언 대상 5번째 공격은 보너스가 발동하지 않는다(챔피언/구조물 전용)');
}

// ========================================================================
// 칠흑의양날도끼: 깎아내기(챔피언 방어력 감소 스택) + 열정(자신 이동속도)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'devourerAxe'); buyItem(ctrl, 'kircheisShard'); buyItem(ctrl, 'pickaxe');
  buildOrBuyItem(ctrl, 'blackCleaver');
  assert(ctrl.stats.attackDamage === 145 && ctrl.maxHp === 2400 && Math.abs(ctrl.itemBonusAbilityHaste - 20) < 1e-9, '칠흑의양날도끼: 공격력 +45/체력 +400/스킬가속 +20 적용');
  const target = makeTarget();
  for (let i = 0; i < 3; i++) itemOnDamageDealt(ctrl, target, 10, 'PHYSICAL');
  assert(Math.abs(getArmorShredPercent(target) - 0.18) < 1e-9, '깎아내기: 3회 물리 피해로 방어력 감소 18%(스택당 6%) 누적');
  for (let i = 0; i < 5; i++) itemOnDamageDealt(ctrl, target, 10, 'PHYSICAL');
  assert(Math.abs(getArmorShredPercent(target) - 0.30) < 1e-9, '깎아내기: 최대 5중첩(30%)을 넘지 않는다');
  itemOnDamageDealt(ctrl, target, 10, 'MAGICAL'); // 마법 피해로는 방어력 감소가 적용되지 않는다는 걸 간접 확인(스택 유지)
  assert(Math.abs(getArmorShredPercent(target) - 0.30) < 1e-9, '깎아내기: 물리 피해 전용(마법 피해로는 추가 중첩이 쌓이지 않는다)');
  assert(Math.abs(getFlatMoveSpeedBuff(ctrl) - 20) < 1e-9, '열정(근접): 물리 피해를 입히면 이동속도 +20');
}

// ========================================================================
// 갈라진하늘: 라이트쉴드 타격(대상별 10초 icd, 회복량 = AD% + 잃은체력%)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tunnelers'); buyItem(ctrl, 'caulfieldsWarhammer');
  buildOrBuyItem(ctrl, 'divineSunderer');
  assert(ctrl.stats.attackDamage === 145 && ctrl.maxHp === 2450, '갈라진하늘: 공격력 +45/체력 +450 적용');
  const target = makeTarget({ hp: 400, maxHp: 1000 }); // 잃은 체력 600
  ctrl.hp = 1000;
  itemOnBasicAttackHit(ctrl, target, false);
  const expectedHeal = 0.90 * 100 + 600 * 0.04; // melee, "기본" 공격력 기준
  assert(Math.abs(ctrl.hp - (1000 + expectedHeal)) < 1e-6, '라이트쉴드 타격: 근접 "기본" 공격력 90% + 잃은 체력 4%만큼 체력 회복(총 공격력이 아님)');
  ctrl.hp = 1000;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(ctrl.hp === 1000, '라이트쉴드 타격: 같은 대상에게는 10초 재사용대기시간 중 재발동하지 않는다');
  now += 10100;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(ctrl.hp > 1000, '라이트쉴드 타격: 10초 후 같은 대상에게 다시 발동 가능');
}

// ========================================================================
// 끝없는 갈망: 순수 스탯(원문에 고유 패시브 없음)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'caulfieldsWarhammer'); buyItem(ctrl, 'pickaxe'); buyItem(ctrl, 'longSword');
  buildOrBuyItem(ctrl, 'eternalThirst');
  assert(ctrl.stats.attackDamage === 165, '끝없는 갈망: 공격력 +65만 적용(원문에 고유 효과 없음)');
}

// ========================================================================
// 지배자의 피갑옷: 폭정(추가체력 2.5%->AD) + 응징(잃은체력 비례, 30%에서 최대 12%)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tunnelers'); buyItem(ctrl, 'tunnelers');
  buildOrBuyItem(ctrl, 'overlordsBloodmail');
  assert(ctrl.stats.attackDamage === 135 && ctrl.maxHp === 2550, '지배자의 피갑옷: 공격력 +35/체력 +550 적용(동적 보너스 전)');
  ctrl.hp = ctrl.maxHp; // 100% 체력 - 응징 0
  itemSystemTick(ctrl, 0.1);
  const expectedTyranny = ctrl.itemBonusMaxHp * 0.025; // 폭정만 적용(응징은 풀피에서 0)
  assert(Math.abs(ctrl.itemDynamicBonusAD - expectedTyranny) < 1e-4, '폭정: 풀피일 때는 추가 체력의 2.5%만큼만 공격력 증가(응징은 0)');
  // 응징 공식 자체가 "현재 AD의 12%"를 더하고 그 AD에 다시 영향을 주는
  // 자기참조 구조라(실제 LoL의 유사 아이템들도 공통으로 갖는 특성), 매
  // 프레임 호출될 때마다 아주 조금씩 수렴한다 - 테스트에서는 여러 프레임을
  // 돌려 수렴시킨 뒤 비교한다(실제 게임에서도 매 프레임 호출되니 동일).
  function tickUntilConverged() { for (let i = 0; i < 20; i++) itemSystemTick(ctrl, 0.1); }
  ctrl.hp = ctrl.maxHp * 0.30; // 정확히 30% - 응징 최대치 도달
  tickUntilConverged();
  assert(ctrl.itemDynamicBonusAD > expectedTyranny, '응징: 체력이 30%까지 떨어지면 폭정보다 큰 동적 공격력 보너스가 추가된다');
  ctrl.hp = ctrl.maxHp * 0.10; // 30% 밑 - 응징은 더 늘지 않고 최대치 유지
  tickUntilConverged();
  const dynamicAt10 = ctrl.itemDynamicBonusAD;
  ctrl.hp = ctrl.maxHp * 0.30;
  tickUntilConverged();
  assert(Math.abs(dynamicAt10 - ctrl.itemDynamicBonusAD) < 1e-3, '응징: 체력 30% 밑으로는 더 늘지 않고(이미 최대) 30% 지점과 동일한 보너스를 유지한다');
  // 아이템을 팔면 동적 보너스가 즉시 사라진다
  ctrl.items = [];
  itemSystemTick(ctrl, 0.1);
  assert(ctrl.itemDynamicBonusAD === 0, '지배자의 피갑옷을 팔면(인벤토리에서 제거) 동적 공격력 보너스가 즉시 0으로 돌아간다');
}

// ========================================================================
// 조합 비용 정합성 - combineCost가 양수인지(강철인장 같은 모순 데이터가 없는지)
// ========================================================================
{
  const legendaryIds = ['trinityForce', 'bladeOfTheRuinedKing', 'witsEnd', 'eclipse', 'manamune', 'maw', 'shojinSpear', 'hullbreaker', 'blackCleaver', 'divineSunderer', 'eternalThirst', 'overlordsBloodmail'];
  for (const id of legendaryIds) {
    const item = ITEM_DATA[id];
    const sum = item.recipe.reduce((s, c) => s + (ITEM_DATA[c] ? ITEM_DATA[c].cost : 0), 0);
    assert(sum <= item.cost, `"${item.nameKo}"(${id}): 하위템 가격 합(${sum})이 완제품 가격(${item.cost})을 넘지 않는다`);
  }
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
