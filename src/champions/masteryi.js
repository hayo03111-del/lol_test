// Extracted from CharacterController: _masteryiOnBasicAttackHit
CharacterController.prototype._masteryiOnBasicAttackHit = function(target) {
    const cd = this._champData(); if (!cd) return;
    const p = cd.passive;
    // 디버그(Q 쿨다운 버그 문서 섹션 5) - 일반 평타에서만 Q 쿨다운이
    // 실제로 줄어든다는 것을 콘솔에서 바로 확인할 수 있게 전/후 값을 함께 찍는다.
    const qCdBefore = this.cooldowns.Q;
    if (this.cooldowns.Q > 0) this.cooldowns.Q = Math.max(0, this.cooldowns.Q - cd.Q.basicAttackCdrSec);
    const attackCountBefore = this._masteryi.attackCount || 0;
    this._masteryi.attackCount = attackCountBefore + 1;
    console.log(`[BASIC ATTACK] Q CD: ${qCdBefore.toFixed(1)} -> ${this.cooldowns.Q.toFixed(1)} | Passive: ${attackCountBefore % p.everyNAttacks}/${p.everyNAttacks} -> ${this._masteryi.attackCount % p.everyNAttacks}/${p.everyNAttacks}`);
    // GLB 패시브 4타 연동 문서 섹션 1/6: 카운터가 (everyNAttacks-1)에 도달한
    // 시점 - 즉 "방금 이 공격으로 다음 스윙이 4번째가 됨" - 에 다음 평타의
    // 애니메이션을 masteryi_2013_passive.anm으로 예약한다. 실제 보너스
    // 피해/쿨감 로직(바로 아래 분기)은 문서 6절 "카운터는 4타가 확정된
    // 시점에 초기화"에 맞춰 그대로 유지하고 손대지 않았다 - 여기서 바뀌는
    // 것은 오직 "무슨 애니메이션이 재생되는가"뿐이다(애니메이션과 게임플레이
    // 판정 분리, 문서 4/18절).
    if (this._masteryi.attackCount % p.everyNAttacks === p.everyNAttacks - 1) {
      this._masteryiArmPassiveAttack();
    }
    if (this._masteryi.attackCount % p.everyNAttacks === 0) {
      const willCrit = this._rollBasicAttackCrit(); // 2연속 공격 2타도 기본 공격 치명타 판정(PRD)
      const dmg = this.stats.attackDamage * p.secondHitAdRatio;
      const hpB = target.hp;
      const dealt2 = applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: willCrit, critMultiplier: this.stats.critMultiplier, isBasicAttack: true }) || 0;
      if (hpB > 0 && hpB <= dealt2) this._masteryiOnKill(target, { type: 'BASIC_ATTACK' }); // 실제 피해 기준
      debugSkillHit('Master Yi passive (2nd strike)', target);
      // 2연속 공격의 두 번째 타격도 적중 시 효과가 적용된다(원작) - E 고정 피해가
      // 2타에도 붙는다. 예전엔 1타에만 붙었다.
      this._masteryiApplyWujuTrueDamage(target);
    }
    // E(우주류 검술) 활성 중이면 모든 기본 공격에 고정 피해 추가.
    this._masteryiApplyWujuTrueDamage(target);

};

// E(우주류 검술) 활성 중 기본 공격 적중 시 고정 피해(평타 1타/2연속 공격 2타 공용).
CharacterController.prototype._masteryiApplyWujuTrueDamage = function(target, applyFn = null) {
    if (!target || target.hp <= 0 || !hasStatus(this, 'MASTERYI_E')) return;
    const cd = this._champData(); if (!cd) return;
    const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    const trueDmg = skillVal(e.trueDamageByLevel, lvl) + e.bonusAdRatio * this._getBonusAD();
    // 90차(QA): 우주류 검술 고정 피해는 기본 공격 적중 효과(원작) - 스킬 피해 증폭·스킬 전용 아이템 효과 없음, 생명력 흡수 적용,
    // 구조물에도 들어간다(구조물이면 그 전용 피해 함수로). 처치 판정은 실제로 적용한 결과로(보호막에 막히면 처치가 아니다).
    const hpBefore = target.hp;
    const hit = { rawDamage: trueDmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, canDamageStructures: true, isBasicAttack: true, isOnHitBonus: true, isAbility: false, source: this };
    if (applyFn) { applyFn(target, hit); return; }
    applyDamage(target, hit);
    if (hpBefore > 0 && target.hp <= 0) this._masteryiOnKill(target, { type: 'BASIC_ATTACK' });
};

// Extracted from CharacterController: _masteryiArmPassiveAttack
CharacterController.prototype._masteryiArmPassiveAttack = function() {
    const passive = this.actionData && this.actionData.passive;
    if (!passive || !passive.clips || !passive.clips.length) return;
    // beatsCrit:true - 4번째 평타는 이 스윙 자체가 치명타든 아니든 항상
    // masteryi_2013_passive.anm 애니메이션으로 보여준다(요청: "패시브
    // 공격일 때는 크리티컬이어도 패시브 애니메이션을 내보낸다"). 단,
    // 피해 계산의 치명타 여부(willCrit)는 애니메이션 선택과 완전히
    // 무관하게 그대로 독립적으로 판정되어 정확히 적용된다 - 아래
    // _beginAttackSwing()에서 "beatsCrit 오버라이드가 있으면 크리티컬
    // 애니메이션 분기보다 먼저 소비하되, willCrit 자체는 건드리지 않는다"
    // 순서로 처리한다.
    this.registerAttackOverride({ id: 'masteryiPassive', clips: passive.clips, priority: 40, oneShot: true, uses: 1, beatsCrit: true });

};

// Extracted from CharacterController: _masteryiIsChampionTarget
CharacterController.prototype._masteryiIsChampionTarget = function(target) {
    // 이 프로젝트에는 실제 미니언/몬스터 분류 시스템이 따로 없고, 현재
    // 씬의 모든 적은 학습용 허수아비(isTrainingDummy)뿐이다. 그래서
    // "챔피언급 유닛인가"의 유일하게 신뢰 가능한 신호는 isTrainingDummy가
    // 아니라는 것 - 나중에 실제 챔피언/미니언/몬스터 유닛이 추가되면 이
    // 함수 한 곳만 확장하면 된다.
    // 업데이트: 학습용 허수아비도 isChampion:true인 "챔피언 역할" 유닛이다 - 다만
    // 2% 바닥에 이미 멈춘 허수아비를 계속 때리는 것은 새 처치가 아니므로 제외한다
    // (예전엔 허수아비 자체를 통째로 제외해 처치 쿨감/R 연장을 시험할 방법이 없었다).
    return !!target && !!target.isChampion && !isFlooredTrainingDummy(target);

};

