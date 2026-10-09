/* ============================================================
   <챔피언 이름> 전투 로직 - 템플릿
   ------------------------------------------------------------
   이 파일은 빌드 대상이 아니다(build_manifest.json에 넣지 않음) - 새
   챔피언을 추가할 때 복사해서 쓰는 스켈레톤이다. 사용법:
     1) 이 파일을 src/champions/<championId>.js로 복사한다.
     2) 아래 "xxx"를 전부 실제 championId(camelCase, 예: 'ashe')로
        바꾼다. 주석의 CamelCase 접두사("Xxx")도 함수명과 맞춰서
        바꾼다(예: _xxxCastQ -> _asheCastQ).
     3) 필요 없는 메서드(예: 패시브가 평타에 안 묻어나면
        _xxxOnBasicAttackHit)는 지운다.
     4) docs/ADDING_A_CHAMPION.md의 체크리스트를 따라 champion_data.js/
        champion_ability_database.js/character_controller.js/
        build_manifest.json을 함께 연결한다.

   이 패턴은 다른 모든 챔피언(바루스/이즈리얼/아리/애쉬 등)과 동일하다 -
   CharacterController.prototype 확장으로 챔피언 전용 메서드를 분리하고,
   character_controller.js의 _onBasicAttackHit/castAbility/
   _dispatchCast/_die()/update() 해당 지점에서 championId==='xxx'면
   이 파일의 함수로 위임한다(공용 Controller 코드를 직접 뒤섞지 않는다).
   ============================================================ */

/* ---------------------------------------------------------------
   공용 - 생존 확인(각 cast 함수 맨 앞에서 직접 검증한다 - UI 비활성화만
   믿지 않는다. 다른 챔피언들도 전부 이 패턴을 쓴다)
   --------------------------------------------------------------- */
CharacterController.prototype._xxxIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};

/* ---------------------------------------------------------------
   패시브
   ---------------------------------------------------------------
   패시브가 기본 공격마다 발동하면 _xxxOnBasicAttackHit에서 처리한다.
   (character_controller.js의 _onBasicAttackHit() 맨 앞에서 호출됨)
   패시브가 시간 기반(예: 일정 시간마다 스택 감소)이면 _xxxUpdate(dt)에서
   처리한다. 둘 다 필요 없으면 이 섹션 전체를 지운다.
   --------------------------------------------------------------- */

CharacterController.prototype._xxxOnBasicAttackHit = function(target, isCritical) {
  if (!target || target.hp <= 0) return;
  // 예시: 상태이상을 건다.
  // const p = this._champData().passive;
  // applyStatus(target, { id: 'xxxPassive', type: 'SLOW', duration: 1.0, value: 0.2, source: this });
};

/* ---------------------------------------------------------------
   Q
   ---------------------------------------------------------------
   아래는 "평범한 스킬샷"의 기본 골격이다. 패턴 선택 가이드:
   - 방향 없는 자기 자신 대상(상태 전환형, 애쉬 Q 같은 유형):
     mouseWorldPoint 매개변수를 생략하고, character_controller.js의
     castAbility()에 행동 잠금 우회 분기를 추가한다(가이드 4-4 참고).
   - 즉시 판정 스킬샷(애쉬 W/바루스 Q 등): 아래 골격 그대로 사용.
   - 챔피언 전용 자원(마나 아닌 것)을 쓰면 _payCost() 대신 직접
     소모량을 빼고 this.cooldowns.Q = abilityHasteCooldown(this, 쿨다운)을
     직접 설정한다(리 신/야스오/닐라/요네가 이 패턴).
   --------------------------------------------------------------- */

