/* ============================================================
   62차 골드·경험치 보상 시스템(칼바람 나락 기준)
   ------------------------------------------------------------
   흩어져 있던 보상 지급(미니언 막타 골드, 포탑 파괴 골드)을 한곳으로 모으고 빠져 있던 원작 규칙을 채운다.
   - 시작 골드 1400, 기본 골드 수급 10초당 55(1:00부터) - 리그 위키 Gold(Howling Abyss 항목).
   - 미니언: 골드는 막타 친 챔피언만(근거리 21·원거리 14·대포/슈퍼 60~90 - MINION_STATS). 내 막타가 아니어도 근처
     (경험치 범위)에서 적 미니언이 죽으면 6골드(칼바람 규칙). 경험치는 막타와 상관없이 범위 안 챔피언끼리 나눈다
     (awardMinionExperience - 기존 그대로).
   - 포탑(칼바람 값 - 공식 표를 찾지 못해 Samurai Gamers 정리값): 외곽 = 팀 전체 150 + 파괴자 250, 억제기 포탑 = 150 + 175,
     넥서스 포탑 = 150 + 0. 파괴자 = 최근 10초 안에 그 포탑을 때렸거나 파괴 순간 1000 안에 있던 그 팀 챔피언(나눠 가짐).
     억제기 = 팀 전체 50(위키 일반값). 넥서스는 없음. 구조물은 경험치를 주지 않는다.
   - 받은 골드는 그 자리에 "+21" 같은 금색 숫자로 잠깐 떠오른다(내 챔피언이 받은 것만).
   ============================================================ */
const ARAM_STARTING_GOLD = 1400;
const ARAM_PASSIVE_GOLD_PER_10S = 60; // 83차: PC 위키 Gold/ARAM - 1:00부터 10초당 60(예전 55)
const ARAM_NEARBY_GOLD_RANGE_LOL = 1250; // 85차: 주변 미니언 사망 골드 범위 1250(PC 위키 칼바람 오라, 예전엔 경험치 범위 1300 재사용)
const ARAM_PASSIVE_GOLD_START_SEC = 60;
const ARAM_NEARBY_MINION_GOLD = 6;
const TURRET_GOLD_HA = {
  outer1: { global: 150, local: 250 },
  outer2: { global: 150, local: 250 },
  inhibitor: { global: 150, local: 175 },
  nexusTwin: { global: 150, local: 0 },
};
const INHIBITOR_GLOBAL_GOLD = 50;
const STRUCTURE_PARTICIPATION_SEC = 10;
const STRUCTURE_PARTICIPATION_RANGE_LOL = 1000;

function rewardGameActive() {
  return typeof howlingAbyssStructuresSpawned !== 'undefined' && howlingAbyssStructuresSpawned && !gameEnded;
}
// 골드 지급 공용 진입점 - 점수판 누적(goldEarned)과 HUD 갱신, 떠오르는 숫자까지 한 번에.
function grantGold(ctrl, amount, opts = {}) {
  if (!ctrl || !(amount > 0)) return 0;
  ctrl.gold = (ctrl.gold || 0) + amount;
  if (typeof ensureScore === 'function') { const s = ensureScore(ctrl); if (s) s.goldEarned = (s.goldEarned || 0) + amount; }
  if (opts.at && typeof controller !== 'undefined' && ctrl === controller) spawnRewardText(opts.at, `+${Math.round(amount)}`, opts.color || '#ffd34d', opts.small);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  return amount;
}
function grantStartingGold(ctrl) {
  if (!ctrl || ctrl._startingGoldGiven) return;
  ctrl._startingGoldGiven = true;
  ctrl.gold = Math.max(ctrl.gold || 0, ARAM_STARTING_GOLD);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
}

// 미니언이 죽었을 때(killMinion에서 한 번) - 막타 골드 또는 근처 골드.
function rewardMinionDeath(minion) {
  if (typeof gameEnded !== 'undefined' && gameEnded) return; // 94차: 게임 종료 뒤 멈춘 미니언을 잡아 골드를 버는 것 방지
  if (typeof controller === 'undefined' || !controller || !minion || minion.team === controller.team) return;
  const at = minion.mesh ? minion.mesh.position.clone().add(new THREE.Vector3(0, (minion.modelHeight || 0.8) + 0.3, 0)) : null;
  if (minion._lastHitBy === controller) {
    grantGold(controller, getMinionGoldValue(minion, getTurretGameTimeSec()), { at });
    return;
  }
  if (controller.hp <= 0 || controller.state === STATE.DEAD || !minion.mesh) return;
  if (getHorizontalDistance(controller.root.position, minion.mesh.position) > lolRangeToWorld(ARAM_NEARBY_GOLD_RANGE_LOL)) return;
  grantGold(controller, ARAM_NEARBY_MINION_GOLD, { at, color: '#d9c27a', small: true });
}

