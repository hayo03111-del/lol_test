// QA 재점검(사용자 요청): "생명선 아이템은 하나밖에 못 사는 거 구현되어
// 있는지 확인하고 전설급 아이템들 고유효과 버그/미구현 확인하고... 지금
// 물리관통,방어구관통 같은것도 잘 작동하나도 확인" - 이 테스트는 그 중
// 물리 관통력(고정)/방어구 관통력(퍼센트)이 여러 아이템을 동시에 들었을
// 때도 정확히 누적/곱연산되고, 실제 calculateDamage()(00_global_constants.js
// 진짜 코드)에까지 올바르게 반영되는지를 전수 검증한다.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
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
  applyStatus: () => {},
  findEnemiesInRadius: () => [],
  applyDamage: () => 0,
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  getWorldPosition: (e) => e,
  getHorizontalDistance: () => 0,
  worldDistanceToLol: (d) => d,
  getArmorShredPercent: () => 0,
  getMagicDamageReductionPercent: () => 0,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
// 진짜 calculateDamage()(00_global_constants.js) + item_data.js + item_system.js를
// 전부 한 컨텍스트에 로드한다 - 통합 경로(아이템 구매 -> 집계 ->
// calculateDamage()) 전체를 실제 코드로 검증하기 위함.
const globalConstSrc = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(globalConstSrc + '\n' + itemDataSrc + '\n' + itemSystemSrc + `
this.calculateDamage = calculateDamage;
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.recomputeItemStats = recomputeItemStats;
`, context);
const { calculateDamage, ITEM_DATA, buyItem } = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1000000, boots: null, team: 'BLUE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
    bonusAD: 0, bonusMaxHp: 0, championId: 'testchamp', champLevel: 11,
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500,
    stats: { attackDamage: 100, armor: 30, magicResist: 30, attackRange: 125, critChance: 0 },
    recomputeStats() {
      this.maxHp = 2000 + (this.itemBonusMaxHp || 0);
      this.stats.attackDamage = 100 + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  }, overrides);
}

// ========================================================================
// 1) 고정 물리 관통력(armorPenFlat) - 여러 아이템을 동시에 들면 합연산.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  // 톱날 단검(10) + 징수의 총(10) + 요우무의 유령검(18) + 벼락폭풍검(10) +
  // 오만(18) + 요새파괴자(22) 전부 동시 보유(실제로는 불가능한 조합이지만
  // "합연산 자체가 맞는지"만 보는 단위 테스트이므로 허용 범위 밖 조합도
  // 상관없다 - buyItem()은 중복 보유 제한이 따로 없다).
  for (const id of ['serratedDirk', 'collector', 'youmuusGhostblade', 'stormsurge', 'hubris', 'fortressBreaker']) buyItem(ctrl, id);
  const expectedFlatPen = 10 + 10 + 18 + 10 + 18 + 22;
  assert(ctrl.itemBonusArmorPenFlat === expectedFlatPen, `고정 물리 관통력: 6개 아이템 동시 보유 시 정확히 합연산(${expectedFlatPen})`);

  const target = { armor: 100, magicResist: 100 };
  const dmg = calculateDamage({ rawDamage: 200, damageType: 'PHYSICAL', target, source: ctrl });
  const expectedArmor = Math.max(0, 100 - expectedFlatPen);
  assert(Math.abs(dmg - 200 * 100 / (100 + expectedArmor)) < 1e-6, '고정 물리 관통력: calculateDamage()에 정확히 반영되어 방어력이 합연산만큼 줄어든다');
}

