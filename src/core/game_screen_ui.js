/* ============================================================
   68차 원작식 게임 화면
   ------------------------------------------------------------
   - 연습 도구(디버그 패널·조작법·설정·상태 글자·오른쪽 챔피언 패널)는 기본으로 숨긴다. 왼쪽 위 "연습 도구" 버튼으로
     켜고 끈다(마지막 상태는 이 브라우저에 기억). 원작 게임 화면처럼 3D 화면 + 아래 HUD만 남는다.
   - 오른쪽 위 전적 줄: 팀 처치(블루 : 레드) · 내 K/D/A · CS · 게임 시간 · FPS.
   - 오른쪽 아래 미니맵: 칼바람 나락 걸을 수 있는 영역 + 포탑·억제기·넥서스(아군 파랑/적 빨강, 부서지면 회색) + 미니언 점 +
     챔피언(내 챔피언은 초상화) + 카메라가 보는 영역(흰 사각형). 화면과 같은 방향(화면 위 = 미니맵 위)으로 그린다.
     우클릭 = 그 자리로 이동, 좌클릭(누르고 있기) = 그 자리를 보기 - 놓으면 카메라 고정 상태면 챔피언으로 돌아오고, 고정을
     풀었으면(Y) 그 자리에 머문다(원작).
   ============================================================ */
const PRACTICE_TOOLS_KEY = 'lolsim.practiceTools.v1';
function setPracticeToolsVisible(on) {
  document.body.classList.toggle('practice-tools', !!on);
  const b = document.getElementById('practiceToolsBtn');
  if (b) b.classList.toggle('on', !!on);
  try { localStorage.setItem(PRACTICE_TOOLS_KEY, on ? '1' : '0'); } catch (e) { /* 저장 불가(시크릿 창 등) - 무시 */ }
}
// 69차: HUD 귀환 버튼(원작 아이템 칸 옆 귀환 아이콘) - B 키와 같다.
(function initRecallButton() {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('hudRecallBtn');
  if (b) b.addEventListener('click', () => { if (typeof controller !== 'undefined' && controller && !paused) controller.startRecall(); });
})();
(function initPracticeToolsToggle() {
  if (typeof document === 'undefined') return;
  const btn = document.createElement('button');
  btn.id = 'practiceToolsBtn';
  btn.textContent = '연습 도구';
  btn.title = '디버그·조작법·설정·챔피언 패널 보이기/숨기기';
  btn.addEventListener('click', () => setPracticeToolsVisible(!document.body.classList.contains('practice-tools')));
  document.body.appendChild(btn);
  let saved = null;
  try { saved = localStorage.getItem(PRACTICE_TOOLS_KEY); } catch (e) { saved = null; }
  setPracticeToolsVisible(saved === '1');
})();

// ---------- 오른쪽 위 전적 줄 ----------
let _gameStatsEl = null, _gameStatsAcc = 0, _fpsFrames = 0, _fpsAcc = 0, _fps = 0;
function _gameStatsHtml() {
  const c = typeof controller !== 'undefined' ? controller : null;
  const sc = c && typeof ensureScore === 'function' ? ensureScore(c) : { kills: 0, deaths: 0, assists: 0, cs: 0 };
  const started = typeof howlingAbyssStructuresSpawned !== 'undefined' && howlingAbyssStructuresSpawned;
  const t = started && typeof getTurretGameTimeSec === 'function' ? Math.max(0, getTurretGameTimeSec()) : 0;
  const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(Math.floor(t % 60)).padStart(2, '0');
  const myTeam = (c && c.team) || 'BLUE';
  const blueKills = myTeam === 'BLUE' ? sc.kills : sc.deaths, redKills = myTeam === 'BLUE' ? sc.deaths : sc.kills;
  return `<span class="gs-team"><b class="blue">${blueKills}</b><i>⚔</i><b class="red">${redKills}</b></span>`
    + `<span class="gs-kda" title="처치/죽음/도움">${sc.kills}/${sc.deaths}/${sc.assists}</span>`
    + `<span class="gs-cs" title="미니언 처치(CS)">CS ${sc.cs}</span>`
    + `<span class="gs-time">${mm}:${ss}</span>`
    + `<span class="gs-fps">${_fps} FPS</span>`;
}
function tickGameScreen(dt) {
  _fpsFrames++; _fpsAcc += dt;
  if (_fpsAcc >= 1) { _fps = Math.round(_fpsFrames / _fpsAcc); _fpsFrames = 0; _fpsAcc = 0; }
  _gameStatsAcc += dt;
  if (_gameStatsAcc >= 0.25) {
    _gameStatsAcc = 0;
    if (!_gameStatsEl) { _gameStatsEl = document.createElement('div'); _gameStatsEl.id = 'gameStats'; document.body.appendChild(_gameStatsEl); }
    const html = _gameStatsHtml();
    if (_gameStatsEl._html !== html) { _gameStatsEl.innerHTML = html; _gameStatsEl._html = html; }
  }
  tickMinimap(dt);
}

