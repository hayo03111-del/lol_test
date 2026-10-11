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
      // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소).
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * pct * getHealReceivedMultiplier(this));
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
    // 버그 수정(원작 대조): 보호막 계수는 "추가 체력"의 18%다. 예전엔 최대
    // 체력 전체(기본 체력 포함)를 곱해 아이템이 없어도 보호막이 크게 부풀었다.
    const shieldAmt = (skillVal(w.shieldBaseByLevel, lvl) + this._garenBonusHp() * (w.shieldBonusHpPercent / 100)) * getShieldReceivedMultiplier(this);
    // 같은 0.75초 동안 강인함 60%(공용 TENACITY 상태 - applyStatus가 CC 지속시간 계산에 반영).
    if (w.tenacityPercent) applyStatus(this, { id: 'garenW_tenacity', type: 'TENACITY', duration: w.tenacityDuration, value: w.tenacityPercent / 100 });
    // 버그 수정(원작 규칙): 보호막끼리는 "합산"된다. 예전엔 max(기존, W)로 덮어써서 다른
    // 보호막이 있으면 W 보호막이 일부/전부 사라졌다. 이제 W 몫을 더하고, 종료 시 W 몫만
    // 걷어낸다(재시전 시 이전 W 몫은 먼저 제거 - 중첩 금지).
    if (this._garenWShieldApplied > 0 && this._garenWShieldTimer) {
      this.shield = Math.max(0, (this.shield || 0) - Math.min(this._garenWShieldApplied, this.shield || 0));
    }
    const appliedShield = shieldAmt;
    this.shield = Math.max(0, this.shield || 0) + appliedShield;
    this._garenWShieldApplied = appliedShield;
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
      this._garenWShieldTimer = null; this._garenWShieldApplied = 0;
    }, dur * 1000);
  
};

// 추가 체력 = 현재 최대 체력 - 현재 레벨의 기본 최대 체력(아이템/버프로 늘어난 몫).
CharacterController.prototype._garenBonusHp = function() {
    const base = typeof computeChampionStats === 'function' ? computeChampionStats('garen', this.champLevel) : null;
    return Math.max(0, (this.maxHp || 0) - (base ? base.maxHp : (this.maxHp || 0)));
};

// W(용기) 패시브: 가렌이 유닛을 처치할 때마다 방어력/마법 저항력이 영구히 오른다.
// 예전엔 R(데마시아의 정의)로 처치했을 때만 불렸다 - 원작은 평타/Q/E/R 무엇으로든
// 미니언/몬스터/챔피언을 처치하면 쌓인다. 이제 공용 처치 지점(applyDamage의 처형
// 판정, killMinion)에서 호출한다.
CharacterController.prototype._garenOnTakedown = function() { 
    const cd = this._champData(); if (!cd || this.championId !== 'garen') return;
    const w = cd.W;
    // 상한(30)은 "용기 스택"에만 건다 - bonusArmor/bonusMr는 다른 효과(모데카이저 R
    // 훔친 스탯 등)와 공유하는 필드라, 거기에 바로 min(30)을 걸면 다른 출처 몫까지 잘린다.
    const prev = this._garenCourageStacks || 0;
    const next = Math.min(w.onTakedownCap, prev + w.onTakedownArmor);
    const gain = next - prev;
    if (gain <= 0) return;
    this._garenCourageStacks = next;
    this.bonusArmor = (this.bonusArmor || 0) + gain;
    this.bonusMr = (this.bonusMr || 0) + gain * (w.onTakedownMr / w.onTakedownArmor);
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
    // W 패시브 처치 스택은 applyDamage()의 공용 처치 판정에서 쌓인다(여기서 따로 부르면 이중 적립).
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 });
  
};

// E(심판) 회전 중 R(데마시아의 정의): 회전 상태(eChannel)는 그대로 두고, 시전 시간(0.435초) 뒤
// 고정 대상에게 피해를 준다. 사거리/대상/비용 검사는 일반 R과 같다.
CharacterController.prototype._garenCastRDuringE = function() {
    const cd = this._champData(); if (!cd) return;
    const target = this.currentTarget;
    if (!target || target.hp <= 0) { debugSkillMiss('R', 'no currentTarget selected'); return; }
    if (isSilenced(this)) return;
    if (!isInRange(this, target, cd.R.range)) { debugSkillMiss('R', `out of range (R range ${cd.R.range})`); return; }
    if (!this._payCost('R', false)) return;
    const timing = (typeof SKILL_TIMING_DATABASE !== 'undefined' && SKILL_TIMING_DATABASE.garen && SKILL_TIMING_DATABASE.garen.R) || null;
    const delay = (timing && timing.eventTime) || cd.R.castTime || 0.435;
    const t = setTimeout(() => {
      if (this.championId !== 'garen' || !target || target.hp <= 0) return;
      vfx.spawn('r', this.root.position.clone());
      this._garenROnHit(target);
      debugSkillHit('Garen R (회전 중)', target);
    }, delay * 1000);
    void t; // 회전이 끝나거나 다른 행동을 해도 이미 시전한 R은 취소되지 않는다
};
