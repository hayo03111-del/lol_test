// Node vm harness for the "전설급 아이템" 7차분(주문력 계열 1차 -
// 영겁의지팡이~균열생성기, 10종 + 신규 하위템 5종 + 대천사의포옹 변신체),
// sourced directly from the user's original uploaded item text
// (460~579줄의 하위템 정의 + 1034~1150줄의 완제품 정의).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
const appliedStatuses = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  updateBars: () => {},
  getTurretGameTimeSec: () => 0,
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  STATE: { DEAD: 'DEAD', IDLE: 'IDLE', MOVE: 'MOVE', ATTACK: 'ATTACK' },
  controller: null,
  applyStatus: (target, effect) => {
    appliedStatuses.push({ target, effect });
    target.statusEffects = target.statusEffects || [];
    const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
    const rec = { ...effect, expiresAt: now + effect.duration * 1000 };
    if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
    return rec;
  },
  findEnemiesInRadius: (pos, radius) => stubs._radiusHits || [],
  applyDamage: (target, result) => {
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  getWorldPosition: (e) => (e && e.root && e.root.position) || (e && e.mesh && e.mesh.position) || (e && e.position) || e,
  getHorizontalDistance: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)),
  worldDistanceToLol: (d) => d,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnTakeDamage = itemOnTakeDamage;
