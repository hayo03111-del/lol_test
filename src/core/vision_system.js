/* ============================================================
   VISION SYSTEM (팀 시야 / 전장의 안개)
   ------------------------------------------------------------
   원작 규칙(PC 위키 Sight)을 팀 단위로 옮긴다. 파랑(플레이어 팀)·빨강(적 팀)이 각자 시야 공급원을 갖고,
   상대 팀 유닛은 그 팀의 공급원 반경 안에 있을 때만 보인다.
   - 시야 반경(LoL 단위, PC 위키 Sight): 챔피언·펫·슈퍼 미니언·포탑 1350, 근거리·원거리·공성 미니언 1200, 와드 900.
   - 파랑 공급원: 플레이어 챔피언, 아군 더미(챔피언), 파랑 미니언, 파랑 포탑, 와드·스킬 임시 시야(grantVision).
   - 빨강 공급원: 적 허수아비(챔피언), 빨강 미니언, 빨강 포탑, 빨강 임시 시야.
   - 구조물(포탑·억제기·넥서스)은 원작처럼 항상 보인다(전장의 안개에 가려지지 않음).
   - 드러내기(True Sight, revealUnit): 가렌 R처럼 대상을 시야와 무관하게 잠시 드러낸다.
   - "적 팀 시야로 보기"(setViewTeam): 화면을 빨강 팀이 보는 그대로(안개·보이는 유닛) 바꿔 확인할 수 있다.
     타게팅·스킬 판정(isVisible)은 화면 전환과 무관하게 항상 플레이어 팀 시야를 쓴다.
   - 스킬 예고 표시(skill_telegraph_system.js)는 isPointVisibleTo()로 "그 지점이 상대 팀 시야 안인가"를 묻는다.

   - 부쉬(brush_system.js): 부쉬 안의 대상은 같은 부쉬 안의 공급원이나 부쉬를 드러내는 스킬 시야로만 보인다.

   범위상 생략(지어내지 않고 명시적으로 생략):
   - 지형에 의한 시야 차단: 칼바람 단일 통로라 원형 판정만 쓴다.
   - 은신: 은신 스킬·아이템이 아직 없다.
   ============================================================ */
const VISION_CONFIG = {
  // PC 위키 Sight: 챔피언 1350(예전 1200은 근거 없던 값), 미니언 1200, 슈퍼 미니언·포탑 1350.
  championSightRange: 1350,
  championSightOverride: {},
  minionSightRange: 1200,
  superMinionSightRange: 1350,
  turretSightRange: 1350,
  // 안개 밖(미시야) 적 표시 방식: 'hide'(원작과 같음) / 'dim'(연습용 반투명)
  fogMode: 'hide',
  dimOpacity: 0.12,
  fogOverlay: {
    enabled: true,
    textureSize: 256,
    darkness: 0.75,
    edgeSoftness: 0.4,
  },
};
const VISION_TEAM_BLUE = (typeof PLAYER_TEAM !== 'undefined') ? PLAYER_TEAM : 'BLUE';
const VISION_TEAM_RED = (typeof ENEMY_TEAM !== 'undefined') ? ENEMY_TEAM : 'RED';

class VisionSystem {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    // 임시 시야 공급원 배열 - {position: THREE.Vector3, lolRadius, expiresAt}.
    // grantVision()으로 추가되고, update()가 매 프레임 만료분을 정리한다.
    this.temporarySources = [];
    this._visibleCache = new Set(); // 플레이어 팀이 보고 있는 상대 유닛(타게팅용)
    this._visibleTo = { [VISION_TEAM_BLUE]: new Set(), [VISION_TEAM_RED]: new Set() };
    this._teamSources = { [VISION_TEAM_BLUE]: [], [VISION_TEAM_RED]: [] };
    this.reveals = []; // {unit, team, expiresAt} - 드러내기(True Sight)
    this.viewTeam = VISION_TEAM_BLUE; // 화면을 어느 팀 시야로 그릴지
    this._renderHidden = new Set(); // 화면에서 시야 때문에 숨긴 유닛
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
  // opts.revealsBrush: 지역을 드러내는 스킬 시야(애쉬 E·R 등)는 부쉬 안도 보인다(PC 위키 Brush). 와드처럼 위치에
  // 놓인 공급원은 기본값(false) - 부쉬 안에 놓였을 때만 그 부쉬 안을 본다.
  grantVision(position, lolRadius, durationSec, team = VISION_TEAM_BLUE, opts = {}) {
    if (!position || !lolRadius || !durationSec) return;
    this.temporarySources.push({
      position: position.clone(), lolRadius, team, revealsBrush: !!(opts && opts.revealsBrush),
      expiresAt: performance.now() + durationSec * 1000,
    });
  }

