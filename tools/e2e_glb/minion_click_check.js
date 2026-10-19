// 64차 미니언 때리기 점검(헤드리스 Chromium, 실제 마우스): 미니언 몸통 좌클릭·우클릭 = 공격(예전엔 우클릭이 이동만 했고
// 몸통 클릭은 판정이 빗나갔다), 선택 반경 가장자리 클릭, 빈 땅 우클릭 = 이동, A + 좌클릭 공격 이동(미니언 옆 땅을 눌러도
// 공격), 겹친 미니언 중 커서에 가까운 쪽 선택, 미니언 공격 동작 속도 맞춤, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/minion_click_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const E = window.__e2e;
    for (const id of ['debugPanel', 'helpBox', 'championPanel']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    window.__setup = (types) => {
      const c = window.controller, V = (x, z) => new E.THREE.Vector3(x, 0, z);
      for (const m of [...E.minions]) { m.isDead = true; E.scene.remove(m.mesh); } E.minions.length = 0;
      c._clearActionTimers && c._clearActionTimers(); c.currentTarget = null; c.attackOrderActive = false; c.setState('IDLE'); c.targetPos = null; c.hp = c.maxHp;
      c.root.position.set(0, 0, -4);
      for (const d of E.dummies) d.mesh.position.set(40, 0, 40);
      const out = types.map(([t, x, z]) => { const m = E.createMinion(t, V(x, z), E.getTurretGameTimeSec(), 'RED'); m.hp = m.maxHp = 5000; m._frozen = true; m.moveSpeedWorld = 0; m.attackDamage = 0; E.minions.push(m); return m; });
      return out.length;
    };
    window.__screen = (i, frac = 0.5, side = 0) => {
      const m = E.minions[i]; const p = m.mesh.position.clone(); p.y += (m.modelHeight || 0.8) * frac;
      if (side) { const r = new E.THREE.Vector3().setFromMatrixColumn(E.camera.matrixWorld, 0).normalize(); p.addScaledVector(r, side * m.selectionRadius); }
      const v = p.project(E.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    };
  });
  const r = {};
  const settle = () => page.waitForTimeout(700);
  // 1) 몸통 우클릭 = 공격
  await page.evaluate(() => window.__setup([['melee', 0, 0]])); await settle();
  let s = await page.evaluate(() => window.__screen(0, 0.6));
  const hp0 = await page.evaluate(() => window.__e2e.minions[0].hp);
  await page.mouse.click(s.x, s.y, { button: 'right' }); await page.waitForTimeout(2500);
  r.rightClickBody = await page.evaluate((hp0) => ({ target: window.controller.currentTarget === window.__e2e.minions[0], dealt: Math.round(hp0 - window.__e2e.minions[0].hp) }), hp0);
  // 2) 몸통 좌클릭 = 공격
  await page.evaluate(() => window.__setup([['caster', 0, 0]])); await settle();
  s = await page.evaluate(() => window.__screen(0, 0.7));
  await page.mouse.click(s.x, s.y); await page.waitForTimeout(300);
  r.leftClickHead = await page.evaluate(() => window.controller.currentTarget === window.__e2e.minions[0]);
  // 3) 선택 반경 가장자리(0.8배) 클릭
  await page.evaluate(() => window.__setup([['melee', 0, 0]])); await settle();
  s = await page.evaluate(() => window.__screen(0, 0.3, 0.8));
  await page.mouse.click(s.x, s.y); await page.waitForTimeout(300);
  r.edgeClick = await page.evaluate(() => window.controller.currentTarget === window.__e2e.minions[0]);
  // 4) 빈 땅 우클릭 = 이동(공격 아님)
  await page.evaluate(() => window.__setup([['melee', 0, 0]])); await settle();
  s = await page.evaluate(() => window.__screen(0, 0.3, 6));
  await page.mouse.click(s.x, s.y, { button: 'right' }); await page.waitForTimeout(200);
  r.groundRightClick = await page.evaluate(() => { const t = window.controller.currentTarget; const E = window.__e2e; const f = t ? E.getWorldPosition(t) : null; return { target: t ? `${t.team}/${t.type}` : null, pos: f ? [+f.x.toFixed(1), +f.z.toFixed(1)] : null, state: window.controller.state }; });
  // 5) A + 좌클릭: 미니언 옆 땅(선택 반경 밖, 400 안)
  await page.evaluate(() => window.__setup([['melee', 0, 0]])); await settle();
  s = await page.evaluate(() => window.__screen(0, 0, 2.2));
  r.preClick = await page.evaluate((s) => { const E = window.__e2e; const u = window.getEnemyHit(s.x, s.y, {}); const cam = E.camera.position.toArray().map((v) => +v.toFixed(1)); const dir = new E.THREE.Vector3(); E.camera.getWorldDirection(dir); const nt = E.turrets.filter((t) => t.type === 'nexusTwin' && t.team === 'RED').map((t) => { const f = E.getWorldPosition(t).clone(); const a = f.clone().project(E.camera); const h = f.clone(); h.y += t.labelHeight; const b = h.project(E.camera); return { a: [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(3)], b: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(3)] }; }); return { pick: u ? `${u.team}/${u.type}` : null, cam, dir: dir.toArray().map((v) => +v.toFixed(2)), nt }; }, s);
  await page.keyboard.press('a'); r.attackMoveClickAt = s; await page.mouse.click(s.x, s.y); await page.waitForTimeout(300);
  r.turretScreen = await page.evaluate(() => { const E = window.__e2e; const t = E.turrets.find((t) => t.team === 'RED' && t.type === 'outer1'); const f = E.getWorldPosition(t).clone(); const h = f.clone(); h.y += t.labelHeight; const pf = f.project(E.camera), ph = h.project(E.camera); return { feet: [Math.round((pf.x*0.5+0.5)*innerWidth), Math.round((-pf.y*0.5+0.5)*innerHeight)], head: [Math.round((ph.x*0.5+0.5)*innerWidth), Math.round((-ph.y*0.5+0.5)*innerHeight)], minion: window.__screen(0, 0) }; });
  r.pickAtAttackMove = await page.evaluate((s) => { const u = window.getEnemyHit(s.x, s.y, {}); const E = window.__e2e; if (!u) return null; const f = E.getWorldPosition(u); return { type: u.type, team: u.team, pos: [+f.x.toFixed(1), +f.z.toFixed(1)], selR: u.selectionRadius, lh: u.labelHeight }; }, s);
  r.groundAt = await page.evaluate((s) => { const g = window.getGroundPoint(s.x, s.y); return g ? [+g.x.toFixed(2), +g.y.toFixed(2), +g.z.toFixed(2)] : null; }, s);
  r.attackMove = await page.evaluate(() => { const t = window.controller.currentTarget; const E = window.__e2e; const f = t ? E.getWorldPosition(t) : null; return { ok: t === window.__e2e.minions[0], t: t ? `${t.team}/${t.type}/${t.isMinion ? 'minion' : ''}` : null, pos: f ? [+f.x.toFixed(1), +f.z.toFixed(1)] : null, state: window.controller.state, player: window.controller.root.position.toArray().map((v) => +v.toFixed(1)) }; });
  // 6) 겹친 두 미니언 - 커서에 가까운 쪽
  await page.evaluate(() => window.__setup([['melee', -0.35, 0], ['melee', 0.35, 0]])); await settle();
  s = await page.evaluate(() => window.__screen(1, 0.5));
  await page.mouse.click(s.x, s.y); await page.waitForTimeout(300);
  r.overlapPick = await page.evaluate(() => window.controller.currentTarget === window.__e2e.minions[1]);
  // 7) 미니언 공격 동작 속도 = 공격 주기에 맞춤
  r.attackAnim = await page.evaluate(async () => {
    const E = window.__e2e, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    for (const m of [...E.minions]) { m.isDead = true; E.scene.remove(m.mesh); } E.minions.length = 0;
    const a = E.createMinion('caster', V(10, 0), 0, 'BLUE'), b = E.createMinion('melee', V(10, 3), 0, 'RED');
    a.hp = a.maxHp = b.hp = b.maxHp = 1e5; E.minions.push(a, b);
    await new Promise((res) => setTimeout(res, 2500));
    const act = a.currentAction; return act ? { clip: act.getClip().name, rawSec: +act.getClip().duration.toFixed(2), timeScale: +act.timeScale.toFixed(2), cycleSec: +(1 / a.attackSpeed).toFixed(2) } : null;
  });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
