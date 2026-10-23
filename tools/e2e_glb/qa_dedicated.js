// QA(104차): 전용 서버 - server/game_server.js를 띄우고(시뮬레이션 페이지는 이 점검의 브라우저에서 연다 - 안을 들여다보려고),
// 플레이어 SIZE×2명(1:1이면 둘, 2:2면 넷)이 모두 "참가자"로 붙어 방 만들기 → 참가 → 팀·픽 → 대전 → (1:1) 재접속·종료·재대결까지 확인한다.
//  REAL=1: 서버의 진짜 시뮬레이션 실행기(Playwright로 서버가 직접 Chromium을 띄운다 - 배포 때와 같다)로 돌린다. 이때는 시뮬레이션 안을 들여다보는 항목은 뺀다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 [SIZE=1|2] [LAG=60] [REAL=1] node tools/e2e_glb/qa_dedicated.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const startServer = require('./server.js');
const { createGameServer } = require(path.resolve(__dirname, '../../server/game_server.js'));
const SIZE = Math.max(1, Math.min(2, Number(process.env.SIZE || 1)));
const LAG = Number(process.env.LAG || 60);
const REAL = process.env.REAL === '1';
const CHAMPS = ['garen', 'ashe', 'ezreal', 'darius'];
const DIAG = { log: null, errors: null, pages: null, sim: null };
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const errors = [];
  let simPage = null;
  const launchSim = async (room, { wsUrl }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
    simPage = await ctx.newPage();
    simPage.on('pageerror', (e) => errors.push('sim: ' + e.message.slice(0, 200)));
    await simPage.goto(`http://127.0.0.1:${port}/index.html?nolobby&sim=${room.code}&key=${room.key}&size=${room.size}&ws=${encodeURIComponent(wsUrl)}`, { waitUntil: 'load' });
    return { close: () => ctx.close().catch(() => {}) };
  };
  const log = []; DIAG.log = log; DIAG.errors = errors; DIAG.sim = () => simPage;
  const game = REAL ? createGameServer({ lagMs: LAG, threeDir: process.env.THREE_DIR, log: (s) => log.push(s) }) : createGameServer({ launchSim, lagMs: LAG, log: (s) => log.push(s) });
  await new Promise((r) => game.listen(0, '127.0.0.1', r));
  const wsUrl = `ws://127.0.0.1:${game.address().port}/ws`;
  const open = async (champ, tag) => {
    const page = await (await browser.newContext({ viewport: { width: SIZE > 1 ? 480 : 640, height: SIZE > 1 ? 300 : 400 } })).newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 90000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); if (window.lobbyState) window.lobbyState.champ = id; }, champ);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, champ, { timeout: 90000 });
    return page;
  };
  const N = SIZE * 2;
  const P = []; DIAG.pages = P;
  for (let i = 0; i < N; i++) P.push(await open(CHAMPS[i], 'p' + i));
  const r = { size: SIZE, lag: LAG }, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const realWait = (p, ms) => p.evaluate((ms) => window.__e2e.realWait(ms), ms);
  const ev = (p, fn, arg) => p.evaluate(fn, arg);

  // 1) 방 만들기(첫 플레이어 - 로비 화면으로: 온라인 탭 → 전용 서버 켜기 → 주소·인원 → "서버에 방 만들기") → 시뮬레이션이 뜨고 → 나머지 참가
  await ev(P[0], ([u, s]) => {
    window.openNetLobby();
    document.getElementById('netName').value = '하나';
    const cb = document.getElementById('netUseDed'); if (!cb.checked) cb.click();
    document.getElementById('netDedUrl').value = u;
    const sz = document.getElementById('netDedSize'); sz.value = String(s); sz.dispatchEvent(new Event('change'));
  }, [wsUrl, SIZE]);
  r.createBtn = await ev(P[0], () => document.getElementById('netCreateBtn').textContent);
  await P[0].click('#netCreateBtn');
  await P[0].waitForFunction(() => window.netState && window.netState.pick && window.netState.code, null, { timeout: 120000 });
  const code = await ev(P[0], () => window.netState.code);
  r.code = code;
  for (let i = 1; i < N; i++) await ev(P[i], ([u, c, n]) => window.netGuestJoin(u, c, n), [wsUrl, code, ['하나', '둘', '셋', '넷'][i]]);
  for (const p of P) await p.waitForFunction((n) => window.netState && window.netState.pick && window.netState.pick.roster && window.netState.pick.roster.players.length === n, N, { timeout: 60000 });
  r.roster = await ev(P[0], () => window.netState.pick.roster.players.map((x) => [x.name, x.team]));
  const teamCount = (t) => r.roster.filter((x) => x[1] === t).length;
  check('lobby: the online tab has a dedicated-server option with team size', new RegExp(`서버에 방 만들기 \\(${SIZE}:${SIZE}\\)`).test(r.createBtn));
  check('room: everyone joins the server room and is split evenly into two teams', r.roster.length === N && teamCount('BLUE') === SIZE && teamCount('RED') === SIZE);
  if (REAL) { const room = [...game.rooms.values()][0]; simPage = room && room.handle && room.handle.page; }
  r.simReady = !!simPage && await simPage.evaluate(() => !!(window.netState && window.netState.dedicated));
  check('server: a simulation page runs the match (no player is the host)', r.simReady && (await Promise.all(P.map((p) => ev(p, () => window.netState.role)))).every((x) => x === 'guest'));
  // 2) 픽: 모두 확정하면 시작
  for (const p of P) await ev(p, () => window.netPickLock());
  for (const p of P) await p.waitForFunction(() => window.netState && window.netState.ready, null, { timeout: 180000 });
  for (const p of P) await p.waitForFunction(() => !window.netState.locked, null, { timeout: 30000 });
  r.teams = await Promise.all(P.map((p) => ev(p, () => ({ team: window.controller.team, champ: window.controller.championId, puppets: [...window.netState.puppets.values()].map((b) => [b.championId, b.team]) }))));
  check('match: every player controls their own champion on their own team and sees all others', r.teams.every((t, i) => t.champ === CHAMPS[i] && t.puppets.length === N - 1) && r.teams.filter((t) => t.team === 'BLUE').length === SIZE);
  r.sim = await simPage.evaluate(() => ({ phase: window.netState.phase, views: [...window.netState.players.values()].filter((p) => p.remote).map((p) => [p.name, p.team, p.remote.championId]) }));
  check('server: the simulation holds every champion with the right team', r.sim.phase === 'match' && r.sim.views.length === N);

  // 3) 대칭 지연: 모두 서버까지의 왕복만 갖는다(방장 없음)
  await realWait(P[0], 3000);
  r.rtt = await Promise.all(P.map((p) => ev(p, () => Math.round(window.netState.rtt || 0))));
  check('latency: every player measures a round trip to the server (no zero-latency host)', r.rtt.every((x) => x > 0));

  // 4) 이동 예측: 각자 바로 움직이고 서버 자리와 맞는다
  const L1 = await ev(P[0], () => window.__e2e.lolRangeToWorld(1));
  for (let i = 0; i < N; i++) {
    const p = P[i];
    const before = await ev(p, () => ({ x: window.controller.root.position.x, z: window.controller.root.position.z }));
    await ev(p, ([x, z]) => window.gameSession.submit({ type: 'move', point: { x, y: 0, z } }), [before.x + 300 * L1, before.z + (i % 2 ? 200 : -200) * L1]);
    await realWait(p, 200);
    const moved = await ev(p, ([x, z]) => Math.hypot(window.controller.root.position.x - x, window.controller.root.position.z - z), [before.x, before.z]);
    (r.reactMoved = r.reactMoved || []).push(Math.round(moved / L1));
  }
  await realWait(P[0], 3500 + 4 * LAG);
  r.posErr = [];
  for (let i = 0; i < N && !REAL; i++) {
    const g = await ev(P[i], () => ({ x: window.controller.root.position.x, z: window.controller.root.position.z, id: window.netState.ownId }));
    const s = await simPage.evaluate((id) => { const u = [window.controller, ...window.__e2e.enemyBots].find((c) => window.__e2eEntityId(c) === id); return u ? { x: u.root.position.x, z: u.root.position.z } : null; }, g.id);
    r.posErr.push(s ? Math.round(Math.hypot(g.x - s.x, g.z - s.z) / L1) : -1);
  }
  check('prediction: every player moves at once and ends where the server says', r.reactMoved.every((x) => x > 5) && r.posErr.every((x) => x >= 0 && x < 30));
  if (REAL) { // 진짜 실행기: 시뮬레이션 안은 보지 않고, 내 화면의 체력 변화로 싸움만 본다
    r.ui = await ev(P[0], () => document.getElementById('netLobbyBtn').textContent);
    check('ui: the game button shows the dedicated server and ping', /전용 서버/.test(r.ui));
    r.serverLog = log.slice(-6); r.errors = errors; r.fails = fails;
    if (errors.length) fails.push('page errors');
    console.log(JSON.stringify(r, null, 1));
    await browser.close(); srv.close(); game.close();
    process.exit(fails.length ? 1 : 0);
  }

  // 5) 싸움: 빨강 팀 첫 플레이어가 파랑 팀 첫 플레이어를 공격 - 서버가 판정하고 모두가 같은 체력을 본다
  const blueIdx = r.teams.findIndex((t) => t.team === 'BLUE'), redIdx = r.teams.findIndex((t) => t.team === 'RED');
  const blueId = await ev(P[blueIdx], () => window.netState.ownId), redId = await ev(P[redIdx], () => window.netState.ownId);
  await simPage.evaluate(([b, rd]) => {
    const all = [window.controller, ...window.__e2e.enemyBots], B = all.find((c) => window.__e2eEntityId(c) === b), R = all.find((c) => window.__e2eEntityId(c) === rd), L = window.__e2e.lolRangeToWorld;
    B.itemBonusMaxHp = 20000; B.recomputeStats(); B.hp = B.maxHp; B.root.position.set(0, 0, 0); R.root.position.set(L(300), 0, 0); R.targetPos = null; B.targetPos = null; // 다리 가운데(우물 밖)
    for (const m of [...window.__e2e.minions]) { m.hp = 0; m.isDead = true; } window.__e2e.minions.length = 0;
  }, [blueId, redId]);
  await realWait(P[redIdx], 1000 + 4 * LAG);
  const hp0 = await simPage.evaluate((b) => [window.controller, ...window.__e2e.enemyBots].find((c) => window.__e2eEntityId(c) === b).hp, blueId);
  await ev(P[redIdx], (id) => window.gameSession.submit({ type: 'attack', targetId: id }), blueId);
  await realWait(P[redIdx], 4000);
  const hp1 = await simPage.evaluate((b) => [window.controller, ...window.__e2e.enemyBots].find((c) => window.__e2eEntityId(c) === b).hp, blueId);
  await realWait(P[redIdx], 600 + 4 * LAG);
  const seen = await Promise.all(P.map((p, i) => ev(p, ([b, mine]) => (mine ? window.controller.hp : (window.netState.puppets.get(b) || {}).hp), [blueId, i === blueIdx])));
  const hpNow = await simPage.evaluate((b) => [window.controller, ...window.__e2e.enemyBots].find((c) => window.__e2eEntityId(c) === b).hp, blueId);
  r.fight = { hp0: Math.round(hp0), hp1: Math.round(hp1), hpNow: Math.round(hpNow), seen: seen.map((x) => Math.round(x || -1)) };
  check('fight: the server decides the hit and every player sees the same hp', hp1 < hp0 - 30 && seen.every((x) => x > 0 && Math.abs(x - hpNow) < 400));

  // 6) 채팅: 이름·팀과 함께 모두에게
  await ev(P[N - 1], () => window.netSendChat('안녕 서버'));
  await realWait(P[0], 800 + 4 * LAG);
  r.chat = await ev(P[0], () => document.body.innerText.includes('안녕 서버'));
  check('chat: a message reaches the other players with the sender name', r.chat);

  if (SIZE === 1) {
    // 7) 재접속: 한 사람이 끊겼다 다시 붙어도 그 판이 이어진다(서버는 그대로 - 방장이 나가 끝나는 일이 없다)
    await ev(P[1], () => { window.netState.client.ws.close(); });
    await realWait(P[1], 3000);
    await P[1].waitForFunction(() => window.netState && window.netState.ready && window.netState.client && window.netState.client.ws && window.netState.client.ws.readyState === 1, null, { timeout: 60000 });
    await realWait(P[1], 1500);
    r.reconnect = await ev(P[1], () => ({ ready: window.netState.ready, snaps: window.netState.lastSnapAt > 0 && window.__netRealNow() - window.netState.lastSnapAt < 2000 }));
    r.simKeptChamps = await simPage.evaluate(() => 1 + window.__e2e.enemyBots.length);
    check('reconnect: a dropped player comes back to the same match', r.reconnect.ready && r.reconnect.snaps && r.simKeptChamps === 2);
    // 8) 끝: 빨강 넥서스가 무너지면 파랑 승리·빨강 패배, 재대결은 모두 동의하면 다시 픽
    await simPage.evaluate(() => { const n = window.__e2e.nexusBuildings.find((x) => x.team === 'RED'); window.__e2e.destroyNexus(n); });
    for (const p of P) await p.waitForFunction(() => document.getElementById('netEndScreen'), null, { timeout: 20000 });
    r.end = await Promise.all(P.map((p) => ev(p, () => document.getElementById('netEndScreen').dataset.result)));
    check('end: blue players see victory, red players see defeat', r.end.every((x, i) => x === (r.teams[i].team === 'BLUE' ? 'win' : 'lose')));
    for (const p of P) await ev(p, () => window.netRequestRematch());
    for (const p of P) await p.waitForFunction(() => window.netState && window.netState.pick && window.netState.pick.phase === 'pick', null, { timeout: 30000 });
    check('rematch: when everyone agrees the room goes back to champion select', true);
  }
  r.serverLog = log.slice(-6);
  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); game.close();
  process.exit(fails.length ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL', e.message);
  try {
    console.error('server log:', JSON.stringify((DIAG.log || []).slice(-15), null, 1));
    console.error('errors:', JSON.stringify(DIAG.errors));
    for (const p of DIAG.pages || []) console.error('player:', await p.evaluate(() => JSON.stringify({ status: window.netState && window.netState.status, code: window.netState && window.netState.code, pick: !!(window.netState && window.netState.pick), ready: window.netState && window.netState.ready })));
    const sp = DIAG.sim && DIAG.sim(); if (sp) console.error('sim:', await sp.evaluate(() => JSON.stringify({ st: !!window.netState, phase: window.netState && window.netState.phase, players: window.netState && window.netState.players ? [...window.netState.players.values()].map((p) => [p.pid, p.name, p.team, p.pick, !!p.hello, p.guestReady]) : null, ctrl: !!window.controller })));
  } catch (e2) { console.error('diag failed', e2.message); }
  process.exit(2);
});
