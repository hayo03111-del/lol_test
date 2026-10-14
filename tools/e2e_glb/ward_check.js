// 32차 와드 점검(헤드리스 Chromium + 저장소 모델): 설치(사거리 안 즉시·밖이면 걸어가서), 시야 공급, 은신·제어 와드 드러내기,
// 평타로 파괴(근접·원거리, 평타 1회 = 체력 1), 스킬로는 피해 없음, 와드를 대상으로 둔 채 스킬 시전, 리 신 W 와드 방호,
// 적 팀 시야로 보기에서 아군 투명 와드 숨김.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/ward_check.js [스크린샷 경로]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const load = async (id) => {
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(600);
  };
  const reset = () => page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    E.wardSystem.clear();
    c._clearActionTimers && c._clearActionTimers();
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c.attackOrderActive = false; c._wardOrder = null;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.skillLevels = { Q: 3, W: 3, E: 3, R: 2 }; c.root.position.set(0, 0, 0);
    if (c.trinket) c.trinket.charges = 2;
    for (const d of E.dummies) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d.mesh.position.set(40, 0, 40); }
  });
  const r = {};

  // 1) 설치: 사거리 안 즉시 / 밖이면 걸어가서 놓고 멈춤 / 시야 공급원 / 개수 제한
  await load('garen'); await reset();
  r.place = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, ws = E.wardSystem;
    const near = E.placeWard(c, new E.THREE.Vector3(L(300), 0, 0));
    const out = { nearOk: near === true, nearCount: ws.wards.length, charges: c.trinket.charges, moved: c.state === 'MOVE' };
    out.visionSource = E.visionSystem._collectSources(c)[E.PLAYER_TEAM].some((s) => s === ws.wards[0]._visionSource);
    const far = window.__mapClamp(new E.THREE.Vector3(-L(1000), 0, -L(900))); // 맵 안쪽 지점(맵 밖이면 가까운 걸을 수 있는 곳으로 당겨지므로 미리 맞춘다)
    E.placeWard(c, far);
    out.walking = c.state === 'MOVE' && !!c._wardOrder && ws.wards.length === 1;
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (ws.wards.length === 2 || performance.now() - t0 > 6000) {
        clearInterval(iv);
        const w = ws.wards[1];
        out.farPlaced = !!w;
        out.farAtPoint = w ? Math.round(E.worldDistanceToLol(Math.hypot(w.position.x - far.x, w.position.z - far.z))) : null;
        out.distWhenPlacedLol = w ? Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x - far.x, c.root.position.z - far.z))) : null;
        setTimeout(() => { out.stoppedAfter = c.state; out.chargesAfter = c.trinket.charges; res(out); }, 300);
      }
    }, 30);
  }));

  // 2) 은신·드러내기 + 근접 평타로 파괴(3회), 허수아비 피해 없음, 스킬 피해 없음
  const attackCase = (champ) => page.evaluate((champ) => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, ws = E.wardSystem;
    const pos = new E.THREE.Vector3(0, 0, -L(champ === 'ashe' ? 450 : 250));
    const ew = ws.place(null, 'stealth', pos, { team: 'RED', durationSec: 120 });
    const out = { hiddenBeforeReveal: !ws.targetableFor(E.PLAYER_TEAM).includes(ew), renderedHidden: ew.mesh.visible === false };
    ws.update(0.016);
    out.renderedHidden = ew.mesh.visible === false;
    ws.place(c, 'control', new E.THREE.Vector3(0, 0, -L(100)));
    ws.update(0.016);
    out.revealed = ws.targetableFor(E.PLAYER_TEAM).includes(ew) && ew.mesh.visible === true;
    out.disabled = ws.isDisabled(ew);
    const dHp = E.dummies.map((d) => d.hp);
    c.selectTarget(ew);
    const t0 = performance.now(); const hpLog = [];
    const iv = setInterval(() => {
      if (!hpLog.length || hpLog[hpLog.length - 1] !== ew.hp) hpLog.push(ew.hp);
      if (ew.destroyed || performance.now() - t0 > 9000) {
        clearInterval(iv);
        out.destroyed = ew.destroyed; out.hpSteps = hpLog; out.ms = Math.round(performance.now() - t0);
        out.dummyUnhurt = E.dummies.every((d, i) => d.hp === dHp[i]);
        out.targetCleared = c.currentTarget === null;
        res(out);
      }
    }, 20);
  }), champ);
  r.melee = await attackCase('garen');
  await load('ashe'); await reset();
  r.ranged = await attackCase('ashe');

  // 3) 스킬은 와드에 피해를 주지 않는다 + 와드를 평타 대상으로 둔 채 스킬을 써도 대상이 돌아온다
  await reset();
  r.skills = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, ws = E.wardSystem;
    const ew = ws.place(null, 'control', new E.THREE.Vector3(0, 0, -L(500)), { team: 'RED' });
    ws.update(0.016);
    c.castAbility('W', ew.position.clone()); // 애쉬 W(부채꼴 화살) - 와드 방향, 대상 지정 없음
    setTimeout(() => {
      const out = { hpAfterW: ew.hp, maxHp: ew.maxHp };
      c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns.W = 0;
      c.selectTarget(ew);
      c.castAbility('W', ew.position.clone());
      out.targetRestored = c.currentTarget === ew;
      res(out);
    }, 1500);
  }));

  // 4) 리 신 W: 자기 와드로 방호(돌진)
  await load('leesin'); await reset();
  r.leeW = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    E.placeWard(c, new E.THREE.Vector3(0, 0, -L(500)));
    const w = E.wardSystem.wards[0];
    c.castAbility('W', w.position.clone());
    setTimeout(() => res({ movedLol: Math.round(E.worldDistanceToLol(c.root.position.length())), wardAlive: !w.destroyed }), 700);
  }));

  // 5) 적 팀 시야로 보기: 아군 투명 와드는 적에게 보이지 않는다(제어 와드는 시야 안이면 보인다)
  await reset();
  r.enemyView = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, ws = E.wardSystem;
    const s = ws.place(c, 'stealth', new E.THREE.Vector3(L(200), 0, 0), { durationSec: 90 });
    E.visionSystem.setViewTeam('RED'); ws.update(0.016);
    const out = { ownStealthHiddenToRed: s.mesh.visible === false };
    E.visionSystem.setViewTeam(E.PLAYER_TEAM); ws.update(0.016);
    out.ownStealthShownToSelf = s.mesh.visible === true;
    return out;
  });

  if (process.argv[2]) {
    await reset();
    await page.evaluate(() => {
      document.querySelectorAll('.panelHeader').forEach((h) => { h.parentElement.style.visibility = 'hidden'; });
      for (const id of ['championPanel', 'championPanelToggle', 'debugPanel', 'debugPanelToggle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
      const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, ws = E.wardSystem;
      window.__e2eShowMap = true;
      E.placeWard(c, new E.THREE.Vector3(L(220), 0, -L(120)));
      ws.place(c, 'control', new E.THREE.Vector3(-L(200), 0, -L(160)));
      const ew = ws.place(null, 'stealth', new E.THREE.Vector3(L(40), 0, -L(330)), { team: 'RED', durationSec: 120 });
      ew.hp = 2;
      ws._refreshBar(ew);
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: process.argv[2] });
  }
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
