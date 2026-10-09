// Extracted from CharacterController: _yasuoLevelValue
CharacterController.prototype._yasuoLevelValue = function(arr, lvl) {  return arr[Math.max(1, Math.min(arr.length, lvl)) - 1]; 
};

// Extracted from CharacterController: _yasuoQCooldown
CharacterController.prototype._yasuoQCooldown = function() { 
    const q = this._champData().Q;
    const lvl = Math.max(1, Math.min(5, Number(this.skillLevels.Q) || 1));
    const base = this._yasuoLevelValue(q.cooldown, lvl);
    const as = getFinalAttackSpeed(this.stats);
    const reduction = Math.min(0.66, Math.max(0, (as - 0.697) / 0.011));
    return base * (1 - reduction);
  
};

// Extracted from CharacterController: _yasuoQCastTime
CharacterController.prototype._yasuoQCastTime = function() { 
    const q = this._champData().Q;
    const lvl = Math.max(1, Math.min(5, Number(this.skillLevels.Q) || 1));
    const base = this._yasuoLevelValue(q.castTime, lvl);
    const as = getFinalAttackSpeed(this.stats);
    const reduction = Math.min(0.66, Math.max(0, (as - 0.697) / 0.011));
    return base * (1 - reduction);
  
};

// Extracted from CharacterController: _yasuoCritMultiplier
CharacterController.prototype._yasuoCritMultiplier = function() {  return this._champData().passive.critDamage; 
};

// Extracted from CharacterController: _yasuoFinalCritChance
CharacterController.prototype._yasuoFinalCritChance = function() {  return Math.min(10, this.stats.critChance || 0); 
};

// Extracted from CharacterController: _yasuoBonusADFromCrit
CharacterController.prototype._yasuoBonusADFromCrit = function() {  const excess = Math.max(0, this._yasuoFinalCritChance() - 1); return excess * 100 * 0.5; 
};

// Extracted from CharacterController: _yasuoShieldAmount
CharacterController.prototype._yasuoShieldAmount = function() {  const p = this._champData().passive; return p.shieldBase + Math.max(0, this.champLevel - 1) * p.shieldPerLevel; 
};

// Extracted from CharacterController: _yasuoGainFlowFromMovement
CharacterController.prototype._yasuoGainFlowFromMovement = function(dt) { 
    if (!this._yasuo || this.state === STATE.DEAD) return;
    if (!this._yasuo.lastMovePosition) this._yasuo.lastMovePosition = this.root.position.clone();
    const d = this.root.position.distanceTo(this._yasuo.lastMovePosition); this._yasuo.lastMovePosition.copy(this.root.position);
    if (d <= 0 || this._yasuo.flow >= 100) return;
    const p = this._champData().passive;
    const gainPerDistance = 10 / p.flowDistance;
    this._yasuo.flow = Math.min(100, this._yasuo.flow + d * gainPerDistance);
  
};

// Extracted from CharacterController: _yasuoQStackTick
CharacterController.prototype._yasuoQStackTick = function() { 
    if (this._yasuo.qStacks > 0 && performance.now() > this._yasuo.qStackExpiresAt) { this._yasuo.qStacks = 0; this._yasuo.qStackExpiresAt = 0; }
  
};

// Extracted from CharacterController: _yasuoEStackTick
CharacterController.prototype._yasuoEStackTick = function() { 
    if (this._yasuo.eStacks > 0 && performance.now() > this._yasuo.eStacksExpiresAt) { this._yasuo.eStacks = 0; this._yasuo.eStacksExpiresAt = 0; }
    const now = performance.now(); for (const [id, until] of this._yasuo.eTargetCooldowns) if (now >= until) this._yasuo.eTargetCooldowns.delete(id);
  
};

// Extracted from CharacterController: _yasuoTargetKey
CharacterController.prototype._yasuoTargetKey = function(t) {  return t?.id || t?.uuid || t; 
};

