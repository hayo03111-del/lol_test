// ---------------- 리 신 애니메이션 공용 헬퍼 ----------------
// 실제 리 신.glb(51클립) 확인 결과로 다시 짰다. 예전 구조의 문제:
//  1) Q/W 복귀 클립 이름이 'Spell1_Toldle'/'Spell2_Toldle'(소문자 L) 오타라 실제
//     클립 'Spell1_ToIdle'/'Spell2_ToIdle'을 한 번도 찾지 못했다.
//  2) E는 Spell3 클립 길이(2.167초) 동안 이동/공격/스킬을 통째로 막았다 - 원작 E
//     시전 시간은 0.25초다.
//  3) Q1/W1은 행동 상태를 전혀 잡지 않아, 시전 순간 평타 로직이 그대로 이어지며
//     Spell1 모션을 곧바로 덮었다(브라우저 검증에서 'Spell1|attack2'로 관찰됨).
// 이제 모든 시전은 "원작 시전 시간(lockSec)만 행동을 잡고, 그 뒤엔 바로 입력을
// 받되, 아무 입력도 없으면 남은 시전 모션 → 전용 복귀 클립(*_ToIdle) → Idle"
// 순으로 자연스럽게 끝난다. 재시전(W2/E2)처럼 시전 시간이 없는 스킬은 행동을
// 잡지 않고, 정지/이동에 따라 전용 클립(Spell2b_Idle/Run, Spell3_b_idle/moving)만
// 얹는다(평타 중이면 평타 모션을 끊지 않는다).
const LEESIN_LOCK_KEYS = ['leesinQ', 'leesinQ2', 'leesinW', 'leesinE', 'leesinR'];
CharacterController.prototype._isLeeSinCastLock = function() {
    return this.championId === 'leesin' && LEESIN_LOCK_KEYS.includes(this.currentActionKey);
};

CharacterController.prototype._clearLeeSinAnimTimer = function() { 
    if (this._leesinAnimTimer) {
      clearTimeout(this._leesinAnimTimer);
      this._leesinAnimTimer = null;
    }
};

CharacterController.prototype._leesinFirstClip = function(names) {
    for (const n of (Array.isArray(names) ? names : [names])) {
      const c = n && this.findAnimation(n);
      if (c) return c;
    }
    return null;
};

// opts: { actionKey, clips, lockSec, state, exitIdle, onRelease }
//  - lockSec > 0: 그 시간 동안 actionKey로 행동을 잡는다(이동/평타/다른 스킬 불가).
//  - onRelease: 잠금이 풀리는 순간(=원작 시전 시간 종료) 호출 - 피해 판정 등.
CharacterController.prototype._leesinPlayCast = function(opts) {
    this._clearLeeSinAnimTimer();
    const clip = this._leesinFirstClip(opts.clips);
    const lockSec = Math.max(0, opts.lockSec || 0);
    const serial = this._actionSerial;
    if (lockSec > 0) {
      this.currentActionKey = opts.actionKey;
      this.currentPhase = 'ACTIVE';
      this.phaseCancelable = false;
      this.setState(opts.state || STATE.Q_CAST);
    }
    if (clip) this.playFirstAvailable([clip.name], { loop: THREE.LoopOnce, clampWhenFinished: false, fade: 0.08 });
    const release = () => {
      if (this.championId !== 'leesin') return;
      if (lockSec > 0) {
        if (this.currentActionKey !== opts.actionKey || this._actionSerial !== serial) return; // 다른 행동으로 이미 넘어감
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      }
      if (opts.onRelease) opts.onRelease();
      if (lockSec <= 0) return;
      // 대기 입력(스킬/이동)이나 공격 대상이 있으면 즉시 그쪽으로 - 원작처럼 시전 시간이
      // 끝난 뒤 남은 모션은 다음 행동이 끊는다.
      const busy = this.pendingCast || this.pendingMove || this.targetPos || (this.currentTarget && this.currentTarget.hp > 0);
      if (busy || !clip) { this._resumeAfterAction(); return; }
      this.setState(STATE.IDLE);
      this._leesinQueueTail(clip, lockSec, opts.exitIdle);
    };
    if (lockSec > 0) {
      const t = this._champTimeout(release, lockSec * 1000);
      this._actionTimers.push(t);
    } else {
      release();
      if (clip) this._leesinQueueTail(clip, 0, opts.exitIdle);
    }
    return !!clip;
};

