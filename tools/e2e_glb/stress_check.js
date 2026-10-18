// 전 챔피언 스트레스 점검(31차, 헤드리스 Chromium + 저장소 모델). 챔피언마다 Q/W/E/R을 여러 상황
// (단독 · 이동 중 · 평타 중 · 같은 키 연타 · Q→W→E→R 콤보)에서 쓴 뒤 다음 불변식을 확인한다:
//   - 페이지 오류 없음, 위치·회전이 유한한 값
//   - 일정 시간 뒤 행동 잠금이 풀려(currentActionKey 없음) 이동 명령으로 실제로 움직인다
//   - 플레이어·허수아비가 공중에 남지 않는다(y = 0), 돌진 상태가 남지 않는다, 모델이 보이고 대상 지정 불가가 풀린다
//   - 이동하면 달리기 모션, 멈추면 대기 모션으로 돌아온다(스킬 자세에 굳지 않는다)
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/stress_check.js [챔피언ID...] > out.json
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const CHAMPS = ['garen', 'darius', 'masteryi', 'leesin', 'nautilus', 'yasuo', 'yone', 'sett', 'mordekaiser', 'renekton', 'nilah', 'chogath', 'ezreal', 'ashe', 'varus', 'ahri', 'vex', 'rammus'];
const SCENARIOS = ['solo', 'moving', 'attacking', 'spam'];
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const only = process.argv.slice(2);
  const out = {};
  for (const id of CHAMPS) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_CERT/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(800);
    const issues = [];
    const runCase = (label, plan) => page.evaluate(({ label, plan }) => new Promise((resolve) => {
      const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
      // --- 초기화(이전 사례의 지속 효과 정리) ---
      try { if (c._morde && c._morde.isInDeathRealm) c._mordeEndDeathRealm('stress'); } catch (e) { /* 무시 */ }
      try { if (c._renekton && c._renekton.rActive) c._renektonEndR(); } catch (e) { /* 무시 */ }
      c._clearActionTimers && c._clearActionTimers();
      c.currentActionKey = null; c.currentPhase = null; c.phaseCancelable = false; c.targetPos = null; c.pendingMove = null; c.pendingCast = null;
      c.currentTarget = null; c.attackOrderActive = false; c._dashState = null; c._approachCast = null;
      c.setState('IDLE');
      c.statusEffects = []; c.hp = c.maxHp; c.mp = c.maxMp; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
      c.champLevel = Math.max(c.champLevel || 1, 11); c.skillLevels = { Q: 3, W: 3, E: 3, R: 2 };
      c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
      for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d._pullState = null; if (d._yasuoAirborne) d._yasuoAirborne = null; }
      d0.mesh.position.set(0, 0, -L(260)); d1.mesh.position.set(L(180), 0, -L(420)); d2.mesh.position.set(-L(200), 0, -L(380));
      for (const d of [d0, d1, d2]) d.mesh.position.y = 0;
      const tp = () => E.getWorldPosition(d0).clone();
      const cast = (slot) => { try { c.currentTarget = d0; c.castAbility(slot, tp()); } catch (e) { window.__stressErr = (window.__stressErr || []).concat(`${slot}: ${e.message}`); } };
      // --- 시나리오 실행 ---
      const t = [];
      const at = (ms, fn) => t.push(setTimeout(fn, ms));
      if (plan.kind === 'solo') at(0, () => cast(plan.slot));
      if (plan.kind === 'moving') { c.moveTo(new E.THREE.Vector3(L(600), 0, L(200))); at(250, () => cast(plan.slot)); }
      if (plan.kind === 'attacking') { d0.mesh.position.set(0, 0, -L(140)); c.selectTarget(d0); at(450, () => cast(plan.slot)); }
      if (plan.kind === 'spam') for (let i = 0; i < 5; i++) at(i * 90, () => cast(plan.slot));
      if (plan.kind === 'combo') ['Q', 'W', 'E', 'R'].forEach((s, i) => at(i * 140, () => cast(s)));
      if (plan.kind === 'comboRev') ['R', 'E', 'W', 'Q'].forEach((s, i) => at(i * 140, () => cast(s)));
      // --- 확인 ---
      const fin = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      let nan = false;
      const iv = setInterval(() => { if (!fin(c.root.position) || !fin(d0.mesh.position) || !Number.isFinite(c.root.quaternion.x)) nan = true; }, 30);
      at(plan.waitMs || 4200, () => {
        // 진행 중인 공격 명령·대상은 정리하고(정상 동작) 잠금만 본다
        c.currentTarget = null; c.attackOrderActive = false;
        const snap = { action: c.currentActionKey, phase: c.currentPhase, state: c.state, y: +c.root.position.y.toFixed(3), dash: !!c._dashState,
          visible: c.model ? c.model.visible !== false : true, untargetable: !!c.isUntargetable, dummyY: +Math.max(d0.mesh.position.y, d1.mesh.position.y, d2.mesh.position.y).toFixed(3),
          selfCC: (c.statusEffects || []).filter((s) => ['STUN', 'ROOT', 'SUPPRESSION', 'KNOCKUP', 'CHARM', 'FEAR', 'TAUNT', 'SILENCE'].includes(s.type)).map((s) => s.id) };
        const p0 = c.root.position.clone();
        c.moveTo(new E.THREE.Vector3(p0.x - L(400), 0, p0.z + L(300)));
        const topClip = () => { let best = null, w = 0; for (const a of (c.mixer._actions || [])) { if (!a.isRunning()) continue; const ew = a.getEffectiveWeight(); if (ew > w) { w = ew; best = a.getClip().name; } } return best; };
        setTimeout(() => {
          snap.movedAfterLol = Math.round(E.worldDistanceToLol(c.root.position.distanceTo(p0)));
          snap.moveClip = topClip(); snap.moveState = c.state;
          // 가까운 곳으로 이동해 멈춘 뒤 대기 모션으로 돌아오는지
          const p1 = c.root.position.clone();
          c.moveTo(new E.THREE.Vector3(p1.x + L(60), 0, p1.z));
          setTimeout(() => {
            clearInterval(iv); t.forEach(clearTimeout);
            snap.idleClip = topClip(); snap.stateIdle = c.state;
            snap.nan = nan; snap.err = window.__stressErr || []; window.__stressErr = [];
            resolve({ label, ...snap });
          }, 1400);
        }, 900);
      });
    }), { label, plan });
    const cases = [];
    for (const slot of ['Q', 'W', 'E', 'R']) for (const kind of SCENARIOS) cases.push([`${slot}.${kind}`, { kind, slot }]);
    cases.push(['combo', { kind: 'combo', waitMs: 5200 }], ['comboRev', { kind: 'comboRev', waitMs: 5200 }]);
    for (const [label, plan] of cases) {
      let r;
      try { r = await runCase(label, plan); } catch (e) { r = { label, crash: e.message.slice(0, 200) }; }
      const bad = [];
      if (r.crash) bad.push('crash:' + r.crash);
      else {
        if (r.nan) bad.push('NaN');
        if (r.err && r.err.length) bad.push('throw:' + r.err.join('|'));
        // 대상을 지정해 이어지는 평타(레넥톤은 renektonAA#), 아리 R 재시전 대기(phase 없음 - 이동·스킬 가능),
        // 마스터 이 W 명상(4초 채널, 늦게 시작한 경우 측정 순간에 아직 진행 중)은 정상이다 - 이동 가능 여부는 아래에서 따로 본다.
        const okAction = /^(attack|crit)|AA\d+$/i.test(r.action || '') || (r.action === 'ahriR' && !r.phase) || r.action === 'masteryiW';
        if (r.action && !okAction) bad.push(`locked:${r.action}/${r.phase}`);
        if (Math.abs(r.y) > 0.02) bad.push(`floatingSelf:${r.y}`);
        if (r.dummyY > 0.02) bad.push(`floatingDummy:${r.dummyY}`);
        if (r.dash) bad.push('dashLeft');
        if (!r.visible) bad.push('invisible');
        if (r.untargetable) bad.push('untargetable');
        if (r.selfCC.length) bad.push('selfCC:' + r.selfCC.join(','));
        if (r.movedAfterLol < 60) bad.push(`cantMove(${r.movedAfterLol},${r.state})`);
        else if (r.moveState === 'MOVE' && !/run|walk|move|haste/i.test(r.moveClip || '')) bad.push(`moveClip:${r.moveClip}`); // 이미 도착했거나(맵 경계에 잘린 목적지) 다른 행동 중이면 제외
        if (r.stateIdle !== 'IDLE' || !/idle/i.test(r.idleClip || '')) bad.push(`notIdle:${r.stateIdle}/${r.idleClip}`);
      }
      if (bad.length) issues.push({ case: label, bad, state: r.state });
    }
    out[id] = { issues, errors: [...new Set(errors)].slice(0, 8) };
    await page.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})();
