# 새 챔피언 추가 가이드 (템플릿)

이 문서는 애쉬(Ashe)를 추가할 때 실제로 밟았던 모든 연결 지점을 그대로
체크리스트로 옮긴 것이다. 챔피언 하나를 추가하려면 **필수 5개 파일**
(그중 `character_controller.js`는 6곳)을 건드려야 하고, 모션/범위
표시를 깔끔하게 다듬으려면 선택 항목 몇 개를 더 건드리면 된다.
순서대로 따라가면 된다.

짝이 되는 스켈레톤 파일이 `src/champions/_TEMPLATE.js`에 있다 - 이
문서를 읽으면서 그 파일을 복사해 바로 채워 넣으면 된다.

## 0. 이 프로젝트의 핵심 원칙 (먼저 읽을 것)

- **데이터와 로직을 분리한다**: 수치(쿨다운/피해량/사거리 등)는
  `champion_data.js`의 `CHAMPION_DATA.<id>`에만 두고, 로직은
  `src/champions/<id>.js`의 `CharacterController.prototype` 확장
  함수로 둔다. 튜닝하고 싶으면 데이터 파일만 고치면 되게 만든다.
- **공용 Controller 코드(`character_controller.js`)는 "분기 추가"로만
  건드린다**: 기존 챔피언의 로직을 재배치/삭제하지 않는다. 항상
  `if (this.championId === '<id>') { ... }` 형태로 맨 앞이나 기존
  분기들 사이에 새 분기 하나를 추가하는 식으로만 손댄다.
- **수치를 지어내지 않는다**: 공식 수치를 확인하지 못한 값은 반드시
  "근사값"이라고 주석에 명시한다(이 프로젝트 전체의 원칙 - README의
  각 챔피언 섹션 참고).
- **없는 시스템을 새로 만들지 않는다**: 이 데모에 없는 기능(팀 아군,
  소환사 주문, 정글 캠프 등)에 의존하는 효과는 구현 가능한 범위로
  근사하거나, 왜 생략했는지 주석으로 명시하고 건너뛴다.

## 1. (필수) `src/champions/champion_data.js` - `CHAMPION_DATA.<id>`

기본 스탯(레벨 1 기준값 + 레벨당 성장치) + 패시브/Q/W/E/R의 모든
수치를 담는다. 레벨업 계산은 `computeChampionStats()`가 자동으로
해주므로(`growLinear`/`growPercent`), 여기서는 "레벨 1 값"과
"레벨당 증가량"만 채우면 된다.

```js
myChamp: {
  displayName: '내챔피언',
  stats: {
    hp: 600, hpGrowth: 100, hpRegen: 7, hpRegenGrowth: 0.7,
    ad: 60, adGrowth: 3, attackSpeed: 0.65, attackSpeedGrowthPercent: 2.5,
    armor: 30, armorGrowth: 4, mr: 32, mrGrowth: 1.3,
    range: 125, moveSpeed: 340, mana: 300, manaGrowth: 40, manaRegen: 8, manaRegenGrowth: 0.8,
  },
  passive: { name: '...', desc: '...', /* 패시브 전용 수치 */ },
  Q: { name: '...', cooldown: [8,7,6,5,4], mana: [40,45,50,55,60], damageByLevel: [60,90,120,150,180], bonusAdRatio: 0.6, damageType: 'PHYSICAL' },
  W: { ... },
  E: { ... },
  R: { cooldown: [100,80,60], mana: [100,100,100], damageByLevel: [150,250,350], apRatio: 0.7, damageType: 'MAGICAL' },
},
```

- 랭크별 배열(Q/W/E는 보통 5칸, R은 3칸)은 `skillVal(배열, 스킬레벨)`로
  꺼낸다. 스칼라 값이면 `skillVal`이 그대로 반환하므로 "고정값 스킬"도
  같은 헬퍼로 통일해서 쓸 수 있다.
- 챔피언 레벨 구간(1/6/11/16처럼) 패시브는 `valueByBreakpoints({breakpoints, values}, level)`를 쓴다(애쉬 패시브의 둔화%가 이 패턴).
- `range`/`moveSpeed`는 LoL 원본 단위 그대로 넣는다 - `computeChampionStats()`가
  `lolRangeToWorld()`로 월드 단위 변환까지 자동으로 해준다.
