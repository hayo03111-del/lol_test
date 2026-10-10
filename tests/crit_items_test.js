// Node vm harness for the "전설급 아이템" 4차분 (정수약탈자~도미닉 경의
// 인사, 치명타 계열 10종 + 하위템 4종), sourced directly from the user's
// original uploaded item text (lines 814~913). Mirrors legendary_items_test2.js's
// harness/stub conventions exactly.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 1000000;
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
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  updateBars: () => {},
  getTurretGameTimeSec: () => 0,
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  STATE: { DEAD: 'DEAD', IDLE: 'IDLE', MOVE: 'MOVE', ATTACK: 'ATTACK' },
  controller: null,
  applyStatus: (target, effect) => {
    appliedStatuses.push({ target, effect });
    target.statusEffects = target.statusEffects || [];
    const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
    const rec = { ...effect, expiresAt: now + effect.duration * 1000 };
    if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
    return rec;
  },
  findEnemiesInRadius: () => [],
  applyDamage: (target, result) => {
    dealtDamages.push({ target, result });
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  // 거리 계산 - 테스트에서는 position.x를 그대로 "LoL 단위"로 다루도록
  // worldDistanceToLol을 1:1(항등) 스텁으로 둔다(실수 변환 계수 테스트는
  // 이미 다른 라운드에서 검증됨 - 이번엔 "거리 비례 계산식"만 검증).
  getWorldPosition: (e) => (e && e.root && e.root.position) || (e && e.mesh && e.mesh.position) || (e && e.position) || e,
  getHorizontalDistance: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)),
  worldDistanceToLol: (d) => d,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};

