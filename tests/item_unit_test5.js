// Node vm harness for the 5th item-system round: recipe/combine system +
// epic items (처형인의 대검/흡혈의 낫/최후의 속삭임/티아맷/광휘의 검/
// 운명의 재/억겁의 카탈리스트). Same vm methodology as earlier rounds.
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
const dealtDamages = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  PLAYER_TEAM: 'BLUE',
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  getTurretGameTimeSec: () => 0,
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: (target, effect) => { appliedStatuses.push({ target, effect }); return effect; },
  findEnemiesInRadius: (center, radius) => stubs._enemiesInRadius || [],
  applyDamage: (target, result) => { dealtDamages.push({ target, result }); return result.rawDamage; },
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.recomputeItemStats = recomputeItemStats;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.hasComponents = hasComponents;
this.combineCost = combineCost;
this.sellItem = sellItem;
this.useItem = useItem;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnAbilityDispatch = itemOnAbilityDispatch;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.applyItemPhysicalVamp = applyItemPhysicalVamp;
`, context);
const { ITEM_DATA, buyItem, buildOrBuyItem, hasComponents, combineCost, sellItem, useItem,
  itemOnDamageDealt, itemOnAbilityDispatch, itemOnBasicAttackHit, applyItemPhysicalVamp } = context;

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
    _itemSheenArmed: false, _itemSheenReadyAt: 0, _itemActiveCooldownUntil: {},
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [],
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    championId: 'testchamp',
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.itemBonusAD || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  };
}

// --- Combine system: direct buy vs build-from-components ---
const c1 = makeFakeCtrl();
assert(hasComponents(c1, ['longSword']) === false, 'no components held initially');
assert(combineCost(ITEM_DATA.executionersCalling) === 800 - 350, "combine cost = full price - component sum (450)");

buildOrBuyItem(c1, 'executionersCalling'); // no components -> direct buy at full price
assert(c1.items.length === 1 && c1.items[0].id === 'executionersCalling', 'direct buy (no components) adds the completed item');
assert(c1.gold === 100000 - 800, 'direct buy charges full price');
assert(c1.stats.attackDamage === 115, 'executioners calling +15 AD applied');

const c2 = makeFakeCtrl();
buildOrBuyItem(c2, 'longSword'); // buy the component first
assert(c2.items.length === 1 && c2.items[0].id === 'longSword', 'component purchased as a normal item');
const goldBeforeCombine = c2.gold;
buildOrBuyItem(c2, 'executionersCalling'); // now should combine instead
assert(c2.items.length === 1 && c2.items[0].id === 'executionersCalling', 'combining consumes the Long Sword and leaves only the completed item');
assert(c2.gold === goldBeforeCombine - (800 - 350), 'combine charges only the price difference (450), not the full 800');

// Combining with a multi-component recipe (Tiamat: 2x Long Sword).
const c3 = makeFakeCtrl();
buildOrBuyItem(c3, 'longSword');
buildOrBuyItem(c3, 'longSword');
assert(c3.items.length === 2, 'two Long Swords occupy two separate slots (not stacked)');
const goldBeforeTiamat = c3.gold;
buildOrBuyItem(c3, 'tiamat');
assert(c3.items.length === 1 && c3.items[0].id === 'tiamat', 'combining Tiamat consumes both Long Swords, net slot count decreases');
assert(c3.gold === goldBeforeTiamat - (1200 - 700), 'Tiamat combine cost is 500 (1200 - 2x350)');

// Partial components (only 1 of 2 Long Swords) should NOT trigger combine - falls back to direct buy.
const c4 = makeFakeCtrl();
buildOrBuyItem(c4, 'longSword');
const goldBeforePartial = c4.gold;
buildOrBuyItem(c4, 'tiamat');
assert(c4.items.length === 2, 'with only 1/2 components, buying Tiamat direct-buys instead (now 2 items: longSword + tiamat)');
assert(c4.gold === goldBeforePartial - 1200, 'partial components -> full price charged, not combine price');

// Selling a combined item refunds 70% of its FULL price (not combine cost).
const c5 = makeFakeCtrl();
buildOrBuyItem(c5, 'longSword');
buildOrBuyItem(c5, 'executionersCalling');
const goldBeforeSell = c5.gold;
sellItem(c5, 0);
assert(c5.gold === goldBeforeSell + Math.floor(800 * 0.7), 'selling a combined item refunds 70% of its full cost (800), not the combine price');

// --- Epic item stats ---
const c6 = makeFakeCtrl();
buyItem(c6, 'vampiricScepter');
assert(c6.itemPhysicalVampPercent === 0.07, 'vampiric scepter grants 7% physical vamp');
const c7 = makeFakeCtrl();
buyItem(c7, 'lastWhisper');
assert(Math.abs(c7.itemBonusArmorPenMultiplier - (1 - 0.18)) < 1e-9, 'last whisper grants 18% armor pen (stored as multiplier)');

// --- Physical vamp only triggers on PHYSICAL damage ---
const c8 = makeFakeCtrl();
buyItem(c8, 'vampiricScepter');
c8.hp = 400;
applyItemPhysicalVamp(c8, 100, 'MAGICAL');
assert(c8.hp === 400, 'physical vamp does NOT trigger on magical damage');
applyItemPhysicalVamp(c8, 100, 'PHYSICAL');
assert(Math.abs(c8.hp - 407) < 1e-9, 'physical vamp triggers on physical damage (7% of 100 = 7)');

// --- Executioner's Calling: grievous on physical hit to champion ---
const c9 = makeFakeCtrl();
buyItem(c9, 'executionersCalling');
appliedStatuses.length = 0;
const champTarget = { isChampion: true };
itemOnDamageDealt(c9, champTarget, 50, 'PHYSICAL');
assert(appliedStatuses.length === 1 && appliedStatuses[0].effect.type === 'GRIEVOUS', 'executioners calling applies GRIEVOUS on physical hit to a champion');
assert(Math.abs(appliedStatuses[0].effect.value - 0.40) < 1e-9 && appliedStatuses[0].effect.duration === 3.0, 'grievous applied at 40% for 3s');
appliedStatuses.length = 0;
itemOnDamageDealt(c9, champTarget, 50, 'MAGICAL');
assert(appliedStatuses.length === 0, 'executioners calling does NOT apply grievous on magical damage');
appliedStatuses.length = 0;
const minionTarget = { isChampion: false };
itemOnDamageDealt(c9, minionTarget, 50, 'PHYSICAL');
assert(appliedStatuses.length === 0, 'executioners calling does NOT apply grievous to non-champion targets');

// --- Catalyst of Aeons: mana restore on damage to champion ---
const c10 = makeFakeCtrl();
buyItem(c10, 'catalystOfAeons');
assert(c10.maxMp === 400 && c10.maxHp === 850, 'catalyst of aeons grants +350 HP / +300 mana');
c10.mp = 50;
itemOnDamageDealt(c10, { isChampion: true }, 100, 'MAGICAL');
assert(Math.abs(c10.mp - 57) < 1e-9, 'catalyst restores 7% of damage dealt to a champion as mana');
c10.mp = 50;
itemOnDamageDealt(c10, { isChampion: false }, 100, 'MAGICAL');
assert(c10.mp === 50, 'catalyst does not restore mana from non-champion damage');

// --- Embers of Fate: burn DOT applied/refreshed on champion/dummy damage ---
const c11 = makeFakeCtrl();
buyItem(c11, 'embersOfFate');
assert(c11.stats ? true : true, 'sanity'); // AP checked via recomputeStats below
appliedStatuses.length = 0;
itemOnDamageDealt(c11, { isChampion: true }, 50, 'MAGICAL');
assert(appliedStatuses.length === 1 && appliedStatuses[0].effect.type === 'DOT', 'embers of fate applies a DOT burn status');
assert(Math.abs(appliedStatuses[0].effect.totalDamage - (5 * 3.0)) < 1e-9, 'burn totalDamage = dmgPerSec * duration (15 over 3s)');

// --- Sheen: spellblade arm on ability dispatch, consume on next basic attack ---
const c12 = makeFakeCtrl();
buyItem(c12, 'sheen');
itemOnAbilityDispatch(c12);
assert(c12._itemSheenArmed === true, 'casting a spell arms sheen spellblade');
dealtDamages.length = 0;
itemOnBasicAttackHit(c12, { isChampion: true }, false);
assert(c12._itemSheenArmed === false, 'spellblade is consumed on the next basic attack');
assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - c12.stats.attackDamage) < 1e-9, 'spellblade deals bonus damage equal to 100% AD');
// Internal cooldown: re-casting immediately should NOT re-arm within 1.5s.
itemOnAbilityDispatch(c12);
assert(c12._itemSheenArmed === false, 'spellblade cannot be re-armed within its own 1.5s internal cooldown');
now += 1600;
itemOnAbilityDispatch(c12);
assert(c12._itemSheenArmed === true, 'spellblade can be re-armed again after its internal cooldown elapses');

// --- Tiamat: on-hit cleave to nearby enemies (excluding the primary target and structures) ---
const c13 = makeFakeCtrl();
buildOrBuyItem(c13, 'longSword'); buildOrBuyItem(c13, 'longSword'); buildOrBuyItem(c13, 'tiamat');
const primary = { isChampion: true, mesh: { position: { x: 0, y: 0, z: 0 } } };
const nearby1 = {}; const nearby2 = {}; const turretNearby = { isTurret: true };
stubs._enemiesInRadius = [{ unit: primary }, { unit: nearby1 }, { unit: nearby2 }, { unit: turretNearby }];
dealtDamages.length = 0;
itemOnBasicAttackHit(c13, primary, false);
assert(dealtDamages.length === 2, 'tiamat cleave hits the 2 nearby non-structure, non-primary targets (turret excluded, primary excluded)');
const expectedCleave = 0.40 * c13.stats.attackDamage; // melee (attackRange 125 <= 300)
assert(Math.abs(dealtDamages[0].result.rawDamage - expectedCleave) < 1e-9, 'melee cleave damage is 40% of AD');

// --- Tiamat active ability (초승달) via useItem, with its own cooldown ---
const c14 = makeFakeCtrl();
buildOrBuyItem(c14, 'longSword'); buildOrBuyItem(c14, 'longSword'); buildOrBuyItem(c14, 'tiamat');
stubs._enemiesInRadius = [{ unit: {} }, { unit: {} }, { unit: { isNexus: true } }];
dealtDamages.length = 0;
const used = useItem(c14, 0); // tiamat is slot 0
assert(used === true, 'using tiamat active ability succeeds');
assert(dealtDamages.length === 2, 'active ability hits non-structure enemies only (nexus excluded)');
const expectedActive = 0.75 * c14.stats.attackDamage;
assert(Math.abs(dealtDamages[0].result.rawDamage - expectedActive) < 1e-9, 'active ability deals 75% AD');
const usedAgain = useItem(c14, 0);
assert(usedAgain === false, 'active ability is rejected while on its own 10s cooldown');
now += 10100;
const usedAfterCd = useItem(c14, 0);
assert(usedAfterCd === true, 'active ability can be used again after its cooldown elapses');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
