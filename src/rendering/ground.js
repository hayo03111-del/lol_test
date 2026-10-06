/* ============================================================
   3. GROUND / TEST TERRAIN
   ------------------------------------------------------------
   모든 소품의 크기는 BASE_UNIT(=1.0, 챔피언 기준 신장)의 배율로
   정의된다. 어떤 챔피언 GLB를 넣어도 항상 이 기준 높이로 정규화
   되므로(섹션 6 bootstrapChampion 참고) 소품 비율은 그대로 유지된다.
   ============================================================ */
// 요청("기초 그리드 맵의 크기도 늘려줘") - 이 groundSize는 단순히 바닥
// 시각 효과용이 아니라, 벽/장애물 시스템이 없는 이 데모에서 "맵 경계가
// 대충 어디까지인가"를 판단하는 범용 폴백 값으로도 쓰인다(예: 마스터 이
// Q 재등장 위치를 안전한 곳으로 되돌릴 때 `half = groundSize/2` 기준으로
// 맵 밖인지 판정 - 아래 참고). 칼바람 나락 맵을 실제로 훨씬 길고 넓게
// 늘렸는데 이 값만 예전 100(±49)에 그대로 남아 있었던 게 버그였다 -
// 레드/블루 베이스(Z=±106.5)에도 못 미치는 좁은 상자로 위치를 계속
// 되돌리려 해서 "그 이상 못 지나가는" 것처럼 보였다. 새 맵 전체
// (베이스 밖 장식 절벽까지 포함해 대략 ±115 안팎)를 넉넉히 덮도록 키웠다.
const groundSize = 280;
const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 50, 50);
const groundMat = new THREE.MeshStandardMaterial({ color:0x1c2b1f, roughness:0.95, metalness:0.0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 칼바람 전용 그리드 제거.

// 최적화(문서 4-7절 "그림자는 거의 버려도 된다 - 대신 캐릭터 밑에 타원형
// 반투명 PNG 하나") - 실시간 그림자맵을 완전히 끈 대신, 조명 계산이 전혀
// 필요 없는 unlit 원형 텍스처를 유닛 발밑에 깔아서 "그림자처럼 보이지만
// 실제로는 광원과 무관한" 값싼 대체물을 쓴다. 텍스처/지오메트리는 모든
// 유닛이 공유하고 재질과 메시 인스턴스만 유닛별로 만들어서 비용을 최소화한다.
const _blobShadowTexture = (() => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const _blobShadowGeo = new THREE.CircleGeometry(0.5, 16); // 반지름 1 기준 원판 - 실제 크기는 scale로 조절
function createBlobShadow(radius) {
  const material = new THREE.MeshBasicMaterial({
    map: _blobShadowTexture, transparent: true, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(_blobShadowGeo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02; // 지면과 겹쳐 보이지 않게 살짝 띄움(z-fighting 방지)
  const d = Math.max(0.3, radius) * 2.2; // 유닛 반지름보다 살짝 크게
  mesh.scale.set(d, d, d);
  mesh.renderOrder = -1; // 바닥/지형보다는 위, 다른 유닛보다는 아래에 그려지도록
  return mesh;
}

