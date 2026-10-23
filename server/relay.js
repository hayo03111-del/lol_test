#!/usr/bin/env node
/* server/relay.js — 97차: 온라인 대전 중계 서버(의존성 없음, Node 18+)
 *
 * 하는 일
 *  - 웹소켓(/ws): 방 만들기·참가(4자리 코드)와 메시지 중계만 한다. 게임 규칙은 모른다 - 한 판의 시뮬레이션은 방장(호스트) 브라우저가 돌리고,
 *    참가자(게스트)는 명령을 보내고 상태(스냅샷)를 받는다(src/net/). 서버는 받은 메시지를 상대에게 그대로 넘긴다.
 *  - HTTP: 저장소 폴더를 정적으로 내보낸다 - `node server/relay.js` 하나로 같은 주소에서 게임 페이지와 중계 서버를 같이 쓸 수 있다
 *    (같은 컴퓨터·같은 네트워크에서 바로 대전). GitHub Pages 같은 정적 호스팅에 올린 페이지에서는 이 서버의 주소(wss://…/ws)를 입력해 쓴다.
 *
 * 실행: node server/relay.js [--port 8787]   (환경 변수 PORT도 됨)
 *
 * 메시지(JSON 텍스트)
 *   → {t:'create', name}               방 만들기(보낸 쪽 = 호스트) → {t:'created', code}
 *   → {t:'join', code, name}           방 참가(게스트)              → {t:'joined', code, host:{name}} / 호스트에게 {t:'peer-join', name}
 *   → {t:'msg', d}                     상대에게 {t:'msg', d}로 전달(호스트 → 게스트, 게스트 → 호스트)
 *   → {t:'ping', at}                   → {t:'pong', at}(지연 측정)
 *   → {t:'kick'}                       방장만: 참가자를 방에서 내보낸다(98차)
 *   ← {t:'peer-leave'} 상대가 나감, {t:'room-closed'} 호스트가 나가 방이 닫힘, {t:'error', msg}
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const HEARTBEAT_MS = 20000;
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.dds': 'image/vnd-ms.dds', '.tex': 'application/octet-stream', '.md': 'text/plain; charset=utf-8',
};

// ---------------- 웹소켓(RFC 6455) 최소 구현 ----------------
class WsConn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null; this.closed = false; this.alive = true;
    this.onmessage = null; this.onclose = null;
    socket.on('data', (d) => this._data(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _closed() { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(); }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const hi = this.buf.readUInt32BE(2); len = hi * 2 ** 32 + this.buf.readUInt32BE(6); off = 10; }
      if (len > MAX_MESSAGE_BYTES) return this.close(1009, 'too big');
      if (!masked) return this.close(1002, 'client frames must be masked');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.slice(off, off + 4);
      const payload = Buffer.from(this.buf.slice(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.slice(off + 4 + len);
      this._frame(fin, op, payload);
      if (this.closed) return;
    }
  }
  _frame(fin, op, payload) {
    if (op === 0x8) { this.close(1000, ''); return; }
    if (op === 0x9) { this._send(0xA, payload); return; }
    if (op === 0xA) { this.alive = true; return; }
    if (op === 0x1 || op === 0x2) { this.frag = { op, parts: [payload], size: payload.length }; }
    else if (op === 0x0 && this.frag) { this.frag.parts.push(payload); this.frag.size += payload.length; }
    else return;
    if (this.frag.size > MAX_MESSAGE_BYTES) return this.close(1009, 'too big');
    if (!fin) return;
    const msg = Buffer.concat(this.frag.parts); const kind = this.frag.op; this.frag = null;
    if (kind === 0x1 && this.onmessage) this.onmessage(msg.toString('utf8'));
  }
  _send(op, payload) {
    if (this.closed) return;
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeUInt32BE(Math.floor(len / 2 ** 32), 2); head.writeUInt32BE(len >>> 0, 6); }
    head[0] = 0x80 | op;
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(text) { this._send(0x1, Buffer.from(text, 'utf8')); }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason)); p.writeUInt16BE(code, 0); p.write(reason, 2);
    try { this._send(0x8, p); } catch (e) { /* 이미 끊김 */ }
    try { this.socket.end(); } catch (e) { /* 이미 끊김 */ }
    this._closed();
  }
}

