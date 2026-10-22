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
  THREE: { Vector3: class V { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } clone() { return new V(this.x, this.y, this.z); } } },
  lolRangeToWorld: (v) => v / 100,
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
src += ';globalThis.__t = { _netDelta, _netSer, _netDeser, _netEffectiveIntent, _netReconcile, _netNewPred: (p) => ({ pos: p, intent: null, intentSeq: 0, hist: [], corr: new THREE.Vector3(), srv: null, follow: false, corrections: 0, snaps: 0 }), _netSampleAt, RemoteSession, _netHostOnMessage, assignEntityId, reserveEntityIds, entityId, findEntityById, getGameSession: () => gameSession, setGameSession: (s) => { gameSession = s; } };';
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

// 5) 델타: 처음엔 전부, 다음엔 바뀐 값만, 전체 스냅샷이면 다시 전부
const dst = { sent: new Map() };
const e1 = { i: 7, k: 'm', x: 1, z: 2, hp: 100, sc: [0, 0] };
assert(JSON.stringify(T._netDelta(dst, e1, false)) === JSON.stringify(e1), '델타: 처음 보내는 유닛은 전부');
assert(T._netDelta(dst, { ...e1 }, false) === null, '델타: 안 바뀐 유닛은 보내지 않는다');
const d2 = T._netDelta(dst, { ...e1, x: 5, sc: [1, 0] }, false);
assert(d2 && d2.i === 7 && d2.x === 5 && d2.sc[0] === 1 && !('hp' in d2) && !('z' in d2), '델타: 바뀐 칸만(배열은 내용으로 비교)');
assert(Object.keys(T._netDelta(dst, { ...e1, x: 5, sc: [1, 0] }, true)).length === Object.keys(e1).length, '델타: 전체 스냅샷이면 전부');

// 6) 연출 인자 직렬화: 좌표·유닛·함수
const unitM = { isMinion: true, hp: 1 };
const id = T.entityId(unitM);
const V = ctx.THREE.Vector3;
const ser = JSON.parse(JSON.stringify(T._netSer([new V(1.23456, 0, -2), { color: 0xff0000, follow: unitM, onDone: () => 1, deep: { a: [1, new V(0, 1, 0)] } }])));
assert(ser[0].__v[0] === 1.235 && ser[1].follow.__e === id && !('onDone' in ser[1]), '연출 직렬화: 좌표는 숫자로, 유닛은 ID로, 함수는 뺀다');
const back = T._netDeser(ser);
ctx.listEntities = () => [unitM];
assert(back[0].isVector3 && back[0].z === -2 && back[1].deep.a[1].y === 1, '연출 역직렬화: 좌표가 다시 Vector3로');

// 7) 예측 목표: 방장이 아직 모르는 내 명령 → 그 목표, 받은 뒤 → 방장이 알려 준 목표·추격 대상
const P = T._netNewPred(new V(0, 0, 0));
P.intent = { kind: 'move', p: new V(5, 0, 5) }; P.intentSeq = 3; P.srv = { ack: 2, tp: [9, 9], tg: null, fr: true };
assert(T._netEffectiveIntent(P).p.x === 5, '예측: 방장이 받기 전에는 내 명령 목표');
P.srv.ack = 3;
assert(T._netEffectiveIntent(P).p.x === 9, '예측: 받은 뒤에는 방장 쪽 이동 목표');
P.srv.tg = 42;
assert(T._netEffectiveIntent(P).kind === 'chase' && T._netEffectiveIntent(P).id === 42, '예측: 방장 쪽이 대상을 쫓으면 추격');

// 8) 보정: 왕복 지연만큼 과거의 내 예측 위치와 방장 위치를 비교 - 작은 차이는 조금씩, 큰 차이는 바로
realNow = 10000;
const st2 = { pred: T._netNewPred(new V(10, 0, 0)), own: { x: 3.5, y: 0, z: 0 }, rtt: 100 };
st2.pred.srv = { ack: 5, fr: true }; st2.pred.intentSeq = 5;
st2.pred.hist = [{ t: 9800, x: 2, z: 0 }, { t: 9880, x: 3, z: 0 }, { t: 9950, x: 4, z: 0 }];
T._netReconcile(st2);
assert(Math.abs(st2.pred.corr.x - 0.5) < 1e-9 && st2.pred.hist[0].x === 2.5 && st2.pred.pos.x === 10, '보정: 과거 예측(지연만큼 전)과의 차이를 메울 몫으로 두고 기록도 옮긴다');
st2.own = { x: 30, y: 0, z: 0 };
T._netReconcile(st2);
assert(st2.pred.pos.x === 30 && st2.pred.snaps === 1, '보정: 크게 어긋나면(점멸·부활 등) 바로 맞춘다');
st2.pred.intentSeq = 9; st2.pred.intent = { kind: 'move', p: new V(0, 0, 0) }; st2.own = { x: 0, y: 0, z: 0 }; st2.pred.hist = [{ t: 9800, x: 30, z: 0 }];
T._netReconcile(st2);
assert(st2.pred.pos.x === 30, '보정: 방장이 내 최신 명령을 받기 전에는 비교하지 않는다');
