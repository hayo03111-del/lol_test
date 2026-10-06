// Extracted from CharacterController: _nilahData
CharacterController.prototype._nilahData = function() {  return CHAMPION_DATA.nilah; 
};

// Extracted from CharacterController: _nilahQCritMultiplier
CharacterController.prototype._nilahQCritMultiplier = function() {  return (this.ieEquipped === true) ? this._nilahData().Q.critMultiplierIE : this._nilahData().Q.critMultiplier; 
};

// Extracted from CharacterController: _nilahCurrentQASPercent
CharacterController.prototype._nilahCurrentQASPercent = function() { 
    const p = this._nilahData().Q;
    const level = Math.max(1, this.champLevel || 1);
    return Math.min(p.attackSpeedMaxPercent, p.attackSpeedStartPercent + (level - 1) * p.attackSpeedPerChampionLevelPercent) / 100;
  
};

// Extracted from CharacterController: _nilahQActive
CharacterController.prototype._nilahQActive = function() {  return this._nilah.qEmpoweredUntil > performance.now(); 
};

// 추가: VFX를 캐릭터 발밑(root)이 아니라 실제 칼날(채찍) 뼈에 붙이기 위한
// 헬퍼. bootstrapChampion()에서 만든 this._nilahWeaponRig(bladeAEnd/bladeBEnd)의
// 실제 월드 좌표를 그대로 읽는다 - 새 뼈대나 좌표계를 만들지 않는다.
// 전투 판정(피격 반경 등)과는 완전히 분리된, 순수 시각 표시용이다.
CharacterController.prototype._nilahBladeAnchor = function(which = 'A') {
  const rig = this._nilahWeaponRig;
  const node = which === 'B' ? (rig?.bladeBEnd || rig?.bladeAEnd) : (rig?.bladeAEnd || rig?.bladeBEnd);
  if (node && node.isObject3D) return getWorldPosition(node);
  return this.root.position.clone();
};

