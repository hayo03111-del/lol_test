# 온라인 1:1 확장 준비 — 구조 분석과 세션 계층(93차)

이 문서는 지금 엔진을 서버 권위(server-authoritative) 1:1 대전으로 넓히기 위한 **준비 단계**의 기록이다.
이번 단계에서는 네트워크 통신, 서버, 매치메이킹, 예측·보정을 하나도 구현하지 않았다.
한 일은 두 가지다.

1. 현재 구조를 코드에서 직접 확인해 정리했다.
2. 기존 동작을 바꾸지 않는 얇은 경계를 만들었다. 경계는 입력 명령, 상태 스냅샷, 게임 이벤트, LocalSession 네 가지다.

표기:
- **[확인]**: 코드에서 직접 확인한 사실. 파일:줄 번호를 붙였고, 줄 번호는 93차 작업 당시 기준이다.
- **[제안]**: 앞으로 할 설계 제안.

---

## 1. 현재 엔진 구조 [확인]

### 1.1 빌드와 실행
- **소스 연결:** `src/build_manifest.json`의 순서대로 `src/**/*.js`를 이어 붙인다. 결과는 `dist/runtime.js`이고, `index.html` 안의 `<script id="embedded-runtime" type="module">`에 그대로 들어간다.
- **전역 공유:** 모든 파일이 하나의 모듈 스코프를 공유한다. 그래서 파일끼리 전역 함수와 변수를 그냥 참조한다.
- **실행 환경:** 번들러나 서버 없이 `file://`로도 열린다. 이번 작업에서도 바꾸지 않았다.

### 1.2 메인 루프
- **위치:** `animate()` (`src/loader/champion_glb_loader.js:1671~`). `requestAnimationFrame`으로 돈다.
- **dt 계산:** `THREE.Clock.getDelta()`로 구하고 0.05초에서 자른다. 그래서 20fps 밑으로 떨어지면 게임 시간이 실제 시간보다 느리게 흐른다.
- **시뮬레이션과 렌더링의 관계:**
  - 둘은 같은 함수 안에 섞여 있다.
  - `if (!paused) { … }` 안에서 컨트롤러, 허수아비 AI, 미니언, 구조물, 투사체, 시야, VFX 갱신이 차례로 돈다.
  - 그 블록이 끝나면 `renderer.render`를 항상 부른다.
- **컨트롤러 갱신 순서** (`controller.update(dt)`, `character_controller.js:1319~`):
  1. 애니메이션 믹서와 시퀀스 플레이어
  2. 이동, 대상 추적, 평타 타이머
  3. 쿨다운, 재생
  4. 상태 효과, 보호막
  5. 능력치 재계산
  6. 챔피언별 tick

### 1.3 유닛과 상태가 사는 곳

| 종류 | 생성 | 목록(전역) | 위치 | 체력·상태 |
|---|---|---|---|---|
| 플레이어 챔피언 | `new CharacterController` (loader:282) | `controller` 하나 | `root.position` (Object3D) | `hp/maxHp/mp/maxMp`, `stats{}`, `cooldowns{Q..R}`(초, dt로 감소), `statusEffects[]`(`expiresAt` ms), `shieldEntries`, `state`(STATE), 챔피언별 `_garen`/`_yasuo`… |
| 허수아비 | `createDummyEnemy` | `dummy`, `placedDummies` | `mesh.position` | 평평한 필드(`armor` 등), 2% 아래로는 안 죽음 |
| 아군 허수아비 | `createAllyDummy` | `placedAllies` | `mesh.position` | 위와 같음 |
| 미니언 | `createMinion` (exp_level_system.js:281) | `minions`, `dyingMinions` | `mesh.position`, 방향은 `body` | `isDead/destroyed` |
| 포탑·억제기·넥서스 | `createTurret` 등 (turret_system.js) | `turrets`, `inhibitorBuildings`, `nexusBuildings` | `mesh.position` | `destroyed`, 우물은 체력 무한·비대상 |
| 와드 | `wardSystem.place` | `wardSystem.wards` | `position` | `expiresAt`, `owner`(객체 참조) |

- **식별자:** 93차 이전에는 어느 유닛에도 고유 ID가 없었다. 유닛을 객체 참조로 구분하고, Map의 키도 객체였다.
- **팀:** `PLAYER_TEAM='BLUE'`, `ENEMY_TEAM='RED'` (00_global_constants.js:33-34).
- **위치 조회:** `getWorldPosition` (00_global_constants.js:318)은 `root`, `mesh`, `position` 순서로 위치를 찾는다.

