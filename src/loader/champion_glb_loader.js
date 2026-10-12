/* ============================================================
   6. CHAMPION GLB LOADING (범용 로더 - 추가 수정사항 10/21/24/25)
   ------------------------------------------------------------
   loadChampionGLB() is the single entry point used both by the
   first-run "GLB를 선택하세요" screen and by "GLB 교체" later --
   swapping mid-session tears down the previous model/mixer/state
   and rebuilds everything from the new file with no page reload.
   ============================================================ */
const loadingEl = document.getElementById('loading');
const glbEntryEl = document.getElementById('glbEntry');
const glbErrMsgEl = document.getElementById('glbErrMsg');

function disposeCurrentChampion() {
  if (controller) {
    // GLB를 새로 불러오면 컨트롤러 자체를 버리고 새로 만든다 - 버려지는 컨트롤러의 지연 판정이
    // 나중에 더미를 때리거나, 잡힌/격리된 대상이 복귀하지 못하는 일이 없게 먼저 정리한다.
    controller._teardownChampionRuntime();
    controller._clearPending();
    clearTimeout(controller._previewTimer);
    if (controller.mixer) controller.mixer.stopAllAction();
    // 요청("채찍에 직접 연결된 상시 발광"): 이 발광 메시는 championRoot의
    // 자식이 아니라 scene에 직접 추가했으므로, championRoot.traverse()
    // 청소만으로는 안 지워진다 - 여기서 따로 정리한다.
    const glow = controller._nilahWeaponRig?.glow;
    const trail = controller._nilahWeaponRig?.trailRibbon; // 무기 궤적 리본도 scene 직속 - 예전엔 닐라를 불러올 때마다 하나씩 남았다
    if (glow || trail) {
      for (const mesh of [glow?.meshA, glow?.meshB, trail]) {
        if (!mesh) continue;
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
        scene.remove(mesh);
      }
    }
  }
  if (championRoot) {
    scene.remove(championRoot);
    championRoot.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  }
  // 요청("챔피언한테도 hp바를 만들어줘") - 챔피언 교체 시 이전 체력바
  // DOM 요소도 같이 정리한다(CSS2DObject는 부모와 함께 씬에서는 빠지지만
  // 실제 DOM 엘리먼트는 별도로 지워줘야 한다).
  if (controller && controller.healthBarLabelDiv && controller.healthBarLabelDiv.parentNode) {
    controller.healthBarLabelDiv.parentNode.removeChild(controller.healthBarLabelDiv);
  }
  championRoot = null;
  controller = null;
}

/* ============================================================
   5-A. GLB 모델 위치 정렬 (원점/바닥 보정 전용 — 크기는 절대 건드리지 않음)
   ------------------------------------------------------------
   [절대적인 모델 크기 처리 규칙] 챔피언 GLB의 최종 렌더링 크기는
   오직 "GLB 원본 크기 × 챔피언별 고정 Multiplier"로만 결정된다.
   BoundingBox 목표 높이(targetHeight) 기준 자동 스케일 정규화는
   완전히 제거되었다 - 이 함수는 더 이상 model.scale을 전혀 건드리지
   않고, X/Z 중앙 정렬과 Y=0 바닥 정렬 같은 "위치(Position)"만
   보정한다. GLB 원본이 가진 내부 scale/Transform은 그대로 보존된다.

   중요: 이 함수는 오직 "시각적 모델(model)"의 position만 건드린다.
   공격 사거리(stats.attackRange), 충돌/선택 반경(dummy.radius 등),
   이동속도(stats.baseMoveSpeed) 같은 게임 판정용 수치는 여기서 전혀
   건드리지 않고 CharacterController.stats 쪽에 독립적으로 유지된다.
   ============================================================ */

/* ============================================================
   NILAH WEAPON RIG / URUMI VISIBILITY INTEGRITY
   ------------------------------------------------------------
   닐라 GLB는 별도 무기 GLB가 아니라 본체 스켈레톤 안에 Urumi(채찍/칼날)
   리그가 포함되어 있다. Urumi -> Blade_Root/BladeA_* / BladeB_* 본이
   캐릭터 애니메이션과 함께 움직이므로 별도 mesh를 새로 만들지 않는다.
   이 함수는 해당 무기 리그가 로드 과정에서 숨겨지지 않도록 명시적으로
   활성화하고, 스킨 메시에 그림자 설정을 보장한다.
   ============================================================ */
const NILAH_WEAPON_BONE_PREFIXES = ['BladeA_', 'BladeB_'];
function ensureNilahWeaponRig(model) {
  if (!model) return null;
  const urumi = model.getObjectByName('Urumi');
  const bladeRoot = model.getObjectByName('Blade_Root');
  const bladeRootTwist = model.getObjectByName('Blade_Root_twist');

  if (urumi) urumi.visible = true;
  if (bladeRoot) bladeRoot.visible = true;
  if (bladeRootTwist) bladeRootTwist.visible = true;

  let bladeBoneCount = 0;
  let skinnedMeshes = 0;
  model.traverse((o) => {
    if (o.name && (NILAH_WEAPON_BONE_PREFIXES.some(p => o.name.startsWith(p)) || o.name === 'BladeA_end' || o.name === 'BladeB_end')) {
      o.visible = true;
      bladeBoneCount++;
    }
    if (o.isSkinnedMesh) {
      o.visible = true;
      o.castShadow = true;
      o.receiveShadow = true;
      skinnedMeshes++;
    }
  });

  // 실제 GLB 내부의 Urumi 리그가 확인되지 않으면 별도 무기를 임의 생성하지 않는다.
  // 모델에 실제 리그가 존재하는 경우에만 무기 rig 정보를 기록한다.
  const enabled = !!(urumi && bladeRoot && bladeBoneCount > 0);
  model.userData = model.userData || {};
  model.userData.nilahWeaponRig = {
    enabled,
    urumiNode: !!urumi,
    bladeRootNode: !!bladeRoot,
    bladeRootTwistNode: !!bladeRootTwist,
    bladeBoneCount,
    skinnedMeshes,
  };

  console.log('[NILAH WEAPON RIG]', model.userData.nilahWeaponRig);
  return model.userData.nilahWeaponRig;
}

function alignModelOrigin(model) {
  // 원본 GLB의 Bounding Box를 있는 그대로(스케일 변경 없이) 측정한다.
  const box = new THREE.Box3().setFromObject(model);

  // X/Z 중심을 원점(0,0)으로 정렬.
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;

  // Bounding Box 최하단(발)을 Y=0에 정렬.
  model.position.y -= box.min.y;

  // 최종 변환을 확실히 반영.
  model.updateMatrixWorld(true);

  return { box };
}

