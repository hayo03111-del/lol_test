// Node vm harness for the "전설급 아이템" 9차분(방어형/유틸 - 벤시의장막~
// 해신작쇼, 8종 + 하위템 6종), sourced directly from the user's original
// uploaded item text (1216~1288줄 + 521~610줄의 하위템).
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
const stubs = {
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
  findEnemiesInRadius: (pos, radius) => stubs._radiusHits || [],
  applyDamage: (target, result) => {
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
const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnTakeDamage = itemOnTakeDamage;
this.useItem = useItem;
this.combineCost = combineCost;
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnBasicAttackHit, itemOnDamageDealt, itemOnTakeDamage, useItem, combineCost,
} = context;

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1, setScalar(v) { this.x = this.y = this.z = v; } } },
    items: [], gold: 1000000, boots: null, team: 'BLUE', state: 'IDLE',
    itemBonusAD: 0, itemBonusAP: 0, itemBonusMaxHp: 0, itemBonusMana: 0,
    itemBonusArmor: 0, itemBonusMr: 0, itemBonusAttackSpeedPercent: 0,
    itemAllDamageVampPercent: 0, itemMinionBonusDamage: 0, itemOnHitHeal: 0,
    itemBonusCritChance: 0, itemBonusAbilityHaste: 0, itemBonusUltimateHaste: 0,
    itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0, itemHealingReceivedBonusPercent: 0,
    itemBonusMoveSpeedLol: 0, itemBonusMoveSpeedPercent: 0, itemBonusMagicPenFlat: 0, itemBonusArmorPenFlat: 0,
    itemSlowResistPercent: 0, itemTenacityPercent: 0,
    itemGrievousOnHitPercent: 0, itemGrievousOnHitDurationSec: 0, itemPhysicalVampPercent: 0.20,
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
    trinket: null, _placedWards: [], statusEffects: [], currentTarget: null, isUntargetable: false,
    hp: 2000, maxHp: 2000, mp: 500, maxMp: 500, champLevel: 9,
    championId: 'testchamp', skillPoints: 0,
    cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    _die() { this.state = 'DEAD'; this.hp = 0; },
    recomputeStats() {
      this.maxHp = 2000 + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = 500 + (this.itemBonusMana || 0);
      this.stats.attackDamage = 100 + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0) + (this.itemTempADBonus || 0);
      this.stats.abilityPower = (this.itemBonusAP || 0) * (1 + (this.itemTotalApMultiplierBonus || 0));
      this.stats.armor = 30 + (this.itemBonusArmor || 0) + (this.itemTempArmorBonus || 0);
      this.stats.magicResist = 30 + (this.itemBonusMr || 0) + (this.itemTempMrBonus || 0);
      this.stats.critChance = (this.itemBonusCritChance || 0);
    },
  }, overrides);
}
function makeTarget(overrides = {}) {
  return Object.assign({ isChampion: true, hp: 1000, maxHp: 1000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } }, mesh: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ========================================================================
// 조합 비용 정합성
// ========================================================================
{
  const newItems = ['negatronMantle', 'chainmailVest', 'crystallineBracer', 'ghostlyHood', 'verdantBarrier', 'pursuerWristGuard',
    'banshees', 'zhonyasHourglass', 'rabadonsDeathcap', 'heartsteel', 'warmogsArmor', 'endlessDespair', 'spiritVisage', 'abyssalMask'];
  for (const id of newItems) {
    const item = ITEM_DATA[id];
    assert(!!item, `"${id}"가 ITEM_DATA에 존재한다`);
    if (!item || !item.recipe) continue;
    const sum = item.recipe.reduce((s, cid) => s + ((ITEM_DATA[cid] && ITEM_DATA[cid].cost) || 0), 0);
    assert(sum <= item.cost, `"${item.nameKo}"(${id}): 하위템 가격 합(${sum})이 완제품 가격(${item.cost})을 넘지 않는다`);
  }
}

// ========================================================================
// 버그 수정 확인 - 마법사의 최후(witsEnd)가 이제 음전자 망토를 하위템으로 쓴다.
// ========================================================================
{
  assert(ITEM_DATA.witsEnd.recipe.includes('negatronMantle'), '버그 수정: 마법사의 최후가 이제 negatronCloak이 아니라 negatronMantle(음전자 망토)을 하위템으로 쓴다(원문 그대로)');
}

// ========================================================================
// 벤시의장막 - 무효화(적 챔피언의 다음 스킬 1회만 차단) + 챔피언에게 피해를
// "입으면" 재사용대기시간 초기화
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'needlesslyLargeRod');
  buyItem(ctrl, 'verdantBarrier');
  buildOrBuyItem(ctrl, 'banshees');
  // 방어막이 생성될 때까지 40초 틱.
  now += 40000;
  itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemNullifyShieldUp === true, '벤시의장막: 재사용대기시간(40초)이 지나면 방어막이 생성된다');

  const enemyChamp = makeTarget({ championId: 'enemy' });
  const minion = { isMinion: true };
  const turret = { isTurret: true };
  assert(itemOnTakeDamage(ctrl, 200, 'PHYSICAL', minion, { isBasicAttack: true }) === 200, '벤시의장막: 미니언 기본 공격은 막지 않는다');
  assert(itemOnTakeDamage(ctrl, 300, 'PHYSICAL', turret, { isBasicAttack: true }) === 300, '벤시의장막: 포탑 공격은 막지 않는다');
  assert(itemOnTakeDamage(ctrl, 100, 'TRUE', null, { isStatusTick: true }) === 100, '벤시의장막: 출처 없는 피해(우물 등)는 막지 않는다');
  assert(itemOnTakeDamage(ctrl, 150, 'PHYSICAL', enemyChamp, { isBasicAttack: true }) === 150, '벤시의장막: 적 챔피언의 기본 공격은 막지 않는다(스킬 전용 주문 방어막)');
  assert(itemOnTakeDamage(ctrl, 50, 'MAGICAL', enemyChamp, { isStatusTick: true }) === 50, '벤시의장막: 적 챔피언 스킬의 도트 틱은 막지 않는다');
  assert(ctrl._itemNullifyShieldUp === true, '벤시의장막: 스킬이 아닌 피해로는 방어막이 소모되지 않는다');

  const blocked = itemOnTakeDamage(ctrl, 500, 'MAGICAL', enemyChamp, {});
  assert(blocked === 0, '벤시의장막: 적 챔피언의 스킬 피해를 완전히 차단한다(0 반환)');
  assert(ctrl._itemNullifyShieldUp === false, '벤시의장막: 방어막을 한 번 쓰면 소모된다');

  // 내가 챔피언에게 피해를 "입혀도" 초기화되지 않는다(예전 버그).
  const before = ctrl._itemNullifyReadyAt;
  now += 1000;
  itemOnDamageDealt(ctrl, makeTarget(), 100, 'MAGICAL');
  assert(ctrl._itemNullifyReadyAt === before, '벤시의장막: 챔피언에게 피해를 입혀도 재사용대기시간은 그대로다(원문은 "입으면")');

  // 챔피언에게 피해를 "입으면" 초기화된다(아직 방어막이 없을 때).
  itemOnTakeDamage(ctrl, 100, 'PHYSICAL', enemyChamp, { isBasicAttack: true });
  assert(ctrl._itemNullifyReadyAt === now + ITEM_DATA.banshees.nullifyPassive.icdSec * 1000, '벤시의장막: 챔피언에게 피해를 입으면 재사용대기시간이 그 순간부터 다시 40초로 초기화된다');
  assert(ctrl._itemNullifyReadyAt > before, '벤시의장막: 초기화된 재사용대기시간이 원래보다 더 늦춰진다(그만큼 충전이 늦어짐)');
  now += 1000;
  const afterChamp = ctrl._itemNullifyReadyAt;
  itemOnTakeDamage(ctrl, 100, 'PHYSICAL', minion, { isBasicAttack: true });
  assert(ctrl._itemNullifyReadyAt === afterChamp, '벤시의장막: 미니언에게 맞는 건 초기화 조건이 아니다');
}

