// Extracted from CharacterController: _playLeeSinClip
CharacterController.prototype._playLeeSinClip = function(names, options = {}) { 
    if (this.championId !== 'leesin') return false;
    const candidates = Array.isArray(names) ? names : [names];
    const valid = candidates.filter(Boolean);
    if (!valid.length) return false;
    const clip = valid.map((n) => this.findAnimation(n)).find(Boolean);
    if (!clip) return false;
    this.playFirstAvailable(valid, { loop: THREE.LoopOnce, clampWhenFinished: false, fade: options.fade ?? 0.08 });
    return true;
  
};

// Extracted from CharacterController: _queueLeeSinReturnClip
CharacterController.prototype._queueLeeSinReturnClip = function(names, delayNames) { 
    const valid = (Array.isArray(names) ? names : [names]).filter(Boolean);
    const delayValid = (Array.isArray(delayNames) ? delayNames : [delayNames]).filter(Boolean);
    const returnClip = valid.map((n) => this.findAnimation(n)).find(Boolean);
    const delayClip = delayValid.map((n) => this.findAnimation(n)).find(Boolean);
    if (!returnClip || !delayClip) return;
    this._clearLeeSinAnimTimer();
    const delay = Math.max(0.05, delayClip.duration) * 1000;
    this._leesinAnimTimer = setTimeout(() => {
      if (this.championId === 'leesin' && !this.currentActionKey) {
        this._playLeeSinClip(valid);
      }
      this._leesinAnimTimer = null;
    }, delay);
    this._actionTimers.push(this._leesinAnimTimer);
  
};

// Extracted from CharacterController: _clearLeeSinAnimTimer
CharacterController.prototype._clearLeeSinAnimTimer = function() { 
    if (this._leesinAnimTimer) {
      clearTimeout(this._leesinAnimTimer);
      this._leesinAnimTimer = null;
    }
  
};

// Extracted from CharacterController: _playLeeSinLockedClip
CharacterController.prototype._playLeeSinLockedClip = function(actionKey, names) { 
    this._clearLeeSinAnimTimer();
    const valid = (Array.isArray(names) ? names : [names]).filter(Boolean);
    const clip = valid.map((n) => this.findAnimation(n)).find(Boolean);
    if (!clip) return false;
    this.currentActionKey = actionKey;
    this.currentPhase = 'ACTIVE';
    this.phaseCancelable = false;
    this.setState(STATE.E_CAST);
    this.playFirstAvailable(valid, { loop: THREE.LoopOnce, clampWhenFinished: false, fade: 0.08 });
    this._leesinAnimTimer = setTimeout(() => {
      this._leesinAnimTimer = null;
      if (this.championId !== 'leesin' || this.currentActionKey !== actionKey) return;
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this._resumeAfterAction();
    }, Math.max(0.05, clip.duration) * 1000);
    this._actionTimers.push(this._leesinAnimTimer);
    return true;
  
};

// Extracted from CharacterController: _leesinOnSkillUsed
CharacterController.prototype._leesinOnSkillUsed = function() { 
    const cd = this._champData(); if (!cd) return;
    applyStatus(this, { id: 'leesinPassive_as', type: 'MASTERYI_R_AS', duration: 8, value: cd.passive.attackSpeedBonusPercent / 100 });
    this._leesin.passiveHitsLeft = 2;
  
};

// Extracted from CharacterController: _leesinOnBasicAttackHit
CharacterController.prototype._leesinOnBasicAttackHit = function() { 
    if (!this._leesin.passiveHitsLeft || this._leesin.passiveHitsLeft <= 0) return;
    const cd = this._champData(); const p = cd.passive;
    const table = this._leesin.passiveHitsLeft === 2 ? p.energyByLevelBreakpoints1 : p.energyByLevelBreakpoints2;
    const restore = valueByBreakpoints(table, this.champLevel);
    this.mp = Math.min(this.maxMp, this.mp + restore);
    this._leesin.passiveHitsLeft -= 1;
    if (this._leesin.passiveHitsLeft <= 0) clearStatus(this, 'leesinPassive_as');
    updateBars(this);
    // 강철의 의지(W 재시전) 활성 중이면 평타로 입힌 피해의 일부만큼 흡혈.
    if (hasStatus(this, 'LEESIN_W_VAMP')) {
      const st = getStatus(this, 'leesinW_vamp');
      // 그리버스 치유 감소(QA 버그 수정) - 흡혈 계열 효과도 적용 대상.
      if (st) { this.hp = Math.min(this.maxHp, this.hp + this.stats.attackDamage * st.value * (1 - getGrievousPercent(this))); updateBars(this); }
    }
  
};

