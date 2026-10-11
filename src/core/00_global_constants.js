/* ============================================================
   0. GLOBAL CONSTANTS
   ------------------------------------------------------------
   No champion-specific animation names live here anymore. Every
   champion's clip names are discovered at load time by
   AnimationRoleResolver (section 0-A below) and every world
   object is sized relative to BASE_UNIT, the normalized champion
   height (추가 수정사항 11: "기본 캐릭터 높이 = 1.0 world unit").
   ============================================================ */
const BASE_UNIT = 1.0;

/* ============================================================
   0-A0-1. TEAM SYSTEM (아군/적군/플레이어)
   ------------------------------------------------------------
   요청("아군,적군,플레이어 시스템을 만들어줘") - 지금까지 미니언/포탑/
   억제기/넥서스는 전부 `.team`('BLUE'/'RED') 필드를 갖고 서로를 generic
   하게 비교해왔지만(exp_level_system.js의 isValidMinionTarget 등),
   "플레이어가 어느 팀인가"는 어디에도 데이터로 존재하지 않고 매 파일마다
   'RED'/'BLUE' 문자열 리터럴을 직접 박아 넣는 방식(예: 01_hit_detection.js
   의 getAllEnemyUnits()가 `t.team === 'RED'`를 하드코딩, item_system.js의
   isPositionInBaseZone(..., 'BLUE') 등)으로 흩어져 있었다 - 사실상
   "시스템"이 아니라 여러 곳에 중복된 가정이었다.
   이 상수 2개 + 아래 isAllyUnit()/isEnemyUnit() 두 함수로 그 가정을 한
   곳에 모은다. CharacterController(플레이어)에 처음으로 `.team` 필드가
   생기고(PLAYER_TEAM), 더미(dummy_enemy.js)에도 `.team`이 생긴다
   (ENEMY_TEAM) - 기존 동작(플레이어=BLUE, 적=RED)은 전혀 바뀌지 않지만,
   이제 "이 둘이 같은 편인가"를 `.team` 하나만 보고 generic하게 판정할
   수 있어, 향후 아군 전용 효과(서포터 아이템/어시스트 등 - README의
   "아군 챔피언 개념이 없다" 한계)를 만들 때 그 기반으로 재사용할 수 있다.
   범위(명시): 이번 라운드는 태그/판정 기반만 깐다 - 새로 움직이거나
   싸우는 아군/적군 유닛을 추가하지 않는다(요청 시 확인된 범위).
   ============================================================ */
const PLAYER_TEAM = 'BLUE';
const ENEMY_TEAM = 'RED';
// 두 유닛이 같은 팀인지/다른 팀인지 - `.team` 필드가 있는 어떤 유닛
// 쌍에도 쓸 수 있는 generic 판정(플레이어/더미/미니언/포탑/억제기/넥서스
// 전부 동일하게 적용 가능). 둘 중 하나라도 team이 없으면(예: 팀 개념이
// 없는 오브젝트) 안전하게 false를 반환한다 - "모른다"를 "아군이다/적이다"
// 로 잘못 단정하지 않는다.
function isAllyUnit(a, b) { return !!(a && b && a.team && b.team && a.team === b.team); }
function isEnemyUnit(a, b) { return !!(a && b && a.team && b.team && a.team !== b.team); }

/* ============================================================
   0-A00. WORLD DISTANCE SYSTEM (LoL Gameplay Distance ↔ World Distance)
   ------------------------------------------------------------
   버그 수정(치명적): CHAMPION_DATA의 사거리(가렌 평타 175, 마스터 이 Q
   600, 모데카이저 E 900 등)는 전부 "LoL 원본 게임 수치"인데, 지금까지
   isInRange/findEnemiesInRadius/findFirstInLine/사거리 표시 링이 이 숫자를
   그대로 Three.js 월드 좌표 거리로 취급하고 있었다. 이 프로젝트의 맵은
   100x100 world unit인데 900 같은 값을 그대로 쓰면 사실상 맵 전체보다도
   넓은 "사거리"가 되어버린다. 이 때문에 지금까지 각 스킬마다
   markSearchRadiusFallback/reappearWorldDistanceFactor/knockbackDistance
   /10 같은 임시 보정값을 따로따로 만들어 덮어왔는데, 이런 식으로 스킬마다
   다른 배율을 쓰는 방식 자체가 문제의 원인이었다.

   기준(WORLD_DISTANCE_SCALE 산출 근거): 이 프로젝트에는 이미 챔피언
   데이터 연결 전부터 쓰이던 ATTACK_RANGE(5.5 world unit, "근접 평타가
   닿아야 하는 세계 단위 거리"로 이미 튜닝되어 있던 값)가 있었다. 이
   값은 이 프로젝트의 기준 챔피언인 다리우스를 보고 튜닝된 값이므로,
   환산 기준도 "LoL 표준 근접 사거리 150 안팎"이라는 추정치가 아니라
   실제 다리우스의 평타 사거리(175 - League of Legends Wiki/Liquipedia
   기본 스탯에서 확인: Attack Range 175)를 써야 정확하다:

     WORLD_DISTANCE_SCALE = (ATTACK_RANGE(world) / 175(다리우스 실제 평타 사거리)) * 0.25
    // 현재 월드/모델 정규화 기준에서 기존 환산값이 실제 거리 대비 4배였으므로 전체를 1/4로 보정한다.

   이 계수 하나만 프로젝트 전체(기본 공격/Q/W/E/R/이동속도/사거리 표시링/
   투사체/마스터 이 알파스트라이크 재등장·추적 거리)에서 재사용한다 -
   스킬마다 다른 배율을 절대 만들지 않는다. 데이터 수정: 분모를 추정치
   150에서 실제 확인된 175로 바꿨다 - 이 하나의 상수가 전 챔피언의 모든
   거리(사거리/투사체/돌진/이동속도)에 공통으로 곱해지므로, 닐라만이
   아니라 프로젝트 전체가 동시에(더 정확한 방향으로) 약 14% 줄어든다.
   ============================================================ */
