/* ============================================================
   0-A0X2. 논타겟 스킬 공통 Hit Detection (Skill Shot / Self-centered Area)
   ------------------------------------------------------------
   버그: 다리우스 Q(자기중심 범위)/E(직선 스킬샷), 가렌 E(자기중심 채널)
   같은 논타겟 스킬들이 실제 좌표 판정 대신 "지금 currentTarget으로 잠긴
   적이 있는가"만 확인하고 있었다. 그 결과 (1) 조준이 완전히 빗나가도
   currentTarget이 남아있으면 피해가 들어가고, (2) 애초에 타겟을 클릭해
   고정한 적이 없으면(논타겟 스킬은 원래 그럴 필요가 없다) 실제로 맞았어도
   피해가 전혀 들어가지 않았다. 아래 함수들은 실제 위치 기반으로 적중
   대상을 찾기만 하고, 피해 계산 자체는 그대로 기존 DamageSystem
   (calculateDamage/applyDamage)에 위임한다 - 새 데미지 계산을 만들지 않는다.
   ============================================================ */
// 이 데모의 적 목록. 지금은 단일 더미 하나뿐이지만, 이후 다중 대상을
// 추가할 때 이 배열에만 추가하면 아래 findEnemies*()가 전부 그대로 동작한다.
function getAllEnemyUnits() {
  // 버그 수정(모데카이저 R "죽음의 세계" 명세 9/24절 - "R 대상 이외의 일반
  // 적이 전투에 영향을 주면 안 된다 / 외부 적의 피해가 R 내부 전투에
  // 적용되면 안 된다"): 이 뷰어는 캐릭터를 한 번에 하나만 조작하는
  // 싱글플레이 구조라, "전투 공간을 물리적으로 분리하는" 대신(그러려면
  // 별도 아레나 씬/카메라 시스템이 필요해 이번 범위 밖 - 게임로직 TODO)
  // 모든 논타겟 판정(findEnemiesInRadius/findFirstInLine/평타 등)이 공통으로
  // 거치는 이 함수 한 곳에서 "지금 조작 중인 챔피언이 죽음의 세계 안이면
  // 적 목록을 R 대상 하나로만 좁힌다"로 동일한 효과를 낸다 - 개별 스킬마다
  // 격리 로직을 따로 넣지 않고 이 공용 진입점 하나만 수정해서 Q/E/평타
  // 전부에 자동으로 적용되게 한다(요청 21 "같은 기능의 새 시스템을 중복으로
  // 만들지 마라"와 일치). 모데카이저가 아니거나 죽음의 세계 상태가 아니면
  // 기존 동작 그대로다 - 다른 챔피언에는 전혀 영향 없음.
  if (typeof controller !== 'undefined' && controller && controller.championId === 'mordekaiser'
      && controller._morde && controller._morde.isInDeathRealm) {
    const t = controller._morde.rTarget;
    return (t && t.hp > 0) ? [t] : [];
  }
  const list = [];
  if (typeof dummy !== 'undefined' && dummy && dummy.hp > 0) list.push(dummy);
  // 요청: 사용자가 직접 설치한 허수아비들. 이 배열 하나에만 추가하면
  // findEnemiesInRadius/findFirstInLine/기본 공격 등 이 함수를 쓰는 모든
  // 판정이 자동으로 다중 대상을 인식한다(별도 판정 로직을 새로 만들지 않음).
  // (더미는 team===ENEMY_TEAM이라 항상 플레이어의 적이지만, 위 두 push는
  // team이 없던 시절부터의 기존 무조건 포함 로직을 그대로 유지한다 -
  // 아래 구조물/미니언처럼 team 비교로 걸러도 결과는 똑같다.)
  if (typeof placedDummies !== 'undefined') {
    for (const d of placedDummies) if (d && d.hp > 0) list.push(d);
  }
  // 아군/적군/플레이어 시스템 - 챔피언(플레이어)의 기본 공격/스킬(범위/
  // 직선/AOE 전부 이 함수 하나를 공용으로 거친다)에 적 진영 미니언/포탑/
  // 억제기/넥서스를 포함시킨다. 예전에는 "항상 RED와만 적대한다"는 가정을
  // 문자열 리터럴 'RED'로 하드코딩했지만, 이제 플레이어 자신의 `.team`
  // (PLAYER_TEAM)과 generic하게 비교한다(isEnemyUnit과 동일한 "team이
  // 다르면 적" 원칙 - 00_global_constants.js) - controller가 아직 없으면
  // (챔피언 로드 전) PLAYER_TEAM으로 폴백해 기존
  // 동작을 그대로 유지한다. 아군(같은 팀) 미니언/구조물은 애초에 후보에
  // 들어가지 않으므로 "아군은 공격 불가"(요청 20-B) 요구가 자동으로
  // 만족된다. 새 탐색 시스템을 만들지 않고 기존 findEnemiesInRadius/
  // findFirstInLine이 전부 이 함수만 거치는 구조를 그대로 재사용한다(요청 20-C).
  const myTeam = (typeof controller !== 'undefined' && controller && controller.team) || PLAYER_TEAM;
  if (typeof turrets !== 'undefined') {
    for (const t of turrets) if (t.team && t.team !== myTeam && !t.destroyed && !t.isUntargetable) list.push(t);
  }
  if (typeof inhibitorBuildings !== 'undefined') {
    for (const i of inhibitorBuildings) if (i.team && i.team !== myTeam && !i.destroyed) list.push(i);
  }
  if (typeof nexusBuildings !== 'undefined') {
    for (const n of nexusBuildings) if (n.team && n.team !== myTeam && !n.destroyed) list.push(n);
  }
  if (typeof minions !== 'undefined') {
    for (const m of minions) if (m.team && m.team !== myTeam && !m.isDead) list.push(m);
  }
  return list;
}
// 시야 시스템(vision_system.js) 연동 - "실제로 보이는" 적만 타게팅/
// 클릭/논타겟 스킬 판정 대상으로 쓴다. getAllEnemyUnits() 자체는 건드리지
// 않는다(VisionSystem.update()가 "누가 보여야 하는가"를 판정할 때
// getAllEnemyUnits()의 원본(가공 전) 목록을 그대로 써야 하므로 - 이미
// 걸러진 목록을 입력으로 받으면 한 번 시야 밖으로 나간 유닛은 다시 시야
// 안에 들어와도 영원히 걸러져 나오지 못하는 순환 참조 버그가 생긴다).
// 대신 이 함수 하나를 "플레이어가 실제로 타게팅할 수 있는 적" 전용
// 진입점으로 따로 두고, 아래 findEnemiesInRadius/findFirstInLine과
// global_system_instances.js의 클릭 타게팅(getEnemyHit)만 이 함수를
// 쓴다 - 그 외 챔피언 전용 커스텀 로직(바루스 R 확산, 아리 매혹 우선순위
// 탐색, 이즈리얼 R 관통 등)은 각자 getAllEnemyUnits()를 직접 쓰므로 이번
// 시야 시스템 추가 범위에는 포함되지 않는다(명시적 한계 - README 참고).
function getTargetableEnemyUnits() {
  const all = getAllEnemyUnits();
  if (typeof visionSystem === 'undefined' || !visionSystem || !visionSystem.enabled) return all;
  return all.filter((u) => visionSystem.isVisible(u));
}
// 자기중심 범위(Self-centered Area) 판정 - 다리우스 Q, 가렌 E 등.
// forward/maxAngleDeg를 주면 부채꼴(정면 기준 각도 제한)로도 쓸 수 있다.
// (Range/Distance 시스템의 isInCircle/isInCone 위에서 동작 - 판정 로직
// 자체는 그쪽 한 곳에만 존재하고, 여기는 "모든 적 중 걸리는 것들을
// 모아서 반환"하는 편의 래퍼다.)
function findEnemiesInRadius(center, lolRadius, { forward = null, maxAngleDeg = null } = {}) {
  const radius = lolRangeToWorld(lolRadius); // 버그 수정: 지금까지 LoL 원본 반경(예: 900)을 그대로 world 반경으로 썼다
  const hits = [];
  for (const u of getTargetableEnemyUnits()) {
    const inShape = (forward && maxAngleDeg != null) ? isInCone(u, center, forward, radius, maxAngleDeg) : isInCircle(u, center, radius);
    if (!inShape) continue;
    hits.push({ unit: u, distance: getHorizontalDistance(getWorldPosition(u), center) });
  }
  return hits;
}
// 직선형 스킬샷(Skill Shot) 판정 - 다리우스 E 등. origin에서 range까지
// 뻗은 선분에 대해, 대상 원이 폭(halfWidth) 이내로 스치면서 가장 먼저
// (가까운) 걸리는 대상 하나를 찾는다. Collision Radius는 getCollisionRadius()로
// 통일해서 읽는다(허수아비 크기를 키워도 자동 반영). range는 LoL 원본
// 사거리, halfWidth는 이미 world 단위의 판정 폭(스킬 데이터가 아니라 이
// 엔진이 정한 시각적 두께이므로 변환하지 않는다).
function findFirstInLine(origin, dir, lolRange, halfWidth) {
  const range = lolRangeToWorld(lolRange); // 버그 수정: LoL 원본 사거리를 그대로 world 거리로 썼다
  let best = null;
  for (const u of getTargetableEnemyUnits()) {
    const p = getWorldPosition(u);
    const r = getCollisionRadius(u);
    const toTarget = new THREE.Vector3(p.x - origin.x, 0, p.z - origin.z);
    const along = toTarget.dot(dir); // 진행 방향으로의 투영 거리
    if (along < -r || along > range + r) continue; // 사거리 밖
    const lateralSq = Math.max(0, toTarget.lengthSq() - along * along);
    if (Math.sqrt(lateralSq) > halfWidth + r) continue; // 선폭 밖
    if (!best || along < best.along) best = { unit: u, along };
  }
  return best ? best.unit : null;
}
function debugSkillHit(label, unit, extra) {
  console.log(`[SKILL HIT] ${label}`, extra || '', unit);
}
function debugSkillMiss(label, reason) {
  console.log(`[SKILL MISS] ${label} - ${reason}`);
  showSkillToast(`${label}: ${reason}`);
}
// 콘솔을 안 열어봐도 "왜 스킬이 안 나가는지" 화면에서 바로 보이도록 하는
// 토스트. [SKILL BLOCKED]/[SKILL MISS] 두 종류 모두 여기로 모은다.
function showSkillToast(message) {
  const el = document.getElementById('skillToast');
  if (!el) return;
  const msg = document.createElement('div');
  msg.className = 'toastMsg';
  msg.textContent = message;
  el.appendChild(msg);
  setTimeout(() => msg.remove(), 1700);
  while (el.children.length > 3) el.removeChild(el.firstChild); // 화면이 로그로 뒤덮이지 않게 최근 3개만 유지
}
function isSilenced(target) { return hasStatus(target, 'SILENCE'); }
// 요청(CC 시스템 확장): KNOCKUP(에어본)/SUPPRESSION(제압)도 STUN/ROOT와
// 동일하게 이동/공격/스킬을 막는 CC다 - 이 함수 하나에서 전부 인식하면
// moveTo/castAbility/_tryEngageTarget 등 이 함수를 참조하는 모든 곳에
// 자동으로 반영된다(호출부를 일일이 고칠 필요 없음).
function isStunned(target) {
  return hasStatus(target, 'STUN') || hasStatus(target, 'ROOT') || hasStatus(target, 'KNOCKUP') || hasStatus(target, 'SUPPRESSION') || hasStatus(target, 'CHARM');
}
// CC(기절/속박류)로 이동/행동이 실제로 막히는지 - 사용처: moveTo/castAbility/_tryEngageTarget
function isCrowdControlled(target) { return isStunned(target); }
// 매 프레임 상태이상을 갱신(DOT 틱 적용 + 만료 제거)
function tickStatusEffects(target, dt) {
  if (!target || !target.statusEffects || !target.statusEffects.length) return;
  const now = performance.now();
  for (const e of target.statusEffects) {
    if (e.type === 'DOT') {
      const tickInterval = e.tickInterval || 1.0;
      const totalTicks = Math.max(1, Math.round(e.duration / tickInterval));
      e._ticksFired = e._ticksFired || 0;
      e._tickAccum = (e._tickAccum || 0) + dt;
      // 총 예정 틱 수(totalTicks)를 기준으로 카운트해서, 프레임 타이밍이
      // 만료 시각과 정확히 겹치는 경계 케이스에도 마지막 틱이 누락되지
      // 않게 한다(지속시간/실시간 오차에 안전).
      while (e._tickAccum >= tickInterval - 1e-6 && e._ticksFired < totalTicks) {
        e._tickAccum -= tickInterval;
        e._ticksFired += 1;
        const perTick = e.totalDamage / totalTicks;
        if (target.hp > 0) applyDamage(target, { rawDamage: perTick, damageType: e.damageType || DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isStatusTick: true });
      }
    }
  }
  // 아리 E(매혹) - 매혹된 대상은 지속시간 동안 시전자 쪽으로 걸어간다(공식
  // 설명 "매혹된 적은 아리 쪽으로 이동"). 상태이상 레코드에 담긴 source(캐스트
  // 시점의 아리 CharacterController)를 향해 대상의 실제 좌표를 매 프레임
  // 이동시킨다 - KNOCKUP이 target._yasuoAirborne로 Y좌표를 직접 갱신하는 것과
  // 동일한 방식으로 XZ좌표를 직접 갱신한다(새 이동 시스템을 만들지 않음).
  // 이 뷰어의 "적"은 전부 더미/미니언(mesh.position만 있음)이라 target.mesh만
  // 확인하면 충분하다 - 실제 플레이어 챔피언은 아리의 대상이 될 수 없다.
  for (const e of target.statusEffects) {
    if (e.type !== 'CHARM' || e.expiresAt <= now || !e.source || !target.mesh?.position) continue;
    const srcPos = getWorldPosition(e.source);
    if (!srcPos) continue;
    const toSrc = new THREE.Vector3(srcPos.x - target.mesh.position.x, 0, srcPos.z - target.mesh.position.z);
    const dist = toSrc.length();
    const stopDistance = (getCollisionRadius(target) + getCollisionRadius(e.source)) * 0.8;
    if (dist > stopDistance) {
      // 버그 수정(요청 "매혹 걸렸을 때 다가오는 속도 좀 느리게") - 기존
      // 0.8배(평범한 이동속도에 가까움)는 "홀린 듯 천천히 다가온다"는
      // 공식 설명의 느낌과 맞지 않았다. 확 느린 속도로 낮췄다.
      const walkSpeed = MOVE_SPEED * 0.35;
      toSrc.multiplyScalar(1 / dist);
      target.mesh.position.addScaledVector(toSrc, Math.min(dist - stopDistance, walkSpeed * dt));
    }
  }
  if (target._yasuoAirborne && target.mesh?.position) {
    const a = target._yasuoAirborne;
    a.elapsed += dt;
    const t = Math.min(1, a.elapsed / a.duration);
    // 상승 → 정점 → 하강의 간단한 포물선. 더미도 실제 월드 Y좌표가 움직이므로
    // KNOCKUP이 화면에서 보이는 에어본으로 동작한다.
    // 버그 수정(요청 - "궁 맞는 적이 야스오와 같은 높이에 떠있다가 끝날 때
    // 쾅 떨어져야 함"): a.hold가 켜져 있으면(현재 야스오 R 전용) 일반
    // 포물선(오르락내리락) 대신 지속시간 내내 높이를 고정한다 - 새 CC
    // 시스템을 만들지 않고 기존 _yasuoAirborne 파라미터에 옵션 필드 하나만
    // 추가했다. 지속시간이 끝나는 순간에는 기존 로직 그대로 baseY로 즉시
    // 스냅(=쾅 떨어짐)한다.
    const arc = a.hold ? 1 : 4 * t * (1 - t);
    target.mesh.position.y = a.baseY + a.height * arc;
    if (t >= 1) { target.mesh.position.y = a.baseY; target._yasuoAirborne = null; }
  }
  const before = target.statusEffects;
  target.statusEffects = before.filter((e) => e.expiresAt > now);
  if (target.statusEffects.length !== before.length) {
    for (const e of before) {
      if (e.expiresAt <= now && CC_TYPES.has(e.type)) { console.log(`[CC END]\nTarget: ${unitLabel(target)}\nType: ${e.type}`); if (e.type === 'KNOCKUP' && target._yasuoAirborne && target.mesh?.position) { target.mesh.position.y = target._yasuoAirborne.baseY; target._yasuoAirborne = null; } }
    }
    refreshUnitCcTags(target);
  }
}

