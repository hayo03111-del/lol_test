/* ============================================================
   4. GLOBAL SYSTEM INSTANCES
   ============================================================ */
const vfx = new VFXSystem(scene);
// 사용자가 제공한 NilahVFXManager_v2를 이 프로젝트의 THREE.Scene에 연결한다.
// 기존 vfx(VFXSystem)와 완전히 별개로 동작하며, nilah.js의 Q/W/E/R 시전
// 함수에서 playQLoL/playWLoL/playELoL/playRLoL을 직접 호출한다.
const nilahVfx2 = new NilahVFXManagerV2(scene);
const projectiles = new ProjectileSystem(scene, vfx);
const targetRing = new TargetRing(scene);
const rangeIndicators = new RangeIndicatorSystem(scene);
const rangeIndicatorCheckboxEl = document.getElementById('rangeIndicatorCheckbox');
if (rangeIndicatorCheckboxEl) rangeIndicatorCheckboxEl.addEventListener('change', () => rangeIndicators.setVisible(rangeIndicatorCheckboxEl.checked));
// 시야 시스템(전장의 안개) - 범용 인스턴스 하나를 여기서 만들어 animate()
// 루프(champion_glb_loader.js)에서 매 프레임 update()를 호출한다. 다른
// 전역 시스템(vfx/projectiles/rangeIndicators)과 동일한 패턴.
const visionSystem = new VisionSystem(scene);
const visionSystemCheckboxEl = document.getElementById('visionSystemCheckbox');
if (visionSystemCheckboxEl) visionSystemCheckboxEl.addEventListener('change', () => visionSystem.setEnabled(visionSystemCheckboxEl.checked));
var controller = null;
let championRoot = null;
let currentChampion = null; // { fileName, resolver, actionData, boundsRadius }
let modelScaleMultiplier = 1.0; // scaleButtons(0.8/1.0/1.2) 수동 미리보기 배율 - 챔피언 고정 Multiplier 위에 곱해지는 별도의 사용자 조작 값
let championBaseScaleMultiplier = 1.0; // 현재 로드된 챔피언의 MODEL_SCALE_MULTIPLIERS 고정값(원본 크기에 곱해짐)

/* ============================================================
   5. INPUT HANDLING
   ============================================================ */
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