- 확인하지 못한 수치는 값 옆에 `// 공식 수치 미확인 - 근사` 같은 주석을
  반드시 남긴다.

## 2. (필수) `src/champions/champion_ability_database.js` - `championAbilityDatabase.<id>`

GLB의 실제 애니메이션 클립 이름을 Q/W/E/R 및 idle/move/attack에
매핑한다. 이 키는 GLB 업로드 시 "챔피언 선택" 드롭다운(`championIdSelect`)에도
자동으로 노출된다(이 객체의 키를 그대로 읽어 채움 - 별도 HTML 수정 불필요).

```js
myChamp: {
  Q: { animationNames: ['Spell1'], animationPatterns: [/^spell1/i] },
  W: { animationNames: ['Spell2'], animationPatterns: [/^spell2/i] },
  E: { animationNames: ['Spell3'], animationPatterns: [/^spell3/i] },
  R: { animationNames: ['Spell4'], animationPatterns: [/^spell4/i] },
  idleAnimationNames: ['Idle1'],
  moveAnimationNames: ['Run'],
  attackAnimationNames: ['Attack1', 'Attack2'], // 실제 GLB에 존재하는 개수만 적는다(3번째가 없으면 2개만)
},
```

`animationNames`는 정확한 클립명, `animationPatterns`는 정규식 폴백(클립명이
약간 다를 때 대비). 실제 GLB를 열어서(또는 애니메이션 탐색기 UI로) 진짜
클립 이름을 확인한 뒤 채운다 - 추측하지 않는다.

## 3. (필수) `src/champions/<id>.js` - 챔피언 로직 파일

`src/champions/_TEMPLATE.js`를 복사해서 `_x` 전부를 챔피언 id로
바꾸고 채운다. 표준 구조는 다음 메서드들이다(전부
`CharacterController.prototype.<이름> = function(...) {...}` 형태):

| 메서드 | 역할 |
|---|---|
| `_xIsAlive()` | 생존 확인 공용 헬퍼(각 cast 함수 맨 앞에서 호출) |
| `_xOnBasicAttackHit(target, isCritical)` | 패시브가 기본 공격에 묻어나는 경우 |
| `_xCastQ/_xCastW/_xCastE/_xCastR(..., free)` | 스킬 시전 진입점 |
| `_xUpdate(dt)` | 매 프레임 상태 진행(지연 판정, 투사체 수동 이동 등) |

자세한 내부 패턴(상태이상/투사체/히트 디텍션/시야/전 맵 사거리
궁극기)은 아래 "10. 공용 유틸리티 레퍼런스"를 참고.

## 4. (필수) `src/core/character_controller.js` - 6곳 연결(+선택 1곳)

전부 "기존 챔피언 분기 바로 옆에 한 줄/한 블록 추가"다. 자리를 찾을 때는
가장 최근에 추가된 챔피언(현재는 `ashe`)의 분기를 `grep -n "championId === 'ashe'"`로
찾아서 그 바로 옆에 같은 패턴으로 추가하면 된다.

### 4-1. 생성자 - 챔피언 전용 상태 초기화

`constructor()` 안, 다른 챔피언들의 `this._x = {...}` 초기화 블록
옆에 추가:

```js
this._myChamp = {
  // 예: 중첩/지속시간/지연 판정 상태 등 이 챔피언만 쓰는 필드
};
```

### 4-2. `applyChampionData()` - 챔피언 교체 시 리셋

같은 모양의 블록을 **한 번 더** 추가한다(챔피언을 바꿔도 이전 챔피언의
묵은 상태가 안 남게). 생성자 블록과 내용은 거의 동일하되, 복사-붙여넣기만
하면 된다.

### 4-3. `_onBasicAttackHit(target, overrideId, wouldKill, attackHand, isCritical)` 맨 앞

패시브가 평타에 묻어나는 챔피언이면:

```js
if (this.championId === 'myChamp') this._myChampOnBasicAttackHit(target, isCritical);
```

