/* ============================================================
   CharacterController - 스킬 시전(castAbility, 시전 라우팅, 공용 _castQ/W/E/R, 가렌 E 채널링)
   ------------------------------------------------------------
   character_controller.js의 클래스 본문에서 분리한 메서드들이다(동작 동일).
   챔피언 파일들과 같은 방식으로 CharacterController.prototype에 붙인다 -
   빌드 순서상 character_controller.js 바로 뒤에 로드된다.
   ============================================================ */

// 챔피언별 스킬 시전 라우팅 - 예전엔 _dispatchCast/_castQ/_castW/_castE/_castR에
// "if (championId === 'x') return this._xCastQ(...)" 사슬로 흩어져 있던 것을 표로
// 모았다. 두 단계가 있다:
// - CHAMPION_DIRECT_CASTS: _dispatchCast()에서 가장 먼저 확인한다. 모션 테스트
//   (free=true)의 커스텀 애니메이션 시퀀스보다도 먼저 실행된다. 마우스 방향이
//   필요한 R(요네/이즈리얼/아리/바루스 - 공용 _castR은 마우스 좌표를 받지 않음)과
//   챔피언 전용 시전 함수로 4슬롯 전부를 처리하는 챔피언(닐라/레넥톤/애쉬/노틸러스)이 여기 있다.
// - CHAMPION_SLOT_CASTS: 커스텀 시퀀스 확인 뒤 _castQ/_castW/_castE/_castR 맨 앞에서
//   확인한다. 여기 없는 챔피언/슬롯은 공용 로직(가렌/다리우스/세트 등)을 탄다.
// 각 함수는 (컨트롤러, 마우스 지점, free)를 받는다.
const CHAMPION_DIRECT_CASTS = {
  nilah: {
    Q: (c, m, f) => c._nilahCastQ(m, f), W: (c, m, f) => c._nilahCastW(m, f),
    E: (c, m, f) => c._nilahCastE(m, f), R: (c, m, f) => c._nilahCastR(f),
  },
  vex: { Q: (c, m, f) => c._vexCastQ(m, f), W: (c, m, f) => c._vexCastW(m, f), E: (c, m, f) => c._vexCastE(m, f), R: (c, m, f) => c._vexCastR(f) },
  renekton: {
    Q: (c, m, f) => c._renektonCastQ(m, f), W: (c, m, f) => c._renektonCastW(m, f),
    E: (c, m, f) => c._renektonCastE(m, f), R: (c, m, f) => c._renektonCastR(f),
  },
  // 마스터 이 E/R은 커스텀 시퀀스를 건너뛰고 _castE/_castR(→ CHAMPION_SLOT_CASTS)로 간다.
  masteryi: { E: (c, m, f) => c._castE(m, f), R: (c, m, f) => c._castR(f) },
  yone: { R: (c, m, f) => c._yoneCastR(m, f) },
  ezreal: { R: (c, m, f) => c._ezrealCastR(m, f) },
  ahri: { R: (c, m, f) => c._ahriCastR(m, f) },
  varus: { R: (c, m, f) => c._varusCastR(m, f) },
  nautilus: {
    Q: (c, m, f) => c._nautilusCastQ(m, f), W: (c, m, f) => c._nautilusCastW(f),
    E: (c, m, f) => c._nautilusCastE(f), R: (c, m, f) => c._nautilusCastR(f),
  },
  ashe: {
    Q: (c, m, f) => c._asheCastQ(f), W: (c, m, f) => c._asheCastW(m, f),
    E: (c, m, f) => c._asheCastE(m, f), R: (c, m, f) => c._asheCastR(m, f),
  },
};
const CHAMPION_SLOT_CASTS = {
  Q: {
    ahri: (c, m, f) => c._ahriCastQ(m, f), yasuo: (c, m, f) => c._yasuoCastQ(m, f), yone: (c, m, f) => c._yoneCastQ(m, f),
    masteryi: (c, m, f) => c._masteryiCastQ(f), chogath: (c, m, f) => c._chogathCastQ(m, f), leesin: (c, m, f) => c._leesinCastQ(m, f),
    ezreal: (c, m, f) => c._ezrealCastQ(m, f), varus: (c, m, f) => c._varusCastQ(m, f),
  },
  W: {
    ahri: (c, m, f) => c._ahriCastW(m, f), yasuo: (c, m, f) => c._yasuoCastW(m, f), yone: (c, m, f) => c._yoneCastW(m, f),
    chogath: (c, m, f) => c._chogathCastW(f, m), leesin: (c, m, f) => c._leesinCastW(f, m), mordekaiser: (c, m, f) => c._mordeCastW(f),
    ezreal: (c, m, f) => c._ezrealCastW(m, f), varus: (c, m, f) => c._varusCastW(m, f),
  },
  E: {
    ahri: (c, m, f) => c._ahriCastE(m, f), yasuo: (c, m, f) => c._yasuoCastE(m, f), yone: (c, m, f) => c._yoneCastE(m, f),
    chogath: (c, m, f) => c._chogathCastE(f), masteryi: (c, m, f) => c._masteryiCastE(f), leesin: (c, m, f) => c._leesinCastE(f),
    ezreal: (c, m, f) => c._ezrealCastE(m, f), varus: (c, m, f) => c._varusCastE(m, f),
  },
  // 요네 R은 보통 위 CHAMPION_DIRECT_CASTS에서 마우스 방향과 함께 먼저 처리된다 -
  // 여기는 우회 호출 대비 안전망(정면 방향으로 나감).
  R: {
    yasuo: (c, m, f) => c._yasuoCastR(f), yone: (c, m, f) => c._yoneCastR(null, f), masteryi: (c, m, f) => c._masteryiCastR(f),
    chogath: (c, m, f) => c._chogathCastR(f), leesin: (c, m, f) => c._leesinCastR(f), sett: (c, m, f) => c._settCastR(f),
  },
};

