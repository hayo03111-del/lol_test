/* ============================================================
   EXP / LEVEL SYSTEM (요청: "LoL 경험치 및 레벨 시스템 구현")
   ------------------------------------------------------------
   기존 시스템과의 연결 원칙:
   - champion.champLevel(기존 필드, CHAMPION_DATA 스탯 성장 수식이 이미
     참조 중)을 그대로 레벨 값으로 쓴다. 별도 champion.level 필드를 새로
     만들지 않는다 - 두 값이 따로 놀면 동기화 버그가 생긴다.
   - 실제 "레벨업"(스탯 재계산 포함)은 기존 controller.levelUp()을 그대로
     재사용한다(위에서 스킬 포인트 지급 한 줄만 추가함) - 로직을 두 곳에
     중복 구현하지 않는다.
   - 골드 시스템(rewardMinionKill/getMinionGoldValue, 바로 아래)과 동일한
     구조로 나란히 만들어서 두 보상 시스템이 같은 패턴을 따르게 했다.
   ============================================================ */
const EXP_MAX_LEVEL = 18; // 요청 1
const EXP_BASE_REQUIRED = 180;      // 요청 2: 필요 경험치 = 180 + (현재 레벨 * 100)
const EXP_PER_LEVEL_INCREMENT = 100;
const EXP_RANGE_LOL = 1400; // 85차: 경험치 획득 범위 1400(PC 위키 Experience, 예전 1300)
// 요청 4: "추후 3명 이상 공유가 필요할 경우 쉽게 수정할 수 있도록" 인원수
// -> 배율 표로 분리했다. 정의 안 된 인원수(6명+)는 5인 배율을 그대로 쓴다.
const EXP_SHARE_MULTIPLIER = { 1: 1.0, 2: 0.666, 3: 0.6, 4: 0.55, 5: 0.5 };
const EXP_LEVEL_DIFF_BONUS_PER_LEVEL = 0.07; // 요청 5: 연상 챔피언 처치 시 레벨차 1당 +7%
const EXP_LEVEL_DIFF_MALUS_MAX = 0.20;       // 요청 5: 연하 챔피언 처치 시 최대 -20%
const R_RANK_LEVEL_GATE = { 2: 11, 3: 16 };  // 요청 1: R 2/3랭크 해금 레벨(1랭크는 테스트 편의상 이미 지급됨)

function getExpRequired(level) { return EXP_BASE_REQUIRED + level * EXP_PER_LEVEL_INCREMENT; } // 요청 2/9

// 요청 4/9: 여러 챔피언이 동시에 경험치를 받을 때 단순 N분의 1이 아니라
// LoL 방식 공유 배율을 적용한다. 싱글플레이라 participants는 사실상 항상
// [controller] 하나지만, 인원수 기반 구조라 아군이 늘어도 그대로 쓸 수 있다.
function shareExperience(amount, participants) {
  const n = participants ? participants.length : 0;
  if (n <= 0) return 0;
  const mult = EXP_SHARE_MULTIPLIER[n] != null ? EXP_SHARE_MULTIPLIER[n] : EXP_SHARE_MULTIPLIER[5];
  return amount * mult;
}
// 요청 5/9: 레벨 차이 보정(챔피언 처치에만 적용 - 미니언은 아직 레벨
// 개념이 없어 요청 7 "구조만" 원칙에 따라 보정하지 않는다).
function applyExperienceModifiers(amount, source, recipient, victim) {
  if (source !== 'champion' || !victim || !recipient) return amount;
  const diff = (victim.champLevel || 1) - (recipient.champLevel || 1);
  if (diff > 0) return amount * (1 + diff * EXP_LEVEL_DIFF_BONUS_PER_LEVEL); // 연상 처치 - 추가 경험치
  if (diff < 0) {
    const malus = Math.min(EXP_LEVEL_DIFF_MALUS_MAX, -diff * EXP_LEVEL_DIFF_BONUS_PER_LEVEL);
    return amount * (1 - malus); // 연하 처치 - 감소(최대 20%로 제한)
  }
  return amount;
}
// 요청 9: gainExperience가 "게이지에 더하고 필요하면 레벨업까지" 처리하는
// 단일 진입점이다 - 미니언/챔피언 처치 등 모든 경험치 지급 경로가 이
// 함수 하나로 모인다(요청 11-1 "중복 지급 방지"와도 연결: 지급 지점이
// 하나면 중복 호출 여부를 그 지점 하나만 지키면 된다).
function gainExperience(champion, amount) {
  if (!champion || !(amount > 0)) return;
  if (champion.champLevel >= EXP_MAX_LEVEL) return; // 요청 1: 만렙 이후로는 레벨업도, 경험치 누적도 없음
  champion.currentExp = (champion.currentExp || 0) + amount;
  checkLevelUp(champion);
  if (typeof updateExpUI === 'function') updateExpUI(champion); // 요청 8: 게이지 즉시 반영
}
function checkLevelUp(champion) {
  // 요청 2/9: "한 번의 경험치 획득으로 여러 레벨을 올릴 수도 있다" -
  // while로 반복 처리하고, 초과분은 다음 레벨 요구치로 자동 이월한다.
  while (champion.champLevel < EXP_MAX_LEVEL) {
    const required = getExpRequired(champion.champLevel);
    if (champion.currentExp < required) break;
    champion.currentExp -= required;
    if (typeof champion.levelUp === 'function') champion.levelUp();
  }
  if (champion.champLevel >= EXP_MAX_LEVEL) champion.currentExp = 0; // 요청 1: 만렙에서 게이지는 더 이상 의미 없음
}

// 요청 3: 미니언 처치 경험치 - "막타 안 쳐도 사거리 안이면 받는다"(막타
// 골드와는 완전히 독립 - rewardMinionKill과 이 함수는 서로 관여하지
// 않는다, 요청 11-2). getMinionGoldValue와 대응하는 경험치 버전이다.
function getMinionExpValue(minion) {
  const d = MINION_STATS[minion.type];
  return (d && d.xp) || 0;
}
function awardMinionExperience(minion) {
  if (typeof controller === 'undefined' || !controller) return;
  if (controller.state === STATE.DEAD || controller.hp <= 0) return;
  if (minion.team === PLAYER_TEAM) return;
  const rangeWorld = lolRangeToWorld(EXP_RANGE_LOL);
  const dist = getHorizontalDistance(controller.root.position, minion.mesh.position);
  if (dist > rangeWorld) return;
  const baseExp = getMinionExpValue(minion);
  let participants = [controller];
  // 닐라 P: 미니언 막타를 직접 한 경우 가장 가까운 아군 챔피언과 경험치를 공유하고,
  // 공유로 생긴 실제 손실량의 50%를 닐라에게 추가 보상한다.
  if (controller.championId === 'nilah' && minion._lastHitBy === controller) {
    const ally = typeof controller._nilahNearestAlly === 'function' ? controller._nilahNearestAlly(EXP_RANGE_LOL) : null;
    if (ally) {
      participants = [controller, ally];
      const sharedEach = shareExperience(baseExp, participants);
      const lost = Math.max(0, baseExp - sharedEach);
      for (const p of participants) gainExperience(p, applyExperienceModifiers(sharedEach, 'minion', p, null));
      gainExperience(controller, lost * (CHAMPION_DATA.nilah.passive.xpLostCompensationPercent / 100));
      return;
    }
  }
  const shared = shareExperience(baseExp, participants);
  for (const p of participants) gainExperience(p, applyExperienceModifiers(shared, 'minion', p, null));
}

// 요청 3: 챔피언 처치 경험치// 요청 3: 챔피언 처치 경험치 - 적 챔피언 AI가 아직 없어 실전 호출은
// 안 되지만, 나중에 AI 챔피언/멀티플레이가 붙으면 이 함수 하나만
// 호출하면 되도록 완전한 형태로 만들어둔다.
function awardChampionKillExperience(killer, participants, victim) {
  if (!victim || !participants || !participants.length) return;
  const baseExp = getExpRequired(victim.champLevel || 1) * 0.5; // 처치 경험치 기본값(실제 밸런스 수치는 AI/멀티 도입 시 조정)
  const shared = shareExperience(baseExp, participants);
  for (const p of participants) {
    if (p.state === STATE.DEAD || p.hp <= 0) continue; // 요청 6: 사망 중인 참가자는 제외
    gainExperience(p, applyExperienceModifiers(shared, 'champion', p, victim));
  }
}
// 요청 3/7: 몬스터 경험치 - 정글 몬스터가 아직 없어 구조만 만들어둔다.
// monsterType: 'normal'(처치자만) / 'epic'(주변 아군까지) / 'global'(팀 전체).
function awardMonsterExperience(monster, participants, monsterType = 'normal') {
  // 실제 정글 몬스터 시스템이 생기면 여기 한 곳만 채우면 된다(요청 3).
}

function findMinionsOfTypeNear(turret, type) { return findMinionsOfTypesNear(turret, [type]); }
// 포탑 시스템의 findMeleeMinionsNear/findCasterMinionsNear/
// findSuperOrSiegeMinionsNear가 호출하는 실제 구현. 함수 선언은 호이스팅
// 되므로, 이 미니언 모듈이 파일에서 포탑 모듈보다 뒤에 있어도 문제없다.
function findMinionsOfTypesNear(turret, types) {
  const range = lolRangeToWorld(TURRET_ATTACK_RANGE_LOL);
  // 요청(두 진영 미니언 전투): 이제 미니언이 RED/BLUE 양쪽에서 다 생성되므로
  // "포탑과 다른 팀"인 미니언만 적으로 간주한다(같은 편 미니언은 제외).
  return minions.filter((m) => !m.isDead && m.team !== turret.team && types.includes(m.minionType) && canRealmInteract(turret, m)
    && getHorizontalDistance(getWorldPosition(turret), m.mesh.position) <= range + getCollisionRadius(m)); // 44차: 포탑 사거리는 대상 가장자리까지
}

