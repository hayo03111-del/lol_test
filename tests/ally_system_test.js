// 아군 챔피언 시스템(ally_system.js) + 아군이 필요한 효과 테스트.
// 실제 00_global_constants.js(applyDamage) / dummy_enemy.js(damageEnemy) /
// character_controller.js + leesin.js + nilah.js + item_system.js를 로드한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
class Vector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  setY(y){this.y=y;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  applyQuaternion(){return this;}
}
const timers = [];
const stubs = {
  performance: { now: () => now },
  console,
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; },
  clearTimeout: () => {},
  controller: null,
  PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  updateBars: () => {}, updateSkillUI: () => {}, refreshUnitCcTags: () => {}, itemSystemTick: () => {},
  updateGoldDisplay: () => {}, updateItemUI: () => {}, getTurretGameTimeSec: () => 0, isPositionInBaseZone: () => true,
  placedDummies: [],
  vfx: { spawn: () => {} },
  document: { getElementById: () => null },
  THREE: { Vector3, LoopOnce: 2200, Color: class {}, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
  scene: { add(){}, remove(){} },
  visionSystem: { grantVision(){} },
};
const context = vm.createContext(stubs);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
vm.runInContext([
  read('src/core/00_global_constants.js'),
  read('src/core/01_status_effect_system.js'),
  read('src/core/01_hit_detection.js'),
  read('src/core/ally_system.js'),
  read('src/champions/champion_data.js'),
  read('src/champions/item_data.js'),
  read('src/core/item_system.js'),
  read('src/world/dummy_enemy.js').replace(/^function createDummyEnemy[\s\S]*?\n}\n/m, ''),
  read('src/core/character_controller.js'),
  read('src/core/controller_movement.js'),
  read('src/core/controller_combat.js'),
  read('src/core/controller_casting.js'),
  read('src/core/controller_lifecycle.js'),
  read('src/champions/leesin.js'),
  read('src/champions/nilah.js'),
].join('\n') + `
this.CharacterController = CharacterController;
this.CHAMPION_DATA = CHAMPION_DATA;
this.ITEM_DATA = ITEM_DATA;
this.placedAllies = placedAllies;
this.getAllyChampions = getAllyChampions;
this.findAlliesInRadius = findAlliesInRadius;
this.healAlly = healAlly;
this.shieldAlly = shieldAlly;
this.tickAllyUnits = tickAllyUnits;
this.applyDamage = applyDamage;
this.applyStatus = applyStatus;
this.lolRangeToWorld = lolRangeToWorld;
this.itemOnSlowOrImmobilize = itemOnSlowOrImmobilize;
this.setController = (c) => { controller = c; };
`, context);
const { CharacterController, CHAMPION_DATA, ITEM_DATA, placedAllies, getAllyChampions, findAlliesInRadius, healAlly, shieldAlly, tickAllyUnits, applyDamage, applyStatus, lolRangeToWorld, itemOnSlowOrImmobilize, setController } = context;

function labelStub() { return { querySelector: () => ({ style: {} }), classList: { contains: () => false }, style: {} }; }
function makeAlly(x, z, overrides = {}) {
  const pos = new Vector3(x, 0, z);
  return Object.assign({ isChampion: true, isAlly: true, isTrainingDummy: true, team: 'BLUE', hp: 500, maxHp: 1000, shield: 0, shieldEntries: [], statusEffects: [], champLevel: 1, armor: 0, magicResist: 0, collisionRadius: 0.3, mesh: { position: pos }, root: { position: pos }, labelDiv: labelStub(), body: { material: {} } }, overrides);
}
function setAllies(...list) { placedAllies.length = 0; placedAllies.push(...list); }
function makeChamp(championId, overrides = {}) {
  const c = Object.create(CharacterController.prototype);
  Object.assign(c, {
    championId, team: 'BLUE', isChampion: true,
    root: { position: new Vector3(0, 0, 0), quaternion: {}, rotation: { y: 0 } },
    hp: 2000, maxHp: 2000, mp: 1000, maxMp: 1000, shield: 0, statusEffects: [],
    champLevel: 1, skillLevels: { Q: 1, W: 1, E: 1, R: 1 }, cooldowns: { Q: 0, W: 0, E: 0, R: 0 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 125 },
    collisionRadius: 0.3, attackOverrides: [], subStates: {}, items: [],
    passiveState: { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0 }, state: 'IDLE', _actionTimers: [],
    findAnimation: () => null, playFirstAvailable() {}, faceDirectionInstant() {}, setState() {},
    canStartNewAction: () => true, _clearActionTimers() {}, _resumeAfterAction() {},
  }, overrides);
  setController(c);
  return c;
}

