// 칼바람 나락 구조물 점검(헤드리스 Chromium + 실제 GLB, 가렌): 포탑·억제기·넥서스·분수가 원작 좌표(HA_STRUCTURES_LOL)에
// 놓였는지, 가운데부터 외곽 포탑 → 억제기 포탑 → 억제기 → 넥서스 포탑 → 넥서스 → 분수 순서인지, 충돌 반경이 원작
// 값인지, 적 포탑이 사거리 안의 플레이어를 때리고 아군 분수가 회복하는지, 챔피언을 바꿔도 구조물이 그대로인지 확인한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/structure_check.js [스크린샷.png]
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
  const load = async (id, kr) => { await page.setInputFiles('#glbFileInput', { name: kr + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, kr + '.glb')) }); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); };
  await load('garen', '가렌'); await page.waitForTimeout(800);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = {};
  r.layout = await page.evaluate(() => {
    const E = window.__e2e, L = (w) => Math.round(E.worldDistanceToLol(w));
    const all = [...E.turrets.map((t) => ({ kind: t.type, team: t.team, o: t })), ...E.inhibitorBuildings.map((o) => ({ kind: 'inhibitorBuilding', team: o.team, o })), ...E.nexusBuildings.map((o) => ({ kind: 'nexus', team: o.team, o }))];
    const pos = (o) => E.getWorldPosition(o);
    // 원작 좌표와의 차이(LoL 단위)
    const S = E.HA_STRUCTURES_LOL, want = [];
    for (const team of ['BLUE', 'RED']) { const s = S[team]; want.push([team, 'outer1', s.outer], [team, 'inhibitor', s.inhibTurret], [team, 'nexusTwin', s.nexusTurrets[0]], [team, 'nexusTwin', s.nexusTurrets[1]], [team, 'nexusWell', s.fountain], [team, 'inhibitorBuilding', s.inhibitor], [team, 'nexus', s.nexus]); }
    let maxErrLol = 0; const missing = [];
    for (const [team, kind, xz] of want) {
      const w = E.haLolToWorld(xz);
      const best = Math.min(...all.filter((a) => a.team === team && a.kind === kind).map((a) => Math.hypot(pos(a.o).x - w.x, pos(a.o).z - w.z)));
      if (!isFinite(best)) missing.push(team + ':' + kind); else maxErrLol = Math.max(maxErrLol, L(best));
    }
    // 가운데(z=0)부터의 순서
    const order = {};
    for (const team of ['BLUE', 'RED']) {
      order[team] = all.filter((a) => a.team === team).map((a) => ({ k: a.kind, d: L(Math.abs(pos(a.o).z)) })).sort((a, b) => a.d - b.d).map((a) => `${a.k}@${a.d}`);
    }
    return { counts: { turrets: E.turrets.length, inhibitors: E.inhibitorBuildings.length, nexus: E.nexusBuildings.length }, maxErrLol, missing, order,
      radiiLol: { turret: L(E.turrets.find((t) => t.type === 'outer1').collisionRadius), inhibitor: L(E.inhibitorBuildings[0].collisionRadius), nexus: L(E.nexusBuildings[0].collisionRadius) } };
  });
  // 충돌: 파랑 외곽 포탑 한가운데로 걸어가도 몸통 안으로 못 들어간다(밀어내기가 이동보다 먼저라 한 프레임 이동량만큼은
  // 접촉 거리보다 안쪽에서 멈출 수 있다 - 기존 동작)
  r.collision = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, t = E.turrets.find((x) => x.team === 'BLUE' && x.type === 'outer1'), tp = E.getWorldPosition(t);
    c.root.position.set(tp.x, 0, tp.z + 2.5); c.moveTo(new E.THREE.Vector3(tp.x, 0, tp.z));
    setTimeout(() => { const p = c.root.position; const d = E.worldDistanceToLol(Math.hypot(p.x - tp.x, p.z - tp.z)); res({ distToTurretLol: Math.round(d), turretRadiusLol: Math.round(E.worldDistanceToLol(t.collisionRadius)), blocked: d >= E.worldDistanceToLol(t.collisionRadius), contactLol: Math.round(E.worldDistanceToLol(t.collisionRadius + c.collisionRadius)) }); }, 1500);
  }));
  // 적(빨강) 외곽 포탑 사거리 안에 서 있으면 맞는다
  r.enemyTurret = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1'), tp = E.getWorldPosition(t);
    c.hp = c.maxHp; c.root.position.set(tp.x, 0, tp.z - E.lolRangeToWorld(500)); c.targetPos = null;
    const hp0 = c.hp; setTimeout(() => res({ tookDamage: c.hp < hp0, dmg: Math.round(hp0 - c.hp), turretTarget: t.attackTarget === c }), 3000);
  }));
  // 아군(파랑) 분수에서 회복
  r.fountain = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, w = E.turrets.find((x) => x.team === 'BLUE' && x.type === 'nexusWell'), wp = E.getWorldPosition(w);
    c.root.position.set(wp.x, 0, wp.z); c.hp = Math.round(c.maxHp * 0.3); const hp0 = c.hp;
    setTimeout(() => res({ healed: c.hp > hp0, hpPct: Math.round(c.hp / c.maxHp * 100) }), 1500);
  }));
  // 가운데(허수아비 자리)는 어느 포탑 사거리에도 들지 않는다
  r.centerSafe = await page.evaluate(() => { const E = window.__e2e, R = E.lolRangeToWorld(775); return E.turrets.filter((t) => t.type !== 'nexusWell').every((t) => Math.hypot(E.getWorldPosition(t).x, E.getWorldPosition(t).z) > R + E.lolRangeToWorld(800)); });
  // 챔피언을 바꿔도 구조물은 그대로(중복 생성 없음)
  await page.evaluate(() => { window.controller.root.position.set(0, 0, 0); });
  const sceneBefore = await page.evaluate(() => window.__e2e.scene.children.length);
  await load('ashe', '애쉬'); await wait(800);
  r.afterSwitch = await page.evaluate((n0) => { const E = window.__e2e; return { turrets: E.turrets.length, inhibitors: E.inhibitorBuildings.length, nexus: E.nexusBuildings.length, sceneDelta: E.scene.children.length - n0 }; }, sceneBefore);
  if (process.argv[2]) {
    await page.evaluate(() => { const cv = document.querySelector('canvas'); const keep = new Set(); for (let n = cv; n; n = n.parentElement) keep.add(n); document.querySelectorAll('body *').forEach((el) => { if (!keep.has(el) && !el.contains(cv)) el.style.visibility = 'hidden'; }); });
    await page.evaluate(() => { const E = window.__e2e; window.__e2eShowMap = true; E.visionSystem.setEnabled(false); if (E.howlingAbyssMap.group) E.howlingAbyssMap.group.visible = true; for (const b of E.brushSystem.brushes) if (b.group) b.group.visible = true; });
    // 파랑 기지 쪽(외곽 포탑 ~ 분수)과 빨강 기지 쪽을 각각 찍는다.
    // 게임 카메라는 플레이어를 따라가므로 플레이어를 각 기지 앞(외곽 포탑과 억제기 포탑 사이)으로 옮겨서 찍는다.
    for (const [suffix, z] of [['_blue', -42], ['_red', 42]]) {
      await page.evaluate((z) => { const c = window.controller; c.targetPos = null; c.root.position.set(-3, 0, z); c.hp = c.maxHp; c.isUntargetable = true; }, z);
      await wait(2500); await page.screenshot({ path: process.argv[2].replace(/\.png$/, suffix + '.png') });
    }
  }
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
