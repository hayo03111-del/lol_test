/* lol_vfx_engine.js — 89차: 원작 파티클 엔진(three.js 런타임)
 * 게임 파일의 VfxSystemDefinitionData(lol_vfx_bin_text.js로 읽은 것)를 lol-meta-wiki 문서에 적힌 클라이언트 동작대로 재생한다.
 * 문서 순서를 그대로 따른다:
 *  - 시뮬레이션: 고정 단계(EffectsQuality 아주 높음 = 초당 30단계), 단계가 없으면 SimulateEveryFrame(flags 0x40)로 한 단계.
 *  - 방출: timeBeforeFirstEmission·lifetime(시스템 시각 기준 끝)·period/timeActiveDuringPeriod, (지난 방출 뒤 시간 × rate) 내림,
 *    단계당 최대 rate×0.33+1, 첫 방출은 최소 1개(HasVariableStartTime이면 아님), isSingleParticle은 한 번만 rate개.
 *  - 입자 갱신: 저장 속도 += (birthAcceleration + acceleration)·dt → 단계 속도 = 저장 속도 + velocity → 저항 → 힘 마당 → 위치 이동,
 *    회전(birth 회전 + 회전 속도·가속 + isRotationEnabled면 rotation0 적분), 행렬 = 회전 → postRotate → 위치 → 붙은 대상 방향
 *    (particleIsLocalOrientation) → 공전(birthOrbitalVelocity) → 시스템 transform → 태어날 때 잡은 생성 좌표계, bindWeight·worldAcceleration.
 *  - 색 = Color × birthColor × 시스템 색 × modulationFactor, Add/Subtract는 RGB에 알파를 곱하고 알파 1.
 *  - UV: 회전 → 크기 → 이동(birthUVOffset + age×birthUvScrollRate, 감기/고정) + 적분 스크롤 → 뒤집기 → emitterUvScrollRate, 플립북 칸 안에서.
 * 좌표: 엔진 안은 원작(왼손, LoL 단위) 그대로 계산하고, 장면에 붙일 때 X를 뒤집고 lolRangeToWorld 배율을 곱한다(루트 그룹의 scale).
 * 아직 재현하지 않는 기능(메시 프리미티브, 왜곡, 침식, 팔레트, 반사, 소프트 파티클, textureMult, 셰이머 에미터, Linger 대체값 등)은
 * lolVfxCoverage()가 정의마다 목록으로 알려준다 - 그 목록이 비어 있는 정의만 "원작과 같은 방식"으로 그려진다.
 */
const LOL_VFX_STEP = 1 / 30;
const LOL_VFX_MAX_PARTICLES = 4000;
const LOL_VFX_BLEND_RANK = { 3: 0, 0: 1, 2: 1, 1: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 3 };

function lolVfxDefaultsOf(cls) { const c = typeof LOL_VFX_SCHEMA !== 'undefined' && LOL_VFX_SCHEMA[cls]; return c ? c.defaults : {}; }
// bin에는 기본값과 다른 필드만 있다 - 클래스 기본값 위에 덮어쓴 얕은 사본.
function lolVfxWithDefaults(obj, cls) {
  const out = Object.assign({}, lolVfxDefaultsOf(cls || (obj && obj.__type)));
  if (obj) for (const k of Object.keys(obj)) out[k] = obj[k];
  return out;
}

// ---------- 정의가 쓰는 기능 중 엔진이 아직 재현하지 않는 것 ----------
function lolVfxCoverage(sys, registry) {
  const missing = new Set();
  const visit = (s, depth) => {
    if (!s || depth > 6) return;
    if ((s.ShimmerEmitterDefinitionData || []).length) missing.add('ShimmerEmitterDefinitionData(컴포넌트 에미터)');
    if (s.drawingLayer === 1) missing.add('HUD 레이어(drawingLayer 1)');
    const all = [...(s.complexEmitterDefinitionData || []), ...(s.simpleEmitterDefinitionData || [])];
    for (const raw of all) {
      if (!raw) continue;
      const e = raw;
      const p = e.primitive && e.primitive.__type;
      if (p === 'VfxPrimitiveMesh' || p === 'VfxPrimitiveAttachedMesh') missing.add(`${p}(메시 입자)`);
      if (p === 'VfxPrimitiveCameraSegmentBeam') missing.add('VfxPrimitiveCameraSegmentBeam');
      if (p === 'VfxPrimitivePlanarProjection') missing.add('VfxPrimitivePlanarProjection(원작 기하가 문서에 없어 바닥 판으로 근사)');
      if (p === 'VfxPrimitiveBeam' && e.primitive.mMesh && e.primitive.mMesh.mMeshName) missing.add('VfxPrimitiveBeam의 mMesh');
      if (e.distortionDefinition && (e.distortionDefinition.distortionMode ?? 1) !== 0) missing.add('distortionDefinition(화면 왜곡)');
      if (e.alphaErosionDefinition) missing.add('alphaErosionDefinition(알파 침식)');
      if (e.paletteDefinition) missing.add('paletteDefinition(팔레트)');
      if (e.reflectionDefinition) missing.add('reflectionDefinition(반사)');
      if (e.softParticleParams) missing.add('softParticleParams(소프트 파티클)');
      if (e.textureMult) missing.add('textureMult(둘째 텍스처 층)');
      if (e.CustomMaterial) missing.add('CustomMaterial');
      if (e.Linger) missing.add('Linger 대체값');
      if (e.emissionMeshName) missing.add('emissionMeshName(메시 표면 생성)');
      if (e.emissionSurfaceDefinition) missing.add('emissionSurfaceDefinition(스킨 표면 생성)');
      if (e.FlexShapeDefinition) missing.add('FlexShapeDefinition(붙은 대상 크기 배율)');
      if (e.uvMode && e.uvMode !== 0) missing.add(`uvMode ${e.uvMode}`);
      if (e.sliceTechniqueRange > 0) missing.add('sliceTechniqueRange(슬라이스 셰이더)');
      if (e.stencilMode) missing.add('stencilMode');
      if (e.materialOverrideDefinitions && e.materialOverrideDefinitions.length) missing.add('materialOverrideDefinitions(붙은 대상 재질 덮어쓰기)');
      if (e.uvParallaxScale) missing.add('uvParallaxScale');
      if (e.flexBirthUVOffset || e.flexBirthUVScrollRate || e.flexBirthRotationalVelocity0) missing.add('flex UV/회전 값');
      const c = e.childParticleSetDefinition;
      if (c && registry) for (const id of c.childrenIdentifiers || []) { const child = lolVfxFindChild(registry, id); if (child) visit(child, depth + 1); else missing.add(`자식 이펙트 정의 없음: ${id.effectName || id.effectKey || id.effect}`); }
    }
    if (s.materialOverrideDefinitions && s.materialOverrideDefinitions.length) missing.add('materialOverrideDefinitions(붙은 대상 재질 덮어쓰기)');
  };
  visit(sys, 0);
  return [...missing];
}
function lolVfxFindChild(registry, id) {
  if (!id) return null;
  return registry[id.effectName] || registry[id.effect] || registry[id.effectKey] || null;
}

