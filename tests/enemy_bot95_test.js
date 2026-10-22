// 95차 적 챔피언 봇 기반 회귀 테스트 - 게임 시계(일시정지 중 시간·타이머 정지), 전투 행위자 문맥(타이머가 예약한 쪽을 기억),
// 입장별 적·아군 목록, 피해·상태 효과 출처 기본값, 봇 스킬 판단(botPlanSkill), 챔피언 처치·어시스트 보상(골드·현상금·경험치).
// 실제 src 파일(00_game_clock, 00_global_constants, 01_status_effect_system, shield_system, 01_hit_detection, ally_system,
// reward_system, bot_brain)을 vm으로 불러온다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

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
  setY(y) { this.y = y; return this; }
  setLength(l) { const c = this.length() || 1; return this.multiplyScalar(l / c); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyQuaternion() { return this; }
}
// 가짜 실제 시계 + 가짜 타이머(실제 시간 기준) - 게임 시계 파일이 이 위에 일시정지를 얹는다.
let realNow = 1e6, timers = [], seq = 0;
const ctx = {
  console: { log() {}, warn() {}, error: console.error }, Math, Map, Set, JSON,
  performance: { now: () => realNow },
  setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, fn, at: realNow + Math.max(0, ms || 0) }); return id; },
  clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
  setInterval: () => 0, clearInterval: () => {},
  THREE: { Vector3, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
  controller: null, dummy: null, placedDummies: [], minions: [], turrets: [], inhibitorBuildings: [], nexusBuildings: [], BASE_UNIT: 1, gameEnded: false,
  document: { getElementById: () => null },
};
const advance = (ms) => {
  const end = realNow + ms;
  for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); realNow = Math.max(realNow, t.at); t.fn(); }
  realNow = end;
};
vm.createContext(ctx);
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const realm = rd('src/world/mordekaiser_death_realm.js').match(/function canRealmInteract[\s\S]*?\n}\n/)[0];
vm.runInContext([rd('src/core/00_game_clock.js'), rd('src/core/00_global_constants.js'), rd('src/core/01_status_effect_system.js'), rd('src/core/shield_system.js'), realm,
  rd('src/core/01_hit_detection.js'), rd('src/core/ally_system.js'), rd('src/core/reward_system.js'), rd('src/core/bot_brain.js'),
  `showRewardBanner = function () {}; var gained = []; function shareExperience(a, list) { return a / list.length; } function gainExperience(c, x) { gained.push([c, x]); }
   function getTurretGameTimeSec() { return 300; } function getMinionGoldValue() { return 20; } function spawnRewardText() {}
   var SKILL_AIM_TEST = {}; function skillAimSpec(id, slot) { return (SKILL_AIM_TEST[id] || {})[slot] || null; }
   function skillAimIsInstant(c, slot) { const s = skillAimSpec(c.championId, slot); return !s || s.type === 'instant'; }
   function computeSkillAim(c, slot) { const s = skillAimSpec(c.championId, slot); return s ? { rangeWorld: lolRangeToWorld(s.rangeLol) } : null; }
   this.api = { performance, setTimeout, withCombatActor, gameClockSetPaused, combatPerspective, isBotActing, getAllEnemyUnits, getAllyChampions, resolveDamageSource, applyStatus,
     rewardChampionKill, recordChampionContribution, CHAMPION_KILL_XP_BY_LEVEL, botPlanSkill, lolRangeToWorld, enemyBots, placedAllies, SKILL_AIM_TEST,
     gained: () => gained, setWorld: (w) => { controller = w.controller || null; dummy = w.dummy || null; minions = w.minions || []; } };`].join('\n'), ctx);
const A = ctx.api;
const L = A.lolRangeToWorld;

