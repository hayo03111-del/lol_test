/* ============================================================
   1-A2. GENERIC ANIMATION SEQUENCE SYSTEM
   ------------------------------------------------------------
   범용 다중 애니메이션 시퀀스 재생기. 특정 챔피언이나 특정 애니메이션
   이름을 절대 하드코딩하지 않는다 -- 무엇을 재생할지는 항상 밖에서
   넘겨주는 sequence 데이터(steps 배열)가 결정한다.

   하나의 행동(기본공격/패시브/Q/W/E/R/궁극기/아이템/귀환/사망/특수행동
   등 무엇이든)에 서로 다른 GLB AnimationClip을 원하는 개수만큼 순서대로
   등록하고, 각 Step은 clipStart~clipEnd 구간만 재생한 뒤 원본 클립의
   전체 길이와 무관하게 강제로 끊고 곧바로 다음 Step으로 넘어간다.
   (AnimationAction이 스스로 끝날 때까지 기다리지 않는다.)

   전환 방식(중요): Step이 끝나도 이전 Action을 stop()으로 먼저 죽이지
   않는다. 다음 Action을 CharacterController의 기존 crossFadeToClip()으로
   재생 시작하면, 그 함수 자체가 "이전 Action.crossFadeTo(다음 Action,
   fadeTime, false)"를 걸어줘서 weight가 fadeTime 동안 자연스럽게
   1->0 / 0->1로 교체된다 -- 새 블렌딩 로직을 따로 만들지 않고 이미 이
   프로그램 전체(Idle<->Move<->공격 전환 등)가 쓰는 바로 그 함수를 그대로
   재사용한다(요청 11). 그래서 시퀀스 내부 Step 전환(A->B->C)과 마지막
   Step 종료 후 게임 상태 복귀(스킬->Idle/Move/공격)가 전부 동일한 규칙으로
   자연스럽게 이어진다 -- 마지막 Step이 끝나도 이 클래스는 그 Action을
   멈추지 않고 그대로 재생 유지한 채 onComplete()만 호출하고, 호출된 쪽
   (CharacterController._resumeAfterAction 등)이 다음 상태의 Action을
   crossFadeToClip()으로 재생하면 자동으로 거기서부터 다시 Cross Fade된다.
   오직 cancel()(강제 취소)만 예외적으로 즉시 정지한다.

   사용법 (어떤 챔피언/스킬에서도 동일한 형태):
     const SKILL_Q_SEQUENCE = {
       transitionFadeTime: 0.15,           // (선택) 이 시퀀스 전체의 Cross Fade 시간
       steps: [
         { animation: 'attack1', clipStart: 0.0, clipEnd: 0.35 },
         { animation: 'spell1',  clipStart: 0.2, clipEnd: 0.80 },
         { animation: 'attack2', clipStart: 0.0, clipEnd: 0.25 },
       ],
       onComplete() { ... },              // 마지막 Step까지 정상 종료됐을 때
       onCancel()   { ... },               // 중간에 강제 취소됐을 때
       onStepStart(index, step) { ... },   // (확장, 선택) Step이 바뀔 때마다
     };
     controller.sequencePlayer.play(SKILL_Q_SEQUENCE);
     ...
     controller.sequencePlayer.cancel();   // 언제든 즉시 강제 취소
   ============================================================ */
class AnimationSequencePlayer {
  // resolveClip: (animationName: string) => THREE.AnimationClip | null
  // playClip: (clip, opts) => THREE.AnimationAction -- 실제 재생을 맡기는
  // 함수. 반드시 기존 Cross Fade 전환(crossFadeToClip)을 그대로 사용해야
  // 한다(요청 11) -- 이 클래스는 "언제 다음 Step으로 넘어갈지"만 결정하고,
  // "어떻게 자연스럽게 넘어갈지"는 이 콜백에 위임한다.
  constructor(mixer, resolveClip, playClip) {
    this.mixer = mixer;
    this.resolveClip = resolveClip;
    this.playClip = playClip;
    this.sequence = null;
    this.currentStepIndex = -1;
    this.currentStep = null;
    this.currentAction = null;
    this.isPlaying = false;
    this.isTransitioning = false; // 요청 9: 같은 Step 전환이 중복 실행되는 것 방지
  }