/* ---------------- generic ability entry point (추가 수정사항 17) ---------------- */
CharacterController.prototype.castAbility = function(slot, mouseWorldPoint) {
    // 요청(귀환 캔슬): 귀환 중 QWER 입력 -> 귀환 모션부터 중단(Idle로 정리)한
    // 다음, 평소와 동일한 캐스트 가능 여부 판정(canStartNewAction)을 거친다.
    if (this.state === STATE.RECALL) { this.cancelRecall(); this.setState(STATE.IDLE); }
    if (isCrowdControlled(this)) { const m = `${slot} - 기절/속박 상태`; console.log(`[SKILL BLOCKED] ${m}`); showSkillToast(m); return; } // 기획안 8절: 기절/속박 중에는 스킬을 쓸 수 없다
    // 벡스 R 재시전은 1차 R 적중 후 쿨다운 중에도 허용된다. 일반적인 cooldown 게이트보다 먼저 처리한다.
    if (this.championId === 'vex' && slot === 'R' && !this._vex.dashActive && this._vex.recastTarget && performance.now() < this._vex.recastReadyUntil) {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }
    // 바루스 Q(꿰뚫는 화살)는 눌러서 충전하고 다시 누르면(또는 최대
    // 충전시간 도달 시 자동으로) 발사하는 홀드형 스킬샷이다. 이 엔진은
    // keyup을 스킬에 전달하지 않으므로(전역 keydown 핸들러만 존재,
    // global_system_instances.js), "이미 충전 중일 때 Q를 다시 누르는
    // 입력"을 원작의 릴리즈(keyup)로 취급한다 - 마스터 이 W(명상)를 다시
    // 누르면 즉시 종료하는 것과 동일한 패턴(재입력 자체가 하나의 의미
    // 있는 액션). 일반 쿨다운/마나 게이트보다 먼저 처리해야 한다 - 이미
    // 비용을 지불하고 충전 중인 스킬이므로 재입력은 추가 비용 없이 항상
    // 통과되어야 한다.
    if (this.championId === 'varus' && slot === 'Q' && this.currentActionKey === 'varusQCharge') {
      this._varusReleaseQ();
      return;
    }
    // 아리 R(혼령 질주)도 벡스 R과 동일한 이유로 일반 쿨다운/마나 게이트보다
    // 먼저 처리한다 - 첫 시전에서만 실제 쿨다운/마나를 지불하고(_ahriCastR),
    // 그 뒤 남은 돌진 횟수(rCharges)가 있고 재시전 창(rReadyUntil) 안이면
    // 실제 쿨다운이 그대로 흐르고 있어도(스킬 슬롯 표시상 "쿨다운 중") 추가
    // 비용 없이 즉시 재시전을 허용한다(공식 스킬 설명 "기본 3회 사용 가능").
    if (this.championId === 'ahri' && slot === 'R' && this._ahri.rCharges > 0 && performance.now() < this._ahri.rReadyUntil) {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }
    // 스킬 우선순위 문서(4) 섹션 4/5/17/18: 마스터 이 E(우주류 검술)/R(최후의
    // 전사)는 별도 시전 애니메이션이 없는 순수 버프라, 지금 무엇을 하고
    // 있든(평타 WINDUP/RECOVERY, 심지어 Q Alpha Strike 도중까지) 진행 중인
    // 행동을 절대 끊지 않고 즉시 적용되어야 한다. 그래서 이 둘만 공용
    // canStartNewAction() 게이트를 거치지 않는다 - 실제 사용 가능 여부(CC/
    // 침묵/쿨다운/마나)는 각 _masteryiCastE/_masteryiCastR 내부에서 그대로
    // 확인한다.
    if (this.championId === 'masteryi' && (slot === 'E' || slot === 'R')) {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 마스터 이 W(명상) 중 Q 입력: W를 즉시 강제 중지하고 같은 입력의 Q를 바로 실행한다.
    // Spell2_Loop 애니메이션을 즉시 끊고 E/R 일시정지 시간을 복구한 뒤 Alpha Strike로 전환한다.
    if (this.championId === 'masteryi' && slot === 'Q' && this.currentActionKey === 'masteryiW') {
      // 버그 수정("마나 부족하면 모션이 기본으로 돌아간다"): 명상을
      // 취소하기 전에 실제로 Q를 쓸 수 있는지 먼저 확인한다.
      if (!this._canAffordAbility('Q')) { this._payCost('Q', false); return; }
      this._clearActionTimers();
      this._masteryiEndMeditate('cast');
      this._dispatchCast('Q', mouseWorldPoint, false);
      return;
    }

    // 마스터 이 W(명상)는 평타 진행 중에도 즉시 사용할 수 있다.
    if (this.championId === 'masteryi' && slot === 'W') {
      // 버그 수정(요청 4/11 "명캔의 두 번째 절반" - W 취소): 지금까지
      // 이미 명상 중(currentActionKey==='masteryiW')에 W를 다시 누르면
      // 그냥 _dispatchCast로 흘러들어가 처음부터 다시 시전(비용 재지불,
      // 타이머 재시작)하고 있었다 - "즉시 W 취소"가 아니라 "명상 재시작"
      // 이었다. 이제 이미 명상 중일 때 W를 또 누르면 그 즉시 취소로
      // 처리한다(비용을 또 지불하지 않음).
      if (this.currentActionKey === 'masteryiW') {
        this._clearActionTimers();
        this._masteryiEndMeditate('cancelled');
        console.log('[Master Yi W] 명캔 - 명상 즉시 취소');
        return;
      }
      const inAttack = this.currentActionKey && (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit');
      // 버그 수정(요청 2/3 "공격 판정 이전에는 명캔이 되면 안 된다"):
      // 예전엔 평타가 아직 WINDUP(적중 전)이어도 무조건 _clearActionTimers()로
      // 끊어버려서, 데미지가 한 번도 적용되지 않은 채로 공격이 사라졌다.
      // 이제 STARTUP(적중 전)이면 공격을 끊지 않고 그대로 진행시켜서 HIT가
      // 반드시 먼저 발생하게 하고, W는 "HIT 직후 예약"으로만 처리한다.
      if (inAttack && this.currentPhase === 'STARTUP') {
        this._masteryi.pendingWAfterHit = true;
        console.log('[Master Yi W] 평타 HIT 판정 전 - HIT 이후로 W 예약 (판정 보장)');
        return;
      }
      // RECOVERY(이미 HIT 끝남) 중이거나 공격 중이 아니면: 바로 취소하고 W 시작.
      // 버그 수정("마나 부족하면 모션이 기본으로 돌아간다"): 평타를
      // 취소하기 전에 실제로 W를 쓸 수 있는지 먼저 확인한다.
      if (inAttack) {
        if (!this._canAffordAbility('W')) { this._payCost('W', false); return; }
        this._clearActionTimers();
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      }
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 가렌 W(용기)는 E 채널링을 포함해 현재 어떤 행동 중이어도 즉시 사용할 수 있는
    // 독립 버프다. 캐스트 모션/행동 상태를 점유하지 않으므로 공용 canStartNewAction()
    // 게이트를 우회하고 즉시 디스패치한다.
    if (this.championId === 'garen' && slot === 'W') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 버그 수정(모데카이저 W(불멸) 2단계 시스템 명세 1/4/6/11절): W는
    // 1차(보호막)/2차(회복) 모두 별도 모션이 없는 논애니메이션 스킬이라,
    // 가렌 W/세트 Q/다리우스 W와 동일한 이유로 평타·Q·E·이동 등 현재 어떤
    // 행동 중이어도 즉시 통과되어야 한다. 그런데 이 championId==='mordekaiser'
    // && slot==='W' 예외 분기가 빠져 있어서, 다른 행동 중에는 아래 일반
    // canStartNewAction() 게이트에 걸려 "다른 행동 중이라 캐스트 불가"로
    // 씹혔다(_mordeCastW()가 아예 호출되지 않음) - 애니메이션이 전혀 없는
    // 스킬인데도 마치 모션이 있는 스킬처럼 차단된 것. _mordeCastW()는
    // currentActionKey/currentPhase/runAction을 전혀 건드리지 않으므로,
    // 게이트를 우회해도 진행 중이던 다른 행동의 상태를 손상시키지 않는다.
    if (this.championId === 'mordekaiser' && slot === 'W') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 요청: "가렌 E 시전 중에 Q 시전 가능". 가렌 Q(결단)도 W와 마찬가지로
    // 캐스트 모션이 없는 순간 발동 버프(다음 평타 강화 예약)라 E 채널링을
    // 방해하지 않는다 - _castQ 내부의 취소 로직도 이미 "현재 진행 중인 게
    // 기본 공격일 때만" 끊도록 되어 있어서(코드 확인 완료), E 채널은 그대로
    // 유지된 채 Q만 얹힌다.
    if (this.championId === 'renekton' && slot === 'R' && this.currentActionKey === 'renektonW') {
      // 평-W-R: W 피해/기절 판정은 이미 끝난 뒤 남은 후딜레이만 R 모션으로 캔슬한다.
      // 버그 수정("마나 부족하면 모션이 기본으로 돌아간다"): W를 취소하기
      // 전에 실제로 R을 쓸 수 있는지(마나/쿨다운) 먼저 확인한다 - 못 쓰면
      // W 후딜 애니메이션을 그대로 이어간다.
      if (!this._canAffordAbility('R')) { this._payCost('R', false); return; }
      this._clearActionTimers();
      this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      this._dispatchCast('R', mouseWorldPoint, false);
      return;
    }

    if (this.championId === 'garen' && slot === 'Q') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 요청: "세트 W나 E 시전 중에 Q 시전 가능". 세트 Q(주먹다짐)도 캐스트
    // 모션이 없는 순수 버프(다음 2회 평타 강화 예약)라 W(강펀치)/E(안면강타)
    // 진행 중에도 즉시 사용할 수 있어야 한다 - _castQ의 취소 로직 역시
    // 기본 공격일 때만 끊도록 되어 있어 W/E는 그대로 계속 진행된다.
    if (this.championId === 'sett' && slot === 'Q') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 요청: "다리우스 Q E R 시전 중에 W 시전 가능". 다리우스 W(제압) 역시
    // 캐스트 모션 없이 다음 평타만 강화하는 순수 버프다. 아래 _castW의
    // 다리우스 분기에서 "지금 진행 중인 게 기본 공격일 때만" 취소하도록
    // 별도로 고쳤다(예전엔 무조건 _clearActionTimers()를 불러서 Q 체인/E/R이
    // 진행 중이었어도 그걸 함께 끊어버렸다).
    if (this.championId === 'darius' && slot === 'W') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 애쉬 Q(궁사의 집중)도 동일한 이유로 게이트를 우회한다 - 실제 게임에서
    // 별도 시전 모션이 없는 순수 상태 스킬(집중 스택 소모 + 공격 속도
    // 버프 + 다음 평타 강화 예약)이라, 무엇을 하고 있든(평타 WINDUP/
    // RECOVERY 등) 즉시 사용 가능해야 한다. _asheCastQ는 currentActionKey/
    // currentPhase를 전혀 건드리지 않으므로, 게이트를 우회해도 진행 중이던
    // 다른 행동의 상태를 손상시키지 않는다(가렌/모데카이저/다리우스 W와
    // 동일한 안전성 근거). 실제 사용 가능 여부(4중첩 확보/침묵)는
    // _asheCastQ 내부에서 그대로 확인한다.
    if (this.championId === 'ashe' && slot === 'Q') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }
    // 노틸러스 W(타이탄의 분노)도 시전 모션 없는 즉시 보호막이라 평타 중에도
    // 바로 쓸 수 있다(애쉬 Q와 같은 이유 - 진행 중 행동 상태를 건드리지 않음).
    if (this.championId === 'nautilus' && slot === 'W') {
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    // 스킬 우선순위: 다리우스/가렌도 기본 공격보다 스킬을 우선한다.
    // 기본 공격 계열(attack*/crit) 진행 중에 Q/W/E/R 입력이 들어오면
    // 평타의 남은 타이머/상태를 즉시 정리하고 스킬을 바로 시작한다.
    // 현재 액션이 스킬 자체라면 이 예외를 적용하지 않아 스킬끼리 취소하지 않는다.
    // 버그 수정(핵심 - "레넥톤은 평타가 스킬보다 우선시된다"): 다른
    // 챔피언들의 평타 액션 키는 'attack1'/'attack2'/'crit' 형태인데,
    // 레넥톤만 _renektonBeginAttackSwing()에서 'renektonAA1'/'renektonAA2'
    // 같은 별도 이름을 쓴다(위 코드 참고). 그런데 "지금 평타 중인가"를
    // 판단하는 이 공용 조건은 'attack'으로 시작하는 이름만 인식하고
    // 있어서, 레넥톤은 실제로 평타 중이어도 항상 isBasicAttackAction이
    // false로 나왔다 - 그래서 평타 중 스킬을 누르면(아래 큐잉 로직도
    // isBasicAttackAction에 의존) 큐에 쌓이지도 않고 그냥 "다른 행동 중"
    // 으로 거부만 당했다(평타가 끝날 때까지 스킬 자체가 씹힘).
    const isBasicAttackAction = !!(
      this.currentActionKey &&
      (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit' ||
       (this.championId === 'renekton' && this.currentActionKey.startsWith('renektonAA')))
    );
    if ((this.championId === 'darius' || this.championId === 'garen' || this.championId === 'renekton') && isBasicAttackAction) {
      // 버그 수정("마나 부족하면 모션이 기본으로 돌아간다"): 실제로 쓸 수
      // 있는 스킬인지(스킬포인트/쿨다운/마나) 먼저 확인하고, 그럴 때만
      // 평타를 취소한다 - 어차피 못 쓸 스킬 때문에 진행 중인 평타 모션을
      // 망가뜨리지 않는다. 못 쓰는 경우엔 기존과 동일한 차단 메시지만
      // 띄우고 평타는 그대로 이어간다.
      if (!this._canAffordAbility(slot)) { this._payCost(slot, false); return; }
      this._clearActionTimers();
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this.pendingMove = null;
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }

    if (this.championId === 'yasuo' && slot === 'Q' && this.currentActionKey === 'yasuoE' && this.currentPhase === 'ACTIVE') { this._dispatchCast(slot, mouseWorldPoint, false); return; }
    // PC 위키: 야스오 R은 E(질풍검) 돌진 중에도 쓸 수 있다.
    if (this.championId === 'yasuo' && slot === 'R' && this.currentActionKey === 'yasuoE' && this.currentPhase === 'ACTIVE') { this._dispatchCast(slot, mouseWorldPoint, false); return; }
    // PC 패치 기록(V1.0.0.97 이후): 가렌은 E(심판) 회전 중에도 모든 스킬을 쓸 수 있고 회전은 계속된다.
    // Q/W는 원래 허용돼 있었고, R도 회전을 끊지 않는 전용 경로로 처리한다(예전엔 막혀 있었다).
    if (this.championId === 'garen' && slot === 'R' && this.currentActionKey === 'eChannel') { this._garenCastRDuringE(); return; }
    // 닐라 E 돌진 중 Q는 같은 돌진 경로에 Q를 겹쳐서 사용할 수 있다. E의
    // 돌진 액션을 끊지 않고 Q만 별도로 실행한다.
    if (this.championId === 'nilah' && slot === 'Q' && this.currentActionKey === 'nilahE' && this.currentPhase === 'ACTIVE') {
      this._dispatchCast('Q', mouseWorldPoint, false); return;
    }
    // 요청("닐라는 평Q평, 평E평 같은 평캔이 작동하게 해줘"): Q/E 둘 다
    // 같은 규칙으로 다룬다 -
    //  - STARTUP/ACTIVE(아직 적중 전): 평타 판정을 절대 훼손하면 안 되므로
    //    취소하지 않고 큐에 저장한다. 적중이 끝나면 자동으로 나간다.
    //  - RECOVERY(이미 적중 끝남, 후딜만 남음): 후딜을 스킵하고 즉시
    //    스킬로 넘어간다 - 이게 진짜 "평캔"이다(데미지는 이미 보장된 채
    //    후딜만 스킵해서 다음 행동을 앞당김).
    // 두 경우 모두 실제로 스킬을 쓸 수 있는지(마나/쿨다운) 먼저 확인해서,
    // 못 쓰는 스킬 때문에 평타 모션이 망가지지 않게 한다.
    if (this.championId === 'nilah' && (slot === 'Q' || slot === 'E') && isBasicAttackAction) {
      if (this.currentPhase === 'RECOVERY') {
        if (!this._canAffordAbility(slot)) { this._payCost(slot, false); return; }
        this._clearActionTimers(); this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        this._dispatchCast(slot, mouseWorldPoint, false);
        // 버그 수정("E 충전이 없으면 아예 멈춘다"와 동일한 원인 방지): 위에서
        // 평타 Recovery 상태를 이미 지운 뒤 시전을 시도하는데, 시전 함수가
        // (대상 없음 등 다른 이유로) 아무 상태도 새로 만들지 않고 조용히
        // return하면 캐릭터가 이동/재교전으로 복귀하지 못하고 그 자리에서
        // 멈춘 것처럼 보인다. 실제로 스킬이 나갔으면 currentActionKey가
        // 바뀌어 있으므로 이 조건은 실행되지 않는다.
        if (this.currentActionKey === null) this._resumeAfterAction();
        return;
      }
      this.pendingCast = { slot, mouseWorldPoint };
      console.log(`[Nilah ${slot}] 평타 HIT 판정 전 - HIT 이후로 ${slot} 예약 (판정 보장, 평${slot}캔)`);
      return;
    }
    // 닐라 E는 어떤 평타든 Windup 이전의 타격 판정을 훼손하면 안 되므로,
    // STARTUP 중에는 기존 공통 큐 규칙을 그대로 따른다.
    // 버그 수정("WQ 콤보가 안 된다"): 이즈리얼의 Q/W/E/R 전용 캐스트 함수
    // (_ezrealCastQ 등)는 runAction()을 거치지 않고 currentActionKey/
    // currentPhase를 직접 설정하는 방식이라, actionData에 'ezrealW' 같은
    // 키가 등록돼 있지 않다. 그 결과 getActionAuthority()가 이 키에 대한
    // data를 항상 null로 계산해서 canCast가 항상 false가 되고, 기본
    // 공격이 아니라서 대기열에도 들어가지 못한 채(아래 isBasicAttackAction
    // 분기 밖) 그냥 거부돼버렸다 - 실제 게임에서 이즈리얼의 Q/W/E/R는
    // 판정이 캐스트 즉시 이루어지고 이후 재생되는 모션은 장식적인 후딜일
    // 뿐이라 W→Q 콤보처럼 스킬끼리 빠르게 이어붙일 수 있어야 하는데, 이
    // 엔진에서는 그 사이 다른 스킬 입력이 전부 씹히고 있었다. 다리우스/
    // 가렌처럼 "스킬이 스킬을 즉시 취소하고 이어받는" 기존 예외들과 같은
    // 방식으로, 이즈리얼 자신의 스킬 액션 중일 때는 그 자리에서 바로
    // 취소하고 새 스킬로 넘어가게 한다(단, R은 제외 - 1초 캐스트 타임 동안
    // 시전자 스스로도 끊을 수 없는 확정 캐스트라는 게 원작 설계이므로
    // ezrealR의 STARTUP은 그대로 잠가둔다).
    if (this.championId === 'ezreal' && this.currentActionKey && this.currentActionKey.startsWith('ezreal') && this.currentActionKey !== 'ezrealR') {
      this._clearActionTimers();
      this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      this._dispatchCast(slot, mouseWorldPoint, false);
      return;
    }
    if (!this.canStartNewAction()) {
      // 요청("평타 도중 스킬을 누르면 그 평타가 끝나고 바로 스킬이 나가게"):
      // 막고 있는 행동이 기본 공격(attack1~4/crit)일 때만 그 자리에서
      // 거부하지 않고 큐에 저장한다 - 평타 자체는 방해받지 않고(적중까지
      // 정상 진행) 끝나는 즉시(_resumeAfterAction) 이 스킬이 자동으로
      // 나간다. 다른 스킬이 진행 중이라 막힌 경우는 기존과 동일하게
      // 거부한다(스킬끼리 서로 끼어들어 취소되는 것은 이번 요청 범위 밖).
      if (isBasicAttackAction) {
        this.pendingCast = { slot, mouseWorldPoint };
        console.log(`[SKILL QUEUED] ${slot} - 현재 평타(${this.currentActionKey}) 종료 후 자동 시전 예약`);
        return;
      }
      const m = `${slot} - 다른 행동(${this.currentActionKey || this.state}) 중이라 캐스트 불가`; console.log(`[SKILL BLOCKED] ${m}`); showSkillToast(m); return;
    }
    this._dispatchCast(slot, mouseWorldPoint, false);
};

// 추가 수정사항 19: "모션 테스트" 버튼 전용 진입점. 쿨다운/마나를 소모하지
// 않고, 진행 중이던 액션을 즉시 정리한 뒤 매핑된 스킬 모션을 그대로 재생한다
// (실제 게임플레이 이벤트-VFX/투사체/데미지-까지 동일하게 실행되어 타이밍을
// 눈으로 바로 확인할 수 있다).
CharacterController.prototype.testAbility = function(slot, mouseWorldPoint) {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (this.state === STATE.RECALL) this.cancelRecall();
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null;
    this.setState(STATE.IDLE);
    this._dispatchCast(slot, mouseWorldPoint, true);
};

// 요청: "Q 키 → championSkillAnimationSequences.Q 전체 실행". 해당 슬롯에
// 사용자가 등록한 커스텀 애니메이션 시퀀스가 1개 이상 있으면 그것을 그대로
// 재생하고, 없으면(빈 배열/미등록) 기존 자동/단일 클립 매핑으로 폴백한다.
//
// 중요(문서 10: "애니메이션 시퀀스가 Gameplay Logic을 완전히 우회하는
// 버그" - 가렌 Q/W, 세트 Q/E가 정상 작동하지 않던 원인): 예전에는 이 함수
// 맨 앞에서 커스텀 시퀀스 존재 여부만 확인하고, 있으면 곧장
// _castCustomSequence()로 가서 실제 챔피언 스킬 함수(_castQ 등, 그
// 안의 _garenQOnCast/_activateAttackOverrideFromDb/_settQOnCast/
// _settEOnHit 같은 진짜 게임플레이 로직)를 통째로 건너뛰고, 대신
// 범용 매직 데미지(CUSTOM_SKILL_DAMAGE)나 빈 W 버프로 완전히 대체해
// 버렸다. 즉 커스텀 애니메이션을 등록하는 순간 그 챔피언의 실제 스킬이
// 고장 나는 구조였다.
//
// 이제는 실제 플레이어 입력(castAbility 경유, free=false)에서는 커스텀
// 시퀀스를 절대 확인하지 않고 항상 진짜 스킬 함수(_castQ/_castW/_castE/
// _castR, 챔피언별 실제 로직 포함)를 그대로 호출한다 - "애니메이션이
// Gameplay를 대체하지 않는다"는 원칙 그대로. 반면 "▶ 모션 테스트"
// 버튼(testAbility 경유, free=true)은 애초에 쿨다운/마나를 소모하지
// 않는 순수 애니메이션 미리보기 용도이므로, 그 경로에서만 등록된 커스텀
// 시퀀스를 재생해서 편집기에서 바로 타이밍을 확인할 수 있게 남겨뒀다
// (이 경로는 실제 게임플레이에 전혀 영향을 주지 않는다).
//
// 마스터 이의 E/R은 free 여부와 무관하게 항상 예외 - 원작에 시전
// 애니메이션이 아예 없는 순수 버프라(문서 8) 테스트 미리보기에서도 커스텀
// 시퀀스를 재생할 이유가 없다.
CharacterController.prototype._dispatchCast = function(slot, mouseWorldPoint, free) {
    // 아이템 패시브(광휘의 검 - 주문 검/스펠블레이드) - 모든 챔피언의 모든
    // 스킬 시전이 결국 이 한 지점을 거치므로, 여기 한 줄만 추가하면 어떤
    // 챔피언으로 어떤 스킬을 쓰든 자동으로 적용된다(개별 챔피언 파일을
    // 건드릴 필요 없음 - applyDamage()의 처형 판정과 동일한 원칙). free
    // (미리보기/프리뷰 캐스트)일 때는 무장시키지 않는다.
    if (!free && typeof itemOnAbilityDispatch === 'function') itemOnAbilityDispatch(this);
    // 악의(경멸의 "궁극기 가속"/증오안개의 "궁극기로 피해를 입힐 때") -
    // 모든 챔피언의 모든 스킬 시전이 이 한 지점을 거치므로, 여기서 마지막
    // 시전 슬롯과 시각만 기록해두면 챔피언 파일을 건드리지 않고도 "방금
    // 궁극기(R)를 썼는지"를 item_system.js에서 판정할 수 있다.
    if (!free) { this._itemLastCastSlot = slot; this._itemLastCastSlotAt = performance.now(); }
    const direct = CHAMPION_DIRECT_CASTS[this.championId] && CHAMPION_DIRECT_CASTS[this.championId][slot];
    if (direct) return direct(this, mouseWorldPoint, free);
    if (free && this.playSkillAnimationSequence(slot, { mouseWorldPoint, free })) return;
    switch (slot) {
      case 'Q': return this._castQ(mouseWorldPoint, free);
      case 'W': return this._castW(mouseWorldPoint, free);
      case 'E': return this._castE(mouseWorldPoint, free);
      case 'R': return this._castR(free);
    }
};

/** 슬롯(Q/W/E/R)에 등록된 커스텀 애니메이션 시퀀스를 재생한다. 오직
 *  "▶ 모션 테스트"(free=true) 경로에서만 호출된다(위 _dispatchCast
 *  참고) - 실제 게임플레이(cost/buff/hit)는 절대 여기서 처리하지 않고
 *  순수 애니메이션 미리보기만 담당한다. 등록된 Step이 없으면 아무것도
 *  하지 않고 false를 반환한다. */
CharacterController.prototype.playSkillAnimationSequence = function(slot, { mouseWorldPoint, free = false } = {}) {
    const steps = this.skillAnimStore ? this.skillAnimStore.get(slot) : [];
    if (!steps || steps.length === 0) return false;
    this._castCustomSequence(slot, steps, mouseWorldPoint, free);
    return true;
};

// 요청 5~10: Q/W/E/R 각각에 등록된 여러 애니메이션(steps)을 순서대로,
// 각 Step의 startTime~endTime 구간만 강제 재생한다. 중앙 관리 시스템은
// this.sequencePlayer 하나뿐이라(요청 11) 다른 스킬/이동/사망 등으로
// 인터럽트되면 _clearActionTimers()가 자동으로 취소한다.
//
// 문서 10 반영: 이제 _dispatchCast가 free===true(모션 테스트)일 때만 이
// 함수를 호출하므로, 아래 applySkillEffect()의 매직 데미지/W 버프는
// 실제 게임플레이가 아니라 순수 프리뷰용 자리표시 이펙트일 뿐이다(진짜
// 쿨다운/마나 소모나 챔피언 고유 로직과는 무관 - 실제 시전은 항상
// _castQ/_castW/_castE/_castR을 직접 거친다). 아래 `!free` 분기는 이
// 함수가 실수로 free=false로 호출되는 경우에 대비한 안전장치로만 남겨둔다.
CharacterController.prototype._castCustomSequence = function(slot, steps, mouseWorldPoint, free = false) {
    const cost = SKILL_COST[slot];
    if (!free) {
      if (this.cooldowns[slot] > 0 || this.mp < cost.mana) return;
      this.mp -= cost.mana; this.cooldowns[slot] = typeof abilityHasteCooldown === 'function' ? abilityHasteCooldown(this, cost.cd, slot) : cost.cd;
    }

    this._clearActionTimers(); // 요청 11: 진행 중이던 다른 시퀀스/액션을 먼저 확실히 취소

    let faceDir = null;
    if (slot === 'Q' && mouseWorldPoint) {
      faceDir = new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position); faceDir.y = 0;
      if (faceDir.lengthSq() < 1e-6) faceDir = null; else faceDir.normalize();
    } else if (this.currentTarget) {
      faceDir = new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position); faceDir.y = 0;
      if (faceDir.lengthSq() < 1e-6) faceDir = null; else faceDir.normalize();
    }
    if (faceDir) this.faceDirectionInstant(faceDir);

    this.setState(STATE[`${slot}_CAST`]);
    this.currentActionKey = `custom${slot}`;
    this.currentPhase = 'STARTUP';
    this.phaseCancelable = false;

    const castPos = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    let effectApplied = false;
    const applySkillEffect = () => {
      if (effectApplied) return;
      effectApplied = true;
      vfx.spawn(slot.toLowerCase(), castPos.clone());
      if (slot === 'W') {
        this._activateWSubState(this.actionData.w?.buffDuration ?? 5.0);
        return;
      }
      if (this.currentTarget && this.currentTarget.hp > 0) {
        applyDamage(this.currentTarget, { rawDamage: CUSTOM_SKILL_DAMAGE[slot] ?? 15, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
      }
    };

    // steps(startTime/endTime) -> AnimationSequencePlayer가 기대하는
    // steps(clipStart/clipEnd) 형태로만 변환한다. 이름 검색/강제중단/다음
    // Step 자동진행은 전부 범용 AnimationSequencePlayer(섹션 1-A2)가 담당한다.
    const playerSequence = {
      steps: steps.map((s) => ({ animation: s.animation, clipStart: s.startTime, clipEnd: s.endTime })),
      onStepStart: (index) => {
        if (index === steps.length - 1) this.currentPhase = 'ACTIVE'; // 마지막 Step = 피격/이펙트 판정 구간
      },
      onComplete: () => {
        applySkillEffect();
        this.currentActionKey = null; this.currentPhase = null;
        this._resumeAfterAction();
      },
      onCancel: () => {
        this.currentActionKey = null; this.currentPhase = null;
        this._resumeAfterAction();
      },
    };
    this.sequencePlayer.play(playerSequence);
};

// 요청 9: 시퀀스 종료 후 무조건 Idle로 보내지 않고, 현재 게임 상태에 맞는
// 애니메이션으로 복귀한다 -- 대기 중이던 이동 명령 > 살아있는 타겟 재교전
// > Idle 순으로 기존 상태 시스템(_commitMove/_tryEngageTarget/_returnToLocomotion)
// 을 그대로 재사용한다.
CharacterController.prototype._resumeAfterAction = function() {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN || this.state === STATE.RECALL) return;
    // 요청("평타 도중 스킬을 누르면 그 평타가 끝나고 바로 스킬이 나가게"):
    // 대기 이동보다도 먼저 확인한다 - 플레이어가 마지막으로 명시적으로
    // 누른 입력은 스킬이었으므로, 그 스킬이 pendingMove/재교전보다
    // 우선한다. canStartNewAction()을 다시 확인해서(CC에 걸리는 등 그
    // 사이에 상태가 바뀌었을 수 있으므로) 여전히 시전 가능할 때만 실제로
    // 내보낸다 - 못 쓰게 됐으면 조용히 버리고 기존 우선순위(이동/재교전)로
    // 넘어간다.
    if (this.pendingCast) {
      const c = this.pendingCast; this.pendingCast = null;
      if (this.canStartNewAction()) {
        console.log(`[SKILL QUEUED] ${c.slot} - 평타 종료, 예약된 스킬 시전`);
        // 버그 수정(핵심 - "마나 부족 시 스킬 쓰면 평타가 멈춘다"): 예약
        // 당시엔 시전 가능해 보였어도, 실제로 castAbility가 실행되는
        // 시점엔 마나가 부족해져서 내부에서 조용히 실패(토스트만 띄우고
        // return)할 수 있다. 지금까지는 castAbility를 부른 뒤 무조건
        // return해서, 실패했을 때 아래 pendingMove/재교전/평타 재개
        // 로직이 전혀 실행되지 않아 캐릭터가 그 자리에 멈춘 것처럼
        // 보였다. mp/해당 슬롯 쿨다운/currentActionKey 중 정말 아무것도
        // 안 바뀌었으면(=진짜 아무 일도 안 일어난 것) 실패로 보고 아래
        // 일반 재개 로직(이동/재교전)으로 계속 진행한다.
        const mpBefore = this.mp;
        const cdBefore = this.cooldowns[c.slot];
        const actionBefore = this.currentActionKey;
        this.castAbility(c.slot, c.mouseWorldPoint);
        const nothingHappened = this.mp === mpBefore && this.cooldowns[c.slot] === cdBefore && this.currentActionKey === actionBefore;
        if (!nothingHappened) return;
      } else {
      // 특수 Q 상태가 비정상적으로 남아 있는 경우 한 번 더 정리한 뒤
      // 같은 입력을 재평가한다. 실제 CC/쿨다운/마나 제한은 건드리지 않는다.
      if (this.currentActionKey === 'qChain' && this.championId === 'darius' && !this.sequencePlayer.isPlaying) {
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        this.castAbility(c.slot, c.mouseWorldPoint);
        return;
      }
      if (this.currentActionKey === 'masteryiQ' && this.championId === 'masteryi' && !this._masteryi?.alpha) {
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        this.isUntargetable = false;
        if (this.model) this.model.visible = true;
        this.castAbility(c.slot, c.mouseWorldPoint);
        return;
      }
      }
    }
    if (this.pendingMove) { const p = this.pendingMove; this.pendingMove = null; this._commitMove(p); return; }
    if (this.currentTarget && this.currentTarget.hp > 0) { this._tryEngageTarget(); return; }
    // 요청(일관성): currentTarget이 죽어 있으면 여기서 한 번에 정리한다 -
    // 예전엔 평타 종료 경로만 따로 currentTarget=null을 했고 스킬 종료
    // 경로는 안 했다. 이제 이 함수 하나가 모든 종료 지점의 공통 진입점이라
    // 여기서 한 번만 처리하면 어디서 호출하든 동일하게 정리된다.
    if (this.currentTarget && this.currentTarget.hp <= 0) this.currentTarget = null;
    this._returnToLocomotion();
};

// 요청(가렌/세트 한계 해결 - 실제 공개 데이터 EMPOWERED_ATTACK 타입):
// "Q Cast Time = 0"이 곧 "잠금 없는 일반 스킬"이 아니라, 아예 독립적인
// 캐스트 모션 자체가 없고 "다음 평타(가렌: 1회, 세트: 2회)를 즉시
// 강화 + 평타 타이머 리셋"하는 구조다(문서: "Q → ATTACK_ANIMATION이
// 아니라 Q → 기존 평타 타이머 리셋 → 다음 평타에 Q 모션 적용"). 챔피언
// DB에 Q.attackOverrideAnimationNames가 등록된 경우에만 이 분기를 타고,
// 없는 챔피언(다리우스 등)은 기존 방향별 캐스트 로직을 그대로 쓴다.
/* ================= YASUO ================= */








// (야스오 치명타 확률/초과분 공격력은 recomputeStats()의 공용 "의지" 처리로 옮김)

// Q3(회오리바람)를 실제 투사체처럼 야스오 정면 방향으로 시간에 따라
// 전진시킨다. 매 프레임 현재 위치 기준 좁은 반경(halfWidth)만 검사하므로
// 뒤쪽/좌우로 멀리 벗어난 적, 사거리(1150) 밖의 적은 맞지 않는다.
// 새 VFX 시스템을 만들지 않고 기존 'q' VFX(tornado 옵션)를 그대로 쓴다.


// _yasuoTick(dt)에서 매 프레임 호출된다. 회오리바람을 전방으로 전진시키고,
// 새로 닿은 적에게만 (중복 없이) 피해+KNOCKUP을 적용한다.


// Q3 회오리바람이 최대 사거리에 도달했을 때(적중 여부와 무관) 스택을
// 정리한다. 기존 로직대로 Q3 사용 후에는 항상 스택이 0으로 초기화된다.


// Q/W/E/R 재시전 등으로 인해 "Q 이후 진입 동작(Run1_IN_Raw)" 종료 타이머가
// 중간에 취소(_clearActionTimers)되어도 transient 클립 플래그가 영구히
// 남아 있지 않도록 정리한다(요청 10: Run1_IN_Raw가 마지막 프레임에
// 고정되어 보이거나 무한 반복되는 문제 방지).



























CharacterController.prototype._castQ = function(mouseWorldPoint, free = false) {
    const slotCast = CHAMPION_SLOT_CASTS.Q[this.championId];
    if (slotCast) { slotCast(this, mouseWorldPoint, free); return; }
    // PC 위키(Noxian Guillotine): R 시전 시간이 끝난 뒤 0.25초 동안 Q/E 사용 불가.
    if (this.championId === 'darius' && performance.now() < (this._dariusRQeLockUntil || 0)) return;
    const db = this._championAbilityDbEntry();
    // 업데이트(다리우스 Q 문서 1~11절): Q가 방향별 단일 클립이 아니라
    // "웜업 클립 → 실제 공격 클립"을 강제로 연속 재생해야 하는 챔피언을 위한
    // 분기. 세트 R(sett.js의 multiPhaseClips 재생)과 동일한 패턴(AnimationSequencePlayer로
    // 각 클립을 처음부터 끝까지 순서대로 강제 재생)을 재사용한다. 방향별
    // 캐스트 클립이 따로 없는 스킬이라 qLeft/qRight 같은 방향 분기 없이
    // 이 체인 하나만 재생한다(문서에도 방향별 진입 클립이 없다고 명시).
    const castChain = db && db.Q && db.Q.castChain;
    if (castChain && castChain.steps && castChain.steps.length) {
      // 다리우스 Q 전용 안정화:
      // GLB의 AnimationClip 이름은 exporter에 따라 ".anm" 확장자가
      // 빠지거나 붙는 경우가 있다. 기존 exact-match만 사용하면
      // "Darius_Spell1_IN.anm"을 찾지 못해 Q 체인이 통째로 무시되고,
      // 이후 일반 Q 경로로 넘어가면서 실제 Q 모션이 사라지는 문제가 생긴다.
      // 따라서 .anm 유무와 대소문자를 무시한 안전한 이름 해석을 먼저 한다.
      const resolveDariusQClip = (name) => {
        if (!name) return null;
        const candidates = [
          String(name),
          String(name).replace(/\.anm$/i, ''),
          String(name).endsWith('.anm') ? String(name) : `${name}.anm`,
        ];
        for (const candidate of candidates) {
          const exact = this.findAnimation(candidate);
          if (exact) return exact;
        }
        const normalized = String(name).replace(/\.anm$/i, '').toLowerCase();
        return this.clips.find(c =>
          String(c.name || '').replace(/\.anm$/i, '').toLowerCase() === normalized
        ) || null;
      };

      // 게임로직 TODO(문서 3절 "Q 입력이 들어왔을 때 반드시 거쳐야 하는
      // 판정"): 사망/강제행동/다른 스킬 잠금 등 canCastQ() 상당의 검사가
      // 먼저 필요하다고 문서는 명시하지만, 정확한 우선순위 규칙은 "자료만으로
      // 확정할 수 없다"고 되어 있어 이 데모의 기존 쿨다운/마나 체크만 사용한다.
      if (isSilenced(this)) return;
      if (!this._payCost('Q', free)) return;

      let chainClips = castChain.steps.map(resolveDariusQClip);

      // 웜업 클립만 이름 차이로 빠진 경우에도 Q 전체 모션이 사라지지 않도록
      // 실제 공격 클립 Spell1을 단독 Q 모션으로 안전하게 재생한다.
      const attackClip = resolveDariusQClip('Spell1');
      if (chainClips.some(c => !c) && attackClip) {
        const fallback = castChain.steps.map(() => null);
        fallback[fallback.length - 1] = attackClip;
        chainClips = fallback;
      }

      if (chainClips.every(Boolean)) {
        this._clearActionTimers();
        // 요청(다리우스 Q 중 실제 이동 가능): 이미 이동 중이었다면(targetPos
        // 존재) state를 MOVE로 유지해서 updateMovement(dt)가 끊김 없이 계속
        // 좌표를 갱신하게 한다. 이동 중 재생되는 웜업/스윙 클립은
        // _beginTransientMoveClip으로 등록해서, updateMovement의 자동 보정이
        // 강제 시퀀스를 끊지 않게 한다(도착 시점 보호는 updateMovement의
        // qChain 예외가 별도로 담당). 정지 중이었다면 기존처럼 Q_CAST.
        const startedMoving = !!this.targetPos;
        this.setState(startedMoving ? STATE.MOVE : STATE.Q_CAST);
        this.currentActionKey = 'qChain'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
        if (startedMoving) chainClips.forEach((c) => this._beginTransientMoveClip(c.name));
        let damageApplied = false;
        const impactIndex = Math.min(castChain.impactStepIndex ?? (chainClips.length - 1), chainClips.length - 1);
        const fireImpact = () => {
          if (damageApplied) return;
          damageApplied = true;
          this.currentPhase = 'ACTIVE';
          vfx.spawn('q', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0)));
          // 버그 수정(논타겟 스킬 Hit Detection): 다리우스 Q(학살)는 자기중심
          // 범위 스킬(Self-centered Area)이라 "currentTarget 잠금 여부"와
          // 무관하게 실제로 사거리 안에 있는 모든 적에게 맞아야 한다. 이제
          // this.root.position을 중심으로 실제 반경(q.range) 판정을 해서
          // 맞은 대상에게만 DamageSystem(applyDamage, _dariusQOnHit 내부에서
          // 호출)을 부른다 - 자루(35%) 구간 구분은 부채꼴/거리 세부 판정이
          // 더 필요해 이번 수정 범위에서는 유지(항상 도끼날 전체 피해).
          if (this.championId === 'darius') {
            const cd = this._champData();
            const hits = findEnemiesInRadius(this.root.position, cd.Q.range);
            let healHits = 0;
            if (hits.length) hits.forEach((h) => { if (this._dariusQOnHit(h.unit, h.distance)) healHits++; debugSkillHit('Darius Q', h.unit, { distance: Math.round(h.distance), zone: h.distance > lolRangeToWorld(cd.Q.handleRange) ? 'BLADE' : 'HANDLE' }); });
            else debugSkillMiss('Darius Q', 'no target in range');
            this._dariusQHeal(healHits);
          } else if (this.currentTarget && this.currentTarget.hp > 0) {
            const dmg = this.actionData.qForward ? this.actionData.qForward.dmg : 18;
            applyDamage(this.currentTarget, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          }
          this.currentPhase = 'RECOVERY'; this.phaseCancelable = true;
        };
        this.sequencePlayer.play({
          steps: chainClips.map((c) => ({ animation: c.name, clipStart: 0, clipEnd: c.duration })),
          onStepStart: (index) => { if (index === impactIndex) fireImpact(); },
          onComplete: () => {
            fireImpact(); // impactIndex 단계가 어떤 이유로 스킵됐다면 마지막에 보정 발동
            if (startedMoving) chainClips.forEach((c) => this._endTransientMoveClip(c.name));
            this.currentActionKey = null; this.currentPhase = null;
            // 게임로직 TODO(문서 10절): "Windup/Swing 중 캔슬 가능 여부와
            // 정확한 캔슬 프레임은 자료만으로 확정할 수 없다"고 명시돼 있어
            // phaseCancelable을 임의로 좁히지 않고, 종료 후 기존
            // _resumeAfterAction() 규칙(대기 이동 > 재교전 > Idle/Run)을
            // 그대로 따른다(문서 7/8절 "종료 시점의 실제 입력 상태 확인"과
            // 일치).
            this._resumeAfterAction();
          },
          onCancel: () => {
            if (startedMoving) chainClips.forEach((c) => this._endTransientMoveClip(c.name));
            this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction();
          },
        });
        return;
      }
      // 체인에 등록된 클립 이름이 실제 로드된 glb에 없으면 조용히 아래
      // 일반 분기로 폴백한다(다른 챔피언 로직에 영향 없음).
    }
    if (db && db.Q && db.Q.attackOverrideAnimationNames) {
      // 참고: 이동속도 버프(_garenQOnCast, 요청 3절)는 아래에서 이미
      // 실제로 구현되어 stats.percentMoveSpeedBonus까지 반영된다(공용
      // getMoveSpeedBuffPercent()/getFinalMoveSpeed() 경로 - update()의
      // MS_BUFF 동기화 지점 참고). 이 주석은 그 기능이 아직 없던 이전
      // 버전에서 남은 낡은 메모라 실제 동작과 어긋나 있었으므로 정리한다.
      if (isSilenced(this)) return;
      if (!this._payCost('Q', free)) return;
      if (this.championId === 'garen') this._garenQOnCast();
      if (this.championId === 'sett') {
        console.log('[SETT Q] Q INPUT');
        this._settQOnCast();
      }
      // 가렌 Q 강화 평타 유효 시간은 원작 4.5초(CHAMPION_DATA.garen.Q.enhancedWindow).
      // 예전엔 세트와 같은 임시 상한 6.0초를 그대로 썼다.
      const qWindow = (this.championId === 'garen' && this._champData().Q.enhancedWindow) || 6.0;
      this._activateAttackOverrideFromDb('Q', qWindow);
      if (this.championId === 'sett') {
        // 요청("Q 썼을 때 왼손/오른손 모션을 찾아줘"): 방금 등록한
        // override가 실제로 어떤 클립에 연결됐는지 콘솔에 남긴다 - Q를
        // 실제로 눌러보면 바로 확인 가능하다.
        const ov = this.attackOverrides.find((o) => o.id === 'Q');
        if (ov) {
          console.log(`[ANIMATION] 세트 Q 강화 왼손(1타) 실제 클립명 = "${ov.sequenceClips ? ov.sequenceClips[0] : ov.clips[0]}"`);
          console.log(`[ANIMATION] 세트 Q 강화 오른손(2타) 실제 클립명 = "${ov.sequenceClips ? ov.sequenceClips[1] : '(sequenceClips 없음 - clips 배열 재사용)'}"`);
        }
      }
      if (this.championId === 'sett') {
        // 버그 수정(핵심): 지금까지 Q는 qUsesRemaining 플래그만 세팅하고
        // 끝났다 - 이미 진행 중이던 평타의 RECOVERY(후딜레이) setTimeout은
        // 전혀 건드리지 않아서, 다음 평타는 여전히 원래 후딜레이가 다
        // 끝난 뒤에야 나갔다("Q를 눌러도 아무 체감이 없다"의 정확한 원인).
        // 이제 지금이 평타의 RECOVERY 구간(=이미 Hit가 발생한 뒤)이면 그
        // 남은 후딜레이 타이머를 즉시 취소하고 바로 다음 스윙으로 넘어간다.
        // WINDUP/ACTIVE(아직 Hit 전)에는 절대 손대지 않는다 - Hit가 나기도
        // 전에 공격을 끊으면 안 된다는 원칙(요청 11/12)을 그대로 지킨다.
        // override 등록(바로 위)이 먼저 끝나 있어야 한다 - 아래에서 즉시
        // 다음 스윙이 동기적으로 시작되므로, 그 시점에 override가 이미
        // 걸려 있어야 Q 강화 공격으로 나간다.
        const key = this.currentActionKey;
        console.log(`[SETT Q] Attack Phase: ${this.currentPhase || 'NONE'}`);
        if (this.currentPhase === 'RECOVERY' && key && (key.startsWith('attack') || key === 'crit')) {
          console.log('[SETT Q] CANCEL NORMAL ATTACK');
          this._clearActionTimers();
          console.log('[SETT Q] NORMAL ATTACK CANCELLED');
          console.log('[SETT Q] Q CANCEL SUCCESS');
          console.log('[SETT Q] START Q ATTACK');
          this._onActionRecoveryComplete(key); // 즉시 다음 스윙으로(_tryEngageTarget -> _beginAttackSwing)
          console.log(`[SETT Q] Next Attack: ${this._sett.punchSide.toUpperCase()}`);
        }
      }
      // 업데이트(가렌 Q 문서 4/6/14절 - 애니메이션 레이어): Q_ARMED 상태를
      // "애니메이션 전용" 서브 상태로도 켜서, substateLocomotion(위 DB 참고)
      // 이 이동 중 Run_Base 대신 Run_Spell1을 선택하게 한다. 6.0초는
      // registerAttackOverride와 동일한 임시 상한일 뿐, 문서 12/13절이
      // 요구하는 "실제 HIT 성공 시점에 소모"는 별도로 _beginAttackSwing()에서
      // override가 실제로 소진될 때 clearSubState('Q')를 호출해 맞춘다(아래
      // 참고) - 즉 이 6.0초는 "최악의 경우"에만 쓰이는 안전장치고, 실제로는
      // 평타가 나가는 순간 그보다 먼저 꺼진다.
      this.setSubState('Q', qWindow);
      // "Attack Timer Reset": 이미 평타 RECOVERY 중이면 그 잠금을 즉시 풀고
      // 바로 재교전해서 강화된 평타가 지체 없이 나가도록 한다.
      if (this.currentPhase === 'RECOVERY' && this.currentActionKey && this.currentActionKey.startsWith('attack')) {
        this._clearActionTimers();
        this.currentActionKey = null; this.currentPhase = null;
        if (this.currentTarget && this.currentTarget.hp > 0) this._tryEngageTarget();
      } else if (this.championId === 'garen' && !this.currentActionKey && this.currentTarget && this.currentTarget.hp > 0) {
        // 버그 수정: 평타 도중 Q를 누르면 _requestCast()의 "스킬이 평타보다 우선"
        // 분기가 평타를 먼저 끊고(currentActionKey=null) 여기로 들어온다 - 위
        // RECOVERY 분기는 해당되지 않아 상태가 ATTACK인 채로 멈춰 강화 평타가
        // 나가지 않았다(다리우스 W와 같은 문제). 대상이 살아 있으면 바로 재교전.
        this._resumeAfterAction();
      }
      return;
    }

    if (isSilenced(this)) return;
    if (!this._payCost('Q', free)) return;
    // 버그 수정(진짜 원인): dir가 이 함수 어디에도 선언되어 있지 않았다 -
    // 아래에서 dir.y = 0 등으로 곧바로 사용하고 있어서, 실행되는 순간
    // "dir is not defined" ReferenceError가 조용히 발생하고 그 자리에서
    // 멈췄다(node --check는 문법 오류만 잡아내고 이런 런타임 참조 오류는
    // 못 잡는다). 이게 "모데카이저 Q가 작동하지 않는다"의 정확한 원인이다.
    // 마우스 지점 우선, 없으면 현재 타겟, 그것도 없으면 현재 바라보는
    // 방향으로 조준 방향을 계산한다(이 파일의 다른 논타겟 스킬들과 동일한 패턴).
    const dir = mouseWorldPoint
      ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position)
      : (this.currentTarget ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position)
        : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion));
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.copy(this.moveDir.lengthSq() > 0 ? this.moveDir : new THREE.Vector3(0,0,1));
    dir.normalize();

    const localDir = dir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    let key;
    if (Math.abs(localDir.x) > Math.abs(localDir.z)) key = localDir.x > 0 ? 'qRight' : 'qLeft';
    else key = localDir.z > 0 ? 'qForward' : 'qBack';

    const castPos = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    this.runAction(key, STATE.Q_CAST, {
      faceDir: dir,
      onFire: () => {
        vfx.spawn('q', castPos.clone().addScaledVector(dir, 1.2), dir);
        if (this.championId === 'mordekaiser') {
          // 모데카이저 Q(말살)는 스킬샷이 아니라 "지정한 지점"에 내리찍는
          // 지역 판정(Point-target Area)이다 - 직선이 아니라 사거리 안에서
          // 마우스가 가리킨 지점(범위를 넘으면 사거리로 clamp)을 중심으로
          // 반경 판정을 한다.
          // PC 위키: 지점 원형이 아니라 전방 직사각형(사거리 625, 폭 90~150) 판정.
          this._mordeQOnCast(this.root.position.clone(), dir.clone());
          return;
        }
        // 버그 수정(논타겟 스킬 Hit Detection): dir는 이미 마우스 방향으로
        // 정확히 계산돼 있었는데(위), 실제 피해 판정은 그 방향을 전혀 쓰지
        // 않고 currentTarget 잠금 여부만 봤다 - 조준이 빗나가도 맞고,
        // 맞았어도 타겟을 따로 클릭 안 했으면 안 맞는 버그였다. 이제 실제
        // 방향/사거리 기반 직선 판정(findFirstInLine)으로 적중 대상을 찾는다.
        // CHAMPION_DATA가 아직 없는 챔피언(사거리 정보 없음)은 LoL 표준
        // 스킬샷 사거리 정도(450)를 임시 기본값으로 쓴다 - findFirstInLine의
        // range 인자는 LoL 단위이므로 world-scale 상수(ATTACK_RANGE)를 여기
        // 섞어 쓰면 안 된다(버그 수정: 예전엔 ATTACK_RANGE*3을 그대로 넘겨서
        // 실제로는 world 단위 16.5가 LoL 사거리인 것처럼 처리되고 있었다).
        const cd = this._champData();
        const range = (cd && cd.Q && cd.Q.range) || 450;
        const hitUnit = findFirstInLine(this.root.position, dir, range, BASE_UNIT * 0.6);
        if (hitUnit) {
          applyDamage(hitUnit, { rawDamage: this.actionData[key].dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          debugSkillHit('Q (skillshot)', hitUnit);
        } else {
          debugSkillMiss('Q (skillshot)', 'no target in line');
        }
      },
    });
};


/* ---------------- 닐라 전용 전투 로직 ---------------- */




































// 버그 수정(핵심 - "충전이 쿨타임 되면 2개 다 차는 버그"): 이 회복
// 로직이 _nilahCastE()와 _nilahUpdate() 두 곳에 똑같이 복사되어 있었다.
// 로직 자체는 "지금까지 만료된 충전 타이머 개수만큼만" 채우도록 이미
// 맞게 짜여 있었지만(한 번에 max로 밀어버리지 않음), 같은 계산이 두
// 곳에 따로 있으면 한쪽만 고치는 실수가 나기 쉽고 검증도 어렵다.
// 이제 한 곳(_nilahRestoreECharges)에서만 계산하고 두 호출부 모두
// 이 함수를 그대로 쓴다 - 매 프레임(자동 회복)과 E 시전 시도 시점
// 모두 정확히 "만료된 타이머 1개당 충전 1개"만 회복한다.
















// 요청(모데카이저형 W 재시전 - 문서 37/38절): W가 이미 켜진 상태에서 W를
// 다시 누르면 "새 캐스트"가 아니라 "남은 보호막을 즉시 회복으로 전환
// 하며 종료"하는 별도 동작이다. championAbilityDatabase[챔피언].W에
// recastClips가 등록된 경우에만 이 분기를 타므로 다른 챔피언(recastClips
// 없음)은 기존처럼 매번 새 캐스트로 동작한다. 마나 소모/쿨다운은 재시전
// 쪽에는 적용하지 않는다(공개 데이터상 W 자체가 이미 소모된 상태의
// 후속 동작이라 별도 자원 소모가 아님).
CharacterController.prototype._castW = function(mouseWorldPoint, free = false) {
    const slotCast = CHAMPION_SLOT_CASTS.W[this.championId];
    if (slotCast) { slotCast(this, mouseWorldPoint, free); return; }

    // 가렌 W(용기): 독립 Timed Buff. E 채널링/평타/이동/기타 행동 중에도
    // 현재 ACTION_STATE와 currentClip을 절대 바꾸지 않고 즉시 효과만 적용한다.
    // W 자체 애니메이션은 없으므로 runAction()을 호출하지 않는다.
    if (this.championId === 'garen') {
      if (isSilenced(this)) return;
      if (!this._payCost('W', free)) return;
      this._garenWOnCast();
      vfx.spawn('w', this.root.position.clone());
      return;
    }

    const db = this._championAbilityDbEntry();
    const recastClips = db && db.W && db.W.recastClips;
    if (recastClips && this.isSubStateActive('W') && this.canStartNewAction()) {
      this.clearSubState('W');
      this.clearAttackOverride('W');
      // 자연 종료 타이머가 남아 있으면(아직 발동 전) 여기서 정리 - 재시전으로
      // 이미 종료 연출(Consume_*)을 재생하므로 나중에 자연 종료 연출까지
      // 중복으로 겹쳐 재생되면 안 된다.
      clearTimeout(this._wNaturalExitTimer);
      // 문서 17~18절 "남은 Shield 확인 → Shield 제거/소비 → Heal 계산 →
      // 대상(모데카이저 자신)에게 회복 적용"은 바로 아래 _mordeWOnRecast()
      // (mordekaiser.js)가 구현 완료했다(과거 "TODO - 애니메이션만 재생"
      // 문서화가 실제 구현 뒤 갱신되지 않고 남아 있었음) - 회복 이벤트는
      // vfx.spawn과 같은 프레임(클립 종료를 기다리지 않음)에서 즉시 발동된다.
      vfx.spawn('w', this.root.position.clone());
      if (this.championId === 'mordekaiser') this._mordeWOnRecast();
      const moving = !!this.targetPos;
      const clipName = moving ? (recastClips.move || recastClips.idle) : (recastClips.idle || recastClips.move);
      const clip = clipName ? this.findAnimation(clipName) : null;
      if (clip) {
        this._clearActionTimers();
        this.currentActionKey = 'wRecast'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
        this.crossFadeTo([clipName], { loop: THREE.LoopOnce, fade: 0.15, clampWhenFinished: true });
        // 버그 수정(핵심): 이 재시전 클립이 재생되는 동안(currentPhase='ACTIVE'
        // 이므로 moveTo()는 즉시 이동하지 않고 this.pendingMove에 새 목적지를
        // 저장만 해둔다) 플레이어가 이동 클릭을 하면, 예전에는 여기서
        // _returnToLocomotion()을 직접 불러서 그 pendingMove를 그대로
        // 버렸다 - 그래서 "이동하다가 W 재시전하면 새로 클릭한 방향이
        // 무시되고 원래 있던 자리/방향으로 캐릭터가 제멋대로 돌아가 버리는"
        // 문제가 있었다. _resumeAfterAction()으로 바꿔서 대기 중이던 이동
        // 명령이 있으면 그걸 최우선으로 커밋한다.
        const t = setTimeout(() => {
          this.currentActionKey = null; this.currentPhase = null;
          this._resumeAfterAction();
        }, Math.max(0, clip.duration - 0.05) * 1000);
        this._actionTimers.push(t);
      }
      return;
    }

    // 문서 4절 "경우 0"(사망/강제 행동 불가 시 애니메이션조차 재생하지 않아야
    // 한다)은 과거엔 TODO로 남아 있었지만 실제로는 이미 상위 경로에서 처리된다
    // - 플레이어 입력은 castAbility()가 먼저 isCrowdControlled()로 기절/속박을
    // 막고, getActionAuthority()가 DEAD/RESPAWN 상태에서 canCast:false를
    // 반환해 _dispatchCast 자체가 호출되지 않는다(과거 TODO 문서화가 이 공용
    // 가드 도입 뒤에도 갱신되지 않고 남아 있었음). 여기 남은 쿨다운/마나
    // 체크는 그 다음 단계(스킬 자체의 재사용 가능 여부)만 담당한다.
    if (isSilenced(this)) return;
    if (!this._payCost('W', free)) return;

    // 다리우스 W는 애니메이션 없이 '다음 1회 평타 강화'만 예약한다.
    // 진행 중인 기본 공격이 있다면 스킬 우선순위에 따라 즉시 중단하고,
    // 다음 평타의 일반 공격 모션은 그대로 재생하면서 적중 시 W 효과만 적용한다.
    if (this.championId === 'darius') {
      // 버그 수정(요청: "다리우스 Q E R 시전 중에 W 시전 가능"): 예전엔
      // 여기서 무조건 _clearActionTimers()/currentActionKey=null을 해서,
      // Q 체인(qChain)이나 E/R 캐스트가 진행 중이었어도 W를 누르는 순간
      // 그것들까지 함께 끊겨버렸다. 이제 "지금 진행 중인 게 기본 공격일
      // 때만" 취소한다(스킬 우선순위 원칙 - 스킬은 평타를 끊지만 다른
      // 스킬끼리는 서로 안 끊는다) - Q/E/R은 그대로 계속 진행되고, W는
      // 애니메이션/행동 상태를 전혀 점유하지 않으므로 그 위에 얹히듯
      // 즉시 적용된다.
      const isBasicAttack = this.currentActionKey && (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit');
      if (isBasicAttack) {
        this._clearActionTimers();
        this.currentActionKey = null;
        this.currentPhase = null;
        this.phaseCancelable = false;
        this.setState(this.targetPos ? STATE.MOVE : STATE.IDLE);
      } else if (!this.currentActionKey) {
        // 버그 수정(회귀): 위에서 "기본 공격일 때만" 상태를 정리하도록
        // 바꾸면서, 아무 것도 진행 중이 아닌 평범한 상태(대기 중 W만 누른
        // 경우)에서도 setState()가 아예 호출되지 않게 돼버렸다 - 그
        // 결과로 this.state가 최신 상태로 갱신되지 않아 이어지는 좌클릭
        // 공격 입력이 selectTarget()의 "IDLE/MOVE일 때만 교전"조건에
        // 안 걸려 평타가 안 나가는 것처럼 보였다("W 이후 기본공격 안
        // 나감"의 원인). currentActionKey가 진짜 다른 스킬(qChain/e1/r
        // 등)을 갖고 있을 때만 상태를 그대로 두고, 그 외(아무 것도 진행
        // 중이 아닐 때)에는 항상 안전하게 IDLE/MOVE로 맞춰준다.
        this.setState(this.targetPos ? STATE.MOVE : STATE.IDLE);
      }
      // 버그 수정(핵심 - "다리우스 W 모션이 누락됨"): championAbilityDatabase에
      // 이미 W.attackOverrideAnimationNames: ['Spell2']가 등록돼 있었는데,
      // 지금까지 이 시전 코드는 그걸 전혀 쓰지 않고 _dariusWArmed라는 별도
      // 플래그만 세팅했다 - 그 플래그는 _beginAttackSwing에서 피해에만
      // overrideId='W'를 태깅할 뿐, 실제 재생되는 애니메이션은 그냥 평소의
      // attack1/2/3이었다(DB에 등록된 Spell2 클립이 한 번도 선택되지
      // 않음). 세트 Q/모데카이저 W가 쓰는 것과 동일한 기존 시스템
      // (_activateAttackOverrideFromDb)을 그대로 재사용하면 다음 평타가
      // 정확히 Spell2 애니메이션으로 나간다 - 새 애니메이션 시스템을 만들지
      // 않는다.
      // 원작: "4초 안의 다음 기본 공격" 강화(예전 6.0초는 임시 상한값이었다).
      this._activateAttackOverrideFromDb('W', this._champData().W.empowerWindow || 4.0);
      vfx.spawn('w', this.root.position.clone());
      // 버그 수정(실제 다리우스.glb로 확인): 평타를 끊은 뒤 아무도 다시 교전을
      // 시작하지 않아, 대상이 선택된 채 IDLE로 멈춰 강화 평타가 나가지 않았다.
      // W는 평타 초기화 스킬이라 곧바로 다시 대상을 공격한다.
      if ((isBasicAttack || !this.currentActionKey) && this.currentTarget && this.currentTarget.hp > 0) this._resumeAfterAction();
      return;
    }

    // 마스터 이 W(명상) 특수 처리:
    // - 평타 중 W: 평타 타이머를 즉시 끊고 W를 시작한다.
    // - W 중 평타: W를 즉시 종료하고 같은 입력에서 새 평타를 시작한다(명캔).
    // - W 동안 E/R 지속시간은 정지한다.
    // - W 애니메이션은 gameplay 상태와 분리된 전용 clip을 직접 재생한다.
    if (this.championId === 'masteryi') {
      if (isSilenced(this) || isCrowdControlled(this)) return;
      // 버그 수정: 여기서 다시 _payCost('W', free)를 호출하고 있었다 - 이
      // 함수에 도달하기 전에 이미 위(line 6417)에서 W 비용을 한 번
      // 지불했으므로, 여기서 또 지불하면 마나가 이중으로 깎인다. 마나가
      // 딱 한 번 캐스트할 만큼만 있었다면: 첫 번째 지불은 성공(마나가 줄어드는
      // 게 보임) → 여기 두 번째 지불이 실패 → currentActionKey를 세팅하기도
      // 전에 함수가 그냥 return되어 명상이 시작조차 못 한 채 끝나버린다.
      // 플레이어 입장에선 정확히 "명상이 시작되자마자 중간에 끊기는" 것처럼
      // 보였을 것이다.

      // 공격 중 W 입력은 평타를 즉시 취소한다.
      if (this.currentActionKey &&
          (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit')) {
        this._clearActionTimers();
        this.currentActionKey = null;
        this.currentPhase = null;
        this.phaseCancelable = false;
      }

      // W를 새로 시작하기 전에 기존 행동/시퀀스를 명확히 해제한다.
      this._clearActionTimers();
      this.currentActionKey = 'masteryiW';
      this.currentPhase = 'ACTIVE';
      this.phaseCancelable = true;
      this.setState(STATE.W_CAST);
      // 버그 수정: 다른 모든 스킬 캐스트는 시전 방향을 즉시 정렬하는데
      // (faceDirectionInstant) 명상만 이 처리가 빠져 있었다 - 이동 중
      // 회전하던 도중이나 타겟 반대 방향을 보고 있던 상태에서 그대로
      // 명상 포즈로 들어가면 캐릭터가 엉뚱한 방향을 보고 있는 채로
      // 정지해서 "모션이 이상하다"는 인상을 준다. 현재 타겟이 있으면
      // 그쪽을, 없으면 현재 이동 방향을 그대로 바라보게 정렬한다.
      const faceTarget = this.currentTarget && this.currentTarget.hp > 0
        ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position).setY(0)
        : (this.moveDir.lengthSq() > 1e-6 ? this.moveDir.clone() : null);
      if (faceTarget && faceTarget.lengthSq() > 1e-6) this.faceDirectionInstant(faceTarget);
      this._masteryiWOnCast();
      vfx.spawn('w', this.root.position.clone());

      // 실제 GLB에서만 W 모션을 찾는다. 찾지 못하면 gameplay는 그대로 유지하되
      // 콘솔에 정확한 원인을 남긴다.
      const wClip = this._masteryiResolveWAnimationClip();
      if (wClip) {
        const action = this.crossFadeToClip(wClip, {
          loop: THREE.LoopRepeat,
          fade: 0.08,
          clampWhenFinished: false,
          timeScale: 1.0,
          time: 0
        });
        if (action) {
          action.enabled = true;
          action.paused = false;
          action.setEffectiveWeight(1);
          console.log(`[Master Yi W] animation started: ${wClip.name} (${wClip.duration.toFixed(3)}s)`);
          // 버그 수정(모션이 반복되는 문제): LoopRepeat는 클립 "전체"를
          // 매번 처음부터 다시 재생한다. 만약 이 클립이 순수 정지 루프
          // 포즈가 아니라 "앉는 동작(진입) + 정지 유지" 구조라면, 매
          // 루프마다 그 진입 동작이 다시 재생되어 명상 도중 캐릭터가
          // 주기적으로 다시 앉는 것처럼 부자연스럽게 반복되어 보인다.
          // 클립 길이의 앞 30%(최대 1초)를 진입 구간으로 간주하고,
          // Three.js 믹서의 'loop' 이벤트(정확히 한 바퀴 돌 때 발생)에서
          // 그 구간만큼 건너뛰어, 두 번째 반복부터는 항상 "핵심 유지
          // 포즈" 구간만 반복되게 한다. 클립이 원래 진입 포즈가 없는
          // 순수 루프라면 introSkip이 매우 작아 사실상 아무 영향이 없다.
          if (this._masteryiWLoopHandler) this.mixer.removeEventListener('loop', this._masteryiWLoopHandler);
          const introSkip = Math.min(wClip.duration * 0.3, 1.0);
          this._masteryiWLoopHandler = (e) => {
            if (e.action !== action) return;
            if (introSkip > 0.01 && introSkip < wClip.duration) action.time = introSkip;
          };
          this.mixer.addEventListener('loop', this._masteryiWLoopHandler);
        }
      }

      const duration = Math.max(0.05, this._champData()?.W?.channelDuration || 4);
      const endTimer = setTimeout(() => {
        if (this.currentActionKey !== 'masteryiW') return;
        this._masteryiEndMeditate('natural');
      }, duration * 1000);
      this._actionTimers.push(endTimer);
      return;
    }

    const data = this.actionData.w;
    // 업데이트(가렌 W 문서 전체 반영): 가렌 W(용기)는 문서 기준 "currentClip을
    // 바꾸지 않는 독립 Timed Buff 레이어"다(문서 1~17절). db.W.animationNames가
    // 비어 있는 챔피언(가렌 등)은 data.w.clips도 비게 되고, runAction() 내부의
    // playFirstAvailable(data.clips, ...)이 빈 배열을 받으면 clip을 못 찾아
    // 아무것도 재생하지 않는다 - 즉 currentClip/currentAction은 실제로 전혀
    // 바뀌지 않는다(문서 2/14절이 요구하는 정확한 동작). 다만 runAction()이
    // this.setState(STATE.W_CAST)는 항상 호출하므로 this.state는 짧게(가렌은
    // SKILL_TIMING_DATABASE상 startup=0이라 사실상 한 프레임 이내) 바뀐다 -
    // 문서는 "actionState도 변경 없음"을 이상적으로 요구하지만, 이 데모의
    // Cast Time=0 스킬은 그 구간이 매우 짧아(≈0프레임) 육안으로 드러나는
    // 문제가 없다고 판단해 이번 범위에서는 별도로 손대지 않았다.
    // 문서 4/12절 "[1]보호 효과(방어/피해감소) 적용 [2]지속시간 타이머 시작
    // [3]W VFX 활성화가 즉시(0.000초) 일어나야 한다"는 과거엔 TODO였지만,
    // [1]/[3]은 바로 아래(가렌 _garenWOnCast/마스터이 _masteryiWOnCast/세트
    // _settWApplyShield 모두 runAction() 호출 전 여기서 즉시 실행)로 이미
    // 해결됐다(과거 TODO 문서화가 실제 구현 뒤에도 갱신되지 않고 남아
    // 있었음). [2](서브 상태/지속시간 타이머 시작)만 여전히 onFire 쪽에
    // 남아 있다 - 가렌/마스터이는 Cast Time이 사실상 0이라 체감상 차이가
    // 없고, 세트는 W에 서브 상태 효과(공격 오버라이드 등)를 쓰지 않는
    // 챔피언이라 현재 구현된 챔피언 범위에서는 실질적 영향이 없다.
    //
    // 업데이트(세트 W 문서 4/5/8절 "Shield는 0.000초 즉시, Damage/Impact는
    // 0.750초의 별도 이벤트"): W가 실제 캐스트 애니메이션을 가진 챔피언
    // (animationNames가 채워진 세트 등)은 여기서 runAction 호출 직전에
    // "방어 이벤트"를 즉시 발동시키고, 아래 onFire(SKILL_TIMING_DATABASE가
    // 있으면 정확히 그 eventTime에 발동 - 세트는 0.75초)는 "공격 판정 이벤트"
    // 전용으로 분리했다. 가렌처럼 animationNames가 비어있는 챔피언(Cast
    // Time도 사실상 0)은 두 이벤트를 분리할 실익이 없어 생략한다(기존과
    // 동일하게 onFire 하나로 처리).
    if (db && db.W && db.W.animationNames && db.W.animationNames.length) {
      vfx.spawn('w', this.root.position.clone());
    }
    // 기획안 반영(가렌 W "용기"): Cast Time 0초 스킬이므로 보호막/피해감소는
    // runAction() 애니메이션 타이밍과 무관하게 여기서 즉시 적용한다.
    if (this.championId === 'garen') this._garenWOnCast();
    if (this.championId === 'masteryi') this._masteryiWOnCast();
    // 버그 수정(QA - "세트 W 보호막 적용 타이밍"): 위 문서 4/5/8절 주석이
    // 요구하던 "Shield는 0.000초 즉시" 부분이 실제로는 구현되지 않고 VFX만
    // 즉시 스폰되고 있었다(투지 소모+보호막 적용이 전부 아래 onFire의
    // _settWOnCast() 안에 있어 0.75초 늦게 떴다) - 보호막은 여기서 즉시
    // 걸고, 공격 판정(_settWOnCast)은 그대로 onFire(0.75초)에서 처리한다.
    if (this.championId === 'sett') this._settWApplyShield();
    // 세트 W(강펀치) 문서 10/16절: "방향 고정" - 캐스트 시작 시점의 방향을
    // 스냅샷해서, 0.75초 뒤 실제 판정 시점에도 그 시점 방향을 그대로 쓴다
    // (그 사이 캐릭터가 다른 쪽을 보게 되어도 사다리꼴은 안 돈다).
    // 버그 수정(요청: "W는 마우스 커서 있는 곳으로 나간다"): 예전엔 방향을
    // this.root.quaternion(세트가 "현재 우연히 보고 있던" 방향)에서만
    // 가져왔다 - 실제로는 마우스 커서 방향을 써야 한다. mouseWorldPoint가
    // 있으면 그 지점을 향하도록 계산하고, 세트의 실제 캐릭터 회전도 그
    // 방향으로 즉시 맞춘다(방향 고정 원칙은 그대로 유지 - 캐스트 시점에
    // 한 번만 정하고 그 이후엔 안 바뀜). 마우스 지점이 없는 경우(예:
    // 테스트 버튼 등)에는 기존처럼 현재 바라보는 방향으로 안전하게 폴백한다.
    const settWOrigin = this.root.position.clone();
    let settWForward;
    if (mouseWorldPoint) {
      settWForward = new THREE.Vector3().subVectors(mouseWorldPoint, settWOrigin).setY(0);
      if (settWForward.lengthSq() < 1e-6) settWForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
      else settWForward.normalize();
      this.faceDirectionInstant(settWForward);
    } else {
      settWForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    }
    this.runAction('w', STATE.W_CAST, {
      onFire: () => {
        // 세트 W 문서 8/9절: 실제 전방 사다리꼴 범위 탐색 + 중앙(True Damage)/
        // 양옆(Physical Damage) 판정 - _settWOnCast가 getAllEnemyUnits() 전체를
        // 대상으로 판정한다(더 이상 currentTarget 단일 대상에 의존하지 않음).
        vfx.spawn('w', this.root.position.clone());
        // 보호막은 위(runAction 호출 전) _settWApplyShield()가 이미 즉시
        // 처리했다 - 여기서는 그 함수가 저장해 둔 wPendingSpent로 타격만
        // SKILL_TIMING_DATABASE.sett.W(0.75초) 시점에 처리한다.
        if (this.championId === 'sett') this._settWOnCast(settWOrigin, settWForward);
        this._activateWSubState(data.buffDuration);
      },
    });
};

// 요청(가렌/세트/모데카이저 한계 해결):
//  1) 가렌형(directionalChannel 등록됨) - 실시간 방향 재계산 채널링.
//     E 재입력 시 토글 off, 이동(클릭) 입력이 들어올 때마다 방향만
//     바뀐 클립으로 크로스페이드(이동 중에는 실제 좌표도 함께 갱신됨 -
//     moveTo()의 eChannel 분기 참고, 예전에는 방향만 바뀌고 실제 위치는
//     안 움직였으나 이번에 실제 이동도 가능하도록 확장했다).
//  2) 세트형(resultDirectionalClips 등록됨) - 캐스트 시점에 타겟이
//     정면/후면 중 어디 있는지 한 번만 판정해서 클립을 고른다("적중
//     대상 방향 기반" - 매 프레임 재계산이 아니라 1회성 분기).
//  3) 그 외(기본 콤보형 e1/e2) - 모데카이저처럼 W 서브 상태가 켜져
//     있으면 subStateAnimationNames로 등록된 클립으로 바꿔치기한다.
//
// 업데이트(가렌 E 문서 전체 반영): 문서가 요구하는 핵심 애니메이션 구조
// (①E 입력 = 즉시 CHANNEL 상태 진입, ②매 프레임 이동 방향 재계산 후 방향이
// *실제로* 바뀔 때만 crossFade, ③재입력=토글 OFF, ④지속시간 만료로 자동
// 종료, ⑤애니메이션 클립 루프 종료가 아니라 duration/토글이 E의 실제
// 생명주기를 결정, ⑥문서 5/12절 "E 중에도 실제로 이동 가능해야 한다")는
// 아래 channelCfg 분기 + moveTo()의 eChannel 분기 + _updateEChannelDirection
// + updateMovement()의 eChannel 예외(자동 얼굴 정렬 생략) + updateEChannel에
// 전부 구현돼 있다. this.state는 실제 이동 여부(targetPos)를 그대로
// 반영한다 - 정지 중이면 STATE.E_CAST, 이동 중이면 STATE.MOVE로 둬서
// updateMovement(dt)가 별도 예외 없이 정상적으로 좌표를 갱신하게 한다.
//
// 문서 13/14절 "반복 피해는 주변 범위를 매 틱 재검색해야 한다"는
// 요구사항은 아래 updateEChannel(dt)이 가렌 전용으로 매 틱
// findEnemiesInRadius()를 다시 호출해 구현 완료했다(과거 "TODO - 미구현"
// 문서화가 실제 구현 뒤에도 갱신되지 않고 남아 있었음 - 코드 자체는
// 이미 정확하게 동작한다).
CharacterController.prototype._castE = function(mouseWorldPoint, free = false) {
    const slotCast = CHAMPION_SLOT_CASTS.E[this.championId];
    if (slotCast) { slotCast(this, mouseWorldPoint, free); return; }
    // PC 위키(Noxian Guillotine): R 시전 시간이 끝난 뒤 0.25초 동안 Q/E 사용 불가.
    if (this.championId === 'darius' && performance.now() < (this._dariusRQeLockUntil || 0)) return;
    const db = this._championAbilityDbEntry();
    const channelCfg = db && db.E && db.E.directionalChannel;

    if (channelCfg) {
      // PC 위키: 심판은 시전 1초 뒤부터 재입력으로 일찍 끝낼 수 있다(예전엔 즉시 끝낼 수 있었다).
      if (this.currentActionKey === 'eChannel') { if ((this._eChannelTimer || 0) >= (channelCfg.recastMinSec ?? 1)) this._endEChannel(); return; }
      if (!this.canStartNewAction()) return;
      if (isSilenced(this)) return;
      if (!this._payCost('E', free)) return;
      this._clearActionTimers();
      // 요청(가렌 E 중 실제 이동 가능): 이미 이동 중이었다면(targetPos 존재)
      // state를 MOVE로 유지해서 updateMovement(dt)가 끊김 없이 계속 좌표를
      // 갱신하게 한다. 정지 중이었다면 기존처럼 E_CAST.
      this.setState(this.targetPos ? STATE.MOVE : STATE.E_CAST);
      this.currentActionKey = 'eChannel';
      this.currentPhase = 'ACTIVE';
      this.phaseCancelable = false;
      this._eChannelCfg = channelCfg;
      this._eChannelDir = 'front';
      this._eChannelTimer = 0;
      this._eChannelDamageAccum = 0;
      // 기획안 반영(가렌 E "심판"): 기본 지속시간은 championAbilityDatabase의
      // 애니메이션 추정치(4.0초)가 아니라 실제 데이터인 spinDuration(3초)을
      // 쓴다. 타격 수는 기본 7회 + 보너스 공격속도 25%당 1회(문서 그대로),
      // 회전 시간은 타격 수가 늘어도 항상 spinDuration으로 고정되므로
      // 타격 간격만 짧아진다.
      const eData = this._champData() && this._champData().E;
      this._eChannelDuration = eData ? eData.spinDuration : (channelCfg.duration ?? 4.0);
      // "추가 공격 속도"에는 레벨 성장분도 포함된다(원작 규칙 - _totalBonusAttackSpeed).
      const bonusAsForSpins = this._totalBonusAttackSpeed();
      this._eHitsTotal = eData ? (eData.baseHits + Math.floor(bonusAsForSpins / 0.25 + 1e-9)) : 0;
      this._eHitsDone = 0;
      this._eHitsPerTarget = new Map(); // 방어력 감소는 "대상별" 적중 횟수로 판정
      this._eHitInterval = this._eHitsTotal > 0 ? this._eChannelDuration / this._eHitsTotal : 0.5;
      // 원작: 심판 회전 중에는 유닛을 통과해 이동(유령화).
      if (this.championId === 'garen') applyStatus(this, { id: 'garenE_ghost', type: 'GHOST', duration: this._eChannelDuration, value: 1 });
      const allClips = Object.values(channelCfg.clips);
      this.playFirstAvailable([channelCfg.clips.front, ...allClips], { loop: THREE.LoopRepeat, fade: 0.1 });
      vfx.spawn('e', this.root.position.clone());
      if (mouseWorldPoint) this._updateEChannelDirection(mouseWorldPoint);
      return;
    }

    if (isSilenced(this)) return;
    if (!this._payCost('E', free)) return;

    // 세트 E는 실제 GLB에 존재하는 Spell3 본체 모션을 사용해야 한다.
    // 예전 resultDirectionalClips(Spell3_Front/Spell3_Back) 경로는 해당 클립이
    // 없는 GLB에서도 resultDir가 존재하는 것으로 판단해 존재하지 않는 클립만
    // 우선 후보로 넘겼고, 이 경우 E 모션/판정이 정상적으로 시작되지 않는 경우가
    // 있었다. 세트는 캐스트 순간 대상 방향만 바라보고, 실제 모션은 actionData.e1의
    // 검증된 Spell3 후보를 그대로 사용한다.
    if (this.championId === 'sett') {
      const data = this.actionData.e1;
      if (!data) { console.warn('[SETT E] actionData.e1 missing'); return; }
      let facing = this.currentTarget
        ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position).setY(0)
        : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
      if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
      facing.normalize();
      this.runAction('e1', STATE.E_CAST, {
        faceDir: facing,
        dataOverride: { ...data, clips: data.clips && data.clips.length ? data.clips : ['Spell3'] },
        onFire: () => {
          vfx.spawn('e', this.root.position.clone().addScaledVector(facing, 1.5));
          this._settEOnCast(facing);
        },
      });
      return;
    }

    const resultDir = db && db.E && db.E.resultDirectionalClips;
    if (resultDir) {
      // 업데이트(세트 E 문서 전체 반영): SKILL_TIMING_DATABASE.sett.E
      // (eventTime 0.25초, recovery 0.25초, lockMove true)가 이미 문서의
      // 핵심 시간 구조("Cast 0.25초 → ★Impact → 추가 0.25초 Post Lock →
      // 0.50초에 행동 복귀")를 정확히 구현하고 있다 - onFire가 정확히
      // 0.25초에 발동되고, 그 이후 recovery 0.25초가 지나야
      // _onActionRecoveryComplete가 호출된다. 새로 고칠 부분 없음.
      let dirKey = 'front';
      if (this.currentTarget) {
        const toTarget = new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position); toTarget.y = 0;
        if (toTarget.lengthSq() > 1e-6) {
          const local = toTarget.normalize().applyQuaternion(this.root.quaternion.clone().invert());
          dirKey = local.z < -0.2 ? 'back' : 'front'; // 캐스트 시점 1회 판정("적중 대상 방향")
        }
      }
      const clips = [resultDir[dirKey] || resultDir.front, ...Object.values(resultDir)];
      const facing = this.currentTarget
        ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position).setY(0).normalize()
        : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion); // 대상 미선택 시 실제 몸이 바라보는 방향 사용
      this.runAction('e1', STATE.E_CAST, {
        faceDir: facing,
        dataOverride: { ...this.actionData.e1, clips },
        onFire: () => {
          vfx.spawn('e', this.root.position.clone().addScaledVector(facing || new THREE.Vector3(0,0,1), 1.5));
          if (this.championId === 'sett') {
            this._settEOnCast(facing); // 왼쪽/오른쪽 각각 판정 + 실제 끌어오기 + 양쪽 모두일 때만 기절(아래 정의)
          } else if (this.currentTarget && this.currentTarget.hp > 0) {
            applyDamage(this.currentTarget, { rawDamage: this.actionData.e1.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          }
        },
      });
      return;
    }

    const now = performance.now();
    const isFollowup = this._lastECast && (now - this._lastECast) < E_COMBO_WINDOW * 1000;
    this._lastECast = now;
    const key = isFollowup ? 'e2' : 'e1';
    const data = this.actionData[key];
    // 업데이트(다리우스 E 문서 전체 반영): 문서 1~11절 - 다리우스 E(포획)는
    // Q(2단계)나 W(다음 평타 위임)와 달리 "Spell3 하나로 끝나는 가장 단순한
    // 구조"다(방향 분기·진입/복귀 전용 클립 전부 없음). 이 콤보형 분기(e1/e2)
    // 자체는 다리우스 championAbilityDatabase.E.animationNames가 'Spell3'
    // 하나뿐이라 e2도 결국 같은 클립으로 폴백돼(buildActionData 참고) 실질적
    // 콤보 변형이 없는 문서 구조와 시각적으로 동일하게 동작한다 - 별도 수정
    // 없이 이미 일치한다.
    // 게임로직 TODO(문서 4~5절): 정확한 HIT/EFFECT 프레임 타임스탬프는
    // "자료만으로 확정할 수 없다"고 명시돼 있어, 아래 onFire의 발동 타이밍은
    // deriveActionTiming(fireRatio 기반 근사치)을 그대로 쓴다 - 실제 프레임
    // 분석이 되면 이 타이밍을 조정해야 한다.
    // 요청(모데카이저 문서 41절): W 서브 상태가 없을 때도 정지/이동에 따라
    // 캐스트 클립 자체가 갈리는 챔피언(Spell3_Cast.anm ↔ Spell3_Cast_Walk.anm)
    // 을 위해 moveAnimationNames를 우선 확인하고, 그 다음에만 W 등 서브
    // 상태 오버라이드를 확인한다(서브 상태 쪽이 이미 정지/이동을 자체
    // 반영하므로 우선순위가 더 높다).
    const subOverride = this._subStateAnimationOverride('E');
    let clipsOverride = subOverride;
    if (!clipsOverride) {
      const moveNames = this._championAbilityDbEntry()?.E?.moveAnimationNames;
      if (moveNames && moveNames.length && this.targetPos) clipsOverride = moveNames;
    }
    const facing = mouseWorldPoint
      ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0).normalize()
      : this.currentTarget
        ? new THREE.Vector3().subVectors(this.currentTarget.mesh.position, this.root.position).setY(0).normalize()
        : null;
    // PC 위키(Death's Grasp): 시전 시작 시점의 위치에서 발동한다 - 시작 위치를 미리 잡아 둔다.
    const mordeEOrigin = this.championId === 'mordekaiser' ? this.root.position.clone() : null;
    this.runAction(key, STATE.E_CAST, {
      faceDir: facing,
      dataOverride: clipsOverride ? { ...data, clips: clipsOverride } : undefined,
      onFire: () => {
        vfx.spawn('e', this.root.position.clone().addScaledVector(facing || new THREE.Vector3(0,0,1), 1.5));
        // 버그 수정(논타겟 스킬 Hit Detection): 다리우스 E(포획)는 직선
        // 스킬샷이라 "지금 currentTarget이 잠겨있는가"가 아니라 실제
        // 조준 방향(마우스 방향, 없으면 현재 정면)에 실제로 걸리는 첫 대상을
        // findFirstInLine()으로 찾아서 그 결과만 넘긴다.
        if (this.championId === 'darius') {
          // 버그 수정(원작 대조): 포획은 직선 단일 스킬샷이 아니라 "전방 부채꼴 안의
          // 모든 적"을 끌어오는 스킬이다. 예전엔 findFirstInLine()으로 첫 대상 하나만 잡았다.
          const cd = this._champData();
          const dir = facing || (this.moveDir.lengthSq() > 0 ? this.moveDir.clone().normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion));
          const hits = findEnemiesInRadius(this.root.position, cd.E.range, { forward: dir, maxAngleDeg: cd.E.coneAngleDeg / 2 });
          if (hits.length) hits.forEach((h) => { this._dariusEOnCast(h.unit); debugSkillHit('Darius E', h.unit); });
          else debugSkillMiss('Darius E', 'no target in cone');
        } else if (this.championId === 'mordekaiser') {
          // 모데카이저 E(죽음의 손아귀)는 "투사체가 아닌 장판형" 스킬이라
          // 다리우스 E와 달리 직선이 아니라 지정 지점 중심의 범위 판정이다.
          // PC 위키: 시전 사거리 700, 지정 지점에서 모데카이저 쪽으로 길이 800·폭 200 직사각형에 맞은
          // 모든 적을 250 끌어당긴다. 버그 수정: 예전엔 지점 반경 150 원 안의 "첫 대상 하나"만 끌어왔다.
          const cd = this._champData();
          const dir = facing || new THREE.Vector3(0, 0, 1);
          const worldRange = lolRangeToWorld(cd.E.range);
          const rawDist = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0).length() : worldRange;
          const dist = Math.min(rawDist, worldRange);
          // PC 위키: 시전 0.25초가 끝나면 행동 가능, 판정(피해·끌어오기)은 그 0.5초 뒤(모데카이저가 죽어도 발동).
          // 예전엔 판정 시점(0.5초)까지 행동을 잠갔고, 판정 위치도 그 시점의 현재 위치였다.
          // 0.5초는 위키 서술 관례대로 시전 종료 기준으로 해석(시작 기준이면 총 0.5초 - 미확인).
          const origin = mordeEOrigin || this.root.position.clone();
          setTimeout(() => {
            const hits = this._mordeEAreaHits(origin, dir, dist);
            if (hits.length) hits.forEach((u) => this._mordeEOnCast(u));
            else debugSkillMiss('Mordekaiser E', 'no target in impact area');
          }, (cd.E.effectDelaySec ?? 0.5) * 1000);
        } else if (this.currentTarget && this.currentTarget.hp > 0) {
          applyDamage(this.currentTarget, { rawDamage: data.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
        }
      },
    });
};

