// 모데카이저 죽음의 세계 점검(헤드리스 Chromium + 실제 GLB): R 시전 후 제자리 경기장·경계·강탈·혼령·종료를 확인한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/realm_check.js [스크린샷.png]
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
  await page.setInputFiles('#glbFileInput', { name: '모데카이저.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, '모데카이저.glb')) });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'mordekaiser', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const setup = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    for (const u of E.dummies) { u.hp = u.maxHp = 3000; u.statusEffects = []; }
    const dp = E.getWorldPosition(d); c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(400));
    c.cooldowns.R = 0; c.currentTarget = d;
    window.__castAt = performance.now();
    window.__before = { c: c.root.position.clone(), d: dp.clone(), armor: d.armor, maxHp: c.maxHp, scene: E.scene.children.length, fog: !!E.scene.fog };
    c.castAbility('R', dp.clone());
    return { dummies: E.dummies.length };
  });
  await page.waitForTimeout(1200);
  const mid = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], b = window.__before, W = E.lolRangeToWorld(1);
    const others = E.dummies.slice(1);
    const opac = (u) => { let o = null; u.mesh.traverse((m) => { if (m.isMesh && o == null && m.material && !Array.isArray(m.material)) o = m.material.opacity; }); return o; };
    const r = { inRealm: c._morde.isInDeathRealm, realm: c.realmId, dummyRealm: d.realmId,
      morderMovedLol: Math.round(c.root.position.distanceTo(b.c) / W), dummyMovedLol: Math.round(E.getWorldPosition(d).distanceTo(b.d) / W),
      armor: d.armor, armorBefore: b.armor, maxHpGain: Math.round(c.maxHp - b.maxHp), dummyMaxHp: d.maxHp, fog: !!E.scene.fog,
      sceneAdded: E.scene.children.length - b.scene, othersOpacity: others.map(opac), targetOpacity: opac(d),
      scale: +c.root.scale.x.toFixed(3), dummyScale: +d.mesh.scale.x.toFixed(3),
      enteredAfterCastMs: Math.round(c._morde.rEndsAt - 7000 - window.__castAt), center: (() => { const R = c._morde.realmId && getDeathRealmForE2E(c._morde.realmId); return R ? { distMordeLol: Math.round(c.root.position.distanceTo(R.center) / W), radiusLol: Math.round(R.radius / W) } : null; })() };
    // 경계 밖으로 이동 명령 → 경계 안에서 멈춰야 한다
    // R 시전 잠금이 풀린 뒤, 대상 반대쪽(경계까지 약 550)으로 3000만큼 이동 명령
    window.__movePos0 = c.root.position.clone();
    const away = c.root.position.clone().sub(E.getWorldPosition(d)).setY(0).normalize();
    const tryMove = () => { if (c.currentActionKey === 'rCast') return setTimeout(tryMove, 50); c.currentTarget = null; c.moveTo(c.root.position.clone().addScaledVector(away, E.lolRangeToWorld(3000))); };
    tryMove();
    return r;
  });
  await page.waitForTimeout(3200);
  const mid2 = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], others = E.dummies.slice(1);
    const R = getDeathRealmForE2E(c._morde.realmId);
    const pm = c.root.position.clone().multiplyScalar(1.01); const pm2 = pm.clone(); window.__mapClamp(pm2);
    const out = { mordeAtMapEdge: pm2.distanceTo(pm) > 1e-6, movedLol: Math.round(c.root.position.distanceTo(window.__movePos0) / E.lolRangeToWorld(1)), afterMoveOutDistFromCenterLol: R ? Math.round(c.root.position.distanceTo(R.center) / E.lolRangeToWorld(1)) : null, scale: +c.root.scale.x.toFixed(3), dummyScale: +d.mesh.scale.x.toFixed(3) };
    // 바깥 허수아비 공격 시도 → 피해 없어야 한다
    if (others[0]) { window.__otherHp = others[0].hp; c.root.position.copy(E.getWorldPosition(others[0])).add(new E.THREE.Vector3(0, 0, E.lolRangeToWorld(150))); c.selectTarget(others[0]); }
    return out;
  });
  await page.waitForTimeout(1500);
  // 경계 밖으로 향하는 넉백(강제 이동)은 경계에서 멈춰야 한다(PC 위키)
  mid2.knockOut = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], R = getDeathRealmForE2E(c._morde.realmId);
    if (!R) return res(null);
    const mapEdge = (p) => { const q = p.clone(); window.__mapClamp(q); const q2 = p.clone().multiplyScalar(1.01); window.__mapClamp(q2); return q2.distanceTo(p.clone().multiplyScalar(1.01)) > 1e-6; };
    const from = E.getWorldPosition(d).clone(); const dir = from.clone().sub(R.center).setY(0).normalize();
    d._pullState = { from, to: from.clone().addScaledVector(dir, E.lolRangeToWorld(3000)), duration: 0.5, elapsed: 0 };
    setTimeout(() => res({ distFromCenterLol: Math.round(E.getWorldPosition(d).distanceTo(R.center) / E.lolRangeToWorld(1)), atMapEdge: mapEdge(E.getWorldPosition(d)), airborneDuringMove: !!window.__airSeen }), 1400);
    setTimeout(() => { window.__airSeen = (d.statusEffects || []).some((e) => e.type === 'KNOCKUP'); }, 150);
  }));
  mid2.otherDamaged = await page.evaluate(() => { const o = window.__e2e.dummies[1]; return o ? Math.round(window.__otherHp - o.hp) : null; });
  // 캡처할 때만 UI 패널을 숨기고 게임 화면(캔버스)만 남긴다.
  await page.evaluate(() => { const cv = document.querySelector('canvas'); const keep = new Set(); for (let n = cv; n; n = n.parentElement) keep.add(n); document.querySelectorAll('body *').forEach((el) => { if (!keep.has(el) && !el.contains(cv)) el.style.visibility = 'hidden'; }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: process.argv[2] || 'realm.png' });
  await page.evaluate(() => document.querySelectorAll('body *').forEach((el) => { el.style.visibility = ''; }));
  await page.waitForTimeout(2000);
  const end = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], b = window.__before;
    const opac = (u) => { let o = null; u.mesh.traverse((m) => { if (m.isMesh && o == null && m.material && !Array.isArray(m.material)) o = m.material.opacity; }); return o; };
    return { inRealm: c._morde.isInDeathRealm, realm: c.realmId, dummyRealm: d.realmId, armor: d.armor, maxHpBack: Math.round(c.maxHp - b.maxHp), dummyMaxHp: d.maxHp,
      fog: !!E.scene.fog, fogBefore: b.fog, sceneDiff: E.scene.children.length - b.scene, othersOpacity: E.dummies.slice(1).map(opac), scale: +c.root.scale.x.toFixed(3), dummyScale: +d.mesh.scale.x.toFixed(3) };
  });
  console.log(JSON.stringify({ setup, mid, mid2, end, errors: errors.slice(0, 5) }, null, 1));
  await browser.close(); srv.close();
})();
