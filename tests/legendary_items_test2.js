// Node vm harness for the "전설급 아이템" 3차분 (거대한히드라~수호천사),
// sourced directly from the user's original uploaded item text (760~812줄).
// Mirrors legendary_items_test.js's harness/stub conventions exactly.
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
let radiusHitsQueue = []; // findEnemiesInRadius()가 다음 호출에서 반환할 유닛 목록
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
  STATE: { DEAD: 'DEAD', IDLE: 'IDLE' },
  controller: null, // itemOnChampionDeath()가 읽는 "유일한 실제 플레이어" 전역 - 테스트별로 덮어쓴다.
  applyStatus: (target, effect) => {
    appliedStatuses.push({ target, effect });
    target.statusEffects = target.statusEffects || [];
    const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
    const rec = { ...effect, expiresAt: now + effect.duration * 1000 };
    if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
    return rec;
  },
  findEnemiesInRadius: () => radiusHitsQueue.map((unit) => ({ unit })),
  applyDamage: (target, result) => {
    dealtDamages.push({ target, result });
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  // 경탄(마나무네)과 잡아채는 발톱(스테락의도전)이 공용으로 참조하는
  // "챔피언 기본" 스탯 - 기본 공격력 60을 테스트 기준값으로 둔다.
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
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.ITEM_ORDER = ITEM_ORDER;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.hasComponents = hasComponents;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnTakeDamage = itemOnTakeDamage;
this.itemOnChampionDeath = itemOnChampionDeath;
this.itemOnLethalDamage = itemOnLethalDamage;
this.useItem = useItem;
`, context);
const {
  ITEM_DATA, ITEM_CATEGORIES, ITEM_ORDER, buyItem, buildOrBuyItem, hasComponents, itemSystemTick,
  itemOnBasicAttackHit, itemOnTakeDamage, itemOnChampionDeath, itemOnLethalDamage, useItem,
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
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [] }, overrides);
}

// ========================================================================
// 거인의 허리띠 (하위 아이템) - 순수 스탯
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'giantsBelt');
  assert(ctrl.maxHp === 2350, '거인의 허리띠: 체력 +350 정확히 적용');
  assert(ITEM_CATEGORIES.find((c) => c.id === 'epic').items.includes('giantsBelt'), '거인의 허리띠: 서사급 탭에 등록됨');
}

// ========================================================================
// 거대한히드라 (titanicHydra): 쪼개기(자신의 최대 체력 비례) + 거대한 초승달
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tiamat'); buyItem(ctrl, 'tunnelers'); buyItem(ctrl, 'giantsBelt');
  buildOrBuyItem(ctrl, 'titanicHydra');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'titanicHydra', '거대한히드라: 조합 시 하위템 3종이 소모되고 완제품만 남는다');
  assert(ctrl.stats.attackDamage === 140 && ctrl.maxHp === 2600, '거대한히드라: 공격력 +40/체력 +600 정확히 적용');

  // 근접(attackRange<=300) 기준 쪼개기 - 자신의 최대 체력(2600) 비례.
  dealtDamages.length = 0;
  const target = makeTarget({ maxHp: 999999, hp: 999999 }); // 대상 체력은 쪼개기 수치와 무관해야 한다
  itemOnBasicAttackHit(ctrl, target, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 2600 * 0.01) < 1e-6, '거대한히드라(쪼개기): 대상에게 자신의 최대 체력 1%(근접) 물리 피해 - 대상 체력과 무관');

  // 주변(splash) 피해 - findEnemiesInRadius가 target 포함 2명을 반환하면 target 제외 1명만 맞아야 한다.
  const splashVictim = makeTarget({ id: 'splash1' });
  radiusHitsQueue = [target, splashVictim];
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  const splashHit = dealtDamages.find((d) => d.target === splashVictim);
  assert(!!splashHit && Math.abs(splashHit.result.rawDamage - 2600 * 0.03) < 1e-6, '거대한히드라(쪼개기): 주변 적에게 자신의 최대 체력 3%(근접) 물리 피해, 원래 대상 본인은 제외');
  radiusHitsQueue = [];

  // 구조물에는 쪼개기가 발동하지 않는다.
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, makeTarget({ isTurret: true, isChampion: false }), false);
  assert(dealtDamages.length === 0, '거대한히드라(쪼개기): 구조물 대상에는 발동하지 않는다');

  // 거대한 초승달 - 무장 후 "다음 한 번"만 강화.
  assert(useItem(ctrl, 0) === true, '거대한 초승달: 사용 성공');
  assert(ctrl._itemEmpoweredCleaveArmed === true, '거대한 초승달: 사용 시 무장 상태가 된다');
  assert(useItem(ctrl, 0) === false, '거대한 초승달: 재사용 대기시간(10초) 중에는 다시 사용할 수 없다');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 2600 * (0.01 + 0.04)) < 1e-6, '거대한 초승달: 강화된 다음 쪼개기 1회는 근접 +4%p 추가(1%+4%=5%)');
  assert(ctrl._itemEmpoweredCleaveArmed === false, '거대한 초승달: 강화는 한 번 쓰면 바로 소모된다');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 2600 * 0.01) < 1e-6, '거대한 초승달: 소모 후 다음 공격은 다시 평소 쪼개기 수치로 돌아온다');
}

// ========================================================================
// 발걸음분쇄기 (hydraOfHeroism): 쪼개기 + 파괴의 충격파(즉시 범위 피해+둔화+MS)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'tiamat'); buyItem(ctrl, 'devourerAxe'); buyItem(ctrl, 'dagger');
  buildOrBuyItem(ctrl, 'hydraOfHeroism');
  assert(ctrl.items.length === 1 && ctrl.items[0].id === 'hydraOfHeroism', '발걸음분쇄기: 조합 시 하위템 3종이 소모되고 완제품만 남는다');
  assert(ctrl.stats.attackDamage === 140 && Math.abs(ctrl.itemBonusAttackSpeedPercent - 0.25) < 1e-9 && ctrl.maxHp === 2450, '발걸음분쇄기: 공격력 +40/공격속도 +25%/체력 +450 정확히 적용');

  const champA = makeTarget({ id: 'champA' });
  const champB = makeTarget({ id: 'champB' });
  const nonChamp = makeTarget({ id: 'minionX', isChampion: false, isMinion: true });
  radiusHitsQueue = [champA, champB, nonChamp];
  appliedStatuses.length = 0;
  dealtDamages.length = 0;
  const used = useItem(ctrl, 0);
  assert(used === true, '파괴의 충격파: 사용 성공');
  assert(dealtDamages.length === 3, '파괴의 충격파: 반경 안의 적(챔피언+비챔피언) 전원에게 피해');
  assert(Math.abs(dealtDamages[0].result.rawDamage - ctrl.stats.attackDamage * 0.80) < 1e-6, '파괴의 충격파(근접): 공격력 80% 물리 피해');
  assert(appliedStatuses.filter((a) => a.effect.id === 'itemHydraShockwaveSlow').length === 2, '파괴의 충격파: 챔피언 2명에게만 35% 둔화');
  const msBuff = appliedStatuses.find((a) => a.effect.id === 'itemHydraShockwaveMs');
  assert(!!msBuff && Math.abs(msBuff.effect.value - 2 * 0.35) < 1e-9 && msBuff.effect.decayLinear === true, '파괴의 충격파: 챔피언 2명 적중 -> 자신 이동속도 +70%(선형 감쇠)');
  assert(useItem(ctrl, 0) === false, '파괴의 충격파: 재사용 대기시간(15초) 중에는 다시 사용할 수 없다');
  radiusHitsQueue = [];
}

// ========================================================================
// 스테락의도전 (sterakssGage): 강인함(공용 집계) + 잡아채는 발톱 + 생명선(감쇠형)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'sterakssGage');
  assert(ctrl.maxHp === 2400, '스테락의도전: 체력 +400 정확히 적용');
  assert(Math.abs(ctrl.itemTenacityPercent - 0.20) < 1e-9, '스테락의도전: 강인함 +20%(기존 공용 집계 로직 재사용) 적용');
  assert(Math.abs(ctrl.stats.attackDamage - (100 + 60 * 0.50)) < 1e-9, '스테락의도전(잡아채는 발톱): 기본 공격력(60)의 50%만큼 추가 공격력');

  // 생명선 - 피해 종류 무관, 체력 30% 밑으로 떨어질 "만큼"이면 발동.
  ctrl.hp = 800; // maxHp=2400, 30% = 720
  const attacker = { id: 'attackerA' };
  let result = itemOnTakeDamage(ctrl, 200, 'PHYSICAL', attacker); // 800-200=600 < 720 -> 발동
  assert(result === 200, '스테락의도전(생명선): 죽음의무도와 달리 피해량 자체는 바꾸지 않는다');
  assert(Math.abs(ctrl.shield - (ctrl.itemBonusMaxHp * 0.60)) < 1e-6, '스테락의도전(생명선): 보호막 = 추가 체력(400)의 60%(정액/비례 조합이 아닌 그 자체)');
  assert(!!ctrl._itemSterakShieldState, '스테락의도전(생명선): 감쇠형 보호막 상태 기록');
  const shieldAtTrigger = ctrl.shield;

  // 재사용대기시간(90초) 중에는 재발동하지 않는다.
  ctrl.shield = 0;
  itemOnTakeDamage(ctrl, 200, 'MAGICAL', attacker);
  assert(ctrl.shield === 0, '스테락의도전(생명선): 재사용대기시간(90초) 중에는 재발동하지 않는다(마법 피해에도 동일 - 피해 종류 무관 확인)');

  // 4.5초에 걸쳐 점차 감소(decaySec) - 절반 지점에서 대략 절반.
  ctrl.shield = shieldAtTrigger;
  now += 2250; // 4.5초의 절반
  itemSystemTick(ctrl, 2.25);
  assert(Math.abs(ctrl.shield - shieldAtTrigger * 0.5) < 1e-6, '스테락의도전(생명선): 4.5초의 절반 지점에서 보호막이 대략 절반으로 감소');
  now += 2300; // 나머지 절반을 넘겨 완전히 소멸
  itemSystemTick(ctrl, 2.3);
  assert(ctrl.shield <= 0 && !ctrl._itemSterakShieldState, '스테락의도전(생명선): 4.5초가 지나면 보호막이 완전히 소멸한다(맞지 않아도)');
}

// ========================================================================
// 죽음의무도 (deathsDance): 고통 무시(지연 피해) + 반항(죽이면 상쇄+회복)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'deathsDance');
  assert(ITEM_DATA.deathsDance.recipe && ITEM_DATA.deathsDance.recipe.includes('ironSeal'), '죽음의무도: QA 수정 후 강철인장을 하위템으로 포함하는 recipe가 정상 반영됨');
  assert(ctrl.stats.attackDamage === 160 && ctrl.itemBonusArmor === 50 && ctrl.itemBonusAbilityHaste === 15, '죽음의무도: 공격력+60/방어력+50/스킬 가속+15 정확히 적용');

  // 고통 무시 - 근접 30%를 3초 지연 피해로 전환.
  const attacker = { id: 'enemyX' };
  let result = itemOnTakeDamage(ctrl, 1000, 'PHYSICAL', attacker);
  assert(result === 700, '고통 무시(근접): 받는 피해의 30%(300)를 즉시가 아닌 지연 피해로 돌려 즉시 피해는 700만 남는다');
  assert(ctrl._itemDeathsDanceDot.length === 1 && Math.abs(ctrl._itemDeathsDanceDot[0].perSec - 100) < 1e-9, '고통 무시: 지연된 300을 3초에 걸쳐(초당 100) 나눠 받는다');

  // 원거리 변형(10%) - 별도 ctrl로 확인.
  const rangedCtrl = makeFakeCtrl({ stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 500, critChance: 0, moveSpeed: 340, baseMoveSpeed: 340, percentMoveSpeedBonus: 0, flatMoveSpeedBonus: 0 } });
  buyItem(rangedCtrl, 'deathsDance');
  const rResult = itemOnTakeDamage(rangedCtrl, 1000, 'PHYSICAL', attacker);
  assert(rResult === 900, '고통 무시(원거리): 받는 피해의 10%(100)만 지연 피해로 돌린다');

  // 지연 피해 틱 - 3초(총 10틱 가정 없이 dt 누적)에 걸쳐 정확히 300을 전부 받는다.
  const hpBefore = ctrl.hp;
  for (let i = 0; i < 30; i++) itemSystemTick(ctrl, 0.1);
  assert(Math.abs((hpBefore - ctrl.hp) - 300) < 1e-6, '고통 무시: 지연 피해 300이 3초에 걸쳐 전부(정확히) 적용된다');
  assert(ctrl._itemDeathsDanceDot.length === 0, '고통 무시: 3초가 지나면 지연 피해 묶음이 사라진다');

  // 반항 - 지연 피해를 입힌 챔피언이 죽으면 상쇄 + 회복.
  itemOnTakeDamage(ctrl, 1000, 'PHYSICAL', attacker); // 새 지연 피해 300 발생
  assert(ctrl._itemDeathsDanceDot.length === 1, '반항 사전조건: 지연 피해가 걸려 있다');
  context.controller = ctrl; // 이 데모의 "유일한 실제 캐릭터" 전역을 테스트 대상으로 지정
  ctrl._itemActiveHeals = [];
  itemOnChampionDeath(attacker); // attacker가 사망
  assert(ctrl._itemDeathsDanceDot.length === 0, '반항: 피해를 입힌 챔피언이 죽으면 지연 피해가 즉시 사라진다');
  const healEntry = ctrl._itemActiveHeals.find((h) => Math.abs(h.perSec * h.remainingSec - ctrl.stats.attackDamage * 0 - (ctrl.itemBonusAD) * 0.75) < 1e-6);
  assert(!!healEntry, `반항: 추가 공격력(${ctrl.itemBonusAD})의 75%만큼 2초에 걸쳐 회복`);

  // 무관한 챔피언이 죽는 경우는 반항이 발동하지 않는다.
  itemOnTakeDamage(ctrl, 1000, 'PHYSICAL', attacker);
  const before = ctrl._itemDeathsDanceDot.length;
  itemOnChampionDeath({ id: 'unrelatedChamp' });
  assert(ctrl._itemDeathsDanceDot.length === before, '반항: 나(죽음의무도 소지자)에게 피해를 준 적이 없는 챔피언이 죽어도 반응하지 않는다');
}

// ========================================================================
// 수호천사 (guardianAngel): 환생(치명적 피해 1회 취소 -> 경직 -> 부활)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ hp: 2000, maxHp: 2000, mp: 100, maxMp: 500 });
  assert(itemOnLethalDamage(ctrl) === false, '수호천사 미소지: 환생이 발동하지 않는다(평소처럼 사망)');
  buyItem(ctrl, 'guardianAngel');
  assert(ITEM_DATA.guardianAngel.recipe && ITEM_DATA.guardianAngel.recipe.includes('ironSeal'), '수호천사: QA 수정 후 강철인장을 하위템으로 포함하는 recipe가 정상 반영됨');

  assert(itemOnLethalDamage(ctrl) === true, '수호천사(환생): 치명적 피해를 가로채 사망을 취소한다');
  assert(ctrl.hp === 1 && ctrl.isUntargetable === true, '수호천사(환생): 경직 동안 체력 1 유지 + 대상 지정 불가(isUntargetable 재사용)');
  assert(itemOnLethalDamage(ctrl) === false, '수호천사(환생): 재사용대기시간(300초) 중에는 다시 발동하지 않는다');

  now += 2000; // 경직 4초 중 2초 경과 - 아직 안 끝남
  itemSystemTick(ctrl, 2.0);
  assert(ctrl.isUntargetable === true, '수호천사(환생): 경직 4초가 끝나기 전에는 그대로 무적 상태 유지');

  now += 2100; // 나머지 경과 - 경직 종료
  itemSystemTick(ctrl, 2.1);
  assert(ctrl.isUntargetable === false, '수호천사(환생): 경직 4초가 끝나면 대상 지정 불가가 풀린다');
  assert(Math.abs(ctrl.hp - ctrl.maxHp * 0.50) < 1e-6, '수호천사(환생): 체력 50%로 부활');
  assert(Math.abs(ctrl.mp - ctrl.maxMp * 1.0) < 1e-6, '수호천사(환생): 마나 100%로 부활');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
