// Extracted from CharacterController: _settLeftHandRangeBonusWorld
CharacterController.prototype._settLeftHandRangeBonusWorld = function() { 
    if (this.championId !== 'sett' || !this._sett.qUsesRemaining) return 0;
    const cd = this._champData(); if (!cd) return 0;
    // 80차: PC 위키 - 강화된 다음 기본 공격 2회 모두 사거리 +50(예전엔 왼손 1회만).
    return lolRangeToWorld(cd.Q.leftHandRangeBonus || 0);
  
};

// Extracted from CharacterController: _settOnBasicAttackHit
CharacterController.prototype._settOnBasicAttackHit = function(target, attackHand, applyFn = null) { 
    const cd = this._champData(); if (!cd) return;
    const p = cd.passive;
    this._sett.lastPunchAt = performance.now();
    this._sett.punchSide = attackHand ? attackHand.toLowerCase() : this._sett.punchSide; // 디버그 표시(예: [SETT Q] Next Attack)용 미러링일 뿐, 판정에는 쓰지 않음
    if (attackHand === 'RIGHT') {
      const t = Math.min(1, Math.max(0, (this.champLevel - 1) / 17));
      const dmg = p.rightPunchDamageAtLevel1 + (p.rightPunchDamageAtLevel18 - p.rightPunchDamageAtLevel1) * t + p.rightPunchBonusAdRatio * this._getBonusAD();
      // 90차(QA): 오른손 추가 피해는 기본 공격의 일부(원작 Pit Grit) - 스킬 피해 증폭·스킬 전용 아이템 효과가 붙지 않고, 생명력 흡수는 적용된다.
      // isOnHitBonus: 같은 공격의 적중 효과(룬 공격 횟수 등)를 두 번 세지 않게 표시. 구조물이면 그 전용 피해 함수(applyFn)로.
      const hit = { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isBasicAttack: true, isOnHitBonus: true, isAbility: false, source: this, armorPenPercent: this.armorPenPercent || 0 };
      if (applyFn) applyFn(target, hit); else applyDamage(target, hit);
    }
    if (!applyFn && this._settQOnHit) this._settQOnHit(target); // Q 활성 중이면 추가 타격 처리(아래)
  
};

// Extracted from CharacterController: _settPassiveTimeoutTick
CharacterController.prototype._settPassiveTimeoutTick = function() { 
    if (this.championId !== 'sett') return;
    const wouldBeRight = (this._settAttackStep % 2) === 1;
    if (!wouldBeRight) return;
    const p = this._champData() && this._champData().passive;
    const timeoutMs = (p && p.leftHandTimeoutSec != null ? p.leftHandTimeoutSec : 2) * 1000;
    if (performance.now() - (this._sett.lastPunchAt || 0) > timeoutMs) {
      this._settAttackStep = 0;
      this.comboIndex = 0;
      console.log('[SETT PASSIVE] (유휴 상태) 왼손 이후 2초 경과 - 다음 공격 다시 LEFT로 리셋');
    }
  
};

// Extracted from CharacterController: _settPassiveTick
CharacterController.prototype._settPassiveTick = function(dt) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'sett' || this.hp <= 0 || this.hp >= this.maxHp) return;
    const perTick = valueByBreakpoints(cd.passive.regenByLevelBreakpoints, this.champLevel);
    const missingPercent = ((this.maxHp - this.hp) / this.maxHp) * 100;
    const extraRegen = perTick * (missingPercent / 5);
    // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소).
    this.hp = Math.min(this.maxHp, this.hp + extraRegen * dt * getHealReceivedMultiplier(this));
  
};

// Extracted from CharacterController: _settQOnCast
CharacterController.prototype._settQOnCast = function() { 
    const cd = this._champData(); if (!cd) return;
    const q = cd.Q;
    applyStatus(this, { id: 'settQ_ms', type: 'MS_BUFF', duration: q.moveSpeedDuration, value: q.moveSpeedBonusPercent / 100 });
    this._sett.qUsesRemaining = 2;
  
};

// Extracted from CharacterController: _settQOnHit
CharacterController.prototype._settQOnHit = function(target) { 
    if (!this._sett.qUsesRemaining || this._sett.qUsesRemaining <= 0) return;
    const cd = this._champData(); if (!cd) return;
    const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    // 대상 최대 체력의 (1% + 공격력 100당 1~3%) - 공격력은 총 공격력 기준(PC 위키 "per 100 AD").
    const hpPercent = q.perHitMaxHpPercent + (this.stats.attackDamage / 100) * skillVal(q.perHitMaxHpPercentPer100AdByLevel, lvl);
    const dmg = skillVal(q.perHitFlatByLevel, lvl) + (target.maxHp || 0) * (hpPercent / 100);
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
    this._sett.qUsesRemaining -= 1;
    console.log(`[SETT Q] Q EMPOWERED HIT (uses left: ${this._sett.qUsesRemaining})`);
    console.log(`[SETT Q] Damage Applied: ${dmg.toFixed(1)}`);
  
};

// Extracted from CharacterController: _settGritSum
CharacterController.prototype._settGritSum = function() { 
    if (!this._sett.gritEntries) return 0;
    return this._sett.gritEntries.reduce((sum, e) => sum + e.amount, 0);
  
};

// Extracted from CharacterController: _settOnTakeDamageForGrit
CharacterController.prototype._settOnTakeDamageForGrit = function(actualHpLoss) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'sett' || actualHpLoss <= 0) return;
    const w = cd.W;
    if (!this._sett.gritEntries) this._sett.gritEntries = [];
    const maxGrit = this.maxHp * (w.gritMaxHpPercent / 100);
    const before = this._settGritSum();
    // 최대 체력 50% 상한은 "합계" 기준으로 유지한다 - 이번에 새로 들어오는
    // 양만 상한을 넘지 않는 만큼으로 잘라서 새 항목으로 추가한다(기존
    // 항목들의 생성 시각은 그대로 유지).
    const addition = Math.max(0, Math.min(actualHpLoss, maxGrit - before));
    if (addition > 0) this._sett.gritEntries.push({ amount: addition, gainedAt: performance.now() });
    this._sett.grit = this._settGritSum(); // UI(FLOW 바) 등 기존 코드가 참조하는 합계 값 동기화
    console.log(`[SETT PASSIVE] FLOW +${addition.toFixed(1)} (${before.toFixed(0)} -> ${this._sett.grit.toFixed(0)} / ${maxGrit.toFixed(0)}) [항목 ${this._sett.gritEntries.length}개]`);
    updateBars(this);
  
};

