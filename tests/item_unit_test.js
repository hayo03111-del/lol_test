// Node vm harness for item_system.js + item_data.js pure logic (no browser/GLB needed).
// Mirrors vision_unit_test.js's approach: module-scoped `function`/`const` in the real
// shipped code aren't exposed to window in the browser either, so this exercises the
// exact same source files via vm with minimal stubs.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 0;
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  PLAYER_TEAM: 'BLUE', // stub: pretend always inside base zone for this test
  updateGoldDisplay: () => {},
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: () => {},
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + '\nthis.ITEM_DATA = ITEM_DATA; this.recomputeItemStats = recomputeItemStats; this.buyItem = buyItem; this.sellItem = sellItem; this.itemSystemTick = itemSystemTick; this.applyItemVamp = applyItemVamp;', context);
const { ITEM_DATA, recomputeItemStats, buyItem, sellItem, itemSystemTick, applyItemVamp } = context;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

function makeFakeCtrl() {
  const ctrl = {
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 10000,
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0,
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    stats: { attackDamage: 50, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, baseAttackSpeed: 0.625, bonusAttackSpeedPercent: 0 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 50 + (this.itemBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  };
  return ctrl;
}

// 1) Buying Doran's Blade applies stats + vamp immediately.
const c1 = makeFakeCtrl();
const bought = buyItem(c1, 'doransBlade');
assert(bought === true, 'buyItem(doransBlade) succeeds');
assert(c1.gold === 10000 - 450, 'gold deducted by cost (450)');
assert(c1.stats.attackDamage === 60, 'AD +10 applied via recomputeStats');
assert(c1.maxHp === 580, 'maxHp +80 applied via recomputeStats');
assert(c1.itemAllDamageVampPercent === 0.025, 'omnivamp 2.5% summed');

// 2) applyItemVamp heals the source proportionally, capped at maxHp.
c1.hp = 500;
applyItemVamp(c1, 100); // 100 dmg * 2.5% = 2.5 heal
assert(Math.abs(c1.hp - 502.5) < 1e-9, 'applyItemVamp heals 2.5% of damage dealt');
c1.hp = 579;
applyItemVamp(c1, 1000);
assert(c1.hp === 580, 'applyItemVamp heal clamped to maxHp');

// 3) Doran's Ring minion bonus damage + mana regen passive ticks correctly.
const c2 = makeFakeCtrl();
buyItem(c2, 'doransRing');
assert(c2.itemMinionBonusDamage === 5, 'doransRing grants 5 minion bonus damage');
c2.mp = 50; // below max so regen goes to mana, not hp
now = 100000; // realistic nonzero elapsed time (performance.now() is never exactly 0 in real play)
itemSystemTick(c2, 1.0); // 1 full second, out of combat -> baseManaPerSec = 1
assert(Math.abs(c2.mp - 51) < 1e-9, 'out-of-combat mana regen +1/sec');
now += 1000;
c2._itemLastDealtChampionDamageAt = now; // just dealt champion damage -> enters combat window
itemSystemTick(c2, 1.0);
assert(Math.abs(c2.mp - 53) < 1e-9, 'in-combat mana regen +2/sec (ramped)');
// Full mana -> regen converts to HP heal at 45% of the mana value instead.
const c2b = makeFakeCtrl();
buyItem(c2b, 'doransRing');
c2b.mp = c2b.maxMp; // full
c2b.hp = 500;
now = 100000;
itemSystemTick(c2b, 1.0);
assert(Math.abs(c2b.hp - (500 + 1 * 0.45)) < 1e-9, 'full mana: heals 45% of baseManaPerSec as HP instead');

// 4) Doran's Shield base regen (4 hp/5s) + champion-damage-boosted regen (replaces base).
const c3 = makeFakeCtrl();
buyItem(c3, 'doransShield');
assert(c3.maxHp === 610, 'doransShield +110 maxHp');
c3.hp = 400;
now = 100000;
itemSystemTick(c3, 5.0); // exactly one 5s tick, no recent champion damage
assert(Math.abs(c3.hp - 404) < 1e-9, 'base regen: +4 hp per 5s tick');
// Simulate having just taken champion damage -> boosted regen replaces base regen.
c3.hp = 400;
c3._itemLastTookChampionDamageAt = now;
c3.stats.attackRange = 125; // melee-ish (<=300) -> 40 total over 8s
itemSystemTick(c3, 1.0);
assert(Math.abs(c3.hp - (400 + 40 / 8)) < 1e-9, 'melee champ-damage regen: 40 total over 8s applied per-second');
c3.hp = 400;
c3.stats.attackRange = 550; // ranged -> 30 total over 8s
itemSystemTick(c3, 1.0);
assert(Math.abs(c3.hp - (400 + 30 / 8)) < 1e-9, 'ranged champ-damage regen: 30 total over 8s applied per-second');

// 5) Doran's Bow stats + attack speed percent.
const c4 = makeFakeCtrl();
buyItem(c4, 'doransBow');
assert(c4.stats.attackDamage === 58, 'doransBow +8 AD');
assert(c4.itemBonusAttackSpeedPercent === 0.15, 'doransBow +15% AS stored');
assert(c4.itemAllDamageVampPercent === 0.015, 'doransBow omnivamp 1.5%');

// 6) Doran's Helm stats.
const c5 = makeFakeCtrl();
buyItem(c5, 'doransHelm');
assert(c5.maxHp === 650, 'doransHelm +150 maxHp');
assert(c5.stats.armor === 38, 'doransHelm +8 armor');
assert(c5.stats.magicResist === 38, 'doransHelm +8 magic resist');
assert(c5.itemMinionBonusDamage === 5, 'doransHelm grants 5 minion bonus damage');

// 7) Inventory cap (6 slots) and gold-insufficient rejection.
const c6 = makeFakeCtrl();
c6.gold = 100000;
for (const id of ['doransBlade','doransRing','doransShield','doransBow','doransHelm','doransBlade']) buyItem(c6, id);
assert(c6.items.length === 6, 'inventory fills to 6 slots');
const rejected = buyItem(c6, 'doransHelm');
assert(rejected === false, '7th item purchase rejected (inventory full)');
const c7 = makeFakeCtrl();
c7.gold = 10;
const rejectedGold = buyItem(c7, 'doransBlade');
assert(rejectedGold === false, 'purchase rejected when gold insufficient');

// 8) Sell refunds 70% and removes stats.
const c8 = makeFakeCtrl();
buyItem(c8, 'doransBlade');
const goldAfterBuy = c8.gold;
const sold = sellItem(c8, 0);
assert(sold === true, 'sellItem succeeds');
assert(c8.items.length === 0, 'item removed from inventory');
assert(c8.gold === goldAfterBuy + Math.floor(450 * 0.7), 'sell refunds 70% of cost');
assert(c8.stats.attackDamage === 50, 'AD bonus removed after sell');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