### 1.4 입력 → 행동 (93차 이전)

| 입력 | 처리 위치 | 최종 호출 |
|---|---|---|
| 우클릭 | global_system_instances.js pointerdown | `getEnemyHit`(화면 좌표) → `selectTarget` 또는 `moveTo` |
| A 후 좌클릭 | 같음 | `attackMoveTo` / `selectTarget` |
| Q/W/E/R | `onSkillKeyDown`, `skillAim` | `skillAim.cast` → `currentTarget` 지정 + `castAbility` |
| D/F | keydown | `castSummonerSpell(controller, slot, 지면좌표, 화면좌표)` |
| B, 귀환 버튼 | keydown, game_screen_ui.js | `startRecall` |
| S | keydown | `moveTo(제자리)` |
| 1~7 | keydown, HUD 칸 | `useItem` |
| 4 | keydown, 장신구 칸 | `placeWard` |
| Ctrl+QWER, + 버튼 | keydown, HUD | `levelUpSkill` |
| 상점 | shop_ui.js | `buildOrBuyItem` / `sellItem` / `sellBoots` |
| 미니맵 우클릭 | game_screen_ui.js | `moveTo` |

규칙 검사(쿨다운, 마나, 사거리, 군중 제어, 골드, 상점 구역)는 대부분 이 최종 함수들 안에 있다.
- 공통 진입은 `castAbility` → `_castAbilityImpl` → `_dispatchCast`이다.
- 침묵 검사는 챔피언별 시전 함수 안에 흩어져 있다.

### 1.5 전투 흐름
- **평타:**
  - `selectTarget` → `_tryEngageTarget` → `_beginAttackSwing`
  - → 원거리는 `projectiles.spawn`, 근접은 `_applyMeleeBasicAttackHit`
  - → `applyDamage` / `applyDamageToMinion|Turret|Inhibitor|Nexus` → `_onBasicAttackHit`
- **스킬:**
  - 챔피언별 `_xxxCastQ`가 `findEnemiesInLine/Radius` (01_hit_detection.js)로 적중 대상을 고른다.
  - 그다음 `applyDamage`와 `applyStatus`를 부른다.
- **피해:** `calculateDamage` (00_global_constants.js:556)에서 저항, 관통, 증폭, 칼바람 보정을 계산한다. 그 결과로 `applyDamage`가 대상 종류별로 나눠 처리한다.
  - 흡혈, 아이템·룬 훅, 처치 판정도 여기서 한다.
  - 챔피언이면 `takeDamage`로 넘어가 피해 감소, 보호막, `_die`를 처리한다.
- **사망과 보상:**
  - 챔피언: `_die` → `setTimeout` → `_respawn`
  - 미니언: `killMinion` → `rewardMinionKill`, 경험치
  - 구조물: `destroyTurret/Inhibitor/Nexus` → `rewardStructureDestroyed`, `checkWinCondition`
- **미연결:** `awardChampionKillExperience`와 `recordChampionTakedown`은 정의만 있고 부르는 곳이 없다. 챔피언 처치 보상이 연결되어 있지 않다.

### 1.6 시간 처리
시계가 세 가지 섞여 있다.
1. **프레임 dt:**
   - 쿨다운(`cooldowns[]`), 이동, 재생, 투사체
   - 미니언과 포탑의 `attackCooldown`
   - 지속 피해 틱 누적, 애니메이션, 돌진 lerp
2. **`performance.now()` 실제 시계 (약 290곳):**
   - 상태 효과 만료(`expiresAt`)
   - 각종 `*Until`/`*ReadyAt` 필드
   - 평타 준비(`_attackReadyAt`), 부활 시각
   - 소환사 주문, 아이템 내부 쿨다운(item_system.js 51곳), 룬
   - 게임 시계(`TURRET_GAME_START_MS`, turret_system.js:117)
3. **`setTimeout`:**
   - `_champTimeout` (character_controller.js:1499, epoch 보호 + `_championTimers`) 약 70곳
   - `_actionTimers`(시전 시점·회복 종료), `_pendingTimeouts`(귀환·부활)
   - 그 밖에 직접 `setTimeout` 약 25곳

