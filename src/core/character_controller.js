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
      minAttackSpeed: 0.2, maxAttackSpeed: 2.5, // 원작 공격 속도 상한 2.5(예전 3.5)
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
    // Shape를 별개 개념으로 관리한다. 25차: 예전엔 모든 챔피언에 균일값
    // (BASE_UNIT*0.24 = 약 28 LoL 유닛)을 썼는데, 원작 판정 반경은 대부분 65다.
    // 챔피언이 정해지면 applyChampionData()가 원작 값(getChampionUnitSize)으로 바꾼다.
    this.collisionRadius = lolRangeToWorld(UNIT_SIZE_DEFAULT_LOL.gameplay);
    this.pathingRadius = lolRangeToWorld(UNIT_SIZE_DEFAULT_LOL.pathing);
    this.collisionHeight = BASE_UNIT * 1.1;
    this.selectionRadius = lolRangeToWorld(UNIT_SIZE_DEFAULT_LOL.selection);

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
    // 챔피언 전용 전투 상태 - applyChampionData()와 같은 초기값을 한 곳(_freshChampionStates)에서 만든다.
    this._freshChampionStates();
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
    this.bonusAP = 0; // 모데카이저 R 강탈 주문력
    this.bonusArmor = 0; this.bonusMr = 0; // 가렌 W 처치 스택
    this._garenCourageStacks = 0;
    this.bonusMaxHp = 0; // 초가스 R 포식 중첩
    this.armorPenPercent = 0; // 다리우스 E 패시브
    this.magicPenPercent = 0; // 모데카이저 E 패시브
    // 패시브 내부 상태(가렌 인내심/다리우스 과다출혈 등은 이 오브젝트에 챔피언별로 필드를 추가해 사용)
    this.passiveState = { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0, lastPassiveHealAt: 0 };
    this._rRecastReadyUntil = 0; // 다리우스 R 처치 후 무료 재시전 창
    this._eHitCountThisCast = 0; // 가렌 E 회전 중 누적 타격 수
    this._masteryiWHealTimer = null;
    // 칼바람 포탑 시스템(destroyTurret 참고) - 팀/골드 시스템이 따로
    // 없어 "아군 전원에게 지급"을 지금은 플레이어 자신의 누적치로 대신한다.
    this.gold = 0;
    this.summoners = { D: { id: 'flash', readyAt: 0 }, F: { id: 'heal', readyAt: 0 } }; // 36차 소환사 주문(summoner_spells.js) - 챔피언을 바꿔도 유지
    this.score = { kills: 0, deaths: 0, assists: 0, cs: 0 }; // 34차 스코어보드(K/D/A·CS) - 골드처럼 챔피언을 바꿔도 유지
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
    this._itemLastDealtChampionDamageAt = 0; this._itemLastTookChampionDamageAt = 0; this._itemLastTookAnyDamageAt = 0;
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
    this._dariusWArmed = false;
    this._leesinAnimTimer = null;
  }

  /** 기획안 CHAMPION_DATA를 이 컨트롤러에 연결하고 레벨 기준 스탯을 재계산한다.
   *  championId가 CHAMPION_DATA에 없는 챔피언은 기존 기본 스탯을 그대로 유지한다
   *  (기존 기능을 망가뜨리지 않는다 - 섹션 16). */
  // 챔피언 전용 전투 상태 초기값 - 생성자와 applyChampionData()(챔피언 교체)가
  // 같은 함수를 쓴다. 예전엔 같은 객체 리터럴을 두 곳에 복사해 두어서, 새 챔피언을
  // 추가할 때 한쪽을 빠뜨리기 쉬웠다(실제로 _morde/_vex는 교체 시 초기화가
  // 빠져 있었다).
  _freshChampionStates() {
    // 벡스 R(그림자 파동) 전용 상태: 1차 적중 후 대상에게 재시전할 수 있는 창과 실제 돌진 상태를 분리한다.
    this._vex = { recastTarget: null, recastReadyUntil: 0, dashActive: false, dashStart: null, dashEnd: null, dashT: 0, dashDuration: 0.28, qTravel: null, eTravel: null, wShield: null, doomReadyAt: 0, doomTotalMs: 0, gloom: new Map() };
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
    this._varus = { qCharge: null, lv: { until: 0, asPercent: 0, adRatio: 0, takedown: false } };
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
      eCharges: 2, eRechargeEndAt: 0, // E(매 날리기) 충전 2회 - 한 번에 하나씩 재충전(원작 충전형 스킬 규칙)
      wPending: null, ePending: null, rPending: null, rTravel: null,
    };
    if (this._rammus && this._rammus.spin && typeof this._rammusEndBallSpin === 'function') this._rammusEndBallSpin(); // 굴리던 공의 회전축 정리(39차)
    this._rammus = { roll: null, wUntil: 0, wStartedAt: 0, wArmor: 0, wMr: 0, jump: null, aftershocks: null, spin: null }; // 38차 람머스(rammus.js)
    this._nautilus = {
      passiveReadyAt: new Map(),
      qPending: null, qTravel: null, qPull: null,
      wUntil: 0, wShieldRemaining: 0, wShieldSeen: 0,
      eSeq: null, rPending: null, rTravel: null,
    };
    this._darius = { stacksOnTarget: new Map() }; // target -> {stacks, empoweredUntil}
    this._sett = { punchSide: 'left', lastPunchAt: 0, qUsesRemaining: 0, grit: 0, gritEntries: [], rSeq: null, wShieldDecayPerSec: 0, wPendingSpent: 0 };
    this._morde = { hitStacks: 0, auraExpiresAt: 0, dealtBank: 0, wShieldActiveUntil: 0,
      // R(죽음의 세계) 전용 상태 - 명세 28절 "R 종료 시 반드시 초기화해야 할
      // 상태 목록"에 대응. isInDeathRealm이 이 전투가 "R 내부"인지 아닌지를
      // 나타내는 단일 진실 공급원(single source of truth)이고, 나머지는 그
      // 상태에 딸린 부가 데이터다.
      isInDeathRealm: false, rTarget: null, rEndsAt: 0, rStolenArmor: 0, rStolenMr: 0,
      rSteal: null, rKept: null, rStolenAsBonus: 0, rSize: null, realmId: null, // rKept: 대상이 안에서 죽어 부활까지 들고 있는 능력치
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
    this._chogath = { predationStacks: 0, nonEpicStacks: 0, eChargesRemaining: 0 };
    this._leesin = { qMarkTarget: null, qMarkExpiresAt: 0, wMarkReadyUntil: 0, eMarkHits: [], eMarkExpiresAt: 0, passiveHitsLeft: 0 };
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

  /** 챔피언 교체/폐기 공통 정리: 이전 챔피언이 걸어둔 지연 실행·투사체·시각 효과와
   *  다른 유닛에 건 진행 중 상태(세트 R 잡기, 모데카이저 죽음의 세계)를 끝낸다.
   *  applyChampionData()(같은 모델에서 챔피언 id만 교체)와 disposeCurrentChampion()
   *  (GLB를 새로 불러와 컨트롤러 자체를 버림) 양쪽에서 부른다. */
  _teardownChampionRuntime() {
    // 버그 수정(19차 E2E 교체 점검에서 발견): 아래 _clearActionTimers()가 진행 중인 시퀀스(닐라 Q 등)를 취소하면
    // 그 onCancel이 _resumeAfterAction()을 불러, 아직 남아 있던 공격 대상에게 새 평타를 시작했다 - 정리가 끝난 뒤에
    // 생긴 타이머라 버려진 컨트롤러가 교체 후에도 허수아비를 계속 때렸다. 재개할 명령(대상·이동·시전 예약)부터 비운다.
    this.currentTarget = null; this.attackOrderActive = false; this.attackOrderAnchor = null;
    this.pendingMove = null; this.pendingCast = null; this.targetPos = null; this._approachCast = null;
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
      // 시퀀스 취소(onCancel)가 먼저 _settEndR을 불러 rSeq를 비울 수 있다 - 그때는 다시 부르지 않는다
      // (예전엔 null을 넘겨 오류가 났고, GLB 재로드 교체가 통째로 실패했다).
      if (this.sequencePlayer?.isPlaying) this.sequencePlayer.cancel();
      if (this._sett.rSeq) this._settEndR(this._sett.rSeq, true);
    }
    if (this._morde?.isInDeathRealm) this._mordeEndDeathRealm('champion-switch');
    // 죽음의 세계 크기 변화(0.25초)가 진행 중이면 즉시 원래 크기로 맞춘다.
    if (this._morde?.rSize && typeof this._mordeTickSizeAnim === 'function') { this._morde.rSize.selfTo = 1; this._morde.rSize.targetTo = 1; this._morde.rSize.start = -1e9; this._mordeTickSizeAnim(); }
    // 버그 수정(위와 동일 - "챔피언 교체 후 이전 챔피언 투사체" 문제):
    // 이즈리얼/벡스 등 공용 ProjectileSystem을 쓰는 챔피언의 투사체가
    // 교체 후에도 계속 날아가 새 챔피언의 championId로 잘못된 훅을
    // 트리거하지 않도록, 교체 시점에 플레이어 투사체를 전부 정리한다
    // (포탑 투사체는 clear() 내부에서 자동으로 보존됨).
    if (typeof projectiles !== 'undefined' && typeof projectiles.clear === 'function') projectiles.clear();
    this._clearActionTimers();
    this._cancelChampionTimers(); // 이전 챔피언의 지연 실행(판정·복귀·연출)을 모두 무효화
    // 이전 챔피언 상태가 참조하는 시각 효과/타이머부터 정리하고, 그다음 전부 새로 만든다.
    if (this._leesinAnimTimer) { clearTimeout(this._leesinAnimTimer); this._leesinAnimTimer = null; }
    if (this._yone && this._yone.eSpirit && typeof this._yoneCleanupSpiritVisuals === 'function') this._yoneCleanupSpiritVisuals();
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
    if (this._morde && this._morde.shieldDecayTimer) clearInterval(this._morde.shieldDecayTimer);
    if (this._masteryi?.alpha && typeof this._masteryiCancelAlphaStrike === 'function') this._masteryiCancelAlphaStrike();
    if (this._vex && typeof this._vexClearRRecast === 'function') this._vexClearRRecast();
    if (typeof skillTelegraphs !== 'undefined' && skillTelegraphs.clearOwner) skillTelegraphs.clearOwner(this); // 취소된 효과의 예고·지대 표시도 지운다
  }

  applyChampionData(championId) {
    this._teardownChampionRuntime();
    this.statusEffects = [];
    this.shield = 0;
    this.currentTarget = null;
    this.pendingMove = null; this.pendingCast = null;
    this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
    if (typeof targetRing !== 'undefined') targetRing.clear();
    for (const k of Object.keys(this.cooldowns || {})) this.cooldowns[k] = 0; // 요청 5절 "쿨다운 음수 방지"와 같은 취지 - 이전 챔피언 쿨다운이 새 챔피언에 유출되지 않게 한다
    // 마스터 이 Q 도중 교체: 모델 비가시화/비대상 상태가 남지 않게 되돌린다.
    this.isUntargetable = false;
    if (this.model) this.model.visible = true;
    // 이전 챔피언이 건 평타 강화/서브 상태/임시 이동 모션/전용 잠금이 새 챔피언에 새지 않게 한다.
    this.attackOverrides = [];
    this.subStates = {};
    this._transientMoveClipNames = new Set();
    this._dariusRQeLockUntil = 0;
    this._ccAnimActive = false;
    this._eHitCountThisCast = 0;
    this.magicPenPercent = 0; // 모데카이저 E 패시브 - 매 tick 다시 계산되지만 다른 챔피언에선 계산 자체를 안 한다
    this.passiveState = { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0, lastPassiveHealAt: 0 };
    // 25차: 판정·지형 충돌·선택 반경을 원작 값으로(getChampionUnitSize - 00_global_constants.js).
    // collisionRadius = 판정 반경(gameplay radius: 평타 가장자리 거리·스킬 적중), pathingRadius = 구조물·경계 충돌.
    const unitSize = getChampionUnitSize(championId);
    this.collisionRadius = lolRangeToWorld(unitSize.gameplay);
    this.pathingRadius = lolRangeToWorld(unitSize.pathing);
    this.selectionRadius = lolRangeToWorld(unitSize.selection);
    this._dariusWArmed = false;
    // 챔피언 전용 전투 상태 - Darius 출혈 Map, Lee Sin Q 표식, Sett Q/W/R, Nilah E/R,
    // Yasuo/마스터 이/레넥톤 임시 상태 등이 다음 챔피언에 새어 나오지 않게 새로 만든다.
    this._freshChampionStates();
    this._dashState = null;
    this._rRecastReadyUntil = 0;
    this.bonusAD = 0; this.bonusAP = 0;
    this.bonusMaxHp = 0;
    // 버그 수정: 가렌 W 처치 스택(bonusArmor/bonusMr)이 챔피언 교체 후에도 남아
    // 다음 챔피언의 방어력/마저에 그대로 더해졌다.
    this.bonusArmor = 0; this.bonusMr = 0; this._garenCourageStacks = 0;
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
      this.bonusMaxHp = 0;
      this.mp = 0;
      this.playFirstAvailable(['Idle1'], { loop: THREE.LoopRepeat, fade: 0 });
    }
    // 치명타 배율은 챔피언마다 기본값(1.75)으로 되돌린다 - 예전엔 요네(190%)에서 다른
    // 챔피언으로 바꿔도 그 배율이 그대로 남았다. 치명타 확률은 recomputeStats()가 계산.
    this.stats.critMultiplier = 1.75;
    if (this.championId === 'yasuo') { this._yasuo.lastMovePosition = this.root.position.clone(); this.mp = 0; }
    // 요네: 사냥꾼의 길(치명타 확률 2배 + 초과분 AD 환산 + 치명타 피해 감소)은
    // 야스오와 달리 이동 누적형 Flow 보호막이 없으므로 그 부분만 제외하고
    // 크리티컬 관련 스탯만 매 tick(_yoneTick)에서 계속 갱신한다. 여기서는
    // 챔피언 교체 시 상태 초기화만 담당.
    if (this.championId === 'yone') { this.stats.critMultiplier = this._champData().passive.critDamage; this.mp = 0; }
    if (this.championId === 'nilah') {
      this.armorPenPercent = 0;
      // 닐라 지형 충돌 반경 32·선택 반경 120(실제 bin 확인)은 25차부터 CHAMPION_UNIT_SIZE_LOL 표에서 위 공통 코드가 넣는다.
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
      const hpPct = this.maxHp ? this.hp / this.maxHp : 1; // 첫 계산(최대 체력 미정) 때만 쓰임
      const prevMaxHp = this.maxHp || 0, prevMaxMp = this.maxMp || 0;
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
      this.stats.abilityPower = ((this.itemBonusAP || 0) + (this.bonusAP || 0)) * (1 + (this.itemTotalApMultiplierBonus || 0)); // bonusAP: 챔피언 임시 주문력(모데카이저 R 강탈)
      this.stats.baseAttackSpeed = base.baseAttackSpeed;
      this.stats.levelBonusAttackSpeed = base.levelBonusAttackSpeed || 0;
      this.stats.windupPercent = base.windupPercent != null ? base.windupPercent : 0.4;
      this.stats.windupModifier = base.windupModifier != null ? base.windupModifier : 1;
      this.stats.attackSpeedRatio = base.attackSpeedRatio || base.baseAttackSpeed;
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
      // 야스오/요네 패시브 "의지": 다른 출처 치명타 확률 2배, 100% 초과분 1%당 추가
      // 공격력 0.5. 버그 수정: 예전엔 아이템이 없어도 치명타 확률을 매 프레임 100%로
      // 강제해 1레벨부터 모든 평타/Q가 치명타였다.
      if (this.championId === 'yasuo' || this.championId === 'yone') {
        const pv = this._champData().passive;
        const raw = this.stats.critChance * (pv.critChanceMultiplier || 2);
        this.stats.critChance = Math.min(1, raw);
        const intentAd = Math.max(0, raw - 1) * 100 * (pv.overcapCritToAd || 0.5);
        this.stats.attackDamage += intentAd; // attackDamage는 위에서 매번 새로 계산되므로 그냥 더한다
        this._intentBonusAD = intentAd;
      }
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
      this.stats.championBaseMoveSpeed = base.baseMoveSpeed; // 아이템 없는 챔피언 기본 이동 속도(이동 애니메이션 재생 배율 기준)
      // 원작: 최대 체력/마나가 늘면(레벨업·체력 아이템 구매·버프) 늘어난 만큼 현재 값도 함께 늘고,
      // 줄면(판매·버프 종료) 현재 값은 새 최대치로만 잘린다. 버그 수정: 예전엔 아이템을 사도 현재
      // 체력이 그대로였고, 레벨업은 "비율 유지"로 처리했다(원작과 다름).
      const gainHp = Math.max(0, this.maxHp - (prevMaxHp || 0));
      const gainMp = Math.max(0, this.maxMp - (prevMaxMp || 0));
      if (!prevMaxHp) this.hp = this.hp || this.maxHp * hpPct;
      else this.hp = (this.hp || 0) + gainHp;
      this.hp = Math.min(this.hp, this.maxHp);
      this.mp = Math.min(prevMaxMp ? (this.mp || 0) + gainMp : (this.mp || this.maxMp), this.maxMp);
    }
    updateBars(this);
  }

  levelUp() {
    if (this.champLevel >= 18) return;
    this.champLevel++;
    // 요청 1: "레벨업 시 스킬 포인트를 1개 획득한다" - 수동 레벨업 버튼과
    // EXP 자동 레벨업 둘 다 이 메서드를 거치므로 한 곳만 고치면 된다.
    this.skillPoints = (this.skillPoints || 0) + 1;
    // 레벨업으로 늘어난 최대 체력/마나만큼 현재 값도 늘어난다(recomputeStats가 처리 - 원작).
    this.recomputeStats();
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
      return (this._locoHaste && typeof this._hasteMoveClipName === 'function' && this._hasteMoveClipName()) ? [this._hasteMoveClipName(), 'Run1_Raw'] : ['Run1_Raw'];
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
    // 바루스 Q 충전 중 이동: GLB의 충전 걷기 클립(Spell1_Walk)으로 충전 자세를 유지한 채 걷는다.
    if (this.currentActionKey === 'varusQCharge' && this.findAnimation('Spell1_Walk')) return ['Spell1_Walk'];
    if (this.currentActionKey === 'nilahR') {
      const base = this._locomotionSubStateClips('moveClips') || this.actionData.move.clips;
      return base;
    }
    let base = this._locomotionSubStateClips('moveClips') || this.actionData.move.clips;
    // 빠른 달리기 상태(_updateLocomotionPlayback)면 원작 Run_Haste 클립을 맨 앞에 둔다.
    if (this._locoHaste && typeof this._hasteMoveClipName === 'function' && this._hasteMoveClipName()) base = [this._hasteMoveClipName(), ...base];
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
    let action = this.getOrCreateAction(clip);
    // 24차(끊김 수정): 지금 재생 중인 클립을 다시 틀면 예전엔 페이드 없이 첫 프레임으로 되감아 자세가 튀었다.
    // - 반복 클립(대기·달리기 등): 되감지 않고 그대로 이어서 재생한다.
    // - 한 번 재생 클립(같은 평타 연속 등): 같은 클립의 복사본 액션으로 크로스페이드해 처음부터 다시 시작한다.
    if (this.currentAction === action || (this._altActions && this.currentAction === this._altActions[clip.name])) {
      if (loop !== THREE.LoopOnce && !time) {
        const cur = this.currentAction;
        cur.timeScale = timeScale; cur.enabled = true; cur.setEffectiveWeight(1);
        if (!cur.isRunning()) cur.play();
        return cur;
      }
      this._altActions = this._altActions || {};
      if (!this._altActions[clip.name]) this._altActions[clip.name] = this.mixer.clipAction(clip.clone());
      action = this.currentAction === this._altActions[clip.name] ? this.getOrCreateAction(clip) : this._altActions[clip.name];
    }
    // 24차(끊김 수정): 대기·이동 ↔ 평타·스킬 전환은 페이드를 최소 MIN_LOCOMOTION_ACTION_FADE로 맞춘다. 스킬 코드들이
    // 0.03~0.05초처럼 짧은 페이드를 써서, 달리다가 스킬을 쓰면 한두 프레임 만에 자세가 바뀌어 튀었다(측정:
    // tools/e2e_glb/smooth_check.js). 평타·스킬끼리 이어지는 전환(연속 시퀀스)은 타이밍 때문에 그대로 둔다.
    if (this.currentAction && this.currentAction !== action && fade < MIN_LOCOMOTION_ACTION_FADE) {
      const prevName = this.currentClipKey;
      const loco = (n) => !!n && (this._moveClips().includes(n) || this._idleClips().includes(n));
      if (loco(prevName) !== loco(clip.name)) fade = MIN_LOCOMOTION_ACTION_FADE;
    }
    // 24차(끊김 수정): 섞이는 비중을 "지금 비중"에서 이어 간다. 기본 crossFadeTo는 항상 새 동작 0→1, 이전 동작 1→0으로
    // 다시 시작해서, 전환 도중 또 전환이 오면(예: 정지 명령 → 한 프레임 달리기 → 대기) 섞이던 동작의 비중이 순간적으로
    // 0이나 1로 튀었다. 반복 클립이 아직 섞이는 중이면 되감지도 않는다.
    // 25차: 지금 비중은 페이드 곡선에서 바로 계산한다. getEffectiveWeight()는 마지막 mixer.update() 때 값이라, 같은
    // 프레임 안에서 전환이 두 번 오면(정지 명령 = 한 프레임 달리기 → 도착 → 대기) 방금 시작한 달리기를 비중 1로 읽어
    // 그 한 프레임 동안 달리기와 대기가 반반 섞였다(팔꿈치가 한 프레임에 크게 튐).
    const mixerTime = this.mixer.time;
    const weightNow = (a) => {
      if (!a || !a.enabled || !this.mixer._isActiveAction(a)) return 0;
      const ip = a._weightInterpolant;
      if (!ip) return a.weight;
      const pp = ip.parameterPositions, sv = ip.sampleValues;
      const k = pp[1] > pp[0] ? THREE.MathUtils.clamp((mixerTime - pp[0]) / (pp[1] - pp[0]), 0, 1) : 1;
      return a.weight * (sv[0] + (sv[1] - sv[0]) * k);
    };
    const blending = this.currentAction && this.currentAction !== action;
    const wNow = blending && action.isRunning() ? weightNow(action) : 0;
    const keepTime = wNow > 0.001 && loop !== THREE.LoopOnce && !time;
    if (!keepTime) { action.reset(); action.time = time; }
    action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = clampWhenFinished;
    action.timeScale = timeScale;
    action.enabled = true;
    if (blending && fade > 0) {
      action.play();
      const others = new Set([...Object.values(this.actions || {}), ...Object.values(this._altActions || {})]);
      for (const x of others) {
        // 끝나서 마지막 자세로 멈춰 있는(clampWhenFinished) 1회 재생 동작도 비중을 계속 갖고 있으므로 같이 내린다.
        if (x === action || !x.enabled || !this.mixer._isActiveAction(x)) continue;
        const w = weightNow(x);
        // 실제 비중 = 기본 비중(weight) × 페이드 값이므로, 기본 비중은 1로 두고 페이드 값만 지금 비중에서 0으로 내린다
        // (0이 되면 three.js가 알아서 끈다). setEffectiveWeight는 진행 중이던 페이드를 멈춘 뒤라 먼저 부른다.
        if (w > 0.001) { x.setEffectiveWeight(1); x._scheduleFading(fade, w, 0); }
        // 31차: 같은 프레임에 막 페이드인을 시작한 동작(지금 비중 0, 0→1 예약)은 건너뛰면 그 예약대로 비중 1까지
        // 올라가 새 동작과 끝까지 섞였다(평타 시작 프레임에 이동 명령 → 달리면서 평타 자세로 미끄러짐). 끈다.
        else if (x._weightInterpolant) x.stop();
      }
      action.setEffectiveWeight(1);
      action._scheduleFading(fade, wNow, 1);
    } else {
      if (blending) {
        this.currentAction.stop();
        // 페이드 없는 전환: 아직 섞이던(페이드 예약이 남은) 다른 동작도 같이 끈다(위 31차 수정과 같은 이유).
        for (const x of new Set([...Object.values(this.actions || {}), ...Object.values(this._altActions || {})])) {
          if (x !== action && x._weightInterpolant && this.mixer._isActiveAction(x)) x.stop();
        }
      }
      action.setEffectiveWeight(1);
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
        || this._isLeeSinCastLock()) {
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
    // 닐라 Q 후딜(판정 이후 남은 모션): 이동/평타/스킬로 언제든 끊을 수 있다.
    if (this.championId === 'nilah' && this.currentActionKey === 'nilahQTail') {
      return { canMove: true, canAttack: true, canCast: true, canTurn: true };
    }
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
    if (this._leesinEndTransientClip) this._leesinEndTransientClip(); // 32차: 리 신 W2/E2 임시 이동 클립 등록도 같이 푼다
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

    // 시전이 끝나 "이동으로 끊을 수 있는" 후딜(RECOVERY + phaseCancelable)에 들어갔는데 기다리던 이동 명령이 있으면
    // 바로 이어간다(원작: 시전 시간이 끝나면 남은 모션은 이동으로 끊긴다). 그 구간에 새로 이동을 누르면 끊기는 것과 같은 규칙.
    if (this.pendingMove && this.currentPhase === 'RECOVERY' && this.phaseCancelable
        && (this.getActionAuthority().canMove || !(this.actionData && this.actionData[this.currentActionKey]))
        && !(this.championId === 'masteryi' && (this.currentActionKey === 'w' || this.currentActionKey === 'masteryiW'))) {
      const p = this.pendingMove; this.pendingMove = null;
      this._clearActionTimers();
      this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
      // 남은 모션이 짧으면(0.5초 이하) 잘라내지 않고 그 모션을 유지한 채 움직이기 시작한다(예: 레넥톤 Q 회전 -
      // 원작처럼 돌면서 이동). 끝나면 이동 루프로 넘어간다. 길면 바로 이동 모션으로 크로스페이드.
      const a = this.currentAction, clipName = this.currentClipKey;
      if (a && clipName && !this._moveClips().includes(clipName)) {
        const remain = (a.getClip().duration - a.time) / Math.max(0.05, Math.abs(a.timeScale || 1));
        if (remain > 0.03 && remain <= 0.5) {
          this._beginTransientMoveClip(clipName);
          this._champTimeout(() => this._endTransientMoveClip(clipName), remain * 1000);
        }
      }
      this._commitMove(p);
    }
    // 24차: 평타 클립이 다음 공격보다 먼저 끝나면(타격 장면을 피해 시점에 맞춰 재생하면 흔하다) 마지막 프레임에
    // 굳어 있지 않고 대기 자세로 부드럽게 넘어간다. 0.15초는 원작 수치가 없어 정한 연출값이다.
    // 25차: 원작 GLB에 짝이 되는 마무리 클립(Attack1 → Attack1_ToIdle 등 - 아리·리 신·모데카이저·벡스·요네)이 있으면
    // 그 클립으로 이어 간다. 이 챔피언들의 평타 클립은 맞는 순간에서 끝나도록 만들어져 있어(요네 Attack1은 마지막
    // 키프레임이 칼이 닿는 자세), 예전엔 그 자세로 굳어 있다가 대기로 섞였다.
    if (this.state === STATE.ATTACK && this.currentAction && this.currentClipKey && !this._idleClips().includes(this.currentClipKey)) {
      const a = this.currentAction, clip = a.getClip ? a.getClip() : null;
      if (clip && a.loop === THREE.LoopOnce && a.time >= clip.duration - 1e-3) {
        const plain = /^(attack|crit)/i.test(this.currentActionKey || '') && !/override/i.test(this.currentActionKey || '');
        const follow = plain && typeof attackFollowThroughClip === 'function' ? attackFollowThroughClip(this, clip) : null;
        if (follow) this.crossFadeToClip(follow, { loop: THREE.LoopOnce, clampWhenFinished: true, fade: 0.05, timeScale: Math.abs(a.timeScale || 1) });
        else if (this.currentPhase === 'RECOVERY') this.playFirstAvailable(this._idleClips(), { loop: THREE.LoopRepeat, fade: 0.15 });
      }
    }
    if (this._updateApproachCast) this._updateApproachCast(); // 대상 지정 스킬: 사거리까지 걸어간 뒤 시전
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
    tickShields(this, dt); // 보호막 만료·감소(인스턴스별)
    // 플레이어 군중 제어 모션(원작: 기절·에어본 중 전용 모션). GLB에 Stunned/KnockUp 클립이 있는 챔피언만 재생하고,
    // CC가 풀리면 일반 이동/대기 모션으로 돌아간다. (예전엔 엔진에 플레이어 CC 모션 단계가 없었다.)
    {
      const air = hasStatus(this, 'KNOCKUP') || hasStatus(this, 'SUPPRESSION');
      const cc = air || isCrowdControlled(this);
      if (cc && !this._ccAnimActive) {
        const clips = air ? ['KnockUp_Loop', 'KnockUp', 'KnockUp_In', 'Stunned'] : ['Stunned'];
        if (clips.some((n) => this.findAnimation(n))) { this.playFirstAvailable(clips, { loop: THREE.LoopRepeat, fade: 0.1 }); this._ccAnimActive = true; }
      } else if (!cc && this._ccAnimActive) {
        this._ccAnimActive = false;
        if (!this.currentActionKey) this._returnToLocomotion();
      }
    }
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
    // 세트 Q 이속은 적 챔피언에게 다가갈 때만 적용된다 - 버그 수정: 예전엔 세트에게 걸린 "모든" 이속 버프
    // (아이템·다른 효과)를 0으로 만들었다. Q 버프 몫만 뺀다.
    const settQms = this.championId === 'sett' ? getStatus(this, 'settQ_ms') : null;
    if (settQms && settQms.expiresAt > performance.now()) {
      const movingTowardEnemy = this.isChasing && this.currentTarget && this.currentTarget.hp > 0;
      if (!movingTowardEnemy) msBuff = Math.max(0, msBuff - (settQms.value || 0));
    }
    this.stats.percentMoveSpeedBonus = msBuff + (this.itemBonusMoveSpeedPercent || 0);
    this.stats.flatMoveSpeedBonus = typeof getFlatMoveSpeedBuff === 'function' ? getFlatMoveSpeedBuff(this) : 0;
    // 레넥톤 R(강신): 지속 중 사거리 +25(PC 위키).
    const renektonRRange = (this.championId === 'renekton' && this._renekton && this._renekton.rActive) ? (CHAMPION_DATA.renekton.R.bonusAttackRange || 0) : 0;
    this.stats.attackRange = (this._attackRangeBaseWorld || this.stats.attackRange) + lolRangeToWorld((this._itemTempAttackRangeBonusLol || 0) + renektonRRange);
    this.stats.bonusAttackSpeedPercent = getAttackSpeedBuffPercent(this) + (this.itemBonusAttackSpeedPercent || 0)
      + (typeof itemSpellbladeReadyAttackSpeedPercent === 'function' ? itemSpellbladeReadyAttackSpeedPercent(this) : 0);
    if (this.championId === 'nilah' && this._nilahQActive()) this.stats.bonusAttackSpeedPercent += this._nilahCurrentQASPercent();
    if (this.championId === 'mordekaiser' && this._morde) this.stats.bonusAttackSpeedPercent += this._morde.rStolenAsBonus || 0; // R로 훔친 공격 속도
    this._garenPassiveTick(dt);
    this._dariusPassiveTick();
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
    if (typeof this._nautilusUpdate === 'function') this._nautilusUpdate(dt);
    if (typeof this._rammusUpdate === 'function') this._rammusUpdate(dt);
    if (typeof itemSystemTick === 'function') itemSystemTick(this, dt);
  }
}
// 보호막 합계 접근자(01_status_effect_system.js의 보호막 인스턴스 모델). 읽기는 모든 인스턴스의 합,
// 직접 대입은 "출처 미상 보호막 하나"로 바꾼다(0 대입 = 전부 제거) - 예전 코드·테스트와의 호환용.
Object.defineProperty(CharacterController.prototype, 'shield', {
  configurable: true,
  get() { return (this.shieldEntries || []).reduce((s, e) => s + Math.max(0, e.amount), 0); },
  set(v) {
    if (!Array.isArray(this.shieldEntries)) Object.defineProperty(this, 'shieldEntries', { value: [], writable: true, configurable: true, enumerable: false });
    this.shieldEntries.length = 0;
    if (v > 0) this.shieldEntries.push({ id: 'legacy', amount: v, initial: v, expiresAt: Infinity, decayStartAt: Infinity, decayPerSec: 0 });
  },
});

