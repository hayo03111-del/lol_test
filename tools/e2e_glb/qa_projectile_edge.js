// QA(투사체 경계 상황): (A) 날아가는 대상 지정 투사체의 대상이 비대상이 되면 피해·부가 효과가 하나도 들어가지 않는지,
// (E) 투사체가 닿기 전에 대상이 죽으면 흡혈·아이템 발동·처치 처리(골드·CS·점수)가 두 번 일어나지 않는지 숫자로 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_projectile_edge.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 }); await page.waitForTimeout(1200); };
  const r = {};
  // 공통: 적(RED) 미니언 하나를 플레이어 앞에 세우고, 다른 미니언·허수아비는 멀리 치운다.
  const setup = (opts) => page.evaluate((opts) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, T = E.THREE;
    for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; if (m.mesh && m.mesh.parent) m.mesh.parent.remove(m.mesh); }
    E.minions.length = 0;
    for (const d of E.dummies) d.mesh.position.set(200, 0, 200);
    c.root.position.set(0, 0, 0); c.statusEffects = []; c.isUntargetable = false;
    c._clearActionTimers(); c.currentActionKey = null; c.currentTarget = null; c.targetPos = null; c.setState('IDLE'); c._attackReadyAt = 0;
    const m = E.createMinion('caster', new T.Vector3(0, 0, -L(opts.dist || 450)), 120, 'RED');
    m.aiDisabled = true; m.attackDamage = 0; E.minions.push(m);
    window.__m = m;
    // 관측: 기본 공격 적중 훅 호출 수, 흡혈 회복
    if (!c.__qaWrapped) { const o = c._onBasicAttackHit.bind(c); window.__aaHits = 0; c._onBasicAttackHit = (...a) => { window.__aaHits++; return o(...a); }; c.__qaWrapped = true; }
    window.__aaHits = 0;
    return { minionHp: m.hp };
  }, opts);
  const minionFreeze = () => page.evaluate(() => { const m = window.__m; m.speed = 0; m.moveSpeed = 0; m.attackTarget = null; });
  const snap = () => page.evaluate(() => {
    const c = window.controller, m = window.__m;
    const kraken = c._itemKrakenHitCounts ? [...c._itemKrakenHitCounts.values()].join(',') : '';
    return { mHp: m ? +m.hp.toFixed(1) : null, mDead: m ? !!m.isDead : null, mStatus: m ? (m.statusEffects || []).map((s) => s.type).join(',') : '', cHp: +c.hp.toFixed(1), cMp: +(c.mp || 0).toFixed(1), gold: +(c.gold || 0).toFixed(1), cs: (c.score || {}).cs, aaHits: window.__aaHits, kraken, inFlight: window.__e2e.projectiles.projectiles.filter((p) => p.target === m).length };
  });
  const waitFlightTo = (pred) => page.waitForFunction((src) => { const f = new Function('m', 'c', 'P', src); return f(window.__m, window.controller, window.__e2e.projectiles.projectiles); }, pred, { timeout: 15000 }).then(() => true).catch(() => false);

  // ===== A2/A3: 애쉬 평타(서리 둔화 + 흡혈 + 크라켄)가 날아가는 동안 대상이 비대상/다른 세계로 =====
  await load('ashe');
  await page.evaluate(() => { const c = window.controller; c.gold = 20000; window.buildOrBuyItemForE2E(c, 'vampiricScepter'); window.buildOrBuyItemForE2E(c, 'krakenSlayer'); c.hp = c.maxHp * 0.5; });
  for (const mode of ['untargetable', 'realm', 'control']) {
    await setup({ dist: 550 }); await minionFreeze();
    await page.evaluate(() => { const c = window.controller; c.hp = c.maxHp * 0.5; c.selectTarget(window.__m); });
    const fired = await waitFlightTo('return P.some((p) => p.target === m);');
    const before = await snap();
    await page.evaluate((mode) => { const c = window.controller, m = window.__m; c.currentTarget = null; c._clearActionTimers(); c.setState('IDLE'); if (mode === 'untargetable') m.isUntargetable = true; else if (mode === 'realm') m.realmId = 'qaRealm'; }, mode);
    await waitFlightTo('return !P.some((p) => p.target === m);');
    await page.waitForTimeout(200);
    const after = await snap();
    r['A_ashe_' + mode] = { fired, before, after };
  }
  // ===== A1: 포탑 포탄이 날아가는 동안 플레이어가 비대상(마스터 이 Q·스톱워치 같은 상태) =====
  await page.evaluate(() => { const E = window.__e2e; for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0; });
  r.A_turret = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    const t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1');
    const tp = (t.position || t.mesh.position).clone();
    const dir = tp.clone().setY(0).normalize();
    c.root.position.copy(tp.clone().sub(dir.multiplyScalar(L(600)))).setY(0); c.hp = c.maxHp; c.isUntargetable = false;
    c._itemLastTookAnyDamageAt = 0;
    const t0 = performance.now();
    const iv = setInterval(() => {
      const shot = E.projectiles.projectiles.find((p) => p.fromTurret && p.target === c);
      if (shot && !window.__qaUnt) { window.__qaUnt = true; window.__hpAtFlight = c.hp; window.__tookAt = c._itemLastTookAnyDamageAt; c.isUntargetable = true; }
      if (window.__qaUnt && !E.projectiles.projectiles.some((p) => p.fromTurret && p.target === c)) {
        clearInterval(iv); const out = { hpAtFlight: +window.__hpAtFlight.toFixed(1), hpAfter: +c.hp.toFixed(1), lastTookAnyDamageChanged: c._itemLastTookAnyDamageAt !== window.__tookAt, lastDamageTaken: c._lastDamageTakenAmount, status: (c.statusEffects || []).map((s) => s.type).join(',') };
        c.isUntargetable = false; c.root.position.set(0, 0, 0); window.__qaUnt = false; res(out);
      }
      if (performance.now() - t0 > 12000) { clearInterval(iv); c.isUntargetable = false; res({ timeout: true }); }
    }, 10);
  }));

  // ===== E1: 애쉬 평타가 날아가는 동안 미니언이 다른 원인(포탑)으로 죽음 =====
  await setup({ dist: 550 }); await minionFreeze();
  await page.evaluate(() => { const c = window.controller; c.hp = c.maxHp * 0.5; c.selectTarget(window.__m); });
  await waitFlightTo('return P.some((p) => p.target === m);');
  const e1b = await snap();
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; c.currentTarget = null; c._clearActionTimers(); c.setState('IDLE'); E.applyDamageToMinion(window.__m, { rawDamage: 1e6, damageType: 'TRUE', source: E.turrets[0] }); });
  await page.waitForTimeout(1200);
  r.E1_killedByOther = { before: e1b, after: await snap() };
  // ===== E2: 같은 공격의 먼저 닿은 투사체가 죽이고 남은 투사체가 뒤따라옴(애쉬 Q 다발 화살 + 평타) =====
  await setup({ dist: 450 }); await minionFreeze();
  const e2b = await snap();
  await page.evaluate(() => { const c = window.controller, m = window.__m; m.hp = 5; c.hp = c.maxHp * 0.5; c._ashe.qActiveUntil = performance.now() + 6000; c._ashe.flurryPending = true; c.selectTarget(m); });
  await page.waitForTimeout(2500);
  r.E2_flurryKill = { before: e2b, after: await snap() };
  // ===== E3: 이즈리얼 평타 + Q가 함께 날아가는데 평타가 먼저 처치 =====
  await load('ezreal');
  await page.evaluate(() => { const c = window.controller; c.gold = 20000; window.buildOrBuyItemForE2E(c, 'vampiricScepter'); });
  await setup({ dist: 500 }); await minionFreeze();
  const e3b = await snap();
  await page.evaluate(() => { const c = window.controller, m = window.__m, E = window.__e2e; m.hp = 3; c.hp = c.maxHp * 0.5; c.selectTarget(m); });
  await waitFlightTo('return P.some((p) => p.target === m);');
  await page.evaluate(() => { const c = window.controller, E = window.__e2e; c.cooldowns.Q = 0; c.mp = c.maxMp; c._clearActionTimers(); c.currentActionKey = null; c.setState('IDLE'); c.castAbility('Q', E.getWorldPosition(window.__m).clone()); });
  await page.waitForTimeout(2000);
  r.E3_aaThenQ = { before: e3b, after: await snap() };
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
