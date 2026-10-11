# 테스트 가이드

## 테스트 방식

이 프로젝트에는 Jest 같은 테스트 프레임워크가 없다. 대신 Node의 내장
`vm` 모듈로, **실제 프로덕션 소스 파일을 그대로 읽어서 로드하고**
(`fs.readFileSync` + `vm.runInContext`), Three.js/DOM/`performance.now()`
같은 외부 의존성만 최소한으로 스텁 처리한 뒤, 실제로 export된 함수를
호출해 결과를 `assert`하는 방식을 쓴다. 로직 자체를 재구현하거나
모킹하지 않는다 - 테스트가 통과하면 "그 로직이 실제로 그렇게 동작한다"는
뜻이다.

```js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const stubs = { performance: { now: () => now }, console, /* ... */ };
const context = vm.createContext(stubs);
const src = fs.readFileSync(path.join(ROOT, 'src/core/item_system.js'), 'utf8');
vm.runInContext(src + '\nthis.itemOnBasicAttackHit = itemOnBasicAttackHit;', context);
const { itemOnBasicAttackHit } = context;
// ... itemOnBasicAttackHit(ctrl, target, false) 호출 후 assert
```

### 챔피언 전투 로직(`character_controller.js`) 테스트 - 생성자를 부르지 않는다

`character_controller.js`의 `class CharacterController`는 생성자가 GLB
모델/AnimationMixer/VFX를 실제로 만든다 - `new CharacterController(...)`를
그대로 호출하면 렌더링 전체를 스텁해야 해서 비현실적이다. 대신
`Object.create(CharacterController.prototype)`로 생성자를 거치지 않고
빈 인스턴스를 만든 뒤, 테스트가 필요한 필드만 직접 채워 넣는다 - 이렇게
해도 `_settWOnCast`/`_garenQOnHit`/`regen()` 같은 실제 prototype
메서드(순수 게임 로직)는 똑같이 동작한다(`tests/combat_core_bugfix_test.js`
참고). 이 방식은 렌더링/애니메이션 의존성을 피하면서도 실제 전투 수식을
그대로 검증한다 - 로직을 재구현하는 게 아니라는 원칙은 동일하게 지킨다.

## 실행 방법

```bash
# 테스트 파일 전부 실행하고 요약 보고
node tests/run_all.js

# 파일 하나만 실행(디버깅할 때)
node tests/some_test.js
```

`tests/run_all.js`는 `tests/` 안의 `run_all.js`를 제외한 모든 `.js`
파일을 각각 별도 프로세스로 실행하고, `FAIL:`로 시작하는 줄이나 0이
아닌 종료 코드가 하나라도 있으면 전체 종료 코드를 1로 돌려준다(CI
게이트로 그대로 쓸 수 있음). 각 테스트 파일 내부의 `assert(cond, msg)`
헬퍼는 실패해도 그 자리에서 멈추지 않고 `console.error('FAIL:', msg)`를
찍은 뒤 `process.exitCode = 1`만 설정하고 계속 진행한다 - 한 파일 안의
여러 문제를 한 번에 다 보기 위해서다.

## 테스트 범위(2026-10 기준, 31개 파일 / 약 1,996개 assert)