// Extracted from CharacterController: _yasuoApplyQHit
CharacterController.prototype._yasuoApplyQHit = function(target, { tornado=false, circle=false } = {}) { 
    const q = this._champData().Q;
    const lvl = Math.max(1, Math.min(5, Number(this.skillLevels.Q) || 1));
    const base = this._yasuoLevelValue(q.damageByLevel, lvl);
    const crit = true; // 낭인의 길 +100% crit, 이 데모에는 별도 아이템 crit가 없으므로 항상 100%.
    const critMult = this._yasuoCritMultiplier();
    const raw = base + this.stats.attackDamage * (crit ? q.critTotalAdRatio : q.totalAdRatio);
    const first = !this._yasuoQHitConsumed;
    applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: crit, critMultiplier: crit ? critMult : 1, bonusArmorIgnorePercent: (this._yasuo.rArmorBuffUntil > performance.now() ? this._champData().R.armorIgnoreBonusPercent : 0), source: this });
    if (first) this._yasuoQHitConsumed = true;
    if (tornado) applyStatus(target, { id:'yasuoQKnockup', type:'KNOCKUP', duration:q.knockupDuration, value:1 });
    return raw;
  
};

// Extracted from CharacterController: _yasuoFindQTargets
CharacterController.prototype._yasuoFindQTargets = function(dir, range, radius = null) { 
    if (radius != null) return findEnemiesInRadius(this.root.position, radius).map(h => h.unit);
    return findEnemiesInRadius(this.root.position, range, this, { forward: dir, maxAngleDeg: 12 });
  
};

// Extracted from CharacterController: _yasuoStartQ3Tornado
CharacterController.prototype._yasuoStartQ3Tornado = function(dir) { 
    const q = this._champData().Q;
    const forward = dir.clone().setY(0);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1); else forward.normalize();
    const origin = this.root.position.clone();
    this._yasuo.qTornadoTravel = {
      dir: forward,
      pos: origin.clone(),
      maxDist: lolRangeToWorld(q.tornadoRange),
      halfWidth: lolRangeToWorld(q.tornadoWidth != null ? q.tornadoWidth : 250),
      speed: lolRangeToWorld(q.tornadoSpeed != null ? q.tornadoSpeed : 1000),
      traveled: 0,
      hitSet: new Set(),
    };
    vfx.spawn('q', origin.clone().addScaledVector(forward, 1.2), forward, { tornado: true, size: 1.25 });
  
};

// Extracted from CharacterController: _yasuoTickQ3Tornado
CharacterController.prototype._yasuoTickQ3Tornado = function(dt) { 
    const travel = this._yasuo && this._yasuo.qTornadoTravel;
    if (!travel) return;
    const remaining = Math.max(0, travel.maxDist - travel.traveled);
    const step = Math.min(remaining, Math.max(0, travel.speed * dt));
    travel.pos.addScaledVector(travel.dir, step);
    travel.traveled += step;

    for (const u of getAllEnemyUnits()) {
      if (!u || u.hp <= 0 || travel.hitSet.has(u)) continue;
      if (isInCircle(u, travel.pos, travel.halfWidth)) {
        travel.hitSet.add(u);
        this._yasuoApplyQHit(u, { tornado: true, circle: false });
      }
    }

    if (travel.traveled >= travel.maxDist - 1e-4) this._yasuoFinishQ3Tornado();
  
};

// Extracted from CharacterController: _yasuoFinishQ3Tornado
CharacterController.prototype._yasuoFinishQ3Tornado = function() { 
    if (!this._yasuo || !this._yasuo.qTornadoTravel) return;
    this._yasuo.qTornadoTravel = null;
    this._yasuo.qStacks = 0;
    if (window.yasuoSetQStacks) window.yasuoSetQStacks(0);
  
};

// Extracted from CharacterController: _yasuoClearPostQMoveEntry
CharacterController.prototype._yasuoClearPostQMoveEntry = function() { 
    if (this._transientMoveClipNames && this._transientMoveClipNames.has('Run1_IN_Raw')) {
      this._endTransientMoveClip('Run1_IN_Raw');
    }
    if (this._yasuo) this._yasuo.qMoveEntryPending = false;
  
};