### 4-4. `castAbility(slot, ...)` - 비애니메이션 유틸 스킬이면(선택)

스킬에 별도 시전 모션이 없고(가렌/다리우스/모데카이저 W, 애쉬 Q 같은
"즉시 상태 전환"형) 평타/다른 행동 중에도 즉시 쓸 수 있어야 하면,
행동 잠금 게이트를 우회하는 분기를 추가한다:

```js
if (this.championId === 'myChamp' && slot === 'Q') {
  this._dispatchCast(slot, mouseWorldPoint, false);
  return;
}
```

시전 모션이 있는 평범한 스킬이면 이 단계는 건너뛴다(공용 게이트 로직을
그대로 탄다).

### 4-5. `_dispatchCast(slot, mouseWorldPoint, free)` - 실제 라우팅

```js
if (this.championId === 'myChamp') {
  if (slot === 'Q') return this._myChampCastQ(free);
  if (slot === 'W') return this._myChampCastW(mouseWorldPoint, free);
  if (slot === 'E') return this._myChampCastE(mouseWorldPoint, free);
  if (slot === 'R') return this._myChampCastR(mouseWorldPoint, free);
}
```

방향이 필요 없는 스킬(자기 자신 대상)은 `mouseWorldPoint`를 받는
매개변수 자체를 생략해도 된다(요네/이즈리얼/아리/바루스/애쉬의 기존
분기들이 좋은 예시).

### 4-6. `_die()` - 사망 시 정리

진행 중이던 지연 판정/버프/상태이상을 전부 끈다:

```js
if (this.championId === 'myChamp' && this._myChamp) {
  // 예: this._myChamp.someBuffUntil = 0; clearStatus(this, 'myChampSomeBuff');
}
```

### 4-7. `update(dt)` - 매 프레임 틱 호출

다른 챔피언들의 `this._xUpdate(dt);` 호출 옆에 한 줄 추가:

```js
this._myChampUpdate(dt);
```

## 5. (필수) `src/build_manifest.json`

`"src/champions/<id>.js"`를 다른 챔피언 파일들 사이에 추가한다(위치는
`character_controller.js` **이후**, 순서 자체는 크게 중요하지 않음 -
전부 하나의 모듈로 합쳐지고 함수 선언은 호이스팅되므로).

## 6. (선택) `src/core/skill_timing_database.js`

- **`SKILL_TIMING_DATABASE.<id>`**: 공식 Cast Time을 아는 스킬이 있으면
  `{ eventTime, recovery, lockMove, lockAbility }`로 등록한다. GLB에
  `Channel`/`Channel_Wndup` 클립이 있지만 실제로는 3단계 채널형이
  아닌 즉발 궁극기라면(바루스/애쉬 R이 이 경우), R을 여기 등록하는
  것만으로 자동 채널 추정(`hasRChannel`)이 꺼진다.
- **`MODEL_SCALE_MULTIPLIERS.<id>`**: 모델 크기가 다른 챔피언과 비교해
  작거나 크면 배율을 넣는다. 모르면 `1.00`(기본값)으로 둔다.
- **`CHAMPION_ALIASES`**: GLB 파일명/노드명으로 자동 식별하고 싶으면
  `id: 'id', '한글이름': 'id'` 두 줄을 추가한다. 안 넣어도 상점 드롭다운에서
  수동으로 고를 수 있으니 필수는 아니다.

## 7. (선택) `src/animation/action_timing.js`

자동 추정된 평타/정지/이동 클립이 실제 GLB와 다르면(예: idle 클립이
표정 변형이 아니라 진짜 정지 루프인 것으로 강제 고정하고 싶을 때),
`ashe`/`varus` 분기를 참고해 `data.idle`/`data.move`/`attackVariants`를
강제 지정하는 분기를 추가한다.

## 8. (선택) `src/animation/attack_sequence.js`

- **`ATTACK_SEQUENCE_OVERRIDES.<id>`**: 실제 평타 클립이 2개뿐인데
  엔진이 기본값(3칸)으로 순환시키면 "마지막 클립이 두 번 연속
  재생되는" 버그가 생긴다(이 프로젝트에서 가장 자주 나온 버그 유형).
  실제 클립 수만큼 배열을 등록한다: `myChamp: ['attack1', 'attack2']`.