**일시정지** (`paused`, global_system_instances.js:480): dt로 도는 것만 멈춘다. 실제 시계 기반 만료, 게임 시계, `setTimeout`은 계속 흐른다.

### 1.7 렌더링 결합(주요 패턴과 대략의 줄 수, 컨트롤러와 챔피언 파일 기준)

| 패턴 | 대략의 줄 수 | 뜻 |
|---|---|---|
| `THREE.` | 524 | 전투 수학을 Vector3로 한다 |
| `this.root.position` | 285 | 위치가 Object3D에 산다 |
| `vfx.` | 135 | 스킬 코드가 직접 이펙트를 만든다 |
| `playFirstAvailable`/`sequencePlayer` | 123 | 애니메이션 재생 |
| UI 호출 | 97 | `updateBars`, `showSkillToast` 등 |
| `scene.add/remove` | 45 | 장면 그래프 직접 조작 |
| DOM | 36 | 화면 요소 직접 조작 |
| 전역 `controller` 가정 | 32 | 공용 코드가 플레이어가 하나라고 본다 |

- **애니메이션이 판정 시점을 정한다:** 클립 길이와 시퀀스 재생 상태가 판정 시점을 정하는 곳이 있다(예: `character_controller.js:1320-1328`).
- **피해 경로의 연출:** `damageEnemy`는 피해 경로 안에서 재질 발광과 체력바 DOM을 바꾼다.

---

## 2. 서버 권위 구조로 가기 어려운 지점 (우선순위 순) [확인 + 제안]

1. **"플레이어는 하나"라는 가정** [확인]
   - `getAllEnemyUnits`가 전역 `controller.team` 기준이다(01_hit_detection.js:17).
   - `resolveDamageSource`는 공격자가 없으면 `controller`로 대체한다.
   - `applyDamageToMinion`의 `fromPlayer`, `killMinion`의 막타 판정, 보상, 아이템 훅이 모두 `controller`를 직접 참조한다.
   - 1:1에서는 챔피언이 둘이므로, 이 함수들이 "누가 보는가/누가 때렸는가"를 인자로 받아야 한다.
2. **시계가 셋** [확인]
   - 서버가 같은 결과를 내려면 하나의 시뮬레이션 시계와 틱 단위 타이머 큐가 필요하다(6절).
3. **`setTimeout` 콜백이 상태를 바꾼다** [확인]
   - 피해, 군중 제어, 상태 전환이 틱 바깥에서 브라우저 순서대로 일어난다.
4. **애니메이션 클립 길이가 판정 시점을 정한다** [확인]
   - 서버(헤드리스)에는 GLB가 없으므로 시점을 데이터로 빼야 한다. `skill_timing_database.js`가 일부 시작점이다.
5. **위치가 Three.js Object3D에 있다** [확인]
   - 서버에서도 Vector3 계산 자체는 쓸 수 있다(three는 node에서도 돈다).
   - 다만 `root`/`mesh`/`scene`이 없는 순수 데이터 위치가 필요하다.
6. **스킬과 피해 코드 안의 VFX·DOM·사운드 호출** [확인]
   - 서버에서는 이벤트로 바꾸거나 아무것도 하지 않는 구현으로 갈아 끼워야 한다.
7. **객체 참조 키** [확인]
   - `_darius.stacksOnTarget`, `_vex.gloom`, `ward.owner`, `currentTarget` 등이 객체를 키로 쓴다. 네트워크 너머로는 ID가 필요하다.
8. **`Math.random` (치명타 등)**
   - 결정론적 재현을 하려면 시드 있는 난수가 필요하다. 다만 서버 권위만 할 거라면 필수는 아니다.
9. **비동기 챔피언 다시 불러오기** [확인]
   - `resetGame`의 `reloadCurrentChampion`은 GLB 파싱 때문에 비동기다. 그 사이 옛 컨트롤러가 계속 돈다.

---

## 3. 93차에서 만든 경계

새 파일은 `src/session/` 아래 넷이다. 모두 기존 함수를 그대로 부르거나 읽기만 하는 얇은 층이고, 게임 규칙을 새로 구현하지 않았다.

### 3.1 `entity_registry.js` — 엔티티 ID
- `entityId(unit)`:
  - 처음 조회할 때 WeakMap으로 정수 ID를 붙인다. 같은 객체는 늘 같은 ID를 갖고, ID는 재사용하지 않는다.
  - 생성 함수를 고치지 않았다.
