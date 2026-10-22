/* ============================================================
   CharacterController - 귀환/피격/사망/부활과 이동·W 서브 상태 복귀 애니메이션
   ------------------------------------------------------------
   character_controller.js의 클래스 본문에서 분리한 메서드들이다(동작 동일).
   챔피언 파일들과 같은 방식으로 CharacterController.prototype에 붙인다 -
   빌드 순서상 character_controller.js 바로 뒤에 로드된다.
   ============================================================ */

// 닐라 최종 QA: 수치/애니메이션/상태 의존성이 빠졌는지 브라우저 콘솔에서 빠르게 확인한다.




/* ---------------- recall ---------------- */
CharacterController.prototype.startRecall = function() {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN || this.state === STATE.RECALL) return;
    // 83차: 칼바람 나락에는 귀환이 없다(원작).
    if (typeof howlingAbyssStructuresSpawned !== 'undefined' && howlingAbyssStructuresSpawned) { if (typeof showSkillToast === 'function') showSkillToast('칼바람 나락에서는 귀환할 수 없습니다'); return; }
    // PC 위키: 귀환은 이동 스킬로 취급되어 속박 중엔 쓸 수 없고, 기절류(행동 불가) 중에도 쓸 수 없다.
    if ((typeof isRooted === 'function' && isRooted(this)) || (typeof isCrowdControlled === 'function' && isCrowdControlled(this))) { if (typeof showSkillToast === 'function') showSkillToast('귀환 - 군중 제어 중 사용 불가'); return; }
    // 94차: 스킬 시전·돌진·충전 중에는 귀환을 시작하지 않는다 - 예전엔 진행 중이던 스킬 타이머를 그냥 지워 돌진·충전 상태가 남거나
    // 스킬이 반쯤만 나갔다. 평타는 지금처럼 취소하고 귀환한다.
    const busy = this._dashState || (typeof summonerDashHoldsFlash === 'function' && summonerDashHoldsFlash(this)) || (this._varus && this._varus.qCharge)
      || (this.currentActionKey && this.state !== STATE.ATTACK && !/^(attack|crit|renektonAA)/i.test(this.currentActionKey));
    if (busy) { if (typeof showSkillToast === 'function') showSkillToast('귀환 - 스킬 사용 중에는 시작할 수 없습니다'); return; }
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null;
    this.targetPos = null; this.currentTarget = null;
    targetRing.clear();
    this.setState(STATE.RECALL);
    this.playFirstAvailable(this.actionData.recall.clips, { loop:THREE.LoopOnce, fade:0.15, clampWhenFinished:true });
    const t = setTimeout(() => {
      this._recallTimer = null;
      if (this.state !== STATE.RECALL) return; // 그 사이 cancelRecall()로 취소된 경우
      this._teleportToTeamSpawn();
      this._returnToLocomotion();
    }, RECALL_DURATION * 1000);
    this._recallTimer = t;
    this._pendingTimeouts.push(t);
};

// 요청(귀환 캔슬): 이동/공격 대상 지정/스킬 시전/피격 네 진입점이 공통으로
// 사용하는 귀환 중단 함수. 귀환 완료 타이머는 콜백 안에서 스스로 state를
// 재확인하므로(위 startRecall 참고) clearTimeout이 필수는 아니지만, 남은
// 타이머를 방치하지 않도록 여기서 함께 정리한다. state 전환(IDLE/MOVE/
// 공격/캐스트 등)은 각 호출부가 이어서 직접 담당한다 -- 이 함수는 "귀환을
// 끊는다"까지만 책임진다.
CharacterController.prototype.cancelRecall = function() {
    if (this.state !== STATE.RECALL) return false;
    if (this._recallTimer) {
      clearTimeout(this._recallTimer);
      this._pendingTimeouts = this._pendingTimeouts.filter((t) => t !== this._recallTimer);
      this._recallTimer = null;
    }
    return true;
};

