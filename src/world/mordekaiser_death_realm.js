/* ============================================================
   MORDEKAISER R - 죽음의 세계(Death Realm) 공간 분리
   ------------------------------------------------------------
   기존 스탯 훔치기 상태 머신(_morde.isInDeathRealm/rTarget/rEndsAt 등,
   CharacterController._mordeROnHit/_mordeEndDeathRealm/_mordeUpdateR
   참고)은 그대로 재사용한다 - 이번에 추가하는 건 그 위에 얹는 "실제
   공간 분리" 레이어뿐이다.

   구현 방식(원작 PC 위키 Realm of Death를 그대로 옮김):
   1) 두 챔피언은 제자리에 남고, 일반 맵 위에 반경 1200 원형 경기장이 생긴다(지형·수풀 그대로).
      경계는 통과할 수 없고 돌진·끌어당김도 경계에서 멈춘다. 끝나면 그 자리에서 일반 세계로 돌아온다.
   2) 참가자(모데카이저/대상)에게 realmId를 태그하고, canRealmInteract()
      하나로 "서로 다른 세계인가"를 판정한다.
   3) 기존의 모든 상호작용 진입점(적 목록 조회/포탑 타겟팅/더미 반격/
      이동 명령)이 이 태그 하나만 확인한다. 바깥 유닛은 위치만 보이는 반투명 혼령으로 그린다.
   ============================================================ */
// 원작(PC 위키 Realm of Death): 죽음의 세계는 다른 장소로 옮기는 게 아니라 "일반 맵 지형을 그대로 가진"
// 반경 1200 원형 경기장이다. 두 챔피언은 제자리에 남고, 경계는 통과할 수 없다.
const DEATH_REALM_RADIUS_LOL = 1200;
// 진행 중인 죽음의 세계: realmId -> { center(Vector3), radius(월드 단위) }
const _deathRealms = new Map();
let _mordeRealmCounter = 0;

// 명세 24절 "attacker.isInDeathRealm / target.isInDeathRealm을 확인 -
// 둘 중 하나만 죽음의 세계에 있으면 공격 불가, 둘 다 같은 죽음의 세계면
// 공격 가능": realmId가 없는 유닛(대부분의 기존 유닛)은 전부 암묵적으로
// 'main'(메인 월드)에 있는 것으로 취급한다 - 기존 유닛에 새 필드를
// 강제로 추가하지 않아도 안전하게 동작한다.
function canRealmInteract(a, b) {
  // PC 위키: 구조물(포탑·억제기·넥서스)은 모든 세계에 동시에 존재하고, 포탑은 모든 유닛이 같은 세계에 있는
  // 것처럼 정상 동작한다(Riot 기술 블로그의 "All Realms" 차원). 예전엔 죽음의 세계 안에서 포탑이 공격하지
  // 못하고 모데카이저도 구조물을 칠 수 없었다.
  if ((a && a.isStructure) || (b && b.isStructure)) return true;
  const ra = (a && a.realmId) || 'main';
  const rb = (b && b.realmId) || 'main';
  return ra === rb;
}

/* ============================================================
   PHASE 2-A. 통합 타겟팅 헬퍼
   (요청 문서 "1. Building Entity 통합" / "2. Targetable Entity 판정" /
   "4. Target Validation")
   ------------------------------------------------------------
   중요: 기존 챔피언 컨트롤러/더미/미니언/포탑/억제기/넥서스 객체의 필드
   이름은 전혀 바꾸지 않는다(요청: "이미 같은 의미의 필드가 존재한다면
   이름을 바꾸지 말고 기존 필드를 사용"). 실제로 확인해보니 이미 전부
   isChampion/isMinion/isTurret/isInhibitor/isNexus/isStructure/
   isUntargetable/hp/maxHp/team을 갖고 있고, "죽음/파괴됨" 표현만 종류별로
   다르다(미니언=isDead, 포탑/넥서스/억제기=destroyed, 챔피언/더미=hp<=0).
   그래서 새 Entity 클래스나 필드 rename 대신, 그 필드들을 읽기만 하는
   순수 조회 헬퍼만 추가한다 - 새 Projectile/Targeting 코드에서만 쓰고
   기존 타겟팅 코드(getTurretAttackTarget/isValidMinionTarget 등)는 각자의
   우선순위 로직과 강하게 얽혀 있으므로 건드리지 않는다.
   ============================================================ */

