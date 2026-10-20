// 88차 전 챔피언 모션 점검(yone_motion_check를 일반화): 평타·이동·Q/W/E/R을 서 있을 때·이동 중·평타 도중·연달아(재시전) 써 보고
// 40ms마다 상태·재생 클립을 기록해 "모션 버그"를 찾는다:
//  - idleStuck: 행동이 끝나 IDLE인데 대기 클립이 아닌 동작(공격·스킬 끝 자세)이 1.2초 넘게 멈춰 있음
//  - moveWrongClip: 걷는 중(MOVE)인데 달리기 클립이 아닌 동작이 0.7초 넘게 재생
//  - frozen: 클립 시간이 0.8초 넘게 그대로(끝 자세에 멈춤)이고 반복 클립이 아님
//  - modelOffset: 모델(골반)이 캐릭터 위치에서 크게 벗어남
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/champ_motion_check.js [챔피언ID...]  (생략 시 전 챔피언)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['garen', 'darius', 'masteryi', 'leesin', 'nautilus', 'yasuo', 'yone', 'sett', 'mordekaiser', 'renekton', 'nilah', 'chogath', 'ezreal', 'ashe', 'varus', 'ahri', 'vex', 'rammus', 'lux'];
  const shotDir = null;
  const all = {};
  for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 });
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
    const T0 = `window.__e2e.getWorldPosition(window.__e2e.dummies[0]).clone()`, T1 = `window.__e2e.getWorldPosition(window.__e2e.dummies[1]).clone()`;
    await run('attack', `(() => { window.controller.selectTarget(window.__e2e.dummies[0]); })()`, 3000);
    await run('attackThenMove', `(() => { const c = window.controller; c.selectTarget(window.__e2e.dummies[0]); setTimeout(() => c.moveTo(${V}(4, 0, 2)), 900); })()`, 2200);
    await run('move', `(() => { window.controller.moveTo(${V}(5, 0, 5)); })()`, 2000);
    for (const slot of ['Q', 'W', 'E', 'R']) {
      const tgt = slot === 'R' ? T1 : T0;
      await run(slot, `(() => { const c = window.controller; c.currentTarget = window.__e2e.dummies[0]; c.castAbility('${slot}', ${tgt}); })()`, 2600);
      await run(slot + 'Moving', `(() => { const c = window.controller; c.moveTo(${V}(-5, 0, 3)); setTimeout(() => { c.currentTarget = null; c.castAbility('${slot}', ${tgt}); }, 300); })()`, 2600);
      await run(slot + 'DuringAttack', `(() => { const c = window.controller; c.selectTarget(window.__e2e.dummies[0]); setTimeout(() => c.castAbility('${slot}', ${tgt}), 150); })()`, 2800);
      await run(slot + 'Recast', `(() => { const c = window.controller; c.currentTarget = window.__e2e.dummies[0]; c.castAbility('${slot}', ${tgt}); setTimeout(() => { c.cooldowns.${slot} = 0; c.mp = c.maxMp; c.castAbility('${slot}', ${tgt}); }, 900); })()`, 3000);
    }
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
  
    all[id] = { issues: [...new Set(issues)], errors: errors.slice(0, 5), stuckSummary: Object.fromEntries(Object.entries(report).filter(([, v]) => v.idleStuck || v.moveWrong || v.frozen).map(([k, v]) => [k, { endState: v.endState, endClip: v.endClip, clips: v.clips.slice(0, 10) }])) };
    await page.close();
  }
  console.log(JSON.stringify(all, null, 1));
  await browser.close(); srv.close();
})();
