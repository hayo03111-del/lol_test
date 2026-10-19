/* ============================================================
   72차: 원작식 설정 창(Esc)
   ------------------------------------------------------------
   원작처럼 Esc를 누르면 화면 가운데에 설정 창이 뜬다(예전엔 Esc = 일시정지 글자만 떴다). 게임은 멈추지 않는다
   (원작과 같다 - 일시정지는 창 아래 버튼이나 Pause 키).
   - 왼쪽 탭: 게임 / 인터페이스 / 비디오 / 단축키 / 연습 도구.
   - 바꾸면 바로 적용되고 localStorage(lolsim.options.v1)에 저장돼 다음에 열어도 남는다. "기본값 복원"은 전부 처음 값으로.
   - 오른쪽 위 톱니 버튼(#optionsBtn)으로도 연다.
   ============================================================ */
const OPTIONS_STORAGE_KEY = 'lolsim.options.v1';
const OPTIONS_DEFAULTS = {
  castMode: 'normal', cameraLocked: true, edgeSpeed: 1, rangeIndicator: false, autoAttack: true, attackMoveOnCursor: false, // 83차
  hudScale: 1, minimapScale: 1, showChampBars: true, showMinionBars: true, showStructBars: true, showFps: true, showRewardText: true,
  showTurretTraits: false, renderScale: 1,
};
const OPTIONS_TABS = [['game', '게임'], ['ui', '인터페이스'], ['video', '비디오'], ['keys', '단축키'], ['practice', '연습 도구']];
const OPTIONS_HOTKEYS = [
  ['스킬', [['Q W E R', '스킬 사용'], ['Ctrl + Q W E R', '스킬 레벨 업'], ['D F', '소환사 주문'], ['A', '공격 이동(+ 좌클릭)'], ['` (누르고 있기)', '챔피언만 공격'], ['S', '정지'], ['B', '귀환']]],
  ['아이템', [['1 2 3 5 6 7', '아이템 사용'], ['4', '장신구(와드) 설치'], ['P', '상점 열기/닫기']]],
  ['카메라·화면', [['Y', '카메라 고정 켜기/끄기'], ['Space / F1 (누르고 있기)', '내 챔피언 보기'], ['마우스 휠', '확대·축소'], ['Tab (누르고 있기) / O', '스코어보드'], ['V', '사거리 표시'], ['Esc', '설정 창'], ['Pause', '일시정지']]],
  ['연습장 전용', [['F6', '허수아비 설치 모드'], ['F7', '아군 허수아비 설치 모드'], ['F8', '부쉬 설치 모드'], ['F9', '디버그 패널']]],
];
let _optOpen = false;
let _optTab = 'game';
let optionsState = { ...OPTIONS_DEFAULTS };

function _optLoad() {
  try { const raw = localStorage.getItem(OPTIONS_STORAGE_KEY); if (raw) optionsState = { ...OPTIONS_DEFAULTS, ...JSON.parse(raw) }; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
}
function _optSave() { try { localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(optionsState)); } catch (e) { /* 무시 */ } }
// 설정 값을 실제 게임에 적용한다(바꿀 때마다, 그리고 처음 불러올 때).
function applyOptions() {
  const o = optionsState, b = document.body;
  if (typeof skillAim !== 'undefined' && skillAim && skillAim.mode !== o.castMode && typeof skillAim.setMode === 'function') skillAim.setMode(o.castMode);
  const castSel = document.getElementById('castModeSelect'); if (castSel) castSel.value = o.castMode;
  if (typeof cameraRig !== 'undefined') { cameraRig.edgeSpeedMul = o.edgeSpeed; if (cameraRig.locked !== o.cameraLocked && typeof toggleCameraLock === 'function') toggleCameraLock(); }
  if (typeof rangeIndicators !== 'undefined' && rangeIndicators && rangeIndicators.visible !== o.rangeIndicator) rangeIndicators.setVisible(o.rangeIndicator);
  const rcb = document.getElementById('rangeIndicatorCheckbox'); if (rcb) rcb.checked = o.rangeIndicator;
  b.style.setProperty('--hud-scale', String(o.hudScale));
  b.style.setProperty('--minimap-scale', String(o.minimapScale));
  b.classList.toggle('hide-champ-bars', !o.showChampBars);
  b.classList.toggle('hide-minion-bars', !o.showMinionBars);
  b.classList.toggle('hide-struct-bars', !o.showStructBars);
  b.classList.toggle('hide-fps', !o.showFps);
  b.classList.toggle('hide-reward-text', !o.showRewardText);
  b.classList.toggle('show-turret-traits', !!o.showTurretTraits);
  if (typeof renderer !== 'undefined' && renderer && typeof renderer.setPixelRatio === 'function') {
    const pr = Math.min(window.devicePixelRatio || 1, 2) * o.renderScale;
    if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) { renderer.setPixelRatio(pr); renderer.setSize(window.innerWidth, window.innerHeight); }
  }
}
function _optSet(key, value) {
  optionsState[key] = value;
  _optSave();
  applyOptions();
  _optRenderBody();
}

