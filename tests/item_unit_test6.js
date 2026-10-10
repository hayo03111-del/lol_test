// Node vm harness: calculateDamage() armor-pen-multiplier integration
// (Last Whisper) + applyDamageToMinion() physical-vamp wiring (Vampiric Scepter).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

// --- Part A: calculateDamage() armor pen multiplier ---
{
  const stubs = {
    console,
    controller: null,
    getArmorShredPercent: () => 0,
    getMagicDamageReductionPercent: () => 0,
  };
  const context = vm.createContext(stubs);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
  vm.runInContext(src + '\nthis.calculateDamage = calculateDamage; this.DAMAGE_TYPE = DAMAGE_TYPE;', context);
  const { calculateDamage, DAMAGE_TYPE } = context;

  const target = { armor: 100 };
  const noPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.PHYSICAL, target });
  assert(Math.abs(noPen - 200 * 100 / 200) < 1e-6, 'baseline physical damage formula unaffected when no item armor pen present');

  const attacker = { championId: 'ashe', itemBonusArmorPenMultiplier: 1 - 0.18 };
  const withPen = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.PHYSICAL, target, source: attacker });
  const expectedArmor = 100 * (1 - 0.18);
  assert(Math.abs(withPen - 200 * 100 / (100 + expectedArmor)) < 1e-6, 'itemBonusArmorPenMultiplier reduces armor before the final formula');

  context.controller = { championId: 'ashe', itemBonusArmorPenMultiplier: 1 - 0.18 };
  const withControllerFallback = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.PHYSICAL, target });
  assert(Math.abs(withControllerFallback - 200 * 100 / (100 + expectedArmor)) < 1e-6, 'falls back to global controller for armor pen multiplier when source is omitted');

  // Stacks multiplicatively with an existing armorPenPercent param (e.g. Darius E passive).
  const withBoth = calculateDamage({ rawDamage: 200, damageType: DAMAGE_TYPE.PHYSICAL, target, source: attacker, armorPenPercent: 0.3 });
  const armorAfterBoth = 100 * (1 - 0.3) * (1 - 0.18);
  assert(Math.abs(withBoth - 200 * 100 / (100 + armorAfterBoth)) < 1e-6, 'item armor pen stacks multiplicatively with an existing armorPenPercent param');
}

// --- Part B: applyDamageToMinion() wires up applyItemPhysicalVamp ---
{
  let physicalVampCalls = [];
  const stubs = {
    performance: { now: () => 100000 },
    console,
    controller: { gold: 0 },
    calculateDamage: ({ rawDamage }) => rawDamage, // identity for this test
    updateMinionVisual: () => {},
    drawMinionHealthBar: () => {},
    killMinion: () => {},
    applyItemVamp: () => {},
    applyItemPhysicalVamp: (source, finalDmg, damageType) => { physicalVampCalls.push({ source, finalDmg, damageType }); },
    DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  };
  const context = vm.createContext(stubs);
  const src = fs.readFileSync(path.join(ROOT, 'src/core/exp_level_system.js'), 'utf8');
  vm.runInContext(src + '\nthis.applyDamageToMinion = applyDamageToMinion;', context);
  const { applyDamageToMinion } = context;

  const minion = { hp: 100, isDead: false };
  applyDamageToMinion(minion, { rawDamage: 40, damageType: 'PHYSICAL' }, true);
  assert(physicalVampCalls.length === 1, 'applyDamageToMinion calls applyItemPhysicalVamp when fromPlayer=true');
  assert(physicalVampCalls[0].source === stubs.controller, 'physical vamp call uses the global controller as source');
  assert(physicalVampCalls[0].finalDmg === 40, 'physical vamp call receives the final (post-mitigation) damage');
  assert(physicalVampCalls[0].damageType === 'PHYSICAL', 'physical vamp call receives the correct damage type');

  physicalVampCalls = [];
  const minion2 = { hp: 100, isDead: false };
  applyDamageToMinion(minion2, { rawDamage: 40, damageType: 'PHYSICAL' }, false); // not from player
  assert(physicalVampCalls.length === 0, 'physical vamp is NOT triggered for non-player minion damage (minion-vs-minion combat)');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
