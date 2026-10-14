/* nilah_vfx_v2.js
 * 사용자가 별도 도구로 만든 NilahVFXManager_v2.js를 이 프로젝트의 실행 구조에
 * 맞게 이식한 파일이다. 이 프로젝트는 번들러 없이 모든 src/ 파일을 build.py가
 * 순서대로 이어붙여 하나의 <script type="module">로 실행하므로(THREE는 이미
 * runtime_imports.js에서 한 번 import되어 있음), 원본의 `import`/`export`
 * 구문만 제거하고 클래스/함수 본문은 그대로 유지했다. 로직 자체는 손대지
 * 않았다 - 통합(연결)은 이 파일이 아니라 nilah.js에서 한다.
 */

const NILAH_VFX2_TAU = Math.PI * 2;

/* ============================================================
   실제 원본 파티클 텍스처 연결 (하요가 직접 올려준 PNG 100여 장)
   "원래 이펙트 싹다 지우고 보내준 걸로 다시 만들어줘" 요청 반영:
   이 절차적(procedural) 레이어는 지금까지 순수 색상(MeshBasicMaterial
   color만 사용, map 없음)만으로 그려서 실제 게임과 무관한 임의의
   도형이었다. 이제 실제 텍스처를 map으로 물려서, 텍스처 로드 성공
   여부와 무관하게 항상 렌더되는 이 레이어에서도 실제 원본 그림이
   보이도록 한다. 스킬 전용 파일이 아직 없는 Q/W는 테마가 맞는 범용
   텍스처(물 관련/바람 관련)로 대체했고, 그 사실을 각 주석에 남긴다.
   ============================================================ */
const _nilahVfx2TexLoader = new THREE.TextureLoader();
// 버그 수정: nilah_vfx_assets_and_runtime.js의 _nilahTexLoader와 동일한
// file:// CORS 차단 문제 - 로컬 assets/nilah/*.png인데도 기본
// crossOrigin='anonymous' 때문에 전부 로드 실패했다. 동일하게 해제.
_nilahVfx2TexLoader.crossOrigin = undefined;
const NILAH_VFX2_LOCAL_TEX = {};
function nilahVfx2LoadTex(name, file) {
  const tex = _nilahVfx2TexLoader.load(
    'assets/nilah/' + file,
    undefined, undefined,
    (err) => console.warn('[NILAH VFX2] 텍스처 로드 실패:', name, file, err)
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  NILAH_VFX2_LOCAL_TEX[name] = tex;
  return tex;
}
// Q: 전용 스킬 파일(q_swipe 등)이 아직 없어서, 물방울/물결 테마의
// 범용 텍스처로 대체 - color_nilah_q_shield만 Q 전용 실제 파일.
nilahVfx2LoadTex('qShield', 'color_nilah_q_shield.png');
nilahVfx2LoadTex('qSpike', 'common_waterspike32.png');
nilahVfx2LoadTex('qDroplet', 'nilah_base_droplet_rotate_mult.png');
nilahVfx2LoadTex('qGlow', 'nilah_base_glow.png');
// W: color_nilah_w_windwall_dust, mult_windblast_2가 W 전용 실제 파일.
nilahVfx2LoadTex('wDust', 'color_nilah_w_windwall_dust.png');
nilahVfx2LoadTex('wWind', 'nilah_base_mult_windblast_2.png');
nilahVfx2LoadTex('wWeb', 'common_color-whiteweb32.png');
// E: watercrescent가 이름부터 정확히 일치(초승달 물결).
nilahVfx2LoadTex('eCrescent', 'nilah_base_e_watercrescent_2x2.png');
nilahVfx2LoadTex('eJelly', 'nilah_base_e_jellyfish01.png');
// R: 실제 R 전용 파일 다수 보유.
nilahVfx2LoadTex('rBlast', 'nilah_base_blastring.png');
nilahVfx2LoadTex('rBlast2', 'nilah_base_blastring2.png');
nilahVfx2LoadTex('rSwirl', 'nilah_base_r_cascircle_swirl_scroll_dark_mask.png');
nilahVfx2LoadTex('rConeHit', 'nilah_base_r_cone_hit.png');
nilahVfx2LoadTex('rStreaks', 'nilah_base_r_energystreaksadd.png');
nilahVfx2LoadTex('rFlash', 'nilah_base_r_flash.png');
nilahVfx2LoadTex('rGlow3', 'nilah_base_r_glow_03.png');
// 패시브(영원한 기쁨) 힐/실드 공유 버블.
nilahVfx2LoadTex('shieldAura', 'aura_self.png');
nilahVfx2LoadTex('shieldSpark', 'nilah_base_p_stardustmote.png');
nilahVfx2LoadTex('passiveBlob', 'nilah_base_p_blobbies03.png');

function nilahVfx2MakeMat(color, opacity = 1, additive = true, map = null) {
  return new THREE.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function nilahVfx2SafeDirection(direction) {
  const d = direction?.clone?.() ?? new THREE.Vector3(0, 0, 1);
  d.y = 0;
  if (d.lengthSq() < 1e-8) d.set(0, 0, 1);
  return d.normalize();
}

function nilahVfx2YawFromDirection(d) {
  return Math.atan2(d.x, d.z);
}

function nilahVfx2DisposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
  root.parent?.remove(root);
}

class NilahVfx2PulseRing extends THREE.Mesh {
  constructor(radius = 1, tube = 0.06, color = 0x78f3ff, opacity = 0.7, map = null) {
    super(new THREE.TorusGeometry(radius, tube, 8, 64), nilahVfx2MakeMat(color, opacity, true, map));
    this.rotation.x = Math.PI / 2;
    this.userData.vfxType = "pulseRing";
  }
}

class NilahVfx2SplashArc extends THREE.Group {
  constructor(color = 0x61e9ff) {
    super();
    this.userData.vfxType = "splashArc";
    const geo = new THREE.CylinderGeometry(0.025, 0.075, 1.25, 8, 1, true);
    for (let i = 0; i < 9; i++) {
      const m = nilahVfx2MakeMat(color, 0.12 + Math.random() * 0.18);
      const mesh = new THREE.Mesh(geo.clone(), m);
      const a = (i / 8 - 0.5) * Math.PI * 0.95;
      mesh.position.set(Math.sin(a) * 0.8, 0.12 + Math.random() * 0.15, Math.cos(a) * 0.12);
      mesh.rotation.z = -a;
      mesh.scale.y = 0.45 + Math.random() * 0.8;
      this.add(mesh);
    }
  }
}

class NilahVfx2WaterRibbon extends THREE.Mesh {
  constructor(length = 5, width = 1, color = 0x63efff, opacity = 0.45, map = null) {
    const segs = 20;
    const positions = [];
    const uvs = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = t * length;
      const wave = Math.sin(t * Math.PI * 3.0) * width * 0.12;
      const half = width * (0.15 + 0.85 * Math.sin(Math.PI * t) * 0.5);
      positions.push(x, 0.04 + wave, half);
      positions.push(x, 0.04 + wave * 0.5, -half);
      uvs.push(t, 0);
      uvs.push(t, 1);
    }
    const indices = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    super(g, nilahVfx2MakeMat(color, opacity, true, map));
    this.userData.vfxType = "waterRibbon";
    this.position.y = 0.05;
  }
}

