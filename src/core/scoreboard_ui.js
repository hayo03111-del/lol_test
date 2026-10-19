/* ============================================================
   SCOREBOARD UI (스코어보드 - 34차)
   ------------------------------------------------------------
   요청("스코어 보드도 미리 만들어 두고") - 원작처럼 Tab을 누르고 있는 동안(또는 O로 켜고 끄기) 화면 가운데에 양 팀 표를 띄운다.
   디자인은 상점 창과 같은 moba_ui_system 토큰(베벨 패널·청동 강조색·진영색 띠).

   지금 이 연습장에는 플레이어 한 명뿐이라 실제 수치가 있는 줄은 플레이어 하나다:
   - 레벨·골드·아이템(6칸+장신구)·CS(마지막 타격으로 잡은 미니언)·데스(사망 횟수)는 실제 값.
   - 처치·어시스트: 적 챔피언이 아직 없어 0이다. 나중에 적 챔피언이 생기면 recordChampionTakedown()만 부르면 된다.
   - 아군 더미·적 더미는 "연습 상대" 줄로 체력만 보여 준다. 남는 자리는 빈 자리로 5칸까지 채운다.
   맨 위에는 팀별 처치 합계·부순 포탑 수, 가운데 게임 시간(포탑 시스템의 게임 시계)을 보여 준다.
   71차: 원작 모양으로 다시 그림 - 헥스테크 색, 위쪽 줄(팀 처치·포탑·골드 / 가운데 시간), 우리 팀 위·상대 팀 아래,
   줄마다 챔피언 초상화(레벨) · 소환사 주문 2개 · 룬(핵심 + 보조 빌드) · 이름 · 아이템 6칸 + 장신구 · K/D/A · CS.
   ============================================================ */
const SCOREBOARD_TEAM_SIZE = 5;
let _scoreboardHeld = false;   // Tab 누르는 동안
let _scoreboardToggled = false; // O로 켬
let _scoreboardTicker = null;

function _sbEl(id) { return document.getElementById(id); }
function _sbEsc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function ensureScore(ctrl) {
  if (!ctrl) return null;
  if (!ctrl.score) ctrl.score = { kills: 0, deaths: 0, assists: 0, cs: 0 };
  return ctrl.score;
}
// 이후 적 챔피언이 생기면 처치/어시스트를 여기로 넘긴다(지금은 부르는 곳이 없다).
function recordChampionTakedown(ctrl, isKill) {
  const s = ensureScore(ctrl);
  if (!s) return;
  if (isKill) s.kills += 1; else s.assists += 1;
}
function _sbChampName(id) {
  const d = typeof CHAMPION_DATA !== 'undefined' && id ? CHAMPION_DATA[id] : null;
  return (d && (d.displayName || d.nameKo)) || id || '-';
}
function _sbClock() {
  const t = typeof getTurretGameTimeSec === 'function' ? Math.max(0, getTurretGameTimeSec()) : 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}