async function bootstrapChampion(gltf, fileName) {
  disposeCurrentChampion();
  // 요청("이 glb들 상시로 적용되있게 해줘") - 포탑/억제기/넥서스를 만들기
  // 전에 내장 GLB 디코딩이 끝났는지 반드시 기다린다(둘 다 비동기라 순서가
  // 보장되지 않으면 챔피언이 먼저 뜨고 포탑은 아직 placeholder로 남을 수
  // 있다). 이미 끝나 있으면(대부분의 경우) 사실상 즉시 통과한다.
  await embeddedBuildingAssetsReady;

  const model = gltf.scene;
  const championId = identifyChampionId(fileName, gltf);

  // 닐라 GLB에 내장된 Urumi(칼날/채찍) 리그를 명시적으로 활성화한다.
  // 본체 애니메이션 믹서가 BladeA/BladeB 본을 움직이므로 Q/E/R 모션과
  // 무기 움직임이 동일한 애니메이션 타이밍으로 따라간다.
  if (championId === 'nilah') ensureNilahWeaponRig(gltf.scene);

  // GLB 원본 model 및 내부 hierarchy(스켈레톤/애니메이션)는 그대로
  // 유지한 채, 위치(중앙/바닥)만 정렬한다 - 크기는 전혀 바꾸지 않는다.
  alignModelOrigin(model);
  // 버그 수정("요네가 가만히 있어도 계속 한쪽으로 치우쳐 보인다"): 요네.glb를
  // 직접 파싱해서 확인한 결과, Root 뼈대의 "바인드 포즈" translation은
  // (0, 1.278, -0.0297)로 거의 대칭인데, 실제로 항상 재생되는 Idle1_Base
  // 애니메이션 클립 안에서는 Root translation이 매 키프레임 고정값
  // (+0.03977, ~1.30(호흡으로 미세 진동), -0.15846)으로 박혀 있다(시간에
  // 따라 움직이는 흔들림이 아니라 애초에 바인드포즈와 다른 고정 오프셋).
  // alignModelOrigin()은 "애니메이션이 재생되기 전" 원본 바인드 포즈만
  // 보고 중심을 맞추기 때문에, Idle이 실제로 재생되기 시작하면 그 차이
  // (X: +0.03977, Z: -0.15846-(-0.02966)=-0.12880)만큼 모델 전체가 밀려
  // 보인다. 1차 수정에서는 X축 차이만 잡고 더 큰 Z축 차이(약 3배 더 큼)를
  // 놓쳐서 여전히 어긋나 보였다 - 이번에 Z축까지 정확히 상쇄한다.
  const MODEL_ORIGIN_CORRECTION = { yone: { x: -0.03977488, z: 0.12879331697463989 } };
  const originCorrection = MODEL_ORIGIN_CORRECTION[championId];
  if (originCorrection) { model.position.x += originCorrection.x; model.position.z += originCorrection.z; }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // scaleWrapper: 챔피언별 고정 Multiplier(MODEL_SCALE_MULTIPLIERS)는
  // 오직 이 외부 Wrapper에만 적용한다. GLB 원본 model.scale은 절대
  // 건드리지 않으므로, 최종 크기 = "GLB 원본 크기 × 고정 Multiplier"가
  // 정확히 유지된다(중복 Scale 없음). modelScaleMultiplier는 화면 우측
  // scaleButtons(0.8/1.0/1.2)로 사용자가 수동으로 미리보기하는 배율로,
  // 챔피언 고정 Multiplier 위에 곱해지는 별개의 사용자 조작값이다.
  championBaseScaleMultiplier = resolveModelScaleMultiplier(championId);
  const scaleWrapper = new THREE.Group();
  scaleWrapper.add(model);
  scaleWrapper.scale.setScalar(championBaseScaleMultiplier * modelScaleMultiplier);

  const root = new THREE.Group(); // Unit Group: 실제 게임 위치/이동 담당
  root.add(scaleWrapper);         // Model Container: 챔피언 고정 크기 Multiplier만 담당
  root.position.set(0, 0, 0);
  scene.add(root);
  championRoot = root;

  const resolver = new AnimationRoleResolver(gltf.animations || []);
  const abilityResolver = new ChampionAbilityResolver(resolver, championId);
  const actionData = buildActionData(resolver, abilityResolver);
  const skillAnimStore = new SkillAnimationSequenceStore(championId);

  const box2 = new THREE.Box3().setFromObject(model);
  const sphere = new THREE.Sphere();
  box2.getBoundingSphere(sphere);
  root.add(createBlobShadow(sphere.radius * 0.9)); // 최적화(문서 4-7절): 실시간 그림자 대신 값싼 blob 그림자

  // 요청("챔피언한테도 hp바를 만들어줘") - 더미에 이미 만들어둔 "실제 롤
  // 챔피언 체력바" 스타일(#enemyLabel.champion - 넓은 바 + 금테 + 체력별
  // 초록/노랑/빨강)을 플레이어 자신의 머리 위에도 그대로 재사용한다.
  // 높이는 매 프레임 다시 재는 대신(미니언 드리프트 버그와 동일한 이유로
  // 위험) 모델 로드 직후 이 한 번만 측정한 bounding box를 그대로 쓴다.
  const hpLabelDiv = document.createElement('div');
  hpLabelDiv.id = 'enemyLabel';
  hpLabelDiv.className = 'champion';
  hpLabelDiv.innerHTML = `<div class="hpLevelBadge">18</div><div><div class="hpBarOuter"><div class="hpBarInner" style="background:linear-gradient(180deg,#70e35e 0%,#36b934 55%,#16851d 100%)"></div><div class="hpValueText">0 / 0</div></div><div class="champResourceBar"><div class="champResourceFill"></div></div></div>`;
  const hpLabel3d = new CSS2DObject(hpLabelDiv);
  // 요청("챔피언 머리위 hp바가 챔피언을 너무 가려 좀더 위로") - 여유값을
  // 기존 위치에서 1.5만큼 더 올려 챔피언 머리 위에 확실히 표시한다.
  hpLabel3d.position.set(0, (isFinite(box2.max.y) ? box2.max.y : BASE_UNIT * 1.8) + 2.55, 0);
  root.add(hpLabel3d);

  controller = new CharacterController(root, model, resolver, actionData);
  window.controller = controller;
  if (championId === 'nilah') {
    const findAny = (names) => { for (const n of names) { const o = model.getObjectByName(n); if (o) return o; } return null; };
    // 요청("무기에 직접적으로 연결"): 끝 관절 2개만이 아니라 BladeA/B의
    // 전체 뼈대 체인(각각 16개 + end)을 순서대로 모아둔다 - 이 체인을
    // 그대로 이으면 실제 애니메이션이 만드는 채찍의 곡선을 정확히 따라
    // 그릴 수 있다(별도 좌표계나 근사 곡선을 만들지 않는다).
    const collectChain = (prefix) => {
      const chain = [];
      for (let i = 1; i <= 16; i++) { const o = model.getObjectByName(`${prefix}_${i}`); if (o) chain.push(o); }
      const end = findAny([`${prefix}_end`]);
      if (end) chain.push(end);
      return chain;
    };
    controller._nilahWeaponRig = {
      urumi: model.getObjectByName('Urumi'),
      bladeRoot: model.getObjectByName('Blade_Root'),
      bladeAEnd: findAny(['BladeA_end','BladeA_16','BladeA_15']),
      bladeBEnd: findAny(['BladeB_end','BladeB_16','BladeB_15']),
      bladeAChain: collectChain('BladeA'),
      bladeBChain: collectChain('BladeB'),
      trailSamples: [], lastTip: null, active: false,
      sampleClock: 0, maxSamples: 20, trailRibbon: null
    };
  }
  controller.healthBarLabelDiv = hpLabelDiv; // updateBars()에서 갱신, disposeCurrentChampion()에서 정리
  controller.skillAnimStore = skillAnimStore; // Q/W/E/R 다중 애니메이션 시퀀스 저장소(섹션 0-A2)
  controller.abilityResolver = abilityResolver; // 서브 상태/평타 오버라이드가 championAbilityDatabase를 참조하기 위함
  controller.applyChampionData(championId); // 기획안 CHAMPION_DATA 연결 + 1레벨 스탯 적용(섹션 3/13)
  updateGoldDisplay(); // 아이템/골드는 챔피언 교체에도 유지되므로(생성자 참고) HUD도 그대로 재표시
  if (typeof updateItemUI === 'function') updateItemUI(controller);
  if (championId === 'renekton' && controller.findAnimation('Idle1')) {
    controller.playFirstAvailable(['Idle1'], { loop: THREE.LoopRepeat, fade: 0 });
  } else if (championId === 'yasuo' && controller.findAnimation('Idle1_Raw')) {
    controller.playFirstAvailable(['Idle1_Raw'], { loop: THREE.LoopRepeat, fade: 0 });
  } else {
    controller.playFirstAvailable(actionData.idle.clips, { fade: 0 });
  }
  updateBars(controller);
  updateSkillUI(controller.cooldowns);
  // 요청("ui적용해줘") - 새 HUD 초상화 박스에 챔피언 ID 앞 두 글자를 표시한다.
  const portraitEl = document.getElementById('portraitBox');
  if (portraitEl) portraitEl.textContent = championId ? championId.slice(0, 2).toUpperCase() : '-';

  currentChampion = { fileName, championId, resolver, abilityResolver, actionData, skillAnimStore, boundsRadius: sphere.radius || BASE_UNIT * 0.55 };

  applyCameraDistanceForChampion();
  renderChampionInfoPanel();
  renderChampionSelect();
  renderAnimationExplorer(resolver.clips);
  renderAbilityMappingPanel();
  renderMappingPanel();
  updateAbilitySlotNames();

  // 요청: 중앙에 연습용 허수아비 3개를 다시 기본 배치한다.
  // 기존 수동 설치 시스템(placeDummyAt/placedDummies)은 그대로 유지하고,
  // 챔피언을 새로 불러올 때 이전 더미를 먼저 정리한 뒤 중앙 앞쪽에
  // 기본 더미 3개를 가로로 배치한다. 가운데 더미는 기존 `dummy`, 양옆은
  // `placedDummies`에 넣어 기존 공격/스킬 판정 시스템을 그대로 재사용한다.
  // GLB 교체 시 이전 더미의 Mesh뿐 아니라 CSS2D HP바 DOM도 먼저 제거한다.
  // CSS2DRenderer의 다음 render를 기다리지 않고 즉시 정리해서,
  // 이전 챔피언에서 진행 중이던 더미 HP바가 새 GLB 화면에 고아 상태로 남지 않게 한다.
  if (dummy) removeDummyVisual(dummy);
  dummy = null;
  if (typeof clearPlacedDummies === 'function') clearPlacedDummies();
  dummy = createDummyEnemy(new THREE.Vector3(0, 0, -6));
  placedDummies.push(createDummyEnemy(new THREE.Vector3(-4, 0, -6)));
  placedDummies.push(createDummyEnemy(new THREE.Vector3(4, 0, -6)));
  // 칼바람 나락 포탑을 새 얼음 라인(HOWLING ABYSS MAP, X=0 중앙선)을 따라
  // RED/BLUE 양 진영에 대칭 배치한다(요청 문서 2/3절 - 방향 통일 + 양쪽 기지).
  // 요청(사용자 재지적 - 실제 미니맵 확인) - 우물(기지)은 소환/귀환
  // 지점(분수)이라 실제로는 넥서스보다도 더 안쪽, 기지의 가장 끝(맨 뒤)에
  // 있다. 기지 안쪽에서 바깥쪽(중앙 라인) 순서는 다음과 같다:
  //   넥서스+오벨리스크(맨 뒤) → 우물 → 넥서스 구역 → 넥서스 쌍둥이 포탑 →
  //   억제기+억제기포탑 → 2차외곽포탑 → 1차외곽포탑
  // "넥서스 오벨리스크"는 넥서스 바로 옆(같은 자리)의 장식물이라 별도
  // 좌표가 필요 없다 - 실제 넥서스 GLB 자체에 이미 포함돼 있다고 보고
  // 별도 오브젝트를 새로 만들지 않는다(요청 6절 - 중복 생성 금지 원칙).
  // 포탑/미니언/억제기/넥서스 제거: 게임 시작 시 어떤 구조물도 생성하지 않는다.
  turrets.length = 0;
  inhibitorBuildings.length = 0;
  nexusBuildings.length = 0;
  minions.length = 0;

  // 요청("게임을 시작하면 자기 진영 우물에서 시작하게") - 실제 LoL처럼
  // 챔피언은 자기 팀 기지의 우물(분수)에서 스폰한다. 플레이어는 기존
  // 설계대로 항상 PLAYER_TEAM(BLUE) 소속이다. 위에서 우물(NEXUS_WELL)이
  // 이미 다 만들어진 뒤라 실제 좌표를 그대로 읽어올 수 있다 - 좌표를
  // 또 하드코딩하지 않고, 우물 위치가 나중에 바뀌어도 자동으로 따라간다.
  // 구조물이 없는 빈 연습 공간이므로 중앙에서 시작한다.
  root.position.set(0, 0, 0);

  loadingEl.classList.remove('show');
  glbEntryEl.classList.remove('show');
}

// 추가 수정사항 12: 캐릭터 크기(정규화 후 bounding sphere)에 맞춰 카메라 거리 자동 계산.
function applyCameraDistanceForChampion() {
  const r = (currentChampion?.boundsRadius || BASE_UNIT * 0.55) * championBaseScaleMultiplier * modelScaleMultiplier;
  const dist = THREE.MathUtils.clamp(r * 26, 16, 60);
  cameraRig.distance = dist;
  cameraRig.minDistance = THREE.MathUtils.clamp(dist * 0.62, 10, 50);
  cameraRig.maxDistance = THREE.MathUtils.clamp(dist * 1.6, 20, 90);
}

function loadFromArrayBuffer(buffer, fileName) {
  const loader = new GLTFLoader();
  loader.parse(buffer, '', (gltf) => bootstrapChampion(gltf, fileName),
    (err) => { console.error(err); loadingEl.classList.remove('show'); glbErrMsgEl.textContent = 'GLB 파싱 실패: ' + (err?.message || err); glbEntryEl.classList.add('show'); });
}
function loadChampionFile(file) {
  if (!file) return;
  glbErrMsgEl.textContent = '';
  loadingEl.classList.add('show');
  const reader = new FileReader();
  reader.onload = (ev) => loadFromArrayBuffer(ev.target.result, file.name);
  reader.onerror = () => { loadingEl.classList.remove('show'); glbErrMsgEl.textContent = '파일을 읽지 못했습니다.'; };
  reader.readAsArrayBuffer(file);
}

const glbFileInput = document.getElementById('glbFileInput');
glbFileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadChampionFile(f); });

document.getElementById('swapGlbBtn').addEventListener('click', () => glbFileInput.click());

const glbDropHint = document.getElementById('glbDropHint');
['dragover', 'dragenter'].forEach(ev => glbDropHint.addEventListener(ev, (e) => { e.preventDefault(); glbDropHint.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(ev => glbDropHint.addEventListener(ev, (e) => { e.preventDefault(); glbDropHint.classList.remove('dragover'); }));
glbDropHint.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadChampionFile(f); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!glbEntryEl.classList.contains('show')) { // 게임 화면 어디에 드롭해도 GLB 교체
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadChampionFile(f);
  }
});

const animGlbFileInput = document.getElementById('animGlbFileInput');
animGlbFileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadAnimationGlbFile(f); animGlbFileInput.value = ''; });
document.getElementById('loadAnimGlbBtn').addEventListener('click', () => animGlbFileInput.click());