class NilahVfx2ParticleField extends THREE.Points {
  constructor(count = 60, spread = 2.0, color = 0x9cf7ff, size = 0.06, map = null) {
    const p = new Float32Array(count * 3);
    const v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.random() * spread;
      const a = Math.random() * NILAH_VFX2_TAU;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = 0.1 + Math.random() * 1.3;
      p[i * 3 + 2] = Math.sin(a) * r;
      v[i * 3] = (Math.random() - 0.5) * 0.8;
      v[i * 3 + 1] = 0.2 + Math.random() * 0.8;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("velocity", new THREE.BufferAttribute(v, 3));
    const m = new THREE.PointsMaterial({
      color, map, size, transparent: true, opacity: 0.65, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    super(g, m);
    this.userData.vfxType = "particleField";
    this.userData.life = 1.0;
  }
  tick(dt) {
    const pos = this.geometry.attributes.position;
    const vel = this.geometry.attributes.velocity;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += vel.array[i * 3] * dt;
      pos.array[i * 3 + 1] += vel.array[i * 3 + 1] * dt;
      pos.array[i * 3 + 2] += vel.array[i * 3 + 2] * dt;
      if (pos.array[i * 3 + 1] > 2.6) pos.array[i * 3 + 1] = 0.05;
    }
    pos.needsUpdate = true;
  }
}

class NilahVfx2Instance {
  constructor(root, duration, updateFn = null) {
    this.root = root;
    this.life = duration;
    this.duration = duration;
    this.updateFn = updateFn;
    this.t = 0;
    this.dead = false;
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const p = THREE.MathUtils.clamp(this.t / Math.max(1e-6, this.duration), 0, 1);
    this.updateFn?.(this, dt, p);
    if (this.t >= this.duration) {
      this.dead = true;
      nilahVfx2DisposeObject(this.root);
    }
  }
}

class NilahVFXManagerV2 {
  constructor(scene) {
    if (!scene) throw new Error("NilahVFXManagerV2 requires a THREE.Scene.");
    this.scene = scene;
    this.instances = [];
    this._tmp = new THREE.Vector3();
  }
  _add(root, duration, updateFn) {
    this.scene.add(root);
    const inst = new NilahVfx2Instance(root, duration, updateFn);
    this.instances.push(inst);
    return inst;
  }
  _flash(position, scale = 1, color = 0xd9ffff, duration = 0.16) {
    const root = new THREE.Group();
    root.position.copy(position);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), nilahVfx2MakeMat(color, 0.9));
    core.rotation.x = -Math.PI / 2;
    root.add(core);
    return this._add(root, duration, (inst) => {
      const p = inst.t / duration;
      const s = THREE.MathUtils.lerp(0.2, 2.2 * scale, p);
      core.scale.setScalar(s);
      core.material.opacity = (1 - p) * 0.9;
    });
  }
  playQ({ position, direction, length = 6.0, duration = 0.42 } = {}) {
    if (!position) throw new Error("playQ requires position.");
    const d = nilahVfx2SafeDirection(direction);
    const root = new THREE.Group();
    root.position.copy(position);
    root.rotation.y = nilahVfx2YawFromDirection(d);
    // Q 전용 스킬 텍스처(q_swipe 등)가 아직 없어서, 물결/물방울 테마의
    // 범용 텍스처(common_waterspike32, nilah_base_droplet_rotate_mult)로
    // 임시 대체 - 나중에 실제 q_swipe 계열 파일을 받으면 이 두 map만
        // 교체하면 된다.
    const outer = new NilahVfx2WaterRibbon(length, 1.55, 0x5edcff, 0.30, NILAH_VFX2_LOCAL_TEX.qSpike);
    const inner = new NilahVfx2WaterRibbon(length * 0.92, 0.55, 0xd2ffff, 0.58, NILAH_VFX2_LOCAL_TEX.qDroplet);
    outer.position.z = 0.02; inner.position.z = 0.04;
    root.add(outer, inner);
    const ring = new NilahVfx2PulseRing(0.42, 0.055, 0x9cffff, 0.65, NILAH_VFX2_LOCAL_TEX.qGlow);
    ring.position.set(0, 0.09, 0);
    root.add(ring);
    const splash = new NilahVfx2SplashArc();
    splash.position.z = length;
    root.add(splash);
    this._flash(position.clone().addScaledVector(d, 0.25), 0.65, 0xbfffff, 0.12);
    // 잔상(afterimage): 실제 칼날 궤적을 살짝 지연시켜 옅게 한 번 더
    // 그려서, 스치듯 지나간 자국이 남는 느낌을 낸다. 메인 리본과 완전히
    // 같은 방향/길이를 쓰되 폭은 살짝 얇고 투명도는 크게 낮춘다.
    const spawnAfterimage = (delayMs, scaleMul, opacityMul) => {
      setTimeout(() => {
        const aRoot = new THREE.Group();
        aRoot.position.copy(position);
        aRoot.rotation.y = nilahVfx2YawFromDirection(d);
        const ghost = new NilahVfx2WaterRibbon(length * scaleMul, 1.1, 0x8fefff, 0.5 * opacityMul);
        aRoot.add(ghost);
        this._add(aRoot, duration * 0.55, (inst) => {
          const p = inst.t / (duration * 0.55);
          ghost.scale.z = Math.max(0.02, Math.min(1, p * 1.3));
          ghost.material.opacity = (1 - p) * 0.5 * opacityMul;
        });
      }, delayMs);
    };
    spawnAfterimage(Math.max(16, duration * 1000 * 0.18), 0.97, 0.55);
    spawnAfterimage(Math.max(32, duration * 1000 * 0.34), 0.9, 0.32);
    return this._add(root, duration, (inst) => {
      const p = inst.t / duration;
      const head = THREE.MathUtils.clamp(p * 1.12, 0, 1);
      outer.scale.z = Math.max(0.02, head);
      inner.scale.z = Math.max(0.02, head);
      outer.material.opacity = (1 - p) * 0.36;
      inner.material.opacity = (1 - p) * 0.72;
      ring.rotation.z += 12 * 0.016;
      splash.children.forEach((c, i) => { c.position.x += Math.sin(inst.t * 20 + i) * 0.008; });
    });
  }
  playW({ position, duration = 1.55 } = {}) {
    if (!position) throw new Error("playW requires position.");
    const root = new THREE.Group();
    root.position.copy(position);
    // W 전용 실제 텍스처(color_nilah_w_windwall_dust, mult_windblast_2)
    // 사용 - 이 둘은 하요가 올려준 실제 W 파일이다.
    const rings = [
      new NilahVfx2PulseRing(1.15, 0.075, 0x75f1ff, 0.62, NILAH_VFX2_LOCAL_TEX.wDust),
      new NilahVfx2PulseRing(1.34, 0.04, 0x9cecff, 0.35, NILAH_VFX2_LOCAL_TEX.wWind),
      new NilahVfx2PulseRing(0.86, 0.055, 0xb9ffff, 0.42, NILAH_VFX2_LOCAL_TEX.wDust),
    ];
    rings.forEach((r, i) => { r.position.y = 0.12 + i * 0.04; root.add(r); });
    const particles = new NilahVfx2ParticleField(75, 1.2, 0x9cf7ff, 0.055, NILAH_VFX2_LOCAL_TEX.wWind);
    root.add(particles);
    const mist = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x66dfff, map: NILAH_VFX2_LOCAL_TEX.wWeb, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    mist.scale.y = 1.2;
    root.add(mist);
    return this._add(root, duration, (inst, dt) => {
      const p = inst.t / duration;
      rings[0].rotation.z -= dt * 3.8;
      rings[1].rotation.z += dt * 2.3;
      rings[2].rotation.z -= dt * 6.5;
      const pulse = 1 + Math.sin(inst.t * 11) * 0.035;
      mist.scale.setScalar(pulse);
      mist.material.opacity = 0.05 + Math.sin(inst.t * 8) * 0.012;
      particles.tick(dt);
      const fade = Math.sin(Math.PI * p);
      rings[0].material.opacity = 0.62 * fade;
      rings[1].material.opacity = 0.35 * fade;
      rings[2].material.opacity = 0.42 * fade;
      particles.material.opacity = 0.55 * fade;
    });
  }
  // 색상 수정(영상 대조 결과 반영 - ability_0895_E1.webm): 실제 E 트레일은
  // 순수 하늘색보다 청보라(인디고) 쪽에 가깝다 - 관찰된 색으로 교체.
  playE({ start, end, duration = 0.32 } = {}) {
    if (!start || !end) throw new Error("playE requires start and end.");
    const delta = new THREE.Vector3().subVectors(end, start);
    const dist = delta.length();
    const d = nilahVfx2SafeDirection(delta);
    const root = new THREE.Group();
    root.position.copy(start);
    root.rotation.y = nilahVfx2YawFromDirection(d);
    // E: watercrescent 텍스처가 실제 E 초승달 물결 모양과 이름부터
    // 정확히 일치해 그대로 사용한다.
    const trail = new NilahVfx2WaterRibbon(Math.max(0.6, dist), 1.25, 0x8f7bff, 0.38, NILAH_VFX2_LOCAL_TEX.eCrescent);
    const core = new NilahVfx2WaterRibbon(Math.max(0.6, dist), 0.38, 0xddd4ff, 0.72, NILAH_VFX2_LOCAL_TEX.eJelly);
    root.add(trail, core);
    const startRing = new NilahVfx2PulseRing(0.32, 0.05, 0xb9a8ff, 0.62);
    root.add(startRing);
    const endRing = new NilahVfx2PulseRing(0.48, 0.06, 0x9c8cff, 0.7);
    endRing.position.set(0, 0.08, dist);
    root.add(endRing);
    const droplets = new NilahVfx2ParticleField(48, 0.9, 0xb9a8ff, 0.05);
    droplets.position.z = dist * 0.45;
    root.add(droplets);
    return this._add(root, duration, (inst, dt) => {
      const p = THREE.MathUtils.clamp(inst.t / duration, 0, 1);
      const visible = Math.max(0.02, p);
      trail.scale.z = visible;
      core.scale.z = visible;
      startRing.scale.setScalar(1 + p * 0.8);
      startRing.material.opacity = (1 - p) * 0.62;
      endRing.scale.setScalar(0.7 + Math.sin(p * Math.PI) * 0.8);
      endRing.material.opacity = 0.25 + Math.sin(p * Math.PI) * 0.45;
      droplets.tick(dt);
      droplets.material.opacity = (1 - p) * 0.58;
    });
  }
  // 색상 수정(영상 대조 결과 반영 - ability_0895_R1.webm 프레임 분석):
  // 이 절차적(procedural) 레이어는 외부 텍스처 로드에 전혀 의존하지
  // 않는 유일한 R 시각효과라서(위 nilah_vfx_assets_and_runtime.js의
  // 텍스처 로드 실패 시 최종 안전망 역할) 여기서부터 실제 영상과 다른
  // 색이면 텍스처 로드 성공 여부와 무관하게 항상 어긋나 보인다. 실제
  // 영상은 또렷하게 2단계로 나뉜다:
  //  1단계(휘두르기, 진행률 0~55%): 연두~라임 계열 회전 링
  //  2단계(버스트+끌어당김, 55~100%): 주황~금색 촉수/발광
  // 색상 자체를 progress(p)에 따라 lerp로 전환시켜 하나의 재생 안에서
  // 자연스럽게 초록→금색으로 넘어가게 한다.
  playR({ position, radius = 3.2, duration = 1.35, follow = null } = {}) {
    if (!position) throw new Error("playR requires position.");
    const root = new THREE.Group();
    root.position.copy(position);
    const whirlColor = new THREE.Color(0x9dfa4a); // 1단계: 라임그린
    const burstColor = new THREE.Color(0xffb347);  // 2단계: 골드/오렌지
    // R 전용 실제 텍스처 연결: 휘두르기 소용돌이엔 rSwirl(실제 회전
    // 소용돌이 마스크), 버스트 링엔 rBlast/rBlast2(실제 폭발 링).
    const outer = new NilahVfx2PulseRing(radius, 0.115, whirlColor.getHex(), 0.52, NILAH_VFX2_LOCAL_TEX.rSwirl);
    const mid = new NilahVfx2PulseRing(radius * 0.72, 0.075, 0xc7ff8a, 0.4, NILAH_VFX2_LOCAL_TEX.rBlast);
    const inner = new NilahVfx2PulseRing(radius * 0.44, 0.055, 0xe8ffc0, 0.56, NILAH_VFX2_LOCAL_TEX.rBlast2);
    outer.rotation.z = 0; mid.rotation.z = 0.7; inner.rotation.z = 1.2;
    root.add(outer, mid, inner);
    const center = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.38, 64), nilahVfx2MakeMat(0x6bd13a, 0.10, true, NILAH_VFX2_LOCAL_TEX.rConeHit));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.03;
    root.add(center);
    const particles = new NilahVfx2ParticleField(130, radius * 0.95, 0xb6ff6e, 0.06, NILAH_VFX2_LOCAL_TEX.rStreaks);
    particles.position.y = 0.15;
    root.add(particles);
    const bursts = [];
    for (let i = 0; i < 10; i++) {
      const b = new NilahVfx2PulseRing(0.18, 0.035, 0xd4ffa0, 0.55, NILAH_VFX2_LOCAL_TEX.rFlash);
      const a = (i / 10) * NILAH_VFX2_TAU;
      b.position.set(Math.cos(a) * radius * 0.68, 0.1, Math.sin(a) * radius * 0.68);
      root.add(b);
      bursts.push(b);
    }
    const _tmpColor = new THREE.Color();
    const phaseSplit = 0.55; // 휘두르기(1단계) 종료 시점 - R.channelDuration(1초)/전체 재생시간 비율과 대략 맞춘 값
    return this._add(root, duration, (inst, dt) => {
      // 28차: R 범위는 닐라 중심으로 판정되므로(_nilahRApplyTick) 이펙트도 닐라를 따라간다.
      if (follow) { const fp = follow(); if (fp) { root.position.x = fp.x; root.position.z = fp.z; } }
      const p = inst.t / duration;
      // 1단계→2단계 색 전환: phaseSplit 이전엔 라임그린 유지, 그 이후
      // 빠르게(약 0.18 구간) 골드/오렌지로 보간한다 - 실제 R처럼 "휘두르기
      // 끝나고 버스트 터지는 순간 색이 바뀌는" 느낌을 낸다.
      const colorT = THREE.MathUtils.clamp((p - phaseSplit) / 0.18, 0, 1);
      _tmpColor.copy(whirlColor).lerp(burstColor, colorT);
      outer.material.color.copy(_tmpColor);
      mid.material.color.lerpColors(new THREE.Color(0xc7ff8a), new THREE.Color(0xffd27a), colorT);
      inner.material.color.lerpColors(new THREE.Color(0xe8ffc0), new THREE.Color(0xfff0c8), colorT);
      center.material.color.lerpColors(new THREE.Color(0x6bd13a), new THREE.Color(0xff9d3f), colorT);
      particles.material.color.lerpColors(new THREE.Color(0xb6ff6e), new THREE.Color(0xffcf7a), colorT);
      // 2단계(버스트) 진입 시점부터는 촉수(bursts)가 중심을 향해 확 당겨지는
      // "끌어당김" 느낌이 나도록 반경 축소 폭을 키운다.
      outer.rotation.z -= dt * 3.2;
      mid.rotation.z += dt * 5.0;
      inner.rotation.z -= dt * 8.0;
      const posAttr = particles.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const len = Math.hypot(x, z);
        if (len > 0.05) {
          const pullStrength = colorT > 0 ? (0.4 + colorT * 2.4) : (0.4 + p * 1.8);
          const factor = Math.max(0.0, 1 - dt * pullStrength);
          posAttr.setX(i, x * factor);
          posAttr.setZ(i, z * factor);
        } else {
          const a = Math.random() * NILAH_VFX2_TAU;
          const r = radius * (0.55 + Math.random() * 0.45);
          posAttr.setX(i, Math.cos(a) * r);
          posAttr.setZ(i, Math.sin(a) * r);
        }
      }
      posAttr.needsUpdate = true;
      bursts.forEach((b, i) => {
        const a = (i / bursts.length) * NILAH_VFX2_TAU + inst.t * (0.8 + i * 0.03);
        const r = radius * (0.7 - p * 0.42);
        b.position.x = Math.cos(a) * r;
        b.position.z = Math.sin(a) * r;
        b.scale.setScalar(0.65 + Math.sin(inst.t * 12 + i) * 0.18);
        b.material.color.lerpColors(new THREE.Color(0xd4ffa0), new THREE.Color(0xffe6b0), colorT);
        b.material.opacity = 0.15 + Math.sin(inst.t * 7 + i) * 0.18;
      });
      const fade = Math.sin(Math.PI * p);
      outer.material.opacity = 0.52 * fade;
      mid.material.opacity = 0.40 * fade;
      inner.material.opacity = 0.56 * fade;
      center.material.opacity = 0.07 + fade * 0.08;
      particles.material.opacity = 0.68 * fade;
    });
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = this.instances.length - 1; i >= 0; i--) {
      const inst = this.instances[i];
      inst.update(dt);
      if (inst.dead) this.instances.splice(i, 1);
    }
  }
  clear() {
    for (const inst of this.instances) nilahVfx2DisposeObject(inst.root);
    this.instances.length = 0;
  }
}

