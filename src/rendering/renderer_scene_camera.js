/* ============================================================
   1. RENDERER / SCENE / CAMERA
   ============================================================ */
const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// 최적화(문서 4-7절 "그림자는 거의 버려도 된다"): PCFSoftShadowMap +
// 2048 해상도 실시간 그림자맵은 저사양 GPU에서 가장 비싼 항목 중 하나다.
// 셰이더 그림자 계산 자체를 완전히 끄고, 유닛 밑에는 타원형 반투명
// blob(아래 createBlobShadow 참고)을 깔아서 "그림자처럼 보이지만 실제
// 광원 계산은 전혀 없는" 방식으로 대체한다. castShadow/receiveShadow
// 플래그는 코드 곳곳에 남겨둬도 shadowMap이 꺼져 있으면 렌더러가 그
// 패스 자체를 건너뛰므로 비용이 0이다(하나씩 지우고 다닐 필요 없음).
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 90, 250);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);

// MOBA-style quarter view camera rig: fixed pitch/yaw offset, only zoom is
// adjustable. Distances are recomputed per-champion by
// applyCameraDistanceForChampion() (추가 수정사항 12) once a GLB loads;
// these are just sane defaults for before anything is loaded.
const cameraRig = {
  yaw: Math.PI * 0.25,
  pitch: THREE.MathUtils.degToRad(50),
  distance: 30,
  minDistance: 20,
  maxDistance: 48,
  followPos: new THREE.Vector3(0, 0, 0),
};

function updateCameraTransform(targetPos, dt) {
  cameraRig.followPos.lerp(targetPos, Math.min(1, dt * 6));
  const d = cameraRig.distance;
  const offset = new THREE.Vector3(
    Math.sin(cameraRig.yaw) * Math.cos(cameraRig.pitch) * d,
    Math.sin(cameraRig.pitch) * d,
    Math.cos(cameraRig.yaw) * Math.cos(cameraRig.pitch) * d
  );
  const desired = cameraRig.followPos.clone().add(offset);
  camera.position.lerp(desired, Math.min(1, dt * 6));
  camera.lookAt(cameraRig.followPos.x, cameraRig.followPos.y + BASE_UNIT * 0.65, cameraRig.followPos.z);
}

// 순간이동(리스폰·귀환) 뒤 카메라를 천천히 따라가지 않고 바로 옮긴다 - 원작도 리스폰·귀환하면 카메라가 챔피언 위로 바로 간다.
function snapCameraTo(targetPos) {
  cameraRig.followPos.copy(targetPos);
  updateCameraTransform(targetPos, 1);
}

window.addEventListener('wheel', (e) => {
  if (e.target && e.target.closest && e.target.closest('#shopWindow')) return; // 33차: 상점 창 안에서 굴리면 목록만 스크롤한다
  cameraRig.distance = THREE.MathUtils.clamp(
    cameraRig.distance + Math.sign(e.deltaY) * 2.0,
    cameraRig.minDistance, cameraRig.maxDistance
  );
}, { passive:true });