/* ============================================================
   6-B. 애니메이션 GLB 별도 로딩 (모델 GLB와 분리된 애니메이션 GLB)
   ------------------------------------------------------------
   Khada 등에서 캐릭터의 특정 자세/애니메이션만 별도 GLB로 받아온
   경우를 위한 기능이다. 핵심 원칙은 하나: 애니메이션 GLB의
   gltf.scene은 scene.add()하지 않는다 - 그건 새로운(빈 텍스처의)
   캐릭터를 하나 더 만드는 것일 뿐이다. 대신 gltf.animations에서
   AnimationClip만 뽑아서, 이미 로드되어 있는 캐릭터 모델의 Skeleton
   위에서 재생되는 기존 controller.mixer/actions 구조에 그대로
   합류시킨다 - AnimationMixer는 원래 모델의 root(controller.root)에
   이미 바인딩되어 있으므로, clip.tracks가 참조하는 본 이름이 root
   하위 어딘가의 실제 Object3D 이름과 일치하기만 하면 clipAction()이
   알아서 그 본을 찾아 연결한다(새 Mixer를 또 만들 필요가 없다).

   alignModelOrigin()은 model(=Object3D 최상위) 전체의 position만
   건드리고(스케일은 전혀 건드리지 않음) Bone.position/rotation은 절대
   직접 수정하지 않으므로, 이 과정이 스켈레톤이나 바인드 포즈를
   망가뜨리지 않는다.
   ============================================================ */
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function getBoneNames(model) {
  const names = new Set();
  model.traverse((o) => { if (o.isBone) names.add(o.name); });
  return names;
}
function getAllNodeNames(model) {
  const names = new Set();
  model.traverse((o) => { if (o.name) names.add(o.name); });
  return names;
}

// 요청 3/4: 단순 문자열 split이 아니라 THREE.PropertyBinding의 실제 트랙
// 이름 파서를 사용해 "nodeName"을 안전하게 뽑아낸다. PropertyBinding은
// "Armature/Hips.quaternion" 같은 계층 경로도, "Hips.quaternion" 같은 단일
// 이름도, "Hips.position[x]" 같은 배열 인덱스도 전부 정확히 파싱해준다.
function parseTrackNodeName(trackName) {
  try {
    const parsed = THREE.PropertyBinding.parseTrackName(trackName);
    return parsed.nodeName || trackName;
  } catch (e) {
    // 파싱 자체가 실패하는 비정상적인 트랙 이름은 마지막 '.' 앞부분으로 대충 대체.
    const dot = trackName.lastIndexOf('.');
    return dot >= 0 ? trackName.slice(0, dot) : trackName;
  }
}

// 요청 7: "이름이 다르지만 실제로 같은 Bone"인 안전한 경우만 정규화한다.
// - Armature/Bone, Armature|Bone 같은 경로 접두사는 마지막 세그먼트만 남김
// - mixamorig: 같은 흔한 리깅 툴 접두사만 제거
// 그 이상은(예: 챔피언 이름을 붙인 "MasterYi_Hip") 절대 추측해서 바꾸지 않는다.
function normalizeBoneToken(name) {
  if (!name) return '';
  let n = name.split('/').pop().split('|').pop();
  n = n.replace(/^mixamorig:?/i, '');
  return n;
}

// 요청 3~6: Track ↔ 실제 모델 Bone 바인딩 가능 여부를 정밀 분석한다.
// exactMatched: 이름이 그대로 일치 (바로 재생 가능)
// retargetable: 경로 접두사/mixamorig 접두사 차이만 있어 안전하게 자동 보정 가능
// unmatched: 그 외 - 안전하게 보정할 수 없는 진짜 불일치
function analyzeAnimationCompatibility(clip, model) {
  const boneNames = getBoneNames(model);
  const allNodeNames = getAllNodeNames(model);
  const perTrack = clip.tracks.map((t) => {
    const rawNode = parseTrackNodeName(t.name);
    const leaf = rawNode.split('/').pop().split('|').pop();
    const normalized = normalizeBoneToken(rawNode);
    let status = 'unmatched';
    if (boneNames.has(rawNode) || allNodeNames.has(rawNode)) status = 'exact';
    else if (boneNames.has(leaf) || allNodeNames.has(leaf)) status = 'retarget'; // 경로 접두사만 다름
    else if (boneNames.has(normalized) || allNodeNames.has(normalized)) status = 'retarget'; // mixamorig: 등
    return { trackName: t.name, rawNode, status };
  });

  const exactMatched = perTrack.filter((t) => t.status === 'exact');
  const retargetable = perTrack.filter((t) => t.status === 'retarget');
  const unmatched = perTrack.filter((t) => t.status === 'unmatched');
  const matchedCount = exactMatched.length + retargetable.length;
  const matchRate = clip.tracks.length ? matchedCount / clip.tracks.length : 0;

  const boneTrackNames = new Set(perTrack.filter(t => boneNames.has(t.rawNode) || boneNames.has(normalizeBoneToken(t.rawNode))).map(t => t.rawNode));

  let compatibility = 'LOW';
  if (matchRate >= 0.85) compatibility = 'HIGH';
  else if (matchRate >= 0.5) compatibility = 'MEDIUM';

  return {
    clipName: clip.name,
    totalTracks: clip.tracks.length,
    exactMatched, retargetable, unmatched,
    matchedCount, matchRate, compatibility,
    boneTrackCount: boneTrackNames.size,
  };
}

// 요청 8: 이름 차이만 있는 안전한 경우, 원본 clip은 보존하고 복제본의
// track.name만 실제 모델 Bone 이름으로 고쳐서 새 AnimationClip을 만든다.
function buildRetargetedClip(clip, model) {
  const boneNames = getBoneNames(model);
  const allNodeNames = getAllNodeNames(model);
  const fixedClip = clip.clone();
  let changedCount = 0;

  fixedClip.tracks.forEach((track) => {
    const rawNode = parseTrackNodeName(track.name);
    if (boneNames.has(rawNode) || allNodeNames.has(rawNode)) return; // 이미 정확히 일치

    const leaf = rawNode.split('/').pop().split('|').pop();
    let resolved = null;
    if (leaf !== rawNode && (boneNames.has(leaf) || allNodeNames.has(leaf))) resolved = leaf;
    else {
      const normalized = normalizeBoneToken(rawNode);
      if (normalized !== rawNode && (boneNames.has(normalized) || allNodeNames.has(normalized))) resolved = normalized;
    }
    if (resolved) {
      track.name = track.name.replace(rawNode, resolved);
      changedCount++;
    }
  });

  return { fixedClip, changedCount };
}

// 요청 4: 정확히 요청된 콘솔 포맷으로 출력.
function logAnimationBindingCheck(report) {
  console.log('[Animation Binding Check]');
  console.log(`Clip: ${report.clipName}`);
  console.log(`Tracks: ${report.totalTracks}`);
  console.log(`Matched: ${report.matchedCount}`);
  console.log(`Unmatched: ${report.unmatched.length}`);
  console.log(`Match Rate: ${(report.matchRate * 100).toFixed(1)}%`);
  if (report.unmatched.length) {
    console.log('Unmatched:');
    report.unmatched.forEach((t) => console.log(`- ${t.trackName}`));
  }
  // 요청 5: 매칭률이 지나치게 낮으면 명시적으로 경고.
  if (report.matchRate < 0.5) {
    console.warn('[Animation] Clip is probably incompatible with this model:', report.clipName);
  }
}

// 요청 6: 모델 Skeleton vs 애니메이션 GLB 자체 Skeleton(원본 gltf.scene에서만
// 이름을 읽고, scene.add()는 하지 않는다) Bone 목록을 비교해서 로그로 남긴다.
function logSkeletonComparison(model, animGltfScene) {
  const modelBones = getBoneNames(model);
  console.log('[Model Skeleton]');
  console.log(`Bones: ${modelBones.size}`);
  if (!animGltfScene) return null;
  const animBones = getBoneNames(animGltfScene);
  console.log('[Animation Skeleton]');
  console.log(`Bones: ${animBones.size}`);
  let matching = 0;
  animBones.forEach((n) => { if (modelBones.has(n) || modelBones.has(normalizeBoneToken(n))) matching++; });
  const compatibility = animBones.size === 0 ? 'UNKNOWN' : matching / animBones.size >= 0.85 ? 'HIGH' : matching / animBones.size >= 0.5 ? 'MEDIUM' : 'LOW';
  console.log(`Matching Bones: ${matching} / ${animBones.size}`);
  console.log(`Compatibility: ${compatibility}`);
  return { modelBoneCount: modelBones.size, animBoneCount: animBones.size, matching, compatibility };
}

// 새로 뽑아낸(그리고 필요하면 리타게팅된) AnimationClip들을 현재 챔피언의
// resolver/actionData에 합류시킨다. 이름이 겹치면(__anim1 등으로) 구분해서
// 기존 클립을 덮어쓰지 않는다. 기존 수동 매핑(overrides)은 그대로 보존한다.
// 요청 5/12-E: 호환 불가로 판정된(matchRate < 0.5) 클립은 실제 재생 목록에
// 합류시키지 않는다 - "억지로 재생하지 않는다".
function mergeAnimationClips(playableClips, sourceLabel) {
  if (!currentChampion || !controller || !playableClips.length) return [];
  const existing = currentChampion.resolver.clips;
  const existingNames = new Set(existing.map((c) => c.name));
  const addedNames = [];
  const merged = [...existing];
  for (const c of playableClips) {
    let name = c.name || 'clip';
    if (existingNames.has(name)) name = `${name}__${sourceLabel}`;
    c.name = name;
    existingNames.add(name);
    merged.push(c);
    addedNames.push(name);
  }

  const roleOverrides = { ...currentChampion.resolver.overrides };
  const abilityOverrides = { ...currentChampion.abilityResolver.overrides };

  const newResolver = new AnimationRoleResolver(merged);
  Object.assign(newResolver.overrides, roleOverrides);
  const newAbilityResolver = new ChampionAbilityResolver(newResolver, currentChampion.championId);
  Object.assign(newAbilityResolver.overrides, abilityOverrides); // 수동 매핑을 localStorage 복원값 위에 다시 덮어씀

  currentChampion.resolver = newResolver;
  currentChampion.abilityResolver = newAbilityResolver;
  currentChampion.actionData = buildActionData(newResolver, newAbilityResolver);

  controller.clips = newResolver.clips;
  controller.resolver = newResolver;
  controller.actionData = currentChampion.actionData;
  controller.abilityResolver = newAbilityResolver;
  controller._returnToLocomotion();

  renderChampionInfoPanel();
  renderAnimationExplorer(newResolver.clips);
  renderAbilityMappingPanel();
  renderMappingPanel();
  updateAbilitySlotNames();

  return addedNames;
}

