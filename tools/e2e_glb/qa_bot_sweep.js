// QA(95차): 모든 챔피언을 적 봇으로 하나씩 만들어 플레이어(가렌, 기절·체력 보강)와 싸우게 한 뒤 처치·제거한다.
// 봇 입장에서 각 챔피언 코드가 오류 없이 도는지, 스킬을 쓰고 피해를 주는지, 처치 보상이 들어오는지 본다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_bot_sweep.js  (CHAMPS="garen ahri"로 일부만; 실패 시 종료 코드 1)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 }); await page.waitForTimeout(800);
  const champs = (process.env.CHAMPS || 'garen darius masteryi leesin nautilus yasuo yone sett mordekaiser renekton nilah chogath ezreal ashe varus ahri vex rammus lux').split(' ');
  const res = [];
  for (const ch of champs) {
    errors.length = 0;
    const r = await page.evaluate(async (ch) => {
      const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld;
      if (c.state === 'DEAD' && c._respawn) c._respawn();
      c.itemBonusMaxHp = 60000; c.recomputeStats(); c.hp = c.maxHp; c.statusEffects = []; c.currentTarget = null; c.attackOrderActive = false;
      E.applyStatus(c, { id: 'e2eHold', type: 'STUN', duration: 6.6 });
      const p = c.root.position.clone().add(new T.Vector3(0, 0, L(450)));
      const bot = await E.spawnEnemyBot(ch, { position: p, difficulty: 'hard' });
      bot.skillLevels = { Q: 3, W: 3, E: 3, R: 1 };
      const hp0 = c.hp; const casts = new Set();
      const seq0 = (window.gameSession.events(0).slice(-1)[0] || { seq: 0 }).seq;
      for (let i = 0; i < 16; i++) { await new Promise((r) => setTimeout(r, 400)); for (const k of ['Q','W','E','R']) if (bot.cooldowns[k] > 0) casts.add(k); }
      const bid = window.__e2eEntityId ? window.__e2eEntityId(bot) : null;
      const ev = window.gameSession.events(seq0);
      const myCasts = ev.filter((e) => e.type === 'cast' && e.entityId === bid).map((e) => e.slot).join('');
      const myDmg = Math.round(ev.filter((e) => e.type === 'damage' && e.sourceId === bid && e.targetId === (window.__e2eEntityId ? window.__e2eEntityId(c) : -1)).reduce((a, e) => a + e.amount, 0));
      const out = { ch, casts: myCasts, dmgToPlayer: myDmg, modes: bot.brain.mode, botHp: Math.round(bot.hp), stuckState: bot.state };
      // 플레이어가 봇을 공격해 처치(보상 확인)
      const g0 = c.gold || 0, k0 = (c.score && c.score.kills) || 0;
      bot.hp = 30; c.selectTarget(bot);
      await new Promise((r) => setTimeout(r, 2500));
      out.killed = bot.hp <= 0 || bot.state === 'DEAD'; out.goldGain = Math.round((c.gold || 0) - g0); out.kills = ((c.score && c.score.kills) || 0) - k0;
      E.removeEnemyBot(bot);
      out.removed = !E.enemyBots.includes(bot);
      return out;
    }, ch);
    r.errors = [...new Set(errors)].slice(0, 6);
    res.push(r);
    process.stderr.write(JSON.stringify(r) + '\n');
  }
  const fails = res.filter((x) => x.errors.length || !x.casts || !(x.dmgToPlayer > 0) || !x.removed).map((x) => x.ch);
  console.log(JSON.stringify({ results: res, fails }, null, 1));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
