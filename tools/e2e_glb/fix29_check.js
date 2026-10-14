// 29차 수정 점검(헤드리스 Chromium + 저장소 모델): 리 신 Q2 돌진 중 바라보는 방향, 리 신 W 대상 지정(빈 땅·자신·와드·아군),
// 노틸러스 Q 닻·닻줄 표시와 당김 시간.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/fix29_check.js [스크린샷 접두어]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const wait = (ms) => page.waitForTimeout(ms);
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); await wait(700); };
  const reset = () => page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c.attackOrderActive = false;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
    for (const d of E.dummies) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d._pullState = null; d.mesh.position.set(40, 0, 40); }
  });
  const r = {};

  // 1) 리 신 Q2: Q1이 정면 대상에 맞은 뒤(이미 그쪽을 보는 상태 = 180° 회전 상태) 2타 돌진 중 대상 쪽을 본다
  await load('leesin');
  r.leeQ2 = [];
  for (const scen of ['facingAlready', 'afterWalkAway']) {
    await reset();
    r.leeQ2.push(await page.evaluate((scen) => new Promise((res) => {
      const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
      c._leesin.qMarkTarget = null; d.mesh.position.set(0, 0, -L(800));
      c.castAbility('Q', E.getWorldPosition(d).clone());
      setTimeout(() => {
        if (scen === 'afterWalkAway') c.moveTo(new E.THREE.Vector3(L(600), 0, L(300)));
        setTimeout(() => {
          c.castAbility('Q', null);
          let maxErr = 0, samples = 0;
          const iv = setInterval(() => {
            if (!c._dashState) return;
            const f = new E.THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion);
            const to = new E.THREE.Vector3().subVectors(d.mesh.position, c.root.position).setY(0);
            if (to.lengthSq() > 1e-4) { maxErr = Math.max(maxErr, Math.acos(Math.max(-1, Math.min(1, f.dot(to.normalize())))) * 180 / Math.PI); samples++; }
          }, 20);
          setTimeout(() => { clearInterval(iv); res({ scen, dashSamples: samples, maxFacingErrDeg: Math.round(maxErr) }); }, 600);
        }, 500);
      }, 1100);
    }), scen));
  }

  // 2) 리 신 W: 빈 땅(안 씀) / 자기 자신(자기 보호막) / 와드(반경 100 안, 돌진) / 아군 더미(돌진 + 둘 다 보호막)
  const leeW = (setup) => page.evaluate((setup) => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c._leesin.wMarkReadyUntil = 0; c.cooldowns.W = 0; c.mp = c.maxMp; c._placedWards = []; c.root.position.set(0, 0, 0);
    let point, ally = null;
    if (setup === 'empty') point = new E.THREE.Vector3(0, 0, -L(500));
    if (setup === 'self') point = c.root.position.clone();
    if (setup === 'ward') { c._placedWards = [{ position: new E.THREE.Vector3(0, 0, -L(500)), expiresAt: performance.now() + 60000 }]; point = new E.THREE.Vector3(L(60), 0, -L(530)); }
    if (setup === 'ally') { ally = E.createAllyDummy(new E.THREE.Vector3(0, 0, -L(500))); E.placedAllies.push(ally); point = ally.mesh.position.clone(); }
    const mp0 = c.mp, s0 = c.shield;
    c.castAbility('W', point);
    setTimeout(() => {
      const out = { setup, cast: c.mp < mp0, selfShield: Math.round(c.shield - s0), movedLol: Math.round(E.worldDistanceToLol(c.root.position.length())), allyShield: ally ? Math.round(ally.shield || 0) : null };
      if (ally) { const i = E.placedAllies.indexOf(ally); if (i >= 0) E.placedAllies.splice(i, 1); if (ally.labelDiv && ally.labelDiv.parentNode) ally.labelDiv.parentNode.removeChild(ally.labelDiv); if (ally.mesh) E.scene.remove(ally.mesh); }
      c.shield = 0; if (c.shieldEntries) c.shieldEntries.length = 0;
      res(out);
    }, 600);
  }), setup);
  await reset();
  r.leeW = [];
  for (const s of ['empty', 'self', 'ward', 'ally']) { r.leeW.push(await leeW(s)); await page.evaluate(() => { const c = window.controller; c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); }); await wait(200); }

  // 3) 노틸러스 Q: 닻 비행 중·당기는 중 닻줄 표시, 당김 0.9초(게임 시간), 끝나면 표시 제거
  await load('nautilus'); await reset();
  r.nautilusQ = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    d.mesh.position.set(0, 0, -L(700));
    c.castAbility('Q', E.getWorldPosition(d).clone());
    let chainDuringTravel = false, chainDuringPull = false, hitAt = null, pullGameSec = 0, hitSprites = 0; let last = performance.now();
    const sprites0 = E.vfx.active.filter((f) => f.sprite).length;
    const iv = setInterval(() => {
      const now = performance.now();
      const n = c._nautilus;
      if (n.qTravel && n.qChain) chainDuringTravel = true;
      if (n.qPull && n.qChain) chainDuringPull = true;
      hitSprites = Math.max(hitSprites, E.vfx.active.filter((f) => f.sprite).length - sprites0);
      if (n.qPull) { if (hitAt == null) hitAt = now; }
      last = now;
    }, 15);
    setTimeout(() => { clearInterval(iv); res({ chainDuringTravel, chainDuringPull, chainCleared: !c._nautilus.qChain && !E.vfx.active.some((f) => f.tag === 'nautilusChain'), maxExtraSprites: hitSprites, pullDurationData: c._champData().Q.pullDurationSec, gapLol: Math.round(E.worldDistanceToLol(Math.abs(d.mesh.position.z - c.root.position.z))) }); }, 3000);
    void pullGameSec; void last;
  }));
  if (process.argv[2]) {
    await reset();
    await page.evaluate(() => { document.querySelectorAll('.panelHeader').forEach((h) => { h.parentElement.style.visibility = 'hidden'; }); for (const id of ['championPanel', 'championPanelToggle', 'debugPanel', 'debugPanelToggle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } });
    await page.evaluate(() => { const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0]; d.mesh.position.set(L(250), 0, -L(700)); c.castAbility('Q', E.getWorldPosition(d).clone()); });
    await page.waitForFunction(() => { const n = window.controller._nautilus; return n.qPull && n.qPull.remainingSec < 0.6; }, null, { timeout: 8000, polling: 10 });
    await page.screenshot({ path: `${process.argv[2]}_nautilusPull.png` });
  }
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
