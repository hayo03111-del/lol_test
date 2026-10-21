// QA(감사 전용): 벡스·노틸러스·람머스·초가스 스킬 피해를 허수아비 체력 변화로 재서 기대값(원작)과 비교한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_dmg_group4.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 }); await page.waitForTimeout(800); };
  const prelude = () => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    const mr = () => (d.magicResist ?? (d.stats && d.stats.magicResist)) || 0;
    const prep = () => { d.hp = d.maxHp = 1e5; d.statusEffects = []; d.isDead = false; };
    const place = (distLol) => { const dp = E.getWorldPosition(d); c.root.position.set(dp.x, c.root.position.y, dp.z + E.lolRangeToWorld(distLol)); };
    const measure = (fn) => { prep(); const b = d.hp; fn(); return +(b - d.hp).toFixed(2); };
    const exp = (raw) => +(raw * 100 / (100 + mr())).toFixed(2);
    return { E, c, d, mr, prep, place, measure, exp };
  };
  const r = {};
  await load('rammus');
  r.env = await page.evaluate(() => ({ dummies: window.__e2e.dummies.length, dummyIsChampion: !!(window.__e2e.dummies[0] || {}).isChampion }));
  r.rammus = await page.evaluate((pre) => {
    const { c, d, mr, measure, exp, place } = eval(`(${pre})()`);
    c.stats.abilityPower = 0; place(0);
    const center = { x: c.root.position.x, z: c.root.position.z };
    const land = (castDistLol) => measure(() => { const dp = window.__e2e.getWorldPosition(d); c.root.position.set(dp.x, c.root.position.y, dp.z); c._rammusLand({ lvl: 1, castDistLol, powerball: false }); c._rammus.aftershocks = null; });
    const r800 = land(800), r1700 = land(1700);
    // W 반사(5랭크): 원작 15 + 총 방어력 10% + 총 마저 10%
    c.skillLevels.W = 5; c._rammus.wUntil = performance.now() + 5000; c._rammus.wStartedAt = performance.now();
    const ret = measure(() => c._rammusOnTakeDamage(d, { isBasicAttack: true }));
    c._rammus.wUntil = 0;
    const arm = c.stats.armor, mrS = c.stats.magicResist, baseArm = c.stats.baseArmor;
    return { dummyMR: mr(), R_rank1_cast800: r800, R_rank1_cast1700: r1700, expectedR: exp(150), W_return_rank5: ret, codeRawW: 55 + 0.1 * Math.max(0, arm - (baseArm || 0)), expectedW_raw: +(15 + 0.1 * arm + 0.1 * mrS).toFixed(2), expectedW: exp(15 + 0.1 * arm + 0.1 * mrS), rammusArmor: arm, rammusMR: mrS };
  }, prelude.toString());
  await load('vex');
  r.vex = await page.evaluate((pre) => {
    const { c, d, mr, measure, exp, place } = eval(`(${pre})()`);
    c.stats.abilityPower = 0; place(300);
    const out = { dummyMR: mr() };
    for (const lv of [1, 9, 18]) { c.champLevel = lv; out['gloom_lv' + lv] = measure(() => { c._vexMarkGloom(d); c._vexConsumeGloom(d); }); }
    // 원작(위키 현행 표기) 40 – 162.94: 표준 성장식 40 + g(n-1)(0.7025+0.0175(n-1)), g=7.232
    const wikiGloom = (n) => 40 + 7.2318 * (n - 1) * (0.7025 + 0.0175 * (n - 1));
    out.expectedGloom = { lv1: exp(wikiGloom(1)), lv9: exp(wikiGloom(9)), lv18: exp(wikiGloom(18)) };
    c.champLevel = 1;
    return out;
  }, prelude.toString());
  await load('nautilus');
  r.nautilus = await page.evaluate((pre) => {
    const { c, d, measure, place } = eval(`(${pre})()`);
    c.stats.abilityPower = 0; place(150);
    const arm = (d.armor ?? (d.stats && d.stats.armor)) || 0;
    c._nautilus.passiveReadyAt = new Map();
    const p = measure(() => c._nautilusOnBasicAttackHit(d));
    const lv = c.champLevel; return { champLevel: lv, dummyArmor: arm, passive: p, expectedPassive_beforeAram: +((14 + 102 * (lv - 1) / 17) * 100 / (100 + arm)).toFixed(2), aramDealtMul: 0.95 };
  }, prelude.toString());
  await load('chogath');
  r.chogath = await page.evaluate((pre) => {
    const { c, d, measure, exp, place } = eval(`(${pre})()`);
    c.stats.abilityPower = 0; place(150);
    c.skillLevels.E = 1; c._chogath.eChargesRemaining = 1; c._chogath.predationStacks = 0;
    const e = measure(() => c._chogathEOnHit(d));
    c.skillLevels.R = 1;
    const rr = measure(() => c._chogathROnHit(d));
    return { E_rank1: e, expectedE: exp(30 + 1e5 * 0.025), R_rank1: rr, expectedR_true: 300 };
  }, prelude.toString());
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
