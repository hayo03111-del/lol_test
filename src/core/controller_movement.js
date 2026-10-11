/* ============================================================
   CharacterController - 이동/대상 선택/추적(moveTo, updateMovement, selectTarget 등)
   ------------------------------------------------------------
   character_controller.js의 클래스 본문에서 분리한 메서드들이다(동작 동일).
   챔피언 파일들과 같은 방식으로 CharacterController.prototype에 붙인다 -
   빌드 순서상 character_controller.js 바로 뒤에 로드된다.
   ============================================================ */

/* ---------------- movement ---------------- */
CharacterController.prototype.moveTo = function(point) {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (isCrowdControlled(this) || isRooted(this)) return; // 기절/속박 중에는 이동 명령을 받지 않는다
    if (this.currentActionKey === 'rWindup' || this.currentActionKey === 'rChannel' || this.currentActionKey === 'rCast'
        || this._isLeeSinCastLock()) return;
    // 모데카이저 R "죽음의 세계" 명세 6절 "경계 밖으로 나가지 못함": 이
    // 함수로 들어오는 이동 목적지 자체를 경계 반경 안으로 보정한다 -
    // 추격/피벗/애니메이션 전환 등 이후의 모든 이동 처리 로직은 전혀
    // 손대지 않아도 자동으로 경계를 지킨다(새 이동 시스템을 만들지 않음).
    if (this.realmId && this.realmId !== 'main') {
      const rel = new THREE.Vector3().subVectors(point, DEATH_REALM_CENTER); rel.y = 0;
      if (rel.length() > DEATH_REALM_BOUNDARY_RADIUS) {
        rel.normalize().multiplyScalar(DEATH_REALM_BOUNDARY_RADIUS * 0.95);
        point = DEATH_REALM_CENTER.clone().add(rel);
      }
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
    if (this.championId === 'yasuo' && this._yasuoPlayPostQMoveEntry()) return;
    if (!this.currentClipKey || !this._moveClips().includes(this.currentClipKey)) {
      // 업데이트(W 전용 상세 문서 12절): W처럼 Idle→Walk 전용 전환 클립이
      // 등록된 서브 상태에서는 그 클립을 먼저 재생하고, 없으면(대부분의
      // 챔피언) 기존처럼 바로 이동 루프로 전환한다.
      if (!this._playLocomotionEntryTransition()) {
        this.playFirstAvailable(['Run1_Raw'], { loop: THREE.LoopRepeat, fade: 0.12 });
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
    if (this.state !== STATE.MOVE || !this.targetPos) return;
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
      if (this.currentActionKey === 'varusQCharge') { this.setState(STATE.Q_CAST); return; }
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
    if (this.currentActionKey !== 'eChannel') this.faceDirection(toTarget, dt, 10);
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
    const maxRange = Math.max(this.attackOrderRetargetRadius, lolRangeToWorld(this.stats.attackRange || 0) * 3);
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
    if (!this.currentTarget || this.currentTarget.hp <= 0 || this.currentTarget.isDead || this.currentTarget.destroyed) {
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
    if (isInAttackRange(this, this.currentTarget)) { this.targetPos = null; this.isChasing = false; this._tryEngageTarget(); }
    else { this.targetPos = getWorldPosition(this.currentTarget).clone(); this.isChasing = true; }
};

CharacterController.prototype.faceDirection = function(dir, dt, speed = 8) {
    if (dir.lengthSq() < 1e-6) return;
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
    this.root.quaternion.slerp(targetQuat, Math.min(1, dt * speed));
};
CharacterController.prototype.faceDirectionInstant = function(dir) {
    if (dir.lengthSq() < 1e-6) return;
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
};

/* ---------------- targeting / basic attack ---------------- */
CharacterController.prototype.selectTarget = function(enemy) {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (!enemy || enemy.hp <= 0) return;
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

CharacterController.prototype._tryEngageTarget = function() {
    if (!this.currentTarget || this.currentTarget.hp <= 0) { this.currentTarget = null; this.isChasing = false; return; }
    const rangeBonus = this._settLeftHandRangeBonusWorld() + this._dariusWRangeBonusWorld();
    if (rangeBonus > 0) this.stats.attackRange += rangeBonus;
    const inRange = isInAttackRange(this, this.currentTarget);
    if (rangeBonus > 0) this.stats.attackRange -= rangeBonus; // 판정 직후 즉시 원상복구 - 사거리 표시 링 등 다른 시스템에 영향 주지 않음
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
    this._beginAttackSwing();
};