  // 부쉬 규칙(PC 위키 Brush): 부쉬 안의 대상은 같은 부쉬 안의 공급원이나 부쉬를 드러내는 시야로만 보인다.
  _brushAt(pos) { return (typeof brushSystem !== 'undefined' && brushSystem && pos) ? brushSystem.brushAt(pos) : null; }
  _sourceSees(s, pos, targetBrush) {
    if (!targetBrush || s.revealsBrush) return true;
    if (s._brush === undefined) s._brush = this._brushAt(s.position);
    return s._brush === targetBrush;
  }

  // 드러내기(True Sight): 시야와 무관하게 unit을 team에게 durationSec 동안 보이게 한다(가렌 R 등).
  revealUnit(unit, durationSec, team = VISION_TEAM_BLUE) {
    if (!unit || !durationSec) return;
    this.reveals.push({ unit, team, expiresAt: performance.now() + durationSec * 1000 });
  }

  // 화면을 그릴 팀(파랑=플레이어 팀 / 빨강=적 팀). 판정(isVisible)에는 영향 없음.
  setViewTeam(team) {
    this.viewTeam = team === VISION_TEAM_RED ? VISION_TEAM_RED : VISION_TEAM_BLUE;
    for (const u of this._renderHidden) this._setUnitVisible(u, true);
    this._renderHidden.clear();
  }

  // team의 시야 공급원 반경 안에 pos가 있는가. insetLol만큼 안쪽이어야 참(예: 모데카이저 E - 시야 안 300).
  isPointVisibleTo(team, pos, insetLol = 0) {
    if (!this.enabled || !pos) return true;
    const brush = this._brushAt(pos);
    for (const s of this._teamSources[team] || []) {
      const r = lolRangeToWorld(Math.max(0, s.lolRadius - insetLol));
      const dx = pos.x - s.position.x, dz = pos.z - s.position.z;
      if (dx * dx + dz * dz <= r * r && this._sourceSees(s, pos, brush)) return true;
    }
    return false;
  }

  // unit이 team에게 보이는가(같은 팀·구조물은 항상 보임).
  isVisibleTo(team, unit) {
    if (!this.enabled || !unit) return true;
    if (unit.isStructure) return true;
    const ut = unit.team || (team === VISION_TEAM_BLUE ? VISION_TEAM_RED : VISION_TEAM_BLUE);
    if (ut === team) return true;
    return this._visibleTo[team] ? this._visibleTo[team].has(unit) : true;
  }

  // 특정 유닛이 지금 시야 안에 있는지(= 타게팅/클릭/스킬 판정에 노출돼도
  // 되는지) 조회하는 공용 진입점. 시스템이 꺼져 있으면 항상 true(기존
  // 동작 그대로). getAllEnemyUnits()를 매번 다시 돌리지 않고 update()가
  // 매 프레임 갱신해두는 캐시(_visibleCache)를 그대로 읽기만 한다.
  isVisible(unit) {
    if (!this.enabled) return true;
    if (unit && unit.isStructure) return true; // 구조물은 항상 보인다
    return this._visibleCache.has(unit);
  }

  setEnabled(v) {
    this.enabled = v;
    if (this._fogMesh) this._fogMesh.visible = v && VISION_CONFIG.fogOverlay.enabled;
    if (!v) this._revealAll();
  }