// ------------------------------------------------------------------
// 아군 목록/범위/회복/보호막
// ------------------------------------------------------------------
{
  const me = makeChamp('garen');
  const a = makeAlly(lolRangeToWorld(300), 0), b = makeAlly(lolRangeToWorld(2000), 0), dead = makeAlly(1, 0, { hp: 0 });
  setAllies(a, b, dead);
  assert(getAllyChampions(me).length === 2, '살아 있는 아군만 목록에 들어간다');
  const near = findAlliesInRadius(me.root.position, 600);
  assert(near.length === 1 && near[0].unit === a, '범위(600) 안의 아군만 찾는다');

  const healed = healAlly(me, a, 100);
  assert(Math.abs(healed - 100) < 1e-9 && a.hp === 600, '아군 회복');
  applyStatus(a, { id: 'g', type: 'GRIEVOUS', duration: 5, value: 0.4 });
  healAlly(me, a, 100);
  assert(Math.abs(a.hp - 660) < 1e-9, '아군에게도 그리버스(40%)가 적용된다');
  a.hp = 990; healAlly(me, a, 100);
  assert(a.hp === 1000, '최대 체력을 넘지 않는다');

  shieldAlly(me, b, 200, 2, { decay: true });
  assert(b.shield === 200, '아군 보호막');
  now += 1000; tickAllyUnits(1.0);
  assert(Math.abs(b.shield - 100) < 1e-6, '감소형 보호막은 지속시간에 걸쳐 줄어든다');
  shieldAlly(me, b, 50, 1);
  now += 1100; tickAllyUnits(0.01);
  assert(b.shield < 1e-6, '지속시간이 끝나면 보호막이 사라진다');

  // 실제 applyDamage -> damageEnemy 경로로 아군 보호막이 피해를 흡수한다.
  const c = makeAlly(1, 0, { hp: 800 });
  setAllies(c);
  shieldAlly(me, c, 100, 5);
  applyDamage(c, { rawDamage: 150, damageType: 'TRUE', isCritical: false, critMultiplier: 1 });
  assert(c.shield === 0 && Math.abs(c.hp - 750) < 1e-6, `아군 보호막이 피해를 먼저 흡수한다(hp ${c.hp})`);
}

// ------------------------------------------------------------------
// 리 신 W(방호) - 아군에게 돌진 + 둘 다 보호막 / 아군 없으면 자기 시전
// ------------------------------------------------------------------
{
  const w = CHAMPION_DATA.leesin.W;
  const lee = makeChamp('leesin', { _leesin: { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0, eMarkHits: [], eMarkExpiresAt: 0, passiveHitsLeft: 0 } });
  setAllies();
  lee._leesinCastW(false, new Vector3(5, 0, 5));
  assert(Math.abs(lee.shield - w.shieldByLevel[0]) < 1e-6, `리 신 W: 아군이 없으면 자기 자신에게 보호막 ${w.shieldByLevel[0]}`);
  assert(!lee._dashState, '리 신 W: 자기 시전은 돌진하지 않는다');

  const lee2 = makeChamp('leesin', { _leesin: { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0, eMarkHits: [], eMarkExpiresAt: 0, passiveHitsLeft: 0 } });
  const ally = makeAlly(lolRangeToWorld(500), 0);
  setAllies(ally);
  lee2._leesinCastW(false, ally.root.position.clone());
  assert(Math.abs(ally.shield - w.shieldByLevel[0]) < 1e-6, '리 신 W: 커서 근처 아군에게 보호막');
  assert(Math.abs(lee2.shield - w.shieldByLevel[0]) < 1e-6, '리 신 W: 리 신 자신도 보호막');
  assert(lee2._dashState && lee2._dashState.to.x > 0, '리 신 W: 아군에게 돌진한다');

  const lee3 = makeChamp('leesin', { _leesin: { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0, eMarkHits: [], eMarkExpiresAt: 0, passiveHitsLeft: 0 } });
  const farAlly = makeAlly(lolRangeToWorld(1500), 0);
  setAllies(farAlly);
  lee3._leesinCastW(false, farAlly.root.position.clone());
  assert(farAlly.shield === 0 && !lee3._dashState, '리 신 W: 사거리(700) 밖 아군은 대상이 아니다(자기 시전으로 처리)');

  // 보호막 만료
  timers.filter((t) => t.at <= now + 2100).forEach((t) => t.fn());
  setAllies();
}

// ------------------------------------------------------------------
// 태양의 썰매 - 자신 + 주변에서 체력 비율이 가장 낮은 아군 1명 이동속도
// ------------------------------------------------------------------
{
  const me = makeChamp('garen');
  me.items.push({ id: 'solsticeSleigh' });
  const healthy = makeAlly(lolRangeToWorld(300), 0, { hp: 900 }), hurt = makeAlly(lolRangeToWorld(400), 0, { hp: 200 });
  setAllies(healthy, hurt);
  itemOnSlowOrImmobilize(me, { isChampion: true }, 'SLOW');
  assert(me.statusEffects.some((e) => e.id === 'itemSolsticeSleighMs'), '태양의 썰매: 자신 이동속도');
  assert(hurt.statusEffects.some((e) => e.id === 'itemSolsticeSleighMs') && !healthy.statusEffects.some((e) => e.id === 'itemSolsticeSleighMs'), '태양의 썰매: 체력이 가장 낮은 아군 1명만 이동속도');
  setAllies();
}

// ------------------------------------------------------------------
// 닐라 - 아군 회복/초과 회복 보호막이 아군 시스템을 거친다(월석재생기 연쇄)
// ------------------------------------------------------------------
{
  const nilah = makeChamp('nilah', { _nilah: {} });
  nilah.items.push({ id: 'moonstoneRenewer' });
  const a = makeAlly(lolRangeToWorld(100), 0, { hp: 950 }), b = makeAlly(lolRangeToWorld(300), 0, { hp: 500 });
  setAllies(a, b);
  const over = nilah._nilahHealUnit(a, 100, 2, 'nilahP');
  assert(a.hp === 1000 && Math.abs(over - 50) < 1e-6, '닐라: 아군 초과 회복량 50 계산');
  assert(Math.abs(a.shield - 50) < 1e-6, '닐라: 초과 회복은 아군 보호막으로');
  assert(b.hp > 500 && b.shield > 0, '닐라: 월석재생기 연쇄로 근처 다른 아군도 회복/보호막을 받는다');
  setAllies();
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