function getGroundPoint(clientX, clientY) {
  mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObject(ground, false);
  return hits.length ? hits[0].point : null;
}
// 요청("미니언도 지정 가능하게 하고 지정 쉽게 해줘") - 미니언은 몸집이
// 작고 계속 움직여서 실제 메쉬를 픽셀 단위로 정확히 클릭하기 어렵다.
// 정밀 레이캐스트가 빗나가면 화면 좌표 기준 "가장 가까운 후보"를 관대한
// 반경 안에서 대신 골라주는 폴백을 추가한다(흔히 쓰는 RTS/AOS 관대한
// 클릭 판정 방식). 겹쳐 있을 때는 정밀 레이캐스트가 여전히 우선이라
// "뒤에 있는 큰 포탑을 클릭했는데 작은 미니언이 잡히는" 문제는 없다.
const ENEMY_CLICK_RADIUS_PX = 26;         // 기본 관대한 클릭 허용 반경(픽셀)
const ENEMY_CLICK_RADIUS_MINION_PX = 38;  // 미니언은 더 작고 빨리 움직이므로 더 넉넉하게
function isBehindCamera(worldPos) {
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const toPoint = new THREE.Vector3().subVectors(worldPos, camera.position);
  return camDir.dot(toPoint) <= 0;
}
function worldToScreenPx(worldPos) {
  const v = worldPos.clone().project(camera); // clone 필수 - project()는 벡터를 제자리에서 바꿔버려서, 원본(유닛 실제 좌표)에 그대로 쓰면 유닛이 순간이동한다
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
function getEnemyHit(clientX, clientY) {
  // getAllEnemyUnits()가 이제 RED 진영 포탑/억제기/넥서스/미니언을 전부
  // 포함하므로(요청 20절 - 기본 공격/스킬 대상에 미니언·구조물 포함) 여기서
  // 따로 배열을 또 합칠 필요가 없다(중복 후보 방지). 우물(기지)은
  // isUntargetable이라 getAllEnemyUnits() 자체에서 이미 제외된다(요청 6/43).
  // BLUE(플레이어 자신의 진영)는 애초에 getAllEnemyUnits()에 들어가지
  // 않으므로 실수로 아군을 클릭해 공격하는 일도 자동으로 방지된다.
  const candidates = getAllEnemyUnits();
  if (!candidates.length) return null;
  mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const bodies = candidates.map((u) => u.body);
  const hits = raycaster.intersectObjects(bodies, false);
  if (hits.length) {
    const exact = candidates.find((u) => u.body === hits[0].object);
    if (exact) return exact;
  }
  // 정밀 레이캐스트가 빗나갔을 때의 관대한 폴백.
  let best = null, bestDist = Infinity;
  for (const u of candidates) {
    const p = getWorldPosition(u);
    if (!p || isBehindCamera(p)) continue;
    const screen = worldToScreenPx(p);
    const dist = Math.hypot(screen.x - clientX, screen.y - clientY);
    const radiusPx = u.isMinion ? ENEMY_CLICK_RADIUS_MINION_PX : ENEMY_CLICK_RADIUS_PX;
    if (dist <= radiusPx && dist < bestDist) { bestDist = dist; best = u; }
  }
  return best;
}

let paused = false;
window.addEventListener('contextmenu', (e) => e.preventDefault());

// 요청: 사용자가 직접 허수아비를 설치할 수 있게 한다. createDummyEnemy()를
// 그대로 재사용하므로(새 더미 시스템을 따로 만들지 않음) Visual/Hitbox/
// isTrainingDummy(죽지 않음)/CC 전부 기본 더미와 완전히 동일하게 동작한다.
function placeDummyAt(point) {
  const d = createDummyEnemy(new THREE.Vector3(point.x, 0, point.z));
  placedDummies.push(d);
  console.log(`[더미 설치] 위치: (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) - 현재 설치된 허수아비 ${placedDummies.length}개`);
}
function removeDummyVisual(d) {
  if (!d) return;
  // CSS2DObject는 Scene에서 remove()해도 실제 DOM 노드가 즉시 제거된다고
  // 보장하지 않는다. GLB 교체처럼 renderer가 다음 프레임을 그리기 전에
  // 씬을 갈아끼우는 경우 이전 더미 HP바가 화면에 고아 DOM으로 남을 수 있다.
  if (d.labelDiv?.parentNode) d.labelDiv.parentNode.removeChild(d.labelDiv);
  if (d.mesh) scene.remove(d.mesh);
  if (controller && controller.currentTarget === d) {
    controller.currentTarget = null;
    targetRing.clear();
  }
}

function clearPlacedDummies() {
  for (const d of placedDummies) {
    if (controller && controller._morde && controller._morde.isInDeathRealm && controller._morde.rTarget === d) {
      d.hp = 0;
    }
    if (controller && controller._sett && controller._sett.rSeq && controller._sett.rSeq.target === d) {
      d.hp = 0;
    }
    removeDummyVisual(d);
  }
  placedDummies = [];
}
function setDummyPlaceMode(v) {
  dummyPlaceMode = v;
  renderer.domElement.style.cursor = v ? 'crosshair' : '';
}
const dummyPlaceCheckboxEl = document.getElementById('dummyPlaceCheckbox');
if (dummyPlaceCheckboxEl) dummyPlaceCheckboxEl.addEventListener('change', () => setDummyPlaceMode(dummyPlaceCheckboxEl.checked));
const clearDummiesBtnEl = document.getElementById('clearDummiesBtn');
if (clearDummiesBtnEl) clearDummiesBtnEl.addEventListener('click', clearPlacedDummies);

// 요청: 허수아비에 숫자로 데미지를 테스트할 수 있는 기능. 새 피해 계산을
// 만들지 않고 기존 applyDamage() 파이프라인을 그대로 재사용한다 - 그래야
// 방어력/마법저항력/방어구 관통 등 실제 스킬과 동일한 계산 결과를 확인할
// 수 있다(임의의 숫자를 곧바로 HP에서 빼는 방식이 아님).
function getDamageTestTarget() {
  // 현재 선택된 대상이 더미(기본/설치 더미 전부 isTrainingDummy)라면 그걸
  // 우선 사용하고, 없으면 기본 더미로 폴백한다 - 설치한 여러 더미 중
  // 원하는 것을 클릭으로 골라 테스트할 수 있게 한다.
  if (controller && controller.currentTarget && controller.currentTarget.isTrainingDummy && controller.currentTarget.hp > 0) return controller.currentTarget;
  if (typeof dummy !== 'undefined' && dummy && dummy.hp > 0) return dummy;
  return null;
}
const dummyDamageInputEl = document.getElementById('dummyDamageInput');
const dummyDamageTypeEl = document.getElementById('dummyDamageType');
const applyDummyDamageBtnEl = document.getElementById('applyDummyDamageBtn');
const healDummyBtnEl = document.getElementById('healDummyBtn');
function applyTestDamage() {
  const target = getDamageTestTarget();
  if (!target) { console.log('[더미 데미지 테스트] 대상 없음 - 더미를 배치하거나 클릭으로 선택하세요'); return; }
  const raw = Number(dummyDamageInputEl.value);
  if (!Number.isFinite(raw) || raw <= 0) { console.log('[더미 데미지 테스트] 올바른 양수를 입력하세요'); return; }
  const damageType = dummyDamageTypeEl.value;
  const before = target.hp;
  const applied = applyDamage(target, { rawDamage: raw, damageType, isCritical: false, critMultiplier: 1 });
  console.log(`[더미 데미지 테스트] 입력 ${raw}(${damageType}) -> 실제 적용 ${applied.toFixed(1)} (방어력/저항력 반영) | HP ${before.toFixed(1)} -> ${target.hp.toFixed(1)}`);
}
if (applyDummyDamageBtnEl) applyDummyDamageBtnEl.addEventListener('click', applyTestDamage);
if (dummyDamageInputEl) dummyDamageInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyTestDamage(); });
if (healDummyBtnEl) {
  healDummyBtnEl.addEventListener('click', () => {
    const target = getDamageTestTarget();
    if (!target) { console.log('[더미 회복] 대상 없음'); return; }
    target.hp = target.maxHp;
    if (target.labelDiv) {
      const bar = target.labelDiv.querySelector('.hpBarInner');
      if (bar) {
        bar.style.width = '100%';
        if (target.labelDiv.classList.contains('champion')) bar.style.background = 'linear-gradient(180deg,#6fe06a,#2f9e2f)';
      }
      target.labelDiv.style.opacity = '1';
    }
    console.log(`[더미 회복] ${unitLabel(target)} 체력을 ${target.maxHp}으로 전부 회복`);
  });
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (paused || !controller) return;
  if (e.button === 2) {
    const groundPoint = getGroundPoint(e.clientX, e.clientY);
    if (!groundPoint) return;
    // Alpha Strike 진행 중 우클릭(요청 문서 1 섹션 25): 재등장 방향만
    // 갱신하고, 일반 이동 명령(controller.moveTo)은 실행하지 않는다 -
    // "Q 상태 + 우클릭 -> 재등장 위치 변경, 이동 명령은 실행 안 함".
    if (controller._masteryi && controller._masteryi.alpha) {
      controller._masteryiSetAlphaStrikeReemergeDirection(groundPoint);
      return;
    }
    spawnMoveMarker(groundPoint); controller.moveTo(groundPoint);
  } else if (e.button === 0) {
    if (dummyPlaceMode) {
      const groundPoint = getGroundPoint(e.clientX, e.clientY);
      if (groundPoint) placeDummyAt(groundPoint);
      return;
    }
    const enemyHit = getEnemyHit(e.clientX, e.clientY);
    if (enemyHit) controller.selectTarget(enemyHit);
    else { controller.currentTarget = null; targetRing.clear(); }
  }
});

