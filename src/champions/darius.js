// Extracted from CharacterController: _dariusApplyBleed
CharacterController.prototype._dariusApplyBleed = function(target) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'darius' || !target || target.hp <= 0) return;
    const p = cd.passive;
    const lvl = this.champLevel;
    const rec = this._darius.stacksOnTarget.get(target) || { stacks: 0 };
    rec.stacks = Math.min(p.maxStacks, rec.stacks + 1);
    this._darius.stacksOnTarget.set(target, rec);
    const oneStack = p.oneStackBase + p.oneStackGrowth * (lvl - 1) + p.oneStackBonusAdRatio * this._getBonusAD();
    const maxStackTotal = p.maxStackBase + p.maxStackGrowth * (lvl - 1) + p.maxStackBonusAdRatio * this._getBonusAD();
    const t = (rec.stacks - 1) / (p.maxStacks - 1 || 1);
    const perStackTotal = oneStack + (maxStackTotal - oneStack) * t;
    const monsterMult = target.isMonster ? p.monsterMultiplier : 1;
    applyStatus(target, {
      id: 'dariusBleed', type: 'DOT', duration: p.dotDuration, tickInterval: p.dotTickInterval,
      totalDamage: perStackTotal * monsterMult, damageType: DAMAGE_TYPE.PHYSICAL,
    });
    if (rec.stacks >= p.maxStacks) this._dariusEmpower();
  
};

// Extracted from CharacterController: _dariusEmpower
CharacterController.prototype._dariusEmpower = function() { 
    const cd = this._champData(); const p = cd.passive;
    const amt = skillVal(p.empoweredAdByLevel, this.champLevel);
    this.bonusAD = amt; this.recomputeStats();
    clearTimeout(this._dariusEmpowerTimer);
    // 버그 수정(전체 시스템 감사 - "챔피언 교체 후 이전 챔피언의 setTimeout
    // 콜백이 새 챔피언 상태를 잘못 건드림"): 이 타이머는 championId나
    // actionKey 확인 없이 무조건 this.bonusAD를 0으로 만들었다. applyChampionData()가
    // 이 타이머 자체를 정리하지 않으므로, 다리우스 W 강화 상태에서 다른
    // 챔피언으로 바꾸면 몇 초 뒤 이 콜백이 그대로 실행돼 그 새 챔피언이
    // 자기 자신의 메커니즘으로 정당하게 얻은 bonusAD까지 0으로 지워버릴
    // 수 있었다(예: 다리우스->레넥톤 교체 후 레넥톤 강화 상태 도중).
    // championId를 확인해 다리우스가 아니면 아무것도 하지 않도록 최소
    // 범위로 수정.
    this._dariusEmpowerTimer = setTimeout(() => {
      if (this.championId !== 'darius') return;
      this.bonusAD = 0; this.recomputeStats();
    }, p.empoweredDuration * 1000);
  
};

// Extracted from CharacterController: _dariusQOnHit
CharacterController.prototype._dariusQOnHit = function(target, distanceWorld = null) {
    const cd = this._champData(); if (!cd || !target || target.hp <= 0) return;
    const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    const isBlade = distanceWorld == null || distanceWorld > lolRangeToWorld(q.handleRange);
    const dmg = isBlade
      ? skillVal(q.bladeDamageByLevel, lvl) + skillVal(q.bladeAdRatioByLevel, lvl) * this.stats.attackDamage
      : skillVal(q.handleDamageByLevel, lvl) + skillVal(q.handleAdRatioByLevel, lvl) * this.stats.attackDamage;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, armorPenPercent: this.armorPenPercent || 0 });
    this._dariusApplyBleed(target);
    // 다리우스 Q 회복은 도끼날(외곽) 적중에만 발생한다. 자루 적중은 피해와 출혈만 적용한다.
    if (isBlade) {
      const missingHp = Math.max(0, this.maxHp - this.hp);
      const heal = Math.min(this.maxHp * (q.healCapPercent / 100), missingHp * (q.healPercentOfLostHp / 100));
      // 그리버스 치유 감소(QA 버그 수정).
      this.hp = Math.min(this.maxHp, this.hp + heal * (1 - getGrievousPercent(this)));
      updateBars(this);
    }
};

