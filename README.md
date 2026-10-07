# Modular Champion Viewer

기존 HTML의 실행 구조를 유지하면서 JavaScript를 기능별로 분리한 프로젝트입니다. `dist/runtime.js`가 브라우저용 번들이고 `src/`가 편집용 소스입니다.

## 구조
- `src/rendering/` — 기본 렌더링, 씬, 카메라, 조명, 바닥, VFX, 사거리/타겟 표시
- `src/animation/` — GLB 애니메이션 역할 탐색, 스킬 매핑, 시퀀스, 평타 순서
- `src/core/` — 공통 전투/행동권한/타이밍/투사체/상태/레벨 시스템 및 CharacterController 뼈대
- `src/champions/` — 챔피언별 데이터와 전용 함수. Darius/Garen/Sett/Master Yi/Yasuo/Nilah/Renekton/Cho'Gath/Lee Sin/Mordekaiser/Vex/Ezreal/Ahri/Varus/Ashe를 별도 파일로 분리
- `src/core/vision_system.js` — 시야 시스템(전장의 안개). 범용 수치는 전부 `VISION_CONFIG` 하나에 모여있다(아래 "시야 시스템" 절 참고).
- `src/world/` — 더미, 미니언, 포탑, 죽음의 세계, 칼바람 나락
- `src/loader/` — GLB 교체/로딩/정리
- `assets/ezreal/*.png` — 이즈리얼 Q 전용 VFX 텍스처(실제 커뮤니티드래곤 원본)
- `dist/runtime.js` — 위 파일들을 원래 실행 순서로 합친 실제 런타임

## GLB 모델 파일
챔피언 3D 모델(`*.glb`)은 용량이 커서(챔피언당 5~20MB) 저장소에 커밋하지 않는다.
`index.html`의 "GLB 교체" 화면에서 직접 파일을 불러와야 한다 - 파일명/애니메이션
클립명으로 챔피언이 자동 인식된다(예: `ahri.glb`를 불러오면 자동으로 아리로 인식).

## 변경 원칙
챔피언 전용 메서드는 `CharacterController.prototype` 확장으로 분리했습니다. 그래서 챔피언 파일을 수정해도 공용 Controller 코드를 직접 뒤섞지 않아도 됩니다.

`tools/build.py`를 실행하면 `src/`를 다시 합쳐 `dist/runtime.js`를 만듭니다. `index.html`은 `file://`로 열 때의 ES 모듈 CORS 제약을 피하려고 `dist/runtime.js`를 그대로 인라인 임베드하고 있으므로, 빌드 후에는 `tools/embed_runtime.py`도 함께 실행해야 실제로 열리는 `index.html`에 최신 코드가 반영됩니다.

## 이즈리얼(Ezreal) 관련 참고
처음에는 위키 접근이 막힌 환경에서 실제 게임 데이터 파일(`ezreal.bin`/`ezreal.bin.json`)만으로 `CHAMPION_DATA.ezreal`(`src/champions/champion_data.js`)을 작성/검증했었다. 이후 나무위키/커뮤니티드래곤 등 실제 위키 확인이 가능해지면서 다음 오류들을 바로잡았다(이 프로젝트의 고증 우선 원칙에 따라 - bin 필드를 잘못 해석했던 부분들):

- **W(정수의 흐름)**: 예전 구현은 "즉시 피해를 주는 스킬샷"이었으나, 실제로는 첫 적중 대상에게 **즉시 피해 없이 4초 표식만** 남기고, 이후 기본 공격이나 다른 스킬(Q/E/R)이 그 표식 대상을 맞히면 그때 폭발하며 피해를 준다(스킬로 터뜨리면 그 스킬 마나 소모량+60 환불). bin의 `ManaReturn=60`을 "빗나갔을 때 환불"로 오역했던 것이 원인 - 실제로는 "스킬로 터뜨렸을 때"의 환불량이었다. 또한 W는 미니언/일반 몬스터를 무시하고 챔피언·에픽 몬스터·포탑·억제기·넥서스에만 반응한다(`_ezrealFindWTarget`, `ezreal.js`).
- **R(정조준 사격)의 피해 속성**: `damageType`이 `PHYSICAL`로 잘못 들어가 있었다 - 실제로는 마법 피해다.
- **E(비전 이동) 유도탄 사거리**: `boltRange`를 EzrealEMissile의 표시용 필드값(1175)을 그대로 썼었는데, 나무위키 능력치 표는 유도 사거리를 750으로 명시한다(블링크 사거리 475와는 별개).
- **R vs 구조물 피해 감소 버그**: `u.isMonster` 플래그가 이 뷰어에서 포탑/억제기/넥서스에도 겹쳐 설정돼 있어, 정조준 일격이 구조물에도 미니언 감소 배율을 잘못 적용하고 있었다 - `isMinion` 기준으로만 판정하도록 수정.
- **VFX 색상**: 실제 스킬 레퍼런스 영상(ability_0081_Q1/W1/E1/R1.webm) 프레임을 픽셀 단위로 대조한 결과, W와 E의 투사체 색이 서로 뒤바뀌어 있었고(W는 하늘색이어야 하는데 골드, E는 골드여야 하는데 시안), R은 화면을 가로지르는 궤적 자체가 안 보이고 있었다 - 전부 정정.
- **Q VFX 실제 텍스처 적용**: 사용자가 제공한 CommunityDragon 원본 Q 텍스처 3장(trail/core/hit, `assets/ezreal/ezreal_q_*.png`)을 적용해 기존 단색 원 플레이스홀더를 대체했다(`_ezrealQTrail`/`_ezrealQHitFx`, `nilah_vfx_assets_and_runtime.js` - 파일명은 닐라 전용이 아니라 프로젝트 공용 VFXSystem이 들어있는 파일이다).
- **평타 모션**: `Ezreal_Attack4.anm`/`ezreal_Attack2.anm` 같은 중복 클립이 자동 채점에 걸려 "3번째 평타" 자리에 잘못 들어갔던 것을 실제 등록된 2종류(Attack1a/Attack2a)만 순환하도록 수정.
- **이동 모션**: 자동 채점이 "Run_To_Idle"(전환용 스텁)을 실제 달리기 루프로 잘못 골랐던 것을 `Run_Normal`로 고정.
- **R 발사 방향**: 키보드 R 입력 핸들러가 다른 스킬과 달리 마우스 좌표를 아예 넘기지 않아 궁이 항상 정면으로만 나갔던 버그 수정.

HP/마나 재생(HP5·MP5)과 마나 성장치는 여전히 bin 원본 파일에 이름 없는 해시 필드로만 들어있어 이 프로젝트 단위와의 정확한 대응을 확인하지 못했고, 다른 챔피언들과 동일한 관례에 맞춘 근사치로 남겨뒀다. 그 외 스탯/패시브/Q/E 수치는 나무위키 능력치 표와 대조해 일치를 확인했다.

## 아리(Ahri) 관련 참고 (2026-08-27 재검증)
사용자가 제공한 ahri.bin/ahri.bin.json 해석을 리그 오브 레전드 위키(wiki.leagueoflegends.com, V26.06 기준)·나무위키와 재대조한 결과, 스탯/패시브(정기 흡수)/W(여우불)/R(혼령 질주)는 정확히 일치했으나 Q/E는 예전 패치 수치가 남아있었다(이 프로젝트의 고증 우선 원칙에 따라 수정):

