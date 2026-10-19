/* ============================================================
   SKILL AIM SYSTEM (스킬 조준 + 사거리 표시)
   ------------------------------------------------------------
   원작의 세 가지 시전 방식:
   - 일반 시전(normal): 키를 누르면 조준 표시가 뜨고, 좌클릭으로 시전한다. 우클릭·Esc는 조준을 취소한다.
   - 표시기 사용 빠른 시전(indicator): 키를 누르고 있는 동안 조준 표시, 떼면 그 자리로 시전한다.
   - 빠른 시전(quick): 키를 누르는 즉시 커서 자리로 시전한다(이 프로젝트의 예전 방식).
   대상·방향이 필요 없는 스킬(자기 강화·자기 중심 범위)은 어느 방식이든 즉시 시전한다.
   대상 지정 스킬은 시전 순간 커서 아래의 적(아군 대상 스킬은 아군)을 대상으로 잡는다.

   조준 모양·폭·반경은 "그 스킬의 실제 판정 코드가 쓰는 값"을 그대로 쓴다(챔피언 파일·controller_casting.js의
   findEnemiesInLine / findFirstInLine / findEnemiesInRadius 인자와 사거리 처리). 지점 스킬은 판정 코드처럼
   사거리 밖 커서를 최대 사거리로 당겨서 그린다. 표시만 할 뿐 판정은 바꾸지 않는다.
   ============================================================ */
