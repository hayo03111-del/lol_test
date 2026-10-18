/* ============================================================
   하단 HUD 능력치 칸 + 패시브 칸 + 스킬·초상화 아이콘 - 48차
   ------------------------------------------------------------
   - 능력치 칸(#hudStats): 원작 왼쪽 아래 능력치 창처럼 8개(공격력·주문력·방어력·마법 저항력·공격 속도·스킬 가속·
     치명타 확률·이동 속도). 칸을 누르면 두 번째 쪽(방어구 관통·마법 관통·생명력 흡수·모든 피해 흡혈·사거리·강인함·
     체력 재생·마나 재생)으로 바뀐다. 값은 0.15초마다 갱신(updateCooldowns가 매 프레임 부르지만 DOM은 바뀔 때만 고친다).
   - 패시브 칸(#slotP): Q 앞. 챔피언 패시브 아이콘, 마우스를 올리면 이름·설명(CHAMPION_DATA 설명 우선, 없으면 Data Dragon 한글).
   - 스킬 칸 Q/W/E/R과 초상화에 Data Dragon 아이콘(assets/champion_icons/<id>/ - tools/fetch_champion_icons.py).
   ============================================================ */
const HUD_ICON_DIR = 'assets/champion_icons/';
// 능력치 아이콘(간단한 SVG - 원작 능력치 아이콘 그림은 Data Dragon 미러에 없어 직접 그렸다)
const HUD_STAT_ICONS = {
  ad: '<svg viewBox="0 0 16 16"><path d="M3 13l7-7 1-3 2-1-1 2-3 1-7 7z" fill="#e8a33d"/><path d="M2 12l2 2" stroke="#e8a33d" stroke-width="1.6"/></svg>',
  ap: '<svg viewBox="0 0 16 16"><path d="M8 1l2 5 5 .5-4 3.5 1.3 5L8 12.3 3.7 15 5 10 1 6.5 6 6z" fill="#b57ce8"/></svg>',
  armor: '<svg viewBox="0 0 16 16"><path d="M8 1l6 2.5v4C14 11 11.5 13.8 8 15 4.5 13.8 2 11 2 7.5v-4z" fill="#e0b25c"/></svg>',
  mr: '<svg viewBox="0 0 16 16"><path d="M8 1l6 2.5v4C14 11 11.5 13.8 8 15 4.5 13.8 2 11 2 7.5v-4z" fill="#6fb2e8"/><circle cx="8" cy="7.5" r="2.4" fill="#16324a"/></svg>',
  as: '<svg viewBox="0 0 16 16"><path d="M2 14L13 3M9 3h4v4" stroke="#e8d25c" stroke-width="1.8" fill="none"/><path d="M2 9l3 3" stroke="#e8d25c" stroke-width="1.4"/></svg>',
  ah: '<svg viewBox="0 0 16 16"><path d="M4 1h8v2L9 8l3 5v2H4v-2l3-5-3-5z" fill="#c9d0db"/></svg>',
  crit: '<svg viewBox="0 0 16 16"><path d="M8 1l1.6 4.6L14 4l-2.6 4L15 9.5l-4.6.8L11 15l-3-3.6L5 15l.6-4.7L1 9.5 4.6 8 2 4l4.4 1.6z" fill="#e85c5c"/></svg>',
  ms: '<svg viewBox="0 0 16 16"><path d="M3 12h7l3-3V5l-3 1-2 3H4z" fill="#d6dbe3"/><path d="M1 7h3M1 10h2" stroke="#d6dbe3" stroke-width="1.2"/></svg>',
  arpen: '<svg viewBox="0 0 16 16"><path d="M2 14l9-9M8 3l5 5" stroke="#e8a33d" stroke-width="1.8"/></svg>',
  mpen: '<svg viewBox="0 0 16 16"><path d="M2 14l9-9M8 3l5 5" stroke="#b57ce8" stroke-width="1.8"/></svg>',
  ls: '<svg viewBox="0 0 16 16"><path d="M8 2C6 5 4 7.5 4 10a4 4 0 008 0c0-2.5-2-5-4-8z" fill="#d94a4a"/></svg>',
  vamp: '<svg viewBox="0 0 16 16"><path d="M8 2C6 5 4 7.5 4 10a4 4 0 008 0c0-2.5-2-5-4-8z" fill="#9b4ad9"/></svg>',
  range: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#c9d0db" stroke-width="1.4" fill="none"/><circle cx="8" cy="8" r="1.6" fill="#c9d0db"/></svg>',
  ten: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#6fae7c"/><path d="M5 8h6M8 5v6" stroke="#123" stroke-width="1.6"/></svg>',
  hp5: '<svg viewBox="0 0 16 16"><path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" fill="#5fa876"/></svg>',
  mp5: '<svg viewBox="0 0 16 16"><path d="M8 2C6 5 4 7.5 4 10a4 4 0 008 0c0-2.5-2-5-4-8z" fill="#4d84c4"/></svg>',
};
const HUD_STAT_PAGES = [
  [
    ['ad', '공격력', (c) => Math.round(c.stats.attackDamage || 0)],
    ['ap', '주문력', (c) => Math.round(c.stats.abilityPower || 0)],
    ['armor', '방어력', (c) => Math.round(c.stats.armor || 0)],
    ['mr', '마법 저항력', (c) => Math.round(c.stats.magicResist || 0)],
    ['as', '공격 속도', (c) => (typeof getFinalAttackSpeed === 'function' ? getFinalAttackSpeed(c.stats) : 0).toFixed(2)],
    ['ah', '스킬 가속', (c) => Math.round((c.itemBonusAbilityHaste || 0) + (c.itemDynamicAbilityHaste || 0))],
    ['crit', '치명타 확률', (c) => `${Math.round((c.stats.critChance || 0) * 100)}%`],
    ['ms', '이동 속도', (c) => Math.round(typeof getFinalMoveSpeed === 'function' ? worldDistanceToLol(getFinalMoveSpeed(c.stats)) : 0)],
  ],
  [
    ['arpen', '방어구 관통력(물리 관통 | %)', (c) => `${Math.round(c.itemBonusArmorPenFlat || 0)} | ${Math.round((1 - (c.itemBonusArmorPenMultiplier == null ? 1 : c.itemBonusArmorPenMultiplier) + (c.armorPenPercent || 0)) * 100)}%`],
    ['mpen', '마법 관통력(고정 | %)', (c) => `${Math.round(c.itemBonusMagicPenFlat || 0)} | ${Math.round((1 - (c.itemBonusMagicPenMultiplier == null ? 1 : c.itemBonusMagicPenMultiplier)) * 100)}%`],
    ['ls', '생명력 흡수', (c) => `${Math.round((c.itemPhysicalVampPercent || 0) * 100)}%`],
    ['vamp', '모든 피해 흡혈', (c) => `${Math.round((c.itemAllDamageVampPercent || 0) * 100)}%`],
    ['range', '사거리', (c) => Math.round(worldDistanceToLol(c.stats.attackRange || 0))],
    ['ten', '강인함', (c) => `${Math.round((typeof getTenacity === 'function' ? getTenacity(c) : 0) * 100)}%`],
    ['hp5', '체력 재생(5초당)', (c) => (c.hpRegen || 0).toFixed(1)],
    ['mp5', '마나 재생(5초당)', (c) => (c.mpRegen || 0).toFixed(1)],
  ],
];
const hudStatsState = { page: 0, lastAt: 0, cells: null, builtPage: -1 };
function _hudBuildStatCells() {
  const box = document.getElementById('hudStats');
  if (!box) return null;
  box.innerHTML = '';
  hudStatsState.cells = HUD_STAT_PAGES[hudStatsState.page].map(([icon, label]) => {
    const cell = document.createElement('div');
    cell.className = 'hs-cell';
    cell.title = label;
    cell.innerHTML = `<span class="hs-icon">${HUD_STAT_ICONS[icon] || ''}</span><span class="hs-val">-</span>`;
    box.appendChild(cell);
    return cell.querySelector('.hs-val');
  });
  const pager = document.createElement('div');
  pager.className = 'hs-page';
  pager.textContent = `${hudStatsState.page + 1}/${HUD_STAT_PAGES.length}`;
  box.appendChild(pager);
  hudStatsState.builtPage = hudStatsState.page;
  return hudStatsState.cells;
}
function updateHudStats(ctrl, force = false) {
  if (!ctrl || !ctrl.stats || typeof document === 'undefined') return;
  const now = performance.now();
  if (!force && now - hudStatsState.lastAt < 150) return;
  hudStatsState.lastAt = now;
  if (!hudStatsState.cells || hudStatsState.builtPage !== hudStatsState.page) _hudBuildStatCells();
  if (!hudStatsState.cells) return;
  HUD_STAT_PAGES[hudStatsState.page].forEach(([, , fn], i) => {
    let v;
    try { v = String(fn(ctrl)); } catch (e) { v = '-'; }
    const el = hudStatsState.cells[i];
    if (el && el.textContent !== v) el.textContent = v;
  });
}
function toggleHudStatsPage() {
  hudStatsState.page = (hudStatsState.page + 1) % HUD_STAT_PAGES.length;
  if (typeof controller !== 'undefined' && controller) updateHudStats(controller, true);
}

