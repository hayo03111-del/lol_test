// 85차 미니언 웨이브 관찰(헤드리스 Chromium + 저장소 모델): 첫 웨이브를 바로 나오게 한 뒤 양 팀 웨이브가 다리 가운데에서
// 맞붙는 과정을 0.25초마다 기록한다 - 이동 속도, 멈춰 선 미니언(대상 없이 안 움직임), 겹침(몸통끼리 파고듦), 바라보는 방향과
// 이동 방향 차이, 대상 바꾸기 횟수(떨림), 처음 맞붙은 지점·시각, 전투 중 사망 수. 스크린샷(맵 보이게)도 남긴다.
// 사용법: THREE_DIR=<three package> node tools/e2e_glb/minion_wave_watch.js [스크린샷 폴더] [관찰 초]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || null, watchSec = Number(process.argv[3] || 40);
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    for (const d of E.dummies) d.mesh.position.set(200, 0, 200); // 허수아비는 치운다
    c.root.position.set(14, 0, 0); // 다리 옆(미니언 길 밖)에서 구경
    E.setGameTimeSec(64.5);
    window.__log = []; window.__retargets = 0; window.__deaths = 0;
    const prevTarget = new Map();
    window.__iv = setInterval(() => {
      const now = performance.now();
      const ms = E.minions.filter((m) => !m.isDead);
      for (const m of ms) { const t = m.attackTarget || null; if (prevTarget.has(m) && prevTarget.get(m) !== t && t) window.__retargets++; prevTarget.set(m, t); }
      window.__log.push({ t: now, ms: ms.map((m) => ({ id: m.id || m.mesh.uuid, team: m.team, type: m.type, x: m.mesh.position.x, z: m.mesh.position.z, ry: m.mesh.rotation.y, tgt: m.attackTarget ? (m.attackTarget.isMinion ? 'm' : m.attackTarget.isTurret ? 't' : 'c') : null, r: E.getCollisionRadius(m), hp: m.hp / m.maxHp })) });
    }, 250);
  });
  const shots = [];
  for (let s = 0; s < watchSec; s += 5) {
    await page.waitForTimeout(5000);
    if (shotDir && (s === 10 || s === 20 || s === 30)) {
      const f = `${shotDir}/minion_wave_${s}.png`;
      await page.evaluate(() => { window.__e2eShowMap = true; const E = window.__e2e; const ms = E.minions.filter((m) => !m.isDead); if (ms.length) { const cx = ms.reduce((a, m) => a + m.mesh.position.x, 0) / ms.length, cz = ms.reduce((a, m) => a + m.mesh.position.z, 0) / ms.length; window.controller.root.position.set(cx + 3, 0, cz); } });
      await page.waitForTimeout(400);
      await page.screenshot({ path: f }); shots.push(f);
    }
  }
  const raw = await page.evaluate(() => { clearInterval(window.__iv); return { log: window.__log, retargets: window.__retargets }; });
  // 분석
  const byId = new Map();
  for (const snap of raw.log) for (const m of snap.ms) { if (!byId.has(m.id)) byId.set(m.id, []); byId.get(m.id).push({ t: snap.t, ...m }); }
  const redFwd = [], blueFwd = [];
  let stuckEvents = 0, maxFacingErr = 0, facingSamples = 0, facingBad = 0, speeds = [];
  for (const [, arr] of byId) {
    let stillSince = null;
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1], b = arr[i], dt = (b.t - a.t) / 1000; if (dt <= 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z, v = Math.hypot(dx, dz) / dt;
      if (!b.tgt && v < 0.05) { stillSince = stillSince ?? a.t; if (b.t - stillSince > 2000) { stuckEvents++; stillSince = b.t; } } else stillSince = null;
      if (v > 0.5) {
        speeds.push(v);
        const moveYaw = Math.atan2(dx, dz); let err = Math.abs(((b.ry - moveYaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
        const err2 = Math.abs(Math.PI - err); // 모델 정면이 -Z인 경우
        const e = Math.min(err, err2) * 180 / Math.PI; facingSamples++; if (e > 45) facingBad++; maxFacingErr = Math.max(maxFacingErr, e);
        (b.team === 'RED' ? redFwd : blueFwd).push(err < err2 ? 1 : -1); // +1: 모델 +Z가 이동 방향, -1: 반대
      }
    }
  }
  let overlapMax = 0, overlapPairs = 0;
  for (const snap of raw.log) {
    const ms = snap.ms;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const d = Math.hypot(ms[i].x - ms[j].x, ms[i].z - ms[j].z), need = ms[i].r + ms[j].r;
      if (d < need * 0.6) { overlapPairs++; overlapMax = Math.max(overlapMax, 1 - d / need); }
    }
  }
  // 처음 맞붙은 시각·지점
  let firstClash = null;
  for (const snap of raw.log) { const fighting = snap.ms.filter((m) => m.tgt === 'm'); if (fighting.length) { firstClash = { afterSec: +((snap.t - raw.log[0].t) / 1000).toFixed(1), meanZ: +(fighting.reduce((a, m) => a + m.z, 0) / fighting.length).toFixed(2) }; break; } }
  const last = raw.log[raw.log.length - 1];
  const r = {
    samples: raw.log.length, minionsSeen: byId.size,
    speedMedianWorld: speeds.length ? +speeds.sort((a, b) => a - b)[Math.floor(speeds.length / 2)].toFixed(2) : null,
    stuckEvents, overlapPairs, overlapMaxPct: Math.round(overlapMax * 100), facingBadPct: facingSamples ? Math.round(100 * facingBad / facingSamples) : null, maxFacingErr: Math.round(maxFacingErr),
    retargets: raw.retargets, firstClash,
    forwardSign: { BLUE: blueFwd.length ? +(blueFwd.reduce((a, v) => a + v, 0) / blueFwd.length).toFixed(2) : null, RED: redFwd.length ? +(redFwd.reduce((a, v) => a + v, 0) / redFwd.length).toFixed(2) : null },
    aliveAtEnd: last ? { BLUE: last.ms.filter((m) => m.team === 'BLUE').length, RED: last.ms.filter((m) => m.team === 'RED').length } : null,
    shots, errors,
  };
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
