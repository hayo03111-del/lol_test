// 방향 점검(31차): 방향·대상이 있는 스킬을 옆(+x)에 있는 허수아비에게 썼을 때, 챔피언이 시전 직후(0.2초)와
// 행동 중(0.5초)에 그 방향을 바라보는지 확인한다(리 신 Q2가 반대쪽을 보던 것 같은 문제를 찾는다).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/facing_check.js [챔피언ID...]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
// 방향을 정하는 스킬(skill_aim_system.js SKILL_AIM에서 instant가 아닌 것). 야스오 R(공중 대상 필요)·마스터 이 Q(모델 숨김)는 제외.
const SLOTS = {
  garen: ['R'], darius: ['E', 'R'], sett: ['W', 'R'], renekton: ['E'], yasuo: ['Q', 'W', 'E'], yone: ['Q', 'W', 'E', 'R'],
  nilah: ['Q', 'E'], mordekaiser: ['Q', 'E', 'R'], nautilus: ['Q', 'R'], rammus: ['E', 'R'], chogath: ['Q', 'W', 'R'], leesin: ['Q', 'R'],
  vex: ['Q', 'E', 'R'], ezreal: ['Q', 'W', 'E', 'R'], ahri: ['Q', 'E', 'R'], varus: ['E', 'R'], ashe: ['W', 'E', 'R'],
};
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const only = process.argv.slice(2);
  const out = {};
  for (const [id, slots] of Object.entries(SLOTS)) {
    if (only.length && !only.includes(id)) continue;
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 30000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 });
    await page.waitForTimeout(600);
    out[id] = {};
    for (const slot of slots) {
      out[id][slot] = await page.evaluate((slot) => new Promise((resolve) => {
        const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d0 = E.dummies[0];
        try { if (c._morde && c._morde.isInDeathRealm) c._mordeEndDeathRealm('facing'); } catch (e) { /* 무시 */ }
        c._clearActionTimers && c._clearActionTimers();
        c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.pendingMove = null; c.currentTarget = null; c.attackOrderActive = false; c._dashState = null;
        c.setState('IDLE'); c.statusEffects = []; c.mp = c.maxMp; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.skillLevels = { Q: 3, W: 3, E: 3, R: 2 };
        c.root.position.set(0, 0, 0); c.faceDirectionInstant(new E.THREE.Vector3(0, 0, -1)); // 정면 -z
        for (const d of E.dummies) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d._pullState = null; d.mesh.position.set(40, 0, 40); }
        d0.mesh.position.set(L(300), 0, -L(60)); // 오른쪽 옆
        c.currentTarget = d0;
        c.castAbility(slot, E.getWorldPosition(d0).clone());
        const err = () => {
          const f = new E.THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion).setY(0).normalize();
          const to = new E.THREE.Vector3().subVectors(d0.mesh.position, c.root.position).setY(0);
          if (to.lengthSq() < 1e-4) return 0;
          return Math.round(Math.acos(Math.max(-1, Math.min(1, f.dot(to.normalize())))) * 180 / Math.PI);
        };
        const res = { cast: c.cooldowns[slot] > 0 || !!c.currentActionKey };
        setTimeout(() => { res.err200 = err(); }, 200);
        setTimeout(() => { res.err500 = err(); resolve(res); }, 500);
      }), slot);
    }
    await page.close();
  }
  console.log(JSON.stringify(out));
  await browser.close(); srv.close();
})();
