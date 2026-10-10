// Node vm harness for the 3rd item-system round: ability haste / crit chance /
// hp&mp regen percent stats, basic items, trinket (투명 와드) placement +
// recharge + expiry. Same vm methodology as the earlier rounds.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 100000;
let gameTimeSec = 0;

class FakeVec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new FakeVec3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  normalize() { const len = Math.hypot(this.x, this.y, this.z) || 1; this.x /= len; this.y /= len; this.z /= len; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}

const addedMeshes = [];
const removedMeshes = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  PLAYER_TEAM: 'BLUE',
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: () => {},
  getTurretGameTimeSec: () => gameTimeSec,
  lolRangeToWorld: (r) => (r || 0) * 0.008643,
  THREE: {
    Vector3: FakeVec3,
    ConeGeometry: class {},
    MeshBasicMaterial: class {},
    Mesh: class { constructor() { this.position = new FakeVec3(); } },
  },
  scene: { add: (m) => addedMeshes.push(m), remove: (m) => removedMeshes.push(m) },
  visionSystem: { grantVision(pos, radius, dur) { this.lastGrant = { pos, radius, dur }; } },
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.recomputeItemStats = recomputeItemStats;
this.buyItem = buyItem;
this.abilityHasteCooldown = abilityHasteCooldown;
this.placeWard = placeWard;
this.itemSystemTick = itemSystemTick;
`, context);
const { ITEM_DATA, recomputeItemStats, buyItem, abilityHasteCooldown, placeWard, itemSystemTick } = context;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

function makeFakeCtrl() {
  return {
    root: { position: new FakeVec3(0, 0, 0), quaternion: {} },
    items: [], gold: 100000,
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    _itemGloryStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [],
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    stats: { attackDamage: 50, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 50 + (this.itemBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
    },
  };
}

// --- Basic items: stats applied correctly.
const c1 = makeFakeCtrl();
buyItem(c1, 'pickaxe'); assert(c1.stats.attackDamage === 75, '곡괭이 +25 AD');
const c2 = makeFakeCtrl();
buyItem(c2, 'dagger'); assert(c2.itemBonusAttackSpeedPercent === 0.25, '단검 +25% AS');
const c3 = makeFakeCtrl();
buyItem(c3, 'rubyCrystal'); assert(c3.maxHp === 650, '루비 수정 +150 HP');
const c4 = makeFakeCtrl();
buyItem(c4, 'negatronCloak'); assert(c4.stats.magicResist === 50, '마법무효화의 망토 +20 MR');
const c5 = makeFakeCtrl();
buyItem(c5, 'cloakOfAgility'); assert(c5.itemBonusCritChance === 0.15 && c5.stats.critChance === 0.15, '민첩성의 망토 +15% 크리티컬');
const c6 = makeFakeCtrl();
buyItem(c6, 'blastingWand'); assert(c6.stats.abilityPower === 45, '방출의 마법봉 +45 AP');
const c7 = makeFakeCtrl();
buyItem(c7, 'sapphireCrystal'); assert(c7.maxMp === 400, '사파이어 수정 +300 마나');
const c8 = makeFakeCtrl();
buyItem(c8, 'needlesslyLargeRod'); assert(c8.stats.abilityPower === 65, '쓸데없이 큰 지팡이 +65 AP');
const c9 = makeFakeCtrl();
buyItem(c9, 'faerieCharm'); assert(c9.itemBonusMpRegenPercent === 0.5, '요정의 부적 +50% 마나 재생');
const c10 = makeFakeCtrl();
buyItem(c10, 'rejuvenationBead'); assert(c10.itemBonusHpRegenPercent === 1.0, '원기 회복의 구슬 +100% 체력 재생');
const c11 = makeFakeCtrl();
buyItem(c11, 'amplifyingTome'); assert(c11.stats.abilityPower === 20, '증폭의 고사 +20 AP');
const c12 = makeFakeCtrl();
buyItem(c12, 'chainVest'); assert(c12.stats.armor === 45, '천갑옷 +15 방어력');
const c13 = makeFakeCtrl();
buyItem(c13, 'bfSword'); assert(c13.stats.attackDamage === 90, 'B.F. 대검 +40 AD');
const c14 = makeFakeCtrl();
buyItem(c14, 'glowingMote'); assert(c14.itemBonusAbilityHaste === 5, '빛나는 티끌 +5 스킬 가속');
const c15 = makeFakeCtrl();
buyItem(c15, 'longSword'); assert(c15.stats.attackDamage === 60, '롱소드 +10 AD');

// --- Ability haste cooldown formula.
const c16 = makeFakeCtrl();
buyItem(c16, 'glowingMote'); // +5 AH
const cd = abilityHasteCooldown(c16, 10);
assert(Math.abs(cd - 10 * 100 / 105) < 1e-9, 'abilityHasteCooldown applies cd*100/(100+AH)');
const c17 = makeFakeCtrl();
assert(abilityHasteCooldown(c17, 10) === 10, 'no ability haste -> cooldown unchanged');

// --- Trinket (투명 와드): placement, range clamp, charges, vision grant, recharge, expiry.
const c18 = makeFakeCtrl();
gameTimeSec = 0; // early game -> duration 90s, recharge 170s
const placed = placeWard(c18, new FakeVec3(100, 0, 0)); // well within 550 range (~4.76 world units -> far less than 100 world units is huge, so this will clamp)
assert(placed === true, 'placeWard succeeds with charges available');
assert(c18.trinket.charges === 1, 'placing a ward consumes 1 charge');
assert(c18._placedWards.length === 1, 'ward registered in _placedWards');
assert(Math.abs(stubs.visionSystem.lastGrant.dur - 90) < 1e-6, 'early game ward duration is 90s');
assert(stubs.visionSystem.lastGrant.radius === 900, 'ward grants 900 vision radius');
// Range clamp: click far beyond 550 range -> landing point clamped to max range from origin.
const maxWorldRange = stubs.lolRangeToWorld(550);
const dist = Math.hypot(c18._placedWards[0].position.x - 0, c18._placedWards[0].position.z - 0);
assert(Math.abs(dist - maxWorldRange) < 1e-6, 'ward placement clamped to max placeRange (550) when clicked beyond range');

placeWard(c18, new FakeVec3(1, 0, 0));
assert(c18.trinket.charges === 0, 'second placement uses the last charge');
const rejected = placeWard(c18, new FakeVec3(1, 0, 0));
assert(rejected === false, 'placing with 0 charges is rejected');

// Recharge: early-game recharge is 170s.
itemSystemTick(c18, 170.0);
assert(c18.trinket.charges === 1, 'trinket recharges 1 charge after 170s at game time 0');

// Late-game duration/recharge scaling.
const c19 = makeFakeCtrl();
gameTimeSec = 1200; // at or beyond the 20-minute full-scale point
placeWard(c19, new FakeVec3(1, 0, 0));
assert(Math.abs(stubs.visionSystem.lastGrant.dur - 120) < 1e-6, 'late game ward duration scales up to 120s');
itemSystemTick(c19, 90.0);
assert(c19.trinket.charges === 2, 'late game recharge is 90s (full charge restored after 90s, starting from 1/2)');

// Ward expiry removes the mesh after its duration elapses.
const c20 = makeFakeCtrl();
gameTimeSec = 0;
now = 0;
placeWard(c20, new FakeVec3(1, 0, 0));
assert(addedMeshes.length > 0, 'placing a ward adds a mesh to the scene');
const meshCountBefore = removedMeshes.length;
now = 91 * 1000; // past the 90s early-game duration
itemSystemTick(c20, 0.016);
assert(c20._placedWards.length === 0, 'expired ward removed from _placedWards');
assert(removedMeshes.length === meshCountBefore + 1, 'expired ward mesh removed from the scene');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