const animImportReportEl = document.getElementById('animImportReport');
function renderAnimImportReport(fileName, reports, skeletonInfo) {
  const skelHtml = skeletonInfo
    ? `<div class="abilityStatLine">Skeleton: 모델 ${skeletonInfo.modelBoneCount}본 / 애니메이션 ${skeletonInfo.animBoneCount}본 · 일치 ${skeletonInfo.matching}개 · <b>${skeletonInfo.compatibility}</b></div>`
    : '';
  const rows = reports.map((r) => {
    const pct = Math.round(r.matchRate * 100);
    const cls = r.compatibility === 'HIGH' ? 'matchGood' : r.compatibility === 'MEDIUM' ? '' : 'matchBad';
    const unmatchedNames = r.unmatched.map((t) => t.rawNode);
    const mismatchHtml = unmatchedNames.length
      ? `<div class="mismatchList">불일치 본: ${unmatchedNames.slice(0, 8).map(escapeHtml).join(', ')}${unmatchedNames.length > 8 ? ' ...' : ''}</div>`
      : '';
    const retargetHtml = r.retargetable.length ? `<div class="abilityStatLine">↳ 자동 보정된 트랙 ${r.retargetable.length}개 (경로/접두사 차이만 존재)</div>` : '';
    const appliedHtml = r.applied
      ? `<div><button class="testBtn" data-clip="${escapeHtml(r.appliedClipName)}">▶ 미리보기</button></div>`
      : `<div class="mismatchList">❌ 호환 불가 판정 - 실제 재생 목록에 추가되지 않음</div>`;
    return `<div class="animReportRow">
      <span class="clipName">${escapeHtml(r.clipName)}</span>
      — <span class="${cls}">${r.matchedCount}/${r.totalTracks} 트랙 일치 (${pct}%) · ${r.compatibility}</span>
      ${retargetHtml}
      ${mismatchHtml}
      ${appliedHtml}
    </div>`;
  }).join('');
  animImportReportEl.innerHTML = `<div class="abilityStatLine">불러온 파일: ${escapeHtml(fileName)}</div>${skelHtml}${rows}`;
  animImportReportEl.querySelectorAll('button[data-clip]').forEach((btn) => {
    btn.addEventListener('click', () => { if (controller) controller.debugPreviewClip(btn.dataset.clip); });
  });
}

function loadAnimationGlbFromArrayBuffer(buffer, fileName) {
  if (!currentChampion || !controller) {
    animImportReportEl.innerHTML = `<div class="abilityStatLine warnTag">먼저 챔피언 GLB를 불러온 뒤 애니메이션 GLB를 추가하세요.</div>`;
    return;
  }
  const loader = new GLTFLoader();
  loader.parse(buffer, '', (animGltf) => {
    const clips = animGltf.animations || [];
    if (!clips.length) {
      animImportReportEl.innerHTML = `<div class="abilityStatLine warnTag">이 GLB에는 AnimationClip이 없습니다.</div>`;
      return;
    }

    // 요청된 디버그 로그 (모델은 실제 GLB Scene/Skeleton인 controller.model 기준).
    console.log('Model:', controller.model);
    console.log('Model animations:', currentChampion.resolver.clips);
    console.log('Animation clips:', clips);
    clips.forEach((clip) => console.log('Animation tracks:', clip.name, clip.tracks.map((t) => t.name)));
    controller.model.traverse((o) => { if (o.isBone) console.log('Bone:', o.name); });

    // 요청 6: 모델 Skeleton vs 애니메이션 GLB 자체 Skeleton 비교 (scene.add는 안 함).
    const skeletonInfo = logSkeletonComparison(controller.model, animGltf.scene);

    const sourceLabel = normalizeChampionToken(fileName) || 'anim';
    const reports = [];
    const playableClips = [];

    for (const clip of clips) {
      let workingClip = clip;
      let report = analyzeAnimationCompatibility(workingClip, controller.model);

      // 요청 7/8: 안전하게 보정 가능한 트랙이 있으면 원본은 보존한 채 복제본을
      // 만들어 이름만 고치고, 그 결과로 다시 한 번 호환성을 재평가한다.
      if (report.retargetable.length > 0) {
        const { fixedClip, changedCount } = buildRetargetedClip(clip, controller.model);
        if (changedCount > 0) {
          workingClip = fixedClip;
          report = analyzeAnimationCompatibility(workingClip, controller.model);
        }
      }

      logAnimationBindingCheck(report);

      // 요청 5/12-E: matchRate가 지나치게 낮으면(0.5 미만) 억지로 재생 목록에
      // 넣지 않는다 - 리포트에는 표시하되 실제 적용은 스킵.
      report.applied = report.matchRate >= 0.5;
      report.appliedClipName = workingClip.name;
      if (report.applied) playableClips.push(workingClip);
      reports.push(report);
    }

    mergeAnimationClips(playableClips, sourceLabel);
    renderAnimImportReport(fileName, reports, skeletonInfo);
  }, (err) => {
    console.error(err);
    animImportReportEl.innerHTML = `<div class="abilityStatLine warnTag">애니메이션 GLB 파싱 실패: ${escapeHtml(err?.message || String(err))}</div>`;
  });
}

function loadAnimationGlbFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => loadAnimationGlbFromArrayBuffer(ev.target.result, file.name);
  reader.onerror = () => { animImportReportEl.innerHTML = `<div class="abilityStatLine warnTag">파일을 읽지 못했습니다.</div>`; };
  reader.readAsArrayBuffer(file);
}



/* ============================================================
   7. 챔피언 설정 패널 (Champion Info / Manual Mapping / Explorer)
   추가 수정사항 9, 18, 22, 23
   ============================================================ */
const championSummaryEl = document.getElementById('championSummary');
const levelPanelEl = document.getElementById('levelPanel');
function confidenceTierClass(conf) { return conf >= 85 ? 'high' : conf >= 50 ? 'mid' : 'low'; }
function sourceLabel(source) {
  return { 'db-exact':'Champion DB', 'db-pattern':'Champion DB', 'name-pattern':'Name Match',
    'score':'Estimated', 'fallback':'⚠ Fallback', 'manual':'Manual', 'none':'없음' }[source] || source;
}

function renderChampionInfoPanel() {
  if (!currentChampion) { championSummaryEl.textContent = '불러온 챔피언 없음'; renderLevelPanel(); return; }
  const r = currentChampion.resolver;
  const ar = currentChampion.abilityResolver;
  const otherLine = (label, role) => {
    const name = r.bestName(role);
    const warn = r.fallbackUsed[role] ? ' <span class="warnTag">(Auto fallback)</span>' : '';
    return `${label} → ${name ? escapeHtml(name) : '(없음)'}${warn}`;
  };
  const abilityLine = (label, role) => {
    const name = ar.namesFor(role)[0];
    const conf = ar.confidenceFor(role);
    const src = ar.sourceFor(role);
    return `${label} → ${name ? escapeHtml(name) : '(없음)'} <span class="warnTag">(${sourceLabel(src)} ${conf}%)</span>`;
  };
  championSummaryEl.innerHTML = `
    <b>File:</b> ${escapeHtml(currentChampion.fileName)}<br>
    <b>Champion:</b> ${currentChampion.championId ? escapeHtml(currentChampion.championId) : '(자동 감지 실패)'}<br>
    <b>Animations:</b> ${r.clips.length}<br>
    ${currentChampion.championId === 'nilah' ? `<b>Weapon Rig:</b> Urumi / BladeA+BladeB (GLB 내장)<br>` : ''}
    <br>
    ${otherLine('IDLE','idle')}<br>${otherLine('MOVE','move')}<br>${otherLine('ATTACK','attack')}<br>${otherLine('CRIT','crit')}<br>
    ${abilityLine('Q','q')}<br>${abilityLine('W','w')}<br>${abilityLine('E','e')}<br>${abilityLine('R','r')}<br>
    ${otherLine('DEATH','death')}<br>${otherLine('RESPAWN','respawn')}<br>${otherLine('RECALL','recall')}
  `;
  renderLevelPanel();
}

// 기획안 3/13절: 레벨(1~18)과 Q/W/E/R 스킬레벨(Q/W/E 0~5, R 0~3)을 각각
// 별도로 관리한다. CHAMPION_DATA가 없는 챔피언(이번 단계에서 아직 실전투
// 데이터를 안 넣은 챔피언)은 "이 챔피언은 아직 전투 데이터가 없습니다"만
// 표시하고 기존 동작(패널 없음)과 동일하게 아무 것도 건드리지 않는다.
function renderLevelPanel() {
  if (!levelPanelEl) return;
  if (!controller || !controller.championId || !CHAMPION_DATA[controller.championId]) {
    const idText = controller ? (controller.championId || '(인식 실패 - null)') : '(챔피언 없음)';
    levelPanelEl.innerHTML = `<div style="color:#e84057;">⚠ 전투 데이터 미연결<br><span style="color:#999;font-size:10px;">감지된 championId: ${escapeHtml(idText)}</span><br><span style="color:#999;font-size:10px;">이 값이 sett/mordekaiser/masteryi/chogath/garen/darius 중 하나가 아니면 GLB 자동 인식이 실패한 것입니다. 챔피언 패널의 "챔피언 ID 수동 선택" 드롭다운에서 직접 골라주세요.</span></div>`;
    console.log(`[CHAMPION DATA] 연결 안 됨 - championId="${idText}"`);
    return;
  }
  console.log(`[CHAMPION DATA] 연결됨 - championId="${controller.championId}"`);
  const c = controller;
  const cd = CHAMPION_DATA[c.championId];
  const skillRow = (slot, cap) => {
    const lvl = c.skillLevels[slot] || 0;
    const label = cd[slot] ? cd[slot].name : slot;
    const warnColor = lvl < 1 ? 'color:#e84057;' : '';
    return `<span style="display:inline-block;min-width:56px;${warnColor}">${slot} ${lvl}/${cap}${lvl < 1 ? ' (미습득)' : ''}</span>
      <button data-lvlup-skill="${slot}" ${lvl >= cap ? 'disabled' : ''}>+</button>
      <span style="color:#888;font-size:10px;"> ${escapeHtml(label)}</span><br>`;
  };
  levelPanelEl.innerHTML = `
    <div><b>레벨:</b> ${c.champLevel}/18 <button id="levelUpBtn" ${c.champLevel >= 18 ? 'disabled' : ''}>레벨업</button></div>
    <div style="margin-top:2px;color:#c8aa6e;font-size:11px;">스킬 포인트: ${c.skillPoints || 0} · EXP ${Math.floor(c.currentExp || 0)}/${c.champLevel >= 18 ? '-' : getExpRequired(c.champLevel)}</div>
    <div style="margin-top:6px;">
      ${skillRow('Q', 5)}${skillRow('W', 5)}${skillRow('E', 5)}${skillRow('R', 3)}
    </div>
    <div style="margin-top:4px;color:#e8d8b0;font-size:10px;">빨간 스킬은 아직 포인트를 투자하지 않아 키를 눌러도 작동하지 않습니다. '+'로 먼저 투자하세요. R은 6/11/16레벨부터 랭크업 가능합니다.</div>
  `;
  const upBtn = document.getElementById('levelUpBtn');
  if (upBtn) upBtn.onclick = () => { controller.levelUp(); renderLevelPanel(); };
  levelPanelEl.querySelectorAll('[data-lvlup-skill]').forEach((btn) => {
    btn.onclick = () => { controller.levelUpSkill(btn.getAttribute('data-lvlup-skill')); renderLevelPanel(); };
  });
}

function updateAbilitySlotNames() {
  if (!currentChampion) return;
  const ar = currentChampion.abilityResolver;
  for (const slot of ['Q','W','E','R']) {
    const el = document.querySelector(`#slot${slot} .name`);
    const name = ar.namesFor(slot.toLowerCase())[0];
    el.textContent = name ? name.slice(0, 12) : slot;
  }
}

