/* ============================================================
   로비 화면 - 52차
   ------------------------------------------------------------
   게임 전에 챔피언·소환사 주문·룬 페이지를 고르고 "게임 시작". 처음 열면 뜨고(주소에 ?champ= 가 있거나 다른 경로로
   챔피언을 불러오면 닫힌다), 설정 창의 "로비" 버튼으로 다시 연다.
   룬 페이지 규칙(원작): 주 빌드 = 핵심 룬 1 + 1~3줄 한 개씩, 보조 빌드(주 빌드와 다른 것) = 1~3줄 중 서로 다른 두 줄에서
   하나씩(세 번째를 고르면 먼저 고른 것이 빠진다), 능력치 파편 3줄. 페이지는 챔피언마다 브라우저에 저장(rune_system.js).
   ============================================================ */
const LOBBY_CHAMP_KEY = 'lolsim.lobbyChamp', LOBBY_SPELLS_KEY = 'lolsim.spells';
const lobbyState = { champ: null, page: null, spells: ['flash', 'heal'], activeSpellSlot: 0, pendingSpells: null };

function _lobbyLoad(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; } }
function _lobbySave(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } }
function _lobbyChampList() { return typeof CHAMPION_MODEL_LIBRARY !== 'undefined' ? CHAMPION_MODEL_LIBRARY : []; }
function _lobbyEl(id) { return document.getElementById(id); }
function _runeIcon(id) { return `assets/runes/${id}.png`; }

function openLobby() {
  const ov = _lobbyEl('lobbyOverlay'); if (!ov) return;
  const cur = (typeof controller !== 'undefined' && controller && controller.championId) || _lobbyLoad(LOBBY_CHAMP_KEY, 'garen');
  lobbyState.champ = _lobbyChampList().some(([k]) => k === cur) ? cur : 'garen';
  lobbyState.page = (typeof controller !== 'undefined' && controller && controller.championId === lobbyState.champ && controller.runePage)
    ? JSON.parse(JSON.stringify(controller.runePage)) : runePageFor(lobbyState.champ);
  const s = (typeof controller !== 'undefined' && controller && controller.summoners) ? [controller.summoners.D.id, controller.summoners.F.id] : _lobbyLoad(LOBBY_SPELLS_KEY, ['flash', 'heal']);
  lobbyState.spells = s; lobbyState.activeSpellSlot = 0;
  ov.classList.add('show');
  renderLobby();
}
function closeLobby() { const ov = _lobbyEl('lobbyOverlay'); if (ov) ov.classList.remove('show'); }
function isLobbyOpen() { const ov = _lobbyEl('lobbyOverlay'); return !!(ov && ov.classList.contains('show')); }

