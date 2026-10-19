// 28차 수정 점검(헤드리스 Chromium + 저장소 모델): 모데카이저 죽음의 세계 중심·바깥 체력 바 숨김, 레넥톤 R 크기,
// 닐라 Q 이펙트·R 따라오기, 이즈리얼 W 뒤 이동 재개·E 시전, 애쉬 W 범위 표시, 바루스 W 쿨 환급·R 폭·Q 조준 방향,
// 아리 R 연타 방지, 벡스 R 스킬샷·Q 파동, 체력 바 숫자 제거·보호막 구간, 노틸러스 Q 당김 시간.
// 사용법: THREE_DIR=<three package> E2E_HIDE_MAP=1 node tools/e2e_glb/fix28_check.js [스크린샷 접두어]
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
  const load = async (id) => { await page.evaluate((id) => { const s = document.getElementById('libraryChampSelect'); s.value = id; s.dispatchEvent(new Event('change')); }, id); await page.waitForFunction((id) => window.controller && window.controller.championId === id, id, { timeout: 30000 }); await wait(700); };
  const shot = async (name) => {
    if (!process.argv[2]) return;
    await page.evaluate(() => { document.querySelectorAll('.panelHeader').forEach((h) => { h.parentElement.style.visibility = 'hidden'; }); for (const id of ['championPanel', 'championPanelToggle', 'debugPanel', 'debugPanelToggle']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } });
    await page.screenshot({ path: `${process.argv[2]}_${name}.png` });
  };
  // 시야 안 기본 배치: 플레이어 (0,0,0), 허수아비는 -z 쪽(맵 원점 +x 쪽은 시야 밖)
  const reset = (extra) => page.evaluate((extra) => {
    const E = window.__e2e, c = window.controller;
    c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.targetPos = null; c.currentTarget = null; c.attackOrderActive = false;
    c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.hp = c.maxHp; c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
    for (const s of ['Q', 'W', 'E', 'R']) c.skillLevels[s] = Math.max(1, c.skillLevels[s] || 1);
    for (const d of E.dummies) { d.hp = d.maxHp = 1e6; d.statusEffects = []; d._pullState = null; d.mesh.position.set(40, 0, 40); }
    void extra;
  }, extra);
  const r = {};

  // 1) 모데카이저 R: 중심 = 모데카이저, 바깥 유닛 체력 바 숨김 → 끝나면 복원
  await load('mordekaiser'); await reset();
  r.morde = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1] = E.dummies;
    d0.mesh.position.set(0, 0, -L(400)); d1.mesh.position.set(L(200), 0, -L(300));
    c.skillLevels.R = 1; c.currentTarget = d0; c.castAbility('R', E.getWorldPosition(d0).clone());
    setTimeout(() => {
      const R = c._morde.realmId && window.getDeathRealmForE2E(c._morde.realmId);
      const out = { inRealm: !!c._morde.isInDeathRealm, centerFromMordeLol: R ? Math.round(E.worldDistanceToLol(Math.hypot(R.center.x - c.root.position.x, R.center.z - c.root.position.z))) : null,
        outsiderBarHidden: d1.labelDiv.style.visibility === 'hidden', targetBarHidden: d0.labelDiv.style.visibility === 'hidden' };
      c._mordeEndDeathRealm('e2e');
      setTimeout(() => res({ ...out, outsiderBarRestored: d1.labelDiv.style.visibility === '' }), 100);
    }, 1200);
  }));

  // 2) 레넥톤 R: 모델 크기
  await load('renekton'); await reset();
  r.renekton = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, T = E.THREE, c = window.controller;
    const h = () => { const b = new T.Box3().setFromObject(c.model); return b.max.y - b.min.y; };
    const s0 = (c._sizeScale || 1), h0 = h();
    c.castAbility('R', null);
    setTimeout(() => { const s1 = (c._sizeScale || 1), h1 = h(); c._renektonEndR(); setTimeout(() => res({ scaleBefore: +s0.toFixed(3), scaleDuring: +s1.toFixed(3), heightRatio: +(h1 / h0).toFixed(3), scaleAfterEnd: +(c._sizeScale || 1).toFixed(3) }), 100); }, 600);
  }));

  // 3) 닐라: Q 이펙트(판정 직선만), R 이펙트가 닐라를 따라감
  await load('nilah'); await reset();
  r.nilah = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    const sceneCount0 = E.scene.children.length, sprites0 = E.vfx.active.filter((f) => f.sprite).length;
    c.castAbility('Q', new E.THREE.Vector3(0, 0, -L(500)));
    let line = null, maxExtraSprites = 0, maxExtraScene = 0;
    const iv = setInterval(() => {
      const fx = E.vfx.active.find((f) => f.tag === 'groundShape' && f.shape.kind === 'line'); if (fx && !line) line = { lengthLol: Math.round(E.worldDistanceToLol(fx.shape.length)), widthLol: Math.round(E.worldDistanceToLol(fx.shape.width)) };
      maxExtraSprites = Math.max(maxExtraSprites, E.vfx.active.filter((f) => f.sprite).length - sprites0);
      maxExtraScene = Math.max(maxExtraScene, E.scene.children.length - sceneCount0);
    }, 15);
    setTimeout(() => {
      clearInterval(iv);
      const q = { line, extraSprites: maxExtraSprites, extraSceneObjects: maxExtraScene };
      c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns.R = 0; c.skillLevels.R = 1;
      const before = new Set(E.scene.children);
      c.castAbility('R', null);
      setTimeout(() => {
        const added = E.scene.children.filter((o) => !before.has(o) && o.isGroup);
        const p0 = c.root.position.clone();
        c.root.position.x += L(200); // R 도중 닐라 이동
        setTimeout(() => {
          const near = added.map((g) => Math.round(E.worldDistanceToLol(Math.hypot(g.position.x - c.root.position.x, g.position.z - c.root.position.z))));
          res({ q, rVfxGroups: added.length, rVfxDistFromNilahAfterMoveLol: near, movedLol: Math.round(E.worldDistanceToLol(c.root.position.x - p0.x)) });
        }, 120);
      }, 100);
    }, 900);
  }));

  // 4) 이즈리얼: W 뒤 이동 재개, 최대 프레임 간격, E 여러 상황에서 시전
  await load('ezreal'); await reset();
  r.ezreal = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d0 = E.dummies[0];
    d0.mesh.position.set(L(300), 0, -L(700));
    const dest = new E.THREE.Vector3(0, 0, -L(1200));
    c.moveTo(dest);
    let last = performance.now(), maxGap = 0; let raf = true;
    const tick = () => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; if (raf) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    setTimeout(() => {
      const zBefore = c.root.position.z;
      c.castAbility('W', E.getWorldPosition(d0).clone());
      const wKey = c.currentActionKey;
      setTimeout(() => {
        const w = { wKey, stateAfter: c.state, actionAfter: c.currentActionKey, movedAfterWLol: Math.round(E.worldDistanceToLol(zBefore - c.root.position.z)), maxFrameGapMs: Math.round(maxGap) };
        raf = false;
        // E: (a) 정지 (b) 이동 중 (c) W 시전 직후(0.1초) (d) 평타 중
        const tries = [];
        const tryE = (label, prep, after) => new Promise((ok) => {
          c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE'); c.cooldowns = { Q: 0, W: 0, E: 0, R: 0 }; c.mp = c.maxMp; c.root.position.set(0, 0, 0);
          prep();
          setTimeout(() => {
            const p0 = c.root.position.clone(), cd0 = c.cooldowns.E;
            c.castAbility('E', new E.THREE.Vector3(c.root.position.x, 0, c.root.position.z - L(400)));
            setTimeout(() => { tries.push({ label, cast: c.cooldowns.E > cd0, blinkedLol: Math.round(E.worldDistanceToLol(c.root.position.distanceTo(p0))), action: c.currentActionKey }); ok(); }, 600);
          }, after);
        });
        (async () => {
          await tryE('idle', () => {}, 50);
          await tryE('moving', () => c.moveTo(new E.THREE.Vector3(L(600), 0, 0)), 200);
          await tryE('afterW', () => c.castAbility('W', new E.THREE.Vector3(0, 0, -L(500))), 100);
          await tryE('attacking', () => { d0.mesh.position.set(0, 0, -L(400)); c.selectTarget(d0); }, 250);
          await tryE('duringQ', () => { d0.mesh.position.set(40, 0, 40); c.currentTarget = null; c.attackOrderActive = false; c.castAbility('Q', new E.THREE.Vector3(0, 0, -L(500))); }, 100);
          await tryE('duringR', () => c.castAbility('R', new E.THREE.Vector3(0, 0, -L(500))), 300);
          res({ w, e: tries });
        })();
      }, 900);
    }, 400);
  }));

  // 5) 애쉬 W: 판정 부채꼴 표시
  await load('ashe'); await reset();
  r.asheW = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c.castAbility('W', new E.THREE.Vector3(0, 0, -L(500)));
    let cone = null; const iv = setInterval(() => { const fx = E.vfx.active.find((f) => f.tag === 'groundShape' && f.shape.kind === 'cone'); if (fx && !cone) cone = { rangeLol: Math.round(E.worldDistanceToLol(fx.shape.range)), angleDeg: fx.shape.angleDeg }; }, 15);
    setTimeout(() => { clearInterval(iv); res({ cone }); }, 700);
  }));
  await reset();
  await page.evaluate(() => { const E = window.__e2e; window.controller.castAbility('W', new E.THREE.Vector3(0, 0, -E.lolRangeToWorld(500))); });
  await page.waitForFunction(() => window.__e2e.vfx.active.some((f) => f.tag === 'groundShape'), null, { timeout: 5000 }); await wait(60); await shot('asheW');

  // 6) 바루스: 오한 3중첩 E로 터뜨림 → Q·W·E 쿨 감소, R은 그대로 / R 데이터 / Q 충전 중 커서 방향 따라감
  await load('varus'); await reset();
  r.varus = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d0 = E.dummies[0];
    d0.mesh.position.set(0, 0, -L(600));
    E.applyStatus(d0, { id: 'varusBlight', type: 'BLIGHT', duration: 6, value: 0, source: c }); d0.statusEffects.find((s) => s.id === 'varusBlight').stacks = 3;
    c.cooldowns = { Q: 10, W: 30, E: 0, R: 50 };
    const before = { ...c.cooldowns };
    c.castAbility('E', E.getWorldPosition(d0).clone());
    setTimeout(() => {
      const cd = c._champData();
      res({ before: { Q: before.Q, W: before.W, R: before.R }, after: { Q: +c.cooldowns.Q.toFixed(1), W: +c.cooldowns.W.toFixed(1), R: +c.cooldowns.R.toFixed(1) }, rWidth: cd.R.width, rRange: cd.R.range, rSpeed: cd.R.missileSpeed });
    }, 1200);
  }));
  // Q 충전 중 커서 이동(실제 마우스) → 조준·바라보는 방향이 따라간다
  await reset();
  const toScreen = (x, z) => page.evaluate(([x, z]) => { const E = window.__e2e; const v = new E.THREE.Vector3(x, 0, z).project(E.camera); const rc = document.querySelector('canvas').getBoundingClientRect(); return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height }; }, [x, z]);
  const L = (lol) => lol * 0.008643;
  let pt = await toScreen(0, -L(500)); await page.mouse.move(pt.x, pt.y); await wait(100);
  await page.keyboard.down('KeyQ'); await wait(300);
  const dirA = await page.evaluate(() => { const q = window.controller._varus.qCharge; return q ? +Math.atan2(q.dir.x, q.dir.z).toFixed(2) : null; });
  pt = await toScreen(L(500), 0); await page.mouse.move(pt.x, pt.y); await wait(400);
  const dirB = await page.evaluate(() => { const c = window.controller, q = c._varus.qCharge; const f = new window.__e2e.THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion); return q ? { aim: +Math.atan2(q.dir.x, q.dir.z).toFixed(2), facing: +Math.atan2(f.x, f.z).toFixed(2), aimArrow: !!(window.__e2e.skillAim.lastAim && window.__e2e.skillAim.lastAim.arrow) } : null; });
  await shot('varusQ');
  await page.keyboard.up('KeyQ'); await wait(300);
  r.varusQ = { dirAtStart: dirA, afterCursorMove: dirB, charging: await page.evaluate(() => !!window.controller._varus.qCharge) };

  // 7) 아리 R: 1초 안 재시전 막힘, 1초 뒤 재시전
  await load('ahri'); await reset();
  r.ahriR = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    let dashes = 0; const orig = c.faceDirectionInstant.bind(c);
    const p = () => c.root.position.clone();
    const p0 = p();
    c.castAbility('R', new E.THREE.Vector3(0, 0, -L(500)));
    const charges1 = c._ahri.rCharges;
    setTimeout(() => {
      c.castAbility('R', new E.THREE.Vector3(0, 0, -L(1000)));
      const chargesBlocked = c._ahri.rCharges;
      setTimeout(() => {
        c.currentActionKey = null; c.currentPhase = null; c.setState('IDLE');
        c.castAbility('R', new E.THREE.Vector3(0, 0, -L(1500)));
        res({ chargesAfterFirst: charges1, chargesAfterRecastAt0_4s: chargesBlocked, chargesAfterRecastAt1_2s: c._ahri.rCharges });
      }, 800);
    }, 400);
    void dashes; void orig; void p0;
  }));

  // 8) 벡스: R 방향 스킬샷(대상 선택 없음) → 직선 위 허수아비 명중, 재시전 돌진 / Q 파동 표시·사거리
  await load('vex'); await reset();
  r.vexR = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1] = E.dummies;
    d0.mesh.position.set(0, 0, -L(900)); d1.mesh.position.set(L(400), 0, -L(600));
    c.skillLevels.R = 1; c.currentTarget = null;
    const hp0 = d0.hp, hp1 = d1.hp;
    c.castAbility('R', new E.THREE.Vector3(0, 0, -L(1500)));
    setTimeout(() => {
      const first = { lineHit: d0.hp < hp0, offLineHit: d1.hp < hp1, recastReady: c._vex.recastTarget === d0 };
      const p0 = c.root.position.clone();
      c.castAbility('R', null);
      setTimeout(() => res({ ...first, dashedLol: Math.round(E.worldDistanceToLol(c.root.position.distanceTo(p0))), recastDamaged: d0.hp < hp0 - 1 }), 1200);
    }, 1400);
  }));
  await reset();
  r.vexQ = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, [d0, d1] = E.dummies;
    d0.mesh.position.set(0, 0, -L(1100)); d1.mesh.position.set(0, 0, -L(1400));
    const hp0 = d0.hp, hp1 = d1.hp;
    c.castAbility('Q', new E.THREE.Vector3(0, 0, -L(500)));
    let maxFrontLol = 0, meshSeen = false;
    const iv = setInterval(() => { const m = c._vex.qWaveMesh; if (m) { meshSeen = true; maxFrontLol = Math.max(maxFrontLol, Math.round(E.worldDistanceToLol(-m.position.z))); } }, 15);
    setTimeout(() => { clearInterval(iv); res({ waveShown: meshSeen, waveMaxCenterLol: maxFrontLol, waveCleared: !c._vex.qWaveMesh, hitAt1100: d0.hp < hp0, hitAt1400: d1.hp < hp1 }); }, 3500);
  }));

  // 9) 체력 바: 숫자 없음, 보호막 구간
  await load('nautilus'); await reset();
  r.hpBar = await page.evaluate(() => new Promise((res) => {
    const c = window.controller, div = c.healthBarLabelDiv;
    c.castAbility('W', null); // 노틸러스 W 보호막
    setTimeout(() => {
      const sb = div.querySelector('.hpBarShield');
      res({ valueTextEl: !!div.querySelector('.hpValueText'), digitsInBar: /\d/.test((div.querySelector('.hpBarOuter') || {}).textContent || ''), shield: Math.round(c.shield), shieldSegmentWidth: sb ? sb.style.width : null, hudText: document.getElementById('hpText').textContent });
    }, 400);
  }));
  await shot('hpBar');

  // 10) 노틸러스 Q: 0.9초 당김, 1초 기절
  await reset();
  r.nautilusQ = await page.evaluate(() => new Promise((res) => {
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld, d0 = E.dummies[0];
    d0.mesh.position.set(0, 0, -L(700));
    c.castAbility('Q', new E.THREE.Vector3(0, 0, -L(700)));
    let hitAt = null, pullEndAt = null, stunSec = null; const t0 = performance.now();
    const iv = setInterval(() => {
      const st = (d0.statusEffects || []).find((s) => s.id === 'nautilusQ_stun');
      if (st && hitAt == null) { hitAt = performance.now(); stunSec = +st.duration.toFixed(2); }
      if (hitAt != null && pullEndAt == null && !c._nautilus.qPull) pullEndAt = performance.now();
      if (performance.now() - t0 > 3000) { clearInterval(iv); res({ hit: hitAt != null, pullSec: pullEndAt && hitAt ? +((pullEndAt - hitAt) / 1000).toFixed(2) : null, stunSec, gapLol: Math.round(E.worldDistanceToLol(Math.abs(d0.mesh.position.z - c.root.position.z))) }); }
    }, 15);
  }));
  r.errors = errors.slice(0, 5);
  console.log(JSON.stringify(r, null, 1));
  await browser.close(); srv.close();
})();