// Extracted from CharacterController: _yasuoCastQ
CharacterController.prototype._yasuoCastQ = function(mouseWorldPoint, free=false) { 
    if (isSilenced(this) || isCrowdControlled(this)) return;
    const qLevel = Math.max(1, Math.min(5, Number(this.skillLevels.Q) || 1));
    this.skillLevels.Q = qLevel;
    if (this.currentActionKey === 'yasuoQ' && this.currentPhase == null) {
      this.currentActionKey = null;
    }
    if (!this._payCost('Q', free)) return;
    this._yasuoClearPostQMoveEntry();
    this._yasuoQStackTick();
    const q = this._champData().Q;
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0) : new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion);
    if (dir.lengthSq() < 1e-6) dir.set(0,0,1); dir.normalize(); this.faceDirectionInstant(dir);
    const stackBefore = this._yasuo.qStacks;
    const inEDash = this.currentActionKey === 'yasuoE' && this.currentPhase === 'ACTIVE';
    // E 돌진 중 Q(EQ): E의 돌진/피해 타이머를 취소하지 않고 Q만 겹쳐 재생한다.
    // 기존 runAction()은 새 액션 시작 시 이전 타이머를 전부 지워 E가 끝나지 않는
    // 문제가 있었기 때문에, E 중 Q는 별도 one-shot 경로로 처리한다.
    if (inEDash) {
      this._yasuoQHitConsumed = false;
      const tornadoNow = stackBefore >= 2;
      const animNow = 'Spell1_Dash';
      const castNow = this._yasuoQCastTime();
      this.playFirstAvailable([animNow], { loop: THREE.LoopOnce, fade: 0.03, clampWhenFinished: true, timeScale: castNow > 0 ? 1 : 1 });
      const timer = setTimeout(() => {
        const hitTargets = tornadoNow ? findEnemiesInRadius(this.root.position, q.tornadoRange).map(h=>h.unit) : findEnemiesInRadius(this.root.position, q.circleRadius).map(h=>h.unit);
        const unique=[]; for (const t of (hitTargets||[])) if (t && t.hp>0 && !unique.includes(t)) unique.push(t);
        for (const t of unique) this._yasuoApplyQHit(t, { tornado:tornadoNow, circle:true });
        if (unique.length) { this._yasuo.qStacks = tornadoNow ? 0 : Math.min(2, stackBefore + 1); if (window.yasuoSetQStacks) window.yasuoSetQStacks(this._yasuo.qStacks); this._yasuo.qStackExpiresAt = performance.now() + q.stackDuration*1000; }
        else if (tornadoNow) { this._yasuo.qStacks = 0; if (window.yasuoSetQStacks) window.yasuoSetQStacks(0); }
        if (tornadoNow) vfx.spawn('q', this.root.position.clone(), dir, { tornado:true, size:1.25 });
      }, Math.max(20, castNow * 1000));
      this._actionTimers.push(timer);
      if (!free) this.cooldowns.Q = abilityHasteCooldown(this, this._yasuoQCooldown());
      return;
    }
    const tornado = stackBefore >= 2;
    const anim = inEDash ? 'Spell1_Dash' : (tornado ? 'Spell1C' : stackBefore === 1 ? 'Spell1B' : 'Spell1A');
    const castTime = this._yasuoQCastTime();
    this._yasuo.qMoveEntryPending = true;
    this.currentActionKey='yasuoQ'; this.currentPhase='STARTUP'; this.setState(STATE.Q_CAST);
    this.runAction('yasuoQ', STATE.Q_CAST, { faceDir: dir, startupOverride: castTime, recoveryOverride: 0.08, dataOverride:{ clips:[anim], startup:castTime, recovery:0.08, cancelToMove:false, cancelToSpell:false, cancelable:false, dmg:0 }, onFire:()=>{
      this._yasuoQHitConsumed = false;
      if (tornado) {
        // Q3(회오리바람)는 시전 순간 전체 사거리를 한 번에 검사하지 않는다.
        // 야스오가 바라보는 방향으로 실제 투사체처럼 이동하며, 진행 경로에
        // 있는 적만 맞는다(뒤쪽/사거리 밖/각도 밖 적은 맞지 않음).
        this._yasuoStartQ3Tornado(dir);
        return;
      }
      const hitTargets = findEnemiesInRadius(this.root.position, q.range, { forward:dir, maxAngleDeg:12 }).map(h=>h.unit);
      const unique=[]; for (const t of (hitTargets||[])) if (t && t.hp>0 && !unique.includes(t)) unique.push(t);
      for (const t of unique) this._yasuoApplyQHit(t, { tornado:false, circle:false });
      if (unique.length) { this._yasuo.qStacks = Math.min(2, stackBefore + 1); if (window.yasuoSetQStacks) window.yasuoSetQStacks(this._yasuo.qStacks); this._yasuo.qStackExpiresAt = performance.now() + q.stackDuration*1000; }
    },});
    const cd = this._yasuoQCooldown(); if (!free) this.cooldowns.Q = abilityHasteCooldown(this, cd);
  
};

