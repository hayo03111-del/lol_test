/* net_session.js — 97차: 웹소켓 온라인 1:1 대전(방장 권위 방식)
 *
 * 구조
 *  - 중계 서버(server/relay.js)는 방 코드로 두 브라우저를 이어 주고 메시지를 그대로 넘긴다(게임 규칙은 모른다).
 *  - 방장(호스트, 파랑 팀) 브라우저가 한 판 전체를 시뮬레이션한다: 지금까지의 게임 코드 그대로(미니언·포탑·스킬·보상).
 *    참가자(게스트, 빨강 팀)의 챔피언은 방장 쪽에 "원격 챔피언"(enemy_bot.js의 remote 봇 - 두뇌 없음)으로 만들어지고,
 *    게스트가 보낸 명령(93차 명령 형식 - game_commands.js)을 그 챔피언 입장(withCombatActor)에서 LocalSession._apply로 실행한다.
 *    규칙 판정(쿨다운·마나·사거리·골드·상점 위치)은 방장의 기존 함수가 한다 - 게스트가 보낸 값을 믿지 않는다.
 *  - 게스트 브라우저는 시뮬레이션을 끄고(netGuestMode - 메인 루프가 simulateStep 대신 netGuestTick을 부른다),
 *    방장이 초당 15번 보내는 스냅샷으로 화면을 그린다: 챔피언(위치·방향·체력·동작 클립)·미니언·구조물·투사체.
 *    약 0.11초 늦게 그리면서 두 스냅샷 사이를 보간해 움직임이 끊기지 않게 한다. 입력은 RemoteSession이 명령으로 보낸다.
 *  - ID: 방장이 정한 엔티티 ID(entity_registry.js)를 양쪽이 같이 쓴다 - 게스트는 구조물을 팀·종류·위치로 맞춰 방장 ID를 붙이고,
 *    미니언·챔피언은 스냅샷의 ID로 만든다. 그래서 게스트가 보낸 "대상 ID"가 방장 쪽에서 같은 유닛을 가리킨다.
 *
 * 메시지(중계 서버의 {t:'msg', d} 안쪽 d)
 *   게스트 → 방장  {k:'hello', champ, name}  {k:'ready'}  {k:'cmd', cmd}
 *   방장 → 게스트  {k:'welcome', hostChamp, hostName, hostId, youId, structs:[{id,k,tm,ty,x,z}], gt}
 *                  {k:'snap', t, gt, ents:[...], pr:[...], me:{...}}   {k:'bye', msg}
 * 지금 없는 것(README 97차 "한계"): 스킬 이펙트(파티클·장판)는 방장 화면에만 나온다(게스트는 동작·투사체·피해 결과만),
 * 와드는 게스트 화면에 안 보인다, 방장 탭이 백그라운드로 가면 게임이 멈춘다(브라우저가 화면 갱신을 멈춘다).
 */
const NET_SNAPSHOT_HZ = 15;
const NET_INTERP_DELAY_MS = 110;
const NET_GUEST_ID_BASE = 1000000; // 게스트가 직접 발급하는 ID는 여기부터(방장 ID와 겹치지 않게)
var netGuestMode = false; // var: 메인 루프(champion_glb_loader.js)가 typeof로 본다
var netState = null;      // { role:'host'|'guest', client, ... }

// ---------------- 중계 서버 연결 ----------------
class NetClient {
  constructor(url) { this.url = url; this.ws = null; this.handlers = new Map(); this.rtt = null; this._pingTimer = null; }
  on(type, fn) { this.handlers.set(type, fn); return this; }
  _emit(type, m) { const fn = this.handlers.get(type); if (fn) { try { fn(m); } catch (e) { console.error('[NET]', type, e); } } }
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true; resolve(this);
        this._pingTimer = __hostSetInterval(() => this.send({ t: 'ping', at: __gcRealNow() }), 2000);
      };
      ws.onerror = () => { if (!opened) reject(new Error('서버에 연결하지 못했습니다')); };
      ws.onclose = () => { if (this._pingTimer) __hostClearInterval(this._pingTimer); this._pingTimer = null; if (opened) this._emit('close', {}); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'pong') { this.rtt = Math.round(__gcRealNow() - m.at); this._emit('pong', m); return; }
        if (m.t === 'msg') this._emit('msg', m.d || {});
        else this._emit(m.t, m);
      };
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  sendMsg(d) { this.send({ t: 'msg', d }); }
  close() { if (this._pingTimer) __hostClearInterval(this._pingTimer); this._pingTimer = null; this.handlers.clear(); if (this.ws) try { this.ws.close(); } catch (e) { /* 이미 닫힘 */ } }
}

