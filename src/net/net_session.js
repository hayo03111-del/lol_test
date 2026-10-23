/* net_session.js — 97차: 웹소켓 온라인 1:1 대전(방장 권위 방식) / 98차: 지연 제거·연출 복제·대전 흐름
 *
 * 구조
 *  - 중계 서버(server/relay.js)는 방 코드로 두 브라우저를 이어 주고 메시지를 그대로 넘긴다(게임 규칙은 모른다).
 *  - 방장(호스트, 파랑 팀) 브라우저가 한 판 전체를 시뮬레이션한다: 지금까지의 게임 코드 그대로(미니언·포탑·스킬·보상).
 *    참가자(게스트, 빨강 팀)의 챔피언은 방장 쪽에 "원격 챔피언"(enemy_bot.js의 remote 봇 - 두뇌 없음)으로 만들어지고,
 *    게스트가 보낸 명령(93차 명령 형식 - game_commands.js)을 그 챔피언 입장(withCombatActor)에서 LocalSession._apply로 실행한다.
 *    규칙 판정(쿨다운·마나·사거리·골드·상점 위치)은 방장의 기존 함수가 한다 - 게스트가 보낸 값을 믿지 않는다.
 *  - 게스트 브라우저는 시뮬레이션을 끄고(netGuestMode - 메인 루프가 simulateStep 대신 netGuestTick을 부른다),
 *    방장이 초당 30번 보내는 스냅샷으로 화면을 그린다.
 *
 * 98차: 지연 제거
 *  - 내 챔피언 예측: 이동·추격·공격 이동은 명령을 보내는 순간 게스트 화면에서 바로 움직인다(같은 이동 속도·같은 맵 경계·구조물 충돌).
 *    방장이 명령을 받았다고 알리면(ack = 마지막으로 처리한 명령 번호) 그때부터는 방장 쪽의 이동 목표(tp)·추격 대상(tg)을 따라
 *    지금 시각 기준으로 계속 움직이고, 방장 위치와 차이(왕복 지연만큼 과거의 내 예측 위치와 비교)를 조금씩 메운다.
 *    크게 어긋나면(점멸·돌진 끝·부활) 바로 맞춘다. 행동 불가·돌진·넉백·시전 고정 중에는 방장 위치를 빠르게 따라간다.
 *  - 내 챔피언 동작: 걷기·대기는 예측한 이동에 맞춰 바로 바꾸고, 평타·스킬·죽음 동작은 방장 클립을 튼다.
 *  - 다른 유닛 보간 지연: 스냅샷 간격과 도착 시각 흔들림으로 정한다(보통 50~70ms, 예전 110ms 고정).
 *  - 스냅샷 델타: 바뀐 값만 보낸다(1초마다 전체). 게임 핑: 방장까지 왕복 지연을 직접 잰다(중계 서버 핑은 방장을 거치지 않는다).
 * 98차: 연출 복제 - 방장 쪽 연출 호출(vfx.spawn·지면 충격파·판정 모양·스킬 예고·닐라 연출)을 그대로 기록해 보내고 게스트가 같은 함수로
 *    다시 부른다(위치·유닛·색만 옮긴다). 게스트 팀 시야 밖 연출은 그리지 않는다. 와드도 동기화한다.
 * 98차: 대전 흐름 - 로비에서 고른 소환사 주문·룬 전달, 3초 카운트다운, 대전 중 연습 도구·일시정지 잠금, 처치 알림,
 *    승리/패배 화면·재대결, 끊긴 참가자 재접속(60초 안, 같은 토큰), 방장 탭이 백그라운드여도 시뮬레이션 계속(워커 타이머).
 *
 * 메시지(중계 서버의 {t:'msg', d} 안쪽 d)
 *   게스트 → 방장  {k:'hello', v, champ, name, spells, rune, token}  {k:'ready'}  {k:'cmd', cmd, s}  {k:'gping', at}  {k:'gstat', rtt, delay, q(대기열 지연), rb(받은 바이트/초)}  {k:'rematch'}
 *   방장 → 게스트  {k:'welcome', resume, hostChamp, hostName, hostId, youId, structs, gt}  {k:'countdown', sec}
 *                  {k:'snap', t, gt, full, ents, gone, pr, me, fx, ev, ge}  {k:'gpong', at}  {k:'end', winner, stats}  {k:'rematch'}  {k:'bye', msg}
 * 아직 없는 것(README 98차 "한계"): 챔피언 코드가 직접 만드는 일부 연출(아리·요네·럭스 등의 자체 메시)은 방장 화면에만 나온다.
 *    방장은 지연이 0이라 유리하다(방장 권위 방식의 한계 - 스킬 판정 되감기 없음).
 */
const NET_PROTOCOL_VERSION = 3;
const NET_PICK_SEC = 90;               // 99차: 챔피언 선택 제한 시간(초) - 끝나면 지금 고른 것으로 확정
const NET_SNAPSHOT_HZ = 30;
const NET_KEYFRAME_EVERY = 30;          // 스냅샷 30번(1초)마다 전체
const NET_GUEST_ID_BASE = 1000000;      // 게스트가 직접 발급하는 ID는 여기부터(방장 ID와 겹치지 않게)
const NET_RECONNECT_GRACE_MS = 60000;   // 참가자가 끊겨도 이만큼 기다린다(재접속)
const NET_COUNTDOWN_SEC = 3;
var netGuestMode = false; // var: 메인 루프(champion_glb_loader.js)가 typeof로 본다
var netState = null;      // { role:'host'|'guest', client, ... }

// ---------------- 중계 서버 연결 ----------------
class NetClient {
  constructor(url) { this.url = url; this.kind = 'relay'; this.ws = null; this.handlers = new Map(); this.rtt = null; this._pingTimer = null; }
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
        this.bytesIn = (this.bytesIn || 0) + (e.data && e.data.length || 0); // 102차: 받은 양(참가자가 받는 속도를 방장에게 알린다)
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'pong') { this.rtt = Math.round(__gcRealNow() - m.at); this._emit('pong', m); return; }
        if (m.t === 'msg') this._emit('msg', m.d || {});
        else this._emit(m.t, m);
      };
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) { const text = JSON.stringify(obj); this.ws.send(text); this.bytesOut = (this.bytesOut || 0) + text.length; } }
  sendMsg(d) { this.send({ t: 'msg', d }); }
  backlog() { return (this.ws && this.ws.bufferedAmount) || 0; } // 102차: 아직 못 보낸 바이트(보내는 쪽 대기열)
  close() { if (this._pingTimer) __hostClearInterval(this._pingTimer); this._pingTimer = null; this.handlers.clear(); if (this.ws) try { this.ws.close(); } catch (e) { /* 이미 닫힘 */ } }
}

// ---------------- 99차: 브라우저끼리 직접 연결(P2P, WebRTC) ----------------
// 서버를 켤 필요 없이 웹페이지에서 바로 대전한다. PeerJS(vendor/peerjs, MIT)의 공개 연결 중개 서버(0.peerjs.com)로 처음 연결만 맺고,
// 그 뒤 게임 메시지는 두 브라우저가 WebRTC 데이터 채널로 직접 주고받는다(공유기 사정으로 직접 연결이 안 되면 PeerJS의 TURN 중계).
// 위 NetClient(중계 서버 relay.js)와 같은 모양(on/connect/send/sendMsg/close, 'created'·'joined'·'peer-join'·'peer-leave'·'room-closed'·'msg'·'error'·'close')을
// 흉내 내서, 나머지 대전 코드는 어느 쪽인지 모른다. 방 코드 ABCD = PeerJS 아이디 'lolsim-pvp-ABCD'(방장).
const NET_P2P_PREFIX = 'lolsim-pvp-';
const NET_PEERJS_SRC = 'vendor/peerjs/peerjs.min.js';
const NET_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let _netPeerJsPromise = null;
function _netLoadPeerJs() {
  if (typeof window !== 'undefined' && window.Peer) return Promise.resolve(window.Peer);
  if (!_netPeerJsPromise) {
    _netPeerJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = NET_PEERJS_SRC;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('P2P 라이브러리를 불러오지 못했습니다')));
      s.onerror = () => { _netPeerJsPromise = null; reject(new Error('P2P 라이브러리를 불러오지 못했습니다')); };
      document.head.appendChild(s);
    });
  }
  return _netPeerJsPromise;
}
function _netRandomCode() { let c = ''; for (let i = 0; i < 4; i++) c += NET_ROOM_ALPHABET[Math.floor(Math.random() * NET_ROOM_ALPHABET.length)]; return c; }
class PeerNetClient {
  constructor() { this.url = 'p2p'; this.kind = 'p2p'; this.handlers = new Map(); this.peer = null; this.conn = null; this.rtt = null; this.bytesOut = 0; this.closed = false; this._roomClosed = false; this._joined = false; this._pongTimer = null; }
  on(type, fn) { this.handlers.set(type, fn); return this; }
  _emit(type, m) {
    const fn = this.handlers.get(type);
    if (!fn) return;
    const run = () => { if (!this.closed || type === 'close') { try { fn(m); } catch (e) { console.error('[NET p2p]', type, e); } } };
    run();
  }
  _peerOptions() { return Object.assign({ debug: 0 }, (typeof window !== 'undefined' && window.__netPeerOptions) || {}); }
  _newPeer(id) {
    const Peer = window.Peer;
    const peer = id ? new Peer(id, this._peerOptions()) : new Peer(this._peerOptions());
    // 중개 서버와의 연결만 끊긴 경우(데이터 채널은 그대로) - 다시 붙는다(방장은 같은 아이디로 새 참가를 받을 수 있게).
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* 다음 기회 */ } } });
    return peer;
  }
  // 라이브러리를 불러온다. 참가자는 여기서 자기 피어를 열어 둔다(방장은 방 코드를 정한 뒤 'create'에서 연다).
  connect(role) {
    return _netLoadPeerJs().then(() => {
      // 2초마다: 살아 있다는 신호(ka)를 보내고, 상대에게서 8초 넘게 아무것도 안 오면 끊긴 것으로 본다
      // (탭을 닫거나 네트워크가 끊겨도 WebRTC는 한참 뒤에야 닫힘을 알린다).
      this._pongTimer = __hostSetInterval(() => {
        this._emit('pong', {});
        const c = this.conn;
        if (!c || !c.open) return;
        this._sendConn({ t: 'ka' });
        if (this._lastRecv && __gcRealNow() - this._lastRecv > 8000) { this._lastRecv = 0; try { c.close(); } catch (e) { /* 무시 */ } this._connGone(c); }
      }, 2000);
      if (typeof window !== 'undefined') {
        this._onPageHide = () => { const c = this.conn; if (c && c.open) { try { c.send(JSON.stringify({ t: this.role === 'host' ? 'room-closed' : 'bye' })); } catch (e) { /* 무시 */ } } };
        window.addEventListener('pagehide', this._onPageHide);
      }
      return this;
    });
  }
  // 데이터 채널이 닫혔다(닫힘 알림·keepalive 시간 초과·상대의 bye) - 한 번만 처리한다.
  _connGone(conn) {
    if (conn._gone) return; conn._gone = true;
    if (this.conn !== conn) return;
    this.conn = null;
    if (this.role === 'host') { if (conn._joined) this._emit('peer-leave', {}); }
    else if (this._roomClosed) this._emit('room-closed', {}); else this._emit('close', {});
  }
  send(obj) {
    if (this.closed || !obj) return;
    switch (obj.t) {
      case 'create': this._create(obj.name || '방장', 0); break;
      case 'join': this._join(String(obj.code || '').toUpperCase().trim(), obj.name || '참가자'); break;
      case 'msg': this._sendConn({ t: 'msg', d: obj.d }); break;
      case 'kick': if (this.conn) { const c = this.conn; this.conn = null; try { c.send({ t: 'error', msg: '방장이 참가를 거절했습니다' }); } catch (e) { /* 이미 닫힘 */ } __hostSetTimeout(() => { try { c.close(); } catch (e) { /* 이미 닫힘 */ } }, 300); } break;
      case 'leave': if (this.conn) { try { this.conn.close(); } catch (e) { /* 이미 닫힘 */ } this.conn = null; } break;
      case 'ping': break; // 왕복 지연은 게임 핑(gping)으로 잰다
    }
  }
  sendMsg(d) { this.send({ t: 'msg', d }); }
  // 102차: 데이터 채널에 쌓인 바이트 + PeerJS가 채널이 꽉 차 따로 쥐고 있는 메시지(개수 - 하나에 1KB로 친다)
  backlog() { const c = this.conn; if (!c) return 0; let n = 0; try { n += (c.dataChannel && c.dataChannel.bufferedAmount) || 0; n += (c.bufferSize || 0) * 1024; } catch (e) { /* 무시 */ } return n; }
  _sendConn(o) {
    const c = this.conn; if (!c || !c.open) return;
    const text = JSON.stringify(o); this.bytesOut += text.length;
    try { c.send(text); } catch (e) { console.warn('[NET p2p] 보내기 실패', e); }
  }
  // 받은 메시지(시험용 인공 지연 window.__netTestLagMs - 받은 순서 그대로 늦춘다)
  _onData(conn, raw) {
    let m = raw;
    if (typeof raw === 'string') { this.bytesIn = (this.bytesIn || 0) + raw.length; try { m = JSON.parse(raw); } catch (e) { return; } }
    const lag = (typeof window !== 'undefined' && window.__netTestLagMs) || 0;
    const go = () => this._handle(conn, m);
    if (lag > 0) __hostSetTimeout(go, lag); else go();
  }
  // ---- 방장 ----
  _create(name, tries, fixedCode) {
    this.role = 'host'; this.name = name;
    const code = fixedCode && !tries ? fixedCode : _netRandomCode();
    const peer = this._newPeer(NET_P2P_PREFIX + code);
    this.peer = peer;
    peer.on('open', () => { this.code = code; this._emit('created', { code }); });
    peer.on('error', (err) => {
      if (err && err.type === 'unavailable-id' && tries < 6 && !this.code) { try { peer.destroy(); } catch (e) { /* 무시 */ } this._create(name, tries + 1); return; }
      if (err && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed')) { if (!this.code) this._emit('error', { msg: '연결 중개 서버에 닿지 못했습니다 - 인터넷 연결을 확인하세요' }); return; }
      if (err && err.type === 'browser-incompatible') { this._emit('error', { msg: '이 브라우저는 P2P(WebRTC)를 지원하지 않습니다' }); return; }
      console.warn('[NET p2p] 방장 오류', err && err.type, err);
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (this.conn && this.conn !== conn && this.conn.open) { try { conn.send(JSON.stringify({ t: 'error', msg: '방이 가득 참' })); } catch (e) { /* 무시 */ } __hostSetTimeout(() => conn.close(), 300); return; }
        this.conn = conn;
      });
      conn.on('data', (d) => this._onData(conn, d));
      conn.on('close', () => this._connGone(conn));
      conn.on('error', () => { /* close가 뒤따른다 */ });
    });
  }
  // ---- 참가자 ----
  _join(code, name) {
    this.role = 'guest'; this.name = name; this.code = code;
    const peer = this._newPeer(null);
    this.peer = peer;
    let opened = false;
    peer.on('open', () => {
      const conn = peer.connect(NET_P2P_PREFIX + code, { reliable: true, serialization: 'raw' });
      this.conn = conn;
      conn.on('open', () => { opened = true; if (this.deferJoin) this._emit('conn-open', {}); else this._sendConn({ t: 'join', code, name }); }); // 102차: deferJoin이면 길 재기(probe) 뒤에 sendJoin()
      conn.on('data', (d) => this._onData(conn, d));
      conn.on('close', () => this._connGone(conn));
      conn.on('error', () => { /* close가 뒤따른다 */ });
      __hostSetTimeout(() => { if (!opened && !this.closed && this.conn === conn) { this._emit('error', { msg: '방장과 직접 연결하지 못했습니다(방화벽·공유기). 잠시 뒤 다시 시도하세요' }); this._emit('close', {}); } }, 20000);
    });
    peer.on('error', (err) => {
      const t = err && err.type;
      if (t === 'peer-unavailable') { this._emit('error', { msg: '방이 없음 - 코드를 확인하세요' }); this._emit('close', {}); return; }
      if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') { if (!opened) { this._emit('error', { msg: '연결 중개 서버에 닿지 못했습니다 - 인터넷 연결을 확인하세요' }); this._emit('close', {}); } return; }
      if (t === 'browser-incompatible') { this._emit('error', { msg: '이 브라우저는 P2P(WebRTC)를 지원하지 않습니다' }); return; }
      console.warn('[NET p2p] 참가자 오류', t, err);
    });
  }
  // 102차: 길 재기 - 참가 전에 왕복 시간을 잰다(방장은 붙잡지 않고 바로 답만 한다)
  probe() { this._sendConn({ t: 'probe', at: __gcRealNow() }); }
  sendJoin() { this._sendConn({ t: 'join', code: this.code, name: this.name }); }
  _handle(conn, m) {
    if (!m || typeof m !== 'object' || this.closed) return;
    if (conn === this.conn || this.role === 'host') this._lastRecv = __gcRealNow();
    if (m.t === 'ka') return;
    if (m.t === 'probe') { try { conn.send(JSON.stringify({ t: 'probe-ok', at: m.at })); } catch (e) { /* 무시 */ } return; }
    if (m.t === 'probe-ok') { this._emit('probe-ok', { rtt: __gcRealNow() - m.at }); return; }
    if (m.t === 'bye') { try { conn.close(); } catch (e) { /* 무시 */ } this._connGone(conn); return; }
    if (this.role === 'host') {
      if (m.t === 'join') { conn._joined = true; this.conn = conn; this._sendConn({ t: 'joined', code: this.code, host: { name: this.name } }); this._emit('peer-join', { name: String(m.name || '참가자').slice(0, 24) }); return; }
      if (m.t === 'msg' && conn === this.conn) this._emit('msg', m.d || {});
      return;
    }
    if (m.t === 'joined') { this._joined = true; this._emit('joined', m); return; }
    if (m.t === 'room-closed') { this._roomClosed = true; try { conn.close(); } catch (e) { /* 무시 */ } this._connGone(conn); return; }
    if (m.t === 'error') { this._emit('error', m); return; }
    if (m.t === 'msg') this._emit('msg', m.d || {});
  }
  close() {
    if (this.closed) return;
    if (this.role === 'host' && this.conn && this.conn.open) { try { this.conn.send(JSON.stringify({ t: 'room-closed' })); } catch (e) { /* 무시 */ } }
    if (this.role === 'guest' && this.conn && this.conn.open) { try { this.conn.send(JSON.stringify({ t: 'bye' })); } catch (e) { /* 무시 */ } }
    this.closed = true;
    if (this._pongTimer) __hostClearInterval(this._pongTimer);
    if (this._onPageHide && typeof window !== 'undefined') window.removeEventListener('pagehide', this._onPageHide);
    this.handlers.clear();
    const peer = this.peer, conn = this.conn;
    this.conn = null;
    __hostSetTimeout(() => { try { if (conn) conn.close(); } catch (e) { /* 무시 */ } try { if (peer) peer.destroy(); } catch (e) { /* 무시 */ } }, 250);
  }
}
// 서버 주소가 비어 있으면(기본) 자동 연결(직접 연결 → 막히면 우회 중계 - net_transport.js), 'p2p'면 직접 연결만, ws://·wss://면 중계 서버(relay.js).
function _netMakeClient(url) { return !url ? new AutoNetClient() : url === 'p2p' ? new PeerNetClient() : new NetClient(url); }