  /** 새 시퀀스 재생 시작. steps 배열은 1개 이상 몇 개든 가능하다. */
  play(sequence) {
    if (!sequence || !Array.isArray(sequence.steps) || sequence.steps.length === 0) {
      console.error('[AnimationSequence] play() requires a { steps: [...] } sequence with at least one step.');
      return false;
    }
    // 이미 재생 중이던 이전 시퀀스가 있다면 콜백 없이 조용히 정리한다 --
    // "새로운 행동이 시작됨"은 취소 사유가 되지만, 그 취소는 새 play() 호출측
    // 책임이므로 여기서 onCancel을 다시 쏘지 않는다(중복 통지 방지). 이때는
    // 새 시퀀스의 첫 Step으로 즉시 Cross Fade되므로 즉시 정지가 아니어도 된다.
    if (this.isPlaying) this._teardown(null, { hardStop: false });
    this.sequence = sequence;
    this.currentStepIndex = -1;
    this.isPlaying = true;
    this.isTransitioning = false;
    this._advanceToStep(0);
    return true;
  }

  /** 매 프레임 호출. AnimationMixer.update(dt) 이후에 호출해야 action.time이
   *  최신값이다 -- 이 함수는 그 시간이 이번 Step의 clipEnd에 도달했는지만
   *  확인하고, 도달했으면 다음 Step으로 넘긴다(원본 AnimationClip이 끝날
   *  때까지 절대 기다리지 않음. 단, 정지가 아니라 Cross Fade로 넘어간다). */
  update() {
    if (!this.isPlaying || this.isTransitioning || !this.currentAction || !this.currentStep) return;
    if (this.currentAction.time >= this.currentStep.clipEnd) {
      this.isTransitioning = true;
      this._advanceToStep(this.currentStepIndex + 1);
      this.isTransitioning = false; // 전환 자체는 동기적으로 끝나므로 바로 해제
    }
  }

  /** 콜백 없이 즉시 조용히 정지 (모델 교체 등 내부 정리용). */
  stop() {
    this._teardown(null, { hardStop: true });
  }

  /** 외부(이동 명령/다른 스킬/기절/프로그램 강제취소 등)에서 강제 취소.
   *  onCancel 콜백이 호출되고, 남아 있던 다음 Step은 절대 실행되지 않는다.
   *  요청 8: 정상적인 Step 전환은 Cross Fade지만, 강제 취소는 기존 모션이
   *  끝나기를 기다리지 않고 즉시 중단한다(hardStop). */
  cancel() {
    if (!this.isPlaying) return;
    this._teardown('cancel', { hardStop: true });
  }

