// Node vm harness for the "아군,적군,플레이어 시스템" request: generic team
// (PLAYER_TEAM/ENEMY_TEAM) tagging + isAllyUnit()/isEnemyUnit() helpers
// (00_global_constants.js), and getAllEnemyUnits() (01_hit_detection.js)
// now reading controller.team generically instead of hardcoding 'RED'.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const stubs = {
  console,
  THREE: { Vector3: class { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} } },
};
const context = vm.createContext(stubs);
const constantsSrc = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
const hitSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_hit_detection.js'), 'utf8');
vm.runInContext(constantsSrc + '\n' + hitSrc + `
this.PLAYER_TEAM = PLAYER_TEAM;
this.ENEMY_TEAM = ENEMY_TEAM;
this.isAllyUnit = isAllyUnit;
this.isEnemyUnit = isEnemyUnit;
this.getAllEnemyUnits = getAllEnemyUnits;
`, context);
const { PLAYER_TEAM, ENEMY_TEAM, isAllyUnit, isEnemyUnit, getAllEnemyUnits } = context;

// --- Basic constants ---
assert(PLAYER_TEAM === 'BLUE', 'PLAYER_TEAM is BLUE');
assert(ENEMY_TEAM === 'RED', 'ENEMY_TEAM is RED');
assert(PLAYER_TEAM !== ENEMY_TEAM, 'player and enemy teams are distinct');

// --- isAllyUnit / isEnemyUnit: generic team comparison ---
const blueA = { team: 'BLUE' }, blueB = { team: 'BLUE' }, red = { team: 'RED' };
assert(isAllyUnit(blueA, blueB) === true, 'two units with the same team are allies');
assert(isEnemyUnit(blueA, blueB) === false, 'allies are not enemies');
assert(isAllyUnit(blueA, red) === false, 'units with different teams are not allies');
assert(isEnemyUnit(blueA, red) === true, 'units with different teams are enemies');
assert(isAllyUnit(blueA, null) === false, 'isAllyUnit is safe against a null second argument');
assert(isEnemyUnit(null, red) === false, 'isEnemyUnit is safe against a null first argument');
const noTeam = {};
assert(isAllyUnit(blueA, noTeam) === false, 'a unit with no team field is never an ally (unknown != same)');
assert(isEnemyUnit(blueA, noTeam) === false, 'a unit with no team field is never flagged as an enemy either (unknown != assumed hostile)');

// --- getAllEnemyUnits(): generic team filtering (player is BLUE by default) ---
context.turrets = [
  { team: 'RED', destroyed: false, isUntargetable: false, id: 'enemyTurret' },
  { team: 'BLUE', destroyed: false, isUntargetable: false, id: 'allyTurret' },
  { team: 'RED', destroyed: true, isUntargetable: false, id: 'destroyedEnemyTurret' },
];
context.inhibitorBuildings = [{ team: 'RED', destroyed: false, id: 'enemyInhib' }, { team: 'BLUE', destroyed: false, id: 'allyInhib' }];
context.nexusBuildings = [{ team: 'RED', destroyed: false, id: 'enemyNexus' }];
context.minions = [
  { team: 'RED', isDead: false, id: 'enemyMinion' },
  { team: 'BLUE', isDead: false, id: 'allyMinion' },
  { team: 'RED', isDead: true, id: 'deadEnemyMinion' },
];
context.dummy = undefined;
context.placedDummies = undefined;
context.controller = { team: 'BLUE' };

let result = getAllEnemyUnits();
let ids = result.map((u) => u.id);
assert(ids.includes('enemyTurret') && ids.includes('enemyInhib') && ids.includes('enemyNexus') && ids.includes('enemyMinion'), 'BLUE player sees all RED structures/minions as enemies');
assert(!ids.includes('allyTurret') && !ids.includes('allyInhib') && !ids.includes('allyMinion'), 'BLUE player does NOT see same-team (BLUE) structures/minions as enemies');
assert(!ids.includes('destroyedEnemyTurret') && !ids.includes('deadEnemyMinion'), 'destroyed/dead units are still excluded regardless of team');

// Flip the player's own team (previously impossible since the player had no .team field at all,
// and getAllEnemyUnits() hardcoded the 'RED' literal directly) - the ally/enemy sets should mirror.
context.controller = { team: 'RED' };
result = getAllEnemyUnits();
ids = result.map((u) => u.id);
assert(ids.includes('allyTurret') && ids.includes('allyInhib') && ids.includes('allyMinion'), 'a RED-team player now correctly sees BLUE structures/minions as enemies (team-generic, not hardcoded to RED)');
assert(!ids.includes('enemyTurret') && !ids.includes('enemyInhib') && !ids.includes('enemyNexus') && !ids.includes('enemyMinion'), 'a RED-team player does NOT see RED (now same-team) units as enemies');

// Without any controller at all (e.g. before a champion loads), falls back to PLAYER_TEAM (BLUE) - unchanged legacy behavior.
context.controller = undefined;
result = getAllEnemyUnits();
ids = result.map((u) => u.id);
assert(ids.includes('enemyTurret') && !ids.includes('allyTurret'), 'with no controller loaded yet, falls back to PLAYER_TEAM (BLUE) exactly like the old hardcoded behavior');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