// 기본 서버 주소: 이 페이지를 relay.js가 내보냈으면 같은 주소의 /ws. GitHub Pages 같은 정적 호스팅이면 직접 입력해야 한다.
function netDefaultServerUrl() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return '';
  if (/github\.io$/.test(location.hostname)) return '';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
function _netToast(msg) { if (typeof showSkillToast === 'function') showSkillToast(msg); console.log('[NET] ' + msg); }
function _netBanner(msg) { if (typeof showRewardBanner === 'function') showRewardBanner(msg); else _netToast(msg); }
function _netStatus(msg) { if (typeof document !== 'undefined') { const el = document.getElementById('netStatus'); if (el) el.textContent = msg; } if (netState) netState.status = msg; if (typeof netLobbyRefresh === 'function') netLobbyRefresh(); }
const _netRound = (v, m = 1000) => (Number.isFinite(v) ? Math.round(v * m) / m : 0);
const _netTeamCode = (t) => (t === 'RED' ? 'R' : 'B');
const _netTeamName = (c) => (c === 'R' ? 'RED' : 'BLUE');
const _netChampName = (id) => { const row = typeof CHAMPION_MODEL_LIBRARY !== 'undefined' ? CHAMPION_MODEL_LIBRARY.find(([k]) => k === id) : null; return row ? row[1] : (id || '?'); };
// 대전 중인가(연습 도구·일시정지 잠금이 본다).
function netMatchActive() {
  const st = netState;
  if (!st) return false;
  return st.role === 'host' ? !!(st.remote || st.starting) : !!(st.ready || st.starting);
}

