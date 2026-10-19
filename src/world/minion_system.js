/* ============================================================
   MINION SYSTEM (칼바람 나락 미니언) - 사용자 제공 명세 기준
   ------------------------------------------------------------
   이 데모는 실제 챔피언 대 챔피언 2팀 대결 구조가 아니라 "플레이어 1명
   vs 이미 만들어둔 포탑 라인"이라, 명세의 "아군/적" 개념을 그대로
   이식하면 앞뒤가 안 맞는다(포탑이 전부 플레이어의 적이면, 미니언도
   플레이어의 적으로 두면 미니언이 공격해야 할 "적 포탑"이 존재하지
   않게 된다). 그래서 이렇게 정했다:

   - 미니언은 포탑의 적이다(포탑을 공격 대상으로 삼는다 - 명세 0/4/14/36
     절이 실제로 의미를 가지려면 이게 맞다). 포탑도 미니언을 공격한다
     (이미 만들어둔 findMeleeMinionsNear 등 TODO 스텁을 여기서 채운다).
   - 미니언은 플레이어를 먼저 공격하지 않는다(명세의 "아군 챔피언"에
     대응하는 실제 상대 챔피언이 이 데모엔 없다) - 다만 플레이어가 먼저
     미니언을 공격하면 그 미니언은 반격한다(생존을 위한 최소한의 규칙,
     플레이어도 미니언을 때려서 잡을 수 있어야 하므로).
   - 우선순위 1~3순위(적 챔피언/적 미니언이 아군을 공격 중)는 이
     프레이밍에서 "적 챔피언·적 미니언" 자체가 존재하지 않아 항상 빈
     결과로 폴백한다(포탑 시스템의 소환수/샤코 상자 TODO와 동일한 패턴) -
     실제로 2팀 대결 구조가 추가되면 그 지점만 채우면 된다.
   ============================================================ */
