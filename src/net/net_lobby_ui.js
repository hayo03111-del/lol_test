/* net_lobby_ui.js — 99차: 온라인 대전 로비·픽창
 *
 * 로비 화면(lobby_ui.js, #lobbyOverlay) 위에 "연습 / 온라인 1:1" 탭을 붙인다.
 *  - 온라인 탭: 서버 주소·이름 → "방 만들기"(4자리 코드·초대 링크) 또는 "참가"(코드). 대기실에서 두 사람(파랑 방장·빨강 참가자)을 보여 준다.
 *  - 둘이 모이면 픽창: 로비의 챔피언·룬·소환사 주문 고르기를 그대로 쓰고, 위쪽 줄에 남은 시간·내 선택·상대 선택(실시간)·확정 여부를 보인다.
 *    "게임 시작" 버튼은 "확정"이 된다. 둘 다 확정하면(또는 시간이 다 되면) 각자 고른 챔피언을 불러와 대전이 시작된다(net_session.js).
 *  - 게임 화면 왼쪽 위 "온라인 대전" 버튼, 연습 도구의 "온라인 대전 로비 열기", 초대 링크(?room=코드&server=주소)로 들어온다.
 * 게임 규칙·통신은 net_session.js가 한다 - 여기는 화면만.
 */
let _netLobbyMode = 'practice';
function netLobbyCurrentMode() { return _netLobbyMode; }
const _NL_STORE = { url: 'netServerUrl', name: 'netName', ded: 'netDedicatedUrl', useDed: 'netUseDedicated', size: 'netDedicatedSize' };
// 104차: 전용 서버 기본 주소 - 서버를 배포하면 여기에 wss://…/ws 를 적어 두면 모두가 따로 입력하지 않아도 된다(README 104차 "배포").
const NET_DEDICATED_DEFAULT_URL = '';
function _nlGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function _nlSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } }
function _nlEl(id) { return document.getElementById(id); }