// Extracted from CharacterController: _masteryiOnKill
CharacterController.prototype._masteryiOnKill = function(target, context) {
    const cd = this._champData(); if (!cd) return;
    const label = context && context.type ? `[${context.type}]` : '[TAKEDOWN]';
    if (!this._masteryiIsChampionTarget(target)) {
      console.log(`${label} Unit takedown (${unitLabel(target)}) - no champion cooldown reduction.`);
      return;
    }
    console.log(`${label} Champion takedown (${unitLabel(target)}) - Q/W/E cooldown: Q ${this.cooldowns.Q.toFixed(1)} / W ${this.cooldowns.W.toFixed(1)} / E ${this.cooldowns.E.toFixed(1)} -> ×0.3`);
    this.cooldowns.Q = Math.max(0, this.cooldowns.Q * 0.3);
    this.cooldowns.W = Math.max(0, this.cooldowns.W * 0.3);
    this.cooldowns.E = Math.max(0, this.cooldowns.E * 0.3);
    debugSkillHit('Master Yi passive (처치 관여 - 기본 스킬 쿨감 70%)', this);
    if (this._masteryi.rActiveUntil && performance.now() < this._masteryi.rActiveUntil) {
      const r = cd.R;
      const lvl = Math.max(1, this.skillLevels.R || 1);
      this._masteryi.rActiveUntil += r.takedownExtendSec * 1000;
      const remainSec = (this._masteryi.rActiveUntil - performance.now()) / 1000;
      applyStatus(this, { id: 'masteryiR_as', type: 'MASTERYI_R_AS', duration: remainSec, value: skillVal(r.attackSpeedPercentByLevel, lvl) / 100 });
      applyStatus(this, { id: 'masteryiR_ms', type: 'MS_BUFF', duration: remainSec, value: skillVal(r.moveSpeedPercentByLevel, lvl) / 100 });
      this.setSubState('R', remainSec);
      debugSkillHit('Master Yi R (처치 관여 - 지속시간 +7초)', this, { remainSec: remainSec.toFixed(1) });
    }

};

// Extracted from CharacterController: _masteryiIsValidAlphaTarget
CharacterController.prototype._masteryiIsValidAlphaTarget = function(unit) {
    return !!unit && unit.hp > 0 && !unit.isUntargetable;

};

// Extracted from CharacterController: _masteryiFindPrimaryTarget
CharacterController.prototype._masteryiFindPrimaryTarget = function(q) {
    if (this.currentTarget && this._masteryiIsValidAlphaTarget(this.currentTarget) && isInRange(this, this.currentTarget, q.range)) {
      return this.currentTarget;
    }
    const hits = findEnemiesInRadius(this.root.position, q.range);
    let nearest = null;
    for (const h of hits) {
      if (!this._masteryiIsValidAlphaTarget(h.unit)) continue;
      if (!nearest || h.distance < nearest.distance) nearest = h;
    }
    return nearest ? nearest.unit : null;

};

// Extracted from CharacterController: _masteryiFindNextAlphaTarget
CharacterController.prototype._masteryiFindNextAlphaTarget = function(alpha) {
    const origin = (alpha.primaryTarget && alpha.primaryTarget.hp > 0) ? getWorldPosition(alpha.primaryTarget) : this.root.position;
    // 버그 수정: markSearchRadiusFallback(8.0)은 findEnemiesInRadius가 LoL
    // 원본 사거리를 그대로 world 거리로 오인하던 시절의 임시 보정값이었다.
    // 이제 findEnemiesInRadius가 LoL 단위를 받아 내부에서 변환하므로,
    // 별도 보정 없이 Q의 실제 사거리(alpha.q.range, LoL 600)를 그대로 쓴다.
    const searchRadius = alpha.q.range;
    const hits = findEnemiesInRadius(origin, searchRadius);
    let bestFresh = null, bestAny = null;
    for (const h of hits) {
      if (!this._masteryiIsValidAlphaTarget(h.unit)) continue;
      if (!bestAny || h.distance < bestAny.distance) bestAny = h;
      if (!alpha.alreadyHitCount.has(h.unit) && (!bestFresh || h.distance < bestFresh.distance)) bestFresh = h;
    }
    const picked = bestFresh || bestAny;
    if (picked) return picked.unit;
    // 사거리 안에 살아있는 적이 전혀 없으면(전멸/도주) primaryTarget이라도
    // 아직 유효하면 재사용, 그마저 없으면 null(해당 타격은 스킵 - 섹션 27).
    return (alpha.primaryTarget && alpha.primaryTarget.hp > 0 && !alpha.primaryTarget.isUntargetable) ? alpha.primaryTarget : null;

};

// Extracted from CharacterController: _masteryiMarkAlphaTarget
CharacterController.prototype._masteryiMarkAlphaTarget = function(alpha, unit) {
    alpha.markedTargets.push(unit);
    vfx.spawn('q', getWorldPosition(unit).clone()); // 참격 이펙트(섹션 21) - 기존 q VFX 재사용

};

// Extracted from CharacterController: _masteryiCalcAlphaStrikeDamage
CharacterController.prototype._masteryiCalcAlphaStrikeDamage = function(alpha, hitIndex) {
    const q = alpha.q, lvl = alpha.lvl;
    // PC 위키(Template:Data Master Yi/Alpha Strike): 20~100 + "총" 공격력 70%(예전엔 추가
    // 공격력에 곱했다). 몬스터에게는 추가 물리 피해 60~160. 같은 대상 반복 타격은 25%.
    let base = skillVal(q.baseDamageByLevel, lvl) + q.adRatio * this.stats.attackDamage;
    if (alpha.currentTarget && alpha.currentTarget.isMonster) base += skillVal(q.monsterBonusDamageByLevel, lvl);
    return hitIndex === 0 ? base : base * (q.extraHitPercent / 100);

};

