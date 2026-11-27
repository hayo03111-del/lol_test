// QA(105차): 쉔 상세 엔진 점검 - 함수를 직접 부르지 않고 게임 안의 실제 흐름(평타 명령·돌진·미니언/포탑 공격·레벨업)으로
// 위키(V26.22) 수치·규칙과 맞는지 잰다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_shen_engine.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'shen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'shen', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // 1) 기본 스탯 - 레벨 1·18(원작 성장 공식 기본 + 성장 × (n-1) × (0.7025 + 0.0175 × (n-1)))
  r.stats = await page.evaluate(() => {
    const c = window.controller, L1 = window.__e2e.lolRangeToWorld(1);
    const champAs = () => window.getFinalAttackSpeed(c.stats); // 106차: 룬을 지운 그 프레임에도 바로 맞는다(예전엔 한 프레임 동안 룬 공속 3%가 남았다)
    const snap = () => ({ hp: c.maxHp, ar: c.stats.armor, mr: c.stats.magicResist, ad: c.stats.attackDamage, as: champAs(), ratio: c.stats.attackSpeedRatio, windupPct: c.stats.windupPercent, mpMax: c.maxMp, mpRegen5: (c.mpRegen || c.stats.manaRegen || 0), ms: window.getFinalMoveSpeedForE2E(c.stats), range: c.stats.attackRange / L1, timing: window.__attackTiming(c.stats) });
    c.runePage = null; c.recomputeStats(); // 룬(적응형·체력 파편) 없이 챔피언 기본 스탯만
    c.champLevel = 1; c.recomputeStats(); const a = snap();
    while (c.champLevel < 18) c.levelUp(); const b = snap();
    c.champLevel = 3; c.recomputeStats(); c.hp = c.maxHp; c.mp = c.maxMp;
    return { L1: a, L18: b };
  });
  const s1 = r.stats.L1, s18 = r.stats.L18;
  check('stats L1: 610 hp, 34 armor, 32 mr, 64 ad, 0.751 as, 400 energy, 340 ms, 125 range', near(s1.hp, 610, 0.5) && near(s1.ar, 34, 0.05) && near(s1.mr, 32, 0.05) && near(s1.ad, 64, 0.05) && near(s1.as, 0.751, 0.002) && s1.mpMax === 400 && near(s1.ms, 340, 0.5) && near(s1.range, 125, 0.5));
  check('stats L18 (growth formula): 2293 hp, 105.4 armor, 66.85 mr, 115 ad, 1.083 as, energy stays 400', near(s18.hp, 2293, 1) && near(s18.ar, 105.4, 0.1) && near(s18.mr, 66.85, 0.1) && near(s18.ad, 115, 0.1) && near(s18.as, 0.751 + 0.651 * 0.51, 0.003) && s18.mpMax === 400);
  check('attack timing: AS ratio 0.651, windup 17.361% of the attack time (engine timing = 1/AS and 17.361%/AS)', s1.ratio === 0.651 && s1.windupPct === 0.17361 && near(s1.timing.windup * (1 / s1.timing.interval), 0.17361, 0.002));

  // 2) 기력 재생 - 5초당 50(초당 10)
  r.energy = await page.evaluate(async () => { const c = window.controller, E = window.__e2e; c.mp = 0; const t0 = E.gameNow(); await E.realWait(2000); return { perSec: c.mp / ((E.gameNow() - t0) / 1000) }; });
  check('energy regen: 10 per second (50 per 5s)', near(r.energy.perSec, 10, 1.0));

  // 무대: 다리 가운데, 미니언 없음, 적 봇(뇌 없음 - 가만히)
  await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.root.position.set(0, 0, 0); c.targetPos = null; c.skillLevels = { Q: 5, W: 5, E: 5, R: 3 };
    const bot = await E.spawnEnemyBot('garen', { position: new E.THREE.Vector3(L(600), 0, 0), difficulty: 'easy' });
    bot.brain = null; bot.itemBonusMaxHp = 40000; bot.recomputeStats(); bot.hp = bot.maxHp; bot.targetPos = null;
    window.__bot = bot;
    const b = E.brushSystem; if (b && b.brushes) b.brushes.length = 0;
  });

  // 3) Q 사거리 +75 - 검이 도착하면 평타 사거리 125 → 200
  r.range = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    const edge = () => E.worldDistanceToLol(c.stats.attackRange);
    const before = edge();
    c._shen.blade = { x: L(1200), z: 0 }; bot.root.position.set(L(600), 0, 0); // 검이 봇을 지나 쉔에게
    c.mp = c.maxMp; c.cooldowns.Q = 0; c.castAbility('Q', null);
    await E.realWait(1000);
    const after = edge();
    return { before: Math.round(before), after: Math.round(after), empowered: c._shen.qEmpowered, attacks: c._shen.qAttacks, asBefore: null };
  });
  check('Q: on arrival attack range is 125 + 75 = 200', r.range.before === 125 && r.range.after === 200 && r.range.attacks === 3 && r.range.empowered);

  // 4) 실제 평타 3회(공격 명령): 강화 동작 Spell1_Attack1→2→3, 매 타 추가 마법 피해, 공속 +50%, 3회 뒤 끝
  r.attacks = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    bot.root.position.set(L(150), 0, 0); bot.targetPos = null;
    const asNow = window.getFinalAttackSpeed(c.stats);
    const clips = [], hits = [], left = [];
    let lastHp = bot.hp, lastClip = null, alive = true;
    const t0 = E.gameNow();
    const poll = () => { if (!alive) return; const k = c.currentClipKey; if (k !== lastClip) { clips.push(k); lastClip = k; } if (bot.hp < lastHp - 1) { hits.push({ t: E.gameNow() - t0, dmg: lastHp - bot.hp, left: c._shen.qAttacks }); lastHp = bot.hp; } requestAnimationFrame(poll); };
    requestAnimationFrame(poll);
    window.gameSession.submit({ type: 'attack', targetId: window.__e2eEntityId(bot) });
    await E.realWait(4500);
    alive = false;
    c.moveTo(c.root.position.clone());
    return { asNow, clips: clips.filter((k) => /attack|crit/i.test(k || '')), hits: hits.map((h) => ({ t: Math.round(h.t), dmg: Math.round(h.dmg), left: h.left })), leftAfter: c._shen.qAttacks, asAfter: window.getFinalAttackSpeed(c.stats) };
  });
  const H = r.attacks.hits;
  const empClips = r.attacks.clips.slice(0, 3);
  check('Q attacks: the three empowered swings play Spell1_Attack1, 2, 3 in order', empClips.join(',') === 'Spell1_Attack1,Spell1_Attack2,Spell1_Attack3');
  check('Q attacks: empowered attack speed = normal + 0.651 (AS ratio) × 50%', near(r.attacks.asNow, r.attacks.asAfter + 0.651 * 0.5, 0.005));
  check('Q attacks: first 3 hits carry the max-health bonus, the 4th is a plain attack, then it ends', H.length >= 4 && H[0].dmg > H[3].dmg * 3 && H[2].dmg > H[3].dmg * 3 && H[2].left === 0 && r.attacks.leftAfter === 0);
  // 간격: 강화 공속에서 평타 간격 = 1 / 공속
  const gaps = H.slice(0, 3).map((h, i, a) => (i ? h.t - a[i - 1].t : null)).filter((x) => x != null);
  r.attacks.gaps = gaps;
  check('Q attacks: swing interval follows the empowered attack speed (1/AS)', gaps.length === 2 && gaps.every((g) => near(g / 1000, 1 / r.attacks.asNow, 0.2)));

  // 5) E 돌진 속도 800 + 이동 속도, 끝 지점 반경 150 판정, 지나간 적 도발·피해(위키 공식으로 계산한 값과 비교, 칼바람 -5%)
  r.E = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.root.position.set(0, 0, 0); c.targetPos = null; bot.statusEffects = []; bot.root.position.set(L(600) + L(120), 0, L(0)); // 끝 지점에서 120 떨어진 곳(지나가지 않음)
    c.mp = c.maxMp; c.cooldowns.E = 0;
    const ms = window.getFinalMoveSpeedForE2E(c.stats);
    const hp0 = bot.hp, armor = bot.stats.armor;
    const spells = []; const origTD = bot.takeDamage.bind(bot);
    bot.takeDamage = (amt, src, type, meta) => { if (src === c && !(meta && meta.isBasicAttack)) spells.push(amt); return origTD(amt, src, type, meta); }; // E(스킬) 피해만 센다
    c.castAbility('E', new E.THREE.Vector3(L(600), 0, 0));
    const dur = c._dashState ? c._dashState.duration : null;
    await E.realWait(1000);
    bot.takeDamage = origTD;
    const eDmg = spells.reduce((x, y) => x + y, 0);
    // 같은 대상에게 위키 공식 원피해(160 + 추가 체력 11%)를 엔진 공용 피해로 직접 넣어 본 값 - E 피해와 같아야 한다
    const bonusHp = Math.max(0, c.maxHp - (c._champData().stats.hp + c._champData().stats.hpGrowth * (c.champLevel - 1) * (0.7025 + 0.0175 * (c.champLevel - 1))));
    const raw = 160 + 0.11 * bonusHp, hpR = bot.hp;
    let ref = 0; bot.takeDamage = (amt, src, type, meta) => { ref += amt; return origTD(amt, src, type, meta); };
    E.applyDamage(bot, { rawDamage: raw, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, source: c });
    bot.takeDamage = origTD;
    const refDmg = ref;
    return { refDmg, raw, ms, dur, expectDur: 600 / (800 + ms), dmg: eDmg, taunted: !!(bot.statusEffects || []).find((s) => s.type === 'TAUNT'), armor, lvlE: c.skillLevels.E, maxHp: c.maxHp };
  });
  check('E: dash speed is 800 + move speed (600 units in 600/(800+ms) s)', r.E.dur != null && near(r.E.dur, r.E.expectDur, 0.02));
  check('E: an enemy within 150 of the end point is hit and taunted (end-of-dash check)', r.E.dmg > 50 && r.E.taunted);
  check('E: damage equals the wiki raw (160 + 11% bonus health at rank 5) through the engine damage path', near(r.E.dmg, r.E.refDmg, 1));

  // 6) 도발된 적은 쉔을 기본 공격한다(엔진의 도발 규칙)
  r.taunt = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    c.itemBonusMaxHp = 20000; c.recomputeStats(); c.hp = c.maxHp;
    bot.root.position.set(L(250), 0, 0); bot.statusEffects = [];
    E.applyStatus(bot, { id: 'shenE_taunt', type: 'TAUNT', duration: 1.5, value: 1, source: c });
    const hp0 = c.hp + (c.shield || 0);
    await E.realWait(1600);
    return { hit: Math.round(hp0 - (c.hp + (c.shield || 0))), target: bot.currentTarget === c };
  });
  check('taunt: the taunted enemy walks to Shen and attacks him', r.taunt.hit > 0 || r.taunt.target);

  // 7) W: 실제 미니언 공격 - 영역 밖에서는 맞고, 켜진 영역 안에서는 막힌다(쉔에게 실제로 들어온 미니언 타격 수를 센다)
  r.W = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    bot.root.position.set(L(2500), 0, L(0)); bot.statusEffects = [];
    c.root.position.set(0, 0, 0); c.targetPos = null; c.hp = c.maxHp; c._shen.zone = null;
    const m = E.createMinion('melee', new E.THREE.Vector3(L(100), 0, 0), E.getTurretGameTimeSec(), 'RED'); m.hp = m.maxHp = 99999; E.minions.push(m);
    let landed = 0; const orig = c.takeDamage.bind(c);
    c.takeDamage = (amt, src, ...rest) => { if (src === m) landed++; return orig(amt, src, ...rest); };
    await E.realWait(3500); const noW = landed;
    landed = 0; c._shen.blade = { x: c.root.position.x, z: c.root.position.z }; c.mp = c.maxMp; c.cooldowns.W = 0; c.castAbility('W', null); // 검 = 쉔이 서 있는 자리(미니언을 치며 움직였을 수 있다)
    const active = !!(c._shen.zone && c._shen.zone.activeUntil);
    await E.realWait(1650); const inW = landed;
    c.takeDamage = orig; m.hp = 0; m.isDead = true; E.minions.length = 0;
    await E.realWait(300);
    return { noW, inW, active };
  });
  check('W: real minion basic attacks land outside the zone but are all blocked while it is active', r.W.noW >= 2 && r.W.active && r.W.inW === 0);

  // 8) W 대기: 검이 멀리 있고 아무도 안 들어오면 2초 뒤에 켜진다
  r.Wprime = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c._shen.zone = null; c.root.position.set(0, 0, 0);
    c._shen.blade = { x: L(1500), z: 0 }; c.mp = c.maxMp; c.cooldowns.W = 0; c.castAbility('W', null);
    const z = c._shen.zone; const a0 = !!(z && z.activeUntil);
    await E.realWait(1000); const a1 = !!(c._shen.zone && c._shen.zone.activeUntil);
    await E.realWait(1300); const a2 = !!(c._shen.zone && c._shen.zone.activeUntil);
    return { cast: !!z, a0, a1, a2 };
  });
  check('W: with nobody inside, the zone primes for 2s and then activates', r.Wprime.cast && !r.Wprime.a0 && !r.Wprime.a1 && r.Wprime.a2);

  // 9) 패시브: 쿨 11초, E가 적 챔피언을 맞히면 4~8.25초 감소(레벨 비례)
  r.ki = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, bot = window.__bot;
    await E.realWait(2500); // 앞의 W 보호막 처리
    c._shen.kiReadyAt = 0; c.mp = c.maxMp; c.cooldowns.Q = 0;
    c._shen.blade = { x: c.root.position.x, z: c.root.position.z };
    c.castAbility('Q', null); await E.realWait(400); // 검 도착 → 보호막, 쿨 11초 시작
    const left1 = (c._shen.kiReadyAt - E.gameNow()) / 1000;
    bot.root.position.set(c.root.position.x + L(300), 0, c.root.position.z); bot.statusEffects = [];
    const botHp0 = bot.hp;
    c.mp = c.maxMp; c.cooldowns.E = 0; c.castAbility('E', new E.THREE.Vector3(c.root.position.x + L(500), 0, c.root.position.z));
    const eCast = c.cooldowns.E > 0, action = c.currentActionKey;
    await E.realWait(700);
    const eHit = botHp0 - bot.hp;
    const left2 = (c._shen.kiReadyAt - E.gameNow()) / 1000;
    const p = c._champData().passive, lvl = c.champLevel;
    return { left1, left2, expectReduce: p.cdReduceAt1 + (p.cdReduceAt18 - p.cdReduceAt1) * (lvl - 1) / 17, lvl, eCast, action, eHit: Math.round(eHit) };
  });
  check('passive: cooldown 11s after the shield; an E champion hit cuts 4–8.25s (by level)', near(r.ki.left1, 11, 0.6) && near(r.ki.left1 - 1.1 - r.ki.left2, r.ki.expectReduce, 0.7));

  // 10) R: 정신 집중 중에는 이동·평타·스킬이 막히고, 기절하면 끊긴다(보호막은 남는다)
  r.R = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    for (const b of [...E.enemyBots]) E.removeEnemyBot(b);
    const sp = E.getTeamSpawnPosition('BLUE'), ap = new E.THREE.Vector3(sp.x * 0.5, 0, sp.z * 0.5);
    const ally = E.createAllyDummy(ap); E.placedAllies.push(ally);
    c.root.position.set(0, 0, 0); c.targetPos = null; c.cooldowns.R = 0; c.mp = c.maxMp;
    c.castAbility('R', ap.clone());
    await E.realWait(500);
    c.moveTo(new E.THREE.Vector3(L(400), 0, L(400)));
    c.cooldowns.Q = 0; c.castAbility('Q', null);
    await E.realWait(800);
    const moved = E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z));
    const qDuring = !!c._shen.recall;
    E.applyStatus(c, { id: 'testStun', type: 'STUN', duration: 0.5, value: 1 });
    await E.realWait(300);
    const broken = !c._shen.r, shieldKept = (ally.shield || 0) > 0;
    await E.realWait(2500);
    const stayed = E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z));
    return { moved: Math.round(moved), qDuring, broken, shieldKept, stayed: Math.round(stayed) };
  });
  check('R: during the channel Shen cannot move or cast; a stun breaks it (no teleport) and the ally keeps the shield', r.R.moved < 10 && !r.R.qDuring && r.R.broken && r.R.shieldKept && r.R.stayed < 600);

  // 11) 영혼의 검: 쉔이 너무 멀어지면(2000 추정) 곁으로 옮겨 온다
  r.leash = await page.evaluate(async () => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
    c.root.position.set(0, 0, 0); c.targetPos = null; c._shen.recall = null;
    c._shen.blade = { x: L(1500), z: 0 }; await E.realWait(300);
    const stays = Math.round(E.worldDistanceToLol(Math.hypot(c._shen.blade.x, c._shen.blade.z)));
    c._shen.blade = { x: L(2600), z: 0 }; await E.realWait(300);
    const follows = Math.round(E.worldDistanceToLol(Math.hypot(c._shen.blade.x - c.root.position.x, c._shen.blade.z - c.root.position.z)));
    return { stays, follows };
  });
  check('blade: stays where it was within 2000, comes to Shen when he is farther away', r.leash.stays === 1500 && r.leash.follows < 150);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
