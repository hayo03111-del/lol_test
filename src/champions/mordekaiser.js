// Extracted from CharacterController: _mordeOnDealtHit
CharacterController.prototype._mordeOnDealtHit = function(target, rawDamageDealt) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'mordekaiser' || !target) return;
    const p = cd.passive;
    this._morde.hitStacks = (this._morde.hitStacks || 0) + 1;
    if (this._morde.hitStacks >= p.hitsForAura) {
      this._morde.auraExpiresAt = performance.now() + p.auraDuration * 1000;
      this._morde.auraCenter = target; // 오라 중심 - 마지막으로 적중한 대상 근처(자기 자신 위치를 기준으로 판정에 사용)
    }
    // W 패시브: 입힌 피해의 45%를 축적(챔피언 아닌 유닛은 25%만 - nonChampionBankPercent)
    const w = cd.W;
    const bankPercent = target.isMonster ? w.nonChampionBankPercent : w.dealtDamageBankPercent;
    this._morde.dealtBank = (this._morde.dealtBank || 0) + rawDamageDealt * (bankPercent / 100);
  
};

// Extracted from CharacterController: _mordePassiveAuraTick
CharacterController.prototype._mordePassiveAuraTick = function(dt) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'mordekaiser') return;
    const p = cd.passive;
    if (performance.now() >= this._morde.auraExpiresAt) return;
    this._morde._auraAccum = (this._morde._auraAccum || 0) + dt;
    if (this._morde._auraAccum >= 1.0) {
      this._morde._auraAccum -= 1.0;
      const hits = findEnemiesInRadius(this.root.position, p.auraRange);
      for (const h of hits) {
        const dmg = p.auraDamagePerSec + p.auraApRatio * this.stats.abilityPower + (h.unit.maxHp || 0) * (p.auraTargetMaxHpPercent / 100);
        applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent });
      }
    }
    this.stats.percentMoveSpeedBonus = Math.max(this.stats.percentMoveSpeedBonus, p.auraMoveSpeedPercent / 100);
  
};

// Extracted from CharacterController: _mordeQOnCast
CharacterController.prototype._mordeQOnCast = function(centerPos) { 
    const cd = this._champData(); if (!cd) return;
    const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    const hits = findEnemiesInRadius(centerPos, 150); // 문서에 폭발 반경 수치가 없어 지팡이 타격 지점의 근접 범위로 근사
    if (!hits.length) { debugSkillMiss('Mordekaiser Q', 'no target in impact area'); return; }
    const isSingle = hits.length === 1;
    // 챔피언 레벨(스킬 레벨과 별개) 보너스 고정 피해 - 10레벨부터 매
    // 레벨 +5, 18레벨에 45로 최대. base와 함께 더해서 단일 대상 배율에도
    // 같이 곱해지도록 한다(요청에서 준 "최대 마법피해"의 +67.5=45×1.5와
    // 정확히 일치하려면 반드시 배율 적용 전에 더해야 한다).
    const lb = q.levelBonusDamage;
    const levelBonus = (lb && this.champLevel >= lb.startLevel)
      ? Math.min(lb.maxLevel - lb.startLevel + 1, this.champLevel - lb.startLevel + 1) * lb.perLevel
      : 0;
    for (const h of hits) {
      let dmg = skillVal(q.damageByLevel, lvl) + q.bonusAdRatio * this._getBonusAD() + q.apRatio * this.stats.abilityPower + levelBonus;
      if (isSingle) dmg *= 1 + skillVal(q.singleTargetBonusPercentByLevel, lvl) / 100;
      applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent });
      this._mordeOnDealtHit(h.unit, dmg);
    }
    debugSkillHit('Mordekaiser Q', hits[0].unit, { count: hits.length, levelBonus });
  
};

