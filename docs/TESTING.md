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

## 테스트 범위(2026-10 기준, 39개 파일 / 약 2,440개 assert)

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
| `five_champion_review_test.js` | 실제 GLB 5챔피언 재점검 - 가렌(Q 추가 피해 계수, W 추가 체력 보호막·강인함 곱연산, 처치 스택·허수아비 바닥 제외·상한, E 대상별 6타 방어력 감소, R 피해), 다리우스(출혈 만료·녹서스의 힘 즉시 5중첩, Q 회복 대상 수/상한, W 90% 둔화, E 패시브 관통 상시, R 만료 중첩 제외·도약), 마스터 이(공속 버프 합산, R 둔화 면역, Q 반복 타격만 25%, 명상 초당 회복, 2타 E 고정 피해, 처치 판정), 리 신(E/Q1/R 0.25초 잠금과 *_ToIdle 복귀, E2 감쇠 둔화·전용 클립, Q2 도착 시 피해, R 경로 충돌), 노틸러스(Passive 클립 우선) |
| `yasuo_review_test.js` | 야스오 - 의지(치명타 2배·초과분 공격력·중복 없음), Q 피해(치명타 이중 적용 제거), Q 쿨다운/시전 시간(추가 공속 비례·상한·레벨 무관), Q1 직선 판정, EQ(돌진 종료 시 원형·3중첩 반경), Q3(중첩 즉시 소모·폭), 결의(LoL 거리 기류·1초 보호막·챔피언/몬스터만), E(관통 475), R(챔피언만·기준 대상 주변 400·추가 공격력 계수), 공용 `_getBonusAD` 레벨 성장 제외 |
| `yone_and_combat_rules_test.js` | 요네(Q 직선·치명타, Q 쿨/시전 bin 관계식, W 8% 계수·보호막 합산/자기 몫만 제거, E 정신체 대상 지정 가능·표식은 챔피언 실제 피해, R 마지막 챔피언 뒤 블링크·피해→기절 해제→공중에 뜸) + 공용(관통 순서, 피해 감소 이중 적용 제거/허수아비 적용, 스탯 성장 공식, 공속 합산·상한 2.5, 속박≠기절, % 이속 합산, DOT 갱신 시 틱 유지) |
| `combat_round3_test.js` | 평타 선딜 공식(가렌 18%·보정 0.5)·챔피언별 선딜·공속 계수(노틸러스 0.612), 피해 감소 곱연산/같은 그룹 최대값/포탑 절반, 마스터 이 Q(총 AD 70%·일반 치명타 배율·몬스터 추가)·W(초당 2연속 공격 중첩·피해 감소 잔존), 다리우스(Q 자루 출혈 없음·출혈 1.25초·R 처치 녹서스의 힘·바닥 허수아비 재시전 방지·W 처치 판정), 리 신 W 70, 가렌 E 중 R, 노틸러스(R 0.46초·Data Dragon 스탯·패시브 14), 야스오(Q 적중 시 효과 첫 대상·R 1초·AD 성장 2.5), 4차: 이동 속도 소프트 캡·음수 저항 배율·치명타 PRD 상수/평균·레벨업/아이템 최대 체력 증가 시 현재 체력 증가·마스터 이 R 유체화/평타 처치 쿨감·리 신 W2 흡혈(패시브 없이)/질풍격 만료 |
| `ten_champion_review_test.js` | 5차: 세트(Q 체력% 계수·W 투지 계수·보호막 0.75초 후 감소·오른손 5~100), 모데카이저(패시브 챔피언만 중첩·4초 만료·W 비챔피언 25%·Q 레벨 피해 63·W 4초), 레넥톤(분노 초당 4 감소·W 챔피언 분노 1회·W 7초 만료), 닐라(R 틱 15+10%·고정 보호막 제거·방관 30/흡혈 20·무한의 대검 판정), 초가스(R 미니언 비챔피언 피해·미니언 중첩 6), 이즈리얼 R(감소 없음·미니언 50%), 애쉬(서리 화살 20% 2초·치명타 둔화 감쇠·치명타 확률 비례 피해·Q 매 평타 다발 6/5발·E 충전 2회), 바루스(처치 공속 10%/관여 30%·5초 종료·W 적중 4+AP 25%·W 사용 = 다음 Q 강화), 6~7차: 미확인 확정값(노틸 패시브 116 등), 벡스 Q/W/E 전용 구현(시전 시간·보호막·관통·둔화), 이즈리얼 Q 0.25초 뒤 발사, 초가스 W 조준 방향 판정 |
| `ally_system_test.js` | 아군 더미 시스템 - 아군 목록/범위, 아군 회복(그리버스 포함)/보호막(감소·만료), 실제 `applyDamage`→`damageEnemy` 경로의 보호막 흡수, 리 신 W(아군 돌진+둘 다 보호막/자기 시전/사거리 밖), 태양의 썰매(체력 가장 낮은 아군), 닐라 아군 회복+월석재생기 연쇄 |
| `pen_stacking_test.js` | 방어구·마법 관통력 중첩 계산 |
| `shop_audit_test.js`, `shop_tooltip_test.js`, `item_qa_audit_test.js` | 상점 데이터 전수 감사(비용/스탯/분류 정합성) |
| `vision_unit_test.js` | 시야 시스템 |
| `team_system_test.js` | 팀 태그 기반 아군/적 판정 |
| `minion_dot_tick_test.js` | 미니언 DoT 틱 타이밍 |
| `skill_aim_test.js` | 스킬 조준 계산(모양·폭·사거리 당김·즉시 시전 판정, 21차) |

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

