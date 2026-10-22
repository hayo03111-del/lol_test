/* net_transport.js — 100차: 학교·회사 와이파이에서도 붙는 연결(자동 선택)
 *
 * 기본 연결(서버 주소 칸이 비어 있을 때)은 AutoNetClient다. 대전 코드(net_session.js)는 중계 서버용 NetClient와 같은 모양
 * (on/connect/send/sendMsg/close, 'created'·'joined'·'peer-join'·'peer-leave'·'room-closed'·'msg'·'error'·'close')으로 쓴다.
 *  - 방장: 방 코드를 정하고 두 가지 길로 동시에 기다린다.
 *      ① 브라우저끼리 직접 연결(PeerNetClient - WebRTC, PeerJS)
 *      ② 우회 중계: 공개 MQTT 중계소(웹소켓·wss) 여러 곳에 같은 방 코드로 귀를 기울인다.
 *  - 참가자: ① 직접 연결을 먼저 시도하고, 안 되면(학교 와이파이는 기기끼리 직접 통신·UDP를 막는 경우가 많다) ② 중계소를
 *    차례로(웹 기본 포트 443을 쓰는 곳 먼저) 시도한다. 붙은 길로 대전한다 - 화면 왼쪽 위에 "직접 연결/우회 중계"가 보인다.
 *  - 우회 중계는 게임 메시지가 공개 중계소를 거치므로 직접 연결보다 느리다 - 방장은 스냅샷을 초당 15번으로 줄여 보낸다.
 * 연결 진단(netConnectionTest): 직접 연결 중개 서버와 각 중계소에 닿는지 재서 로비에 보여 준다.
 *
 * MQTT는 3.1.1 최소 구현(CONNECT·SUBSCRIBE·PUBLISH QoS 0·PING) - 라이브러리 없이 웹소켓(하위 프로토콜 'mqtt') 위에서 돈다.
 * 주제: lolsim/pvp1/<방 코드>/h(방장이 받음) · /g(참가자가 받음). 메시지는 JSON 글자: { f: 보낸 쪽 아이디, to: 받는 참가자 아이디, t, d }.
 */
