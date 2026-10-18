// 33차 상점 창·키 배치 점검(헤드리스 Chromium + 저장소 모델): P로 열고 닫기, 분류·검색·능력치 필터, 클릭 구매·우클릭 구매·조합,
// 기지 밖 구매 불가 안내, 판매, 창 안 휠은 카메라 줌 안 함, 4키 = 와드, 1·2·3·5·6·7 = 아이템 칸, T는 아무 일 없음.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/shop_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const r = {};
  const toBase = () => page.evaluate(() => { const E = window.__e2e, c = window.controller; const p = E.getTeamSpawnPosition(E.PLAYER_TEAM); c.root.position.set(p.x, 0, p.z); c.targetPos = null; c.gold = 20000; c.items = []; c.boots = null; });
  await toBase();
  const shown = () => page.evaluate(() => document.getElementById('shopOverlay').classList.contains('show'));
  const wait = (ms) => page.waitForTimeout(ms);

  await page.mouse.move(200, 200);
  await page.keyboard.press('KeyP'); await wait(400);
  r.openWithP = await shown();
  r.inBaseChip = await page.textContent('#shopZoneChip');
  r.goldShown = await page.textContent('#shopGold');

  // 분류 → 롱소드 클릭 → 구매 버튼
  await page.click('#shopCats [data-cat="basic"]'); await wait(150);
  r.basicTiles = await page.$$eval('#shopGrid .shop-tile', (els) => els.length);
  await page.click('#shopGrid .shop-tile[data-id="longSword"]'); await wait(150);
  r.detailName = await page.textContent('#shopDetail .sd-name');
  await page.click('#shopDetail .sd-buy'); await wait(150);
  // 우클릭으로 하나 더
  await page.click('#shopGrid .shop-tile[data-id="longSword"]', { button: 'right' }); await wait(150);
  r.afterBuys = await page.evaluate(() => window.controller.items.map((s) => s.id));
  // 티아맷 = 롱소드 2개 조합
  await page.click('#shopCats [data-cat="epic"]'); await wait(150);
  r.tiamatBuildable = await page.$eval('#shopGrid .shop-tile[data-id="tiamat"]', (el) => el.classList.contains('buildable'));
  await page.click('#shopGrid .shop-tile[data-id="tiamat"]'); await wait(150);
  r.tiamatButton = (await page.textContent('#shopDetail .sd-buy')).trim();
  r.tiamatOwnedComponents = await page.$$eval('#shopDetail .sd-tree .shop-mini.owned', (els) => els.length);
  await page.click('#shopDetail .sd-buy'); await wait(150);
  r.afterBuild = await page.evaluate(() => window.controller.items.map((s) => s.id));
  // 검색·필터
  await page.click('#shopCats [data-cat="all"]');
  await page.fill('#shopSearch', '도란'); await wait(200);
  r.searchDoran = await page.$$eval('#shopGrid .shop-tile', (els) => els.map((e) => e.dataset.id));
  await page.keyboard.press('KeyQ'); // 입력칸 타이핑 중에는 스킬이 안 나가야 한다
  r.typingNoCast = await page.evaluate(() => window.controller.cooldowns.Q === 0);
  await page.fill('#shopSearch', ''); await wait(200);
  await page.click('#shopCats [data-filter="ap"]'); await page.click('#shopCats [data-filter="hp"]'); await wait(200);
  r.filterApHp = await page.evaluate(() => [...document.querySelectorAll('#shopGrid .shop-tile')].length);
  await page.click('#shopCats [data-reset]'); await wait(150);

  // 전설급 선택 상태 스크린샷(조합 경로·상위 아이템)
  await page.click('#shopCats [data-cat="legendary"]'); await wait(150);
  await page.click('#shopGrid .shop-tile[data-id="titanicHydra"]'); await wait(300);
  await page.screenshot({ path: path.join(shotDir, 'shop_open.png') });

  // 판매
  await page.click('#shopInv .shop-inv-slot[data-slot="0"]'); await wait(150);
  r.sellLabel = await page.textContent('#shopSellBtn');
  const goldBefore = await page.evaluate(() => window.controller.gold);
  await page.click('#shopSellBtn'); await wait(150);
  r.sold = await page.evaluate((g) => ({ items: window.controller.items.length, gained: window.controller.gold - g }), goldBefore);

  // 휠: 창 안에서는 카메라 줌 안 함
  const d0 = await page.evaluate(() => window.__e2e.cameraRig.distance);
  await page.mouse.move(720, 400); await page.mouse.wheel(0, 400); await wait(150);
  r.wheelInShopKeepsZoom = (await page.evaluate(() => window.__e2e.cameraRig.distance)) === d0;

  // 기지 밖
  await page.evaluate(() => { const c = window.controller; c.root.position.set(0, 0, 0); });
  await wait(400);
  r.outChip = await page.textContent('#shopZoneChip');
  await page.click('#shopCats [data-cat="basic"]'); await page.click('#shopGrid .shop-tile[data-id="longSword"]'); await wait(150);
  r.outButton = (await page.textContent('#shopDetail .sd-buy')).trim();
  const n0 = await page.evaluate(() => window.controller.items.length);
  await page.click('#shopGrid .shop-tile[data-id="longSword"]', { button: 'right' }); await wait(150);
  r.outBuyBlocked = (await page.evaluate(() => window.controller.items.length)) === n0;

  await page.keyboard.press('Escape'); await wait(200);
  r.escCloses = !(await shown());
  r.notPausedByEsc = await page.evaluate(() => !document.getElementById('pauseOverlay').classList.contains('show'));
  await page.click('#hudShopBtn'); await wait(200);
  r.hudButtonOpens = await shown();
  await page.keyboard.press('KeyP'); await wait(200);
  r.pCloses = !(await shown());

  // 키 배치: 4 = 와드, T = 아무 일 없음, 5 = 4번째 칸 아이템 사용
  await page.evaluate(() => { const E = window.__e2e, c = window.controller; E.wardSystem.clear(); c.trinket.charges = 2; c.root.position.set(0, 0, 0); c.targetPos = null; });
  await page.mouse.move(760, 430); await wait(100);
  await page.keyboard.press('KeyT'); await wait(150);
  r.tPlacesNothing = await page.evaluate(() => window.__e2e.wardSystem.wards.length === 0 && !window.controller._wardOrder);
  await page.keyboard.press('Digit4'); await wait(300);
  r.key4Ward = await page.evaluate(() => ({ wards: window.__e2e.wardSystem.wards.length, walking: !!window.controller._wardOrder, charges: window.controller.trinket.charges }));
  await page.evaluate(() => { const c = window.controller; c.items = [{ id: 'longSword', count: 1 }, { id: 'longSword', count: 1 }, { id: 'longSword', count: 1 }, { id: 'healthPotion', count: 3 }]; c.hp = c.maxHp * 0.4; });
  await page.keyboard.press('Digit4'); await wait(100); // 4는 아이템 칸이 아니다 - 물약 그대로
  r.potionAfter4 = await page.evaluate(() => window.controller.items[3].count);
  await page.keyboard.press('Digit5'); await wait(150);
  r.potionAfter5 = await page.evaluate(() => window.controller.items[3] && window.controller.items[3].count);
  // HUD 칸 모양: 기지에서 실제로 사서 채운다
  await toBase();
  await page.keyboard.press('KeyP'); await wait(300);
  await page.click('#shopCats [data-cat="all"]'); await wait(150);
  for (const id of ['doransBlade', 'healthPotion', 'healthPotion', 'longSword', 'berserkersGreaves']) { await page.click(`#shopGrid .shop-tile[data-id="${id}"]`, { button: 'right' }); await wait(80); }
  await page.keyboard.press('KeyP'); await wait(300);
  await page.screenshot({ path: path.join(shotDir, 'hud_items.png'), clip: { x: 0, y: 900 - 130, width: 1440, height: 130 } });
  r.hudSlots = await page.$$eval('#hudItems .hud-item', (els) => els.map((e) => e.querySelector('.key').textContent));
  // 37차: 설정의 골드 +10000 버튼, 같은 전설급 중복 구매 막기, 서포터 업그레이드는 세계의 결실이 있을 때만
  await toBase(); await page.evaluate(() => { window.controller.gold = 0; });
  await page.evaluate(() => document.getElementById('addGoldBtn').click()); await wait(100);
  r.goldButton = await page.evaluate(() => ({ gold: window.controller.gold, hud: document.getElementById('goldAmount').textContent }));
  await page.evaluate(() => document.getElementById('addGoldBtn').click()); await wait(100);
  r.goldButtonTwice = await page.evaluate(() => window.controller.gold);
  await page.keyboard.press('KeyP'); await wait(300);
  await page.click('#shopCats [data-cat="legendary"]'); await wait(150);
  await page.click('#shopGrid .shop-tile[data-id="infinityEdge"]', { button: 'right' }); await wait(150);
  await page.click('#shopGrid .shop-tile[data-id="infinityEdge"]', { button: 'right' }); await wait(150);
  r.legendaryOnce = await page.evaluate(() => window.controller.items.filter((s) => s.id === 'infinityEdge').length);
  await page.click('#shopGrid .shop-tile[data-id="infinityEdge"]'); await wait(150);
  r.legendaryButton = (await page.textContent('#shopDetail .sd-buy')).trim();
  await page.click('#shopCats [data-cat="support"]'); await wait(150);
  r.supportTabNoBounty = await page.$$eval('#shopGrid .shop-tile', (els) => els.map((e) => e.dataset.id));
  await page.evaluate(() => { const c = window.controller; c.items = [{ id: 'bountyOfWorlds', count: 1, charges: 4 }]; });
  await wait(500);
  r.supportTabWithBounty = await page.$$eval('#shopGrid .shop-tile', (els) => els.map((e) => e.dataset.id));
  await page.click('#shopGrid .shop-tile[data-id="dreamMaker"]', { button: 'right' }); await wait(300);
  r.upgradedTo = await page.evaluate(() => window.controller.items.map((s) => s.id));
  r.upgradeRowGone = await page.$$eval('#shopGrid .shop-tile', (els) => !els.some((e) => e.dataset.id === 'bloodsong'));
  await page.screenshot({ path: path.join(shotDir, 'shop_support.png') });
  await page.keyboard.press('KeyP');
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
