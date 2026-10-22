/* game_reset.js — 90차(QA "게임을 초기화하면 미니언·허수아비·구조물·타이머까지 원하는 상태로 돌아가는가?")
 * 예전엔 초기화 기능 자체가 없었다(설정의 "기본값 복원"은 설정값만, 챔피언을 다시 골라도 게임 시계·미니언·포탑은 그대로).
 * resetGame(): 게임을 처음 시작한 상태로 되돌린다.
 *  - 미니언: 살아 있는 것·죽는 중인 것을 모두 지우고 웨이브 시계·예약 소환·웨이브 번호를 처음으로.
 *  - 구조물: 포탑·억제기·넥서스·분수를 지우고 원작 좌표에 새로 세운다(체력·파괴·가열·재생성 타이머 모두 처음), 게임 시계 0, 승리 배너 제거.
 *  - 와드·날아가는 투사체·원작 파티클 엔진 이펙트를 지운다.
 *  - 챔피언: 지금 챔피언을 처음 상태(골드 1400·3레벨·아이템 없음·점수 0)로 다시 불러온다 - 허수아비 3개도 그때 새로 놓인다.
 * 직접 놓은 아군·부쉬는 사용자가 만든 연습 배치라 남겨 두고 체력만 채운다.
 */
function _resetDisposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((o) => { if (o.isCSS2DObject && o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element); });
  if (obj.parent) obj.parent.remove(obj);
}
function resetGame() {
  // 1) 미니언
  for (const m of [...minions, ...dyingMinions]) { if (typeof disposeMinionHealthBar === 'function') disposeMinionHealthBar(m); m.isDead = true; m.destroyed = true; _resetDisposeObject3D(m.mesh); }
  minions = []; dyingMinions = []; pendingMinionSpawns = [];
  minionWaveCounter = 0; redMinionWaveCounter = 0; lastMinionWaveSec = -Infinity; minionSimTime = 0;
  // 2) 구조물(첫 생성 때와 같은 함수로 다시 세운다) + 게임 시계
  if (typeof projectiles !== 'undefined' && projectiles && projectiles.projectiles) { // 포탑 포탄까지 모두(projectiles.clear()는 포탑 것은 남긴다)
    for (const p of projectiles.projectiles) { p.done = true; if (p._meshEntry && projectiles._releaseArrowMesh) projectiles._releaseArrowMesh(p._meshEntry); else if (p.mesh) _resetDisposeObject3D(p.mesh); }
    projectiles.projectiles.length = 0;
  }
  // 94차: 분수 테두리 링·포탑 조준선은 장면에 따로 붙어 있어 함께 지운다(예전엔 초기화마다 링 2개씩 쌓였다).
  for (const s of [...turrets, ...inhibitorBuildings, ...nexusBuildings]) { _resetDisposeObject3D(s.mesh); _resetDisposeObject3D(s._ring); _resetDisposeObject3D(s._aggroBeam); }
  turrets.length = 0; inhibitorBuildings.length = 0; nexusBuildings.length = 0;
  if (typeof howlingAbyssStructuresSpawned !== 'undefined') howlingAbyssStructuresSpawned = false;
  gameEnded = false;
  document.querySelectorAll('body > div').forEach((d) => { if (/^(BLUE|RED) WINS$/.test(d.textContent || '')) d.remove(); });
  if (typeof spawnHowlingAbyssStructures === 'function') spawnHowlingAbyssStructures();
  if (typeof resetTurretGameClock === 'function') resetTurretGameClock();
  if (typeof resetAramRelics === 'function') resetAramRelics(); // 94차
  if (typeof _passiveGoldAcc !== 'undefined') _passiveGoldAcc = 0; // 94차: 기본 골드 누적 시간도 처음으로
  // 3) 와드·파티클
  if (typeof wardSystem !== 'undefined' && wardSystem && wardSystem.clear) wardSystem.clear();
  if (typeof lolVfx !== 'undefined' && lolVfx) { for (const s of lolVfx.systems) s.dispose(); lolVfx.systems = []; }
  if (typeof placedAllies !== 'undefined') for (const a of placedAllies) { a.hp = a.maxHp; if (typeof clearUnitCombatState === 'function') clearUnitCombatState(a); else a.statusEffects = []; }
  // 94차: 허수아비(적·직접 놓은 것)의 상태 효과·공중에 뜸·끌려가기·보호막과 아이템 중첩(칠흑의 양날 도끼·부패 등)도 처음으로.
  for (const d of [typeof dummy !== 'undefined' ? dummy : null, ...(typeof placedDummies !== 'undefined' ? placedDummies : [])]) {
    if (!d) continue;
    if (typeof clearUnitCombatState === 'function') clearUnitCombatState(d);
    for (const k of Object.keys(d)) if (/^_item\w*Stacks?$/.test(k)) delete d[k];
  }
  // 4) 챔피언을 처음 상태로 다시 불러온다(이전 챔피언 상태를 넘기지 않음)
  if (typeof gameSession !== 'undefined' && gameSession) gameSession.reset(); // 93차: 세션 틱·시간을 처음으로(+ gameReset 이벤트)
  window.__resetNoCarry = true;
  const reloaded = typeof reloadCurrentChampion === 'function' && reloadCurrentChampion();
  if (!reloaded) window.__resetNoCarry = false;
  if (typeof showSkillToast === 'function') showSkillToast('게임을 처음부터 다시 시작했습니다');
  return true;
}
