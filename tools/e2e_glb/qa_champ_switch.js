// QA(89차 점검 목록 1·5): 챔피언 교체·재선택 후 상태 일관성, 룬·소환사 주문 유지 여부를 숫자로 확인한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_champ_switch.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { // 이벤트 리스너 수를 센다(교체 때마다 늘면 중복 등록)
    window.__listeners = {};
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, o) { const k = (this === window ? 'window' : this === document ? 'document' : (this.id || this.tagName || 'other')) + ':' + type; window.__listeners[k] = (window.__listeners[k] || 0) + 1; return orig.call(this, type, fn, o); };
  });
  await page.goto(`http://127.0.0.1:${port}/index.html?nolobby`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => {
    const prev = await page.evaluate(() => window.controller || null ? window.controller.__qaId = (window.__qaN = (window.__qaN || 0) + 1) : 0);
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction(([id, prev]) => window.controller && window.controller.championId === id && window.controller.__qaId !== prev, [id, prev], { timeout: 60000 });
    await page.waitForTimeout(1200);
  };
  const snap = () => page.evaluate(() => {
    const c = window.controller, E = window.__e2e;
    let meshes = 0, objs = 0; E.scene.traverse((o) => { objs++; if (o.isMesh || o.isSprite || o.isPoints || o.isLine) meshes++; });
    const domBars = document.querySelectorAll('.champBar, #enemyLabel, .enemyLabel').length;
    const ownStates = Object.keys(c).filter((k) => /^_(nilah|yone|renekton|chogath|morde|sett|garen|darius|leesin|yasuo|masteryi|vex|ahri|ashe|varus|ezreal|lux|rammus|nautilus)$/.test(k) && c[k]);
    return {
      champ: c.championId, state: c.state, key: c.currentActionKey, phase: c.currentPhase, target: !!c.currentTarget, pendingCast: !!c.pendingCast, pendingMove: !!c.pendingMove,
      attackMove: !!c._attackMoveDest, ccBuf: !!c._ccBufferedMove, dash: !!c._dashState, timers: (c._actionTimers || []).length,
      hp: Math.round(c.hp), maxHp: Math.round(c.maxHp), mp: Math.round(c.mp), maxMp: Math.round(c.maxMp), level: c.champLevel, exp: c.currentExp,
      cds: JSON.stringify(c.cooldowns), status: (c.statusEffects || []).map((s) => s.id), shield: c.shield, shields: (c.shields || []).length,
      gold: Math.round(c.gold), items: (c.items || []).map((i) => i && i.id), boots: c.boots && c.boots.id, trinket: c.trinket && c.trinket.id,
      sizeMods: JSON.stringify(c._sizeMods || {}), sizeScale: c._sizeScale, bonusMaxHp: c.bonusMaxHp, bonusAD: c.bonusAD, bonusAP: c.bonusAP,
      summoners: JSON.stringify(Object.fromEntries(Object.entries(c.summoners || {}).map(([k, v]) => [k, [v.id, Math.max(0, Math.round(v.readyAt - performance.now()))]]))),
      runePage: c.runePage ? c.runePage.keystone + '/' + (c.runePage.shards || []).join(',') : null, runeAD: c.runeAD, runeHp: c.runeHp, ad: +c.stats.attackDamage.toFixed(1), statHp: Math.round(c.maxHp),
      ownStates: ownStates.join(','), score: JSON.stringify(c.score),
      sceneObjs: objs, sceneMeshes: meshes, vfx: (E.vfx && E.vfx.active ? E.vfx.active.length : (E.vfx && E.vfx.effects ? E.vfx.effects.length : null)), projectiles: E.projectiles && E.projectiles.list ? E.projectiles.list.length : null,
      domBars, hudIcons: ['portraitBox', 'slotP', 'slotQ', 'slotR'].map((id) => { const el = document.getElementById(id); return el ? (el.style.backgroundImage || '').replace(/.*icons?\/?/, '').slice(-24) : 'none'; }).join(' '),
      listeners: Object.entries(window.__listeners).filter(([k]) => /keydown|keyup|mousedown|contextmenu|pointer/.test(k)).map(([k, v]) => k + '=' + v).join(' '),
      dummies: E.dummies.length,
    };
  });
  const R = {};
  await load('garen'); R.garen1 = await snap();
  // 상태를 어지럽힌다: 아이템·골드, 레벨, 쿨다운, 상태 효과, 보호막, 소환사 주문, 룬 페이지, 공격 명령
  await page.evaluate(() => {
    const c = window.controller, E = window.__e2e;
    c.gold = 5000; window.buildOrBuyItemForE2E(c, 'longSword'); window.buildOrBuyItemForE2E(c, 'doransBlade'); window.buildOrBuyItemForE2E(c, 'boots');
    c.champLevel = 9; c.recomputeStats();
    c.cooldowns.Q = 5; c.cooldowns.R = 50;
    E.applyStatus(c, { id: 'qaSlow', type: 'SLOW', duration: 30, value: 0.3 });
    if (typeof addShield !== 'undefined') addShield(c, 'qa', 100, 30);
    E.setSummonerSpell(c, 'D', 'ghost'); E.setSummonerSpell(c, 'F', 'ignite');
    c.summoners.D.readyAt = performance.now() + 60000;
    c.selectTarget(E.dummies[0]);
  });
  await page.evaluate(() => window.runeSetPage && window.runeSetPage(window.controller, (() => { const p = window.runePageFor('garen'); p.shards = ['as', 'adaptive', 'hp']; return p; })()));
  R.garenDirty = await snap();
  await load('nilah'); R.nilah = await snap();
  // 닐라 상태를 만들고 R 도중 교체
  await page.evaluate(() => { const c = window.controller; c.castAbility('W'); c.castAbility('R'); });
  await page.waitForTimeout(300);
  R.nilahMid = await snap();
  await load('chogath'); await page.evaluate(() => { const c = window.controller; c._chogath && (c._chogath.feastStacks = 6); if (window.chogathFeastBonus) {} c.recomputeStats && c.recomputeStats(); });
  await page.evaluate(() => { const c = window.controller, E = window.__e2e; c.castAbility('R', E.getWorldPosition(E.dummies[0]).clone()); });
  await page.waitForTimeout(400);
  R.chogathDirty = await snap();
  await load('renekton'); await page.evaluate(() => { const c = window.controller; c.mp = 100; c.castAbility('R'); });
  await page.waitForTimeout(400); R.renektonR = await snap();
  await load('garen'); R.garen2 = await snap();
  await load('garen'); R.garen3 = await snap(); // 같은 챔피언 재선택
  for (let i = 0; i < 3; i++) { await load(i % 2 ? 'garen' : 'yone'); }
  R.after5 = await snap();
  await page.evaluate(() => { const c = window.controller; c.hp = 1; window.__e2e.applyDamage(c, { rawDamage: 99999, damageType: 'TRUE', isCritical: false, critMultiplier: 1 }); });
  await page.waitForTimeout(500);
  R.deadBefore = await page.evaluate(() => ({ state: window.controller.state, hp: window.controller.hp, respawnAt: !!window.controller._respawnAt }));
  await load('ashe'); await page.waitForTimeout(500); R.afterDeadSwitch = await snap();
  R.afterDeadSwitch.respawnAt = await page.evaluate(() => window.controller._respawnAt || 0);
  // 키 한 번 = 시전 한 번인지(리스너 중복 확인)
  R.keyPress = await page.evaluate(async () => {
    const c = window.controller; let n = 0; const o = c.castAbility.bind(c); c.castAbility = (...a) => { n++; return o(...a); };
    c.cooldowns.Q = 0; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200)); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'q', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200)); return n;
  });
  // 버려진 컨트롤러가 아직 돌고 있는지(이전 컨트롤러 객체가 허수아비를 때리는지)
  console.log(JSON.stringify({ R, errors }, null, 1));
  await browser.close(); srv.close();
})();
