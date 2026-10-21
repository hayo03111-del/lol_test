// QA(스킬 피해 점검 1조): 가렌·다리우스·세트·레넥톤·모데카이저 - 스킬별 실제 피해를 공식 기대값과 비교하고, applyDamage가 받은 분류(평타/스킬/지속 피해)를 기록한다.
// 허수아비에 takeDamage를 달아 applyDamage가 넘기는 최종 피해·피해 종류·분류를 그대로 받는다(방어력/마법 저항 0이면 최종 = 원래 피해 × 칼바람 보정).
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/qa_dmg_group1.js [챔피언ID...]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const ALL = ['garen', 'darius', 'sett', 'renekton', 'mordekaiser'];
(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const out = {};
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errors = [];
    await page.addInitScript(() => { try { localStorage.setItem('lolsim.options.v1', JSON.stringify({ autoAttack: false })); } catch (e) {} });
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 220)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__e2e, null, { timeout: 60000 });
    await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
    await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const E = window.__e2e, L = E.lolRangeToWorld, c = window.controller;
      const sv = (v, lvl) => Array.isArray(v) ? v[Math.min(v.length, lvl) - 1] : v;
      // 추가 AD 40(B.F. 대검), AP 45(방출의 마법봉)
      c.items = [{ id: 'bfSword', count: 1 }, { id: 'blastingWand', count: 1 }]; window.recomputeItemStats(c);
      const log = [];
      for (const d of E.dummies) {
        d.takeDamage = function (dmg, src, type, meta) { log.push({ d: E.dummies.indexOf(this), dmg: +dmg.toFixed(2), type, ...Object.fromEntries(Object.entries(meta || {}).filter(([, v]) => v)) }); this.hp = Math.max(1, this.hp - dmg); };
      }
      window.__qa = {
        sv, log, L, E, c,
        reset(opts = {}) {
          if (c.state === 'DEAD' || c.hp <= 0) c._respawn();
          c._clearActionTimers(); c.currentActionKey = null; c.currentPhase = null; c.targetPos = null; c.currentTarget = null; c.pendingMove = null; c.pendingCast = null;
          c._attackReadyAt = 0; c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.hp = c.maxHp; c.mp = c.maxMp; c.statusEffects = [];
          c.skillLevels = { Q: opts.rank ?? 5, W: opts.rank ?? 5, E: opts.rank ?? 5, R: Math.min(3, opts.rank ?? 3) };
          c.root.position.set(0, 0, 0); c.setState('IDLE'); c.root.rotation.y = Math.PI;
          E.dummies.forEach((d, i) => {
            d.hp = d.maxHp = opts.hp ?? 3000; d.statusEffects = []; d.attackDamage = 0; d.shield = 0;
            d.armor = opts.armor ?? 0; d.magicResist = opts.mr ?? 0; d.baseArmor = d.armor;
            if (i === 0) d.mesh.position.set(0, 0, -L(opts.dist ?? 150)); else d.mesh.position.set(i * 40, 0, 40);
          });
          for (const m of E.minions) { m.hp = 0; m.isDead = true; m.destroyed = true; }
          if (c.championId === 'darius') { c._darius.empoweredUntil = 0; c._darius.stacksOnTarget.clear(); c.bonusAD = 0; c.recomputeStats(); }
          log.length = 0;
        },
        take() { const r = log.slice(); log.length = 0; return r; },
        sum(rows, d = 0) { return +rows.filter((r) => r.d === d).reduce((a, r) => a + r.dmg, 0).toFixed(2); },
      };
    });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const wait = (ms) => page.waitForTimeout(ms);
    const res = { stats: await ev(() => { const c = window.controller; return { lvl: c.champLevel, AD: +c.stats.attackDamage.toFixed(2), bonusAD: +c._getBonusAD().toFixed(2), AP: c.stats.abilityPower, crit: c.stats.critChance }; }) };
    const rows = [];
    const rec = (name, expected, got, flags, note) => rows.push({ name, expected: expected == null ? null : +(+expected).toFixed(2), got, ratio: expected ? +(got / expected).toFixed(4) : null, flags, note });

    if (id === 'garen') {
      for (const rank of [1, 5]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank }); const cd = c._champData();
          c._garenQOnHit(d); const t = q.take();
          return { exp: q.sv(cd.Q.damageByLevel, rank) + cd.Q.adRatio * c.stats.attackDamage, t }; }, rank);
        rec(`Q 추가 피해 r${rank}`, r.exp, r.t[0]?.dmg, r.t[0]);
      }
      for (const rank of [1, 3]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank }); d.hp = d.maxHp * 0.5; const cd = c._champData();
          const exp = q.sv(cd.R.baseDamageByLevel, rank) + d.maxHp * 0.5 * q.sv(cd.R.missingHpPercentByLevel, rank) / 100;
          c._garenROnHit(d); return { exp, t: q.take() }; }, rank);
        rec(`R (체력 50%) r${rank}`, r.exp, r.t[0]?.dmg, r.t[0]);
      }
      // E: 실제 시전, 허수아비 1개만 범위 안 → 회전 7번 × (가장 가까운 적 +25%)
      await ev(() => { const q = window.__qa, c = q.c; q.reset({ rank: 5 }); c.stats.critChance = 0; q.E.dummies.slice(1).forEach((d) => d.mesh.position.set(80, 0, 80)); c.castAbility('E', q.E.getWorldPosition(q.E.dummies[0]).clone()); });
      // 게임 시간은 프레임 dt로 흐른다(헤드리스는 느리다) - 회전이 끝날 때까지 기다린다
      await page.waitForFunction(() => window.controller.currentActionKey !== 'eChannel', null, { timeout: 30000 }).catch(() => {});
      const e = await ev(() => { const q = window.__qa, c = q.c, cd = c._champData(); const t = q.take(); q.hitsTotal = c._eHitsTotal;
        const per = (q.sv(cd.E.perHitDamageByLevel, 5) + q.sv(cd.E.adRatioByLevel, 5) * c.stats.attackDamage) * 1.25; return { per, n: t.filter((x) => x.d === 0).length, sum: q.sum(t), f: t[0], total: c._eHitsTotal }; });
      rec('E 회전 1회(가장 가까운 적)', e.per, e.f?.dmg, e.f, `회전 ${e.n}회(예정 ${e.total}), 합 ${e.sum}`);
    }

    if (id === 'darius') {
      for (const rank of [1, 5]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank }); const cd = c._champData();
          c._dariusQOnHit(d, null); const blade = q.take(); c._darius.stacksOnTarget.clear(); d.statusEffects = [];
          c._dariusQOnHit(d, 0.01); const handle = q.take();
          c._dariusWOnHit(d); const w = q.take();
          return { blade, handle, w, eb: q.sv(cd.Q.bladeDamageByLevel, rank) + q.sv(cd.Q.bladeAdRatioByLevel, rank) * c.stats.attackDamage,
            eh: q.sv(cd.Q.handleDamageByLevel, rank) + q.sv(cd.Q.handleAdRatioByLevel, rank) * c.stats.attackDamage, ew: c.stats.attackDamage * q.sv(cd.W.bonusAdRatioByLevel, rank) }; }, rank);
        rec(`Q 날 r${rank}`, r.eb, r.blade[0]?.dmg, r.blade[0]); rec(`Q 자루 r${rank}`, r.eh, r.handle[0]?.dmg, r.handle[0]); rec(`W 추가 피해 r${rank}`, r.ew, r.w[0]?.dmg, r.w[0]);
      }
      for (const stacks of [0, 5]) {
        const r = await ev((stacks) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank: 3 }); const cd = c._champData();
          if (stacks) c._darius.stacksOnTarget.set(d, { stacks, expiresAt: performance.now() + 5000 }); else c._darius.stacksOnTarget.clear();
          c._dariusROnHit(d); const t = q.take(); const min = q.sv(cd.R.minDamageByLevel, 3) + cd.R.minAdRatio * c._getBonusAD();
          return { exp: min * (1 + 0.2 * stacks), t }; }, stacks);
        rec(`R r3 출혈 ${stacks}중첩`, r.exp, r.t[0]?.dmg, r.t[0]);
      }
      // 출혈: 1중첩 5초 총 피해, 방어력 100에서 E 관통 적용 여부
      for (const armor of [0, 100]) {
        await ev((armor) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank: 5, armor }); c._darius.stacksOnTarget.clear(); c._dariusPassiveTick(); c._dariusApplyBleed(d); }, armor);
        await page.waitForFunction(() => !(window.__e2e.dummies[0].statusEffects || []).some((e) => e.id === 'dariusBleed'), null, { timeout: 30000 }).catch(() => {});
        const r = await ev((armor) => { const q = window.__qa, c = q.c, p = c._champData().passive; const t = q.take();
          const one = p.oneStackBase + p.oneStackGrowth * (c.champLevel - 1) + p.oneStackBonusAdRatio * c._getBonusAD();
          const pen = c.armorPenPercent || 0; const mult = armor ? 100 / (100 + armor * (1 - pen)) : 1;
          return { exp: one * mult, sum: q.sum(t), ticks: t.length, f: t[0], pen }; }, armor);
        rec(`출혈 1중첩 총합(방어력 ${armor}, E 관통 ${r.pen} 적용 기대)`, r.exp, r.sum, r.f, `틱 ${r.ticks}`);
      }
    }

    if (id === 'sett') {
      for (const rank of [1, 5]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank }); const cd = c._champData();
          c._sett.qUsesRemaining = 2; c._settQOnHit(d); const qt = q.take();
          const eq = q.sv(cd.Q.perHitFlatByLevel, rank) + d.maxHp * (cd.Q.perHitMaxHpPercent + c.stats.attackDamage / 100 * q.sv(cd.Q.perHitMaxHpPercentPer100AdByLevel, rank)) / 100;
          // W: 투지 500 소모, 대상 정면 300(중앙) / 옆(측면)
          c._sett.wPendingSpent = 500; const fwd = new q.E.THREE.Vector3(0, 0, -1);
          d.mesh.position.set(0, 0, -q.L(300)); c._settWOnCast(c.root.position.clone(), fwd); const wc = q.take();
          d.mesh.position.set(q.L(120), 0, -q.L(500)); c._settWOnCast(c.root.position.clone(), fwd); const ws = q.take();
          const ew = q.sv(cd.W.damageBaseByLevel, rank) + 500 * (cd.W.gritSpendPercent + c._getBonusAD() / 100 * cd.W.gritSpendPercentPer100BonusAd) / 100;
          // E: 옆 200
          d.mesh.position.set(q.L(200), 0, 0); c._settEOnCast(fwd); const et = q.take();
          const ee = q.sv(cd.E.damageByLevel, rank) + cd.E.adRatio * c.stats.attackDamage;
          return { qt, eq, wc, ws, ew, et, ee }; }, rank);
        rec(`Q 1타 r${rank}`, r.eq, r.qt[0]?.dmg, r.qt[0]); rec(`W 중앙(투지 500) r${rank}`, r.ew, r.wc[0]?.dmg, r.wc[0]); rec(`W 측면 r${rank}`, r.ew, r.ws[0]?.dmg, r.ws[0]); rec(`E r${rank}`, r.ee, r.et[0]?.dmg, r.et[0]);
      }
      for (const rank of [1, 3]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank }); const cd = c._champData();
          d.bonusHealth = 1000; const lp = q.E.getWorldPosition(d).clone();
          c._settRImpact({ landingPos: lp, target: d }); const t = q.take(); d.bonusHealth = 0;
          return { exp: q.sv(cd.R.maxDamageByLevel, rank) + cd.R.bonusAdRatio * c._getBonusAD() + 1000 * q.sv(cd.R.bonusHpPercentByLevel, rank) / 100, t }; }, rank);
        rec(`R 붙잡은 대상(추가 체력 1000) r${rank}`, r.exp, r.t[0]?.dmg, r.t[0]);
      }
      const p = await ev(() => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({}); const cd = c._champData();
        c._settOnBasicAttackHit(d, 'RIGHT'); const t = q.take(); const tt = Math.min(1, Math.max(0, (c.champLevel - 1) / 17));
        return { exp: 5 + 95 * tt + 0.55 * c._getBonusAD(), t }; });
      rec('패시브 오른손 추가 피해', p.exp, p.t[0]?.dmg, p.t[0]);
    }

    if (id === 'renekton') {
      for (const rank of [1, 5]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank }); const cd = c._champData(); const ex = c._renektonExtraAD();
          c._renektonApplyQHit(d, false, { generated: 0 }); const qn = q.take(); c._renektonApplyQHit(d, true, { generated: 0 }); const qe = q.take();
          return { qn, qe, eqn: q.sv(cd.Q.damageByLevel, rank) + cd.Q.bonusAdRatio * ex, eqe: q.sv(cd.Q.empoweredDamageByLevel, rank) + cd.Q.empoweredBonusAdRatio * ex }; }, rank);
        rec(`Q r${rank}`, r.eqn, r.qn[0]?.dmg, r.qn[0]); rec(`Q 강화 r${rank}`, r.eqe, r.qe[0]?.dmg, r.qe[0]);
        for (const emp of [false, true]) {
          await ev(({ rank, emp }) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank, dist: 120 }); c._renekton.wSeq = null; c._renekton.wArmed = true; c._renekton.wEmpowered = emp; c.currentTarget = d; c._renektonBeginAttackSwing(); }, { rank, emp });
          await wait(1500);
          const w = await ev(({ rank, emp }) => { const q = window.__qa, c = q.c, cd = c._champData(); const t = q.take();
            const exp = emp ? q.sv(cd.W.empoweredDamageByLevel, rank) + cd.W.empoweredTotalAdRatio * c.stats.attackDamage : q.sv(cd.W.damageByLevel, rank) + cd.W.totalAdRatio * c.stats.attackDamage;
            return { exp, sum: q.sum(t), n: t.length, f: t[0] }; }, { rank, emp });
          rec(`W${emp ? ' 강화' : ''} 총합 r${rank}`, w.exp, w.sum, w.f, `타격 ${w.n}회`);
        }
        await ev((rank) => { const q = window.__qa, c = q.c; q.reset({ rank, dist: 300 }); c._renekton.eSecondReadyUntil = 0; c._renektonCastE(q.E.getWorldPosition(q.E.dummies[0]).clone()); }, rank);
        await wait(900);
        const e = await ev((rank) => { const q = window.__qa, c = q.c, cd = c._champData(); const t = q.take(); return { exp: q.sv(cd.E.damageByLevel, rank) + cd.E.bonusAdRatio * c._renektonExtraAD(), t }; }, rank);
        rec(`E 1타 r${rank}`, e.exp, e.t[0]?.dmg, e.t[0]);
      }
      await ev(() => { const q = window.__qa, c = q.c; q.reset({ rank: 3, dist: 150 }); c.castAbility('R', q.E.getWorldPosition(q.E.dummies[0]).clone()); });
      await wait(400); await ev(() => window.__qa.take()); await wait(2000);
      const r = await ev(() => { const q = window.__qa, c = q.c, cd = c._champData().R; const t = q.take(); return { perSec: q.sv(cd.damagePerSecond, 3) + cd.bonusAdRatio * c._renektonExtraAD() + cd.apRatio * c.stats.abilityPower, sum: q.sum(t), n: t.length, f: t[0] }; });
      rec('R 2초 피해(r3)', r.perSec * 2, r.sum, r.f, `틱 ${r.n}`);
      // 기본 공격: 치명타 100%로 실제 평타 → 치명타·적중 효과(일반 평타 경로와 같은가)
      await ev(() => { const q = window.__qa, c = q.c; q.reset({ dist: 120 }); c._renekton.wArmed = false; c.items = [{ id: 'bfSword', count: 1 }, { id: 'cloakOfAgility', count: 4 }]; window.recomputeItemStats(c); c.selectTarget(q.E.dummies[0]); });
      await wait(2500);
      const aa = await ev(() => { const q = window.__qa, c = q.c; const t = q.take(); c.currentTarget = null; c.setState('IDLE'); return { AD: c.stats.attackDamage, crit: c.stats.critChance, critMult: c.stats.critMultiplier, hits: t.slice(0, 4) }; });
      rec('평타(치명타 확률 100%)', aa.AD * (aa.critMult || 1.75), aa.hits[0]?.dmg, aa.hits[0], `crit ${aa.crit}, 타격 ${aa.hits.map((h) => h.dmg).join('/')}`);
    }

    if (id === 'mordekaiser') {
      for (const rank of [1, 5]) {
        const r = await ev((rank) => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({ rank, dist: 300 }); const cd = c._champData();
          q.E.dummies.slice(1).forEach((x) => x.mesh.position.set(q.L(900), 0, q.L(900)));
          c._mordeQOnCast(c.root.position.clone(), new q.E.THREE.Vector3(0, 0, -1)); const qt = q.take();
          const lb = cd.Q.levelBonusDamage; const lvB = c.champLevel >= lb.startLevel ? Math.min(lb.maxLevel - lb.startLevel + 1, c.champLevel - lb.startLevel + 1) * lb.perLevel : 0;
          const eq = (q.sv(cd.Q.damageByLevel, rank) + cd.Q.bonusAdRatio * c._getBonusAD() + cd.Q.apRatio * c.stats.abilityPower + lvB) * (1 + q.sv(cd.Q.singleTargetBonusPercentByLevel, rank) / 100);
          c._mordeEOnCast(d); const et = q.take();
          return { qt, eq, et, ee: q.sv(cd.E.damageByLevel, rank) + cd.E.apRatio * c.stats.abilityPower }; }, rank);
        rec(`Q 단일 r${rank}`, r.eq, r.qt[0]?.dmg, r.qt[0]); rec(`E r${rank}`, r.ee, r.et[0]?.dmg, r.et[0]);
      }
      const p = await ev(() => { const q = window.__qa, c = q.c, d = q.E.dummies[0]; q.reset({}); const cd = c._champData();
        c._onBasicAttackHit(d, null, false, null, false); const t = q.take(); return { exp: cd.passive.apRatio * c.stats.abilityPower, t }; });
      rec('패시브 평타 추가 마법 피해', p.exp, p.t[0]?.dmg, p.t[0]);
      await ev(() => { const q = window.__qa, c = q.c; q.reset({ dist: 150 }); c._morde.auraExpiresAt = performance.now() + 2000; c._morde._auraAccum = 0; });
      await wait(2100);
      const a = await ev(() => { const q = window.__qa, c = q.c, p = c._champData().passive, d = q.E.dummies[0]; const t = q.take(); const lvT = Math.min(1, Math.max(0, (c.champLevel - 1) / 17));
        return { perSec: p.auraDamagePerSec + p.auraApRatio * c.stats.abilityPower + d.maxHp * (p.auraTargetMaxHpPercentAtLevel1 + 4 * lvT) / 100, sum: q.sum(t), n: t.filter((x) => x.d === 0).length, f: t[0] }; });
      rec('패시브 오라 2초', a.perSec * 2, a.sum, a.f, `틱 ${a.n}`);
    }
    res.rows = rows; res.errors = errors;
    out[id] = res;
    await page.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})();
