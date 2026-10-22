// 94차 감사(docs/COMBAT_AUDIT.md) "수정 완료, 검증 미완료" 항목 검증 - 상태 효과·구조물·게임 종료.
// S2(구조물 상태 효과 진행 - updateTurrets), S6(clearUnitCombatState / clearStatusesFromSource),
// T3(게임 종료 뒤 포탑·우물 공격 중지, 미니언 골드·경험치 없음).
// 실제 src(00_global_constants, 01_status_effect_system, shield_system, 01_hit_detection, turret_system, reward_system,
// exp_level_system의 awardMinionExperience)를 vm으로 불러온다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
let now = 2e6;
const ctx = {
  console: { log() {}, warn() {}, error: console.error }, Math, performance: { now: () => now },
  THREE: { Vector3, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
  document: { getElementById: () => null, querySelectorAll: () => [] }, window: {},
  controller: null, dummy: null, placedDummies: [], minions: [], inhibitorBuildings: [], nexusBuildings: [], BASE_UNIT: 1,
  gameEnded: false, PLAYER_TEAM: 'BLUE', ENEMY_TEAM: 'RED',
  updateBars() {}, updateGoldDisplay() {}, showSkillToast() {}, isPositionInBaseZone: () => false,
};
vm.createContext(ctx);
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const realm = rd('src/world/mordekaiser_death_realm.js').match(/function canRealmInteract[\s\S]*?\n}\n/)[0];
const awardExp = rd('src/core/exp_level_system.js').match(/function awardMinionExperience[\s\S]*?\n}\n/)[0];
vm.runInContext([
  rd('src/core/00_global_constants.js'), rd('src/core/01_status_effect_system.js'), rd('src/core/shield_system.js'), rd('src/core/01_hit_detection.js'),
  realm, rd('src/world/turret_system.js'), rd('src/core/reward_system.js'),
  'const EXP_RANGE_LOL = 1400;', awardExp,
  'var MINION_TYPE = { SUPER: "super", SIEGE: "siege" }; function findMinionsOfTypesNear() { return []; }',
  `this.api = { updateTurrets, updateTurretCombat, rewardMinionDeath, awardMinionExperience, applyStatus, addShield, clearUnitCombatState, clearStatusesFromSource,
    tickStatusEffects, TURRET_TYPE, STATE, lolRangeToWorld,
    set: (k, v) => { if (k === 'turrets') turrets = v; else if (k === 'inhibitorBuildings') inhibitorBuildings = v; else if (k === 'nexusBuildings') nexusBuildings = v;
      else if (k === 'controller') controller = v; else if (k === 'gameEnded') gameEnded = v; else if (k === 'minions') minions = v; } };`,
].join('\n'), ctx);
const A = ctx.api;

// ===== S2: 구조물에 걸린 지속 피해(공성 파괴자 "파괴 공작" 등)가 updateTurrets에서 진행된다 =====
{
  const dealt = [];
  const origApply = ctx.applyDamage, origCombat = ctx.updateTurretCombat;
  ctx.applyDamage = (t, r) => { dealt.push({ t, r }); t.hp -= r.rawDamage; return r.rawDamage; }; // 구조물 피해 경로 대신 기록
  ctx.updateTurretCombat = () => {}; // 포탑 사격·연출은 이 검사와 무관
  const mk = (extra) => Object.assign({ team: 'RED', hp: 3000, maxHp: 3000, isStructure: true, statusEffects: [], mesh: { position: new Vector3(0, 0, 0) } }, extra);
  const turret = mk({ isTurret: true, type: A.TURRET_TYPE.OUTER1 });
  const inhib = mk({ isInhibitor: true });
  const nexus = mk({ isNexus: true });
  const dead = mk({ isTurret: true, destroyed: true });
  for (const s of [turret, inhib, nexus, dead]) A.applyStatus(s, { id: 'itemFortressBreakerSabotage', type: 'DOT', duration: 3, totalDamage: 300, damageType: 'TRUE', tickInterval: 1.0 });
  A.set('turrets', [turret, dead]); A.set('inhibitorBuildings', [inhib]); A.set('nexusBuildings', [nexus]);
  for (let i = 0; i < 60; i++) { now += 50; A.updateTurrets(0.05); }
  assert(turret.hp === 2700 && inhib.hp === 2700 && nexus.hp === 2700, 'S2: 포탑·억제기·넥서스에 걸린 지속 피해가 매 프레임 진행된다(3초 300 = 틱 3번)');
  assert(dead.hp === 3000, 'S2: 파괴된 구조물은 진행하지 않는다');
  assert(dealt.every((d) => d.r.isStatusTick), 'S2: 지속 피해 틱으로 들어간다(isStatusTick)');
  A.set('turrets', []); A.set('inhibitorBuildings', []); A.set('nexusBuildings', []);
  ctx.applyDamage = origApply; ctx.updateTurretCombat = origCombat; // 원래 구현으로 되돌린다
}

