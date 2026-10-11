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
const EXP_RANGE_LOL = 1300; // 요청 3: 경험치 획득 판정 사거리(LoL 기준 수치)
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
    && getHorizontalDistance(getWorldPosition(turret), m.mesh.position) <= range);
}

// 1. 웨이브 생성 - spawnMinionWave(gameTime, lane). 이 데모엔 라인이
// 사실상 하나뿐이라(포탑도 한 줄로만 배치했다) lane 인자는 받아만 두고
// 실제로는 무시한다 - 나중에 라인이 여러 개로 늘어나면 이 함수 시그니처를
// 바꿀 필요 없이 내부 로직만 확장하면 된다.
let minions = [];
let minionWaveCounter = 0; // BLUE 웨이브 카운터(기존 이름 유지 - 하위 호환)
let redMinionWaveCounter = 0;
let lastMinionWaveSec = -Infinity;
function shouldSpawnSiegeThisWave(waveIndex, gameTimeSec) {
  const window = MINION_SIEGE_WINDOWS.find((w) => gameTimeSec >= w.fromSec && gameTimeSec < w.toSec);
  if (!window) return false; // 2:05 이전
  return waveIndex % window.everyNWaves === 0;
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
function spawnMinionWave(team, gameTimeSec) {
  const waveIndex = team === 'RED' ? ++redMinionWaveCounter : ++minionWaveCounter;
  const spawnPoint = getMinionSpawnPoint(team);
  const waypoints = getMinionLaneWaypoints(team);
  // 전진 방향 단위벡터: 스폰 지점 → 첫 웨이포인트.
  const forward = new THREE.Vector3().subVectors(waypoints[0], spawnPoint); forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, team === 'RED' ? -1 : 1); else forward.normalize();
  const spacing = 1.1;
  const composition = [];
  const spawnSuper = shouldSpawnSuperMinion(team);
  const spawnCannon = !spawnSuper && shouldSpawnCannonMinion(waveIndex, gameTimeSec); // 요청 3/32: 슈퍼+공성 동시 조합 금지
  if (spawnSuper) composition.push(MINION_TYPE.SUPER);
  composition.push(MINION_TYPE.MELEE, MINION_TYPE.MELEE, MINION_TYPE.MELEE);
  if (spawnCannon) composition.push(MINION_TYPE.SIEGE);
  composition.push(MINION_TYPE.CASTER, MINION_TYPE.CASTER, MINION_TYPE.CASTER);
  composition.forEach((type, idx) => {
    // 진행 방향 선두(슈퍼)부터 뒤로 갈수록 -forward*spacing*idx 만큼 밀려서
    // 일렬 대형을 이룬다(요청 8-D). 좌우로는 살짝만 지그재그를 줘서 완전히
    // 겹쳐 보이지 않게 한다.
    const lateral = new THREE.Vector3(-forward.z, 0, forward.x).multiplyScalar((idx % 2 === 0 ? -1 : 1) * 0.35);
    const pos = spawnPoint.clone().addScaledVector(forward, -spacing * idx).add(lateral);
    setTimeout(() => { minions.push(createMinion(type, pos, gameTimeSec, team)); }, idx * 100); // 요청 8-E: 0.1초 간격 소환
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
const MINION_HEAD_HEIGHT = { melee: 0.95, caster: 0.85, siege: 1.15, super: 1.55 };
const MINION_HEALTHBAR_CANVAS_W = 64, MINION_HEALTHBAR_CANVAS_H = 8;
const MINION_HEALTHBAR_NEAR_DIST = 14;   // 이 거리 안 - 100% 표시(요청 21-F)
const MINION_HEALTHBAR_MID_DIST = 26;    // 중간 거리 - 70~80%
const MINION_HEALTHBAR_MAX_DIST = 40;    // 이 거리 밖 - 완전히 숨김
function createMinionHealthBar(group, radius, headY) {
  const canvas = document.createElement('canvas');
  canvas.width = MINION_HEALTHBAR_CANVAS_W; canvas.height = MINION_HEALTHBAR_CANVAS_H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  // 요청 21-A: width ≈ 몸통 폭의 1.3~1.6배, height ≈ width의 0.08~0.12배(매우 얇게).
  const bodyWidth = Math.max(0.2, radius * 2);
  const width = bodyWidth * 1.45, height = width * 0.10;
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 999;
  sprite.position.set(0, headY, 0);
  group.add(sprite);
  return { sprite, canvas, ctx, texture, headY };
}
function drawMinionHealthBar(minion) {
  const hb = minion.healthBar;
  if (!hb) return;
  const ratio = THREE.MathUtils.clamp(minion.hp / minion.maxHp, 0, 1); // 요청 21-C
  const w = MINION_HEALTHBAR_CANVAS_W, h = MINION_HEALTHBAR_CANVAS_H;
  const ctx = hb.ctx;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,6,6,0.92)'; // 요청 21-C-1: 어두운 외곽 테두리/배경(실제 LoL처럼 진하게)
  ctx.fillRect(0, 0, w, h);
  // 요청 21-D: 팀 색상으로 적/아군 구분(너무 밝지 않은 톤).
  ctx.fillStyle = minion.team === 'RED' ? '#e0473f' : '#4f8fe0';
  ctx.fillRect(1, 1, Math.max(0, (w - 2) * ratio), h - 2);
  // 실제 LoL 체력바처럼 밝은 테두리 한 줄을 더해 윤곽을 또렷하게 한다.
  ctx.strokeStyle = 'rgba(230,230,230,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  hb.texture.needsUpdate = true; // 요청 23: HP 반영과 동시에 즉시 갱신(지연 없음)
}
function updateMinionHealthBarVisibility(minion) {
  const hb = minion.healthBar;
  if (!hb) return;
  if (minion.isDead) { hb.sprite.visible = false; return; } // 요청 22/21-G: 사망 시 즉시 숨김
  // 요청("아예 지정 대상한테 고정") - 다른 코드가 실수로 건드리든, 부동
  // 소수점 오차가 누적되든 상관없이 매 프레임 제자리로 다시 못박는다.
  hb.sprite.position.set(0, hb.headY, 0);
  if (typeof camera === 'undefined' || !camera) { hb.sprite.visible = false; return; }
  const dist = getHorizontalDistance(minion.mesh.position, camera.position);
  if (dist > MINION_HEALTHBAR_MAX_DIST) { hb.sprite.visible = false; return; } // 요청 21-F: 너무 멀면 숨김
  hb.sprite.visible = true;
  hb.sprite.material.opacity = dist > MINION_HEALTHBAR_MID_DIST ? 0.45 : (dist > MINION_HEALTHBAR_NEAR_DIST ? 0.78 : 1);
}
function disposeMinionHealthBar(minion) {
  const hb = minion.healthBar;
  if (!hb) return;
  if (hb.sprite.parent) hb.sprite.parent.remove(hb.sprite);
  hb.texture.dispose();
  hb.sprite.material.dispose();
}

function createMinion(type, position, gameTimeSec, team = 'BLUE') {
  const stats = getMinionStats(type, gameTimeSec);
  const assetKey = team.toLowerCase() + type[0].toUpperCase() + type.slice(1);
  const asset = minionBuildingAssets[assetKey];
  let group, body, mixer = null, actions = null, usingRealModel = false;
  if (asset) {
    const inst = instantiateMinionBuildingAsset(assetKey);
    group = inst.root; body = inst.body; mixer = inst.mixer; actions = inst.actions;
    usingRealModel = true;
  } else {
    // GLB 미로딩 시 폴백(요청 22 "모델 로딩 실패해도 게임이 멈추면 안 된다") -
    // 기존에 이미 쓰던 임시 도형을 그대로 유지한다.
    const shape = { melee: () => new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), caster: () => new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), siege: () => new THREE.BoxGeometry(0.55, 0.7, 0.55), super: () => new THREE.ConeGeometry(0.35, 1.2, 6) }[type]();
    const color = { melee: 0x996633, caster: 0x6633cc, siege: 0xcc6622, super: 0xffcc22 }[type];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    body = new THREE.Mesh(shape, mat);
    body.position.y = 0.5; body.castShadow = true;
    group = new THREE.Group(); group.add(body);
  }
  // 버그 수정("hp바가 제자리에서 벗어나는 버그... 아예 지정대상한테
  // 고정") - 예전엔 bounding box를 한 번 재서 머리 위 높이를 정했는데,
  // GLB가 아직 애니메이션을 한 프레임도 재생하기 전(bind pose) 상태에서
  // 측정되면 실제 Idle/Walk 포즈의 실루엣과 달라 체력바가 살짝 어긋나
  // 보였다. 미니언 종류별 고정 높이표(MINION_HEAD_HEIGHT)를 쓰는 걸로
  // 바꿔서 절대 흔들리지 않게 했다.
  const headY = (MINION_HEAD_HEIGHT[type] || 1.0) + 0.15;
  group.position.copy(position);
  scene.add(group);
  group.add(createBlobShadow(0.32)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자
  const healthBar = createMinionHealthBar(group, 0.3, headY);
  // 요청("미니언 크기를 1.4배 키워줘") - 몸체/체력바/그림자를 전부 만든
  // "뒤에" group 전체를 균일 확대한다. 먼저 스케일부터 걸면 자식으로
  // 추가되는 체력바/그림자까지 부모 스케일과 이중으로 곱해져서 위치와
  // 크기가 어긋난다 - 순서를 반드시 이렇게 지켜야 한다.
  // 요청("미니언 1.3배정도 크기를 키워줘") - 기존 1.4배에 추가로 1.3배 더 확대(1.4*1.3=1.82).
  const MINION_SCALE = 1.82;
  group.scale.setScalar(MINION_SCALE);
  const minion = {
    mesh: group, body, type, minionType: type, team,
    mixer, actions, currentAction: null, currentClipName: null, usingRealModel,
    attackClipSequence: (MINION_ATTACK_CLIPS[type] && MINION_ATTACK_CLIPS[type][team]) || [], attackClipIndex: 0,
    isMinion: true, isChampion: false, isMonster: true, isTrainingDummy: false, isTurret: false,
    hp: stats.hp, maxHp: stats.maxHp, armor: stats.armor, magicResist: stats.magicResist,
    attackDamage: stats.ad, attackSpeed: stats.attackSpeed, attackRange: stats.range,
    moveSpeedWorld: lolRangeToWorld(stats.moveSpeedLol),
    radius: 0.3 * MINION_SCALE, collisionRadius: 0.3 * MINION_SCALE, selectionRadius: 0.3 * MINION_SCALE * 1.6, healthBar,
    waypointIndex: 0, attackCooldown: 0, attackTarget: null, pendingHitTimer: null,
    hasAttackedStructure: false, // 요청 14/36: 한번 true가 되면 그 미니언 생존 동안 절대 false로 되돌리지 않는다(포탑/억제기/넥서스 전부 포함)
    lastAttackedByPlayerAt: 0, isDead: false, destroyed: false, realmId: 'main',
    spawnedAt: gameTimeSec, spawnWaveIndex: team === 'RED' ? redMinionWaveCounter : minionWaveCounter,
  };
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
  // team 필드가 있는 대상(미니언/포탑/억제기/넥서스)은 반드시 서로 다른 팀이어야
  // 유효한 적이다 - 같은 편은 아예 공격 후보에서 제외한다(요청 10).
  if (target.team && target.team === minion.team) return false;
  if (!canRealmInteract(minion, target)) return false;
  const range = lolRangeToWorld(minion.attackRange);
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
  const range = lolRangeToWorld(minion.attackRange);
  return getHorizontalDistance(minion.mesh.position, getWorldPosition(champion)) <= range;
}
function getMinionAttackTarget(minion) {
  if (minion.isDead) return null;
  // 0순위(요청 0/14/36, 두 팀 확장에서도 유지): 이미 구조물(포탑/억제기/
  // 넥서스)을 공격 중이면 그 의지를 유지한다 - hasAttackedStructure는
  // 한번 true가 되면 이 미니언이 죽을 때까지 계속 true다.
  if (minion.hasAttackedStructure && minion.attackTarget && minion.attackTarget.isStructure && isValidMinionTarget(minion, minion.attackTarget)) {
    return minion.attackTarget;
  }
  // 1순위: 가까운 적 미니언
  const nearestMinion = findNearestEnemyMinion(minion);
  if (nearestMinion) return nearestMinion;
  // 2순위(요청 20-A): 자신을 공격하고 있는 적 챔피언 - 최근 5초 내 플레이어에게
  // 피격당했다면 그 반격 의지를 우선한다(기존 보강 규칙 그대로 유지).
  if (typeof controller !== 'undefined' && controller && performance.now() - minion.lastAttackedByPlayerAt < 5000 && isValidChampionTarget(minion, controller)) {
    return controller;
  }
  // 3순위(요청 20-A): 가까운 적 챔피언 - 공격당한 적이 없어도 사거리
  // 안에 들어오면 능동적으로 인식한다(실제 LoL 미니언 어그로와 동일).
  if (typeof controller !== 'undefined' && controller && isValidChampionTarget(minion, controller)) {
    return controller;
  }
  // 4순위: 아군 미니언을 공격 중인 적 포탑을 우선 도와준다(기존 유지) → 없으면 가장 가까운 적 포탑.
  const engagedTurret = findTurretAttackingAllyMinion(minion);
  if (engagedTurret) return engagedTurret;
  const nearestTurret = findNearestValidTurret(minion);
  if (nearestTurret) return nearestTurret;
  // 5순위: 적 억제기
  const nearestInhib = findNearestValidInhibitor(minion);
  if (nearestInhib) return nearestInhib;
  // 6순위: 적 넥서스
  const nearestNexus = findNearestValidNexus(minion);
  if (nearestNexus) return nearestNexus;
  return null;
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
    const minDist = (s.collisionRadius || s.radius || 0) + ctrl.collisionRadius;
    let dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= minDist) continue;
    if (dist < 0.001) { dx = 1; dz = 0; dist = 1; } // 완전히 중심에 겹친 극단값
    else if (Math.abs(dx) < 0.05) { dx = 0.3; dist = Math.sqrt(dx * dx + dz * dz); } // 정면 일직선 부딪힘 방지(미니언과 동일한 처리)
    const push = minDist - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
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
    if (m === minion || m.isDead || m.team !== minion.team) continue;
    const dx = minion.mesh.position.x - m.mesh.position.x;
    const dz = minion.mesh.position.z - m.mesh.position.z;
    const distSq = dx * dx + dz * dz;
    const minDist = minion.collisionRadius + m.collisionRadius + MINION_SEPARATION_RADIUS;
    if (distSq < 1e-6 || distSq > minDist * minDist) continue;
    const dist = Math.sqrt(distSq);
    const closeness = 1 - dist / minDist;
    fx += (dx / dist) * closeness;
    fz += (dz / dist) * closeness;
  }
  return { x: fx, z: fz };
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
    if (sepLen > 0.01) {
      minion.mesh.position.x += (sep.x / sepLen) * MINION_SEPARATION_WEIGHT * dt;
      minion.mesh.position.z += (sep.z / sepLen) * MINION_SEPARATION_WEIGHT * dt;
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
    const wp = waypoints[minion.waypointIndex];
    if (!wp) { if (!inHitFlash && minion.usingRealModel) playAssetClip(minion, `${minion.team} ${minion.type} minion`, MINION_IDLE_CLIP); return; } // 라인 끝(상대 진영 끝까지 전부 통과함)
    dirX = wp.x - minion.mesh.position.x; dirZ = wp.z - minion.mesh.position.z;
    if (Math.hypot(dirX, dirZ) < 0.4) atWaypoint = true;
  }
  if (atWaypoint) { minion.waypointIndex++; return; }
  const dist = Math.hypot(dirX, dirZ);
  if (dist > 0.0001) { dirX /= dist; dirZ /= dist; }
  // 요청 문서 6/23절 "최종 이동 = 목표 방향 + 아군 Separation" - 목표
  // 방향에 분리력을 섞고 다시 정규화한다.
  let mx = dirX, mz = dirZ;
  if (sepLen > 0.01) {
    mx += (sep.x / sepLen) * MINION_SEPARATION_WEIGHT;
    mz += (sep.z / sepLen) * MINION_SEPARATION_WEIGHT;
    const len = Math.hypot(mx, mz);
    if (len > 0.0001) { mx /= len; mz /= len; }
  }
  minion.mesh.position.x += mx * minion.moveSpeedWorld * dt;
  minion.mesh.position.z += mz * minion.moveSpeedWorld * dt;
  const dir = new THREE.Vector3(mx, 0, mz);
  minion.body.lookAt(minion.body.position.clone().add(dir)); // 요청 20: 이동 벡터를 모델 회전에 그대로 연결
  // 버그 수정(사용자 지적 "붉은 진영 미니언이 바라보는 방향이 이상해") -
  // 포탑/넥서스/억제기와 똑같은 원인이다: RED는 별도의 GLB 에셋 파일
  // (redMelee/redCaster 등)을 쓰는데, 그 파일들의 모델 기본 정면 방향이
  // BLUE 쪽과 다르게 만들어져 있었다. lookAt()은 그 모델의 "정면이 어디인지"
  // 를 모르고 그냥 로컬 -Z를 목표로 돌리기 때문에, 기본 정면이 다른
  // RED 모델은 이동 방향과 어긋난 채로 보인다. 포탑에 적용했던 것과
  // 동일하게 RED만 180도 추가 보정한다.
  if (minion.team === 'RED') minion.body.rotateY(Math.PI);
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
  minion.attackCooldown = Math.max(0, minion.attackCooldown - dt);
  const target = getMinionAttackTarget(minion);
  minion.attackTarget = target;
  if (!target || minion.attackCooldown > 0) return;
  const cycleTime = 1 / minion.attackSpeed;
  minion.attackCooldown = cycleTime;
  const label = `${minion.team} ${minion.type} minion`;
  let hitDelaySec = 0;
  if (minion.usingRealModel && minion.attackClipSequence.length) {
    // 요청 15: 각 미니언 인스턴스가 자신의 attackClipIndex를 따로 갖고
    // 순서대로 순환한다(사망 후 재생성돼도 새 인스턴스라 0부터 다시 시작
    // - 꼬일 걱정이 없다).
    const clipName = minion.attackClipSequence[minion.attackClipIndex % minion.attackClipSequence.length];
    minion.attackClipIndex++;
    const action = playAssetClip(minion, label, clipName, { fade: 0.06, loopOnce: true });
    if (action) {
      const clipDur = action.getClip().duration / (action.timeScale || 1);
      hitDelaySec = Math.min(clipDur * 0.5, cycleTime * 0.85); // 요청 16: 실제 타격 프레임 근사(클립 중간 지점) - 공격 주기를 넘지 않게 clamp
    }
  }
  const dealHit = () => {
    if (minion.isDead || !isValidMinionTarget(minion, target)) return; // 요청 16/37: 타격 시점에 대상이 이미 무효화됐으면 피해를 주지 않는다
    const dmg = { rawDamage: minion.attackDamage, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isBasicAttack: true, source: minion };
    if (target.isTurret) {
      minion.hasAttackedStructure = true;
      // 버그 수정: getTurretDamage()는 "포탑이 미니언에게 주는 피해"(포탑
      // AD 기준, target.minionType을 보고 %HP 표준화로 분기) 계산 함수다 -
      // 정반대 방향인 "미니언이 포탑에게 주는 피해"에는 맞지 않는다(방향을
      // 착각하면 포탑의 AD/가열중 수치가 엉뚱하게 미니언 공격력인 것처럼
      // 쓰이게 된다). 미니언→포탑 피해는 그냥 미니언 자신의 AD를 일반
      // 물리 피해로 적용한다 - 포탑 쪽 방어(방패/이중갑옷/요새화)는
      // applyDamageToTurret()이 이미 전부 처리해준다.
      applyDamageToTurret(target, dmg, { isMinion: true, source: minion });
    } else if (target.isInhibitor) {
      // 요청 12절: 억제기 포탑이 전부 파괴되면 억제기를 공격한다.
      minion.hasAttackedStructure = true;
      applyDamageToInhibitor(target, dmg);
    } else if (target.isNexus) {
      // 요청 12절: 억제기가 파괴되면 넥서스를 공격한다.
      minion.hasAttackedStructure = true;
      applyDamageToNexus(target, dmg);
    } else if (target.isMinion) {
      applyDamageToMinion(target, dmg);
    } else {
      // 챔피언(플레이어) 대상 - 실제 LoL 규칙대로 60%만 적용.
      applyDamage(target, { ...dmg, rawDamage: dmg.rawDamage * MINION_CHAMPION_DAMAGE_PERCENT });
    }
  };
  if (hitDelaySec > 0) setTimeout(dealHit, hitDelaySec * 1000);
  else dealHit(); // 모델 미로딩(폴백 도형) 시에는 기존처럼 즉시 적용 - 회귀 없음
}
function updateMinionRegeneration(minion, dt) {
  // 요청 39 "함수 분리"를 위한 자리 - 실제 LoL 미니언은 시간 경과에 따른
  // 초당 HP 재생이 없고(포탑처럼 회복하지 않음), 능력치 성장은 새로
  // 스폰되는 개체에만 반영되도록 이미 설계했으므로(스폰 시 고정) 여기선
  // 할 일이 없다 - 이름만 존재하는 명시적 no-op.
}
function rewardMinionKill(minion) {
  const gold = getMinionGoldValue(minion, getTurretGameTimeSec());
  if (typeof controller !== 'undefined' && controller) {
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
  updateMinionMovement(minion, dt);
  updateMinionAttack(minion, dt);
  updateMinionRegeneration(minion, dt);
}
// 플레이어가 미니언을 공격할 때 쓰는 진입점(포탑의 applyDamageToTurret과
// 동일한 이유) - 일반 applyDamage()는 target.takeDamage가 없는 대상을
// damageEnemy()로 보내는데, damageEnemy()는 "죽으면 4초 뒤 풀피로 부활"
// 하는 학습용 더미 전용 로직까지 함께 갖고 있다. 미니언은 실제로 죽어서
// 사라지고 골드/경험치를 줘야 하므로(killMinion) 그 경로를 타면 안 된다.
function applyDamageToMinion(minion, result, fromPlayer = false) {
  if (!minion || minion.isDead) return 0;
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
  if (fromPlayer) {
    minion.lastAttackedByPlayerAt = performance.now();
    if (typeof controller !== 'undefined' && controller) {
      minion._lastHitBy = controller;
      // 아이템 패시브 "모든 피해 흡혈"(도란의 검/활)/"생명력 흡수"(흡혈의
      // 낫, 물리 피해 전용) - 미니언 피해도 실제 LoL처럼 흡혈 대상에
      // 포함된다(구조물 피해만 제외).
      if (typeof applyItemVamp === 'function') applyItemVamp(controller, finalDmg);
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
    minion.body.material.emissive = new THREE.Color(0xff3333);
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
  if (gameTimeSec < MINION_FIRST_WAVE_SEC) return;
  if (gameTimeSec - lastMinionWaveSec >= MINION_WAVE_INTERVAL_SEC) {
    lastMinionWaveSec = gameTimeSec;
    // 요청 문서 13절: 게임 시작 → RED 웨이브 생성 / BLUE 웨이브 생성이
    // 동시에 일어난다 - 같은 타이머에서 양 팀을 함께 스폰한다.
    spawnMinionWave('BLUE', gameTimeSec);
    spawnMinionWave('RED', gameTimeSec);
  }
}
function updateMinions(dt) {
  const gameTimeSec = getTurretGameTimeSec();
  updateMinionWaveSpawner(gameTimeSec);
  for (const m of [...minions]) updateMinionCombat(m, dt);
}

let dummy = null;
let placedDummies = []; // 요청: 사용자가 직접 설치하는 추가 허수아비들
let dummyPlaceMode = false;

