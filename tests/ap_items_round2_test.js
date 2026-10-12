// Node vm harness for the "전설급 아이템" 8차분(주문력 계열 2차 - 황혼과
// 새벽~마법공학총검, 7종 + 하위템 1종 "역병의 보석"), sourced directly
// from the user's original uploaded item text (1151~1214줄 + 490~494줄).
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
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnAbilityDispatch = itemOnAbilityDispatch;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemSpellbladeReadyAttackSpeedPercent = itemSpellbladeReadyAttackSpeedPercent;
this.useItem = useItem;
this.combineCost = combineCost;
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnBasicAttackHit, itemOnAbilityDispatch, itemOnDamageDealt, itemSpellbladeReadyAttackSpeedPercent, useItem, combineCost,
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
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1, itemBonusMagicPenMultiplier: 1, itemTotalApMultiplierBonus: 0,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemTearState: null, _itemActiveHeals: [], _itemActiveManaRestores: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null, bonusAD: 0, bonusMaxHp: 0,
    _itemActiveCooldownUntil: {},
    _itemTempAttackRangeBonusLol: 0, _itemTempAttackRangeExpiresAt: 0,
    itemTempADBonus: 0, itemTempArmorBonus: 0, itemTempMrBonus: 0,
    itemTempArmorPenFlat: 0, itemTempArmorPenPercent: 0, itemTempMagicPenPercent: 0,
    itemBonusCritDamagePercent: 0,
    _itemLastDealtChampionDamageAt: 0, _itemLastTookChampionDamageAt: 0,
    trinket: null, _placedWards: [], statusEffects: [], currentTarget: null,
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 9,
    championId: 'testchamp', skillPoints: 0,
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
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
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } }, mesh: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ========================================================================
// 조합 비용 정합성
// ========================================================================
{
  const newItems = ['plagueGem', 'duskAndDawn', 'nashorsTooth', 'lichBane', 'voidStaff', 'tempestStaff', 'shadowflame', 'hextechGunblade'];
  for (const id of newItems) {
    const item = ITEM_DATA[id];
    assert(!!item, `"${id}"가 ITEM_DATA에 존재한다`);
    if (!item || !item.recipe) continue;
    const sum = item.recipe.reduce((s, cid) => s + ((ITEM_DATA[cid] && ITEM_DATA[cid].cost) || 0), 0);
    assert(sum <= item.cost, `"${item.nameKo}"(${id}): 하위템 가격 합(${sum})이 완제품 가격(${item.cost})을 넘지 않는다`);
  }
}

// ========================================================================
// 퍼센트 마법 관통력(itemBonusMagicPenMultiplier) - 방어구 관통력과 동일한
// 곱연산 방식인지 00_global_constants.js의 진짜 calculateDamage()로 확인.
// ========================================================================
{
  const stubsD = { console, controller: null, getArmorShredPercent: () => 0, getMrShredFlat: () => 0, getMagicDamageReductionPercent: () => 0 };
  const contextD = vm.createContext(stubsD);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
  vm.runInContext(src + '\nthis.calculateDamage = calculateDamage; this.DAMAGE_TYPE = DAMAGE_TYPE;', contextD);
  const { calculateDamage, DAMAGE_TYPE } = contextD;
  const target = { magicResist: 100 };
  const holder1 = { itemBonusMagicPenMultiplier: (1 - 0.13) };
  const holder2 = { itemBonusMagicPenMultiplier: (1 - 0.13) * (1 - 0.40) };
  const dmgNoPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target, source: { itemBonusMagicPenMultiplier: 1 } });
  const dmgOnePen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target, source: holder1 });
  const dmgTwoPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target, source: holder2 });
  assert(Math.abs(dmgOnePen - 200 * 100 / (100 + 100 * (1 - 0.13))) < 1e-6, '역병의 보석: 마법 관통력 13%가 마법 피해 공식에 정확히 반영된다');
  assert(Math.abs(dmgTwoPen - 200 * 100 / (100 + 100 * (1 - 0.13) * (1 - 0.40))) < 1e-6, '역병의 보석+공허의지팡이: 두 관통력이 합연산이 아니라 (1-x)의 곱으로 누적된다(0.87*0.6=0.522)');
  assert(dmgTwoPen > dmgOnePen && dmgOnePen > dmgNoPen, '마법 관통력이 많을수록 더 센 피해가 들어간다(단조성 확인)');
}