// 챔피언을 불러올 때: 초상화·패시브·스킬 칸 아이콘과 툴팁.
function setHudChampionIcons(championId) {
  if (typeof document === 'undefined') return;
  const meta = (typeof CHAMPION_ICON_META !== 'undefined' && championId) ? CHAMPION_ICON_META[championId] : null;
  const cd = championId && typeof CHAMPION_DATA !== 'undefined' ? CHAMPION_DATA[championId] : null;
  const url = (f) => `url("${HUD_ICON_DIR}${championId}/${f}.png")`;
  const portrait = document.getElementById('portraitBox');
  if (portrait) {
    portrait.style.backgroundImage = meta ? url('icon') : '';
    portrait.classList.toggle('has-icon', !!meta);
    portrait.textContent = meta ? '' : (championId ? championId.slice(0, 2).toUpperCase() : '-');
  }
  const passive = document.getElementById('slotP');
  if (passive) {
    passive.style.backgroundImage = meta ? url('P') : '';
    const name = (cd && cd.passive && cd.passive.name) || (meta && meta.passiveName) || '패시브';
    const desc = (cd && cd.passive && cd.passive.desc) || (meta && meta.passiveDesc) || '';
    passive.title = desc ? `${name}\n${desc}` : name;
    const nameEl = passive.querySelector('.name');
    if (nameEl) nameEl.textContent = meta ? '' : name.slice(0, 6);
  }
  for (const slot of ['Q', 'W', 'E', 'R']) {
    const el = document.getElementById('slot' + slot);
    if (!el) continue;
    el.style.backgroundImage = meta ? url(slot) : '';
    el.classList.toggle('has-icon', !!meta);
    const spellName = (cd && cd[slot] && cd[slot].name) || (meta && meta.spellNames && meta.spellNames[slot]) || '';
    el.title = spellName ? `${slot} - ${spellName}` : slot;
  }
}

if (typeof document !== 'undefined') {
  const hs = document.getElementById('hudStats');
  if (hs) hs.addEventListener('click', toggleHudStatsPage);
}
