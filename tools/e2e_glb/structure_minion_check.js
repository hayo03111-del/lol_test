// 59차 포탑·미니언·챔피언 상호작용 점검(헤드리스 Chromium + 저장소 모델): 구조물·미니언 GLB 14개 로드, 스킬 피해는 포탑에
// 안 들어감(평타는 들어감), 포탑 가열(+40%씩 3단계, 대상 바뀌면 초기화)과 실제 연속 사격 피해 증가, 30% 관통, 미니언 %피해,
// 도움 요청(허수아비를 때리면 포탑은 플레이어로 돌아서고, 65차부터 미니언은 그대로), 미니언끼리 교전·원거리 투사체, 미니언 어그로(인식 범위),
// 막타 골드 규칙, 웨이브 경로, 특성 배지, (60차) 허수아비 무시·구조물 보호 순서, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/structure_minion_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => { if (errors.length < 3) errors.push((e.stack || e.message).slice(0, 600)); else if (errors.length < 4) errors.push('...more'); });
  page.on('console', (m) => { if (/MODEL LOAD ERROR/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen' && window.__e2e.turrets.length, null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const sleep = (ms) => page.waitForTimeout(ms);
  // 공용: 미니언 전부 지우기, 플레이어 상태 초기화, RED 외곽 포탑
  await page.evaluate(() => {
    const E = window.__e2e;
    window.__clearMinions = () => { for (const m of [...E.minions]) { m.isDead = true; E.scene.remove(m.mesh); } E.minions.length = 0; };
    window.__redOuter = () => E.turrets.find((t) => t.team === 'RED' && t.type === 'outer1');
    window.__resetPlayer = (pos) => { const c = window.controller; c._clearActionTimers && c._clearActionTimers(); c.currentActionKey = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c.attackOrderActive = false; c.statusEffects = []; c.shieldEntries = []; c.hp = c.maxHp; if (pos) c.root.position.copy(pos); };
    for (const t of E.turrets) { t._callForHelp = null; t.attackTarget = null; t.heatStacks = 0; }
  });
  const r = {};
  r.assets = await page.evaluate(() => { const E = window.__e2e; return { loaded: Object.keys(E.minionBuildingAssets).sort(), turretsReal: E.turrets.filter((t) => t.isStructure).every((t) => t.usingRealModel), nexusReal: E.nexusBuildings.every((n) => n.usingRealModel), inhibReal: E.inhibitorBuildings.every((n) => n.usingRealModel), isChampion: window.controller.isChampion }; });

  // 1) 스킬 피해는 포탑에 0, 평타는 들어감, 아이템/미니언 공격자는 들어감
  r.structureDamageGate = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, t = window.__redOuter(), nx = E.nexusBuildings.find((n) => n.team === 'RED'), inh = E.inhibitorBuildings.find((n) => n.team === 'RED');
    const hp0 = t.hp; const ability = E.applyDamage(t, { rawDamage: 800, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, isAbility: true, source: c });
    const noFlag = E.applyDamage(t, { rawDamage: 800, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, source: c });
    const nexusAbility = E.applyDamage(nx, { rawDamage: 800, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, isAbility: true, source: c });
    const inhibAbility = E.applyDamage(inh, { rawDamage: 800, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, isAbility: true, source: c });
    const hpAfterAbility = t.hp;
    const basic = E.applyDamage(t, { rawDamage: 300, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    t.hp = t.maxHp; E.applyDamage; // 원상 복구
    return { ability, noFlag, nexusAbility, inhibAbility, hpUnchangedByAbility: hpAfterAbility === hp0, basic: +basic.toFixed(1) };
  });
  // 실제 스킬(가렌 E 회전)을 포탑 옆에서 - 포탑 체력 그대로
  r.garenESpin = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, t = window.__redOuter(), tp = E.getWorldPosition(t);
    window.__resetPlayer(tp.clone().add(new E.THREE.Vector3(0, 0, -(t.collisionRadius + 0.6))));
    t.hp = t.maxHp; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 };
    const hp0 = t.hp; c.castAbility('E'); await new Promise((res) => setTimeout(res, 1500));
    const out = { turretHpLost: Math.round(hp0 - t.hp) }; window.__resetPlayer(E.getTeamSpawnPosition('BLUE')); t.hp = t.maxHp; return out;
  });

  // 2) 가열: 계산값(대상 같으면 +40%씩, 바뀌면 초기화) + 관통
  r.heatCalc = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, t = window.__redOuter();
    t.heatStacks = 0; t._heatTarget = null; t.lastChampionHitAt = 0;
    const seq = []; for (let i = 0; i < 5; i++) seq.push(+E.getTurretDamage(t, c).rawDamage.toFixed(1));
    const pen = E.getTurretDamage(t, c).armorPenPercent;
    const d = E.dummies[0]; const switched = +E.getTurretDamage(t, d).rawDamage.toFixed(1);
    t.heatStacks = 0; t._heatTarget = null;
    const melee = E.createMinion('melee', new E.THREE.Vector3(0, 0, 0), 0, 'BLUE'); const meleePct = +(E.getTurretDamage(t, melee).rawDamage / melee.maxHp).toFixed(2);
    const superM = E.createMinion('super', new E.THREE.Vector3(0, 0, 0), 0, 'BLUE'); const superPct = +(E.getTurretDamage(t, superM).rawDamage / superM.maxHp).toFixed(2);
    for (const m of [melee, superM]) { m.isDead = true; E.scene.remove(m.mesh); }
    return { seq, ratios: seq.map((v) => +(v / seq[0]).toFixed(2)), pen, afterSwitch: +(switched / seq[0]).toFixed(2), meleePct, superPct };
  });
  // 실제 연속 사격: 포탑 사거리 안에 서 있으면 맞는 피해가 커진다
  r.heatLive = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, t = window.__redOuter(), tp = E.getWorldPosition(t);
    window.__clearMinions(); t.heatStacks = 0; t._heatTarget = null; t.attackTarget = null; t.attackCooldown = 0; t._lastMinionSeenAt = -Infinity;
    window.__resetPlayer(tp.clone().add(new E.THREE.Vector3(0, 0, -E.lolRangeToWorld(500))));
    const hits = []; const orig = c.takeDamage.bind(c);
    c.takeDamage = function(amount, ...rest) { if (rest[0] && rest[0].source === t || (rest[1] && rest[1].source === t)) {} return orig(amount, ...rest); };
    let last = c.hp;
    const until = performance.now() + 6200;
    while (performance.now() < until) {
      await new Promise((res) => setTimeout(res, 50));
      if (c.hp < last - 1) hits.push(Math.round(last - c.hp));
      c.hp = c.maxHp; last = c.hp;
    }
    c.takeDamage = orig;
    const beam = !!(t._aggroBeam && t._aggroBeam.visible);
    const badges = t.traitsDiv ? t.traitsDiv.textContent : '';
    window.__resetPlayer(E.getTeamSpawnPosition('BLUE'));
    return { hits, beamWhileTargeted: beam, badges };
  });

  // 3) 도움 요청: 포탑이 아군 미니언을 치는 중 → 플레이어가 RED 챔피언(허수아비)을 때리면 플레이어로 돌아선다
  r.callForHelp = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, t = window.__redOuter(), tp = E.getWorldPosition(t), L = E.lolRangeToWorld, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    window.__clearMinions(); t._callForHelp = null; t.attackTarget = null;
    const bm = E.createMinion('melee', tp.clone().add(V(0.8, -L(350))), 0, 'BLUE'); bm.hp = bm.maxHp = 1e6; E.minions.push(bm);
    const rc = E.createMinion('caster', tp.clone().add(V(-1.5, -L(150))), 0, 'RED'); rc.hp = rc.maxHp = 1e6; E.minions.push(rc);
    window.__resetPlayer(tp.clone().add(V(-0.8, -L(600))));
    const d = E.dummies[0]; d.hp = d.maxHp = 1e5; d.mesh.position.copy(tp.clone().add(V(-0.8, -L(250)))); // 83차: 플레이어 평타 사거리 밖(자동 공격이 먼저 도움 요청을 일으키지 않게)
    await new Promise((res) => setTimeout(res, 1500));
    const before = { turret: t.attackTarget === bm ? 'blueMinion' : (t.attackTarget === c ? 'player' : String(t.attackTarget && t.attackTarget.type)), redCaster: rc.attackTarget === bm ? 'blueMinion' : (rc.attackTarget === c ? 'player' : null) };
    E.applyDamage(d, { rawDamage: 50, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    await new Promise((res) => setTimeout(res, 300));
    const after = { turret: t.attackTarget === c ? 'player' : (t.attackTarget === bm ? 'blueMinion' : null), redCaster: rc.attackTarget === c ? 'player' : (rc.attackTarget === bm ? 'blueMinion' : null), dummyTeam: d.team };
    window.__clearMinions(); t._callForHelp = null; t.attackTarget = null; d.mesh.position.set(40, 0, 40);
    window.__resetPlayer(E.getTeamSpawnPosition('BLUE'));
    return { before, after };
  });

  // 4) 미니언끼리 교전(다리 가운데), 원거리 투사체, 플레이어 어그로(인식 범위)
  r.minionFight = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    window.__clearMinions(); window.__resetPlayer(E.getTeamSpawnPosition('BLUE'));
    const now = E.getTurretGameTimeSec();
    const b = [E.createMinion('melee', V(0, -1.2), now, 'BLUE'), E.createMinion('caster', V(0.6, -4.5), now, 'BLUE')];
    const rr = [E.createMinion('melee', V(0, 1.2), now, 'RED'), E.createMinion('siege', V(-0.6, 4.5), now, 'RED')];
    E.minions.push(...b, ...rr);
    const projBefore = E.projectiles.projectiles.length; let maxProj = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3500) { await new Promise((res) => setTimeout(res, 100)); maxProj = Math.max(maxProj, E.projectiles.projectiles.length - projBefore); }
    const info = (m) => ({ type: m.type, team: m.team, real: m.usingRealModel, hpPct: Math.round(m.hp / m.maxHp * 100), target: m.attackTarget ? (m.attackTarget.isMinion ? m.attackTarget.team + ' ' + m.attackTarget.type : 'other') : null, clip: m.currentClipName });
    const out = { units: [...b, ...rr].map(info), rangedMissilesSeen: maxProj };
    // 크기(월드 키)
    const box = new E.THREE.Box3().setFromObject(b[0].body); out.meleeHeightLol = Math.round(E.worldDistanceToLol(box.max.y - box.min.y));
    const box2 = new E.THREE.Box3().setFromObject(rr[1].body); out.siegeHeightLol = Math.round(E.worldDistanceToLol(box2.max.y - box2.min.y));
    return out;
  });
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; c.root.position.set(-3, 0, -3); E.cameraRig.distance = 11; });
  await sleep(600);
  await page.screenshot({ path: path.join(shotDir, 'minions_fight.png') });
  r.minionAggroPlayer = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    window.__clearMinions();
    const rc = E.createMinion('caster', V(0, 0), E.getTurretGameTimeSec(), 'RED'); E.minions.push(rc);
    window.__resetPlayer(V(0, -L(1100))); await new Promise((res) => setTimeout(res, 400));
    const far = rc.attackTarget === c; // 61차: 원거리 인식 범위 700(원작)
    window.__resetPlayer(V(0, -L(480))); await new Promise((res) => setTimeout(res, 400));
    const near = rc.attackTarget === c;
    const hp0 = c.hp; await new Promise((res) => setTimeout(res, 2500));
    const tookDamage = c.hp < hp0;
    window.__clearMinions(); window.__resetPlayer(E.getTeamSpawnPosition('BLUE'));
    return { targetsPlayerAt1100: far, targetsPlayerAt480: near, tookDamage };
  });

  // 5) 막타 골드: 플레이어 막타만 골드, 아군 미니언 막타는 0
  r.gold = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    window.__clearMinions();
    const a = E.createMinion('melee', V(0, 2), E.getTurretGameTimeSec(), 'RED'); const b = E.createMinion('melee', V(1, 2), E.getTurretGameTimeSec(), 'RED');
    const blue = E.createMinion('melee', V(1, 1), E.getTurretGameTimeSec(), 'BLUE');
    E.minions.push(a, b, blue);
    const g0 = c.gold || 0;
    E.applyDamage(a, { rawDamage: 1e5, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    const g1 = c.gold || 0;
    E.applyDamage(b, { rawDamage: 10, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c }); // 플레이어가 한 대 친 뒤
    E.applyDamageToMinion(b, { rawDamage: 1e5, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: blue }); // 아군 미니언이 막타
    const g2 = c.gold || 0;
    window.__clearMinions();
    return { playerLastHit: g1 - g0, allyMinionLastHit: g2 - g1 };
  });

  // 6) 웨이브: 넥서스 앞에서 차례로 나와 경로를 따라 상대 진영으로
  r.wave = await page.evaluate(async () => {
    const E = window.__e2e;
    window.__clearMinions();
    const wp = E.getMinionLaneWaypoints('BLUE').map((p) => +p.z.toFixed(1));
    E.spawnMinionWave('BLUE', E.getTurretGameTimeSec()); E.spawnMinionWave('RED', E.getTurretGameTimeSec());
    await new Promise((res) => setTimeout(res, 300));
    const early = E.minions.length;
    await new Promise((res) => setTimeout(res, 5000));
    const blue = E.minions.filter((m) => m.team === 'BLUE'), red = E.minions.filter((m) => m.team === 'RED');
    const nb = E.getWorldPosition(E.nexusBuildings.find((n) => n.team === 'BLUE')).z, nr = E.getWorldPosition(E.nexusBuildings.find((n) => n.team === 'RED')).z;
    return { waypointsZ: wp, nexusZ: [+nb.toFixed(1), +nr.toFixed(1)], spawnedAfter300ms: early, after5s: E.minions.length, blueAdvanced: blue.every((m) => m.mesh.position.z > nb + 1), redAdvanced: red.every((m) => m.mesh.position.z < nr - 1), allReal: E.minions.every((m) => m.usingRealModel), blueMaxZ: +Math.max(...blue.map((m) => m.mesh.position.z)).toFixed(1) };
  });
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; const m = E.minions.find((m) => m.team === 'BLUE'); if (m) c.root.position.copy(m.mesh.position).add(new E.THREE.Vector3(-2.5, 0, -2)); E.cameraRig.distance = 13; });
  await sleep(700);
  await page.screenshot({ path: path.join(shotDir, 'minion_wave.png') });
  // 포탑 + 특성 배지 스크린샷
  await page.evaluate(() => { const E = window.__e2e, c = window.controller, t = window.__redOuter(); window.__clearMinions(); c.root.position.copy(E.getWorldPosition(t)).add(new E.THREE.Vector3(0, 0, -E.lolRangeToWorld(650))); E.cameraRig.distance = 14; });
  await sleep(3500);
  await page.screenshot({ path: path.join(shotDir, 'turret_heat.png') });
  // 7) 60차: 허수아비는 어느 팀 미니언·포탑도 노리지 않는다
  r.dummyIgnored = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    window.__clearMinions(); window.__resetPlayer(E.getTeamSpawnPosition('BLUE'));
    const d = E.dummies[0]; d.hp = d.maxHp = 1e5; d.mesh.position.set(0, 0, 0);
    const now = E.getTurretGameTimeSec();
    const ms = [E.createMinion('melee', V(0.8, 0.6), now, 'BLUE'), E.createMinion('caster', V(-0.8, -1.5), now, 'BLUE'), E.createMinion('melee', V(-0.8, 0.6), now, 'RED'), E.createMinion('caster', V(0.8, 1.5), now, 'RED')];
    // 서로 싸우지 않게 같은 팀끼리만 둔 상태를 각각 확인
    E.minions.push(ms[0], ms[1]); await new Promise((res) => setTimeout(res, 1500));
    const blueTargets = ms.slice(0, 2).map((m) => m.attackTarget && m.attackTarget.isTrainingDummy);
    window.__clearMinions(); E.minions.push(ms[2], ms[3]); ms[2].isDead = ms[3].isDead = false; await new Promise((res) => setTimeout(res, 1500));
    const redTargets = ms.slice(2).map((m) => m.attackTarget && m.attackTarget.isTrainingDummy);
    const out = { blueTargetsDummy: blueTargets, redTargetsDummy: redTargets, dummyDamage: Math.round(1e5 - d.hp), validForMinion: E.isValidMinionTarget(ms[0], d), validForTurret: E.isValidTurretTarget(E.turrets.find((t) => t.team === 'BLUE' && t.type === 'outer1'), d) };
    window.__clearMinions(); d.mesh.position.set(40, 0, 40);
    return out;
  });
  // 8) 60차 구조물 보호: 외곽 포탑이 살아 있으면 억제기 포탑·억제기·넥서스 포탑·넥서스는 무적, 외곽이 깨지면 억제기 포탑부터 공격 가능
  r.protection = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    const T = (type) => E.turrets.find((t) => t.team === 'RED' && t.type === type);
    const hit = (u) => E.applyDamage(u, { rawDamage: 300, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    const inh = E.inhibitorBuildings.find((i) => i.team === 'RED'), nx = E.nexusBuildings.find((n) => n.team === 'RED');
    const before = { inhibTurret: hit(T('inhibitor')), inhibitor: hit(inh), nexusTurret: hit(T('nexusTwin')), nexus: hit(nx), badge: T('inhibitor').traitsDiv ? T('inhibitor').traitsDiv.textContent : '' };
    const outer = T('outer1'); outer.hp = 1; E.applyDamageToTurret(outer, { rawDamage: 1e4, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true }, { source: c });
    const after = { outerDestroyed: outer.destroyed, inhibTurret: Math.round(hit(T('inhibitor'))), inhibitor: hit(inh), nexus: hit(nx) };
    return { before, after };
  });
  // 9) 61차: 원작 크기(LoL 단위 키), 포탑 탄속·발사 높이
  r.sizes = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.worldDistanceToLol, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    const h = (o) => { const b = new E.THREE.Box3().setFromObject(o); return Math.round(L(b.max.y - Math.max(0, b.min.y))); };
    const out = { garen: h(c.model) };
    for (const t of ['melee', 'caster', 'siege', 'super']) { const m = E.createMinion(t, V(30, 30), 0, 'RED'); out[t] = h(m.body); out[t + 'Radius'] = Math.round(L(m.collisionRadius)); m.isDead = true; E.scene.remove(m.mesh); }
    const t = E.turrets.find((t) => t.isStructure); out.turret = h(t.mesh); out.inhibitor = h(E.inhibitorBuildings[0].mesh); out.nexus = h(E.nexusBuildings[0].mesh);
    return out;
  });
  // 10) 61차: 플레이어와 미니언 몸 충돌, 기절 동작
  r.bodyBlock = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, V = (x, z) => new E.THREE.Vector3(x, 0, z);
    window.__clearMinions(); window.__resetPlayer(V(0, -2));
    const m = E.createMinion('melee', V(0, -2.05), E.getTurretGameTimeSec(), 'BLUE'); E.minions.push(m);
    await new Promise((res) => setTimeout(res, 500));
    const gap = Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x - m.mesh.position.x, c.root.position.z - m.mesh.position.z)));
    E.applyStatus(m, { id: 'test_stun', type: 'STUN', duration: 2, source: c });
    await new Promise((res) => setTimeout(res, 400));
    const clip = m.currentClipName;
    window.__clearMinions(); window.__resetPlayer(E.getTeamSpawnPosition('BLUE'));
    return { gapLolAfterOverlap: gap, stunnedClip: clip };
  });
  r.turretMissile = await page.evaluate(() => {
    const E = window.__e2e; const t = E.turrets.find((t) => t.team === 'RED' && t.type === 'nexusTwin');
    return { speedLol: Math.round(E.worldDistanceToLol(E.TURRET_PROJECTILE_SPEED || 0)) };
  });
  // 11) 61차: 파괴된 포탑은 잔해로 주저앉고, 억제기는 재생성까지 남은 시간이 보인다
  r.rubbleAndInhib = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller;
    const outer = E.turrets.find((t) => t.team === 'RED' && t.type === 'outer1');
    await new Promise((res) => setTimeout(res, 2500));
    const scaleY = +(outer.mesh.scale.y / outer._turretDestroyStartScale.y).toFixed(2);
    const it = E.turrets.find((t) => t.team === 'RED' && t.type === 'inhibitor'); it.hp = 1; E.applyDamageToTurret(it, { rawDamage: 1e4, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true }, { source: c });
    const inh = E.inhibitorBuildings.find((i) => i.team === 'RED'); inh.hp = 1; E.applyDamage(inh, { rawDamage: 1e4, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    await new Promise((res) => setTimeout(res, 2500));
    const timer = (inh.labelDiv.querySelector('.inhibTimer') || {}).textContent || '';
    return { outerRubbleScaleY: scaleY, inhibDestroyed: inh.destroyed, inhibTimer: timer, inhibClip: inh.currentClipName };
  });
  // 12) 62차 골드·경험치: 시작 1400, 기본 수급 10초당 55(1:00부터), 막타 골드 + 떠오르는 숫자, 근처 미니언 6골드,
  // 미니언 경험치(막타 무관, 범위 안), 포탑 골드(팀 150 + 파괴자 몫), 구조물 경험치 없음
  r.rewards = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, V = (x, z) => new E.THREE.Vector3(x, 0, z), L = E.lolRangeToWorld;
    const out = { startGold: c._startingGoldGiven ? 'given' : 'no' };
    window.__clearMinions(); window.__resetPlayer(V(0, -2));
    E.setGameTimeSec(30); c.gold = 0; await new Promise((res) => setTimeout(res, 1000)); out.passiveBefore60 = Math.round(c.gold);
    E.setGameTimeSec(120); c.gold = 0; await new Promise((res) => setTimeout(res, 2000)); out.passiveAfter60_2s = Math.round(c.gold);
    E.setGameTimeSec(30); // 이후 측정이 기본 수급에 섞이지 않게
    const now = E.getTurretGameTimeSec();
    const a = E.createMinion('caster', V(0, 0), now, 'RED'); const b = E.createMinion('melee', V(1, 0), now, 'RED'); const far = E.createMinion('melee', V(0, L(2500)), now, 'RED');
    const blue = E.createMinion('melee', V(1, -1), now, 'BLUE'); E.minions.push(a, b, far, blue);
    let g = c.gold, x = c.currentExp || 0, lv = c.champLevel;
    E.applyDamage(a, { rawDamage: 1e5, damageType: 'TRUE', isCritical: false, critMultiplier: 1, isBasicAttack: true, source: c });
    out.lastHitCaster = { gold: Math.round(c.gold - g), exp: +((c.currentExp || 0) - x + (c.champLevel > lv ? 999 : 0)).toFixed(1), popup: E.rewardTexts };
    g = c.gold; x = c.currentExp || 0;
    E.applyDamageToMinion(b, { rawDamage: 1e5, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: blue });
    out.allyMinionKill = { gold: Math.round(c.gold - g), exp: +((c.currentExp || 0) - x).toFixed(1) };
    g = c.gold; x = c.currentExp || 0;
    E.applyDamageToMinion(far, { rawDamage: 1e5, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: blue });
    out.farKill = { gold: Math.round(c.gold - g), exp: +((c.currentExp || 0) - x).toFixed(1) };
    window.__clearMinions();
    // 포탑: 파괴자(가까이서 때림) 150+175 / 멀리서 미니언이 부숨 150
    const nt = E.turrets.filter((t) => t.team === 'RED' && t.type === 'nexusTwin');
    window.__resetPlayer(E.getWorldPosition(nt[0]).clone().add(V(0, -L(400))));
    g = c.gold; x = c.currentExp || 0;
    const fakeTurret = { ...nt[0], type: 'inhibitor', team: 'RED', isTurret: true, _championDamagers: new Map([[c, performance.now()]]) };
    E.rewardStructureDestroyed(fakeTurret);
    out.inhibTurretAsKiller = { gold: Math.round(c.gold - g), exp: +((c.currentExp || 0) - x).toFixed(1) };
    window.__resetPlayer(E.getTeamSpawnPosition('BLUE')); g = c.gold;
    E.rewardStructureDestroyed({ ...nt[0], type: 'outer1', team: 'RED', isTurret: true, _championDamagers: new Map() });
    out.outerFarAway = Math.round(c.gold - g);
    await new Promise((res) => setTimeout(res, 300));
    out.banner = (document.querySelector('.rewardBanner') || {}).textContent || '';
    return out;
  });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