## 실제 챔피언 GLB로 브라우저 E2E 확인(`tools/e2e_glb/`)

기제 점검(11차 추가): `GLB_DIR=<glb 폴더> THREE_DIR=<three package> node tools/e2e_glb/mechanics_check.js [챔피언...]`(스킬별 피해·상태이상·이동·보호막 기록)와
`node tools/e2e_glb/combo_check.js [챔피언...]`(연계 기제 시간표 실행), `node tools/e2e_glb/switch_check.js [챔피언...]`(스킬 진행 중 챔피언 교체 후 잔존 상태·지연 피해 비교, 13차), `node tools/e2e_glb/realm_check.js [스크린샷.png]`(모데카이저 죽음의 세계, 14차), `node tools/e2e_glb/movement_check.js [챔피언...]`(회전·미끄러짐·재생 속도·스킬 후 이동 복귀, 16차), `node tools/e2e_glb/vision_check.js [스크린샷.png]`(팀 시야·스킬 예고 표시, 17차), `node tools/e2e_glb/brush_check.js [스크린샷.png]`(부쉬, 18차), `node tools/e2e_glb/structure_check.js [스크린샷.png]`(칼바람 구조물 원작 배치, 20차), `node tools/e2e_glb/aim_check.js [스크린샷 접두어]`(스킬 조준·시전 방식, 실제 키보드·마우스 입력, 21차), `node tools/e2e_glb/approach_check.js`(대상 지정 스킬 사거리까지 걸어간 뒤 시전, 22차), `node tools/e2e_glb/library_check.js [스크린샷.png]`(저장소 모델 불러오기, 23차), `node tools/e2e_glb/motion_check.js [챔피언,...]`(평타 무기 뼈 속도 최고 시각 − 피해 시각, 예전 방식과 비교, 24차), `node tools/e2e_glb/smooth_check.js [챔피언,...]`(동작 전환 중 한 프레임 뼈 튐, 24차), `node tools/e2e_glb/spawn_check.js [스크린샷.png]`(팀별 우물 리스폰·귀환, 25차), `node tools/e2e_glb/indicator_check.js [스크린샷 접두어]`(버프 바·스킬 칸 바뀜·대상 표식·준비 고리, 25차), `node tools/e2e_glb/fix26_check.js [스크린샷 접두어]`(가렌 Q 포탑·다리우스 5중첩 표식·리 신 쿨다운/E 충격파·노틸러스 Q 판정, 26차), `node tools/e2e_glb/fix27_check.js [스크린샷 접두어]`(야스오 E 같은 대상 잠김 안내·EQ 원·Q3→R 착지, 요네 모델 중심·W 부채꼴·R 판정, 세트 E 지면 범위·W 중앙 띠·R 모션, 27차), `node tools/e2e_glb/fix28_check.js [스크린샷 접두어]`(모데 R 중심·바깥 체력 바 숨김, 레넥톤 R 크기, 닐라 Q/R 이펙트, 이즈리얼 W/E, 애쉬 W 범위, 바루스 W 쿨 환급·R·Q 조준, 아리 R 연타, 벡스 R/Q, 체력 바 숫자·보호막, 노틸러스 Q 당김, 28차), `node tools/e2e_glb/fix29_check.js [스크린샷 접두어]`(리 신 Q2 돌진 방향·W 대상 지정, 노틸러스 Q 닻줄 표시, 29차), `node tools/e2e_glb/stress_check.js [챔피언...]`(전 챔피언 스트레스: 단독·이동·평타·연타·콤보 뒤 잠금·이동·공중·모션 복귀, 31차), `node tools/e2e_glb/cost_check.js [챔피언...]`(기절·침묵·대상 없음·마나 0 시전 조건, 31차), `node tools/e2e_glb/facing_check.js [챔피언...]`(방향 스킬 시전 방향, 31차), `node tools/e2e_glb/ward_check.js [스크린샷.png]`(와드 설치·걸어가서 놓기·시야·은신과 제어 와드 드러내기·평타로 파괴·스킬 피해 없음·리 신 W·적 시점 숨김, 32차)를 쓴다. motion_check·smooth_check는 저장소 모델을 바로 불러와 GLB_DIR이 필요 없다. 이제 모델이 저장소의 `assets/champions/`에 있다 - GLB_DIR이 필요한 점검은 한글 파일명을 쓰므로 그 폴더를 한글 이름으로 복사해 쓰면 된다. 결과는 JSON으로 출력된다(23차부터 챔피언 GLB는 `assets/champions/`에 들어 있다).

