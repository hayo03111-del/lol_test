// 동작 전환 끊김 점검(헤드리스 Chromium + 저장소 모델): 걷기 → 평타 → 평타 중 이동 → 스킬 → 정지 → 다시 평타를 실행하며
// 매 프레임 몸통·머리·팔다리 뼈(무기·이펙트 뼈 제외)가 모델 기준으로 움직인 거리를 잰다. 한 프레임에 비정상적으로 크게
// 움직인 순간(튐)과 그때의 클립 전환을 기록한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/smooth_check.js [챔피언,...]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const ids = (process.argv[2] || 'garen,darius,leesin,yone,ahri,ashe,ezreal,mordekaiser').split(',');
  const POP = +(process.env.POP_WORLD || 0.04); // 한 프레임 이동량 기준(월드) - 이보다 크면 튐으로 기록
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const res = {};
  for (const id of ids) {
    await page.selectOption('#libraryChampSelect', id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(600);
    res[id] = await page.evaluate((POP) => new Promise((resolve) => {
      const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld;
      const d = E.dummies[0]; d.hp = d.maxHp = 1e6; for (const x of E.dummies.slice(1)) x.mesh.position.set(40, 0, 40);
      const dp = E.getWorldPosition(d);
      c.root.position.set(dp.x, 0, dp.z + L(700)); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp;
      // 핵심 뼈만(골반·척추·목·머리·쇄골·위팔·아래팔·허벅지·무릎) - 손가락·발가락·무기·옷자락처럼 원래 빨리 움직이는 끝 뼈는 뺀다.
      const body = []; c.model.traverse((o) => { if (o.isBone && /pelvis|hip|spine|chest|neck|head|clav|shoulder|upperarm|elbow|forearm|thigh|knee|root/i.test(o.name) && !/buff|weapon|fx|loc|cape|cloth|hair|finger|thumb|index|middle|ring|pinky|toe|_end/i.test(o.name)) body.push(o); });
      const prev = new Map(); const v = new T.Vector3(), inv = new T.Matrix4();
      const frames = []; const t0 = performance.now();
      const plan = [
        [0, () => c.moveTo(new T.Vector3(dp.x + L(400), 0, dp.z + L(500)))],      // 걷기
        [1000, () => c.selectTarget(d)],                                            // 다가가서 평타
        [3600, () => c.moveTo(new T.Vector3(dp.x - L(300), 0, dp.z + L(300)))],    // 평타 중 이동
        [4300, () => c.castAbility('Q', E.getWorldPosition(d).clone())],           // 스킬
        [5600, () => c.moveTo(c.root.position.clone())],                            // 정지
        [6400, () => c.selectTarget(d)],                                            // 다시 평타
      ];
      let pi = 0;
      const tick = () => {
        const ms = performance.now() - t0;
        while (pi < plan.length && ms >= plan[pi][0]) { plan[pi][1](); pi++; }
        c.model.updateWorldMatrix(true, true); // 부모(몸 방향)까지 갱신 - 시전 시 즉시 회전을 뼈 튐으로 잘못 세지 않게
        inv.copy(c.model.matrixWorld).invert();
        let maxD = 0, who = null;
        for (const b of body) { b.getWorldPosition(v); const p = v.clone().applyMatrix4(inv); const q = prev.get(b); if (q) { const dd = p.distanceTo(q); if (dd > maxD) { maxD = dd; who = b.name; } } prev.set(b, p); }
        frames.push({ ms: Math.round(ms), maxD, who, clip: c.currentClipKey, key: c.currentActionKey, state: c.state });
        if (ms < 8000) requestAnimationFrame(tick);
        else {
          c.currentTarget = null;
          // 튐: 그 프레임 이동량이 앞뒤 3프레임 중앙값의 4배 이상이고 일정 크기(POP) 이상 - 원래 빠른 동작은 앞뒤도 빠르므로 걸리지 않는다.
          const pops = [];
          frames.forEach((f, i) => {
            if (i < 3 || i > frames.length - 4) return;
            const around = [frames[i - 3], frames[i - 2], frames[i - 1], frames[i + 1], frames[i + 2], frames[i + 3]].map((x) => x.maxD).sort((a, b) => a - b);
            const med = (around[2] + around[3]) / 2;
            if (f.maxD > POP && f.maxD > 4 * med) pops.push({ ms: f.ms, d: +f.maxD.toFixed(3), med: +med.toFixed(3), bone: f.who, from: frames[i - 1].clip, to: f.clip, key: f.key, state: f.state });
          });
          const ds = frames.map((f) => f.maxD).sort((a, b) => a - b);
          resolve({ fps: +(frames.length / 8).toFixed(1), p50: +ds[Math.floor(ds.length * 0.5)].toFixed(3), p99: +ds[Math.floor(ds.length * 0.99)].toFixed(3), max: +ds[ds.length - 1].toFixed(3), bones: body.length, pops: pops.slice(0, 15) });
        }
      };
      requestAnimationFrame(tick);
    }), POP);
  }
  res.errors = errors.slice(0, 5);
  console.log(JSON.stringify(res, null, 0).replace(/\},"/g, '},\n"'));
  await browser.close(); srv.close();
})();