/* ---------------- health / death / respawn ---------------- */
CharacterController.prototype.takeDamage = function(dmg, source = null, damageType = DAMAGE_TYPE.PHYSICAL, damageMeta = null) {
    if (this.state === STATE.DEAD) return;
    // Alpha Strike 비대상 상태 - 섹션 6: "모든 피격 판정에서 확인해야 한다".
    if (this.isUntargetable) return;
    if (source) this._lastDamageSource = source; // 93차: 사망 이벤트의 처치자(killerId)
    // 요청(귀환 캔슬): 귀환 중 피격 -> 귀환 모션 중단 후 Idle로 전환. 그
    // 직후 이 피해로 체력이 0 이하가 되면 아래 _die()가 이어서 DEAD로
    // 다시 전환하므로, 굳이 순서를 바꾸지 않아도 "피격 -> 사망"이 자연스럽게
    // 이어진다.
    if (this.state === STATE.RECALL) {
      this.cancelRecall();
      this.setState(STATE.IDLE);
      this.playFirstAvailable(this.championId === 'yasuo' ? ['Idle1_Raw'] : this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
    }
    if (this.championId === 'renekton') this._renektonMarkCombat();
    // 마법 피해는 일반+마법 피해 감소를 함께 곱연산(getMagicDamageReductionPercent가 둘 다 포함).
    let reduction = damageType === DAMAGE_TYPE.MAGICAL ? getMagicDamageReductionPercent(this, source) : getDamageReductionPercent(this, source);
    let remaining = Math.max(0, dmg) * (1 - Math.min(1, Math.max(0, reduction))); // 일반 피해감소 + 닐라 W 마법피해감소
    // 아이템 패시브(멜모셔스의 아귀/스테락의도전 - 생명선) - 이 피해로
    // 체력이 문턱 밑으로 "떨어질" 보호막을 먼저 걸어서, 바로 아래 shield
    // 흡수 로직이 이번 피해도 함께 받아낼 수 있게 한다(실제 LoL도 피해가
    // 적용되기 직전에 발동). 죽음의무도(고통 무시)는 받는 피해 자체를
    // 바꾸므로(일부를 지연 피해로 돌림) 반환값을 그대로 remaining에
    // 반영한다 - `?? remaining`으로 다른 효과들의 기존 void 반환과도 안전하게 호환.
    if (typeof itemOnTakeDamage === 'function') remaining = itemOnTakeDamage(this, remaining, damageType, source, damageMeta) ?? remaining;
    // 버그 수정(세트 패시브 문서 4절 "실제로 HP에 적용된 피해를 기준으로
    // 한다"): 예전에는 Shield로 흡수되기 전의 remaining을 그대로 투지
    // 계산에 넘겨서, Shield가 300 있는 상태에서 500 피해를 받아 실제로는
    // 200만 HP가 깎였어도 투지는 500 기준으로 쌓였다. Shield 소모를 먼저
    // 끝내고, 실제로 HP를 깎은 양(actualHpLoss)만 넘긴다. 모데카이저 W의
    // "받은 피해 축적"도 동일한 성격의 값이라 같이 바로잡는다.
    // 보호막 인스턴스 모델: 먼저 만료되는 보호막부터 흡수(01_status_effect_system.js absorbShieldDamage).
    remaining = absorbShieldDamage(this, remaining, damageType); // 83차: 피해 종류 전용 보호막 반영
    const actualHpLoss = Math.min(remaining, this.hp);
    // 가렌 인내심(PC 위키): 챔피언·포탑·에픽 몬스터에게 "실제로" 피해를 입었을 때만 8초 멈춘다.
    // 보호막에 전부 막혔거나 0으로 줄어든 피해, 미니언·우물(지속 피해) 피해는 멈추지 않는다.
    // 예전엔 출처와 무관하게, 보호막에 막힌 피해까지 모두 리셋했다. 출처를 모르는 피해(null)는 보수적으로 리셋한다.
    if (actualHpLoss > 0 && (!source || source.isChampion || source.isTurret || source.isEpicMonster)) this.passiveState.lastDamageTakenAt = performance.now();
    if (this.championId === 'sett') this._settOnTakeDamageForGrit(actualHpLoss); // 패시브(투기장의 투지): 실제 HP 피해량 기준으로 투지 축적
    // 버그 수정(치명적 - 평타 시 멈춤): 이 호출은 원래 _onBasicAttackHit()
    // (자신이 적을 때렸을 때)에 존재하지 않는 actualHpLoss 변수를 참조하는
    // 채로 잘못 들어가 있었다 - 야스오가 평타를 명중시킬 때마다
    // ReferenceError가 발생해서 runAction()의 onFire 콜백이 중간에 끊기고,
    // 그 뒤에 와야 할 currentPhase='RECOVERY' 전환/recoveryTimer 예약이
    // 전혀 실행되지 않아 야스오가 그 자리에서 완전히 멈췄다. 이 훅은
    // "야스오가 피해를 입었을 때(패시브: 낭인의 길 - 기류 최대치에서 피격 시
    // 보호막)" 발동해야 하므로, 실제로 피해를 받는 이 지점(takeDamage, 이미
    // 계산된 actualHpLoss 사용)으로 옮긴다.
    if (this.championId === 'yasuo' && actualHpLoss > 0) this._yasuoOnTakeDamage(source);
    if (this.championId === 'rammus') this._rammusOnTakeDamage(source, damageMeta); // 38차: W 반사 피해
    if (this.championId === 'mordekaiser') {
      const cd = this._champData();
      this._morde.dealtBank = (this._morde.dealtBank || 0) + actualHpLoss * (cd.W.takenDamageBankPercent / 100);
    }
    this.hp = Math.max(0, this.hp - remaining);
    updateBars(this);
    if (this.hp <= 0) {
      // 수호천사(환생) - 치명적 피해 1회를 가로채 죽음을 취소한다. 쿨다운
      // 중이거나 아이템이 없으면 false를 반환해 평소처럼 죽는다.
      if (typeof itemOnLethalDamage === 'function' && itemOnLethalDamage(this)) { updateBars(this); return; }
      this._die();
    }
};
CharacterController.prototype._die = function() {
    if (typeof emitGameEvent === 'function') emitGameEvent('death', { entityId: _evId(this), kind: 'champion', killerId: _evId(this._lastDamageSource || null) }); // 93차
    // 암흑의 인장(영광) - 사망 시 중첩 소실. 이 데모는 플레이어를 공격하는
    // AI가 없어 사실상 트리거될 일이 없지만(도란의 방패 피격 회복과 동일한
    // 한계), 향후 그런 기능이 추가되면 자동으로 맞물리도록 범용 훅으로 둔다.
    if (typeof itemOnChampionDeath === 'function') itemOnChampionDeath(this);
    if (this.championId === 'renekton' && this._renekton?.rActive) this._renektonEndR();
    this._clearPending(); this._clearActionTimers();
    this._masteryiCancelAlphaStrike(); // 안전망: Q 도중 사망해도 비대상 플래그/상태가 남지 않게 정리
    if (this._masteryi) this._masteryi.pendingWAfterHit = false; // 안전망: 예약된 W가 죽음으로 취소된 평타에 남아있지 않게 정리
    // 버그 수정(명세 16절 "모데카이저 사망 시 R 즉시 종료"): 지속시간 tick
    // (_mordeUpdateR)은 다음 프레임에야 도는데, 사망 시에는 그마저 기다리지
    // 않고 이 자리에서 즉시 정리한다(스탯 훔치기 원상복구 포함) - 프레임
    // 하나라도 "죽었는데 아직 상대 스탯을 들고 있는" 상태가 남지 않도록.
    if (this.championId === 'mordekaiser' && this._morde && this._morde.isInDeathRealm) {
      this._mordeEndDeathRealm('self-death');
    }
    if (this.championId === 'yone' && this._yone && this._yone.eSpirit) {
      this._yoneCleanupSpiritVisuals();
      this._yone.eSpirit = null;
      this.isUntargetable = false;
    }
    // 버그 수정(신규 발견 - "아리 죽을 때 Q/W/R 상태 정리 누락"): 레넥톤/
    // 모데카이저/요네는 죽는 순간 진행 중이던 전용 상태를 여기서 정리하는데,
    // 아리만 이 정리가 빠져 있었다. _ahriUpdate(dt)는 죽어 있어도(DEAD여도)
    // championId만 확인하고 매 프레임 계속 도는 구조라, Q가 왕복하던 중이나
    // W 여우불이 떠 있던 중에 죽으면 그 스프라이트가 정리되지 않은 채
    // 남아있다가 _respawn()이 챔피언을 리스폰 지점으로 순간이동시킬
    // 때 그 자리로 같이 딸려가는 시각적 버그가 생겼다. R 돌진/재사용
    // 충전(rCharges)·재시전 창(rReadyUntil)도 사망과 무관하게 그대로 남아,
    // 부활 직후 궁을 공짜로 재시전할 수 있는 상태가 되는 것도 함께 고친다.
    if (this.championId === 'ahri' && this._ahri) {
      this._ahriEndQTravel();
      this._ahriEndETravel();
      this._ahriClearFoxfires();
      this._ahri.rDash = null;
      this._ahri.rCharges = 0;
      this._ahri.rReadyUntil = 0;
      this._ahri.lastAttackTarget = null;
      this._ahri.lastAttackAt = 0;
    }
    // 바루스도 동일한 이유로 사망 시 정리한다: Q가 충전 중이던 상태로
    // 죽으면 위 _clearActionTimers()가 자동 발사 타이머는 지워주지만
    // qCharge 데이터 자체(this._varus.qCharge)는 남아있어 부활 직후 Q를
    // 다시 누르면 "충전 중"으로 오인해 즉시 발사(재입력=릴리즈) 취급될 수
    // 있다. 패시브 램프(lv)도 사망과 함께 초기화한다(부활 직후 이전 전투의
    // 보너스 공격력이 남지 않도록).
    if (this.championId === 'varus' && this._varus) {
      this._varus.qCharge = null;
      clearStatus(this, 'varusQ_chargeSlow');
      this._varus.lv = { target: null, rampStartAt: 0, lastHitAt: 0 };
      this.bonusAD = 0;
    }
    // 애쉬도 동일한 이유로 사망 시 정리한다: 집중 스택/궁사의 집중 버프가
    // 부활 직후까지 남아 공짜로 강화 다발 공격이 나가면 안 되고, 진행
    // 중이던 W/E/R 판정 지연이나 R의 전 맵 관통 광선도 죽는 순간 즉시
    // 정리해야 한다.
    if (this.championId === 'ashe' && this._ashe) {
      this._ashe.focusStacks = 0; this._ashe.focusExpiresAt = 0;
      this._ashe.qActiveUntil = 0; this._ashe.flurryPending = false;
      this._ashe.wPending = null; this._ashe.ePending = null; this._ashe.rPending = null; this._ashe.rTravel = null;
      clearStatus(this, 'asheRangersFocus');
    }
    if (this.championId === 'nautilus' && typeof this._nautilusReset === 'function') this._nautilusReset();
    if (this.championId === 'rammus' && typeof this._rammusReset === 'function') this._rammusReset();
    if (this.championId === 'lux' && typeof this._luxReset === 'function') this._luxReset();
    // 세트 R 도중 사망: 위 _clearActionTimers()가 시퀀스를 끊으면 잡힌 대상의 제압(isGrabbedBySett)이
    // 풀리지 않고 영구히 남았다 - 정상 종료 함수로 대상을 먼저 풀어준다.
    if (this._sett?.rSeq) { this.pendingMove = null; this.pendingCast = null; this.currentTarget = null; this._settEndR(this._sett.rSeq, true); }
    // 90차(QA): 원작은 죽으면 몸에 걸린 효과(버프·디버프)와 보호막이 모두 사라진다. 예전엔 그대로 남아 부활 직후에도
    // 가렌 Q 이동속도·W 피해 감소, 마스터 이 R 공속·이속이 이어졌다. keepOnDeath를 붙인 효과만 남긴다.
    if (this._nilah) { this._nilah.rSeq = null; this._nilah.eDash = null; } // 닐라 R 회전·E 돌진 중 사망(예전엔 rSeq가 남아 부활 뒤에도 R 판정이 돌았다)
    this.statusEffects = (this.statusEffects || []).filter((st) => st && st.keepOnDeath);
    if (typeof clearShields === 'function') clearShields(this);
    if (typeof this.recomputeStats === 'function') this.recomputeStats();
    this.currentActionKey = null; this.currentPhase = null;
    this.targetPos = null; this.currentTarget = null; this.pendingMove = null; this.pendingCast = null;
    // 94차: 공격 이동·행동 불가 중 이동 예약·평타 대기 상태도 지운다 - 예전엔 남아 있어 부활하자마자 분수 밖으로 걸어 나갔다.
    this._attackMoveDest = null; this._attackMoveOpts = null; this._ccBufferedMove = null; this._awaitingAttackTimer = false;
    this.attackOrderActive = false; this.attackOrderAnchor = null; this._autoAcquired = false; this._approachCast = null; this._bufferedSummoner = null; this._castLock = null;
    targetRing.clear();
    this.setState(STATE.DEAD);
    if (typeof ensureScore === 'function' && typeof controller !== 'undefined' && controller === this) ensureScore(this).deaths += 1; // 34차 스코어보드
    vfx.spawn('death', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0)));
    this.playFirstAvailable(this.actionData.death.clips, { loop:THREE.LoopOnce, fade:0.1, clampWhenFinished:true });
    const waitSec = (typeof ARAM_DEATH_TIMER_BY_LEVEL !== 'undefined' && ARAM_DEATH_TIMER_BY_LEVEL[this.champLevel]) || RESPAWN_WAIT; // 83차: 레벨별 부활 시간
    this._respawnAt = performance.now() + waitSec * 1000;
    const t = setTimeout(() => this._respawn(), waitSec * 1000);
    this._pendingTimeouts.push(t);
};
// 25차: 리스폰·귀환은 자기 팀 우물(원작 출현 지점)로 간다. 예전엔 둘 다 맵 한가운데(0,0,0)였다.
CharacterController.prototype._teleportToTeamSpawn = function() {
    const p = typeof getTeamSpawnPosition === 'function' ? getTeamSpawnPosition(this.team) : new THREE.Vector3(0, 0, 0);
    this.root.position.copy(p);
    this.targetPos = null;
    if (typeof controller !== 'undefined' && controller === this && typeof snapCameraTo === 'function') snapCameraTo(p);
};
CharacterController.prototype._respawn = function() {
    if (typeof emitGameEvent === 'function') emitGameEvent('respawn', { entityId: _evId(this) }); // 93차
    this.setState(STATE.RESPAWN);
    this._teleportToTeamSpawn();
    this.hp = this.maxHp; this.mp = this.maxMp;
    updateBars(this);
    const action = this.playFirstAvailable(this.actionData.respawn.clips, { loop:THREE.LoopOnce, fade:0.15, clampWhenFinished:true });
    const dur = action ? action.getClip().duration / (action.timeScale || 1) : 1.0;
    const t = setTimeout(() => this._returnToLocomotion(), (dur + 0.1) * 1000);
    this._pendingTimeouts.push(t);
};