// ---------- 미니맵 ----------
const MINIMAP_PX = 210;
let _mm = null;
function _minimapAxes() {
  const yaw = cameraRig.yaw;
  return { right: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), up: new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)) };
}
function _minimapInit() {
  if (_mm) return _mm;
  if (typeof howlingAbyssMap === 'undefined' || !howlingAbyssMap || !howlingAbyssMap.group || typeof howlingAbyssMap.clampPosition !== 'function') return null;
  const wrap = document.createElement('div');
  wrap.id = 'minimap';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(MINIMAP_PX * dpr);
  canvas.style.width = canvas.style.height = `${MINIMAP_PX}px`;
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);
  // 걸을 수 있는 영역 외곽선(clampPosition으로 z마다 좌우 끝을 잰다)
  const zMin = howlingAbyssMap.clampPosition(new THREE.Vector3(0, 0, -1e6)).z, zMax = howlingAbyssMap.clampPosition(new THREE.Vector3(0, 0, 1e6)).z;
  const left = [], right = [];
  for (let i = 0; i <= 80; i++) {
    const z = zMin + (zMax - zMin) * i / 80;
    const xMax = howlingAbyssMap.clampPosition(new THREE.Vector3(1e6, 0, z)).x, xMin = howlingAbyssMap.clampPosition(new THREE.Vector3(-1e6, 0, z)).x;
    right.push(new THREE.Vector3(xMax, 0, z)); left.push(new THREE.Vector3(xMin, 0, z));
  }
  const outline = [...right, ...left.reverse()];
  // 화면 방향 축으로 투영한 범위에 맞춰 축척을 정한다
  const ax = _minimapAxes();
  let maxR = 1;
  for (const p of outline) maxR = Math.max(maxR, Math.abs(p.dot(ax.right)), Math.abs(p.dot(ax.up)));
  _mm = { wrap, canvas, ctx: canvas.getContext('2d'), dpr, outline, scale: (MINIMAP_PX / 2 - 8) / maxR, acc: 1, iconImg: null, iconFor: null, dragging: false };
  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left - MINIMAP_PX / 2, py = e.clientY - r.top - MINIMAP_PX / 2;
    const a = _minimapAxes();
    const p = new THREE.Vector3().addScaledVector(a.right, px / _mm.scale).addScaledVector(a.up, -py / _mm.scale);
    return howlingAbyssMap.clampPosition(p);
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const p = toWorld(e);
    if (e.button === 2) { if (typeof controller !== 'undefined' && controller && !paused) { if (typeof spawnMoveMarker === 'function') spawnMoveMarker(p); controller.moveTo(p); } return; }
    if (e.button === 0) { _mm.dragging = true; cameraRig.minimapFocus = p; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointermove', (e) => { if (_mm.dragging) cameraRig.minimapFocus = toWorld(e); });
  const release = () => {
    if (!_mm.dragging) return;
    _mm.dragging = false;
    if (!cameraRig.locked && cameraRig.minimapFocus) cameraRig.freePos.copy(cameraRig.minimapFocus); // 고정 해제 상태면 그 자리에 머문다
    cameraRig.minimapFocus = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  return _mm;
}
function _mmPt(p) {
  const a = _minimapAxes();
  return { x: MINIMAP_PX / 2 + p.dot(a.right) * _mm.scale, y: MINIMAP_PX / 2 - p.dot(a.up) * _mm.scale };
}
function _cameraGroundQuad() {
  const out = [];
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    if (ray.ray.intersectPlane(plane, hit)) out.push(hit.clone());
    else return null;
  }
  return out;
}
function tickMinimap(dt) {
  if (!_minimapInit()) return;
  _mm.acc += dt;
  if (_mm.acc < 0.1) return; // 초당 10번이면 충분하다
  _mm.acc = 0;
  const { ctx, dpr } = _mm;
  const myTeam = (typeof controller !== 'undefined' && controller && controller.team) || PLAYER_TEAM;
  const teamColor = (team, dead) => dead ? '#5a5f66' : (team === myTeam ? '#3d9bff' : '#ff4b3e');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);
  // 바탕: 얼음 바다 + 걸을 수 있는 영역
  ctx.fillStyle = '#0c1a24'; ctx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);
  ctx.beginPath();
  _mm.outline.forEach((p, i) => { const q = _mmPt(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
  ctx.closePath();
  ctx.fillStyle = '#5b7385'; ctx.fill();
  ctx.strokeStyle = '#a8c3d4'; ctx.lineWidth = 1; ctx.stroke();
  // 구조물
  const dot = (p, r, fill, stroke = '#000', shape = 'circle') => {
    const q = _mmPt(p);
    ctx.beginPath();
    if (shape === 'square') ctx.rect(q.x - r, q.y - r, r * 2, r * 2);
    else if (shape === 'diamond') { ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y); ctx.closePath(); }
    else ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke();
  };
  if (typeof nexusBuildings !== 'undefined') for (const n of nexusBuildings) dot(getWorldPosition(n), 7, teamColor(n.team, n.destroyed), '#000', 'diamond');
  if (typeof inhibitorBuildings !== 'undefined') for (const i of inhibitorBuildings) dot(getWorldPosition(i), 4.5, teamColor(i.team, i.destroyed), '#000', 'diamond');
  if (typeof turrets !== 'undefined') for (const t of turrets) if (t.isStructure) dot(getWorldPosition(t), 4, teamColor(t.team, t.destroyed), '#000', 'square');
  // 미니언(보이는 적만 - 시야 시스템이 숨긴 적은 그리지 않는다)
  if (typeof minions !== 'undefined') for (const m of minions) {
    if (m.isDead || (m.mesh && !m.mesh.visible)) continue;
    dot(m.mesh.position, m.type === 'super' || m.type === 'siege' ? 2.4 : 1.8, teamColor(m.team), 'rgba(0,0,0,0.6)');
  }
  // 허수아비·아군 허수아비
  const champs = [];
  if (typeof dummy !== 'undefined' && dummy) champs.push(dummy);
  if (typeof placedDummies !== 'undefined') champs.push(...placedDummies);
  if (typeof placedAllies !== 'undefined') champs.push(...placedAllies);
  for (const d of champs) if (d && d.mesh && d.mesh.visible !== false) dot(d.mesh.position, 4.5, teamColor(d.team || (d.isAlly ? myTeam : 'RED')), '#000');
  // 카메라가 보는 영역
  const quad = _cameraGroundQuad();
  if (quad) {
    ctx.beginPath();
    quad.forEach((p, i) => { const q = _mmPt(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  // 내 챔피언(초상화 + 초록 테두리)
  if (typeof controller !== 'undefined' && controller && controller.root) {
    const q = _mmPt(controller.root.position);
    const id = controller.championId;
    if (_mm.iconFor !== id) { _mm.iconFor = id; _mm.iconImg = new Image(); _mm.iconImg.src = `assets/champion_icons/${id}/icon.png`; }
    const r = 8;
    ctx.save(); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.closePath();
    if (_mm.iconImg && _mm.iconImg.complete && _mm.iconImg.naturalWidth) { ctx.clip(); ctx.drawImage(_mm.iconImg, q.x - r, q.y - r, r * 2, r * 2); }
    else { ctx.fillStyle = '#3fae22'; ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#6bdc3a'; ctx.stroke();
  }
}