// 신록의 장벽 - 같은 무효화지만 초기화 조항이 없다.
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'verdantBarrier');
  now += 60000;
  itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemNullifyShieldUp === true, '신록의 장벽: 재사용대기시간(60초) 뒤 방어막 생성');
  itemOnTakeDamage(ctrl, 500, 'MAGICAL', makeTarget({ championId: 'enemy' }), {});
  const readyAt = ctrl._itemNullifyReadyAt;
  now += 1000;
  itemOnTakeDamage(ctrl, 100, 'PHYSICAL', makeTarget({ championId: 'enemy' }), { isBasicAttack: true });
  assert(ctrl._itemNullifyReadyAt === readyAt, '신록의 장벽: 챔피언에게 피해를 입어도 재사용대기시간이 초기화되지 않는다(벤시의장막 전용 조항)');
}

// ========================================================================
// 존야의모래시계 - 시간 정지(경직: 무적+대상 지정 불가+STUN, 120초 CD)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'needlesslyLargeRod');
  buyItem(ctrl, 'pursuerWristGuard');
  buildOrBuyItem(ctrl, 'zhonyasHourglass');
  const slotIndex = ctrl.items.findIndex((s) => s.id === 'zhonyasHourglass');
  const used = useItem(ctrl, slotIndex);
  assert(used === true, '존야의모래시계: 사용 성공');
  assert(ctrl.isUntargetable === true, '존야의모래시계: 사용하면 대상 지정 불가 상태가 된다');
  const stun = appliedStatuses.filter((a) => a.effect.id === 'itemStasisStun').pop();
  assert(!!stun && stun.effect.duration === 2.50, '존야의모래시계: 2.5초간 STUN(이동/시전 불가) 상태이상도 함께 건다');
  const secondUse = useItem(ctrl, slotIndex);
  assert(secondUse === false, '존야의모래시계: 재사용대기시간(120초) 중에는 다시 사용할 수 없다');

  now += 2500;
  itemSystemTick(ctrl, 0.016);
  assert(ctrl.isUntargetable === false, '존야의모래시계: 경직(2.5초)이 끝나면 대상 지정 불가가 풀린다');
}

