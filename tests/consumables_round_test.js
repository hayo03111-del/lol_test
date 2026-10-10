// Node vm harness for "남은 소모 아이템도 만들어줘": Control Ward (제어 와드)
// + the 3 Elixirs (강철/마법/분노), sourced directly from the user's original
// uploaded item text (consumables section). Same vm methodology as earlier rounds.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 100000;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const grantedVision = [];
const dealtToTurret = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  getTurretGameTimeSec: () => 0,
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: () => {},
  findEnemiesInRadius: () => [],
  applyDamage: () => 0,
  applyDamageToTurret: (turret, result) => { dealtToTurret.push({ turret, result }); turret.hp -= result.rawDamage; return result.rawDamage; },
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;} applyQuaternion(){return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;this.x/=l;this.y/=l;this.z/=l;return this;} length(){return Math.hypot(this.x,this.y,this.z);} clone(){return new stubs.THREE.Vector3(this.x,this.y,this.z);} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} },
    ConeGeometry: class {}, MeshBasicMaterial: class {}, Mesh: class { constructor(){ this.position = { x:0,y:0,z:0, copy(){}, y:0 }; } } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision: (pos, radius, dur) => grantedVision.push({ pos, radius, dur }) },
  lolRangeToWorld: (v) => v, // identity for test simplicity
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.useItem = useItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnDamageDealtToTurret = itemOnDamageDealtToTurret;
`, context);
const { ITEM_DATA, ITEM_CATEGORIES, buyItem, useItem, recomputeItemStats, itemSystemTick, itemOnDamageDealt, itemOnDamageDealtToTurret } = context;

function makeFakeCtrl() {
  return {
    root: { position: new stubs.THREE.Vector3(0, 0, 0), quaternion: {} },
    items: [], gold: 1000000, boots: null, team: 'BLUE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMagicPenFlat: 0, itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null,
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [],
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    championId: 'testchamp',
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.itemBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  };
}

// --- Shop categorization: new consumables correctly placed ---
const consumableCat = ITEM_CATEGORIES.find((c) => c.id === 'consumable');
for (const id of ['controlWard', 'elixirOfIron', 'elixirOfSorcery', 'elixirOfWrath']) {
  assert(consumableCat.items.includes(id), `${id} is listed in the consumable shop tab`);
}

// --- Control Ward: purchase (maxStack 2) + placement ---
const c1 = makeFakeCtrl();
buyItem(c1, 'controlWard');
buyItem(c1, 'controlWard');
assert(c1.items.length === 1 && c1.items[0].count === 2, 'buying control ward twice stacks to count:2 in a single slot');
const thirdBuy = buyItem(c1, 'controlWard');
assert(thirdBuy === false && c1.items[0].count === 2, 'a 3rd control ward purchase is rejected (max 2 held, per 원문)');
grantedVision.length = 0;
const placed1 = useItem(c1, 0);
assert(placed1 === true, 'using a control ward from inventory succeeds');
assert(c1.items[0].count === 1, 'placing one control ward consumes one count (1 left)');
assert(grantedVision.length === 1 && grantedVision[0].radius === 900, 'placing a control ward grants vision with the expected radius (900, real LoL value - not given in the source text)');
assert(c1._placedWards.length === 1, 'the placed control ward is tracked in _placedWards (reuses the same ward-marker system as stealth ward)');
useItem(c1, 0);
assert(c1.items.length === 0, 'placing the last control ward removes the item slot entirely (count reaches 0)');

// --- Elixir of Iron: stat buff + duration + mutual exclusivity ---
const c2 = makeFakeCtrl();
buyItem(c2, 'elixirOfIron');
assert(c2.items.length === 1, 'elixir of iron purchased into inventory');
const usedIron = useItem(c2, 0);
assert(usedIron === true && c2.items.length === 0, 'drinking the elixir consumes it immediately (no charges/stacking)');
assert(c2._itemActiveElixir && c2._itemActiveElixir.id === 'elixirOfIron', 'drinking elixir of iron sets the active elixir state');
assert(c2.maxHp === 800 && Math.abs(c2.itemTenacityPercent - 0.25) < 1e-9, 'elixir of iron grants +300 max HP and +25% tenacity while active');

// Drinking a DIFFERENT elixir clears the old one's bonus (원문: "다른 종류의 영약을 마시면 기존 영약의 효과가 사라집니다").
buyItem(c2, 'elixirOfWrath');
useItem(c2, 0);
assert(c2._itemActiveElixir.id === 'elixirOfWrath', 'drinking a different elixir replaces the active elixir');
assert(c2.maxHp === 500 && c2.itemTenacityPercent === 0, "elixir of iron's bonus (+300 HP/+25% tenacity) is gone once a different elixir is drunk");
assert(c2.stats.attackDamage === 130, 'elixir of wrath grants +30 AD while active');

// --- Elixir expiry (itemSystemTick -> _itemTickElixirExpiry) ---
now += 181000; // past the 180s duration
itemSystemTick(c2, 0);
assert(c2._itemActiveElixir === null, 'the active elixir clears itself once its duration expires');
assert(c2.stats.attackDamage === 100, 'the AD bonus is removed once the elixir expires');

// --- Elixir of Sorcery: stat buff + on-hit flat damage with champion-only ICD ---
now = 200000;
const c3 = makeFakeCtrl();
buyItem(c3, 'elixirOfSorcery');
useItem(c3, 0);
assert(c3.stats.abilityPower === 50 && Math.abs(c3.itemBonusMpRegenPercent - 0.15) < 1e-9, 'elixir of sorcery grants +50 AP and +15% mana regen while active');
const champTarget = { isChampion: true, isTrainingDummy: true, hp: 1000, maxHp: 1000 };
itemOnDamageDealt(c3, champTarget, 50, 'PHYSICAL');
assert(champTarget.hp === 975, 'elixir of sorcery deals its +25 flat proc damage to a champion target on any hit');
itemOnDamageDealt(c3, champTarget, 50, 'PHYSICAL'); // immediately again, still within the 5s ICD
assert(champTarget.hp === 975, "the proc does NOT refire within its 5s internal cooldown against a champion (원문: '챔피언이 대상일 경우 재사용대기시간 5초')");
now += 5100;
itemOnDamageDealt(c3, champTarget, 50, 'PHYSICAL');
assert(champTarget.hp === 950, 'the proc fires again once its 5s ICD has elapsed');

// Turret path has no ICD (원문 does not mention one for turrets) and goes through the dedicated turret hook.
const turret = { hp: 1000, destroyed: false };
dealtToTurret.length = 0;
itemOnDamageDealtToTurret(c3, turret, 80);
itemOnDamageDealtToTurret(c3, turret, 80); // immediately again - no ICD for turrets
assert(dealtToTurret.length === 2, 'the sorcery proc fires on every hit against a turret (no stated ICD for turrets in the source text)');
assert(turret.hp === 1000 - 25 - 25, 'each turret proc deals the same +25 flat (TRUE) damage as the champion case');

// Minion targets are NOT mentioned in the source text for this elixir - must not proc.
const minionTarget = { isChampion: false, isMinion: true, hp: 100, maxHp: 100 };
itemOnDamageDealt(c3, minionTarget, 50, 'PHYSICAL');
assert(minionTarget.hp === 100, 'elixir of sorcery does not proc its flat damage against minions (not stated in 원문)');

// --- Elixir of Wrath: champion-only physical lifesteal ---
const c4 = makeFakeCtrl();
buyItem(c4, 'elixirOfWrath');
useItem(c4, 0);
c4.hp = 400;
itemOnDamageDealt(c4, { isChampion: true }, 100, 'PHYSICAL');
assert(Math.abs(c4.hp - 412) < 1e-9, "elixir of wrath heals 12% of physical damage dealt to a champion (400 + 100*0.12 = 412)");
c4.hp = 400;
itemOnDamageDealt(c4, { isChampion: true }, 100, 'MAGICAL');
assert(c4.hp === 400, 'elixir of wrath does NOT trigger on magical damage (원문: "물리 피해 흡혈")');
c4.hp = 400;
itemOnDamageDealt(c4, { isChampion: false, isMinion: true }, 100, 'PHYSICAL');
assert(c4.hp === 400, 'elixir of wrath does NOT trigger on non-champion (minion) targets (원문: "챔피언 대상")');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