// 기본 서버 주소: 이 페이지를 relay.js가 내보냈으면 같은 주소의 /ws. GitHub Pages 같은 정적 호스팅이면 직접 입력해야 한다.
function netDefaultServerUrl() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return '';
  if (/github\.io$/.test(location.hostname)) return '';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
function _netToast(msg) { if (typeof showSkillToast === 'function') showSkillToast(msg); console.log('[NET] ' + msg); }
function _netStatus(msg) { const el = document.getElementById('netStatus'); if (el) el.textContent = msg; if (netState) netState.status = msg; }
const _netRound = (v, m = 1000) => (Number.isFinite(v) ? Math.round(v * m) / m : 0);
const _netTeamCode = (t) => (t === 'RED' ? 'R' : 'B');
const _netTeamName = (c) => (c === 'R' ? 'RED' : 'BLUE');

// 게임을 처음 상태로 돌리고 챔피언을 다시 불러올 때까지 기다린다(resetGame은 챔피언을 비동기로 다시 만든다).
function _netResetGameAndWait() {
  return new Promise((resolve) => {
    const old = typeof controller !== 'undefined' ? controller : null;
    if (typeof clearEnemyBots === 'function') clearEnemyBots();
    resetGame();
    const t0 = __gcRealNow();
    const poll = () => {
      const c = typeof controller !== 'undefined' ? controller : null;
      if ((c && c !== old && c.root) || !(typeof lastChampionGlb !== 'undefined' && lastChampionGlb) || __gcRealNow() - t0 > 30000) { resolve(c); return; }
      __hostSetTimeout(poll, 50);
    };
    poll();
  });
}
// 대전에는 연습용 허수아비·아군 더미가 없다.
function _netClearPracticeUnits() {
  if (typeof dummy !== 'undefined' && dummy) { removeDummyVisual(dummy); dummy = null; }
  if (typeof clearPlacedDummies === 'function') clearPlacedDummies();
  if (typeof clearPlacedAllies === 'function') clearPlacedAllies();
  if (typeof wardSystem !== 'undefined' && wardSystem && wardSystem.clear) wardSystem.clear();
}
function _netStructures() {
  const out = [];
  for (const t of (typeof turrets !== 'undefined' ? turrets : [])) out.push(['t', t]);
  for (const i of (typeof inhibitorBuildings !== 'undefined' ? inhibitorBuildings : [])) out.push(['h', i]);
  for (const n of (typeof nexusBuildings !== 'undefined' ? nexusBuildings : [])) out.push(['n', n]);
  return out;
}
function _netChampYaw(c) {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion);
  return Math.atan2(f.x, f.z);
}

