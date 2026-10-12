// 이동 자연스러움 점검(헤드리스 Chromium + 실제 GLB): 회전·미끄러짐·이동 속도·연속 클릭 재시작·이속 버프 재생 속도·
// 추격 후 평타 시 바라보는 방향·정지/출발 전환을 프레임 단위로 기록한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/movement_check.js [챔피언id...]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const CHAMPS = { garen: '가렌', darius: '다리우스', masteryi: '마스터 이', leesin: '리 신', nautilus: '노틸러스', yasuo: '야스오', yone: '요네', sett: '세트', mordekaiser: '모데카이저', renekton: '레넥톤', nilah: '닐라', chogath: '초가스', ezreal: '이즈리얼', ashe: '애쉬', varus: '바루스', ahri: '아리', vex: '벡스' };
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const only = process.argv.slice(2); const res = {};
  for (const id of Object.keys(CHAMPS)) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 240, height: 135 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.setInputFiles('#glbFileInput', { name: CHAMPS[id] + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, CHAMPS[id] + '.glb')) });
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(700);
    res[id] = await page.evaluate(() => new Promise((resolve) => {
      const E = window.__e2e, c = window.controller, T = E.THREE, W = E.lolRangeToWorld(1);
      const yawOf = () => { const f = new T.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion); return Math.atan2(f.x, f.z); };
      const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) * 180 / Math.PI; };
      const out = { clipsSeen: [] };
      // 허수아비들을 멀리 치운다(추격 테스트 때 하나만 다시 놓는다)
      const d0 = E.dummies[0];
      for (const u of E.dummies) u.mesh.position.set(1e4, 0, 1e4);
      c.root.position.set(0, 0, 0); c.faceDirectionInstant(new T.Vector3(0, 0, 1));
      const frames = []; let phase = 'turn'; const t0 = performance.now();
      let lastPos = c.root.position.clone(), lastClip = null, lastTime = 0, restarts = 0;
      const tick = () => {
        const t = performance.now() - t0;
        const p = c.root.position.clone(); const v = p.clone().sub(lastPos).setY(0);
        const a = c.currentAction;
        const clip = c.currentClipKey;
        if (clip !== lastClip) { out.clipsSeen.push(`${Math.round(t)}:${phase}:${clip}`); lastClip = clip; lastTime = 0; }
        else if (a && phase === 'spam' && c._moveClips().includes(clip) && a.time + 1e-3 < lastTime && lastTime < (a.getClip().duration - 0.1)) restarts++;
        if (a) lastTime = a.time;
        if (phase === 'chase' && out.attackFacingErrDeg == null && /attack|crit/i.test(clip || '')) { const dp = E.getWorldPosition(d0); out.attackFacingErrDeg = Math.round(angDiff(yawOf(), Math.atan2(dp.x - p.x, dp.z - p.z))); out.attackStartMs = Math.round(t - 5600); }
        frames.push({ t, phase, x: p.x, z: p.z, yaw: yawOf(), moved: v.length(), vdir: v.lengthSq() > 1e-10 ? Math.atan2(v.x, v.z) : null, ts: a ? a.timeScale : null, clip });
        lastPos = p;
      };
      const iv = setInterval(tick, 16);
      // 1) 뒤로(180°) 600 이동
      c.moveTo(new T.Vector3(0, 0, -E.lolRangeToWorld(600)));
      setTimeout(() => { phase = 'spam'; let k = 0; const sp = setInterval(() => { k++; c.moveTo(new T.Vector3(E.lolRangeToWorld(40 * (k % 3)), 0, -E.lolRangeToWorld(600 + 1500))); if (k >= 12) clearInterval(sp); }, 100); }, 2600);
      setTimeout(() => { phase = 'haste'; E.applyStatus(c, { id: 'testHaste', type: 'MS_BUFF', duration: 3, value: 0.5 }); }, 4000);
      setTimeout(() => { phase = 'chase'; E.applyStatus(c, { id: 'testHaste', type: 'MS_BUFF', duration: 0.01, value: 0 });
        const cp = c.root.position.clone(); const side = new T.Vector3(E.lolRangeToWorld(700), 0, 0);
        d0.mesh.position.copy(cp.clone().add(side)); d0.hp = d0.maxHp = 5000; c.selectTarget(d0); }, 5600);
      // 5) 이동 중 Q 시전 → 시전이 끝난 뒤 다시 걸어가기 시작할 때까지의 시간(대기 이동 복귀)
      setTimeout(() => { phase = 'castmove'; c.currentTarget = null; c.attackOrderActive = false; for (const u of E.dummies) u.mesh.position.set(1e4, 0, 1e4);
        c.cooldowns.Q = 0; c.mp = c.maxMp; const cp = c.root.position.clone(); const far = cp.clone().add(new T.Vector3(0, 0, E.lolRangeToWorld(2500)));
        c.moveTo(far); setTimeout(() => { window.__castAt = performance.now() - t0; c.castAbility('Q', cp.clone().add(new T.Vector3(0, 0, E.lolRangeToWorld(400)))); }, 300); }, 8300);
      setTimeout(() => {
        clearInterval(iv);
        const turn = frames.filter((f) => f.phase === 'turn');
        const target = Math.PI; // 뒤쪽(-z) 방향 yaw = ±π
        const aligned = turn.find((f) => angDiff(f.yaw, target) < 10);
        out.turnTimeMs = aligned ? Math.round(aligned.t) : null;
        const movingTurn = turn.filter((f) => f.vdir != null && f.moved > 1e-4);
        out.maxSlideDeg = Math.round(Math.max(0, ...movingTurn.map((f) => angDiff(f.yaw, f.vdir))));
        out.slideDistLol = Math.round(movingTurn.filter((f) => angDiff(f.yaw, f.vdir) > 45).reduce((s, f) => s + f.moved, 0) / W);
        const runF = turn.filter((f) => f.t > 500 && f.t < 1500 && f.moved > 0);
        const dur = runF.length ? (runF[runF.length - 1].t - runF[0].t) / 1000 : 0;
        out.speedLol = dur ? Math.round(Math.hypot(runF[runF.length - 1].x - runF[0].x, runF[runF.length - 1].z - runF[0].z) / W / dur) : null; // 구간 양 끝 위치 차 / 시간
        out.statSpeed = Math.round(getFinalMoveSpeedForE2E(c.stats));
        out.spamRestarts = restarts;
        const base = frames.filter((f) => f.phase === 'spam' && f.ts != null).map((f) => f.ts);
        const hs = frames.filter((f) => f.phase === 'haste' && f.t > 4300 && f.ts != null).map((f) => f.ts);
        out.timeScaleBase = base.length ? +base[base.length - 1].toFixed(2) : null;
        out.timeScaleHaste = hs.length ? +hs[hs.length - 1].toFixed(2) : null;
        out.hasteClip = (frames.filter((f) => f.phase === 'haste').slice(-1)[0] || {}).clip;
        // 추격 → 평타 시작 시 바라보는 방향 오차
        const cm = frames.filter((f) => f.phase === 'castmove' && f.t >= (window.__castAt || 1e9));
        const stop = cm.find((f) => f.moved < 1e-5); const resume = stop ? cm.find((f) => f.t > stop.t && f.moved > 1e-4) : null;
        out.castStoppedMove = !!stop; out.castResumeMs = resume ? Math.round(resume.t - window.__castAt) : (stop ? 'never' : 0);
        out.castResumeClip = resume ? resume.clip : null;
        out.clipsSeen = out.clipsSeen.slice(0, 24);
        resolve(out);
      }, 10600);
    }));
    res[id].errors = errors.slice(0, 3);
    await page.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})();
