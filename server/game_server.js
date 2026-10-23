#!/usr/bin/env node
/* server/game_server.js — 104차: 전용 게임 서버
 *
 * 왜: 방장 브라우저가 판정하는 방식(97~103차)은 방장만 지연이 없고, 방장이 나가면 판이 끝나고, 공개 무료 중계소에 기대고, 1:1만 됐다.
 * 이제 이 서버가 판마다 "시뮬레이션 브라우저"(머리 없는 Chromium에서 같은 게임 코드를 화면 없이 돌린다 - index.html?sim=…)를 띄워
 * 판정을 맡긴다. 플레이어는 모두 같은 자격의 참가자다(모두 서버까지의 왕복 지연만 갖는다 - 원작과 같은 구조).
 *  - 같은 게임 코드를 그대로 쓰므로 규칙·챔피언·아이템이 한 줄도 갈라지지 않는다.
 *  - 1:1 ~ 5:5. 플레이어가 나갔다 들어와도(같은 브라우저 토큰) 이어서 한다. 한 팀이 모두 1분 넘게 돌아오지 않으면 기권패.
 *  - 방 코드 + 서버만 아는 시뮬레이션 열쇠: 시뮬레이션 자리는 서버가 띄운 페이지만 차지할 수 있다.
 *
 * 실행: node server/game_server.js [--port 8787]
 *   필요: Node 18+, playwright(npm i playwright) 와 Chromium(npx playwright install chromium) - 또는 Dockerfile(server/Dockerfile).
 *   환경 변수: PORT, MAX_ROOMS(동시에 돌릴 판 수, 기본 3), CHROMIUM_PATH(이미 있는 Chromium), THREE_DIR(three.js를 CDN 대신 이 폴더에서 - 시험용)
 *
 * 메시지(JSON 텍스트, /ws) - 플레이어
 *   → {t:'dcreate', name, size}     방 만들기(size = 팀당 인원 1~5) → {t:'creating', code} … 시뮬레이션이 준비되면 {t:'joined', code, host:{name}}
 *   → {t:'join', code, name}        참가 → {t:'joined', …}
 *   → {t:'msg', d}                  시뮬레이션에게 {t:'msg', from: 내 pid, d}
 *   → {t:'ping', at} → {t:'pong', at}
 *   ← {t:'msg', d} {t:'error', msg} {t:'room-closed'}
 * 시뮬레이션 페이지
 *   → {t:'sim', code, key}          자리 차지 → 대기 중인 플레이어들을 들인다
 *   → {t:'msg', to, d}              to = pid(문자) / pid 배열 / 없으면 방 전체
 *   → {t:'kick', pid, msg}          그 플레이어를 방에서 내보낸다
 *   ← {t:'peer-join', pid, name} {t:'peer-leave', pid} {t:'msg', from, d}
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WsConn, WS_GUID, CONTENT_TYPES, ROOT } = require('./relay.js');

const ROOM_IDLE_MS = 90000;      // 아무도 없는 방은 90초 뒤 닫는다
const SIM_BOOT_MS = 90000;       // 시뮬레이션이 이 안에 자리를 차지하지 못하면 실패
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';

// 기본 시뮬레이션 실행기: Playwright로 머리 없는 Chromium 한 개를 띄우고 판마다 페이지 하나(화면을 그리지 않는다).
function playwrightLauncher({ log }) {
  let browserP = null;
  return async (room, { simUrl }) => {
    const pw = require(process.env.PLAYWRIGHT || 'playwright');
    if (!browserP) {
      const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
      browserP = pw.chromium.launch({ headless: true, executablePath: exe,
        args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage',
          '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
      browserP.catch((e) => { log('Chromium을 띄우지 못했습니다: ' + e.message); browserP = null; });
    }
    const browser = await browserP;
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log(`[sim ${room.code}] 오류 ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') log(`[sim ${room.code}] ${m.text().slice(0, 300)}`); });
    await page.goto(simUrl, { waitUntil: 'load', timeout: 120000 });
    return { page, close: () => ctx.close().catch(() => {}) };
  };
}

function createGameServer({ root = ROOT, log = () => {}, launchSim = null, maxRooms = Number(process.env.MAX_ROOMS) || 3, lagMs = 0, threeDir = process.env.THREE_DIR || '', simBase = '' } = {}) {
  const rooms = new Map(); // code → room
  const badJoins = new Map(); // 주소 → 틀린 코드를 넣은 시각들
  const conns = new Set();
  const launcher = launchSim || playwrightLauncher({ log });
  const send = (conn, obj) => { if (conn && !conn.closed) conn.send(JSON.stringify(obj)); };
  const sendText = (conn, text) => { if (!conn || conn.closed) return; if (lagMs > 0) setTimeout(() => { if (!conn.closed) conn.send(text); }, lagMs); else conn.send(text); };
  const newCode = () => { for (let i = 0; i < 1000; i++) { let c = ''; for (let k = 0; k < 4; k++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]; if (!rooms.has(c)) return c; } return null; };
  const closeRoom = (room, why) => {
    if (room.closed) return; room.closed = true;
    rooms.delete(room.code);
    for (const c of room.players.values()) { send(c, { t: 'room-closed', msg: why }); c.room = null; }
    for (const c of room.pending) send(c, { t: 'error', msg: why });
    if (room.sim) { room.sim.room = null; room.sim.close(1000, 'room closed'); }
    if (room.handle) room.handle.close();
    log(`방 닫힘 ${room.code} (${why})`);
  };
  const admit = (room, conn) => {
    const pid = 'p' + (++room.seq);
    conn.pid = pid; conn.room = room; room.players.set(pid, conn); room.emptySince = 0;
    send(conn, { t: 'joined', code: room.code, host: { name: '전용 서버' }, pid });
    send(room.sim, { t: 'peer-join', pid, name: conn.name });
    log(`참가 ${room.code} ${pid} ${conn.name}`);
  };
  const leave = (conn) => {
    const room = conn.room; if (!room) { for (const r of rooms.values()) r.pending = r.pending.filter((c) => c !== conn); return; }
    conn.room = null;
    if (conn.isSim) { closeRoom(room, '서버의 대전이 멈췄습니다'); return; }
    room.players.delete(conn.pid);
    send(room.sim, { t: 'peer-leave', pid: conn.pid });
  };
  const startRoom = (conn, m) => {
    if (rooms.size >= maxRooms) return send(conn, { t: 'error', msg: `서버가 꽉 찼습니다(동시에 ${maxRooms}판) - 잠시 뒤 다시 시도하세요` });
    const code = newCode(); if (!code) return send(conn, { t: 'error', msg: '방을 더 만들 수 없음' });
    const size = Math.max(1, Math.min(5, Math.floor(Number(m.size) || 1)));
    const room = { code, key: crypto.randomBytes(12).toString('hex'), size, sim: null, handle: null, players: new Map(), pending: [conn], seq: 0, createdAt: Date.now(), emptySince: 0, closed: false };
    rooms.set(code, room);
    conn.name = String(m.name || '플레이어').slice(0, 24);
    send(conn, { t: 'creating', code, size });
    log(`방 만듦 ${code} (${size}:${size}) - 시뮬레이션 띄우는 중`);
    const port = server.address().port;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;
    const simUrl = `${simBase || `http://127.0.0.1:${port}`}/index.html?nolobby&sim=${code}&key=${room.key}&size=${size}&ws=${encodeURIComponent(wsUrl)}`;
    Promise.resolve(launcher(room, { simUrl, wsUrl, port })).then((h) => { room.handle = h; if (room.closed && h) h.close(); })
      .catch((e) => { log(`시뮬레이션 실패 ${code}: ${e.message}`); closeRoom(room, '서버가 대전을 준비하지 못했습니다'); });
  };
  const onMessage = (conn, text) => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (conn.isSim) {
      const room = conn.room; if (!room) return;
      if (m.t === 'msg') {
        const text2 = JSON.stringify({ t: 'msg', d: m.d });
        const targets = m.to == null ? [...room.players.values()] : (Array.isArray(m.to) ? m.to : [m.to]).map((p) => room.players.get(p)).filter(Boolean);
        for (const c of targets) sendText(c, text2);
      } else if (m.t === 'kick') {
        const c = room.players.get(m.pid); if (!c) return;
        room.players.delete(m.pid); c.room = null; send(c, { t: 'error', msg: m.msg || '서버가 참가를 거절했습니다' });
      } else if (m.t === 'close') closeRoom(room, m.msg || '대전이 끝났습니다');
      return;
    }
    switch (m.t) {
      case 'sim': {
        const room = rooms.get(String(m.code || '')); if (!room || room.sim || m.key !== room.key) { send(conn, { t: 'error', msg: '시뮬레이션 자리가 아님' }); conn.close(1008, 'bad sim'); return; }
        conn.isSim = true; conn.room = room; room.sim = conn;
        send(conn, { t: 'created', code: room.code, size: room.size });
        log(`시뮬레이션 준비 ${room.code} (${Math.round((Date.now() - room.createdAt) / 1000)}초)`);
        const waiting = room.pending; room.pending = [];
        for (const c of waiting) if (!c.closed) admit(room, c);
        return;
      }
      case 'dcreate': leave(conn); return startRoom(conn, m);
      case 'create': return send(conn, { t: 'error', msg: '전용 서버에서는 dcreate로 방을 만듭니다' });
      case 'join': {
        // 방 코드 무작위 대입 막기: 한 주소에서 1분에 틀린 코드 10번까지
        const ip = conn.ip || '', now = Date.now(), tries = (badJoins.get(ip) || []).filter((x) => now - x < 60000);
        if (tries.length >= 10) { badJoins.set(ip, tries); return send(conn, { t: 'error', msg: '잘못된 코드를 너무 많이 넣었습니다 - 1분 뒤 다시 시도하세요' }); }
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { tries.push(now); badJoins.set(ip, tries); return send(conn, { t: 'error', msg: '방이 없음' }); }
        leave(conn);
        conn.name = String(m.name || '플레이어').slice(0, 24);
        if (!room.sim) { room.pending.push(conn); return send(conn, { t: 'creating', code: room.code, size: room.size }); }
        return admit(room, conn);
      }
      case 'msg': {
        const room = conn.room; if (!room || !room.sim) return;
        sendText(room.sim, JSON.stringify({ t: 'msg', from: conn.pid, d: m.d }));
        return;
      }
      case 'ping': return send(conn, { t: 'pong', at: m.at });
      case 'leave': return leave(conn);
      default: return send(conn, { t: 'error', msg: `모르는 메시지 ${m.t}` });
    }
  };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`ok rooms=${rooms.size}/${maxRooms}`); }
    if (url === '/status') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, maxRooms, kind: 'dedicated' })); }
    let p;
    if (threeDir && url.startsWith('/vendor/three/')) p = path.join(threeDir, url.slice('/vendor/three/'.length));
    else { p = path.normalize(path.join(root, url === '/' ? 'index.html' : url)); if (!p.startsWith(root)) { res.writeHead(403); return res.end(); } }
    fs.stat(p, (err, st) => {
      if (!err && st.isDirectory()) p = path.join(p, 'index.html');
      fs.readFile(p, (e2, data) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        if (threeDir && (url === '/' || url.endsWith('index.html'))) data = Buffer.from(data.toString('utf8').split(THREE_CDN + 'build/').join('/vendor/three/build/').split(THREE_CDN + 'examples/jsm/').join('/vendor/three/examples/jsm/'));
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
    conn.ip = String(req.headers['x-forwarded-for'] || socket.remoteAddress || '').split(',')[0].trim();
    conns.add(conn);
    conn.onmessage = (text) => { try { onMessage(conn, text); } catch (e) { log('메시지 처리 오류 ' + e.message); } };
    conn.onclose = () => { conns.delete(conn); leave(conn); };
  });
  const hb = setInterval(() => {
    for (const c of conns) { if (!c.alive) { c.close(1001, 'timeout'); continue; } c.alive = false; c.ping(); }
    const now = Date.now();
    for (const [ip, a] of badJoins) if (!a.some((x) => now - x < 60000)) badJoins.delete(ip);
    for (const room of [...rooms.values()]) {
      if (!room.sim && now - room.createdAt > SIM_BOOT_MS) { closeRoom(room, '서버가 대전을 준비하지 못했습니다(시간 초과)'); continue; }
      if (room.players.size || room.pending.length) { room.emptySince = 0; continue; }
      if (!room.emptySince) room.emptySince = now;
      else if (now - room.emptySince > ROOM_IDLE_MS) closeRoom(room, '아무도 없어 닫음');
    }
  }, 5000);
  hb.unref();
  server.on('close', () => { clearInterval(hb); for (const room of [...rooms.values()]) closeRoom(room, '서버 종료'); for (const c of conns) c.close(1001, 'server closing'); });
  server.rooms = rooms;
  return server;
}

if (require.main === module) {
  const i = process.argv.indexOf('--port');
  const port = Number(i > 0 ? process.argv[i + 1] : process.env.PORT) || 8787;
  const server = createGameServer({ log: (s) => console.log(`[game] ${s}`) });
  server.listen(port, () => console.log(`[game] 전용 서버 http://localhost:${port}/  (웹소켓: ws://localhost:${port}/ws, 동시에 ${Number(process.env.MAX_ROOMS) || 3}판)`));
}
module.exports = { createGameServer, playwrightLauncher };
