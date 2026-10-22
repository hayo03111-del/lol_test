// QA(95차): 남은 검증 항목 - 게임 초기화를 반복해도 장면 객체가 늘지 않음(분수 링·포탑 조준선, T5) + 적 봇이 처음 상태로 되살아남,
// 허수아비 반격 피해가 평타·출처를 가짐(A6), 일시정지 5초 뒤에도 미니언이 쫓던 대상을 포기하지 않음(미니언 AI 시계, T2).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_verify95.js  (실패 항목이 있으면 종료 코드 1)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const reset = async () => {
    const before = await page.evaluate(() => window.controller);
    await page.evaluate(() => window.__e2e.resetGame());
    await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.controller.champLevel === 3, null, { timeout: 60000 });
    await page.waitForTimeout(1200);
  };
  // T5 + 봇 초기화
  await page.evaluate(async () => { const E = window.__e2e; await E.spawnEnemyBot('ashe', { difficulty: 'easy' }); });
  await reset();
  const n1 = await page.evaluate(() => window.__e2e.scene.children.length);
  await page.evaluate(() => { const b = window.__e2e.enemyBots[0]; b.gold = 9999; b.champLevel = 12; b.recomputeStats(); b.hp = 10; b.root.position.set(0, 0, 0); b._brainBak = b.brain; b.brain = null; }); // 두뇌를 잠시 꺼서 초기화 직후 상태를 본다(켜 두면 바로 아이템을 사고 라인으로 걸어 나간다)
  await reset(); await reset();
  r.reset = await page.evaluate((n1) => {
    const E = window.__e2e, b = E.enemyBots[0], sp = E.getTeamSpawnPosition('RED');
    b.brain = b._brainBak;
    return { n1, n3: E.scene.children.length, bots: E.enemyBots.length, level: b.champLevel, gold: b.gold, hpFull: b.hp === b.maxHp, atSpawn: Math.hypot(b.root.position.x - sp.x, b.root.position.z - sp.z) < 0.5 };
  }, n1);
  check('reset x3: scene object count stays flat', r.reset.n3 <= r.reset.n1);
  check('reset: enemy bot comes back at level 3, 1400 gold, full hp, red fountain', r.reset.bots === 1 && r.reset.level === 3 && r.reset.gold === 1400 && r.reset.hpFull && r.reset.atSpawn);
  await page.evaluate(() => window.__e2e.clearEnemyBots());
  // A6: 허수아비 반격
  r.dummy = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], id = window.__e2eEntityId;
    c.root.position.copy(d.mesh.position).add(new E.THREE.Vector3(1.2, 0, 0)); c.targetPos = null; c.setState('IDLE');
    const seq0 = (window.gameSession.events(0).slice(-1)[0] || { seq: 0 }).seq;
    await new Promise((res) => setTimeout(res, 3500));
    const ev = window.gameSession.events(seq0).filter((e) => e.type === 'damage' && e.targetId === id(c));
    return { hits: ev.length, fromDummy: ev.some((e) => e.sourceId === id(d)), basic: ev.some((e) => e.sourceId === id(d) && e.basicAttack) };
  });
  check('dummy counter-attack: damage carries the dummy as source and basic-attack flag', r.dummy.hits > 0 && r.dummy.fromDummy && r.dummy.basic);
  // T2: 미니언이 일시정지 5초 뒤에도 대상을 놓지 않는다
  r.minion = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c.root.position.set(0, 0, 0); c.hp = c.maxHp;
    for (const d of E.dummies) d.mesh.position.set(1e4, 0, 1e4);
    const m = E.createMinion('melee', new E.THREE.Vector3(0, 0, L(300)), E.getTurretGameTimeSec(), 'RED');
    E.minions.push(m); window.__vm = m;
    await new Promise((res) => setTimeout(res, 800));
    return { before: m.attackTarget === c };
  });
  await page.keyboard.press('Pause'); // 실제 일시정지(메인 루프 + 게임 시계)
  await page.waitForTimeout(5000);
  await page.keyboard.press('Pause');
  await page.waitForTimeout(400);
  Object.assign(r.minion, await page.evaluate(() => ({ after: window.__vm.attackTarget === window.controller, paused: document.getElementById('pauseOverlay').classList.contains('show') })));
  check('minion keeps its target through a 5 s pause (leash timer on game clock)', r.minion.before && r.minion.after);
  // 96차: 시전 시간 중 점멸 - 이즈리얼 Q를 앞쪽(+Z)으로 쏘고 시전 중 옆(+X)으로 점멸하면 새 위치에서 원래 조준점을 향해 날아간다.
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'ezreal'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'ezreal', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  r.flashAim = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld;
    c.root.position.set(0, 0, 0); c.statusEffects = []; c.cooldowns.Q = 0; c.mp = c.maxMp; c.skillLevels.Q = Math.max(1, c.skillLevels.Q || 1);
    c.summoners = { D: { id: 'flash', readyAt: 0 }, F: { id: 'heal', readyAt: 0 } };
    const aim = new T.Vector3(0, 0, L(1000));
    const before = E.projectiles.projectiles.length;
    c.castAbility('Q', aim);
    setTimeout(() => E.castSummonerSpell(c, 'D', new T.Vector3(L(400), 0, 0), null), 80);
    setTimeout(() => {
      const p = E.projectiles.projectiles.slice(before).find((x) => x.line);
      if (!p) return res({ fired: false });
      const pos = c.root.position, d = p.line.dir;
      const want = new T.Vector3(aim.x - p.line.origin.x, 0, aim.z - p.line.origin.z).normalize();
      res({ fired: true, flashedX: Math.round(E.worldDistanceToLol(pos.x)), dot: +(d.x * want.x + d.z * want.z).toFixed(3), dirX: +d.x.toFixed(3) });
    }, 420);
  }));
  check('flash during Ezreal Q cast: fires from the new spot toward the original aim point', r.flashAim.fired && r.flashAim.flashedX > 200 && r.flashAim.dot > 0.999 && r.flashAim.dirX < -0.1);
  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