const CAST_MODES = ['normal', 'indicator', 'quick'];
const SKILL_AIM_STYLE = {
  fill: 0x5fc8ff, fillOpacity: 0.32,     // 조준 영역(밝은 하늘색 반투명 - 어두운 맵 바닥에서도 보이게)
  edge: 0xc4ecff, edgeOpacity: 0.85,     // 테두리
  range: 0x9fdcff, rangeOpacity: 0.55,   // 사거리 링
  bad: 0xff5a5a,                         // 대상이 사거리 밖
  ringLol: 8,                            // 링 두께(LoL 단위 - 화면 표시용)
};
// 스킬별 조준 정의. 값은 숫자(LoL 단위), 레벨별 배열, 또는 (c, d, lvl) => 값 함수(d = CHAMPION_DATA[챔피언][슬롯]).
// type: instant(즉시) | line(고정 길이 직선) | lineToPoint(커서까지, 사거리로 당김) | circleAt(지점 원) |
//       rectAtPoint(지점에서 시전자 쪽으로 직사각형) | cone | trapezoid | dash(고정 거리 돌진) | blink(지점 이동) |
//       wall(야스오 W) | unit(적 대상) | ally(아군 대상, 없으면 자기 시전) | selfAim(자기 중심 원 + 방향) | charge(바루스 Q)
// instantIf(c): 재시전 등으로 지금은 조준 없이 바로 나가는 상태.
const SKILL_AIM = {
  garen: { Q: { type: 'instant' }, W: { type: 'instant' }, E: { type: 'instant' }, R: { type: 'unit', range: (c, d) => d.range } },
  darius: {
    Q: { type: 'instant' }, W: { type: 'instant' },
    E: { type: 'cone', range: (c, d) => d.range, angleDeg: (c, d) => d.coneAngleDeg },             // findEnemiesInRadius(cone)
    R: { type: 'unit', range: (c, d) => d.range },
  },
  sett: {
    Q: { type: 'instant' },
    W: { type: 'trapezoid', range: (c, d) => d.range, centerHalfWidth: (c, d) => d.centerHalfWidth, startHalfWidth: (c, d) => d.startHalfWidth ?? d.centerHalfWidth, endHalfWidth: (c, d) => d.endHalfWidth },
    E: { type: 'selfAim', radius: (c, d) => d.range },                                              // 반경 안 적을 커서 방향 기준 좌우로 나눔
    R: { type: 'unit', range: (c, d) => d.range },
  },
  renekton: {
    Q: { type: 'instant' }, W: { type: 'instant' }, R: { type: 'instant' },
    E: { type: 'dash', range: (c, d) => d.range, width: (c, d) => 2 * ((d.halfWidth || 45) + (c._renekton && c._renekton.rActive ? (d.rHalfWidthBonus || 0) : 0)) }, // _renektonFindLineHits 반폭(데이터)
  },
  yasuo: {
    Q: { type: 'line', range: (c, d) => (yasuoAimTornado(c) ? d.tornadoRange : d.range), width: (c, d) => (yasuoAimTornado(c) ? d.tornadoWidth : d.width),
      instantIf: (c) => c.currentActionKey === 'yasuoE' && c.currentPhase === 'ACTIVE' }, // 45차: E 돌진 중 Q(EQ)는 조준 없이 바로 - 돌진 끝에 주변 원형
    W: { type: 'wall', width: (c, d, lvl) => skillVal(d.width, lvl) },                              // 앞쪽 width*0.75 지점, 길이 width
    E: { type: 'unit', range: (c, d) => d.range },
    R: { type: 'unit', range: (c, d) => d.range, approach: false },                                  // 공중에 뜬 적(걸어가서 시전하지 않음 - 띄운 적이 사거리 안에 있을 때만)
  },
  yone: {
    Q: { type: 'line', range: (c, d) => (yoneAimEmpowered(c, d) ? d.missileRange : d.range), width: (c, d) => d.width,
      segments: (c, d) => (yoneAimEmpowered(c, d) ? [{ len: d.dashRange, width: d.dashAoEWidth }, { len: d.missileRange - d.dashRange, width: d.missileWidth }] : null) },
    W: { type: 'cone', range: (c, d) => d.range, angleDeg: (c, d) => d.angleDeg || 80 },
    E: { type: 'dash', range: (c, d) => d.range, instantIf: (c) => !!(c._yone && c._yone.eSpirit) },
    R: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
  },
  nilah: {
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.impactRadius },                 // 45차: 원작처럼 고정 길이 600 직선(폭 impactRadius)
    W: { type: 'instant' }, R: { type: 'instant' },
    E: { type: 'unit', range: (c, d) => d.range },
  },
  mordekaiser: {
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width || 150 },                // findEnemiesInLine
    W: { type: 'instant' },
    E: { type: 'rectAtPoint', range: (c, d) => d.range, length: (c, d) => d.areaLength || 800, width: (c, d) => d.areaWidth || 200 },
    R: { type: 'unit', range: (c, d) => d.range },
  },
  nautilus: {
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    W: { type: 'instant' }, E: { type: 'instant' },
    R: { type: 'unit', range: (c, d) => d.range },
  },
  masteryi: { Q: { type: 'unit', range: (c, d) => d.range }, W: { type: 'instant' }, E: { type: 'instant' }, R: { type: 'instant' } },
  lux: { // 47차 - 범위·폭은 데이터(함수로 읽는다 - 사용자 확장은 숫자를 넣어 표시가 데이터와 따로 놀았다)
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    W: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    E: { type: 'circleAt', range: (c, d) => d.range, radius: (c, d) => d.radius, path: true, instantIf: (c) => !!(c._lux && c._lux.zone) }, // 재사용은 바로 터뜨림
    R: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
  },
  rammus: { // 38차
    Q: { type: 'instant' }, W: { type: 'instant' },
    E: { type: 'unit', range: (c, d) => d.range },
    R: { type: 'circleAt', range: (c) => (typeof c._rammusRRangeLol === 'function' ? c._rammusRRangeLol() : 800), radius: (c, d) => d.radius },
  },
  chogath: {
    Q: { type: 'circleAt', range: (c, d) => d.range, radius: (c, d) => d.radius },
    W: { type: 'cone', range: (c, d) => d.range, angleDeg: (c, d) => d.coneAngleDeg },
    E: { type: 'instant' },
    R: { type: 'unit', range: (c, d) => d.rangeBase + d.rangePerStack * ((c._chogath && c._chogath.predationStacks) || 0) },
  },
  leesin: {
    Q: { type: 'line', range: (c, d) => d.range1, width: (c, d) => d.width,                            // 음파 폭(데이터) - 투사체 line 판정과 같다
      instantIf: (c) => !!(c._leesin && c._leesin.qMarkTarget && performance.now() < c._leesin.qMarkExpiresAt) },
    W: { type: 'ally', range: (c, d) => d.range1, pickLol: 150, instantIf: (c) => !!(c._leesin && performance.now() < c._leesin.wMarkReadyUntil) },
    E: { type: 'instant' },
    R: { type: 'unit', range: (c, d) => d.range },
  },
  vex: {
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width,
      segments: (c, d) => [{ len: d.accelerationDistance, width: d.width }, { len: d.range - d.accelerationDistance, width: d.widthAfterAccel }] },
    W: { type: 'instant' },
    E: { type: 'circleAt', range: (c, d) => d.range, radiusAt: (c, d, lvl, frac) => d.radiusMin + (d.radiusMax - d.radiusMin) * frac }, // 거리에 비례해 커짐
    R: { type: 'line', range: (c, d, lvl) => skillVal(d.range, Math.min(3, lvl)), width: (c, d) => d.width || 260,          // 28차: 방향 스킬샷
      instantIf: (c) => !!(c._vex && !c._vex.dashActive && c._vex.recastTarget && performance.now() < c._vex.recastReadyUntil) },
  },
  ezreal: {
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    W: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    E: { type: 'blink', range: (c, d) => d.range },
    R: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
  },
  ahri: {
    Q: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    W: { type: 'instant' },
    E: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
    R: { type: 'blink', range: (c, d) => d.dashDistance },                                           // 46차: 지정 위치로 돌진(최대 500)
  },
  varus: {
    Q: { type: 'charge', minRange: (c, d) => d.minRange, maxRange: (c, d) => d.maxRange, chargeSec: (c, d) => d.rangeChargeDuration || 1.5, width: (c, d) => d.width },
    W: { type: 'instant' },
    E: { type: 'circleAt', range: (c, d) => d.range, radius: (c, d) => d.radius },
    R: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
  },
  ashe: {
    Q: { type: 'instant' },
    W: { type: 'cone', range: (c, d) => d.range, angleDeg: (c, d, lvl) => skillVal(d.coneAngleDegByLevel, lvl) },
    E: { type: 'circleAt', range: (c, d) => d.range, radius: (c, d) => d.visionRadius, path: true }, // 매가 날아가 시야를 밝히는 자리
    R: { type: 'line', range: (c, d) => d.range, width: (c, d) => d.width },
  },
};
function yasuoAimTornado(c) { return !!(c._yasuo && c._yasuo.qStacks >= 2); }
function yoneAimEmpowered(c, d) { return !!(c._yone && c._yone.qStacks >= (d.maxStacks || 2)); }
// 화면에 그릴 최대 길이(월드) - 글로벌 스킬(애쉬 R 20000, 이즈리얼 R 25000)은 화면 밖까지 그리지 않는다. 판정은 그대로.
const SKILL_AIM_MAX_DRAW_LOL = 5000;

