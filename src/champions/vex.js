// Extracted from CharacterController: _vexClearRRecast
CharacterController.prototype._vexClearRRecast = function() { 
    if (!this._vex) return;
    this._vex.recastTarget = null;
    this._vex.recastReadyUntil = 0;
    this._vex.dashActive = false;
    this._vex.dashStart = null;
    this._vex.dashEnd = null;
    this._vex.dashT = 0;
    this._vex.dashDuration = 0.28;
  
};

// Extracted from CharacterController: _vexCastR
CharacterController.prototype._vexCastR = function(free = false) { 
    const cd = this._champData();
    const rd = cd && cd.R;
    if (!rd) return;
    const lvl = Math.max(1, Math.min(3, this.skillLevels.R || 1));
    const now = performance.now();

    // 2차 그림자 파동: 1차 적중 대상에게 실제로 돌진한다. 재시전은 추가 마나/쿨다운을 지불하지 않는다.
    if (!free && this._vex.recastTarget && now < this._vex.recastReadyUntil) {
      const target = this._vex.recastTarget;
      if (!target || target.hp <= 0 || target.isDead || target.destroyed) {
        this._vexClearRRecast();
        return;
      }
      this._clearActionTimers();
      const start = this.root.position.clone();
      const end = getWorldPosition(target)?.clone() || target.mesh.position.clone();
      const dir = new THREE.Vector3().subVectors(end, start); dir.y = 0;
      if (dir.lengthSq() > 1e-6) this.faceDirectionInstant(dir.normalize());
      this._vex.dashActive = true;
      this._vex.dashStart = start;
      this._vex.dashEnd = end;
      this._vex.dashT = 0;
      this._vex.dashDuration = 0.28;
      this.currentActionKey = 'vexRRecast';
      this.currentPhase = 'ACTIVE';
      this.setState(STATE.R_CAST);
      const clip = this.resolveClip(['Spell4']);
      if (clip) this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.08 });
      const hitTimer = setTimeout(() => {
        if (!this._vex.dashActive) return;
        const t = this._vex.recastTarget;
        if (t && t.hp > 0 && !t.isDead && !t.destroyed) {
          const raw = skillVal(rd.recastDamageByLevel, lvl) + (rd.recastApRatio || 0) * (this.stats.abilityPower || 0);
          applyDamage(t, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical:false, critMultiplier:1 });
          vfx.spawn('r', this.root.position.clone());
          debugSkillHit('Vex R Recast', t);
          if (t.hp <= 0) {
            this.cooldowns.R = 0;
            this._vexClearRRecast();
          } else {
            this._vexClearRRecast();
          }
        } else this._vexClearRRecast();
        this.currentActionKey = null; this.currentPhase = null;
        this._resumeAfterAction();
      }, this._vex.dashDuration * 1000);
      this._actionTimers.push(hitTimer);
      return;
    }

    // 1차 그림자 파동: 현재 선택된 대상을 향해 투사체를 발사한다.
    if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss('Vex R', 'no currentTarget selected'); return; }
    const range = skillVal(rd.range, lvl);
    if (!free && !isInRange(this, this.currentTarget, range)) { debugSkillMiss('Vex R', `out of range (${range})`); return; }
    if (!this._payCost('R', free)) return;
    this._clearActionTimers();
    this.currentActionKey = 'vexRCast'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
    this.setState(STATE.R_CAST);
    const target = this.currentTarget;
    const raw = skillVal(rd.damageByLevel, lvl) + (rd.apRatio || 0) * (this.stats.abilityPower || 0);
    const from = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.65, 0));
    projectiles.spawn({
      from,
      target,
      speed: 32,
      damage: raw,
      color: 0x8b5cf6,
      realmId: 'main',
      onHit: (hitTarget) => {
        if (!hitTarget || hitTarget.hp <= 0) return;
        applyDamage(hitTarget, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical:false, critMultiplier:1 });
        vfx.spawn('r', getWorldPosition(hitTarget) || hitTarget.mesh.position.clone());
        debugSkillHit('Vex R', hitTarget);
        if (hitTarget.hp > 0) {
          this._vex.recastTarget = hitTarget;
          this._vex.recastReadyUntil = performance.now() + 4000;
        } else if (rd.resetOnKill) {
          this.cooldowns.R = 0;
          this._vexClearRRecast();
        }
      }
    });
    const clip = this.resolveClip(['Spell4']);
    if (clip) this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.08 });
    const recTimer = setTimeout(() => {
      if (this.currentActionKey === 'vexRCast') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
    }, 250);
    this._actionTimers.push(recTimer);
  
};

// Extracted from CharacterController: _vexUpdateR
CharacterController.prototype._vexUpdateR = function(dt) { 
    if (!this._vex || !this._vex.dashActive) {
      if (this._vex && this._vex.recastReadyUntil && performance.now() >= this._vex.recastReadyUntil) this._vexClearRRecast();
      return;
    }
    this._vex.dashT += dt / Math.max(0.01, this._vex.dashDuration);
    const t = Math.min(1, this._vex.dashT);
    this.root.position.lerpVectors(this._vex.dashStart, this._vex.dashEnd, t);
    if (t >= 1) this._vex.dashActive = false;
  
};

