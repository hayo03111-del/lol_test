// QA(97차): 온라인 1:1 대전 - 실제 중계 서버(server/relay.js)를 띄우고 브라우저 두 개(방장·참가자)를 연결해 확인한다.
// 방 만들기·참가 → 참가자 챔피언이 방장 쪽 원격 챔피언으로 생김, 참가자 화면 = 빨강 팀·시뮬레이션 꺼짐, ID 일치(구조물·챔피언),
// 이동 명령, 상점 구매(방장이 판정), 미니언 동기화, 평타·스킬 명령으로 방장 챔피언에게 피해, 투사체 표시, 체력 동기화, 나가기.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_online_check.js  (실패 항목이 있으면 종료 코드 1)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const startServer = require('./server.js');
const { createRelayServer } = require(path.resolve(__dirname, '../../server/relay.js'));
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const relay = createRelayServer(); await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const wsUrl = `ws://127.0.0.1:${relay.address().port}/ws`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (champ, tag) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, champ);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, champ, { timeout: 60000 });
    await page.waitForTimeout(800);
    return page;
  };
  const host = await open('garen', 'host'), guest = await open('ashe', 'guest');
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const realWait = (p, ms) => p.evaluate((ms) => window.__e2e.realWait(ms), ms);

  // 1) 방 만들기 → 참가 → 대전 시작
  await host.evaluate((u) => window.netHostCreateRoom(u, '방장'), wsUrl);
  await host.waitForFunction(() => window.netState && window.netState.code, null, { timeout: 10000 });
  const code = await host.evaluate(() => window.netState.code);
  await guest.evaluate(([u, c]) => window.netGuestJoin(u, c, '참가자'), [wsUrl, code]);
  await guest.waitForFunction(() => window.netState && window.netState.ready, null, { timeout: 90000 });
  await host.waitForFunction(() => window.netState && window.netState.guestReady, null, { timeout: 10000 });
  await realWait(guest, 1500);
  r.setup = {
    host: await host.evaluate(() => { const E = window.__e2e, b = E.enemyBots[0]; return { bots: E.enemyBots.length, champ: b && b.championId, team: b && b.team, remote: !!(b && b.isRemote), brain: !!(b && b.brain), id: b && window.__e2eEntityId(b), hostId: window.__e2eEntityId(window.controller), dummies: E.dummies.length, structIds: [...E.turrets, ...E.inhibitorBuildings, ...E.nexusBuildings].map((s) => window.__e2eEntityId(s)).sort((a, b) => a - b) }; }),
    guest: await guest.evaluate(() => { const E = window.__e2e, c = window.controller, p = E.enemyBots[0]; return { mode: window.netGuestMode, team: c.team, champ: c.championId, id: window.__e2eEntityId(c), puppet: p && p.championId, puppetTeam: p && p.team, puppetId: p && window.__e2eEntityId(p), view: E.visionSystem.viewTeam, session: window.gameSession.kind, dummies: E.dummies.length, structIds: [...E.turrets, ...E.inhibitorBuildings, ...E.nexusBuildings].map((s) => window.__e2eEntityId(s)).sort((a, b) => a - b) }; }),
  };
  const H = r.setup.host, G = r.setup.guest;
  check('host: guest champion is a remote RED champion without AI', H.bots === 1 && H.champ === 'ashe' && H.team === 'RED' && H.remote && !H.brain && H.dummies === 0);
  check('guest: simulation off, RED team, host puppet BLUE, remote session', G.mode && G.team === 'RED' && G.champ === 'ashe' && G.puppet === 'garen' && G.puppetTeam === 'BLUE' && G.view === 'RED' && G.session === 'remote' && G.dummies === 0);
  check('ids: champions and structures share host ids', G.id === H.id && G.puppetId === H.hostId && JSON.stringify(G.structIds) === JSON.stringify(H.structIds) && H.structIds.length > 5);

  // 2) 상점: 분수에서 산 아이템·골드가 방장 판정으로 바뀌고 참가자 화면에 온다
  const gold0 = await host.evaluate(() => window.__e2e.enemyBots[0].gold);
  await guest.evaluate(() => window.gameSession.submit({ type: 'buyItem', itemId: 'longSword' }));
  await realWait(guest, 600);
  r.shop = { gold0, hostGold: await host.evaluate(() => window.__e2e.enemyBots[0].gold), hostItem: await host.evaluate(() => (window.__e2e.enemyBots[0].items || []).some((i) => i && i.id === 'longSword')),
    guestGold: await guest.evaluate(() => window.controller.gold), guestItem: await guest.evaluate(() => (window.controller.items || []).some((i) => i && i.id === 'longSword')) };
  check('shop: buy command applied by host and reflected on guest', r.shop.hostGold < gold0 && r.shop.hostItem && r.shop.guestItem && Math.abs(r.shop.guestGold - r.shop.hostGold) < 30);

  // 3) 이동: 참가자 명령으로 방장 쪽 챔피언이 움직이고, 참가자 화면도 따라간다
  const before = await host.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; return { x: p.x, z: p.z }; });
  await guest.evaluate(() => { const c = window.controller, L = window.__e2e.lolRangeToWorld, p = c.root.position; window.gameSession.submit({ type: 'move', point: { x: p.x, y: 0, z: p.z - L(700) } }); });
  await realWait(guest, 2500);
  r.move = await Promise.all([host.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; return { x: p.x, z: p.z }; }), guest.evaluate(() => { const p = window.controller.root.position; return { x: p.x, z: p.z }; })]);
  const L1 = await host.evaluate(() => window.__e2e.lolRangeToWorld(1));
  const moved = Math.hypot(r.move[0].x - before.x, r.move[0].z - before.z) / L1, gap = Math.hypot(r.move[0].x - r.move[1].x, r.move[0].z - r.move[1].z) / L1;
  r.moveLol = { moved: Math.round(moved), gap: Math.round(gap) };
  check('move: guest command moves host-side champion, guest view follows', moved > 400 && gap < 250);

  // 4) 미니언: 방장 게임 시간을 웨이브 시각으로 - 참가자 화면에도 같은 ID로 생긴다
  await host.evaluate(() => window.__e2e.setGameTimeSec(64));
  await realWait(guest, 5000);
  r.minions = await Promise.all([host.evaluate(() => window.__e2e.minions.filter((m) => !m.isDead).map((m) => window.__e2eEntityId(m)).sort((a, b) => a - b)), guest.evaluate(() => window.__e2e.minions.filter((m) => !m.isDead).map((m) => window.__e2eEntityId(m)).sort((a, b) => a - b))]);
  const common = r.minions[0].filter((id) => r.minions[1].includes(id)).length;
  r.minionCounts = { host: r.minions[0].length, guest: r.minions[1].length, common };
  check('minions: guest shows host minions with the same ids', r.minions[0].length >= 6 && common >= r.minions[0].length - 3);
  delete r.minions;

  // 5) 전투: 방장 챔피언을 참가자 챔피언 앞으로 옮기고, 참가자가 평타·W 명령 - 방장 챔피언 체력이 줄고 참가자 화면에도 같은 체력
  await host.evaluate(() => { const E = window.__e2e, c = window.controller, b = E.enemyBots[0], L = E.lolRangeToWorld; c.root.position.set(b.root.position.x, 0, b.root.position.z - L(450)); c.targetPos = null; c.itemBonusMaxHp = 20000; c.recomputeStats(); c.hp = c.maxHp; E.applyStatus(c, { id: 'e2eHold', type: 'STUN', duration: 8 }); b.mp = b.maxMp; b.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; });
  await realWait(guest, 800);
  const hp0 = await host.evaluate(() => window.controller.hp);
  let projSeen = 0;
  await guest.evaluate((id) => window.gameSession.submit({ type: 'attack', targetId: id }), H.hostId);
  for (let i = 0; i < 10; i++) { await realWait(guest, 250); projSeen = Math.max(projSeen, await guest.evaluate(() => window.netState.proj.size)); }
  await guest.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; window.gameSession.submit({ type: 'cast', slot: 'W', point: { x: p.x, y: 0, z: p.z } }); });
  for (let i = 0; i < 8; i++) { await realWait(guest, 250); projSeen = Math.max(projSeen, await guest.evaluate(() => window.netState.proj.size)); }
  await realWait(guest, 600);
  r.fight = { hp0: Math.round(hp0), hostHp: Math.round(await host.evaluate(() => window.controller.hp)), guestSeesHp: Math.round(await guest.evaluate(() => window.__e2e.enemyBots[0].hp)), projSeen,
    wCast: await host.evaluate(() => window.__e2e.enemyBots[0].cooldowns.W > 0), guestCd: await guest.evaluate(() => window.controller.cooldowns.W > 0) };
  check('fight: guest attack/W damage host champion (host decides)', r.fight.hostHp < r.fight.hp0 - 50 && r.fight.wCast);
  check('fight: guest sees host hp, its own cooldown and projectiles', Math.abs(r.fight.guestSeesHp - r.fight.hostHp) < 300 && r.fight.guestCd && r.fight.projSeen > 0);

  if (process.env.SHOT) { await guest.screenshot({ path: process.env.SHOT + '_guest.png' }); await host.screenshot({ path: process.env.SHOT + '_host.png' }); } // SHOT=<경로 접두어>: 두 화면 저장

  // 6) 동작 클립: 참가자 화면의 내 챔피언이 방장 쪽과 같은 클립을 튼다
  // 참가자 화면은 약 0.11초 늦게 그린다 - 몇 번 재서 한 번이라도 같으면 통과.
  r.clip = [];
  await guest.evaluate((id) => window.gameSession.submit({ type: 'attack', targetId: id }), H.hostId);
  for (let i = 0; i < 12; i++) {
    const pair = await Promise.all([host.evaluate(() => window.__e2e.enemyBots[0].currentClipKey), guest.evaluate(() => window.controller.currentClipKey)]);
    r.clip.push(pair.join('/'));
    if (pair[0] && pair[0] === pair[1]) break;
    await realWait(guest, 150);
  }
  check('animation: guest plays the host-side clip', r.clip.some((x) => { const [a, b] = x.split('/'); return a && a === b; }));
  r.summoners = await guest.evaluate(() => ({ now: Math.round(performance.now()), s: JSON.parse(JSON.stringify(window.controller.summoners)), ui: [...document.querySelectorAll('#spellBar .cd')].map((e) => e.style.display + ':' + e.textContent) }));
  check('summoners: guest D/F shown ready', r.summoners.ui.every((x) => x.startsWith('none')));

  // 7) 나가기: 참가자가 끊기면 방장 쪽 원격 챔피언이 사라진다
  await guest.close();
  await host.waitForFunction(() => window.__e2e.enemyBots.length === 0, null, { timeout: 10000 }).catch(() => {});
  r.leave = await host.evaluate(() => ({ bots: window.__e2e.enemyBots.length, code: window.netState && window.netState.code }));
  check('leave: guest disconnect removes the remote champion, room stays', r.leave.bots === 0 && r.leave.code === code);
  await host.evaluate(() => window.netLeave());
  r.closed = await host.evaluate(() => window.netState === null);
  check('leave: host closes the room', r.closed);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); relay.close();
  process.exit(fails.length ? 1 : 0);
})();