// 게임을 처음 상태로 돌리고 챔피언을 다시 불러올 때까지 기다린다(resetGame은 챔피언을 비동기로 다시 만든다).
function _netResetGameAndWait() {
  return new Promise((resolve) => {
    const old = typeof controller !== 'undefined' ? controller : null;
    if (typeof clearEnemyBots === 'function') clearEnemyBots();
    if (paused) togglePause(true);
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
// 대전에는 연습용 허수아비·아군 더미·연습 와드가 없다. 시야(전장의 안개)는 켠다.
function _netClearPracticeUnits() {
  if (typeof dummy !== 'undefined' && dummy) { removeDummyVisual(dummy); dummy = null; }
  if (typeof clearPlacedDummies === 'function') clearPlacedDummies();
  if (typeof clearPlacedAllies === 'function') clearPlacedAllies();
  if (typeof wardSystem !== 'undefined' && wardSystem && wardSystem.clear) wardSystem.clear();
  if (typeof setDummyPlaceMode === 'function' && typeof dummyPlaceMode !== 'undefined' && dummyPlaceMode) setDummyPlaceMode(false);
  if (typeof setAllyPlaceMode === 'function' && typeof allyPlaceMode !== 'undefined' && allyPlaceMode) setAllyPlaceMode(false);
  if (typeof setBrushPlaceMode === 'function' && typeof brushPlaceMode !== 'undefined' && brushPlaceMode) setBrushPlaceMode(false);
  if (typeof visionSystem !== 'undefined' && visionSystem && !visionSystem.enabled) { visionSystem.setEnabled(true); const cb = document.getElementById('visionSystemCheckbox'); if (cb) cb.checked = true; }
  const ev = document.getElementById('enemyVisionViewCheckbox'); if (ev) ev.checked = false;
}
function _netStructures() {
  const out = [];
  for (const t of (typeof turrets !== 'undefined' ? turrets : [])) out.push(['t', t]);
  for (const i of (typeof inhibitorBuildings !== 'undefined' ? inhibitorBuildings : [])) out.push(['h', i]);
  for (const n of (typeof nexusBuildings !== 'undefined' ? nexusBuildings : [])) out.push(['n', n]);
  return out;
}
function _netYawOf(obj) {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
  return Math.atan2(f.x, f.z);
}
const _NET_Y_AXIS = new THREE.Vector3(0, 1, 0);

// ---------------- 대전 중 연습 도구 잠금 ----------------
// 골드·웨이브·허수아비·챔피언 AI·챔피언 바꾸기·시야 끄기 같은 연습 기능은 대전 중에 쓸 수 없다.
const NET_LOCKED_CONTROLS = ['addGoldBtn', 'spawnWaveBtn', 'spawnEnemyBotBtn', 'clearEnemyBotsBtn', 'dummyPlaceCheckbox', 'clearDummiesBtn',
  'allyPlaceCheckbox', 'brushPlaceCheckbox', 'enemyWardPlaceCheckbox', 'clearWardsBtn', 'openLobbyBtn', 'clearBrushesBtn', 'clearAlliesBtn',
  'damageAlliesBtn', 'libraryChampSelect', 'swapGlbBtn', 'visionSystemCheckbox', 'enemyVisionViewCheckbox', 'netCreateBtn', 'netJoinBtn'];
const NET_LOCK_TITLE = '온라인 대전 중에는 쓸 수 없습니다';
function netApplyControlLock() {
  if (typeof document === 'undefined') return;
  const lock = netMatchActive();
  for (const id of NET_LOCKED_CONTROLS) {
    const el = document.getElementById(id); if (!el) continue;
    el.disabled = lock;
    if (lock) { if (el.title !== NET_LOCK_TITLE) { el.dataset.netTitle = el.title || ''; el.title = NET_LOCK_TITLE; } }
    else if (el.title === NET_LOCK_TITLE) el.title = el.dataset.netTitle || '';
  }
}

// ---------------- 연출 복제(방장 → 참가자) ----------------
function _netIsUnit(v) {
  return !!v && ((typeof CharacterController !== 'undefined' && v instanceof CharacterController) || v.isMinion || v.isTurret || v.isInhibitor || v.isNexus || v.isWard || v.isTrainingDummy);
}
function _netUnitByObject(o) {
  const champs = [typeof controller !== 'undefined' ? controller : null, ...(typeof enemyBots !== 'undefined' ? enemyBots : [])];
  for (const c of champs) if (c && (c.root === o || c.model === o)) return c;
  for (const m of (typeof minions !== 'undefined' ? minions : [])) if (m && (m.mesh === o || m.body === o)) return m;
  return null;
}
function _netSer(v, depth = 0) {
  if (v == null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? _netRound(v, 10000) : null;
  if (typeof v === 'function' || depth > 4) return undefined;
  if (v.isVector3) return { __v: [_netRound(v.x), _netRound(v.y), _netRound(v.z)] };
  if (v.isColor) return v.getHex();
  if (v.isObject3D) { const u = _netUnitByObject(v); return u ? { __o: entityId(u) } : undefined; }
  if (v._meshEntry && v.mesh && netState && netState.role === 'host') return { __p: _netProjId(netState, v) }; // 100차: 투사체 기록(연출이 따라간다) → 참가자 쪽 같은 투사체
  if (Array.isArray(v)) return v.map((x) => { const s = _netSer(x, depth + 1); return s === undefined ? null : s; });
  if (_netIsUnit(v)) return { __e: entityId(v) };
  if (!_netIsPlain(v)) return undefined; // 그 밖의 클래스 인스턴스(재질·텍스처 등)는 보내지 않는다
  const o = {};
  for (const [k, x] of Object.entries(v)) { const s = _netSer(x, depth + 1); if (s !== undefined) o[k] = s; }
  return o;
}
function _netDeser(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(_netDeser);
  if (v.__v) return new THREE.Vector3(v.__v[0], v.__v[1], v.__v[2]);
  if (v.__e != null) return findEntityById(v.__e);
  if (v.__o != null) { const u = findEntityById(v.__o); return u ? (u.root || u.mesh || null) : null; }
  if (v.__p != null) return _netGuestProjProxy(netState, v.__p);
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = _netDeser(x);
  return o;
}
// 복제하는 연출 함수(객체 이름, 메서드 이름). 반환값(나중에 지울 손잡이)은 참가자 쪽에서는 쓰지 않는다 - 수명대로 사라진다.
const NET_FX_METHODS = [['vfx', 'spawn'], ['vfx', 'groundShockwave'], ['vfx', 'groundShapeFlash'], ['skillTelegraphs', 'spawn'], ['skillTelegraphs', 'clearOwner'],
  ['nilahVfx2', 'playQ'], ['nilahVfx2', 'playW'], ['nilahVfx2', 'playE'], ['nilahVfx2', 'playR'], ['nilahVfx2', 'playWLoL'], ['nilahVfx2', 'playELoL'], ['nilahVfx2', 'playRLoL']];
function _netFxTargets() { return { vfx: typeof vfx !== 'undefined' ? vfx : null, skillTelegraphs: typeof skillTelegraphs !== 'undefined' ? skillTelegraphs : null, nilahVfx2: typeof nilahVfx2 !== 'undefined' ? nilahVfx2 : null }; }
function _netFxInstall(st) {
  if (st.fxRestore) return;
  const objs = _netFxTargets();
  st.fxRestore = [];
  for (const [name, fn] of NET_FX_METHODS) {
    const obj = objs[name];
    if (!obj || typeof obj[fn] !== 'function') continue;
    const orig = obj[fn];
    const own = Object.prototype.hasOwnProperty.call(obj, fn);
    let inside = false; // 연출 함수가 안에서 다른 연출 함수를 부르면 바깥 것만 기록한다
    obj[fn] = function (...args) {
      if (inside) return orig.apply(this, args);
      inside = true;
      let ret;
      try { ret = orig.apply(this, args); } finally { inside = false; }
      if (netState === st && st.guestReady) {
        try { if (st.fx.length < 200) st.fx.push([name, fn, args.map((x) => _netSer(x)), st.remote && __combatActor === st.remote ? 1 : 0]); } catch (e) { /* 기록 실패는 무시(연출만 빠짐) */ } // 103차: 넷째 값 = 참가자 챔피언이 낸 연출
      }
      return ret;
    };
    st.fxRestore.push(() => { if (own) obj[fn] = orig; else delete obj[fn]; });
  }
}
function _netFxUninstall(st) { if (st && st.fxRestore) { for (const r of st.fxRestore) r(); st.fxRestore = null; } }
// 참가자: 내 팀 시야 안의 점인가(연출 거르기). 시야 시스템을 끈 경우는 전부 보인다.
function _netPointVisibleToMe(p) {
  if (!p || typeof visionSystem === 'undefined' || !visionSystem || !visionSystem.enabled) return true;
  const team = (controller && controller.team) || 'BLUE';
  const src = visionSystem._teamSources && visionSystem._teamSources[team];
  if (!src) return true;
  for (const s of src) if (Math.hypot(s.position.x - p.x, s.position.z - p.z) <= lolRangeToWorld(s.lolRadius)) return true;
  return false;
}
function _netFxPlay(list) {
  const objs = _netFxTargets();
  let played = 0;
  for (const [name, fn, a] of list || []) {
    const obj = objs[name];
    if (!obj || typeof obj[fn] !== 'function') continue;
    const args = _netDeser(a);
    if (name === 'vfx') {
      const p = args.find((x) => x && x.isVector3);
      if (p && !_netPointVisibleToMe(p)) continue;
    }
    try { obj[fn](...args); played++; } catch (e) { /* 연출 실패는 게임에 영향 없음 */ }
  }
  return played;
}

// ================= 방장(호스트) =================
function netHostCreateRoom(url, name) {
  netLeave(true);
  const client = _netMakeClient(url);
  netState = { role: 'host', client, name: name || '방장', remote: null, guestName: '', code: null, acc: 0, seq: 0, clipTrack: new WeakMap(), projIds: new WeakMap(), projSeq: 0,
    cmdTimes: [], starting: false, status: '', ack: 0, sent: new Map(), fx: [], ev: [], hello: null, token: null, rematch: { host: false, guest: false }, ended: false, fxSent: 0 };
  const st = netState;
  _netStatus('서버에 연결하는 중…');
  const waysText = (w) => w ? [w.p2p ? '직접 연결' : null, w.relays ? `우회 중계 ${w.relays}곳` : null].filter(Boolean).join(' + ') : '';
  client.on('created', (m) => { st.code = m.code; st.ways = m.ways; _netStatus(`방 코드 ${m.code} - 상대를 기다리는 중${m.ways ? ' (' + waysText(m.ways) + ' 대기)' : ''}`); _netToast(`방을 만들었습니다: ${m.code}`); });
  client.on('ways', (w) => { st.ways = w; if (st.code && !st.remote && !st.pick) _netStatus(`방 코드 ${st.code} - 상대를 기다리는 중 (${waysText(w)} 대기)`); });
  client.on('peer-join', (m) => { st.peerName = m.name || '상대'; if (!st.remote) _netStatus(`${st.peerName} 참가 - 연결 확인 중`); });
  client.on('peer-leave', () => { if (st.pick && !st.remote) { _netPickCancel(st); _netStatus(`상대가 나갔습니다 - 방 코드 ${st.code}로 다시 기다리는 중`); _netToast('상대가 대기실을 나갔습니다'); return; } _netHostGuestGone(st); });
  client.on('error', (m) => { _netStatus('오류: ' + m.msg); });
  client.on('close', () => { if (netState === st) { _netHostEndMatch(st); netState = null; netApplyControlLock(); _netStatus('서버 연결이 끊겼습니다'); } });
  client.on('pong', () => _netHostStatusLine(st));
  client.on('msg', (d) => _netHostOnMessage(st, d));
  _netWorkerTickerStart();
  return client.connect().then(() => { client.send({ t: 'create', name: st.name }); return st; })
    .catch((e) => { if (netState === st) netState = null; _netStatus(e.message); throw e; });
}
function _netHostStatusLine(st) {
  if (st.remote && st.guestReady) _netStatus(`대전 중 - ${st.guestName} · 상대 왕복 ${st.guestRtt != null ? st.guestRtt + 'ms' : '?'} · 방 ${st.code}`);
}
function _netHostOnMessage(st, d) {
  if (!d || typeof d !== 'object') return;
  switch (d.k) {
    case 'hello': {
      const token = String(d.token || '');
      // 재접속: 같은 토큰이면 진행 중인 대전으로 돌려보낸다.
      if (st.remote && !st.ended && ((st.token && token === st.token) || st.guestGoneAt)) { st.token = token; _netHostResume(st); return; }
      if (st.remote && !st.ended) { st.client.sendMsg({ k: 'bye', msg: '이미 대전 중인 방입니다' }); st.client.send({ t: 'kick' }); return; }
      if (d.v != null && d.v !== NET_PROTOCOL_VERSION) { st.client.sendMsg({ k: 'bye', msg: '게임 버전이 다릅니다 - 둘 다 새로고침하세요' }); st.client.send({ t: 'kick' }); return; }
      st.hello = { champ: String(d.champ || ''), name: String(d.name || st.peerName || '상대').slice(0, 24), spells: Array.isArray(d.spells) ? d.spells.slice(0, 2).map(String) : null, rune: d.rune && typeof d.rune === 'object' ? d.rune : null };
      st.token = token;
      // 99차: 픽창에서 "확정 → 불러오기"를 거친다 - 방장 챔피언을 다 불러온 뒤에 시작한다.
      if (st.pick && st.pick.phase === 'loading' && !st.pick.hostLoaded) { st.pick.startWhenLoaded = true; return; }
      st.pick = null;
      _netHostStartMatch(st);
      return;
    }
    case 'hi': { // 99차: 참가자가 방에 들어왔다 - 진행 중인 대전이면 재접속, 아니면 챔피언 선택
      const token = String(d.token || '');
      if (d.v != null && d.v !== NET_PROTOCOL_VERSION) { st.client.sendMsg({ k: 'bye', msg: '게임 버전이 다릅니다 - 둘 다 새로고침하세요' }); st.client.send({ t: 'kick' }); return; }
      if (st.remote && !st.ended) {
        // 100차: 같은 토큰(같은 브라우저) 또는 상대가 끊겨 기다리는 중이면 이어서 한다(다른 탭·다른 기기로 다시 들어와도 된다)
        if ((st.token && token === st.token) || st.guestGoneAt) { st.token = token; _netHostResume(st); return; }
        st.client.sendMsg({ k: 'bye', msg: '이미 대전 중인 방입니다' }); st.client.send({ t: 'kick' }); return;
      }
      st.guestName = String(d.name || st.peerName || '상대').slice(0, 24); st.token = token;
      _netPickBegin(st);
      return;
    }
    case 'pick': {
      if (!st.pick || st.pick.phase !== 'pick') return;
      st.pick.opp = _netPickSanitize(d);
      _netPickRefresh();
      _netHostMaybeGo(st);
      return;
    }
    case 'ready': {
      st.guestReady = true; st.guestGoneAt = null; _netHostStatusLine(st);
      if (!st.resumed) _netHostCountdown(st);
      st.resumed = false; netApplyControlLock();
      return;
    }
    case 'gping': st.client.sendMsg({ k: 'gpong', at: d.at }); return;
    case 'chat': _netChatShow(st.guestName || st.peerName || '상대', String(d.text || '').slice(0, 200), 'RED'); return;
    case 'gstat':
      if (Number.isFinite(d.rtt)) st.guestRtt = Math.round(d.rtt); if (Number.isFinite(d.delay)) st.guestDelay = Math.round(d.delay);
      if (Number.isFinite(d.q)) { st.guestQueue = Math.round(d.q); st.guestRecvBps = Number.isFinite(d.rb) ? d.rb : null; _netRateControl(st, { now: __gcRealNow(), q: d.q, rb: st.guestRecvBps }); }
      return;
    case 'rematch': st.rematch.guest = true; _netToast(`${st.guestName}이(가) 재대결을 원합니다`); _netEndScreenUpdate(); _netHostMaybeRematch(st); return;
    case 'cmd': {
      const bot = st.remote;
      if (!bot || bot._removed || !st.guestReady || st.locked) return;
      const cmd = d.cmd;
      if (validateCommand(cmd)) return;
      // 초당 명령 수 제한(우클릭 연타 정도는 넉넉히) - 넘치면 버린다.
      const now = __gcRealNow(); st.cmdTimes = st.cmdTimes.filter((x) => now - x < 1000);
      if (st.cmdTimes.length >= 60) return;
      st.cmdTimes.push(now);
      if (Number.isInteger(d.s) && d.s > st.ack) st.ack = d.s;
      withCombatActor(bot, () => { try { gameSession._apply(bot, cmd); } catch (e) { console.error('[NET] 원격 명령 처리 오류', cmd, e); } });
    }
  }
}
async function _netHostStartMatch(st) {
  if (st.starting) return;
  const h = st.hello || {};
  let champ = h.champ;
  if (!CHAMPION_MODEL_LIBRARY.some(([k]) => k === champ)) champ = 'garen';
  st.starting = true; st.guestReady = false; st.guestName = h.name || '상대'; st.ended = false; st.rematch = { host: false, guest: false };
  netApplyControlLock();
  _netCloseEndScreen();
  _netStatus(`${st.guestName} 참가 - 게임 준비 중`);
  try {
    if (st.remote) { removeEnemyBot(st.remote); st.remote = null; }
    await _netResetGameAndWait();
    if (netState !== st) return;
    _netClearPracticeUnits();
    if (controller) { controller.team = 'BLUE'; controller.root.position.copy(getTeamSpawnPosition('BLUE')); controller.targetPos = null; controller.currentTarget = null; if (typeof snapCameraTo === 'function') snapCameraTo(controller.root.position); }
    if (typeof visionSystem !== 'undefined') visionSystem.setViewTeam('BLUE');
    const bot = await spawnEnemyBot(champ, { team: 'RED', remote: true, name: st.guestName });
    if (netState !== st) { removeEnemyBot(bot); return; }
    // 참가자가 로비에서 고른 소환사 주문·룬
    if (h.spells && typeof setSummonerSpell === 'function' && typeof SUMMONER_SPELL_DATA !== 'undefined') {
      withCombatActor(bot, () => { for (const [i, k] of ['D', 'F'].entries()) if (h.spells[i] && SUMMONER_SPELL_DATA[h.spells[i]]) setSummonerSpell(bot, k, h.spells[i]); });
    }
    if (h.rune && typeof runeSetPage === 'function') runeSetPage(bot, h.rune);
    if (typeof bot.recomputeStats === 'function') { bot.recomputeStats(); bot.hp = bot.maxHp; bot.mp = bot.maxMp; }
    st.remote = bot; st.ack = 0; st.sent = new Map(); st.seq = 0; st.fx = []; st.ev = [];
    _netFxInstall(st);
    _netLagCompInstall(st);
    _netHostHookEvents(st);
    st.client.sendMsg(_netWelcome(st, false));
  } catch (e) {
    console.error('[NET] 대전 준비 실패', e); _netStatus('대전 준비 실패: ' + (e.message || e));
  } finally { st.starting = false; netApplyControlLock(); }
}
function _netWelcome(st, resume) {
  return {
    k: 'welcome', resume, hostChamp: controller ? controller.championId : 'garen', hostName: st.name, youChamp: st.remote ? st.remote.championId : null,
    hostId: entityId(controller), youId: entityId(st.remote), gt: _netRound(getTurretGameTimeSec()),
    structs: _netStructures().map(([k, s]) => ({ id: entityId(s), k, tm: _netTeamCode(s.team), ty: s.type || null, x: _netRound(getWorldPosition(s).x), z: _netRound(getWorldPosition(s).z) })),
  };
}
function _netHostResume(st) {
  st.guestReady = false; st.resumed = true; st.sent = new Map(); st.seq = 0; st.csSent = null; st.rlSent = null; // 다음 스냅샷은 전체
  _netMirrorResend(st);
  st.client.sendMsg(_netWelcome(st, true));
  _netToast(`${st.guestName}이(가) 다시 접속했습니다`);
}
function _netHostGuestGone(st) {
  if (!st.remote || st.ended) { _netHostEndMatch(st); _netStatus(`상대가 나갔습니다 - 방 코드 ${st.code}`); return; }
  st.guestReady = false; st.guestGoneAt = __gcRealNow();
  if (st.locked) { st.locked = false; if (paused) togglePause(true); }
  withCombatActor(st.remote, () => st.remote.moveTo(st.remote.root.position.clone())); // 끊긴 동안은 제자리
  _netToast(`${st.guestName}의 연결이 끊겼습니다 - ${NET_RECONNECT_GRACE_MS / 1000}초 동안 재접속을 기다립니다`);
  _netStatus(`상대 연결 끊김 - 재접속 대기 (방 ${st.code})`);
  const goneAt = st.guestGoneAt;
  __hostSetTimeout(() => {
    if (netState !== st || st.guestGoneAt !== goneAt || st.guestReady) return;
    _netToast(`${st.guestName}이(가) 돌아오지 않아 대전을 끝냅니다(기권승)`);
    _netShowEndScreen('BLUE', '상대 기권');
    _netHostEndMatch(st);
  }, NET_RECONNECT_GRACE_MS);
}
function _netHostCountdown(st) {
  if (!paused) togglePause(true);
  st.locked = true;
  const overlay = document.getElementById('pauseOverlay'); if (overlay) overlay.classList.remove('show'); // 카운트다운 동안은 일시정지 화면 대신 숫자
  st.client.sendMsg({ k: 'countdown', sec: NET_COUNTDOWN_SEC });
  _netShowCountdown(NET_COUNTDOWN_SEC, () => {
    if (netState !== st || !st.locked) return;
    st.locked = false;
    if (paused) togglePause(true);
  });
}
function _netHostHookEvents(st) {
  if (st.offEvents || typeof onGameEvent !== 'function') return;
  const off1 = onGameEvent('championKill', (e) => {
    if (netState !== st) return;
    st.ev.push({ type: 'championKill', victimId: e.victimId, killerId: e.killerId, gold: e.gold });
    const v = findEntityById(e.victimId), k = findEntityById(e.killerId);
    if (v === controller || k === controller) return; // 방장 자신의 처치·죽음 알림은 보상 시스템이 이미 띄운다
    _netBanner(`${k ? _netChampName(k.championId) : '?'} → ${v ? _netChampName(v.championId) : '?'} 처치`);
  });
  const off2 = onGameEvent('gameOver', (e) => {
    if (netState !== st || st.ended) return;
    st.ended = true;
    const stats = _netEndStats();
    // 마지막 스냅샷(넥서스 파괴)이 먼저 가도록 한 번 더 보내고 끝을 알린다.
    try { if (st.guestReady) st.client.sendMsg(netBuildHostSnapshot(st)); } catch (err) { /* 무시 */ }
    st.client.sendMsg({ k: 'end', winner: e.winnerTeam, stats });
    _netShowEndScreen(e.winnerTeam, null, stats);
  });
  st.offEvents = () => { off1(); off2(); st.offEvents = null; };
}
function _netHostMaybeRematch(st) {
  if (st.role !== 'host' || !st.rematch.host || !st.rematch.guest || !st.hello) return;
  st.rematch = { host: false, guest: false };
  // 99차: 재대결은 챔피언 선택부터 다시(같은 챔피언이면 그대로 확정만 누르면 된다).
  _netHostEndMatch(st);
  _netCloseEndScreen();
  _netPickBegin(st);
}
function _netHostEndMatch(st) {
  st = st || netState; if (!st || st.role !== 'host') return;
  if (st.remote) { removeEnemyBot(st.remote); st.remote = null; }
  st.guestReady = false; st.locked = false;
  if (paused) togglePause(true);
  _netFxUninstall(st);
  _netLagCompUninstall(st);
  if (st.offEvents) st.offEvents();
  netApplyControlLock();
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
  return {
    i: entityId(c), k: 'c', tm: _netTeamCode(c.team), x: _netRound(p.x), y: _netRound(p.y), z: _netRound(p.z), r: _netRound(_netYawOf(c.root), 100),
    hp: _netRound(c.hp, 10), mh: _netRound(c.maxHp, 10), sh: _netRound(c.shield || 0, 10),
    c: c.championId, s: c.state, lv: c.champLevel || 1, mp: _netRound(c.mp, 10), mm: _netRound(c.maxMp, 10),
    cl: c.currentClipKey || null, cn: _netClipCounter(st, c), lp: a && a.loop === THREE.LoopOnce ? 0 : 1, ts: a ? _netRound(a.timeScale, 100) : 1, at: a ? _netRound(a.time, 10) : 0,
    mv: c.model ? (c.model.visible !== false ? 1 : 0) : 1, sz: _netRound(c._sizeScale || 1, 100),
    sc: c.score ? [c.score.kills || 0, c.score.deaths || 0, c.score.assists || 0, c.score.cs || 0] : [0, 0, 0, 0],
    rs: c.state === STATE.DEAD && c._respawnAt ? Math.max(0, Math.round((c._respawnAt - nowMs) / 100) * 100) : null,
    ef: _netSnapStatus(c, nowMs), // 100차: 모든 챔피언의 상태 효과(상대 챔피언 위 표식·행동 불가 표시)
    // 103차: 점수판(Tab)용 - 아이템 6칸·장신구·신발, 소환사 주문, 룬(핵심·보조)
    it: [...[0, 1, 2, 3, 4, 5].map((k) => (c.items && c.items[k] && c.items[k].id) || 0), (c.trinket && c.trinket.id) || 0, (c.boots && c.boots.id) || 0],
    sp: c.summoners ? [c.summoners.D && c.summoners.D.id, c.summoners.F && c.summoners.F.id] : null,
    rn: c.runePage ? [c.runePage.keystone, c.runePage.secondary] : null,
  };
}
function _netSnapStatus(u, nowMs) {
  return (u.statusEffects || []).filter((x) => x && (!x.expiresAt || x.expiresAt > nowMs)).slice(0, 16).map((x) => [String(x.id || x.type), x.type,
    x.expiresAt && Number.isFinite(x.expiresAt) ? Math.round((x.expiresAt - nowMs) / 100) * 100 : -1, typeof x.value === 'number' ? _netRound(x.value, 1000) : null,
    x.source ? entityId(x.source) : null, typeof x.stacks === 'number' ? x.stacks : null]);
}
function _netStatusFrom(list, now) {
  return (list || []).map(([id, type, ms, v, src, stacks]) => {
    const e = { id, type, expiresAt: ms >= 0 ? now + ms : Infinity, value: v };
    if (src != null) e.source = findEntityById(src);
    if (stacks != null) e.stacks = stacks;
    return e;
  });
}
// 100차: 안개 - 참가자(빨강) 팀 시야 밖의 파랑 팀 유닛은 위치를 보내지 않는다(받은 데이터를 들여다봐도 보이지 않게).
function _netHiddenFromGuest(u) {
  if (!u || u.team !== 'BLUE' || typeof visionSystem === 'undefined' || !visionSystem || !visionSystem.enabled) return false;
  if (u.isStructure || u.isTurret || u.isInhibitor || u.isNexus) return false;
  if (u.isWard) return typeof wardSystem !== 'undefined' && wardSystem && !wardSystem.isVisibleTo('RED', u);
  return typeof visionSystem.isVisibleTo === 'function' && !visionSystem.isVisibleTo('RED', u);
}
// 100차: 챔피언 내부 상태(재시전 창·충전·중첩·표식·아이템 재사용 대기 등) - 참가자 화면의 조준·스킬 칸·표식이 방장과 같게.
const NET_CHAMP_STATE_KEY = /^_(ahri|ashe|chogath|darius|ezreal|garen\w*|leesin|lux|masteryi|morde|nautilus|nilah|rammus\w*|renekton|sett|varus|vex|yasuo\w*|yone|summonerMark|itemActiveCooldownUntil|rune)$/;
function _netChampState(st, c) {
  const out = {}; let any = false;
  if (!st.csSent) st.csSent = new Map();
  for (const k of Object.keys(c)) {
    if (!NET_CHAMP_STATE_KEY.test(k)) continue;
    const v = _netSer(c[k]);
    const j = JSON.stringify(v === undefined ? null : v);
    if (st.csSent.get(k) === j) continue;
    st.csSent.set(k, j); out[k] = v === undefined ? null : v; any = true;
  }
  return any ? out : null;
}
// 참가자: 받은 내부 상태를 내 챔피언에 넣는다. 시각 값(…At·…Until·…Expires)은 방장 시계 → 내 시계로 옮긴다.
const _NET_TIME_KEY = /(At|Until|Expires|ExpiresAt)$/;
// 평범한 객체({})인가 - 클래스 인스턴스·Map·three.js 객체는 아니다(다른 실행 환경에서 만든 {}도 맞게)
function _netIsPlain(x) { if (!x || typeof x !== 'object' || Array.isArray(x)) return false; const p = Object.getPrototypeOf(x); return p === null || p === Object.prototype || (p.constructor && p.constructor.name === 'Object' && Object.getPrototypeOf(p) === null); }
function _netTimeShift(v, key, off, inTime) {
  const isTime = inTime || (typeof key === 'string' && _NET_TIME_KEY.test(key));
  if (typeof v === 'number') return isTime && Number.isFinite(v) && v > 1000 ? v + off : v;
  if (Array.isArray(v)) return v.map((x) => _netTimeShift(x, null, off, isTime));
  if (_netIsPlain(v)) { for (const k of Object.keys(v)) v[k] = _netTimeShift(v[k], k, off, isTime); }
  return v;
}
function _netApplyChampState(c, cs, hostNow) {
  const off = performance.now() - hostNow;
  for (const [k, raw] of Object.entries(cs)) {
    const val = _netTimeShift(_netDeser(raw), k, off, false);
    const cur = c[k];
    if (val && cur && typeof val === 'object' && typeof cur === 'object' && !Array.isArray(val) && _netIsPlain(cur)) {
      // 방장에 없는 값(지나간 재시전 창 등)은 지운다 - 참가자 쪽에서만 쓰는 것(Map·화면 객체)은 그대로 둔다
      for (const kk of Object.keys(cur)) {
        if (kk in val) continue;
        const x = cur[kk];
        if (x == null || typeof x !== 'object' || Array.isArray(x) || _netIsPlain(x)) cur[kk] = null;
      }
      Object.assign(cur, val);
    } else c[k] = val;
  }
}
// 지금 이동 명령을 받으면 바로 움직일 수 있는가(참가자 예측을 켤지 정한다 - controller_movement.js moveTo의 분기와 같은 순서).
function _netCanMoveNow(b) {
  if (!b || b.state === STATE.DEAD || b.state === STATE.RESPAWN || !(b.hp > 0)) return false;
  if ((typeof isCrowdControlled === 'function' && isCrowdControlled(b)) || (typeof isRooted === 'function' && isRooted(b))) return false;
  if (b._dashState || b._pullState) return false;
  const k = b.currentActionKey;
  if (k === 'rWindup' || k === 'rChannel' || k === 'rCast' || (typeof b._isLeeSinCastLock === 'function' && b._isLeeSinCastLock())) return false;
  if (k === 'eChannel' || k === 'nilahR' || k === 'varusQCharge' || k === 'qChain') return true;
  if (!b.currentPhase || b.currentPhase === 'RECOVERY') return true;
  if (b.currentPhase === 'STARTUP') { const a = b.getActionAuthority(); return !!(a && a.canMove); }
  return false;
}
// 게스트 본인만 받는 정보: 골드·아이템·스킬·쿨다운·소환사 주문·능력치·상태 효과 + 예측용(이동 속도·이동 목표·추격 대상·처리한 명령 번호).
function _netSnapPrivate(st, c, nowMs) {
  const p = snapshotPlayer(c, nowMs);
  const cd = {}; for (const k of ['Q', 'W', 'E', 'R']) cd[k] = _netRound(Math.max(0, (c.cooldowns && c.cooldowns[k]) || 0), 100);
  const chasing = c.currentTarget && (c.isChasing || c.attackOrderActive || c.state === STATE.ATTACK);
  const me = { g: p.gold, it: p.items, bo: p.boots, tr: p.trinket, sl: p.skillLevels, sp: p.skillPoints, ex: p.exp, sm: p.summoners, cd,
    res: { rage: c._renekton ? _netRound(c._renekton.rage || 0, 10) : null, flow: c._yasuo ? _netRound(c._yasuo.flow || 0, 10) : null, grit: c._sett ? _netRound(c._sett.grit || 0, 10) : null },
    ms: _netRound(getFinalMoveSpeed(c.stats), 1000), fr: _netCanMoveNow(c) ? 1 : 0, ack: st.ack,
    tp: c.state === STATE.MOVE && c.targetPos ? [_netRound(c.targetPos.x), _netRound(c.targetPos.z)] : null,
    tg: chasing ? entityId(c.currentTarget) : null };
  if ((st.seq % 3) === 0) { const cs = _netChampState(st, c); if (cs) { me.cs = cs; me.now = _netRound(nowMs, 1); } }
  if (typeof shopRemoteUndoInfo === 'function') { const u = shopRemoteUndoInfo(c); me.uc = u.n; me.ul = u.label; }
  if ((st.seq % 10) === 0) { // 능력치는 자주 바뀌지 않는다 - 10번에 1번
    const s = {}; for (const [k, v] of Object.entries(c.stats || {})) if (typeof v === 'number' && Number.isFinite(v)) s[k] = _netRound(v, 1000);
    me.st = s; me.hr = c.hpRegen || 0; me.mr = c.mpRegen || 0;
  }
  return me;
}
function _netSnapWard(w, nowMs) {
  return { i: entityId(w), k: 'w', tm: _netTeamCode(w.team), ty: w.wardType, x: _netRound(w.position.x), z: _netRound(w.position.z), hp: w.hp, mh: w.maxHp,
    ex: Number.isFinite(w.expiresAt) ? Math.max(0, Math.round((w.expiresAt - nowMs) / 1000) * 1000) : -1, vr: w.visionRadius || null };
}
// 바뀐 값만(전체 스냅샷이면 전부). 처음 보내는 유닛은 전부 보낸다.
function _netDelta(st, e, full) {
  const prev = st.sent.get(e.i);
  st.sent.set(e.i, e);
  if (full || !prev) return e;
  let out = null;
  for (const k of Object.keys(e)) {
    const a = e[k], b = prev[k];
    if (a === b || (a && b && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b))) continue;
    if (!out) out = { i: e.i };
    out[k] = a;
  }
  return out;
}
function netBuildHostSnapshot(st) {
  const nowMs = performance.now();
  const full = st.seq % NET_KEYFRAME_EVERY === 0;
  const all = [];
  const champs = [controller, ...enemyBots].filter((c) => c && c.root && !c._removed);
  for (const c of champs) all.push(_netSnapChampion(st, c, nowMs));
  for (const m of minions) {
    if (!m || m.isDead || !m.mesh) continue;
    const p = m.mesh.position;
    all.push({ i: entityId(m), k: 'm', tm: _netTeamCode(m.team), ty: m.type, x: _netRound(p.x), y: _netRound(p.y), z: _netRound(p.z), r: m.body && m.body !== m.mesh ? _netRound(_netYawOf(m.body), 100) : 0,
      hp: _netRound(m.hp, 10), mh: _netRound(m.maxHp, 10), cl: m.currentClipName || null, ai: m.attackClipIndex || 0, ts: m.currentAction ? _netRound(m.currentAction.timeScale, 100) : 1 });
  }
  for (const [k, s] of _netStructures()) {
    const e = { i: entityId(s), k, hp: _netRound(s.hp, 10), mh: _netRound(s.maxHp, 10), d: s.destroyed ? 1 : 0 };
    if (k === 't') { const t = s._netAggroTarget; e.tg = t && !t._removed && (t.isChampion || typeof t.championId === 'string') ? entityId(t) : null; e.ht = s.heatStacks || 0; } // 100차: 포탑 조준선·가열
    all.push(e);
  }
  if (typeof wardSystem !== 'undefined' && wardSystem && wardSystem.wards) for (const w of wardSystem.wards) if (!w.destroyed) all.push(_netSnapWard(w, nowMs));
  // 안개: 참가자 팀이 못 보는 파랑 팀 유닛은 위치 대신 hid만
  const unitOf = new Map(listEntities().map((u) => [entityId(u), u]));
  for (let i = 0; i < all.length; i++) {
    const e = all[i], u = unitOf.get(e.i);
    if (u && _netHiddenFromGuest(u)) all[i] = { i: e.i, k: e.k, tm: e.tm, ty: e.ty, c: e.c, hid: 1, sc: e.sc, lv: e.lv, s: e.s };
    else if (e.k === 'c' || e.k === 'm' || e.k === 'w') e.hid = 0;
  }
  const ents = [], ids = new Set();
  for (const e of all) { ids.add(e.i); const d = _netDelta(st, e, full); if (d) ents.push(d); }
  const gone = [];
  for (const id of [...st.sent.keys()]) if (!ids.has(id)) { gone.push(id); st.sent.delete(id); }
  const pr = [];
  for (const proj of projectiles.projectiles) {
    if (!proj.mesh || proj.done) continue;
    const id = _netProjId(st, proj);
    const p = proj.mesh.position, q = proj.mesh.quaternion;
    // 100차: 숨김 투사체(자체 연출이 따라가는 리 신 Q·럭스 Q 등)도 위치는 보낸다 - 참가자 쪽 연출이 따라갈 수 있게(그리지는 않음)
    const row = [id, _netRound(p.x), _netRound(p.y), _netRound(p.z), _netRound(q.x), _netRound(q.y), _netRound(q.z), _netRound(q.w), proj.color || 0xdff0ff, _netRound(proj.mesh.scale.x, 100), proj.mesh.parent ? 0 : 1];
    // 102차: 직선 스킬샷은 속도(x·z)와 남은 거리도 - 참가자 화면에서 "지금" 자리로 앞당겨 그린다(피하기)
    const L = proj.line; if (L && L.dir) row.push(_netRound(L.dir.x * proj.speed), _netRound(L.dir.z * proj.speed), _netRound(Math.max(0, L.maxDist - L.traveled)));
    pr.push(row);
  }
  // 100차: 칼바람 회복 유물(나타남·빛줄기)
  const rl = typeof aramRelics !== 'undefined' ? aramRelics.map((r) => [r.active ? 1 : 0, _netRound(r.beam && r.beam.material ? r.beam.material.opacity : 0, 100)]) : [];
  // 102차: t는 실제 시각(게임 시계는 느린 기기에서 프레임 시간 상한 때문에 실제보다 느리게 갈 수 있다 - 그러면 보간이 표본을 앞질러 끊기고
  // 대기열 지연도 계속 늘어나는 것처럼 보였다). 게임 시계 기준 값(상태 만료 등)은 me.now로 따로 보낸다.
  const snap = { k: 'snap', t: _netRound(__gcRealNow(), 1), gt: _netRound(getTurretGameTimeSec()), ents, pr, ge: gameEnded ? 1 : 0 };
  const rlj = JSON.stringify(rl); if (full || rlj !== st.rlSent) { snap.rl = rl; st.rlSent = rlj; }
  const mi = _netMirrorSnapshot(st, full); if (mi) snap.mi = mi;
  if (full) snap.full = 1;
  if (gone.length) snap.gone = gone;
  if (st.fx.length) { snap.fx = st.fx; st.fxSent += st.fx.length; st.fx = []; }
  if (st.ev.length) { snap.ev = st.ev; st.ev = []; }
  if (st.remote) snap.me = _netSnapPrivate(st, st.remote, nowMs);
  st.seq++;
  return snap;
}
// 102차: 혼잡 제어 - 받는 쪽보다 빨리 보내면 줄이 밀려 핑이 끝없이 늘어난다(공개 중계소·약한 와이파이).
// 혼잡 판단(셋 중 하나): 보내는 쪽 대기열(backlog)이 크다 / 참가자가 잰 대기열 지연(q)이 아주 크다(400ms+) /
//   q가 두 번 연속 높고(90ms+) 참가자가 받은 속도(rb)가 내가 보낸 속도보다 확실히 느리다(줄이 쌓이는 중 - 프레임 흔들림만으로는 생기지 않는다).
// 혼잡하면 초당 보낼 바이트(st.budget)를 "받은 속도의 85%"(한 번에 반 아래로는 안 내림, 모르면 70%)로 낮추고, 다시 낮추기 전엔 줄이 빠질 시간(q ms, 최소 0.5초)을 준다.
// 조용해지면(2초 뒤부터) 1초에 8%씩 올리고, 실제 쓰는 양보다 넉넉해지면 제한을 푼다.
const NET_MIN_BPS = 1500, NET_BACKLOG_MAX = 24 * 1024, NET_QUEUE_HIGH_MS = 90, NET_QUEUE_SEVERE_MS = 400;
function _netRateControl(st, o) {
  const now = o.now;
  if (typeof window !== 'undefined' && window.__netRateControl === false) { st.budget = null; return null; } // 시험용: 끄고 비교
  let starving = false;
  if (o.q != null) {
    const push = (k, v) => { const a = st[k] || (st[k] = []); a.push(v); if (a.length > 3) a.shift(); return a.reduce((x, y) => x + y, 0) / a.length; };
    const rbAvg = push('rbHist', o.rb > 0 ? o.rb : 0), outAvg = push('outHist', st.bpsOut || 0);
    starving = st.rbHist.length >= 2 && rbAvg < outAvg * 0.85 - 300;
    st.qHigh = o.q > NET_QUEUE_HIGH_MS ? (st.qHigh || 0) + 1 : 0;
  }
  const congested = (o.backlog != null && o.backlog > NET_BACKLOG_MAX) || (o.q != null && (o.q > NET_QUEUE_SEVERE_MS || (st.qHigh >= 2 && starving)));
  if (congested) {
    if (!st.congestAt || now - st.congestAt >= Math.max(500, o.q || 0)) {
      const cur = st.budget || st.bpsOut || 30000;
      const fromRecv = o.rb > 0 ? Math.max(o.rb * 0.85, cur * 0.5) : cur * 0.7; // 받은 속도가 곧 좁은 길의 폭 - 단, 한 번에 반 아래로는 안 내린다
      st.budget = Math.max(NET_MIN_BPS, Math.round(Math.min(cur * 0.7, fromRecv)));
      st.congestAt = now; st.congestions = (st.congestions || 0) + 1;
    }
  } else if (st.budget && o.q != null && (o.q <= NET_QUEUE_HIGH_MS || !starving) && now - (st.congestAt || 0) >= 2000) { // 줄이 없거나, 보낸 만큼 다 받고 있다
    st.budget = Math.round(st.budget * 1.08 + 200);
    if (st.budget > 60000 || (st.bpsOut && st.budget > st.bpsOut * 1.5 && st.budget > 20000)) st.budget = null; // 제한이 실제 쓰는 양보다 한참 크다 - 푼다
  }
  return st.budget;
}
function _netProjId(st, proj) { let id = st.projIds.get(proj); if (!id) { id = ++st.projSeq; st.projIds.set(proj, id); } return id; }
// 메인 루프가 시뮬레이션 뒤 프레임마다 부른다(실제 경과 시간 기준 초당 30번 보낸다).
function netHostFrame(dt) {
  const st = netState;
  if (!st || st.role !== 'host' || !st.remote || !st.guestReady) return;
  if (typeof shopRemoteClear === 'function' && typeof _shopInBase === 'function' && !_shopInBase(st.remote)) shopRemoteClear(st.remote); // 기지를 벗어나면 되돌리기 기록을 비운다(원작)
  _netLagCompRecord(st);
  const hz = (st.client && st.client.snapshotHz) || NET_SNAPSHOT_HZ; // 우회 중계는 초당 15번
  const now = __gcRealNow();
  // 102차: 보낸 속도(바이트/초) - 1초마다
  if (!st.bpsAt) { st.bpsAt = now; st.bpsBytes = st.client.bytesOut || 0; }
  else if (now - st.bpsAt >= 1000) { const b = st.client.bytesOut || 0; st.bpsOut = Math.round(((b - st.bpsBytes) * 1000) / (now - st.bpsAt)); st.bpsAt = now; st.bpsBytes = b; }
  // 102차: 혼잡하면 바이트 예산(토큰)만큼만 보낸다 - 예산이 없으면 초당 hz번
  if (st.budget) st.tokens = Math.min((st.tokens || 0) + st.budget * dt, Math.max(2048, st.budget * 0.25));
  st.acc += dt;
  if (st.acc < 1 / hz) return;
  if (st.budget && st.tokens < 0) return; // 예산이 모자라다 - 조금 뒤에(다음 프레임) 다시 본다
  st.acc = Math.min(st.acc - 1 / hz, 1 / hz);
  // 102차: 지난 스냅샷이 아직 다 나가지도 못했으면 이번 것은 건너뛴다(쌓아 두면 그만큼 늦게 도착한다). 차이 기준은 "마지막으로 보낸 것"이라 건너뛰어도 안전하다.
  const backlog = st.client && typeof st.client.backlog === 'function' ? st.client.backlog() : 0;
  if (backlog > NET_BACKLOG_MAX && !(typeof window !== 'undefined' && window.__netRateControl === false)) { st.snapSkipped = (st.snapSkipped || 0) + 1; _netRateControl(st, { now, backlog }); return; }
  try {
    const b0 = st.client.bytesOut || 0; st.client.sendMsg(netBuildHostSnapshot(st));
    const n = (st.client.bytesOut || 0) - b0; st.snapBytes = (st.snapBytes || 0) + n; st.snapCount = (st.snapCount || 0) + 1;
    if (st.budget) st.tokens -= n;
    st.sendTimes = (st.sendTimes || []).filter((x) => now - x < 1000); st.sendTimes.push(now); st.sendHz = st.sendTimes.length; // 최근 1초 보낸 횟수
  } catch (e) { console.error('[NET] 스냅샷 오류', e); }
}
// 방장 탭이 백그라운드로 가면 브라우저가 화면 갱신(requestAnimationFrame)을 멈춘다 - 워커 타이머(백그라운드에서도 거의 제때 온다)로
// 시뮬레이션·스냅샷만 계속 돌린다(그리기는 하지 않는다).
let _netWorker = null;
function _netWorkerTickerStart() {
  if (_netWorker || typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' }));
    _netWorker = new Worker(url);
    _netWorker.onmessage = () => { if (typeof document !== 'undefined' && (document.hidden || window.__netForceHeadless)) netHeadlessFrame(); };
  } catch (e) { _netWorker = null; }
}
function netHeadlessFrame() {
  const st = netState;
  if (!st || st.role !== 'host' || !st.remote) return;
  if (typeof gameClockFrame === 'function') gameClockFrame(SIM_STEP_SEC * SIM_MAX_STEPS * 1000);
  let dt = clock.getDelta();
  if (!isFinite(dt) || dt < 0) dt = 1 / 30;
  dt = Math.min(dt, SIM_STEP_SEC * SIM_MAX_STEPS);
  if (paused) return;
  const steps = Math.max(1, Math.ceil(dt / SIM_STEP_SEC - 1e-6));
  for (let i = 0; i < steps; i++) simulateStep(dt / steps);
  netHostFrame(dt);
  st.headlessFrames = (st.headlessFrames || 0) + 1;
}

// ================= 참가자(게스트) =================
// 게스트의 세션: 명령을 검사해 방장에게 보내고, 이동 계열은 내 화면에서 바로 예측한다(결과는 다음 스냅샷으로 맞춘다).
class RemoteSession {
  constructor(client, st = null) { this.kind = 'remote'; this.client = client; this.st = st; this.tick = 0; this.simTimeSec = 0; this.commandSeq = 0; this.lastResult = null; }
  advance(dt) { if (dt > 0) { this.tick += 1; this.simTimeSec += dt; } }
  reset() { this.tick = 0; this.simTimeSec = 0; }
  snapshot() { return buildGameSnapshot(); }
  events(sinceSeq = 0) { return recentGameEvents(sinceSeq); }
  submit(cmd) {
    const bad = validateCommand(cmd);
    if (bad) { this.lastResult = { ok: false, reason: bad }; return this.lastResult; }
    if (this.st && this.st.locked) { this.lastResult = { ok: false, reason: '시작 전' }; return this.lastResult; }
    const s = ++this.commandSeq;
    // 100차: 충전 스킬(바루스 Q)을 시작하는 시전이면 기억해 둔다 - 키를 떼면 방장 쪽 충전 상태가 오기 전이라도 발사 명령을 보낸다.
    if (cmd.type === 'cast' && typeof controller !== 'undefined' && controller && typeof skillAimSpec === 'function') {
      const spec = skillAimSpec(controller.championId, cmd.slot);
      if (spec && spec.type === 'charge') controller._netChargeSlot = (controller._varus && controller._varus.qCharge) || controller._netChargeSlot === cmd.slot ? null : cmd.slot;
    }
    this.client.sendMsg({ k: 'cmd', cmd, s });
    if (this.st) _netPredictOnCommand(this.st, cmd, s);
    this.lastResult = { ok: true, outcome: true };
    return this.lastResult;
  }
}
// 100차: 방마다 토큰을 이 브라우저(localStorage)에 기억한다 - 새 탭·새로고침으로 다시 들어와도 진행 중인 대전으로 돌아간다.
function _netGuestToken(code) {
  const key = 'netToken:' + (code || '');
  try { let t = localStorage.getItem(key); if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, t); } return t; } catch (e) { return 'tok' + Math.random().toString(36).slice(2); }
}
function _netGuestHello(st) {
  const spells = controller && controller.summoners ? ['D', 'F'].map((k) => controller.summoners[k] && controller.summoners[k].id) : null;
  return { k: 'hello', v: NET_PROTOCOL_VERSION, champ: controller ? controller.championId : 'garen', name: st.name, spells, rune: controller && controller.runePage ? controller.runePage : null, token: st.token };
}
function netGuestJoin(url, code, name) {
  netLeave(true);
  const st = { role: 'guest', client: null, url, name: name || '참가자', code: String(code || '').toUpperCase(), token: _netGuestToken(String(code || '').toUpperCase()), ready: false, units: new Map(), proj: new Map(), snapQ: [], goneAt: new Map(), lastSnapAt: 0, hostT: 0,
    status: '', state: new Map(), pred: null, rtt: null, jitter: 10, lastArrive: 0, delay: 70, own: null, ownId: null, reconnects: 0, locked: false, fxPlayed: 0 };
  netState = st;
  return _netGuestConnect(st, true);
}
function _netGuestConnect(st, first) {
  const client = _netMakeClient(st.url);
  st.client = client;
  if (typeof gameSession !== 'undefined' && gameSession && gameSession.kind === 'remote') gameSession.client = client;
  _netStatus(first ? '서버에 연결하는 중…' : '다시 연결하는 중…');
  client.on('joined', (m) => { st.hostName = (m.host && m.host.name) || '방장'; st.reconnects = 0; _netStatus(`${st.hostName}의 방에 참가 - 대기실`); client.sendMsg(st.ready ? _netGuestHello(st) : { k: 'hi', v: NET_PROTOCOL_VERSION, name: st.name, token: st.token }); });
  client.on('error', (m) => { _netStatus('오류: ' + m.msg); if (!st.ready && first) { client.close(); if (netState === st) netState = null; } });
  client.on('room-closed', () => _netGuestLost(st, '방장이 나가 대전이 끝났습니다'));
  client.on('close', () => _netGuestDisconnected(st, client));
  client.on('msg', (d) => {
    if (!d || typeof d !== 'object' || client !== st.client) return;
    if (d.k === 'welcome') _netGuestStart(st, d);
    else if (d.k === 'snap') { if (st.ready) _netGuestOnSnapshot(st, d); }
    else if (d.k === 'gpong') { const r = __gcRealNow() - d.at; st.rtt = st.rtt == null ? r : st.rtt * 0.8 + r * 0.2; }
    else if (d.k === 'countdown') { st.locked = true; _netShowCountdown(d.sec || NET_COUNTDOWN_SEC, () => { st.locked = false; }); }
    else if (d.k === 'end') { st.ended = true; _netShowEndScreen(d.winner, null, d.stats); }
    else if (d.k === 'rematch') { _netToast(`${st.hostName}이(가) 재대결을 원합니다`); st.rematchHost = true; _netEndScreenUpdate(); }
    else if (d.k === 'bye') { _netGuestLost(st, d.msg || '방장이 대전을 거절했습니다'); }
    else if (d.k === 'pickStart') { st.hostName = d.hostName || st.hostName; _netCloseEndScreen(); _netPickEnter(st, d.sec); }
    else if (d.k === 'pick') { if (st.pick && st.pick.phase === 'pick') { st.pick.opp = _netPickSanitize(d); _netPickRefresh(); } }
    else if (d.k === 'go') { _netPickGo(st); }
    else if (d.k === 'chat') { _netChatShow(st.hostName || '방장', String(d.text || '').slice(0, 200), 'BLUE'); }
  });
  return client.connect().then(() => {
    client.send({ t: 'join', code: st.code, name: st.name });
    if (!st.pingTimer) st.pingTimer = __hostSetInterval(() => {
      if (netState !== st) { __hostClearInterval(st.pingTimer); return; }
      st.client.sendMsg({ k: 'gping', at: __gcRealNow() });
      if (st.ready && st.rtt != null) { const bi = st.client.bytesIn || 0, rb = st.bytesInPrev != null ? bi - st.bytesInPrev : null; st.bytesInPrev = bi; st.recvBps = rb;
        st.client.sendMsg({ k: 'gstat', rtt: st.rtt, delay: st.delay, q: Math.round(st.queueDelay || 0), rb }); _netStatus(`대전 중 - ${st.hostName} · 왕복 ${Math.round(st.rtt)}ms`); }
    }, 1000);
    return st;
  }).catch((e) => {
    if (first) { if (netState === st) netState = null; _netStatus(e.message); throw e; }
    _netGuestDisconnected(st, client);
  });
}
// 연결이 끊기면(방이 닫힌 게 아니면) 2초마다 다시 붙는다(최대 25번 = 약 50초 - 방장은 60초 기다린다).
function _netGuestDisconnected(st, client) {
  if (netState !== st || client !== st.client) return;
  if (!st.ready) { _netGuestLost(st, '서버 연결이 끊겼습니다'); return; }
  if (st.reconnects >= 25) { _netGuestLost(st, '다시 연결하지 못했습니다'); return; }
  st.reconnects++;
  _netStatus(`연결 끊김 - 다시 연결하는 중 (${st.reconnects})`);
  if (st.reconnects === 1) _netToast('연결이 끊겼습니다 - 다시 연결하는 중…');
  __hostSetTimeout(() => { if (netState === st && st.client === client) _netGuestConnect(st, false); }, 2000);
}
function _netGuestLost(st, msg) {
  if (netState !== st) return;
  if (st.pick) { st.pick = null; if (typeof netLobbyRefresh === 'function') netLobbyRefresh(); }
  _netToast(msg); _netStatus(msg + ' - 잠시 뒤 연습 모드로 돌아갑니다');
  if (st.client) st.client.close();
  if (st.pingTimer) __hostClearInterval(st.pingTimer);
  netState = null;
  netApplyControlLock();
  // 게스트 화면은 방장 상태를 그린 것이라 혼자 이어서 할 수 없다 - 연습 모드로 돌아간다(새로고침).
  if (netGuestMode) __hostSetTimeout(() => { try { location.reload(); } catch (e) { /* 테스트 환경 */ } }, 3000);
}
async function _netGuestStart(st, w) {
  if (st.starting) return;
  // 재접속(같은 페이지): 화면 상태는 그대로 두고 이어서 받는다.
  if (w.resume && st.ready) { st.client.sendMsg({ k: 'ready' }); _netToast('다시 연결했습니다'); _netStatus(`대전 중 - ${st.hostName}`); return; }
  st.starting = true;
  netGuestMode = true; // 지금부터 이 브라우저는 시뮬레이션하지 않는다
  netApplyControlLock();
  _netCloseEndScreen();
  st.ready = false; st.ended = false; st.rematchHost = false; st.rematchSent = false;
  for (const p of st.proj.values()) projectiles._releaseArrowMesh(p.entry);
  st.proj.clear(); st.units.clear(); st.state.clear(); st.snapQ.length = 0; st.goneAt.clear(); st.renderOff = null; st.jb = null; st.pred = null; st.own = null;
  try {
    st.pick = null;
    if (typeof closeLobby === 'function') closeLobby();
    if (w.youChamp && controller && controller.championId !== w.youChamp) await _netLoadChampion(w.youChamp, null, null); // 새로고침 뒤 재접속 - 방장 쪽 내 챔피언과 맞춘다
    await _netResetGameAndWait();
    if (netState !== st) return;
    _netClearPracticeUnits();
    if (typeof reserveEntityIds === 'function') reserveEntityIds(NET_GUEST_ID_BASE);
    // 내 챔피언 = 방장 쪽 원격 챔피언(빨강 팀)
    controller.team = 'RED';
    controller.isNetPuppet = true;
    controller.root.position.copy(getTeamSpawnPosition('RED'));
    if (typeof snapCameraTo === 'function') snapCameraTo(controller.root.position);
    assignEntityId(controller, w.youId);
    st.ownId = w.youId;
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
    gameSession = new RemoteSession(st.client, st);
    if (typeof window !== 'undefined') window.gameSession = gameSession;
    st.pred = _netNewPred(controller.root.position);
    st.ready = true;
    st.client.sendMsg({ k: 'ready' });
    _netStatus(`대전 중 - ${st.hostName}`);
    _netToast(`${st.hostName}와(과) 대전을 시작합니다 (빨강 팀)`);
  } catch (e) {
    console.error('[NET] 대전 준비 실패', e); _netStatus('대전 준비 실패: ' + (e.message || e));
  } finally { st.starting = false; netApplyControlLock(); }
}
// 받은 값(델타)을 유닛별 마지막 상태에 합친다.
function _netMerge(st, d, full) {
  const prev = st.state.get(d.i);
  const e = prev && !(full && d.k) ? Object.assign({}, prev, d) : d;
  st.state.set(d.i, e);
  return e;
}
// 102차: 대기열 지연 - (받은 시각 - 방장이 만든 시각)은 "경로 지연 + 두 시계 차 + 대기열 + 프레임 흔들림"이다. 1초 칸마다 가장 빨리 온 값을 남기고,
// 최근 15초의 최솟값을 기준(대기열 없음)으로 "방금 끝난 1초 칸의 최솟값"이 얼마나 늦었는지를 대기열로 친다(최솟값이라 프레임 흔들림은 빠지고
// 계속 서 있는 줄만 남는다). 방장에게 알려(gstat.q) 줄이 생기면 바로 덜 보내게 한다.
function _netQueueSample(st, off, now) {
  if (!Number.isFinite(off)) return;
  const qb = st.qb || (st.qb = { slot: -1, mins: [] });
  const slot = Math.floor(now / 1000);
  if (slot !== qb.slot) {
    if (qb.mins.length) { const done = qb.mins[qb.mins.length - 1]; st.queueDelay = Math.max(0, done - Math.min(...qb.mins)); }
    qb.slot = slot; qb.mins.push(off); if (qb.mins.length > 15) qb.mins.shift();
  } else if (off < qb.mins[qb.mins.length - 1]) qb.mins[qb.mins.length - 1] = off;
}
// 103차: 지터 버퍼 - 예전에는 "마지막 스냅샷 시각 + 그 뒤 흐른 시간 - 지연"으로 그릴 시각을 정해, 스냅샷이 늦게/몰려 오면 그릴 시각이
// 앞뒤로 튀고(튐) 표본을 앞질러(멈칫) 상대가 덜컥거렸다(측정: 걷는 프레임의 49%가 멈칫). 이제는:
//  - 최근 4초 동안 (받은 시각 − 만든 시각)의 최솟값 = 가장 빨리 온 길(base). 각 스냅샷이 그보다 늦은 정도(lateness)와 만든 간격(interval)을 모은다.
//  - 지연 = 늦음의 90번째 값 + 만든 간격의 90번째 값 + 10ms(40~400ms) - 거의 언제나 그릴 시각 뒤에 표본이 하나 더 있다.
//  - 그릴 시각 = 지금 − (base + 지연). 이 차이(renderOff)는 프레임마다 아주 조금씩만(시간 1~6% 늘이고 줄이기) 목표로 옮긴다 - 시간이 매끄럽게 흐른다.
function _netJitterBuffer(st, hostT, recvAt) {
  const w = st.jb || (st.jb = []);
  w.push({ at: recvAt, lat: recvAt - hostT, t: hostT });
  while (w.length > 2 && recvAt - w[0].at > 4000) w.shift();
  let base = Infinity; for (const x of w) if (x.lat < base) base = x.lat;
  const pct = (arr, q) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };
  const late = w.map((x) => x.lat - base), iv = [];
  for (let i = 1; i < w.length; i++) iv.push(w[i].t - w[i - 1].t);
  const interval = iv.length ? pct(iv, 0.9) : 1000 / NET_SNAPSHOT_HZ;
  st.delay = Math.max(40, Math.min(400, pct(late, 0.9) + interval + 10));
  st.jbBase = base;
  st.renderOffTarget = base + st.delay;
  if (st.renderOff == null || Math.abs(st.renderOff - st.renderOffTarget) > 350) st.renderOff = st.renderOffTarget;
}
// 그릴 시각(방장 시계) - 프레임마다 renderOff를 목표 쪽으로 천천히 옮긴다(멀면 6%, 가까우면 1%만큼 시간을 늘이거나 줄인다)
function _netRenderTime(st, dt) {
  if (st.renderOff == null) return st.hostT + (__gcRealNow() - st.lastSnapAt) - st.delay;
  const diff = st.renderOffTarget - st.renderOff, rate = Math.abs(diff) > 60 ? 0.06 : 0.01;
  const step = Math.min(Math.abs(diff), rate * dt * 1000);
  st.renderOff += Math.sign(diff) * step;
  return __gcRealNow() - st.renderOff;
}
function _netGuestOnSnapshot(st, s) {
  const recvAt = __gcRealNow();
  if (st.lastArrive) {
    const gap = recvAt - st.lastArrive;
    st.gapAvg = st.gapAvg ? st.gapAvg * 0.95 + Math.min(500, gap) * 0.05 : 1000 / NET_SNAPSHOT_HZ; // 도착 간격(표시·대기열 판단용)
    st.jitter = st.jitter * 0.9 + Math.abs(gap - st.gapAvg) * 0.1;
  }
  st.lastArrive = recvAt;
  _netJitterBuffer(st, s.t, recvAt);
  _netQueueSample(st, recvAt - s.t, recvAt);
  st.hostT = s.t; st.lastSnapAt = recvAt;
  if (Number.isFinite(s.gt) && typeof setTurretGameTimeSec === 'function') {
    const local = getTurretGameTimeSec();
    if (Math.abs(local - s.gt) > 1) setTurretGameTimeSec(s.gt); // 크게 어긋날 때만 맞춘다(평소엔 netGuestTick이 같이 흘린다)
  }
  // 103차: 같은 시간축 - 위치(표본)는 받자마자 쌓지만, 상대·미니언·구조물의 체력·동작·연출·사라짐은 "그 스냅샷 시각이 화면에 그려질 때"(그릴 시각이
  // 지날 때) 적용한다. 예전에는 위치만 보간 지연만큼 늦게 그리고 동작·연출·체력은 바로 바꿔, 동작이 걸음보다 최대 0.25초 앞섰다(멈추기 전에 대기 동작 등).
  // 내 챔피언(예측 = 지금 시각)과 내 챔피언이 낸 연출, 내 개인 정보는 바로 적용한다.
  const touched = new Set(), later = [];
  const ownId = controller ? entityId(controller) : null;
  for (const d of s.ents || []) {
    const e = _netMerge(st, d, !!s.full);
    touched.add(e.i);
    if (e.i === ownId) { _netGuestApplyEntity(st, e, s.t); continue; }
    if (e.k === 'c' || e.k === 'm') _netGuestEntityPos(st, e, s.t);
    later.push(e);
  }
  // 이번에 값이 안 온(안 바뀐) 유닛도 이 시각의 자리를 표본으로 남긴다(보간이 예전 표본 사이를 오가지 않게).
  for (const [id, e] of st.state) if (!touched.has(id)) { const rec = st.units.get(id); if (rec && rec.samples && e.x != null && !rec.hidden) _netPushSample(rec, s.t, e); }
  const gone = new Set(s.gone || []);
  if (s.full) for (const id of st.state.keys()) if (!touched.has(id)) gone.add(id);
  for (const id of gone) st.goneAt.set(id, s.t);
  for (const id of gone) st.state.delete(id);
  _netGuestProjectiles(st, s.pr || []);
  if (s.me) _netGuestApplyPrivate(st, s.me);
  let fxNow = null, fxLater = null;
  for (const f of s.fx || []) (f[3] ? (fxNow || (fxNow = [])) : (fxLater || (fxLater = []))).push(f);
  if (fxNow) st.fxPlayed += _netFxPlay(fxNow);
  st.snapQ.push({ t: s.t, ents: later, gone: [...gone], rl: s.rl, mi: s.mi, fx: fxLater, ev: s.ev, at: recvAt });
}
// 103차: 그릴 시각이 지난 스냅샷의 나머지(체력·동작·연출·사라짐)를 적용한다. 화면이 멈춰 있었으면(탭 숨김 등) 1초 넘게 밀린 것은 한꺼번에.
function _netGuestDrain(st, renderT) {
  const Q = st.snapQ; if (!Q || !Q.length) return;
  const now = __gcRealNow();
  let n = 0;
  while (n < Q.length && (Q[n].t <= renderT || now - Q[n].at > 1000 || Q.length - n > 90)) n++;
  if (!n) return;
  for (const q of Q.splice(0, n)) _netGuestApplyLater(st, q);
}
function _netGuestApplyLater(st, q) {
  for (const e of q.ents) _netGuestApplyEntity(st, e, q.t, true);
  for (const id of q.gone) { if (st.goneAt.get(id) === q.t) { st.goneAt.delete(id); if (!st.state.has(id)) _netGuestRemove(st, id); } }
  if (q.rl) _netGuestRelics(q.rl);
  if (q.mi) _netMirrorApply(st, q.mi);
  if (q.fx) st.fxPlayed += _netFxPlay(q.fx);
  if (q.ev) for (const ev of q.ev) _netGuestEvent(st, ev);
}
// 받자마자: 유닛을 만들고(처음 보면), 안개 숨김, 위치 표본
function _netGuestEntityPos(st, e, t) {
  let rec = st.units.get(e.i);
  if (e.k === 'c') {
    let c = null;
    if (st.hostPuppet && entityId(st.hostPuppet) === e.i) c = st.hostPuppet;
    if (!c) return;
    if (!rec) { rec = { kind: 'c', obj: c, samples: [] }; st.units.set(e.i, rec); }
  } else {
    if (!rec) { if (e.hid) return; _netGuestMinion(st, e, t); return; } // 처음 보는 미니언은 바로 만든다(첫 표본 포함)
  }
  if (_netGuestHide(rec, e)) return;
  _netPushSample(rec, t, e);
}
function _netGuestApplyEntity(st, e, t, later) {
  if (e.k === 'c') _netGuestChampion(st, e, t, later);
  else if (e.k === 'm') _netGuestMinion(st, e, t, later);
  else if (e.k === 'w') _netGuestWard(st, e);
  else _netGuestStructure(st, e);
}
function _netGuestRemove(st, id) {
  const e = st.state.get(id) || (st.units.get(id) && st.units.get(id).lastE); st.state.delete(id);
  const rec = st.units.get(id); st.units.delete(id);
  if (rec && rec.kind === 'm') _netGuestMinionDie(rec.obj);
  else if (rec && rec.kind === 'w' && typeof wardSystem !== 'undefined' && wardSystem) wardSystem.destroy(rec.obj, e && e.hp > 0 ? 'expired' : 'killed');
}
function _netGuestEvent(st, ev) {
  if (ev.type !== 'championKill') return;
  const me = st.ownId;
  const v = findEntityById(ev.victimId), k = findEntityById(ev.killerId);
  if (ev.killerId === me) _netBanner(`적 챔피언 처치! +${Math.round(ev.gold || 0)} 골드`);
  else if (ev.victimId === me) _netBanner(`${k ? _netChampName(k.championId) : '적'}에게 처치당했습니다`);
  else _netBanner(`${k ? _netChampName(k.championId) : '?'} → ${v ? _netChampName(v.championId) : '?'} 처치`);
}
function _netPushSample(rec, t, e) {
  const last = rec.samples[rec.samples.length - 1];
  if (last && last.t >= t) return;
  rec.samples.push({ t, x: e.x, y: e.y, z: e.z, r: e.r });
  if (rec.samples.length > 32) rec.samples.shift(); // 103차: 지연이 0.4초까지 늘 수 있다
}
function _netIsLocoClip(c, name) {
  if (!name) return false;
  return c._moveClips().includes(name) || c._idleClips().includes(name) || name === 'Idle1_Raw' || name === 'Run1_Raw';
}
function _netGuestChampion(st, e, t, later) {
  let c = null;
  if (controller && entityId(controller) === e.i) c = controller;
  else if (st.hostPuppet && entityId(st.hostPuppet) === e.i) c = st.hostPuppet;
  if (!c) return;
  let rec = st.units.get(e.i);
  if (!rec) { rec = { kind: 'c', obj: c, samples: [] }; st.units.set(e.i, rec); }
  if (c.score && e.sc) [c.score.kills, c.score.deaths, c.score.assists, c.score.cs] = e.sc;
  if (later) { if (e.hid) return; } // 위치·숨김은 받을 때 했다(_netGuestEntityPos)
  else { if (_netGuestHide(rec, e)) return; _netPushSample(rec, t, e); } // 100차: 안개 속 - 방장이 위치를 보내지 않았다
  if (c === controller) { if (st.own && st.own.t !== t) st.ownPrev = st.own; st.own = { x: e.x, y: e.y, z: e.z, r: e.r, s: e.s, t, at: __gcRealNow() }; }
  if (e.ef) c.statusEffects = _netStatusFrom(e.ef, performance.now());
  c.hp = e.hp; c.maxHp = e.mh; c.shield = e.sh; c.mp = e.mp; c.maxMp = e.mm; c.champLevel = e.lv;
  if (c.state !== e.s) c.state = e.s;
  c._respawnAt = e.rs != null ? performance.now() + e.rs : null;
  if (!c.score) c.score = { kills: 0, deaths: 0, assists: 0, cs: 0 };
  [c.score.kills, c.score.deaths, c.score.assists, c.score.cs] = e.sc || [0, 0, 0, 0];
  if (c.model) c.model.visible = e.mv !== 0;
  if (c !== controller) _netGuestScoreInfo(c, e);
  if (c._scaleWrapper && e.sz && Math.abs((c._netSz || 1) - e.sz) > 0.005) { c._scaleWrapper.scale.multiplyScalar(e.sz / (c._netSz || 1)); c._netSz = e.sz; }
  // 동작: 방장 쪽에서 새 클립이 시작됐으면 같은 클립을 튼다. 내 챔피언의 걷기·대기는 예측이 정한다(_netOwnAnimate).
  if (e.cl && (rec.cl !== e.cl || rec.cn !== e.cn)) {
    rec.cl = e.cl; rec.cn = e.cn;
    const ownLoco = c === controller && _netIsLocoClip(c, e.cl);
    if (c === controller) rec.serverLoco = ownLoco;
    const predicted = c === controller && !ownLoco && _netOwnClipFromHost(st, c, e.cl); // 101차: 예측해서 이미 튼 시전 동작
    const clip = ownLoco || predicted ? null : c.findAnimation(e.cl);
    if (clip) c.crossFadeToClip(clip, { loop: e.lp ? THREE.LoopRepeat : THREE.LoopOnce, clampWhenFinished: !e.lp, fade: 0.12, timeScale: e.ts || 1, time: e.lp ? 0 : Math.max(0, e.at || 0) });
  }
  updateBars(c);
}
// 103차: 상대 챔피언의 아이템·소환사 주문·룬(점수판에 원작처럼). 내 것은 개인 정보(me)로 따로 온다.
function _netGuestScoreInfo(c, e) {
  if (Array.isArray(e.it)) {
    const k = e.it.join(','); if (c._netItKey !== k) {
      c._netItKey = k;
      c.items = e.it.slice(0, 6).map((id) => (id ? { id } : null));
      c.trinket = e.it[6] ? { id: e.it[6] } : null; c.boots = e.it[7] ? { id: e.it[7] } : null;
    }
  }
  if (Array.isArray(e.sp) && e.sp[0]) { if (!c.summoners) c.summoners = { D: { id: e.sp[0], readyAt: 0 }, F: { id: e.sp[1], readyAt: 0 } }; else { c.summoners.D.id = e.sp[0]; c.summoners.F.id = e.sp[1]; } }
  if (Array.isArray(e.rn) && e.rn[0] && (!c.runePage || c.runePage.keystone !== e.rn[0])) c.runePage = Object.assign({}, c.runePage || {}, { keystone: e.rn[0], secondary: e.rn[1] });
}
// 100차: 안개 속 유닛(hid) - 보이지 않는 먼 곳으로 치우고, 다시 보이면 새 표본부터(옛 자리에서 미끄러져 오지 않게)
const NET_VOID = { x: 99999, y: -1000, z: 99999 };
function _netGuestHide(rec, e) {
  if (e.hid) {
    if (!rec.hidden) {
      rec.hidden = true; rec.samples.length = 0;
      const o = rec.obj, root = o.root || o.mesh;
      if (root) root.position.set(NET_VOID.x, NET_VOID.y, NET_VOID.z);
      rec.samples.push({ t: 0, x: NET_VOID.x, y: NET_VOID.y, z: NET_VOID.z, r: 0 });
    }
    return true;
  }
  if (rec.hidden) { rec.hidden = false; rec.samples.length = 0; }
  return false;
}
function _netGuestMinion(st, e, t, later) {
  if (e.hid && !st.units.get(e.i)) return; // 처음 보는데 안개 속 - 보일 때 만든다
  let rec = st.units.get(e.i);
  if (later && !rec) return; // 그사이 사라졌다
  if (!rec) {
    const m = createMinion(e.ty, new THREE.Vector3(e.x, e.y, e.z), getTurretGameTimeSec(), _netTeamName(e.tm));
    assignEntityId(m, e.i);
    minions.push(m);
    rec = { kind: 'm', obj: m, samples: [], ai: e.ai };
    st.units.set(e.i, rec);
  }
  const m = rec.obj;
  rec.lastE = e;
  if (later) { if (e.hid) return; } else { if (_netGuestHide(rec, e)) return; _netPushSample(rec, t, e); }
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
function _netGuestWard(st, e) {
  if (typeof wardSystem === 'undefined' || !wardSystem) return;
  let rec = st.units.get(e.i);
  if (e.hid) { if (rec) { wardSystem.destroy(rec.obj, 'expired'); st.units.delete(e.i); } return; } // 100차: 못 보는 와드는 지운다(보이면 다시 만든다)
  if (!rec) {
    const w = wardSystem.place(null, e.ty, new THREE.Vector3(e.x, 0, e.z), { team: _netTeamName(e.tm), durationSec: e.ex >= 0 ? e.ex / 1000 + 2 : undefined, maxHp: e.mh, visionRadius: e.vr || undefined });
    if (!w) return;
    assignEntityId(w, e.i);
    rec = { kind: 'w', obj: w };
    st.units.set(e.i, rec);
  }
  const w = rec.obj;
  if (w.hp !== e.hp) { w.hp = e.hp; if (typeof wardSystem._refreshBar === 'function') wardSystem._refreshBar(w); }
  if (e.ex >= 0) w.expiresAt = performance.now() + e.ex + 2000; // 지우는 건 방장 스냅샷이 한다(시계 차이로 먼저 사라지지 않게 여유)
}
function _netGuestStructure(st, e) {
  const s = findEntityById(e.i);
  if (!s || (!s.isStructure && !s.isTurret && !s.isInhibitor && !s.isNexus)) return;
  if (e.d && !s.destroyed) {
    s.hp = 0;
    if (e.k === 't') destroyTurret(s); else if (e.k === 'h') destroyInhibitor(s); else destroyNexus(s);
    return;
  }
  if (!e.d && s.destroyed && e.k === 'h' && typeof respawnInhibitor === 'function') respawnInhibitor(s);
  if (e.k === 't') { s._netGuestTarget = e.tg != null ? e.tg : null; if (e.ht != null && e.ht !== s.heatStacks) { s.heatStacks = e.ht; if (e.ht > 0 && typeof turretNowMs === 'function') s.lastChampionHitAt = turretNowMs(); } }
  if (e.d || Math.abs((s.hp || 0) - e.hp) <= 0.05) return;
  s.hp = e.hp; if (Number.isFinite(e.mh)) s.maxHp = e.mh;
  if (e.k === 't' && typeof updateTurretVisual === 'function') updateTurretVisual(s);
  else if (e.k === 'h' && typeof updateInhibitorVisual === 'function') updateInhibitorVisual(s);
  else if (typeof setStructBar === 'function') setStructBar(s.labelDiv, s.maxHp ? s.hp / s.maxHp : 0);
}
function _netGuestProjectiles(st, list) {
  const seen = new Set();
  for (const [id, x, y, z, qx, qy, qz, qw, color, scale, hidden, vx, vz, rem] of list) {
    seen.add(id);
    let p = st.proj.get(id);
    if (!p) p = _netGuestProjProxy(st, id, color);
    if (!p.bornAt) p.bornAt = __gcRealNow();
    if (Number.isFinite(vx) && Number.isFinite(rem)) { const sp = Math.hypot(vx, vz) || 1; p.line = { vx, vz, speed: sp, ex: x + (vx / sp) * rem, ez: z + (vz / sp) * rem }; }
    if (!hidden && !p.entry.group.parent) scene.add(p.entry.group);
    if (!p.positioned) { p.entry.group.position.set(x, y, z); p.positioned = true; }
    p.entry.group.quaternion.set(qx, qy, qz, qw);
    p.entry.group.scale.setScalar(scale || 1);
    p.samples.push({ t: st.hostT, x, y, z });
    if (p.samples.length > 16) p.samples.shift();
  }
  for (const [id, p] of st.proj) if (!seen.has(id)) { p.done = true; projectiles._releaseArrowMesh(p.entry); st.proj.delete(id); }
}
// 102차: 직선 스킬샷을 "지금" 자리로 - 보간 자리(방장 시각보다 지연·편도만큼 과거)에서 (보간 지연 + 왕복)만큼 앞으로 민다.
// 그 자리에 있을 때 피하면 내 이동이 방장에게 닿는 순간 실제 투사체도 거기 있다(피하기가 화면과 맞는다). 끝 지점은 넘지 않고,
// 처음 0.15초 동안 서서히 앞당겨 순간 이동처럼 보이지 않게 한다. window.__netProjPresent = false면 끈다(점검용).
function _netProjPresent(p, s, leadSec, now) {
  if (!p.line || !(leadSec > 0) || (typeof window !== 'undefined' && window.__netProjPresent === false)) return s;
  const L = p.line, ux = L.vx / L.speed, uz = L.vz / L.speed;
  const ramp = Math.min(1, Math.max(0, (now - (p.bornAt != null ? p.bornAt : now)) / 150));
  const left = Math.max(0, (L.ex - s.x) * ux + (L.ez - s.z) * uz);
  const d = Math.min(L.speed * leadSec * ramp, left);
  return { x: s.x + ux * d, z: s.z + uz * d };
}
// 방장 투사체 하나에 대응하는 참가자 쪽 대리 객체({ mesh, done }) - 연출(vfxFollowProjectile)이 따라간다. 숨김 투사체는 그리지 않는다.
function _netGuestProjProxy(st, id, color = 0xdff0ff) {
  if (!st || !st.proj) return { mesh: new THREE.Object3D(), done: true };
  let p = st.proj.get(id);
  if (!p) {
    const entry = projectiles._acquireArrowMesh(color);
    if (entry.group.parent) entry.group.parent.remove(entry.group);
    p = { entry, samples: [], mesh: entry.group, done: false, positioned: false };
    st.proj.set(id, p);
  }
  return p;
}
function _netGuestApplyPrivate(st, me) {
  const c = controller; if (!c) return;
  const now = performance.now();
  const goldBefore = st._goldRaw;
  st._goldRaw = me.g;
  c.gold = me.g;
  // 골드가 한 번에 늘면(처치·막타·구조물) 내 챔피언 위에 떠오르는 숫자(기본 수급 3골드는 빼고)
  if (Number.isFinite(goldBefore) && me.g - goldBefore >= 8 && typeof spawnRewardText === 'function') spawnRewardText(c.root.position.clone().add(new THREE.Vector3(0, 2, 0)), `+${Math.round(me.g - goldBefore)}`, '#ffd34d');
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
  if (me.cs) _netApplyChampState(c, me.cs, me.now || st.hostT);
  c._netUndo = { n: me.uc || 0, label: me.ul || '' };
  if (me.st) { for (const [k, v] of Object.entries(me.st)) if (c.stats && k in c.stats) c.stats[k] = v; c.hpRegen = me.hr; c.mpRegen = me.mr; }
  const P = st.pred;
  if (P) {
    P.srv = { ms: me.ms, fr: !!me.fr, ack: me.ack || 0, tp: me.tp, tg: me.tg };
    _netReconcile(st);
  }
  updateBars(c);
  if (typeof updateSkillUI === 'function') updateSkillUI(c.cooldowns);
  if (typeof updateExpUI === 'function') updateExpUI(c);
  if (me.st && typeof updateHudStats === 'function') updateHudStats(c);
}

// ---------------- 내 챔피언 예측 ----------------
function _netNewPred(pos) {
  return { pos: pos.clone(), intent: null, intentSeq: 0, hist: [], corr: new THREE.Vector3(), srv: null, moving: false, follow: false, corrections: 0, snaps: 0 };
}
// 명령을 보내는 순간: 이동 계열이면 예측 목표를 바꾼다(방장이 받기 전까지는 이 목표로 움직인다).
function _netPredictOnCommand(st, cmd, seq) {
  const P = st.pred; if (!P || !controller) return;
  if (cmd.type === 'cast') st.lastCast = { slot: cmd.slot, at: __gcRealNow() }; // 101차: 방장이 틀 시전 클립을 배우려고(행동 불가 중이어도)
  if (P.srv && !P.srv.fr) return; // 방장 쪽에서 지금 움직일 수 없다(행동 불가·시전 고정) - 방장 결과를 따른다
  const clampPt = (p) => { const v = new THREE.Vector3(p.x, 0, p.z); return (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap) ? howlingAbyssMap.clampPosition(v) : v; };
  switch (cmd.type) {
    case 'move': case 'attackMove': P.intent = { kind: 'move', p: clampPt(cmd.point) }; P.intentSeq = seq; break;
    case 'attack': P.intent = { kind: 'chase', id: cmd.targetId }; P.intentSeq = seq; break;
    case 'stop': case 'recall': P.intent = { kind: 'stop' }; P.intentSeq = seq; break;
    case 'cast': case 'summoner':
      if (cmd.type === 'cast') _netPredictCast(st, cmd); // 101차: 시전 동작 바로
      // 시전 방향으로 바로 돌아선다(방장도 같은 방향을 본다). 이동은 방장 결과를 기다린다.
      if (cmd.point) { const d = new THREE.Vector3(cmd.point.x - controller.root.position.x, 0, cmd.point.z - controller.root.position.z); if (d.lengthSq() > 1e-6) controller.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); }
      break;
  }
}
// 지금 따라갈 이동 목표: 방장이 아직 받지 못한 내 명령이 있으면 그것, 아니면 방장이 알려 준 목표(tp)·추격 대상(tg).
function _netEffectiveIntent(P) {
  const srv = P.srv || { ack: 0 };
  if (P.intent && P.intentSeq > (srv.ack || 0)) return P.intent;
  if (srv.tg != null) return { kind: 'chase', id: srv.tg };
  if (srv.tp) return { kind: 'move', p: new THREE.Vector3(srv.tp[0], 0, srv.tp[1]) };
  return null;
}
function _netPredictTick(st, dt) {
  const P = st.pred, c = controller, own = st.own;
  if (!P || !c || !c.root) return;
  const srv = P.srv;
  const dead = c.state === STATE.DEAD || c.state === STATE.RESPAWN;
  const pending = !!(P.intent && srv && P.intentSeq > (srv.ack || 0));
  P.follow = !srv || dead || (!srv.fr && !pending);
  P.moving = false;
  if (P.follow) {
    // 방장 위치를 빠르게 따라간다(돌진·넉백·행동 불가·시전 고정·죽음).
    if (own) {
      const k = 1 - Math.exp(-dt * 22);
      const dx = own.x - P.pos.x, dz = own.z - P.pos.z, dist = Math.hypot(dx, dz);
      if (dist > lolRangeToWorld(600)) { P.pos.set(own.x, own.y || 0, own.z); P.snaps++; if (typeof snapCameraTo === 'function') snapCameraTo(P.pos); }
      else if (_netOwnHostStill(st)) {
        // 103차: 방장 쪽에서 멈춰 있다(기절·속박·시전 고정) - 예측으로 앞서간 만큼을 걷는 속도의 1.5배로 되돌아간다(한 프레임에 확 끌려가지 않게)
        const ms = (P.srv && P.srv.ms) || getFinalMoveSpeed(c.stats), step = Math.min(dist * k, ms * 1.5 * dt);
        if (dist > 1e-6) { P.pos.x += (dx / dist) * step; P.pos.z += (dz / dist) * step; }
      } else { P.pos.x += dx * k; P.pos.z += dz * k; } // 돌진·넉백 - 방장 움직임을 바짝 따라간다
      P.pos.y = own.y || 0;
      c.root.quaternion.setFromAxisAngle(_NET_Y_AXIS, own.r || 0);
    }
    P.corr.set(0, 0, 0);
  } else {
    const intent = _netEffectiveIntent(P);
    let goal = null;
    if (intent && intent.kind === 'move') goal = intent.p;
    else if (intent && intent.kind === 'chase') {
      const tgt = findEntityById(intent.id);
      if (tgt && !(tgt.hp <= 0) && !tgt.isDead && !tgt.destroyed) {
        c.root.position.copy(P.pos);
        if (!c._isInAttackRangeWithBonus(tgt)) goal = getWorldPosition(tgt).clone();
        else { const tp = getWorldPosition(tgt); const d = new THREE.Vector3(tp.x - P.pos.x, 0, tp.z - P.pos.z); if (d.lengthSq() > 1e-6) c.faceDirection(d.normalize(), dt); }
      }
    }
    if (goal) {
      const to = new THREE.Vector3(goal.x - P.pos.x, 0, goal.z - P.pos.z);
      const dist = to.length();
      if (dist < 0.08) { P.pos.x = goal.x; P.pos.z = goal.z; }
      else {
        to.normalize();
        const speed = (srv && srv.ms) || getFinalMoveSpeed(c.stats);
        const step = Math.min(dist, speed * dt);
        P.pos.addScaledVector(to, step);
        P.moving = true;
        if (c.currentActionKey !== 'eChannel') c.faceDirection(to, dt);
      }
    }
    // 방장 위치와의 차이를 조금씩 메운다.
    if (P.corr.lengthSq() > 1e-10) {
      // 103차: 메우는 속도에 상한(걷는 속도의 60%) - 느린 화면(프레임 간격이 길다)에서 한 프레임에 확 끌려가 보이지 않게
      const cl = P.corr.length(), ms = (srv && srv.ms) || getFinalMoveSpeed(c.stats);
      const take = Math.min(cl * (1 - Math.exp(-dt * 8)), ms * 0.6 * dt, cl), f = take / cl;
      P.pos.x += P.corr.x * f; P.pos.z += P.corr.z * f;
      P.corr.multiplyScalar(1 - f);
    }
    // 구조물에 파고들지 않게(방장과 같은 충돌 함수)
    c.root.position.copy(P.pos);
    if (typeof resolvePlayerStructureCollisions === 'function') resolvePlayerStructureCollisions(c);
    P.pos.copy(c.root.position);
    if (own) P.pos.y = own.y || 0;
  }
  c.root.position.copy(P.pos);
  const now = __gcRealNow();
  P.hist.push({ t: now, x: P.pos.x, z: P.pos.z });
  while (P.hist.length && now - P.hist[0].t > 2000) P.hist.shift();
  _netOwnAnimate(st, c);
}
// 스냅샷이 오면: 방장이 내 최신 명령을 받은 뒤라면, 왕복 지연만큼 과거의 내 예측 위치와 방장 위치를 비교해 차이를 메울 몫(corr)으로 둔다.
// 방장 쪽 내 챔피언이 멈춰 있나: 위치가 한동안 안 왔거나(안 바뀐 값은 보내지 않는다) 바로 전 값과 같다
function _netOwnHostStill(st) {
  const own = st.own; if (!own) return false;
  if (__gcRealNow() - own.at > Math.max(80, (st.gapAvg || 33) * 1.6)) return true;
  return !!(st.ownPrev && Math.hypot(own.x - st.ownPrev.x, own.z - st.ownPrev.z) < lolRangeToWorld(1));
}
function _netReconcile(st) {
  const P = st.pred, own = st.own;
  if (!P || !own || P.follow || !P.srv) return;
  if (P.intent && P.intentSeq > (P.srv.ack || 0)) return; // 방장이 아직 내 명령을 모른다 - 비교하면 틀린 차이가 나온다
  // 103차: 원작처럼 - 걷는 동안 "걷는 방향으로 앞서거나 뒤처진 차이"는 시각을 정확히 맞출 수 없어 생기는 겉차이다(같은 목적지에서 같은 속도로
  // 멈추므로 저절로 없어진다). 예전에는 이것까지 스냅샷마다 메워(측정: 걷는 동안 보정 298번) 뒤로 끌려가는 프레임이 생겼다.
  // 이제 걷는 중에는 옆으로 벗어난 차이(미니언에 밀림 등)와 0.3초치를 넘는 앞뒤 차이만 메운다. 멈춘 뒤에는 방장도 멈춰 있으면 방장 자리에 정확히 맞춘다.
  const hostStill = _netOwnHostStill(st);
  if (!P.moving) {
    if (!hostStill) return; // 방장 쪽은 아직 걷는 중 - 멈출 때까지 기다린다
    const ex = own.x - P.pos.x, ez = own.z - P.pos.z, err = Math.hypot(ex, ez);
    if (err > lolRangeToWorld(400)) { P.pos.set(own.x, own.y || 0, own.z); P.corr.set(0, 0, 0); P.hist.length = 0; P.snaps++; return; }
    if (err < lolRangeToWorld(2)) { P.corr.set(0, 0, 0); return; }
    P.corr.set(ex, 0, ez); P.corrections++;
    return;
  }
  const back = __gcRealNow() - (st.rtt != null ? st.rtt : 100) - (st.gapAvg || 1000 / NET_SNAPSHOT_HZ) / 2; // 102차: 실제 도착 간격(혼잡하면 길어진다)
  let h = null, hi = -1;
  for (let i = P.hist.length - 1; i >= 0; i--) { if (P.hist[i].t <= back) { h = P.hist[i]; hi = i; break; } }
  if (!h) return;
  let ex = own.x - h.x, ez = own.z - h.z;
  const err = Math.hypot(ex, ez);
  if (err > lolRangeToWorld(400)) { P.pos.set(own.x, own.y || 0, own.z); P.corr.set(0, 0, 0); P.hist.length = 0; P.snaps++; if (typeof snapCameraTo === 'function' && err > lolRangeToWorld(1500)) snapCameraTo(P.pos); return; }
  // 걷는 방향(지금 예측 위치 - 그때 위치)
  let dx = P.pos.x - h.x, dz = P.pos.z - h.z; const dl = Math.hypot(dx, dz);
  if (dl > 1e-6) {
    dx /= dl; dz /= dl;
    const along = ex * dx + ez * dz, crossX = ex - along * dx, crossZ = ez - along * dz;
    const speed = (P.srv && P.srv.ms) || getFinalMoveSpeed(controller.stats), tol = speed * 0.3;
    const keep = Math.abs(along) > tol ? along - Math.sign(along) * tol : 0;
    ex = crossX + keep * dx; ez = crossZ + keep * dz;
  }
  if (Math.hypot(ex, ez) < lolRangeToWorld(6)) return;
  P.corr.set(ex, 0, ez); P.corrections++;
  for (let i = hi; i < P.hist.length; i++) { P.hist[i].x += ex; P.hist[i].z += ez; } // 같은 차이를 두 번 메우지 않게 기록도 옮긴다
}
// 내 챔피언 걷기·대기 동작: 예측한 이동에 맞춘다(방장의 평타·스킬·죽음 동작은 _netGuestChampion이 튼다).
function _netOwnAnimate(st, c) {
  const P = st.pred, rec = st.units.get(entityId(c));
  const pending = !!(P.intent && P.srv && P.intentSeq > (P.srv.ack || 0));
  const serverLoco = !rec || rec.serverLoco !== false;
  if (P.follow || !(serverLoco || (pending && P.moving))) return;
  if (P.castLockUntil && __gcRealNow() < P.castLockUntil && !P.moving) return; // 101차: 예측한 시전 동작을 대기 동작으로 덮지 않는다
  const want = P.moving ? 'move' : 'idle';
  const cur = c.currentClipKey;
  const isMove = cur && c._moveClips().includes(cur), isIdle = cur && (c._idleClips().includes(cur) || cur === 'Idle1_Raw');
  if (want === 'move' && !isMove) c.playFirstAvailable(c._moveClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
  else if (want === 'idle' && !isIdle) c.playFirstAvailable(c.championId === 'yasuo' && c.findAnimation('Idle1_Raw') ? ['Idle1_Raw'] : c._idleClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
  if (want === 'move' && typeof c._updateLocomotionPlayback === 'function') c._updateLocomotionPlayback((P.srv && P.srv.ms) || getFinalMoveSpeed(c.stats));
}

// 보간: 방장 시각 기준 delay만큼 전 자리를 그린다.
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
// 메인 루프(게스트 모드)가 simulateStep 대신 프레임마다 부른다: 시계·예측·보간·동작 재생.
function netGuestTick(dt) {
  if (typeof advanceTurretGameClock === 'function') advanceTurretGameClock(dt);
  if (typeof gameSession !== 'undefined' && gameSession) gameSession.advance(dt);
  if (typeof updateRewardTexts === 'function') updateRewardTexts(dt);
  const st = netState;
  if (!st || st.role !== 'guest' || !st.ready) { if (controller && controller.mixer) safeMixerUpdate(controller.mixer, dt, 'netGuest'); return; }
  const renderT = _netRenderTime(st, dt);
  _netGuestDrain(st, renderT);
  for (const rec of st.units.values()) {
    if (rec.kind === 'w') continue;
    if (rec.kind === 'c' && rec.obj === controller) continue; // 내 챔피언은 예측(_netPredictTick)
    const s = _netSampleAt(rec.samples, renderT);
    if (!s) continue;
    if (rec.kind === 'c') {
      const c = rec.obj; if (!c.root) continue;
      c.root.position.set(s.x, s.y, s.z);
      c.root.quaternion.setFromAxisAngle(_NET_Y_AXIS, s.r || 0);
    } else {
      const m = rec.obj; if (!m.mesh) continue;
      m.mesh.position.set(s.x, s.y, s.z);
      if (m.body && m.body !== m.mesh) m.body.quaternion.setFromAxisAngle(_NET_Y_AXIS, s.r || 0);
    }
  }
  _netPredictTick(st, dt);
  const lead = (st.delay + (st.rtt || 0)) / 1000;
  for (const p of st.proj.values()) { const s = _netSampleAt(p.samples, renderT); if (s) { const f = _netProjPresent(p, s, lead, __gcRealNow()); p.entry.group.position.set(f.x, s.y, f.z); } }
  for (const c of [controller, st.hostPuppet]) if (c && c.mixer) safeMixerUpdate(c.mixer, dt, 'netChampion');
  for (const m of minions) {
    if (m.mixer) safeMixerUpdate(m.mixer, dt, 'netMinion');
    if (typeof updateMinionHealthBarVisibility === 'function') updateMinionHealthBarVisibility(m);
  }
  for (const t of turrets) {
    if (t.destroyed && typeof updateTurretCombat === 'function') updateTurretCombat(t, dt); // 부서진 포탑은 무너지는 연출만(전투 없음)
    else {
      if (typeof placeStructLabel === 'function') placeStructLabel(t);
      if (typeof updateTurretAggroBeam === 'function') updateTurretAggroBeam(t, t._netGuestTarget != null ? findEntityById(t._netGuestTarget) : null); // 100차: 나를 노리는 포탑 조준선
    }
  }
  _netGuestAramTick(dt);
  _netMirrorTick(st, dt);
  if (typeof wardSystem !== 'undefined' && wardSystem && typeof wardSystem.update === 'function') wardSystem.update(dt); // 와드 연출·보이기(지우기는 방장 스냅샷)
}

// ---------------- 카운트다운·승패 화면 ----------------
function _netShowCountdown(sec, done) {
  if (typeof document === 'undefined') { __hostSetTimeout(done, sec * 1000); return; }
  let el = document.getElementById('netCountdown');
  if (!el) {
    el = document.createElement('div'); el.id = 'netCountdown';
    el.style.cssText = 'position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);font:bold 96px/1 sans-serif;color:#f0d899;text-shadow:0 0 24px #000,0 0 6px #000;z-index:9998;pointer-events:none';
    document.body.appendChild(el);
  }
  let n = sec;
  const step = () => {
    if (n > 0) { el.textContent = String(n); el.style.display = ''; n--; __hostSetTimeout(step, 1000); return; }
    el.textContent = '시작!';
    __hostSetTimeout(() => { el.style.display = 'none'; }, 700);
    try { done(); } catch (e) { console.error(e); }
  };
  step();
}
function _netEndStats() {
  const row = (c) => c ? { champ: c.championId, team: c.team, k: (c.score && c.score.kills) || 0, d: (c.score && c.score.deaths) || 0, a: (c.score && c.score.assists) || 0, cs: (c.score && c.score.cs) || 0, lv: c.champLevel || 1, gold: Math.round(c.gold || 0) } : null;
  const st = netState;
  return [row(controller), row(st && st.remote)].filter(Boolean);
}
function _netShowEndScreen(winnerTeam, reason, stats) {
  if (typeof document === 'undefined') return;
  _netCloseEndScreen();
  const myTeam = (controller && controller.team) || 'BLUE';
  const win = winnerTeam === myTeam;
  const el = document.createElement('div'); el.id = 'netEndScreen'; el.dataset.result = win ? 'win' : 'lose';
  el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(5,8,14,0.72);z-index:10000;font-family:sans-serif;color:#e8e2d0';
  const rows = (stats || _netEndStats()).map((r) => `<tr style="color:${r.team === 'RED' ? '#ff8a7a' : '#8ac4ff'}"><td style="padding:4px 8px">${_netChampName(r.champ)}</td><td>${r.lv}</td><td>${r.k}/${r.d}/${r.a}</td><td>${r.cs}</td><td>${r.gold}</td></tr>`).join('');
  el.innerHTML = `<div style="font:bold 64px/1 sans-serif;letter-spacing:.12em;color:${win ? '#f0d899' : '#c0c4cc'};text-shadow:0 0 18px #000">${win ? '승리' : '패배'}</div>`
    + (reason ? `<div style="font-size:14px;color:#bbb">${reason}</div>` : '')
    + `<table style="border-collapse:collapse;font-size:13px;min-width:320px;background:rgba(0,0,0,.4);text-align:center"><tr style="color:#999"><th style="text-align:left;padding:4px 8px">챔피언</th><th>레벨</th><th>K/D/A</th><th>CS</th><th>골드</th></tr>${rows}</table>`
    + '<div style="display:flex;gap:10px"><button id="netRematchBtn" style="padding:8px 18px">재대결</button><button id="netEndLeaveBtn" style="padding:8px 18px">나가기</button><button id="netEndCloseBtn" style="padding:8px 18px">닫기</button></div><div id="netRematchStatus" style="font-size:12px;color:#9cf;min-height:14px"></div>';
  document.body.appendChild(el);
  el.querySelector('#netRematchBtn').addEventListener('click', () => netRequestRematch());
  el.querySelector('#netEndLeaveBtn').addEventListener('click', () => { _netCloseEndScreen(); netLeave(false); });
  el.querySelector('#netEndCloseBtn').addEventListener('click', () => _netCloseEndScreen());
  _netEndScreenUpdate();
}
function _netEndScreenUpdate() {
  if (typeof document === 'undefined') return;
  const s = document.getElementById('netRematchStatus'); const st = netState;
  if (!s || !st) return;
  const mine = st.role === 'host' ? st.rematch && st.rematch.host : st.rematchSent;
  const theirs = st.role === 'host' ? st.rematch && st.rematch.guest : st.rematchHost;
  s.textContent = mine && theirs ? '재대결 준비 중…' : mine ? '상대의 재대결 수락을 기다리는 중' : theirs ? '상대가 재대결을 원합니다' : '';
}
function _netCloseEndScreen() { if (typeof document === 'undefined') return; const el = document.getElementById('netEndScreen'); if (el) el.remove(); }
function netRequestRematch() {
  const st = netState; if (!st || !st.client) return;
  if (st.role === 'host') { st.rematch.host = true; st.client.sendMsg({ k: 'rematch' }); _netEndScreenUpdate(); _netHostMaybeRematch(st); }
  else { st.rematchSent = true; st.client.sendMsg({ k: 'rematch' }); _netEndScreenUpdate(); }
}

function netLeave(silent) {
  const st = netState;
  if (!st) return;
  netState = null;
  if (st.role === 'host') {
    _netHostEndMatch(st);
    st.client.close();
    if (!silent) _netStatus('방을 닫았습니다');
  } else {
    if (st.client) st.client.close();
    if (st.pingTimer) __hostClearInterval(st.pingTimer);
    if (netGuestMode) { try { location.reload(); } catch (e) { /* 테스트 환경 */ } }
    else if (!silent) _netStatus('나갔습니다');
  }
  netApplyControlLock();
}
if (typeof window !== 'undefined') {
  window.netHostCreateRoom = netHostCreateRoom; window.netGuestJoin = netGuestJoin; window.netLeave = netLeave; window.netRequestRematch = netRequestRematch;
  window.netMatchActive = netMatchActive; window.netHeadlessFrame = netHeadlessFrame; window.netLagCompMs = () => netLagCompMs(); window.togglePause = (f) => togglePause(f); window.__netRealNow = __gcRealNow;
  Object.defineProperty(window, 'netState', { get: () => netState, configurable: true });
  Object.defineProperty(window, 'netGuestMode', { get: () => netGuestMode, configurable: true });
}

// ================= 99차: 챔피언 선택(픽창) =================
// 둘이 방에 모이면 방장이 선택을 시작한다(제한 시간 NET_PICK_SEC). 각자 로비 화면(lobby_ui.js)에서 챔피언·룬·소환사 주문을 고르고
// "확정"을 누른다 - 고르는 동안의 선택은 상대 화면에 바로 보인다. 둘 다 확정하면 방장이 'go'를 보내고, 양쪽이 고른 챔피언을
// 불러온 뒤(참가자는 그다음 hello) 97·98차 흐름대로 대전을 시작한다. 시간이 다 되면 지금 고른 것으로 확정된다.
function _netPickSanitize(d) {
  const champ = typeof CHAMPION_MODEL_LIBRARY !== 'undefined' && CHAMPION_MODEL_LIBRARY.some(([k]) => k === d.champ) ? d.champ : null;
  const spells = Array.isArray(d.spells) ? d.spells.slice(0, 2).map(String) : null;
  return { champ, spells, locked: !!d.locked };
}
function _netMyPick() {
  const ls = typeof lobbyState !== 'undefined' ? lobbyState : null;
  return { champ: ls && ls.champ, spells: ls ? ls.spells.slice() : null, page: ls && ls.page ? JSON.parse(JSON.stringify(ls.page)) : null };
}
// 방장: 선택 시작(참가자 입장 직후·재대결)
function _netPickBegin(st) {
  st.client.sendMsg({ k: 'pickStart', sec: NET_PICK_SEC, hostName: st.name });
  _netPickEnter(st, NET_PICK_SEC);
}
function _netPickEnter(st, sec) {
  st.pick = { phase: 'pick', endsAt: __gcRealNow() + (sec || NET_PICK_SEC) * 1000, locked: false, opp: { champ: null, spells: null, locked: false }, lastSent: '' };
  if (typeof openLobby === 'function' && !(typeof isLobbyOpen === 'function' && isLobbyOpen())) openLobby();
  if (typeof netLobbyShowPick === 'function') netLobbyShowPick();
  _netStatus('챔피언 선택 중');
  _netPickTicker(st);
}
function _netPickCancel(st) { st.pick = null; if (typeof netLobbyRefresh === 'function') netLobbyRefresh(); }
// 0.25초마다: 내 선택이 바뀌었으면 상대에게 보내고, 시간이 다 되면 확정한다.
function _netPickTicker(st) {
  if (st.pickTimer) __hostClearInterval(st.pickTimer);
  st.pickTimer = __hostSetInterval(() => {
    const P = st.pick;
    if (netState !== st || !P || P.phase !== 'pick') { __hostClearInterval(st.pickTimer); st.pickTimer = null; return; }
    const mine = _netMyPick();
    const key = JSON.stringify([mine.champ, mine.spells, P.locked]);
    if (key !== P.lastSent) { P.lastSent = key; st.client.sendMsg({ k: 'pick', champ: mine.champ, spells: mine.spells, locked: P.locked }); _netPickRefresh(); }
    if (!P.locked && __gcRealNow() >= P.endsAt) netPickLock();
    _netPickRefresh();
  }, 250);
}
function _netPickRefresh() { if (typeof netLobbyRefreshPick === 'function') netLobbyRefreshPick(); }
function netPickActive() { return !!(netState && netState.pick && netState.pick.phase === 'pick'); }
// 확정(로비의 "확정" 버튼·시간 끝). 룬 페이지가 틀리면 기본 룬으로 바꿔 확정한다.
function netPickLock() {
  const st = netState; if (!st || !st.pick || st.pick.phase !== 'pick' || st.pick.locked) return false;
  if (typeof lobbyState !== 'undefined' && !runeValidatePage(lobbyState.page)) lobbyState.page = runeDefaultPage(lobbyState.champ);
  st.pick.locked = true;
  st.pick.mine = _netMyPick();
  const m = st.pick.mine;
  st.pick.lastSent = JSON.stringify([m.champ, m.spells, true]);
  st.client.sendMsg({ k: 'pick', champ: m.champ, spells: m.spells, locked: true });
  _netPickRefresh();
  if (st.role === 'host') _netHostMaybeGo(st);
  return true;
}
function _netHostMaybeGo(st) {
  const P = st.pick;
  if (!P || P.phase !== 'pick' || !P.locked || !P.opp.locked) return;
  st.client.sendMsg({ k: 'go' });
  _netPickGo(st);
}
// 둘 다 확정: 고른 챔피언을 불러오고(룬·주문 적용·저장), 참가자는 hello, 방장은 hello를 기다렸다가 시작.
async function _netPickGo(st) {
  const P = st.pick; if (!P || P.phase === 'loading') return;
  if (!P.locked) { st.pick.locked = true; P.mine = _netMyPick(); }
  P.phase = 'loading';
  _netStatus('챔피언을 불러오는 중…');
  _netPickRefresh();
  const m = P.mine || _netMyPick();
  await _netLoadChampion(m.champ, m.spells, m.page);
  if (netState !== st || st.pick !== P) return;
  if (st.role === 'host') {
    P.hostLoaded = true;
    if (P.startWhenLoaded) { st.pick = null; _netHostStartMatch(st); }
  } else {
    st.client.sendMsg(_netGuestHello(st));
  }
}
// 챔피언 불러오기(로비 "게임 시작"과 같은 저장·적용). 이미 그 챔피언이면 룬·주문만 바꾼다.
function _netLoadChampion(champ, spells, page) {
  return new Promise((resolve) => {
    if (!champ) { resolve(controller); return; }
    try {
      if (page && typeof runeValidatePage === 'function' && runeValidatePage(page)) runeSavePage(champ, page);
      if (typeof _lobbySave === 'function') { _lobbySave(LOBBY_CHAMP_KEY, champ); if (spells) _lobbySave(LOBBY_SPELLS_KEY, spells); }
    } catch (e) { /* 저장 불가 */ }
    const apply = () => {
      if (controller) {
        if (page && typeof runeSetPage === 'function') runeSetPage(controller, page);
        if (spells && typeof lobbyApplyPending === 'function') lobbyApplyPending(controller, spells); else if (typeof closeLobby === 'function') closeLobby();
      }
      resolve(controller);
    };
    if (controller && controller.championId === champ && controller.root) { apply(); return; }
    if (typeof lobbyState !== 'undefined') lobbyState.pendingSpells = spells ? spells.slice() : null;
    loadChampionFromLibrary(champ);
    const t0 = __gcRealNow();
    const poll = () => {
      if (controller && controller.championId === champ && controller.root) { apply(); return; }
      if (__gcRealNow() - t0 > 60000) { resolve(controller); return; }
      __hostSetTimeout(poll, 100);
    };
    poll();
  });
}
if (typeof window !== 'undefined') { window.netPickLock = netPickLock; window.netPickActive = netPickActive; }

// ================= 100차: 칼바람 회복 유물·서리 관문(참가자 화면) =================
function _netGuestRelics(list) {
  if (typeof aramRelics === 'undefined') return;
  if (!aramFeaturesBuilt && typeof buildAramFeatures === 'function') buildAramFeatures();
  list.forEach(([active, beam], i) => {
    const r = aramRelics[i]; if (!r) return;
    r.active = !!active; r.orb.visible = r.active;
    if (r.beam && r.beam.material) r.beam.material.opacity = beam || 0;
  });
}
function _netGuestAramTick(dt) {
  if (typeof aramRelics === 'undefined') return;
  if (!aramFeaturesBuilt && typeof buildAramFeatures === 'function' && !buildAramFeatures()) return;
  const now = performance.now();
  for (const r of aramRelics) if (r.active) { r.orb.position.y = lolRangeToWorld(110) + Math.sin(now / 400) * lolRangeToWorld(12); r.orb.rotation.y += dt * 1.6; }
  for (const gate of aramGates) {
    const exit = typeof aramGateExit === 'function' ? aramGateExit(gate) : null;
    gate.group.visible = true;
    gate.swirl.rotation.z += dt * (exit ? 1.8 : 0.2);
    gate.swirl.material.opacity = exit ? .5 : .12;
  }
}

// ================= 100차: 챔피언이 직접 만든 연출 물체 미러링 =================
// 아리 Q 구슬·W 여우불·E 매혹, 요네 표식·육체·영혼 리본, 럭스 구체·E 장판, 노틸러스 닻줄, 벡스 Q 파동처럼 챔피언 코드가
// 직접 장면에 넣는 물체는 연출 함수 호출 복제(_netFx*)에 잡히지 않는다. 만든 곳에서 netMirror(obj)를 부르면
//  - 방장: 처음 한 번 물체 모양(three.js toJSON - 같은 텍스처 이미지는 한 번만)을 보내고, 그 뒤엔 위치·회전·크기·보임·투명도만
//    (자식까지, 바뀐 것만) 보낸다. 장면에서 빠지면 지우라고 알린다. 참가자 팀 시야 밖이면 숨김으로 보낸다.
//  - opts.via = [유닛, 메서드 이름, ...인자]: 모양 대신 "참가자 쪽 같은 유닛에서 같은 메서드를 불러 만들라"고 보낸다(요네 육체처럼 스킨 모델 복제).
//  - 참가자: 받은 모양을 ObjectLoader로 만들어 장면에 넣고, 받은 상태를 그대로 입힌다.
function netMirror(obj, opts = {}) {
  const st = netState;
  if (!obj || !st || st.role !== 'host' || !st.remote || !st.guestReady) return obj;
  if (!st.mirrors) { st.mirrors = new Map(); st.mirrorSeq = 0; st.mirrorImgs = new Set(); }
  if (!st.mirrors.has(obj)) st.mirrors.set(obj, { id: ++st.mirrorSeq, created: false, opts, last: '' });
  return obj;
}
function _netPointVisibleForTeam(team, p) {
  if (!p || typeof visionSystem === 'undefined' || !visionSystem || !visionSystem.enabled) return true;
  const src = visionSystem._teamSources && visionSystem._teamSources[team];
  if (!src) return true;
  for (const s of src) if (Math.hypot(s.position.x - p.x, s.position.z - p.z) <= lolRangeToWorld(s.lolRadius)) return true;
  return false;
}
function _netMirrorNodes(obj) { const out = []; obj.traverse((o) => { if (out.length < 16) out.push(o); }); return out; }
function _netMirrorJson(st, obj, opts) {
  if (opts && opts.via) { const [unit, method, ...args] = opts.via; return { via: [entityId(unit), method, ...args.map((a) => _netSer(a))] }; }
  let skinned = false; obj.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  if (skinned) return null; // 스킨 모델은 모양을 옮기지 않는다(via로 보낸다)
  const copy = obj.clone(true);
  copy.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints) && o.geometry && o.geometry.parameters) o.geometry = THREE.BufferGeometry.prototype.copy.call(new THREE.BufferGeometry(), o.geometry); }); // 회전·이동시킨 기본 도형도 그대로
  let j;
  try { j = copy.toJSON(); } catch (e) { return null; }
  for (const img of j.images || []) { if (st.mirrorImgs.has(img.uuid)) img.url = null; else st.mirrorImgs.add(img.uuid); }
  if (JSON.stringify(j).length > 400000) return null;
  return j;
}
function _netMirrorState(obj) {
  const wp = obj.getWorldPosition(new THREE.Vector3());
  const seen = _netPointVisibleForTeam('RED', wp);
  return _netMirrorNodes(obj).map((o, i) => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    return [_netRound(o.position.x), _netRound(o.position.y), _netRound(o.position.z), _netRound(o.quaternion.x), _netRound(o.quaternion.y), _netRound(o.quaternion.z), _netRound(o.quaternion.w),
      _netRound(o.scale.x), _netRound(o.scale.y), _netRound(o.scale.z), (o.visible && (i > 0 || seen)) ? 1 : 0, m && typeof m.opacity === 'number' ? _netRound(m.opacity, 100) : -1];
  });
}
function _netMirrorSnapshot(st, full) {
  if (!st.mirrors || !st.mirrors.size) return null;
  const a = [], u = [], g = [];
  for (const [obj, rec] of st.mirrors) {
    if (!obj.parent) { if (rec.created) g.push(rec.id); st.mirrors.delete(obj); continue; }
    if (!rec.created) { rec.created = true; const j = _netMirrorJson(st, obj, rec.opts); if (!j) { rec.skip = true; continue; } a.push({ id: rec.id, j }); rec.last = ''; }
    if (rec.skip) continue;
    const state = _netMirrorState(obj), sj = JSON.stringify(state);
    if (full || sj !== rec.last) { rec.last = sj; u.push([rec.id, state]); }
  }
  return a.length || u.length || g.length ? { a, u, g } : null;
}
function _netMirrorResend(st) { if (st.mirrors) for (const rec of st.mirrors.values()) { rec.created = false; rec.skip = false; } if (st.mirrorImgs) st.mirrorImgs.clear(); }
function _netMirrorApply(st, mi) {
  if (!st.mirrors) { st.mirrors = new Map(); st.mirrorImgs = new Map(); }
  for (const { id, j } of mi.a || []) {
    if (st.mirrors.has(id)) continue;
    let obj = null;
    try {
      if (j.via) {
        const [uid, method, ...args] = j.via, unit = findEntityById(uid);
        if (unit && typeof unit[method] === 'function') { const ret = unit[method](...args.map(_netDeser)); obj = ret && ret.isObject3D ? ret : ret && (ret.outer || ret.group || ret.mesh) || null; if (obj && ret.mixer) obj.userData.netMixer = ret.mixer; }
      } else {
        for (const img of j.images || []) { if (img.url) st.mirrorImgs.set(img.uuid, img.url); else img.url = st.mirrorImgs.get(img.uuid) || ''; }
        obj = new THREE.ObjectLoader().parse(j);
      }
    } catch (e) { console.warn('[NET] 연출 물체 만들기 실패', e); }
    if (!obj) continue;
    if (!obj.parent) scene.add(obj);
    st.mirrors.set(id, { obj, nodes: _netMirrorNodes(obj) });
  }
  for (const [id, state] of mi.u || []) {
    const rec = st.mirrors.get(id); if (!rec) continue;
    state.forEach((v, i) => {
      const o = rec.nodes[i]; if (!o) return;
      o.position.set(v[0], v[1], v[2]); o.quaternion.set(v[3], v[4], v[5], v[6]); o.scale.set(v[7], v[8], v[9]); o.visible = !!v[10];
      if (v[11] >= 0) { const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of mats) m.opacity = v[11]; }
    });
  }
  for (const id of mi.g || []) {
    const rec = st.mirrors.get(id); if (!rec) continue;
    st.mirrors.delete(id);
    if (rec.obj.parent) rec.obj.parent.remove(rec.obj);
    rec.obj.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
  }
}
function _netMirrorTick(st, dt) {
  if (!st.mirrors) return;
  for (const rec of st.mirrors.values()) { const mx = rec.obj && rec.obj.userData && rec.obj.userData.netMixer; if (mx && !mx._netFrozen) { mx.update(0); mx._netFrozen = true; } }
}
if (typeof window !== 'undefined') window.netMirror = netMirror;

