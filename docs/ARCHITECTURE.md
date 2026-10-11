# 아키텍처 개요

이 프로젝트는 브라우저에서 `index.html`을 직접 여는(서버 없이, `file://`로도
동작하는) Three.js 기반 1인용 LoL 챔피언 전투 시뮬레이터다. 빌드 과정이
있긴 하지만 번들러(webpack/vite 등)는 쓰지 않는다 - 순서가 중요한 여러
`<script>` 파일을 이어 붙이는 수준의 아주 단순한 파이프라인이다.

## 핵심 설계: "두 장소에 같은 코드"

- **`src/`** - 실제로 고치는 소스. `.js` 파일 52개로 나뉘어 있고, 어떤
  순서로 합쳐야 하는지는 `src/build_manifest.json`의 `parts` 배열이
  정한다(전역 변수/함수를 파일 간에 그냥 참조하는 구조라 순서가 깨지면
  `ReferenceError`가 난다 - 의존하는 파일보다 반드시 뒤에 와야 한다).
- **`dist/runtime.js`** - `tools/build.py`가 `src/runtime_imports.js`
  (import 문들) + manifest 순서대로 이어 붙인 파일들을 합쳐서 만드는
  단일 번들.
- **`index.html`의 `<script id="embedded-runtime" type="module">` 블록**
  - `dist/runtime.js`의 내용을 그대로 복사해 넣은 사본. `file://`로 연
    index.html이 별도 `.js` 파일을 ES 모듈로 로드하지 못하는 브라우저의
    CORS 제약 때문에, 실행되는 코드는 결국 이 인라인 블록이다.

**즉 "진짜로 실행되는 코드"는 index.html 안에 박혀 있고, "사람이 고치는
코드"는 src/에 있다 - 이 둘은 빌드 스크립트를 통해서만 동기화된다.**
src/를 고치고 아래 두 명령을 실행하지 않으면 변경 사항이 전혀 반영되지
않은 채로 "역시 안 고쳐지네"라는 조용한 실패가 난다:

```bash
python3 tools/build.py          # src/*.js -> dist/runtime.js
python3 tools/embed_runtime.py  # dist/runtime.js -> index.html 안으로 재삽입
python3 tools/check_build.py    # 위 두 산출물이 실제로 동기화됐는지 검증
```

`tools/check_build.py`는 이 셋을 잊지 않았는지 기계적으로 확인한다 -
자세한 내용은 스크립트 자신의 docstring 참고.

## 디렉터리 구조

```
src/
  core/        - 전역 상수/상태이상/아이템/경험치/타겟팅 등 챔피언 중립 시스템
  champions/   - 챔피언별 데이터(CHAMPION_DATA)와 로직(CharacterController 확장)
  animation/   - 애니메이션 시퀀스 재생/스킬-애니메이션 매칭
  rendering/   - Three.js 씬/카메라/조명/VFX/모델 스케일
  world/       - 맵(협곡)/미니언/포탑/허수아비 등 월드 오브젝트
  loader/      - GLB 모델 로더
tests/         - Node vm 기반 회귀 테스트(아래 TESTING.md 참고)
tools/         - build.py / embed_runtime.py / check_build.py
docs/          - 이 문서들
dist/          - 빌드 산출물(커밋됨 - index.html과의 동기화 검증 대상)
assets/        - 모델/텍스처 등 정적 리소스
```

## 데이터와 로직의 분리

- **수치**는 `champion_data.js`(`CHAMPION_DATA.<id>`)와 `item_data.js`
  (`ITEM_DATA.<id>`)에만 있다. 쿨다운/피해량/사거리 등을 튜닝하려면 이
  두 파일만 고치면 된다.
- **로직**은 CharacterController 공용 메서드(`character_controller.js` 클래스 본체 +
  `controller_movement.js`/`controller_combat.js`/`controller_casting.js`/
  `controller_lifecycle.js`로 분리된 메서드) + 챔피언별 파일
  (`src/champions/<id>.js`)의 `CharacterController.prototype` 확장,
  아이템은 `item_system.js`의 `itemOn*()` 훅 함수들에 있다.
- 공용 Controller 코드는 항상 `if (this.championId === '<id>')` 같은
  "분기 추가"로만 확장한다 - 기존 챔피언의 로직을 재배치/삭제하지 않는다.
  새 챔피언을 추가하는 정확한 절차는 `docs/ADDING_A_CHAMPION.md` 참고.

## 아이템 시스템의 공용 훅

아이템 패시브는 전투 루프 곳곳에 흩어져 있지 않고, `item_system.js`의
정해진 진입점들을 통해서만 발동한다(새 패시브를 추가할 때 이 목록만
보면 "어디에 꽂아야 하는지" 알 수 있다):

- `itemOnBasicAttackHit(ctrl, target, isCrit)` - 기본 공격 적중 시
- `itemOnDamageDealt(ctrl, target, rawDamage, damageType)` - 피해를
  입혔을 때(스킬/평타 공용)
- `itemOnTakeDamage(ctrl, rawDamage, damageType, source)` - 피해를
  받았을 때
- `itemOnAbilityDispatch(ctrl)` - 스킬을 시전했을 때(스펠블레이드 무장)
- `itemOnLevelUp(ctrl)` / `itemSystemTick(ctrl, dt)` - 레벨업 / 매 프레임
- `itemOnSlowOrImmobilize(ctrl)` - 자신이 건 CC가 적에게 적중했을 때
  (`01_status_effect_system.js`의 `applyStatus()` 공용 진입점에서 호출)

상태이상(스턴/둔화/피해 감소/VULNERABLE 등)도 같은 원칙으로
`01_status_effect_system.js`의 `applyStatus()`/`getXxxPercent()` 공용
함수들을 통해서만 적용·조회된다.

## 1인용 데모라는 근본적 한계

이 엔진에는 아군 챔피언, 팀원과의 상호작용, 소환사 주문, 정글 캠프 같은
실제 LoL의 멀티플레이 요소가 없다. "아군에게 보호막을 씌우면" 같은
효과는 구현이 불가능해 명시적으로 스킵하거나 자기 자신 대상으로
근사한다 - 어떤 항목이 어떻게 처리됐는지는 `docs/KNOWN_LIMITATIONS.md`에
모아 뒀다.
