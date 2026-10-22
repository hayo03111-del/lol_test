// QA(97·98차): 온라인 1:1 대전 - 실제 중계 서버(server/relay.js, 인공 지연 한쪽 LAG ms)를 띄우고 브라우저 두 개(방장·참가자)를 연결해 확인한다.
// 97차: 참가 → 원격 챔피언·빨강 팀·ID 일치, 상점, 미니언 동기화, 평타·스킬 피해, 투사체, 동작, 나가기.
// 98차: 로비 주문 전달, 카운트다운(그동안 명령 막힘), 대전 중 연습 도구·일시정지 잠금, 내 챔피언 즉시 반응(예측)과 수렴, 추격 예측,
//       연출 복제, 와드 동기화, 처치·죽음, 끊긴 뒤 자동 재접속, 백그라운드 방장 시뮬레이션, 승패 화면·재대결.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 [LAG=150] [SHOT=<경로 접두어>] node tools/e2e_glb/qa_online_check.js  (실패 항목이 있으면 종료 코드 1)
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
  const r = { lag: LAG }, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const realWait = (p, ms) => p.evaluate((ms) => window.__e2e.realWait(ms), ms);
  const L1 = await host.evaluate(() => window.__e2e.lolRangeToWorld(1));
  const pos = (p, expr) => p.evaluate((e) => { const o = eval(e); const q = o.root.position; return { x: q.x, z: q.z }; }, expr);
  const distLol = (a, b) => Math.round(Math.hypot(a.x - b.x, a.z - b.z) / L1);

  // 0) 참가자 로비 선택: F 주문을 바꿔 둔다(방장 쪽 원격 챔피언에 그대로 가야 한다).
  r.spellPick = await guest.evaluate(() => { const E = window.__e2e, c = window.controller, cur = ['D', 'F'].map((k) => c.summoners && c.summoners[k] && c.summoners[k].id); const pick = Object.keys(E.SUMMONER_SPELL_DATA).find((id) => !cur.includes(id) && id !== 'mark'); E.setSummonerSpell(c, 'F', pick); return pick; });

  // 1) 방 만들기 → 참가 → 카운트다운
  await host.evaluate((u) => window.netHostCreateRoom(u, '방장'), wsUrl);
  await host.waitForFunction(() => window.netState && window.netState.code, null, { timeout: 10000 });
  const code = await host.evaluate(() => window.netState.code);
  await guest.evaluate(([u, c]) => window.netGuestJoin(u, c, '참가자'), [wsUrl, code]);
  await guest.waitForFunction(() => window.netState && window.netState.ready, null, { timeout: 90000 });
  await host.waitForFunction(() => window.netState && window.netState.guestReady, null, { timeout: 10000 });
  await realWait(guest, 3 * LAG + 200);
  r.countdown = {
    hostLocked: await host.evaluate(() => !!window.netState.locked), guestLocked: await guest.evaluate(() => !!window.netState.locked),
    cmdRejected: await guest.evaluate(() => window.gameSession.submit({ type: 'stop' }).ok === false),
  };
  await host.evaluate(() => window.togglePause && window.togglePause()); // 대전 중 일시정지 시도(막혀야 한다)
  await host.waitForFunction(() => !window.netState.locked, null, { timeout: 8000 });
  await guest.waitForFunction(() => !window.netState.locked, null, { timeout: 8000 });
  check('countdown: both locked, guest commands refused until start', r.countdown.hostLocked && r.countdown.guestLocked && r.countdown.cmdRejected);
  await realWait(guest, 1500);
  r.setup = {
    host: await host.evaluate(() => { const E = window.__e2e, b = E.enemyBots[0]; return { bots: E.enemyBots.length, champ: b && b.championId, team: b && b.team, remote: !!(b && b.isRemote), brain: !!(b && b.brain), id: b && window.__e2eEntityId(b), hostId: window.__e2eEntityId(window.controller), dummies: E.dummies.length, spellF: b && b.summoners && b.summoners.F && b.summoners.F.id, structIds: [...E.turrets, ...E.inhibitorBuildings, ...E.nexusBuildings].map((s) => window.__e2eEntityId(s)).sort((a, b) => a - b), goldLocked: document.getElementById('addGoldBtn').disabled, paused: document.getElementById('pauseOverlay').classList.contains('show') }; }),
    guest: await guest.evaluate(() => { const E = window.__e2e, c = window.controller, p = E.enemyBots[0]; return { mode: window.netGuestMode, team: c.team, champ: c.championId, id: window.__e2eEntityId(c), puppet: p && p.championId, puppetTeam: p && p.team, puppetId: p && window.__e2eEntityId(p), view: E.visionSystem.viewTeam, session: window.gameSession.kind, dummies: E.dummies.length, structIds: [...E.turrets, ...E.inhibitorBuildings, ...E.nexusBuildings].map((s) => window.__e2eEntityId(s)).sort((a, b) => a - b), goldLocked: document.getElementById('addGoldBtn').disabled, delay: Math.round(window.netState.delay), rtt: Math.round(window.netState.rtt || 0) }; }),
  };
  const H = r.setup.host, G = r.setup.guest;
  check('host: guest champion is a remote RED champion without AI', H.bots === 1 && H.champ === 'ashe' && H.team === 'RED' && H.remote && !H.brain && H.dummies === 0);
  check('lobby: guest summoner choice reaches the host-side champion', H.spellF === r.spellPick);
  check('guest: simulation off, RED team, host puppet BLUE, remote session', G.mode && G.team === 'RED' && G.champ === 'ashe' && G.puppet === 'garen' && G.puppetTeam === 'BLUE' && G.view === 'RED' && G.session === 'remote' && G.dummies === 0);
  check('ids: champions and structures share host ids', G.id === H.id && G.puppetId === H.hostId && JSON.stringify(G.structIds) === JSON.stringify(H.structIds) && H.structIds.length > 5);
  check('lock: practice tools disabled and pause refused during the match', H.goldLocked && G.goldLocked && !H.paused);
  check('latency: guest measures round trip through the host', G.rtt >= 2 * LAG * 0.8);

  // 2) 상점: 분수에서 산 아이템·골드가 방장 판정으로 바뀌고 참가자 화면에 온다
  const gold0 = await host.evaluate(() => window.__e2e.enemyBots[0].gold);
  await guest.evaluate(() => window.gameSession.submit({ type: 'buyItem', itemId: 'longSword' }));
  await realWait(guest, 3 * LAG + 300);
  r.shop = { gold0, hostGold: await host.evaluate(() => window.__e2e.enemyBots[0].gold), hostItem: await host.evaluate(() => (window.__e2e.enemyBots[0].items || []).some((i) => i && i.id === 'longSword')),
    guestGold: await guest.evaluate(() => window.controller.gold), guestItem: await guest.evaluate(() => (window.controller.items || []).some((i) => i && i.id === 'longSword')) };
  check('shop: buy command applied by host and reflected on guest', r.shop.hostGold < gold0 && r.shop.hostItem && r.shop.guestItem && Math.abs(r.shop.guestGold - r.shop.hostGold) < 30);

  // 3) 이동 예측: 명령을 보낸 뒤 참가자 화면의 내 챔피언이 움직이기 시작한 시각과 방장 쪽이 움직이기 시작한 시각(벽시계 Date.now)을 잰다.
  //    예측이 없으면 내 챔피언은 왕복 지연(2×LAG) + 보간 지연이 지나서야 움직인다. 예측이 있으면 다음 화면 한두 장 안에 움직인다.
  const g0 = await pos(guest, 'window.controller'), h0 = await pos(host, 'window.__e2e.enemyBots[0]');
  const watch = (p, expr) => p.evaluate((e) => { const o = eval(e), s = o.root.position.clone(); window.__mvStart = null; const loop = () => { if (o.root.position.distanceTo(s) > 0.01) { window.__mvStart = Date.now(); return; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }, expr);
  await watch(host, 'window.__e2e.enemyBots[0]'); await watch(guest, 'window.controller');
  const sentAt = await guest.evaluate(() => { const c = window.controller, L = window.__e2e.lolRangeToWorld, p = c.root.position; const t = Date.now(); window.gameSession.submit({ type: 'move', point: { x: p.x, y: 0, z: p.z - L(700) } }); return t; });
  await realWait(guest, 1000);
  await host.waitForFunction(() => window.__e2e.enemyBots[0].state !== 'MOVE', null, { timeout: 15000 }).catch(() => {}); // 느린 화면(여러 점검을 같이 돌릴 때)에서도 도착할 때까지
  await realWait(guest, 3 * LAG + 400);
  const g2 = await pos(guest, 'window.controller'), h2 = await pos(host, 'window.__e2e.enemyBots[0]');
  r.predict = { guestReactMs: (await guest.evaluate(() => window.__mvStart)) - sentAt, hostReactMs: (await host.evaluate(() => window.__mvStart)) - sentAt, hostMoved: distLol(h0, h2), guestMoved: distLol(g0, g2), gapAfter: distLol(g2, h2) };
  r.predict.stats = await guest.evaluate(() => ({ corrections: window.netState.pred.corrections, snaps: window.netState.pred.snaps }));
  check('prediction: own champion reacts before a round trip could (guest moves before the host even starts)', r.predict.guestReactMs >= 0 && r.predict.guestReactMs < 2 * LAG && r.predict.guestReactMs < r.predict.hostReactMs);
  check('prediction: guest and host positions converge after the move', r.predict.hostMoved > 600 && r.predict.guestMoved > 600 && r.predict.gapAfter < 25);

  // 4) 미니언: 방장 게임 시간을 웨이브 시각으로 - 참가자 화면에도 같은 ID로 생긴다(델타 스냅샷)
  await host.evaluate(() => window.__e2e.setGameTimeSec(64));
  await realWait(guest, 5000);
  const mins = await Promise.all([host.evaluate(() => window.__e2e.minions.filter((m) => !m.isDead).map((m) => window.__e2eEntityId(m)).sort((a, b) => a - b)), guest.evaluate(() => window.__e2e.minions.filter((m) => !m.isDead).map((m) => window.__e2eEntityId(m)).sort((a, b) => a - b))]);
  const common = mins[0].filter((id) => mins[1].includes(id)).length;
  r.minionCounts = { host: mins[0].length, guest: mins[1].length, common };
  check('minions: guest shows host minions with the same ids', mins[0].length >= 6 && common >= mins[0].length - 3);

  // 5) 추격 예측 + 전투: 방장 챔피언을 사거리 밖에 두고 참가자가 공격 - 바로 다가가고, 평타·W로 피해, 투사체·연출 복제
  await host.evaluate(() => { const E = window.__e2e, c = window.controller, b = E.enemyBots[0], L = E.lolRangeToWorld; c.root.position.set(b.root.position.x, 0, b.root.position.z - L(1100)); c.targetPos = null; c.itemBonusMaxHp = 20000; c.recomputeStats(); c.hp = c.maxHp; E.applyStatus(c, { id: 'e2eHold', type: 'STUN', duration: 10 }); b.mp = b.maxMp; b.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; });
  await realWait(guest, 3 * LAG + 400);
  const hp0 = await host.evaluate(() => window.controller.hp);
  await watch(guest, 'window.controller');
  const chaseAt = await guest.evaluate((id) => { const t = Date.now(); window.gameSession.submit({ type: 'attack', targetId: id }); return t; }, H.hostId);
  await realWait(guest, 2 * LAG + 400);
  r.chaseReactMs = (await guest.evaluate(() => window.__mvStart)) - chaseAt;
  check('prediction: chase toward an out-of-range target starts before a round trip', r.chaseReactMs >= 0 && r.chaseReactMs < 2 * LAG);
  let projSeen = 0;
  for (let i = 0; i < 12; i++) { await realWait(guest, 250); projSeen = Math.max(projSeen, await guest.evaluate(() => window.netState.proj.size)); }
  const fx0 = await guest.evaluate(() => window.netState.fxPlayed);
  await guest.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; window.gameSession.submit({ type: 'cast', slot: 'W', point: { x: p.x, y: 0, z: p.z } }); });
  for (let i = 0; i < 8; i++) { await realWait(guest, 250); projSeen = Math.max(projSeen, await guest.evaluate(() => window.netState.proj.size)); }
  await host.evaluate(() => { const c = window.controller; c.statusEffects = []; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.castAbility('E', c.root.position.clone()); }); // 방장 가렌 E(회전) - 연출이 참가자 화면에도
  await realWait(guest, 1500);
  r.fight = { hp0: Math.round(hp0), hostHp: Math.round(await host.evaluate(() => window.controller.hp)), guestSeesHp: Math.round(await guest.evaluate(() => window.__e2e.enemyBots[0].hp)), projSeen,
    wCast: await host.evaluate(() => window.__e2e.enemyBots[0].cooldowns.W > 0), guestCd: await guest.evaluate(() => window.controller.cooldowns.W > 0),
    fxSent: await host.evaluate(() => window.netState.fxSent), fxPlayed: await guest.evaluate(() => window.netState.fxPlayed), fxBefore: fx0 };
  check('fight: guest attack/W damage host champion (host decides)', r.fight.hostHp < r.fight.hp0 - 50 && r.fight.wCast);
  check('fight: guest sees host hp, its own cooldown and projectiles', Math.abs(r.fight.guestSeesHp - r.fight.hostHp) < 400 && r.fight.guestCd && r.fight.projSeen > 0);
  check('effects: host vfx calls are replayed on the guest', r.fight.fxSent > 0 && r.fight.fxPlayed > r.fight.fxBefore);
  if (process.env.SHOT) { await guest.screenshot({ path: process.env.SHOT + '_guest.png' }); await host.screenshot({ path: process.env.SHOT + '_host.png' }); }

  r.snapshotBytes = await host.evaluate(() => ({ avg: Math.round((window.netState.snapBytes || 0) / Math.max(1, window.netState.snapCount || 0)), count: window.netState.snapCount }));
  // 6) 동작 클립: 참가자 화면의 내 챔피언이 방장 쪽 평타 클립을 튼다(몇 번 재서 한 번이라도 같으면 통과)
  await guest.evaluate((id) => window.gameSession.submit({ type: 'attack', targetId: id }), H.hostId);
  r.clip = [];
  for (let i = 0; i < 16; i++) {
    const pair = await Promise.all([host.evaluate(() => window.__e2e.enemyBots[0].currentClipKey), guest.evaluate(() => window.controller.currentClipKey)]);
    r.clip.push(pair.join('/'));
    if (pair[0] && pair[0] === pair[1] && /Attack/i.test(pair[0])) break;
    await realWait(guest, 120);
  }
  check('animation: guest plays the host-side attack clip', r.clip.some((x) => { const [a, b] = x.split('/'); return a && a === b && /Attack/i.test(a); }));

  // 7) 와드: 방장 쪽에 생긴 빨강 팀 와드가 참가자 화면에 같은 ID로
  r.ward = await host.evaluate(() => { const E = window.__e2e, b = E.enemyBots[0]; const w = E.wardSystem.place(null, 'stealth', b.root.position.clone().add(new E.THREE.Vector3(1, 0, 1)), { team: 'RED', durationSec: 60 }); return window.__e2eEntityId(w); });
  await realWait(guest, 3 * LAG + 400);
  r.wardGuest = await guest.evaluate((id) => window.__e2e.wardSystem.wards.filter((w) => !w.destroyed).map((w) => window.__e2eEntityId(w)).includes(id), r.ward);
  check('wards: host ward appears on the guest with the same id', r.wardGuest);

  // 8) 처치: 방장이 참가자 챔피언을 처치 - 참가자 화면에서 죽음, 점수 동기화
  await host.evaluate(() => { const E = window.__e2e, b = E.enemyBots[0], c = window.controller; c.statusEffects = []; E.applyDamage(b, { rawDamage: 1e6, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: c }); });
  await realWait(guest, 3 * LAG + 600);
  r.kill = { hostKills: await host.evaluate(() => (window.controller.score || {}).kills || 0), guestState: await guest.evaluate(() => window.controller.state), guestFollow: await guest.evaluate(() => window.netState.pred.follow), guestDeaths: await guest.evaluate(() => (window.controller.score || {}).deaths || 0) };
  check('kill: guest champion dies on both screens, scores synced', r.kill.hostKills >= 1 && r.kill.guestState === 'DEAD' && r.kill.guestFollow && r.kill.guestDeaths >= 1);

  // 9) 끊긴 뒤 자동 재접속: 참가자 소켓을 강제로 끊는다 - 방장은 원격 챔피언을 유지하고, 참가자가 다시 붙어 스냅샷을 이어 받는다
  const botBefore = await host.evaluate(() => window.__e2eEntityId(window.__e2e.enemyBots[0]));
  await guest.evaluate(() => window.netState.client.ws.close());
  await host.waitForFunction(() => window.netState && window.netState.guestGoneAt, null, { timeout: 10000 }).catch(() => {});
  r.reconnect = { hostKept: await host.evaluate(() => window.__e2e.enemyBots.length === 1) };
  await host.waitForFunction(() => window.netState && window.netState.guestReady, null, { timeout: 20000 }).catch(() => {});
  const t0 = await guest.evaluate(() => window.netState && window.netState.hostT);
  await realWait(guest, 1200);
  r.reconnect.flowing = (await guest.evaluate(() => window.netState && window.netState.hostT)) > t0;
  r.reconnect.sameBot = (await host.evaluate(() => window.__e2eEntityId(window.__e2e.enemyBots[0]))) === botBefore;
  r.reconnect.guestMode = await guest.evaluate(() => window.netGuestMode && !!window.netState);
  check('reconnect: dropped guest reconnects automatically and the match continues', r.reconnect.hostKept && r.reconnect.flowing && r.reconnect.sameBot && r.reconnect.guestMode);

  // 10) 백그라운드 방장: 화면 갱신이 멈춰도 워커 타이머로 시뮬레이션·스냅샷이 계속된다(여기서는 강제로 켜서 확인)
  const hf0 = await host.evaluate(() => { window.__netForceHeadless = true; return window.netState.headlessFrames || 0; });
  await realWait(host, 700);
  r.headless = (await host.evaluate(() => { window.__netForceHeadless = false; return window.netState.headlessFrames || 0; })) - hf0;
  check('background host: worker ticker keeps simulating', r.headless >= 5);

  // 11) 승패·재대결: 빨강 넥서스 파괴 → 방장 승리/참가자 패배 화면 → 둘 다 재대결 → 새 판(구조물 복구)
  await host.evaluate(() => { const E = window.__e2e, n = E.nexusBuildings.find((x) => x.team === 'RED'); n.hp = 0; E.destroyNexus(n); });
  await guest.waitForFunction(() => document.getElementById('netEndScreen'), null, { timeout: 10000 }).catch(() => {});
  r.end = { host: await host.evaluate(() => { const e = document.getElementById('netEndScreen'); return e && e.dataset.result; }), guest: await guest.evaluate(() => { const e = document.getElementById('netEndScreen'); return e && e.dataset.result; }) };
  check('end: host sees victory, guest sees defeat', r.end.host === 'win' && r.end.guest === 'lose');
  await guest.evaluate(() => document.getElementById('netRematchBtn').click());
  await realWait(guest, 3 * LAG);
  await host.evaluate(() => document.getElementById('netRematchBtn').click());
  await host.waitForFunction(() => window.netState && !window.netState.ended && window.netState.guestReady && !window.netState.locked && window.netState.remote, null, { timeout: 90000 }).catch(() => {});
  await realWait(guest, 1000);
  r.rematch = { hostNexus: await host.evaluate(() => window.__e2e.nexusBuildings.every((n) => !n.destroyed)), guestNexus: await guest.evaluate(() => window.__e2e.nexusBuildings.every((n) => !n.destroyed)),
    ended: await host.evaluate(() => window.__e2e.gameEnded), endScreen: await guest.evaluate(() => !!document.getElementById('netEndScreen')), bots: await host.evaluate(() => window.__e2e.enemyBots.length), guestReady: await guest.evaluate(() => !!(window.netState && window.netState.ready)) };
  check('rematch: both accept → fresh match with structures restored', r.rematch.hostNexus && r.rematch.guestNexus && !r.rematch.ended && !r.rematch.endScreen && r.rematch.bots === 1 && r.rematch.guestReady);

  // 12) 나가기: 참가자 탭을 닫으면 방장은 재접속을 기다린다(원격 챔피언 유지) → 방장이 방을 닫으면 정리된다
  await guest.close();
  await host.waitForFunction(() => window.netState && window.netState.guestGoneAt, null, { timeout: 10000 }).catch(() => {});
  r.leave = await host.evaluate(() => ({ bots: window.__e2e.enemyBots.length, waiting: !!window.netState.guestGoneAt, code: window.netState && window.netState.code }));
  check('leave: guest disconnect keeps the remote champion while waiting for reconnect', r.leave.bots === 1 && r.leave.waiting && r.leave.code === code);
  await host.evaluate(() => window.netLeave());
  r.closed = await host.evaluate(() => ({ state: window.netState === null, bots: window.__e2e.enemyBots.length, unlocked: !document.getElementById('addGoldBtn').disabled }));
  check('leave: host closes the room, tools unlocked', r.closed.state && r.closed.bots === 0 && r.closed.unlocked);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); relay.close();
  process.exit(fails.length ? 1 : 0);
})();
