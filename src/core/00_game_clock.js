/* 00_game_clock.js — 95차: 게임 시계와 전투 행위자 문맥
 *
 * 1) 게임 시계 = 실제 시간 − (일시정지한 시간 + 시뮬레이션이 버린 시간). 메인 루프는 긴 프레임을 0.05초 조각으로 최대 3번(0.15초)까지
 *    나눠 돌리고(96차 고정 간격), 그보다 긴 멈춤(탭 전환·큰 끊김)만 버린다.
 *    - 페이지 전체의 performance.now()를 이 시계로 바꾼다(96차) - 번들 코드·three.js 시계·브라우저 점검 스크립트가 모두 같은 시계를 본다.
 *      보통 화면(20fps 이상)에서 일시정지하지 않으면 실제 시간과 같다.
 *    - 그래서 상태 효과 만료·재사용 대기·스킬 타이머가 일시정지 중에 흐르지 않고(95차), 아주 느린 화면(20fps 미만)에서도
 *      이동과 같은 빠르기로 흐른다(96차 - 예전엔 dt가 0.05초로 잘려 이동은 느려지고 타이머만 실제 시간으로 앞서 갔다).
 *    - setTimeout(페이지 전체, 96차): 예약한 게임 시각이 될 때 실행한다(일시정지·느린 화면이면 그만큼 늦게). setInterval: 일시정지 중의 실행은 건너뛴다.
 *    - 메인 루프가 매 프레임 gameClockFrame()을 불러 버린 시간을 센다.
 *
 * 2) 전투 행위자: "지금 누구의 입장에서 판정하는가". 판정 함수(getAllEnemyUnits 등)와 피해 출처 기본값이 이것을 본다.
 *    플레이어 차례면 null(= 전역 controller), 적 챔피언 봇이 움직이거나 스킬을 쓰는 동안에는 그 봇이다.
 *    setTimeout/setInterval은 예약하던 순간의 행위자를 기억했다가 실행할 때 되살린다 - 봇 스킬의 지연 피해도 봇의 것이 된다.
 *    투사체는 projectile_system.js가 발사 순간의 행위자를 기억한다.
 */
// 104차: 전용 서버가 띄운 시뮬레이션 페이지(index.html?sim=…)는 화면을 그리지 않는다 - 번들 맨 앞에서 정해 둔다(메인 루프가 시작되기 전).
if (typeof window !== 'undefined' && typeof location !== 'undefined' && /[?&]sim=/.test(location.search || '')) window.__netSimMode = true;
let __combatActor = null;
function withCombatActor(actor, fn) {
  const prev = __combatActor;
  __combatActor = actor || null;
  try { return fn(); } finally { __combatActor = prev; }
}

const __gcRealNow = (() => { const p = globalThis.performance; const f = p.now; return () => f.call(p); })(); // 실제 시간(덮어쓰기 전 원본)
let __gcLostMs = 0, __gcPauseStartedAt = null, __gcLastRaw = null;
function gameClockNow() { return (__gcPauseStartedAt != null ? __gcPauseStartedAt : __gcRealNow()) - __gcLostMs; }
function gameClockSetPaused(p) {
  const t = __gcRealNow();
  if (p && __gcPauseStartedAt == null) __gcPauseStartedAt = t;
  else if (!p && __gcPauseStartedAt != null) { __gcLostMs += t - __gcPauseStartedAt; __gcPauseStartedAt = null; }
}
function gameClockIsPaused() { return __gcPauseStartedAt != null; }
// 메인 루프가 매 프레임(시계 dt를 읽기 전에) 부른다 - 지난 프레임에서 maxStepMs를 넘은 만큼은 시뮬레이션이 진행하지 않았으므로 게임 시계에서도 뺀다.
function gameClockFrame(maxStepMs = 50) {
  const raw = __gcRealNow();
  if (__gcLastRaw != null && __gcPauseStartedAt == null) { const d = raw - __gcLastRaw; if (d > maxStepMs) __gcLostMs += d - maxStepMs; }
  __gcLastRaw = raw;
}
const performance = { now: gameClockNow };
try { globalThis.performance.now = gameClockNow; } catch (e) { /* 덮어쓸 수 없으면 번들 안에서만 게임 시계 */ }

// 아래 네 함수는 const로 둔다 - 함수 선언이면 일반 스크립트에서 전역(globalThis.setTimeout)을 덮어써 자기 자신을 부르게 된다.
// 96차: 페이지 전체의 setTimeout/setInterval도 이것으로 바꾼다(아래) - 그래서 원래 브라우저 타이머는 먼저 잡아 둔다.
const __hostSetTimeout = globalThis.setTimeout.bind(globalThis), __hostClearTimeout = globalThis.clearTimeout.bind(globalThis);
const __hostSetInterval = globalThis.setInterval.bind(globalThis), __hostClearInterval = globalThis.clearInterval.bind(globalThis);
const __gcTimers = new Map();
// 게임 타이머 번호는 10억부터 - 브라우저 타이머 번호(1부터)와 겹치지 않게. 겹치면 이미 끝난 게임 타이머를 지울 때 같은 번호의 다른
// 브라우저 타이머가 지워졌다(96차 점검에서 발견 - 점검 스크립트의 대기 타이머가 사라져 멈춤).
const __GC_TIMER_BASE = 1e9;
let __gcTimerSeq = __GC_TIMER_BASE;
const setTimeout = function setTimeout(fn, ms = 0, ...args) {
  if (typeof fn !== 'function') return __hostSetTimeout(fn, ms, ...args);
  const id = ++__gcTimerSeq, actor = __combatActor;
  const wait = Math.max(0, Number(ms) || 0);
  const due = gameClockNow() + wait;
  const fire = () => {
    // 일시정지 중이거나(멈춘 시간만큼 뒤로 밀렸다) 아직 게임 시각이 안 됐으면 다시 기다린다.
    if (gameClockIsPaused()) { __gcTimers.set(id, __hostSetTimeout(fire, 50)); return; }
    const left = due - gameClockNow();
    if (left > 1) { __gcTimers.set(id, __hostSetTimeout(fire, left)); return; }
    __gcTimers.delete(id);
    withCombatActor(actor, () => fn(...args));
  };
  __gcTimers.set(id, __hostSetTimeout(fire, wait));
  return id;
};
const setInterval = function setInterval(fn, ms = 0, ...args) {
  if (typeof fn !== 'function') return __hostSetInterval(fn, ms, ...args);
  const id = ++__gcTimerSeq, actor = __combatActor;
  __gcTimers.set(id, __hostSetInterval(() => { if (!gameClockIsPaused()) withCombatActor(actor, () => fn(...args)); }, ms));
  return id;
};
const clearTimeout = function clearTimeout(id) {
  const h = __gcTimers.get(id);
  if (h !== undefined) { __hostClearTimeout(h); __gcTimers.delete(id); } else if (!(id >= __GC_TIMER_BASE)) __hostClearTimeout(id);
};
const clearInterval = function clearInterval(id) {
  const h = __gcTimers.get(id);
  if (h !== undefined) { __hostClearInterval(h); __gcTimers.delete(id); } else if (!(id >= __GC_TIMER_BASE)) __hostClearInterval(id);
};
// 96차: 페이지 전체 타이머도 게임 시계로 - 번들 밖 코드(브라우저 점검 스크립트 등)의 대기도 같은 시계로 잰다.
try {
  globalThis.setTimeout = setTimeout; globalThis.clearTimeout = clearTimeout;
  globalThis.setInterval = setInterval; globalThis.clearInterval = clearInterval;
} catch (e) { /* 바꿀 수 없으면 번들 안에서만 */ }
