// 38차 람머스 점검(헤드리스 Chromium + 저장소 모델): 클립 연결, 패시브(방어력·마저 15% → 공격력), Q 구르기(가속·충돌 피해·
// 기절·둔화·넉백·재사용 대기시간은 끝난 뒤부터·재사용 종료), W(방어력·마저·반사 피해, Q 끝내기), E(도발 - 다가옴), R(도약·착지 피해·
// 둔화·대회전 중이면 공중에 뜸), 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/rammus_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'rammus'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'rammus', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const wait = (ms) => page.waitForTimeout(ms);
  const reset = (dz = 600) => page.evaluate((dz) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c._clearActionTimers && c._clearActionTimers();
    if (c._rammusReset) c._rammusReset();
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c._dashState = null;
    c.statusEffects = []; c.root.position.set(0, 0, 0); c.hp = c.maxHp; c.mp = c.maxMp;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 };
    for (const d of E.dummies) { d.hp = d.maxHp = 1e5; d.statusEffects = []; d._pullState = null; d.mesh.position.set(40, 0, 40); }
    const d = E.dummies[0]; d.mesh.position.set(0, 0, -L(dz));
    c.recomputeStats();
  }, dz);
  const r = {};
  r.clips = await page.evaluate(() => { const c = window.controller, ad = c.actionData || {}; const res = (k) => ad[k] ? (c.resolveClip(ad[k].clips || []) || {}).name : null;
    return { idle: res('idle'), move: res('move'), attack1: res('attack1'), attack2: res('attack2'), hasRChannel: !!ad.hasRChannel, glbClips: (c.clips || []).length }; });

  await reset(); await wait(300);
  r.passive = await page.evaluate(() => { const c = window.controller; return { bonusAD: +c.bonusAD.toFixed(2), expect: +(0.15 * (c.stats.armor + c.stats.magicResist)).toFixed(2), ad: +c.stats.attackDamage.toFixed(1) }; });

  // Q: 더미 쪽으로 굴러가 충돌
  await reset(600);
  const qStart = await page.evaluate(() => { const E = window.__e2e, c = window.controller, d = E.dummies[0]; window.__hp0 = d.hp; window.__dz0 = d.mesh.position.z;
    c.castAbility('Q'); c.moveTo(new E.THREE.Vector3(0, 0, d.mesh.position.z)); return { rolling: !!c._rammus.roll, cdWhileRolling: c.cooldowns.Q }; });
  let msSamples = [];
  for (let i = 0; i < 40; i++) { const s = await page.evaluate(() => { const c = window.controller; const st = c.statusEffects.find((e) => e.id === 'rammusQ_ms'); return { rolling: !!c._rammus.roll, ms: st ? +st.value.toFixed(3) : null, clip: c.currentClipKey }; }); msSamples.push(s); if (!s.rolling) break; await wait(60); }
  await wait(250);
  r.q = await page.evaluate(() => { const E = window.__e2e, c = window.controller, d = E.dummies[0];
    return { dmg: Math.round(window.__hp0 - d.hp), knockbackLol: Math.round(E.worldDistanceToLol(Math.abs(d.mesh.position.z - window.__dz0))), statuses: (d.statusEffects || []).map((e) => e.type), cdAfter: +c.cooldowns.Q.toFixed(1), rolling: !!c._rammus.roll }; });
  r.q.start = qStart; r.q.maxMs = Math.max(...msSamples.map((s) => s.ms || 0)); r.q.rollClip = msSamples.find((s) => s.rolling)?.clip;

  // Q 재사용으로 끝내기(1초 뒤), W가 Q를 끝냄
  await reset(1500);
  await page.evaluate(() => window.controller.castAbility('Q')); await wait(400);
  await page.evaluate(() => window.controller.castAbility('Q')); await wait(100);
  r.qRecastTooEarly = await page.evaluate(() => !!window.controller._rammus.roll);
  await wait(900); await page.evaluate(() => window.controller.castAbility('Q')); await wait(100);
  r.qRecastEnds = await page.evaluate(() => ({ rolling: !!window.controller._rammus.roll, cd: +window.controller.cooldowns.Q.toFixed(1) }));
  await reset(1500);
  await page.evaluate(() => window.controller.castAbility('Q')); await wait(200);
  const armor0 = await page.evaluate(() => window.controller.stats.armor);
  await page.evaluate(() => window.controller.castAbility('W')); await wait(100);
  r.w = await page.evaluate((armor0) => { const c = window.controller; return { qEndedByW: !c._rammus.roll, armorGain: +(c.stats.armor - armor0).toFixed(1), expect: +(27 + armor0 * 0.30).toFixed(1), mrGain: +c._rammus.wMr.toFixed(1), adFromPassiveUp: +c.bonusAD.toFixed(1) }; }, armor0);
  r.wReflect = await page.evaluate(() => { const E = window.__e2e, c = window.controller, d = E.dummies[0]; const h = d.hp; E.applyDamage(c, { rawDamage: 10, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: d }); return Math.round(h - d.hp); });

  // E: 도발 - 대상이 람머스에게 다가온다
  await reset(300);
  r.e = await page.evaluate(() => new Promise((res) => { const E = window.__e2e, c = window.controller, d = E.dummies[0]; c.currentTarget = d; const z0 = d.mesh.position.z;
    c.castAbility('E'); setTimeout(() => res({ taunt: !!(d.statusEffects || []).find((e) => e.type === 'TAUNT'), movedTowardLol: Math.round(E.worldDistanceToLol(d.mesh.position.z - z0)), cd: +c.cooldowns.E.toFixed(1) }), 700); }));

  // R: 지점에 도약 → 착지 피해·둔화 / 대회전 중이면 공중에 뜸
  await reset(600);
  r.r = await page.evaluate(() => new Promise((res) => { const E = window.__e2e, c = window.controller, d = E.dummies[0], h = d.hp; let maxY = 0;
    c.castAbility('R', d.mesh.position.clone());
    const iv = setInterval(() => { maxY = Math.max(maxY, c.root.position.y); if (!c._rammus.jump) { clearInterval(iv); setTimeout(() => res({ dmg: Math.round(h - d.hp), maxY: +maxY.toFixed(2), landedGapLol: Math.round(E.worldDistanceToLol(Math.hypot(d.mesh.position.x - c.root.position.x, d.mesh.position.z - c.root.position.z))), statuses: (d.statusEffects || []).map((e) => e.type), y: c.root.position.y, actionCleared: c.currentActionKey == null }), 100); } }, 20); }));
  await reset(700);
  await page.evaluate(() => { const c = window.controller; c.castAbility('Q'); });
  await wait(300);
  await page.screenshot({ path: path.join(shotDir, 'rammus_roll.png') });
  r.rPowerball = await page.evaluate(() => new Promise((res) => { const E = window.__e2e, c = window.controller, d = E.dummies[0], h = d.hp;
    c.castAbility('R', d.mesh.position.clone());
    const iv = setInterval(() => { if (!c._rammus.jump) { clearInterval(iv); setTimeout(() => res({ rollEnded: !c._rammus.roll, qCdStarted: c.cooldowns.Q > 0, dmg: Math.round(h - d.hp), rangeLol: Math.round(c._rammusRRangeLol()), knockup: !!(d.statusEffects || []).find((e) => e.type === 'KNOCKUP') }), 80); } }, 20); }));
  await wait(400);
  await page.screenshot({ path: path.join(shotDir, 'rammus_r.png') });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
