class CharacterController {
  // 요청 10/11: 게임 이동용 root와 AnimationMixer가 바인딩되는 실제 GLB
  // Scene/Skeleton(animationRoot)을 분리해서 받는다. root는 계속 게임 좌표/
  // 이동/회전을 담당하고, mixer는 오직 animationRoot(실제 모델) 아래에서만
  // Bone/Object 이름을 탐색한다 - 두 객체가 같은 계층(지금 구조에서는
  // root -> scaleWrapper -> animationRoot)이라도 mixer가 정확히 어떤
  // 서브트리에서 Track 대상을 찾는지 명확하게 분리해 둔다.
  constructor(root, animationRoot, resolver, actionData) {
    this.root = root;
    // 아군/적군/플레이어 시스템 - 미니언/포탑처럼 이 데모의 유일한 조작
    // 챔피언도 이제 `.team`을 갖는다(00_global_constants.js 참고). 지금까지
    // "플레이어는 항상 BLUE"가 여러 파일에 흩어진 문자열 리터럴 가정이었던
    // 것을 실제 데이터 필드로 통일한다 - 동작은 그대로지만, 앞으로 아군
    // 전용 효과(서포터 아이템/어시스트 등)를 만들 때 이 필드를 generic하게
    // 참조할 수 있다.
    this.team = PLAYER_TEAM;
    this.model = animationRoot; // 실제 GLB Scene/Skeleton/Bone이 들어있는 객체
    this.mixer = new THREE.AnimationMixer(animationRoot);
    this.clips = resolver.clips;
    this.resolver = resolver;
    this.actionData = actionData;
    this.actions = {};
    // 범용 다중 애니메이션 시퀀스 재생기 (섹션 1-A2). 이름 검색은 항상
    // 지금 로드된 이 GLB의 클립 목록(this.findAnimation)을 통해서만 이뤄져서,
    // 챔피언이 바뀌어도(=새 CharacterController가 만들어져도) 코드 수정이 필요 없다.
    // playClip은 반드시 기존 Cross Fade 전환 함수(crossFadeToClip)를 그대로
    // 넘긴다 -- 시퀀스 재생기가 별도의 블렌딩 로직을 새로 만들지 않는다.
    this.sequencePlayer = new AnimationSequencePlayer(
      this.mixer,
      (name) => this.findAnimation(name),
      (clip, opts) => this.crossFadeToClip(clip, opts)
    );
    this.currentAction = null;
    this.currentClipKey = null;

    this.state = STATE.IDLE;
    this.targetPos = null;
    this.pendingMove = null;
    // 요청("평타 도중 스킬을 누르면 그 평타가 끝나고 바로 스킬이 나가게"):
    // pendingMove와 완전히 동일한 패턴의 "대기 중인 스킬 입력" 큐. 지금
    // 진행 중인 행동이 기본 공격(attack1~4/crit)이라 즉시 캐스트가
    // 막혔을 때만 여기에 저장되고, 그 평타가 끝나는 시점(_resumeAfterAction)
    // 에서 자동으로 소비된다. 다른 스킬이 진행 중일 때 막힌 경우는 기존
    // 그대로 거부(토스트)된다 - 새로운 별도 스킬 대기열 시스템을 만들지
    // 않고 이 필드 하나만 추가한다.
    this.pendingCast = null;
    this.moveDir = new THREE.Vector3();
    this.isChasing = false; // 디버그 표시용: MOVE 상태가 "타겟 추적"으로 발생했는지

    this.hp = 100; this.maxHp = 100;
    this.mp = 100; this.maxMp = 100;

    // 요청 20: CharacterController 전투 스탯 구조. 기본값은 기존에 쓰이던
    // MOVE_SPEED/ATTACK_RANGE 전역 상수를 그대로 시드로 사용해 기존 체감을
    // 유지한다(요청 5). 이 오브젝트 하나가 이동속도/공격속도/사거리/방어/
    // 치명타 전부를 담당하며, 실제 계산은 항상 위쪽의 공통 함수들
    // (getFinalMoveSpeed 등)을 통해서만 이뤄진다.
    this.stats = {
      baseMoveSpeed: MOVE_SPEED, flatMoveSpeedBonus: 0, percentMoveSpeedBonus: 0,
      slowPercent: 0, moveSpeedMultiplier: 1, minMoveSpeed: MOVE_SPEED * 0.2, maxMoveSpeed: MOVE_SPEED * 3.0,

      attackDamage: 10, attackRange: ATTACK_RANGE,
      baseAttackSpeed: 1.0, bonusAttackSpeedPercent: 0, attackSpeedMultiplier: 1,
      minAttackSpeed: 0.2, maxAttackSpeed: 3.5,
      windupPercent: 0.4,

      projectileSpeed: 30,
      armor: 20, magicResist: 20,
      // 버그 수정: 기본 20%였다 - 실제 LoL은 기본 치명타 확률이 0%다(무한의
      // 대검 등 아이템으로만 얻는다). 이 데모엔 아이템 시스템이 없으므로
      // 항상 0이 맞다. 이 기본값이 20%였던 게 "세트가 왼손을 두 번 연속
      // 치는 것처럼 보인다"는 버그의 실제 원인이었다 - 치명타 스윙은
      // 별도의 'crit' 애니메이션을 재생하면서 comboIndex를 전혀 증가시키지
      // 않아서, 5번 중 1번꼴로 좌우 교대 시퀀스가 조용히 한 칸 밀렸다.
      critChance: 0, critMultiplier: 1.75,
      abilityPower: 0, // 이 데모에는 아이템/주문력 시스템이 없어 항상 0 - 기획안의 "+주문력" 항은 공식에는 남겨두되 실질 기여는 0이다(수치 임의 발명 방지)
    };
    // Range/Distance 시스템(요청 3): Visual Model(GLB 스케일)과 Collision
    // Shape를 별개 개념으로 관리한다. 기획안에 챔피언별 충돌 반경 수치가
    // 없으므로(전투 밸런스 수치가 아니라 엔진 차원의 값) 허수아비 원본
    // 크기(확대 전)와 동일한 기준값 하나를 모든 챔피언에 균일하게 적용한다
    // - 임의의 게임 수치를 만든 것이 아니라 렌더링 엔진의 충돌 반경일 뿐이다.
    this.collisionRadius = BASE_UNIT * 0.24;
    this.collisionHeight = BASE_UNIT * 1.1;
    this.selectionRadius = this.collisionRadius * 1.3;

    this.comboIndex = 0;
    // SETT 전용 2단계 손 순서: 0=LEFT, 1=RIGHT.
    this._settAttackStep = 0;
    this.currentTarget = null;
    // 공격 명령 지속 상태: 직접 지정한 대상이 죽어도 주변 적을 자동 재탐색한다.
    this.attackOrderActive = false;
    this.attackOrderAnchor = null;
    this.attackOrderRetargetRadius = lolRangeToWorld(650);

    this.cooldowns = { Q:0, W:0, E:0, R:0 };
    this._pendingTimeouts = [];
    this._actionTimers = [];
    this._lastECast = 0;
    // 요청(모데카이저형): "지금 W가 켜져 있는가" 같은 서브 상태를 이름으로
    // 관리하는 범용 저장소. 특정 챔피언 이름을 하드코딩하지 않고, 어떤
    // 스킬이든 setSubState('임의이름', 지속초)만 호출하면 다른 스킬의
    // 복귀 애니메이션이 그 서브 상태를 참고할 수 있다(아래 isSubStateActive).
    this.subStates = {}; // name -> 만료 시각(ms, performance.now() 기준)
    // 지금 재생 중인 "전환용" 클립 이름 집합(_moveClips() 참고) - Idle→Walk
    // 전환 클립이나 W Entry Chain의 이동 진입 클립처럼, MOVE 상태를 유지한
    // 채 한 번만 재생되고 지나가는 클립을 updateMovement()의 기존 자동
    // 보정 로직이 조기에 잘라내지 않도록 한다.
    this._transientMoveClipNames = new Set();
    // 요청(다리우스/노틸러스형): "다음 기본 공격 하나(또는 지속시간 동안)를
    // 다른 애니메이션으로 대체"하는 요청을 여러 소스가 동시에 걸 수 있는
    // 범용 큐. priority가 가장 높은 것이 이긴다(치명타는 이 큐와 무관하게
    // 항상 최우선).
    this.attackOverrides = [];
    this._previewTimer = null;
    // 요청(귀환 캔슬): 귀환 완료 타이머 id를 별도로 들고 있어야 cancelRecall()이
    // 정확히 "그 귀환"의 타이머만 지울 수 있다(_pendingTimeouts는 사망 등
    // 다른 지연 콜백도 같이 담는 범용 배열이라 통째로 비우면 안 됨).
    this._recallTimer = null;

    this.currentActionKey = null;
    this.currentPhase = null;
    this.phaseCancelable = false;
    this._actionSerial = 0; // 모든 액션 콜백의 세대(generation)를 추적해 오래된 타이머가 새 액션을 건드리지 못하게 한다.

    // ---- 기획안 기반 챔피언 데이터/레벨 시스템 (섹션 3/13) ----
    this.championId = null; // bootstrapChampion()에서 applyChampionData()로 설정됨
    // 벡스 R(그림자 파동) 전용 상태: 1차 적중 후 대상에게 재시전할 수 있는 창과 실제 돌진 상태를 분리한다.
    this._vex = { recastTarget: null, recastReadyUntil: 0, dashActive: false, dashStart: null, dashEnd: null, dashT: 0, dashDuration: 0.28 };
    // 이즈리얼 전용 상태: markTarget/markExpiresAt은 W(정기 방출) 표식,
    // rTravel은 R(정조준 사격)이 매 프레임 진행하는 관통 광선 상태(요네 R/
    // 야스오 Q3 회오리와 동일한 패턴 - _ezrealTickRTravel 참고).
    this._ezreal = { markTarget: null, markExpiresAt: 0, rTravel: null };
    // 아리 전용 상태: qTravel은 Q(현혹의 구슬)가 매 프레임 진행하는
    // 왕복 판정(요네 R/이즈리얼 R 광선과 동일한 패턴), foxfires는 W로
    // 소환된 여우불 3개(메시+타게팅 상태), rCharges/rReadyUntil은
    // R(혼령 질주)의 남은 돌진 횟수/재시전 창(_ahriCastR 참고).
    this._ahri = {
      passiveStacks: 0, qTravel: null, eTravel: null, foxfires: [],
      rCharges: 0, rReadyUntil: 0, rDash: null,
    };
    // 바루스 전용 상태: qCharge는 Q(꿰뚫는 화살)가 홀드-충전 중일 때만
    // 존재하는 상태(방향/시작 시각) - 릴리즈(재입력 또는 최대 충전시간
    // 도달) 즉시 null로 정리된다(_varusReleaseQ 참고). lv는 패시브(살아있는
    // 복수)의 대상별 공격 속도 램프업 진행 상태(_varusLvTick 참고).
    this._varus = { qCharge: null, lv: { target: null, rampStartAt: 0, lastHitAt: 0 } };
    // 애쉬 전용 상태: focusStacks/focusExpiresAt은 패시브 안에 포함된
    // "집중"(Q 궁사의 집중) 자원 - 기본 공격마다 쌓이고(최대 4), 일정
    // 시간(stackWindowSec) 안에 다시 공격하지 않으면 만료된다(_asheUpdate
    // 참고). qActiveUntil은 Q를 발동해 얻은 공격 속도 버프가 유효한 동안의
    // 만료 시각, flurryPending은 "다음 기본 공격 한 번이 다발 공격(화살
    // 6발)으로 바뀌어야 하는가"를 나타낸다(_beginAttackSwing이 확인).
    // wPending/ePending/rPending/rTravel은 각각 W(부채꼴 판정 지연)/E(정찰
    // 착탄 지연)/R(발사 지연)/R(전 맵 사거리 관통 광선 - 이즈리얼 R의
    // rTravel과 동일한 패턴)이 매 프레임 dt로 진행하는 상태다(실제 시계
    // setTimeout을 쓰지 않는다 - 일시정지 중에도 흘러가는 문제 예방).
    this._ashe = {
      focusStacks: 0, focusExpiresAt: 0,
      qActiveUntil: 0, flurryPending: false,
      wPending: null, ePending: null, rPending: null, rTravel: null,
    };
    this.champLevel = 1;
    // 요청("LoL 경험치 및 레벨 시스템 구현") - currentExp는 챔피언 레벨
    // 시스템(champion.currentExp)에서 쓰는 "현재 레벨 내 누적치"다(전체
    // 누적이 아니라 레벨업마다 초과분만 이월 - 요청 2). skillPoints는
    // 레벨업 시 지급되는 스킬 투자 포인트(요청 1) - 아래 skillLevels가
    // 이미 전부 1랭크로 시작하므로(그 이유는 바로 아래 주석 참고)
    // skillPoints는 0에서 시작해 "1랭크를 넘어서는 추가 투자"에만 쓰인다.
    this.currentExp = 0;
    this.skillPoints = 0;
    // 버그 수정: 예전엔 전부 0(미습득)으로 시작해서, 레벨 패널에서 Q/W/E/R
    // 각각 '+'를 따로 누르기 전까진 실제 키를 눌러도 스킬이 100% 조용히
    // 막혔다("모션만 나오고 데미지가 안 들어간다"는 보고의 실제 원인 -
    // '모션 테스트' 버튼은 이 게이트를 우회하지만 실제 R/Q/W/E 키 입력은
    // 우회하지 않는다). 이 프로젝트는 실전 매치가 아니라 전투 테스트용
    // 뷰어이므로, 로드 즉시 Q/W/E/R을 전부 1랭크로 미리 배워둔 상태로
    // 시작한다 - 레벨 패널의 '+' 버튼은 더 높은 랭크(2~5, R은 2~3)를
    // 테스트하고 싶을 때 그대로 사용할 수 있다.
    this.skillLevels = { Q: 1, W: 1, E: 1, R: 1 };
    this.statusEffects = [];
    this.shield = 0;
    this.bonusAD = 0; // 다리우스 과다출혈 만중첩 버프 등
    this.bonusArmor = 0; this.bonusMr = 0; // 가렌 W 처치 스택
    this.bonusMaxHp = 0; // 초가스 R 포식 중첩
    this.armorPenPercent = 0; // 다리우스 E 패시브
    this.magicPenPercent = 0; // 모데카이저 E 패시브
    // 패시브 내부 상태(가렌 인내심/다리우스 과다출혈 등은 이 오브젝트에 챔피언별로 필드를 추가해 사용)
    this.passiveState = { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0, lastPassiveHealAt: 0 };
    this._darius = { stacksOnTarget: new Map() }; // target -> {stacks, empoweredUntil}
    this._rRecastReadyUntil = 0; // 다리우스 R 처치 후 무료 재시전 창
    this._eHitCountThisCast = 0; // 가렌 E 회전 중 누적 타격 수
    this._sett = { punchSide: 'left', lastPunchAt: 0, qUsesRemaining: 0, grit: 0, gritEntries: [], rSeq: null, wShieldDecayPerSec: 0 };
    this._morde = { hitStacks: 0, auraExpiresAt: 0, dealtBank: 0, wShieldActiveUntil: 0,
      // R(죽음의 세계) 전용 상태 - 명세 28절 "R 종료 시 반드시 초기화해야 할
      // 상태 목록"에 대응. isInDeathRealm이 이 전투가 "R 내부"인지 아닌지를
      // 나타내는 단일 진실 공급원(single source of truth)이고, 나머지는 그
      // 상태에 딸린 부가 데이터다.
      isInDeathRealm: false, rTarget: null, rEndsAt: 0, rStolenArmor: 0, rStolenMr: 0,
    }; // dealtBank: W가 아직 보호막으로 전환되지 않은 축적된 피해량
    this._masteryi = { attackCount: 0, rActiveUntil: 0, alpha: null, wPause: null, pendingWAfterHit: false, wStartedAt: 0 };
    this._yasuo = { flow: 0, flowDistance: 0, qStacks: 0, qStackExpiresAt: 0, eStacks: 0, eStacksExpiresAt: 0, eTargetCooldowns: new Map(), windwall: null, rArmorBuffUntil: 0, rTarget: null, lastMovePosition: null, qMoveEntryPending: false, eDashStart: null, eDashEnd: null, eDashElapsed: 0, eDashDuration: 0, eDashTarget: null, eDashTargetKey: null, eDashDamageApplied: false, eDashStacksAtStart: 0, qTornadoTravel: null };
    // 요네 상태(_yone): qStacks(폭풍 구름 중첩), azakanaNext(다음 평타가
    // 아자카나의 검(마법 혼합) 차례인지 - 사냥꾼의 길 패시브), eActive(영혼해방
    // 정신체 상태 진행 정보), markedTargets(정신체 상태에서 쌓은 표식 Map).
    this._yone = {
      qStacks: 0, qStackExpiresAt: 0,
      azakanaNext: false,
      eSpirit: null, // { startedAt, duration, bodyPos, bodyQuat, dir, marks: Map }
      rTravel: null,
    };
    this._masteryiWHealTimer = null;
    // 칼바람 포탑 시스템(destroyTurret 참고) - 팀/골드 시스템이 따로
    // 없어 "아군 전원에게 지급"을 지금은 플레이어 자신의 누적치로 대신한다.
    this.gold = 0;
    // 아이템 시스템(item_system.js) - 장착한 아이템 슬롯 배열(최대 6칸, 실제
    // LoL 인벤토리와 동일). 각 슬롯은 {id, count, charges?} 형태다 - count는
    // 쌓이는 소비 아이템(체력 물약, 최대 5개까지 한 칸에 중첩)의 개수이고,
    // charges는 "다시 상점에 들르면 충전되는" 단일 아이템(충전형 물약)의
    // 남은 사용 횟수다(둘 다 없는 일반 스탯 아이템은 count:1 고정, 슬롯 자체를
    // 여러 개 차지하는 방식으로 중첩 없이 따로 보관된다). itemBonus*는
    // recomputeItemStats()(items 배열이 바뀔 때만 호출)가 채우는 합산값이고,
    // recomputeStats()/update()가 그 값을 읽어 실제 stats에 반영한다.
    // _itemLastDealtChampionDamageAt/_itemLastTookChampionDamageAt은 도란의
    // 반지(전투 중 마나 회복 증가)/도란의 방패(피격 후 회복) 같은 "최근 전투
    // 여부"가 필요한 아이템 패시브를 위한 범용 타임스탬프 - applyDamage()가
    // 채운다. _itemActiveHeals는 체력/충전형 물약이 사용된 뒤 진행 중인
    // 지속 회복(HoT) 목록 - 아이템을 팔거나 다 써도 이미 시작된 회복은
    // 실제 LoL처럼 끝까지 진행된다. _itemGloryStacks(암흑의 인장)/
    // _itemCullGold(수확의 낫)/_itemTearState(여신의 눈물)는 각 아이템
    // 전용 누적 상태 - item_system.js의 전용 함수들이 읽고 쓴다.
    this.items = [];
    this.itemBonusAD = 0; this.itemBonusAP = 0; this.itemBonusMaxHp = 0; this.itemBonusMana = 0;
    this.itemBonusArmor = 0; this.itemBonusMr = 0; this.itemBonusAttackSpeedPercent = 0;
    this.itemAllDamageVampPercent = 0; this.itemMinionBonusDamage = 0; this.itemOnHitHeal = 0;
    this._itemLastDealtChampionDamageAt = 0; this._itemLastTookChampionDamageAt = 0;
    this._itemActiveHeals = []; this._itemGloryStacks = 0; this._itemCullGold = 0; this._itemTearState = null;
    this._itemTick = {};
    this.itemBonusCritChance = 0; this.itemBonusAbilityHaste = 0;
    this.itemBonusHpRegenPercent = 0; this.itemBonusMpRegenPercent = 0;
    this.itemBonusMoveSpeedLol = 0; this.itemBonusMagicPenFlat = 0;
    this.itemBonusMoveSpeedPercent = 0; this.itemBonusArmorPenFlat = 0;
    this.itemSlowResistPercent = 0; this.itemTenacityPercent = 0; this._itemSlaughterStacks = 0;
    // 약간 신비한 신발 "조합해도(신발을 갈아 신어도) 이동속도 상승 유지" -
    // 영구 플래그(한번 세팅되면 챔피언을 바꾸거나 신발을 몇 번을 갈아
    // 신어도 계속 남는다). item_system.js의 _buyBoots()/recomputeItemStats() 참고.
    this._itemBootsExtraMoveSpeedLol = 0;
    // 트린켓(투명 와드) - 6칸 인벤토리와 별개인 전용 슬롯. 실제 LoL처럼
    // 골드로 사지 않고 기본 장착되어 있다(gold/items와 동일하게 챔피언을
    // 바꿔도 유지 - applyChampionData()는 건드리지 않는다). _placedWards는
    // 현재 설치돼 있는 와드 마커(메시+만료 시각) 목록.
    this.trinket = { id: 'stealthWard', charges: 2 };
    this._placedWards = [];
    // 신발 - "하나밖에 사지 못한다"는 원문 그대로 6칸 인벤토리와 별개인
    // 전용 슬롯 하나만 쓴다(트린켓과 동일한 구조). 기본값은 미착용(null).
    this.boots = null;
    // 서사급 아이템 1차분 전용 상태 - item_system.js의 전용 함수들이
    // 읽고 쓴다. itemBonusArmorPenMultiplier는 (1-관통%)의 곱으로 저장해서
    // 나중에 관통력 아이템이 여러 개가 돼도 실제 LoL처럼 곱연산으로
    // 정확히 누적되게 한다(합연산이 아님).
    this.itemGrievousOnHitPercent = 0; this.itemGrievousOnHitDurationSec = 0;
    this.itemPhysicalVampPercent = 0; this.itemBonusArmorPenMultiplier = 1; this.itemManaOnDamagePercent = 0;
    this._itemSheenArmed = false; this._itemSheenReadyAt = 0; this._itemActiveCooldownUntil = {};
    this._itemActiveElixir = null; // 영약(강철/마법/분노) 상호 배타적 상태
    // 전설급 아이템 2차분(삼위일체~지배자의 피갑옷) 전용 상태.
    // itemSpellDamageAmpPercent(쇼진의창 "집중된 의지")는 calculateDamage()
    // 맨 끝에서 최종 피해에 곱해진다. _itemShieldExpiresAt(월식/멜모셔스의
    // 아귀의 보호막)은 아이템이 건 shield가 시간이 지나면 자연 소멸하게
    // 한다(맞아서 깎이는 것과 별개). itemDynamicBonusAD(지배자의 피갑옷
    // "폭정"/"응징")는 체력 비율에 따라 매 프레임 바뀌는 값이라
    // recomputeItemStats()가 아니라 itemSystemTick()에서 매 프레임 갱신한다.
    this.itemSpellDamageAmpPercent = 0;
    this._itemShieldExpiresAt = 0;
    this.itemDynamicBonusAD = 0;
    // 전설급 아이템 4차분(정수약탈자~도미닉 경의 인사) 전용 상태.
    // _itemTempAttackRangeBonusLol/ExpiresAt(마법광학 장치 C44 "비전
    // 조준"/고속연사포 "저격수")은 character_controller.js의 update()가
    // 매 프레임 stats.attackRange에 더해 반영한다.
    this._itemTempAttackRangeBonusLol = 0;
    this._itemTempAttackRangeExpiresAt = 0;
    this._attackRangeBaseWorld = 0;
    // 전설급 아이템 5차분(필멸자의 운명~세릴다의 원한) 전용 상태. 전부
    // "지속시간이 있는 임시 버프"라 영구 스탯(itemBonus*)과 분리된 별도
    // 필드로 둔다(recomputeStats()가 매번 다시 더함, itemSystemTick()이
    // 만료되면 0으로 되돌리고 recomputeStats()를 다시 호출).
    this.itemTempADBonus = 0;
    this.itemTempArmorBonus = 0;
    this.itemTempMrBonus = 0;
    this.itemTempArmorPenFlat = 0;
    this.itemTempArmorPenPercent = 0;
    this.itemTempMagicPenPercent = 0;
    this.itemBonusCritDamagePercent = 0;
    // 모데카이저 R "죽음의 세계" - 모든 유닛(더미/포탑/우물 포함)의
    // 기본값은 'main'(메인 월드)이다. canRealmInteract()가 이 필드가
    // 아예 없는 기존 유닛도 'main'으로 취급하므로 필수는 아니지만,
    // 플레이어 자신은 명시적으로 넣어 가독성을 높인다.
    this.realmId = 'main';
    // Alpha Strike(Q) 비대상 상태 - 문서 6절: "character.visible=false" 같은
    // 시각적 트릭이 아니라, 모든 피해/타겟팅 시스템이 실제로 확인하는 플래그.
    // takeDamage()가 최우선으로 확인하고, findEnemiesInRadius가 도는
    // getAllEnemyUnits()는 애초에 플레이어를 포함하지 않는 이 데모 구조상
    // AI가 Yi를 절대 타겟팅하지 않지만, 이후 AI가 플레이어를 공격하는
    // 기능이 추가돼도 자동으로 안전하도록 플래그 자체는 항상 정확히 유지한다.
    this.isUntargetable = false;
    this._chogath = { predationStacks: 0, eChargesRemaining: 0 };
    this._dariusWArmed = false;
    this._leesin = { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0, eMarkHits: [], eMarkExpiresAt: 0, passiveHitsLeft: 0 };
    this._leesinAnimTimer = null;
    this._nilah = {
      qEmpoweredUntil: 0, qWaveLockUntil: 0,
      qArmorPen: 0, qLifeSteal: 0,
      eCharges: 2, eRechargeAt: [], eDash: null,
      rSeq: null, qDuringEDashFired: false, pendingEWave: null,
      shieldUntil: 0, shieldKind: null, wCastAt: 0, attackVariantIndex: { attack1: 0, attack2: 0 }, qVariantIndex: 0,
      allyStates: new Map(),
    };
    this._renekton = {
      rage: 0, lastCombatAt: performance.now(), nextRageDecayAt: 0,
      wArmed: false, wEmpowered: false, wTarget: null, wSeq: null,
      eSecondReadyUntil: 0, eFirstHit: false,
      rActiveUntil: 0, rAuraAccum: 0, rRageAccum: 0, rBonusMaxHp: 0,
      rActive: false, rCastStartedAt: 0, rAuraVfx: null,
      qRageGenerated: 0,
    };
  }

