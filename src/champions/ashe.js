/* ============================================================
   애쉬(Ashe) 전투 로직
   ------------------------------------------------------------
   다른 챔피언들(바루스/이즈리얼/아리 등)과 동일한 패턴 - CharacterController.
   prototype 확장으로 챔피언 전용 메서드를 분리하고, character_controller.js의
   _beginAttackSwing/_onBasicAttackHit/castAbility/_dispatchCast/_die()/
   update() 해당 지점에서 championId === 'ashe'면 이 파일의 커스텀 함수로
   위임한다(공용 Controller 코드를 직접 뒤섞지 않는다는 이 프로젝트의
   원칙 그대로).

   사용자가 제공한 실제 애쉬.glb(87노드/24클립)로 모션을 구현했다. 이
   세션은 조직 네트워크 정책상 wiki.leagueoflegends.com/leagueoflegends.
   fandom.com/mobafire.com/공식 KR 챔피언 페이지 전부 EGRESS_BLOCKED라
   실시간 툴팁 원문 전체 대조는 하지 못했다 - 대신 WebSearch 스니펫으로
   교차 확인 가능했던 수치만 반영했고, champion_data.js의 ashe 항목
   상단 주석에 어떤 부분이 확인됐고 어떤 부분이 명시적 근사인지
   정리해뒀다(README도 참고).

   E(매 날리기)/R(마법의 수정화살)은 이 프로젝트에 새로 추가한 시야
   시스템(src/core/vision_system.js)에 연결되어 실제로 해당 지점의
   시야를 밝힌다 - visionSystem.grantVision(위치, 반경, 지속시간)이
   유일한 연결 지점이고, 수치는 전부 champion_data.js의 ashe
   (visionRadius/visionDurationSec)에서 가져오므로 튜닝이 쉽다.

   구현 범위상 명시적으로 근사/생략한 부분(수치를 지어내지 않고 명시적으로
   근사한 것 - 이 프로젝트의 기존 원칙 그대로):
   - E의 "경로"에 대한 실시간 시야는 구현하지 않았다 - 도착 지점에서만
     원형 시야를 부여한다(champion_data.js 주석 참고).
   - 패시브(서리 화살)의 치명타 강화 둔화는 실제로는 1초에 걸쳐 원래
     세기로 감쇠하지만, 이 프로젝트의 SLOW 상태이상 시스템에는 아직 감쇠
     기능이 없어 고정 세기로 근사한다.
   - W(일제 사격)의 정확한 사거리/폭(각도)과 마나 비용은 이번 세션에
     실시간으로 재검증하지 못해 널리 알려진 근사값을 사용했다.
   ============================================================ */

/* ---------------------------------------------------------------
   공용 - 살아있는지 확인(바루스 BUG 25와 동일한 이유 - UI 비활성화만
   믿지 않고 각 캐스트 함수 자체가 직접 검증한다)
   --------------------------------------------------------------- */
CharacterController.prototype._asheIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};

/* ---------------------------------------------------------------
   패시브 - 서리 화살(Frost Shot)
   --------------------------------------------------------------- */

CharacterController.prototype._asheApplyFrostShot = function(target, isCritical) {
  if (!target || target.hp <= 0) return;
  const p = this._champData().passive;
  const slowPercent = this._asheFrostSlowPercent();
  const duration = p.slowDurationSec || 2.0;
  applyStatus(target, { id: 'asheFrostShot', type: 'SLOW', duration, value: slowPercent / 100, source: this });
  // 치명타: 둔화 2배로 시작해 첫 1초에 걸쳐 원래 세기로 감소(PC 위키). 둔화는 가장 강한 것 하나만 적용되므로
  // "2배 세기에서 2초에 걸쳐 0으로 선형 감소"하는 상태를 함께 걸면 처음 1초는 2배→1배로 내려오고
  // 그 뒤엔 기본 둔화가 남는다 - 원작 곡선과 정확히 같다.
  if (isCritical) {
    const mult = p.critSlowMultiplier || 2;
    const decaySec = p.critDecaySec || 1.0;
    applyStatus(target, { id: 'asheFrostShotCrit', type: 'SLOW', duration: decaySec * mult / (mult - 1), value: Math.min(0.99, slowPercent * mult / 100), decayLinear: true, source: this });
  }
  vfx.spawn('hit', getWorldPosition(target)?.clone() || target.mesh.position.clone(), undefined, { color: 0xbfe8ff });
};