const NET_MQTT_BROKERS = [
  'wss://mqtt.eclipseprojects.io:443/mqtt', // 웹 기본 포트(443) - 학교·회사 방화벽에서도 열려 있는 경우가 많다
  'wss://broker-cn.emqx.io:8084/mqtt', // 102차: 아시아(상하이) - 한국에서 가장 가까운 후보. 참가자는 모든 길을 동시에 재서 가장 빠른 곳을 쓴다
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const NET_MQTT_TOPIC = 'lolsim/pvp2/';
// 102차: 주제에 방 코드를 그대로 쓰지 않는다(공개 중계소에서 'lolsim/#'을 엿봐도 코드가 보이지 않게) - 코드의 해시(cyrb53)
function _netCodeHash(code) {
  const str = 'lolsim-room:' + code; let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function _netMqttBrokers() { return (typeof window !== 'undefined' && Array.isArray(window.__netMqttBrokers)) ? window.__netMqttBrokers : NET_MQTT_BROKERS; }
function _netP2pDisabled() { return typeof window !== 'undefined' && !!window.__netPeerDisabled; }
function _netRandId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

// ---------------- MQTT 3.1.1 최소 클라이언트 ----------------
const _netTE = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, _netTD = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
function _mqttStr(s) { const b = _netTE.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function _mqttLen(n) { const out = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return out; }
function _mqttPacket(head, body) { const b = body instanceof Uint8Array ? body : Uint8Array.from(body); const l = _mqttLen(b.length); const out = new Uint8Array(1 + l.length + b.length); out[0] = head; out.set(l, 1); out.set(b, 1 + l.length); return out; }
class MqttWs {
  constructor(url, clientId) { this.url = url; this.clientId = clientId; this.ws = null; this.buf = new Uint8Array(0); this.onmessage = null; this.onclose = null; this.pid = 1; this._ping = null; this.closed = false; }
  connect(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (done) return; done = true; this.close(); reject(new Error(msg)); };
      const timer = __hostSetTimeout(() => fail('시간 초과'), timeoutMs);
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { __hostClearTimeout(timer); fail(e.message); return; }
      this.ws = ws; ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const vh = [..._mqttStr('MQTT'), 4, 0x02, 0, 30]; // 3.1.1, clean session, keepalive 30초
        ws.send(_mqttPacket(0x10, [...vh, ..._mqttStr(this.clientId)]));
      };
      ws.onerror = () => { __hostClearTimeout(timer); fail('연결 실패'); };
      ws.onclose = () => { __hostClearTimeout(timer); if (!done) fail('연결이 닫힘'); else if (!this.closed) { this.closed = true; if (this._ping) __hostClearInterval(this._ping); if (this.onclose) this.onclose(); } };
      this._onConnack = (rc) => {
        __hostClearTimeout(timer);
        if (rc !== 0) { fail('거절됨(' + rc + ')'); return; }
        done = true;
        this._ping = __hostSetInterval(() => this._send(Uint8Array.from([0xC0, 0])), 20000);
        resolve(this);
      };
      ws.onmessage = (e) => this._data(new Uint8Array(e.data));
    });
  }
  _send(bytes) { if (this.ws && this.ws.readyState === 1) this.ws.send(bytes); }
  backlog() { return (this.ws && this.ws.bufferedAmount) || 0; }
  _data(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); this.buf = b;
    for (;;) {
      if (this.buf.length < 2) return;
      let mul = 1, len = 0, i = 1, byte;
      do { if (i >= this.buf.length) return; byte = this.buf[i++]; len += (byte & 127) * mul; mul *= 128; } while (byte & 128);
      if (this.buf.length < i + len) return;
      const type = this.buf[0] >> 4, body = this.buf.subarray(i, i + len);
      this.buf = this.buf.slice(i + len);
      if (type === 2 && this._onConnack) this._onConnack(body[1]);
      else if (type === 3) {
        const tl = (body[0] << 8) | body[1];
        const topic = _netTD.decode(body.subarray(2, 2 + tl));
        const payload = _netTD.decode(body.subarray(2 + tl));
        const fire = () => { if (this.onmessage) { try { this.onmessage(topic, payload); } catch (e) { console.error('[NET mqtt]', e); } } };
        const lag = (typeof window !== 'undefined' && window.__netTestLagMs) || 0; // 시험용 인공 지연(받은 순서 그대로)
        if (lag > 0) __hostSetTimeout(fire, lag); else fire();
      }
    }
  }
  subscribe(topic) { const id = this.pid++ & 0xffff; this._send(_mqttPacket(0x82, [id >> 8, id & 255, ..._mqttStr(topic), 0])); }
  publish(topic, text) { const t = _mqttStr(topic), p = _netTE.encode(text); const body = new Uint8Array(t.length + p.length); body.set(t); body.set(p, t.length); this._send(_mqttPacket(0x30, body)); }
  close() {
    if (this._ping) __hostClearInterval(this._ping);
    this.closed = true;
    try { this._send(Uint8Array.from([0xE0, 0])); } catch (e) { /* 무시 */ }
    try { if (this.ws) this.ws.close(); } catch (e) { /* 무시 */ }
  }
}