// ================= 100차: 채팅 =================
function netSendChat(text) {
  const st = netState; text = String(text || '').trim().slice(0, 200);
  if (!st || !st.client || !text) return false;
  st.client.sendMsg({ k: 'chat', text });
  _netChatShow(st.name || '나', text, st.role === 'host' ? 'BLUE' : 'RED', true);
  return true;
}
function _netChatShow(name, text, team, mine) {
  if (typeof document === 'undefined' || !text) return;
  let log = document.getElementById('netChatLog');
  if (!log) {
    log = document.createElement('div'); log.id = 'netChatLog';
    log.style.cssText = 'position:fixed;left:14px;bottom:150px;width:340px;max-height:180px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;z-index:60;pointer-events:none;font:13px sans-serif';
    document.body.appendChild(log);
  }
  const line = document.createElement('div');
  line.style.cssText = 'background:rgba(0,0,0,.45);padding:2px 6px;border-radius:3px;color:#e8e2d0;text-shadow:0 1px 2px #000;transition:opacity .6s';
  const nm = document.createElement('b'); nm.style.color = team === 'RED' ? '#ff8a7a' : '#8ac4ff'; nm.textContent = `${name}${mine ? '' : ''}: `;
  line.appendChild(nm); line.appendChild(document.createTextNode(text));
  log.appendChild(line);
  while (log.children.length > 8) log.removeChild(log.firstChild);
  __hostSetTimeout(() => { line.style.opacity = '0'; __hostSetTimeout(() => line.remove(), 700); }, 12000);
  if (netState) { netState.chatLog = netState.chatLog || []; netState.chatLog.push({ name, text }); }
}
if (typeof window !== 'undefined') window.netSendChat = netSendChat;

