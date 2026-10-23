// 104차 전용 서버(server/game_server.js) 테스트 - 진짜 서버를 띄우고, 시뮬레이션 페이지 대신 가짜 시뮬레이션(웹소켓 클라이언트)을 붙여
// 방 만들기·시뮬레이션 자리(열쇠)·참가·메시지 길(보낸 사람 표시·한 사람/전체에게)·내보내기·끊김·코드 무작위 대입 막기·방 수 제한을 확인한다.
const path = require('path');
const { createGameServer } = require(path.resolve(__dirname, '..', 'server', 'game_server.js'));
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('ok: (이 Node에는 내장 WebSocket이 없어 전용 서버 테스트를 건너뜀)'); return; }
  const launched = [];
  const server = createGameServer({ maxRooms: 2, launchSim: async (room, info) => { launched.push({ room, info }); return { close: () => { launched.find((x) => x.room === room).closed = true; } }; } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
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
  const tx = (ws, o) => ws.send(JSON.stringify(o));
  try {
    const a = await open(), b = await open();
    tx(a, { t: 'dcreate', name: '하나', size: 2 });
    const creating = await next(a, (m) => m.t === 'creating');
    assert(/^[A-Z2-9]{4}$/.test(creating.code) && creating.size === 2, '방 만들기: 코드와 인원(2:2)을 알려 주고 시뮬레이션을 띄운다');
    await new Promise((r) => setTimeout(r, 50));
    const L = launched[0];
    assert(L && L.info.simUrl.includes(`sim=${creating.code}`) && L.info.simUrl.includes(`key=${L.room.key}`) && L.info.simUrl.includes('size=2'), '시뮬레이션 페이지 주소: 방 코드·열쇠·인원·서버 주소');
    // 시뮬레이션 전에 들어온 사람은 기다린다
    tx(b, { t: 'join', code: creating.code.toLowerCase(), name: '둘' });
    await next(b, (m) => m.t === 'creating');
    // 열쇠가 틀리면 시뮬레이션 자리를 못 차지한다
    const fake = await open();
    tx(fake, { t: 'sim', code: creating.code, key: 'wrong' });
    const bad = await next(fake, (m) => m.t === 'error');
    assert(/시뮬레이션 자리가 아님/.test(bad.msg), '시뮬레이션 자리: 열쇠가 틀리면 거절');
    const sim = await open();
    tx(sim, { t: 'sim', code: creating.code, key: L.room.key });
    await next(sim, (m) => m.t === 'created');
    const ja = await next(a, (m) => m.t === 'joined'), jb = await next(b, (m) => m.t === 'joined');
    const pj1 = await next(sim, (m) => m.t === 'peer-join'), pj2 = await next(sim, (m) => m.t === 'peer-join');
    assert(ja.pid && jb.pid && ja.pid !== jb.pid && [pj1.pid, pj2.pid].includes(ja.pid) && [pj1.name, pj2.name].includes('둘'), '시뮬레이션이 붙으면 기다리던 사람들을 들인다(각자 다른 아이디)');
    // 메시지 길
    tx(a, { t: 'msg', d: { k: 'cmd', n: 1 } });
    const fromA = await next(sim, (m) => m.t === 'msg');
    assert(fromA.from === ja.pid && fromA.d.n === 1, '플레이어 → 시뮬레이션: 보낸 사람 아이디가 붙는다');
    tx(sim, { t: 'msg', to: jb.pid, d: { k: 'only-b' } });
    tx(sim, { t: 'msg', d: { k: 'all' } });
    const gb = await next(b, (m) => m.t === 'msg' && m.d.k === 'only-b'), ga = await next(a, (m) => m.t === 'msg' && m.d.k === 'all');
    await new Promise((r) => setTimeout(r, 100));
    assert(gb && ga && !a.inbox.some((m) => m.d && m.d.k === 'only-b'), '시뮬레이션 → 한 사람에게만 / 방 전체에게');
    // 내보내기
    tx(sim, { t: 'kick', pid: jb.pid, msg: '방이 가득 참' });
    const kicked = await next(b, (m) => m.t === 'error');
    assert(kicked.msg === '방이 가득 참', '시뮬레이션이 플레이어를 내보낸다');
    // 끊김 → 시뮬레이션에 알림
    a.close();
    const left = await next(sim, (m) => m.t === 'peer-leave');
    assert(left.pid === ja.pid, '플레이어가 끊기면 시뮬레이션에 알린다(판은 서버에 남는다)');
    // 방 수 제한
    const d1 = await open(), d2 = await open();
    tx(d1, { t: 'dcreate', name: 'x', size: 1 }); await next(d1, (m) => m.t === 'creating');
    tx(d2, { t: 'dcreate', name: 'y', size: 1 });
    const full = await next(d2, (m) => m.t === 'error');
    assert(/꽉 찼습니다/.test(full.msg), '동시에 돌릴 판 수(MAX_ROOMS)를 넘으면 거절');
    // 시뮬레이션이 끊기면 방이 닫힌다
    const b2 = await open(); tx(b2, { t: 'join', code: creating.code, name: '다시' }); await next(b2, (m) => m.t === 'joined');
    sim.close();
    const closed = await next(b2, (m) => m.t === 'room-closed');
    assert(closed && !server.rooms.has(creating.code) && L.closed, '시뮬레이션이 멈추면 방을 닫고 페이지도 닫는다');
    // 코드 무작위 대입 막기
    const c = await open();
    for (let i = 0; i < 10; i++) { tx(c, { t: 'join', code: 'ZZZ' + 'ABCDEFGHJK'[i], name: 'x' }); await next(c, (m) => m.t === 'error'); }
    tx(c, { t: 'join', code: creating.code, name: 'x' });
    const limited = await next(c, (m) => m.t === 'error');
    assert(/너무 많이/.test(limited.msg), '틀린 코드를 1분에 10번 넘게 넣으면 막는다(맞는 코드도)');
    const st = await fetch(`http://127.0.0.1:${server.address().port}/status`).then((r) => r.json());
    assert(st.kind === 'dedicated' && st.maxRooms === 2, '/status: 전용 서버임과 방 수를 알려 준다(로비가 주소를 저절로 채운다)');
    for (const w of [b, c, d1, d2, b2, fake]) try { w.close(); } catch (e) { /* 무시 */ }
  } catch (e) {
    console.error('FAIL:', e.message); process.exitCode = 1;
  } finally {
    server.close();
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  }
})();