CharacterController.prototype._returnToLocomotion = function() {
    if (this.state === STATE.DEAD) return;
    // 공통 액션 종료 지점에서는 어떤 챔피언이든 내부 행동 잠금이 남지 않도록
    // locomotion 진입 전에 정리한다. Q/W/E/R 전용 채널링은 이 함수를 호출하지
    // 않으므로 별도 하드락 상태를 침범하지 않는다.
    this.currentActionKey = null;
    this.currentPhase = null;
    this.phaseCancelable = false;
    if (this.targetPos) {
      this.setState(STATE.MOVE);
      if (!this._yasuoPlayPostQMoveEntry()) {
        if (this.championId === 'yasuo' && this.findAnimation('Run1_Raw')) {
          this.playFirstAvailable(['Run1_Raw'], { loop: THREE.LoopRepeat, fade: 0.12 });
        } else {
          this.playFirstAvailable(this._moveClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
        }
      }
    } else {
      this.setState(STATE.IDLE);
      if (this.championId === 'yasuo' && this.findAnimation('Idle1_Raw')) {
        this.playFirstAvailable(['Idle1_Raw'], { loop: THREE.LoopRepeat, fade: 0.2 });
      } else {
        this.playFirstAvailable(this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.2 });
      }
    }
};

// 업데이트(W 전용 상세 문서 6~10절): Spell2_Cast.anm이 끝난 직후 호출된다.
// 이 순간의 정지/이동 여부를 "한 번만" 판정해서(문서 9절) idleSteps 또는
// moveSteps 시퀀스를 재생하고, 마지막 Step이 끝나면 _returnToLocomotion()
// 으로 넘겨서 substateLocomotion 루프(Spell2_Idle/Spell2_Walk)에 안착한다.
// entryChain이 등록 안 된 챔피언/역할은 false를 반환 - 호출부가 기존처럼
// 바로 _playExitClip/_returnToLocomotion으로 넘어간다.
// 업데이트(핵심 구조 수정): W Entry Chain은 Gameplay Action이 아니라
// Animation Layer다. 예전에는 여기서 currentActionKey='wEntry'/
// currentPhase='ACTIVE'로 실제 행동 잠금을 걸었는데, 그러면
// getActionAuthority()가 이 구간 내내 canCast:false를 반환해서 Entry
// Chain이 재생되는 동안(최대 ~1.6~2초) Q/E/R 입력이 전부 막혔다. 이제는
// currentActionKey/currentPhase를 아예 건드리지 않는다(null 유지) - 대신
// this.state만 실제 이동/정지 여부에 맞춰 MOVE/IDLE로 정확히 세팅해서,
// updateMovement(dt)의 기존 `this.state !== STATE.MOVE` 게이트가 아무
// 예외 코드 없이도 W 캐스트 중이던 자기 자신을 알아서 정상 처리한다
// (updateMovement 자체는 건드리지 않음 - "땜질 금지" 원칙).
CharacterController.prototype._playWEntryChain = function() {
    const db = this._championAbilityDbEntry();
    const chain = db && db.W && db.W.entryChain;
    if (!chain) return false;
    const moving = !!this.targetPos; // 결정 시점 1회 판정, 이후 재판단하지 않음(문서 9절)
    const stepNames = moving ? (chain.moveSteps || chain.idleSteps) : (chain.idleSteps || chain.moveSteps);
    if (!stepNames || !stepNames.length) return false;
    const stepClips = stepNames.map((n) => this.findAnimation(n)).filter(Boolean);
    if (!stepClips.length) return false; // 클립이 실제 glb에 없으면 조용히 폴백(기존 즉시 로코모션)

    // Gameplay Action 점유 없음 - 이 시점 이후 Q/E/R/이동 입력은 전부 즉시
    // 정상 처리된다(currentActionKey가 null이므로 getActionAuthority()가
    // 곧바로 "자유 행동" 결과를 반환).
    this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
    // 이동 중이었다면 state를 MOVE로 유지(그대로 targetPos를 향해
    // updateMovement(dt)가 계속 좌표를 갱신), 정지 중이었다면 IDLE로 -
    // W_CAST에 머물러 있던 state를 실제 로코모션 상태로 되돌리는 것뿐이라
    // updateMovement에는 아무 예외도 추가하지 않는다.
    this.setState(moving ? STATE.MOVE : STATE.IDLE);
    // updateMovement(dt)의 자동 보정이 이 체인의 이동 진입 클립들을 다음
    // 프레임에 곧장 잘라내지 않도록, moving 분기에서는 사용되는 클립 이름을
    // 재생 동안만 "유효한 이동 클립" 목록에 임시로 포함시킨다(정지 분기는
    // state가 IDLE이라 updateMovement가 애초에 관여하지 않으므로 불필요).
    if (moving) stepClips.forEach((c) => this._beginTransientMoveClip(c.name));
    this.sequencePlayer.play({
      transitionFadeTime: 0.15,
      steps: stepClips.map((c) => ({ animation: c.name, clipStart: 0, clipEnd: c.duration })),
      onComplete: () => {
        if (moving) stepClips.forEach((c) => this._endTransientMoveClip(c.name));
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        // 기존 pendingMove 수정사항 유지: Entry Chain 재생 중에는 더 이상
        // Gameplay Action이 점유돼 있지 않으므로 이동 명령은 즉시 커밋되지만
        // (moveTo()가 바로 _commitMove()로 빠짐), 혹시 모를 다른 대기 중인
        // 상태(예: currentTarget 재교전)까지 한 번에 정리하기 위해
        // _returnToLocomotion() 대신 더 안전한 _resumeAfterAction()을 쓴다.
        this._resumeAfterAction();
      },
      onCancel: () => {
        if (moving) stepClips.forEach((c) => this._endTransientMoveClip(c.name));
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      },
    });
    return true;
};

