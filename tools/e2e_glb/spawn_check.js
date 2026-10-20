// 리스폰·귀환 위치 점검(헤드리스 Chromium + 저장소 모델, 25차): 플레이어가 죽으면 자기 팀 우물(원작 출현 지점)에서
// 되살아나는지, 귀환(B)도 같은 곳으로 가는지, 레드 팀이면 레드 우물로 가는지, 카메라가 바로 따라오는지 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/spawn_check.js [스크린샷.png]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  if (process.argv[2]) await page.evaluate(() => { window.__e2eShowMap = true; });
  await page.evaluate((v) => { const s = document.getElementById('libraryChampSelect'); s.value = v; s.dispatchEvent(new Event('change')); }, 'garen'); /* 85차: 숨겨진 선택 상자 */
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  // 플레이어 위치와 각 팀 우물(분수 포탑)·원작 출현 지점 사이 거리(LoL 단위)
  const where = () => page.evaluate(() => {
    const E = window.__e2e, c = window.controller, p = c.root.position;
    const lol = (a, b) => Math.round(E.worldDistanceToLol(Math.hypot(a.x - b.x, a.z - b.z)));
    const well = (team) => E.getWorldPosition(E.turrets.find((t) => t.type === 'nexusWell' && t.team === team));
    const cam = E.cameraRig.followPos;
    return { state: c.state, toBlueSpawn: lol(p, E.getTeamSpawnPosition('BLUE')), toRedSpawn: lol(p, E.getTeamSpawnPosition('RED')),
      toBlueWell: lol(p, well('BLUE')), toRedWell: lol(p, well('RED')), inBlueBase: E.isPositionInBaseZone(p, 'BLUE'), inRedBase: E.isPositionInBaseZone(p, 'RED'),
      cameraToPlayer: lol(cam, p), hpFull: c.hp === c.maxHp };
  });
  const kill = () => page.evaluate(() => { const c = window.controller; c.root.position.set(0, 0, 0); c.statusEffects = []; c.shield = 0; c.takeDamage(1e7, { isChampion: true }, 'TRUE'); return c.state; });
  const r = {};
  r.before = await where();
  r.deadState = await kill();
  // 83차: 칼바람 부활 대기는 레벨별(3레벨 11초) - 그 시간 + 여유만큼 기다린다
  const respawnWait = async () => { const ms = await page.evaluate(() => Math.max(0, (window.controller._respawnAt || 0) - performance.now())); await page.waitForTimeout(ms + 600); };
  await respawnWait();
  r.blueRespawn = await where();
  await page.evaluate(() => { const c = window.controller; c.root.position.set(0, 0, 0); c.setState('IDLE'); c._returnToLocomotion(); });
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(4400);
  r.blueRecall = await where(); // 83차: 칼바람에는 귀환이 없다 - 제자리(IDLE)여야 맞다
  r.noRecallInAram = r.blueRecall.state !== 'RECALL' && !r.blueRecall.inBlueBase;
  if (process.argv[2]) { await page.waitForTimeout(800); await page.screenshot({ path: process.argv[2] }); }
  await page.evaluate(() => { window.controller.team = 'RED'; });
  await page.waitForTimeout(1500);
  r.redDeadState = await kill();
  await respawnWait();
  r.redRespawn = await where();
  await page.evaluate(() => { window.controller.team = window.__e2e.PLAYER_TEAM; });
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
