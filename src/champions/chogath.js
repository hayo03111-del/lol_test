// Extracted from CharacterController: _chogathOnKill
CharacterController.prototype._chogathOnKill = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const p = cd.passive;
    const heal = p.healBase + p.healPerLevel * this.champLevel;
    const mana = p.manaBase + p.manaPerLevel * this.champLevel;
    // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소) - 마나는 영향받지 않는다(실제 LoL과 동일).
    this.hp = Math.min(this.maxHp, this.hp + heal * getHealReceivedMultiplier(this));
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
    this.faceDirectionInstant(dir); // 31차: 지정 지점을 바라보고 시전(예전엔 몸을 돌리지 않았다)
    const impactPoint = origin.clone().addScaledVector(dir, Math.min(rawDist, lolRangeToWorld(q.range)));
    vfx.spawn('q', origin);
    const actionSafety = this._champTimeout(() => {
      if (this.championId !== 'chogath' || this.currentActionKey !== 'chogathQ') return;
      console.warn('[ACTION SAFETY] chogath Q stale lock cleared');
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this._resumeAfterAction();
    }, (q.castTime + q.impactDelay + 0.75) * 1000);
    this._actionTimers.push(actionSafety);
    const t = this._champTimeout(() => {
      // 정확한 파열 폭발 반경이 기획안에 없어(사거리 950은 "시전 가능
      // 거리") 근접 판정 반경(200)으로 근사한다 - 섹션 18 원칙에 따라
      // 새 피해 수치를 만들지는 않았고, 오직 판정 반경만 근사치다.
      const hits = findEnemiesInRadius(impactPoint, q.radius || 250); // PC 위키: 반경 250(예전 200)
      if (hits.length) {
        for (const h of hits) {
          const dmg = skillVal(q.damageByLevel, lvl) + q.apRatio * this.stats.abilityPower;
          const hpB = h.unit.hp, flB = isFlooredTrainingDummy(h.unit);
          const dealt = applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this }) || 0;
          const wouldKill = !flB && hpB > 0 && hpB <= dealt; // 실제 입힌 피해(마법 저항 적용 후) 기준
          applyStatus(h.unit, { id: 'chogathQ_knockup', type: 'KNOCKUP', duration: q.knockupDuration, value: 1 }); // 공중에 뜸(예전엔 기절로 처리)
          const unit = h.unit;
          this._champTimeout(() => { if (unit.hp > 0) applyStatus(unit, { id: 'chogathQ_slow', type: 'SLOW', duration: q.slowDuration, value: q.slowPercent / 100 }); }, q.knockupDuration * 1000);
          if (wouldKill) this._chogathOnKill(h.unit);
        }
        debugSkillHit("Cho'Gath Q", hits[0].unit, { count: hits.length });
      } else debugSkillMiss("Cho'Gath Q", 'no target in impact area');
      if (this.currentActionKey === 'chogathQ') { this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false; this._resumeAfterAction(); }
    }, (q.castTime + q.impactDelay) * 1000);
    // 파열 예고(원작): 시전이 끝나면 착탄 지점(반경 250)에 균열이 보였다가 0.627초 뒤 터진다. PC 위키: 이 연출은
    // 덤불·전장의 안개 안에서도 보인다 → 시야와 무관하게 모두에게 보인다(visibility 'always').
    this._champTimeout(() => {
      if (typeof skillTelegraphs !== 'undefined') skillTelegraphs.spawn({ shape: 'circle', center: impactPoint, radius: q.radius || 250, duration: q.impactDelay, color: 0xb04dff, team: this.team, owner: this, visibility: 'always', texture: 'base_cracks_gradient.png', opacity: 0.75, pulse: true });
    }, q.castTime * 1000);
    void t; // 폭발은 시전자가 움직여도 일어난다 - 행동 타이머(_actionTimers)에 넣지 않아 이동으로 취소되지 않게 한다
    // 원작: 시전 시간(0.5초)이 끝나면 움직일 수 있고, 파열은 그 뒤 0.627초에 터진다. 버그 수정: 예전엔 폭발 시점(약 1.13초)
    // 까지 행동이 묶였다. 시전 시간이 끝나면 이동으로 끊을 수 있는 후딜로 바꾼다(기다리던 이동은 곧바로 이어진다).
    const castEnd = this._champTimeout(() => {
      if (this.currentActionKey !== 'chogathQ') return;
      this.currentPhase = 'RECOVERY'; this.phaseCancelable = true;
      if (this.pendingMove) { const p = this.pendingMove; this.pendingMove = null; this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false; this._commitMove(p); }
    }, q.castTime * 1000);
    this._actionTimers.push(castEnd);
  
};

