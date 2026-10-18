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

   배치: 칼바람 나락 맵이면 원작 6곳(BRUSH_CONFIG.howlingAbyssLayout), 맵이 없으면 연습장 2곳. 설정 패널의
   "부쉬 설치 모드(F8)"로 클릭한 자리에 더 놓을 수 있다. 위치·크기는 원작 맵 데이터를 받지 못해 근사값.
   ============================================================ */
const BRUSH_CONFIG = {
  defaultSizeLol: { width: 450, depth: 300 },
  revealOnActionRadiusLol: 300, // Fandom 위키 Brush
  revealOnActionSec: 2,         // Fandom 위키 Brush
  insideOpacity: 0.35,          // 내 챔피언이 들어가 있는 부쉬는 반투명하게(원작 화면처럼 안이 보이게)
  // 맵 없는 연습장 배치
  defaultLayout: [
    { x: -9, z: 2, rotY: 0 },
    { x: 9, z: 2, rotY: 0 },
  ],
  // 칼바람 나락 원작 부쉬 6곳(PC 위키 Brush: 다리 왼쪽 2곳·가운데 오른쪽 1곳·양 진영 바깥~안쪽 포탑 사이 1곳씩 = 5곳,
  // 12.23 패치: 다리 가운데 아래쪽 1곳 추가 + 포탑 사이 부쉬 확대). 이 맵은 다리가 z축(파랑 z<0 → 빨강 z>0)으로 곧게
  // 뻗어 있어서 "왼쪽/위"를 -x(side -1), "오른쪽/아래"를 +x(side +1)로 옮겼다. z는 맵을 줄이기 전 단위
  // (HA_MAP_CONFIG 기준, 넥서스 ±94.5·포탑 ±66)로 적고 맵 배율(howlingAbyssMap.scale)을 곱한다. x는 다리 가장자리에
  // 붙인다(부쉬가 다리 밖으로 나가지 않게). 원작 맵 좌표 데이터(CommunityDragon)를 받지 못해 위치·크기는 서술을 따른
  // 근사값이다 - 값만 고치면 된다(크기는 LoL 단위). 가운데 부쉬는 연습용 허수아비 줄(z=-6, x=0·±4)을 덮지 않게 놓았다
  // (덮으면 허수아비가 부쉬에 숨어 지정·시험이 안 된다). 포탑 사이 부쉬(betweenTurrets)는 원작 포탑 좌표
  // (howling_abyss.js HA_STRUCTURES_LOL)의 외곽 포탑과 억제기 포탑 한가운데에 놓는다(20차).
  howlingAbyssLayout: [
    { side: -1, z: -17, widthLol: 450, depthLol: 900 },   // 다리 가운데 왼쪽(위) - 파랑 쪽
    { side: -1, z: 17, widthLol: 450, depthLol: 900 },    // 다리 가운데 왼쪽(위) - 빨강 쪽
    { side: 1, z: 4.5, widthLol: 450, depthLol: 900 },    // 다리 가운데 오른쪽(아래) - 원래 1곳
    { side: 1, z: -16, widthLol: 450, depthLol: 700 },    // 다리 가운데 아래쪽 - 12.23 추가
    { side: 1, betweenTurrets: 'BLUE', widthLol: 450, depthLol: 1100 },  // 파랑 진영 외곽~억제기 포탑 사이(12.23 확대)
    { side: -1, betweenTurrets: 'RED', widthLol: 450, depthLol: 1100 },  // 빨강 진영 외곽~억제기 포탑 사이(12.23 확대)
  ],
};

// 칼바람 나락 배치 항목 → 월드 좌표(다리 가장자리에서 0.3 안쪽, z는 맵 배율 적용).
function howlingAbyssBrushPlacement(b, map) {
  const halfW = lolRangeToWorld(b.widthLol) / 2;
  const z = b.betweenTurrets && typeof haTurretGapZ === 'function' ? haTurretGapZ(b.betweenTurrets) : b.z * (map.scale || 1);
  return { x: b.side * (map.laneMaxX - halfW - 0.3), z, widthLol: b.widthLol, depthLol: b.depthLol };
}

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
      // 풀 덤불: 부쉬 안을 고르게 채우는 원뿔 묶음(위치는 부쉬마다 고정 - id로 만든 의사 난수).
      // 원뿔 수백 개를 메시 하나(InstancedMesh)로 그린다 - 따로 그리면 부쉬 6곳에 드로콜이 수천 번 늘어 느려진다.
      const mat = this._material().clone();
      const n = Math.min(420, Math.max(16, Math.round((w * d) / 0.12))); // 부쉬로 읽히도록 촘촘하게
      let seed = brush.id * 9301 + 49297;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), mat, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), at = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const h = 0.6 + rnd() * 0.5, r = 0.18 + rnd() * 0.14;
        at.set((rnd() - 0.5) * w * 0.95, h / 2, (rnd() - 0.5) * d * 0.95);
        q.setFromAxisAngle(up, rnd() * Math.PI);
        blades.setMatrixAt(i, m4.compose(at, q, sc.set(r, h, r)));
      }
      blades.instanceMatrix.needsUpdate = true;
      group.add(blades);
      group.position.copy(brush.center);
      group.rotation.y = rotY;
      this.scene.add(group);
      brush.group = group; brush.mats = [mat, baseMat];
    }
    this.brushes.push(brush);
    return brush;
  }

  // 칼바람 나락 맵이 있으면 원작 6곳, 없으면 연습장 2곳.
  addDefaultLayout() {
    const onMap = typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.group;
    if (!onMap) { for (const b of BRUSH_CONFIG.defaultLayout) this.addBrush(b); return; }
    for (const b of BRUSH_CONFIG.howlingAbyssLayout) this.addBrush(howlingAbyssBrushPlacement(b, howlingAbyssMap));
  }

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
