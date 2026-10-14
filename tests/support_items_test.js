// Node vm harness for the 서포터 아이템 라인(세계지도집 -> 룬나침반 ->
// 세계의 결실 -> 5종 업그레이드), sourced directly from the user's original
// uploaded item text (79~112줄 + 1290~1362줄).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
let gameTimeSec = 0;
const appliedStatuses = [];
const stubs = {
  performance: { now: () => now },
  console,
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {},
  updateItemUI: () => {},
  updateBars: () => {},
  getTurretGameTimeSec: () => gameTimeSec,
  PLAYER_TEAM: 'BLUE',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  STATE: { DEAD: 'DEAD', IDLE: 'IDLE', MOVE: 'MOVE', ATTACK: 'ATTACK' },
  controller: null,
  // 주의: 이 스텁은 실제로 호출되지 않는다 - statusSrc(01_status_effect_system.js)가
  // 같은 vm 컨텍스트에 자신의 진짜 function applyStatus(...)를 최상위 함수
  // 선언으로 정의하기 때문에, 전역 객체(context)의 이 프로퍼티는 그 함수
  // 선언에 의해 덮어써진다 - 즉 테스트는 실제 프로덕션 applyStatus()를
  // 그대로 타는 통합 테스트가 된다(appliedStatuses 배열은 채워지지 않으므로
  // 상태이상 검증은 target.statusEffects를 직접 봐야 한다).
  applyStatus: (target, effect) => {
    appliedStatuses.push({ target, effect });
    target.statusEffects = target.statusEffects || [];
    const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
    const rec = { ...effect, expiresAt: now + effect.duration * 1000 };
    if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
    return rec;
  },
  // 진짜 applyStatus()가 CC_TYPES 상태이상에 대해 호출하는 UI 태그 갱신 함수
  // - 01_hit_detection.js에 있어 이 테스트에는 로드되지 않으므로 no-op 스텁.
  refreshUnitCcTags: () => {},
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
  THREE: {
    Vector3: class {
      constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
      clone(){return new this.constructor(this.x,this.y,this.z);}
      add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
      subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
      multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
      length(){return Math.hypot(this.x,this.y,this.z);}
      normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
      applyQuaternion(){return this;}
    },
    ConeGeometry: class {},
    MeshBasicMaterial: class {},
    Mesh: class { constructor(){ this.position = { copy(){}, set(){}, y: 0 }; } },
  },
  lolRangeToWorld: (r) => r,
  getCollisionRadius: () => 0,
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
  // 32차: 와드는 ward_system.js 유닛 - 아이템 쪽은 설치 명령(order)과 설치(place)만 넘긴다. 여기서는 기록만 하는 가짜.
  wardSystem: {
    order(ctrl, point, rangeLol, placeFn) { this.lastOrder = { point, rangeLol }; return placeFn(point); },
    place(owner, type, pos, opts) { const w = { type, position: pos, ...opts }; this.lastPlace = w; if (owner) (owner._placedWards = owner._placedWards || []).push(w); return w; },
  },
};
const context = vm.createContext(stubs);
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8'); // 보호막 인스턴스 모델 포함
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8');
const allySrc = fs.readFileSync(path.join(ROOT, 'src/core/ally_system.js'), 'utf8');
vm.runInContext(statusSrc + '\n' + allySrc + '\n' + itemDataSrc + '\n' + itemSystemSrc + `
this.placedAllies = placedAllies;
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.buildOrBuyItem = buildOrBuyItem;
this.recomputeItemStats = recomputeItemStats;
this.itemSystemTick = itemSystemTick;
this.itemOnDamageDealt = itemOnDamageDealt;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnAbilityDispatch = itemOnAbilityDispatch;
this.itemOnTakeDamage = itemOnTakeDamage;
this.useItem = useItem;
this.applyStatus = applyStatus;
this.combineCost = combineCost;
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnDamageDealt, itemOnBasicAttackHit, itemOnAbilityDispatch, itemOnTakeDamage, useItem, combineCost, applyStatus,
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
// 조합 비용 정합성 - 5종 업그레이드는 "비용 소모 없이" 업그레이드되므로
// 전부 0원이어야 한다.
// ========================================================================
{
  const upgrades = ['zaZaksRealmspike', 'bloodsong', 'solsticeSleigh', 'dreamMaker', 'celestialOpposition'];
  for (const id of upgrades) {
    const item = ITEM_DATA[id];
    assert(!!item, `"${id}"가 ITEM_DATA에 존재한다`);
    assert(item.cost === 0, `"${item.nameKo}": 비용 소모 없는 업그레이드라 가격이 0원이다`);
    assert(item.recipe && item.recipe.includes('bountyOfWorlds'), `"${item.nameKo}": 세계의 결실을 하위템으로 요구한다`);
  }
  assert(ITEM_DATA.worldAtlas.cost === 0, '세계지도집: 가격 0원(서포터 시작 아이템)');
}

// ========================================================================
// 퀘스트 변신 체인 - 세계지도집(400골드) -> 룬나침반(800골드) -> 세계의 결실
// ========================================================================
{
  gameTimeSec = 65; // 첫 충전 조건
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'worldAtlas');
  const slot = ctrl.items.find((s) => s.id === 'worldAtlas');
  assert(!!slot, '세계지도집: 구매 성공');

  // 재물 공유로 400골드를 모으면 룬나침반으로 변신한다 - 충전 1개로는
  // 22골드씩밖에 못 받으니 여러 번의 충전 재생을 거쳐야 한다.
  itemSystemTick(ctrl, 0.016); // 첫 충전 1개 지급
  let transformed = false;
  for (let i = 0; i < 30 && !transformed; i++) {
    const champ = makeTarget();
    if ((ctrl._itemSpoilsCharges || 0) > 0) itemOnDamageDealt(ctrl, champ, 50, 'PHYSICAL');
    now += 20000; // 재사용대기시간만큼 흘려보내 충전을 계속 재생시킨다
    itemSystemTick(ctrl, 20.0);
    if (ctrl.items.some((s) => s.id === 'runesteelSpaulders')) transformed = true;
  }
  assert(transformed, '세계지도집: 재물 공유로 400골드를 모으면 룬나침반으로 변신한다');
  assert(ctrl.items.find((s) => s.id === 'runesteelSpaulders').charges === ITEM_DATA.runesteelSpaulders.maxCharges, '룬나침반: 변신 즉시 와드 충전이 가득 찬 상태로 지급된다');

  // 룬나침반 -> 세계의 결실(800골드) - 근접 기준 1회 24골드.
  let transformed2 = false;
  for (let i = 0; i < 50 && !transformed2; i++) {
    const champ = makeTarget();
    if ((ctrl._itemSpoilsCharges || 0) > 0) itemOnDamageDealt(ctrl, champ, 50, 'PHYSICAL');
    now += 20000;
    itemSystemTick(ctrl, 20.0);
    if (ctrl.items.some((s) => s.id === 'bountyOfWorlds')) transformed2 = true;
  }
  assert(transformed2, '룬나침반: 재물 공유로 800골드를 모으면 세계의 결실로 변신한다');
}

// ========================================================================
// 재물 공유 - 미니언 처형 충전 소모(근접 50% 문턱) + 첫 충전 65초 지연
// ========================================================================
{
  gameTimeSec = 0;
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'worldAtlas');
  itemSystemTick(ctrl, 0.016);
  assert((ctrl._itemSpoilsCharges || 0) === 0, '재물 공유: 게임 시작 직후(65초 전)에는 충전이 0이다');
  gameTimeSec = 65;
  itemSystemTick(ctrl, 0.016);
  assert((ctrl._itemSpoilsCharges || 0) === 1, '재물 공유: 게임 시간 65초가 되면 첫 충전이 지급된다');

  const goldBefore = ctrl.gold;
  const highHpMinion = { isMinion: true, isChampion: false, hp: 600, maxHp: 1000 }; // 60% - 문턱(50%) 초과
  itemOnBasicAttackHit(ctrl, highHpMinion, false);
  assert(ctrl.gold === goldBefore && (ctrl._itemSpoilsCharges || 0) === 1, '재물 공유: 체력이 문턱(근접 50%) 이상인 미니언에게는 발동하지 않는다');

  const lowHpMinion = { isMinion: true, isChampion: false, hp: 400, maxHp: 1000 }; // 40% - 문턱 이하
  context.placedAllies.length = 0;
  itemOnBasicAttackHit(ctrl, lowHpMinion, false);
  assert(ctrl.gold === goldBefore && (ctrl._itemSpoilsCharges || 0) === 1, '재물 공유: 근처에 아군 챔피언이 없으면 미니언을 처형하지 않는다(원문 "아군 챔피언 근처에서")');
  const farAlly = { isChampion: true, isAlly: true, hp: 500, maxHp: 1000, root: { position: { x: 5000, y: 0, z: 0 } } };
  context.placedAllies.push(farAlly);
  itemOnBasicAttackHit(ctrl, lowHpMinion, false);
  assert(ctrl.gold === goldBefore, '재물 공유: 아군이 멀리(1050 밖) 있어도 처형하지 않는다');
  context.placedAllies.push({ isChampion: true, isAlly: true, hp: 500, maxHp: 1000, root: { position: { x: 500, y: 0, z: 0 } } });
  itemOnBasicAttackHit(ctrl, lowHpMinion, false);
  assert(ctrl.gold === goldBefore + ITEM_DATA.worldAtlas.spoilsOfWarPassive.minionGold, '재물 공유: 근처에 아군이 있으면 체력이 문턱 이하인 미니언을 처형하고 미니언 골드를 받는다');
  context.placedAllies.length = 0;
  assert((ctrl._itemSpoilsCharges || 0) === 0, '재물 공유: 미니언 처형도 충전을 소모한다(챔피언 피해와 같은 풀)');
}

// ========================================================================
// 10초당 골드5 (세계의 결실 이후 공통) + 충전형 와드(maxCharges, 상점
// 재충전) - 버그 수정: _useControlWard가 slot.count만 지원해서 maxCharges
// 아이템은 와드가 무한정 나가는 잠재 버그였다.
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'bountyOfWorlds');
  const goldBefore = ctrl.gold;
  now += 10000;
  itemSystemTick(ctrl, 10.0);
  assert(ctrl.gold === goldBefore + 5, '세계의 결실: 10초마다 골드 5를 받는다');

  const slotIndex = ctrl.items.findIndex((s) => s.id === 'bountyOfWorlds');
  assert(ctrl.items[slotIndex].charges === 4, '세계의 결실: 와드 충전 4회로 지급된다');
  for (let i = 0; i < 4; i++) {
    const used = useItem(ctrl, slotIndex);
    assert(used === true, `세계의 결실: 와드 ${i + 1}번째 사용 성공`);
  }
  assert(ctrl.items[slotIndex].charges === 0, '세계의 결실: 와드를 4번 쓰면 충전이 0이 된다(아이템 자체는 사라지지 않는다 - maxCharges는 maxStack과 달리 슬롯을 비우지 않음)');
  const failedUse = useItem(ctrl, slotIndex);
  assert(failedUse === false, '세계의 결실: 충전이 없으면 와드를 쓸 수 없다(버그 수정 확인 - 무한정 나가지 않는다)');

  // 상점 재이용(buyItem) 시 재충전된다.
  buyItem(ctrl, 'healthPotion');
  assert(ctrl.items[slotIndex].charges === 4, '세계의 결실: 상점을 다시 이용하면(아무 아이템이나 구매) 와드 충전이 가득 재충전된다');
}

// ========================================================================
// 자자크의 세계가시 - 공허 폭발(10+주문력15%+최대체력3%, 몬스터는 300 캡)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'bountyOfWorlds');
  buildOrBuyItem(ctrl, 'zaZaksRealmspike');
  ctrl.stats.abilityPower = 100;
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  const before = target.hp;
  itemOnDamageDealt(ctrl, target, 50, 'MAGICAL');
  const expected = 10 + 100 * 0.15 + 2000 * 0.03; // 10+15+60=85
  assert(Math.abs((before - target.hp) - expected) < 1e-6, '자자크의 세계가시: 공허 폭발이 10+주문력15%+최대체력3%(챔피언, 캡 없음)만큼 들어간다');

  // "챔피언에게 스킬로 피해를 입히면"이 트리거이므로, 주 대상은 반드시
  // 챔피언이어야 한다 - 근처 몬스터는 "주변 적들" 스플래시로만 맞는다
  // (findEnemiesInRadius 스텁으로 근처에 몬스터를 하나 배치한다).
  const target2 = makeTarget({ maxHp: 2000, hp: 2000 });
  const minion = { isChampion: false, isMinion: true, hp: 100000, maxHp: 100000 };
  stubs._radiusHits = [{ unit: minion }];
  const before2 = minion.hp;
  now += 11000; // 재사용대기시간(10초) 경과
  itemOnDamageDealt(ctrl, target2, 50, 'MAGICAL');
  const expectedMonster = 10 + 100 * 0.15 + 300; // 최대체력3%(=3000)가 300으로 캡됨
  assert(Math.abs((before2 - minion.hp) - expectedMonster) < 1e-6, `자자크의 세계가시: 스플래시로 맞은 몬스터는 최대체력 항이 300으로 캡된다(got ${(before2-minion.hp).toFixed(2)}, 기대 ${expectedMonster})`);
  stubs._radiusHits = [];
}

// ========================================================================
// 피의 노래 - 주문 검(기본공격력 100%, 물리) + 약점 노출(VULNERABLE)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'bountyOfWorlds');
  buildOrBuyItem(ctrl, 'bloodsong');
  itemOnAbilityDispatch(ctrl);
  const target = makeTarget({ maxHp: 2000, hp: 2000 });
  const before = target.hp;
  itemOnBasicAttackHit(ctrl, target, false);
  // computeChampionStats 스텁 기준 기본 공격력 60 * 100% = 60
  assert(Math.abs((before - target.hp) - 60) < 1e-6, '피의 노래(주문 검): "기본" 공격력 100%의 추가 물리 피해(총 공격력이 아님)');
  // 실제 applyStatus()는 context의 appliedStatuses 스텁이 아니라
  // target.statusEffects에 직접 기록한다(위 stubs.applyStatus 주석 참고).
  const ew = (target.statusEffects || []).find((e) => e.id === 'itemBloodsongExposeWeakness');
  assert(!!ew, '피의 노래(약점 노출): VULNERABLE 상태이상이 걸린다');
  if (ew) {
    assert(ew.type === 'VULNERABLE', `약점 노출: 타입이 VULNERABLE이다(got ${ew.type})`);
    assert(Math.abs(ew.value - 0.08) < 1e-9, `약점 노출: 근접 기준 8%(got ${ew.value})`);
    assert(ew.duration === 4.0, `약점 노출: 4초 지속(got ${ew.duration})`);
  }
}
// VULNERABLE이 실제로 calculateDamage()의 최종 피해를 늘리는지 - 진짜
// 00_global_constants.js의 calculateDamage()를 직접 로드해서 검증한다.
{
  const stubsD = { console, controller: null, getArmorShredPercent: () => 0, getMrShredFlat: () => 0, getMagicDamageReductionPercent: () => 0, getVulnerablePercent: (t) => (t && t._vuln) || 0 };
  const contextD = vm.createContext(stubsD);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
  vm.runInContext(src + '\nthis.calculateDamage = calculateDamage; this.DAMAGE_TYPE = DAMAGE_TYPE;', contextD);
  const { calculateDamage, DAMAGE_TYPE } = contextD;
  const target = { armor: 0, magicResist: 0, _vuln: 0.08 };
  const dmgWithVuln = calculateDamage({ rawDamage: 100, damageType: DAMAGE_TYPE.PHYSICAL, target });
  assert(Math.abs(dmgWithVuln - 108) < 1e-6, '약점 노출: VULNERABLE 8%가 calculateDamage()의 최종 피해에 정확히 곱해진다(100 -> 108)');
}

// ========================================================================
// 태양의 썰매 - 썰매 질주(CC 적용 시 발동, 레벨 비례 회복 + 이동속도)
// ========================================================================
{
  const ctrl = makeFakeCtrl({ champLevel: 1 });
  buyItem(ctrl, 'bountyOfWorlds');
  buildOrBuyItem(ctrl, 'solsticeSleigh');
  ctrl.hp = 1000; ctrl.maxHp = 2000;
  const target = makeTarget();
  applyStatus(target, { id: 'testSlow', type: 'SLOW', duration: 1.0, value: 0.3, source: ctrl });
  const p = ITEM_DATA.solsticeSleigh.ccTriggerPassive;
  assert(Math.abs(ctrl.hp - (1000 + p.minHeal)) < 1e-6, '썰매 질주: 적 챔피언에게 둔화를 걸면 레벨비례 체력(레벨1=최소값)을 회복한다');
  const msBuff = (ctrl.statusEffects || []).find((e) => e.id === 'itemSolsticeSleighMs');
  assert(!!msBuff && msBuff.value === 0.20 && msBuff.duration === 2.5, '썰매 질주: 2.5초간 이동속도 +20%를 자신에게 건다');

  // 재사용대기시간(30초) 중에는 다시 발동하지 않는다.
  const hpBefore2 = ctrl.hp;
  applyStatus(target, { id: 'testSlow2', type: 'ROOT', duration: 1.0, value: 1.0, source: ctrl });
  assert(ctrl.hp === hpBefore2, '썰매 질주: 재사용대기시간(30초) 중에는 다시 발동하지 않는다');
}

// ========================================================================
// 천상의 이의 - 산의 축복(챔피언 피해 시 DAMAGE_REDUCTION, 자연 만료 시 충격파)
// ========================================================================
{
  const ctrl = makeFakeCtrl();
  buyItem(ctrl, 'bountyOfWorlds');
  buildOrBuyItem(ctrl, 'celestialOpposition');
  const attacker = makeTarget(); // isChampion:true인 "공격자" 역할
  const remaining = itemOnTakeDamage(ctrl, 100, 'PHYSICAL', attacker);
  assert(remaining === 100, '산의 축복: 이번 피해 자체는 줄이지 않는다(다음 피해부터 적용 - 원문 "받은 후" 해석)');
  const reduction = (ctrl.statusEffects || []).find((e) => e.id === 'itemCelestialBlessing');
  assert(!!reduction && reduction.type === 'DAMAGE_REDUCTION' && Math.abs(reduction.value - 0.35) < 1e-9, '산의 축복: 챔피언에게 피해를 받으면 근접 기준 35% 피해 감소가 걸린다');
  assert(ctrl._itemCelestialShieldActive === true, '산의 축복: 보호막이 활성 상태로 기록된다');

  // 2초가 지나 보호막이 "깨지면"(자연 만료) 충격파(둔화)가 나간다.
  const bystander = makeTarget({ id: 'bystander' });
  stubs._radiusHits = [{ unit: bystander }];
  now += 2100;
  itemSystemTick(ctrl, 2.1);
  assert(ctrl._itemCelestialShieldActive === false, '산의 축복: 2초가 지나면 보호막이 소멸한다');
  const slow = (bystander.statusEffects || []).find((e) => e.id === 'itemCelestialShockwaveSlow');
  assert(!!slow && Math.abs(slow.value - 0.50) < 1e-9 && slow.duration === 1.5, '산의 축복: 보호막이 깨지면 주변에 1.5초간 50% 둔화 충격파를 낸다');
  stubs._radiusHits = [];
}

// ========================================================================
// 꿈 생성기 - 아군 의존 메커니즘은 스킵(스탯+와드만 제공) 확인
// ========================================================================
{
  const item = ITEM_DATA.dreamMaker;
  assert(item.stats.maxHp === 200 && item.wardPlacement && item.maxCharges === 4, '꿈 생성기: 스탯+와드는 다른 업그레이드와 동일하게 제공된다');
  assert(!item.dreamDropPassive && !item.allyHealPassive, '꿈 생성기: 아군 의존 고유 패시브는 구현되지 않았다(명시적 스킵 - 1인 플레이 데모 한계)');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
