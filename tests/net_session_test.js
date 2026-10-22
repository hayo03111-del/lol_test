// 97차 온라인 대전(src/net/net_session.js) 단위 테스트 - 실제 소스(entity_registry·game_commands·net_session)를 vm으로 불러
// 보간(각도 넘김 포함), 참가자 세션(명령 검사 후 전송), 방장의 원격 명령 처리(검사·준비 전 무시·초당 제한·행위자 문맥), 방장 ID 붙이기를 확인한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

let realNow = 1000;
const ctx = {
  console, Math, JSON, Object, Array, Number, String, Set, Map, WeakMap, Promise, Error,
  THREE: { Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } } },
  performance: { now: () => realNow },
  __gcRealNow: () => realNow,
  __hostSetTimeout: () => 0, __hostSetInterval: () => 0, __hostClearInterval: () => {},
  emitGameEvent: () => {}, buildGameSnapshot: () => ({}), recentGameEvents: () => [],
  ITEM_DATA: { longSword: {} },
  STATE: { DEAD: 'DEAD' },
  actorLog: [],
};
ctx.withCombatActor = (a, fn) => { ctx.actorLog.push(a); return fn(); };
vm.createContext(ctx);
let src = '';
for (const f of ['src/session/entity_registry.js', 'src/session/game_commands.js', 'src/net/net_session.js']) src += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n';
src += ';globalThis.__t = { _netSampleAt, RemoteSession, _netHostOnMessage, assignEntityId, reserveEntityIds, entityId, findEntityById, getGameSession: () => gameSession, setGameSession: (s) => { gameSession = s; } };';
vm.runInContext(src, ctx);
const T = ctx.__t;

// 1) 보간
const samples = [{ t: 0, x: 0, y: 0, z: 0, r: 3.0 }, { t: 100, x: 10, y: 0, z: -20, r: -3.0 }];
const mid = T._netSampleAt(samples, 50);
assert(Math.abs(mid.x - 5) < 1e-9 && Math.abs(mid.z + 10) < 1e-9, '보간: 두 스냅샷 사이 위치는 시각 비율대로');
assert(Math.abs(Math.abs(mid.r) - Math.PI) < 0.01, '보간: 방향은 짧은 쪽(±π 넘김)으로 돈다');
assert(T._netSampleAt(samples, -50).x === 0 && T._netSampleAt(samples, 500).x === 10, '보간: 범위 밖은 처음/마지막 값');

// 2) 참가자 세션
const sent = [];
const rs = new T.RemoteSession({ sendMsg: (d) => sent.push(d) });
const okRes = rs.submit({ type: 'move', point: { x: 1, y: 0, z: 2 } });
const badRes = rs.submit({ type: 'cast', slot: 'X' });
assert(okRes.ok && sent.length === 1 && sent[0].k === 'cmd' && sent[0].cmd.point.z === 2, '참가자 세션: 올바른 명령은 방장에게 보낸다');
assert(!badRes.ok && sent.length === 1, '참가자 세션: 형식이 틀린 명령은 보내지 않는다');

// 3) 방장의 원격 명령 처리
const applied = [];
const bot = { championId: 'ashe' };
T.setGameSession({ _apply: (c, cmd) => { applied.push([c, cmd.type]); return { ok: true }; } });
const st = { remote: bot, guestReady: false, cmdTimes: [] };
T._netHostOnMessage(st, { k: 'cmd', cmd: { type: 'stop' } });
assert(applied.length === 0, '방장: 참가자가 준비되기 전 명령은 무시');
st.guestReady = true;
T._netHostOnMessage(st, { k: 'cmd', cmd: { type: 'stop' } });
T._netHostOnMessage(st, { k: 'cmd', cmd: { type: 'buyItem', itemId: 'noSuchItem' } });
assert(applied.length === 1 && applied[0][0] === bot && ctx.actorLog[ctx.actorLog.length - 1] === bot, '방장: 명령은 원격 챔피언 입장에서 실행, 틀린 명령은 버림');
for (let i = 0; i < 100; i++) T._netHostOnMessage(st, { k: 'cmd', cmd: { type: 'stop' } });
assert(applied.length === 60, '방장: 1초에 60개까지만 처리(넘치면 버림)');
realNow += 1500;
T._netHostOnMessage(st, { k: 'cmd', cmd: { type: 'stop' } });
assert(applied.length === 61, '방장: 1초가 지나면 다시 받는다');

// 4) 방장 ID 붙이기
const unitA = {}, unitB = {};
T.assignEntityId(unitA, 42);
T.reserveEntityIds(1000000);
assert(T.entityId(unitA) === 42 && T.entityId(unitB) >= 1000000, 'ID: 방장 ID를 붙이고, 이 브라우저가 새로 주는 ID는 겹치지 않는 범위에서');
