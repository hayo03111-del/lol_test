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
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8');
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(statusSrc + '\n' + itemDataSrc + '\n' + itemSystemSrc + `
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
} = context;

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
  const ok3 = useItem(ctrl, slotIndex);
  assert(ok3 === true, '슈렐리아의군가: 75초가 지나면 다시 쓸 수 있다');
}

// ========================================================================
// 월석재생기 - "별빛 은총"(회복 +30%｜보호막 +35%, 서로 다른 증폭률이
// 섞이지 않는지).
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buildOrBuyItem(ctrl, 'kircheisShard');
  buildOrBuyItem(ctrl, 'moonstoneRenewer');
  recomputeItemStats(ctrl);
  assert(Math.abs(ctrl.itemHealingReceivedBonusPercent - 0.30) < 1e-9, '월석재생기: 받는 회복 효과 +30%');
  assert(Math.abs(ctrl.itemShieldReceivedBonusPercent - 0.35) < 1e-9, '월석재생기: 받는 보호막 효과 +35%(회복과 다른 수치)');

  // 실제 보호막 생성 경로(스테락의도전 생명선)에 35%가 적용되는지 직접 확인.
  const ctrl2 = makeFakeCtrl();
  buildOrBuyItem(ctrl2, 'kircheisShard');
  buildOrBuyItem(ctrl2, 'moonstoneRenewer');
  buildOrBuyItem(ctrl2, 'giantsBelt');
  buildOrBuyItem(ctrl2, 'sterakssGage');
  recomputeItemStats(ctrl2);
  ctrl2.itemBonusMaxHp = 800; ctrl2.hp = 100; ctrl2.maxHp = 2000;
  itemOnTakeDamage(ctrl2, 1, 'PHYSICAL', null);
  const p = ITEM_DATA.sterakssGage.lifelinePassive;
  const bonusHp = ctrl2.itemBonusMaxHp || 0;
  const baseShield = bonusHp * p.bonusHpShieldPercent;
  const expectedShield = baseShield * 1.35;
  assert(Math.abs(ctrl2.shield - expectedShield) < 1e-6, `월석재생기: 스테락의도전 생명선 보호막에 35%가 곱해진다(got ${ctrl2.shield.toFixed(2)}, 기대 ${expectedShield.toFixed(2)})`);
}

// ========================================================================
// 강철의 솔라리 팬던트 - 아군 전용 액티브라 고유 패시브 미구현(명시적 스킵).
// ========================================================================
{
  const item = ITEM_DATA.ironSolariLocket;
  assert(item.stats.maxHp === 200 && item.stats.armor === 30 && item.stats.magicResist === 30, '강철의 솔라리 팬던트: 스탯은 제공된다');
  assert(!item.activeAbility && !item.healAndShieldPowerPassive && !item.devotionActive, '강철의 솔라리 팬던트: "헌신" 고유 액티브는 구현되지 않았다(명시적 스킵 - 아군 전용, 자기 대상 전환 조항 없음)');
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

  // "통제"(이동 불가 스킬 전용 스킬 가속)는 구현하지 않았다 - 문서화된 스킵.
  assert(!ITEM_DATA.imperialMandate.controlPassive, '제국의명령: "통제"(이동 불가 스킬 전용 스킬 가속)는 구현되지 않았다(명시적 스킵 - 스킬별 CC 태깅 시스템 없음)');
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