// Extracted from CharacterController: _yasuoCastW
CharacterController.prototype._yasuoCastW = function(mouseWorldPoint, free=false) { 
    if (isSilenced(this) || isCrowdControlled(this)) return;
    if (!this._payCost('W', free)) return;
    this._yasuoClearPostQMoveEntry();
    const w=this._champData().W, lvl=this.skillLevels.W||1, width=this._yasuoLevelValue(w.width,lvl);
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint,this.root.position).setY(0) : new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion); if(dir.lengthSq()<1e-6)dir.set(0,0,1);dir.normalize(); this.faceDirectionInstant(dir);
    const angle=Math.atan2(dir.x,dir.z)*180/Math.PI;
    let anim='Spell2_BASE'; if(angle>=135||angle<=-135) anim=angle>=0?'Spell2_180':'Spell2_-180'; else if(angle>45) anim='Spell2_90'; else if(angle<-45) anim='Spell2_-90'; else anim='Spell2_0';
    const clip=this.findAnimation(anim); const dur=clip?clip.duration:0.35;
    this.currentActionKey='yasuoW'; this.currentPhase='ACTIVE'; this.setState(STATE.W_CAST);
    this.runAction('yasuoW',STATE.W_CAST,{faceDir:dir,startupOverride:Math.min(0.25,dur),recoveryOverride:Math.max(0.05,dur-Math.min(0.25,dur)),dataOverride:{clips:[anim],startup:Math.min(0.25,dur),recovery:Math.max(0.05,dur-Math.min(0.25,dur)),cancelToMove:false,cancelToSpell:false,cancelable:false,dmg:0},onFire:()=>{ this._yasuoCreateWindwall(dir,width); }});
    if(!free) this.cooldowns.W=abilityHasteCooldown(this, this._yasuoLevelValue(w.cooldown,lvl));
  
};

// Extracted from CharacterController: _yasuoCreateWindwall
CharacterController.prototype._yasuoCreateWindwall = function(dir,width) { 
    this._yasuo.windwall={dir:dir.clone(),width:lolRangeToWorld(width),expiresAt:performance.now()+4000,createdAt:performance.now()};
  
};

