/* game_snapshot.js — 93차(온라인 1:1 준비): 게임 상태 스냅샷
 * 지금 게임 객체(컨트롤러·허수아비·미니언·구조물·와드)를 읽어 "화면 객체가 없는" 순수 데이터로 옮긴다.
 * 나중에 서버가 클라이언트로 보낼 상태의 모양이다. Vector3·Object3D·Material·클래스 인스턴스는 넣지 않는다 -
 * 숫자·문자열·불리언·배열·평범한 객체만 있어서 JSON.stringify → JSON.parse 해도 그대로다(테스트로 확인).
 * 읽기 전용이다: 게임 상태를 바꾸지 않고, 새 상태 저장소도 만들지 않는다(매번 기존 객체에서 새로 만든다).
 *
 * 좌표는 이 엔진의 월드 단위(x, y, z)다(서버도 같은 엔진 좌표계를 쓴다는 가정 - LoL 거리 단위는 worldDistanceToLol로 바꿀 수 있다).
 * 방향(yaw)은 +Z를 0으로 한 라디안(atan2(x, z)).
 */
const SNAPSHOT_VERSION = 1;
function _snapNum(v, digits = 3) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null; // Infinity(우물 체력 등)·NaN은 null
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}
function _snapPos(unit) {
  const p = typeof getWorldPosition === 'function' ? getWorldPosition(unit) : null;
  return p ? { x: _snapNum(p.x), y: _snapNum(p.y), z: _snapNum(p.z) } : null;
}
// 바라보는 방향: 컨트롤러는 root, 미니언은 body(GLB 회전), 그 밖은 mesh의 회전.
function _snapYaw(unit) {
  const obj = unit.root || unit.body || unit.mesh;
  if (!obj || !obj.quaternion || typeof THREE === 'undefined' || !THREE.Vector3) return null;
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
  return _snapNum(Math.atan2(f.x, f.z), 4);
}
function _snapAlive(unit, kind) {
  if (kind === 'champion') return unit.state !== STATE.DEAD && unit.hp > 0;
  if (kind === 'dummy' || kind === 'allyDummy') return unit.hp > 0;
  return !(unit.isDead || unit.destroyed) && unit.hp > 0;
}
function _snapStatus(unit, nowMs) {
  return (unit.statusEffects || []).filter((e) => !e.expiresAt || e.expiresAt > nowMs).map((e) => ({
    id: String(e.id || e.type), type: e.type,
    remainingMs: e.expiresAt ? Math.max(0, Math.round(e.expiresAt - nowMs)) : null,
    value: typeof e.value === 'number' ? _snapNum(e.value, 4) : null,
    sourceId: e.source && typeof entityId === 'function' ? entityId(e.source) : null,
  }));
}
function snapshotEntity(unit, nowMs = performance.now()) {
  const kind = entityKind(unit);
  const s = {
    id: entityId(unit), kind, team: unit.team || null,
    pos: _snapPos(unit), yaw: _snapYaw(unit),
    hp: _snapNum(unit.hp, 2), maxHp: _snapNum(unit.maxHp, 2),
    shield: _snapNum(unit.shield || 0, 2),
    alive: _snapAlive(unit, kind),
    untargetable: !!unit.isUntargetable,
    statusEffects: _snapStatus(unit, nowMs),
  };
  if (kind === 'champion') {
    s.championId = unit.championId || null;
    s.state = unit.state || null;
    s.level = unit.champLevel || 1;
    s.mp = _snapNum(unit.mp, 2); s.maxMp = _snapNum(unit.maxMp, 2);
    s.cooldowns = {};
    for (const k of ['Q', 'W', 'E', 'R']) s.cooldowns[k] = _snapNum(Math.max(0, (unit.cooldowns && unit.cooldowns[k]) || 0), 3);
    s.respawnInMs = unit.state === STATE.DEAD && unit._respawnAt ? Math.max(0, Math.round(unit._respawnAt - nowMs)) : null;
    s.targetId = unit.currentTarget ? entityId(unit.currentTarget) : null;
    const st = unit.stats || {};
    s.stats = {
      attackDamage: _snapNum(st.attackDamage, 2), abilityPower: _snapNum(st.abilityPower, 2),
      armor: _snapNum(st.armor, 2), magicResist: _snapNum(st.magicResist, 2),
      attackSpeed: typeof getFinalAttackSpeed === 'function' ? _snapNum(getFinalAttackSpeed(st), 3) : null,
      moveSpeed: typeof getFinalMoveSpeed === 'function' && typeof worldDistanceToLol === 'function' ? _snapNum(worldDistanceToLol(getFinalMoveSpeed(st)), 1) : null,
      critChance: _snapNum(st.critChance, 3),
    };
  } else {
    if (unit.champLevel) s.level = unit.champLevel;
    if (kind === 'minion') s.minionType = unit.minionType || unit.type || null;
    if (kind === 'turret') s.turretType = unit.type || null;
    if (kind === 'ward') { s.wardType = unit.wardType || null; s.ownerId = unit.owner ? entityId(unit.owner) : null; s.expiresInMs = unit.expiresAt ? Math.max(0, Math.round(unit.expiresAt - nowMs)) : null; }
  }
  return s;
}
// 플레이어(조작 챔피언) 전용 정보: 골드·인벤토리·스킬 레벨·소환사 주문. 다른 플레이어에게 숨길 정보는 서버가 걸러 보낸다.
function snapshotPlayer(ctrl, nowMs = performance.now()) {
  if (!ctrl) return null;
  const slot = (it) => (it ? { itemId: it.id, count: it.count || 1, charges: typeof it.charges === 'number' ? it.charges : null } : null);
  const summoners = {};
  for (const k of ['D', 'F']) {
    const sp = ctrl.summoners && ctrl.summoners[k];
    summoners[k] = sp ? { spellId: sp.id, readyInMs: Math.max(0, Math.round((sp.readyAt || 0) - nowMs)) } : null;
  }
  return {
    entityId: entityId(ctrl),
    gold: _snapNum(ctrl.gold || 0, 2),
    items: (ctrl.items || []).map(slot),
    boots: slot(ctrl.boots), trinket: slot(ctrl.trinket),
    skillLevels: Object.assign({}, ctrl.skillLevels || {}), skillPoints: ctrl.skillPoints || 0,
    exp: _snapNum(ctrl.currentExp || 0, 2),
    summoners,
    score: ctrl.score ? JSON.parse(JSON.stringify(ctrl.score)) : null,
  };
}
// 전체 스냅샷. 서버 틱 번호(tick)·시뮬레이션 시간은 LocalSession(game_commands.js)의 값.
function buildGameSnapshot() {
  const nowMs = performance.now();
  const s = (typeof gameSession !== 'undefined' && gameSession) ? gameSession : null;
  return {
    v: SNAPSHOT_VERSION,
    tick: s ? s.tick : 0,
    simTimeSec: s ? _snapNum(s.simTimeSec, 3) : 0,
    gameTimeSec: typeof getTurretGameTimeSec === 'function' ? _snapNum(getTurretGameTimeSec(), 3) : null,
    gameEnded: typeof gameEnded !== 'undefined' ? !!gameEnded : false,
    entities: listEntities().map((u) => snapshotEntity(u, nowMs)),
    players: (typeof controller !== 'undefined' && controller) ? [snapshotPlayer(controller, nowMs)] : [],
  };
}