// ========================================================================
// 2) 퍼센트 방어구 관통력(armorPenPercent) - 실제 LoL처럼 곱연산으로
// 누적되어야 한다(합연산이 아님) - itemBonusArmorPenMultiplier는 이미
// (1-관통%)의 곱으로 저장해두는 설계다.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  // 최후의 속삭임(18%) + 필멸자의 운명(30%) + 도미닉 경의 인사(35%) +
  // 세릴다의 원한(35%) 전부 동시 보유.
  for (const id of ['lastWhisper', 'mortalReminder', 'lordDominiksRegards', 'serylasGrudge']) buyItem(ctrl, id);
  const expectedMultiplier = (1 - 0.18) * (1 - 0.30) * (1 - 0.35) * (1 - 0.35);
  assert(Math.abs(ctrl.itemBonusArmorPenMultiplier - expectedMultiplier) < 1e-9, `퍼센트 방어구 관통력: 4개 아이템 동시 보유 시 (1-관통%)의 곱으로 정확히 누적(합연산 아님) - ${expectedMultiplier.toFixed(4)}`);

  const target = { armor: 100, magicResist: 100 };
  const dmg = calculateDamage({ rawDamage: 200, damageType: 'PHYSICAL', target, source: ctrl });
  const expectedArmor = 100 * expectedMultiplier;
  assert(Math.abs(dmg - 200 * 100 / (100 + expectedArmor)) < 1e-6, '퍼센트 방어구 관통력: calculateDamage()에 정확히 반영된다');

  // 실제 LoL 순서: 방어력 감소(고정→%) → 방어구 관통력(%) → 물리 관통력(고정).
  // 수정 전 테스트는 고정 관통을 먼저 적용하는 잘못된 순서를 검증하고 있었다.
  const ctrl2 = makeFakeCtrl();
  buyItem(ctrl2, 'serratedDirk'); // 고정 10
  buyItem(ctrl2, 'lastWhisper'); // 퍼센트 18%
  const dmg2 = calculateDamage({ rawDamage: 200, damageType: 'PHYSICAL', target, source: ctrl2 });
  const armorAfterPercent = 100 * (1 - 0.18);
  const armorAfterBoth = armorAfterPercent - 10;
  assert(Math.abs(dmg2 - 200 * 100 / (100 + armorAfterBoth)) < 1e-6, '고정+퍼센트 관통력 혼합: 퍼센트 관통이 먼저, 고정 관통(물리 관통력)이 나중(원작 순서)');
}

// ========================================================================
// 3) 고정 마법 관통력(magicPenFlat, 마법사의 신발) - 신발은 한 켤레만
// 신을 수 있어 중복 보유 걱정은 없지만, 집계·calculateDamage() 반영 자체는 확인한다.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  ctrl.boots = null;
  // 신발은 buyItem()이 아니라 _buyBoots() 경로(isBoots:true)를 타므로 buyItem()으로 충분하다.
  buyItem(ctrl, 'sorcerersShoes');
  assert(ctrl.itemBonusMagicPenFlat === 12, '마법사의 신발: 고정 마법 관통력 12 정확히 집계');
  const target = { armor: 100, magicResist: 100 };
  const dmg = calculateDamage({ rawDamage: 200, damageType: 'MAGICAL', target, source: ctrl });
  assert(Math.abs(dmg - 200 * 100 / (100 + (100 - 12))) < 1e-6, '마법사의 신발: calculateDamage()에 고정 마법 관통력이 정확히 반영된다');
}

// ========================================================================
// 4) 아이템 미보유 시 회귀 없음(모든 관통력 0일 때 기존 공식 그대로).
// ========================================================================
{
  const target = { armor: 100, magicResist: 100 };
  const plainPhysical = calculateDamage({ rawDamage: 200, damageType: 'PHYSICAL', target });
  assert(Math.abs(plainPhysical - 200 * 100 / 200) < 1e-6, '관통력 아이템 전혀 없음: 물리 피해 공식이 기존 그대로(회귀 없음)');
  const plainMagical = calculateDamage({ rawDamage: 200, damageType: 'MAGICAL', target });
  assert(Math.abs(plainMagical - 200 * 100 / 200) < 1e-6, '관통력 아이템 전혀 없음: 마법 피해 공식이 기존 그대로(회귀 없음)');
}

