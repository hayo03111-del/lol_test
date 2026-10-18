// 47차 럭스 점검(헤드리스 Chromium + 저장소 모델): 모델 크기(SkinScale 1.5), 클립 연결, 원거리 평타 투사체,
// Q(처음 둘 피해·속박·피할 수 있음), W(럭스·아군 보호막 - 갈 때/올 때), E(날아가 영역 - 둔화, 재사용 폭발, 시간 만료 폭발,
// 날아가는 중 재사용 = 도착 즉시 폭발), R(1초 시전 뒤 직선 피해), 패시브(표식 → 평타·R로 터뜨림), 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/lux_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'lux'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'lux', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const wait = (ms) => page.waitForTimeout(ms);
  const reset = (dz = 600, dx = 0) => page.evaluate(({ dz, dx }) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c._clearActionTimers && c._clearActionTimers();
    if (c._luxReset) c._luxReset();
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c._dashState = null;
    c.runePage = null; // 52차: 룬 효과(주문 작열 등) 없이 스킬 수치만 본다
    c.statusEffects = []; c.shieldEntries = []; c.root.position.set(0, 0, 0); c.hp = c.maxHp; c.mp = c.maxMp;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 };
    for (const d of E.dummies) { d.hp = d.maxHp = 1e5; d.statusEffects = []; d._pullState = null; d.mesh.position.set(40, 0, 40); }
    E.dummies[0].mesh.position.set(L(dx), 0, -L(dz));
    c.recomputeStats();
  }, { dz, dx });
  const r = {};
  r.clips = await page.evaluate(() => { const c = window.controller, ad = c.actionData || {}; const res = (k) => ad[k] ? (c.resolveClip(ad[k].clips || []) || {}).name : null;
    return { idle: res('idle'), move: res('move'), attack1: res('attack1'), attack2: res('attack2'), hasRChannel: !!ad.hasRChannel }; });
  // 모델 크기: 화면상 키(월드) - 원작 SelectionHeight 85 근처(스킨 1.5)
  r.model = await page.evaluate(() => { const E = window.__e2e, c = window.controller; const b = new E.THREE.Box3().setFromObject(c.model);
    return { scale: +c.model.parent.scale.x.toFixed(3), heightLol: Math.round(E.worldDistanceToLol(b.max.y - b.min.y)), ranged: E.isRangedAttacker(c) }; });

  // Q: 직선 위 둘 다 맞고 속박, 셋째는 안 맞음 / 비키면 안 맞음
  await reset(500);
  r.q = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    d1.mesh.position.set(0, 0, -L(700)); if (d2) d2.mesh.position.set(0, 0, -L(900));
    c.castAbility('Q', new E.THREE.Vector3(0, 0, -5)); await new Promise((res) => setTimeout(res, 1600));
    const st = (d) => (d.statusEffects || []).map((e) => e.type);
    return { hit0: Math.round(d0.maxHp - d0.hp), hit1: Math.round(d1.maxHp - d1.hp), hit2: d2 ? Math.round(d2.maxHp - d2.hp) : 'n/a', root0: st(d0).includes('ROOT'), root1: st(d1).includes('ROOT'), marked: c._lux.marks.has(d0), cd: +c.cooldowns.Q.toFixed(1) };
  });
  await reset(800);
  r.qDodge = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c.castAbility('Q', new E.THREE.Vector3(0, 0, -5)); await new Promise((res) => setTimeout(res, 300));
    d.mesh.position.set(L(400), 0, -L(800)); await new Promise((res) => setTimeout(res, 1500));
    return Math.round(d.maxHp - d.hp);
  });
  // 패시브: Q 표식 → 평타가 터뜨림(평타 피해보다 큼)
  await reset(450);
  r.passive = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    c._luxMark(d); const h0 = d.hp; c._luxDetonateMark(d); const proc = Math.round(h0 - d.hp);
    c._luxMark(d); const h1 = d.hp; c.currentTarget = d; c.attackOrderActive = true; c._tryEngageTarget();
    await new Promise((res) => setTimeout(res, 2000));
    return { proc, attackWithMark: Math.round(h1 - d.hp), markConsumed: !c._lux.marks.has(d) };
  });
  // W: 럭스 + 경로 위 아군 보호막(갈 때/올 때)
  await reset(2000);
  r.w = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    const ally = E.createAllyDummy(new E.THREE.Vector3(0, 0, -L(600))); E.placedAllies.push(ally);
    c.castAbility('W', new E.THREE.Vector3(0, 0, -5)); await new Promise((res) => setTimeout(res, 450));
    const shieldIds = (u) => (u.shieldEntries || []).map((s) => s.id);
    const early = { lux: shieldIds(c), ally: shieldIds(ally) };
    await new Promise((res) => setTimeout(res, 900));
    const late = { lux: shieldIds(c), ally: shieldIds(ally) };
    const i = E.placedAllies.indexOf(ally); if (i >= 0) E.placedAllies.splice(i, 1); if (ally.mesh) E.scene.remove(ally.mesh); if (ally.labelDiv && ally.labelDiv.parentNode) ally.labelDiv.parentNode.removeChild(ally.labelDiv);
    return { early, late, wandsLeft: c._lux.wands.length };
  });
  // E: 지정 위치로 날아가 영역(둔화) → 재사용으로 폭발
  await reset(700);
  r.e = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c.castAbility('E', new E.THREE.Vector3(0, 0, -L(700))); await new Promise((res) => setTimeout(res, 200));
    const flying = !!(c._lux.zone && !c._lux.zone.ready);
    await new Promise((res) => setTimeout(res, 1000));
    const z = c._lux.zone; const zoneDistLol = z ? Math.round(E.worldDistanceToLol(z.end.length())) : null;
    const slowed = (d.statusEffects || []).some((e) => e.type === 'SLOW');
    const hpBefore = d.hp; const mpBefore = c.mp;
    c.castAbility('E'); await new Promise((res) => setTimeout(res, 100));
    return { flying, ready: !!(z && z.ready), zoneDistLol, slowedInZone: slowed, dmg: Math.round(hpBefore - d.hp), zoneGone: !c._lux.zone, recastFree: c.mp >= mpBefore, lingerSlow: (d.statusEffects || []).some((e) => e.type === 'SLOW'), marked: c._lux.marks.has(d) };
  });
  await reset(700);
  r.eRecastInFlight = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c.castAbility('E', new E.THREE.Vector3(0, 0, -L(700))); await new Promise((res) => setTimeout(res, 350));
    c.castAbility('E'); const armed = !!(c._lux.zone && c._lux.zone.detonateOnArrival);
    await new Promise((res) => setTimeout(res, 900));
    return { armed, dmg: Math.round(d.maxHp - d.hp), zoneGone: !c._lux.zone };
  });
  await reset(700);
  r.eExpire = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c.castAbility('E', new E.THREE.Vector3(0, 0, -L(700))); await new Promise((res) => setTimeout(res, 1000));
    c._lux.zone.expiresAt = performance.now() + 100; await new Promise((res) => setTimeout(res, 400));
    return { dmg: Math.round(d.maxHp - d.hp), zoneGone: !c._lux.zone };
  });
  // R: 1초 시전 - 그 전엔 피해 없음, 뒤에 직선 전체(멀리 있는 대상 포함) 피해
  await reset(2500);
  r.r = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1] = E.dummies;
    d1.mesh.position.set(0, 0, -L(800)); c._luxMark(d1);
    c.castAbility('R', new E.THREE.Vector3(0, 0, -5)); await new Promise((res) => setTimeout(res, 600));
    const before = Math.round(d0.maxHp - d0.hp);
    await new Promise((res) => setTimeout(res, 900));
    return { beforeCastEnd: before, far: Math.round(d0.maxHp - d0.hp), near: Math.round(d1.maxHp - d1.hp), state: c.state, cd: +c.cooldowns.R.toFixed(1) };
  });
  // 스크린샷: E 영역 + 럭스(크기 확인)
  await reset(600);
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; E.cameraRig.distance = 9; c.castAbility('E', new E.THREE.Vector3(0, 0, -E.lolRangeToWorld(500))); });
  await wait(1200);
  await page.screenshot({ path: path.join(shotDir, 'lux_e_zone.png') });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
