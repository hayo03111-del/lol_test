/* ============================================================
   0-E. PROJECTILE SYSTEM
   ============================================================ */
class ProjectileSystem {
  constructor(scene, vfx) {
    this.scene = scene; this.vfx = vfx; this.projectiles = [];
    // Phase 2 요청 19 "Debug: Projectiles/Hits/Misses" - 디버그 패널 표시용
    // 누적 카운터. 매 프레임 새로 계산하지 않고 명중/소멸 시점에만 1씩
    // 증가시키므로 추가 비용이 사실상 없다.
    this.totalHits = 0;
    this.totalMisses = 0;
    // Phase 2 요청 11/18/20("VFX/Projectile 객체 Pooling", "material/
    // geometry 정리 또는 pool 반환", "매 명중마다 geometry 생성 금지") -
    // 기존에는 spawn()마다 _makeArrowMesh()로 매번 새 Geometry/Material을
    // 만들고, 제거할 때는 scene.remove()만 하고 dispose()가 전혀 없었다
    // (원거리 챔피언 평타만 쓰던 동안은 발사 빈도가 낮아 눈에 띄지 않았지만,
    // Phase 2에서 포탑 공격까지 이 시스템에 연결하면 발사 빈도가 크게
    // 늘어난다). 화살 mesh를 재사용하는 풀로 바꿔서 신규 Geometry/Material
    // 생성 자체를 없앤다 - 시각적 동작은 완전히 동일하다.
    this._meshPool = [];
  }

  _acquireArrowMesh(color) {
    let entry = this._meshPool.pop();
    if (!entry) {
      const group = new THREE.Group();
      const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness:0.6 });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);
      const tipGeo = new THREE.ConeGeometry(0.045, 0.14, 6);
      const tipMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness:0.3 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.32;
      group.add(tip);
      entry = { group, tipMat };
    }
    entry.tipMat.color.set(color);
    entry.tipMat.emissive.set(color);
    return entry;
  }
  _releaseArrowMesh(entry) {
    this.scene.remove(entry.group);
    this._meshPool.push(entry); // dispose() 대신 재사용 - 요청 20 "매 명중마다 geometry/material 생성 금지"
  }

  // 버그 수정("챔피언 교체 후 이전 챔피언의 투사체가 계속 날아감"): 지금까지
  // 챔피언 교체(applyChampionData)는 ProjectileSystem을 전혀 건드리지
  // 않았다 - 예를 들어 이즈리얼 Q를 쏜 직후 아리로 바꾸면 그 Q가 계속
  // 날아가다가 명중 시점에 onHit 콜백이 실행되는데, 이 콜백들은 damage
  // 안의 `source: this`로 같은(단일) controller 인스턴스를 그대로 참조한다
  // - 그 시점엔 이미 this.championId가 'ahri'로 바뀌어 있으므로, 아리
  // 패시브 훅("result.source.championId === 'ahri'")이 실제로는 이즈리얼
  // Q가 낸 피해인데도 잘못 발동될 수 있었다(챔피언 간 상태 오염). 포탑
  // 발사체(fromTurret)는 플레이어가 조종하는 챔피언과 무관한 월드
  // 엔티티라 그대로 유지하고, 그 외(플레이어 챔피언이 쏜) 투사체만 안전하게
  // 제거한다(mesh 재사용 풀로 반환 - dispose하지 않음, 기존 관례 유지).
  clear() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (proj.fromTurret) continue;
      this._releaseArrowMesh(proj._meshEntry);
      this.projectiles.splice(i, 1);
    }
  }

  // realmId(Phase 2 요청 17) - 발사한 쪽의 realmId를 스냅샷으로 저장해둔다.
  // 생략하면 기존과 동일하게 undefined → canRealmInteract()가 'main'으로
  // 취급하므로(기존 호출부는 아무것도 안 바꿔도 동작이 그대로 유지된다).
  spawn({ from, target, targetPoint, speed = 26, damage = 0, color = 0xdff0ff, realmId, onHit, fromTurret = false }) {
    const entry = this._acquireArrowMesh(color);
    entry.group.position.copy(from);
    this.scene.add(entry.group);
    const proj = { mesh: entry.group, _meshEntry: entry, speed, damage, target, targetPoint: targetPoint ? targetPoint.clone() : null, color, realmId, onHit, fromTurret, life: 2.5, hasHit: false };
    this._orient(proj);
    this.projectiles.push(proj);
    return proj;
  }
  _currentAimPoint(proj) {
    if (proj.target && proj.target.hp > 0 && !proj.target.isDead && !proj.target.destroyed) {
      const p = getWorldPosition(proj.target);
      return p ? p.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0)) : proj.targetPoint;
    }
    return proj.targetPoint;
  }
  _orient(proj) {
    const aim = this._currentAimPoint(proj);
    if (!aim) return;
    const dir = new THREE.Vector3().subVectors(aim, proj.mesh.position).normalize();
    if (dir.lengthSq() > 1e-6) proj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir);
  }
  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;
      // 버그 수정(요청 27): 포탑 공격/광선은 막지 않는다 - fromTurret 발사체는
      // 장막 충돌 검사 자체를 건너뛴다(다른 모든 투사체는 기존 동작 그대로 유지).
      if (typeof controller !== 'undefined' && controller?.championId === 'yasuo' && controller._yasuo?.windwall && proj.mesh && !proj.fromTurret) {
        const wall=controller._yasuo.windwall, progress=Math.min(1,(performance.now()-wall.createdAt)/180), wp=controller.root.position.clone().addScaledVector(wall.dir, wall.width*0.75*progress), rel=proj.mesh.position.clone().sub(wp); rel.y=0; const along=rel.dot(wall.dir), side=Math.abs(rel.x*(-wall.dir.z)+rel.z*wall.dir.x); if(Math.abs(along)<=0.45 && side<=wall.width*0.5){ this.totalMisses++; this._releaseArrowMesh(proj._meshEntry); this.projectiles.splice(i,1); continue; }
      }
      const aim = this._currentAimPoint(proj);
      if (!aim || proj.life <= 0) { this.totalMisses++; this._releaseArrowMesh(proj._meshEntry); this.projectiles.splice(i, 1); continue; }
      const toAim = new THREE.Vector3().subVectors(aim, proj.mesh.position);
      const dist = toAim.length();
      const step = proj.speed * dt;
      if (dist <= Math.max(step, 0.3)) {
        // Phase 2 요청 17 - 발사 시점 realm과 명중 시점 target의 realm이
        // 다르면(예: 비행 중 모데카이저 R로 target이 죽음의 세계로 끌려감)
        // 명중을 취소한다. realmId를 안 넘긴 기존 호출부는 둘 다 'main'
        // 취급이라 이 검사가 사실상 항상 통과해서 기존 동작과 동일하다.
        const realmOk = canRealmInteract({ realmId: proj.realmId }, proj.target);
        if (proj.target && proj.target.hp > 0 && proj.onHit && realmOk) { proj.onHit(proj.target); this.totalHits++; }
        else this.totalMisses++;
        this.vfx.spawn('hit', proj.mesh.position.clone(), new THREE.Vector3(), { color: proj.color });
        this._releaseArrowMesh(proj._meshEntry);
        this.projectiles.splice(i, 1);
        continue;
      }
      toAim.normalize();
      proj.mesh.position.addScaledVector(toAim, step);
      this._orient(proj);
    }
  }
}

