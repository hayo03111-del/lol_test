// QA(107차): 그웬 - 저장소의 gwen.glb를 불러와 패시브·Q·W·E·R이 실제 게임에서 위키 규칙대로 동작하는지 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_gwen.js
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
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'gwen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'gwen', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };

  // 0) 불러오기
  r.load = await page.evaluate(() => {
    const c = window.controller;
    return { missing: ['Attack1', 'Attack2', 'Attack3', 'Spell1_0', 'Spell2', 'Spell3_Dash', 'Spell4_0', 'Spell4.anm', 'Idle.anm', 'Run.anm'].filter((n) => !c.findAnimation(n)),
      idle: c.actionData.idle.clips[0], move: c.actionData.move.clips[0], hp: c._champData().stats.hp, mana: c._champData().stats.mana, ms: Math.round(window.getFinalMoveSpeedForE2E(c.stats)),
      range: Math.round(window.__e2e.worldDistanceToLol(c.stats.attackRange)), libOption: !!document.querySelector('#libraryChampSelect option[value="gwen"]') };
  });
  r.icon = await page.evaluate(() => new Promise((res) => { const i = new Image(); i.onload = () => res(i.width); i.onerror = () => res(0); i.src = 'assets/champion_icons/gwen/R3.png'; }));
  check('load: clips, idle/run clip, stats (620 hp, 330 mana, 340 ms, 150 range), library entry, icons', r.load.missing.length === 0 && r.load.idle === 'Idle.anm' && r.load.move === 'Run.anm'
    && r.load.hp === 620 && r.load.mana === 330 && r.load.ms === 340 && r.load.range === 150 && r.load.libOption && r.icon > 0);

  await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.root.position.set(0, 0, 0); c.targetPos = null;
    c.skillLevels = { Q: 5, W: 5, E: 5, R: 3 };
    const bot = await E.spawnEnemyBot('garen', { position: new E.THREE.Vector3(L(300), 0, 0), difficulty: 'easy' });
    bot.brain = null; bot.itemBonusMaxHp = 20000; bot.recomputeStats(); bot.hp = bot.maxHp; bot.targetPos = null;
    window.__bot = bot;
    const b = E.brushSystem; if (b && b.brushes) b.brushes.length = 0;
  });
  await page.evaluate(() => window.__e2e.realWait(300));

  // 1) 패시브: 기본 공격 적중 - 최대 체력 1% 추가 마법 피해, 챔피언이면 회복, 가위질 중첩
  r.P = await page.evaluate(() => {
    const c = window.controller, bot = window.__bot;
    c.hp = c.maxHp * 0.5; const hp0 = c.hp, b0 = bot.hp;
    c._gwenOnBasicAttackHit(bot);
    return { dmg: Math.round(b0 - bot.hp), maxHp1pct: Math.round(bot.maxHp * 0.01), healed: Math.round(c.hp - hp0), stacks: c._gwen.snips };
  });
  check('passive: on-hit deals ~1% max hp magic damage (after MR), heals (capped 12~40), adds a Snip stack', r.P.dmg > r.P.maxHp1pct * 0.5 && r.P.dmg <= r.P.maxHp1pct && r.P.healed > 0 && r.P.healed <= 41 && r.P.stacks === 1);

  // 2) Q: 중첩 0 vs 4 - 중첩마다 한 번 더 자른다
  r.Q = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    const once = async (stacks) => {
      c.cooldowns.Q = 0; c.mp = c.maxMp; c.root.position.set(0, 0, 0); bot.root.position.set(L(250), 0, 0); bot.hp = bot.maxHp;
      c._gwen.snips = stacks; c._gwen.snipsUntil = E.gameNow() + 5000;
      const hp0 = bot.hp, mp0 = c.mp; c.castAbility('Q', bot.root.position.clone());
      const locked = c.currentActionKey === 'gwenQ', mana = Math.round(mp0 - c.mp);
      await E.realWait(900);
      return { dmg: Math.round(hp0 - bot.hp), mana, locked, stacksAfter: c._gwen.snips, cd: c.cooldowns.Q > 0 };
    };
    const z = await once(0); const f = await once(4);
    bot.root.position.set(0, 0, L(600)); const miss = await (async () => { c.cooldowns.Q = 0; c.mp = c.maxMp; bot.hp = bot.maxHp; c.castAbility('Q', new E.THREE.Vector3(L(300), 0, 0)); await E.realWait(900); return Math.round(bot.maxHp - bot.hp); })();
    return { zero: z, four: f, miss };
  });
  check('Q: snips hit the enemy, 4 stacks deal more damage than 0, costs 40 mana, consumes stacks, misses outside the cone', r.Q.zero.dmg > 0 && r.Q.four.dmg > r.Q.zero.dmg * 1.4
    && r.Q.zero.mana === 40 && r.Q.zero.locked && r.Q.four.stacksAfter === 0 && r.Q.zero.cd && r.Q.miss === 0);

  // 3) W: 안개 - 방어력·마저, 안개 밖 적 피해 무효, 안 적 피해는 들어옴, 떠나면 자동 재사용(1회), 다시 떠나면 끝 → 재사용 대기시간
  r.W = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.mp = c.maxMp; c.cooldowns.W = 0; c.hp = c.maxHp;
    const armor0 = c.stats.armor, apBonus = 0.07 * (c.stats.abilityPower || 0);
    c.castAbility('W', null);
    await E.realWait(200);
    const armorIn = c.stats.armor;
    bot.root.position.set(L(800), 0, 0);
    const hp1 = c.hp; E.applyDamage(c, { rawDamage: 200, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: bot });
    const blockedOutside = Math.round(hp1 - c.hp) === 0;
    const hiddenFromBot = !E.withCombatActor(bot, () => E.getAllEnemyUnits().includes(c));
    bot.root.position.set(L(200), 0, 0);
    const hp2 = c.hp; E.applyDamage(c, { rawDamage: 200, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: bot });
    const hitInside = hp2 - c.hp > 1;
    const turret = E.turrets.find((t) => t.team !== c.team);
    let turretHits = null;
    if (turret) { bot.root.position.set(L(800), 0, 0); const hp3 = c.hp; E.applyDamage(c, { rawDamage: 100, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: turret }); turretHits = hp3 - c.hp > 1; }
    bot.root.position.set(L(2000), 0, 0);
    c.root.position.set(L(520), 0, 0); await E.realWait(400); // 안개 밖으로 - 자동 재사용(안개가 따라온다)
    const followed = c._gwen.mist && c._gwen.mist.recastUsed && Math.hypot(c._gwen.mist.x - c.root.position.x, c._gwen.mist.z - c.root.position.z) < L(200);
    const cdDuring = c.cooldowns.W;
    c.root.position.set(L(1300), 0, 0); await E.realWait(200); // 다시 떠나면 끝
    return { armor0: Math.round(armor0), armorIn: Math.round(armorIn), expectUp: 30 + apBonus, gotUp: armorIn - armor0, blockedOutside, hiddenFromBot, hitInside, turretHits, followed, cdDuring, ended: !c._gwen.mist, cdAfter: Math.round(c.cooldowns.W), armorAfter: Math.round(c.stats.armor) };
  });
  check('W: inside the mist Gwen gains 30 (+7% AP) armor (rank 5), enemies outside cannot damage or target her, enemies inside and turrets can', Math.abs(r.W.gotUp - r.W.expectUp) < 0.01 && r.W.blockedOutside && r.W.hiddenFromBot && r.W.hitInside && r.W.turretHits !== false);
  check('W: leaving once recalls the mist (auto recast), leaving again ends it and then the 18s cooldown starts', r.W.followed && r.W.cdDuring === 0 && r.W.ended && r.W.cdAfter >= 15 && r.W.cdAfter <= 18 && r.W.armorAfter === r.W.armor0);

  // 4) E: 350 돌진, 공속·사거리 +75·적중 시 추가 피해, 첫 적중이 재사용 대기시간을 돌려준다
  r.E = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.mp = c.maxMp; c.cooldowns.E = 0;
    bot.root.position.set(L(900), 0, 0);
    const as0 = window.getFinalAttackSpeed(c.stats), range0 = E.worldDistanceToLol(c.stats.attackRange);
    c.castAbility('E', new E.THREE.Vector3(L(1000), 0, 0));
    await E.realWait(700);
    const moved = Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z)));
    const as1 = window.getFinalAttackSpeed(c.stats), range1 = E.worldDistanceToLol(c.stats.attackRange);
    const cd0 = c.cooldowns.E, b0 = bot.hp;
    c._gwenOnBasicAttackHit(bot);
    return { moved, asUp: Math.round((as1 / as0 - 1) * 100), rangeUp: Math.round(range1 - range0), refund: +(cd0 - c.cooldowns.E).toFixed(2), cdTotal: +c._gwenFx.eCdTotal.toFixed(2), dmg: Math.round(b0 - bot.hp) };
  });
  check('E: dashes 350, +80% attack speed (rank 5), +75 range, first hit refunds 65% of the cooldown', Math.abs(r.E.moved - 350) <= 15 && r.E.asUp >= 70 && r.E.rangeUp === 75 && Math.abs(r.E.refund - r.E.cdTotal * 0.65) < 0.2);

  // 5) R: 1·3·5개 바늘, 둔화, 비용은 처음 한 번
  r.R = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.mp = c.maxMp; c.cooldowns.R = 0;
    bot.root.position.set(L(700), 0, 0); bot.hp = bot.maxHp; bot.statusEffects = [];
    const hits = [], needles = []; const mp0 = c.mp;
    const orig = c._gwenSpawnNeedle; let n = 0; c._gwenSpawnNeedle = function (...a) { n++; return orig.apply(this, a); };
    for (let i = 0; i < 3; i++) {
      const h0 = bot.hp; n = 0;
      c.castAbility('R', bot.root.position.clone());
      if (i === 0) hits.mana = Math.round(mp0 - c.mp);
      await E.realWait(1250);
      hits.push(Math.round(h0 - bot.hp)); needles.push(n);
      if (i === 0) hits.slowed = !!(bot.statusEffects || []).find((s) => s.id === 'gwenR_slow');
    }
    c._gwenSpawnNeedle = orig;
    return { hits, needles, slowed: hits.slowed, mana: hits.mana, manaAfter: Math.round(c.mp), cd: c.cooldowns.R > 0, done: !c._gwen.r };
  });
  check('R: three casts fire 1, 3 and 5 needles (more damage each time), slows, costs 100 mana once, then cooldown', r.R.needles.join() === '1,3,5' && r.R.hits[0] > 0 && r.R.hits[1] > r.R.hits[0] && r.R.hits[2] > r.R.hits[1]
    && r.R.slowed && r.R.mana === 100 && r.R.cd && r.R.done);

  // 6) 적 봇 그웬이 AI로 싸운다
  r.bot = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.itemBonusMaxHp = 30000; c.recomputeStats(); c.hp = c.maxHp;
    for (const b of [...E.enemyBots]) E.removeEnemyBot(b);
    const gb = await E.spawnEnemyBot('gwen', { position: new E.THREE.Vector3(L(500), 0, 0), difficulty: 'hard' });
    gb.skillLevels = { Q: 3, W: 3, E: 3, R: 1 };
    const hp0 = c.hp;
    await E.realWait(8000);
    return { champ: gb.championId, hit: Math.round(hp0 - c.hp), cds: Object.values(gb.cooldowns).filter((x) => x > 0).length };
  });
  check('bot: an AI-controlled Gwen fights without errors (deals damage, uses abilities)', r.bot.champ === 'gwen' && r.bot.hit > 0 && r.bot.cds >= 1);

  // 7) 챔피언을 바꾸면 안개 메시가 남지 않는다
  await page.evaluate(() => { const c = window.controller; c.mp = c.maxMp; c.cooldowns.W = 0; c.castAbility('W', null); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const b of [...window.__e2e.enemyBots]) window.__e2e.removeEnemyBot(b); const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  r.switchMist = await page.evaluate(() => { let n = 0; window.__e2e.scene.traverse((o) => { if (o.name === 'gwenHallowedMist' && o.parent && o.parent.parent !== undefined && o.visible) n++; }); return n; });
  check('switch: after switching to another champion no mist is left in the scene', r.switchMist === 0);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