// Extracted from CharacterController: _settGritTick
CharacterController.prototype._settGritTick = function(dt) { 
    if (this.championId !== 'sett' || !this._sett.gritEntries || !this._sett.gritEntries.length) return;
    const cd = this._champData(); const w = cd.W;
    const now = performance.now();
    const delayMs = w.gritDecayDelay * 1000;
    // 버그 수정(공식 수치 확인함 - League Wiki: "Each instance of stored
    // Grit decays in value by 30% every second after 4 seconds"): 예전엔
    // 정확한 감쇠율을 몰라서 "초당 최대체력의 절반만큼 고정 차감"으로
    // 근사했는데, 실제로는 매초 30%씩 지수적으로(복리처럼) 줄어드는
    // 방식이다. Math.pow(0.7, dt)로 초 단위 프레임 dt에 정확히 맞춰
    // 적용한다(dt=1이면 정확히 70%만 남음 = 30% 감소).
    const decayFactorPerSec = 1 - (w.gritDecayPercentPerSec || 30) / 100;
    for (const entry of this._sett.gritEntries) {
      if (now - entry.gainedAt > delayMs) entry.amount *= Math.pow(decayFactorPerSec, dt);
    }
    this._sett.gritEntries = this._sett.gritEntries.filter((e) => e.amount > 0.01);
    this._sett.grit = this._settGritSum();
  
};

// Extracted from CharacterController: _settShieldDecayTick
CharacterController.prototype._settShieldDecayTick = function(dt) {
    // W 보호막 감소(0.75초 뒤부터 0까지)는 보호막 인스턴스 모델(addShield decay)이 처리한다.
};

// 버그 수정(QA - "세트 W 보호막 적용 타이밍"): 예전엔 투지 소모+보호막
// 적용+피해 판정이 전부 _settWOnCast() 하나에 묶여 있었고, 그 함수
// 전체가 character_controller.js의 지연된 onFire 콜백(SKILL_TIMING_DATABASE.sett.W
// = 0.75초) 안에서만 호출됐다 - 즉 "보호막은 0.000초 즉시, 피해는 0.750초"
// 라는 문서/주석의 의도와 달리 보호막까지 0.75초 늦게 뜨는 버그였다.
// 이제 두 단계로 분리한다:
//   1) _settWApplyShield() - 시전 "즉시"(가렌 W/마스터 이의 W와 동일하게
//      runAction() 호출 전에) 불린다 - 투지를 스냅샷하고 그 자리에서
//      비운 뒤, 그 스냅샷 값으로 보호막을 건다. 0.75초 뒤 피해 판정이
//      쓸 수 있도록 스냅샷 값을 this._sett.wPendingSpent에 보존해둔다
//      (그 사이 전투로 투지가 다시 쌓이거나 보호막이 깎여도 피해량
//      계산에는 영향이 없다 - 저장된 값은 고정).
//   2) _settWOnCast(origin, forward) - 기존처럼 onFire에서 0.75초 뒤
//      호출되지만, 이제 투지를 다시 소모하지 않고 1)이 저장해 둔
//      wPendingSpent만 읽어서 피해만 계산한다.
CharacterController.prototype._settWApplyShield = function() {
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    // 문서 8절: "저장된 투지를 먼저 확보 -> 소모 -> 그 값으로 피해 계산"
    // 순서를 그대로 지킨다(0으로 만든 뒤 그 0으로 피해를 계산하는 버그 방지).
    const spent = this._settGritSum();
    // 요청: "W가 Grit을 소모한 후 해당 Grit 기록도 정상적으로 제거한다" -
    // 합계 숫자만 0으로 만들지 않고 항목 배열 자체를 비운다.
    this._sett.gritEntries = [];
    this._sett.grit = 0;
    // 0.75초 뒤 피해 판정(_settWOnCast)이 정확히 "이번 시전이 소모한 양"을
    // 쓸 수 있도록 고정 보존한다 - 그 사이 다시 피격해 투지가 쌓여도
    // 이번 W의 피해량에는 영향이 없다.
    this._sett.wPendingSpent = spent;
    // 버그 수정(요청 14): 예전엔 setTimeout 하나로 "3초 동안 보호막 유지 후
    // 즉시 0"이었다 - 3초 내내 전체 값을 유지하다가 순간적으로 사라지는
    // 것은 "3초에 걸쳐 감소"가 아니다. 이제 초당 감소율(rate)만 정해두고
    // 매 프레임 그 비율만큼 실제로 줄인다 - 전투 중 피해로 보호막이 먼저
    // 일부 소모돼도(this.shield는 takeDamage에서 흡수될 때마다 줄어듦)
    // 감쇠는 "그 시점의 실제 남은 값"에서 계속 이어지고, 공식으로 다시
    // 큰 값을 덮어씌우지 않는다.
    const shieldAmt = spent * getShieldReceivedMultiplier(this); // 소모한 투지의 100% = 보호막(보호막 효과 증가 적용)
    // 버그 수정(기제 점검): 원작은 서로 다른 보호막이 더해진다 - 예전엔 max(기존, W)라 다른 보호막과 합쳐지지 않았다.
    // 이전 W 보호막이 남아 있으면 그 몫은 새 W로 교체한다.
    const decayDelayW = w.shieldDecayDelaySec || 0;
    // PC 위키: 보호막은 3초 지속, 0.75초 뒤부터 남은 2.25초에 걸쳐 0까지 감소한다(보호막 인스턴스가 처리).
    addShield(this, 'settW', shieldAmt, w.shieldDuration, { decay: true, decayDelaySec: decayDelayW });
    updateBars(this);

};

