// QA(105차): 쉔 - 저장소의 shen.glb를 불러와 패시브·Q·W·E·R이 실제 게임에서 동작하는지 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_shen.js
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
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'shen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'shen', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const wait = (ms) => page.evaluate((ms) => window.__e2e.realWait(ms), ms);

  // 0) 불러오기: 모델·동작·데이터·아이콘
  r.load = await page.evaluate(() => {
    const c = window.controller;
    return { clips: ['Attack1', 'Attack2', 'Spell1', 'Spell2', 'Spell3', 'Spell4', 'Spell1_Attack1', 'Spell1_Attack2', 'Spell1_Attack3', 'Idle1', 'Run1'].filter((n) => !c.findAnimation(n)),
      hp: c._champData().stats.hp, energy: c.maxMp, ms: Math.round(window.getFinalMoveSpeedForE2E(c.stats)), libOption: !!document.querySelector('#libraryChampSelect option[value="shen"]') };
  });
  r.icon = await page.evaluate(() => new Promise((res) => { const i = new Image(); i.onload = () => res(i.width); i.onerror = () => res(0); i.src = 'assets/champion_icons/shen/icon.png'; }));
  check('load: model, all used animation clips, stats (base 610 hp, 400 energy, 340 ms), library entry, icon', r.load.clips.length === 0 && r.load.hp === 610 && r.load.energy === 400 && r.load.ms === 340 && r.load.libOption && r.icon > 0);

  // 무대: 다리 가운데, 미니언 없음, 적 봇(가렌) 하나, 스킬 레벨
  await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.root.position.set(0, 0, 0); c.targetPos = null;
    c.skillLevels = { Q: 5, W: 5, E: 5, R: 3 };
    const bot = await E.spawnEnemyBot('garen', { position: new E.THREE.Vector3(L(450), 0, 0), difficulty: 'easy' });
    bot.brain = null; bot.itemBonusMaxHp = 20000; bot.recomputeStats(); bot.hp = bot.maxHp; bot.targetPos = null;
    window.__bot = bot;
    const b = E.brushSystem; if (b && b.brushes) b.brushes.length = 0;
  });
  await wait(500);

  // 1) E: 적 쪽으로 돌진 - 피해·도발, 기력 회복, 패시브 보호막
  r.E = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, bot = window.__bot;
    c.mp = 200; const hp0 = bot.hp, mp0 = c.mp, from = c.root.position.clone();
    c.castAbility('E', bot.root.position.clone());
    const mpAfterCost = c.mp;
    await E.realWait(1200);
    return { dmg: Math.round(hp0 - bot.hp), taunt: !!(bot.statusEffects || []).find((s) => s.type === 'TAUNT'), moved: Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x - from.x, c.root.position.z - from.z))),
      mpCost: Math.round(mp0 - mpAfterCost), mpBack: Math.round(c.mp - mpAfterCost), shield: Math.round(c.shield || 0), cd: c.cooldowns.E > 0 };
  });
  check('E: dashes 300~600, damages and taunts the enemy champion, costs 150 energy and restores some on hit', r.E.dmg > 50 && r.E.taunt && r.E.moved >= 290 && r.E.moved <= 610 && r.E.mpCost === 150 && r.E.mpBack >= 20 && r.E.cd);
  check('passive: casting an ability gives a Ki Barrier shield', r.E.shield > 30);

  // 2) Q: 검이 적을 지나 쉔에게 - 둔화·강화, 다음 평타 3회 추가 피해
  r.Q = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    for (const s of [...(bot.statusEffects || [])]) bot.statusEffects = [];
    c.root.position.set(0, 0, 0); c.targetPos = null; bot.root.position.set(L(300), 0, 0); bot.targetPos = null;
    c._shen.blade = { x: L(700), z: 0 }; // 검은 적 너머에
    c.mp = c.maxMp; c.cooldowns.Q = 0;
    await E.realWait(200);
    const range0 = c.stats.attackRange;
    c.castAbility('Q', null);
    const castOk = !!c._shen.recall && c._shen.qAttacks === 0; // 강화는 검이 도착해야
    await E.realWait(900);
    const rangeUp = Math.round(E.worldDistanceToLol(c.stats.attackRange - range0));
    const slowed = !!(bot.statusEffects || []).find((s) => s.type === 'SLOW');
    const s = c._shen;
    return { castOk, slowed, empowered: s.qEmpowered, bladeHome: !s.recall, bladeNear: Math.round(E.worldDistanceToLol(Math.hypot(s.blade.x - c.root.position.x, s.blade.z - c.root.position.z))),
      override: (c.attackOverrides || []).some((o) => o.id === 'shenQ'), rangeUp };
  });
  check('Q: blade flies back through the enemy champion (slow), on arrival the next 3 attacks are empowered (+75 range, Spell1_Attack clips)', r.Q.castOk && r.Q.slowed && r.Q.empowered && r.Q.bladeHome && r.Q.bladeNear < 150 && r.Q.override && r.Q.rangeUp === 75);
  // (기다리는 동안 쉔이 가까운 적을 저절로 칠 수 있다 - 남은 횟수만큼만 직접 맞혀 본다)
  r.Qhit = await page.evaluate(() => {
    const c = window.controller, bot = window.__bot;
    const left0 = c._shen.qAttacks;
    const one = () => { const h = bot.hp; c._shenOnBasicAttackHit(bot); return h - bot.hp; };
    const d = []; for (let i = 0; i < left0 + 1; i++) d.push(Math.round(one()));
    return { left0, d, left: c._shen.qAttacks };
  });
  check('Q: the remaining empowered hits (of 3) deal max-health magic damage, then it ends', r.Qhit.left0 >= 1 && r.Qhit.d.slice(0, r.Qhit.left0).every((x) => x > 300) && r.Qhit.d[r.Qhit.left0] === 0 && r.Qhit.left === 0);

  // 3) W: 검 둘레 영역 - 안의 쉔은 적의 기본 공격을 막고, 밖이면 맞는다
  r.W = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.mp = c.maxMp; c.cooldowns.W = 0; c._shen.blade = { x: c.root.position.x, z: c.root.position.z };
    c.castAbility('W', null);
    const ehp = () => c.hp + (c.shield || 0); // 보호막(기 보호막)까지 합친 실질 체력
    const hp0 = ehp();
    E.applyDamage(c, { rawDamage: 200, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: bot });
    const blocked = ehp() === hp0;
    const tur = E.turrets.find((t) => t.team === 'RED');
    E.applyDamage(c, { rawDamage: 200, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: tur }); // 포탑 공격은 막지 않는다
    const turretHit = ehp() < hp0;
    const hpT = ehp();
    E.applyDamage(c, { rawDamage: 200, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, source: bot });
    const spellHit = ehp() < hpT;
    await E.realWait(2000);
    const hp1 = ehp();
    E.applyDamage(c, { rawDamage: 200, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: bot });
    return { blocked, turretHit, spellHit, afterExpiry: ehp() < hp1 };
  }).catch((e) => ({ err: e.message }));
  check('W: Shen inside the zone activates it at once - enemy basic attacks are blocked (turret shots and spells are not); after 1.75s attacks land again', r.W.blocked && r.W.turretHit && r.W.spellHit && r.W.afterExpiry);

  // 4) R: 아군 허수아비에게 보호막 → 3초 정신 집중 → 그 곁으로 순간 이동
  r.R = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c.root.position.set(0, 0, 0); c.targetPos = null;
    const sp = E.getTeamSpawnPosition('BLUE'), ap0 = new E.THREE.Vector3(sp.x * 0.5, 0, sp.z * 0.5); // 다리 위(맵 안) 먼 곳
    const ally = E.createAllyDummy(ap0);
    E.placedAllies.push(ally); // 연습 도구의 "아군 더미 설치"와 같이 목록에 넣는다
    ally.hp = ally.maxHp * 0.5;
    c.mp = c.maxMp; c.cooldowns.R = 0;
    c.castAbility('R', ap0.clone());
    const shield = Math.round(ally.shield || 0), channeling = !!c._shen.r, farLol = Math.round(E.worldDistanceToLol(Math.hypot(ap0.x, ap0.z)));
    await E.realWait(1500);
    const midDist = E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z));
    await E.realWait(2500);
    const ap = E.getWorldPosition(ally);
    return { shield, channeling, farLol, midDist: Math.round(midDist), endDist: Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x - ap.x, c.root.position.z - ap.z))), done: !c._shen.r, cd: c.cooldowns.R > 0 };
  });
  check('R: shields the ally (more when it is hurt), channels 3s in place, then teleports beside it', r.R.shield > 150 && r.R.channeling && r.R.midDist < 20 && r.R.endDist < 250 && r.R.done && r.R.cd);
  r.Rnone = await page.evaluate(() => { const c = window.controller; window.__e2e.placedAllies.length = 0; c.cooldowns.R = 0; c.castAbility('R', null); return { cast: !!c._shen.r, cd: c.cooldowns.R }; });
  check('R: without any allied champion it does not cast (no cooldown spent)', !r.Rnone.cast && r.Rnone.cd === 0);

  // 5) 죽으면 정리, 부활하면 검이 곁에
  r.death = await page.evaluate(() => { const c = window.controller; c._shen.qAttacks = 2; c._shenOnDeath(); return { q: c._shen.qAttacks, r: c._shen.r }; });
  check('death: empowered attacks and channel are cleared', r.death.q === 0 && !r.death.r);

  // 6) 적 봇으로도: 쉔 봇이 AI로 싸울 때 오류가 없고, 검이 봇을 따라 만들어진다
  r.bot = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.itemBonusMaxHp = 30000; c.recomputeStats(); c.hp = c.maxHp;
    for (const b of [...E.enemyBots]) E.removeEnemyBot(b);
    const sb = await E.spawnEnemyBot('shen', { position: new E.THREE.Vector3(L(500), 0, 0), difficulty: 'hard' });
    sb.skillLevels = { Q: 3, W: 3, E: 3, R: 1 };
    const hp0 = c.hp;
    await E.realWait(8000);
    return { champ: sb.championId, blade: !!(sb._shenFx && sb._shenFx.blade && sb._shenFx.blade.parent), hit: Math.round(hp0 - c.hp), cds: Object.values(sb.cooldowns).filter((x) => x > 0).length };
  });
  check('bot: an AI-controlled Shen fights without errors (blade exists, deals damage)', r.bot.champ === 'shen' && r.bot.blade && r.bot.hit > 0);

  // 7) 다른 챔피언으로 바꾸면 플레이어 쉔의 검이 씬에서 사라진다
  await page.evaluate(() => { for (const b of [...window.__e2e.enemyBots]) window.__e2e.removeEnemyBot(b); const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await wait(800);
  r.switchBlades = await page.evaluate(() => { let n = 0; window.__e2e.scene.traverse((o) => { if (o.name === 'shenSpiritBlade' && o.parent && o.parent.parent) n++; }); return n; });
  check('switch: after switching to another champion no Spirit Blade is left in the scene', r.switchBlades === 0);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