// 요청("무기에 직접적으로 연결되어있게, 상시 활성화 채찍과 공격 시 채찍,
// Q 강화 평타 채찍"): 끝 관절 하나가 아니라 BladeA/B 전체 뼈대 체인
// (bladeAChain/bladeBChain, 각 16개+end)을 그대로 이어 실제 채찍의
// 곡선을 매 프레임 따라 그리는 발광 튜브를 만든다. 별도 좌표계나 근사
// 곡선이 아니라 실제 뼈 월드 좌표를 그대로 샘플링한다. 3단계로 밝기/
// 색/두께만 바뀐다 - 지오메트리 애니메이션(늘어남 등)은 GLB 자체의
// 몫이라 여기서 만들지 않는다.
CharacterController.prototype._nilahUpdateBladeGlow = function(dt) {
  const rig = this._nilahWeaponRig;
  if (!rig) return;
  const chainA = rig.bladeAChain, chainB = rig.bladeBChain;
  if (!chainA || !chainA.length || !chainB || !chainB.length) return;

  if (!rig.glow) {
    const mkTube = (color) => {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.35, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    };
    rig.glow = { meshA: mkTube(0x9fe9ff), meshB: mkTube(0x9fe9ff), radius: BASE_UNIT * 0.012 };
  }

  // 상태별 목표 색/굵기/밝기를 정한다:
  // - 기본(상시 활성화): 옅은 청백색, 얇게
  // - 평타 시전 중: 조금 더 밝고 두껍게
  // - Q 강화 상태(_nilahQActive): 가장 밝고 두껍게, 살짝 금빛이 도는 흰색
  const isAttacking = !!(this.currentActionKey && (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit'));
  const isQEmpowered = this._nilahQActive();
  let targetColor = 0x9fe9ff, targetOpacity = 0.32, targetRadiusMul = 1.0;
  if (isAttacking) { targetColor = 0xcdf7ff; targetOpacity = 0.55; targetRadiusMul = 1.4; }
  if (isQEmpowered) { targetColor = 0xfff6d8; targetOpacity = 0.75; targetRadiusMul = 1.9; }

  const glow = rig.glow;
  glow._colorObj = glow._colorObj || new THREE.Color();
  glow._targetColorObj = glow._targetColorObj || new THREE.Color();
  glow._targetColorObj.setHex(targetColor);
  glow.meshA.material.color.lerp(glow._targetColorObj, Math.min(1, dt * 10));
  glow.meshB.material.color.copy(glow.meshA.material.color);
  glow.meshA.material.opacity = THREE.MathUtils.lerp(glow.meshA.material.opacity, targetOpacity, Math.min(1, dt * 10));
  glow.meshB.material.opacity = glow.meshA.material.opacity;
  glow._radiusMul = THREE.MathUtils.lerp(glow._radiusMul ?? 1, targetRadiusMul, Math.min(1, dt * 10));

  const buildTube = (chain, mesh) => {
    const pts = chain.map((bone) => getWorldPosition(bone));
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = Math.max(8, pts.length * 2);
    const geo = new THREE.TubeGeometry(curve, segs, glow.radius * glow._radiusMul, 5, false);
    mesh.geometry.dispose();
    mesh.geometry = geo;
  };
  buildTube(chainA, glow.meshA);
  buildTube(chainB, glow.meshB);
};

// Extracted from CharacterController: _nilahApplyShield
CharacterController.prototype._nilahApplyShield = function(amount, duration, kind='nilahP') { 
    if (!(amount > 0)) return 0;
    this.shield = Math.max(this.shield || 0, amount);
    this._nilah.shieldUntil = Math.max(this._nilah.shieldUntil || 0, performance.now() + duration * 1000);
    this._nilah.shieldKind = kind;
    updateBars(this);
    // 추가(빠져 있던 부분): 보호막을 받아도 지금까지 아무 시각 효과가
    // 없었다 - 얇게 몸을 감싸는 은은한 발광으로 표시한다.
    if (typeof vfx !== 'undefined' && vfx && typeof vfx.spawn === 'function') {
      vfx.spawn('nilahShield', this.root.position.clone(), new THREE.Vector3(0,0,1), { duration });
    }
    return amount;
  
};

// Extracted from CharacterController: _nilahReceiveHeal
CharacterController.prototype._nilahReceiveHeal = function(amount, source=null) { 
    if (!(amount > 0)) return 0;
    const boosted = source && source !== this && (source.isChampion || source.type === 'champion' || source.championId)
      ? amount * (1 + this._nilahData().passive.allyHealBonusPercent / 100)
      : amount;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + boosted);
    const overheal = Math.max(0, before + boosted - this.maxHp);
    if (overheal > 0) this._nilahApplyShield(overheal, this._nilahData().passive.sharedShieldMaxDuration, 'nilahP');
    updateBars(this);
    return boosted;
  
};

// Extracted from CharacterController: _nilahReceiveShield
CharacterController.prototype._nilahReceiveShield = function(amount, source=null, duration=4) { 
    if (!(amount > 0)) return 0;
    const boosted = source && source !== this && (source.isChampion || source.type === 'champion' || source.championId)
      ? amount * (1 + this._nilahData().passive.allyShieldBonusPercent / 100)
      : amount;
    const finalDuration = Math.min(duration, this._nilahData().passive.sharedShieldMaxDuration);
    this._nilahApplyShield(boosted, finalDuration, 'nilahP');
    return boosted;
  
};

// Extracted from CharacterController: _nilahHealSelf
CharacterController.prototype._nilahHealSelf = function(amount, shieldDuration, kind='nilahP') { 
    if (!(amount > 0)) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const overheal = Math.max(0, before + amount - this.maxHp);
    if (overheal > 0) this._nilahApplyShield(overheal, shieldDuration, kind);
    // 요청("강화 평타 쓸 때 발밑에 반짝이 제거"): 회복량 자체(위 hp 계산)는
    // 그대로 두고, 발밑에 나타나던 시각 효과만 제거했다.
    updateBars(this);
    return overheal;
  
};

// Extracted from CharacterController: _nilahAllyCandidates
CharacterController.prototype._nilahAllyCandidates = function() { 
    const pools = [globalThis.alliedChampions, globalThis.alliedUnits, globalThis.allyChampions, globalThis.placedAllies];
    const out = [];
    for (const pool of pools) if (Array.isArray(pool)) for (const u of pool) if (u && u !== this && u.hp > 0 && !u.isEnemy && (u.isChampion || u.type === 'champion' || u.championId)) out.push(u);
    return [...new Set(out)];
  
};

// Extracted from CharacterController: _nilahNearestAlly
CharacterController.prototype._nilahNearestAlly = function(rangeLol=null) { 
    const list = this._nilahAllyCandidates();
    let best=null, bestD=Infinity;
    const maxD = rangeLol == null ? Infinity : lolRangeToWorld(rangeLol);
    for (const u of list) {
      const d = getHorizontalDistanceOf(this, u);
      if (d <= maxD && d < bestD) { best=u; bestD=d; }
    }
    return best;
  
};

// Extracted from CharacterController: _nilahHealUnit
CharacterController.prototype._nilahHealUnit = function(target, amount, shieldDuration, kind='nilahP') { 
    if (!target || !(amount > 0)) return 0;
    // 영원한 기쁨의 7.5%/15% 증가는 '아군이 닐라에게 제공하는' 회복/보호막에만 적용한다.
    // 닐라 R이 아군을 직접 회복시키는 경우에는 닐라의 제공 효과를 임의로 증폭하지 않는다.
    const p=this._nilahData().passive;
    const boostedHeal=amount;
    const maxHp = target.maxHp || 0;
    const before = target.hp || 0;
    target.hp = Math.min(maxHp, before + boostedHeal);
    const overheal = Math.max(0, before + boostedHeal - maxHp);
    if (overheal > 0) {
      const shieldValue = overheal;
      const duration = kind === 'nilahP_R' ? shieldDuration : Math.min(shieldDuration, p.sharedShieldMaxDuration);
      target.shield = Math.max(target.shield || 0, shieldValue);
      target._nilahSharedShieldUntil = Math.max(target._nilahSharedShieldUntil || 0, performance.now() + duration * 1000);
      target._nilahSharedShieldKind = kind;
    }
    return overheal;
  
};

// Extracted from CharacterController: _nilahOnBasicAttackHit
CharacterController.prototype._nilahOnBasicAttackHit = function(target, dealtDamage, wouldKill) { 
    if (!target || this.championId !== 'nilah') return;
    const p = this._nilahData().passive;
    const critChance = Math.max(0, Math.min(1, this.stats.critChance || 0));
    if ((target.isChampion || target.type === 'champion' || target.championId) && dealtDamage > 0) {
      const heal = dealtDamage * (critChance * (this._nilahData().Q.lifestealFromCritPercent / 100));
      this._nilahHealSelf(heal, p.qOverhealShieldDuration, 'nilahP');
    }
    const empowered = this._nilahQActive();
    // 버그 수정(정지 방지 원칙 통일): 평타 명중 VFX(히트 링/원뿔 스윕/
    // 파티클) 전체를 try/catch로 감싼다 - Q/E/R과 동일하게, 여기서 예외가
    // 나도 평타 스케줄링이나 다른 로직에 영향을 주지 않게 한다.
    try {
      // 추가("평타/강화 평타 이펙트"): 지금까지 평타 명중에 시각 효과가
      // 전혀 없었다. 실제 적중 지점(target)에 짧은 히트 링을 남긴다 -
      // 일반 평타는 청록색, 강화 상태면 금빛으로 구분한다. 전투 판정
      // (dealtDamage 계산 등)과는 완전히 분리된 순수 표시용이다.
      // 더 뚜렷하게(강화 평타 한정): 링 하나로는 일반 평타와 구분이 약해서,
      // 강화 상태일 때는 더 크게 + 바깥으로 한 번 더 퍼지는 2차 충격파 +
      // 작은 파티클 버스트까지 얹어서 확실히 다르게 보이게 했다.
      if (dealtDamage > 0 && typeof nilahVfx2Ring === 'function') {
        const hitPos = getWorldPosition(target); if (hitPos) {
          const p2 = hitPos.clone(); p2.y += BASE_UNIT * 0.5;
          nilahVfx2Ring(nilahVfx2.scene, p2, empowered ? 0.55 : 0.28, empowered ? 0xffe8a8 : 0x8ff0ff, empowered ? 0.26 : 0.16);
          // 추가: 사용자가 실제 파일로 확인해준 공식 평타 텍스처(swipe_01/02,
          // linearsplashes_02)를 실제 적중 방향으로 겹쳐 재생한다 - 강화
          // 상태면 조금 더 크게 나가도록 scale만 다르게 넘긴다.
          if (typeof vfx !== 'undefined' && vfx && typeof vfx.spawn === 'function') {
            const hitDir = new THREE.Vector3().subVectors(hitPos, this.root.position).setY(0);
            vfx.spawn('nilahBA', hitPos.clone(), hitDir, { scale: empowered ? 1.3 : 1.0 });
          }
          if (empowered) {
            setTimeout(() => { try { if (typeof nilahVfx2Ring === 'function') nilahVfx2Ring(nilahVfx2.scene, p2.clone(), 1.0, 0xfff6d8, 0.24); } catch (err) { console.error('[Nilah AA] 지연 VFX 오류(무시):', err); } }, 35);
            if (typeof NilahVfx2ParticleField === 'function') {
              const burst = new NilahVfx2ParticleField(18, 0.4, 0xffe8a8, 0.06);
              burst.position.copy(p2);
              nilahVfx2._add(burst, 0.28, (inst, dt) => { burst.tick(dt); burst.material.opacity = (1 - inst.t / 0.28) * 0.65; });
            }
          }
        }
      }
    } catch (err) {
      console.error('[Nilah AA] 평타 히트 VFX 처리 중 오류(무시하고 계속 진행):', err);
    }
    // Q 강화 상태의 평타 추가 범위 공격: 주 대상 외의 원뿔 대상에게 총 공격력 100% 물리 피해.
    if (empowered && !target.isTurret && !target.isNexus && !target.isInhibitor) {
      const forward = getDirection(this, target);
      const hits = findEnemiesInRadius(this.root.position, this.stats.attackRange ? worldDistanceToLol(this.stats.attackRange) : 350, { forward, maxAngleDeg: this._nilahData().Q.coneAngleDeg });
      // 요청("강화 평타 쓸 때 발밑에 반짝이 제거"): 여기 있던 원뿔 스윕
      // 이펙트가 캐릭터 발밑(this.root.position)에 생성되고 있었고,
      // 강화 상태(empowered)일 때만 나갔던 게 정확히 "발밑 반짝이"였다.
      // 원뿔 범위 데미지 판정 자체는 그대로 두고, 이 시각 효과만 제거했다.
      for (const h of hits) {
        if (h.unit === target) continue;
        const extra = this.stats.attackDamage * this._nilahData().Q.extraConeTotalAdRatio;
        applyDamage(h.unit, { rawDamage: extra, damageType: DAMAGE_TYPE.PHYSICAL, isCritical:false, critMultiplier:1, armorPenPercent: this.armorPenPercent || 0 });
        // 추가: 추가 피격 대상 각각에도 작은 히트 링을 남겨서 "여러 명을
        // 맞췄다"는 게 실제로 보이게 한다.
        if (typeof nilahVfx2Ring === 'function') {
          const hp2 = getWorldPosition(h.unit); if (hp2) { const q2 = hp2.clone(); q2.y += BASE_UNIT * 0.4; nilahVfx2Ring(nilahVfx2.scene, q2, 0.3, 0xffe8a8, 0.18); }
        }
      }
    }
  
};

// Extracted from CharacterController: _nilahSyncStats
CharacterController.prototype._nilahSyncStats = function() { 
    if (this.championId !== 'nilah') return;
    const q = this._nilahData().Q;
    const critChance = Math.max(0, Math.min(1, this.stats.critChance || 0));
    this._nilah.qArmorPen = critChance * q.armorPenFromCritPercent / 100;
    this._nilah.qLifeSteal = critChance * q.lifestealFromCritPercent / 100;
    this.armorPenPercent = this._nilah.qArmorPen;
    const base = computeChampionStats('nilah', this.champLevel);
    this.stats.attackRange = base.attackRange + (this._nilahQActive() ? lolRangeToWorld(q.rangeBonus) : 0);
    this.stats.nilahLifeSteal = this._nilah.qLifeSteal;
    this.stats.bonusAttackSpeedPercent = getAttackSpeedBuffPercent(this);
    if (this._nilahQActive()) this.stats.bonusAttackSpeedPercent += this._nilahCurrentQASPercent();
  
};

// Extracted from CharacterController: _nilahQHit
CharacterController.prototype._nilahQHit = function(impactPoint, free=false, ePath=null) { 
    const q = this._nilahData().Q; const lvl = Math.max(1, this.skillLevels.Q || 1);
    const critChance = Math.max(0, Math.min(1, this.stats.critChance || 0));
    const rawBase = skillVal(q.damageBaseByLevel, lvl) + q.totalAdRatio * this.stats.attackDamage;
    const raw = rawBase * (1 + critChance * (this._nilahQCritMultiplier() - 1));
    // 버그 수정(핵심 - "Q가 멈출 때가 있다"/"평타강화가 안 된다"의 실제 원인):
    // 원작 Q는 "직선(Ability Direction, Width 150)"으로 적중 판정을 하는
    // 스킬샷인데, 지금까지는 도착 지점(impactPoint) 주변의 반경 150 원
    // 안에 있는 대상만 맞도록 되어 있었다. 그래서 더미/적이 닐라와 도착
    // 지점 "사이" 어딘가에 서 있으면 실제로는 전혀 맞지 않았다 - Q가
    // 아무 반응 없이 끝나버리니 사용자 입장에선 "멈춘 것"처럼 보이고,
    // 애초에 적중을 못 하니 강화(_nilahQActive)도 걸릴 수가 없었다.
    // _nilahEnemiesAlongSegment(직선 판정, E의 돌진 경로 판정에 이미 쓰던
    // 함수)를 그대로 재사용해서 "닐라 → 도착 지점" 직선으로 바꾼다 -
    // 새 판정 시스템을 만들지 않는다. 폭은 Q 자체의 폭(impactRadius, 위키
    // 표기 "Width: 150")을 절반으로 나눠 반폭(half-width)으로 넘긴다.
    // 데이터 수정(실제 bin 확인): 직접 시전 Q(NilahQ, 폭 80)와 E 돌진 중
    // 웨이브(NilahEQMis, 폭 125)는 서로 다른 오브젝트라 실제 폭도 다르다 -
    // 이제 각각의 실제 값으로 분리해서 넘긴다(예전엔 둘 다 같은 값을 썼다).
    const qHalfWidthWorld = lolRangeToWorld(q.impactRadius / 2);
    const waveHalfWidthWorld = lolRangeToWorld((q.waveImpactRadius ?? q.impactRadius) / 2);
    let hits = [];
    if (ePath) hits = this._nilahEnemiesAlongSegment(ePath.from, ePath.to, waveHalfWidthWorld);
    else if (impactPoint) hits = this._nilahEnemiesAlongSegment(this.root.position, impactPoint, qHalfWidthWorld);
    let hitSomething = false;
    for (const u of hits) {
      if (!u || u.hp <= 0) continue;
      if (u.isMinion && u.hp <= q.executeMinionHp) { u.hp = 0; killMinion(u); hitSomething = true; continue; }
      let mult = 1;
      if (u.isMinion) mult = q.minionDamageMultiplier;
      else if (u.isMonster) mult = q.monsterDamageMultiplier;
      applyDamage(u, { rawDamage: raw * mult, damageType:DAMAGE_TYPE.PHYSICAL, isCritical:false, critMultiplier:1, armorPenPercent:this.armorPenPercent||0 });
      hitSomething = true;
    }
    if (hitSomething) {
      this._nilah.qEmpoweredUntil = performance.now() + q.empoweredDuration * 1000;
      this._nilah.qWaveLockUntil = performance.now() + q.coneDuration * 1000;
    }
    this._nilahSyncStats(); updateBars(this);
    // VFX(Hit 단계) - 전투 판정(위 for문의 applyDamage/hitSomething 계산)이
    // 전부 끝난 뒤에만 순수 표시용으로 덧붙인다. 판정에 영향 주지 않음.
    // 실제로 무언가 맞았을 때만, "닐라 위치"가 아니라 "실제 적중 지점"에서
    // 짧고 강한 링을 터뜨려 Hit 순간을 분리해서 보여준다.
    // 더 뚜렷하게: 링 하나로는 약해서, 크기/타이밍이 다른 2겹 충격파 +
    // 중심 플래시로 강화했다(이중 링이 바깥으로 퍼지는 느낌).
    if (hitSomething && typeof nilahVfx2Ring === 'function') {
      const hitAt = ePath ? ePath.to.clone() : (impactPoint ? impactPoint.clone() : this.root.position.clone());
      hitAt.y += BASE_UNIT * 0.5;
      nilahVfx2Ring(nilahVfx2.scene, hitAt, 0.85, 0xffffff, 0.14);
      nilahVfx2Ring(nilahVfx2.scene, hitAt, 0.55, 0xfff1c8, 0.22);
      setTimeout(() => { if (typeof nilahVfx2Ring === 'function') nilahVfx2Ring(nilahVfx2.scene, hitAt.clone(), 1.3, 0x9fe9ff, 0.26); }, 40);
      if (typeof NilahVfx2ParticleField === 'function' && typeof nilahVfx2 !== 'undefined') {
        const burst = new NilahVfx2ParticleField(26, 0.55, 0xfff1c8, 0.07);
        burst.position.copy(hitAt);
        nilahVfx2._add(burst, 0.32, (inst, dt) => { burst.tick(dt); burst.material.opacity = (1 - inst.t / 0.32) * 0.7; });
      }
    }
    return hitSomething;
  
};

// Extracted from CharacterController: _nilahCastQ
CharacterController.prototype._nilahCastQ = function(mouseWorldPoint, free=false) {
    const q=this._nilahData().Q;
    if (isSilenced(this)) return;
    if (!free && this.cooldowns.Q > 0) return;
    if (!this._payCost('Q', free)) return;
    if (!free) this.cooldowns.Q = q.cooldown;

    const dashPath = this._nilah.eDash ? { from:this._nilah.eDash.from.clone(), to:this._nilah.eDash.to.clone() } : null;
    const preserveDash = !!dashPath;
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint,this.root.position).setY(0) : (this.moveDir.clone().setY(0));
    if (dir.lengthSq()<1e-6) dir.set(0,0,1).applyQuaternion(this.root.quaternion);
    dir.normalize();
    // 요청("Q를 쓴 방향을 바라보게"): Q를 사용하면 그 즉시 캐스팅 방향을
    // 바라보도록 한다. E 돌진 중 Q(웨이브)일 때도 그 순간의 조준 방향을
    // 바라보는 게 자연스러우므로 preserveDash 여부와 상관없이 적용한다.
    this.faceDirectionInstant(dir);
    const maxWorld=lolRangeToWorld(q.range);
    const dist=mouseWorldPoint ? Math.min(maxWorld, new THREE.Vector3().subVectors(mouseWorldPoint,this.root.position).setY(0).length()) : maxWorld;
    const impact=this.root.position.clone().addScaledVector(dir,dist);

    // 버그 수정(핵심 - "Q 쓸 때 가끔 멈춘다"): resolved가 원래 아래
    // if(!preserveDash) 블록 안에서만 const로 선언되어 있었다 - E 돌진
    // 중 Q(preserveDash===true)를 쓰면 그 블록을 통째로 건너뛰므로
    // resolved가 전혀 정의되지 않은 채로 아래 qAnimDuration 계산에서
    // 참조되어 매번 ReferenceError가 그대로 터졌다("가끔"인 이유 -
    // E 돌진 중에 Q를 걸 때만 재현됨). 바깥 스코프에 먼저 선언해서 두
    // 분기 모두에서 안전하게 접근 가능하게 한다.
    let resolved = [];
    if (!preserveDash) {
      this._clearActionTimers();
      this.currentActionKey='nilahQ'; this.currentPhase='STARTUP'; this.setState(STATE.Q_CAST); this.phaseCancelable=true;

      // 사용자 확인: 원본 롤에서 Spell1A/1B/1C는 하나의 Q 모션을 이루는
      // 3단 연속 클립이 맞다(교체용 변형이 아니다). 이전에 "매번 하나만
      // 순환 재생"으로 바꿨던 건 잘못된 판단이었다 - 다시 세 클립을 전부
      // 이어붙여 재생하는 방식으로 되돌린다.
      const qSequence = ['Spell1A','Spell1B','Spell1C'];
      resolved = qSequence.map(name => this.findAnimation(name));
      if (resolved.every(Boolean)) {
        this.sequencePlayer.play({
          transitionFadeTime: 0.1,
          steps: resolved.map((clip) => ({
            animation: clip.name,
            clipStart: 0,
            clipEnd: clip.duration,
            fadeTime: 0.1,
            timeScale: 1.0,
          })),
          onComplete: () => {
            if (this.currentActionKey !== 'nilahQ') return;
            this.currentPhase='ACTIVE';
            // 버그 수정(핵심 - "Q 쓰면 캐릭터가 정지한다", 재발 방지): 이
            // 콜백 안에서 적중 판정(_nilahQHit, 그 안의 VFX 호출 포함)이
            // 예외를 던지면, 예전에는 그 아래에 있던 상태 초기화 코드
            // (currentActionKey=null 등)와 _resumeAfterAction()이 아예
            // 실행되지 않아서 캐릭터가 그 자리에 영구히 멈췄다. try/finally로
            // 감싸서, 안에서 무슨 일이 있어도(특히 VFX 쪽에 나중에 실수로
            // 버그가 생기더라도) 상태 초기화만은 반드시 실행되게 한다 -
            // 이 구조 자체가 보장이라 "다시는 안 나게"에 해당한다.
            try {
              this._nilahQHit(impact);
            } catch (err) {
              console.error('[Nilah Q] onComplete 처리 중 오류(정지 방지를 위해 무시하고 계속 진행):', err);
            } finally {
              this.currentActionKey=null; this.currentPhase=null; this.phaseCancelable=false;
              this._resumeAfterAction();
            }
          },
          onCancel: () => {
            if (this.currentActionKey !== 'nilahQ') return;
            this.currentActionKey=null; this.currentPhase=null; this.phaseCancelable=false;
            this._resumeAfterAction();
          }
        });
      } else {
        console.warn('[Nilah Q] Spell1A → Spell1B → Spell1C 중 없는 클립이 있어 Q 모션을 재생할 수 없습니다.', qSequence);
        this.currentActionKey=null; this.currentPhase=null; this.phaseCancelable=false;
        this._resumeAfterAction();
      }
    }

    // 동기화(5번 우선순위 "스킬 애니메이션과 VFX 프레임 동기화"): Q의
    // 실제 재생시간은 Spell1A+1B+1C 세 클립을 합친 길이다 - VFX 내부에
    // 하드코딩된 기본값(0.42초)을 쓰지 않고, 실제 애니메이션이 재생되는
    // 만큼만 정확히 물결이 자라나고 사라지도록 이 값을 그대로 넘긴다.
    const qAnimDuration = resolved.length && resolved.every(Boolean)
      ? resolved.reduce((sum, clip) => sum + clip.duration, 0)
      : 0.42;

    vfx.spawn('nilahQ', this.root.position.clone(), dir, { ePath: dashPath, hitPoint: impact });
    // 사용자가 제공한 VFX v2 (더 강한 연출용) - Cast/Active 단계: 발밑이
    // 아니라 실제 칼날(BladeA_end) 뼈의 월드 좌표에서 재생해서, 캐릭터가
    // 실제로 휘두르는 채찍을 따라가는 것처럼 보이게 한다. Hit 단계(적중
    // 순간의 링)는 _nilahQHit()에서 실제 적중 지점 기준으로 별도 처리한다.
    nilahVfx2.playQLoL({ position: this._nilahBladeAnchor('A'), direction: dir, length: lolRangeToWorld(q.range) / BASE_UNIT, duration: qAnimDuration });

    // E 돌진 중 Q는 기존 돌진 모션을 끊지 않는다. Q 파동은 돌진 종료 시점에
    // 기존 _nilahResolveEDashEnd() 경로에서 처리한다.
    if (preserveDash) {
      if (!this._nilah.qDuringEDashFired) {
        this._nilah.qDuringEDashFired = true;
        this._nilah.pendingEWave = { from: this.root.position.clone(), to: this._nilah.eDash.to.clone() };
      }
      return;
    }
};