// Extracted from CharacterController: _masteryiCalcAlphaStrikeCritDamage
CharacterController.prototype._masteryiCalcAlphaStrikeCritDamage = function(alpha, hitIndex) {
    const q = alpha.q, lvl = alpha.lvl;
    // 치명타: V25.16부터 치명타 추가 피해 계수가 기본값(100%)이 됐다 - 일반 치명타 배율(+무한의
    // 대검)을 그대로 곱한다. 예전엔 별도 표(40~200 + 추가 공격력 140%)를 썼다.
    return this._masteryiCalcAlphaStrikeDamage(alpha, hitIndex) * ((this.stats.critMultiplier || 1.75) + (this.itemBonusCritDamagePercent || 0));

};

// Extracted from CharacterController: _masteryiRollAlphaStrikeHit
CharacterController.prototype._masteryiRollAlphaStrikeHit = function(alpha, hitIndex) {
    const willCrit = Math.random() < this.stats.critChance;
    const dmg = willCrit ? this._masteryiCalcAlphaStrikeCritDamage(alpha, hitIndex) : this._masteryiCalcAlphaStrikeDamage(alpha, hitIndex);
    return { dmg, willCrit };

};

// Extracted from CharacterController: _masteryiApplyAlphaStrikeOnHit
CharacterController.prototype._masteryiApplyAlphaStrikeOnHit = function(alpha, target) {
    if (!target || target.hp <= 0) return;
    if (!hasStatus(this, 'MASTERYI_E')) return;
    const cd = this._champData(); if (!cd) return;
    const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    // "추가 공격력" = 현재 AD - 현재 레벨 기본 AD(_getBonusAD). 예전 식(현재 AD - 1레벨
    // 기본 AD)은 레벨 성장 AD까지 추가 공격력으로 잘못 셌다.
    const fullTrueDmg = skillVal(e.trueDamageByLevel, lvl) + e.bonusAdRatio * this._getBonusAD();
    const modifier = alpha.q.onHitModifier ?? 0.75;
    const trueDmg = fullTrueDmg * modifier;
    if (trueDmg <= 0) return;
    // 91차: 적중 효과 피해로 분류(스킬 증폭·스킬 룬이 걸리지 않게 - 평타에 붙는 E와 같은 플래그), 처치는 실제 적용 뒤 판정.
    const hpBefore = target.hp;
    applyDamage(target, { rawDamage: trueDmg, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, isBasicAttack: true, isOnHitBonus: true, isAbility: false, source: this });
    if (hpBefore > 0 && target.hp <= 0) this._masteryiOnKill(target, { type: 'ALPHA_STRIKE' });

};

// Extracted from CharacterController: _masteryiResolveAlphaStrikeHit
CharacterController.prototype._masteryiResolveAlphaStrikeHit = function(alpha, target, hitIndex, { delayApply = false } = {}) {
    if (!this._masteryiIsValidAlphaTarget(target)) return;
    // 버그 수정(원작 대조): "같은 대상에 대한 추가 타격"만 25% 피해다. 예전엔
    // 두 번째 이후 타격이면 처음 맞는 다른 대상에게도 25%만 들어갔다.
    const repeatIndex = (alpha.alreadyHitCount.get(target) || 0) > 0 ? 1 : 0;
    alpha.currentTarget = target;
    const { dmg, willCrit } = this._masteryiRollAlphaStrikeHit(alpha, repeatIndex);
    alpha.alreadyHitCount.set(target, (alpha.alreadyHitCount.get(target) || 0) + 1);
    const apply = () => {
      if (!target || target.hp <= 0) return;
      const hpB = target.hp;
      // dmg는 이미 치명타 배율이 반영된 값이라 isCritical로 한 번 더 곱하지 않는다.
      const dealtQ = applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true }) || 0;
      const wouldKill = hpB > 0 && hpB <= dealtQ; // 방어력 적용 후 실제 피해 기준
      vfx.spawn('hit', getWorldPosition(target).clone(), undefined, { color: willCrit ? 0xffdf6b : 0xffffff });
      if (wouldKill) this._masteryiOnKill(target, { type: 'ALPHA_STRIKE' });
      this._masteryiApplyAlphaStrikeOnHit(alpha, target);
      // 91차: 원작 Q는 타격마다 아이템 적중 효과를 75% 효율로 적용한다(크라켄 학살자·종언 등 중첩도 쌓임, 주문 검·룬 제외).
      if (typeof itemOnBasicAttackHit === 'function' && target.hp > 0) {
        this._itemOnHitEffectiveness = alpha.q.onHitModifier ?? 0.75;
        try { itemOnBasicAttackHit(this, target, willCrit, { fromAbility: true }); } finally { this._itemOnHitEffectiveness = null; }
      }
      // 이 프로젝트엔 별도의 "damage number" 팝업 시스템이 없어(섹션 20
      // "가능하다면 재사용" - 없으므로 기존 디버그 로그 시스템을 그대로
      // 재사용) 콘솔/디버그 패널로 각 타격을 확인한다.
      console.log(`[ALPHA STRIKE] Hit ${hitIndex + 1}/${alpha.maxHits} | Q CD: ${this.cooldowns.Q.toFixed(1)} (unchanged) | Passive: ${(this._masteryi.attackCount || 0) % (this._champData().passive.everyNAttacks)}/${this._champData().passive.everyNAttacks} (unchanged)`);
      debugSkillHit(`Master Yi Q (hit ${hitIndex + 1}/${alpha.maxHits}${hitIndex === 0 ? ' - mark' : ''})`, target, { dmg: Math.round(dmg), crit: willCrit });
    };
    if (delayApply) alpha.markDamagePending = apply;
    else apply();

};