const MOVE_SPEED = 4.2 * BASE_UNIT / 1.0;
const ATTACK_RANGE = 5.5 * BASE_UNIT / 1.0;
const WORLD_DISTANCE_SCALE = (ATTACK_RANGE / 175) * 0.25 * 1.10; // 표시/실효과만 +10%; CHAMPION_DATA 원본 수치는 변경하지 않음
// LoL 원본 수치(사거리/속도) → 이 월드의 Three.js 거리로 변환.
function lolRangeToWorld(lolRange) { return (lolRange || 0) * WORLD_DISTANCE_SCALE; }
// 역변환 - 디버그 패널 등에서 "지금 이 월드 거리가 LoL 기준 몇 유닛인지" 표시할 때 사용.
function worldDistanceToLol(worldDistance) { return (worldDistance || 0) / WORLD_DISTANCE_SCALE; }

/* ============================================================
   0-A00c. GLB SAFETY / DIAGNOSTICS
   ------------------------------------------------------------
   요청("상대팀 포탑을 공격할 때 GLB가 사라지는 버그를 완전히 제거") -
   실제 원인은 이미 찾아서 고쳤다(animate()의 dt NaN 방어 + 포탑/넥서스/
   억제기 GLB material clone 분리, 둘 다 위쪽 섹션에 있음). 이 섹션은
   "혹시 같은 종류 문제가 다른 경로로 재발해도 조용히 넘어가지 않고 바로
   잡히게" 만드는 안전장치다.

   - safeMixerUpdate(): mixer.update()를 부르는 모든 곳이 이 함수 하나를
     거치게 한다. dt가 비정상이면 그 프레임만 건너뛰고 경고를 남긴다(에러를
     숨기는 try/catch가 아니라, 애초에 나쁜 값이 mixer 내부로 못 들어가게
     막는 방식). GLB_DEBUG가 켜져 있을 때만 매 호출마다 transform까지
     검증한다 - 평소엔 진짜로 아무 추가 비용이 없다(운영 최적화 유지).
   - validateGLBTransform()/validateGLBMaterial(): NaN/Infinity 여부만
     확인하는 순수 검사 함수. 매 프레임 전수조사하지 않고, 이벤트(포탑
     피격) 시점에만 호출한다.
   - snapshotTurretGLBState()/compareTurretGLBSnapshots(): "포탑을 때리기
     직전" 상태와 "다음 애니메이션 프레임" 상태를 비교해서 정확히 무엇이
     바뀌었는지(visible/opacity/transform/애니메이션 시간) 콘솔에 남긴다.
   ============================================================ */
const GLB_DEBUG = false; // 요청("안고쳐졌어") - 실제 원인을 스택 트레이스로 잡기 위해 이번 빌드는 켜둔 상태로 드립니다. 확인 끝나면 false로 되돌리세요.

// 요청("안고쳐졌어") - 지난 수정(NaN dt 방어 + material clone)이 실제
// 발생 원인을 못 맞췄다는 뜻이다. 정적으로 코드를 더 훑어서 추측하는
// 대신, ".visible이 실제로 false가 되는 순간"을 코드 레벨에서 가로채서
// 어떤 코드가 그랬는지 콜스택으로 바로 잡아낸다 - THREE.Object3D.prototype
// 의 visible을 getter/setter로 감싸서, true→false로 바뀔 때마다 콘솔에
// 스택 트레이스를 남긴다. GLB_DEBUG일 때만 활성화되고, 끄면 prototype을
// 전혀 건드리지 않아 평소 동작/성능에 영향이 없다.
if (GLB_DEBUG && typeof THREE !== 'undefined' && THREE.Object3D && !THREE.Object3D.prototype._visiblePatched) {
  const proto = THREE.Object3D.prototype;
  const store = new WeakMap();
  Object.defineProperty(proto, 'visible', {
    configurable: true,
    get() { return store.has(this) ? store.get(this) : true; },
    set(v) {
      const prev = store.has(this) ? store.get(this) : true;
      if (window.__TRACE_REAL_VISIBLE_TRANSITIONS__ && prev === true && v === false) {
        console.warn(`[VISIBLE true→false] name="${this.name || '(no name)'}" type=${this.type}`, new Error('call stack').stack);
      }
      store.set(this, v);
    },
  });
  THREE.Object3D.prototype._visiblePatched = true;
}
// 위와 같은 원리로 material.opacity가 0 근처로 떨어지는 순간도 잡는다.
if (GLB_DEBUG && typeof THREE !== 'undefined' && THREE.Material && !THREE.Material.prototype._opacityPatched) {
  const matProto = THREE.Material.prototype;
  const opStore = new WeakMap();
  Object.defineProperty(matProto, 'opacity', {
    configurable: true,
    get() { return opStore.has(this) ? opStore.get(this) : 1; },
    set(v) {
      const prev = opStore.has(this) ? opStore.get(this) : 1;
      if (prev > 0.05 && v <= 0.05) {
        console.warn(`[OPACITY→${v}] material.name="${this.name || '(no name)'}" type=${this.type}`, new Error('call stack').stack);
      }
      opStore.set(this, v);
    },
  });
  THREE.Material.prototype._opacityPatched = true;
}

