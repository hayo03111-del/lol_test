// Node vm harness for the "전설급 아이템" 5차분 (필멸자의 운명~세릴다의
// 원한, 치명타 계열 나머지 11종 + 하위템 1종 "야수화"), sourced directly
// from the user's original uploaded item text (lines 915~1023).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

// ========================================================================
// Part A: calculateDamage() 핵심 수정(무한의 대검/경계/벼락폭풍검) -
// 00_global_constants.js의 진짜 calculateDamage()를 그대로 로드해서
// 테스트한다(item_system.js 쪽 스텁이 아니라 실제 운영 코드 검증).
// ========================================================================
{
  const stubs = { console, controller: null, getArmorShredPercent: () => 0, getMagicDamageReductionPercent: () => 0 };
  const context = vm.createContext(stubs);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
  vm.runInContext(src + '\nthis.calculateDamage = calculateDamage; this.DAMAGE_TYPE = DAMAGE_TYPE;', context);
  const { calculateDamage, DAMAGE_TYPE } = context;

  // 무한의 대검 - 치명타 피해량 +30%는 각 챔피언이 넘기는 critMultiplier(보통 2.0)에 더해진다.
  const target = { armor: 0, magicResist: 0 };
  const ieHolder = { itemBonusCritDamagePercent: 0.30 };
  const critDmg = calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: true, critMultiplier: 2.0, target, source: ieHolder });
  assert(Math.abs(critDmg - 100 * (2.0 + 0.30)) < 1e-6, '무한의 대검: 치명타 피해량 +30%가 critMultiplier(2.0)에 더해져 230의 피해(100*2.3)가 된다');
  const nonCrit = calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 2.0, target, source: ieHolder });
  assert(Math.abs(nonCrit - 100) < 1e-6, '무한의 대검: 치명타가 아니면 피해량 보너스가 전혀 적용되지 않는다');
  const noItem = calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: true, critMultiplier: 2.0, target });
  assert(Math.abs(noItem - 200) < 1e-6, '무한의 대검 미소지: 기존 치명타 공식(critMultiplier 그대로)이 전혀 바뀌지 않는다(회귀 없음)');

  // 경계(어둠)의 임시 방어구/마법 관통력(itemTempArmorPenPercent/itemTempMagicPenPercent).
  const armorTarget = { armor: 100, magicResist: 100 };
  const darkHolder = { itemTempArmorPenPercent: 0.30, itemBonusArmorPenMultiplier: 1 };
  const physWithPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.PHYSICAL, target: armorTarget, source: darkHolder });
  assert(Math.abs(physWithPen - 200 * 100 / (100 + 100 * (1 - 0.30))) < 1e-6, '경계(어둠): 임시 방어구 관통력 30%가 물리 피해 공식에 정확히 반영된다');
  const magicWithPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.MAGICAL, target: armorTarget, source: { itemTempMagicPenPercent: 0.30 } });
  assert(Math.abs(magicWithPen - 200 * 100 / (100 + 100 * (1 - 0.30))) < 1e-6, '경계(어둠): 임시 마법 관통력 30%가 마법 피해 공식에 정확히 반영된다');

  // 벼락폭풍검(창공)의 임시 물리 관통력(itemTempArmorPenFlat)이 기존
  // 영구 관통력(itemBonusArmorPenFlat)과 함께 합산되는지.
  const stormsurgeHolder = { itemBonusArmorPenFlat: 10, itemTempArmorPenFlat: 15 };
  const withFlatPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.PHYSICAL, target: armorTarget, source: stormsurgeHolder });
  assert(Math.abs(withFlatPen - 200 * 100 / (100 + (100 - 25))) < 1e-6, '벼락폭풍검(창공): 임시 물리 관통력(15)이 영구 관통력(10)과 합산(총 25)되어 반영된다');
}