// 구조물 피해 기록(파괴자 판정용) - 챔피언 공격자만.
function recordStructureDamage(structure, source) {
  if (!structure || !source || !(source.isChampion || typeof source.championId === 'string') || source.isTrainingDummy) return;
  if (!structure._championDamagers) structure._championDamagers = new Map();
  structure._championDamagers.set(source, performance.now());
}
function structureKillers(structure) {
  const out = [];
  if (typeof controller === 'undefined' || !controller || controller.team === structure.team || controller.hp <= 0 || controller.state === STATE.DEAD) return out;
  const last = structure._championDamagers && structure._championDamagers.get(controller);
  const recent = last != null && (performance.now() - last) / 1000 <= STRUCTURE_PARTICIPATION_SEC;
  const near = getHorizontalDistance(controller.root.position, getWorldPosition(structure)) <= lolRangeToWorld(STRUCTURE_PARTICIPATION_RANGE_LOL) + getCollisionRadius(structure);
  if (recent || near) out.push(controller);
  return out;
}
// 구조물 파괴 보상 - 반환값은 플레이어가 받은 골드(로그용).
function rewardStructureDestroyed(structure) {
  if (typeof controller === 'undefined' || !controller || !structure || structure.team === controller.team) return 0;
  const at = getWorldPosition(structure).clone().add(new THREE.Vector3(0, (structure.labelHeight || 3) * 0.6, 0));
  if (structure.isInhibitor) return grantGold(controller, INHIBITOR_GLOBAL_GOLD, { at });
  if (!structure.isTurret) return 0;
  const g = TURRET_GOLD_HA[structure.type];
  if (!g) return 0;
  const killers = structureKillers(structure);
  const local = killers.length ? g.local / killers.length : 0;
  const mine = g.global + (killers.includes(controller) ? local : 0);
  grantGold(controller, mine, { at });
  if (typeof showRewardBanner === 'function') showRewardBanner(`포탑 파괴! +${Math.round(mine)} 골드${killers.includes(controller) && g.local ? ` (파괴자 ${Math.round(local)} 포함)` : ''}`);
  return mine;
}

// 매 프레임: 기본 골드 수급 + 떠오르는 숫자.
let _passiveGoldAcc = 0;
function rewardTick(dt) {
  if (rewardGameActive() && typeof controller !== 'undefined' && controller && getTurretGameTimeSec() >= ARAM_PASSIVE_GOLD_START_SEC) {
    // 90차: 원작처럼 0.5초마다 한 번(10초당 60 → 0.5초당 3) 들어온다. 예전엔 매 프레임 1골드씩 쪼개 넣어 골드가 쉬지 않고 올라갔다(총량은 같음).
    _passiveGoldAcc += dt;
    while (_passiveGoldAcc >= 0.5) { _passiveGoldAcc -= 0.5; grantGold(controller, ARAM_PASSIVE_GOLD_PER_10S / 20); }
  }
  updateRewardTexts(dt);
}

// 떠오르는 숫자(골드) - 화면 좌표로 투영한 작은 글자, 1.1초 동안 위로 뜨며 사라진다.
let _rewardTexts = [];
let _rewardLayer = null;
function spawnRewardText(worldPos, text, color, small) {
  if (typeof document === 'undefined') return;
  if (!_rewardLayer) {
    _rewardLayer = document.createElement('div');
    _rewardLayer.id = 'rewardTextLayer';
    _rewardLayer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60;overflow:hidden';
    document.body.appendChild(_rewardLayer);
  }
  const el = document.createElement('div');
  el.className = 'rewardText';
  el.textContent = text;
  el.style.cssText = `position:absolute;transform:translate(-50%,-50%);font:bold ${small ? 12 : 15}px sans-serif;color:${color};text-shadow:0 0 3px #000,0 1px 2px #000;white-space:nowrap`;
  _rewardLayer.appendChild(el);
  _rewardTexts.push({ el, pos: worldPos.clone(), t: 0, life: 1.1 });
}
function updateRewardTexts(dt) {
  if (!_rewardTexts.length || typeof camera === 'undefined' || !camera) return;
  const w = window.innerWidth, h = window.innerHeight, v = new THREE.Vector3();
  _rewardTexts = _rewardTexts.filter((r) => {
    r.t += dt;
    if (r.t >= r.life) { r.el.remove(); return false; }
    v.copy(r.pos); v.y += r.t * 0.8; v.project(camera);
    if (v.z > 1) { r.el.style.display = 'none'; return true; }
    r.el.style.display = '';
    r.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`; r.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    r.el.style.opacity = String(Math.min(1, (r.life - r.t) / 0.35));
    return true;
  });
}
// 큰 알림(포탑 파괴 등) - 화면 위쪽 가운데 2.5초.
function showRewardBanner(text) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'rewardBanner';
  el.textContent = text;
  el.style.cssText = 'position:fixed;top:22%;left:50%;transform:translateX(-50%);font:bold 18px sans-serif;color:#ffd34d;text-shadow:0 0 6px #000,0 1px 3px #000;z-index:61;pointer-events:none;transition:opacity .5s';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
  setTimeout(() => el.remove(), 2600);
}