// Extracted from CharacterController: _yasuoFinishEDash
CharacterController.prototype._yasuoFinishEDash = function() { 
    if (!this._yasuo || !this._yasuo.eDashStart || this.currentActionKey !== 'yasuoE') return;
    const target = this._yasuo.eDashTarget;
    const key = this._yasuo.eDashTargetKey;
    const e = this._champData().E;
    const lvl = Math.max(1, Math.min(5, Number(this.skillLevels.E) || 1));
    const stacks = Math.max(0, Math.min(4, this._yasuo.eDashStacksAtStart || 0));
    const mult = 1 + stacks * 0.25;

    this.root.position.copy(this._yasuo.eDashEnd);

    if (!this._yasuo.eDashDamageApplied) {
      this._yasuo.eDashDamageApplied = true;
      const min = this._yasuoLevelValue(e.damageMin, lvl);
      const baseAd = growLinear(CHAMPION_DATA.yasuo.stats.ad, CHAMPION_DATA.yasuo.stats.adGrowth, this.champLevel);
      const bonusAd = Math.max(0, this.stats.attackDamage - baseAd);
      const raw = (min + e.bonusAdRatioMin * bonusAd + e.apRatioMin * this.stats.abilityPower) * mult;

      if (target && target.hp > 0) {
        // E(질풍검)는 치명타 스킬이 아니다 - crit/critMult 변수를 참조하지
        // 않고(ReferenceError 방지) 항상 비치명타로 고정 적용한다.
        applyDamage(target, {
          rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL,
          isCritical: false, critMultiplier: 1, source: this
        });
      }

      if (key != null) {
        this._yasuo.eTargetCooldowns.set(
          key,
          performance.now() + this._yasuoLevelValue(e.targetCooldown, lvl) * 1000
        );
      }
      this._yasuo.eStacks = Math.min(4, stacks + 1);

      if (this.cooldowns.Q > 0 && this.cooldowns.Q <= 0.5) {
        this.cooldowns.Q = 0;
      }
      this._yasuo.eStacksExpiresAt = performance.now() + e.stackDuration * 1000;
    }

    this._yasuo.eDashStart = null;
    this._yasuo.eDashEnd = null;
    this._yasuo.eDashElapsed = 0;
    this._yasuo.eDashDuration = 0;
    this._yasuo.eDashTarget = null;
    this._yasuo.eDashTargetKey = null;
    this._yasuo.eDashDamageApplied = false;
    this._yasuo.eDashStacksAtStart = 0;

    if (this.currentActionKey === 'yasuoE') {
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;

      // 요청 7/8: E 종료 후 상태 복귀는 다른 모든 스킬 종료 지점과 동일하게
      // _resumeAfterAction()(대기 이동 pendingMove > 살아있는 타겟 재교전 >
      // 로코모션) 하나로 통일한다. E 시전 시작 시 this.targetPos를 이미
      // 비웠기 때문에(아래 _yasuoCastE 참고), 여기서 남아있는 stale
      // targetPos 때문에 의도치 않게 MOVE로 들어가는 일이 없다. E 도중에
      // 새로 이동 명령을 내렸다면 moveTo()가 이미 pendingMove에 저장해뒀고,
      // 그 경우에만 _resumeAfterAction()이 정상적으로 MOVE로 복귀시킨다.
      this._resumeAfterAction();
    }
  
};

// Extracted from CharacterController: _yasuoCastE
CharacterController.prototype._yasuoCastE = function(mouseWorldPoint, free=false) { 
    if (isSilenced(this) || isCrowdControlled(this)) return;
    if (!this.currentTarget || this.currentTarget.hp<=0) return;

    const target = this.currentTarget;
    const e = this._champData().E;
    const lvl = this.skillLevels.E || 1;
    const key = this._yasuoTargetKey(target);
    const now = performance.now();

    if (now < (this._yasuo.eTargetCooldowns.get(key) || 0)) return;
    if (!isInRange(this, target, e.range)) return;
    if (!this._payCost('E', free)) return;

    const targetPos = getWorldPosition(target).clone();
    const dir = new THREE.Vector3().subVectors(targetPos, this.root.position).setY(0);
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();
    this.faceDirectionInstant(dir);

    const stacks = this._yasuo.eStacks;
    const mult = 1 + Math.min(4, stacks) * 0.25;
    const start = this.root.position.clone();
    const end = targetPos.clone().addScaledVector(dir, -Math.min(0.35, lolRangeToWorld(60)));
    const clip = this.findAnimation('Spell3');
    const dur = clip ? clip.duration : 0.55;

    // E is a continuous dash. Keep this state independent from the generic action
    // timer so Q/animation changes cannot freeze the physical movement.
    this._clearActionTimers();
    this._yasuoClearPostQMoveEntry();
    // 요청 8: E 시전 시점에 남아있던 예전 이동 명령(targetPos)을 명확히
    // 정리한다. E 돌진 중에는 updateMovement()가 아예 실행되지 않으므로
    // (state가 MOVE가 아님) 이 값이 저절로 소모되지 않고 그대로 남아있다가
    // E가 끝난 뒤 "새 이동 명령을 낸 적이 없는데" 갑자기 MOVE로 들어가는
    // 원인이 됐다. E 도중에 실제로 새 이동 명령을 내리면 moveTo()가
    // ACTIVE phase 분기에서 pendingMove에 저장하므로(별도 처리 불필요),
    // 여기서 targetPos를 비워도 정당한 새 이동 명령은 그대로 보존된다.
    this.targetPos = null;
    this.isChasing = false;
    this.currentActionKey = 'yasuoE';
    this.currentPhase = 'ACTIVE';
    this.phaseCancelable = false;
    this.setState(STATE.E_CAST);

    this._yasuo.eDashStart = start.clone();
    this._yasuo.eDashEnd = end.clone();
    this._yasuo.eDashElapsed = 0;
    this._yasuo.eDashDuration = Math.max(0.12, dur * 0.75);
    this._yasuo.eDashTarget = target;
    this._yasuo.eDashTargetKey = key;
    this._yasuo.eDashDamageApplied = false;
    this._yasuo.eDashStacksAtStart = stacks;

    this.playFirstAvailable(['Spell3'], {
      loop: THREE.LoopOnce, fade: 0.03, clampWhenFinished: true
    });

    // Independent completion timer: only finishes the dash state after the actual
    // dash duration. Q can overlay its animation without canceling this timer.
    const finishTimer = setTimeout(() => { this._yasuoFinishEDash(); }, (this._yasuo.eDashDuration + 0.08) * 1000);
    this._actionTimers.push(finishTimer);

    if (!free) this.cooldowns.E = abilityHasteCooldown(this, this._yasuoLevelValue(e.cooldown, lvl));
  
};

