// 전체 아이템 시스템 전수 fuzz 테스트(QA - "버그/미구현사항을 찾고
// 고쳐줘") - 개별 아이템 단위 테스트(item_unit_test*.js 등)는 "이
// 아이템이 정확히 이 수치로 동작하는가"를 보지만, 이 테스트는 그와
// 다른 질문을 묻는다: "ITEM_DATA에 있는 156개 아이템 전부를 하나씩
// 구매해서 모든 공용 훅(평타/피해/CC/틱/레벨업/사용/사망)에 밀어 넣어도
// 예외가 나거나 스탯이 NaN으로 오염되지 않는가?" 새 아이템을 추가할 때
// 필드명 오탈자나 깜빡한 null 체크 같은 걸 개별 테스트로는 놓치기 쉬운데,
// 이 전수 스윕은 그런 걸 기계적으로 잡아낸다(실제로 작성 중 damageEnemy
// 스텁 누락을 이 방식으로 발견했다 - 스텁 문제였지 프로덕션 버그는
// 아니었지만, 프로덕션 코드에 같은 종류의 문제가 있었다면 동일하게 잡혔을 것이다).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
let gameTimeSec = 0;
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {}, updateItemUI: () => {}, updateBars: () => {},
  getTurretGameTimeSec: () => gameTimeSec,
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  STATE: { DEAD: 'DEAD', IDLE: 'IDLE', MOVE: 'MOVE', ATTACK: 'ATTACK' },
  controller: null,
  findEnemiesInRadius: () => [{ unit: { isChampion: false, isMinion: true, hp: 500, maxHp: 500, mesh: { position: { x: 0, y: 0, z: 0 } } } }],
  applyDamage: (target, result) => {
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  applyDamageToMinion: (target, result) => { target.hp = Math.max(0, (target.hp || 0) - result.rawDamage); },
  // applyDamage()가 target.takeDamage가 없으면 대신 호출하는 더미 전용 경로
  // (00_global_constants.js) - 이 테스트의 target 스텁은 플레이어가 아니라
  // 더미이므로 이 경로를 탄다. 실제 damageEnemy()는 DOM(labelDiv 등)을
  // 건드려 fuzz 테스트 목적에 맞게 hp 차감만 하는 최소 스텁으로 대체한다.
  damageEnemy: (enemy, dmg) => { if (enemy) enemy.hp = Math.max(0, (enemy.hp || 0) - dmg); },
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  refreshUnitCcTags: () => {},
  getWorldPosition: (e) => (e && e.root && e.root.position) || (e && e.mesh && e.mesh.position) || (e && e.position) || e,
  getHorizontalDistance: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)),
  worldDistanceToLol: (d) => d,
  THREE: {
    Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} clone(){return new this.constructor(this.x,this.y,this.z);} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;} applyQuaternion(){return this;} },
    ConeGeometry: class {}, MeshBasicMaterial: class {}, Mesh: class { constructor(){ this.position = { copy(){}, set(){}, y: 0 }; } },
  },
  lolRangeToWorld: (r) => r,
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8');
const constSrc = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(constSrc + '\n' + statusSrc + '\n' + itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA; this.ITEM_ORDER = ITEM_ORDER;
this.buyItem = buyItem; this.buildOrBuyItem = buildOrBuyItem; this.sellItem = sellItem;
this.recomputeItemStats = recomputeItemStats; this.itemSystemTick = itemSystemTick;
this.itemOnDamageDealt = itemOnDamageDealt; this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnAbilityDispatch = itemOnAbilityDispatch; this.itemOnTakeDamage = itemOnTakeDamage;
this.itemOnLevelUp = itemOnLevelUp; this.itemOnChampionDeath = itemOnChampionDeath;
this.itemOnManaSpent = itemOnManaSpent; this.itemOnMinionKillByPlayer = itemOnMinionKillByPlayer;
this.useItem = useItem; this.applyStatus = applyStatus; this.calculateDamage = calculateDamage;
this.DAMAGE_TYPE = DAMAGE_TYPE;
`, context);
const {
  ITEM_DATA, ITEM_ORDER, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnDamageDealt, itemOnBasicAttackHit, itemOnAbilityDispatch, itemOnTakeDamage, itemOnLevelUp,
  itemOnChampionDeath, itemOnManaSpent, itemOnMinionKillByPlayer, useItem, applyStatus,
} = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: new stubs.THREE.Vector3(0, 0, 0), quaternion: {} },
    items: [], gold: 99999999, boots: null, team: 'BLUE', state: 'IDLE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusUltimateHaste: 0,
    itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0, itemHealingReceivedBonusPercent: 0,
    itemShieldReceivedBonusPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1, itemBonusMagicPenMultiplier: 1, itemTotalApMultiplierBonus: 0,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, itemDynamicAbilityHaste: 0, _itemShieldExpiresAt: 0, shield: 0,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemTearState: null, _itemActiveHeals: [], _itemActiveManaRestores: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null, bonusAD: 0, bonusMaxHp: 0,
    _itemActiveCooldownUntil: {},
    _itemTempAttackRangeBonusLol: 0, _itemTempAttackRangeExpiresAt: 0,
    itemTempADBonus: 0, itemTempArmorBonus: 0, itemTempMrBonus: 0,
    itemTempArmorPenFlat: 0, itemTempArmorPenPercent: 0, itemTempMagicPenPercent: 0,
    itemBonusCritDamagePercent: 0,
    _itemLastDealtChampionDamageAt: 0, _itemLastTookChampionDamageAt: 0, _itemLastTookAnyDamageAt: 0,
    trinket: null, _placedWards: [], statusEffects: [], currentTarget: null,
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 9,
    championId: 'testchamp', skillPoints: 0,
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 50, armor: 30, magicResist: 30, attackRange: 125, critChance: 0.2, moveSpeed: 340 },
    _die() { this.state = 'DEAD'; },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0) + (this.itemTempADBonus || 0);
      this.stats.abilityPower = 50 + (this.itemBonusAP || 0) * (1 + (this.itemTotalApMultiplierBonus || 0));
      this.stats.armor = 30 + (this.itemBonusArmor || 0) + (this.itemTempArmorBonus || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0) + (this.itemTempMrBonus || 0);
      this.stats.critChance = 0.2 + (this.itemBonusCritChance || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } }, mesh: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

assert(ITEM_ORDER.length > 100, `ITEM_ORDER에 충분한 아이템이 있다(got ${ITEM_ORDER.length}) - 스윕 자체가 공집합을 도는 걸 방지`);

let crashCount = 0;
for (const id of ITEM_ORDER) {
  const item = ITEM_DATA[id];
  if (!item) { assert(false, id + ': ITEM_DATA에 없음(ITEM_ORDER 오탈자 의심)'); continue; }
  try {
    const ctrl = makeFakeCtrl();
    buildOrBuyItem(ctrl, id); // 신발/트린켓/변신전용 등은 막혀도 무방 - 예외만 감시
    recomputeItemStats(ctrl);
    const target = makeTarget();
    itemOnAbilityDispatch(ctrl);
    itemOnBasicAttackHit(ctrl, target, false);
    itemOnBasicAttackHit(ctrl, target, true);
    itemOnDamageDealt(ctrl, target, 50, 'PHYSICAL');
    itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
    itemOnTakeDamage(ctrl, 50, 'PHYSICAL', target);
    itemOnTakeDamage(ctrl, 50, 'MAGICAL', target);
    itemOnManaSpent(ctrl, 50);
    itemOnMinionKillByPlayer(ctrl);
    itemOnLevelUp(ctrl);
    applyStatus(target, { id: 'fuzzSlow', type: 'SLOW', duration: 1, value: 0.3, source: ctrl });
    applyStatus(target, { id: 'fuzzStun', type: 'STUN', duration: 1, value: 1, source: ctrl });
    itemSystemTick(ctrl, 0.5);
    now += 20000; gameTimeSec += 20;
    itemSystemTick(ctrl, 0.5);
    const slotIdx = ctrl.items.findIndex((s) => s.id === id);
    if (slotIdx >= 0) useItem(ctrl, slotIdx);
    target._die = function () {};
    itemOnChampionDeath(target);
    for (const k of ['attackDamage', 'abilityPower', 'armor', 'magicResist', 'critChance']) {
      if (Number.isNaN(ctrl.stats[k])) assert(false, `${id}: ctrl.stats.${k}가 NaN으로 오염됨`);
    }
    if (Number.isNaN(ctrl.hp) || Number.isNaN(ctrl.gold)) assert(false, `${id}: hp 또는 gold가 NaN으로 오염됨`);
  } catch (e) {
    crashCount++;
    assert(false, `${id}: 공용 훅 일괄 실행 중 예외 발생 -> ${e.message}`);
  }
}
assert(crashCount === 0, `156개 아이템 전수 스윕 중 크래시 0건(got ${crashCount}건)`);
console.log(`검사한 아이템: ${ITEM_ORDER.length}개`);

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