// ---- 가렌형 방향 채널링 E 전용 헬퍼 ----
CharacterController.prototype._updateEChannelDirection = function(point) {
    const cfg = this._eChannelCfg;
    if (!cfg || this.currentActionKey !== 'eChannel') return;
    const dir = new THREE.Vector3().subVectors(point, this.root.position); dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const localDir = dir.applyQuaternion(this.root.quaternion.clone().invert());
    const angleDeg = Math.atan2(localDir.x, localDir.z) * 180 / Math.PI; // 0=정면, +90=오른쪽, -90=왼쪽
    let key;
    if (angleDeg >= -45 && angleDeg <= 45) key = 'front';
    else if (angleDeg > 45 && angleDeg <= 135) key = 'right';
    else if (angleDeg < -45 && angleDeg >= -135) key = 'left';
    else if (angleDeg > 135) key = 'back';
    else key = 'backAlt';
    if (!cfg.clips[key]) return;
    this._eChannelDir = key;
    // 업데이트(가렌 E 문서 - "이동 중 실제 좌표 이동" 추가로 목적지 도착 시
    // updateMovement()가 정지 처리하며 클립을 front로 자동 전환할 수 있게
    // 됐다. 그 경우 this._eChannelDir은 갱신되지 않은 채로 남을 수 있어서,
    // "방향이 실제로 바뀌었는가"는 이 변수가 아니라 지금 실제로 재생 중인
    // 클립 이름(this.currentClipKey)을 기준으로 판단한다 - 이래야 도착 후
    // 다시 같은 방향으로 이동해도 정확히 크로스페이드된다.
    if (this.currentClipKey === cfg.clips[key]) return;
    this.playFirstAvailable([cfg.clips[key], ...Object.values(cfg.clips)], { loop: THREE.LoopRepeat, fade: 0.15 });
};
CharacterController.prototype._endEChannel = function() {
    if (this.currentActionKey !== 'eChannel') return;
    this.currentActionKey = null; this.currentPhase = null;
    this._eChannelCfg = null; this._eChannelDir = null; this._eChannelTimer = 0; this._eChannelDamageAccum = 0;
    if (typeof clearStatus === 'function') clearStatus(this, 'garenE_ghost');
    this._resumeAfterAction();
};
CharacterController.prototype.updateEChannel = function(dt) {
    if (this.currentActionKey !== 'eChannel') return;
    this._eChannelTimer += dt;
    this._eChannelDamageAccum += dt;
    const interval = this._eHitInterval || 0.5;
    if (this._eChannelDamageAccum >= interval) {
      this._eChannelDamageAccum -= interval;
      this._eHitsDone = (this._eHitsDone || 0) + 1;
      const eData = this._champData() && this._champData().E;
      if (this.championId === 'garen' && eData) {
        // 버그 수정(논타겟 스킬 Hit Detection, 원래 있던 TODO): 매 틱마다
        // this.currentTarget 하나만 보지 않고, 실제로 지금 이 순간
        // this.root.position을 중심으로 한 반경(E.range) 안에 있는 모든
        // 적을 다시 찾아서(findEnemiesInRadius) 각각에게 DamageSystem을
        // 부른다 - "가장 가까운 적"만 25% 추가 피해를 받는다.
        const hits = findEnemiesInRadius(this.root.position, eData.range);
        if (hits.length) {
          let nearest = hits[0];
          for (const h of hits) if (h.distance < nearest.distance) nearest = h;
          const lvl = Math.max(1, this.skillLevels.E || 1);
          for (const h of hits) {
            let dmg = skillVal(eData.perHitDamageByLevel, lvl) + skillVal(eData.adRatioByLevel, lvl) * this.stats.attackDamage;
            if (h.unit === nearest.unit) dmg *= 1 + eData.nearestBonusPercent / 100;
            const willCrit = Math.random() < this.stats.critChance;
            // 치명타(PC 위키): 회전당 피해 130%, 무한의 대검 등 추가 치명타 피해는 30% 효율로만
            // 반영. 예전엔 무한의 대검 보너스가 100% 그대로 더해졌다.
            if (willCrit) dmg *= eData.critMultiplier + 0.3 * (this.itemBonusCritDamagePercent || 0);
            applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true });
            // 버그 수정(원작 대조): 예전엔 전체 회전 횟수(_eHitsDone)가 6을 넘으면
            // 그 뒤로 범위에 "처음 들어온" 적에게까지 즉시 방어력 감소가 걸렸고,
            // 미니언에도 걸렸다. 원작은 "적 챔피언이 6번 맞으면" 25% 감소(6초),
            // 7번째 적중과 그 뒤 6타마다 지속시간 갱신이다.
            if (!this._eHitsPerTarget) this._eHitsPerTarget = new Map();
            const n = (this._eHitsPerTarget.get(h.unit) || 0) + 1;
            this._eHitsPerTarget.set(h.unit, n);
            const need = eData.armorShredHitsNeeded;
            const shredNow = n === need || (n > need && (n - need - 1) % need === 0);
            if (h.unit.isChampion && shredNow) {
              applyStatus(h.unit, { id: 'garenE_shred', type: 'ARMOR_SHRED', duration: eData.armorShredDuration, value: eData.armorShredPercent / 100 });
            }
          }
          debugSkillHit('Garen E tick', nearest.unit, { hitCount: hits.length, tick: this._eHitsDone });
        } else {
          debugSkillMiss('Garen E tick', 'no target in range');
        }
      } else if (this.currentTarget && this.currentTarget.hp > 0) {
        // 기획안 데이터가 없는 챔피언은 기존 임시 수치(애니메이션 타이밍 확인용)를 그대로 유지한다.
        applyDamage(this.currentTarget, { rawDamage: 6, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
      }
    }
    if (this._eChannelTimer >= this._eChannelDuration) this._endEChannel();
};