// 이 객체가 전투 판정 대상이 될 수 있는 "종류"인지 - VFX/장식용 오브젝트와 구분.
function isCombatEntity(target) {
  return !!(target && (target.isChampion || target.isMinion || target.isTurret || target.isInhibitor || target.isNexus));
}
// 죽음/파괴 상태 통합 조회(요청 "기본 제외 대상: 죽은 유닛/destroyed
// 구조물/hp<=0"). 필드 이름은 그대로 두고 여기서만 하나로 묶어서 읽는다.
function isEntityRemoved(target) {
  if (!target) return true;
  if (target.isDead) return true;
  if (target.destroyed) return true;
  if (typeof target.hp === 'number' && target.hp <= 0) return true;
  return false;
}
function isAliveCombatEntity(target) { return isCombatEntity(target) && !isEntityRemoved(target); }
// isUntargetable(챔피언 무적/서라운드 프레임 등)까지 확인한 "지금 조준
// 가능한가". 우물(indestructible)은 완전히 별도 전투 시스템(updateNexusWell)
// 이라 이 판정 밖이다(요청 범위 밖 - 건드리지 않음).
function isTargetableCombatEntity(target) { return isAliveCombatEntity(target) && !target.isUntargetable; }
function getEntityTeam(target) { return target ? target.team : null; }
// getEntityPosition - 이미 존재하는 getWorldPosition()이 챔피언(.root.position)
// /더미·포탑·미니언(.mesh.position)/원시 좌표를 전부 통일해서 처리하고
// 있으므로 이름만 다른 새 함수를 중복 구현하지 않고 그대로 재노출한다.
const getEntityPosition = getWorldPosition;

// Target Validation(요청 문서 4) - source가 target을 조준할 수 있는지
// {ok, reason}으로 반환한다. 새로 추가되는 Projectile 시스템 전용이며,
// 기존 개별 시스템(isValidTurretTarget/isValidMinionTarget/
// getTurretAttackTarget 등의 우선순위 로직)을 대체하지 않는다.
// options.range를 주면 사거리도 함께 검사한다(월드 단위, 대상
// collisionRadius가 이미 반영된 getEffectiveDistance 기준).
function canTarget(source, target, options = {}) {
  if (!source) return { ok: false, reason: 'NO SOURCE' };
  if (!target) return { ok: false, reason: 'NO TARGET' };
  if (source === target) return { ok: false, reason: 'SELF' };
  if (!isCombatEntity(target)) return { ok: false, reason: 'NOT COMBAT ENTITY' };
  if (isEntityRemoved(target)) return { ok: false, reason: 'DEAD' };
  if (target.isUntargetable) return { ok: false, reason: 'UNTARGETABLE' };
  const st = getEntityTeam(source), tt = getEntityTeam(target);
  if (st && tt && st === tt && !options.allowSameTeam) return { ok: false, reason: 'SAME TEAM' };
  if (!canRealmInteract(source, target)) return { ok: false, reason: 'DIFFERENT REALM' };
  if (options.range != null && getEffectiveDistance(source, target) > options.range) return { ok: false, reason: 'OUT OF RANGE' };
  // 요청 "가능하면 debug mode에서 실패 이유를 확인할 수 있도록" - 매 프레임
  // 자동 호출되는 경로(예: 매 프레임 타겟 재검증)에서 이 함수를 쓰면 실패
  // 시마다 로그가 쏟아질 수 있으므로, 호출부가 명시적으로 label을 넘겼을
  // 때만 로그를 남긴다(기본은 무음 - 요청 20 "매 프레임 console.log 금지").
  return { ok: true, reason: null };
}
function debugCanTargetResult(label, result) {
  if (!result.ok) console.log(`TARGET INVALID: ${result.reason}`, label || '');
  return result;
}