// ---------- 셰이더: 텍스처(플립북 칸·주소 방식) × 입자 색 × 색 조회 텍스처 ----------
const LOL_VFX_VERT = `
attribute vec4 aColor; attribute vec2 aUv; attribute vec4 aCell; attribute vec2 aLookup;
varying vec4 vColor; varying vec2 vUv; varying vec4 vCell; varying vec2 vLookup;
void main(){ vColor = aColor; vUv = aUv; vCell = aCell; vLookup = aLookup; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LOL_VFX_FRAG = `
uniform sampler2D map; uniform sampler2D colorMap; uniform float useColorMap; uniform float addressMode; uniform float alphaRef;
varying vec4 vColor; varying vec2 vUv; varying vec4 vCell; varying vec2 vLookup;
float lolAddr(float x){
  if (addressMode < 0.5) return fract(x);
  if (addressMode < 1.5) { float m = mod(x, 2.0); return m > 1.0 ? 2.0 - m : m; }
  return clamp(x, 0.0, 1.0);
}
void main(){
  if (addressMode > 2.5 && (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0)) discard; // Border: 투명
  vec2 c = vCell.xy + vec2(lolAddr(vUv.x), lolAddr(vUv.y)) * vCell.zw; // 원작 UV는 v가 아래로 - 텍스처는 위가 v=1이라 뒤집어 읽는다
  vec2 g = vec2(vUv.x, -vUv.y) * vCell.zw; // 감기 전 좌표의 미분으로 밉맵을 고른다(fract 경계에서 가장 작은 밉이 찍혀 생기는 선 방지)
  vec4 tex = textureGrad(map, vec2(c.x, 1.0 - c.y), dFdx(g), dFdy(g));
  vec4 col = vColor * tex;
  if (useColorMap > 0.5) col *= texture2D(colorMap, vec2(clamp(vLookup.x, 0.0, 1.0), 1.0 - clamp(vLookup.y, 0.0, 1.0)));
  if (alphaRef > 0.0 && col.a < alphaRef) discard;
  gl_FragColor = col;
}`;

class LolVfxTextureCache {
  constructor(resolve) { this.resolve = resolve; this.cache = new Map(); this.loader = new THREE.TextureLoader(); this.loader.crossOrigin = undefined; this.failed = new Set(); }
  get(path) {
    if (!path) return null;
    const key = path.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    const url = this.resolve(path);
    let tex = null;
    if (url) {
      tex = this.loader.load(url, undefined, undefined, () => { this.failed.add(path); console.warn('[LOL VFX] 텍스처를 못 읽음:', path, '→', url); });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; // 주소 방식은 셰이더가 칸 안에서 처리한다
    }
    this.cache.set(key, tex);
    return tex;
  }
}
// 원작 텍스처가 없을 때 쓰는 "투명한 검정"(문서: 이름이 비었거나 못 읽으면 투명 검정을 묶는다)
const LOL_VFX_BLACK = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; return t; })();
const LOL_VFX_WHITE = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t; })();

function lolVfxMakeMaterial(em, map, colorMap) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map || LOL_VFX_BLACK }, colorMap: { value: colorMap || LOL_VFX_WHITE }, useColorMap: { value: colorMap ? 1 : 0 },
      addressMode: { value: [0, 1, 2, 3].includes(em.texAddressModeBase) ? em.texAddressModeBase : 0 }, alphaRef: { value: (em.alphaRef || 0) / 255 } },
    vertexShader: LOL_VFX_VERT, fragmentShader: LOL_VFX_FRAG, transparent: em.blendMode !== 3, side: THREE.DoubleSide,
    depthWrite: em.blendMode === 3, depthTest: !((em.miscRenderFlags || 0) & 1), toneMapped: false,
  });
  switch (em.blendMode) {
    case 0: case 4: mat.blending = THREE.AdditiveBlending; break; // Add(색에 알파를 미리 곱함)·AlphaAdd: 원본×알파 + 대상
    case 1: mat.blending = THREE.NormalBlending; break; // Alpha
    case 2: mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.ZeroFactor; mat.blendDst = THREE.OneMinusSrcColorFactor; break; // Subtract: 대상 × (1 - 색×알파)
    case 3: mat.blending = THREE.NoBlending; break; // None
    case 5: mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; break; // PremultipliedAlpha
    case 6: mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.MinEquation; break;
    case 7: mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.MaxEquation; break;
    case 8: mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneMinusDstAlphaFactor; mat.blendDst = THREE.DstAlphaFactor; break; // TargetAlpha
    default: mat.blending = THREE.AdditiveBlending;
  }
  return mat;
}

// 배치 그리기용 동적 기하(정점 4개 = 쿼드 하나, 트레일·빔도 쿼드 띠로 만든다)
class LolVfxBatch {
  constructor(material) {
    this.cap = 0; this.count = 0; this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, material); this.mesh.frustumCulled = false;
    this.ensure(64);
  }
  ensure(quads) {
    if (quads <= this.cap) return;
    const cap = Math.max(quads, this.cap * 2), v = cap * 4;
    const grow = (old, n) => { const a = new Float32Array(n); if (old) a.set(old.subarray(0, Math.min(old.length, n))); return a; }; // 이번 프레임에 이미 쓴 쿼드는 지키며 늘린다
    this.pos = grow(this.pos, v * 3); this.col = grow(this.col, v * 4); this.uv = grow(this.uv, v * 2); this.cell = grow(this.cell, v * 4); this.lk = grow(this.lk, v * 2);
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) { const b = q * 4, o = q * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3; }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute('aCell', new THREE.BufferAttribute(this.cell, 4));
    this.geo.setAttribute('aLookup', new THREE.BufferAttribute(this.lk, 2));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.cap = cap;
  }
  begin() { this.count = 0; }
  // 꼭짓점 4개(p: [x,y,z]×4), 꼭짓점별 uv와 색, 칸(cell), 조회 좌표
  quad(p, uvs, colors, cell, lookup) {
    this.ensure(this.count + 1);
    const q = this.count++;
    const perCell = Array.isArray(cell[0]), perLk = Array.isArray(lookup[0]);
    for (let k = 0; k < 4; k++) {
      const v = q * 4 + k, c = colors[k] || colors[0];
      this.pos.set(p[k], v * 3); this.col.set(c, v * 4); this.uv.set(uvs[k], v * 2); this.cell.set(perCell ? cell[k] : cell, v * 4); this.lk.set(perLk ? lookup[k] : lookup, v * 2);
    }
  }
  end() {
    for (const n of ['position', 'aColor', 'aUv', 'aCell', 'aLookup']) this.geo.attributes[n].needsUpdate = true;
    this.geo.setDrawRange(0, this.count * 6);
    this.mesh.visible = this.count > 0;
  }
  dispose() { this.geo.dispose(); }
}

const LOL_VFX_I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const lolV = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  hmul: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
function lolVfxTranspose(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
function lolVfxRandArr(n) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = Math.random(); return a; }

// ---------- 에미터 ----------
class LolVfxEmitter {
  constructor(system, raw, isSimple) {
    this.system = system; this.isSimple = isSimple;
    this.def = lolVfxWithDefaults(raw, 'VfxEmitterDefinitionData');
    const e = this.def;
    this.prim = e.primitive && e.primitive.__type ? e.primitive : null;
    this.primType = this.prim ? this.prim.__type : 'VfxPrimitiveCameraQuad';
    this.particles = []; this.accum = 0; this.emittedOnce = false; this.singleDone = false; this.finished = false; this.lingerStart = null;
    this.sharedRand = Math.random();
    this.isTrail = this.primType === 'VfxPrimitiveArbitraryTrail' || this.primType === 'VfxPrimitiveCameraTrail';
    this.trail = this.isTrail ? lolVfxWithDefaults(this.prim.mTrail, 'VfxTrailDefinitionData') : null;
    this.trailTravel = 0; this.lastSpawnPos = null;
    const tc = system.manager.textures;
    const map = tc.get(e.texture);
    const cpath = e.particleColorTexture || '';
    const colorMap = cpath && !/defaultcoloroverlifetime/i.test(cpath) ? tc.get(cpath) : null; // 기본 색 텍스처는 흰색
    this.material = lolVfxMakeMaterial(e, map, colorMap);
    this.batch = new LolVfxBatch(this.material);
    const pass = e.pass || 0, phase = e.isGroundLayer ? 0 : (pass < 0 ? 1 : 2);
    this.batch.mesh.renderOrder = 1000 + phase * 100000 + pass * 10 + (LOL_VFX_BLEND_RANK[e.blendMode] ?? 1);
    system.group.add(this.batch.mesh);
    // 문서 "lifetime": 단일 입자 에미터는 lifetime이 없거나 particleLifetime보다 10초 넘게 길면 particleLifetime으로 바뀐다
    if (e.isSingleParticle && !isSimple) {
      const pl = lolVfxSample(e.particleLifetime, 0, null, 3);
      if (e.lifetime == null || e.lifetime > pl + 10) this.endTime = pl; else this.endTime = e.lifetime;
    } else this.endTime = e.lifetime;
    if (e.doesLifetimeScale && this.endTime != null) this.endTime *= system.opts.lifetimeScale || 1;
  }
  get emitDef() { return { lifetime: this.endTime, period: this.def.period, timeActiveDuringPeriod: this.def.timeActiveDuringPeriod, timeBeforeFirstEmission: this.def.timeBeforeFirstEmission }; }
  flex(f) { if (!f) return 0; const id = f.mFlexID || 0; return id >= 0 && id <= 2 ? (this.system.opts.flex || [0, 0, 0])[id] || 0 : 0; }

  step(dt, sysT, prevSysPos) {
    const e = this.def, sys = this.system, ed = this.emitDef;
    // 1) 방출
    const ended = ed.lifetime != null && ed.lifetime >= 0 && sysT > ed.lifetime;
    const stopping = sys.stopping && sysT > (e.emitterLinger ?? 0);
    if (!this.finished && (ended || stopping || (this.singleDone && !this.isSimple))) { this.finished = true; this.onFinish(sysT); }
    if (!this.finished && lolVfxCanEmit(ed, sysT)) {
      const phase = lolVfxEmitterPhase(ed, sysT);
      let n;
      if (e.isSingleParticle) {
        if (!this.singleDone) { n = Math.max(1, Math.floor(lolVfxSample(e.rate, phase, null, 0))); this.singleDone = true; } else n = 0;
      } else {
        this.accum += dt;
        let rate;
        const rv = lolVfxSample(e.rateByVelocityFunction, phase, null, [0, 0]);
        if (rv && (rv[0] || rv[1])) rate = Math.min(e.MaximumRateByVelocity ?? 300, sys.speed * rv[0] + rv[1]);
        else rate = lolVfxSample(e.rate, phase, null, 0) + (e.flexRate ? this.flex(e.flexRate) * lolVfxSample(e.flexRate.mValue, phase, null, 0) : 0);
        rate *= lolVfxImportanceRate(e.importance ?? 2, sys.manager.quality);
        n = lolVfxEmitCount(rate, this.accum, !this.emittedOnce, e.HasVariableStartTime);
        if (n > 0) this.accum = 0;
      }
      if (this.isTrail && this.trail.mMaxAddedPerFrame > 0) n = Math.min(n, this.trail.mMaxAddedPerFrame);
      if (n > 0) {
        this.emittedOnce = true;
        for (let k = 0; k < n; k++) {
          if (this.particles.length >= LOL_VFX_MAX_PARTICLES) break;
          const f = n > 1 ? (k + 1) / n : 1; // 한 단계 안에 고르게 - 먼저 난 입자는 조금 더 늙고 시스템 이동 경로상 앞 위치
          const p = this.spawn(sysT - dt * (1 - f), phase, prevSysPos ? lolV.add(prevSysPos, lolV.mul(lolV.sub(sys.pos, prevSysPos), f)) : sys.pos);
          if (p) { this.simulate(p, dt * (1 - f), sysT); this.particles.push(p); }
        }
      }
    }
    // 2) 입자 갱신
    const sysDelta = prevSysPos ? lolV.sub(sys.pos, prevSysPos) : [0, 0, 0];
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      // 링거: 0·1은 시스템이 멈출 때, 2는 에미터가 끝나면(문서 particleLingerType)
      if (this.lingerStart != null) {
        const L = this.lingerCap();
        const type = this.isSimple ? 0 : (e.particleLingerType || 0);
        if (type === 0 && sys.stopping) p.life = Math.min(p.life, L);
        else if ((type === 1 && sys.stopping) || type === 2) { if (!p.lingered) { p.life = p.age + L; p.lingered = true; } }
      }
      if (p.life >= 0 && p.age + dt >= p.life) { this.kill(p); this.particles.splice(i, 1); continue; }
      const bw = lolVfxSample(e.bindWeight, p.life > 0 ? p.age / p.life : 0, null, 0);
      if (bw) p.bind = lolV.add(p.bind, lolV.mul(sysDelta, bw));
      this.simulate(p, dt, sysT);
    }
  }
  lingerCap() { const e = this.def; const cap = this.isSimple ? 10 : lolVfxSample(e.particleLifetime, 0, null, 3) + 10; return Math.min(e.particleLinger == null ? cap : e.particleLinger, cap); }
  onFinish(sysT) { this.lingerStart = sysT; }
  kill(p) { if (p.child) p.child.stop(false); const c = this.def.childParticleSetDefinition; if (c && c.childEmitOnDeath) this.system.spawnChild(this, p, true); }

  spawn(birthT, phase, sysPos) {
    const e = this.def, sys = this.system;
    const rnd = (n) => lolVfxRandArr(n);
    const r3 = rnd(3), r4 = rnd(4);
    const shared = e.ParticlesShareRandomValue ? this.sharedRand : Math.random();
    let life = lolVfxSample(e.particleLifetime, phase, () => Math.random(), 3);
    if (e.flexParticleLifetime) { const fv = this.flex(e.flexParticleLifetime); life = (life + fv * lolVfxSample(e.flexParticleLifetime.mValue, phase, null, 0)) * (1 + fv); }
    if (e.doesParticleLifetimeScale) life *= sys.opts.lifetimeScale || 1;
    const shape = lolVfxSampleShape(e.SpawnShape, phase, Math.random);
    const sysScale = sys.scale;
    const ols = e.offsetLifetimeScaling || [0, 0, 0];
    if (e.SpawnShape && (ols[0] || ols[1] || ols[2])) {
      const sm = e.offsetLifeScalingSymmetryMode || 0, raw = shape.raw;
      const o = [sm & 1 ? Math.abs(raw[0]) : raw[0], sm & 2 ? Math.abs(raw[1]) : raw[1], sm & 4 ? Math.abs(raw[2]) : raw[2]];
      life = Math.max(0, life + o[0] * ols[0] + o[1] * ols[1] + o[2] * ols[2]);
    }
    const emitPos = e.IsEmitterSpace ? [0, 0, 0] : lolVfxSample(e.EmitterPosition, phase, null, [0, 0, 0]);
    const local = lolV.add(emitPos, lolV.mul(shape.offset, sysScale));
    let vel = lolVfxSample(e.birthVelocity, phase, (i) => r3[i], [0, 0, 0]);
    if (e.flexBirthVelocity) { const fv = this.flex(e.flexBirthVelocity), m = lolVfxSample(e.flexBirthVelocity.mValue, phase, null, [0, 0, 0]); vel = lolV.mul(lolV.add(vel, lolV.mul(m, fv)), 1 + fv); }
    vel = lolVfxMat3Apply(shape.rot, vel);
    const acc = lolVfxMat3Apply(shape.rot, lolVfxSample(e.birthAcceleration, phase, () => Math.random(), [0, 0, 0]));
    let bscale = lolVfxSample(e.birthScale0, phase, () => Math.random(), [1, 1, 1]);
    if (e.flexScaleBirthScale) { const k = this.flex(e.flexScaleBirthScale) * (e.flexScaleBirthScale.mValue || 0); if (k > 0) bscale = lolV.mul(bscale, k); }
    // 생성 좌표계: 태어날 때의 시스템 위치(+ isLocalOrientation이면 붙은 대상의 방향)
    const frameRot = e.isLocalOrientation ? sys.rot.slice() : LOL_VFX_I3;
    const p = {
      age: 0, life: life < 0 ? -1 : life, birthT, local, vel, acc, shared,
      spawnPos: sysPos.slice(), spawnRot: frameRot, bind: [0, 0, 0],
      drag: lolVfxSample(e.birthDrag, phase, () => Math.random(), [0, 0, 0]),
      bscale, bcolor: lolVfxSample(e.birthColor, phase, (i) => r4[i], [1, 1, 1, 1]),
      brot: lolVfxSample(e.birthRotation0, phase, () => Math.random(), [0, 0, 0]),
      brotv: lolVfxSample(e.birthRotationalVelocity0, phase, () => Math.random(), [0, 0, 0]),
      brota: lolVfxSample(e.birthRotationalAcceleration, phase, () => Math.random(), [0, 0, 0]),
      borbit: lolVfxSample(e.birthOrbitalVelocity, phase, () => Math.random(), [0, 0, 0]),
      buvOff: lolVfxSample(e.birthUVOffset, phase, () => shared, [0, 0]),
      buvScroll: lolVfxSample(e.birthUvScrollRate, phase, () => shared, [0, 0]),
      buvRot: lolVfxSample(e.birthUvRotateRate, phase, () => shared, 0),
      bframe: lolVfxSample(e.birthFrameRate, phase, () => shared, 1),
      tiling: this.isTrail ? lolVfxSample(this.trail.mBirthTilingSize, phase, null, [0, 0, 0]) : (this.primType === 'VfxPrimitiveBeam' ? lolVfxSample(((this.prim.mBeam) || {}).mBirthTilingSize, phase, null, [0, 0, 0]) : null),
      world: null, prevWorld: null, speed: 0, rot: LOL_VFX_I3, scale: [1, 1, 1], color: [1, 1, 1, 1],
    };
    if (this.isTrail) { // 웨이크 모드: 태어난 순간까지 생성 지점이 움직인 거리
      if (this.lastSpawnPos) this.trailTravel += lolV.len(lolV.sub(sysPos, this.lastSpawnPos));
      this.lastSpawnPos = sysPos.slice(); p.trailU = this.trailTravel;
    }
    const c = e.childParticleSetDefinition;
    if (c && !c.childEmitOnDeath) this.system.spawnChild(this, p, false);
    return p;
  }

  // 한 입자를 dt만큼 진행(문서 "Particle update" 1~9)
  simulate(p, dt, sysT) {
    const e = this.def, sys = this.system;
    p.age += dt;
    const t = p.life > 0 ? Math.min(1, p.age / p.life) : 0;
    if (dt > 0) {
      const accel = lolV.add(p.acc, lolVfxSample(e.acceleration, t, null, [0, 0, 0]));
      const analytic = (sys.flags & 0x100) && (p.drag[0] || p.drag[1] || p.drag[2]);
      if (analytic) { // UseCalculusForPhysics: 닫힌 식으로 고정 오프셋까지 감속
        p.anOff = p.anOff || [0, 0, 0];
        const v0 = p.v0 || (p.v0 = p.vel.slice());
        p.anOff = [0, 1, 2].map((i) => (p.drag[i] ? (v0[i] / p.drag[i]) * (1 - Math.exp(-p.drag[i] * p.age)) : 0));
      } else {
        p.vel = lolV.add(p.vel, lolV.mul(accel, dt));
        let sv = lolV.add(p.vel, lolVfxSample(e.velocity, t, null, [0, 0, 0]));
        const drag = lolV.add(p.drag, lolVfxSample(e.drag, t, null, [0, 0, 0]));
        for (let i = 0; i < 3; i++) if (drag[i]) { const dv = drag[i] * sv[i] * dt; const nv = Math.abs(dv) >= Math.abs(sv[i]) ? 0 : sv[i] - dv; p.vel[i] -= sv[i] - nv; sv[i] = nv; }
        sv = this.applyFields(p, sv, dt, sysT);
        p.local = lolV.add(p.local, lolV.mul(sv, dt));
      }
    }
    // 회전(도): birth + 속도·가속 + rotation0 적분(초당 60배, isRotationEnabled 필요)
    let ang = lolV.add(p.brot, lolV.add(lolV.mul(p.brotv, p.age), lolV.mul(p.brota, 0.5 * p.age * p.age)));
    if (e.isRotationEnabled && p.life > 0) ang = lolV.add(ang, lolV.mul(lolVfxIntegrate(e.rotation0, t, p.life), 60));
    p.ang = ang;
    let rot = lolVfxEulerZXY(ang);
    if (e.hasPostRotateOrientation) rot = lolVfxMat3Mul(lolVfxEulerZXY(e.postRotateOrientationAxis || [0, 0, 0]), rot);
    let pos = p.anOff ? lolV.add(p.local, p.anOff) : p.local.slice();
    if (e.IsEmitterSpace) pos = lolV.add(pos, lolVfxSample(e.EmitterPosition, lolVfxEmitterPhase(this.emitDef, sysT), null, [0, 0, 0]));
    if (p.borbit[0] || p.borbit[1] || p.borbit[2]) { const o = lolVfxEulerZXY(lolV.mul(p.borbit, p.age * 180 / Math.PI)); pos = lolVfxMat3Apply(o, pos); rot = lolVfxMat3Mul(o, rot); }
    // 에미터 좌표계 덮어쓰기(크기 → 회전 → 이동)와 시스템 transform
    const so = e.scaleOverride || [1, 1, 1], ro = e.rotationOverride || [0, 0, 0], to = e.translationOverride || [0, 0, 0];
    const roM = lolVfxEulerZXY(ro);
    let frameRot = p.spawnRot;
    if (e.particleIsLocalOrientation) frameRot = sys.rot; // 매 단계 현재 방향(생성 좌표계는 위치만)
    else { pos = lolV.add(to, lolVfxMat3Apply(roM, lolV.hmul(so, pos))); rot = lolVfxMat3Mul(roM, rot); }
    if (sys.transform) { pos = lolV.add(sys.transform.t, lolVfxMat3Apply(sys.transform.r, pos)); rot = lolVfxMat3Mul(sys.transform.r, rot); }
    let world = lolV.add(p.spawnPos, lolVfxMat3Apply(frameRot, pos));
    rot = lolVfxMat3Mul(frameRot, rot);
    world = lolV.add(world, p.bind);
    if (p.life > 0) world = lolV.add(world, lolVfxIntegrate2(e.worldAcceleration, t, p.life));
    p.prevWorld = p.world || world; p.world = world; p.rot = rot;
    p.speed = dt > 0 ? lolV.len(lolV.sub(world, p.prevWorld)) / dt : p.speed;
    // 크기: scale0 × birthScale0 (isUniformScale면 X를 모든 축에), 시스템 배율
    let sc = lolV.hmul(lolVfxSample(e.scale0, t, null, [1, 1, 1]), p.bscale);
    if (this.isSimple) { // 단순 에미터: LegacySimple의 균일 크기(birthScale × scale)와 평면 회전
      const ls = lolVfxWithDefaults(e.LegacySimple, 'VfxEmitterLegacySimple');
      p.sbs = p.sbs ?? lolVfxSample(ls.birthScale, 0, null, 1);
      const k = p.sbs * lolVfxSample(ls.scale, t, null, 1), bias = ls.scaleBias || [1, 1];
      sc = [k * bias[0], k * bias[1], k];
      p.sbr = p.sbr ?? lolVfxSample(ls.birthRotation, 0, null, 0);
      p.ang = [e.isRotationEnabled ? lolVfxSample(ls.rotation, t, null, 0) : p.sbr + lolVfxSample(ls.birthRotationalVelocity, 0, null, 0) * p.age, 0, 0];
    }
    if (e.FlexInstanceScale) { const fv = this.flex(e.FlexInstanceScale); if (fv > 0) sc = lolV.mul(sc, fv); }
    if (e.isUniformScale) sc = [sc[0], sc[0], sc[0]];
    p.scale = lolV.mul(sc, sys.scale);
    // 색: Color × birthColor × 시스템 색 × modulationFactor (+ Add/Subtract 미리 곱하기)
    const cc = lolVfxSample(e.Color, t, null, [1, 1, 1, 1]), mf = e.modulationFactor || [1, 1, 1, 1], sc4 = sys.color;
    const col = [0, 1, 2, 3].map((i) => cc[i] * p.bcolor[i] * sc4[i] * mf[i]);
    if (e.blendMode === 0 || e.blendMode === 2) { col[0] *= col[3]; col[1] *= col[3]; col[2] *= col[3]; col[3] = 1; }
    p.color = col;
    p.t = t;
  }

  applyFields(p, sv, dt, sysT) {
    const fc = this.def.fieldCollectionDefinition;
    if (!fc) return sv;
    const phase = lolVfxEmitterPhase(this.emitDef, sysT);
    let v = sv.slice();
    const pos = p.local;
    for (const f of fc.fieldAccelerationDefinitions || []) v = lolV.add(v, lolV.mul(lolVfxSample(f.acceleration, phase, null, [0, 0, 0]), dt));
    for (const f of fc.fieldAttractionDefinitions || []) {
      const c = lolVfxSample(f.Position, phase, null, [0, 0, 0]), r = lolVfxSample(f.radius, phase, null, 0), a = lolVfxSample(f.acceleration, phase, null, 0);
      const d = lolV.sub(c, pos), dl = lolV.len(d);
      if (dl > 1e-6 && dl <= r) v = lolV.add(v, lolV.mul(d, a * dt / dl));
    }
    for (const f of fc.fieldNoiseDefinitions || []) {
      const c = lolVfxSample(f.Position, phase, null, [0, 0, 0]), r = lolVfxSample(f.radius, phase, null, 0), freq = lolVfxSample(f.frequency, phase, null, 0), dvel = lolVfxSample(f.velocityDelta, phase, null, 0), ax = f.axisFraction || [0, 0, 0];
      if (lolV.len(lolV.sub(pos, c)) <= r && Math.random() < freq * dt) v = lolV.add(v, [0, 1, 2].map((i) => (Math.random() * 2 - 1) * dvel * ax[i]));
    }
    for (const f of fc.fieldDragDefinitions || []) {
      const c = lolVfxSample(f.Position, phase, null, [0, 0, 0]), r = lolVfxSample(f.radius, phase, null, 0), s = lolVfxSample(f.strength, phase, null, 0);
      if (lolV.len(lolV.sub(pos, c)) <= r) v = v.map((x) => { const d = Math.abs(x) * s * dt; return Math.abs(x) <= d ? 0 : x - Math.sign(x) * d; });
    }
    for (const f of fc.fieldOrbitalDefinitions || []) {
      const axis = lolV.norm(lolVfxSample(f.direction, phase, null, [0, 1, 0]));
      const along = lolV.mul(axis, lolV.dot(v, axis)), perp = lolV.sub(v, along), sp = lolV.len(perp);
      if (sp > 1e-6) { const radial = lolV.norm(lolV.sub(pos, lolV.mul(axis, lolV.dot(pos, axis)))); const tang = lolV.norm(lolV.cross(axis, radial)); v = lolV.add(along, lolV.mul(tang, sp)); }
    }
    p.vel = lolV.add(p.vel, lolV.sub(v, sv)); // 마당이 바꾼 양은 저장 속도에 남는다
    return v;
  }

  // ---------- 그리기 ----------
  uvTransform(p, uv, sysT) {
    const e = this.def;
    const ctr = e.uvTransformCenter || [0.5, 0.5];
    const t = p.t || 0;
    let a = (lolVfxSample(e.uvRotation, t, null, 0) + p.age * p.buvRot + (p.life > 0 ? lolVfxIntegrate(e.particleUVRotateRate, t, p.life) : 0)) * Math.PI / 180;
    let u = uv[0] - ctr[0], v = uv[1] - ctr[1];
    const ca = Math.cos(a), sa = Math.sin(a);
    [u, v] = [u * ca - v * sa, u * sa + v * ca];
    const s = lolVfxSample(e.uvScale, t, null, [1, 1]);
    u = u * s[0] + ctr[0]; v = v * s[1] + ctr[1];
    let off = [p.buvOff[0] + p.age * p.buvScroll[0], p.buvOff[1] + p.age * p.buvScroll[1]];
    off = e.uvScrollClamp ? off.map((x) => Math.max(-1, Math.min(1, x))) : off.map((x) => x - Math.floor(x));
    const integ = p.life > 0 ? lolVfxIntegrate(e.particleUVScrollRate, t, p.life) : [0, 0];
    u += off[0] + integ[0]; v += off[1] + integ[1];
    if (e.TextureFlipU) u = 1 - u;
    if (e.TextureFlipV) v = 1 - v;
    if (this.isSimple) { const sr = ((e.LegacySimple || {}).uvScrollRate) || [0, 0]; u += (sr[0] * p.age) % 1; v += (sr[1] * p.age) % 1; }
    const es = e.emitterUvScrollRate || [0, 0];
    return [u + es[0] * sysT, v + es[1] * sysT];
  }
  cellOf(p) {
    const e = this.def, div = e.texDiv || [1, 1], cols = Math.max(1, Math.round(div[0])), rows = Math.max(1, Math.round(div[1]));
    const f = lolVfxFrame(e, p.age, p.bframe, p.shared);
    return [(f % cols) / cols, (Math.floor(f / cols) % rows) / rows, 1 / cols, 1 / rows];
  }
  lookupOf(p) {
    const e = this.def, s = e.colorLookUpScales || [1, 1], o = e.colorLookUpOffsets || [0, 0];
    return [lolVfxColorLookup(e.colorLookUpTypeX ?? 1, s[0], o[0], p.t || 0, p.speed, p.shared), lolVfxColorLookup(e.colorLookUpTypeY ?? 0, s[1], o[1], p.t || 0, p.speed, p.shared)];
  }
  draw(cam, sysT) {
    const b = this.batch; b.begin();
    const e = this.def, type = this.primType;
    if (type === 'VfxPrimitiveNonRenderable' || type === 'VfxPrimitiveMesh' || type === 'VfxPrimitiveAttachedMesh' || type === 'VfxPrimitiveCameraSegmentBeam') { b.end(); return; }
    if (this.isTrail) { this.drawTrail(cam, sysT); b.end(); return; }
    for (const p of this.particles) {
      if (!p.world) continue;
      const cell = this.cellOf(p), lk = this.lookupOf(p);
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]].map((q) => this.uvTransform(p, q, sysT));
      let corners;
      const P = p.world, S = p.scale;
      if (type === 'VfxPrimitiveCameraQuad' || type === 'VfxPrimitiveCameraUnitQuad' || this.isSimple) {
        const half = type === 'VfxPrimitiveCameraUnitQuad' ? 0.5 : 1;
        let right = cam.right, up = cam.up;
        if (this.isSimple) { const o = (this.def.LegacySimple || {}).orientation || 0; if (o === 1) { right = [0, 0, 1]; up = [0, 1, 0]; } else if (o === 2) { right = [1, 0, 0]; up = [0, 0, 1]; } else if (o === 3) { right = [1, 0, 0]; up = [0, 1, 0]; } }
        let sx = S[0] * half, sy = S[1] * half;
        if (e.isDirectionOriented && p.speed > 1e-4) { // 화면에 투영한 이동 방향이 scale0.y 축
          const d = lolV.sub(p.world, p.prevWorld), dr = lolV.dot(d, cam.right), du = lolV.dot(d, cam.up), l = Math.hypot(dr, du);
          if (l > 1e-6) { up = lolV.add(lolV.mul(cam.right, dr / l), lolV.mul(cam.up, du / l)); right = lolV.cross(up, cam.forward); right = lolV.norm(right); }
        } else { const roll = Math.trunc(p.ang ? p.ang[0] : 0) * Math.PI / 180, c = Math.cos(roll), s = Math.sin(roll); const r2 = lolV.add(lolV.mul(right, c), lolV.mul(up, s)), u2 = lolV.add(lolV.mul(up, c), lolV.mul(right, -s)); right = r2; up = u2; }
        if (e.directionVelocityScale) sy *= Math.max(e.directionVelocityMinScale ?? 1, p.speed * e.directionVelocityScale);
        const R = lolV.mul(right, sx), U = lolV.mul(up, sy);
        corners = [lolV.add(lolV.sub(P, R), U), lolV.add(lolV.add(P, R), U), lolV.sub(lolV.add(P, R), U), lolV.sub(lolV.sub(P, R), U)]; // 왼위·오른위·오른아래·왼아래(u 0→1, v 0 위 →1 아래)
      } else if (type === 'VfxPrimitiveArbitraryQuad' || type === 'VfxPrimitivePlanarProjection') {
        let rot = p.rot;
        if (e.isDirectionOriented && p.speed > 1e-4) { const z = lolV.norm(lolV.sub(p.world, p.prevWorld)); const x = lolV.norm(lolV.cross([0, 1, 0], z)); const y = lolV.cross(z, x); rot = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]; }
        let X = [rot[0], rot[3], rot[6]], Y = [rot[1], rot[4], rot[7]];
        let sx = S[0], sy = S[1];
        if (type === 'VfxPrimitivePlanarProjection') { X = [1, 0, 0]; Y = [0, 0, 1]; sy = S[2] || S[0]; } // 문서에 기하가 없어 바닥에 눕힌 판으로 근사
        if (e.directionVelocityScale) sx *= Math.max(e.directionVelocityMinScale ?? 1, p.speed * e.directionVelocityScale);
        const XX = lolV.mul(X, sx), YY = lolV.mul(Y, sy);
        // 문서: u = y + 0.5(로컬 +Y 방향), v = 0.5 - x(로컬 +X 반대) → 꼭짓점 순서를 그 매핑에 맞춘다
        corners = [lolV.sub(lolV.add(P, XX), YY), lolV.add(lolV.add(P, XX), YY), lolV.add(lolV.sub(P, XX), YY), lolV.sub(lolV.sub(P, XX), YY)];
        if (type === 'VfxPrimitivePlanarProjection') corners = corners.map((c) => [c[0], (this.system.groundY ?? 0) + 2, c[2]]);
      } else if (type === 'VfxPrimitiveRay') {
        const axis = lolV.norm([p.rot[2], p.rot[5], p.rot[8]]);
        const near = lolV.add(P, lolV.mul(axis, S[2])), far = lolV.add(P, lolV.mul(axis, S[2] + S[1]));
        const side = lolV.mul(lolV.norm(lolV.cross(axis, cam.forward)), S[0] * 0.5);
        corners = [lolV.sub(far, side), lolV.add(far, side), lolV.add(near, side), lolV.sub(near, side)];
      } else if (type === 'VfxPrimitiveBeam') {
        corners = this.beamCorners(p, cam);
        if (!corners) continue;
      } else continue;
      let color = p.color;
      if (type === 'VfxPrimitivePlanarProjection') { const pd = this.prim.mProjection; if (pd && pd.colorModulate) color = lolVfxSample(pd.colorModulate, p.t || 0, null, [1, 1, 1, 1]); }
      if (type === 'VfxPrimitiveBeam') { const bd = this.prim.mBeam || {}; if (bd.mIsColorBindedWithDistance) { const k = lolVfxSample(bd.mAnimatedColorWithDistance, this.beamLen || 0, null, [1, 1, 1, 1]); color = color.map((x, i) => x * k[i]); } }
      b.quad(corners, type === 'VfxPrimitiveBeam' ? this.beamUv(p, uvq) : uvq, [color], cell, lk);
    }
    b.end();
  }
  beamCorners(p, cam) {
    const sys = this.system, bd = (this.prim && this.prim.mBeam) || {};
    const tgt = sys.targetPos(); if (!tgt) return null;
    const so = bd.mLocalSpaceSourceOffset || [0, 0, 0], to = bd.mLocalSpaceTargetOffset || [0, 0, 0];
    const src = lolV.add(sys.pos, lolVfxMat3Apply(sys.rot, so)), dst = lolV.add(tgt, lolVfxMat3Apply(sys.rot, to));
    const d = lolV.sub(dst, src); this.beamLen = lolV.len(lolV.sub(tgt, sys.pos)); if (lolV.len(d) < 1e-6) return null;
    const S = p.scale, a = lolV.add(src, lolV.mul(d, S[1] || 0)), z = lolV.sub(dst, lolV.mul(d, S[2] || 0));
    let w;
    if ((bd.mMode || 0) === 1) { const flat = lolV.norm(lolV.cross([0, 1, 0], d)); w = lolV.mul(lolVfxMat3Apply(p.rot, flat), S[0] * 0.5); }
    else w = lolV.mul(lolV.norm(lolV.cross(d, cam.forward)), S[0] * 0.5);
    this.beamWidth = S[0]; this.beamFull = lolV.len(d);
    return [lolV.sub(a, w), lolV.add(a, w), lolV.add(z, w), lolV.sub(z, w)];
  }
  beamUv(p, uvq) {
    // 빔: 텍스처 v가 빔 길이 방향, u가 폭 방향. 반복 수 = 폭/x, 길이/y(0 이하면 한 번). UV 변환의 첫 축이 길이 방향.
    const tl = p.tiling || [0, 0, 0];
    const ru = tl[0] > 0 ? this.beamWidth / tl[0] : 1, rv = tl[1] > 0 ? this.beamFull / tl[1] : 1;
    return uvq.map(([u, v]) => [v * ru, u * rv]);
  }
  drawTrail(cam, sysT) {
    const b = this.batch, e = this.def, tr = this.trail;
    let pts = this.particles.filter((p) => p.world);
    if (pts.length < 2) return;
    pts = (tr.mSmoothingMode || 0) === 2 ? pts.slice() : pts.slice().reverse(); // 0·1: 새것→옛것, 2: 옛것→새것
    const arbitrary = this.primType === 'VfxPrimitiveArbitraryTrail';
    // 길이 자르기(mCutoff)와 u 좌표
    let dist = 0; const ds = [0];
    for (let i = 1; i < pts.length; i++) { dist += lolV.len(lolV.sub(pts[i].world, pts[i - 1].world)); ds.push(dist); }
    let n = pts.length;
    if (tr.mCutoff > 0) { n = 1; while (n < pts.length && ds[n] <= tr.mCutoff) n++; }
    const side = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (arbitrary) side.push([p.rot[0], p.rot[3], p.rot[6]]);
      else {
        const dir = i === 0 ? lolV.sub(pts[1].world, p.world) : lolV.sub(p.world, pts[i - 1].world);
        side.push(lolV.norm(lolV.cross(dir, cam.forward)));
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      const wa = A.scale[0], wb = B.scale[0];
      const ua = this.trailU(A, ds[i]), ub = this.trailU(B, ds[i + 1]);
      const va = this.trailV(A, wa), vb = this.trailV(B, wb);
      const corners = [lolV.add(A.world, lolV.mul(side[i], wa)), lolV.sub(A.world, lolV.mul(side[i], wa)), lolV.sub(B.world, lolV.mul(side[i + 1], wb)), lolV.add(B.world, lolV.mul(side[i + 1], wb))];
      const uvs = [this.uvTransform(A, [ua, va[0]], sysT), this.uvTransform(A, [ua, va[1]], sysT), this.uvTransform(B, [ub, vb[1]], sysT), this.uvTransform(B, [ub, vb[0]], sysT)];
      b.quad(corners, uvs, [A.color, A.color, B.color, B.color], [this.cellOf(A), this.cellOf(A), this.cellOf(B), this.cellOf(B)], [this.lookupOf(A), this.lookupOf(A), this.lookupOf(B), this.lookupOf(B)]);
    }
  }
  trailU(p, distAlong) { const tx = (p.tiling || [0])[0]; if (!(tx > 0)) return 0; return ((this.trail.mMode || 0) !== 0 ? (this.trailTravel - p.trailU) : distAlong) / tx; }
  trailV(p, halfWidth) { const ty = (p.tiling || [0, 0])[1]; if (!ty) return [0, 1]; const span = ty > 0 ? halfWidth / ty : -ty; return [0.5 - span / 2, 0.5 + span / 2]; }
  dispose() { this.system.group.remove(this.batch.mesh); this.batch.dispose(); this.material.dispose(); for (const p of this.particles) if (p.child) p.child.stop(true); this.particles = []; }
}

// ---------- 시스템(인스턴스 하나) ----------
class LolVfxSystem {
  constructor(manager, def, opts = {}) {
    this.manager = manager; this.def = lolVfxWithDefaults(def, 'VfxSystemDefinitionData'); this.opts = opts;
    this.group = manager.root; this.time = 0; this.acc = 0; this.stopping = false; this.done = false;
    this.flags = this.def.flags ?? 212; this.scale = opts.scale ?? 1; this.color = opts.color || [1, 1, 1, 1];
    this.pos = [0, 0, 0]; this.rot = LOL_VFX_I3; this.speed = 0; this.groundY = 0;
    const m = this.def.transform;
    if (Array.isArray(m) && m.length === 16 && !m.every((x, i) => x === [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i])) this.transform = { r: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t: [m[12], m[13], m[14]] };
    this.readAttachment();
    this.emitters = [];
    const q = manager.quality, cb = manager.colorblind;
    const passes = (raw, simple) => {
      if (!raw) return false;
      const e = lolVfxWithDefaults(raw, 'VfxEmitterDefinitionData');
      if (e.disabled) return false;
      if (!(lolVfxSample(e.rate, 0, null, 0) > 0) && !e.isSingleParticle && !e.flexRate && !(e.materialOverrideDefinitions || []).length && !(e.rate && e.rate.dynamics)) return false;
      if (!lolVfxImportanceExists(e.importance ?? 2, q)) return false;
      if (!simple) { if ((e.ChanceToNotExist || 0) > Math.random()) return false; const cv = e.colorblindVisibility || 0; if (cv >= 3 || (cv === 1 && cb) || (cv === 2 && !cb)) return false; }
      const f = e.Filtering;
      if (f) { const kw = opts.keywords || []; if ((f.keywordsExcluded || []).some((k) => kw.includes(k)) || !(f.keywordsRequired || []).every((k) => kw.includes(k)) || ((f.keywordsIncluded || []).length && !(f.keywordsIncluded || []).some((k) => kw.includes(k)))) return false; }
      return true;
    };
    for (const raw of this.def.complexEmitterDefinitionData || []) if (passes(raw, false)) this.emitters.push(new LolVfxEmitter(this, raw, false));
    if (this.def.drawingLayer !== 1) for (const raw of this.def.simpleEmitterDefinitionData || []) if (passes(raw, true)) this.emitters.push(new LolVfxEmitter(this, raw, true));
    if (this.def.buildUpTime > 0) this.advance(this.def.buildUpTime);
  }
  // 붙은 대상(Object3D 또는 함수)에서 위치·방향을 원작 좌표(왼손, X 뒤집기)로 읽는다
  readAttachment() {
    const a = this.opts.attach;
    let wp = null, wq = null;
    if (typeof a === 'function') { const r = a(); wp = r && (r.position || r); wq = r && r.quaternion; }
    else if (a && a.isObject3D) { wp = new THREE.Vector3(); a.getWorldPosition(wp); wq = new THREE.Quaternion(); a.getWorldQuaternion(wq); }
    else if (this.opts.position) { wp = this.opts.position; wq = this.opts.quaternion; }
    if (wp) this.pos = this.manager.toLol(wp);
    if (wq) this.rot = this.manager.rotToLol(wq);
    if (this.opts.groundY != null) this.groundY = this.opts.groundY / this.manager.unit;
  }
  targetPos() {
    const t = this.opts.target;
    if (!t) return null;
    if (typeof t === 'function') { const v = t(); return v ? this.manager.toLol(v) : null; }
    if (t.isObject3D) { const v = new THREE.Vector3(); t.getWorldPosition(v); return this.manager.toLol(v); }
    return this.manager.toLol(t);
  }
  spawnChild(emitter, p, onDeath) {
    const c = emitter.def.childParticleSetDefinition, ids = c.childrenIdentifiers || [];
    if (!ids.length) return;
    let list;
    if ((c.boneToSpawnAt || []).length) { if (c.boneToSpawnAt.length < ids.length) return; list = ids; }
    else { const idx = Math.max(0, Math.min(ids.length - 1, Math.floor(lolVfxSample(c.childrenProbability, 0, null, 0)))); list = [ids[idx]]; }
    for (const id of list) {
      const def = lolVfxFindChild(this.manager.registry, id);
      if (!def) continue;
      const mgr = this.manager;
      const getter = () => ({ position: mgr.fromLol(p.world || p.spawnPos), quaternion: null });
      const child = mgr.spawn(def, { attach: onDeath ? null : getter, position: onDeath ? mgr.fromLol(p.world || p.spawnPos) : undefined, scale: this.scale, flex: [0, 0, 0] }); // 자식은 flex 값을 받지 않는다(문서)
      if (!onDeath) p.child = child;
    }
  }
  stop(hard) { if (hard) { this.done = true; } else this.stopping = true; }
  advance(dt) {
    this.acc += dt;
    let steps = Math.floor(this.acc / LOL_VFX_STEP);
    const stepDt = [];
    if (steps > 0) { steps = Math.min(steps, 8); for (let i = 0; i < steps; i++) stepDt.push(LOL_VFX_STEP); this.acc -= steps * LOL_VFX_STEP; if (this.acc > LOL_VFX_STEP) this.acc = 0; }
    else if (this.flags & 0x40 && this.acc > 0) { stepDt.push(this.acc); this.acc = 0; } // SimulateEveryFrame
    if (this.flags & 0x8) { stepDt.length = 0; stepDt.push(dt); this.acc = 0; } // SimulateOncePerFrame
    for (const sdt of stepDt) {
      const prev = this.pos.slice();
      this.readAttachment();
      this.speed = lolV.len(lolV.sub(this.pos, prev)) / sdt;
      this.time += sdt;
      for (const em of this.emitters) em.step(sdt, this.time, prev);
    }
    if (this.emitters.every((em) => em.finished && em.particles.length === 0)) this.done = true;
  }
  draw(cam) { for (const em of this.emitters) em.draw(cam, this.time); }
  dispose() { for (const em of this.emitters) em.dispose(); this.emitters = []; }
}

// ---------- 관리자 ----------
class LolVfxManager {
  constructor(scene, opts = {}) {
    this.scene = scene; this.unit = opts.unitScale ?? (typeof lolRangeToWorld === 'function' ? lolRangeToWorld(1) : 0.01);
    this.quality = opts.quality ?? 4; this.colorblind = !!opts.colorblind; this.registry = {};
    this.textures = new LolVfxTextureCache(opts.resolveTexture || lolVfxDefaultTexturePath);
    this.root = new THREE.Group(); this.root.name = 'lolVfxRoot';
    this.root.scale.set(-this.unit, this.unit, this.unit); // 원작 좌표 → 장면: X 뒤집기 + LoL 단위 배율
    scene.add(this.root);
    this.systems = []; this.timeScale = 1;
  }
  register(parsedOrText) { const p = typeof parsedOrText === 'string' || !parsedOrText.entries ? lolBinParse(parsedOrText) : parsedOrText; Object.assign(this.registry, lolBinCollectVfxSystems(p)); return p; }
  find(name) { return this.registry[name] || null; }
  toLol(v) { return [-v.x / this.unit, v.y / this.unit, v.z / this.unit]; }
  fromLol(a) { return new THREE.Vector3(-a[0] * this.unit, a[1] * this.unit, a[2] * this.unit); }
  rotToLol(q) { const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)).elements; // 열 우선
    const r = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]], s = [-1, 1, 1];
    return r.map((x, i) => x * s[Math.floor(i / 3)] * s[i % 3]); }
  spawn(defOrName, opts = {}) {
    const def = typeof defOrName === 'string' ? this.find(defOrName) : defOrName;
    if (!def) { console.warn('[LOL VFX] 정의를 찾지 못함:', defOrName); return null; }
    const s = new LolVfxSystem(this, def, opts);
    this.systems.push(s);
    return s;
  }
  update(dt, camera) {
    dt *= this.timeScale;
    for (let i = this.systems.length - 1; i >= 0; i--) {
      const s = this.systems[i];
      if (!s.done) s.advance(dt);
      if (s.done) { s.dispose(); this.systems.splice(i, 1); }
    }
    if (camera) {
      const e = camera.matrixWorld.elements;
      const conv = (x, y, z) => lolV.norm([-x, y, z]);
      const cam = { right: conv(e[0], e[1], e[2]), up: conv(e[4], e[5], e[6]), forward: conv(-e[8], -e[9], -e[10]) };
      for (const s of this.systems) s.draw(cam);
    }
  }
}
// 원작 경로("ASSETS/Characters/Nilah/Skins/Base/Particles/Nilah_Base_Q_Water.tex") → 저장소 assets/lolvfx/(소문자 경로, 확장자 .png)
function lolVfxDefaultTexturePath(path) {
  if (!path) return null;
  return 'assets/lolvfx/' + path.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '').replace(/\.(tex|dds|tga)$/i, '.png');
}