// Extracted from CharacterController: _settWOnCast
CharacterController.prototype._settWOnCast = function(origin, forward) {
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    // 보호막 적용 시점(_settWApplyShield, 시전 즉시)에 이미 확보해 둔 값을
    // 그대로 쓴다 - 여기서 다시 _settGritSum()을 부르면 이미 0으로 비워진
    // 뒤라 피해가 전부 0이 되는 버그가 난다.
    const spent = this._sett.wPendingSpent || 0;

    const bonusAd = this._getBonusAD();
    // 소모한 투지의 25% + 추가 공격력 100당 25%(PC 위키).
    const gritRatio = w.gritSpendPercent + (bonusAd / 100) * (w.gritSpendPercentPer100BonusAd || 0);
    let centerHit = 0, sideHits = 0;
    for (const unit of getAllEnemyUnits()) {
      const zone = isPointInsideSettWTrapezoid(unit, origin, forward, w.range, w.centerHalfWidth, w.endHalfWidth,
        { startHalfWidth: w.startHalfWidth, minRange: w.minRange, circleRadius: w.circleRadius ?? w.range });
      if (!zone) continue;
      if (zone === 'CENTER') {
        // 중앙 적중: 투지 비례 고정 피해(True Damage) - Armor/MR 무시.
        const dmg = skillVal(w.damageBaseByLevel, lvl) + spent * (gritRatio / 100);
        applyDamage(unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1 });
        console.log(`[SETT W] CENTER HIT -> TRUE DAMAGE ${dmg.toFixed(1)} (flow ${spent.toFixed(0)})`);
        centerHit++;
      } else {
        // 양옆 적중: 같은 공식이지만 물리 피해(방어력 적용) - 중앙과 절대
        // 같은 대상에게 동시에 들어가지 않는다(둘 중 하나만, 요청 15).
        const dmg = skillVal(w.damageBaseByLevel, lvl) + spent * (gritRatio / 100);
        applyDamage(unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
        console.log(`[SETT W] SIDE HIT -> PHYSICAL DAMAGE ${dmg.toFixed(1)} (flow ${spent.toFixed(0)})`);
        sideHits++;
      }
    }
    if (centerHit === 0 && sideHits === 0) console.log('[SETT W] MISS - no target in trapezoid');
  
};

// Extracted from CharacterController: _settEOnCast
CharacterController.prototype._settEOnCast = function(facing) { 
    const cd = this._champData(); if (!cd) return;
    const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    const origin = this.root.position;
    const fwd = (facing && facing.lengthSq() > 1e-6) ? facing.clone().setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    const rightVec = new THREE.Vector3(-fwd.z, 0, fwd.x); // fwd를 +90도 회전한 "오른쪽" 방향
    // 79차: 원작 판정은 원이 아니라 좌우로 긴 직사각형(좌우 각 450, 앞뒤 폭 280) - 앞뒤로 먼 대상은 제외.
    const eHalfDepth = lolRangeToWorld((e.width || 0) / 2);
    const hits = findEnemiesInRadius(origin, e.range + (e.width || 0) / 2).filter((h) => {
      if (!e.width) return h.distance <= lolRangeToWorld(e.range) + getCollisionRadius(h.unit);
      const p = getWorldPosition(h.unit), r = getCollisionRadius(h.unit);
      const dx = p.x - origin.x, dz = p.z - origin.z;
      return Math.abs(dx * fwd.x + dz * fwd.z) <= eHalfDepth + r && Math.abs(dx * rightVec.x + dz * rightVec.z) <= lolRangeToWorld(e.range) + r;
    });
    // 버그 수정(요청 6/7 "한쪽당 1명만 선택하는 버그"): 예전엔 각 측면에서
    // 가장 가까운 대상 1명만 leftTarget/rightTarget 단일 변수에 저장했다.
    // 실제 LoL Facebreaker는 판정 범위 안의 "그쪽에 있는 모든 유효 대상"을
    // 전부 끌어당긴다 - 배열로 전부 수집한다.
    const leftTargets = [], rightTargets = [];
    for (const h of hits) {
      const p = getWorldPosition(h.unit);
      const dx = p.x - origin.x, dz = p.z - origin.z;
      const lateral = dx * rightVec.x + dz * rightVec.z; // 양수=오른쪽, 음수=왼쪽
      if (lateral >= 0) rightTargets.push(h); else leftTargets.push(h);
    }
    const hasLeft = leftTargets.length > 0;
    const hasRight = rightTargets.length > 0;
    const bothSides = hasLeft && hasRight;
    // 버그 수정(문서 20절 명시 경고 그대로 발생했었음): "기절이 둔화를
    // 덮어써서 둔화 자체가 사라지면 안 된다"인데, 예전 코드는
    // if(bothSides){stun} else {slow}로 짜여 있어서 양쪽 다 잡혔을 때
    // 둔화가 아예 적용되지 않았다. 둔화(0.5초 70%)와 기절(1초, 양쪽
    // 조건일 때만)은 서로 완전히 독립된 CC라서 항상 둘 다 검사해서
    // 각각 따로 적용해야 한다.
    const resolveOne = (rec) => {
      const target = rec.unit;
      let dmg = skillVal(e.damageByLevel, lvl) + e.adRatio * this.stats.attackDamage;
      if (target.isMonster) {
        // 몬스터 전용 추가 피해 - 챔피언 레벨(1~18)에 선형 보간, 스킬
        // 레벨과는 무관(문서 17/18절 "레벨에 따라 125~250").
        const t = (this.champLevel - 1) / 17;
        dmg += e.monsterBonusDamageMin + (e.monsterBonusDamageMax - e.monsterBonusDamageMin) * t;
      }
      applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
      // 실제 끌어오기: 대상의 실제 좌표를 세트 쪽으로 옮긴다(요청 8 - 상태
      // 플래그만 켜고 위치는 그대로 두면 인정 안 함). 기존 Mordekaiser E/
      // 다리우스 E와 동일한 _pullState 트윈을 재사용한다(요청 9 "기존
      // 시스템을 먼저 확인하고 재사용").
      const from = target.mesh.position.clone();
      const dir = new THREE.Vector3().subVectors(this.root.position, from); dir.y = 0;
      const gap = dir.length();
      if (gap > 0.05) {
        const minGap = this.collisionRadius + getCollisionRadius(target); // 세트를 통과해서 반대편으로 넘어가지 않도록
        // 버그 수정(공식 수치 확인함 - League Wiki Facebreaker: "Targets
        // will be pulled towards Sett's location in a straight line and
        // rebound to 150 units from him back in the same line"): 예전엔
        // 끌려오는 거리에 lolRangeToWorld(300)이라는 임의 상한을 두고,
        // 충돌 후 튕겨나가는 거리도 lolRangeToWorld(150)/6이라는 임의
        // 나눗셈으로 근사했다. 실제로는 상한 없이 세트 쪽으로 최대한
        // 끌려온 뒤(collision radius까지), 충돌 후 정확히 "세트로부터
        // 150 유닛 지점"까지 같은 직선을 따라 되돌아간다 - 반대편 대상
        // 위치가 아니라 세트 자신의 위치를 기준으로 한 절대 거리다.
        const pullDist = Math.max(0, gap - minGap);
        dir.normalize();
        const to = from.clone().addScaledVector(dir, pullDist);
        // 문서 13/14절: 양쪽 다 잡혔으면 둘이 서로 "충돌"해야 한다 - 끌려오는
        // 목적지를 향해 서로 마주보고 다가오다가, 도착 직후(onComplete) 서로
        // 반대 방향으로 짧게 밀려나는 넉백을 추가해서 "부딪힌 뒤 튕겨나감"을
        // 근사한다(완전한 경로 교차 물리 시뮬레이션 대신 - 이 데모 규모에
        // 맞는 근사, 임의 피해량이 아니라 연출 거리이므로 섹션 18/26의
        // "임의 수치 금지"는 데미지/자원에 해당하고 여기 해당 안 함).
        target._pullState = {
          from, to, duration: 0.3, elapsed: 0,
          onComplete: bothSides ? (u) => {
            // 공식 수치: 세트로부터 정확히 150 유닛 지점까지, 끌려온 것과
            // 같은 직선(세트 -> 대상 방향)을 따라 되돌아간다.
            const backDir = new THREE.Vector3().subVectors(u.mesh.position, this.root.position); backDir.y = 0;
            if (backDir.lengthSq() < 1e-6) backDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
            backDir.normalize();
            const kbTo = this.root.position.clone().addScaledVector(backDir, lolRangeToWorld(150));
            u._pullState = { from: u.mesh.position.clone(), to: kbTo, duration: 0.2, elapsed: 0 };
          } : null,
        };
      }
      // 둔화는 항상 적용(한쪽만 잡혀도, 양쪽 다 잡혀도 동일하게).
      applyStatus(target, { id: 'settE_slow', type: 'SLOW', duration: e.slowDuration, value: e.slowPercent / 100 });
      // 기절은 "양쪽 모두에 최소 한 명씩 있을 때" 판정에 걸린 모든 대상에게
      // 적용한다(요청 7 "왼쪽 대표 1명+오른쪽 대표 1명이 아니라 전체 배열 기준").
      if (bothSides) {
        applyStatus(target, { id: 'settE_stun', type: 'STUN', duration: e.stunDuration, value: 1 });
      }
    };
    for (const rec of leftTargets) resolveOne(rec);
    for (const rec of rightTargets) resolveOne(rec);
    console.log(`[SETT E] left=${leftTargets.length}명 right=${rightTargets.length}명 bothSides=${bothSides} -> SLOW 전원 적용, STUN=${bothSides ? '전원' : '없음'}`);
    if (!hasLeft && !hasRight) debugSkillMiss('Sett E', 'no target on either side');
    else debugSkillHit('Sett E', (leftTargets[0] || rightTargets[0]).unit, { bothSides, leftCount: leftTargets.length, rightCount: rightTargets.length });
  
};