// ========================================================================
// 황혼과새벽 - 주문 검(주문력%+공격력%, 마법 피해, 적중 시 효과 2회) + 체력 회복
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'sheen');
  buyItem(ctrl, 'blastingWand');
  buyItem(ctrl, 'kircheisShard');
  buyItem(ctrl, 'dagger');
  buildOrBuyItem(ctrl, 'duskAndDawn');
  ctrl.stats.abilityPower = 100; // 테스트 편의상 직접 세팅(recomputeStats가 매번 itemBonusAP로 되돌리므로 buyItem 이후에 세팅)
  itemOnAbilityDispatch(ctrl); // 스킬 사용 -> 주문 검 무장
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  ctrl.hp = 1000; ctrl.maxHp = 2000;
  itemOnBasicAttackHit(ctrl, target, false);
  // 버그 수정(QA, "기본공격력" 재점검): 원문("기본공격력 75%")은 총 공격력이
  // 아니라 챔피언 고유 기본 공격력만 가리킨다 - 이 테스트의
  // computeChampionStats 스텁 기준 60을 쓴다(ctrl.stats.attackDamage가 아님).
  const expectedBonus = 0.75 * 60 + 0.10 * 100; // "기본" AD% + AP%
  assert(Math.abs((2000 - target.hp) - expectedBonus * 2) < 1e-6, '황혼과새벽(주문 검): "적중 시 효과 1회 추가 적용"으로 "기본" 공격력 기준 보너스가 2회 들어간다(마법 피해, 총 공격력이 아님)');
  const expectedHeal = 100 * 0.10 + (ctrl.itemBonusMaxHp || 0) * 0.03;
  assert(Math.abs(ctrl.hp - (1000 + expectedHeal)) < 1e-6, '황혼과새벽: 주문력10%+추가체력3%만큼 체력을 회복한다');
}

// ========================================================================
// 내셔의이빨 - 이케시아의 이빨(온히트 15+주문력15%, 구조물 제외 없음)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'recurveBow');
  buyItem(ctrl, 'blastingWand');
  buyItem(ctrl, 'fiendishCodex');
  buildOrBuyItem(ctrl, 'nashorsTooth');
  ctrl.stats.abilityPower = 100;
  const turret = makeTarget({ isChampion: false, isTurret: true, hp: 1000, maxHp: 1000 });
  itemOnBasicAttackHit(ctrl, turret, false);
  assert(Math.abs(turret.hp - (1000 - (15 + 100 * 0.15))) < 1e-6, '이케시아의 이빨: 15+주문력15%=30의 온히트 마법 피해가 구조물 제외 없이 포탑에도 들어간다');
}

// ========================================================================
// 리치베인 - 주문 검(공격력75%+주문력45%, 마법 피해) + "사용 가능할 때" 공속+50%
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'sheen');
  buyItem(ctrl, 'aetherialWisp');
  buyItem(ctrl, 'blastingWand');
  buildOrBuyItem(ctrl, 'lichBane');
  ctrl.stats.abilityPower = 100;
  assert(itemSpellbladeReadyAttackSpeedPercent(ctrl) === 0, '리치베인: 주문 검이 무장되지 않은 상태에서는 공격속도 보너스가 없다');
  itemOnAbilityDispatch(ctrl);
  assert(Math.abs(itemSpellbladeReadyAttackSpeedPercent(ctrl) - 0.50) < 1e-9, '리치베인: 주문 검이 무장되면(사용 가능) 공격속도 +50%를 얻는다');
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  itemOnBasicAttackHit(ctrl, target, false);
  // 버그 수정(QA, "기본공격력" 재점검) - 황혼과새벽과 동일한 이유.
  const expectedBonus = 0.75 * 60 + 0.45 * 100;
  assert(Math.abs((2000 - target.hp) - expectedBonus) < 1e-6, '리치베인(주문 검): "기본"공격력75%+주문력45%의 추가 마법 피해(1회만, extraProc 없음, 총 공격력이 아님)');
  assert(itemSpellbladeReadyAttackSpeedPercent(ctrl) === 0, '리치베인: 평타로 소모하고 나면(무장 해제) 공격속도 보너스도 즉시 사라진다');
}

