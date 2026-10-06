/* ============================================================
   2. LIGHTING
   ============================================================ */
const hemi = new THREE.HemisphereLight(0x8fb3ff, 0x2b2b1c, 0.9);
scene.add(hemi);

// 최적화(문서 4-8절 "Ambient + 기본 Directional Light 정도로 끝내라"):
// 이전에는 이 조명 하나에 2048² 실시간 그림자맵까지 물려 있었다 - 그림자
// 계산을 껐으니(위 renderer.shadowMap.enabled=false) shadow.mapSize/
// camera frustum 설정도 더 이상 의미가 없어 함께 정리했다. 조명 자체
// (색/광량)는 기존 분위기를 유지하려고 그대로 뒀다.
const dirLight = new THREE.DirectionalLight(0xfff2d8, 2.2);
dirLight.position.set(10, 18, 6);
scene.add(dirLight);

