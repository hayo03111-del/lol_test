// Node vm harness for the extended item_system.js (object-based inventory,
// consumables, 수확의 낫/암흑의 인장/여신의 눈물). Same methodology as
// item_unit_test.js / vision_unit_test.js (module-scoped code isn't exposed
// to window in the browser, so this exercises the real shipped source files).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 100000; // realistic nonzero baseline (performance.now() is never exactly 0 in real play)
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  PLAYER_TEAM: 'BLUE',
  updateGoldDisplay: () => {},
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: () => {},
  getGrievousPercent: () => 0,
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.recomputeItemStats = recomputeItemStats;
this.buyItem = buyItem;
this.sellItem = sellItem;
this.useItem = useItem;
this.itemSystemTick = itemSystemTick;
this.applyItemVamp = applyItemVamp;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnMinionKillByPlayer = itemOnMinionKillByPlayer;
this.itemOnChampionTakedown = itemOnChampionTakedown;
this.itemOnChampionDeath = itemOnChampionDeath;
`, context);
const { ITEM_DATA, recomputeItemStats, buyItem, sellItem, useItem, itemSystemTick, applyItemVamp,
  itemOnDamageDealt, itemOnMinionKillByPlayer, itemOnChampionTakedown, itemOnChampionDeath } = context;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

function makeFakeCtrl() {
  return {
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 10000,
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    _itemGloryStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    stats: { attackDamage: 50, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 50 + (this.itemBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  };
}

// --- Health Potion: stacks up to 5 in one slot, heals over time, removed at 0.
const c1 = makeFakeCtrl();
buyItem(c1, 'healthPotion');
assert(c1.items.length === 1 && c1.items[0].count === 1, 'first health potion creates a 1-count slot');
buyItem(c1, 'healthPotion');
buyItem(c1, 'healthPotion');
assert(c1.items.length === 1 && c1.items[0].count === 3, 'buying more health potions stacks into the same slot (not new slots)');
for (let i = 0; i < 3; i++) buyItem(c1, 'healthPotion'); // 3 more -> would be 6, capped at 5
assert(c1.items[0].count === 5, 'health potion stack capped at maxStack (5)');
const rejectedStack = buyItem(c1, 'healthPotion');
assert(rejectedStack === false, 'buying beyond max stack with no other slot available is rejected');
c1.hp = 100;
useItem(c1, 0);
assert(c1.items[0].count === 4, 'using a potion consumes 1 from the stack');
itemSystemTick(c1, 15.0); // full heal duration elapsed
assert(Math.abs(c1.hp - 220) < 1e-6, 'health potion heals 120 total over 15s (100 + 120)');
// Drain the stack down to 0 and confirm the slot disappears.
useItem(c1, 0); useItem(c1, 0); useItem(c1, 0); useItem(c1, 0);
assert(c1.items.length === 0, 'slot removed once stack count reaches 0');
assert(c1._itemActiveHeals.length === 4, 'in-flight heals from the last 4 uses are still queued (not tied to inventory)');

// --- Refillable Potion: single slot, charges deplete and refill on shop use.
const c2 = makeFakeCtrl();
buyItem(c2, 'refillablePotion');
assert(c2.items.length === 1 && c2.items[0].charges === 2, 'refillable potion starts with 2 charges');
useItem(c2, 0);
assert(c2.items[0].charges === 1, 'using refillable potion consumes 1 charge');
useItem(c2, 0);
assert(c2.items[0].charges === 0, 'second use drains to 0 charges');
const rejectedUse = useItem(c2, 0);
assert(rejectedUse === false, 'using with 0 charges is rejected');
assert(c2.items.length === 1, 'refillable potion slot persists at 0 charges (not removed like health potion)');
buyItem(c2, 'healthPotion'); // any purchase = "used the shop" -> refills held refillable potions
assert(c2.items.find(s => s.id === 'refillablePotion').charges === 2, 'buying anything at the shop refills held charge items');

// --- Cull (수확의 낫): stat + on-hit heal + minion gold stacking to cap + bonus.
const c3 = makeFakeCtrl();
buyItem(c3, 'cull');
assert(c3.stats.attackDamage === 57, 'cull +7 AD applied');
assert(c3.itemOnHitHeal === 3, 'cull on-hit heal summed into itemOnHitHeal');
for (let i = 0; i < 100; i++) itemOnMinionKillByPlayer(c3);
assert(c3._itemCullGold === 100, 'cull minion gold stacks to the 100 cap');
assert(c3.gold === 10000 - 450 + 100 + 350, 'cull grants +1 gold per kill up to cap, then +350 bonus once at cap');
const goldBeforeExtra = c3.gold;
itemOnMinionKillByPlayer(c3); // already at cap -> no more gold
assert(c3.gold === goldBeforeExtra, 'no further gold granted once cull cap is reached');

// --- Dark Seal (암흑의 인장): glory stacks on takedown, lost on death, AP scales with stacks.
const c4 = makeFakeCtrl();
buyItem(c4, 'darkSeal');
assert(c4.stats.abilityPower === 15, 'darkSeal base 15 AP applied');
itemOnChampionTakedown(c4);
assert(c4._itemGloryStacks === 2, 'takedown grants 2 glory stacks');
assert(c4.stats.abilityPower === 15 + 2 * 4, 'glory stacks add +4 AP each dynamically');
for (let i = 0; i < 5; i++) itemOnChampionTakedown(c4); // would be 12, capped at 10
assert(c4._itemGloryStacks === 10, 'glory stacks capped at 10');
itemOnChampionDeath(c4);
assert(c4._itemGloryStacks === 5, 'death removes 5 glory stacks');
assert(c4.stats.abilityPower === 15 + 5 * 4, 'AP recalculated after stack loss');

// --- Tear of the Goddess (여신의 눈물): mana circulation charges + cap, doubled vs champion.
const c5 = makeFakeCtrl();
buyItem(c5, 'tearOfGoddess');
assert(c5.maxMp === 100 + 240, 'tearOfGoddess +240 mana applied');
assert(c5.itemMinionBonusDamage === 5, 'tearOfGoddess grants 도움의 손길 (+5 minion dmg)');
const dummyTarget = { isChampion: false };
const champTarget = { isChampion: true };
itemOnDamageDealt(c5, dummyTarget); // minion/non-champion hit -> +3 max mana
assert(c5._itemTearState.charges === 3, 'one charge consumed per trigger');
assert(c5._itemTearState.gained === 3, 'non-champion hit grants +3 max mana');
itemOnDamageDealt(c5, champTarget); // champion hit -> +6 max mana (double)
assert(c5._itemTearState.gained === 9, 'champion hit grants double (+6) max mana');
assert(c5.maxMp === 100 + 240 + 9, 'gained mana reflected in maxMp via recomputeItemStats');
assert(Math.abs(c5.mp - (100 + 9)) < 1e-9, 'current mp also increases by the gained amount');
// Drain remaining charges (2 left) then confirm no more triggers without recharge.
itemOnDamageDealt(c5, dummyTarget); itemOnDamageDealt(c5, dummyTarget);
assert(c5._itemTearState.charges === 0, 'all 4 charges consumed');
const gainedBeforeStarved = c5._itemTearState.gained;
itemOnDamageDealt(c5, champTarget);
assert(c5._itemTearState.gained === gainedBeforeStarved, 'no mana gain when out of charges');
// Recharge: 8s per charge.
itemSystemTick(c5, 8.0);
assert(c5._itemTearState.charges === 1, 'one charge recharges after 8s');
// Cap test: push gained near 360 and confirm it stops exactly at the cap.
c5._itemTearState.gained = 358;
c5._itemTearState.charges = 4;
itemOnDamageDealt(c5, champTarget); // would be +6 -> clamp to 360 (only +2)
assert(c5._itemTearState.gained === 360, 'mana circulation gain clamped to the 360 cap');

// --- applyItemVamp still works unchanged (regression check against the earlier Doran's tests).
const c6 = makeFakeCtrl();
buyItem(c6, 'doransBlade');
c6.hp = 500;
applyItemVamp(c6, 100);
assert(Math.abs(c6.hp - 502.5) < 1e-9, 'applyItemVamp regression: 2.5% omnivamp still works with object-based items array');

// --- sellItem refunds based on stack count.
const c7 = makeFakeCtrl();
buyItem(c7, 'healthPotion'); buyItem(c7, 'healthPotion'); buyItem(c7, 'healthPotion');
const goldBeforeSell = c7.gold;
sellItem(c7, 0);
assert(c7.gold === goldBeforeSell + Math.floor(50 * 3 * 0.7), 'selling a stacked slot refunds 70% of (cost * count)');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