this.itemOnManaSpent = itemOnManaSpent;
this.itemOnLevelUp = itemOnLevelUp;
this.useItem = useItem;
this.combineCost = combineCost;
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnDamageDealt, itemOnTakeDamage, itemOnManaSpent, itemOnLevelUp, useItem, combineCost,
} = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1000000, boots: null, team: 'BLUE', state: 'IDLE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusUltimateHaste: 0,
    itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1, itemTotalApMultiplierBonus: 0,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemTearState: null, _itemActiveHeals: [], _itemActiveManaRestores: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null, bonusAD: 0, bonusMaxHp: 0,
    _itemActiveCooldownUntil: {},
    _itemTempAttackRangeBonusLol: 0, _itemTempAttackRangeExpiresAt: 0,
    itemTempADBonus: 0, itemTempArmorBonus: 0, itemTempMrBonus: 0,
    itemTempArmorPenFlat: 0, itemTempArmorPenPercent: 0, itemTempMagicPenPercent: 0,
    itemBonusCritDamagePercent: 0,
    _itemLastDealtChampionDamageAt: 0, _itemLastTookChampionDamageAt: 0,
    trinket: null, _placedWards: [], statusEffects: [],
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 9,
    championId: 'testchamp', skillPoints: 0,
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
    levelUp() {
      if (this.champLevel >= 18) return;
      this.champLevel++;
      this.skillPoints = (this.skillPoints || 0) + 1;
      this.recomputeStats();
      if (typeof itemOnLevelUp === 'function') itemOnLevelUp(this);
    },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0) + (this.itemTempADBonus || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0) * (1 + (this.itemTotalApMultiplierBonus || 0));
      this.stats.armor = 30 + (this.itemBonusArmor || 0) + (this.itemTempArmorBonus || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0) + (this.itemTempMrBonus || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ========================================================================
// 조합 비용 정합성(하위템 가격 합이 완제품 가격을 넘지 않는지)
// ========================================================================
{
  const newItems = ['lostChapter', 'fiendishCodex', 'hextechAlternator', 'aetherialWisp', 'hauntingGuise',
    'rodOfAges', 'archangelsStaff', 'malignance', 'blackfireTorch', 'ludensEcho', 'hextechRocketbelt',
    'rylaisCrystalScepter', 'liandrysTorment', 'cosmicDrive', 'riftmaker'];
  for (const id of newItems) {
    const item = ITEM_DATA[id];
    assert(!!item, `"${id}"가 ITEM_DATA에 존재한다`);
    if (!item || !item.recipe) continue;
    const sum = item.recipe.reduce((s, cid) => s + ((ITEM_DATA[cid] && ITEM_DATA[cid].cost) || 0), 0);
    assert(sum <= item.cost, `"${item.nameKo}"(${id}): 하위템 가격 합(${sum})이 완제품 가격(${item.cost})을 넘지 않는다`);
  }
}

// ========================================================================
// 마나순환 계열 유일 아이템 그룹 - 대천사의지팡이/대천사의포옹도 여신의
// 눈물/마나무네/무라마나와 같은 uniqueGroup이어야 동시 보유가 막힌다.
// ========================================================================
{
  assert(ITEM_DATA.archangelsStaff.uniqueGroup === 'manaCirculation', '대천사의지팡이: 마나순환 유일 아이템 그룹에 속한다');
  assert(ITEM_DATA.seraphsEmbrace.uniqueGroup === 'manaCirculation', '대천사의포옹: 마나순환 유일 아이템 그룹에 속한다');
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tearOfGoddess');
  const blocked = buyItem(ctrl, 'archangelsStaff'); // 재료 없이 직접 구매 시도 - 유일 아이템 충돌로 차단
  assert(blocked === false, '여신의 눈물 보유 중: 대천사의지팡이 직접 구매가 유일 아이템 충돌로 차단된다');
}

// ========================================================================
// 영겁의지팡이 - 영원(itemManaOnDamagePercent + itemOnManaSpent 일반화),
// 불멸의 시간(60초마다 중첩, 최대 10중첩에서 레벨업 1회)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'blastingWand');
  buyItem(ctrl, 'catalystOfAeons');
  const bought = buildOrBuyItem(ctrl, 'rodOfAges');
  assert(bought === true, '영겁의지팡이: 하위템(방출의 마법봉+억겁의 카탈리스트) 보유 중 조합 성공');
  assert(ctrl.itemBonusAP === 45 && ctrl.itemBonusMaxHp === 350 && ctrl.itemBonusMana === 400, '영겁의지팡이: 기본 스탯(주문력45/체력350/마나400)이 정확히 반영된다');

  // 버그 수정 검증: itemOnManaSpent()가 'catalystOfAeons' 하드코딩이었다면
  // 영겁의지팡이(조합으로 catalystOfAeons가 인벤토리에서 빠짐)에서는
  // "스킬 사용 시 소모 마나의 25% 체력 회복"이 전혀 발동하지 않았을 것이다.
  ctrl.mp = 400;
  itemOnManaSpent(ctrl, 100); // 마나 100 소모 -> 25만큼 체력 회복(초당 최대 20이므로 1.25초에 걸쳐)
  assert(ctrl._itemActiveHeals.length === 1, '버그 수정 확인(영원 일반화): 영겁의지팡이에서도 itemOnManaSpent()가 정상적으로 체력 회복 큐를 등록한다');
  assert(Math.abs(ctrl._itemActiveHeals[0].perSec - 20) < 1e-9, '영원: 초당 회복량이 20(cap)으로 제한된다');
  assert(Math.abs(ctrl._itemActiveHeals[0].remainingSec - 1.25) < 1e-9, '영원: 총 회복량(25)을 20/s로 나누면 1.25초가 걸린다');

  ctrl._itemActiveHeals = [];
  const target = makeTarget({ isChampion: true, hp: 1000, maxHp: 1000 });
  ctrl.itemManaOnDamagePercent = 0; // recomputeItemStats가 채운 값을 확인용으로 재설정 후 아래서 재확인
  recomputeItemStats(ctrl);
  assert(Math.abs(ctrl.itemManaOnDamagePercent - 0.07) < 1e-9, '영원: 챔피언 피해 시 마나 회복 비율(7%)이 정확히 집계된다');

  // 불멸의 시간 - 60초마다 1중첩, 10중첩에서 레벨업.
  for (let i = 0; i < 10; i++) {
    now += 60000;
    itemSystemTick(ctrl, 60);
  }
  assert(ctrl._itemTimelessStacks === 10, '불멸의 시간: 600초 경과 후 정확히 10중첩(최대)에 도달한다');
  assert(ctrl.champLevel === 10, '불멸의 시간: 최대 중첩 도달 시 레벨이 1 오른다(9->10)');
  assert(Math.abs(ctrl.itemBonusAP - (45 + 10 * 3)) < 1e-9, '불멸의 시간: 10중첩 시 주문력이 10*3=30만큼 추가로 늘어난다(45+30=75)');
  assert(Math.abs(ctrl.itemBonusMaxHp - (350 + 10 * 10)) < 1e-9, '불멸의 시간: 10중첩 시 체력이 10*10=100만큼 추가로 늘어난다');
  assert(Math.abs(ctrl.itemBonusMana - (400 + 10 * 20)) < 1e-9, '불멸의 시간: 10중첩 시 마나가 10*20=200만큼 추가로 늘어난다');

  // 더 틱해도 레벨이 또 오르지 않는다(1회성 트리거).
  now += 60000;
  itemSystemTick(ctrl, 60);
  assert(ctrl.champLevel === 10, '불멸의 시간: 최대 중첩에서 더 틱해도 레벨업이 중복으로 발동하지 않는다');
}

