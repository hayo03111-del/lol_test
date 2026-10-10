// QA 재점검 - "주문검과 주문검 상위템 시리즈 제대로 작동하는지 확인해줘"
// 요청에 따라 전체 스펠블레이드(주문 검) 계열 + "기본공격력" 표현을 쓰는
// 유사 패시브를 전부 재점검한다.
//
// 발견한 버그: 원문은 삼위일체("기본 공격력 200%")/정수약탈자("기본공격력
// 125%+기본공격력 63%")/황혼과새벽("기본공격력 75%")/리치베인("기본공격력
// 75%")/선체파괴자 선장("근거리 기본공격력 120%" 등)/갈라진하늘 라이트쉴드
// 타격("근접 기본공격력 90%" 등) 전부 예외 없이 "기본공격력"(아이템으로
// 늘어나기 전의 챔피언 고유 공격력)을 쓰는데, 지금까지는 ctrl.stats.attackDamage
// (아이템 보너스까지 합친 "총" 공격력)를 그대로 곱하고 있었다 - 즉 공격력
// 아이템을 더 살수록 스펠블레이드/선장/라이트쉴드 피해까지 같이 부풀려지는
// 잘못된 동작이었다. computeChampionStats()에서 레벨별 "진짜" 기본 공격력을
// 다시 구해 쓰도록 6개 지점을 전부 고쳤다(스테락의도전 "잡아채는 발톱"은
// 애초부터 정확히 구현돼 있었다 - 이번 재점검으로 확인).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
const appliedStatuses = [];
// 실제 챔피언은 레벨에 따라 기본 공격력이 자라난다 - 레벨 1일 때와 18일
// 때 서로 다른 기본값을 주는 스텁으로, "아이템 총 공격력이 아니라 매번
// computeChampionStats()에서 다시 구한 기본 공격력을 쓰는지"를 레벨을
// 바꿔가며 확인할 수 있게 한다.
function stubComputeChampionStats(championId, champLevel) {
  const baseAd = 50 + (champLevel - 1) * 3; // 레벨 1: 50, 레벨 18: 101
  return { maxMp: 500, attackDamage: baseAd };
}
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
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  computeChampionStats: stubComputeChampionStats,
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
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnAbilityDispatch = itemOnAbilityDispatch;
`, context);
const { ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemOnBasicAttackHit, itemOnAbilityDispatch } = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1000000, boots: null, team: 'BLUE', state: 'IDLE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusUltimateHaste: 0,
    itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0, itemHealingReceivedBonusPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0,
    itemManaOnDamagePercent: 0, itemBonusArmorPenMultiplier: 1, itemBonusMagicPenMultiplier: 1, itemTotalApMultiplierBonus: 0,
    itemSpellDamageAmpPercent: 0, itemDynamicBonusAD: 0, _itemShieldExpiresAt: 0, shield: 0,
    _itemGloryStacks: 0, _itemSlaughterStacks: 0, _itemTearState: null, _itemActiveHeals: [], _itemActiveManaRestores: [],
    _itemBootsExtraMoveSpeedLol: 0, _itemActiveElixir: null, bonusAD: 0, bonusMaxHp: 0,
    _itemActiveCooldownUntil: {},
    _itemTempAttackRangeBonusLol: 0, _itemTempAttackRangeExpiresAt: 0,
    itemTempADBonus: 0, itemTempArmorBonus: 0, itemTempMrBonus: 0,
    itemTempArmorPenFlat: 0, itemTempArmorPenPercent: 0, itemTempMagicPenPercent: 0,
    itemBonusCritDamagePercent: 0,
    _itemLastDealtChampionDamageAt: 0, _itemLastTookChampionDamageAt: 0, _itemLastTookAnyDamageAt: 0,
    trinket: null, _placedWards: [], statusEffects: [], currentTarget: null,
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 1, // 레벨 1부터 시작(기본 AD=50)
    championId: 'testchamp', skillPoints: 0,
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 50, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
    recomputeStats() {
      // 실제 character_controller.js와 동일하게, 레벨이 바뀌면 기본 공격력도
      // computeChampionStats()에서 다시 구해 반영한다(매번 50으로 고정하지 않음).
      const base = stubComputeChampionStats(this.championId, this.champLevel);
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = base.attackDamage + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0) + (this.itemTempADBonus || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0) * (1 + (this.itemTotalApMultiplierBonus || 0));
      this.stats.armor = 30 + (this.itemBonusArmor || 0) + (this.itemTempArmorBonus || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0) + (this.itemTempMrBonus || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 100000, maxHp: 100000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } }, mesh: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ========================================================================
// 공통 검증 헬퍼 - "레벨 1(기본AD 50)일 때와 레벨 18(기본AD 101)일 때
// 보너스 피해가 진짜 기본 공격력을 따라 달라지는지"(총 공격력 사용 시
// 레벨이 바뀌어도 숫자가 안 바뀌거나 틀린 값이 나와야 하는데, 실제로는
// 레벨마다 정확히 달라져야 한다)와 "레벨은 고정하고 아이템으로 공격력을
// 추가로 사도(총 공격력은 늘지만 기본 공격력은 그대로) 보너스 피해가
// 전혀 안 바뀌는지"를 함께 확인한다 - 이 두 성질을 동시에 만족해야
// "ctrl.stats.attackDamage가 아니라 진짜 기본 공격력을 쓰고 있다"고
// 확신할 수 있다.
function testSpellbladeUsesBaseAd(itemId, recipe, bonusAdPercent, label) {
  // 레벨 1 (기본 AD 50).
  const ctrl1 = makeFakeCtrl({ champLevel: 1 });
  for (const r of recipe) buyItem(ctrl1, r);
  buildOrBuyItem(ctrl1, itemId);
  itemOnAbilityDispatch(ctrl1);
  const t1 = makeTarget();
  const hpBefore1 = t1.hp;
  itemOnBasicAttackHit(ctrl1, t1, false);
  const dealt1 = hpBefore1 - t1.hp;
  const expected1 = bonusAdPercent * 50;
  assert(Math.abs(dealt1 - expected1) < 1, `${label}: 레벨 1(기본 AD 50) 기준 보너스 피해가 기본 공격력*${bonusAdPercent}=${expected1}에 가깝다(got ${dealt1.toFixed(2)})`);

  // 레벨 18 (기본 AD 101) - 같은 아이템, 같은 조합, 레벨만 다르다.
  const ctrl2 = makeFakeCtrl({ champLevel: 18 });
  for (const r of recipe) buyItem(ctrl2, r);
  buildOrBuyItem(ctrl2, itemId);
  itemOnAbilityDispatch(ctrl2);
  const t2 = makeTarget();
  const hpBefore2 = t2.hp;
  itemOnBasicAttackHit(ctrl2, t2, false);
  const dealt2 = hpBefore2 - t2.hp;
  const expected2 = bonusAdPercent * 101;
  assert(Math.abs(dealt2 - expected2) < 1, `${label}: 레벨 18(기본 AD 101) 기준 보너스 피해가 기본 공격력*${bonusAdPercent}=${expected2}에 가깝다(got ${dealt2.toFixed(2)}) - 레벨이 바뀌면 기본 공격력도 따라 바뀐다`);
  assert(Math.abs(dealt2 - dealt1) > 1, `${label}: 레벨 1과 18의 보너스 피해가 서로 다르다(기본 공격력을 실제로 반영한다는 증거)`);

  // 레벨 1 그대로 두고, 공격력 아이템을 추가로 사서 "총" 공격력만 늘린다 -
  // 기본 공격력은 그대로이므로 보너스 피해가 전혀 바뀌면 안 된다(바뀌면
  // 아직도 총 공격력을 쓰고 있다는 뜻 - 이번에 고친 버그가 재발한 것).
  const ctrl3 = makeFakeCtrl({ champLevel: 1 });
  for (const r of recipe) buyItem(ctrl3, r);
  buildOrBuyItem(ctrl3, itemId);
  const totalAdBefore = ctrl3.stats.attackDamage;
  buyItem(ctrl3, 'longSword'); buyItem(ctrl3, 'longSword'); buyItem(ctrl3, 'longSword'); // 공격력 +45(총 공격력만 늘림)
  assert(ctrl3.stats.attackDamage > totalAdBefore, `${label}: 롱소드 3개를 추가로 사면 "총" 공격력은 실제로 늘어난다(테스트 전제 확인)`);
  itemOnAbilityDispatch(ctrl3);
  const t3 = makeTarget();
  const hpBefore3 = t3.hp;
  itemOnBasicAttackHit(ctrl3, t3, false);
  const dealt3 = hpBefore3 - t3.hp;
  assert(Math.abs(dealt3 - expected1) < 1, `${label}: 총 공격력이 늘어도(롱소드 3개 추가) 기본 공격력은 그대로라 보너스 피해가 바뀌지 않는다(버그 수정 확인 - got ${dealt3.toFixed(2)}, 기대 ${expected1})`);
}

testSpellbladeUsesBaseAd('trinityForce', ['sheen', 'devourerAxe', 'phageAxe'], 2.0, '삼위일체');

// 정수약탈자/리치베인은 AD%만이 아니라 치명타확률/주문력 항도 섞여 있어
// (각각 bonusPerCritChance=50, bonusApPercent=0.45) 범용 헬퍼로는 검증할
// 수 없다 - 레벨 1/18 비교로 "AD항이 기본 공격력을 따라가는지"만 별도 확인한다.
{
  const p = ITEM_DATA.essenceReaver.spellbladePassive;
  const ctrl1 = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl1, 'sheen'); buyItem(ctrl1, 'caulfieldsWarhammer'); buyItem(ctrl1, 'cloakOfAgility');
  buildOrBuyItem(ctrl1, 'essenceReaver');
  itemOnAbilityDispatch(ctrl1);
  const t1 = makeTarget();
  const b1 = t1.hp;
  itemOnBasicAttackHit(ctrl1, t1, false);
  const dealt1 = b1 - t1.hp;
  const expected1 = p.bonusAdPercent * 50 + p.bonusPerCritChance * ctrl1.stats.critChance;
  assert(Math.abs(dealt1 - expected1) < 1, `정수약탈자: 레벨 1(기본 AD 50) 기준 피해(기본공격력${p.bonusAdPercent}*50 + 치명타확률${p.bonusPerCritChance}*${ctrl1.stats.critChance})=${expected1.toFixed(2)}에 가깝다(got ${dealt1.toFixed(2)})`);

  const ctrl2 = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl2, 'sheen'); buyItem(ctrl2, 'caulfieldsWarhammer'); buyItem(ctrl2, 'cloakOfAgility');
  buildOrBuyItem(ctrl2, 'essenceReaver');
  buyItem(ctrl2, 'longSword'); buyItem(ctrl2, 'longSword'); buyItem(ctrl2, 'longSword'); // 총 공격력만 추가로 증가
  itemOnAbilityDispatch(ctrl2);
  const t2 = makeTarget();
  const b2 = t2.hp;
  itemOnBasicAttackHit(ctrl2, t2, false);
  const dealt2 = b2 - t2.hp;
  assert(Math.abs(dealt2 - expected1) < 1, `정수약탈자: 총 공격력이 늘어도(롱소드 3개) AD항 피해가 바뀌지 않는다(기본 공격력만 반영 - got ${dealt2.toFixed(2)}, 기대 ${expected1.toFixed(2)})`);
}
{
  const p = ITEM_DATA.lichBane.spellbladePassive;
  const ctrl1 = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl1, 'sheen'); buyItem(ctrl1, 'aetherialWisp'); buyItem(ctrl1, 'blastingWand');
  buildOrBuyItem(ctrl1, 'lichBane');
  itemOnAbilityDispatch(ctrl1);
  const t1 = makeTarget();
  const b1 = t1.hp;
  itemOnBasicAttackHit(ctrl1, t1, false);
  const dealt1 = b1 - t1.hp;
  const expected1 = p.bonusAdPercent * 50 + p.bonusApPercent * ctrl1.stats.abilityPower;
  assert(Math.abs(dealt1 - expected1) < 1, `리치베인: 레벨 1(기본 AD 50) 기준 피해(기본공격력${p.bonusAdPercent}*50 + 주문력${p.bonusApPercent}*${ctrl1.stats.abilityPower})=${expected1.toFixed(2)}에 가깝다(got ${dealt1.toFixed(2)})`);

  const ctrl2 = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl2, 'sheen'); buyItem(ctrl2, 'aetherialWisp'); buyItem(ctrl2, 'blastingWand');
  buildOrBuyItem(ctrl2, 'lichBane');
  buyItem(ctrl2, 'longSword'); buyItem(ctrl2, 'longSword'); buyItem(ctrl2, 'longSword'); // 총 공격력만 추가로 증가(AP는 그대로)
  itemOnAbilityDispatch(ctrl2);
  const t2 = makeTarget();
  const b2 = t2.hp;
  itemOnBasicAttackHit(ctrl2, t2, false);
  const dealt2 = b2 - t2.hp;
  assert(Math.abs(dealt2 - expected1) < 1, `리치베인: 총 공격력이 늘어도(롱소드 3개) AD항 피해가 바뀌지 않는다(기본 공격력만 반영 - got ${dealt2.toFixed(2)}, 기대 ${expected1.toFixed(2)})`);
}

// 황혼과새벽은 AD% + AP%가 섞여 있어 AP를 0으로 고정하고 AD항만 검증한다.
{
  const ctrl = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl, 'sheen'); buyItem(ctrl, 'blastingWand'); buyItem(ctrl, 'kircheisShard'); buyItem(ctrl, 'dagger');
  buildOrBuyItem(ctrl, 'duskAndDawn');
  ctrl.stats.abilityPower = 0; // AP항을 0으로 고정해 AD항만 분리 검증
  itemOnAbilityDispatch(ctrl);
  const target = makeTarget();
  const before = target.hp;
  itemOnBasicAttackHit(ctrl, target, false);
  // bonusAdPercent=0.75, extraProc(2회) 적용, 기본 AD=50 -> (0.75*50)*2=75
  assert(Math.abs((before - target.hp) - 0.75 * 50 * 2) < 1, '황혼과새벽: AP를 0으로 고정해도 AD항(기본 공격력75%*2회)이 정확히 기본 공격력 기준으로 들어간다');
}

// ========================================================================
// 선체파괴자(선장)/갈라진하늘(라이트쉴드 타격) - 스펠블레이드는 아니지만
// 똑같이 "기본공격력"을 쓰면서 총 공격력을 읽던 동일 계열 버그였다.
// ========================================================================
{
  const ctrl1 = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl1, 'tunnelers'); buyItem(ctrl1, 'ascendedPauldrons'); buyItem(ctrl1, 'pickaxe');
  buildOrBuyItem(ctrl1, 'hullbreaker');
  const champTarget = makeTarget();
  for (let i = 0; i < 4; i++) itemOnBasicAttackHit(ctrl1, champTarget, false);
  const before = champTarget.hp;
  itemOnBasicAttackHit(ctrl1, champTarget, false); // 5th
  const dealt = before - champTarget.hp;
  const p = ITEM_DATA.hullbreaker.captainPassive;
  const expected = p.meleePercentBaseAd * 50 + p.meleePercentMaxHp * ctrl1.maxHp;
  assert(Math.abs(dealt - expected) < 1, `선체파괴자(선장): 5번째 평타 피해가 "기본" 공격력(50) 기준으로 정확하다(got ${dealt.toFixed(2)}, 기대 ${expected.toFixed(2)})`);

  const ctrl2 = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl2, 'tunnelers'); buyItem(ctrl2, 'caulfieldsWarhammer');
  buildOrBuyItem(ctrl2, 'divineSunderer');
  const target2 = makeTarget({ hp: 400, maxHp: 1000 });
  // 체력을 가득 채운 상태(1000/1000)로 두면 회복량이 상한(maxHp)에 막혀
  // "0만큼 늘었다"로 보이는 테스트 버그가 생긴다 - 회복이 실제로 보이도록
  // 일부러 깎아둔 상태(900/1000)에서 시작한다.
  ctrl2.hp = 900; ctrl2.maxHp = 1000;
  itemOnBasicAttackHit(ctrl2, target2, false);
  const dsp = ITEM_DATA.divineSunderer.lightshieldStrikePassive;
  const expectedHeal = dsp.meleeBaseAdPercent * 50 + 600 * dsp.missingHpHealPercent;
  assert(Math.abs(ctrl2.hp - (900 + expectedHeal)) < 1, `갈라진하늘(라이트쉴드 타격): 회복량이 "기본" 공격력(50) 기준으로 정확하다(got ${(ctrl2.hp-900).toFixed(2)}, 기대 ${expectedHeal.toFixed(2)})`);
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
