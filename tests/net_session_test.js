// 97차 온라인 대전(src/net/net_session.js) 단위 테스트 - 실제 소스(entity_registry·game_commands·net_session)를 vm으로 불러
// 보간(각도 넘김 포함), 참가자 세션(명령 검사 후 전송), 방장의 원격 명령 처리(검사·준비 전 무시·초당 제한·행위자 문맥), 방장 ID 붙이기를 확인한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

let realNow = 1000;
const ctx = {
  console, Math, JSON, Object, Array, Number, String, Set, Map, WeakMap, Promise, Error, Uint8Array, TextEncoder, TextDecoder,
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
for (const f of ['src/session/entity_registry.js', 'src/session/game_commands.js', 'src/net/net_session.js', 'src/net/net_transport.js']) src += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n';
src += ';globalThis.__t = { _netJitterBuffer, _netRenderTime, _netGuestDrain, _netProjPresent, _netRateControl, _netQueueSample, _netCodeHash, AutoNetClient, NET_MQTT_TOPIC, _netHistAt, _netRewound, MqttWs, _mqttPacket, _mqttStr, _mqttLen, _netTimeShift, _netApplyChampState, _netStatusFrom, _netDelta, _netSer, _netDeser, _netEffectiveIntent, _netReconcile, _netNewPred: (p) => ({ pos: p, intent: null, intentSeq: 0, hist: [], corr: new THREE.Vector3(), srv: null, follow: false, corrections: 0, snaps: 0 }), _netSampleAt, RemoteSession, _netHostOnMessage, assignEntityId, reserveEntityIds, entityId, findEntityById, getGameSession: () => gameSession, setGameSession: (s) => { gameSession = s; } };';
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

// 8) 보정(103차): 걷는 중에는 옆으로 벗어난 차이·0.3초치를 넘는 앞뒤 차이만, 멈춘 뒤에는 방장 자리에 정확히, 크게 어긋나면 바로
realNow = 10000;
const st2 = { pred: T._netNewPred(new V(10, 0, 0)), own: { x: 3.5, y: 0, z: 0, at: 10000 }, ownPrev: { x: 3.4, y: 0, z: 0 }, rtt: 100 };
st2.pred.srv = { ack: 5, fr: true, ms: 10 }; st2.pred.intentSeq = 5; st2.pred.moving = true;
st2.pred.hist = [{ t: 9800, x: 2, z: 0 }, { t: 9880, x: 3, z: 0 }, { t: 9950, x: 4, z: 0 }];
T._netReconcile(st2);
assert(st2.pred.corr.x === 0 && st2.pred.corrections === 0 && st2.pred.pos.x === 10, '보정: 걷는 방향으로 앞서거나 뒤처진 차이(시각 겉차이, 0.3초치 안)는 메우지 않는다');
st2.own = { x: 3, y: 0, z: 0.5, at: 10000 };
T._netReconcile(st2);
assert(Math.abs(st2.pred.corr.z - 0.5) < 1e-9 && Math.abs(st2.pred.corr.x) < 1e-9 && st2.pred.hist[1].z === 0.5 && st2.pred.hist[0].z === 0, '보정: 옆으로 벗어난 차이(미니언에 밀림 등)는 메울 몫으로 두고 그 뒤 기록도 옮긴다');
st2.own = { x: 3 + 3 + 1, y: 0, z: 0.5, at: 10000 };
T._netReconcile(st2);
assert(Math.abs(st2.pred.corr.x - 1) < 0.05, '보정: 0.3초치(이동속도 × 0.3)를 넘는 앞뒤 차이는 넘는 만큼 메운다');
st2.own = { x: 30, y: 0, z: 0, at: 10000 };
T._netReconcile(st2);
assert(st2.pred.pos.x === 30 && st2.pred.snaps === 1, '보정: 크게 어긋나면(점멸·부활 등) 바로 맞춘다');
st2.pred.moving = false; st2.pred.pos.set(30, 0, 0); st2.ownPrev = { x: 30.5, y: 0, z: 0.2 }; st2.own = { x: 30.5, y: 0, z: 0.2, at: 10000 };
T._netReconcile(st2);
assert(Math.abs(st2.pred.corr.x - 0.5) < 1e-9 && Math.abs(st2.pred.corr.z - 0.2) < 1e-9, '보정: 멈춘 뒤 방장도 멈춰 있으면 방장 자리에 정확히 맞춘다');
st2.pred.corr.set(0, 0, 0); st2.ownPrev = { x: 29, y: 0, z: 0 }; st2.own = { x: 30.5, y: 0, z: 0.2, at: 10000 };
T._netReconcile(st2);
assert(st2.pred.corr.x === 0, '보정: 멈췄는데 방장 쪽은 아직 걷는 중이면 기다린다');
st2.pred.intentSeq = 9; st2.pred.intent = { kind: 'move', p: new V(0, 0, 0) }; st2.own = { x: 0, y: 0, z: 0, at: 10000 }; st2.pred.hist = [{ t: 9800, x: 30, z: 0 }];
T._netReconcile(st2);
assert(st2.pred.pos.x === 30, '보정: 방장이 내 최신 명령을 받기 전에는 비교하지 않는다');

// 9) 100차: MQTT 패킷 - 길이(가변 길이 정수), PUBLISH 만들기 → 받는 쪽 해석(조각으로 나뉘어 와도)
assert(JSON.stringify(T._mqttLen(0)) === '[0]' && JSON.stringify(T._mqttLen(127)) === '[127]' && JSON.stringify(T._mqttLen(128)) === '[128,1]' && JSON.stringify(T._mqttLen(16383)) === '[255,127]', 'MQTT: 남은 길이 가변 정수');
const big = 'x'.repeat(300) + '한글';
const tb = T._mqttStr('lolsim/pvp1/ABCD/g'), pb = new TextEncoder().encode(big);
const body = new Uint8Array(tb.length + pb.length); body.set(tb); body.set(pb, tb.length);
const pkt = T._mqttPacket(0x30, body);
const m = new T.MqttWs('ws://x', 'id'); const got = [];
m.onmessage = (topic, payload) => got.push([topic, payload]);
m._data(pkt.subarray(0, 5)); m._data(pkt.subarray(5, 40)); m._data(pkt.subarray(40)); // 세 조각
let ack = null; m._onConnack = (rc) => { ack = rc; };
m._data(Uint8Array.from([0x20, 2, 0, 0, 0xD0, 0])); // CONNACK + PINGRESP 한 덩어리
assert(got.length === 1 && got[0][0] === 'lolsim/pvp1/ABCD/g' && got[0][1] === big && ack === 0, 'MQTT: 조각난 PUBLISH를 이어 붙여 해석, 여러 패킷이 한 덩어리로 와도');

// 10) 100차: 챔피언 내부 상태 - 시각 값은 방장 시계 → 내 시계로, 방장에 없어진 값은 지우고 참가자 쪽 객체(Map)는 둔다
realNow = 50000;
const shifted = T._netTimeShift({ qMarkExpiresAt: 31000, qStacks: 2, castTime: 2500, cds: { readyAt: 32000 }, eRechargeAt: [30500, 31500] }, '_x', 50000 - 30000, false);
assert(shifted.qMarkExpiresAt === 51000 && shifted.qStacks === 2 && shifted.castTime === 2500 && shifted.cds.readyAt === 52000 && shifted.eRechargeAt[1] === 51500, '내부 상태: …At·…Until·…Expires 시각만 옮긴다(지속 시간·중첩은 그대로)');
const champ = { _leesin: { qMarkTarget: 5, qMarkExpiresAt: 1, local: new Map() }, _itemActiveCooldownUntil: {} };
T._netApplyChampState(champ, { _leesin: { qStacks: 1 }, _itemActiveCooldownUntil: { zhonya: 31000 } }, 30000);
assert(champ._leesin.qMarkTarget === null && champ._leesin.qStacks === 1 && champ._leesin.local instanceof Map && Math.abs(champ._itemActiveCooldownUntil.zhonya - 51000) < 1, '내부 상태: 지난 재시전 표식은 지우고, 참가자 쪽 Map은 두고, 아이템 대기 시각은 옮긴다');
const sts = T._netStatusFrom([['stun', 'STUN', 1500, null, null, null], ['buff', 'BUFF', -1, 0.3, null, 2]], 1000);
assert(sts[0].expiresAt === 2500 && sts[1].expiresAt === Infinity && sts[1].stacks === 2, '상태 효과: 남은 시간 → 내 시계, 끝없는 효과·중첩');

// 11) 101차: 지연 보정 - 기록에서 과거 자리를 보간하고, 실행하는 동안만 되돌렸다가 제자리로(스킬이 옮겼으면 그 자리 유지)
const h = [{ t: 1000, x: 0, y: 0, z: 0 }, { t: 1100, x: 10, y: 0, z: 0 }];
assert(T._netHistAt(h, 1050).x === 5 && T._netHistAt(h, 500).x === 0 && T._netHistAt(h, 2000).x === 10, '지연 보정: 기록 사이 자리 보간');

// 12) 102차: 혼잡 제어 - 대기열이 서고 받는 속도가 보낸 속도보다 느리면 예산을 받은 속도 쪽으로 낮추고, 흔들림만으로는 낮추지 않는다
{
  const st = { bpsOut: 20000 };
  T._netRateControl(st, { now: 0, q: 150, rb: 19800 }); T._netRateControl(st, { now: 1000, q: 150, rb: 19900 });
  assert(st.budget == null, '혼잡 제어: 대기열 값이 높아도 받은 만큼 다 받고 있으면(프레임 흔들림) 줄이지 않는다');
  const s2 = { bpsOut: 20000 };
  T._netRateControl(s2, { now: 0, q: 150, rb: 8000 }); T._netRateControl(s2, { now: 1000, q: 200, rb: 8000 });
  assert(s2.budget === 10000 && s2.congestions === 1, '혼잡 제어: 줄이 서고 받는 속도가 느리면 예산을 낮춘다(한 번에 반 아래로는 안 내림)');
  T._netRateControl(s2, { now: 1100, q: 200, rb: 8000 });
  assert(s2.congestions === 1, '혼잡 제어: 줄이 빠질 시간(q ms, 최소 0.5초) 안에는 다시 낮추지 않는다');
  T._netRateControl(s2, { now: 1600, q: 500, rb: 8000 });
  assert(s2.budget === 6800, '혼잡 제어: 대기열이 아주 크면(400ms+) 다시 낮춘다(받은 속도의 85%)');
  s2.bpsOut = 7000; for (let i = 0; i < 4; i++) T._netRateControl(s2, { now: 4000 + i * 1000, q: 10, rb: 7000 });
  assert(s2.budget > 7000 && s2.budget < 12000, '혼잡 제어: 조용해지면 조금씩(1초에 8%) 되돌린다');
  const s3 = { bpsOut: 5000 };
  T._netRateControl(s3, { now: 0, backlog: 64 * 1024 });
  assert(s3.budget === 3500, '혼잡 제어: 보내는 쪽 대기열(backlog)이 크면 지금 속도의 70%로');
  const q = {};
  T._netQueueSample(q, 100, 1000); T._netQueueSample(q, 300, 1500); T._netQueueSample(q, 120, 2100); T._netQueueSample(q, 400, 3000);
  assert(q.queueDelay === 20, '대기열 지연: 1초 칸의 최솟값만 본다(프레임 흔들림 300ms는 빠진다) - 기준보다 20ms 늦음');
}
// 13) 102차: 우회 중계 주제는 방 코드의 해시, 방장은 "길 재기"에 붙잡지 않고 답만 한다
{
  const h1 = T._netCodeHash('ABCD'), h2 = T._netCodeHash('ABCE');
  assert(h1 !== h2 && !/ABCD/.test(h1) && T._netCodeHash('ABCD') === h1, '주제: 방 코드가 그대로 보이지 않는 해시(같은 코드면 같은 값)');
  const a = new T.AutoNetClient(); a.role = 'host'; a.code = 'ABCD'; a.name = '방장';
  const pubs = []; const link = { publish: (topic, text) => pubs.push([topic, JSON.parse(text)]) };
  a._hostMqtt(link, JSON.stringify({ f: 'g1', t: 'probe', at: 123 }));
  assert(pubs.length === 1 && pubs[0][1].t === 'probe-ok' && pubs[0][1].at === 123 && pubs[0][1].to === 'g1' && pubs[0][0] === T.NET_MQTT_TOPIC + h1 + '/g' && !a.guest, '길 재기: 방장은 바로 답하고 참가자로 잡지 않는다');
  a._hostMqtt(link, JSON.stringify({ f: 'g1', t: 'join', name: '친구' }));
  assert(a.guest && a.guest.cid === 'g1' && pubs[1][1].t === 'joined' && pubs[1][1].code === undefined, '참가: join으로만 참가자가 되고, 답에 방 코드를 싣지 않는다');
  const link2 = { publish: (topic, text) => pubs.push(['2', JSON.parse(text)]) };
  a._hostMqtt(link2, JSON.stringify({ f: 'g1', t: 'msg', d: {} }));
  assert(a.guest.link === link2, '재연결: 참가자 메시지가 다른(다시 붙은) 중계소로 오면 답도 그쪽으로');
}
// 14) 102차: 참가자는 모든 길(직접 연결 + 중계소 전부)을 재서 가장 빠른 길로 참가한다(직접 연결은 30ms 덤), 나머지는 닫는다
(async () => {
  const mk = (kind, label, rtt, log) => ({ kind, label, rtt, close: () => log.push('close ' + label), commit: () => log.push('commit ' + label) });
  const run = async (p2pRtt, mq) => {
    const a = new T.AutoNetClient(), log = [];
    a._probeP2p = async () => (p2pRtt == null ? null : mk('p2p', 'p2p', p2pRtt, log));
    let i = 0; a._probeMqtt = async () => { const r = mq[i % mq.length]; i++; return r == null ? null : mk('mqtt', 'mq' + i, r, log); };
    await a._join('ABCD', '친구');
    return log;
  };
  const l1 = await run(260, [400, 120, null, 300, null]);
  assert(l1.includes('commit mq2') && l1.filter((x) => x.startsWith('close')).length === 3, '길 고르기: 가장 빠른 중계소(120ms)로 참가하고 나머지 길은 닫는다');
  const l2 = await run(140, [400, 120, null, 300, null]);
  assert(l2.includes('commit p2p'), '길 고르기: 직접 연결이 30ms 안쪽으로 비슷하면 직접 연결');
  const a3 = new T.AutoNetClient(); const ev = [];
  a3.on('error', (m) => ev.push(m.msg)); a3._probeP2p = async () => null; a3._probeMqtt = async () => null;
  await a3._join('ZZZZ', '친구');
  assert(ev.length === 1 && /방을 찾지 못했습니다/.test(ev[0]), '길 고르기: 어느 길로도 답이 없으면 방이 없다고 알린다');
})();

// 15) 102차: 직선 스킬샷은 참가자 화면에서 "지금" 자리로(보간 지연 + 왕복만큼 앞), 끝 지점은 넘지 않고, 처음엔 서서히
{
  const p = { line: { vx: 20, vz: 0, speed: 20, ex: 10, ez: 0 }, bornAt: 0 };
  const a = T._netProjPresent(p, { x: 0, z: 0 }, 0.25, 1000);
  assert(Math.abs(a.x - 5) < 1e-9 && a.z === 0, '투사체: 속도 × (지연 + 왕복)만큼 앞당겨 그린다');
  assert(Math.abs(T._netProjPresent(p, { x: 8, z: 0 }, 0.25, 1000).x - 10) < 1e-9, '투사체: 끝 지점(최대 사거리)은 넘지 않는다');
  assert(Math.abs(T._netProjPresent(p, { x: 0, z: 0 }, 0.25, 75).x - 2.5) < 1e-9, '투사체: 나타난 직후 0.15초는 서서히 앞당긴다');
  assert(T._netProjPresent({ bornAt: 0 }, { x: 1, z: 2 }, 0.25, 1000).x === 1, '투사체: 직선 스킬샷이 아니면(유도 투사체) 그대로');
}

// 16) 103차: 지터 버퍼 - 늦게 오는 스냅샷이 섞여도 지연이 그만큼 늘고, 그릴 시각은 매끄럽게(한 프레임에 조금씩만) 움직인다
{
  const st = { delay: 70 };
  let host = 0;
  for (let i = 0; i < 40; i++) { host += 33; const late = i % 5 === 0 ? 90 : 0; T._netJitterBuffer(st, host, host + 1000 + late); }
  assert(st.jbBase === 1000 && st.delay >= 33 + 90 && st.delay <= 33 + 90 + 15, '지터 버퍼: 지연 = 늦음의 90번째 값 + 만든 간격 + 10ms');
  realNow = 50000; st.renderOff = st.renderOffTarget - 40;
  const before = st.renderOff; T._netRenderTime(st, 0.1);
  assert(Math.abs(st.renderOff - before - 1) < 1e-9, '지터 버퍼: 목표와 가까우면 시간을 1%만 늦춰 맞춘다(한 번에 튀지 않음)');
  const st2 = { snapQ: [{ t: 100, ents: [], gone: [], at: 49990 }, { t: 200, ents: [], gone: [], at: 49995 }, { t: 300, ents: [], gone: [], at: 49999 }], goneAt: new Map() };
  T._netGuestDrain(st2, 210);
  assert(st2.snapQ.length === 1 && st2.snapQ[0].t === 300, '같은 시간축: 그릴 시각이 지난 스냅샷만 적용한다(나머지는 기다린다)');
  T._netGuestDrain(Object.assign(st2, {}), 0); st2.snapQ[0].at = 48000; T._netGuestDrain(st2, 0);
  assert(st2.snapQ.length === 0, '같은 시간축: 1초 넘게 밀린 것은(화면 멈춤 등) 한꺼번에 적용한다');
}