// --- 게임 시계: 일시정지하면 performance.now()와 타이머가 멈춘다 ---
{
  const t0 = A.performance.now();
  let fired = 0;
  A.setTimeout(() => { fired++; }, 1000);
  advance(400);
  A.gameClockSetPaused(true);
  advance(5000);
  assert(near(A.performance.now() - t0, 400) && fired === 0, '게임 시계: 일시정지 중에는 시간이 흐르지 않고 예약한 타이머도 실행되지 않는다');
  A.gameClockSetPaused(false);
  advance(500);
  assert(fired === 0, '게임 시계: 풀린 뒤에도 남은 게임 시간(600ms)이 지나야 실행된다');
  advance(200);
  assert(fired === 1 && near(A.performance.now() - t0, 1100), '게임 시계: 남은 시간이 지나면 한 번 실행(실제 6.1초, 게임 1.1초)');
}
// --- 행위자 문맥: 타이머는 예약한 쪽 입장에서 실행된다 ---
const player = { team: 'BLUE', championId: 'garen', isChampion: true, hp: 1000, maxHp: 1000, state: 'IDLE', root: { position: new Vector3(0, 0, 0) }, collisionRadius: L(65), statusEffects: [], champLevel: 6 };
const bot = { team: 'RED', championId: 'darius', isChampion: true, isBot: true, hp: 1000, maxHp: 1000, state: 'IDLE', root: { position: new Vector3(0, 0, L(300)) }, collisionRadius: L(65), statusEffects: [], champLevel: 6,
  skillLevels: { Q: 1, W: 1, E: 1, R: 1 }, cooldowns: { Q: 0, W: 0, E: 0, R: 0 }, stats: { attackRange: L(175), attackDamage: 60 } };
