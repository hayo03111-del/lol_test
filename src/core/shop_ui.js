/* ============================================================
   SHOP UI (상점 창 - 33차)
   ------------------------------------------------------------
   요청("제대로 된 ui를 갖춘 상점을 만들어줘") - 화면 왼쪽 아래의 작은 목록
   패널(#shopPanel)을 업로드된 moba_ui_system 디자인(베벨 패널·청동 강조색·
   왼쪽 분류/가운데 아이템 격자/오른쪽 상세)의 상점 창으로 바꾼다.

   - P키(원작 기본 키) 또는 하단 HUD의 상점 버튼으로 연다. P/Esc/✕로 닫는다.
     창을 열어 둔 동안에도 게임은 계속 돌아가고, 창 바깥의 맵은 그대로 클릭된다(원작과 같다).
   - 왼쪽: 분류(ITEM_CATEGORIES + 전체) + 능력치 필터(여러 개 동시 선택 = 모두 만족).
   - 가운데: 아이템 격자. 클릭 = 선택, 우클릭 = 바로 구매(원작 조작).
   - 오른쪽: 선택한 아이템의 가격·효과·조합 경로(하위템/상위템)와 구매 버튼.
   - 아래: 보유 아이템 6칸 + 신발 + 장신구. 칸을 고르면 판매 버튼이 뜬다.

   구매/조합/판매 자체는 전부 item_system.js(buildOrBuyItem/sellItem/sellBoots)가
   처리한다 - 이 파일은 그 함수들을 부르기만 한다. 다만 그 함수들은 실패를
   콘솔 경고로만 알리므로, 같은 조건을 미리 따져(shopBlockReason) 버튼에
   "왜 못 사는지"를 바로 보여준다.
   아이콘은 assets/items/<아이템 id>.png(원작 아이콘 - tools/fetch_item_icons.py로 받음)를 쓰고, 그림이 없으면
   이름 두 글자 + 주 능력치 색 타일로 대신 그린다.
   ============================================================ */
const ITEM_SLOT_KEYS = ['1', '2', '3', '5', '6', '7']; // 원작 키 배치 - 4는 장신구(와드)
const SHOP_STAT_FILTERS = [
  { id: 'ad', icon: 'attack_damage', nameKo: '공격력', test: (it, s) => s.attackDamage },
  { id: 'as', icon: 'attack_speed', nameKo: '공격 속도', test: (it, s) => s.attackSpeedPercent },
  { id: 'crit', icon: 'critical_chance', nameKo: '치명타', test: (it, s) => s.critChance || it.critDamagePercent },
  { id: 'vamp', icon: 'life_steal', nameKo: '생명력 흡수', test: (it) => it.physicalVampPercent || it.allDamageVampPercent },
  { id: 'pen', icon: 'armor_pen', nameKo: '관통력', test: (it) => it.armorPenFlat || it.armorPenPercent || it.magicPenPercent },
  { id: 'ap', icon: 'ability_power', nameKo: '주문력', test: (it, s) => s.abilityPower },
  { id: 'mana', icon: 'mana', nameKo: '마나·마나 재생', test: (it, s) => s.mana || s.mpRegenPercent },
  { id: 'haste', icon: 'cdr_reduction', nameKo: '스킬 가속', test: (it, s) => s.abilityHaste },
  { id: 'hp', icon: 'health', nameKo: '체력·체력 재생', test: (it, s) => s.maxHp || s.hpRegenPercent },
  { id: 'armor', icon: 'armor', nameKo: '방어력', test: (it, s) => s.armor },
  { id: 'mr', icon: 'magic_resist', nameKo: '마법 저항력', test: (it, s) => s.magicResist },
  { id: 'ms', icon: 'move_speed', nameKo: '이동 속도', test: (it, s) => s.moveSpeed || it.isBoots },
];
// 아이콘 색(주 능력치 순서대로 처음 맞는 것).
const SHOP_ICON_TONES = [
  { test: (it) => it.consumable || it.elixirEffect || it.wardPlacement, tone: '#c9a94f' },
  { test: (it) => it.isBoots, tone: '#b08a5a' },
  { test: (it, s) => s.abilityPower, tone: '#9a6fd0' },
  { test: (it, s) => s.attackDamage || s.critChance || s.attackSpeedPercent, tone: '#c9774a' },
  { test: (it, s) => s.armor || s.magicResist || s.maxHp, tone: '#5fa876' },
  { test: (it, s) => s.mana || s.mpRegenPercent, tone: '#4d84c4' },
];