// Extracted from CharacterController: _settCastR
CharacterController.prototype._settCastR = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this.canStartNewAction()) return;
    if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss('Sett R', 'no currentTarget selected'); return; }
    // 요청 2: R은 "적 챔피언 전용" 잡기 스킬 - 몬스터/미니언은 잡을 수 없다.
    if (!this.currentTarget.isChampion) { debugSkillMiss('Sett R', 'target is not a champion (몬스터/미니언은 R 대상이 될 수 없음)'); return; }
    const cd = this._champData(); const r = cd.R;
    // 요청 3: "실제 판정 범위 = 화면 표시 범위 = 대상 선택 거리" - 이미 있는
    // isInRange() 하나만 쓴다(새 거리 계산 안 만듦).
    if (!isInRange(this, this.currentTarget, r.range)) { debugSkillMiss('Sett R', 'out of range'); return; }
    if (!this._payCost('R', free)) return;
    const target = this.currentTarget;
    console.log('[SETT R] R_STATE_CAST -> 대상 확정:', unitLabel(target));

    this._clearActionTimers();
    this.setState(STATE.R_CAST);
    // R 전체 시퀀스 동안 세트 자신도 다른 행동을 할 수 없다(요청 17 "다른
    // 시스템과 충돌 금지") - currentPhase를 'ACTIVE'로 고정해 캐스트/이동
    // 명령이 이 시퀀스를 방해하지 못하게 한다.
    this.currentActionKey = 'settR'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;

    // 제압(Suppress)은 실제 LoL과 동일하게 캐스트 즉시 적용한다(공식 문구:
    // "suppresses... while dashing... attaching them to himself UPON
    // ARRIVAL" - 제압은 즉시, 물리적으로 "붙잡힌 상태"는 GRAB 시점에
    // 별도로 나뉜다). 기존 STUN 상태이상 재사용. 정확한 지속시간은 실제
    // 클립 길이를 확인한 뒤 아래에서 다시 걸어준다(여기서는 일단 대상이
    // 즉시 행동 가능 상태로 풀리지 않도록 임시로 걸어둔다).
    applyStatus(target, { id: 'settR_suppress', type: 'SUPPRESSION', duration: 1, value: 1 });
    // 버그 수정(요청 5 "GRAB 애니메이션 시작 전에 대상을 세트에게 강제로
    // 붙이지 않는다"): 예전엔 isGrabbedBySett(물리적으로 붙잡혀 세트를
    // 따라다니는 상태)를 캐스트 시점에 곧바로 켰다 - DASH 단계에서 아직
    // 붙잡지도 않았는데 이미 "붙잡힌 상태"였다. 이제 이 플래그는 실제
    // Spell4_Grab 스텝이 시작되는 순간(아래 GRAB 전환 지점)에만 켠다.
    // 제압(SUPPRESSION)과는 별개 개념이라 여기서는 건드리지 않는다.

    const dir = new THREE.Vector3().subVectors(target.mesh.position, this.root.position); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    // 요청("세트가 바라보는 방향으로 내려꽂는다"): 착지 방향을 단순
    // 좌표 차이 벡터로만 계산하지 않고, 세트의 실제 캐릭터 회전값도 이
    // 방향으로 즉시 맞춘다 - "세트가 바라보는 방향"과 "던지는 방향"이
    // 항상 같은 값이 되도록 캐스트 시점에 한 번만 고정한다(이후 비행
    // 중에는 절대 다시 바뀌지 않음 - 기존 "방향 고정" 원칙 그대로 유지).
    this.faceDirectionInstant(dir);
    // 버그 수정(공식 수치 확인함 - 여러 공략 사이트 교차 확인: "carry them
    // forward 600 units"): 예전엔 정확한 캐리 거리를 몰라서
    // lolRangeToWorld(400)*0.4(≈160 유닛)로 근사했다. 실제로는 600
    // 유닛이다 - 이동 "거리"는 순전히 LoL 단위 기준이고, 시간(t)은
    // 그 고정된 거리를 얼마나 재생했는지 나타내는 진행률일 뿐이다
    // (요청 11 "거리와 애니메이션 시간은 서로 다른 개념").
    const travelWorld = lolRangeToWorld(cd.R.carryDistance || 600);
    const landingPos = target.mesh.position.clone().addScaledVector(dir, travelWorld);

    this._sett.rSeq = {
      phase: 'CAST', timer: 0, target,
      startPos: this.root.position.clone(),
      targetStartPos: target.mesh.position.clone(),
      landingPos,
      throwDir: dir.clone(), // 요청: "세트가 바라보는 방향"을 캐스트 시점에 고정해서 CARRY 내내 재사용 - 위치 차이 벡터에 의존하지 않는다
      // 실제 GLB 클립을 못 찾을 때만 쓰는 근사 폴백 타이밍(애니메이션 없어도
      // 게임 로직 자체는 반드시 작동해야 한다는 원칙 유지) - 아래에서 실제
      // 클립을 찾으면 이 값 전체를 실제 clip.duration으로 덮어쓴다.
      durations: { DASH: 0.25, GRAB: 0.15, CARRY: 0.9, IMPACT: 0.15 },
      useAnimTiming: false,
    };

    // 버그 수정(핵심): 예전엔 setState(STATE.R_CAST)만 하고 실제 R 애니메이션
    // 클립을 재생하는 코드가 전혀 없었다 - 캐스트 직전에 재생 중이던
    // 애니메이션이 R 시퀀스 내내 그대로 유지된 채, 게임 로직만(위치 이동 등)
    // 조용히 진행되고 있었다("모션이 사라짐"의 실제 원인). 기존에 이미
    // multiPhaseClips용으로 만들어져 있던 AnimationSequencePlayer를 그대로
    // 재사용해서 실제 클립을 재생하고, 그 클립들의 진짜 duration을 게임
    // 로직 각 단계의 지속시간으로 그대로 쓴다(요청 3/8 "애니메이션 실제
    // 재생 시간을 기준으로 하나의 타임라인으로 맞춘다").
    const db = this._championAbilityDbEntry();
    const multiNames = (db && db.R && db.R.multiPhaseClips) || [];
    const resolvedClips = multiNames.map((n) => this.resolveClip([n])).filter(Boolean);
    const seq = this._sett.rSeq;

    if (resolvedClips.length === 4) {
      // multiPhaseClips = ['Spell4_Dash', 'Spell4_Grab', 'Spell4_Spin', 'Spell4_PowerBomb']
      // (요청: Spell4_Base 제외) index: 0=접근 1=붙잡기 2=공중 이동 3=착지/내려찍기
      const [dashC, grabC, spinC, bombC] = resolvedClips;
      seq.durations = { DASH: dashC.duration, GRAB: grabC.duration, CARRY: spinC.duration, IMPACT: bombC.duration };
      seq.useAnimTiming = true;
      const totalDuration = resolvedClips.reduce((s, c) => s + c.duration, 0);
      // 버그 수정(브라우저 테스트로 발견): 제압이 "클립 재생시간 + 0.5초"(실제 시간) 뒤 자동으로 풀렸는데,
      // 애니메이션은 게임 프레임 시간으로 흐르므로 프레임이 낮으면 운반 도중에 제압이 먼저 풀렸다. 제압은
      // 시퀀스가 끝나거나 취소될 때 _settEndR()이 해제하므로, 여기서는 넉넉한 안전 상한만 둔다.
      applyStatus(target, { id: 'settR_suppress', type: 'SUPPRESSION', duration: Math.max(10, totalDuration * 4), value: 1 });
      console.log(`[SETT R] 실제 애니메이션 클립 재생 - 총 ${totalDuration.toFixed(2)}s (Dash ${dashC.duration.toFixed(2)}/Grab ${grabC.duration.toFixed(2)}/Spin ${spinC.duration.toFixed(2)}/PowerBomb ${bombC.duration.toFixed(2)})`);
      this.sequencePlayer.play({
        steps: resolvedClips.map((c) => ({ animation: c.name, clipStart: 0, clipEnd: c.duration })),
        // 버그 수정(문제 A/B/C): 애니메이션 스텝 전환 시점(onStepStart)에
        // 맞춰서만 게임 로직 단계를 넘긴다 - 타이머가 애니메이션보다 먼저
        // 끝나서 모션을 끊는 일이 없다(요청 16 "둘 다 끝나야 종료"). 이
        // AnimationSequencePlayer가 유일한 권위 있는 상태 머신이다 -
        // 별도의 timer가 여기보다 먼저 phase를 바꾸지 못한다(요청 10).
        // play()는 step 0의 onStepStart를 즉시(동기적으로) 호출하므로,
        // Base가 빠진 지금은 index 0이 곧바로 DASH START다.
        onStepStart: (index) => {
          const s = this._sett.rSeq; if (!s) return;
          if (index === 0) { s.phase = 'DASH'; s.timer = 0; console.log('[SETT R] DASH START'); }
          else if (index === 1) {
            s.phase = 'GRAB'; s.timer = 0;
            console.log('[SETT R] GRAB START');
            // 버그 수정(요청 5 핵심): "Spell4_Grab이 시작되는 정확한 순간"이
            // 실제 잡기 판정 시점이다 - DASH 중에는 아직 붙잡히지 않은 채
            // 세트 혼자 접근만 한다. isGrabbedBySett은 반드시 여기서만 켠다.
            s.target.isGrabbedBySett = true;
            console.log('[SETT R] TARGET GRABBED');
          }
          else if (index === 2) {
            s.phase = 'CARRY'; s.timer = 0;
            s.carryStartSettPos = this.root.position.clone();
            s.carryStartTargetPos = s.target.mesh.position.clone();
            console.log('[SETT R] SPIN/CARRY START');
            console.log('[SETT R] CARRY DISTANCE = 600 LOL UNITS');
          } else if (index === 3) {
            s.phase = 'IMPACT'; s.timer = 0;
            // 버그 수정(요청: "PowerBomb가 끝나는 동시에 내려꽂는다"): 예전엔
            // PowerBomb 클립이 "시작"하는 순간 바로 착지 위치로 스냅하고
            // 피해까지 적용했다 - 실제로는 PowerBomb 클립 자체가 "내려찍는
            // 동작"을 담고 있으므로, 그 클립이 재생되는 동안 자연스럽게
            // 하강하다가 클립이 "끝나는" 순간(onComplete)에 비로소 땅에
            // 닿아 피해가 발생해야 한다. 여기서는 하강을 시작할 현재
            // 위치/높이만 기록해두고, 실제 스냅/피해는 onComplete로 넘긴다.
            s.impactStartSettPos = this.root.position.clone();
            s.impactStartTargetPos = s.target.mesh.position.clone();
            console.log('[SETT R] POWERBOMB START');
          }
        },
        // 요청: "PowerBomb가 끝나는 동시에 상대를 땅에 내려꽂는다" - 실제
        // 착지 스냅/피해를 onComplete(클립이 완전히 끝나는 시점)로 옮겼다.
        // 애니메이션이 자연스럽게 완주한 시점에만 R을 종료한다 - 타이머가
        // 아니라 실제 마지막 클립까지 다 재생된 뒤.
        onComplete: () => {
          const s = this._sett.rSeq; if (!s) return;
          // 버그 수정(요청: "세트가 앞으로 가는 게 아니라 상대를 세트 앞에
          // 내려꽂는다"): 예전엔 세트와 대상을 똑같이 landingPos로 스냅한
          // 뒤 세트만 추가로 더 앞으로 미끄러뜨려서(Slide), 결과적으로
          // 세트가 대상보다 앞에 가 있게 됐다. 이제 대상만 궁을 쓴 방향의
          // 최종 지점(landingPos)에 내려꽂히고, 세트는 그 자리에 그대로
          // 남는다(대상보다 살짝 뒤 - holdDist만큼) - 세트가 더 앞으로
          // 나아가지 않는다.
          const behindPos = s.landingPos.clone().addScaledVector(s.throwDir, -this.collisionRadius - getCollisionRadius(s.target));
          this.root.position.set(behindPos.x, 0, behindPos.z);
          if (s.target) s.target.mesh.position.set(s.landingPos.x, 0, s.landingPos.z);
          console.log('[SETT R] LANDING');
          this._settRImpact(s);
          console.log('[SETT R] IMPACT DAMAGE');
          this._settEndR(s, false);
        },
        onCancel: () => { if (this._sett.rSeq) this._settEndR(this._sett.rSeq, true); },
      });
    } else {
      applyStatus(target, { id: 'settR_suppress', type: 'SUPPRESSION', duration: 2, value: 1 });
      seq.phase = 'DASH'; // 클립을 못 찾으면 대기 단계 없이 바로 근사 타이밍으로 진행
      console.log('[SETT R] R 애니메이션 클립을 찾지 못해 근사 타이밍(dt 기반)으로 진행합니다.');
      console.log('[SETT R] DASH START');
    }
    vfx.spawn('r', this.root.position.clone());
  
};

