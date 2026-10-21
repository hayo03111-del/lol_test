/* game_events.js — 93차(온라인 1:1 준비): 게임 이벤트 기록
 * "무슨 일이 일어났는가"를 화면 객체 없이 직렬화 가능한 데이터로 남긴다. 나중에 서버가 클라이언트에 연출용으로 보낼 이벤트의 모양이다.
 * 이벤트는 연출·기록용이다 - 게임 상태(체력·골드 등)의 기준은 언제나 게임 객체 자체이고, 스냅샷(game_snapshot.js)이 그것을 옮긴다.
 * 이벤트를 놓치거나 순서가 바뀌어도 상태가 틀어지지 않게, 이벤트로 상태를 "확정"하는 코드는 만들지 않는다.
 *
 * 이벤트 종류(type)와 필드(모든 유닛은 entityId 숫자로):
 *  damage            { sourceId, targetId, amount, damageType, basicAttack, ability, dot, ultimate, targetHp }
 *  death             { entityId, kind, killerId }
 *  respawn           { entityId }
 *  structureDestroyed{ entityId, kind, team }
 *  gameOver          { winnerTeam }
 *  itemPurchased     { entityId, itemId }
 *  itemSold          { entityId, itemId }
 *  itemUsed          { entityId, itemId, slot }
 *  commandResult     { seq, type, ok, reason, outcome }   - LocalSession이 명령마다 남긴다(승인·거부)
 *  gameReset         { }
 * 공통 필드: seq(이벤트 번호), tick, simTimeSec(LocalSession 시뮬레이션 시간).
 *
 * emitGameEvent()는 게임 로직 안에서 불리므로 절대 예외를 밖으로 던지지 않는다(구독자 오류도 삼킨다).
 */
var __gameEventBus; // var: 파일 순서와 무관하게 쓸 수 있게(처음 쓸 때 만든다)
function _gameEventBus() {
  if (!__gameEventBus) __gameEventBus = { seq: 0, buffer: [], limit: 500, listeners: new Map() };
  return __gameEventBus;
}
function emitGameEvent(type, data) {
  try {
    const bus = _gameEventBus();
    const s = (typeof gameSession !== 'undefined' && gameSession) ? gameSession : null;
    const ev = Object.assign({ seq: ++bus.seq, type, tick: s ? s.tick : 0, simTimeSec: s ? Math.round(s.simTimeSec * 1000) / 1000 : 0 }, data || {});
    bus.buffer.push(ev);
    if (bus.buffer.length > bus.limit) bus.buffer.splice(0, bus.buffer.length - bus.limit);
    for (const key of [type, '*']) {
      const set = bus.listeners.get(key);
      if (set) for (const fn of set) { try { fn(ev); } catch (e) { console.warn('[EVENT] 구독자 오류', e); } }
    }
    return ev;
  } catch (e) { return null; }
}
// 구독: type 하나 또는 '*'(전부). 해제 함수를 돌려준다.
function onGameEvent(type, fn) {
  const bus = _gameEventBus();
  if (!bus.listeners.has(type)) bus.listeners.set(type, new Set());
  bus.listeners.get(type).add(fn);
  return () => { const set = bus.listeners.get(type); if (set) set.delete(fn); };
}
// 최근 이벤트(기본 전부, 최대 limit개). sinceSeq를 주면 그 뒤 것만.
function recentGameEvents(sinceSeq = 0) {
  return _gameEventBus().buffer.filter((e) => e.seq > sinceSeq);
}
function clearGameEvents() { _gameEventBus().buffer.length = 0; }

// 이벤트 데이터에 넣을 유닛 ID(레지스트리가 없으면 null) - 게임 로직 파일에서 쓰는 짧은 도우미.
function _evId(unit) { return (unit && typeof entityId === 'function') ? entityId(unit) : null; }
function _evDamage(source, target, amount, result) {
  emitGameEvent('damage', {
    sourceId: _evId(source), targetId: _evId(target),
    amount: Math.round((amount || 0) * 100) / 100,
    damageType: (result && result.damageType) || 'PHYSICAL',
    basicAttack: !!(result && result.isBasicAttack), ability: !!(result && result.isAbility),
    dot: !!(result && result.isStatusTick), ultimate: !!(result && result.isUltimate),
    targetHp: target && Number.isFinite(target.hp) ? Math.round(target.hp * 100) / 100 : null,
  });
}
