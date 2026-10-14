// 26차 수정 점검(헤드리스 Chromium + 저장소 모델): 가렌 Q 강화 평타로 포탑 공격, 다리우스 출혈 5중첩 표식, 리 신 Q·E 쿨다운과
// E 범위 충격파, 노틸러스 Q 판정(뒤에 붙은 대상·앞 대상·붙어 있는 대상).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/fix26_check.js [스크린샷 접두어]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const wait = (ms) => page.waitForTimeout(ms);
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); await wait(700); };
  const r = {};

  // 1) 가렌: Q 후 적 외곽 포탑을 계속 친다 - 강화 평타는 한 번만, 첫 타는 Q 추가 피해만큼 더 아프다
  await load('garen');
  r.garenTurret = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, t = E.turrets.find((x) => x.team === 'RED' && x.type === 'outer1'), tp = E.getWorldPosition(t);
    c.root.position.set(tp.x, 0, tp.z - E.lolRangeToWorld(260)); c.hp = c.maxHp = 1e6; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
    c.castAbility('Q', tp.clone());
    const keys = []; const hits = []; let last = t.hp, prevKey = null;
    setTimeout(() => c.selectTarget(t), 150);
    const iv = setInterval(() => {
      const k = c.currentActionKey; if (k && k !== prevKey && /attack/.test(k)) keys.push(k); prevKey = k;
      if (t.hp < last) { hits.push(Math.round(last - t.hp)); last = t.hp; }
    }, 20);
    setTimeout(() => { clearInterval(iv); c.currentTarget = null; c.attackOrderActive = false; res({ swings: keys.slice(0, 4), turretDamage: hits.slice(0, 4), overridesLeft: c.attackOverrides.length }); }, 4500);
  }));

  // 2) 다리우스: 출혈 1~4중첩은 표시 없음, 5중첩이면 대상 체력 바 위 특수 표식
  await load('darius');
  r.darius = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0]; d.hp = d.maxHp = 1e6;
    for (const x of E.dummies.slice(1)) x.mesh.position.set(40, 0, 40);
    const p = E.getWorldPosition(d); c.root.position.set(p.x, 0, p.z + E.lolRangeToWorld(150)); c.selectTarget(d);
    const seen = [];
    const iv = setInterval(() => {
      const rec = c._darius.stacksOnTarget.get(d); const st = rec ? rec.stacks : 0;
      const m = d.labelDiv.querySelector('.unitMarks'); const emb = !!(m && m.querySelector('svg.emblem')); const pips = m ? m.querySelectorAll('.pip').length : 0;
      const k = `${st}:${emb ? 'E' : '-'}:${pips}`; if (seen[seen.length - 1] !== k) seen.push(k);
    }, 50);
    setTimeout(() => { clearInterval(iv); c.currentTarget = null; c.attackOrderActive = false; res({ stackEmblemPips: seen }); }, 9000);
  }));
  if (process.argv[2]) { await page.evaluate(() => { document.querySelectorAll('.panelHeader').forEach((h) => { h.parentElement.style.visibility = 'hidden'; }); for (const id of ['championPanel', 'championPanelToggle', 'debugPanel', 'debugPanelToggle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } }); await page.screenshot({ path: `${process.argv[2]}_darius.png` }); }

  // 3) 리 신: 음파가 날아가는 동안 Q를 다시 눌러도 안 나간다, E 빗나간 뒤 바로 다시 안 나간다, E 범위 충격파
  await load('leesin');
  r.leesin = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0]; d.hp = d.maxHp = 1e6;
    for (const x of E.dummies.slice(1)) x.mesh.position.set(40, 0, 40);
    const p = E.getWorldPosition(d); c.root.position.set(p.x, 0, p.z + E.lolRangeToWorld(1000)); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp;
    const mp0 = c.mp; let casts = 0; const orig = c._leesinPlayCast.bind(c); c._leesinPlayCast = (o) => { if (o.actionKey === 'leesinQ') casts++; return orig(o); };
    c.castAbility('Q', p.clone());
    setTimeout(() => c.castAbility('Q', p.clone()), 350);   // 음파 비행 중
    setTimeout(() => c.castAbility('Q', p.clone()), 500);
    setTimeout(() => {
      const qr = { q1Casts: casts, energyUsed: Math.round(mp0 - c.mp), q2Ready: !!c._leesin.qMarkTarget };
      // E: 근처에 적 없이 시전(빗나감) → 바로 다시 눌러 본다
      d.mesh.position.set(40, 0, 40); c.mp = c.maxMp; c.cooldowns.E = 0; let eCasts = 0;
      const o2 = c._leesinPlayCast.bind(c); c._leesinPlayCast = (o) => { if (o.actionKey === 'leesinE') eCasts++; return o2(o); };
      const before = E.vfx.active.length;
      c.castAbility('E', null);
      setTimeout(() => {
        const shock = E.vfx.active.some((fx) => !fx.sprite);
        c.castAbility('E', null);
        setTimeout(() => res({ ...qr, eCasts, eCooldown: +c.cooldowns.E.toFixed(1), shockwave: shock }), 300);
      }, 300);
    }, 1200);
  }));

  // 4) 노틸러스 Q: (a) 뒤에 붙은 대상은 안 맞고 앞 대상이 맞는다 (b) 이미 붙어 있는 앞 대상 - 노틸러스가 뒤로 밀리지 않는다
  await load('nautilus');
  const nq = (setup) => page.evaluate((setup) => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1, d2] = E.dummies;
    for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d._pullState = null; }
    c.root.position.set(0, 0, 0); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.currentTarget = null; c.targetPos = null;
    d2.mesh.position.set(40, 0, 40);
    if (setup === 'behind') { d0.mesh.position.set(0, 0, L(90)); d1.mesh.position.set(0, 0, -L(600)); }
    else { d0.mesh.position.set(40, 0, -40); d1.mesh.position.set(0, 0, -L(120)); }
    const start = c.root.position.clone(), hp0 = d0.hp, hp1 = d1.hp, p1 = d1.mesh.position.clone();
    c.castAbility('Q', new E.THREE.Vector3(0, 0, -L(500)));
    setTimeout(() => {
      const moved = c.root.position.clone().sub(start);
      res({ behindHit: d0.hp < hp0, frontHit: d1.hp < hp1, selfMovedLol: Math.round(E.worldDistanceToLol(-moved.z)), frontMovedLol: Math.round(E.worldDistanceToLol(d1.mesh.position.z - p1.z)), gapLol: Math.round(E.worldDistanceToLol(Math.abs(d1.mesh.position.z - c.root.position.z))) });
    }, 1600);
  }), setup);
  r.nautilusBehind = await nq('behind');
  r.nautilusTouching = await nq('touching');
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