const MINION_TYPE = { MELEE: 'melee', CASTER: 'caster', SIEGE: 'siege', SUPER: 'super' };
const MINION_WAVE_INTERVAL_SEC = 30;
// 30초 간격 웨이브가 "2:05(125초)"에 정확히 3의 배수 웨이브가 되려면
// 첫 웨이브가 1:05(65초)여야 한다(65, 95, 125=3번째 웨이브) - 명세에
// 첫 웨이브 시각이 명시돼 있지 않지만, 2:05가 30초 간격과 딱 맞아떨어지는
// 유일한 시작점이 65초라 이 값을 채택했다.
const MINION_FIRST_WAVE_SEC = 65;
const MINION_SIEGE_WINDOWS = [
  { fromSec: 125, toSec: 845, everyNWaves: 3 },       // 2:05~14:05: 3웨이브마다
  { fromSec: 845, toSec: 1505, everyNWaves: 2 },      // 14:05~25:05: 2웨이브마다
  { fromSec: 1505, toSec: Infinity, everyNWaves: 1 }, // 25:05~: 매 웨이브
];
// 요청("미니언은 넥서스에서 소환되게 해줘") - 예전엔 라인 중간의 고정
// 좌표(±45)에서 스폰했다. 이제 실제 넥서스 건물의 좌표를 그대로 읽어서
// 그 자리에서 스폰한다(getTeamNexus는 turrets/nexusBuildings 배열에
// 실제로 값이 들어간 "뒤"에만 의미가 있으므로 함수로 만들어 스폰 시점에
// 매번 조회한다 - 모듈 로드 시점의 상수로 만들면 아직 넥서스가 없어
// 항상 폴백만 쓰이게 된다). 넥서스가 아직 없으면(이론상 발생하지 않지만
// 방어적으로) 예전 고정 좌표로 대체한다.
const MINION_SPAWN_POINT_BLUE_FALLBACK = new THREE.Vector3(0, 0, -45);
const MINION_SPAWN_POINT_RED_FALLBACK = new THREE.Vector3(0, 0, 45);
function getMinionSpawnPoint(team) {
  const nexus = getTeamNexus(team);
  // 59차: 넥서스 중심은 충돌 원 안이라 거기서 나오면 밀려나며 튄다 - 상대 진영 쪽 넥서스 가장자리 바로 앞에서 나온다.
  if (nexus) return getWorldPosition(nexus).clone().add(new THREE.Vector3(0, 0, (team === 'RED' ? -1 : 1) * ((nexus.collisionRadius || 0) + 0.6)));
  return team === 'RED' ? MINION_SPAWN_POINT_RED_FALLBACK : MINION_SPAWN_POINT_BLUE_FALLBACK;
}
const MINION_SPAWN_POINT = MINION_SPAWN_POINT_BLUE_FALLBACK; // 하위 호환(기존 코드가 참조하던 이름 그대로 유지)
// 이미 만들어둔 포탑 배치 좌표를 그대로 라인 경로(웨이포인트)로 재사용한다
// (요청 "포탑 시스템과 정상적으로 연동" - 새 경로 시스템을 중복으로 만들지 않음).
// 요청(맵 길이 1.5배): 아래 좌표 전부 기존 값의 1.5배로 늘려서 새로 늘어난
// 포탑 배치(30/48/66/84/96)와 정확히 맞췄다.
// BLUE는 -Z(자기 진영)에서 +Z(레드 진영)로 전진한다.
const MINION_LANE_WAYPOINTS_BLUE = [
  new THREE.Vector3(0, 0, -15),
  new THREE.Vector3(0, 0, 7.5),
  new THREE.Vector3(0, 0, 30),
  new THREE.Vector3(0, 0, 48),
  new THREE.Vector3(0, 0, 66),
  new THREE.Vector3(0, 0, 84),
  new THREE.Vector3(0, 0, 94.5),
];
// RED는 BLUE와 정반대 방향(+Z 자기 진영 → -Z 블루 진영)으로 전진한다 -
// 같은 라인 좌표를 Z부호만 뒤집어서 그대로 재사용한다(요청 14: 맵 좌표를
// 임의로 새로 만들지 말고 기존 좌표계를 기준으로 대칭시켜라).
const MINION_LANE_WAYPOINTS_RED = MINION_LANE_WAYPOINTS_BLUE.map((wp) => new THREE.Vector3(wp.x, wp.y, -wp.z));
const MINION_LANE_WAYPOINTS = MINION_LANE_WAYPOINTS_BLUE; // 하위 호환(기존 코드가 참조하던 이름 그대로 유지)
// 59차: 칼바람 나락 맵이 있으면 원작 구조물 좌표(HA_STRUCTURES_LOL)로 라인 경로를 만든다. 예전 고정 좌표(-15~94.5)는
// 이 맵(넥서스 z 약 ±55)보다 훨씬 길어서 미니언이 상대 넥서스를 지나 맵 끝으로 걸어가려 했다. 웨이포인트는 구조물
// "사이" 한가운데(구조물 중심은 충돌 때문에 닿을 수 없다) - 내 넥서스 포탑 → 억제기 → 억제기 포탑 → 외곽 포탑 → 다리
// 가운데 → 상대 쪽 같은 순서 → 상대 넥서스.
let _haLaneWaypointsCache = null;
function buildHowlingAbyssLaneWaypoints() {
  if (typeof HA_STRUCTURES_LOL === 'undefined' || typeof haLolToWorld !== 'function') return null;
  if (typeof howlingAbyssMap === 'undefined' || !howlingAbyssMap || !howlingAbyssMap.group) return null;
  const zOf = (xz) => haLolToWorld(xz).z;
  const side = (team) => {
    const t = HA_STRUCTURES_LOL[team];
    const ntz = (zOf(t.nexusTurrets[0]) + zOf(t.nexusTurrets[1])) / 2;
    return [zOf(t.nexus), ntz, zOf(t.inhibitor), zOf(t.inhibTurret), zOf(t.outer)];
  };
  const b = side('BLUE'), r = side('RED');
  const mids = (arr) => arr.slice(1).map((z, i) => (arr[i] + z) / 2);
  // BLUE 기준 z 순서(넥서스 → 바깥): 사이사이 + 가운데 0 + 레드 쪽 사이사이(바깥 → 넥서스) + 레드 넥서스.
  const blueZ = [...mids(b), 0, ...mids(r).reverse(), r[0]];
  const redZ = [...mids(r), 0, ...mids(b).reverse(), b[0]];
  return { BLUE: blueZ.map((z) => new THREE.Vector3(0, 0, z)), RED: redZ.map((z) => new THREE.Vector3(0, 0, z)) };
}
function getMinionLaneWaypoints(team) {
  if (!_haLaneWaypointsCache) _haLaneWaypointsCache = buildHowlingAbyssLaneWaypoints();
  if (_haLaneWaypointsCache) return _haLaneWaypointsCache[team === 'RED' ? 'RED' : 'BLUE'];
  return team === 'RED' ? MINION_LANE_WAYPOINTS_RED : MINION_LANE_WAYPOINTS_BLUE;
}