// 챔피언 타이머(챔피언 간 상태 격리): 챔피언 코드의 지연 실행은 이 함수로 건다. 챔피언을 바꾸면(applyChampionData)
// "챔피언 세대(epoch)"가 바뀌고 남은 타이머가 전부 취소되며, 혹시 남은 콜백도 세대가 다르면 실행되지 않는다.
// 예전엔 _actionTimers에 넣지 않은 지연 판정(모데카이저 E, 야스오 W 장막 등)이 교체 뒤 새 챔피언으로 실행될 수 있었다.
CharacterController.prototype._champTimeout = function(fn, ms) {
  if (!this._championTimers) this._championTimers = new Set();
  const epoch = this._championEpoch || 0;
  const id = setTimeout(() => {
    this._championTimers.delete(id);
    if ((this._championEpoch || 0) !== epoch) return;
    fn();
  }, ms);
  this._championTimers.add(id);
  return id;
};
CharacterController.prototype._champInterval = function(fn, ms) {
  if (!this._championTimers) this._championTimers = new Set();
  const epoch = this._championEpoch || 0;
  const id = setInterval(() => {
    if ((this._championEpoch || 0) !== epoch) { clearInterval(id); this._championTimers.delete(id); return; }
    fn();
  }, ms);
  this._championTimers.add(id);
  return id;
};
CharacterController.prototype._cancelChampionTimers = function() {
  this._championEpoch = (this._championEpoch || 0) + 1;
  if (this._championTimers) { for (const id of this._championTimers) { clearTimeout(id); clearInterval(id); } this._championTimers.clear(); }
};
