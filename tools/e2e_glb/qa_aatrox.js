// QA(107차): 아트록스 - 저장소의 aatrox.glb를 불러와 패시브·Q·W·E·R이 실제 게임에서 위키 규칙대로 동작하는지 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_aatrox.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'aatrox'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'aatrox', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };

  // 0) 불러오기
  r.load = await page.evaluate(() => {
    const c = window.controller, E = window.__e2e;
    return { missing: ['Attack1', 'Attack2', 'Attack3', 'Passive_Attack', 'Q1_Ult', 'Q2_Ult', 'Q3_Ult', 'Spell3', 'Spell4', 'Idle1', 'Run_Base', 'Idle_Ult_Base', 'Run_Ult', 'Attack1_Ult'].filter((n) => !c.findAnimation(n)),
      idle: c.actionData.idle.clips[0], move: c.actionData.move.clips[0], hp: c._champData().stats.hp, ms: Math.round(window.getFinalMoveSpeedForE2E(c.stats)),
      range: Math.round(E.worldDistanceToLol(c.stats.attackRange)), ready: c._aatroxPassiveReady(), override: (c.attackOverrides || []).some((o) => o.id === 'aatroxP'),
      libOption: !!document.querySelector('#libraryChampSelect option[value="aatrox"]') };
  });
  r.icon = await page.evaluate(() => new Promise((res) => { const i = new Image(); i.onload = () => res(i.width); i.onerror = () => res(0); i.src = 'assets/champion_icons/aatrox/Q3.png'; }));
  check('load: clips, idle/run clip, stats (650 hp, 345 ms), passive ready = range 175 + 50, library entry, icons', r.load.missing.length === 0 && r.load.idle === 'Idle1' && r.load.move === 'Run_Base'
    && r.load.hp === 650 && r.load.ms === 345 && r.load.range === 225 && r.load.ready && r.load.override && r.load.libOption && r.icon > 0);

  await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.root.position.set(0, 0, 0); c.targetPos = null;
    c.skillLevels = { Q: 5, W: 5, E: 5, R: 3 };
    c.itemBonusMaxHp = 30000; c.recomputeStats(); c.hp = c.maxHp; // 점검 중 반격에 쓰러지지 않게
    const bot = await E.spawnEnemyBot('garen', { position: new E.THREE.Vector3(L(200), 0, 0), difficulty: 'easy' });
    bot.brain = null; bot.itemBonusMaxHp = 20000; bot.recomputeStats(); bot.hp = bot.maxHp; bot.targetPos = null;
    window.__bot = bot;
    const b = E.brushSystem; if (b && b.brushes) b.brushes.length = 0;
  });
  await page.evaluate(() => window.__e2e.realWait(300));

  // 1) 패시브: 실제 평타 명령 - 강화 평타(Passive_Attack)로 최대 체력 % 추가 피해·회복, 그다음 재사용 대기시간
  r.P = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, bot = window.__bot;
    c.currentTarget = null; c.attackOrderActive = false; c._aatrox.passiveReadyAt = 0; await E.realWait(200); // 패시브를 막 준비된 상태로(봇을 놓자마자 자동 평타로 쓰였을 수 있다)
    c.hp = c.maxHp * 0.5; const hp0 = c.hp, b0 = bot.hp;
    const clips = []; const iv = setInterval(() => { if (c.currentClipKey && !clips.includes(c.currentClipKey)) clips.push(c.currentClipKey); }, 30);
    c.currentTarget = bot; c.attackOrderActive = true; c._tryEngageTarget();
    for (let i = 0; i < 40 && c._aatroxPassiveReady(); i++) await E.realWait(50);
    await E.realWait(100); clearInterval(iv);
    c.currentTarget = null; c.attackOrderActive = false;
    const cdLeft = (c._aatrox.passiveReadyAt - E.gameNow()) / 1000;
    return { dmg: Math.round(b0 - bot.hp), pct4: Math.round(bot.maxHp * 0.04), healed: Math.round(c.hp - hp0), cdLeft: +cdLeft.toFixed(1), clips, range: Math.round(E.worldDistanceToLol(c.stats.attackRange)) };
  });
  check('passive: the empowered attack uses Passive_Attack, deals ~4% max hp bonus magic damage, heals, then goes on ~22s cooldown (range back to 175)',
    r.P.clips.includes('Passive_Attack') && r.P.dmg > r.P.pct4 * 0.7 && r.P.healed > r.P.pct4 * 0.4 && r.P.cdLeft > 18 && r.P.cdLeft <= 22 && r.P.range === 175);

  // 2) Q: 1·2·3타 - 강타 지점이면 공중에 뜸, 단계마다 피해 증가, 창 동안 재사용 대기시간 0, 3타 뒤 재사용 대기시간
  r.Q = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    await E.realWait(1200);
    c.root.position.set(0, 0, 0); c.targetPos = null; c.cooldowns.Q = 0; c._aatrox.passiveReadyAt = E.gameNow() + 60000;
    const res = [];
    const spots = [L(560), L(400), L(200)]; // 1타 먼 끝(강타), 2타 먼 끝(강타), 3타 원 가운데(강타)
    for (let i = 0; i < 3; i++) {
      c.currentTarget = null; c.attackOrderActive = false; c.root.position.set(0, 0, 0); c.targetPos = null;
      bot.root.position.set(spots[i], 0, 0); bot.hp = bot.maxHp; bot.statusEffects = []; bot.targetPos = null;
      E.applyStatus(bot, { id: 'qa_hold', type: 'ROOT', duration: 1.2, value: 1 }); // 반격하러 다가오지 않게 그 자리에 묶어 둔다
      const stage = c._aatrox.q ? c._aatrox.q.stage : 1;
      c.castAbility('Q', new E.THREE.Vector3(L(600), 0, 0));
      const casting = c.currentActionKey === 'aatroxQ';
      let knock = false; for (let k = 0; k < 20; k++) { await E.realWait(50); if ((bot.statusEffects || []).some((s) => s.id === 'aatroxQ_knockup')) knock = true; }
      res.push({ stage, casting, dmg: Math.round(bot.maxHp - bot.hp), knock, cdQ: +c.cooldowns.Q.toFixed(1) });
      await E.realWait(300);
    }
    // 빗나감: 옆에 있으면 1타에 맞지 않는다
    c.cooldowns.Q = 0; bot.root.position.set(0, 0, L(400)); bot.hp = bot.maxHp;
    c.castAbility('Q', new E.THREE.Vector3(L(600), 0, 0)); await E.realWait(900);
    const miss = Math.round(bot.maxHp - bot.hp);
    // 창이 지나면(4초) 마지막 시전부터 센 재사용 대기시간
    await E.realWait(4200);
    return { res, miss, cdAfterWindow: +c.cooldowns.Q.toFixed(1), window: !!c._aatrox.q };
  });
  check('Q: 3 casts (stage 1→2→3), each sweetspot knocks up, damage ramps up, cooldown 0 during the recast window and starts after the 3rd cast',
    r.Q.res.map((x) => x.stage).join() === '1,2,3' && r.Q.res.every((x) => x.casting && x.knock && x.dmg > 0) && r.Q.res[2].dmg > r.Q.res[0].dmg
    && r.Q.res[0].cdQ === 0 && r.Q.res[1].cdQ === 0 && r.Q.res[2].cdQ > 0);
  check('Q: misses an enemy beside Aatrox; an unfinished sequence goes on cooldown counted from the last cast', r.Q.miss === 0 && !r.Q.window && r.Q.cdAfterWindow > 0 && r.Q.cdAfterWindow < 6);

  // 3) W: 사슬 - 맞히면 피해·둔화, 1.5초 뒤 영역 안이면 두 번째 피해 + 끌어오기, 빠져나가면 없음
  r.W = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    const one = async (escape) => {
      c.root.position.set(0, 0, 0); c.targetPos = null; c.cooldowns.W = 0;
      bot.root.position.set(L(500), 0, 0); bot.hp = bot.maxHp; bot.statusEffects = [];
      c.castAbility('W', bot.root.position.clone());
      await E.realWait(650);
      const first = Math.round(bot.maxHp - bot.hp), slowed = (bot.statusEffects || []).some((s) => s.id === 'aatroxW_slow'), tether = !!c._aatrox.w;
      if (escape) { bot.root.position.set(L(500), 0, L(450)); E.applyStatus(bot, { id: 'qa_hold', type: 'ROOT', duration: 2, value: 1 }); } // 빠져나간 뒤 다시 걸어 들어오지 않게
      const posBefore = bot.root.position.clone();
      await E.realWait(1700);
      return { first, slowed, tether, total: Math.round(bot.maxHp - bot.hp), pulled: Math.round(E.worldDistanceToLol(Math.hypot(bot.root.position.x - posBefore.x, bot.root.position.z - posBefore.z))) };
    };
    return { stay: await one(false), escape: await one(true) };
  });
  check('W: the chain damages, slows and tethers a champion; staying in the zone deals the damage again (~2x)', r.W.stay.first > 0 && r.W.stay.slowed && r.W.stay.tether && r.W.stay.total > r.W.stay.first * 1.7);
  check('W: leaving the zone before 1.5s avoids the second hit and the pull', r.W.escape.tether && r.W.escape.total <= r.W.escape.first + 5 && r.W.escape.pulled === 0);

  // 4) E: 75~300 돌진 + 챔피언 피해 회복(기본 지속), Q 도중에도 쓰고 Q를 끊지 않는다
  r.E = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.currentTarget = null; c.attackOrderActive = false; c.root.position.set(0, 0, 0); c.targetPos = null; c.cooldowns.E = 0;
    bot.root.position.set(L(2000), 0, 0);
    c.castAbility('E', new E.THREE.Vector3(L(1000), 0, 0)); await E.realWait(600);
    const far = Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z)));
    c.root.position.set(0, 0, 0); c.cooldowns.E = 0;
    c.castAbility('E', new E.THREE.Vector3(L(20), 0, 0)); await E.realWait(400);
    const near = Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z)));
    // 회복: 챔피언에게 물리 피해 → 16%(+추가 체력 비례)
    c.hp = c.maxHp * 0.5; const hp0 = c.hp; bot.root.position.set(L(200), 0, 0); bot.hp = bot.maxHp;
    let healed = 0; const origHeal = c._aatroxHealSelf; c._aatroxHealSelf = function (a) { healed += a; return origHeal.call(this, a); }; // E 기본 지속 회복량만(룬 회복 제외)
    const dealt = E.applyDamage(bot, { rawDamage: 500, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isAbility: true, source: c });
    c._aatroxHealSelf = origHeal;
    const expectPct = 16 + 1.3 * c._aatroxBonusHp() / 100;
    // Q 시전 중 E
    c.root.position.set(0, 0, 0); c.targetPos = null; c.cooldowns.Q = 0; c._aatrox.q = null; c.cooldowns.E = 0; bot.root.position.set(L(500), 0, 0); bot.hp = bot.maxHp;
    c.castAbility('Q', new E.THREE.Vector3(L(600), 0, 0)); await E.realWait(100);
    c.castAbility('E', new E.THREE.Vector3(L(600), 0, 0));
    const keptQ = c.currentActionKey === 'aatroxQ' && !!c._dashState;
    await E.realWait(900);
    return { far, near, healPct: +(healed / dealt * 100).toFixed(1), expectPct: +expectPct.toFixed(1), keptQ, qHit: Math.round(bot.maxHp - bot.hp), eCd: c.cooldowns.E > 0 };
  });
  check('E: dash 300 (max) / 75 (min), heals 16% (+1.3% per 100 bonus hp) of champion damage, can be cast during Q without cancelling it', Math.abs(r.E.far - 300) <= 10 && Math.abs(r.E.near - 75) <= 10
    && r.E.healPct >= r.E.expectPct - 0.5 && r.E.healPct <= r.E.expectPct * 1.15 /* 룬 추가 피해(같은 적중)에서도 회복 */ && r.E.keptQ && r.E.qHit > 0 && r.E.eCd);

  // 5) R: 공격력 +40%(3랭크), 이동 속도 증가(감소), 크기, 회복 증폭, 변신 대기·이동 동작, 처치 관여 연장
  r.R = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.cooldowns.R = 0;
    const ad0 = c.stats.attackDamage, ms0 = window.getFinalMoveSpeedForE2E(c.stats);
    c.castAbility('R', null);
    await E.realWait(450);
    const ad1 = c.stats.attackDamage, ms1 = window.getFinalMoveSpeedForE2E(c.stats), size = c._sizeMods && c._sizeMods.aatroxR, idle = c._idleClips()[0], move = c._moveClips()[0];
    const ghost = (c.statusEffects || []).some((s) => s.type === 'GHOST');
    await E.realWait(2500);
    const ms2 = window.getFinalMoveSpeedForE2E(c.stats);
    const left0 = (c._aatrox.rUntil - E.gameNow()) / 1000;
    const bot = window.__bot; window.__e2e.rewardChampionKill && (bot._champContrib = new Map([[c, E.gameNow()]]), bot._lastDamageSource = c, window.__e2e.rewardChampionKill(bot));
    const left1 = (c._aatrox.rUntil - E.gameNow()) / 1000;
    return { adUp: +(ad1 / ad0).toFixed(3), msUp: Math.round(ms1 - ms0), msLater: Math.round(ms2 - ms0), size, idle, move, ghost, left0: +left0.toFixed(1), left1: +left1.toFixed(1), cd: c.cooldowns.R > 0 };
  });
  check('R: +40% AD (rank 3), big move speed burst that decays, +5% size, ghosted, ult idle/run clips', Math.abs(r.R.adUp - 1.4) < 0.01 && r.R.msUp > 150 && r.R.msLater < r.R.msUp * 0.5
    && r.R.size === 1.05 && r.R.ghost && r.R.idle === 'Idle_Ult_Base' && r.R.move === 'Run_Ult' && r.R.cd);
  check('R: a champion takedown extends it by 5s (up to 10s)', Math.abs(r.R.left1 - Math.min(10, r.R.left0 + 5)) < 0.2);
  r.Rend = await page.evaluate(async () => { const c = window.controller; c._aatrox.rUntil = window.__e2e.gameNow() + 50; await window.__e2e.realWait(300); return { ad: Math.round(c.stats.attackDamage), size: c._sizeMods && c._sizeMods.aatroxR, idle: c._idleClips()[0] }; });
  check('R: ends cleanly (size and idle clip restored)', !r.Rend.size && r.Rend.idle === 'Idle1');

  // 6) 적 봇 아트록스가 AI로 싸운다
  r.bot = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.itemBonusMaxHp = 30000; c.recomputeStats(); c.hp = c.maxHp;
    for (const b of [...E.enemyBots]) E.removeEnemyBot(b);
    const ab = await E.spawnEnemyBot('aatrox', { position: new E.THREE.Vector3(L(500), 0, 0), difficulty: 'hard' });
    ab.skillLevels = { Q: 3, W: 3, E: 3, R: 1 };
    const hp0 = c.hp;
    await E.realWait(8000);
    return { champ: ab.championId, hit: Math.round(hp0 - c.hp), cds: Object.values(ab.cooldowns).filter((x) => x > 0).length };
  });
  check('bot: an AI-controlled Aatrox fights without errors (deals damage, uses abilities)', r.bot.champ === 'aatrox' && r.bot.hit > 0 && r.bot.cds >= 1);

  // 7) 챔피언을 바꾸면 크기·변신이 남지 않는다
  await page.evaluate(() => { for (const b of [...window.__e2e.enemyBots]) window.__e2e.removeEnemyBot(b); const c = window.controller; c.cooldowns.R = 0; c.castAbility('R', null); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  r.switch = await page.evaluate(() => { const c = window.controller; let n = 0; window.__e2e.scene.traverse((o) => { if (o.name === 'aatroxInfernalChain' && o.visible) n++; }); return { chains: n, size: c._sizeMods && c._sizeMods.aatroxR, overrides: (c.attackOverrides || []).map((o) => o.id) }; });
  check('switch: after switching no chain mesh, size mod or Aatrox attack override remains', r.switch.chains === 0 && !r.switch.size && !r.switch.overrides.some((x) => /aatrox/.test(x)));

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