// ================= 방장(호스트) =================
function netHostCreateRoom(url, name) {
  netLeave(true);
  const client = new NetClient(url);
  netState = { role: 'host', client, name: name || '방장', remote: null, guestName: '', code: null, acc: 0, seq: 0, clipTrack: new WeakMap(), projIds: new WeakMap(), projSeq: 0, cmdTimes: [], starting: false, status: '' };
  const st = netState;
  _netStatus('서버에 연결하는 중…');
  client.on('created', (m) => { st.code = m.code; _netStatus(`방 코드 ${m.code} - 상대를 기다리는 중`); _netToast(`방을 만들었습니다: ${m.code}`); });
  client.on('peer-join', (m) => { st.guestName = m.name || '상대'; _netStatus(`${st.guestName} 참가 - 챔피언 정보를 기다리는 중`); });
  client.on('peer-leave', () => { _netHostEndMatch(); _netStatus(`상대가 나갔습니다 - 방 코드 ${st.code}`); _netToast('상대가 나갔습니다'); });
  client.on('error', (m) => { _netStatus('오류: ' + m.msg); });
  client.on('close', () => { if (netState === st) { _netHostEndMatch(); netState = null; _netStatus('서버 연결이 끊겼습니다'); } });
  client.on('pong', () => { if (st.code && st.remote) _netStatus(`대전 중 - ${st.guestName} · 지연 ${client.rtt}ms`); });
  client.on('msg', (d) => _netHostOnMessage(st, d));
  return client.connect().then(() => { client.send({ t: 'create', name: st.name }); return st; })
    .catch((e) => { if (netState === st) netState = null; _netStatus(e.message); throw e; });
}
function _netHostOnMessage(st, d) {
  if (!d || typeof d !== 'object') return;
  if (d.k === 'hello') { _netHostStartMatch(st, String(d.champ || ''), String(d.name || st.guestName || '상대').slice(0, 24)); return; }
  if (d.k === 'ready') { st.guestReady = true; _netStatus(`대전 중 - ${st.guestName}`); _netToast(`${st.guestName}와(과) 대전을 시작합니다`); return; }
  if (d.k === 'cmd') {
    const bot = st.remote;
    if (!bot || bot._removed || !st.guestReady) return;
    const cmd = d.cmd;
    if (validateCommand(cmd)) return;
    // 초당 명령 수 제한(우클릭 연타 정도는 넉넉히) - 넘치면 버린다.
    const now = __gcRealNow(); st.cmdTimes = st.cmdTimes.filter((x) => now - x < 1000);
    if (st.cmdTimes.length >= 60) return;
    st.cmdTimes.push(now);
    withCombatActor(bot, () => { try { gameSession._apply(bot, cmd); } catch (e) { console.error('[NET] 원격 명령 처리 오류', cmd, e); } });
  }
}
async function _netHostStartMatch(st, champ, name) {
  if (st.starting) return;
  if (!CHAMPION_MODEL_LIBRARY.some(([k]) => k === champ)) champ = 'garen';
  st.starting = true; st.guestReady = false; st.guestName = name;
  _netStatus(`${name} 참가 - 게임 준비 중`);
  try {
    if (st.remote) { removeEnemyBot(st.remote); st.remote = null; }
    await _netResetGameAndWait();
    if (netState !== st) return;
    _netClearPracticeUnits();
    if (controller) { controller.team = 'BLUE'; controller.root.position.copy(getTeamSpawnPosition('BLUE')); controller.targetPos = null; controller.currentTarget = null; }
    if (typeof visionSystem !== 'undefined') visionSystem.setViewTeam('BLUE');
    const bot = await spawnEnemyBot(champ, { team: 'RED', remote: true, name });
    if (netState !== st) { removeEnemyBot(bot); return; }
    st.remote = bot;
    st.client.sendMsg({
      k: 'welcome', hostChamp: controller ? controller.championId : 'garen', hostName: st.name,
      hostId: entityId(controller), youId: entityId(bot), gt: _netRound(getTurretGameTimeSec()),
      structs: _netStructures().map(([k, s]) => ({ id: entityId(s), k, tm: _netTeamCode(s.team), ty: s.type || null, x: _netRound(getWorldPosition(s).x), z: _netRound(getWorldPosition(s).z) })),
    });
  } catch (e) {
    console.error('[NET] 대전 준비 실패', e); _netStatus('대전 준비 실패: ' + (e.message || e));
  } finally { st.starting = false; }
}
function _netHostEndMatch() {
  const st = netState; if (!st || st.role !== 'host') return;
  if (st.remote) { removeEnemyBot(st.remote); st.remote = null; }
  st.guestReady = false;
}
// 동작 클립이 새로 시작될 때마다 늘어나는 번호(같은 평타를 연속으로 쳐도 게스트가 다시 틀 수 있게).
function _netClipCounter(st, c) {
  let r = st.clipTrack.get(c);
  if (!r) { r = { a: null, n: 0 }; st.clipTrack.set(c, r); }
  if (c.currentAction !== r.a) { r.a = c.currentAction; r.n++; }
  return r.n;
}
function _netSnapChampion(st, c, nowMs) {
  const p = c.root.position, a = c.currentAction;
  const e = {
    i: entityId(c), k: 'c', tm: _netTeamCode(c.team), x: _netRound(p.x), y: _netRound(p.y), z: _netRound(p.z), r: _netRound(_netChampYaw(c)),
    hp: _netRound(c.hp, 10), mh: _netRound(c.maxHp, 10), sh: _netRound(c.shield || 0, 10),
    c: c.championId, s: c.state, lv: c.champLevel || 1, mp: _netRound(c.mp, 10), mm: _netRound(c.maxMp, 10),
    cl: c.currentClipKey || null, cn: _netClipCounter(st, c), lp: a && a.loop === THREE.LoopOnce ? 0 : 1, ts: a ? _netRound(a.timeScale, 100) : 1, at: a ? _netRound(a.time, 100) : 0,
    mv: c.model ? (c.model.visible !== false ? 1 : 0) : 1,
    sc: c.score ? [c.score.kills || 0, c.score.deaths || 0, c.score.assists || 0, c.score.cs || 0] : [0, 0, 0, 0],
  };
  if (c.state === STATE.DEAD && c._respawnAt) e.rs = Math.max(0, Math.round(c._respawnAt - nowMs));
  return e;
}
// 게스트 본인만 받는 정보: 골드·아이템·스킬·쿨다운·소환사 주문·능력치·상태 효과.
function _netSnapPrivate(st, c, nowMs) {
  const p = snapshotPlayer(c, nowMs);
  const cd = {}; for (const k of ['Q', 'W', 'E', 'R']) cd[k] = _netRound(Math.max(0, (c.cooldowns && c.cooldowns[k]) || 0), 100);
  const me = { g: p.gold, it: p.items, bo: p.boots, tr: p.trinket, sl: p.skillLevels, sp: p.skillPoints, ex: p.exp, sm: p.summoners, cd,
    res: { rage: c._renekton ? _netRound(c._renekton.rage || 0, 10) : null, flow: c._yasuo ? _netRound(c._yasuo.flow || 0, 10) : null, grit: c._sett ? _netRound(c._sett.grit || 0, 10) : null },
    ef: (c.statusEffects || []).filter((x) => !x.expiresAt || x.expiresAt > nowMs).slice(0, 16).map((x) => ({ id: String(x.id || x.type), type: x.type, ms: x.expiresAt ? Math.round(x.expiresAt - nowMs) : null, v: typeof x.value === 'number' ? x.value : null })) };
  if ((st.seq % 5) === 0) { // 능력치는 자주 바뀌지 않는다 - 3번에 1번꼴
    const s = {}; for (const [k, v] of Object.entries(c.stats || {})) if (typeof v === 'number' && Number.isFinite(v)) s[k] = _netRound(v, 1000);
    me.st = s; me.hr = c.hpRegen || 0; me.mr = c.mpRegen || 0;
  }
  return me;
}
function netBuildHostSnapshot(st) {
  const nowMs = performance.now();
  const ents = [];
  const champs = [controller, ...enemyBots].filter((c) => c && c.root && !c._removed);
  for (const c of champs) ents.push(_netSnapChampion(st, c, nowMs));
  for (const m of minions) {
    if (!m || m.isDead || !m.mesh) continue;
    const p = m.mesh.position, yaw = m.body && m.body !== m.mesh ? (() => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(m.body.quaternion); return Math.atan2(f.x, f.z); })() : 0;
    ents.push({ i: entityId(m), k: 'm', tm: _netTeamCode(m.team), ty: m.type, x: _netRound(p.x), y: _netRound(p.y), z: _netRound(p.z), r: _netRound(yaw), hp: _netRound(m.hp, 10), mh: _netRound(m.maxHp, 10),
      cl: m.currentClipName || null, ai: m.attackClipIndex || 0, ts: m.currentAction ? _netRound(m.currentAction.timeScale, 100) : 1 });
  }
  for (const [k, s] of _netStructures()) ents.push({ i: entityId(s), k, hp: _netRound(s.hp, 10), mh: _netRound(s.maxHp, 10), d: s.destroyed ? 1 : 0 });
  const pr = [];
  for (const proj of projectiles.projectiles) {
    if (!proj.mesh || !proj.mesh.parent || proj.done) continue;
    let id = st.projIds.get(proj); if (!id) { id = ++st.projSeq; st.projIds.set(proj, id); }
    const p = proj.mesh.position, q = proj.mesh.quaternion;
    pr.push([id, _netRound(p.x), _netRound(p.y), _netRound(p.z), _netRound(q.x), _netRound(q.y), _netRound(q.z), _netRound(q.w), proj.color || 0xdff0ff, _netRound(proj.mesh.scale.x, 100)]);
  }
  const snap = { k: 'snap', t: _netRound(nowMs, 1), gt: _netRound(getTurretGameTimeSec()), ents, pr, ge: gameEnded ? 1 : 0 };
  if (st.remote) snap.me = _netSnapPrivate(st, st.remote, nowMs);
  st.seq++;
  return snap;
}
// 메인 루프가 시뮬레이션 뒤 프레임마다 부른다(실제 경과 시간 기준 초당 15번 보낸다).
function netHostFrame(dt) {
  const st = netState;
  if (!st || st.role !== 'host' || !st.remote || !st.guestReady) return;
  st.acc += dt;
  if (st.acc < 1 / NET_SNAPSHOT_HZ) return;
  st.acc = Math.min(st.acc - 1 / NET_SNAPSHOT_HZ, 1 / NET_SNAPSHOT_HZ);
  try { st.client.sendMsg(netBuildHostSnapshot(st)); } catch (e) { console.error('[NET] 스냅샷 오류', e); }
}