(function buildNetLobbyUi() {
  if (typeof document === 'undefined') return;
  const ov = _nlEl('lobbyOverlay'); if (!ov) return;
  const head = ov.querySelector('.lb-head'), body = ov.querySelector('.lb-body');
  // 탭
  const tabs = document.createElement('div'); tabs.className = 'lb-tabs';
  tabs.innerHTML = '<button type="button" id="lbTabPractice" class="sel">연습</button><button type="button" id="lbTabOnline">온라인 대전</button>';
  head.appendChild(tabs);
  // 픽창 위쪽 줄
  const bar = document.createElement('div'); bar.id = 'netPickBar';
  bar.innerHTML = '<div class="np-card blue" id="npMine"></div><div class="np-mid"><div class="np-timer" id="npTimer">90</div><div class="np-info" id="npInfo">챔피언을 고르고 확정하세요</div>'
    + '<div class="np-ded" id="npDedBtns" style="display:none"><button type="button" id="npTeamBtn">팀 바꾸기</button><button type="button" id="npStartBtn">지금 시작</button><button type="button" id="npCopyLink">초대 링크</button></div></div>'
    + '<div class="np-card red" id="npOpp"></div><button type="button" id="npLeave">방 나가기</button>';
  head.after(bar);
  // 방 만들기·참가·대기실
  const panel = document.createElement('section'); panel.id = 'netLobbyPanel';
  panel.innerHTML = `<div class="nl-wrap">
    <div class="nl-card" id="nlConnect">
      <h3>온라인 1:1 대전</h3>
      <div class="nl-help">
        <b>1.</b> 한 사람이 <b>방 만들기</b> → 나온 코드(또는 초대 링크)를 상대에게 보냅니다.<br>
        <b>2.</b> 상대가 이 페이지에서 코드를 넣고 <b>참가</b> → 챔피언을 고르고 확정하면 시작합니다.<br>
        설치할 것도, 켜 둘 서버도 없습니다. 먼저 두 브라우저를 직접 잇고(WebRTC), 학교·회사 와이파이처럼 직접 연결이 막히면 자동으로 <b>우회 중계</b>로 갑니다.
      </div>
      <div class="nl-row" id="nlRecentRow" style="display:none"><button type="button" id="nlRecent" style="flex:1"></button></div>
      <label>내 이름<input id="netName" maxlength="24" placeholder="이름"></label>
      <div class="nl-ded" id="nlDed">
        <label class="nl-check"><input type="checkbox" id="netUseDed"> <b>전용 서버</b>로 하기 - 모두 지연이 같고(방장 없음), 1:1 ~ 5:5, 누가 나가도 판이 이어짐</label>
        <div id="nlDedOpts">
          <label>전용 서버 주소<input id="netDedUrl" placeholder="wss://내서버.onrender.com/ws  (node server/game_server.js)"></label>
          <label>인원(방 만들 때)<select id="netDedSize"><option value="1">1 : 1</option><option value="2">2 : 2</option><option value="3">3 : 3</option><option value="4">4 : 4</option><option value="5">5 : 5</option></select></label>
          <div class="nl-help" id="nlDedInfo"></div>
        </div>
      </div>
      <div class="nl-row"><button type="button" id="netCreateBtn" class="primary">방 만들기</button></div>
      <div class="nl-row"><input id="netJoinCode" maxlength="300" placeholder="방 코드 4자리 (초대 링크를 붙여 넣어도 됨)" style="text-transform:uppercase;letter-spacing:.2em" autocomplete="off"><button type="button" id="netJoinBtn">참가</button></div>
      <div class="nl-row"><button type="button" id="nlTestBtn">연결 테스트 (학교·회사 와이파이 확인)</button></div>
      <div id="nlTestOut" class="nl-help" style="display:none"></div>
      <details class="nl-adv"><summary>고급: 직접 켠 중계 서버 쓰기</summary>
        <label>중계 서버 주소(비우면 브라우저끼리 직접 연결)<input id="netServerUrl" placeholder="ws://주소:8787/ws  (node server/relay.js)"></label>
      </details>
    </div>
    <div class="nl-card" id="nlRoom" style="display:none">
      <h3 id="nlRoomTitle">대기실</h3>
      <div class="nl-code" id="nlCode">----</div>
      <div class="nl-row" style="justify-content:center"><button type="button" id="nlCopyCode">코드 복사</button><button type="button" id="nlCopyLink">초대 링크 복사</button></div>
      <div class="nl-players"><div class="nl-player blue" id="nlBlue">파랑(방장)</div><div class="nl-player red empty" id="nlRed">빨강 - 기다리는 중…</div></div>
      <div class="nl-row" style="justify-content:center"><button type="button" id="nlBackToGame" style="display:none">대전 화면으로</button><button type="button" id="nlLeave">방 나가기</button></div>
    </div>
    <div class="nl-status" id="netStatus"></div>
  </div>`;
  head.after(panel);
  // 게임 화면 버튼
  const gb = document.createElement('button'); gb.id = 'netLobbyBtn'; gb.type = 'button'; gb.textContent = '온라인 대전';
  gb.addEventListener('click', () => {
    if (typeof netMatchActive === 'function' && netMatchActive()) { openNetLobby(); return; }
    openNetLobby();
  });
  document.body.appendChild(gb);

  _nlEl('lbTabPractice').addEventListener('click', () => {
    if (netState && netState.pick) { if (typeof showSkillToast === 'function') showSkillToast('챔피언 선택 중에는 연습으로 갈 수 없습니다 - 방을 나가면 됩니다'); return; }
    netLobbyMode('practice');
  });
  _nlEl('lbTabOnline').addEventListener('click', () => netLobbyMode('online'));
  const urlEl = _nlEl('netServerUrl'), nameEl = _nlEl('netName'), codeEl = _nlEl('netJoinCode');
  const dedEl = _nlEl('netUseDed'), dedUrlEl = _nlEl('netDedUrl'), dedSizeEl = _nlEl('netDedSize');
  urlEl.value = _nlGet(_NL_STORE.url);
  nameEl.value = _nlGet(_NL_STORE.name);
  dedUrlEl.value = _nlGet(_NL_STORE.ded) || NET_DEDICATED_DEFAULT_URL;
  dedEl.checked = _nlGet(_NL_STORE.useDed) === '1' || (!_nlGet(_NL_STORE.useDed) && !!dedUrlEl.value);
  dedSizeEl.value = _nlGet(_NL_STORE.size) || '1';
  const dedShow = () => { _nlEl('nlDedOpts').style.display = dedEl.checked ? '' : 'none'; _nlEl('netCreateBtn').textContent = dedEl.checked ? `서버에 방 만들기 (${dedSizeEl.value}:${dedSizeEl.value})` : '방 만들기'; };
  dedEl.addEventListener('change', () => { _nlSet(_NL_STORE.useDed, dedEl.checked ? '1' : '0'); dedShow(); });
  dedSizeEl.addEventListener('change', () => { _nlSet(_NL_STORE.size, dedSizeEl.value); dedShow(); });
  dedShow();
  // 104차: 이 페이지를 전용 서버가 직접 내보내고 있으면(같은 주소) 서버 주소를 저절로 채운다
  try {
    if (/^https?:$/.test(location.protocol)) fetch('status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && j.kind === 'dedicated') { if (!dedUrlEl.value) dedUrlEl.value = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; if (!_nlGet(_NL_STORE.useDed)) dedEl.checked = true; dedShow(); _nlEl('nlDedInfo').textContent = `이 주소의 전용 서버 - 지금 ${j.rooms}/${j.maxRooms}판`; }
    }).catch(() => {});
  } catch (e) { /* 정적 호스팅 */ }
  const read = () => {
    const url = urlEl.value.trim(); _nlSet(_NL_STORE.url, url); _nlSet(_NL_STORE.name, nameEl.value.trim());
    if (dedEl.checked) {
      const du = dedUrlEl.value.trim(); _nlSet(_NL_STORE.ded, du);
      if (!/^wss?:\/\//.test(du)) { _netStatus('전용 서버 주소(wss://…/ws)를 넣으세요 - 서버가 없으면 "전용 서버로 하기"를 끄면 브라우저끼리 대전합니다'); dedUrlEl.focus(); return null; }
      return { url: du, name: nameEl.value.trim(), ded: true, size: Number(dedSizeEl.value) || 1 };
    }
    if (url && !/^wss?:\/\//.test(url)) { _netStatus('중계 서버 주소는 ws://… 또는 wss://… 입니다 (비우면 브라우저끼리 직접 연결)'); return null; }
    return { url, name: nameEl.value.trim() };
  };
  _nlEl('netCreateBtn').addEventListener('click', () => {
    const r = read(); if (!r) return;
    (r.ded ? netServerCreate(r.url, r.name || '플레이어', r.size) : netHostCreateRoom(r.url, r.name || '방장')).catch(() => {}).finally(netLobbyRefresh);
    netLobbyRefresh();
  });
  // 100차: 코드 칸에 초대 링크를 통째로 붙여 넣어도 코드(·서버)를 뽑아 쓴다. 소문자·공백도 괜찮다.
  const parseCode = (raw) => {
    const t = String(raw || '').trim();
    const m = t.match(/[?&]room=([A-Za-z0-9]{4})/);
    if (m) {
      const sv = t.match(/[?&]server=([^&\s]+)/), dd = /[?&]ded=1/.test(t);
      if (sv) { if (dd) { dedUrlEl.value = decodeURIComponent(sv[1]); dedEl.checked = true; dedShow(); } else { urlEl.value = decodeURIComponent(sv[1]); dedEl.checked = false; dedShow(); } }
      return m[1].toUpperCase();
    }
    return t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
  };
  const joinNow = (codeArg) => {
    const r = read(); if (!r) return;
    const code = codeArg || parseCode(codeEl.value);
    codeEl.value = code;
    if (!/^[A-Z0-9]{4}$/.test(code)) { _netStatus('방 코드 4자리를 입력하세요'); codeEl.focus(); return; }
    _nlSet('netRecent', JSON.stringify({ code, at: Date.now() }));
    netGuestJoin(r.url, code, r.name || '참가자').catch(() => {}).finally(netLobbyRefresh);
    netLobbyRefresh();
  };
  _nlEl('netJoinBtn').addEventListener('click', () => joinNow());
  codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinNow(); });
  codeEl.addEventListener('paste', () => __hostSetTimeout(() => { const c = parseCode(codeEl.value); codeEl.value = c; if (/^[A-Z0-9]{4}$/.test(c)) joinNow(c); }, 0)); // 붙여 넣으면 바로 참가
  // 최근에 들어간 방(2시간 안) - 끊겼거나 새로고침했을 때 한 번에 다시 참가
  const recent = (() => { try { const v = JSON.parse(_nlGet('netRecent') || 'null'); return v && Date.now() - v.at < 2 * 3600 * 1000 ? v : null; } catch (e) { return null; } })();
  if (recent) { _nlEl('nlRecentRow').style.display = ''; _nlEl('nlRecent').textContent = `최근 방 ${recent.code}에 다시 참가`; _nlEl('nlRecent').addEventListener('click', () => joinNow(recent.code)); }
  // 연결 테스트: 직접 연결 중개 서버·우회 중계소마다 닿는지 보여 준다
  _nlEl('nlTestBtn').addEventListener('click', async () => {
    const out = _nlEl('nlTestOut'), btn = _nlEl('nlTestBtn');
    out.style.display = ''; out.textContent = '확인하는 중…'; btn.disabled = true;
    const render = (rows) => {
      const anyRelay = rows.some((x) => x.ok && /우회/.test(x.name)), p2p = rows.find((x) => /직접/.test(x.name));
      out.innerHTML = rows.map((x) => `${x.ok ? '✅' : '❌'} ${x.name} ${x.ok ? `(${x.ms}ms)` : ''}${x.note ? `<br><span style="opacity:.7">${x.note}</span>` : ''}`).join('<br>')
        + (rows.length >= 2 ? `<br><b>${(p2p && p2p.ok) || anyRelay ? '이 네트워크에서 온라인 대전을 할 수 있습니다' + (!(p2p && p2p.ok) ? ' (우회 중계로)' : '') : '이 네트워크에서는 연결할 수 없습니다 - 휴대폰 핫스팟 등 다른 네트워크를 써 보세요'}</b>` : '');
    };
    try { render(await netConnectionTest(render)); } catch (e) { out.textContent = '확인 실패: ' + (e.message || e); }
    btn.disabled = false;
  });
  const copy = (text, what) => {
    const ok = () => { if (typeof showSkillToast === 'function') showSkillToast(`${what}를 복사했습니다`); };
    try { navigator.clipboard.writeText(text).then(ok, () => window.prompt(`${what}:`, text)); } catch (e) { window.prompt(`${what}:`, text); }
  };
  _nlEl('nlCopyCode').addEventListener('click', () => { if (netState && netState.code) copy(netState.code, '방 코드'); });
  _nlEl('nlCopyLink').addEventListener('click', () => { if (netState && netState.code) copy(netInviteLink(), '초대 링크'); });
  const leave = () => { if (typeof netLeave === 'function') netLeave(false); netLobbyRefresh(); };
  _nlEl('nlLeave').addEventListener('click', leave);
  _nlEl('npLeave').addEventListener('click', () => { if (confirm('방을 나갈까요?')) leave(); });
  _nlEl('nlBackToGame').addEventListener('click', () => { if (typeof closeLobby === 'function') closeLobby(); });
  _nlEl('npTeamBtn').addEventListener('click', () => { const st = netState; const me = st && st.pick && st.pick.roster && st.pick.roster.players.find((x) => x.pid === st.pid); if (me) netPickTeam(me.team === 'BLUE' ? 'RED' : 'BLUE'); });
  _nlEl('npStartBtn').addEventListener('click', () => netPickForceStart());
  _nlEl('npCopyLink').addEventListener('click', () => { if (netState && netState.code) copy(netInviteLink(), '초대 링크'); });
  const pb = _nlEl('openNetLobbyBtn'); if (pb) pb.addEventListener('click', openNetLobby);
  // 초대 링크로 들어왔으면: 온라인 탭에 코드·서버를 채워 둔다.
  const q = new URLSearchParams(location.search);
  if (q.get('room')) {
    codeEl.value = q.get('room').toUpperCase().slice(0, 4);
    if (q.get('server')) { if (q.get('ded') === '1') { dedUrlEl.value = q.get('server'); dedEl.checked = true; } else { urlEl.value = q.get('server'); dedEl.checked = false; } dedShow(); }
    // 100차: 초대 링크 - 이름이 저장돼 있으면 바로 참가, 없으면 이름 칸에 커서를 두고 안내
    __hostSetTimeout(() => {
      openNetLobby();
      if (nameEl.value.trim()) { _netStatus('초대받은 방에 참가하는 중…'); joinNow(codeEl.value); }
      else { _netStatus('초대받은 방입니다 - 이름을 넣고 "참가"(또는 Enter)를 누르세요'); nameEl.focus(); nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinNow(codeEl.value); }); }
    }, 300);
  }
  __hostSetInterval(() => netLobbyRefresh(), 1000); // 상태 줄·버튼(연결·참가·대전 시작) 갱신
  // 100차: 채팅 - 방에 있을 때 Enter로 입력 칸을 열고, Enter로 보내고, Esc로 닫는다(픽창·대전 모두).
  const chat = document.createElement('input');
  chat.id = 'netChatInput'; chat.maxLength = 200; chat.placeholder = '메시지 (Enter 보내기 · Esc 닫기)';
  chat.style.cssText = 'position:fixed;left:14px;bottom:120px;width:340px;display:none;z-index:500;background:rgba(10,14,18,.92);color:#e8e2d0;border:1px solid #785a28;padding:6px 8px;font:13px sans-serif';
  document.body.appendChild(chat);
  chat.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { if (chat.value.trim()) netSendChat(chat.value); chat.value = ''; chat.style.display = 'none'; chat.blur(); }
    else if (e.key === 'Escape') { chat.value = ''; chat.style.display = 'none'; chat.blur(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !netState || !netState.client) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    e.preventDefault(); chat.style.display = ''; chat.focus();
  });
})();

