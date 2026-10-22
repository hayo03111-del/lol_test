/* ============================================================
   62차 골드·경험치 보상 시스템(칼바람 나락 기준)
   ------------------------------------------------------------
   흩어져 있던 보상 지급(미니언 막타 골드, 포탑 파괴 골드)을 한곳으로 모으고 빠져 있던 원작 규칙을 채운다.
   - 시작 골드 1400, 기본 골드 수급 10초당 55(1:00부터) - 리그 위키 Gold(Howling Abyss 항목).
   - 미니언: 골드는 막타 친 챔피언만(MINION_STATS - 칼바람 근거리 20·원거리 17, 95차 PC 위키 확인). 내 막타가 아니어도 근처
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
  if (typeof updateGoldDisplay === 'function' && !ctrl.isBot) updateGoldDisplay(); // 95차: 적 봇 골드는 화면 골드와 무관
  return amount;
}
function grantStartingGold(ctrl) {
  if (!ctrl || ctrl._startingGoldGiven) return;
  ctrl._startingGoldGiven = true;
  ctrl.gold = Math.max(ctrl.gold || 0, ARAM_STARTING_GOLD);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
}

// 미니언이 죽었을 때(killMinion에서 한 번) - 막타 골드 또는 근처 골드.
// 95차: 플레이어만이 아니라 상대 팀 챔피언 모두(적 챔피언 봇 포함) - 막타 챔피언은 골드, 아니면 1250 안에 살아 있으면 6골드.
function rewardMinionDeath(minion) {
  if (typeof gameEnded !== 'undefined' && gameEnded) return; // 94차: 게임 종료 뒤 멈춘 미니언을 잡아 골드를 버는 것 방지
  if (!minion) return;
  const at = minion.mesh ? minion.mesh.position.clone().add(new THREE.Vector3(0, (minion.modelHeight || 0.8) + 0.3, 0)) : null;
  for (const c of listChampionUnits()) {
    if (!c || c.team === minion.team) continue;
    if (minion._lastHitBy === c) { grantGold(c, getMinionGoldValue(minion, getTurretGameTimeSec()), { at }); continue; }
    if (!isChampionAlive(c) || !minion.mesh) continue;
    if (getHorizontalDistance(c.root.position, minion.mesh.position) > lolRangeToWorld(ARAM_NEARBY_GOLD_RANGE_LOL)) continue;
    grantGold(c, ARAM_NEARBY_MINION_GOLD, { at, color: '#d9c27a', small: true });
  }
}

// 구조물 피해 기록(파괴자 판정용) - 챔피언 공격자만.
function recordStructureDamage(structure, source) {
  if (!structure || !source || !(source.isChampion || typeof source.championId === 'string') || source.isTrainingDummy) return;
  if (!structure._championDamagers) structure._championDamagers = new Map();
  structure._championDamagers.set(source, performance.now());
}
function structureKillers(structure) {
  // 95차: 상대 팀 챔피언 모두(최근 10초 안에 때렸거나 파괴 순간 1000 안에 살아 있던 챔피언).
  const out = [];
  for (const c of listChampionUnits()) {
    if (!c || c.team === structure.team || !isChampionAlive(c)) continue;
    const last = structure._championDamagers && structure._championDamagers.get(c);
    const recent = last != null && (performance.now() - last) / 1000 <= STRUCTURE_PARTICIPATION_SEC;
    const near = getHorizontalDistance(c.root.position, getWorldPosition(structure)) <= lolRangeToWorld(STRUCTURE_PARTICIPATION_RANGE_LOL) + getCollisionRadius(structure);
    if (recent || near) out.push(c);
  }
  return out;
}
// 구조물 파괴 보상 - 상대 팀 챔피언마다 지급(95차: 적 봇 포함). 반환값은 플레이어가 받은 골드(로그용).
function rewardStructureDestroyed(structure) {
  if (!structure) return 0;
  const at = getWorldPosition(structure).clone().add(new THREE.Vector3(0, (structure.labelHeight || 3) * 0.6, 0));
  const team = listChampionUnits().filter((c) => c && c.team !== structure.team);
  const me = typeof controller !== 'undefined' ? controller : null;
  if (structure.isInhibitor) { let got = 0; for (const c of team) { const g = grantGold(c, INHIBITOR_GLOBAL_GOLD, { at }); if (c === me) got = g; } return got; }
  if (!structure.isTurret) return 0;
  const g = TURRET_GOLD_HA[structure.type];
  if (!g) return 0;
  const killers = structureKillers(structure);
  const local = killers.length ? g.local / killers.length : 0;
  let mine = 0;
  for (const c of team) {
    const amount = g.global + (killers.includes(c) ? local : 0);
    grantGold(c, amount, { at });
    if (c === me) mine = amount;
  }
  if (me && team.includes(me) && typeof showRewardBanner === 'function') showRewardBanner(`포탑 파괴! +${Math.round(mine)} 골드${killers.includes(me) && g.local ? ` (파괴자 ${Math.round(local)} 포함)` : ''}`);
  return mine;
}

// 95차: 챔피언 처치·어시스트 보상(칼바람 - research95: PC 위키 ARAM·Assist·Experience).
//  - 처치 골드 180 + 현상금, 어시스트는 90골드를 어시스트한 챔피언끼리 똑같이 나눈다.
//  - 현상금: 처치·어시스트로 번 골드 2당 1(최대 600). 현상금이 걸린 챔피언이 죽으면 나눠 준 골드 4당 1씩 줄어든다.
//  - 관여: 죽기 전 20초 안에 피해를 주거나 행동 제한을 건 상대 챔피언. 마지막 처치가 미니언·포탑이면 가장 최근에 관여한 챔피언이 처치.
//  - 경험치: 대상 레벨별 표(혼자 받을 때), 1600 안의 상대 팀 챔피언과 관여한 챔피언이 나눈다(나누는 비율은 미니언과 같은 표).
//    대상이 2레벨 이상 높으면 넘는 레벨마다 +20%, 낮으면 2레벨부터 레벨당 -24%(최대 -60%).
const CHAMPION_KILL_GOLD_ARAM = 180;
const CHAMPION_ASSIST_GOLD_POOL = 90;
const CHAMPION_BOUNTY_MAX = 600;
const CHAMPION_ASSIST_WINDOW_SEC = 20;
const CHAMPION_KILL_XP_RANGE_LOL = 1600;
const CHAMPION_KILL_XP_BY_LEVEL = [0, 42, 114, 144, 174, 204, 234, 308, 392, 486, 590, 640, 690, 740, 790, 840, 890, 940, 990];
// 챔피언이 챔피언에게 피해를 주거나 행동 제한을 걸 때 기록한다(applyDamage·applyStatus).
function recordChampionContribution(victim, source) {
  if (!victim || !source || source === victim || !victim.isChampion || !(source.isChampion || typeof source.championId === 'string') || source.isTrainingDummy) return;
  if (source.team && victim.team && source.team === victim.team) return;
  if (!victim._champContrib) victim._champContrib = new Map();
  victim._champContrib.set(source, performance.now());
}
function championKillXp(victim, recipient, share) {
  const base = CHAMPION_KILL_XP_BY_LEVEL[Math.max(1, Math.min(18, victim.champLevel || 1))] || 0;
  const diff = (victim.champLevel || 1) - (recipient.champLevel || 1);
  let mult = 1;
  if (diff >= 2) mult += 0.2 * (diff - 1);
  else if (diff <= -2) mult -= Math.min(0.6, 0.24 * (-diff - 1));
  return base * share * mult;
}
// 플레이어 화면 알림 - 봇 차례에 일어난 일(봇이 지속 피해로 죽는 등)이라도 플레이어에게 보인다.
function _rewardPlayerToast(msg) {
  const show = () => { if (typeof showRewardBanner === 'function') showRewardBanner(msg); else if (typeof showSkillToast === 'function') showSkillToast(msg); };
  if (typeof withCombatActor === 'function') withCombatActor(null, show); else show();
}
function rewardChampionKill(victim) {
  if (!victim || (typeof gameEnded !== 'undefined' && gameEnded)) return null;
  const now = performance.now();
  const window = CHAMPION_ASSIST_WINDOW_SEC * 1000;
  const contrib = [];
  if (victim._champContrib) for (const [c, at] of victim._champContrib) if (c && c.team !== victim.team && now - at <= window) contrib.push({ c, at });
  victim._champContrib = null;
  const src = victim._lastDamageSource || null;
  const srcIsChamp = src && src !== victim && (src.isChampion || typeof src.championId === 'string') && !src.isTrainingDummy && src.team !== victim.team;
  let killer = srcIsChamp ? src : null;
  if (!killer && contrib.length) killer = contrib.reduce((a, b) => (b.at > a.at ? b : a)).c; // 미니언·포탑 마무리 - 가장 최근 관여자
  const assisters = contrib.map((x) => x.c).filter((c) => c !== killer);
  const bounty = Math.max(0, victim._bounty || 0);
  let paid = 0;
  if (killer) {
    const g = grantGold(killer, CHAMPION_KILL_GOLD_ARAM + bounty, { at: victim.root ? victim.root.position.clone().add(new THREE.Vector3(0, 2, 0)) : null });
    paid += g;
    killer._bounty = Math.min(CHAMPION_BOUNTY_MAX, (killer._bounty || 0) + g / 2);
    if (typeof recordChampionTakedown === 'function') recordChampionTakedown(killer, true);
  }
  if (assisters.length) {
    const each = CHAMPION_ASSIST_GOLD_POOL / assisters.length;
    for (const a of assisters) {
      const g = grantGold(a, each);
      paid += g;
      a._bounty = Math.min(CHAMPION_BOUNTY_MAX, (a._bounty || 0) + g / 2);
      if (typeof recordChampionTakedown === 'function') recordChampionTakedown(a, false);
    }
  }
  victim._bounty = Math.max(0, bounty - paid / 4);
  // 경험치: 관여자 + 1600 안의 살아 있는 상대 팀 챔피언.
  const at = getWorldPosition(victim);
  const recips = new Set([killer, ...assisters].filter(Boolean));
  for (const c of listChampionUnits()) {
    if (!c || c.team === victim.team || !isChampionAlive(c)) continue;
    if (getHorizontalDistance(c.root.position, at) <= lolRangeToWorld(CHAMPION_KILL_XP_RANGE_LOL)) recips.add(c);
  }
  const list = [...recips];
  const share = list.length ? (typeof shareExperience === 'function' ? shareExperience(1, list) : 1 / list.length) : 0;
  for (const c of list) if (typeof gainExperience === 'function') gainExperience(c, championKillXp(victim, c, share));
  const me = typeof controller !== 'undefined' ? controller : null;
  if (me && killer === me) _rewardPlayerToast(`적 챔피언 처치! +${Math.round(CHAMPION_KILL_GOLD_ARAM + bounty)} 골드`);
  else if (me && assisters.includes(me)) _rewardPlayerToast(`어시스트! +${Math.round(CHAMPION_ASSIST_GOLD_POOL / assisters.length)} 골드`);
  else if (me && victim === me && killer) _rewardPlayerToast(`${killer.championId || '적'}에게 처치당했습니다`);
  if (typeof emitGameEvent === 'function') emitGameEvent('championKill', { victimId: _evId(victim), killerId: _evId(killer), assistIds: assisters.map(_evId), gold: Math.round(paid), bounty: Math.round(bounty) });
  return { killer, assisters, paid, bounty };
}

// 매 프레임: 기본 골드 수급 + 떠오르는 숫자.
let _passiveGoldAcc = 0;
function rewardTick(dt) {
  if (rewardGameActive() && getTurretGameTimeSec() >= ARAM_PASSIVE_GOLD_START_SEC) {
    // 90차: 원작처럼 0.5초마다 한 번(10초당 60 → 0.5초당 3) 들어온다. 예전엔 매 프레임 1골드씩 쪼개 넣어 골드가 쉬지 않고 올라갔다(총량은 같음).
    // 95차: 모든 챔피언(적 봇 포함)이 같이 받는다.
    _passiveGoldAcc += dt;
    while (_passiveGoldAcc >= 0.5) { _passiveGoldAcc -= 0.5; for (const c of listChampionUnits()) grantGold(c, ARAM_PASSIVE_GOLD_PER_10S / 20); }
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