  /** 기획안 CHAMPION_DATA를 이 컨트롤러에 연결하고 레벨 기준 스탯을 재계산한다.
   *  championId가 CHAMPION_DATA에 없는 챔피언은 기존 기본 스탯을 그대로 유지한다
   *  (기존 기능을 망가뜨리지 않는다 - 섹션 16). */
  applyChampionData(championId) {
    // 챔피언 교체/재선택 중 이전 레넥톤의 지속 R 오라가 남지 않도록 정리한다.
    if (this._renekton?.rAuraVfx && typeof vfx !== 'undefined') {
      vfx.stopRenektonRAura(this._renekton.rAuraVfx);
      this._renekton.rAuraVfx = null;
    }
    // 버그 수정(공통 버그 검사 4/11/12절 "챔피언 변경 후 이전 챔피언의
    // 상태효과/좌표/제한이 남는 문제"): 지금까지 statusEffects/shield는
    // 생성자에서만 초기화됐고 이 함수(챔피언 교체 시 호출)에는 없었다 -
    // 예를 들어 세트 W로 보호막을 건 상태에서 다른 챔피언으로 바꾸면 그
    // 보호막이 새 챔피언에게 그대로 남았다. 새로운 초기화 시스템을 만들지
    // 않고, 생성자와 동일한 필드를 여기서도 그대로 재사용해서 지운다.
    // 그보다 먼저, 세트 R 시퀀스나 모데카이저 죽음의 세계가 진행 중인
    // 채로 챔피언을 바꾸면 잡힌 대상(isGrabbedBySett)이나 격리된 대상
    // (realmId)이 원래 상태로 절대 복귀하지 못하고 영구히 남는다(12절의
    // 정확한 원인) - 기존에 이미 있는 정상 종료 함수(_settEndR/
    // _mordeEndDeathRealm)를 그대로 호출해서 그 정리 로직을 재사용한다.
    if (this._sett?.rSeq) {
      if (this.sequencePlayer?.isPlaying) this.sequencePlayer.cancel();
      this._settEndR(this._sett.rSeq, true);
    }
    if (this._morde?.isInDeathRealm) this._mordeEndDeathRealm('champion-switch');
    // 버그 수정(위와 동일 - "챔피언 교체 후 이전 챔피언 투사체" 문제):
    // 이즈리얼/벡스 등 공용 ProjectileSystem을 쓰는 챔피언의 투사체가
    // 교체 후에도 계속 날아가 새 챔피언의 championId로 잘못된 훅을
    // 트리거하지 않도록, 교체 시점에 플레이어 투사체를 전부 정리한다
    // (포탑 투사체는 clear() 내부에서 자동으로 보존됨).
    if (typeof projectiles !== 'undefined' && typeof projectiles.clear === 'function') projectiles.clear();
    this._clearActionTimers();
    this.statusEffects = [];
    this.shield = 0;
    this.currentTarget = null;
    this.pendingMove = null; this.pendingCast = null;
    this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
    if (typeof targetRing !== 'undefined') targetRing.clear();
    for (const k of Object.keys(this.cooldowns || {})) this.cooldowns[k] = 0; // 요청 5절 "쿨다운 음수 방지"와 같은 취지 - 이전 챔피언 쿨다운이 새 챔피언에 유출되지 않게 한다
    // 챔피언 전용 전투 상태도 교체 순간 완전히 초기화한다.
    // 이전에는 Darius 출혈 Map, Lee Sin Q 표식, Sett Q/W/R 상태, Nilah E/R 상태,
    // Yasuo/마스터 이/레넥톤의 임시 상태가 남아 다음 챔피언에 새어 나올 수 있었다.
    this._darius = { stacksOnTarget: new Map() };
    this._dariusWArmed = false;
    this._leesin = { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0, eMarkHits: [], eMarkExpiresAt: 0, passiveHitsLeft: 0 };
    if (this._leesinAnimTimer) { clearTimeout(this._leesinAnimTimer); this._leesinAnimTimer = null; }
    this._sett = { punchSide: 'left', lastPunchAt: 0, qUsesRemaining: 0, grit: 0, gritEntries: [], rSeq: null, wShieldDecayPerSec: 0 };
    this._nilah = { qEmpoweredUntil: 0, qWaveLockUntil: 0, qArmorPen: 0, qLifeSteal: 0, eCharges: 2, eRechargeAt: [], eDash: null, rSeq: null, qDuringEDashFired: false, pendingEWave: null, shieldUntil: 0, shieldKind: null, wCastAt: 0, attackVariantIndex: { attack1: 0, attack2: 0 }, qVariantIndex: 0, allyStates: new Map() };
    this._renekton = { rage: 0, lastCombatAt: performance.now(), nextRageDecayAt: 0, wArmed: false, wEmpowered: false, wTarget: null, wSeq: null, eSecondReadyUntil: 0, eFirstHit: false, rActiveUntil: 0, rAuraAccum: 0, rRageAccum: 0, rBonusMaxHp: 0, rActive: false, rCastStartedAt: 0, rAuraVfx: null, qRageGenerated: 0 };
    this._masteryi = { attackCount: 0, rActiveUntil: 0, alpha: null, wPause: null, pendingWAfterHit: false, wStartedAt: 0 };
    this._chogath = { predationStacks: 0, eChargesRemaining: 0 };
    this._yasuo = { flow: 0, flowDistance: 0, qStacks: 0, qStackExpiresAt: 0, eStacks: 0, eStacksExpiresAt: 0, eTargetCooldowns: new Map(), windwall: null, rArmorBuffUntil: 0, rTarget: null, lastMovePosition: null, qMoveEntryPending: false, eDashStart: null, eDashEnd: null, eDashElapsed: 0, eDashDuration: 0, eDashTarget: null, eDashTargetKey: null, eDashDamageApplied: false, eDashStacksAtStart: 0, qTornadoTravel: null };
    if (this._yone && this._yone.eSpirit && typeof this._yoneCleanupSpiritVisuals === 'function') this._yoneCleanupSpiritVisuals();
    this._yone = { qStacks: 0, qStackExpiresAt: 0, azakanaNext: false, eSpirit: null, rTravel: null };
    this._ezreal = { markTarget: null, markExpiresAt: 0, rTravel: null };
    // 챔피언 교체 시 이전 아리의 여우불/Q 구슬/E 투사체 메시가 씬에 남지
    // 않게 먼저 정리한다.
    // 버그 수정(리소스 누수): 예전엔 Q 오브를 scene.remove()만 하고
    // material.dispose()를 하지 않는 경로가 남아 있었다. 정리 로직을
    // 여기저기 복붙하는 대신 _ahriEndQTravel()/_ahriEndETravel() 하나로
    // 통일해서(Q/E 둘 다 scene.remove + material.dispose를 항상 함께
    // 수행) 앞으로 정리 지점이 늘어나도 절대 누락되지 않게 한다.
    if (this._ahri) {
      if (this._ahri.foxfires && this._ahri.foxfires.length && typeof this._ahriClearFoxfires === 'function') this._ahriClearFoxfires();
      if (this._ahri.qTravel && typeof this._ahriEndQTravel === 'function') this._ahriEndQTravel();
      if (this._ahri.eTravel && typeof this._ahriEndETravel === 'function') this._ahriEndETravel();
    }
    this._ahri = { passiveStacks: 0, qTravel: null, eTravel: null, foxfires: [], rCharges: 0, rReadyUntil: 0, rDash: null };
    // 바루스도 교체 순간 완전히 초기화한다(위 _clearActionTimers()가 이미
    // qCharge 자동 발사 타이머/R 확산 interval을 정리했으므로 여기서는
    // 데이터 객체만 새로 만들면 된다).
    this._varus = { qCharge: null, lv: { target: null, rampStartAt: 0, lastHitAt: 0 } };
    // 애쉬도 교체 순간 완전히 초기화한다 - 다른 챔피언으로 바뀌었는데
    // 집중 스택/궁사의 집중 버프/진행 중이던 W·E·R 지연 상태가 남아있으면
    // 안 된다(바루스/아리와 동일한 원칙).
    this._ashe = {
      focusStacks: 0, focusExpiresAt: 0,
      qActiveUntil: 0, flurryPending: false,
      wPending: null, ePending: null, rPending: null, rTravel: null,
    };
    this._dashState = null;
    this._rRecastReadyUntil = 0;
    this.bonusAD = 0;
    this.bonusMaxHp = 0;
    this.armorPenPercent = 0;
    this.championId = championId || null;
    if (!this.championId || !CHAMPION_DATA[this.championId]) return;
    this.champLevel = 1;
    this.currentExp = 0; // 요청("LoL 경험치 및 레벨 시스템") - 챔피언 교체 시 경험치도 함께 초기화
    this.skillPoints = 0;
    this.skillLevels = { Q: 1, W: 1, E: 1, R: 1 }; // 기본 1랭크로 즉시 테스트 가능(위 생성자 주석 참고)
    if (this.championId === 'darius') {
      const eData = CHAMPION_DATA.darius.E;
      this.armorPenPercent = skillVal(eData.armorPenPercentByLevel, this.skillLevels.E || 1) / 100;
    }
    this.recomputeStats();
    if (this.championId === 'renekton') {
      this._renekton.rage = 0; this._renekton.lastCombatAt = performance.now(); this._renekton.nextRageDecayAt = 0;
      this._renekton.wArmed = false; this._renekton.wEmpowered = false; this._renekton.wTarget = null; this._renekton.wSeq = null;
      this._renekton.eSecondReadyUntil = 0; this._renekton.eFirstHit = false; this._renekton.rActiveUntil = 0; this._renekton.rAuraAccum = 0; this._renekton.rRageAccum = 0; this._renekton.rBonusMaxHp = 0; this._renekton.rActive = false; this._renekton.rAuraVfx = null; this._renekton.qRageGenerated = 0;
      this.bonusMaxHp = 0;
      this.mp = 0;
      this.playFirstAvailable(['Idle1'], { loop: THREE.LoopRepeat, fade: 0 });
    }
    if (this.championId === 'yasuo') { this.stats.critChance = 1; this.stats.critMultiplier = this._champData().passive.critDamage; this._yasuo.flow = 0; this._yasuo.flowDistance = 0; this._yasuo.qStacks = 0; this._yasuo.qStackExpiresAt = 0; this._yasuo.eStacks = 0; this._yasuo.eStacksExpiresAt = 0; this._yasuo.eTargetCooldowns.clear(); this._yasuo.windwall = null; this._yasuo.rArmorBuffUntil = 0; this._yasuo.rTarget = null; this._yasuo.lastMovePosition = this.root.position.clone(); this._yasuo.qMoveEntryPending = false; this._yasuo.eDashStart = null; this._yasuo.eDashEnd = null; this._yasuo.eDashElapsed = 0; this._yasuo.eDashDuration = 0; this._yasuo.eDashTarget = null; this._yasuo.eDashTargetKey = null; this._yasuo.eDashDamageApplied = false; this._yasuo.qTornadoTravel = null; this.mp = 0; }
    // 요네: 사냥꾼의 길(치명타 확률 2배 + 초과분 AD 환산 + 치명타 피해 감소)은
    // 야스오와 달리 이동 누적형 Flow 보호막이 없으므로 그 부분만 제외하고
    // 크리티컬 관련 스탯만 매 tick(_yoneTick)에서 계속 갱신한다. 여기서는
    // 챔피언 교체 시 상태 초기화만 담당.
    if (this.championId === 'yone') { this.stats.critChance = 1; this.stats.critMultiplier = this._champData().passive.critDamage; this._yone.qStacks = 0; this._yone.qStackExpiresAt = 0; this._yone.azakanaNext = false; this._yone.eSpirit = null; this._yone.rTravel = null; this.mp = 0; }
    if (this.championId === 'nilah') {
      this._nilah.qEmpoweredUntil = 0; this._nilah.qWaveLockUntil = 0; this._nilah.qDuringEDashFired = false; this._nilah.pendingEWave = null; this._nilah.wCastAt = 0;
      this._nilah.eCharges = 2; this._nilah.eRechargeAt = []; this._nilah.eDash = null; this._nilah.rSeq = null;
      this._nilah.shieldUntil = 0; this._nilah.shieldKind = null; this._nilah.allyStates = new Map();
      this.armorPenPercent = 0;
      // 데이터 수정(실제 bin 확인): 충돌 반경은 원래 "챔피언별 실제 수치가
      // 없어서" 전 챔피언에 균일값(BASE_UNIT*0.24, 약 24 LoL 단위 상당)을
      // 적용해뒀다. 닐라는 실제 pathfindingCollisionRadius=32(LoL 단위)가
      // 확인됐으므로 닐라만 실제 값으로 덮어쓴다 - 다른 챔피언은 여전히
      // 실제 수치가 없으니 균일값을 유지한다. selectionRadius(클릭 판정
      // 크기)도 실제 값(120)이 확인됐다 - 충돌 반경의 1.3배 근사식(약 42
      // 상당)보다 실제로 훨씬 커서(모델 폭에 맞춘 값), 근사식 대신 실제
      // 값을 쓴다.
      this.collisionRadius = lolRangeToWorld(32);
      this.selectionRadius = lolRangeToWorld(120);
    }
    this.hp = this.maxHp; this.mp = this.maxMp;
    if (this.championId === 'yasuo') this.mp = 0;
    updateExpUI(this); // 요청 8: 챔피언 교체 시 경험치 게이지 UI도 즉시 초기화
  }

  /** 레벨/성장 수치를 반영해 this.stats/maxHp/maxMp를 다시 계산한다.
   *  전투 중 버프(방어구 관통/보너스 AD 등)는 여기서 매번 다시 얹는다. */
  recomputeStats() {
    const base = this.championId && computeChampionStats(this.championId, this.champLevel);
    if (base) {
      const hpPct = this.maxHp ? this.hp / this.maxHp : 1; // 최대체력이 바뀌어도(초가스 R 포식 등) 현재 비율을 유지한 채 재계산
      // 아이템 시스템(item_system.js) 연동 - itemBonus* 필드는 recomputeItemStats()가
      // this.items 배열(장착한 아이템 id 목록)을 합산해서 채워두는 값이다.
      // 기존 bonusAD/bonusArmor/bonusMr/bonusMaxHp(챔피언 전용 임시 버프 필드 -
      // 다리우스 Q 과다출혈, 모데카이저 R 보호막 등)와는 완전히 분리된 별도
      // 필드라서, 챔피언을 바꾸거나 임시 버프가 만료될 때 저 필드들을 0으로
      // 되돌려도 아이템으로 산 영구 스탯은 전혀 영향을 받지 않는다.
      this.maxHp = base.maxHp + (this.bonusMaxHp || 0) + (this.itemBonusMaxHp || 0);
      this.maxMp = base.maxMp + (this.itemBonusMana || 0);
      this.hpRegen = base.hpRegen; this.mpRegen = base.mpRegen;
      this.stats.attackDamage = base.attackDamage + (this.bonusAD || 0) + (this.itemBonusAD || 0) + (this.itemDynamicBonusAD || 0) + (this.itemTempADBonus || 0);
      // 어둠불꽃횃불(어둠불꽃)/(향후) 라바돈의 죽음모자 - "총 주문력 N%
      // 증가" 계열은 itemBonusAP 합연산 전부가 끝난 뒤 곱하는 배율이다.
      this.stats.abilityPower = (this.itemBonusAP || 0) * (1 + (this.itemTotalApMultiplierBonus || 0));
      this.stats.baseAttackSpeed = base.baseAttackSpeed;
      this.stats.armor = base.armor + (this.bonusArmor || 0) + (this.itemBonusArmor || 0) + (this.itemTempArmorBonus || 0);
      this.stats.baseArmor = base.armor;
      this.stats.magicResist = base.magicResist + (this.bonusMr || 0) + (this.itemBonusMr || 0) + (this.itemTempMrBonus || 0);
      // 민첩성의 망토(치명타확률 15%) 등 - 이 프로젝트의 기본 챔피언 스탯에는
      // 애초에 크리티컬 확률이 없고(요네/야스오만 자체 패시브로 매 프레임
      // stats.critChance를 1로 강제 재설정 - _yoneTick/_yasuoTick 참고),
      // 아이템 없이는 항상 0%였다. 여기서 매번 덮어써도 요네/야스오는 같은
      // 프레임 또는 그다음 프레임에 자신의 틱 함수가 다시 1로 되돌리므로
      // 문제없다(최대 한 프레임짜리 눈에 띄지 않는 과도 상태).
      this.stats.critChance = (this.itemBonusCritChance || 0);
      this.stats.attackRange = base.attackRange;
      // 마법광학 장치 C44(비전 조준)/고속연사포(저격수)의 임시 사거리
      // 보너스가 매 프레임(update()) 덧씌우는 "기준값"을 여기 따로
      // 저장해둔다 - update()가 매번 base.attackRange를 다시 구할 수
      // 없으므로(recomputeStats()는 구매/판매 등 이벤트성으로만 호출됨).
      this._attackRangeBaseWorld = base.attackRange;
      // 신발(이동속도) - item_data.js에 LoL 원본 단위로 저장해뒀으므로
      // base.baseMoveSpeed와 동일하게 여기서 한 번만 lolRangeToWorld()로
      // 변환한다(기본 이동속도 자체가 이미 그 변환을 거친 값이라 단위를 맞춤).
      this.stats.baseMoveSpeed = base.baseMoveSpeed + lolRangeToWorld(this.itemBonusMoveSpeedLol || 0);
      this.hp = Math.min(this.hp || this.maxHp * hpPct, this.maxHp);
      this.mp = Math.min(this.mp || this.maxMp, this.maxMp);
    }
    updateBars(this);
  }

  levelUp() {
    if (this.champLevel >= 18) return;
    this.champLevel++;
    // 요청 1: "레벨업 시 스킬 포인트를 1개 획득한다" - 수동 레벨업 버튼과
    // EXP 자동 레벨업 둘 다 이 메서드를 거치므로 한 곳만 고치면 된다.
    this.skillPoints = (this.skillPoints || 0) + 1;
    const hpPct = this.maxHp ? this.hp / this.maxHp : 1;
    const mpPct = this.maxMp ? this.mp / this.maxMp : 1;
    this.recomputeStats();
    this.hp = Math.max(1, Math.round(this.maxHp * hpPct));
    this.mp = Math.round(this.maxMp * mpPct);
    updateBars(this);
    if (typeof showLevelUpEffect === 'function') showLevelUpEffect(this); // 요청 8: 레벨업 시각 효과
    if (typeof updateExpUI === 'function') updateExpUI(this);
    // 사라진 양피지(깨우치기)/영겁의지팡이(불멸의 시간으로 인한 레벨업도
    // 동일한 경로) - "레벨 업하면" 트리거를 이 한 지점에서 공용으로 처리한다.
    if (typeof itemOnLevelUp === 'function') itemOnLevelUp(this);
  }
  levelUpSkill(slot) {
    const cap = slot === 'R' ? 3 : 5;
    const current = this.skillLevels[slot] || 0;
    if (current >= cap) return false;
    // 요청 1: "R은 레벨 6/11/16에서만 랭크업 가능" - 1랭크는 위 생성자
    // 주석대로 이미 미리 지급돼 있으므로(테스트 편의), 이 게이트는 2/3
    // 랭크(레벨 11/16)에만 실질적으로 걸린다.
    if (slot === 'R') {
      const requiredLevel = R_RANK_LEVEL_GATE[current + 1];
      if (requiredLevel && this.champLevel < requiredLevel) {
        showSkillToast(`R은 레벨 ${requiredLevel}부터 ${current + 1}랭크를 올릴 수 있습니다`);
        return false;
      }
    }
    // 요청 1/9: 스킬 포인트를 소모해야 랭크업된다.
    if ((this.skillPoints || 0) < 1) {
      showSkillToast('스킬 포인트가 부족합니다');
      return false;
    }
    this.skillPoints--;
    this.skillLevels[slot] = current + 1;
    if (typeof updateExpUI === 'function') updateExpUI(this);
    return true;
  }

  // ---- 서브 상태(named subState) ----
  setSubState(name, durationSec) { this.subStates[name] = performance.now() + Math.max(0, durationSec) * 1000; }
  clearSubState(name) { delete this.subStates[name]; }
  isSubStateActive(name) { return (this.subStates[name] || 0) > performance.now(); }

