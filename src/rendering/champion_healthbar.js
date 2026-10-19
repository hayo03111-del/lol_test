/* ============================================================
   67차 원작식 챔피언 체력바(내 챔피언·허수아비·아군 허수아비 공용)
   ------------------------------------------------------------
   예전엔 세 곳이 각자 다른 바를 그렸고, 체력이 줄면 초록→노랑→빨강으로 색이 바뀌었다(원작은 바뀌지 않는다). 원작처럼:
   - 색은 "누구 것인가"로만 정한다: 내 챔피언 초록, 아군 파랑, 적 빨강.
   - 왼쪽 레벨 칸, 체력 칸에 100마다 얇은 눈금·1000마다 굵은 눈금(최대 체력 + 보호막 기준 - 체력이 늘면 눈금이 촘촘해진다),
     보호막은 체력 뒤에 흰 구간으로 이어 붙이고(체력+보호막이 최대 체력을 넘으면 바 전체가 그 합 기준), 맞으면 깎인 만큼 밝은
     잔상이 잠깐 남는다. 아래에 자원 바(마나 파랑 / 분노 빨강 / 기류·투지 흰색, 자원이 없으면 숨김).
   - 화면 크기 고정(CSS2D) - 확대·축소해도 같은 픽셀.
   ============================================================ */
const CHAMP_BAR_HP_WIDTH_PX = 104;
function makeChampBarDiv(kind, name = '') {
  const div = document.createElement('div');
  div.className = `champBar ${kind}`;
  div.innerHTML = `${name ? `<div class="cb-name">${name}</div>` : ''}`
    + '<div class="cb-row"><div class="cb-lvl hpLevelBadge">1</div><div class="cb-main">'
    + '<div class="cb-hp"><div class="cb-trail"></div><div class="cb-fill hpBarInner"></div><div class="cb-shield hpBarShield"></div><div class="cb-ticks"></div></div>'
    + '<div class="cb-res champResourceBar"><div class="cb-resfill champResourceFill"></div></div>'
    + '</div></div>';
  return div;
}
// 값이 바뀐 것만 DOM에 쓴다(매 프레임 불러도 싸다).
function updateChampBar(div, { hp, maxHp, shield = 0, level = null, resPct = null, resMode = 'hidden' }) {
  if (!div) return;
  const c = div._cb || (div._cb = {
    fill: div.querySelector('.cb-fill'), trail: div.querySelector('.cb-trail'), shield: div.querySelector('.cb-shield'),
    ticks: div.querySelector('.cb-ticks'), lvl: div.querySelector('.cb-lvl'), res: div.querySelector('.cb-res'), resFill: div.querySelector('.cb-resfill'),
    hpPct: -1, shPct: -1, total: -1, level: null, resPct: null, resMode: null,
  });
  if (!c.fill) return;
  const sh = Math.max(0, shield || 0);
  const total = Math.max(maxHp || 0, (hp || 0) + sh) || 1;
  const hpPct = Math.max(0, Math.min(100, (hp / total) * 100));
  const shPct = Math.max(0, Math.min(100 - hpPct, (sh / total) * 100));
  if (Math.abs(hpPct - c.hpPct) > 0.05) {
    c.fill.style.width = `${hpPct}%`;
    // 잔상: 줄어들 때만 늦게 따라온다(회복·리스폰은 즉시)
    c.trail.style.transition = hpPct < c.hpPct ? '' : 'none';
    c.trail.style.width = `${hpPct + shPct}%`;
    c.hpPct = hpPct;
  }
  if (Math.abs(shPct - c.shPct) > 0.05) {
    c.shield.style.left = `${hpPct}%`; c.shield.style.width = `${shPct}%`; c.shield.style.display = shPct > 0.05 ? '' : 'none';
    c.shPct = shPct;
  } else if (shPct > 0.05) c.shield.style.left = `${hpPct}%`;
  const roundedTotal = Math.round(total);
  if (roundedTotal !== c.total) {
    const minor = CHAMP_BAR_HP_WIDTH_PX * 100 / total, major = CHAMP_BAR_HP_WIDTH_PX * 1000 / total;
    c.ticks.style.setProperty('--tm', `${minor}px`); c.ticks.style.setProperty('--tM', `${major}px`);
    c.ticks.classList.toggle('no-minor', minor < 3); c.ticks.classList.toggle('no-major', major < 4);
    c.total = roundedTotal;
  }
  if (level != null && level !== c.level) { c.lvl.textContent = String(level); c.level = level; }
  if (resMode !== c.resMode) {
    c.res.style.display = resMode === 'hidden' ? 'none' : '';
    c.resFill.className = `cb-resfill champResourceFill ${resMode}`;
    c.resMode = resMode;
  }
  if (resPct != null && resPct !== c.resPct) { c.resFill.style.width = `${Math.max(0, Math.min(100, resPct))}%`; c.resPct = resPct; }
}
// 허수아비·아군 허수아비는 피해를 받을 때만 그리면 회복·보호막·리스폰이 바에 늦게 반영된다 - 매 프레임 확인한다(바뀐 것만 씀).
function tickChampionBars() {
  const list = [];
  if (typeof dummy !== 'undefined' && dummy) list.push(dummy);
  if (typeof placedDummies !== 'undefined') list.push(...placedDummies);
  if (typeof placedAllies !== 'undefined') list.push(...placedAllies);
  for (const d of list) {
    if (!d || !d.labelDiv || !d.labelDiv._cb && !d.labelDiv.classList.contains('champBar')) continue;
    updateChampBar(d.labelDiv, { hp: d.hp, maxHp: d.maxHp, shield: d.shield || 0, level: d.champLevel || 1 });
  }
}