// ===== S6: 초기화·챔피언 교체 정리 함수 =====
{
  const u = { team: 'RED', hp: 500, maxHp: 500, statusEffects: [], mesh: { position: new Vector3(0, 2.5, 0) } };
  A.applyStatus(u, { id: 'bleed', type: 'DOT', duration: 5, totalDamage: 100, tickInterval: 1 });
  A.applyStatus(u, { id: 'slow', type: 'SLOW', duration: 5, value: 0.3 });
  A.addShield(u, 'test', 200, 5);
  u._yasuoAirborne = { baseY: 0 }; u._pullState = { from: new Vector3(), to: new Vector3(1, 0, 0), duration: 1, elapsed: 0 };
  A.clearUnitCombatState(u);
  assert(u.statusEffects.length === 0 && !(u.shield > 0) && u._yasuoAirborne == null && u._pullState == null && u.mesh.position.y === 0,
    'S6: clearUnitCombatState - 상태 효과·보호막·공중에 뜸(높이 복구)·끌려가기를 모두 지운다');
  const src = { team: 'BLUE', championId: 'rammus', hp: 500 };
  const other = { team: 'BLUE', championId: 'ahri', hp: 500 };
  const d1 = { team: 'RED', hp: 500, statusEffects: [] }, d2 = { team: 'RED', hp: 500, statusEffects: [] };
  A.applyStatus(d1, { id: 'taunt', type: 'TAUNT', duration: 2, value: 1, source: src });
  A.applyStatus(d1, { id: 'charm', type: 'CHARM', duration: 2, value: 1, source: other });
  A.applyStatus(d2, { id: 'slow', type: 'SLOW', duration: 2, value: 0.2, source: src });
  const self = { team: 'BLUE', hp: 500, statusEffects: [] };
  A.applyStatus(self, { id: 'selfBuff', type: 'MS_BUFF', duration: 2, value: 0.2, source: self });
  A.clearStatusesFromSource(src, [d1, d2, src, self]);
  assert(d1.statusEffects.length === 1 && d1.statusEffects[0].id === 'charm' && d2.statusEffects.length === 0,
    'S6: clearStatusesFromSource - 교체되는 챔피언이 건 효과(도발·둔화)만 지우고 다른 출처 효과는 남긴다');
}

// ===== T3: 게임 종료 뒤 포탑·우물은 공격하지 않는다 =====
const spawns = [];
ctx.projectiles = { spawn: (o) => spawns.push(o) };
ctx.vfx = { spawn() {} };
for (const k of ['updateTurretBastion', 'updateTurretShieldStageVisual', 'updateTurretAggroBeam', 'updateTurretTraitBadges', 'updateTurretRegeneration', 'placeStructLabel']) ctx[k] = () => {}; // 연출
{
  const L = A.lolRangeToWorld;
  const player = { championId: 'garen', isChampion: true, team: 'BLUE', hp: 1000, maxHp: 1000, state: 'IDLE', statusEffects: [], collisionRadius: L(65), realmId: 'main', root: { position: new Vector3(L(400), 0, 0) } };
  A.set('controller', player);
  const turret = { isTurret: true, isStructure: true, team: 'RED', type: A.TURRET_TYPE.OUTER1, hp: 5000, maxHp: 5000, attackCooldown: 0, statusEffects: [], realmId: 'main', mesh: { position: new Vector3(0, 0, 0) } };
  A.set('turrets', [turret]);
  A.set('gameEnded', true);
  A.updateTurretCombat(turret, 0.05);
  assert(turret.attackTarget == null && spawns.length === 0, 'T3: 게임이 끝나면 사거리 안의 플레이어가 있어도 포탑은 대상을 잡지 않고 쏘지 않는다');
  A.set('gameEnded', false);
  A.updateTurretCombat(turret, 0.05);
  assert(turret.attackTarget === player && spawns.length === 1, 'T3 대조: 게임 중에는 같은 상황에서 포탑이 플레이어를 쏜다');
  // 우물
  const hits = [];
  ctx.applyDamage = (t, r) => { hits.push(r); return r.rawDamage; };
  const well = { type: A.TURRET_TYPE.NEXUS_WELL, team: 'RED', radius: 10, hp: Infinity, statusEffects: [], realmId: 'main', mesh: { position: new Vector3(L(400), 0, 0) } };
  A.set('gameEnded', true);
  A.updateTurretCombat(well, 0.1);
  assert(hits.length === 0, 'T3: 게임이 끝나면 적 우물도 플레이어를 공격하지 않는다');
  A.set('gameEnded', false);
  A.updateTurretCombat(well, 0.1);
  assert(hits.length === 1, 'T3 대조: 게임 중에는 적 우물 안의 플레이어가 피해를 받는다');
  A.set('turrets', []); A.set('controller', null);
}
// ===== T3: 게임 종료 뒤 멈춘 미니언을 잡아도 골드·경험치가 없다 =====
{
  const golds = [], exps = [];
  ctx.grantGold = (c, amt) => golds.push(amt);
  ctx.getMinionGoldValue = () => 21;
  ctx.gainExperience = (c, x) => exps.push(x);
  ctx.applyExperienceModifiers = (x) => x; ctx.shareExperience = (x, ps) => x / ps.length; ctx.getMinionExpValue = () => 60;
  const player = { championId: 'garen', team: 'BLUE', hp: 1000, maxHp: 1000, state: 'IDLE', root: { position: new Vector3(0, 0, 0) } };
  A.set('controller', player);
  const minion = { team: 'RED', type: 'melee', isMinion: true, hp: 0, mesh: { position: new Vector3(1, 0, 0) }, _lastHitBy: player };
  A.set('gameEnded', true);
  A.rewardMinionDeath(minion); A.awardMinionExperience(minion);
  assert(golds.length === 0 && exps.length === 0, 'T3: 게임 종료 뒤에는 미니언 막타 골드·경험치를 주지 않는다');
  A.set('gameEnded', false);
  A.rewardMinionDeath(minion); A.awardMinionExperience(minion);
  assert(golds.length === 1 && golds[0] === 21 && exps.length === 1 && exps[0] === 60, 'T3 대조: 게임 중에는 막타 골드와 경험치를 준다');
  A.set('controller', null);
}