// ========================================================================
// 추적자의 팔목 보호대 - 1회 한정 사용 + 사용 후 부러진 팔목 보호대로 변신
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'amplifyingTome'); buyItem(ctrl, 'chainVest'); buyItem(ctrl, 'amplifyingTome');
  buildOrBuyItem(ctrl, 'pursuerWristGuard');
  const slotIndex = ctrl.items.findIndex((s) => s.id === 'pursuerWristGuard');
  const used = useItem(ctrl, slotIndex);
  assert(used === true, '추적자의 팔목 보호대: 첫 사용 성공');
  assert(ctrl.items[slotIndex].id === 'brokenWristGuard', '추적자의 팔목 보호대: 한 번 쓰면 부러진 팔목 보호대로 자동 변신한다');
  const secondUse = useItem(ctrl, slotIndex);
  assert(secondUse === false, '추적자의 팔목 보호대: 변신한 뒤(부러진 팔목 보호대는 stasisActive가 없음)에는 사용할 수 없다');
}

// ========================================================================
// 라바돈의 죽음모자 - 주문력 130(위키 교차검증) + 총 주문력 30% 증가
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'needlesslyLargeRod'); buyItem(ctrl, 'needlesslyLargeRod');
  buildOrBuyItem(ctrl, 'rabadonsDeathcap');
  assert(ctrl.itemBonusAP === 130, '라바돈의 죽음모자: 주문력 130(위키 교차검증값)이 정확히 집계된다');
  assert(Math.abs(ctrl.itemTotalApMultiplierBonus - 0.30) < 1e-9, '라바돈의 죽음모자: 총 주문력 배율에 30%가 집계된다');
  assert(Math.abs(ctrl.stats.abilityPower - 130 * 1.30) < 1e-6, '라바돈의 죽음모자: 최종 주문력이 130*1.3=169로 정확히 곱연산된다');
}

