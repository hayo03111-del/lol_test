// 89차 원작 파티클 엔진(src/vfx) 테스트 - 브라우저 없이 파서·값 계산·시뮬레이션이 lol-meta-wiki 문서 규칙대로 도는지 본다.
// THREE는 엔진이 쓰는 만큼만 흉내 낸다(그리기 결과는 버퍼에 적힌 숫자로 확인).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else { pass++; console.log('ok:', msg); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearArr = (a, b, eps = 1e-6) => a.length === b.length && a.every((x, i) => near(x, b[i], eps));

// --- THREE 흉내 ---
class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
class Group { constructor() { this.children = []; this.scale = { set: (x, y, z) => { this.sx = x; this.sy = y; this.sz = z; } }; } add(o) { this.children.push(o); } remove(o) { this.children = this.children.filter((c) => c !== o); } }
class BufferAttribute { constructor(array, size) { this.array = array; this.itemSize = size; this.needsUpdate = false; } }
class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } setIndex(i) { this.index = i; } setDrawRange(s, c) { this.drawCount = c; } dispose() {} }
class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.visible = true; } }
class ShaderMaterial { constructor(o) { Object.assign(this, o); } dispose() {} }
class DataTexture { constructor() { this.needsUpdate = false; } }
class TextureLoader { load(url) { return { url, colorSpace: null }; } }
const THREE = { Vector3, Group, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, DataTexture, TextureLoader, SRGBColorSpace: 'srgb', ClampToEdgeWrapping: 1, DoubleSide: 2,
  AdditiveBlending: 'add', NormalBlending: 'normal', CustomBlending: 'custom', NoBlending: 'none', AddEquation: 'addEq', MinEquation: 'min', MaxEquation: 'max',
  ZeroFactor: 0, OneFactor: 1, OneMinusSrcColorFactor: 'omsc', OneMinusSrcAlphaFactor: 'omsa', OneMinusDstAlphaFactor: 'omda', DstAlphaFactor: 'da' };

const ctx = vm.createContext({ console, Math, THREE, lolRangeToWorld: (x) => x * 0.01 });
const src = ['src/vfx/lol_vfx_defaults.js', 'src/vfx/lol_vfx_bin_text.js', 'src/vfx/lol_vfx_values.js', 'src/vfx/lol_vfx_engine.js']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
vm.runInContext(src + `
this.lolBinParse = lolBinParse; this.lolBinCollectVfxSystems = lolBinCollectVfxSystems; this.lolVfxSample = lolVfxSample; this.lolVfxIntegrate = lolVfxIntegrate;
this.lolVfxIntegrate2 = lolVfxIntegrate2; this.lolVfxEmitterPhase = lolVfxEmitterPhase; this.lolVfxCanEmit = lolVfxCanEmit; this.lolVfxEmitCount = lolVfxEmitCount;
this.lolVfxImportanceExists = lolVfxImportanceExists; this.lolVfxImportanceRate = lolVfxImportanceRate; this.lolVfxEulerZXY = lolVfxEulerZXY; this.lolVfxMat3Apply = lolVfxMat3Apply;
this.lolVfxSampleShape = lolVfxSampleShape; this.lolVfxFrame = lolVfxFrame; this.lolVfxColorLookup = lolVfxColorLookup; this.LolVfxManager = LolVfxManager;
this.lolVfxCoverage = lolVfxCoverage; this.lolVfxWithDefaults = lolVfxWithDefaults; this.lolVfxDefaultTexturePath = lolVfxDefaultTexturePath; this.LOL_VFX_SCHEMA = LOL_VFX_SCHEMA;`, ctx);
const C = ctx;