// 1. 웨이브 생성 - spawnMinionWave(gameTime, lane). 이 데모엔 라인이
// 사실상 하나뿐이라(포탑도 한 줄로만 배치했다) lane 인자는 받아만 두고
// 실제로는 무시한다 - 나중에 라인이 여러 개로 늘어나면 이 함수 시그니처를
// 바꿀 필요 없이 내부 로직만 확장하면 된다.
let minions = [];
let minionWaveCounter = 0; // BLUE 웨이브 카운터(기존 이름 유지 - 하위 호환)
let redMinionWaveCounter = 0;
let lastMinionWaveSec = -Infinity;
// 85차: 칼바람 - 공성 미니언은 3번째 웨이브부터 2웨이브마다(3, 5, 7, …) 게임 내내(PC 위키 ARAM·Siege minion).
// 예전엔 협곡 규칙(2:05부터 3웨이브마다 → 14:05 2웨이브 → 25:05 매 웨이브)이었다.
function shouldSpawnSiegeThisWave(waveIndex, gameTimeSec) {
  return waveIndex >= 3 && (waveIndex - 3) % 2 === 0;
}
// 8-G절 - 대포 미니언 조건을 별도 함수로 분리(기존 shouldSpawnSiegeThisWave
// 로직을 그대로 재사용, 새 규칙을 만들지 않는다).
function shouldSpawnCannonMinion(waveIndex, gameTimeSec) { return shouldSpawnSiegeThisWave(waveIndex, gameTimeSec); }
function isLaneInhibitorDestroyed() {
  return turrets.some((t) => t.type === TURRET_TYPE.INHIBITOR && t.destroyed);
}
// 8-F절 - 슈퍼 미니언 소환 조건을 별도 함수로 분리. 실제 LoL 규칙과 동일하게
// "상대 팀의 억제기(건물)가 파괴되면" 그 라인에 슈퍼 미니언이 나온다
// (요청: 조건 판정과 생성 코드를 분리 - 이 함수는 true/false만 반환).
function shouldSpawnSuperMinion(team) {
  const enemyTeam = team === 'RED' ? 'BLUE' : 'RED';
  return isTeamInhibitorDestroyed(enemyTeam);
}
// 8-B/8-C/8-D/8-E절 - 웨이브 구성/소환 순서/좌표/타이밍을 한 곳에서 처리.
// 진행 방향(이동 방향) 기준 맨 앞에 슈퍼가 오도록 SUPER→MELEE→CANNON→RANGED
// 순서로 정렬해서 생성하고, 각 개체는 약간의 시간차(0.1초)를 두고
// 스폰한다. 좌표는 그 팀의 실제 웨이포인트 진행 방향(전진 방향 단위벡터)을
// 그대로 읽어서 자동으로 결정한다(하드코딩 금지 - 요청 8-D 단서).
const MINION_SPAWN_STAGGER_MS = 650; // (59~64차 한 마리씩 소환 간격 - 65차부터 줄 단위 MINION_ROW_STAGGER_SEC)
const MINION_ROW_STAGGER_SEC = 0.55; // (65~85차 줄 대형 - 86차부터 한 줄 소환)
const MINION_SPAWN_INTERVAL_SEC = 0.792; // 86차: 원작 웨이브 안 미니언 소환 간격(PC 위키 Minion)
const MINION_FORMATION_SPACING = 0.8; // 가로 간격(월드, 약 LoL 92) - 근거리 몸 반경 48 두 개 + 여유
// 60차: 미니언 소환 간격·공격 타격 시점을 실제 시간(setTimeout)이 아니라 게임 루프 시간(minionSimTime, dt 누적)으로 잰다.
// 예전엔 일시정지 중에도 미니언이 나오고 예약된 타격이 들어갔으며, 공격 도중 죽은 미니언의 타격도 그대로 들어갔다.
let minionSimTime = 0;
let pendingMinionSpawns = [];
function spawnMinionWave(team, gameTimeSec) {
  const waveIndex = team === 'RED' ? ++redMinionWaveCounter : ++minionWaveCounter;
  const spawnPoint = getMinionSpawnPoint(team);
  const waypoints = getMinionLaneWaypoints(team);
  // 전진 방향 단위벡터: 스폰 지점 → 첫 웨이포인트.
  const forward = new THREE.Vector3().subVectors(waypoints[0], spawnPoint); forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, team === 'RED' ? -1 : 1); else forward.normalize();
  const composition = [];
  const spawnSuper = shouldSpawnSuperMinion(team);
  const spawnCannon = !spawnSuper && shouldSpawnCannonMinion(waveIndex, gameTimeSec); // 요청 3/32: 슈퍼+공성 동시 조합 금지
  if (spawnSuper) composition.push(MINION_TYPE.SUPER);
  composition.push(MINION_TYPE.MELEE, MINION_TYPE.MELEE, MINION_TYPE.MELEE);
  if (spawnCannon) composition.push(MINION_TYPE.SIEGE);
  composition.push(MINION_TYPE.CASTER, MINION_TYPE.CASTER, MINION_TYPE.CASTER);
  // 65차 웨이브 대형: 예전엔 넥서스 앞 한 점에서 0.65초마다 한 마리씩 나와 기차처럼 한 줄로 걸었다(웨이브가 길게 늘어져 띄엄띄엄
  // 도착). 이제 원작 웨이브 모양대로 줄을 짜서 거의 함께 나온다 - 앞줄 슈퍼, 근거리 3마리 가로줄, 가운데 대포, 뒷줄 원거리 3마리.
  // 각 미니언은 자기 가로 자리(laneOffset)를 갖고 그 자리를 지키며 라인을 따라가므로 대형이 유지된다(줄 간격 0.55초).
  const rows = [];
  if (spawnSuper) rows.push([MINION_TYPE.SUPER]);
  rows.push([MINION_TYPE.MELEE, MINION_TYPE.MELEE, MINION_TYPE.MELEE]);
  if (spawnCannon) rows.push([MINION_TYPE.SIEGE]);
  rows.push([MINION_TYPE.CASTER, MINION_TYPE.CASTER, MINION_TYPE.CASTER]);
  // 86차(PC 위키 Minion): 원작은 한 웨이브의 미니언이 "0.792초 간격으로 한 마리씩" 같은 자리에서 나와 한 줄로 걷는다
  // (슈퍼 → 근거리 3 → 공성 → 원거리 3). 앞줄이 적과 만나 멈추면 뒤가 따라붙어 뭉친다. 예전(65차)엔 3마리씩 가로줄 대형으로 나왔다.
  composition.forEach((type, i) => {
    pendingMinionSpawns.push({ at: minionSimTime + i * MINION_SPAWN_INTERVAL_SEC, type, pos: spawnPoint.clone(), gameTimeSec, team, laneOffset: 0 });
  });
  console.log(`[MINION] ${team} Wave ${waveIndex} (t=${gameTimeSec.toFixed(0)}s):`, composition.join(', '));
}
// 요청("hp바가 제자리에서 벗어나는 버그... 아예 지정대상한테 고정을
// 하고 실제 롤을 보고 hp바를 새로 만들어줘") - 예전엔 생성 시점의
// bounding box를 딱 한 번 측정해서 머리 위 높이를 정했는데, GLB
// 스켈레탈 애니메이션은 본 변형 때문에 그 순간의 포즈에 따라 bbox가
// 미묘하게 달라질 수 있어(특히 아직 애니메이션이 한 프레임도 재생되기
// 전 bind pose에서 측정하면 실제 Idle/Walk 포즈와 다를 수 있음) 체력바가
// 캐릭터 머리 위치와 조금씩 어긋나 보였다. bbox 측정을 아예 없애고
// 미니언 종류별 고정 높이표를 쓴다 - 절대 흔들리지 않는다("고정"). 실제
// LoL 미니언 체력바처럼 미니언 몸통보다 살짝 얇고 짧은 바 하나만 깔끔하게
// 표시한다(이름표 없음, 테두리 선명하게).
// 59차: 사용자 제공 미니언 GLB 크기 - 가렌(키 약 206 LoL)을 기준으로 원작 비율에 맞춘 월드 키(그룹 배율 1.82를 나누기 전).
// 근거리·원거리는 챔피언 키의 절반 남짓, 대포는 조금 크고, 슈퍼는 챔피언과 비슷하다. 체력바는 그 머리 위에 붙는다.
// 61차: 위 표 대신 원작 크기 규칙(원본 × LoL 100)으로 바뀌었다 - 실제 키(LoL): 근거리 88~105, 원거리 79~82, 대포 113~114,
// 슈퍼 132~140(가렌 208). 아래 표는 모델이 없을 때(임시 도형)와 투사체 높이에만 쓴다.
const MINION_MODEL_HEIGHT_WORLD = { melee: 0.8, caster: 0.7, siege: 1.0, super: 1.18 };
// 원작 충돌 반경(LoL): 근거리·원거리 48, 대포·슈퍼 65.
const MINION_GAMEPLAY_RADIUS_LOL = { melee: 48, caster: 48, siege: 65, super: 65 };
// 원작 원거리 미니언 투사체 속도(LoL/초): 원거리 650, 대포 1200.
const MINION_MISSILE_SPEED_LOL = { caster: 650, siege: 1200 };
// 61차: 원작 기본 공격 시전 시점(LeagueSandbox Spells SRU_OrderMinion*BasicAttack CastFrame / 30fps) - 원거리 14.1 → 0.47초,
// 대포 9 → 0.30초. 근거리·슈퍼는 데이터가 없어 클립 중간 지점.
const MINION_CAST_TIME_SEC = { caster: 14.1 / 30, siege: 9 / 30 };
const MINION_HEALTHBAR_CANVAS_W = 64, MINION_HEALTHBAR_CANVAS_H = 8;
const MINION_HEALTHBAR_NEAR_DIST = 14;   // 이 거리 안 - 100% 표시(요청 21-F)
const MINION_HEALTHBAR_MID_DIST = 26;    // 중간 거리 - 70~80%
const MINION_HEALTHBAR_MAX_DIST = 40;    // 이 거리 밖 - 완전히 숨김
// 66차 원작식 체력바: 화면 크기가 고정된 얇은 바(확대·축소해도 같은 픽셀 크기)로 바꿨다. 예전 캔버스 스프라이트는 월드 크기라
// 카메라를 당기면 커지고 멀어지면 작아졌고, 거리에 따라 흐려지거나 사라졌다. 원작처럼:
//  - 색: 내 팀(아군) 미니언 파랑, 적 미니언 빨강 - 진영(RED/BLUE)이 아니라 "내 기준"으로 칠한다.
//  - 검은 테두리 + 어두운 바탕, 맞으면 깎인 만큼 밝은 잔상이 잠깐 남았다가 줄어든다(피해량이 눈에 보인다 - 막타 가늠).
//  - 폭: 근거리·원거리 50px, 대포 62px, 슈퍼 74px(슈퍼는 조금 더 굵다). 보이는 동안은 거리와 상관없이 항상 같은 모양.
// 76차: 크기를 원작 화면 비율에 맞춤(근거리·원거리 56, 대포 66, 슈퍼 82px) - 높이는 CSS(.minionBar).
const MINION_HEALTHBAR_WIDTH_PX = { melee: 56, caster: 56, siege: 66, super: 82 };
function isAllyOfPlayer(unit) {
  const myTeam = (typeof controller !== 'undefined' && controller && controller.team) || (typeof PLAYER_TEAM !== 'undefined' ? PLAYER_TEAM : 'BLUE');
  return unit.team === myTeam;
}
function createMinionHealthBar(group, type, headY) {
  const el = document.createElement('div');
  el.className = 'lolBar minionBar' + (type === 'super' ? ' super' : type === 'siege' ? ' siege' : '');
  el.style.width = `${MINION_HEALTHBAR_WIDTH_PX[type] || 50}px`;
  el.innerHTML = '<div class="trail"></div><div class="fill"></div>';
  const obj = new CSS2DObject(el);
  obj.position.set(0, headY, 0);
  obj.center && obj.center.set(0.5, 1); // 바 아래쪽 가운데를 머리 위 점에 맞춘다
  group.add(obj);
  return { sprite: obj, obj, el, fill: el.querySelector('.fill'), trail: el.querySelector('.trail'), headY, lastRatio: 1 };
}
function drawMinionHealthBar(minion) {
  const hb = minion.healthBar;
  if (!hb) return;
  const ratio = THREE.MathUtils.clamp(minion.hp / minion.maxHp, 0, 1); // 요청 21-C
  const ally = isAllyOfPlayer(minion);
  if (hb._ally !== ally) { hb._ally = ally; hb.el.classList.toggle('ally', ally); hb.el.classList.toggle('enemy', !ally); }
  const pct = `${(ratio * 100).toFixed(1)}%`;
  hb.fill.style.width = pct;
  // 잔상: 줄어들 때만 늦게 따라간다(회복은 즉시).
  if (ratio >= hb.lastRatio) hb.trail.style.transition = 'none';
  else hb.trail.style.transition = '';
  hb.trail.style.width = pct;
  hb.lastRatio = ratio;
}
function updateMinionHealthBarVisibility(minion) {
  const hb = minion.healthBar;
  if (!hb) return;
  if (minion.isDead) { hb.obj.visible = false; return; } // 요청 22/21-G: 사망 시 즉시 숨김
  hb.obj.position.set(0, hb.headY, 0); // 요청("고정") - 매 프레임 제자리
  // 76차 버그 수정: 바는 피해를 받을 때만 다시 그려서, 회복·체력 재설정·팀 변경이 바에 반영되지 않았다(체력을 깎아 둔 미니언이
  // 꽉 찬 바로 보임). 매 프레임 비율·팀이 바뀌었는지만 보고 바뀐 경우에만 다시 그린다.
  const r = minion.maxHp > 0 ? THREE.MathUtils.clamp(minion.hp / minion.maxHp, 0, 1) : 0;
  if (Math.abs(r - hb.lastRatio) > 0.001 || hb._ally !== isAllyOfPlayer(minion)) drawMinionHealthBar(minion);
}
function disposeMinionHealthBar(minion) {
  const hb = minion.healthBar;
  if (!hb) return;
  if (hb.obj.parent) hb.obj.parent.remove(hb.obj);
  if (hb.el && hb.el.parentNode) hb.el.parentNode.removeChild(hb.el);
}

