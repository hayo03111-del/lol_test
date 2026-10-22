// QA(102차): 온라인 대전 핑 측정 - 인공 지연 없이(LAG=0 기본) 방장·참가자를 잇고 대전 중 참가자 왕복 지연(gping)을 30초 동안 잰다.
// 핑이 시간이 갈수록 쌓이면(보내는 쪽이 받는 쪽보다 빨라 줄이 밀림) 실패. 결과에 연결 방식·스냅샷 크기·초당 횟수·대기열 지연도 남긴다.
//  BW=<바이트/초>(중계 서버 방식만): 좁은 길(받는 쪽마다 초당 그만큼만) - 혼잡 제어가 송신을 줄여 핑이 쌓이지 않아야 한다. RC=0이면 혼잡 제어를 끄고 잰다(비교용, 실패가 정상).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 [NET_MODE=relay|p2p|mqtt PEER_SERVER_DIR=<폴더>] [LAG=0] [BW=12000] [RC=0] node tools/e2e_glb/qa_online_ping.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const startServer = require('./server.js');
const { createRelayServer } = require(path.resolve(__dirname, '../../server/relay.js'));
const LAG = Number(process.env.LAG || 0), BW = Number(process.env.BW || 0), RC = process.env.RC !== '0';
const MODE = ['p2p', 'mqtt'].includes(process.env.NET_MODE) ? process.env.NET_MODE : 'relay';
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  let relay = null, wsUrl = '', peerOpts = null, peerSrv = null, mqttUrl = null, brokerSrv = null;
  const mods = path.join(process.env.PEER_SERVER_DIR || '', 'node_modules');
  if (MODE === 'relay') { relay = createRelayServer({ lagMs: LAG, bwBytesPerSec: BW }); await new Promise((r) => relay.listen(0, '127.0.0.1', r)); wsUrl = `ws://127.0.0.1:${relay.address().port}/ws`; }
  else {
    const { ExpressPeerServer } = require(path.join(mods, 'peer')), express = require(path.join(mods, 'express'));
    const app = express(); peerSrv = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
    app.use('/lolsim', ExpressPeerServer(peerSrv, { path: '/' }));
    peerOpts = { host: '127.0.0.1', port: peerSrv.address().port, path: '/lolsim', secure: false, config: { iceServers: [] } };
    if (MODE === 'mqtt') {
      const aedes = require(path.join(mods, 'aedes'))(), { createServer } = require(path.join(mods, 'aedes-server-factory'));
      brokerSrv = createServer(aedes, { ws: true }); await new Promise((r) => brokerSrv.listen(0, '127.0.0.1', r));
      mqttUrl = `ws://127.0.0.1:${brokerSrv.address().port}/mqtt`;
    }
  }
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errors = [];
  const open = async (champ, tag) => {
    const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    if (MODE !== 'relay') await page.evaluate(([o, lag, mq, mode, tag]) => { window.__netPeerOptions = o; window.__netTestLagMs = lag; window.__netMqttBrokers = mq ? [mq] : []; if (mode === 'mqtt' && tag === 'host') window.__netPeerDisabled = true; }, [peerOpts, LAG, mqttUrl, MODE, tag]);
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, champ);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, champ, { timeout: 60000 });
    await page.waitForTimeout(800);
    return page;
  };
  const host = await open('garen', 'host'), guest = await open('ashe', 'guest');
  const r = { mode: MODE, lag: LAG, bw: BW, rateControl: RC }, fails = [];
  if (!RC) await host.evaluate(() => { window.__netRateControl = false; });
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const realWait = (p, ms) => p.evaluate((ms) => window.__e2e.realWait(ms), ms);
  await host.evaluate((u) => window.netHostCreateRoom(u, '방장'), wsUrl);
  await host.waitForFunction(() => window.netState && window.netState.code, null, { timeout: 20000 });
  const code = await host.evaluate(() => window.netState.code);
  await guest.evaluate(([u, c]) => window.netGuestJoin(u, c, '참가자'), [wsUrl, code]);
  await host.waitForFunction(() => window.netState.pick, null, { timeout: 30000 });
  await guest.waitForFunction(() => window.netState && window.netState.pick, null, { timeout: 30000 });
  await realWait(guest, 600);
  await guest.evaluate(() => window.netPickLock()); await host.evaluate(() => window.netPickLock());
  await guest.waitForFunction(() => window.netState && window.netState.ready, null, { timeout: 90000 });
  await host.waitForFunction(() => window.netState && window.netState.guestReady && !window.netState.locked, null, { timeout: 30000 });
  await host.evaluate(() => window.__e2e.setGameTimeSec(64)); // 미니언이 나와 스냅샷이 커진 상태로
  if (process.env.DIAG) { // 구간별 한 방향 지연(같은 기계라 벽시계가 같다): 참가자→방장(gping), 방장→참가자(스냅샷)
    const hto = await host.evaluate(() => performance.timeOrigin), gto = await guest.evaluate(() => performance.timeOrigin);
    await host.evaluate((gto) => { const st = window.netState, h = st.client.handlers.get('msg'); window.__ow = []; const rn = window.__netRealNow; st.client.handlers.set('msg', (d) => { if (d && d.k === 'gping') window.__ow.push(Math.round(performance.timeOrigin + rn() - (gto + d.at))); h(d); }); }, gto);
    await guest.evaluate((hto) => { const st = window.netState, h = st.client.handlers.get('msg'); window.__ow = []; const rn = window.__netRealNow; st.client.handlers.set('msg', (d) => { if (d && d.k === 'snap') window.__ow.push(Math.round(performance.timeOrigin + rn() - (hto + d.t))); h(d); }); }, hto);
  }
  // 30초 동안 2초마다: 참가자 왕복 지연·스냅샷 지연(대기열)·초당 스냅샷·크기
  r.series = [];
  for (let i = 0; i < 15; i++) {
    await realWait(guest, 2000);
    r.series.push(await guest.evaluate(() => { const st = window.netState; return { rtt: Math.round(st.rtt || 0), q: Math.round(st.queueDelay || 0), hz: st.gapAvg ? Math.round(1000 / st.gapAvg) : null, delay: Math.round(st.delay || 0), rb: st.recvBps }; }));
  }
  if (process.env.DIAG) { r.owGuestToHost = await host.evaluate(() => window.__ow.slice(-15)); r.owHostToGuest = await guest.evaluate(() => window.__ow.slice(-30)); }
  r.host = await host.evaluate(() => { const st = window.netState; return { kind: st.client.kind, avgBytes: Math.round((st.snapBytes || 0) / Math.max(1, st.snapCount || 0)), count: st.snapCount, hz: st.sendHz || null, skipped: st.snapSkipped || 0, congestions: st.congestions || 0, guestQueue: st.guestQueue, budget: st.budget || null, bpsOut: st.bpsOut }; });
  const first = r.series.slice(1, 4).map((x) => x.rtt), last = r.series.slice(-3).map((x) => x.rtt);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  r.rttFirst = Math.round(avg(first)); r.rttLast = Math.round(avg(last));
  check('ping does not pile up over time (no queueing)', r.rttLast <= r.rttFirst * 1.5 + 80);
  if (BW) check('narrow link: ping stays bounded (uncontrolled it grows past 3s here)', r.rttLast <= 2 * LAG + 1000);
  else check('ping stays reasonable for the added lag', r.rttLast <= 2 * LAG + 400);
  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); if (relay) relay.close(); if (brokerSrv) try { brokerSrv.close(); } catch (e) { /* 무시 */ } if (peerSrv) try { peerSrv.close(); } catch (e) { /* 무시 */ }
  process.exit(fails.length ? 1 : 0);
})();