// 추가 수정사항 5/16: 챔피언 자동 식별 실패 시 사용자가 직접 챔피언을
// 고를 수 있는 선택창. DB에 등록된 챔피언 목록 + "자동 감지 실패/커스텀"을
// 보여주고, 바꾸면 GLB를 다시 불러오지 않고 능력 매핑만 재계산한다.
const championIdSelectEl = document.getElementById('championIdSelect');
function renderChampionSelect() {
  championIdSelectEl.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = ''; noneOpt.textContent = '(자동 감지 실패 / 커스텀 - DB 미사용)';
  championIdSelectEl.appendChild(noneOpt);
  for (const key of Object.keys(championAbilityDatabase)) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = key;
    championIdSelectEl.appendChild(opt);
  }
  championIdSelectEl.value = currentChampion?.championId || '';
}
championIdSelectEl.addEventListener('change', () => {
  if (!currentChampion) return;
  const newId = championIdSelectEl.value || null;
  currentChampion.championId = newId;
  currentChampion.abilityResolver = new ChampionAbilityResolver(currentChampion.resolver, newId);
  currentChampion.actionData = buildActionData(currentChampion.resolver, currentChampion.abilityResolver);
  // championId가 바뀌면 스킬 시퀀스도 그 챔피언 id 소속 저장소로 다시 연결한다
  // (ChampionAbilityResolver와 동일한 방식 -- id별로 별도 localStorage 버킷).
  currentChampion.skillAnimStore = new SkillAnimationSequenceStore(newId);
  if (controller) {
    controller.actionData = currentChampion.actionData;
    controller.skillAnimStore = currentChampion.skillAnimStore;
    controller.abilityResolver = currentChampion.abilityResolver;
    controller.applyChampionData(newId);
    controller._returnToLocomotion();
    updateGoldDisplay();
    if (typeof updateItemUI === 'function') updateItemUI(controller);
  }
  renderChampionInfoPanel();
  renderAbilityMappingPanel();
  updateAbilitySlotNames();
});

// idle/move/attack/crit/channel/recall/death/respawn — 챔피언 DB 개념이
// 없는 일반 역할들. Q/W/E/R은 별도의 renderAbilityMappingPanel()에서 다룬다.
const MAPPABLE_ROLES = [
  ['idle','IDLE'], ['move','MOVE'], ['attack','ATTACK'], ['crit','CRIT'],
  ['channel','R (Windup/Channel)'], ['recall','RECALL'], ['death','DEATH'], ['respawn','RESPAWN'],
];

const mappingListEl = document.getElementById('mappingList');
function renderMappingPanel() {
  mappingListEl.innerHTML = '';
  if (!currentChampion) return;
  const r = currentChampion.resolver;
  const allNames = r.clips.map(c => c.name);
  for (const [role, label] of MAPPABLE_ROLES) {
    const row = document.createElement('div');
    row.className = 'mapRow';
    const lab = document.createElement('label');
    lab.textContent = label;
    const select = document.createElement('select');
    const autoOpt = document.createElement('option');
    autoOpt.value = '';
    const auto = r.roles[role]?.[0]?.name;
    autoOpt.textContent = `-- 자동 감지${auto ? `: ${auto}` : ' (없음)'} --`;
    select.appendChild(autoOpt);
    for (const name of allNames) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (r.overrides[role] === name) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      r.setOverride(role, select.value || null);
      currentChampion.actionData = buildActionData(r, currentChampion.abilityResolver);
      if (controller) {
        controller.actionData = currentChampion.actionData;
        controller._returnToLocomotion();
      }
      renderChampionInfoPanel();
      updateAbilitySlotNames();
    });
    row.appendChild(lab); row.appendChild(select);
    mappingListEl.appendChild(row);
  }
}

// 추가 수정사항 16/17/19: Q/W/E/R 전용 매핑 패널 - 신뢰도 배지, 수동 재지정
// 드롭다운(선택 시 챔피언별 localStorage에 자동 저장), ▶ 테스트 버튼,
// Duration/Fire Time/Cancel Time 표시를 한 번에 보여준다.
function abilityTimingFor(role) {
  const ad = currentChampion.actionData;
  if (role === 'q') return ad.qForward;
  if (role === 'w') return ad.w;
  if (role === 'e') return ad.e1;
  if (role === 'r') {
    if (ad.hasRChannel) {
      const total = ad.rWindup.duration + ad.rChannel.duration + ad.rCast.startup + ad.rCast.recovery;
      return { startup: ad.rWindup.duration + ad.rChannel.duration + ad.rCast.startup, recovery: ad.rCast.recovery, duration: total };
    }
    return ad.rCast;
  }
  return null;
}

// 요청: 스킬당 애니메이션 "하나만" 고르던 단일 select 구조를 제거하고,
// Q/W/E/R 각각에 애니메이션을 원하는 개수만큼 추가/삭제/순서변경할 수 있는
// 시퀀스 편집기로 교체한다. 화면에 보이는 순서 = 실제 실행 순서(요청 6).
const abilityMappingListEl = document.getElementById('abilityMappingList');
function renderAbilityMappingPanel() {
  abilityMappingListEl.innerHTML = '';
  if (!currentChampion) return;
  const ar = currentChampion.abilityResolver;
  const store = currentChampion.skillAnimStore;
  const allNames = currentChampion.resolver.clips.map(c => c.name);

  for (const slot of ['Q','W','E','R']) {
    const role = slot.toLowerCase();
    const row = document.createElement('div');
    row.className = 'abilityRow';

    // 문서 8 섹션 7/19/20: 마스터 이의 E/R은 원작에 시전 애니메이션이 없는
    // 순수 버프 스킬이라, 여기서 무엇을 등록해도 실제 게임플레이에서는
    // 재생되지 않는다(_dispatchCast가 masteryi E/R을 커스텀 시퀀스 확인
    // 이전에 곧장 버프 로직으로 분기시킴). 혼란을 막기 위해 편집 UI 자체를
    // "Animation = NONE / Behavior = BUFF ONLY" 안내로 대체하고, 추가/편집
    // 버튼을 없애서 여기서 뭘 등록해봐야 소용없다는 걸 명확히 한다.
    if (currentChampion.championId === 'masteryi' && (slot === 'E' || slot === 'R')) {
      const head = document.createElement('div');
      head.className = 'abilityRowHead';
      const lab = document.createElement('label');
      lab.textContent = slot;
      const badge = document.createElement('span');
      badge.className = 'confBadge low';
      badge.textContent = 'BUFF ONLY · 애니메이션 없음';
      head.appendChild(lab); head.appendChild(badge);
      const info = document.createElement('div');
      info.className = 'abilityStatLine';
      info.textContent = slot === 'E'
        ? 'Master Yi E(우주류 검술): 시전 모션 없음 - 기존 평타 애니메이션 그대로 유지하며 버프만 적용됩니다.'
        : 'Master Yi R(최후의 전사): 시전 모션 없음 - 현재 행동을 그대로 유지하며 버프만 적용되고, 이동 중이면 Run Haste로만 전환됩니다.';
      row.appendChild(head);
      row.appendChild(info);
      abilityMappingListEl.appendChild(row);
      continue;
    }

    const head = document.createElement('div');
    head.className = 'abilityRowHead';
    const lab = document.createElement('label');
    lab.textContent = slot;
    const conf = ar.confidenceFor(role);
    const badge = document.createElement('span');
    badge.className = 'confBadge ' + confidenceTierClass(conf);
    badge.textContent = `${sourceLabel(ar.sourceFor(role))} · ${conf}%`;
    const testBtn = document.createElement('button');
    testBtn.className = 'testBtn'; testBtn.textContent = '▶ 테스트';
    testBtn.addEventListener('click', () => { if (controller) controller.testAbility(slot, lastGroundPoint || controller.root.position); });
    head.appendChild(lab); head.appendChild(badge); head.appendChild(testBtn);

    // 읽기 전용 정보: 아래 시퀀스가 비어 있을 때(=애니메이션을 하나도 등록
    // 안 했을 때) 대신 사용되는 자동 매핑 클립. 더 이상 이걸 강제로 override
    // 하는 select는 없다 -- 직접 지정하고 싶으면 아래에 Step을 추가하면 된다.
    const autoInfo = document.createElement('div');
    autoInfo.className = 'abilityStatLine';
    const autoName = ar.picks[role]?.name;
    const t = abilityTimingFor(role);
    autoInfo.textContent = `미등록 시 자동 사용: ${autoName || '(없음)'}` + (t ? ` · Duration ${t.duration.toFixed(2)}s` : '');
    row.appendChild(head);
    row.appendChild(autoInfo);

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'skillSeqSteps';
    const steps = store ? store.get(slot) : [];
    if (steps.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'skillSeqEmptyHint';
      hint.textContent = '등록된 애니메이션 없음 — 위 자동 매핑이 그대로 재생됩니다.';
      stepsWrap.appendChild(hint);
    } else {
      steps.forEach((step, index) => stepsWrap.appendChild(renderSkillStepRow(slot, step, index, steps.length, allNames)));
    }
    row.appendChild(stepsWrap);

    const addBtn = document.createElement('button');
    addBtn.className = 'addStepBtn';
    addBtn.textContent = '+ 애니메이션 추가';
    addBtn.addEventListener('click', () => {
      if (!store) return;
      const defaultClip = allNames[0] || '';
      const clip = defaultClip ? currentChampion.resolver.clipByName(defaultClip) : null;
      const dur = clip ? Number(clip.duration.toFixed(2)) : 1;
      store.addStep(slot, { animation: defaultClip, startTime: 0, endTime: dur }); // 항상 시퀀스 맨 뒤에 추가(요청 5)
      renderAbilityMappingPanel();
    });
    row.appendChild(addBtn);

    abilityMappingListEl.appendChild(row);
  }
}

// 스킬 시퀀스 Step 한 줄: 애니메이션 선택 + 시작/종료 시간 + 위/아래/삭제.
function renderSkillStepRow(slot, step, index, total, allNames) {
  const store = currentChampion.skillAnimStore;
  const wrap = document.createElement('div');
  wrap.className = 'skillStepRow';

  const idxLabel = document.createElement('div');
  idxLabel.className = 'stepIndex';
  idxLabel.textContent = `${index + 1}번째`;
  wrap.appendChild(idxLabel);

  const select = document.createElement('select');
  for (const name of allNames) {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (step.animation === name) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => store.updateStep(slot, index, { animation: select.value }));
  wrap.appendChild(select);

  const startInput = document.createElement('input');
  startInput.type = 'number'; startInput.step = '0.01'; startInput.min = '0'; startInput.title = '시작 시간(초)';
  startInput.value = step.startTime;
  startInput.addEventListener('change', () => store.updateStep(slot, index, { startTime: parseFloat(startInput.value) || 0 }));
  wrap.appendChild(startInput);

  const endInput = document.createElement('input');
  endInput.type = 'number'; endInput.step = '0.01'; endInput.min = '0'; endInput.title = '종료 시간(초)';
  endInput.value = step.endTime;
  endInput.addEventListener('change', () => store.updateStep(slot, index, { endTime: parseFloat(endInput.value) || 0 }));
  wrap.appendChild(endInput);

  const upBtn = document.createElement('button');
  upBtn.className = 'stepBtn'; upBtn.textContent = '↑'; upBtn.title = '위로'; upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => { store.moveStep(slot, index, -1); renderAbilityMappingPanel(); });
  wrap.appendChild(upBtn);

  const downBtn = document.createElement('button');
  downBtn.className = 'stepBtn'; downBtn.textContent = '↓'; downBtn.title = '아래로'; downBtn.disabled = index === total - 1;
  downBtn.addEventListener('click', () => { store.moveStep(slot, index, 1); renderAbilityMappingPanel(); });
  wrap.appendChild(downBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'stepBtn danger'; delBtn.textContent = '삭제';
  delBtn.addEventListener('click', () => { store.removeStep(slot, index); renderAbilityMappingPanel(); });
  wrap.appendChild(delBtn);

  return wrap;
}