  // ---- 기본 공격 오버라이드(named attack override, priority 기반) ----
  // id가 같으면 갱신(중복 등록 방지). oneShot이면 uses(기본 1)에 지정된
  // 횟수만큼 평타가 나간 뒤 자동으로 제거된다(가렌/다리우스: 1회, 세트
  // Q: 2연속 강화이므로 2회). sequenceClips가 있으면 사용될 때마다
  // useIndex를 하나씩 진행시켜 서로 다른 클립을 순서대로 내보낸다(세트
  // Q의 Spell1_A → Spell1_B). oneShot이 false면 durationSec만큼 계속
  // 유지된다(노틸러스 W처럼 "지속시간 동안" 타입).
  registerAttackOverride({ id, clips, sequenceClips = null, priority = 0, oneShot = true, uses = 1, durationSec = null, beatsCrit = false }) {
    if (!id || !Array.isArray(clips) || !clips.length) return;
    this.attackOverrides = this.attackOverrides.filter((o) => o.id !== id);
    const expiresAt = typeof durationSec === 'number' ? performance.now() + durationSec * 1000 : null;
    this.attackOverrides.push({ id, clips, sequenceClips, priority, oneShot, usesRemaining: oneShot ? Math.max(1, uses) : null, useIndex: 0, expiresAt, beatsCrit });
  }
  clearAttackOverride(id) { this.attackOverrides = this.attackOverrides.filter((o) => o.id !== id); }
  // 여러 소스(패시브/W 등)가 동시에 활성 상태여도 priority가 가장 높은
  // 하나만 채택한다 -- "우선순위 규칙이 반드시 필요"하다는 요청사항 반영.
  _pickAttackOverride() {
    const now = performance.now();
    this.attackOverrides = this.attackOverrides.filter((o) => o.expiresAt == null || o.expiresAt > now);
    if (!this.attackOverrides.length) return null;
    return this.attackOverrides.reduce((best, o) => (!best || o.priority > best.priority) ? o : best, null);
  }

  // 지금 로드된 챔피언의 championAbilityDatabase 항목(있으면). 서브 상태/
  // 평타 오버라이드처럼 "이 챔피언만의 데이터"가 필요한 곳에서 사용 --
  // 챔피언 이름을 코드에 직접 적지 않고 이 항목을 통해서만 참조한다.
  _championAbilityDbEntry() {
    const id = this.abilityResolver?.championId;
    return id ? championAbilityDatabase[id] : null;
  }

  // 요청(모데카이저형): W 서브 상태를 켠다. 챔피언 DB에 W.attackOverrideAnimationNames
  // 가 정의돼 있으면 지속시간 동안 평타도 함께 대체한다(등록 안 돼 있으면
  // 서브 상태만 켜지고 평타는 그대로 -- 다른 챔피언 데이터에 영향 없음).
  _activateWSubState(durationSec) {
    this.setSubState('W', durationSec);
    this._activateAttackOverrideFromDb('W', durationSec);

    // 업데이트(W 전용 상세 문서 22~25절 "경우 3 - W 자연 종료"): duration이
    // 그냥 흘러서 끝나는 경우도 재시전(W2)과 마찬가지로 즉시 Idle/Run으로
    // 스냅하지 않고 종료 전용 클립(Exit_Full/Exit_Upper)을 한 번 거친다.
    // 게임로직 TODO: 실제로는 "보호막이 얼마나 남았는가"에 따라 자연 종료
    // 시점이 달라지고(0으로 소진되면 즉시 종료 등), 여기서처럼 durationSec
    // 타이머 하나로 고정하면 안 된다 - 이 데모는 애니메이션 레이어만 다루므로
    // "정해진 지속시간이 끝나면 자연 종료"로 단순화했다. 실제 구현 시에는
    // 보호막 잔량 감소 로직이 0에 도달하는 이벤트에서 이 종료 연출을
    // 트리거해야 한다.
    const db = this._championAbilityDbEntry();
    const naturalExit = db && db.W && db.W.naturalExitClips;
    clearTimeout(this._wNaturalExitTimer);
    if (naturalExit) {
      this._wNaturalExitTimer = setTimeout(() => {
        // 그 사이 재시전(W2)으로 이미 소비됐거나(그쪽이 이미 자기 exit 클립을
        // 재생했으므로 여기선 아무것도 하지 않음), 다른 행동(Q/E/R/평타)이
        // 진행 중이면(그 행동이 끝날 때 자기 exitClips/subState 재확인 로직이
        // 알아서 W 상태를 최신으로 반영하므로) 이 자동 종료 연출은 건너뛴다.
        if (this.isSubStateActive('W')) return;
        if (this.currentActionKey) return;
        if (this.state === STATE.DEAD || this.state === STATE.RESPAWN || this.state === STATE.RECALL) return;
        const moving = !!this.targetPos;
        const clipName = moving ? (naturalExit.move || naturalExit.idle) : (naturalExit.idle || naturalExit.move);
        const clip = clipName ? this.findAnimation(clipName) : null;
        if (!clip) { this._resumeAfterAction(); return; }
        this.crossFadeTo([clipName], { loop: THREE.LoopOnce, fade: 0.15, clampWhenFinished: true });
        // 버그 수정: 이전에는 여기서 _returnToLocomotion()을 직접 불러서, 이
        // 종료 연출이 재생되는 동안 플레이어가 새로 내린 이동 명령
        // (this.pendingMove)이 그대로 버려졌다 - moveTo()가 STARTUP/ACTIVE
        // 단계에서는 즉시 커밋하지 않고 pendingMove에 저장만 해두는데, 그걸
        // 소비하는 지점이 없었던 것. _resumeAfterAction()을 쓰면 대기 중이던
        // 이동 명령이 있으면 그걸 우선 커밋하고, 없으면 기존과 동일하게
        // _returnToLocomotion()으로 떨어진다(문서 33절: "게임 상태와 애니메이션
        // 상태를 분리" 원칙과도 일치).
        const t = setTimeout(() => this._resumeAfterAction(), Math.max(0, clip.duration - 0.05) * 1000);
        this._actionTimers.push(t);
      }, Math.max(0, durationSec) * 1000);
      this._pendingTimeouts.push(this._wNaturalExitTimer);
    }
  }

  // 요청(다리우스/가렌/세트/노틸러스 공통 - 실제 PC 롤 자료 반영): 챔피언 DB의
  // 임의 슬롯(Q/W)에 attackOverrideAnimationNames가 등록돼 있으면 평타를
  // 그 클립으로 대체한다. attackOverrideMode('oneShot' 기본값 - 다리우스 W
  // "다음 평타 하나", 가렌 Q "다음 평타 하나", 세트 Q "다음 2회 평타" 전부
  // 이 모드) vs 'duration'(노틸러스 W "지속시간 동안 계속") 두 가지를 DB가
  // 직접 지정한다 - 예전에는 이 함수 하나가 항상 oneShot:false로 등록해서
  // 다리우스 W가 "다음 평타 하나만"이 아니라 지속시간 내내 대체되는 버그가
  // 있었다(문서로 확인된 정확한 스킬 구조 반영해서 수정).
  _activateAttackOverrideFromDb(roleLetter, durationSec) {
    const entry = this._championAbilityDbEntry()?.[roleLetter];
    const names = entry?.attackOverrideAnimationNames;
    if (!Array.isArray(names) || !names.length) return;
    const mode = entry.attackOverrideMode || 'duration';
    this.registerAttackOverride({
      id: roleLetter,
      clips: names,
      sequenceClips: entry.attackOverrideSequence || null,
      priority: 10,
      oneShot: mode === 'oneShot',
      uses: entry.attackOverrideUses || 1,
      durationSec: mode === 'duration' ? durationSec : null,
    });
  }

  // 요청(모데카이저형 한계 해결): 서브 상태(예: W 활성 중)에 따라 Idle/Run
  // 자체가 다른 클립으로 통째로 바뀌는 챔피언을 위한 범용 조회. Q/W/E/R
  // 아무 슬롯이나 championAbilityDatabase에 substateLocomotion:{idleClips,
  // moveClips}를 등록해두면, 그 슬롯 이름의 서브 상태가 켜져 있는 동안
  // Idle/Run 전체가 자동으로 그 클립으로 교체된다 - 특정 챔피언 이름을
  // 하드코딩하지 않는다.
  _locomotionSubStateClips(kind) {
    const db = this._championAbilityDbEntry();
    if (!db) return null;
    for (const roleKey of ['Q', 'W', 'E', 'R']) {
      const loc = db[roleKey] && db[roleKey].substateLocomotion;
      if (loc && loc[kind] && loc[kind].length && this.isSubStateActive(roleKey)) return loc[kind];
    }
    return null;
  }
  // 요청(가렌 E/다리우스 Q "채널링/강제 시퀀스 중 실제 이동 가능"): 이 두
  // 함수는 이제 각각 두 가지 특수 상황도 함께 인식한다.
  //  1) eChannel(가렌 E류 방향 채널링): 정지 상태(_idleClips)에서는 항상
  //     "front" 클립을 최우선 후보로 돌려준다 - 이동을 멈추면 방향과 무관하게
  //     정면 스핀 포즈로 복귀해야 하기 때문이다. 이동 상태(_moveClips)에서는
  //     "지금 실제로 재생 중인 방향 클립"을 최우선 후보로 돌려줘서,
  //     updateMovement(dt)의 자동 보정("MOVE인데 지금 클립이 목록에 없으면
  //     즉시 이동 루프로 강제 전환")이 방향 스핀 클립을 잘라내지 않게 한다.
  //  2) qChain(다리우스 Q류 강제 다단계 시퀀스): 지금 재생 중인 클립을 그대로
  //     "유효한" 클립으로 인정해서, 이동 중 목적지에 도착했을 때 updateMovement
  //     의 도착 처리(playFirstAvailable(this._idleClips()))가 강제 시퀀스를
  //     끊고 엉뚱한 Idle로 스냅하지 않게 한다 - 시퀀스 자체의 진행/종료는
  //     always AnimationSequencePlayer가 그대로 담당한다.
  // 두 경우 모두 updateMovement() 자체는 건드리지 않고, 그 함수가 참조하는
  // 이 데이터 소스만 정확하게 넓히는 기존 원칙을 그대로 따른다.
  _idleClips() {
    if (this.currentActionKey === 'eChannel' && this._eChannelCfg) {
      const front = this._eChannelCfg.clips.front;
      if (front) return [front, ...Object.values(this._eChannelCfg.clips)];
    }
    if (this.currentActionKey === 'qChain' && this.currentClipKey) return [this.currentClipKey];
    return this._locomotionSubStateClips('idleClips') || this.actionData.idle.clips;
  }
  // 업데이트(전환 클립 보호): updateMovement(dt)는 "MOVE 상태인데 지금 재생
  // 중인 클립이 _moveClips() 목록에 없으면 즉시 이동 루프로 강제 전환"하는
  // 자동 보정 로직을 갖고 있다(요청 21b, 이 함수는 건드리지 않는다). 문제는
  // Idle→Walk 전환 클립이나 W Entry Chain의 이동 진입 클립처럼 "MOVE 상태를
  // 유지한 채로 한 번만 재생하고 지나가는" 클립들은 원래 목록에 없어서, 이
  // 자동 보정이 프레임 하나 만에 그 전환 클립을 잘라내고 곧장 이동 루프로
  // 스냅해버렸다. updateMovement() 자체에 예외를 추가하는 대신(요청사항:
  // "땜질 금지"), 그 함수가 참조하는 데이터 소스인 이 함수를 정확하게
  // 넓힌다 - 지금 그런 전환 클립이 재생 중이면(_transientMoveClipNames)
  // 그 이름도 "유효한 이동 클립"으로 함께 포함시켜서, updateMovement의
  // 기존 판정 로직이 아무 수정 없이도 올바르게 "이미 알맞은 클립을 재생
  // 중"이라고 인식하게 만든다.
  _moveClips() {
    // 야스오: 기본 이동은 항상 Run1_Raw. Q 직후의 Run1_IN_Raw는
    // _yasuoPlayPostQMoveEntry()가 1회성으로 재생하는 동안만 transient로
    // 등록되므로, 일반 이동 로직이 다시 IN 모션을 반복하지 않는다.
    if (this.championId === 'yasuo') {
      return ['Run1_Raw'];
    }
    if (this.currentActionKey === 'eChannel' && this._eChannelCfg) {
      const current = this._eChannelCfg.clips[this._eChannelDir] || this._eChannelCfg.clips.front;
      const list = current ? [current, ...Object.values(this._eChannelCfg.clips)] : Object.values(this._eChannelCfg.clips);
      return this._transientMoveClipNames && this._transientMoveClipNames.size ? [...this._transientMoveClipNames, ...list] : list;
    }
    if (this.currentActionKey === 'qChain' && this.currentClipKey) {
      return this._transientMoveClipNames && this._transientMoveClipNames.size
        ? [this.currentClipKey, ...this._transientMoveClipNames]
        : [this.currentClipKey];
    }
    // 버그 수정("R 중 이동이 부드럽지 않다"): Spell4_Run을 실제 GLB에서
    // 확인해보니 다리 관절 채널 수가 Spell4_Idle(정지 상태)과 완전히
    // 동일했다(18개) - 진짜 걷기 클립(Run.anm, 30개)과 달리 사실상 다리를
    // 걷는 것처럼 움직이지 않는 클립이었다. 그래서 위치는 이동하는데
    // 다리 애니메이션이 안 따라와 미끄러지듯 부자연스럽게 보였다. R
    // 채널링 중 실제로 이동하는 동안에는(이 함수 자체가 "이동 중"에만
    // 호출됨) 다리가 실제로 움직이는 정상 달리기 클립을 우선 사용한다 -
    // 상반신이 궁 자세와 완벽히 안 맞더라도, 다리가 실제로 걷는 게
    // "부드러운 이동"에 훨씬 중요하다.
    if (this.currentActionKey === 'nilahR') {
      const base = this._locomotionSubStateClips('moveClips') || this.actionData.move.clips;
      return base;
    }
    const base = this._locomotionSubStateClips('moveClips') || this.actionData.move.clips;
    return this._transientMoveClipNames && this._transientMoveClipNames.size
      ? [...this._transientMoveClipNames, ...base]
      : base;
  }
  _beginTransientMoveClip(name) { if (name) this._transientMoveClipNames.add(name); }
  _endTransientMoveClip(name) { if (name) this._transientMoveClipNames.delete(name); }
  _clearTransientMoveClips() { this._transientMoveClipNames.clear(); }

  // 요청(모데카이저형 한계 해결): 같은 스킬(Q/W/E/R)이라도 다른 서브 상태가
  // 켜져 있으면 다른 클립을 재생해야 하는 경우(예: W 활성 중의 E는
  // "Spell3_Cast_from_Spell2.anm"). championAbilityDatabase[champ][역할].
  // subStateAnimationNames = { 서브상태이름: [클립후보...] } 로 등록하면
  // 여기서 우선순위로 찾아 쓰고, 없으면 null(호출부가 기존 클립 사용).
  // 업데이트(모데카이저 문서 42절): 값이 배열이면 기존처럼 그대로 반환하고
  // (정지/이동 구분 없는 챔피언용), {idle, move} 객체면 현재 이동 명령
  // 여부(this.targetPos)를 보고 알맞은 쪽 배열을 골라 반환한다 - 예를 들어
  // W(불멸) 활성 중 E는 Spell3_Cast_from_Spell2.anm(정지) /
  // Spell3_Cast_Walk_from_Spell2.anm(이동)로 갈린다.
  _subStateAnimationOverride(roleLetter) {
    const db = this._championAbilityDbEntry();
    const map = db && db[roleLetter] && db[roleLetter].subStateAnimationNames;
    if (!map) return null;
    for (const subName of Object.keys(map)) {
      if (!this.isSubStateActive(subName)) continue;
      const entry = map[subName];
      if (Array.isArray(entry) && entry.length) return entry;
      if (entry && (entry.idle || entry.move)) {
        const moving = !!this.targetPos;
        const picked = moving ? (entry.move || entry.idle) : (entry.idle || entry.move);
        if (picked) return Array.isArray(picked) ? picked : [picked];
      }
    }
    return null;
  }

  // 요청(모데카이저형 exitClips 한계 해결): runAction 계열 키('qLeft' 등)를
  // championAbilityDatabase의 역할 문자(Q/W/E/R)로 되돌린다. 특정 챔피언
  // 이름을 언급하지 않는 범용 매핑이라 다른 챔피언에도 그대로 재사용된다.
  _roleForActionKey(key) {
    if (key === 'qLeft' || key === 'qRight' || key === 'qForward' || key === 'qBack') return 'Q';
    if (key === 'w') return 'W';
    if (key === 'e1' || key === 'e2') return 'E';
    if (key === 'rCast') return 'R';
    return null;
  }

  // 요청(모데카이저 문서 22~26/41~44/49~50절): 스킬 종료 즉시 Idle/Run으로
  // 스냅하지 않고, championAbilityDatabase[챔피언][role].exitClips가 등록돼
  // 있으면 정지/이동/서브상태(W)/이동 방향(Q만 해당, directional)에 맞는
  // "복귀 전환 클립"을 한 번 재생한 뒤 로코모션으로 넘어간다. 등록 안 된
  // 챔피언/역할은 그냥 false를 반환해서 호출부가 기존처럼 즉시
  // _returnToLocomotion()을 부르게 한다 - 다른 챔피언에는 영향 없음.
  _playExitClip(role) {
    const db = this._championAbilityDbEntry();
    const exit = db && db[role] && db[role].exitClips;
    if (!exit) return false;
    const moving = !!this.targetPos;
    let group = exit.base;
    if (exit.subState) {
      for (const subName of Object.keys(exit.subState)) {
        if (this.isSubStateActive(subName)) { group = exit.subState[subName]; break; }
      }
    }
    if (!group) return false;

    let clipName = null;
    // Q형: 서브상태가 안 걸린 "기본" 이동 종료일 때만 5방향(문서 24절:
    // "Q 종료 시점의 최신 이동 입력 기준")을 계산한다. 캐릭터 정면 기준
    // 상대각으로 가장 가까운 방향 클립을 고른다.
    if (moving && group === exit.base && exit.directional && this.targetPos) {
      const dir = new THREE.Vector3().subVectors(this.targetPos, this.root.position); dir.y = 0;
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        const local = dir.applyQuaternion(this.root.quaternion.clone().invert());
        const angleDeg = Math.atan2(local.x, local.z) * 180 / Math.PI; // 0=정면, +90=오른쪽
        let bucket;
        if (angleDeg >= -45 && angleDeg <= 45) bucket = '0';
        else if (angleDeg > 45 && angleDeg < 135) bucket = '90';
        else if (angleDeg < -45 && angleDeg > -135) bucket = '-90';
        else if (angleDeg >= 135) bucket = '180';
        else bucket = '-180';
        clipName = exit.directional[bucket] || exit.directional['0'];
      }
    }
    if (!clipName) clipName = moving ? (group.move || group.idle) : (group.idle || group.move);
    if (!clipName) return false;
    const clip = this.findAnimation(clipName);
    if (!clip) return false; // 클립이 실제 glb에 없으면 조용히 폴백(기존 즉시 복귀)