- **`SKILL_HITBOX_SHAPE.<id>`**: 범위 표시(사거리 토글 V)가 원이 아니라
  부채꼴/직선/사다리꼴이면 등록한다: `{ W: { type: 'cone', angleDeg: 46 } }`
  또는 `{ R: { type: 'line', halfWidthWorld: lolRangeToWorld(130) * 0.5 } }`.
- **전 맵 사거리 궁극기의 표시 범위 클램프**: R 사거리가 20000(글로벌)
  같은 값이면 그대로 그렸을 때 화면 밖까지 나간다. `RangeIndicatorSystem.update()`
  안의 애쉬 R 전용 분기(`if (ctrl.championId === 'ashe' && slot === 'R' ...)`)를
  참고해 표시용 사거리만 클램프하는 분기를 추가한다(실제 판정 사거리는
  그대로 둔다).

## 9. (선택) `src/core/controller_post_class_helpers.js`

쿨다운/마나 대신 스택이나 충전 횟수를 HUD 스킬 슬롯에 보여주고 싶으면
(애쉬 Q의 "0/4" 배지, 닐라 E의 충전 배지가 좋은 예시) `updateSkillUI()`
안에 `key === 'Q' && controller.championId === 'myChamp'` 분기를
추가해서 `.charges` 클래스의 배지 엘리먼트를 직접 그린다.

## 10. 공용 유틸리티 레퍼런스

새 챔피언 로직을 짤 때 항상 이 함수들을 재사용한다 - 직접 새로
만들지 않는다.

- **상태이상**: `applyStatus(target, { id, type, duration, value, source })` /
  `clearStatus(target, id)` / `hasStatus` / `getStatus`. `type`은
  `CC_TYPES`에 정의된 것(SLOW/STUN/ROOT/SILENCE/KNOCKUP/GRIEVOUS/AS_BUFF 등) 중
  골라 쓴다. 같은 `id`로 다시 걸면 갱신(upsert)이지 중첩이 아니다.
- **피해 적용**: `applyDamage(target, { rawDamage, damageType, isCritical, critMultiplier, source, armorPenPercent? })`.
  대상이 미니언/포탑/억제기/넥서스일 수 있으면 직접 분기하지 말고
  그냥 `applyDamage()`에 넘기면 내부에서 알아서 전용 함수로
  라우팅한다(단, 투사체 `onHit` 콜백 안에서는 대상 종류별로 직접
  갈라야 할 때도 있다 - `ashe.js`의 `_asheFireFlurry`/`_asheResolveWImpact` 참고).
  **`source: this`를 반드시 채운다** - 아이템 흡혈/`_itemLastDealtChampionDamageAt`
  같은 범용 아이템 훅이 이 필드를 읽는다.
- **범위/직선 탐색**: `findEnemiesInRadius(center, lolRadius, {forward, maxAngleDeg})` (원형 또는 부채꼴),
  `findFirstInLine(origin, dir, lolRange, halfWidth)` (직선 스킬샷 첫 대상).
  둘 다 시야 필터(`getTargetableEnemyUnits()`)를 이미 적용한 상태로
  반환한다.
- **투사체**: `projectiles.spawn({ from, target, speed, color, realmId, onHit })` - 고정
  수명(2.5초)이 있는 일반 투사체. **전 맵 사거리/장거리 관통형
  궁극기**(이즈리얼 R, 애쉬 R)처럼 그보다 오래 날아가야 하면 이
  시스템을 쓰지 말고, `ashe.js`의 `_asheTickRTravel`처럼 `_xUpdate(dt)`에서
  직접 위치를 전진시키는 수동 travel 상태를 만든다.
- **시야**: 스킬이 시야를 밝히면(정찰기/글로벌 궁극기 등)
  `visionSystem.grantVision(위치, lolRadius, durationSec)` 한 줄로 끝난다.
  새 시야 로직을 만들 필요 없음.
