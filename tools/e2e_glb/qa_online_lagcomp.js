// QA(101차): 온라인 대전 지연 보정·시전 동작 예측 - 중계 서버(인공 지연 한쪽 LAG ms)로 방장(가렌)·참가자(이즈리얼)를 잇고 확인한다.
//  1) 지연 보정: 방장 챔피언이 옆으로 계속 걷는다. 참가자는 "자기 화면에 보이는" 상대 위치와 속도로 앞을 내다보고(시전 시간 + 비행 시간)
//     이즈리얼 Q를 쏜다 - 사람이 화면을 보고 하는 그대로. 보정을 켜면 맞고, 끄면(방장 window.__netLagComp = false) 대부분 빗나가야 한다.
//  2) 시전 동작 예측: 같은 스킬을 두 번째 쓸 때는 명령을 보내는 순간 참가자 화면에서 바로 시전 동작이 나온다(첫 번째에 방장 클립을 배운다).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 [LAG=150] node tools/e2e_glb/qa_online_lagcomp.js  (실패 항목이 있으면 종료 코드 1)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const startServer = require('./server.js');
const { createRelayServer } = require(path.resolve(__dirname, '../../server/relay.js'));
const LAG = Number(process.env.LAG || 150);
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const relay = createRelayServer({ lagMs: LAG }); await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const wsUrl = `ws://127.0.0.1:${relay.address().port}/ws`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (champ, tag) => {
    const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, champ);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, champ, { timeout: 60000 });
    await page.waitForTimeout(800);
    return page;
  };
  const host = await open('garen', 'host'), guest = await open('ezreal', 'guest');
  const r = { lag: LAG }, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const realWait = (p, ms) => p.evaluate((ms) => window.__e2e.realWait(ms), ms);

  await host.evaluate((u) => window.netHostCreateRoom(u, '방장'), wsUrl);
  await host.waitForFunction(() => window.netState && window.netState.code, null, { timeout: 10000 });
  const code = await host.evaluate(() => window.netState.code);
  await guest.evaluate(([u, c]) => window.netGuestJoin(u, c, '참가자'), [wsUrl, code]);
  await host.waitForFunction(() => window.netState.pick, null, { timeout: 15000 });
  await guest.waitForFunction(() => window.netState && window.netState.pick, null, { timeout: 15000 });
  await realWait(guest, 3 * LAG + 300);
  await guest.evaluate(() => window.netPickLock()); await host.evaluate(() => window.netPickLock());
  await guest.waitForFunction(() => window.netState && window.netState.ready, null, { timeout: 90000 });
  await host.waitForFunction(() => window.netState && window.netState.guestReady && !window.netState.locked, null, { timeout: 30000 });
  await guest.waitForFunction(() => !window.netState.locked, null, { timeout: 15000 });
  await realWait(guest, 2000);

  // 무대: 미니언 없음, 다리 가운데. 참가자(이즈리얼)는 x = -450, 방장(가렌)은 x = +350에서 z 방향으로 왕복
  await host.evaluate(() => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, b = E.enemyBots[0];
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.itemBonusMaxHp = 60000; c.recomputeStats(); c.hp = c.maxHp;
    c.root.position.set(L(350), 0, L(-500)); c.targetPos = null;
    b.root.position.set(L(-450), 0, 0); b.targetPos = null; b.skillLevels.Q = 5;
    window.__walk = true;
    const leg = () => { if (!window.__walk) return; const z = c.root.position.z < 0 ? L(500) : L(-500); c.moveTo(new E.THREE.Vector3(L(350), 0, z)); };
    leg(); window.__walkTimer = window.__e2e.realWait; // 자리 표시
    window.__walkIv = setInterval(() => { const p = c.root.position; if (!c.targetPos || Math.abs(p.z) >= L(495)) leg(); }, 100);
  });
  await realWait(guest, 2500);

  // 참가자: 화면에 보이는 상대의 위치·속도로 내다보고 쏜다(시전 시간 + 비행 시간). 방향이 바뀌는 끝 부분 근처에서는 쏘지 않는다.
  const shoot = async (n) => {
    let hits = 0, shots = 0;
    for (let i = 0; i < n * 3 && shots < n; i++) {
      await host.evaluate(() => { const b = window.__e2e.enemyBots[0]; b.cooldowns.Q = 0; b.mp = b.maxMp; });
      await realWait(guest, 3 * LAG + 200);
      const aim = await guest.evaluate(async () => {
        const E = window.__e2e, L = E.lolRangeToWorld, p = E.enemyBots[0].root.position, me = window.controller.root.position;
        const a = { x: p.x, z: p.z, t: performance.now() };
        await E.realWait(150);
        const b = { x: p.x, z: p.z, t: performance.now() };
        const dt = Math.max(1, b.t - a.t) / 1000, vz = (b.z - a.z) / dt;
        const q = window.controller._champData().Q;
        const dist = Math.hypot(b.x - me.x, b.z - me.z);
        const lead = (q.castTimeSec || 0.25) + dist / L(q.missileSpeed || 2000);
        const tz = b.z + vz * lead;
        if (Math.abs(vz) < L(150) || Math.abs(tz) > L(430)) return null; // 멈춰 있거나 곧 방향이 바뀐다
        window.gameSession.submit({ type: 'cast', slot: 'Q', point: { x: b.x, y: 0, z: tz } });
        return { tz: tz / L(1), vz: vz / L(1) };
      });
      if (!aim) { await realWait(guest, 200); continue; }
      shots++;
      const hp0 = await host.evaluate(() => window.controller.hp);
      await realWait(host, 1400 + 2 * LAG);
      const hp1 = await host.evaluate(() => window.controller.hp);
      if (hp1 < hp0 - 5) hits++;
    }
    return { hits, shots };
  };
  r.on = await shoot(5);
  r.onUses = await host.evaluate(() => ({ uses: window.netState.lagCompUses || 0, ms: window.netLagCompMs ? window.netLagCompMs() : null }));
  await host.evaluate(() => { window.__netLagComp = false; });
  r.off = await shoot(5);
  await host.evaluate(() => { window.__netLagComp = true; window.__walk = false; clearInterval(window.__walkIv); });
  check('lag compensation: leading shots on what the guest sees hit (most)', r.on.shots >= 4 && r.on.hits >= r.on.shots - 1);
  check('lag compensation: clearly better than without it', r.on.hits > r.off.hits);

  // 시전 동작 예측: 이미 Q를 썼으니 클립을 배웠다 - 명령을 보내는 그 자리에서 시전 동작이 시작된다
  await host.evaluate(() => { const b = window.__e2e.enemyBots[0]; b.cooldowns.Q = 0; b.mp = b.maxMp; });
  await realWait(guest, 3 * LAG + 300);
  r.castPredict = await guest.evaluate(() => {
    const c = window.controller, before = c.currentClipKey, p = c.root.position;
    window.gameSession.submit({ type: 'cast', slot: 'Q', point: { x: p.x + 5, y: 0, z: p.z } });
    return { before, after: c.currentClipKey, predicted: window.netState.predictedClip && window.netState.predictedClip.name };
  });
  await realWait(guest, 3 * LAG + 600);
  r.castPredict.hostClip = await host.evaluate(() => window.__e2e.enemyBots[0].currentClipKey);
  check('cast prediction: second cast plays the learned cast clip immediately', !!r.castPredict.predicted && r.castPredict.after === r.castPredict.predicted && r.castPredict.after !== r.castPredict.before);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); relay.close();
  process.exit(fails.length ? 1 : 0);
})();