// Extracted from CharacterController: _yasuoCastR
CharacterController.prototype._yasuoCastR = function(free=false) { 
    if (isSilenced(this) || isCrowdControlled(this)) return;

    const r = this._champData().R;
    const clip = this.findAnimation('Spell4');
    const dur = clip ? clip.duration : 1.2;
    const lvl = this.skillLevels.R || 1;
    const anchor = this._yasuoFindRTarget();
    if (!anchor) {
      if (window.yasuoSetRReady) window.yasuoSetRReady(false, null);
      return;
    }
    if (!this._payCost('R', free)) return;
    this._yasuoClearPostQMoveEntry();

    // Yasuo's R pulls in every airborne(KNOCKUP) enemy around him - not just the
    // anchor - and strikes them together. Stunned/rooted/suppressed-but-not-airborne
    // enemies are NOT valid R targets (요청 3).
    const targets = this._yasuoFindRTargets();
    if (!targets.length) return;

    const anchorPos = getWorldPosition(anchor).clone();
    const dir = new THREE.Vector3().subVectors(anchorPos, this.root.position).setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0,0,1);
    dir.normalize();
    this.faceDirectionInstant(dir);

    // Move Yasuo to the anchor first, then arrange every airborne target in
    // front of him. They remain individual units; only their positions are
    // repositioned for the R strike.
    const yasuoPos = anchorPos.clone();
    this.root.position.copy(yasuoPos);

    const front = dir.clone();
    const side = new THREE.Vector3(-front.z, 0, front.x);
    const center = yasuoPos.clone().addScaledVector(front, 0.85);

    targets.forEach((target, i) => {
      const row = Math.floor(i / 3);
      const col = (i % 3) - 1;
      const p = center.clone()
        .addScaledVector(front, row * 0.55)
        .addScaledVector(side, col * 0.65);

      // Hold every selected airborne target in the air for the whole R animation.
      p.y = getWorldPosition(target).y;
      // 버그 수정(요청 - "적이 한곳으로 안 모아짐"): 이 프로젝트의 더미/유닛
      // 오브젝트는 실제 표시 위치가 target.root가 아니라 target.mesh(Group)에
      // 있다(createDummyEnemy 참고 - root 필드 자체가 없음). 기존 코드는
      // target.root/target.position만 확인해서 둘 다 존재하지 않는 더미
      // 대상에게는 좌표 이동이 조용히 아무 효과도 내지 못했다. 이 파일의
      // 공용 getWorldPosition()과 동일한 우선순위(root 우선, 없으면 mesh)로
      // 맞춘다.
      if (target.root && target.root.position) target.root.position.copy(p);
      else if (target.mesh && target.mesh.position) target.mesh.position.copy(p);
      else if (target.position) target.position.copy(p);

      applyStatus(target, {
        id: 'yasuoRKnockup',
        type: 'KNOCKUP',
        duration: dur + 0.25,
        value: 1
      });
      // 버그 수정(요청 - "궁 맞는 적은 바닥으로 떨어지지 않고 야스오와 같은
      // 높이에 떠 있다가 끝날 때 쾅 떨어져야 함"): applyStatus()가 방금
      // 만든 기본 포물선(오르락내리락) 대신, R 전용으로 hold 플래그를 켜서
      // R 애니메이션이 끝날 때까지 높이를 고정한다(tickStatusEffects 참고).
      // 새 CC/높이 수치를 지어내지 않고 기존 airborneHeight 기본값을
      // 그대로 유지한 채 "고정 유지 여부"만 다르게 한다.
      if (target._yasuoAirborne) target._yasuoAirborne.hold = true;
    });

    this.currentActionKey='yasuoR';
    this.currentPhase='ACTIVE';
    this.setState(STATE.R_CAST);

    this.runAction('yasuoR',STATE.R_CAST,{
      faceDir:dir,
      startupOverride:dur*0.1,
      recoveryOverride:dur*0.9,
      dataOverride:{
        clips:['Spell4'],
        startup:dur*0.1,
        recovery:dur*0.9,
        cancelToMove:false,
        cancelToSpell:false,
        cancelable:false,
        dmg:0
      },
      onFire:()=>{
        const raw=this._yasuoLevelValue(r.damageByLevel,lvl)+r.bonusAdRatio*this.stats.attackDamage;

        // Every airborne target in range receives the R strike.
        targets.forEach(target=>{
          if (!target || target.hp<=0) return;
          // 버그 수정(요청 19): R 자체 피해에는 방어력 무시를 적용하지 않는다.
          // 추가 방어력 60% 무시는 R "사용 완료 후" 15초 동안 치명타
          // 공격(Q/평타 - _yasuoApplyQHit / 평타 onFire)에만 적용되며,
          // rArmorBuffUntil은 이 onFire 콜백 아래에서 지금부터 15초로
          // 설정된다. R 명중 판정 시점엔 아직 그 버프가 시작되지 않았고,
          // R 스스로도 그 버프 대상이 아니므로 여기서는 항상 0이다.
          applyDamage(target,{
            rawDamage:raw,
            damageType:DAMAGE_TYPE.PHYSICAL,
            isCritical:false,
            critMultiplier:1,
            bonusArmorIgnorePercent:0,
            source:this
          });
        });

        this._yasuo.flow=100;
        this._yasuo.qStacks=0;
        if(window.yasuoSetQStacks) window.yasuoSetQStacks(0);
        this._yasuo.qStackExpiresAt=0;
        this._yasuo.rArmorBuffUntil=performance.now()+r.buffDuration*1000;
        this._yasuo.rTarget=anchor;

        vfx.spawn('r', center.clone());
      }
    });

    if(!free) this.cooldowns.R=abilityHasteCooldown(this, this._yasuoLevelValue(r.cooldown,lvl));
  
};