function safeMixerUpdate(mixer, dt, contextLabel) {
  if (!mixer) return;
  if (!isFinite(dt) || dt < 0) {
    console.warn(`[MIXER SAFETY] ${contextLabel || '(unknown)'} - 비정상 dt(${dt}) 감지, 이번 프레임 mixer.update 건너뜀`);
    return;
  }
  // 탭이 백그라운드에 오래 있다 돌아오는 등 극단적으로 큰 dt가 들어오면
  // 애니메이션이 한 번에 몇 초씩 점프해 보일 수 있어 상한을 둔다(NaN
  // 방어와는 별개 - animate()의 0.05 상한이 이미 대부분 걸러내지만,
  // 개별 엔티티의 누적 dt(예: LOD로 건너뛴 프레임 몫)는 그 상한을 우회할
  // 수 있어 여기서 한 번 더 막는다).
  const safeDt = Math.min(dt, 0.5);
  mixer.update(safeDt);
  if (GLB_DEBUG) validateGLBTransform(mixer.getRoot(), contextLabel);
}

function validateGLBTransform(object3D, label) {
  if (!object3D) return true;
  const p = object3D.position, r = object3D.rotation, q = object3D.quaternion, s = object3D.scale;
  const vals = [p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
  const bad = vals.some((v) => !isFinite(v));
  if (bad) {
    console.error(`[GLB TRANSFORM CORRUPTED] ${label || '(unknown)'}`, {
      position: p.toArray(), rotation: [r.x, r.y, r.z], quaternion: q.toArray(), scale: s.toArray(), visible: object3D.visible,
    });
  }
  return !bad;
}
function validateGLBMaterial(object3D, label) {
  if (!object3D) return true;
  let ok = true;
  object3D.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.opacity != null && (!isFinite(m.opacity) || m.opacity < 0 || m.opacity > 1)) {
        console.error(`[GLB MATERIAL ABNORMAL] ${label || '(unknown)'} - opacity=${m.opacity}, transparent=${m.transparent}, depthWrite=${m.depthWrite}, depthTest=${m.depthTest}`);
        ok = false;
      }
    }
  });
  return ok;
}

// 요청 5: "포탑 공격 이벤트를 기준으로 디버깅" - GLB_DEBUG일 때만 실제로
// 스냅샷을 뜬다(평상시 비용 0). applyDamageToTurret() 시작/끝에서 호출.
function snapshotTurretGLBState(turret, label) {
  if (!GLB_DEBUG || !turret || !turret.mesh) return null;
  return {
    label, time: performance.now(),
    visible: turret.mesh.visible,
    position: turret.mesh.position.toArray(),
    scale: turret.mesh.scale.toArray(),
    quaternion: turret.mesh.quaternion.toArray(),
    mixerTime: turret.mixer ? turret.mixer.time : null,
    actionTime: turret.currentAction ? turret.currentAction.time : null,
    actionWeight: turret.currentAction ? turret.currentAction.getEffectiveWeight() : null,
    clipName: turret.currentClipName,
  };
}
function compareTurretGLBSnapshots(before, after, turret) {
  if (!GLB_DEBUG || !before || !after) return;
  const changed = {};
  for (const key of ['visible', 'position', 'scale', 'quaternion', 'mixerTime', 'clipName']) {
    const a = JSON.stringify(before[key]), b = JSON.stringify(after[key]);
    if (a !== b) changed[key] = { before: before[key], after: after[key] };
  }
  if (Object.keys(changed).length) console.log(`[TURRET DEBUG] ${before.label} → ${after.label} 사이 변경됨:`, changed);
  validateGLBTransform(turret.mesh, `turret:${turret.team}:${turret.type}`);
  validateGLBMaterial(turret.mesh, `turret:${turret.team}:${turret.type}`);
}

const STATE = {
  IDLE:'IDLE', MOVE:'MOVE', ATTACK:'ATTACK', Q_CAST:'Q_CAST', W_CAST:'W_CAST',
  E_CAST:'E_CAST', R_CAST:'R_CAST', CHANNEL:'CHANNEL', RECALL:'RECALL',
  DEAD:'DEAD', RESPAWN:'RESPAWN'
};

const Q_COOLDOWN = 4, W_COOLDOWN = 8, E_COOLDOWN = 6, R_COOLDOWN = 20;
const Q_MANA = 15, W_MANA = 20, E_MANA = 15, R_MANA = 50;
const RECALL_DURATION = 4.0;
const RESPAWN_WAIT = 3.0;
const E_COMBO_WINDOW = 1.2;
// 커스텀(사용자 정의 다중 애니메이션 시퀀스) Q/W/E/R용 비용/데미지 테이블.
// 슬롯 이름으로만 조회하는 범용 테이블이라 어떤 챔피언에도 동일하게 적용된다.
const SKILL_COST = {
  Q: { mana: Q_MANA, cd: Q_COOLDOWN },
  W: { mana: W_MANA, cd: W_COOLDOWN },
  E: { mana: E_MANA, cd: E_COOLDOWN },
  R: { mana: R_MANA, cd: R_COOLDOWN },
};
const CUSTOM_SKILL_DAMAGE = { Q: 18, E: 16, R: 60 }; // W는 데미지 대신 버프(subState 'W')
// 요청 1: AnimationSequencePlayer의 Step 전환 Cross Fade 기본 시간. 이미
// crossFadeTo()가 쓰던 기존 기본값(0.15)을 그대로 재사용한다(새 값 발명 안 함).
const DEFAULT_ANIMATION_FADE_TIME = 0.15;

/* ============================================================
   0-A0. COMMON COMBAT MATH (요청 3, 5, 7, 9, 15~17, 21)
   ------------------------------------------------------------
   "여기저기서 직접 계산하지 말고 공통 함수를 사용한다"는 원칙에 따라
   이동속도/공격속도/윈드업/사거리/데미지 계산을 전부 여기 한 곳에
   모은다. CharacterController와 더미 AI, ProjectileSystem이 전부
   이 함수들을 통해서만 관련 수치를 얻는다. 모든 시간 값은 초 단위
   dt 기반이며(프레임 독립적), 여기서 만드는 stats 오브젝트의 기본값은
   기존에 쓰이던 MOVE_SPEED/ATTACK_RANGE 상수를 그대로 시드로 사용해
   기존 체감을 유지한다.
   ============================================================ */
