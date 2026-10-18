// 35차 리 신 R → Q2 점검(헤드리스 Chromium + 저장소 모델): R로 차서 날아가는 대상에게 Q2를 쓰면
// (1) 리 신이 공중에 뜨지 않고(높이 0 유지) (2) 날아가는 대상을 끝까지 따라가 닿는 순간 피해가 들어가고 잠금이 풀린다.
// 멈춰 있는 대상의 Q2(기존 동작)도 함께 확인: 0.35초 안팎에 도착·피해.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/leesin_rq2_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'leesin'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'leesin', null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const scenario = (withR) => page.evaluate((withR) => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c._clearActionTimers && c._clearActionTimers();
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c._dashState = null;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.skillLevels = { Q: 3, W: 1, E: 1, R: 1 };
    c.root.position.set(0, 0, 0);
    d.hp = d.maxHp = 1e5; d.statusEffects = []; d._pullState = null; d.mesh.position.set(0, 0, -L(300));
    const out = { maxLeeY: 0, samples: [] };
    // Q2 준비: 표식만 바로 단다(Q1 음파 비행 시간 생략).
    c._leesin.qMarkTarget = d; c._leesin.qMarkExpiresAt = performance.now() + 3000;
    const startQ2 = () => {
      const hp0 = d.hp, t0 = performance.now();
      out.distAtQ2 = +E.worldDistanceToLol(Math.hypot(d.mesh.position.x - c.root.position.x, d.mesh.position.z - c.root.position.z)).toFixed(0);
      out.targetYAtQ2 = +d.mesh.position.y.toFixed(2);
      c.castAbility('Q', d.mesh.position.clone());
      const iv = setInterval(() => {
        out.maxLeeY = Math.max(out.maxLeeY, c.root.position.y);
        if (d.hp < hp0 && out.hitMs == null) {
          out.hitMs = Math.round(performance.now() - t0);
          out.gapAtHitLol = Math.round(E.worldDistanceToLol(Math.hypot(d.mesh.position.x - c.root.position.x, d.mesh.position.z - c.root.position.z)));
          out.targetStillFlying = !!d._pullState;
        }
        if (performance.now() - t0 > 2600) {
          clearInterval(iv);
          out.dashEnded = !c._dashState;
          out.lockReleased = c.currentActionKey !== 'leesinQ2';
          out.finalLeeY = +c.root.position.y.toFixed(3);
          out.finalGapLol = Math.round(E.worldDistanceToLol(Math.hypot(d.mesh.position.x - c.root.position.x, d.mesh.position.z - c.root.position.z)));
          out.maxLeeY = +out.maxLeeY.toFixed(3);
          res(out);
        }
      }, 16);
    };
    if (!withR) { startQ2(); return; }
    c.currentTarget = d;
    c.castAbility('R');
    // 발차기가 꽂히고(시전 0.25초) 대상이 날아가기 시작한 직후 Q2.
    const w = setInterval(() => { if (d._pullState && d._pullState.elapsed > 0.05) { clearInterval(w); startQ2(); } }, 10);
  }), withR);
  const r = { stationary: await scenario(false), afterR: await scenario(true), errors };
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
