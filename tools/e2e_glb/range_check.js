// 44차 사거리 점검(헤드리스 Chromium + 저장소 모델): 원거리 평타 투사체, 근접/원거리 판정, 레넥톤 R 사거리 +25(이중 적용 없음),
// 평타 사거리 표시 링 = 사거리 + 자기 반경, 쫓아가다 멈추는 거리 = 휘두르는 판정 거리.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/range_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const pick = async (id) => {
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(600);
  };
  const r = {};
  // 1) 애쉬: 원거리 판정 + 투사체가 날아가 늦게 명중
  await pick('ashe');
  r.ashe = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], L = E.lolRangeToWorld;
    c.root.position.set(0, 0, 0); d.mesh.position.set(0, 0, -L(550)); d.hp = d.maxHp;
    const before = E.projectiles.list ? E.projectiles.list.length : (E.projectiles.projectiles || []).length;
    c.currentTarget = d; c._tryEngageTarget();
    let spawned = false, hpAtSpawn = null;
    for (let i = 0; i < 80; i++) { await new Promise((res) => setTimeout(res, 25)); const n = E.projectiles.list ? E.projectiles.list.length : (E.projectiles.projectiles || []).length; if (n > before) { spawned = true; hpAtSpawn = d.hp; break; } }
    await new Promise((res) => setTimeout(res, 700));
    return { ranged: E.isRangedAttacker(c), projectile: spawned, notInstant: hpAtSpawn === d.maxHp, damagedLater: d.hp < d.maxHp };
  });
  // 2) 가렌: 근접
  await pick('garen');
  r.garenMelee = await page.evaluate(() => !window.__e2e.isRangedAttacker(window.controller));
  // 3) 링 = 사거리 + 자기 반경
  await page.evaluate(() => { const t = document.getElementById('rangeIndicatorCheckbox'); if (t && !t.checked) t.click(); }); await page.waitForTimeout(300);
  r.ring = await page.evaluate(() => { const E = window.__e2e, c = window.controller; const ring = E.rangeIndicators.rings.attack; return { scale: +ring.scale.x.toFixed(3), expect: +(c.stats.attackRange + E.getCollisionRadius(c)).toFixed(3), visible: ring.visible }; });
  // 4) 쫓아가다 멈추는 거리: 멀리서 공격 명령 → 멈춘 순간 가장자리 거리 ≈ 사거리
  r.chase = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], L = E.lolRangeToWorld;
    c.root.position.set(0, 0, 0); d.mesh.position.set(0, 0, -L(900)); c.currentTarget = d; c.attackOrderActive = true; c._tryEngageTarget();
    for (let i = 0; i < 200 && c.isChasing; i++) await new Promise((res) => setTimeout(res, 20));
    const p = c.root.position, q = d.mesh.position;
    const edge = Math.hypot(p.x - q.x, p.z - q.z) - E.getCollisionRadius(c) - E.getCollisionRadius(d);
    return { stoppedEdgeLol: Math.round(E.worldDistanceToLol(edge)), rangeLol: Math.round(E.worldDistanceToLol(c.stats.attackRange)) };
  });
  // 5) 레넥톤 R: 125 + 25 = 150(가장자리 기준)에서 닿고 175에서는 안 닿는다(예전 이중 적용이면 175까지 닿았다)
  await pick('renekton');
  await page.evaluate(() => { const k = window.controller._renekton; k.rActive = true; k.rActiveUntil = performance.now() + 60000; }); await page.waitForTimeout(200); // 매 프레임 스탯 갱신에서 사거리 +25
  r.renektonR = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0], L = E.lolRangeToWorld;
    c._renekton.rActive = true;
    const at = (edgeLol) => { c.root.position.set(0, 0, 0); d.mesh.position.set(0, 0, -(L(edgeLol) + E.getCollisionRadius(c) + E.getCollisionRadius(d))); return E.isInAttackRange(c, d); };
    const res = { rangeLol: Math.round(E.worldDistanceToLol(c.stats.attackRange)), at149: at(149), at174: at(174) };
    c._renekton.rActive = false;
    return res;
  });
  // 6) 구조물 충돌로 멈춘 근접 미니언(사거리 110)이 포탑을 때릴 수 있다 / 포탑 사거리는 대상 가장자리까지
  r.structures = await page.evaluate(() => {
    const E = window.__e2e, L = E.lolRangeToWorld, t = E.turrets.find((x) => x.hp > 0);
    if (!t) return 'no turret';
    const tp = E.getWorldPosition(t), rm = L(48);
    const enemyTeam = t.team === 'RED' ? 'BLUE' : 'RED';
    const m = { isMinion: true, team: enemyTeam, hp: 100, attackRange: 110, collisionRadius: rm, radius: rm, realmId: 'main', mesh: { position: new E.THREE.Vector3(tp.x + E.getCollisionRadius(t) + rm + L(5), 0, tp.z) } };
    const meleeHitsTurret = E.isValidMinionTarget(m, t);
    m.mesh.position.x = tp.x + L(775) + rm * 0.5; // 중심은 775 밖, 가장자리는 안
    return { meleeHitsTurret, turretReachesEdge: E.isValidTurretTarget(t, m) };
  });
  // 7) 45차: 직선 스킬샷은 피할 수 있다 - 가만히 있으면 맞고, 날아오는 동안 옆으로 비키면 안 맞는다.
  const shot = async (champ, slot, distLol, dodge) => {
    await pick(champ);
    return page.evaluate(async ({ slot, distLol, dodge }) => {
      const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
      c.root.position.set(0, 0, 0); c.targetPos = null; c.currentTarget = null; c.cooldowns[slot] = 0; c.mp = c.maxMp;
      d.mesh.position.set(0, 0, -L(distLol)); d.hp = d.maxHp;
      c.castAbility(slot, new E.THREE.Vector3(0, 0, -L(distLol)));
      await new Promise((res) => setTimeout(res, 300)); // 시전 시간(0.25초) 뒤 발사 직후
      if (dodge) d.mesh.position.set(L(400), 0, -L(distLol));
      await new Promise((res) => setTimeout(res, 1500));
      return Math.round(d.maxHp - d.hp);
    }, { slot, distLol, dodge });
  };
  r.dodge = {
    ezrealQHit: await shot('ezreal', 'Q', 900, false), ezrealQDodged: await shot('ezreal', 'Q', 900, true),
    leeQHit: await shot('leesin', 'Q', 900, false), leeQDodged: await shot('leesin', 'Q', 900, true),
    ezrealQOutOfRange: await shot('ezreal', 'Q', 1400, false),
  };
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
