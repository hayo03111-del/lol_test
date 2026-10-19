/* ============================================================
   CharacterController - 이동/대상 선택/추적(moveTo, updateMovement, selectTarget 등)
   ------------------------------------------------------------
   character_controller.js의 클래스 본문에서 분리한 메서드들이다(동작 동일).
   챔피언 파일들과 같은 방식으로 CharacterController.prototype에 붙인다 -
   빌드 순서상 character_controller.js 바로 뒤에 로드된다.
   ============================================================ */

/* ---------------- movement ---------------- */
CharacterController.prototype.moveTo = function(point) {
    this._wardOrder = null; // 이동 명령은 "걸어가서 와드 놓기"를 취소한다(와드 명령 자신은 moveTo 뒤에 다시 건다)
    this._approachCast = null; // 이동 명령은 "다가가서 시전"을 취소한다(접근 시전 자신은 moveTo 뒤에 다시 건다)
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (!this._keepAttackMove) this._attackMoveDest = null; // 83차: 일반 이동 명령은 공격 이동을 끝낸다
    this._autoAcquired = false;
    // 83차: 행동 불가 중 내린 이동 명령은 버리지 않고 기억했다가 풀리면 실행한다(원작).
    if (isCrowdControlled(this) || isRooted(this)) { this._ccBufferedMove = point.clone(); return; }
    this._ccBufferedMove = null;
    if (this.currentActionKey === 'rWindup' || this.currentActionKey === 'rChannel' || this.currentActionKey === 'rCast'
        || this._isLeeSinCastLock()) return;
    // 모데카이저 R "죽음의 세계" 명세 6절 "경계 밖으로 나가지 못함": 이
    // 함수로 들어오는 이동 목적지 자체를 경계 반경 안으로 보정한다 -
    // 추격/피벗/애니메이션 전환 등 이후의 모든 이동 처리 로직은 전혀
    // 손대지 않아도 자동으로 경계를 지킨다(새 이동 시스템을 만들지 않음).
    if (this.realmId && this.realmId !== 'main') {
      // 죽음의 세계는 일반 맵 위 반경 1200 경기장이다 - 맵 경계와 경기장 경계를 둘 다 지킨다.
      if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap) point = howlingAbyssMap.clampPosition(point.clone());
      point = clampToDeathRealm(point.clone(), getDeathRealm(this.realmId), this.pathingRadius ?? this.collisionRadius ?? 0);
    } else if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap) {
      // 요청(칼바람 나락 맵 7절 "플레이어가 맵 밖으로 나가지 못하게") -
      // 죽음의 세계에 있지 않은 일반 상태(realmId==='main')에서만 적용한다 -
      // 위 죽음의 세계 경계와 이 맵 경계는 서로 다른 좌표계라 절대 동시에
      // 적용되면 안 된다(둘 다 이 moveTo() 진입점 하나에서, 상호 배타적인
      // if/else로 분리해서 처리 - 새 이동 시스템을 따로 만들지 않는다).
      point = howlingAbyssMap.clampPosition(point.clone());
    }
    // 요청(가렌 E 문서 5/12절 "E 중에도 실제로 이동 가능해야 한다"): 예전에는
    // 이동 클릭이 방향 재계산에만 쓰이고 실제 좌표는 전혀 움직이지 않았다.
    // 이제 방향 갱신(_updateEChannelDirection - 스핀 클립 선택)과 실제 이동
    // 목적지 갱신을 분리해서 둘 다 처리한다. this.state를 MOVE로 바꿔서
    // updateMovement(dt)가 정상적으로 매 프레임 좌표를 갱신하게 하되, 자동
    // 얼굴 정렬(faceDirection)은 E 채널링 중에는 건너뛴다(updateMovement
    // 내부, "가렌 E 문서 6절" 참고) - 그렇지 않으면 캐릭터가 이동 방향으로
    // 계속 회전해버려서 "정면 기준 상대 방향" 개념 자체가 무너진다.
    if (this.currentActionKey === 'eChannel') {
      this._updateEChannelDirection(point);
      this.targetPos = point.clone();
      this.isChasing = false;
      this.currentTarget = null;
      targetRing.clear();
      this.setState(STATE.MOVE);
      return;
    }
    // 미구현이었던 부분 구현: 닐라 R(환희)은 채널링 내내 실시간 이동이
    // 가능하다("Nilah is unable to basic attack and cast her other
    // abilities during Apotheosis, but she is able to move.") - 지난
    // 수정에서는 이동 명령이 R 종료 시점까지 대기(pendingMove)만 되도록
    // 안전하게 막아뒀는데, 그러면 채널링 도중 실시간으로 걸어다니는
    // 원작 동작과 다르다. 가렌 E 채널링과 동일한 방식으로, currentActionKey
    // ('nilahR')와 애니메이션은 그대로 유지한 채 targetPos만 갱신해서
    // updateMovement(dt)가 매 프레임 실제 좌표를 옮기게 한다. STARTUP
    // (극히 짧은 선딜)이든 ACTIVE(채널 중)든 항상 이 분기를 타므로, 이동
    // 명령이 R 자체를 취소하는 일도 없다(무조건 여기서 return).
    if (this.currentActionKey === 'nilahR') {
      this.targetPos = point.clone();
      this.isChasing = false;
      this.currentTarget = null;
      targetRing.clear();
      this.setState(STATE.MOVE);
      return;
    }
    // 바루스 Q(꿰뚫는 화살) 충전 중에도 실시간 이동이 가능하다(bin의
    // mCanMoveWhileChanneling:true - "Varus can move while charging").
    // 닐라 R과 동일한 패턴으로 currentActionKey/애니메이션은 그대로 두고
    // targetPos만 갱신해 updateMovement(dt)가 실제 좌표를 옮기게 한다.
    // 조준 방향 자체는 충전 시작 시점에 고정된다(이 엔진은 스킬 조준을
    // "캐스트 시점 1회 계산"으로 처리하는 기존 관례를 그대로 따름 - 다른
    // 스킬샷들도 캐스트 중 마우스를 계속 추적하지 않는다).
    if (this.currentActionKey === 'varusQCharge') {
      this.targetPos = point.clone();
      this.isChasing = false;
      this.currentTarget = null;
      targetRing.clear();
      this.setState(STATE.MOVE);
      return;
    }
    // 요청(귀환 캔슬): 귀환 중 이동 명령 -> 귀환 모션 중단 후 즉시 이동 시작.
    if (this.state === STATE.RECALL) { this.cancelRecall(); this._commitMove(point); return; }

    // 어떤 이유로든 액션의 phase는 사라졌는데 currentActionKey만 남아 있는
    // '고아 액션(orphan action)'을 이동 입력에서 마지막으로 정리한다.
    // 이 방어막이 없으면 화면은 MOVE로 바뀌었는데 내부 권한 계산은 Q/스킬
    // 중으로 남아 이후 이동/스킬 입력이 전부 막히는 현상이 발생할 수 있다.
    if (this.currentActionKey && !this.currentPhase &&
        !['rWindup', 'rChannel', 'rCast', 'eChannel', 'nilahR', 'qChain'].includes(this.currentActionKey) && !this._isLeeSinCastLock()) {
      this.currentActionKey = null;
      this.phaseCancelable = false;
    }

    const authority = this.getActionAuthority();

    // 요청(변경): 마스터 이 W(명상) 중 이동 명령은 더 이상 pendingMove로
    // 미루지 않는다 - 즉시 명상을 취소하고 그 자리에서 바로 이동을
    // 시작한다(실제 LoL의 "명상은 이동하면 즉시 풀린다" 동작과 일치).
    // W Action/Animation/Timer/Status를 전부 정리하는 책임은
    // _masteryiEndMeditate('move', point)에 위임한다 - moveTo()는 감지만
    // 하고 실제 정리는 그 함수 하나에서만 일어나게 한다(중복 로직 방지).
    if (this.championId === 'masteryi' && (this.currentActionKey === 'w' || this.currentActionKey === 'masteryiW')) {
      if (this.currentPhase === 'STARTUP' || this.currentPhase === 'ACTIVE' || this.currentPhase === 'RECOVERY') {
        this._clearActionTimers();
        this._masteryiEndMeditate('move', point.clone());
        return;
      }
    }

    // 다리우스 Q(qChain) 중에는 이동 명령을 '대기 이동'으로 저장하지 않는다.
    // Q 시퀀스는 계속 재생하고, targetPos만 갱신해 실제 좌표만 움직인다.
    if (this.currentActionKey === 'qChain') {
      this.targetPos = point.clone();
      this.isChasing = false;
      this.currentTarget = null;
      targetRing.clear();
      this.moveDir.subVectors(this.targetPos, this.root.position).setY(0);
      if (this.moveDir.lengthSq() > 1e-6) this.moveDir.normalize();
      this.setState(STATE.MOVE);
      return;
    }

    if (this.currentPhase === 'RECOVERY' && authority.canMove) {
      // Release 이후: 이미 발사된 공격/스킬은 그대로 유지, 이동만 즉시 시작.
      this._clearActionTimers();
      this.currentActionKey = null; this.currentPhase = null;
      this._commitMove(point);
      return;
    }
    if (this.currentPhase === 'STARTUP' && authority.canMove) {
      // 요청 10: WINDUP 중 이동 명령 -> 공격/스킬 완전 취소(발사 안 됨, 데미지
      // 없음) 후 즉시 이동. onFire가 아직 호출되지 않았으므로 투사체도 없다.
      this._clearActionTimers();
      this.currentActionKey = null; this.currentPhase = null; this.pendingMove = null;
      this._commitMove(point);
      return;
    }
    if (this.currentPhase === 'STARTUP' || this.currentPhase === 'ACTIVE') { this.pendingMove = point.clone(); return; }
    this._commitMove(point);
};

