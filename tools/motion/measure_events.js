// 스킬별 게임 판정 타이밍 측정(헤드리스 Chromium). 기존 E2E 서버(tools/e2e_glb/server.js)를 재사용한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three@0.160.0 package 폴더> node tools/motion/measure_events.js [챔피언ID...]
// 측정 해상도 240x135(swiftshader에서 약 46fps - 게임 시간이 실제 시간과 같아지는 조건. 1280x720은 9fps라
// 게임 루프의 프레임당 0.05초 제한 때문에 게임 시간이 실제의 0.45배로 흐른다). GLB는 저장소에 넣지 않는다.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('../e2e_glb/server.js');
async function withChamp(browser, port, glbName, uploadName, fn) {
  const page = await browser.newPage({ viewport: { width: 240, height: 135 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  await page.setInputFiles('#glbFileInput', { name: uploadName + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR || path.join(__dirname, 'glb'), glbName + '.glb')) });
  await page.waitForFunction(() => window.controller && window.controller.championId, null, { timeout: 30000 });
  await page.evaluate(() => { const c = window.controller, d = window.__e2e.dummies[0]; d.hp = d.maxHp = 3000; const dp = window.__e2e.getWorldPosition(d); c.root.position.set(dp.x, 0, dp.z + window.__e2e.lolRangeToWorld(150)); c.mp = c.maxMp; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 }; });
  const out = await fn(page);
  out.champ = await page.evaluate(() => window.controller.championId);
  out.errors = errors.filter((e) => !/favicon|404/.test(e));
  await page.close();
  return out;
}
const snap = () => { const c = window.controller, d = window.__e2e.dummies[0], dp = window.__e2e.getWorldPosition(d); return `${c.currentClipKey}|${c.currentActionKey || '-'}|${c.state}|hp:${Math.round(d.hp)}|dz:${(c.root.position.z - dp.z).toFixed(2)}|ko:${(d.statusEffects||[]).filter(e=>e.type==='KNOCKUP').length}`; };
const sample = async (page, ms) => { const arr = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { arr.push(await page.evaluate(snap)); await page.waitForTimeout(120); } return arr.filter((v, i) => i === 0 || v.replace(/\|dz:[^|]*/, '') !== arr[i - 1].replace(/\|dz:[^|]*/, '')); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const reset = (page) => ev(page, () => { const c = window.controller; c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.currentTarget = null; c.attackOrderActive = false; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c._returnToLocomotion(); });
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const champs = { garen: '가렌', darius: '다리우스', masteryi: '마스터 이', leesin: '리 신', nautilus: '노틸러스', yasuo: '야스오', yone: '요네',
    sett: '세트', mordekaiser: '모데카이저', renekton: '레넥톤', nilah: '닐라', chogath: '초가스', ezreal: '이즈리얼', ashe: '애쉬', varus: '바루스', ahri: '아리', vex: '벡스' };
  const res = {};
  for (const [id, kr] of Object.entries(champs)) {
    res[id] = await withChamp(browser, port, kr, kr, async (page) => {
      // 측정용 훅: 투사체 생성/시각 효과 호출 시각 기록(게임 로직은 그대로 호출)
      await page.evaluate(() => {
        const log = window.__evlog = [];
        const P = window.__e2e.projectiles, V = window.__e2e.vfx;
        if (P && !P.__hooked) { const o = P.spawn.bind(P); P.spawn = (opt) => { log.push({ k: 'projectile', t: performance.now() }); return o(opt); }; P.__hooked = true; }
        if (V && !V.__hooked) { const o = V.spawn.bind(V); V.spawn = (name, ...a) => { log.push({ k: 'vfx:' + name, t: performance.now() }); return o(name, ...a); }; V.__hooked = true; }
      });
      const out = {};
      for (const slot of ['Q', 'W', 'E', 'R']) {
        await reset(page);
        out[slot] = await page.evaluate((slot) => new Promise((resolve) => {
          const c = window.controller, d = window.__e2e.dummies[0];
          d.hp = d.maxHp; d.statusEffects = []; c.attackOrderActive = false;
          if (c.championId === 'ashe' && slot === 'Q') { c._ashe.focusStacks = 4; c._ashe.focusExpiresAt = performance.now() + 5000; }
          window.__evlog.length = 0;
          const t0 = performance.now(); const hp0 = d.hp;
          c.currentTarget = d;
          c.castAbility(slot, window.__e2e.getWorldPosition(d).clone());
          c.currentTarget = null;
          let dmgAt = null;
          const iv = setInterval(() => {
            const t = performance.now() - t0;
            if (dmgAt == null && d.hp < hp0) dmgAt = t;
            if (t > 3000) {
              clearInterval(iv);
              const ev = window.__evlog.map((e) => ({ k: e.k, ms: Math.round(e.t - t0) })).filter((e) => e.ms >= 0 && e.ms <= 3000);
              const firstProj = ev.find((e) => e.k === 'projectile');
              resolve({ dmgMs: dmgAt == null ? null : Math.round(dmgAt), projectileMs: firstProj ? firstProj.ms : null, events: ev.slice(0, 12) });
            }
          }, 16);
        }), slot);
      }
      return out;
    });
  }
  fs.writeFileSync(path.join(process.env.OUT_DIR || path.join(__dirname, '../../docs/motion'), 'game_timing_events.json'), JSON.stringify(res, null, 1));
  console.log('done', Object.keys(res).length);
  await browser.close(); srv.close();
})();