// 기본 공격 명중 공통 훅(_onBasicAttackHit) - 서리 화살 둔화 적용 +
// 궁사의 집중(Q) 스택 획득. Q의 다발 공격(_asheFireFlurry)은 다중 대상이라
// 이 단일 대상 훅을 거치지 않고 완전히 분리 처리하므로, 여기서는 항상
// "일반 평타"만 다룬다 - 다발 공격 때문에 스택이 이중으로 쌓일 걱정이 없다.
// 서리 화살 둔화 세기(%): 1레벨 20% → 18레벨 30%(레벨 사이는 선형 보간 - 곡선 미공개).
CharacterController.prototype._asheFrostSlowPercent = function() {
  const p = this._champData().passive;
  const t = Math.min(1, Math.max(0, ((this.champLevel || 1) - 1) / 17));
  return p.slowPercentAtLevel1 + (p.slowPercentAtLevel18 - p.slowPercentAtLevel1) * t;
};

// 서리 화살 추가 피해 배율: 평타가 치명타 확률 × (100% + 무한의 대검 30%)만큼 추가 피해, 치명타 자체는 추가 피해 없음.
CharacterController.prototype._asheBasicAttackDamageMultiplier = function() {
  const p = this._champData().passive;
  const crit = Math.max(0, Math.min(1, this.stats.critChance || 0));
  const ratio = (p.critChanceBonusDamageRatio || 1) + (((this.itemBonusCritDamagePercent || 0) > 0) ? (p.critChanceBonusDamageRatioIE || 0) : 0);
  return 1 + crit * ratio;
};

CharacterController.prototype._asheOnBasicAttackHit = function(target, isCritical) {
  if (!target) return;
  this._asheApplyFrostShot(target, isCritical);
  const q = this._champData().Q;
  const maxStacks = q.maxStacks || 4;
  this._ashe.focusStacks = Math.min(maxStacks, (this._ashe.focusStacks || 0) + 1);
  this._ashe.focusExpiresAt = performance.now() + (q.stackWindowSec || 4) * 1000;
};

/* ---------------------------------------------------------------
   Q(궁사의 집중) - 스택 소모형 자기 자신 대상 상태 스킬
   --------------------------------------------------------------- */

CharacterController.prototype._asheCastQ = function(free = false) {
  if (!this._asheIsAlive()) return; // BUG 25와 동일한 이유
  if (isSilenced(this)) return;
  const q = this._champData().Q;
  const maxStacks = q.maxStacks || 4;
  if ((this._ashe.focusStacks || 0) < maxStacks) {
    const msg = `Q - 궁사의 집중 스택 부족 (${this._ashe.focusStacks || 0}/${maxStacks})`;
    console.log(`[SKILL BLOCKED] ${msg}`);
    showSkillToast(msg);
    return;
  }
  if (!this._payCost('Q', free)) return; // 쿨다운/마나는 0 - 실제 제약은 위 스택 게이트
  this._ashe.focusStacks = 0;
  this._ashe.focusExpiresAt = 0;
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const asPercent = skillVal(q.attackSpeedPercentByLevel, lvl);
  const durationSec = q.buffDurationSec || 6.0;
  applyStatus(this, { id: 'asheRangersFocus', type: 'AS_BUFF', duration: durationSec, value: asPercent / 100 });
  this._ashe.qActiveUntil = performance.now() + durationSec * 1000;
  this._ashe.flurryPending = true; // 시전 후 첫 다발은 화살 1발 추가(6발). 이후 지속시간 동안의 평타는 5발 다발.
  vfx.spawn('hit', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 1.2, 0)), undefined, { color: 0xbfe8ff });
  debugSkillHit('Ashe Q (궁사의 집중 발동)', this, { attackSpeedPercent: asPercent, durationSec });
};