// Extracted from CharacterController: _mordeCastW
CharacterController.prototype._mordeCastW = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const w = cd.W;
    const now = performance.now();
    if (now < (this._morde.wShieldActiveUntil || 0)) {
      // 재시전(2타): 남은 보호막을 즉시 회복으로 전환.
      this._mordeWOnRecast();
      this._morde.wShieldActiveUntil = 0;
      vfx.spawn('w', this.root.position.clone());
      // 요청: 모데카이저 W는 모션 없이 효과만 발동한다 - 캐릭터 애니메이션을
      // 재생하지 않는다(이펙트/게임로직은 그대로 유지).
      debugSkillHit('Mordekaiser W (재시전 - 회복)', this);
      return;
    }
    if (!this._payCost('W', free)) return;
    this._mordeWOnCast();
    this._morde.wShieldActiveUntil = now + w.shieldDecayDuration * 1000;
    vfx.spawn('w', this.root.position.clone());
    // 요청: 모데카이저 W는 모션 없이 효과만 발동한다 - 캐릭터 애니메이션을
    // 재생하지 않는다(보호막 전환 등 게임로직은 그대로 유지).
    debugSkillHit('Mordekaiser W (보호막 전환)', this);
  
};

// Extracted from CharacterController: _mordeWOnCast
CharacterController.prototype._mordeWOnCast = function() { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const banked = this._morde.dealtBank || 0;
    const shieldAmt = THREE.MathUtils.clamp(banked, this.maxHp * (w.minShieldMaxHpPercent / 100), this.maxHp * (w.maxShieldMaxHpPercent / 100));
    this.shield = shieldAmt;
    this._morde.dealtBank = 0;
    this._morde.shieldStartAmount = shieldAmt;
    clearTimeout(this._morde.shieldDecayTimer);
    const decaySteps = 20;
    let step = 0;
    // 버그 수정(전체 시스템 감사 - 다리우스 empower/가렌 W 보호막 타이머와
    // 동일한 유형이지만 이쪽은 setInterval이라 더 심각하다): 이 인터벌은
    // 20틱에 걸쳐 반복 실행되며 매번 this.shield를 직접 덮어쓰는데,
    // championId 확인이 없고 applyChampionData()도 이 인터벌 자체를
    // 정리하지 않는다. 모데카이저 W 보호막이 감쇠하는 도중 다른 챔피언으로
    // 바꾸면, 이 인터벌이 새 챔피언으로 바뀐 뒤에도 여러 번(최대 20회)
    // 계속 실행되며 새 챔피언의 shield 값을 계속 덮어써버릴 수 있었다.
    // 매 틱마다 championId를 확인해 모데카이저가 아니면 즉시 인터벌
    // 자체를 멈추도록 최소 범위로 수정.
    this._morde.shieldDecayTimer = setInterval(() => {
      if (this.championId !== 'mordekaiser') { clearInterval(this._morde.shieldDecayTimer); return; }
      step++;
      this.shield = Math.max(0, shieldAmt * (1 - step / decaySteps));
      if (step >= decaySteps) clearInterval(this._morde.shieldDecayTimer);
    }, (w.shieldDecayDuration * 1000) / decaySteps);
  
};

// Extracted from CharacterController: _mordeWOnRecast
CharacterController.prototype._mordeWOnRecast = function() { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    const heal = this.shield * (skillVal(w.recastHealPercentByLevel, lvl) / 100);
    // 그리버스 치유 감소(QA 버그 수정) - 보호막을 체력으로 "전환"하는 것도
    // 결과적으로는 체력 회복이라 적용 대상이다(보호막 자체의 생성/소멸은
    // 영향받지 않는다 - 전환된 "이후"의 체력 회복량만 줄어든다).
    this.hp = Math.min(this.maxHp, this.hp + heal * (1 - getGrievousPercent(this)));
    this.shield = 0;
    clearTimeout(this._morde.shieldDecayTimer);
    updateBars(this);
  
};