// ---------- 1. ritobin 텍스트 파서 ----------
const TEXT = `#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {}
entries: map[hash,embed] = {
    "Characters/Test/Skins/Skin0/Particles/Test_Q" = VfxSystemDefinitionData {
        particleName: string = "Test_Q"   # 주석
        flags: u16 = 212
        complexEmitterDefinitionData: list[pointer] = {
            VfxEmitterDefinitionData {
                emitterName: string = "Core"
                rate: embed = ValueFloat {
                    constantValue: f32 = 10
                }
                lifetime: option[f32] = {
                    1
                }
                particleLifetime: embed = ValueFloat {
                    constantValue: f32 = 0.5
                }
                isSingleParticle: flag = false
                birthScale0: embed = ValueVector3 {
                    constantValue: vec3 = { 50, 50, 50 }
                }
                Color: embed = ValueColor {
                    dynamics: pointer = VfxAnimatedColorVariableData {
                        times: list[f32] = { 0, 1 }
                        values: list[vec4] = {
                            { 1, 0, 0, 1 }
                            { 0, 0, 1, 0 }
                        }
                    }
                }
                blendMode: u8 = 1
                texture: string = "ASSETS/Characters/Test/Skins/Base/Particles/Test_Glow.tex"
                primitive: pointer = VfxPrimitiveArbitraryQuad {}
                SpawnShape: pointer = null
                0x1234abcd: hash = 0xdeadbeef
                linkField: link = "Some/Other/Path"
                texDiv: vec2 = { 2, 2 }
            }
        }
    }
    0xabcdef01 = SkinCharacterDataProperties {
        skinClassification: u32 = 1
        iconCircle: option[string] = {}
    }
}
`;
const parsed = C.lolBinParse(TEXT);
const sysQ = parsed.entries['Characters/Test/Skins/Skin0/Particles/Test_Q'];
assert(parsed.root.type === 'PROP' && parsed.root.version === 3 && Array.isArray(parsed.root.linked), '최상위 항목(type/version/linked) 읽기');
assert(sysQ && sysQ.__type === 'VfxSystemDefinitionData' && sysQ.particleName === 'Test_Q' && sysQ.flags === 212, 'map[hash,embed] 항목·문자열·주석 처리');
const em0 = sysQ.complexEmitterDefinitionData[0];
assert(em0.__type === 'VfxEmitterDefinitionData' && em0.rate.__type === 'ValueFloat' && em0.rate.constantValue === 10, 'pointer/embed 클래스와 f32');
assert(em0.lifetime === 1 && em0.isSingleParticle === false, 'option[f32]은 값 하나, flag는 불리언');
assert(nearArr(em0.birthScale0.constantValue, [50, 50, 50]) && nearArr(em0.texDiv, [2, 2]), 'vec3·vec2');
assert(em0.Color.dynamics.values.length === 2 && nearArr(em0.Color.dynamics.values[1], [0, 0, 1, 0]), 'list[vec4] 줄 단위 원소');
assert(em0.SpawnShape === null && em0.primitive.__type === 'VfxPrimitiveArbitraryQuad', '빈 pointer는 null, 필드 없는 pointer는 클래스만');
assert(em0['0x1234abcd'] === '0xdeadbeef' && em0.linkField === 'Some/Other/Path', '16진수 해시 키·값과 link');
assert(parsed.entries['0xabcdef01'].iconCircle === null, '비어 있는 option은 null');
const reg = C.lolBinCollectVfxSystems(parsed);
assert(reg.Test_Q === sysQ && reg['Characters/Test/Skins/Skin0/Particles/Test_Q'] === sysQ, 'VFX 정의를 경로·이름으로 찾기');
let threw = false; try { C.lolBinParse('entries: map[hash,embed] = {\n "x" = VfxSystemDefinitionData {\n  a: f32 = \n'); } catch (e) { threw = /행/.test(e.message); }
assert(threw, '문법 오류는 행·열을 알려주는 예외');
// CommunityDragon JSON 형식
const cd = C.lolBinParse(JSON.stringify({ 'Characters/Test/Skins/Skin0/Particles/Test_W': { __type: 'VfxSystemDefinitionData', particleName: 'Test_W', '{1234abcd}': 3, complexEmitterDefinitionData: [] } }));
assert(cd.entries['Characters/Test/Skins/Skin0/Particles/Test_W'].__type === 'VfxSystemDefinitionData' && cd.entries['Characters/Test/Skins/Skin0/Particles/Test_W']['0x1234abcd'] === 3, 'CommunityDragon .bin.json도 같은 모양으로(해시 키 {..} → 0x..)');