// 정지 상태에서 시전 모션이 끝나면 복귀 클립(*_ToIdle) → Idle. 그 사이 어떤 입력이든
// 들어와 다른 클립이 재생되면 아무것도 하지 않는다(currentClipKey로 판별).
CharacterController.prototype._leesinQueueTail = function(castClip, elapsedSec, exitIdleNames) {
    const stillIdleOn = (name) => this.championId === 'leesin' && !this.currentActionKey && !this.targetPos
      && this.state === STATE.IDLE && this.currentClipKey === name;
    const remain = Math.max(0.05, castClip.duration - elapsedSec - 0.05);
    this._leesinAnimTimer = this._champTimeout(() => {
      this._leesinAnimTimer = null;
      if (!stillIdleOn(castClip.name)) return;
      const exitClip = this._leesinFirstClip(exitIdleNames);
      if (!exitClip) { this._returnToLocomotion(); return; }
      this.playFirstAvailable([exitClip.name], { loop: THREE.LoopOnce, clampWhenFinished: true, fade: 0.12 });
      this._leesinAnimTimer = this._champTimeout(() => {
        this._leesinAnimTimer = null;
        if (stillIdleOn(exitClip.name)) this._returnToLocomotion();
      }, Math.max(0.05, exitClip.duration - 0.05) * 1000);
    }, remain * 1000);
};

// 시전 시간 없는 재시전(W2/E2) 전용 연출: 평타/다른 행동 중이면 건드리지 않고,
// 이동 중이면 이동용 클립을 "임시 이동 클립"으로 얹고, 정지 중이면 정지용 클립 → Idle.
CharacterController.prototype._leesinPlayInstantRecastClip = function(idleNames, moveNames) {
    if (this.currentActionKey) return false;
    const moving = !!this.targetPos && this.state === STATE.MOVE;
    const clip = this._leesinFirstClip(moving ? moveNames : idleNames);
    if (!clip) return false;
    this._clearLeeSinAnimTimer();
    if (moving) {
      this._beginTransientMoveClip(clip.name);
      this.playFirstAvailable([clip.name], { loop: THREE.LoopOnce, clampWhenFinished: false, fade: 0.1 });
      this._leesinAnimTimer = this._champTimeout(() => {
        this._leesinAnimTimer = null;
        this._endTransientMoveClip(clip.name);
        if (this.championId === 'leesin' && !this.currentActionKey && this.currentClipKey === clip.name) this._returnToLocomotion();
      }, Math.max(0.05, clip.duration - 0.05) * 1000);
    } else {
      this.playFirstAvailable([clip.name], { loop: THREE.LoopOnce, clampWhenFinished: false, fade: 0.1 });
      this._leesinQueueTail(clip, 0, null);
    }
    return true;
};

// Extracted from CharacterController: _leesinOnSkillUsed
CharacterController.prototype._leesinOnSkillUsed = function() { 
    const cd = this._champData(); if (!cd) return;
    // 원작: 스킬 사용 후 "3초 안의" 다음 2회 기본 공격(예전 8초).
    applyStatus(this, { id: 'leesinPassive_as', type: 'MASTERYI_R_AS', duration: cd.passive.durationSec || 3, value: cd.passive.attackSpeedBonusPercent / 100 });
    this._leesin.passiveHitsLeft = 2;
  
};