// 업데이트(W 전용 상세 문서 12절 "경우: W 활성 상태 정지 유지 중 이동 시작"):
// 서브 상태(예: W)의 locomotionTransitions.idleToMove가 등록돼 있고, 현재
// Idle 루프 클립을 재생 중일 때만 이 전환 클립을 한 번 거친 뒤 이동 루프로
// 넘어간다. 실제 좌표 이동(this.targetPos/updateMovement)은 이 함수와 무관
// 하게 이미 즉시 시작되어 있으므로(문서: "실제 좌표 이동과 애니메이션 전환은
// 별개"), 여기서는 순수하게 시각 전환만 지연시킨다. 등록 안 된 챔피언/상태는
// false를 반환해 호출부가 기존처럼 이동 루프로 바로 전환한다.
CharacterController.prototype._playLocomotionEntryTransition = function() {
    const db = this._championAbilityDbEntry();
    if (!db) return false;
    for (const roleKey of ['Q', 'W', 'E', 'R']) {
      const cfg = db[roleKey] && db[roleKey].locomotionTransitions;
      if (!cfg || !cfg.idleToMove || !this.isSubStateActive(roleKey)) continue;
      if (!this.currentClipKey || !this._idleClips().includes(this.currentClipKey)) continue; // Idle 루프에서 시작할 때만
      const clip = this.findAnimation(cfg.idleToMove);
      if (!clip) continue;
      // updateMovement(dt)의 자동 보정("MOVE 상태인데 지금 클립이 _moveClips()
      // 목록에 없으면 즉시 이동 루프로 강제 전환")이 이 전환 클립을 다음
      // 프레임에 바로 잘라먹지 않도록, 재생하는 동안만 "유효한 이동 클립"
      // 목록에 임시로 포함시킨다.
      this._beginTransientMoveClip(cfg.idleToMove);
      this.crossFadeTo([cfg.idleToMove], { loop: THREE.LoopOnce, fade: 0.12, clampWhenFinished: true });
      const t = setTimeout(() => {
        this._endTransientMoveClip(cfg.idleToMove);
        if (this.state === STATE.MOVE) this.playFirstAvailable(this._moveClips(), { fade: 0.1 });
      }, Math.max(0, clip.duration - 0.05) * 1000);
      this._actionTimers.push(t);
      return true;
    }
    return false;
};

CharacterController.prototype._clearPending = function() { this._pendingTimeouts.forEach(clearTimeout); this._pendingTimeouts = []; };

// 애니메이션 탐색기(추가 수정사항 23)에서 클립을 클릭했을 때 미리보기 재생.
CharacterController.prototype.debugPreviewClip = function(name) {
    const clip = this.findAnimation(name);
    if (!clip) return;
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null;
    this.crossFadeTo([name], { loop: THREE.LoopOnce, fade: 0.1, clampWhenFinished: true, timeScale: 1.0 });
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => { this._returnToLocomotion(); }, (clip.duration + 0.15) * 1000);
};