- `entityKind(unit)`: `'champion'|'dummy'|'allyDummy'|'minion'|'turret'|'inhibitor'|'nexus'|'ward'`
- `listEntities()`: 기존 전역 배열을 읽어서 모은다. 새 목록을 저장하지 않는다.
- `findEntityById(id)`

### 3.2 `game_events.js` — 게임 이벤트
- **함수:** `emitGameEvent(type, data)`, `onGameEvent(type|'*', fn)`, `recentGameEvents(sinceSeq)`. 최근 500개를 고리 버퍼에 둔다.
- **공통 필드:** 모든 이벤트에 `seq`, `tick`, `simTimeSec`가 붙는다. 이벤트 데이터는 숫자, 문자열, ID만 담는다.
- **안전성:** 이벤트 처리 중 오류가 게임 로직으로 번지지 않는다(예외를 삼킨다).
- **발생 지점** (기존 코드에 한 줄씩, `typeof` 보호):

| 이벤트 | 발생 위치 |
|---|---|
| `damage` | `applyDamage` 챔피언/허수아비 경로, `applyDamageToMinion`, `applyDamageToTurret/Inhibitor/Nexus` |
| `death` | `_die`, `killMinion` (처치자 ID 포함, 챔피언은 `takeDamage`가 마지막 공격자를 기록) |
| `respawn` | `_respawn` |
| `structureDestroyed` | `destroyTurret/Inhibitor/Nexus` |
| `gameOver` | `checkWinCondition` |
| `itemPurchased` | `buyItem`, 조합(`buildOrBuyItem`), 신발 |
| `itemSold` | `sellItem`, `sellBoots` |
| `itemUsed` | LocalSession `useItem` |
| `commandResult` | LocalSession: 명령마다 승인/거부와 이유 |
| `gameReset` | `resetGame` |

- **역할 구분:** 이벤트는 연출과 기록용이다. 상태의 기준은 게임 객체와 스냅샷이다. 이벤트로 상태를 확정하는 코드는 없다.

### 3.3 `game_snapshot.js` — 상태 스냅샷
- `buildGameSnapshot()`는 아래 구조를 돌려준다.

```text
{ v, tick, simTimeSec, gameTimeSec, gameEnded,
  entities: [{ id, kind, team, pos:{x,y,z}, yaw, hp, maxHp, shield, alive, untargetable,
               statusEffects:[{id,type,remainingMs,value,sourceId}],
               // 챔피언만:
               championId, state, level, mp, maxMp, cooldowns{Q,W,E,R}, respawnInMs, targetId,
               stats{attackDamage,abilityPower,armor,magicResist,attackSpeed,moveSpeed,critChance} }],
  players: [{ entityId, gold, items[], boots, trinket, skillLevels, skillPoints, exp, summoners{D,F}, score }] }
```

- **직렬화:** 순수 데이터만 담는다. Vector3, 클래스 인스턴스, Infinity는 넣지 않는다. 무한 체력은 `null`이 된다. JSON으로 왕복해도 같다(단위 테스트와 브라우저 점검으로 확인).
- **읽기 전용:** 상태를 바꾸지 않고, 별도의 상태 저장소도 만들지 않는다. 호출할 때마다 기존 객체에서 새로 만든다.
- **좌표:** 엔진 월드 단위다. LoL 거리 단위가 필요하면 `worldDistanceToLol`로 바꾼다.

### 3.4 `game_commands.js` — 입력 명령과 LocalSession
- **입력 흐름:** 입력은 화면 좌표와 카메라로 "무엇을 하려는가"만 정한다. 클릭한 지면 좌표와 커서 아래 유닛의 ID가 여기서 정해진다. 그다음 `submitPlayerCommand(cmd)`에 넘긴다.
- **명령 종류:** `move`, `stop`, `attack`, `clearTarget`, `attackMove`, `cast`, `levelUpSkill`, `recall`, `summoner`, `useItem`, `placeWard`, `buyItem`, `sellItem`. 형식은 파일 머리말에 있다.
- **명령 내용:** 행위, 대상 ID, 목표 좌표만 담는다. 체력, 피해, 골드, 승패 같은 값은 넣지 않고, 들어 있어도 읽지 않는다(테스트로 확인).
- **검사 분담:**
  - `validateCommand`가 형식(종류, 좌표, 칸, 아이템 ID)을 검사한다.
  - 규칙 검사는 지금처럼 기존 함수가 한다.
