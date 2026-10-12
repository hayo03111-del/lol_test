// 연계 기제 점검(헤드리스 Chromium + 실제 GLB): 한 번의 시전으로는 안 보이는 기제를 시간표대로 실행해 확인한다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/combo_check.js
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
// steps: [ms, 'cast', slot] | [ms, 'attack'] | [ms, 'stop'] ; check: 결과에서 볼 값을 브라우저 안에서 계산하는 함수 본문(문자열)
const COMBOS = [
  { id: 'ezreal', kr: '이즈리얼', name: 'W 표식 → Q로 폭발', dist: 500, steps: [[0, 'cast', 'W'], [700, 'cast', 'Q']], ms: 2200 },
  { id: 'varus', kr: '바루스', name: '평타 3회 역병 → Q로 폭발', dist: 500, steps: [[0, 'attack'], [2600, 'stop'], [2700, 'cast', 'Q'], [3700, 'cast', 'Q']], ms: 5200 },
  { id: 'ahri', kr: '아리', name: 'R 3회 돌진', dist: 400, steps: [[0, 'cast', 'R'], [1200, 'cast', 'R'], [2400, 'cast', 'R']], ms: 3600 },
  { id: 'yasuo', kr: '야스오', name: 'Q 3회 → 회오리 에어본', dist: 250, steps: [[0, 'cast', 'Q'], [700, 'cast', 'Q'], [1500, 'cast', 'Q']], ms: 3200, resetCd: true },
  { id: 'renekton', kr: '레넥톤', name: '분노 50 이상 Q 강화', dist: 150, setup: 'c._renekton.rage = 100;', steps: [[0, 'cast', 'Q']], ms: 1200 },
  { id: 'darius', kr: '다리우스', name: '평타·Q로 출혈 5중첩 → 녹서스의 힘', dist: 150, steps: [[0, 'attack']], ms: 9000, check: 'out.empowered = (c._darius.empoweredUntil||0) > performance.now() || !!out.sawEmpower;' },
  { id: 'nautilus', kr: '노틸러스', name: '첫 평타 속박(패시브)', dist: 150, steps: [[0, 'attack']], ms: 2500 },
  { id: 'vex', kr: '벡스', name: 'R → R 재시전(돌진 + 피해)', dist: 400, steps: [[0, 'cast', 'R'], [1300, 'cast', 'R']], ms: 2600 },
  { id: 'leesin', kr: '리 신', name: 'Q1 → Q2 돌진 + 잃은 체력 비례 피해', dist: 400, steps: [[0, 'cast', 'Q'], [900, 'cast', 'Q']], ms: 2200 },
  { id: 'varus', kr: '바루스', name: 'R 확산(주변 챔피언에게 속박 전이)', dist: 500, steps: [[0, 'cast', 'R']], ms: 3500, tag: 'R' },
  { id: 'ashe', kr: '애쉬', name: 'W 부채꼴 여러 대상', dist: 500, steps: [[0, 'cast', 'W']], ms: 1500, tag: 'W' },
  { id: 'renekton', kr: '레넥톤', name: 'R 주변 지속 피해', dist: 150, steps: [[0, 'cast', 'R']], ms: 3500, tag: 'R' },
  { id: 'nilah', kr: '닐라', name: 'Q 후 강화 평타(원뿔)', dist: 150, steps: [[0, 'cast', 'Q'], [500, 'attack']], ms: 3000, tag: 'Q+AA' },
  { id: 'garen', kr: '가렌', name: 'E 회전 중 R → 회전 끊고 R', dist: 150, steps: [[0, 'cast', 'E'], [1000, 'cast', 'R']], ms: 2200, tag: 'E>R', check: 'out.eEnded = c.currentActionKey !== "eChannel";' },
  { id: 'nautilus', kr: '노틸러스', name: 'R 경로 폭발(주변 허수아비)', dist: 700, steps: [[0, 'cast', 'R']], ms: 3500, tag: 'R' },
  { id: 'vex', kr: '벡스', name: 'E 피해(50+AP 40%)', dist: 400, steps: [[0, 'cast', 'E']], ms: 1500, tag: 'E' },
  { id: 'yone', kr: '요네', name: 'E 정신체 → 평타 → E 복귀 표식 폭발', dist: 250, steps: [[0, 'cast', 'E'], [500, 'attack'], [2000, 'stop'], [2100, 'cast', 'E']], ms: 3200 },
];
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const only = process.argv.slice(2);
  const res = [];
  for (const combo of COMBOS) {
    if (only.length && !only.includes(combo.id)) continue;
    const page = await browser.newPage({ viewport: { width: 240, height: 135 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.setInputFiles('#glbFileInput', { name: combo.kr + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, combo.kr + '.glb')) });
    await page.waitForFunction(() => window.controller && window.controller.championId, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const out = await page.evaluate((combo) => new Promise((resolve) => {
      const E = window.__e2e, c = window.controller, d = E.dummies[0];
      for (const u of E.dummies) { u.hp = u.maxHp = 5000; u.statusEffects = []; }
      const others = E.dummies.slice(1).map((u) => ({ u, hp0: u.hp, st: new Set() }));
      c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 };
      const dp = E.getWorldPosition(d);
      c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(combo.dist));
      if (combo.setup) eval(combo.setup);
      const out = { hits: [], statuses: new Set(), sawEmpower: false };
      let lastHp = d.hp; const t0 = performance.now();
      for (const [ms, act, slot] of combo.steps) setTimeout(() => {
        if (act === 'cast') { if (combo.resetCd) c.cooldowns[slot] = 0; c.currentTarget = d; c.castAbility(slot, E.getWorldPosition(d).clone()); }
        else if (act === 'attack') c.selectTarget(d);
        else if (act === 'stop') { c.currentTarget = null; c.attackOrderActive = false; c.targetPos = null; }
      }, ms);
      const iv = setInterval(() => {
        const t = Math.round(performance.now() - t0);
        if (d.hp < lastHp) { out.hits.push(`${t}ms -${Math.round(lastHp - d.hp)}`); lastHp = d.hp; }
        for (const e of d.statusEffects || []) out.statuses.add(e.type + ':' + (e.id || ''));
        for (const o of others) for (const e of o.u.statusEffects || []) o.st.add(e.type);
        if (c._darius && (c._darius.empoweredUntil || 0) > performance.now()) out.sawEmpower = true;
        if (t > combo.ms) {
          clearInterval(iv);
          if (combo.check) eval(combo.check);
          out.statuses = [...out.statuses]; out.total = Math.round(5000 - d.hp); out.hits = out.hits.slice(0, 14);
          out.others = others.map((o) => ({ distFromMain: Math.round(o.u.mesh.position.distanceTo(d.mesh.position) / E.lolRangeToWorld(1)), dmg: Math.round(o.hp0 - o.u.hp), status: [...o.st] }));
          resolve(out);
        }
      }, 20);
    }), combo);
    res.push({ id: combo.id + (combo.tag ? '.' + combo.tag : ''), name: combo.name, ...out, errors: errors.slice(0, 3) });
    await page.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})();