function createMinion(type, position, gameTimeSec, team = 'BLUE') {
  const stats = getMinionStats(type, gameTimeSec);
  const assetKey = team.toLowerCase() + type[0].toUpperCase() + type.slice(1);
  const asset = minionBuildingAssets[assetKey];
  let group, body, mixer = null, actions = null, usingRealModel = false, modelHeight = null;
  if (asset) {
    const inst = instantiateMinionBuildingAsset(assetKey, null, true, STRUCTURE_MINION_GLB_SCALE()); // 61차: 원작 크기(원본 × LoL 100, SkinScale 1)
    modelHeight = inst.height;
    // 59차: inst.root(키를 맞춘 배율이 걸린 모델)를 회전 전용 자식으로 두고, 바깥 group에는 위치·공통 배율·체력바만
    // 준다. 예전엔 group = inst.root라 아래 group.scale(1.82)이 키 맞춤 배율을 덮어썼고, 방향 전환(lookAt)도 스킨 메시
    // 자체에 걸려(스킨 메시는 뼈대가 그리므로) 실제로는 돌지 않았다.
    group = new THREE.Group(); group.add(inst.root);
    body = inst.root; mixer = inst.mixer; actions = inst.actions;
    usingRealModel = true;
  } else {
    // GLB 미로딩 시 폴백(요청 22 "모델 로딩 실패해도 게임이 멈추면 안 된다") -
    // 기존에 이미 쓰던 임시 도형을 그대로 유지한다.
    const shape = { melee: () => new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), caster: () => new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), siege: () => new THREE.BoxGeometry(0.55, 0.7, 0.55), super: () => new THREE.ConeGeometry(0.35, 1.2, 6) }[type]();
    const color = { melee: 0x996633, caster: 0x6633cc, siege: 0xcc6622, super: 0xffcc22 }[type];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    body = new THREE.Mesh(shape, mat);
    body.position.y = 0.5; body.castShadow = true;
    body.scale.setScalar(0.55); body.position.y *= 0.55; // 61차: 그룹 배율(예전 1.82)을 없앤 만큼 임시 도형만 원작 크기 근처로
    group = new THREE.Group(); group.add(body);
  }
  // 버그 수정("hp바가 제자리에서 벗어나는 버그... 아예 지정대상한테
  // 고정") - 예전엔 bounding box를 한 번 재서 머리 위 높이를 정했는데,
  // GLB가 아직 애니메이션을 한 프레임도 재생하기 전(bind pose) 상태에서
  // 측정되면 실제 Idle/Walk 포즈의 실루엣과 달라 체력바가 살짝 어긋나
  // 보였다. 미니언 종류별 고정 높이표(MINION_HEAD_HEIGHT)를 쓰는 걸로
  // 바꿔서 절대 흔들리지 않게 했다.
  const headY = (modelHeight || MINION_MODEL_HEIGHT_WORLD[type] || 0.8) + 0.12; // 61차: 실제 모델 키 바로 위
  group.position.copy(position);
  scene.add(group);
  group.add(createBlobShadow(0.32)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자
  const healthBar = createMinionHealthBar(group, type, headY); // 66차: 원작식 화면 고정 크기 바
  // 요청("미니언 크기를 1.4배 키워줘") - 몸체/체력바/그림자를 전부 만든
  // "뒤에" group 전체를 균일 확대한다. 먼저 스케일부터 걸면 자식으로
  // 추가되는 체력바/그림자까지 부모 스케일과 이중으로 곱해져서 위치와
  // 크기가 어긋난다 - 순서를 반드시 이렇게 지켜야 한다.
  // 요청("미니언 1.3배정도 크기를 키워줘") - 기존 1.4배에 추가로 1.3배 더 확대(1.4*1.3=1.82).
  const MINION_SCALE = 1; // 61차: 모델이 이미 원작 크기 - 그룹 배율 없음
  group.scale.setScalar(MINION_SCALE);
  const minion = {
    mesh: group, body, type, minionType: type, team,
    mixer, actions, currentAction: null, currentClipName: null, usingRealModel, modelHeight,
    attackClipSequence: (MINION_ATTACK_CLIPS[type] && MINION_ATTACK_CLIPS[type][team]) || [], attackClipIndex: 0,
    isMinion: true, isChampion: false, isMonster: true, isTrainingDummy: false, isTurret: false,
    hp: stats.hp, maxHp: stats.maxHp, armor: stats.armor, magicResist: stats.magicResist,
    attackDamage: stats.ad, attackSpeed: stats.attackSpeed, attackRange: stats.range,
    moveSpeedWorld: lolRangeToWorld(stats.moveSpeedLol), moveSpeedLol: stats.moveSpeedLol, // 83차: 둔화 계산용 기본 이동 속도(LoL)
    radius: lolRangeToWorld(MINION_GAMEPLAY_RADIUS_LOL[type] || 48), collisionRadius: lolRangeToWorld(MINION_GAMEPLAY_RADIUS_LOL[type] || 48), selectionRadius: lolRangeToWorld(MINION_SELECTION_RADIUS_LOL[type] || 115), healthBar, // 64차: 원작 선택 반경(클릭 판정)
    waypointIndex: 0, attackCooldown: 0, attackTarget: null, pendingHitTimer: null,
    hasAttackedStructure: false, // 요청 14/36: 한번 true가 되면 그 미니언 생존 동안 절대 false로 되돌리지 않는다(포탑/억제기/넥서스 전부 포함)
    lastAttackedByPlayerAt: 0, isDead: false, destroyed: false, realmId: 'main',
    spawnedAt: gameTimeSec, spawnWaveIndex: team === 'RED' ? redMinionWaveCounter : minionWaveCounter,
  };
  // 59차: 지금 자리보다 앞(상대 진영 쪽)에 있는 첫 웨이포인트부터 따라간다 - 넥서스 앞에서 나온 미니언이 넥서스 쪽(뒤)의
  // 첫 지점으로 되돌아가거나, 라인 중간에 만든 미니언이 자기 기지로 걸어가지 않게.
  { const wps = getMinionLaneWaypoints(team), dir = team === 'RED' ? -1 : 1; let i = 0;
    while (i < wps.length && (wps[i].z - position.z) * dir < 0.5) i++;
    minion.waypointIndex = Math.min(i, Math.max(0, wps.length - 1)); }
  drawMinionHealthBar(minion); // 요청 23: 생성 즉시 풀피 상태로 그려둔다
  if (usingRealModel) playAssetClip(minion, `${team} ${type} minion`, MINION_IDLE_CLIP);
  return minion;
}