function skillAimSpec(championId, slot) {
  return (SKILL_AIM[championId] && SKILL_AIM[championId][slot]) || null;
}
function skillAimValue(v, c, d, lvl, extra) {
  if (typeof v === 'function') return v(c, d, lvl, extra);
  if (Array.isArray(v)) return skillVal(v, lvl);
  return v;
}
// 조준이 필요 없는(지금 바로 시전하는) 스킬인가.
function skillAimIsInstant(c, slot) {
  const spec = c && skillAimSpec(c.championId, slot);
  if (!spec || spec.type === 'instant') return true;
  return !!(spec.instantIf && spec.instantIf(c));
}
// 조준 기하(월드 좌표, 순수 계산 - 단위 테스트 대상). point = 커서 지면 좌표.
function computeSkillAim(c, slot, point) {
  const spec = skillAimSpec(c.championId, slot);
  if (!spec) return null;
  const cd = c._champData ? c._champData() : null;
  const d = (cd && cd[slot]) || {};
  const lvl = Math.max(1, (c.skillLevels && c.skillLevels[slot]) || 1);
  const V = (k, extra) => skillAimValue(spec[k], c, d, lvl, extra);
  const o = c.root.position;
  const to = point ? new THREE.Vector3(point.x - o.x, 0, point.z - o.z) : new THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion);
  const rawDist = Math.hypot(to.x, to.z);
  const dir = rawDist > 1e-6 ? to.clone().multiplyScalar(1 / rawDist) : new THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion).setY(0).normalize();
  const W = (lol) => lolRangeToWorld(lol || 0);
  const aim = { type: spec.type, origin: new THREE.Vector3(o.x, 0, o.z), dir, rangeWorld: 0 };
  switch (spec.type) {
    case 'line': {
      aim.rangeWorld = W(V('range'));
      const segs = spec.segments ? V('segments') : null;
      aim.segments = segs ? segs.map((s) => ({ len: W(s.len), width: W(s.width) })) : [{ len: aim.rangeWorld, width: spec.widthWorld != null ? spec.widthWorld : W(V('width')) }];
      break;
    }
    case 'lineToPoint': {
      aim.rangeWorld = W(V('range'));
      aim.segments = [{ len: Math.min(rawDist, aim.rangeWorld), width: W(V('width')) }];
      break;
    }
    case 'charge': {
      const q = c._varus && c._varus.qCharge;
      const frac = q ? Math.max(0, Math.min(1, (performance.now() - q.startedAt) / (V('chargeSec') * 1000))) : 0;
      const lol = V('minRange') + (V('maxRange') - V('minRange')) * frac;
      aim.rangeWorld = W(V('maxRange'));
      aim.charging = !!q; aim.chargeFrac = frac;
      aim.segments = [{ len: W(lol), width: W(V('width')) }];
      aim.arrow = true; // 28차: 충전할수록 늘어나는 사거리 끝에 화살촉
      break;
    }
    case 'circleAt': case 'blink': {
      aim.rangeWorld = W(V('range'));
      const dist = Math.min(rawDist, aim.rangeWorld);
      aim.center = aim.origin.clone().addScaledVector(dir, dist);
      const frac = aim.rangeWorld > 0 ? dist / aim.rangeWorld : 1;
      aim.radiusWorld = spec.type === 'blink' ? (c.collisionRadius || W(65)) : W(spec.radiusAt ? V('radiusAt', frac) : V('radius'));
      aim.path = !!spec.path || spec.type === 'blink';
      break;
    }
    case 'rectAtPoint': {
      aim.rangeWorld = W(V('range'));
      const dist = Math.min(rawDist, aim.rangeWorld), len = W(V('length'));
      aim.segments = [{ start: dist - len, len, width: W(V('width')) }];                      // 지정 지점에서 시전자 쪽으로 length
      break;
    }
    case 'cone': aim.rangeWorld = W(V('range')); aim.angleDeg = V('angleDeg'); break;
    case 'trapezoid': aim.rangeWorld = W(V('range')); aim.centerHalfWidth = W(V('centerHalfWidth')); aim.startHalfWidth = W(V('startHalfWidth')); aim.endHalfWidth = W(V('endHalfWidth')); break;
    case 'dash': {
      aim.rangeWorld = W(V('range'));
      aim.segments = [{ len: aim.rangeWorld, width: spec.width ? W(V('width')) : 2 * (c.collisionRadius || W(65)) }]; // 판정 폭이 없는 돌진은 몸 폭
      aim.arrow = true;
      break;
    }
    case 'wall': {
      const w = W(V('width'));
      aim.rangeWorld = w * 0.75 + 0.45;
      aim.wall = { dist: w * 0.75, length: w, thickness: 0.9 };                               // projectile_system.js 막기 판정과 같음
      break;
    }
    case 'unit': case 'ally': aim.rangeWorld = W(V('range')); aim.pickWorld = spec.pickLol ? W(spec.pickLol) : 0; break;
    case 'selfAim': aim.radiusWorld = W(V('radius')); aim.rangeWorld = aim.radiusWorld; break;
    default: return null;
  }
  return aim;
}