const redDummy = { team: 'RED', hp: 500, maxHp: 500, mesh: { position: new Vector3(L(200), 0, 0) }, collisionRadius: L(65), statusEffects: [] };
const blueAlly = { team: 'BLUE', hp: 500, maxHp: 500, mesh: { position: new Vector3(-L(200), 0, 0) }, collisionRadius: L(65), statusEffects: [] };
A.setWorld({ controller: player, dummy: redDummy });
A.enemyBots.push(bot); A.placedAllies.push(blueAlly);
{
  let seen = null;
  A.withCombatActor(bot, () => A.setTimeout(() => { seen = A.combatPerspective(); }, 100));
  advance(150);
  assert(seen === bot, '행위자 문맥: 봇 차례에 예약한 타이머는 실행될 때도 봇 입장');
  assert(A.combatPerspective() === player && !A.isBotActing(), '행위자 문맥: 평소에는 플레이어 입장');
}
// --- 입장별 적·아군 목록 ---
{
  const mine = A.getAllEnemyUnits();
  assert(mine.includes(bot) && mine.includes(redDummy) && !mine.includes(blueAlly), '적 목록(플레이어 입장): 적 봇·빨강 허수아비, 아군 더미는 아님');
  const theirs = A.withCombatActor(bot, () => A.getAllEnemyUnits());
  assert(theirs.includes(player) && theirs.includes(blueAlly) && !theirs.includes(redDummy) && !theirs.includes(bot), '적 목록(봇 입장): 플레이어·아군 더미, 빨강 허수아비·자기 자신은 아님');
  const allies = A.withCombatActor(bot, () => A.getAllyChampions(bot));
  assert(!allies.includes(blueAlly) && !allies.includes(player), '아군 목록(봇 입장): 플레이어 팀 아군 더미는 봇의 아군이 아니다');
  bot.state = 'DEAD';
  assert(!A.getAllEnemyUnits().includes(bot), '적 목록: 죽은 봇은 빠진다');
  bot.state = 'IDLE';
}
// --- 출처 기본값: 봇 차례의 피해·상태 효과는 봇의 것 ---
{
  assert(A.withCombatActor(bot, () => A.resolveDamageSource(null, player)) === bot, '피해 출처: 봇 스킬이 출처 없이 준 피해는 봇(예전엔 플레이어로 잡혔다)');
  assert(A.resolveDamageSource(null, redDummy) === player, '피해 출처: 플레이어 차례면 플레이어(그대로)');
  const t = { team: 'BLUE', hp: 100, maxHp: 100, statusEffects: [], mesh: { position: new Vector3() } };
  A.withCombatActor(bot, () => A.applyStatus(t, { id: 'bleed', type: 'DOT', duration: 5, totalDamage: 50, tickInterval: 1 }));
  assert(t.statusEffects[0].source === bot, '상태 효과 출처: 출처 없이 건 지속 피해는 건 챔피언(봇)으로 채운다');
}
// --- 봇 스킬 판단 ---
{
  A.SKILL_AIM_TEST.darius = { Q: { type: 'instant' }, E: { type: 'line', rangeLol: 535 }, R: { type: 'unit', rangeLol: 460 }, W: { type: 'wall' } };
  bot.root.position.set(0, 0, L(300));
  const e = A.botPlanSkill(bot, 'E', player, {});
  assert(e && e.kind === 'line' && e.slot === 'E', '봇 스킬: 사거리 안 직선 스킬은 상대 쪽으로 쓴다');
  bot.root.position.set(0, 0, L(900));
  assert(A.botPlanSkill(bot, 'E', player, {}) === null, '봇 스킬: 사거리 밖이면 쓰지 않는다');
  bot.root.position.set(0, 0, L(300));
  bot.cooldowns.E = 3;
  assert(A.botPlanSkill(bot, 'E', player, {}) === null, '봇 스킬: 재사용 대기 중이면 쓰지 않는다');
  bot.cooldowns.E = 0;
  assert(A.botPlanSkill(bot, 'W', player, {}) === null, '봇 스킬: 바람 장막·아군 대상 같은 스킬은 쓰지 않는다');
  assert(A.botPlanSkill(bot, 'R', player, {}).kind === 'unit', '봇 스킬: 대상 지정 스킬은 사거리 안 대상에게');
}
// --- 챔피언 처치 보상 ---
{
  const ally2 = { team: 'BLUE', championId: 'lux', isChampion: true, hp: 500, maxHp: 500, state: 'IDLE', root: { position: new Vector3(L(5000), 0, 0) }, statusEffects: [], champLevel: 6, gold: 0 };
  A.enemyBots.push(ally2); // listChampionUnits에 넣는 용도(팀은 BLUE)
  player.gold = 0; bot.gold = 0; bot._bounty = 0; player._bounty = 0;
  A.recordChampionContribution(bot, ally2); // 어시스트(20초 안 관여)
  bot._lastDamageSource = player;
  const r = A.rewardChampionKill(bot);
  assert(r.killer === player && near(player.gold, 180) && near(ally2.gold, 90), '처치 보상: 처치 180골드, 어시스트 90골드(혼자면 전부)');
  assert(near(player._bounty, 90) && near(ally2._bounty, 45), '현상금: 처치·어시스트로 번 골드 2당 1');
  const xp = A.gained();
  assert(xp.some(([c]) => c === player) && xp.some(([c]) => c === ally2), '처치 경험치: 처치자와 어시스트(거리와 무관) 모두');
  // 현상금 걸린 플레이어가 죽으면: 처치자 180 + 90, 현상금은 나눠 준 골드 4당 1씩 줄어든다
  player._lastDamageSource = bot; player.hp = 0;
  const r2 = A.rewardChampionKill(player);
  assert(near(bot.gold, 270) && near(player._bounty, Math.max(0, 90 - 270 / 4)), '현상금: 걸린 챔피언을 잡으면 180 + 현상금, 현상금은 나눠 준 골드 4당 1 감소');
  // 미니언·포탑 마무리: 20초 안에 마지막으로 관여한 챔피언이 처치
  bot.hp = 1000; bot.gold = 0; bot._champContrib = null;
  A.recordChampionContribution(bot, player);
  bot._lastDamageSource = { isStructure: true, isTurret: true, team: 'BLUE' };
  const g0 = player.gold;
  A.rewardChampionKill(bot);
  assert(player.gold - g0 >= 180, '처치 판정: 포탑이 마무리해도 20초 안에 피해를 준 챔피언이 처치');
  // 관여가 20초보다 오래되면 없음
  bot._champContrib = null; A.recordChampionContribution(bot, player); advance(21000);
  bot._lastDamageSource = { isMinion: true, team: 'BLUE' };
  const g1 = player.gold;
  A.rewardChampionKill(bot);
  assert(player.gold === g1, '처치 판정: 20초가 지난 관여는 처치·어시스트가 아니다');
  assert(A.CHAMPION_KILL_XP_BY_LEVEL[1] === 42 && A.CHAMPION_KILL_XP_BY_LEVEL[18] === 990, '처치 경험치 표: 1레벨 42 ~ 18레벨 990(PC 위키 양 끝값)');
}
