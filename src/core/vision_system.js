/* ============================================================
   VISION SYSTEM (시야 시스템 / 전장의 안개)
   ------------------------------------------------------------
   실제 LoL의 핵심 규칙 "시야 밖의 적은 보이지 않는다"를 재현하는
   범용 시스템이다. 플레이어 챔피언이 지속적인 시야 공급원이고, 스킬이
   (애쉬 E/R처럼) 임시 시야 공급원을 추가로 등록할 수 있다. 매 프레임
   모든 적 유닛(더미/미니언/포탑/억제기/넥서스 - getAllEnemyUnits()가
   반환하는 전부)이 "어떤 공급원이든 범위 안에 있는가"만 판정해서
   보이거나(mesh/라벨 표시) 안개에 가려진다(숨김).

   튜닝 포인트: 아래 VISION_CONFIG 객체 하나에 모든 수치가 모여있다.
   실제 인게임 수치에 더 가깝게 맞추고 싶으면 이 객체 값만 바꾸면
   되고, 다른 코드(VisionSystem 클래스 자체나 각 챔피언 파일)는 전혀
   건드릴 필요가 없다 - 이 프로젝트 전반의 "데이터와 로직을 분리한다"
   원칙을 그대로 따른다.

   범위상 생략한 부분(수치/기능을 지어내지 않고 명시적으로 생략 - 이
   프로젝트의 기존 원칙 그대로):
   - 덤불(Brush)에 의한 근접 은신은 구현하지 않는다(이 맵에 덤불
     오브젝트/판정 자체가 없음).
   - 벽에 의한 시야 차단(라인오브사이트)은 구현하지 않는다 - 순수
     원형(반경) 판정만 사용한다. 실제 LoL도 평지에서는 대부분 원형에
     가깝게 동작하므로, 이 데모(단일 라인/사거리 연습용)에는 충분한
     근사다.
   - 와드(제어/일반 와드) 설치 기능은 없다 - 이 데모는 아이템/소환사
     주문 시스템 자체가 없어 와드를 살 방법이 없다(다른 챔피언들의
     아이템 생략과 동일한 원칙). grantVision()은 챔피언 스킬(애쉬 E/R
     등)이 임시 시야를 등록하는 범용 진입점이라, 나중에 와드 같은
     개념을 추가하고 싶다면 이 함수를 그대로 재사용하면 된다.
   - 팀 단위 공유 시야는 없다 - 이 데모는 플레이어 챔피언 하나만 조작
     하는 싱글플레이 구조라(다른 시스템들과 동일한 전제) "내 시야"가
     곧 "우리 팀 시야"다.
   ============================================================ */
const VISION_CONFIG = {
  // 챔피언 기본 시야 반경(LoL 원본 단위). 실제 게임은 챔피언마다 약간
  // 다르지만(대략 1200 전후가 표준) 이 데모는 조작 중인 챔피언 하나
  // 기준으로 공용 기본값 하나를 쓴다. 특정 챔피언만 다르게 주고 싶으면
  // championSightOverride에 championId: 값을 추가하면 된다(다른 코드는
  // 건드릴 필요 없음).
  championSightRange: 1200,
  championSightOverride: {
    // 예시: ashe: 1200,
  },
  // 안개 밖(미시야) 적 표시 방식.
  //  - 'hide': 완전히 숨김(실제 LoL과 가장 가까움, 기본값)
  //  - 'dim' : 투명도만 낮춰서 흐리게(위치를 계속 참고하고 싶은
  //            연습/디버그 용도 - 켜고 싶으면 이 값만 바꾸면 됨)
  fogMode: 'hide',
  dimOpacity: 0.12,
  // 시야 판정과 완전히 별개인 "순수 시각 효과" 설정 - 바닥에 그리는
  // 안개 오버레이. 끄고 싶으면 enabled:false 하나만 바꾸면 된다.
  fogOverlay: {
    enabled: true,
    textureSize: 256, // 해상도(낮을수록 가볍고 경계가 부드럽다)
    darkness: 0.75, // 미시야 지역의 불투명도(0=투명, 1=완전 검정)
    edgeSoftness: 0.4, // 시야 경계가 부드럽게 퍼지는 비율(0=칼같은 경계, 1=중심부터 서서히)
  },
};