// 70차 원작 상점의 "추천" 탭: 챔피언 역할(룬 기본 역할과 같은 분류)별 시작·신발·핵심·상황 아이템.
const SHOP_RECOMMENDED = {
  mage: { starter: ['doransRing', 'darkSeal', 'healthPotion'], boots: ['sorcerersShoes', 'ionianBootsOfLucidity'],
    core: ['ludensEcho', 'malignance', 'liandrysTorment', 'shadowflame', 'rabadonsDeathcap', 'voidStaff'],
    situational: ['zhonyasHourglass', 'banshees', 'rylaisCrystalScepter', 'archangelsStaff', 'lichBane', 'cosmicDrive'] },
  marksman: { starter: ['doransBlade', 'doransBow', 'healthPotion'], boots: ['berserkersGreaves', 'bootsOfSwiftness'],
    core: ['krakenSlayer', 'infinityEdge', 'collector', 'phantomDancer', 'lordDominiksRegards', 'bloodthirster'],
    situational: ['guardianAngel', 'immortalShieldbow', 'mortalReminder', 'rapidFireCannon', 'rageblade', 'youmuusGhostblade'] },
  fighter: { starter: ['doransBlade', 'doransShield', 'healthPotion'], boots: ['platedSteelcaps', 'mercurysTreads'],
    core: ['trinityForce', 'blackCleaver', 'sterakssGage', 'deathsDance', 'eclipse', 'titanicHydra'],
    situational: ['guardianAngel', 'maw', 'spiritVisage', 'thornmail', 'hullbreaker', 'warmogsArmor'] },
};
const SHOP_REC_SECTIONS = [['starter', '시작 아이템'], ['boots', '신발'], ['core', '핵심 아이템'], ['situational', '상황별 아이템']];
const SHOP_ROLE_NAMES = { mage: '마법사', marksman: '원거리 딜러', fighter: '전사' };
function _shopRole(ctrl) {
  const id = ctrl && ctrl.championId;
  return (typeof RUNE_DEFAULT_ROLE !== 'undefined' && RUNE_DEFAULT_ROLE[id]) || 'fighter';
}
let _shopOpen = false;
let _shopTab = 'all'; // 'rec'(추천) | 'all'(모든 아이템)
let _shopCat = 'all';
const _shopStatFilters = new Set();
let _shopSearch = '';
let _shopSelectedItemId = null;
let _shopSelectedSlot = null; // 인벤토리 칸 번호(0~5) 또는 'boots'
let _shopStateSig = '';
let _shopTicker = null;
let _shopHadBounty = false;
function _shopOwnsBounty() { return !!(controller && (controller.items || []).some((s) => s.id === 'bountyOfWorlds')); }

