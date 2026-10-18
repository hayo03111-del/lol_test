// 40차: 덤불 조끼·가시 갑옷(가시)과 악마사냥꾼의 화살(한밤 경계·폭격 개시) - item_system.js 실제 소스를 vm으로 실행해 확인한다.
// (하네스는 defensive_items_round1_test.js와 같다.)
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
  clearStatus: (t, id) => { if (t && t.statusEffects) t.statusEffects = t.statusEffects.filter((e) => e.id !== id); },
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
this.itemOnUltimateCast = itemOnUltimateCast;
this.itemBarrageTakeSwing = itemBarrageTakeSwing;
this.LEGENDARY_ITEM_IDS = LEGENDARY_ITEM_IDS;
this.abilityHasteCooldown = abilityHasteCooldown;
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnBasicAttackHit, itemOnDamageDealt, itemOnTakeDamage, useItem, combineCost,
  itemOnUltimateCast, itemBarrageTakeSwing, LEGENDARY_ITEM_IDS, abilityHasteCooldown,
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

// ---- 조합·가격·능력치(Data Dragon 16.20.1) ----
{
  assert(ITEM_DATA.brambleVest.cost === 800 && ITEM_DATA.thornmail.cost === 2450 && ITEM_DATA.fiendhunterBolts.cost === 2650, '가격: 덤불 조끼 800, 가시 갑옷 2450, 악마사냥꾼의 화살 2650');
  const c = makeFakeCtrl();
  buyItem(c, 'chainVest'); buyItem(c, 'chainVest');
  const g0 = c.gold;
  assert(buildOrBuyItem(c, 'brambleVest') === true && c.gold === g0 - 200, '덤불 조끼 = 천 갑옷 2개 + 200');
  buyItem(c, 'chainmailVest'); buyItem(c, 'rubyCrystal');
  const g1 = c.gold;
  assert(buildOrBuyItem(c, 'thornmail') === true && c.items.length === 1 && c.gold === g1 - 450, '가시 갑옷 = 덤불 조끼 + 쇠사슬 조끼 + 루비 수정 + 450');
  assert(c.itemBonusArmor === 75 && c.itemBonusMaxHp === 150, '가시 갑옷 방어력 75 · 체력 150');
  assert(LEGENDARY_ITEM_IDS.has('thornmail') && LEGENDARY_ITEM_IDS.has('fiendhunterBolts') && !LEGENDARY_ITEM_IDS.has('brambleVest'), '전설급: 가시 갑옷·악마사냥꾼의 화살(덤불 조끼는 아님)');
  assert(buyItem(c, 'thornmail') === false, '같은 전설급(가시 갑옷) 두 번째 구매는 거절');
  const f = makeFakeCtrl();
  buyItem(f, 'fiendhunterBolts');
  assert(Math.abs(f.itemBonusAttackSpeedPercent - 0.45) < 1e-9 && Math.abs(f.itemBonusCritChance - 0.25) < 1e-9 && Math.abs(f.itemBonusMoveSpeedPercent - 0.04) < 1e-9, '악마사냥꾼의 화살 공속 45% · 치명타 25% · 이속 4%');
  assert(f.itemBonusUltimateHaste === 30, '한밤 경계: 궁극기 가속 30');
}

// ---- 가시 ----
{
  const c = makeFakeCtrl();
  buyItem(c, 'thornmail');
  c.stats.armor = 30 + 75 + 20; c.stats.baseArmor = 30; // 추가 방어력 95(구매가 능력치를 다시 계산하므로 산 뒤에 맞춘다)
  const champ = { hp: 1000, isChampion: true, statusEffects: [] };
  itemOnTakeDamage(c, 50, 'PHYSICAL', champ, { isBasicAttack: true });
  assert(Math.abs((1000 - champ.hp) - (20 + 0.10 * 95)) < 1e-9, '가시 갑옷: 기본 공격자에게 20 + 추가 방어력 10% 마법 피해');
  const gw = champ.statusEffects.find((e) => e.type === 'GRIEVOUS');
  assert(gw && gw.value === 0.40 && gw.duration === 3, '가시: 챔피언 공격자에게 40% 고통스러운 상처 3초');
  const minion = { hp: 500, isMinion: true, statusEffects: [] };
  itemOnTakeDamage(c, 20, 'PHYSICAL', minion, { isBasicAttack: true });
  assert(minion.hp < 500 && !minion.statusEffects.some((e) => e.type === 'GRIEVOUS'), '가시: 미니언도 피해, 상처는 챔피언만');
  const caster = { hp: 1000, isChampion: true, statusEffects: [] };
  itemOnTakeDamage(c, 50, 'MAGICAL', caster, { isBasicAttack: false });
  assert(caster.hp === 1000, '가시: 스킬 피해에는 반응하지 않음');
  const turret = { hp: 3000, isTurret: true, isStructure: true, statusEffects: [] };
  itemOnTakeDamage(c, 50, 'PHYSICAL', turret, { isBasicAttack: true });
  assert(turret.hp === 3000, '가시: 포탑 공격에는 반응하지 않음');
  const b = makeFakeCtrl();
  buyItem(b, 'chainVest'); buyItem(b, 'chainVest'); buildOrBuyItem(b, 'brambleVest');
  const champ2 = { hp: 1000, isChampion: true, statusEffects: [] };
  itemOnTakeDamage(b, 50, 'PHYSICAL', champ2, { isBasicAttack: true });
  assert(1000 - champ2.hp === 10, '덤불 조끼: 가시 10');
}

// ---- 폭격 개시 ----
{
  const f = makeFakeCtrl();
  buyItem(f, 'fiendhunterBolts');
  assert(itemBarrageTakeSwing(f) === false || itemBarrageTakeSwing(f) === null || !itemBarrageTakeSwing(f), '궁극기 전에는 강화 평타 없음');
  itemOnUltimateCast(f);
  const as = f.statusEffects.find((e) => e.id === 'itemOpeningBarrageAs');
  assert(as && as.type === 'AS_BUFF' && as.value === 0.5 && as.duration === 8, '궁극기 사용 → 8초 공속 50%');
  const got = [itemBarrageTakeSwing(f), itemBarrageTakeSwing(f), itemBarrageTakeSwing(f), itemBarrageTakeSwing(f)];
  assert(!!got[0] && !!got[1] && !!got[2] && !got[3], '강화 평타는 3회');
  assert(!f.statusEffects.some((e) => e.id === 'itemOpeningBarrageAs'), '3회를 다 쓰면 공속 버프도 끝');
  itemOnUltimateCast(f);
  now += 8100;
  assert(!itemBarrageTakeSwing(f), '8초가 지나면 남은 강화 평타는 사라진다');
  const none = makeFakeCtrl();
  itemOnUltimateCast(none);
  assert(!none._itemBarrage, '아이템이 없으면 아무 일 없음');
  assert(Math.abs(abilityHasteCooldown(f, 120, 'R') - 120 * 100 / 130) < 1e-6, '궁극기 가속 30 → R 재사용 대기시간 100/130');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
