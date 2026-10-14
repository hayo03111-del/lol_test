// 32차 와드 시스템(src/world/ward_system.js) 단위 테스트 - Node vm + 가짜 THREE.
// 원작 규칙: 투명 와드 체력 3·은신·1인 3개, 제어 와드 체력 4·은신 아님·1인 1개·반경 900 안 상대 투명 와드를 드러내고 무력화,
// 기본 공격 1회 = 체력 1, 스킬 피해 없음, 사거리 밖이면 걸어가서 놓기, 기절 중 설치 불가.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failed = 0, passed = 0;
function assert(cond, msg) { if (!cond) { failed++; console.error('FAIL:', msg); process.exitCode = 1; } else { passed++; console.log('ok:', msg); } }

let now = 1000;
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
}
// 어떤 THREE 클래스든 받는 가짜 객체(위치·회전·크기·자식·재질).
class FakeObj {
  constructor(geo, mat) { this.position = new Vec3(); this.rotation = new Vec3(); this.scale = new Vec3(1, 1, 1); this.children = []; this.visible = true; this.material = mat || { opacity: 1, color: { setHex() {} } }; }
  add(...o) { this.children.push(...o); }
}
class FakeMat { constructor(o = {}) { Object.assign(this, o); this.opacity = o.opacity ?? 1; this.color = { setHex() {} }; } }
const THREE = new Proxy({ Vector3: Vec3, AdditiveBlending: 2, DoubleSide: 2 }, {
  get(t, k) { if (k in t) return t[k]; if (/Material$/.test(k)) return FakeMat; return FakeObj; },
});
const removed = [];
const sandbox = {
  console, THREE, performance: { now: () => now },
  document: { createElement: () => ({ style: {}, appendChild() {}, parentNode: null }) },
  BASE_UNIT: 1, PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  STATE: { DEAD: 'DEAD', RESPAWN: 'RESPAWN', MOVE: 'MOVE', IDLE: 'IDLE' },
  lolRangeToWorld: (v) => (v || 0) * 0.01,
  getHorizontalDistance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
  isCrowdControlled: (c) => !!c.stunned,
  scene: { add() {}, remove(o) { removed.push(o); } },
  visionSystem: { enabled: true, viewTeam: 'BLUE', reveals: [], visibleTeams: { BLUE: true, RED: true }, isPointVisibleTo(team) { return this.visibleTeams[team]; } },
  controller: null, vfx: null,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/world/ward_system.js'), 'utf8') + '\nthis.WardSystem = WardSystem; this.WARD_TYPES = WARD_TYPES;', sandbox);
const { WardSystem } = sandbox;

const blue = { team: 'BLUE', hp: 100, state: 'IDLE', root: { position: new Vec3() } };
const ws = new WardSystem(sandbox.scene);

// 1) 투명 와드: 체력 3, 1인 3개 - 4번째는 가장 오래된 것을 지운다.
const s1 = ws.place(blue, 'stealth', new Vec3(1, 0, 0), { durationSec: 90 });
assert(s1.hp === 3 && s1.maxHp === 3 && s1.team === 'BLUE', '투명 와드는 체력 3, 설치자 팀');
now += 10; const s2 = ws.place(blue, 'stealth', new Vec3(2, 0, 0), { durationSec: 90 });
now += 10; const s3 = ws.place(blue, 'stealth', new Vec3(3, 0, 0), { durationSec: 90 });
now += 10; const s4 = ws.place(blue, 'stealth', new Vec3(4, 0, 0), { durationSec: 90 });
assert(s1.destroyed && !s2.destroyed && !s4.destroyed, '투명 와드 4번째를 놓으면 가장 오래된 것이 사라진다(1인 3개)');
assert(blue._placedWards.length === 3 && !blue._placedWards.includes(s1), '설치자의 _placedWards(리 신 W가 읽는 목록)가 살아 있는 자기 와드 3개로 맞춰진다');
void s3;

// 2) 제어 와드: 체력 4, 1인 1개.
const c1 = ws.place(blue, 'control', new Vec3(10, 0, 0));
assert(c1.hp === 4 && c1.expiresAt === Infinity, '제어 와드는 체력 4, 파괴될 때까지 유지');
now += 10; const c2 = ws.place(blue, 'control', new Vec3(11, 0, 0));
assert(c1.destroyed && !c2.destroyed, '제어 와드 2번째를 놓으면 먼저 놓은 것이 사라진다(1인 1개)');

// 3) 기본 공격 1회 = 체력 1, 같은 팀은 못 친다.
const red = { team: 'RED' };
const target = ws.place(null, 'stealth', new Vec3(-5, 0, 0), { team: 'RED', durationSec: 90 });
assert(!ws.hitWard(target, { team: 'RED' }) && target.hp === 3, '같은 팀 공격은 와드에 피해를 주지 않는다');
ws.hitWard(target, blue); ws.hitWard(target, blue);
assert(target.hp === 1 && !target.destroyed, '평타 2번 = 체력 2 감소(공격력과 무관)');
ws.hitWard(target, blue);
assert(target.destroyed && target.hp === 0, '평타 3번이면 투명 와드가 파괴된다');
void red;

// 4) 은신: 상대 투명 와드는 시야 안이어도 보이지 않고, 아군 제어 와드 반경 900 안이면 드러나고 무력화된다.
ws.clear();
const enemyStealth = ws.place(null, 'stealth', new Vec3(0, 0, 0), { team: 'RED', durationSec: 90 });
assert(!ws.isVisibleTo('BLUE', enemyStealth), '상대 투명 와드는 시야 안이어도 드러내기 없이는 보이지 않는다');
assert(ws.targetableFor('BLUE').length === 0, '보이지 않는 와드는 공격 대상 후보가 아니다');
assert(ws.visionSources('RED').length === 1, '무력화되지 않은 투명 와드는 자기 팀에 시야를 준다');
const ctrlWard = ws.place(blue, 'control', new Vec3(8, 0, 0)); // 0.01 배율: 900 = 9 월드
assert(ws.isVisibleTo('BLUE', enemyStealth) && ws.targetableFor('BLUE').includes(enemyStealth), '반경 900 안의 아군 제어 와드가 상대 투명 와드를 드러낸다');
assert(ws.isDisabled(enemyStealth) && ws.visionSources('RED').length === 0, '드러난 투명 와드는 무력화돼 시야를 주지 못한다');
ws.hitWard(ctrlWard, { team: 'RED' }); ws.hitWard(ctrlWard, { team: 'RED' }); ws.hitWard(ctrlWard, { team: 'RED' }); ws.hitWard(ctrlWard, { team: 'RED' });
assert(ctrlWard.destroyed && !ws.isDisabled(enemyStealth) && !ws.isVisibleTo('BLUE', enemyStealth), '제어 와드를 평타 4번으로 부수면 투명 와드가 다시 숨고 시야를 되찾는다');
const farCtrl = ws.place(blue, 'control', new Vec3(9.5, 0, 0));
assert(!ws.isVisibleTo('BLUE', enemyStealth), '반경 900 밖의 제어 와드는 드러내지 못한다');
void farCtrl;
// 제어 와드는 은신하지 않는다 - 상대 시야 안이면 보이고, 밖이면 안 보인다.
const enemyControl = ws.place(null, 'control', new Vec3(-20, 0, 0), { team: 'RED' });
assert(ws.isVisibleTo('BLUE', enemyControl), '상대 제어 와드는 시야 안이면 보인다(은신 아님)');
sandbox.visionSystem.visibleTeams.BLUE = false;
assert(!ws.isVisibleTo('BLUE', enemyControl), '상대 제어 와드도 시야 밖이면 안 보인다');
sandbox.visionSystem.visibleTeams.BLUE = true;
assert(ws.isVisibleTo('RED', enemyStealth), '자기 팀 와드는 항상 보인다');

// 5) 만료.
ws.clear();
const timed = ws.place(blue, 'stealth', new Vec3(0, 0, 0), { durationSec: 90 });
now += 89000; ws.update(0.016);
assert(!timed.destroyed, '지속시간 전에는 남아 있다');
now += 2000; ws.update(0.016);
assert(timed.destroyed && removed.includes(timed.mesh) && blue._placedWards.length === 0, '지속시간이 지나면 사라지고 모델과 목록에서도 빠진다');

// 6) 설치 명령: 사거리 안이면 즉시, 밖이면 걸어가서 도착하면 놓고 멈춘다. 이동 명령은 취소. 기절 중 불가.
const placedAt = [];
const walker = {
  team: 'BLUE', hp: 100, state: 'IDLE', root: { position: new Vec3(0, 0, 0) }, moves: [],
  moveTo(p) { this._wardOrder = null; this.moves.push(p); this.state = 'MOVE'; },
};
const fn = (pos) => { placedAt.push(pos); return true; };
assert(ws.order(walker, new Vec3(3, 0, 0), 600, fn) === true && placedAt.length === 1 && walker.moves.length === 0, '사거리(600) 안이면 걷지 않고 바로 놓는다');
assert(ws.order(walker, new Vec3(20, 0, 0), 600, fn) === true && placedAt.length === 1 && walker._wardOrder, '사거리 밖이면 걸어가기 시작하고 아직 놓지 않는다');
walker.root.position.set(13, 0, 0); ws.updateOrder(walker);
assert(placedAt.length === 1, '아직 사거리 밖이면 계속 걷는다');
walker.root.position.set(14.5, 0, 0); ws.updateOrder(walker);
assert(placedAt.length === 2 && placedAt[1].x === 20 && !walker._wardOrder, '사거리에 들어오면 찍은 자리에 놓는다');
assert(walker.moves[walker.moves.length - 1].x === 14.5, '놓은 뒤에는 그 자리에 멈춘다');
ws.order(walker, new Vec3(40, 0, 0), 600, fn); walker.moveTo(new Vec3(-5, 0, 0)); ws.updateOrder(walker);
assert(!walker._wardOrder && placedAt.length === 2, '걸어가는 중 다른 이동 명령을 내리면 설치가 취소된다');
walker.stunned = true;
assert(ws.order(walker, new Vec3(1, 0, 0), 600, fn) === false && placedAt.length === 2, '기절 중에는 와드를 놓을 수 없다');

console.log(`\n${passed} passed, ${failed} failed`);
console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
