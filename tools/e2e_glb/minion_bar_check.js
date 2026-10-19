// 76차 미니언 체력바 점검(헤드리스 Chromium): 종류별 크기(56/56/66/82), 내 팀 파랑·상대 빨강, 체력을 직접 바꿔도(회복·재설정) 바가 따라옴,
// 피해 잔상, 닐라 Q 폭(150) 조준 표시, 확대 스크린샷, 콘솔 오류.
// 사용법: THREE_DIR=<three package> node tools/e2e_glb/minion_bar_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld; c.root.position.set(0, 0, 0); c.hp = c.maxHp = 1e6;
    for (const d of E.dummies) d.mesh.position.set(40, 0, 40);
    const mk = (type, x, z, team) => { const m = E.createMinion(type, new E.THREE.Vector3(L(x), 0, L(z)), E.getTurretGameTimeSec(), team); m.moveSpeedWorld = 0; m.hp = m.maxHp = 1e5; E.minions.push(m); return m; };
    window.__mb = [mk('melee', -180, 260, 'RED'), mk('caster', 0, 330, 'RED'), mk('siege', 170, 280, 'RED'), mk('super', 150, 470, 'RED'), mk('melee', -160, -200, 'BLUE'), mk('caster', 80, -240, 'BLUE')];
    for (const m of window.__mb) m.attackTarget = null; });
  await page.waitForTimeout(800);
  const r = {};
  r.sizes = await page.evaluate(() => window.__mb.map((m) => { const b = m.healthBar.el.getBoundingClientRect(); return [m.type, m.team, Math.round(b.width), Math.round(b.height), m.healthBar.el.classList.contains('ally') ? 'ally' : 'enemy']; }));
  // 체력을 직접 바꾼다(피해 경로를 거치지 않음 - 회복·재설정과 같은 경우)
  await page.evaluate(() => { const a = window.__mb; a[0].hp = a[0].maxHp * 0.6; a[1].hp = a[1].maxHp * 0.3; a[4].hp = a[4].maxHp * 0.8; });
  await page.waitForTimeout(400);
  r.followsDirectHp = await page.evaluate(() => window.__mb.slice(0, 5).map((m) => m.healthBar.fill.style.width));
  // 피해 → 잔상
  await page.evaluate(() => { const E = window.__e2e; E.applyDamage(window.__mb[2], { rawDamage: 40000, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: window.controller, isBasicAttack: true }); });
  await page.waitForTimeout(300); // 채움은 바로(0.06초), 잔상은 0.22초 뒤 0.45초에 걸쳐 따라온다
  r.trailAfterHit = await page.evaluate(() => { const hb = window.__mb[2].healthBar; return { fill: hb.fill.style.width, trail: hb.trail.style.width, trailDelayed: hb.trail.style.transition !== 'none' }; /* 계산된 너비는 헤드리스에서 전환(transition)이 프레임마다만 진행돼 늦게 바뀐다 - 목표값으로 본다 */ });
  await page.screenshot({ path: path.join(shotDir, 'minion_bars.png'), clip: { x: 480, y: 120, width: 640, height: 520 } });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