| 파일 | 다루는 영역 |
|---|---|
| `item_unit_test*.js` (1~7) | 구매/판매/조합/인벤토리/트린켓/신발 등 상점·아이템 기본 흐름 |
| `legendary_items_test.js`, `legendary_items_test2.js` | 전설급 아이템 1~9차분 전체 패시브 |
| `crit_items_test.js`, `crit_items_test2.js` | 치명타 계열(무한의 대검 등) |
| `ap_items_round1_test.js`, `ap_items_round2_test.js` | 주문력 계열 |
| `defensive_items_round1_test.js` | 방어형/유틸(벤시의장막, 존야의모래시계 등) |
| `consumables_round_test.js` | 물약/영약/제어 와드 |
| `mejais_test.js` | 메자이의 영혼약탈자 |
| `support_items_test.js` | 서포터 아이템 라인(세계지도집 ~ 5종 업그레이드) |
| `spellblade_base_ad_audit_test.js` | 스펠블레이드 "기본 공격력" 버그의 회귀 방지 전용 |
| `final_legendary_batch_test.js` | 원문 마지막 배치(슈렐리아의군가~제국의명령) + 끝없는 갈망(기아/포식) + 인벤토리 클릭 사용/판매 버그 회귀 방지 |
| `item_fuzz_sweep_test.js` | 156개 아이템 전부를 모든 공용 훅에 일괄 실행해 예외/NaN 오염을 감시하는 전수 스윕 |
| `combat_core_bugfix_test.js` | **전투 로직 전용**(아이템이 아님) - 세트 W 보호막 즉시 적용/피해 지연 판정/투지 보존, 그리버스가 공용 회복 경로와 챔피언 전용 회복(세트 패시브)·기본 재생 양쪽에 실제로 곱해지는지(정령의형상 증폭과 동시 적용 포함), 가렌 Q/다리우스 W가 명중 전엔 안 깎이고 명중 시에만 소모되는지(세트 Q는 기존처럼 즉시 소모 유지) |
| `damage_meta_test.js` | 실제 `applyDamage()` + 아이템 시스템 통합 - 미니언/포탑/우물 피해 시 플레이어가 공격자로 오인되지 않는지(자기 흡혈·증폭 미적용), 피해 메타(평타/도트 틱/아이템 효과/스킬) 전달, 월식 평타 1회 이중 집계 방지, 무라마나 이중 발동 방지, 쇼진의창/운명의 재 스킬 전용 트리거 |
| `nautilus_test.js` | 노틸러스 전체 - 패시브(추가 피해/레벨별 속박/대상별 6초), Q(마나·쿨다운, 적중 피해, 서로 끌려가 중간에서 만남, 끌려가는 동안 기절, 지형=맵 경계 명중 시 50% 환급과 지형 쪽 이동, 빗나감), W(보호막 수치, 평타 추가 피해 2초+주변 350, 보호막이 깨지면 즉시 종료, 만료 시 W 몫만 제거, 보호막 효과 증가 적용), E(3회 폭발·두 번째부터 50%, 감쇠하는 둔화, 범위 밖 제외), R(주 대상 피해·에어본, 경로 위 적 피해·에어본, 사거리/챔피언 전용) |
| `ally_system_test.js` | 아군 더미 시스템 - 아군 목록/범위, 아군 회복(그리버스 포함)/보호막(감소·만료), 실제 `applyDamage`→`damageEnemy` 경로의 보호막 흡수, 리 신 W(아군 돌진+둘 다 보호막/자기 시전/사거리 밖), 태양의 썰매(체력 가장 낮은 아군), 닐라 아군 회복+월석재생기 연쇄 |
| `pen_stacking_test.js` | 방어구·마법 관통력 중첩 계산 |
| `shop_audit_test.js`, `shop_tooltip_test.js`, `item_qa_audit_test.js` | 상점 데이터 전수 감사(비용/스탯/분류 정합성) |
| `vision_unit_test.js` | 시야 시스템 |
| `team_system_test.js` | 팀 태그 기반 아군/적 판정 |
| `minion_dot_tick_test.js` | 미니언 DoT 틱 타이밍 |

이 표에 없는, 실제로 로드되지 않는 보조/디버그 스크립트(`runtime_check*.js`,
`stripped.js`, `smoke_test*.js` 등)는 세션 스크래치패드에만 있고
의도적으로 `tests/`에 커밋하지 않았다 - 아래 "커밋되지 않은 테스트"
참고.

## 헤드리스 Chromium 스모크 테스트

`shop_detail_panel_smoke.js`(Playwright, 이 저장소의 `tests/`에는 없고
세션 스크래치패드에만 있다 - 아래 참고)는 실제 `index.html`을 로컬
HTTP 서버로 띄우고 헤드리스 Chromium으로 열어, 상점 탭 전환/아이템
클릭/상세 패널 표시가 실제 DOM에서 동작하는지, 콘솔 에러가 0건인지
확인한다. `node tests/*.js`들이 "로직이 맞는지"를 보는 반면, 이 테스트는
"그 로직이 실제 UI에 제대로 연결됐는지"를 본다.

## 커밋되지 않은 테스트에 대한 솔직한 설명

과거 README의 일부 라운드 설명은 "새 테스트 파일로 N가지를 검증했다"고
적어 두었지만, 그 테스트 파일들은 작업 세션의 스크래치패드 디렉터리에만
존재했고 이 저장소에는 커밋된 적이 없었다 - 즉 README의 서술 자체는
사실이지만(그 세션에서는 실제로 그 테스트를 작성하고 실행해서 통과를
확인했다), 나중에 이 저장소만 체크아웃한 사람은 그 테스트를 재실행할
방법이 없었다. 이번에 그중 실제로 유효한 ~25개 파일을 가려내 `tests/`에
정식으로 커밋하고, 절대 경로(`/home/user/league-of-legend/...`)로
박혀 있던 `fs.readFileSync` 경로를 전부 `path.join(__dirname, '..', ...)`
기반 상대 경로로 고쳐서 어느 환경에 체크아웃하든 그대로 실행되게
만들었다. `shop_detail_panel_smoke.js`는 Playwright/Chromium이라는
무거운 외부 의존성이 필요해 이번에는 커밋하지 않았다 - 앞으로 이
스모크 테스트까지 저장소에 포함하려면 `package.json`에 Playwright를
devDependency로 추가하고 CI에 Chromium 설치 단계를 넣는 작업이 필요하다.

## 새 테스트를 추가할 때

1. `tests/` 안에 `<기능명>_test.js` 형태로 새 파일을 만든다.
2. 기존 파일 하나를 템플릿으로 복사해 `ROOT`/`path.join` 패턴을 그대로
   따른다(절대 경로를 다시 박아 넣지 않는다).
3. 실제로 고친 프로덕션 소스를 로드하고, 필요한 외부 의존성만 최소한
   으로 스텁 처리한다 - 로직 자체를 테스트 안에서 다시 구현하지 않는다.
4. `node tests/<새 파일>.js`로 단독 실행해 통과를 확인한 뒤,
   `node tests/run_all.js`로 전체 회귀가 깨지지 않았는지 확인한다.
