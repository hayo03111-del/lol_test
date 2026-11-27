// QA(105차): 온라인 대전에서 쉔 - 참가자(쉔)가 스킬을 쓰면 방장(서버)이 판정하고, 참가자 화면에 영혼의 검이 복제되는지.
// (아래 머리는 qa_online_feel.js와 같은 방 만들기·픽 흐름)
// 원래 설명: 온라인 대전 체감 점검 - 참가자 화면을 프레임마다 기록해 "덜컥거림"을 숫자로 잰다.
//  A) 내 챔피언 걷기(긴 직선·맵 밖 클릭·미니언 무리 통과): 보정 횟수·순간 이동·뒤로 밀림·멈춘 뒤 방장 자리와의 차이
//  B) 상대 챔피언 걷기(방장이 왕복): 참가자 화면에서 멈칫(속도 30% 미만)·튐(250% 초과) 프레임 비율, 걷기/대기 동작 어긋남
//  C) 걷는 중 둔화·기절(풀리면 기억한 이동을 이어 감)
//  D) 미니언 공격(추격 → 평타)
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 [LAG=60] node tools/e2e_glb/qa_online_feel.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const startServer = require('./server.js');
const { createRelayServer } = require(path.resolve(__dirname, '../../server/relay.js'));
const LAG = Number(process.env.LAG || 60);
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const relay = createRelayServer({ lagMs: LAG }); await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const wsUrl = `ws://127.0.0.1:${relay.address().port}/ws`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (champ, tag) => {
    const page = await (await browser.newContext({ viewport: { width: Number(process.env.VW || 640), height: Number(process.env.VH || 400) } })).newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, champ);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, champ, { timeout: 60000 });
    await page.waitForTimeout(800);
    return page;
  };
  const host = await open('garen', 'host'), guest = await open('shen', 'guest');
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
  for (const p of [host, guest]) await p.evaluate(() => { const b = window.__e2e.brushSystem; if (b && b.brushes) b.brushes.length = 0; });
  await host.evaluate(() => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, b = E.enemyBots[0];
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.itemBonusMaxHp = 20000; c.recomputeStats(); c.hp = c.maxHp;
    c.root.position.set(L(300), 0, 0); c.targetPos = null; b.root.position.set(L(-300), 0, 0); b.targetPos = null;
    b.skillLevels = { Q: 5, W: 5, E: 5, R: 1 }; b.mp = b.maxMp;
  });
  await realWait(guest, 1500 + 4 * LAG);
  const L1 = await guest.evaluate(() => window.__e2e.lolRangeToWorld(1));
  // 1) 참가자 화면에 영혼의 검(방장이 만든 메시를 복제)이 보인다
  r.blade = await guest.evaluate(() => { const st = window.netState; return { mirrors: st.mirrors ? st.mirrors.size : 0, champ: window.controller.championId }; });
  check('guest: plays Shen and sees the Spirit Blade mirrored from the host', r.blade.champ === 'shen' && r.blade.mirrors >= 1);
  // 2) 참가자 E → 방장 화면의 가렌이 피해·도발, 참가자 기력이 줄었다가 회복
  const hostId = await guest.evaluate(() => window.netState.hostPuppet && window.__e2eEntityId(window.netState.hostPuppet));
  const hp0 = await host.evaluate(() => window.controller.hp);
  await guest.evaluate(([x]) => window.gameSession.submit({ type: 'cast', slot: 'E', point: { x, y: 0, z: 0 } }), [300 * L1]);
  await realWait(guest, 1200 + 4 * LAG);
  r.E = await host.evaluate((hp0) => { const c = window.controller, b = window.__e2e.enemyBots[0]; return { dmg: Math.round(hp0 - c.hp), taunted: !!(c.statusEffects || []).find((s) => s.type === 'TAUNT'), botE: b.cooldowns.E > 0, botShield: Math.round(b.shield || 0) }; }, hp0);
  r.guestE = await guest.evaluate(() => ({ cdE: window.controller.cooldowns.E > 0, mp: Math.round(window.controller.mp) }));
  check('guest E: the host decides it - Garen is damaged and taunted, the guest sees the cooldown', r.E.dmg > 30 && r.E.taunted && r.E.botE && r.guestE.cdE);
  // 3) 참가자 Q → 검이 돌아오면 강화 평타 3회(방장 쪽 상태가 참가자 내부 상태로 동기화)
  await host.evaluate(() => { const b = window.__e2e.enemyBots[0]; b.cooldowns.Q = 0; b.mp = b.maxMp; });
  await realWait(guest, 600 + 4 * LAG);
  await host.evaluate(() => { const b = window.__e2e.enemyBots[0], E = window.__e2e; window.__qtl = []; const t0 = E.gameNow(); const iv = setInterval(() => { const s = b._shen; window.__qtl.push([Math.round(E.gameNow() - t0), !!s.recall, s.qAttacks, s.blade ? Math.round(E.worldDistanceToLol(Math.hypot(s.blade.x - b.root.position.x, s.blade.z - b.root.position.z))) : null, b.currentActionKey, b.state]); if (window.__qtl.length > 30) clearInterval(iv); }, 100); });
  await guest.evaluate(() => window.gameSession.submit({ type: 'cast', slot: 'Q' }));
  await realWait(guest, 1500 + 4 * LAG);
  r.qtl = await host.evaluate(() => window.__qtl);
  r.Q = { host: await host.evaluate(() => window.__e2e.enemyBots[0]._shen.qAttacks), guest: await guest.evaluate(() => (window.controller._shen || {}).qAttacks),
    hostCd: await host.evaluate(() => window.__e2e.enemyBots[0].cooldowns.Q), hostMp: await host.evaluate(() => Math.round(window.__e2e.enemyBots[0].mp)), recall: await host.evaluate(() => !!window.__e2e.enemyBots[0]._shen.recall),
    lv: await host.evaluate(() => JSON.stringify(window.__e2e.enemyBots[0].skillLevels)), qUntil: await host.evaluate(() => window.__e2e.enemyBots[0]._shen.qUntil > 0) };
  check('guest Q: empowered attacks start on the host and the guest sees the same state', r.Q.host > 0 && r.Q.guest === r.Q.host);
  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); relay.close();
  process.exit(fails.length ? 1 : 0);
})();
