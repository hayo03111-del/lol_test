/* game_commands.js — 93차(온라인 1:1 준비): 플레이어 입력 명령 + LocalSession
 * 입력(키·마우스·HUD·상점)은 화면 좌표·카메라를 읽어 "무엇을 하려는가"만 정한 뒤, 직렬화 가능한 명령 하나로 만들어
 * submitPlayerCommand()에 넘긴다. 세션은 명령을 검사하고 기존 게임 함수(moveTo·castAbility·buildOrBuyItem 등)를 그대로 부른다.
 * 규칙 판정(쿨다운·마나·사거리·골드·상점 위치)은 지금처럼 기존 함수가 한다 - 명령은 행위와 대상/목표 좌표만 담는다.
 * 명령에 체력·피해량·골드·승패 같은 결과 값은 없고, 들어 있어도 읽지 않는다.
 *
 * 세션 인터페이스(나중에 RemoteSession도 같은 모양으로 만든다 - 이번에는 통신을 구현하지 않는다):
 *   submit(cmd)        → { ok, reason, outcome }   ok=명령이 검사를 통과해 처리됐는가, outcome=기존 함수가 돌려준 값(있으면)
 *   advance(dt)        → 시뮬레이션 틱·시간을 한 프레임만큼 진행(메인 루프가 일시정지가 아닐 때 부른다)
 *   snapshot()         → buildGameSnapshot() 결과(game_snapshot.js)
 *   events(sinceSeq)   → recentGameEvents(sinceSeq) 결과(game_events.js)
 *   reset()            → 게임 초기화 때 틱·시간을 처음으로
 * LocalSession은 같은 브라우저 안의 지금 게임(전역 controller)에 바로 적용한다. RemoteSession은 submit을 서버로 보내고
 * snapshot/events를 서버에서 받은 것으로 채우게 된다(README 93차 "다음 단계").
 *
 * 명령 형식(좌표는 월드 단위 { x, y, z }, 유닛은 entityId 숫자):
 *   move        { point }                         우클릭 이동·미니맵 이동(마스터 이 Q 중이면 재등장 방향 지정 - 기존 규칙)
 *   stop        { }                               S 키
 *   attack      { targetId, fromAttackMove? }     대상 지정 공격(우클릭·좌클릭 대상 선택)
 *   clearTarget { }                               빈 곳 좌클릭(대상 해제)
 *   attackMove  { point, championsOnly?, cursorPoint? }
 *   cast        { slot, point?, targetId? }       Q/W/E/R(바루스 Q 충전 시작·발사도 같은 명령, 좌표가 없으면 바라보는 방향)
 *   levelUpSkill{ slot }
 *   recall      { }
 *   summoner    { slot, point?, targetId? }       D/F(좌표가 없으면 바라보는 방향 - 기존 규칙)
 *   useItem     { slot, point?, placeAhead? }     아이템 칸 0~5
 *   placeWard   { point }                         장신구
 *   buyItem     { itemId }
 *   sellItem    { slot }                          0~5 또는 'boots'
 *   shopUndo    { }                               100차: 상점 되돌리기(온라인 참가자 - 방장 쪽 원격 챔피언의 기록으로)
 */
