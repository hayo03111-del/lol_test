// 52차 로비·룬 점검(헤드리스 Chromium + 저장소 모델): 처음 열면 로비, 챔피언·룬·소환사 주문 고르고 시작 → 그 챔피언·주문·룬 페이지로
// 게임 시작, 능력치 파편이 스탯에 들어감, HUD 능력치 칸 3쪽 = 룬, 감전(3회 적중)·정복자(중첩)·집중 공격 효과, 모데카이저 W 재시전 표시,
// 야스오 Q3 그림, 설정의 로비 버튼, 콘솔 오류.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/rune_lobby_check.js [스크린샷 폴더]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const shotDir = process.argv[2] || __dirname;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = {};
  r.lobbyOnLoad = await page.evaluate(() => document.getElementById('lobbyOverlay').classList.contains('show'));
  // 챔피언: 럭스, 주 빌드 지배(감전), 보조 마법, 파편 공격속도/적응형/체력, 주문 점멸·점화
  await page.click('#lobbyChampGrid [data-champ="lux"]');
  await page.click('#lobbyRunes .lb-col:first-child .lb-tree[data-tree="8100"]');
  await page.click('#lobbyRunes .lb-col:first-child [data-rune="8112"]');
  await page.click('#lobbyRunes .lb-col:nth-child(2) .lb-tree[data-tree="8200"]');
  await page.click('#lobbyRunes [data-rune="8210"]'); await page.click('#lobbyRunes [data-rune="8237"]');
  await page.click('#lobbyRunes .lb-shards .lb-row:nth-child(1) [data-shard="as"]');
  await page.click('.lb-spell-slot[data-slot="F"]'); await page.click('.lb-spell[data-spell="ignite"]');
  r.secondaryPick = await page.evaluate(() => lobbyState.page.secondaryRunes.slice());
  await page.screenshot({ path: path.join(shotDir, 'lobby.png') });
  await page.click('#lobbyStartBtn');
  await page.waitForFunction(() => window.controller && window.controller.championId === 'lux', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  r.afterStart = await page.evaluate(() => { const c = window.controller; return { lobbyClosed: !document.getElementById('lobbyOverlay').classList.contains('show'), keystone: c.runePage.keystone, secondary: c.runePage.secondaryRunes, shards: c.runePage.shards, spells: [c.summoners.D.id, c.summoners.F.id], runeAP: c.runeAP, runeAS: c.runeAttackSpeedPercent, ap: c.stats.abilityPower }; });
  // HUD 3쪽 = 룬
  await page.click('#hudStats'); await page.click('#hudStats'); await page.waitForTimeout(300);
  r.hudRunes = await page.evaluate(() => ({ keystoneImg: (document.querySelector('#hudStats .hr-keystone') || {}).getAttribute ? document.querySelector('#hudStats .hr-keystone').getAttribute('src') : null, minors: document.querySelectorAll('#hudStats .hr-minor').length, shards: document.querySelectorAll('#hudStats .hr-shard').length }));
  await page.screenshot({ path: path.join(shotDir, 'hud_runes.png'), clip: { x: 0, y: 900 - 120, width: 760, height: 120 } });
  // 감전: 같은 챔피언(허수아비)에게 3회 적중
  r.electrocute = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    d.hp = d.maxHp = 1e5;
    const hit = () => E.applyDamage(d, { rawDamage: 10, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, source: c });
    // 같은 순간(60ms 안)의 여러 피해는 1회로 친다 - 실제 플레이처럼 간격을 둔다.
    const h0 = d.hp; hit(); return new Promise((res) => setTimeout(() => { hit(); setTimeout(() => { hit(); res({ dealt: Math.round(h0 - d.hp), cd: c._rune.cds.Electrocute > performance.now() }); }, 120); }, 120));
  });
  // 정복자·집중 공격: 페이지를 바꿔 확인
  r.conqueror = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    runeSetPage(c, { primary: 8000, keystone: 8010, rows: [9111, 9104, 8299], secondary: 8400, secondaryRunes: [8444, 8242], shards: ['adaptive', 'adaptive', 'hpScale'] });
    for (let i = 0; i < 6; i++) E.applyDamage(d, { rawDamage: 10, damageType: 'MAGICAL', isCritical: false, critMultiplier: 1, source: c });
    runeTick(c, 0.016);
    return { stacks: c._rune.conquerorStacks, ap: +c.stats.abilityPower.toFixed(1) };
  });
  r.pressTheAttack = await page.evaluate(() => {
    const E = window.__e2e, c = window.controller, d = E.dummies[0];
    runeSetPage(c, { primary: 8000, keystone: 8005, rows: [9111, 9104, 8299], secondary: 8400, secondaryRunes: [8444, 8242], shards: ['adaptive', 'adaptive', 'hpScale'] });
    const h0 = d.hp; runeOnBasicAttackHit(c, d); runeOnBasicAttackHit(c, d); runeOnBasicAttackHit(c, d);
    return { burst: Math.round(h0 - d.hp), exposed: c._rune.exposed.has(d) };
  });
  // 모데카이저 W 재시전 / 야스오 Q3 그림
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'mordekaiser'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'mordekaiser', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  r.mordeW = await page.evaluate(() => { const c = window.controller; c._morde.wShieldActiveUntil = performance.now() + 3000; updateSkillUI(c.cooldowns); const s = document.getElementById('slotW'); return { recast: s.classList.contains('recast'), ring: !!s.querySelector('.recastRing') }; });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'yasuo'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'yasuo', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  r.yasuoQ3 = await page.evaluate(() => { const c = window.controller; c._yasuo.qStacks = 2; c._yasuo.qStackExpiresAt = performance.now() + 4000; updateSkillUI(c.cooldowns); const s = document.getElementById('slotQ'); return { bg: s.style.backgroundImage, label: !!s.querySelector('.slotState') }; });
  await page.waitForTimeout(300);
  r.yasuoLabelAfterFrame = await page.evaluate(() => !!document.querySelector('#slotQ .slotState'));
  // 설정의 로비 버튼
  await page.evaluate(() => document.getElementById('openLobbyBtn').click()); await page.waitForTimeout(200);
  r.lobbyReopen = await page.evaluate(() => ({ open: document.getElementById('lobbyOverlay').classList.contains('show'), champ: lobbyState.champ }));
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