// ========================================================================
// 대천사의지팡이 -> 대천사의포옹 변신(버그 수정: transformsInto 일반화
// 검증), 경탄(마나1%/2% 주문력), 마나순환(충전5회/적중당5), 생명선(마나18%)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tearOfGoddess');
  buyItem(ctrl, 'lostChapter');
  buyItem(ctrl, 'fiendishCodex');
  buildOrBuyItem(ctrl, 'archangelsStaff');
  const slot = ctrl.items.find((s) => s.id === 'archangelsStaff');
  assert(!!slot, '대천사의지팡이: 조합 성공');
  // totalMaxMp = computeChampionStats 스텁의 기본 마나(500) + 대천사의지팡이
  // 자신이 주는 itemBonusMana(600) = 1100.
  assert(Math.abs(ctrl.itemBonusAP - (70 + 1100 * 0.01)) < 1e-9, '대천사의지팡이(경탄): 마나1%만큼 추가 주문력(기본 70 + 총마나1100*1%=11)');

  // 마나순환 - 적중당 5(챔피언도 동일, 배수 없음), 충전 5회.
  const target = makeTarget();
  for (let i = 0; i < 5; i++) itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  assert(Math.abs(ctrl._itemTearState.gained - 25) < 1e-9, '대천사의지팡이(마나순환): 5회 적중 시 5*5=25의 최대 마나를 얻는다(충전 5회 소진)');
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL'); // 충전 소진 후에는 더 늘지 않는다
  assert(Math.abs(ctrl._itemTearState.gained - 25) < 1e-9, '대천사의지팡이(마나순환): 충전 5회를 모두 쓰면 더 이상 늘지 않는다');

  // 360 마나 도달 시 대천사의 포옹으로 변신 - 버그 수정 검증: transformsInto가
  // 'manamune' 하드코딩이었다면 이 변신은 절대 일어나지 않았을 것이다.
  ctrl._itemTearState.gained = 360;
  itemSystemTick(ctrl, 0.016);
  const transformedSlot = ctrl.items.find((s) => s.id === 'seraphsEmbrace' || s.id === 'archangelsStaff');
  assert(transformedSlot && transformedSlot.id === 'seraphsEmbrace', '버그 수정 확인(변신 일반화): 360 마나 도달 시 대천사의지팡이가 대천사의포옹으로 정상 변신한다');
  assert(Math.abs(ctrl.itemBonusAP - (70 + (500 + 1000) * 0.02)) < 1e-9, '대천사의포옹(경탄): 마나2%로 올라가고, 변신 후 마나(1000) 기준으로 재계산된다');

  // 생명선(마나18%, 90초 CD).
  ctrl.hp = 1000; ctrl.maxHp = 1000; ctrl.shield = 0;
  const remaining = itemOnTakeDamage(ctrl, 800, 'PHYSICAL', null); // 800 피해 -> 20%로 추락(30% 미만)
  assert(remaining === 800, '대천사의포옹(생명선): itemOnTakeDamage는 피해량 자체를 줄이지 않는다(보호막으로 흡수되는 방식)');
  assert(Math.abs(ctrl.shield - ctrl.maxMp * 0.18) < 1e-6, '대천사의포옹(생명선): 최대 마나의 18%만큼 보호막을 얻는다');
  ctrl.shield = 0;
  const remaining2 = itemOnTakeDamage(ctrl, 800, 'PHYSICAL', null);
  assert(ctrl.shield === 0, '대천사의포옹(생명선): 재사용대기시간(90초) 중에는 다시 발동하지 않는다');
}