// ========================================================================
// 폭풍쇄도 - 폭풍 약탈자(누적 피해 25% 문턱, 2.5초 윈도우)/질풍(2초 지연
// 타격, 대상 사망 시 즉시 폭발)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'hextechAlternator');
  buyItem(ctrl, 'aetherialWisp');
  buildOrBuyItem(ctrl, 'tempestStaff');
  ctrl.stats.abilityPower = 100;
  const target = makeTarget({ maxHp: 1000, hp: 1000 });

  // itemOnDamageDealt()는 실제 운영 코드에서 applyDamage()가 이미 hp를
  // 깎은 "뒤"에 불리는 훅이라, 테스트에서도 동일하게 먼저 hp를 깎아 호출한다.
  target.hp -= 100;
  itemOnDamageDealt(ctrl, target, 100, 'MAGICAL'); // 10% - 문턱(25%) 미달
  assert(!ctrl._itemGaleQueue || ctrl._itemGaleQueue.length === 0, '폭풍 약탈자: 누적 피해가 문턱(25%) 미만이면 질풍이 걸리지 않는다');
  target.hp -= 200;
  itemOnDamageDealt(ctrl, target, 200, 'MAGICAL'); // 누적 30% - 문턱 돌파
  assert(ctrl._itemGaleQueue && ctrl._itemGaleQueue.length === 1, '폭풍 약탈자: 2.5초 내 누적 피해가 25%를 넘으면 질풍이 큐에 등록된다');

  // 2초가 지나기 전에는 타격하지 않는다.
  now += 1000;
  itemSystemTick(ctrl, 1.0);
  assert(target.hp === 700, '질풍: 아직 2초(지연시간)가 지나지 않았으면 타격하지 않는다');

  // 2초가 지나면 125+주문력10%=135의 단일 대상 타격.
  now += 1000;
  itemSystemTick(ctrl, 1.0);
  assert(Math.abs(target.hp - (700 - 135)) < 1e-6, '질풍: 지연시간(2초) 경과 후 125+주문력10%의 단일 대상 마법 피해');
  assert(ctrl._itemGaleQueue.length === 0, '질풍: 타격 후 큐에서 제거된다');

  // 대상별 재사용대기시간(30초) 검증 - 같은 대상에게 또 문턱을 넘겨도 바로는 재발동하지 않는다.
  itemOnDamageDealt(ctrl, target, 1000, 'MAGICAL');
  assert(ctrl._itemGaleQueue.length === 0, '폭풍 약탈자: 같은 대상에게는 재사용대기시간(30초) 중 다시 발동하지 않는다');

  // 대상이 타격 전에 사망하면 즉시 범위 폭발.
  now += 31000;
  const target2 = makeTarget({ maxHp: 1000, hp: 1000 });
  itemOnDamageDealt(ctrl, target2, 300, 'MAGICAL'); // 30% 돌파 -> 질풍 등록
  assert(ctrl._itemGaleQueue.length === 1, '폭풍 약탈자: 재사용대기시간이 지나면 다시 질풍을 걸 수 있다');
  target2.hp = 0; // 가격 전에 사망
  const bystander = makeTarget({ id: 'bystander', maxHp: 500, hp: 500 });
  stubs._radiusHits = [{ unit: bystander }];
  itemSystemTick(ctrl, 0.016);
  assert(bystander.hp < 500, '질풍: 가격 전에 대상이 사망하면 즉시 넓은 범위에 폭발 피해를 입힌다');
  assert(ctrl._itemGaleQueue.length === 0, '질풍: 즉시 폭발 후 큐에서 제거된다');
  stubs._radiusHits = [];
}