// Q로 강화된 첫 기본 공격 - character_controller.js의 _beginAttackSwing()이
// flurryPending을 확인해 일반 단일 대상 공격 대신 이 함수를 호출한다.
// 궁사의 집중 다발 공격: 평타 대상 하나에게 화살 5발(첫 다발 6발). 화살마다 피해·서리 화살,
// 적중 시 효과(아이템 등)는 다발당 1회. 평타처럼 서리 화살 추가 피해 배율이 적용된다.
CharacterController.prototype._asheFireFlurry = function(originalTarget, originPos, dirToTarget, willCrit, isFirst) {
  const q = this._champData().Q;
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const arrows = (q.flurryArrowCount || 5) + (isFirst ? (q.firstFlurryBonusArrows || 0) : 0);
  const perArrow = (skillVal(q.flurryArrowAdPercentByLevel, lvl) / 100) * this.stats.attackDamage * this._asheBasicAttackDamageMultiplier();
  if (!originalTarget || originalTarget.hp <= 0) { debugSkillMiss('Ashe Q (다발 공격)', '대상 없음'); return; }
  const t = originalTarget;
  for (let i = 0; i < arrows; i++) {
    const dmg = perArrow;
    const firstArrow = i === 0;
    projectiles.spawn({
      from: originPos, target: t, speed: q.flurryMissileSpeed ? lolRangeToWorld(q.flurryMissileSpeed) : this.stats.projectileSpeed * 2,
      color: 0xbfe8ff, realmId: this.realmId,
      onHit: (u) => {
        if (u.isTurret) { applyDamageToTurret(u, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }, { isRanged: true, source: this }); return; }
        if (u.isMinion) { applyDamageToMinion(u, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isBasicAttack: firstArrow }, true); this._asheApplyFrostShot(u, willCrit); return; }
        if (u.isInhibitor) { applyDamageToInhibitor(u, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }); return; }
        if (u.isNexus) { applyDamageToNexus(u, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }); return; }
        applyDamage(u, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this, isBasicAttack: true });
        this._asheApplyFrostShot(u, willCrit);
        // 적중 시 효과(아이템·집중 중첩 등)는 다발당 한 번 - 첫 화살에서만.
        if (firstArrow && typeof itemOnBasicAttackHit === 'function') itemOnBasicAttackHit(this, u, willCrit);
        debugSkillHit('Ashe Q (다발 공격)', u, { arrow: i + 1, of: arrows, dmg: dmg.toFixed(1) });
      },
    });
  }
};

/* ---------------------------------------------------------------
   W(일제 사격) - 부채꼴 다중 대상 스킬샷(대상별 단일 판정)
   --------------------------------------------------------------- */

CharacterController.prototype._asheCastW = function(mouseWorldPoint, free = false) {
  if (!this._asheIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const w = this._champData().W;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('W', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'asheW'; this.currentPhase = 'STARTUP'; this.phaseCancelable = true;
  this.setState(STATE.W_CAST);
  this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const castTime = w.castTimeSec != null ? w.castTimeSec : 0.25; // SKILL_TIMING_DATABASE.ashe.W와 동일
  this._ashe.wPending = {
    dir: dir.clone(), lvl: Math.max(1, this.skillLevels.W || 1),
    remainingFireSec: castTime, remainingRecoverySec: castTime + 0.15,
    fireDone: false, recoveryDone: false,
  };
};

CharacterController.prototype._asheResolveWImpact = function(p) {
  const w = this._champData().W;
  const origin = this.root.position.clone();
  // 화살 N발(7~11)이 부채꼴(27.75~46.25°)로 퍼진다. 화살마다 처음 맞은 적 하나에만 피해(한 대상은 한 번만).
  const coneDeg = skillVal(w.coneAngleDegByLevel, p.lvl) || 46;
  const arrows = skillVal(w.arrowsByLevel, p.lvl) || 9;
  const candidates = findEnemiesInRadius(origin, w.range || 1200, { forward: p.dir, maxAngleDeg: coneDeg / 2 });
  const hits = [];
  const taken = new Set();
  for (let i = 0; i < arrows; i++) {
    const ang = THREE.MathUtils.degToRad(-coneDeg / 2 + (arrows > 1 ? (coneDeg * i) / (arrows - 1) : coneDeg / 2));
    const adir = p.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    let best = null;
    for (const h of candidates) {
      if (taken.has(h.unit)) continue;
      const up = getWorldPosition(h.unit); if (!up) continue;
      const v = new THREE.Vector3(up.x - origin.x, 0, up.z - origin.z);
      const along = v.dot(adir); if (along < 0) continue;
      const lateral = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
      if (lateral > lolRangeToWorld(20) + getCollisionRadius(h.unit)) continue; // 화살 폭(미공개 - 20 근사)
      if (!best || along < best.along) best = { unit: h.unit, along };
    }
    if (best) { taken.add(best.unit); hits.push(best); }
  }
  if (!hits.length) { debugSkillMiss('Ashe W (일제 사격)', '부채꼴 범위 내 대상 없음'); return; }
  const raw = skillVal(w.damageByLevel, p.lvl) + (w.bonusAdRatio || 0) * this._getBonusAD();
  for (const { unit } of hits) {
    if (!unit || unit.hp <= 0) continue;
    if (unit.isTurret) { applyDamageToTurret(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }, { isRanged: true, source: this }); continue; }
    if (unit.isMinion) { applyDamageToMinion(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }, true); this._asheApplyFrostShot(unit, false); continue; }
    if (unit.isInhibitor) { applyDamageToInhibitor(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }); continue; }
    if (unit.isNexus) { applyDamageToNexus(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }); continue; }
    applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
    this._asheApplyFrostShot(unit, false);
    vfx.spawn('hit', getWorldPosition(unit)?.clone() || unit.mesh.position.clone(), undefined, { color: 0xbfe8ff });
    debugSkillHit('Ashe W (일제 사격)', unit);
  }
};