// 요청("지정 쉽게 해줘") - 클릭하기 전에 커서를 바꿔서 지금 무엇을
// 지정하게 될지 미리 보여준다(관대한 클릭 판정과 동일한 getEnemyHit을
// 그대로 재사용 - 새 판정 시스템을 따로 만들지 않음). 마우스가 멈춰
// 있을 때는 값이 안 바뀌므로 매 프레임이 아니라 실제 mousemove 이벤트가
// 있을 때만 계산되고, 후보 수도 최대 수십 개 수준이라 비용이 거의 없다.
renderer.domElement.addEventListener('pointermove', (e) => {
  if (paused || !controller || dummyPlaceMode) { renderer.domElement.style.cursor = ''; return; }
  const enemyHit = getEnemyHit(e.clientX, e.clientY);
  renderer.domElement.style.cursor = enemyHit ? 'pointer' : '';
});

window.addEventListener('keydown', (e) => {
  if (!controller) return;
  // 버그 수정("스킬 쓰면 마우스 커서가 사라진다"): 이 앱 자체는 커서를
  // 숨기는 코드가 없다 - 이건 브라우저가 키보드 입력이 들어오면 마우스
  // 커서를 잠깐 자동으로 숨기는 동작(특히 크롬 계열) 때문이다. Q/W/E/R
  // 스킬을 전부 키보드로 쓰니까 스킬을 쓸 때마다 이 현상이 발생했다.
  // 키 입력이 들어올 때마다 커서 스타일을 강제로 다시 지정해서 브라우저의
  // 자동 숨김을 무력화한다 - renderer.domElement에 이미 있던 커서 값을
  // 그대로 재적용할 뿐이라 다른 커서 로직(크로스헤어/포인터 등)과
  // 충돌하지 않는다.
  const canvasEl = renderer.domElement;
  const keepCursor = canvasEl.style.cursor;
  canvasEl.style.cursor = 'none';
  requestAnimationFrame(() => { canvasEl.style.cursor = keepCursor; });
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'F1') { e.preventDefault(); debugPanelVisible = !debugPanelVisible; return; }
  if (e.code === 'KeyV') { rangeIndicators.toggle(); const cb = document.getElementById('rangeIndicatorCheckbox'); if (cb) cb.checked = rangeIndicators.visible; return; }
  if (e.code === 'KeyP') { setDummyPlaceMode(!dummyPlaceMode); if (dummyPlaceCheckboxEl) dummyPlaceCheckboxEl.checked = dummyPlaceMode; return; }
  if (paused) return;
  // 버그 수정(핵심 - "마스터 이 W 모션이 반복된다"의 진짜 원인): 이
  // 리스너에 OS 키 반복(long-press) 방지 처리가 전혀 없었다. 키를 누르고
  // 있으면 브라우저가 짧은 간격으로 keydown을 계속 재발생시키는데(e.repeat
  // === true), 그때마다 castAbility('W')가 다시 호출됐다. "이미 명상
  // 중이면 W를 또 누르는 것 = 즉시 취소"로 만들어둔 로직과 맞물려서,
  // W를 누르고 있기만 해도 시작→취소→시작→취소가 수십 밀리초 간격으로
  // 반복돼 정확히 "모션이 반복되는" 것처럼 보였다. Q/E/R도 키를 누르고
  // 있으면 계속 재시전되는 같은 문제가 있었다 - e.repeat 하나로 전부
  // 막는다(각 스킬 로직은 전혀 건드리지 않음).
  if (e.repeat) return;
  const mousePoint = lastGroundPoint || controller.root.position.clone();
  switch (e.code) {
    case 'KeyQ': controller.castAbility('Q', mousePoint); break;
    case 'KeyW': controller.castAbility('W', mousePoint); break;
    case 'KeyE': controller.castAbility('E', mousePoint); break;
    // 버그 수정("이즈리얼 궁이 마우스 커서 쪽으로 안 나간다"): 이 R
    // 키 핸들러가 다른 스킬(Q/W/E)과 달리 mousePoint를 아예 넘기지 않고
    // controller.castAbility('R')만 호출했다 - 가렌/다리우스/세트/모데카이저/
    // 닐라처럼 방향이 필요 없는 R에는 원래 문제가 없었지만, 요네·이즈리얼처럼
    // 마우스 방향이 그대로 필요한 직선 R(_yoneCastR/_ezrealCastR)에는
    // mouseWorldPoint 자체가 undefined로 들어가 항상 기본 방향(정면)으로만
    // 나갔다. Q/W/E와 동일하게 mousePoint를 넘기도록 통일한다 - 방향이
    // 필요 없는 챔피언들의 _castR(free)/_nilahCastR 등은 애초에 두 번째
    // 인자를 받지 않으므로 영향이 없다.
    case 'KeyR': controller.castAbility('R', mousePoint); break;
    case 'KeyB': controller.startRecall(); break;
    case 'Space': if (dummy && dummy.hp > 0) controller.selectTarget(dummy); break;
  }
});

let lastGroundPoint = null;
window.addEventListener('pointermove', (e) => { const p = getGroundPoint(e.clientX, e.clientY); if (p) lastGroundPoint = p; });

function togglePause() {
  paused = !paused;
  document.getElementById('pauseOverlay').classList.toggle('show', paused);
  clock.getDelta();
}

