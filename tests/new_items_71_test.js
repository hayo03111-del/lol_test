// 71차: 새 아이템 49종(item_data.js 71차 묶음 + item_extra_system.js) - 실제 소스를 vm으로 실행해 확인한다.
// (하네스는 thorns_fiendhunter_test.js와 같다.)
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
  findEnemiesInRadius: (pos, radius) => (stubs._radiusHits || []).map((u) => (u.unit ? u : { unit: u, distance: 0 })),
  findAlliesInRadius: () => (stubs._allies || []).map((u) => ({ unit: u, distance: 0 })),
  healAlly: (src, t, amt) => { t.hp = Math.min(t.maxHp, t.hp + amt); return amt; },
  lolRangeToWorld: (v) => v,
  showSkillToast: (m) => { stubs._toasts.push(m); },
  _toasts: [],
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
const itemSystemSrc = fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/item_extra_system.js'), 'utf8');
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
this.ITEM_CATEGORIES = ITEM_CATEGORIES; this.ITEM_EXTRA_71_IDS = ITEM_EXTRA_71_IDS; this.itemOnChampionTakedown = itemOnChampionTakedown;
this.getMagicVulnerablePercent = getMagicVulnerablePercent;
`, context);
const {
  ITEM_DATA, buyItem, buildOrBuyItem, recomputeItemStats, itemSystemTick,
  itemOnBasicAttackHit, itemOnDamageDealt, itemOnTakeDamage, useItem, combineCost,
  itemOnUltimateCast, itemBarrageTakeSwing, LEGENDARY_ITEM_IDS, abilityHasteCooldown, ITEM_CATEGORIES, ITEM_EXTRA_71_IDS, itemOnChampionTakedown, getMagicVulnerablePercent,
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

const enemy = (o = {}) => Object.assign({ isChampion: true, hp: 3000, maxHp: 3000, magicResist: 40, statusEffects: [], mesh: { position: { x: 1, y: 0, z: 0 } } }, o);
const champSrc = { championId: 'enemychamp', isChampion: true };
const has = (id) => (c) => c.items.some((s) => s.id === id);

// ---- 데이터: 49종 전부 등록, 상점 분류·전설급·조합 재료 ----
{
  const ids = Object.values(ITEM_EXTRA_71_IDS).flat();
  assert(ids.length === 49, `새 아이템 49종 (got ${ids.length})`);
  assert(ids.every((id) => ITEM_DATA[id] && ITEM_DATA[id].id === id && ITEM_DATA[id].cost > 0), '전부 ITEM_DATA에 있고 가격이 있다');
  for (const [cat, list] of Object.entries(ITEM_EXTRA_71_IDS)) {
    const c = ITEM_CATEGORIES.find((x) => x.id === cat);
    assert(c && list.every((id) => c.items.includes(id)), `상점 분류 ${cat}에 들어 있다`);
  }
  assert(ITEM_EXTRA_71_IDS.legendary.every((id) => LEGENDARY_ITEM_IDS.has(id)), '전설급 38종은 같은 전설급 하나만 규칙 대상');
  const badRecipe = ids.filter((id) => (ITEM_DATA[id].recipe || []).some((r) => !ITEM_DATA[r]));
  assert(badRecipe.length === 0, `조합 재료가 전부 존재 (${badRecipe.join(',')})`);
  assert(ids.every((id) => combineCost(ITEM_DATA[id]) >= 0), '조합 비용이 음수가 아니다');
  assert(ITEM_DATA.sunfireAegis.cost === 2800 && ITEM_DATA.ravenousHydra.cost === 3300 && ITEM_DATA.guardiansHorn.cost === 950, '가격(Data Dragon): 태양불꽃 방패 2800, 굶주린 히드라 3300, 수호자의 뿔피리 950');
  const c = makeFakeCtrl();
  buyItem(c, 'chainVest'); buyItem(c, 'chainVest');
  const g = c.gold;
  assert(buildOrBuyItem(c, 'wardensMail') && c.gold === g - (1000 - 2 * ITEM_DATA.chainVest.cost), '파수꾼의 갑옷 = 천 갑옷 2개 + 조합비');
  buyItem(c, 'chainVest'); buyItem(c, 'sapphireCrystal'); buyItem(c, 'glowingMote'); buildOrBuyItem(c, 'glacialBuckler');
  assert(buildOrBuyItem(c, 'frozenHeart') && c.items.length === 1 && c.itemBonusArmor === 75 && c.itemBonusMana === 400, '얼어붙은 심장 = 파수꾼의 갑옷 + 얼음 방패, 방어력 75 · 마나 400');
  const h = makeFakeCtrl(); buyItem(h, 'tiamat'); buyItem(h, 'vampiricScepter'); buyItem(h, 'caulfieldsWarhammer');
  assert(buildOrBuyItem(h, 'ravenousHydra') === true && h.items.length === 1 && buyItem(makeFakeCtrl({ items: [{ id: 'titanicHydra', count: 1 }] }), 'profaneHydra') === false, '히드라 계열 유일(티아맷 조합은 허용, 다른 히드라와는 불가)');
}

// ---- 수호자의 뿔피리 / 파수꾼의 갑옷 / 란두인 / 케이닉 루컨 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'guardiansHorn');
  assert(Math.abs(itemOnTakeDamage(c, 100, 'PHYSICAL', champSrc, {}) - 85) < 1e-6, '뿔피리: 적 챔피언 피해 15 감소');
  assert(Math.abs(itemOnTakeDamage(c, 100, 'PHYSICAL', champSrc, { isStatusTick: true }) - 96.25) < 1e-6, '뿔피리: 지속 피해는 25%만(3.75)');
  assert(itemOnTakeDamage(c, 100, 'PHYSICAL', { isMinion: true }, {}) === 100, '뿔피리: 미니언 피해는 그대로');
  const w = makeFakeCtrl(); buyItem(w, 'wardensMail');
  assert(Math.abs(itemOnTakeDamage(w, 100, 'PHYSICAL', { isMinion: true }, { isBasicAttack: true }) - (100 - (5 + 3.5 * 2))) < 1e-6, '파수꾼의 갑옷: 기본 공격 피해 5 + 최대 체력 1000당 3.5 감소');
  assert(itemOnTakeDamage(w, 100, 'PHYSICAL', { isTurret: true }, { isBasicAttack: true }) === 100, '파수꾼의 갑옷: 포탑 공격은 감소 없음');
  const r = makeFakeCtrl(); buyItem(r, 'randuinsOmen');
  assert(Math.abs(itemOnTakeDamage(r, 200, 'PHYSICAL', champSrc, { isCritical: true }) - 140) < 1e-6, '란두인(저항): 치명타 피해 30% 감소');
  stubs._radiusHits = [enemy()];
  assert(useItem(r, 0) === true && stubs._radiusHits[0].statusEffects.some((e) => e.type === 'SLOW' && e.value === 0.7), '란두인 사용: 주변 적 70% 둔화');
  assert(useItem(r, 0) === false, '란두인: 재사용 대기 중엔 사용 불가');
  const k = makeFakeCtrl(); buyItem(k, 'kaenicRookern'); now += 100;
  itemSystemTick(k, 0.016);
  const shield = k._itemRookernShield;
  assert(shield > 0 && Math.abs(shield - k.maxHp * 0.18) < 1, `케이닉 루컨: 마법 보호막(최대 체력 18% = ${Math.round(shield)})`);
  assert(itemOnTakeDamage(k, 100, 'MAGICAL', champSrc, {}) === 0 && Math.abs(k._itemRookernShield - (shield - 100)) < 1e-6, '케이닉 루컨: 마법 피해를 먼저 흡수');
  assert(itemOnTakeDamage(k, 100, 'PHYSICAL', champSrc, {}) === 100, '케이닉 루컨: 물리 피해는 막지 않음');
}

// ---- 불사르기(태양불꽃 방패) / 공허한 광휘 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'sunfireAegis');
  const e = enemy({ isChampion: false, isMinion: true, hp: 1000, maxHp: 1000 });
  stubs._radiusHits = [e];
  itemOnDamageDealt(c, enemy(), 50, 'PHYSICAL', { isBasicAttack: true });
  itemSystemTick(c, 1.0);
  const expect = (20 + 350 * 0.01) * 1.5;
  assert(Math.abs((1000 - e.hp) - expect) < 1e-6, `불사르기: 피해를 입히면 1초마다 주변 적에게 마법 피해(미니언 ×1.5 = ${expect})`);
  now += 3500; const hp0 = e.hp; itemSystemTick(c, 1.0);
  assert(e.hp === hp0, '불사르기: 3초 동안 전투가 없으면 꺼짐');
}

// ---- 모렐로노미콘 / 핏빛 저주 / 심연의 가면 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'morellonomicon'); buyItem(c, 'bloodlettersCurse'); buyItem(c, 'abyssalVisage');
  const t = enemy();
  itemOnDamageDealt(c, t, 100, 'MAGICAL', { isAbility: true });
  assert(t.statusEffects.some((e) => e.type === 'GRIEVOUS' && e.value === 0.4), '모렐로노미콘: 마법 피해에 40% 고통스러운 상처');
  for (let i = 0; i < 6; i++) itemOnDamageDealt(c, t, 10, 'MAGICAL', { isAbility: true });
  const rot = t.statusEffects.find((e) => e.id === 'itemBloodletterRot');
  assert(rot && Math.abs(rot.value - 40 * 0.075 * 4) < 1e-6, '핏빛 저주: 마법 저항력 7.5% × 최대 4중첩 감소');
  stubs._radiusHits = [t]; c._itemAuraAcc = 1; itemSystemTick(c, 0.016);
  assert(Math.abs(getMagicVulnerablePercent(t) - 0.12) < 1e-6, '심연의 가면: 주변 적 챔피언이 받는 마법 피해 12% 증가');
}

// ---- 수은 장식띠 / 영혼의 닻 / 카파 주스 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'quicksilverSash');
  c.statusEffects = [{ id: 's', type: 'STUN', expiresAt: now + 5000 }, { id: 'k', type: 'KNOCKUP', expiresAt: now + 5000 }, { id: 'b', type: 'AS_BUFF', expiresAt: now + 5000 }];
  assert(useItem(c, 0) === true && c.statusEffects.map((e) => e.type).join() === 'KNOCKUP,AS_BUFF', '수은 장식띠: 군중 제어 제거(공중에 뜸은 남김)');
  const a = makeFakeCtrl({ root: { position: { x: 0, y: 0, z: 0, clone() { return { x: this.x, y: this.y, z: this.z }; } } } }); buyItem(a, 'lifeline');
  assert(useItem(a, 0) === true, '생명선: 영혼의 닻 사용');
  a.root.position.x = 9; a.root.position.z = 4;
  now += 4100; itemSystemTick(a, 0.016);
  assert(a.root.position.x === 0 && a.root.position.z === 0, '영혼의 닻: 4초 뒤 표식 자리로 돌아감');
  const j = makeFakeCtrl(); buyItem(j, 'cappaJuice'); buyItem(j, 'cappaJuice');
  assert(useItem(j, 0) === true && j.items[0].count === 1, '카파 주스: 사용하면 1개 소모(효과 없음)');
}

// ---- 히드라 / 루난 / 스태틱 / 얼어붙은 건틀릿 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'profaneHydra');
  const t = enemy(), o = enemy();
  stubs._radiusHits = [t, o];
  itemOnBasicAttackHit(c, t, false);
  assert(Math.abs((3000 - o.hp) - 0.4 * c.stats.attackDamage) < 1e-6, '불경한 히드라: 쪼개기(근접 공격력 40%)');
  const r = makeFakeCtrl({ stats: { attackDamage: 100, abilityPower: 0, attackRange: 550, critChance: 0, armor: 0, magicResist: 0, moveSpeed: 330 } });
  buyItem(r, 'runaansHurricane');
  const t2 = enemy({ mesh: { position: { x: 0, y: 0, z: 0 } } }), o1 = enemy({ mesh: { position: { x: 1, y: 0, z: 0 } } }), o2 = enemy({ mesh: { position: { x: 2, y: 0, z: 0 } } }), o3 = enemy({ mesh: { position: { x: 3, y: 0, z: 0 } } });
  stubs._radiusHits = [t2, o1, o2, o3];
  itemOnBasicAttackHit(r, t2, false);
  const hit = [o1, o2, o3].filter((u) => u.hp < 3000).length;
  assert(hit === 2 && Math.abs(3000 - o1.hp - 55) < 1e-6, '루난의 허리케인: 원거리 공격 시 가까운 적 2명에게 탄환(공격력 55%)');
  const s = makeFakeCtrl(); buyItem(s, 'statikkShiv'); itemSystemTick(s, 2.1);
  const a1 = enemy(), a2 = enemy();
  stubs._radiusHits = [a1, a2];
  itemOnBasicAttackHit(s, a1, false);
  assert(a1.hp < 3000 && a2.hp < 3000 && s._itemShivCharge === 0, '스태틱의 단검: 충전 상태 공격에 연쇄 번개(대상 + 주변)');
  const g = makeFakeCtrl(); buyItem(g, 'frozenGauntlet');
  g._itemSheenArmed = true;
  const f1 = enemy(); stubs._radiusHits = [f1];
  itemOnBasicAttackHit(g, f1, false);
  assert(f1.statusEffects.some((e) => e.id === 'itemFrostField' && e.type === 'SLOW') && g._itemSheenArmed === false, '얼어붙은 건틀릿: 주문 검 발동 + 서리 영역 둔화');
}

// ---- 궁극기: 지크의 융합 / 실험적 마공학판, 처치: 원칙의 원형낫 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'zekesConvergence'); buyItem(c, 'experimentalHexplate');
  const t = enemy(); stubs._radiusHits = [t];
  itemOnUltimateCast(c);
  itemSystemTick(c, 0.016);
  assert(t.hp === 3000 - 30 && t.statusEffects.some((e) => e.id === 'itemZekeSlow'), '지크의 융합: 궁극기 뒤 폭풍 - 매초 30 마법 피해 + 둔화');
  assert(c.statusEffects.some((e) => e.id === 'itemOverdriveAs' && e.type === 'AS_BUFF'), '실험적 마공학판: 궁극기 뒤 공격 속도 증가');
  assert(c.itemBonusUltimateHaste === 30, '실험적 마공학판: 궁극기 가속 30');
  const x = makeFakeCtrl(); buyItem(x, 'axiomArc');
  x.cooldowns.R = 100; itemSystemTick(x, 0.016); x.cooldowns.R = 60;
  itemOnChampionTakedown(x);
  assert(Math.abs(x.cooldowns.R - 45) < 1e-6, '원칙의 원형낫: 처치 시 R 전체 재사용 대기시간의 15% 반환');
}

// ---- 능력치형 효과: 혹한의 손길 / 아트마 / 새벽심장 ----
{
  const w = makeFakeCtrl(); buyItem(w, 'wintersApproach');
  assert(Math.abs(w.itemBonusMaxHp - (550 + 500 * 0.15)) < 1e-6, '혹한의 손길(경탄): 아이템 마나의 15%만큼 체력');
  const a = makeFakeCtrl(); buyItem(a, 'atmasReckoning');
  assert(Math.abs(a.itemBonusCritChance - (0.20 + 700 * 0.0001)) < 1e-6, '아트마의 심판(큰손): 추가 체력 비례 치명타 확률');
  const d = makeFakeCtrl(); buyItem(d, 'dawncore');
  assert(Math.abs(d.itemBonusAP - (45 + 10)) < 1e-6 && Math.abs(d.itemHealingReceivedBonusPercent - (0.16 + 0.02)) < 1e-6, '새벽심장(태초의 빛): 기본 마나 재생 100%마다 주문력 10 · 회복 2%');
}

// ---- 원형질 안전벨트 / 대자연의 힘 ----
{
  const c = makeFakeCtrl(); buyItem(c, 'protoplasmHarness');
  c.hp = 900;
  itemOnTakeDamage(c, 400, 'PHYSICAL', champSrc, {});
  assert(c._itemExtraBuffs && c._itemExtraBuffs.protoplasm && c._itemActiveHeals.length === 1 && c.statusEffects.some((e) => e.type === 'TENACITY'), '원형질 안전벨트: 체력 30% 아래로 떨어지면 최대 체력·회복·강인함');
  const f = makeFakeCtrl(); buyItem(f, 'forceOfNature');
  for (let i = 0; i < 8; i++) { now += 600; itemOnTakeDamage(f, 10, 'MAGICAL', champSrc, {}); }
  assert(f.itemBonusMr === 55 + 70, '대자연의 힘: 챔피언 마법 피해 8회 → 마법 저항력 70');
}

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');