// ---------------- 방 ----------------
// lagMs: 시험용 인공 지연 - 중계하는 메시지마다 이만큼 늦게 넘긴다(한쪽 방향). 순서는 그대로다. 환경 변수 RELAY_LAG_MS로도 켤 수 있다.
// bwBytesPerSec(102차): 시험용 좁은 길 - 받는 쪽마다 초당 이 바이트만큼만 흘려보낸다(넘치면 줄을 서서 늦어진다 = 약한 와이파이·붐비는 중계소). RELAY_BW로도 켠다.
function createRelayServer({ root = ROOT, log = () => {}, lagMs = 0, bwBytesPerSec = 0 } = {}) {
  const rooms = new Map(); // code → { host, guest, createdAt }
  const conns = new Set();
  const newCode = () => {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let tries = 0; tries < 1000; tries++) {
      let c = ''; for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
      if (!rooms.has(c)) return c;
    }
    return null;
  };
  const send = (conn, obj) => { if (conn && !conn.closed) conn.send(JSON.stringify(obj)); };
  const leave = (conn) => {
    const room = conn.room; if (!room) return;
    conn.room = null;
    if (room.host === conn) {
      if (room.guest) { send(room.guest, { t: 'room-closed' }); room.guest.room = null; }
      rooms.delete(room.code);
      log(`방 닫힘 ${room.code}`);
    } else if (room.guest === conn) {
      room.guest = null;
      send(room.host, { t: 'peer-leave' });
      log(`게스트 나감 ${room.code}`);
    }
  };
  const onMessage = (conn, text) => {
    let m; try { m = JSON.parse(text); } catch (e) { return send(conn, { t: 'error', msg: 'JSON이 아님' }); }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'create': {
        leave(conn);
        const code = newCode(); if (!code) return send(conn, { t: 'error', msg: '방을 더 만들 수 없음' });
        const room = { code, host: conn, guest: null, createdAt: Date.now() };
        rooms.set(code, room); conn.room = room; conn.name = String(m.name || '호스트').slice(0, 24);
        log(`방 만듦 ${code}`);
        return send(conn, { t: 'created', code });
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(conn, { t: 'error', msg: '방이 없음' });
        if (room.guest && room.guest !== conn) return send(conn, { t: 'error', msg: '방이 가득 참' });
        if (room.host === conn) return send(conn, { t: 'error', msg: '자기 방에는 참가할 수 없음' });
        leave(conn);
        room.guest = conn; conn.room = room; conn.name = String(m.name || '게스트').slice(0, 24);
        log(`참가 ${code}`);
        send(conn, { t: 'joined', code, host: { name: room.host.name } });
        return send(room.host, { t: 'peer-join', name: conn.name });
      }
      case 'msg': {
        const room = conn.room; if (!room) return send(conn, { t: 'error', msg: '방에 없음' });
        const to = room.host === conn ? room.guest : room.host;
        if (bwBytesPerSec > 0 && to) { // 줄 서기: 앞 메시지가 다 흘러간 뒤에야 다음 것이 나간다
          const text = JSON.stringify({ t: 'msg', d: m.d }), now = Date.now();
          to._busyUntil = Math.max(now, to._busyUntil || 0) + (text.length / bwBytesPerSec) * 1000;
          setTimeout(() => { if (!to.closed) to.send(text); }, to._busyUntil - now + lagMs); return;
        }
        if (lagMs > 0) { const text = JSON.stringify({ t: 'msg', d: m.d }); setTimeout(() => { if (to && !to.closed) to.send(text); }, lagMs); return; }
        return send(to, { t: 'msg', d: m.d });
      }
      case 'kick': { // 98차: 방장이 참가자를 내보낸다(진행 중인 대전에 다른 사람이 들어왔을 때)
        const room = conn.room; if (!room || room.host !== conn || !room.guest) return;
        const g = room.guest; room.guest = null; g.room = null;
        return send(g, { t: 'error', msg: '방장이 참가를 거절했습니다' });
      }
      case 'ping': return send(conn, { t: 'pong', at: m.at });
      case 'leave': return leave(conn);
      default: return send(conn, { t: 'error', msg: `모르는 메시지 ${m.t}` });
    }
  };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`ok rooms=${rooms.size}`); }
    let p = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
    if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.stat(p, (err, st) => {
      if (!err && st.isDirectory()) p = path.join(p, 'index.html');
      fs.readFile(p, (e2, data) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(data);
      });
    });
  });
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if ((req.url || '').split('?')[0] !== '/ws' || !key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
    socket.setNoDelay(true);
    const conn = new WsConn(socket);
    conns.add(conn);
    conn.onmessage = (text) => { try { onMessage(conn, text); } catch (e) { log('메시지 처리 오류 ' + e.message); } };
    conn.onclose = () => { conns.delete(conn); leave(conn); };
  });
  const hb = setInterval(() => {
    for (const c of conns) { if (!c.alive) { c.close(1001, 'timeout'); continue; } c.alive = false; c.ping(); }
  }, HEARTBEAT_MS);
  hb.unref();
  server.on('close', () => { clearInterval(hb); for (const c of conns) c.close(1001, 'server closing'); });
  server.rooms = rooms;
  return server;
}

if (require.main === module) {
  const i = process.argv.indexOf('--port');
  const port = Number(i > 0 ? process.argv[i + 1] : process.env.PORT) || 8787;
  const server = createRelayServer({ log: (s) => console.log(`[relay] ${s}`), lagMs: Number(process.env.RELAY_LAG_MS) || 0, bwBytesPerSec: Number(process.env.RELAY_BW) || 0 });
  server.listen(port, () => console.log(`[relay] http://localhost:${port}/  (웹소켓: ws://localhost:${port}/ws)`));
}
module.exports = { createRelayServer, WsConn, WS_GUID, CONTENT_TYPES, ROOT };