// Extracted from CharacterController: _settUpdateR
CharacterController.prototype._settUpdateR = function(dt) { 
    const seq = this._sett.rSeq;
    if (!seq) return;
    const target = seq.target;
    // 대상이 시퀀스 도중 유효하지 않게 되면(구조상 죽지 않는 학습용
    // 더미라 사실상 발생하지 않지만) 안전하게 즉시 종료한다(요청 20).
    if (!target || !target.hp) { this._settEndR(seq, true); return; }
    seq.timer += dt;
    const d = seq.durations;

    if (seq.phase === 'CAST') return; // 시전 준비(Base) 클립 재생 대기 - onStepStart(1)이 DASH로 넘겨줄 때까지 위치 변화 없음

    // 27차(요청: "세트 궁 모션 이상") - 실제 GLB로 R 전체를 프레임 단위로 추적해 보니:
    //  1) 코드가 출처 없는 포물선(lolRangeToWorld(300) ≈ 2.6)을 루트에 더했는데, Spell4_Grab/
    //     Spin/PowerBomb 클립의 Root 본 트랙에 이미 점프 높이가 들어 있어(골반 기준 최대 약 +0.8)
    //     둘이 겹쳐 골반이 지면 위 4.25까지 떴다(서 있을 때 0.9).
    //  2) GRAB 순간 대상을 세트와 "같은 좌표"로 옮겨 두 모델이 겹쳤고, CARRY 시작에 대상이 앞으로
    //     holdDist만큼 순간이동했다.
    //  3) CARRY에서 세트가 landingPos(대상 착지점)까지 갔다가 PowerBomb 동안 holdDist만큼 "뒤로"
    //     미끄러졌다(대상도 같이 뒤로).
    // 고친 방식: 출처 없는 높이는 지우고 높이는 GLB 클립의 Root 트랙(원본 애니메이션)만 쓴다. 대상은
    // 세트의 양손(L_Hand/R_Hand) 가운데를 따라가게 붙인다(원작처럼 손에 붙잡혀 같이 돈다 - 손에
    // 대상의 몸 가운데를 맞추고 정면으로 대상 반경만큼 띄우는 것은 연출값). 세트의 수평 이동은 grabPoint → settLandPos 한 방향
    // (600유닛)으로만 진행하고, 대상은 PowerBomb 마지막 35% 동안 손 위치에서 착지점으로 내려놓는다.
    const holdDist = this.collisionRadius + getCollisionRadius(target);
    const approachDir = new THREE.Vector3().subVectors(seq.startPos, seq.targetStartPos).setY(0);
    if (approachDir.lengthSq() < 1e-6) approachDir.set(0, 0, 1); else approachDir.normalize();
    const grabPoint = seq.targetStartPos.clone().addScaledVector(approachDir, holdDist).setY(0);
    const settLandPos = seq.landingPos.clone().addScaledVector(seq.throwDir, -holdDist).setY(0);
    const smooth = (x) => { const k = THREE.MathUtils.clamp(x, 0, 1); return k * k * (3 - 2 * k); };
    // 세트 손(양손 가운데)에 붙잡힌 대상의 위치 - 손 본이 없으면(폴백) 세트 정면 holdDist.
    const holdPos = () => {
      const hands = this._settRHands();
      if (hands.length) {
        this.root.updateMatrixWorld(true);
        const mid = new THREE.Vector3(), v = new THREE.Vector3();
        for (const h of hands) mid.add(h.getWorldPosition(v));
        mid.multiplyScalar(1 / hands.length);
        if (seq.targetHeight == null) {
          const box = new THREE.Box3().setFromObject(target.mesh);
          seq.targetHeight = Number.isFinite(box.max.y - box.min.y) && box.max.y > box.min.y ? box.max.y - box.min.y : 1.5;
        }
        // 손이 대상 몸 앞면을 잡도록 대상 중심을 세트 정면으로 대상 반경만큼 띄운다(몸 겹침 방지).
        mid.addScaledVector(seq.throwDir, getCollisionRadius(target) || 0);
        mid.y = Math.max(0, mid.y - seq.targetHeight * 0.5);
        return mid;
      }
      return this.root.position.clone().addScaledVector(seq.throwDir, holdDist).setY(0);
    };

    if (seq.phase === 'DASH') {
      const t = Math.min(1, seq.timer / Math.max(0.01, d.DASH));
      const groundPos = new THREE.Vector3().lerpVectors(seq.startPos, grabPoint, t);
      // 요청: DASH 중에는 지상에서만 접근한다.
      this.root.position.set(groundPos.x, 0, groundPos.z);
      // 버그 수정(핵심): 애니메이션 재생 중(useAnimTiming)일 때는 이 dt
      // 타이머가 아니라 onStepStart 콜백이 다음 단계로 넘긴다 - 타이머가
      // 애니메이션보다 먼저 끝나서 모션을 끊는 문제(요청 1/2/16)를 막는다.
      if (!seq.useAnimTiming && t >= 1) {
        seq.phase = 'GRAB'; seq.timer = 0;
        console.log('[SETT R] GRAB START');
        // 요청 5: GRAB 단계가 시작되는 이 순간에만 물리적으로 붙잡힌
        // 상태로 전환한다(폴백 모드도 애니메이션 모드와 동일하게).
        target.isGrabbedBySett = true;
        console.log('[SETT R] TARGET GRABBED');
      }
      return;
    }
    if (seq.phase === 'GRAB') {
      // 붙잡는 구간 - 세트는 grabPoint에 서고, 대상은 원래 자리에서 세트 손으로 GRAB 클립 길이에
      // 걸쳐 끌려온다(예전처럼 세트와 같은 좌표로 순간이동하지 않는다).
      this.root.position.set(grabPoint.x, 0, grabPoint.z);
      const g = smooth(seq.timer / Math.max(0.01, d.GRAB));
      target.mesh.position.lerpVectors(seq.targetStartPos.clone().setY(0), holdPos(), g);
      if (!seq.useAnimTiming && seq.timer >= d.GRAB) {
        seq.phase = 'CARRY'; seq.timer = 0;
        seq.carryStartSettPos = this.root.position.clone();
        seq.carryStartTargetPos = target.mesh.position.clone();
        console.log('[SETT R] SPIN/CARRY START');
        console.log('[SETT R] CARRY DISTANCE = 600 LOL UNITS');
      }
      return;
    }
    // CARRY + IMPACT(PowerBomb)를 하나의 수평 이동 시간축으로 쓴다 - 세트는 grabPoint에서
    // settLandPos까지 한 방향으로만 간다(뒤로 미끄러지지 않음).
    const travelTotal = Math.max(0.01, d.CARRY + d.IMPACT);
    if (seq.phase === 'CARRY') {
      if (!seq.carryStartSettPos) return; // onStepStart(2)가 아직 안 왔으면(애니메이션 모드) 대기
      const u = Math.min(1, seq.timer / travelTotal);
      const groundPos = grabPoint.clone().lerp(settLandPos, u);
      this.root.position.set(groundPos.x, 0, groundPos.z);
      target.mesh.position.copy(holdPos());
      if (!seq.useAnimTiming && seq.timer >= d.CARRY) {
        // PowerBomb 단계에 진입만 하고, 실제 착지/피해는 그 단계가 "끝나는" 시점에서 처리한다.
        seq.phase = 'IMPACT'; seq.timer = 0;
        seq.impactStartSettPos = this.root.position.clone();
        seq.impactStartTargetPos = target.mesh.position.clone();
        console.log('[SETT R] POWERBOMB START');
      }
      return;
    }
    if (seq.phase === 'IMPACT') {
      // PowerBomb 클립이 재생되는 동안(윈드업~내려찍기) 수평 이동을 마저 끝내고, 클립이 "끝나는"
      // 순간에만 착지/피해가 발생한다. 애니메이션 모드에서는 실제 종료를 sequencePlayer의
      // onComplete가 담당하고, 폴백 모드에서는 이 dt 타이머가 종료까지 담당한다.
      const t = Math.min(1, seq.timer / Math.max(0.01, d.IMPACT));
      const u = Math.min(1, (d.CARRY + seq.timer) / travelTotal);
      const groundPos = grabPoint.clone().lerp(settLandPos, u);
      this.root.position.set(groundPos.x, 0, groundPos.z);
      const down = smooth((t - 0.65) / 0.35);
      target.mesh.position.lerpVectors(holdPos(), new THREE.Vector3(seq.landingPos.x, 0, seq.landingPos.z), down);
      if (!seq.useAnimTiming && t >= 1) {
        this.root.position.set(settLandPos.x, 0, settLandPos.z);
        target.mesh.position.set(seq.landingPos.x, 0, seq.landingPos.z);
        console.log('[SETT R] LANDING');
        this._settRImpact(seq);
        console.log('[SETT R] IMPACT DAMAGE');
        this._settEndR(seq, false);
      }
    }
    // 애니메이션 모드(useAnimTiming)에서는 IMPACT 단계의 실제 종료를
    // sequencePlayer의 onComplete가 담당한다(PowerBomb 클립까지 실제로
    // 다 재생된 뒤 - 요청 14/16).
  
};

