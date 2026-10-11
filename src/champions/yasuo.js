// Extracted from CharacterController: _yasuoLevelValue
CharacterController.prototype._yasuoLevelValue = function(arr, lvl) {  return arr[Math.max(1, Math.min(arr.length, lvl)) - 1];
};

// 강철 폭풍 쿨다운/시전 시간 공용 감소율. 추가 공격 속도(레벨 성장분 포함)
// 1%당 쿨다운 0.6%(최대 66.67%) / 시전 시간 0.41667%(최대 50%) 감소 - 요네와 동일한
// 관계식(요네.bin YoneQ 수치). 버그 수정: 예전 식 (최종공속 - 0.697) / 0.011은
// 100으로 나누는 것을 빠뜨려 추가 공속 2%만 있어도 곧바로 상한(66%)에 붙었다.
CharacterController.prototype._yasuoQReduction = function(perBonusAs, max) {
    const bonusAsPercent = this._totalBonusAttackSpeed() * 100;
    return Math.min(max, Math.max(0, bonusAsPercent * perBonusAs / 100));
};

CharacterController.prototype._yasuoQCooldown = function() {
    const q = this._champData().Q;
    const lvl = Math.max(1, Math.min(5, Number(this.skillLevels.Q) || 1));
    return this._yasuoLevelValue(q.cooldown, lvl) * (1 - this._yasuoQReduction(q.cdReductionPerBonusAs, q.cdReductionMax));
};

CharacterController.prototype._yasuoQCastTime = function() {
    const q = this._champData().Q;
    const lvl = Math.max(1, Math.min(5, Number(this.skillLevels.Q) || 1));
    return this._yasuoLevelValue(q.castTime, lvl) * (1 - this._yasuoQReduction(q.castReductionPerBonusAs, q.castReductionMax));
};

// 치명타 배율 - 다른 챔피언과 같은 기본값(무한의 대검 보너스는 calculateDamage/아래
// Q 계산이 따로 더한다). 치명타 확률 2배/초과분 추가 공격력은 recomputeStats()의
// 공용 처리(applyIntentPassive)가 맡는다.
CharacterController.prototype._yasuoCritMultiplier = function() { return this.stats.critMultiplier || 1.75; };

CharacterController.prototype._yasuoShieldAmount = function() {  const p = this._champData().passive; return p.shieldBase + Math.max(0, this.champLevel - 1) * p.shieldPerLevel;
};

// 결의: 이동한 거리(LoL 단위)만큼 기류를 얻는다. 버그 수정: 예전엔 "월드 거리"에
// LoL 단위 기준값(59.5)을 그대로 적용해, 실제로는 수만 유닛을 걸어야 기류가 찼다.
CharacterController.prototype._yasuoGainFlowFromMovement = function(dt) {
    if (!this._yasuo || this.state === STATE.DEAD) return;
    if (!this._yasuo.lastMovePosition) this._yasuo.lastMovePosition = this.root.position.clone();
    const dWorld = this.root.position.distanceTo(this._yasuo.lastMovePosition); this._yasuo.lastMovePosition.copy(this.root.position);
    if (dWorld <= 0 || this._yasuo.flow >= 100) return;
    const p = this._champData().passive;
    const unitsPerStack = valueByBreakpoints(p.flowUnitsPerStack, this.champLevel || 1);
    this._yasuo.flow = Math.min(p.flowMax || 100, this._yasuo.flow + worldDistanceToLol(dWorld) / unitsPerStack);
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
    // 버그 수정: (1) 치명타가 항상 터지도록 crit=true로 고정돼 있었고, (2) 이미 치명타
    // 배율을 곱해 둔 계수(critTotalAdRatio)에 isCritical로 배율을 "한 번 더" 곱해 Q 피해가
    // 약 1.8배 부풀었다. 이제 치명타 확률대로 굴리고, 치명타면 AD 계수 부분에만 치명타
    // 배율(+무한의 대검)을 곱한다(기본 피해는 치명타 영향 없음). 같은 Q 한 번에 맞은
    // 대상들은 한 번 굴린 결과(_yasuoQCritRoll)를 공유한다.
    const crit = this._yasuoQCritRoll != null ? this._yasuoQCritRoll : (Math.random() < (this.stats.critChance || 0));
    const critMult = this._yasuoCritMultiplier() + (this.itemBonusCritDamagePercent || 0);
    const raw = base + this.stats.attackDamage * q.totalAdRatio * (crit ? critMult : 1);
    const first = !this._yasuoQHitConsumed;
    // R 이후 15초 "치명타 공격"의 추가 방어력 무시는 치명타가 실제로 터졌을 때만.
    applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true, bonusArmorIgnorePercent: (crit && this._yasuo.rArmorBuffUntil > performance.now() ? this._champData().R.armorIgnoreBonusPercent : 0), source: this });
    if (first) this._yasuoQHitConsumed = true;
    if (tornado) applyStatus(target, { id:'yasuoQKnockup', type:'KNOCKUP', duration:q.knockupDuration, value:1 });
    return raw;

};

