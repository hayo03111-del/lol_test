// 58차 아이템 이동 속도·공격 속도 점검(헤드리스 Chromium + 저장소 모델): 이동 속도·공격 속도를 주는 아이템을 하나씩 사서
// 실제 값 = 원작 공식(공속: 기본 + 공속 계수 × (레벨 성장 + 추가 공속%), 이속: (기본 + 신발 고정 + 고정 버프) × (1 + %))인지.
// 예전엔 고정 이동 속도 버프(요우무 유령검 +20 등)를 LoL 단위 그대로 world 속도에 더해 이동 속도가 1458까지 치솟았다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/item_speed_check.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(async () => {
    const E = window.__e2e, c = window.controller, ITEMS = window.__itemData, bad = [], checked = [];
    const ids = Object.keys(ITEMS).filter((id) => { const s = ITEMS[id].stats || {}; return s.attackSpeedPercent || s.moveSpeedPercent || s.moveSpeed; });
    for (const id of ids) {
      const sp = E.getTeamSpawnPosition(E.PLAYER_TEAM); c.root.position.set(sp.x, 0, sp.z);
      c.gold = 99999; c.items = []; c.boots = null; c.statusEffects = []; c.runePage = null;
      window.recomputeItemStats(c); c.recomputeStats();
      window.buildOrBuyItemForE2E(c, id);
      await new Promise((res) => setTimeout(res, 250));
      const st = c.stats, s = ITEMS[id].stats || {};
      const ratio = st.attackSpeedRatio || st.baseAttackSpeed;
      const expAS = st.baseAttackSpeed + ratio * ((st.levelBonusAttackSpeed || 0) + (s.attackSpeedPercent || 0) + (typeof getAttackSpeedBuffPercent === 'function' ? 0 : 0));
      const flatBuff = (c.statusEffects || []).filter((e) => e.type === 'MS_BUFF_FLAT' && e.expiresAt > performance.now()).reduce((m, e) => Math.max(m, e.value), 0);
      const baseLol = E.worldDistanceToLol(st.championBaseMoveSpeed) + (s.moveSpeed || 0);
      const expMS = (baseLol + flatBuff) * (1 + (s.moveSpeedPercent || 0));
      const as = window.getFinalAttackSpeed(st), ms = E.worldDistanceToLol(window.getFinalMoveSpeed(st));
      const line = `${id}: AS ${as.toFixed(3)} (exp ${expAS.toFixed(3)}) MS ${Math.round(ms)} (exp ${Math.round(expMS)})`;
      checked.push(line);
      if (Math.abs(as - expAS) > 0.02 || Math.abs(ms - expMS) > 3) bad.push(line);
    }
    return { checked: checked.length, bad, youmuu: checked.find((l) => l.startsWith('youmuusGhostblade')) };
  });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
