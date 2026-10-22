/* 00_game_clock.js — 95차: 게임 시계(일시정지)와 전투 행위자 문맥
 *
 * 1) 게임 시계: 이 번들 안의 모든 코드는 performance.now()·setTimeout·setInterval을 이 파일의 것으로 쓴다(같은 모듈 범위에서 가린다).
 *    - performance.now(): 실제 시간에서 "일시정지로 멈춰 있던 시간"을 뺀 값. 일시정지하지 않으면 실제 시간과 같다(브라우저 점검 스크립트의
 *      시각과도 같음). 그래서 상태 효과 만료·재사용 대기·스킬 타이머가 일시정지 중에 흐르지 않는다(예전엔 일시정지 중에 끝났다).
 *    - setTimeout: 예약한 게임 시각이 될 때 실행한다. 일시정지 중에 시간이 되면 풀릴 때까지 미룬다.
 *    - setInterval: 일시정지 중의 실행은 건너뛴다.
 *    프레임 dt가 0.05초로 잘리는 아주 느린 화면(20fps 미만)에서는 이 시계가 이동(dt)보다 빨리 간다 - 게임 규칙 시계(웨이브·포탑,
 *    turret_system.js의 시뮬레이션 시계)는 dt 누적이고, 이 시계는 일시정지만 빼는 실제 시간이다(README 95차).
 *
 * 2) 전투 행위자: "지금 누구의 입장에서 판정하는가". 판정 함수(getAllEnemyUnits 등)와 피해 출처 기본값이 이것을 본다.
 *    플레이어 차례면 null(= 전역 controller), 적 챔피언 봇이 움직이거나 스킬을 쓰는 동안에는 그 봇이다.
 *    setTimeout/setInterval은 예약하던 순간의 행위자를 기억했다가 실행할 때 되살린다 - 봇 스킬의 지연 피해도 봇의 것이 된다.
 *    투사체는 projectile_system.js가 발사 순간의 행위자를 기억한다.
 */
let __combatActor = null;
function withCombatActor(actor, fn) {
  const prev = __combatActor;
  __combatActor = actor || null;
  try { return fn(); } finally { __combatActor = prev; }
}

let __gcPausedTotalMs = 0, __gcPauseStartedAt = null;
function gameClockSetPaused(p) {
  const t = globalThis.performance.now();
  if (p && __gcPauseStartedAt == null) __gcPauseStartedAt = t;
  else if (!p && __gcPauseStartedAt != null) { __gcPausedTotalMs += t - __gcPauseStartedAt; __gcPauseStartedAt = null; }
}
function gameClockIsPaused() { return __gcPauseStartedAt != null; }
const performance = {
  now() { return (__gcPauseStartedAt != null ? __gcPauseStartedAt : globalThis.performance.now()) - __gcPausedTotalMs; },
};

// 아래 네 함수는 const로 둔다 - 함수 선언이면 일반 스크립트에서 전역(globalThis.setTimeout)을 덮어써 자기 자신을 부르게 된다.
const __gcTimers = new Map();
let __gcTimerSeq = 0;
const setTimeout = function setTimeout(fn, ms = 0, ...args) {
  if (typeof fn !== 'function') return globalThis.setTimeout(fn, ms, ...args);
  const id = ++__gcTimerSeq, actor = __combatActor;
  const wait = Math.max(0, Number(ms) || 0);
  const due = performance.now() + wait;
  const fire = () => {
    // 일시정지 중이거나(멈춘 시간만큼 뒤로 밀렸다) 아직 게임 시각이 안 됐으면 다시 기다린다.
    if (gameClockIsPaused()) { __gcTimers.set(id, globalThis.setTimeout(fire, 50)); return; }
    const left = due - performance.now();
    if (left > 1) { __gcTimers.set(id, globalThis.setTimeout(fire, left)); return; }
    __gcTimers.delete(id);
    withCombatActor(actor, () => fn(...args));
  };
  __gcTimers.set(id, globalThis.setTimeout(fire, wait));
  return id;
}
const setInterval = function setInterval(fn, ms = 0, ...args) {
  if (typeof fn !== 'function') return globalThis.setInterval(fn, ms, ...args);
  const id = ++__gcTimerSeq, actor = __combatActor;
  __gcTimers.set(id, globalThis.setInterval(() => { if (!gameClockIsPaused()) withCombatActor(actor, () => fn(...args)); }, ms));
  return id;
}
const clearTimeout = function clearTimeout(id) {
  const h = __gcTimers.get(id);
  if (h !== undefined) { globalThis.clearTimeout(h); __gcTimers.delete(id); }
}
const clearInterval = function clearInterval(id) {
  const h = __gcTimers.get(id);
  if (h !== undefined) { globalThis.clearInterval(h); __gcTimers.delete(id); }
}