    this.crossFadeTo([clipName], { loop: THREE.LoopOnce, fade: 0.15, clampWhenFinished: true, timeScale: 1.0 });
    // 버그 수정(_resumeAfterAction 참고): 여기서도 대기 중이던 이동 명령을
    // 무시하고 곧장 _returnToLocomotion()으로 스냅하면 안 된다.
    const t = setTimeout(() => { this._resumeAfterAction(); }, Math.max(0, clip.duration - 0.05) * 1000);
    this._actionTimers.push(t);
    return true;
  }

  findAnimation(name) { return this.clips.find(c => c.name === name) || null; }
  resolveClip(candidateNames) {
    for (const n of candidateNames) { const clip = this.findAnimation(n); if (clip) return clip; }
    return null;
  }
  getOrCreateAction(clip) {
    if (!clip) return null;
    if (!this.actions[clip.name]) this.actions[clip.name] = this.mixer.clipAction(clip);
    return this.actions[clip.name];
  }

  // 요청 11: 이미 자연스러운 Cross Fade를 구현하고 있는 핵심 전환 함수.
  // AnimationSequencePlayer(섹션 1-A2)도 별도의 블렌딩 로직을 새로 만들지 않고
  // 반드시 이 함수를 통해서만 다음 Action을 재생한다 -- 그래야 일반 이동/Idle/
  // 공격 전환과 스킬 시퀀스 내부 전환이 전부 동일한 규칙(weight 기반 Cross
  // Fade)을 공유한다. currentAction을 여기서 절대 stop()하지 않는다 -- 세 번째
  // 인자인 crossFadeTo(action, fade, false) 자체가 이전 Action의 weight를
  // fade 시간 동안 1->0으로 서서히 낮추는 예약을 걸어줄 뿐이며, 그 예약이
  // 끝나면 weight가 0이 되어 화면에는 이미 안 보이므로 별도의 stop() 호출이
  // 필요 없다(기존 로직 그대로 재사용).
  crossFadeToClip(clip, { loop = THREE.LoopRepeat, fade = DEFAULT_ANIMATION_FADE_TIME, clampWhenFinished = false, timeScale = 1.0, time = 0 } = {}) {
    if (!clip) return null;
    const action = this.getOrCreateAction(clip);
    action.reset();
    action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = clampWhenFinished;
    action.timeScale = timeScale;
    action.time = time;
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (this.currentAction && this.currentAction !== action) {
      action.play();
      this.currentAction.crossFadeTo(action, fade, false);
    } else {
      action.play();
    }
    this.currentAction = action;
    this.currentClipKey = clip.name;
    return action;
  }

  crossFadeTo(candidateNames, opts) {
    const names = Array.isArray(candidateNames) ? candidateNames.filter(Boolean) : [];
    if (!names.length) return null;
    const clip = this.resolveClip(names);
    if (!clip) { return null; }
    return this.crossFadeToClip(clip, opts);
  }
  playFirstAvailable(candidateNames, opts) { return this.crossFadeTo(candidateNames, opts); }

  setState(s) { this.state = s; updateStateLabel(s); }

  /* -------- 추가 수정사항 18/19 — 행동 권한 시스템 --------
     canMove/canAttack/canCast/canTurn을 한 곳에서 계산한다. 지금은
     상태이상(스턴/루트 등)이 아직 없지만, 이후 CC 시스템을 붙일 때
     이 함수 하나만 확장하면 moveTo/castAbility/공격 로직이 전부
     자동으로 그 규칙을 따르게 된다(우선순위: DEAD > 하드 캐스트락(R
     windup/channel/cast) > 현재 액션의 STARTUP/ACTIVE > RECOVERY > 자유). */
  getActionAuthority() {
    // 요청(귀환 캔슬): RECALL은 더 이상 DEAD/RESPAWN과 묶어서 "완전 봉쇄"하지
    // 않는다. 이동/타겟선택/스킬시전/피격 네 진입점이 각자 먼저 cancelRecall()을
    // 호출해 state를 RECALL에서 빠져나오게 한 다음에만 이 함수를 참조하므로,
    // 여기 도달했을 때 state가 여전히 RECALL이라면 아직 취소 처리 전이라는
    // 뜻 -- 그 경우에도 자유 행동으로 취급해 호출부가 캔슬을 이어가게 한다.
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) {
      return { canMove: false, canAttack: false, canCast: false, canTurn: false };
    }
    if (this.state === STATE.RECALL) {
      return { canMove: true, canAttack: true, canCast: true, canTurn: true };
    }
    if (this.currentActionKey === 'rWindup' || this.currentActionKey === 'rChannel' || this.currentActionKey === 'rCast'
        || this.currentActionKey === 'leesinE' || this.currentActionKey === 'leesinR') {
      return { canMove: false, canAttack: false, canCast: false, canTurn: false };
    }

    // Master Yi W(명상)는 캐스트/채널 애니메이션이 끝날 때까지
    // 이후 입력(기본 공격/다른 캐스트)이 현재 W 액션을 끊지 못한다.
    // E/R은 별도 버프 전용 진입점(_masteryiCastE/_masteryiCastR)으로
    // authority를 우회하므로 W 애니메이션을 유지한 채 버프만 적용할 수 있다.
    // 요청(변경): 이동만은 이제 canMove:true다 - moveTo()가 자체적으로
    // masteryiW를 감지해 명상을 즉시 취소하고 이동으로 교체하므로(실제
    // W 취소는 moveTo() 쪽 전용 분기가 담당), 여기서는 "지금 이동 명령을
    // 내릴 수 있는 상태"임을 정확히 반영만 한다.
    if (this.championId === 'masteryi' && (this.currentActionKey === 'w' || this.currentActionKey === 'masteryiW')) {
      // 명상 중 평타 입력은 명상을 종료하고 즉시 다음 평타로 연결되는 명캔을 허용한다.
      return { canMove: true, canAttack: true, canCast: false, canTurn: true };
    }

    // 다리우스 Q(qChain)는 Q 애니메이션을 유지한 채 실제 좌표 이동만 허용한다.
    // 이동 입력으로 Q 시퀀스를 취소하거나 일반 이동 애니메이션으로 바꾸지 않는다.
    if (this.currentActionKey === 'qChain') {
      return { canMove: true, canAttack: false, canCast: false, canTurn: true };
    }
    // Master Yi Q(Alpha Strike)는 일반 actionData 슬롯이 아니라
    // 전용 상태 머신으로 진행되므로 actionData[this.currentActionKey]가
    // undefined인 상태에서 일반 권한 계산으로 떨어지면 Q 이후 입력이
    // 영구적으로 막힐 수 있다. Q가 실제 진행 중일 때만 잠그고,
    // alpha 상태가 이미 끝났는데 키만 남아 있으면 즉시 자유 상태로 복구한다.
    if (this.currentActionKey === 'masteryiQ') {
      if (this._masteryi?.alpha) {
        return { canMove: false, canAttack: false, canCast: false, canTurn: true };
      }
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this.isUntargetable = false;
      if (this.model) this.model.visible = true;
      return { canMove: true, canAttack: true, canCast: true, canTurn: true };
    }

    // 버그 수정(안전장치): 'nilahW'/'nilahE'는 actionData에 등록된 범용
    // 슬롯 키가 아니라 닐라 전용 임시 상태 키라서, 이 값들이 아래 일반
    // data 기반 분기로 떨어지면 data가 항상 undefined가 되어 canMove가
    // 예외 없이 false로 계산됐다(원작 닐라 W/E는 이동을 봉쇄하지 않는다 -
    // W는 즉시 캐스트되는 버프고, E는 돌진 자체가 위치를 직접 갱신한다).
    // 각 시전 함수가 시전 종료 시 currentActionKey를 정상적으로 null로
    // 되돌리지만, 혹시 남는 타이밍 문제가 있어도 이동만은 항상 허용되도록
    // 이 챔피언 전용 예외를 명시적으로 둔다.
    // 주의: 'nilahQ'는 여기 포함하지 않는다 - 원작처럼 Q는 타격이 확정되는
    // 그 짧은 순간(윈드업)에만 다른 평타/스킬과 동일하게 잠깐 붙잡아두는
    // 게 의도된 동작이다(이동 명령을 내리면 다른 평타처럼 그 자리에서
    // 즉시 취소되고 이동으로 전환된다 - 완전히 자유로운 것과는 다르다).
    // 데이터 수정(실제 원작 확인): 닐라 R(환희/Apotheosis)은 다른 챔피언의
    // "채널링 궁"과 달리 시전 중 이동이 완전히 허용된다 - 실제로 막히는
    // 것은 평타와 다른 스킬(Q/W/E) 뿐이다("Nilah is unable to basic
    // attack and cast her other abilities during Apotheosis, but she is
    // able to move."). 예전에는 'nilahR'도 actionData에 없는 임시 키라서
    // W/E와 같은 이유로 canMove가 항상 false로 계산돼, 궁을 쓰면 다른
    // 챔피언처럼 완전히 그 자리에 묶이는 버그가 있었다.
    if (this.championId === 'nilah' && (this.currentActionKey === 'nilahW' || this.currentActionKey === 'nilahE')) {
      return { canMove: true, canAttack: false, canCast: false, canTurn: true };
    }
    // 닐라 R은 W/E와 조건이 다르다: 이동은 허용하되(원작 그대로), 이동
    // 명령 자체가 R을 취소해버리면 안 된다(원작 R은 한 번 시작되면 이동
    // 여부와 무관하게 끝까지 채널링된다). moveTo()는 STARTUP 단계에서
    // canMove:true를 보면 그 자리에서 액션을 캔슬하고 즉시 이동으로
    // 바꿔버리므로, 극히 짧은 선딜(STARTUP) 동안만 canMove:false로 반환해
    // 캔슬을 막고, 채널 중(ACTIVE)에는 canMove:true로 둬서 이동 명령이
    // 최소한 대기(pendingMove)되었다가 채널이 끝나는 즉시 자연스럽게
    // 이어지게 한다.
    if (this.championId === 'nilah' && this.currentActionKey === 'nilahR') {
      return { canMove: this.currentPhase !== 'STARTUP', canAttack: false, canCast: false, canTurn: true };
    }

    // 버그 수정(위 runAction() 참고): this.actionData[key]에 없는 임시
    // 액션(dataOverride로 시작한 것)이면, 방금 그 액션을 시작할 때 저장해둔
    // 단일 슬롯 캐시(_activeActionOverrideData)를 폴백으로 사용한다 -
    // 키가 일치할 때만 사용해서 다른 액션의 stale 데이터가 섞이지 않게 한다.
    const data = this.currentActionKey
      ? (this.actionData[this.currentActionKey] ||
         (this.currentActionKey === this._activeActionOverrideKey ? this._activeActionOverrideData : null))
      : null;
    if (this.currentPhase === 'STARTUP' || this.currentPhase === 'ACTIVE') {
      // 스킬 우선순위 문서(4) 섹션 1/2/6/9/12/13/22: "평타 애니메이션 재생
      // 중 스킬 입력 -> 평타 즉시 중단 -> 스킬 진입"이 반드시 성립해야
      // 한다. 예전에는 STARTUP(WINDUP) 구간의 canCast가 무조건 false라서
      // Q/W를 눌러도 평타가 끝날 때까지 씹혔다. 이제 RECOVERY와 동일하게
      // data.cancelToSpell을 따른다 - 기본 공격류(attack1/2/3/crit/passive)는
      // cancelToSpell:true라 WINDUP 중에도 즉시 다른 스킬로 끊긴다. 반면
      // Q/W 등 실제 스킬 자신의 WINDUP(cancelToSpell:false로 등록됨)은
      // 기존처럼 그대로 잠겨 있어 스킬끼리 서로 끊고 끼어드는 문제는 생기지
      // 않는다.
      return { canMove: !!(data && data.cancelToMove), canAttack: false, canCast: !!(data && data.cancelToSpell), canTurn: true };
    }
    if (this.currentPhase === 'RECOVERY') {
      return { canMove: !!(data && data.cancelToMove), canAttack: false, canCast: !!(data && data.cancelToSpell), canTurn: true };
    }
    return { canMove: true, canAttack: true, canCast: true, canTurn: true };
  }

  /* -------- 추가 수정사항 5/16 — Q/W/E/R 시작 가능 여부 -------- */
  canStartNewAction() { return this.getActionAuthority().canCast; }

  runAction(key, gameplayState, { onFire, faceDir, startupOverride, recoveryOverride, timeScaleOverride, dataOverride, animationSequenceClips = null } = {}) {
    const data = dataOverride || this.actionData[key];
    if (!data) { console.warn('[Action] missing actionData for', key); return; }
    this._clearActionTimers();
    const actionSerial = ++this._actionSerial;
    if (faceDir) this.faceDirectionInstant(faceDir);

    // 요청 11: 게임 로직 타이머(startup/recovery)는 애니메이션 길이가 아니라
    // (기본 공격의 경우) 공격속도 스탯에서 유도된 값을 우선 사용한다.
    // startupOverride/recoveryOverride가 주어지지 않으면 기존처럼 애니메이션
    // 길이 비례로 미리 계산해둔 actionData의 값을 그대로 쓴다(스킬 등).
    const startup = startupOverride ?? data.startup;
    const recovery = recoveryOverride ?? data.recovery;

    this.setState(gameplayState);
    this.currentActionKey = key;
    this.currentPhase = 'STARTUP';
    this.phaseCancelable = false;
    // 버그 수정(핵심 - 레넥톤 평타 중 이동/스킬 캔슬이 전혀 안 되던 원인):
    // dataOverride로 시작한 액션(예: 레넥톤이 매 스윙마다 새로 만드는
    // `renektonAA${comboIndex}` 같은 키)은 buildActionData()에 사전
    // 등록되어 있지 않다. 그런데 getActionAuthority()는 이후 STARTUP/
    // ACTIVE/RECOVERY 내내 this.actionData[this.currentActionKey]를 다시
    // 조회하는데, 이 키는 거기 없으니 매번 undefined가 나와서 canMove/
    // canCast가 예외 없이 false로 계산됐다 - 즉 레넥톤은 평타 도중 이동
    // 명령으로도, 스킬 입력으로도 캔슬이 전혀 안 되고 그 자리에 고정된
    // 채 평타가 끝나기만 기다려야 했다(다른 챔피언들의 attack1/attack2는
    // buildActionData()에 미리 등록돼 있어 이 문제가 없었다). 매 스윙마다
    // 문자열 키가 계속 바뀌므로 this.actionData에 영구 저장하면 누적되어
    // 쌓이기만 한다(작은 메모리 누수) - 대신 "지금 진행 중인 액션의
    // override 데이터"를 키와 함께 딱 한 슬롯만 기억해뒀다가
    // getActionAuthority()가 폴백으로 조회하게 한다.
    this._activeActionOverrideKey = key;
    this._activeActionOverrideData = dataOverride || null;

    let actionAnim = null;
    let sequenceDuration = 0;
    const sequenceNames = Array.isArray(animationSequenceClips)
      ? animationSequenceClips.filter((name, i, arr) => typeof name === 'string' && name && arr.indexOf(name) === i && !!this.findAnimation(name))
      : null;

    if (sequenceNames && sequenceNames.length) {
      const clips = sequenceNames.map(name => this.findAnimation(name)).filter(Boolean);
      sequenceDuration = clips.reduce((sum, clip) => sum + Math.max(0, clip.duration || 0), 0);
      const seqScale = Math.max(0.05, Math.abs(timeScaleOverride ?? data.timeScale ?? 1));
      this.sequencePlayer.play({
        transitionFadeTime: 0.1,
        steps: clips.map((clip) => ({ animation: clip.name, clipStart: 0, clipEnd: clip.duration, fadeTime: 0.1, timeScale: seqScale })),
      });
    } else {
      actionAnim = this.playFirstAvailable(data.clips, { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true, timeScale: timeScaleOverride ?? data.timeScale });
    }

    // 모든 액션에 공통으로 최후 안전장치를 둔다. 특히 Q처럼 GLB 모션이 실제
    // 타이머 길이와 어긋나거나, onFire 내부 예외가 발생해 정상 종료 콜백에
    // 도달하지 못한 경우에도 currentActionKey가 영구히 남지 않게 한다.
    const scale = Math.max(0.05, Math.abs(timeScaleOverride ?? data.timeScale ?? 1));
    const clipDuration = actionAnim?.getClip()?.duration;
    const visualDuration = sequenceDuration > 0 ? sequenceDuration / scale : (Number.isFinite(clipDuration) ? clipDuration / scale : 0.75);
    const actionBudget = Math.max(
      Number.isFinite(startup + recovery) ? startup + recovery : 0.75,
      visualDuration
    ) + 0.50;
    const safetyTimer = setTimeout(() => {
      if (this._actionSerial !== actionSerial || this.currentActionKey !== key) return;
      console.warn(`[ACTION SAFETY] ${this.championId || 'unknown'} ${key} stale action lock cleared`);
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this._resumeAfterAction();
    }, actionBudget * 1000);
    this._actionTimers.push(safetyTimer);

    const fireTimer = setTimeout(() => {
      if (this._actionSerial !== actionSerial || this.currentActionKey !== key) return;
      this.currentPhase = 'ACTIVE';
      // onFire 내부 게임 로직에서 예외가 나더라도 반드시 RECOVERY/종료 단계로
      // 넘어가게 한다. 여기서 예외가 전파되면 currentPhase='ACTIVE'가 남아
      // 이동 권한이 영구 잠기는 것이 Q 정지 버그의 또 다른 원인이 된다.
      try {
        if (onFire) onFire();
      } catch (err) {
        console.error(`[Action] ${this.championId || 'unknown'} ${key} onFire error`, err);
      }
      if (this._actionSerial !== actionSerial || this.currentActionKey !== key) return;
      this.currentPhase = 'RECOVERY';
      this.phaseCancelable = data.cancelable;

      // 버그 수정: 여기서 이동으로 전환할 때 화면(애니메이션)은 즉시 MOVE로
      // 바뀌지만, 예전에는 currentActionKey/currentPhase를 그대로 남겨둬서
      // (예: currentPhase='RECOVERY'인 채로) 내부 상태만 "아직 스킬
      // RECOVERY 중"으로 남아 있었다. getActionAuthority()는 RECOVERY 중
      // canCast를 data.cancelToSpell로 판정하는데, cancelToSpell:false인
      // 스킬(예: 모데카이저 Q) 뒤에 반대 방향 이동을 넣으면 화면은 걷고
      // 있는데도 그 이후 Q/W/E/R 입력이 전부 무시되는 문제가 있었다.
      // _commitMove() 호출 전에 반드시 행동 상태를 먼저 비워서, 다음 프레임의
      // getActionAuthority()가 "지금은 이동 중일 뿐, 진행 중인 액션 없음"으로
      // 정확히 판정하도록 한다.
      // 일반 액션은 STARTUP/ACTIVE 종료 시 pendingMove를 즉시 실행할 수 있지만,
      // Master Yi W는 RECOVERY까지 W 애니메이션을 보장해야 한다.
      // 따라서 W에서는 pendingMove를 보존하고 W recovery 완료 후 _resumeAfterAction()
      // 에서 소비한다.
      if (this.pendingMove && !(this.championId === 'masteryi' && key === 'w')) {
        const p = this.pendingMove; this.pendingMove = null;
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        this._commitMove(p);
        return;
      }

      const recoveryTimer = setTimeout(() => {
        if (this._actionSerial !== actionSerial || this.currentActionKey !== key) return;
        this._onActionRecoveryComplete(key);
      }, Math.max(0, recovery) * 1000);
      this._actionTimers.push(recoveryTimer);
    }, Math.max(0, startup) * 1000);

    this._actionTimers.push(fireTimer);
  }

  // 이동/다른 스킬 사용/기절/사망/프로그램 강제취소 등 모든 "행동 중단" 지점이
  // 원래 이 함수 하나를 거쳐가므로(runAction/moveTo/testAbility/_die/_castR/
  // startRecall/debugPreviewClip 전부), 진행 중이던 AnimationSequencePlayer
  // 시퀀스도 여기서 한 번에 취소한다 -- 남은 Step은 절대 실행되지 않는다.
  _clearActionTimers() {
    this._actionSerial = (this._actionSerial || 0) + 1;
    this._actionTimers.forEach(clearTimeout);
    this._actionTimers = [];
    if (this._leesinAnimTimer) { clearTimeout(this._leesinAnimTimer); this._leesinAnimTimer = null; }
    if (this.sequencePlayer && this.sequencePlayer.isPlaying) this.sequencePlayer.cancel();
  }

  _onActionRecoveryComplete(key) {
    if (this.championId === 'masteryi' && key === 'w') this._masteryiEndMeditate();
    if (key.startsWith('attack') || key === 'crit') {
      this.currentActionKey = null; this.currentPhase = null;
      // 버그 수정(일관성): 이전엔 여기서 pendingMove를 확인하지 않고
      // currentTarget만 봤다 - _resumeAfterAction() 하나로 통일해서
      // pendingMove/currentTarget/locomotion 우선순위를 스킬 종료 경로와
      // 완전히 동일하게 맞춘다(공통 Action Policy 원칙 - 챔피언/액션
      // 종류마다 복귀 로직을 따로 두지 않는다).
      this._resumeAfterAction();
      return;
    }
    this.currentActionKey = null; this.currentPhase = null;
    // 업데이트(W 전용 상세 문서 6~10절): W 최초 캐스트가 막 끝났으면 exitClips
    // 보다 먼저 entryChain(Intro→Idle_In/Walk)을 확인한다 - W는 "종료"가 아니라
    // "이제 막 시작된 지속 상태"이므로 이 둘은 서로 다른 개념이다.
    if (key === 'w' && this._playWEntryChain()) return;
    // 요청(모데카이저형 exitClips): Q/W/E/R가 방금 끝났고 해당 역할에
    // exitClips가 등록돼 있으면 그 전환 클립부터 재생한 뒤 로코모션으로
    // 넘어간다. 등록 안 됐으면(대부분의 챔피언) false가 반환되어 기존과
    // 동일하게 즉시 _returnToLocomotion()으로 스냅한다.
    const role = this._roleForActionKey(key);
    if (role && this._playExitClip(role)) return;
    // 버그 수정(핵심 - 요청 문서 7/8/15): 지금까지 여기서 pendingMove/
    // currentTarget을 전혀 확인하지 않고 무조건 _returnToLocomotion()으로
    // 보냈다 - "평타 중 Q → Q 종료 → 자동으로 다시 평타"가 Q/W/E/R 중
    // runAction()을 거치는 스킬(다리우스 E, 모데카이저 Q/E 등)에서는
    // 전혀 동작하지 않고 있었다. _resumeAfterAction() 하나로 통일해서
    // "대기 이동 > 살아있는 타겟 재교전 > 로코모션" 우선순위를 모든 스킬
    // 종료 지점에서 동일하게 적용한다 - 챔피언별로 복사하지 않는다.
    this._resumeAfterAction();
  }

  /* ---------------- movement ---------------- */
  moveTo(point) {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (isCrowdControlled(this)) return; // 기획안 8절: 기절/속박 중에는 이동 명령을 받지 않는다
    if (this.currentActionKey === 'rWindup' || this.currentActionKey === 'rChannel' || this.currentActionKey === 'rCast'
        || this.currentActionKey === 'leesinE' || this.currentActionKey === 'leesinR') return;
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
        !['rWindup', 'rChannel', 'rCast', 'leesinE', 'leesinR', 'eChannel', 'nilahR', 'qChain'].includes(this.currentActionKey)) {
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
  }

  _commitMove(point) {
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
  }

  updateMovement(dt) {
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
  }

  // 공격 명령으로 지정한 대상이 죽거나 파괴되면 주변의 살아있는 적을 자동으로
  // 다시 선택한다. 대상 타입을 미니언으로 하드코딩하지 않고 getAllEnemyUnits()를
  // 공용 진입점으로 사용하므로 추후 추가될 소환수/구조물도 같은 규칙을 따른다.
  _findNearbyAttackRetarget(anchor = null) {
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
  }

  // 요청 13: 타겟이 사거리 밖이면 CHASE(=MOVE 상태 + isChasing 플래그), 사거리에
  // 들어오면 정지 후 WINDUP 시작. 매 프레임 현재 위치 기준으로 재검사한다.
  updateTargetChase() {
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
  }

  faceDirection(dir, dt, speed = 8) {
    if (dir.lengthSq() < 1e-6) return;
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
    this.root.quaternion.slerp(targetQuat, Math.min(1, dt * speed));
  }
  faceDirectionInstant(dir) {
    if (dir.lengthSq() < 1e-6) return;
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
  }

  /* ---------------- targeting / basic attack ---------------- */
  selectTarget(enemy) {
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
  }

  // 요청 6/12/13: 사거리 안이면 WINDUP(공격) 시작, 밖이면 CHASE로 전환.
  // 요청 18/19: Q 활성 중 "다음 평타가 왼손"일 때만 사거리 +50(LoL 단위).
  // 기존 사거리 시스템(stats.attackRange, lolRangeToWorld)을 그대로 쓰고
  // 별도의 거리 계산을 새로 만들지 않는다 - 호출부에서 잠깐 더했다가
  // 즉시 원래 값으로 되돌리는 방식으로 기존 isInAttackRange()를 그대로 재사용한다.


  _tryEngageTarget() {
    if (!this.currentTarget || this.currentTarget.hp <= 0) { this.currentTarget = null; this.isChasing = false; return; }
    const rangeBonus = this._settLeftHandRangeBonusWorld();
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
  }

  // 요청 7~12,17: 기본 공격 1회 = WINDUP -> RELEASE(투사체+치명타 확정) ->
  // RECOVERY. 타이밍은 애니메이션 길이가 아니라 attackSpeed 스탯에서 유도된
  // attackInterval을 기준으로 계산한다(요청 11: 로직과 애니메이션 분리).
  /* ============================================================
     기획안 기반 실전투 로직 - 가렌 / 다리우스 (섹션 4~10)
     ------------------------------------------------------------
     애니메이션/서브 상태/쿨다운 골격은 위 championAbilityDatabase와
     기존 _cast*()가 그대로 담당하고, 여기서는 그 위에 얹히는 "실제
     수치/효과"만 챔피언별로 분리했다. CHAMPION_DATA에 없는 챔피언은
     모든 훅이 조용히 아무 것도 하지 않아 기존 동작을 그대로 유지한다.
     ============================================================ */
  _champData() { return this.championId ? CHAMPION_DATA[this.championId] : null; }
  // 버그 수정(전 챔피언 공통): this.bonusAD는 원래 "다리우스 과다출혈
  // 만중첩 임시 버프"만을 위한 필드인데(기본값 0, 오직 다리우스 empower
  // 중에만 값이 들어감), 여러 챔피언의 스킬 데미지 공식이 이 필드를
  // "현재 추가 공격력(bonus AD)" 대신으로 잘못 참조하고 있었다. 다리우스가
  // 아닌 챔피언은 이 필드가 항상 0이라, "+X 추가 공격력" 항이 실제로는
  // 게임 내내 0으로 계산되고 있었다(레벨업으로 공격력이 올라도 전혀
  // 반영 안 됨). 실제 추가 공격력은 "현재 총 공격력 - 1레벨 기본 공격력"
  // 이고, 여기에 다리우스의 임시 empower 보너스가 있으면 더해준다.
  _getBonusAD() {
    const cd = this._champData();
    const baseAd = cd ? cd.stats.ad : 0;
    // 주의: this.bonusAD (다리우스 임시 empower 보너스)는 recomputeStats()가
    // 이미 this.stats.attackDamage에 합산해뒀다(3146행 참고) - 여기서 또
    // 더하면 다리우스 empower 중에 이중으로 계산된다. 그래서 여기서는
    // stats.attackDamage 하나만 기준으로 계산한다 - 그 안에 이미 레벨
    // 성장분과 다리우스 empower 보너스가 전부 반영되어 있다.
    return Math.max(0, (this.stats.attackDamage || 0) - baseAd);
  }

  // 슬롯의 마나/쿨타임을 CHAMPION_DATA(있으면)+현재 스킬레벨 기준으로 계산.
  _skillCostFor(slot) {
    const cd = this._champData();
    if (!cd || !cd[slot]) return null;
    const data = cd[slot];
    const lvl = Math.max(1, this.skillLevels[slot] || 1);
    let mana = 0;
    if (data.mana != null) mana = skillVal(data.mana, lvl);
    else if (data.manaByLevel) mana = skillVal(data.manaByLevel, lvl);
    else if (data.manaFlat != null) mana = data.manaFlat; // 예: 마스터 이 W(명상) - 시전 즉시 소모하는 고정분. 초당 추가 소모는 채널 틱에서 별도 처리.
    const cdSec = skillVal(data.cooldown, lvl);
    return { mana: mana || 0, cd: cdSec };
  }
  // 스킬 포인트를 아직 배우지 않았으면(레벨 0) 캐스트를 막고, 그 외에는
  // 마나/쿨다운을 확인 후 실제로 차감한다. CHAMPION_DATA가 없는 챔피언은
  // 기존 SKILL_COST 전역 상수로 자연스럽게 폴백한다(기존 기능 유지).
  // 버그 수정("마나 부족하면 모션이 기본으로 돌아간다"): 지금까지는
  // "평타 중 스킬 입력 -> 무조건 평타부터 취소 -> 그 다음에야 마나/쿨다운
  // 확인"이라, 마나가 부족하면 스킬은 안 나가는데 이미 취소해버린 평타
  // 모션은 되돌릴 수 없었다(그 자리에서 캐릭터가 아무 동작도 안 하는
  // "기본" 상태로 보임). 이 헬퍼는 _payCost와 완전히 같은 조건을 확인
  //하되 마나/쿨다운을 실제로 차감하지 않는다 - "취소해도 되는지"를
  // 먼저 물어보기 위한 순수 조회용이다.
  _canAffordAbility(slot) {
    if (this.championId && CHAMPION_DATA[this.championId] && (this.skillLevels[slot] || 0) < 1) return false;
    const custom = this._skillCostFor(slot);
    const cost = custom || SKILL_COST[slot];
    if (this.cooldowns[slot] > 0) return false;
    if (this.mp < cost.mana) return false;
    return true;
  }

  _payCost(slot, free) {
    if (!free && this.championId && CHAMPION_DATA[this.championId] && (this.skillLevels[slot] || 0) < 1) {
      const msg = `${slot} - 아직 스킬 포인트를 투자하지 않음 (레벨 패널에서 ${slot} 옆 '+' 버튼 먼저)`;
      console.log(`[SKILL BLOCKED] ${this.championId} ${msg}`);
      showSkillToast(msg);
      return false;
    }
    const custom = this._skillCostFor(slot);
    const cost = custom || SKILL_COST[slot];
    if (!free) {
      if (this.cooldowns[slot] > 0) {
        const msg = `${slot} - 쿨다운 ${this.cooldowns[slot].toFixed(1)}s 남음`;
        console.log(`[SKILL BLOCKED] ${msg}`); showSkillToast(msg);
        return false;
      }
      if (this.mp < cost.mana) {
        const msg = `${slot} - 마나 부족 (${this.mp.toFixed(0)}/${cost.mana})`;
        console.log(`[SKILL BLOCKED] ${msg}`); showSkillToast(msg);
        return false;
      }
      this.mp -= cost.mana; this.cooldowns[slot] = typeof abilityHasteCooldown === 'function' ? abilityHasteCooldown(this, cost.cd, slot) : cost.cd;
      if (cost.mana > 0 && typeof itemOnManaSpent === 'function') itemOnManaSpent(this, cost.mana);
      updateBars(this);
    }
    return true;
  }

  // 기본 공격이 실제로 명중했을 때 공통 진입점. overrideId는 이번 스윙이
  // attackOverride였다면 그 슬롯 id('Q'=가렌 결정타 강화평타, 'W'=다리우스
  // 마비의 일격 강화평타)이고, 일반 평타면 null이다.
  _onBasicAttackHit(target, overrideId, wouldKill, attackHand, isCritical) {
    if (!target) return;
    // 아이템 패시브 "도움의 손길"(도란의 반지/방패/투구 공용) - 미니언
    // 기본 공격 시 고정 추가 물리 피해. applyDamageToMinion()이 이미
    // 기본 공격 피해를 적용한 "뒤"이므로 여기서는 보너스 피해만 별도로
    // 더해 넣는다(챔피언 전용 로직과 무관한 범용 훅).
    if (target.isMinion && this.itemMinionBonusDamage > 0) {
      applyDamageToMinion(target, { rawDamage: this.itemMinionBonusDamage, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }, true);
    }
    // 아이템 패시브 "수확"(수확의 낫) - 기본 공격 적중 시 고정 체력 회복.
    // 대상 종류(챔피언/더미/미니언/포탑)를 가리지 않는 실제 아이템 설명과
    // 동일하게 범용으로 적용한다.
    if (this.itemOnHitHeal > 0) this.hp = Math.min(this.maxHp, this.hp + this.itemOnHitHeal);
    // 아이템 패시브(광휘의 검/티아맷) - 평타 적중 공용 훅. 둘 다
    // item_system.js의 전용 함수가 "보유 여부"부터 직접 확인하므로 여기선
    // 무조건 호출만 한다(들고 있지 않으면 즉시 return).
    if (typeof itemOnBasicAttackHit === 'function') itemOnBasicAttackHit(this, target, isCritical);
    // 애쉬 패시브(서리 화살): 기본 공격마다 대상을 둔화시킨다(치명타면
    // 더 강한 둔화로 대체). Q(궁사의 집중)의 다발 공격(_asheFireFlurry)은
    // 다중 대상이라 이 단일 대상 훅을 거치지 않고 자체적으로 처리한다.
    if (this.championId === 'ashe') this._asheOnBasicAttackHit(target, isCritical);
    if (this.championId === 'nilah') this._nilahOnBasicAttackHit(target, target._lastDamageTakenAmount || 0, wouldKill);
    if (this.championId === 'renekton') this._renektonOnBasicAttackHit(target);
    // 아리: 여우불의 "아리가 공격한 적" 우선순위 판정에 쓸 마지막 평타
    // 대상/시각을 기록한다(공식 설명 "3초 내 마지막 평타 대상"과 동일).
    if (this.championId === 'ahri' && this._ahri) { this._ahri.lastAttackTarget = target; this._ahri.lastAttackAt = performance.now(); }
    // 이즈리얼: 기본 공격이 W(정수의 흐름) 표식 대상을 맞히면 표식이 터진다
    // (마나 환불은 스킬로 터뜨렸을 때만이므로 여기선 abilityManaCost 없이 호출).
    if (this.championId === 'ezreal') this._ezrealDetonateMark(target, 'attack');
    // 바루스: 기본 공격마다 패시브(살아있는 복수) 램프 갱신 + W(오한의
    // 화살통) 추가 마법 피해/오한 적용.
    if (this.championId === 'varus') this._varusOnBasicAttackHit(target);

    if (this.championId === 'garen' && overrideId === 'Q') this._garenQOnHit(target);
    if (this.championId === 'darius') {
      this._dariusApplyBleed(target);
      if (overrideId === 'W') this._dariusWOnHit(target);
    }
    if (this.championId === 'sett') this._settOnBasicAttackHit(target, attackHand);
    if (this.championId === 'masteryi') {
      this._masteryiOnBasicAttackHit(target);
      // 요청 2/3: HIT가 방금 확정됐으니, 그 이전에 눌러뒀던 W 예약이
      // 있으면 지금(가능한 가장 이른 시점 - RECOVERY 시작 전)) 즉시
      // 소비한다. 판정이 이미 끝난 뒤이므로 명캔 조건("판정 이후에만
      // 캔슬 가능")을 정확히 만족한다.
      if (this._masteryi.pendingWAfterHit) {
        this._masteryi.pendingWAfterHit = false;
        console.log('[Master Yi W] HIT 확정 - 예약된 W 발동');
        this._clearActionTimers();
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        this._dispatchCast('W', null, false);
      }
    }
    if (this.championId === 'mordekaiser') {
      const cd = this._champData();
      // 패시브: 기본 공격에 주문력 40% 추가 마법 피해(이 데모는 AP 아이템이 없어 0으로 기여).
      const bonus = cd.passive.apRatio * this.stats.abilityPower;
      if (bonus > 0) applyDamage(target, { rawDamage: bonus, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent });
      this._mordeOnDealtHit(target, this.stats.attackDamage + bonus);
    }
    if (this.championId === 'chogath') {
      this._chogathEOnHit(target); // E 활성화 중이면 이 평타에 가시 피해 추가
      if (wouldKill) this._chogathOnKill(target); // 패시브(육식)는 평타로 처치해도 발동
    }
    if (this.championId === 'leesin') this._leesinOnBasicAttackHit();
  }

  // ---------------- 가렌 ----------------













  // ---------------- 다리우스 ----------------








  // 버그 수정: 예전에는 this.currentTarget을 그대로 썼는데, 다리우스 E(포획)는
  // 실제로는 직선 스킬샷(Skill Shot)이라 조준 방향에 실제로 걸린 대상을
  // 밖(_castE)에서 findFirstInLine()으로 찾아 target 인자로 넘겨받는다.





  // ---------------- 세트 ----------------
  // 패시브(투기장의 투지): 왼손/오른손을 번갈아 사용, 오른손이 추가 물리피해.
  // 버그 수정: 예전엔 이 함수가 애니메이션 선택(comboIndex)과 완전히 독립된
  // 자기만의 _sett.punchSide 카운터를 따로 토글했다 - 치명타/Q 강화평타처럼
  // comboIndex가 그대로인 스윙에서도 이 카운터는 계속 넘어가서, "실제 재생된
  // 애니메이션(왼손 모션)"과 "적용된 피해(오른손 보너스)"가 서로 어긋날 수
  // 있었다. 이제 스윙이 시작되는 순간 단 한 번 확정된 attackHand(요청 7의
  // AttackInstance 개념)를 그대로 받아서만 판단한다 - 별도로 추측/토글하지
  // 않는다. attackHand가 null(치명타/스킬 강화 평타처럼 좌우 시퀀스 밖의
  // 스윙)이면 오른손 보너스는 적용하지 않는다(기획안에 없는 규칙을 새로
  // 만들지 않음).


  // 잃은 체력 5%당 추가 체력 재생(레벨 구간별 수치).
  // 요청 7: "다음 평타 입력이 들어왔을 때만 확인하지 말고 게임 업데이트
  // 루프에서도 세트 패시브 상태를 관리하라" - 이전엔 스윙을 실제로
  // 시작하려는 순간에만(지연 평가) 타임아웃을 확인했다. 결과(실제 다음
  // 공격이 항상 올바른 손으로 나가는 것)는 동일하지만, 공격을 멈추고
  // 가만히 있는 동안에는 comboIndex가 "아직 RIGHT 차례"인 것처럼 보일 수
  // 있었다. 이제 매 프레임 여기서도 동일한 조건을 확인해서 유휴 상태에서도
  // 즉시 LEFT로 스냅한다(_beginAttackSwing의 검사와 완전히 동일한 조건 -
  // 계산식을 중복 관리하지 않기 위해 동일한 소스 데이터만 참조).








  // 패시브(투기장의 투지): 실제로 HP를 깎은 피해량만큼 투지(FLOW)가
  // 쌓인다(최대 체력의 50%까지). 4초간 추가 피해가 없으면 감소 시작.
  // 버그 수정(요청: "전체 Grit을 하나의 값으로 감소시키지 마라"): 예전엔
  // 투지 전체를 "마지막 피해 시점" 하나만 기준으로 한꺼번에 감소시켰다.
  // 이제 각 피해로 생긴 투지를 별도 항목(entry: {amount, gainedAt})으로
  // 기록해서, A 피해로 생긴 투지와 1초 뒤 B 피해로 생긴 투지가 서로 다른
  // 시점부터 독립적으로 감소를 시작하게 한다.






  // 요청 14/26: W 보호막(투지 자원과는 완전히 독립된 값)을 3초에 걸쳐
  // 프레임 기반으로 선형 감소시킨다. 전투 중 흡수로 이미 줄어든 상태라면
  // 그 값에서 계속 줄어들 뿐, 공식으로 되돌리지 않는다.


  // 세트 W(강펀치) - 문서 9~15절: 전방 사다리꼴 판정. 중앙 직선(고정 폭)에
  // 걸린 대상은 투지 비례 고정 피해(방어력 무시), 그 옆 사다리꼴 영역에
  // 걸린 대상은 투지 비례 물리 피해(방어력 적용) - 같은 대상이 두 피해를
  // 동시에 받지 않는다(요청 15). origin/forward는 캐스트 시작 시점에
  // 고정된 값을 그대로 받는다(요청 16 "방향 고정").


  // 세트 E(안면강타) - 요청 전면 재작성: 세트 기준 "왼쪽"과 "오른쪽"을 각각
  // 독립적으로 판정한다(leftTarget/rightTarget). 각 방향에 유효한 대상이
  // 있으면 그 대상에게 데미지+실제 끌어오기를 적용하고, 왼쪽/오른쪽이
  // "둘 다" 있을 때만 두 대상 모두에게 기절을 추가로 건다 - 맞은 인원수가
  // 아니라 "양쪽에 각각 있는가"로만 판정한다(한쪽에 2명이어도 기절 없음).


  // ---- 세트 R(대미 장식): 잡기 → 제압 → 공중 캐리 → 착지 충격 시퀀스 ----
  // 버그 수정(전면 재구현): 예전엔 즉발 데미지 하나뿐이었다 - 실제로 대상을
  // 붙잡지도, 들어올리지도, 함께 이동하지도 않았다. 이제 R을 자체 상태
  // 머신(_sett.rSeq)으로 관리하고, update(dt)에서 매 프레임 진행시킨다
  // (Master Yi 알파스트라이크와 동일하게 setTimeout 난발 대신 dt 누적 방식).
  // 제압 상태는 새 CC 타입을 만들지 않고 기존 STUN을 그대로 재사용한다
  // (isStunned()가 이미 더미의 반격/이동 등 모든 곳에서 확인되고 있음).



  // 매 프레임 R 시퀀스를 진행시킨다. update(dt)에서 호출된다.



  // 착지 충격(요청 11/12/13): 착지 지점 기준 실제 범위 판정(findEnemiesInRadius
  // 재사용, 새 판정 안 만듦)으로 피해를 준다 - currentTarget 하나가 아니라
  // 그 범위 안의 모든 유닛(다른 설치된 더미 포함)에게 적용된다.



  // 요청 14/18: 정상 상태로 정확히 반환 - 제압 해제, 위치 제어권 반환,
  // 세트 자신의 행동 잠금 해제. R 착지 이후 CC(둔화)는 _settRImpact에서
  // 이미 걸어둔 상태이므로 여기서는 건드리지 않는다.





  // ---------------- 모데카이저 ----------------






  // W: 첫 사용 = 축적된 피해를 보호막으로 전환. 재시전(recastClips가 있을 때만
  // _castW가 이 메서드 대신 재시전 분기를 타므로, 여기는 "첫 사용"만 담당).
  // 버그 수정: 기존 공용 recastClips 분기는 재시전 판정을 canStartNewAction()
  // (즉 currentActionKey/currentPhase가 전부 비어있는지)에 의존했는데,
  // 모데카이저 W는 entryChain(여러 클립을 순서대로 강제 재생)이 딸려 있어
  // 그 애니메이션 체인이 끝나지 않거나 clip을 못 찾으면 currentActionKey가
  // 계속 남아있게 되고, 그러면 재시전 분기가 "canStartNewAction()===false"에
  // 걸려 영원히 트리거되지 않는다(재시전을 눌러도 처음부터 다시 시전되는
  // 것처럼 보임). 게임플레이 판정(보호막이 떠 있는가?)을 애니메이션 상태와
  // 완전히 분리해서, 시간 기반 플래그(_morde.wShieldActiveUntil) 하나로만
  // 재시전 여부를 결정한다 - 애니메이션은 있으면 재생하고 없어도 무관하다.




  // W 재시전: 남은 보호막의 일정 비율만큼 체력 회복 후 보호막 제거.




  // R(죽음의 세계) - 명세 1/7/8/20~28절: R은 단발성 스탯 훔치기 스킬이
  // 아니라 "대상을 확정하고, 지속시간 동안 독립된 결투 상태를 유지하다가,
  // 대상/자신의 사망 또는 지속시간 만료 중 먼저 오는 조건에 정확히 한 번
  // 종료되는" 상태 머신이어야 한다. 예전에는 스탯 훔치기(장갑/마저)만
  // 구현돼 있었고, 그마저도 단일 setTimeout(r.duration) 하나로만 되돌려서
  // 대상이 지속시간 전에 죽거나 모데카이저 자신이 죽어도 그 타이머가 그대로
  // 남아있었다(문서 15/16절 "대상/자신 사망 시 즉시 종료" 위반, 21절
  // "중복 modifier 방지"도 재시전 방지 장치가 전혀 없어 이론상 깨질 수
  // 있었다). 이제 _morde.isInDeathRealm을 단일 진실 공급원으로 삼아
  // _mordeUpdateR(dt, 매 프레임 tick)와 _die()가 동일한 종료 함수
  // _mordeEndDeathRealm()을 공유하도록 정리한다.


  // R 종료 - 지속시간 만료/대상 사망/모데카이저 자신 사망 중 어느 경로로
  // 들어오든 이 함수 하나가 정리를 전담한다(명세 22절 "일반 아이템/룬/기본
  // 스탯을 잘못 제거하지 마라" - bonusArmor/bonusMr에 정확히 저장해뒀던
  // stolenArmor/stolenMr 값만 되돌리고 그 외 필드는 손대지 않는다). 이미
  // 종료된 상태에서 또 호출되어도(예: 대상 사망과 지속시간 만료가 같은
  // 프레임에 겹치는 경우) isInDeathRealm 가드 덕분에 중복 실행되지 않는다.


  // 매 프레임 tick(세트 R의 _settUpdateR(dt)와 동일한 패턴) - 지속시간 만료와
  // 대상 사망을 여기서 감지한다(명세 14/15/17절). 모데카이저 자신의 사망은
  // _die()에서 별도로 즉시 처리한다(명세 16절 - 프레임을 기다리지 않고
  // 그 자리에서 바로 종료).



  // ---------------- 마스터 이 ----------------
  // 패시브(2연속 공격): 4번째 기본 공격마다 즉시 추가 타격(치명타 적용 가능,
  // 적중 시 효과도 발동)이 나간다. 또한 기본 공격마다 Q 쿨다운을 1초 감소.


  // GLB에 실제 masteryi_2013_passive.anm이 있으면(=data.passive.clips가
  // 비어있지 않으면) 다음 평타 한 번의 애니메이션만 그 클립으로 바꾼다.
  // 없는 GLB(폴백)라면 조용히 아무것도 하지 않고 기존 attack1/2 순환이
  // 그대로 이어진다 - 콘솔 에러 없음(문서 섹션 4/17 "추측해서 대체 애니메이션을
  // 만들지 않는다").


  // R(최후의 전사) 기본 지속 효과: "챔피언 처치 관여 시 기본 스킬(Q/W/E) 남은
  // 쿨다운 70% 감소" - R을 켜지 않았어도 항상 작동하는 상시 패시브다. R이
  // 활성 상태일 때 처치하면 추가로 지속시간이 7초 늘어난다.
  //
  // 버그 수정(Q 쿨다운 비정상 감소 문서 BUG B): 이전에는 target을 전혀
  // 받지 않아서 "누구를 처치했는가"를 확인할 방법이 없었다 - 그 결과 Q로
  // 학습용 허수아비의 체력을 0 밑으로 떨어뜨리기만 해도(더미는 실제로는
  // 안 죽고 2% 바닥에서 멈추지만, wouldKill 자체는 그 이전에 이미 true로
  // 확정됨) 챔피언 처치 관여 취급을 받아 Q/W/E가 70% 감소해버렸다. 이제
  // target을 받아 실제로 챔피언급 유닛인지 확인하고, 아니면(학습용
  // 허수아비 등) 아무 것도 하지 않는다 - "Q라서 막는다"가 아니라 "처치
  // 대상이 챔피언이 아니라서 막는다"가 정확한 규칙이다(일반 평타로
  // 죽여도 마찬가지로 막혀야 한다).






  /* ================================================================
     Alpha Strike (일격필살) - 상태 기반 구현
     ----------------------------------------------------------------
     상태: CAST -> TARGETING -> MARKING(최대 4타) -> REAPPEAR -> DONE
     매 프레임 update(dt) 안에서 _masteryiUpdateAlphaStrike(dt)로 진행된다
     (setTimeout 체인이 아니라 게임 tick 기반 - 요청 문서 1 섹션 5). 실제
     로직상 위치(this.root.position)는 각 타격 대상으로 즉시 이동시키고,
     화면 연출(잔상/참격)만 VFX로 따로 그려서 "로직 위치와 렌더링 위치를
     분리"한다(섹션 7).
     ================================================================ */




  // 최초 대상(primaryTarget) 결정 - 이미 currentTarget이 사거리 안의 유효한
  // 적이면 그것을, 아니면 사거리 안에서 가장 가까운 유효한 적을 찾는다.



  // 추가 대상 탐색(섹션 3/4) - primaryTarget(또는 마지막 이동 지점) 주변에서
  // 아직 맞지 않은 적을 거리순으로 우선 선택하고, 유효한 새 대상이 없으면
  // (완전 랜덤이 아니라) 이미 맞은 대상 중 가장 가까운 쪽을 다시 선택한다 -
  // "다른 대상이 없으면 같은 적을 연속 공격"(원작 그대로).






  // 피해 계산 - 기본/치명타를 완전히 별도 함수로 분리(섹션 10/12). hitIndex
  // 0(첫 타격/표식)은 100% 값, 1~3(추가 타격)은 ALPHA_STRIKE 반복 배율
  // (extraHitPercent, 라이브 25%)이 적용된다.







  // 온힛(섹션 13/14) - Q의 각 타격은 basicAttack()을 호출하지 않고 이 전용
  // 의사-공격 경로로 On-Hit 소스와 연동된다. 이 데모에 실제로 구현된
  // On-Hit 소스는 E(우주류 검술)의 고정 피해뿐이라 그것을 75% 계수로 적용한다
  // - 아이템 On-Hit(Kraken Slayer 등)이 나중에 추가되면 이 함수 한 곳만
  // 확장하면 된다.



  // 한 번의 타격을 실제로 적용한다. delayApply가 true면(첫 타격/표식만
  // 해당) 즉시 데미지를 넣지 않고 alpha.markDamagePending에 함수로
  // 저장해뒀다가 스킬 종료 시점(_masteryiFinishAlphaStrike)에 실행한다 -
  // 기존에 문서화된 "표식 피해는 시전이 끝났을 때 들어간다" 규칙을 그대로
  // 유지.
  //
  // 버그 수정(Q 쿨다운 비정상 감소 문서 BUG A/전체 원칙): 이 함수는
  // _onBasicAttackHit()/_masteryiOnBasicAttackHit()를 그 어떤 경로로도
  // 호출하지 않는다 - Q의 각 타격은 "4번의 기본 공격"이 아니라 "Q 전용
  // 이벤트"다. 그래서 Q 타격 자체는 Q 쿨다운(basicAttackCdrSec)도, 패시브
  // attackCount도 절대 건드리지 않는다(아래 콘솔 로그로 매 타격마다 Q CD/
  // Passive Count가 실제로 변하지 않는 것을 바로 확인할 수 있다).



  // 재등장 위치(재등장 알고리즘 문서 전체) - Q 종료 "직전"(여기, 스킬 종료
  // 시점)에만 계산한다. 미리 몇 프레임 전에 계산해서 저장해두지 않는다
  // (문서 섹션 18 "특히 최종 위치를 미리 몇 프레임 전에 계산해 저장해두지
  // 마라"). 순서: 유효성 검사 -> 현재(최신) 위치 -> 추적 가능 거리 확인 ->
  // 선택 방향 유무 -> 75(스케일 근사) 거리 -> 벽/맵 경계 보정 -> 최종 확정.



  // Q 시전 시작(섹션 2) - 쿨다운/마나/행동 가능 여부를 확인하고 상태
  // 머신을 초기화한다. 이 시점부터 finishAlphaStrike()가 끝날 때까지
  // Q가 위치/행동을 전담하며, 일반 이동/전투 로직은(moveTo의 STARTUP/ACTIVE
  // 가드, canStartNewAction 등 기존 인프라) 이 상태를 절대 덮어쓰지 않는다.



  // Q 진행 중 E/R처럼 durationSec 기반 status로 관리되는 버프의 만료 시각을
  // 뒤로 밀어준다(섹션 15/26) - "밀어주기" 방식: 시작 시각만 기록해두고,
  // 실제로 미는 것은 Q가 끝나는 시점(_masteryiResumeBuffsAfterAlphaStrike)에
  // 한 번에 처리한다. Q 진행 시간이 프레임마다 유동적이라 시작~종료 사이의
  // 실제 경과 시간(performance.now() 기준)을 그대로 사용한다.



  // Q 종료 시점에 호출 - Q가 진행되는 동안 흘러버린 시간만큼 E(masteryiE)/
  // R(masteryiR_as, masteryiR_ms) 상태이상의 만료 시각과 R 관련 내부
  // 타임스탬프(rActiveUntil, subStates.R)를 그대로 뒤로 밀어서 "Q 시전
  // 시간만큼 E/R이 소모되지 않고 그대로 유지"되게 한다(섹션 15/19/26).



  // 매 프레임 진행(섹션 5) - setTimeout 체인 대신 dt 누적으로 CAST ->
  // MARKING(최대 4타) -> REAPPEAR 순서를 그대로 진행한다.



  // 다음 타격 대상을 찾아 마킹하고, 로직상 위치를 그 대상 쪽으로 즉시
  // 옮긴다(섹션 7 - 로직 위치는 순간 이동, 화면 연출은 잔상 VFX로 별도
  // 처리). 대상이 전혀 없으면(전멸 등) 이번 스텝은 조용히 건너뛴다(피해
  // 없음). 대상을 찾았는지 여부를 boolean으로 반환한다 - 호출부가 "주 대상
  // 비대상 + 대체 대상 전무" 상황에서 Q를 조기 종료할지 판단하는 데 쓴다
  // (재등장 알고리즘 문서 섹션 13).



  // Q 종료(섹션 19, 모델 비가시화 문서 섹션 7/8/13) - 재등장 위치를 먼저
  // 확정하고, 그 다음 위치를 실제로 옮기고, 그 다음에야 모델을 다시 보이게
  // 한다("위치 확정 -> 모델 표시" 순서. 반대로 하면 한 프레임 동안 잘못된
  // 위치에 모델이 나타날 수 있다). 그 뒤에야 비대상 해제/상태 복귀/대기
  // 이동 재개 순서로 처리한다.



  // 강제 취소(예: 사망/GLB 교체 등 예외 상황) - 진행 중이던 markDamagePending을
  // 폐기하고 비대상 상태와 모델 가시성을 확실히 복구한다(모델 비가시화
  // 문서 섹션 13/14 "예외 종료도 반드시 복구"). 정상 종료 경로
  // (_masteryiFinishAlphaStrike)와 별개로, 상태가 꼬였을 때 안전하게
  // 빠져나오기 위한 안전망이다.



  // Q 진행 중 우클릭 방향 재지정(섹션 25, 재등장 알고리즘 문서 섹션 4~7) -
  // 재등장 방향만 갱신하고, 일반 이동 명령(moveTo)은 실행하지 않는다.
  // 여러 번 클릭해도 큐에 쌓지 않고 마지막 유효 입력만 남긴다(그냥
  // 덮어쓰므로 자연히 "마지막 값"이 된다). canSelectExitDirection이 이미
  // 잠긴 뒤(재등장 계산 시작 이후)의 입력은 무시한다.



  // W(명상) 중에는 E(우주류 검술)/R(최후의 전사)의 남은 지속시간이 소모되지 않는다.
  // 시작 시 남은 시간을 저장하고, W가 끝날 때 같은 양만큼 만료 시각을 뒤로 민다.

















  // 버그 수정("W 명상 마나 감소 안 됨") - CHAMPION_DATA.masteryi.W.manaPercentMaxPerSec
  // 필드가 정의만 돼 있고 실제로 읽는 코드가 어디에도 없었다(요청 문서
  // 그대로 - "정확히 초당 비용이 감소하도록"). update(dt)에서 매 프레임
  // 호출되며, frameCount가 아니라 dt(실제 경과 초)를 그대로 곱해서
  // 차감하므로 FPS가 30/60/120 어느 쪽이든 초당 실제 소모량이 동일하다.
  // mp -= (maxMp * manaPercentMaxPerSec/100) * dt 형태로 요청 그대로 구현.


  // E = INSTANT_WEAPON_BUFF. 캐릭터 발동 애니메이션이 없고(문서 그대로),
  // ACTION_STATE를 전혀 건드리지 않는다 - 지금 Idle이면 Idle 그대로, 이동
  // 중이면 Run 그대로, 심지어 다른 스킬의 RECOVERY 구간 중이어도 그대로
  // 유지된 채 상태 효과만 즉시 켜진다. 실제 강화는 _onBasicAttackHit()이
  // hasStatus(this,'MASTERYI_E')를 확인해서 "같은 평타 애니메이션 + 다른
  // 피해 계산"으로 처리한다(ANIMATION과 GAMEPLAY DAMAGE를 분리).





  // ---------------- 초가스 ----------------
  // "처치" 관련 효과(패시브 육식, R 포식 스택)를 모든 데미지 소스에서
  // 공통으로 판정하기 위한 훅. wouldKill(=명중 직전 hp <= dmg)일 때 호출한다.








  // 활성화 후 다음 3회 기본 공격에 실제로 붙는 가시 피해 - _onBasicAttackHit에서 호출.







  // ---------------- 리 신 애니메이션 ----------------









  // 리 신 E/R 모션 잠금: 애니메이션이 재생되는 동안 이동 입력을 받지 않는다.
  // 모션 종료 시에만 일반 로코모션으로 복귀한다. 별도 메시지는 띄우지 않는다.



  // ---------------- 리 신 ----------------
  // 패시브(질풍격): Q/W/E/R 중 아무거나 사용하면 다음 2회 평타 공격속도
  // +40%, 1타/2타에 각각 기력을 회복한다. 실제 지속시간이 아니라 "다음
  // 2회 타격"으로 소모되는 버프라 duration은 안전장치용 상한(8초)만 두고,
  // passiveHitsLeft 카운터로 실제 소모를 관리한다.




  // Q 1타(음파): 직선 스킬샷. 적중 시 표식을 남기고 3초 안에 재시전 가능.


  // W 1타(방호): 아군/와드에게 돌진 - 이 데모에는 아군이 없어 실제 돌진/보호막
  // 대상이 없다(문서에 없는 수치를 만들어 넣지 않기 위해 셀프 캐스트로
  // 대체하지 않음). 대신 재시전 창만 정상적으로 연다.


  // E 1타(폭풍): 자기중심 범위 마법피해 + 시야. 적중한 대상 전부를 기억해뒀다가
  // E 2타(무력화)에서 그 대상들에게만 둔화를 건다.


  // R(용의 분노): 타겟 락 궁극기. 피해 + 넉백(실제 좌표 이동) + 에어본.
  // 넉백 도중 다른 적과 충돌하는 추가 피해는 이 데모에 대상이 하나뿐이라
  // 구현하지 않는다(섹션 18 "임의 판정 추가 금지").



  // 활성 오버라이드 하나를 실제로 "소비"한다 - 클립 목록(시퀀스면 다음
  // 인덱스 클립을 앞에 붙임) 확정, oneShot이면 잔여 사용 횟수 차감 후
  // 0이 되면 등록 해제 + 애니메이션 전용 서브 상태(clearSubState)도 함께
  // 정리한다. beatsCrit 분기와 일반 오버라이드 분기가 완전히 동일한 소비
  // 로직을 쓰므로 한 곳으로 모았다(중복 제거).
  _consumeAttackOverride(override, handHint = null) {
    const overrideId = override.id;
    const key = `attackOverride:${override.id}`; // 'attack'으로 시작 -> _onActionRecoveryComplete가 콤보 재교전 로직을 그대로 적용
    let overrideClips = override.clips;
    if (override.sequenceClips && override.sequenceClips.length) {
      // 버그 수정(요청: "Q에는 패시브가 적용되지 않는다"의 연장선): 예전엔
      // useIndex 순서(항상 0번째→1번째)로만 클립을 뽑아서, 세트가 실제로
      // 오른손 차례일 때 Q를 써도 무조건 Spell1_A(왼손용으로 설계된 클립)가
      // 먼저 나갔다 - "실제 손"과 "재생되는 모션"이 어긋날 수 있었다.
      // handHint(호출부에서 미리 계산해온, 지금이 실제로 왼손/오른손 중
      // 어느 차례인지)가 있고 시퀀스가 정확히 2개(왼손용/오른손용)라면,
      // useIndex 진행 순서 대신 handHint에 맞는 클립을 직접 골라 애니메이션과
      // 손 라벨이 항상 일치하게 한다. handHint가 없는 다른 챔피언/스킬의
      // 오버라이드는 기존 useIndex 순서 그대로 동작한다(영향 없음).
      const labels = ATTACK_HAND_LABELS[this.championId];
      let seqName;
      if (handHint && labels && override.sequenceClips.length === labels.length) {
        const handIdx = labels.indexOf(handHint);
        seqName = override.sequenceClips[handIdx >= 0 ? handIdx : Math.min(override.useIndex, override.sequenceClips.length - 1)];
      } else {
        seqName = override.sequenceClips[Math.min(override.useIndex, override.sequenceClips.length - 1)];
      }
      overrideClips = [seqName, ...override.clips];
      override.useIndex++;
    }
    const attackData = { clips: overrideClips, cancelable: true };
    if (override.oneShot) {
      override.usesRemaining -= 1;
      if (override.usesRemaining <= 0) {
        this.clearAttackOverride(override.id);
        // 업데이트(가렌 Q 문서 12/13절 애니메이션 레이어 대응): 오버라이드가
        // 실제로 소진되는 이 시점에 애니메이션 전용 서브 상태도 함께 꺼서
        // Run_Spell1이 실제 강화 평타 소모 시점과 맞물려 사라지게 한다.
        // 게임로직 TODO: 문서는 "Q 소모 = 실제 HIT 성공 시점"이라고 명시한다
        // (Windup 중 대상이 사라지면 소모하면 안 됨). 하지만 이 지점은 스윙
        // 시작(Windup 진입) 시점이라 HIT 판정 이전이다 - 기존 평타 시스템의
        // 소모 타이밍 자체를 바꾸는 것은 게임 로직 변경이라 이번 범위에서는
        // 건드리지 않았고, 애니메이션(서브 상태)만 그 기존 타이밍을 그대로
        // 따라가게 맞췄다. 실제로 "HIT 성공 시에만 소모"를 구현하려면 이
        // 블록을 onFire(HIT 이벤트) 콜백 쪽으로 옮기고, 빗나감/대상 소실
        // 시에는 override.usesRemaining을 되돌리는 로직이 필요하다.
        this.clearSubState(override.id);
      }
    }
    return { overrideId, key, attackData };
  }

  _beginAttackSwing() {
    if (this.championId === 'renekton') return this._renektonBeginAttackSwing();
    // 마스터 이 명상 중 공격 입력 = W 즉시 종료 + E/R 지속시간 복구 + 즉시 평타.
    if (this.championId === 'masteryi' && this.currentActionKey === 'masteryiW') {
      this._clearActionTimers();
      this._masteryiEndMeditate('attack');
    }
    const target = this.currentTarget;
    if (!target || target.hp <= 0) { this.currentTarget = null; return; }
    if (isSilenced(this)) return; // 기획안 8절: 침묵 중에는 기본 공격도 나가지 않는다
    if (isCrowdControlled(this)) return; // 기절/속박 중에도 마찬가지
    const dirToTarget = new THREE.Vector3().subVectors(target.mesh.position, this.root.position);
    dirToTarget.y = 0; dirToTarget.normalize();

    // 치명타는 이 스윙을 시작하는 시점에 한 번만 굴리고, 그 결과를 그대로
    // RELEASE 콜백까지 들고 가서 투사체에 실어 보낸다(같은 공격 인스턴스의
    // 결과가 명중 시점에 바뀌지 않도록 - 요청 17). 이 willCrit은 오직 "이번
    // 스윙(1타)"의 치명타 여부다 - 마스터 이 패시브의 2타(즉시 보너스 타격,
    // _masteryiOnBasicAttackHit)는 별도로 자기 자신의 치명타를 독립적으로
    // 굴린다. 즉 1타/2타는 이미 서로 다른 주사위를 굴려 각자의 치명타 여부와
    // 피해량을 정확히 계산한다 - 여기서 바뀌는 것은 "어떤 애니메이션을
    // 보여주는가"뿐이다.
    const willCrit = Math.random() < this.stats.critChance;
    // 요청(다리우스/노틸러스형): 치명타가 기본적으로 최우선("치명타는 이 큐와
    // 무관하게 최우선"), 그 다음이 활성 오버라이드 중 priority가 가장
    // 높은 것, 마지막이 평소의 attack1/2/3 콤보 순환이다. 단, 마스터 이
    // 패시브 4타처럼 beatsCrit:true로 등록된 오버라이드는 예외적으로 치명타
    // 애니메이션보다 먼저 소비된다(요청: "패시브 공격일 때는 크리티컬이어도
    // 패시브 애니메이션을 내보낸다") - 실제 피해 계산(willCrit)에는 전혀
    // 영향을 주지 않고 오직 재생되는 클립만 바뀐다. 오버라이드가 적용된
    // 스윙은 comboIndex를 건드리지 않는다(콤보는 그대로 유지된 채 중간에
    // 한 번 끼워넣어지는 개념).
    const override = this._pickAttackOverride();
    let key, attackData, overrideId = null, attackHand = null;
    // 버그 수정(요청: "세트 Q에는 패시브가 적용되지 않고 있다"): override를
    // 소비하는 두 분기(beatsCrit / 일반 override) 모두 지금까지
    // attackHand를 전혀 설정하지 않았다 - null로 남아있었다. 그 결과
    // Q로 강화된 평타(Spell1_A/B)가 실제로 왼손/오른손 중 어느 쪽
    // 차례였는지 알 수 없어서, 오른손 차례에 Q 강화 평타가 나가도
    // 패시브의 오른손 추가 피해(_settOnBasicAttackHit의 attackHand
    // ==='RIGHT' 분기)가 전혀 적용되지 않고 있었다. comboIndex는 override
    // 소비 시 건드리지 않는다는 기존 원칙(중간에 끼워넣는 개념)은 그대로
    // 유지하면서, "지금 이 자리가 원래 왼손/오른손 중 어느 차례였는지"만
    // 미리 계산해서 attackHand에 기록한다 - 실제 comboIndex 증가는 여전히
    // 일반 콤보 분기에서만 일어난다.
    const overrideAttackHand = (() => {
      const labels = ATTACK_HAND_LABELS[this.championId];
      if (!labels) return null;
      const idx = this.championId === 'sett'
        ? (this._settAttackStep % 2)
        : (this.comboIndex % getAttackSequenceNames(this.championId).length);
      return labels[idx] || null;
    })();
    // 요청 견고성 보강: 왼손/오른손처럼 엄격한 좌우 교대가 있는 챔피언은
    // 치명타가 터져도 별도의 'crit' 포즈로 바뀌면 안 된다(실제 LoL에서도
    // 치명타는 애니메이션이 아니라 피해 배율일 뿐 - 세트가 치명타를 내도
    // 여전히 왼손/오른손 펀치 그대로 나간다). 이 조건이 없으면 크리티컬
    // 확률이 0이 아닌 순간(예: 아이템 시스템이 나중에 추가되는 경우) 다시
    // 같은 버그(치명타 스윙이 comboIndex를 건너뛰어 좌우 순서가 밀림)가
    // 재발할 수 있다.
    // 버그 수정(가렌/다리우스를 ATTACK_SEQUENCE_OVERRIDES에 추가하면서 분리):
    // 예전엔 이 플래그를 "ATTACK_SEQUENCE_OVERRIDES에 등록됐는가"로만
    // 판단했다 - 그런데 그 테이블은 원래 "실제 존재하는 평타 클립 개수"만
    // 나타내는 용도였다. 가렌/다리우스를 그 테이블에 추가(평타 중복 재생
    // 버그 수정)하면서 그대로 뒀다면, 문서 3-2/5-2절이 요구하는 "치명타 시
    // 별도 Crit 포즈"까지 부작용으로 함께 꺼졌을 것이다. 이제
    // CRIT_PRESERVES_SEQUENCE(마스터 이/세트 전용)만 별도로 확인한다.
    const critBreaksSequence = !CRIT_PRESERVES_SEQUENCE.has(this.championId);
    if (override && override.beatsCrit) {
      ({ overrideId, key, attackData } = this._consumeAttackOverride(override, overrideAttackHand));
      attackHand = overrideAttackHand;
    } else if (willCrit && critBreaksSequence) {
      key = 'crit';
      attackData = this.actionData.crit;
    } else if (override) {
      ({ overrideId, key, attackData } = this._consumeAttackOverride(override, overrideAttackHand));
      attackHand = overrideAttackHand;
    } else {
      // 버그 수정(핵심): 예전엔 챔피언과 무관하게 무조건 3칸(attack1/2/3)을
      // 순환했다. 좌우 2종류 모션만 있는 챔피언(마스터 이/세트)에게 억지로
      // 3칸을 씌우면 순환 경계에서 같은 쪽이 두 번 연속 나왔다. 이제 실제
      // 존재하는 모션 개수(ATTACK_SEQUENCE_OVERRIDES)만큼만 순환한다.
      const seqNames = getAttackSequenceNames(this.championId);
      // 세트 패시브 "왼손 이후 2초 타임아웃"은 이제 매 프레임
      // _settPassiveTimeoutTick()에서도 관리되지만(요청 7 "업데이트 루프에서도
      // 확인"), 그 프레임과 이 스윙 사이에 아주 근소한 시간차가 있을 수
      // 있으므로 스윙 시작 직전에도 동일한 함수를 한 번 더 호출해 확정한다
      // - 조건식을 두 곳에 따로 적어 어긋나지 않도록 단일 함수만 재사용한다.
      this._settPassiveTimeoutTick();
      const idx = this.comboIndex % seqNames.length;
      key = seqNames[idx];
      attackData = this.actionData[key];
      // 사용자 확인: 원본 롤에서 Attack1a/1b/1c(그리고 강화판 Emp_A/B/C)는
      // "교체용 변형 클립"이 아니라 실제로 한 번의 평타를 이루는 3단
      // 연속 모션이다. 이전에 "매번 하나만 순환 재생"으로 바꿨던 건 잘못된
      // 판단이었다 - 다시 3단을 이어붙여 재생하는 방식으로 되돌린다.
      if (this.championId === 'nilah') {
        const empowered = this._nilahQActive();
        const nilahSequence = key === 'attack1'
          ? (empowered ? ['Attack1_Emp_A', 'Attack1_Emp_B', 'Attack1_Emp_C'] : ['Attack1a', 'Attack1b.anm', 'Attack1c'])
          : (key === 'attack2' ? (empowered ? ['Attack2_Emp_A', 'Attack2_Emp_B', 'Attack2_Emp_C'] : ['Attack2a', 'Attack2b.anm', 'Attack2c']) : null);
        const hasSequence = Array.isArray(nilahSequence) && nilahSequence.every(name => !!this.findAnimation(name));
        if (hasSequence) {
          const seqTiming = nilahSequence
            .map(name => this.findAnimation(name))
            .reduce((sum, clip) => sum + (clip?.duration || 0), 0);
          // 모션 수정("평타가 여전히 이상하다"): 애니메이션은 이제 3단
          // 전체(약 0.5~0.8초)를 재생하는데, 타격 판정 타이밍(startup/
          // recovery)은 여전히 첫 번째 클립 하나만 보고 계산된 예전 값을
          // 그대로 물려받고 있었다 - 그러면 실제로는 칼날이 1단(전체의
          // 1/3도 안 되는 지점)에서만 휘둘러졌을 때 이미 데미지가 터지고,
          // 그 뒤로도 2단/3단이 계속 재생되는 동안은 이미 다음 판정을
          // 기다리는 상태가 되어 애니메이션과 타격 체감이 어긋났다.
          // deriveActionTiming을 3단 전체 길이 기준으로 다시 호출해서
          // startup/recovery를 시퀀스 전체 비율에 맞게 재계산한다.
          const seqRatioTiming = deriveActionTiming({ duration: seqTiming }, { fireRatio: 0.45 });
          attackData = {
            ...attackData,
            animationSequenceClips: nilahSequence,
            clips: [nilahSequence[0]],
            sequenceNaturalDuration: seqTiming,
            startup: seqRatioTiming.startup,
            recovery: seqRatioTiming.recovery,
          };
        } else if (empowered) {
          const empKey = key === 'attack1' ? 'attack1Emp' : (key === 'attack2' ? 'attack2Emp' : null);
          if (empKey && this.actionData[empKey]) attackData = this.actionData[empKey];
        }
      }
      // 이 스윙이 실제로 "몇 번째 자리"인지(attackHand)를 여기서 단 한 번
      // 확정해서 끝까지 들고 간다(요청 7 "AttackInstance에 사용한 모션을
      // 기록") - 이후 온힛 로직(세트 패시브 등)이 별도로 손 상태를 다시
      // 추측/토글하지 않고 이 값을 그대로 쓴다(요청 10 "게임 로직 순서 ≠
      // 실제 애니메이션" 불일치 방지).
      const labels = ATTACK_HAND_LABELS[this.championId];
      if (labels) attackHand = labels[idx];
      this.comboIndex++;
    }

    // 버그 수정(요청): "오른손 공속이 8배"가 아니라 "공격 선딜레이(windup)가
    // 8분의 1로 감소"하는 것이었다. 예전엔 windup과 recovery를 전부 8로
    // 나눠서 스윙 전체 시간이 1/8이 됐는데, 실제로는 선딜레이만 줄어들고
    // recovery(후딜레이)는 왼손과 동일한 정상 값을 그대로 유지해야 한다.
    const baseInterval = getAttackInterval(this.stats);
    const baseWindup = baseInterval * this.stats.windupPercent;
    const baseRecovery = Math.max(0, baseInterval - baseWindup);
    let windup = baseWindup;
    const recovery = baseRecovery; // 오른손이어도 recovery는 그대로 - 선딜레이만 줄어든다
    if (this.championId === 'sett' && attackHand === 'RIGHT') {
      const p = this._champData() && this._champData().passive;
      const mult = (p && p.rightHandAttackSpeedMultiplier) || 1;
      windup = baseWindup / mult;
    }
    const attackInterval = windup + recovery; // 이번 스윙의 실제 유효 시간(로그/timeScale 계산용)

    // 요청 21: 지정된 형식 그대로 콘솔 로그를 남긴다 - Q 강화 스윙인지
    // (overrideId==='Q') 여부에 따라 [SETT AA]/[SETT Q-AA] 접두어를 구분한다.
    if (this.championId === 'sett' && attackHand) {
      const tag = overrideId === 'Q' ? '[SETT Q-AA]' : '[SETT AA]';
      console.log(`${tag} HAND = ${attackHand}`);
      console.log(`${tag} ANIMATION = ${key}`);
      console.log(`${tag} ATTACK SPEED = ${attackHand === 'RIGHT' ? 'WINDUP × 1/8 (recovery 동일)' : 'NORMAL'}`);
    }

    // 가능하면 실제 GLB 애니메이션 길이를 windup+recovery(attackInterval)에
    // 맞춰 재생 속도(timeScale)를 보정해서, Release 시점이 시각적으로도
    // 자연스럽게 맞아떨어지도록 한다(요청 11 단서 조항).
    const clip = this.resolveClip(attackData.clips);
    const naturalDuration = clip ? clip.duration : attackInterval;
    const timeScale = naturalDuration > 0 ? THREE.MathUtils.clamp(naturalDuration / attackInterval, 0.4, 3.0) : 1.0;

    this.runAction(key, STATE.ATTACK, {
      faceDir: dirToTarget,
      startupOverride: windup,
      recoveryOverride: recovery,
      timeScaleOverride: timeScale,
      dataOverride: attackData,
      animationSequenceClips: attackData.animationSequenceClips || null,
      onFire: () => {
        const originPos = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.75, 0)).addScaledVector(dirToTarget, 0.35);
        // 요네 패시브(사냥꾼의 길 - Steel and Spirit): 평타가 강철 검/아자카나의
        // 검을 번갈아 사용하며, 아자카나의 검 차례일 때만 물리 50%+마법 50%로
        // 나뉜다. 이번 스윙이 그 차례인지 먼저 확정하고(_yoneIsAzakanaSwing),
        // 실제 명중 처리 시점에 한 번만 다음 차례로 넘긴다(_yoneAdvanceSwordState) -
        // 온힛 판정과 무관하게 "스윙이 실제로 발생"할 때 토글해야 하므로 여기서.
        const yoneAzakana = this.championId === 'yone' && this._yoneIsAzakanaSwing();
        if (this.championId === 'yone') this._yoneAdvanceSwordState();
        // 애쉬 Q(궁사의 집중) 다발 공격: 최대 집중을 소모해 Q를 사용한 뒤
        // 나가는 "첫" 기본 공격은 평범한 단일 대상 공격이 아니라, 6발의
        // 화살로 갈라져 여러 대상에게 나뉘어 명중하는 다발 공격이다. 이
        // 스윙은 다중 대상이라 아래의 단일 대상 attackResult/투사체 경로와
        // _onBasicAttackHit()을 전혀 거치지 않고 완전히 분리된 전용 함수
        // (_asheFireFlurry)로 처리한다(요네 아자카나 분기와 동일한 위치의
        // "이번 스윙이 특수한가" 확인).
        if (this.championId === 'ashe' && this._ashe && this._ashe.flurryPending) {
          this._ashe.flurryPending = false;
          vfx.spawn('basicAttack', originPos, dirToTarget);
          this._asheFireFlurry(target, originPos, dirToTarget, willCrit);
          return;
        }
        const attackResult = {
          rawDamage: this.stats.attackDamage,
          damageType: DAMAGE_TYPE.PHYSICAL,
          isCritical: willCrit,
          critMultiplier: this.stats.critMultiplier,
          armorPenPercent: this.armorPenPercent || 0,
          bonusArmorIgnorePercent: (this.championId === 'yasuo' && this._yasuo.rArmorBuffUntil > performance.now()) ? this._champData().R.armorIgnoreBonusPercent : 0,
          yoneAzakana,
        };
        vfx.spawn('basicAttack', originPos, dirToTarget);
        // 버그 수정: 지금까지 모든 챔피언의 평타가 예외 없이 물리 투사체를
        // 발사했다 - 근접 챔피언(가렌/다리우스/세트/모데카이저/마스터
        // 이/초가스/리 신 등 사거리 125~175 전부)도 킨드레드 같은 원거리
        // 챔피언과 똑같이 화살이 날아가는 것처럼 보였다. 사거리 300을
        // 기준으로 근접/원거리를 나눠서, 근접은 투사체 이동 없이 그 자리에서
        // 즉시 명중 처리한다(실제 LoL도 근접 평타는 판정이 즉시 발생한다).
        // 새 데이터를 추가하지 않고 이미 있는 stats.attackRange 하나로만
        // 판단한다.
        const isRangedAutoAttack = this.stats.attackRange > 300;
        if (isRangedAutoAttack) {
          projectiles.spawn({
            from: originPos, target, speed: this.stats.projectileSpeed,
            color: willCrit ? 0xffdf6b : 0xdff0ff,
            realmId: this.realmId, // Phase 2 요청 17 - 발사 시점 realm 스냅샷(모데카이저 R 등으로 비행 중 target의 realm이 바뀌면 명중 취소)
            onHit: (t) => {
              // 요청(칼바람 포탑 - 평타로 공격 가능해야 함): 포탑은 세트
              // 패시브/평타 콤보/치명타 처리와 완전히 무관한 별도 구조물이라
              // (요청 문서 11절) 일반 챔피언/더미 피해 경로(applyDamage +
              // _onBasicAttackHit)로 보내지 않고 전용 함수로 분리한다 -
              // applyDamageToTurret()이 방패/이중갑옷/요새화를 전부 처리한다.
              if (t.isTurret) { applyDamageToTurret(t, attackResult, { isRanged: true, source: this }); return; }
              if (hasStatus(t, 'NILAH_W_DODGE')) { console.log('[NILAH W] 기본 공격 회피'); return; }
              if (t.isMinion) {
                const wouldKill = t.hp > 0 && t.hp <= calculateDamage({ ...attackResult, target: t });
                applyDamageToMinion(t, attackResult, true);
                this._onBasicAttackHit(t, overrideId, wouldKill, attackHand, willCrit);
                return;
              }
              if (t.isInhibitor) { applyDamageToInhibitor(t, attackResult); return; }
              if (t.isNexus) { applyDamageToNexus(t, attackResult); return; }
              const wouldKill = t.hp > 0 && t.hp <= attackResult.rawDamage; applyDamage(t, attackResult); this._onBasicAttackHit(t, overrideId, wouldKill, null, willCrit);
            },
          });
        } else if (target.hp > 0) {
          if (target.isTurret) { applyDamageToTurret(target, attackResult, { isRanged: this.stats.attackRange > 300, source: this }); return; }
          if (hasStatus(target, 'NILAH_W_DODGE')) { console.log('[NILAH W] 기본 공격 회피'); return; }
          if (target.isMinion) {
            const wouldKill = target.hp > 0 && target.hp <= calculateDamage({ ...attackResult, target });
            applyDamageToMinion(target, attackResult, true);
            this._onBasicAttackHit(target, overrideId, wouldKill, attackHand, willCrit);
            return;
          }
          if (target.isInhibitor) { applyDamageToInhibitor(target, attackResult); return; }
          if (target.isNexus) { applyDamageToNexus(target, attackResult); return; }
          if (attackResult.yoneAzakana) {
            const wouldKill = target.hp > 0 && target.hp <= attackResult.rawDamage;
            this._yoneApplyAlternatingAttackDamage(target, attackResult);
            this._onBasicAttackHit(target, overrideId, wouldKill, attackHand, willCrit);
          } else {
            const wouldKill = target.hp > 0 && target.hp <= attackResult.rawDamage;
            applyDamage(target, attackResult);
            this._onBasicAttackHit(target, overrideId, wouldKill, attackHand, willCrit);
          }
        }
      },
    });
  }

  /* ---------------- 레넥톤 ---------------- */







































  consumeHoneyFruit() {
    if (this.championId !== 'renekton') return 0;
    return this._renektonGainRage(5);
  }
  /* ---------------- cooldown / mana ---------------- */
  updateCooldowns(dt) {
    for (const k of Object.keys(this.cooldowns)) if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    updateSkillUI(this.cooldowns);
  }
  regen(dt) {
    // 버그 수정(전 챔피언 공통 - 닐라 실제 bin 데이터로 발견): hpRegen/mpRegen은
    // 리그 오브 레전드 표준 표기 그대로 "5초당" 수치로 저장되어 있는데
    // (닐라 실제 bin의 baseStaticHPRegenModifiable=1.2(초당)*5=6.0이 코드의
    // hpRegen:6과 정확히 일치해서 확인됨), 여기서는 그 값을 dt(초)에 그대로
    // 곱해서 실제로는 5배 더 빠르게 재생되고 있었다.
    // 아이템 패시브(요정의 부적/원기 회복의 구슬) - 기본 재생량에 곱해지는
    // 퍼센트 보너스. 기존 hpRegen/mpRegen 자체는 건드리지 않고(레벨업 시
    // computeChampionStats()가 다시 계산하는 기준값) 여기서만 곱한다.
    const mpRegenMult = 1 + (this.itemBonusMpRegenPercent || 0);
    const hpRegenMult = 1 + (this.itemBonusHpRegenPercent || 0);
    this.mp = Math.min(this.maxMp, this.mp + dt * (this.mpRegen != null ? this.mpRegen : 4) * mpRegenMult / 5);
    if (this.hp > 0 && this.state !== STATE.DEAD) this.hp = Math.min(this.maxHp, this.hp + dt * (this.hpRegen || 0) * hpRegenMult / 5);
    updateBars(this);
  }

  /* ---------------- generic ability entry point (추가 수정사항 17) ---------------- */
  castAbility(slot, mouseWorldPoint) {
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
  }

  // 추가 수정사항 19: "모션 테스트" 버튼 전용 진입점. 쿨다운/마나를 소모하지
  // 않고, 진행 중이던 액션을 즉시 정리한 뒤 매핑된 스킬 모션을 그대로 재생한다
  // (실제 게임플레이 이벤트-VFX/투사체/데미지-까지 동일하게 실행되어 타이밍을
  // 눈으로 바로 확인할 수 있다).
  testAbility(slot, mouseWorldPoint) {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN) return;
    if (this.state === STATE.RECALL) this.cancelRecall();
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null;
    this.setState(STATE.IDLE);
    this._dispatchCast(slot, mouseWorldPoint, true);
  }

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
  _dispatchCast(slot, mouseWorldPoint, free) {
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
    if (this.championId === 'nilah') {
      if (slot === 'Q') return this._nilahCastQ(mouseWorldPoint, free);
      if (slot === 'W') return this._nilahCastW(mouseWorldPoint, free);
      if (slot === 'E') return this._nilahCastE(mouseWorldPoint, free);
      if (slot === 'R') return this._nilahCastR(free);
    }
    if (this.championId === 'vex' && slot === 'R') return this._vexCastR(free);
    if (this.championId === 'renekton') {
      if (slot === 'Q') return this._renektonCastQ(mouseWorldPoint, free);
      if (slot === 'W') return this._renektonCastW(mouseWorldPoint, free);
      if (slot === 'E') return this._renektonCastE(mouseWorldPoint, free);
      if (slot === 'R') return this._renektonCastR(free);
    }
    if (this.championId === 'masteryi' && (slot === 'E' || slot === 'R')) {
      return slot === 'E' ? this._castE(mouseWorldPoint, free) : this._castR(free);
    }
    // 버그 수정("R이 마우스 커서 쪽으로 나가지 않는다"): 요네 운명봉인은
    // 직선 스킬샷이라 마우스 방향을 그대로 받아야 하는데, 이 엔진의 공용
    // _castR(free)는 원래 가렌/다리우스/세트/모데카이저처럼 "타겟 클릭형"
    // 궁극기를 위한 경로라 mouseWorldPoint를 아예 넘기지 않는다(닐라/
    // 렉사이 등 다른 R도 전부 free만 받음). 요네만 별도로 mouseWorldPoint를
    // 그대로 전달한다.
    if (this.championId === 'yone' && slot === 'R') return this._yoneCastR(mouseWorldPoint, free);
    // 이즈리얼 R(정조준 사격)도 요네와 동일하게 직선 스킬샷이라 마우스
    // 방향이 필요하다 - 같은 이유로 별도 전달한다.
    if (this.championId === 'ezreal' && slot === 'R') return this._ezrealCastR(mouseWorldPoint, free);
    // 아리 R(혼령 질주)도 마우스가 가리키는 방향으로 돌진하는 스킬샷이라
    // 요네/이즈리얼 R과 동일한 이유로 mouseWorldPoint를 그대로 전달한다.
    if (this.championId === 'ahri' && slot === 'R') return this._ahriCastR(mouseWorldPoint, free);
    // 바루스 R(속박의 사슬)도 마우스 방향으로 나가는 직선 스킬샷이라
    // 요네/이즈리얼/아리 R과 동일한 이유로 mouseWorldPoint를 그대로 전달한다.
    if (this.championId === 'varus' && slot === 'R') return this._varusCastR(mouseWorldPoint, free);
    // 애쉬 Q(궁사의 집중)는 방향이 필요 없는 자기 자신 대상 상태 스킬이고,
    // W(일제 사격)/E(매 날리기)/R(마법의 수정화살)은 전부 마우스 방향으로
    // 나가는 스킬샷이라 요네/이즈리얼/아리/바루스 R과 동일한 이유로
    // mouseWorldPoint를 그대로 전달한다.
    if (this.championId === 'ashe') {
      if (slot === 'Q') return this._asheCastQ(free);
      if (slot === 'W') return this._asheCastW(mouseWorldPoint, free);
      if (slot === 'E') return this._asheCastE(mouseWorldPoint, free);
      if (slot === 'R') return this._asheCastR(mouseWorldPoint, free);
    }
    if (free && this.playSkillAnimationSequence(slot, { mouseWorldPoint, free })) return;
    switch (slot) {
      case 'Q': return this._castQ(mouseWorldPoint, free);
      case 'W': return this._castW(mouseWorldPoint, free);
      case 'E': return this._castE(mouseWorldPoint, free);
      case 'R': return this._castR(free);
    }
  }

  /** 슬롯(Q/W/E/R)에 등록된 커스텀 애니메이션 시퀀스를 재생한다. 오직
   *  "▶ 모션 테스트"(free=true) 경로에서만 호출된다(위 _dispatchCast
   *  참고) - 실제 게임플레이(cost/buff/hit)는 절대 여기서 처리하지 않고
   *  순수 애니메이션 미리보기만 담당한다. 등록된 Step이 없으면 아무것도
   *  하지 않고 false를 반환한다. */
  playSkillAnimationSequence(slot, { mouseWorldPoint, free = false } = {}) {
    const steps = this.skillAnimStore ? this.skillAnimStore.get(slot) : [];
    if (!steps || steps.length === 0) return false;
    this._castCustomSequence(slot, steps, mouseWorldPoint, free);
    return true;
  }

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
  _castCustomSequence(slot, steps, mouseWorldPoint, free = false) {
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
  }

  // 요청 9: 시퀀스 종료 후 무조건 Idle로 보내지 않고, 현재 게임 상태에 맞는
  // 애니메이션으로 복귀한다 -- 대기 중이던 이동 명령 > 살아있는 타겟 재교전
  // > Idle 순으로 기존 상태 시스템(_commitMove/_tryEngageTarget/_returnToLocomotion)
  // 을 그대로 재사용한다.
  _resumeAfterAction() {
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
  }

  // 요청(가렌/세트 한계 해결 - 실제 공개 데이터 EMPOWERED_ATTACK 타입):
  // "Q Cast Time = 0"이 곧 "잠금 없는 일반 스킬"이 아니라, 아예 독립적인
  // 캐스트 모션 자체가 없고 "다음 평타(가렌: 1회, 세트: 2회)를 즉시
  // 강화 + 평타 타이머 리셋"하는 구조다(문서: "Q → ATTACK_ANIMATION이
  // 아니라 Q → 기존 평타 타이머 리셋 → 다음 평타에 Q 모션 적용"). 챔피언
  // DB에 Q.attackOverrideAnimationNames가 등록된 경우에만 이 분기를 타고,
  // 없는 챔피언(다리우스 등)은 기존 방향별 캐스트 로직을 그대로 쓴다.
  /* ================= YASUO ================= */








  // 버그 수정(패시브 치명타 초과분 이중 계산): _yasuoTick()에서 이미
  // this.stats.critChance를 낭인의 길 +100%까지 포함한 "최종 확률"로
  // 강제 설정하므로(아이템 시스템이 없어 그 값 자체가 그대로 최종값),
  // 여기서 +1.0을 또 더하면 아이템 없이도 항상 100%p 초과(=50 고정
  // 추가AD)가 발생했다. stats.critChance를 그대로 최종 확률로 사용한다.


















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



























  _castQ(mouseWorldPoint, free = false) {
    if (this.championId === 'ahri') { this._ahriCastQ(mouseWorldPoint, free); return; }
    if (this.championId === 'yasuo') { this._yasuoCastQ(mouseWorldPoint, free); return; }
    if (this.championId === 'yone') { this._yoneCastQ(mouseWorldPoint, free); return; }
    if (this.championId === 'masteryi') { this._masteryiCastQ(free); return; }
    if (this.championId === 'chogath') { this._chogathCastQ(mouseWorldPoint, free); return; }
    if (this.championId === 'leesin') { this._leesinCastQ(mouseWorldPoint, free); return; }
    if (this.championId === 'ezreal') { this._ezrealCastQ(mouseWorldPoint, free); return; }
    if (this.championId === 'varus') { this._varusCastQ(mouseWorldPoint, free); return; }
    const db = this._championAbilityDbEntry();
    // 업데이트(다리우스 Q 문서 1~11절): Q가 방향별 단일 클립이 아니라
    // "웜업 클립 → 실제 공격 클립"을 강제로 연속 재생해야 하는 챔피언을 위한
    // 분기. R의 multiPhaseClips와 동일한 패턴(AnimationSequencePlayer로
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
            if (hits.length) hits.forEach((h) => { this._dariusQOnHit(h.unit, h.distance); debugSkillHit('Darius Q', h.unit, { distance: Math.round(h.distance), zone: h.distance > lolRangeToWorld(cd.Q.handleRange) ? 'BLADE' : 'HANDLE' }); });
            else debugSkillMiss('Darius Q', 'no target in range');
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
      this._activateAttackOverrideFromDb('Q', 6.0);
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
      this.setSubState('Q', 6.0);
      // "Attack Timer Reset": 이미 평타 RECOVERY 중이면 그 잠금을 즉시 풀고
      // 바로 재교전해서 강화된 평타가 지체 없이 나가도록 한다.
      if (this.currentPhase === 'RECOVERY' && this.currentActionKey && this.currentActionKey.startsWith('attack')) {
        this._clearActionTimers();
        this.currentActionKey = null; this.currentPhase = null;
        if (this.currentTarget && this.currentTarget.hp > 0) this._tryEngageTarget();
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
          const q = this._champData().Q;
          const worldRange = lolRangeToWorld(q.range);
          const rawDist = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0).length() : worldRange;
          const impactPoint = this.root.position.clone().addScaledVector(dir, Math.min(rawDist, worldRange));
          this._mordeQOnCast(impactPoint);
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
  }


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
  _castW(mouseWorldPoint, free = false) {
    if (this.championId === 'ahri') { this._ahriCastW(mouseWorldPoint, free); return; }
    if (this.championId === 'yasuo') { this._yasuoCastW(mouseWorldPoint, free); return; }
    if (this.championId === 'yone') { this._yoneCastW(mouseWorldPoint, free); return; }
    if (this.championId === 'chogath') { this._chogathCastW(free); return; }
    if (this.championId === 'leesin') { this._leesinCastW(free); return; }
    if (this.championId === 'mordekaiser') { this._mordeCastW(free); return; }
    if (this.championId === 'ezreal') { this._ezrealCastW(mouseWorldPoint, free); return; }
    if (this.championId === 'varus') { this._varusCastW(mouseWorldPoint, free); return; }

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
      // 게임로직 TODO(문서 17~18절): 여기서 실제로 "남은 Shield 확인 → Shield
      // 제거/소비 → Heal 계산 → 대상(모데카이저 자신)에게 회복 적용"이 들어가야
      // 한다. 이 데모는 애니메이션 레이어만 다루므로 수치 계산 없이 즉시
      // vfx.spawn('w', ...)와 전환 클립만 재생한다. 회복 이벤트를 클립 종료
      // (2.3667초/2.1초) 시점이 아니라 별도 프레임(문서: "게임 효과 시점과
      // 시각적 클립 종료를 독립적으로 둔다")에서 발동시키고 싶다면, 아래
      // crossFadeTo 직후(즉시) 또는 clip.duration 이전의 특정 시점에
      // setTimeout으로 회복 이벤트를 따로 걸어야 한다.
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

    // 게임로직 TODO(문서 4절 "경우 0"): 실제로는 사망/강제 행동 불가/현재 W
    // 상태에서 아직 재사용 불가(canUseSpell2()) 등을 먼저 검사해서 그 경우
    // 애니메이션도 아예 재생하지 않아야 한다. 지금은 아래 쿨다운/마나 체크
    // (기존 데모 로직)만 그 역할을 대신 하고 있다 - 실제 스킬 시스템을 붙일
    // 때 이 지점에 canUseSpell2() 같은 별도 검사를 추가해야 한다.
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
      this._activateAttackOverrideFromDb('W', 6.0);
      vfx.spawn('w', this.root.position.clone());
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
    // 게임로직 TODO(문서 4/12절): 여기서 실제로는 [1]보호 효과(방어/피해감소)
    // 적용 [2]지속시간 타이머 시작 [3]W VFX 활성화가 즉시(0.000초) 일어나야
    // 한다. 아래 onFire는 이 데모의 기존 타이밍(애니메이션 중간 지점) 그대로
    // 두었다 - Cast Time이 0인 스킬이라 사실상 즉시나 마찬가지지만, 정확한
    // "즉시 적용"을 구현하려면 runAction() 호출 전에 별도로 적용하는 편이
    // 문서 의도에 더 가깝다.
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
      // 게임로직 TODO(세트 W 문서 4/5절): 여기서 실제 보호막 수치 계산/적용
      // (Grit 게이지 기반)이 들어가야 한다. 이 데모는 애니메이션 레이어만
      // 다루므로 VFX만 즉시 스폰한다.
      vfx.spawn('w', this.root.position.clone());
    }
    // 기획안 반영(가렌 W "용기"): Cast Time 0초 스킬이므로 보호막/피해감소는
    // runAction() 애니메이션 타이밍과 무관하게 여기서 즉시 적용한다.
    if (this.championId === 'garen') this._garenWOnCast();
    if (this.championId === 'masteryi') this._masteryiWOnCast();
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
        if (this.championId === 'sett') this._settWOnCast(settWOrigin, settWForward); // 보호막+타격을 SKILL_TIMING_DATABASE.sett.W(0.75초) 시점에 함께 처리
        this._activateWSubState(data.buffDuration);
      },
    });
  }

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
  // 게임로직 TODO(문서 13/14절 "반복 피해는 주변 범위를 매 틱 재검색해야
  // 한다"): updateEChannel(dt)는 현재 this.currentTarget 단일 대상(더미)만
  // 0.5초 간격으로 때리는 단순 구조다(아래 참고) - 문서가 요구하는
  // findEnemiesInRadius() 기반 범위 재검색은 구현하지 않았다.
  _castE(mouseWorldPoint, free = false) {
    if (this.championId === 'ahri') { this._ahriCastE(mouseWorldPoint, free); return; }
    if (this.championId === 'yasuo') { this._yasuoCastE(mouseWorldPoint, free); return; }
    if (this.championId === 'yone') { this._yoneCastE(mouseWorldPoint, free); return; }
    if (this.championId === 'chogath') { this._chogathCastE(free); return; }
    if (this.championId === 'masteryi') { this._masteryiCastE(free); return; }
    if (this.championId === 'leesin') { this._leesinCastE(free); return; }
    if (this.championId === 'ezreal') { this._ezrealCastE(mouseWorldPoint, free); return; }
    if (this.championId === 'varus') { this._varusCastE(mouseWorldPoint, free); return; }
    const db = this._championAbilityDbEntry();
    const channelCfg = db && db.E && db.E.directionalChannel;

    if (channelCfg) {
      if (this.currentActionKey === 'eChannel') { this._endEChannel(); return; }
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
      this._eHitsTotal = eData ? (eData.baseHits + Math.floor((this.stats.bonusAttackSpeedPercent || 0) / 0.25)) : 0;
      this._eHitsDone = 0;
      this._eHitInterval = this._eHitsTotal > 0 ? this._eChannelDuration / this._eHitsTotal : 0.5;
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
          const cd = this._champData();
          const dir = facing || (this.moveDir.lengthSq() > 0 ? this.moveDir.clone().normalize() : new THREE.Vector3(0, 0, 1));
          const hitUnit = findFirstInLine(this.root.position, dir, cd.E.range, BASE_UNIT * 0.6);
          if (hitUnit) { this._dariusEOnCast(hitUnit); debugSkillHit('Darius E', hitUnit); }
          else debugSkillMiss('Darius E', 'no target in line');
        } else if (this.championId === 'mordekaiser') {
          // 모데카이저 E(죽음의 손아귀)는 "투사체가 아닌 장판형" 스킬이라
          // 다리우스 E와 달리 직선이 아니라 지정 지점 중심의 범위 판정이다.
          const cd = this._champData();
          const dir = facing || new THREE.Vector3(0, 0, 1);
          const worldRange = lolRangeToWorld(cd.E.range);
          const rawDist = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0).length() : worldRange;
          const point = this.root.position.clone().addScaledVector(dir, Math.min(rawDist, worldRange));
          const hits = findEnemiesInRadius(point, 150); // 정확한 장판 반경이 기획안에 없어 근접 범위로 근사(LoL 단위, findEnemiesInRadius 내부에서 world로 변환됨)
          if (hits.length) this._mordeEOnCast(hits[0].unit);
          else debugSkillMiss('Mordekaiser E', 'no target in impact area');
        } else if (this.currentTarget && this.currentTarget.hp > 0) {
          applyDamage(this.currentTarget, { rawDamage: data.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
        }
      },
    });
  }

  // ---- 가렌형 방향 채널링 E 전용 헬퍼 ----
  _updateEChannelDirection(point) {
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
  }
  _endEChannel() {
    if (this.currentActionKey !== 'eChannel') return;
    this.currentActionKey = null; this.currentPhase = null;
    this._eChannelCfg = null; this._eChannelDir = null; this._eChannelTimer = 0; this._eChannelDamageAccum = 0;
    this._resumeAfterAction();
  }
  updateEChannel(dt) {
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
            applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: willCrit, critMultiplier: eData.critMultiplier });
            if (this._eHitsDone >= eData.armorShredHitsNeeded) {
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
  }










  _castR(free = false) {
    if (this.championId === 'yasuo') { this._yasuoCastR(free); return; }
    // 참고: 요네 R은 _dispatchCast()에서 mouseWorldPoint와 함께 먼저
    // 가로채지므로 보통 이 지점까지 오지 않는다 - 혹시 모를 우회 호출에
    // 대비한 안전망으로만 남겨둔다(마우스 좌표 없이 정면 방향으로 나감).
    if (this.championId === 'yone') { this._yoneCastR(null, free); return; }
    if (this.championId === 'masteryi') { this._masteryiCastR(free); return; }
    if (this.championId === 'chogath') { this._chogathCastR(free); return; }
    if (this.championId === 'leesin') { this._leesinCastR(free); return; }
    if (this.championId === 'sett') { this._settCastR(free); return; }
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

    // 요청(세트 R 한계 해결 - MULTI_PHASE_FORCED_ACTION): 실제로는 대상을
    // Suppress → 대상 위치로 Dash → 붙잡아 600유닛 운반 → 충돌 → 250유닛
    // 슬라이드까지 이어지는 강제 다단계 이동 스킬이지만, 그 정도의 실제
    // 위치 이동/슬라이드 물리는 이 데모의 캐릭터 컨트롤러 범위를 넘어선다.
    // 대신 windup->channel->cast와 동일한 AnimationSequencePlayer로 여러
    // GLB 클립(Dash→Grab→Spin→PowerBomb)을 순서대로 강제 재생하고, 마지막
    // 충돌 단계(multiPhaseImpactIndex)에서 피해가 터지는 구조는 그대로
    // 재현한다 - 시각적 단계 재생만 구현, 실제 캐릭터 이동/슬라이드는 없음.
    //
    // 업데이트(세트 R 문서 전체 반영): 문서가 요구하는 "대상 고정 → Suppress
    // → Dash(거리 기반 보간) → Grab → Carry 600(거리 기반, 시간 아님) →
    // ★Impact → Slide 250(거리 기반) → 행동 복귀" 구조 중, 애니메이션
    // 단계 순서(Dash→Grab→Spin→PowerBomb)와 "충돌 시점에 피해"라는 핵심은
    // 이미 위 multiPhaseClips/multiPhaseImpactIndex로 구현돼 있다.
    // 게임로직 TODO(문서 3~13절): 아래는 이 데모에 없는 것들이다.
    //  - 대상 Suppress 상태(이동/공격/스킬 불가) 부여 및 R 종료 시 해제
    //  - 세트 위치를 실제로 대상에게 Dash시키는 거리 기반 보간(현재는
    //    캐릭터 위치가 전혀 이동하지 않고 제자리에서 애니메이션만 재생)
    //  - Carry 600 / Slide 250을 "초 단위 타이머"가 아니라 "이동 거리
    //    누적"으로 판정하는 방식(문서 8절 "600은 0.6초가 아니라 게임 거리
    //    단위"라는 경고 그대로)
    //  - Carry 중 대상 위치를 세트 위치에 종속시켜 함께 이동시키는 처리
    //  - 착지 지점 기준 범위 다중 대상 피해(현재는 currentTarget 단일 대상)
    const db = this._championAbilityDbEntry();
    const multi = db && db.R && db.R.multiPhaseClips;
    if (multi && multi.length) {
      const clips = multi.map((n) => this.resolveClip([n])).filter(Boolean);
      if (clips.length) {
        this.setState(STATE.R_CAST);
        this.currentActionKey = 'rCast'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
        let damageApplied = false;
        const impactIndex = Math.min(db.R.multiPhaseImpactIndex ?? (clips.length - 1), clips.length - 1);
        const fireImpact = () => {
          if (damageApplied) return;
          damageApplied = true;
          this.currentPhase = 'ACTIVE';
          vfx.spawn('r', this.root.position.clone());
          if (this.currentTarget && this.currentTarget.hp > 0) {
            if (this.championId === 'sett') { this._settROnHit(this.currentTarget); debugSkillHit('Sett R', this.currentTarget); }
            else applyDamage(this.currentTarget, { rawDamage: cast.dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1 });
          } else if (this.championId === 'sett') {
            debugSkillMiss('Sett R', 'no currentTarget selected');
          }
          this.currentPhase = 'RECOVERY'; this.phaseCancelable = false;
        };
        this.sequencePlayer.play({
          steps: clips.map((c) => ({ animation: c.name, clipStart: 0, clipEnd: c.duration })),
          onStepStart: (index) => { if (index === impactIndex) fireImpact(); },
          onComplete: () => {
            fireImpact(); // 혹시 impactIndex 단계가 스킵됐다면 마지막에 보정 발동
            const recTimer = setTimeout(() => { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }, ENGINE_BUFFER * 1000);
            this._actionTimers.push(recTimer);
          },
          onCancel: () => { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); },
        });
        return;
      }
    }

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
      this.runAction('rCast', STATE.R_CAST, {
        onFire: () => {
          vfx.spawn('r', this.root.position.clone());
          if (lockedRTarget && lockedRTarget.hp > 0) {
            if (this.championId === 'garen') { this._garenROnHit(lockedRTarget); debugSkillHit('Garen R', lockedRTarget); }
            else if (this.championId === 'darius') { this._dariusROnHit(lockedRTarget); debugSkillHit('Darius R', lockedRTarget); }
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
  }


  // 닐라 최종 QA: 수치/애니메이션/상태 의존성이 빠졌는지 브라우저 콘솔에서 빠르게 확인한다.




  /* ---------------- recall ---------------- */
  startRecall() {
    if (this.state === STATE.DEAD || this.state === STATE.RESPAWN || this.state === STATE.RECALL) return;
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null;
    this.targetPos = null; this.currentTarget = null;
    targetRing.clear();
    this.setState(STATE.RECALL);
    this.playFirstAvailable(this.actionData.recall.clips, { loop:THREE.LoopOnce, fade:0.15, clampWhenFinished:true });
    const t = setTimeout(() => {
      this._recallTimer = null;
      if (this.state !== STATE.RECALL) return; // 그 사이 cancelRecall()로 취소된 경우
      this.root.position.set(0, 0, 0);
      this._returnToLocomotion();
    }, RECALL_DURATION * 1000);
    this._recallTimer = t;
    this._pendingTimeouts.push(t);
  }

  // 요청(귀환 캔슬): 이동/공격 대상 지정/스킬 시전/피격 네 진입점이 공통으로
  // 사용하는 귀환 중단 함수. 귀환 완료 타이머는 콜백 안에서 스스로 state를
  // 재확인하므로(위 startRecall 참고) clearTimeout이 필수는 아니지만, 남은
  // 타이머를 방치하지 않도록 여기서 함께 정리한다. state 전환(IDLE/MOVE/
  // 공격/캐스트 등)은 각 호출부가 이어서 직접 담당한다 -- 이 함수는 "귀환을
  // 끊는다"까지만 책임진다.
  cancelRecall() {
    if (this.state !== STATE.RECALL) return false;
    if (this._recallTimer) {
      clearTimeout(this._recallTimer);
      this._pendingTimeouts = this._pendingTimeouts.filter((t) => t !== this._recallTimer);
      this._recallTimer = null;
    }
    return true;
  }

  /* ---------------- health / death / respawn ---------------- */
  takeDamage(dmg, source = null, damageType = DAMAGE_TYPE.PHYSICAL) {
    if (this.state === STATE.DEAD) return;
    // Alpha Strike 비대상 상태 - 섹션 6: "모든 피격 판정에서 확인해야 한다".
    if (this.isUntargetable) return;
    // 요청(귀환 캔슬): 귀환 중 피격 -> 귀환 모션 중단 후 Idle로 전환. 그
    // 직후 이 피해로 체력이 0 이하가 되면 아래 _die()가 이어서 DEAD로
    // 다시 전환하므로, 굳이 순서를 바꾸지 않아도 "피격 -> 사망"이 자연스럽게
    // 이어진다.
    if (this.state === STATE.RECALL) {
      this.cancelRecall();
      this.setState(STATE.IDLE);
      this.playFirstAvailable(this.championId === 'yasuo' ? ['Idle1_Raw'] : this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
    }
    this.passiveState.lastDamageTakenAt = performance.now(); // 가렌 인내심: 피해를 입으면 무피해 타이머 리셋
    if (this.championId === 'renekton') this._renektonMarkCombat();
    let reduction = getDamageReductionPercent(this);
    if (damageType === DAMAGE_TYPE.MAGICAL) reduction = Math.max(reduction, getMagicDamageReductionPercent(this));
    let remaining = Math.max(0, dmg) * (1 - Math.min(1, Math.max(0, reduction))); // 일반 피해감소 + 닐라 W 마법피해감소
    // 아이템 패시브(멜모셔스의 아귀/스테락의도전 - 생명선) - 이 피해로
    // 체력이 문턱 밑으로 "떨어질" 보호막을 먼저 걸어서, 바로 아래 shield
    // 흡수 로직이 이번 피해도 함께 받아낼 수 있게 한다(실제 LoL도 피해가
    // 적용되기 직전에 발동). 죽음의무도(고통 무시)는 받는 피해 자체를
    // 바꾸므로(일부를 지연 피해로 돌림) 반환값을 그대로 remaining에
    // 반영한다 - `?? remaining`으로 다른 효과들의 기존 void 반환과도 안전하게 호환.
    if (typeof itemOnTakeDamage === 'function') remaining = itemOnTakeDamage(this, remaining, damageType, source) ?? remaining;
    // 버그 수정(세트 패시브 문서 4절 "실제로 HP에 적용된 피해를 기준으로
    // 한다"): 예전에는 Shield로 흡수되기 전의 remaining을 그대로 투지
    // 계산에 넘겨서, Shield가 300 있는 상태에서 500 피해를 받아 실제로는
    // 200만 HP가 깎였어도 투지는 500 기준으로 쌓였다. Shield 소모를 먼저
    // 끝내고, 실제로 HP를 깎은 양(actualHpLoss)만 넘긴다. 모데카이저 W의
    // "받은 피해 축적"도 동일한 성격의 값이라 같이 바로잡는다.
    if (this.shield > 0) { const absorb = Math.min(this.shield, remaining); this.shield -= absorb; remaining -= absorb; }
    const actualHpLoss = Math.min(remaining, this.hp);
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
    if (this.championId === 'yasuo' && actualHpLoss > 0) this._yasuoOnTakeDamage();
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
  }
  _die() {
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
    // 남아있다가 _respawn()이 this.root.position을 (0,0,0)으로 순간이동시킬
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
    this.currentActionKey = null; this.currentPhase = null;
    this.targetPos = null; this.currentTarget = null; this.pendingMove = null; this.pendingCast = null;
    targetRing.clear();
    this.setState(STATE.DEAD);
    vfx.spawn('death', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0)));
    this.playFirstAvailable(this.actionData.death.clips, { loop:THREE.LoopOnce, fade:0.1, clampWhenFinished:true });
    const t = setTimeout(() => this._respawn(), RESPAWN_WAIT * 1000);
    this._pendingTimeouts.push(t);
  }
  _respawn() {
    this.setState(STATE.RESPAWN);
    this.root.position.set(0, 0, 0);
    this.hp = this.maxHp; this.mp = this.maxMp;
    updateBars(this);
    const action = this.playFirstAvailable(this.actionData.respawn.clips, { loop:THREE.LoopOnce, fade:0.15, clampWhenFinished:true });
    const dur = action ? action.getClip().duration / (action.timeScale || 1) : 1.0;
    const t = setTimeout(() => this._returnToLocomotion(), (dur + 0.1) * 1000);
    this._pendingTimeouts.push(t);
  }



  _returnToLocomotion() {
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
  }

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
  _playWEntryChain() {
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
  }

  // 업데이트(W 전용 상세 문서 12절 "경우: W 활성 상태 정지 유지 중 이동 시작"):
  // 서브 상태(예: W)의 locomotionTransitions.idleToMove가 등록돼 있고, 현재
  // Idle 루프 클립을 재생 중일 때만 이 전환 클립을 한 번 거친 뒤 이동 루프로
  // 넘어간다. 실제 좌표 이동(this.targetPos/updateMovement)은 이 함수와 무관
  // 하게 이미 즉시 시작되어 있으므로(문서: "실제 좌표 이동과 애니메이션 전환은
  // 별개"), 여기서는 순수하게 시각 전환만 지연시킨다. 등록 안 된 챔피언/상태는
  // false를 반환해 호출부가 기존처럼 이동 루프로 바로 전환한다.
  _playLocomotionEntryTransition() {
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
  }

  _clearPending() { this._pendingTimeouts.forEach(clearTimeout); this._pendingTimeouts = []; }

  // 애니메이션 탐색기(추가 수정사항 23)에서 클립을 클릭했을 때 미리보기 재생.
  debugPreviewClip(name) {
    const clip = this.findAnimation(name);
    if (!clip) return;
    this._clearActionTimers();
    this.currentActionKey = null; this.currentPhase = null;
    this.crossFadeTo([name], { loop: THREE.LoopOnce, fade: 0.1, clampWhenFinished: true, timeScale: 1.0 });
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => { this._returnToLocomotion(); }, (clip.duration + 0.15) * 1000);
  }

  update(dt) {
    safeMixerUpdate(this.mixer, dt, `champion:${this.championId}`);
    this.sequencePlayer.update(dt); // mixer.update() 다음에 호출 -- action.time이 최신값이어야 clipEnd 판정이 정확함

    // Q 종료 안전장치:
    // 전용 Q 상태 머신/시퀀스가 정상 종료했는데 currentActionKey만
    // 남는 경우를 매 프레임 정리한다. 이 잔여 키는 일반
    // getActionAuthority()에서 data가 없는 특수 액션으로 취급되어
    // 이동/공격/스킬을 모두 막을 수 있다.
    if (this.currentActionKey === 'qChain' &&
        this.championId === 'darius' &&
        !this.sequencePlayer.isPlaying) {
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this._resumeAfterAction();
    }

    if (this.currentActionKey === 'masteryiQ' &&
        this.championId === 'masteryi' &&
        !this._masteryi?.alpha) {
      this.currentActionKey = null;
      this.currentPhase = null;
      this.phaseCancelable = false;
      this.isUntargetable = false;
      if (this.model) this.model.visible = true;
      this._resumeAfterAction();
    }

    this.updateMovement(dt);
    this.updateTargetChase();
    this.updateEChannel(dt); // 요청(가렌형 한계 해결): 방향 채널링 E의 지속시간/도트 데미지
    this.updateCooldowns(dt);
    this.regen(dt);
    // 기획안 8절: 상태이상(DOT/슬로우/버프 등)을 매 프레임 갱신하고, 최종
    // 이동속도 계산이 참조하는 stats.slowPercent/percentMoveSpeedBonus에도
    // 그 결과를 반영한다(getFinalMoveSpeed는 항상 stats만 읽으므로 여기서
    // 동기화해줘야 실제로 이동속도에 반영된다).
    tickStatusEffects(this, dt);
    this._nilahUpdate(dt);
    if (this.championId === 'nilah' && this._nilahWeaponRig) {
      this._nilahWeaponRig.active = !!(this.currentActionKey && /nilah(Q|E|R)/.test(String(this.currentActionKey)));
    }
    // 마스터 이 R(최후의 전사): "둔화 효과에 면역됩니다" - R 활성 중에는
    // 실제로 걸려있는 SLOW 상태이상과 무관하게 이동속도 계산에 0으로
    // 반영한다(상태이상 자체를 지우지는 않고, 최종 스탯 적용만 막는다 -
    // R이 끝나면 자연스럽게 원래 남은 슬로우가 다시 적용된다).
    this.stats.slowPercent = (this.championId === 'masteryi' && hasStatus(this, 'MASTERYI_R_AS')) ? 0 : getSlowPercent(this);
    // 요청 16/17: 세트 Q 이동속도 버프는 "적 챔피언을 향해 이동 중"일 때만
    // 적용한다 - Empower(강화 평타 횟수)와는 완전히 독립된 상태이므로,
    // 여기서 값만 조건부로 걸러낼 뿐 settQ_ms 상태 자체(및 강화 횟수)는
    // 건드리지 않는다.
    let msBuff = getMoveSpeedBuffPercent(this);
    if (this.championId === 'sett' && hasStatus(this, 'MS_BUFF')) {
      const movingTowardEnemy = this.isChasing && this.currentTarget && this.currentTarget.hp > 0;
      if (!movingTowardEnemy) msBuff = 0;
    }
    this.stats.percentMoveSpeedBonus = msBuff + (this.itemBonusMoveSpeedPercent || 0);
    this.stats.flatMoveSpeedBonus = typeof getFlatMoveSpeedBuff === 'function' ? getFlatMoveSpeedBuff(this) : 0;
    this.stats.attackRange = (this._attackRangeBaseWorld || this.stats.attackRange) + lolRangeToWorld(this._itemTempAttackRangeBonusLol || 0);
    this.stats.bonusAttackSpeedPercent = getAttackSpeedBuffPercent(this) + (this.itemBonusAttackSpeedPercent || 0);
    if (this.championId === 'nilah' && this._nilahQActive()) this.stats.bonusAttackSpeedPercent += this._nilahCurrentQASPercent();
    this._garenPassiveTick(dt);
    this._settPassiveTick(dt);
    this._settPassiveTimeoutTick();
    this._settGritTick(dt);
    this._settShieldDecayTick(dt);
    this._settUpdateR(dt);
    this._masteryiWTick(dt); // 버그 수정("W 명상 마나 감소 안 됨") - deltaTime 기반 초당 마나 차감
    // 버그 수정: 지금까지 magicPenPercent는 E를 실제로 시전한 순간에만
    // 세팅됐다 - 실제로는 "기본 지속 효과"라서 E에 스킬 포인트를 찍은
    // 순간부터(한 번도 안 눌러도) 이미 적용돼야 한다. 매 프레임 현재 E
    // 스킬 레벨 기준으로 다시 계산해서 항상 최신 상태를 유지한다.
    if (this.championId === 'mordekaiser') {
      const cd = this._champData();
      const eLvl = this.skillLevels && this.skillLevels.E;
      this.magicPenPercent = (cd && eLvl >= 1) ? skillVal(cd.E.magicPenPercentByLevel, eLvl) / 100 : 0;
    }
    this._mordePassiveAuraTick(dt);
    // R(죽음의 세계) 상태 머신 tick - 세트 R(_settUpdateR)과 동일한 패턴으로
    // 매 프레임 지속시간 만료/대상 사망을 감지한다(위 _mordeUpdateR 정의 참고).
    if (this.championId === 'mordekaiser') this._mordeUpdateR();
    // Alpha Strike(마스터 이 Q) 상태 머신 - setTimeout이 아니라 매 프레임
    // dt로 진행한다(요청 문서 1 섹션 5). masteryi가 아니거나 Q가 진행 중이
    // 아니면 내부에서 즉시 return.
    this._masteryiUpdateAlphaStrike(dt);
    this._renektonTick(dt);
    this._yasuoTick(dt);
    if (this.championId === 'yone') this._yoneTick(dt);
    this._vexUpdateR(dt);
    this._ezrealUpdate(dt);
    this._ahriUpdate(dt);
    this._varusUpdate(dt);
    this._asheUpdate(dt);
    if (typeof itemSystemTick === 'function') itemSystemTick(this, dt);
  }
}