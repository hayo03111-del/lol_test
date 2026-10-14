// 27차 수정 점검(헤드리스 Chromium + 저장소 모델): 야스오 E 같은 대상 재사용 대기 안내·접근 차단, EQ 원형 표시,
// Q3→R 뒤 착지, 요네 모델 중심·W 부채꼴 표시·R 판정(뒤/끝 너머 제외), 세트 E 지면 범위·W 중앙(고정 피해) 띠·R 모션.
// 사용법: THREE_DIR=<three package> GLB_DIR=<glb 폴더> E2E_HIDE_MAP=1 node tools/e2e_glb/fix27_check.js [스크린샷 접두어]
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
  const shot = async (name) => {
    if (!process.argv[2]) return;
    await page.evaluate(() => { document.querySelectorAll('.panelHeader').forEach((h) => { h.parentElement.style.visibility = 'hidden'; }); for (const id of ['championPanel', 'championPanelToggle', 'debugPanel', 'debugPanelToggle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } });
    await page.screenshot({ path: `${process.argv[2]}_${name}.png` });
  };
  const r = {};

  // 1) 야스오 E: 같은 대상에 다시 쓰면 안내 메시지·대상 머리 위 남은 초, 잠긴 대상이 멀리 있어도 걸어가지 않는다
  await load('yasuo');
  r.yasuoE = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; }
    d0.mesh.position.set(0, 0, -L(300)); d1.mesh.position.set(40, 0, 40); d2.mesh.position.set(-40, 0, 40);
    c.root.position.set(0, 0, 0); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c._yasuo.eTargetCooldowns.clear();
    c.currentTarget = d0; c.castAbility('E', E.getWorldPosition(d0).clone());
    const firstDash = c.currentActionKey === 'yasuoE';
    setTimeout(() => {
      c.cooldowns.E = 0;
      const toastBefore = document.querySelectorAll('#skillToast .toastMsg').length;
      c.currentTarget = d0; c.castAbility('E', E.getWorldPosition(d0).clone());
      const secondDash = c.currentActionKey === 'yasuoE';
      const toast = [...document.querySelectorAll('#skillToast .toastMsg')].slice(toastBefore).map((x) => x.textContent);
      setTimeout(() => {
        const tag = [...(d0.labelDiv.querySelectorAll('.unitMarks .tag') || [])].map((x) => x.textContent);
        // 잠긴 대상을 사거리 밖(1100)에 두고 E - 걸어가면 안 된다
        const p = c.root.position.clone(); d0.mesh.position.set(p.x, 0, p.z - L(1100));
        c.currentTarget = d0; c.castAbility('E', E.getWorldPosition(d0).clone());
        setTimeout(() => res({ firstDash, secondDash, toast, tag, walkedLol: Math.round(E.worldDistanceToLol(c.root.position.distanceTo(p))), lockLeft: +c._yasuoETargetLockLeft(d0).toFixed(1) }), 600);
      }, 200);
    }, 900);
  }));
  await shot('yasuoE');

  // 2) 야스오 EQ: 돌진 중 Q → 원형 판정 + 원 반경 지면 충격파
  r.yasuoEQ = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c._yasuo.eTargetCooldowns.clear(); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c._yasuo.qStacks = 0;
    d.hp = d.maxHp = 1e6; d.mesh.position.set(0, 0, -L(300)); c.root.position.set(0, 0, 0);
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE');
    const hp0 = d.hp; let ring = null;
    c.currentTarget = d; c.castAbility('E', E.getWorldPosition(d).clone());
    setTimeout(() => {
      c.castAbility('Q', E.getWorldPosition(d).clone());
      const iv = setInterval(() => { const fx = E.vfx.active.find((f) => f.tag === 'groundShockwave'); if (fx && !ring) ring = Math.round(E.worldDistanceToLol(fx.radius)); }, 20);
      setTimeout(() => { clearInterval(iv); res({ dmg: Math.round(hp0 - d.hp), qStacks: c._yasuo.qStacks, ringRadiusLol: ring }); }, 900);
    }, 120);
  }));

  // 3) 야스오 Q3 → R: 끝나면 대상·야스오 둘 다 지면(y=0)으로
  r.yasuoR = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels.R = 1; c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE');
    d.mesh.position.set(0, 0, -L(500)); d.statusEffects = []; c.root.position.set(0, 0, 0);
    c._yasuo.qStacks = 2; c._yasuo.qStackExpiresAt = performance.now() + 6000;
    c.castAbility('Q', E.getWorldPosition(d).clone());
    const t0 = performance.now(); let rAt = null, endAt = null, maxYasuoY = 0, groundAt = null;
    const iv = setInterval(() => {
      const t = performance.now() - t0, air = (d.statusEffects || []).some((s) => s.type === 'KNOCKUP');
      if (rAt == null && air && t > 250) { rAt = t; c.currentTarget = d; c.castAbility('R', E.getWorldPosition(d).clone()); }
      if (rAt != null && endAt == null && c.currentActionKey !== 'yasuoR' && t > rAt + 100) endAt = t;
      maxYasuoY = Math.max(maxYasuoY, c.root.position.y);
      if (endAt != null && groundAt == null && d.mesh.position.y < 0.01 && c.root.position.y < 0.01) groundAt = t;
      if (t > 4500) { clearInterval(iv); res({ rCast: rAt != null, maxYasuoY: +maxYasuoY.toFixed(2), groundAfterREndMs: groundAt != null && endAt != null ? Math.round(groundAt - endAt) : null, dummyY: +d.mesh.position.y.toFixed(2), yasuoY: +c.root.position.y.toFixed(2) }); }
    }, 30);
  }));

  // 4) 요네: 대기 자세 골반이 캐릭터 중심, W 부채꼴 지면 표시, R은 경로 안 대상만(뒤·끝 너머 제외)
  await load('yone');
  r.yone = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    c.root.position.set(0, 0, 0); c.root.updateMatrixWorld(true);
    let pelvis = null; c.model.traverse((o) => { if (!pelvis && o.isBone && /^(c_)?pelvis$/i.test(o.name)) pelvis = o; });
    const pp = pelvis.getWorldPosition(c.root.position.clone());
    const pelvisOffsetLol = Math.round(E.worldDistanceToLol(Math.hypot(pp.x - c.root.position.x, pp.z - c.root.position.z)));
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; }
    d0.mesh.position.set(40, 0, 40); d1.mesh.position.set(-40, 0, 40); d2.mesh.position.set(40, 0, -40);
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
    c.castAbility('W', new E.THREE.Vector3(0, 0, -L(500)));
    let cone = null; const iv = setInterval(() => { const fx = E.vfx.active.find((f) => f.tag === 'groundShape' && f.shape.kind === 'cone'); if (fx && !cone) cone = { rangeLol: Math.round(E.worldDistanceToLol(fx.shape.range)), angleDeg: fx.shape.angleDeg }; }, 20);
    setTimeout(() => {
      clearInterval(iv);
      c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels.R = 1;
      c.root.position.set(0, 0, 0);
      d0.mesh.position.set(0, 0, L(150));      // 뒤
      d1.mesh.position.set(0, 0, -L(500));     // 경로 안
      d2.mesh.position.set(0, 0, -L(1300));    // 끝(1000) 너머
      const hp = [d0.hp, d1.hp, d2.hp];
      setTimeout(() => { window.__yoneRVis = [d0, d1, d2].map((d) => (E.visionSystem && E.visionSystem.enabled ? E.visionSystem.isVisible(d) : true)); }, 400); // 시전(0.75초) 판정 전, 시야 갱신 뒤
      c.castAbility('R', new E.THREE.Vector3(0, 0, -L(1000)));
      let line = null; const iv2 = setInterval(() => { const fx = E.vfx.active.find((f) => f.tag === 'groundShape' && f.shape.kind === 'line'); if (fx && !line) line = { lengthLol: Math.round(E.worldDistanceToLol(fx.shape.length)), widthLol: Math.round(E.worldDistanceToLol(fx.shape.width)) }; }, 20);
      setTimeout(() => { clearInterval(iv2); res({ pelvisOffsetLol, wCone: cone, rLine: line, rHitBehind: d0.hp < hp[0], rHitInside: d1.hp < hp[1], rHitBeyond: d2.hp < hp[2], rVisible: window.__yoneRVis }); }, 2200);
    }, 1200);
  }));
  await shot('yone');

  // 5) 세트: E 지면 범위(공중 스프라이트 없음), W 차징 중 사다리꼴 + 중앙 띠, R 모션
  await load('sett');
  r.settE = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; }
    // 시야 안(맵 원점 +x 쪽은 시야 밖이라 판정 대상이 아니다)에서, 정면 +x → 허수아비는 좌우(±z) 양쪽
    d0.mesh.position.set(0, 0, -L(300)); d1.mesh.position.set(0, 0, -L(800)); d2.mesh.position.set(40, 0, 40);
    c.root.position.set(0, 0, -L(550)); c.root.rotation.set(0, Math.PI / 2, 0); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
    const sprites0 = E.vfx.active.filter((f) => f.sprite).length;
    c.currentTarget = null; c.castAbility('E', null);
    let ring = null, spritesMax = 0;
    const iv = setInterval(() => { spritesMax = Math.max(spritesMax, E.vfx.active.filter((f) => f.sprite).length - sprites0); const fx = E.vfx.active.find((f) => f.tag === 'groundShockwave'); if (fx && !ring) ring = { radiusLol: Math.round(E.worldDistanceToLol(fx.radius)), y: +fx.mesh.position.y.toFixed(2) }; }, 15);
    setTimeout(() => { clearInterval(iv); res({ ring, extraSprites: spritesMax, visible: [d0, d1].map((d) => (E.visionSystem && E.visionSystem.enabled ? E.visionSystem.isVisible(d) : true)), stunned: [d0, d1].map((d) => (d.statusEffects || []).some((s) => s.type === 'STUN')) }); }, 700);
  }));
  r.settW = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.currentTarget = null;
    c.root.position.set(0, 0, 0);
    d0.mesh.position.set(0, 0, -L(400)); d1.mesh.position.set(L(300), 0, -L(700)); d2.mesh.position.set(40, 0, 40);
    for (const d of [d0, d1]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; }
    c.castAbility('W', new E.THREE.Vector3(0, 0, -L(500)));
    setTimeout(() => {
      const tele = E.vfx.active.filter((f) => f.tag === 'groundShape' && f.shape.hold).map((f) => f.shape.kind === 'trapezoid'
        ? { kind: 'trapezoid', lengthLol: Math.round(E.worldDistanceToLol(f.shape.length)), hw0Lol: Math.round(E.worldDistanceToLol(f.shape.hw0)), hw1Lol: Math.round(E.worldDistanceToLol(f.shape.hw1)) }
        : { kind: f.shape.kind, lengthLol: Math.round(E.worldDistanceToLol(f.shape.length)), widthLol: Math.round(E.worldDistanceToLol(f.shape.width)) });
      window.__settWTele = tele;
    }, 300);
    setTimeout(() => res({ telegraph: window.__settWTele, centerHit: d0.hp < 1e6, sideHit: d1.hp < 1e6 }), 1300);
  }));
  await wait(300);
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.root.position.set(0, 0, 0); c.castAbility('W', new E.THREE.Vector3(0, 0, -E.lolRangeToWorld(500))); });
  await wait(350); await shot('settW');
  await wait(1200);
  r.settR = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels.R = 1;
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; }
    d0.mesh.position.set(0, 0, -L(300)); d1.mesh.position.set(40, 0, 40); d2.mesh.position.set(-40, 0, 40);
    c.root.position.set(0, 0, 0);
    c.currentTarget = d0; c.castAbility('R', E.getWorldPosition(d0).clone());
    let maxSettY = 0, maxDummyY = 0, minGapLol = 1e9, backSlideLol = 0, prevZ = 0, ring = null; const phases = [];
    const iv = setInterval(() => {
      const s = c._sett.rSeq;
      if (s) {
        if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
        maxSettY = Math.max(maxSettY, c.root.position.y); maxDummyY = Math.max(maxDummyY, d0.mesh.position.y);
        backSlideLol = Math.max(backSlideLol, E.worldDistanceToLol(c.root.position.z - prevZ)); prevZ = c.root.position.z;
        if (s.phase === 'CARRY') minGapLol = Math.min(minGapLol, E.worldDistanceToLol(Math.hypot(d0.mesh.position.x - c.root.position.x, d0.mesh.position.z - c.root.position.z)));
      }
      const fx = E.vfx.active.find((f) => f.tag === 'groundShockwave'); if (fx && !ring) ring = Math.round(E.worldDistanceToLol(fx.radius));
    }, 20);
    setTimeout(() => {
      clearInterval(iv);
      res({ phases, maxSettYLol: Math.round(E.worldDistanceToLol(maxSettY)), maxDummyYLol: Math.round(E.worldDistanceToLol(maxDummyY)), minCarryGapLol: Math.round(minGapLol), backSlideLol: Math.round(backSlideLol),
        dummyTravelLol: Math.round(E.worldDistanceToLol(-(d0.mesh.position.z + L(300)))), dummyY: +d0.mesh.position.y.toFixed(2), landingRingLol: ring, damaged: d0.hp < 1e6, ended: !c._sett.rSeq });
    }, 6000);
  }));
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