// Extracted from CharacterController: _chogathCastW
CharacterController.prototype._chogathCastW = function(free, mouseWorldPoint = null) { 
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
    // 버그 수정(타이밍 측정으로 발견): 부채꼴 방향이 조준(마우스) 방향이 아니라 캐릭터가 마침 바라보던
    // 방향이라, 겨눈 곳과 어긋나면 빗나갔다. 조준 방향으로 돌아서서 그 방향으로 판정한다.
    let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    if (mouseWorldPoint) {
      const aim = new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0);
      if (aim.lengthSq() > 1e-6) { forward = aim.normalize(); this.faceDirectionInstant(forward); }
    }
    vfx.spawn('w', this.root.position.clone());
    const t = this._champTimeout(() => {
      const hits = findEnemiesInRadius(this.root.position, w.range, { forward, maxAngleDeg: w.coneAngleDeg / 2 });
      if (hits.length) {
        for (const h of hits) {
          const dmg = skillVal(w.damageByLevel, lvl) + w.apRatio * this.stats.abilityPower;
          const hpB = h.unit.hp, flB = isFlooredTrainingDummy(h.unit);
          const dealt = applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this }) || 0;
          const wouldKill = !flB && hpB > 0 && hpB <= dealt;
          applyStatus(h.unit, { id: 'chogathW_silence', type: 'SILENCE', duration: skillVal(w.silenceDurationByLevel, lvl), value: 1 });
          if (wouldKill) this._chogathOnKill(h.unit);
        }
        debugSkillHit("Cho'Gath W", hits[0].unit, { count: hits.length });
      } else debugSkillMiss("Cho'Gath W", 'no target in cone');
      this.currentActionKey = null; this.currentPhase = null;
      this._resumeAfterAction();
    }, (w.castTime || 0.5) * 1000); // PC 위키 시전 시간 0.5초
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
    const hpB = target.hp, flB = isFlooredTrainingDummy(target);
    const dealt = applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this }) || 0;
    const wouldKill = !flB && hpB > 0 && hpB <= dealt;
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
    // 버그 수정: 예전엔 "몬스터가 아니면 챔피언"으로 판정해 미니언에게도 챔피언 피해(300~650)가 들어갔고,
    // 추가 체력도 1레벨 기본 체력 기준이라 레벨업 체력이 전부 추가 체력으로 계산됐다.
    const isChampionTarget = !!target.isChampion;
    const bonusHp = Math.max(0, (this.maxHp || 0) - (computeChampionStats('chogath', this.champLevel)?.maxHp || CHAMPION_DATA.chogath.stats.hp));
    const dmg = isChampionTarget
      ? skillVal(r.championDamageByLevel, lvl) + r.championApRatio * this.stats.abilityPower + r.championBonusHpRatio * bonusHp
      : r.nonChampionDamage + r.nonChampionApRatio * this.stats.abilityPower + r.nonChampionBonusHpRatio * bonusHp;
    const hpB = target.hp, flB = isFlooredTrainingDummy(target);
    const dealt = applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, source: this }) || 0;
    const wouldKill = !flB && hpB > 0 && hpB <= dealt;
    if (wouldKill) {
      // 중첩: 챔피언/에픽 몬스터는 제한 없음, 미니언/일반 몬스터로 얻는 중첩은 최대 6(PC 위키).
      const fromNonEpic = !target.isChampion && !target.isEpicMonster;
      const nonEpicStacks = this._chogath.nonEpicStacks || 0;
      if (!fromNonEpic || nonEpicStacks < (r.nonEpicStackCap || 6)) {
        if (fromNonEpic) this._chogath.nonEpicStacks = nonEpicStacks + 1;
        this._chogath.predationStacks = (this._chogath.predationStacks || 0) + 1;
        this.bonusMaxHp = (this.bonusMaxHp || 0) + skillVal(r.hpGrowthByLevel, lvl);
        this.recomputeStats();
      }
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
    // PC 위키: 시전 0.25초 뒤 판정(예전엔 즉시). 그 사이 끊기면 취소.
    const target = this.currentTarget;
    this._clearActionTimers();
    { const toT = new THREE.Vector3().subVectors(target.mesh.position, this.root.position).setY(0); if (toT.lengthSq() > 1e-6) this.faceDirectionInstant(toT.normalize()); } // 31차: 대상을 바라보고 시전
    this.setState(STATE.R_CAST);
    this.currentActionKey = 'chogathR'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
    this.playFirstAvailable((this.actionData?.rCast?.clips) || ['Spell4'], { loop: THREE.LoopOnce, fade: 0.08 });
    const t = this._champTimeout(() => {
      if (this.currentActionKey !== 'chogathR') return;
      this.currentActionKey = null; this.currentPhase = null;
      if (target && target.hp > 0) { vfx.spawn('r', this.root.position.clone()); this._chogathROnHit(target); }
      this._resumeAfterAction();
    }, (r.castTime || 0.25) * 1000);
    this._actionTimers.push(t);
  
};