CharacterController.prototype._castR = function(free = false) {
    const slotCast = CHAMPION_SLOT_CASTS.R[this.championId];
    if (slotCast) { slotCast(this, null, free); return; }
    // 버그 수정(명세 27절 "이미 죽음의 세계에 들어가 있는 동안 R 재입력 시
    // 새로운 R 생성 금지"): 모데카이저 전용 재시전 방지 가드. 이 시점에서
    // 막아야 아래의 쿨다운/비용 지불, 애니메이션 재생 자체가 아예 시작되지
    // 않는다(cooldown/mana를 또 소모하는 것도 막는다) - free(모션 테스트)일
    // 때는 게임플레이에 영향이 없으므로 예외로 통과시킨다.
    if (this.championId === 'mordekaiser' && !free && this._morde.isInDeathRealm) {
      debugSkillMiss('R', '이미 죽음의 세계 상태 (재시전 불가)');
      return;
    }
    if (isSilenced(this)) return;
    // 요청 16: "사거리 밖이면 타겟 스킬은 시전 불가"가 지금까지 R에는 전혀
    // 없었다(대상만 있으면 거리 무관하게 발동됨) - CHAMPION_DATA에 R.range가
    // 있는 챔피언(가렌/다리우스/세트/모데카이저 - 전부 타겟팅형 궁극기)은
    // 여기서 공통으로 Effective Distance 기준 사거리를 확인한다.
    {
      const cd = this._champData();
      if (!free && cd && cd.R && cd.R.range != null) {
        if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss('R', 'no currentTarget selected'); return; }
        const rRange = Array.isArray(cd.R.range) ? skillVal(cd.R.range, this.skillLevels.R || 1) : cd.R.range;
        if (!isInRange(this, this.currentTarget, rRange)) {
          debugSkillMiss('R', `out of range (R range ${cd.R.range})`);
          return;
        }
      }
    }
    // 다리우스 R 처치 후 20초 무료 재시전 창(쿨다운 무시, 마나는 스킬 레벨대로 그대로 소모).
    if (this.championId === 'darius' && this._rRecastReadyUntil && performance.now() < this._rRecastReadyUntil) {
      const info = this._skillCostFor('R');
      if (!free && this.mp < (info ? info.mana : 0)) return;
      if (!free) { this.mp -= (info ? info.mana : 0); updateBars(this); }
      this._rRecastReadyUntil = 0;
    } else if (!this._payCost('R', free)) return;
    this._clearActionTimers();
    const cast = this.actionData.rCast;

    // R 궁극기 windup -> channel -> cast 3단계는 서로 다른 GLB AnimationClip을
    // 순서대로, 각각 정해진 구간(clipStart~clipEnd)까지만 강제 재생하고 끊어야
    // 하는 전형적인 케이스라서 범용 AnimationSequencePlayer(섹션 1-A2)를 그대로
    // 사용한다 -- 챔피언/애니메이션 이름은 전부 abilityResolver가 골라준 이름을
    // 그대로 데이터로 넘길 뿐, 여기서 하드코딩하지 않는다.
    const windup = this.actionData.rWindup, channel = this.actionData.rChannel;
    const windupClip = this.actionData.hasRChannel ? this.resolveClip(windup.clips) : null;
    const channelClip = this.actionData.hasRChannel ? this.resolveClip(channel.clips) : null;
    const castClip = this.resolveClip(cast.clips);

    if (this.actionData.hasRChannel && windupClip && channelClip && castClip) {
      this.setState(STATE.R_CAST);
      let damageApplied = false;
      const R_SEQUENCE = {
        steps: [
          { animation: windupClip.name, clipStart: 0, clipEnd: windup.duration },
          { animation: channelClip.name, clipStart: 0, clipEnd: channel.duration },
          { animation: castClip.name, clipStart: 0, clipEnd: castClip.duration },
        ],
        onStepStart: (index) => {
          if (index === 0) {
            this.currentActionKey = 'rWindup'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
          } else if (index === 1) {
            this.setState(STATE.CHANNEL);
            this.currentActionKey = 'rChannel'; this.currentPhase = 'CHANNEL'; this.phaseCancelable = false;
          } else if (index === 2) {
            this.currentActionKey = 'rCast'; this.currentPhase = 'STARTUP';
            // cast 애니메이션 구간 안에서 발동 타이밍(cast.startup)에 데미지/VFX를
            // 맞춰서 쏘되, clipEnd(=cast 애니메이션 강제 종료 지점)를 넘기지 않는다.
            const fireDelay = Math.min(Math.max(0, cast.startup), cast.duration ?? castClip.duration) * 1000;
            const fireTimer = setTimeout(() => {
              if (damageApplied) return;
              damageApplied = true;
              this.currentPhase = 'ACTIVE';
              vfx.spawn('r', this.root.position.clone());
              if (this.currentTarget && this.currentTarget.hp > 0) applyDamage(this.currentTarget, { rawDamage: cast.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
              this.currentPhase = 'RECOVERY'; this.phaseCancelable = cast.cancelable;
            }, fireDelay);
            this._actionTimers.push(fireTimer);
          }
        },
        onComplete: () => {
          // 정상 종료: cast 데미지가 아직 안 나갔으면(예: cast.startup이 clip 전체
          // 길이보다 컸던 경우) 여기서 마지막으로 한 번 보정 발동한다.
          if (!damageApplied) {
            damageApplied = true;
            vfx.spawn('r', this.root.position.clone());
            if (this.currentTarget && this.currentTarget.hp > 0) applyDamage(this.currentTarget, { rawDamage: cast.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          }
          const recTimer = setTimeout(() => { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }, cast.recovery * 1000);
          this._actionTimers.push(recTimer);
        },
        onCancel: () => {
          this.currentActionKey = null; this.currentPhase = null;
          this._resumeAfterAction();
        },
      };
      this.sequencePlayer.play(R_SEQUENCE);
    } else {
      // 업데이트(가렌 R 문서 전체 반영): 문서가 요구하는 핵심 구조(①R은 대상을
      // 시전 시작 시점에 고정하고 마우스 위치가 아니라 그 저장된 참조로 피해를
      // 준다 - this.currentTarget을 그대로 캡처해서 씀, ②Cast Time(가렌
      // 0.435초)과 GLB 애니메이션 길이를 동일시하지 않고 SKILL_TIMING_DATABASE.
      // garen.R의 eventTime=0.435로 정확한 시점에 onFire가 발동됨(아래
      // runAction의 startup이 그 값), ③R 종료 후 이동 여부에 따라 Idle/Run
      // 복귀는 _returnToLocomotion()이 그대로 처리)는 이미 구현돼 있다 - 이번에
      // 새로 고칠 부분은 없었다.
      //
      // 게임로직 TODO(문서 10/11절 "R 시전 중 대상이 죽거나 범위를 벗어난
      // 경우"): 아래 onFire는 대상의 hp>0만 재검증하고 피해를 준다 - 문서가
      // 요구하는 "사거리를 벗어났으면 피해를 취소할 것인가"는 실제 LoL 규칙을
      // 확정해서 별도로 넣어야 하는 부분이라(문서도 "확정할 수 없다"고 명시)
      // 구현하지 않았다. 필요하면 이 onFire 안에서 isInAttackRange 류의 거리
      // 체크를 추가하면 된다.
      //
      // 업데이트(다리우스 R 문서 전체 반영): 이 else 분기가 다리우스 R
      // (녹서스의 단두대)이 실제로 타는 경로다. SKILL_TIMING_DATABASE.darius.R
      // (eventTime 0.3667초, lockMove/lockAbility true)가 문서의 "락온형,
      // 시전 시작 후 스스로 캔슬 불가, Cast Time과 애니메이션 길이 분리"
      // 요구사항을 이미 만족한다 - 대상도 this.currentTarget을 그대로 캡처해서
      // 시전 시작 시점에 고정한 채 쓰므로 마우스 위치가 아니라 저장된 참조로
      // 피해가 나간다(문서 3/4절). 재시전 전용 클립이 없다는 문서 9절 사실도
      // 이 코드와 일치한다(항상 같은 'Spell4' 클립을 처음부터 다시 재생).
      // 게임로직: 처치 시 재사용 로직(요청 5절)은 이미 _dariusROnHit()에서
      // 구현되어 있다(처치 순간 _rRecastReadyUntil을 recastWindow만큼
      // 열고 this.cooldowns.R도 0으로 되돌려 UI까지 즉시 반영 - 위 20초
      // 무료 재시전 창 분기 및 _dariusROnHit 참고). 이 자리에 남아있던
      // "재사용 로직이 없다"는 메모는 그 구현 이전에 쓰인 낡은 내용이라
      // 실제 동작과 어긋나 있었으므로 정리한다.
      // 단일 STARTUP -> FIRE -> RECOVERY (Q/E와 동일한 형태로 축소)
      // 버그 수정(요청 1절 "시전 시작 순간에 대상을 고정하고, 시전 중
      // 마우스로 다른 대상을 선택해도 바뀌면 안 된다"): 예전엔 onFire
      // 콜백이 this.currentTarget을 그 자리에서(발동 시점에) 실시간으로
      // 읽었다 - R이 STARTUP(가렌 0.435초/다리우스 0.3667초) 동안 재생되는
      // 사이에 플레이어가 다른 적을 클릭하면 currentTarget이 조용히
      // 바뀌어서, 정작 피해는 캐스트 시작 때 고른 대상이 아니라 나중에
      // 클릭한 새 대상에게 들어갔다(세트 R은 이미 로컬 target 변수로
      // 캡처해둬서 이 문제가 없었음 - 그 방식을 그대로 따른다). 이제 R
      // 시전이 실제로 시작되는 이 시점에 대상을 한 번만 캡처해서 onFire가
      // 항상 그 스냅샷만 참조하게 한다.
      const lockedRTarget = this.currentTarget;
      // 다리우스 R(녹서스의 단두대)은 원작에서 대상에게 "도약"해 내리찍는다 - 예전엔
      // 제자리에서 Spell4만 재생했다. 판정 시점(eventTime)까지 대상 바로 앞으로
      // 공용 돌진 트윈(_dashState - 리 신 Q2/노틸러스 Q와 같은 경로)으로 이동한다.
      if (this.championId === 'darius' && lockedRTarget && lockedRTarget.mesh) {
        this._dariusStartRLeap(lockedRTarget);
      }
      this.runAction('rCast', STATE.R_CAST, {
        onFire: () => {
          vfx.spawn('r', this.root.position.clone());
          if (lockedRTarget && lockedRTarget.hp > 0) {
            if (this.championId === 'garen') { this._garenROnHit(lockedRTarget); debugSkillHit('Garen R', lockedRTarget); }
            else if (this.championId === 'darius') { this._dariusROnHit(lockedRTarget); debugSkillHit('Darius R', lockedRTarget); this._dariusRQeLockUntil = performance.now() + 250; }
            else if (this.championId === 'mordekaiser') {
              // 버그 수정(명세 2/3절 "R 유효 대상은 적 챔피언만 - 미니언/
              // 몬스터 등에는 발동되지 않아야 한다"): 이 데모의 유일한 상시
              // 테스트 대상인 허수아비는 이미 isChampion:true로 생성되지만
              // (세트 R과 동일한 이유), 나중에 미니언/몬스터 유닛이 추가될
              // 경우를 대비해 여기서도 명시적으로 재검증한다 - currentTarget
              // 판정만 믿지 않고 실제 유닛 속성을 확인한다는 이 시스템의
              // 기존 원칙(논타겟 Hit Detection)과 일치한다.
              if (lockedRTarget.isChampion) { this._mordeROnHit(lockedRTarget); debugSkillHit('Mordekaiser R', lockedRTarget); }
              else debugSkillMiss('Mordekaiser R', 'target is not a champion');
            }
            else applyDamage(lockedRTarget, { rawDamage: cast.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          } else {
            // R(데마시아의 정의/녹서스의 단두대)은 실제 LoL에서도 대상을
            // 직접 지정해야 하는 타겟팅형 궁극기다 - 적을 먼저 좌클릭으로
            // 선택(currentTarget)해두지 않으면 이 시점에 때릴 대상이 없다.
            // (요청 3/③ "피해 이벤트 발생 전 대상이 이미 죽었다면 피해를
            // 주지 않는다"도 위 lockedRTarget.hp > 0 재검증으로 이미 만족)
            debugSkillMiss('R', 'no currentTarget selected (적을 먼저 클릭해서 선택해야 함)');
          }
        },
      });
    }
};