// Extracted from CharacterController: _yasuoFindRTarget
CharacterController.prototype._yasuoFindRTarget = function() { 
    const range = this._champData().R.range;
    const candidates = findEnemiesInRadius(this.root.position, range) || [];
    const units = candidates.map(h => h.unit).filter(Boolean);
    const eligible = units.filter(t => t && t.hp > 0 &&
      hasStatus(t,'KNOCKUP'));

    // Used only to decide whether R is available and where Yasuo anchors.
    if (this.currentTarget && this.currentTarget.hp > 0 &&
        eligible.includes(this.currentTarget)) return this.currentTarget;

    eligible.sort((a,b) =>
      this.root.position.distanceToSquared(getWorldPosition(a)) -
      this.root.position.distanceToSquared(getWorldPosition(b))
    );
    return eligible[0] || null;
  
};

// Extracted from CharacterController: _yasuoFindRTargets
CharacterController.prototype._yasuoFindRTargets = function() { 
    const range = this._champData().R.range;
    const candidates = findEnemiesInRadius(this.root.position, range) || [];
    // 요청 3: R 대상은 반드시 KNOCKUP(에어본) 상태여야 한다. STUN/ROOT/
    // SUPPRESSION은 R 대상 조건에서 제외한다 - 활성화 판정(_yasuoFindRTarget)과
    // 반드시 동일한 조건(KNOCKUP)을 사용한다.
    return candidates
      .map(h => h.unit)
      .filter(t => t && t.hp > 0 && hasStatus(t, 'KNOCKUP'));
  
};