// Extracted from CharacterController: _leesinCastQ
CharacterController.prototype._leesinCastQ = function(mouseWorldPoint, free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const q = cd.Q;
    const now = performance.now();
    if (this._leesin.qMarkTarget && now < this._leesin.qMarkExpiresAt) {
      // Q 2타(공명의 일격) - 버그 수정: canStartNewAction()에 걸어두면 평타
      // RECOVERY 등 사소한 행동 상태 때문에 재시전 입력이 조용히 씹힐 수
      // 있었다(모데카이저 W와 동일한 문제). 재시전은 자체적으로 어떤
      // 애니메이션/행동 상태도 점유하지 않으므로 이 게이트가 필요 없다.
      const target = this._leesin.qMarkTarget;
      // 표식 대상이 죽었거나 제거된 경우 재시전은 성립하지 않는다.
      // 기존 코드는 로그만 남기고 아래 피해/돌진 로직까지 계속 진행해 죽은 대상에게
      // Q2를 적용하는 비정상 경로가 있었다. 표식을 먼저 지우고 비용도 소비하지 않는다.
      if (!target || target.hp <= 0 || target.destroyed || target.isDead) {
        this._leesin.qMarkTarget = null;
        this._leesin.qMarkExpiresAt = 0;
        debugSkillMiss('Lee Sin Q (재시전)', '표식 대상이 유효하지 않음');
        return;
      }
      this._clearLeeSinAnimTimer();
      this._playLeeSinClip(['Spell1_B.ASU_LeeSin.anm', 'Spell1_B.ASU_LeeSin,anm']);
      if (!free && this.mp < q.energy2) { debugSkillMiss('Lee Sin Q (재시전)', '기력 부족'); return; }
      if (!free) { this.mp -= q.energy2; updateBars(this); }
      const lvl = Math.max(1, this.skillLevels.Q || 1);
      const lostPercent = target.maxHp ? Math.max(0, (target.maxHp - target.hp) / target.maxHp) : 0;
      const base = skillVal(q.damageByLevel, lvl) + q.bonusAdRatio * this._getBonusAD();
      const max = skillVal(q.maxDamageByLevel, lvl) + q.maxBonusAdRatio * this._getBonusAD();
      const dmg = base + (max - base) * lostPercent;
      // 대상 위치로 실제 돌진(순간이동 스냅이 아니라 짧은 시간에 걸친 실제
      // 이동 - tickPullEffects의 플레이어용 대시 트윈을 재사용한다).
      const dir = new THREE.Vector3().subVectors(target.mesh.position, this.root.position); dir.y = 0;
      if (dir.length() > 0.05) {
        dir.normalize();
        // Q 2타(공명의 일격) 돌진 시 실제로 날아가는 방향을 바라보도록
        // 챔피언 루트의 Y 회전을 돌진 방향과 일치시킨다.
        this.root.rotation.y = Math.atan2(dir.x, dir.z);
        const to = target.mesh.position.clone().addScaledVector(dir, -this.collisionRadius * 2);
        this._dashState = { from: this.root.position.clone(), to, duration: 0.35, elapsed: 0, faceDir: dir.clone() };
      }
      applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
      this._leesinOnSkillUsed();
      this._leesin.qMarkTarget = null;
      debugSkillHit('Lee Sin Q (공명의 일격)', target, { lostPercent: Math.round(lostPercent * 100) });
      return;
    }
    if (!this.canStartNewAction()) return;
    const origin = this.root.position.clone();
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, origin).setY(0) : (this.currentTarget ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, origin).setY(0) : (this.moveDir.lengthSq() > 0 ? this.moveDir.clone() : new THREE.Vector3(0, 0, 1)));
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    if (!free && this.mp < q.energy1) { debugSkillMiss('Lee Sin Q', '기력 부족'); return; }
    if (!free) { this.mp -= q.energy1; this.cooldowns.Q = abilityHasteCooldown(this, skillVal(q.cooldown, Math.max(1, this.skillLevels.Q || 1))); updateBars(this); }
    // Q 음파 시전 순간, 투사체가 날아가는 방향을 즉시 바라본다.
    // 마우스 커서로 계산한 dir과 동일한 방향을 사용하므로 모델의 정면과
    // 실제 음파 투사 방향이 항상 일치한다.
    this.faceDirectionInstant(dir);
    this._clearLeeSinAnimTimer();
    this._playLeeSinClip(['Spell1']);
    this._queueLeeSinReturnClip(['Spell1_Toldle'], ['Spell1']);
    // Q 음파는 마우스 커서가 가리키는 방향으로 실제 투사체가 날아간다.
    // 먼저 직선상 첫 적중 대상을 찾고, 대상이 있으면 그 대상까지의 거리만
    // 투사체가 이동하도록 해서 관통하지 않고 적중 순간 사라지게 한다.
    const hitUnit = findFirstInLine(origin, dir, q.range1, BASE_UNIT * 0.6);
    let impactDistance = null;
    if (hitUnit) {
      const toHit = new THREE.Vector3().subVectors(hitUnit.mesh.position, origin);
      toHit.y = 0;
      impactDistance = Math.min(q.range1, toHit.dot(dir));
    }
    vfx.spawn('q', origin, dir, { projectile: true, range: q.range1, speed: 24, impactDistance });
    if (hitUnit) {
      const lvl = Math.max(1, this.skillLevels.Q || 1);
      const dmg = skillVal(q.damageByLevel, lvl) + q.bonusAdRatio * this._getBonusAD();
      // 화면의 음파가 대상까지 실제로 날아간 뒤에만 피해/표식을 적용한다.
      // 기존에는 투사체 VFX를 생성한 직후 즉시 applyDamage()를 호출해서
      // '아직 음파가 도착하지 않았는데 이미 피해를 받은' 판정 불일치가 있었다.
      const travelDistance = Math.max(0.05, impactDistance ?? q.range1);
      const travelTimeMs = (travelDistance / 24) * 1000;
      const impactTimer = setTimeout(() => {
        if (this.championId !== 'leesin' || !hitUnit || hitUnit.hp <= 0 || hitUnit.destroyed || hitUnit.isDead) return;
        applyDamage(hitUnit, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
        if (hitUnit.hp > 0) {
          this._leesinOnSkillUsed();
          this._leesin.qMarkTarget = hitUnit;
          this._leesin.qMarkExpiresAt = performance.now() + q.markDuration * 1000;
          debugSkillHit('Lee Sin Q (음파)', hitUnit);
        }
      }, travelTimeMs);
      this._actionTimers.push(impactTimer);
    } else debugSkillMiss('Lee Sin Q (음파)', 'no target in line');
  
};