// Extracted from CharacterController: _dariusWOnHit
CharacterController.prototype._dariusWOnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    const dmg = this.stats.attackDamage * skillVal(w.bonusAdRatioByLevel, lvl);
    const willKill = target.hp > 0 && target.hp <= dmg;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, armorPenPercent: this.armorPenPercent || 0 });
    applyStatus(target, { id: 'dariusW_slow', type: 'SLOW', duration: w.slowDuration, value: w.slowPercent / 100 });
    if (willKill) {
      const cost = this._skillCostFor('W') || { mana: w.mana };
      this.mp = Math.min(this.maxMp, this.mp + cost.mana * (w.killManaRefundPercent / 100));
      this.cooldowns.W = Math.max(0, this.cooldowns.W * (1 - w.killCdrPercent / 100));
      updateBars(this);
    }
  
};

// Extracted from CharacterController: _dariusEOnCast
CharacterController.prototype._dariusEOnCast = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    this.armorPenPercent = skillVal(e.armorPenPercentByLevel, lvl) / 100;
    if (target && target.hp > 0) {
      // 버그 수정: 지금까지 슬로우/경직만 걸고 실제로는 대상을 전혀 끌어오지
      // 않았다 - "포획"은 도끼를 걸어 실제로 자신 쪽으로 당겨오는 스킬이다
      // (문서: "적을(넉백)끌어당기고"). Mordekaiser E와 동일한 방식으로 실제
      // 좌표를 옮긴다. 정확한 이동 거리가 기획안에 없어 "충분히 끌려온다"는
      // 서술을 60%/최대 300 근사치로 반영한다(임의 피해량이 아니라 연출용
      // 거리이므로 섹션 18의 "피해량을 임의로 만들지 마라"에 해당하지 않음).
      const from = target.mesh.position.clone();
      const dir = new THREE.Vector3().subVectors(this.root.position, from); dir.y = 0;
      const gap = dir.length();
      if (gap > 0.05) {
        // 최소/최대 거리를 LoL 단위(120~300)로 정하고 공통 변환 함수로
        // world 거리로 바꾼다 - 스킬마다 다른 배율을 임의로 넣지 않는다.
        const desired = THREE.MathUtils.clamp(gap * 0.6, lolRangeToWorld(120), lolRangeToWorld(300));
        const pullDist = Math.min(desired, Math.max(0, gap - this.collisionRadius * 2));
        dir.normalize();
        const to = from.clone().addScaledVector(dir, pullDist);
        target._pullState = { from, to, duration: 0.3, elapsed: 0 };
        debugSkillHit('Darius E (끌어당김)', target, { pullDistWorld: pullDist.toFixed(2) });
      }
      applyStatus(target, { id: 'dariusE_slow', type: 'SLOW', duration: e.slowDuration, value: e.slowPercent / 100 });
      // 포획은 적을 끌어오면서 40% 둔화를 적용한다. 기절/에어본은 발생하지 않는다.
    }
  
};

// Extracted from CharacterController: _dariusROnHit
CharacterController.prototype._dariusROnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const r = cd.R;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    const stacks = (this._darius.stacksOnTarget.get(target) || { stacks: 0 }).stacks;
    const min = skillVal(r.minDamageByLevel, lvl) + r.minAdRatio * this._getBonusAD();
    const dmg = min * (1 + (r.perStackBonusPercent / 100) * stacks);
    const killed = target.hp > 0 && target.hp <= dmg;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 });
    // 버그 수정(요청 5-⑥ "재사용 가능 상태 UI 반영"): _rRecastReadyUntil은
    // _castR()의 마나/쿨다운 게이트를 우회시켜 실제로는 즉시 재사용이
    // 가능했지만, this.cooldowns.R 자체는 처치 전에 걸어둔 원래 쿨다운
    // 값 그대로 남아있어서 updateSkillUI()가 매 프레임 그 값만 읽고 R
    // 아이콘을 계속 쿨다운 중인 것처럼(회색/타이머 표시) 그렸다 - 기능은
    // 되는데 화면은 "아직 못 씀"으로 보이는 불일치였다. 기존 cooldown
    // 시스템을 그대로 재사용해서(새 UI 상태를 안 만들고) 처치 순간 여기서
    // 바로 0으로 되돌리면, 다음 updateCooldowns() 틱에서 자동으로 "ready"
    // 표시로 바뀐다.
    if (killed) { this._rRecastReadyUntil = performance.now() + r.recastWindow * 1000; this.cooldowns.R = 0; }
  
};

