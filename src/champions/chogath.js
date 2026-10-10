// Extracted from CharacterController: _chogathOnKill
CharacterController.prototype._chogathOnKill = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const p = cd.passive;
    const heal = p.healBase + p.healPerLevel * this.champLevel;
    const mana = p.manaBase + p.manaPerLevel * this.champLevel;
    // 그리버스 치유 감소(QA 버그 수정) - 마나는 영향받지 않는다(실제 LoL과 동일).
    this.hp = Math.min(this.maxHp, this.hp + heal * (1 - getGrievousPercent(this)));
    this.mp = Math.min(this.maxMp, this.mp + mana);
    updateBars(this);
    debugSkillHit("Cho'Gath passive (육식)", target, { heal: Math.round(heal), mana: Math.round(mana) });
  
};

// Extracted from CharacterController: _chogathCastQ
CharacterController.prototype._chogathCastQ = function(mouseWorldPoint, free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this.canStartNewAction()) return;
    if (!this._payCost('Q', free)) return;
    const cd = this._champData(); const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    this._clearActionTimers();
    this.setState(STATE.Q_CAST);
    this.currentActionKey = 'chogathQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
    this.playFirstAvailable((this.actionData?.qForward?.clips) || ['Spell1'], { loop: THREE.LoopOnce, fade: 0.08 });
    const origin = this.root.position.clone();
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, origin).setY(0) : (this.moveDir.lengthSq() > 0 ? this.moveDir.clone() : new THREE.Vector3(0, 0, 1));
    const rawDist = dir.length();
    if (rawDist > 1e-4) dir.normalize(); else dir.set(0, 0, 1);
    const impactPoint = origin.clone().addScaledVector(dir, Math.min(rawDist, lolRangeToWorld(q.range)));
    vfx.spawn('q', origin);
    const actionSafety = setTimeout(() => {
      if (this.championId !== 'chogath' || this.currentActionKey !== 'chogathQ') return;
      console.warn('[ACTION SAFETY] chogath Q stale lock cleared');
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this._resumeAfterAction();
    }, (q.castTime + q.impactDelay + 0.75) * 1000);
    this._actionTimers.push(actionSafety);
    const t = setTimeout(() => {
      // 정확한 파열 폭발 반경이 기획안에 없어(사거리 950은 "시전 가능
      // 거리") 근접 판정 반경(200)으로 근사한다 - 섹션 18 원칙에 따라
      // 새 피해 수치를 만들지는 않았고, 오직 판정 반경만 근사치다.
      const hits = findEnemiesInRadius(impactPoint, 200);
      if (hits.length) {
        for (const h of hits) {
          const dmg = skillVal(q.damageByLevel, lvl) + q.apRatio * this.stats.abilityPower;
          const wouldKill = h.unit.hp > 0 && h.unit.hp <= dmg;
          applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          applyStatus(h.unit, { id: 'chogathQ_knockup', type: 'STUN', duration: q.knockupDuration, value: 1 });
          const unit = h.unit;
          setTimeout(() => { if (unit.hp > 0) applyStatus(unit, { id: 'chogathQ_slow', type: 'SLOW', duration: q.slowDuration, value: q.slowPercent / 100 }); }, q.knockupDuration * 1000);
          if (wouldKill) this._chogathOnKill(h.unit);
        }
        debugSkillHit("Cho'Gath Q", hits[0].unit, { count: hits.length });
      } else debugSkillMiss("Cho'Gath Q", 'no target in impact area');
      this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      this._resumeAfterAction();
    }, (q.castTime + q.impactDelay) * 1000);
    this._actionTimers.push(t);
  
};

