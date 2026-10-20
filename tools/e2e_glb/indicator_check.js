// 스킬 상태 표시 점검(헤드리스 Chromium + 저장소 모델, 25차): 실제로 스킬·평타를 써서 버프 바(중첩·준비), 스킬 칸 바뀜
// (야스오·요네 Q3, 리 신 Q2), 허수아비 머리 위 표식(다리우스 출혈 5중첩 특수 표식·바루스 역병·리 신 음파), 발밑 준비 고리가 뜨는지 본다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/indicator_check.js [스크린샷 접두어]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
  const wait = (ms) => page.waitForTimeout(ms);
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); /* 84차: 선택 상자가 숨겨진 UI라 직접 바꾼다 */ await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); await wait(700); };
  // 허수아비 바로 앞에 세우고 쿨다운·마나를 채운다
  const setup = () => page.evaluate(() => { const E = window.__e2e, c = window.controller, d = E.dummies[0]; d.hp = d.maxHp = 1e6; d.statusEffects = []; for (const x of E.dummies.slice(1)) x.mesh.position.set(40, 0, 40); const p = E.getWorldPosition(d); c.root.position.set(p.x, 0, p.z + E.lolRangeToWorld(150)); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.currentTarget = null; c.targetPos = null; });
  const castQ = () => page.evaluate(() => { const E = window.__e2e, c = window.controller; c.cooldowns.Q = 0; c.castAbility('Q', E.getWorldPosition(E.dummies[0]).clone()); });
  const attack = () => page.evaluate(() => { const E = window.__e2e; window.controller.selectTarget(E.dummies[0]); });
  const stop = () => page.evaluate(() => { const c = window.controller; c.currentTarget = null; c.attackOrderActive = false; });
  const ui = () => page.evaluate(() => {
    const E = window.__e2e, d = E.dummies[0];
    const buffs = [...document.querySelectorAll('#buffBar .buff')].map((b) => ({ key: b.dataset.key, label: b.querySelector('.lbl').textContent, stacks: b.querySelector('.stk') ? +b.querySelector('.stk').textContent : null, ready: b.classList.contains('ready') }));
    const q = document.querySelector('#slotQ .slotState');
    const marks = d.labelDiv.querySelector('.unitMarks');
    return { buffs, slotQ: q ? (q.firstChild.textContent + ' ' + q.querySelector('small').textContent) : null, marks: marks ? { emblem: !!marks.querySelector('svg.emblem'), on: marks.querySelectorAll('.pip:not(.off)').length, tags: [...marks.querySelectorAll('.tag')].map((t) => t.textContent) } : null, aura: !!(window.__e2e.statusIndicators && window.__e2e.statusIndicators._aura) };
  });
  const shot = async (name) => {
    if (!process.argv[2]) return;
    await page.evaluate(() => { for (const id of ['championPanel', 'championPanelToggle', 'debugPanel', 'debugPanelToggle', 'helpBox', 'levelPanel', 'shopPanel', 'shopDetailPanel', 'settingsPanel']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } document.querySelectorAll('.panelHeader').forEach((h) => { h.parentElement.style.visibility = 'hidden'; }); });
    await page.screenshot({ path: `${process.argv[2]}_${name}.png` });
  };
  const r = {};
  await load('yasuo'); await setup();
  await castQ(); await wait(900); r.yasuoQ1 = await ui();
  await castQ(); await wait(900); r.yasuoQ2 = await ui(); await shot('yasuo');
  await load('yone'); await setup();
  await castQ(); await wait(900); await castQ(); await wait(900); r.yoneQ2 = await ui();
  await load('masteryi'); await setup(); await attack();
  await page.waitForFunction(() => (window.controller._masteryi.attackCount || 0) % 4 === 3, null, { timeout: 12000 }).catch(() => {});
  await stop(); await wait(250); r.yiThree = await ui(); await shot('masteryi');
  await load('darius'); await setup(); await attack();
  await page.waitForFunction(() => { const c = window.controller, rec = c._darius.stacksOnTarget.get(window.__e2e.dummies[0]); return rec && rec.stacks >= 5; }, null, { timeout: 15000 }).catch(() => {});
  await stop(); await wait(250); r.dariusBleed = await ui(); await shot('darius');
  await load('varus'); await setup(); await attack();
  await page.waitForFunction(() => { const s = window.__e2e.dummies[0].statusEffects.find((x) => x.id === 'varusBlight'); return s && s.stacks >= 2; }, null, { timeout: 12000 }).catch(() => {});
  await stop(); await wait(250); r.varusBlight = await ui();
  await load('leesin'); await setup(); await castQ();
  await page.waitForFunction(() => !!window.controller._leesin.qMarkTarget, null, { timeout: 5000 }).catch(() => {});
  await wait(200); r.leeQ = await ui(); await shot('leesin');
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
