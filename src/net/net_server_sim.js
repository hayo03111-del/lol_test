/* net_server_sim.js — 104차: 전용 서버의 시뮬레이션 페이지(index.html?sim=<방>&key=<열쇠>&size=<팀당 인원>&ws=<서버>)
 *
 * 서버(server/game_server.js)가 판마다 머리 없는 Chromium에 이 페이지를 띄운다. 같은 게임 코드로 한 판을 돌리되 화면은 그리지 않고
 * (00_game_clock.js가 __netSimMode를 켜면 메인 루프가 멈추고, 워커 타이머가 netHeadlessFrame을 초당 30번 부른다),
 * 플레이어 모두를 "참가자"로 대한다 - 1:1 방장 모드(net_session.js)의 방장 코어(받는 사람별 view: 스냅샷·안개·미러·연출·지연 보정·혼잡 제어)를 그대로 쓴다.
 *
 * 플레이어(view) = { pid, name, token, team, order, pick, hello, remote(챔피언), guestReady, sent, seq, fx, ev, ack, cmdTimes, … }
 *  - 파랑 팀 첫 플레이어의 챔피언은 이 페이지의 controller(게임이 "조작 중인 챔피언"을 하나 꼭 갖고 있다), 나머지는 원격 챔피언(enemy_bot remote).
 *    모두 같은 명령 경로(gameSession._apply)로 움직인다.
 *  - 단계: lobby → pick(방이 다 차면 90초 타이머) → loading(go → 각자 챔피언을 불러오고 hello) → match(환영 → ready → 카운트다운) → ended → (모두 재대결) pick
 *  - 끊김: 같은 토큰으로 다시 들어오면 이어서 한다. 한 팀이 모두 60초 넘게 돌아오지 않으면 그 팀 기권패.
 *
 * 참가자 쪽 메시지(net_session.js 게스트가 그대로 쓴다): pickStart(dedicated·size) · roster · go · welcome(players·youTeam) · countdown · snap · end · rematch · chat(name·team) · bye
 * 참가자 → 서버: hi · pick · team(팀 바꾸기) · start(방장이 "지금 시작") · hello · ready · cmd · gping · gstat · chat · rematch
 */
const NET_SIM_TEAMS = ['BLUE', 'RED'];
const NET_SIM_LOAD_MS = 60000;