// 요청 14: 화면에서도 더미(및 플레이어)의 CC 상태를 바로 확인할 수 있게
// "[STUN 1.3s]" 같은 태그를 붙인다. 더미는 nameplate 라벨에, 플레이어는
// stateLabel 옆에 붙인다.
// 버그 수정: 예전엔 target === dummy(단일 기본 더미)일 때만 태그를
// 갱신했다 - 이후 추가된 "허수아비 설치" 기능으로 생긴 placedDummies는
// labelDiv가 있어도 CC 표시가 전혀 갱신되지 않았다. target이 dummy이든
// 설치된 더미든 labelDiv만 있으면 동일하게 처리하도록 일반화한다(세트 E
// 양쪽 판정 테스트는 더미 2개 이상이 필요해서 이 버그가 특히 중요하다).
function refreshUnitCcTags(target) {
  const now = performance.now();
  const tags = (target.statusEffects || [])
    .filter((e) => CC_TYPES.has(e.type) && e.expiresAt > now)
    .map((e) => `[${e.type} ${((e.expiresAt - now) / 1000).toFixed(1)}s]`)
    .join(' ');
  if (target && target.labelDiv) {
    let tagEl = target.labelDiv.querySelector('.ccTags');
    if (!tagEl) { tagEl = document.createElement('div'); tagEl.className = 'ccTags'; target.labelDiv.appendChild(tagEl); }
    tagEl.textContent = tags;
  }
}