// ---------------- 자동 연결(직접 → 우회 중계) ----------------
class AutoNetClient {
  constructor() { this.url = ''; this.kind = 'auto'; this.handlers = new Map(); this.rtt = null; this.bytesOut = 0; this.closed = false; this.active = null; this.code = null; this.peer = null; this.mqtt = []; this.guest = null; this.myId = _netRandId(); this._timers = []; }
  get snapshotHz() { return this.kind === 'mqtt' ? 15 : undefined; }
  get bytesIn() { return (this._bytesIn || 0) + ((this.peer && this.peer.bytesIn) || 0); } // 102차: 받은 양(직접 연결 + 중계)
  on(type, fn) { this.handlers.set(type, fn); return this; }
  _emit(type, m) { if (this.closed && type !== 'close') return; const fn = this.handlers.get(type); if (fn) { try { fn(m); } catch (e) { console.error('[NET auto]', type, e); } } }
  _status(msg) { if (typeof _netStatus === 'function' && netState && netState.client === this) _netStatus(msg); }
  connect() { return Promise.resolve(this); } // 실제 연결은 create/join에서
  send(obj) {
    if (this.closed || !obj) return;
    if (obj.t === 'create') return this._create(obj.name || '방장');
    if (obj.t === 'join') return this._join(String(obj.code || '').toUpperCase().trim(), obj.name || '참가자');
    if (obj.t === 'msg') return this._sendMsg(obj.d);
    if (obj.t === 'kick') return this._kick();
  }
  sendMsg(d) { this._sendMsg(d); }
  backlog() { if (this.kind === 'p2p' && this.peer) return this.peer.backlog(); if (this.kind === 'mqtt' && this.guest && this.guest.link) return this.guest.link.backlog(); return 0; }
  _sendMsg(d) {
    if (this.kind === 'p2p' && this.peer) { this.peer.sendMsg(d); this.bytesOut = this.peer.bytesOut; return; }
    if (this.kind === 'mqtt' && this.guest && this.guest.link) { const text = JSON.stringify({ f: this.myId, to: this.role === 'host' ? this.guest.cid : undefined, t: 'msg', d }); this.bytesOut += text.length; this.guest.link.publish(this._topic(this.role === 'host' ? 'g' : 'h'), text); }
  }
  _topic(side) { return NET_MQTT_TOPIC + _netCodeHash(this.code) + '/' + side; }
  // ===== 방장 =====
  _create(name) {
    this.role = 'host'; this.name = name;
    this.code = typeof _netRandomCode === 'function' ? _netRandomCode() : Math.random().toString(36).slice(2, 6).toUpperCase();
    let announced = false;
    const announce = () => { if (!announced && !this.closed) { announced = true; this._emit('created', { code: this.code, ways: this._ways() }); } };
    // ① 직접 연결
    if (!_netP2pDisabled()) {
      const p = new PeerNetClient();
      this.peerHost = p;
      p.on('created', (m) => {
        if (m.code !== this.code) { // 방 코드가 이미 쓰이고 있었다 - 아직 알리기 전이면 새 코드로 중계도 다시 구독, 알린 뒤면 직접 연결은 포기
          if (announced) { p.handlers.clear(); p.close(); this.peerHost = null; return; }
          this.code = m.code; for (const l of this.mqtt) l.subscribe(this._topic('h'));
        }
        this.p2pReady = true; announce(); this._emit('ways', this._ways());
      });
      p.on('error', (m) => { this.p2pError = m.msg; });
      p.on('peer-join', (m) => { if (this.guest) { p.send({ t: 'kick' }); return; } this.kind = 'p2p'; this.peer = p; this.guest = { via: 'p2p' }; this._emit('peer-join', m); });
      p.on('peer-leave', () => { if (this.kind === 'p2p') { this.guest = null; this.peer = null; this.kind = 'auto'; this._emit('peer-leave', {}); } });
      p.on('msg', (d) => { if (this.kind === 'p2p') this._emit('msg', d); });
      p.connect().then(() => { if (!this.closed) p._create(name, 0, this.code); }).catch((e) => { this.p2pError = e.message; });
    }
    // ② 우회 중계 - 연결되는 중계소마다 같은 방 코드로 기다린다. 102차: 끊기면(와이파이가 잠깐 끊김 등) 방이 열려 있는 동안 다시 붙는다.
    for (const url of _netMqttBrokers()) this._hostLink(url, 0, announce);
    // 아무 길도 안 열리면 알린다
    this._timers.push(__hostSetTimeout(() => { if (!announced && !this.closed) this._emit('error', { msg: '방을 열지 못했습니다 - 인터넷 연결을 확인하세요 (로비의 "연결 테스트")' }); }, 15000));
    this._timers.push(__hostSetInterval(() => this._hostKeepAlive(), 2000));
  }
  _hostLink(url, tries, announce) {
    if (this.closed) return;
    const link = new MqttWs(url, 'lolsim-h-' + this.myId);
    link.connect().then(() => {
      if (this.closed) { link.close(); return; }
      this.mqtt.push(link);
      link.subscribe(this._topic('h'));
      link.onmessage = (topic, payload) => this._hostMqtt(link, payload);
      link.onclose = () => {
        this.mqtt = this.mqtt.filter((x) => x !== link);
        if (this.kind === 'mqtt' && this.guest && this.guest.link === link) { this.guest.link = null; this.guest.lostAt = __gcRealNow(); } // 참가자는 곧 같은 아이디로 다시 붙는다 - 9초 안에 오면 이어진다
        this._emit('ways', this._ways());
        if (!this.closed) this._timers.push(__hostSetTimeout(() => this._hostLink(url, 1, announce), 2000));
      };
      this._emit('ways', this._ways());
      // 직접 연결 준비가 늦으면(중개 서버가 막힌 네트워크) 중계만으로도 방을 연다
      __hostSetTimeout(announce, this.p2pReady || _netP2pDisabled() ? 0 : 4000);
    }).catch(() => { if (tries > 0 && !this.closed) this._timers.push(__hostSetTimeout(() => this._hostLink(url, tries + 1, announce), Math.min(15000, 2000 * tries))); }); // 처음부터 안 되는 중계소는 버린다
  }
  _ways() { return { p2p: !!this.p2pReady, relays: this.mqtt.length }; }
  _hostMqtt(link, payload) {
    let m; try { m = JSON.parse(payload); } catch (e) { return; }
    if (!m || m.f === this.myId) return;
    if (m.t === 'probe') { link.publish(this._topic('g'), JSON.stringify({ f: this.myId, to: m.f, t: 'probe-ok', at: m.at })); return; } // 102차: 길 재기(붙잡지 않음)
    if (m.t === 'join') {
      // 참가자가 다시 붙으면(새 연결 아이디) 예전 연결이 조용해진 지 2.5초가 넘었을 때 바꿔 준다
      if (this.guest && this.guest.via === 'mqtt' && this.guest.cid !== m.f && __gcRealNow() - this.guest.last > 2500) { this.guest = null; this.kind = 'auto'; this._emit('peer-leave', {}); }
      if (this.guest && !(this.guest.via === 'mqtt' && this.guest.cid === m.f)) { link.publish(this._topic('g'), JSON.stringify({ f: this.myId, to: m.f, t: 'error', msg: '방이 가득 참' })); return; }
      const again = this.guest && this.guest.cid === m.f;
      this.guest = { via: 'mqtt', cid: m.f, link, last: __gcRealNow() }; this.kind = 'mqtt';
      link.publish(this._topic('g'), JSON.stringify({ f: this.myId, to: m.f, t: 'joined', host: { name: this.name } }));
      if (!again) this._emit('peer-join', { name: String(m.name || '참가자').slice(0, 24) });
      return;
    }
    if (!this.guest || this.guest.via !== 'mqtt' || this.guest.cid !== m.f) return;
    this.guest.last = __gcRealNow();
    if (this.guest.link !== link) this.guest.link = link; // 102차: 다시 붙은(또는 다른) 중계소로 온다 - 답도 그쪽으로
    if (m.t === 'msg') this._emit('msg', m.d || {});
    else if (m.t === 'bye') { this.guest = null; this.kind = 'auto'; this._emit('peer-leave', {}); }
  }
  _hostKeepAlive() {
    if (this.kind !== 'mqtt' || !this.guest) return;
    if (this.guest.link) this.guest.link.publish(this._topic('g'), JSON.stringify({ f: this.myId, to: this.guest.cid, t: 'ka' }));
    if (__gcRealNow() - this.guest.last > 9000) { this.guest = null; this.kind = 'auto'; this._emit('peer-leave', {}); }
  }
  _kick() {
    if (this.kind === 'p2p' && this.peer) this.peer.send({ t: 'kick' });
    else if (this.kind === 'mqtt' && this.guest && this.guest.link) this.guest.link.publish(this._topic('g'), JSON.stringify({ f: this.myId, to: this.guest.cid, t: 'error', msg: '방장이 참가를 거절했습니다' }));
    this.guest = null; this.peer = null; this.kind = 'auto';
  }
  // ===== 참가자 =====
  // 102차: 모든 길을 동시에 잰다 - 직접 연결(P2P)과 모든 중계소에 붙어 "길 재기(probe)"를 보내고 방장의 답이 오는 왕복 시간을 잰다.
  // 처음 답이 온 뒤 1.2초(직접 연결이 아직 재는 중이면 시작부터 최대 5초)까지 기다려 가장 빠른 길로 참가한다(직접 연결은 30ms 덤).
  // 예전에는 직접 연결을 9초 기다린 뒤 중계소를 "차례로" 썼다 - 먼 중계소에 붙으면 핑이 수백 ms 늘었다.
  async _join(code, name) {
    this.role = 'guest'; this.name = name; this.code = code;
    // 다시 붙을 때도 같은 아이디(방 토큰에서) - 방장이 "같은 사람"으로 보고 바로 받아 준다(예전 연결이 아직 살아 있는 것으로 보여도)
    if (typeof netState !== 'undefined' && netState && netState.token) this.myId = 'g' + String(netState.token).slice(0, 12);
    this._status('방장을 찾는 중… (직접 연결·우회 중계를 동시에 재는 중)');
    const t0 = __gcRealNow(), cands = [], tries = [];
    let full = false, firstAt = 0, p2pPending = !_netP2pDisabled();
    const pick = await new Promise((resolve) => {
      let decided = false;
      const decide = () => {
        if (decided) return; decided = true;
        if (!cands.length) { resolve(null); return; }
        cands.sort((a, b) => (a.rtt - (a.kind === 'p2p' ? 30 : 0)) - (b.rtt - (b.kind === 'p2p' ? 30 : 0)));
        resolve(cands[0]);
      };
      const check = () => {
        if (decided || this.closed) { if (this.closed) decide(); return; }
        if (full) { decide(); return; }
        const now = __gcRealNow(), allDone = tries.every((t) => t.done);
        if (allDone) { decide(); return; }
        if (cands.length && now - firstAt >= 1200 && (!p2pPending || now - t0 >= 5000)) decide();
      };
      const add = (c) => { if (decided) { c.close(); return; } if (!firstAt) firstAt = __gcRealNow(); cands.push(c); this._status(`길 재는 중… ${cands.map((x) => x.label + ' ' + Math.round(x.rtt) + 'ms').join(' · ')}`); check(); };
      if (!_netP2pDisabled()) { const tr = { done: false }; tries.push(tr); this._probeP2p(code, name).then((c) => { tr.done = true; p2pPending = false; if (c) add(c); check(); }); }
      _netMqttBrokers().forEach((url) => { const tr = { done: false }; tries.push(tr); this._probeMqtt(url).then((c) => { tr.done = true; if (c === 'full') full = true; else if (c) add(c); check(); }); });
      const iv = __hostSetInterval(() => { check(); if (decided) __hostClearInterval(iv); }, 200);
      this._timers.push(iv, __hostSetTimeout(decide, 12000));
    });
    for (const c of cands) if (c !== pick) c.close(); // 안 쓰는 길은 닫는다
    if (this.closed) { if (pick) pick.close(); return; }
    if (!pick) {
      this._emit('error', { msg: full ? '방이 가득 참' : '방을 찾지 못했습니다 - 코드를 확인하거나 로비의 "연결 테스트"를 눌러 보세요' });
      this._emit('close', {}); return;
    }
    this.pathRtt = Math.round(pick.rtt); this.pathLabel = pick.label;
    this._status(`${pick.label}로 참가하는 중… (왕복 약 ${this.pathRtt}ms)`);
    pick.commit();
  }
  // 직접 연결: 데이터 채널을 열고(참가는 미룬다) 세 번 재서 가장 빠른 값. 실패하면 null.
  _probeP2p(code, name) {
    return new Promise((resolve) => {
      const p = new PeerNetClient(); p.deferJoin = true;
      let settled = false, best = Infinity, n = 0, committed = false;
      const fin = (c) => { if (settled) return; settled = true; if (!c) { p.handlers.clear(); p.close(); } resolve(c); };
      p.on('probe-ok', (m) => {
        best = Math.min(best, m.rtt); n++;
        if (n < 3) { __hostSetTimeout(() => p.probe(), 120); return; }
        fin({ kind: 'p2p', label: '직접 연결', rtt: best, close: () => { if (!committed) { p.handlers.clear(); p.close(); } }, commit: () => { committed = true; this._commitP2p(p); } });
      });
      p.on('conn-open', () => p.probe());
      p.on('error', (m) => { if (!settled) fin(null); else if (committed) this._emit('error', m); });
      p.on('close', () => { if (!settled) fin(null); else if (committed && this.kind === 'p2p') this._emit('close', {}); });
      p.on('room-closed', () => { if (committed && this.kind === 'p2p') this._emit('room-closed', {}); });
      p.on('msg', (d) => { if (committed && this.kind === 'p2p') this._emit('msg', d); });
      p.connect().then(() => p.send({ t: 'join', code, name })).catch(() => fin(null));
      this._timers.push(__hostSetTimeout(() => { if (n > 0) fin({ kind: 'p2p', label: '직접 연결', rtt: best, close: () => { if (!committed) { p.handlers.clear(); p.close(); } }, commit: () => { committed = true; this._commitP2p(p); } }); else fin(null); }, 9000));
    });
  }
  _commitP2p(p) {
    p.on('joined', (m) => { this.kind = 'p2p'; this.peer = p; this.guest = { via: 'p2p' }; this._emit('joined', m); });
    p.on('error', (m) => { if (!this.guest) { this._emit('error', m); if (m && m.msg === '방이 가득 참') this._emit('close', {}); } else this._emit('error', m); });
    p.on('close', () => { if (!this.guest || this.kind === 'p2p') this._emit('close', {}); });
    p.sendJoin();
  }
  // 중계소 하나: 붙고, 구독하고, 세 번 재서 가장 빠른 값. 방이 없거나(답 없음) 안 붙으면 null.
  _probeMqtt(url) {
    return new Promise((resolve) => {
      const link = new MqttWs(url, 'lolsim-g-' + this.myId + '-' + Math.random().toString(36).slice(2, 5));
      let settled = false, best = Infinity, n = 0, committed = false, onJoined = null;
      const host = url.replace(/^wss?:\/\//, '').replace(/[:/].*$/, '');
      const cand = () => ({ kind: 'mqtt', label: '우회 중계(' + host + ')', rtt: best, close: () => { if (!committed) link.close(); }, commit: () => { committed = true; this._commitMqtt(link, (j) => { onJoined = j; }); } });
      const fin = (c) => { if (settled) return; settled = true; if (!c) link.close(); resolve(c); };
      link.connect(5000).then(() => {
        if (this.closed) { fin(null); return; }
        link.subscribe(this._topic('g'));
        link.onmessage = (topic, payload) => {
          let m; try { m = JSON.parse(payload); } catch (e) { return; }
          if (!m || m.to !== this.myId) return;
          this._lastRecv = __gcRealNow();
          if (m.t === 'probe-ok') { if (settled) return; best = Math.min(best, __gcRealNow() - m.at); n++; if (n < 3) __hostSetTimeout(() => link.publish(this._topic('h'), JSON.stringify({ f: this.myId, t: 'probe', at: __gcRealNow() })), 120); else fin(cand()); return; }
          if (!committed) return;
          this._bytesIn = (this._bytesIn || 0) + payload.length;
          if (m.t === 'joined' && onJoined) { const j = onJoined; onJoined = null; j(m); return; }
          if (this.kind !== 'mqtt') { if (m.t === 'error') { this._emit('error', m); if (m.msg === '방이 가득 참') this._emit('close', {}); } return; }
          if (m.t === 'msg') this._emit('msg', m.d || {});
          else if (m.t === 'error') this._emit('error', m);
          else if (m.t === 'room-closed') { this._roomClosed = true; this._emit('room-closed', {}); }
        };
        link.onclose = () => { if (!settled) fin(null); else if (committed && this.kind === 'mqtt' && !this.closed) this._emit('close', {}); };
        // 구독이 자리 잡을 시간을 조금 주고 길 재기(답이 없으면 한 번 더)
        const ask = () => { if (!settled && !n) link.publish(this._topic('h'), JSON.stringify({ f: this.myId, t: 'probe', at: __gcRealNow() })); };
        __hostSetTimeout(ask, 250); __hostSetTimeout(ask, 1500);
        __hostSetTimeout(() => { if (n > 0) fin(cand()); else fin(null); }, 4000);
      }).catch(() => fin(null));
    });
  }
  _commitMqtt(link, setOnJoined) {
    const ask = () => { if (this.kind !== 'mqtt' && !this.closed) link.publish(this._topic('h'), JSON.stringify({ f: this.myId, t: 'join', name: this.name })); };
    setOnJoined((m) => { this.kind = 'mqtt'; this.guest = { via: 'mqtt', link }; this._startGuestKeepAlive(); this._emit('joined', m); });
    ask(); this._timers.push(__hostSetTimeout(ask, 1500), __hostSetTimeout(() => { if (this.kind !== 'mqtt' && !this.closed) { this._emit('error', { msg: '방장이 답하지 않습니다 - 다시 시도하세요' }); this._emit('close', {}); } }, 6000));
  }
  _startGuestKeepAlive() {
    this._lastRecv = __gcRealNow();
    this._timers.push(__hostSetInterval(() => {
      if (this.kind !== 'mqtt' || !this.guest || this.closed) return;
      this.guest.link.publish(this._topic('h'), JSON.stringify({ f: this.myId, t: 'ka' }));
      if (__gcRealNow() - this._lastRecv > 9000) { const l = this.guest.link; this.guest = null; this.kind = 'auto'; l.close(); this._emit('close', {}); }
    }, 2000));
  }
  close() {
    if (this.closed) return;
    // 상대에게 알리고 닫는다
    if (this.kind === 'mqtt' && this.guest && this.guest.link) {
      const msg = this.role === 'host' ? { f: this.myId, to: this.guest.cid, t: 'room-closed' } : { f: this.myId, t: 'bye' };
      try { this.guest.link.publish(this._topic(this.role === 'host' ? 'g' : 'h'), JSON.stringify(msg)); } catch (e) { /* 무시 */ }
    }
    this.closed = true;
    for (const t of this._timers) { __hostClearTimeout(t); __hostClearInterval(t); }
    const links = [...this.mqtt, ...(this.guest && this.guest.link ? [this.guest.link] : [])];
    __hostSetTimeout(() => { for (const l of links) l.close(); }, 200);
    if (this.peer) this.peer.close();
    if (this.peerHost && this.peerHost !== this.peer) this.peerHost.close();
    this.handlers.clear();
  }
}

// ---------------- 연결 테스트(로비) ----------------
// 직접 연결 중개 서버(PeerJS)에 닿는지, 우회 중계소마다 닿는지·응답 시간을 잰다. 결과: [{ name, ok, ms, note }]
async function netConnectionTest(onStep) {
  const out = [];
  const step = (r) => { out.push(r); if (onStep) onStep(out.slice()); };
  // ① 직접 연결 중개
  if (!_netP2pDisabled()) {
    const t0 = __gcRealNow();
    const ok = await new Promise((resolve) => {
      _netLoadPeerJs().then(() => {
        let peer; try { peer = new window.Peer(Object.assign({ debug: 0 }, window.__netPeerOptions || {})); } catch (e) { resolve(false); return; }
        const fin = (v) => { try { peer.destroy(); } catch (e) { /* 무시 */ } resolve(v); };
        peer.on('open', () => fin(true)); peer.on('error', () => fin(false));
        __hostSetTimeout(() => fin(false), 6000);
      }).catch(() => resolve(false));
    });
    step({ name: '직접 연결(WebRTC) 중개 서버', ok, ms: Math.round(__gcRealNow() - t0), note: ok ? '같은 와이파이라도 기기끼리 직접 통신을 막으면 실패할 수 있어요 - 그땐 자동으로 우회 중계로 갑니다' : '막혀 있음 - 우회 중계로 연결됩니다' });
  }
  // ② 우회 중계소
  for (const url of _netMqttBrokers()) {
    const t0 = __gcRealNow();
    const link = new MqttWs(url, 'lolsim-t-' + _netRandId());
    const ok = await link.connect(5000).then(() => true, () => false);
    link.close();
    step({ name: '우회 중계 ' + url.replace(/^wss?:\/\//, '').replace(/\/.*$/, ''), ok, ms: Math.round(__gcRealNow() - t0) });
  }
  return out;
}
if (typeof window !== 'undefined') { window.netConnectionTest = netConnectionTest; }