function _optRow(label, control, hint = '') {
  return `<div class="opt-row"><div class="opt-label">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="opt-ctl">${control}</div></div>`;
}
function _optCheck(key) { return `<label class="opt-check"><input type="checkbox" data-opt="${key}"${optionsState[key] ? ' checked' : ''}><span></span></label>`; }
function _optSlider(key, min, max, step, fmt) {
  const v = optionsState[key];
  return `<input type="range" class="opt-range" data-opt="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="opt-val">${fmt(v)}</span>`;
}
function _optSelect(key, options) {
  return `<select class="opt-select" data-opt="${key}">${options.map(([v, t]) => `<option value="${v}"${String(optionsState[key]) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
}
const _pct = (v) => `${Math.round(v * 100)}%`;
function _optBodyHtml() {
  switch (_optTab) {
    case 'game':
      return `<h3>조작</h3>`
        + _optRow('스킬 시전 방식', _optSelect('castMode', [['normal', '일반 (논타겟 즉시 · 대상 지정은 대상 클릭)'], ['indicator', '표시기 사용 빠른 시전 (떼면 시전)'], ['quick', '빠른 시전 (모두 즉시)']]))
        + _optRow('공격 사거리 표시', _optCheck('rangeIndicator'), 'V')
        + _optRow('자동 공격', _optCheck('autoAttack'), '가만히 있을 때 사거리 안의 적을 공격(쫓아가지 않음)')
        + _optRow('커서 기준 공격 이동', _optCheck('attackMoveOnCursor'), '공격 이동이 커서에서 가장 가까운 적을 노림(끄면 내 챔피언 기준)')
        + `<h3>카메라</h3>`
        + _optRow('카메라 고정', _optCheck('cameraLocked'), 'Y - 끄면 화면 가장자리로 카메라 이동')
        + _optRow('카메라 이동 속도', _optSlider('edgeSpeed', 0.3, 2.5, 0.1, _pct));
    case 'ui':
      return `<h3>크기</h3>`
        + _optRow('HUD 크기', _optSlider('hudScale', 0.7, 1.2, 0.05, _pct))
        + _optRow('미니맵 크기', _optSlider('minimapScale', 0.6, 1.5, 0.05, _pct))
        + `<h3>체력바</h3>`
        + _optRow('챔피언 체력바', _optCheck('showChampBars'))
        + _optRow('미니언 체력바', _optCheck('showMinionBars'))
        + _optRow('포탑·억제기·넥서스 체력바', _optCheck('showStructBars'))
        + `<h3>표시</h3>`
        + _optRow('골드 획득 글자', _optCheck('showRewardText'))
        + _optRow('포탑 상태 글자', _optCheck('showTurretTraits'), '요새화·방패·가열 등(원작에는 없음)');
    case 'video':
      return `<h3>그래픽</h3>`
        + _optRow('해상도 배율', _optSelect('renderScale', [['0.5', '50% (빠름)'], ['0.75', '75%'], ['1', '100%']]), '낮추면 프레임이 오른다')
        + _optRow('FPS 표시', _optCheck('showFps'));
    case 'keys':
      return OPTIONS_HOTKEYS.map(([group, list]) => `<h3>${group}</h3>` + list.map(([k, d]) => `<div class="opt-row"><div class="opt-label">${d}</div><div class="opt-ctl"><span class="opt-key">${k}</span></div></div>`).join('')).join('')
        + '<p class="opt-note">단축키 바꾸기는 아직 지원하지 않습니다.</p>';
    case 'practice':
      return `<h3>연습 도구</h3>`
        + _optRow('연습 도구 패널', `<button class="opt-btn" data-act="practice">${document.body.classList.contains('practice-tools') ? '숨기기' : '보이기'}</button>`, '디버그·허수아비·와드 설치·챔피언 패널')
        + _optRow('골드', '<button class="opt-btn" data-act="gold">+10,000</button>')
        + _optRow('미니언 웨이브', '<button class="opt-btn" data-act="wave">바로 소환</button>')
        + _optRow('챔피언·룬·주문', '<button class="opt-btn" data-act="lobby">로비 열기</button>');
    default: return '';
  }
}
function _optRenderBody() {
  const body = document.getElementById('optBody');
  if (body) body.innerHTML = _optBodyHtml();
  document.querySelectorAll('#optTabs [data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === _optTab));
  const pause = document.getElementById('optPauseBtn');
  if (pause) pause.textContent = (typeof paused !== 'undefined' && paused) ? '게임 재개' : '일시정지';
}
function _optBuild() {
  if (document.getElementById('optionsOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'optionsOverlay';
  ov.innerHTML = `<div id="optionsWindow">
    <div class="opt-head"><span>설정</span><button class="opt-x" id="optCloseX" title="닫기 (Esc)">✕</button></div>
    <div class="opt-main"><nav id="optTabs">${OPTIONS_TABS.map(([id, n]) => `<button data-tab="${id}">${n}</button>`).join('')}</nav><div id="optBody"></div></div>
    <div class="opt-foot">
      <button class="opt-btn" id="optPauseBtn">일시정지</button>
      <button class="opt-btn" id="optResetBtn">기본값 복원</button>
      <span class="opt-spacer"></span>
      <button class="opt-btn primary" id="optOkBtn">확인</button>
    </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) setOptionsOpen(false); }); // 창 바깥 클릭 = 닫기
  ov.querySelector('#optCloseX').addEventListener('click', () => setOptionsOpen(false));
  ov.querySelector('#optOkBtn').addEventListener('click', () => setOptionsOpen(false));
  ov.querySelector('#optResetBtn').addEventListener('click', () => { optionsState = { ...OPTIONS_DEFAULTS }; _optSave(); applyOptions(); _optRenderBody(); });
  ov.querySelector('#optPauseBtn').addEventListener('click', () => { if (typeof togglePause === 'function') togglePause(); _optRenderBody(); });
  ov.querySelector('#optTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { _optTab = t.dataset.tab; _optRenderBody(); } });
  const body = ov.querySelector('#optBody');
  const onInput = (e) => {
    const el = e.target.closest('[data-opt]'); if (!el) return;
    const key = el.dataset.opt;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range' || key === 'renderScale') v = Number(v);
    if (el.type === 'range') { optionsState[key] = v; _optSave(); applyOptions(); const out = el.parentElement.querySelector('.opt-val'); if (out) out.textContent = _pct(v); return; }
    _optSet(key, v);
    if (el.blur) el.blur();
  };
  body.addEventListener('input', onInput);
  body.addEventListener('change', onInput);
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'practice') { const pb = document.getElementById('practiceToolsBtn'); if (pb) pb.click(); _optRenderBody(); }
    if (act === 'gold') { const g = document.getElementById('addGoldBtn'); if (g) g.click(); }
    if (act === 'wave') { const w = document.getElementById('spawnWaveBtn'); if (w) w.click(); }
    if (act === 'lobby') { setOptionsOpen(false); const l = document.getElementById('openLobbyBtn'); if (l) l.click(); }
  });
}
function setOptionsOpen(open) {
  _optBuild();
  _optOpen = !!open;
  // 창을 여는 순간의 실제 상태(V·Y로 바꾼 것)를 설정 값에 반영해 둔다.
  if (_optOpen) {
    if (typeof cameraRig !== 'undefined') optionsState.cameraLocked = !!cameraRig.locked;
    if (typeof rangeIndicators !== 'undefined' && rangeIndicators) optionsState.rangeIndicator = !!rangeIndicators.visible;
    if (typeof skillAim !== 'undefined' && skillAim && skillAim.mode) optionsState.castMode = skillAim.mode;
    _optRenderBody();
  }
  document.getElementById('optionsOverlay').classList.toggle('show', _optOpen);
  const gear = document.getElementById('optionsBtn'); if (gear) gear.classList.toggle('on', _optOpen);
}
function toggleOptions() { setOptionsOpen(!_optOpen); }
function isOptionsOpen() { return _optOpen; }

(function initOptionsUi() {
  if (typeof document === 'undefined') return;
  _optLoad();
  const gear = document.createElement('button');
  gear.id = 'optionsBtn'; gear.title = '설정 (Esc)'; gear.textContent = '⚙';
  gear.addEventListener('click', toggleOptions);
  document.body.appendChild(gear);
  applyOptions();
})();
