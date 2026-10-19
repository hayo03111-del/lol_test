const path = require('path');
const { chromium } = require('playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => { const E = window.__e2e, c = window.controller; const t = E.turrets.filter((t) => t.team === 'RED' && !t.destroyed).sort((a, b) => a.mesh.position.z - b.mesh.position.z)[0] || E.turrets[0];
    const p = t.mesh.position; c.root.position.set(p.x, 0, p.z - E.lolRangeToWorld(700)); c.hp = c.maxHp = 1e6; t.hp = t.maxHp * 0.62; return { type: t.type, hp: t.hp, maxHp: t.maxHp }; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(process.argv[2], 'turretbar_before.png') });
  console.log(JSON.stringify(info));
  await browser.close(); srv.close();
})();
