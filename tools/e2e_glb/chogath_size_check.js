// 82차 초가스 포식 크기 점검(헤드리스 Chromium + 저장소 모델): 중첩을 쌓으면 모델 배율·체력바 높이·평타 사거리가 커지고,
// 판정 반경은 그대로인지, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/chogath_size_check.js [스크린샷 폴더]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'chogath'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'chogath', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const snap = () => page.evaluate(() => { const c = window.controller, E = window.__e2e;
    return { scale: +c.model.parent.scale.x.toFixed(4), barY: +(c._hpLabel3d ? c._hpLabel3d.position.y : NaN).toFixed(3),
      rangeLol: Math.round(E.worldDistanceToLol(c.stats.attackRange)), radius: +c.collisionRadius.toFixed(3), sizeScale: +(c._sizeScale || 1).toFixed(3) }; });
  const shotDir = process.argv[2] || null;
  const r = {};
  r.before = await snap();
  if (shotDir) await page.screenshot({ path: shotDir + '/chogath_size_0.png' });
  await page.evaluate(() => { const c = window.controller; c.skillLevels.R = 3; c._chogath.predationStacks = 5; });
  await page.waitForTimeout(150);
  r.growing = await snap();
  await page.waitForTimeout(1200);
  r.after5 = await snap();
  await page.evaluate(() => { window.controller._chogath.predationStacks = 30; });
  await page.waitForTimeout(1500);
  r.capped = await snap();
  if (shotDir) await page.screenshot({ path: shotDir + '/chogath_size_max.png' });
  r.scaleRatio5 = +(r.after5.scale / r.before.scale).toFixed(3);
  r.scaleRatioCap = +(r.capped.scale / r.before.scale).toFixed(3);
  r.barRose = r.capped.barY > r.before.barY;
  r.radiusSame = r.capped.radius === r.before.radius;
  r.smooth = r.growing.sizeScale > 1 && r.growing.sizeScale < 1.5;
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