function netInviteLink() {
  const st = netState; if (!st || !st.code) return '';
  const base = location.origin + location.pathname;
  const url = st.client && st.client.url !== 'p2p' ? st.client.url : '';
  return `${base}?room=${st.code}${url ? '&server=' + encodeURIComponent(url) : ''}${st.dedicated ? '&ded=1' : ''}`;
}
function openNetLobby() {
  if (typeof openLobby === 'function' && !(typeof isLobbyOpen === 'function' && isLobbyOpen())) openLobby();
  netLobbyMode('online');
}
function netLobbyShowPick() { netLobbyMode('online'); netLobbyRefreshPick(); }
function netLobbyMode(mode) {
  _netLobbyMode = mode === 'online' ? 'online' : 'practice';
  netLobbyRefresh();
}
// 무엇을 보일지: 연습 탭 = 원래 로비 / 온라인 탭 = (픽창이면 로비 + 위쪽 줄) 아니면 방 만들기·대기실
function netLobbyRefresh() {
  if (typeof document === 'undefined') return;
  const ov = _nlEl('lobbyOverlay'); if (!ov || !_nlEl('lbTabPractice')) return;
  const online = _netLobbyMode === 'online';
  const st = typeof netState !== 'undefined' ? netState : null;
  const picking = !!(st && st.pick);
  const body = ov.querySelector('.lb-body'), panel = _nlEl('netLobbyPanel'), bar = _nlEl('netPickBar');
  _nlEl('lbTabPractice').classList.toggle('sel', !online);
  _nlEl('lbTabOnline').classList.toggle('sel', online);
  const h1 = ov.querySelector('.lb-head h1'), sub = ov.querySelector('.lb-head span');
  if (h1) h1.textContent = online ? (picking ? '챔피언 선택' : '온라인 대전') : '연습 준비';
  if (sub) sub.textContent = online ? (picking ? '챔피언 · 룬 · 소환사 주문을 고르고 확정하세요 (상대 선택은 위에 보입니다)' : '방을 만들거나 코드로 참가하세요') : '챔피언 · 룬 · 소환사 주문을 고르고 게임을 시작하세요';
  body.style.display = !online || picking ? '' : 'none';
  panel.classList.toggle('show', online && !picking);
  bar.classList.toggle('show', online && picking);
  const start = _nlEl('lobbyStartBtn');
  if (start) {
    start.textContent = online && picking ? (st.pick.locked ? (st.pick.phase === 'loading' ? '불러오는 중…' : '확정됨') : '확정') : '게임 시작';
    start.disabled = online && picking && st.pick.locked;
  }
  // 방 만들기·대기실
  const connect = _nlEl('nlConnect'), room = _nlEl('nlRoom');
  const inRoom = !!(st && (st.code || st.role === 'guest'));
  connect.style.display = inRoom ? 'none' : '';
  room.style.display = inRoom ? '' : 'none';
  if (inRoom) {
    const code = st.code || '----';
    _nlEl('nlCode').textContent = code;
    const isHost = st.role === 'host';
    const meName = st.name || '', other = isHost ? (st.guestName || st.peerName || '') : (st.hostName || '');
    const blue = isHost ? meName : other, red = isHost ? other : meName;
    _nlEl('nlBlue').textContent = `파랑(방장) - ${blue || '…'}${isHost ? ' (나)' : ''}`;
    const redEl = _nlEl('nlRed');
    const redHere = isHost ? !!(st.peerName || st.guestName) && !st.guestGoneAt : true;
    redEl.textContent = redHere ? `빨강(참가자) - ${red || '…'}${isHost ? '' : ' (나)'}` : '빨강(참가자) - 기다리는 중…';
    redEl.classList.toggle('empty', !redHere);
    const live = typeof netMatchActive === 'function' && netMatchActive();
    _nlEl('nlRoomTitle').textContent = live ? '대전 중' : isHost ? '대기실 - 코드를 상대에게 보내세요' : '대기실';
    _nlEl('nlBackToGame').style.display = live ? '' : 'none';
    _nlEl('nlCopyCode').disabled = !st.code; _nlEl('nlCopyLink').disabled = !st.code;
  }
  const gb = _nlEl('netLobbyBtn');
  if (gb) {
    const live = typeof netMatchActive === 'function' && netMatchActive();
    gb.classList.toggle('live', !!st);
    const rtt = st ? (st.role === 'host' ? st.guestRtt : st.rtt) : null;
    const how = st && st.client ? (st.dedicated ? '전용 서버' : ({ p2p: '직접 연결', mqtt: '우회 중계', relay: '중계 서버' }[st.client.kind] || '')) : '';
    gb.textContent = live ? `온라인 대전 · ${rtt != null ? Math.round(rtt) + 'ms' : '…'}${how ? ' · ' + how : ''}` : st && st.code ? `온라인 방 ${st.code}` : '온라인 대전'; // 100차: 대전 중 핑·연결 방식
  }
  if (picking) netLobbyRefreshPick();
}
function _nlCardHtml(champ, spells, name, locked, team) {
  const nm = champ ? ((typeof CHAMPION_MODEL_LIBRARY !== 'undefined' && (CHAMPION_MODEL_LIBRARY.find(([k]) => k === champ) || [])[1]) || champ) : '고르는 중…';
  const icon = champ ? `<img class="ch" src="assets/champion_icons/${champ}/icon.png" alt="">` : '<img class="ch" alt="">';
  const sp = (spells || []).map((id) => `<img class="sp" src="assets/spells/${id}.png" alt="" title="${id}">`).join('');
  return `${icon}<div><div class="np-name" style="color:${team === 'BLUE' ? '#8ac4ff' : '#ff8a7a'}">${name || ''}</div><div class="np-sub">${nm}</div><div style="display:flex;gap:3px;margin-top:3px;align-items:center">${sp}<span class="np-lock${locked ? ' on' : ''}">${locked ? '확정' : '선택 중'}</span></div></div>`;
}
// 픽창 위쪽 줄: 남은 시간·내 선택·상대 선택(실시간)·확정 여부
function netLobbyRefreshPick() {
  if (typeof document === 'undefined') return;
  const st = typeof netState !== 'undefined' ? netState : null;
  if (!st || !st.pick) return;
  const P = st.pick, isHost = st.role === 'host';
  const mine = P.locked && P.mine ? P.mine : (typeof lobbyState !== 'undefined' ? { champ: lobbyState.champ, spells: lobbyState.spells } : {});
  _nlEl('npDedBtns').style.display = st.dedicated ? '' : 'none';
  if (st.dedicated) { _nlRefreshDedicatedPick(st, P, mine); return; }
  const myTeam = isHost ? 'BLUE' : 'RED', oppTeam = isHost ? 'RED' : 'BLUE';
  const mineEl = _nlEl('npMine'), oppEl = _nlEl('npOpp');
  mineEl.className = 'np-card ' + (myTeam === 'BLUE' ? 'blue' : 'red'); oppEl.className = 'np-card ' + (oppTeam === 'BLUE' ? 'blue' : 'red');
  mineEl.innerHTML = _nlCardHtml(mine.champ, mine.spells, `${st.name || '나'} (나)`, P.locked, myTeam);
  oppEl.innerHTML = _nlCardHtml(P.opp.champ, P.opp.spells, isHost ? (st.guestName || st.peerName || '상대') : (st.hostName || '상대'), P.opp.locked, oppTeam);
  const left = Math.max(0, Math.ceil((P.endsAt - __gcRealNow()) / 1000));
  const t = _nlEl('npTimer'); t.textContent = P.phase === 'loading' ? '…' : String(left); t.classList.toggle('low', left <= 10);
  _nlEl('npInfo').textContent = P.phase === 'loading' ? '둘 다 확정 - 챔피언을 불러오는 중' : P.locked ? (P.opp.locked ? '시작합니다' : '상대가 확정하기를 기다리는 중') : `방 ${st.code || ''} · 시간이 다 되면 지금 고른 것으로 확정됩니다`;
  const body = document.querySelector('#lobbyOverlay .lb-body'); if (body) body.classList.toggle('np-locked', !!P.locked);
  const start = _nlEl('lobbyStartBtn');
  if (start && _netLobbyMode === 'online') { start.textContent = P.locked ? (P.phase === 'loading' ? '불러오는 중…' : '확정됨') : '확정'; start.disabled = !!P.locked; }
}
// 104차: 전용 서버 픽창 - 내 카드 + 양 팀 명단(이름·챔피언·확정), 사람이 다 찰 때까지는 기다림, 방을 만든 사람은 "지금 시작"
function _nlRefreshDedicatedPick(st, P, mine) {
  const R = P.roster || { players: [], size: st.size || 1, owner: null };
  const me = R.players.find((x) => x.pid === st.pid) || { team: 'BLUE' };
  const mineEl = _nlEl('npMine'), oppEl = _nlEl('npOpp');
  mineEl.className = 'np-card ' + (me.team === 'BLUE' ? 'blue' : 'red');
  mineEl.innerHTML = _nlCardHtml(mine.champ, mine.spells, `${st.name || '나'} (나)`, P.locked, me.team);
  const col = (team) => {
    const rows = R.players.filter((x) => x.team === team).map((x) => {
      const nm = x.champ ? ((typeof CHAMPION_MODEL_LIBRARY !== 'undefined' && (CHAMPION_MODEL_LIBRARY.find(([k]) => k === x.champ) || [])[1]) || x.champ) : '고르는 중';
      return `<div class="np-ro${x.pid === st.pid ? ' me' : ''}${x.on ? '' : ' off'}">${x.champ ? `<img src="assets/champion_icons/${x.champ}/icon.png" alt="">` : '<i></i>'}<span>${(x.name || '').replace(/[<>&]/g, '')}</span><small>${nm}${x.locked ? ' ✔' : ''}</small></div>`;
    });
    for (let i = rows.length; i < R.size; i++) rows.push('<div class="np-ro empty"><i></i><span>빈 자리</span></div>');
    return `<div class="np-col ${team === 'BLUE' ? 'blue' : 'red'}"><b>${team === 'BLUE' ? '파랑 팀' : '빨강 팀'}</b>${rows.join('')}</div>`;
  };
  oppEl.className = 'np-card roster';
  oppEl.innerHTML = col('BLUE') + col('RED');
  const n = R.players.length, need = R.size * 2;
  const left = Number.isFinite(P.endsAt) ? Math.max(0, Math.ceil((P.endsAt - __gcRealNow()) / 1000)) : null;
  const t = _nlEl('npTimer'); t.textContent = P.phase === 'loading' || R.phase === 'loading' ? '…' : left != null ? String(left) : `${n}/${need}`; t.classList.toggle('low', left != null && left <= 10);
  const allLocked = R.players.length && R.players.every((x) => x.locked);
  const twoTeams = R.players.some((x) => x.team === 'BLUE') && R.players.some((x) => x.team === 'RED');
  _nlEl('npInfo').textContent = R.phase === 'loading' || P.phase === 'loading' ? '모두 확정 - 챔피언을 불러오는 중'
    : n < need ? `방 ${st.code || ''} · ${n}/${need}명 - 코드나 초대 링크를 보내세요${R.owner === st.pid ? ' (모두 확정하면 "지금 시작"으로 바로 할 수 있습니다)' : ''}`
    : P.locked ? '다른 사람이 확정하기를 기다리는 중' : '시간이 다 되면 지금 고른 것으로 확정됩니다';
  const teamBtn = _nlEl('npTeamBtn'), other = me.team === 'BLUE' ? 'RED' : 'BLUE';
  teamBtn.disabled = !!P.locked || R.players.filter((x) => x.team === other).length >= R.size;
  teamBtn.textContent = other === 'BLUE' ? '파랑 팀으로' : '빨강 팀으로';
  const sb = _nlEl('npStartBtn'); sb.style.display = R.owner === st.pid && n < need ? '' : 'none'; sb.disabled = !(allLocked && twoTeams);
  const body = document.querySelector('#lobbyOverlay .lb-body'); if (body) body.classList.toggle('np-locked', !!P.locked);
  const start = _nlEl('lobbyStartBtn');
  if (start && _netLobbyMode === 'online') { start.textContent = P.locked ? (P.phase === 'loading' ? '불러오는 중…' : '확정됨') : '확정'; start.disabled = !!P.locked; }
}
if (typeof window !== 'undefined') { window.openNetLobby = openNetLobby; window.netLobbyMode = netLobbyMode; }
