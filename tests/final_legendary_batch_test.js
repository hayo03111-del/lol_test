// Node vm 테스트 - 원문 마지막 배치(슈렐리아의군가/월석재생기/강철의
// 솔라리 팬던트/밴들파이프/제국의명령 + 공용 하위템 밴들유리 거울 +
// 서사급 금지된 우상) + 끝없는 갈망(기아/포식, 위키 교차검증) 검증.
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
  findEnemiesInRadius: () => [],
  applyDamage: (target, result) => {
    const dmg = result.rawDamage * (result.isCritical ? result.critMultiplier : 1);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return dmg;
  },
  calculateDamage: ({ rawDamage, isCritical, critMultiplier }) => Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier) : 1),
  computeChampionStats: () => ({ maxMp: 500, attackDamage: 60 }),
  THREE: {
    Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} clone(){return new this.constructor(this.x,this.y,this.z);} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;} applyQuaternion(){return this;} },
    ConeGeometry: class {}, MeshBasicMaterial: class {}, Mesh: class { constructor(){ this.position = { copy(){}, set(){}, y: 0 }; } },
  },
  lolRangeToWorld: (r) => r,
  getWorldPosition: (e) => (e && e.root && e.root.position) || (e && e.mesh && e.mesh.position) || e,
  getHorizontalDistance: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)),
  getCollisionRadius: () => 0,
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8');
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
const allySrc = fs.readFileSync(path.join(ROOT, 'src/core/ally_system.js'), 'utf8');
vm.runInContext(statusSrc + '\n' + allySrc + '\n' + itemDataSrc + '\n' + itemSystemSrc + `
this.placedAllies = placedAllies;
this.healAlly = healAlly;
this.shieldAlly = shieldAlly;
this.allyAbsorbIncoming = allyAbsorbIncoming;
this.tickAllyUnits = tickAllyUnits;
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnAbilityDispatch = itemOnAbilityDispatch;
this.itemOnTakeDamage = itemOnTakeDamage;
this.itemOnChampionDeath = itemOnChampionDeath;
this.useItem = useItem;
this.applyStatus = applyStatus;
this.combineCost = combineCost;
this.abilityHasteCooldown = abilityHasteCooldown;
this.applyItemVamp = applyItemVamp;
this.refreshUnitCcTags = () => {};
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnDamageDealt, itemOnBasicAttackHit, itemOnAbilityDispatch, itemOnTakeDamage,
  itemOnChampionDeath, useItem, combineCost, applyStatus, abilityHasteCooldown, applyItemVamp,
  placedAllies, healAlly, shieldAlly, allyAbsorbIncoming, tickAllyUnits,
} = context;
function makeAlly(x, z, overrides = {}) {
  const pos = { x, y: 0, z };
  return Object.assign({ isChampion: true, isAlly: true, team: 'BLUE', hp: 500, maxHp: 1000, shield: 0, shieldEntries: [], statusEffects: [], champLevel: 1, mesh: { position: pos }, root: { position: pos } }, overrides);
}
function setAllies(...list) { placedAllies.length = 0; placedAllies.push(...list); }

function makeFakeCtrl(overrides = {}) {
  return Object.assign({
    root: { position: new stubs.THREE.Vector3(0, 0, 0), quaternion: {} },
    items: [], gold: 1000000, boots: null, team: 'BLUE', state: 'IDLE',
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
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125, critChance: 0, moveSpeed: 340 },
    _die() { this.state = 'DEAD'; if (typeof itemOnChampionDeath === 'function') itemOnChampionDeath(this); },
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
// 조합 비용 정합성 - 새 아이템 7종.
// ========================================================================
{
  const newIds = ['bandleglassMirror', 'forbiddenIdol', 'shurelyasBattlesong', 'moonstoneRenewer', 'ironSolariLocket', 'bandlePipe', 'imperialMandate'];
  for (const id of newIds) {
    const item = ITEM_DATA[id];
    assert(!!item, id + ': ITEM_DATA에 정의돼 있다');
    if (item && item.recipe) {
      const sum = item.recipe.reduce((s, cid) => s + ((ITEM_DATA[cid] && ITEM_DATA[cid].cost) || 0), 0);
      assert(sum <= item.cost, id + ': 하위템 합(' + sum + ')이 완제품 가격(' + item.cost + ')을 넘지 않는다');
      assert(combineCost(item) === item.cost - sum, id + ': 조합 비용이 차액과 일치한다');
    }
  }
}

// ========================================================================
// 끝없는 갈망 - 기아(추가 공격력 비례 스킬 가속, 근접13%/원거리10%+5)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'eternalThirst');
  ctrl.itemBonusAD = 100; // 추가 공격력 100
  ctrl.recomputeStats();
  itemSystemTick(ctrl, 0.016);
  const expectedMeleeAh = 5 + 100 * 0.13; // 근접(기본 attackRange 125 <= 300)
  assert(Math.abs(ctrl.itemDynamicAbilityHaste - expectedMeleeAh) < 1e-6, `끝없는 갈망(기아): 근접 기준 스킬 가속 5+추가공격력13%(got ${ctrl.itemDynamicAbilityHaste}, 기대 ${expectedMeleeAh})`);
  const baseCd = 10;
  const withAh = abilityHasteCooldown(ctrl, baseCd, 'Q');
  assert(withAh < baseCd, '끝없는 갈망(기아): 실제로 쿨다운 계산에 반영된다(abilityHasteCooldown)');

  // 원거리로 바꾸면 10% 적용.
  ctrl.stats.attackRange = 500;
  itemSystemTick(ctrl, 0.016);
  const expectedRangedAh = 5 + 100 * 0.10;
  assert(Math.abs(ctrl.itemDynamicAbilityHaste - expectedRangedAh) < 1e-6, '끝없는 갈망(기아): 원거리 기준 스킬 가속 5+추가공격력10%');

  // 아이템을 팔면 0으로 돌아간다.
  const idx = ctrl.items.findIndex((s) => s.id === 'eternalThirst');
  ctrl.items.splice(idx, 1);
  itemSystemTick(ctrl, 0.016);
  assert(ctrl.itemDynamicAbilityHaste === 0, '끝없는 갈망(기아): 아이템을 팔면 스킬 가속 보너스가 사라진다');
}

// ========================================================================
// 끝없는 갈망 - 포식(3초 안에 피해를 입힌 챔피언이 죽으면 8초간 전능흡혈15%)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'eternalThirst');
  const target = makeTarget();
  itemOnDamageDealt(ctrl, target, 50, 'PHYSICAL'); // 추적 시작
  stubs.controller = ctrl; // itemOnChampionDeath의 hasAttackerContext가 요구하는 전역 controller
  target._die = function () { this.state = 'DEAD'; itemOnChampionDeath(this); };
  target._die();
  assert((ctrl._itemFeastOmnivampUntil || 0) > now, '끝없는 갈망(포식): 3초 안에 피해를 준 챔피언이 죽으면 전능 흡혈 타이머가 걸린다');

  // 실제 흡혈 적용은 itemOnDamageDealt가 아니라 별도 공용 함수 applyItemVamp()
  // (character_controller.js의 applyDamage()가 직접 호출)를 거친다 -
  // itemSystemTick()이 매 프레임 _itemTempVampPercent를 갱신해둔 뒤 적용된다.
  itemSystemTick(ctrl, 0.016);
  ctrl.hp = 1000; ctrl.maxHp = 2000;
  const beforeHp = ctrl.hp;
  applyItemVamp(ctrl, 100);
  assert(Math.abs((ctrl.hp - beforeHp) - 100 * 0.15) < 1e-6, `끝없는 갈망(포식): 전능 흡혈 15%가 실제로 체력을 회복시킨다(got ${(ctrl.hp-beforeHp).toFixed(2)})`);

  // 8초가 지나면 사라진다.
  now += 8100;
  itemSystemTick(ctrl, 0.016);
  const beforeHp2 = ctrl.hp;
  applyItemVamp(ctrl, 100);
  assert(ctrl.hp === beforeHp2, '끝없는 갈망(포식): 8초가 지나면 전능 흡혈 보너스가 사라진다');
  stubs.controller = null;
}

// ========================================================================
// 끝없는 갈망/멜모셔스의 아귀 - 둘 다 같은 임시 흡혈 필드를 쓸 때 서로
// 덮어쓰지 않고 더 큰 쪽(Math.max)이 적용되는지.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  ctrl.hp = 1000; ctrl.maxHp = 2000;
  now = 2000000;
  ctrl._itemFeastOmnivampUntil = now + 5000; // 15%
  ctrl._itemMawOmnivampUntil = now + 5000; // maw의 omnivampPercentAfterTrigger
  itemSystemTick(ctrl, 0.016);
  const before = ctrl.hp;
  applyItemVamp(ctrl, 100);
  const mawPercent = ITEM_DATA.maw.lifelinePassive.omnivampPercentAfterTrigger;
  const feastPercent = ITEM_DATA.eternalThirst.feastPassive.omnivampPercent;
  const expected = 100 * Math.max(mawPercent, feastPercent);
  assert(Math.abs((ctrl.hp - before) - expected) < 1e-6, `포식/생명선 동시 보유: 더 큰 흡혈률이 적용된다(got ${(ctrl.hp-before).toFixed(2)}, 기대 ${expected.toFixed(2)})`);
}

// ========================================================================
// 밴들유리 거울 - 공용 하위템 스탯 확인.
// ========================================================================
{
  const item = ITEM_DATA.bandleglassMirror;
  assert(item.stats.abilityPower === 20 && item.stats.abilityHaste === 10 && Math.abs(item.stats.mpRegenPercent - 1.0) < 1e-9, '밴들유리 거울: 주문력20/스킬가속10/기본 마나 재생100% 스탯');
}

// ========================================================================
// 금지된 우상 - "체력 회복 및 보호막 8%"(정령의형상과 동일 패턴, 회복·
// 보호막 양쪽에 동일하게 적용).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'forbiddenIdol');
  recomputeItemStats(ctrl);
  assert(Math.abs(ctrl.itemHealingReceivedBonusPercent - 0.08) < 1e-9, '금지된 우상: 받는 회복 효과 +8%');
  assert(Math.abs(ctrl.itemShieldReceivedBonusPercent - 0.08) < 1e-9, '금지된 우상: 받는 보호막 효과도 동일하게 +8%');
}

// ========================================================================
// 슈렐리아의군가 - "고무적인 연설"(사용 시 4초간 이동속도 +30%, 75초 쿨다운).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  now = 3000000;
  buildOrBuyItem(ctrl, 'aetherialWisp');
  buildOrBuyItem(ctrl, 'shurelyasBattlesong');
  const slotIndex = ctrl.items.findIndex((s) => s.id === 'shurelyasBattlesong');
  const ok = useItem(ctrl, slotIndex);
  assert(ok === true, '슈렐리아의군가: 사용에 성공한다');
  const buff = (ctrl.statusEffects || []).find((e) => e.id === 'itemShurelyasSpeech');
  assert(!!buff && buff.type === 'MS_BUFF' && Math.abs(buff.value - 0.30) < 1e-9 && buff.duration === 4.0, '슈렐리아의군가: 4초간 이동속도 +30% 버프가 걸린다');
  const ok2 = useItem(ctrl, slotIndex);
  assert(ok2 === false, '슈렐리아의군가: 재사용 대기시간(75초) 중에는 다시 쓸 수 없다');
  now += 75100;
  const near = makeAlly(500, 0), far = makeAlly(3000, 0);
  setAllies(near, far);
  const ok3 = useItem(ctrl, slotIndex);
  assert(ok3 === true, '슈렐리아의군가: 75초가 지나면 다시 쓸 수 있다');
  assert(near.statusEffects.some((e) => e.id === 'itemShurelyasSpeech' && Math.abs(e.value - 0.30) < 1e-9), '슈렐리아의군가: 주변 아군도 이동속도 +30%');
  assert(!far.statusEffects.some((e) => e.id === 'itemShurelyasSpeech'), '슈렐리아의군가: 멀리 있는 아군은 제외');
  setAllies();
}

// ========================================================================
// 월석재생기 - "별빛 은총": 아군을 회복/보호막시키면 30%(회복)/35%(보호막)를
// 근처 다른 아군에게, 근처에 다른 아군이 없으면 같은 대상에게 추가로 준다.
// 자기 자신이 받는 회복/보호막 배율은 바뀌지 않는다(아군 대상 효과).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'kircheisShard');
  buildOrBuyItem(ctrl, 'moonstoneRenewer');
  recomputeItemStats(ctrl);
  assert(ctrl.itemHealingReceivedBonusPercent === 0 && ctrl.itemShieldReceivedBonusPercent === 0, '월석재생기: 자신이 받는 회복/보호막 배율은 바뀌지 않는다(아군에게 주는 효과)');

  const a = makeAlly(100, 0), b = makeAlly(400, 0);
  setAllies(a, b);
  healAlly(ctrl, a, 100);
  assert(Math.abs(a.hp - 600) < 1e-6, '월석재생기: 대상 아군은 원래 회복량(100)만 받는다');
  assert(Math.abs(b.hp - 530) < 1e-6, '월석재생기: 근처 다른 아군이 회복량의 30%(30)를 받는다');
  shieldAlly(ctrl, a, 200, 2);
  assert(Math.abs(a.shield - 200) < 1e-6 && Math.abs(b.shield - 70) < 1e-6, '월석재생기: 보호막은 35%(70)가 근처 다른 아군에게 간다');

  const lone = makeAlly(100, 0);
  setAllies(lone, makeAlly(5000, 0));
  healAlly(ctrl, lone, 100);
  assert(Math.abs(lone.hp - 630) < 1e-6, '월석재생기: 근처(800)에 다른 아군이 없으면 같은 대상이 30%를 추가로 받는다');
  setAllies();
}

// ========================================================================
// 강철의 솔라리 팬던트 - "헌신"(사용): 자신과 주변 아군에게 아군 레벨 비례
// 보호막(290~360), 2.5초에 걸쳐 감소.
// ========================================================================
{
  const ctrl = makeFakeCtrl({ champLevel: 1 });
  buildOrBuyItem(ctrl, 'kircheisShard'); buildOrBuyItem(ctrl, 'chainVest'); buildOrBuyItem(ctrl, 'negatronCloak');
  buildOrBuyItem(ctrl, 'ironSolariLocket');
  const p = ITEM_DATA.ironSolariLocket.devotionActive;
  const ally18 = makeAlly(300, 0, { champLevel: 18 }), far = makeAlly(3000, 0);
  setAllies(ally18, far);
  const idx = ctrl.items.findIndex((s) => s.id === 'ironSolariLocket');
  assert(useItem(ctrl, idx) === true, '강철의 솔라리 팬던트: 헌신 사용 성공');
  assert(Math.abs(ctrl.shield - p.shieldMin) < 1e-6, `강철의 솔라리 팬던트: 자신(레벨 1) 보호막 ${p.shieldMin}`);
  assert(Math.abs(ally18.shield - p.shieldMax) < 1e-6, `강철의 솔라리 팬던트: 주변 아군(레벨 18) 보호막 ${p.shieldMax} - 아군 레벨 비례`);
  assert(far.shield === 0, '강철의 솔라리 팬던트: 범위 밖 아군은 제외');
  assert(useItem(ctrl, idx) === false, '강철의 솔라리 팬던트: 재사용 대기시간 중에는 다시 쓸 수 없다');
  now += 1250; itemSystemTick(ctrl, 1.25); tickAllyUnits(1.25);
  assert(Math.abs(ctrl.shield - p.shieldMin / 2) < 1e-6, '강철의 솔라리 팬던트: 자신 보호막이 2.5초에 걸쳐 감소(절반 지점)');
  assert(Math.abs(ally18.shield - p.shieldMax / 2) < 1e-6, '강철의 솔라리 팬던트: 아군 보호막도 감소(절반 지점)');
  now += 1300; itemSystemTick(ctrl, 1.3); tickAllyUnits(1.3);
  assert(ctrl.shield < 1e-6 && ally18.shield === 0, '강철의 솔라리 팬던트: 2.5초 뒤 보호막이 모두 사라진다');
  setAllies();
}

// ========================================================================
// 밴들파이프 - "팡파르"(둔화/이동불가 적중 시 자가 이동속도+공격속도).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'kircheisShard'); buildOrBuyItem(ctrl, 'chainVest'); buildOrBuyItem(ctrl, 'negatronCloak');
  buildOrBuyItem(ctrl, 'bandlePipe');
  const target = makeTarget();
  applyStatus(target, { id: 'testSlow', type: 'SLOW', duration: 1.0, value: 0.3, source: ctrl });
  const msBuff = (ctrl.statusEffects || []).find((e) => e.id === 'itemFanfareMs');
  const asBuff = (ctrl.statusEffects || []).find((e) => e.id === 'itemFanfareAs');
  assert(!!msBuff && msBuff.type === 'MS_BUFF_FLAT' && msBuff.value === 20, '밴들파이프(팡파르): 둔화를 걸면 이동속도 +20(고정) 버프가 걸린다');
  assert(!!asBuff && asBuff.type === 'AS_BUFF' && Math.abs(asBuff.value - 0.30) < 1e-9, '밴들파이프(팡파르): 근접 기준 공격속도 +30% 버프가 걸린다');
  assert(msBuff.duration === 8 && asBuff.duration === 8, '밴들파이프(팡파르): 근접 기준 8초 지속');
  const ally = makeAlly(300, 0);
  setAllies(ally);
  applyStatus(makeTarget(), { id: 'testSlow2', type: 'SLOW', duration: 1.0, value: 0.3, source: ctrl });
  assert(ally.statusEffects.some((e) => e.id === 'itemFanfareMs') && ally.statusEffects.some((e) => e.id === 'itemFanfareAs'), '밴들파이프(팡파르): 주변 아군도 이동속도/공격속도 버프를 받는다');
  setAllies();

  // 원거리는 지속시간/수치가 다르다.
  const ctrl2 = makeFakeCtrl({ stats: { attackDamage: 100, attackRange: 500, critChance: 0 } });
  buildOrBuyItem(ctrl2, 'kircheisShard'); buildOrBuyItem(ctrl2, 'chainVest'); buildOrBuyItem(ctrl2, 'negatronCloak');
  buildOrBuyItem(ctrl2, 'bandlePipe');
  const target2 = makeTarget();
  applyStatus(target2, { id: 'testStun', type: 'STUN', duration: 1.0, value: 1.0, source: ctrl2 });
  const asBuff2 = (ctrl2.statusEffects || []).find((e) => e.id === 'itemFanfareAs');
  assert(!!asBuff2 && Math.abs(asBuff2.value - 0.20) < 1e-9 && asBuff2.duration === 4, '밴들파이프(팡파르): 원거리 기준 공격속도 +20%, 4초 지속(이동 불가에도 반응)');
}

// ========================================================================
// 제국의명령 - "명령"(이동 불가에만 반응, 둔화는 제외 - 밴들파이프와의
// 핵심 차이). 취약 표식(VULNERABLE 7%, 4초, 중첩 없이 지속시간만 연장).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'amplifyingTome'); buildOrBuyItem(ctrl, 'faerieCharm'); buildOrBuyItem(ctrl, 'glowingMote');
  buildOrBuyItem(ctrl, 'bandleglassMirror');
  buildOrBuyItem(ctrl, 'amplifyingTome');
  buildOrBuyItem(ctrl, 'imperialMandate');
  const target = makeTarget();

  // 둔화(SLOW)는 "이동 불가"가 아니므로 반응하지 않는다.
  applyStatus(target, { id: 'testSlow', type: 'SLOW', duration: 1.0, value: 0.3, source: ctrl });
  let mark = (target.statusEffects || []).find((e) => e.id === 'itemImperialMandateVulnerable');
  assert(!mark, '제국의명령(명령): 둔화(SLOW)만으로는 취약 표식이 걸리지 않는다(이동 불가 전용)');

  // 기절(STUN)은 "이동 불가"이므로 반응한다.
  applyStatus(target, { id: 'testStun', type: 'STUN', duration: 1.0, value: 1.0, source: ctrl });
  mark = (target.statusEffects || []).find((e) => e.id === 'itemImperialMandateVulnerable');
  assert(!!mark && mark.type === 'VULNERABLE' && Math.abs(mark.value - 0.07) < 1e-9 && mark.duration === 4.0, '제국의명령(명령): 기절(이동 불가)을 걸면 4초간 취약 표식(7%)이 걸린다');

  // "통제" - 이동 불가 효과를 지닌 스킬만 스킬 가속 +20.
  recomputeItemStats(ctrl);
  ctrl.championId = 'nautilus';
  const base = ctrl.itemBonusAbilityHaste;
  const cdQ = abilityHasteCooldown(ctrl, 10, 'Q');
  const cdW = abilityHasteCooldown(ctrl, 10, 'W');
  assert(Math.abs(cdQ - 10 * 100 / (100 + base + 20)) < 1e-9, '제국의명령(통제): 이동 불가 스킬(노틸러스 Q)은 스킬 가속 +20 추가');
  assert(Math.abs(cdW - 10 * 100 / (100 + base)) < 1e-9, '제국의명령(통제): 이동 불가가 없는 스킬(노틸러스 W)은 그대로');
  ctrl.championId = 'garen';
  assert(Math.abs(abilityHasteCooldown(ctrl, 10, 'Q') - 10 * 100 / (100 + base)) < 1e-9, '제국의명령(통제): 침묵(가렌 Q)은 이동 불가가 아니라 제외');
}

// ========================================================================
// 꿈 생성기 - 8초마다 파란/보라 거품, 아군을 회복/보호막시키면 3초간 넘겨준다.
// ========================================================================
{
  const ctrl = makeFakeCtrl({ champLevel: 1 });
  ctrl.items.push({ id: 'dreamMaker' });
  recomputeItemStats(ctrl);
  const p = ITEM_DATA.dreamMaker.dreamBubblePassive;
  itemSystemTick(ctrl, 0.016);
  assert(!ctrl._itemDreamBubblesReady, '꿈 생성기: 처음엔 거품이 없다(8초 뒤 생성)');
  now += 8100; itemSystemTick(ctrl, 0.016);
  assert(ctrl._itemDreamBubblesReady === true, '꿈 생성기: 8초 뒤 파란/보라 거품 생성');
  const ally = makeAlly(300, 0);
  setAllies(ally);
  healAlly(ctrl, ally, 50);
  assert(ally._dreamBlue && Math.abs(ally._dreamBlue.amount - p.blueMin) < 1e-9, '꿈 생성기: 회복시킨 아군에게 파란 거품(레벨 1 기준 50) 전달');
  assert(ally._dreamPurple && Math.abs(ally._dreamPurple.amount - p.purpleMin) < 1e-9, '꿈 생성기: 보라 거품(40)도 함께 전달');
  assert(!ctrl._itemDreamBubblesReady, '꿈 생성기: 넘겨준 뒤엔 다시 8초를 기다린다');
  const left = allyAbsorbIncoming(ally, 120, { source: { isTurret: true } });
  assert(Math.abs(left - 70) < 1e-9 && !ally._dreamBlue, '꿈 생성기: 파란 거품이 미니언이 아닌 출처의 다음 피해를 50 줄이고 사라진다');
  const ally2 = makeAlly(300, 0);
  setAllies(ally2);
  now += 8100; itemSystemTick(ctrl, 0.016);
  shieldAlly(ctrl, ally2, 50, 2);
  const left2 = allyAbsorbIncoming(ally2, 100, { source: { isMinion: true } });
  assert(ally2._dreamBlue && Math.abs(left2 - 50) < 1e-9, '꿈 생성기: 미니언 피해에는 파란 거품이 반응하지 않는다(보호막만 흡수)');
  now += 3100; tickAllyUnits(0.016);
  assert(!ally2._dreamBlue && !ally2._dreamPurple, '꿈 생성기: 거품은 아군에게 3초만 유지된다');
  setAllies();
}

// ========================================================================
// 인벤토리 클릭 "사용 가능" 판정 버그 수정 확인 - useItem()이 실제로
// 분기하는 모든 액티브 필드를 global_system_instances.js의 usable 판정도
// 동일하게 인식해야 한다(그렇지 않으면 클릭 시 사용 대신 판매가 된다).
// item_system.js만 로드하는 이 테스트 파일에서는 global_system_instances.js를
// 직접 실행하지 않으므로, 소스 텍스트에 그 필드들이 전부 등장하는지
// 정적으로 교차 확인한다.
// ========================================================================
{
  const giSrc = fs.readFileSync(path.join(ROOT, 'src/core/global_system_instances.js'), 'utf8');
  const usableBlockMatch = giSrc.match(/const usable = !!\(([\s\S]*?)\);/);
  assert(!!usableBlockMatch, '인벤토리 usable 판정 블록을 찾을 수 있다');
  if (usableBlockMatch) {
    const block = usableBlockMatch[1];
    const requiredFields = ['consumable', 'activeAbility', 'wardPlacement', 'elixirEffect', 'empoweredCleaveActive', 'shockwaveActive', 'ghostStepActive', 'rocketbeltActive', 'teamMoveSpeedActive', 'noxiousBladeActive', 'stasisActive'];
    for (const f of requiredFields) {
      assert(block.includes(f), `인벤토리 usable 판정: data.${f}를 확인한다(빠지면 클릭 시 사용 대신 판매되는 버그)`);
    }
  }
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
