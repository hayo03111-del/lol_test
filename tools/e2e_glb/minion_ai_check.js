// 65차 미니언 AI 점검(헤드리스 Chromium): 웨이브 대형(근거리 가로줄 앞·원거리 뒷줄, 가로 자리 유지), 플레이어를 치던 미니언이
// 적 미니언이 오면 미니언으로 갈아탐, 웨이브끼리 싸우는 중 플레이어가 미니언을 쳐도 다른 미니언은 미니언을 계속 침(3순위 > 5순위),
// 허수아비를 때려도 레드 미니언이 몰려오지 않음, 챔피언 추격 제한(700), 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/minion_ai_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const E = window.__e2e;
    window.__clear = () => { for (const m of [...E.minions]) { m.isDead = true; E.scene.remove(m.mesh); } E.minions.length = 0; };
    window.__mk = (type, x, z, team) => { const m = E.createMinion(type, new E.THREE.Vector3(x, 0, z), E.getTurretGameTimeSec(), team); m.hp = m.maxHp = 1e5; E.minions.push(m); return m; };
    window.__player = (x, z) => { const c = window.controller; c._clearActionTimers && c._clearActionTimers(); c.currentTarget = null; c.attackOrderActive = false; c.setState('IDLE'); c.targetPos = null; c.hp = c.maxHp = 1e5; c.root.position.set(x, 0, z); };
    for (const d of E.dummies) d.mesh.position.set(40, 0, 40);
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const r = {};
  // 1) 웨이브 대형
  r.formation = await page.evaluate(async () => {
    const E = window.__e2e; window.__clear(); window.__player(30, 0);
    E.spawnMinionWave('BLUE', E.getTurretGameTimeSec());
    await new Promise((res) => setTimeout(res, 2500));
    const ms = E.minions.filter((m) => m.team === 'BLUE');
    const by = (t) => ms.filter((m) => m.type === t);
    return { count: ms.length, meleeOffsets: by('melee').map((m) => +m.laneOffset.toFixed(2)).sort((a, b) => a - b), casterOffsets: by('caster').map((m) => +m.laneOffset.toFixed(2)).sort((a, b) => a - b),
      meleeAheadOfCasters: Math.min(...by('melee').map((m) => m.mesh.position.z)) > Math.max(...by('caster').map((m) => m.mesh.position.z)),
      meleeXSpread: +(Math.max(...by('melee').map((m) => m.mesh.position.x)) - Math.min(...by('melee').map((m) => m.mesh.position.x))).toFixed(2) };
  });
  // 2) 플레이어를 치던 레드 미니언 → 블루 미니언이 들어오면 갈아탐
  r.retarget = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld; window.__clear(); window.__player(0, -L(300));
    const red = window.__mk('caster', 0, 0, 'RED'); red.moveSpeedWorld = 0;
    await new Promise((res) => setTimeout(res, 800));
    const before = red.attackTarget === window.controller ? 'player' : (red.attackTarget ? 'other' : null);
    const blue = window.__mk('melee', 0.6, -L(450), 'BLUE'); blue.moveSpeedWorld = 0;
    await new Promise((res) => setTimeout(res, 800));
    const after = red.attackTarget === blue ? 'blueMinion' : (red.attackTarget === window.controller ? 'player' : String(red.attackTarget && red.attackTarget.type));
    return { before, after };
  });
  // 3) 웨이브끼리 싸우는 중 플레이어가 레드 미니언을 쳐도 다른 레드 미니언은 블루 미니언을 계속 침
  r.noPullDuringFight = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller; window.__clear(); window.__player(1.5, -0.5);
    const b1 = window.__mk('melee', 0, -0.6, 'BLUE'), b2 = window.__mk('melee', -0.8, -0.6, 'BLUE');
    const r1 = window.__mk('melee', 0, 0.6, 'RED'), r2 = window.__mk('caster', -0.8, 2.5, 'RED');
    for (const m of [b1, b2, r1, r2]) m.moveSpeedWorld = 0;
    await new Promise((res) => setTimeout(res, 1000));
    E.applyDamage(r1, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    await new Promise((res) => setTimeout(res, 800));
    return { redCasterTarget: r2.attackTarget === c ? 'player' : (r2.attackTarget && r2.attackTarget.isMinion ? 'minion' : null), redMeleeTarget: r1.attackTarget === c ? 'player' : (r1.attackTarget && r1.attackTarget.isMinion ? 'minion' : null) };
  });
  // 4) 허수아비를 때려도 레드 미니언이 플레이어로 몰리지 않음
  r.dummyNoAggro = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller; window.__clear();
    window.__player(0, -L(650));
    const d = E.dummies[0]; d.hp = d.maxHp = 1e5; d.mesh.position.set(0, 0, -L(500));
    const red = window.__mk('melee', 0, 0, 'RED'); red.moveSpeedWorld = 0;
    E.applyDamage(d, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    await new Promise((res) => setTimeout(res, 500));
    const out = { callForHelp: !!red._callForHelp, target: red.attackTarget === c ? 'player' : null };
    d.mesh.position.set(40, 0, 40); return out;
  });
  // 5) 추격 제한: 레드 미니언이 플레이어를 쫓다가 700 넘게 끌려가면 포기
  r.leash = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller; window.__clear(); window.__player(0, -L(250));
    const red = window.__mk('melee', 0, 0, 'RED');
    await new Promise((res) => setTimeout(res, 500));
    const chasing = red.attackTarget === c;
    let gaveUp = false, maxDragLol = 0;
    for (let i = 0; i < 40 && !gaveUp; i++) {
      c.root.position.z = red.mesh.position.z - L(300); c.root.position.x = 0;
      await new Promise((res) => setTimeout(res, 150));
      maxDragLol = Math.max(maxDragLol, Math.round(E.worldDistanceToLol(Math.abs(red.mesh.position.z))));
      if (red.attackTarget !== c) gaveUp = true;
    }
    return { chasing, gaveUp, draggedLol: maxDragLol };
  });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
