// 챔피언 GLB를 실제 UI(#glbFileInput)로 불러와 평타/Q/W/E/R을 실행하고, 재생된 애니메이션 클립과
// 피해/쿨다운/콘솔 오류를 JSON으로 출력한다.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const startServer = require('./server.js');
// 사용법: GLB_DIR=<챔피언.glb 폴더> node tools/e2e_glb/run.js [챔피언이름...]
// GLB 파일명(예: 노틸러스.glb)이 그대로 챔피언 자동 식별에 쓰인다.
const GLB_DIR = process.env.GLB_DIR || path.join(__dirname, 'glb');
const CHAMPS = process.argv.slice(2).length ? process.argv.slice(2) : require('fs').readdirSync(GLB_DIR).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = {};
  for (const name of CHAMPS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|communitydragon|ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.setInputFiles('#glbFileInput', { name: name + '.glb', mimeType: 'model/gltf-binary', buffer: require('fs').readFileSync(path.join(GLB_DIR, name + '.glb')) });
    try { await page.waitForFunction(() => window.controller && window.controller.championId, null, { timeout: 30000 }); }
    catch (e) { report[name] = { error: 'controller not ready', errors }; await page.close(); continue; }
    const info = await page.evaluate(() => {
      const c = window.controller, ad = c.actionData || {};
      const pick = (k) => ad[k] ? { clips: ad[k].clips, resolved: (c.resolveClip(ad[k].clips || []) || {}).name || null } : null;
      return { championId: c.championId, clipCount: (c.clips || []).length, idle: pick('idle'), move: pick('move'), attack1: pick('attack1'), q: pick('q'), w: pick('w'), e: pick('e'), rCast: pick('rCast'), hasRChannel: !!ad.hasRChannel };
    });
    // 플레이어를 더미 앞에 세우고 대상 지정
    const steps = [];
    const runStep = async (label, fnSrc, waitMs) => {
      const before = await page.evaluate(() => { const d = window.__e2e.dummies[0]; return { hp: d.hp, mp: window.controller.mp, shield: window.controller.shield }; });
      await page.evaluate(fnSrc);
      const clips = new Set();
      const t0 = Date.now();
      while (Date.now() - t0 < waitMs) { const k = await page.evaluate(() => window.controller.currentClipKey + '|' + (window.controller.currentActionKey || '-')); clips.add(k); await page.waitForTimeout(80); }
      const after = await page.evaluate(() => { const d = window.__e2e.dummies[0]; const c = window.controller; return { hp: d.hp, mp: c.mp, shield: c.shield, state: c.state, action: c.currentActionKey, dummyStatus: (d.statusEffects || []).filter((e) => e.expiresAt > performance.now()).map((e) => e.type), cds: { ...c.cooldowns } }; });
      steps.push({ label, dmgToDummy: +(before.hp - after.hp).toFixed(1), mpUsed: +(before.mp - after.mp).toFixed(1), shieldAfter: +(after.shield || 0).toFixed(1), clips: [...clips], after });
    };
    await page.evaluate(() => {
      const c = window.controller, d = window.__e2e.dummies[0];
      d.hp = d.maxHp = 3000;
      const dp = window.__e2e.getWorldPosition(d);
      c.root.position.set(dp.x, 0, dp.z + window.__e2e.lolRangeToWorld(150));
      c.targetPos = null; c.mp = c.maxMp;
    });
    await runStep('basic attack', () => { const c = window.controller; c.selectTarget(window.__e2e.dummies[0]); }, 2500);
    await page.evaluate(() => { const c = window.controller; c.currentTarget = null; c.targetPos = null; });
    for (const slot of ['Q', 'W', 'E', 'R']) {
      await page.evaluate(() => { const c = window.controller; c.mp = c.maxMp; for (const k of Object.keys(c.cooldowns)) c.cooldowns[k] = 0; });
      await runStep('cast ' + slot, new Function(`const c = window.controller, d = window.__e2e.dummies[0]; const dp = window.__e2e.getWorldPosition(d); c.currentTarget = d; c.castAbility('${slot}', dp.clone ? dp.clone() : new window.__e2e.THREE.Vector3(dp.x, 0, dp.z));`), 3000);
      if (slot === 'Q') await page.screenshot({ path: path.join(process.env.SHOT_DIR || __dirname, `shot_${CHAMPS.indexOf(name)}_Q.png`) });
    }
    report[name] = { info, steps, errors };
    await page.close();
  }
  await browser.close(); srv.close();
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