// Extracted from CharacterController: _leesinOnBasicAttackHit
CharacterController.prototype._leesinOnBasicAttackHit = function(target) { 
    // 강철의 의지(W 재시전): 평타로 실제 입힌 피해(방어력 적용 후)의 일부만큼 흡혈.
    // 버그 수정: 예전엔 이 처리가 패시브(질풍격) 횟수가 남아 있을 때만 실행되는 위치에 있어,
    // 패시브가 없으면 W2 흡혈이 전혀 적용되지 않았다.
    if (hasStatus(this, 'LEESIN_W_VAMP')) {
      const st = getStatus(this, 'leesinW_vamp');
      const dealt = target && target._lastDamageTakenAmount != null ? target._lastDamageTakenAmount : this.stats.attackDamage;
      if (st) { this.hp = Math.min(this.maxHp, this.hp + dealt * st.value * getHealReceivedMultiplier(this)); updateBars(this); }
    }
    // 질풍격은 "스킬 사용 후 3초 안"의 2회 평타만 강화한다 - 버프가 끝났으면 남은 횟수도 소멸
    // (버그 수정: 예전엔 횟수가 만료되지 않아 한참 뒤 평타에도 기력이 회복됐다).
    if (this._leesin.passiveHitsLeft > 0 && !getStatus(this, 'leesinPassive_as')) this._leesin.passiveHitsLeft = 0;
    if (!this._leesin.passiveHitsLeft || this._leesin.passiveHitsLeft <= 0) return;
    const cd = this._champData(); const p = cd.passive;
    const table = this._leesin.passiveHitsLeft === 2 ? p.energyByLevelBreakpoints1 : p.energyByLevelBreakpoints2;
    const restore = valueByBreakpoints(table, this.champLevel);
    this.mp = Math.min(this.maxMp, this.mp + restore);
    this._leesin.passiveHitsLeft -= 1;
    if (this._leesin.passiveHitsLeft <= 0) clearStatus(this, 'leesinPassive_as');
    updateBars(this);
};