// Extracted from CharacterController: _mordeEOnCast
CharacterController.prototype._mordeEOnCast = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    // magicPenPercent는 이제 매 프레임(update loop)에서 항상 최신 E 스킬
    // 레벨 기준으로 갱신되므로 여기서 다시 설정할 필요 없다(패시브는 E를
    // 시전하지 않아도 이미 적용돼 있어야 하기 때문).
    if (!target || target.hp <= 0) { debugSkillMiss('Mordekaiser E', 'no target in range'); return; }
    // 실제로 대상 위치를 모데카이저 쪽으로 당긴다(섹션 4 "이펙트만 표시하고
    // 위치가 안 바뀌면 인정하지 않는다" 요구사항 반영) - 실시간 tween으로 처리.
    const from = target.mesh.position.clone();
    const dir = new THREE.Vector3().subVectors(this.root.position, from); dir.y = 0;
    const gap = dir.length();
    // 최소/최대 거리를 LoL 단위(120~250)로 정하고 공통 변환 함수로 world
    // 거리로 바꾼다 - 근접 거리에서 시전해도 눈에 띄게 당겨오되, 실제
    // 간격(gap)을 넘어서 시전자를 뚫고 지나가지 않게 상한도 같이 건다.
    const pullDist = gap > 0.05 ? Math.min(THREE.MathUtils.clamp(gap * 0.6, lolRangeToWorld(120), lolRangeToWorld(250)), Math.max(0, gap - this.collisionRadius * 2)) : 0;
    if (gap > 0.05) dir.normalize();
    const to = from.clone().addScaledVector(dir, pullDist);
    target._pullState = { from, to, duration: 0.4, elapsed: 0 };
    // 버그 수정(E 명세 13/14/15절 - "판정 순서가 실제로 맞아떨어져야 한다"):
    // 이 함수는 이미 SKILL_TIMING_DATABASE.mordekaiser.E.eventTime(0.5초)로
    // "실제 판정 시점"까지 지연된 뒤 runAction()의 onFire 콜백에서 호출된다
    // (해당 주석: "Cast Time과 별개로 실제 효과는 0.5초 후에 발생" - 즉
    // eventTime 자체가 이미 최종 판정 시점이다). 그런데 예전에는 여기서
    // e.pullDelay(0.5초)만큼 또 한 번 setTimeout으로 미뤄서, 실제 피해/
    // 끌어오기가 입력 시점부터 총 1.0초(0.5+0.5) 뒤에야 발생했다 - 반면
    // recovery(ENGINE_BUFFER=0.15초)는 onFire 직후(0.5초 시점)부터 흘러서
    // 0.65초에 행동 잠금이 풀렸다. 즉 실제 피해/끌어오기가 터지기도 전에
    // (0.65초 vs 1.0초) 플레이어가 이미 자유롭게 이동/Q 시전이 가능해져서,
    // "E로 끌려온 위치에 Q가 정확히 판정"(문서 15/TEST 7)이 깨질 수 있었다.
    // onFire 시점이 이미 공식 이벤트 타이밍이므로, 여기서 또 지연시키지
    // 않고 즉시(동기적으로) 피해를 적용한다 - 끌어오기 자체는 위
    // _pullState 트윈(0.4초)이 여전히 자연스러운 이동으로 처리한다(명세
    // 7절 "즉시 순간이동 금지"는 그대로 유지됨, 지연되는 건 피해가 아니라
    // 대상의 시각적 이동뿐).
    const dmg = skillVal(e.damageByLevel, lvl) + e.apRatio * this.stats.abilityPower;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent });
    this._mordeOnDealtHit(target, dmg);
    debugSkillHit('Mordekaiser E', target);
  
};