function nilahVfx2Ring(scene, position, radius, color = 0x61eaff, duration = 0.35) {
  const root = new THREE.Group();
  root.position.copy(position);
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 8, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  mesh.rotation.x = Math.PI / 2;
  root.add(mesh);
  scene.add(root);
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / (duration * 1000));
    mesh.scale.setScalar(1 + radius * p * 5);
    mesh.material.opacity = 0.85 * (1 - p);
    if (p < 1) requestAnimationFrame(tick);
    else { mesh.geometry.dispose(); mesh.material.dispose(); scene.remove(root); }
  }
  requestAnimationFrame(tick);
}

NilahVFXManagerV2.prototype.playQLoL = function (opts = {}) {
  this.playQ(opts);
  if (opts.position) nilahVfx2Ring(this.scene, opts.position, 0.55, 0x9ffcff, 0.18);
};
NilahVFXManagerV2.prototype.playWLoL = function (opts = {}) {
  this.playW(opts);
  if (opts.position) nilahVfx2Ring(this.scene, opts.position, 1.0, 0x6feeff, 0.42);
};
NilahVFXManagerV2.prototype.playELoL = function (opts = {}) {
  this.playE(opts);
  if (opts.start) nilahVfx2Ring(this.scene, opts.start, 0.45, 0x7cf3ff, 0.20);
  if (opts.end) nilahVfx2Ring(this.scene, opts.end, 0.60, 0x8ef8ff, 0.24);
};
NilahVFXManagerV2.prototype.playRLoL = function (opts = {}) {
  this.playR(opts);
  if (opts.position) {
    nilahVfx2Ring(this.scene, opts.position, opts.radius || 3.2, 0x8bf4ff, 0.55);
    nilahVfx2Ring(this.scene, opts.position, (opts.radius || 3.2) * 0.62, 0xd0ffff, 0.42);
  }
};
