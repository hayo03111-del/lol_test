// QA(체크리스트 2·3): 전 챔피언 Q/W/E/R의 피해·사거리·쿨다운·자원 소모와, 스킬 도중 이동·평타 캔슬·대상 사망·시전자 사망/부활 처리를 점검한다.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_skills_check.js [챔피언ID...]  → JSON(챔피언별 결과) 출력
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const ALL = ['garen', 'darius', 'masteryi', 'leesin', 'nautilus', 'yasuo', 'yone', 'sett', 'mordekaiser', 'renekton', 'nilah', 'chogath', 'ezreal', 'ashe', 'varus', 'ahri', 'vex', 'rammus', 'lux'];
const SLOTS = ['Q', 'W', 'E', 'R'];
// 조준 방식(skill_aim_system.js의 skillAimSpec 결과). unit = 커서 아래 적을 대상으로 잡고 시전(실제 입력 경로 skillAim.cast와 같게 currentTarget을 잡는다)
const UNIT = new Set(['garenR', 'dariusR', 'settR', 'yasuoE', 'yasuoR', 'nilahE', 'mordekaiserR', 'nautilusR', 'masteryiQ', 'rammusE', 'chogathR', 'leesinR', 'leesinQ2']);
// 다음 평타를 강화하는 스킬: 시전 뒤 평타 명령까지 내려야 피해가 난다
const EMPOWER = new Set(['garenQ', 'dariusW', 'settQ', 'renektonW', 'nautilusW', 'masteryiE', 'asheQ', 'varusW']);
(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const out = {};
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errors = [];
    // 대기 중 자동 공격(83차 기본 켜짐)이 스킬 피해 측정을 흐리지 않게 끈다
    await page.addInitScript(() => { try { localStorage.setItem('lolsim.options.v1', JSON.stringify({ autoAttack: false })); } catch (e) {} });
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 220)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 });
    await page.waitForTimeout(800);
    // 공통 도구(페이지 안)
    await page.evaluate(() => {
      const E = window.__e2e, L = E.lolRangeToWorld;
      const sv = (v, lvl) => Array.isArray(v) ? v[Math.min(v.length, lvl) - 1] : v;
      window.__qa = {
        sv,
        reset(opts = {}) {
          const c = window.controller;
          if (c.state === 'DEAD' || c.hp <= 0) { c._clearPending && c._clearPending(); c._respawn(); }
          c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.currentTarget = null; c.pendingMove = null; c.pendingCast = null;
          c._attackReadyAt = 0; c._attackMoveDest = null; c._approachCast = null;
          c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.hp = c.maxHp; c.mp = c.maxMp; c.statusEffects = [];
          c.skillLevels = { Q: 5, W: 5, E: 5, R: 3 };
          c.root.position.set(0, 0, 0); c.setState('IDLE'); c._returnToLocomotion && c._returnToLocomotion();
          c.root.rotation.y = Math.PI; // 앞(-Z) 쪽을 본다
          const [d0, d1, d2] = E.dummies;
          for (const d of [d0, d1, d2]) { d.hp = d.maxHp = 1e5; d.statusEffects = []; d.attackDamage = 0; }
          const dist = opts.dist ?? 250;
          d0.mesh.position.set(0, 0, -L(dist)); d1.mesh.position.set(60, 0, 60); d2.mesh.position.set(-60, 0, 60);
          for (const m of E.minions) { m.hp = 0; m.isDead = true; m.destroyed = true; if (m.mesh) m.mesh.visible = false; }
        },
        rangeOf(slot) {
          const d = window.controller._champData()[slot] || {};
          const lvl = window.controller.skillLevels[slot] || 1;
          const r = d.range ?? d.range1 ?? d.rangeMax ?? d.maxRange ?? d.damageRadius ?? d.rangeBase ?? d.recastRange;
          return Array.isArray(r) ? sv(r, lvl) : r;
        },
        expectedCd(slot) {
          const c = window.controller, d = c._champData()[slot] || {};
          const base = sv(d.cooldown, c.skillLevels[slot] || 1);
          let ah = (c.itemBonusAbilityHaste || 0) + (c.itemDynamicAbilityHaste || 0) + (c.runeAbilityHaste || 0);
          if (slot === 'R') ah += (c.itemBonusUltimateHaste || 0) + (c.runeUltimateHaste || 0);
          return { base, ah, expected: base * 100 / (100 + ah) };
        },
        expectedCost(slot) {
          const c = window.controller, d = c._champData()[slot] || {}, lvl = c.skillLevels[slot] || 1;
          if (d.mana != null) return sv(d.mana, lvl);
          if (d.manaByLevel) return sv(d.manaByLevel, lvl);
          if (d.manaFlat != null) return d.manaFlat;
          if (d.energy1 != null) return d.energy1;
          return 0;
        },
        snapshot() {
          const c = window.controller;
          return { state: c.state, key: c.currentActionKey, phase: c.currentPhase, dash: !!c._dashState, untarget: !!c.isUntargetable, visible: c.model ? c.model.visible : null,
            hp: Math.round(c.hp), self: (c.statusEffects || []).map((s) => s.id || s.type), x: +c.root.position.x.toFixed(2), z: +c.root.position.z.toFixed(2), sizeMods: c._sizeMods ? Object.keys(c._sizeMods).filter((k) => c._sizeMods[k] !== 1) : [] };
        },
        dmgTaken() { return E.dummies.map((d) => Math.round(d.maxHp - d.hp)); },
        target(slot) { return E.getWorldPosition(E.dummies[0]).clone(); },
        cast(slot, unit, isUnit, empower) {
          const c = window.controller; unit = unit || E.dummies[0];
          if (isUnit) c.currentTarget = unit;
          c.castAbility(slot, E.getWorldPosition(unit).clone());
          if (empower) setTimeout(() => c.selectTarget(unit), 50);
        },
      };
    });
    await page.evaluate(({ u, e }) => { window.__QA_UNIT = new Set(u); window.__QA_EMP = new Set(e); }, { u: [...UNIT], e: [...EMPOWER] });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const wait = (ms) => page.waitForTimeout(ms);
    const res = { skills: {}, interrupts: {}, errors };
    // 레넥톤처럼 자원이 0에서 시작하는 챔피언은 maxMp만큼 채워 둔다
    for (const slot of SLOTS) {
      const r = {};
      // (a) 사거리 안 시전: 피해·소모·쿨다운
      const range = await ev((s) => window.__qa.rangeOf(s), slot);
      const dist = range ? Math.max(120, Math.min(range * 0.6, range - 60)) : 150;
      await ev((d) => window.__qa.reset({ dist: d }), dist);
      await wait(250);
      const pre = await ev(() => ({ mp: window.controller.mp, maxMp: window.controller.maxMp }));
      const castInfo = await ev((s) => {
        const c = window.controller, Q = window.__qa;
        const tgt = Q.target(s);
        Q.cast(s, null, window.__QA_UNIT.has(c.championId + s), window.__QA_EMP.has(c.championId + s));
        return { mpAfter: c.mp, cd: c.cooldowns[s], key: c.currentActionKey, exp: Q.expectedCd(s), cost: Q.expectedCost(s) };
      }, slot);
      // 바루스 Q는 충전형 - 다시 눌러 발사
      if (id === 'varus' && slot === 'Q') { await wait(700); await ev(() => window.controller.castAbility('Q', window.__qa.target('Q'))); }
      await wait(2200);
      const after = await ev(() => ({ dmg: window.__qa.dmgTaken(), snap: window.__qa.snapshot(), cd: window.controller.cooldowns }));
      r.range = range; r.dist = Math.round(dist);
      r.mpSpent = +(pre.mp - castInfo.mpAfter).toFixed(1); r.costData = castInfo.cost;
      r.cdSet = +castInfo.cd.toFixed(2); r.cdExpected = +castInfo.exp.expected.toFixed(2); r.ah = castInfo.exp.ah;
      r.dmg = after.dmg; r.after = after.snap;
      // (b) 쿨다운 중 재시전 막힘
      const recast = await ev((s) => { const c = window.controller; const mp0 = c.mp, cd0 = c.cooldowns[s], key0 = c.currentActionKey; window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); return { mpDelta: +(mp0 - c.mp).toFixed(1), cd0: +cd0.toFixed(2), cd1: +c.cooldowns[s].toFixed(2), keyChanged: c.currentActionKey !== key0 }; }, slot);
      r.recastDuringCd = recast;
      // (c) 사거리 밖: 피해 없거나 걸어감
      if (range) {
        await ev((d) => window.__qa.reset({ dist: d }), range + 450);
        await wait(200);
        await ev((s) => { const c = window.controller; window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); }, slot);
        if (id === 'varus' && slot === 'Q') { await wait(700); await ev(() => window.controller.castAbility('Q', window.__qa.target('Q'))); }
        await wait(1500);
        r.outOfRange = await ev(() => ({ dmg0: window.__qa.dmgTaken()[0], moved: +Math.hypot(window.controller.root.position.x, window.controller.root.position.z).toFixed(2), cd: +window.controller.cooldowns[window.__e2e ? 'Q' : 'Q'].toFixed(2), snap: window.__qa.snapshot() }));
        r.outOfRange.cdSlot = await ev((s) => +window.controller.cooldowns[s].toFixed(2), slot);
      }
      // (d) 마나 부족
      await ev((d) => window.__qa.reset({ dist: d }), dist);
      await wait(150);
      r.noMana = await ev((s) => { const c = window.controller; const cost = window.__qa.expectedCost(s); if (!(cost > 0)) return { skipped: 'no cost' }; c.mp = Math.max(0, cost - 1); window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); return { cd: +c.cooldowns[s].toFixed(2), key: c.currentActionKey, state: c.state, mp: +c.mp.toFixed(1) }; }, slot);
      await wait(400);
      if (r.noMana && !r.noMana.skipped) r.noMana.after = await ev(() => window.__qa.snapshot());
      res.skills[slot] = r;
    }
    // ---------- 체크리스트 3: 방해 ----------
    const canAct = async () => {
      await ev(() => { const c = window.controller; window.__p0 = c.root.position.clone(); c.moveTo(c.root.position.clone().add(new window.__e2e.THREE.Vector3(1.2, 0, 0.6))); });
      await wait(900);
      return ev(() => +window.controller.root.position.distanceTo(window.__p0).toFixed(2));
    };
    for (const slot of SLOTS) {
      const it = {};
      const range = await ev((s) => window.__qa.rangeOf(s), slot);
      const dist = range ? Math.max(120, Math.min(range * 0.6, range - 60)) : 150;
      // 이동 명령(시전 120ms 뒤)
      await ev((d) => window.__qa.reset({ dist: d }), dist); await wait(200);
      await ev((s) => { const c = window.controller; window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); setTimeout(() => c.moveTo(new window.__e2e.THREE.Vector3(1.5, 0, 1.5)), 120); }, slot);
      await wait(2600);
      it.moveDuring = { snap: await ev(() => window.__qa.snapshot()), canAct: await canAct() };
      // 평타 직후 스킬(평타 캔슬)
      await ev(() => window.__qa.reset({ dist: 150 })); await wait(200);
      await ev(() => window.controller.selectTarget(window.__e2e.dummies[0]));
      await page.waitForFunction(() => window.__qa.dmgTaken()[0] > 0, null, { timeout: 4000 }).catch(() => {});
      const ac = await ev((s) => { const c = window.controller; const cd0 = c.cooldowns[s]; window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); return { fired: c.cooldowns[s] > cd0 || c.currentActionKey != null, key: c.currentActionKey }; }, slot);
      await wait(2400);
      it.afterAA = Object.assign(ac, { snap: await ev(() => window.__qa.snapshot()) });
      it.afterAA.canAct = await canAct();
      // 대상 사망(적 미니언 hp 1을 대상으로)
      await ev((d) => window.__qa.reset({ dist: d }), 3000); await wait(150);
      const md = await ev(({ s, d }) => {
        const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
        const m = E.createMinion('melee', new E.THREE.Vector3(0, 0, -L(d)), 0, 'RED'); E.minions.push(m);
        m.hp = 1; window.__qaMinion = m;
        c.selectTarget && (c.currentTarget = null);
        window.__qa.cast(s, m, window.__QA_UNIT.has(c.championId + s), false);
        return { minionHp: m.hp };
      }, { s: slot, d: dist });
      await wait(150);
      await ev(() => { const m = window.__qaMinion; if (m && !m.isDead) { m.hp = 0; window.__e2e.applyDamageToMinion ? null : null; if (typeof m.hp === 'number') { m.hp = 0; } try { window.__e2e.applyDamage(m, { rawDamage: 10, damageType: 'TRUE' }); } catch (e) {} } });
      await wait(2400);
      it.targetDies = { snap: await ev(() => window.__qa.snapshot()), canAct: await canAct(), minionDead: await ev(() => !!(window.__qaMinion && (window.__qaMinion.isDead || window.__qaMinion.hp <= 0))) };
      // 시전자 사망(시전 150ms 뒤) → 즉시 부활
      await ev((d) => window.__qa.reset({ dist: d }), dist); await wait(200);
      await ev((s) => { const c = window.controller; window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); setTimeout(() => { c.takeDamage(c.hp + 1e7, null); }, 150); }, slot);
      await wait(700);
      const dead = await ev(() => window.__qa.snapshot());
      await ev(() => { const c = window.controller; if (c.state === 'DEAD') { c._clearPending && c._clearPending(); c._respawn(); } });
      await page.waitForFunction(() => window.controller.state !== 'RESPAWN', null, { timeout: 15000 }).catch(() => {});
      await wait(1200);
      const rsp = await ev(() => { const c = window.controller; return Object.assign(window.__qa.snapshot(), { cd: Object.fromEntries(Object.entries(c.cooldowns).map(([k, v]) => [k, +v.toFixed(1)])), extra: {
        mordeRealm: !!(c._morde && c._morde.isInDeathRealm), yoneSpirit: !!(c._yone && c._yone.eSpirit), ahriR: c._ahri ? c._ahri.rCharges : null, vexDash: !!(c._vex && c._vex.dashActive),
        leeQ2: !!(c._leesin && (c._leesin.qMark || c._leesin.q2Ready || c._leesin.qTarget)), nautHook: !!(c._nautilus && (c._nautilus.hook || c._nautilus.qHook)), varusCharge: !!(c._varus && c._varus.qCharge),
        rammusRoll: !!(c._rammus && c._rammus.roll), yiAlpha: !!(c._masteryi && c._masteryi.alpha), nilahR: !!(c._nilah && c._nilah.rSeq), nilahE: !!(c._nilah && c._nilah.eDash), settR: !!(c._sett && c._sett.rSeq), renekR: !!(c._renekton && c._renekton.rActive),
        garenE: c.currentActionKey === 'eChannel', yasuoE: !!(c._yasuo && c._yasuo.eDash) } }); });
      // 부활 뒤 같은 스킬을 다시 쓸 수 있는가
      await ev(() => { const c = window.controller; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; });
      await ev((d) => { const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller; E.dummies[0].mesh.position.set(c.root.position.x, 0, c.root.position.z - L(d)); }, dist);
      await wait(500); // 시야는 다음 프레임에 갱신된다
      const recast = await ev((s) => { const c = window.controller; window.__qa.cast(s, null, window.__QA_UNIT.has(c.championId + s), false); return { cd: +c.cooldowns[s].toFixed(2), key: c.currentActionKey }; }, slot);
      await wait(2200);
      it.death = { dead, respawned: rsp, recastAfterRespawn: recast, afterRecast: await ev(() => window.__qa.snapshot()), canAct: await canAct() };
      res.interrupts[slot] = it;
    }
    out[id] = res;
    await page.close();
    process.stderr.write(`done ${id}\n`);
  }
  console.log(JSON.stringify(out));
  await browser.close(); srv.close();
})();
