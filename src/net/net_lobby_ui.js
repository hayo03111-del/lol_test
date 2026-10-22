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
const _NL_STORE = { url: 'netServerUrl', name: 'netName' };
function _nlGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function _nlSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } }
function _nlEl(id) { return document.getElementById(id); }

(function buildNetLobbyUi() {
  if (typeof document === 'undefined') return;
  const ov = _nlEl('lobbyOverlay'); if (!ov) return;
  const head = ov.querySelector('.lb-head'), body = ov.querySelector('.lb-body');
  // 탭
  const tabs = document.createElement('div'); tabs.className = 'lb-tabs';
  tabs.innerHTML = '<button type="button" id="lbTabPractice" class="sel">연습</button><button type="button" id="lbTabOnline">온라인 1:1</button>';
  head.appendChild(tabs);
  // 픽창 위쪽 줄
  const bar = document.createElement('div'); bar.id = 'netPickBar';
  bar.innerHTML = '<div class="np-card blue" id="npMine"></div><div class="np-mid"><div class="np-timer" id="npTimer">90</div><div class="np-info" id="npInfo">챔피언을 고르고 확정하세요</div></div><div class="np-card red" id="npOpp"></div><button type="button" id="npLeave">방 나가기</button>';
  head.after(bar);
  // 방 만들기·참가·대기실
  const panel = document.createElement('section'); panel.id = 'netLobbyPanel';
  panel.innerHTML = `<div class="nl-wrap">
    <div class="nl-card" id="nlConnect">
      <h3>온라인 1:1 대전</h3>
      <div class="nl-help">
        <b>1.</b> 한 사람이 <b>방 만들기</b> → 나온 코드(또는 초대 링크)를 상대에게 보냅니다.<br>
        <b>2.</b> 상대가 이 페이지에서 코드를 넣고 <b>참가</b> → 챔피언을 고르고 확정하면 시작합니다.<br>
        설치할 것도, 켜 둘 서버도 없습니다 - 두 브라우저가 직접 연결됩니다(WebRTC).
      </div>
      <label>내 이름<input id="netName" maxlength="24" placeholder="이름"></label>
      <div class="nl-row"><button type="button" id="netCreateBtn" class="primary">방 만들기</button></div>
      <div class="nl-row"><input id="netJoinCode" maxlength="4" placeholder="방 코드 4자리" style="text-transform:uppercase;letter-spacing:.2em"><button type="button" id="netJoinBtn">참가</button></div>
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
  urlEl.value = _nlGet(_NL_STORE.url);
  nameEl.value = _nlGet(_NL_STORE.name);
  const read = () => {
    const url = urlEl.value.trim(); _nlSet(_NL_STORE.url, url); _nlSet(_NL_STORE.name, nameEl.value.trim());
    if (url && !/^wss?:\/\//.test(url)) { _netStatus('중계 서버 주소는 ws://… 또는 wss://… 입니다 (비우면 브라우저끼리 직접 연결)'); return null; }
    return { url, name: nameEl.value.trim() };
  };
  _nlEl('netCreateBtn').addEventListener('click', () => { const r = read(); if (r) netHostCreateRoom(r.url, r.name || '방장').catch(() => {}).finally(netLobbyRefresh); netLobbyRefresh(); });
  _nlEl('netJoinBtn').addEventListener('click', () => {
    const r = read(); if (!r) return;
    const code = codeEl.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { _netStatus('방 코드 4자리를 입력하세요'); return; }
    netGuestJoin(r.url, code, r.name || '참가자').catch(() => {}).finally(netLobbyRefresh);
    netLobbyRefresh();
  });
  codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') _nlEl('netJoinBtn').click(); });
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
  const pb = _nlEl('openNetLobbyBtn'); if (pb) pb.addEventListener('click', openNetLobby);
  // 초대 링크로 들어왔으면: 온라인 탭에 코드·서버를 채워 둔다.
  const q = new URLSearchParams(location.search);
  if (q.get('room')) {
    codeEl.value = q.get('room').toUpperCase().slice(0, 4);
    if (q.get('server')) urlEl.value = q.get('server');
    __hostSetTimeout(() => { openNetLobby(); _netStatus('초대받은 방입니다 - 이름을 넣고 "참가"를 누르세요'); }, 0);
  }
  __hostSetInterval(() => netLobbyRefresh(), 1000); // 상태 줄·버튼(연결·참가·대전 시작) 갱신
})();

function netInviteLink() {
  const st = netState; if (!st || !st.code) return '';
  const base = location.origin + location.pathname;
  const url = st.client && st.client.url !== 'p2p' ? st.client.url : '';
  return `${base}?room=${st.code}${url ? '&server=' + encodeURIComponent(url) : ''}`;
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
  if (h1) h1.textContent = online ? (picking ? '챔피언 선택' : '온라인 1:1 대전') : '연습 준비';
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
    gb.textContent = live ? `온라인 대전 중${st && st.code ? ' · ' + st.code : ''}` : st && st.code ? `온라인 방 ${st.code}` : '온라인 대전';
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
if (typeof window !== 'undefined') { window.openNetLobby = openNetLobby; window.netLobbyMode = netLobbyMode; }
