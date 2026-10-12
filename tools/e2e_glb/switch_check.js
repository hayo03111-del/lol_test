// 챔피언 교체 격리 점검(헤드리스 Chromium + 실제 GLB): 챔피언 A로 Q/W/E/R을 연달아 시전하고, 스킬이
// 진행 중인 도중에 챔피언 B(GLB 재로드)로 바꾼 뒤 B 상태와 허수아비 상태에 A의 흔적이 남는지 본다.
// 사용법: GLB_DIR=<챔피언명.glb 폴더> THREE_DIR=<three package> [SWITCH_R_DELAY=ms] node tools/e2e_glb/switch_check.js [A챔피언id...]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const CHAMPS = { garen: '가렌', darius: '다리우스', masteryi: '마스터 이', leesin: '리 신', nautilus: '노틸러스', yasuo: '야스오', yone: '요네', sett: '세트', mordekaiser: '모데카이저', renekton: '레넥톤', nilah: '닐라', chogath: '초가스', ezreal: '이즈리얼', ashe: '애쉬', varus: '바루스', ahri: '아리', vex: '벡스' };
const B = 'garen';
const loadGlb = async (page, id) => {
  await page.evaluate(() => { window.__prevCtrl = window.controller || null; });
  await page.setInputFiles('#glbFileInput', { name: CHAMPS[id] + '.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(path.join(process.env.GLB_DIR, CHAMPS[id] + '.glb')) });
  await page.waitForFunction((id) => window.controller && window.controller !== window.__prevCtrl && window.controller.championId === id, id, { timeout: 30000 });
};
// B로 바뀐 직후 컨트롤러/허수아비 상태 요약. 비교 대상은 같은 페이지에서 처음부터 B를 불러온 상태.
const snapshot = () => {
  const E = window.__e2e, c = window.controller;
  return {
    shield: Math.round(c.shield), statusEffects: (c.statusEffects || []).map((e) => e.id || e.type),
    isUntargetable: !!c.isUntargetable, visible: c.model ? c.model.visible : null, actionKey: c.currentActionKey,
    bonusAD: c.bonusAD, bonusMaxHp: c.bonusMaxHp, bonusArmor: c.bonusArmor, armorPen: c.armorPenPercent, magicPen: c.magicPenPercent,
    ad: Math.round(c.stats.attackDamage), range: +c.stats.attackRange.toFixed(3), maxHp: Math.round(c.maxHp), hpFull: c.hp === c.maxHp,
    moveSpeed: Math.round(c.stats.moveSpeed || 0), critMul: c.stats.critMultiplier, collision: +c.collisionRadius.toFixed(3),
    overrides: (c.attackOverrides || []).length, subStates: Object.keys(c.subStates || {}).length, realm: c.realmId,
    cooldowns: Object.values(c.cooldowns).every((v) => v === 0), playerProjectiles: (E.projectiles.list || E.projectiles.projectiles || []).filter?.((p) => !p.isTurret).length,
    dummies: E.dummies.map((d) => ({ grabbed: !!d.isGrabbedBySett, realm: d.realmId || 'main', cc: (d.statusEffects || []).filter((e) => ['STUN', 'ROOT', 'SUPPRESSION', 'KNOCKUP', 'FEAR', 'CHARM'].includes(e.type)).map((e) => e.type) })),
    sceneChildren: E.scene.children.length, fog: E.scene.fog ? E.scene.fog.type : null,
    sceneList: E.scene.children.map((o) => `${o.type}:${o.name || ''}:${o.children.length}:${o.material && o.material.map && o.material.map.image && o.material.map.image.src ? o.material.map.image.src.slice(-30) : ''}${o.userData && Object.keys(o.userData).length ? ':' + Object.keys(o.userData).join('/') : ''}`),
  };
};
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const only = process.argv.slice(2);
  const res = [];
  for (const A of Object.keys(CHAMPS)) {
    if (only.length && !only.includes(A)) continue;
    const page = await browser.newPage({ viewport: { width: 240, height: 135 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    // 기준: 처음부터 B
    await loadGlb(page, B); await page.waitForTimeout(600);
    const fresh = await page.evaluate(snapshot);
    // 스킬마다 따로: A 로드 → 그 스킬 시전 → 판정/연출이 진행 중일 때(delay ms 뒤) B로 교체 →
    // 3초 동안 허수아비가 받는 피해를 기록(이전 챔피언의 지연 판정이 새는지) → B 상태를 기준과 비교.
    for (const [slot, delay] of [['Q', 150], ['W', 150], ['E', 150], ['R', +(process.env.SWITCH_R_DELAY || 250)]]) {
      await loadGlb(page, A); await page.waitForTimeout(500);
      const midA = await page.evaluate(([slot, delay]) => new Promise((resolve) => {
        const E = window.__e2e, c = window.controller, d = E.dummies[0];
        for (const u of E.dummies) { u.hp = u.maxHp = 5000; u.statusEffects = []; u.isGrabbedBySett = false; }
        c.mp = c.maxMp; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
        const dp = E.getWorldPosition(d); c.root.position.set(dp.x, 0, dp.z + E.lolRangeToWorld(200));
        c.currentTarget = d;
        try { c.castAbility(slot, E.getWorldPosition(d).clone()); } catch (e) { window.__castErr = String(e); }
        setTimeout(() => resolve({ actionKey: c.currentActionKey, untargetable: !!c.isUntargetable, grabbed: !!d.isGrabbedBySett, realm: c.realmId, dummyRealm: d.realmId }), delay);
      }), [slot, delay]);
      process.stderr.write(`${A} ${slot}\n`);
      try { await loadGlb(page, B); } catch (e) {
        res.push({ A, slot, midA, loadFailed: true, errors: errors.slice(0, 5), controllerId: await page.evaluate(() => window.controller && window.controller.championId) });
        errors.length = 0; continue;
      }
      const after = await page.evaluate(() => new Promise((resolve) => {
        const E = window.__e2e; const hp0 = E.dummies.map((d) => d.hp); const st0 = E.dummies.map((d) => (d.statusEffects || []).map((e) => e.id || e.type));
        setTimeout(() => resolve({ dmgAfterSwitch: E.dummies.map((d, i) => Math.round(hp0[i] - d.hp)), dummyStatusAtSwitch: st0 }), 3000);
      }));
      const snap = await page.evaluate(snapshot);
      const diffs = Object.keys(fresh).filter((k) => k !== 'dummies' && k !== 'sceneList' && JSON.stringify(fresh[k]) !== JSON.stringify(snap[k])).map((k) => `${k}: fresh=${JSON.stringify(fresh[k])} switched=${JSON.stringify(snap[k])}`);
      const extra = snap.sceneList.slice(); for (const x of fresh.sceneList) { const i = extra.indexOf(x); if (i >= 0) extra.splice(i, 1); }
      if (extra.length) diffs.push('sceneExtra: ' + extra.join(' | '));
      const dummyIssues = snap.dummies.flatMap((d, i) => [d.grabbed && `dummy${i} grabbed`, d.realm !== 'main' && `dummy${i} realm=${d.realm}`, d.cc.length && `dummy${i} cc=${d.cc}`].filter(Boolean));
      res.push({ A, slot, midA, ...after, diffs, dummyIssues, castErr: await page.evaluate(() => window.__castErr || null), errors: errors.slice(0, 3) });
      errors.length = 0;
    }
    await page.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})();