const COMMAND_TYPES = ['move', 'stop', 'attack', 'clearTarget', 'attackMove', 'cast', 'levelUpSkill', 'recall', 'summoner', 'useItem', 'placeWard', 'buyItem', 'sellItem', 'shopUndo'];
const _CMD_SKILL_SLOTS = ['Q', 'W', 'E', 'R'];
const _CMD_SUMMONER_SLOTS = ['D', 'F'];
function _cmdIsPoint(p) { return !!p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z) && (p.y == null || Number.isFinite(p.y)); }
// 게임 좌표(Vector3 등) → 명령용 평범한 객체
function toCommandPoint(v) { return v ? { x: v.x, y: Number.isFinite(v.y) ? v.y : 0, z: v.z } : null; }
function _cmdVec(p) { return new THREE.Vector3(p.x, Number.isFinite(p.y) ? p.y : 0, p.z); }
// 형식 검사(규칙 검사는 기존 함수 몫). 틀리면 이유 문자열, 맞으면 null.
function validateCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return '명령이 아님';
  if (!COMMAND_TYPES.includes(cmd.type)) return `알 수 없는 명령 ${cmd.type}`;
  const needPoint = ['move', 'attackMove', 'placeWard'];
  if (needPoint.includes(cmd.type) && !_cmdIsPoint(cmd.point)) return '좌표가 없거나 잘못됨';
  if (cmd.type === 'attackMove' && cmd.cursorPoint != null && !_cmdIsPoint(cmd.cursorPoint)) return '커서 좌표가 잘못됨';
  if ((cmd.type === 'useItem' || cmd.type === 'summoner' || cmd.type === 'cast') && cmd.point != null && !_cmdIsPoint(cmd.point)) return '좌표가 잘못됨';
  if ((cmd.type === 'cast' || cmd.type === 'levelUpSkill') && !_CMD_SKILL_SLOTS.includes(cmd.slot)) return '스킬 칸이 잘못됨';
  if (cmd.type === 'summoner' && !_CMD_SUMMONER_SLOTS.includes(cmd.slot)) return '소환사 주문 칸이 잘못됨';
  if (cmd.type === 'useItem' && !(Number.isInteger(cmd.slot) && cmd.slot >= 0 && cmd.slot < 6)) return '아이템 칸이 잘못됨';
  if (cmd.type === 'sellItem' && !(cmd.slot === 'boots' || (Number.isInteger(cmd.slot) && cmd.slot >= 0 && cmd.slot < 6))) return '판매 칸이 잘못됨';
  if (cmd.type === 'attack' && !Number.isInteger(cmd.targetId)) return '대상이 없음';
  if (cmd.targetId != null && !Number.isInteger(cmd.targetId)) return '대상 ID가 잘못됨';
  if (cmd.type === 'buyItem' && (typeof cmd.itemId !== 'string' || typeof ITEM_DATA === 'undefined' || !ITEM_DATA[cmd.itemId])) return '없는 아이템';
  return null;
}

