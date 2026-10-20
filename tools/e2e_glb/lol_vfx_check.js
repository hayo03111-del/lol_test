// 89차 원작 파티클 엔진 브라우저 점검(헤드리스 Chromium): ritobin 텍스트로 쓴 시험용 정의(카메라 쿼드 구 폭발, 바닥에 눕힌 임의 쿼드 고리,
// 닐라를 따라가는 카메라 트레일, 허수아비로 가는 빔)를 엔진에 등록·재생하고 스크린샷·오류·입자 수를 확인한다.
// 사용법: THREE_DIR=<three package> [E2E_HIDE_MAP=1] node tools/e2e_glb/lol_vfx_check.js <스크린샷 폴더>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
const DEF = `#PROP_text
entries: map[hash,embed] = {
    "Test/Burst" = VfxSystemDefinitionData {
        particleName: string = "Test_Burst"
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "Sparks"
                isSingleParticle: flag = true
                rate: embed = ValueFloat { constantValue: f32 = 24 }
                particleLifetime: embed = ValueFloat { constantValue: f32 = 1.2 }
                SpawnShape: pointer = VfxShapeSphere { radius: f32 = 40 }
                birthVelocity: embed = ValueVector3 { constantValue: vec3 = { 300, 0, 0 } }
                birthDrag: embed = ValueVector3 { constantValue: vec3 = { 2, 2, 2 } }
                birthScale0: embed = ValueVector3 { constantValue: vec3 = { 35, 35, 35 } }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData {
                        times: list[f32] = { 0, 1 }
                        values: list[vec3] = { { 1, 1, 1 }, { 0.2, 0.2, 0.2 } }
                    }
                }
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 0.2, 1 }
                        values: list[vec4] = { { 0.6, 0.9, 1, 0 }, { 0.6, 0.9, 1, 1 }, { 0.2, 0.4, 1, 0 } }
                    }
                }
                blendMode: u8 = 0
                texture: string = "assets/nilah/nilah_base_glow2.png"
            }
            VfxEmitterDefinitionData {
                emitterName: string = "GroundRing"
                isSingleParticle: flag = true
                rate: embed = ValueFloat { constantValue: f32 = 1 }
                particleLifetime: embed = ValueFloat { constantValue: f32 = 1.5 }
                primitive: pointer = VfxPrimitiveArbitraryQuad {}
                birthRotation0: embed = ValueVector3 { constantValue: vec3 = { 90, 0, 0 } }
                birthRotationalVelocity0: embed = ValueVector3 { constantValue: vec3 = { 0, 0, 120 } }
                birthScale0: embed = ValueVector3 { constantValue: vec3 = { 250, 250, 1 } }
                Color: embed = ValueColor { constantValue: vec4 = { 0.5, 0.8, 1, 0.8 } }
                blendMode: u8 = 0
                texture: string = "assets/nilah/nilah_base_r_cascircle_swirl_scroll_dark_mask.png"
            }
        }
    }
    "Test/Trail" = VfxSystemDefinitionData {
        particleName: string = "Test_Trail"
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "Ribbon"
                rate: embed = ValueFloat { constantValue: f32 = 40 }
                particleLifetime: embed = ValueFloat { constantValue: f32 = 0.6 }
                EmitterPosition: embed = ValueVector3 { constantValue: vec3 = { 0, 60, 0 } }
                birthScale0: embed = ValueVector3 { constantValue: vec3 = { 30, 1, 1 } }
                scale0: embed = ValueVector3 {
                    dynamics: pointer = VfxAnimatedVector3fVariableData { times: list[f32] = { 0, 1 }, values: list[vec3] = { { 1, 1, 1 }, { 0, 0, 0 } } }
                }
                Color: embed = ValueColor { constantValue: vec4 = { 0.7, 0.95, 1, 1 } }
                primitive: pointer = VfxPrimitiveCameraTrail {
                    mTrail: embed = VfxTrailDefinitionData { mMode: u8 = 1, mBirthTilingSize: embed = ValueVector3 { constantValue: vec3 = { 200, 0, 0 } } }
                }
                blendMode: u8 = 0
                texture: string = "assets/nilah/nilah_base_plasma_02_trail.png"
            }
        }
    }
    "Test/Beam" = VfxSystemDefinitionData {
        particleName: string = "Test_Beam"
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                isSingleParticle: flag = true
                rate: embed = ValueFloat { constantValue: f32 = 1 }
                particleLifetime: embed = ValueFloat { constantValue: f32 = 3 }
                primitive: pointer = VfxPrimitiveBeam { mBeam: embed = VfxBeamDefinitionData { mMode: u8 = 0 } }
                birthScale0: embed = ValueVector3 { constantValue: vec3 = { 60, 0, 0 } }
                birthUvScrollRate: embed = ValueVector2 { constantValue: vec2 = { 1.5, 0 } }
                Color: embed = ValueColor { constantValue: vec4 = { 1, 0.7, 1, 1 } }
                blendMode: u8 = 0
                texture: string = "assets/nilah/nilah_base_r_energystreaksadd.png"
            }
        }
    }
}
`;
(async () => {
  const shotDir = process.argv[2];
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [], warns = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (/LOL VFX/.test(m.text())) warns.push(m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e && window.lolVfx, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'nilah'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'nilah', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const reg = await page.evaluate((def) => {
    const v = window.lolVfx; v.textures.resolve = (p) => p; // 시험 정의는 저장소 경로를 그대로 쓴다
    v.register(def);
    const E = window.__e2e, c = window.controller, L = E.lolRangeToWorld;
    c.root.position.set(0, 0, 0); E.dummies[0].mesh.position.set(L(350), 0, -L(250));
    v.timeScale = 0.25; // 헤드리스는 느려서 느리게 재생해 찍는다
    window.__burst = v.spawn('Test_Burst', { attach: c.root });
    window.__trail = v.spawn('Test_Trail', { attach: c.root });
    window.__beam = v.spawn('Test_Beam', { attach: c.root, target: E.dummies[0].mesh });
    c.moveTo(new E.THREE.Vector3(-L(400), 0, L(200)));
    return { names: Object.keys(v.registry), systems: v.systems.length };
  }, DEF);
  const counts = [];
  for (const t of [400, 1200, 2400]) {
    await page.waitForTimeout(t - (counts.length ? [400, 1200, 2400][counts.length - 1] : 0));
    counts.push(await page.evaluate(() => window.lolVfx.systems.map((s) => s.emitters.map((e) => `${e.def.emitterName || e.primType}:${e.particles.length}/${e.batch.count}`).join(','))));
    if (shotDir) await page.screenshot({ path: `${shotDir}/lolvfx_${t}.png` });
  }
  // 빔 끝점(장면 좌표)이 닐라 → 허수아비인지 숫자로 확인
  const beam = await page.evaluate(() => {
    const v = window.lolVfx, s = window.__beam; if (!s || !s.emitters[0]) return null;
    const b = s.emitters[0].batch, T = window.__e2e.THREE, out = [];
    for (let k = 0; k < 4; k++) { const w = new T.Vector3(b.pos[k * 3], b.pos[k * 3 + 1], b.pos[k * 3 + 2]).applyMatrix4(v.root.matrixWorld); out.push([+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)]); }
    const c = window.controller.root.position, d = window.__e2e.dummies[0].mesh.position;
    return { quad: out, nilah: [+c.x.toFixed(2), +c.z.toFixed(2)], dummy: [+d.x.toFixed(2), +d.z.toFixed(2)] };
  });
  console.log(JSON.stringify({ reg, counts, beam, errors, warns: [...new Set(warns)] }, null, 1));
  await browser.close(); srv.close();
})();
