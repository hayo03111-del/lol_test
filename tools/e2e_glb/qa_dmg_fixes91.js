// QA(91차): 스킬 피해 점검에서 고친 분류·경로를 숫자로 확인.
//  - 적중 시 추가 피해(바루스 W, 가렌 Q, 럭스 평타 광채, 마스터 이 Q 중 E)에 쇼진 스킬 증폭이 걸리지 않는가
//  - 이즈리얼 W 표식이 포탑에서 평타로 터지며 피해를 주는가
//  - 레넥톤 평타가 치명타를 낼 수 있는가(공용 평타 경로)
//  - 다리우스 출혈 틱에 E 패시브 방어구 관통이 적용되는가
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_dmg_fixes91.js
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
  // 스킬 증폭 20%를 켜고 끈 두 번의 피해를 잰다 - 같으면 평타(적중) 피해로 분류된 것.
  const ampCheck = (fnSrc) => page.evaluate((fnSrc) => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    const fn = new Function('c', 'd', 'E', fnSrc);
    const one = (amp) => { d.hp = d.maxHp = 1e5; d.statusEffects = []; c.itemSpellDamageAmpPercent = amp; const b = d.hp; fn(c, d, E); c.itemSpellDamageAmpPercent = 0; return +(b - d.hp).toFixed(2); };
    return { noAmp: one(0), amp20: one(0.2) };
  }, fnSrc);
  const r = {};
  await load('varus');
  r.varusW = await ampCheck("c.skillLevels.W = 5; c._varusOnBasicAttackHit(d);");
  await load('garen');
  r.garenQ = await ampCheck("c.skillLevels.Q = 5; c._garenQOnHit(d);");
  await load('lux');
  r.luxPassiveByAttack = await ampCheck("c._luxMark(d); c._luxOnBasicAttackHit(d);");
  r.luxPassiveByAbility = await ampCheck("c._luxMark(d); c._luxDetonateMark(d);");
  await load('masteryi');
  r.yiQonHitE = await ampCheck("c.skillLevels.E = 5; E.applyStatus(c, { id: 'masteryiE', type: 'MASTERYI_E', duration: 30, value: 1 }); c._masteryiApplyAlphaStrikeOnHit({ q: { onHitModifier: 0.75 } }, d);");
  await load('darius');
  r.dariusBleed = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    const bleed = (armor, pen) => { d.hp = d.maxHp = 1e5; d.statusEffects = []; const a0 = d.armor; d.armor = armor; c.armorPenPercent = pen; const b = d.hp; E.applyDamage(d, { rawDamage: 100, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isStatusTick: true }); d.armor = a0; return +(b - d.hp).toFixed(2); };
    return { armor100_pen0: bleed(100, 0), armor100_pen40: bleed(100, 0.4), expectRatio: +(200 / 160).toFixed(4) };
  });
  await load('renekton');
  r.renektonCrit = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    c.statusEffects = []; d.hp = d.maxHp = 1e5; d.statusEffects = [];
    c._rollNaturalCrit = () => true; // 치명타 확정
    const dp = E.getWorldPosition(d); c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(150));
    const hits = []; let last = d.hp;
    const iv = setInterval(() => { if (d.hp !== last) { hits.push(+(last - d.hp).toFixed(1)); last = d.hp; } }, 10);
    c.selectTarget(d);
    setTimeout(() => { clearInterval(iv); c.currentTarget = null; delete c._rollNaturalCrit; res({ ad: +c.stats.attackDamage.toFixed(1), critMult: c.stats.critMultiplier, hits: hits.slice(0, 3) }); }, 3500);
  }));
  await load('ezreal');
  r.ezrealWturret = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    const t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1') || E.turrets.find((x) => x.team === 'RED' && !x.destroyed && x.type !== 'nexusWell');
    if (!t) return { note: 'no turret' };
    t.hp = t.maxHp; c.skillLevels.W = 5;
    c._ezreal.markTarget = t; c._ezreal.markExpiresAt = performance.now() + 4000; c._ezreal.markWLevel = 5;
    const b = t.hp;
    c._onStructureBasicAttackHit(t, null, null);
    return { detonateDmg: +(b - t.hp).toFixed(2), markCleared: c._ezreal.markTarget !== t };
  });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