칼바람 나락 맵이 켜져 있으면(19차) CPU 렌더러에서 5~6fps로 떨어진다. 게임 루프가 프레임당 dt를 0.05초로 자르므로 게임 시간이 느려지고, 시간 기반 피해·이동 수치가 작게 잡힌다. 수치를 재는 점검(mechanics/movement/combo/switch)은 `E2E_HIDE_MAP=1`을 붙여 돌린다. 이 옵션은 맵·부쉬를 그리지만 않고, 이동 범위·시야·부쉬 판정은 그대로 둔다. 텍스처 요청의 `ERR_TUNNEL_CONNECTION_FAILED`는 이 환경에서 CommunityDragon이 막힌 탓이다(18차).

챔피언 모델(.glb)은 저장소에 없다(사용자가 직접 올리는 파일). 모델이 있을 때는
헤드리스 Chromium에서 실제 UI로 불러와 평타/Q/W/E/R을 실행해 볼 수 있다:

```bash
# three.js를 CDN 대신 npm에서 받는다(이 환경은 cdn.jsdelivr.net이 막혀 있음)
cd tools/e2e_glb && npm pack three@0.160.0 && mkdir -p three && tar xzf three-0.160.0.tgz -C three
GLB_DIR=/모델/폴더 node run.js            # 폴더 안의 <챔피언이름>.glb 전부
GLB_DIR=/모델/폴더 node run.js 노틸러스    # 일부만
```

파일명(예: `노틸러스.glb`)이 챔피언 자동 식별에 쓰인다. 결과 JSON에는 챔피언 ID,
idle/move/평타/스킬에 실제로 연결된 클립, 각 동작 중 재생된 클립 순서, 더미 피해,
쿨다운, 콘솔 오류가 나온다. 소프트웨어 렌더링이라 게임 시간이 실제 시간보다
느리게 흐를 수 있다(긴 스킬은 대기 시간을 넉넉히). Playwright 경로가 다르면
`PLAYWRIGHT_PATH`/`CHROMIUM_PATH`로 지정한다.