CharacterController.prototype._commitMove = function(point) {
    // 업데이트(SequencePlayer 충돌 방지): W Entry Chain처럼 Gameplay Action을
    // 점유하지 않는 순수 애니메이션 시퀀스가 재생 중일 때도 이동 명령은
    // runAction()을 거치지 않고 여기로 곧장 들어올 수 있게 됐다. 이동으로
    // 실제로 전환하는 시점에 그 시퀀스가 아직 재생 중이면 여기서 확실히
    // 정리해서, 나중에 sequencePlayer가 자기 내부 기준(오래된 currentAction
    // 참조)으로 뒤늦게 onComplete를 중복 발사하는 것을 막는다. cancel()은
    // onCancel 콜백만 호출하고(대부분의 시퀀스에서 상태 정리만 함) 별도의
    // 강제 이동/취소 로직을 추가하지 않는다.
    if (this.sequencePlayer && this.sequencePlayer.isPlaying) this.sequencePlayer.cancel();
    this.currentTarget = null;
    this.isChasing = false;
    this.attackOrderActive = false;
    this.attackOrderAnchor = null;
    targetRing.clear();
    this.targetPos = point.clone();
    this.setState(STATE.MOVE);
    // 요청 4/23: 이미 MOVE 애니메이션이 재생 중이면 Idle을 거치지 않고 그대로
    // 유지한 채(재시작 없이) 방향과 목표만 바꾼다. 재생 중이 아닐 때만 새로 튼다.
    // 25차: 이미 도착 거리(updateMovement의 0.08) 안이면(= 정지 명령) 이동 클립을 틀지 않는다 - 다음 프레임에 바로 도착
    // 처리되는데, 그 한 프레임 동안 달리기 클립이 섞였다가 되돌아가 팔다리가 한 번 튀었다.
    const stopHere = new THREE.Vector3().subVectors(point, this.root.position).setY(0).length() < 0.08;
    if (stopHere && (!this.currentClipKey || !this._moveClips().includes(this.currentClipKey))) return;
    if (this.championId === 'yasuo' && this._yasuoPlayPostQMoveEntry()) return;
    if (!this.currentClipKey || !this._moveClips().includes(this.currentClipKey)) {
      // 업데이트(W 전용 상세 문서 12절): W처럼 Idle→Walk 전용 전환 클립이
      // 등록된 서브 상태에서는 그 클립을 먼저 재생하고, 없으면(대부분의
      // 챔피언) 기존처럼 바로 이동 루프로 전환한다.
      if (!this._playLocomotionEntryTransition()) {
        // 버그 수정: 예전엔 야스오 전용 클립 이름('Run1_Raw')만 시도해서 다른 챔피언은 이동 시작 프레임에
        // 아무 클립도 바뀌지 않았다(다음 프레임 자동 보정이 그제야 이동 클립을 틀었다).
        this.playFirstAvailable(this._moveClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
      }
    }
};

CharacterController.prototype.updateMovement = function(dt) {
    // 요청("챔피언 미니언 모두가 포탑,억제기,넥서스를 못뚫고 다니게") -
    // 미니언에 이미 있던 resolveMinionStructureCollisions()와 같은 원리를
    // 챔피언(플레이어)에도 적용한다. 이동 여부와 상관없이 매 프레임
    // 겹침을 즉시 풀어준다(가만히 서 있다가 미니언에 밀려 구조물 안으로
    // 들어가는 경우도 막기 위함) - MOVE 상태 조기 return보다 먼저 실행.
    if (typeof resolvePlayerStructureCollisions === 'function') resolvePlayerStructureCollisions(this);
    if (typeof resolvePlayerMinionCollisions === 'function') resolvePlayerMinionCollisions(this); // 61차: 미니언과 몸 충돌
    if (typeof resolvePlayerStructureCollisions === 'function') resolvePlayerStructureCollisions(this); // 미니언에 밀려 구조물 안으로 들어가지 않게 한 번 더
    if (this.state !== STATE.MOVE || !this.targetPos) return;
    // 83차: 이동 중에 기절·속박 등이 걸리면 그 자리에서 멈춘다(예전엔 moveTo에서만 막아 걷던 걸음은 계속됐다).
    if ((typeof isCrowdControlled === 'function' && isCrowdControlled(this)) || (typeof isRooted === 'function' && isRooted(this))) return;
    const pos = this.root.position;
    const toTarget = new THREE.Vector3().subVectors(this.targetPos, pos);
    toTarget.y = 0;
    const dist = toTarget.length();
    if (dist < 0.08) {
      pos.copy(this.targetPos);
      this.targetPos = null;
      this.isChasing = false;
      // 요청(다리우스 Q castChain 중 이동 - 목적지 도착 시): qChain(강제
      // 다단계 시퀀스)이 재생 중이면 여기서 애니메이션을 건드리지 않는다.
      // AnimationSequencePlayer가 현재 클립의 action.time을 직접 추적해서
      // "언제 다음 단계로 넘어갈지" 판정하는데, 여기서 같은 클립을
      // playFirstAvailable로 다시 재생하면 내부적으로 action.reset()이 호출돼
      // 그 진행 위치가 0으로 되돌아가 시퀀스 진행/피해 판정 타이밍이 깨진다
      // (예외적이지만 "땜질"이 아니라 실제 재생 위치 손상을 막기 위해 반드시
      // 필요한 처리다 - 다른 시퀀스형 액션의 currentActionKey를 여기에 추가로
      // 등록하고 싶다면 이 조건에 이름을 더하면 된다). state만 IDLE로 정리하고
      // 애니메이션은 시퀀스가 끝날 때 알아서 다음 단계로 넘어가게 둔다.
      // Q 시전 중 목적지에 도착해도 Q 모션을 끊지 않는다.
      // Q 시퀀스가 끝나는 시점의 onComplete에서만 정상 로코모션으로 복귀한다.
      if (this.currentActionKey === 'qChain') { this.setState(STATE.Q_CAST); return; }
      // 미구현이었던 부분 구현(닐라 R 실시간 이동)의 연장: 이동 목적지에
      // 도착했다고 해서 채널링 중인 R 모션을 Idle로 끊으면 안 된다 - R은
      // 여전히 진행 중이고(_nilahUpdate의 tick/최종타격은 시간 기반으로
      // 계속 진행됨), state만 R 캐스트로 되돌려 다음 이동 명령이 오기
      // 전까지 애니메이션이 어색하게 Idle로 스냅되지 않게 한다.
      if (this.currentActionKey === 'nilahR') { this.setState(STATE.R_CAST); return; }
      // 바루스 Q 충전 중 이동 목적지에 도착해도 충전 자체는 계속 진행 중이다
      // (닐라 R과 동일한 이유 - _varusReleaseQ가 재입력/타이머로 별도 종료됨).
      if (this.currentActionKey === 'varusQCharge') { this.setState(STATE.Q_CAST); this.playFirstAvailable(['Spell1_Idle', 'Spell1'], { loop: THREE.LoopRepeat, fade: 0.12 }); return; }
      this.setState(STATE.IDLE);
      this.playFirstAvailable(this.championId === 'yasuo' ? ['Idle1_Raw'] : this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
      return;
    }
    toTarget.normalize();
    this.moveDir.copy(toTarget);
    // 요청 5/21: 프레임과 무관하게 항상 dt 기반, 최종 이동속도는 스탯에서 유도.
    const finalSpeed = getFinalMoveSpeed(this.stats);
    const step = Math.min(dist, finalSpeed * dt);
    pos.addScaledVector(toTarget, step);
    // 요청(가렌 E 문서 6절 "정면 기준 상대 방향"): E 채널링 중에는 이동
    // 방향으로 캐릭터를 자동으로 회전시키지 않는다. 회전시키면 상대 각도가
    // 계속 0(정면)에 수렴해버려서 오른쪽/왼쪽/뒤 스핀 클립을 구분하는 문서의
    // 핵심 메커니즘 자체가 무의미해진다 - E 중에는 몸의 정면 방향을 그대로
    // 유지한 채 이동만 한다(전형적인 "스핀하며 이동/스트레이프" 동작).
    if (this.currentActionKey !== 'eChannel') this.faceDirection(toTarget, dt);
    this._updateLocomotionPlayback(finalSpeed);
    if (this.currentClipKey && !this._moveClips().includes(this.currentClipKey)) {
      this.playFirstAvailable(this._moveClips(), { fade: 0.15 });
    }
};

// 공격 명령으로 지정한 대상이 죽거나 파괴되면 주변의 살아있는 적을 자동으로
// 다시 선택한다. 대상 타입을 미니언으로 하드코딩하지 않고 getAllEnemyUnits()를
// 공용 진입점으로 사용하므로 추후 추가될 소환수/구조물도 같은 규칙을 따른다.
CharacterController.prototype._findNearbyAttackRetarget = function(anchor = null) {
    if (!this.attackOrderActive) return null;
    const origin = anchor ? getWorldPosition(anchor) : getWorldPosition(this);
    if (!origin) return null;
    const maxRange = Math.max(this.attackOrderRetargetRadius, (this.stats.attackRange || 0) * 3); // stats.attackRange는 이미 world 단위(44차: 이중 변환 제거)
    let best = null, bestDist = Infinity;
    const candidates = typeof getTargetableEnemyUnits === 'function' ? getTargetableEnemyUnits() : [];
    for (const candidate of candidates) {
      if (!candidate || candidate === this || candidate.hp <= 0 || candidate.isDead || candidate.destroyed || candidate.isUntargetable) continue;
      if (!canRealmInteract(this, candidate)) continue;
      const p = getWorldPosition(candidate);
      if (!p) continue;
      const d = Math.hypot(p.x - origin.x, p.z - origin.z);
      if (d > maxRange) continue;
      if (d < bestDist) { best = candidate; bestDist = d; }
    }
    return best;
};

// 요청 13: 타겟이 사거리 밖이면 CHASE(=MOVE 상태 + isChasing 플래그), 사거리에
// 들어오면 정지 후 WINDUP 시작. 매 프레임 현재 위치 기준으로 재검사한다.
CharacterController.prototype.updateTargetChase = function() {
    if (this.state !== STATE.MOVE) return;
    if (!this.currentTarget || this.currentTarget.hp <= 0 || this.currentTarget.isDead || this.currentTarget.destroyed
        || (typeof canRealmInteract === 'function' && !canRealmInteract(this, this.currentTarget))) {
      const previous = this.currentTarget || this.attackOrderAnchor;
      const next = this._findNearbyAttackRetarget(previous);
      if (next) {
        this.currentTarget = next;
        this.attackOrderAnchor = next;
        this.targetPos = getWorldPosition(next).clone();
        this.isChasing = true;
        targetRing.attachTo(next);
      } else {
        this.currentTarget = null;
        this.isChasing = false;
        return;
      }
    }
    if (this._isInAttackRangeWithBonus(this.currentTarget)) { this.targetPos = null; this.isChasing = false; this._tryEngageTarget(); }
    else { this.targetPos = getWorldPosition(this.currentTarget).clone(); this.isChasing = true; }
};

// 이동 방향 회전: 원작은 게임플레이상 회전이 사실상 즉시이고 화면에서만 몇 프레임에 걸쳐 돈다(공식 수치 없음).
// 예전엔 지수 감쇠(slerp dt×10)라 뒤로 돌 때 약 0.25초 동안 앞을 본 채 뒤로 미끄러졌다(측정: 최대 95~118°).
// 일정 각속도로 180°를 약 0.1초에 끝낸다(LOCOMOTION_TURN_RATE - 연출값, 추정).
const LOCOMOTION_TURN_RATE = Math.PI / 0.1;
CharacterController.prototype.faceDirection = function(dir, dt) {
    if (dir.lengthSq() < 1e-6) return;
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
    this.root.quaternion.rotateTowards(targetQuat, LOCOMOTION_TURN_RATE * dt);
};
// 이동 애니메이션 재생 속도를 실제 이동 속도에 맞춘다(발 미끄러짐 방지). 기준은 버프·둔화 없는 기본 이동 속도
// (= 1.0배). 이동 속도가 충분히 빨라지면 GLB에 들어 있는 원작 빠른 달리기 클립(Run_Haste 등)으로 바꾼다.
// 원작의 전환 기준·재생 배율은 공개 자료에 없어 근사값이다: 기본의 1.3배 이상에서 빠른 달리기(1.2배 미만이면 복귀),
// 재생 배율은 0.6~1.6배로 제한.
const LOCO_HASTE_ENTER = 1.3, LOCO_HASTE_EXIT = 1.2;
CharacterController.prototype._hasteMoveClipName = function() {
    if (this._hasteClipCache === undefined || this._hasteClipCacheFor !== this.championId) {
      this._hasteClipCacheFor = this.championId;
      const c = this.resolveClip ? this.resolveClip(['Run_Haste', 'Run_Fast']) : null;
      this._hasteClipCache = c ? c.name : null;
    }
    return this._hasteClipCache;
};
CharacterController.prototype._updateLocomotionPlayback = function(finalSpeed) {
    const base = this.stats && (this.stats.championBaseMoveSpeed || this.stats.baseMoveSpeed);
    if (!base || !this.currentAction) return;
    const ratio = finalSpeed / base;
    // 빠른 달리기는 기본 이동(스킬 전용 이동 클립·채널링·시퀀스가 아닐 때)에서만 쓴다.
    const plain = !this.currentActionKey && !this._locomotionSubStateClips('moveClips') && !(this._transientMoveClipNames && this._transientMoveClipNames.size);
    const haste = plain ? this._hasteMoveClipName() : null;
    const wasHaste = !!this._locoHaste;
    if (!haste) this._locoHaste = false;
    else if (!this._locoHaste && ratio >= LOCO_HASTE_ENTER) this._locoHaste = true;
    else if (this._locoHaste && ratio < LOCO_HASTE_EXIT) this._locoHaste = false;
    if (wasHaste !== !!this._locoHaste && plain) this.playFirstAvailable(this._moveClips(), { loop: THREE.LoopRepeat, fade: 0.2 });
    const clip = this.currentClipKey;
    if (!clip || !this._moveClips().includes(clip) || (this._transientMoveClipNames && this._transientMoveClipNames.has(clip))) return; // 전환·스킬 클립은 건드리지 않는다
    const ref = (this._locoHaste && clip === haste) ? LOCO_HASTE_ENTER : 1;
    this.currentAction.timeScale = THREE.MathUtils.clamp(ratio / ref, 0.6, 1.6);
};
CharacterController.prototype.faceDirectionInstant = function(dir) {
    if (dir.lengthSq() < 1e-6) return;
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
};

/* ---------------- targeting / basic attack ---------------- */
CharacterController.prototype.selectTarget = function(enemy) {
    this._wardOrder = null;
    this._approachCast = null; // 공격 명령은 "다가가서 시전"을 취소한다
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (!enemy || enemy.hp <= 0) return;
    // 죽음의 세계: 다른 세계의 유닛은 공격 대상으로 지정할 수 없다(위치만 보이는 혼령).
    if (typeof canRealmInteract === 'function' && !canRealmInteract(this, enemy)) return;
    // 요청(귀환 캔슬): 귀환 중 적 타겟 지정(공격 명령) -> 귀환 모션 중단 후
    // Idle을 거쳐 곧바로 교전 판정(_tryEngageTarget)으로 이어간다.
    if (this.state === STATE.RECALL) {
      this.cancelRecall();
      this.setState(STATE.IDLE);
      this.playFirstAvailable(this.championId === 'yasuo' ? ['Idle1_Raw'] : this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
    }
    // 버그 수정(핵심): 명상 중에는 this.state가 W_CAST라서, 아래
    // "IDLE || MOVE일 때만 _tryEngageTarget() 호출" 조건에 걸려 좌클릭
    // 공격 명령이 currentTarget만 저장한 채 조용히 씹혔다(평타가 전혀
    // 나가지 않음). 명상 중 공격 명령이 들어왔을 때는 좁게 마스터 이
    // 조건으로만 W를 먼저 종료시키고, currentTarget은 그대로 유지한 채
    // 기존 _tryEngageTarget()으로 연결한다 - 새 공격 진입 경로를 만들지
    // 않고 기존 시스템에 도달하게만 한다.
    const isMasterYiMeditating = this.championId === 'masteryi' &&
      (this.currentActionKey === 'w' || this.currentActionKey === 'masteryiW');
    // 83차: 평타 선딜 도중 "다른" 대상에게 공격 명령 → 선딜 취소(타이머 반환) 후 새 대상과 교전(원작). 같은 대상 재클릭은 무시.
    const retargetDuringWindup = this.state === STATE.ATTACK && enemy !== this.currentTarget && this._attackWindupEndsAt && performance.now() < this._attackWindupEndsAt;
    this.currentTarget = enemy;
    this.attackOrderActive = true;
    this.attackOrderAnchor = enemy;
    targetRing.attachTo(enemy);
    if (isMasterYiMeditating) {
      this._clearActionTimers();
      this._masteryiEndMeditate('attack'); // currentTarget은 위에서 이미 설정됨 - 여기서 지우지 않는다
      this._tryEngageTarget();
      return;
    }
    if (retargetDuringWindup) { this._cancelAttackWindup(); this._tryEngageTarget(); return; }
    if (this.state === STATE.IDLE || this.state === STATE.MOVE) this._tryEngageTarget();
};

// 요청 6/12/13: 사거리 안이면 WINDUP(공격) 시작, 밖이면 CHASE로 전환.
// 요청 18/19: Q 활성 중 "다음 평타가 왼손"일 때만 사거리 +50(LoL 단위).
// 기존 사거리 시스템(stats.attackRange, lolRangeToWorld)을 그대로 쓰고
// 별도의 거리 계산을 새로 만들지 않는다 - 호출부에서 잠깐 더했다가
// 즉시 원래 값으로 되돌리는 방식으로 기존 isInAttackRange()를 그대로 재사용한다.


// 다리우스 W(마비의 일격) 강화 평타 대기 중에는 사거리 +25(원작).
CharacterController.prototype._dariusWRangeBonusWorld = function() {
    if (this.championId !== 'darius' || !(this.attackOverrides || []).some((o) => o.id === 'W')) return 0;
    const cd = this._champData();
    return cd ? lolRangeToWorld(cd.W.rangeBonus || 0) : 0;
};

// 세트 왼손·다리우스 W 사거리 보너스까지 넣은 평타 사거리 판정. 44차: 쫓아가다 멈추는 판정(updateTargetChase)과
// 휘두르기 판정(_tryEngageTarget)이 같은 값을 쓰게 한다 - 예전엔 쫓아갈 때 보너스를 빼고 봐서 기본 사거리까지 걸어 들어갔다.
CharacterController.prototype._isInAttackRangeWithBonus = function(target) {
    const rangeBonus = this._settLeftHandRangeBonusWorld() + this._dariusWRangeBonusWorld();
    if (rangeBonus > 0) this.stats.attackRange += rangeBonus;
    const inRange = isInAttackRange(this, target);
    if (rangeBonus > 0) this.stats.attackRange -= rangeBonus; // 판정 직후 즉시 원상복구 - 사거리 표시 링 등 다른 시스템에 영향 주지 않음
    return inRange;
};
CharacterController.prototype._tryEngageTarget = function() {
    if (!this.currentTarget || this.currentTarget.hp <= 0 || (typeof canRealmInteract === 'function' && !canRealmInteract(this, this.currentTarget))) { this.currentTarget = null; this.isChasing = false; return; }
    // 38차: 람머스 대회전 중에는 평타 대신 대상에게 굴러간다(닿으면 rammus.js가 충돌 처리).
    if (this.championId === 'rammus' && this._rammus && this._rammus.roll) {
      this.targetPos = this.currentTarget.mesh.position.clone();
      this.isChasing = true;
      this.setState(STATE.MOVE);
      return;
    }
    const inRange = this._isInAttackRangeWithBonus(this.currentTarget);
    if (!inRange) {
      this.targetPos = this.currentTarget.mesh.position.clone();
      this.isChasing = true;
      this.setState(STATE.MOVE);
      if (!this.currentClipKey || !this._moveClips().includes(this.currentClipKey)) {
        this.playFirstAvailable(['Run1_Raw'], { loop: THREE.LoopRepeat, fade: 0.12 });
      }
      return;
    }
    this.isChasing = false;
    // 83차: 평타 타이머(1/공속)가 아직 돌고 있으면 사거리 안에서 대상을 바라보며 기다린다 - 예전엔 이동·스킬 뒤 다시 공격 명령을
    // 주면 곧바로 휘둘러, 이동/스킬이 공짜 평타 초기화가 됐다. 진짜 초기화 스킬만 resetAttackTimer()로 타이머를 지운다.
    const nowA = performance.now();
    if (nowA < (this._attackReadyAt || 0) - 15) {
      this._awaitingAttackTimer = true;
      if (this.state === STATE.MOVE) { this.targetPos = null; this.setState(STATE.IDLE); this.playFirstAvailable(this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.12 }); }
      const tp = getWorldPosition(this.currentTarget);
      if (tp) { const d = new THREE.Vector3(tp.x - this.root.position.x, 0, tp.z - this.root.position.z); if (d.lengthSq() > 1e-6) this.faceDirectionInstant(d.normalize()); }
      return;
    }
    this._awaitingAttackTimer = false;
    this._beginAttackSwing();
};

// 83차: 평타 타이머. 선딜이 시작될 때 다음 평타 가능 시각 = 지금 + 1/공속. 선딜 도중 취소되면 이전 값으로 돌려준다.
CharacterController.prototype._markAttackSwing = function(windupSec, intervalSec) {
    const now = performance.now();
    this._attackPrevReadyAt = this._attackReadyAt || 0;
    this._attackReadyAt = now + Math.max(0, intervalSec) * 1000;
    this._attackWindupEndsAt = now + Math.max(0, windupSec) * 1000;
    this._attackMarkPending = true; // 바로 뒤 runAction의 _clearActionTimers는 취소가 아니다
};
// 평타 초기화(가렌 Q·다리우스 W·레넥톤 W·노틸러스 W·마스터 이 W·티아맷/히드라 사용 등): 다음 평타를 바로 할 수 있다.
CharacterController.prototype.resetAttackTimer = function() { this._attackReadyAt = 0; this._attackWindupEndsAt = 0; };
// 선딜 도중 공격 취소(타이머 반환) - 대상은 유지하고 행동 불가가 풀리면 다시 공격한다.
CharacterController.prototype._cancelAttackWindup = function() {
    this._attackReadyAt = this._attackPrevReadyAt || 0; this._attackWindupEndsAt = 0; // 타이머 반환
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
    if (this.state === STATE.ATTACK) this.setState(STATE.IDLE);
    this._awaitingAttackTimer = !!this.currentTarget;
};
// 83차 공격 이동(원작): 기본은 "내 챔피언에서 가장 가까운" 적, 옵션(커서 기준 공격 이동)이면 커서에서 가장 가까운 적을
// 사거리 안에서 고른다. 없으면 목적지로 걸어가며 계속 살피다 사거리에 들어온 첫 적을 공격하고, 처치하면 목적지로 다시 간다.
// "챔피언만 공격"(기본 ` 키 누르고 있기)이면 챔피언만 고른다.
CharacterController.prototype._scanAttackableInRange = function(opts = {}) {
    let best = null, bestD = Infinity;
    const ref = opts.cursorPoint || null;
    for (const u of (typeof getTargetableEnemyUnits === 'function' ? getTargetableEnemyUnits() : [])) {
      if (!u || u.hp <= 0 || u.isWard || u.isUntargetable) continue;
      if (opts.championsOnly && !u.isChampion) continue;
      if (u.isStructure && typeof isStructureProtected === 'function' && isStructureProtected(u)) continue;
      if (typeof canRealmInteract === 'function' && !canRealmInteract(this, u)) continue;
      if (!this._isInAttackRangeWithBonus(u)) continue;
      const p = getWorldPosition(u); if (!p) continue;
      const d = getHorizontalDistance(ref || this.root.position, p);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
};
CharacterController.prototype.attackMoveTo = function(point, opts = {}) {
    const t = this._scanAttackableInRange(opts);
    this._attackMoveOpts = { championsOnly: !!opts.championsOnly };
    if (t) { this._attackMoveDest = point ? point.clone() : null; this.selectTarget(t); return t; }
    this._keepAttackMove = true; this.moveTo(point); this._keepAttackMove = false;
    this._attackMoveDest = point ? point.clone() : null;
    return null;
};
// 매 프레임: 평타 타이머 대기, 공격 이동 중 적 탐색, 대기 중 자동 공격(사거리 안), 행동 불가 중 받아 둔 이동 명령.
CharacterController.prototype._updateAttackTimerWait = function() {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    const cc = typeof isCrowdControlled === 'function' && (isCrowdControlled(this) || (typeof isRooted === 'function' && isRooted(this)));
    if (this._ccBufferedMove && !cc && !this.currentActionKey) { const p = this._ccBufferedMove; this._ccBufferedMove = null; this.moveTo(p); return; }
    // 평타 후딜(선딜 이후) 중 대상이 사거리를 벗어나면 곧바로 추격한다(타이머는 계속 돈다).
    if (this.state === STATE.ATTACK && this.currentPhase === 'RECOVERY' && !this._attackWindupEndsAt && this.currentTarget && this.currentTarget.hp > 0
        && !this._isInAttackRangeWithBonus(this.currentTarget) && (this._attackReadyAt || 0) > 0) {
      this._clearActionTimers(); this.currentActionKey = null; this.currentPhase = null; this.setState(STATE.IDLE);
      this._tryEngageTarget();
      return;
    }
    // 공격 이동: 걸어가는 중 사거리에 들어온 적 공격 / 대상 처치 후 목적지로 복귀.
    if (this._attackMoveDest && !cc) {
      if (this.state === STATE.MOVE && !this.currentTarget) {
        const t = this._scanAttackableInRange(this._attackMoveOpts || {});
        if (t) { const dest = this._attackMoveDest; this.selectTarget(t); this._attackMoveDest = dest; return; }
      } else if (this.state === STATE.IDLE && !this.currentTarget && !this.currentActionKey) {
        const dest = this._attackMoveDest;
        if (getHorizontalDistance(dest, this.root.position) > 0.2) { this._keepAttackMove = true; this.moveTo(dest); this._keepAttackMove = false; }
        else this._attackMoveDest = null;
        return;
      }
    }
    // 자동 공격(옵션 "자동 공격", 원작 기본 켜짐): 아무 명령 없이 서 있으면 사거리 안의 적을 친다(쫓아가지는 않는다).
    if (this.state === STATE.IDLE && !this.currentTarget && !this.targetPos && !this.currentActionKey && !cc
        && (typeof optionsState === 'undefined' || optionsState.autoAttack !== false)) {
      const t = this._scanAttackableInRange({});
      if (t) { this.selectTarget(t); this._autoAcquired = true; return; }
    }
    if (!this._awaitingAttackTimer) return;
    if (!this.currentTarget || this.currentTarget.hp <= 0) { this._awaitingAttackTimer = false; return; }
    if (this.state !== STATE.IDLE || this.currentActionKey) return;
    if (typeof isCrowdControlled === 'function' && isCrowdControlled(this)) return;
    const ready = performance.now() >= (this._attackReadyAt || 0) - 15;
    const inRangeNow = this._isInAttackRangeWithBonus(this.currentTarget);
    if (!inRangeNow && this._autoAcquired) { this.currentTarget = null; this._awaitingAttackTimer = false; this._autoAcquired = false; if (typeof targetRing !== 'undefined') targetRing.clear(); return; } // 자동 공격은 쫓아가지 않는다
    if (ready || !inRangeNow) this._tryEngageTarget();
};