// Extracted from CharacterController: _masteryiCalculateAlphaStrikeReappearance
CharacterController.prototype._masteryiCalculateAlphaStrikeReappearance = function(alpha) {
    // 최종 안전망(섹션 25 "대상 사망 시 null reference 금지") - castOrigin이
    // 항상 존재하므로 이것부터 fallback으로 잡아둔다.
    const initialPos = alpha.castOrigin.clone();
    alpha.debug = { usedFallback: false, followLost: false, collisionCorrected: false, raw: null, safe: null };

    const primary = alpha.primaryTarget;
    const primaryValid = this._masteryiIsValidAlphaTarget(primary);

    // 섹션 12/13: 주 대상이 죽었거나(사망) 더 이상 유효한 대상이 아니면(비대상 +
    // 대체 대상 전무 등) Q 시작 위치로 복귀한다 - lastValidPos(마지막으로
    // 이동했던 타격 지점)가 아니라 "Q 최초 시전 위치"를 쓴다(문서에 명시된
    // 정확한 fallback).
    if (!primaryValid) {
      alpha.debug.usedFallback = true;
      alpha.debug.raw = initialPos.clone();
      alpha.debug.safe = initialPos.clone();
      return initialPos;
    }

    // 섹션 3/10: Q 시작 이후 대상이 이동했다면 반드시 "지금 이 순간의" 위치를
    // 쓴다 - Q 시작 당시 위치(primaryTargetInitialPosition)는 오직 "추적
    // 가능 거리" 판정에만 쓰고, 실제 앵커로는 절대 사용하지 않는다.
    const currentTargetPos = getWorldPosition(primary).clone();

    // 섹션 10/11: 대상이 Q 시작 이후 너무 멀리(순간이동성으로) 이동했으면
    // 더 이상 추적하지 않고 Q 시작 위치로 fallback한다.
    const traveled = alpha.primaryTargetInitialPosition ? getHorizontalDistance(alpha.primaryTargetInitialPosition, currentTargetPos) : 0;
    const maxFollow = alpha.q.maxPrimaryTargetFollowDistance != null ? lolRangeToWorld(alpha.q.maxPrimaryTargetFollowDistance) : Infinity;
    if (traveled > maxFollow) {
      alpha.primaryTargetFollowLost = true;
      alpha.debug.followLost = true;
      alpha.debug.usedFallback = true;
      alpha.debug.raw = initialPos.clone();
      alpha.debug.safe = initialPos.clone();
      return initialPos;
    }

    const anchor = currentTargetPos;

    // 섹션 4~9: 우클릭으로 선택한 방향이 있고(canSelectExitDirection이 아직
    // 열려 있던 동안 입력됨) 있으면 그 방향, 없으면 "Q 시작 위치 -> 대상"을
    // 연장한 기본 방향(대상과 마스터 이의 관계로 계산 - 화면 축 고정 금지).
    let dir;
    if (alpha.reemergeDirection) {
      dir = alpha.reemergeDirection.clone();
    } else {
      dir = new THREE.Vector3().subVectors(anchor, alpha.castOrigin);
      dir.y = 0;
    }
    if (!isFinite(dir.x) || !isFinite(dir.z) || dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();

    const targetRadius = getCollisionRadius(primary);
    // 버그 수정: 예전엔 target.collisionRadius × 3.2 근사치를 썼다(75
    // units를 그대로 넣으면 맵 밖으로 튕겨나갔기 때문). 이제
    // lolRangeToWorld()가 있으므로 원작 그대로의 75 units를 직접 쓴다.
    const baseDistance = Math.max(targetRadius * 0.5, lolRangeToWorld(alpha.q.reappearDistance || 75));
    const rawPos = anchor.clone().addScaledVector(dir, baseDistance);
    alpha.debug.raw = rawPos.clone();

    // 섹션 14~16: 벽/장애물 시스템이 없는 데모라 최소한 맵 경계로 판정한다.
    // 75(근사 baseDistance) -> ... -> 15(근사) 순으로 점진적으로 거리를
    // 줄이며 맵 안쪽에 들어오는 첫 위치를 사용한다.
    const half = (typeof groundSize === 'number' ? groundSize : 100) / 2 - 1;
    const isWalkable = (p) => Math.abs(p.x) <= half && Math.abs(p.z) <= half;
    const shrinkSteps = alpha.q.reappearDistanceShrinkSteps || [1.0, 0.8, 0.6, 0.4, 0.2];
    let safePos = rawPos;
    if (!isWalkable(rawPos)) {
      alpha.debug.collisionCorrected = true;
      let found = null;
      for (const factor of shrinkSteps) {
        const candidate = anchor.clone().addScaledVector(dir, baseDistance * factor);
        if (isWalkable(candidate)) { found = candidate; break; }
      }
      safePos = found || anchor.clone(); // 그마저 없으면 대상 바로 옆(가장 안전)
    }
    safePos.x = THREE.MathUtils.clamp(safePos.x, -half, half);
    safePos.z = THREE.MathUtils.clamp(safePos.z, -half, half);
    safePos.y = 0;
    if (!isFinite(safePos.x) || !isFinite(safePos.z)) { alpha.debug.usedFallback = true; safePos = initialPos; }
    alpha.debug.safe = safePos.clone();
    return safePos;

};

// Extracted from CharacterController: _masteryiCastQ
CharacterController.prototype._masteryiCastQ = function(free) {
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    // Master Yi Q는 기본 공격의 STARTUP/ACTIVE/RECOVERY 중에서도 스킬 우선순위를
    // 가진다. 공격 액션 데이터가 cancelToSpell:true인 경우 getActionAuthority()가
    // 이를 허용하며, 여기서는 그 결과를 그대로 사용한다.
    if (!this.canStartNewAction()) return;
    const cd = this._champData(); const q = cd.Q;
    const primaryTarget = this._masteryiFindPrimaryTarget(q);
    if (!primaryTarget) { debugSkillMiss('Master Yi Q', 'no target in range'); return; }
    if (!this._payCost('Q', free)) return;

    this._clearActionTimers();
    this._masteryiCancelAlphaStrike(); // 혹시 이전 잔여 상태가 있으면 정리 후 새로 시작

    const lvl = Math.max(1, this.skillLevels.Q || 1);
    const alpha = {
      phase: 'CAST', // CAST -> MARKING -> REAPPEAR -> DONE
      q, lvl,
      primaryTarget,
      castOrigin: this.root.position.clone(),         // Q 최초 시전 위치(섹션 1) - Q 중 절대 변경하지 않음
      primaryTargetInitialPosition: getWorldPosition(primaryTarget).clone(), // 추적 가능 거리 판정 전용(섹션 2/10/11)
      lastValidPos: this.root.position.clone(),
      markedTargets: [],
      alreadyHitCount: new Map(),
      hitIndex: 0,
      maxHits: Math.max(1, q.hitCount || 4),
      stepElapsed: 0,
      stepDuration: q.hitIntervalSec,
      castElapsed: 0,
      castDuration: Math.max(0.05, q.hitIntervalSec * 0.5),
      reemergeDirection: null,
      canSelectExitDirection: true, // 재등장 계산 직전에 false로 잠긴다(섹션 7)
      primaryTargetFollowLost: false,
      markDamagePending: null,
      pausedBuffs: [],
    };
    this._masteryi.alpha = alpha;

    this.setState(STATE.Q_CAST);
    this.currentActionKey = 'masteryiQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
    this.pendingMove = null;

    // 비대상 상태 진입(섹션 6) - Q 전체 기간 동안 유지.
    this.isUntargetable = true;

    // 모델 비가시화 문서 섹션 1~3: 게임 오브젝트(this.root/this.model)는
    // 그대로 유지하고 렌더링만 끈다. AnimationMixer(this.model에 바인딩됨)는
    // 계속 update(dt)를 받으므로 삭제/재생성하지 않는다 - 다만 화면에는
    // 보이지 않을 뿐이다. isUntargetable(게임플레이 판정)과 모델 가시성
    // (렌더링)은 서로 다른 시스템이라 각각 따로 설정한다(섹션 2).
    if (this.model) this.model.visible = false;

    // E/R 지속시간 일시정지(섹션 15/16) - Q 캐스트 시간만큼 만료 시각을
    // 뒤로 밀어서, tickStatusEffects(dt)가 매 프레임 계속 돌더라도 Q에
    // 소모된 시간만큼 밴드가 "손해보지 않게" 한다. Q 종료 시 되돌리지
    // 않는다(실제 라이브도 Q 시전 시간만큼 R 등 지속시간이 그대로
    // 소모되지 않고 유지되는 쪽에 더 가깝기 때문 - 정확한 정지 규칙은
    // 자료만으로 확정할 수 없어 "밀어주기"로 근사).
    this._masteryiPauseBuffsDuringAlphaStrike(alpha);

    this.playFirstAvailable(this.actionData?.q?.clips || ['Spell1'], { loop: THREE.LoopOnce, fade: 0.08 });
    vfx.spawn('q', this.root.position.clone());
    debugSkillHit('Master Yi Q (Alpha Strike 시작)', primaryTarget, { primaryTarget: unitLabel(primaryTarget) });

};

// Extracted from CharacterController: _masteryiPauseBuffsDuringAlphaStrike
CharacterController.prototype._masteryiPauseBuffsDuringAlphaStrike = function(alpha) {
    alpha._pauseStartedAt = performance.now();

};

// Extracted from CharacterController: _masteryiResumeBuffsAfterAlphaStrike
CharacterController.prototype._masteryiResumeBuffsAfterAlphaStrike = function(alpha) {
    if (!alpha._pauseStartedAt) return;
    const elapsedMs = performance.now() - alpha._pauseStartedAt;
    if (elapsedMs <= 0) return;
    if (this.statusEffects) {
      for (const id of ['masteryiE', 'masteryiR_as', 'masteryiR_ms']) {
        const eff = this.statusEffects.find((e) => e.id === id);
        if (eff) eff.expiresAt += elapsedMs;
      }
    }
    if (this._masteryi.rActiveUntil) this._masteryi.rActiveUntil += elapsedMs;
    if (this.subStates && this.subStates.R) this.subStates.R += elapsedMs;

};

// Extracted from CharacterController: _masteryiUpdateAlphaStrike
CharacterController.prototype._masteryiUpdateAlphaStrike = function(dt) {
    const alpha = this._masteryi && this._masteryi.alpha;
    if (!alpha) return;

    if (alpha.phase === 'CAST') {
      alpha.castElapsed += dt;
      if (alpha.castElapsed >= alpha.castDuration) {
        alpha.phase = 'MARKING';
        alpha.stepElapsed = 0;
        // 재등장 위치 고증 문서 섹션 13: 첫 타격(주 대상) 자체를 찾지
        // 못하면(주 대상이 그 사이 비대상/사망 등으로 무효화됨 & 대체
        // 대상도 전무) 더 진행할 것이 없으므로 즉시 Q를 종료한다.
        if (!this._masteryiBeginNextAlphaHit(alpha)) { this._masteryiFinishAlphaStrike(alpha); return; }
      }
      return;
    }

    if (alpha.phase === 'MARKING') {
      alpha.stepElapsed += dt;
      if (alpha.stepElapsed >= alpha.stepDuration) {
        // 이번 스텝 종료 시점에 타격 확정(마크/표식만 스킬 종료까지 지연).
        const current = alpha.markedTargets[alpha.markedTargets.length - 1];
        this._masteryiResolveAlphaStrikeHit(alpha, current, alpha.hitIndex, { delayApply: alpha.hitIndex === 0 });
        alpha.hitIndex += 1;
        alpha.stepElapsed = 0;
        if (alpha.hitIndex >= alpha.maxHits) {
          alpha.phase = 'REAPPEAR';
          this._masteryiFinishAlphaStrike(alpha);
        } else {
          // 재등장 위치 고증 문서 섹션 13: 다음 타격 대상을 아예 찾지
          // 못하면(전멸/전부 비대상) 남은 스텝을 헛되이 기다리지 않고
          // 즉시 재등장 단계로 넘어간다(hasValidAlternativeTargets() ==
          // false -> finishAlphaStrikeEarly()).
          if (!this._masteryiBeginNextAlphaHit(alpha)) {
            alpha.phase = 'REAPPEAR';
            this._masteryiFinishAlphaStrike(alpha);
          }
        }
      }
      return;
    }

};

// Extracted from CharacterController: _masteryiBeginNextAlphaHit
CharacterController.prototype._masteryiBeginNextAlphaHit = function(alpha) {
    const target = alpha.hitIndex === 0 ? alpha.primaryTarget : this._masteryiFindNextAlphaTarget(alpha);
    alpha.markedTargets.push(target || null);
    if (!target) return false;
    this._masteryiMarkAlphaTarget(alpha, target);
    const p0 = this.root.position.clone();
    const p1 = getWorldPosition(target).clone();
    // 로직 위치: 즉시 대상 인근(충돌 반경 바깥)으로 이동.
    const dir = new THREE.Vector3().subVectors(p0, p1); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    const stopDist = getCollisionRadius(target) + this.collisionRadius * 0.6;
    const hopPos = p1.clone().addScaledVector(dir, stopDist);
    this.root.position.set(hopPos.x, 0, hopPos.z);
    this.faceDirectionInstant(new THREE.Vector3().subVectors(p1, hopPos).setY(0));
    alpha.lastValidPos = hopPos.clone();
    // 화면 연출(섹션 7/21, 모델 비가시화 문서 섹션 5/19) - 실제 GLB 모델은
    // 계속 숨겨진 채로 두고, 이전 위치 -> 이번 위치 사이에 잔상/참격
    // 스프라이트만 표시한다. 타겟마다 모델을 잠깐 보이게 하는 것은 금지
    // (모델 비가시화 문서 섹션 6/19).
    const hopDir = new THREE.Vector3().subVectors(hopPos, p0).setY(0);
    if (hopDir.lengthSq() < 1e-6) hopDir.set(0, 0, 1); else hopDir.normalize();
    vfx.spawn('basicAttack', p0.clone(), hopDir);
    return true;

};

// Extracted from CharacterController: _masteryiFinishAlphaStrike
CharacterController.prototype._masteryiFinishAlphaStrike = function(alpha) {
    // 방향 선택 마감(재등장 알고리즘 문서 섹션 7) - 재등장 계산 시작 이후의
    // 입력은 더 이상 반영하지 않는다.
    alpha.canSelectExitDirection = false;

    const reappearPos = this._masteryiCalculateAlphaStrikeReappearance(alpha);
    this.root.position.set(reappearPos.x, 0, reappearPos.z);

    // 모델 비가시화 문서 섹션 8/13: 위치를 먼저 확정한 다음에야 모델을
    // 다시 보이게 한다.
    if (this.model) this.model.visible = true;
    vfx.spawn('q', reappearPos.clone());

    // 지연됐던 표식(마크) 피해를 이제 적용.
    if (alpha.markDamagePending) { alpha.markDamagePending(); alpha.markDamagePending = null; }

    // E/R 지속시간 재개(섹션 15/19/26) - Q 종료 시점에 한 번에 밀어준다.
    this._masteryiResumeBuffsAfterAlphaStrike(alpha);

    this.isUntargetable = false;
    this._masteryi.alpha = null;
    this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
    this._resumeAfterAction(); // 대기 이동 > 재교전(currentTarget) > Idle 순으로 즉시 복귀(섹션 19) - POST_ALPHA -> NORMAL

};

// Extracted from CharacterController: _masteryiCancelAlphaStrike
CharacterController.prototype._masteryiCancelAlphaStrike = function() {
    if (!this._masteryi || !this._masteryi.alpha) return;
    this._masteryi.alpha = null;
    this.isUntargetable = false;
    if (this.model) this.model.visible = true;

};

// Extracted from CharacterController: _masteryiSetAlphaStrikeReemergeDirection
CharacterController.prototype._masteryiSetAlphaStrikeReemergeDirection = function(worldPoint) {
    const alpha = this._masteryi && this._masteryi.alpha;
    if (!alpha || !alpha.canSelectExitDirection) return false;
    const anchor = (alpha.primaryTarget && alpha.primaryTarget.hp > 0) ? getWorldPosition(alpha.primaryTarget) : this.root.position;
    const dir = new THREE.Vector3().subVectors(worldPoint, anchor); dir.y = 0;
    if (dir.lengthSq() < 1e-6) return true; // 클릭 지점이 대상과 거의 겹치면 무시(방향 불명확)
    alpha.reemergeDirection = dir.normalize();
    return true;

};

// Extracted from CharacterController: _masteryiPauseERForMeditate
CharacterController.prototype._masteryiPauseERForMeditate = function() {
    if (this.championId !== 'masteryi') return;
    if (this._masteryi.wPause) return;
    const now = performance.now();
    const ids = ['masteryiE', 'masteryiR_as', 'masteryiR_ms'];
    const saved = [];
    for (const id of ids) {
      const eff = this.statusEffects?.find((e) => e.id === id && e.expiresAt > now);
      if (eff) saved.push({ id, expiresAt: eff.expiresAt });
    }
    this._masteryi.wPause = { startedAt: now, saved };

};

// Extracted from CharacterController: _masteryiResumeERAfterMeditate
CharacterController.prototype._masteryiResumeERAfterMeditate = function() {
    if (this.championId !== 'masteryi') return;
    const pause = this._masteryi.wPause;
    if (!pause) return;
    const elapsed = Math.max(0, performance.now() - pause.startedAt);
    if (this.statusEffects) {
      for (const rec of pause.saved) {
        const eff = this.statusEffects.find((e) => e.id === rec.id);
        if (eff) eff.expiresAt = Math.max(eff.expiresAt, rec.expiresAt + elapsed);
      }
    }
    if (this._masteryi.rActiveUntil) this._masteryi.rActiveUntil += elapsed;
    const rSub = this.subStates?.R;
    if (rSub?.expiresAt) rSub.expiresAt += elapsed;
    this._masteryi.wPause = null;

};

// Extracted from CharacterController: _masteryiResolveWAnimationClip
CharacterController.prototype._masteryiResolveWAnimationClip = function() {
    // 실제 Master Yi GLB의 확정 클립명을 1순위로 사용한다.
    // import/merge 과정에서 같은 이름에 source suffix가 붙거나 확장자가 달라져도
    // 정규화/부분 일치로 반드시 동일 애니메이션을 찾는다.
    const clips = Array.isArray(this.clips) ? this.clips : [];
    const normalize = (name) => String(name || '')
      .toLowerCase()
      .replace(/\\/g, '/')
      .replace(/\\.anm$/i, '')
      .replace(/[^a-z0-9]+/g, '');
    // 요청: W 애니메이션을 Spell2_Loop로 교체 - 최우선 정확 일치 후보로 추가.
    const loopExact = normalize('Spell2_Loop');
    let clip = clips.find(c => normalize(c.name) === loopExact);
    if (clip) { console.log(`[Master Yi W] Spell2_Loop 클립 사용: ${clip.name}`); return clip; }

    const exact = normalize('masteryi_2013_spell2.anm');
    clip = clips.find(c => normalize(c.name) === exact);
    if (clip) { console.log(`[Master Yi W] 정확히 일치하는 클립 사용: ${clip.name}`); return clip; }

    const candidates = [
      'masteryi_2013_spell2', 'masteryi_spell2',
      'spell2_cast', 'spell2', 'meditate', 'meditation'
    ].map(normalize);
    // 버그 수정 시도(요청: "명상 모션이 이상하다"): 부분 일치 후보가 여러
    // 개일 때 배열에 먼저 나오는 클립을 무조건 집었다 - 만약 그게 Q의
    // 종료 전환 클립(Spell1_to_Spell2_...류, "Q에서 W로 넘어갈 때 쓰는
    // 전환 클립"이지 W 본체가 아님)처럼 이름에 spell2가 우연히 들어간
    // 전환/진입 클립이면, 그 짧은 전환 포즈를 무한 반복(LoopRepeat)해서
    // 매우 부자연스러운 반복 동작으로 보였을 수 있다. 이제 후보 중에서:
    // 1) "loop"가 이름에 포함된 것 최우선
    // 2) 전환/진입 클립으로 보이는 이름(torun/toidle/to_spell/entry/exit/in/out)은
    //    다른 후보가 있으면 제외
    // 순으로 가장 그럴듯한 후보를 고른다.
    const allMatches = clips.filter(c => {
      const n = normalize(c.name);
      return candidates.some(key => n === key || n.includes(key));
    });
    if (allMatches.length) {
      console.log('[Master Yi W] 부분 일치 후보들:', allMatches.map(c => c.name));
      const isTransition = (n) => /torun|toidle|tospell|entry|exit|transition/.test(n);
      const looped = allMatches.find(c => normalize(c.name).includes('loop'));
      const nonTransition = allMatches.filter(c => !isTransition(normalize(c.name)));
      clip = looped || nonTransition[0] || allMatches[0];
      console.log(`[Master Yi W] 최종 선택: ${clip.name}`);
      return clip;
    }

    console.warn('[Master Yi W] animation clip not found', clips.map(c => c.name));
    return null;

};

// Extracted from CharacterController: _masteryiClearWStatuses
CharacterController.prototype._masteryiClearWStatuses = function() {
    if (!this.statusEffects) return;
    this.statusEffects = this.statusEffects.filter((e) =>
      e.id !== 'masteryiW_burst' && e.id !== 'masteryiW_sustain'
    );

};

// Extracted from CharacterController: _masteryiEndMeditate
CharacterController.prototype._masteryiEndMeditate = function(reason = 'natural', movePoint = null) {
    if (this.championId !== 'masteryi') return;
    if (this.currentActionKey !== 'masteryiW') {
      // 이미 종료된 경우에도 E/R pause가 남아 있으면 복구한다.
      this._masteryiResumeERAfterMeditate();
      this._masteryiClearWStatuses();
      return;
    }
    // 진단 로그(요청: "명상이 중간에 끊긴다" 재현 시 원인을 바로 알 수
    // 있도록) - 이제 명상이 어떤 이유로든 끝날 때마다 그 이유와 실제 경과
    // 시간을 콘솔에 남긴다. reason은 'natural'(정상 종료)/'attack'(평타
    // 입력으로 명캔)/'cast'(다른 스킬로 취소)/'move'(이동 명령으로 취소)
    // 중 하나다.
    const elapsedSec = this._masteryi.wStartedAt ? ((performance.now() - this._masteryi.wStartedAt) / 1000).toFixed(2) : '?';
    console.log(`[Master Yi W] 명상 종료 - reason=${reason}, 경과시간=${elapsedSec}s`);

    clearTimeout(this._masteryiWHealTimer);
    this._masteryiWHealTimer = null;
    this._masteryiResumeERAfterMeditate();
    // PC 위키: 명상 피해 감소는 채널이 끝난 뒤 0.5초 더 남는다(예전엔 즉시 제거).
    this._masteryiClearWStatuses();
    {
      const lvlW = Math.max(1, this.skillLevels.W || 1);
      applyStatus(this, { id: 'masteryiW_linger', type: 'DAMAGE_REDUCTION', drGroup: 'masteryiW', halfVsTurret: true,
        duration: 0.5, value: skillVal(this._champData().W.sustainedReductionByLevel, lvlW) / 100 });
    }
    // 모션 반복 방지용으로 등록해둔 loop 이벤트 리스너 정리 - 안 지우면
    // 다음 W 시전 때마다 리스너가 계속 쌓인다.
    if (this._masteryiWLoopHandler) {
      this.mixer.removeEventListener('loop', this._masteryiWLoopHandler);
      this._masteryiWLoopHandler = null;
    }

    // 요청 2/3: W 애니메이션(Loop 클립)을 즉시 멈춘다 - 다음에 재생될
    // 이동/평타 애니메이션이 crossFadeTo로 자연스럽게 덮어쓰긴 하지만,
    // 명시적으로 멈춰서 어떤 경우에도 명상 포즈가 한 프레임도 남지
    // 않도록 보장한다.
    if (this.currentAction) {
      try { this.currentAction.stop(); } catch (_) { /* 이미 정지된 액션이면 무시 */ }
    }
    this.currentAction = null;
    this.currentClipKey = null;

    this.currentActionKey = null;
    this.currentPhase = null;
    this.phaseCancelable = false;

    // 요청 4/6: 이동 명령으로 취소된 경우 - pendingMove를 거치지 않고
    // 기존 이동 확정 함수(_commitMove)를 즉시 호출한다. 다른 종료 사유와
    // 완전히 분리된 전용 분기다.
    if (reason === 'move' && movePoint) {
      this.pendingMove = null;
      this._commitMove(movePoint);
      return;
    }

    if (reason === 'attack') {
      // 명캔: W를 종료한 직후 공격 시스템이 새 평타를 시작할 수 있도록
      // 상태만 자유 상태로 돌린다. 실제 평타 애니메이션은 _beginAttackSwing이 담당.
      this.setState(STATE.IDLE);
    } else {
      this._resumeAfterAction();
    }

};

// Extracted from CharacterController: _masteryiWOnCast
CharacterController.prototype._masteryiWOnCast = function() {
    const cd = this._champData(); if (!cd) return;
    this.resetAttackTimer(); // 83차: 명상은 평타 초기화(원작)
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    this._masteryi.wStartedAt = performance.now(); // 진단 로그용(_masteryiEndMeditate의 경과시간 계산)
    console.log(`[Master Yi W] 명상 시작 - 채널 지속시간 ${w.channelDuration}s`);

    // W 시작 시 E/R 카운트 정지.
    this._masteryiPauseERForMeditate();

    // 이미 남아 있던 W 상태가 있다면 중복시키지 않는다.
    this._masteryiClearWStatuses();
    // 70%(처음 0.5초) → 45~55%는 "같은 스킬의 두 단계"라 서로 곱하지 않는다(drGroup - 같은
    // 그룹은 최대값만). 포탑 피해에는 절반만 적용(halfVsTurret, PC 위키).
    applyStatus(this, {
      id: 'masteryiW_burst', type: 'DAMAGE_REDUCTION', drGroup: 'masteryiW', halfVsTurret: true,
      duration: w.burstReductionDuration,
      value: w.burstReductionPercent / 100
    });
    applyStatus(this, {
      id: 'masteryiW_sustain', type: 'DAMAGE_REDUCTION', drGroup: 'masteryiW', halfVsTurret: true,
      duration: w.channelDuration,
      value: skillVal(w.sustainedReductionByLevel, lvl) / 100
    });
    this._masteryi.wStackAccum = 0;

    // 버그 수정(원작 대조): 명상은 채널 동안 "초당" 체력을 회복한다(잃은 체력에
    // 비례해 최대 100% 증가). 예전엔 4초를 다 채워야 총량을 한 번에 줬고, 3.9초에
    // 평타로 끊으면(명캔) 회복이 0이었다. 이제 _masteryiWTick()이 매 프레임 회복한다.
    clearTimeout(this._masteryiWHealTimer);
    this._masteryiWHealTimer = null;
    this._masteryi.wHealed = 0;

};

// Extracted from CharacterController: _masteryiWTick
CharacterController.prototype._masteryiWTick = function(dt) {
    if (this.championId !== 'masteryi' || this.currentActionKey !== 'masteryiW') {
      this._masteryi.wManaDrainPerSec = 0; // 디버그 패널용 - 명상 중이 아니면 0으로 표시
      return;
    }
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    // PC 위키: 명상 중 1초마다 2연속 공격 중첩 1(최대 3 - 다음 평타가 2연속 공격).
    this._masteryi.wStackAccum = (this._masteryi.wStackAccum || 0) + dt;
    while (this._masteryi.wStackAccum >= 1) {
      this._masteryi.wStackAccum -= 1;
      const n = cd.passive.everyNAttacks;
      const stacks = (this._masteryi.attackCount || 0) % n;
      if (stacks < n - 1) {
        this._masteryi.attackCount = (this._masteryi.attackCount || 0) + 1;
        if (this._masteryi.attackCount % n === n - 1) this._masteryiArmPassiveAttack();
      }
    }
    // 초당 회복: (레벨별 초당 회복 + 주문력 계수/채널 시간) × (1 + 잃은 체력 비율 × 100%).
    if (this.hp > 0 && this.hp < this.maxHp) {
      const lvl = Math.max(1, this.skillLevels.W || 1);
      const missingPercent = this.maxHp ? (this.maxHp - this.hp) / this.maxHp : 0;
      const perSec = (skillVal(w.healPerSecByLevel, lvl) + w.healApRatio * (this.stats.abilityPower || 0) / Math.max(0.1, w.channelDuration))
        * (1 + missingPercent * (w.healMissingHpBonusMaxPercent / 100));
      const heal = perSec * dt * getHealReceivedMultiplier(this);
      this.hp = Math.min(this.maxHp, this.hp + heal);
      this._masteryi.wHealed = (this._masteryi.wHealed || 0) + heal;
      updateBars(this);
    }
    const perSecPercent = w.manaPercentMaxPerSec || 0;
    if (perSecPercent <= 0) return;
    const drainPerSec = this.maxMp * (perSecPercent / 100);
    this._masteryi.wManaDrainPerSec = drainPerSec; // 디버그 패널 표시용(요청 - "W 마나 소모 상태를 확인할 수 있게")
    this.mp = Math.max(0, this.mp - drainPerSec * dt);
    updateBars(this);
    if (this.mp <= 0) {
      // 요청: "마나가 부족해지면 즉시 W를 종료한다."
      console.log('[Master Yi W] 마나 부족으로 명상 강제 종료');
      this._masteryiEndMeditate('mana');
    }

};

// Extracted from CharacterController: _masteryiCastE
CharacterController.prototype._masteryiCastE = function(free) {
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this._payCost('E', free)) return;
    const cd = this._champData(); const e = cd.E;
    applyStatus(this, { id: 'masteryiE', type: 'MASTERYI_E', duration: e.buffDuration, value: 1 });
    vfx.spawn('e', this.root.position.clone()); // 무기 이펙트 ON - action state/애니메이션은 건드리지 않는다
    debugSkillHit('Master Yi E (활성화, 상태 유지)', this, { state: this.state, actionKey: this.currentActionKey });

};