- **LocalSession** (`gameSession`, `window.gameSession`):
  - `submit(cmd)` → `{ok, reason, outcome}`
  - `advance(dt)`: 메인 루프가 일시정지가 아닐 때 부르며, `tick`과 `simTimeSec`를 진행한다.
  - `snapshot()`, `events(sinceSeq)`, `reset()`
- **연결한 입력:**
  - 우클릭, 좌클릭 대상 선택과 해제, 공격 이동
  - Q/W/E/R. 조준, 즉시 시전, 바루스 충전 시작과 발사, 창 포커스 잃을 때 발사를 모두 포함한다.
  - D/F와 주문 칸 클릭
  - B와 귀환 버튼, S
  - 아이템 칸 숫자 키와 HUD 칸 클릭, 4 키와 장신구 칸 클릭
  - Ctrl+QWER와 레벨 업 버튼
  - 상점 구매와 판매, 미니맵 우클릭
- **입력에서 세션으로 옮긴 규칙:** 마스터 이 Q 도중 우클릭은 재등장 방향만 정한다. 이 규칙을 `move` 명령 처리로 옮겼다.
- **명령 경로를 쓰도록 바꾼 함수:**
  - 대상 지정 소환사 주문(탈진, 점화): 화면 좌표 대신 명령의 대상 ID를 쓴다(`castSummonerSpell(…, opts.target)`).
  - 제어 와드와 구원: 명령의 `point`를 먼저 쓰고, 없으면 예전처럼 커서 좌표를 쓴다.

**RemoteSession은 만들지 않았다.** 같은 인터페이스(`submit`, `advance`, `snapshot`, `events`, `reset`)를 갖추면 된다.
- `submit`은 서버로 보낸다.
- `snapshot`과 `events`는 서버에서 받은 것을 돌려준다.

### 3.5 명령 경로를 거치지 않는 것 [확인] (연습·디버그 전용으로 남겨 둠)
- 테스트 버튼(`testAbility`, 무료 시전), 골드 추가, 웨이브 소환, 레벨 업 버튼(`controller.levelUp()`)
- 허수아비·아군·부쉬·적 와드 설치 모드
- 상점 되돌리기: 골드, 아이템, 체력을 직접 덮어쓴다. 온라인에서는 서버 규칙으로 다시 만들거나 끈다.
- 바루스 Q 충전 중 매 프레임 커서 방향 따라가기(`varus.js`의 `lastGroundPoint`): 온라인에서는 "조준 갱신" 명령 흐름이 필요하다.

---

## 4. 남은 Three.js·전역 상태 의존 [확인]
- **위치와 방향:** `root.position`, `mesh.position`, `quaternion`에 산다. 스냅샷은 이것을 읽어서 옮길 뿐이다.
- **스킬과 피해 코드의 연출 호출:** VFX, 애니메이션, DOM, `showSkillToast`가 그대로 남아 있다.
- **전역 `controller` 가정:** 2절 1번.
- **시간 처리:** 1.6절. 이번 단계에서는 바꾸지 않았다.
- **객체 참조 키(Map/owner):** 스냅샷과 이벤트에서만 ID로 바꿔 내보낸다.
- **명령의 "누가 보냈는가":** LocalSession은 늘 전역 `controller`로 본다.

---

## 5. 회귀 검증 (93차에 실제로 돌린 것)
- **단위 테스트:** `node tests/run_all.js`. 새 `tests/session_layer_test.js`를 포함한 전체가 통과했다.
- **브라우저 점검 `tools/e2e_glb/qa_session_check.js`:** 실제 마우스와 키 입력으로 확인했다.
  - 이동, S, B, 공격, Q, 구매가 명령(`commandResult ok`)으로 처리되고 게임이 예전처럼 반응한다.
  - 공격 시 `damage` 이벤트, 구매 시 `itemPurchased` 이벤트가 남는다.
  - 스냅샷은 JSON으로 왕복해도 같고, ID는 겹치지 않고 안정적이다.
  - 일시정지 중에는 틱이 멈추고, 풀면 다시 간다.
  - 다시 시작을 3번 해도 구조물(10, 2, 2개)·허수아비(3)·미니언 수가 그대로였다. 장면의 객체 종류도 늘지 않았고, `gameReset` 이벤트는 1·2·3번 쌓였다.
