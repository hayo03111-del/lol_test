// 실제 applyDamage()(00_global_constants.js) + 아이템 시스템을 함께 로드해
// "피해 출처/종류 메타" 관련 버그 수정을 검증한다:
// 1) 미니언/포탑이 플레이어를 때릴 때 플레이어가 공격자로 오인되던 버그
// 2) 평타 1회가 월식 2회 적중으로 세어지던 버그 / 무라마나 이중 발동
// 3) 쇼진의창 증폭이 평타에도 붙던 근사, 운명의 재가 평타에도 붙던 근사
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
const stubs = {
  performance: { now: () => now },
  console,
  setTimeout: () => 0,
  controller: null,
  PLAYER_TEAM: 'BLUE',
  ENEMY_TEAM: 'RED',
  isPositionInBaseZone: () => true,
  updateGoldDisplay: () => {}, updateItemUI: () => {}, updateBars: () => {},
  getTurretGameTimeSec: () => 0,
  findEnemiesInRadius: () => [],
  damageEnemy: (t, d) => { t.hp = Math.max(0, t.hp - d); },
  unitLabel: () => 'unit',
  getWorldPosition: (e) => (e && e.root && e.root.position) || (e && e.mesh && e.mesh.position) || e,
  getHorizontalDistance: () => 0,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
vm.runInContext([
  read('src/core/00_global_constants.js'),
  read('src/core/01_status_effect_system.js'),
  read('src/champions/item_data.js'),
  read('src/core/item_system.js'),
].join('\n') + `
this.applyDamage = applyDamage;
this.calculateDamage = calculateDamage;
this.resolveDamageSource = resolveDamageSource;
this.ITEM_DATA = ITEM_DATA;
this.buyItem = buyItem;
this.itemOnBasicAttackHit = itemOnBasicAttackHit;
this.itemOnDamageDealt = itemOnDamageDealt;
this.setController = (c) => { controller = c; };
`, context);
const { applyDamage, calculateDamage, resolveDamageSource, buyItem, itemOnBasicAttackHit, setController } = context;

function makePlayer(overrides = {}) {
  const p = Object.assign({
    championId: 'testchamp', isChampion: true, team: 'BLUE',
    root: { position: { x: 0, y: 0, z: 0 } },
    items: [], gold: 1e6, boots: null, statusEffects: [],
    hp: 1000, maxHp: 2000, mp: 500, maxMp: 500, shield: 0,
    armor: 0, magicResist: 0,
    stats: { attackDamage: 100, abilityPower: 0, armor: 0, magicResist: 0, attackRange: 125, critChance: 0, moveSpeed: 340 },
    itemAllDamageVampPercent: 0, itemPhysicalVampPercent: 0, itemSpellDamageAmpPercent: 0,
    itemHealingReceivedBonusPercent: 0, _itemActiveHeals: [], _itemActiveManaRestores: [],
    _itemActiveCooldownUntil: {},
    recomputeStats() {},
    taken: [],
    takeDamage(dmg, source, type, meta) { this.taken.push({ dmg, source, type, meta }); this.hp -= dmg; },
  }, overrides);
  return p;
}
function makeEnemyChamp(overrides = {}) {
  return Object.assign({ isChampion: true, isTrainingDummy: false, hp: 3000, maxHp: 3000, armor: 0, magicResist: 0, statusEffects: [], root: { position: { x: 0, y: 0, z: 0 } }, mesh: { position: { x: 0, y: 0, z: 0 } } }, overrides);
}

// ------------------------------------------------------------------
// 1) 공격자 오인 버그
// ------------------------------------------------------------------
{
  const player = makePlayer({ itemAllDamageVampPercent: 0.5, itemSpellDamageAmpPercent: 0.5 });
  setController(player);
  assert(resolveDamageSource(null, player) === null, 'source 없는 피해의 대상이 플레이어 자신이면 공격자를 플레이어로 대체하지 않는다');
  const dummy = makeEnemyChamp();
  assert(resolveDamageSource(null, dummy) === player, 'source 없는 피해의 대상이 다른 유닛이면 기존처럼 플레이어를 공격자로 본다');

  const hpBefore = player.hp;
  applyDamage(player, { rawDamage: 100, damageType: 'TRUE', isCritical: false, critMultiplier: 1 });
  assert(Math.abs((hpBefore - player.hp) - 100) < 1e-9, `출처 없는 피해가 플레이어 자신의 피해 증폭(50%)으로 부풀려지지 않는다(받은 피해 ${(hpBefore - player.hp).toFixed(1)})`);
  assert(player.hp === hpBefore - 100, '플레이어가 받은 피해로 자기 흡혈(50%)이 발동하지 않는다');

  const minion = { isMinion: true, attackDamage: 50 };
  const before2 = player.hp;
  applyDamage(player, { rawDamage: 50, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: minion });
  assert(before2 - player.hp === 50, '미니언 기본 공격 피해도 플레이어 흡혈/증폭과 무관하다');
  const meta = player.taken[player.taken.length - 1].meta;
  assert(meta && meta.isBasicAttack === true, 'takeDamage()에 기본 공격 메타가 전달된다');
}

// ------------------------------------------------------------------
// 2) 월식 - 평타 1회는 1회 적중
// ------------------------------------------------------------------
{
  const player = makePlayer();
  setController(player);
  buyItem(player, 'eclipse');
  const target = makeEnemyChamp();
  // 실제 평타 경로: applyDamage(isBasicAttack) -> itemOnBasicAttackHit
  applyDamage(target, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true });
  itemOnBasicAttackHit(player, target, false);
  assert(!(player._itemEclipseIcdUntil > now), '월식: 평타 1회만으로는 발동하지 않는다(2회 적중 필요)');
  now += 100;
  applyDamage(target, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true });
  itemOnBasicAttackHit(player, target, false);
  assert(player._itemEclipseIcdUntil > now, '월식: 서로 다른 평타 2회면 발동한다');

  const p2 = makePlayer();
  setController(p2);
  buyItem(p2, 'eclipse');
  const t2 = makeEnemyChamp();
  applyDamage(t2, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1 }); // 스킬
  assert(!(p2._itemEclipseIcdUntil > now), '월식: 스킬 1회만으로는 발동하지 않는다');
  now += 100;
  applyDamage(t2, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true });
  itemOnBasicAttackHit(p2, t2, false);
  assert(p2._itemEclipseIcdUntil > now, '월식: 스킬 1회 + 평타 1회면 발동한다');
}

