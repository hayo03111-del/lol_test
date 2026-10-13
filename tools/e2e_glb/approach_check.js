// 대상 지정 스킬 "사거리까지 걸어간 뒤 시전" 점검(헤드리스 Chromium + 실제 GLB): 사거리 밖 대상에게 시전하면 걸어가서
// 사거리에 들어오는 순간 시전하는지, 이동 명령으로 취소되는지, 쿨다운 중이면 걷지 않는지 확인한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/approach_check.js
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const wait = (ms) => page.waitForTimeout(ms);
  const load = async (id, kr) => { await page.setInputFiles('#glbFileInput', { name: kr + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, kr + '.glb')) }); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); await wait(800); };
  // 플레이어 (0,0), 대상 허수아비 d1을 정면 distLol에 두고(나머지는 멀리) 시전. 매 50ms 플레이어 위치·쿨다운을 기록해
  // "처음 쿨다운이 생긴 순간의 거리"(= 시전 시점 거리)를 잰다.
  const run = (slot, distLol, { cdFirst = 0, cancelAfterMs = 0, watchMs = 6000, useAlly = false } = {}) => page.evaluate(({ slot, distLol, cdFirst, cancelAfterMs, watchMs, useAlly }) => new Promise((resolve) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.cooldowns[slot] = cdFirst; c.mp = c.maxMp; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 };
    c.root.position.set(0, 0, 0); c.targetPos = null; c.currentTarget = null; c.setState('IDLE');
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 5000; d.statusEffects = []; }
    d0.mesh.position.set(-40, 0, -40); d2.mesh.position.set(40, 0, -40); d1.mesh.position.set(0, 0, -L(distLol));
    let target = d1;
    if (useAlly) {
      d1.mesh.position.set(40, 0, 40);
      const a = E.createAllyDummy(new E.THREE.Vector3(0, 0, -L(distLol))); E.placedAllies.push(a); target = a;
    }
    const tp = E.getWorldPosition(target).clone();
    const hp0 = target.hp;
    if (!useAlly) c.currentTarget = d1; // 조준 시스템이 커서 아래 적을 대상으로 잡은 상태와 같음
    c.castAbility(slot, tp.clone());
    const startedWalking = c.state === 'MOVE' && !!c._approachCast;
    const t0 = performance.now(); let castDistLol = null, castAt = null;
    if (cancelAfterMs) setTimeout(() => c.moveTo(new E.THREE.Vector3(L(600), 0, 0)), cancelAfterMs);
    const iv = setInterval(() => {
      const p = c.root.position, now = performance.now() - t0;
      if (castDistLol == null && (c.cooldowns[slot] > cdFirst + 0.01 || (slot === 'E' && c.championId === 'nilah' && c.currentActionKey === 'nilahE'))) {
        castDistLol = Math.round(E.worldDistanceToLol(Math.hypot(p.x - tp.x, p.z - tp.z))); castAt = Math.round(now);
      }
      if (now > watchMs) {
        clearInterval(iv);
        resolve({ startedWalking, castDistLol, castAtMs: castAt, finalDistLol: Math.round(E.worldDistanceToLol(Math.hypot(p.x - tp.x, p.z - tp.z))), approachLeft: !!c._approachCast,
          targetDamaged: target.hp < hp0, cd: +c.cooldowns[slot].toFixed(1), primaryIsD1: !!(c._masteryi && c._masteryi.alpha && c._masteryi.alpha.primaryTarget === d1) });
      }
    }, 50);
  }), { slot, distLol, cdFirst, cancelAfterMs, watchMs, useAlly });
  const r = {};
  await load('garen', '가렌');
  r.garenR_far = await run('R', 1000);                       // 사거리 400 - 걸어가서 시전
  r.garenR_cancel = await run('R', 1200, { cancelAfterMs: 400 }); // 걸어가다 이동 명령 → 취소
  r.garenR_onCooldown = await run('R', 1000, { cdFirst: 30, watchMs: 1500 }); // 쿨다운 중 - 걷지 않음
  r.garenR_inRange = await run('R', 300, { watchMs: 1500 });  // 사거리 안 - 그 자리에서 시전
  await load('nilah', '닐라');
  r.nilahE_far = await run('E', 1000, { watchMs: 5000 });     // 사거리 550 - 예전엔 거리와 무관하게 바로 돌진
  await load('masteryi', '마스터 이');
  r.yiQ_far = await run('Q', 1100, { watchMs: 3000 });        // 사거리 600 - 클릭한 먼 대상에게
  await load('leesin', '리 신');
  r.leeW_allyFar = await run('W', 1200, { useAlly: true, watchMs: 5000 }); // 사거리 700 아군에게 걸어가서 돌진
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