  _revealAll() {
    for (const u of getAllEnemyUnits(true)) this._setUnitVisible(u, true);
    for (const u of this._renderHidden) this._setUnitVisible(u, true);
    this._renderHidden.clear();
    this._visibleCache = new Set(getAllEnemyUnits(true));
  }

  // 플레이어 팀 유닛(빨강 팀 시야로 볼 때 가려질 수 있는 쪽).
  _blueUnits(controller) {
    const out = [];
    if (controller && controller.root) out.push(controller);
    if (typeof placedAllies !== 'undefined') for (const a of placedAllies) if (a && a.hp > 0) out.push(a);
    if (typeof minions !== 'undefined') for (const m of minions) if (m && !m.isDead && m.team === VISION_TEAM_BLUE) out.push(m);
    return out;
  }
  _redUnits() { return getAllEnemyUnits(true); }

  _collectSources(controller) {
    const now = performance.now();
    const blue = [], red = [];
    const champR = (id) => { const o = VISION_CONFIG.championSightOverride[id]; return o != null ? o : VISION_CONFIG.championSightRange; };
    if (controller && controller.root && controller.hp > 0 && controller.state !== STATE.DEAD) blue.push({ position: controller.root.position, lolRadius: champR(controller.championId) });
    if (typeof placedAllies !== 'undefined') for (const a of placedAllies) if (a && a.hp > 0) blue.push({ position: getWorldPosition(a), lolRadius: VISION_CONFIG.championSightRange });
    if (typeof dummy !== 'undefined' && dummy && dummy.hp > 0 && !dummy.destroyed) red.push({ position: getWorldPosition(dummy), lolRadius: VISION_CONFIG.championSightRange });
    if (typeof enemyBots !== 'undefined') for (const b of enemyBots) if (b && b.root && b.hp > 0 && b.state !== STATE.DEAD) (b.team === VISION_TEAM_BLUE ? blue : red).push({ position: b.root.position, lolRadius: champR(b.championId) }); // 95차: 적 챔피언 봇의 시야
    if (typeof placedDummies !== 'undefined') for (const d of placedDummies) if (d && d.hp > 0 && !d.destroyed) red.push({ position: getWorldPosition(d), lolRadius: VISION_CONFIG.championSightRange });
    if (typeof minions !== 'undefined') for (const m of minions) {
      if (!m || m.isDead || !m.mesh) continue;
      const r = (m.type === 'super' || m.minionType === 'super') ? VISION_CONFIG.superMinionSightRange : VISION_CONFIG.minionSightRange;
      (m.team === VISION_TEAM_BLUE ? blue : red).push({ position: m.mesh.position, lolRadius: r });
    }
    if (typeof turrets !== 'undefined') for (const t of turrets) {
      if (!t || t.destroyed || !t.mesh) continue;
      (t.team === VISION_TEAM_BLUE ? blue : red).push({ position: t.mesh.position, lolRadius: VISION_CONFIG.turretSightRange });
    }
    for (const s of this.temporarySources) if (s.expiresAt > now) ((s.team || VISION_TEAM_BLUE) === VISION_TEAM_RED ? red : blue).push(s);
    // 와드(ward_system.js): 살아 있고 무력화되지 않은 와드가 시야 900을 준다(부쉬 안에 놓이면 그 부쉬 안만).
    if (typeof wardSystem !== 'undefined' && wardSystem) { blue.push(...wardSystem.visionSources(VISION_TEAM_BLUE)); red.push(...wardSystem.visionSources(VISION_TEAM_RED)); }
    return { [VISION_TEAM_BLUE]: blue, [VISION_TEAM_RED]: red };
  }