/* ---------------------------------------------------------------
   E(매 날리기) - 순수 정찰(비피해) 스킬 - 실제 시야 시스템에 연결됨
   --------------------------------------------------------------- */

CharacterController.prototype._asheCastE = function(mouseWorldPoint, free = false) {
  if (!this._asheIsAlive()) return;
  if (isSilenced(this)) return;
  const e = this._champData().E;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  const rawDist = dir.length();
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  // 충전 2회(재충전 90~50초, 하나씩) + 사용 간격 5초(PC 위키).
  if (!free && (this._ashe.eCharges || 0) <= 0) { showSkillToast('E - 충전 없음'); return; }
  if (!this._payCost('E', free)) return;
  if (!free) {
    this._ashe.eCharges -= 1;
    if (!this._ashe.eRechargeEndAt) this._ashe.eRechargeEndAt = performance.now() + abilityHasteCooldown(this, skillVal(e.rechargeTime, Math.max(1, this.skillLevels.E || 1))) * 1000;
  }
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'asheE'; this.currentPhase = 'STARTUP'; this.phaseCancelable = true;
  this.setState(STATE.E_CAST);
  this.playFirstAvailable(['Spell3'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });

  const worldRange = lolRangeToWorld(e.range || 4000);
  const dist = Math.min(rawDist || worldRange, worldRange);
  const targetPoint = this.root.position.clone().addScaledVector(dir, dist);
  const castTime = e.castTimeSec != null ? e.castTimeSec : 0.25; // SKILL_TIMING_DATABASE.ashe.E와 동일
  const flightSec = e.missileSpeed ? dist / lolRangeToWorld(e.missileSpeed) : 1.0;
  this._ashe.ePending = {
    targetPoint: targetPoint.clone(),
    remainingArriveSec: flightSec, remainingRecoverySec: castTime + 0.15,
    arriveDone: false, recoveryDone: false,
  };
  debugSkillHit('Ashe E (매 날리기 - 정찰)', this, { dist: worldDistanceToLol(dist).toFixed(0) });
};

// 매가 목적지에 도착했을 때 - 실제 시야 시스템(visionSystem)에 임시
// 시야 공급원을 등록한다(이 데모의 핵심 "진짜 정찰" 기능).
CharacterController.prototype._asheResolveEArrival = function(p) {
  const e = this._champData().E;
  if (typeof visionSystem !== 'undefined' && visionSystem) {
    visionSystem.grantVision(p.targetPoint, e.visionRadius || 900, e.visionDurationSec || 5.0);
  }
  vfx.spawn('hit', p.targetPoint.clone(), undefined, { color: 0xd8f3ff });
  debugSkillHit('Ashe E (매 날리기 - 도착/시야 확보)', this);
};

/* ---------------------------------------------------------------
   R(마법의 수정화살) - 전 맵 사거리(Global) 관통형 스킬샷
   --------------------------------------------------------------- */

