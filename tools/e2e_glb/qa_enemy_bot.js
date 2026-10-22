// QA(95차): 적 챔피언 AI 브라우저 점검 - 봇 입장의 적 목록, 봇의 스킬·평타, 챔피언 처치 보상(양쪽), 부활,
// 일시정지 중 상태 효과 정지(게임 시계), 라인 행동(분수 → 라인·막타), 제거.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_enemy_bot.js  (실패 항목이 있으면 종료 코드 1)
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

  // 1) 봇 만들기·입장별 적 목록·교전(스킬·평타)
  r.fight = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld, id = window.__e2eEntityId;
    c.itemBonusMaxHp = 60000; c.recomputeStats(); c.hp = c.maxHp;
    E.applyStatus(c, { id: 'e2eHold', type: 'STUN', duration: 6 });
    const bot = await E.spawnEnemyBot('darius', { position: c.root.position.clone().add(new T.Vector3(0, 0, L(450))), difficulty: 'hard' });
    const seq0 = (window.gameSession.events(0).slice(-1)[0] || { seq: 0 }).seq;
    const persp = { playerSeesBot: E.getAllEnemyUnits().includes(bot), botSeesPlayer: E.withCombatActor(bot, () => E.getAllEnemyUnits().includes(c)),
      botSeesRedDummy: E.withCombatActor(bot, () => E.getAllEnemyUnits().includes(E.dummies[0])) };
    await new Promise((res) => setTimeout(res, 5000));
    const ev = window.gameSession.events(seq0);
    const casts = ev.filter((e) => e.type === 'cast' && e.entityId === id(bot)).map((e) => e.slot);
    const dmg = ev.filter((e) => e.type === 'damage' && e.sourceId === id(bot) && e.targetId === id(c)).reduce((a, e) => a + e.amount, 0);
    return { ...persp, casts: casts.join(''), dmg: Math.round(dmg), team: bot.team };
  });
  check('perspective: player sees bot, bot sees player, bot ignores red dummy', r.fight.playerSeesBot && r.fight.botSeesPlayer && !r.fight.botSeesRedDummy && r.fight.team === 'RED');
  check('fight: bot casts skills and damages the player', r.fight.casts.length >= 1 && r.fight.dmg > 0);

  // 2) 플레이어가 봇 처치 → 180골드·처치 1·이벤트, 봇 부활
  r.playerKill = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller;
    const bot = E.enemyBots[0]; const brain = bot.brain; bot.brain = null;
    c.statusEffects = []; c.hp = c.maxHp;
    const g0 = c.gold || 0, k0 = c.score.kills;
    bot.hp = 20; bot.currentTarget = null; c.selectTarget(bot);
    await new Promise((res) => setTimeout(res, 2500));
    const dead = bot.state === 'DEAD', respawnAt = bot._respawnAt, waitMs = Math.max(0, respawnAt - performance.now());
    const ev = window.gameSession.events(0).filter((e) => e.type === 'championKill').slice(-1)[0] || null;
    // 부활은 게임 시간 기준(느린 화면에서는 실제 시간보다 늦다) - 살아날 때까지(실제 최대 60초) 기다린다.
    const w0 = Date.now();
    while ((bot.state === 'DEAD' || bot.hp < bot.maxHp) && Date.now() - w0 < 60000) await new Promise((res) => setTimeout(res, 300));
    await new Promise((res) => setTimeout(res, 300));
    const spawnDist = E.worldDistanceToLol(Math.hypot(bot.root.position.x - E.getTeamSpawnPosition('RED').x, bot.root.position.z - E.getTeamSpawnPosition('RED').z));
    bot.brain = brain;
    return { dead, gold: Math.round((c.gold || 0) - g0), kills: c.score.kills - k0, event: !!ev, respawned: bot.hp === bot.maxHp && bot.state !== 'DEAD', spawnDist: Math.round(spawnDist), waitSec: +(waitMs / 1000).toFixed(1) };
  });
  check('player kill: 180+ gold, kill counted, event', r.playerKill.dead && r.playerKill.gold >= 180 && r.playerKill.kills === 1 && r.playerKill.event);
  check('bot respawns at red fountain', r.playerKill.respawned && r.playerKill.spawnDist < 400);

  // 3) 봇이 플레이어 처치 → 봇 180골드·처치 1
  r.botKill = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld;
    const bot = E.enemyBots[0];
    c.itemBonusMaxHp = 0; c.recomputeStats(); c.statusEffects = []; c.currentTarget = null; c.attackOrderActive = false;
    bot.root.position.copy(c.root.position.clone().add(new T.Vector3(0, 0, L(300))));
    bot.hp = bot.maxHp; c.hp = 60;
    E.applyStatus(c, { id: 'e2eHold2', type: 'STUN', duration: 5 });
    const g0 = bot.gold || 0, k0 = bot.score.kills;
    for (let i = 0; i < 25 && c.state !== 'DEAD'; i++) await new Promise((res) => setTimeout(res, 200));
    return { playerDead: c.state === 'DEAD', botGold: Math.round((bot.gold || 0) - g0), botKills: bot.score.kills - k0 };
  });
  check('bot kill: player dies, bot gets 180+ gold and a kill', r.botKill.playerDead && r.botKill.botGold >= 180 && r.botKill.botKills === 1);

  // 4) 일시정지: 상태 효과가 흐르지 않는다
  r.pause = await page.evaluate(async () => {
    const E = window.__e2e, bot = E.enemyBots[0];
    E.applyStatus(bot, { id: 'e2ePauseStun', type: 'STUN', duration: 1 });
    E.gameClockSetPaused(true);
    await new Promise((res) => setTimeout(res, 1600));
    E.gameClockSetPaused(false);
    const still = (bot.statusEffects || []).some((s) => s.id === 'e2ePauseStun' && s.expiresAt > E.gameNow()); // 게임 시계(일시정지 시간 제외)로 비교
    await new Promise((res) => setTimeout(res, 1300));
    const gone = !(bot.statusEffects || []).some((s) => s.id === 'e2ePauseStun' && s.expiresAt > E.gameNow());
    return { still, gone };
  });
  check('pause: a 1 s stun survives a 1.6 s pause and ends after resume', r.pause.still && r.pause.gone);

  // 5) 라인: 분수에서 출발해 웨이브와 함께 막타를 친다
  r.lane = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller;
    if (c.state === 'DEAD' && c._respawn) c._respawn();
    E.clearEnemyBots();
    c.root.position.copy(E.getTeamSpawnPosition('BLUE'));
    const bot = await E.spawnEnemyBot('ezreal', { difficulty: 'normal' });
    const sp = bot.root.position.clone();
    E.setGameTimeSec(44);
    let maxDist = 0, boughtBoots = false;
    // 게임 시간 기준(느린 화면에서는 실제 시간보다 느리게 간다): 게임 115초까지, 실제로는 최대 5분.
    const wall0 = Date.now();
    while (E.getTurretGameTimeSec() < 115 && Date.now() - wall0 < 300000) {
      await new Promise((res) => setTimeout(res, 1500));
      maxDist = Math.max(maxDist, E.worldDistanceToLol(Math.hypot(bot.root.position.x - sp.x, bot.root.position.z - sp.z)));
      if (bot.boots && bot.boots.id) boughtBoots = true;
      if (bot.score.cs >= 2) break;
    }
    return { maxDist: Math.round(maxDist), cs: bot.score.cs, boughtBoots, level: bot.champLevel };
  });
  check('lane: leaves the fountain, buys boots and last-hits minions', r.lane.maxDist > 5000 && r.lane.cs >= 1 && r.lane.boughtBoots);

  // 6) 아군(파랑) 봇: 플레이어의 적이 아니고 아군 목록에 있으며, 적 봇과 싸운다
  r.ally = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld, id = window.__e2eEntityId;
    E.clearEnemyBots();
    const p = new T.Vector3(L(2000), 0, 0);
    const ally = await E.spawnEnemyBot('garen', { team: 'BLUE', position: p.clone(), difficulty: 'hard' });
    const foe = await E.spawnEnemyBot('darius', { team: 'RED', position: p.clone().add(new T.Vector3(0, 0, L(400))), difficulty: 'hard' });
    const seq0 = (window.gameSession.events(0).slice(-1)[0] || { seq: 0 }).seq;
    await new Promise((res) => setTimeout(res, 5000));
    const ev = window.gameSession.events(seq0).filter((e) => e.type === 'damage');
    return { notEnemy: !E.getAllEnemyUnits().includes(ally), allyHits: ev.filter((e) => e.sourceId === id(ally) && e.targetId === id(foe)).length,
      foeHits: ev.filter((e) => e.sourceId === id(foe) && e.targetId === id(ally)).length, bar: ally.healthBarLabelDiv.className };
  });
  check('ally bot: not an enemy of the player, blue bar, fights the red bot', r.ally.notEnemy && r.ally.allyHits > 0 && r.ally.foeHits > 0 && /ally/.test(r.ally.bar));

  // 7) 제거
  r.remove = await page.evaluate(() => {
    const E = window.__e2e, bot = E.enemyBots[0];
    E.clearEnemyBots();
    return { empty: E.enemyBots.length === 0, detached: !bot.root.parent, notEnemy: !E.getAllEnemyUnits().includes(bot) };
  });
  check('remove: bot leaves the scene and enemy lists', r.remove.empty && r.remove.detached && r.remove.notEnemy);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
