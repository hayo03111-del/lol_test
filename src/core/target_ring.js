/* ============================================================
   0-F. TARGET RING
   ============================================================ */
class TargetRing {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.RingGeometry(0.55, 0.68, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: VFX_TEXTURES.target, color:0xffffff, transparent:true, opacity:0.85, side:THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._t = 0;
  }
  attachTo(enemy) {
    if (typeof isBotActing === 'function' && isBotActing()) return; // 95차: 적 챔피언 봇 차례에는 플레이어 화면을 건드리지 않는다
    this.target = enemy || null;
    // 연습 더미에는 선택 표시용 타깃 링을 표시하지 않는다.
    // 더미의 HP바/피격 효과와 실제 타겟 상태는 그대로 유지한다.
    this.mesh.visible = !!enemy && !enemy.isTrainingDummy;
  }
  clear() { if (typeof isBotActing === 'function' && isBotActing()) return; this.target = null; this.mesh.visible = false; } // 95차: 봇이 지우지 않게
  update(dt) {
    if (!this.target) return;
    if (this.target.hp <= 0) { this.clear(); return; }
    if (this.target.isTrainingDummy) { this.mesh.visible = false; return; }
    this._t += dt;
    this.mesh.position.copy(this.target.mesh.position);
    this.mesh.position.y = 0.03;
    this.mesh.rotation.z = this._t * 0.6;
  }
}

