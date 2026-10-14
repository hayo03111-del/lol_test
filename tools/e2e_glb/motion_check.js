// 평타 타격 모션 ↔ 피해 시점 점검(헤드리스 Chromium + 저장소 모델): 허수아비를 계속 때리게 하고 매 프레임
// (1) 평타 피해가 발동한 시각(STARTUP→ACTIVE) (2) 무기 뼈 속도가 가장 빠른 시각(실제 타격 장면)을 기록해 둘의 차이를 잰다.
// 비교용으로 예전 방식(클립 전체를 공격 간격에 맞춤 = 'fit')으로도 같은 측정을 한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/motion_check.js [챔피언,...]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const ids = (process.argv[2] || 'garen,darius,leesin,yone,ahri,mordekaiser,renekton,chogath,ezreal').split(',');
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const res = {};
  for (const id of ids) {
    await page.selectOption('#libraryChampSelect', id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(600);
    res[id] = {};
    for (const mode of ['fit', 'new']) {
      // 25차: 앞 측정의 마지막 스윙이 끝날 때까지 기다린다 - 예전엔 'fit' 측정의 마지막 스윙(예전 재생 속도)이 끝나기 전에
      // 'new' 측정을 시작해, 'new'의 첫 스윙이 +0.12~0.18초 늦은 것처럼 잡혔다(실제 문제가 아니라 측정 오염).
      await page.waitForFunction(() => !window.controller.currentActionKey, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      res[id][mode] = await page.evaluate((mode) => new Promise((resolve) => {
        const E = window.__e2e, c = window.controller, T = E.THREE, M = E.ATTACK_IMPACT_METHOD;
        const saved = M[c.championId];
        if (mode === 'fit') M[c.championId] = 'fit';
        const d = E.dummies[0]; d.hp = d.maxHp = 1e6;
        const dp = E.getWorldPosition(d); c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(100)); c.targetPos = null; c.currentTarget = null;
        // 매 프레임: 지금 재생 중인 평타 클립의 타격 뼈(그 클립에서 측정한 뼈) 속도, 평타 단계(STARTUP→ACTIVE = 피해 발동).
        const frames = []; const prev = {}; const v = new T.Vector3(), inv = new T.Matrix4();
        const t0 = performance.now();
        c.selectTarget(d);
        const tick = () => {
          const t = (performance.now() - t0) / 1000;
          const clip = c.currentAction && c.currentAction.getClip ? c.currentAction.getClip() : null;
          const imp = clip && clip.userData && clip.userData.impact;
          const bone = imp ? c.model.getObjectByName(imp.bone) : null;
          let speed = 0;
          if (bone) { c.model.updateWorldMatrix(true, true); inv.copy(c.model.matrixWorld).invert(); bone.getWorldPosition(v); const p = v.clone().applyMatrix4(inv); const k = clip.name; if (prev[k]) speed = p.distanceTo(prev[k]); prev[k] = p; }
          frames.push({ t, speed, key: c.currentActionKey, phase: c.currentPhase, clip: clip && clip.name });
          if (t < 6) requestAnimationFrame(tick);
          else {
            M[c.championId] = saved; c.currentTarget = null; c.attackOrderActive = false; c.targetPos = null;
            const swings = []; let cur = null;
            frames.forEach((f, i) => {
              const isAtk = f.key && /^(attack|crit|renektonAA)/.test(f.key);
              if (isAtk && (!cur || f.key !== cur.key || (frames[i - 1] && frames[i - 1].phase === 'RECOVERY' && f.phase === 'STARTUP'))) { cur = { key: f.key, frames: [] }; swings.push(cur); }
              if (!isAtk) cur = null;
              if (cur) cur.frames.push(f);
            });
            const offs = [];
            for (const s of swings) {
              const fireF = s.frames.find((f) => f.phase === 'ACTIVE' || f.phase === 'RECOVERY'); if (!fireF) continue;
              // 스윙 시작 직후 0.1초는 이전 자세에서 넘어오는 블렌드 움직임이라 뺀다.
              const st0 = s.frames[0].t;
              let pk = null; for (const f of s.frames) if (f.t - st0 >= 0.1 && f.speed > 0 && (!pk || f.speed > pk.speed)) pk = f;
              if (pk) offs.push(+(pk.t - fireF.t).toFixed(3));
            }
            resolve({ swings: swings.length, peakMinusFire: offs, fps: +(frames.length / 6).toFixed(1) });
          }
        };
        requestAnimationFrame(tick);
      }), mode);
    }
  }
  res.errors = errors.slice(0, 5);
  console.log(JSON.stringify(res, null, 0).replace(/\},"/g, '},\n"'));
  await browser.close(); srv.close();
})();
