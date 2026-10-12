// 팀 시야(16차 이후): 파랑/빨강 공급원, 구조물 항상 보임, 드러내기, 시야 안 n 이상(inset), 화면 팀 전환.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let now = 0;
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return new V3(this.x, this.y, this.z); } }
const W = 0.01; // 1 LoL 단위 = 0.01 월드
const mk = (x, z, extra = {}) => Object.assign({ hp: 100, mesh: { visible: true, position: new V3(x * W, 0, z * W) }, labelDiv: { style: {} } }, extra);
const ctx = vm.createContext({
  performance: { now: () => now }, console,
  THREE: { Vector3: V3, CanvasTexture: class {}, PlaneGeometry: class { rotateX() { return this; } }, MeshBasicMaterial: class {}, Mesh: class { constructor() { this.position = new V3(); } } },
  document: { createElement: () => ({ getContext: () => ({ fillRect() {}, beginPath() {}, arc() {}, fill() {}, clearRect() {}, createRadialGradient: () => ({ addColorStop() {} }) }) }) },
  groundSize: 280, lolRangeToWorld: (r) => (r || 0) * W, STATE: { DEAD: 'DEAD' }, PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  getWorldPosition: (u) => (u.root ? u.root.position : u.mesh.position),
  isInCircle: (u, c, r) => { const p = u.root ? u.root.position : u.mesh.position; return Math.hypot(p.x - c.x, p.z - c.z) <= r; },
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/vision_system.js'), 'utf8') + '\nthis.VisionSystem = VisionSystem; this.VISION_CONFIG = VISION_CONFIG;', ctx);
function assert(c, m) { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); }

const enemyNear = mk(0, 1300, { team: 'RED', isChampion: true }), enemyFar = mk(0, 1500, { team: 'RED', isChampion: true });
const turret = mk(9000, 0, { team: 'RED', isStructure: true, isTurret: true });
const blueMinion = mk(5000, 0, { team: 'BLUE', type: 'melee' }), enemyByMinion = mk(5000, 1100, { team: 'RED' });
ctx.placedDummies = [enemyNear, enemyFar, enemyByMinion];
ctx.minions = [blueMinion];
ctx.turrets = [turret];
ctx.placedAllies = [];
ctx.getAllEnemyUnits = () => [enemyNear, enemyFar, enemyByMinion, turret];
const player = { team: 'BLUE', hp: 100, state: 'IDLE', championId: 'garen', root: { position: new V3(0, 0, 0), isObject3D: true, visible: true } };
const vs = new ctx.VisionSystem({ add() {} });
vs.update(player, 0.016);
assert(ctx.VISION_CONFIG.championSightRange === 1350 && ctx.VISION_CONFIG.minionSightRange === 1200 && ctx.VISION_CONFIG.turretSightRange === 1350, '시야 반경: 챔피언 1350·미니언 1200·포탑 1350(PC 위키 Sight)');
assert(vs.isVisible(enemyNear) && !vs.isVisible(enemyFar), '플레이어 시야 1350: 1300은 보이고 1500은 안 보인다');
assert(vs.isVisible(turret) && vs.isVisibleTo('BLUE', turret), '구조물은 시야 밖이어도 항상 보인다');
assert(vs.isVisible(enemyByMinion), '아군 미니언 시야(1200)로 먼 적도 보인다(팀 공유 시야)');
assert(enemyFar.mesh.visible === false && enemyNear.mesh.visible === true, '화면: 안 보이는 적은 숨김');
// 빨강 시야: 빨강 챔피언(1350)이 플레이어(1300 떨어짐)를 본다
assert(vs.isVisibleTo('RED', player), '빨강 팀 시야: 1300 거리의 적 챔피언이 플레이어를 본다');
enemyNear.mesh.position = new V3(0, 0, 9000 * W); vs.update(player, 0.016);
assert(!vs.isVisibleTo('RED', player), '빨강 팀 시야: 가까운 빨강 유닛이 없으면 플레이어는 빨강에게 안 보인다');
vs.setViewTeam('RED'); vs.update(player, 0.016);
assert(player.root.visible === false, '빨강 시점: 빨강 시야 밖의 플레이어는 화면에서 숨김');
assert(vs.isVisible(enemyFar) === false, '빨강 시점이어도 타게팅 판정은 플레이어 팀 시야 그대로');
vs.setViewTeam('BLUE'); vs.update(player, 0.016);
assert(player.root.visible === true, '파랑 시점 복귀: 플레이어 다시 보임');
// 드러내기(가렌 R)
vs.revealUnit(enemyFar, 1, 'BLUE'); vs.update(player, 0.016);
assert(vs.isVisible(enemyFar), '드러내기: 시야 밖 대상도 1초 동안 보인다(가렌 R)');
now += 1100; vs.update(player, 0.016);
assert(!vs.isVisible(enemyFar), '드러내기: 1초 뒤 다시 안개 속');
// 시야 안 n 이상(모데카이저 E - 300)
assert(vs.isPointVisibleTo('BLUE', new V3(0, 0, 1200 * W), 0) && !vs.isPointVisibleTo('BLUE', new V3(0, 0, 1200 * W), 300), '시야 안 300 이상: 1350 반경에서 1200 지점은 일반은 보이고 inset 300이면 안 보인다');
// 임시 시야는 팀별
now += 10; vs.grantVision(new V3(0, 0, 1500 * W), 500, 1, 'RED'); vs.update(player, 0.016);
assert(!vs.isVisible(enemyFar), '빨강 팀 임시 시야는 파랑 시야에 더해지지 않는다');

// --- 부쉬(PC 위키 Brush) ---
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/world/brush_system.js'), 'utf8') + '\nthis.BrushSystem = BrushSystem; this.BRUSH_CONFIG = BRUSH_CONFIG;', ctx);
const brushes = new ctx.BrushSystem(null);
ctx.brushSystem = brushes;
ctx.visionSystem = vs;
const bush = brushes.addBrush({ x: 0, z: 1000 * W, widthLol: 450, depthLol: 300 });
const hider = mk(0, 1000, { team: 'RED', isChampion: true });
ctx.placedDummies = [hider]; ctx.minions = []; ctx.turrets = [];
ctx.getAllEnemyUnits = () => [hider];
player.root.position = new V3(0, 0, 0); now += 5000; vs.temporarySources = []; vs.reveals = [];
vs.update(player, 0.016);
assert(brushes.brushAt(hider.mesh.position) === bush && !vs.isVisible(hider), '부쉬: 시야 반경 안(1000)이어도 부쉬 밖에서는 안의 적이 안 보인다');
player.root.position = new V3(100 * W, 0, 1000 * W); vs.update(player, 0.016);
assert(vs.isVisible(hider), '부쉬: 같은 부쉬 안에 들어가면 보인다');
player.root.position = new V3(0, 0, 0);
vs.grantVision(new V3(0, 0, 700 * W), 400, 1, 'BLUE'); vs.update(player, 0.016);
assert(!vs.isVisible(hider), '부쉬: 부쉬 밖에 놓인 와드(위치 공급원)로는 안이 안 보인다');
vs.grantVision(new V3(0, 0, 1050 * W), 400, 1, 'BLUE'); vs.update(player, 0.016);
assert(vs.isVisible(hider), '부쉬: 부쉬 안에 놓인 와드로는 보인다');
now += 1100; vs.update(player, 0.016);
vs.grantVision(new V3(0, 0, 800 * W), 900, 1, 'BLUE', { revealsBrush: true }); vs.update(player, 0.016);
assert(vs.isVisible(hider), '부쉬: 지역을 드러내는 스킬 시야(애쉬 E·R)는 부쉬 안도 보인다');
now += 1100; vs.update(player, 0.016);
assert(!vs.isVisible(hider), '부쉬: 스킬 시야가 끝나면 다시 안 보인다');
// 부쉬 안에서는 바깥이 보인다
const outside = mk(0, 1900, { team: 'RED', isChampion: true });
ctx.placedDummies = [hider, outside]; ctx.getAllEnemyUnits = () => [hider, outside];
player.root.position = new V3(0, 0, 1000 * W); vs.update(player, 0.016);
assert(vs.isVisible(outside), '부쉬: 부쉬 안에서는 바깥(900 거리)이 보인다');
// 빨강 시점: 부쉬 안 플레이어는 바깥 빨강 유닛에게 안 보이고, 공격하면 2초 드러난다
ctx.placedDummies = [outside]; ctx.getAllEnemyUnits = () => [outside];
vs.update(player, 0.016);
assert(!vs.isVisibleTo('RED', player), '부쉬: 부쉬 안의 플레이어는 바깥 빨강 유닛(900 거리)에게 안 보인다');
brushes.onActionFromBrush(player); vs.update(player, 0.016);
assert(vs.isVisibleTo('RED', player), '부쉬: 부쉬 안에서 공격·스킬을 쓰면 상대에게 드러난다(Fandom: 반경 300, 2초)');
now += 2100; vs.update(player, 0.016);
assert(!vs.isVisibleTo('RED', player), '부쉬: 2초 뒤 다시 숨는다');
assert(!vs.isPointVisibleTo('RED', new V3(0, 0, 1000 * W)) && vs.isPointVisibleTo('BLUE', new V3(0, 0, 1000 * W)), '부쉬: 예고 표시 판정도 부쉬 규칙을 따른다');
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