CharacterController.prototype._asheStunDurationForDistance = function(lolDistance) {
  const r = this._champData().R;
  const minSec = r.minStunSec != null ? r.minStunSec : 1.0;
  const maxSec = r.maxStunSec != null ? r.maxStunSec : 3.5;
  const maxDist = r.maxStunLolDistance || r.range || 20000;
  const frac = Math.max(0, Math.min(1, lolDistance / maxDist));
  return minSec + (maxSec - minSec) * frac;
};

CharacterController.prototype._asheCastR = function(mouseWorldPoint, free = false) {
  if (!this._asheIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const r = this._champData().R;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('R', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'asheR'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.R_CAST);
  this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });

  const castTime = r.castTimeSec != null ? r.castTimeSec : 0.5; // SKILL_TIMING_DATABASE.ashe.R과 동일
  this._ashe.rPending = {
    dir: dir.clone(), remainingFireSec: castTime, remainingRecoverySec: castTime + 0.2,
    fireDone: false, recoveryDone: false,
  };
};

CharacterController.prototype._asheResolveRFire = function(p) {
  const r = this._champData().R;
  this.currentPhase = 'ACTIVE';
  const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
  this._ashe.rTravel = {
    dir: p.dir.clone(), pos: origin.clone(),
    maxDist: lolRangeToWorld(r.range || 20000),
    halfWidth: lolRangeToWorld(r.width || 130) * 0.5,
    speed: lolRangeToWorld(r.missileSpeed || 1500),
    maxSpeed: lolRangeToWorld(r.missileMaxSpeed || r.missileSpeed || 1500),
    accel: lolRangeToWorld(r.missileAccelPerSec || 0),
    traveled: 0, vfxAccum: 0,
  };
  vfx.spawn('hit', origin.clone(), undefined, { color: 0x9fd7ff });
};

// 매 프레임 R 광선 진행. 첫 적 챔피언에 닿으면 즉시 명중 처리하고 스스로를
// 정리한다(이즈리얼 R처럼 계속 날아가며 여러 명을 관통하지 않는다).
CharacterController.prototype._asheTickRTravel = function(dt) {
  const travel = this._ashe && this._ashe.rTravel;
  if (!travel) return;
  if (travel.accel > 0) travel.speed = Math.min(travel.maxSpeed, travel.speed + travel.accel * dt); // 1500→2100 가속
  const remaining = Math.max(0, travel.maxDist - travel.traveled);
  const step = Math.min(remaining, Math.max(0, travel.speed * dt));
  travel.pos.addScaledVector(travel.dir, step);
  travel.traveled += step;

  travel.vfxAccum = (travel.vfxAccum || 0) + dt;
  if (travel.vfxAccum >= 0.05) {
    travel.vfxAccum = 0;
    vfx.spawn('hit', travel.pos.clone(), undefined, { color: 0x9fd7ff });
  }

  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || !u.isChampion) continue; // 미니언/포탑/억제기/넥서스는 무시하고 통과(공식 설명 그대로)
    if (isInCircle(u, travel.pos, travel.halfWidth)) {
      this._asheResolveRHit(u, travel);
      this._ashe.rTravel = null;
      return;
    }
  }
  if (travel.traveled >= travel.maxDist - 1e-4) {
    debugSkillMiss('Ashe R (마법의 수정화살)', '사거리 끝까지 아무 챔피언도 맞히지 못함');
    this._ashe.rTravel = null;
  }
};

