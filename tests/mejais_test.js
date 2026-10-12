// 메자이의 영혼약탈자(Mejai's Soulstealer) - 사용자 요청: "메자이 만들
// 때는 암흑의 인장이랑 스택 잘 잇고 버그없게 잘 만들어줘". 이 테스트는
// 특히 "암흑의 인장으로 쌓은 중첩이 메자이의 영혼약탈자로 업그레이드한
// 뒤에도 정확히 이어지는지"와, 그 과정에서 QA로 발견한 itemOnChampionTakedown()/
// itemOnChampionDeath()의 'darkSeal' 하드코딩 버그가 완전히 고쳐졌는지를
// 집중적으로 검증한다.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const stubs = {
  performance: { now: () => 1000000 },
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
  calculateDamage: ({ rawDamage }) => Math.max(0, rawDamage),
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  getWorldPosition: (e) => e,
  getHorizontalDistance: () => 0,
  worldDistanceToLol: (d) => d,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemOnChampionTakedown = itemOnChampionTakedown;
this.itemOnChampionDeath = itemOnChampionDeath;
`, context);
const { ITEM_DATA, ITEM_CATEGORIES, buyItem, buildOrBuyItem, recomputeItemStats, itemOnChampionTakedown, itemOnChampionDeath } = context;

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
    _itemGloryStacks: 0, _itemSlaughterStacks: 0,
    bonusAD: 0, bonusMaxHp: 0, championId: 'testchamp',
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500,
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0 },
    recomputeStats() {
      this.maxHp = 2000 + (this.itemBonusMaxHp || 0);
      this.stats.attackDamage = 100 + (this.itemBonusAD || 0);
      this.stats.abilityPower = this.itemBonusAP || 0;
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
    },
  }, overrides);
}

// ========================================================================
// 1) 데이터/상점 등록 확인
// ========================================================================
{
  assert(!!ITEM_DATA.mejaisSoulstealer, '메자이의 영혼약탈자: ITEM_DATA에 반영됨');
  assert(ITEM_CATEGORIES.find((c) => c.id === 'legendary').items.includes('mejaisSoulstealer'), '메자이의 영혼약탈자: 전설급 탭에 등록됨');
  const sum = ITEM_DATA.mejaisSoulstealer.recipe.reduce((s, c) => s + ITEM_DATA[c].cost, 0);
  assert(sum <= ITEM_DATA.mejaisSoulstealer.cost, `메자이의 영혼약탈자: 하위템 가격 합(${sum})이 완제품 가격(1500)을 넘지 않는다`);
}

// ========================================================================
// 2) 암흑의 인장 단독 - 기존 동작이 전혀 깨지지 않았는지(회귀 확인).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'darkSeal');
  itemOnChampionTakedown(ctrl);
  assert(ctrl._itemGloryStacks === 2 && Math.abs(ctrl.itemBonusAP - 15 - 2 * 4) < 1e-9, '암흑의 인장(회귀): 처치 관여 시 중첩 2, 주문력 = 기본15+중첩당4*2=23');
  for (let i = 0; i < 10; i++) itemOnChampionTakedown(ctrl);
  assert(ctrl._itemGloryStacks === 10, '암흑의 인장(회귀): 최대 10중첩에서 더 늘지 않는다');
  itemOnChampionDeath(ctrl);
  assert(ctrl._itemGloryStacks === 5, '암흑의 인장(회귀): 사망 시 5중첩 소실(10->5)');
}

// ========================================================================
// 3) 핵심 - 암흑의 인장으로 쌓은 중첩이 메자이의 영혼약탈자로 업그레이드한
// 뒤에도 그대로 이어지고, 더 커진 상한(25)까지 계속 쌓이는지.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'darkSeal');
  for (let i = 0; i < 3; i++) itemOnChampionTakedown(ctrl); // 2*3=6중첩
  assert(ctrl._itemGloryStacks === 6, '사전조건: 암흑의 인장으로 6중첩까지 쌓음');

  const result = buildOrBuyItem(ctrl, 'mejaisSoulstealer');
  assert(result === true, '메자이의 영혼약탈자: 암흑의 인장을 소모해 정상 조합된다');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'mejaisSoulstealer', '메자이의 영혼약탈자: 조합 후 암흑의 인장이 사라지고 완제품만 남는다');
  assert(ctrl._itemGloryStacks === 6, '핵심 확인: 조합(업그레이드) 후에도 기존 6중첩이 그대로 유지된다(ctrl 레벨 상태라 암흑의 인장 소모와 무관)');
  // 메자이의 영혼약탈자 자체 스탯(주문력20) + 중첩당 5주문력*6 = 20+30=50.
  assert(Math.abs(ctrl.itemBonusAP - 50) < 1e-9, '핵심 확인: 업그레이드 직후 중첩 6개가 메자이의 영혼약탈자의 주문력(중첩당 5)으로 즉시 반영된다(20+6*5=50)');
  // 10중첩 문턱 미만이라 아직 이동속도 보너스 없음.
  assert(ctrl.itemBonusMoveSpeedPercent === 0, '메자이의 영혼약탈자: 10중첩 미만이면 이동속도 보너스가 없다');

  // 버그 수정 재확인 - 업그레이드 후에도 처치 시 계속 중첩이 쌓이는지
  // (이전 버전이었다면 'darkSeal' 하드코딩 때문에 여기서 전혀 쌓이지
  // 않았을 것).
  for (let i = 0; i < 2; i++) itemOnChampionTakedown(ctrl); // 메자이는 처치당 4중첩 -> +8
  assert(ctrl._itemGloryStacks === 14, '버그 수정 확인: 업그레이드 후에도 처치 시 메자이 자신의 중첩량(4)만큼 계속 쌓인다(6+4*2=14) - 예전 같으면 하드코딩 때문에 여기서 멈춰 있었을 것');
  assert(Math.abs(ctrl.itemBonusAP - (20 + 14 * 5)) < 1e-9, '14중첩 시 주문력 = 20+14*5=90');
  assert(Math.abs(ctrl.itemBonusMoveSpeedPercent - 0.10) < 1e-9, '메자이의 영혼약탈자: 10중첩 이상(14)이 되면 이동속도 +10%가 적용된다');

  // 25중첩 상한(암흑의 인장의 10이 아니라 메자이 자신의 25) 확인.
  for (let i = 0; i < 10; i++) itemOnChampionTakedown(ctrl); // 14+4*10=54 -> 25에서 캡
  assert(ctrl._itemGloryStacks === 25, '버그 수정 확인: 상한도 메자이 자신의 값(25)을 쓴다(암흑의 인장의 10이 아님)');

  // 사망 시 메자이 자신의 소실량(10)을 쓰는지(암흑의 인장의 5가 아님).
  itemOnChampionDeath(ctrl);
  assert(ctrl._itemGloryStacks === 15, '버그 수정 확인: 사망 시 메자이 자신의 소실량(10)만큼 줄어든다(25-10=15, 암흑의 인장의 5가 아님)');
  assert(Math.abs(ctrl.itemBonusMoveSpeedPercent - 0.10) < 1e-9, '15중첩(10 이상)이라 이동속도 보너스는 유지된다');

  // 10중첩 밑으로 떨어지면 이동속도 보너스가 사라지는지.
  itemOnChampionDeath(ctrl); // 15-10=5
  assert(ctrl._itemGloryStacks === 5 && ctrl.itemBonusMoveSpeedPercent === 0, '5중첩(10 미만)으로 떨어지면 이동속도 보너스가 사라진다');
}

// ========================================================================
// 4) 메자이의 영혼약탈자를 팔면(둘 다 없으면) 더 이상 스탯에 반영되지
// 않지만, 중첩 자체는 암흑의 인장 때와 동일하게 남아있는지.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'mejaisSoulstealer');
  itemOnChampionTakedown(ctrl);
  assert(ctrl._itemGloryStacks === 4, '메자이의 영혼약탈자 단독 구매: 처치 시 중첩 4');
  const apWithItem = ctrl.itemBonusAP;
  ctrl.items = [];
  recomputeItemStats(ctrl);
  assert(ctrl._itemGloryStacks === 4 && ctrl.itemBonusAP === 0, `메자이의 영혼약탈자를 팔면(인벤토리에서 제거) 중첩(4)은 암흑의 인장 때와 동일하게 그대로 남지만, 더 이상 스탯(주문력 ${apWithItem}->0)에는 반영되지 않는다`);
  // 둘 다 없는 상태에서 처치해도(혹은 사망해도) 범용 탐색이 아무것도
  // 찾지 못해 조용히 무시되는지(에러 없이 안전하게 동작).
  itemOnChampionTakedown(ctrl);
  assert(ctrl._itemGloryStacks === 4, '아이템이 없으면 처치해도 중첩이 더 쌓이지 않는다(그대로 4)');
  itemOnChampionDeath(ctrl);
  assert(ctrl._itemGloryStacks === 4, '아이템이 없으면 사망해도 중첩 손실 기준이 없어 그대로 유지된다(보수적 처리)');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
