/* ============================================================
   0-A2. CHAMPION ABILITY DATABASE
   ------------------------------------------------------------
   추가 수정사항 3/4/22: "Spell1=Q, Spell2=W..." 같은 규칙을 모든
   챔피언에게 무조건 적용하지 않는다. 대신 챔피언별로 실제 스킬에
   해당하는 애니메이션 이름/패턴을 미리 알고 있으면 그것을 최우선으로
   사용하고, 모르는 챔피언은 (자동 추론 + 수동 매핑)으로 자연스럽게
   폴백한다. 여기 등록된 항목은 CommunityDragon류 챔피언 리그 데이터를
   본떠 만든 로컬 시드 데이터이며, animationNames(정확한 이름, 최우선)
   와 animationPatterns(정규식, 그 다음 우선순위)를 함께 가질 수 있다.
   이 DB에 없는 챔피언은 그냥 championId가 null/미등록으로 취급되어
   3~5순위(정확 패턴/점수 추론)로 자연스럽게 넘어간다 - 에러 없음.
   ============================================================ */
const championAbilityDatabase = {
  yasuo: {
    Q: { animationNames: ['Spell1A','Spell1B','Spell1C'], animationPatterns: [/^Spell1/i] },
    W: { animationNames: ['Spell2_BASE','Spell2_180','Spell2_-180','Spell2_90','Spell2_-90','Spell2_0'], animationPatterns: [/^Spell2/i] },
    E: { animationNames: ['Spell3'], animationPatterns: [/^Spell3$/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/^Spell4$/i] },
  },
  // 실제 요네.glb(84클립) 기준으로 확인한 정확 클립명(2025-08 업로드본).
  // Q(필멸의 검)는 일반 1/2타 찌르기(Yone_Spell1_A_01/02.anm)와, 폭풍
  // 구름 2중첩 시 강화되는 3타 돌진+돌풍(Spell1C_In/Dash/Out)이 서로
  // 다른 클립 세트로 분리돼 있다 - 야스오의 Spell1A/B/C(회전베기 포함)와
  // 달리 요네는 회전 참격이 없으므로 그 세트를 그대로 재사용하지 않는다.
  // W(영혼 가르기)는 Spell2 단일 클립. E(영혼해방)는 몸을 두고 나가는
  // 돌진(Spell3_Dash) - 남겨진 몸(Spell3_BodyIn/BodyLoop) - 복귀
  // (Spell3_Out) 3단계 구조이며, 복귀 시 상황별로 다른 두 종류의 마무리
  // 클립(Spell3_End1/End2)이 존재한다(사살 여부 등에 따른 분기로 추정 -
  // 정확한 트리거 조건은 공개 자료에 없어 기본은 End1을 사용하고 End2는
  // 대체 클립으로만 등록해 애니메이션 실패를 막는다). R(운명봉인)은
  // Spell4(캐스트) + Spell4_Out(블링크 이후 마무리) 구조.
  yone: {
    Q: {
      animationNames: ['Yone_Spell1_A_01.anm','Yone_Spell1_A_02.anm','Spell1C_In','Spell1C_Dash','Spell1C_Out','Spell1_Dash'],
      animationPatterns: [/^spell1/i, /^yone_spell1/i],
      substateLocomotion: { moveClips: ['Spell1C_ToWalk_0','Yone_Spell1A_toWalk01.anm'] },
    },
    W: { animationNames: ['Spell2'], animationPatterns: [/^spell2$/i] },
    E: {
      animationNames: ['Spell3_Dash','Spell3_BodyIn','Spell3_BodyLoop','Yone_Spell3_spiritIn.anm','Spell3_Out','Spell3_End1','Spell3_End2'],
      animationPatterns: [/^spell3/i, /^yone_spell3/i],
    },
    R: { animationNames: ['Spell4','Spell4_Out'], animationPatterns: [/^spell4/i] },
  },
  kindred: {
    Q: { animationNames: ['Spell1Forward', 'Spell1Left', 'Spell1Right', 'Spell1Back'], animationPatterns: [/spell1/i] },
    W: { animationNames: ['Spell2_Idle'], animationPatterns: [/spell2/i] },
    E: { animationNames: ['Spell3', 'Spell3_2'], animationPatterns: [/spell3/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/spell4/i, /channel/i] },
  },
  // 실제 아리.glb(사용자 업로드본, 55클립) 기준으로 확인한 정확 클립명.
  // Q(현혹의 구슬)/W(여우불)는 각각 Spell1/Spell2 단일 클립. E(매혹)는
  // "Spell3" 단일 클립이 아니라 절대 방향별 4종(Spell3_North/Spell3_south/
  // Spell3_east/Spell3_west)으로만 존재한다 - bin 데이터의 alwaysSnapFacing:true
  // (매혹은 항상 조준 방향으로 즉시 정면을 돌린다)와 일치하는 구조. 실제
  // 방향 선택은 이즈리얼 E와 동일하게 커스텀 캐스트 함수(_ahriCastE, ahri.js)
  // 에서 findAnimation()으로 직접 처리한다. R(혼령 질주)은 Spell4(돌진 캐스트)
  // + Run_Spell4(돌진 중 이동) + Spell4_Idle(재시전 대기 포즈) 구조 - 재시전
  // 가능 여부에 따른 진입/이탈은 _ahriCastR에서 직접 처리한다.
  ahri: {
    Q: { animationNames: ['Spell1'], animationPatterns: [/^spell1$/i, /orb/i] },
    W: { animationNames: ['Spell2'], animationPatterns: [/^spell2$/i, /fox[_ ]?fire/i] },
    E: {
      animationNames: ['Spell3_south', 'Spell3_North', 'Spell3_east', 'Spell3_west'],
      animationPatterns: [/^spell3/i, /charm/i],
    },
    R: { animationNames: ['Spell4', 'Run_Spell4', 'Spell4_Idle'], animationPatterns: [/^spell4/i, /ultimate/i] },
    idleAnimationNames: ['Idle1'],
    moveAnimationNames: ['Run'],
    attackAnimationNames: ['Attack1', 'Attack2'],
  },
  // 실제 가렌.glb(34클립) 기준으로 검증한 정확 클립명. 결정타(Q)는 실제
  // 공개 데이터 기준 "Cast Time 없음 + 독립 모션 없음" 타입(EMPOWERED_
  // ATTACK)이라 방향별 캐스트가 아니라 "다음 평타 하나를 Spell1로 대체 +
  // 평타 타이머 리셋"으로 구현한다(CharacterController._castQ 참고).
  // 용기(W)는 원래 몸 애니메이션이 없으며(버프만 즉시 활성화). 데마시아의
  // 정의(R)는 클립명이 "Spell4"가 아니라 "Spell4_Base"라서, 그동안 일반
  // 정규식 폴백(\bspell4\b)이 "Spell4_Base"의 "4" 뒤에 "_"가 붙어 단어
  // 경계 판정에 실패해 전혀 매칭되지 않았다(R 애니메이션 없음 버그) -
  // 여기 정확한 이름을 등록해서 고쳤다.
  // 심판(E)은 directionalChannel로 등록: E 재입력 전까지(또는 duration
  // 만료까지) 채널링을 유지하면서, 클릭(이동 입력)이 들어올 때마다 그
  // 방향에 맞는 Spell3_0/90/-90/180/-180 클립으로 실시간 재선택한다
  // (문서 3-5절 그대로 구현 - CharacterController._castE/updateEChannel/
  // _updateEChannelDirection 참고).
  garen: {
    // 업데이트(가렌 Q/W/E/R 4개 문서 반영): 문서가 요구하는 애니메이션 레이어
    // 변경만 반영하고, 실제 게임 로직(정확한 피해량/침묵 지속시간/사거리
    // 재검증/대상 유효성 심화 규칙 등)은 각 지점에 "게임로직 TODO" 주석으로만
    // 남긴다 - 이번 작업 범위가 애니메이션 쪽으로 한정됐기 때문이다.
    //
    // Q(결정타) substateLocomotion.moveClips: 문서 4/6/14절 - Q_ARMED(강화
    // 평타 대기) 상태에서 이동하면 일반 Run_Base가 아니라 전용 이동 클립
    // Run_Spell1을 써야 한다. idleClips는 일부러 비워둔다(문서: "Q 입력 후
    // 가만히 있으면 Idle_Base 그대로, Spell1을 억지로 끼워넣지 않는다").
    // 이 서브 상태('Q')는 _castQ()에서 애니메이션 전용으로 setSubState되고,
    // 실제 강화 평타가 발동되는 순간(_beginAttackSwing) clearSubState되어
    // 문서 12/13절의 "Q 소모는 HIT 성공 시점" 원칙과 애니메이션이 어긋나지
    // 않게 맞춘다.
    Q: {
      animationNames: ['Spell1'], animationPatterns: [/spell1/i, /decisive[_ ]?strike/i],
      attackOverrideAnimationNames: ['Spell1'], attackOverrideMode: 'oneShot', attackOverrideUses: 1,
      substateLocomotion: { moveClips: ['Run_Spell1'] },
    },
    W: { animationNames: [], animationPatterns: [] }, // 몸 애니메이션 없음(버프만 트리거)
    E: {
      animationNames: ['Spell3_0'], animationPatterns: [/spell3/i, /judgment/i],
      directionalChannel: { duration: 4.0, clips: { front:'Spell3_0', right:'Spell3_90', left:'Spell3_-90', back:'Spell3_180', backAlt:'Spell3_-180' } },
    },
    R: { animationNames: ['Spell4_Base'], animationPatterns: [/spell4/i, /demacian[_ ]?justice/i] },
  },
  // 요청(champion_animation_summary_6champs.md 문서 기반): W(불멸) 활성 중에는
  // Idle/Run 자체가 Spell2_Idle/Spell2_Walk로 바뀌고(substateLocomotion),
  // Q/E/R 종료 후 복귀 지점도 통째로 달라진다. 복귀 지점 전환은 Idle/Run이
  // substateLocomotion으로 이미 바뀌어 있으므로 _returnToLocomotion()이
  // 자동으로 W 상태에 맞는 클립으로 안착한다(문서가 요구하는 "Spell1_to_
  // Spell2_Idle" 같은 개별 전환-블렌드 클립까지 별도로 끼워넣지는 않지만,
  // 최종적으로 도달하는 애니메이션은 W 활성 여부에 따라 정확히 갈린다).
  // E는 아예 캐스트 클립 자체가 W 활성 중 다른 이름("Spell3_Cast_from_
  // Spell2.anm")으로 바뀌므로 subStateAnimationNames로 등록.
  // 업데이트(모데카이저.glb 68클립 실측 + 사용자 제공 상태머신 문서 기준):
  // 아래 4개 필드가 이번에 새로 추가됐다 - 전부 "특정 챔피언 하드코딩"이
  // 아니라 championAbilityDatabase 어떤 챔피언에든 재사용 가능한 범용
  // 메커니즘으로 구현했다(CharacterController._playExitClip / _castW의
  // recastClips 분기 / _castE의 moveAnimationNames·subStateAnimationNames
  // {idle,move} 참고).
  //  1) exitClips: 스킬 종료 직후 Idle/Run으로 즉시 스냅하지 않고, 정지/
  //     이동/서브상태(W)에 따라 다른 "복귀 전환 클립"을 한 번 재생한 뒤
  //     로코모션으로 넘어간다(문서 22~26/41~44/49~50절). Q는 추가로
  //     directional(문서 24절 "5방향, Q 종료 시점 최신 이동 입력 기준")
  //     로 이동 방향까지 반영한다.
  //  2) E.moveAnimationNames: "Walk" 이름이 붙었다고 이동 잠금이 자동
  //     해제되는 건 아니지만(SKILL_TIMING_DATABASE.mordekaiser.E가 잠금을
  //     담당), 최소한 정지/이동 중 캐스트 모션 자체는 갈라야 한다는 문서
  //     41절 요구를 반영 - 실제 이동 허용 여부와는 분리된 순수 표현.
  //  3) subStateAnimationNames.W를 배열 대신 {idle,move} 형태로 등록하면
  //     W 활성 중 E도 정지/이동에 따라 갈린다(문서 42절, 이전에는 이동
  //     여부와 무관하게 항상 Spell3_Cast_from_Spell2.anm 하나만 나가는
  //     한계가 있었음).
  //  4) W.recastClips: W가 이미 켜진 상태에서 W를 다시 누르면 새 캐스트가
  //     아니라 "남은 보호막을 즉시 회복으로 전환하며 종료"하는 별도 동작
  //     이다(문서 37/38절). 파일에 실제로 "Sheild" 오타가 있는 클립명
  //     (Spell2_Run_Sheild_Consume_Exit.anm)은 절대 "정상 철자"로 고치면
  //     안 된다 - 고치면 존재하지 않는 이름이 되어 매칭에 실패한다.
  mordekaiser: {
    Q: {
      animationNames: ['Spell1'], animationPatterns: [/spell1/i, /obliterate/i],
      exitClips: {
        base: { idle: 'Spell1_To_Idle', move: 'Spell_1_torun_0.anm' },
        directional: { '0': 'Spell_1_torun_0.anm', '90': 'Spell1_Torun_90', '-90': 'Spell1_Torun_-90', '180': 'Spell1_Torun_180', '-180': 'Spell1_Torun_-180' },
        subState: { W: { idle: 'Spell1_to_Spell2_Idle.anm', move: 'Spell1_to_Spell2_run.anm' } },
      },
    },
    W: {
      animationNames: ['Spell2_Cast.anm'], animationPatterns: [/spell2/i, /indestructible/i],
      // substateLocomotion: W 활성 중 최종 정지/이동 루프. Spell2_Idle_In은
      // 짧은 진입 정렬용 원샷 클립(0.4667초)이라 루프 후보에서 뺐다 -
      // 이제 entryChain 쪽에서 "진입 시퀀스의 마지막 Step"으로만 쓰인다.
      substateLocomotion: { idleClips: ['Spell2_Idle'], moveClips: ['Spell2_Walk'] },
      // 업데이트(W 전용 상세 문서 5~10절): "W1 = Spell2_Cast.anm 하나로 끝"이
      // 아니라, Cast가 끝나는 시점에 그 순간의 정지/이동 여부를 "한 번만"
      // 판정해서(문서 9절 - 매 프레임 재판단 금지) Intro 체인을 태운 뒤에야
      // 비로소 Spell2_Idle/Spell2_Walk 루프에 안착한다. idleSteps/moveSteps는
      // AnimationSequencePlayer로 순서대로 재생되고, 마지막 Step이 끝나면
      // _returnToLocomotion()이 호출되어 substateLocomotion 루프로 자연스럽게
      // 이어진다(CharacterController._playWEntryChain 참고).
      entryChain: {
        idleSteps: ['Spell2_Intro.anm', 'Spell2_Idle_In'],
        moveSteps: ['Spell2_Intro_Upper_Walk.anm'],
      },
      // 업데이트(문서 12절): W 활성 중 "정지 Idle → 이동 시작" 전환에만 쓰이는
      // 전용 클립. 반대 방향(이동→정지)은 파일에 전용 클립이 없어(문서 15절)
      // 그냥 crossfade로 처리하는 것이 맞다 - 없는 이름을 만들어 넣지 않는다
      // (CharacterController._playLocomotionEntryTransition 참고).
      locomotionTransitions: { idleToMove: 'Spell2_Idle_to_Spell2_Walk.anm' },
      recastClips: { idle: 'Spell2_Consume_Shield.anm', move: 'Spell2_Run_Sheild_Consume_Exit.anm' },
      // 업데이트(문서 22~25절): 지속시간이 다 되어 "자연 종료"될 때도 재시전과
      // 마찬가지로 즉시 Idle/Run 스냅이 아니라 전용 종료 자세를 한 번 거친다
      // (CharacterController._activateWSubState의 자연 종료 타이머 참고).
      naturalExitClips: { idle: 'Spell2_Exit_Full', move: 'Spell2_Exit_Upper' },
    },
    E: {
      animationNames: ['Spell3_Cast.anm'], moveAnimationNames: ['Spell3_Cast_Walk.anm'],
      animationPatterns: [/spell3/i, /death.?s?[_ ]?grasp/i],
      subStateAnimationNames: { W: { idle: ['Spell3_Cast_from_Spell2.anm'], move: ['Spell3_Cast_Walk_from_Spell2.anm'] } },
      exitClips: { base: { idle: 'Spell3_Cast_to_Idle.anm', move: 'Spell3_Cast_Walk_to_Run.anm' } },
    },
    R: {
      animationNames: ['Spell4'], animationPatterns: [/spell4/i, /realm[_ ]?of[_ ]?death/i],
      exitClips: {
        base: { idle: 'Spell4_To_Idle', move: 'Spell4_To_Run' },
        subState: { W: { idle: 'Spell_4_cast_to_Spell2_Idle.anm', move: 'Spell_4_cast_to_Spell2_Run.anm' } },
      },
    },
  },
  // 요청(다리우스형 "다음 평타 하나 위임"): W(마비의 일격)는 그 자체 모션이
  // 없고, 다음 평타 하나가 Spell2 클립으로 대체된다. attackOverrideAnimationNames
  // 가 등록돼 있으면 W 시전 즉시 CharacterController._activateWSubState()가
  // registerAttackOverride({oneShot:true})를 걸어서 "다음 평타 한 번만" 이
  // 이름으로 대체되고, 사용되는 순간 자동으로 해제된다.
  // 업데이트(다리우스 Q/W/E/R 4개 문서 반영): 애니메이션 레이어만 반영하고,
  // 게임 로직(정확한 히트 프레임, 처치 재사용 시스템, 원형 범위 다중 대상
  // 판정 등)은 각 지점에 "게임로직 TODO" 주석으로만 남긴다.
  //
  // Q(학살) castChain: 문서 1~11절 - Q는 Spell1 하나가 아니라
  // Darius_Spell1_IN.anm(웜업, 0.80초) → Spell1(실제 도끼질, 0.52초)을
  // 강제로 연속 재생하는 2단계 구조다. R의 multiPhaseClips와 동일한
  // AnimationSequencePlayer 패턴을 재사용해서 구현한다(CharacterController.
  // _castQ의 castChain 분기 참고). impactStepIndex(=1, Spell1 시작 시점)에서
  // 피해가 발동된다 - 문서 6절 "정확한 히트 프레임은 자료에 없다"고 명시돼
  // 있어 Spell1 스텝이 *시작*하는 시점을 근사치로 사용했다.
  //
  // W(마비의 일격) substateLocomotion: 문서 9절 4~6절 - W_ARMED 상태에서는
  // 일반 Idle/Run이 아니라 Spell2_Idle/Spell2_Run을 써야 한다. 이 서브 상태는
  // attackOverrideAnimationNames가 이미 걸어주는 'W' 서브 상태(_activateWSubState
  // 참고)를 그대로 재사용하고, 실제 강화 평타가 소모되는 순간
  // _beginAttackSwing()의 clearSubState(override.id) 로직이 함께 꺼준다(가렌
  // Q에 적용한 것과 동일한 메커니즘).
  darius: {
    Q: {
      animationNames: ['Spell1'], animationPatterns: [/spell1/i, /decimate/i],
      castChain: { steps: ['Darius_Spell1_IN.anm', 'Spell1'], impactStepIndex: 1 },
    },
    // 다리우스 W: W 자체는 별도 애니메이션을 재생하지 않는다.
    // W 시전 직후 '다음 1회 기본 공격'에만 Spell2를 공격 애니메이션으로 사용하고,
    // 그 1회가 끝나면 override가 즉시 제거되어 이후 기본 공격은 일반 attack 클립을 사용한다.
    W: {
      animationNames: [], animationPatterns: [],
      attackOverrideAnimationNames: ['Spell2'],
      attackOverrideMode: 'oneShot', attackOverrideUses: 1,
    },
    E: { animationNames: ['Spell3'], animationPatterns: [/spell3/i, /apprehend/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/spell4/i, /guillotine/i] },
  },
  // 요청(노틸러스형 "평타 오버라이드 우선순위"): W(타이탄의 분노)는 지속시간
  // 동안 평타가 Attack4로 바뀐다(oneShot:false, durationSec만큼 유지).
  // 문서에 나온 패시브(강력한 일격 → Attack2) 오버라이드는 이 뷰어에 아직
  // 없는 "히트 스택 카운터" 인프라가 필요해서 이번 작업 범위에서는 제외했다
  // -- 나중에 추가할 때는 registerAttackOverride({id:'passive', priority:20, ...})
  // 처럼 W(priority:10)보다 높은 priority로 등록하면 문서가 요구하는
  // "패시브가 W보다 우선" 규칙이 그대로 성립한다.
  nautilus: {
    Q: { animationNames: ['Spell1'], animationPatterns: [/spell1/i, /dredge/i] },
    W: { animationNames: [], animationPatterns: [], attackOverrideAnimationNames: ['Attack4'], attackOverrideMode: 'duration' },
    E: { animationNames: ['Spell3'], animationPatterns: [/spell3/i, /riptide/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/spell4/i, /depth[_ ]?charge/i] },
  },
  // 실제 세트.glb(72클립) 검증 결과 + 실제 공개 Cast Time 자료 반영.
  // 주먹다짐(Q)은 공식 데이터상 EMPOWERED_ATTACK 타입(Cast Time 없음,
  // 독립 모션 없이 "다음 2회 평타"를 강화 + 평타 타이머 리셋)이라
  // attackOverrideSequence로 Spell1_A → Spell1_B를 순서대로 내보낸다.
  // 강펀치(W)는 "Sett_spell2.anm" 하나(충전판은 Spell2_Strong). 대미
  // 장식(R)은 MULTI_PHASE_FORCED_ACTION - 실제 대상을 붙잡고 600유닛
  // 운반 후 충돌, 250유닛 슬라이드하는 물리 이동까지는 이 데모 범위
  // 밖이지만, multiPhaseClips로 Dash→Grab→Spin→PowerBomb을 강제
  // 순서 재생하고 마지막 단계에서 피해가 터지는 구조는 재현한다
  // (CharacterController._castR의 multiPhaseClips 분기 참고 - 실제
  // 캐릭터 위치 이동/슬라이드는 없음, 시각적 단계 재생만 구현).
  // 안면 강타(E)는 resultDirectionalClips로 등록: 가렌 E와 달리 실시간
  // 방향이 아니라 "캐스트 시점에 붙잡은 대상이 정면/후면 중 어디 있었는가"
  // 라는 1회성 결과 판정이고(문서 6-3절 노틸러스 Q와 같은 유형), Cast
  // 0.25초 판정 후 공식 데이터에 명시된 추가 0.25초 이동/공격 잠금은
  // SKILL_TIMING_DATABASE.sett.E로 별도 반영했다.
  // 업데이트(세트 Q/W/E/R 4개 문서 반영): 애니메이션 레이어만 반영하고,
  // 게임 로직(정확한 Shield/Impact 수치, 좌우 대상 탐색·Stun 조건, R의 실제
  // 거리 기반 Suppress→Dash→Carry 600→Impact→Slide 250 물리 등)은 각 지점에
  // "게임로직 TODO"로만 남긴다.
  //
  // Q(주먹다짐) 문서 1~19절: 이미 attackOverrideSequence(['Spell1_A',
  // 'Spell1_B'], uses:2)로 "Q 버튼 = 즉시 버프+공격타이머리셋, 실제 강화
  // 공격 모션은 각각 다음/다다음 기본 공격이 실제로 발생할 때"라는 문서
  // 핵심 원칙이 이미 정확히 구현돼 있다 - 별도 Q 캐스트 애니메이션을 강제로
  // 재생하지 않고, _beginAttackSwing()에서 override가 "실제 스윙이 커밋되는
  // 시점"(적중 여부와 무관, 문서 9절 "적중이 아니라 사용 여부로 소비")에
  // 소비되는 구조도 이미 일치한다. 새로 고칠 부분 없음.
  sett: {
    Q: { animationNames: ['Spell1_A', 'Spell1_B'], animationPatterns: [/spell1/i, /knuckle[_ ]?down/i], attackOverrideAnimationNames: ['Spell1_A'], attackOverrideSequence: ['Spell1_A', 'Spell1_B'], attackOverrideMode: 'oneShot', attackOverrideUses: 2 },
    W: { animationNames: ['Sett_spell2.anm', 'Spell2_Strong'], animationPatterns: [/spell2/i, /haymaker/i] },
    E: {
      animationNames: ['Spell3'], animationPatterns: [/spell3/i, /facebreaker/i],
      resultDirectionalClips: { front: 'Spell3_Front', back: 'Spell3_Back' },
    },
    R: {
      animationNames: ['Spell4_Base', 'Spell4_Dash', 'Spell4_Spin', 'Spell4_PowerBomb'], animationPatterns: [/spell4/i, /show[_ ]?stopper/i],
      multiPhaseClips: ['Spell4_Dash', 'Spell4_Grab', 'Spell4_Spin', 'Spell4_PowerBomb'],
      multiPhaseImpactIndex: 4, // PowerBomb(충돌) 단계에서 피해 적용
    },
  },
  // 실제 마스터_이.glb(28클립) 검증 결과 + 최종 확정 사양 반영.
  // - Q(일격필살): "Spell1" 클립 + 강제 Hit Timeline(별도 커스텀 캐스트).
  // - W(명상): masteryi_2013_spell2.anm 단 하나만 사용한다(1.67초). 이전에
  //   후보로 뒀던 Spell2_In/Spell2_Loop는 이번 확정 사양에서 제외 - 애니메이션
  //   재생 시간(1.67초)과 실제 게임플레이 채널 지속시간(최대 4초)은 서로
  //   다른 타이머로 분리 관리한다(애니메이션이 끝나도 회복/피해감소 효과
  //   자체는 CHAMPION_DATA.masteryi.W.channelDuration 기준으로 별도 진행).
  // - E(우주류 검술): INSTANT_WEAPON_BUFF - 캐릭터 발동 애니메이션이 없다.
  //   즉시 상태 효과만 켜지고 현재 행동(Idle/Move/Attack)을 전혀 건드리지
  //   않는다. 실제 강화는 평타 명중 시점에 피해 계산에만 반영된다.
  // - R(하이랜더): 몸 애니메이션 없음(문서 그대로) - 버프만 적용.
  masteryi: {
    Q: { animationNames: ['Spell1'], animationPatterns: [/spell1/i, /alpha[_ ]?strike/i] },
    W: { animationNames: ['masteryi_2013_spell2.anm'], animationPatterns: [/spell2/i, /meditate/i] },
    E: { animationNames: [], animationPatterns: [] }, // 캐릭터 발동 모션 없음(확정) - 무기 이펙트 + 평타 강화만
    // R 활성 중 이동 애니메이션 전환(문서: "이동 중이면 Run -> 2013_Run_Haste").
    // 실제 glb에 해당 클립이 없으면 resolveClip이 조용히 실패해 기존 Run을
    // 그대로 쓰게 되므로(섹션 12 "애니메이션 없어도 로직은 작동") 안전하다.
    R: { animationNames: [], animationPatterns: [], substateLocomotion: { moveClips: ['2013_Run_Haste', 'Run_Haste'] } },
  },
  // 실제 초가스.glb를 검증하지 못해(제공된 자료 없음) 표준 Spell1~4 이름
  // 패턴만 등록해둔다 - AnimationRoleResolver의 점수 기반 추론(패턴 매칭)이
  // 최소한의 자동 인식을 시도하고, 빗나가면 기존처럼 수동 매핑 패널에서
  // 고칠 수 있다. 이 항목이 없으면 챔피언 수동 선택 드롭다운에도 아예
  // 나타나지 않아 GLB 자동 인식이 실패했을 때 대안이 없었다(버그 수정).
  chogath: {
    Q: { animationNames: [], animationPatterns: [/spell1/i, /rupture/i] },
    W: { animationNames: [], animationPatterns: [/spell2/i, /feral[_ ]?scream/i] },
    E: { animationNames: [], animationPatterns: [/spell3/i, /vorpal/i, /spike/i] },
    R: { animationNames: [], animationPatterns: [/spell4/i, /feast/i] },
  },
  // 리 신도 초가스와 동일하게 실제 glb 검증 자료가 없어 표준 패턴만 등록.
  // Q/W/E는 전부 "1차 시전 -> 3초 내 재시전" 이중 구조라 커스텀 캐스트로
  // 처리하고(championAbilityDatabase는 애니메이션 후보 탐색용으로만 쓰임),
  // 각 슬롯 이름 뒤에 재시전용 두 번째 클립 후보도 함께 등록해둔다.
  leesin: {
    // 사용자 지정 리 신 GLB 애니메이션 매핑. 실제 클립명이 없으면 기존
    // resolver가 안전하게 폴백한다. Q/W 1차 시전 뒤 복귀 클립은 별도 처리한다.
    Q: { animationNames: ['Spell1'], animationPatterns: [/^spell1$/i, /spell1/i] },
    W: { animationNames: ['Spell2'], animationPatterns: [/^spell2$/i, /spell2/i] },
    E: { animationNames: ['Spell3'], animationPatterns: [/^spell3$/i, /spell3/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/^spell4$/i, /spell4/i] },
    idleAnimationNames: ['Idle_Active'],
    attackAnimationNames: ['Attack1', 'Attack2', 'Attack3', 'Attack4'],
    qRecastAnimationNames: ['Spell1_B.ASU_LeeSin.anm', 'Spell1_B.ASU_LeeSin,anm'],
    qIdleAnimationNames: ['Spell1_Toldle'],
    wIdleAnimationNames: ['Spell2_Toldle'],
  },
  nilah: {
    Q: { animationNames: ['Spell1A','Spell1B','Spell1C'], animationPatterns: [/^Spell1/i] },
    W: { animationNames: ['Spell2'], animationPatterns: [/^Spell2$/i] },
    E: { animationNames: ['Spell3A','Spell3_Cast','Spell3B'], animationPatterns: [/^Spell3/i] },
    R: { animationNames: ['Spell4_Idle','Spell4_Run','Spell4_ToIdle'], animationPatterns: [/^Spell4/i] },
    idleAnimationNames: ['Idle1.anm'],
    moveAnimationNames: ['Run.anm'],
    attackAnimationNames: ['Attack1a','Attack2a'],
    attackAnimationSequences: {
      attack1: ['Attack1a','Attack1b.anm','Attack1c'],
      attack2: ['Attack2a','Attack2b.anm','Attack2c'],
    },
  },
  vex: {
    Q: { animationNames: ['Spell1_Base'], animationPatterns: [/spell1/i, /mistrust/i] },
    W: { animationNames: ['Spell2_Base'], animationPatterns: [/spell2/i, /personal[_ ]space/i] },
    E: { animationNames: ['Spell3_0'], animationPatterns: [/spell3/i, /attunement/i] },
    R: { animationNames: ['Spell4_Cast'], animationPatterns: [/spell4/i, /shadow[_ ]?surge/i] },
  },
  // 실제 이즈리얼.glb(사용자 업로드본, 39클립) 기준으로 확인한 정확 클립명.
  // Q(신비의 사격)/W(정기 방출)/R(정조준 사격)은 각각 Spell1/Spell2/Spell4
  // 단일 클립. E(비전 이동)는 블링크 방향에 따라 Spell3_0/90/-90/180/-180
  // 5방향 클립이 나뉘어 있다 - 실제 방향 선택 로직은 커스텀 캐스트 함수
  // (_ezrealCastE, ezreal.js)에서 findAnimation()으로 직접 처리하므로
  // (야스오/요네처럼 championAbilityDatabase는 애니메이션 후보 등록 +
  // 수동 매핑 패널용으로만 쓰이고, 실제 스킬 로직은 항상 챔피언 전용
  // 함수를 그대로 호출한다는 이 프로젝트의 원칙 그대로), 여기서는
  // directionalChannel/exitClips 같은 범용 엔진 훅을 새로 걸지 않고
  // 후보 이름만 등록해둔다.
  ezreal: {
    Q: { animationNames: ['Spell1'], animationPatterns: [/^spell1$/i, /mystic[_ ]?shot/i] },
    W: { animationNames: ['Spell2'], animationPatterns: [/^spell2$/i, /essence[_ ]?flux/i] },
    E: { animationNames: ['Spell3_0', 'Spell3_90', 'Spell3_-90', 'Spell3_180', 'Spell3_-180'], animationPatterns: [/^spell3/i, /arcane[_ ]?shift/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/^spell4$/i, /trueshot/i] },
    idleAnimationNames: ['Idle_Base'],
    moveAnimationNames: ['Run_Normal'],
    attackAnimationNames: ['Attack1a', 'Attack2a'],
  },
  // 실제 바루스.glb(사용자 업로드본, 23클립) 기준으로 확인한 정확 클립명.
  // Q(꿰뚫는 화살)는 단일 "Spell1" 캐스트 클립 외에, 충전 중 이동/정지
  // 여부에 따른 전용 클립(Spell1_Walk/Spell1_Idle)과 발사 순간 전용 클립
  // (Spell1_Fire)까지 별도로 존재한다(bin의 mUseChargeChanneling/
  // mCanMoveWhileChanneling과 일치하는 구조) - 실제 선택은 커스텀 캐스트
  // 함수(_varusCastQ/_varusReleaseQ, varus.js)에서 findAnimation()으로
  // 직접 처리한다. W(오한의 화살통)는 bin의 mAnimationName이 빈 문자열
  // (몸 애니메이션 없음, 가렌/모데카이저 W와 동일한 순수 버프/유틸 타입)
  // 이라 애초에 등록할 캐스트 클립이 없다. E(화살비)/R(속박의 사슬)은
  // 각각 "Spell3"/"Spell4" 단일 클립. 이 GLB에는 "Channel"/"Channel_Wndup"
  // 클립도 있지만, R의 실제 공식 시전 시간(bin mCastTime≈0.24초)은 윈드업
  // ->채널 3단계가 아니라 즉시 발사형이라(sett/mordekaiser류 궁과 다른
  // 유형) 이 둘을 R에 연결하지 않는다 - skill_timing_database.js의
  // SKILL_TIMING_DATABASE.varus.R 등록으로 hasRChannel 자동 추정 자체를
  // 꺼서(R처럼 이름에 "channel"이 들어간 클립이 실제로 존재해도) 이
  // 캐릭터에게는 3단계 채널 로직이 절대 적용되지 않게 막는다.
  varus: {
    Q: { animationNames: ['Spell1', 'Spell1_Idle', 'Spell1_Walk', 'Spell1_Fire'], animationPatterns: [/^spell1/i, /piercing[_ ]?arrow/i] },
    E: { animationNames: ['Spell3'], animationPatterns: [/^spell3$/i, /hail[_ ]?of[_ ]?arrows/i] },
    R: { animationNames: ['Spell4'], animationPatterns: [/^spell4$/i, /chain[_ ]?of[_ ]?corruption/i] },
    idleAnimationNames: ['varus_idle1.anm'],
    moveAnimationNames: ['Run'],
    attackAnimationNames: ['Attack1', 'Attack2'],
  },
};