const animExplorerEl = document.getElementById('animExplorer');
function renderAnimationExplorer(clips) {
  animExplorerEl.innerHTML = '';
  for (const clip of clips) {
    const row = document.createElement('div');
    row.className = 'animRow';
    row.innerHTML = `<span>${escapeHtml(clip.name)}</span><span class="dur">${clip.duration.toFixed(2)}s · ${clip.tracks.length}tr</span>`;
    row.addEventListener('click', () => { if (controller) controller.debugPreviewClip(clip.name); });
    animExplorerEl.appendChild(row);
  }
}

const scaleButtonsEl = document.getElementById('scaleButtons');
scaleButtonsEl.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    modelScaleMultiplier = parseFloat(btn.dataset.scale);
    scaleButtonsEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    if (championRoot) championRoot.children[0].scale.setScalar(championBaseScaleMultiplier * modelScaleMultiplier);
    applyCameraDistanceForChampion();
  });
});

document.getElementById('championPanelToggle').addEventListener('click', () => {
  document.getElementById('championPanel').classList.toggle('collapsed');
});

// 요청("상태창들 싹다 접을 수 있게") - helpBox/rangeIndicatorToggle는
// championPanel과 동일한 .collapsed 토글 패턴을 그대로 재사용한다.
document.querySelectorAll('#helpBox .panelHeader, #rangeIndicatorToggle .panelHeader, #shopPanel .panelHeader').forEach((header) => {
  header.addEventListener('click', () => header.closest('#helpBox, #rangeIndicatorToggle, #shopPanel').classList.toggle('collapsed'));
});
// debugPanel은 매 프레임 내용이 통째로 다시 그려지므로(updateDebugPanel),
// 버튼을 그 안에 두지 않고 별도 요소로 만들어 기존 F1 토글과 같은
// debugPanelVisible 플래그를 그대로 공유한다.
document.getElementById('debugPanelToggle').addEventListener('click', () => {
  debugPanelVisible = !debugPanelVisible;
});

/* ============================================================
   MINION/BUILDING GLB 에셋 연결 (칼바람 나락 모델+애니메이션)
   ------------------------------------------------------------
   실제 업로드된 14개 GLB를 열어 AnimationClip 이름을 직접 확인한
   결과, 요청 문서에 적힌 이름과 다음 부분이 달랐다(추측하지 않고
   실제 clip 목록을 그대로 썼다):
   - 근거리 미니언 3번째 공격: 문서는 팀 공통으로 "minion_melee_Attack3"
     하나만 얘기하지만, 실제로는 블루 GLB만 "minion_melee_attack3.anm"
     (소문자 a)을 갖고 있고 레드 GLB는 그 클립이 아예 없이 "Attack3"
     (별도 클립, 접미사 없음)을 쓴다 - 팀별로 분기해야 한다.
   - 대포 미니언 3번째 공격: 문서는 "Cannon_minion_Attack3" 하나지만
     실제로는 진영별로 "Cannon_Order_Attack3.anm"(블루)/
     "Cannon_Chaos_Attack3.anm"(레드)로 완전히 다른 이름이다.
   - 대포 미니언 1/2번 공격: 문서는 "Attack1_Base"/"Attack2_Base"지만
     실제 clip은 대문자 "Attack1_BASE"/"Attack2_BASE"다(대소문자 구분).
   - 슈퍼 미니언 사망: 문서는 "Death_base"(소문자 b)지만 실제 clip은
     "Death_Base"(대문자 B)다.
   - 포탑 리스폰: 문서는 "Respown"(오타)이지만 실제 clip 이름은
     정상 철자인 "Respawn"이다.
   - 포탑 방패 4단계(Cloth_stage1/2, State2, State3)는 문서와 실제
     clip 이름이 정확히 일치한다(다만 Cloth_stage 쪽은 ".anm" 접미사가
     붙어 있다).
   이 모든 이름은 아래 상수에서 한 곳으로 모아 관리한다 - 나중에 실제
   clip 이름이 또 바뀌어도 이 표만 고치면 된다.
   ============================================================ */
const MINION_BUILDING_ASSET_SLOTS = [
  { key: 'blueMelee', team: 'BLUE', kind: 'melee', match: ['근거리'] },
  { key: 'redMelee', team: 'RED', kind: 'melee', match: ['근거리'] },
  { key: 'blueCaster', team: 'BLUE', kind: 'caster', match: ['원거리'] },
  { key: 'redCaster', team: 'RED', kind: 'caster', match: ['원거리'] },
  { key: 'blueSiege', team: 'BLUE', kind: 'siege', match: ['대포'] },
  { key: 'redSiege', team: 'RED', kind: 'siege', match: ['대포'] },
  { key: 'blueSuper', team: 'BLUE', kind: 'super', match: ['슈퍼'] },
  { key: 'redSuper', team: 'RED', kind: 'super', match: ['슈퍼'] },
];
// 근거리 3타/대포 3타는 팀마다 실제 clip 이름 자체가 다르므로(위 설명
// 참고) 별도 표로 관리한다. 나머지(원거리/슈퍼는 Attack1↔Attack2만
// 반복, 대포 1/2타는 팀 공통 "_BASE" 대문자)는 공통 상수 하나로 충분.
const MINION_ATTACK_CLIPS = {
  melee: { BLUE: ['Attack1', 'Attack2', 'minion_melee_attack3.anm'], RED: ['Attack1', 'Attack2', 'Attack3'] },
  caster: { BLUE: ['Attack1', 'Attack2'], RED: ['Attack1', 'Attack2'] },
  siege: { BLUE: ['Attack1_BASE', 'Attack2_BASE', 'Cannon_Order_Attack3.anm'], RED: ['Attack1_BASE', 'Attack2_BASE', 'Cannon_Chaos_Attack3.anm'] },
  super: { BLUE: ['Attack1', 'Attack2'], RED: ['Attack1', 'Attack2'] },
};
const MINION_IDLE_CLIP = 'Idle1';
const MINION_RUN_CLIP = 'Run';
// 요청 18/문서 5절: 슈퍼 미니언만 Death_Base(실제 clip, 문서의 오타
// Death_base 아님), 나머지 3종은 Death.
const MINION_DEATH_CLIP = { melee: 'Death', caster: 'Death', siege: 'Death', super: 'Death_Base' };
const TURRET_MODEL_CLIPS = {
  idle: 'Idle1_Base',
  shieldStage: ['Idle1_Base', 'Cloth_stage1.2025_S3_BaseSR_Env.anm', 'Cloth_stage2.2025_S3_BaseSR_Env.anm', 'State2', 'State3'],
  destroyed: 'Destroyed',
  respawn: 'Respawn', // 문서의 "Respown"은 오타 - 실제 clip은 정상 철자
};
const INHIBITOR_MODEL_CLIPS = {}; // 억제기 GLB 제거됨
const NEXUS_MODEL_CLIPS = {}; // 넥서스 GLB 제거됨

const minionBuildingAssets = {}; // slotKey -> { gltf, clipNames:Set<string> }
// 요청("그냥 이름에 포탑 들어가있으면 다 포탑glb가 적용되게 해줘") - 예전엔
// 파일명에 "푸른"/"붉은"이 정확히 없으면 진영을 아예 못 정해서 종류
// 키워드("포탑" 등)가 있어도 통째로 무시되고 있었다(가장 흔한 실패
// 원인). 이제 진영 키워드를 더 폭넓게 인식하고(한글/영문 둘 다), 그래도
// 진영을 못 찾으면 "이 파일을 양쪽 진영에 그대로 적용"으로 처리한다 -
// 파일 하나만 있어도 RED/BLUE 양쪽 포탑에 전부 적용되므로 절대 조용히
// 무시되는 일이 없다.
function detectTeamsForFilename(filename) {
  const f = filename.toLowerCase();
  const isBlue = filename.includes('푸른') || filename.includes('블루') || f.includes('blue');
  const isRed = filename.includes('붉은') || filename.includes('레드') || f.includes('red');
  const teams = [];
  if (isBlue) teams.push('BLUE');
  if (isRed) teams.push('RED');
  if (!teams.length) return ['BLUE', 'RED']; // 진영 표시가 없으면 양쪽 다 적용
  return teams;
}
function matchAssetSlotsForFilename(filename) {
  const teams = detectTeamsForFilename(filename);
  const matched = [];
  for (const team of teams) {
    const slot = MINION_BUILDING_ASSET_SLOTS.find((s) => s.team === team && s.match.some((kw) => filename.includes(kw)));
    if (slot) matched.push(slot);
  }
  return matched;
}
// 요청("이 glb들 상시로 적용되있게 해줘") - 매번 드래그로 다시 올릴 필요
// 없이 항상 켜져 있어야 하는 GLB 등록 로직을, 수동 업로드(loadMinionBuildingAsset)
// 와 아래 내장(embedded) 로딩이 똑같이 재사용하도록 분리했다.
function registerBuildingAsset(filename, gltf) {
  const slots = matchAssetSlotsForFilename(filename);
  if (!slots.length) { console.error(`[MODEL LOAD ERROR] ${filename}: 파일명에서 종류를 인식하지 못했습니다 (예: 파일명에 "억제기", "넥서스", "근거리", "원거리", "대포", "슈퍼" 중 하나가 들어있어야 합니다)`); return; }
  // 진영 표시가 없어 양쪽에 동시 적용되는 경우, slots가 2개(BLUE/RED)
  // 다 들어있다 - 같은 gltf를 두 슬롯에 그대로 등록해도 안전하다.
  // instantiateMinionBuildingAsset()이 포탑을 만들 때마다 매번
  // cloneSkeleton()으로 별도 복제본을 만들기 때문에 원본 gltf.scene을
  // 공유해도 서로 간섭하지 않는다.
  for (const slot of slots) {
    minionBuildingAssets[slot.key] = { gltf, clipNames: new Set(gltf.animations.map((a) => a.name)), slot };
    console.log(`[MODEL LOADED] ${slot.key} (${filename}) - ${gltf.animations.length}개 클립:`, gltf.animations.map((a) => a.name));
  }
  renderMinionAssetStatus();
}
function loadMinionBuildingAsset(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const loader = new GLTFLoader();
    loader.parse(ev.target.result, '', (gltf) => registerBuildingAsset(file.name, gltf),
      (err) => { console.error(`[MODEL LOAD ERROR] ${file.name}:`, err); renderMinionAssetStatus(); });
  };
  reader.onerror = () => console.error(`[MODEL LOAD ERROR] ${file.name}: 파일을 읽지 못했습니다`);
  reader.readAsArrayBuffer(file);
}
function loadMinionBuildingAssets(fileList) {
  for (const f of fileList) if (f.name.toLowerCase().endsWith('.glb')) loadMinionBuildingAsset(f);
}
// 요청("이 glb들 상시로 적용되있게 해줘") - 매번 드래그&드롭 하지 않아도
// 항상 켜져 있도록, 현재 지원되는 건물/미니언 GLB를 base64로 이 파일 안에 그대로
// 내장했다(아래 EMBEDDED_BUILDING_GLBS 스크립트 블록). 페이지가 열리자마자
// 곧바로 디코딩해서 minionBuildingAssets에 등록하고, bootstrapChampion()이
// 실제로 건물/미니언 오브젝트를 만들기 직전에 이 로딩이 끝났는지 기다린다
// (아래 embeddedBuildingAssetsReady 참고) - 그래서 챔피언 GLB를 아무거나
// 올려도 포탑 등은 항상 이 내장 모델로 나온다.
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function loadEmbeddedBuildingAssets() {
  const table = window.EMBEDDED_BUILDING_GLBS || {};
  const filenames = Object.keys(table);
  if (!filenames.length) return Promise.resolve();
  return Promise.all(filenames.map((filename) => new Promise((resolve) => {
    let buffer;
    try { buffer = base64ToArrayBuffer(table[filename]); }
    catch (err) { console.error(`[MODEL LOAD ERROR] ${filename} (내장 GLB 디코딩 실패):`, err); resolve(); return; }
    const loader = new GLTFLoader();
    loader.parse(buffer, '', (gltf) => { registerBuildingAsset(filename, gltf); resolve(); },
      (err) => { console.error(`[MODEL LOAD ERROR] ${filename} (내장):`, err); resolve(); });
  })));
}
const embeddedBuildingAssetsReady = loadEmbeddedBuildingAssets();
function renderMinionAssetStatus() {
  const el = document.getElementById('minionAssetStatus');
  if (!el) return;
  const loaded = MINION_BUILDING_ASSET_SLOTS.filter((s) => minionBuildingAssets[s.key]).length;
  el.textContent = `로드됨: ${loaded}/${MINION_BUILDING_ASSET_SLOTS.length}` +
    (loaded < MINION_BUILDING_ASSET_SLOTS.length ? ' (미로딩분은 임시 도형으로 대체 표시)' : ' - 전부 연결됨');
}
document.getElementById('minionAssetDropZone').addEventListener('click', () => document.getElementById('minionAssetFileInput').click());
document.getElementById('minionAssetFileInput').addEventListener('change', (e) => { loadMinionBuildingAssets(e.target.files); e.target.value = ''; });
['dragover', 'dragenter'].forEach((ev) => document.getElementById('minionAssetDropZone').addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }));
document.getElementById('minionAssetDropZone').addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); loadMinionBuildingAssets(e.dataTransfer.files); });

