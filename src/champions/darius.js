// Extracted from CharacterController: _dariusApplyBleed
CharacterController.prototype._dariusApplyBleed = function(target) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'darius' || !target || target.hp <= 0) return;
    const p = cd.passive;
    const lvl = this.champLevel;
    const now = performance.now();
    const rec = this._dariusLiveStacks(target) > 0 ? this._darius.stacksOnTarget.get(target) : { stacks: 0 };
    // 녹서스의 힘 지속 중에는 출혈이 "즉시 최대 중첩"으로 걸린다(원작 패시브 설명).
    const mighty = (this._darius.empoweredUntil || 0) > now;
    rec.stacks = mighty ? p.maxStacks : Math.min(p.maxStacks, rec.stacks + 1);
    // 중첩은 출혈 지속시간(5초)이 끝나면 함께 사라진다 - 예전엔 Map에 영원히 남아
    // 10초 뒤 다시 때려도 이전 중첩에서 이어 쌓였고(곧바로 녹서스의 힘), R도
    // 이미 끝난 출혈 중첩만큼 추가 피해를 줬다.
    rec.expiresAt = now + p.dotDuration * 1000;
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
    if (rec.stacks >= p.maxStacks && !mighty) this._dariusEmpower();
  
};

// 대상에게 "지금 살아 있는" 출혈 중첩 수(만료됐으면 0으로 정리).
CharacterController.prototype._dariusLiveStacks = function(target) {
    const rec = this._darius && this._darius.stacksOnTarget.get(target);
    if (!rec) return 0;
    if (rec.expiresAt && rec.expiresAt <= performance.now()) { this._darius.stacksOnTarget.delete(target); return 0; }
    return rec.stacks || 0;
};

// 패시브 성격의 매 프레임 갱신: E(포획) 패시브 방어구 관통은 E를 한 번이라도
// "시전해야" 켜지는 게 아니라 E를 배운 순간부터 항상 적용된다. 예전엔 E 시전
// 시점에만 armorPenPercent를 넣어서 E를 쓰기 전까지 관통이 0이었다.
CharacterController.prototype._dariusPassiveTick = function() {
    if (this.championId !== 'darius') return;
    const cd = this._champData(); if (!cd) return;
    const lvl = this.skillLevels ? (this.skillLevels.E || 0) : 0;
    this.armorPenPercent = lvl >= 1 ? skillVal(cd.E.armorPenPercentByLevel, lvl) / 100 : 0;
};

// Extracted from CharacterController: _dariusEmpower
CharacterController.prototype._dariusEmpower = function() { 
    const cd = this._champData(); const p = cd.passive;
    const amt = skillVal(p.empoweredAdByLevel, this.champLevel);
    this.bonusAD = amt; this.recomputeStats();
    this._darius.empoweredUntil = performance.now() + p.empoweredDuration * 1000;
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
    this._dariusEmpowerTimer = this._champTimeout(() => {
      if (this.championId !== 'darius') return;
      this.bonusAD = 0; this._darius.empoweredUntil = 0; this.recomputeStats();
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
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, armorPenPercent: this.armorPenPercent || 0, isAbility: true });
    // PC 위키(Template:Data Darius/Decimate): 자루(안쪽)에 맞은 적은 출혈 중첩을 얻지 않는다.
    // 예전엔 자루 적중에도 출혈을 걸었다.
    if (isBlade) this._dariusApplyBleed(target);
    // 회복 대상 수 집계: 도끼날(외곽)에 맞은 "챔피언/대형 몬스터"만 센다. 실제
    // 회복은 한 번의 Q가 끝난 뒤 _dariusQHeal()이 한 번에 처리한다.
    return !!(isBlade && (target.isChampion || target.isLargeMonster));
};

// Q 회복(원작): 도끼날에 맞은 적 챔피언/대형 몬스터 1명당 "잃은 체력"의 17%,
// 최대 51%(3명분)를 Q 한 번에 한 번만 회복한다. 예전엔 맞은 대상마다(미니언
// 포함) 따로 회복해 미니언 무리에 쓰면 체력이 가득 찼고, 상한 51%도 잃은
// 체력이 아니라 최대 체력 기준으로 잘못 걸려 있었다.
CharacterController.prototype._dariusQHeal = function(qualifyingHits) {
    const cd = this._champData(); if (!cd || qualifyingHits <= 0) return;
    const q = cd.Q;
    const pct = Math.min(q.healCapPercent, q.healPercentOfLostHp * qualifyingHits) / 100;
    const missingHp = Math.max(0, this.maxHp - this.hp);
    // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소).
    this.hp = Math.min(this.maxHp, this.hp + missingHp * pct * getHealReceivedMultiplier(this));
    updateBars(this);
};

