// Node vm harness for the 4th item-system round: boots (single-slot,
// auto-replace), magicPenFlat (calculateDamage), tenacity/slow-resist
// (applyStatus). Same vm methodology as earlier rounds.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 100000;
let gameTimeSec = 0;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

// ---------- Part A: item_system.js boots logic ----------
{
  const stubs = {
    performance: { now: () => now },
    console,
    isPositionInBaseZone: () => true,
  PLAYER_TEAM: 'BLUE',
    updateGoldDisplay: () => {},
    updateItemUI: () => {},
    getTurretGameTimeSec: () => gameTimeSec,
    THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} clone(){return new this.constructor(this.x,this.y,this.z);} }, ConeGeometry: class {}, MeshBasicMaterial: class {}, Mesh: class { constructor(){this.position={copy(){} };} } },
    lolRangeToWorld: (r) => (r||0) * 0.008643,
    scene: { add(){}, remove(){} },
    visionSystem: { grantVision(){} },
    DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
    applyStatus: () => {},
    findEnemiesInRadius: () => [],
    applyDamage: () => {},
  };
  const context = vm.createContext(stubs);
  const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
  const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
  vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
    this.ITEM_DATA = ITEM_DATA; this.ITEM_CATEGORIES = ITEM_CATEGORIES;
    this.recomputeItemStats = recomputeItemStats; this.buyItem = buyItem; this.sellBoots = sellBoots;
    this.itemOnChampionTakedown = itemOnChampionTakedown;
  `, context);
  const { ITEM_DATA, ITEM_CATEGORIES, buyItem, sellBoots, itemOnChampionTakedown } = context;

  function makeFakeCtrl() {
    return {
      root: { position: { x: 0, y: 0, z: 0 } },
      items: [], gold: 100000, boots: null,
      itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
      itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
      itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
      itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
      itemBonusMoveSpeedLol: 0, itemBonusMagicPenFlat: 0, itemSlowResistPercent: 0, itemTenacityPercent: 0,
      _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
      trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [],
      hp: 500, maxHp: 500, mp: 100, maxMp: 100,
      stats: { attackDamage: 50, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0 },
      recomputeStats() {
        this.maxHp = 500 + (this.itemBonusMaxHp || 0);
        this.stats.attackDamage = 50 + (this.itemBonusAD || 0);
        this.stats.armor = 30 + (this.itemBonusArmor || 0);
        this.stats.magicResist = 30 + (this.itemBonusMr || 0);
      },
    };
  }

  // Boots: data sanity - ITEM_CATEGORIES.boots lists exactly the 9 boots, none duplicated with other categories.
  const bootsCat = ITEM_CATEGORIES.find((c) => c.id === 'boots');
  assert(bootsCat && bootsCat.items.length === 9, 'boots category lists all 9 boots');
  assert(!ITEM_CATEGORIES.find((c) => c.id === 'consumable').items.includes('stealthWard'), 'stealthWard removed from purchasable consumable tab');

  // Buying boots goes to ctrl.boots, not ctrl.items.
  const c1 = makeFakeCtrl();
  const bought = buyItem(c1, 'boots');
  assert(bought === true, 'buying basic boots succeeds');
  assert(c1.boots && c1.boots.id === 'boots', 'boots go into ctrl.boots, not ctrl.items');
  assert(c1.items.length === 0, 'ctrl.items untouched by boots purchase');
  assert(c1.itemBonusMoveSpeedLol === 25, 'basic boots grant +25 move speed (raw LoL units)');

  // Buying a second (different) pair of boots replaces the first with a full refund.
  const goldBefore = c1.gold;
  buyItem(c1, 'berserkersGreaves');
  assert(c1.boots.id === 'berserkersGreaves', 'buying new boots replaces the old pair');
  assert(c1.gold === goldBefore - 1100 + 300, 'old boots (300g) fully refunded when replaced, new boots (1100g) charged');
  assert(c1.itemBonusAttackSpeedPercent === 0.30, 'berserkers greaves grants its AS%');
  assert(c1.itemBonusMoveSpeedLol === 45, 'move speed updates to the new boots value (not additive with old)');

  // Buying the exact same boots again is rejected.
  const rebuy = buyItem(c1, 'berserkersGreaves');
  assert(rebuy === false, 'buying identical already-equipped boots is rejected');

  // Trinket cannot be bought through buyItem (defensive guard).
  const c2 = makeFakeCtrl();
  const trinketBuy = buyItem(c2, 'stealthWard');
  assert(trinketBuy === false, 'buyItem rejects trinket purchases (stealthWard)');
  assert(c2.items.length === 0, 'rejected trinket purchase did not fill an inventory slot');

  // sellBoots refunds 70% and clears the slot.
  const c3 = makeFakeCtrl();
  buyItem(c3, 'sorcerersShoes');
  assert(c3.itemBonusMagicPenFlat === 12, 'sorcerers shoes grant +12 flat magic pen');
  const goldBeforeSell = c3.gold;
  sellBoots(c3);
  assert(c3.boots === null, 'sellBoots clears the boots slot');
  assert(c3.gold === goldBeforeSell + Math.floor(1100 * 0.7), 'sellBoots refunds 70% of cost');
  assert(c3.itemBonusMagicPenFlat === 0, 'magic pen bonus removed after selling boots');

  // Slow resist / tenacity stats wired through recomputeItemStats.
  const c4 = makeFakeCtrl();
  buyItem(c4, 'bootsOfSwiftness');
  assert(c4.itemSlowResistPercent === 0.25, 'boots of swiftness grant 25% slow resist');
  assert(c4.itemBonusMoveSpeedLol === 55, 'boots of swiftness grant +55 move speed');
  const c5 = makeFakeCtrl();
  buyItem(c5, 'mercurysTreads');
  assert(c5.itemTenacityPercent === 0.30, 'mercurys treads grant 30% tenacity');
  assert(c5.stats.magicResist === 50, 'mercurys treads grant +20 MR');

  // Boots of Greed: slaughter stacking shares the takedown hook with Dark Seal.
  const c6 = makeFakeCtrl();
  buyItem(c6, 'bootsOfGreed');
  assert(c6.itemAllDamageVampPercent === 0.04, 'boots of greed base 4% omnivamp');
  itemOnChampionTakedown(c6);
  itemOnChampionTakedown(c6);
  assert(c6._itemSlaughterStacks === 2, 'two takedowns grant 2 slaughter stacks');
  assert(Math.abs(c6.itemAllDamageVampPercent - (0.04 + 2 * 0.006)) < 1e-9, 'slaughter stacks add 0.6% omnivamp each dynamically');
  for (let i = 0; i < 20; i++) itemOnChampionTakedown(c6);
  assert(c6._itemSlaughterStacks === 10, 'slaughter stacks capped at 10');

  // Dark Seal and Boots of Greed takedown stacking are independent and both fire from one call.
  const c7 = makeFakeCtrl();
  buyItem(c7, 'darkSeal');
  buyItem(c7, 'bootsOfGreed');
  itemOnChampionTakedown(c7);
  assert(c7._itemGloryStacks === 2 && c7._itemSlaughterStacks === 1, 'a single takedown call advances both items at once when both are held');
}

// ---------- Part B: calculateDamage() flat magic pen ----------
{
  const stubs = {
    console,
    controller: null,
    getArmorShredPercent: () => 0,
    getMagicDamageReductionPercent: () => 0,
  };
  const context = vm.createContext(stubs);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
  vm.runInContext(src + '\nthis.calculateDamage = calculateDamage; this.DAMAGE_TYPE = DAMAGE_TYPE;', context);
  const { calculateDamage, DAMAGE_TYPE } = context;

  const target = { magicResist: 100 };
  const noPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target });
  assert(Math.abs(noPen - 200 * 100 / 200) < 1e-6, 'baseline magic damage formula unaffected when no pen present');

  const attacker = { championId: 'ashe', itemBonusMagicPenFlat: 12 };
  const withFlatPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target, source: attacker });
  const expectedMr = 100 - 12;
  assert(Math.abs(withFlatPen - 200 * 100 / (100 + expectedMr)) < 1e-6, 'explicit source.itemBonusMagicPenFlat reduces MR before percent pen');

  // Fallback to global controller when source isn't passed (mirrors the omnivamp fix).
  stubs2: {
    context.controller = { championId: 'ashe', itemBonusMagicPenFlat: 12 };
  }
  const withControllerFallback = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target });
  assert(Math.abs(withControllerFallback - 200 * 100 / (100 + expectedMr)) < 1e-6, 'falls back to global controller for flat magic pen when source is omitted');
}

// ---------- Part C: applyStatus() tenacity / slow resist ----------
{
  const stubs = {
    performance: { now: () => now },
    console,
    controller: null,
    refreshUnitCcTags: () => {},
  };
  const context = vm.createContext(stubs);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8');
  vm.runInContext(src + '\nthis.applyStatus = applyStatus; this.getStatus = getStatus;', context);
  const { applyStatus, getStatus } = context;

  now = 50000;
  const playerNoItems = { statusEffects: [] };
  const rec1 = applyStatus(playerNoItems, { id: 'testStun', type: 'STUN', duration: 2.0, value: 0 });
  assert(rec1.duration === 2.0, 'no tenacity: stun duration unchanged');

  const playerTenacity = { statusEffects: [], itemTenacityPercent: 0.30 };
  const rec2 = applyStatus(playerTenacity, { id: 'testStun2', type: 'STUN', duration: 2.0, value: 0 });
  assert(Math.abs(rec2.duration - 2.0 * 0.7) < 1e-9, 'tenacity reduces STUN duration by its percent');

  // Tenacity explicitly does NOT apply to KNOCKUP or SUPPRESSION (per Mercury's Treads text).
  const rec3 = applyStatus(playerTenacity, { id: 'testKnockup', type: 'KNOCKUP', duration: 1.5, value: 0 });
  assert(rec3.duration === 1.5, 'tenacity does not reduce KNOCKUP duration');
  const rec4 = applyStatus(playerTenacity, { id: 'testSuppression', type: 'SUPPRESSION', duration: 1.5, value: 0 });
  assert(rec4.duration === 1.5, 'tenacity does not reduce SUPPRESSION duration');

  // 27차: 공중에 뜬 대상을 다시 띄우면(야스오 Q3 → R) 처음 바닥 높이를 유지한다(공중 높이를 바닥으로 기억하지 않는다).
  const airborne = { statusEffects: [], mesh: { position: { y: 0 } } };
  applyStatus(airborne, { id: 'kuA', type: 'KNOCKUP', duration: 1.0, value: 1 });
  airborne.mesh.position.y = 1.2;
  applyStatus(airborne, { id: 'kuB', type: 'KNOCKUP', duration: 1.0, value: 1 });
  assert(airborne._yasuoAirborne.baseY === 0, 're-applied KNOCKUP keeps the original ground height');

  // Slow resist reduces SLOW magnitude (value), not duration.
  const playerSlowResist = { statusEffects: [], itemSlowResistPercent: 0.25 };
  const rec5 = applyStatus(playerSlowResist, { id: 'testSlow', type: 'SLOW', duration: 3.0, value: 0.40 });
  assert(rec5.duration === 3.0, 'slow resist does not change SLOW duration');
  assert(Math.abs(rec5.value - 0.40 * 0.75) < 1e-9, 'slow resist reduces SLOW magnitude by its percent');

  // Tenacity does not affect SLOW value (different mechanic).
  const rec6 = applyStatus(playerTenacity, { id: 'testSlow2', type: 'SLOW', duration: 3.0, value: 0.40 });
  assert(rec6.value === 0.40, 'tenacity alone does not reduce SLOW magnitude');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