// 스킨드 메시 인스턴스화 - Object3D.clone()은 스켈레톤 바인딩이 깨지므로
// (여러 미니언을 동시에 띄우면 전부 같은 뼈대를 공유해 애니메이션이
// 엉킨다) 반드시 SkeletonUtils.clone을 쓴다.
// 버그 수정("GLB를 넣어도 포탑 모델링이 안 보인다/모션이 안 보인다"):
// 챔피언 GLB는 로드 시 alignModelOrigin()으로 원점을 발밑(Y bounding box
// 최솟값)에 맞추는데, 이 미니언/건물 GLB 로딩 경로에는 그 정렬이 전혀
// 없었다 - 실제로 확인해보니 포탑 GLB의 원본 Y 범위가 -4.13~+5.39였다
// (자기 원점이 발밑이 아니라 몸통 중간 어딘가에 있음). 그래서 그냥
// position.y=0(지면)에 놓으면 모델의 절반 가까이가 땅 밑으로 파묻힌 채
// 렌더링됐다 - "모델링이 안 입혀졌다"로 보인 정확한 원인이다(실제로는
// 로드는 됐지만 카메라가 보는 지면 위치엔 아무것도 없어 보였을 뿐,
// 애니메이션도 모델 자체가 제대로 안 보이니 "작동 안 하는 것처럼" 보였다).
// 단, alignModelOrigin()은 인자로 받은 객체의 .position을 직접 덮어써서
// 보정하는 함수라, createTurret() 등이 나중에 group.position.copy(월드좌표)
// 로 그 보정값을 그대로 덮어써버리면 무의미해진다(챔피언 쪽도 이래서
// model을 alignModelOrigin()으로 보정한 뒤 별도의 scaleWrapper/root로
// 감싸서, 월드 좌표는 그 바깥 컨테이너에만 준다) - 여기서도 똑같이 inner
// (정렬 보정이 적용된 실제 GLB 루트)를 outer(월드 배치 전용 빈 그룹)로
// 한 번 더 감싼다.
function instantiateMinionBuildingAsset(assetKey, targetHeight = null, keepNativeGroundY = false) {
  const asset = minionBuildingAssets[assetKey];
  if (!asset) return null;
  const inner = cloneSkeleton(asset.gltf.scene);
  if (keepNativeGroundY) {
    // 버그 수정(사용자 스크린샷: 포탑 GLB 아랫부분이 땅 위로 그대로 삐져
    // 나와 있음) - 이 turret/nexus/inhibitor GLB들은 지형에 파묻히도록
    // 만들어진 "받침대/기초" 부분이 모델 자체에 이미 포함돼 있고, 원본
    // 좌표계에서 Y=0이 바로 그 "지면 높이" 기준점이다(콜라 조사 결과:
    // 포탑 Y범위 -4.14~5.39, 넥서스 -6.94~3.00, 억제기 -4.13~2.42 - 셋
    // 다 원점 아래로 상당 부분이 파묻히도록 설계돼 있다). alignModelOrigin()
    // 은 이런 사정을 모르고 "bounding box 맨 아래 = 발밑"이라고 가정해서
    // 그 파묻힐 부분까지 통째로 땅 위로 끌어올렸었다 - 그래서 받침대가
    // 그대로 노출되어 보였다. 여기서는 X/Z 중심만 맞추고 Y는 원본 그대로
    // 둬서(원점이 곧 지면) 받침대가 자동으로 땅속에 묻히게 한다.
    const box0 = new THREE.Box3().setFromObject(inner);
    const center0 = new THREE.Vector3(); box0.getCenter(center0);
    inner.position.x -= center0.x;
    inner.position.z -= center0.z;
    inner.updateMatrixWorld(true);
  } else {
    alignModelOrigin(inner); // inner.position을 발밑=Y0, X/Z 중심=0으로 보정
  }
  const outer = new THREE.Group();
  outer.add(inner); // 월드 좌표는 이 outer에만 준다 - inner의 보정값과 절대 충돌하지 않음
  // 버그 수정(요청 문서 "clone된 Mesh의 material 공유 문제") - cloneSkeleton
  // (SkeletonUtils.clone)은 지오메트리/뼈대만 복제하고 재질(material)은
  // 원본과 그대로 공유한다. 즉 같은 GLB 에셋으로 만든 포탑/넥서스/억제기
  // 인스턴스 여러 개가 전부 같은 Material 객체를 참조하고 있었다 - 어느
  // 한 인스턴스의 재질 상태(opacity/color 등)를 바꾸는 코드가 생기면
  // 그 순간 같은 에셋을 쓰는 다른 모든 인스턴스도 동시에 영향을 받는
  // 구조였다. 인스턴스마다 재질을 개별 복제해서 서로 완전히 분리한다.
  inner.traverse((o) => {
    if (o.isMesh) {
      // GLB 원본의 boundingSphere가 부정확해 카메라가 포탑/건물에 가까워졌을 때
      // 주변 오브젝트가 잘못 컬링되는 현상을 막는다. AI/충돌 판정은 렌더링과 독립이다.
      o.frustumCulled = false;
      if (o.material) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      }
    }
  });
  const mixer = new THREE.AnimationMixer(inner); // 애니메이션 트랙은 inner 계층(GLB 원본 뼈대 이름) 기준
  const actions = {};
  for (const clip of asset.gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  let body = null;
  inner.traverse((o) => { if (!body && o.isMesh) body = o; });
  const box = new THREE.Box3().setFromObject(inner);
  // keepNativeGroundY일 때는 "땅 위로 보이는 높이"가 기준이어야 한다 -
  // box.min.y가 이미 땅 밑(음수)이므로 전체 bbox 높이(min~max)가 아니라
  // box.max.y(지면~꼭대기)만 실제 "체감 크기"로 쓴다.
  let height = keepNativeGroundY ? box.max.y : (box.max.y - box.min.y);
  // 요청("포탑과 억제기, 넥서스의 glb크기까지 계산해서 못 뚫고 다니게") -
  // 지금까지 충돌 반경(radius/collisionRadius)은 GLB 실제 크기와 무관한
  // 임의 추정치(BASE_UNIT 배수)를 그대로 썼다. 여기서 GLB의 실측 가로/
  // 세로(X/Z) bounding box 절반 폭을 재서 footprintRadius로 반환한다 -
  // 아래 height와 정확히 같은 배율(scaleFactor)로 같이 늘어나므로, 최종
  // 충돌 반경이 실제로 화면에 보이는 모델 크기와 정확히 일치한다.
  let footprintRadius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  // 버그 수정("GLB를 적용해도 미니언 이외(포탑 등)는 적용이 안 됨"): 챔피언은
  // alignModelOrigin() 이후 BASE_UNIT 기준으로 튜닝된 배율(scaleWrapper)을
  // 항상 곱해서 크기를 맞추는데, 포탑/억제기/넥서스 GLB는 그런 정규화가
  // 전혀 없어서 원본 GLB가 내보내진 그대로의(수 cm~수십 m까지 제각각인)
  // 크기로 배치됐다 - 화면에서 너무 작거나 커서 "적용이 안 된 것"처럼
  // 보이는 원인이다. targetHeight가 주어지면 실제 bounding box 높이를
  // 기준으로 outer 하나에만 균일 배율을 곱해 정확히 그 높이로 맞춘다
  // (outer의 원점이 곧 발밑이라 스케일을 줘도 땅에서 들뜨지 않는다).
  if (targetHeight != null && height > 0.0001) {
    const scaleFactor = targetHeight / height;
    outer.scale.setScalar(scaleFactor);
    height = targetHeight;
    footprintRadius *= scaleFactor; // 높이와 정확히 같은 배율로 발맞춰 늘림
  }
  return { root: outer, mixer, actions, clipNames: asset.clipNames, body: body || inner, height, radius: footprintRadius };
}
// 요청 21/22: 존재하지 않는 클립을 재생하려 하면 비슷한 이름으로
// 대신 추측하지 않고 콘솔에 정확한 형식으로 남긴다.
// 요청("미니언 모션 누락 픽스" - 애니메이션 이름이 달라도 자동 매칭,
// 없으면 에러 대신 가장 유사한 클립으로 fallback) - 이 패턴 매칭은
// playAssetClip() 하나에만 적용된다. 챔피언은 완전히 다른 별도 시스템
// (AnimationRoleResolver/actionData)을 쓰므로 전혀 건드리지 않는다 -
// playAssetClip()은 minion/turret/nexus/inhibitor 전용 진입점이다.
const ANIM_ROLE_PATTERNS = [
  { role: 'death', patterns: [/death/i, /\bdie\b/i] },
  { role: 'attack', patterns: [/attack/i, /\batk\b/i] },
  { role: 'hit', patterns: [/\bhit\b/i, /hurt/i, /damage/i] },
  { role: 'move', patterns: [/walk/i, /\brun\b/i, /move/i] },
  { role: 'idle', patterns: [/idle/i, /stand/i, /breath/i] },
];
function inferAnimRole(name) {
  for (const { role, patterns } of ANIM_ROLE_PATTERNS) if (patterns.some((p) => p.test(name))) return role;
  return null;
}
function findFallbackClipName(instance, requestedName) {
  const role = inferAnimRole(requestedName);
  if (!role) return null;
  const names = Object.keys(instance.actions);
  const patterns = ANIM_ROLE_PATTERNS.find((r) => r.role === role).patterns;
  const found = names.find((n) => patterns.some((p) => p.test(n)));
  if (found) return found;
  // 그 역할의 클립이 아예 없으면(요청 "가장 유사한 클립으로 fallback") -
  // 최후의 수단으로 idle류를 시도한다. 완전히 멈춰 있는 것보다는 낫다.
  // 단, Phase 1 요청사항 "Death만큼은 가능한 한 Idle로 대체하지 말 것" -
  // Death 역할은 이 idle 대체 대상에서 제외한다. null을 반환하면
  // playAssetClip()이 그 재생만 건너뛰고(콘솔 경고 1회), killMinion()/
  // 포탑·넥서스·억제기의 파괴 처리 쪽 기존 removeDelayMs 고정값(900ms)
  // 기반 제거 로직이 그대로 유지되어 게임이 멈추지 않는다 - 죽었는데
  // Idle 포즈로 멀쩡히 서 있는 어색한 상황을 막는다.
  if (role !== 'idle' && role !== 'death') {
    const idlePatterns = ANIM_ROLE_PATTERNS.find((r) => r.role === 'idle').patterns;
    const idleFound = names.find((n) => idlePatterns.some((p) => p.test(n)));
    if (idleFound) return idleFound;
  }
  return null;
}
function playAssetClip(instance, modelLabel, clipName, { fade = 0.15, loopOnce = false } = {}) {
  if (!instance || !clipName) return null;
  let action = instance.actions[clipName];
  let resolvedName = clipName;
  if (!action) {
    const fallbackName = findFallbackClipName(instance, clipName);
    if (fallbackName) { action = instance.actions[fallbackName]; resolvedName = fallbackName; }
  }
  if (!action) {
    // 요청("오류를 발생시키지 말고") - 매 프레임 같은 이름으로 반복 호출되는
    // 경우가 많아, 인스턴스당 같은 clipName에 대해서는 최초 1회만 경고를
    // 남기고 그 이후로는 조용히 무시한다(게임은 계속 진행).
    if (!instance._missingClipWarned) instance._missingClipWarned = new Set();
    if (!instance._missingClipWarned.has(clipName)) {
      console.warn(`[ANIMATION] ${modelLabel} / "${clipName}" 클립을 찾지 못해 건너뜁니다(대체 클립도 없음).`);
      instance._missingClipWarned.add(clipName);
    }
    return null;
  }
  if (instance.currentClipName === resolvedName) return action;
  if (instance.currentAction) instance.currentAction.fadeOut(fade);
  action.reset();
  if (loopOnce) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
  else action.setLoop(THREE.LoopRepeat, Infinity);
  action.fadeIn(fade).play();
  instance.currentAction = action;
  instance.currentClipName = resolvedName;
  return action;
}