// Extracted from CharacterController: _leesinCastW
CharacterController.prototype._leesinCastW = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const w = cd.W;
    const now = performance.now();
    if (now < this._leesin.wMarkReadyUntil) {
      // W 2타(강철의 의지) - 재시전은 canStartNewAction() 게이트 없이 항상
      // 받는다(모데카이저 W와 동일한 이유: 재시전은 별도 행동을 점유하지
      // 않는다).
      this._clearLeeSinAnimTimer();
      // 강철의 의지는 모션 없음. 재시전 입력 시 현재 애니메이션을 강제로 바꾸지 않는다.
      if (!free && this.mp < w.energy2) { debugSkillMiss('Lee Sin W (재시전)', '기력 부족'); return; }
      if (!free) { this.mp -= w.energy2; updateBars(this); }
      const lvl = Math.max(1, this.skillLevels.W || 1);
      applyStatus(this, { id: 'leesinW_vamp', type: 'LEESIN_W_VAMP', duration: w.lifestealDuration, value: skillVal(w.lifestealPercentByLevel, lvl) / 100 });
      this._leesinOnSkillUsed();
      this._leesin.wMarkReadyUntil = 0;
      debugSkillHit('Lee Sin W (강철의 의지)', this);
      return;
    }
    if (!this.canStartNewAction()) return;
    if (!free && this.mp < w.energy1) { debugSkillMiss('Lee Sin W', '기력 부족'); return; }
    if (!free) { this.mp -= w.energy1; this.cooldowns.W = abilityHasteCooldown(this, w.cooldown); updateBars(this); }
    this._clearLeeSinAnimTimer();
    this._playLeeSinClip(['Spell2']);
    this._queueLeeSinReturnClip(['Spell2_Toldle'], ['Spell2']);
    vfx.spawn('w', this.root.position.clone());
    this._leesinOnSkillUsed();
    this._leesin.wMarkReadyUntil = now + w.markDuration * 1000;
    debugSkillHit('Lee Sin W (방호, 대상 아군 없음 - 재시전 창만 활성화)', this);
  
};

