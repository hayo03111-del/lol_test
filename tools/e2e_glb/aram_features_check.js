// 74차 최신 칼바람 맵 장치 점검(헤드리스 Chromium): 맵 길이(1.3배), 회복 유물 4개(등장 시간·먹으면 8%·빛줄기 16%·90초 뒤 재등장),
// 서리 관문(찍어서 들어가면 외곽 포탑 뒤로 이동, 옆을 지나가기만 하면 안 탐, 외곽 포탑이 부서지면 억제기 포탑으로), 부쉬 6곳, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/aram_features_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = {};
  r.map = await page.evaluate(() => { const E = window.__e2e, W = E.worldDistanceToLol; const z = (t) => E.turrets.find((x) => x.team === t && x.type === 'outer1').mesh.position.z;
    return { lengthScale: E.howlingAbyssMap.lengthScale, outerToOuterLol: Math.round(W(z('RED') - z('BLUE'))), brushes: E.brushSystem ? E.brushSystem.brushes.length : null }; });
  r.relicsBefore = await page.evaluate(() => window.__aram.relics.map((x) => [x.team, x.kind, x.active]));
  await page.evaluate(() => window.__e2e.setGameTimeSec(160));
  await wait(800);
  r.relicsAt160 = await page.evaluate(() => window.__aram.relics.map((x) => [x.team, x.kind, x.active]));
  // 먹기: 체력을 절반으로 줄이고 바깥 유물 위로
  r.pickup = await page.evaluate(async () => {
    const c = window.controller, rel = window.__aram.relics.find((x) => x.team === 'BLUE' && x.kind === 'outer');
    c.hp = c.maxHp * 0.5; const missing = c.maxHp - c.hp;
    c.root.position.set(rel.pos.x, 0, rel.pos.z);
    await new Promise((res) => setTimeout(res, 600));
    const healed1 = (c.hp - c.maxHp * 0.5) / missing;
    const hpAfterPick = c.hp, missing2 = c.maxHp - c.hp;
    await new Promise((res) => setTimeout(res, 6000));
    return { instantPct: +healed1.toFixed(3), beamPct: +((c.hp - hpAfterPick) / missing2).toFixed(3), active: rel.active, nextSpawnIn: Math.round(rel.nextSpawnAt - window.__e2e.getTurretGameTimeSec()) };
  });
  await page.screenshot({ path: path.join(shotDir, 'aram_relic.png') });
  // 관문: 옆을 지나가기만 하면 안 탐 / 찍으면 탐
  r.gate = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, gate = window.__aram.gates.find((g) => g.team === 'BLUE');
    c.hp = c.maxHp; c.targetPos = null; c._dashState = null;
    c.root.position.set(gate.pos.x, 0, gate.pos.z);
    await new Promise((res) => setTimeout(res, 800));
    const walkedOn = !!c._dashState;
    c.root.position.set(gate.pos.x, 0, gate.pos.z - E.lolRangeToWorld(400));
    c.targetPos = gate.pos.clone(); c.setState('MOVE');
    await new Promise((res) => setTimeout(res, 5000));
    const outer = E.turrets.find((t) => t.team === 'BLUE' && t.type === 'outer1');
    const distToOuter = Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x - outer.mesh.position.x, c.root.position.z - outer.mesh.position.z)));
    outer.destroyed = true;
    const exitInhib = window.__aram.exit(gate), inhib = E.turrets.find((t) => t.team === 'BLUE' && t.type === 'inhibitor');
    const inhibLink = Math.round(E.worldDistanceToLol(Math.hypot(exitInhib.x - inhib.mesh.position.x, exitInhib.z - inhib.mesh.position.z)));
    outer.destroyed = false;
    return { walkedOnTriggers: walkedOn, distToOuterAfterGate: distToOuter, exitAfterOuterDownNearInhib: inhibLink };
  });
  await page.screenshot({ path: path.join(shotDir, 'aram_gate.png') });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