  _computeVisible(team, units, sources) {
    const now = performance.now();
    const out = new Set();
    for (const u of units) {
      if (u.isStructure) { out.add(u); continue; }
      let visible = false;
      const up = typeof getWorldPosition === 'function' ? getWorldPosition(u) : null;
      const ub = this._brushAt(up);
      for (const s of sources) { if (isInCircle(u, s.position, lolRangeToWorld(s.lolRadius)) && this._sourceSees(s, up, ub)) { visible = true; break; } }
      if (!visible) visible = this.reveals.some((r) => r.unit === u && r.team === team && r.expiresAt > now);
      if (visible) out.add(u);
    }
    return out;
  }

  _setUnitVisible(unit, visible) {
    if (!unit) return;
    if (VISION_CONFIG.fogMode === 'dim') {
      this._applyDim(unit, visible);
      return;
    }
    // 플레이어 챔피언은 모델 가시성(마스터 이 Q 등이 쓰는 model.visible)을 건드리지 않도록 root로 숨긴다.
    const root = unit.root && unit.root.isObject3D ? unit.root : (unit.mesh || unit.model || unit.group);
    if (root) {
      root.visible = visible;
      // CSS2D 이름표는 부모가 숨겨져도 따로 그려지므로 직접 숨긴다.
      if (typeof root.traverse === 'function') root.traverse((o) => { if (o.isCSS2DObject) { o.visible = visible; if (o.element) o.element.style.display = visible ? '' : 'none'; } });
    }
    if (unit.labelDiv) unit.labelDiv.style.display = visible ? '' : 'none';
    if (unit.healthBarLabelDiv) unit.healthBarLabelDiv.style.display = visible ? '' : 'none';
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
    if (this.temporarySources.length) this.temporarySources = this.temporarySources.filter((s) => s.expiresAt > now);
    if (this.reveals.length) this.reveals = this.reveals.filter((r) => r.expiresAt > now && r.unit && r.unit.hp > 0);
    for (const s of this.temporarySources) s._brush = undefined; // 부쉬가 새로 놓였을 수 있다
    this._teamSources = this._collectSources(controller);
    const blueSources = this._teamSources[VISION_TEAM_BLUE];

    // 조작 중인 챔피언이 없거나 죽어서 플레이어 팀 공급원이 하나도 없으면(초기 로딩 등) 전부 보이게 한다 -
    // 연습 도구로서 "일단 다 보인다"가 더 자연스러운 기본 상태다(실제 게임엔 없는 상황).
    if (!blueSources.length && this.viewTeam === VISION_TEAM_BLUE) {
      this._revealAll();
      this._visibleTo[VISION_TEAM_BLUE] = new Set(getAllEnemyUnits(true));
      if (this._fogCtx) { this._fogCtx.clearRect(0, 0, this._fogCanvas.width, this._fogCanvas.height); this._fogTexture.needsUpdate = true; }
      return;
    }

    const redUnits = this._redUnits(), blueUnits = this._blueUnits(controller);
    this._visibleTo[VISION_TEAM_BLUE] = this._computeVisible(VISION_TEAM_BLUE, redUnits, blueSources);
    this._visibleTo[VISION_TEAM_RED] = this._computeVisible(VISION_TEAM_RED, blueUnits, this._teamSources[VISION_TEAM_RED]);
    this._visibleCache = this._visibleTo[VISION_TEAM_BLUE];

    // 화면 표시: 보는 팀의 상대 유닛 중 그 팀에게 안 보이는 것만 숨긴다(바뀐 유닛만 건드림).
    const viewer = this.viewTeam;
    const others = viewer === VISION_TEAM_BLUE ? redUnits : blueUnits;
    const seen = this._visibleTo[viewer];
    const nowHidden = new Set();
    for (const u of others) if (!seen.has(u)) nowHidden.add(u);
    for (const u of this._renderHidden) if (!nowHidden.has(u)) this._setUnitVisible(u, true);
    for (const u of nowHidden) if (!this._renderHidden.has(u)) this._setUnitVisible(u, false);
    this._renderHidden = nowHidden;
    // 보는 팀 쪽 유닛은 항상 보인다(빨강 시점에서 돌아왔을 때 등).
    if (this._fogCtx) this._renderFogTexture(this._teamSources[viewer]);
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