// 상대 팀 포탑을 몇 개 부쉈는지(우물처럼 파괴 불가인 것은 뺀다).
function _sbTowersDestroyedBy(team) {
  if (typeof turrets === 'undefined' || typeof TURRET_DATA === 'undefined') return 0;
  return turrets.filter((t) => t.team !== team && t.destroyed && !(TURRET_DATA[t.type] && TURRET_DATA[t.type].indestructible)).length;
}
function _sbItemsHtml(ctrl) {
  let html = '';
  const items = (ctrl && ctrl.items) || [];
  for (let i = 0; i < 6; i++) {
    const data = items[i] && typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[items[i].id] : null;
    html += `<div class="sb-item${data ? '' : ' empty'}" title="${data ? _sbEsc(data.nameKo) : ''}">${data && typeof _shopIconHtml === 'function' ? _shopIconHtml(data) : ''}</div>`;
  }
  const t = ctrl && ctrl.trinket && typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[ctrl.trinket.id] : null;
  html += `<div class="sb-item trinket${t ? '' : ' empty'}" title="${t ? _sbEsc(t.nameKo) : ''}">${t && typeof _shopIconHtml === 'function' ? _shopIconHtml(t) : ''}</div>`;
  const b = ctrl && ctrl.boots && typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[ctrl.boots.id] : null;
  if (b) html += `<div class="sb-item boots" title="${_sbEsc(b.nameKo)}">${_shopIconHtml(b)}</div>`;
  return `<div class="sb-items">${html}</div>`;
}
// 36차: 소환사 주문 두 칸(D/F) - 원작 스코어보드처럼 초상화 옆에 위아래로.
function _sbSpellsHtml(ctrl) {
  if (typeof ensureSummoners !== 'function' || typeof _summonerIconHtml !== 'function') return '<div class="sb-spells"></div>';
  const s = ensureSummoners(ctrl);
  return `<div class="sb-spells">${SUMMONER_SLOTS.map((k) => _summonerIconHtml(s[k].id)).join('')}</div>`;
}
// 71차: 룬(핵심 룬 + 보조 빌드) - 원작처럼 소환사 주문 옆에 위아래로.
function _sbRunesHtml(ctrl) {
  const p = ctrl && ctrl.runePage;
  if (!p) return '<div class="sb-runes"></div>';
  const name = (id) => { const f = typeof runeFind === 'function' ? runeFind(id) : null; return f ? f.rune.name : ''; };
  return `<div class="sb-runes"><img class="sb-keystone" src="assets/runes/${p.keystone}.png" title="${_sbEsc(name(p.keystone))}" alt=""><img class="sb-subtree" src="assets/runes/tree_${p.secondary}.png" alt=""></div>`;
}
// 71차: 초상화 - 챔피언 아이콘(없으면 이름 두 글자) + 왼쪽 아래 레벨.
function _sbPortraitHtml(ctrl) {
  const id = ctrl && ctrl.championId;
  const hasIcon = id && typeof CHAMPION_ICON_META !== 'undefined' && CHAMPION_ICON_META[id];
  const img = hasIcon ? `<img src="assets/champion_icons/${id}/icon.png" alt="">` : _sbEsc(String(id || '-').slice(0, 2).toUpperCase());
  return `<div class="sb-portrait">${img}<span class="sb-lv">${(ctrl && ctrl.champLevel) || 1}</span></div>`;
}
function _sbPlayerRow(ctrl) {
  const s = ensureScore(ctrl);
  const champ = _sbChampName(ctrl.championId);
  const dead = ctrl.state === 'DEAD' || !(ctrl.hp > 0);
  return `<div class="sb-row me${dead ? ' dead' : ''}">
    ${_sbPortraitHtml(ctrl)}${_sbSpellsHtml(ctrl)}${_sbRunesHtml(ctrl)}
    <div class="sb-name"><b>${_sbEsc(champ)}</b><small>나</small></div>
    ${_sbItemsHtml(ctrl)}
    <div class="sb-kda">${s.kills} / ${s.deaths} / ${s.assists}</div>
    <div class="sb-cs">${s.cs}</div>
    <div class="sb-gold">${Math.floor(ctrl.gold || 0).toLocaleString()}</div>
  </div>`;
}
function _sbDummyRow(unit, label) {
  const pct = unit.maxHp ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0;
  return `<div class="sb-row dummy">
    <div class="sb-portrait dummy-face">허수</div><div class="sb-spells"></div><div class="sb-runes"></div>
    <div class="sb-name"><b>${_sbEsc(label)}</b><small>연습 상대 · 레벨 ${unit.champLevel || 1}</small></div>
    <div class="sb-items sb-hp"><div class="sb-hpbar"><div style="width:${pct.toFixed(0)}%"></div></div><span>${Math.ceil(unit.hp || 0).toLocaleString()} / ${Math.ceil(unit.maxHp || 0).toLocaleString()}</span></div>
    <div class="sb-kda">-</div><div class="sb-cs">-</div><div class="sb-gold">-</div>
  </div>`;
}
function _sbEmptyRow() {
  return '<div class="sb-row empty"><div class="sb-portrait"></div><div class="sb-spells"></div><div class="sb-runes"></div><div class="sb-name"><small>빈 자리</small></div><div class="sb-items"></div><div class="sb-kda"></div><div class="sb-cs"></div><div class="sb-gold"></div></div>';
}
function _sbTeamRows(team, ctrl) {
  const rows = [];
  if (ctrl && (ctrl.team || PLAYER_TEAM) === team) rows.push(_sbPlayerRow(ctrl));
  const playerTeam = (ctrl && ctrl.team) || PLAYER_TEAM;
  if (team === playerTeam) {
    if (typeof placedAllies !== 'undefined') for (const a of placedAllies) if (rows.length < SCOREBOARD_TEAM_SIZE) rows.push(_sbDummyRow(a, '아군 허수아비'));
  } else {
    const enemies = typeof dummy !== 'undefined' && dummy ? [dummy, ...(typeof placedDummies !== 'undefined' ? placedDummies : [])] : (typeof placedDummies !== 'undefined' ? placedDummies : []);
    for (const d of enemies) if (rows.length < SCOREBOARD_TEAM_SIZE) rows.push(_sbDummyRow(d, '허수아비'));
  }
  while (rows.length < SCOREBOARD_TEAM_SIZE) rows.push(_sbEmptyRow());
  return rows.join('');
}
function _sbTeamKills(team, ctrl) {
  return ctrl && (ctrl.team || PLAYER_TEAM) === team ? ensureScore(ctrl).kills : 0;
}
// 71차: 팀이 번 골드 합계(원작 위쪽 줄의 "12.3k") - 지금은 플레이어가 번 골드(시작 골드 포함)뿐이다.
function _sbTeamGold(team, ctrl) {
  if (!ctrl || (ctrl.team || PLAYER_TEAM) !== team) return 0;
  const s = ensureScore(ctrl);
  return s.goldEarned || Math.floor(ctrl.gold || 0);
}
function _sbK(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.floor(n)); }
function _sbSumHtml(team, ctrl, cls) {
  const parts = [
    `<span class="sb-sum-kills">${_sbTeamKills(team, ctrl)}</span>`,
    `<span class="sb-stat" title="부순 포탑"><i class="sb-ico tower"></i>${_sbTowersDestroyedBy(team)}</span>`,
    `<span class="sb-stat gold" title="팀 골드"><i class="sb-ico coin"></i>${_sbK(_sbTeamGold(team, ctrl))}</span>`,
  ];
  if (cls === 'red') parts.reverse();
  return `<div class="sb-team-sum ${cls}">${parts.join('')}</div>`;
}
function renderScoreboard() {
  const box = _sbEl('scoreboardPanel');
  if (!box) return;
  const ctrl = typeof controller !== 'undefined' ? controller : null;
  const mine = (ctrl && ctrl.team) || PLAYER_TEAM;
  // 원작처럼 우리 팀을 위에, 상대 팀을 아래에.
  const teams = [{ id: 'BLUE', nameKo: '블루 팀', cls: 'blue' }, { id: 'RED', nameKo: '레드 팀', cls: 'red' }].sort((a, b) => (a.id === mine ? -1 : b.id === mine ? 1 : 0));
  let html = `<div class="sb-top">
    ${_sbSumHtml('BLUE', ctrl, 'blue')}
    <div class="sb-mid"><div class="sb-clock">${_sbClock()}</div><div class="sb-mode">칼바람 나락</div></div>
    ${_sbSumHtml('RED', ctrl, 'red')}
  </div>`;
  for (const t of teams) {
    html += `<div class="sb-team ${t.cls}">
      <div class="sb-head uc"><span class="sb-team-name">${t.nameKo}${t.id === mine ? ' · 아군' : ' · 적'}</span><span>아이템</span><span>K / D / A</span><span>CS</span><span>골드</span></div>
      ${_sbTeamRows(t.id, ctrl)}
    </div>`;
  }
  box.innerHTML = html;
}
function _sbApplyVisible() {
  const overlay = _sbEl('scoreboardOverlay');
  if (!overlay) return;
  const show = _scoreboardHeld || _scoreboardToggled;
  overlay.classList.toggle('show', show);
  clearInterval(_scoreboardTicker);
  _scoreboardTicker = null;
  if (show) { renderScoreboard(); _scoreboardTicker = setInterval(renderScoreboard, 250); }
}
function setScoreboardHeld(held) { if (_scoreboardHeld === !!held) return; _scoreboardHeld = !!held; _sbApplyVisible(); }
function toggleScoreboard() { _scoreboardToggled = !_scoreboardToggled; _sbApplyVisible(); }
function isScoreboardOpen() { return _scoreboardHeld || _scoreboardToggled; }
// 창이 포커스를 잃으면(Alt+Tab 등) Tab 떼는 신호가 안 올 수 있다 - 누르고 있던 상태를 푼다.
window.addEventListener('blur', () => setScoreboardHeld(false));