function renderLobby() {
  _renderLobbyChamps(); _renderLobbyRunes(); _renderLobbySpells(); _renderLobbyPick();
}
function _renderLobbyPick() {
  const name = (_lobbyChampList().find(([k]) => k === lobbyState.champ) || [])[1] || lobbyState.champ;
  const icon = _lobbyEl('lobbyPickIcon'); if (icon) icon.src = `assets/champion_icons/${lobbyState.champ}/icon.png`;
  const nm = _lobbyEl('lobbyPickName'); if (nm) nm.textContent = name;
}
function _renderLobbyChamps() {
  const grid = _lobbyEl('lobbyChampGrid'); if (!grid) return;
  grid.innerHTML = '';
  for (const [id, name] of _lobbyChampList()) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lb-champ' + (id === lobbyState.champ ? ' sel' : ''); b.dataset.champ = id; b.title = name;
    b.innerHTML = `<img src="assets/champion_icons/${id}/icon.png" alt=""><span>${name}</span>`;
    b.addEventListener('click', () => {
      lobbyState.champ = id; lobbyState.page = runePageFor(id); renderLobby();
    });
    grid.appendChild(b);
  }
}
function _lobbyRuneButton(rune, selected, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `lb-rune ${cls}${selected ? ' sel' : ''}${RUNE_IMPLEMENTED.has(rune.key) ? '' : ' noimpl'}`;
  b.dataset.rune = rune.id;
  b.innerHTML = `<img src="${_runeIcon(rune.id)}" alt="">`;
  b.title = `${rune.name}\n${rune.desc}${RUNE_IMPLEMENTED.has(rune.key) ? '' : '\n(이 연습장에서는 효과 없음)'}`;
  b.addEventListener('mouseenter', () => _lobbyRuneInfo(rune));
  b.addEventListener('click', onClick);
  return b;
}
function _lobbyRuneInfo(rune) {
  const el = _lobbyEl('lobbyRuneInfo'); if (!el) return;
  el.innerHTML = `<b>${rune.name}</b> ${RUNE_IMPLEMENTED.has(rune.key) ? '' : '<em>이 연습장에서는 효과 없음</em>'}<div>${rune.desc}</div>`;
}
function _lobbyTreeTabs(container, selectedId, excludeId, onPick) {
  const row = document.createElement('div'); row.className = 'lb-trees';
  for (const t of RUNE_TREES) {
    if (t.id === excludeId) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lb-tree' + (t.id === selectedId ? ' sel' : ''); b.dataset.tree = t.id; b.title = t.name;
    b.innerHTML = `<img src="assets/runes/tree_${t.id}.png" alt=""><span>${t.name}</span>`;
    b.addEventListener('click', () => onPick(t));
    row.appendChild(b);
  }
  container.appendChild(row);
}
function _renderLobbyRunes() {
  const box = _lobbyEl('lobbyRunes'); if (!box || typeof RUNE_TREES === 'undefined') return;
  const p = lobbyState.page;
  box.innerHTML = '';
  // 주 빌드
  const prim = document.createElement('div'); prim.className = 'lb-col';
  prim.innerHTML = '<h3>주 빌드</h3>';
  _lobbyTreeTabs(prim, p.primary, null, (t) => {
    if (t.id === p.primary) return;
    if (t.id === p.secondary) { // 주·보조가 같아지면 보조를 다른 빌드로
      const other = RUNE_TREES.find((x) => x.id !== t.id);
      p.secondary = other.id; p.secondaryRunes = [other.slots[1][0].id, other.slots[2][0].id];
    }
    p.primary = t.id; p.keystone = t.slots[0][0].id; p.rows = [t.slots[1][0].id, t.slots[2][0].id, t.slots[3][0].id];
    _renderLobbyRunes();
  });
  const pt = runeTree(p.primary);
  pt.slots.forEach((runes, i) => {
    const row = document.createElement('div'); row.className = 'lb-row' + (i === 0 ? ' keystones' : '');
    for (const r of runes) {
      const sel = i === 0 ? p.keystone === r.id : p.rows[i - 1] === r.id;
      row.appendChild(_lobbyRuneButton(r, sel, () => { if (i === 0) p.keystone = r.id; else p.rows[i - 1] = r.id; _renderLobbyRunes(); _lobbyRuneInfo(r); }, i === 0 ? 'big' : ''));
    }
    prim.appendChild(row);
  });
  box.appendChild(prim);
  // 보조 빌드
  const sec = document.createElement('div'); sec.className = 'lb-col';
  sec.innerHTML = '<h3>보조 빌드</h3>';
  _lobbyTreeTabs(sec, p.secondary, p.primary, (t) => {
    if (t.id === p.secondary) return;
    p.secondary = t.id; p.secondaryRunes = [t.slots[1][0].id, t.slots[2][0].id];
    _renderLobbyRunes();
  });
  const st = runeTree(p.secondary);
  st.slots.forEach((runes, i) => {
    if (i === 0) return;
    const row = document.createElement('div'); row.className = 'lb-row';
    for (const r of runes) {
      row.appendChild(_lobbyRuneButton(r, p.secondaryRunes.includes(r.id), () => {
        const rowOf = (id) => (runeFind(id) || {}).row;
        const sameRow = p.secondaryRunes.findIndex((id) => rowOf(id) === i);
        if (sameRow >= 0) p.secondaryRunes[sameRow] = r.id; // 같은 줄이면 바꾸기
        else { p.secondaryRunes.push(r.id); if (p.secondaryRunes.length > 2) p.secondaryRunes.shift(); } // 세 번째면 먼저 고른 것 빼기
        _renderLobbyRunes(); _lobbyRuneInfo(r);
      }));
    }
    sec.appendChild(row);
  });
  // 능력치 파편
  const sh = document.createElement('div'); sh.className = 'lb-shards';
  RUNE_SHARD_ROWS.forEach((row, i) => {
    const r = document.createElement('div'); r.className = 'lb-row shard';
    for (const s of row) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lb-shard' + (p.shards[i] === s.key ? ' sel' : ''); b.title = s.name; b.dataset.shard = s.key;
      b.innerHTML = `<img src="assets/runes/shard_${s.key}.png" alt="">`;
      b.addEventListener('mouseenter', () => { const el = _lobbyEl('lobbyRuneInfo'); if (el) el.innerHTML = `<b>능력치 파편</b><div>${s.name}</div>`; });
      b.addEventListener('click', () => { p.shards[i] = s.key; _renderLobbyRunes(); });
      r.appendChild(b);
    }
    sh.appendChild(r);
  });
  sec.appendChild(sh);
  box.appendChild(sec);
}
function _renderLobbySpells() {
  const box = _lobbyEl('lobbySpells'); if (!box || typeof SUMMONER_SPELL_DATA === 'undefined') return;
  box.innerHTML = '';
  const slots = document.createElement('div'); slots.className = 'lb-spell-slots';
  ['D', 'F'].forEach((k, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lb-spell-slot' + (lobbyState.activeSpellSlot === i ? ' active' : ''); b.dataset.slot = k;
    b.innerHTML = `<img src="assets/spells/${lobbyState.spells[i]}.png" alt=""><span>${k}</span>`;
    b.title = `${k}: ${SUMMONER_SPELL_DATA[lobbyState.spells[i]].nameKo}`;
    b.addEventListener('click', () => { lobbyState.activeSpellSlot = i; _renderLobbySpells(); });
    slots.appendChild(b);
  });
  box.appendChild(slots);
  const list = document.createElement('div'); list.className = 'lb-spell-list';
  for (const id of SUMMONER_SPELL_ORDER) {
    const d = SUMMONER_SPELL_DATA[id];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lb-spell' + (lobbyState.spells.includes(id) ? ' sel' : ''); b.dataset.spell = id; b.title = `${d.nameKo}\n${d.descKo}`;
    b.innerHTML = `<img src="assets/spells/${id}.png" alt="">`;
    b.addEventListener('click', () => {
      const i = lobbyState.activeSpellSlot, other = 1 - i;
      if (lobbyState.spells[other] === id) lobbyState.spells[other] = lobbyState.spells[i]; // 같은 주문 두 개는 못 든다 - 서로 바꾸기
      lobbyState.spells[i] = id; lobbyState.activeSpellSlot = other;
      _renderLobbySpells();
    });
    list.appendChild(b);
  }
  box.appendChild(list);
}
function lobbyStart() {
  const champ = lobbyState.champ, page = lobbyState.page;
  if (!runeValidatePage(page)) { if (typeof showSkillToast === 'function') showSkillToast('룬 페이지가 올바르지 않습니다'); return; }
  runeSavePage(champ, page);
  _lobbySave(LOBBY_CHAMP_KEY, champ); _lobbySave(LOBBY_SPELLS_KEY, lobbyState.spells);
  closeLobby();
  if (typeof controller !== 'undefined' && controller && controller.championId === champ) { runeSetPage(controller, page); lobbyApplyPending(controller, lobbyState.spells); return; }
  lobbyState.pendingSpells = lobbyState.spells.slice();
  if (typeof loadChampionFromLibrary === 'function') loadChampionFromLibrary(champ);
}
// 챔피언을 다 불러온 뒤(로더가 부른다): 로비에서 고른 소환사 주문을 넣고 로비를 닫는다.
function lobbyApplyPending(ctrl, spells = null) {
  const s = spells || lobbyState.pendingSpells || (lobbyState.champ ? null : null);
  if (ctrl && s && typeof setSummonerSpell === 'function') { setSummonerSpell(ctrl, 'D', s[0]); setSummonerSpell(ctrl, 'F', s[1]); }
  lobbyState.pendingSpells = null;
  closeLobby();
  if (typeof updateHudStats === 'function') updateHudStats(ctrl, true);
}

if (typeof document !== 'undefined') {
  const start = _lobbyEl('lobbyStartBtn'); if (start) start.addEventListener('click', lobbyStart);
  const reset = _lobbyEl('lobbyResetRunes'); if (reset) reset.addEventListener('click', () => { lobbyState.page = runeDefaultPage(lobbyState.champ); _renderLobbyRunes(); });
  const open = _lobbyEl('openLobbyBtn'); if (open) open.addEventListener('click', openLobby);
  const params = new URLSearchParams(location.search);
  if (!params.get('champ') && !params.has('nolobby')) openLobby();
}