const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_ORDER = ITEM_ORDER;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.hasComponents = hasComponents;
this.combineCost = combineCost;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnChampionTakedown = itemOnChampionTakedown;
this.itemOnChampionDeath = itemOnChampionDeath;
`, context);
const {
  ITEM_DATA, ITEM_ORDER, ITEM_CATEGORIES, buyItem, buildOrBuyItem, combineCost, recomputeItemStats,
  itemSystemTick, itemOnBasicAttackHit, itemOnDamageDealt, itemOnChampionTakedown, itemOnChampionDeath,
} = context;

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
    _itemTempAttackRangeBonusLol: 0, _itemTempAttackRangeExpiresAt: 0,
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [], statusEffects: [],
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 11,
    championId: 'testchamp',
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340, baseMoveSpeed: 340, percentMoveSpeedBonus: 0, flatMoveSpeedBonus: 0 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ========================================================================
// 하위템 4종 - 순수 스탯/조합 비용 정합성
// ========================================================================
{
  const ids = ['zealSword', 'scoutsSlingshot', 'peakArrow', 'tailFeather'];
  for (const id of ids) {
    assert(!!ITEM_DATA[id], `${id}: ITEM_DATA에 반영됨`);
    assert(ITEM_CATEGORIES.find((c) => c.id === 'epic').items.includes(id), `${id}: 서사급 탭에 등록됨`);
  }
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'zealSword');
  assert(Math.abs(ctrl.itemBonusAttackSpeedPercent - 0.15) < 1e-9 && Math.abs(ctrl.itemBonusCritChance - 0.15) < 1e-9, '열정의 검: 공격속도+15%/치명타확률+15% 정확히 적용');
}

// ========================================================================
// 조합 비용 정합성 - 10종 전부
// ========================================================================
{
  const mainIds = ['essenceReaver', 'collector', 'magicOpticsC44', 'rageblade', 'krakenSlayer', 'stormrazor', 'phantomDancer', 'rapidFireCannon', 'naboriFlickerblade', 'lordDominiksRegards'];
  for (const id of mainIds) {
    const item = ITEM_DATA[id];
    assert(!!item && !!item.recipe, `${id}: recipe 보유`);
    const sum = item.recipe.reduce((s, c) => s + (ITEM_DATA[c] ? ITEM_DATA[c].cost : NaN), 0);
    assert(sum <= item.cost, `${id}: 하위템 가격 합(${sum})이 완제품 가격(${item.cost})을 넘지 않는다`);
  }
}

// ========================================================================
// 정수약탈자 - 주문 검 변형(치명타확률 비례 추가 피해/마나 획득)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ mp: 0 }); // 마나 획득량을 눈에 보이게 확인하려면 가득 찬 상태(500)에서 시작하면 안 된다
  buyItem(ctrl, 'essenceReaver'); // 자체 공격력+50(치명타확률은 25%로 덮어씀) -> 최종 AD=150, crit=0.25
  assert(Math.abs(ctrl.stats.attackDamage - 150) < 1e-9 && Math.abs(ctrl.stats.critChance - 0.25) < 1e-9, '정수약탈자: 공격력+50/치명타확률25% 정확히 적용(기본 100+50=150)');
  ctrl._itemSheenArmed = true;
  dealtDamages.length = 0;
  const mpBefore = ctrl.mp;
  itemOnBasicAttackHit(ctrl, makeTarget(), false);
  // 버그 수정(QA, "기본공격력" 재점검): 원문("기본공격력 125%")은 아이템
  // 보너스를 포함한 총 공격력(150)이 아니라 챔피언 고유의 기본 공격력만
  // 가리킨다 - 이 테스트의 computeChampionStats 스텁 기준 60을 쓴다.
  // 기본공격력125% + 치명타확률50 = 60*1.25 + 0.25*50 = 75 + 12.5 = 87.5
  assert(Math.abs(dealtDamages[0].result.rawDamage - 87.5) < 1e-6, '정수약탈자(주문 검): "기본"공격력125%+치명타확률50 = 87.5 추가 물리 피해(총 공격력이 아님)');
  // 마나: 기본공격력63% + 치명타확률25 = 60*0.63 + 0.25*25 = 37.8 + 6.25 = 44.05
  assert(Math.abs(ctrl.mp - mpBefore - 44.05) < 1e-6, '정수약탈자(주문 검): "기본"공격력63%+치명타확률25 = 44.05 마나 획득(총 공격력이 아님)');
  assert(ctrl._itemSheenArmed === false, '정수약탈자: 주문 검은 한 번 쓰면 소모된다');
}

// ========================================================================
// 징수의 총 - 죽음(처형)/세금(+25골드)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'collector');
  // 체력이 5% 밑으로 "떨어질 만큼"의 피해 - maxHp 1000이면 문턱은 50.
  // hp=200, finalDmg=160 -> 피격 후 40(=4%) -> 처형 대상.
  let target = makeTarget({ hp: 200, maxHp: 1000 });
  itemOnDamageDealt(ctrl, target, 160, 'PHYSICAL');
  assert(target.hp === 160, '징수의 총(죽음): 처형 조건을 만족하면 target.hp를 finalDmg와 정확히 같게 맞춰, 뒤이은 정상 차감이 0까지 깎게 한다');

  // 피해 후 체력이 5% 이상 남으면 처형하지 않는다(정상적인 hp 그대로 유지).
  target = makeTarget({ hp: 500, maxHp: 1000 });
  itemOnDamageDealt(ctrl, target, 160, 'PHYSICAL');
  assert(target.hp === 500, '징수의 총(죽음): 피해 후 체력이 5% 이상 남으면 처형하지 않는다(target.hp 불변)');

  // 이미 죽는 피해(hp<=finalDmg)는 처형 로직이 추가로 건드릴 필요가 없다.
  target = makeTarget({ hp: 100, maxHp: 1000 });
  itemOnDamageDealt(ctrl, target, 150, 'PHYSICAL');
  assert(target.hp === 100, '징수의 총(죽음): 이미 즉사하는 피해는 target.hp를 추가로 건드리지 않는다(hp<=0 분기는 별도)');

  const goldBefore = ctrl.gold;
  itemOnChampionTakedown(ctrl);
  assert(ctrl.gold === goldBefore + 25, '징수의 총(세금): 챔피언 처치 관여 시 +25골드');
}

// ========================================================================
// 마법광학 장치 C44 - 확대(거리 비례 추가 피해)/비전 조준(사거리 증가)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'magicOpticsC44');

  // 확대 - 거리 0이면 보너스 0, 거리 500(LoL 단위, worldDistanceToLol 항등 스텁)이면 최대 10%.
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget({ root: { position: { x: 0, y: 0, z: 0 } } }), false);
  assert(dealtDamages.length === 0, '마법광학 장치 C44(확대): 거리 0이면 추가 피해가 없다(보너스 0%)');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget({ root: { position: { x: 500, y: 0, z: 0 } } }), false);
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - ctrl.stats.attackDamage * 0.10) < 1e-6, '마법광학 장치 C44(확대): 거리 500에서 공격력의 10%(최대) 추가 물리 피해');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget({ root: { position: { x: 1000, y: 0, z: 0 } } }), false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - ctrl.stats.attackDamage * 0.10) < 1e-6, '마법광학 장치 C44(확대): 500을 넘는 거리는 10%에서 캡');

  // 비전 조준 - 피해를 입힌 챔피언이 3초 안에 죽으면 사거리 증가.
  const victim = { id: 'victim1' };
  itemOnDamageDealt(ctrl, Object.assign(victim, { isChampion: true }), 50, 'PHYSICAL');
  context.controller = ctrl;
  ctrl._itemTempAttackRangeBonusLol = 0;
  itemOnChampionDeath(victim);
  assert(ctrl._itemTempAttackRangeBonusLol === 100, '마법광학 장치 C44(비전 조준): 피해를 입힌 챔피언이 죽으면 사거리 +100');
  assert(ctrl._itemTempAttackRangeExpiresAt > now, '마법광학 장치 C44(비전 조준): 8초간 유지되는 만료 시각이 설정된다');

  // 무관한 챔피언이 죽으면 반응하지 않는다.
  ctrl._itemTempAttackRangeBonusLol = 0;
  itemOnChampionDeath({ id: 'unrelated' });
  assert(ctrl._itemTempAttackRangeBonusLol === 0, '마법광학 장치 C44(비전 조준): 피해를 준 적 없는 챔피언의 죽음에는 반응하지 않는다');
}

// ========================================================================
// 윤 탈 야생화살 - 연습이 치명타를 낳는다(영구 누적)/명중(공격속도 버프+CDR)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'rageblade');
  const champ = makeTarget();
  for (let i = 0; i < 3; i++) itemOnBasicAttackHit(ctrl, champ, false);
  // 근접(attackRange<=300) 기준 0.4%씩 3회 = 1.2%.
  assert(Math.abs(ctrl.itemBonusCritChance - 0.012) < 1e-9, '연습이 치명타를 낳는다: 근접 기준 공격 3회 후 치명타 확률 +1.2%(영구 누적)');
  for (let i = 0; i < 100; i++) itemOnBasicAttackHit(ctrl, champ, false);
  assert(Math.abs(ctrl.itemBonusCritChance - 0.25) < 1e-9, '연습이 치명타를 낳는다: 최대 25%에서 캡');
  // 아이템을 팔아도 누적 자체는 유지된다(들고 있을 때만 다시 적용되는지는 별개).
  const permBefore = ctrl._itemPermCritBonus;
  ctrl.items = []; recomputeItemStats(ctrl);
  assert(ctrl._itemPermCritBonus === permBefore && ctrl.itemBonusCritChance === 0, '연습이 치명타를 낳는다: 아이템을 팔면 누적치는 남지만 더 이상 스탯에 반영되지 않는다(암흑의 인장과 동일한 원칙)');

  // 명중 - 챔피언 공격 시 공격속도 버프, 재사용대기시간 30초.
  const ctrl2 = makeFakeCtrl();
  buyItem(ctrl2, 'rageblade');
  appliedStatuses.length = 0;
  itemOnBasicAttackHit(ctrl2, makeTarget(), false);
  const buff = appliedStatuses.find((a) => a.effect.id === 'itemRagebladeMarksmanship');
  assert(!!buff && Math.abs(buff.effect.value - 0.30) < 1e-9 && buff.effect.duration === 6.0, '명중: 챔피언 기본 공격 시 6초간 공격속도+30%');
  appliedStatuses.length = 0;
  itemOnBasicAttackHit(ctrl2, makeTarget(), false);
  assert(!appliedStatuses.some((a) => a.effect.id === 'itemRagebladeMarksmanship'), '명중: 재사용대기시간(30초) 중에는 다시 발동하지 않는다');
}

// ========================================================================
// 크라켄 학살자 - 벼락(3타마다 레벨 비례 추가 피해)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ champLevel: 8 });
  buyItem(ctrl, 'krakenSlayer');
  const target = makeTarget();
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 0, '크라켄 학살자(벼락): 1~2타에는 발동하지 않는다');
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - 150) < 1e-6, '크라켄 학살자(벼락): 8레벨(근접)에서 3타째 150 추가 물리 피해');

  const ctrl18 = makeFakeCtrl({ champLevel: 18 });
  buyItem(ctrl18, 'krakenSlayer');
  dealtDamages.length = 0;
  for (let i = 0; i < 3; i++) itemOnBasicAttackHit(ctrl18, target, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 200) < 1e-6, '크라켄 학살자(벼락): 18레벨(근접)에서 3타째 200 추가 물리 피해');

  const ctrl25 = makeFakeCtrl({ champLevel: 25 }); // 18레벨 초과는 18레벨 값으로 고정(상한 클램프)
  buyItem(ctrl25, 'krakenSlayer');
  dealtDamages.length = 0;
  for (let i = 0; i < 3; i++) itemOnBasicAttackHit(ctrl25, target, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 200) < 1e-6, '크라켄 학살자(벼락): 18레벨을 넘어도 18레벨 값으로 고정된다');

  // 대상을 바꾸면 그 대상은 별개의 카운터로 취급된다(대상별 Map).
  const target2 = makeTarget({ id: 'target2' });
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl18, target2, false);
  assert(dealtDamages.length === 0, '크라켄 학살자(벼락): 대상별로 독립된 카운터를 쓴다(다른 대상은 1타째일 뿐)');
}

// ========================================================================
// 폭풍갈퀴/고속연사포 - 충전 상태(이동/공격 시 충전, 공격 시 소모)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'stormrazor');
  const target = makeTarget();
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 0, '폭풍갈퀴(번개): 충전되지 않은 상태에서는 발동하지 않는다');

  ctrl.state = 'MOVE';
  for (let i = 0; i < 20; i++) itemSystemTick(ctrl, 0.1); // 2.0초 충전
  assert(ctrl._itemChargeReady === true, '폭풍갈퀴: 2초간 이동하면 충전 완료');
  appliedStatuses.length = 0; dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - 100) < 1e-6 && dealtDamages[0].result.damageType === 'MAGICAL', '폭풍갈퀴(번개): 충전 소모 시 100 추가 마법 피해');
  const msBuff = appliedStatuses.find((a) => a.effect.id === 'itemChargeMsBuff');
  assert(!!msBuff && Math.abs(msBuff.effect.value - 0.45) < 1e-9, '폭풍갈퀴(번개): 충전 소모 시 이동속도+45%(1.5초)');
  assert(ctrl._itemChargeReady === false, '폭풍갈퀴: 충전은 한 번 쓰면 소모되고 다시 채워야 한다');

  // 고속연사포 - 충전 소모 시 40 마법 피해 + 사거리 증가(최대 150유닛 캡).
  const ctrl2 = makeFakeCtrl();
  buyItem(ctrl2, 'rapidFireCannon');
  ctrl2._attackRangeBaseWorld = 500; // worldDistanceToLol이 항등 스텁이므로 "500 LoL 사거리"로 취급됨
  ctrl2.state = 'ATTACK';
  for (let i = 0; i < 20; i++) itemSystemTick(ctrl2, 0.1);
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl2, target, false);
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - 40) < 1e-6, '고속연사포(저격수): 충전 소모 시 40 추가 마법 피해');
  // 사거리 35%: 500*0.35=175, 최대 150유닛 캡에 걸려 150이어야 한다.
  assert(Math.abs(ctrl2._itemTempAttackRangeBonusLol - 150) < 1e-6, '고속연사포(저격수): 사거리 증가분이 최대 150유닛 캡에 걸린다(500*35%=175 -> 150으로 캡)');
}

// ========================================================================
// 나보리 명멸검 - 깨달음(기본 공격 시 남은 쿨다운 15% 감소)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'naboriFlickerblade');
  ctrl.cooldowns.Q = 10; ctrl.cooldowns.W = 0;
  itemOnBasicAttackHit(ctrl, makeTarget(), false);
  assert(Math.abs(ctrl.cooldowns.Q - 8.5) < 1e-9, '깨달음: 쿨다운 중인 Q의 남은 재사용대기시간이 15% 감소(10 -> 8.5)');
  assert(ctrl.cooldowns.W === 0, '깨달음: 쿨다운 중이 아닌 스킬은 변화가 없다(0 그대로)');
}

// ========================================================================
// 도미닉 경의 인사 - 거인 학살자(대상 추가 체력 비례 추가 피해)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'lordDominiksRegards');
  let target = makeTarget({ bonusHealth: 1500 });
  dealtDamages.length = 0;
  itemOnDamageDealt(ctrl, target, 200, 'PHYSICAL');
  // 추가 체력 1500(=maxAtBonusHp)에서 최대 15% -> 200*0.15=30.
  assert(Math.abs((1000 - target.hp) - 30) < 1e-6, '거인 학살자: 추가 체력이 1500(최대)이면 피해량의 15% 추가 피해(200*0.15=30)');

  target = makeTarget({ bonusHealth: 750 });
  itemOnDamageDealt(ctrl, target, 200, 'PHYSICAL');
  assert(Math.abs((1000 - target.hp) - 15) < 1e-6, '거인 학살자: 추가 체력이 750(절반)이면 절반인 7.5% 추가 피해(200*0.075=15)');
}

// ========================================================================
// 버그 수정 재확인 라운드 - 원문에 "구조물 제외" 언급이 없는데도 다른
// 온히트 패시브를 베껴 구조물을 제외하고 있었던 3건(확대/벼락/충전형
// 마법 피해) + 거인 학살자의 이중 방어력 감소·물리 고정 오류.
// ========================================================================
{
  const turret = { isChampion: false, isTurret: true, isStructure: true, hp: 5000, maxHp: 5000, statusEffects: [], root: { position: { x: 500, y: 0, z: 0 } } };

  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'magicOpticsC44');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, turret, false);
  assert(dealtDamages.length === 1, '버그 수정: 마법광학 장치 C44(확대)는 원문에 구조물 제외가 없어 포탑에게도 적용된다');

  const ctrl2 = makeFakeCtrl();
  buyItem(ctrl2, 'krakenSlayer');
  dealtDamages.length = 0;
  for (let i = 0; i < 3; i++) itemOnBasicAttackHit(ctrl2, turret, false);
  assert(dealtDamages.length === 1, '버그 수정: 크라켄 학살자(벼락)도 포탑 대상 3타째에 정상 발동한다');

  const ctrl3 = makeFakeCtrl();
  buyItem(ctrl3, 'stormrazor');
  ctrl3.state = 'MOVE';
  for (let i = 0; i < 20; i++) itemSystemTick(ctrl3, 0.1);
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl3, turret, false);
  assert(dealtDamages.length === 1 && dealtDamages[0].result.damageType === 'MAGICAL', '버그 수정: 폭풍갈퀴(번개)의 충전 소모 마법 피해도 포탑 대상에게 적용된다');

  // 거인 학살자 - finalDmg(이미 최종 수치)에서 그대로 비율만 더하므로
  // calculateDamage()를 다시 거치지 않는다(이중 방어력 감소 금지).
  // 테스트 환경의 calculateDamage 스텁은 armor:0 가정이라 수치상으로는
  // 차이가 안 보이지만, 코드 자체가 calculateDamage를 더 이상 호출하지
  // 않는지는 아래 "물리 고정이었던 하드코딩 제거" 동작으로 간접 확인한다 -
  // 마법 피해를 입힌 경우에도(damageType='MAGICAL') 추가 피해가 정상적으로
  // 더해지는지 확인한다(이전엔 damageType을 무시하고 늘 PHYSICAL로
  // calculateDamage를 다시 호출했었다).
  const ctrl4 = makeFakeCtrl();
  buyItem(ctrl4, 'lordDominiksRegards');
  const magicTarget = makeTarget({ bonusHealth: 1500, hp: 1000, maxHp: 1000 });
  itemOnDamageDealt(ctrl4, magicTarget, 200, 'MAGICAL');
  assert(Math.abs((1000 - magicTarget.hp) - 30) < 1e-6, '버그 수정: 거인 학살자는 원본 피해가 마법 피해여도(damageType 무관) 정확히 15% 추가 피해를 더한다');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