// ================= 101차: 지연 보정(참가자가 본 그대로 맞는다) =================
// 참가자는 상대 챔피언·미니언을 "한쪽 지연 + 보간 지연"만큼 과거 모습으로 보고, 그 화면을 보고 겨눈 명령은 다시 한쪽 지연 뒤에 방장에 닿는다.
// 그래서 참가자의 스킬샷은 (왕복 지연 + 보간 지연)만큼 늦은 세상을 겨눈 셈이다 - 보정이 없으면 움직이는 상대를 화면대로 맞혀도 빗나간다.
// 방장은 참가자 챔피언이 "행동하는 동안"(명령 처리·참가자 투사체 비행·참가자 스킬의 지연 판정·참가자 챔피언 갱신 - withCombatActor(원격 챔피언))
// 다른 유닛(방장 챔피언·미니언)을 그만큼 과거 자리로 잠깐 되돌렸다가(위치 기록 0.6초) 끝나면 제자리로 돌린다.
// 그 사이에 스킬이 그 유닛을 옮겼으면(넉백·끌어당김) 옮긴 자리를 그대로 둔다. 되돌리는 양은 최대 0.35초(너무 늦은 상대를 맞히지 않게).
const NET_LAGCOMP_MAX_MS = 350;
function _netLagCompUnits() {
  const out = [];
  if (typeof controller !== 'undefined' && controller && controller.root) out.push(controller);
  for (const m of (typeof minions !== 'undefined' ? minions : [])) if (m && !m.isDead && m.mesh) out.push(m);
  return out;
}
function _netLagCompRecord(st) {
  if (!st.lagHist) st.lagHist = new Map();
  const now = __gcRealNow(); // 102차: 참가자 화면 지연(왕복+보간)은 실제 시간이다
  for (const u of _netLagCompUnits()) {
    const p = u.root ? u.root.position : u.mesh.position;
    let h = st.lagHist.get(u); if (!h) st.lagHist.set(u, h = []);
    h.push({ t: now, x: p.x, y: p.y, z: p.z });
    while (h.length > 2 && now - h[0].t > 1000) h.shift(); // 1초(점검이 0.6~0.8초 전을 본다)
  }
  if (st.lagHist.size > 200) for (const u of st.lagHist.keys()) if (!u.root && (u.isDead || !u.mesh)) st.lagHist.delete(u);
}
function netLagCompMs(st) {
  st = st || netState;
  if (!st || st.role !== 'host' || (typeof window !== 'undefined' && window.__netLagComp === false)) return 0;
  if (typeof window !== 'undefined' && Number.isFinite(window.__netLagCompForceMs)) return window.__netLagCompForceMs; // 점검용
  const ms = (st.guestRtt || 0) + (st.guestDelay || 0);
  return Math.max(0, Math.min(NET_LAGCOMP_MAX_MS, ms));
}
function _netHistAt(h, t) {
  if (!h || !h.length) return null;
  if (t <= h[0].t) return h[0];
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1], b = h[i];
    if (t >= a.t && t <= b.t) { const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }; }
  }
  return h[h.length - 1];
}
// fn을 "참가자가 본 세상"에서 실행한다.
function _netRewound(st, fn) {
  const ms = netLagCompMs(st);
  if (!ms || !st.lagHist || st._rewinding) return fn();
  const t = __gcRealNow() - ms;
  const moved = [];
  for (const u of _netLagCompUnits()) {
    if (u === st.remote || u._dashState || u._pullState) continue; // 돌진·끌려가는 중인 유닛은 지금 자리 그대로
    const past = _netHistAt(st.lagHist.get(u), t); if (!past) continue;
    const p = u.root ? u.root.position : u.mesh.position;
    moved.push([p, p.x, p.y, p.z, past.x, past.y, past.z]);
    p.set(past.x, past.y, past.z);
  }
  st._rewinding = true;
  try { return fn(); } finally {
    st._rewinding = false;
    for (const [p, x, y, z, px, py, pz] of moved) if (p.x === px && p.y === py && p.z === pz) p.set(x, y, z); // 스킬이 옮겼으면 그 자리를 둔다
    st.lagCompUses = (st.lagCompUses || 0) + 1;
  }
}
function _netLagCompInstall(st) {
  if (st.lagRestore) return;
  const orig = withCombatActor;
  withCombatActor = function (actor, fn) {
    if (actor && actor === st.remote && netState === st && st.guestReady && __combatActor !== actor) return orig(actor, () => _netRewound(st, fn));
    return orig(actor, fn);
  };
  st.lagRestore = () => { withCombatActor = orig; };
}
function _netLagCompUninstall(st) { if (st && st.lagRestore) { st.lagRestore(); st.lagRestore = null; } }

