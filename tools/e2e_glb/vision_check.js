// 팀 시야·스킬 예고 표시 점검(헤드리스 Chromium + 실제 GLB).
// 파랑(플레이어 팀) 시야 반경 1350, 아군 공유 시야, 빨강(적 팀) 시점 전환, 예고 표시 보이기 규칙을 확인한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/vision_check.js [스크린샷.png]
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
  await page.setInputFiles('#glbFileInput', { name: '초가스.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, '초가스.glb')) });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'chogath', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = {};
  // 1) 파랑 시야 반경 1350
  r.blue = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, V = E.visionSystem;
    c.root.position.set(0, 0, 0);
    const [d0, d1, d2] = E.dummies;
    // d1은 파랑 포탑 시야(1350) 밖이어야 한다 - 다리 방향(-z)으로 1500이면 파랑 외곽 포탑(20차 원작 배치) 시야 안이라 x축에 둔다.
    d0.mesh.position.set(0, 0, L(1300)); d1.mesh.position.set(-L(1500), 0, 0); d2.mesh.position.set(L(3000), 0, 0);
    return { ok: true };
  });
  await wait(400);
  r.blue = await page.evaluate(() => {
    const E = window.__e2e, V = E.visionSystem, [d0, d1, d2] = E.dummies;
    return { d0_1300: V.isVisible(d0), d1_1500: V.isVisible(d1), d2_3000: V.isVisible(d2), d1MeshVisible: d1.mesh.visible, turretsAllVisible: (E.turrets || []).filter((t) => t.isStructure).every((t) => V.isVisible(t) && t.mesh.visible !== false), turretCount: (E.turrets || []).filter((t) => t.isStructure).length, enemyStructuresVisible: [...E.inhibitorBuildings, ...E.nexusBuildings].filter((s) => s.team === 'RED').every((s) => V.isVisible(s)) };
  });
  // 2) 아군 공유 시야: 먼 허수아비 옆에 아군 더미
  await page.evaluate(() => { const E = window.__e2e, L = E.lolRangeToWorld; const a = E.createAllyDummy(new E.THREE.Vector3(L(3000), 0, L(400))); E.placedAllies.push(a); window.__ally = a; });
  await wait(400);
  r.allyShared = await page.evaluate(() => window.__e2e.visionSystem.isVisible(window.__e2e.dummies[2]));
  // 3) 빨강 시점: d0을 멀리 치우면 플레이어는 빨강 시야 밖(d1 1500 > 1350)
  await page.evaluate(() => { const E = window.__e2e; E.dummies[0].mesh.position.set(E.lolRangeToWorld(-5000), 0, 0); E.visionSystem.setViewTeam('RED'); });
  await wait(400);
  r.red = await page.evaluate(() => {
    const E = window.__e2e, V = E.visionSystem, c = window.controller;
    return { playerVisibleToRed: V.isVisibleTo('RED', c), playerRootVisible: c.root.visible, allyVisibleToRed: V.isVisibleTo('RED', window.__ally), allyMeshVisible: window.__ally.mesh.visible, blueTargetingUnchanged: V.isVisible(E.dummies[2]) };
  });
  // 4) 예고 표시: 빨강 시점, 플레이어 근처(빨강 시야 밖)에 초가스 Q → 'always'라 보여야 함 / 같은 자리 일반('vision') 예고는 숨김
  await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c.cooldowns.Q = 0; c.mp = c.maxMp;
    c.castAbility('Q', new E.THREE.Vector3(L(300), 0, 0));
    window.__plainTg = E.skillTelegraphs.spawn({ shape: 'circle', center: new E.THREE.Vector3(L(300), 0, 0), radius: 300, duration: 3, team: 'BLUE' });
  });
  await wait(700);
  r.telegraphRedView = await page.evaluate(() => {
    const E = window.__e2e, T = E.skillTelegraphs;
    const cho = T.active.find((t) => t.visibility === 'always');
    return { chogathQTelegraph: cho ? cho.group.visible : 'none', plainVisionTelegraph: window.__plainTg.group.visible, activeCount: T.active.length };
  });
  // 빨강 허수아비를 그 지점 근처로 옮기면 일반 예고도 보인다
  await page.evaluate(() => { const E = window.__e2e; E.dummies[1].mesh.position.set(E.lolRangeToWorld(300), 0, -E.lolRangeToWorld(600)); });
  await wait(400);
  r.plainVisibleWhenRedSees = await page.evaluate(() => window.__plainTg.group.visible);
  r.playerVisibleWhenRedNear = await page.evaluate(() => window.controller.root.visible);
  if (process.argv[2]) {
    await page.evaluate(() => { const cv = document.querySelector('canvas'); const keep = new Set(); for (let n = cv; n; n = n.parentElement) keep.add(n); document.querySelectorAll('body *').forEach((el) => { if (!keep.has(el) && !el.contains(cv)) el.style.visibility = 'hidden'; }); });
    await wait(300); await page.screenshot({ path: process.argv[2] });
  }
  // 5) 파랑 시점 복귀
  await page.evaluate(() => window.__e2e.visionSystem.setViewTeam('BLUE'));
  await wait(400);
  r.backToBlue = await page.evaluate(() => ({ playerRootVisible: window.controller.root.visible, plainTelegraphVisible: window.__plainTg.group.visible }));
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
