// 스킬 조준 점검(헤드리스 Chromium + 실제 GLB, 실제 키보드·마우스 입력): 세 가지 시전 방식(표시기 사용 빠른/일반/빠른),
// 우클릭·Esc 취소, 대상 지정 스킬의 "커서 아래 적" 지정, 바루스 Q 충전(누르고 있다가 놓으면 놓는 순간의 커서 방향으로 발사)을
// 확인하고, 조준 모양 스크린샷을 남긴다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/aim_check.js [스크린샷 접두어]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); // UI 패널에 가리지 않는 화면 영역이 넉넉하게
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const wait = (ms) => page.waitForTimeout(ms);
  const load = async (id, kr) => { await page.setInputFiles('#glbFileInput', { name: kr + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, kr + '.glb')) }); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); await wait(800); };
  // 플레이어 기준 (앞 lol, 옆 lol) 지면 좌표의 화면 위치
  const screenOf = (fwdLol, sideLol = 0) => page.evaluate(([f, s]) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, p = c.root.position;
    const v = new E.THREE.Vector3(p.x + L(s), 0, p.z + L(f)).project(E.camera);
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, [fwdLol, sideLol]);
  const reset = () => page.evaluate(() => { const c = window.controller; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 }; c.root.position.set(0, 0, 0); c.targetPos = null; c.currentTarget = null; window.__e2e.skillAim.cancel(); });
  const state = () => page.evaluate(() => { const A = window.__e2e.skillAim, c = window.controller; return { aiming: A.aiming, slot: A.slot, type: A.lastAim && A.lastAim.type, meshes: A._meshes.filter((m) => m.visible).length, cd: { ...c.cooldowns }, paused: !!document.getElementById('pauseOverlay').classList.contains('show') }; });
  const setMode = (m) => page.evaluate((m) => { const s = document.getElementById('castModeSelect'); s.value = m; s.dispatchEvent(new Event('change')); }, m);
  const r = {};

  await load('ezreal', '이즈리얼');
  r.defaultMode = await page.evaluate(() => window.__e2e.skillAim.mode);
  // 1) 표시기 사용 빠른 시전: 누르는 동안 조준(시전 안 됨), 떼면 시전
  await reset(); await setMode('indicator');
  let pt = await screenOf(600, 200); await page.mouse.move(pt.x, pt.y); await wait(200);
  await page.keyboard.down('KeyQ'); await wait(400);
  r.indicatorHeld = await state();
  await page.keyboard.up('KeyQ'); await wait(300);
  r.indicatorReleased = await state();
  // 2) 일반 시전(75차): 논타겟 스킬은 클릭 없이 누르는 즉시 커서 방향으로 시전
  await reset(); await setMode('normal');
  pt = await screenOf(500, -150); await page.mouse.move(pt.x, pt.y); await wait(200);
  await page.keyboard.press('KeyW'); await wait(400);
  r.normalNonTargetInstant = await state();
  await page.keyboard.press('KeyQ'); await wait(400);
  r.normalNonTargetInstantQ = await state();
  // 3) 빠른 시전: 누르는 즉시 시전
  await reset(); await setMode('quick');
  await page.keyboard.press('KeyE'); await wait(300);
  r.quick = await state();
  if (process.argv[2]) { await reset(); await setMode('indicator'); pt = await screenOf(700, 250); await page.mouse.move(pt.x, pt.y); await page.keyboard.down('KeyQ'); await wait(500); await page.screenshot({ path: process.argv[2] + '_ezrealQ.png' }); await page.keyboard.up('KeyQ'); }

  // 4) 대상 지정(가렌 R): 커서 아래 적(선택하지 않은 옆 허수아비)에게 시전
  await load('garen', '가렌');
  await reset(); await setMode('normal');
  // 옆 허수아비(선택 안 된 대상)를 화면 가운데 쪽(UI 패널에 가리지 않는 곳)으로 옮겨 놓고, 가운데 허수아비는 비켜 둔다.
  r.garenR = await page.evaluate(() => { const E = window.__e2e, c = window.controller, [d0, d1] = E.dummies; d1.hp = d1.maxHp = 3000; d0.mesh.position.set(-30, 0, -30); d1.mesh.position.set(0, 0, -E.lolRangeToWorld(300)); c.root.position.set(0, 0, 0); return { before: c.currentTarget === d1 }; });
  await wait(900); // 카메라가 플레이어를 따라온 뒤에 화면 좌표를 잰다
  const d1s = await page.evaluate(() => { const E = window.__e2e, p = E.getWorldPosition(E.dummies[1]); const v = new E.THREE.Vector3(p.x, 0.8, p.z).project(E.camera); const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; });
  // 대상 지정 스킬: 커서 아래 대상이 없으면 조준 → Esc 취소 / 대상을 클릭하면 시전
  const emptyAt = await screenOf(-250, 250); await page.mouse.move(emptyAt.x, emptyAt.y); await wait(200);
  await page.keyboard.press('KeyR'); await wait(300);
  r.garenRNoTargetAims = await state();
  await page.keyboard.press('Escape'); await wait(200);
  r.garenRAfterEsc = await page.evaluate(() => ({ aiming: window.__e2e.skillAim.aiming, optionsOpen: typeof isOptionsOpen === 'function' ? isOptionsOpen() : null }));
  await page.keyboard.press('KeyR'); await wait(300);
  await page.mouse.move(d1s.x, d1s.y); await wait(200);
  r.garenRAim = await page.evaluate(() => { const A = window.__e2e.skillAim; return { aiming: A.aiming, type: A.lastAim && A.lastAim.type, hoverIsDummy1: A.hoverUnit === window.__e2e.dummies[1] }; });
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] + '_garenR.png' });
  await page.mouse.click(d1s.x, d1s.y, { button: 'left' }); await wait(2500);
  r.garenRCast = await page.evaluate(() => { const E = window.__e2e, c = window.controller, d1 = E.dummies[1]; return { targetIsDummy1: c.currentTarget === d1, cdR: +c.cooldowns.R.toFixed(1), dummy1Damaged: d1.hp < d1.maxHp }; });
  // 커서가 대상 위에 있으면 대상 지정 스킬도 바로 시전
  await reset(); await page.evaluate(() => { const d1 = window.__e2e.dummies[1]; d1.hp = d1.maxHp; });
  await page.mouse.move(d1s.x, d1s.y); await wait(300);
  await page.keyboard.press('KeyR'); await wait(2500);
  r.garenRHoverInstant = await page.evaluate(() => { const E = window.__e2e, c = window.controller, d1 = E.dummies[1]; return { aiming: E.skillAim.aiming, cdR: +c.cooldowns.R.toFixed(1), dummy1Damaged: d1.hp < d1.maxHp }; });

  // 5) 바루스 Q: 누르고 있다가(충전) 놓으면, 놓는 순간의 커서 방향으로 발사
  await load('varus', '바루스');
  await reset(); await setMode('normal');
  pt = await screenOf(600, 0); await page.mouse.move(pt.x, pt.y); await wait(150);
  await page.keyboard.down('KeyQ'); await wait(700);
  r.varusCharging = await page.evaluate(() => { const A = window.__e2e.skillAim; return { aiming: A.aiming, type: A.lastAim && A.lastAim.type, lenLol: A.lastAim ? Math.round(window.__e2e.worldDistanceToLol(A.lastAim.segments[0].len)) : null }; });
  pt = await screenOf(0, 600); await page.mouse.move(pt.x, pt.y); await wait(200);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] + '_varusQ.png' });
  await page.keyboard.up('KeyQ'); await wait(300);
  r.varusReleased = await page.evaluate(() => { const c = window.controller, f = new window.__e2e.THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion); return { charging: !!c._varus.qCharge, aiming: window.__e2e.skillAim.aiming, facingDeg: Math.round(Math.atan2(f.x, f.z) * 180 / Math.PI), cdQ: +c.cooldowns.Q.toFixed(1) }; });

  // 6) 모양 스크린샷: 초가스 Q(지점 원), 세트 W(사다리꼴), 다리우스 E(부채꼴), 모데카이저 E(지점 직사각형)
  if (process.argv[2]) {
    for (const [id, kr, slot, f, s] of [['chogath', '초가스', 'Q', 1300, 300], ['sett', '세트', 'W', 600, 200], ['darius', '다리우스', 'E', 500, -200], ['mordekaiser', '모데카이저', 'E', 600, 250]]) {
      await load(id, kr); await reset(); await setMode('indicator');
      pt = await screenOf(f, s); await page.mouse.move(pt.x, pt.y); await wait(150);
      await page.keyboard.down('Key' + slot); await wait(500);
      r['shot_' + id] = await page.evaluate(() => { const A = window.__e2e.skillAim; return A.lastAim && A.lastAim.type; });
      await page.screenshot({ path: `${process.argv[2]}_${id}${slot}.png` });
      await page.evaluate(() => window.__e2e.skillAim.cancel()); await page.keyboard.up('Key' + slot); await wait(100);
    }
  }
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