  _advanceToStep(index) {
    // 요청 2/3/7: 다음 Step으로 넘어갈 때 이전 Action을 먼저 stop()하지 않는다.
    // playClip(=crossFadeToClip)이 이전 Action에 대해 crossFadeTo()를 걸어주므로
    // weight가 fadeTime 동안 자연스럽게 넘어간다 -- 여기서는 그냥 다음 Action을
    // 재생 요청만 한다.
    if (index >= this.sequence.steps.length) {
      this._finish();
      return;
    }

    const step = this.sequence.steps[index];
    // 이름을 직접 지정한 그대로만 검색한다 -- 비슷한 이름으로 자동 대체하거나
    // 랜덤 애니메이션을 고르지 않는다.
    const clip = this.resolveClip(step.animation);
    if (!clip) {
      console.error(`[AnimationSequence] Missing animation: ${step.animation}`);
      this._teardown('cancel', { hardStop: true }); // 에러 상황은 정상 전환이 아니므로 즉시 중단
      return;
    }

    let clipStart = typeof step.clipStart === 'number' ? step.clipStart : 0;
    let clipEnd = typeof step.clipEnd === 'number' ? step.clipEnd : clip.duration;
    if (clipStart < 0) {
      console.warn(`[AnimationSequence] ${step.animation}: clipStart(${step.clipStart})가 0보다 작아 0으로 보정합니다.`);
      clipStart = 0;
    }
    if (clipStart >= clip.duration) {
      console.warn(`[AnimationSequence] ${step.animation}: clipStart(${step.clipStart})가 클립 길이(${clip.duration.toFixed(3)})를 벗어나 보정합니다.`);
      clipStart = Math.max(0, clip.duration - 0.001);
    }
    if (clipEnd <= clipStart) {
      console.warn(`[AnimationSequence] ${step.animation}: clipEnd(${step.clipEnd})가 clipStart(${clipStart.toFixed(3)}) 이하라 보정합니다.`);
      clipEnd = Math.min(clip.duration, clipStart + 0.001);
    }
    if (clipEnd > clip.duration) {
      console.warn(`[AnimationSequence] ${step.animation}: clipEnd(${step.clipEnd})가 클립 길이(${clip.duration.toFixed(3)})를 넘어 보정합니다.`);
      clipEnd = clip.duration;
    }

    // 요청 1: Step별 fadeTime > 시퀀스 전체 transitionFadeTime > 전역 기본값 순으로 사용.
    const fadeTime = typeof step.fadeTime === 'number' ? step.fadeTime
      : (typeof this.sequence.transitionFadeTime === 'number' ? this.sequence.transitionFadeTime : DEFAULT_ANIMATION_FADE_TIME);

    // 요청 10: 매번 reset() + time=clipStart로 명확히 재시작하므로, 같은 클립을
    // 다시 쓰거나 Loop로 처음으로 돌아가는 문제가 생기지 않는다.
    const action = this.playClip(clip, {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      fade: fadeTime,
      timeScale: typeof step.timeScale === 'number' ? step.timeScale : 1.0,
      time: clipStart,
    });

    this.currentStepIndex = index;
    this.currentStep = { ...step, clipStart, clipEnd };
    this.currentAction = action;

    if (typeof this.sequence.onStepStart === 'function') {
      try {
        this.sequence.onStepStart(index, this.currentStep);
      } catch (err) {
        console.error('[AnimationSequence] onStepStart error; aborting sequence safely:', err);
        this._teardown('cancel', { hardStop: true });
        return;
      }
    }
  }

  // 요청 5/6: 마지막 Step이 끝나도 여기서는 현재 Action을 절대 멈추지 않는다.
  // "다음에 뭘 재생할지"는 이 클래스가 모르므로(=상태 복귀 로직과 분리),
  // onComplete()를 호출해서 호출한 쪽이 크로스페이드로 이어받도록 넘긴다.
  _finish() {
    const seq = this.sequence;
    this.isPlaying = false;
    this.sequence = null;
    this.currentStepIndex = -1;
    this.currentStep = null;
    this.currentAction = null; // 이 플레이어의 관리 대상에서는 제외 -- Action 자체는 계속 재생 중
    if (seq && typeof seq.onComplete === 'function') seq.onComplete();
  }

  // hardStop=true(cancel/에러)일 때만 즉시 정지한다. play()가 새 시퀀스로
  // 갈아탈 때(hardStop=false)는 다음 Step의 Cross Fade가 알아서 이전 Action을
  // 자연스럽게 밀어내므로 여기서 stop()할 필요가 없다.
  _teardown(reason, { hardStop } = {}) {
    const seq = this.sequence;
    if (hardStop && this.currentAction) { this.currentAction.stop(); this.currentAction.enabled = false; }
    this.isPlaying = false;
    this.sequence = null;
    this.currentStepIndex = -1;
    this.currentStep = null;
    this.currentAction = null;
    if (!seq) return;
    if (reason === 'cancel' && typeof seq.onCancel === 'function') seq.onCancel();
  }
}

