// 전 챔피언 스킬 기제 점검(헤드리스 Chromium + 실제 GLB). 각 스킬을 허수아비에게 써서 실제 게임에서 일어난 일을 기록한다:
// 허수아비 피해, 걸린 상태이상 종류, 허수아비/플레이어 이동 거리, 플레이어 보호막·회복·자기 버프, 오류.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/mechanics_check.js [챔피언ID...] > out.json
// 수치를 비교할 때는 E2E_HIDE_MAP=1을 켠다(server.js 참고 - 맵을 그리면 CPU 렌더러에서 게임 시간이 느려진다).
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const CHAMPS = { garen: '가렌', darius: '다리우스', masteryi: '마스터 이', leesin: '리 신', nautilus: '노틸러스', yasuo: '야스오', yone: '요네',
  sett: '세트', mordekaiser: '모데카이저', renekton: '레넥톤', nilah: '닐라', chogath: '초가스', ezreal: '이즈리얼', ashe: '애쉬', varus: '바루스', ahri: '아리', vex: '벡스' };
// 스킬별 시험 조건: 거리(LoL 단위), 재시전(ms 뒤), 대상 유지(강화 평타형), 사전 준비
const SETUP = {
  default: { dist: 250, keepTarget: false },
  'garen.Q': { keepTarget: true, dist: 150 }, 'darius.W': { keepTarget: true, dist: 150 }, 'darius.Q': { dist: 320 }, 'darius.E': { dist: 400 },
  'nautilus.W': { keepTarget: true, dist: 150 }, 'renekton.W': { keepTarget: true, dist: 150 }, 'sett.Q': { keepTarget: true, dist: 120 },
  'chogath.E': { keepTarget: true, dist: 120 }, 'masteryi.E': { keepTarget: true, dist: 150 }, 'ashe.Q': { keepTarget: true, dist: 400 },
  'leesin.Q': { recastMs: 900 }, 'leesin.E': { dist: 200, recastMs: 700 }, 'leesin.R': { dist: 200 }, 'yasuo.R': { knockupFirst: true, dist: 400 },
  'varus.Q': { recastMs: 900, dist: 500 }, 'yone.E': { recastMs: 1200 }, 'nilah.R': { dist: 200 }, 'mordekaiser.E': { dist: 500 },
  'ezreal.W': { dist: 500 }, 'ezreal.Q': { dist: 500 }, 'ezreal.R': { dist: 800 }, 'ahri.E': { dist: 400 }, 'vex.E': { dist: 400 },
  'sett.W': { dist: 300, gritFirst: true }, 'sett.R': { dist: 200, windowMs: 3800 }, 'chogath.R': { dist: 150 }, 'vex.R': { recastMs: 1200, windowMs: 3000 }, 'chogath.W': { dist: 250 }, 'chogath.Q': { dist: 400 }, 'yone.Q': { dist: 250 },
};
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const only = process.argv.slice(2);
  const res = {};
  for (const [id, kr] of Object.entries(CHAMPS)) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 240, height: 135 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.setInputFiles('#glbFileInput', { name: kr + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, kr + '.glb')) });
    await page.waitForFunction(() => window.controller && window.controller.championId, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    res[id] = { errors };
    for (const slot of ['Q', 'W', 'E', 'R']) {
      const cfg = Object.assign({}, SETUP.default, SETUP[`${id}.${slot}`] || {});
      res[id][slot] = await page.evaluate(({ slot, cfg }) => new Promise((resolve) => {
        const E = window.__e2e, c = window.controller, d = E.dummies[0];
        if (!d._home) d._home = d.mesh.position.clone();
        d.mesh.position.copy(d._home); d.hp = d.maxHp = 3000; d.statusEffects = []; if (d.shield) d.shield = 0;
        c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.currentTarget = null; c.attackOrderActive = false;
        c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.skillLevels = { Q: 1, W: 1, E: 1, R: 1 }; c.statusEffects = []; c.shield = 0;
        c.hp = Math.round(c.maxHp * 0.5); c._returnToLocomotion && c._returnToLocomotion();
        const dp = E.getWorldPosition(d);
        c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(cfg.dist));
        if (cfg.gritFirst && c._sett) c._sett.grit = c.maxHp * 0.5;
        if (cfg.knockupFirst) E.applyStatus(d, { id: 'test_air', type: 'KNOCKUP', duration: 1.0, value: 1 });
        const hp0 = d.hp, me0 = c.root.position.clone(), d0 = d.mesh.position.clone(), myHp0 = c.hp;
        const seenD = new Set(), seenMe = new Set(); let maxShield = 0, maxDDisp = 0, maxMeDisp = 0, maxHeal = 0;
        c.currentTarget = d;
        c.castAbility(slot, E.getWorldPosition(d).clone());
        if (!cfg.keepTarget) c.currentTarget = null;
        else if (typeof c.selectTarget === 'function') setTimeout(() => c.selectTarget(d), 30); // 강화 평타형: 공격 명령까지 내린다
        if (cfg.recastMs) setTimeout(() => { c.cooldowns[slot] = 0; c.castAbility(slot, E.getWorldPosition(d).clone()); }, cfg.recastMs);
        const t0 = performance.now(); let firstDmg = null;
        const iv = setInterval(() => {
          const t = performance.now() - t0;
          for (const e of d.statusEffects || []) seenD.add(e.type + (e.id ? ':' + e.id : ''));
          for (const e of c.statusEffects || []) seenMe.add(e.type + (e.id ? ':' + e.id : ''));
          maxShield = Math.max(maxShield, c.shield || 0);
          maxHeal = Math.max(maxHeal, c.hp - myHp0);
          maxDDisp = Math.max(maxDDisp, d.mesh.position.distanceTo(d0));
          maxMeDisp = Math.max(maxMeDisp, c.root.position.distanceTo(me0));
          if (firstDmg == null && d.hp < hp0) firstDmg = Math.round(t);
          if (t > (cfg.windowMs || 2600)) {
            clearInterval(iv);
            const L = (w) => Math.round(w / E.lolRangeToWorld(1));
            resolve({ dmg: Math.round(hp0 - d.hp), firstDmgMs: firstDmg, targetStatus: [...seenD], selfStatus: [...seenMe], shield: Math.round(maxShield), heal: Math.round(maxHeal),
              targetMoved: L(maxDDisp), selfMoved: L(maxMeDisp), cd: +(c.cooldowns[slot] || 0).toFixed(1) });
          }
        }, 20);
      }), { slot, cfg });
    }
    res[id].errors = errors.filter((e) => !/favicon|404|ERR_TUNNEL_CONNECTION_FAILED/.test(e)).slice(0, 5); // 터널 실패 = 이 환경에서 막힌 CommunityDragon 텍스처
    await page.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})();