// Extracted from CharacterController: _nilahCastW
CharacterController.prototype._nilahCastW = function(mouseWorldPoint, free=false) { 
    const w=this._nilahData().W; const lvl=Math.max(1,this.skillLevels.W||1);
    if (isSilenced(this)) return;
    if (!free && this.cooldowns.W>0) return;
    if (!this._payCost('W', free)) return;
    if (!free) this.cooldowns.W=skillVal(w.cooldown,lvl);
    const dur=w.duration;
    // 데이터 추가(ExtensionBonus 구현용): 아군 공유 지속시간을 "닐라 본인의
    // W가 몇 초 남았는가" 기준으로 늘리려면 시전 시각을 알아야 한다.
    this._nilah.wCastAt = performance.now();
    applyStatus(this,{id:'nilahW_ms',type:'MS_BUFF',duration:dur,value:skillVal(w.moveSpeedPercent,lvl)/100});
    applyStatus(this,{id:'nilahW_dodge',type:'NILAH_W_DODGE',duration:dur,value:1});
    applyStatus(this,{id:'nilahW_magic',type:'MAGIC_DAMAGE_REDUCTION',duration:dur,value:w.magicDamageReductionPercent/100});
    applyStatus(this,{id:'nilahW_ghost',type:'NILAH_GHOST',duration:dur,value:1});
    this._clearActionTimers(); this.currentActionKey='nilahW'; this.currentPhase='ACTIVE'; this.setState(STATE.W_CAST); this.phaseCancelable=true;
    const wClip=this.findAnimation('Spell2');
    this.playFirstAvailable(['Spell2','Spell2_Run'],{loop:THREE.LoopOnce,fade:0.1,clampWhenFinished:true});
    vfx.spawn('nilahW', this.root.position.clone(), new THREE.Vector3(0,0,1), { duration: dur });
    // 사용자가 제공한 VFX v2 - W의 실제 지속시간(dur)에 그대로 맞춘다.
    // 버그 수정("W 주변 안개가 이동을 안 따라간다"): W는 지속시간 내내
    // 자유 이동이 허용되는데, 이펙트는 시전 시점 위치에 고정되어 있어서
    // 캐릭터가 걸어가면 안개가 제자리에 남겨졌다. 인스턴스를 저장해두고
    // _nilahUpdate에서 매 프레임 캐릭터 위치로 다시 옮긴다.
    this._nilah.wVfxInstance = nilahVfx2.playWLoL({ position: this.root.position.clone(), duration: dur });
    // 버그 수정(핵심): 원작 닐라 W는 거의 즉시 캐스트되는 버프 스킬로,
    // 버프(회피/이속/보호막)가 지속되는 dur(2.25초) 내내 캐릭터를 묶어두면
    // 안 된다 - 그동안은 자유롭게 움직이고 다른 행동도 할 수 있어야 한다.
    // 예전엔 이 조작 잠금 해제 타이머가 dur 전체를 그대로 썼다(버프 지속시간
    // = 행동 불가 시간으로 착각한 버그) - 이제는 실제 캐스트 모션(Spell2)
    // 재생 시간만큼만 짧게 잠그고, 버프 자체는 위 applyStatus로 이미
    // dur만큼 별도로 유지되므로 전혀 영향받지 않는다.
    const castLock=Math.max(0.08, Math.min(0.3, wClip?.duration || 0.2));
    const t=setTimeout(()=>{if(this.currentActionKey==='nilahW'){this.currentActionKey=null;this.currentPhase=null;this.phaseCancelable=false;this._resumeAfterAction();}},castLock*1000); this._actionTimers.push(t);
    updateBars(this);
  
};