// 경기장 경계 표시: 중심에 반경 1200 붉은 고리 하나(원작의 경계 테두리). 맵 자체가 경기장 바닥이므로
// 따로 단상을 만들지 않는다. 죽음의 세계가 끝나면 씬에서 빼서 남지 않게 한다.
let deathRealmRing = null;
function showDeathRealmBoundary(center, radius) {
  if (!deathRealmRing) {
    const geo = new THREE.RingGeometry(radius - BASE_UNIT * 0.06, radius, 96);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc02a2a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, fog: false });
    deathRealmRing = new THREE.Mesh(geo, mat);
    deathRealmRing.rotation.x = -Math.PI / 2;
    deathRealmRing.userData.radius = radius;
  }
  deathRealmRing.position.set(center.x, 0.03, center.z);
  if (!deathRealmRing.parent) scene.add(deathRealmRing);
}
function hideDeathRealmBoundary() {
  if (deathRealmRing && deathRealmRing.parent) deathRealmRing.parent.remove(deathRealmRing);
}
// 경기장 등록/조회. 중심: PC 위키에는 중심 서술이 없다 - 나무위키(커뮤니티)의 "대상 방향으로 궁극기
// 최대 사거리(650) 지점을 중심으로 반경 1200"을 따른다(위키 공략의 "모데카이저 앞쪽에 생겨 뒤로는 공간이
// 적다"와도 맞는다).
function createDeathRealm(realmId, caster, target, castRangeLol, radiusLol) {
  const from = getWorldPosition(caster).clone(); from.y = 0;
  const to = getWorldPosition(target).clone(); to.y = 0;
  const dir = new THREE.Vector3().subVectors(to, from);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); else dir.normalize();
  const center = from.clone().addScaledVector(dir, lolRangeToWorld(castRangeLol || 650));
  const realm = { center, radius: lolRangeToWorld(radiusLol || DEATH_REALM_RADIUS_LOL) };
  _deathRealms.set(realmId, realm);
  return realm;
}
function getDeathRealm(realmId) { return realmId && realmId !== 'main' ? (_deathRealms.get(realmId) || null) : null; }
function removeDeathRealm(realmId) { _deathRealms.delete(realmId); }
// 경계 밖 좌표를 경계 안쪽으로 되돌린다(유닛 충돌 반경만큼 안쪽). 원작: 경계는 지형이 아니지만 통과할
// 수 없고, 돌진·점멸·에어본 이동도 경계에서 멈춘다.
// 강제 이동(넉백·끌어당김·매혹·공포)한 위치를 지형(맵 경계)과 죽음의 세계 경계 안으로 되돌린다.
// PC 위키: 강제 이동은 지형을 통과하지 못하고, 죽음의 세계 경계에서도 멈춘다. realm을 넘기면 그 경계를 쓴다
// (경계 안에서 시작한 넉백은 죽음의 세계가 끝난 뒤에도 그 경계에서 멈춘다 - PC 위키).
function constrainUnitPosition(unit, pos, realm = null) {
  if (!pos) return pos;
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && typeof howlingAbyssMap.clampPosition === 'function') howlingAbyssMap.clampPosition(pos);
  const r = realm || getDeathRealm(unit && unit.realmId);
  if (r) clampToDeathRealm(pos, r, typeof getCollisionRadius === 'function' ? getCollisionRadius(unit) : 0);
  return pos;
}
function clampToDeathRealm(point, realm, margin = 0) {
  if (!realm) return point;
  const rel = new THREE.Vector3(point.x - realm.center.x, 0, point.z - realm.center.z);
  const max = Math.max(0, realm.radius - margin);
  if (rel.length() <= max) return point;
  rel.setLength(max);
  point.x = realm.center.x + rel.x; point.z = realm.center.z + rel.z;
  return point;
}
// 바깥 유닛은 "위치는 보이지만 서로 보거나 상호작용할 수 없다"(PC 위키) - 반투명 혼령으로 그린다.
// 재질을 공유하는 유닛이 있을 수 있어 메시마다 재질을 복제해 바꾸고, 끝나면 원래 재질로 되돌린다.
const _deathRealmGhosted = new Map(); // mesh -> 원래 material
function ghostUnitForDeathRealm(unit) {
  const root = unit && (unit.mesh || unit.root);
  if (!root || root.userData._deathRealmGhost) return;
  root.userData._deathRealmGhost = true;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || _deathRealmGhosted.has(o)) return;
    const orig = o.material;
    const mk = (m) => { const c = m.clone(); c.transparent = true; c.opacity = Math.min(c.opacity ?? 1, 0.28); c.depthWrite = false; return c; };
    _deathRealmGhosted.set(o, orig);
    o.material = Array.isArray(orig) ? orig.map(mk) : mk(orig);
  });
  _deathRealmGhosted.set(root, null); // 루트 표식(복원 시 userData 정리용)
}
function clearDeathRealmGhosts() {
  for (const [o, orig] of _deathRealmGhosted) {
    if (orig === null) { delete o.userData._deathRealmGhost; continue; }
    const cur = o.material;
    (Array.isArray(cur) ? cur : [cur]).forEach((m) => m && m.dispose && m.dispose());
    o.material = orig;
  }
  _deathRealmGhosted.clear();
}
// 명세 12/29절 "죽음의 세계 진입 시 어둡고 붉은 안개/단절된 분위기" -
// 기존 scene.fog를 저장해뒀다가 죽음의 세계가 전부 끝나면 원래 값으로
// 되돌린다(카운터로 관리 - R이 겹쳐도 마지막 하나가 끝날 때만 복원).
let _deathRealmOriginalFog;
let _deathRealmActiveCount = 0;
function activateDeathRealmAtmosphere() {
  _deathRealmActiveCount++;
  if (_deathRealmActiveCount > 1) return;
  _deathRealmOriginalFog = scene.fog;
  // 제자리 경기장이라 맵과 두 챔피언이 보여야 한다 - 카메라 거리에서 약 30%만 붉게 어두워지는 밀도로 맞춘다
  // (FogExp2: 1 - exp(-(밀도×거리)²) = 0.3 → 밀도 ≈ 0.6 / 거리). 예전 별도 경기장용 0.045는 화면이 거의 검게 덮였다.
  const camDist = (typeof camera !== 'undefined' && camera && typeof controller !== 'undefined' && controller) ? camera.position.distanceTo(controller.root.position) : 0;
  scene.fog = new THREE.FogExp2(0x2a0b0e, camDist > 0 ? 0.6 / camDist : 0.02);
}
function deactivateDeathRealmAtmosphere() {
  _deathRealmActiveCount = Math.max(0, _deathRealmActiveCount - 1);
  if (_deathRealmActiveCount > 0) return;
  scene.fog = _deathRealmOriginalFog;
}

