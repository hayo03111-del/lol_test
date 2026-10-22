// 97차 중계 서버 테스트 - 실제 server/relay.js를 띄우고 Node 내장 WebSocket 클라이언트 둘로 방 만들기·참가·중계·나가기·정적 파일을 확인한다.
const path = require('path');
const http = require('http');
const { createRelayServer } = require(path.resolve(__dirname, '..', 'server', 'relay.js'));
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('ok: (이 Node에는 내장 WebSocket이 없어 중계 테스트를 건너뜀)'); return; }
  const server = createRelayServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `ws://127.0.0.1:${port}/ws`;
  const open = () => new Promise((res, rej) => {
    const ws = new WebSocket(url); ws.inbox = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data); ws.inbox.push(m); if (ws.waiter && ws.waiter.pred(m)) { const w = ws.waiter; ws.waiter = null; w.res(m); } };
    ws.onopen = () => res(ws); ws.onerror = rej;
  });
  const next = (ws, pred, ms = 2000) => new Promise((res, rej) => {
    const hit = ws.inbox.find(pred); if (hit) { ws.inbox.splice(ws.inbox.indexOf(hit), 1); return res(hit); }
    ws.waiter = { pred, res: (m) => { ws.inbox.splice(ws.inbox.indexOf(m), 1); res(m); } };
    setTimeout(() => rej(new Error('시간 초과')), ms);
  });
  try {
    const host = await open(), guest = await open();
    host.send(JSON.stringify({ t: 'create', name: '하요' }));
    const created = await next(host, (m) => m.t === 'created');
    assert(/^[A-Z2-9]{4}$/.test(created.code), '방 만들기: 4자리 코드');
    guest.send(JSON.stringify({ t: 'join', code: created.code.toLowerCase(), name: '친구' }));
    const joined = await next(guest, (m) => m.t === 'joined');
    const pj = await next(host, (m) => m.t === 'peer-join');
    assert(joined.host.name === '하요' && pj.name === '친구', '참가: 게스트는 방장 이름을, 방장은 참가 알림을 받는다(코드 대소문자 무관)');
    const third = await open();
    third.send(JSON.stringify({ t: 'join', code: created.code }));
    assert((await next(third, (m) => m.t === 'error')).msg === '방이 가득 참', '참가: 1:1 방에 셋째는 들어갈 수 없다');
    third.close();
    guest.send(JSON.stringify({ t: 'msg', d: { k: 'cmd', cmd: { type: 'move', point: { x: 1, y: 0, z: 2 } } } }));
    const m1 = await next(host, (m) => m.t === 'msg');
    assert(m1.d.k === 'cmd' && m1.d.cmd.point.z === 2, '중계: 게스트 → 방장 메시지가 그대로 간다');
    const big = { k: 'snap', ents: Array.from({ length: 300 }, (_, i) => ({ id: i, pos: { x: i, y: 0, z: -i }, hp: 500 })) };
    host.send(JSON.stringify({ t: 'msg', d: big }));
    const m2 = await next(guest, (m) => m.t === 'msg');
    assert(m2.d.ents.length === 300 && m2.d.ents[299].pos.z === -299, '중계: 큰 스냅샷(64KB 넘는 프레임)도 그대로 간다');
    // 98차: 방장이 참가자를 내보낼 수 있다(kick) - 그 뒤 다시 참가할 수 있다.
    host.send(JSON.stringify({ t: 'kick' }));
    assert((await next(guest, (m) => m.t === 'error')).msg === '방장이 참가를 거절했습니다' && !server.rooms.get(created.code).guest, '내보내기: 방장이 참가자를 방에서 뺀다');
    guest.send(JSON.stringify({ t: 'join', code: created.code, name: '친구' }));
    await next(guest, (m) => m.t === 'joined'); await next(host, (m) => m.t === 'peer-join');
    host.send(JSON.stringify({ t: 'ping', at: 123 }));
    assert((await next(host, (m) => m.t === 'pong')).at === 123, '지연 측정: ping → pong');
    guest.close();
    await next(host, (m) => m.t === 'peer-leave');
    assert(true, '나가기: 게스트가 끊기면 방장이 알림을 받는다');
    const g2 = await open();
    g2.send(JSON.stringify({ t: 'join', code: created.code }));
    await next(g2, (m) => m.t === 'joined');
    host.close();
    await next(g2, (m) => m.t === 'room-closed');
    assert(!server.rooms.has(created.code), '방 닫기: 방장이 나가면 게스트에게 알리고 방을 지운다');
    g2.close();
    const page = await new Promise((res) => http.get(`http://127.0.0.1:${port}/`, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => res({ code: r.statusCode, b })); }));
    assert(page.code === 200 && /<html/i.test(page.b), '정적 파일: 같은 주소에서 게임 페이지(index.html)를 내보낸다');
    const bad = await new Promise((res) => http.get(`http://127.0.0.1:${port}/../../etc/passwd`, (r) => res(r.statusCode)));
    assert(bad === 403 || bad === 404, '정적 파일: 저장소 밖 경로는 내보내지 않는다');
    // 98차: 인공 지연(lagMs) - 메시지가 그만큼 늦게, 보낸 순서대로 간다.
    const lag = createRelayServer({ lagMs: 150 });
    await new Promise((r) => lag.listen(0, '127.0.0.1', r));
    const lurl = `ws://127.0.0.1:${lag.address().port}/ws`;
    const openAt = (u) => new Promise((res, rej) => { const ws = new WebSocket(u); ws.inbox = []; ws.onmessage = (e) => { const m = JSON.parse(e.data); m._at = Date.now(); ws.inbox.push(m); if (ws.waiter && ws.waiter.pred(m)) { const w = ws.waiter; ws.waiter = null; w.res(m); } }; ws.onopen = () => res(ws); ws.onerror = rej; });
    const h2 = await openAt(lurl), g2b = await openAt(lurl);
    h2.send(JSON.stringify({ t: 'create' })); const c2 = await next(h2, (m) => m.t === 'created');
    g2b.send(JSON.stringify({ t: 'join', code: c2.code })); await next(g2b, (m) => m.t === 'joined');
    const sentAt = Date.now();
    for (let i = 0; i < 3; i++) g2b.send(JSON.stringify({ t: 'msg', d: { n: i } }));
    const got = [await next(h2, (m) => m.t === 'msg' && m.d.n === 0), await next(h2, (m) => m.t === 'msg' && m.d.n === 1), await next(h2, (m) => m.t === 'msg' && m.d.n === 2)];
    assert(got[0]._at - sentAt >= 140 && got[0]._at <= got[1]._at && got[1]._at <= got[2]._at, '인공 지연: 메시지가 지연만큼 늦게, 순서대로 간다');
    h2.close(); g2b.close(); lag.close();
  } catch (e) {
    console.error('FAIL:', e.message); process.exitCode = 1;
  } finally {
    server.close();
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  }
})();

