// QA(체크리스트 7): "게임 초기화" 경로가 미니언·허수아비·구조물·타이머까지 돌려놓는지.
// 이 게임에는 전용 초기화 기능이 없어서, 초기화에 가장 가까운 두 경로(로비/라이브러리로 다른 챔피언 고르기, 같은 챔피언 다시 고르기)에서
// 게임을 한참 진행한 상태(게임 시각·미니언 웨이브·포탑 피해/파괴·허수아비 이동/피해·골드/아이템/레벨·사망·와드·날아가는 투사체)를 만든 뒤
// 무엇이 처음 상태로 돌아가고 무엇이 남는지 기록한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_reset_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id && !document.querySelector('#loadingOverlay.show, .loading.show'), id, { timeout: 60000 }); await page.waitForTimeout(800); };
  const snap = () => page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    const r2 = (x) => Math.round(x * 100) / 100;
    return {
      champ: c.championId, ctrlId: c.__qaId || (c.__qaId = Math.random().toString(36).slice(2, 7)),
      gameTimeSec: r2(E.getTurretGameTimeSec()),
      minionsAlive: E.minions.filter((m) => !m.isDead && m.hp > 0).length,
      turrets: E.turrets.filter((t) => t.type !== 'NEXUS_WELL').map((t) => `${t.team[0]}${(t.type || '').slice(0, 5)}:${Math.round(t.hp)}/${Math.round(t.maxHp)}${t.destroyed || t.hp <= 0 ? 'X' : ''}`).join(' '),
      inhib: E.inhibitorBuildings.map((b) => `${Math.round(b.hp)}${b.destroyed ? 'X' : ''}`).join(','), nexus: E.nexusBuildings.map((b) => Math.round(b.hp)).join(','),
      dummies: E.dummies.map((d) => `${Math.round(d.hp)}/${Math.round(d.maxHp)}@${r2(d.mesh.position.x)},${r2(d.mesh.position.z)}`).join(' '),
      level: c.champLevel, exp: Math.round(c.currentExp || 0), gold: Math.round(c.gold || 0), items: (c.items || []).filter(Boolean).map((i) => i.id || i).join(','),
      hp: Math.round(c.hp), maxHp: Math.round(c.maxHp), state: c.state, respawnAt: c._respawnAt ? Math.round((c._respawnAt - performance.now()) / 100) / 10 : null,
      cooldowns: JSON.stringify(Object.fromEntries(Object.entries(c.cooldowns || {}).map(([k, v]) => [k, r2(v)]))),
      score: JSON.stringify(c.score || null),
      wards: E.wardSystem ? E.wardSystem.wards.filter((w) => !w.destroyed).length : null,
      projectiles: E.projectiles.projectiles.length,
      pos: [r2(c.root.position.x), r2(c.root.position.z)],
    };
  });
  const r = {};
  await load('ezreal');
  r.fresh = await snap();
  // 진행: 게임 시각 130초로, 웨이브가 나오게 기다림
  await page.evaluate(() => { window.__e2e.setGameTimeSec(130); });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    // 포탑 하나 피해, 하나 파괴
    const ts = E.turrets.filter((t) => t.type !== 'NEXUS_WELL');
    ts[0].hp = Math.round(ts[0].maxHp * 0.4);
    E.applyDamageToTurret(ts[1], { rawDamage: 1e7, damageType: 'TRUE' }, { source: c });
    // 허수아비 이동·피해
    E.dummies[0].mesh.position.set(3, 0, 3); E.dummies[0].hp = E.dummies[0].maxHp * 0.3;
    // 골드·아이템·레벨·쿨다운·와드
    c.gold = (c.gold || 0) + 5000;
    try { window.buildOrBuyItemForE2E(c, 'longsword'); } catch (e) {}
    c.champLevel = 9; c.recomputeStats();
    c.cooldowns.Q = 3; c.cooldowns.R = 80;
    if (E.placeWard) E.placeWard(c, c.root.position.clone().add(new E.THREE.Vector3(1, 0, 1)));
    // 날아가는 투사체: 이즈리얼 R을 허수아비 쪽으로
    c.cooldowns.R = 0; c.mp = c.maxMp;
    c.castAbility('R', E.getWorldPosition(E.dummies[1]).clone());
  });
  await page.waitForTimeout(400);
  r.played = await snap();
  // 경로 1: 다른 챔피언 고르기
  await page.evaluate(() => { window.__qaDummyHpWatch = []; });
  await load('garen');
  r.afterSwapChampion = await snap();
  await page.waitForTimeout(2500); // 날아가던 이즈리얼 R이 새 허수아비를 때리는지
  r.afterSwap2_5s = await snap();
  // 경로 2: 같은 챔피언 다시 고르기
  await page.evaluate(() => { const c = window.controller; c.cooldowns.Q = 5; c.hp = c.maxHp * 0.5; window.__e2e.dummies[0].hp = 10; });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(2500);
  r.afterReselectSame = await snap();
  // 경로 3: 로비 "게임 시작"(같은 챔피언)
  await page.evaluate(() => { const b = document.getElementById('openLobbyBtn'); if (b) b.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (window.lobbyState) window.lobbyState.champ = 'garen'; const s = document.getElementById('lobbyStartBtn'); if (s) s.click(); });
  await page.waitForTimeout(2000);
  r.afterLobbyStartSame = await snap();
  // 경로 4(90차): 설정 → "게임 다시 시작"(resetGame). 다시 한참 진행한 뒤 누른다.
  await page.evaluate(() => { window.__e2e.setGameTimeSec(200); });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const E = window.__e2e, c = window.controller;
    const ts = E.turrets.filter((t) => t.type !== 'NEXUS_WELL');
    ts[0].hp = Math.round(ts[0].maxHp * 0.3); E.applyDamageToTurret(ts[2], { rawDamage: 1e7, damageType: 'TRUE' }, { source: c });
    E.dummies[0].mesh.position.set(3, 0, 3); E.dummies[0].hp = 5; c.gold += 3000; c.champLevel = 11; c.recomputeStats(); c.cooldowns.R = 50;
    if (E.placeWard) E.placeWard(c, c.root.position.clone().add(new E.THREE.Vector3(1, 0, 1)));
    c.score.kills = 4;
  });
  r.beforeRestart = await snap();
  page.on('dialog', (d) => d.accept());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('#optRestartBtn');
  await page.waitForFunction(() => window.controller && window.controller.champLevel === 3 && window.controller.gold <= 1400, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  r.afterRestart = await snap();
  r.afterRestart.wavesScheduled = await page.evaluate(() => window.__e2e.minions.length);
  await page.waitForTimeout(3000);
  r.afterRestart3s = await snap();
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
