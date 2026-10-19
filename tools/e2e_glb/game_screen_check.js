// 68차 원작식 게임 화면 점검(헤드리스 Chromium, 실제 마우스): 로비 → 게임 시작 화면에 연습 도구 패널이 숨겨져 있음, 연습 도구
// 버튼으로 켜고 끄기, 오른쪽 위 전적 줄(K/D/A·CS·시간), 미니맵(우클릭 = 그 자리로 이동, 좌클릭 누르고 있기 = 카메라가 그 자리로,
// 놓으면 챔피언으로 복귀), 콘솔 오류.
// 사용법: THREE_DIR=<three package> node tools/e2e_glb/game_screen_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  if (await page.evaluate(() => document.getElementById('lobbyOverlay').classList.contains('show'))) { await page.click('#lobbyChampGrid [data-champ="ahri"]'); await page.click('#lobbyStartBtn'); }
  await page.waitForFunction(() => window.controller && window.controller.championId === 'ahri', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const vis = (id) => page.evaluate((id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }, id);
  const r = {};
  r.hiddenByDefault = { debug: await vis('debugPanel'), help: await vis('helpBox'), settings: await vis('rangeIndicatorToggle'), champPanel: await vis('championPanel'), state: await vis('stateLabel') };
  r.shown = { practiceBtn: await vis('practiceToolsBtn'), gameStats: await vis('gameStats'), minimap: await vis('minimap'), hud: await vis('hud') };
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; c.root.position.set(0, 0, 0); E.spawnMinionWave('BLUE', E.getTurretGameTimeSec()); E.spawnMinionWave('RED', E.getTurretGameTimeSec()); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shotDir, 'game_screen.png') });
  r.stats = await page.evaluate(() => document.getElementById('gameStats').textContent);
  // 미니맵 우클릭 = 이동
  const mm = await page.$('#minimap canvas');
  const box = await mm.boundingBox();
  const target = await page.evaluate(() => { const E = window.__e2e; const yaw = E.cameraRig.yaw; return { right: [Math.cos(yaw), -Math.sin(yaw)], up: [-Math.sin(yaw), -Math.cos(yaw)] }; });
  // 미니맵 가운데에서 위로 40px = 화면 위쪽 방향
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 40, { button: 'right' });
  await page.waitForTimeout(300);
  r.minimapRightClick = await page.evaluate(() => { const c = window.controller; return { state: c.state, targetPos: c.targetPos ? c.targetPos.toArray().map((v) => +v.toFixed(1)) : null }; });
  // 좌클릭 누르고 있기 = 카메라가 그 자리로, 놓으면 복귀
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1200);
  r.minimapHold = await page.evaluate(() => { const E = window.__e2e, c = window.controller; const f = E.cameraRig.followPos; return { camFarFromChamp: +Math.hypot(f.x - c.root.position.x, f.z - c.root.position.z).toFixed(1), focus: !!E.cameraRig.minimapFocus }; });
  await page.mouse.up(); await page.waitForTimeout(1500);
  r.minimapRelease = await page.evaluate(() => { const E = window.__e2e, c = window.controller; const f = E.cameraRig.followPos; return { camFarFromChamp: +Math.hypot(f.x - c.root.position.x, f.z - c.root.position.z).toFixed(1), focus: !!E.cameraRig.minimapFocus }; });
  // 연습 도구 켜기/끄기
  await page.click('#practiceToolsBtn'); await page.waitForTimeout(200);
  r.practiceOn = { debug: await vis('debugPanelToggle'), help: await vis('helpBox'), settings: await vis('rangeIndicatorToggle'), champPanel: await vis('championPanel') };
  await page.screenshot({ path: path.join(shotDir, 'game_screen_practice.png') });
  await page.click('#practiceToolsBtn'); await page.waitForTimeout(200);
  r.practiceOff = { help: await vis('helpBox'), settings: await vis('rangeIndicatorToggle') };
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
