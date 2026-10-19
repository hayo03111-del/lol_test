// 77차 체력바 3종 점검(헤드리스 Chromium): 챔피언(내·아군·적)·미니언·포탑이 원작처럼 서로 다른 모양인지 확대 스크린샷으로 본다.
// 사용법: THREE_DIR=<three package> node tools/e2e_glb/hp_bars_check.js [스크린샷 폴더]
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
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'ahri'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'ahri' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld; E.setGameTimeSec(600);
    const t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1'); const tp = t.mesh.position;
    c.root.position.set(tp.x + L(150), 0, tp.z - L(950)); c.hp = c.maxHp * 0.72; c.mp = c.maxMp * 0.5;
    E.applyDamage(t, { rawDamage: 2000, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: c, isBasicAttack: true });
    const p = c.root.position;
    const [d0, d1] = E.dummies; d0.mesh.position.set(p.x - L(320), 0, p.z + L(320)); d0.hp = d0.maxHp * 0.55; if (d1) d1.mesh.position.set(40, 0, 40);
    if (typeof E.createAllyDummy === 'function') { const a = E.createAllyDummy(new E.THREE.Vector3(p.x + L(330), 0, p.z - L(80))); if (a) { a.hp = a.maxHp * 0.85; } }
    const mk = (type, x, z, team) => { const m = E.createMinion(type, new E.THREE.Vector3(p.x + L(x), 0, p.z + L(z)), E.getTurretGameTimeSec(), team); m.moveSpeedWorld = 0; m.hp = m.maxHp * 0.7; E.minions.push(m); return m; };
    mk('melee', -60, 420, 'RED'); mk('caster', 150, 470, 'RED'); mk('melee', 320, 160, 'BLUE');
    await new Promise((res) => setTimeout(res, 1500));
    return { ok: true };
  });
  await page.screenshot({ path: path.join(shotDir, 'hp_bars.png') });
  r.errors = errors;
  console.log(JSON.stringify(r));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