// ================= 101차: 참가자 시전 동작 예측 =================
// 참가자가 스킬을 쓰면 방장 결과(왕복 지연 뒤)를 기다리지 않고 바로 시전 동작을 튼다. 어떤 클립인지는 챔피언·칸마다 "지난번에 방장이 튼 클립"을
// 배워 둔다(챔피언마다 스킬 동작이 다르고 연속 동작도 있어서 - 처음 한 번은 방장 것을 기다린다). 방장 쪽 같은 클립이 1초 안에 오면 다시 틀지 않는다.
// 쿨다운 중·마나 부족·행동 불가·시전 고정이면 틀지 않는다.
const _netCastClipMemo = new Map(); // `${championId}:${slot}` → 클립 이름
function _netPredictCast(st, cmd) {
  const c = controller, P = st.pred; if (!c || !P) return;
  const slot = cmd.slot;
  st.lastCast = { slot, at: __gcRealNow() };
  if (!P.srv || !P.srv.fr) return;
  if (c.state === STATE.DEAD || ((c.cooldowns && c.cooldowns[slot]) || 0) > 0.05 || !((c.skillLevels && c.skillLevels[slot]) > 0)) return;
  const clipName = _netCastClipMemo.get(`${c.championId}:${slot}`); if (!clipName) return;
  const clip = c.findAnimation(clipName); if (!clip) return;
  c.crossFadeToClip(clip, { loop: THREE.LoopOnce, clampWhenFinished: true, fade: 0.08 });
  st.predictedClip = { name: clipName, at: __gcRealNow() };
  P.castLockUntil = __gcRealNow() + Math.min(600, clip.duration * 1000); // 시전 동작 중에는 걷기 동작으로 덮지 않는다
}
// 방장 쪽 내 챔피언 클립이 바뀌면: 방금 쓴 스킬의 클립을 배우고, 예측해서 이미 튼 클립이면 다시 틀지 않는다.
function _netOwnClipFromHost(st, c, clipName) {
  const now = __gcRealNow();
  if (st.lastCast && now - st.lastCast.at < 1500 && !_netIsLocoClip(c, clipName) && !/attack|death|recall|respawn/i.test(clipName)) {
    _netCastClipMemo.set(`${c.championId}:${st.lastCast.slot}`, clipName);
    st.lastCast = null;
  }
  if (st.predictedClip && st.predictedClip.name === clipName && now - st.predictedClip.at < 1000) { st.predictedClip = null; return true; } // 이미 틀었다
  return false;
}