// ================= 참가자(게스트) =================
// 게스트의 세션: 명령을 검사해 방장에게 보낸다(결과는 다음 스냅샷으로 온다).
class RemoteSession {
  constructor(client) { this.kind = 'remote'; this.client = client; this.tick = 0; this.simTimeSec = 0; this.commandSeq = 0; this.lastResult = null; }
  advance(dt) { if (dt > 0) { this.tick += 1; this.simTimeSec += dt; } }
  reset() { this.tick = 0; this.simTimeSec = 0; }
  snapshot() { return buildGameSnapshot(); }
  events(sinceSeq = 0) { return recentGameEvents(sinceSeq); }
  submit(cmd) {
    ++this.commandSeq;
    const bad = validateCommand(cmd);
    const res = bad ? { ok: false, reason: bad } : { ok: true, outcome: true };
    if (!bad) this.client.sendMsg({ k: 'cmd', cmd });
    this.lastResult = res;
    return res;
  }
}
function netGuestJoin(url, code, name) {
  netLeave(true);
  const client = new NetClient(url);
  netState = { role: 'guest', client, name: name || '참가자', code: String(code || '').toUpperCase(), ready: false, units: new Map(), proj: new Map(), snaps: [], lastSnapAt: 0, hostT: 0, pending: [], status: '' };
  const st = netState;
  _netStatus('서버에 연결하는 중…');
  client.on('joined', (m) => { st.hostName = (m.host && m.host.name) || '방장'; _netStatus(`${st.hostName}의 방에 참가 - 게임 준비 중`); client.sendMsg({ k: 'hello', champ: controller ? controller.championId : 'garen', name: st.name }); });
  client.on('error', (m) => { _netStatus('오류: ' + m.msg); if (!st.ready) { client.close(); if (netState === st) netState = null; } });
  client.on('room-closed', () => _netGuestLost(st, '방장이 나가 대전이 끝났습니다'));
  client.on('close', () => _netGuestLost(st, '서버 연결이 끊겼습니다'));
  client.on('pong', () => { if (st.ready) _netStatus(`대전 중 - ${st.hostName} · 지연 ${client.rtt}ms`); });
  client.on('msg', (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.k === 'welcome') _netGuestStart(st, d);
    else if (d.k === 'snap') { if (st.ready) _netGuestOnSnapshot(st, d); }
  });
  return client.connect().then(() => { client.send({ t: 'join', code: st.code, name: st.name }); return st; })
    .catch((e) => { if (netState === st) netState = null; _netStatus(e.message); throw e; });
}
function _netGuestLost(st, msg) {
  if (netState !== st) return;
  _netToast(msg); _netStatus(msg + ' - 새로고침하면 연습 모드로 돌아갑니다');
  st.client.close();
  netState = null;
  // 게스트 화면은 방장 상태를 그린 것이라 혼자 이어서 할 수 없다 - 연습 모드로 돌아간다(새로고침).
  if (netGuestMode) __hostSetTimeout(() => { try { location.reload(); } catch (e) { /* 테스트 환경 */ } }, 2500);
}
async function _netGuestStart(st, w) {
  if (st.starting || st.ready) return;
  st.starting = true;
  netGuestMode = true; // 지금부터 이 브라우저는 시뮬레이션하지 않는다
  try {
    await _netResetGameAndWait();
    if (netState !== st) return;
    _netClearPracticeUnits();
    if (typeof reserveEntityIds === 'function') reserveEntityIds(NET_GUEST_ID_BASE);
    // 내 챔피언 = 방장 쪽 원격 챔피언(빨강 팀)
    controller.team = 'RED';
    controller.isNetPuppet = true;
    controller.root.position.copy(getTeamSpawnPosition('RED'));
    assignEntityId(controller, w.youId);
    if (typeof visionSystem !== 'undefined') visionSystem.setViewTeam('RED');
    if (typeof updateBars === 'function') updateBars(controller);
    // 구조물: 같은 팀·종류 중 가장 가까운 것에 방장 ID를 붙인다(양쪽이 같은 함수로 같은 자리에 세웠다).
    const used = new Set();
    for (const s of w.structs || []) {
      let best = null, bd = Infinity;
      for (const [k, u] of _netStructures()) {
        if (k !== s.k || used.has(u) || _netTeamCode(u.team) !== s.tm) continue;
        const p = getWorldPosition(u), d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < bd) { bd = d; best = u; }
      }
      if (best) { used.add(best); assignEntityId(best, s.id); }
    }
    // 방장 챔피언(파랑 팀) 인형
    const host = await spawnEnemyBot(w.hostChamp, { team: 'BLUE', remote: true, name: w.hostName || st.hostName });
    if (netState !== st) { removeEnemyBot(host); return; }
    assignEntityId(host, w.hostId);
    host.isNetPuppet = true;
    st.hostPuppet = host;
    if (typeof setTurretGameTimeSec === 'function' && Number.isFinite(w.gt)) setTurretGameTimeSec(w.gt);
    gameSession = new RemoteSession(st.client);
    if (typeof window !== 'undefined') window.gameSession = gameSession;
    st.ready = true;
    st.client.sendMsg({ k: 'ready' });
    _netStatus(`대전 중 - ${st.hostName}`);
    _netToast(`${st.hostName}와(과) 대전을 시작합니다 (빨강 팀)`);
  } catch (e) {
    console.error('[NET] 대전 준비 실패', e); _netStatus('대전 준비 실패: ' + (e.message || e));
  } finally { st.starting = false; }
}
function _netGuestOnSnapshot(st, s) {
  const recvAt = __gcRealNow();
  st.hostT = s.t; st.lastSnapAt = recvAt;
  st.lastSnap = s;
  if (Number.isFinite(s.gt) && typeof setTurretGameTimeSec === 'function') {
    const local = getTurretGameTimeSec();
    if (Math.abs(local - s.gt) > 1) setTurretGameTimeSec(s.gt); // 크게 어긋날 때만 맞춘다(평소엔 netGuestTick이 같이 흘린다)
  }
  const seen = new Set();
  for (const e of s.ents || []) {
    seen.add(e.i);
    if (e.k === 'c') _netGuestChampion(st, e, s.t);
    else if (e.k === 'm') _netGuestMinion(st, e, s.t);
    else _netGuestStructure(st, e);
  }
  // 스냅샷에서 빠진 미니언 = 죽었다(사망 동작 후 치운다).
  for (const [id, u] of st.units) if (u.kind === 'm' && !seen.has(id)) { st.units.delete(id); _netGuestMinionDie(u.obj); }
  _netGuestProjectiles(st, s.pr || []);
  if (s.me) _netGuestApplyPrivate(st, s.me);
}
function _netPushSample(rec, t, e) {
  rec.samples.push({ t, x: e.x, y: e.y, z: e.z, r: e.r });
  if (rec.samples.length > 6) rec.samples.shift();
}
function _netGuestChampion(st, e, t) {
  let c = null;
  if (controller && entityId(controller) === e.i) c = controller;
  else if (st.hostPuppet && entityId(st.hostPuppet) === e.i) c = st.hostPuppet;
  if (!c) return;
  let rec = st.units.get(e.i);
  if (!rec) { rec = { kind: 'c', obj: c, samples: [] }; st.units.set(e.i, rec); }
  _netPushSample(rec, t, e);
  c.hp = e.hp; c.maxHp = e.mh; c.shield = e.sh; c.mp = e.mp; c.maxMp = e.mm; c.champLevel = e.lv;
  if (c.state !== e.s) c.state = e.s;
  c._respawnAt = e.rs != null ? performance.now() + e.rs : null;
  if (!c.score) c.score = { kills: 0, deaths: 0, assists: 0, cs: 0 };
  [c.score.kills, c.score.deaths, c.score.assists, c.score.cs] = e.sc || [0, 0, 0, 0];
  if (c.model) c.model.visible = e.mv !== 0;
  // 동작: 방장 쪽에서 새 클립이 시작됐으면 같은 클립을 튼다.
  if (e.cl && (rec.cl !== e.cl || rec.cn !== e.cn)) {
    rec.cl = e.cl; rec.cn = e.cn;
    const clip = c.findAnimation(e.cl);
    if (clip) c.crossFadeToClip(clip, { loop: e.lp ? THREE.LoopRepeat : THREE.LoopOnce, clampWhenFinished: !e.lp, fade: 0.12, timeScale: e.ts || 1, time: e.lp ? 0 : Math.max(0, e.at || 0) });
  }
  updateBars(c);
}
function _netGuestMinion(st, e, t) {
  let rec = st.units.get(e.i);
  if (!rec) {
    const m = createMinion(e.ty, new THREE.Vector3(e.x, e.y, e.z), getTurretGameTimeSec(), _netTeamName(e.tm));
    assignEntityId(m, e.i);
    minions.push(m);
    rec = { kind: 'm', obj: m, samples: [], ai: e.ai };
    st.units.set(e.i, rec);
  }
  const m = rec.obj;
  _netPushSample(rec, t, e);
  m.hp = e.hp; m.maxHp = e.mh;
  if (m.usingRealModel && e.cl) {
    const label = `${m.team} ${m.type} minion`;
    if (rec.ai !== e.ai) { rec.ai = e.ai; m.currentClipName = null; } // 새 공격 - 같은 클립이어도 처음부터
    if (m.currentClipName !== e.cl) {
      const attack = (m.attackClipSequence || []).includes(e.cl);
      const a = playAssetClip(m, label, e.cl, { fade: attack ? 0.06 : 0.15, loopOnce: attack });
      if (a) a.timeScale = e.ts || 1;
    }
  }
}
function _netGuestMinionDie(m) {
  if (!m || m.isDead) return;
  m.isDead = true; m.destroyed = true;
  if (m.healthBar) m.healthBar.sprite.visible = false;
  minions = minions.filter((x) => x !== m);
  if (controller && controller.currentTarget === m) { controller.currentTarget = null; if (typeof targetRing !== 'undefined') targetRing.clear(); }
  let delay = 900;
  if (m.usingRealModel) {
    const a = playAssetClip(m, `${m.team} ${m.type} minion`, MINION_DEATH_CLIP[m.type], { fade: 0.08, loopOnce: true });
    if (a) delay = (a.getClip().duration / (a.timeScale || 1)) * 1000;
    if (m.mixer) dyingMinions.push(m);
  }
  __hostSetTimeout(() => { disposeMinionHealthBar(m); scene.remove(m.mesh); dyingMinions = dyingMinions.filter((x) => x !== m); }, delay);
}
function _netGuestStructure(st, e) {
  const s = findEntityById(e.i);
  if (!s || !s.isStructure && !s.isTurret && !s.isInhibitor && !s.isNexus) return;
  const hpChanged = Math.abs((s.hp || 0) - e.hp) > 0.05;
  if (e.d && !s.destroyed) {
    s.hp = 0;
    if (e.k === 't') destroyTurret(s); else if (e.k === 'h') destroyInhibitor(s); else destroyNexus(s);
    return;
  }
  if (!e.d && s.destroyed && e.k === 'h' && typeof respawnInhibitor === 'function') respawnInhibitor(s);
  if (!hpChanged || e.d) return;
  s.hp = e.hp; if (Number.isFinite(e.mh)) s.maxHp = e.mh;
  if (e.k === 't' && typeof updateTurretVisual === 'function') updateTurretVisual(s);
  else if (e.k === 'h' && typeof updateInhibitorVisual === 'function') updateInhibitorVisual(s);
  else if (typeof setStructBar === 'function') setStructBar(s.labelDiv, s.maxHp ? s.hp / s.maxHp : 0);
}
function _netGuestProjectiles(st, list) {
  const seen = new Set();
  for (const [id, x, y, z, qx, qy, qz, qw, color, scale] of list) {
    seen.add(id);
    let p = st.proj.get(id);
    if (!p) {
      const entry = projectiles._acquireArrowMesh(color);
      scene.add(entry.group);
      entry.group.position.set(x, y, z);
      p = { entry, samples: [] };
      st.proj.set(id, p);
    }
    p.entry.group.quaternion.set(qx, qy, qz, qw);
    p.entry.group.scale.setScalar(scale || 1);
    p.samples.push({ t: st.hostT, x, y, z });
    if (p.samples.length > 4) p.samples.shift();
  }
  for (const [id, p] of st.proj) if (!seen.has(id)) { projectiles._releaseArrowMesh(p.entry); st.proj.delete(id); }
}
function _netGuestApplyPrivate(st, me) {
  const c = controller; if (!c) return;
  const now = performance.now();
  c.gold = me.g;
  const slot = (x) => (x ? { id: x.itemId, count: x.count || 1, ...(x.charges != null ? { charges: x.charges } : {}) } : null);
  const itemsKey = JSON.stringify([me.it, me.bo, me.tr]);
  if (st._itemsKey !== itemsKey) {
    st._itemsKey = itemsKey;
    c.items = (me.it || []).map(slot); c.boots = slot(me.bo); c.trinket = slot(me.tr);
    if (typeof updateItemUI === 'function') updateItemUI(c);
  }
  if (st._gold !== Math.floor(me.g)) { st._gold = Math.floor(me.g); updateGoldDisplay(); }
  c.skillLevels = Object.assign({}, me.sl || {}); c.skillPoints = me.sp || 0; c.currentExp = me.ex || 0;
  c.cooldowns = Object.assign({}, me.cd || {});
  if (me.sm) for (const k of ['D', 'F']) {
    const s = me.sm[k]; if (!s) continue;
    if (!c.summoners) c.summoners = {};
    if (!c.summoners[k] || c.summoners[k].id !== s.spellId) c.summoners[k] = { id: s.spellId, readyAt: 0 };
    c.summoners[k].readyAt = s.readyInMs > 0 ? now + s.readyInMs : 0; // 0이면 '준비됨' 그대로(메시지는 프레임 사이에 와서 그 시각이 다음 프레임 시계보다 늦을 수 있다)
  }
  if (me.res) {
    if (me.res.rage != null && c._renekton) c._renekton.rage = me.res.rage;
    if (me.res.flow != null && c._yasuo) c._yasuo.flow = me.res.flow;
    if (me.res.grit != null && c._sett) c._sett.grit = me.res.grit;
  }
  c.statusEffects = (me.ef || []).map((x) => ({ id: x.id, type: x.type, expiresAt: x.ms != null ? now + x.ms : null, value: x.v }));
  if (me.st) { for (const [k, v] of Object.entries(me.st)) if (c.stats && k in c.stats) c.stats[k] = v; c.hpRegen = me.hr; c.mpRegen = me.mr; }
  updateBars(c);
  if (typeof updateSkillUI === 'function') updateSkillUI(c.cooldowns);
  if (typeof updateExpUI === 'function') updateExpUI(c);
  if (me.st && typeof updateHudStats === 'function') updateHudStats(c);
}
// 보간: 방장 시각 기준 약 0.11초 전 자리를 그린다.
function _netSampleAt(samples, t) {
  if (!samples.length) return null;
  if (t <= samples[0].t) return samples[0];
  for (let i = samples.length - 1; i > 0; i--) {
    const a = samples[i - 1], b = samples[i];
    if (t >= a.t && t <= b.t) {
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      let dr = (b.r || 0) - (a.r || 0); while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, r: (a.r || 0) + dr * k };
    }
  }
  return samples[samples.length - 1];
}
// 메인 루프(게스트 모드)가 simulateStep 대신 프레임마다 부른다: 시계·보간·동작 재생.
function netGuestTick(dt) {
  if (typeof advanceTurretGameClock === 'function') advanceTurretGameClock(dt);
  if (typeof gameSession !== 'undefined' && gameSession) gameSession.advance(dt);
  const st = netState;
  if (!st || st.role !== 'guest' || !st.ready) { if (controller && controller.mixer) safeMixerUpdate(controller.mixer, dt, 'netGuest'); return; }
  const renderT = st.hostT + (__gcRealNow() - st.lastSnapAt) - NET_INTERP_DELAY_MS;
  for (const rec of st.units.values()) {
    const s = _netSampleAt(rec.samples, renderT);
    if (!s) continue;
    if (rec.kind === 'c') {
      const c = rec.obj; if (!c.root) continue;
      c.root.position.set(s.x, s.y, s.z);
      c.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.r || 0);
    } else {
      const m = rec.obj; if (!m.mesh) continue;
      m.mesh.position.set(s.x, s.y, s.z);
      if (m.body && m.body !== m.mesh) m.body.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.r || 0);
    }
  }
  for (const p of st.proj.values()) { const s = _netSampleAt(p.samples, renderT); if (s) p.entry.group.position.set(s.x, s.y, s.z); }
  for (const c of [controller, st.hostPuppet]) if (c && c.mixer) safeMixerUpdate(c.mixer, dt, 'netChampion');
  for (const m of minions) {
    if (m.mixer) safeMixerUpdate(m.mixer, dt, 'netMinion');
    if (typeof updateMinionHealthBarVisibility === 'function') updateMinionHealthBarVisibility(m);
  }
  for (const t of turrets) if (t.destroyed && typeof updateTurretCombat === 'function') updateTurretCombat(t, dt); // 부서진 포탑은 무너지는 연출만(전투 없음)
  else if (typeof placeStructLabel === 'function') placeStructLabel(t);
}

