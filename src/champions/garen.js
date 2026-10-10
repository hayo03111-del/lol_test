// Extracted from CharacterController: _garenPassiveTick
CharacterController.prototype._garenPassiveTick = function(dt) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'garen' || this.state === STATE.DEAD) return;
    const p = cd.passive;
    const now = performance.now();
    // 버그 수정(멀티플레이 대비): 지금까지 "피해를 입은 시점"만 확인했다 -
    // 패시브 설명이 명시하는 "적 스킬에 맞지 않으면"(피해가 0이어도 CC 등
    // 적대적 스킬에 맞으면 리셋)은 lastEnemySkillHitAt 필드가 있었음에도
    // 실제로는 아무도 갱신하지 않아 죽은 필드였다. 이제 applyStatus()에서
    // CC 계열 효과가 걸릴 때마다 이 필드를 갱신하므로(위 CC_TYPES 처리부
    // 참고), 두 시점 중 더 최근 것을 기준으로 무피해 타이머를 판정한다.
    const lastInterrupt = Math.max(this.passiveState.lastDamageTakenAt || 0, this.passiveState.lastEnemySkillHitAt || 0);
    const sinceHit = (now - lastInterrupt) / 1000;
    if (sinceHit < p.noDamageWindow) { this.passiveState._nextHealAt = null; return; }
    if (this.hp <= 0 || this.hp >= this.maxHp) return;
    if (!this.passiveState._nextHealAt) this.passiveState._nextHealAt = now + p.tickInterval * 1000;
    if (now >= this.passiveState._nextHealAt) {
      const pct = skillVal(p.healPercentByLevel, this.champLevel) / 100;
      // 그리버스 치유 감소(QA 버그 수정).
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * pct * (1 - getGrievousPercent(this)));
      updateBars(this);
      this.passiveState._nextHealAt = now + p.tickInterval * 1000;
    }
  
};

// Extracted from CharacterController: _garenQOnCast
CharacterController.prototype._garenQOnCast = function() { 
    const cd = this._champData(); if (!cd) return;
    const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    const dur = skillVal(q.moveSpeedDurationByLevel, lvl);
    this.statusEffects = this.statusEffects.filter((e) => e.type !== 'SLOW'); // 둔화 제거
    applyStatus(this, { id: 'garenQ_ms', type: 'MS_BUFF', duration: dur, value: q.moveSpeedBonusPercent / 100 });
  
};

// Extracted from CharacterController: _garenQOnHit
CharacterController.prototype._garenQOnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    const dmg = skillVal(q.damageByLevel, lvl) + q.adRatio * this.stats.attackDamage;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
    applyStatus(target, { id: 'garenQ_silence', type: 'SILENCE', duration: q.silenceDuration, value: 1 });
  
};

// Extracted from CharacterController: _garenWOnCast
CharacterController.prototype._garenWOnCast = function() { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    applyStatus(this, { id: 'garenW_dr', type: 'DAMAGE_REDUCTION', duration: w.reductionDuration, value: skillVal(w.damageReductionPercentByLevel, lvl) / 100 });
    const shieldAmt = skillVal(w.shieldBaseByLevel, lvl) + this.maxHp * (w.shieldBonusHpPercent / 100);
    // W가 다른 보호막을 덮어쓴 뒤 종료될 때 타 보호막까지 같이 깎지 않도록
    // 시전 직전의 기존 보호막 값을 기준선으로 보존한다. W 종료 시점에
    // 기준선보다 늘어난 양에서만 W가 만든 보호막을 제거한다.
    const shieldBefore = Math.max(0, this.shield || 0);
    const appliedShield = Math.max(0, shieldAmt - shieldBefore);
    this.shield = Math.max(this.shield, shieldAmt);
    const dur = w.shieldDuration;
    this._garenWShieldToken = (this._garenWShieldToken || 0) + 1;
    const token = this._garenWShieldToken;
    clearTimeout(this._garenWShieldTimer);
    // 버그 수정(전체 시스템 감사): 기존 토큰(_garenWShieldToken) 검사는
    // "가렌이 W를 다시 썼는지"만 확인하고 챔피언이 아예 바뀌었는지는
    // 확인하지 않았다. applyChampionData()가 이 타이머를 정리하지 않으므로,
    // 가렌 W 보호막이 떠 있는 도중 다른 챔피언으로 바꾸면 이 타이머가
    // 그대로 실행돼 새 챔피언의 현재 shield 값에서 가렌의 보호막 양만큼
    // 임의로 빼버릴 수 있었다(예: 가렌->세트 교체 후 세트 W 보호막이 떠
    // 있는 도중). championId 확인을 추가해 가렌이 아니면 아무것도 하지
    // 않도록 최소 범위로 수정.
    this._garenWShieldTimer = setTimeout(() => {
      if (this._garenWShieldToken !== token || this.championId !== 'garen') return;
      if (appliedShield > 0) this.shield = Math.max(0, this.shield - Math.min(appliedShield, this.shield));
      this._garenWShieldTimer = null;
    }, dur * 1000);
  
};

// Extracted from CharacterController: _garenOnTakedown
CharacterController.prototype._garenOnTakedown = function() { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    this.bonusArmor = Math.min(w.onTakedownCap, (this.bonusArmor || 0) + w.onTakedownArmor);
    this.bonusMr = Math.min(w.onTakedownCap, (this.bonusMr || 0) + w.onTakedownMr);
    this.recomputeStats();
  
};

// Extracted from CharacterController: _garenROnHit
CharacterController.prototype._garenROnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const r = cd.R;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    const base = skillVal(r.baseDamageByLevel, lvl);
    const missingPct = skillVal(r.missingHpPercentByLevel, lvl) / 100;
    const missingHp = Math.max(0, (target.maxHp || 0) - (target.hp || 0));
    const dmg = base + missingHp * missingPct;
    const killed = target.hp > 0 && target.hp <= dmg;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 });
    if (killed) this._garenOnTakedown();
  
};

