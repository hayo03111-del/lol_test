/* ============================================================
   3. DUMMY ENEMY (챔피언과 독립적인 월드 오브젝트)
   ============================================================ */
function createDummyEnemy(position) {
  // 요청: 허수아비를 눈에 띄게 크게(기존 대비 약 1.75배) 만들되, Visual과
  // Hitbox가 절대 따로 놀지 않게 한다. dummyHeight/bodyRadius 두 값만
  // 바꾸면 body(CapsuleGeometry), label/HP바 위치(dummyHeight 기준),
  // radius(사거리/논타겟 스킬 Hit Detection이 참조하는 실제 판정 반경)가
  // 전부 이 값에서 파생되므로 Mesh만 커지고 판정은 그대로인 문제가 생기지
  // 않는다(findEnemiesInRadius/findFirstInLine/isInAttackRange 전부
  // enemy.radius를 그대로 사용).
  const DUMMY_SCALE = 1.75;
  const dummyHeight = BASE_UNIT * 1.1 * DUMMY_SCALE;
  const bodyRadius = lolRangeToWorld(65); // 25차: 원작 허수아비 판정 반경 65(PC 위키 - 대부분의 챔피언과 같음). 예전 0.24×1.75 월드 = 약 49 LoL 유닛
  const bodyLength = Math.max(0.1, dummyHeight - bodyRadius * 2);
  const group = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(bodyRadius, bodyLength, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color:0x8a3b3b, roughness:0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = dummyHeight / 2;
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  group.position.copy(position);
  scene.add(group);
  group.add(createBlobShadow(bodyRadius * 2.2)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자

  const labelDiv = document.createElement('div');
  labelDiv.id = 'enemyLabel';
  labelDiv.className = 'champion'; // 요청("챔피언 체력바도 실제 롤 형식으로") - 미니언/포탑과 다른 챔피언 전용 스타일 적용
  labelDiv.innerHTML = `<div class="champName">더미 타겟</div><div class="hpBarOuter"><div class="hpBarInner"></div></div>`;
  const label = new CSS2DObject(labelDiv);
  label.position.set(0, dummyHeight + 0.15, 0); // 커진 키(dummyHeight)에 맞춰 자동으로 더 위로 올라감
  group.add(label);

  return {
    mesh: group, body, hp: 300, maxHp: 300, bonusHealth: 0, labelDiv, label, labelHeight: dummyHeight + 0.15,
    radius: bodyRadius,             // 요청 6: 사거리/논타겟 스킬 판정이 참조하는 실제 Hitbox 반경 - 커진 Mesh와 항상 일치
    // Range/Distance 시스템(요청 4): Visual Model ≠ Collision Shape를
    // 명시적으로 분리한 필드. bodyRadius(Mesh 크기)에서 그대로 파생시켜서
    // "커진 허수아비가 Hitbox도 같이 커진다"는 요구를 만족하되, 두 개념이
    // 항상 같은 값이어야 한다는 뜻은 아니므로 이후 필요하면 이 두 값만
    // 따로 조정할 수 있게 분리해뒀다.
    collisionRadius: bodyRadius, collisionHeight: dummyHeight, selectionRadius: bodyRadius * 1.3,
    armor: 30, magicResist: 30,     // 요청 15/16: applyDamage()가 참조하는 방어 스탯
    attackRange: BASE_UNIT * 1.3 * DUMMY_SCALE, attackCooldown: 0,
    attackDamage: 6, attackSpeed: 1 / 1.4, // 반격 피해·속도(예전 tickOneDummy의 고정값 6·1.4초) - 모데카이저 R이 10%를 훔칠 수 있게 필드로 둔다
    // 요청(전투 더미는 죽지 않되 CC는 정상 적용): isTrainingDummy만으로
    // Damage/Death를 분리한다. StatusEffect(CC) 시스템은 이 플래그를 전혀
    // 참조하지 않으므로 - 즉 아래 damageEnemy()가 "죽음 처리"만 건너뛰고,
    // applyStatus/tickStatusEffects(공용 CC 시스템)는 지금까지와 완전히
    // 동일하게 더미에도 그대로 적용된다.
    isTrainingDummy: true,
    // 요청(세트 R "적 챔피언 전용 잡기 스킬" - target.isChampion===true만
    // 유효): 이 데모의 유일한 상시 테스트 대상인 허수아비를 챔피언으로
    // 취급해야 R 같은 챔피언 전용 스킬을 테스트할 수 있다 - 몬스터/미니언이
    // 아니라 "챔피언을 흉내 낸 연습용 표적"이라는 이 더미의 원래 목적과도
    // 일치한다. isMonster는 false(기본값 undefined)로 둬서 초가스 R 등
    // "몬스터 여부"로 분기하는 다른 스킬과도 충돌하지 않는다.
    isChampion: true,
    // 아군/적군/플레이어 시스템 - 더미는 지금까지 team 필드가 전혀 없어서
    // getAllEnemyUnits()가 조건 없이 무조건 적으로 집어넣고 있었다(실제로도
    // 항상 적이니 동작은 똑같다). ENEMY_TEAM을 달아 플레이어(PLAYER_TEAM)와
    // generic하게(isAllyUnit/isEnemyUnit) 비교할 수 있게 한다 - 더미를
    // 움직이거나 공격하게 만드는 AI는 이번 범위에 포함하지 않는다(요청 시
    // 범위를 "태그만"으로 확인함).
    team: ENEMY_TEAM,
  };
}

function damageEnemy(enemy, dmg, result = null) {
  if (!enemy) return;
  // 아군 더미 - 보호막/꿈 생성기 파란 거품이 먼저 피해를 받는다(ally_system.js).
  if (enemy.isAlly && typeof allyAbsorbIncoming === 'function') dmg = allyAbsorbIncoming(enemy, dmg, result);
  if (!enemy.isTrainingDummy && enemy.hp <= 0) return; // 일반 유닛은 기존처럼 사망 후 추가 피해를 무시
  // 요청 12/13: "단순히 HP를 무한대로 만들지 마라 - 처형/궁극기 판정을
  // 테스트할 수 있어야 한다." 그래서 피해 계산/HP 차감은 100% 그대로 두고,
  // 학습용 허수아비만 최종적으로 0이 아니라 최소 체력(2%)에서 멈춘다 -
  // 즉 이 함수를 호출하는 쪽(_garenROnHit 등)이 "target.hp <= dmg"로
  // 판정하는 처치 조건은 히트 직전 실제 hp 값을 그대로 쓰므로 전혀 영향이
  // 없고, 매번 다시 테스트할 수 있게 hp만 바닥에서 멈춘다.
  const minHp = enemy.isTrainingDummy ? Math.max(1, Math.round(enemy.maxHp * 0.02)) : 0;
  enemy.hp = Math.max(minHp, enemy.hp - dmg);
  const pct = (enemy.hp / enemy.maxHp) * 100;
  const hpBarInner = enemy.labelDiv.querySelector('.hpBarInner');
  hpBarInner.style.width = pct + '%';
  // 요청("챔피언 체력바도 실제 롤 형식으로") - 실제 LoL처럼 체력이 낮을수록
  // 초록 → 노랑 → 빨강으로 바뀐다(챔피언 전용 스타일에만 적용).
  if (enemy.labelDiv.classList.contains('champion')) {
    hpBarInner.style.background = pct > 50 ? 'linear-gradient(180deg,#6fe06a,#2f9e2f)'
      : pct > 25 ? 'linear-gradient(180deg,#e0d35f,#b89a2f)'
      : 'linear-gradient(180deg,#e0605f,#9e2f2f)';
  }
  enemy.body.material.emissive = new THREE.Color(0xff3333);
  enemy.body.material.emissiveIntensity = 0.8;
  setTimeout(() => { if (enemy.body.material) enemy.body.material.emissiveIntensity = 0; }, 120);
  if (enemy.isTrainingDummy) return; // Death 처리(오퍼시티 페이드/타겟 해제/리스폰 타이머)를 완전히 건너뛴다 - 계속 타겟/피격 가능해야 함
  if (enemy.hp <= 0) {
    enemy.labelDiv.style.opacity = '0.35';
    if (controller && controller.currentTarget === enemy) { controller.currentTarget = null; targetRing.clear(); }
    setTimeout(() => {
      enemy.hp = enemy.maxHp; enemy.labelDiv.style.opacity = '1';
      const bar = enemy.labelDiv.querySelector('.hpBarInner');
      bar.style.width = '100%';
      if (enemy.labelDiv.classList.contains('champion')) bar.style.background = 'linear-gradient(180deg,#6fe06a,#2f9e2f)';
    }, 4000);
  }
}