- **스킬 비용/쿨다운 지불**: 챔피언 전용 자원(마나 이외)이 없으면
  `if (!this._payCost(slot, free)) return;`를 그대로 쓴다 - 스킬 포인트
  확인, 마나 차감, 쿨다운 설정(스킬 가속 자동 적용 포함)을 전부
  처리해준다. `CHAMPION_DATA.<id>.<slot>.cooldown`/`.mana`가 있으면
  자동으로 그 값을 쓴다. 챔피언 전용 자원(예: 기력/분노)이 있거나
  쿨다운 산식이 복잡하면(공속 비례 등) `_payCost`를 거치지 않고
  직접 `this.cooldowns.X = abilityHasteCooldown(this, 계산된쿨다운)`로
  설정한다 - **이때 `abilityHasteCooldown()`로 감싸는 것을 잊지 않는다**
  (스킬 가속 아이템이 이 챔피언에도 작동하게 하려면 필수).
- **액션 잠금 상태 머신**: 시전 모션이 있는 스킬은
  `this.currentActionKey`/`this.currentPhase`('STARTUP'/'ACTIVE'/'RECOVERY')를
  설정하고 `this.setState(STATE.Q_CAST)` 등을 호출한 뒤, 지연 판정은
  `_xUpdate(dt)`에서 `if (this.currentActionKey === 'myChampQ') { ... }`로
  가드한다(다른 행동으로 이미 전환됐으면 판정을 건너뛰기 위함 - 애쉬
  W/E/R 전부 이 패턴). 행동이 끝나면
  `this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction();`로
  마무리한다.

## 11. 빌드 & 검증 절차

1. `python3 tools/build.py` - `src/build_manifest.json` 순서대로 전부
   이어붙여 `dist/runtime.js`를 만든다.
2. **문법 검증(중요)**: `node --check`는 파일이 `import`로 시작하면
   조용히 문법 오류를 놓친다 - 반드시 import 줄을 떼고 검사한다:
   `tail -n +6 dist/runtime.js > stripped.js && node --check stripped.js`.
3. `python3 tools/embed_runtime.py` - 방금 만든 `dist/runtime.js`를
   `index.html`의 `<script id="embedded-runtime">` 블록 안에 심는다.
   **이 스크립트를 안 돌리면 `index.html`이 예전 코드 그대로 남는다.**
4. 가능하면 헤드리스 브라우저(Playwright + 로컬 `three.js` - `cdn.jsdelivr.net`은
   조직 네트워크 정책상 막혀있는 경우가 많다)로 콘솔 오류 0건을
   확인한다.
5. 순수 로직(데미지 공식, 상태 전이 등)은 Node `vm` 모듈로 최소 스텁을
   만들어 단위 테스트한다 - ES 모듈 최상위 선언은 브라우저의 `window`에도
   노출되지 않으므로, 브라우저에서 직접 호출 테스트는 안 되고 이 방법이
   유일하다(`vm.createContext({})`에 필요한 전역만 스텁하고, 소스 뒤에
   `this.함수명 = 함수명;`을 붙여 추출).

## 12. 체크리스트 요약

- [ ] `champion_data.js`에 `CHAMPION_DATA.<id>` 추가
- [ ] `champion_ability_database.js`에 `championAbilityDatabase.<id>` 추가
- [ ] `src/champions/<id>.js` 작성(`_TEMPLATE.js` 복사)
- [ ] `character_controller.js` 7곳: 생성자 / `applyChampionData()` /
      `_onBasicAttackHit()` / (선택) `castAbility()` 우회 / `_dispatchCast()` /
      `_die()` / `update()`
- [ ] `build_manifest.json`에 파일 추가
- [ ] (선택) `skill_timing_database.js`(캐스트 타임/모델 배율/별칭)
- [ ] (선택) `action_timing.js`(평타/정지/이동 클립 강제)
- [ ] (선택) `attack_sequence.js`(평타 순환 수/범위 표시 모양/사거리 클램프)
- [ ] (선택) `controller_post_class_helpers.js`(스택/충전 배지 UI)
- [ ] 빌드 → 문법 검증 → 임베드 → (가능하면) 헤드리스 테스트 → 단위 테스트
- [ ] README에 새 섹션 추가(수치 출처/근사 여부/생략한 부분 명시)