function _shopEl(id) { return document.getElementById(id); }
function _shopEsc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function _shopIconText(item) { return item.nameKo.replace(/\s+/g, '').slice(0, 2); }
function _shopIconTone(item) {
  const s = item.stats || {};
  const hit = SHOP_ICON_TONES.find((t) => t.test(item, s));
  return hit ? hit.tone : '#7d8590';
}
function _shopIconHtml(item, cls) {
  // 그림을 못 읽으면(파일 없음) img를 지워 아래 글자 타일이 보이게 한다.
  return `<div class="shop-icon bevel-s ${cls || ''}" style="--tone:${_shopIconTone(item)}"><span>${_shopEsc(_shopIconText(item))}</span><img src="assets/items/${_shopEsc(item.id)}.png" alt="" draggable="false" onerror="this.remove()"></div>`;
}
function _shopInBase(ctrl) {
  if (!ctrl || !ctrl.root) return false;
  return typeof isPositionInBaseZone !== 'function' || isPositionInBaseZone(ctrl.root.position, ctrl.team || PLAYER_TEAM);
}
function _shopCanBuild(ctrl, item) {
  return !!(ctrl && item.recipe && item.recipe.length && typeof hasComponents === 'function' && hasComponents(ctrl, item.recipe));
}
function _shopPayCost(ctrl, item) {
  return _shopCanBuild(ctrl, item) ? combineCost(item) : item.cost;
}
// buyItem()/buildOrBuyItem()이 거절하는 조건을 같은 순서로 미리 따진다. null이면 살 수 있다.
function shopBlockReason(ctrl, itemId) {
  const item = typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[itemId] : null;
  if (!ctrl) return '챔피언을 먼저 불러오세요';
  if (!item) return '알 수 없는 아이템';
  if (item.trinket) return '기본 장착(구매 불필요)';
  if (!_shopInBase(ctrl)) return '기지 안에서만 구매 가능';
  const build = _shopCanBuild(ctrl, item);
  if (typeof _itemUniqueGroupConflict === 'function' && _itemUniqueGroupConflict(ctrl, item, build ? new Set(item.recipe) : null)) return '같은 계열 유일 아이템 보유 중';
  if (item.isBoots && ctrl.boots && ctrl.boots.id === itemId) return '이미 착용 중';
  if (item.upgradeOnly && !build) return '세계의 결실을 업그레이드해서만 얻음';
  if (typeof _itemLegendaryDuplicate === 'function' && _itemLegendaryDuplicate(ctrl, item)) return '같은 전설급 아이템 보유 중';
  const cost = _shopPayCost(ctrl, item);
  const gold = Math.floor(ctrl.gold || 0);
  if (gold < cost) return `골드 부족 (${(cost - gold).toLocaleString()} 더 필요)`;
  if (!build && !item.isBoots) {
    const items = ctrl.items || [];
    if (item.maxStack) {
      const held = items.filter((s) => s.id === itemId).reduce((sum, s) => sum + (s.count || 1), 0);
      if (held >= item.maxStack) return `최대 ${item.maxStack}개까지 보유 가능`;
      if (!items.some((s) => s.id === itemId) && items.length >= 6) return '인벤토리가 가득 참';
    } else if (items.length >= 6) return '인벤토리가 가득 참';
  }
  return null;
}
// 63차 되돌리기(원작 상점의 Undo): 기지 안에서 한 구매·판매를 순서대로 되돌린다. 거래 직전의 골드·인벤토리·신발을 통째로
// 저장해 두었다가 복원한다(조합으로 사라진 재료도 그대로 돌아온다). 기지를 벗어나거나 챔피언이 바뀌면 기록을 비운다.
let _shopUndoStack = [];
let _shopLastInvClick = null;
function _shopSnapshot(label) {
  const c = controller;
  if (!c) return;
  _shopUndoStack.push({
    ctrl: c, label, gold: c.gold || 0,
    items: (c.items || []).map((s) => ({ ...s })),
    boots: c.boots ? { ...c.boots } : null,
    bootsExtra: c._itemBootsExtraMoveSpeedLol || 0,
  });
  if (_shopUndoStack.length > 20) _shopUndoStack.shift();
}
function shopUndo() {
  const snap = _shopUndoStack.pop();
  if (!snap || snap.ctrl !== controller) { _shopUndoStack = []; renderShopPanel(true); return false; }
  const c = controller;
  c.gold = snap.gold; c.items = snap.items; c.boots = snap.boots; c._itemBootsExtraMoveSpeedLol = snap.bootsExtra;
  if (typeof recomputeItemStats === 'function') recomputeItemStats(c);
  if (typeof updateGoldDisplay === 'function') updateGoldDisplay();
  if (typeof updateItemUI === 'function') updateItemUI(c);
  _shopSelectedSlot = null;
  renderShopPanel(true);
  if (typeof showSkillToast === 'function') showSkillToast(`되돌리기: ${snap.label}`);
  return true;
}
function _shopBuy(itemId) {
  const reason = shopBlockReason(controller, itemId);
  if (reason) { if (typeof showSkillToast === 'function') showSkillToast(reason); return false; }
  _shopSnapshot(`${(ITEM_DATA[itemId] || {}).nameKo || itemId} 구매`);
  const ok = typeof buildOrBuyItem === 'function' && buildOrBuyItem(controller, itemId);
  if (!ok) _shopUndoStack.pop();
  if (ok) {
    const tile = document.querySelector(`#shopGrid .shop-tile[data-id="${itemId}"]`);
    if (tile) { tile.classList.remove('bought'); void tile.offsetWidth; tile.classList.add('bought'); }
  }
  return ok;
}
function _shopSell() {
  if (!controller || _shopSelectedSlot == null) return;
  const sel = _shopSelectedSlot === 'boots' ? controller.boots : controller.items[_shopSelectedSlot];
  if (!sel) { _shopSelectedSlot = null; renderShopPanel(true); return; }
  _shopSnapshot(`${(ITEM_DATA[sel.id] || {}).nameKo || sel.id} 판매`);
  const ok = _shopSelectedSlot === 'boots' ? (typeof sellBoots === 'function' && sellBoots(controller)) : (typeof sellItem === 'function' && sellItem(controller, _shopSelectedSlot));
  if (!ok) _shopUndoStack.pop();
  else if (typeof showSkillToast === 'function') showSkillToast(`${(ITEM_DATA[sel.id] || {}).nameKo || sel.id} 판매`);
  _shopSelectedSlot = null;
  renderShopPanel(true);
}

