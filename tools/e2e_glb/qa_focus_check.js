// QA(체크리스트 6): 창 포커스를 잃었다 돌아와도 키 입력·스킬 조준·공격 이동·카메라 상태가 남지 않는지.
// 키를 누른 채 window blur(+ visibilitychange hidden)를 보내고, 떼는 keyup은 보내지 않은 채(포커스 밖에서 뗀 상황) 다시 focus한 뒤 상태를 본다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_focus_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 }); await page.waitForTimeout(700); };
  const key = (type, code) => page.evaluate(([type, code]) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true })), [type, code]);
  const blurFocus = async (ms = 300) => {
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); });
    await page.waitForTimeout(ms);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(100);
  };
  const reset = () => page.evaluate(() => { const c = window.controller, E = window.__e2e; c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.currentTarget = null; c.targetPos = null; c._attackMoveDest = null; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.root.position.set(0, 0, 0); c.setState('IDLE'); E.skillAim.cancel(); for (const d of E.dummies) d.mesh.position.set(60, 0, 60); if (window.optionsState) window.optionsState.autoAttack = false; });
  const r = {};
  await load('nilah');
  // 마우스를 화면 가운데 땅 위에 둔다(lastGroundPoint)
  await page.mouse.move(500, 300);
  // a) 표시기 사용 빠른 시전: Q 누른 채 포커스 잃음
  await reset(); await page.evaluate(() => window.__e2e.skillAim.setMode('indicator'));
  await key('keydown', 'KeyQ'); const aimA = await page.evaluate(() => window.__e2e.skillAim.aiming);
  await blurFocus();
  r.indicatorQ = { aimingBefore: aimA, aimingAfter: await page.evaluate(() => window.__e2e.skillAim.aiming), castHappened: await page.evaluate(() => window.controller.cooldowns.Q > 0) };
  await key('keyup', 'KeyQ');
  // b) 일반 시전: 대상 지정 E(커서 아래 대상 없음 → 조준 대기) 상태에서 포커스 잃음
  await reset(); await page.evaluate(() => window.__e2e.skillAim.setMode('normal'));
  await key('keydown', 'KeyE'); const aimB = await page.evaluate(() => window.__e2e.skillAim.aiming);
  await key('keyup', 'KeyE');
  await blurFocus();
  r.normalTargetedE = { aimingBefore: aimB, aimingAfter: await page.evaluate(() => window.__e2e.skillAim.aiming) };
  await page.evaluate(() => window.__e2e.skillAim.cancel());
  // c) Space(카메라 챔피언 고정), Tab(점수판), `(챔피언만 공격) 누른 채 포커스 잃음
  await reset();
  await page.evaluate(() => { window.__e2e.cameraRig.locked = false; });
  await key('keydown', 'Space'); await key('keydown', 'Tab'); await key('keydown', 'Backquote');
  const held = await page.evaluate(() => ({ space: window.__e2e.cameraRig.centerHeld, champsOnly: window.__championsOnlyHeld, sb: !!document.querySelector('#scoreboard.show, .scoreboard.show, #scoreboardOverlay.show') }));
  await blurFocus();
  r.heldKeys = { before: held, after: await page.evaluate(() => ({ space: window.__e2e.cameraRig.centerHeld, champsOnly: window.__championsOnlyHeld, sb: !!document.querySelector('#scoreboard.show, .scoreboard.show, #scoreboardOverlay.show') })) };
  await page.evaluate(() => { window.__e2e.cameraRig.locked = true; });
  // d) 공격 이동(A) 대기 중 포커스 잃음 → 돌아와서 좌클릭하면 공격 이동이 나가는가
  await reset();
  await key('keydown', 'KeyA'); await key('keyup', 'KeyA');
  const cursorA = await page.evaluate(() => window.__e2e.renderer.domElement.style.cursor);
  await blurFocus();
  const cursorAfter = await page.evaluate(() => window.__e2e.renderer.domElement.style.cursor);
  await page.mouse.click(520, 330, { button: 'left' });
  await page.waitForTimeout(150);
  r.attackMove = { cursorBefore: cursorA, cursorAfter, attackMoveFiredOnClickAfterRefocus: await page.evaluate(() => !!window.controller._attackMoveDest) };
  // e) 미니맵 좌클릭 끌기 중 포커스 잃음(뗀 이벤트 없음)
  await reset();
  const mm = await page.evaluate(() => { const c = document.querySelector('#minimapCanvas, canvas.minimap, #minimap canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: c.id || c.className }; });
  if (mm) {
    await page.mouse.move(mm.x, mm.y); await page.mouse.down({ button: 'left' });
    const focusBefore = await page.evaluate(() => !!window.__e2e.cameraRig.minimapFocus);
    await blurFocus();
    r.minimapDrag = { canvas: mm.id, focusBefore, focusAfterBlur: await page.evaluate(() => !!window.__e2e.cameraRig.minimapFocus) };
    await page.mouse.up({ button: 'left' });
    r.minimapDrag.afterRealUp = await page.evaluate(() => !!window.__e2e.cameraRig.minimapFocus);
  } else r.minimapDrag = 'minimap canvas not found';
  // f) 바루스 Q 충전(일반 시전) 중 포커스 잃음 - 떼는 입력이 없다
  await load('varus'); await page.mouse.move(500, 300);
  await reset(); await page.evaluate(() => window.__e2e.skillAim.setMode('normal'));
  await key('keydown', 'KeyQ');
  const ch = await page.evaluate(() => ({ charging: !!window.controller._varus.qCharge, aiming: window.__e2e.skillAim.aiming }));
  await blurFocus(400);
  const ch2 = await page.evaluate(() => ({ charging: !!window.controller._varus.qCharge, aiming: window.__e2e.skillAim.aiming, heldKey: window.__e2e.skillAim.heldKey }));
  await page.waitForTimeout(5000);
  const ch3 = await page.evaluate(() => ({ charging: !!window.controller._varus.qCharge, aiming: window.__e2e.skillAim.aiming, cdQ: +window.controller.cooldowns.Q.toFixed(2) }));
  r.varusQCharge = { before: ch, rightAfterRefocus: ch2, after5s: ch3 };
  // 바루스 Q 충전 + 표시기 모드
  await reset(); await page.evaluate(() => { window.controller._varus.qCharge = null; window.__e2e.skillAim.setMode('indicator'); });
  await key('keydown', 'KeyQ');
  await blurFocus(400);
  r.varusQChargeIndicator = await page.evaluate(() => ({ charging: !!window.controller._varus.qCharge, aiming: window.__e2e.skillAim.aiming }));
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