function getHorizontalDistance(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return Math.hypot(dx, dz);
}

/* ============================================================
   RANGE / DISTANCE SYSTEM (LoL 스타일 거리/사거리/범위 판정)
   ------------------------------------------------------------
   요청: "distance = a.position.distanceTo(b.position)" 하나로 모든
   판정을 처리하지 말 것. Center Distance(중심점 간 거리)와 Effective
   Distance(양쪽 충돌 반경을 뺀 실제 거리)를 분리하고, 기본 공격/논타겟
   스킬 Hit Detection이 이미 쓰던 getHorizontalDistance/isInAttackRange/
   findEnemiesInRadius/findFirstInLine을 전부 이 위에서 재구현해서 공통
   로직이 하나로 합쳐지게 한다 - 새 판정 함수를 병렬로 또 만들지 않는다.
   ============================================================ */
// 엔티티(CharacterController | dummy형 오브젝트 | THREE.Object3D | 순수 좌표)에서
// 월드 좌표를 뽑아낸다. 이 프로젝트는 챔피언 루트를 씬에 직접 붙이고
// GLB Bone을 전투 판정에 쓰지 않으므로 parent-relative 오차가 없지만,
// 혹시 Object3D가 넘어오면 getWorldPosition으로 안전하게 처리한다.
function getWorldPosition(entity) {
  if (!entity) return null;
  if (entity.isObject3D) { const v = new THREE.Vector3(); entity.getWorldPosition(v); return v; }
  if (entity.root && entity.root.position) return entity.root.position; // CharacterController
  if (entity.mesh && entity.mesh.position) return entity.mesh.position; // dummy 등 월드 오브젝트
  return entity.position || entity; // 이미 {x,y,z} 좌표
}
// Collision Radius ≠ Mesh Scale. collisionRadius가 명시적으로 없으면
// 기존에 쓰이던 radius 필드(더미의 bodyRadius 등)로 안전하게 폴백한다.
function getCollisionRadius(entity) {
  if (!entity) return 0;
  if (entity.collisionRadius != null) return entity.collisionRadius;
  if (entity.radius != null) return entity.radius;
  return 0;
}

function isGhosted(entity) {
  return !!entity && hasStatus(entity, 'NILAH_GHOST');
}
// A. Center Distance - 두 중심점 사이의 실제 3D 거리(높이 포함).
function getCenterDistance(a, b) {
  const pa = getWorldPosition(a), pb = getWorldPosition(b);
  return Math.hypot(pb.x - pa.x, (pb.y || 0) - (pa.y || 0), pb.z - pa.z);
}
// 엔티티 두 개를 받는 수평 거리 버전(기존 getHorizontalDistance(a,b)는
// 순수 좌표 두 개를 받는 저수준 함수라 그대로 두고, 이건 그 위에 얹은
// "엔티티를 바로 넘겨도 되는" 편의 함수다).
function getHorizontalDistanceOf(a, b) { return getHorizontalDistance(getWorldPosition(a), getWorldPosition(b)); }
// B. Edge Distance(Effective Distance) - 양쪽 Collision Radius를 뺀 실제
// "닿는" 거리. 허수아비를 키워도(collisionRadius 증가) 이 함수를 쓰는 모든
// 판정이 자동으로 더 가까운 거리에서부터 닿는 것으로 처리된다.
function getEffectiveDistance(a, b) {
  return Math.max(0, getHorizontalDistanceOf(a, b) - getCollisionRadius(a) - getCollisionRadius(b));
}
// C/E. Cast Range / Ability Range 판정 - "사거리 안에 있는가"(맞았는가와는 별개 개념, 섹션 14).
// 스킬 사거리는 시전자 자신의 collisionRadius를 사거리에 더하지 않는다.
// 실제 범위 탐색(findEnemiesInRadius/isInCone)과 동일하게
// 중심점 거리 <= 월드 사거리 + 대상 반경으로 통일한다.
// 지정 대상 판정과 비지정 범위 탐색이 동일한 위치에서 서로 다른 결과를 내지 않게 한다.
function isInRange(source, target, lolRange) {
  if (!source || !target) return false;
  const centerDistance = getHorizontalDistanceOf(source, target);
  return centerDistance <= lolRangeToWorld(lolRange) + getCollisionRadius(target);
}
// 둘 다 받는다. 대상의 collisionRadius만큼 여유를 더 준다(요청 10).
function isInCircle(target, center, radius) {
  const p = getWorldPosition(target);
  const c = getWorldPosition(center) || center;
  return getHorizontalDistance(p, c) <= radius + getCollisionRadius(target);
}
// Cone(부채꼴) 판정 - 거리 AND 각도를 동시에 확인(요청 12).
function isInCone(target, origin, direction, range, angleDeg) {
  const p = getWorldPosition(target);
  const o = getWorldPosition(origin) || origin;
  const dx = p.x - o.x, dz = p.z - o.z;
  const dist = Math.hypot(dx, dz);
  if (dist > range + getCollisionRadius(target)) return false;
  if (dist < 1e-4) return true;
  const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
  const dir = (direction.clone ? direction.clone() : new THREE.Vector3(direction.x, 0, direction.z)).setY(0).normalize();
  const angle = Math.acos(THREE.MathUtils.clamp(dir.dot(toTarget), -1, 1)) * 180 / Math.PI;
  return angle <= angleDeg;
}
// Linear Skillshot 충돌 - 투사체 반경 + 대상 반경(요청 11).
function isProjectileHit(projectilePos, projectileRadius, target) {
  return getHorizontalDistance(projectilePos, getWorldPosition(target)) <= projectileRadius + getCollisionRadius(target);
}
// 세트 W(강펀치) 전용 사다리꼴 판정 - forwardDistance/lateralDistance를
// 분리해서(요청 17/18), 중앙 직선(고정 폭 centerHalfWidth)에 있으면
// 'CENTER', 그 밖이지만 사다리꼴(centerHalfWidth에서 endHalfWidth로
// 선형으로 넓어짐) 안에 있으면 'SIDE', 완전히 밖이면 null을 반환한다.
// 전부 LoL 원본 수치를 받아 내부에서 world로 변환한다 - 호출부는 변환을
//신경 쓸 필요가 없다. 대상의 collisionRadius도 함께 고려한다(요청 17).
function isPointInsideSettWTrapezoid(target, origin, forward, lolRange, lolCenterHalfWidth, lolEndHalfWidth) {
  const p = getWorldPosition(target);
  const r = getCollisionRadius(target);
  const range = lolRangeToWorld(lolRange);
  const centerHalfWidth = lolRangeToWorld(lolCenterHalfWidth);
  const endHalfWidth = lolRangeToWorld(lolEndHalfWidth);
  const dx = p.x - origin.x, dz = p.z - origin.z;
  const forwardDist = dx * forward.x + dz * forward.z; // 전방 투영 거리
  if (forwardDist < -r || forwardDist > range + r) return null; // 사거리 밖
  const lateralDist = Math.abs(dx * -forward.z + dz * forward.x); // 중심선에서 옆으로 벗어난 거리
  const t = Math.max(0, Math.min(1, forwardDist / Math.max(range, 1e-6)));
  const widthAtDist = centerHalfWidth + (endHalfWidth - centerHalfWidth) * t; // 사다리꼴 폭(전방 거리에 비례해 넓어짐)
  if (lateralDist > widthAtDist + r) return null; // 사다리꼴 밖
  if (lateralDist <= centerHalfWidth + r) return 'CENTER'; // 중앙 직선(폭 고정) 안
  return 'SIDE';
}
// 논타겟 스킬의 목적지를 최대 사거리로 clamp(요청 8/16). origin/destination
// 모두 좌표 또는 엔티티 둘 다 받는다.
function clampToRange(origin, destination, range) {
  const o = getWorldPosition(origin) || origin;
  const d = getWorldPosition(destination) || destination;
  const dir = new THREE.Vector3(d.x - o.x, 0, d.z - o.z);
  const dist = dir.length();
  if (dist <= range || dist < 1e-6) return new THREE.Vector3(d.x, d.y || 0, d.z);
  dir.normalize();
  return new THREE.Vector3(o.x, o.y || 0, o.z).addScaledVector(dir, range);
}
function getDirection(source, target) {
  const s = getWorldPosition(source), t = getWorldPosition(target);
  const dir = new THREE.Vector3(t.x - s.x, 0, t.z - s.z);
  return dir.lengthSq() > 1e-8 ? dir.normalize() : new THREE.Vector3(0, 0, 1);
}