// Extracted from CharacterController: _mordeROnHit
CharacterController.prototype._mordeROnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const r = cd.R;
    // 요청(명세 27절 "이미 죽음의 세계에 들어가 있는 동안 R 재입력 시
    // 새로운 R 생성 금지"): _castR()에서도 동일한 조건으로 한 번 더 막지만,
    // 이 함수 자체도 방어적으로 재진입을 막아 stolenArmor/stolenMr이
    // 실수로 두 번 누적되는 일을 원천 차단한다(명세 21절 "중복 modifier
    // 방지").
    if (this._morde.isInDeathRealm) return;
    // 이 데모는 더미의 공격력/공격속도/최대체력이 실제 전투 결과에 별 영향을
    // 주지 않으므로(더미는 플레이어를 거의 위협하지 못함), "훔친 능력치"
    // 효과 중 실제로 체감되는 방어력/마법저항력만 상호 반영한다(섹션 18
    // "기획안에 없는 수치를 임의로 만들지 않는다"는 원칙 아래, 게임에 영향이
    //없는 나머지 스탯까지 억지로 흉내내지 않기로 함).
    const stolenArmor = target.armor * (r.statStealPercent / 100);
    const stolenMr = target.magicResist * (r.statStealPercent / 100);
    target.armor -= stolenArmor; target.magicResist -= stolenMr;
    this.bonusArmor = (this.bonusArmor || 0) + stolenArmor;
    this.bonusMr = (this.bonusMr || 0) + stolenMr;
    this.recomputeStats();
    // 버그 수정(명세 15/16/21절): 예전엔 여기서 setTimeout(r.duration)
    // 하나로만 스탯을 되돌렸다 - 그 타이머는 대상/자신이 먼저 죽어도 멈추지
    // 않고 그대로 살아있어서, 이미 _mordeEndDeathRealm() 등으로 다른 경로가
    // 먼저 정리한 뒤에도 나중에 또 한 번 실행되며 음수 방어력처럼 잘못된
    // 결과를 만들 수 있었다. 이제 되돌리는 로직은 _mordeEndDeathRealm()
    // 하나로 모으고, 여기서는 훔친 양과 종료 시각만 상태로 저장한다 -
    // 실제 되돌리기는 _mordeUpdateR()의 매 프레임 tick(지속시간 만료/대상
    // 사망 감지)이나 _die()(자신 사망 감지) 중 먼저 도달하는 쪽이 호출한다.
    this._morde.isInDeathRealm = true;
    this._morde.rTarget = target;
    this._morde.rEndsAt = performance.now() + r.duration * 1000;
    this._morde.rStolenArmor = stolenArmor;
    this._morde.rStolenMr = stolenMr;
    // ---- 죽음의 세계 공간 분리(신규 명세 1~5/13/14/22/23) ----
    // 원래 좌표는 반드시 별도 필드에 스냅샷한다 - Realm 내부 좌표(아래
    // this.root.position/target 위치)와 절대 같은 변수를 공유하지 않는다
    // (명세 14절 "절대로 같은 좌표 변수를 공유하지 마라").
    ensureDeathRealmScenery();
    activateDeathRealmAtmosphere();
    const realmId = `deathRealm_${++_mordeRealmCounter}`;
    this._morde.realmId = realmId;
    this._morde.casterOriginalPos = this.root.position.clone();
    this._morde.targetOriginalPos = getWorldPosition(target).clone();
    // 명세 22/23/24: 두 참가자에게 같은 realmId를 부여한다 - 이 태그
    // 하나로 getAllEnemyUnits()(이미 위에서 isInDeathRealm 기준으로
    // 격리 중)/포탑 타겟팅(findEnemyChampionsNear)/더미 반격(tickOneDummy)/
    // 우물(updateNexusWell)이 canRealmInteract() 한 번씩만 확인하면
    // 자동으로 "서로 다른 세계"를 인식한다.
    this.realmId = realmId;
    target.realmId = realmId;
    // 명세 2/13: 서로 마주 보며 겹치지 않는 위치로 실제 이동시킨다(요청
    // "단순 텔레포트만 구현하지 마라"는 이동 연출이 아니라 "텔레포트로
    // 공간 분리를 대체하지 말라"는 뜻이므로, 순간이동 자체는 두 챔피언이
    // Realm으로 "들어가는" 필수 동작이라 문제 없다 - 공간 분리는 realmId+
    // 실제 지형으로 이미 별도로 구현돼 있다).
    const half = DEATH_REALM_SPAWN_OFFSET / 2;
    this.root.position.set(DEATH_REALM_CENTER.x - half, 0, DEATH_REALM_CENTER.z);
    this.faceDirectionInstant(new THREE.Vector3(1, 0, 0));
    const targetPos = target.mesh ? target.mesh.position : target.root.position;
    targetPos.set(DEATH_REALM_CENTER.x + half, 0, DEATH_REALM_CENTER.z);
    if (typeof target.faceDirectionInstant === 'function') target.faceDirectionInstant(new THREE.Vector3(-1, 0, 0));
    console.log('[MORDE R] Death Realm 진입', { target: unitLabel(target), durationSec: r.duration, realmId });
  
};