- **기존 브라우저 점검 20개:** 변경 전 커밋(별도 작업 트리)과 변경 후를 같은 조건으로 돌려 비교했다(README 93차에 결과).

---

## 6. 시간 처리 제안 [제안] (이번에 적용하지 않음)

### 목표
- 시뮬레이션 시간(`simTimeMs`)을 하나로 정한다.
- 렌더링 시간과 분리한다.
- 서버는 고정 틱(예: 30Hz)으로 계산한다.

### 단계별 이행
1. **(완료)** `gameSession.advance(dt)`가 틱과 시뮬레이션 시간을 센다. 아직 게임 규칙은 이 값을 읽지 않는다.
2. **`simNowMs()` 도입:** `gameSession.simTimeSec*1000`(+시작 기준)을 돌려주는 함수를 만든다. 게임 규칙의 `performance.now()`를 파일 단위로 하나씩 바꾼다.
   - 순서: 상태 효과(01_status_effect_system.js) → 평타 타이머 → 아이템 → 챔피언 파일
   - VFX, HUD, 스킬 조준 같은 표현용 `performance.now()`는 그대로 둔다.
   - 바꿀 때마다 일시정지 테스트와 해당 챔피언 점검을 돌린다.
   - 효과: 이 단계에서 일시정지 중 버프와 군중 제어가 흘러가 버리는 문제가 저절로 고쳐진다.
3. **`_champTimeout`을 틱 타이머 큐로:** 시뮬레이션 시간 기준 큐로 바꾸고 매 틱 정해진 지점에서 비운다.
   - `_actionTimers`, `_championTimers`, `_pendingTimeouts`는 이미 취소 묶음 역할을 하므로 그대로 옮긴다.
   - 직접 `setTimeout` 약 25곳은 하나씩 옮긴다. 시각 효과 정리용은 그대로 둔다.
4. **고정 틱 + 누산기:**
   - `animate`에서 `acc += dt; while (acc >= STEP) { simStep(STEP); acc -= STEP; }`로 시뮬레이션을 돌리고, 렌더링은 보간한다.
   - 0.05초 상한은 렌더링 쪽에만 두고, 시뮬레이션은 누산기로 따라잡는다(한 번에 따라잡을 틱 수에 상한을 둔다).
5. **애니메이션 기반 판정 시점을 데이터로:** 클립 길이에 의존하는 판정을 `skill_timing_database` 값으로 옮긴다.
   - 서버는 데이터만 쓰고, 클라이언트는 같은 값에 맞춰 클립 재생 속도를 조절한다.

### 위험
- **콤보 타이밍:** 시전 시간과 타이머 해상도가 틱(33ms) 단위로 바뀐다. 예: 야스오 E-Q 판정 창, 레넥톤 W 직후 잠금.
- **dt 기반과 실제 시계 기반이 섞인 코드:** 지속 피해 따라잡기 루프와 평타 타이머 되감기의 여유값(-5/-15ms)은 따로 점검해야 한다.
- **챔피언 교체와 초기화:** epoch 보호를 큐에도 유지해야 한다.

---

## 7. 온라인 1:1 전에 해결할 과제 (권장 순서) [제안]
1. **공용 함수에 "관점·공격자" 인자 추가:** `getAllEnemyUnits(viewer)`, 보상, 막타, `fromPlayer`. 두 번째 챔피언을 로컬에서 띄워 보는 것부터 한다(AI나 두 번째 LocalSession 입력).
2. **챔피언 처치 보상 연결:** `awardChampionKillExperience`, `recordChampionTakedown`, 골드.
3. **시뮬레이션 시계 이행:** 6절 2~4단계.
4. **연출 호출을 이벤트로:** 피해와 스킬 코드의 `vfx.spawn`, 애니메이션, DOM 호출을 `emitGameEvent('vfx'…)` 같은 이벤트로 바꾼다. 서버에서는 아무것도 하지 않는 구현으로 갈아 끼운다.
5. **헤드리스 시뮬레이션:** 위치를 Object3D 대신 데이터로 갖는 얇은 래퍼를 만들고, node에서 한 판을 돌려 본다. 지금의 vm 테스트 방식을 넓힌다.
6. **RemoteSession과 전송 계층 선택:** WebSocket 등은 이 단계에서 정한다. 그다음 스냅샷 델타, 입력 지연·예측·보정을 다룬다.
