// 부쉬 점검(헤드리스 Chromium + 실제 GLB, 애쉬): 부쉬 안의 적은 바깥에서 안 보이고, 같은 부쉬에 들어가거나
// 애쉬 E(지역 시야)로 드러나며, 빨강 시점에서 부쉬 안 플레이어는 공격할 때만 드러나는지 확인한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/brush_check.js [스크린샷.png]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.setInputFiles('#glbFileInput', { name: '애쉬.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, '애쉬.glb')) });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'ashe', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = {};
  r.setup = await page.evaluate(() => {
    const E = window.__e2e, B = E.brushSystem, c = window.controller, [d0, d1, d2] = E.dummies;
    // 칼바람 원작 배치 중 다리 가운데 오른쪽 부쉬(brushes[2])에 적 d2, 왼쪽 부쉬(brushes[0])는 빨강 시점 시험용. d0·d1은 멀리.
    // 위치는 맵 배율에 따라 달라지므로 부쉬 중심에서 계산한다.
    const bc = B.brushes[2].center, b0 = B.brushes[0].center;
    window.__bc = { x: bc.x, z: bc.z }; window.__b0 = { x: b0.x, z: b0.z };
    d0.mesh.position.set(-60, 0, -60); d1.mesh.position.set(-70, 0, -60); d2.mesh.position.set(bc.x, 0, bc.z);
    c.root.position.set(bc.x - 5, 0, bc.z);
    return { brushCount: B.brushes.length, mapScale: E.howlingAbyssMap.scale, brushes: B.brushes.map((b) => [+b.center.x.toFixed(2), +b.center.z.toFixed(2)]), d2InBrush: !!B.brushAt(d2.mesh.position), playerInBrush: !!B.brushAt(c.root.position) };
  });
  await wait(400);
  r.outside = await page.evaluate(() => { const E = window.__e2e, d2 = E.dummies[2]; return { visible: E.visionSystem.isVisible(d2), meshVisible: d2.mesh.visible, distLol: Math.round(window.controller.root.position.distanceTo(d2.mesh.position) / E.lolRangeToWorld(1)) }; });
  await page.evaluate(() => window.controller.root.position.set(window.__bc.x + 0.6, 0, window.__bc.z + 0.4));
  await wait(400);
  r.sameBrush = await page.evaluate(() => { const E = window.__e2e, B = E.brushSystem; const mine = B.brushAt(window.controller.root.position); return { visible: E.visionSystem.isVisible(E.dummies[2]), grassOpacity: mine && mine.mats[0] ? +mine.mats[0].opacity.toFixed(2) : null }; });
  if (process.argv[2]) {
    await page.evaluate(() => { const cv = document.querySelector('canvas'); const keep = new Set(); for (let n = cv; n; n = n.parentElement) keep.add(n); document.querySelectorAll('body *').forEach((el) => { if (!keep.has(el) && !el.contains(cv)) el.style.visibility = 'hidden'; }); });
    await wait(300); await page.screenshot({ path: process.argv[2] });
    await page.evaluate(() => document.querySelectorAll('body *').forEach((el) => { el.style.visibility = ''; }));
  }
  // 부쉬 밖으로 나와 애쉬 E(매)를 부쉬로
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; c.root.position.set(window.__bc.x - 5, 0, window.__bc.z); c.cooldowns.E = 0; c.mp = c.maxMp; c.castAbility('E', new E.THREE.Vector3(window.__bc.x, 0, window.__bc.z)); });
  await wait(300);
  r.beforeHawkArrives = await page.evaluate(() => window.__e2e.visionSystem.isVisible(window.__e2e.dummies[2]));
  await wait(2500);
  r.afterAsheE = await page.evaluate(() => window.__e2e.visionSystem.isVisible(window.__e2e.dummies[2]));
  // 빨강 시점: 플레이어가 왼쪽 부쉬 안, 빨강 d0이 부쉬 밖 가까이
  await page.evaluate(() => { const E = window.__e2e, c = window.controller, d0 = E.dummies[0]; d0.mesh.position.set(window.__b0.x + 4.5, 0, window.__b0.z); c.root.position.set(window.__b0.x, 0, window.__b0.z); E.visionSystem.setViewTeam('RED'); });
  await wait(400);
  r.redHidden = await page.evaluate(() => ({ visibleToRed: window.__e2e.visionSystem.isVisibleTo('RED', window.controller), rootVisible: window.controller.root.visible }));
  await page.evaluate(() => { const E = window.__e2e; window.__e2e.brushSystem.onActionFromBrush(window.controller); });
  await wait(300);
  r.redAfterAttack = await page.evaluate(() => ({ visibleToRed: window.__e2e.visionSystem.isVisibleTo('RED', window.controller), rootVisible: window.controller.root.visible }));
  await wait(2300);
  r.redAfter2s = await page.evaluate(() => window.__e2e.visionSystem.isVisibleTo('RED', window.controller));
  // 실제 평타로도 드러나는지(부쉬 안에서 d0 공격)
  await page.evaluate(() => { const E = window.__e2e, c = window.controller, d0 = E.dummies[0]; c.selectTarget(d0); });
  await wait(1500);
  r.redAfterRealAttack = await page.evaluate(() => ({ visibleToRed: window.__e2e.visionSystem.isVisibleTo('RED', window.controller), d0Damaged: window.__e2e.dummies[0].hp < window.__e2e.dummies[0].maxHp }));
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
