/* ============================================================
   BRUSH SYSTEM (부쉬 / 덤불)
   ------------------------------------------------------------
   원작 규칙(PC 위키 Brush, Sight):
   - 부쉬 안의 유닛은 상대 팀에게 보이지 않는다(은신이 아니라 "전장의 안개" 취급). 상대 팀이 그 부쉬 안을 볼 때만
     보인다 - 같은 부쉬 안에 있는 유닛·와드, 또는 지역을 드러내는 시야(애쉬 E 매 등 스킬 시야).
   - 부쉬는 바깥 → 안쪽 시야만 막는다. 부쉬 안에서는 바깥이 그대로 보인다.
   - 부쉬 안에서 대상 지정 공격·스킬을 쓰면 잠깐 드러난다: 주변 반경 300을 2초 동안(Fandom 위키 Brush - 공식 위키는
     "공격·스킬 시전 시 은신이 풀릴 수 있다"까지만 서술해 Fandom 수치를 쓴다).
   - 판정(타게팅·시야)은 vision_system.js가 이 파일의 brushAt()을 물어서 처리한다.

   배치: 지금 쓰는 연습장 맵에는 원작 부쉬 위치가 없다(칼바람 지형은 제거된 상태). 기본으로 두 곳을 놓고,
   설정 패널의 "부쉬 설치 모드(N)"로 클릭한 자리에 원하는 만큼 놓을 수 있다. 크기는 원작 부쉬와 비슷한
   가로 450 × 세로 300(LoL 단위 - 맵 데이터를 받지 못해 근사값).
   ============================================================ */
const BRUSH_CONFIG = {
  defaultSizeLol: { width: 450, depth: 300 },
  revealOnActionRadiusLol: 300, // Fandom 위키 Brush
  revealOnActionSec: 2,         // Fandom 위키 Brush
  insideOpacity: 0.35,          // 내 챔피언이 들어가 있는 부쉬는 반투명하게(원작 화면처럼 안이 보이게)
  defaultLayout: [
    { x: -9, z: 2, rotY: 0 },
    { x: 9, z: 2, rotY: 0 },
  ],
};

class BrushSystem {
  constructor(scene) {
    this.scene = scene;
    this.brushes = [];
    this._nextId = 1;
    this._grassMat = null;
  }

  _material() {
    if (!this._grassMat && typeof THREE !== 'undefined') {
      this._grassMat = new THREE.MeshStandardMaterial({ color: 0x2f7a35, roughness: 0.9, transparent: true, opacity: 1, side: THREE.DoubleSide });
    }
    return this._grassMat;
  }

  // 부쉬 하나 추가. x/z는 월드 좌표, 크기는 LoL 단위.
  addBrush({ x, z, widthLol, depthLol, rotY = 0 } = {}) {
    const w = lolRangeToWorld(widthLol || BRUSH_CONFIG.defaultSizeLol.width);
    const d = lolRangeToWorld(depthLol || BRUSH_CONFIG.defaultSizeLol.depth);
    const brush = { id: this._nextId++, center: new THREE.Vector3(x, 0, z), halfW: w / 2, halfD: d / 2, rotY, group: null, mats: [] };
    if (this.scene && typeof THREE !== 'undefined') {
      const group = new THREE.Group();
      // 바닥 그늘
      const baseMat = new THREE.MeshBasicMaterial({ color: 0x1b4d22, transparent: true, opacity: 0.55, depthWrite: false });
      const base = new THREE.Mesh(new THREE.PlaneGeometry(w, d), baseMat);
      base.rotation.x = -Math.PI / 2; base.position.y = 0.02;
      group.add(base);
      // 풀 덤불: 부쉬 안을 고르게 채우는 원뿔 묶음(위치는 부쉬마다 고정 - id로 만든 의사 난수)
      const mat = this._material().clone();
      const n = Math.max(12, Math.round((w * d) / 0.35));
      let seed = brush.id * 9301 + 49297;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < n; i++) {
        const h = 0.55 + rnd() * 0.45, r = 0.16 + rnd() * 0.12;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
        blade.position.set((rnd() - 0.5) * w * 0.95, h / 2, (rnd() - 0.5) * d * 0.95);
        blade.rotation.y = rnd() * Math.PI;
        group.add(blade);
      }
      group.position.copy(brush.center);
      group.rotation.y = rotY;
      this.scene.add(group);
      brush.group = group; brush.mats = [mat, baseMat];
    }
    this.brushes.push(brush);
    return brush;
  }

  addDefaultLayout() { for (const b of BRUSH_CONFIG.defaultLayout) this.addBrush(b); }

  clear() {
    for (const b of this.brushes) {
      if (b.group && this.scene) {
        this.scene.remove(b.group);
        b.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        for (const m of b.mats) m.dispose();
      }
    }
    this.brushes = [];
  }

  // 월드 좌표가 들어 있는 부쉬(없으면 null).
  brushAt(pos) {
    if (!pos) return null;
    for (const b of this.brushes) {
      const dx = pos.x - b.center.x, dz = pos.z - b.center.z;
      const c = Math.cos(-b.rotY), s = Math.sin(-b.rotY);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= b.halfW && Math.abs(lz) <= b.halfD) return b;
    }
    return null;
  }
  unitBrush(unit) { return this.brushAt(typeof getWorldPosition === 'function' ? getWorldPosition(unit) : null); }

  // 부쉬 안에서 공격·스킬을 쓰면 주변 300을 상대 팀에게 2초 드러낸다(Fandom 위키 Brush).
  onActionFromBrush(unit) {
    if (!unit || typeof visionSystem === 'undefined' || !visionSystem) return;
    const pos = getWorldPosition(unit);
    if (!this.brushAt(pos)) return;
    const myTeam = unit.team || (typeof PLAYER_TEAM !== 'undefined' ? PLAYER_TEAM : 'BLUE');
    const enemy = myTeam === 'RED' ? 'BLUE' : 'RED';
    visionSystem.grantVision(pos, BRUSH_CONFIG.revealOnActionRadiusLol, BRUSH_CONFIG.revealOnActionSec, enemy, { revealsBrush: true });
  }

  // 화면: 내 챔피언이 들어가 있는 부쉬는 반투명.
  update(controller) {
    const mine = controller && controller.root ? this.brushAt(controller.root.position) : null;
    for (const b of this.brushes) {
      const target = b === mine ? BRUSH_CONFIG.insideOpacity : 1;
      if (b.mats[0] && Math.abs(b.mats[0].opacity - target) > 1e-3) b.mats[0].opacity = target;
    }
  }
}