// ========================================================================
// 악의 - 경멸(궁극기 가속, R에만 적용)/증오안개(궁극기 피해 시에만 발동)
// ========================================================================
{
  assert(ITEM_DATA.malignance.ultimateHasteFlat === 20, '악의: 궁극기 가속 데이터값 확인');
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'lostChapter');
  buyItem(ctrl, 'blastingWand');
  buildOrBuyItem(ctrl, 'malignance');
  recomputeItemStats(ctrl);
  assert(ctrl.itemBonusUltimateHaste === 20, '악의(경멸): itemBonusUltimateHaste에 20이 집계된다(스킬 가속 itemBonusAbilityHaste와 별개)');

  const target = makeTarget({ maxHp: 1000, hp: 1000 });
  // R을 쓰지 않은 상태에서는 증오안개가 발동하지 않는다.
  itemOnDamageDealt(ctrl, target, 100, 'MAGICAL');
  assert(appliedStatuses.filter((a) => a.effect.id === 'itemMalignanceHatefogBurn').length === 0, '증오안개: 궁극기(R)를 쓰지 않았으면 발동하지 않는다');

  // R을 "방금" 쓴 것으로 흉내낸 뒤 피해를 입히면 발동한다.
  ctrl._itemLastCastSlot = 'R';
  ctrl._itemLastCastSlotAt = now;
  itemOnDamageDealt(ctrl, target, 100, 'MAGICAL');
  const burnLogs = appliedStatuses.filter((a) => a.effect.id === 'itemMalignanceHatefogBurn');
  assert(burnLogs.length === 1, '증오안개: 궁극기 시전 직후 피해를 입히면 발동한다');
  const mrLogs = appliedStatuses.filter((a) => a.effect.id === 'itemMalignanceHatefogMrShred');
  assert(mrLogs.length === 1 && mrLogs[0].effect.value === 10, '증오안개: 마법 저항력 10 감소(MR_SHRED) 상태이상도 함께 걸린다');

  // 시간이 지나 판정 창(rDamageWindowMs)을 벗어나면 다시 발동하지 않는다.
  now += 1000;
  itemOnDamageDealt(ctrl, target, 100, 'MAGICAL');
  assert(appliedStatuses.filter((a) => a.effect.id === 'itemMalignanceHatefogBurn').length === 1, '증오안개: 궁극기 시전 후 판정 창(0.5초)이 지나면 더 이상 발동하지 않는다');
}

// ========================================================================
// 어둠불꽃횃불 - 악의의 불길(주문력 비례 화상)/어둠불꽃(불타는 대상 수
// 비례 총 주문력 증가, itemTotalApMultiplierBonus 곱연산 검증)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'lostChapter');
  buyItem(ctrl, 'embersOfFate');
  buildOrBuyItem(ctrl, 'blackfireTorch');
  ctrl.stats.abilityPower = 100; // recomputeStats가 아래서 다시 덮어쓰지 않도록 직접 세팅된 값을 바로 사용
  const t1 = makeTarget({ id: 't1' });
  const t2 = makeTarget({ id: 't2' });
  itemOnDamageDealt(ctrl, t1, 50, 'MAGICAL');
  const burn1 = appliedStatuses.filter((a) => a.effect.id === 'blackfireTorchBurn' && a.target === t1).pop();
  assert(!!burn1 && Math.abs(burn1.effect.totalDamage - (20 + 100 * 0.02) * 3) < 1e-6, '악의의 불길: 매초 20+주문력2%의 화상(주문력100 기준 초당22, 3초=66)');

  itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemBlackfireStacks === 1, '어둠불꽃: 현재 불타는 대상 1명이 정확히 집계된다');
  itemOnDamageDealt(ctrl, t2, 50, 'MAGICAL');
  itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemBlackfireStacks === 2, '어둠불꽃: 2명째 대상에게도 화상을 걸면 중첩이 2로 늘어난다');
  assert(Math.abs(ctrl.itemTotalApMultiplierBonus - 0.08) < 1e-9, '어둠불꽃: 중첩 2개 * 4% = 총 주문력 +8% 배율이 집계된다');
  assert(Math.abs(ctrl.stats.abilityPower - ctrl.itemBonusAP * 1.08) < 1e-6, '어둠불꽃: 총 주문력 배율이 최종 stats.abilityPower에 곱연산으로 반영된다');

  // 화상이 만료되면 중첩도 줄어든다.
  now += 3100;
  itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemBlackfireStacks === 0, '어둠불꽃: 화상(3초)이 모두 만료되면 중첩도 0으로 돌아간다');
}