// ---------- 2. 값 계산 ----------
assert(C.lolVfxSample({ constantValue: 7 }, 0.5, null, 0) === 7, '상수값');
const curve = { constantValue: 99, dynamics: { times: [0, 0.5, 1], values: [0, 10, 20] } };
assert(near(C.lolVfxSample(curve, 0.25, null, 0), 5) && near(C.lolVfxSample(curve, -1, null, 0), 0) && near(C.lolVfxSample(curve, 2, null, 0), 20), '곡선이 있으면 상수 무시·선형 보간·양끝 고정');
const prob = { constantValue: 0, dynamics: { times: [0], values: [10], probabilityTables: [{ keyTimes: [0, 1], keyValues: [0.5, 1.5] }] } };
assert(near(C.lolVfxSample(prob, 0, () => 0, 0), 5) && near(C.lolVfxSample(prob, 0, () => 1, 0), 15) && near(C.lolVfxSample(prob, 0, () => 0.5, 0), 10), '확률표는 곱하는 배율(무작위 수로 keyTimes→keyValues)');
assert(near(C.lolVfxSample({ dynamics: { times: [0], values: [4], probabilityTables: [{ singleValue: 2 }] } }, 0, () => 0.3, 0), 8), '키가 없는 확률표는 singleValue');
const v3 = C.lolVfxSample({ dynamics: { times: [0, 1], values: [[0, 0, 0], [2, 4, 6]] } }, 0.5, null, [0, 0, 0]);
assert(nearArr(v3, [1, 2, 3]), '벡터 곡선은 채널별 보간');
// 적분값
assert(nearArr(C.lolVfxIntegrate({ constantValue: [1, 2, 3] }, 0.3, 2), [2, 4, 6]), '적분값: 상수만 있으면 평생 고정량(값×수명)');
assert(near(C.lolVfxIntegrate({ constantValue: 0, dynamics: { times: [0], values: [3] } }, 0.5, 2), 3), '적분값: 곡선 하나짜리 상수 속도 3 × (0.5×2초) = 3');
assert(near(C.lolVfxIntegrate({ constantValue: 0, dynamics: { times: [0, 1], values: [0, 2] } }, 1, 1), 1), '적분값: 0→2 선형 속도의 1초 적분 = 1');
assert(nearArr(C.lolVfxIntegrate2({ constantValue: [0, -1, 0] }, 1, 3), [0, -9, 0]), 'worldAcceleration 상수: 값×수명²의 고정 변위');
assert(near(C.lolVfxIntegrate2({ constantValue: [0, 0, 0], dynamics: { times: [0], values: [[0, 2, 0]] } }, 1, 1)[1], 1, 1e-3), 'worldAcceleration 곡선: 가속 2로 1초 → 변위 1');

// ---------- 3. 시계·방출 규칙 ----------
assert(C.lolVfxEmitterPhase({}, 5) === 0, '끝·주기 없으면 위상 0');
assert(near(C.lolVfxEmitterPhase({ lifetime: 4, timeBeforeFirstEmission: 1 }, 3), 0.5), '위상 = (시각 - 첫 방출 전 시간) / lifetime');
assert(near(C.lolVfxEmitterPhase({ lifetime: 4, period: 2, timeActiveDuringPeriod: 1 }, 0.5), 0.5), '위상의 D는 설정된 값 중 가장 작은 것');
assert(!C.lolVfxCanEmit({ timeBeforeFirstEmission: 1 }, 0.5) && C.lolVfxCanEmit({ timeBeforeFirstEmission: 1 }, 1.2), 'timeBeforeFirstEmission 전에는 방출 안 함');
assert(C.lolVfxCanEmit({ lifetime: 3, timeBeforeFirstEmission: 1 }, 2.9) && !C.lolVfxCanEmit({ lifetime: 3, timeBeforeFirstEmission: 1 }, 3.1), 'lifetime은 시스템 시작부터 잰 끝 시각(지연 1, lifetime 3 → 2초 방출)');
assert(C.lolVfxCanEmit({ period: 2, timeActiveDuringPeriod: 0.5 }, 4.3) && !C.lolVfxCanEmit({ period: 2, timeActiveDuringPeriod: 0.5 }, 4.6), 'period 주기 앞 timeActiveDuringPeriod초만 방출');
assert(!C.lolVfxCanEmit({ timeActiveDuringPeriod: 0 }, 0), 'timeActiveDuringPeriod 0은 방출 안 함');
assert(C.lolVfxEmitCount(10, 0.05, true, false) === 1 && C.lolVfxEmitCount(10, 0.05, true, true) === 0, '첫 방출 0개는 1개로(HasVariableStartTime이면 아님)');
assert(C.lolVfxEmitCount(30, 1, false, false) === Math.floor(30 * 0.33 + 1), '단계당 최대 rate×0.33+1');
assert(C.lolVfxImportanceExists(0, 4) && !C.lolVfxImportanceExists(0, 3) && !C.lolVfxImportanceExists(4, 4) && C.lolVfxImportanceExists(4, 2), 'importance 존재 표(0은 아주 높음만, 4는 중간 이하만)');
assert(near(C.lolVfxImportanceRate(2, 2), 0.6) && C.lolVfxImportanceRate(3, 0) === 1, 'importance 방출 배율 표');