// Extracted from CharacterController: _yasuoFindQTargets
// Q1/Q2 직선(사거리 450, 폭 80) / EQ 원형 판정. 버그 수정: 예전엔 인자 자리에
// this를 넣어 옵션이 통째로 무시되고(직선이 아니라 원형 판정) 반환값도 {unit} 객체
// 배열이라 호출부와 형식이 달랐다. 또 실제 Q는 "부채꼴"이 아니라 일정 폭의 직선이다.
CharacterController.prototype._yasuoFindQTargets = function(dir, range, radius = null) {
    const alive = (u) => u && u.hp > 0;
    if (radius != null) return findEnemiesInRadius(this.root.position, radius).map(h => h.unit).filter(alive);
    const q = this._champData().Q;
    return findEnemiesInLine(this.root.position, dir, range, q.width || 80).filter(alive);
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
      halfWidth: lolRangeToWorld(q.tornadoWidth != null ? q.tornadoWidth : 180) * 0.5, // 예전엔 "폭" 값을 반폭으로 써서 판정이 2배 넓었다
      speed: lolRangeToWorld(q.tornadoSpeed != null ? q.tornadoSpeed : 1000),
      traveled: 0,
      hitSet: new Set(),
      critRoll: Math.random() < (this.stats.critChance || 0),
    };
    // 회오리를 날리는 순간 중첩을 소모한다 - 예전엔 회오리가 끝까지 날아간 "뒤"에야
    // 0으로 돌려서, 비행 중(약 1초)에 Q를 다시 쓰면 회오리가 또 나갔다.
    this._yasuo.qStacks = 0;
    if (typeof window !== 'undefined' && window.yasuoSetQStacks) window.yasuoSetQStacks(0);
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
        this._yasuoQCritRoll = travel.critRoll;
        this._yasuoApplyQHit(u, { tornado: true, circle: false });
        this._yasuoQCritRoll = null;
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
    // 버그 수정: 예전엔 여기서 skillLevels.Q를 강제로 1 이상으로 덮어써, 스킬 포인트를
    // 찍지 않은 Q도 _payCost()의 "아직 배우지 않음" 검사를 통과했다.
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
      // E 돌진 중 Q(EQ): 원작은 시전 시간 없이, 돌진이 "끝나는 순간" 야스오 주변
      // 원형 범위를 친다(3중첩이면 그 원 안 전원 공중에 뜸). 버그 수정: 예전엔 별도
      // 타이머로 시전 시간 뒤에 판정했고, 3중첩 EQ의 반경으로 회오리 사거리(1150)를
      // 써서 주변 1150 안의 모든 적을 띄웠다.
      this._yasuoQHitConsumed = false;
      this.playFirstAvailable(['Spell1_Dash'], { loop: THREE.LoopOnce, fade: 0.03, clampWhenFinished: true });
      this._yasuo.eqPending = { tornado: stackBefore >= 2, stackBefore, dir: dir.clone() };
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
      const unique = this._yasuoFindQTargets(dir, q.range);
      this._yasuoQCritRoll = Math.random() < (this.stats.critChance || 0);
      for (const t of unique) this._yasuoApplyQHit(t, { tornado:false, circle:false });
      this._yasuoQCritRoll = null;
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
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint,this.root.position).setY(0) : new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion); if(dir.lengthSq()<1e-6)dir.set(0,0,1);dir.normalize();
    // 버그 수정: Spell2_0/90/-90/180/-180은 "야스오가 보는 방향 기준" 시전 방향별 모션이다
    // (몸을 돌리지 않고 옆/뒤로 장막을 펼침). 예전엔 먼저 몸을 시전 방향으로 돌려 놓고
    // 월드 좌표 각도로 클립을 골라서, 화면상 방향에 따라 엉뚱한 옆/뒤 모션이 나왔다.
    const local = dir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    const angle = Math.atan2(local.x, local.z) * 180 / Math.PI; // 0=정면, +90=오른쪽
    let anim; if(angle>=135||angle<=-135) anim=angle>=0?'Spell2_180':'Spell2_-180'; else if(angle>45) anim='Spell2_90'; else if(angle<-45) anim='Spell2_-90'; else anim='Spell2_0';
    if (!this.findAnimation(anim)) anim = 'Spell2_BASE';
    const clip=this.findAnimation(anim); const dur=clip?clip.duration:0.35;
    this.currentActionKey='yasuoW'; this.currentPhase='ACTIVE'; this.setState(STATE.W_CAST);
    this.runAction('yasuoW',STATE.W_CAST,{startupOverride:Math.min(0.25,dur),recoveryOverride:Math.max(0.05,dur-Math.min(0.25,dur)),dataOverride:{clips:[anim],startup:Math.min(0.25,dur),recovery:Math.max(0.05,dur-Math.min(0.25,dur)),cancelToMove:false,cancelToSpell:false,cancelable:false,dmg:0},onFire:()=>{ this._yasuoCreateWindwall(dir,width); }});
    if(!free) this.cooldowns.W=abilityHasteCooldown(this, this._yasuoLevelValue(w.cooldown,lvl));

};