// Extracted from CharacterController: _leesinCastQ
CharacterController.prototype._leesinCastQ = function(mouseWorldPoint, free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const q = cd.Q;
    const now = performance.now();
    if (this._leesin.qMarkTarget && now < this._leesin.qMarkExpiresAt) {
      // Q 2타(공명의 일격) - 버그 수정: canStartNewAction()에 걸어두면 평타
      // RECOVERY 등 사소한 행동 상태 때문에 재시전 입력이 조용히 씹힐 수
      // 있었다(모데카이저 W와 동일한 문제). 재시전은 자체적으로 어떤
      // 애니메이션/행동 상태도 점유하지 않으므로 이 게이트가 필요 없다.
      const target = this._leesin.qMarkTarget;
      // 표식 대상이 죽었거나 제거된 경우 재시전은 성립하지 않는다.
      // 기존 코드는 로그만 남기고 아래 피해/돌진 로직까지 계속 진행해 죽은 대상에게
      // Q2를 적용하는 비정상 경로가 있었다. 표식을 먼저 지우고 비용도 소비하지 않는다.
      if (!target || target.hp <= 0 || target.destroyed || target.isDead) {
        this._leesin.qMarkTarget = null;
        this._leesin.qMarkExpiresAt = 0;
        debugSkillMiss('Lee Sin Q (재시전)', '표식 대상이 유효하지 않음');
        return;
      }
      if (!free && this.mp < q.energy2) { debugSkillMiss('Lee Sin Q (재시전)', '기력 부족'); return; }
      if (!free) { this.mp -= q.energy2; updateBars(this); }
      const lvl = Math.max(1, this.skillLevels.Q || 1);
      this._leesin.qMarkTarget = null;
      this._leesinOnSkillUsed();
      // 대상 위치로 실제 돌진(공용 _dashState 트윈). 버그 수정: 예전엔 돌진을
      // "시작"하는 순간 피해가 들어갔다 - 이제 도착(돌진 종료) 시점에 판정하고,
      // 잃은 체력 비례 증폭도 그 순간의 체력으로 계산한다.
      const dir = new THREE.Vector3().subVectors(target.mesh.position, this.root.position); dir.y = 0;
      let dashSec = 0.05;
      if (dir.length() > 0.05) {
        dir.normalize();
        this.root.rotation.y = Math.atan2(dir.x, dir.z);
        const to = target.mesh.position.clone().addScaledVector(dir, -this.collisionRadius * 2);
        dashSec = 0.35;
        this._dashState = { from: this.root.position.clone(), to, duration: dashSec, elapsed: 0, faceDir: dir.clone() };
      }
      this._clearActionTimers();
      this._leesinPlayCast({
        actionKey: 'leesinQ2', clips: ['Spell1_B.ASU_LeeSin.anm', 'Spell1_B.ASU_LeeSin,anm'], lockSec: dashSec,
        state: STATE.Q_CAST, exitIdle: ['Spell1_ToIdle'],
        onRelease: () => {
          if (!target || target.hp <= 0 || target.destroyed || target.isDead) return;
          const lostPercent = target.maxHp ? Math.max(0, (target.maxHp - target.hp) / target.maxHp) : 0;
          const base = skillVal(q.damageByLevel, lvl) + q.bonusAdRatio * this._getBonusAD();
          const max = skillVal(q.maxDamageByLevel, lvl) + q.maxBonusAdRatio * this._getBonusAD();
          applyDamage(target, { rawDamage: base + (max - base) * lostPercent, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
          debugSkillHit('Lee Sin Q (공명의 일격)', target, { lostPercent: Math.round(lostPercent * 100) });
        },
      });
      return;
    }
    if (!this.canStartNewAction()) return;
    const origin = this.root.position.clone();
    const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, origin).setY(0) : (this.currentTarget ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, origin).setY(0) : (this.moveDir.lengthSq() > 0 ? this.moveDir.clone() : new THREE.Vector3(0, 0, 1)));
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    // 26차: 1타 쿨다운 확인. 예전엔 쿨다운을 설정만 하고 확인하지 않아, 음파가 대상에 맞기 전(표식이 생기기 전)에는 기력만 있으면 계속 쏠 수 있었다.
    if (!free && this.cooldowns.Q > 0) { showSkillToast(`Q - 쿨다운 ${this.cooldowns.Q.toFixed(1)}s 남음`); return; }
    if (!free && this.mp < q.energy1) { debugSkillMiss('Lee Sin Q', '기력 부족'); return; }
    if (!free) { this.mp -= q.energy1; this.cooldowns.Q = abilityHasteCooldown(this, skillVal(q.cooldown, Math.max(1, this.skillLevels.Q || 1))); updateBars(this); }
    // Q 음파 시전 순간, 투사체가 날아가는 방향을 즉시 바라본다.
    // 마우스 커서로 계산한 dir과 동일한 방향을 사용하므로 모델의 정면과
    // 실제 음파 투사 방향이 항상 일치한다.
    this.faceDirectionInstant(dir);
    // 시전 시간 0.25초(원작) 동안만 행동을 잡는다 - 음파 투사체는 바로 아래에서 발사.
    this._clearActionTimers();
    // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 0.25초 잠금과 별개로 음파가 시전 즉시 발사됐다.
    // 시전 시간이 끝나는 시점(onRelease)에 발사한다 - 그 전에 끊기면 원작처럼 취소.
    this._leesinPlayCast({ actionKey: 'leesinQ', clips: ['Spell1'], lockSec: q.castTimeSec || 0.25, state: STATE.Q_CAST, exitIdle: ['Spell1_ToIdle'], onRelease: () => {
      const origin = this.root.position.clone();
    // Q 음파는 마우스 커서가 가리키는 방향으로 실제 투사체가 날아간다.
    // 먼저 직선상 첫 적중 대상을 찾고, 대상이 있으면 그 대상까지의 거리만
    // 투사체가 이동하도록 해서 관통하지 않고 적중 순간 사라지게 한다.
    const hitUnit = findFirstInLine(origin, dir, q.range1, BASE_UNIT * 0.6);
    // 버그 수정: 예전엔 LoL 단위 사거리(1200)를 VFX에 월드 거리로 그대로 넘기고 속도는
    // 임의값 24를 써서, 빗나간 음파가 맵 밖까지 수십 초 동안 날아갔다. 사거리/속도
    // 모두 월드 단위로 변환한다(원작 음파 투사체 속도 1800).
    const rangeWorld = lolRangeToWorld(q.range1);
    const speedWorld = lolRangeToWorld(q.missileSpeed || 1800);
    let impactDistance = null;
    if (hitUnit) {
      const toHit = new THREE.Vector3().subVectors(hitUnit.mesh.position, origin);
      toHit.y = 0;
      impactDistance = Math.min(rangeWorld, toHit.dot(dir));
    }
    vfx.spawn('q', origin, dir, { projectile: true, range: rangeWorld, speed: speedWorld, impactDistance });
    if (hitUnit) {
      const lvl = Math.max(1, this.skillLevels.Q || 1);
      const dmg = skillVal(q.damageByLevel, lvl) + q.bonusAdRatio * this._getBonusAD();
      // 화면의 음파가 대상까지 실제로 날아간 뒤에만 피해/표식을 적용한다.
      // 기존에는 투사체 VFX를 생성한 직후 즉시 applyDamage()를 호출해서
      // '아직 음파가 도착하지 않았는데 이미 피해를 받은' 판정 불일치가 있었다.
      const travelDistance = Math.max(0.05, impactDistance ?? rangeWorld);
      const travelTimeMs = (travelDistance / speedWorld) * 1000;
      const impactTimer = this._champTimeout(() => {
        if (this.championId !== 'leesin' || !hitUnit || hitUnit.hp <= 0 || hitUnit.destroyed || hitUnit.isDead) return;
        applyDamage(hitUnit, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
        if (hitUnit.hp > 0) {
          this._leesinOnSkillUsed();
          this._leesin.qMarkTarget = hitUnit;
          this._leesin.qMarkExpiresAt = performance.now() + q.markDuration * 1000;
          debugSkillHit('Lee Sin Q (음파)', hitUnit);
        }
      }, travelTimeMs);
      // 버그 수정: 예전엔 이 착탄 타이머를 _actionTimers에 넣어서, 음파가 날아가는
      // 도중 리 신이 평타/이동 등 새 행동을 시작하면(_clearActionTimers) 착탄 판정
      // 자체가 취소돼 피해/표식이 사라졌다. 이미 발사된 투사체는 독립적으로 맞아야 한다.
      void impactTimer;
    } else debugSkillMiss('Lee Sin Q (음파)', 'no target in line');
    } });
  
};

// Extracted from CharacterController: _leesinCastW
CharacterController.prototype._leesinCastW = function(free, mouseWorldPoint = null) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const w = cd.W;
    const now = performance.now();
    if (now < this._leesin.wMarkReadyUntil) {
      // W 2타(강철의 의지) - 재시전은 canStartNewAction() 게이트 없이 항상
      // 받는다(모데카이저 W와 동일한 이유: 재시전은 별도 행동을 점유하지
      // 않는다).
      if (!free && this.mp < w.energy2) { debugSkillMiss('Lee Sin W (재시전)', '기력 부족'); return; }
      if (!free) { this.mp -= w.energy2; updateBars(this); }
      // 강철의 의지는 시전 시간이 없다 - 실제 GLB의 전용 클립(Spell2b_Idle/Run)만
      // 얹고 행동 상태는 잡지 않는다(평타 중이면 평타 모션 유지).
      this._leesinPlayInstantRecastClip(['Spell2b_Idle.ASU_LeeSin.anm'], ['Spell2b_Run.ASU_LeeSin.anm']);
      const lvl = Math.max(1, this.skillLevels.W || 1);
      applyStatus(this, { id: 'leesinW_vamp', type: 'LEESIN_W_VAMP', duration: w.lifestealDuration, value: skillVal(w.lifestealPercentByLevel, lvl) / 100 });
      this._leesinOnSkillUsed();
      this._leesin.wMarkReadyUntil = 0;
      debugSkillHit('Lee Sin W (강철의 의지)', this);
      return;
    }
    if (!this.canStartNewAction()) return;
    // 26차: 1타 쿨다운 확인. 예전엔 쿨다운을 설정만 하고 확인하지 않아, 2타를 쓴 직후 바로 다시 1타를 쓸 수 있었다.
    if (!free && this.cooldowns.W > 0) { showSkillToast(`W - 쿨다운 ${this.cooldowns.W.toFixed(1)}s 남음`); return; }
    if (!free && this.mp < w.energy1) { debugSkillMiss('Lee Sin W', '기력 부족'); return; }
    if (!free) { this.mp -= w.energy1; this.cooldowns.W = abilityHasteCooldown(this, w.cooldown); updateBars(this); }
    vfx.spawn('w', this.root.position.clone());
    this._leesinOnSkillUsed();
    this._leesin.wMarkReadyUntil = now + w.markDuration * 1000;
    // 방호 - 커서 근처의 아군 챔피언(사거리 700 안)에게 돌진해 둘 다 보호막,
    // 아군이 없으면 자기 자신에게 보호막(원작의 자기 시전).
    const lvl = Math.max(1, this.skillLevels.W || 1);
    const amount = skillVal(w.shieldByLevel, lvl) + (w.shieldApRatio || 0) * (this.stats.abilityPower || 0);
    const ally = this._leesinPickWAlly(mouseWorldPoint);
    if (ally) {
      const to = getWorldPosition(ally).clone();
      const dir = new THREE.Vector3().subVectors(to, this.root.position).setY(0);
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        to.addScaledVector(dir, -(this.collisionRadius + getCollisionRadius(ally)));
        to.y = this.root.position.y;
        this._dashState = { from: this.root.position.clone(), to, duration: 0.35, elapsed: 0, faceDir: dir.clone() }; // Q2 돌진과 같은 시간
      }
      if (typeof shieldAlly === 'function') shieldAlly(this, ally, amount, w.shieldDuration);
    }
    // 아군에게 돌진하면 돌진 시간(0.35초) 동안 행동을 잡고, 자기 시전은 시전 시간이
    // 없으므로 행동을 잡지 않는다(평타/이동 중이면 모션도 끼워 넣지 않음).
    if (ally) {
      this._clearActionTimers();
      this._leesinPlayCast({ actionKey: 'leesinW', clips: ['Spell2'], lockSec: 0.35, state: STATE.W_CAST, exitIdle: ['Spell2_ToIdle'] });
    } else if (!this.currentActionKey && !this.targetPos) {
      this._leesinPlayCast({ actionKey: 'leesinW', clips: ['Spell2'], lockSec: 0, exitIdle: ['Spell2_ToIdle'] });
    }
    this._leesinApplySelfWShield(amount, w.shieldDuration);
    debugSkillHit(`Lee Sin W (방호${ally ? ' - 아군에게 돌진' : ' - 자기 시전'})`, ally || this, { shield: amount.toFixed(1) });
  
};

