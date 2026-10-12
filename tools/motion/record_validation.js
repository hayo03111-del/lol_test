// 스킬별 게임 판정 타이밍 측정(헤드리스 Chromium). 기존 E2E 서버(tools/e2e_glb/server.js)를 재사용한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three@0.160.0 package 폴더> node tools/motion/record_validation.js [챔피언ID...]
// 측정 해상도 240x135(swiftshader에서 약 46fps - 게임 시간이 실제 시간과 같아지는 조건. 1280x720은 9fps라
// 게임 루프의 프레임당 0.05초 제한 때문에 게임 시간이 실제의 0.45배로 흐른다). GLB는 저장소에 넣지 않는다.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('../e2e_glb/server.js');
const cases = [['ezreal', '이즈리얼', 'Q'], ['garen', '가렌', 'R'], ['darius', '다리우스', 'R'], ['ashe', '애쉬', 'W'], ['chogath', '초가스', 'Q'], ['sett', '세트', 'W']];
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const out = {};
  for (const [id, kr, slot] of cases) {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 }, recordVideo: { dir: (process.env.REC_DIR || path.join(__dirname, 'rec')), size: { width: 480, height: 270 } } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.setInputFiles('#glbFileInput', { name: kr + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR || path.join(__dirname, 'glb'), kr + '.glb')) });
    await page.waitForFunction(() => window.controller && window.controller.championId, null, { timeout: 30000 });
    await page.evaluate(() => { const c = window.controller, d = window.__e2e.dummies[0]; d.hp = d.maxHp = 3000; const dp = window.__e2e.getWorldPosition(d); c.root.position.set(dp.x, 0, dp.z + window.__e2e.lolRangeToWorld(150)); c.mp = c.maxMp; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 }; });
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    await page.waitForTimeout(1500);
    const r = await page.evaluate((slot) => new Promise((resolve) => {
      const c = window.controller, d = window.__e2e.dummies[0];
      const log = []; const V = window.__e2e.vfx;
      const o = V.spawn.bind(V); V.spawn = (n, ...a) => { log.push({ k: 'vfx:' + n, t: performance.now() }); return o(n, ...a); };
      const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;'; ov.style.setProperty('visibility', 'visible', 'important');
      document.body.appendChild(ov); const tSync = performance.now();
      setTimeout(() => ov.remove(), 120);
      setTimeout(() => {
        const tCast = performance.now(); const hp0 = d.hp; let tDmg = null;
        c.currentTarget = d; c.castAbility(slot, window.__e2e.getWorldPosition(d).clone()); c.currentTarget = null;
        const iv = setInterval(() => { if (tDmg == null && d.hp < hp0) tDmg = performance.now(); }, 8);
        setTimeout(() => { clearInterval(iv); resolve({ castAfterSyncMs: Math.round(tCast - tSync), damageAfterSyncMs: tDmg == null ? null : Math.round(tDmg - tSync), events: log.map((e) => ({ k: e.k, afterSyncMs: Math.round(e.t - tSync) })) }); }, 2500);
      }, 1000);
    }), slot);
    r.errors = errors; r.video = path.basename(await page.video().path());
    await ctx.close();
    out[`${id}_${slot}`] = r;
  }
  fs.writeFileSync(path.join(process.env.OUT_DIR || path.join(__dirname, '../../docs/motion'), 'validation_recording_log.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})();