CharacterController.prototype._xxxCastQ = function(mouseWorldPoint, free = false) {
  if (!this._xxxIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const q = this._champData().Q;

  // 방향 계산(마우스 위치 -> 플레이어 기준 방향). 자기 자신 대상이면 이
  // 블록 전체를 지운다.
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();

  // 쿨다운/마나 확인 + 차감(스킬 포인트 미투자 시 자동 차단도 포함).
  if (!this._payCost('Q', free)) return;

  this.faceDirectionInstant(dir);
  this._clearActionTimers();

  // 시전 모션이 있는 스킬이면 액션 잠금 상태를 설정한다. 즉시 판정
  // 유틸 스킬이면 이 4줄은 지운다.
  this.currentActionKey = 'xxxQ'; this.currentPhase = 'STARTUP'; this.phaseCancelable = true;
  this.setState(STATE.Q_CAST);
  this.playFirstAvailable(['Spell1'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });

  // 판정을 즉시 할지, 지연시킬지 선택한다.
  // (A) 즉시 판정(캐스트 애니메이션 길이와 무관하게 입력 즉시 효과):
  this._xxxResolveQ(dir);

  // (B) 지연 판정(SKILL_TIMING_DATABASE에 등록한 eventTime만큼 늦게
  // 터지는 스킬 - 애쉬 W/E/R 전부 이 패턴). 이 경우 (A) 대신:
  // const castTime = q.castTimeSec != null ? q.castTimeSec : 0.25;
  // this._xxx.qPending = { dir: dir.clone(), remainingFireSec: castTime, remainingRecoverySec: castTime + 0.15, fireDone: false, recoveryDone: false };
  // 그리고 _xxxUpdate(dt)에서 진행시킨다(아래 매 프레임 훅 섹션 참고).
};

CharacterController.prototype._xxxResolveQ = function(dir) {
  const q = this._champData().Q;
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const raw = skillVal(q.damageByLevel, lvl) + (q.bonusAdRatio || 0) * this._getBonusAD();

  // 범위 탐색(원형 또는 부채꼴) - 시야 필터가 이미 적용된 목록을 돌려준다.
  const hits = findEnemiesInRadius(this.root.position, q.range || 600, { forward: dir, maxAngleDeg: (q.coneAngleDeg || 30) / 2 });
  if (!hits.length) { debugSkillMiss('Xxx Q', '범위 내 대상 없음'); return; }

  for (const { unit } of hits) {
    if (!unit || unit.hp <= 0) continue;
    // applyDamage()는 대상이 미니언/포탑/억제기/넥서스여도 내부에서
    // 알아서 전용 함수로 라우팅한다 - source: this를 꼭 채운다(아이템
    // 흡혈 등 범용 훅이 이 필드를 읽는다).
    applyDamage(unit, { rawDamage: raw, damageType: q.damageType || DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
    vfx.spawn('hit', getWorldPosition(unit)?.clone() || unit.mesh.position.clone());
    debugSkillHit('Xxx Q', unit);
  }
};

/* ---------------------------------------------------------------
   W / E / R
   ---------------------------------------------------------------
   Q와 동일한 골격을 복사해서 쓴다. R(궁극기)이 전 맵 사거리(글로벌)
   관통형이면 ProjectileSystem(고정 수명 2.5초)이 아니라 애쉬 R처럼
   _xxxUpdate(dt)에서 직접 진행시키는 수동 travel 패턴을 쓴다:

   CharacterController.prototype._xxxResolveRFire = function(p) {
     this._xxx.rTravel = {
       dir: p.dir.clone(), pos: this.root.position.clone(),
       maxDist: lolRangeToWorld(r.range || 20000),
       halfWidth: lolRangeToWorld(r.width || 100) * 0.5,
       speed: lolRangeToWorld(r.missileSpeed || 1600),
       traveled: 0,
     };
   };
   CharacterController.prototype._xxxTickRTravel = function(dt) {
     const travel = this._xxx && this._xxx.rTravel;
     if (!travel) return;
     const step = Math.min(Math.max(0, travel.maxDist - travel.traveled), travel.speed * dt);
     travel.pos.addScaledVector(travel.dir, step);
     travel.traveled += step;
     for (const u of getAllEnemyUnits()) {
       if (!u || u.hp <= 0 || !u.isChampion) continue; // 미니언/구조물은 통과(궁극기별로 다르면 조건 조정)
       if (isInCircle(u, travel.pos, travel.halfWidth)) { / * 명중 처리 * /; this._xxx.rTravel = null; return; }
     }
     if (travel.traveled >= travel.maxDist - 1e-4) this._xxx.rTravel = null;
   };
   그리고 _xxxUpdate(dt) 맨 끝에서 this._xxxTickRTravel(dt);를 호출한다.
   --------------------------------------------------------------- */

/* ---------------------------------------------------------------
   매 프레임 훅 - character_controller.js의 update()가 매 프레임 호출한다
   (가이드 4-7: `this._xxxUpdate(dt);`를 다른 챔피언들 옆에 추가).
   ---------------------------------------------------------------
   지연 판정(qPending/wPending/...)이 있으면 여기서 dt만큼 카운트다운
   시키고, 0 이하가 되면 실제 효과를 발동시킨다. 발동 직전에는 항상
   `if (this.currentActionKey === 'xxxQ')` 같은 가드를 넣는다 - 캐스트
   도중 다른 행동으로 넘어갔으면(예: 이동 취소) 판정을 건너뛰기 위함
   (애쉬 W/E/R이 전부 이 패턴을 쓴다).
   --------------------------------------------------------------- */

CharacterController.prototype._xxxUpdate = function(dt) {
  if (this.championId !== 'xxx' || !this._xxx) return;

  // 예시: 지연 판정 진행(필요 없으면 지운다).
  // if (this._xxx.qPending) {
  //   const p = this._xxx.qPending;
  //   if (!p.fireDone) {
  //     p.remainingFireSec -= dt;
  //     if (p.remainingFireSec <= 0) {
  //       p.fireDone = true;
  //       if (this.currentActionKey === 'xxxQ') this._xxxResolveQ(p.dir);
  //     }
  //   }
  //   if (!p.recoveryDone) {
  //     p.remainingRecoverySec -= dt;
  //     if (p.remainingRecoverySec <= 0) {
  //       p.recoveryDone = true;
  //       if (this.currentActionKey === 'xxxQ') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  //     }
  //   }
  //   if (p.fireDone && p.recoveryDone) this._xxx.qPending = null;
  // }

  // 전 맵 사거리 궁극기를 쓰면: this._xxxTickRTravel(dt);
};
