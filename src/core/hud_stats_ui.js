/* ============================================================
   하단 HUD 능력치 칸 + 패시브 칸 + 스킬·초상화 아이콘 - 48차
   ------------------------------------------------------------
   - 능력치 칸(#hudStats, 50차: 원작 능력치 아이콘 - HUD_STAT_IMAGES): 원작 왼쪽 아래 능력치 창처럼 8개(공격력·주문력·방어력·마법 저항력·공격 속도·스킬 가속·
     치명타 확률·이동 속도). 칸을 누르면 두 번째 쪽(방어구 관통·마법 관통·생명력 흡수·모든 피해 흡혈·사거리·강인함·
     체력 재생·마나 재생)으로 바뀐다. 값은 0.15초마다 갱신(updateCooldowns가 매 프레임 부르지만 DOM은 바뀔 때만 고친다).
   - 패시브 칸(#slotP): Q 앞. 챔피언 패시브 아이콘, 마우스를 올리면 이름·설명(CHAMPION_DATA 설명 우선, 없으면 Data Dragon 한글).
   - 스킬 칸 Q/W/E/R과 초상화에 Data Dragon 아이콘(assets/champion_icons/<id>/ - tools/fetch_champion_icons.py).
   ============================================================ */
const HUD_ICON_DIR = 'assets/champion_icons/';
// 50차: 능력치 아이콘 - 원작 능력치 아이콘(noxelisdev/LoL_DDragon extras/statistics → assets/stat_icons,
// tools/fetch_champion_icons.py가 받음). 49차의 룬 파편·아이템 그림은 원작 능력치 표시용 아이콘이 아니었다.
// 아래 SVG는 그림을 못 불러올 때(파일 없음)만 쓰는 대체.
const HUD_STAT_IMAGE_DIR = 'assets/stat_icons/';
const HUD_STAT_IMAGES = {
  ad: 'attack_damage', ap: 'ability_power', armor: 'armor', mr: 'magic_resist', as: 'attack_speed', ah: 'cdr_reduction',
  crit: 'critical_chance', ms: 'move_speed', arpen: 'armor_pen', mpen: 'magic_pen', ls: 'life_steal', vamp: 'omnivamp',
  range: 'range', ten: 'tenacity', hp5: 'health_regen', mp5: 'mana_regen',
};
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
const hudStatsState = { page: 0, lastAt: 0, cells: null, builtPage: -1, runeSig: '' };
// 52차: 쪽 = 능력치 1·2 + 룬(원작 왼쪽 아래 창처럼 룬 페이지를 볼 수 있다). 칸을 누르면 다음 쪽.
const HUD_PAGE_COUNT = HUD_STAT_PAGES.length + 1;
const HUD_RUNE_PAGE = HUD_STAT_PAGES.length;
function _hudPager(box) {
  const pager = document.createElement('div');
  pager.className = 'hs-page';
  pager.textContent = hudStatsState.page === HUD_RUNE_PAGE ? `룬 ${hudStatsState.page + 1}/${HUD_PAGE_COUNT}` : `${hudStatsState.page + 1}/${HUD_PAGE_COUNT}`;
  box.appendChild(pager);
}
function _hudBuildStatCells() {
  const box = document.getElementById('hudStats');
  if (!box) return null;
  box.innerHTML = '';
  box.classList.toggle('rune-view', hudStatsState.page === HUD_RUNE_PAGE);
  hudStatsState.builtPage = hudStatsState.page;
  if (hudStatsState.page === HUD_RUNE_PAGE) { hudStatsState.cells = []; hudStatsState.runeSig = ''; return hudStatsState.cells; }
  hudStatsState.cells = HUD_STAT_PAGES[hudStatsState.page].map(([icon, label]) => {
    const cell = document.createElement('div');
    cell.className = 'hs-cell';
    cell.title = label;
    const img = HUD_STAT_IMAGES[icon];
    cell.innerHTML = `<span class="hs-icon">${img ? `<img src="${HUD_STAT_IMAGE_DIR}${img}.png" alt="">` : (HUD_STAT_ICONS[icon] || '')}</span><span class="hs-val">-</span>`;
    const imgEl = cell.querySelector('img');
    if (imgEl) imgEl.addEventListener('error', () => { imgEl.parentNode.innerHTML = HUD_STAT_ICONS[icon] || ''; }, { once: true });
    box.appendChild(cell);
    return cell.querySelector('.hs-val');
  });
  _hudPager(box);
  return hudStatsState.cells;
}
// 룬 쪽: 핵심 룬(크게) + 주 빌드 3개 / 보조 2개 / 능력치 파편 3개. 마우스를 올리면 이름·설명.
function _hudRenderRunes(ctrl) {
  const box = document.getElementById('hudStats');
  const p = ctrl && ctrl.runePage;
  const sig = p ? JSON.stringify(p) : 'none';
  if (!box || hudStatsState.runeSig === sig) return;
  hudStatsState.runeSig = sig;
  box.innerHTML = '';
  if (!p || typeof runeFind !== 'function') { box.innerHTML = '<div class="hs-norune">룬 없음</div>'; _hudPager(box); return; }
  const tip = (id) => { const f = runeFind(id); return f ? `${f.rune.name}\n${f.rune.desc}${RUNE_IMPLEMENTED.has(f.rune.key) ? '' : '\n(이 연습장에서는 효과 없음)'}` : ''; };
  const img = (id, cls) => `<img class="${cls}" src="assets/runes/${id}.png" title="${tip(id).replace(/"/g, '&quot;')}" alt="">`;
  const shardName = (i, k) => ((RUNE_SHARD_ROWS[i] || []).find((x) => x.key === k) || {}).name || k;
  box.innerHTML = `<div class="hr-wrap">
    <div class="hr-key">${img(p.keystone, 'hr-keystone')}</div>
    <div class="hr-rest">
      <div class="hr-line">${p.rows.map((id) => img(id, 'hr-minor')).join('')}</div>
      <div class="hr-line">${p.secondaryRunes.map((id) => img(id, 'hr-minor')).join('')}<img class="hr-tree" src="assets/runes/tree_${p.secondary}.png" title="보조: ${(runeTree(p.secondary) || {}).name || ''}" alt=""></div>
      <div class="hr-line">${p.shards.map((k, i) => `<img class="hr-shard" src="assets/runes/shard_${k}.png" title="${shardName(i, k)}" alt="">`).join('')}</div>
    </div></div>`;
  _hudPager(box);
}
function updateHudStats(ctrl, force = false) {
  if (ctrl && ctrl.isBot) return; if (typeof isBotActing === 'function' && isBotActing()) return; // 95차: 적 챔피언 봇 차례에는 플레이어 화면을 건드리지 않는다
  if (!ctrl || !ctrl.stats || typeof document === 'undefined') return;
  const now = performance.now();
  if (!force && now - hudStatsState.lastAt < 150) return;
  hudStatsState.lastAt = now;
  if (!hudStatsState.cells || hudStatsState.builtPage !== hudStatsState.page) _hudBuildStatCells();
  if (hudStatsState.page === HUD_RUNE_PAGE) { _hudRenderRunes(ctrl); return; }
  if (!hudStatsState.cells) return;
  HUD_STAT_PAGES[hudStatsState.page].forEach(([, , fn], i) => {
    let v;
    try { v = String(fn(ctrl)); } catch (e) { v = '-'; }
    const el = hudStatsState.cells[i];
    if (el && el.textContent !== v) el.textContent = v;
  });
}
function toggleHudStatsPage() {
  hudStatsState.page = (hudStatsState.page + 1) % HUD_PAGE_COUNT;
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

/* ---------------- 51차: 스킬 칸 재사용 대기시간 원작 표시 + 재시전 ---------------- */
// 재사용 대기시간: 원작처럼 어두운 덮개가 12시 방향부터 시계 방향으로 걷히고 가운데에 남은 초(1초 미만은 소수 한 자리).
// 전체 길이는 재사용 대기시간이 "늘어나는 순간"의 값을 기억해 쓴다(스킬 가속·초기화가 섞여도 덮개가 튀지 않게).
const _skillCdTotals = {}, _skillCdLast = {};
function applySkillCooldownSweep(cdEl, key, remaining) {
  if (remaining > (_skillCdLast[key] || 0) + 0.05 || !_skillCdTotals[key]) _skillCdTotals[key] = remaining;
  _skillCdLast[key] = remaining;
  const total = Math.max(remaining, _skillCdTotals[key] || remaining, 1e-3);
  const deg = Math.max(0, Math.min(360, (1 - remaining / total) * 360));
  cdEl.style.background = `conic-gradient(rgba(0,0,0,0) 0deg ${deg}deg, rgba(4,6,10,0.8) ${deg}deg 360deg)`;
  cdEl.textContent = remaining >= 1 ? Math.ceil(remaining) : remaining.toFixed(1);
}
function resetSkillCooldownSweep(key) { _skillCdLast[key] = 0; }

// 재시전·강화 상태: { remaining, total(초), count?, keepCd? } | null.
// keepCd: 강화 단계(야스오·요네 Q3)처럼 재사용 대기시간은 그대로 보여 주는 경우. 그 밖의 재시전은 창이 열려 있는 동안
// 원작처럼 칸이 밝게(사용 가능) 보이고 테두리 고리가 남은 시간만큼 줄어든다.
function getSkillRecastState(c, key) {
  if (!c || !c.championId) return null;
  const now = performance.now(), cd = typeof c._champData === 'function' ? c._champData() : null;
  const win = (until, total, extra = {}) => (until > now ? { remaining: (until - now) / 1000, total: Math.max(total, (until - now) / 1000), ...extra } : null);
  switch (c.championId) {
    case 'leesin': {
      const s = c._leesin; if (!s) return null;
      if (key === 'Q' && s.qMarkTarget && s.qMarkTarget.hp > 0) return win(s.qMarkExpiresAt, cd.Q.markDuration || 3);
      if (key === 'W') return win(s.wMarkReadyUntil, cd.W.markDuration || 3);
      if (key === 'E' && s.eMarkHits && s.eMarkHits.length) return win(s.eMarkExpiresAt, cd.E.markDuration || 3);
      return null;
    }
    case 'yasuo':
      // 54차: 중첩 1개(Q2)부터 남은 중첩 시간 고리 - 원작처럼 Q2·Q3 단계 내내 칸 둘레 고리가 줄어든다
      return key === 'Q' && c._yasuo && c._yasuo.qStacks >= 1 ? win(c._yasuo.qStackExpiresAt, cd.Q.stackDuration || 6, { keepCd: true }) : null;
    case 'yone': {
      const s = c._yone; if (!s) return null;
      if (key === 'Q' && s.qStacks >= 1) return win(s.qStackExpiresAt, cd.Q.stackDuration || 6, { keepCd: true }); // 54차: 중첩 1개부터 고리
      if (key === 'E' && s.eSpirit) return win(s.eSpirit.startedAt + s.eSpirit.duration * 1000, s.eSpirit.duration);
      return null;
    }
    case 'ahri':
      return key === 'R' && c._ahri && c._ahri.rCharges > 0 ? win(c._ahri.rReadyUntil, cd.R.recastWindow || 15, { count: c._ahri.rCharges }) : null;
    case 'lux': {
      const z = key === 'E' && c._lux && c._lux.zone; if (!z) return null;
      return z.ready ? win(z.expiresAt, cd.E.zoneDurationSec || 5) : { remaining: cd.E.zoneDurationSec || 5, total: cd.E.zoneDurationSec || 5 };
    }
    case 'vex':
      return key === 'R' && c._vex && c._vex.recastTarget ? win(c._vex.recastReadyUntil, 4) : null;
    case 'rammus': {
      const s = c._rammus; if (!s) return null;
      if (key === 'Q' && s.roll) return { remaining: Math.max(0, cd.Q.rollDurationSec - s.roll.elapsed), total: cd.Q.rollDurationSec };
      if (key === 'W' && s.wUntil) return win(s.wUntil, cd.W.durationSec || 7);
      return null;
    }
    case 'mordekaiser': { // 52차: W(불굴) - 보호막이 있는 동안 다시 써서 남은 보호막을 회복으로 바꾼다
      const m = c._morde; if (key !== 'W' || !m) return null;
      return win(m.wShieldActiveUntil || 0, (cd.W && cd.W.shieldDecayDuration) || 4);
    }
    case 'renekton':
      return key === 'E' && c._renekton ? win(c._renekton.eSecondReadyUntil || 0, 4) : null;
    default: return null;
  }
}
// 53차: 칸 그림 단계 - 원작은 같은 키의 다음 단계 스킬로 그림이 바뀐다(야스오 Q 중첩 1 → Q2, 2 → Q3 회오리, 요네 Q3).
// 그림 파일 <칸><단계>.png가 있을 때만(meta.iconVariants - 사용자가 준 원작 그림). 그 밖의 재시전은 그림 "2"가 있으면 그것.
function getSkillIconStage(c, key, recast) {
  if (!c) return '';
  const now = performance.now();
  if (key === 'Q' && c.championId === 'yasuo' && c._yasuo && c._yasuo.qStackExpiresAt > now) return c._yasuo.qStacks >= 2 ? '3' : (c._yasuo.qStacks === 1 ? '2' : '');
  if (key === 'Q' && c.championId === 'yone' && c._yone && c._yone.qStackExpiresAt > now && c._yone.qStacks >= 2) return '3';
  return recast ? '2' : '';
}
// 재시전: 금빛 테두리·고리·↻, 칸 그림은 단계 그림이 있으면 그것(원작 단계·재시전 그림은 Data Dragon에 없어 사용자가 준 것만).
function applySkillRecastUI(slot, key, c) {
  const st = getSkillRecastState(c, key);
  let ring = slot.querySelector('.recastRing');
  slot.classList.toggle('recast', !!st);
  const meta = (typeof CHAMPION_ICON_META !== 'undefined' && c && c.championId) ? CHAMPION_ICON_META[c.championId] : null;
  const stage = getSkillIconStage(c, key, !!st);
  const altIcon = !!(stage && meta && (meta.iconVariants || []).includes(key + stage));
  const wantBg = meta ? `url("${HUD_ICON_DIR}${c.championId}/${key}${altIcon ? stage : ''}.png")` : '';
  if (meta && slot.dataset.bg !== wantBg) { slot.style.backgroundImage = wantBg; slot.dataset.bg = wantBg; }
  if (!st) { if (ring) ring.remove(); const b = slot.querySelector('.recastCount'); if (b) b.remove(); return null; }
  if (!ring) { ring = document.createElement('div'); ring.className = 'recastRing'; slot.appendChild(ring); }
  const deg = Math.max(0, Math.min(360, (st.remaining / Math.max(1e-3, st.total)) * 360));
  ring.style.background = `conic-gradient(#f3cf6b 0deg ${deg}deg, rgba(243,207,107,0.12) ${deg}deg 360deg)`;
  // 남은 재시전 횟수(아리 R)가 있으면 그 숫자, 없으면 재시전 표시(↻). 강화 단계(keepCd)는 배지 없이 고리만.
  let badge = slot.querySelector('.recastCount');
  const text = st.count != null ? String(st.count) : (st.keepCd ? '' : '↻');
  if (text) {
    if (!badge) { badge = document.createElement('div'); badge.className = 'recastCount'; slot.appendChild(badge); }
    if (badge.textContent !== text) badge.textContent = text;
  } else if (badge) badge.remove();
  return st;
}