// ========================================================================
// 루덴의메아리 - 메아리(스킬 피해 시 추가 마법 피해, 재사용대기 12초)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'lostChapter');
  buyItem(ctrl, 'hextechAlternator');
  buildOrBuyItem(ctrl, 'ludensEcho');
  ctrl.stats.abilityPower = 100;
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  const hpBefore = target.hp;
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  const full = 75 + 100 * 0.05; // 80
  const expectedBonus = full * (1 + 5 * 0.20); // 80*2.0=160
  assert(Math.abs((hpBefore - target.hp) - expectedBonus) < 1e-6, '메아리: 주변에 다른 적이 없을 때 모든 메아리가 주 대상에 집중되어 총 200%(160) 피해를 입힌다');

  const hpBefore2 = target.hp;
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL'); // 재사용대기시간 중
  assert(target.hp === hpBefore2, '메아리: 재사용대기시간(12초) 중에는 다시 발동하지 않는다');
  now += 12000;
  const hpBefore3 = target.hp;
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  assert(target.hp < hpBefore3, '메아리: 재사용대기시간이 지나면 다시 발동한다');
}

// ========================================================================
// 마법공학 로켓 벨트 - 초음속(즉시 발동형 범위 마법 피해, 구조물 제외 없음)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'hextechAlternator');
  buyItem(ctrl, 'kircheisShard');
  buyItem(ctrl, 'rubyCrystal');
  buildOrBuyItem(ctrl, 'hextechRocketbelt');
  ctrl.items.push({ id: 'healthPotion', count: 1 }); // 인벤토리 칸 확인용(아님)
  ctrl.items.pop();
  ctrl.stats.abilityPower = 100;
  const turret = makeTarget({ isChampion: false, isTurret: true, hp: 1000, maxHp: 1000 });
  const champ = makeTarget({ hp: 1000, maxHp: 1000 });
  stubs._radiusHits = [{ unit: turret }, { unit: champ }];
  const slotIndex = ctrl.items.findIndex((s) => s.id === 'hextechRocketbelt');
  const used = useItem(ctrl, slotIndex);
  assert(used === true, '마법공학 로켓 벨트(초음속): 사용 성공');
  const expected = 100 + 100 * 0.10; // 110
  assert(Math.abs(turret.hp - (1000 - expected)) < 1e-6, '초음속: 구조물 제외 없이 포탑에게도 마법 피해가 들어간다(원문에 구조물 제외 언급 없음)');
  assert(Math.abs(champ.hp - (1000 - expected)) < 1e-6, '초음속: 챔피언에게도 동일한 공식(100+주문력10%)의 피해가 들어간다');
  stubs._radiusHits = [];
}

// ========================================================================
// 라일라이의수정홀 - 서리(피해 시 1초간 30% 둔화)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'blastingWand');
  buyItem(ctrl, 'giantsBelt');
  buyItem(ctrl, 'amplifyingTome');
  buildOrBuyItem(ctrl, 'rylaisCrystalScepter');
  const target = makeTarget();
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  const slow = appliedStatuses.filter((a) => a.effect.id === 'itemRylaiSlow').pop();
  assert(!!slow && slow.effect.value === 0.30 && slow.effect.duration === 1.0, '서리: 피해를 입히면 1초간 30% 둔화를 건다');
}

