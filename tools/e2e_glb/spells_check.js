// 36차 소환사 주문 점검(헤드리스 Chromium + 저장소 모델): D/F 칸·키, 주문 고르기(교체), 점멸·회복·유체화·방어막·탈진·점화·정화·총명·표식(던지기→돌진).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/spells_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const load = async (id) => {
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(500);
  };
  const wait = (ms) => page.waitForTimeout(ms);
  const reset = () => page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d = E.dummies[0];
    c._clearActionTimers && c._clearActionTimers();
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c._dashState = null; c._summonerMark = null;
    c.statusEffects = []; c.root.position.set(0, 0, 0); c.hp = c.maxHp; c.mp = c.maxMp;
    for (const k of ['D', 'F']) c.summoners[k].readyAt = 0;
    d.hp = d.maxHp = 1e5; d.statusEffects = []; d._pullState = null; d.mesh.position.set(0, 0, -L(500));
  });
  // 월드 좌표 → 화면 좌표
  const screenOf = (wx, wz) => page.evaluate(([wx, wz]) => { const E = window.__e2e; const v = new E.THREE.Vector3(wx, 0.8, wz).project(E.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, [wx, wz]);
  const dummyScreen = async () => { const p = await page.evaluate(() => { const m = window.__e2e.dummies[0].mesh.position; return [m.x, m.z]; }); return screenOf(p[0], p[1]); };
  const set = (slot, id) => page.evaluate(([slot, id]) => window.__e2e.setSummonerSpell(window.controller, slot, id), [slot, id]);
  const r = {};

  await load('ahri'); await reset(); await wait(300);
  r.hudDefault = await page.evaluate(() => ['D', 'F'].map((k) => document.getElementById('spellSlot' + k).dataset.spell));
  r.iconsLoaded = await page.evaluate(() => [...document.querySelectorAll('#spellBar img')].filter((i) => i.complete && i.naturalWidth > 0).length);

  // 점멸(D): 커서를 멀리 두고 D → 400 이동, 재사용 대기시간 300
  await reset(); await wait(200);
  const farPt = await page.evaluate(() => { const L = window.__e2e.lolRangeToWorld; return [L(900), 0]; });
  const fs = await screenOf(farPt[0], farPt[1]);
  await page.mouse.move(fs.x, fs.y); await wait(150);
  await page.keyboard.press('KeyD'); await wait(150);
  r.flash = await page.evaluate(() => { const E = window.__e2e, c = window.controller; return { movedLol: Math.round(E.worldDistanceToLol(Math.hypot(c.root.position.x, c.root.position.z))), cd: Math.round((c.summoners.D.readyAt - performance.now()) / 1000) }; });
  const p0 = await page.evaluate(() => window.controller.root.position.x);
  await page.keyboard.press('KeyD'); await wait(150);
  r.flashOnCooldownBlocked = (await page.evaluate(() => window.controller.root.position.x)) === p0;
  await page.screenshot({ path: path.join(shotDir, 'spells_hud.png'), clip: { x: 0, y: 800 - 130, width: 1280, height: 130 } });

  // 회복(F)
  await reset(); await page.evaluate(() => { window.controller.hp = window.controller.maxHp * 0.3; });
  const hp0 = await page.evaluate(() => window.controller.hp);
  await page.keyboard.press('KeyF'); await wait(100);
  r.heal = await page.evaluate((hp0) => { const c = window.controller; const ms = c.statusEffects.find((e) => e.id === 'summonerHealMs'); return { healed: Math.round(c.hp - hp0), ms: ms && ms.value }; }, hp0);

  // 고르기 창: 주문 변경 → D에 점화, D에 회복(=F와 맞바꿈)
  await page.click('#spellChangeBtn'); await wait(150);
  r.pickerOpen = await page.evaluate(() => document.getElementById('spellPicker').classList.contains('show'));
  r.pickerItems = await page.$$eval('#spellPicker .sp-item', (els) => els.length);
  await page.click('#spellPicker [data-spell="ignite"]'); await wait(100);
  r.afterPickIgnite = await page.evaluate(() => [window.controller.summoners.D.id, window.controller.summoners.F.id]);
  await page.click('#spellPicker [data-spell="heal"]'); await wait(100);
  r.afterPickHealSwap = await page.evaluate(() => [window.controller.summoners.D.id, window.controller.summoners.F.id]);
  await page.screenshot({ path: path.join(shotDir, 'spells_picker.png') });
  await page.click('#spellPicker [data-close]');

  // 점화: 더미 위에 커서 + F(점화)
  await reset(); await set('F', 'ignite'); await wait(150);
  const ds = await dummyScreen(); await page.mouse.move(ds.x, ds.y); await wait(150);
  const dh0 = await page.evaluate(() => window.__e2e.dummies[0].hp);
  await page.keyboard.press('KeyF'); await wait(1300);
  r.ignite = await page.evaluate((dh0) => { const d = window.__e2e.dummies[0]; const now = performance.now(); const dot = (d.statusEffects || []).find((e) => e.id === 'summonerIgnite');
    return { firstTickDmg: Math.round(dh0 - d.hp), totalPlanned: dot && Math.round(dot.totalDamage), dotSec: dot && dot.duration, grievous: ((d.statusEffects || []).find((e) => e.type === 'GRIEVOUS' && e.expiresAt > now) || {}).value }; }, dh0);

  // 탈진(사거리 안 더미) + 탈진 걸린 쪽 피해 감소
  await reset(); await set('F', 'exhaust'); await wait(150);
  const ds2 = await dummyScreen(); await page.mouse.move(ds2.x, ds2.y); await wait(100);
  await page.keyboard.press('KeyF'); await wait(100);
  r.exhaust = await page.evaluate(() => { const d = window.__e2e.dummies[0]; return (d.statusEffects || []).filter((e) => e.expiresAt > performance.now()).map((e) => `${e.type}:${e.value}`); });
  r.exhaustDamageReduction = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    const hit = () => { const h = d.hp; E.applyDamage(d, { rawDamage: 100, damageType: 'TRUE', isCritical: false, critMultiplier: 1, source: c }); return Math.round(h - d.hp); };
    const normal = hit();
    E.applyStatus(c, { id: 'testExhaust', type: 'EXHAUSTED', duration: 2, value: E.SUMMONER_SPELL_DATA.exhaust.damageReduction });
    const exhausted = hit();
    return { normal, exhausted };
  });
  // 사거리 밖 탈진 → 실패, 재사용 대기시간 안 돎
  await page.evaluate(() => { window.controller.summoners.F.readyAt = 0; window.__e2e.dummies[0].mesh.position.set(0, 0, -window.__e2e.lolRangeToWorld(1400)); });
  await wait(100); const ds3 = await dummyScreen(); await page.mouse.move(ds3.x, ds3.y); await wait(100);
  await page.keyboard.press('KeyF'); await wait(100);
  r.exhaustOutOfRangeNoCd = await page.evaluate(() => window.controller.summoners.F.readyAt === 0);

  // 방어막·유체화·정화·총명
  await reset(); await set('D', 'barrier'); await set('F', 'ghost'); await wait(100);
  await page.keyboard.press('KeyD'); await page.keyboard.press('KeyF'); await wait(100);
  r.barrierGhost = await page.evaluate(() => { const c = window.controller; return { shield: Math.round(c.shield || 0), ghost: (c.statusEffects.find((e) => e.id === 'summonerGhost') || {}).value }; });
  await reset(); await set('D', 'cleanse'); await set('F', 'clarity'); await wait(100);
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; E.applyStatus(c, { id: 't_stun', type: 'STUN', duration: 3, value: 1 }); E.applyStatus(c, { id: 't_air', type: 'KNOCKUP', duration: 3, value: 1 }); c.mp = 0; });
  await page.keyboard.press('KeyD'); await wait(100);
  r.cleanse = await page.evaluate(() => window.controller.statusEffects.filter((e) => e.expiresAt > performance.now()).map((e) => e.type));
  await page.evaluate(() => { const c = window.controller; c.statusEffects = []; });
  await page.keyboard.press('KeyF'); await wait(100);
  r.clarityAhri = await page.evaluate(() => { const c = window.controller; return { mp: Math.round(c.mp), half: Math.round(c.maxMp / 2) }; });

  // 표식: 더미 쪽으로 던지기 → 맞으면 표식 → 다시 D → 돌진(지면 높이, 닿으면 피해), 재사용 대기시간 25% 감소
  await reset(); await set('D', 'mark'); await wait(100);
  await page.evaluate(() => { const L = window.__e2e.lolRangeToWorld; window.__e2e.dummies[0].mesh.position.set(0, 0, -L(900)); });
  await wait(100); const ds4 = await dummyScreen(); await page.mouse.move(ds4.x, ds4.y); await wait(100);
  const mh0 = await page.evaluate(() => window.__e2e.dummies[0].hp);
  await page.keyboard.press('KeyD');
  await page.waitForFunction(() => !!window.controller._summonerMark, null, { timeout: 4000 }).catch(() => {});
  r.markHit = await page.evaluate((mh0) => ({ marked: !!window.controller._summonerMark, dmg: Math.round(mh0 - window.__e2e.dummies[0].hp), cd: Math.round((window.controller.summoners.D.readyAt - performance.now()) / 1000) }), mh0);
  const mh1 = await page.evaluate(() => window.__e2e.dummies[0].hp);
  await page.keyboard.press('KeyD');
  let maxY = 0; for (let i = 0; i < 40; i++) { maxY = Math.max(maxY, await page.evaluate(() => window.controller.root.position.y)); if (await page.evaluate(() => !window.controller._dashState)) break; await wait(50); }
  await wait(150);
  r.markDash = await page.evaluate((mh1) => { const E = window.__e2e, c = window.controller, d = E.dummies[0];
    return { dashDmg: Math.round(mh1 - d.hp), gapLol: Math.round(E.worldDistanceToLol(Math.hypot(d.mesh.position.x - c.root.position.x, d.mesh.position.z - c.root.position.z))), cdAfter: Math.round((c.summoners.D.readyAt - performance.now()) / 1000), actionCleared: c.currentActionKey == null, state: c.state }; }, mh1);
  r.markDash.maxY = maxY;

  // 총명: 마나 없는 챔피언은 실패
  await load('garen'); await reset(); await set('F', 'clarity'); await wait(100);
  await page.keyboard.press('KeyF'); await wait(100);
  r.clarityGarenBlocked = await page.evaluate(() => window.controller.summoners.F.readyAt === 0);
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