// Extracted from CharacterController: _nilahEnemiesAlongSegment
CharacterController.prototype._nilahEnemiesAlongSegment = function(from,to,halfWidthWorld=this._nilahData().E.pathHalfWidthWorld) { 
    const out=[]; const ax=from.x, az=from.z, bx=to.x, bz=to.z; const vx=bx-ax,vz=bz-az; const len2=vx*vx+vz*vz;
    for(const u of getAllEnemyUnits()){
      if(!u || u.hp<=0) continue; const p=getWorldPosition(u); const wx=p.x-ax,wz=p.z-az; const t=len2>1e-8?THREE.MathUtils.clamp((wx*vx+wz*vz)/len2,0,1):0; const qx=ax+vx*t,qz=az+vz*t; const d=Math.hypot(p.x-qx,p.z-qz); if(d<=halfWidthWorld+getCollisionRadius(u)) out.push(u);
    }
    return out;
  
};

// Extracted from CharacterController: _nilahResolveEDashEnd
CharacterController.prototype._nilahResolveEDashEnd = function(dash) { 
    if (!dash || dash.resolved) return;
    dash.resolved=true;
    const e=this._nilahData().E; const lvl=Math.max(1,this.skillLevels.E||1); const raw=skillVal(e.damageByLevel,lvl)+e.bonusAdRatio*Math.max(0,this.stats.attackDamage-(computeChampionStats('nilah',this.champLevel)?.attackDamage||0));
    for(const u of this._nilahEnemiesAlongSegment(dash.from,dash.to)) applyDamage(u,{rawDamage:raw,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1,armorPenPercent:this.armorPenPercent||0});
    // 버그 수정("Q처럼 E도 멈출 수 있는 구조였다" 예방): 대기 웨이브 판정
    // (_nilahQHit, 그 안의 VFX 포함)에서 예외가 나도, 아래 후딜 정리 타이머
    // 등록이 반드시 실행되도록 try/catch로 감싼다.
    try {
      // 미구현이었던 부분 구현("Formless Blade... a wave that is sent
      // towards her location at the end of the dash"): 돌진 중 Q를 눌러
      // 대기시켜둔 웨이브가 있으면, 돌진이 실제로 끝나는 지금 이 시점에
      // 발동시킨다(Q를 누른 순간의 위치 → 돌진 최종 목적지 경로).
      if (this._nilah.pendingEWave) {
        const wave = this._nilah.pendingEWave;
        this._nilah.pendingEWave = null;
        this._nilahQHit(null, false, wave);
      }
    } catch (err) {
      console.error('[Nilah E] 돌진 종료 처리 중 오류(정지 방지를 위해 무시하고 계속 진행):', err);
    }
    this._nilah.qDuringEDashFired=false;
    this._nilah.eDash=null;
    if(this.currentActionKey==='nilahE'){
      this.currentPhase='RECOVERY';
      // E의 돌진이 끝나면 공격 타이머/후딜에 남아있던 상태가 다음 평타를 막지 않도록 즉시 정리한다.
      const t=setTimeout(()=>{
        if(this.currentActionKey==='nilahE'){
          this.currentActionKey=null;
          this.currentPhase=null;
          this.phaseCancelable=false;
          this._resumeAfterAction();
        }
      },50);
      this._actionTimers.push(t);
    }
  
};

