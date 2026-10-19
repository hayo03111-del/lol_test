// 63차 상점·사용 아이템 점검(헤드리스 Chromium, 실제 클릭·키 입력): 로비에서 시작 → 기지에서 상점(P) → 우클릭 구매 →
// 1키·숫자패드·HUD 클릭·상점 칸 더블클릭으로 사용, 상점 칸 우클릭 판매, 되돌리기(판매·조합), 액티브 아이템 재사용 대기 표시와
// 실패 토스트, HUD에서 제어 와드 = 챔피언 앞 설치, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/shop_item_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push((e.stack || e.message).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  if (await page.evaluate(() => document.getElementById('lobbyOverlay').classList.contains('show'))) { await page.click('#lobbyChampGrid [data-champ="garen"]'); await page.click('#lobbyStartBtn'); }
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const items = () => page.evaluate(() => window.controller.items.map((s) => `${s.id}x${s.count}${typeof s.charges === 'number' ? 'c' + s.charges : ''}`));
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('#skillToast .toastMsg')].map((e) => e.textContent));
  await page.evaluate(() => { const c = window.controller; c.root.position.copy(window.__e2e.getTeamSpawnPosition('BLUE')); c.gold = 5000; });
  await page.mouse.move(700, 300);
  const r = {};
  await page.keyboard.press('p'); await page.waitForTimeout(400);
  const potion = await page.$('#shopGrid .shop-tile[data-id="healthPotion"]');
  for (let i = 0; i < 4; i++) { await potion.click({ button: 'right' }); await page.waitForTimeout(120); }
  r.bought = await items();
  await page.screenshot({ path: path.join(shotDir, 'shop_63.png') });
  // 상점이 열린 채 1키 / 숫자패드 1 / 상점 칸 더블클릭
  await page.evaluate(() => { window.controller.hp = window.controller.maxHp * 0.3; });
  await page.keyboard.press('1'); await page.waitForTimeout(150);
  r.afterKey1 = await items();
  await page.keyboard.press('Numpad1'); await page.waitForTimeout(150);
  r.afterNumpad1 = await items();
  await page.dblclick('#shopInv .shop-inv-slot[data-slot="0"]'); await page.waitForTimeout(200);
  r.afterDblclick = await items();
  r.healsRunning = await page.evaluate(() => (window.controller._itemActiveHeals || []).length);
  // 상점 칸 우클릭 판매 → 되돌리기
  const g0 = await page.evaluate(() => window.controller.gold);
  await page.click('#shopInv .shop-inv-slot[data-slot="0"]', { button: 'right' }); await page.waitForTimeout(200);
  r.afterRightSell = { items: await items(), goldGain: Math.round(await page.evaluate(() => window.controller.gold) - g0) };
  await page.click('#shopUndoBtn'); await page.waitForTimeout(200);
  r.afterUndoSell = { items: await items(), gold: Math.round(await page.evaluate(() => window.controller.gold) - g0) };
  // 조합 되돌리기: 롱소드 2개 → 칼날 계열 대신 티아맷(재료 포함) 구매 후 되돌리기
  await page.evaluate(() => { window.controller.items = []; window.recomputeItemStats(window.controller); });
  const tia = await page.$('#shopGrid .shop-tile[data-id="tiamat"]');
  const g1 = await page.evaluate(() => window.controller.gold);
  if (tia) { await tia.click({ button: 'right' }); await page.waitForTimeout(200); }
  r.tiamatBuy = { items: await items(), spent: Math.round(g1 - await page.evaluate(() => window.controller.gold)) };
  await page.click('#shopUndoBtn'); await page.waitForTimeout(200);
  r.tiamatUndo = { items: await items(), goldBack: Math.round(await page.evaluate(() => window.controller.gold) - g1) };
  if (tia) { await tia.click({ button: 'right' }); await page.waitForTimeout(200); }
  // 상점 닫고 HUD 클릭으로 티아맷 사용 → 재사용 대기 표시 → 다시 누르면 토스트
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('#hudItems .hud-item-grid .hud-item:first-child'); await page.waitForTimeout(300);
  r.tiamatCd = await page.evaluate(() => { const cd = document.querySelector('#hudItems .hud-item-grid .hud-item:first-child .item-cd'); return cd ? cd.textContent : null; });
  await page.keyboard.press('1'); await page.waitForTimeout(150);
  r.reuseToast = (await toasts()).slice(-1)[0] || null;
  // 사용 불가 아이템(롱소드) 숫자키 → 토스트
  await page.evaluate(() => { const c = window.controller; c.items = [{ id: 'longSword', count: 1 }]; window.recomputeItemStats(c); updateItemUI(c); });
  await page.keyboard.press('1'); await page.waitForTimeout(150);
  r.notUsableToast = (await toasts()).slice(-1)[0] || null;
  // HUD 클릭 제어 와드 = 챔피언 앞(커서가 HUD 위여도 멀리 걸어가지 않음)
  await page.evaluate(() => { const c = window.controller; c.items = [{ id: 'controlWard', count: 1 }]; updateItemUI(c); c.root.position.set(0, 0, 0); c.setState('IDLE'); c.targetPos = null; });
  const hudCell = await page.$('#hudItems .hud-item-grid .hud-item:first-child');
  await hudCell.hover(); await hudCell.click(); await page.waitForTimeout(1200);
  r.controlWardFromHud = await page.evaluate(() => { const c = window.controller, E = window.__e2e; const ws = E.wardSystem; const list = ws ? (ws.wards || []) : []; const w = list[list.length - 1]; return { items: c.items.map((s) => s.id + 'x' + s.count), wardDistLol: w ? Math.round(E.worldDistanceToLol(Math.hypot(w.position ? w.position.x : w.mesh.position.x, w.position ? w.position.z : w.mesh.position.z))) : null, playerMovedLol: Math.round(E.worldDistanceToLol(c.root.position.length())) }; });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