function netLeave(silent) {
  const st = netState;
  if (!st) return;
  netState = null;
  if (st.role === 'host') {
    if (st.remote) { removeEnemyBot(st.remote); st.remote = null; }
    st.client.close();
    if (!silent) _netStatus('방을 닫았습니다');
  } else {
    st.client.close();
    if (netGuestMode) { try { location.reload(); } catch (e) { /* 테스트 환경 */ } }
    else if (!silent) _netStatus('나갔습니다');
  }
}
if (typeof window !== 'undefined') {
  window.netHostCreateRoom = netHostCreateRoom; window.netGuestJoin = netGuestJoin; window.netLeave = netLeave;
  Object.defineProperty(window, 'netState', { get: () => netState, configurable: true });
  Object.defineProperty(window, 'netGuestMode', { get: () => netGuestMode, configurable: true });
}

// 연습 도구 패널: 서버 주소·이름·방 만들기·참가·나가기
(function setupNetPanel() {
  if (typeof document === 'undefined') return;
  const urlEl = document.getElementById('netServerUrl'), nameEl = document.getElementById('netName'), codeEl = document.getElementById('netJoinCode');
  const createBtn = document.getElementById('netCreateBtn'), joinBtn = document.getElementById('netJoinBtn'), leaveBtn = document.getElementById('netLeaveBtn');
  if (!urlEl || !createBtn) return;
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* 저장소 막힘 */ } return null; };
  urlEl.value = ls('netServerUrl') || netDefaultServerUrl();
  if (nameEl) nameEl.value = ls('netName') || '';
  const read = () => {
    const url = urlEl.value.trim(); ls('netServerUrl', url); if (nameEl) ls('netName', nameEl.value.trim());
    if (!/^wss?:\/\//.test(url)) { _netStatus('서버 주소를 ws:// 또는 wss://로 입력하세요 (node server/relay.js)'); return null; }
    return { url, name: nameEl ? nameEl.value.trim() : '' };
  };
  createBtn.addEventListener('click', () => { const r = read(); if (r) netHostCreateRoom(r.url, r.name || '방장').catch(() => {}); });
  if (joinBtn) joinBtn.addEventListener('click', () => {
    const r = read(); if (!r) return;
    const code = codeEl ? codeEl.value.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{4}$/.test(code)) { _netStatus('방 코드 4자리를 입력하세요'); return; }
    netGuestJoin(r.url, code, r.name || '참가자').catch(() => {});
  });
  if (leaveBtn) leaveBtn.addEventListener('click', () => netLeave(false));
})();