// Extracted from CharacterController: _masteryiCastR
CharacterController.prototype._masteryiCastR = function(free) {
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    // 스킬 우선순위 문서 4 섹션 5/17: R도 E와 마찬가지로 시전 애니메이션이
    // 없는 순수 버프라 canStartNewAction() 게이트를 두지 않는다 - 평타
    // WINDUP/RECOVERY는 물론 Q(Alpha Strike) 도중에도 즉시 적용되어야
    // 하기 때문이다(문서 3 섹션 6/19, 문서 4 섹션 18: "Q 진행 중 R 입력 ->
    // R buff 적용"). 이전에는 이 체크 때문에 공격 중이거나 Q 도중에는 R
    // 입력이 그냥 무시됐다.
    if (!this._payCost('R', free)) return;
    const cd = this._champData(); const r = cd.R;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    // 원작: 시전 시 걸려 있던 둔화를 모두 제거하고, 지속 중 둔화에 면역(applyStatus 참고).
    this.statusEffects = (this.statusEffects || []).filter((e) => e.type !== 'SLOW');
    // 하이랜더는 실제 클립이 없는 버프 전용 궁극기(문서 그대로) - 애니메이션
    // 없이 즉시 상태 효과만 적용한다.
    applyStatus(this, { id: 'masteryiR_as', type: 'MASTERYI_R_AS', duration: r.duration, value: skillVal(r.attackSpeedPercentByLevel, lvl) / 100 });
    applyStatus(this, { id: 'masteryiR_ms', type: 'MS_BUFF', duration: r.duration, value: skillVal(r.moveSpeedPercentByLevel, lvl) / 100 });
    // PC 위키: 최후의 전사 동안 유령화(유닛을 통과해 이동).
    applyStatus(this, { id: 'masteryiR_ghost', type: 'GHOST', duration: r.duration, value: 1 });
    this._masteryi.rActiveUntil = performance.now() + r.duration * 1000;
    // 문서(R): "이동 중이면 Run -> 2013_Run_Haste로 즉시 전환, ACTION_STATE는
    // 점유하지 않는다." setSubState는 currentActionKey/currentPhase를 전혀
    // 건드리지 않고 substateLocomotion 조회에서만 R을 활성으로 잡아준다.
    this.setSubState('R', r.duration);
    vfx.spawn('r', this.root.position.clone());
    debugSkillHit('Master Yi R', this);

};

