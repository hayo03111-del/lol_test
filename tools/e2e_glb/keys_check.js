// 34차 스코어보드·원작 키 점검(헤드리스 Chromium + 저장소 모델): Tab 누르고 있기/O 켜고 끄기, 스코어보드 내용(10줄·내 줄·데스),
// Ctrl+Q 레벨 업(스킬은 안 나감)·레벨 업 버튼, S 정지, Y 카메라 고정 해제 + 가장자리 이동 + Space 복귀, F6 더미 설치 모드.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/keys_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'ahri'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'ahri', null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const wait = (ms) => page.waitForTimeout(ms);
  const shown = () => page.evaluate(() => document.getElementById('scoreboardOverlay').classList.contains('show'));
  const r = {};
  await page.mouse.move(700, 450);

  // 데스 1회(실제 사망 처리 경로)
  await page.evaluate(() => { const c = window.controller; c.takeDamage(1e7, null, 'TRUE'); });
  await wait(300);
  r.deathsAfterDie = await page.evaluate(() => window.controller.score.deaths);

  await page.keyboard.down('Tab'); await wait(350);
  r.tabHoldShows = await shown();
  r.focusNotMoved = await page.evaluate(() => document.activeElement === document.body);
  r.rows = await page.$$eval('#scoreboardPanel .sb-row', (els) => els.length);
  r.myRow = await page.$eval('#scoreboardPanel .sb-row.me', (el) => ({ name: el.querySelector('.sb-name b').textContent, kda: el.querySelector('.sb-kda').textContent, gold: el.querySelector('.sb-gold').textContent }));
  r.enemyDummyRows = await page.$$eval('#scoreboardPanel .sb-team.red .sb-row.dummy', (els) => els.length);
  await page.screenshot({ path: path.join(shotDir, 'scoreboard.png') });
  await page.keyboard.up('Tab'); await wait(200);
  r.tabReleaseHides = !(await shown());
  await page.keyboard.press('KeyO'); await wait(200);
  r.oToggleOn = await shown();
  await page.evaluate(() => { window.controller.score.cs = 7; });
  await wait(400);
  r.csLive = await page.$eval('#scoreboardPanel .sb-row.me .sb-cs', (el) => el.textContent);
  await page.keyboard.press('KeyO'); await wait(200);
  r.oToggleOff = !(await shown());

  // 부활 대기 후 레벨 업
  await page.waitForFunction(() => window.controller.state !== 'DEAD' && window.controller.state !== 'RESPAWN', null, { timeout: 20000 });
  await page.evaluate(() => { const c = window.controller; c.skillPoints = 2; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; window.__lv = { ...c.skillLevels }; window.updateExpUIForE2E && 0; });
  await page.keyboard.press('Control+KeyQ'); await wait(200);
  r.ctrlQ = await page.evaluate(() => ({ before: window.__lv.Q, after: window.controller.skillLevels.Q, qCooldown: window.controller.cooldowns.Q, points: window.controller.skillPoints }));
  r.lvlUpButtonVisible = await page.$eval('#slotW .lvlUp', (el) => getComputedStyle(el).display !== 'none');
  await page.click('#slotW .lvlUp'); await wait(150);
  r.buttonLevelsW = await page.evaluate(() => ({ before: window.__lv.W, after: window.controller.skillLevels.W, points: window.controller.skillPoints }));
  r.lvlUpHiddenAtZero = await page.$eval('#slotE .lvlUp', (el) => getComputedStyle(el).display === 'none');
  r.pipsQ = await page.$$eval('#slotQ .rankPips span.on', (els) => els.length);

  // S 정지
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; c.moveTo(c.root.position.clone().add(new E.THREE.Vector3(E.lolRangeToWorld(1500), 0, 0))); });
  await wait(300);
  const movingBefore = await page.evaluate(() => window.controller.state);
  await page.keyboard.press('KeyS'); await wait(250);
  r.stop = { before: movingBefore, after: await page.evaluate(() => window.controller.state), targetPos: await page.evaluate(() => !!window.controller.targetPos) };

  // Y 고정 해제 → 오른쪽 가장자리로 카메라 이동 → Space 누르면 복귀
  const champX = await page.evaluate(() => window.controller.root.position.x);
  await page.keyboard.press('KeyY'); await wait(100);
  r.unlocked = await page.evaluate(() => window.__e2e.cameraRig.locked === false);
  await page.mouse.move(1439, 450); await wait(1500);
  const camOff = await page.evaluate(() => { const c = window.controller.root.position, f = window.__e2e.cameraRig.followPos; return Math.hypot(f.x - c.x, f.z - c.z); });
  r.edgePanMoved = camOff > 1;
  await page.mouse.move(700, 450);
  await page.keyboard.down('Space'); await wait(1200);
  const camBack = await page.evaluate(() => { const c = window.controller.root.position, f = window.__e2e.cameraRig.followPos; return Math.hypot(f.x - c.x, f.z - c.z); });
  await page.keyboard.up('Space');
  r.spaceRecenters = camBack < 0.5;
  r.camOff = +camOff.toFixed(2); r.camBack = +camBack.toFixed(2); r.champX = +champX.toFixed(2);
  await page.keyboard.press('KeyY'); await wait(100);
  r.relocked = await page.evaluate(() => window.__e2e.cameraRig.locked === true);

  // 연습장 전용 키
  await page.keyboard.press('F6'); await wait(100);
  r.f6DummyMode = await page.evaluate(() => document.getElementById('dummyPlaceCheckbox').checked);
  await page.keyboard.press('F6');
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
