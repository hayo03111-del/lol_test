/* ============================================================
   SKILL TELEGRAPH SYSTEM (스킬 예고 표시 - 아군·적군 모두에게 보이는 지면 표시)
   ------------------------------------------------------------
   사거리 링(RangeIndicatorSystem, V키)은 시전자 본인만 보는 조준 보조다. 이 시스템은 원작에서 "모든 플레이어가
   보는" 스킬 지면 연출(예고·지대)을 그린다.

   보이는 규칙(원작):
   - 시전자와 같은 팀: 항상 보인다.
   - 상대 팀: 그 지점을 시야에 두고 있을 때만 보인다(PC 위키 - 레오나 쏠라 플레어 "적이 그 지역 시야를 가지고
     있을 때만 연출이 보인다"). visibility:'always'는 예외(초가스 Q - "덤불·전장의 안개 안에서도 보인다"),
     visibility:{insetLol:n}은 "시야 안으로 n 이상 들어와야" 보인다(모데카이저 E - 300).
   지금 화면을 그리는 팀은 visionSystem.viewTeam("적 팀 시야로 보기"로 바꿀 수 있다).

   모양은 원작 수치(반경·길이·폭·지속시간)를 그대로 쓰고, 텍스처는 저장소에 있는 원작 공통 텍스처를 쓴다
   (assets/nilah: base_cracks_gradient - 균열, glow-soft - 채움). 챔피언별 원본 예고 텍스처는 CommunityDragon이
   이 환경에서 막혀 있어 받지 못했다 - 받으면 TELEGRAPH_TEXTURES에 경로만 추가하면 된다.
   ============================================================ */
const TELEGRAPH_TEXTURE_BASE = 'assets/nilah/';
const TELEGRAPH_TEXTURES = {};
function telegraphTexture(file) {
  if (!TELEGRAPH_TEXTURES[file] && typeof THREE !== 'undefined' && THREE.TextureLoader) {
    TELEGRAPH_TEXTURES[file] = new THREE.TextureLoader().load(TELEGRAPH_TEXTURE_BASE + file);
  }
  return TELEGRAPH_TEXTURES[file] || null;
}

class SkillTelegraphSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  // opts: { shape:'circle'|'ring'|'rect', center(Vector3), radius, innerRadius, dir(Vector3), length, width,
  //         duration(sec), color, team, visibility:'vision'|'always'|{insetLol}, texture, follow(unit), pulse }
  spawn(opts) {
    if (!opts || !opts.center || !(opts.duration > 0) || typeof THREE === 'undefined') return null;
    const group = new THREE.Group();
    const color = opts.color ?? 0xff4040;
    const tex = opts.texture ? telegraphTexture(opts.texture) : telegraphTexture('glow-soft.png');
    const fillMat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    let fillGeo, edgeGeo;
    const edge = lolRangeToWorld(10);
    if (opts.shape === 'rect') {
      const L = lolRangeToWorld(opts.length || 0), Wd = lolRangeToWorld(opts.width || 0);
      fillGeo = new THREE.PlaneGeometry(Wd, L);
      fillGeo.translate(0, L / 2, 0);
      const shapeOut = new THREE.Shape();
      shapeOut.moveTo(-Wd / 2, 0); shapeOut.lineTo(Wd / 2, 0); shapeOut.lineTo(Wd / 2, L); shapeOut.lineTo(-Wd / 2, L); shapeOut.lineTo(-Wd / 2, 0);
      const hole = new THREE.Path();
      hole.moveTo(-Wd / 2 + edge, edge); hole.lineTo(-Wd / 2 + edge, L - edge); hole.lineTo(Wd / 2 - edge, L - edge); hole.lineTo(Wd / 2 - edge, edge); hole.lineTo(-Wd / 2 + edge, edge);
      shapeOut.holes.push(hole);
      edgeGeo = new THREE.ShapeGeometry(shapeOut);
    } else if (opts.shape === 'ring') {
      const R = lolRangeToWorld(opts.radius || 0), r = lolRangeToWorld(opts.innerRadius || 0);
      fillGeo = new THREE.RingGeometry(r, R, 72);
      edgeGeo = new THREE.RingGeometry(Math.max(0, R - edge), R, 72);
    } else {
      const R = lolRangeToWorld(opts.radius || 0);
      fillGeo = new THREE.CircleGeometry(R, 72);
      edgeGeo = new THREE.RingGeometry(Math.max(0, R - edge), R, 72);
    }
    const fill = new THREE.Mesh(fillGeo, fillMat);
    const outline = new THREE.Mesh(edgeGeo, edgeMat);
    for (const m of [fill, outline]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 2; group.add(m); }
    outline.position.y = 0.005;
    group.position.set(opts.center.x, 0.04, opts.center.z);
    if (opts.shape === 'rect' && opts.dir) group.rotation.y = Math.atan2(opts.dir.x, opts.dir.z) + Math.PI; // 평면 +y(국소) → 진행 방향
    this.scene.add(group);
    const t = {
      group, fill, outline, opts, age: 0, duration: opts.duration,
      team: opts.team || (typeof PLAYER_TEAM !== 'undefined' ? PLAYER_TEAM : 'BLUE'),
      visibility: opts.visibility || 'vision',
      owner: opts.owner || null, // 시전자 - 챔피언 교체/폐기 시 그 시전자의 예고를 함께 지운다
    };
    this.active.push(t);
    return t;
  }

  // 지금 화면을 그리는 팀에게 이 예고가 보이는가.
  isVisibleToViewer(t) {
    const vs = typeof visionSystem !== 'undefined' ? visionSystem : null;
    if (!vs || !vs.enabled) return true;
    const viewer = vs.viewTeam;
    if (viewer === t.team || t.visibility === 'always') return true;
    const inset = (t.visibility && t.visibility.insetLol) || 0;
    // 사각형은 중심선 위 몇 점 중 하나라도 시야 안이면 보인다.
    const pts = [t.group.position];
    if (t.opts.shape === 'rect' && t.opts.dir) {
      const L = lolRangeToWorld(t.opts.length || 0);
      for (const k of [0.25, 0.5, 0.75, 1]) pts.push(new THREE.Vector3(t.opts.center.x + t.opts.dir.x * L * k, 0, t.opts.center.z + t.opts.dir.z * L * k));
    }
    return pts.some((p) => vs.isPointVisibleTo(viewer, p, inset));
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.age += dt;
      if (t.opts.follow) {
        const p = getWorldPosition(t.opts.follow);
        if (p) t.group.position.set(p.x, 0.04, p.z);
      }
      const k = Math.min(1, t.age / t.duration);
      // 0.1초 페이드 인, 마지막 15% 페이드 아웃. pulse면 끝으로 갈수록 밝아진다(터지기 직전 강조).
      const fadeIn = Math.min(1, t.age / 0.1), fadeOut = k > 0.85 ? Math.max(0, (1 - k) / 0.15) : 1;
      const base = (t.opts.opacity ?? 0.5) * fadeIn * fadeOut * (t.opts.pulse ? (0.6 + 0.4 * k) : 1);
      const show = this.isVisibleToViewer(t);
      t.group.visible = show;
      t.fill.material.opacity = base * 0.75;
      t.outline.material.opacity = Math.min(1, base * 1.6);
      if (t.age >= t.duration) this._dispose(i);
    }
  }

  _dispose(i) {
    const t = this.active[i];
    this.scene.remove(t.group);
    for (const m of [t.fill, t.outline]) { m.geometry.dispose(); m.material.dispose(); }
    this.active.splice(i, 1);
  }

  clear() { for (let i = this.active.length - 1; i >= 0; i--) this._dispose(i); }
  // 시전자가 사라지면(챔피언 교체 등) 효과도 취소되므로 그 시전자의 예고·지대 표시도 지운다.
  clearOwner(owner) { for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i].owner === owner) this._dispose(i); }
}
