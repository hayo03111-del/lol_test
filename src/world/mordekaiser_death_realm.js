/* ============================================================
   MORDEKAISER R - 죽음의 세계(Death Realm) 공간 분리
   ------------------------------------------------------------
   기존 스탯 훔치기 상태 머신(_morde.isInDeathRealm/rTarget/rEndsAt 등,
   CharacterController._mordeROnHit/_mordeEndDeathRealm/_mordeUpdateR
   참고)은 그대로 재사용한다 - 이번에 추가하는 건 그 위에 얹는 "실제
   공간 분리" 레이어뿐이다.

   구현 방식: 완전히 별도인 THREE.Scene/렌더 파이프라인을 새로 만들지는
   않았다(그러려면 이 프로젝트의 렌더러 구조 자체를 다중 씬/다중 카메라로
   바꿔야 하는 훨씬 큰 작업이라 이번 범위 밖 - 게임로직 TODO). 대신:
   1) 메인 필드와 지리적으로 멀리 떨어진 실제 지형(둥근 검붉은 단상 +
      경계 링 + 조명 - 진짜 geometry, "화면 필터"가 아님)을 씬에 만든다.
   2) 참가자(모데카이저/대상)에게 realmId를 태그하고, canRealmInteract()
      하나로 "서로 다른 세계인가"를 판정한다.
   3) 기존의 모든 상호작용 진입점(적 목록 조회/포탑 타겟팅/더미 반격/
      이동 명령)이 이 태그 하나만 확인하도록 딱 필요한 지점만 확장한다 -
      새 전투 시스템을 중복으로 만들지 않는다(명세 21절과 동일한 원칙).
   ============================================================ */
const DEATH_REALM_CENTER = new THREE.Vector3(BASE_UNIT * 60, 0, BASE_UNIT * 60);
const DEATH_REALM_BOUNDARY_RADIUS = BASE_UNIT * 11; // 명세 7절 "너무 좁지 않게" - 평타/스킬/추격/회피가 정상적으로 가능한 크기
const DEATH_REALM_SPAWN_OFFSET = BASE_UNIT * 4;     // 명세 13절 "겹치지 않되 바로 싸울 수 있는 거리"
let _mordeRealmCounter = 0;

// 명세 24절 "attacker.isInDeathRealm / target.isInDeathRealm을 확인 -
// 둘 중 하나만 죽음의 세계에 있으면 공격 불가, 둘 다 같은 죽음의 세계면
// 공격 가능": realmId가 없는 유닛(대부분의 기존 유닛)은 전부 암묵적으로
// 'main'(메인 월드)에 있는 것으로 취급한다 - 기존 유닛에 새 필드를
// 강제로 추가하지 않아도 안전하게 동작한다.
function canRealmInteract(a, b) {
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

// 명세 5/30절 "실제 공간처럼 보여야 한다 / 단순 화면 필터 금지" - 실제
// geometry로 된 단상+경계 링+조명. 매 R 캐스트마다 새로 만들지 않고
// 씬 로드 시 한 번만 만들어서 재사용한다(요청 21과 동일한 재사용 원칙).
let deathRealmGroup = null;
function ensureDeathRealmScenery() {
  if (deathRealmGroup) return;
  deathRealmGroup = new THREE.Group();
  const platformGeo = new THREE.CylinderGeometry(DEATH_REALM_BOUNDARY_RADIUS, DEATH_REALM_BOUNDARY_RADIUS * 1.05, 0.4, 48);
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 0.9, emissive: 0x330000, emissiveIntensity: 0.15 });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.y = -0.2;
  platform.receiveShadow = true;
  deathRealmGroup.add(platform);
  const ringGeo = new THREE.TorusGeometry(DEATH_REALM_BOUNDARY_RADIUS, 0.15, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, emissive: 0xaa2020, emissiveIntensity: 0.8, roughness: 0.4 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  deathRealmGroup.add(ring);
  const light = new THREE.PointLight(0xff2222, 1.2, DEATH_REALM_BOUNDARY_RADIUS * 3, 2);
  light.position.set(0, BASE_UNIT * 4, 0);
  deathRealmGroup.add(light);
  deathRealmGroup.position.copy(DEATH_REALM_CENTER);
  scene.add(deathRealmGroup);
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
  scene.fog = new THREE.FogExp2(0x1a0505, 0.045);
}
function deactivateDeathRealmAtmosphere() {
  _deathRealmActiveCount = Math.max(0, _deathRealmActiveCount - 1);
  if (_deathRealmActiveCount > 0) return;
  scene.fog = _deathRealmOriginalFog;
}
// 명세 21절 "복귀 위치에 다른 유닛/장애물이 있으면 겹치지 않는 안전한
// 위치로" - 후보 유닛들과 최소 간격을 확인하고, 겹치면 그 유닛에서
// 멀어지는 방향으로 살짝 밀어낸다. 유닛 수가 적은 이 데모 규모에 맞춘
// 간단한 버전이다(반복 8회면 충분히 수렴).
function findSafeReturnPosition(pos, mover) {
  let result = pos.clone();
  const minGap = 0.1;
  for (let attempt = 0; attempt < 8; attempt++) {
    let collided = false;
    const others = [
      ...(typeof controller !== 'undefined' && controller && controller !== mover ? [controller] : []),
      ...getAllEnemyUnits().filter((u) => u !== mover),
    ];
    for (const other of others) {
      const otherPos = getWorldPosition(other);
      if (!otherPos) continue;
      const gap = getCollisionRadius(mover) + getCollisionRadius(other) + minGap;
      const dist = getHorizontalDistance(result, otherPos);
      if (dist < gap) {
        const dir = new THREE.Vector3().subVectors(result, otherPos); dir.y = 0;
        if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0); else dir.normalize();
        result = otherPos.clone().addScaledVector(dir, gap + 0.1);
        collided = true;
      }
    }
    if (!collided) break;
  }
  return result;
}