// Extracted from CharacterController: _yasuoTick
CharacterController.prototype._yasuoTick = function(dt) { 
    // 버그 수정(요네 등 CHAMPION_DATA에 없는/다른 챔피언일 때 매 프레임 크래시):
    // 이 함수는 원래 챔피언과 무관하게 항상 호출되고 있었는데(this._yasuo는
    // 생성자에서 모든 챔피언에 공통으로 만들어지므로 위의 !this._yasuo 가드가
    // 사실상 항상 통과해버림), 내부에서 this._champData().passive를 그대로
    // 참조하는 부분들이 있어 "현재 챔피언이 야스오가 아니거나 CHAMPION_DATA에
    // 없는 챔피언"일 때 _champData()가 null을 반환하며 매 프레임
    // TypeError를 던졌다(요청 로그: Cannot read properties of undefined
    // (reading 'passive') - requestAnimationFrame 루프에서 매 프레임 발생해
    // 극심한 렉으로 이어짐). 이제 명시적으로 championId==='yasuo'일 때만
    // 본문을 실행한다.
    if (this.championId !== 'yasuo' || !this._yasuo) return;
    // E 질풍검 돌진: Spell3 재생과 동시에 실제 월드 좌표를 연속 보간한다.
    if (this._yasuo.eDashStart && this._yasuo.eDashEnd && this._yasuo.eDashDuration > 0) {
      this._yasuo.eDashElapsed = Math.min(
        this._yasuo.eDashDuration,
        this._yasuo.eDashElapsed + Math.max(0, dt)
      );
      const t = THREE.MathUtils.smoothstep(
        this._yasuo.eDashElapsed / this._yasuo.eDashDuration, 0, 1
      );
      this.root.position.lerpVectors(this._yasuo.eDashStart, this._yasuo.eDashEnd, t);
      if (this._yasuo.eDashElapsed >= this._yasuo.eDashDuration) {
        this._yasuoFinishEDash();
      }
    }
    this._yasuoTickQ3Tornado(dt);
    this._yasuoQStackTick(); this._yasuoEStackTick(); this._yasuoGainFlowFromMovement(dt);
    if(this._yasuo.windwall && performance.now()>=this._yasuo.windwall.expiresAt)this._yasuo.windwall=null;
    if(this.championId==='yasuo'){ this.stats.critChance=1; this.stats.critMultiplier=this._yasuoCritMultiplier(); this.bonusAD=this._yasuoBonusADFromCrit(); this.recomputeStats(); }
  
};

// Extracted from CharacterController: _yasuoOnTakeDamage
CharacterController.prototype._yasuoOnTakeDamage = function() {  if(this._yasuo.flow>=100){ this.shield=Math.max(this.shield,this._yasuoShieldAmount()); this._yasuo.flow=0; updateBars(this); } 
};

// Extracted from CharacterController: _yasuoPlayPostQMoveEntry
CharacterController.prototype._yasuoPlayPostQMoveEntry = function() { 
    if (this.championId !== 'yasuo' || !this._yasuo?.qMoveEntryPending) return false;
    if (!this.targetPos) return false;
    const clip = this.findAnimation('Run1_IN_Raw');
    if (!clip) { this._yasuo.qMoveEntryPending = false; return false; }
    this._yasuo.qMoveEntryPending = false;
    this._beginTransientMoveClip('Run1_IN_Raw');
    this.crossFadeTo(['Run1_IN_Raw'], { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
    const t = setTimeout(() => {
      this._endTransientMoveClip('Run1_IN_Raw');
      if (this.state === STATE.MOVE && this.targetPos) this.playFirstAvailable(['Run1_Raw'], { loop: THREE.LoopRepeat, fade: 0.08 });
    }, Math.max(0, clip.duration - 0.02) * 1000);
    this._actionTimers.push(t);
    return true;
  
};