function netSimStart(url, code, key, size) {
  netLeave(true);
  const client = new NetClient(url);
  const st = { role: 'host', dedicated: true, client, name: '전용 서버', code, size: Math.max(1, Math.min(5, size || 1)), players: new Map(), order: 0,
    phase: 'lobby', locked: false, ended: false, clipTrack: new WeakMap(), projIds: new WeakMap(), projSeq: 0, fxSent: 0, status: '', pickEndsAt: 0, forceStart: false };
  netState = st;
  client.on('created', () => { st.status = `전용 서버 방 ${code} - 플레이어를 기다리는 중`; });
  client.on('peer-leave', (m) => _netSimLeave(st, m.pid));
  client.on('msg', (d, from) => { if (netState === st && from) _netSimOnMessage(st, from, d); });
  client.on('close', () => { if (netState === st) { _netSimTeardown(st); netState = null; } });
  st.ticker = __hostSetInterval(() => _netSimTick(st), 250);
  return client.connect().then(() => { client.send({ t: 'sim', code, key }); return st; });
}
function _netSimPlayers(st) { return [...st.players.values()].sort((a, b) => a.order - b.order); }
function _netSimSend(st, p, d) { _netSendTo(st, p, d); }
function _netSimOwner(st) { const list = _netSimPlayers(st).filter((p) => p.connected); return list[0] || null; }
function _netSimTeamCount(st, team) { let n = 0; for (const p of st.players.values()) if (p.team === team) n++; return n; }
function _netSimNewView(p) {
  Object.assign(p, { remote: null, guestReady: false, sent: new Map(), seq: 0, fx: [], ev: [], ack: 0, acc: 0, cmdTimes: [], mir: null, mirImgs: null, rlSent: null, budget: null, bpsAt: 0 });
  return p;
}
// 대기실·픽 상태를 모두에게(각자 "나" 표시)
function _netSimRoster(st) {
  const owner = _netSimOwner(st);
  const sec = st.phase === 'pick' && st.pickEndsAt ? Math.max(0, Math.ceil((st.pickEndsAt - __gcRealNow()) / 1000)) : null;
  const list = _netSimPlayers(st).map((p) => ({ pid: p.pid, name: p.name, team: p.team, champ: p.pick.champ, spells: p.pick.spells, locked: !!p.pick.locked, on: !!p.connected }));
  for (const p of st.players.values()) {
    if (!p.connected) continue;
    _netSimSend(st, p, { k: 'roster', size: st.size, phase: st.phase, sec, owner: owner ? owner.pid : null, you: p.pid, players: list });
  }
  st.status = `전용 서버 방 ${st.code} - ${st.phase} ${st.players.size}/${st.size * 2}`;
}
function _netSimOnMessage(st, pid, d) {
  if (!d || typeof d !== 'object') return;
  let p = st.players.get(pid);
  if (d.k === 'hi' || (d.k === 'hello' && !p)) {
    const token = String(d.token || '');
    if (d.v != null && d.v !== NET_PROTOCOL_VERSION) { _netSimSendRaw(st, pid, { k: 'bye', msg: '게임 버전이 다릅니다 - 새로고침하세요' }); st.client.send({ t: 'kick', pid }); return; }
    const old = token ? [...st.players.values()].find((q) => q.token === token) : null;
    if (old) { // 다시 들어왔다(같은 브라우저 토큰) - 새 연결 아이디로 옮긴다
      if (old.pid !== pid) { st.players.delete(old.pid); old.pid = pid; st.players.set(pid, old); }
      old.connected = true; old.goneAt = null;
      p = old;
      if (st.phase === 'match' && p.remote) { _netSimResume(st, p); return; }
      if (st.phase === 'pick' || st.phase === 'lobby') { _netSimSend(st, p, { k: 'pickStart', sec: null, hostName: st.name, dedicated: true, size: st.size }); _netSimRoster(st); return; }
      return;
    }
    if (st.phase === 'match' || st.phase === 'loading') { _netSimSendRaw(st, pid, { k: 'bye', msg: '이미 대전 중인 방입니다' }); st.client.send({ t: 'kick', pid, msg: '이미 대전 중인 방입니다' }); return; }
    if (st.players.size >= st.size * 2) { _netSimSendRaw(st, pid, { k: 'bye', msg: '방이 가득 찼습니다' }); st.client.send({ t: 'kick', pid, msg: '방이 가득 참' }); return; }
    const team = _netSimTeamCount(st, 'BLUE') <= _netSimTeamCount(st, 'RED') ? 'BLUE' : 'RED';
    p = _netSimNewView({ pid, name: String(d.name || '플레이어').slice(0, 24), token, team, order: ++st.order, pick: { champ: null, spells: null, locked: false }, hello: null, connected: true, goneAt: null, rematch: false });
    st.players.set(pid, p);
    if (st.phase === 'lobby' || st.phase === 'ended') { st.phase = 'pick'; st.pickEndsAt = 0; st.forceStart = false; }
    _netSimSend(st, p, { k: 'pickStart', sec: null, hostName: st.name, dedicated: true, size: st.size });
    _netSimCheckFull(st);
    _netSimRoster(st);
    if (d.k === 'hello') _netSimOnMessage(st, pid, d);
    return;
  }
  if (!p) return;
  switch (d.k) {
    case 'pick': {
      if (st.phase !== 'pick') return;
      p.pick = _netPickSanitize(d);
      _netSimRoster(st); _netSimMaybeGo(st);
      return;
    }
    case 'team': {
      if (st.phase !== 'pick' || p.pick.locked || !NET_SIM_TEAMS.includes(d.team) || d.team === p.team || _netSimTeamCount(st, d.team) >= st.size) return;
      p.team = d.team; _netSimRoster(st);
      return;
    }
    case 'start': {
      if (st.phase !== 'pick' || _netSimOwner(st) !== p) return;
      st.forceStart = true; _netSimMaybeGo(st);
      return;
    }
    case 'hello': {
      if (st.phase === 'match' && p.remote) { _netSimResume(st, p); return; }
      if (st.phase !== 'loading') return;
      p.hello = { champ: _netPickSanitize(d).champ || p.pick.champ || 'garen', spells: Array.isArray(d.spells) ? d.spells.slice(0, 2).map(String) : p.pick.spells, rune: d.rune && typeof d.rune === 'object' ? d.rune : null };
      if (_netSimPlayers(st).every((q) => q.hello || !q.connected)) _netSimStartMatch(st);
      return;
    }
    case 'ready': {
      if (st.phase !== 'match' || !p.remote) return;
      p.guestReady = true; p.goneAt = null;
      if (!st.counted && _netSimPlayers(st).every((q) => q.guestReady || !q.connected)) _netSimCountdown(st);
      netApplyControlLock();
      return;
    }
    case 'gping': _netSimSend(st, p, { k: 'gpong', at: d.at }); return;
    case 'gstat':
      if (Number.isFinite(d.rtt)) p.guestRtt = Math.round(d.rtt); if (Number.isFinite(d.delay)) p.guestDelay = Math.round(d.delay);
      if (Number.isFinite(d.q)) { p.guestQueue = Math.round(d.q); p.guestRecvBps = Number.isFinite(d.rb) ? d.rb : null; _netRateControl(p, { now: __gcRealNow(), q: d.q, rb: p.guestRecvBps }); }
      return;
    case 'chat': _netBroadcast(st, { k: 'chat', text: String(d.text || '').slice(0, 200), name: p.name, team: p.team, from: p.pid }); return;
    case 'rematch': {
      if (st.phase !== 'ended') return;
      p.rematch = true;
      const on = _netSimPlayers(st).filter((q) => q.connected);
      _netBroadcast(st, { k: 'rematch', n: on.filter((q) => q.rematch).length, total: on.length, name: p.name });
      if (on.every((q) => q.rematch)) _netSimBackToPick(st);
      return;
    }
    case 'cmd': {
      const bot = p.remote;
      if (!bot || bot._removed || !p.guestReady || st.locked || st.phase !== 'match') return;
      const cmd = d.cmd;
      if (validateCommand(cmd)) return;
      const now = __gcRealNow(); p.cmdTimes = p.cmdTimes.filter((x) => now - x < 1000);
      if (p.cmdTimes.length >= 60) return;
      p.cmdTimes.push(now);
      if (Number.isInteger(d.s) && d.s > p.ack) p.ack = d.s;
      withCombatActor(bot, () => { try { gameSession._apply(bot, cmd); } catch (e) { console.error('[SIM] 명령 처리 오류', cmd, e); } });
    }
  }
}
// 아직 플레이어로 등록되지 않은 연결에 보내기
function _netSimSendRaw(st, pid, d) { st.client.send({ t: 'msg', to: pid, d }); }
function _netSimCheckFull(st) { if (st.phase === 'pick' && !st.pickEndsAt && st.players.size >= st.size * 2) st.pickEndsAt = __gcRealNow() + NET_PICK_SEC * 1000; }
function _netSimTick(st) {
  if (netState !== st) { __hostClearInterval(st.ticker); return; }
  if (st.phase === 'pick' && st.pickEndsAt && __gcRealNow() >= st.pickEndsAt) { // 시간 끝 - 지금 고른 것으로 확정(안 고른 사람은 가렌)
    for (const p of st.players.values()) { if (!p.pick.champ) p.pick.champ = 'garen'; p.pick.locked = true; }
    _netSimRoster(st); _netSimMaybeGo(st);
  }
  if (st.phase === 'pick' && st.pickEndsAt && (st.lastRosterSec || 0) !== Math.ceil((st.pickEndsAt - __gcRealNow()) / 5000)) { st.lastRosterSec = Math.ceil((st.pickEndsAt - __gcRealNow()) / 5000); _netSimRoster(st); }
  if (st.phase === 'loading' && __gcRealNow() - st.loadingAt > NET_SIM_LOAD_MS) { // 오래 걸리면 고른 것으로 시작
    for (const p of st.players.values()) if (!p.hello) p.hello = { champ: p.pick.champ || 'garen', spells: p.pick.spells, rune: null };
    _netSimStartMatch(st);
  }
}
function _netSimMaybeGo(st) {
  if (st.phase !== 'pick') return;
  const list = _netSimPlayers(st).filter((p) => p.connected);
  if (!list.length || !list.every((p) => p.pick.locked && p.pick.champ)) return;
  const full = st.players.size >= st.size * 2;
  if (!full && !st.forceStart) return;
  if (!NET_SIM_TEAMS.every((t) => list.some((p) => p.team === t))) return; // 두 팀 다 한 명 이상
  for (const p of [...st.players.values()]) if (!p.connected) st.players.delete(p.pid); // 픽 중에 나간 사람은 뺀다
  st.phase = 'loading'; st.loadingAt = __gcRealNow();
  for (const p of st.players.values()) p.hello = null;
  _netBroadcast(st, { k: 'go' });
  _netSimRoster(st);
}
function _netSimSpawnPos(team, i, n) {
  const base = getTeamSpawnPosition(team).clone();
  base.x += (i - (n - 1) / 2) * lolRangeToWorld(140);
  return base;
}
async function _netSimStartMatch(st) {
  if (st.phase !== 'loading' || st.starting) return;
  st.starting = true;
  try {
    const list = _netSimPlayers(st);
    _netSimTeardown(st);
    const first = list.find((p) => p.team === 'BLUE') || list[0], h0 = first.hello || { champ: first.pick.champ || 'garen', spells: first.pick.spells, rune: null };
    // 첫 플레이어의 챔피언 = 이 페이지의 controller. 불러온 뒤 게임을 처음 상태로(같은 챔피언으로 다시 세워진다).
    await _netLoadChampion(h0.champ, h0.spells, h0.rune);
    await _netResetGameAndWait();
    if (netState !== st) return;
    _netClearPracticeUnits();
    const teamIdx = { BLUE: 0, RED: 0 }, teamN = { BLUE: _netSimTeamCount(st, 'BLUE'), RED: _netSimTeamCount(st, 'RED') };
    for (const p of list) {
      _netSimNewView(p);
      const h = p.hello || { champ: p.pick.champ || 'garen', spells: p.pick.spells, rune: null };
      const pos = _netSimSpawnPos(p.team, teamIdx[p.team]++, teamN[p.team]);
      let c;
      if (p === first) {
        c = controller;
        c.team = p.team; c.root.position.copy(pos); c.targetPos = null; c.currentTarget = null;
        if (h.rune && typeof runeSetPage === 'function') runeSetPage(c, h.rune);
      } else {
        let champ = h.champ; if (!CHAMPION_MODEL_LIBRARY.some(([k]) => k === champ)) champ = 'garen';
        c = await spawnEnemyBot(champ, { team: p.team, remote: true, name: p.name, position: pos });
        if (netState !== st) { removeEnemyBot(c); return; }
        c.root.position.copy(pos);
        if (h.rune && typeof runeSetPage === 'function') runeSetPage(c, h.rune);
      }
      if (h.spells && typeof setSummonerSpell === 'function' && typeof SUMMONER_SPELL_DATA !== 'undefined') withCombatActor(c, () => { for (const [i, k] of ['D', 'F'].entries()) if (h.spells[i] && SUMMONER_SPELL_DATA[h.spells[i]]) setSummonerSpell(c, k, h.spells[i]); });
      if (typeof c.recomputeStats === 'function') { c.recomputeStats(); c.hp = c.maxHp; c.mp = c.maxMp; }
      c.netName = p.name; c.isNetPlayer = true;
      p.remote = c;
    }
    if (typeof visionSystem !== 'undefined' && visionSystem && !visionSystem.enabled) visionSystem.setEnabled(true);
    st.phase = 'match'; st.ended = false; st.counted = false; st.locked = true;
    if (!paused) togglePause(true); // 모두 준비될 때까지 멈춰 둔다
    _netFxInstall(st); _netLagCompInstall(st); _netHostHookEvents(st);
    for (const p of list) if (p.connected) _netSimSend(st, p, _netSimWelcome(st, p, false));
  } catch (e) {
    console.error('[SIM] 대전 준비 실패', e);
  } finally { st.starting = false; netApplyControlLock(); }
}
function _netSimWelcome(st, p, resume) {
  return {
    k: 'welcome', resume, dedicated: true, hostName: st.name, youId: entityId(p.remote), youTeam: p.team, youChamp: p.remote.championId, gt: _netRound(getTurretGameTimeSec()),
    players: _netSimPlayers(st).filter((q) => q.remote).map((q) => ({ id: entityId(q.remote), champ: q.remote.championId, team: q.team, name: q.name, me: q === p ? 1 : 0 })),
    structs: _netStructures().map(([k, s]) => ({ id: entityId(s), k, tm: _netTeamCode(s.team), ty: s.type || null, x: _netRound(getWorldPosition(s).x), z: _netRound(getWorldPosition(s).z) })),
  };
}
function _netSimResume(st, p) {
  p.guestReady = false; p.sent = new Map(); p.seq = 0; p.rlSent = null; p.fx = []; p.ev = [];
  _netMirrorResend(p);
  _netSimSend(st, p, _netSimWelcome(st, p, true));
}
function _netSimCountdown(st) {
  st.counted = true; st.locked = true;
  if (!paused) togglePause(true);
  _netBroadcast(st, { k: 'countdown', sec: NET_COUNTDOWN_SEC });
  __hostSetTimeout(() => { if (netState !== st || st.phase !== 'match') return; st.locked = false; if (paused) togglePause(true); }, NET_COUNTDOWN_SEC * 1000);
}
function _netSimLeave(st, pid) {
  const p = st.players.get(pid); if (!p) return;
  p.connected = false;
  if (st.phase === 'pick' || st.phase === 'lobby' || st.phase === 'ended') {
    st.players.delete(pid);
    if (st.players.size < st.size * 2) st.pickEndsAt = 0;
    if (!st.players.size) st.phase = 'lobby';
    _netSimRoster(st); _netSimMaybeGo(st);
    if (st.phase === 'ended') { const on = _netSimPlayers(st); if (on.length && on.every((q) => q.rematch)) _netSimBackToPick(st); }
    return;
  }
  if (st.phase === 'loading') { if (_netSimPlayers(st).every((q) => q.hello || !q.connected)) _netSimStartMatch(st); return; }
  // 대전 중: 그 챔피언은 제자리에 둔다. 60초 안에 돌아오면 이어서, 한 팀이 모두 안 돌아오면 그 팀 기권패.
  p.guestReady = false; p.goneAt = __gcRealNow();
  if (p.remote) withCombatActor(p.remote, () => p.remote.moveTo(p.remote.root.position.clone()));
  _netBroadcast(st, { k: 'chat', text: `${p.name}의 연결이 끊겼습니다 - 60초 동안 기다립니다`, name: '서버', team: p.team, sys: 1 });
  const goneAt = p.goneAt;
  __hostSetTimeout(() => {
    if (netState !== st || st.phase !== 'match' || p.goneAt !== goneAt) return;
    const teamGone = _netSimPlayers(st).filter((q) => q.team === p.team).every((q) => q.goneAt && __gcRealNow() - q.goneAt >= NET_RECONNECT_GRACE_MS - 50);
    if (teamGone) _netSimGameOver(st, p.team === 'BLUE' ? 'RED' : 'BLUE', '상대 팀 기권');
  }, NET_RECONNECT_GRACE_MS);
  // 모두 끊겨도(같은 와이파이가 잠깐 끊김 등) 바로 치우지 않는다 - 60초 안에 누구든 돌아오면 그대로 이어진다
  if (!_netSimPlayers(st).some((q) => q.connected)) {
    __hostSetTimeout(() => {
      if (netState !== st || st.phase !== 'match' || _netSimPlayers(st).some((q) => q.connected)) return;
      _netSimTeardown(st); st.phase = 'lobby'; st.players.clear();
    }, NET_RECONNECT_GRACE_MS + 1000);
  }
}
function _netSimGameOver(st, winner, reason) {
  if (st.ended) return;
  st.ended = true; st.phase = 'ended';
  const stats = _netEndStats();
  for (const p of _netViews(st)) { if (!p.guestReady) continue; try { _netSendTo(st, p, netBuildHostSnapshot(st, p)); } catch (e) { /* 무시 */ } }
  _netBroadcast(st, { k: 'end', winner, stats, reason: reason || null });
  for (const p of st.players.values()) p.rematch = false;
  st.locked = true;
}
function _netSimBackToPick(st) {
  _netSimTeardown(st);
  st.phase = 'pick'; st.pickEndsAt = 0; st.forceStart = false;
  for (const p of st.players.values()) { _netSimNewView(p); p.pick.locked = false; p.hello = null; p.rematch = false; }
  _netSimCheckFull(st);
  _netBroadcast(st, { k: 'pickStart', sec: null, hostName: st.name, dedicated: true, size: st.size });
  _netSimRoster(st);
}
// 판을 치운다: 원격 챔피언·연출 기록·지연 보정·이벤트 훅
function _netSimTeardown(st) {
  for (const p of st.players.values()) { if (p.remote && p.remote !== controller) removeEnemyBot(p.remote); p.remote = null; p.guestReady = false; }
  if (typeof clearEnemyBots === 'function') clearEnemyBots();
  _netFxUninstall(st); _netLagCompUninstall(st);
  if (st.offEvents) st.offEvents();
  st.locked = false; st.counted = false;
  if (paused) togglePause(true);
}
// 페이지가 ?sim=… 으로 열리면: 게임이 다 뜬 뒤 서버에 붙는다.
function _netSimBoot() {
  if (typeof window === 'undefined' || !window.__netSimMode) return;
  const q = new URLSearchParams(location.search);
  const code = q.get('sim'), key = q.get('key'), size = Number(q.get('size')) || 1;
  const ws = q.get('ws') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  window.__netForceHeadless = true;
  const t0 = __gcRealNow();
  // 처음 열린 페이지에는 아직 챔피언이 없다(로비에서 고르기 전) - 미리 하나 불러 둔다(첫 판 준비가 빨라진다)
  if (!(typeof controller !== 'undefined' && controller) && typeof loadChampionFromLibrary === 'function') { try { loadChampionFromLibrary('garen'); } catch (e) { /* 판 시작 때 다시 */ } }
  const wait = () => {
    if (typeof spawnEnemyBot === 'function' && typeof turrets !== 'undefined' && turrets.length) {
      _netWorkerTickerStart();
      netSimStart(ws, code, key, size).catch((e) => console.error('[SIM] 서버 연결 실패', e));
      return;
    }
    if (__gcRealNow() - t0 > 120000) { console.error('[SIM] 게임을 불러오지 못했습니다'); return; }
    __hostSetTimeout(wait, 200);
  };
  wait();
}
if (typeof window !== 'undefined') { window.netSimStart = netSimStart; if (window.__netSimMode) { if (document.readyState === 'complete') _netSimBoot(); else window.addEventListener('load', _netSimBoot); } }
