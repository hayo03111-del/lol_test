/* ============================================================
   4. MOVE MARKER (click indicator)
   ============================================================ */
const markerGeo = new THREE.RingGeometry(0.35, 0.5, 24);
markerGeo.rotateX(-Math.PI / 2);
const markerMat = new THREE.MeshBasicMaterial({ color:0x63d873, transparent:true, opacity:0.9, side:THREE.DoubleSide });
const activeMarkers = [];

function spawnMoveMarker(pos) {
  const m = new THREE.Mesh(markerGeo, markerMat.clone());
  m.position.copy(pos);
  // 이동 명령 마커는 지형/장식과 깊이버퍼 경쟁을 하지 않도록 항상 지형보다
  // 위에 렌더링한다. 클릭 직후 보이지 않던 회귀를 막기 위해 컬링도 끈다.
  m.position.y = 0.08;
  m.renderOrder = 100;
  m.frustumCulled = false;
  if (m.material) { m.material.depthWrite = false; m.material.depthTest = false; }
  scene.add(m);
  activeMarkers.push({ mesh:m, life:0.75, maxLife:0.75 });
}
function updateMarkers(dt) {
  for (let i = activeMarkers.length - 1; i >= 0; i--) {
    const mk = activeMarkers[i];
    mk.life -= dt;
    mk.mesh.material.opacity = Math.max(0, mk.life / mk.maxLife) * 0.9;
    mk.mesh.scale.setScalar(1 + (1 - mk.life / mk.maxLife) * 0.3);
    if (mk.life <= 0) { scene.remove(mk.mesh); activeMarkers.splice(i, 1); }
  }
}