// ---------- 4. 회전·모양·플립북 ----------
const rz = C.lolVfxEulerZXY([0, 0, 90]);
assert(nearArr(C.lolVfxMat3Apply(rz, [1, 0, 0]), [0, 1, 0]), 'Z축 90°: X → Y');
const rzx = C.lolVfxEulerZXY([90, 0, 90]); // 먼저 Z 90(X→Y), 다음 X 90(Y→Z)
assert(nearArr(C.lolVfxMat3Apply(rzx, [1, 0, 0]), [0, 0, 1]), '회전 합성 순서 Z → X → Y');
const legacy = C.lolVfxSampleShape({ __type: 'VfxShapeLegacy', emitOffset: { constantValue: [0, 0, 10] }, emitRotationAngles: [{ constantValue: 90 }], emitRotationAxes: [[0, 1, 0]] }, 0, Math.random);
assert(nearArr(legacy.offset, [10, 0, 0], 1e-9) && nearArr(C.lolVfxMat3Apply(legacy.rot, [0, 0, 1]), [1, 0, 0], 1e-9), 'VfxShapeLegacy: emitOffset을 축·각도로 돌리고 같은 회전을 속도에도');
const sphere = C.lolVfxSampleShape({ __type: 'VfxShapeSphere', radius: 30 }, 0, Math.random);
assert(near(Math.hypot(...sphere.offset), 30, 1e-6), 'VfxShapeSphere(flags 없음): 표면에만');
let inside = true; for (let i = 0; i < 50; i++) { const s = C.lolVfxSampleShape({ __type: 'VfxShapeSphere', radius: 30, flags: 1 }, 0, Math.random); if (Math.hypot(...s.offset) > 30 + 1e-9) inside = false; }
assert(inside, 'VfxShapeSphere flags 0x1: 부피 안');
const cyl = C.lolVfxSampleShape({ __type: 'VfxShapeCylinder', radius: 20, height: 40 }, 0, () => 0.5);
assert(near(Math.hypot(cyl.offset[0], cyl.offset[2]), 20) && near(cyl.offset[1], 20), 'VfxShapeCylinder: 반지름 둘레, 높이 0..height');
const fe = { numFrames: 4, startFrame: 1, frameRate: 10 };
assert(C.lolVfxFrame(fe, 0, 1, 0) === 1 && C.lolVfxFrame(fe, 0.25, 1, 0) === 3 && C.lolVfxFrame(fe, 0.45, 1, 0) === 1, '플립북: startFrame부터 numFrames 고리(감김)');
assert(C.lolVfxFrame({ numFrames: 1, startFrame: 2, frameRate: 30 }, 5, 1, 0) === 2, 'numFrames 1이면 startFrame만');
assert(C.lolVfxColorLookup(0, 0.7, 0.2, 0.5, 0, 0) === 0.7 && near(C.lolVfxColorLookup(1, 1, 0, 0.4, 0, 0), 0.4), '색 조회 좌표(상수 = scale, 수명 = scale×age+offset)');

// ---------- 5. 기본값 표 ----------
const ed = C.lolVfxWithDefaults({}, 'VfxEmitterDefinitionData');
assert(ed.particleLifetime.constantValue === 3 && ed.alphaRef === 5 && ed.isLocalOrientation === true && ed.importance === 2 && nearArr(ed.uvTransformCenter, [0.5, 0.5]), '빠진 필드는 클라이언트 기본값(수명 3, alphaRef 5, isLocalOrientation 켜짐, importance 2)');
assert(C.lolVfxDefaultTexturePath('ASSETS\\Characters\\Nilah\\Skins\\Base\\Particles\\Nilah_Base_Q_Water.tex') === 'assets/lolvfx/assets/characters/nilah/skins/base/particles/nilah_base_q_water.png', '원작 텍스처 경로 → 저장소 png 경로');

