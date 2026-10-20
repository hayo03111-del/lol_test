// Node vm harness for the "생략한것도 다 만들어" round: Catalyst of Aeons
// mana-spent-to-heal, Slightly Magical Boots carryover-on-upgrade, and
// Embers of Fate's monster(minion) burn bonus. Same vm methodology as
// earlier rounds (item_unit_test.js .. item_unit_test6.js).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 100000;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const appliedStatuses = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  PLAYER_TEAM: 'BLUE',
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  getTurretGameTimeSec: () => 0,
  getGrievousPercent: () => 0,
  getHealReceivedMultiplier: (t) => 1 + ((t && t.itemHealingReceivedBonusPercent) || 0),
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: (target, effect) => { appliedStatuses.push({ target, effect }); return effect; },
  findEnemiesInRadius: () => [],
  applyDamage: () => 0,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.recomputeItemStats = recomputeItemStats;
this.buyItem = buyItem;
this._buyBoots = _buyBoots;
this.sellBoots = sellBoots;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnManaSpent = itemOnManaSpent;
this.itemSystemTick = itemSystemTick;
`, context);
const { ITEM_DATA, buyItem, _buyBoots, sellBoots, itemOnDamageDealt, itemOnManaSpent, itemSystemTick } = context;

function makeFakeCtrl() {
  return {
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 100000, boots: null,
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMagicPenFlat: 0, itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
    _itemBootsExtraMoveSpeedLol: 0,
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [],
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    championId: 'testchamp',
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.itemBonusAD || 0);
      this.stats.moveSpeed = 340 + (this.itemBonusMoveSpeedLol || 0);
    },
  };
}

// --- Catalyst of Aeons: mana-spent -> rate-capped HoT heal ---
const c1 = makeFakeCtrl();
buyItem(c1, 'catalystOfAeons');
c1._itemActiveHeals.length = 0;
itemOnManaSpent(c1, 40); // totalHeal = 40*0.25 = 10, under the 20/s cap -> delivered in 1s flat
assert(c1._itemActiveHeals.length === 1, 'spending mana while holding catalyst registers a HoT');
assert(Math.abs(c1._itemActiveHeals[0].perSec - 10) < 1e-9, 'small mana spend: perSec = totalHeal (under cap)');
assert(Math.abs(c1._itemActiveHeals[0].remainingSec - 1) < 1e-9, 'small mana spend: duration is exactly 1s when under the rate cap');
c1.hp = 400;
itemSystemTick(c1, 1.0);
assert(Math.abs(c1.hp - 410) < 1e-6, 'the full 10 HP is delivered over 1 second');
assert(c1._itemActiveHeals.length === 0, 'the HoT entry is removed once it completes');

const c2 = makeFakeCtrl();
buyItem(c2, 'catalystOfAeons');
c2._itemActiveHeals.length = 0;
itemOnManaSpent(c2, 200); // totalHeal = 200*0.25 = 50, rate capped at 20/s -> 2.5s
assert(Math.abs(c2._itemActiveHeals[0].perSec - 20) < 1e-9, 'large mana spend: perSec is capped at 20/s');
assert(Math.abs(c2._itemActiveHeals[0].remainingSec - 2.5) < 1e-9, 'large mana spend: stretched to 2.5s to stay under the cap');
c2.hp = 400;
itemSystemTick(c2, 2.5);
assert(Math.abs(c2.hp - 450) < 1e-6, 'the full 50 HP total is still delivered, just spread out at the capped rate');

const c3 = makeFakeCtrl(); // no catalyst held
itemOnManaSpent(c3, 100);
assert(c3._itemActiveHeals.length === 0, 'spending mana without holding catalyst of aeons does nothing');

const c4 = makeFakeCtrl();
buyItem(c4, 'catalystOfAeons');
itemOnManaSpent(c4, 0);
assert(c4._itemActiveHeals.length === 0, 'zero mana spent registers no heal');

// --- Slightly Magical Boots: move speed bonus carries over when upgrading to a different pair ---
const c5 = makeFakeCtrl();
buyItem(c5, 'slightlyMagicalBoots');
assert(c5.stats.moveSpeed === 340 + 35, 'slightly magical boots grant +35 move speed while worn');
assert(c5._itemBootsExtraMoveSpeedLol === 0, 'no carryover flag yet while still wearing the original boots');
_buyBoots(c5, ITEM_DATA.berserkersGreaves); // swap to a different pair
assert(c5.boots.id === 'berserkersGreaves', 'boots slot now holds the new pair');
assert(c5._itemBootsExtraMoveSpeedLol === 10, 'swapping away from slightly magical boots locks in the +10 carryover bonus');
assert(c5.stats.moveSpeed === 340 + 45 + 10, 'new boots stats + the carried-over +10 move speed both apply');

assert(_buyBoots(c5, ITEM_DATA.sorcerersShoes) === false && c5.boots.id === 'berserkersGreaves', '90차: 완성 신발끼리 무료 교체는 막힌다(원작)');
sellBoots(c5); buyItem(c5, 'sorcerersShoes'); // 팔고 다른 완성 신발을 산다
assert(c5._itemBootsExtraMoveSpeedLol === 10, 'the carryover bonus persists through a second boots swap');
assert(c5.stats.moveSpeed === 340 + 45 + 10, 'carryover bonus still applies after swapping to yet another pair');

sellBoots(c5);
assert(c5.stats.moveSpeed === 340, 'with no boots worn at all, the carryover bonus does not apply (requires boots to be worn)');

const c6 = makeFakeCtrl(); // never owned slightly magical boots -> no carryover ever
buyItem(c6, 'berserkersGreaves');
assert(c6._itemBootsExtraMoveSpeedLol === 0, 'buying a normal pair of boots directly never sets the carryover flag');

// --- Embers of Fate: monster (minion) burn uses the higher monsterDmgPerSec ---
const c7 = makeFakeCtrl();
buyItem(c7, 'embersOfFate');
appliedStatuses.length = 0;
itemOnDamageDealt(c7, { isChampion: true, isMinion: false }, 50, 'MAGICAL');
assert(appliedStatuses.length === 1, 'embers of fate applies its burn to a champion target');
assert(Math.abs(appliedStatuses[0].effect.totalDamage - (5 * 3.0)) < 1e-9, 'champion burn uses dmgPerSec (5/s over 3s = 15 total)');
appliedStatuses.length = 0;
itemOnDamageDealt(c7, { isChampion: false, isMinion: true }, 50, 'PHYSICAL');
assert(appliedStatuses.length === 1, 'embers of fate also applies its burn to a minion target');
assert(Math.abs(appliedStatuses[0].effect.totalDamage - (15 * 3.0)) < 1e-9, 'minion burn uses the stronger monsterDmgPerSec (15/s over 3s = 45 total)');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