class VisionSystem {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    // 임시 시야 공급원 배열 - {position: THREE.Vector3, lolRadius, expiresAt}.
    // grantVision()으로 추가되고, update()가 매 프레임 만료분을 정리한다.
    this.temporarySources = [];
    this._visibleCache = new Set();
    this._fogCanvas = null; this._fogCtx = null; this._fogTexture = null; this._fogMesh = null;
    this._worldHalf = (typeof groundSize !== 'undefined' ? groundSize : 280) / 2;
    if (VISION_CONFIG.fogOverlay.enabled) this._buildFogOverlay();
  }

  _buildFogOverlay() {
    const size = VISION_CONFIG.fogOverlay.textureSize;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    this._fogCanvas = canvas;
    this._fogCtx = canvas.getContext('2d');
    this._fogTexture = new THREE.CanvasTexture(canvas);
    const half = this._worldHalf;
    const geo = new THREE.PlaneGeometry(half * 2, half * 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: this._fogTexture, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this._fogMesh = new THREE.Mesh(geo, mat);
    this._fogMesh.position.y = 0.06; // 바닥/그리드보다 살짝 위, 캐릭터/소품보다는 아래
    this._fogMesh.renderOrder = 2;
    this.scene.add(this._fogMesh);
  }

  // 챔피언 스킬(애쉬 E/R 등)이 임시 시야를 등록하는 범용 진입점.
  // position: THREE.Vector3(world), lolRadius: LoL 원본 단위 반경,
  // durationSec: 지속시간(초).
  grantVision(position, lolRadius, durationSec) {
    if (!position || !lolRadius || !durationSec) return;
    this.temporarySources.push({
      position: position.clone(), lolRadius,
      expiresAt: performance.now() + durationSec * 1000,
    });
  }

  // 특정 유닛이 지금 시야 안에 있는지(= 타게팅/클릭/스킬 판정에 노출돼도
  // 되는지) 조회하는 공용 진입점. 시스템이 꺼져 있으면 항상 true(기존
  // 동작 그대로). getAllEnemyUnits()를 매번 다시 돌리지 않고 update()가
  // 매 프레임 갱신해두는 캐시(_visibleCache)를 그대로 읽기만 한다.
  isVisible(unit) {
    if (!this.enabled) return true;
    return this._visibleCache.has(unit);
  }

  setEnabled(v) {
    this.enabled = v;
    if (this._fogMesh) this._fogMesh.visible = v && VISION_CONFIG.fogOverlay.enabled;
    if (!v) this._revealAll();
  }

  _revealAll() {
    for (const u of getAllEnemyUnits()) this._setUnitVisible(u, true);
    this._visibleCache = new Set(getAllEnemyUnits());
  }

  _setUnitVisible(unit, visible) {
    if (!unit) return;
    if (VISION_CONFIG.fogMode === 'dim') {
      this._applyDim(unit, visible);
      return;
    }
    if (unit.mesh) unit.mesh.visible = visible;
    else if (unit.model) unit.model.visible = visible;
    else if (unit.group) unit.group.visible = visible;
    if (unit.labelDiv) unit.labelDiv.style.display = visible ? '' : 'none';
  }

  // dim 모드: mesh를 숨기지 않고 재질 투명도만 낮춘다(위치를 계속 볼 수
  // 있는 디버그/연습용 - 실제 LoL 동작과는 다르다는 점을 분명히 하기
  // 위해 기본값은 'hide'다).
  _applyDim(unit, visible) {
    const root = unit.mesh || unit.model || unit.group;
    if (!root) return;
    if (unit._visionDimApplied === visible) return; // 이미 같은 상태면 재귀적으로 다시 안 깔음
    unit._visionDimApplied = visible;
    root.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m._visionOriginalOpacity == null) { m._visionOriginalOpacity = m.opacity; m._visionOriginalTransparent = m.transparent; }
        m.transparent = true;
        m.opacity = visible ? m._visionOriginalOpacity : VISION_CONFIG.dimOpacity;
      }
    });
    if (unit.labelDiv) unit.labelDiv.style.opacity = visible ? '1' : '0.25';
  }

  update(controller, dt) {
    if (!this.enabled) return;
    const now = performance.now();
    if (this.temporarySources.length) {
      this.temporarySources = this.temporarySources.filter((s) => s.expiresAt > now);
    }

    const sources = [];
    if (controller && controller.root && controller.hp > 0 && controller.state !== STATE.DEAD) {
      const override = VISION_CONFIG.championSightOverride[controller.championId];
      const range = override != null ? override : VISION_CONFIG.championSightRange;
      sources.push({ position: controller.root.position, lolRadius: range });
    }
    for (const s of this.temporarySources) sources.push(s);

    // 조작 중인 챔피언이 없거나(초기 로딩 전) 죽어서 시야 공급원이 하나도
    // 없으면, 맵 전체를 안개로 덮는 대신 전부 보이게 한다 - 전투 연습
    // 도구로서 "아직 아무도 안 보인다"보다 "일단 다 보인다"가 더 자연스러운
    // 기본 상태다(실제 LoL 규칙과는 다르지만, 조작할 챔피언이 아예 없는
    // 상태는 실제 게임에 없는 상황이라 임의로 하나 정한 것일 뿐이다).
    if (!sources.length) {
      this._revealAll();
      if (this._fogCtx) { this._fogCtx.clearRect(0, 0, this._fogCanvas.width, this._fogCanvas.height); this._fogTexture.needsUpdate = true; }
      return;
    }

    const nowVisible = new Set();
    for (const u of getAllEnemyUnits()) {
      let visible = false;
      for (const s of sources) {
        if (isInCircle(u, s.position, lolRangeToWorld(s.lolRadius))) { visible = true; break; }
      }
      if (visible) nowVisible.add(u);
    }
    // 변경된 유닛만 실제로 표시 상태를 건드린다(매 프레임 불필요하게
    // mesh.visible/DOM style을 다시 쓰지 않도록).
    for (const u of getAllEnemyUnits()) {
      const was = this._visibleCache.has(u);
      const is = nowVisible.has(u);
      if (was !== is) this._setUnitVisible(u, is);
    }
    this._visibleCache = nowVisible;

    if (this._fogCtx) this._renderFogTexture(sources);
  }

  _renderFogTexture(sources) {
    const ctx = this._fogCtx;
    const size = this._fogCanvas.width;
    const cfg = VISION_CONFIG.fogOverlay;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${cfg.darkness})`;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'destination-out';
    const half = this._worldHalf;
    for (const s of sources) {
      const worldR = lolRangeToWorld(s.lolRadius);
      const cx = ((s.position.x + half) / (half * 2)) * size;
      const cy = ((s.position.z + half) / (half * 2)) * size;
      const r = Math.max(1, (worldR / (half * 2)) * size);
      const grad = ctx.createRadialGradient(cx, cy, r * (1 - cfg.edgeSoftness), cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this._fogTexture.needsUpdate = true;
  }
}