// ========================================================================
// 강철심장 - 거인의 흡수(700 사거리 내 충전, 70+체력6% 피해+10% 영구 체력
// 획득) + 거인(모델 크기)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'giantsBelt'); buyItem(ctrl, 'crystallineBracer'); buyItem(ctrl, 'giantsBelt');
  buildOrBuyItem(ctrl, 'heartsteel');
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  ctrl.currentTarget = target;

  // 3초간 충전.
  for (let i = 0; i < 3; i++) { now += 1000; itemSystemTick(ctrl, 1.0); }
  assert(ctrl._itemHeartsteelReady === true, '거인의 흡수: 700 사거리 내 챔피언을 3초간 유지하면 충전이 완료된다');

  const expectedBonus = 70 + ctrl.maxHp * 0.06;
  const before = target.hp;
  itemOnBasicAttackHit(ctrl, target, false);
  assert(Math.abs((before - target.hp) - expectedBonus) < 1e-6, '거인의 흡수: 충전된 공격이 70+체력6%의 추가 물리 피해를 입힌다');
  assert(Math.abs((ctrl._itemHeartsteelPermanentHpGain || 0) - expectedBonus * 0.10) < 1e-6, '거인의 흡수: 그 피해의 10%만큼 영구 최대 체력을 얻는다');
  assert(ctrl._itemHeartsteelReady === false, '거인의 흡수: 한 번 쓰면 충전이 소모된다');

  // 영구 체력 획득이 recomputeItemStats()를 다시 호출해도 사라지지 않는다(버그 방지 확인).
  const gainedHp = ctrl._itemHeartsteelPermanentHpGain;
  buyItem(ctrl, 'healthPotion');
  assert(Math.abs((ctrl.itemBonusMaxHp || 0) - (900 + gainedHp)) < 1e-6, '거인의 흡수: 다른 아이템을 사도(recomputeItemStats 재호출) 영구 최대 체력 획득분이 사라지지 않는다');

  // 거인(모델 크기) - maxHp가 900+a일 때 크기 증가 확인.
  itemSystemTick(ctrl, 0.016);
  const expectedScale = 1 + Math.min(0.30, (ctrl.maxHp / 1000) * 0.03);
  assert(Math.abs(ctrl.root.scale.x - expectedScale) < 1e-4, '거인: 최대 체력에 비례해 모델 크기가 커진다');
}

// ========================================================================
// 워모그의 갑옷 - 워모그의 활력(자기 참조 12% 추가 체력) + 워모그의 심장
// (추가 체력 2000 이상, 챔피언 8초/비챔피언 3초 무피해 시 초당 3% 회복)
// ========================================================================
{
  assert(ITEM_DATA.warmogsArmor.stats.maxHp === 1120, '워모그의 활력: 1000*1.12=1120으로 미리 계산된 최종 체력 스탯');
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'warmogsArmor');
  // 조합이 끝나면 하위템(거인의 허리띠 등)은 소모돼 인벤토리에서 사라지고
  // 워모그의 갑옷 자신의 스탯(1120)만 남는다 - 2000 문턱 테스트를 위해
  // 추가로 거인의 허리띠를 하나 더 사서 합계를 2000 이상으로 만든다.
  buyItem(ctrl, 'giantsBelt'); buyItem(ctrl, 'giantsBelt'); buyItem(ctrl, 'giantsBelt');
  assert((ctrl.itemBonusMaxHp || 0) >= 2000, `워모그의 심장: 추가 체력이 2000 이상인 테스트 상황을 만든다(got ${ctrl.itemBonusMaxHp})`);

  ctrl.hp = 1000; ctrl.maxHp = 3000;
  ctrl._itemLastTookChampionDamageAt = now; // 방금 챔피언에게 맞음
  itemSystemTick(ctrl, 1.0);
  assert(ctrl.hp === 1000, '워모그의 심장: 챔피언에게 맞은 지 8초가 안 지났으면 회복하지 않는다');

  now += 8100;
  itemSystemTick(ctrl, 1.0);
  assert(ctrl.hp > 1000, '워모그의 심장: 챔피언 기준 8초가 지나면 초당 3% 체력 회복이 시작된다');
}

// ========================================================================
// 끝없는 절망 - 고뇌(전투 중 4초마다 주변 적 챔피언에게 추가체력3% 마법
// 피해 + 피해량 250% 회복)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'chainmailVest'); buyItem(ctrl, 'kircheisShard'); buyItem(ctrl, 'rubyCrystal');
  buildOrBuyItem(ctrl, 'endlessDespair');
  ctrl.hp = 1000; ctrl.maxHp = 2000;
  ctrl._itemLastDealtChampionDamageAt = now;
  const target = makeTarget({ maxHp: 1000, hp: 1000 });
  stubs._radiusHits = [{ unit: target }];
  for (let i = 0; i < 4; i++) { now += 1000; itemSystemTick(ctrl, 1.0); }
  const expectedDmg = (ctrl.itemBonusMaxHp || 0) * 0.03;
  assert(Math.abs((1000 - target.hp) - expectedDmg) < 1e-6, '고뇌: 4초가 지나면 주변 적 챔피언에게 추가 체력 3%의 마법 피해를 입힌다');
  assert(Math.abs((ctrl.hp - 1000) - expectedDmg * 2.50) < 1e-6, '고뇌: 입힌 피해의 250%만큼 체력을 회복한다');
  stubs._radiusHits = [];
}