// Extracted from CharacterController: _settRImpact
CharacterController.prototype._settRImpact = function(seq) { 
    const cd = this._champData(); const r = cd.R;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    // 버그 수정(공식 수치 확인함 - "Effect Radius: 600"): 예전엔 정확한
    // 반경을 몰라서 200으로 근사했다. 실제로는 600이다.
    const impactRadiusLol = r.impactRadius || 600;
    const impactRadiusWorld = lolRangeToWorld(impactRadiusLol);
    const hits = findEnemiesInRadius(seq.landingPos, impactRadiusLol);
    // 버그 수정(요청 9 "target.maxHp - Sett 기본 HP 같은 방식 금지"): 예전
    // 코드는 붙잡은 대상의 추가 체력을 "대상 최대체력 - 세트 자신의 기본
    // 체력"으로 계산하고 있었다 - 완전히 잘못된 기준(세트 스탯을 상대방
    // 추가체력 계산에 끌어다 씀)이었다. 이제 대상 자신의 bonusHealth
    // 필드를 그대로 사용한다(더미는 챔피언이 아니라 성장/추가 체력
    // 개념이 없는 고정 스탯 대상이라 기본값 0 - 실제 챔피언 대상이라면
    // 그 챔피언 자신의 bonusHealth를 갖고 있어야 한다).
    const grabbedBonusHp = Math.max(0, seq.target.bonusHealth || 0);
    const maxDmg = skillVal(r.maxDamageByLevel, lvl) + r.bonusAdRatio * this._getBonusAD() + grabbedBonusHp * (skillVal(r.bonusHpPercentByLevel, lvl) / 100);
    for (const h of hits) {
      // 버그 수정(요청 10/20/21, 공식 수치 확인함): 예전엔 "1 - 거리/반경"을
      // 임의 공식처럼 쓰고 최소 30%로 clamp했다. 실제로는 공식 확인 결과
      // 착지 중심(epicenter)은 100%, Effect Radius 끝(600)에서 정확히
      // 25%로 감소한다(surrounding 수치가 center 수치의 정확히 25%인 것을
      // 여러 공략 사이트에서 교차 확인 - 50/200=75/300=100/400=0.25,
      // AD/보너스체력 계수도 전부 정확히 25% 비율). 별도의 "surrounding
      // 전용 공식"을 새로 만들지 않고, center 공식에 이 falloff 비율만
      // 곱해서 "중심/주변 피해"를 하나의 연속적인 감쇠로 구현한다 -
      // 붙잡힌 대상은 거리 0(착지 지점)이라 falloff=1(=epicenter 취급)이
      // 자연스럽게 성립된다.
      const floor = r.shockwaveFalloffFloor != null ? r.shockwaveFalloffFloor : 0.25;
      const falloff = impactRadiusWorld > 0 ? THREE.MathUtils.clamp(1 - (1 - floor) * (h.distance / impactRadiusWorld), floor, 1) : 1;
      const dmg = maxDmg * falloff;
      applyDamage(h.unit, { isUltimate: true, rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
      applyStatus(h.unit, { id: 'settR_slow', type: 'SLOW', duration: r.slowDuration, value: r.slowPercent / 100 });
      console.log(`[SETT R] IMPACT -> ${unitLabel(h.unit)}: dist=${h.distance.toFixed(2)} falloff=${(falloff * 100).toFixed(0)}% dmg=${dmg.toFixed(1)}`);
    }
    // 27차: 착지 표시를 공중 스프라이트 대신 실제 판정 반경(impactRadius 600) 지면 충격파로(색/수명은 연출값).
    vfx.groundShockwave(seq.landingPos, impactRadiusWorld, 0xffb070, 0.5);
    console.log(`[SETT R] IMPACT damage applied to ${hits.length} target(s), grabbedBonusHp=${grabbedBonusHp.toFixed(0)}, maxDmg=${maxDmg.toFixed(1)}`);
  
};

// Extracted from CharacterController: _settEndR
CharacterController.prototype._settEndR = function(seq, aborted) { 
    const target = seq.target;
    if (target) {
      target.isGrabbedBySett = false;
      clearStatus(target, 'settR_suppress');
      refreshUnitCcTags(target);
    }
    this._sett.rSeq = null;
    this.currentActionKey = null; this.currentPhase = null;
    if (aborted && this.sequencePlayer && this.sequencePlayer.isPlaying) this.sequencePlayer.cancel();
    this._resumeAfterAction(); // 요청 9/19: 대기 중이던 이동 명령/재교전을 자연스럽게 이어간다
    console.log(`[SETT R] R_STATE_END${aborted ? ' (대상 무효화로 안전 종료)' : ''}`);
    console.log('[SETT R] R COMPLETE');
  
};


// 27차: 세트 R에서 대상을 붙잡는 손 본(L_Hand/R_Hand) - 모델별로 한 번만 찾아 둔다.
CharacterController.prototype._settRHands = function() {
  if (this._settHandsModel !== this.model) {
    const hands = [];
    if (this.model) this.model.traverse((o) => { if (o.isBone && /^(l|r)_hand$/i.test(o.name)) hands.push(o); });
    this._settHands = hands; this._settHandsModel = this.model;
  }
  return this._settHands;
};
