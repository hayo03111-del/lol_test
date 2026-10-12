// Node vm harness verifying the "생략한것도 다 만들어" round's prerequisite bug
// fix: minions previously never had tickStatusEffects() called on them at all
// (only the player and dummy enemies did), so a DOT applied to a minion would
// deal its first tick and then sit inert forever, never ticking again and
// never expiring. exp_level_system.js's updateMinionCombat() now calls
// tickStatusEffects(minion, dt) (see the comment there). This test exercises
// the real tickStatusEffects()/applyStatus() implementation directly against
// a minion-shaped object to confirm the DOT actually ticks to completion.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

let now = 100000;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const dealt = [];
const stubs = {
  performance: { now: () => now },
  console,
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  applyDamage: (target, result) => { dealt.push({ target, result }); target.hp = Math.max(0, target.hp - result.rawDamage); return result.rawDamage; },
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} addScaledVector(){return this;} length(){return Math.hypot(this.x,this.y,this.z);} } },
  getWorldPosition: () => null,
  getCollisionRadius: () => 1,
  MOVE_SPEED: 5,
};

const context = vm.createContext(stubs);
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8');
const hitSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_hit_detection.js'), 'utf8');
vm.runInContext(statusSrc + '\n' + hitSrc + `
this.applyStatus = applyStatus;
this.clearStatus = clearStatus;
this.hasStatus = hasStatus;
this.tickStatusEffects = tickStatusEffects;
`, context);
const { applyStatus, hasStatus, tickStatusEffects } = context;

// A minion-shaped unit (no mesh needed for a non-CHARM DOT test).
const minion = { isMinion: true, hp: 100, statusEffects: [] };
applyStatus(minion, { id: 'darius_bleed', type: 'DOT', duration: 5, totalDamage: 50, damageType: 'PHYSICAL', tickInterval: 1.0, source: null });

// Tick 1 full second at a time, exactly like updateMinionCombat(minion, dt) would each frame.
for (let i = 0; i < 5; i++) {
  tickStatusEffects(minion, 1.0);
}
assert(dealt.length === 5, 'a 5s/5-tick DOT on a minion fires exactly 5 applyDamage calls when ticked once per second');
assert(Math.abs(minion.hp - 50) < 1e-6, 'all 50 total DOT damage (10/tick * 5) actually lands on the minion, not just the first tick');
assert(Math.abs(dealt[0].result.rawDamage - 10) < 1e-9, 'each tick deals totalDamage/totalTicks (50/5 = 10)');

// Ticking further after all ticks have fired must not deal any more damage (no overflow/duplicate ticks).
dealt.length = 0;
tickStatusEffects(minion, 1.0);
assert(dealt.length === 0, 'no further damage is dealt once all scheduled ticks have fired, even if tickStatusEffects keeps being called');

// Re-applying the same DOT id mid-flight refreshes (upserts) rather than stacking a second instance.
const minion2 = { isMinion: true, hp: 100, statusEffects: [] };
applyStatus(minion2, { id: 'embersOfFateBurn', type: 'DOT', duration: 3, totalDamage: 45, damageType: 'MAGICAL', tickInterval: 1.0, source: null });
tickStatusEffects(minion2, 1.0);
applyStatus(minion2, { id: 'embersOfFateBurn', type: 'DOT', duration: 3, totalDamage: 45, damageType: 'MAGICAL', tickInterval: 1.0, source: null }); // refresh
assert(minion2.statusEffects.length === 1, 'reapplying the same DOT id upserts (refreshes) instead of stacking a second instance');
dealt.length = 0;
for (let i = 0; i < 3; i++) tickStatusEffects(minion2, 1.0);
assert(dealt.length === 3, 'after a refresh, the DOT runs its full 3 ticks again from the refreshed start');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