// 하나의 중앙 데이터 정의(요청 38 MINION_STATS). 시간 성장 관련 필드는
// 타입마다 실제로 주어진 형태가 달라서(전사 HP는 "가속 등차수열"까지
// 완전히 명시, 원거리/공성/슈퍼는 구간 범위나 검증 체크포인트만 given)
// 아래에서 타입별로 다르게 해석한다 - 각 선택의 근거는 getMinionStats()
// 주석에 적어둔다.
const MINION_STATS = {
  [MINION_TYPE.MELEE]: {
    // 요청("아직도 미니언딜이 이상할정도로 강해") - 실제 LoL 위키 재확인
    // 결과 근거리 AD 12 -> 11, 방어력 상한 16 -> 20으로 최신 패치값 반영.
    hpBase: 477, hpMax: 1300, hpStepSec: 90, hpStepBase: 22, hpStepAccel: 0.3, hpGrowStartSec: 165, hpGrowCapSec: 2235,
    adBase: 11, adMax: 80, adStepSec: 90, adStep: 3.4, adGrowStartSec: 525, adGrowCapSec: 2235,
    armorMax: 20, armorStepSec: 180, armorStep: 1, armorGrowStartSec: 795, armorGrowCapSec: 2236,
    mr: 0, attackSpeed: 1.25, range: 110, gold: 21, xp: 61.75, turretDamagePercent: 0.45,
  },
  [MINION_TYPE.CASTER]: {
    // 버그 수정(사용자 지적 "미니언딜이 이상할정도로 강해") - 실제 LoL
    // 위키를 다시 찾아보니 원거리 미니언 AD는 시작 21, 상한 125다. 예전
    // 코드는 시작값을 51로 잘못 역산해뒀었다(상한만 given이라고 착각해서
    // 등차수열을 거꾸로 계산한 결과) - 초반부터 실제보다 2배 넘게 강했다.
    // HP도 최신 패치 기준 284~600으로 같이 바로잡았다.
    hpBase: 284, hpMax: 600, hpStepSec: 90, hpGrowStartSec: 165, hpGrowCapSec: 2235,
    adBase: 21, adMax: 125, adStepSec: 90, adGrowStartSec: 165, adGrowCapSec: 2235,
    mr: 0, attackSpeed: 0.667, range: 550, gold: 14, xp: 30.4, turretDamagePercent: 0.70,
  },
  [MINION_TYPE.SIEGE]: {
    // 공성/슈퍼는 상한이 없다(명세 "무한히 증가") - 대신 37:15 체크포인트
    // (HP 2900)가 given이라 그 값을 정확히 지나가도록 증가량을 역산했다:
    // (2900-900)/23틱 ≈ 86.96/틱. AD는 "+1.5"가 직접 given이라 그대로 쓴다.
    hpBase: 900, hpStepSec: 90, hpStep: (2900 - 900) / 23, hpGrowStartSec: 165,
    adBase: 41, adStepSec: 90, adStep: 1.5, adGrowStartSec: 165,
    mr: 0, attackSpeed: 0.667, range: 300,
    goldBase: 60, goldPerWave: 3, goldMax: 90, xp: 95, turretDamagePercent: 0.14,
  },
  [MINION_TYPE.SUPER]: {
    // 요청("미니언 능력치들 맞는지 확인해줘") - 실제 LoL 위키 재확인 결과
    // 슈퍼 미니언은 예전에 성장 상한이 아예 없었는데(무한 성장, 옛날 값
    // 기준 최종 HP 11500/AD 1225까지 감), 이후 패치로 HP 7500 / AD 510
    // 로 상한이 생겼다 - 예전 코드는 이 상한을 반영 못 해서 게임을 오래
    // 하면 할수록 실제보다 훨씬 강해지는 구조였다. AD 시작값도 230→215,
    // 경험치 97→75, 포탑이 슈퍼 미니언에게 주는 피해%(Super Mech Armor)
    // 도 5%→7%로 같이 바로잡았다.
    hpBase: 1600, hpMax: 7500, hpStepSec: 90, hpStep: 100, hpGrowStartSec: 0,
    adBase: 215, adMax: 510, adStepSec: 90, adStep: 5, adGrowStartSec: 0,
    armor: 100, mr: -30, attackSpeed: 0.850, range: 170,
    goldBase: 60, goldStepSec: 90, goldStep: 3, goldMax: 90, xp: 75, turretDamagePercent: 0.07,
  },
};
// 이동속도는 4종 전부 공통(요청 10) - 게임 전체 타이머 기준 구간표.
const MINION_MOVE_SPEED_BREAKPOINTS = [[0, 325], [600, 350], [900, 375], [1200, 400], [1500, 425]];
function getMinionMoveSpeedLol(gameTimeSec) {
  let v = 325;
  for (const [t, val] of MINION_MOVE_SPEED_BREAKPOINTS) if (gameTimeSec >= t) v = val;
  return v;
}
function minionGrowthTicks(gameTimeSec, startSec, capSec, stepSec) {
  if (gameTimeSec < startSec) return 0;
  const maxTicks = capSec != null ? Math.floor((capSec - startSec) / stepSec) : Infinity;
  return Math.min(maxTicks, Math.floor((gameTimeSec - startSec) / stepSec));
}
// B/38 - getMinionStats(minionType, gameTime): 능력치 계산 하나로 통합.
// 버그 방지 노트: 스탯은 "스폰 시점의 게임 시간" 기준으로 딱 한 번만
// 계산해서 그 미니언의 수명 동안 고정한다(중간에 성장 구간을 다시
// 계산하지 않음) - 실제 LoL도 이미 필드에 나가 있는 미니언이 매 프레임
// 눈에 띄게 강해지진 않고, 이 데모의 미니언 수명(대개 90초 성장 주기보다
// 훨씬 짧음)을 감안하면 차이가 미미해 불필요한 복잡도를 줄였다.
function getMinionStats(type, gameTimeSec) {
  const d = MINION_STATS[type];
  let hp, maxHp, ad, armor = d.armor || 0;
  if (type === MINION_TYPE.MELEE) {
    const n = minionGrowthTicks(gameTimeSec, d.hpGrowStartSec, d.hpGrowCapSec, d.hpStepSec);
    // 가속 등차수열: n번째 틱 증가량 = hpStepBase + hpStepAccel*(n-1), 1~n항의 합.
    const hpGain = n * d.hpStepBase + d.hpStepAccel * n * (n - 1) / 2;
    maxHp = Math.min(d.hpBase + hpGain, d.hpMax);
    const adTicks = minionGrowthTicks(gameTimeSec, d.adGrowStartSec, d.adGrowCapSec, d.adStepSec);
    ad = Math.min(d.adBase + adTicks * d.adStep, d.adMax);
    const armorTicks = minionGrowthTicks(gameTimeSec, d.armorGrowStartSec, d.armorGrowCapSec, d.armorStepSec);
    armor = Math.min(armorTicks * d.armorStep, d.armorMax);
  } else if (type === MINION_TYPE.CASTER) {
    const totalTicks = Math.floor((d.hpGrowCapSec - d.hpGrowStartSec) / d.hpStepSec);
    const n = minionGrowthTicks(gameTimeSec, d.hpGrowStartSec, d.hpGrowCapSec, d.hpStepSec);
    const frac = totalTicks > 0 ? n / totalTicks : 0;
    maxHp = d.hpBase + (d.hpMax - d.hpBase) * frac;
    ad = d.adBase + (d.adMax - d.adBase) * frac;
  } else { // SIEGE(상한 미확정, 기존대로 유지) / SUPER(요청 - 상한 새로 적용)
    const n = minionGrowthTicks(gameTimeSec, d.hpGrowStartSec, null, d.hpStepSec);
    maxHp = d.hpBase + n * d.hpStep;
    if (d.hpMax != null) maxHp = Math.min(maxHp, d.hpMax);
    ad = d.adBase + n * d.adStep;
    if (d.adMax != null) ad = Math.min(ad, d.adMax);
  }
  hp = maxHp;
  return { hp, maxHp, ad, armor, magicResist: d.mr, attackSpeed: d.attackSpeed, range: d.range, moveSpeedLol: getMinionMoveSpeedLol(gameTimeSec) };
}
function getMinionGoldValue(minion, gameTimeSec) {
  const d = MINION_STATS[minion.type];
  if (minion.type === MINION_TYPE.MELEE || minion.type === MINION_TYPE.CASTER) return d.gold;
  if (minion.type === MINION_TYPE.SIEGE) { const curWave = minion.team === 'RED' ? redMinionWaveCounter : minionWaveCounter; return Math.min(d.goldMax, d.goldBase + Math.max(0, minion.spawnWaveIndex ? (curWave - minion.spawnWaveIndex) : 0) * d.goldPerWave); }
  if (minion.type === MINION_TYPE.SUPER) return Math.min(d.goldMax, d.goldBase + minionGrowthTicks(gameTimeSec, minion.spawnedAt, null, d.goldStepSec) * d.goldStep);
  return 0;
}

