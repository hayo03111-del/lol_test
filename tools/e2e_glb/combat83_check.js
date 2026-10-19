// 83차 평타 메커니즘 점검(헤드리스 Chromium + 실제 GLB): 평타 타이머(이동·재명령으로 공짜 초기화가 안 되는지), 선딜 취소 시 타이머
// 반환, 평타 초기화 스킬(가렌 Q), 대기 중 자동 공격(사거리 안만, 쫓지 않음), 공격 이동(걸어가다 사거리에 들어온 적 공격),
// 칼바람 3레벨 시작, 콘솔 오류.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/combat83_check.js
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
  const wait = (ms) => page.waitForTimeout(ms);
  await page.setInputFiles('#glbFileInput', { name: '가렌.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, '가렌.glb')) });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 30000 });
  await wait(800);
  const r = {};
  r.startLevel = await page.evaluate(() => window.controller.champLevel);
  // 공통 준비: 플레이어 (0,0), d1을 정면 distLol, 나머지는 멀리. 스윙 시작 시각을 기록한다.
  const setup = (distLol) => page.evaluate((distLol) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE');
    c.targetPos = null; c.currentTarget = null; c._attackMoveDest = null; c._awaitingAttackTimer = false; c._attackReadyAt = 0; c._attackWindupEndsAt = 0;
    c.root.position.set(0, 0, 0); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.attackOverrides = [];
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e5; d.statusEffects = []; d.attackDamage = 0; }
    d0.mesh.position.set(-60, 0, -60); d2.mesh.position.set(60, 0, -60); d1.mesh.position.set(0, 0, -L(distLol));
    window.__swings = [];
    if (!c.__wrapped) { const orig = c._markAttackSwing.bind(c); c._markAttackSwing = (w, i) => { window.__swings.push(performance.now()); return orig(w, i); }; c.__wrapped = true; }
    return { interval: +(1 / window.getFinalAttackSpeed(c.stats)).toFixed(3) };
  }, distLol);

  // 1) 평타 → 선딜 직후 짧게 이동 → 다시 공격 명령(스팸). 원작은 다음 평타가 1/공속 뒤에만 나간다.
  const s1 = await setup(120);
  r.interval = s1.interval;
  await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d1 = E.dummies[1];
    c.selectTarget(d1);
    const t0 = performance.now();
    const iv = setInterval(() => {
      const now = performance.now() - t0;
      if (now > 3000) { clearInterval(iv); res(); return; }
      // 선딜이 끝난 직후마다 살짝 옆으로 이동했다가 곧바로 다시 공격 명령
      if (c.currentPhase === 'RECOVERY') { c.moveTo(c.root.position.clone().add(new E.THREE.Vector3(0.05, 0, 0))); setTimeout(() => c.selectTarget(d1), 30); }
    }, 40);
  }));
  const sw1 = await page.evaluate(() => window.__swings.slice());
  const gaps = sw1.slice(1).map((t, i) => (t - sw1[i]) / 1000);
  r.spam = { swings: sw1.length, minGapSec: gaps.length ? +Math.min(...gaps).toFixed(3) : null, noFreeReset: gaps.length > 0 && Math.min(...gaps) >= s1.interval * 0.95 };

  // 2) 선딜 도중 이동으로 취소 → 타이머 반환 → 바로 다시 휘두를 수 있다.
  await setup(120);
  r.refund = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d1 = E.dummies[1];
    c.selectTarget(d1);
    setTimeout(() => {
      const inWindup = c.currentPhase === 'STARTUP';
      c.moveTo(c.root.position.clone().add(new E.THREE.Vector3(0.02, 0, 0)));
      setTimeout(() => { c.selectTarget(d1); setTimeout(() => res({ inWindupAtCancel: inWindup, swings: window.__swings.length, secondSwingSoon: window.__swings.length >= 2 && (window.__swings[1] - window.__swings[0]) < 400 }), 150); }, 40);
    }, 60);
  }));

  // 3) 평타 직후 가렌 Q(평타 초기화) → 다음 평타가 타이머보다 일찍 나간다.
  await setup(120);
  r.garenQReset = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d1 = E.dummies[1];
    c.selectTarget(d1);
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (c.currentPhase === 'RECOVERY') {
        clearInterval(iv);
        c.castAbility('Q');
        setTimeout(() => { const s = window.__swings; res({ swings: s.length, gapSec: s.length >= 2 ? +((s[1] - s[0]) / 1000).toFixed(3) : null, interval: +(1 / window.getFinalAttackSpeed(c.stats)).toFixed(3) }); }, 900);
      } else if (performance.now() - t0 > 2000) { clearInterval(iv); res({ timeout: true }); }
    }, 20);
  }));
  r.garenQReset.earlier = r.garenQReset.gapSec != null && r.garenQReset.gapSec < r.garenQReset.interval * 0.9;

  // 4) 대기 중 자동 공격: 사거리 안 적은 친다, 사거리 밖은 쫓지 않는다.
  await setup(120);
  await wait(700);
  r.idleAuto = await page.evaluate(() => ({ swings: window.__swings.length, target: !!window.controller.currentTarget }));
  await setup(600);
  await wait(700);
  r.idleNoChase = await page.evaluate(() => ({ swings: window.__swings.length, moved: window.controller.root.position.length() > 0.05 }));

  // 5) 공격 이동: 적(600 앞) 너머 지점으로 공격 이동 → 걸어가다 사거리에 들어오면 공격.
  await setup(600);
  r.attackMove = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c.attackMoveTo(new E.THREE.Vector3(L(80), 0, -L(1200)));
    setTimeout(() => res({ swings: window.__swings.length, attacking: c.currentTarget === E.dummies[1], keptDest: !!c._attackMoveDest }), 2500);
  }));
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