// ========================================================================
// 리안드리의 고통 - 고통(최대 체력 비례 화상)/고난(전투 중 누적 추가 피해,
// 기괴한 가면과 동일한 combatRampPassive 재사용)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'hauntingGuise');
  buyItem(ctrl, 'embersOfFate');
  buildOrBuyItem(ctrl, 'liandrysTorment');
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  const burn = appliedStatuses.filter((a) => a.effect.id === 'liandrysBurn').pop();
  assert(!!burn && Math.abs(burn.effect.totalDamage - 2000 * 0.02 * 3) < 1e-6, '고통: 적용 시점 최대 체력(2000)의 2%*3초=120의 화상 총량');

  // 고난 - 전투 중 매초 2%씩 최대 6%까지 누적, 최종 피해에 비율만 추가.
  ctrl._itemLastDealtChampionDamageAt = now;
  for (let i = 0; i < 5; i++) { now += 1000; itemSystemTick(ctrl, 1.0); }
  assert(Math.abs(ctrl._itemCombatRampPercent - 0.06) < 1e-9, '고난: 3초(최대 6%/2%=3초)면 최대치 6%에 도달한다');
  const target2 = makeTarget({ maxHp: 2000, hp: 2000 });
  const before = target2.hp;
  itemOnDamageDealt(ctrl, target2, 1000, 'MAGICAL');
  assert(Math.abs((before - target2.hp) - 1000 * 0.06) < 1e-6, '고난: 이미 끝난 최종 피해(1000)의 6%만큼 추가 피해가 들어간다(이중 감소 없음)');

  // 전투 이탈(5초) 시 즉시 0으로 리셋.
  now += 6000;
  itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemCombatRampPercent === 0, '고난: 전투 이탈(5초) 시 누적치가 즉시 0으로 돌아간다');
}

// ========================================================================
// 우주의추진력 - 마법의 춤(마법/고정 피해 시 이동속도 +20, 물리 피해는 제외)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'kircheisShard');
  buyItem(ctrl, 'aetherialWisp');
  buyItem(ctrl, 'fiendishCodex');
  buildOrBuyItem(ctrl, 'cosmicDrive');
  const target = makeTarget();
  itemOnDamageDealt(ctrl, target, 50, 'PHYSICAL');
  assert(appliedStatuses.filter((a) => a.effect.id === 'itemCosmicDriveMs').length === 0, '마법의 춤: 물리 피해에는 발동하지 않는다');
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  const ms1 = appliedStatuses.filter((a) => a.effect.id === 'itemCosmicDriveMs').pop();
  assert(!!ms1 && ms1.effect.value === 20 && ms1.effect.duration === 4.0, '마법의 춤: 마법 피해 시 이동속도 +20(4초) 발동');
  itemOnDamageDealt(ctrl, target, 50, 'TRUE');
  assert(appliedStatuses.filter((a) => a.effect.id === 'itemCosmicDriveMs').length === 2, '마법의 춤: 고정 피해에도 발동한다');
}

// ========================================================================
// 균열생성기 - 공허의 부패(최대 8%, 최대치에서 흡혈 획득)/공허의 마력
// (추가 체력의 2%만큼 주문력)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'hauntingGuise');
  buyItem(ctrl, 'fiendishCodex');
  buildOrBuyItem(ctrl, 'riftmaker');
  assert(Math.abs(ctrl.itemBonusAP - (70 + ctrl.itemBonusMaxHp * 0.02)) < 1e-6, '공허의 마력: 추가 체력(itemBonusMaxHp)의 2%만큼 주문력이 추가로 집계된다');

  ctrl._itemLastDealtChampionDamageAt = now;
  for (let i = 0; i < 4; i++) { now += 1000; itemSystemTick(ctrl, 1.0); }
  assert(Math.abs(ctrl._itemCombatRampPercent - 0.08) < 1e-9, '공허의 부패: 4초(8%/2%=4초)면 균열생성기 전용 최대치 8%에 도달한다(기괴한 가면의 6%보다 높음)');
  assert(ctrl._itemCombatRampVampApplied === true, '공허의 부패: 최대치 도달 시 흡혈 획득 플래그가 켜진다');
  assert(ctrl.itemAllDamageVampPercent > 0, '공허의 부패: 최대치 도달 시 모든 피해 흡혈이 실제로 집계된다(근접/원거리)');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