// ========================================================================
// 5) QA 재점검 중 발견한 추가 버그 재확인 - 원문에 구조물 제외가 없는데
// 들어가 있던 가드 2건(곡궁 독침/마법사의 최후 쪼기, 경계 그림자) +
// 무라마나 "충격"의 기본 공격 분기가 원문대로 챔피언 전용인지.
// 가벼운 스텁(item_data.js+item_system.js만)으로 별도 컨텍스트를 쓴다.
// ========================================================================
{
  const dealtDamages2 = [];
  const stubs2 = {
    performance: { now: () => now }, console,
    isPositionInBaseZone: () => true, updateGoldDisplay: () => {}, updateItemUI: () => {}, updateBars: () => {},
    getTurretGameTimeSec: () => 0, PLAYER_TEAM: 'BLUE',
    DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
    STATE: { DEAD: 'DEAD', IDLE: 'IDLE', MOVE: 'MOVE', ATTACK: 'ATTACK' },
    controller: null, applyStatus: () => {}, findEnemiesInRadius: () => [],
    applyDamage: (target, result) => { dealtDamages2.push({ target, result }); target.hp = Math.max(0, (target.hp || 0) - result.rawDamage); return result.rawDamage; },
    calculateDamage: ({ rawDamage }) => Math.max(0, rawDamage),
    computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
    getWorldPosition: (e) => e, getHorizontalDistance: () => 0, worldDistanceToLol: (d) => d,
    THREE: { Vector3: class {} }, scene: { add(){}, remove(){} }, visionSystem: { grantVision(){} },
  };
  const ctx2 = vm.createContext(stubs2);
  vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
`, ctx2);
  const { buyItem: buyItem2, itemOnBasicAttackHit } = ctx2;

  function makeCtrl2(overrides = {}) {
    return Object.assign({
      root: { position: { x: 0, y: 0, z: 0 } }, items: [], gold: 1000000, boots: null, team: 'BLUE',
      itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0, itemBonusArmor: 0, itemBonusMr: 0,
      itemBonusAttackSpeedPercent: 0, itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
      itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
      itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
      itemSlowResistPercent: 0, itemTenacityPercent: 0, itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0,
      itemPhysicalVampPercent: 0, itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1,
      itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
      bonusAD: 0, bonusMaxHp: 0, championId: 'testchamp', champLevel: 11,
      hp: 2000, maxHp: 2000, mp: 500, maxMp: 500,
      stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0 },
      recomputeStats() {
        this.maxHp = 2000 + (this.itemBonusMaxHp || 0); this.maxMp = 500 + (this.itemBonusMana || 0);
        this.stats.attackDamage = 100 + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0);
        this.stats.abilityPower = this.itemBonusAP || 0;
        this.stats.armor = 30 + (this.itemBonusArmor || 0); this.stats.magicResist = 30 + (this.itemBonusMr || 0);
      },
    }, overrides);
  }
  const turret = { isChampion: false, isTurret: true, hp: 5000, maxHp: 5000, statusEffects: [] };
  const minion = { isChampion: false, isMinion: true, hp: 500, maxHp: 500, statusEffects: [] };
  const champ = { isChampion: true, hp: 1000, maxHp: 1000, statusEffects: [] };

  const ctrlBow = makeCtrl2();
  buyItem2(ctrlBow, 'recurveBow');
  dealtDamages2.length = 0;
  itemOnBasicAttackHit(ctrlBow, turret, false);
  assert(dealtDamages2.length === 1, '버그 수정(곡궁 독침): 원문에 구조물 제외가 없어 포탑 대상에게도 적용된다');

  const ctrlWits = makeCtrl2();
  buyItem2(ctrlWits, 'witsEnd');
  dealtDamages2.length = 0;
  itemOnBasicAttackHit(ctrlWits, turret, false);
  assert(dealtDamages2.length === 1, '버그 수정(마법사의 최후 쪼기): 원문에 구조물 제외가 없어 포탑 대상에게도 적용된다');

  const ctrlVig = makeCtrl2();
  buyItem2(ctrlVig, 'vigilance');
  dealtDamages2.length = 0;
  itemOnBasicAttackHit(ctrlVig, turret, false);
  assert(dealtDamages2.length === 1, '버그 수정(경계 그림자): 원문에 구조물 제외가 없어 포탑 대상에게도 적용된다');

  const ctrlMura = makeCtrl2();
  buyItem2(ctrlMura, 'manamune');
  ctrlMura.items[0].id = 'muramana'; // 조합 없이 직접 변신시켜 테스트
  dealtDamages2.length = 0;
  itemOnBasicAttackHit(ctrlMura, minion, false);
  assert(dealtDamages2.length === 0, '버그 수정(무라마나 충격): 원문이 "챔피언에게"로 한정하므로 미니언 대상에는 발동하지 않는다(이전엔 구조물만 제외해 미니언에도 잘못 발동했었다)');
  dealtDamages2.length = 0;
  itemOnBasicAttackHit(ctrlMura, champ, false);
  assert(dealtDamages2.length === 1, '무라마나 충격: 챔피언 대상에는 정상적으로 발동한다');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