- **Q(현혹의 구슬)**: 기존 구현은 나갈 때(마법 피해 50~170, AP 40%)와 돌아올 때(고정 피해 55~135, AP 60%)의 수치가 서로 다른 비대칭 구조였다. 실제 최신 툴팁은 "Damage Per Pass: 35/60/85/110/135 (+50% AP)"로 나가는 패스와 돌아오는 패스가 완전히 같은 값이며, 피해 속성만 마법→고정(진정한 피해)으로 바뀐다("Total Mixed Damage"가 정확히 2배인 것으로 확인). 사거리도 970→900, 폭도 100→200(가장자리 기준)으로 갱신. 구슬 이동 속도도 나갈 때는 감속하는 게 아니라 정속(1550)이고, 돌아올 때만 60→2600으로 가속한다(`_ahriCastQ`/`_ahriQCheckHits`/`_ahriTickQTravel`, `ahri.js`).
- **E(매혹)**: 피해량이 기존 [80,135,190,245,300]/AP 90%였는데 실제는 [80,120,160,200,240]/AP 85%(V25.08에서 60%→75%→85%로 인상 확정)다. 매혹 지속시간도 [1.05,1.2,1.35,1.5,1.65]가 아니라 [1.2,1.35,1.5,1.65,1.8], 폭도 60이 아니라 120(가장자리 기준)이다. 추가로 나무위키에서 확인한 사항: 매혹에 적중된 대상은 3초간 아리의 스킬 피해(Q 귀환 고정 피해 포함, 룬/아이템/소환사 주문 제외)를 20% 더 받는다 - 이 디버프는 처음엔 데이터 필드만 기록해두고 미뤘다가, 아래 "기능 구현: 매혹(E) 스킬 피해 증폭 디버프" 절에서 실제로 구현했다.

## 머리 위 자원 바(champResourceBar) 관련 참고
`darius_modular_project_v9_with_ezreal_fixed_mana_bar.zip`에서 가져온 수정. 예전에는 머리 위 체력바 아래 두 번째 바가 `yasuoFlowBar`/`yasuoFlowFill`라는 야스오 전용 클래스라서, 마나를 쓰는 챔피언(아리 포함)이나 레넥톤(분노)/세트(투지)는 그 자리에 아무것도 표시되지 않았다. 범용 `champResourceBar`/`champResourceFill`(mana/rage/flow 세 가지 modifier 클래스)로 교체해 모든 챔피언에서 실제 자원 게이지가 표시되도록 고쳤다(`controller_post_class_helpers.js`의 `updateBars()`, `champion_glb_loader.js`의 `hpLabelDiv.innerHTML`, `index.html`의 관련 CSS).

## 아리 W/매혹 관련 추가 수정 (버그 리포트 반영)
- **W(여우불) 히트 수 제한**: 예전 구현은 여우불 하나가 FlameDuration(2.5초) 동안 SecondaryDelay(0.4초)마다 계속 재사격해서 한 번의 W로 최대 18회(3개 x 최대 6발)까지 때릴 수 있었다. 위키/나무위키 모두 "여우불은 지속/광역 피해가 아니라 단일 판정"이며 "한 번의 W로 단일 대상에게 줄 수 있는 최대 피해량은 표기 수치의 1.8배(=100%+40%+40%)"라고 명시한다 - 즉 여우불 3개가 각각 정확히 한 번씩만 명중해야 한다. 여우불마다 발사 즉시 소멸하도록 바꾸고(`_ahriFireFoxfireAt`), 같은 캐스트에서 이미 한 번 맞은 대상은 다른 여우불이 맞혀도 RepeatDamageMod(40%)만 적용되도록 여우불들끼리 대상을 공유(`hitTargetsThisCast`)한다.
- **매혹(Charm) 이동 속도**: 매혹된 대상이 아리 쪽으로 다가오는 속도가 기존 `MOVE_SPEED * 0.8`(거의 평범한 이동속도)이라 "홀린 듯 느릿하게 다가온다"는 느낌과 맞지 않았다. `MOVE_SPEED * 0.35`로 낮춰 훨씬 느리게 걸어오도록 수정(`01_hit_detection.js`).

## 정지(유휴)/평타 모션 버그 수정 (실제 아리.glb 55클립 대조)
사용자가 실제 `아리.glb`(55클립)를 공유해줘서 클립 목록을 직접 확인했다. Q/W/E/R은 이미 이전 세션에서 이 GLB 기준으로 검증된 정확한 클립명(Spell1/Spell2/Spell3_*/Spell4 등)을 쓰고 있어 문제없었지만, **정지(유휴) 모션**과 **평타 모션**은 전용 오버라이드가 없어 범용 idle/attack 역할 자동 채점(점수 매칭)에만 맡겨져 있었고, 여기서 이즈리얼/요네 때와 동일한 유형의 버그가 있었다:

- **정지(유휴) 모션**: 범용 "idle" 역할 채점은 이름에 "idle"이 들어간 클립을 전부 동점(95점)으로 묶는다. 실제 아리.glb에는 진짜 유휴 루프 `Idle1` 외에도 `Attack1_ToIdle`/`Attack2_ToIdle`(공격 후 정지로 돌아오는 전환용 원샷)/`Idle_In`(달리다 멈출 때 전환용)/`Idle_Var2`/`Idle_var3`(감정표현 변형)까지 전부 동점으로 걸리는데, GLB 안의 등장 순서로 정렬되면 `Attack1_ToIdle`(index 14)이 진짜 유휴 루프 `Idle1`(index 51)보다 훨씬 먼저 나와서 **서 있을 때 반복 재생되는 애니메이션이 "공격 후 정지 전환 포즈"가 되어버리고 있었다** - 이게 "정지 모션이 이상하다"의 원인. `champion_ability_database.js`에 이미 등록돼 있던 `idleAnimationNames: ['Idle1']`을 실제로 적용하도록 `action_timing.js`의 `buildActionData()`에 아리 전용 분기를 추가해 고쳤다(이즈리얼/야스오와 동일한 패턴).
- **평타 모션**: 범용 "attack" 역할 채점도 마찬가지로 이름에 "attack숫자"가 들어간 클립을 전부 동점(100점)으로 묶어서, 진짜 평타(`Attack1`/`Attack2`) 순환에 `Attack1_ToIdle`/`Attack2_ToIdle`/`Attack1_Torun`/`Attack2_Torun`(전환용 스텁)까지 완전한 스윙인 것처럼 섞여 들어가고 있었다(요네/이즈리얼 때와 완전히 동일한 유형의 버그). 이미 등록돼 있던 `attackAnimationNames: ['Attack1', 'Attack2']`를 실제로 강제 적용하도록 같은 함수에 분기를 추가했다.

두 수정 모두 champion_ability_database.js의 기존 등록값을 "실제로 읽어서 적용"하게 만든 것뿐이라 데이터 자체는 그대로다(이전 세션에서 이미 정확하게 등록은 돼 있었으나 적용 코드가 빠져 있었다).

