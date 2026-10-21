// QA(92차): 점멸 연계 테크 확인 - 요네 Q플(강화 Q 돌진 중 점멸 → 점멸 지점과 원래 돌풍 선 두 곳에서 에어본).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_flash_tech.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 }); await page.waitForTimeout(800); };
  const r = {};
  await load('yone');
  // 요네를 원점 근처에 두고 +Z로 강화 Q. 허수아비 A는 원래 돌풍 선 끝(+Z 800), B는 옆(+X 350, +Z 250)에 둔다.
  // 돌진 시작 직후 B 쪽으로 점멸 → A(돌풍)와 B(점멸 지점 본체) 둘 다 에어본이어야 한다.
  const scenario = (flashDuring) => page.evaluate((flashDuring) => new Promise((res) => {
    const E = window.__e2e, c = window.controller, T = E.THREE, L = E.lolRangeToWorld;
    const [A, B] = E.dummies;
    const base = c.root.position.clone();
    const put = (d, x, z) => { const m = d.mesh || d.root; m.position.set(base.x + L(x), m.position.y, base.z + L(z)); d.hp = d.maxHp; d.statusEffects = []; };
    put(A, 0, 800); put(B, 350, 250);
    c.summoners = { D: { id: 'flash', readyAt: 0 }, F: { id: 'heal', readyAt: 0 } };
    c.skillLevels.Q = 5; c.cooldowns.Q = 0; c._yone.qStacks = 2; c._yone.qStackExpiresAt = performance.now() + 6000;
    c._yoneCastQ(new T.Vector3(base.x, 0, base.z + L(900)), true);
    const castMs = c._yoneQCastTime() * 1000;
    const flashAt = flashDuring === 'dash' ? castMs + 60 : castMs * 0.4;
    setTimeout(() => { E.castSummonerSpell(c, 'D', new T.Vector3(base.x + L(350), 0, base.z + L(250)), null); }, flashAt);
    setTimeout(() => {
      const ku = (d) => (d.statusEffects || []).some((s) => s.type === 'KNOCKUP' || s.id === 'yoneQKnockup') || d.hp < d.maxHp;
      const p = c.root.position;
      res({ hitA_gustLine: ku(A), hitB_flashSpot: ku(B), yoneEnd: { x: +((p.x - base.x) / L(1)).toFixed(0), z: +((p.z - base.z) / L(1)).toFixed(0) } });
    }, castMs + 1200);
  }), flashDuring);
  r.yoneQ3FlashDuringDash = await scenario('dash');
  await page.waitForTimeout(1500);
  r.yoneQ3FlashDuringWindup = await scenario('windup');
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
