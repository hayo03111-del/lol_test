// 저장소 모델 불러오기 점검(헤드리스 Chromium): 시작 화면 챔피언 버튼, 오른쪽 패널 "챔피언 바꾸기", 주소의 ?champ= 로
// assets/champions/<id>.glb 를 불러와 그 챔피언으로 바뀌는지, 17명 모두 파일이 있고 불러와지는지 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/library_check.js [스크린샷.png]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = {};
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  r.entryButtons = await page.evaluate(() => [...document.querySelectorAll('#championLibrary button')].map((b) => b.dataset.champ));
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  // 1) 시작 화면 버튼
  await page.click('#championLibrary button[data-champ="garen"]');
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 30000 });
  r.entryButton = await page.evaluate(() => ({ champ: window.controller.championId, entryHidden: !document.getElementById('glbEntry').classList.contains('show') }));
  // 2) 패널 "챔피언 바꾸기"로 나머지 16명 차례로
  r.panel = {};
  for (const id of r.entryButtons.filter((x) => x !== 'garen')) {
    await page.evaluate((v) => { const s = document.getElementById('libraryChampSelect'); s.value = v; s.dispatchEvent(new Event('change')); }, id); /* 85차: 숨겨진 선택 상자 */
    try { await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); r.panel[id] = true; }
    catch (e) { r.panel[id] = false; }
  }
  // 3) 주소 ?champ=vex
  await page.goto(`http://127.0.0.1:${port}/index.html?champ=vex`, { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.controller && window.controller.championId === 'vex', null, { timeout: 30000 }); r.urlParam = true; } catch (e) { r.urlParam = false; }
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