class LocalSession {
  constructor() { this.kind = 'local'; this.tick = 0; this.simTimeSec = 0; this.commandSeq = 0; this.lastResult = null; }
  // 명령을 보낸 플레이어의 챔피언. 1:1이 되면 플레이어 ID → 챔피언으로 고르게 된다(지금은 조작 중인 챔피언 하나).
  _actor() { return (typeof controller !== 'undefined' && controller) ? controller : null; }
  advance(dt) { if (dt > 0) { this.tick += 1; this.simTimeSec += dt; } }
  reset() { this.tick = 0; this.simTimeSec = 0; emitGameEvent('gameReset', {}); }
  snapshot() { return buildGameSnapshot(); }
  events(sinceSeq = 0) { return recentGameEvents(sinceSeq); }
  submit(cmd) {
    const seq = ++this.commandSeq;
    let res;
    const bad = validateCommand(cmd);
    const actor = this._actor();
    if (bad) res = { ok: false, reason: bad };
    else if (!actor) res = { ok: false, reason: '조작 중인 챔피언이 없음' };
    else {
      try { res = this._apply(actor, cmd); } catch (e) { console.error('[SESSION] 명령 처리 오류', cmd, e); res = { ok: false, reason: '처리 오류' }; }
    }
    this.lastResult = res;
    emitGameEvent('commandResult', { commandSeq: seq, commandType: cmd && cmd.type, ok: !!res.ok, reason: res.reason || null, outcome: typeof res.outcome === 'boolean' ? res.outcome : null });
    return res;
  }
  _target(id) {
    if (id == null) return null;
    const u = findEntityById(id);
    return u || null;
  }
  // 기존 함수로 연결. 각 분기의 동작은 93차 이전 입력 처리 코드와 같다(입력 쪽에서 옮겨 온 게임 규칙만 여기 있다).
  _apply(c, cmd) {
    // 94차: 새 이동·공격·정지·귀환 명령은 기억해 둔 스킬 선입력을 취소한다(원작 - 마지막 명령이 이긴다).
    if (['move', 'stop', 'attack', 'attackMove', 'recall'].includes(cmd.type)) c.pendingCast = null;
    switch (cmd.type) {
      case 'move': {
        const p = _cmdVec(cmd.point);
        // 마스터 이 Q(일격필살) 중 우클릭 = 재등장 방향만 정하고 이동하지 않는다(요청 문서 1 섹션 25).
        if (c._masteryi && c._masteryi.alpha && typeof c._masteryiSetAlphaStrikeReemergeDirection === 'function') { c._masteryiSetAlphaStrikeReemergeDirection(p); return { ok: true, outcome: true }; }
        return { ok: true, outcome: c.moveTo(p) };
      }
      case 'stop': return { ok: true, outcome: c.moveTo(c.root.position.clone()) };
      case 'attack': {
        const t = this._target(cmd.targetId);
        if (!t) return { ok: false, reason: '대상이 없음' };
        if (cmd.fromAttackMove) c._attackMoveDest = null;
        return { ok: true, outcome: c.selectTarget(t) };
      }
      case 'clearTarget': c.currentTarget = null; return { ok: true, outcome: true };
      case 'attackMove':
        return { ok: true, outcome: c.attackMoveTo(_cmdVec(cmd.point), { championsOnly: !!cmd.championsOnly, cursorPoint: cmd.cursorPoint ? _cmdVec(cmd.cursorPoint) : null }) };
      case 'cast': {
        // 대상 지정 스킬: 고른 대상을 지금 대상으로 삼고 시전(사거리·비용은 각 스킬 코드가 판정 - 기존 skillAim.cast와 같다).
        if (cmd.targetId != null) { const t = this._target(cmd.targetId); if (t && t !== c.currentTarget) c.currentTarget = t; }
        return { ok: true, outcome: c.castAbility(cmd.slot, cmd.point ? _cmdVec(cmd.point) : null) };
      }
      case 'levelUpSkill': return { ok: true, outcome: c.levelUpSkill(cmd.slot) };
      case 'recall': return { ok: true, outcome: c.startRecall() };
      case 'summoner': {
        if (typeof castSummonerSpell !== 'function') return { ok: false, reason: '소환사 주문 없음' };
        const t = cmd.targetId != null ? this._target(cmd.targetId) : null;
        return { ok: true, outcome: castSummonerSpell(c, cmd.slot, cmd.point ? _cmdVec(cmd.point) : null, null, { target: t }) };
      }
      case 'useItem': {
        if (typeof useItem !== 'function') return { ok: false, reason: '아이템 시스템 없음' };
        const opts = {};
        if (cmd.placeAhead) opts.placeAhead = true;
        if (cmd.point) opts.point = _cmdVec(cmd.point);
        const before = c.items && c.items[cmd.slot];
        const outcome = useItem(c, cmd.slot, opts);
        if (outcome) emitGameEvent('itemUsed', { entityId: entityId(c), itemId: before ? before.id : null, slot: cmd.slot });
        return { ok: true, outcome };
      }
      case 'placeWard': return typeof placeWard === 'function' ? { ok: true, outcome: placeWard(c, _cmdVec(cmd.point)) } : { ok: false, reason: '와드 없음' };
      case 'buyItem': case 'sellItem': {
        // 100차: 원격 챔피언(온라인 참가자)의 거래는 방장이 되돌리기 기록을 남긴다(참가자 상점의 "되돌리기").
        const remote = c.isRemote && typeof shopRemoteRecord === 'function';
        if (remote) {
          const it = cmd.type === 'buyItem' ? ITEM_DATA[cmd.itemId] : (cmd.slot === 'boots' ? c.boots : c.items && c.items[cmd.slot]);
          const nm = it ? ((ITEM_DATA[it.id || cmd.itemId] || it).nameKo || it.id || cmd.itemId) : '';
          shopRemoteRecord(c, `${nm} ${cmd.type === 'buyItem' ? '구매' : '판매'}`);
        }
        let res;
        if (cmd.type === 'buyItem') res = typeof buildOrBuyItem === 'function' ? { ok: true, outcome: buildOrBuyItem(c, cmd.itemId) } : { ok: false, reason: '상점 없음' };
        else if (cmd.slot === 'boots') res = typeof sellBoots === 'function' ? { ok: true, outcome: sellBoots(c) } : { ok: false, reason: '상점 없음' };
        else res = typeof sellItem === 'function' ? { ok: true, outcome: sellItem(c, cmd.slot) } : { ok: false, reason: '상점 없음' };
        if (remote) { if (res.outcome) shopRemoteMarkAfter(c); else shopRemoteDrop(c); }
        return res;
      }
      case 'shopUndo':
        if (c.isRemote && typeof shopRemoteUndo === 'function') return { ok: true, outcome: shopRemoteUndo(c) };
        return { ok: true, outcome: typeof shopUndo === 'function' && c === (typeof controller !== 'undefined' ? controller : null) ? shopUndo() : false };
    }
    return { ok: false, reason: '처리하지 않는 명령' };
  }
}

// 지금 게임 세션(싱글플레이 = LocalSession). var: 파일 순서와 무관하게 typeof로 확인할 수 있게.
var gameSession = new LocalSession();
if (typeof window !== 'undefined') window.gameSession = gameSession; // 개발자 도구·브라우저 점검용(gameSession.snapshot()/events())
// 입력 쪽 공용 진입점. 결과({ ok, reason, outcome })를 돌려준다.
function submitPlayerCommand(cmd) { return gameSession ? gameSession.submit(cmd) : { ok: false, reason: '세션 없음' }; }