// 요청 5/13: 사거리 판정 시 공격자 크기도 함께 뺀다(기존엔 target.radius만
// 뺐고 attacker 쪽은 항상 0 취급이었다). attacker.collisionRadius가 아직
// 없는 호출부(월드 오브젝트 등)는 기존과 동일하게 0으로 안전하게 폴백한다.
function isInAttackRange(attacker, target) {
  if (!attacker || !target) return false;
  // stats.attackRange는 computeChampionStats()에서 이미 LoL→World로 한 번
  // 변환된 값이므로(생성자 기본값 ATTACK_RANGE도 원래부터 world-scale),
  // 여기서는 isInRange()의 LoL 변환을 거치지 않고 Effective Distance와
  // 직접 비교한다 - 이중 변환을 방지한다.
  let attackRange = attacker.stats.attackRange;
  if (attacker.championId === 'renekton' && attacker._renekton?.rActive) attackRange += lolRangeToWorld(25);
  return getEffectiveDistance(attacker, target) <= attackRange;
}

function getFinalMoveSpeed(stats) {
  let speed = stats.baseMoveSpeed + stats.flatMoveSpeedBonus;
  speed *= 1 + stats.percentMoveSpeedBonus;
  speed *= 1 - Math.min(1, Math.max(0, stats.slowPercent));
  speed *= stats.moveSpeedMultiplier;
  speed = Math.max(stats.minMoveSpeed, speed);
  speed = Math.min(stats.maxMoveSpeed, speed);
  return speed;
}

function getFinalAttackSpeed(stats) {
  let as = stats.baseAttackSpeed * (1 + stats.bonusAttackSpeedPercent) * stats.attackSpeedMultiplier;
  as = Math.max(stats.minAttackSpeed, Math.min(stats.maxAttackSpeed, as));
  return as;
}
function getAttackInterval(stats) { return 1 / getFinalAttackSpeed(stats); }
function getWindupDuration(stats) { return getAttackInterval(stats) * stats.windupPercent; }
function getRecoveryDuration(stats) { return Math.max(0, getAttackInterval(stats) - getWindupDuration(stats)); }