// ---------- 6. 시뮬레이션 ----------
function makeMgr() { const scene = new Group(); return new C.LolVfxManager(scene, { unitScale: 0.01, quality: 4 }); }
const cam = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
// 6-1 방출 수·수명
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', rate: { constantValue: 10 }, particleLifetime: { constantValue: 0.5 }, lifetime: 1 }] };
  const s = mgr.spawn(def, { position: new Vector3(0, 0, 0) });
  let maxAlive = 0;
  for (let i = 0; i < 30; i++) { mgr.update(1 / 30, cam); maxAlive = Math.max(maxAlive, s.emitters[0].particles.length); }
  assert(maxAlive >= 4 && maxAlive <= 6, `rate 10 · 수명 0.5초 → 동시에 약 5개(실제 ${maxAlive})`);
  for (let i = 0; i < 30; i++) mgr.update(1 / 30, cam);
  assert(s.done && mgr.systems.length === 0, 'lifetime 1초가 지나고 입자가 다 죽으면 시스템이 끝나 정리된다');
}
// 6-2 단일 입자 버스트·위치·속도·저항
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', isSingleParticle: true, rate: { constantValue: 3 }, particleLifetime: { constantValue: 2 }, birthVelocity: { constantValue: [0, 0, 300] } }] };
  const s = mgr.spawn(def, { position: new Vector3(1, 0, 2) }); // 장면 (1,0,2) = 원작 (-100, 0, 200)
  mgr.update(1 / 30, cam);
  const em = s.emitters[0];
  assert(em.particles.length === 3, 'isSingleParticle: 첫 방출에 rate개(3) 한 번');
  for (let i = 0; i < 29; i++) mgr.update(1 / 30, cam);
  assert(em.particles.length === 3, '단일 입자 에미터는 다시 방출하지 않는다');
  const p = em.particles[0];
  assert(near(p.world[0], -100, 1e-6) && near(p.world[2], 200 + 300 * p.age, 1), `birthVelocity 300/s로 1초 → z가 약 300 이동(실제 ${(p.world[2] - 200).toFixed(1)})`);
}
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', isSingleParticle: true, rate: { constantValue: 1 }, particleLifetime: { constantValue: 5 }, birthVelocity: { constantValue: [100, 0, 0] }, birthDrag: { constantValue: [1, 0, 0] } }] };
  const s = mgr.spawn(def, { position: new Vector3(0, 0, 0) });
  for (let i = 0; i < 60; i++) mgr.update(1 / 30, cam);
  const p = s.emitters[0].particles[0];
  assert(Math.abs(p.vel[0]) < 100 && Math.abs(p.vel[0]) > 0, `birthDrag: 속도가 줄지만 반대로 바뀌지 않는다(실제 ${p.vel[0].toFixed(2)})`);
}
// 6-3 색: Add는 RGB×알파·알파 1, Alpha는 그대로 + 색 곡선
{
  const mgr = makeMgr();
  const mk = (blend) => ({ __type: 'VfxEmitterDefinitionData', isSingleParticle: true, rate: { constantValue: 1 }, particleLifetime: { constantValue: 1 }, blendMode: blend, Color: { constantValue: [1, 0.5, 0.2, 0.5] }, birthColor: { constantValue: [1, 1, 1, 0.5] } });
  const s = mgr.spawn({ __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [mk(0), mk(1)] }, { position: new Vector3() });
  mgr.update(1 / 30, cam);
  const add = s.emitters[0].particles[0].color, alpha = s.emitters[1].particles[0].color;
  assert(nearArr(add, [0.25, 0.125, 0.05, 1]), 'Add: Color×birthColor 뒤 RGB에 알파(0.25)를 곱하고 알파 1');
  assert(nearArr(alpha, [1, 0.5, 0.2, 0.25]), 'Alpha: Color×birthColor 그대로');
  assert(s.emitters[0].material.blending === 'add' && s.emitters[1].material.blending === 'normal', '블렌드 모드 0 = 더하기, 1 = 알파');
}
// 6-4 카메라 쿼드 크기·UV·플립북 칸
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', isSingleParticle: true, rate: { constantValue: 1 }, particleLifetime: { constantValue: 1 }, birthScale0: { constantValue: [50, 25, 1] }, texDiv: [2, 2], numFrames: 4, startFrame: 3 }] };
  const s = mgr.spawn(def, { position: new Vector3() });
  mgr.update(1 / 30, cam);
  const b = s.emitters[0].batch;
  const P = (k) => [b.pos[k * 3], b.pos[k * 3 + 1], b.pos[k * 3 + 2]];
  // 카메라 오른쪽(장면 +X) = 원작 -X
  assert(b.count === 1 && nearArr(P(0), [50, 25, 0]) && nearArr(P(2), [-50, -25, 0]), '카메라 쿼드: 꼭짓점이 ±scale.x(오른쪽)·±scale.y(위) - 100×50 크기');
  assert(nearArr([b.uv[0], b.uv[1], b.uv[4], b.uv[5]], [0, 0, 1, 1]), '카메라 쿼드 UV: 왼위 (0,0) → 오른아래 (1,1)');
  assert(nearArr([b.cell[0], b.cell[1], b.cell[2], b.cell[3]], [0.5, 0.5, 0.5, 0.5]), '플립북 3번 칸 = 2×2 격자의 오른아래');
  assert(s.emitters[0].material.uniforms.alphaRef.value === 5 / 255, 'alphaRef 기본 5 → 5/255 밑은 버린다');
}
// 6-5 생성 좌표계: isLocalOrientation이면 붙은 대상 방향을 따른다
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', isSingleParticle: true, rate: { constantValue: 1 }, particleLifetime: { constantValue: 1 }, EmitterPosition: { constantValue: [0, 0, 100] } }] };
  // 장면에서 Y축으로 90° 돈 대상(앞 +Z가 장면 +X를 보게): 원작 좌표에서는 앞이 -X
  const q = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  mgr.rotToLol = () => [0, 0, -1, 0, 1, 0, 1, 0, 0]; // (테스트용) 위 사원수의 원작 좌표 회전: +Z → -X
  const s = mgr.spawn(def, { position: new Vector3(), quaternion: q });
  mgr.update(1 / 30, cam);
  const w = s.emitters[0].particles[0].world;
  assert(nearArr(w, [-100, 0, 0], 1e-6), 'isLocalOrientation(기본 켜짐): EmitterPosition 앞 100이 대상이 보는 쪽으로');
}
// 6-6 멈춤: 기본 particleLinger 0이면 남은 입자가 바로 사라진다
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', rate: { constantValue: 30 }, particleLifetime: { constantValue: 5 } }] };
  const s = mgr.spawn(def, { position: new Vector3() });
  for (let i = 0; i < 10; i++) mgr.update(1 / 30, cam);
  assert(s.emitters[0].particles.length > 0, '멈추기 전엔 입자가 있다');
  s.stop(false);
  mgr.update(1 / 30, cam); mgr.update(1 / 30, cam);
  assert(mgr.systems.length === 0, '멈추면(기본 링거 0) 남은 입자를 바로 지우고 끝난다');
}
// 6-7 트레일: 입자를 태어난 순서로 잇는 띠
{
  const mgr = makeMgr();
  const def = { __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', rate: { constantValue: 30 }, particleLifetime: { constantValue: 1 }, birthScale0: { constantValue: [10, 1, 1] }, primitive: { __type: 'VfxPrimitiveCameraTrail', mTrail: { __type: 'VfxTrailDefinitionData', mBirthTilingSize: { constantValue: [100, 0, 0] } } } }] };
  let x = 0;
  const s = mgr.spawn(def, { attach: () => ({ position: new Vector3(x, 0, 0) }) });
  for (let i = 0; i < 10; i++) { x += 0.1; mgr.update(1 / 30, cam); }
  const b = s.emitters[0].batch, n = s.emitters[0].particles.length;
  assert(n >= 8 && b.count === n - 1, `트레일: 점 ${n}개 → 쿼드 ${n - 1}개`);
}
// 6-8 정의 점검: 아직 못 그리는 기능을 알려준다
{
  const cov = C.lolVfxCoverage({ __type: 'VfxSystemDefinitionData', complexEmitterDefinitionData: [{ __type: 'VfxEmitterDefinitionData', primitive: { __type: 'VfxPrimitiveMesh' }, alphaErosionDefinition: {} }] }, {});
  assert(cov.some((m) => /VfxPrimitiveMesh/.test(m)) && cov.some((m) => /침식/.test(m)), '재현 못 하는 기능(메시·침식)을 목록으로 알린다');
  assert(C.lolVfxCoverage(sysQ, reg).length === 0, '지원 기능만 쓰는 정의는 빈 목록');
}
console.log(`\n${pass}개 통과`);