// Extracted from CharacterController: _dariusWOnHit
CharacterController.prototype._dariusWOnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    const dmg = this.stats.attackDamage * skillVal(w.bonusAdRatioByLevel, lvl);
    // 처치 판정은 방어력 적용 "후" 실제 피해 기준(예전엔 적용 전 원본 피해라 처치가 아닌데도 환급됐다).
    const hpBefore = target.hp, floored = isFlooredTrainingDummy(target);
    const dealtW = applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, armorPenPercent: this.armorPenPercent || 0, isBasicAttack: true }) || 0;
    // 평타 부분에서 이미 처치됐어도(hpBefore<=0) 강화 평타로 처치한 것이다.
    const willKill = !floored && (hpBefore <= 0 || hpBefore <= dealtW);
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
    // 방어구 관통(패시브)은 _dariusPassiveTick()이 E 레벨 기준으로 항상 유지한다.
    if (target && target.hp > 0) {
      // 버그 수정: 지금까지 슬로우/경직만 걸고 실제로는 대상을 전혀 끌어오지
      // 않았다 - "포획"은 도끼를 걸어 실제로 자신 쪽으로 당겨오는 스킬이다
      // (문서: "적을(넉백)끌어당기고"). Mordekaiser E와 동일한 방식으로 실제
      // 좌표를 옮긴다.
      const from = target.mesh.position.clone();
      const dir = new THREE.Vector3().subVectors(this.root.position, from); dir.y = 0;
      const gap = dir.length();
      if (gap > 0.05) {
        // 45차: 원작처럼 다리우스 바로 앞(두 유닛이 맞닿는 거리)까지 끌어온다. 예전엔 "거리의 60%, 120~300" 근사치라
        // 535 끝에서 맞은 대상이 다리우스에게서 235 넘게 떨어진 채 멈췄고, 맞닿는 거리도 자기 반경 x2로 계산했다.
        const pullDist = Math.max(0, gap - (getCollisionRadius(this) + getCollisionRadius(target)));
        dir.normalize();
        const to = from.clone().addScaledVector(dir, pullDist);
        target._pullState = { from, to, duration: 0.3, elapsed: 0 };
        debugSkillHit('Darius E (끌어당김)', target, { pullDistWorld: pullDist.toFixed(2) });
      }
      applyStatus(target, { id: 'dariusE_slow', type: 'SLOW', duration: e.slowDuration, value: e.slowPercent / 100 });
      // 공식 툴팁(Data Dragon 16.20.1): "Pulling, and Knocking Up and Slowing" - 끌려오는 동안의 공중에 뜸은
      // 공용 강제 이동(tickPullEffects)이 건다. 예전 주석은 "에어본은 발생하지 않는다"였다(틀림).
    }
  
};

// Extracted from CharacterController: _dariusROnHit
CharacterController.prototype._dariusROnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const r = cd.R;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    const stacks = this._dariusLiveStacks(target);
    const min = skillVal(r.minDamageByLevel, lvl) + r.minAdRatio * this._getBonusAD();
    const dmg = min * (1 + (r.perStackBonusPercent / 100) * stacks);
    // 처치 판정: 실제로 들어간 피해 기준 + 2% 바닥에 멈춘 허수아비 반복 타격은 처치 아님(무한 재시전 방지).
    const hpBefore = target.hp, floored = isFlooredTrainingDummy(target);
    const dealtR = applyDamage(target, { isUltimate: true, rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, isAbility: true }) || 0;
    const killed = hpBefore > 0 && hpBefore <= dealtR && !floored;
    // PC 위키(Hemorrhage): 단두대는 피해를 준 뒤 출혈 중첩을 1 건다(예전엔 누락). 피해 계산에는 시전 전 중첩만 쓴다.
    if (!killed && target.hp > 0) this._dariusApplyBleed(target);
    // 버그 수정(요청 5-⑥ "재사용 가능 상태 UI 반영"): _rRecastReadyUntil은
    // _castR()의 마나/쿨다운 게이트를 우회시켜 실제로는 즉시 재사용이
    // 가능했지만, this.cooldowns.R 자체는 처치 전에 걸어둔 원래 쿨다운
    // 값 그대로 남아있어서 updateSkillUI()가 매 프레임 그 값만 읽고 R
    // 아이콘을 계속 쿨다운 중인 것처럼(회색/타이머 표시) 그렸다 - 기능은
    // 되는데 화면은 "아직 못 씀"으로 보이는 불일치였다. 기존 cooldown
    // 시스템을 그대로 재사용해서(새 UI 상태를 안 만들고) 처치 순간 여기서
    // 바로 0으로 되돌리면, 다음 updateCooldowns() 틱에서 자동으로 "ready"
    // 표시로 바뀐다.
    if (killed) {
      this._rRecastReadyUntil = performance.now() + r.recastWindow * 1000; this.cooldowns.R = 0;
      // PC 위키(Hemorrhage): 녹서스의 단두대로 챔피언을 처치해도 녹서스의 힘이 발동한다(예전엔 누락).
      if (target.isChampion) this._dariusEmpower();
    }
  
};

// R 도약: 대상과의 거리에서 두 유닛의 충돌 반경만큼 앞에서 멈춘다.
CharacterController.prototype._dariusStartRLeap = function(target) {
    const from = this.root.position.clone();
    const tp = target.mesh.position;
    const dir = new THREE.Vector3(tp.x - from.x, 0, tp.z - from.z);
    const dist = dir.length();
    if (dist < 1e-4) return;
    dir.normalize();
    const stopGap = (this.collisionRadius || 0) + (typeof getCollisionRadius === 'function' ? getCollisionRadius(target) : 0);
    const travel = Math.max(0, dist - stopGap);
    if (travel <= 0.01) return;
    const timing = (typeof SKILL_TIMING_DATABASE !== 'undefined' && SKILL_TIMING_DATABASE.darius && SKILL_TIMING_DATABASE.darius.R) || null;
    const duration = timing && timing.eventTime > 0 ? timing.eventTime : 0.3667;
    this._dashState = { from, to: from.clone().addScaledVector(dir, travel), duration, elapsed: 0, faceDir: dir.clone() };
};
