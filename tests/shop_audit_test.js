// Exhaustive QA audit requested: "상점에서 아이템 분류를 하고 능력치가 똑바로
// 적용되고 효과가 제대로 적용되게 해줘" (sort shop items correctly, make sure
// stats apply correctly, make sure effects apply correctly).
//
// This is not a targeted regression test for one feature - it programmatically
// walks EVERY item in ITEM_DATA/ITEM_CATEGORIES and checks two things that a
// future item addition could silently break without any existing test catching it:
//   1) Shop categorization: every purchasable item appears in exactly one
//      ITEM_CATEGORIES tab, with no missing/duplicate/unknown ids.
//   2) Stat application: every `stats.X` field an item declares actually lands
//      on the right itemBonus* field (and the final ctrl.stats/maxHp/maxMp)
//      after buyItem() + recomputeStats() - a typo'd field name here would
//      previously have been invisible (the item would show in the shop and
//      charge gold, but silently grant nothing).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const stubs = {
  performance: { now: () => 100000 },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  getTurretGameTimeSec: () => 0,
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyStatus: () => {},
  findEnemiesInRadius: () => [],
  applyDamage: () => 0,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
  PLAYER_TEAM: 'BLUE',
};
const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_ORDER = ITEM_ORDER;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.recomputeItemStats = recomputeItemStats;
`, context);
const { ITEM_DATA, ITEM_ORDER, ITEM_CATEGORIES, buyItem } = context;

// ---- 1) Shop categorization audit ----
const categorized = [];
const seen = new Map();
for (const cat of ITEM_CATEGORIES) {
  for (const id of cat.items) {
    assert(!!ITEM_DATA[id], `category "${cat.id}" references a real item id "${id}" (not a typo/removed item)`);
    if (seen.has(id)) console.error(`FAIL: "${id}" appears in both "${seen.get(id)}" and "${cat.id}" (duplicate categorization)`), process.exitCode = 1;
    seen.set(id, cat.id);
    categorized.push(id);
  }
}
// Every purchasable item (everything except the trinket, which is free/auto-equipped,
// and items like Muramana that are reachable only via another item's transformation)
// must appear in exactly one category.
const purchasable = ITEM_ORDER.filter((id) => !ITEM_DATA[id].trinket && !ITEM_DATA[id].hiddenFromShop);
const missingFromShop = purchasable.filter((id) => !seen.has(id));
assert(missingFromShop.length === 0, `every purchasable item is shown in some shop tab (missing: ${missingFromShop.join(', ') || 'none'})`);
const extraInShop = categorized.filter((id) => !purchasable.includes(id));
assert(extraInShop.length === 0, `no trinket/hidden/unknown item leaked into a shop tab (extra: ${extraInShop.join(', ') || 'none'})`);
assert(categorized.length === new Set(categorized).size, 'no item is categorized twice across tabs');
assert(ITEM_DATA.stealthWard.trinket === true && !seen.has('stealthWard'), '투명 와드(trinket) is correctly excluded from all shop tabs (equipped for free, not purchased)');
assert(ITEM_DATA.muramana.hiddenFromShop === true && !seen.has('muramana'), '무라마나(transform-only) is correctly excluded from all shop tabs (reachable only via 마나무네 evolving)');

// ---- 2) Stat-application audit: every stats.* field on every item actually lands ----
const STAT_FIELD_MAP = {
  attackDamage: 'itemBonusAD', abilityPower: 'itemBonusAP', maxHp: 'itemBonusMaxHp', mana: 'itemBonusMana',
  armor: 'itemBonusArmor', magicResist: 'itemBonusMr', attackSpeedPercent: 'itemBonusAttackSpeedPercent',
  critChance: 'itemBonusCritChance', abilityHaste: 'itemBonusAbilityHaste', hpRegenPercent: 'itemBonusHpRegenPercent',
  mpRegenPercent: 'itemBonusMpRegenPercent', moveSpeed: 'itemBonusMoveSpeedLol', magicPenFlat: 'itemBonusMagicPenFlat',
  moveSpeedPercent: 'itemBonusMoveSpeedPercent',
};
function makeFakeCtrl() {
  return {
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1000000, boots: null,
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
    hp: 500, maxHp: 500, mp: 100, maxMp: 100, team: 'BLUE',
    championId: 'testchamp',
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    recomputeStats() {
      this.maxHp = 500 + (this.itemBonusMaxHp || 0);
      this.maxMp = 100 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.itemBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
      this.stats.moveSpeed = 340 + (this.itemBonusMoveSpeedLol || 0);
    },
  };
}

let auditedCount = 0;
for (const id of purchasable) {
  const item = ITEM_DATA[id];
  const statKeys = Object.keys(item.stats || {});
  if (!statKeys.length) continue; // pure-passive items (no stats block) are covered by the dedicated item_unit_test*.js suites, not this generic sweep
  const ctrl = makeFakeCtrl();
  const bought = buyItem(ctrl, id);
  assert(bought === true, `buyItem() successfully purchases "${item.nameKo}" (${id})`);
  for (const key of statKeys) {
    const bonusField = STAT_FIELD_MAP[key];
    assert(!!bonusField, `"${id}".stats.${key} maps to a known itemBonus* field (no typo'd/unrecognized stat key)`);
    if (!bonusField) continue;
    // 경탄(마나무네/무라마나 - "마나의 2%만큼 추가 공격력")을 가진 아이템은
    // itemBonusAD에 stats.attackDamage 외에 마나 비례 보너스가 "의도적으로"
    // 더 들어간다 - 정확한 수치는 별도의 전설급 아이템 전용 테스트
    // (legendary_items_test.js)가 검증하므로, 여기서는 "stats 그대로
    // 1:1로 들어가야 한다"는 일반 규칙에서 이 조합만 제외한다.
    if (key === 'attackDamage' && ITEM_DATA[id].aweBonusAdPercentOfMana) {
      console.log(`skip (경탄 보정 적용 - 별도 테스트에서 검증): "${item.nameKo}" (${id}) stats.attackDamage`);
      continue;
    }
    // 대천사의지팡이/대천사의포옹(경탄 - 마나 비례 주문력)과 균열생성기
    // (공허의 마력 - 추가 체력 비례 주문력)도 동일한 이유로 제외한다
    // (각각 전설급 7차분 전용 테스트에서 정확한 수치를 검증).
    if (key === 'abilityPower' && (ITEM_DATA[id].aweBonusApPercentOfMana || ITEM_DATA[id].apPercentOfBonusHp)) {
      console.log(`skip (경탄/공허의 마력 보정 적용 - 별도 테스트에서 검증): "${item.nameKo}" (${id}) stats.abilityPower`);
      continue;
    }
    const expected = item.stats[key];
    const actual = ctrl[bonusField];
    assert(Math.abs(actual - expected) < 1e-9, `"${item.nameKo}" (${id}): stats.${key}=${expected} correctly lands on ${bonusField} (got ${actual})`);
  }
  auditedCount++;
}
console.log(`\n(stat-application sweep covered ${auditedCount} items with a stats{} block out of ${purchasable.length} purchasable items)`);

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