function tickOneDummy(unit, dt) {
  if (!unit) return;
  // 요청("챔피언과 포탑,억제기,넥서스도 [체력바를] 고정") - 매 프레임
  // 제자리를 재확인한다(미니언 체력바와 동일한 원칙).
  if (unit.label) unit.label.position.set(0, unit.labelHeight, 0);
  // 버그 수정: 지금까지 tickStatusEffects()가 플레이어(this)에게만 호출되고
  // 더미에는 한 번도 호출된 적이 없었다 - 즉 더미에 걸린 DOT(예: 다리우스
  // 과다출혈)이 최초 1회 적용 뒤로는 실제로 틱 데미지가 들어가지 않았고,
  // CC도 만료 후 배열에서 제거되지 않아 화면 태그가 갱신되지 않았다.
  tickStatusEffects(unit, dt);
  refreshUnitCcTags(unit); // 남은 시간 카운트다운을 매 프레임 갱신
  if (!controller || unit.hp <= 0) return;
  if (controller.state === STATE.DEAD || controller.state === STATE.RESPAWN) return;
  // 버그 수정(모데카이저 R "죽음의 세계" 명세 3/10절 "메인 월드의 다른
  // 유닛은 죽음의 세계 내부의 대상을 공격할 수 없다"): 이 더미가 지금
  // 진행 중인 R의 대상이 아니라면(=플레이어와 realmId가 다르면) 반격
  // 자체를 하지 않는다. 반대로 이 더미가 바로 그 R 대상이라면(같은
  // realmId 공유) 죽음의 세계 안에서 정상적으로 서로 공격해야 하므로
  // (명세 4절 "Death Realm → Mordekaiser ↔ Target 가능") 그대로 통과된다.
  if (!canRealmInteract(unit, controller)) return;
  unit.attackCooldown = Math.max(0, (unit.attackCooldown || 0) - dt);
  // 기절/공중에 뜸/제압/매혹 중에는 반격 불가. 침묵/속박은 원작대로 기본 공격을 막지 않는다
  // (예전엔 둘 다 반격을 막았다).
  if (isStunned(unit)) return;
  const dist = getHorizontalDistance(unit.mesh.position, controller.root.position);
  if (dist <= unit.attackRange && unit.attackCooldown <= 0) {
    unit.attackCooldown = 1 / (unit.attackSpeed || 1 / 1.4);
    applyDamage(controller, { rawDamage: unit.attackDamage ?? 6, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
  }
}
function updateDummyAI(dt) {
  tickOneDummy(dummy, dt);
  for (const d of placedDummies) tickOneDummy(d, dt);
}

// 요청(모데카이저 E "실제로 대상 위치가 변해야 한다" 등): 끌어당김/넉백처럼
// 유닛(더미)의 실제 좌표를 일정 시간에 걸쳐 옮겨야 하는 효과를 위한 범용
// 트윈. unit._pullState = { from, to, duration, elapsed }만 설정해두면
// 매 프레임 이 함수가 실제로 unit.mesh.position을 갱신한다 - 이펙트만
// 표시되고 위치가 그대로인 문제를 막기 위한 공통 지점.
function tickPullEffects(dt) {
  for (const u of getAllEnemyUnits()) {
    const p = u._pullState;
    if (!p) continue;
    // 요청("넥서스, 억제기 스킬로 안 끌어오게 하기") - 포탑/억제기/넥서스
    // 같은 구조물(isStructure)은 물리적으로 움직일 수 없는 대상이다.
    // getAllEnemyUnits()에 구조물이 포함된 이후로(요청 20절), 다리우스 E
    // 같은 끌어당기기 스킬이 실수로 구조물에 _pullState를 걸면 건물
    // 자체가 화면에서 그대로 끌려오는 버그가 있었다 - 여기서 한 번만
    // 막으면 앞으로 추가될 모든 끌어당기기/넉백 스킬에 자동 적용된다.
    if (u.isStructure) { u._pullState = null; continue; }
    p.elapsed += dt;
    const t = Math.min(1, p.elapsed / p.duration);
    u.mesh.position.lerpVectors(p.from, p.to, t);
    if (t >= 1) { u._pullState = null; if (p.onComplete) p.onComplete(u); }
  }
  // 플레이어 챔피언 자신에게도 같은 트윈을 쓸 수 있게 한다(요청: "돌진
  // 스킬"이 순간이동 스냅이 아니라 실제로 이동하는 것처럼 보여야 함 - 리 신
  // Q2 등). controller._dashState = {from, to, duration, elapsed}만 설정.
  if (typeof controller !== 'undefined' && controller && controller._dashState) {
    const p = controller._dashState;
    p.elapsed += dt;
    const t = Math.min(1, p.elapsed / p.duration);
    controller.root.position.lerpVectors(p.from, p.to, t);
    if (p.faceDir && p.faceDir.lengthSq() > 1e-8) {
      controller.root.rotation.y = Math.atan2(p.faceDir.x, p.faceDir.z);
    }
    if (t >= 1) controller._dashState = null;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let _debugPanelAccumMs = 0;

function animate() {
  requestAnimationFrame(animate);
  // 버그 수정(스크린샷으로 확인된 "GLB 투명화" - 애니메이션되는 GLB만
  // 사라지고 바닥/장식 같은 순수 도형은 멀쩡한 패턴): clock.getDelta()가
  // 어쩌다 한 번이라도 NaN을 반환하면(탭이 백그라운드로 갔다 돌아오는
  // 경우 등 흔히 발생) `Math.min(NaN, 0.05)`는 항상 NaN이다(자바스크립트의
  // 잘 알려진 함정 - Math.min/max는 인자 중 하나라도 NaN이면 무조건 NaN을
  // 반환한다). 그 NaN dt가 그 프레임의 모든 mixer.update(dt) 호출에
  // 들어가는데, AnimationMixer는 내부 재생 시간을 누적하는 구조라
  // (time += deltaTime) 한 번 NaN이 섞이면 그 뒤로는 영원히 NaN으로
  // 고정된다(NaN + 무엇이든 = NaN) - 그래서 딱 그 순간부터 스킨 메시로
  // 렌더링되는 모든 GLB(챔피언/포탑/미니언 등, 전부 AnimationMixer를 씀)
  // 가 깨지고, GLB가 아닌 바닥/소품(순수 지오메트리, 애니메이션 없음)은
  // 전혀 영향을 안 받는다 - 정확히 스크린샷에서 보인 패턴과 일치한다.
  // 새로고침 전까지 절대 스스로 복구되지 않는 것도 NaN의 특성과 맞는다.
  let dt = clock.getDelta();
  if (!isFinite(dt) || dt < 0) dt = 1 / 60; // 비정상적인 값이면 안전한 기본 프레임 시간으로 대체
  dt = Math.min(dt, 0.05);
  if (!paused) {
    if (controller) { controller.update(dt); updateCameraTransform(controller.root.position, dt); }
    else updateCameraTransform(new THREE.Vector3(0,0,0), dt);
    updateMarkers(dt);
    updateDummyAI(dt);
    updateDyingMinions(dt);
    updateInhibitorBuildingAnim(dt);
    if (howlingAbyssMap) howlingAbyssMap.updateSnow(dt, controller ? controller.root.position : null); // 요청 18: 카메라(플레이어) 주변에서 자연스럽게 보이도록 재활용
    tickPullEffects(dt);
    if (typeof tickAllyUnits === 'function') tickAllyUnits(dt);
    vfx.update(dt);
    nilahVfx2.update(dt);
    projectiles.update(dt);
    targetRing.update(dt);
    rangeIndicators.update(controller);
    visionSystem.update(controller, dt);
    // 최적화(문서 4-22/23절 "DOM 업데이트를 매 프레임 하지 마라") - 디버그
    // 패널은 매 프레임 innerHTML 전체를 새로 만들어서 매초 60번씩 DOM을
    // 다시 그리고 있었다. 사람이 읽는 숫자 패널이라 60Hz 정밀도가 전혀
    // 필요 없으므로 초당 약 10번(100ms 간격)으로만 갱신한다 - updateGoldDisplay()
    // 같은 이벤트 기반 즉시 호출(골드 획득 등)은 그대로 즉시 반영된다.
    _debugPanelAccumMs += dt * 1000;
    if (_debugPanelAccumMs >= 100) { _debugPanelAccumMs = 0; updateDebugPanel(); }
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