// Extracted from CharacterController: _nilahRestoreECharges
CharacterController.prototype._nilahRestoreECharges = function(now) { 
    const n = this._nilah, e = this._nilahData().E;
    if (!n.eRechargeAt.length) return;
    let restored = 0;
    const fresh = [];
    for (const t of n.eRechargeAt) { if (t <= now) restored++; else fresh.push(t); }
    n.eRechargeAt = fresh;
    if (restored > 0) n.eCharges = Math.min(e.maxCharges, n.eCharges + restored);
  
};

// Extracted from CharacterController: _nilahCastE
CharacterController.prototype._nilahCastE = function(mouseWorldPoint, free=false) { 
    const e=this._nilahData().E; const lvl=Math.max(1,this.skillLevels.E||1); const now=performance.now();
    if (isSilenced(this)) return;
    if (this._nilah.rSeq && this._nilah.rSeq.precast) { showSkillToast('E - 환희 선딜레이 중 사용 불가'); return; }
    if (this._nilah.eDash && this.currentActionKey==='nilahE') return;
    if (!free) this._nilahRestoreECharges(now);
    if(this._nilah.eCharges<=0){showSkillToast('E - 충전 없음');return;}
    const target=this.currentTarget;
    if(!target || target.hp<=0){ showSkillToast('E - 대상 선택 필요'); return; }
    if(!free && this.cooldowns.E>0 && false) return; // E's nominal 0.5 is a cast timing value; charges govern availability.
    // 닐라 E는 기본 공격 모션을 취소하고 즉시 돌진하며, 돌진 종료 후 다음 평타를 즉시 준비한다.
    const wasBasicAttack = !!(this.currentActionKey && (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit'));
    if (wasBasicAttack) {
      this._clearActionTimers();
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
    }
    if(!this._payCost('E',free)) return;
    if(!free){ this._nilah.eCharges--; this._nilah.eRechargeAt.push(now+skillVal(e.rechargeTime,lvl)*1000); this.cooldowns.E=0; }
    const start=this.root.position.clone(); const targetPos=getWorldPosition(target).clone();
    // 버그 수정("E가 적한테 닿으면 남은 거리만큼 안 간다"): 원작 E는
    // 대상까지의 거리와 무관하게 항상 고정 거리(DashTotalDistance=600)를
    // 전부 돌진한다 - 대상이 가까이 있어도 그 자리에서 멈추지 않고
    // 방향은 그대로 유지한 채 끝까지 나아간다. 예전엔 Math.min(dist,
    // maxWorld)로 "대상까지의 거리"에서 멈춰버렸다.
    const maxWorld=lolRangeToWorld(e.range); const d=new THREE.Vector3(targetPos.x-start.x,0,targetPos.z-start.z); const dist=d.length();
    if(dist<1e-6)d.copy(this.moveDir).setY(0); if(d.lengthSq()<1e-6)d.set(0,0,1); d.normalize();
    const end=start.clone().addScaledVector(d,maxWorld);
    const eClip=this.findAnimation('Spell3_Cast') || this.findAnimation('Spell3A'); const duration=Math.max(0.10,Math.min(0.22,eClip ? eClip.duration*0.55 : e.dashDuration));
    const dash={from:start,to:end,elapsed:0,duration,resolved:false}; this._nilah.qDuringEDashFired=false; this._nilah.eDash=dash;
    // 요청("E 스킬 동안 잠깐 유체화 상태"): 이 프로젝트에 이미 있던
    // "유체화"(NILAH_GHOST, 유닛과 충돌하지 않고 지나감) 상태를 그대로
    // 재사용한다 - W에서 쓰던 것과 완전히 같은 메커니즘이고, 돌진이
    // 진행되는 시간(duration)만큼만 짧게 걸었다가 자동으로 사라진다.
    applyStatus(this,{id:'nilahE_ghost',type:'NILAH_GHOST',duration,value:1});
    vfx.spawn('nilahE', start.clone(), d.clone(), { to: end.clone() });
    // 사용자가 제공한 VFX v2 - 실제 돌진 시작/끝 지점과 소요 시간을 그대로 사용
    nilahVfx2.playELoL({ start: start.clone(), end: end.clone(), duration });
    this._clearActionTimers(); this.currentActionKey='nilahE'; this.currentPhase='ACTIVE'; this.setState(STATE.E_CAST); this.phaseCancelable=true;
    this.playFirstAvailable(['Spell3A','Spell3_Cast','Spell3B'],{loop:THREE.LoopOnce,fade:0.08,clampWhenFinished:true});
    if(!free) updateBars(this);
  
};

// Extracted from CharacterController: _nilahCastR
CharacterController.prototype._nilahCastR = function(free=false) { 
    const r=this._nilahData().R; const lvl=Math.max(1,this.skillLevels.R||1); const now=performance.now();
    if(isSilenced(this)) return;
    if(!free && this.cooldowns.R>0) return;
    if(!this._payCost('R',free)) return;
    if(!free)this.cooldowns.R=skillVal(r.cooldown,lvl);
    if(this._nilah.rSeq) return;
    this._clearActionTimers(); this.currentActionKey='nilahR'; this.currentPhase='STARTUP'; this.setState(STATE.R_CAST); this.phaseCancelable=false;
    const startup=0.16;
    this._nilah.rSeq={elapsed:0,tickAccum:0,ticksDone:0,finalDone:false,precast:true,precastUntil:now+startup*1000,championDamage:0,nonChampionDamage:0,channelEnded:false};
    // 데이터 추가(실제 bin 확인 - ShieldCalc): R 시전 시 확정 보호막을
    // 즉시 부여한다. 지금까지 있던 "초과 회복량 → 보호막 전환"과는 완전히
    // 별개의, 실제 스펠 데이터에 있는 고정 보호막 공식이다.
    const bonusAd = Math.max(0, this.stats.attackDamage - (computeChampionStats('nilah', this.champLevel)?.attackDamage || 0));
    const shieldAmount = skillVal(r.shieldBaseByLevel, lvl) + r.shieldBonusAdRatio * bonusAd;
    this._nilahApplyShield(shieldAmount, r.shieldDuration, 'nilahR');
    // 사용자가 제공한 VFX v2 - 실제 R 반경(damageRadius)과 전체 지속시간
    // (선딜 + 채널링)에 맞춰 한 번만 재생한다(틱마다 반복 재생하지 않음).
    nilahVfx2.playRLoL({
      position: this.root.position.clone(),
      radius: lolRangeToWorld(r.damageRadius) / BASE_UNIT,
      duration: startup + r.channelDuration,
    });
    this.playFirstAvailable(['Spell4_Idle','Spell4_Run'],{loop:THREE.LoopRepeat,fade:0.1});
    updateBars(this);
  
};

// Extracted from CharacterController: _nilahRApplyTick
CharacterController.prototype._nilahRApplyTick = function(seq) { 
    const r=this._nilahData().R, lvl=Math.max(1,this.skillLevels.R||1);
    const hits=findEnemiesInRadius(this.root.position,r.damageRadius).map(x=>x.unit);
    const baseAd=computeChampionStats('nilah',this.champLevel)?.attackDamage||0;
    const bonusAd=Math.max(0,this.stats.attackDamage-baseAd);
    const raw=skillVal(r.tickDamageByLevel,lvl)+r.tickBonusAdRatio*bonusAd;
    for(const u of hits){
      const dealt=applyDamage(u,{rawDamage:raw,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1,armorPenPercent:this.armorPenPercent||0});
      if(u.isChampion||u.type==='champion'||u.championId) seq.championDamage+=dealt; else seq.nonChampionDamage+=dealt;
      // 미구현이었던 부분: 원작은 R의 틱 타격도 대상을 슬로우시킨다(다시
      // 맞으면 갱신) - id를 고정해서 applyStatus가 새로 걸지 않고 지속시간만
      // 갱신하도록 한다(연속 타격 = 슬로우 유지).
      applyStatus(u,{id:'nilahR_slow',type:'SLOW',duration:r.slowDuration,value:r.slowPercent/100});
    }
    vfx.spawn('nilahRtick',this.root.position.clone(),new THREE.Vector3(0,0,1),{tick:seq.ticksDone});
    // 추가(R Hit 단계 분리): 전투 판정(위 for문)이 끝난 뒤에만, 실제 4번의
    // 틱 타이밍 각각에 맞춰 짧은 히트 링을 터뜨린다 - 채널링 내내 도는
    // 큰 회전 이펙트(Active 단계, 시전 시 1회 재생)와 별개로, 실제로
    // 데미지가 들어가는 순간을 시각적으로 분리해서 보여준다.
    // 버그 수정(정지 방지): VFX 호출에서 예외가 나도 R 채널 자체(타이머/
    // 다음 틱 진행)가 끊기지 않도록 try/catch로 감싼다.
    try {
      if (typeof nilahVfx2Ring === 'function') {
        const tickPos = this.root.position.clone(); tickPos.y += BASE_UNIT * 0.45;
        nilahVfx2Ring(nilahVfx2.scene, tickPos, 0.35 + seq.ticksDone * 0.06, 0x9cf3ff, 0.14);
      }
    } catch (err) {
      console.error('[Nilah R] 틱 VFX 처리 중 오류(무시하고 계속 진행):', err);
    }
  
};

// Extracted from CharacterController: _nilahRFinish
CharacterController.prototype._nilahRFinish = function(seq) { 
    if(!seq || seq.finalDone) return;
    seq.finalDone=true;
    const r=this._nilahData().R, lvl=Math.max(1,this.skillLevels.R||1);
    const hits=findEnemiesInRadius(this.root.position,r.damageRadius).map(x=>x.unit);
    const baseAd=computeChampionStats('nilah',this.champLevel)?.attackDamage||0;
    const bonusAd=Math.max(0,this.stats.attackDamage-baseAd);
    const raw=skillVal(r.finalDamageByLevel,lvl)+r.finalBonusAdRatio*bonusAd;
    for(const u of hits){
      const dealt=applyDamage(u,{rawDamage:raw,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1,armorPenPercent:this.armorPenPercent||0});
      if(u.isChampion||u.type==='champion'||u.championId) seq.championDamage+=dealt; else seq.nonChampionDamage+=dealt;
      applyStatus(u,{id:'nilahR_slow',type:'SLOW',duration:r.slowDuration,value:r.slowPercent/100});
      const from=getWorldPosition(u); if(from){const dir=new THREE.Vector3().subVectors(this.root.position,from).setY(0); if(dir.lengthSq()>1e-8){dir.normalize(); const to=this.root.position.clone();
        // 요청("적을 끌어올 때 아주 잠깐 에어본을 걸고 띄워서 끌고와"):
        // 끌어당기는 동안(0.22초)만 아주 짧게 KNOCKUP 상태를 걸어서
        // 다른 챔피언의 에어본(리신 R 등)과 같은 방식으로 이동/행동을
        // 막고, 범용 끌어당김 트윈(tickPullEffects)에 liftHeight를
        // 지정해서 실제로 살짝 떠올랐다가 내려오는 곡선 궤적으로 끌려오게
        // 한다 - baseY를 미리 기록해서 바닥 높이를 기준으로 뜨게 한다.
        // 버그 수정("두 이동 시스템 충돌"): KNOCKUP 상태를 걸면 리신/야스오가
        // 이미 쓰던 수직 상승 시스템(_yasuoAirborne)이 자동으로 같이
        // 발동되는데, 예전 코드는 여기에 별도의 liftHeight 트윈까지
        // 추가로 걸어서 두 시스템이 같은 프레임에 같은 좌표(mesh.position.y)를
        // 서로 다른 값으로 매 프레임 덮어쓰고 있었다(둘 다 X/Z lerp는
        // tickPullEffects가 하지만 Y는 서로 따로 계산). 새 시스템을 또
        // 만들지 않고 기존 _yasuoAirborne의 airborneHeight 옵션만
        // 지정해서 중복을 없앤다.
        u._pullState={from:from.clone(),to,duration:0.22,elapsed:0};
        applyStatus(u,{id:'nilahR_air',type:'KNOCKUP',duration:0.22,value:1,airborneHeight:BASE_UNIT*0.35});
        // 추가("R은 닐라 중심의 흡입 파티클"): 실제로 계산된 당김 경로
        // (from/to/duration)를 그대로 읽어서, 대상이 있던 자리에서 닐라
        // 쪽으로 빨려들어가는 작은 이펙트를 남긴다 - 당김 판정 자체(위
        // u._pullState 대입)는 그대로 두고 표시만 추가한다.
        // 버그 수정(정지 방지): VFX 호출 실패가 나머지 대상 처리나 아래
        // 회복 계산을 막지 않도록 try/catch로 감싼다.
        try { if (typeof nilahVfx2Ring === 'function') nilahVfx2Ring(nilahVfx2.scene, from.clone(), 0.3, 0xbaf6ff, 0.2); }
        catch (err) { console.error('[Nilah R] 흡입 VFX 처리 중 오류(무시하고 계속 진행):', err); }
      }}
    }
    vfx.spawn('nilahRfinal',this.root.position.clone());
    const critPct=Math.max(0,Math.min(1,this.stats.critChance||0))*100;
    const healPct=(r.healBasePercent + r.healCritPercentPerCrit*critPct)/100;
    const totalHeal=(seq.championDamage + seq.nonChampionDamage*r.nonChampionHealMultiplier)*healPct;
    this._nilahHealSelf(totalHeal,r.shieldDuration,'nilahP_R');
    for(const ally of this._nilahAllyCandidates()) if(getHorizontalDistanceOf(this,ally)<=lolRangeToWorld(r.healRadius)){
      this._nilahHealUnit(ally,totalHeal,r.shieldDuration,'nilahP_R');
    }
    if(this.findAnimation('Spell4_ToIdle')) this.playFirstAvailable(['Spell4_ToIdle'],{loop:THREE.LoopOnce,fade:0.1,clampWhenFinished:true});
    const clipDur=this.findAnimation('Spell4_ToIdle')?.duration||0.2;
    // 버그 수정(핵심): 이 GLB의 'Spell4_ToIdle' 클립은 실제 길이가 약 7.6초다
    // (전환 애니메이션치고 비정상적으로 길다 - 아마 뒤에 유휴 프레임이 그대로
    // 붙어있는 클립으로 보인다). 예전엔 이 조작권 복구 타이머가 그 전체
    // 길이를 그대로 기다렸기 때문에, 궁극기를 한 번 쓸 때마다 캐릭터가
    // 거의 8초씩 멈춰버렸다. 다른 챔피언들의 종료-전환 타이머(Q/E 등, 보통
    // 80~120ms)와 동일한 수준으로 상한을 둬서, 클립 자체는 그대로 재생하되
    // (크로스페이드가 자연스럽게 다음 동작으로 넘어가며 덮어쓴다) 조작권은
    // 정상적인 짧은 후딜 시간 안에 돌려준다.
    const controlLockMs=Math.max(120, Math.min(320, clipDur*1000));
    const timer=setTimeout(()=>{if(this.currentActionKey==='nilahR'){this.currentActionKey=null;this.currentPhase=null;this._nilah.rSeq=null;this._resumeAfterAction();}},controlLockMs);
    this._actionTimers.push(timer);
  
};

// Extracted from CharacterController: _nilahUpdate
CharacterController.prototype._nilahUpdate = function(dt) { 
    if(this.championId!=='nilah') return;
    const now=performance.now(); const n=this._nilah; const d=this._nilahData();
    this._nilahUpdateBladeGlow(dt);
    // 추가("Q 스킬 이펙트"): 시전 시점에 한 번 그리는 고정 직선 리본
    // (playQLoL)과 별개로, Q 윈드업이 실제로 재생되는 동안(currentActionKey
    // === 'nilahQ') 매 프레임 실제 칼날 뼈(BladeA_end/BladeB_end) 위치를
    // 샘플링해서 물결 트레일을 남긴다 - E의 이동 트레일과 같은 방식으로,
    // 실제 스윙 궤적(직선이 아니라 애니메이션이 만드는 진짜 곡선)을
    // 그대로 따라간다. 전투 판정과는 무관한 순수 표시용.
    if (this.currentActionKey === 'nilahQ' && typeof nilahVfx2Ring === 'function') {
      n.qTrailAccum = (n.qTrailAccum || 0) + dt;
      if (n.qTrailAccum >= 0.03) {
        n.qTrailAccum = 0;
        const empowered = this._nilahQActive();
        const tipA = this._nilahBladeAnchor('A');
        const tipB = this._nilahBladeAnchor('B');
        nilahVfx2Ring(nilahVfx2.scene, tipA, empowered ? 0.32 : 0.24, empowered ? 0xfff1c8 : 0x8ff0ff, 0.22);
        nilahVfx2Ring(nilahVfx2.scene, tipB, empowered ? 0.32 : 0.24, empowered ? 0xfff1c8 : 0x8ff0ff, 0.22);
      }
    }
    n.eCharges=Math.max(0,Math.min(d.E.maxCharges,n.eCharges));
    this._nilahRestoreECharges(now);
    this._nilahSyncStats();
    if(n.shieldUntil && now>=n.shieldUntil && n.shieldKind){if(this.shield>0)this.shield=0;n.shieldUntil=0;n.shieldKind=null;updateBars(this);}
    // 버그 수정("W 안개가 이동을 안 따라간다"): W 지속시간 내내 자유
    // 이동이 허용되므로, 이펙트 인스턴스가 살아있는 동안 매 프레임 캐릭터
    // 위치로 다시 옮긴다 - 죽은 인스턴스면 참조를 정리한다.
    if(n.wVfxInstance){
      if(n.wVfxInstance.dead) n.wVfxInstance=null;
      else n.wVfxInstance.root.position.copy(this.root.position);
    }
    for(const ally of this._nilahAllyCandidates()) if(ally._nilahSharedShieldUntil && now>=ally._nilahSharedShieldUntil){ally.shield=0;ally._nilahSharedShieldUntil=0;ally._nilahSharedShieldKind=null;}
    if(hasStatus(this,'NILAH_W_DODGE')){
      const w=d.W, lvl=Math.max(1,this.skillLevels.W||1);
      // 데이터 추가(실제 bin 확인): 지금까지 공유 판정 범위가 "몸이 거의
      // 닿아야만" 발동하는 수준(collisionRadius 합)으로 너무 좁게 되어
      // 있었다 - 실제 값은 AreaTriggerSize(150, LoL 단위)다.
      const shareRangeWorld = lolRangeToWorld(w.areaTriggerSize || 150);
      const near=this._nilahAllyCandidates().filter(a=>getHorizontalDistanceOf(this,a)<=shareRangeWorld);
      // 데이터 추가(ExtensionBonus 구현): 공유 지속시간은 기본 1.5초지만,
      // 아군이 범위 안에 머무는 동안은 닐라 본인 W가 끝날 때까지(최대
      // 2.25초, BaseDuration - ShareBaseDuration = ExtensionBonus(0.75)와
      // 정확히 일치)로 늘어난다 - "범위 안에 머무르면 연장된다"는 실제
      // 데이터 관계를 그대로 구현한다. 최소 1.5초는 항상 보장한다.
      const elapsedSec = Math.max(0, (now - (n.wCastAt || now)) / 1000);
      const remainingNilahWSec = Math.max(0, w.duration - elapsedSec);
      const allyDurationSec = Math.max(w.allyDuration, remainingNilahWSec);
      for(const ally of near){
        applyStatus(ally,{id:'nilahW_ms_shared',type:'MS_BUFF',duration:allyDurationSec,value:skillVal(w.moveSpeedPercent,lvl)/100});
        applyStatus(ally,{id:'nilahW_dodge_shared',type:'NILAH_W_DODGE',duration:allyDurationSec,value:1});
        applyStatus(ally,{id:'nilahW_magic_shared',type:'MAGIC_DAMAGE_REDUCTION',duration:allyDurationSec,value:w.magicDamageReductionPercent/100});
        applyStatus(ally,{id:'nilahW_ghost_shared',type:'NILAH_GHOST',duration:allyDurationSec,value:1});
      }
    }
    if(n.eDash){
      const dash=n.eDash;dash.elapsed+=dt;const t=Math.min(1,dash.elapsed/dash.duration);this.root.position.lerpVectors(dash.from,dash.to,t);
      // 추가("E는 실제 이동 경로를 기반으로 연속적인 물결 트레일"): 시전
      // 시점에 한 번만 그리는 고정 시작-끝 리본과 별개로, 매 프레임 실제
      // 보간 위치(this.root.position)를 따라가며 짧게 사라지는 링을
      // 남긴다 - 실제 이동 경로 그대로를 따라가므로 경로가 휘거나
      // (E 도중 다른 로직이 위치를 바꾸는 경우) 항상 실제 위치와 일치한다.
      // 전투 판정과는 무관한 순수 표시용이라 dash.elapsed/t 계산 자체는
      // 건드리지 않는다.
      dash._trailAccum = (dash._trailAccum || 0) + dt;
      if (dash._trailAccum >= 0.035 && typeof nilahVfx2Ring === 'function') {
        dash._trailAccum = 0;
        const trailPos = this.root.position.clone(); trailPos.y += BASE_UNIT * 0.12;
        nilahVfx2Ring(nilahVfx2.scene, trailPos, 0.22, 0x7fe8ff, 0.22);
      }
      if(t>=1)this._nilahResolveEDashEnd(dash);
    }
    const seq=n.rSeq;
    if(seq){
      if(seq.precast){if(now>=seq.precastUntil){seq.precast=false;seq.elapsed=0;seq.tickAccum=0;seq.ticksDone=0;this.currentPhase='ACTIVE';this.playFirstAvailable(['Spell4_Idle','Spell4_Run'],{loop:THREE.LoopRepeat,fade:0.12});}}
      else if(!seq.finalDone){
        seq.elapsed+=dt; seq.tickAccum+=dt;
        while(seq.ticksDone<4 && seq.tickAccum>= (seq.ticksDone===0 ? 0 : d.R.tickInterval)-1e-6){
          if(seq.ticksDone===0 || seq.tickAccum>=d.R.tickInterval-1e-6){
            if(seq.ticksDone>0) seq.tickAccum-=d.R.tickInterval; else seq.tickAccum=0;
            seq.ticksDone++; this._nilahRApplyTick(seq);
          }
          if(seq.ticksDone>=4) break;
        }
        if(seq.elapsed>=d.R.channelDuration){this._nilahRFinish(seq);}
      }
    }
  
};

// Extracted from CharacterController: _nilahFinalQACheck
CharacterController.prototype._nilahFinalQACheck = function() { 
    if (this.championId !== 'nilah') return { ok:false, reason:'not nilah' };
    const d=this._nilahData();
    const checks={
      stats: !!(d.stats && d.stats.hp===570 && d.stats.ad===58 && d.stats.range===225),
      q: !!(d.Q && d.Q.range===600 && d.Q.impactRadius===80 && d.Q.coneAngleDeg===60 && d.Q.empoweredDuration===4),
      w: !!(d.W && d.W.duration===2.25 && d.W.allyDuration===1.5 && d.W.magicDamageReductionPercent===25),
      e: !!(d.E && d.E.range===550 && d.E.maxCharges===2 && d.E.rechargeTime.length===5),
      r: !!(d.R && d.R.damageRadius===450 && d.R.healRadius===1500 && d.R.channelDuration===1 && d.R.tickInterval===0.25),
      animations: ['Attack1a','Attack2a','Spell1A','Spell2','Spell3A','Spell3_Cast','Spell3B','Spell4_Idle','Spell4_ToIdle'].every(n=>!!this.findAnimation(n)),
      // 버그 수정: 존재한 적 없는 this._nilahBladeRoots를 참조하고 있어서
      // 다른 체크가 전부 통과해도 이 항목 하나 때문에 ok가 항상 false로
      // 나왔다. 실제 웨폰 리그 데이터는 bootstrapChampion()에서 만드는
      // this._nilahWeaponRig(bladeAEnd/bladeBEnd 등)에 들어있다.
      weaponBones: !!(this._nilahWeaponRig && this._nilahWeaponRig.bladeAEnd && this._nilahWeaponRig.bladeBEnd),
    };
    const ok=Object.values(checks).every(Boolean);
    console.log('[NILAH FINAL QA]', {ok,checks});
    return {ok,checks};
  
};

