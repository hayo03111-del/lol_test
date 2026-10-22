// QA(94차): 공통 전투 규칙 브라우저 점검 - 시전 선입력(스킬 중 다른 스킬), 돌진 중 점멸 보류, 애쉬 W 실제 화살,
// 바루스 Q 충전 중 기절 → 취소(발사 없음·마나 50% 반환), 게임 시계(시뮬레이션 시간), 전투 기록(이벤트·디버그 패널).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_combat94.js  (실패 항목이 있으면 종료 코드 1)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 }); await page.waitForTimeout(800); };
  const prep = () => page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c.skillLevels = { Q: 3, W: 3, E: 3, R: 1 }; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.hp = c.maxHp; c.statusEffects = [];
    const base = c.root.position.clone();
    for (const [i, d] of E.dummies.entries()) { const m = d.mesh || d.root; m.position.set(base.x + L(-600 + i * 40), m.position.y, base.z + L(-900)); d.hp = d.maxHp; d.statusEffects = []; }
  });
  const r = {}, fails = [];
  const check = (name, ok) => { r[name] = !!ok; if (!ok) fails.push(name); };

  // 1) 시전 선입력: 이즈리얼 Q 시전 중 W를 누르면 버리지 않고 Q가 끝난 뒤 W가 나간다.
  await load('ezreal'); await prep();
  r.ezrealBuffer = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld, b = c.root.position;
    const p = new T.Vector3(b.x, 0, b.z + L(800));
    c.castAbility('Q', p);
    setTimeout(() => {
      const keyDuringQ = c.currentActionKey; c.castAbility('W', p);
      const pending = c.pendingCast ? c.pendingCast.slot : null;
      setTimeout(() => res({ keyDuringQ, pending, qOnCd: c.cooldowns.Q > 0, wFired: c.cooldowns.W > 0 }), 1200);
    }, 40);
  }));
  check('buffer: W pressed during Q fires after Q', r.ezrealBuffer.qOnCd && r.ezrealBuffer.wFired);

  // 2) 돌진 중 점멸: 레넥톤 E 돌진 중 점멸은 보류됐다가 돌진이 끝나면 나간다(재사용 대기 한 번만).
  await load('renekton'); await prep();
  r.renektonFlash = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld, b = c.root.position.clone();
    c.summoners = { D: { id: 'flash', readyAt: 0 }, F: { id: 'heal', readyAt: 0 } };
    c.castAbility('E', new T.Vector3(b.x + L(450), 0, b.z));
    setTimeout(() => {
      const dashing = !!c._dashState;
      const ret = E.castSummonerSpell(c, 'D', new T.Vector3(b.x + L(450), 0, b.z + L(400)), null);
      const buffered = !!c._bufferedSummoner, spentNow = c.summoners.D.readyAt > performance.now();
      setTimeout(() => {
        const p = c.root.position;
        res({ dashing, ret, buffered, spentNow, spentLater: c.summoners.D.readyAt > performance.now(), cleared: !c._bufferedSummoner, endZ: +((p.z - b.z) / L(1)).toFixed(0) });
      }, 900);
    }, 60);
  }));
  check('flash: held during dash and cast after it', r.renektonFlash.dashing && r.renektonFlash.buffered && !r.renektonFlash.spentNow && r.renektonFlash.spentLater && r.renektonFlash.cleared && r.renektonFlash.endZ > 200);

  // 3) 애쉬 W: 화살이 실제 직선 투사체로 날아가 맞힌다.
  await load('ashe'); await prep();
  r.asheW = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld, b = c.root.position.clone();
    const d = E.dummies[0], m = d.mesh || d.root; m.position.set(b.x, m.position.y, b.z + L(600)); d.hp = d.maxHp;
    const before = E.projectiles.totalHits || 0;
    let lineSeen = 0; const iv = setInterval(() => { lineSeen = Math.max(lineSeen, E.projectiles.projectiles.filter((p) => p.line).length); }, 16);
    c.castAbility('W', new T.Vector3(b.x, 0, b.z + L(900)));
    setTimeout(() => { clearInterval(iv); res({ lineSeen, hit: d.hp < d.maxHp, projHits: (E.projectiles.totalHits || 0) - before }); }, 1500);
  }));
  check('ashe W: real line projectiles hit', r.asheW.lineSeen >= 3 && r.asheW.hit && r.asheW.projHits >= 1);

  // 4) 바루스 Q 충전 중 기절: 발사하지 않고 취소, 마나 50% 반환.
  await load('varus'); await prep();
  r.varusStun = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld, b = c.root.position.clone();
    const p = new T.Vector3(b.x, 0, b.z + L(900));
    c.castAbility('Q', p);
    setTimeout(() => {
      const charging = !!c._varus.qCharge, paid = c._varus.qCharge ? c._varus.qCharge.manaPaid : 0, mpAfterPay = c.mp;
      const projBefore = E.projectiles.projectiles.length;
      E.applyStatus(c, { id: 'e2eStun', type: 'STUN', duration: 0.5 });
      setTimeout(() => res({ charging, cancelled: !c._varus.qCharge, noProjectile: E.projectiles.projectiles.length <= projBefore, refund: +(c.mp - mpAfterPay).toFixed(1), half: +(paid / 2).toFixed(1) }), 150);
    }, 400);
  }));
  check('varus Q: stun cancels charge, refunds half', r.varusStun.charging && r.varusStun.cancelled && r.varusStun.noProjectile && Math.abs(r.varusStun.refund - r.varusStun.half) < 2);

  // 5) 게임 시계: 프레임이 진행한 만큼만 간다(실제 시간보다 빠르지 않다).
  r.clock = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, g0 = E.getTurretGameTimeSec(), w0 = performance.now();
    setTimeout(() => res({ game: +(E.getTurretGameTimeSec() - g0).toFixed(2), wall: +((performance.now() - w0) / 1000).toFixed(2) }), 2000);
  }));
  check('clock: game time advances, never faster than wall', r.clock.game > 0.2 && r.clock.game <= r.clock.wall + 0.1);

  // 6) 전투 기록: 시전·상태 효과 이벤트와 디버그 패널 전투 줄.
  await page.waitForTimeout(300);
  r.log = await page.evaluate(() => {
    const ev = window.gameSession.events(0), types = new Set(ev.map((e) => e.type));
    const panel = document.getElementById('debugPanel');
    return { cast: types.has('cast'), status: types.has('status'), damage: types.has('damage'), panel: !!(panel && panel.innerHTML.includes('--- combat ---')) };
  });
  check('combat log: cast/status/damage events and panel section', r.log.cast && r.log.status && r.log.damage && r.log.panel);

  r.errors = errors; r.fails = fails;
  if (errors.length) fails.push('page errors');
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