const DAMAGE_TYPE = { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' };

// 피해 공격자 결정 - `source`를 넘기지 않은 호출(대부분의 챔피언 스킬)은
// 이 데모의 유일한 챔피언 피해원인 플레이어(전역 controller)로 대체한다.
// 단, 대상이 플레이어 자신이면 절대 대체하지 않는다: 미니언/포탑/우물이
// 플레이어를 때릴 때 source가 없으면 플레이어가 "자기 자신을 공격한
// 것"으로 처리돼, 자신의 흡혈·관통력·치명타 피해·피해 증폭이 자기가
// "받는" 피해에 적용되는 버그가 있었다.
function resolveDamageSource(source, target) {
  if (source) return source;
  if (typeof controller === 'undefined' || !controller || target === controller) return null;
  return controller;
}

// 요청 16: 방어력/마법저항 공식 100/(100+armor). TRUE 데미지는 저항 무시.
// 요청 17: 치명타는 호출부(Release 시점)에서 이미 확정되어 isCritical로
// 넘어온다 - 여기서 다시 굴리지 않는다(같은 공격 인스턴스의 결과가 명중
// 시점에 바뀌면 안 되므로).
function calculateDamage({ rawDamage, damageType = DAMAGE_TYPE.PHYSICAL, isCritical = false, critMultiplier = 1, target, source, armorPenPercent = 0, magicPenPercent = 0, bonusArmorIgnorePercent = 0, isBasicAttack = false }) {
  // 무한의 대검(치명타 피해량 +30%) - 각 챔피언 스킬이 저마다 다른
  // critMultiplier를 넘기므로(공용 필드가 아님), 공격자의 아이템 보너스를
  // 여기서 한 곳에서 더해 넣는다 - 치명타가 아니면 critMultiplier 자체가
  // 안 쓰이므로 영향이 없다.
  const critAtk = resolveDamageSource(source, target);
  const critBonus = (critAtk && critAtk.itemBonusCritDamagePercent) || 0;
  let dmg = Math.max(0, rawDamage) * (isCritical ? Math.max(1, critMultiplier + critBonus) : 1);
  if (damageType === DAMAGE_TYPE.PHYSICAL) {
    let armor = (target && (target.armor ?? target.stats?.armor)) || 0;
    if (bonusArmorIgnorePercent > 0 && target) { const baseArmor = target.baseArmor ?? target.stats?.baseArmor ?? armor; const bonusArmor = Math.max(0, armor - baseArmor); armor = baseArmor + bonusArmor * (1 - Math.min(1, bonusArmorIgnorePercent)); }
    // 기획안 8절 ARMOR_SHRED(예: 가렌 E 6회 피격 시 방어력 25% 감소) 반영.
    if (typeof getArmorShredPercent === 'function') armor *= (1 - getArmorShredPercent(target));
    // 아이템 패시브(톱날 단검 - 고정 물리 관통력 10) - 마법사의 신발(고정
    // 마법 관통력)과 동일한 원칙으로 퍼센트 관통보다 먼저 적용한다.
    const atkP = resolveDamageSource(source, target);
    // 벼락폭풍검(창공)의 "4초간 물리 관통력 획득"은 영구 스탯(itemBonusArmorPenFlat,
    // 구매/판매 시에만 재계산)과 별개로 지속시간이 있는 임시 버프라 자체
    // 필드(itemTempArmorPenFlat)에 더해서 같은 자리에서 합산한다.
    const flatArmorPen = ((atkP && atkP.itemBonusArmorPenFlat) || 0) + ((atkP && atkP.itemTempArmorPenFlat) || 0);
    armor = Math.max(0, armor - flatArmorPen);
    armor *= (1 - Math.max(0, Math.min(1, armorPenPercent))); // 다리우스 E 패시브 방어구 관통 등
    // 경계(빛과 어둠 - 어둠)의 "10%(최대 30%) 방어구 관통력"도 영구
    // 곱연산 필드(itemBonusArmorPenMultiplier)와 별개인 임시 버프라
    // 똑같이 곱으로 추가 적용한다.
    if (atkP && atkP.itemTempArmorPenPercent > 0) armor *= (1 - Math.max(0, Math.min(1, atkP.itemTempArmorPenPercent)));
    // 아이템 패시브(최후의 속삭임 - 방어구 관통력 18%) - 마법 관통력(위
    // MAGICAL 분기)과 동일한 이유로 공격자를 source||controller로 찾는다.
    if (atkP && atkP.itemBonusArmorPenMultiplier < 1) armor *= atkP.itemBonusArmorPenMultiplier;
    dmg *= 100 / (100 + Math.max(0, armor));
  } else if (damageType === DAMAGE_TYPE.MAGICAL) {
    // 버그 수정: 지금까지 MAGICAL 분기에는 관통력을 반영할 파라미터 자체가
    // 없었다 - 모데카이저 E 패시브("마법 관통력을 얻습니다")가 magicPenPercent를
    // 세팅만 하고 실제로 아무 데도 쓰이지 않아 완전히 무효과였다. PHYSICAL의
    // armorPenPercent와 동일한 방식으로 마법저항력에 반영한다.
    let mr = (target && (target.magicResist ?? target.stats?.magicResist)) || 0;
    // 아이템 패시브(악의 "증오안개" - 마법 저항력 10 감소, MR_SHRED 상태이상) -
    // ARMOR_SHRED(칠흑의양날도끼)와 동일한 자리(관통 적용 전)에서 먼저 깎는다.
    if (typeof getMrShredFlat === 'function') mr = Math.max(0, mr - getMrShredFlat(target));
    // 아이템 패시브(마법사의 신발 - 고정 마법 관통력) - 고정 관통은 항상
    // 퍼센트 관통보다 먼저 적용한다(실제 LoL 공식과 동일 순서). `source`가
    // 없는 호출(대부분의 스킬 피해 호출)은 흡혈/영광 처치 훅과 동일한
    // 이유로 전역 `controller`(이 데모의 유일한 챔피언 피해원)로 대체한다.
    const atk = resolveDamageSource(source, target);
    const flatMagicPen = (atk && atk.itemBonusMagicPenFlat) || 0;
    mr = Math.max(0, mr - flatMagicPen);
    // 경계(빛과 어둠 - 어둠)의 임시 마법 관통력(최대 30%) - PHYSICAL 분기의
    // itemTempArmorPenPercent와 동일한 자리.
    const tempMagicPenPercent = (atk && atk.itemTempMagicPenPercent) || 0;
    // 아이템 패시브(역병의 보석/공허의지팡이 - 퍼센트 마법 관통력) - 최후의
    // 속삭임(itemBonusArmorPenMultiplier)과 동일한 자리/원칙의 영구 곱연산 관통력.
    const itemMagicPenMultiplier = (atk && atk.itemBonusMagicPenMultiplier < 1) ? atk.itemBonusMagicPenMultiplier : 1;
    const effectiveMr = mr * (1 - Math.max(0, Math.min(1, magicPenPercent))) * (1 - Math.max(0, Math.min(1, tempMagicPenPercent))) * itemMagicPenMultiplier;
    dmg *= 100 / (100 + Math.max(0, effectiveMr));
    dmg *= 1 - getMagicDamageReductionPercent(target);
  }
  // TRUE: 방어 수치를 그대로 무시
  dmg = Math.max(0, dmg);
  // 아이템 패시브(쇼진의창 "집중된 의지" - 스택당 피해량 증폭) - 실제
  // LoL처럼 모든 피해 계산이 끝난 뒤 최종 피해에 곱하는 증폭으로 적용한다.
  // 원문대로 "챔피언 스킬과 기본 지속 효과 피해량"만 증폭한다 - 기본
  // 공격(isBasicAttack)은 제외한다.
  const ampSource = resolveDamageSource(source, target);
  if (!isBasicAttack && ampSource && ampSource.itemSpellDamageAmpPercent > 0) dmg *= (1 + ampSource.itemSpellDamageAmpPercent);
  // 아이템 패시브(피의 노래 "약점 노출" - 대상이 받는 피해량 증가) - 공격자
  // 기준 증폭(itemSpellDamageAmpPercent, 위)과 반대로 "대상"이 받는 모든
  // 피해(물리/마법/고정 전부)에 적용되는 VULNERABLE 상태이상이다.
  if (typeof getVulnerablePercent === 'function') dmg *= (1 + getVulnerablePercent(target));
  return dmg;
}

// 데미지 적용 공통 진입점: CharacterController(플레이어)든 더미든 동일하게
// 이 함수 하나로 처리한다. 플레이어는 takeDamage()가, 더미는 damageEnemy()가
// 실제 HP 차감을 담당하고, 이 함수는 그 앞단의 "얼마나 깎일지" 계산만 맡는다.
function applyDamage(target, result) {
  if (!target) return 0;
  // 요청 문서 20절(챔피언↔미니언/구조물 상호작용) - 미니언/포탑/억제기/
  // 넥서스는 각자 전용 피해 처리 함수를 갖고 있다(방패/이중갑옷/요새화,
  // 골드·경험치·사망 처리 등이 챔피언 피해와 다르게 갈라져 있음). 모든
  // 스킬이 결국 applyDamage() 하나를 공용 진입점으로 거치므로, 여기서
  // 대상 종류만 보고 전용 함수로 넘겨주면 지금까지 만든 모든 챔피언의
  // 모든 스킬(직선/범위/AOE)에 새 대상 종류가 자동으로 적용된다 - 개별
  // 스킬 코드를 하나도 건드릴 필요가 없다(요청 20-C와 동일한 원칙).
  if (target.isMinion) return applyDamageToMinion(target, result, true); // applyDamage()는 항상 챔피언(플레이어) 스킬/공격 경로에서만 호출됨
  if (target.isTurret) {
    const turretDmgSource = resolveDamageSource(result.source, target);
    const turretFinalDmg = applyDamageToTurret(target, result, { source: turretDmgSource });
    // 마법의 영약("챔피언이나 포탑에 피해를 입히면 25의 추가 고정 피해") -
    // 포탑 전용 좁은 훅(itemOnDamageDealtToTurret)만 호출한다. 기존
    // itemOnDamageDealt()(그리버스/카탈리스트/운명의 재/여신의 눈물)를
    // 그대로 포탑에도 열면 "포탑 대상"을 전혀 고려하지 않고 만들어진 그
    // 효과들이 의도치 않게 영향을 받을 위험이 있어(예: target.isMinion이
    // false인 포탑에 운명의 재 챔피언 등급 발화가 그대로 걸리는 등), 이미
    // 검증된 기존 훅은 건드리지 않고 이번에 필요한 효과 하나만 분리했다.
    if (typeof itemOnDamageDealtToTurret === 'function' && turretDmgSource && typeof turretDmgSource.championId === 'string') {
      itemOnDamageDealtToTurret(turretDmgSource, target, turretFinalDmg);
    }
    return turretFinalDmg;
  }
  if (target.isInhibitor) return applyDamageToInhibitor(target, result);
  if (target.isNexus) return applyDamageToNexus(target, result);
  const finalDmg = calculateDamage({ ...result, target });
  target._lastDamageTakenAmount = finalDmg;
  // 워모그의 갑옷(워모그의 심장) - "챔피언이 아닌 대상에게는 3초"처럼
  // 공격자 종류와 무관하게 "피해를 받은 적 없는 시간"이 필요한 효과를
  // 위한 범용 타임스탬프(챔피언 전용인 _itemLastTookChampionDamageAt과
  // 별개 - 미니언/몬스터 등 비챔피언 공격자에게 맞았을 때도 갱신된다).
  if (typeof target._itemLastTookAnyDamageAt !== 'undefined') target._itemLastTookAnyDamageAt = performance.now();
  // 아이템 패시브 공용 훅(item_system.js) - 모든 피해 흡혈(도란의 검/활),
  // "챔피언에게 피해를 입힌/입은 시각" 타임스탬프(도란의 반지/방패), 마나순환
  // (여신의 눈물)은 구조물이 아닌 챔피언/더미 피해 경로에서만 다룬다.
  // 버그 수정: `result.source`는 야스우/바루스/이즈리얼/아리/애쉬/요네 정도만
  // 채워 넣고(가렌/다리우스/렉사이 등 대부분의 챔피언 스킬 피해 호출은
  // `source`를 넘기지 않음 - 기본 공격 `attackResult`도 마찬가지) 나머지는
  // 전부 undefined라서, 그 챔피언들로는 흡혈 아이템이 전혀 발동하지 않는
  // 상태였다. 이 데모는 애초에 "조작 중인 플레이어 하나만 챔피언/더미에
  // 피해를 줄 수 있는" 구조(적 AI가 챔피언을 공격하는 기능 자체가 없음)이므로,
  // `result.source`가 없으면 전역 `controller`(플레이어 자신)로 안전하게
  // 대체한다(미니언 경로의 `applyDamageToMinion()`이 이미 쓰던 것과 동일한
  // 원칙 - killMinion()의 전역 controller 참조 참고).
  const dmgSource = resolveDamageSource(result.source, target);
  if (dmgSource && typeof dmgSource.championId === 'string') {
    if (typeof applyItemVamp === 'function') applyItemVamp(dmgSource, finalDmg);
    const dealtDamageType = result.damageType || DAMAGE_TYPE.PHYSICAL; // calculateDamage()의 기본값과 동일하게 맞춘다
    if (typeof applyItemPhysicalVamp === 'function') applyItemPhysicalVamp(dmgSource, finalDmg, dealtDamageType);
    if (target.isChampion) dmgSource._itemLastDealtChampionDamageAt = performance.now();
    if (typeof target._itemLastTookChampionDamageAt !== 'undefined') target._itemLastTookChampionDamageAt = performance.now();
    if (typeof itemOnDamageDealt === 'function') itemOnDamageDealt(dmgSource, target, finalDmg, dealtDamageType, { isBasicAttack: !!result.isBasicAttack, isStatusTick: !!result.isStatusTick, isItemEffect: !!result.isItemEffect, isAbility: result.isAbility });
  }
  // 요청(처형 시스템): 이 피해로 대상이 실제로 죽는지를 데미지 적용 "전"에
  // 먼저 판정한다 - 학습용 더미는 damageEnemy()에서 2% 바닥에 멈추도록
  // 되어 있어서 target.hp가 실제로 0이 되지는 않지만, 그 floor 처리가
  // 일어나기 전 원래 판정(hp <= finalDmg)은 여전히 "실제 챔피언이었다면
  // 죽었을 타격"과 정확히 동일하다. 새 피해 계산을 따로 만들지 않고 이미
  // 계산된 finalDmg를 그대로 판정에 재사용한다. applyDamage() 하나가
  // 모든 스킬의 공통 진입점이므로, 이 판정 하나만 추가하면 지금까지
  // 만든 모든 챔피언의 모든 스킬에 자동으로 처형 감지가 적용된다(개별
  // 스킬 코드를 하나도 건드릴 필요 없음).
  if (target.hp > 0 && target.hp <= finalDmg) {
    markExecute(target, finalDmg);
    // 아리 패시브(정기 흡수) 챔피언 처치 관여 heal + R(혼령 질주) 처치 관여
    // 재사용 횟수 회복 - 이 뷰어의 학습용 더미는 damageEnemy()에서 2% 바닥에
    // 멈춰 실제로 hp<=0이 되지는 않으므로, "죽었어야 할 타격"을 이미 판정해둔
    // 이 지점(처형 판정)을 그대로 재사용해 챔피언 처치 관여로 취급한다.
    if (result.source && result.source.championId === 'ahri' && typeof result.source._ahriOnChampionTakedown === 'function') {
      result.source._ahriOnChampionTakedown(target);
    }
    // 암흑의 인장(영광) - 챔피언 처치 관여 시 중첩 획득. 위 아리 패시브와
    // 동일한 이유로 이 처형 판정 지점을 "챔피언 처치"로 재사용한다.
    if (dmgSource && typeof itemOnChampionTakedown === 'function') itemOnChampionTakedown(dmgSource);
  }
  // 피해 출처 메타(스킬/평타/도트 틱) - 무효화(주문 방어막)처럼 "스킬만"
  // 반응해야 하는 피격 효과가 쓰도록 takeDamage()에 그대로 넘긴다.
  if (typeof target.takeDamage === 'function') target.takeDamage(finalDmg, result.source || null, result.damageType || DAMAGE_TYPE.PHYSICAL, { isBasicAttack: !!result.isBasicAttack, isStatusTick: !!result.isStatusTick, isItemEffect: !!result.isItemEffect, isAbility: result.isAbility });
  else damageEnemy(target, finalDmg, result);
  return finalDmg;
}
// 처형 판정 시 콘솔 로그 + 화면 시각 효과(네임플레이트 붉은 섬광). 새
// UI 시스템을 만들지 않고 기존 labelDiv에 CSS 클래스만 잠깐 붙인다.
function markExecute(target, dmg) {
  console.log(`[EXECUTE] ${unitLabel(target)} 처형 판정 - 피해량 ${dmg.toFixed(1)} (남은 체력 ${Math.max(0, target.hp).toFixed(1)} 이하)`);
  if (target.labelDiv) {
    target.labelDiv.classList.add('executeFlash');
    setTimeout(() => { if (target.labelDiv) target.labelDiv.classList.remove('executeFlash'); }, 600);
  }
}
// 처형 가능 구간(요청): 대상 체력이 낮아 "지금 큰 스킬 한 방이면 죽는다"는
// 것을 화면에서 미리 확인할 수 있게, 일반적인 LoL 처형기 발동 구간(약
// 20~25%)에 맞춰 HP 바 위에 기준선을 표시한다. 실제 판정에 쓰이는 값이
// 아니라 순수 시각적 보조선이다(요청 12/13과 동일한 원칙 - 새 판정을
// 만들지 않고 기존 hp/maxHp만 읽어서 그린다).
const EXECUTE_ZONE_PERCENT = 25;

