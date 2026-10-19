// 71차 새 아이템 점검(헤드리스 Chromium): 상점에 새 아이템 49종 타일·아이콘이 다 뜨는지, 실제 게임에서 태양불꽃 방패(불사르기)가
// 주변 미니언에게 피해를 주는지, 수은 장식띠로 기절이 풀리는지, 란두인 사용이 둔화를 거는지, 굶주린 히드라 쪼개기, 스코어보드 아이템 칸, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/new_items_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const r = {};
  // 상점: 새 아이템 타일과 아이콘
  await page.evaluate(() => { const c = window.controller; c.root.position.copy(window.__e2e.getTeamSpawnPosition('BLUE')); c.gold = 20000; });
  await page.keyboard.press('p'); await page.waitForTimeout(500);
  r.shop = await page.evaluate(async () => {
    const ids = Object.values(window.__itemExtraIds || {}).flat();
    const tiles = ids.filter((id) => document.querySelector(`#shopGrid .shop-tile[data-id="${id}"]`));
    await new Promise((res) => setTimeout(res, 1500));
    const broken = ids.filter((id) => { const img = document.querySelector(`#shopGrid .shop-tile[data-id="${id}"] img`); return !img || !img.complete || !img.naturalWidth; });
    return { total: ids.length, tiles: tiles.length, brokenIcons: broken };
  });
  await page.click('#shopGrid .shop-tile[data-id="frozenHeart"]'); await page.waitForTimeout(300);
  r.detail = await page.evaluate(() => document.querySelector('#shopDetail .sd-scroll').innerText.replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: path.join(shotDir, 'new_items_shop.png') });
  for (const id of ['sunfireAegis', 'quicksilverSash', 'randuinsOmen', 'ravenousHydra']) { await page.click(`#shopGrid .shop-tile[data-id="${id}"]`, { button: 'right' }); await page.waitForTimeout(150); }
  r.items = await page.evaluate(() => window.controller.items.map((s) => s.id));
  await page.keyboard.press('p'); await page.waitForTimeout(200);
  // 실전: 미니언 옆에서 맞고 때리기
  r.effects = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    for (const m of [...E.minions]) { m.isDead = true; E.scene.remove(m.mesh); } E.minions.length = 0;
    c.root.position.set(0, 0, 0); c.hp = c.maxHp = 1e5;
    const mk = (x, z) => { const m = E.createMinion('caster', new E.THREE.Vector3(x, 0, z), E.getTurretGameTimeSec(), 'RED'); m.hp = m.maxHp = 1e5; m.moveSpeedWorld = 0; E.minions.push(m); return m; };
    const a = mk(L(120), 0), b = mk(-L(160), 0); // 플레이어 양옆(미니언끼리 밀어내도 불사르기 범위 325 안)
    E.applyDamage(a, { rawDamage: 1, damageType: 'PHYSICAL', isCritical: false, critMultiplier: 1, source: c });
    await new Promise((res) => setTimeout(res, 2500));
    const immolate = { a: Math.round(1e5 - a.hp), b: Math.round(1e5 - b.hp) };
    // 히드라 쪼개기: a를 평타로 치면 b도 맞음
    b.mesh.position.set(a.mesh.position.x + L(120), 0, a.mesh.position.z); // 쪼개기 범위(250) 안으로
    const b0 = b.hp; window.itemOnBasicAttackHit(c, a, false);
    const cleave = Math.round(b0 - b.hp);
    // 수은 장식띠
    E.applyStatus(c, { id: 'testStun', type: 'STUN', duration: 3, value: 1 });
    const qssSlot = c.items.findIndex((s) => s.id === 'quicksilverSash');
    const used = window.__useItem(c, qssSlot);
    const stunned = (c.statusEffects || []).some((e) => e.type === 'STUN' && e.expiresAt > performance.now());
    // 란두인
    const rSlot = c.items.findIndex((s) => s.id === 'randuinsOmen');
    window.__useItem(c, rSlot);
    const slowed = (a.statusEffects || []).some((e) => e.id === 'itemRanduinSlow');
    return { immolate, cleave, qssUsed: used, stunAfterQss: stunned, randuinSlow: slowed };
  });
  await page.keyboard.down('Tab'); await page.waitForTimeout(400);
  r.scoreboardItems = await page.$$eval('#scoreboardPanel .sb-row.me .sb-item:not(.empty)', (els) => els.length);
  await page.screenshot({ path: path.join(shotDir, 'scoreboard_71.png') });
  await page.keyboard.up('Tab');
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