## VFX 색상 재검증 (레퍼런스 영상 ability_0103_Q1/W1/E1/R1/P1.webm 픽셀 대조)
이즈리얼 때와 동일한 방식으로 실제 스킬 레퍼런스 영상 프레임을 뽑아 VFX 핵심 부위 픽셀을 직접 샘플링했다. 기존 구현은 Q/W/R/패시브까지 전부 "클래식 아리 오브"를 가정한 핑크/마젠타 계열(0xff6fd8/0xff5fd0/0xb98bff/0x8fffb0)로 하드코딩돼 있었는데, 실측 결과 **Q/W/R/패시브는 전부 시안·블루·화이트 계열**이었고 **E(매혹)만 실측에서도 핑크 계열(#e8a1ef)**로 확인됐다(E는 그대로 둠). 색상을 실측값 기준으로 정정: Q 구슬/명중(`#91feff` 부근 → `0x7ff5ff`), W 여우불(`#96fefa` 부근 → `0x7ff5ff`), R 명중(자체발광 `#f4fefe`/궤적 `#7695c3` → `0x9fd7ff`), 패시브 회복(`#d0fdff` 부근 → `0xbdf7ff`).

추가로 패시브 영상을 보다가 발견한 버그: 실제 영상은 챔피언 처치 관여 시 정기를 "빨아들이는" 이펙트가 대상 쪽에도 나타나는데, 기존 구현은 아리 자신의 위치에만 이펙트를 띄우고 있었다. `_ahriOnChampionTakedown`이 target을 아예 받지 않는 구조였어서(`00_global_constants.js`의 처형 판정 호출부에서 인자 없이 호출), target을 넘겨받아 대상 위치에도 같은 이펙트를 추가로 띄우도록 고쳤다.

## 기능 구현: 매혹(E) 스킬 피해 증폭 디버프
E 항목에 데이터 필드(`charmSkillDamageAmpPercent`/`charmSkillDamageAmpDuration`)만 기록해두고 미뤄뒀던 부분을 실제로 구현했다. 공식 설명 "매혹에 적중된 대상은 3초간 아리의 스킬 피해를 20% 더 받는다"(룬/아이템/소환사 주문 제외, 평타도 제외 - "스킬" 피해만) 그대로: E가 적중하면 이동 제어(CHARM, 레벨별 1.2~1.8초)와는 별개로 `ahriCharmVuln`이라는 고정 3초짜리 상태를 추가로 건다. 공용 피해 시스템(`calculateDamage`/`applyDamage`)을 건드리면 다른 챔피언에도 영향이 갈 수 있어, 대신 아리 파일 안에 `_ahriCharmVulnMultiplier(target)` 헬퍼를 만들어 Q(왕복 피해)/W(여우불)/R(정기 탄환) 세 곳의 피해 계산에서만 이 배율(1.2배)을 곱하도록 했다 - 평타(_onBasicAttackHit)는 건드리지 않아 "스킬 피해만" 조건도 그대로 만족한다.

## 사망/리스폰 시 상태 정리 누락 버그 수정
전체 코드를 다시 훑어보다가 발견: `_die()`는 레넥톤(R 강제 종료)/모데카이저(죽음의 세계 즉시 정리)/요네(정령 시각효과 정리)는 죽는 순간 진행 중이던 전용 상태를 정리하는데, **아리만 이 정리가 빠져 있었다**. `_ahriUpdate(dt)`는 캐릭터가 DEAD 상태여도(update() 자체가 DEAD를 걸러내지 않음) championId만 확인하고 매 프레임 계속 돈다 - 그래서 Q가 왕복하던 중이나 W 여우불이 떠 있던 중에 죽으면 그 스프라이트가 정리되지 않은 채 남아있다가, `_respawn()`이 `this.root.position`을 `(0,0,0)`으로 순간이동시킬 때 그 자리로 같이 딸려가는 시각적 버그가 있었다. R 재사용 충전(`rCharges`)·재시전 창(`rReadyUntil`)도 사망과 무관하게 그대로 남아있어서, 부활 직후 궁을 공짜로 재시전할 수 있는 상태가 되는 문제도 있었다. `_die()`에 아리 전용 정리(`_ahriEndQTravel()`/`_ahriClearFoxfires()`/R 상태 리셋)를 추가해서 고쳤다(`character_controller.js`). 패시브 정기 스택(`passiveStacks`)은 공식 설명에 사망 시 초기화된다는 언급이 없어 그대로 유지한다.

## 공식 인게임 툴팁 원문 기반 추가 정밀 수정 (R/W)
사용자가 직접 붙여준 R(혼령 질주)/W(여우불) 공식 한국어 툴팁 원문으로 재검증:
- **R 대상 우선순위**: "챔피언을 우선으로 근처 적에게" - 기존엔 사거리 내 적을 그냥 거리로만 정렬해서, 챔피언이 있어도 더 가까운 미니언에게 정기 탄환 자리(최대 3명)를 뺏길 수 있었다. 챔피언을 먼저 채우고 남는 자리만 나머지로 채우도록 수정(`_ahriCastR`).
- **R 재시전 창 연장**: "재사용의 지속 시간을 최대 10초 늘리고" - 기존엔 챔피언 처치 관여마다 재시전 창을 매번 새 15초로 초기화했는데, 실제로는 "지금 남은 창에 10초를 더 얹는" 개념이라 현재 만료 시각에 10초를 더하는 방식으로 수정(`_ahriOnChampionTakedown`). 재사용 횟수가 최대 3회까지만 중첩되는 부분은 기존 구현이 이미 정확했다.
- **W 이동속도 감쇠**: "이동 속도가 40% 증가했다가 2초에 걸쳐 원래대로 돌아옵니다" - 기존엔 지속시간 내내 40%를 유지하다 만료 순간 뚝 끊겼다. 상태이상 시스템에 `decayLinear` 옵션을 추가해 2초에 걸쳐 서서히 0%까지 줄어들도록 수정(`01_status_effect_system.js`의 `getMoveSpeedBuffPercent`).
- **W 대상 우선순위**: "매혹에 적중한 챔피언, 아리가 공격한 적, 이외 챔피언 순으로 공격" - 기존엔 매혹 걸린 대상 다음으로 그냥 가장 가까운 적(미니언 포함)을 봤다. 매혹 챔피언 > 아리의 마지막 평타 대상(3초 이내) > 그 외 챔피언 > (그래도 없으면) 가장 가까운 적 순으로 조준하도록 수정. "아리가 공격한 적" 판정을 위해 `_onBasicAttackHit`에 아리 전용 훅을 추가해 마지막 평타 대상/시각을 기록한다.

## 정밀 점검 요청 반영 (Q/E/R/W 구조적 수정)
사용자가 제공한 상세 버그 리포트(18개 항목)를 코드와 대조해 검증하고 수정했다. 확인된 실제 버그만 최소 범위로 고쳤고, 이미 정상이거나 게임 규칙상 의도된 동작은 되돌리지 않았다.

- **Q 사거리가 클릭 거리에 비례해 짧아지던 버그**: `outDist`를 `rawDist`(아리~클릭 지점 거리)로 클램프하고 있었다 - 마우스는 방향만 정해야 하는데 거리까지 결정해버린 것. `outDist = worldRange`(항상 최대 900)로 고정, 방향만 마우스로 결정하도록 수정(`_ahriCastQ`).
- **Q 재시전 시 이전 구슬 리소스 누수 가능성**: 새 Q 캐스트가 `qTravel`을 그냥 덮어써서 이전 `orbMesh` 참조를 잃을 수 있었다. 캐스트 시작 시 기존 `qTravel`이 있으면 `_ahriEndQTravel()`로 먼저 정리하도록 방어 코드 추가.
- **Q 고속 이동 중 터널링 가능성**: 매 프레임 "현재 위치"만 원형 판정하던 것을 "이전 위치→현재 위치 선분" 판정(`_ahriPointToSegmentDistanceXZ`)으로 교체 - 프레임당 이동량이 커도 그 사이 구간을 놓치지 않는다.
- **E가 시전 순간 미리 골라둔 대상에게 유도(homing)되던 버그**: 기존엔 `findFirstInLine()`으로 대상을 미리 하나 확정해 공용 ProjectileSystem에 target으로 넘겼는데, 이 시스템은 target의 현재 위치를 계속 추적한다 - 대상이 피해도 계속 따라가는 유도탄이 되어 있었다. 공용 ProjectileSystem을 건드리지 않고(다른 챔피언 영향 없음), Q와 동일한 패턴의 아리 전용 진행 상태(`eTravel`/`_ahriTickETravel`)를 새로 만들어 고정된 직선 경로 위에서만 판정하도록 재구현. 이 방식이 터널링 문제도 함께 해결한다(매 프레임 "시작점부터 지금까지 누적 이동 거리 전체"를 다시 검사하므로 빠르게 지나쳐도 놓치지 않는다).
- **R 피해 판정 기준점이 돌진 시작 위치였던 버그**: 공식 설명("dashes to the target location and then fires essence bolts to nearby enemies")대로면 도착 지점 기준이어야 하는데, 시작 위치(startPos) 기준으로 대상을 찾고 있어서 시작 지점의 적은 돌진 도착 전에 맞고 도착 지점의 진짜 대상은 못 맞히는 문제가 있었다. 탐색/피해 기준을 착지 위치(`endPos`)로 수정.
- **W bonusAcquisitionRange가 전혀 쓰이지 않던 문제**: 위키 확인 결과("Each missile of Fox-Fire has its own shorter non-priority range") 두 사거리 중 더 짧은 쪽이 "비우선순위"(그냥 최근접 폴백) 전용이었다 - 즉 우선순위 탐색(매혹/마지막 평타 대상/챔피언)은 더 넓은 `bonusAcquisitionRange`(725)를, 폴백만 `acquisitionRange`(550)를 쓰도록 구분해서 적용(단순 치환이 아니라 각자 맞는 자리에 배치).
- **챔피언 교체 시 Q 오브 material dispose 누락**: `scene.remove()`만 하고 `material.dispose()`가 빠진 경로가 있었다 - `_ahriEndQTravel()`/`_ahriEndETravel()` 하나로 통일해서 항상 함께 정리되게 했고, 새로 추가된 `eTravel`도 함께 정리 대상에 포함.
- **사망 시 정리 목록에 eTravel 추가**: 기존 정리 목록(qTravel/foxfires/rDash/rCharges/rReadyUntil/lastAttackTarget/lastAttackAt)은 그대로 유지하고, 새로 생긴 E 진행 상태(`eTravel`)도 사망 시 정리 대상에 추가.

검증 결과 이미 정상이었던 항목(리포트의 "정상" 판정 근거는 대화 응답 참고): Q 애니메이션/투사체 타이밍 분리(실제 게임과 동일하게 의도된 동작), R 재시전 상태 머신(rCharges/rReadyUntil/rDash 조합이 이미 정확), W 같은 캐스트 내 타겟 확정 방식(발견 즉시 발사하므로 프레임 간 타겟 변경 여지 없음), W 피해 배율 곱셈 순서(교환법칙으로 순서 무관), E 자신의 피해에 자신이 방금 건 매혹 증폭이 적용되지 않는 것(인과 순서상 정상).

## 프로젝트 전체 시스템 감사 (2026-08-27)
아리 하나가 아니라 공용 시스템(챔피언 교체/타이머/ProjectileSystem) 관점에서 감사한 결과. 37개 항목 전체를 매 챔피언마다 처음부터 재검증하지는 않았고(범위가 방대해 이번 감사는 "여러 챔피언에 동시에 영향을 줄 수 있는 공용 시스템"에 집중했다), `applyChampionData()`(챔피언 교체 함수)·`_clearActionTimers()`·`projectile_system.js`를 중심으로 실제 재현 가능한 버그를 찾아 최소 범위로 고쳤다.

### 발견/수정한 버그
- **[P2] 챔피언 교체 후 이전 챔피언의 투사체가 계속 날아가 새 챔피언 상태를 오염시킬 수 있음**: `applyChampionData()`는 `statusEffects`/`shield`/`currentTarget`/`cooldowns` 등은 꼼꼼히 초기화하면서도 공용 `ProjectileSystem`(이즈리얼/벡스 등이 사용)은 전혀 건드리지 않았다. 예를 들어 이즈리얼 Q를 쏜 직후 아리로 바꾸면, 그 투사체가 명중하는 시점엔 이미 `this.championId`가 `'ahri'`로 바뀌어 있어 `applyDamage`의 아리 패시브 훅(`result.source.championId === 'ahri'`)이 실제로는 이즈리얼 Q의 피해인데도 잘못 발동될 수 있었다. `ProjectileSystem`에 `clear()`를 추가(포탑 발사체는 `fromTurret` 플래그로 보존)하고 `applyChampionData()`에서 호출하도록 수정(`projectile_system.js`, `character_controller.js`).
- **[P2] 다리우스 W 강화(bonusAD) 타이머가 챔피언 교체 후에도 남아 새 챔피언의 bonusAD를 잘못 초기화**: `_dariusEmpowerTimer`는 championId/actionKey 확인 없이 무조건 `this.bonusAD = 0`을 실행했고, `applyChampionData()`도 이 타이머 자체를 정리하지 않았다. 다리우스 강화 상태에서 다른 챔피언(예: 레넥톤 강화 상태)으로 바꾸면 몇 초 뒤 이 콜백이 그대로 실행돼 새 챔피언이 정당하게 얻은 bonusAD를 지워버릴 수 있었다. 콜백 안에 `if (this.championId !== 'darius') return;` 추가.
- **[P2] 가렌 W 보호막 타이머가 챔피언 교체 후에도 남아 새 챔피언의 보호막을 임의로 깎을 수 있음**: 기존 토큰(`_garenWShieldToken`) 검사는 "가렌이 W를 다시 썼는지"만 확인하고 챔피언이 바뀌었는지는 확인하지 않았다. 가렌 W 보호막이 떠 있는 도중 다른 챔피언(예: 세트 W 보호막)으로 바꾸면 이 타이머가 실행돼 새 보호막에서 임의로 값을 빼갈 수 있었다. 같은 방식으로 `championId !== 'garen'` 확인 추가.

### 검증 결과 이미 정상이었던 부분
- **범용 액션 타이머 정리**: `_clearActionTimers()`가 `_actionSerial`(세대 ID)을 증가시키고 `_actionTimers`에 쌓인 모든 `setTimeout` id를 실제로 `clearTimeout()`하는 구조가 이미 있었고(사용자가 요청한 "actionToken/generationId" 패턴과 사실상 동일), `applyChampionData()`가 교체 시점에 이를 호출한다 - 아리 Q/W/E, 대부분의 스킬 종료 타이머는 이미 안전하게 처리된다.
- **마스터 이 W 힐 타이머**: `if (this.currentActionKey !== 'masteryiW') return;`로 이미 안전하게 가드되어 있음(교체 시 currentActionKey가 null로 리셋되므로 다른 챔피언에서 절대 발동하지 않는다).
- **포탑 시스템의 TODO 스텁**(`findShacoBoxesNear` 등): 미구현 챔피언(샤코/요릭/티모 등) 관련이라 빈 배열을 반환하는 게 정상이며, 실제 타겟팅 우선순위 로직에 부작용을 주지 않는다 - 버그 아님.

### 이번 감사에서 다루지 못한 부분
사용자가 요청한 37개 항목 전체(모든 챔피언의 평타 콤보/애니메이션 전환/Realm 전체 경로/맵 충돌 등)를 처음부터 끝까지 재검증하지는 못했다. 이번엔 "여러 챔피언에 동시에 영향을 주는 공용 시스템"에 집중했고, 개별 챔피언 스킬 단위의 세부 버그(아리 외 챔피언)는 추가로 특정 챔피언을 지목해 요청하면 그 범위로 이어서 점검할 수 있다.

## 감사 계속 (2건 추가 발견 - 이름 있는 커스텀 타이머 전수 조사)
"챔피언 교체 후 남는 setTimeout" 버그 유형이 하나 더 없는지 프로젝트 전체의 이름 있는 커스텀 타이머(`this._xxxTimer`/`this._champ.xxxTimer` 패턴)를 전수 조사했다. 총 6곳 중 4곳은 이미 안전(`_leesinAnimTimer`는 `_clearActionTimers()`가 정리, `_masteryiWHealTimer`는 `currentActionKey` 확인으로 안전), 2곳에서 이미 앞서 고쳤고(다리우스/가렌), 이번에 1곳을 추가로 발견해 고쳤다.

- **[P2] 모데카이저 W 보호막 감쇠 `setInterval`이 챔피언 교체 후에도 계속 실행되며 새 챔피언의 shield를 반복적으로 덮어씀**: 20틱에 걸쳐 감쇠하는 `setInterval`인데 championId 확인이 없고, `applyChampionData()`도 이 인터벌 자체를 정리하지 않는다. 다리우스/가렌 것과 같은 유형이지만 이쪽은 **반복 실행되는 인터벌**이라 더 심각하다 - 모데카이저 보호막이 감쇠하는 도중 다른 챔피언으로 바꾸면, 새 챔피언으로 바뀐 뒤에도 최대 20번까지 계속 실행되며 새 챔피언의 shield 값을 그때마다 덮어써버릴 수 있었다. 매 틱마다 championId를 확인해 모데카이저가 아니면 인터벌 자체를 멈추도록 수정(`mordekaiser.js`).

이 밖에 이번 감사에서 확인한 정상 항목: SLOW류 상태이상은 챔피언마다 고유한 id(`chogathQ_slow`, `dariusW_slow`, `settR_slow` 등)를 써서 서로 다른 소스가 우연히 같은 id로 충돌하는 문제가 없었고, `getSlowPercent()` 등은 이미 "가장 강한 값 적용"(Math.max) 방식이라 실제 LoL 규칙과 일치한다. 모데카이저 W의 shield 직접 대입(`Math.max`가 아님)은 "누적된 피해 은행을 보호막으로 바꾸는" 고유 메커니즘상 의도된 설계로 판단해 그대로 뒀다(다른 챔피언들의 shield는 전부 Math.max로 최댓값 유지 방식). Realm 시스템(`canRealmInteract`)과 ProjectileSystem의 realm 검사는 이미 정확했다.

## 감사 계속 - 평타 콤보 시스템 (2건째 발견: 아리도 같은 유형의 버그가 남아있었음)
"챔피언 교체" 감사에 이어 평타 콤보/애니메이션 시스템(`attack_sequence.js`, `action_timing.js`)을 봤다.

- **[P1] 아리 평타도 존재하지 않는 3번째 슬롯 때문에 같은 모션이 연속 재생되고 있었음**: 이전 세션에서 아리의 실제 평타 클립을 `action_timing.js`의 `buildActionData()`에서 Attack1/Attack2 2종류로 강제 고정했지만(정지/평타 모션 버그 수정 때), 몇 칸을 순환할지 정하는 `ATTACK_SEQUENCE_OVERRIDES`(`attack_sequence.js`) 테이블에는 아리를 등록하지 않았다 - 이건 완전히 별개의 테이블이라 그때 놓쳤다. 그 결과 `comboIndex`가 여전히 기본값 3칸(`attack1/2/3`)으로 순환했고, 존재하지 않는 `attack3` 자리가 `attackVariants[0]`(=Attack1)로 채워져서 `attack2 → attack3(=Attack1) → attack1(=Attack1)` 경계에서 **Attack1이 두 번 연속 재생**되고 있었다 - 가렌/다리우스/이즈리얼 때와 완전히 동일한 유형의 버그. `ahri: ['attack1', 'attack2']`를 `ATTACK_SEQUENCE_OVERRIDES`에 추가해서 실제 존재하는 클립 수(2개)만큼만 순환하도록 수정.
- 교차 검증 결과, `action_timing.js`에서 평타 클립을 강제 고정하는 다른 챔피언(야스오/요네/리 신/이즈리얼/세트)은 전부 이미 `ATTACK_SEQUENCE_OVERRIDES`에도 정확히 등록되어 있어 문제없었다 - 아리만 그때 그 테이블 등록을 빠뜨렸던 것으로 확인.

## 바루스(Varus) 추가

사용자가 제공한 실제 게임 데이터 파일(`varus.bin`/`varus.bin.json` - CharacterRecord + SpellObject 덤프)과 실제 `바루스.glb`(23클립)로 패시브/Q/W/E/R과 모션을 전부 새로 구현했다(`src/champions/varus.js`, `CHAMPION_DATA.varus`/`champion_ability_database.varus` - champion_data.js/champion_ability_database.js). 이 세션은 이즈리얼 최초 버전 때와 동일하게 네트워크 정책상 `wiki.leagueoflegends.com`/`leagueoflegends.fandom.com`/`metabot.gg` 전부 `EGRESS_BLOCKED`라 실시간 위키 원문 전체 대조는 하지 못했다 - 대신 웹 검색 스니펫으로 W(오한의 화살통)의 세 수치(스택당 최대 체력 비례 피해 3/3.5/4/4.5/5%, 소모 시 잃은 체력 비례 추가 피해 6/8/10/12/14%, 스택당 재사용 대기시간 감소 13%·최대 39%)를 정확히 교차 확인했고, 이 값들이 이즈리얼/아리 때 확립한 "7칸 배열은 index0이 사용되지 않는 자리이고 실제 랭크 1~5는 index1~5" 인덱싱 관례와 정확히 맞아떨어져서 나머지 수치(Q/E/R 피해량·쿨다운 등)도 전부 같은 관례로 해석해 반영했다(정확한 값 유도 과정은 `champion_data.js`의 바루스 항목 상단 주석 참고).

- **기본 스탯**: CharacterRecords/Root 그대로(HP 600/+105, 마나 320/+40, AD 59/+3.4, 방어력 24/+4.6, 마법저항 30/+1.3, 공격속도 0.658/+3.5%, 사거리 575, 이동속도 330) - 전부 공개적으로 잘 알려진 실제 바루스 기본 스탯과 정확히 일치한다. HP5/MP5는 다른 챔피언들과 동일한 관례로 bin의 초당 재생 필드 값을 5배 해서 사용(0.7×5=3.5, 1.6×5=8).
- **패시브(살아있는 복수)**: 적을 공격하면 그 대상에게 갈수록 커지는 공격 속도를 얻는다(챔피언 최대 50%/그 외 최대 10%, 챔피언 레벨에 따라 5~15초에 걸쳐 최대치 도달 - bin `ASDuration`의 `ByCharLevelBreakpoints`). 얻은 보너스 공격 속도의 일부는 공격력으로 전환된다(`AStoADChampion`/`AStoADMinion`). AP 전환분(`AStoAPChampion`/`Minion`)도 bin에 동일하게 있지만, 이 데모에는 주문력 아이템 시스템이 없어(항상 `abilityPower=0`, 다른 챔피언들과 동일한 원칙) 수치만 기록해두고 실제 로직은 추가하지 않았다.
- **Q(꿰뚫는 화살)**: 눌러서 충전(최대 1.25초)하고 다시 누르면 그 시점의 충전량으로 즉시 발사하는 홀드형 스킬샷으로 새로 구현했다 - 이 프로젝트에 기존에 없던 패턴이라, "keyup을 스킬에 전달하지 않는" 이 엔진의 입력 구조(`global_system_instances.js`의 keydown 전용 핸들러) 안에서 마스터 이 W(명상)의 "재입력=즉시 종료" 패턴을 재사용해 "충전 중 재입력=릴리즈"로 구현했다(`castAbility()`의 `varusQCharge` 분기, `character_controller.js`). 충전 중에도 실시간 이동이 가능하다(bin `mCanMoveWhileChanneling` - 닐라 R 실시간 이동과 동일한 패턴 재사용, `moveTo()`의 `varusQCharge` 분기). 사거리(925→1600)와 피해량(최소 충전 시 최대 충전의 66.7%)이 충전량에 비례해 함께 늘어난다. 명중한 대상에게 오한(블라이트) 표식이 있으면 함께 터뜨린다.
- **W(오한의 화살통)**: bin `mAnimationName`이 빈 문자열이라(몸 애니메이션 없음 - 가렌/모데카이저 W와 동일한 순수 유틸 타입) 어떤 행동 중에도 즉시 사용 가능한 논애니메이션 스킬로 구현했다. 기본 공격마다 추가 마법 피해 + 오한 부여(최대 3중첩)는 패시브처럼 항상 적용되고(단, W에 스킬 포인트를 투자해야 발동 - bin `VarusWOnHitDamage`의 랭크0 sentinel `-1`), W를 직접 누르면 사거리 내 오한이 남은 대상 하나를 골라 오한을 전부 터뜨려 중첩당 최대 체력 비례 마법 피해 + 기본 스킬 재사용 대기시간 감소(중첩당 13%, 최대 39%)를 준다. 사거리 내 유효 대상이 없으면 비용을 지불하지 않고 실패한다(40초 쿨다운을 빈 사용으로 낭비하지 않도록).
- **E(화살비)**: 지정 지역에 물리 피해 + 슬로우 + "고통스러운 상처"(자가 회복/재생 약화, 그리버스 상처)를 준다. 이 프로젝트에 모데카이저 죽음의 세계 같은 전용 지속 지면 시스템이 없는 챔피언들과 동일한 수준으로 근사해서, 지속되는 별도 지면 오브젝트 대신 착탄 시점에 범위 안에 있던 대상에게 슬로우/그리버스를 그 지속시간만큼 즉시 건다.
- **R(속박의 사슬)**: 직선 스킬샷으로 첫 명중 대상에게 마법 피해 + 속박을 주고, 이후 일정 시간(1.75초) 동안 주기적으로 근처의 감염되지 않은 적 챔피언에게 퍼져나가며(미니언/구조물은 제외) 동일하게 피해+속박을 건다.
- **상태이상 시스템 확장**: `01_status_effect_system.js`에 `GRIEVOUS`(자가 회복/재생 약화) 상태 타입과 `getGrievousPercent()` 헬퍼를 추가했다 - 이 프로젝트에 챔피언 간 회복량을 실제로 깎는 공용 `applyHeal()` 진입점이 없어(각 챔피언이 각자 회복 로직을 직접 계산) 이 값을 실제로 소비하는 곳은 아직 없지만, 상태이상 자체는 정확히 걸리고 CC 태그 인프라도 그대로 재사용 가능하다(수치 임의 발명 방지 원칙에 따라 지금 존재하지 않는 회복 파이프라인을 새로 만들지는 않았다).
- **애니메이션**: 실제 클립명 기준(Attack1/Attack2/Crit/Death/varus_idle1~4.anm/Spell1(+`_Idle`/`_Walk`/`_Fire`)/Spell3/Spell4/Run/Run2/Channel/Channel_Wndup 등)으로 등록했다. 정지 모션은 감정표현 변형(`varus_idle2~4.anm`)이 아니라 진짜 유휴 루프(`varus_idle1.anm`)로, 평타는 실제 2종류(Attack1/Attack2)만 순환하도록 `action_timing.js`/`attack_sequence.js`에 고정했다(아리/이즈리얼 때와 동일한 유형의 잠재 버그를 미리 예방). GLB에 `Channel`/`Channel_Wndup` 클립이 있지만, 바루스 R의 실제 공식 시전 시간(bin `mCastTime`≈0.24초)은 윈드업→채널 3단계가 아니라 즉시 발사형이라 `SKILL_TIMING_DATABASE.varus`에 R을 등록해 `hasRChannel` 자동 추정 자체를 꺼서 3단계 채널 로직이 걸리지 않게 막았다.
- **검증 방법의 한계**: 이 세션은 `cdn.jsdelivr.net`(three.js CDN)에 대한 아웃바운드 접속도 조직 정책으로 차단돼 있어(`__agentproxy/status`의 `recentRelayFailures`에서 403 정책 거부로 확인) 실제 브라우저에서 GLB를 불러와 눈으로 확인하는 전 과정 테스트는 하지 못했다. 대신 `node --check`로 문법을 검증하고, `champion_data.js`/`champion_ability_database.js`/`varus.js` 사이의 모든 필드명을 교차 확인했으며, 핵심 수치 공식(Q 충전 보간, W 오한 소모 피해/재사용 대기시간 감소, 패시브 공격 속도 램프)은 별도 Node 스크립트로 대표값을 넣어 계산 결과가 의도한 범위(예: 최소 충전 피해=최대 충전 피해의 정확히 66.7%, 오한 소모 재사용 대기시간 감소가 39~58.5% 범위 안)에 들어오는지 확인했다. 실제 게임처럼 화면에서 직접 조작해보는 검증은 아직 못 했다는 점을 밝혀둔다 - 애니메이션 클립 매핑이나 수치 해석에 오차가 있다면 추가 확인 후 바로잡을 수 있다.

## 애쉬(Ashe) 추가

실제 애쉬.glb(87노드/24클립, 사용자 업로드본)로 패시브(서리 화살)/Q(궁사의 집중)/W(일제 사격)/E(매 날리기)/R(마법의 수정화살)과 모션을 새로 구현했다(`src/champions/ashe.js`, `CHAMPION_DATA.ashe`/`championAbilityDatabase.ashe`). 이 세션도 조직 네트워크 정책상 위키/나무위키/mobafire/공식 KR 챔피언 페이지 전부 접근이 막혀 있어 WebSearch 스니펫으로 교차 확인 가능했던 수치만 반영했고, 확인 못한 값은 `champion_data.js`의 ashe 항목 주석에 명시적으로 근사값임을 밝혀뒀다.

- **패시브(서리 화살)**: 기본 공격마다 대상을 둔화시킨다(레벨 구간 5~35%, 궁사의 집중 활성 중 +20%). 치명타는 추가 피해 대신 훨씬 강한 둔화(40~60%)로 대체된다.
- **Q(궁사의 집중)**: 별도 시전 모션이 없는 순수 상태 스킬(가렌/다리우스 W와 동일한 유형)로 구현했다. 기본 공격마다 집중 중첩을 얻고(최대 4), 최대 중첩에서 사용하면 6초간 공격 속도(레벨별 20~60%)를 얻으며 그 동안의 첫 기본 공격이 다발 공격(화살 6발, 총 AD 비율을 사거리 내 여러 대상에 분배)으로 바뀐다.
- **W(일제 사격)**: 전방 부채꼴(`findEnemiesInRadius`의 forward/maxAngleDeg) 안의 모든 적에게 물리 피해+둔화, 대상당 정확히 한 번만 판정한다.
- **E(매 날리기)**: 피해 없는 순수 정찰 스킬 - 위에서 설명한 새 시야 시스템에 실제로 연결되어, 도착 지점에 진짜로 시야를 밝힌다.
- **R(마법의 수정화살)**: 전 맵 사거리(Global, 이즈리얼 R과 동일한 `range||20000` 관례 재사용) 관통형 스킬샷. 이즈리얼 R의 `rTravel`(매 프레임 진행하는 광선) 패턴을 재사용하되, 미니언/구조물은 통과하고 첫 적 챔피언에 닿는 즉시 멈춘다. 명중 시 마법 피해+기절(비행 거리에 비례해 1~3.5초)을 주고, 명중 지점 주변에도 같은 피해(기절 제외)와 짧은 시야를 부여한다.
- **애니메이션**: 실제 클립명(Attack1/Attack2/Crit/Death/Idle1~5/Run/Run2/Run3/Spell1~4/Spell1_In/Channel/Channel_Wndup 등) 기준으로 등록했다. 평타는 실제 2종류(Attack1/Attack2)만 순환하도록 고정했고, `Channel`/`Channel_Wndup` 클립이 있어도 바루스 R과 동일한 이유로 R에 연결하지 않았다(`SKILL_TIMING_DATABASE.ashe.R`로 `hasRChannel` 자동 추정을 꺼서 막음).

## 바루스/이즈리얼/아리 프로젝트 통합 + 애쉬 추가

사용자가 서로 다른 시점에 저장된 3개의 스냅샷(`leagueoflegendahri.zip` - 아리 추가 직후, `darius_modular_project_v9_with_ezreal.zip` - 다리우스 기반 + 이즈리얼 추가, `varus_project.zip` - 바루스 추가 + 그 이전 아리/이즈리얼 수정사항까지 전부 포함)을 제공했다. 세 파일 전체를 비교한 결과 `varus_project.zip`이 나머지 둘의 모든 파일을 내용까지 포함하는 완전한 상위 호환 스냅샷임을 확인했다(세 zip 모두 동일 프로젝트의 서로 다른 체크포인트 - 파일 목록 diff와 공용 파일 크기(character_controller.js/champion_ability_database.js/ezreal.js/ahri.js) 비교로 교차 검증). 즉 "바루스+이즈리얼+아리 통합"은 `varus_project.zip` 자체가 이미 끝낸 상태였고, 이 세션에서는 그 위에 애쉬를 새로 얹었다.

이 `varus_project.zip`은 이전 세션에서 작업했던 "varus_project_fixed_2.zip"보다 더 이른 시점의 바루스 구현(살아있는 복수 패시브가 이벤트 기반이 아니라 평타 지속 시 서서히 오르는 공격속도 램프 방식, `범위 표시(RangeIndicatorSystem)` 코드가 아직 `range_indicator.js`로 역이식되지 않고 `attack_sequence.js`에 섞여 있는 상태 등)을 담고 있다 - 그 차이를 그대로 인정하고 이 스냅샷을 기준으로 애쉬를 통합했다(다른 세션의 더 발전된 바루스 구현을 임의로 끼워 넣지 않음 - 사용자가 실제로 제공한 자료를 기준으로 작업한다는 원칙).

## 시야 시스템(Vision System) 추가

실제 LoL의 핵심 규칙인 "시야 밖의 적은 보이지 않는다"를 재현하는 범용 시스템을 `src/core/vision_system.js`에 새로 만들었다. 조작 중인 챔피언이 지속적인 시야 공급원이고, 애쉬 E(매 날리기)/R(마법의 수정화살)처럼 스킬이 임시 시야를 추가로 등록할 수 있다(`visionSystem.grantVision(위치, 반경, 지속시간)`). 매 프레임 모든 적 유닛(더미/미니언/포탑/억제기/넥서스)이 "어떤 시야 공급원이든 범위 안에 있는가"만 판정해서 3D 모델/머리 위 라벨을 보이거나 숨긴다. 바닥에는 안개 오버레이(동적 캔버스 텍스처)를 그려서 실제로 시야가 좁혀지는 게 눈에 보이게 했다.

- **튜닝 포인트**: 모든 수치가 `VISION_CONFIG` 객체 하나(`vision_system.js` 상단)에 모여있다 - 챔피언 기본 시야 반경(`championSightRange`, 기본 1200 - 실제 LoL 챔피언들의 표준 시야 반경과 비슷한 값), 챔피언별 재정의(`championSightOverride`), 안개 표시 방식(`fogMode: 'hide'|'dim'`), 안개 오버레이의 해상도/불투명도/경계 부드러움(`fogOverlay`). 실제 인게임 수치에 더 가깝게 맞추고 싶으면 이 객체 값만 바꾸면 되고 클래스 로직이나 각 챔피언 파일은 전혀 건드릴 필요가 없다.
- **UI**: 설정 패널에 "시야 시스템(전장의 안개)" 체크박스를 추가했다(기본 켜짐) - 꺼서 기존처럼 모든 적을 항상 보이는 상태로 되돌릴 수 있다.
- **명시적으로 생략한 부분**(수치/기능을 지어내지 않고 생략 - 이 프로젝트의 기존 원칙): 덤불에 의한 근접 은신, 벽에 의한 시야 차단(라인오브사이트) - 이 맵에는 덤불/벽 판정 자체가 없어 순수 원형(반경) 판정만 사용한다. 와드 설치 기능도 없다(이 데모에 아이템/소환사 주문 시스템 자체가 없어 다른 챔피언들의 아이템 생략과 동일한 원칙) - `grantVision()`은 범용 진입점이라 나중에 와드 개념을 추가해도 그대로 재사용할 수 있다.
- **검증**: 이번 세션은 (이전 세션들과 달리) `registry.npmjs.org`를 통해 `three.js`를 로컬로 내려받고 헤드리스 Chromium(Playwright)으로 실제로 페이지를 띄워볼 수 있었다 - WebGL 렌더링이 정상 동작하고 콘솔에 JS 예외가 0건인 것을 확인했다(이는 `CHAMPION_DATA.ashe`/`championAbilityDatabase.ashe`/`VisionSystem` 클래스를 포함한 전체 모듈이 문법 오류 없이 로드 시점에 한 번 전부 실행됐다는 뜻이다). 추가로 `VisionSystem`의 핵심 로직(거리 기반 가시/은폐 전환, `grantVision()` 만료, `setEnabled(false)` 전체 공개)은 Node `vm` 모듈로 THREE/DOM을 최소한으로 스텁한 격리 환경에서 14개 단위 검증을 전부 통과시켜 실제 동작을 확인했다(가짜 적 2개 - 가까운 더미/먼 미니언 - 를 두고 조작 챔피언 위치를 옮겨가며 숨김/노출이 올바르게 전환되는지, 임시 시야가 만료되면 다시 가려지는지 검증). 다만 사용자가 제공했던 실제 애쉬 GLB 파일은 이 세션의 업로드 폴더에 더 이상 없어서(별도 세션/컨테이너였음), 실제 GLB를 불러와 Q/W/E/R을 직접 눌러보며 시야가 걷히는 것까지 두 눈으로 확인하는 end-to-end 테스트는 하지 못했다 - 원래 사용하던 애쉬 GLB 파일을 "GLB 교체" 화면에서 불러오면 그대로 이어서 쓸 수 있다.
- **타게팅 연동(버그 수정)**: 처음 버전은 적을 화면에서 숨기기만 하고(`mesh.visible=false`), 실제 클릭 타게팅(`getEnemyHit()`)과 논타겟 스킬 판정(`findEnemiesInRadius`/`findFirstInLine`)은 여전히 `getAllEnemyUnits()`(가공 전 전체 목록)를 그대로 썼다 - 그 결과 안개에 가려 눈에는 안 보이는 적을 마우스로 클릭하거나 범위/직선 스킬로 맞힐 수 있는 모순이 있었다. `01_hit_detection.js`에 `getTargetableEnemyUnits()`(시야 시스템이 켜져 있으면 `getAllEnemyUnits()`를 `visionSystem.isVisible()`로 한 번 거른 목록, 꺼져 있으면 기존과 동일)를 새로 추가하고, 클릭 타게팅/`findEnemiesInRadius`/`findFirstInLine`/공격-이동 재대상 선정(`_findNearbyAttackRetarget`)이 이 함수를 쓰도록 고쳤다. `VisionSystem.update()` 자신은 계속 `getAllEnemyUnits()`(가공 전 목록)를 써야 한다 - 안 그러면 한 번 시야 밖으로 나간 유닛이 다시 시야 안에 들어와도 영원히 걸러져 나오지 못하는 순환 참조 버그가 생긴다(이 함정을 실제로 짚어내고 피했다 - `vision_system.js` 주석 참고).
  - **의도적으로 그대로 둔 부분**: 바루스 R의 감염 확산 탐색, 아리 매혹/여우불 우선순위 탐색, 이즈리얼 R의 관통 판정처럼 각 챔피언 파일이 `getAllEnemyUnits()`를 직접 호출하는 커스텀 로직은 이번 범위에 포함하지 않았다 - 전부 고치려면 거의 모든 챔피언 파일을 건드려야 해서(이번 세션에 실제 GLB로 눈으로 확인할 방법이 없는 채로) 위험도가 너무 컸다. 또한 "날아가는 투사체/궁극기가 물리적으로 충돌하는 판정"(애쉬 R의 전 맵 관통 광선 등)은 실제 LoL에서도 안개 속을 맹목적으로 관통할 수 있다는 점과도 맞아떨어져 의도적으로 시야 필터를 적용하지 않았다.

## 기본 동작 재확인(가렌/다리우스/모데카이저/마스터 이 + 맵 벽 충돌)

애쉬/시야 시스템 추가 작업이 기존 챔피언이나 맵 충돌에 영향을 주지 않았는지 요청받아 확인했다.

- **가렌/다리우스/모데카이저/마스터 이**: `git diff`로 이번 세션 전체에서 `src/champions/garen.js`/`darius.js`/`mordekaiser.js`/`masteryi.js` 네 파일이 단 한 줄도 바뀌지 않았음을 확인했다 - 그대로 사용자가 제공한 원본이다. 이 네 챔피언과 공유하는 `character_controller.js`의 `_onBasicAttackHit()`/`_beginAttackSwing()`도 애쉬 전용 분기를 "맨 앞에 추가"하거나 기존 호출 끝에 새 선택 인자(`willCrit`)를 덧붙이는 방식으로만 손댔다 - 기존 조건문 순서/로직을 재배치하거나 지우지 않았으므로 네 챔피언의 평타/패시브 로직은 변경 전과 동일하게 동작한다(정적 diff로 확인 - 실제 GLB로 조작해보는 눈 검증은 이번 세션도 하지 못했다. 위 "검증" 절과 동일한 한계).
- **맵 벽 충돌**: 플레이어 이동 목적지를 라인 경계 안으로 즉시 clamp하는 `howling_abyss.js`의 `clampPosition()`(기지 근처일수록 넓어지는 `widenExtraForZ()` 포함)과, 포탑/억제기/넥서스 같은 구조물과의 밀어내기 충돌을 처리하는 `exp_level_system.js`의 `resolvePlayerStructureCollisions()`도 이번 세션에 전혀 수정하지 않았다(`git diff` 확인) - `character_controller.js`의 `moveTo()`가 `realmId==='main'`일 때 `howlingAbyssMap.clampPosition()`을 호출하는 연결 지점도 그대로다. 코드 읽기로 로직 자체(사거리/각도 계산)에 이상은 없어 보이지만, 역시 실제로 벽에 부딪혀보는 눈 검증은 하지 못했다.

