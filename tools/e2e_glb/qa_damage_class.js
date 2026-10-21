// QA(점검 목록 B·C·D): 우물→미니언 고정 피해가 플레이어 증폭에 안 휘둘리는지, 세트 오른손 추가 피해·마스터 이 E 고정 피해의 분류(기본 공격/스킬/구조물/흡혈)를 숫자로 확인.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_damage_class.js
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
  const r = {};
  await load('sett');
  // B) 우물 피해 객체(source 없음)를 그대로 미니언에 넣는다 - 플레이어 증폭 유무로 비교
  r.B = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    const m = E.createMinion('melee', new E.THREE.Vector3(30, 0, 30), 60, 'RED'); E.minions.push(m);
    const hit = () => { m.hp = m.maxHp = 5000; const b = m.hp; E.applyDamageToMinion(m, { rawDamage: 1000, damageType: 'TRUE', isCritical: false, critMultiplier: 1 }); return +(b - m.hp).toFixed(2); };
    const base = hit();
    c.itemSpellDamageAmpPercent = 0.2; const shojin = hit(); c.itemSpellDamageAmpPercent = 0;
    E.applyStatus(c, { id: 'qaExh', type: 'EXHAUSTED', duration: 5, value: 0.35 }); const exhausted = hit(); c.statusEffects = c.statusEffects.filter((s) => s.id !== 'qaExh');
    c._itemManaRealizeUntil = performance.now() + 5000; const realize = hit(); c._itemManaRealizeUntil = 0;
    m.hp = 0; E.minions.splice(E.minions.indexOf(m), 1);
    return { base, withShojin20: shojin, withPlayerExhausted: exhausted, withManaRealizeFlag: realize };
  });
  // C) 세트 오른손 추가 타격 - 허수아비
  r.C = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    const one = (amp) => { d.hp = d.maxHp = 1e5; d.statusEffects = []; c.itemSpellDamageAmpPercent = amp; const b = d.hp; c._settOnBasicAttackHit(d, 'RIGHT'); const dmg = b - d.hp; c.itemSpellDamageAmpPercent = 0; return +dmg.toFixed(2); };
    const lv = c.champLevel, t = Math.min(1, Math.max(0, (lv - 1) / 17));
    const raw = 5 + 95 * t + 0.55 * c._getBonusAD();
    const armor = d.armor ?? (d.stats && d.stats.armor) ?? 0;
    const noAmp = one(0), withShojin = one(0.2);
    // 운명의 재(스킬 피해에만 화상): 오른손 추가 타격이 스킬로 분류되면 화상이 걸린다
    c.items = [{ id: 'embersOfFate', count: 1 }]; window.recomputeItemStats(c);
    d.hp = d.maxHp = 1e5; d.statusEffects = []; c._settOnBasicAttackHit(d, 'RIGHT'); const burnAfterRight = (d.statusEffects || []).map((s) => s.id || s.type).filter((x) => /ember|burn|BURN|DOT/i.test(x));
    c.items = []; window.recomputeItemStats(c);
    // 흡혈: 생명력 흡수 10%
    c.itemPhysicalVampPercent = 0.1; c.hp = c.maxHp * 0.5; const hb = c.hp; d.hp = 1e5; c._settOnBasicAttackHit(d, 'RIGHT'); const lsHeal = +(c.hp - hb).toFixed(2); c.itemPhysicalVampPercent = 0;
    return { level: lv, rawExpected: +raw.toFixed(2), dummyArmor: armor, dmgNoAmp: noAmp, dmgWithShojin20pct: withShojin, emberBurnFromRightPunch: burnAfterRight, lifeStealHealFromRightPunch: lsHeal };
  });
  // C) 포탑: 실제 평타로 적 외곽 포탑을 때려 타격별 피해를 기록(왼손/오른손)
  r.Cturret = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller;
    const t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1') || E.turrets.find((x) => x.team === 'RED' && !x.destroyed && x.type !== 'nexusWell');
    if (!t) return res({ note: 'no turret' });
    t.hp = t.maxHp; t.attackDamage = 0; t._qaNoShoot = true;
    const tp = E.getWorldPosition(t); c.root.position.set(tp.x, 0, tp.z + E.lolRangeToWorld(260));
    c.statusEffects = []; c.hp = c.maxHp = 1e6;
    const hits = []; let last = t.hp;
    const iv = setInterval(() => { if (t.hp !== last) { hits.push({ dmg: +(last - t.hp).toFixed(1), step: c._settAttackStep }); last = t.hp; } }, 10);
    c.selectTarget(t);
    setTimeout(() => { clearInterval(iv); c.currentTarget = null; res({ turretArmor: t.armor, hits: hits.slice(0, 6) }); }, 4500);
  }));
  // D) 마스터 이 E
  await load('masteryi');
  r.D = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    c.skillLevels.E = 1;
    E.applyStatus(c, { id: 'masteryiE', type: 'MASTERYI_E', duration: 30, value: 1 });
    const cd = window.__e2e; const lv = 1;
    const wuju = (amp) => { d.hp = d.maxHp = 1e5; d.statusEffects = []; c.itemSpellDamageAmpPercent = amp; const b = d.hp; c._masteryiApplyWujuTrueDamage(d); c.itemSpellDamageAmpPercent = 0; return +(b - d.hp).toFixed(2); };
    const noAmp = wuju(0), withShojin = wuju(0.2);
    c.itemPhysicalVampPercent = 0.1; c.hp = c.maxHp * 0.5; let hb = c.hp; d.hp = 1e5; c._masteryiApplyWujuTrueDamage(d); const lsHeal = +(c.hp - hb).toFixed(2); c.itemPhysicalVampPercent = 0;
    c.items = [{ id: 'embersOfFate', count: 1 }]; window.recomputeItemStats(c);
    d.hp = 1e5; d.statusEffects = []; c._masteryiApplyWujuTrueDamage(d); const burn = (d.statusEffects || []).map((s) => s.id || s.type).filter((x) => /ember|burn|BURN|DOT/i.test(x));
    c.items = []; window.recomputeItemStats(c);
    return { wujuNoAmp: noAmp, wujuWithShojin20pct: withShojin, lifeStealHealFromWuju: lsHeal, emberBurnFromWuju: burn };
  });
  r.Dturret = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller;
    const t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1') || E.turrets.find((x) => x.team === 'RED' && !x.destroyed && x.type !== 'nexusWell');
    t.hp = t.maxHp; t.attackDamage = 0;
    const tp = E.getWorldPosition(t); c.root.position.set(tp.x, 0, tp.z + E.lolRangeToWorld(220));
    c.hp = c.maxHp = 1e6;
    const run = (withE) => new Promise((ok) => {
      c.statusEffects = []; if (withE) E.applyStatus(c, { id: 'masteryiE', type: 'MASTERYI_E', duration: 30, value: 1 });
      const hits = []; let last = t.hp;
      const iv = setInterval(() => { if (t.hp !== last) { hits.push(+(last - t.hp).toFixed(1)); last = t.hp; } }, 10);
      c._masteryi.attackCount = 0; c.selectTarget(t);
      setTimeout(() => { clearInterval(iv); c.currentTarget = null; c.setState('IDLE'); ok(hits.slice(0, 4)); }, 3500);
    });
    run(false).then((a) => setTimeout(() => run(true).then((b) => res({ withoutE: a, withE: b })), 800));
  }));
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
