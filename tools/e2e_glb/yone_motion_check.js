// 86차 요네 모션 점검(헤드리스 Chromium + 저장소 모델): 평타·이동·Q1/Q2/Q3·W·E(정신체/복귀)·R을 서 있을 때·이동 중에 써 보고
// 40ms마다 상태·재생 클립을 기록해 "모션 버그"를 찾는다:
//  - idleStuck: 행동이 끝나 IDLE인데 대기 클립이 아닌 동작(공격·스킬 끝 자세)이 1.2초 넘게 멈춰 있음
//  - moveWrongClip: 걷는 중(MOVE)인데 달리기 클립이 아닌 동작이 0.7초 넘게 재생
//  - frozen: 클립 시간이 0.8초 넘게 그대로(끝 자세에 멈춤)이고 반복 클립이 아님
//  - modelOffset: 모델(골반)이 캐릭터 위치에서 크게 벗어남
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/yone_motion_check.js [스크린샷 폴더]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || null;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'yone'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'yone', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const c = window.controller;
    window.__samples = [];
    window.__iv = setInterval(() => {
      const a = c.currentAction; const clip = a && a.getClip ? a.getClip() : null;
      const pelvis = c.model.getObjectByName('Pelvis') || c.model.getObjectByName('pelvis') || c.model.getObjectByName('Root') || null;
      let off = 0;
      if (pelvis) { const v = new (window.__e2e.THREE.Vector3)(); pelvis.getWorldPosition(v); off = Math.hypot(v.x - c.root.position.x, v.z - c.root.position.z); }
      window.__samples.push({ t: performance.now(), state: c.state, key: c.currentActionKey, clip: c.currentClipKey || (clip && clip.name), time: a ? +a.time.toFixed(3) : null, loop: a ? a.loop : null, paused: a ? !!a.paused : null, w: a ? +a.getEffectiveWeight().toFixed(2) : null, seq: !!(c.sequencePlayer && c.sequencePlayer.isPlaying), off: +off.toFixed(2), scen: window.__scen || '' });
    }, 40);
  });
  const reset = (scen) => page.evaluate((scen) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    window.__scen = scen;
    c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.currentTarget = null; c._attackReadyAt = 0;
    if (c._yoneEndSpiritForE2E) {}
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.hp = c.maxHp; c.statusEffects = [];
    c.root.position.set(0, 0, 0); c.setState('IDLE'); c._returnToLocomotion && c._returnToLocomotion();
    const [d0, d1, d2] = E.dummies; for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e5; d.statusEffects = []; }
    d0.mesh.position.set(0, 0, -L(250)); d1.mesh.position.set(L(300), 0, -L(500)); d2.mesh.position.set(-60, 0, -60);
  }, scen);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (name) => { if (shotDir) await page.screenshot({ path: `${shotDir}/yone_${name}.png` }); };
  const run = async (scen, fn, settleMs = 1600) => { await reset(scen); await wait(500); await page.evaluate(fn); await wait(settleMs); await shot(scen); };
  const V = 'new window.__e2e.THREE.Vector3';
  await run('attack', `(() => { window.controller.selectTarget(window.__e2e.dummies[0]); })()`, 3200);
  await run('attackThenMove', `(() => { const c = window.controller; c.selectTarget(window.__e2e.dummies[0]); setTimeout(() => c.moveTo(${V}(4, 0, 2)), 900); })()`, 2200);
  await run('move', `(() => { window.controller.moveTo(${V}(5, 0, 5)); })()`, 2000);
  await run('q1', `(() => { const c = window.controller; c.castAbility('Q', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()); })()`, 1600);
  await run('q1Moving', `(() => { const c = window.controller; c.moveTo(${V}(-5, 0, 3)); setTimeout(() => c.castAbility('Q', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()), 300); })()`, 2000);
  await run('q3', `(() => { const c = window.controller; if (c._yone) { c._yone.qStacks = 2; c._yone.qStackExpiresAt = performance.now() + 5000; } c.castAbility('Q', window.__e2e.getWorldPosition(window.__e2e.dummies[1]).clone()); })()`, 2200);
  await run('q3ThenMove', `(() => { const c = window.controller; if (c._yone) { c._yone.qStacks = 2; c._yone.qStackExpiresAt = performance.now() + 5000; } c.castAbility('Q', window.__e2e.getWorldPosition(window.__e2e.dummies[1]).clone()); setTimeout(() => c.moveTo(${V}(-4, 0, 4)), 700); })()`, 2200);
  await run('w', `(() => { window.controller.castAbility('W', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()); })()`, 1800);
  await run('wMoving', `(() => { const c = window.controller; c.moveTo(${V}(5, 0, -3)); setTimeout(() => c.castAbility('W', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()), 300); })()`, 2000);
  await run('eThenRecast', `(() => { const c = window.controller; c.castAbility('E', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()); setTimeout(() => c.moveTo(${V}(3, 0, -2)), 700); setTimeout(() => c.castAbility('E'), 1800); })()`, 3400);
  await run('eAttack', `(() => { const c = window.controller; c.castAbility('E', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()); setTimeout(() => c.selectTarget(window.__e2e.dummies[0]), 600); })()`, 3000);
  await run('r', `(() => { window.controller.castAbility('R', window.__e2e.getWorldPosition(window.__e2e.dummies[1]).clone()); })()`, 2800);
  await run('rMoving', `(() => { const c = window.controller; c.moveTo(${V}(-5, 0, -5)); setTimeout(() => c.castAbility('R', window.__e2e.getWorldPosition(window.__e2e.dummies[1]).clone()), 300); })()`, 3000);
  await run('qDuringAttack', `(() => { const c = window.controller; c.selectTarget(window.__e2e.dummies[0]); setTimeout(() => c.castAbility('Q', window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()), 150); })()`, 2200);
  const samples = await page.evaluate(() => { clearInterval(window.__iv); return window.__samples; });
  const idleish = /idle|Idle/; const runish = /run|Run|walk|Walk|Haste/;
  const issues = [];
  const byScen = {};
  for (const s of samples) (byScen[s.scen] = byScen[s.scen] || []).push(s);
  const report = {};
  for (const [scen, arr] of Object.entries(byScen)) {
    const clipsSeen = []; for (const s of arr) if (clipsSeen[clipsSeen.length - 1] !== s.clip) clipsSeen.push(s.clip);
    let idleStuck = 0, moveWrong = 0, frozen = 0, maxOff = 0;
    let runStart = null, prev = null, frozenSince = null;
    for (const s of arr) {
      maxOff = Math.max(maxOff, s.off);
      const badIdle = s.state === 'IDLE' && !s.key && s.clip && !idleish.test(s.clip) && !s.seq;
      const badMove = s.state === 'MOVE' && !s.key && s.clip && !runish.test(s.clip) && !s.seq;
      const bad = badIdle ? 'idle' : badMove ? 'move' : null;
      if (bad) { if (!runStart || runStart.kind !== bad) runStart = { kind: bad, t: s.t, clip: s.clip }; else if (s.t - runStart.t > (bad === 'idle' ? 1200 : 700) && !runStart.reported) { runStart.reported = true; if (bad === 'idle') idleStuck++; else moveWrong++; issues.push(`${scen}: ${bad === 'idle' ? '대기 중 동작 멈춤' : '이동 중 엉뚱한 동작'} ${s.clip}`); } } else runStart = null;
      if (prev && prev.clip === s.clip && prev.time === s.time && s.loop !== 2201 && !s.seq && s.time != null) { frozenSince = frozenSince ?? prev.t; if (s.t - frozenSince > 800 && s.state !== 'DEAD') { frozen++; frozenSince = s.t; issues.push(`${scen}: 끝 자세에 멈춤 ${s.clip}(state ${s.state})`); } } else frozenSince = null;
      prev = s;
    }
    report[scen] = { clips: clipsSeen.slice(0, 14), endState: arr[arr.length - 1].state, endClip: arr[arr.length - 1].clip, idleStuck, moveWrong, frozen, maxPelvisOffsetWorld: maxOff };
  }
  console.log(JSON.stringify({ report, issues: [...new Set(issues)], errors }, null, 1));
  await browser.close(); srv.close();
})();