// 주 대상 명중 처리(피해+기절) + 주변 적 스플래시(피해만, 기절 없음) +
// 명중 지점 임시 시야.
CharacterController.prototype._asheResolveRHit = function(primary, travel) {
  const r = this._champData().R;
  const lvl = Math.max(1, this.skillLevels.R || 1);
  const raw = skillVal(r.damageByLevel, lvl) + (r.apRatio || 0) * (this.stats.abilityPower || 0);
  const lolDistance = worldDistanceToLol(travel.traveled);
  const stunSec = this._asheStunDurationForDistance(lolDistance);

  applyDamage(primary, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
  applyStatus(primary, { id: 'asheR_stun', type: 'STUN', duration: stunSec, value: 0, source: this });
  vfx.spawn('hit', getWorldPosition(primary)?.clone() || primary.mesh.position.clone(), undefined, { color: 0x9fd7ff });
  debugSkillHit('Ashe R (마법의 수정화살 - 주 대상)', primary, { stunSec: stunSec.toFixed(2), lolDistance: lolDistance.toFixed(0) });

  if (typeof visionSystem !== 'undefined' && visionSystem) {
    visionSystem.grantVision(travel.pos, r.visionRadius || 900, r.visionDurationSec || 3.0);
  }

  const splashRadius = lolRangeToWorld(r.splashRadius || 400);
  const splashMult = (r.splashDamagePercent != null ? r.splashDamagePercent : 100) / 100;
  for (const u of getAllEnemyUnits()) {
    if (!u || u === primary || u.hp <= 0) continue;
    if (!isInCircle(u, travel.pos, splashRadius)) continue;
    applyDamage(u, { rawDamage: raw * splashMult, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    this._asheApplyFrostShot(u, false); // PC 위키: 주변 적에게도 서리 화살
    vfx.spawn('hit', getWorldPosition(u)?.clone() || u.mesh.position.clone(), undefined, { color: 0x9fd7ff });
    debugSkillHit('Ashe R (마법의 수정화살 - 주변 피해)', u);
  }
};

/* ---------------------------------------------------------------
   매 프레임 훅
   --------------------------------------------------------------- */

CharacterController.prototype._asheUpdate = function(dt) {
  if (this.championId !== 'ashe' || !this._ashe) return;
  const now = performance.now();

  if (this._ashe.focusStacks > 0 && now >= this._ashe.focusExpiresAt) {
    this._ashe.focusStacks = 0;
  }
  // E 충전: 하나씩 재충전, 최대 2회.
  if (this._ashe.eRechargeEndAt && now >= this._ashe.eRechargeEndAt) {
    const e = this._champData().E;
    this._ashe.eCharges = Math.min(e.maxCharges || 2, (this._ashe.eCharges || 0) + 1);
    this._ashe.eRechargeEndAt = this._ashe.eCharges < (e.maxCharges || 2)
      ? now + abilityHasteCooldown(this, skillVal(e.rechargeTime, Math.max(1, this.skillLevels.E || 1))) * 1000 : 0;
  }
  if (this._ashe.qActiveUntil && now >= this._ashe.qActiveUntil) {
    this._ashe.qActiveUntil = 0;
    this._ashe.flurryPending = false;
  }

  if (this._ashe.wPending) {
    const p = this._ashe.wPending;
    if (!p.fireDone) {
      p.remainingFireSec -= dt;
      if (p.remainingFireSec <= 0) {
        p.fireDone = true;
        if (this.currentActionKey === 'asheW') this._asheResolveWImpact(p);
      }
    }
    if (!p.recoveryDone) {
      p.remainingRecoverySec -= dt;
      if (p.remainingRecoverySec <= 0) {
        p.recoveryDone = true;
        if (this.currentActionKey === 'asheW') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
      }
    }
    if (p.fireDone && p.recoveryDone) this._ashe.wPending = null;
  }

  if (this._ashe.ePending) {
    const p = this._ashe.ePending;
    if (!p.arriveDone) {
      p.remainingArriveSec -= dt;
      if (p.remainingArriveSec <= 0) {
        p.arriveDone = true;
        if (this.currentActionKey === 'asheE') this._asheResolveEArrival(p);
      }
    }
    if (!p.recoveryDone) {
      p.remainingRecoverySec -= dt;
      if (p.remainingRecoverySec <= 0) {
        p.recoveryDone = true;
        if (this.currentActionKey === 'asheE') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
      }
    }
    if (p.arriveDone && p.recoveryDone) this._ashe.ePending = null;
  }

  if (this._ashe.rPending) {
    const p = this._ashe.rPending;
    if (!p.fireDone) {
      p.remainingFireSec -= dt;
      if (p.remainingFireSec <= 0) {
        p.fireDone = true;
        if (this.currentActionKey === 'asheR') this._asheResolveRFire(p);
      }
    }
    if (!p.recoveryDone) {
      p.remainingRecoverySec -= dt;
      if (p.remainingRecoverySec <= 0) {
        p.recoveryDone = true;
        if (this.currentActionKey === 'asheR') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
      }
    }
    if (p.fireDone && p.recoveryDone) this._ashe.rPending = null;
  }

  this._asheTickRTravel(dt);
};
