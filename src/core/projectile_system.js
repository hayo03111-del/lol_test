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
      proj.done = true;
      this._releaseArrowMesh(proj._meshEntry);
      this.projectiles.splice(i, 1);
    }
  }

  // realmId(Phase 2 요청 17) - 발사한 쪽의 realmId를 스냅샷으로 저장해둔다.
  // 생략하면 기존과 동일하게 undefined → canRealmInteract()가 'main'으로
  // 취급하므로(기존 호출부는 아무것도 안 바꿔도 동작이 그대로 유지된다).
  // 45차: line = { dir, maxDist(world), halfWidth(world), filter?(unit), onMiss?() } 를 주면 "직선 스킬샷"이다 - 대상을 미리 정해
  // 따라가지 않고 그 방향으로 maxDist까지 곧장 날아가며, 이번 프레임에 지나간 구간(폭 halfWidth)에 닿은 적 중 가장 앞의 대상을
  // 맞힌다(노틸러스 Q와 같은 판정). 예전엔 발사 순간 직선 위의 대상을 골라 끝까지 따라가서 피할 수 없었고 사거리 밖까지 쫓아갔다.
  // line.pierce: 관통 - 닿는 대상마다 onHit(unit, index)을 부르고 사거리 끝까지 계속 날아간다. line.maxHits(>1): 그만큼 맞히면 사라진다(럭스 Q - 처음 둘).
  // hidden: 화살 모양을 그리지 않는다(자체 이펙트가 있는 스킬).
  spawn({ from, target, targetPoint, speed = 26, damage = 0, color = 0xdff0ff, realmId, onHit, fromTurret = false, line = null, hidden = false, scale = 1, team = null }) {
    const entry = this._acquireArrowMesh(color);
    entry.group.position.copy(from);
    entry.group.scale.setScalar(scale); // 59차: 포탑 가열 단계마다 탄이 굵어진다(풀에서 다시 쓸 때도 매번 새로 맞춘다)
    if (!hidden) this.scene.add(entry.group);
    const proj = { mesh: entry.group, _meshEntry: entry, speed, damage, target: line ? null : target, targetPoint: targetPoint ? targetPoint.clone() : null, color, realmId, onHit, fromTurret, team, life: 2.5, hasHit: false, done: false };
    if (line) {
      const dir = line.dir.clone().setY(0).normalize();
      proj.line = { dir, origin: from.clone(), maxDist: line.maxDist, halfWidth: line.halfWidth, filter: line.filter || null, onMiss: line.onMiss || null, traveled: 0, pierce: !!line.pierce || line.maxHits > 1, maxHits: line.maxHits || 0, hitSet: new Set(), hits: 0 };
      proj.targetPoint = from.clone().addScaledVector(dir, line.maxDist);
      proj.life = line.maxDist / Math.max(1e-6, speed) + 0.5;
    }
    this._orient(proj);
    this.projectiles.push(proj);
    return proj;
  }
  _remove(i, missed) {
    const proj = this.projectiles[i];
    if (missed) this.totalMisses++;
    proj.done = true;
    this._releaseArrowMesh(proj._meshEntry);
    this.projectiles.splice(i, 1);
  }
  // 직선 스킬샷 한 프레임: 지나간 구간 [prev, cur]에 닿은 적 중 진행 방향으로 가장 먼저 닿는 대상.
  _sweepLine(proj, prev, cur, all = false) {
    const L = proj.line;
    let best = null;
    const found = [];
    const units = typeof getAllEnemyUnits === 'function' ? getAllEnemyUnits() : []; // 날아가는 투사체는 안 보이는 대상도 맞힌다(노틸러스 Q와 같음)
    for (const u of units) {
      if (!u || u.hp <= 0 || u.isDead || u.destroyed || u.isUntargetable || u.isWard) continue;
      if (L.filter && !L.filter(u)) continue;
      if (L.hitSet.has(u)) continue;
      if (!canRealmInteract({ realmId: proj.realmId }, u)) continue;
      const up = getWorldPosition(u); if (!up) continue;
      const r = getCollisionRadius(u);
      const rx = up.x - L.origin.x, rz = up.z - L.origin.z;
      const along = rx * L.dir.x + rz * L.dir.z;
      if (along < -r || along < prev - r || along > cur + r) continue;
      const lateral = Math.abs(rx * L.dir.z - rz * L.dir.x);
      if (lateral > L.halfWidth + r) continue;
      const contact = Math.max(0, along - r);
      if (all) found.push({ u, contact });
      else if (!best || contact < best.contact) best = { u, contact };
    }
    return all ? found.sort((a, b) => a.contact - b.contact) : best;
  }
  _updateLine(proj, i, dt) {
    const L = proj.line;
    const prev = L.traveled;
    L.traveled = Math.min(L.maxDist, L.traveled + proj.speed * dt);
    proj.mesh.position.copy(L.origin).addScaledVector(L.dir, L.traveled);
    proj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), L.dir);
    if (L.pierce) {
      for (const h of this._sweepLine(proj, prev, L.traveled, true)) {
        L.hitSet.add(h.u);
        if (proj.onHit) proj.onHit(h.u, L.hits);
        L.hits++; this.totalHits++;
        if (L.maxHits && L.hits >= L.maxHits) break;
      }
      if ((L.maxHits && L.hits >= L.maxHits) || L.traveled >= L.maxDist - 1e-6 || proj.life <= 0) { if (!L.hits && L.onMiss) L.onMiss(); this._remove(i, !L.hits); }
      return;
    }
    const best = this._sweepLine(proj, prev, L.traveled);
    if (best) {
      proj.mesh.position.copy(L.origin).addScaledVector(L.dir, Math.min(L.traveled, best.contact));
      if (proj.onHit) proj.onHit(best.u);
      this.totalHits++;
      this.vfx.spawn('hit', proj.mesh.position.clone(), new THREE.Vector3(), { color: proj.color });
      this._remove(i, false);
      return;
    }
    if (L.traveled >= L.maxDist - 1e-6 || proj.life <= 0) {
      if (L.onMiss) L.onMiss();
      this._remove(i, true);
    }
  }
  _currentAimPoint(proj) {
    if (proj.target && proj.target.hp > 0 && !proj.target.isDead && !proj.target.destroyed && !proj.target.isUntargetable) {
      const p = getWorldPosition(proj.target);
      const aim = p ? p.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0)) : proj.targetPoint;
      if (aim) proj._lastAim = aim;
      return aim;
    }
    return proj._lastAim || proj.targetPoint; // 90차: 대상이 비대상이 되면 마지막으로 본 자리로 날아가 사라진다(원작 - 대상 지정 투사체가 빗나감)
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
      // 바람 장막 판정 기준점은 시전 위치(wall.origin)로 고정 - 예전엔 야스오 현재 위치라 장막이 야스오를 따라다녔다.
      if (typeof controller !== 'undefined' && controller?.championId === 'yasuo' && controller._yasuo?.windwall && proj.mesh && !proj.fromTurret && !(proj.team && proj.team === controller.team)) { // 59차: 아군 미니언 투사체는 통과
        const wall=controller._yasuo.windwall, wp=(wall.origin||controller.root.position).clone().addScaledVector(wall.dir, yasuoWindwallOffsetWorld(wall)), rel=proj.mesh.position.clone().sub(wp); rel.y=0; const along=rel.dot(wall.dir), side=Math.abs(rel.x*(-wall.dir.z)+rel.z*wall.dir.x); if(Math.abs(along)<=0.45 && side<=wall.width*0.5){ this._remove(i, true); continue; }
      }
      if (proj.line) { this._updateLine(proj, i, dt); continue; }
      const aim = this._currentAimPoint(proj);
      if (!aim || proj.life <= 0) { this._remove(i, true); continue; }
      const toAim = new THREE.Vector3().subVectors(aim, proj.mesh.position);
      const dist = toAim.length();
      const step = proj.speed * dt;
      if (dist <= Math.max(step, 0.3)) {
        // Phase 2 요청 17 - 발사 시점 realm과 명중 시점 target의 realm이
        // 다르면(예: 비행 중 모데카이저 R로 target이 죽음의 세계로 끌려감)
        // 명중을 취소한다. realmId를 안 넘긴 기존 호출부는 둘 다 'main'
        // 취급이라 이 검사가 사실상 항상 통과해서 기존 동작과 동일하다.
        const realmOk = canRealmInteract({ realmId: proj.realmId }, proj.target);
        // 90차(QA): 도착했을 때 대상이 비대상(마스터 이 Q 등)이거나 이미 죽었으면 피해·적중 효과(둔화·흡혈·아이템·룬) 없이 사라진다.
        const t = proj.target, hittable = t && t.hp > 0 && !t.isDead && !t.destroyed && !t.isUntargetable;
        if (hittable && proj.onHit && realmOk) { proj.onHit(t); this.totalHits++; }
        else this.totalMisses++;
        this.vfx.spawn('hit', proj.mesh.position.clone(), new THREE.Vector3(), { color: proj.color });
        proj.done = true;
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

