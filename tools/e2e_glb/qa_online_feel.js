// QA(103차): 온라인 대전 체감 점검 - 참가자 화면을 프레임마다 기록해 "덜컥거림"을 숫자로 잰다.
//  A) 내 챔피언 걷기(긴 직선·맵 밖 클릭·미니언 무리 통과): 보정 횟수·순간 이동·뒤로 밀림·멈춘 뒤 방장 자리와의 차이
//  B) 상대 챔피언 걷기(방장이 왕복): 참가자 화면에서 멈칫(속도 30% 미만)·튐(250% 초과) 프레임 비율, 걷기/대기 동작 어긋남
//  C) 걷는 중 둔화·기절(풀리면 기억한 이동을 이어 감)
//  D) 미니언 공격(추격 → 평타)
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 [LAG=60] node tools/e2e_glb/qa_online_feel.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const startServer = require('./server.js');
const { createRelayServer } = require(path.resolve(__dirname, '../../server/relay.js'));
const LAG = Number(process.env.LAG || 60);
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const relay = createRelayServer({ lagMs: LAG }); await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const wsUrl = `ws://127.0.0.1:${relay.address().port}/ws`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (champ, tag) => {
    const page = await (await browser.newContext({ viewport: { width: Number(process.env.VW || 640), height: Number(process.env.VH || 400) } })).newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, champ);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, champ, { timeout: 60000 });
    await page.waitForTimeout(800);
    return page;
  };
  const host = await open('garen', 'host'), guest = await open('ashe', 'guest');
  const r = { lag: LAG }, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };
  const realWait = (p, ms) => p.evaluate((ms) => window.__e2e.realWait(ms), ms);
  await host.evaluate((u) => window.netHostCreateRoom(u, '방장'), wsUrl);
  await host.waitForFunction(() => window.netState && window.netState.code, null, { timeout: 10000 });
  const code = await host.evaluate(() => window.netState.code);
  await guest.evaluate(([u, c]) => window.netGuestJoin(u, c, '참가자'), [wsUrl, code]);
  await host.waitForFunction(() => window.netState.pick, null, { timeout: 15000 });
  await guest.waitForFunction(() => window.netState && window.netState.pick, null, { timeout: 15000 });
  await realWait(guest, 3 * LAG + 300);
  await guest.evaluate(() => window.netPickLock()); await host.evaluate(() => window.netPickLock());
  await guest.waitForFunction(() => window.netState && window.netState.ready, null, { timeout: 90000 });
  await host.waitForFunction(() => window.netState && window.netState.guestReady && !window.netState.locked, null, { timeout: 30000 });
  await guest.waitForFunction(() => !window.netState.locked, null, { timeout: 15000 });
  for (const p of [host, guest]) await p.evaluate(() => { const b = window.__e2e.brushSystem; if (b && b.brushes) b.brushes.length = 0; });
  // 무대: 미니언 없음, 두 챔피언 다리 가운데 근처
  await host.evaluate(() => {
    const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller, b = E.enemyBots[0];
    E.setGameTimeSec(5); for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0;
    c.itemBonusMaxHp = 60000; c.recomputeStats(); c.hp = c.maxHp; b.itemBonusMaxHp = 60000; b.recomputeStats(); b.hp = b.maxHp;
    c.root.position.set(L(400), 0, L(-300)); c.targetPos = null; b.root.position.set(L(-400), 0, 0); b.targetPos = null;
  });
  await realWait(guest, 1500);

  // ---- 참가자 프레임 기록기 ----
  await guest.evaluate(() => {
    const st = window.netState, E = window.__e2e;
    window.__rec = []; window.__recOn = true;
    const tick = () => {
      if (!window.__recOn) return; requestAnimationFrame(tick);
      const c = window.controller, h = E.enemyBots[0], P = st.pred;
      window.__rec.push({ t: performance.timeOrigin + window.__netRealNow(), ox: c.root.position.x, oz: c.root.position.z, oc: c.currentClipKey, mv: P ? !!P.moving : false,
        corr: P ? P.corrections : 0, snaps: P ? P.snaps : 0, cm: P ? Math.hypot(P.corr.x, P.corr.z) : 0, fol: P ? !!P.follow : false,
        hx: h ? h.root.position.x : null, hz: h ? h.root.position.z : null, hc: h ? h.currentClipKey : null, dl: Math.round(st.delay), ro: st.renderOff != null ? Math.round(st.renderOff) : null, ns: h ? (st.units.get(window.__e2eEntityId(h)) || { samples: [] }).samples.length : 0, lt: (() => { const rr = h && st.units.get(window.__e2eEntityId(h)); return rr && rr.samples.length ? Math.round(rr.samples[rr.samples.length - 1].t) : null; })(), rn: Math.round(window.__netRealNow()) });
    };
    requestAnimationFrame(tick);
  });
  await host.evaluate(() => {
    const E = window.__e2e;
    window.__hrec = []; window.__recOn = true;
    const tick = () => { if (!window.__recOn) return; requestAnimationFrame(tick); const c = window.controller, b = E.enemyBots[0];
      window.__hrec.push({ t: performance.timeOrigin + window.__netRealNow(), hx: c.root.position.x, hz: c.root.position.z, hm: !!c.targetPos, bx: b.root.position.x, bz: b.root.position.z, bm: !!b.targetPos }); };
    requestAnimationFrame(tick);
  });
  const mark = async (name) => { const t = await guest.evaluate(() => performance.timeOrigin + window.__netRealNow()); (r.marks = r.marks || []).push([name, t]); };
  const L1 = await guest.evaluate(() => window.__e2e.lolRangeToWorld(1));
  const gsubmit = (cmd) => guest.evaluate((cmd) => window.gameSession.submit(cmd), cmd);
  const gpos = () => guest.evaluate(() => ({ x: window.controller.root.position.x, z: window.controller.root.position.z }));
  const waitStopHost = async (ms = 6000) => { for (let i = 0; i < ms / 200; i++) { if (await host.evaluate(() => !window.__e2e.enemyBots[0].targetPos)) return; await realWait(host, 200); } };

  // A) 내 챔피언 걷기
  await mark('A');
  const legs = [[-400, 700], [300, 700], [300, -700], [-1400, -700], [-400, 0]].map(([x, z]) => ({ x: x * L1, y: 0, z: z * L1 }));
  legs.splice(3, 0, { x: -400 * L1, y: 0, z: -4000 * L1 }); // 맵 밖 클릭(가장자리에서 멈춘다)
  for (const p of legs) { await gsubmit({ type: 'move', point: p }); await realWait(guest, 600); await waitStopHost(); await realWait(guest, 400 + 2 * LAG); }
  await realWait(guest, 600);
  const endA = { g: await gpos(), h: await host.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; return { x: p.x, z: p.z }; }) };
  r.A_endErr = Math.round(Math.hypot(endA.g.x - endA.h.x, endA.g.z - endA.h.z) / L1);
  // A2) 미니언 무리를 지나간다(방장 쪽 몸 충돌)
  await mark('A2');
  await host.evaluate(() => {
    const E = window.__e2e, L = E.lolRangeToWorld, b = E.enemyBots[0];
    for (let i = 0; i < 6; i++) { const m = E.createMinion('melee', new E.THREE.Vector3(b.root.position.x + L(-60 + (i % 3) * 60), 0, b.root.position.z + L(250 + Math.floor(i / 3) * 60)), E.getTurretGameTimeSec(), 'BLUE'); m.hp = m.maxHp = 99999; E.minions.push(m); }
  }).catch((e) => { r.minionSpawnErr = e.message.slice(0, 120); });
  await realWait(guest, 600 + 2 * LAG);
  await gsubmit({ type: 'move', point: { x: -400 * L1, y: 0, z: 900 * L1 } });
  await realWait(guest, 500); await waitStopHost(); await realWait(guest, 600 + 2 * LAG);
  const endA2 = { g: await gpos(), h: await host.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; return { x: p.x, z: p.z }; }) };
  r.A2_endErr = Math.round(Math.hypot(endA2.g.x - endA2.h.x, endA2.g.z - endA2.h.z) / L1);
  await host.evaluate(() => { const E = window.__e2e; for (const m of [...E.minions]) { m.hp = 0; m.isDead = true; } E.minions.length = 0; });

  // B) 상대 챔피언 걷기(방장이 왕복 3번) - 참가자는 상대가 시야 안에 있게 다리 가운데로
  await gsubmit({ type: 'move', point: { x: -300 * L1, y: 0, z: 0 } }); await realWait(guest, 500); await waitStopHost(); await realWait(guest, 600 + 2 * LAG);
  await mark('B');
  await host.evaluate(() => { const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller; window.__legs = 0; const leg = () => { const z = c.root.position.z < 0 ? L(500) : L(-500); c.moveTo(new E.THREE.Vector3(L(400), 0, z)); window.__legs++; }; leg(); window.__walkIv = setInterval(() => { if (!c.targetPos && window.__legs < 6) leg(); }, 50); });
  for (let i = 0; i < 60; i++) { await realWait(guest, 250); if (await host.evaluate(() => window.__legs >= 6 && !window.controller.targetPos)) break; }
  await host.evaluate(() => clearInterval(window.__walkIv));
  await realWait(guest, 800);

  // C) 걷는 중 둔화, 그다음 기절(풀리면 기억한 이동을 이어 간다)
  await mark('C');
  await gsubmit({ type: 'move', point: { x: -400 * L1, y: 0, z: -800 * L1 } });
  await realWait(guest, 500);
  await host.evaluate(() => { const E = window.__e2e; E.applyStatus(E.enemyBots[0], { id: 'e2eSlow', type: 'SLOW', value: 0.5, duration: 1.2 }); });
  await realWait(guest, 1300);
  await host.evaluate(() => { const E = window.__e2e; E.applyStatus(E.enemyBots[0], { id: 'e2eStun', type: 'STUN', duration: 0.8 }); });
  await realWait(guest, 200 + 2 * LAG);
  await gsubmit({ type: 'move', point: { x: -400 * L1, y: 0, z: 400 * L1 } }); // 기절 중 클릭 - 풀리면 간다
  await realWait(guest, 900); await waitStopHost(); await realWait(guest, 600 + 2 * LAG);
  const endC = { g: await gpos(), h: await host.evaluate(() => { const p = window.__e2e.enemyBots[0].root.position; return { x: p.x, z: p.z }; }) };
  r.C_endErr = Math.round(Math.hypot(endC.g.x - endC.h.x, endC.g.z - endC.h.z) / L1);

  // D) 미니언 공격(추격 → 평타)
  await mark('D');
  const mid = await host.evaluate(() => { const E = window.__e2e, L = E.lolRangeToWorld, b = E.enemyBots[0]; const m = E.createMinion('melee', new E.THREE.Vector3(b.root.position.x, 0, b.root.position.z - L(1100)), E.getTurretGameTimeSec(), 'BLUE'); m.hp = m.maxHp = 99999; E.minions.push(m); return window.__e2eEntityId(m); }).catch((e) => { r.minionErr = e.message.slice(0, 120); return null; });
  await realWait(guest, 500 + 2 * LAG);
  if (mid != null) { await gsubmit({ type: 'attack', targetId: mid }); await realWait(guest, 3500); }
  await mark('end');

  await guest.evaluate(() => { window.__recOn = false; }); await host.evaluate(() => { window.__recOn = false; });
  // 점수판(O): 상대 챔피언 줄(플레이어 이름·아이템)이 보인다
  await host.evaluate(() => { const c = window.controller; c.items = c.items || []; c.items[0] = { id: 'longSword' }; });
  await realWait(guest, 800 + 2 * LAG);
  const sb = async (p) => { await p.keyboard.press('o'); await realWait(p, 400); const h = await p.evaluate(() => { const el = document.getElementById('scoreboardPanel'); return el ? el.innerHTML : ''; }); await p.keyboard.press('o'); return h; };
  const otherRow = (h) => h.split('class="sb-row ').find((x) => x.startsWith('other')) || '';
  const sbG = otherRow(await sb(guest)), sbH = otherRow(await sb(host));
  r.scoreboard = { guestSeesHost: sbG.includes('방장'), guestSeesHostItem: sbG.includes('롱소드'), hostSeesGuest: sbH.includes('참가자'),
  };
  check('scoreboard: each side sees the opponent row (name, items)', r.scoreboard.guestSeesHost && r.scoreboard.hostSeesGuest && r.scoreboard.guestSeesHostItem);
  const G = await guest.evaluate(() => window.__rec), H = await host.evaluate(() => window.__hrec);
  r.guestFps = Math.round((G.length - 1) / ((G[G.length - 1].t - G[0].t) / 1000) * 10) / 10;
  const seg = (a, b) => { const t0 = r.marks.find((m) => m[0] === a)[1], t1 = r.marks.find((m) => m[0] === b)[1]; return G.filter((f) => f.t >= t0 && f.t < t1); };
  // 내 챔피언: 순간 이동(한 프레임에 이동 속도의 2.5배 넘게), 뒤로 밀림(걷는 방향 반대로 이동속도 20% 넘게)
  const ownStats = (F) => {
    let jumps = 0, back = 0, maxJump = 0;
    const ms = 325 * L1;
    for (let i = 2; i < F.length; i++) {
      const a = F[i - 2], b = F[i - 1], c = F[i], dt = (c.t - b.t) / 1000; if (dt <= 0) continue;
      const vx = (c.ox - b.ox) / dt, vz = (c.oz - b.oz) / dt, sp = Math.hypot(vx, vz);
      if (sp > ms * 2.5 && Math.hypot(c.ox - b.ox, c.oz - b.oz) > 30 * L1) { jumps++; maxJump = Math.max(maxJump, Math.hypot(c.ox - b.ox, c.oz - b.oz) / L1); (r.jumpInfo = r.jumpInfo || []).push(F.slice(Math.max(0, i - 4), i + 3).map((f) => [Math.round(f.t % 100000), Math.round(f.ox / L1), Math.round(f.oz / L1), f.mv ? 1 : 0, f.fol ? 1 : 0, f.corr, Math.round(f.cm / L1), f.oc])); }
      const px = b.ox - a.ox, pz = b.oz - a.oz, pl = Math.hypot(px, pz);
      if (pl > 1e-6 && b.mv && c.mv && (vx * px + vz * pz) / pl < -0.2 * ms) back++;
    }
    return { frames: F.length, corrections: F.length ? F[F.length - 1].corr - F[0].corr : 0, snaps: F.length ? F[F.length - 1].snaps - F[0].snaps : 0, jumps, maxJump: Math.round(maxJump), back,
      maxCorr: Math.round(Math.max(0, ...F.map((f) => f.cm)) / L1) };
  };
  r.A = ownStats(seg('A', 'B')); r.C = ownStats(seg('C', 'D')); r.D = ownStats(seg('D', 'end'));
  // 동작 어긋남: 걷는데 대기 동작 / 서 있는데 걷기 동작(0.25초 넘게 이어질 때만)
  const isMove = (k) => !!k && /run|walk|move/i.test(k), isIdle = (k) => !!k && /idle/i.test(k);
  const animMismatch = (F, px, pz, ck) => {
    let bad = 0, run = 0, worst = 0;
    for (let i = 1; i < F.length; i++) {
      const dt = (F[i].t - F[i - 1].t) / 1000; if (dt <= 0) continue;
      const sp = Math.hypot(F[i][px] - F[i - 1][px], F[i][pz] - F[i - 1][pz]) / dt / L1;
      const k = F[i][ck], wrong = (sp > 120 && isIdle(k)) || (sp < 5 && isMove(k));
      if (wrong) { run += dt; if (run > Math.max(0.25, 3 * dt)) bad++; worst = Math.max(worst, run); } else run = 0; // 0.25초 또는 세 프레임 넘게
    }
    return { badFrames: bad, worstSec: Math.round(worst * 100) / 100 };
  };
  r.A.anim = animMismatch(seg('A', 'B'), 'ox', 'oz', 'oc');
  // B) 상대 챔피언: 방장이 걷는 동안 참가자 화면 속도
  const FB = seg('B', 'C');
  const hostMs = await host.evaluate(() => window.getFinalMoveSpeedForE2E(window.controller.stats));
  let stall = 0, jump = 0, moving = 0; const speeds = [];
  for (let i = 1; i < FB.length; i++) {
    const dt = (FB[i].t - FB[i - 1].t) / 1000; if (dt <= 0) continue;
    // 방장이 이 프레임 무렵(보간 지연을 감안해 지연 + 편도 전)에 걷고 있었나
    const tH = FB[i].t - 250 - LAG;
    const hf = H.filter((f) => Math.abs(f.t - tH) < 150);
    if (!hf.length || !hf.every((f) => f.hm) || Math.abs(FB[i].hx) > 50000 || Math.abs(FB[i - 1].hx) > 50000) continue; // 안개 속(보이지 않음)은 빼고
    moving++;
    const sp = Math.hypot(FB[i].hx - FB[i - 1].hx, FB[i].hz - FB[i - 1].hz) / dt / L1; speeds.push(sp);
    if (sp < hostMs * 0.3) stall++; else if (sp > hostMs * 2.5) jump++;
  }
  r.B = { hostMs: Math.round(hostMs), movingFrames: moving, stall, jump, stallPct: moving ? Math.round(stall / moving * 100) : null, anim: animMismatch(FB, 'hx', 'hz', 'hc') };
  if (process.env.DUMP) r.dumpB = FB.slice(0, 80).map((f, i) => i ? [Math.round(Math.hypot(f.hx - FB[i - 1].hx, f.hz - FB[i - 1].hz) / L1 / ((f.t - FB[i - 1].t) / 1000)), Math.round(f.t - FB[i - 1].t), f.dl, f.ro, f.ns, f.rn - f.ro - f.lt, f.hc] : null);
  r.errors = errors;
  // 판정(원작 기준 "깔끔함"): 순간 이동 없음, 멈춘 뒤 방장 자리와 거의 같음, 상대 걷기가 멈칫·튀지 않음, 동작이 이동과 맞음
  check('own walk: no teleports/snaps while walking (incl. map edge, minion wave)', r.A.jumps === 0 && r.A.snaps === 0);
  check('own walk: no backward rubber-banding', r.A.back <= 1);
  check('own walk: after stopping the guest stands where the host says (< 30 units)', r.A_endErr < 30 && r.A2_endErr < 30);
  check('own walk: animation matches movement (walk while moving, idle while standing)', r.A.anim.badFrames === 0);
  check('remote walk: host champion moves smoothly on the guest (stall < 10%, no jumps)', r.B.movingFrames > 10 && r.B.stallPct < 10 && r.B.jump === 0);
  check('remote walk: host champion animation matches its movement', r.B.anim.badFrames === 0);
  check('slow/stun: no teleports, ends where the host says', r.C.jumps === 0 && r.C.snaps === 0 && r.C_endErr < 30);
  check('attack minion: no teleports while chasing and attacking', r.D.jumps === 0 && r.D.snaps === 0);
  if (errors.length) fails.push('page errors');
  r.fails = fails;
  delete r.marks;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close(); relay.close();
  process.exit(fails.length ? 1 : 0);
})();