// ========================================================================
// Part B: item_data.js + item_system.js - 나머지 전부
// ========================================================================
let now = 1000000;
const appliedStatuses = [];
const dealtDamages = [];
const stubs2 = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  updateBars: () => {},
  getTurretGameTimeSec: () => 0,
  getGrievousPercent: () => 0,
  getHealReceivedMultiplier: (t) => 1 + ((t && t.itemHealingReceivedBonusPercent) || 0),
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
  getWorldPosition: (e) => (e && e.root && e.root.position) || (e && e.mesh && e.mesh.position) || (e && e.position) || e,
  getHorizontalDistance: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)),
  worldDistanceToLol: (d) => d,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context2 = vm.createContext(stubs2);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.ITEM_ORDER = ITEM_ORDER;
this.ITEM_CATEGORIES = ITEM_CATEGORIES;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnTakeDamage = itemOnTakeDamage;
this.itemOnChampionTakedown = itemOnChampionTakedown;
this.itemOnChampionDeath = itemOnChampionDeath;
this.applyItemPhysicalVamp = applyItemPhysicalVamp;
this.useItem = useItem;
`, context2);
const {
  ITEM_DATA, ITEM_CATEGORIES, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnBasicAttackHit, itemOnDamageDealt, itemOnTakeDamage, itemOnChampionTakedown, itemOnChampionDeath,
  applyItemPhysicalVamp, useItem,
} = context2;

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
    itemTempADBonus: 0, itemTempArmorBonus: 0, itemTempMrBonus: 0,
    itemTempArmorPenFlat: 0, itemTempArmorPenPercent: 0, itemTempMagicPenPercent: 0,
    itemBonusCritDamagePercent: 0,
    _itemLastDealtChampionDamageAt: 0, _itemLastTookChampionDamageAt: 0,
    trinket: { id: 'stealthWard', charges: 2 }, _placedWards: [], statusEffects: [],
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 9,
    championId: 'testchamp',
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340, baseMoveSpeed: 340, percentMoveSpeedBonus: 0, flatMoveSpeedBonus: 0 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0) + (this.itemTempADBonus || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0);
      this.stats.armor = 30 + (this.itemBonusArmor || 0) + (this.itemTempArmorBonus || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0) + (this.itemTempMrBonus || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ========================================================================
// 하위템 1종 + 조합 비용 정합성
// ========================================================================
{
  assert(!!ITEM_DATA.feralization, '야수화: ITEM_DATA에 반영됨');
  assert(ITEM_CATEGORIES.find((c) => c.id === 'epic').items.includes('feralization'), '야수화: 서사급 탭에 등록됨');
  const mainIds = ['mortalReminder', 'vigilance', 'wrathblade', 'infinityEdge', 'immortalShieldbow', 'bloodthirster', 'youmuusGhostblade', 'stormsurge', 'hubris', 'fortressBreaker', 'serylasGrudge'];
  for (const id of mainIds) {
    const item = ITEM_DATA[id];
    assert(!!item && !!item.recipe, `${id}: recipe 보유`);
    const sum = item.recipe.reduce((s, c) => s + (ITEM_DATA[c] ? ITEM_DATA[c].cost : NaN), 0);
    assert(sum <= item.cost, `${id}: 하위템 가격 합(${sum})이 완제품 가격(${item.cost})을 넘지 않는다`);
  }
}

// ========================================================================
// 필멸자의 운명 - 고통스러운 상처(기존 grievousOnHitPassive 재사용)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'mortalReminder');
  assert(Math.abs(ctrl.itemGrievousOnHitPercent - 0.40) < 1e-9 && ctrl.itemGrievousOnHitDurationSec === 3.0, '필멸자의 운명: 고통스러운 상처(40%, 3초)가 기존 공용 필드로 정확히 집계된다');
}

// ========================================================================
// 경계 - 그림자(온히트 하이브리드) + 빛과 어둠(번갈아 중첩)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ bonusAD: 50 });
  buyItem(ctrl, 'vigilance');
  ctrl.stats.abilityPower = 100; // recomputeStats()가 구매 시점에 itemBonusAP(0)로 덮어쓰므로 구매 이후에 설정
  const target = makeTarget();
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  // 그림자: 30 + 추가공격력(50+30=80, 아이템 자체 AD30 포함)*10% + 주문력100*10% = 30+8+10=48
  const bonusAD = (ctrl.itemBonusAD || 0) + (ctrl.bonusAD || 0);
  const expectedShadow = 30 + bonusAD * 0.10 + 100 * 0.10;
  const shadowHit = dealtDamages.find((d) => d.result.damageType === 'MAGICAL');
  assert(!!shadowHit && Math.abs(shadowHit.result.rawDamage - expectedShadow) < 1e-6, `경계(그림자): 고정30+추가공격력10%(${bonusAD}*0.1)+주문력10%(100*0.1) = ${expectedShadow} 온히트 마법 피해`);

  // 빛과 어둠 - 첫 챔피언 공격은 빛(방어력/마법저항력), 두 번째는 어둠(관통력).
  assert(ctrl.itemTempArmorBonus > 0 && ctrl.itemTempMrBonus > 0, '경계(빛과 어둠): 첫 번째 챔피언 공격은 "빛" - 방어력/마법저항력 증가');
  assert(ctrl.itemTempArmorPenPercent === 0, '경계(빛과 어둠): 첫 번째 공격에서는 아직 "어둠"(관통력) 효과가 없다');
  const firstLight = ctrl.itemTempArmorBonus;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(Math.abs(ctrl.itemTempArmorPenPercent - 0.10) < 1e-9 && Math.abs(ctrl.itemTempMagicPenPercent - 0.10) < 1e-9, '경계(빛과 어둠): 두 번째 공격은 "어둠" - 방어구/마법 관통력 10%(1중첩)');
  itemOnBasicAttackHit(ctrl, target, false);
  assert(ctrl.itemTempArmorBonus > firstLight, '경계(빛과 어둠): 세 번째 공격(다시 "빛")은 2중첩째라 첫 중첩보다 더 큰 방어력 보너스');
  itemOnBasicAttackHit(ctrl, target, false); // 어둠 2중첩
  itemOnBasicAttackHit(ctrl, target, false); // 빛 3중첩(최대)
  const maxLight = ctrl.itemTempArmorBonus;
  assert(Math.abs(maxLight - firstLight * 3) < 1e-6, '경계(빛과 어둠): 빛 3중첩 값이 1중첩 값의 정확히 3배(원문의 "최대 18~24"가 "6~8"의 3배와 일치)');
  itemOnBasicAttackHit(ctrl, target, false); // 어둠 3중첩(최대)
  assert(Math.abs(ctrl.itemTempArmorPenPercent - 0.30) < 1e-9, '경계(빛과 어둠): 어둠 3중첩 시 관통력이 정확히 30%(원문의 "최대 30%")');

  // 만료되면 중첩이 0으로 리셋되고 다음 적용은 다시 1중첩부터 시작.
  now += 5100;
  itemSystemTick(ctrl, 5.1);
  assert(ctrl.itemTempArmorBonus === 0 && ctrl.itemTempArmorPenPercent === 0, '경계(빛과 어둠): 5초가 지나면 빛/어둠 보너스 둘 다 사라진다');
}

// ========================================================================
// 구인수의 격노검 - 분노(온히트 마법 피해) + 들끓는 일격(AS 스택+2배 적중)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'wrathblade');
  const target = makeTarget();
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - 30) < 1e-6, '구인수의 격노검(분노): 기본 공격 시 30 고정 마법 피해(1중첩, 아직 2배 아님)');
  appliedStatuses.length = 0;
  const asBuff = appliedStatuses.find((a) => a.effect.id === 'itemWrathbladeAS');
  // 위 블록에서 appliedStatuses를 비웠으므로 이번엔 새 호출 이후 상태를 직접 확인.
  itemOnBasicAttackHit(ctrl, target, false); // 2중첩
  itemOnBasicAttackHit(ctrl, target, false); // 3중첩
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false); // 4중첩(최대) - 여기서부터 "최대 중첩" 카운트 1
  assert(dealtDamages.length === 1, '구인수의 격노검(들끓는 일격): 4중첩 도달 직후(1번째 평타)는 아직 2배 적중이 아니다');
  itemOnBasicAttackHit(ctrl, target, false); // 최대 중첩 2번째
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false); // 최대 중첩 3번째 - 2배 적중
  assert(dealtDamages.length === 2 && dealtDamages.every((d) => Math.abs(d.result.rawDamage - 30) < 1e-6), '구인수의 격노검(들끓는 일격): 최대 중첩에서 3번째 평타마다 "분노"가 2번 적용된다');
}

// ========================================================================
// 불멸의 철갑궁 - 생명선(레벨 비례 고정 보호막, 감쇠 없음)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ champLevel: 1, hp: 800, maxHp: 1000 }); // maxHp 30% = 300
  buyItem(ctrl, 'immortalShieldbow');
  const result = itemOnTakeDamage(ctrl, 450, 'PHYSICAL'); // 800-450=350... need below 300
  assert(result === 450, '불멸의 철갑궁(생명선): 피해량 자체는 바꾸지 않는다(다른 생명선류와 동일)');
}
{
  const ctrlLv1 = makeFakeCtrl({ champLevel: 1, hp: 800, maxHp: 1000 });
  buyItem(ctrlLv1, 'immortalShieldbow');
  itemOnTakeDamage(ctrlLv1, 600, 'PHYSICAL'); // 800-600=200 < 300(30%) -> 발동
  assert(Math.abs(ctrlLv1.shield - 400) < 1e-6, '불멸의 철갑궁(생명선): 1레벨 근접 보호막은 최소값(400) 그대로');

  const ctrlLv18 = makeFakeCtrl({ champLevel: 18, hp: 800, maxHp: 1000 });
  buyItem(ctrlLv18, 'immortalShieldbow');
  itemOnTakeDamage(ctrlLv18, 600, 'PHYSICAL');
  assert(Math.abs(ctrlLv18.shield - 700) < 1e-6, '불멸의 철갑궁(생명선): 18레벨 근접 보호막은 최대값(700)까지 성장');

  // 감쇠 없이 3초간 그대로 유지(스테락의도전과 달리 _itemSterakShieldState를 쓰지 않음).
  now += 2000;
  itemSystemTick(ctrlLv18, 2.0);
  assert(Math.abs(ctrlLv18.shield - 700) < 1e-6, '불멸의 철갑궁(생명선): 스테락의도전과 달리 시간이 지나도 점차 감소하지 않는다');
  now += 1200;
  itemSystemTick(ctrlLv18, 1.2);
  assert(ctrlLv18.shield === 0, '불멸의 철갑궁(생명선): 3초(지속시간)가 지나면 한 번에 사라진다');
}

// ========================================================================
// 피바라기 - 생명력 회복 + 영액의 보호막(초과 회복량을 보호막으로 전환)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ champLevel: 18 });
  buyItem(ctrl, 'bloodthirster');
  assert(Math.abs(ctrl.itemPhysicalVampPercent - 0.15) < 1e-9, '피바라기: 생명력 회복 15% 정확히 적용(기존 공용 필드)');
  // recomputeStats()가 구매 시점에 maxHp를 다시 계산하므로, 테스트에 필요한
  // hp/maxHp는 구매 이후에 직접 설정한다(essenceReaver/hubris 때와 동일한 이유).
  ctrl.maxHp = 1000; ctrl.hp = 950;
  // finalDmg=1000 -> 흡혈량 150, 950+150=1100, maxHp=1000이므로 초과분 100.
  applyItemPhysicalVamp(ctrl, 1000, 'PHYSICAL', true); // 기본 공격 피해(생명력 흡수는 평타에만)
  assert(ctrl.hp === 1000, '피바라기(영액의 보호막): 체력은 최대치에서 멈춘다');
  assert(Math.abs(ctrl.shield - 100) < 1e-6, '피바라기(영액의 보호막): 최대 체력을 초과하는 회복량(100)이 보호막으로 전환된다');

  // 보호막은 레벨 비례 최대치(18레벨=315)에서 캡된다 - 충분히 여러 번
  // 초과 회복시켜 315를 넘어서려 해도 캡에 걸리는지 확인한다.
  for (let i = 0; i < 10; i++) applyItemPhysicalVamp(ctrl, 1000, 'PHYSICAL', true); // 기본 공격 피해(생명력 흡수는 평타에만)
  assert(ctrl.shield === 315, '피바라기(영액의 보호막): 보호막이 레벨 비례 최대치(18레벨=315)에서 정확히 캡된다');
}

// ========================================================================
// 요우무의 유령검 - 출몰(전투 이탈 시 이동속도) + 망령의 발걸음(액티브)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'youmuusGhostblade');
  appliedStatuses.length = 0;
  itemSystemTick(ctrl, 0.1); // 전투 기록이 전혀 없으므로(0) 이미 "전투 이탈" 상태
  const outOfCombatBuff = appliedStatuses.find((a) => a.effect.id === 'itemYoumuuOutOfCombatMs');
  assert(!!outOfCombatBuff && Math.abs(outOfCombatBuff.effect.value - 20) < 1e-9, '요우무의 유령검(출몰): 전투 기록이 없으면(전투 이탈) 근접 기준 이동속도 +20');

  ctrl._itemLastDealtChampionDamageAt = now; // 방금 전투 중이 됨
  appliedStatuses.length = 0;
  itemSystemTick(ctrl, 0.1);
  assert(!appliedStatuses.some((a) => a.effect.id === 'itemYoumuuOutOfCombatMs'), '요우무의 유령검(출몰): 전투 중에는 이동속도 버프가 걸리지 않는다');

  appliedStatuses.length = 0;
  assert(useItem(ctrl, 0) === true, '망령의 발걸음: 사용 성공');
  const ghostBuff = appliedStatuses.find((a) => a.effect.id === 'itemGhostStepMs');
  assert(!!ghostBuff && Math.abs(ghostBuff.effect.value - 0.20) < 1e-9 && ghostBuff.effect.duration === 6.0, '망령의 발걸음(근접): 6초간 이동속도 +20%');
  assert(useItem(ctrl, 0) === false, '망령의 발걸음: 재사용대기시간(45초) 중에는 다시 사용할 수 없다');
}

// ========================================================================
// 벼락폭풍검 - 전류 자극(스킬 피해로 충전) + 창공(평타로 소모)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'stormsurge');
  const target = makeTarget({ hp: 1000, maxHp: 1000 });
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 0, '벼락폭풍검(창공): 충전되지 않은 상태에서는 발동하지 않는다');

  itemOnDamageDealt(ctrl, target, 50, 'PHYSICAL'); // 챔피언에게 피해 -> 충전 준비
  assert(ctrl._itemSkillChargeReady === true, '벼락폭풍검(전류 자극): 챔피언에게 피해를 입히면 충전 상태가 준비된다');
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(dealtDamages.length === 1 && Math.abs(dealtDamages[0].result.rawDamage - 1000 * 0.09) < 1e-6, '벼락폭풍검(창공): 충전 소모 시 대상 현재 체력의 9%(근접) 추가 물리 피해');
  assert(Math.abs(ctrl.itemTempArmorPenFlat - 15) < 1e-9, '벼락폭풍검(창공): 4초간 물리 관통력 +15(근접) 획득');
  assert(ctrl._itemSkillChargeReady === false, '벼락폭풍검(창공): 충전은 한 번 쓰면 소모된다');

  // 비챔피언 대상 최대 200 캡.
  itemOnDamageDealt(ctrl, target, 50, 'PHYSICAL');
  const bigMinion = makeTarget({ isChampion: false, isMinion: true, hp: 5000, maxHp: 5000 });
  dealtDamages.length = 0;
  itemOnBasicAttackHit(ctrl, bigMinion, false);
  assert(Math.abs(dealtDamages[0].result.rawDamage - 200) < 1e-6, '벼락폭풍검(창공): 비챔피언 대상은 최대 200으로 캡(체력 5000의 9%=450이어도 200으로 제한)');
}

// ========================================================================
// 오만 - 명성(처치마다 쌓이는 공격력, 90초)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'hubris');
  const victim1 = { id: 'v1' };
  itemOnDamageDealt(ctrl, Object.assign(victim1, { isChampion: true }), 50, 'PHYSICAL');
  context2.controller = ctrl;
  itemOnChampionDeath(victim1);
  assert(Math.abs(ctrl.itemTempADBonus - 15) < 1e-9, '오만(명성): 첫 처치 시 공격력 +15(12+3*1)');
  const adAfterFirst = ctrl.stats.attackDamage;
  // 오만 자체 스탯(공격력+55)도 이미 itemBonusAD에 들어가 있으므로 기준은 100+55.
  assert(adAfterFirst === 100 + 55 + 15, '오만(명성): 실제 stats.attackDamage에도 반영된다(기존 공격력+55 위에 추가)');

  const victim2 = { id: 'v2' };
  itemOnDamageDealt(ctrl, Object.assign(victim2, { isChampion: true }), 50, 'PHYSICAL');
  itemOnChampionDeath(victim2);
  assert(Math.abs(ctrl.itemTempADBonus - 18) < 1e-9, '오만(명성): 두 번째 처치 시 공격력이 +18(12+3*2)로 더 늘어난다(누적)');

  now += 90100;
  itemSystemTick(ctrl, 90.1);
  assert(ctrl.itemTempADBonus === 0 && ctrl.stats.attackDamage === 100 + 55, '오만(명성): 90초가 지나면 공격력 보너스와 처치 누적이 전부 사라진다(오만 자체 공격력+55만 남는다)');
}

// ========================================================================
// 요새파괴자 - 성형작약(스킬 피해 시 추가 고정 피해) + 파괴 공작(포탑 대상)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'fortressBreaker');
  const target = makeTarget({ hp: 1000, maxHp: 1000 });
  itemOnDamageDealt(ctrl, target, 50, 'PHYSICAL');
  // 근접: 50 + 물리관통력(itemBonusArmorPenFlat=22, 요새파괴자 자체)*150% = 50+33=83.
  assert(Math.abs((1000 - target.hp) - 83) < 1e-6, `성형작약: 50 + 물리 관통력(22)*150% = 83 추가 고정 피해`);
  const target2 = makeTarget({ hp: 1000, maxHp: 1000 });
  itemOnDamageDealt(ctrl, target2, 50, 'PHYSICAL');
  assert(target2.hp === 1000, '성형작약: 재사용대기시간(20초) 중에는 다시 발동하지 않는다');

  // 파괴 공작 - 처치 관여 후 포탑 대상 다음 평타에서 거대한 고정 피해(DOT).
  itemOnChampionTakedown(ctrl);
  assert((ctrl._itemSabotageArmedUntil || 0) > now, '파괴 공작: 처치 관여 시 무장된다');
  const turret = { isChampion: false, isTurret: true, isStructure: true, hp: 5000, maxHp: 5000, statusEffects: [] };
  appliedStatuses.length = 0;
  itemOnBasicAttackHit(ctrl, turret, false);
  const sabotageDot = appliedStatuses.find((a) => a.effect.id === 'itemFortressBreakerSabotage');
  assert(!!sabotageDot, '파괴 공작: 무장된 상태에서 포탑을 공격하면 거대한 고정 피해(DOT)가 걸린다');
  // 근접: 300 + 22*2500% = 300 + 550 = 850.
  assert(Math.abs(sabotageDot.effect.totalDamage - 850) < 1e-6, '파괴 공작: 300 + 물리 관통력(22)*2500% = 850의 고정 피해(3초 DOT)');
  assert((ctrl._itemSabotageArmedUntil || 0) === 0, '파괴 공작: 한 번 쓰면 무장이 소모된다');
}

// ========================================================================
// 세릴다의 원한 - 매서운 추위(체력 50% 이하 대상에게 피해 시 둔화)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'serylasGrudge');
  const highHp = makeTarget({ hp: 600, maxHp: 1000 });
  appliedStatuses.length = 0;
  itemOnDamageDealt(ctrl, highHp, 50, 'PHYSICAL');
  assert(!appliedStatuses.some((a) => a.effect.id === 'itemSeryldaSlow'), '매서운 추위: 체력이 50% 초과인 대상에게는 둔화를 걸지 않는다');

  const lowHp = makeTarget({ hp: 500, maxHp: 1000 });
  appliedStatuses.length = 0;
  itemOnDamageDealt(ctrl, lowHp, 50, 'PHYSICAL');
  const slow = appliedStatuses.find((a) => a.effect.id === 'itemSeryldaSlow');
  assert(!!slow && Math.abs(slow.effect.value - 0.30) < 1e-9 && slow.effect.duration === 1.0, '매서운 추위: 체력 50% 이하 대상에게 피해를 입히면 1초간 30% 둔화');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