// 방호 대상 아군 - 커서에서 가장 가까운 아군 더미 중, 커서가 그 아군 근처
// (클릭 판정 여유 150)이고 리 신의 W 사거리(range1) 안에 있는 경우만.
CharacterController.prototype._leesinPickWAlly = function(mouseWorldPoint) {
  if (!mouseWorldPoint || typeof getAllyChampions !== 'function') return null;
  const w = this._champData().W;
  let best = null, bestD = Infinity;
  for (const a of getAllyChampions(this)) {
    const p = getWorldPosition(a);
    const dMouse = getHorizontalDistance(p, mouseWorldPoint);
    if (dMouse > lolRangeToWorld(150) + getCollisionRadius(a)) continue;
    if (!isInRange(this, a, w.range1)) continue;
    if (dMouse < bestD) { best = a; bestD = dMouse; }
  }
  return best;
};

// 리 신 자신의 방호 보호막 - 가렌 W와 같은 방식(지속시간 뒤 이 보호막이
// 늘린 몫만 걷어낸다).
CharacterController.prototype._leesinApplySelfWShield = function(amount, durationSec) {
  const amt = amount * getShieldReceivedMultiplier(this);
  addShield(this, 'leesinW', amt, durationSec); // 보호막 인스턴스(만료 시 자동 제거)
  updateBars(this);
};