// Extracted from CharacterController: _mordeEndDeathRealm
CharacterController.prototype._mordeEndDeathRealm = function(reason) { 
    if (!this._morde.isInDeathRealm) return;
    const target = this._morde.rTarget;
    if (target && target.hp > 0) {
      target.armor += this._morde.rStolenArmor;
      target.magicResist += this._morde.rStolenMr;
    }
    this.bonusArmor = Math.max(0, (this.bonusArmor || 0) - this._morde.rStolenArmor);
    this.bonusMr = Math.max(0, (this.bonusMr || 0) - this._morde.rStolenMr);
    this.recomputeStats();
    console.log('[MORDE R] Death Realm 종료', { reason });
    // ---- 죽음의 세계 정리(신규 명세 15/17~21/33) ----
    // realmId를 먼저 'main'으로 되돌린다 - 이후의 안전 위치 계산
    // (findSafeReturnPosition)이 getAllEnemyUnits()를 통해 "메인 월드
    // 기준"으로 주변 유닛을 올바르게 인식하게 하기 위함이다.
    this.realmId = 'main';
    if (target) target.realmId = 'main';
    deactivateDeathRealmAtmosphere();
    // 복귀 위치(명세 15/21) - "RealmPosition을 WorldPosition으로 변환"하지
    // 않고, R 시작 직전 저장해둔 원래 좌표를 그대로 다시 쓴다. HP/버프 등
    // 전투 상태는 애초에 realm 전용 사본을 만들지 않고 원본 객체를 그대로
    // 옮겨 다녔을 뿐이므로(명세 27/28/33 "Realm에서 변한 HP가 메인 월드
    // 에서도 그대로 유지") 위치만 복원하면 나머지는 자동으로 일치한다.
    if (this._morde.casterOriginalPos) {
      this.root.position.copy(findSafeReturnPosition(this._morde.casterOriginalPos, this));
    }
    if (target && this._morde.targetOriginalPos) {
      const targetPos = target.mesh ? target.mesh.position : target.root.position;
      targetPos.copy(findSafeReturnPosition(this._morde.targetOriginalPos, target));
    }
    this._morde.isInDeathRealm = false;
    this._morde.rTarget = null;
    this._morde.rEndsAt = 0;
    this._morde.rStolenArmor = 0;
    this._morde.rStolenMr = 0;
    this._morde.realmId = null;
    this._morde.casterOriginalPos = null;
    this._morde.targetOriginalPos = null;
  
};

// Extracted from CharacterController: _mordeUpdateR
CharacterController.prototype._mordeUpdateR = function() { 
    if (!this._morde.isInDeathRealm) return;
    const target = this._morde.rTarget;
    if (!target || target.hp <= 0) { this._mordeEndDeathRealm('target-death'); return; }
    if (performance.now() >= this._morde.rEndsAt) { this._mordeEndDeathRealm('duration-expired'); return; }
  
};