// ========================================================================
// 그림자불꽃 - 잿덩이꽃(체력 40% 이하 적에게 마법/고정 피해 +20%, 치명타
// 피해량 보너스는 이 추가 피해에만 곱해짐)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'hextechAlternator');
  buyItem(ctrl, 'needlesslyLargeRod');
  buildOrBuyItem(ctrl, 'shadowflame');
  const highHpTarget = makeTarget({ maxHp: 1000, hp: 500 }); // 50% - 문턱 초과
  const before1 = highHpTarget.hp;
  itemOnDamageDealt(ctrl, highHpTarget, 100, 'MAGICAL');
  assert(highHpTarget.hp === before1 - 0, '잿덩이꽃: 체력 40% 초과인 적에게는 추가 피해가 없다(finalDmg는 이미 반영된 값이라 itemOnDamageDealt 자체는 추가 차감 없음)');

  const lowHpTarget = makeTarget({ maxHp: 1000, hp: 300 }); // 30% - 문턱 이하
  const before2 = lowHpTarget.hp;
  itemOnDamageDealt(ctrl, lowHpTarget, 100, 'MAGICAL');
  assert(Math.abs((before2 - lowHpTarget.hp) - 100 * 0.20) < 1e-6, '잿덩이꽃: 체력 40% 이하인 적에게 마법 피해 시 20% 추가 피해');

  const lowHpTarget2 = makeTarget({ maxHp: 1000, hp: 300 });
  const before3 = lowHpTarget2.hp;
  itemOnDamageDealt(ctrl, lowHpTarget2, 100, 'PHYSICAL');
  assert(lowHpTarget2.hp === before3, '잿덩이꽃: 물리 피해에는 발동하지 않는다(마법/고정 피해 전용)');

  ctrl.itemBonusCritDamagePercent = 0.30; // 무한의 대검 보유 가정
  const lowHpTarget3 = makeTarget({ maxHp: 1000, hp: 300 });
  const before4 = lowHpTarget3.hp;
  itemOnDamageDealt(ctrl, lowHpTarget3, 100, 'MAGICAL');
  assert(Math.abs((before4 - lowHpTarget3.hp) - 100 * 0.20 * 1.30) < 1e-6, '잿덩이꽃: 치명타 피해량(+30%)이 이 추가 피해 자체에 곱해져 26(=20*1.3)으로 늘어난다');
}

// ========================================================================
// 마법공학총검 - 번개 화살(단일 대상 액티브, 레벨 비례 피해 + 둔화)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'vampiricScepter');
  buyItem(ctrl, 'hextechAlternator');
  buyItem(ctrl, 'amplifyingTome');
  buildOrBuyItem(ctrl, 'hextechGunblade');
  ctrl.stats.abilityPower = 100;
  const slotIndex = ctrl.items.findIndex((s) => s.id === 'hextechGunblade');

  const noTarget = useItem(ctrl, slotIndex);
  assert(noTarget === false, '번개 화살: 선택한 적 챔피언이 없으면 사용할 수 없다');

  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  ctrl.currentTarget = target;
  const used = useItem(ctrl, slotIndex);
  assert(used === true, '번개 화살: 적 챔피언을 선택하면 사용할 수 있다');
  // champLevel=9, levelMin=1~levelMax=18 구간 선형보간: 175 + (253-175)*(9-1)/(18-1)
  const expectedBase = 175 + (253 - 175) * (9 - 1) / (18 - 1);
  assert(Math.abs((2000 - target.hp) - (expectedBase + 100 * 0.30)) < 1e-6, '번개 화살: 레벨 비례 피해(175~253)+주문력30%가 정확히 들어간다');
  const slow = appliedStatuses.filter((a) => a.effect.id === 'itemNoxiousBladeSlow').pop();
  assert(!!slow && slow.effect.value === 0.25 && slow.effect.duration === 1.5, '번개 화살: 1.5초간 25% 둔화를 건다');

  const secondUse = useItem(ctrl, slotIndex);
  assert(secondUse === false, '번개 화살: 재사용대기시간(60초) 중에는 다시 사용할 수 없다');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