// Extracted from CharacterController: _leesinCastE
CharacterController.prototype._leesinCastE = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const e = cd.E;
    const now = performance.now();
    if (this._leesin.eMarkHits.length && now < this._leesin.eMarkExpiresAt) {
      // 재시전(무력화) - 마찬가지로 canStartNewAction() 게이트 없음.
      // 무력화는 별도 모션 없음.
      if (!free && this.mp < e.energy2) { debugSkillMiss('Lee Sin E (재시전)', '기력 부족'); return; }
      if (!free) { this.mp -= e.energy2; updateBars(this); }
      const lvl = Math.max(1, this.skillLevels.E || 1);
      // 원작: 35~75% 둔화가 4초에 걸쳐 점점 약해진다(decayLinear - 노틸러스 E와 같은 방식).
      for (const unit of this._leesin.eMarkHits) {
        if (unit.hp > 0) applyStatus(unit, { id: 'leesinE_slow', type: 'SLOW', duration: e.slowDuration, value: skillVal(e.slowPercentByLevel, lvl) / 100, decayLinear: true, source: this });
      }
      this._leesinPlayInstantRecastClip(['Spell3_b_idle.ASU_LeeSin.anm'], ['Spell3_b_moving.ASU_LeeSin.anm']);
      this._leesinOnSkillUsed();
      debugSkillHit('Lee Sin E (무력화)', this._leesin.eMarkHits[0], { count: this._leesin.eMarkHits.length });
      this._leesin.eMarkHits = [];
      return;
    }
    if (!this.canStartNewAction()) return;
    // 26차: 1타 쿨다운 확인. 예전엔 쿨다운을 설정만 하고 확인하지 않아, 빗나가거나 2타를 쓴 직후 바로 다시 쓸 수 있었다.
    if (!free && this.cooldowns.E > 0) { showSkillToast(`E - 쿨다운 ${this.cooldowns.E.toFixed(1)}s 남음`); return; }
    if (!free && this.mp < e.energy1) { debugSkillMiss('Lee Sin E', '기력 부족'); return; }
    if (!free) { this.mp -= e.energy1; this.cooldowns.E = abilityHasteCooldown(this, e.cooldown); updateBars(this); }
    this._clearActionTimers();
    // 버그 수정: 폭풍 판정도 시전 시간(0.25초)이 끝날 때 발생(예전엔 즉시).
    this._leesinPlayCast({ actionKey: 'leesinE', clips: ['Spell3'], lockSec: e.castTimeSec || 0.25, state: STATE.E_CAST, exitIdle: ['Spell3_ToIdle'], onRelease: () => {
      const now = performance.now();
    vfx.spawn('e', this.root.position.clone());
    // 26차: 판정 반경(e.range)만큼 퍼지는 지면 충격파로 E 범위를 보여 준다.
    if (typeof vfx.groundShockwave === 'function') vfx.groundShockwave(this.root.position, lolRangeToWorld(e.range), 0xffc04d, 0.45);
    const hits = findEnemiesInRadius(this.root.position, e.range);
    if (hits.length) {
      const lvl = Math.max(1, this.skillLevels.E || 1);
      for (const h of hits) {
        const dmg = skillVal(e.damageByLevel, lvl) + e.adRatio * this.stats.attackDamage;
        applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
      }
      this._leesin.eMarkHits = hits.map((h) => h.unit);
      this._leesin.eMarkExpiresAt = now + e.markDuration * 1000;
      this._leesinOnSkillUsed();
      debugSkillHit('Lee Sin E (폭풍)', hits[0].unit, { count: hits.length });
    } else debugSkillMiss('Lee Sin E (폭풍)', 'no target in range');
    } });
  
};