// Extracted from CharacterController: _leesinCastE
CharacterController.prototype._leesinCastE = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const e = cd.E;
    const now = performance.now();
    if (this._leesin.eMarkHits.length && now < this._leesin.eMarkExpiresAt) {
      // 재시전(무력화) - 마찬가지로 canStartNewAction() 게이트 없음.
      // 무력화는 별도 모션 없음.
      if (!free && this.mp < e.energy2) { debugSkillMiss('Lee Sin E (재시전)', '기력 부족'); return; }
      if (!free) { this.mp -= e.energy2; updateBars(this); }
      const lvl = Math.max(1, this.skillLevels.E || 1);
      for (const unit of this._leesin.eMarkHits) {
        if (unit.hp > 0) applyStatus(unit, { id: 'leesinE_slow', type: 'SLOW', duration: e.slowDuration, value: skillVal(e.slowPercentByLevel, lvl) / 100 });
      }
      this._leesinOnSkillUsed();
      debugSkillHit('Lee Sin E (무력화)', this._leesin.eMarkHits[0], { count: this._leesin.eMarkHits.length });
      this._leesin.eMarkHits = [];
      return;
    }
    if (!this.canStartNewAction()) return;
    if (!free && this.mp < e.energy1) { debugSkillMiss('Lee Sin E', '기력 부족'); return; }
    if (!free) { this.mp -= e.energy1; this.cooldowns.E = abilityHasteCooldown(this, e.cooldown); updateBars(this); }
    this._clearLeeSinAnimTimer();
    this._playLeeSinLockedClip('leesinE', ['Spell3']);
    vfx.spawn('e', this.root.position.clone());
    const hits = findEnemiesInRadius(this.root.position, e.range);
    if (hits.length) {
      const lvl = Math.max(1, this.skillLevels.E || 1);
      for (const h of hits) {
        const dmg = skillVal(e.damageByLevel, lvl) + e.adRatio * this.stats.attackDamage;
        applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
      }
      this._leesin.eMarkHits = hits.map((h) => h.unit);
      this._leesin.eMarkExpiresAt = now + e.markDuration * 1000;
      this._leesinOnSkillUsed();
      debugSkillHit('Lee Sin E (폭풍)', hits[0].unit, { count: hits.length });
    } else debugSkillMiss('Lee Sin E (폭풍)', 'no target in range');
  
};

// Extracted from CharacterController: _leesinCastR
CharacterController.prototype._leesinCastR = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this.canStartNewAction()) return;
    if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss('Lee Sin R', 'no currentTarget selected'); return; }
    const cd = this._champData(); const r = cd.R;
    if (!isInRange(this, this.currentTarget, r.range)) { debugSkillMiss('Lee Sin R', 'out of range'); return; }
    if (!this._payCost('R', free)) return;
    const target = this.currentTarget;
    this._clearLeeSinAnimTimer();
    this._playLeeSinLockedClip('leesinR', ['Spell4']);
    const lvl = Math.max(1, this.skillLevels.R || 1);
    const dmg = skillVal(r.damageByLevel, lvl) + r.bonusAdRatio * this._getBonusAD();
    vfx.spawn('r', this.root.position.clone());
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
    applyStatus(target, { id: 'leesinR_air', type: 'KNOCKUP', duration: r.airborneDuration, value: 1 });
    // 실제 넉백: 시전자 반대 방향으로 knockbackDistance만큼 좌표 이동(요청:
    // "이펙트만 표시되고 위치가 그대로면 인정 안 함" - Mordekaiser E와 동일한
    // 범용 tickPullEffects 트윈을 밀어내는 방향으로 재사용).
    const from = target.mesh.position.clone();
    const dir = new THREE.Vector3().subVectors(from, this.root.position); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    const pullDist = lolRangeToWorld(r.knockbackDistance); // 버그 수정: 예전엔 /10 같은 임시 배율을 이 스킬에서만 따로 썼다 - 이제 공통 변환 함수 하나로 통일
    const to = from.clone().addScaledVector(dir, pullDist);
    target._pullState = { from, to, duration: r.airborneDuration, elapsed: 0 };
    debugSkillHit('Lee Sin R', target, { pullDistWorld: pullDist.toFixed(2) });
  
};