// Extracted from CharacterController: _chogathCastW
CharacterController.prototype._chogathCastW = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this.canStartNewAction()) return;
    if (!this._payCost('W', free)) return;
    const cd = this._champData(); const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    this._clearActionTimers();
    this.setState(STATE.W_CAST);
    this.currentActionKey = 'chogathW'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
    this.playFirstAvailable((this.actionData?.w?.clips) || ['Spell2'], { loop: THREE.LoopOnce, fade: 0.08 });
    // _castW는 mouseWorldPoint를 받지 않는 슬롯이라(다른 챔피언 W는 방향이
    // 필요 없음) 초가스는 현재 바라보는 방향(정면)을 부채꼴 중심으로 쓴다.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    vfx.spawn('w', this.root.position.clone());
    const t = setTimeout(() => {
      const hits = findEnemiesInRadius(this.root.position, w.range, { forward, maxAngleDeg: w.coneAngleDeg / 2 });
      if (hits.length) {
        for (const h of hits) {
          const dmg = skillVal(w.damageByLevel, lvl) + w.apRatio * this.stats.abilityPower;
          const wouldKill = h.unit.hp > 0 && h.unit.hp <= dmg;
          applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          applyStatus(h.unit, { id: 'chogathW_silence', type: 'SILENCE', duration: skillVal(w.silenceDurationByLevel, lvl), value: 1 });
          if (wouldKill) this._chogathOnKill(h.unit);
        }
        debugSkillHit("Cho'Gath W", hits[0].unit, { count: hits.length });
      } else debugSkillMiss("Cho'Gath W", 'no target in cone');
      this.currentActionKey = null; this.currentPhase = null;
      this._resumeAfterAction();
    }, 250); // 정확한 Cast Time이 기획안에 명시되어 있지 않아 짧은 판정 지연만 둔다
    this._actionTimers.push(t);
  
};

// Extracted from CharacterController: _chogathCastE
CharacterController.prototype._chogathCastE = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this._payCost('E', free)) return;
    this._chogath.eChargesRemaining = this._champData().E.charges;
    vfx.spawn('e', this.root.position.clone());
    debugSkillHit("Cho'Gath E (활성화)", this, { charges: this._chogath.eChargesRemaining });
  
};

// Extracted from CharacterController: _chogathEOnHit
CharacterController.prototype._chogathEOnHit = function(target) { 
    if (!this._chogath.eChargesRemaining || this._chogath.eChargesRemaining <= 0) return;
    const cd = this._champData(); const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    const stacks = this._chogath.predationStacks || 0;
    const dmg = skillVal(e.perHitDamageByLevel, lvl) + e.apRatio * this.stats.abilityPower
      + (target.maxHp || 0) * ((skillVal(e.perHitMaxHpPercentByLevel, lvl) + e.perStackMaxHpPercent * stacks) / 100);
    const wouldKill = target.hp > 0 && target.hp <= dmg;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
    applyStatus(target, { id: 'chogathE_slow', type: 'SLOW', duration: e.slowDuration, value: skillVal(e.slowPercentByLevel, lvl) / 100 });
    if (wouldKill) this._chogathOnKill(target);
    this._chogath.eChargesRemaining -= 1;
    debugSkillHit("Cho'Gath E (가시)", target, { chargesLeft: this._chogath.eChargesRemaining });
  
};

// Extracted from CharacterController: _chogathROnHit
CharacterController.prototype._chogathROnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const r = cd.R;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    const isChampionTarget = !target.isMonster;
    const bonusHp = Math.max(0, (this.maxHp || 0) - CHAMPION_DATA.chogath.stats.hp);
    const dmg = isChampionTarget
      ? skillVal(r.championDamageByLevel, lvl) + r.championApRatio * this.stats.abilityPower + r.championBonusHpRatio * bonusHp
      : r.nonChampionDamage + r.nonChampionApRatio * this.stats.abilityPower + r.nonChampionBonusHpRatio * bonusHp;
    const wouldKill = target.hp > 0 && target.hp <= dmg;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 });
    if (wouldKill) {
      this._chogath.predationStacks = (this._chogath.predationStacks || 0) + 1;
      this.bonusMaxHp = (this.bonusMaxHp || 0) + skillVal(r.hpGrowthByLevel, lvl);
      this.recomputeStats();
      this._chogathOnKill(target);
      debugSkillHit("Cho'Gath R (처치)", target, { stacks: this._chogath.predationStacks });
    }
  
};

// Extracted from CharacterController: _chogathCastR
CharacterController.prototype._chogathCastR = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this.canStartNewAction()) return;
    if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss("Cho'Gath R", 'no currentTarget selected'); return; }
    const cd = this._champData(); const r = cd.R;
    const range = r.rangeBase + r.rangePerStack * (this._chogath.predationStacks || 0);
    if (!isInRange(this, this.currentTarget, range)) { debugSkillMiss("Cho'Gath R", 'out of range'); return; }
    if (!this._payCost('R', free)) return;
    vfx.spawn('r', this.root.position.clone());
    this._chogathROnHit(this.currentTarget);
  
};