// C/12/13 - 공격 우선순위(요청 문서 10절): 1.가까운 적 미니언 2.가까운 적
// 챔피언 3.적 포탑 4.적 억제기 5.적 넥서스. RED/BLUE 두 팀이 다 존재하므로
// "적"은 항상 "team이 다른 대상"으로 판정한다(요청 10 - if(minion.team !== target.team)).
function isValidMinionTarget(minion, target) {
  if (!target || target.hp <= 0 || target.isDead || target.destroyed) return false;
  if (target.isUntargetable) return false;
  if (target.isTrainingDummy) return false; // 60차: 허수아비(연습 표적)는 어느 팀 미니언도 때리지 않는다
  if (target.isStructure && typeof isStructureProtected === 'function' && isStructureProtected(target)) return false; // 60차: 무적 구조물은 지나친다
  // team 필드가 있는 대상(미니언/포탑/억제기/넥서스)은 반드시 서로 다른 팀이어야
  // 유효한 적이다 - 같은 편은 아예 공격 후보에서 제외한다(요청 10).
  if (target.team && target.team === minion.team) return false;
  if (!canRealmInteract(minion, target)) return false;
  // 44차: 원작처럼 가장자리 대 가장자리(사거리 + 두 유닛 반경). 예전엔 중심 대 중심이라 구조물 충돌로 멈춘 근접 미니언
  // (포탑 중심에서 약 151)이 사거리 110으로는 구조물을 때리지 못했다.
  const range = lolRangeToWorld(minion.attackRange) + getCollisionRadius(minion) + getCollisionRadius(target);
  return getHorizontalDistance(minion.mesh.position, getWorldPosition(target)) <= range;
}
// 5순위(가까운 적 미니언) - 요청 10/11: RED↔BLUE 미니언이 서로를 적으로
// 인식하고 사거리 안에서 서로 공격한다.
function findNearestEnemyMinion(minion) {
  let best = null, bestDist = Infinity;
  for (const m of minions) {
    if (m === minion || !isValidMinionTarget(minion, m)) continue;
    const dist = getHorizontalDistance(minion.mesh.position, m.mesh.position);
    if (dist < bestDist) { bestDist = dist; best = m; }
  }
  return best;
}
function findTurretAttackingAllyMinion(minion) {
  for (const t of turrets) {
    if (t.team === minion.team || t.destroyed || TURRET_DATA[t.type].indestructible) continue;
    if (t.attackTarget && t.attackTarget.isMinion && t.attackTarget.team === minion.team && isValidMinionTarget(minion, t)) return t;
  }
  return null;
}
function findNearestValidTurret(minion) {
  let best = null, bestDist = Infinity;
  for (const t of turrets) {
    if (!isValidMinionTarget(minion, t)) continue;
    const dist = getHorizontalDistance(minion.mesh.position, getWorldPosition(t));
    if (dist < bestDist) { bestDist = dist; best = t; }
  }
  return best;
}
function findNearestValidInhibitor(minion) {
  let best = null, bestDist = Infinity;
  for (const i of inhibitorBuildings) {
    if (!isValidMinionTarget(minion, i)) continue;
    const dist = getHorizontalDistance(minion.mesh.position, getWorldPosition(i));
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}
function findNearestValidNexus(minion) {
  let best = null, bestDist = Infinity;
  for (const n of nexusBuildings) {
    if (!isValidMinionTarget(minion, n)) continue;
    const dist = getHorizontalDistance(minion.mesh.position, getWorldPosition(n));
    if (dist < bestDist) { bestDist = dist; best = n; }
  }
  return best;
}
// 요청 문서 20절 - "RED MINION ↔ BLUE CHAMPION" 관계. 이 프로젝트의 유일한
// 조작 챔피언(플레이어)은 처음부터 항상 RED 진영과만 적대한다는 기존
// 설계(포탑 findEnemyChampionsNear의 team==='RED' 게이트와 동일한 원칙)를
// 그대로 유지하므로, 플레이어는 BLUE 진영 소속으로 취급한다 - 즉 RED
// 미니언만 플레이어를 적 챔피언으로 인식한다. "BLUE MINION ↔ RED
// CHAMPION" 관계는 이 프로젝트에 조작 가능한 RED 챔피언이 없어(허수아비는
// 진영이 없는 연습용 표적일 뿐) 실현 대상 자체가 없다.
// PLAYER_TEAM/ENEMY_TEAM 상수는 00_global_constants.js로 옮겨 공용화했다
// (아군/적군/플레이어 시스템 - 이제 champion.team과 generic하게 비교한다).
function isValidChampionTarget(minion, champion) {
  if (typeof champion === 'undefined' || !champion) return false;
  if (isAllyUnit(minion, champion)) return false; // 아군 챔피언은 공격 불가(요청 20-B) - champion.team(플레이어는 PLAYER_TEAM)과 generic 비교
  if (champion.hp <= 0 || champion.state === STATE.DEAD || champion.isUntargetable) return false;
  if (!canRealmInteract(minion, champion)) return false;
  const range = lolRangeToWorld(minion.attackRange) + getCollisionRadius(minion) + getCollisionRadius(champion); // 44차: 가장자리 기준
  return getHorizontalDistance(minion.mesh.position, getWorldPosition(champion)) <= range;
}
// 59차: 미니언 어그로를 원작 규칙으로 다시 만들었다. 예전엔 "공격 사거리 안"에 들어온 대상만 골라서, 상대 웨이브가
// 코앞에 와도 사거리(근거리 110)에 닿기 전까지는 무시하고 라인만 걸었고, 아군 챔피언을 때리는 적 챔피언에게 반응하는
// 규칙(도움 요청)도 없었다. 이제 인식 범위(500) 안의 대상을 아래 순서로 골라 다가가서 때린다. 한번 고른 대상은 죽거나
// 범위를 벗어나기 전까지 유지하고, 1순위(도움 요청)만 그 고정을 깬다.
//   1. 아군 챔피언을 공격한 적 챔피언(도움 요청)  2. 아군 챔피언을 공격 중인 적 미니언  3. 아군 미니언을 공격 중인 적 미니언
//   4. 아군 미니언을 공격 중인 적 포탑  5. 아군 미니언을 공격한 적 챔피언  6. 가장 가까운 적 미니언  7. 가장 가까운 적 챔피언
//   그다음 구조물(포탑 → 억제기 → 넥서스, 원작처럼 공격 사거리 안일 때).
// 허수아비(연습용 표적)는 RED 챔피언으로서 도움 요청을 받지만, BLUE 미니언이 스스로 때리러 가지는 않는다(연습 표적이 웨이브에
// 녹아 버리지 않게).
// 61차: 원작 데이터(LeagueSandbox-Default Stats SRU_*Minion*의 AcquisitionRange) - 원거리 700, 슈퍼 600, 나머지는 500.
const MINION_ACQUISITION_RANGE_LOL = 500;
const MINION_ACQUISITION_BY_TYPE_LOL = { caster: 700, super: 600 };
const MINION_CALL_FOR_HELP_MS = 3000;
const MINION_CHAMPION_ATTACKED_MINION_MS = 2000;
function minionAcquireRangeWorld(minion, target) {
  return lolRangeToWorld(Math.max(MINION_ACQUISITION_BY_TYPE_LOL[minion.type] || MINION_ACQUISITION_RANGE_LOL, minion.attackRange || 0)) + getCollisionRadius(minion) + getCollisionRadius(target);
}
function isAliveEnemyForMinion(minion, target) {
  if (!target || target.isTrainingDummy || target.hp <= 0 || target.isDead || target.destroyed || target.isUntargetable) return false;
  if (target.state === STATE.DEAD) return false;
  if (!target.team || target.team === minion.team) return false;
  return canRealmInteract(minion, target);
}
function canMinionAcquire(minion, target) {
  if (!isAliveEnemyForMinion(minion, target)) return false;
  if (target.isStructure) return isValidMinionTarget(minion, target);
  return getHorizontalDistance(minion.mesh.position, getWorldPosition(target)) <= minionAcquireRangeWorld(minion, target);
}
function getMinionEnemyChampions(minion) {
  const list = [];
  if (typeof controller !== 'undefined' && controller && controller.team && controller.team !== minion.team) list.push(controller);
  return list;
}
function closestAcquirable(minion, candidates) {
  let best = null, bestDist = Infinity;
  for (const u of candidates) {
    if (!canMinionAcquire(minion, u)) continue;
    const d = getHorizontalDistance(minion.mesh.position, getWorldPosition(u));
    if (d < bestDist) { bestDist = d; best = u; }
  }
  return best;
}
// 65차: 대상 선택을 "순위 비교"로 다시 짰다. 예전엔 한번 고른 대상을 죽거나 범위를 벗어날 때까지 그대로 유지해서, 적 웨이브가
// 오기 전에 플레이어를 노리기 시작한 미니언은 바로 앞에 적 미니언이 와도 계속 플레이어만 쳤다. 이제 매 프레임 원작 우선순위로
// 가장 높은 후보를 구하고, 지금 대상보다 순위가 "더 높을" 때만 바꾼다(같은 순위면 지금 대상 유지 - 대상이 흔들리지 않게).
//   1 도움 요청(아군 챔피언을 때린 적 챔피언) · 2 아군 챔피언을 치는 적 미니언 · 3 아군 미니언을 치는 적 미니언 ·
//   4 아군 미니언을 치는 적 포탑(공격 사거리 안) · 5 아군 미니언을 때린 적 챔피언 · 6 적 미니언 · 7 적 챔피언 · 8 구조물
// 같은 순위 안에서는 가까운 쪽. 챔피언을 쫓다가 처음 노린 자리에서 700 넘게 끌려가면 포기하고 2초 동안 챔피언을 무시한 채 라인으로
// 돌아간다(원작 추격 제한 - 예전엔 인식 범위 안에만 있으면 어디까지든 따라왔다).
const MINION_CHASE_LEASH_LOL = 700;
const MINION_LEASH_IGNORE_MS = 2000;
function isChampionLike(u) { return !!(u && (u.isChampion || typeof u.championId === 'string')); }
function minionTargetRank(minion, u, now) {
  if (!u) return 99;
  const cfh = minion._callForHelp;
  if (cfh && cfh.target === u && now < cfh.until) return 1;
  if (u.isMinion) {
    const t = u.attackTarget;
    if (t && t.team === minion.team && isChampionLike(t)) return 2;
    if (t && t.team === minion.team && t.isMinion) return 3;
    return 6;
  }
  if (u.isTurret) return (u.attackTarget && u.attackTarget.isMinion && u.attackTarget.team === minion.team) ? 4 : 8;
  if (u.isStructure) return 8;
  // 86차(26.10 패치): 챔피언이 "미니언"을 때리는 것은 더 이상 미니언 어그로를 끌지 않는다(옛 5순위 삭제).
  // 챔피언은 도움 요청(아군 챔피언을 공격 - 1순위)이거나, 다른 대상이 없을 때 가장 가까운 챔피언(7순위)일 때만 노린다.
  if (isChampionLike(u)) return 7;
  return 9;
}
function getMinionAttackTarget(minion) {
  if (minion.isDead) return null;
  // 83차: 도발되면 시전자만 공격한다(원작).
  const taunter = typeof getTauntSource === 'function' ? getTauntSource(minion) : null;
  if (taunter) return taunter;
  const now = performance.now();
  const pos = minion.mesh.position;
  // 86차 추격 포기(원작 미니언 AI): 대상을 4초 동안 한 번도 때리지 못하면(쫓기만 하면) 그 대상을 잠시 무시한다.
  // 예전엔 출처 없는 "700 끌려가면 포기"였다. 포탑을 치는 중이면 다른 대상(도움 요청 포함)을 보지 않는다.
  const curRaw = minion.attackTarget;
  if (curRaw && curRaw.isTurret && isValidMinionTarget(minion, curRaw)) return curRaw;
  if (curRaw && !curRaw.isStructure) {
    if (minion._engageTarget !== curRaw) { minion._engageTarget = curRaw; minion._engageSince = now; }
    const lastHit = Math.max(minion._engageSince || 0, minion._lastAttackAt || 0);
    if (now - lastHit > 4000) {
      minion._ignoreTarget = curRaw; minion._ignoreTargetUntil = now + MINION_LEASH_IGNORE_MS * 2;
      if (minion._callForHelp && minion._callForHelp.target === curRaw) minion._callForHelp = null;
      minion.attackTarget = null; minion._engageTarget = null;
    }
  } else minion._engageTarget = null;
  const ignoredNow = (u) => u && u === minion._ignoreTarget && now < (minion._ignoreTargetUntil || 0);
  const ignoreChamps = false;
  // 후보: 인식 범위 안 적 미니언·챔피언 + 공격 사거리 안 적 포탑(4순위용)
  let best = null, bestRank = 99, bestDist = Infinity;
  const consider = (u) => {
    const r = minionTargetRank(minion, u, now);
    const d = getHorizontalDistance(pos, getWorldPosition(u));
    if (r < bestRank || (r === bestRank && d < bestDist)) { best = u; bestRank = r; bestDist = d; }
  };
  for (const m of minions) if (m !== minion && m.team !== minion.team && !m.isDead && !ignoredNow(m) && canMinionAcquire(minion, m)) consider(m);
  for (const c of getMinionEnemyChampions(minion)) if (!ignoredNow(c) && (canMinionAcquire(minion, c) || (minion._callForHelp && minion._callForHelp.target === c && now < minion._callForHelp.until))) consider(c);
  const engagedTurret = findTurretAttackingAllyMinion(minion);
  if (engagedTurret) consider(engagedTurret);
  // 지금 대상 유지(같거나 더 높은 순위면)
  const cur = minion.attackTarget;
  if (cur && !ignoredNow(cur)) {
    // 86차: 이미 잡은 대상은 인식 범위를 벗어나도 살아 있는 동안 계속 쫓는다(4초 동안 못 때리면 위에서 포기).
    const curOk = cur.isStructure ? isValidMinionTarget(minion, cur) : isAliveEnemyForMinion(minion, cur);
    // 86차(PC 위키 Minion): 대상을 정하면 "더 높은 우선순위"가 나타날 때만 바꾼다(같은 순위끼리는 바꾸지 않음).
    if (curOk && minionTargetRank(minion, cur, now) <= bestRank) return cur;
  }
  if (best) return best;
  // 구조물: 가장 가까운 적 포탑 → 억제기 → 넥서스(공격 사거리 안일 때)
  return findNearestValidTurret(minion) || findNearestValidInhibitor(minion) || findNearestValidNexus(minion) || null;
}
// 59차 도움 요청: 적 챔피언(attacker)이 아군 챔피언(victim)에게 피해를 주면, victim 팀 미니언 중 attacker가 인식 범위 안에
// 있는 미니언들이 3초 동안 attacker를 최우선으로 노린다(포탑 쪽은 notifyTurretsChampionAttacked가 맡는다).
function notifyMinionsChampionAttacked(attacker, victim) {
  // 65차: 허수아비(연습 표적)를 때리는 건 미니언 어그로를 끌지 않는다 - 다리 가운데 허수아비를 치다 보면 레드 미니언이 몰려왔다.
  if (!attacker || attacker.isTrainingDummy || !victim || victim.isTrainingDummy || !attacker.team || attacker.team === victim.team) return;
  const until = performance.now() + MINION_CALL_FOR_HELP_MS;
  for (const m of minions) {
    if (m.isDead || m.team !== victim.team) continue;
    // 86차(원작): 아군 챔피언이 공격받을 때의 도움 요청은 1000 범위(평소 인식 500의 두 배). 포탑을 치고 있는 미니언은 도움 요청을 무시한다.
    if (getHorizontalDistance(m.mesh.position, getWorldPosition(victim)) > lolRangeToWorld(1000) + getCollisionRadius(m)) continue;
    if (m.attackTarget && m.attackTarget.isTurret && isValidMinionTarget(m, m.attackTarget)) continue;
    m._callForHelp = { target: attacker, until };
  }
}

// updateMinionMovement(minion, dt) - 자기 팀의 웨이포인트(=자기 진영→상대
// 진영 방향 라인 경로)를 순서대로 따라간다. 사거리 안에 유효 대상이 있으면
// 멈추고 공격에 맡긴다.
// 버그 수정("미니언이 구조물 관통하는거 픽스") - 지금까지 미니언 이동은
// 웨이포인트를 향해 직선으로만 걸어갔고, 그 경로에 포탑/억제기/넥서스가
// 있어도 전혀 막지 않아서 그대로 뚫고 지나갔다. 매 프레임 위치 갱신 뒤에
// "구조물 원 + 미니언 원이 겹치면 밖으로 밀어낸다"는 단순한 원형 충돌
// 판정을 추가한다 - 정식 경로탐색 없이도 미니언이 포탑을 자연스럽게
// 비껴가는 것처럼 보인다. 파괴된 구조물(잔해)도 여전히 물리적으로는
// 그 자리에 남아 있는 것으로 취급해 계속 막는다(요청 - destroyed 여부와
// 상관없이 항상 충돌 목록에 포함).
// 요청("챔피언 미니언 모두가 포탑,억제기,넥서스를 못뚫고 다니게") - 아래
// resolveMinionStructureCollisions()와 완전히 같은 원형 충돌 원리를
// 플레이어 챔피언에도 적용한다(CharacterController.updateMovement에서
// 매 프레임 호출).
function resolvePlayerStructureCollisions(ctrl) {
  if (isGhosted(ctrl)) return; // 닐라 W/공유 유체화 상태에서는 유닛 충돌을 무시
  const pos = ctrl.root.position;
  // 요청("우물은 특정 구조물이 아니라 그냥 영역이 나눠져있는 땅") - isStructure
  // 로 실제 충돌체(포탑/억제기/넥서스)만 걸러낸다. collisionRadius:0으로만
  // 막으려 하면 아래 `s.collisionRadius || s.radius` 폴백이 0을 falsy로
  // 취급해 radius(우물 구역 크기)로 넘어가버리는 버그가 있어 아예 목록에서
  // 뺐다.
  const structures = [...turrets, ...inhibitorBuildings, ...nexusBuildings].filter((s) => s.isStructure);
  for (const s of structures) {
    const sp = getWorldPosition(s);
    let dx = pos.x - sp.x, dz = pos.z - sp.z;
    const minDist = (s.collisionRadius || s.radius || 0) + (ctrl.pathingRadius != null ? ctrl.pathingRadius : ctrl.collisionRadius); // 25차: 지형·구조물은 원작처럼 지형 충돌 반경(pathing)
    let dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= minDist) continue;
    if (dist < 0.001) { dx = 1; dz = 0; dist = 1; } // 완전히 중심에 겹친 극단값
    else if (Math.abs(dx) < 0.05) { dx = 0.3; dist = Math.sqrt(dx * dx + dz * dz); } // 정면 일직선 부딪힘 방지(미니언과 동일한 처리)
    const push = minDist - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
  }
}
// 61차: 챔피언과 미니언 몸 충돌(원작은 서로 길을 막는다). 예전엔 플레이어가 미니언을 그대로 통과했다. 원작 길찾기 반경
// (플레이어 pathingRadius, 미니언 근거리·원거리 35.7 / 대포·슈퍼 55.7)이 겹친 만큼 둘이 반씩 밀려난다 - 한쪽만 밀면 웨이브
// 속에서 플레이어가 갇히거나 미니언이 구조물로 밀려 들어간다. 유체화(닐라 W 등)·돌진 중에는 통과한다.
// 64차: 원작 선택 반경(LeagueSandbox-Default Stats SRU_*Minion* SelectionRadius) - 클릭 판정 원기둥 반경.
const MINION_SELECTION_RADIUS_LOL = { melee: 115, caster: 115, siege: 140, super: 145 };
const MINION_PATHING_RADIUS_LOL = { melee: 35.7, caster: 35.7, siege: 55.7, super: 55.5 };
function resolvePlayerMinionCollisions(ctrl) {
  if (typeof minions === 'undefined' || !minions.length || isGhosted(ctrl) || ctrl._dashState || ctrl.state === STATE.DEAD) return;
  // 64차: 서 있거나 공격·시전 중인 챔피언은 거의 밀리지 않고(미니언이 비켜 감), 걷는 중에만 반씩 밀린다 - 예전엔 평타를 치는
  // 동안에도 지나가는 웨이브에 계속 밀려 사거리 밖으로 나가 공격이 끊겼다.
  const playerShare = ctrl.state === STATE.MOVE ? 0.5 : 0.1;
  const pos = ctrl.root.position;
  const pr = ctrl.pathingRadius != null ? ctrl.pathingRadius : ctrl.collisionRadius;
  for (const m of minions) {
    if (m.isDead) continue;
    const mp = m.mesh.position;
    let dx = pos.x - mp.x, dz = pos.z - mp.z;
    const minDist = pr + lolRangeToWorld(MINION_PATHING_RADIUS_LOL[m.type] || 35.7);
    let d = Math.hypot(dx, dz);
    if (d >= minDist) continue;
    if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
    const overlap = minDist - d;
    pos.x += (dx / d) * overlap * playerShare; pos.z += (dz / d) * overlap * playerShare;
    mp.x -= (dx / d) * overlap * (1 - playerShare); mp.z -= (dz / d) * overlap * (1 - playerShare);
  }
}
function resolveMinionStructureCollisions(minion) {
  const pos = minion.mesh.position;
  const structures = [...turrets, ...inhibitorBuildings, ...nexusBuildings].filter((s) => s.isStructure);
  for (const s of structures) {
    const sp = getWorldPosition(s);
    let dx = pos.x - sp.x, dz = pos.z - sp.z;
    const minDist = (s.collisionRadius || s.radius || 0) + minion.collisionRadius;
    let dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= minDist) continue;
    if (dist < 0.001) {
      // 완전히 중심에 겹친 극단값 - 팀별로 고정된 방향으로 밀어내서 매
      // 프레임 방향이 흔들리지 않게 한다.
      dx = minion.team === 'RED' ? 1 : -1; dz = 0; dist = 1;
    } else if (Math.abs(dx) < 0.05) {
      // 포탑 대부분이 중앙 라인(X=0)에 있어서, 미니언이 정면으로 일직선
      // 부딪히면 좌우 힘이 거의 없어 제자리에서 계속 밀리기만 할 수 있다
      // - 살짝 옆으로 치우쳐서 자연스럽게 비껴가게 한다(같은 팀은 항상
      // 같은 쪽으로 갈라져서 스트림처럼 보인다).
      dx = minion.team === 'RED' ? 0.3 : -0.3;
      dist = Math.sqrt(dx * dx + dz * dz);
    }
    const push = minDist - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
  }
}
// 요청(첨부 "미니언관련.txt" - Formation/Local Avoidance/Combat Positioning
// 설계) - 문서의 핵심 레이어 중 "아군끼리 안 겹치게", "타겟을 향해 직접
// 접근", "전투 중에도 계속 분리력 적용" 세 가지를 반영한다. 다만 문서의
// Combat Slot Reservation(원형으로 N개 자리 만들고 예약)은 흔들림 방지를
// 위해 히스테리시스까지 따로 관리해야 해서 상당히 복잡하고 깨지기 쉽다 -
// 대신 매 프레임 "너무 가까운 아군에게서 멀어지려는 연속적인 힘"을 이동
// 방향에 섞는 방식(steering force)으로 같은 효과(자연스럽게 퍼져서 선다)를
// 훨씬 적은 코드로 얻는다. 이산적인 자리 배정이 없으니 자리를 두고
// 다투거나(동시에 같은 Slot 선택) 자리가 사라져서 재탐색하는 문제 자체가
// 애초에 없다.
const MINION_SEPARATION_RADIUS = 0.85; // 이 거리 안의 아군에게서 밀려남
const MINION_SEPARATION_WEIGHT = 0.55; // 목표 방향 대비 분리력의 비중
function computeFriendlySeparation(minion) {
  let fx = 0, fz = 0;
  for (const m of minions) {
    if (m === minion || m.isDead) continue;
    const dx = minion.mesh.position.x - m.mesh.position.x;
    const dz = minion.mesh.position.z - m.mesh.position.z;
    const distSq = dx * dx + dz * dz;
    // 61차: 적 미니언과도 몸이 겹치지 않게 한다(예전엔 아군끼리만 떨어져 적 웨이브와 한 덩어리로 겹쳤다). 적과는 몸 크기만큼만
    // 떨어지고(아군 간격 여유 없음), 아군끼리는 예전대로 여유를 둔다.
    const minDist = minion.collisionRadius + m.collisionRadius + (m.team === minion.team ? MINION_SEPARATION_RADIUS : 0);
    if (distSq < 1e-6 || distSq > minDist * minDist) continue;
    const dist = Math.sqrt(distSq);
    const closeness = 1 - dist / minDist;
    fx += (dx / dist) * closeness;
    fz += (dz / dist) * closeness;
  }
  return { x: fx, z: fz };
}
// 59차: 모델이 (dx, dz) 방향을 보게 한다. lookAt은 월드 좌표를 받으므로 바깥 group의 월드 위치 기준으로 계산한다(예전엔
// 로컬 위치(0,0,0) + 방향을 넘겨 엉뚱한 곳을 봤다). 사용자 제공 GLB는 두 팀 모두 +Z가 정면이라 팀별 보정이 필요 없다.
function faceMinionToward(minion, dx, dz) {
  if (!minion.body || Math.hypot(dx, dz) < 1e-6) return;
  const p = minion.mesh.position;
  if (minion.body === minion.mesh) return;
  minion.mesh.updateMatrixWorld(true);
  minion.body.lookAt(p.x + dx, minion.body.getWorldPosition(new THREE.Vector3()).y, p.z + dz);
}
// 60차: 구조물 돌아가기. 칼바람 포탑은 라인 한가운데 서 있어 웨이포인트로 곧장 걸으면 경로가 포탑 중심을 지난다. 예전엔
// "앞으로 당기는 힘"과 "충돌로 밀어내는 힘"이 맞서 포탑 바로 앞(뒤)에서 멈춰 섰다(장시간 점검에서 레드 원거리 미니언이 억제기
// 포탑 뒤에 계속 서 있었다). 앞쪽 가까이에 구조물이 있으면 그 둘레를 따라 옆으로 비켜 가는 힘을 더한다.
function computeStructureAvoidance(minion, dirX, dirZ) {
  const p = minion.mesh.position;
  let ax = 0, az = 0;
  for (const s of [...turrets, ...inhibitorBuildings, ...nexusBuildings]) {
    if (!s.isStructure) continue;
    if (minion.attackTarget === s) continue; // 때리러 가는 구조물은 피하지 않는다
    const sp = getWorldPosition(s);
    const vx = sp.x - p.x, vz = sp.z - p.z, d = Math.hypot(vx, vz);
    const R = (s.collisionRadius || s.radius || 0) + minion.collisionRadius;
    const margin = 1.6;
    if (d < 1e-4 || d > R + margin) continue;
    const along = (vx * dirX + vz * dirZ) / d; // 1 = 구조물 정면으로 향함
    if (along <= 0.05) continue;
    // 진행 방향에 더 가까운 접선 쪽으로 돈다(정면이면 팀마다 정해진 쪽 - 같은 팀은 같은 쪽으로 흘러 줄이 엉키지 않는다).
    let tx = -vz / d, tz = vx / d;
    const dot = tx * dirX + tz * dirZ;
    if (Math.abs(dot) < 0.05 ? minion.team === 'RED' : dot < 0) { tx = -tx; tz = -tz; }
    const w = along * (1 - Math.max(0, d - R) / margin) * 2.2;
    ax += tx * w; az += tz * w;
  }
  return { x: ax, z: az };
}
function updateMinionMovement(minion, dt) {
  if (minion.isDead) return;
  resolveMinionStructureCollisions(minion); // 이동 여부와 상관없이 매 프레임 겹침을 즉시 풀어준다
  const target = minion.attackTarget;
  const sep = computeFriendlySeparation(minion);
  const sepLen = Math.hypot(sep.x, sep.z);
  // 요청("우선순위 Death>Attack>Hit>Move>Idle") - 피격 직후 짧은 창
  // 동안은 여기서 Idle/Move 클립을 다시 요청하지 않는다(그래야 Hit
  // 애니메이션이 화면에 실제로 보인다). 공격 중이면 updateMinionAttack이
  // 그 프레임에 Attack 클립을 별도로 요청하므로 자연스럽게 Attack이 더
  // 우선한다 - 이동/전투 판정 자체는 이 플래그와 무관하게 항상 그대로 돈다.
  const inHitFlash = minion._hitFlashUntil && performance.now() < minion._hitFlashUntil;
  if (target && isValidMinionTarget(minion, target)) {
    // 사거리 안 - 공격 위치는 유지하되, 아군이 너무 가까워지면 그 자리에서
    // 살짝만 밀려난다(요청 문서 16절 "전투 중에도 Separation 계속 적용").
    // 85차: 공격 중엔 대상 쪽으로 멀어지게 밀지 않고 옆으로만 비켜선다 - 예전엔 분리력에 사거리 밖으로 밀렸다가 다시 걸어
    // 들어오기를 반복해 사거리 경계에서 떨었다.
    if (sepLen > 0.01) {
      const tp0 = getWorldPosition(target);
      let tx = tp0.x - minion.mesh.position.x, tz = tp0.z - minion.mesh.position.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let sx = sep.x / sepLen, sz = sep.z / sepLen;
      const along = sx * tx + sz * tz; sx -= along * tx; sz -= along * tz; // 대상 방향 성분 제거(옆으로만)
      const sl = Math.hypot(sx, sz);
      if (sl > 1e-3) {
        minion.mesh.position.x += (sx / sl) * MINION_SEPARATION_WEIGHT * 0.6 * dt;
        minion.mesh.position.z += (sz / sl) * MINION_SEPARATION_WEIGHT * 0.6 * dt;
      }
    }
    if (!inHitFlash && minion.usingRealModel && minion.attackCooldown > (1 / minion.attackSpeed) * 0.4) playAssetClip(minion, `${minion.team} ${minion.type} minion`, MINION_IDLE_CLIP);
    return; // 공격은 updateMinionAttack이 처리
  }
  let dirX, dirZ, atWaypoint = false;
  if (target) {
    // 요청 문서 7/9/10절 "적을 발견하면 목표가 웨이포인트가 아니라 Combat
    // Position(타겟 방향)으로 바뀐다" - 라인 경로 대신 타겟을 향해 직접
    // 접근해서 사거리를 확보한다.
    const tp = getWorldPosition(target);
    dirX = tp.x - minion.mesh.position.x; dirZ = tp.z - minion.mesh.position.z;
  } else {
    const waypoints = getMinionLaneWaypoints(minion.team);
    const wpBase = waypoints[minion.waypointIndex];
    // 65차: 대형 자리(laneOffset)만큼 옆으로 비낀 지점을 따라간다 - 모두 한가운데 한 점을 향해 모여들지 않는다.
    const wp = wpBase ? new THREE.Vector3(wpBase.x + (minion.laneOffset || 0), 0, wpBase.z) : null;
    if (!wp) { if (!inHitFlash && minion.usingRealModel) playAssetClip(minion, `${minion.team} ${minion.type} minion`, MINION_IDLE_CLIP); return; } // 라인 끝(상대 진영 끝까지 전부 통과함)
    dirX = wp.x - minion.mesh.position.x; dirZ = wp.z - minion.mesh.position.z;
    if (Math.hypot(dirX, dirZ) < 0.6) atWaypoint = true;
  }
  if (atWaypoint) { minion.waypointIndex++; return; }
  const dist = Math.hypot(dirX, dirZ);
  if (dist > 0.0001) { dirX /= dist; dirZ /= dist; }
  // 요청 문서 6/23절 "최종 이동 = 목표 방향 + 아군 Separation" - 목표
  // 방향에 분리력을 섞고 다시 정규화한다.
  let mx = dirX, mz = dirZ;
  const avoid = computeStructureAvoidance(minion, dirX, dirZ);
  if (avoid.x || avoid.z) { mx += avoid.x; mz += avoid.z; const l = Math.hypot(mx, mz); if (l > 1e-4) { mx /= l; mz /= l; } }
  if (sepLen > 0.01) {
    mx += (sep.x / sepLen) * MINION_SEPARATION_WEIGHT;
    mz += (sep.z / sepLen) * MINION_SEPARATION_WEIGHT;
    const len = Math.hypot(mx, mz);
    if (len > 0.0001) { mx /= len; mz /= len; }
  }
  // 83차: 둔화·이속 증가가 실제로 적용된다(예전엔 고정 속도라 미니언 둔화가 표시만 됐다).
  const mSpeed = typeof getUnitMoveSpeedWorld === 'function' ? getUnitMoveSpeedWorld(minion) : minion.moveSpeedWorld;
  minion.mesh.position.x += mx * mSpeed * dt;
  minion.mesh.position.z += mz * mSpeed * dt;
  faceMinionToward(minion, mx, mz); // 요청 20: 이동 벡터를 모델 회전에 그대로 연결
  // 버그 수정(사용자 지적 "붉은 진영 미니언이 바라보는 방향이 이상해") -
  // 포탑/넥서스/억제기와 똑같은 원인이다: RED는 별도의 GLB 에셋 파일
  // (redMelee/redCaster 등)을 쓰는데, 그 파일들의 모델 기본 정면 방향이
  // BLUE 쪽과 다르게 만들어져 있었다. lookAt()은 그 모델의 "정면이 어디인지"
  // 를 모르고 그냥 로컬 -Z를 목표로 돌리기 때문에, 기본 정면이 다른
  // RED 모델은 이동 방향과 어긋난 채로 보인다. 포탑에 적용했던 것과
  // 동일하게 RED만 180도 추가 보정한다.
  if (!inHitFlash && minion.usingRealModel) playAssetClip(minion, `${minion.team} ${minion.type} minion`, MINION_RUN_CLIP);
}
// updateMinionAttack(minion, dt) - 공격 속도 기반 쿨다운 + 애니메이션 재생
// + (요청 15/16) 공격 애니메이션 순환과 실제 타격 시점 분리.
// 요청("미니언의 딜이 이상할정도로 강하게 들어와") - 실제 LoL 위키 확인
// 결과 "미니언은 챔피언을 상대로 60%의 피해만 준다"는 규칙이 있는데
// (포탑을 상대로는 이미 미니언 타입별 turretDamagePercent로 구현돼
// 있었지만, 챔피언을 상대로는 이 감소가 아예 빠져 있었다) - 그래서
// 미니언에게 맞으면 원래 AD 그대로(100%)가 들어가고 있었다.
const MINION_CHAMPION_DAMAGE_PERCENT = 0.60;
function updateMinionAttack(minion, dt) {
  if (minion.isDead) return;
  if (minion._pendingHit && minionSimTime >= minion._pendingHit.at) { const h = minion._pendingHit; minion._pendingHit = null; h.fn(); }
  minion.attackCooldown = Math.max(0, minion.attackCooldown - dt);
  const target = getMinionAttackTarget(minion);
  minion.attackTarget = target;
  if (!target || !isValidMinionTarget(minion, target)) return; // 59차: 인식 범위로 고른 대상이 아직 공격 사거리 밖이면 다가가기만 한다
  const tpos = getWorldPosition(target);
  faceMinionToward(minion, tpos.x - minion.mesh.position.x, tpos.z - minion.mesh.position.z);
  if (minion.attackCooldown > 0) return;
  const cycleTime = 1 / minion.attackSpeed;
  minion.attackCooldown = cycleTime;
  minion._lastAttackAt = performance.now(); // 86차: 추격 포기(4초) 판정용
  const label = `${minion.team} ${minion.type} minion`;
  let hitDelaySec = 0;
  if (minion.usingRealModel && minion.attackClipSequence.length) {
    // 요청 15: 각 미니언 인스턴스가 자신의 attackClipIndex를 따로 갖고
    // 순서대로 순환한다(사망 후 재생성돼도 새 인스턴스라 0부터 다시 시작
    // - 꼬일 걱정이 없다).
    const clipName = minion.attackClipSequence[minion.attackClipIndex % minion.attackClipSequence.length];
    minion.attackClipIndex++;
    const action = playAssetClip(minion, label, clipName, { fade: 0.06, loopOnce: true });
    // 64차: 공격 동작 길이를 공격 주기에 맞춘다 - 클립이 주기보다 길면 다음 공격이 나가도 앞 동작이 끝나지 않아 휘두름과 피해가
    // 어긋나 보였다(막타 타이밍 읽기가 어려웠던 이유 중 하나).
    if (action) { const raw = action.getClip().duration; action.timeScale = raw > cycleTime * 0.95 ? raw / (cycleTime * 0.95) : 1; }
    if (action) {
      const clipDur = action.getClip().duration / (action.timeScale || 1);
      hitDelaySec = Math.min(MINION_CAST_TIME_SEC[minion.type] != null ? MINION_CAST_TIME_SEC[minion.type] : clipDur * 0.5, cycleTime * 0.85); // 요청 16 + 61차: 원작 시전 프레임이 있으면 그 시점
    }
  }
  const applyHit = (target) => {
    if (!target || target.hp <= 0 || target.isDead || target.destroyed) return;
    const dmg = { rawDamage: minion.attackDamage, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isBasicAttack: true, source: minion };
    // 84차: PC 위키 Minion - 미니언은 챔피언과 "구조물"에 60% 피해만 준다(예전엔 구조물엔 100%).
    const structDmg = { ...dmg, rawDamage: dmg.rawDamage * MINION_CHAMPION_DAMAGE_PERCENT };
    if (target.isTurret) {
      minion.hasAttackedStructure = true;
      // 버그 수정: getTurretDamage()는 "포탑이 미니언에게 주는 피해"(포탑
      // AD 기준, target.minionType을 보고 %HP 표준화로 분기) 계산 함수다 -
      // 정반대 방향인 "미니언이 포탑에게 주는 피해"에는 맞지 않는다(방향을
      // 착각하면 포탑의 AD/가열중 수치가 엉뚱하게 미니언 공격력인 것처럼
      // 쓰이게 된다). 미니언→포탑 피해는 그냥 미니언 자신의 AD를 일반
      // 물리 피해로 적용한다 - 포탑 쪽 방어(방패/이중갑옷/요새화)는
      // applyDamageToTurret()이 이미 전부 처리해준다.
      applyDamageToTurret(target, structDmg, { isMinion: true, source: minion });
    } else if (target.isInhibitor) {
      // 요청 12절: 억제기 포탑이 전부 파괴되면 억제기를 공격한다.
      minion.hasAttackedStructure = true;
      applyDamageToInhibitor(target, structDmg);
    } else if (target.isNexus) {
      // 요청 12절: 억제기가 파괴되면 넥서스를 공격한다.
      minion.hasAttackedStructure = true;
      applyDamageToNexus(target, structDmg);
    } else if (target.isMinion) {
      // 85차: 원거리 미니언 평타는 미니언에게 대상 현재 체력 3.5% 추가 피해(25.S1.1~, 4% → 3.5%).
      const onHitPct = (MINION_STATS[minion.type] && MINION_STATS[minion.type].minionOnHitCurrentHpPercent) || 0;
      applyDamageToMinion(target, onHitPct ? { ...dmg, rawDamage: dmg.rawDamage + target.hp * onHitPct } : dmg);
    } else {
      // 챔피언(플레이어) 대상 - 실제 LoL 규칙대로 60%만 적용.
      // 31차: 공격자(미니언)와 평타임을 넘긴다 - 예전엔 출처가 비어 있어 야스오 결의 보호막이 미니언 공격에도
      // 발동했고(원작: 챔피언·몬스터 피해만), 가렌 인내심도 미니언에게 맞으면 멈췄다(원작: 챔피언·포탑·에픽 몬스터만).
      applyDamage(target, { ...dmg, rawDamage: dmg.rawDamage * MINION_CHAMPION_DAMAGE_PERCENT, source: minion, isBasicAttack: true });
    }
  };
  const dealHit = () => {
    if (minion.isDead || !isValidMinionTarget(minion, target)) return; // 요청 16/37: 타격 시점에 대상이 이미 무효화됐으면 피해를 주지 않는다
    const missileSpeedLol = MINION_MISSILE_SPEED_LOL[minion.type];
    if (!missileSpeedLol || typeof projectiles === 'undefined') { applyHit(target); return; }
    // 59차: 원거리·대포 미니언은 투사체를 쏜다(원작 속도 650/1200) - 날아가는 동안 대상이 죽으면 사라진다.
    const from = minion.mesh.position.clone().add(new THREE.Vector3(0, (minion.modelHeight || MINION_MODEL_HEIGHT_WORLD[minion.type] || 1) * 0.6, 0));
    projectiles.spawn({ from, target, speed: lolRangeToWorld(missileSpeedLol), color: minion.team === 'BLUE' ? 0x9fd0ff : 0xffb08f,
      realmId: minion.realmId, team: minion.team, scale: minion.type === 'siege' ? 1.4 : 0.8, onHit: (t) => applyHit(t) });
  };
  if (hitDelaySec > 0) minion._pendingHit = { at: minionSimTime + hitDelaySec, fn: dealHit }; // 60차: 게임 시간 기준, 죽으면 취소
  else dealHit(); // 모델 미로딩(폴백 도형) 시에는 기존처럼 즉시 적용 - 회귀 없음
}
function updateMinionRegeneration(minion, dt) {
  // 요청 39 "함수 분리"를 위한 자리 - 실제 LoL 미니언은 시간 경과에 따른
  // 초당 HP 재생이 없고(포탑처럼 회복하지 않음), 능력치 성장은 새로
  // 스폰되는 개체에만 반영되도록 이미 설계했으므로(스폰 시 고정) 여기선
  // 할 일이 없다 - 이름만 존재하는 명시적 no-op.
}
function rewardMinionKill(minion) {
  // 62차: 막타 골드 + 근처 골드(칼바람 6)는 reward_system.js의 rewardMinionDeath가 맡는다.
  if (typeof rewardMinionDeath === 'function') { rewardMinionDeath(minion); return; }
  const gold = getMinionGoldValue(minion, getTurretGameTimeSec());
  // 59차: 골드는 원작처럼 플레이어가 막타를 친 적 미니언만 준다. 예전엔 어느 팀 미니언이 누구에게 죽든(아군 미니언이
  // 상대 웨이브에 죽어도) 전부 플레이어 골드로 들어갔다.
  if (typeof controller !== 'undefined' && controller && minion._lastHitBy === controller && minion.team !== controller.team) {
    controller.gold = (controller.gold || 0) + gold;
    updateGoldDisplay();
  }
}
function grantMinionExperience(minion) {
  // 요청("LoL 경험치 및 레벨 시스템") - 예전엔 TODO 스텁이었다. 실제
  // 지급 로직(사거리 판정/공유/레벨 보정)은 awardMinionExperience() 하나에
  // 모아뒀다 - killMinion()의 이 호출 지점은 그대로 유지한다.
  awardMinionExperience(minion);
}
// 요청 27/37 - 사망 처리: 공격/이동/타겟팅/포탑공격 즉시 중단, 골드/경험치
// 지급(중복 방지: isDead 가드), Death 애니메이션 재생 후 제거.
let dyingMinions = []; // 버그 방지: minions 배열에서 곧바로 빠지므로, Death
// 클립이 끝날 때까지 mixer.update(dt)를 계속 호출해줄 별도 목록이 없으면
// 사망 애니메이션이 죽은 프레임에서 그대로 멈춰버린다(제거되기 전 1~2초간
// 정지 포즈로 보임) - killMinion()과 updateDyingMinions() 두 곳에서만 쓴다.
function killMinion(minion) {
  if (minion.isDead) return;
  minion.isDead = true;
  minion.destroyed = true;
  minion.attackTarget = null;
  if (minion.healthBar) minion.healthBar.sprite.visible = false; // 요청 22/21-G: 사망 즉시 체력바 숨김
  rewardMinionKill(minion);
  grantMinionExperience(minion);
  // 34차 스코어보드 CS - 플레이어가 마지막으로 때린 미니언만 센다(원작 CS = 마지막 타격).
  if (typeof controller !== 'undefined' && controller && minion._lastHitBy === controller && typeof ensureScore === 'function') ensureScore(controller).cs += 1;
  // 아리 패시브(정기 흡수) - 아리가 마지막으로 때린 미니언이 죽으면 스택 1개.
  if (typeof controller !== 'undefined' && controller && controller.championId === 'ahri'
      && minion._lastHitBy === controller && typeof controller._ahriOnMinionKill === 'function') {
    controller._ahriOnMinionKill();
  }
  // 아이템 패시브 "수확"(수확의 낫) - 플레이어가 마지막으로 때린 미니언이
  // 죽으면 골드 누적. 챔피언 종류와 무관한 범용 아이템 훅이라 위 아리
  // 패시브와 별개로 둔다.
  if (typeof controller !== 'undefined' && controller && minion._lastHitBy === controller
      && typeof itemOnMinionKillByPlayer === 'function') {
    itemOnMinionKillByPlayer(controller);
  }
  // 바루스 패시브(살아있는 복수) - 유닛 처치 시 공격 속도.
  if (typeof controller !== 'undefined' && controller && controller.championId === 'varus'
      && minion._lastHitBy === controller && typeof controller._varusOnKill === 'function') {
    controller._varusOnKill(minion, false);
  }
  // 가렌 W(용기) 패시브 - 가렌이 마지막으로 때린 미니언이 죽으면 처치 스택.
  if (typeof controller !== 'undefined' && controller && controller.championId === 'garen'
      && minion._lastHitBy === controller && typeof controller._garenOnTakedown === 'function') {
    controller._garenOnTakedown();
  }
  minions = minions.filter((m) => m !== minion); // 요청 18-7: 다른 AI가 더 이상 살아있는 유닛으로 인식하지 않게 즉시 목록에서 제거
  if (typeof controller !== 'undefined' && controller && controller.currentTarget === minion) {
    controller.currentTarget = null;
    if (controller.attackOrderActive) {
      controller.attackOrderAnchor = minion;
      controller.isChasing = false;
    } else {
      targetRing.clear();
    }
  }
  const deathClip = MINION_DEATH_CLIP[minion.type];
  let removeDelayMs = 900; // 폴백(모델 미로딩 시) 고정 지연
  if (minion.usingRealModel) {
    const action = playAssetClip(minion, `${minion.team} ${minion.type} minion`, deathClip, { fade: 0.08, loopOnce: true });
    if (action) removeDelayMs = (action.getClip().duration / (action.timeScale || 1)) * 1000;
    if (minion.mixer) dyingMinions.push(minion);
  }
  setTimeout(() => { disposeMinionHealthBar(minion); scene.remove(minion.mesh); dyingMinions = dyingMinions.filter((m) => m !== minion); }, removeDelayMs);
}
function updateDyingMinions(dt) { for (const m of dyingMinions) safeMixerUpdate(m.mixer, dt, `dyingMinion:${m.team}:${m.type}`); }
function updateMinionCombat(minion, dt) {
  if (minion.mesh) minion.mesh.visible = true;
  if (minion.mixer) safeMixerUpdate(minion.mixer, dt, `minion:${minion.team}:${minion.type}`);
  updateMinionHealthBarVisibility(minion); // 요청 21-F/21-G: 거리/사망에 따라 표시 여부·투명도 갱신
  // 버그 수정(운명의 재 발화를 추가하며 발견): tickStatusEffects()(DOT 틱 +
  // CC 만료 처리)가 지금까지 플레이어/더미에만 호출되고 미니언에는 한
  // 번도 호출된 적이 없었다 - 미니언에 DOT를 걸어도(다리우스 출혈이
  // 미니언을 벨 수 있는 스킬이 아직 없어 드러나지 않았던 문제) 최초
  // 틱 이후로는 실제 피해가 들어가지 않고 상태이상도 만료되지 않은 채
  // 배열에 계속 남아있었다. dummy_enemy.js 쪽 tickOneDummy()와 동일한
  // 이유로 여기에도 추가한다.
  if (typeof tickStatusEffects === 'function') tickStatusEffects(minion, dt);
  if (minion.isDead || minion.hp <= 0) { killMinion(minion); return; }
  // 버그 수정(기존 한계 "미니언은 CC에 반응하지 않음" 해소): 기절/공중에 뜸/제압/매혹 중에는
  // 이동·공격 모두 불가, 속박 중에는 이동만 불가(공격은 가능) - 챔피언과 같은 규칙.
  // 노틸러스 패시브/E, 리 신 R 충돌, 야스오 Q3, 요네 R 등으로 미니언이 실제로 멈춘다.
  // 61차: 게임이 끝나면(넥서스 파괴) 미니언은 멈추고 이긴 팀은 Win, 진 팀은 Lose 동작을 한다.
  if (gameEnded) {
    if (minion.usingRealModel && !minion._endPlayed) {
      const winner = nexusBuildings.some((n) => n.destroyed && n.team !== minion.team);
      playAssetClip(minion, `${minion.team} ${minion.type} minion`, winner ? 'Win1' : 'Lose1', { fade: 0.2, loopOnce: true });
      minion._endPlayed = true;
    }
    return;
  }
  const minionStunned = typeof isStunned === 'function' && isStunned(minion);
  // 61차: 기절·공중에 뜸 동안 Stunned 동작(원작 클립) - 예전엔 대기 자세로 서 있었다.
  if (minionStunned && minion.usingRealModel && minion.actions) playAssetClip(minion, `${minion.team} ${minion.type} minion`, minion.actions.Stunned ? 'Stunned' : MINION_IDLE_CLIP, { fade: 0.1 }); // 클립이 없는 모델(블루 근거리 등)은 대기 자세
  const minionRooted = typeof isRooted === 'function' && isRooted(minion);
  if (!minionStunned && !minionRooted && !minion._pullState) updateMinionMovement(minion, dt);
  // 60차: 미니언도 챔피언처럼 맵 이동 범위 안에 묶는다 - 예전엔 챔피언을 쫓거나 밀려나다 다리 밖(허공)으로 걸어 나갈 수 있었다.
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.group && typeof howlingAbyssMap.clampPosition === 'function') howlingAbyssMap.clampPosition(minion.mesh.position);
  resolveMinionStructureCollisions(minion); // 60차: 이번 프레임 이동 "뒤"에도 구조물 겹침을 푼다(예전엔 이동 전에만 풀어 한 프레임 이동분만큼 파고들었다)
  if (!minionStunned) updateMinionAttack(minion, dt);
  updateMinionRegeneration(minion, dt);
}
// 플레이어가 미니언을 공격할 때 쓰는 진입점(포탑의 applyDamageToTurret과
// 동일한 이유) - 일반 applyDamage()는 target.takeDamage가 없는 대상을
// damageEnemy()로 보내는데, damageEnemy()는 "죽으면 4초 뒤 풀피로 부활"
// 하는 학습용 더미 전용 로직까지 함께 갖고 있다. 미니언은 실제로 죽어서
// 사라지고 골드/경험치를 줘야 하므로(killMinion) 그 경로를 타면 안 된다.
function applyDamageToMinion(minion, result, fromPlayer = false) {
  if (!minion || minion.isDead) return 0;
  // 90차(QA): 플레이어 피해가 아닌데 공격자가 비어 있으면(구조물·환경 피해) 플레이어로 대체되지 않게 한다 - 대체되면 플레이어의
  // 피해 증폭 아이템·탈진 같은 상태가 그 피해에 붙었다(예: 우물 고정 피해 1000 → 쇼진 1200, 탈진 650).
  if (!fromPlayer && result && !result.source) result = { ...result, source: { isStructure: true } };
  // 85차: 칼바람 오라 - 근접 챔피언의 기본 공격은 공성·슈퍼 미니언에게 20% 추가 피해(PC 위키 Howling Abyss aura).
  if (fromPlayer && result && result.isBasicAttack && (minion.type === 'siege' || minion.type === 'super')
      && typeof controller !== 'undefined' && controller && typeof isRangedAttacker === 'function' && !isRangedAttacker(controller)
      && typeof isAramRulesActive === 'function' && isAramRulesActive()) result = { ...result, rawDamage: (result.rawDamage || 0) * 1.2 };
  const finalDmg = calculateDamage({ ...result, target: minion });
  minion._lastDamageTakenAmount = finalDmg;
  minion.hp = Math.max(0, minion.hp - finalDmg);
  updateMinionVisual(minion);
  drawMinionHealthBar(minion); // 요청 23: 체력바가 실제 HP보다 늦게 줄어들지 않도록 즉시 갱신
  // 버그 수정(두 팀 확장으로 새로 드러남): 이 함수는 플레이어 공격뿐 아니라
  // 미니언↔미니언/포탑↔미니언 전투에서도 공용으로 쓰인다 - 예전처럼
  // 무조건 lastAttackedByPlayerAt을 갱신하면, 적 미니언에게 맞았을 뿐인데
  // "방금 플레이어가 나를 공격했다"고 착각해 요청 20-A 2순위(자신을
  // 공격 중인 적 챔피언) 판정이 잘못 발동한다. 실제로 플레이어(챔피언)가
  // 원인일 때만(fromPlayer===true) 갱신한다.
  if (!fromPlayer) minion._lastHitBy = result.source || null; // 59차: 마지막 타격이 미니언·포탑이면 플레이어 막타(골드·CS)가 아니다
  if (fromPlayer) {
    minion.lastAttackedByPlayerAt = performance.now();
    if (typeof controller !== 'undefined' && controller) {
      minion._lastHitBy = controller;
      minion._lastChampionAttacker = controller; minion._lastChampionAttackedAt = minion.lastAttackedByPlayerAt; // 59차 미니언 어그로 5순위
      // 아이템 패시브 "모든 피해 흡혈"(도란의 검/활)/"생명력 흡수"(흡혈의
      // 낫, 물리 피해 전용) - 미니언 피해도 실제 LoL처럼 흡혈 대상에
      // 포함된다(구조물 피해만 제외).
      if (typeof applyItemVamp === 'function') applyItemVamp(controller, finalDmg, { target: minion, isBasicAttack: !!result.isBasicAttack, isStatusTick: !!result.isStatusTick, isAoE: !!result.isAoE, isPet: !!result.isPet }); // 83차: 광역·도트 33%
      if (typeof applyItemPhysicalVamp === 'function') applyItemPhysicalVamp(controller, finalDmg, result.damageType || DAMAGE_TYPE.PHYSICAL, !!result.isBasicAttack);
      // 운명의 재(발화)/여신의 눈물(마나순환) - 챔피언 전용 효과(그리버스/
      // 카탈리스트 마나 회복)는 itemOnDamageDealt() 내부에서 target.isChampion
      // 으로 걸러지므로 미니언 대상으로 호출해도 안전하다.
      if (typeof itemOnDamageDealt === 'function') itemOnDamageDealt(controller, minion, finalDmg, result.damageType || DAMAGE_TYPE.PHYSICAL, { isBasicAttack: !!result.isBasicAttack, isStatusTick: !!result.isStatusTick, isItemEffect: !!result.isItemEffect, isAbility: result.isAbility });
    }
  }
  if (minion.hp <= 0) { killMinion(minion); return finalDmg; }
  // 요청("미니언 모션 최소 요구: Idle/Move/Attack/Hit/Death, 우선순위
  // Death>Attack>Hit>Move>Idle") - 피격 애니메이션을 재생한다. 짧은 창
  // (250ms) 동안은 updateMinionMovement의 Idle/Move 요청을 건너뛰게 해서
  // 실제로 화면에 보이게 한다 - 공격 중이면 updateMinionAttack이 그
  // 프레임에 곧바로 Attack 클립을 다시 요청하므로 Attack이 자연스럽게
  // Hit보다 우선한다(별도 우선순위 코드 없이 호출 순서만으로 해결).
  if (minion.usingRealModel) {
    const hitAction = playAssetClip(minion, `${minion.team} ${minion.type} minion`, 'Hit', { fade: 0.05, loopOnce: true });
    if (hitAction) minion._hitFlashUntil = performance.now() + 250;
  }
  return finalDmg;
}
function updateMinionVisual(minion) {
  if (minion.body && minion.body.material) {
    // 버그 수정(Phase 1 요청 5: "Hit Flash와 Material 충돌 검사" -
    // "반복 setTimeout 누적 여부 확인") - 타이머가 매 피격마다 무한정
    // 쌓이던 문제를 인스턴스당 타이머 id 하나로 취소/재예약해서 해결한다.
    // 이 함수 자체는 applyDamageToMinion() 맨 위의 `if (minion.isDead)
    // return` 가드 덕분에 이미 죽은 미니언에서는 애초에 호출되지 않는다
    // (새 발광을 "켜는" 쪽은 이미 안전). 콜백(끄는 쪽)에는 isDead 가드를
    // 넣지 않는다 - 죽는 순간의 마지막 피격 발광이 Death 연출 중 계속
    // 빨갛게 눌어붙는 문제가 있었기 때문에(재검증 2차 수정) 끄기는 상태와
    // 무관하게 항상 실행되어야 한다.
    clearTimeout(minion._hitFlashTimerId);
    // 59차: 발광 속성이 없는 재질(GLB unlit = MeshBasicMaterial)에 emissive를 새로 만들어 넣으면 three.js가 그 재질을 그릴 때
    // uniforms.emissive가 없어 매 프레임 예외를 던졌다 - 원래 발광을 지원하는 재질에서만 번쩍인다.
    if (!minion.body.material.emissive || !minion.body.material.emissive.isColor) return;
    minion.body.material.emissive.setHex(0xff3333);
    minion.body.material.emissiveIntensity = 0.8;
    // 재검증(2차) 수정: 포탑과 동일한 이유로 !minion.isDead 가드를 제거한다
    // - 죽는 순간의 마지막 피격 발광이 Death 애니메이션 재생 중(제거되기
    // 전 약 0.9초) 계속 빨갛게 눌어붙어 있던 문제를 없앤다. "끄기"는
    // 항상 안전하므로 상태와 무관하게 실행한다.
    minion._hitFlashTimerId = setTimeout(() => {
      if (minion.body && minion.body.material) minion.body.material.emissiveIntensity = 0;
    }, 120);
  }
}
function updateMinionWaveSpawner(gameTimeSec) {
  if (gameTimeSec < MINION_FIRST_WAVE_SEC || gameEnded) return;
  if (typeof howlingAbyssStructuresSpawned !== 'undefined' && !howlingAbyssStructuresSpawned) return; // 59차: 맵·넥서스가 없는 연습 공간에서는 웨이브가 없다
  // 85차: 다음 웨이브 시각을 일정표로 잡는다(예전엔 "지금"을 기준으로 다시 세서 웨이브마다 한 프레임씩 밀렸다).
  if (!isFinite(lastMinionWaveSec) || gameTimeSec < lastMinionWaveSec) lastMinionWaveSec = MINION_FIRST_WAVE_SEC - getMinionWaveIntervalSec(MINION_FIRST_WAVE_SEC);
  if (gameTimeSec - lastMinionWaveSec >= getMinionWaveIntervalSec(lastMinionWaveSec)) {
    lastMinionWaveSec += getMinionWaveIntervalSec(lastMinionWaveSec);
    if (gameTimeSec - lastMinionWaveSec > 5) lastMinionWaveSec = gameTimeSec; // 시간을 크게 건너뛰면(연습 도구) 밀린 웨이브를 몰아 내지 않는다
    // 요청 문서 13절: 게임 시작 → RED 웨이브 생성 / BLUE 웨이브 생성이
    // 동시에 일어난다 - 같은 타이머에서 양 팀을 함께 스폰한다.
    spawnMinionWave('BLUE', gameTimeSec);
    spawnMinionWave('RED', gameTimeSec);
  }
}
function updateMinions(dt) {
  minionSimTime += dt;
  if (pendingMinionSpawns.length) {
    const due = pendingMinionSpawns.filter((p) => minionSimTime >= p.at);
    if (due.length) {
      pendingMinionSpawns = pendingMinionSpawns.filter((p) => minionSimTime < p.at);
      for (const p of due) if (!gameEnded) { const m = createMinion(p.type, p.pos, p.gameTimeSec, p.team); m.laneOffset = p.laneOffset || 0; minions.push(m); }
    }
  }
  const gameTimeSec = getTurretGameTimeSec();
  updateMinionWaveSpawner(gameTimeSec);
  for (const m of [...minions]) updateMinionCombat(m, dt);
  resolveMinionMinionOverlaps(); // 85차
}
// 85차: 미니언끼리 몸통이 파고들지 않게 매 프레임 겹친 만큼 서로 밀어낸다(양 팀 모두). 예전엔 같은 팀 분리 "힘"만 있어
// 빽빽한 웨이브·두 팀 전열이 서로 겹쳐 보였다. 겹친 양의 절반씩 양쪽으로(공격 중인 쪽은 덜 밀리게 가중치).
function resolveMinionMinionOverlaps() {
  const list = minions.filter((m) => !m.isDead && m.mesh);
  for (let i = 0; i < list.length; i++) {
    const a = list[i], pa = a.mesh.position, ra = getCollisionRadius(a);
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], pb = b.mesh.position, rb = getCollisionRadius(b);
      let dx = pb.x - pa.x, dz = pb.z - pa.z; const need = (ra + rb) * 0.9;
      const d2 = dx * dx + dz * dz; if (d2 >= need * need) continue;
      let d = Math.sqrt(d2); if (d < 1e-4) { dx = (i % 2 ? 1 : -1) * 0.01; dz = 0.01; d = Math.hypot(dx, dz); }
      const push = need - d, nx = dx / d, nz = dz / d;
      const wa = a._pullState ? 0 : (b._pullState ? 1 : 0.5), wb = 1 - wa;
      pa.x -= nx * push * wa; pa.z -= nz * push * wa;
      pb.x += nx * push * wb; pb.z += nz * push * wb;
    }
  }
}

let dummy = null;
let placedDummies = []; // 요청: 사용자가 직접 설치하는 추가 허수아비들
let dummyPlaceMode = false;

