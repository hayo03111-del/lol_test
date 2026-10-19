// 72차 점검(헤드리스 Chromium): Esc = 설정 창(탭 전환, 스킬 시전 방식·HUD 크기·미니언 체력바·카메라 고정 바로 적용, 새로고침 뒤에도 유지,
// 기본값 복원, Esc로 닫기, 일시정지 버튼), 톱니 버튼, 원작식 포탑 체력바(크기·1000 눈금·무적 빗금·글자 배지 숨김), 콘솔 오류.
// 사용법: THREE_DIR=<three package> node tools/e2e_glb/options_turretbar_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  const load = async () => {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
    await page.waitForTimeout(800);
  };
  await load();
  await page.evaluate(() => { try { localStorage.removeItem('lolsim.options.v1'); } catch (e) {} });
  const shown = () => page.evaluate(() => document.getElementById('optionsOverlay').classList.contains('show'));
  const r = {};
  await page.mouse.move(700, 400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  r.escOpens = await shown();
  r.notPaused = await page.evaluate(() => !document.getElementById('pauseOverlay').classList.contains('show'));
  r.tabs = await page.$$eval('#optTabs [data-tab]', (els) => els.map((e) => e.textContent));
  await page.selectOption('#optBody select[data-opt="castMode"]', 'quick'); await page.waitForTimeout(150);
  r.castMode = await page.evaluate(() => window.__e2e.skillAim.mode);
  await page.click('#optBody [data-opt="cameraLocked"]'); await page.waitForTimeout(150);
  r.cameraUnlocked = await page.evaluate(() => !window.__e2e.cameraRig.locked);
  await page.click('#optTabs [data-tab="ui"]'); await page.waitForTimeout(150);
  await page.$eval('#optBody input[data-opt="hudScale"]', (el) => { el.value = '0.8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#optBody [data-opt="showMinionBars"]'); await page.waitForTimeout(150);
  r.hudScale = await page.evaluate(() => getComputedStyle(document.getElementById('hud')).zoom);
  r.minionBarsHidden = await page.evaluate(() => document.body.classList.contains('hide-minion-bars'));
  await page.screenshot({ path: path.join(shotDir, 'options_ui.png') });
  await page.click('#optTabs [data-tab="keys"]'); await page.waitForTimeout(150);
  r.keyRows = await page.$$eval('#optBody .opt-key', (els) => els.length);
  await page.screenshot({ path: path.join(shotDir, 'options_keys.png') });
  await page.click('#optPauseBtn'); await page.waitForTimeout(150);
  r.pauseBtn = await page.evaluate(() => document.getElementById('pauseOverlay').classList.contains('show'));
  await page.click('#optPauseBtn'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  r.escCloses = !(await shown());
  // 새로고침 뒤에도 유지
  await load();
  r.persisted = await page.evaluate(() => ({ mode: window.__e2e.skillAim.mode, zoom: getComputedStyle(document.getElementById('hud')).zoom, minionHidden: document.body.classList.contains('hide-minion-bars') }));
  await page.click('#optionsBtn'); await page.waitForTimeout(200);
  r.gearOpens = await shown();
  await page.click('#optResetBtn'); await page.waitForTimeout(200);
  r.afterReset = await page.evaluate(() => ({ mode: window.__e2e.skillAim.mode, zoom: getComputedStyle(document.getElementById('hud')).zoom, minionHidden: document.body.classList.contains('hide-minion-bars') }));
  await page.click('#optOkBtn'); await page.waitForTimeout(150);
  // 포탑 체력바
  r.turretBar = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller;
    E.setGameTimeSec(600); // 요새화가 끝난 뒤
    const reds = E.turrets.filter((t) => t.team === 'RED' && !t.destroyed && t.labelDiv && t.labelDiv.querySelector('.structBar'));
    const outer = reds.sort((a, b) => a.mesh.position.z - b.mesh.position.z)[0];
    const p = outer.mesh.position; c.root.position.set(p.x, 0, p.z - E.lolRangeToWorld(650)); c.hp = c.maxHp = 1e6;
    E.applyDamage(outer, { rawDamage: 1800, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: c, isBasicAttack: true });
    await new Promise((res) => setTimeout(res, 1500));
    const bar = outer.labelDiv.querySelector('.structBar'), rc = bar.getBoundingClientRect();
    const inner = E.turrets.find((t) => t.team === 'RED' && t.type === 'inhibitor' && t.labelDiv);
    return { w: Math.round(rc.width), h: Math.round(rc.height), tick: bar.querySelector('.sbar-ticks').style.getPropertyValue('--tk'), fill: bar.querySelector('.fill').style.width,
      traitsShown: getComputedStyle(outer.labelDiv.querySelector('.turretTraits')).display !== 'none',
      innerInvuln: inner ? inner.labelDiv.querySelector('.structBar').dataset.invuln === '1' : null, outerInvuln: bar.dataset.invuln === '1', barAboveModel: rc.bottom <= outer.labelDiv.getBoundingClientRect().bottom + 0.5 };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotDir, 'turretbar_after.png') });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