// Extracted from CharacterController: _yasuoCreateWindwall
CharacterController.prototype._yasuoCreateWindwall = function(dir,width) {
    // 바람 장막은 시전한 자리에 고정된다 - 예전엔 판정 기준점이 매 프레임 야스오의
    // 현재 위치라 야스오를 따라다녔다(projectile_system.js가 origin을 읽음).
    const w = this._champData().W;
    this._yasuo.windwall={dir:dir.clone(),origin:this.root.position.clone(),width:lolRangeToWorld(width),expiresAt:performance.now()+(w.duration||4)*1000,createdAt:performance.now()};

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
    if (this._yasuo.eqPending) { const eq = this._yasuo.eqPending; this._yasuo.eqPending = null; this._yasuoResolveEQ(eq); }

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
    // 버그 수정(원작 대조): 질풍검은 대상을 "관통해" 고정 거리(475)만큼 돌진한다.
    // 예전엔 대상 바로 앞에서 멈췄다. 돌진 속도는 750 + 이동 속도의 60%(LoL 단위).
    const dashLol = e.dashDistance || 475;
    const end = start.clone().addScaledVector(dir, lolRangeToWorld(dashLol));
    const map = (typeof window !== 'undefined' && window.HOWLING_ABYSS_MAP) || null;
    if (map && typeof map.clampPosition === 'function') map.clampPosition(end);
    end.y = start.y;
    const msWorld = typeof getFinalMoveSpeed === 'function' ? getFinalMoveSpeed(this.stats) : 0;
    const moveSpeedLol = msWorld > 0 ? worldDistanceToLol(msWorld) : CHAMPION_DATA.yasuo.stats.moveSpeed;
    const dashSec = dashLol / ((e.dashSpeedBase || 750) + (e.dashSpeedMsRatio || 0.6) * moveSpeedLol);

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
    this._yasuo.eDashDuration = Math.max(0.12, dashSec);
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
    const targets = this._yasuoFindRTargets(anchor);
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
        // 버그 수정: 계수는 "추가" 공격력 150%다(예전엔 총 공격력에 곱함).
        const raw=this._yasuoLevelValue(r.damageByLevel,lvl)+r.bonusAdRatio*this._getBonusAD();

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

// R 활성 조건/기준 대상: 사거리(1400) 안의 "공중에 뜬 적 챔피언". 버그 수정: 예전엔
// 미니언 등 모든 유닛을 받았다(원작 R은 챔피언 전용).
CharacterController.prototype._yasuoRCandidates = function() {
    const range = this._champData().R.range;
    return (findEnemiesInRadius(this.root.position, range) || []).map(h => h.unit)
      .filter(t => t && t.hp > 0 && t.isChampion && hasStatus(t, 'KNOCKUP'));
};
CharacterController.prototype._yasuoFindRTarget = function() {
    const eligible = this._yasuoRCandidates();
    if (this.currentTarget && this.currentTarget.hp > 0 && eligible.includes(this.currentTarget)) return this.currentTarget;
    eligible.sort((a,b) =>
      this.root.position.distanceToSquared(getWorldPosition(a)) -
      this.root.position.distanceToSquared(getWorldPosition(b))
    );
    return eligible[0] || null;
};

// 함께 맞는 대상: 기준 대상 주변 targetRadius(400) 안의 공중에 뜬 적 챔피언.
// 버그 수정: 예전엔 "야스오 주변 1400 안"의 공중에 뜬 모든 유닛을 끌어모았다.
CharacterController.prototype._yasuoFindRTargets = function(anchor) {
    const r = this._champData().R;
    const eligible = this._yasuoRCandidates();
    if (!anchor) return eligible;
    const center = getWorldPosition(anchor);
    const radius = lolRangeToWorld(r.targetRadius || 400);
    return eligible.filter(t => t === anchor || isInCircle(t, center, radius));
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
    // 결의 보호막은 1초 뒤 남은 만큼 사라진다(예전엔 영구 보호막이었다).
    if (this._yasuo.shieldExpiresAt && performance.now() >= this._yasuo.shieldExpiresAt) {
      this.shield = Math.max(0, (this.shield || 0) - Math.min(this._yasuo.shieldApplied || 0, this.shield || 0));
      this._yasuo.shieldExpiresAt = 0; this._yasuo.shieldApplied = 0; updateBars(this);
    }

};

// Extracted from CharacterController: _yasuoOnTakeDamage
// 결의: 기류가 가득 찬 상태에서 "챔피언/몬스터"에게 피해를 받으면 1초 보호막.
// 버그 수정: 예전엔 출처를 가리지 않았고(포탑/미니언 포함) 보호막이 사라지지 않았다.
CharacterController.prototype._yasuoOnTakeDamage = function(source) {
    if (this._yasuo.flow < 100) return;
    if (source && !(source.isChampion || source.isMonster || source.championId)) return;
    const amt = this._yasuoShieldAmount() * getShieldReceivedMultiplier(this);
    this.shield = Math.max(0, this.shield || 0) + amt;
    this._yasuo.shieldApplied = amt;
    this._yasuo.shieldExpiresAt = performance.now() + (this._champData().passive.shieldDurationSec || 1) * 1000;
    this._yasuo.flow = 0;
    updateBars(this);
};

// EQ 판정(돌진 종료 시점): 야스오 주변 원형(circleRadius). 3중첩이면 원 안 전원 공중에 뜸.
CharacterController.prototype._yasuoResolveEQ = function(eq) {
    const q = this._champData().Q;
    const unique = this._yasuoFindQTargets(eq.dir, q.range, q.circleRadius);
    this._yasuoQHitConsumed = false;
    this._yasuoQCritRoll = Math.random() < (this.stats.critChance || 0);
    for (const t of unique) this._yasuoApplyQHit(t, { tornado: eq.tornado, circle: true });
    this._yasuoQCritRoll = null;
    if (unique.length) {
      this._yasuo.qStacks = eq.tornado ? 0 : Math.min(2, eq.stackBefore + 1);
      this._yasuo.qStackExpiresAt = performance.now() + q.stackDuration * 1000;
    } else if (eq.tornado) this._yasuo.qStacks = 0;
    if (typeof window !== 'undefined' && window.yasuoSetQStacks) window.yasuoSetQStacks(this._yasuo.qStacks);
    if (eq.tornado) vfx.spawn('q', this.root.position.clone(), eq.dir, { tornado: true, size: 1.25 });
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