// ========================================================================
// 정령의형상 - 무한한 활력(받는 체력 회복/보호막 +25%)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'ghostlyHood'); buyItem(ctrl, 'kircheisShard');
  buildOrBuyItem(ctrl, 'spiritVisage');
  assert(Math.abs(ctrl.itemHealingReceivedBonusPercent - 0.25) < 1e-9, '무한한 활력: 25%가 정확히 집계된다');
}
{
  const ctx2 = vm.createContext({ ...stubs });
  vm.runInContext(itemDataSrc + '\n' + itemSystemSrc + `
this.ITEM_DATA = ITEM_DATA; this.buyItem = buyItem; this.buildOrBuyItem = buildOrBuyItem;
this.applyItemPhysicalVamp = applyItemPhysicalVamp;
`, ctx2);
  const ctrl = makeFakeCtrl();
  ctx2.buyItem(ctrl, 'ghostlyHood'); ctx2.buyItem(ctrl, 'kircheisShard');
  ctx2.buildOrBuyItem(ctrl, 'spiritVisage');
  ctrl.hp = 1000; ctrl.maxHp = 2000; ctrl.itemPhysicalVampPercent = 0.20;
  ctx2.applyItemPhysicalVamp(ctrl, 100, 'PHYSICAL', true); // 기본 공격 피해
  assert(Math.abs(ctrl.hp - (1000 + 100 * 0.20 * 1.25)) < 1e-6, '무한한 활력: 생명력 흡수로 받는 회복량도 25% 증폭된다(20*1.25=25)');
}

// ========================================================================
// 해신작쇼 - 공허 태생의 저항력(5초 이상 전투 지속 시 추가 방어력/마법
// 저항력 30%, 전투 종료 시 소멸)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'chainmailVest'); buyItem(ctrl, 'negatronMantle'); buyItem(ctrl, 'giantsBelt');
  buildOrBuyItem(ctrl, 'abyssalMask');
  // "전투 중" 판정은 최근 피해를 주거나받은 시각 기준 5초 윈도우라, 5초
  // 내내 버프가 유지되려면 그 사이에도 계속 전투 중이어야 한다(한 대만
  // 때리고 가만히 있으면 "전투 지속 5초" 판정 자체가 그 직전에 풀린다 -
  // 실제 플레이에서도 자연스러운 조건이라 중간에 피해를 계속 주는 것으로
  // 시뮬레이션한다).
  ctrl._itemLastDealtChampionDamageAt = now;
  const combatStartAt = now;
  for (let i = 0; i < 4; i++) { now += 1000; ctrl._itemLastDealtChampionDamageAt = now; itemSystemTick(ctrl, 1.0); }
  assert(!ctrl._itemAbyssalBuffActive, '공허 태생의 저항력: 4초(5초 미만)면 아직 발동하지 않는다');
  now += 2100; ctrl._itemLastDealtChampionDamageAt = now; itemSystemTick(ctrl, 2.1);
  assert(ctrl._itemAbyssalBuffActive === true, '공허 태생의 저항력: 5초 이상 전투가 이어지면 발동한다');
  assert(Math.abs(ctrl.itemTempArmorBonus - ctrl.itemBonusArmor * 0.30) < 1e-6, '공허 태생의 저항력: 추가 방어력의 30%만큼 임시 방어력을 얻는다');
  assert(Math.abs(ctrl.itemTempMrBonus - ctrl.itemBonusMr * 0.30) < 1e-6, '공허 태생의 저항력: 추가 마법저항력의 30%만큼 임시 마법저항력을 얻는다');

  // 전투가 끊기면(5초 이탈) 즉시 사라진다.
  now += 5100; itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemAbyssalBuffActive === false && ctrl.itemTempArmorBonus === 0, '공허 태생의 저항력: 전투가 끝나면(5초 이탈) 버프가 즉시 사라진다');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
