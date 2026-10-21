// 91차 스킬 피해 점검(2조: 야스오·요네·마스터 이·닐라·리 신) - 각 스킬 피해 함수를 허수아비(방어력/마저 0·100)에 직접 넣어
// 실제 들어간 피해를 원작 공식(26.21 기준 기대값)과 비교한다. 칼바람 보정 등 공통 배율은 고정 피해 100으로 먼저 잰 뒤 나눠서 없앤다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_dmg_group2.js
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
  // 공통 도우미(페이지 안에 심는다)
  const prelude = `
    window.__qa = (() => {
      const E = window.__e2e, c = window.controller, d = E.dummies[0];
      const setRes = (a, m) => { d.armor = a; d.magicResist = m; d.baseArmor = a; d.baseMagicResist = m; if (d.stats) { d.stats.armor = a; d.stats.magicResist = m; d.stats.baseArmor = a; } };
      const fresh = () => { d.hp = d.maxHp = 1e6; d.statusEffects = []; d.shield = 0; };
      const measure = (fn) => { fresh(); const b = d.hp; try { fn(d); } catch (e) { return 'ERR ' + e.message; } return +(b - d.hp).toFixed(2); };
      setRes(0, 0);
      const cal = measure(() => E.applyDamage(d, { rawDamage: 100, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isAbility: true, source: c })) / 100;
      const norm = (v) => typeof v === 'number' ? +(v / cal).toFixed(2) : v;
      const bonusAd = () => c._getBonusAD ? c._getBonusAD() : 0;
      return { E, c, d, setRes, fresh, measure, cal, norm, bonusAd };
    })();`;
  const r = { errors };

  // ---------- 야스오 ----------
  await load('yasuo');
  r.yasuo = await page.evaluate((prelude) => { eval(prelude); const { c, d, setRes, measure, norm, bonusAd, cal } = window.__qa;
    const out = { calibration: cal, ad: c.stats.attackDamage, bonusAd: bonusAd(), critMultStat: c.stats.critMultiplier, critMod: c.stats.critDamageModifier };
    for (const lvl of [1, 5]) {
      c.skillLevels.Q = lvl; c._yasuoQHitConsumed = true;
      c._yasuoQCritRoll = false; const q = norm(measure(() => c._yasuoApplyQHit(d)));
      c._yasuoQCritRoll = true; const qc = norm(measure(() => c._yasuoApplyQHit(d)));
      c._yasuoQCritRoll = null;
      const base = [20, 45, 70, 95, 120][lvl - 1];
      out['Q' + lvl] = { got: q, expect: +(base + 1.05 * c.stats.attackDamage).toFixed(2), crit: qc, expectCrit_26_17: +(base + 1.05 * c.stats.attackDamage * 1.75 * 0.95).toFixed(2) };
    }
    for (const [lvl, st] of [[1, 0], [5, 4]]) {
      c.skillLevels.E = lvl; c._yasuo.eDashTarget = d; c._yasuo.eDashTargetKey = null; c._yasuo.eDashStacksAtStart = st; c._yasuo.eDashDamageApplied = false;
      const got = norm(measure(() => c._yasuoApplyEDashDamage()));
      const base = [70, 85, 100, 115, 130][lvl - 1];
      out['E' + lvl + '_stacks' + st] = { got, expect: +((base + 0.2 * bonusAd() + 0.6 * (c.stats.abilityPower || 0)) * (1 + 0.25 * st)).toFixed(2) };
    }
    setRes(100, 100);
    c.skillLevels.Q = 1; c._yasuoQCritRoll = false; out.Q1_armor100 = { got: norm(measure(() => c._yasuoApplyQHit(d))), expect: +((20 + 1.05 * c.stats.attackDamage) / 2).toFixed(2) };
    c._yasuoQCritRoll = null; setRes(0, 0);
    return out; }, prelude);

  // ---------- 요네 ----------
  await load('yone');
  r.yone = await page.evaluate((prelude) => { eval(prelude); const { c, d, measure, norm, bonusAd, cal } = window.__qa;
    const out = { calibration: cal, ad: c.stats.attackDamage, critMultStat: c.stats.critMultiplier, critMod: c.stats.critDamageModifier };
    for (const lvl of [1, 5]) {
      c.skillLevels.Q = lvl; c._yoneQHitConsumed = true;
      c._yoneQCritRoll = false; const q = norm(measure(() => c._yoneApplyQHit(d)));
      c._yoneQCritRoll = true; const qc = norm(measure(() => c._yoneApplyQHit(d)));
      c._yoneQCritRoll = null;
      const base = [25, 50, 75, 100, 125][lvl - 1];
      out['Q' + lvl] = { got: q, expect_26_21: +(base + 1.05 * c.stats.attackDamage).toFixed(2), crit: qc, expectCrit_26_21: +(base + 1.05 * c.stats.attackDamage * 1.75 * 0.95).toFixed(2) };
    }
    return out; }, prelude);

  // ---------- 마스터 이 ----------
  await load('masteryi');
  r.masteryi = await page.evaluate((prelude) => { eval(prelude); const { E, c, d, measure, norm, bonusAd, cal } = window.__qa;
    const out = { calibration: cal, ad: c.stats.attackDamage };
    for (const lvl of [1, 5]) {
      const alpha = { q: c._champData().Q, lvl, currentTarget: d };
      out['Q' + lvl + '_calc'] = { first: +c._masteryiCalcAlphaStrikeDamage(alpha, 0).toFixed(2), repeat: +c._masteryiCalcAlphaStrikeDamage(alpha, 1).toFixed(2), expectFirst: +([20, 40, 60, 80, 100][lvl - 1] + 0.7 * c.stats.attackDamage).toFixed(2) };
    }
    // 일격필살 중 우주류 검술 적중 효과(75%) - 분류 확인: 스킬 피해 증폭(쇼진 20%)에 영향을 받으면 스킬로 분류된 것
    c.skillLevels.E = 1; E.applyStatus(c, { id: 'masteryiE', type: 'MASTERYI_E', duration: 30, value: 1 });
    const alpha = { q: c._champData().Q, lvl: 1, currentTarget: d };
    const onHit = (amp) => { c.itemSpellDamageAmpPercent = amp; const v = norm(measure(() => c._masteryiApplyAlphaStrikeOnHit(alpha, d))); c.itemSpellDamageAmpPercent = 0; return v; };
    out.QonHitE = { got: onHit(0), withShojin20: onHit(0.2), expect: +((20 + 0.35 * bonusAd()) * 0.75).toFixed(2), note: 'withShojin20 가 got보다 크면 적중 효과가 스킬 피해로 잘못 분류된 것' };
    const wuju = (amp) => { c.itemSpellDamageAmpPercent = amp; const v = norm(measure(() => c._masteryiApplyWujuTrueDamage(d))); c.itemSpellDamageAmpPercent = 0; return v; };
    out.E_onBasic = { got: wuju(0), withShojin20: wuju(0.2), expect: +(20 + 0.35 * bonusAd()).toFixed(2) };
    c.statusEffects = c.statusEffects.filter((s) => s.id !== 'masteryiE');
    // 일격필살 치명타: 아이템 없이 배율
    out.QcritMultiplierUsed = +(c._masteryiCalcAlphaStrikeCritDamage(alpha, 0) / c._masteryiCalcAlphaStrikeDamage(alpha, 0)).toFixed(4);
    return out; }, prelude);

  // ---------- 닐라 ----------
  await load('nilah');
  r.nilah = await page.evaluate((prelude) => { eval(prelude); const { E, c, d, measure, norm, bonusAd, cal } = window.__qa;
    const out = { calibration: cal, ad: c.stats.attackDamage, bonusAd: bonusAd(), critChance: c.stats.critChance };
    const dp = E.getWorldPosition(d).clone();
    c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(300));
    for (const lvl of [1, 5]) {
      c.skillLevels.Q = lvl;
      out['Q' + lvl] = { got: norm(measure(() => c._nilahQHit(dp.clone()))), expect: +([0, 10, 20, 30, 40][lvl - 1] + 1.0 * c.stats.attackDamage).toFixed(2) };
    }
    c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(200));
    for (const lvl of [1, 3]) {
      c.skillLevels.R = lvl;
      const seq = { championDamage: 0, nonChampionDamage: 0, ticksDone: 0 };
      out['Rtick' + lvl] = { got: norm(measure(() => c._nilahRApplyTick(seq))), expect: +([15, 25, 35][lvl - 1] + 0.1 * bonusAd()).toFixed(2) };
      const seq2 = { championDamage: 0, nonChampionDamage: 0, ticksDone: 4 };
      out['Rfinal' + lvl] = { got: norm(measure(() => c._nilahRFinish(seq2))), expect: +([125, 225, 325][lvl - 1] + 1.0 * bonusAd()).toFixed(2) };
    }
    return out; }, prelude);

  // ---------- 리 신 ----------
  await load('leesin');
  r.leesin = await page.evaluate((prelude) => { eval(prelude); const { E, c, d, measure, norm, bonusAd, cal } = window.__qa;
    const out = { calibration: cal, ad: c.stats.attackDamage, bonusAd: bonusAd() };
    for (const lvl of [1, 3]) {
      const dmg = [175, 400, 625][lvl - 1] + 2.0 * bonusAd();
      out['R' + lvl] = { got: norm(measure(() => c._leesinRKick(d, dmg, lvl))), expect: +dmg.toFixed(2) };
      d._pullState = null;
    }
    const w = c._champData().W;
    out.W_shieldData = { got: w.shieldByLevel, expect_26_10: [60, 105, 150, 195, 240] };
    return out; }, prelude);

  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