// ------------------------------------------------------------------
// 3) 쇼진의창 - 스킬로만 스택, 증폭은 평타에 적용 안 됨
// ------------------------------------------------------------------
{
  const player = makePlayer();
  setController(player);
  buyItem(player, 'shojinSpear');
  const target = makeEnemyChamp();
  applyDamage(target, { rawDamage: 10, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true });
  assert(!player._itemShojinStacks, '쇼진의창: 평타로는 스택이 쌓이지 않는다');
  applyDamage(target, { rawDamage: 10, damageType: 'TRUE', isCritical: false, critMultiplier: 1 });
  assert(player._itemShojinStacks === 1, '쇼진의창: 스킬 피해로 스택 1');
  applyDamage(target, { rawDamage: 10, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isStatusTick: true });
  assert(player._itemShojinStacks === 1, '쇼진의창: 도트 틱으로는 스택이 쌓이지 않는다');

  player.itemSpellDamageAmpPercent = 0.12;
  const skillDmg = calculateDamage({ rawDamage: 100, damageType: 'TRUE', target, source: player });
  const atkDmg = calculateDamage({ rawDamage: 100, damageType: 'TRUE', target, source: player, isBasicAttack: true });
  assert(Math.abs(skillDmg - 112) < 1e-9, `쇼진의창: 스킬 피해는 증폭된다(${skillDmg})`);
  assert(Math.abs(atkDmg - 100) < 1e-9, `쇼진의창: 기본 공격 피해는 증폭되지 않는다(${atkDmg})`);
}

// ------------------------------------------------------------------
// 4) 운명의 재 - 스킬 적중 시에만 발화
// ------------------------------------------------------------------
{
  const player = makePlayer();
  setController(player);
  buyItem(player, 'embersOfFate');
  const target = makeEnemyChamp();
  applyDamage(target, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true });
  assert(!target.statusEffects.some((e) => e.id === 'embersOfFateBurn'), '운명의 재: 평타로는 발화하지 않는다');
  applyDamage(target, { rawDamage: 10, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, isItemEffect: true, source: player });
  assert(!target.statusEffects.some((e) => e.id === 'embersOfFateBurn'), '운명의 재: 아이템 효과 피해로는 발화하지 않는다');
  applyDamage(target, { rawDamage: 10, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1 });
  assert(target.statusEffects.some((e) => e.id === 'embersOfFateBurn'), '운명의 재: 스킬 피해로 발화한다');
}

// ------------------------------------------------------------------
// 5) 무라마나 - 평타 1회에 스킬 보너스까지 같이 터지지 않는다
// ------------------------------------------------------------------
{
  const player = makePlayer({ mp: 1000, maxMp: 1000 });
  setController(player);
  player.items.push({ id: 'muramana' });
  const p = context.ITEM_DATA.muramana.shockPassive;
  const target = makeEnemyChamp({ hp: 100000, maxHp: 100000 });
  const before = target.hp;
  applyDamage(target, { rawDamage: 0, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true });
  const fromAbilityPath = before - target.hp;
  assert(fromAbilityPath === 0, `무라마나: 평타의 applyDamage 경로에서는 스킬 충격이 발동하지 않는다(추가 피해 ${fromAbilityPath.toFixed(2)})`);
  const before2 = target.hp;
  applyDamage(target, { rawDamage: 0, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1 });
  assert(before2 - target.hp > 0, '무라마나: 스킬 피해에는 스킬 충격이 발동한다');
  assert(p != null, '무라마나 데이터 존재(사전 조건)');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
