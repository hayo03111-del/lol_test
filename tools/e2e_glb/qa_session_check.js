// QA(93차, 온라인 1:1 준비): 실제 브라우저에서 세션 계층 확인.
//  1) 실제 마우스·키 입력이 명령(commandResult 이벤트)으로 처리되고 게임이 예전처럼 반응하는가(이동·공격·스킬·S 정지·귀환·상점 구매)
//  2) 스냅샷이 JSON으로 그대로 오가는가, 엔티티 ID가 안정적인가
//  3) 피해·사망·구매 이벤트가 남는가
//  4) 일시정지 중에는 세션 틱이 멈추는가
//  5) 게임 다시 시작을 3번 반복해도 구조물·허수아비·미니언이 겹쳐 늘지 않고 틱이 처음으로 돌아가는가
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_session_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 }); await page.waitForTimeout(1000); };
  await load('garen');
  const r = {};
  const lastSeq = () => page.evaluate(() => { const e = window.gameSession.events(0); return e.length ? e[e.length - 1].seq : 0; });
  const cmdsSince = (seq) => page.evaluate((seq) => window.gameSession.events(seq).filter((e) => e.type === 'commandResult').map((e) => `${e.commandType}:${e.ok ? 'ok' : 'no'}`), seq);
  // 지면 좌표 → 화면 좌표
  const screenOf = (x, z) => page.evaluate(([x, z]) => { const E = window.__e2e, v = new E.THREE.Vector3(x, 0, z).project(E.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, [x, z]);

  // 1) 이동(우클릭)
  let s0 = await lastSeq();
  const start = await page.evaluate(() => { const p = window.controller.root.position; return { x: p.x, z: p.z }; });
  let pt = await screenOf(start.x + 3, start.z + 1);
  await page.mouse.move(pt.x, pt.y); await page.mouse.click(pt.x, pt.y, { button: 'right' });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => { const p = window.controller.root.position; return { x: p.x, z: p.z }; });
  r.move = { commands: await cmdsSince(s0), moved: +Math.hypot(after.x - start.x, after.z - start.z).toFixed(2) };
  // S 정지 · 귀환(B) · 귀환 취소용 이동
  s0 = await lastSeq();
  await page.keyboard.press('KeyS'); await page.waitForTimeout(200);
  await page.keyboard.press('KeyB'); await page.waitForTimeout(400);
  r.recallState = await page.evaluate(() => window.controller.state);
  pt = await screenOf(after.x + 1, after.z); await page.mouse.click(pt.x, pt.y, { button: 'right' }); await page.waitForTimeout(300);
  r.stopRecall = { commands: await cmdsSince(s0) };
  // 공격(허수아비 우클릭) + 피해 이벤트
  const dummyId = await page.evaluate(() => { const E = window.__e2e, c = window.controller, d = E.dummies[0]; d.mesh.position.set(c.root.position.x + E.lolRangeToWorld(120), 0, c.root.position.z); d.hp = d.maxHp; return window.gameSession.snapshot().entities.find((e) => e.kind === 'dummy').id; });
  await page.waitForTimeout(300);
  s0 = await lastSeq();
  const dpos = await page.evaluate(() => { const p = window.__e2e.dummies[0].mesh.position; return { x: p.x, z: p.z }; });
  pt = await screenOf(dpos.x, dpos.z); await page.mouse.move(pt.x, pt.y - 20); await page.mouse.click(pt.x, pt.y - 20, { button: 'right' });
  await page.waitForTimeout(2500);
  r.attack = await page.evaluate(([s0, dummyId]) => {
    const ev = window.gameSession.events(s0);
    return { commands: ev.filter((e) => e.type === 'commandResult').map((e) => `${e.commandType}:${e.ok ? 'ok' : 'no'}`), damageEventsOnDummy: ev.filter((e) => e.type === 'damage' && e.targetId === dummyId).length, targetIdInSnapshot: window.gameSession.snapshot().entities.find((e) => e.kind === 'champion').targetId === dummyId };
  }, [s0, dummyId]);
  // 스킬(Q 키) · 레벨 업(Ctrl+R 은 R 0레벨이라 3레벨에선 거부될 수 있음 - 결과만 기록)
  s0 = await lastSeq();
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(300);
  r.castQ = { commands: await cmdsSince(s0), qCooldown: await page.evaluate(() => +window.controller.cooldowns.Q.toFixed(2)) };
  // 상점 구매(우물로 옮긴 뒤 상점 열고 롱소드 우클릭 구매)
  s0 = await lastSeq();
  r.buy = await page.evaluate(() => {
    const c = window.controller, E = window.__e2e; const sp = E.getTeamSpawnPosition(c.team); c.root.position.set(sp.x, sp.y || 0, sp.z);
    const goldBefore = c.gold; const res = window.gameSession.submit({ type: 'buyItem', itemId: 'longSword' });
    return { ok: res.ok, outcome: res.outcome, goldDelta: c.gold - goldBefore };
  });
  r.buy.events = await page.evaluate((s0) => window.gameSession.events(s0).filter((e) => e.type === 'itemPurchased').map((e) => e.itemId), s0);
  // 2) 스냅샷
  r.snapshot = await page.evaluate(() => {
    const s = window.gameSession.snapshot(); const j = JSON.stringify(s);
    const kinds = {}; for (const e of s.entities) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    const ids = s.entities.map((e) => e.id); const s2 = window.gameSession.snapshot();
    return { bytes: j.length, roundTripSame: JSON.stringify(JSON.parse(j)) === j, kinds, uniqueIds: new Set(ids).size === ids.length, idsStable: JSON.stringify(s2.entities.map((e) => e.id)) === JSON.stringify(ids), tick: s.tick };
  });
  // 4) 일시정지 중 틱
  const t1 = await page.evaluate(() => window.gameSession.tick);
  await page.keyboard.press('Pause'); await page.waitForTimeout(600);
  const t2 = await page.evaluate(() => window.gameSession.tick);
  await page.waitForTimeout(600);
  const t3 = await page.evaluate(() => window.gameSession.tick);
  await page.keyboard.press('Pause'); await page.waitForTimeout(600);
  const t4 = await page.evaluate(() => window.gameSession.tick);
  r.pause = { tickBefore: t1, tickPausedA: t2, tickPausedB: t3, stoppedWhilePaused: t3 === t2, resumedAfter: t4 > t3 };
  // 5) 다시 시작 3번
  const sceneKinds = () => page.evaluate(() => { const m = {}; for (const o of window.__e2e.scene.children) { const k = (o.name || o.type) + (o.userData && o.userData.kind ? ':' + o.userData.kind : ''); m[k] = (m[k] || 0) + 1; } return m; });
  const kinds0 = await sceneKinds();
  const count = () => page.evaluate(() => { const E = window.__e2e; return { turrets: E.turrets.length, nexus: E.nexusBuildings.length, inhib: E.inhibitorBuildings.length, dummies: E.dummies.length, minions: E.minions.length, sceneChildren: E.scene.children.length, tick: window.gameSession.tick }; });
  r.restarts = [await count()];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const b = document.getElementById('optRestartBtn'); if (b) b.click(); });
    await page.waitForFunction(() => window.controller && window.controller.champLevel === 3, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const c = await count(); c.gameResetEvents = await page.evaluate(() => window.gameSession.events(0).filter((e) => e.type === 'gameReset').length);
    r.restarts.push(c);
  }
  const kinds1 = await sceneKinds();
  r.sceneGrowth = {}; for (const k of new Set([...Object.keys(kinds0), ...Object.keys(kinds1)])) if ((kinds1[k] || 0) !== (kinds0[k] || 0)) r.sceneGrowth[k] = (kinds1[k] || 0) - (kinds0[k] || 0);
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