// Extracted from CharacterController: _leesinCastR
CharacterController.prototype._leesinCastR = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    if (!this.canStartNewAction()) return;
    if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss('Lee Sin R', 'no currentTarget selected'); return; }
    const cd = this._champData(); const r = cd.R;
    if (!isInRange(this, this.currentTarget, r.range)) { debugSkillMiss('Lee Sin R', 'out of range'); return; }
    if (!this._payCost('R', free)) return;
    const target = this.currentTarget;
    const lvl = Math.max(1, this.skillLevels.R || 1);
    const dmg = skillVal(r.damageByLevel, lvl) + r.bonusAdRatio * this._getBonusAD();
    this.faceDirectionInstant(new THREE.Vector3().subVectors(target.mesh.position, this.root.position).setY(0));
    this._clearActionTimers();
    // 시전 시간 0.25초 뒤 발차기가 꽂힌다(예전엔 시전 즉시 피해/넉백).
    this._leesinPlayCast({
      actionKey: 'leesinR', clips: ['Spell4'], lockSec: r.castTimeSec || 0.25, state: STATE.R_CAST, exitIdle: ['Spell4_ToIdle'],
      onRelease: () => { if (target && target.hp > 0) this._leesinRKick(target, dmg, lvl); },
    });
};

// 용의 분노 착탄: 대상 피해 + 공중에 뜸 + 넉백. 날아가는 대상과 부딪힌 다른 적은
// 같은 피해 + (차인 대상 추가 체력의 12/15/18%) + 1초 공중에 뜸(원작) - 예전엔
// collisionBonusHpRatioByLevel 데이터만 있고 충돌 판정이 아예 없었다.
CharacterController.prototype._leesinRKick = function(target, dmg, lvl) {
    const r = this._champData().R;
    vfx.spawn('r', this.root.position.clone());
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
    applyStatus(target, { id: 'leesinR_air', type: 'KNOCKUP', duration: r.airborneDuration, value: 1 });
    const from = target.mesh.position.clone();
    const dir = new THREE.Vector3().subVectors(from, this.root.position); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); else dir.normalize();
    const pullDist = lolRangeToWorld(r.knockbackDistance);
    const to = from.clone().addScaledVector(dir, pullDist);
    target._pullState = { from, to, duration: r.knockbackSec || 0.8, elapsed: 0 };
    // 경로 충돌: 넉백 선분(from→to)에서 (차인 대상 반경 + 상대 반경) 안에 들어오는 적.
    const kickedRadius = typeof getCollisionRadius === 'function' ? getCollisionRadius(target) : 0;
    const bonusHp = Math.max(0, target.bonusHealth || 0);
    const collideDmg = dmg + bonusHp * (skillVal(r.collisionBonusHpRatioByLevel, lvl) / 100);
    const units = typeof getTargetableEnemyUnits === 'function' ? getTargetableEnemyUnits() : [];
    for (const u of units) {
      if (!u || u === target || u.hp <= 0) continue;
      const p = getWorldPosition(u); if (!p) continue;
      const rel = new THREE.Vector3(p.x - from.x, 0, p.z - from.z);
      const along = rel.dot(dir);
      if (along < 0 || along > pullDist) continue;
      const lateral = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
      if (lateral > kickedRadius + getCollisionRadius(u)) continue;
      // 차인 대상이 그 지점에 도달하는 시각에 맞춰 판정.
      const t = this._champTimeout(() => {
        if (u.hp <= 0) return;
        applyDamage(u, { rawDamage: collideDmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 });
        applyStatus(u, { id: 'leesinR_collide_air', type: 'KNOCKUP', duration: r.collisionAirborneSec || 1, value: 1 });
        debugSkillHit('Lee Sin R (충돌)', u, { dmg: Math.round(collideDmg) });
      }, (along / Math.max(1e-6, pullDist)) * (r.knockbackSec || 0.8) * 1000);
      // _actionTimers에 넣지 않는다 - 리 신이 곧바로 다른 행동을 시작해도(그때
      // _clearActionTimers가 불림) 이미 날아가는 대상의 충돌 판정은 취소되면 안 된다.
      void t;
    }
    debugSkillHit('Lee Sin R', target, { pullDistWorld: pullDist.toFixed(2) });
  
};