function _shopVisibleIds(cat) {
  const q = _shopSearch.trim().replace(/\s+/g, '');
  return cat.items.filter((id) => {
    const item = ITEM_DATA[id];
    if (!item || item.hiddenFromShop) return false;
    if (q && !item.nameKo.replace(/\s+/g, '').includes(q)) return false;
    const s = item.stats || {};
    for (const fid of _shopStatFilters) {
      const f = SHOP_STAT_FILTERS.find((x) => x.id === fid);
      if (f && !f.test(item, s)) return false;
    }
    return true;
  });
}
function _shopRenderCats() {
  const nav = _shopEl('shopCats');
  if (!nav) return;
  const cats = [{ id: 'all', nameKo: '전체 아이템' }].concat(ITEM_CATEGORIES);
  let html = '<div class="shop-nav-label uc">분류</div>';
  for (const c of cats) html += `<button class="shop-cat${_shopTab === 'all' && c.id === _shopCat ? ' active' : ''}" data-cat="${c.id}">${_shopEsc(c.nameKo)}</button>`;
  html += '<div class="shop-nav-label uc">능력치</div><div class="shop-filters">';
  for (const f of SHOP_STAT_FILTERS) html += `<button class="shop-filter bevel-s${_shopStatFilters.has(f.id) ? ' on' : ''}" data-filter="${f.id}" title="${_shopEsc(f.nameKo)}"><img src="assets/stat_icons/${f.icon}.png" alt="" draggable="false"><span>${_shopEsc(f.nameKo)}</span></button>`;
  html += '</div>';
  if (_shopStatFilters.size || _shopSearch) html += '<button class="shop-reset" data-reset="1">필터 초기화</button>';
  nav.innerHTML = html;
  document.querySelectorAll('#shopTabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === _shopTab));
}
function _shopRenderGrid() {
  const grid = _shopEl('shopGrid');
  if (!grid) return;
  if (_shopTab === 'rec') {
    const role = _shopRole(controller), rec = SHOP_RECOMMENDED[role] || SHOP_RECOMMENDED.fighter;
    _shopHadBounty = _shopOwnsBounty();
    let html = `<div class="shop-rec-role">${_shopEsc((controller && controller.championId) ? `${SHOP_ROLE_NAMES[role] || role} 추천 빌드` : '추천 빌드')}</div>`;
    for (const [key, name] of SHOP_REC_SECTIONS) {
      const ids = _shopVisibleIds({ items: (rec[key] || []).filter((id) => ITEM_DATA[id]) });
      if (!ids.length) continue;
      html += `<div class="shop-section rec"><div class="shop-section-head uc">${_shopEsc(name)}<span>${ids.length}</span></div><div class="shop-tiles">`;
      for (const id of ids) html += `<div class="shop-tile" data-id="${id}" title="${_shopEsc(ITEM_DATA[id].nameKo)}">${_shopIconHtml(ITEM_DATA[id])}<div class="st-name">${_shopEsc(ITEM_DATA[id].nameKo)}</div><div class="st-cost"></div></div>`;
      html += '</div></div>';
    }
    grid.innerHTML = html;
    _shopStateSig = '';
    renderShopPanel(true);
    return;
  }
  let cats = _shopCat === 'all' ? ITEM_CATEGORIES : ITEM_CATEGORIES.filter((c) => c.id === _shopCat);
  // 37차: 세계의 결실을 들고 있으면 맨 위에 업그레이드 5종(무료)을 보여 준다(원작 상점의 업그레이드 선택).
  _shopHadBounty = _shopOwnsBounty();
  if (_shopHadBounty && (_shopCat === 'all' || _shopCat === 'support')) {
    cats = [{ id: 'bountyUpgrade', nameKo: '세계의 결실 업그레이드 (무료)', items: Object.keys(ITEM_DATA).filter((id) => ITEM_DATA[id].upgradeOnly) }].concat(cats);
  }
  let html = '';
  for (const cat of cats) {
    const ids = _shopVisibleIds(cat);
    if (!ids.length) continue;
    html += `<div class="shop-section"><div class="shop-section-head uc">${_shopEsc(cat.nameKo)}<span>${ids.length}</span></div><div class="shop-tiles">`;
    for (const id of ids) {
      const item = ITEM_DATA[id];
      html += `<div class="shop-tile" data-id="${id}" title="${_shopEsc(item.nameKo)}">${_shopIconHtml(item)}<div class="st-name">${_shopEsc(item.nameKo)}</div><div class="st-cost"></div></div>`;
    }
    html += '</div></div>';
  }
  grid.innerHTML = html || '<div class="shop-empty">조건에 맞는 아이템이 없습니다.</div>';
  _shopStateSig = '';
  renderShopPanel(true);
}
// 격자 타일의 상태(가격·구매 가능·보유·선택)만 다시 칠한다 - 격자 전체를 다시 만들지 않는다.
function _shopPaintTiles() {
  const ctrl = controller;
  const ownedCount = {};
  if (ctrl) {
    for (const s of ctrl.items || []) ownedCount[s.id] = (ownedCount[s.id] || 0) + (s.count || 1);
    if (ctrl.boots) ownedCount[ctrl.boots.id] = 1;
  }
  document.querySelectorAll('#shopGrid .shop-tile').forEach((tile) => {
    const id = tile.dataset.id;
    const item = ITEM_DATA[id];
    const build = _shopCanBuild(ctrl, item);
    const cost = _shopPayCost(ctrl, item);
    const reason = shopBlockReason(ctrl, id);
    tile.classList.toggle('selected', id === _shopSelectedItemId);
    tile.classList.toggle('blocked', !!reason);
    tile.classList.toggle('poor', !!ctrl && Math.floor(ctrl.gold || 0) < cost);
    tile.classList.toggle('buildable', build);
    tile.classList.toggle('owned', !!ownedCount[id]);
    tile.querySelector('.st-cost').textContent = `${cost.toLocaleString()}${item.priceGuessed ? '*' : ''}`;
  });
}
function _shopZoneHtml(ctrl) {
  if (!ctrl) return '<span class="zone-off">챔피언 없음</span>';
  return _shopInBase(ctrl)
    ? '<span class="zone-on">● 기지 안 - 구매 가능</span>'
    : '<span class="zone-off">● 기지 밖 - 구매 불가 (B: 귀환)</span>';
}
function _shopTileMini(id, ownedSet) {
  const item = ITEM_DATA[id];
  if (!item) return '';
  const owned = ownedSet && ownedSet.has(id);
  return `<div class="shop-mini${owned ? ' owned' : ''}" data-id="${id}" title="${_shopEsc(item.nameKo)} (${item.cost.toLocaleString()})">${_shopIconHtml(item)}<span>${item.cost.toLocaleString()}</span></div>`;
}
// 조합 경로: 하위템과 그 하위템의 하위템(2단계)까지. 보유 중인 하위템은 표시한다(개수만큼만).
function _shopRecipeHtml(item, ctrl) {
  if (!item.recipe || !item.recipe.length) return '';
  const pool = ((ctrl && ctrl.items) || []).map((s) => s.id);
  const take = (id) => { const i = pool.indexOf(id); if (i < 0) return false; pool.splice(i, 1); return true; };
  let html = `<div class="sd-label uc">조합 경로</div><div class="sd-tree"><div class="sd-tree-top">${_shopTileMini(item.id)}</div><div class="sd-tree-row">`;
  for (const cid of item.recipe) {
    const comp = ITEM_DATA[cid];
    if (!comp) continue;
    const owned = take(cid);
    html += `<div class="sd-tree-node">${_shopTileMini(cid, owned ? new Set([cid]) : null)}`;
    if (!owned && comp.recipe && comp.recipe.length) {
      html += '<div class="sd-tree-sub">';
      for (const gid of comp.recipe) html += _shopTileMini(gid, take(gid) ? new Set([gid]) : null);
      html += '</div>';
    }
    html += '</div>';
  }
  return html + '</div></div>';
}
function _shopDescHtml(item) {
  const lines = (typeof _itemStatsSummary === 'function' ? _itemStatsSummary(item) : '').split(' · ').filter((l) => l && !l.startsWith('하위템:'));
  const statRe = /^[^(:]{1,14} \+[\d.]+%?$/;
  const stats = lines.filter((l) => statRe.test(l));
  const rest = lines.filter((l) => !statRe.test(l));
  let html = '';
  if (stats.length) html += `<ul class="sd-stats">${stats.map((l) => `<li>${_shopEsc(l)}</li>`).join('')}</ul>`;
  if (rest.length) html += `<div class="sd-passives">${rest.map((l) => `<p>${_shopEsc(l)}</p>`).join('')}</div>`;
  return html || '<div class="sd-passives"><p>추가 효과 없음</p></div>';
}
function _shopRenderDetail() {
  const box = _shopEl('shopDetail');
  if (!box) return;
  const ctrl = controller;
  const item = _shopSelectedItemId ? ITEM_DATA[_shopSelectedItemId] : null;
  if (!item) {
    box.innerHTML = '<div class="sd-empty">아이템을 선택하세요.<br><small>클릭: 정보 보기 · 우클릭: 바로 구매</small></div>';
    return;
  }
  const build = _shopCanBuild(ctrl, item);
  const cost = _shopPayCost(ctrl, item);
  const reason = shopBlockReason(ctrl, item.id);
  const catName = (ITEM_CATEGORIES.find((c) => c.items.includes(item.id)) || {}).nameKo;
  const buildsInto = (typeof ITEM_ORDER !== 'undefined' ? ITEM_ORDER : Object.keys(ITEM_DATA))
    .filter((id) => ITEM_DATA[id] && !ITEM_DATA[id].hiddenFromShop && ITEM_DATA[id].recipe && ITEM_DATA[id].recipe.includes(item.id));
  // 70차 원작 배치: 위쪽에 "상위 아이템" 줄과 조합 트리, 아래에 이름·가격·능력치·효과.
  let html = '';
  if (buildsInto.length) html += `<div class="sd-label uc first">상위 아이템</div><div class="sd-into">${buildsInto.map((id) => _shopTileMini(id)).join('')}</div>`;
  html += _shopRecipeHtml(item, ctrl);
  html += `<div class="sd-head">${_shopIconHtml(item, 'big')}<div><div class="sd-name">${_shopEsc(item.nameKo)}</div>`;
  html += `<div class="sd-cost">${item.trinket ? '기본 장착' : `${cost.toLocaleString()} GOLD`}${build && cost !== item.cost ? ` <s>${item.cost.toLocaleString()}</s>` : ''}</div>`;
  html += '<div class="sd-tags">';
  if (catName) html += `<span>${_shopEsc(catName)}</span>`;
  if (build) html += '<span class="good">조합 가능</span>';
  if (item.uniqueGroup) html += '<span>유일</span>';
  html += '</div></div></div>';
  html += _shopDescHtml(item);
  if (item.priceGuessed) html += '<div class="sd-note">* 원문에 가격이 없어 실제 LoL 가격을 사용</div>';
  box.innerHTML = `<div class="sd-scroll">${html}</div>`
    + `<button class="sd-buy bevel-s${reason ? ' blocked' : ''}" data-buy="${item.id}">${reason ? _shopEsc(reason) : `${build ? '조합' : item.isBoots && ctrl && ctrl.boots ? '교체' : '구매'} · ${cost.toLocaleString()}`}</button>`;
}
function _shopRenderInventory() {
  const box = _shopEl('shopInv');
  if (!box) return;
  const ctrl = controller;
  const items = (ctrl && ctrl.items) || [];
  let html = '';
  for (let i = 0; i < 6; i++) {
    const slot = items[i];
    const data = slot ? ITEM_DATA[slot.id] : null;
    const badge = data ? (typeof slot.charges === 'number' ? `${slot.charges}/${data.maxCharges}` : (slot.count > 1 ? slot.count : '')) : '';
    html += `<div class="shop-inv-slot${data ? '' : ' empty'}${_shopSelectedSlot === i ? ' selected' : ''}" data-slot="${i}" title="${data ? _shopEsc(data.nameKo) : '빈 칸'}"><span class="key">${ITEM_SLOT_KEYS[i]}</span>${data ? _shopIconHtml(data) : ''}${badge !== '' ? `<span class="badge">${badge}</span>` : ''}</div>`;
  }
  const boots = ctrl && ctrl.boots ? ITEM_DATA[ctrl.boots.id] : null;
  html += `<div class="shop-inv-gap"></div><div class="shop-inv-slot${boots ? '' : ' empty'}${_shopSelectedSlot === 'boots' ? ' selected' : ''}" data-slot="boots" title="${boots ? _shopEsc(boots.nameKo) : '신발 칸'}"><span class="key">신발</span>${boots ? _shopIconHtml(boots) : ''}</div>`;
  const trinket = ctrl && ctrl.trinket ? ITEM_DATA[ctrl.trinket.id] : null;
  html += `<div class="shop-inv-slot trinket${trinket ? '' : ' empty'}" title="${trinket ? _shopEsc(trinket.nameKo) + ' (4키: 설치)' : '장신구'}"><span class="key">4</span>${trinket ? _shopIconHtml(trinket) : ''}${trinket ? `<span class="badge">${ctrl.trinket.charges}/${trinket.maxCharges}</span>` : ''}</div>`;
  box.innerHTML = html;
  // 판매 버튼
  const sellBtn = _shopEl('shopSellBtn');
  const info = _shopEl('shopSlotInfo');
  let sel = null, price = 0;
  if (ctrl && _shopSelectedSlot === 'boots' && boots) { sel = boots; price = Math.floor(boots.cost * 0.7); }
  else if (ctrl && typeof _shopSelectedSlot === 'number' && items[_shopSelectedSlot]) {
    const s = items[_shopSelectedSlot];
    sel = ITEM_DATA[s.id];
    price = sel ? Math.floor((sel.cost || 0) * (s.count || 1) * 0.7) : 0;
  } else _shopSelectedSlot = null;
  if (sellBtn) { sellBtn.disabled = !sel; sellBtn.textContent = sel ? `판매 +${price.toLocaleString()}` : '판매'; }
  const undoBtn = _shopEl('shopUndoBtn');
  if (undoBtn) {
    if (_shopUndoStack.length && _shopUndoStack[_shopUndoStack.length - 1].ctrl !== ctrl) _shopUndoStack = [];
    undoBtn.disabled = !_shopUndoStack.length;
    undoBtn.title = _shopUndoStack.length ? `되돌리기: ${_shopUndoStack[_shopUndoStack.length - 1].label}` : '되돌릴 거래가 없습니다';
  }
  if (info) info.textContent = sel ? sel.nameKo : '보유 아이템을 고르면 판매할 수 있습니다';
}
// 골드·보유 아이템·위치(기지 안/밖)가 바뀌면 다시 칠한다. 닫혀 있으면 아무것도 안 한다
// (updateGoldDisplay()/updateItemUI()가 자주 불러도 비용이 없다).
function renderShopPanel(force) {
  if (!_shopOpen || typeof ITEM_DATA === 'undefined') return;
  const ctrl = controller;
  const sig = ctrl
    ? [Math.floor(ctrl.gold || 0), _shopInBase(ctrl), (ctrl.items || []).map((s) => `${s.id}:${s.count}:${s.charges}`).join(','), ctrl.boots && ctrl.boots.id, ctrl.trinket && ctrl.trinket.charges, _shopSelectedItemId, _shopSelectedSlot].join('|')
    : 'none';
  if (!force && sig === _shopStateSig) return;
  _shopStateSig = sig;
  if (ctrl && !_shopInBase(ctrl) && _shopUndoStack.length) _shopUndoStack = []; // 63차: 기지를 벗어나면 되돌리기 기록을 비운다(원작)
  if (_shopOwnsBounty() !== _shopHadBounty) { _shopRenderGrid(); return; } // 세계의 결실을 얻거나 업그레이드하면 업그레이드 줄을 다시 그린다
  const goldEl = _shopEl('shopGold');
  if (goldEl) goldEl.textContent = ctrl ? Math.floor(ctrl.gold || 0).toLocaleString() : '0';
  const zone = _shopEl('shopZoneChip');
  if (zone) zone.innerHTML = _shopZoneHtml(ctrl);
  _shopPaintTiles();
  _shopRenderDetail();
  _shopRenderInventory();
}
function _shopSelectItem(id) {
  if (!ITEM_DATA[id]) return;
  _shopSelectedItemId = id;
  renderShopPanel(true);
}
function setShopOpen(open) {
  const overlay = _shopEl('shopOverlay');
  if (!overlay) return;
  _shopOpen = !!open;
  overlay.classList.toggle('show', _shopOpen);
  clearInterval(_shopTicker);
  _shopTicker = null;
  if (_shopOpen) {
    _shopRenderCats();
    _shopRenderGrid();
    // 걸어서 기지에 들어가고 나가는 것은 이벤트가 없으니 열려 있는 동안만 가볍게 확인한다.
    _shopTicker = setInterval(() => renderShopPanel(false), 250);
  } else {
    const search = _shopEl('shopSearch');
    if (search && document.activeElement === search) search.blur();
  }
}
function toggleShop() { setShopOpen(!_shopOpen); }
function isShopOpen() { return _shopOpen; }

(function initShopUi() {
  const overlay = _shopEl('shopOverlay');
  if (!overlay) return;
  _shopEl('shopCloseBtn').addEventListener('click', () => setShopOpen(false));
  _shopEl('shopSellBtn').addEventListener('click', _shopSell);
  const undoBtn = _shopEl('shopUndoBtn');
  if (undoBtn) undoBtn.addEventListener('click', shopUndo);
  // 63차: 인벤토리 칸 우클릭 = 바로 판매, 더블클릭 = 사용(사용 아이템). 상점이 열려 있어도 숫자키로 쓸 수 있다.
  _shopEl('shopInv').addEventListener('contextmenu', (e) => {
    const slot = e.target.closest('.shop-inv-slot[data-slot]');
    if (!slot || slot.classList.contains('empty')) return;
    e.preventDefault();
    _shopSelectedSlot = slot.dataset.slot === 'boots' ? 'boots' : Number(slot.dataset.slot);
    _shopSell();
  });

  const tabs = _shopEl('shopTabs');
  if (tabs) tabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    _shopTab = t.dataset.tab;
    _shopRenderCats();
    _shopRenderGrid();
  });
  const search = _shopEl('shopSearch');
  search.addEventListener('input', () => { _shopSearch = search.value; _shopRenderCats(); _shopRenderGrid(); });
  _shopEl('shopCats').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-cat]');
    const filter = e.target.closest('[data-filter]');
    if (cat) { _shopCat = cat.dataset.cat; _shopTab = 'all'; }
    else if (filter) { const id = filter.dataset.filter; if (_shopStatFilters.has(id)) _shopStatFilters.delete(id); else _shopStatFilters.add(id); }
    else if (e.target.closest('[data-reset]')) { _shopStatFilters.clear(); _shopSearch = ''; search.value = ''; }
    else return;
    _shopRenderCats();
    _shopRenderGrid();
  });
  // 격자·조합 경로·상위 아이템의 타일: 클릭 = 선택, 우클릭 = 바로 구매.
  const pick = (e) => e.target.closest('.shop-tile[data-id], .shop-mini[data-id]');
  overlay.addEventListener('click', (e) => {
    const buy = e.target.closest('[data-buy]');
    if (buy) { _shopBuy(buy.dataset.buy); return; }
    const t = pick(e);
    if (t) { _shopSelectItem(t.dataset.id); return; }
    const slot = e.target.closest('.shop-inv-slot[data-slot]');
    if (slot && !slot.classList.contains('empty')) {
      const v = slot.dataset.slot === 'boots' ? 'boots' : Number(slot.dataset.slot);
      // 63차 더블클릭 = 사용: 첫 클릭이 칸을 선택하며 인벤토리를 다시 그려서 브라우저 dblclick이 같은 칸으로 묶이지 않는다 -
      // 같은 칸을 0.35초 안에 다시 누르면 직접 더블클릭으로 본다.
      const now = performance.now();
      if (_shopLastInvClick && _shopLastInvClick.v === v && now - _shopLastInvClick.t < 350 && v !== 'boots') {
        _shopLastInvClick = null;
        if (typeof useItemFromInput === 'function') useItemFromInput(v, { placeAhead: true });
        _shopSelectedSlot = null;
        renderShopPanel(true);
        return;
      }
      _shopLastInvClick = { v, t: now };
      _shopSelectedSlot = _shopSelectedSlot === v ? null : v;
      const ctrl = controller;
      const id = v === 'boots' ? ctrl && ctrl.boots && ctrl.boots.id : ctrl && ctrl.items[v] && ctrl.items[v].id;
      if (_shopSelectedSlot != null && id) _shopSelectedItemId = id;
      renderShopPanel(true);
    }
  });
  overlay.addEventListener('contextmenu', (e) => {
    const t = pick(e);
    if (t) { e.preventDefault(); _shopSelectedItemId = t.dataset.id; _shopBuy(t.dataset.id); renderShopPanel(true); }
  });
  const hudBtn = _shopEl('hudShopBtn');
  if (hudBtn) hudBtn.addEventListener('click', toggleShop);
})();
