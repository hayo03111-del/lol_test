// QA 재점검(사용자 요청: "강철인장 버그 있으면 고치고 티아멧은 하나밖에
// 못사는거 구현됐는지 보고 티아멧,히드라류 아이템의 광역공격 범위와
// 데미지,효과가 올바른지 확인하고 다른 지금까지 만들었던 아이템에
// 문제점이 있다면 고쳐줘") 검증:
// 1) 강철인장을 다시 반영하고 죽음의무도/수호천사의 recipe가 정상화됐는지
// 2) 티아맷/거대한히드라/발걸음분쇄기(hydra 계열)와 여신의 눈물/마나무네/
//    무라마나(마나순환 계열)가 "유일 아이템"으로 동작하는지
// 3) 티아맷/히드라류의 반경(radius) 값에 radiusGuessed 플래그가 붙어있어
//    "원문에 없는 추측값"임이 투명하게 드러나는지
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
  getTurretGameTimeSec: () => 0,
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  STATE: { DEAD: 'DEAD', IDLE: 'IDLE' },
  controller: null,
  applyStatus: () => {},
  findEnemiesInRadius: () => [],
  applyDamage: () => 0,
  calculateDamage: ({ rawDamage }) => Math.max(0, rawDamage),
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_ORDER = ITEM_ORDER;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.hasComponents = hasComponents;
this.combineCost = combineCost;
this.recomputeItemStats = recomputeItemStats;
`, context);
const { ITEM_DATA, ITEM_ORDER, ITEM_CATEGORIES, buyItem, buildOrBuyItem, hasComponents, combineCost } = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1000000, boots: null, team: 'BLUE', state: 'IDLE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemCullGold: 0, _itemTearState: null, _itemActiveHeals: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null, bonusAD: 0, bonusMaxHp: 0,
    _itemSheenArmed: false, _itemSheenReadyAt: 0, _itemActiveCooldownUntil: {},
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [], statusEffects: [],
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500,
    championId: 'testchamp',
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340, baseMoveSpeed: 340, percentMoveSpeedBonus: 0, flatMoveSpeedBonus: 0 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  }, overrides);
}

// ========================================================================
// 1) 강철인장 복구
// ========================================================================
{
  assert(!!ITEM_DATA.ironSeal, '강철인장: ITEM_DATA에 다시 반영됨');
  assert(ITEM_DATA.ironSeal.cost === 1100, '강철인장: 가격(1100원)은 원문 값 그대로');
  assert(ITEM_ORDER.includes('ironSeal') && ITEM_CATEGORIES.find((c) => c.id === 'epic').items.includes('ironSeal'), '강철인장: ITEM_ORDER/서사급 탭에 등록됨');

  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'longSword'); buyItem(ctrl, 'chainVest'); buyItem(ctrl, 'chainVest');
  const goldBefore = ctrl.gold;
  assert(buildOrBuyItem(ctrl, 'ironSeal') === true, '강철인장: 하위템 보유 시 조합 성공');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'ironSeal', '강철인장: 조합 후 하위템이 소모되고 완제품만 남는다');
  // 하위템 가격 합(1950, chainVest는 추측 가격)이 완제품(1100)보다 커서
  // combineCost()가 0으로 클램프된다 - 크래시나 음수 비용 없이 안전하게 처리됨을 확인.
  assert(ctrl.gold === goldBefore, '강철인장: 하위템 합이 완제품보다 비싸 조합 비용이 0으로 클램프됨(골드 추가 차감 없음)');

  const ctrl2 = makeFakeCtrl();
  buyItem(ctrl2, 'ironSeal');
  buyItem(ctrl2, 'caulfieldsWarhammer');
  assert(buildOrBuyItem(ctrl2, 'deathsDance') === true, '죽음의무도: 강철인장+콜필드의 전투망치로 정상 조합됨');
  const ctrl3 = makeFakeCtrl();
  buyItem(ctrl3, 'ironSeal');
  buyItem(ctrl3, 'bfSword');
  assert(buildOrBuyItem(ctrl3, 'guardianAngel') === true, '수호천사: 강철인장+B.F.대검으로 정상 조합됨');

  // 조합 비용 정합성(죽음의무도/수호천사 자체 완제품가 vs 하위템 합).
  const ddSum = ITEM_DATA.deathsDance.recipe.reduce((s, id) => s + ITEM_DATA[id].cost, 0);
  const gaSum = ITEM_DATA.guardianAngel.recipe.reduce((s, id) => s + ITEM_DATA[id].cost, 0);
  assert(ddSum <= ITEM_DATA.deathsDance.cost, `죽음의무도: 하위템 가격 합(${ddSum})이 완제품 가격(${ITEM_DATA.deathsDance.cost})을 넘지 않는다`);
  assert(gaSum <= ITEM_DATA.guardianAngel.cost, `수호천사: 하위템 가격 합(${gaSum})이 완제품 가격(${ITEM_DATA.guardianAngel.cost})을 넘지 않는다`);
}

// ========================================================================
// 2) 유일 아이템(uniqueGroup) - 히드라 계열
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  assert(buyItem(ctrl, 'tiamat') === true, '티아맷: 첫 구매는 성공');
  assert(buyItem(ctrl, 'tiamat') === false, '티아맷: 유일 아이템 - 두 번째 직접 구매는 차단된다');
  assert(ctrl.items.length === 1, '티아맷: 차단된 구매는 인벤토리에 추가되지 않는다');

  // 보유한 티아맷을 소모해 거대한히드라로 "업그레이드"하는 건 막지 않는다.
  buyItem(ctrl, 'tunnelers'); buyItem(ctrl, 'giantsBelt');
  assert(buildOrBuyItem(ctrl, 'titanicHydra') === true, '거대한히드라: 보유 중인 티아맷을 소모한 자연 업그레이드는 유일 아이템 검사에 막히지 않는다');
  assert(ctrl.items.some((s) => s.id === 'titanicHydra'), '거대한히드라: 조합 성공 후 인벤토리에 존재');

  // 거대한히드라를 보유한 채로 다른 히드라류를 구매/조합하면 막힌다.
  assert(buyItem(ctrl, 'tiamat') === false, '거대한히드라 보유 중: 티아맷 직접 구매가 차단된다(같은 유일 그룹)');
  buyItem(ctrl, 'devourerAxe'); buyItem(ctrl, 'dagger');
  const before = ctrl.items.length;
  assert(buildOrBuyItem(ctrl, 'hydraOfHeroism') === false, '거대한히드라 보유 중: 발걸음분쇄기 조합도 차단된다(hydraOfHeroism을 매입하려면 tiamat이 필요한데, 티아맷 자체를 못 사므로 직접 구매 경로로 빠져도 차단돼야 한다)');
  assert(ctrl.items.length === before, '거대한히드라 보유 중: 차단된 조합 시도는 인벤토리를 바꾸지 않는다');
}

// ========================================================================
// 3) 유일 아이템(uniqueGroup) - 마나순환 계열(여신의 눈물/마나무네/무라마나)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  assert(buyItem(ctrl, 'tearOfGoddess') === true, '여신의 눈물: 첫 구매는 성공');
  assert(buyItem(ctrl, 'tearOfGoddess') === false, '여신의 눈물: 유일 아이템 - 두 번째 직접 구매는 차단된다');

  buyItem(ctrl, 'caulfieldsWarhammer'); buyItem(ctrl, 'longSword');
  assert(buildOrBuyItem(ctrl, 'manamune') === true, '마나무네: 보유 중인 여신의 눈물을 소모한 자연 업그레이드는 차단되지 않는다');
  assert(buyItem(ctrl, 'tearOfGoddess') === false, '마나무네 보유 중: 여신의 눈물 직접 구매가 차단된다(같은 유일 그룹)');
}

// ========================================================================
// 4) 티아맷/히드라류 반경(radius) 값 투명성 - 원문에 없는 추측값임을 명시
// ========================================================================
{
  assert(ITEM_DATA.tiamat.cleavePassive.radiusGuessed === true, '티아맷(쪼개기): 반경이 원문에 없는 추측값임을 radiusGuessed로 명시');
  assert(ITEM_DATA.tiamat.activeAbility.radiusGuessed === true, '티아맷(초승달): 반경이 원문에 없는 추측값임을 radiusGuessed로 명시');
  assert(ITEM_DATA.titanicHydra.cleaveMaxHpPassive.radiusGuessed === true, '거대한히드라(쪼개기): 반경이 원문에 없는 추측값임을 radiusGuessed로 명시');
  assert(ITEM_DATA.hydraOfHeroism.cleaveMaxHpPassive.radiusGuessed === true, '발걸음분쇄기(쪼개기): 반경이 원문에 없는 추측값임을 radiusGuessed로 명시');
  assert(ITEM_DATA.hydraOfHeroism.shockwaveActive.radiusGuessed === true, '발걸음분쇄기(파괴의 충격파): 반경이 원문에 없는 추측값임을 radiusGuessed로 명시');
  // 수치 자체(원문에 없는 근사값)는 양수여야 한다 - 0이나 음수면 findEnemiesInRadius가 전혀 작동하지 않는다.
  assert(ITEM_DATA.tiamat.cleavePassive.radius > 0 && ITEM_DATA.titanicHydra.cleaveMaxHpPassive.radius > 0, '티아맷/거대한히드라: 반경 값이 0보다 크다(쪼개기가 실제로 작동할 수 있는 값)');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
