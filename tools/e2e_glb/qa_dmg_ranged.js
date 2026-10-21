// 91차 QA(스킬 피해 점검 - 원거리 그룹): 이즈리얼·애쉬·바루스·아리·럭스 스킬 피해를 실제 시전 경로로 재고 데이터 공식과 비교한다.
// 랭크 1·최고 랭크 × (방어력/마저 0, 100/100) - 허수아비 한 명을 가까이(칼바람 원거리 감소 밖) 두고 잰다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_dmg_ranged.js [챔피언ID...] → JSON
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const ALL = ['ezreal', 'ashe', 'varus', 'ahri', 'lux'];
(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errors = [];
    await page.addInitScript(() => { try { localStorage.setItem('lolsim.options.v1', JSON.stringify({ autoAttack: false })); } catch (e) {} });
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 220)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const E = window.__e2e, L = E.lolRangeToWorld;
      window.__q = {
        reset(rank, res, dist) {
          const c = window.controller;
          c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.currentTarget = null; c.pendingMove = null; c.pendingCast = null;
          c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.hp = c.maxHp; c.mp = c.maxMp; c.statusEffects = [];
          c.skillLevels = rank === 'max' ? { Q: 5, W: 5, E: 5, R: 3 } : { Q: 1, W: 1, E: 1, R: 1 };
          c.root.position.set(0, 0, 0); c.setState('IDLE'); c.root.rotation.y = Math.PI;
          if (c._ashe) { c._ashe.focusStacks = 4; c._ashe.flurryPending = false; }
          if (c._lux && c._lux.marks) c._lux.marks.clear();
          if (c._ezreal) { c._ezreal.markTarget = null; }
          const ds = E.dummies;
          ds.forEach((d, i) => { d.hp = d.maxHp = 1e5; d.statusEffects = []; d.attackDamage = 0; d.armor = res; d.magicResist = res; if (d.stats) { d.stats.armor = res; d.stats.magicResist = res; } d.mesh.position.set(i === 0 ? 0 : 40 * i, 0, i === 0 ? -L(dist) : 40); });
          for (const m of E.minions) { m.hp = 0; m.isDead = true; m.destroyed = true; if (m.mesh) m.mesh.visible = false; }
        },
        dmg() { const d = E.dummies[0]; return +(d.maxHp - d.hp).toFixed(2); },
        info() { const c = window.controller; return { ad: c.stats.attackDamage, bad: c._getBonusAD(), ap: c.stats.abilityPower || 0, lvl: c.champLevel, crit: c.stats.critChance || 0 }; },
        cast(slot) { const c = window.controller; c.castAbility(slot, E.getWorldPosition(E.dummies[0]).clone()); },
      };
    });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const wait = (ms) => page.waitForTimeout(ms);
    const res = { rows: [], errors };
    const measure = async (label, rank, r, dist, steps) => {
      await ev(({ rank, r, dist }) => window.__q.reset(rank, r, dist), { rank, r, dist });
      await wait(200);
      for (const s of steps) {
        if (s.cast) await ev((x) => window.__q.cast(x), s.cast);
        if (s.fn) await ev(s.fn);
        if (s.wait) await wait(s.wait);
      }
      const row = Object.assign({ label, rank, res: r, dmg: await ev(() => window.__q.dmg()) }, await ev(() => window.__q.info()));
      res.rows.push(row);
    };
    const plans = {
      ezreal: [
        ['Q', 400, [{ cast: 'Q', wait: 1500 }]],
        ['E', 500, [{ cast: 'E', wait: 1800 }]],
        ['W+Q(폭발 포함)', 400, [{ cast: 'W', wait: 1200 }, { fn: () => { window.controller.cooldowns.Q = 0; } }, { cast: 'Q', wait: 1500 }]],
        ['R', 600, [{ cast: 'R', wait: 3500 }]],
      ],
      ashe: [
        ['W', 400, [{ cast: 'W', wait: 1500 }]],
        ['R', 600, [{ cast: 'R', wait: 2500 }]],
      ],
      varus: [
        ['Q(최소 충전)', 500, [{ cast: 'Q', wait: 60 }, { cast: 'Q', wait: 1600 }]],
        ['Q(최대 충전)', 500, [{ cast: 'Q', wait: 1700 }, { cast: 'Q', wait: 1600 }]],
        ['E', 500, [{ cast: 'E', wait: 1800 }]],
        ['R', 500, [{ cast: 'R', wait: 2500 }]],
      ],
      ahri: [
        ['Q(왕복)', 400, [{ cast: 'Q', wait: 2500 }]],
        ['W', 300, [{ cast: 'W', wait: 3000 }]],
        ['E', 400, [{ cast: 'E', wait: 1500 }]],
        ['R(1회)', 700, [{ cast: 'R', wait: 2000 }]],
      ],
      lux: [
        ['Q(+광채 없음)', 500, [{ cast: 'Q', wait: 1800 }]],
        ['E(재시전 폭발)', 500, [{ cast: 'E', wait: 1200 }, { cast: 'E', wait: 800 }]],
        ['R', 600, [{ cast: 'R', wait: 2000 }]],
      ],
    };
    for (const [label, dist, steps] of plans[id] || []) {
      for (const rank of ['1', 'max']) for (const r of [0, 100]) await measure(label, rank, r, dist, steps);
    }
    out[id] = res;
    await page.close();
    process.stderr.write(`done ${id}\n`);
  }
  console.log(JSON.stringify(out));
  await browser.close(); srv.close();
})();
