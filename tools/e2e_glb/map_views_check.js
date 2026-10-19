// 73차 맵 화면 점검(헤드리스 Chromium): 가운데·외곽 포탑·기지(넥서스)·우물·위에서 본 전체 화면을 찍는다.
// 사용법: THREE_DIR=<three package> node tools/e2e_glb/map_views_check.js <스크린샷 폴더> [base,outer,fountain,overview,overview2]
const path = require('path');
const { chromium } = require('playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const shot = async (name, fn) => { await page.evaluate(fn); await page.waitForTimeout(2200); await page.screenshot({ path: path.join(process.argv[2], name) }); };
  const views = (process.argv[3] || 'base,outer,overview,overview2').split(',');
  for (const v of views) {
    if (v === 'base') await shot('v_base.png', () => { const E = window.__e2e, c = window.controller; const n = E.nexusBuildings.find((n) => n.team === 'BLUE'); c.root.position.set(n.mesh.position.x, 0, n.mesh.position.z + E.lolRangeToWorld(500)); });
    if (v === 'fountain') await shot('v_fountain.png', () => { const E = window.__e2e, c = window.controller; c.root.position.copy(E.getTeamSpawnPosition('BLUE')); });
    if (v === 'outer') await shot('v_outer.png', () => { const E = window.__e2e, c = window.controller; const t = E.turrets.find((t) => t.team === 'RED' && t.type === 'outer1'); c.root.position.set(t.mesh.position.x, 0, t.mesh.position.z - E.lolRangeToWorld(600)); });
    if (v === 'overview') await shot('v_overview.png', () => { const E = window.__e2e, c = window.controller; c.root.position.set(0, 0, 0); E.cameraRig.maxDistance = 170; E.cameraRig.distance = 170; });
    if (v === 'overview2') await shot('v_overview2.png', () => { const E = window.__e2e, c = window.controller; c.root.position.set(0, 0, -40); E.cameraRig.maxDistance = 70; E.cameraRig.distance = 70; });
  }
  console.log(JSON.stringify(errors));
  await browser.close(); srv.close();
})();
