// Minimal Node harness to exercise VisionSystem's pure logic (distance math,
// cache transitions, grantVision expiry) without needing a browser/GLB.
// Stubs just enough of the engine API that vision_system.js calls, all
// living inside one vm context so the class's lexical bindings can see them.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 0;

class FakeVec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new FakeVec3(this.x, this.y, this.z); }
}

const dummy = { id: 'dummy', hp: 300, mesh: { visible: true }, labelDiv: { style: {} }, position: new FakeVec3(0, 0, 0) };
const farMinion = { id: 'farMinion', hp: 100, mesh: { visible: true }, labelDiv: { style: {} }, position: new FakeVec3(500, 0, 0) };
let enemyUnits = [dummy, farMinion];

const stubs = {
  performance: { now: () => now },
  THREE: {
    Vector3: FakeVec3,
    CanvasTexture: class { constructor() { this.needsUpdate = false; } },
    PlaneGeometry: class { rotateX() { return this; } },
    MeshBasicMaterial: class {},
    Mesh: class { constructor() { this.position = new FakeVec3(); } },
  },
  document: {
    createElement: (tag) => ({
      width: 0, height: 0,
      getContext: () => ({
        fillRect() {}, beginPath() {}, arc() {}, fill() {}, clearRect() {},
        createRadialGradient: () => ({ addColorStop() {} }),
      }),
    }),
  },
  groundSize: 280,
  lolRangeToWorld: (r) => (r || 0) * 0.008643, // matches (ATTACK_RANGE/175)*0.25*1.10 with ATTACK_RANGE=5.5
  STATE: { DEAD: 'DEAD' },
  getAllEnemyUnits: () => enemyUnits,
  isInCircle: (unit, center, radiusWorld) => {
    const dx = unit.position.x - center.x, dz = unit.position.z - center.z;
    return Math.hypot(dx, dz) <= radiusWorld;
  },
  console,
};

const context = vm.createContext(stubs);
const src = fs.readFileSync(path.join(ROOT, 'src/core/vision_system.js'), 'utf8');
vm.runInContext(src + '\nthis.VisionSystem = VisionSystem;', context);
const VisionSystem = context.VisionSystem;

const scene = { add() {} };
const vision = new VisionSystem(scene);

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

// 1) No controller -> reveal all.
vision.update(null, 0.016);
assert(vision.isVisible(dummy) === true, 'no controller: dummy visible (reveal-all fallback)');
assert(vision.isVisible(farMinion) === true, 'no controller: farMinion visible (reveal-all fallback)');

// 2) Controller near dummy (world pos ~0,0). championSightRange=1200 lol units
// -> worldRange ~10.37 world units. farMinion at world x=500 should be far outside.
const controller = { root: { position: new FakeVec3(1, 0, 0) }, hp: 100, state: 'ALIVE', championId: 'ashe' };
vision.update(controller, 0.016);
assert(vision.isVisible(dummy) === true, 'controller near dummy: dummy visible');
assert(vision.isVisible(farMinion) === false, 'controller near dummy: farMinion hidden (fog)');
assert(dummy.mesh.visible === true, 'dummy mesh.visible toggled true');
assert(farMinion.mesh.visible === false, 'farMinion mesh.visible toggled false');
assert(farMinion.labelDiv.style.display === 'none', 'farMinion label hidden');

// 3) Move controller near farMinion -> it becomes visible, dummy goes dark.
controller.root.position = new FakeVec3(500, 0, 0);
vision.update(controller, 0.016);
assert(vision.isVisible(farMinion) === true, 'controller moved near farMinion: now visible');
assert(vision.isVisible(dummy) === false, 'controller moved away: dummy now hidden');

// 4) grantVision temporary source reveals dummy again until it expires.
now = 1000;
vision.grantVision(new FakeVec3(0, 0, 0), 900, 2.0);
vision.update(controller, 0.016);
assert(vision.isVisible(dummy) === true, 'grantVision: dummy revealed by temporary source');
now = 1000 + 2500;
vision.update(controller, 0.016);
assert(vision.isVisible(dummy) === false, 'grantVision expired: dummy hidden again');

// 5) setEnabled(false) reveals everything.
vision.setEnabled(false);
assert(vision.isVisible(dummy) === true, 'disabled: isVisible always true (dummy)');
assert(vision.isVisible(farMinion) === true, 'disabled: isVisible always true (farMinion)');
assert(dummy.mesh.visible === true && farMinion.mesh.visible === true, 'disabled: all mesh.visible restored true');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
