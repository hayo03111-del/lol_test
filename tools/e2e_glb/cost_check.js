// 시전 조건 점검(31차): 챔피언마다 Q/W/E/R을 (1) 기절 중 (2) 침묵 중 (3) 대상 지정 스킬인데 대상이 없을 때 써 보고,
// (4) 마나·기력 0일 때 써 보고, 실제로 나갔는지(재사용 대기시간·마나 변화·행동 시작)를 기록한다.
// 원작은 (1)(2)에서 시전 불가, (3)은 비용 없이 실패, (4)는 비용이 있는 스킬이면 시전 불가.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/cost_check.js [챔피언ID...]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const CHAMPS = ['garen', 'darius', 'masteryi', 'leesin', 'nautilus', 'yasuo', 'yone', 'sett', 'mordekaiser', 'renekton', 'nilah', 'chogath', 'ezreal', 'ashe', 'varus', 'ahri', 'vex', 'rammus'];
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const only = process.argv.slice(2);
  const out = {};
  for (const id of CHAMPS) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(600);
    out[id] = await page.evaluate(() => new Promise((resolve) => {
      const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d0 = E.dummies[0];
      const res = {};
      const reset = () => {
        try { if (c._morde && c._morde.isInDeathRealm) c._mordeEndDeathRealm('cost'); } catch (e) { /* 무시 */ }
        try { if (c._renekton && c._renekton.rActive) c._renektonEndR(); } catch (e) { /* 무시 */ }
        c._clearActionTimers && c._clearActionTimers();
        c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.pendingMove = null; c.pendingCast = null; c.currentTarget = null; c.attackOrderActive = false; c._dashState = null; c._approachCast = null;
        c.setState('IDLE'); c.statusEffects = []; c.hp = c.maxHp; c.mp = c.maxMp; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
        c.root.position.set(0, 0, 0);
        for (const d of E.dummies) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d.mesh.position.set(40, 0, 40); }
      };
      const tryCast = (slot, mode) => {
        reset();
        if (mode === 'stun') E.applyStatus(c, { id: 'cost_stun', type: 'STUN', duration: 3, value: 1 });
        if (mode === 'silence') E.applyStatus(c, { id: 'cost_sil', type: 'SILENCE', duration: 3, value: 1 });
        if (mode === 'noMana') c.mp = 0;
        if (mode !== 'noTarget') { d0.mesh.position.set(0, 0, -L(200)); c.currentTarget = d0; }
        const mp0 = c.mp, hp0 = c.hp;
        const point = mode === 'noTarget' ? new E.THREE.Vector3(L(3000), 0, L(3000)) : E.getWorldPosition(d0).clone();
        try { c.castAbility(slot, point); } catch (e) { return { err: e.message.slice(0, 120) }; }
        return { cd: +(c.cooldowns[slot] || 0).toFixed(2), mpSpent: Math.round(mp0 - c.mp), hpSpent: Math.round(hp0 - c.hp), action: c.currentActionKey || null, dummyHp: d0.hp < 1e6 };
      };
      for (const slot of ['Q', 'W', 'E', 'R']) {
        res[slot] = { stun: tryCast(slot, 'stun'), silence: tryCast(slot, 'silence') };
        const spec = typeof skillAimSpec === 'function' ? null : null; void spec;
        res[slot].noTarget = tryCast(slot, 'noTarget');
        res[slot].noMana = tryCast(slot, 'noMana');
      }
      reset();
      resolve(res);
    }));
    out[id].errors = errors;
    await page.close();
  }
  console.log(JSON.stringify(out));
  await browser.close(); srv.close();
})();