class SkillAimSystem {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'indicator';
    try { const saved = localStorage.getItem('lolCastMode'); if (CAST_MODES.includes(saved)) this.mode = saved; } catch (e) { /* 저장소를 못 쓰는 환경 */ }
    this.slot = null;       // 지금 조준 중인 슬롯
    this.heldKey = null;    // indicator 방식에서 누르고 있는 키
    this.group = new THREE.Group();
    this.group.renderOrder = 3;
    scene.add(this.group);
    this._meshes = [];
    this._used = 0;
    this.lastAim = null;
    this.hoverUnit = null;
  }
  setMode(mode) {
    if (!CAST_MODES.includes(mode)) return;
    this.mode = mode; this.cancel();
    try { localStorage.setItem('lolCastMode', mode); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  }
  get aiming() { return this.slot != null; }
  begin(slot, key, owner) { this.slot = slot; this.heldKey = key || null; this.owner = owner || null; }
  cancel() { this.slot = null; this.heldKey = null; this._hideAll(); this.lastAim = null; this.hoverUnit = null; }

  // 지금 커서 아래 대상(적/아군)을 고른다 - unit/ally 스킬용.
  pickUnit(c, slot, point, clientXY) {
    const spec = skillAimSpec(c.championId, slot);
    if (!spec) return null;
    if (spec.type === 'unit') return clientXY && typeof getEnemyHit === 'function' ? getEnemyHit(clientXY.x, clientXY.y) : null;
    if (spec.type === 'ally' && point && typeof getAllyChampions === 'function') {
      let best = null, bestD = Infinity;
      for (const a of getAllyChampions(c)) {
        const p = getWorldPosition(a), dd = getHorizontalDistance(p, point);
        if (dd <= lolRangeToWorld(spec.pickLol || 150) + getCollisionRadius(a) && dd < bestD) { best = a; bestD = dd; }
      }
      return best;
    }
    return null;
  }

  // 시전: 대상 지정 스킬은 커서 아래 적을 대상으로 잡고 castAbility로 넘긴다(사거리·비용 판정은 각 스킬 코드가 한다).
  cast(c, slot, point, clientXY) {
    if (!c) return;
    const spec = skillAimSpec(c.championId, slot);
    if (spec && spec.type === 'unit') {
      const u = this.pickUnit(c, slot, point, clientXY);
      if (u && u !== c.currentTarget) { c.currentTarget = u; if (typeof targetRing !== 'undefined') targetRing.attachTo(u); }
    }
    c.castAbility(slot, point);
  }

  update(c, point, clientXY) {
    this._used = 0;
    // 챔피언이 바뀌었거나 죽었으면 조준을 끝낸다. 바루스 Q는 충전이 끝나면(발사·취소·시간 초과) 함께 끝난다.
    if (this.slot && (!c || !c.root || c.hp <= 0 || (this.owner && this.owner !== c))) this.cancel();
    if (!this.slot) { this._hideAll(); return; }
    const aim = computeSkillAim(c, this.slot, point);
    this.lastAim = aim;
    if (!aim || (aim.type === 'charge' && !aim.charging)) { this.cancel(); return; }
    const S = SKILL_AIM_STYLE, ringW = lolRangeToWorld(S.ringLol);
    const yaw = Math.atan2(aim.dir.x, aim.dir.z);
    if (aim.rangeWorld > 0 && aim.rangeWorld <= lolRangeToWorld(SKILL_AIM_MAX_DRAW_LOL)) this._ring(aim.origin, aim.rangeWorld, ringW, S.range, S.rangeOpacity);
    const maxDraw = lolRangeToWorld(SKILL_AIM_MAX_DRAW_LOL);
    switch (aim.type) {
      case 'line': case 'lineToPoint': case 'charge': case 'dash': case 'rectAtPoint': {
        let z = 0;
        for (const s of aim.segments) {
          const z0 = s.start != null ? s.start : z, z1 = Math.min(z0 + s.len, maxDraw);
          this._rect(aim.origin, yaw, z0, z1, s.width / 2);
          z = z0 + s.len;
        }
        if (aim.arrow) this._arrow(aim.origin, yaw, Math.min(z, maxDraw), aim.segments[0].width);
        break;
      }
      case 'circleAt': case 'blink':
        if (aim.path) this._rect(aim.origin, yaw, 0, aim.origin.distanceTo(aim.center), lolRangeToWorld(10));
        this._disc(aim.center, aim.radiusWorld);
        this._ring(aim.center, aim.radiusWorld, ringW, S.edge, S.edgeOpacity);
        break;
      case 'cone': this._cone(aim.origin, yaw, aim.rangeWorld, aim.angleDeg); break;
      case 'trapezoid':
        this._trap(aim.origin, yaw, aim.rangeWorld, aim.startHalfWidth || aim.centerHalfWidth, aim.endHalfWidth);
        this._lane(aim.origin, yaw, aim.rangeWorld, aim.centerHalfWidth); // 세트 W 중앙(고정 피해) 띠
        break;
      case 'wall': this._rect(aim.origin, yaw, aim.wall.dist - aim.wall.thickness / 2, aim.wall.dist + aim.wall.thickness / 2, aim.wall.length / 2); break;
      case 'selfAim':
        this._disc(aim.origin, aim.radiusWorld);
        this._ring(aim.origin, aim.radiusWorld, ringW, S.edge, S.edgeOpacity);
        this._rect(aim.origin, yaw, -aim.radiusWorld, aim.radiusWorld, lolRangeToWorld(6));   // 좌우를 가르는 기준선(커서 방향)
        break;
      case 'unit': case 'ally': {
        const u = this.pickUnit(c, this.slot, point, clientXY);
        this.hoverUnit = u;
        if (u) {
          const inRange = isInRange(c, u, worldDistanceToLol(aim.rangeWorld));
          const r = getCollisionRadius(u) + lolRangeToWorld(20);
          this._ring(getWorldPosition(u), r, ringW * 2, inRange ? S.edge : S.bad, 0.95);
        }
        break;
      }
    }
    for (let i = this._used; i < this._meshes.length; i++) this._meshes[i].visible = false;
  }

  // ---- 그리기 도우미(메시 재사용) ----
  _mesh(color, opacity) {
    let m = this._meshes[this._used];
    if (!m) {
      m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 3;
      this.group.add(m); this._meshes.push(m);
    }
    this._used++;
    m.material.color.setHex(color); m.material.opacity = opacity;
    m.visible = true; m.rotation.set(0, 0, 0);
    return m;
  }
  _setGeo(m, geo) { m.geometry.dispose(); m.geometry = geo; }
  _flat(points) { // 지면(XZ) 다각형 - points: [[x, z], ...] 볼록 다각형(팬)
    const pos = [];
    for (let i = 1; i < points.length - 1; i++) pos.push(points[0][0], 0, points[0][1], points[i][0], 0, points[i][1], points[i + 1][0], 0, points[i + 1][1]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
  }
  _outline(origin, yaw, pts) {
    const S = SKILL_AIM_STYLE, w = lolRangeToWorld(S.ringLol) / 2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const nx = -dz / L * w, nz = dx / L * w;
      const m = this._mesh(S.edge, S.edgeOpacity);
      this._setGeo(m, this._flat([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]));
      m.position.set(origin.x, 0.05, origin.z); m.rotation.y = yaw;
    }
  }
  _poly(origin, yaw, pts) {
    const m = this._mesh(SKILL_AIM_STYLE.fill, SKILL_AIM_STYLE.fillOpacity);
    this._setGeo(m, this._flat(pts));
    m.position.set(origin.x, 0.045, origin.z); m.rotation.y = yaw;
    this._outline(origin, yaw, pts);
  }
  _rect(origin, yaw, z0, z1, hw) { if (z1 > z0) this._poly(origin, yaw, [[-hw, z0], [hw, z0], [hw, z1], [-hw, z1]]); }
  _lane(origin, yaw, len, hw) {
    if (!(hw > 0) || !(len > 0)) return;
    const pts = [[-hw, 0], [hw, 0], [hw, len], [-hw, len]];
    const m = this._mesh(0xfff0c8, 0.3);
    this._setGeo(m, this._flat(pts));
    m.position.set(origin.x, 0.05, origin.z); m.rotation.y = yaw;
  }
  _trap(origin, yaw, len, hw0, hw1) { this._poly(origin, yaw, [[-hw0, 0], [hw0, 0], [hw1, len], [-hw1, len]]); }
  _arrow(origin, yaw, z, width) { const h = Math.max(width, lolRangeToWorld(60)); this._poly(origin, yaw, [[-h, z], [h, z], [0, z + h * 1.2]]); }
  _cone(origin, yaw, r, angleDeg) {
    const half = THREE.MathUtils.degToRad(angleDeg / 2), pts = [[0, 0]];
    for (let i = 0; i <= 24; i++) { const a = -half + 2 * half * (i / 24); pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
    this._poly(origin, yaw, pts);
  }
  _disc(center, r) {
    const m = this._mesh(SKILL_AIM_STYLE.fill, SKILL_AIM_STYLE.fillOpacity);
    const g = new THREE.CircleGeometry(r, 48); g.rotateX(-Math.PI / 2);
    this._setGeo(m, g); m.position.set(center.x, 0.045, center.z);
  }
  _ring(center, r, w, color, opacity) {
    const m = this._mesh(color, opacity);
    const g = new THREE.RingGeometry(Math.max(0, r - w / 2), r + w / 2, 72); g.rotateX(-Math.PI / 2);
    this._setGeo(m, g); m.position.set(center.x, 0.05, center.z);
  }
  _hideAll() { for (const m of this._meshes) m.visible = false; }
}
