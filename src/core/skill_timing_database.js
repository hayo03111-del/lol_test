/* ============================================================
   0-A1b. SKILL TIMING DATABASE (실제 PC 리그 오브 레전드 공개 Cast Time)
   ------------------------------------------------------------
   사용자가 제공한 자료(위키 공개 데이터) 그대로 반영한다. Cast Time과
   실제 판정(Event) 시점이 다른 스킬(모데카이저 E: Cast 0.25초, 실제
   효과는 0.5초 후)과, 판정은 끝났지만 추가로 이동/공격이 막히는 스킬
   (세트 E: 0.25초 캐스트 + 추가 0.25초 잠금)까지 구분해서 담는다.
   recovery는 공개 수치가 아니므로 ENGINE_BUFFER(엔진상의 최소 크로스
   페이드 여유일 뿐, "공식 수치"로 취급하지 않음)로만 채운다 - 자료의
   "공개되지 않은 정확한 Recovery 프레임은 임의로 공식 수치처럼 쓰지
   않겠다"는 원칙을 그대로 따른다.
   ============================================================ */
const ENGINE_BUFFER = 0.15; // 공식 데이터 아님 - 애니메이션 크로스페이드용 최소 여유
const SKILL_TIMING_DATABASE = {
  garen: {
    W: { eventTime: 0, recovery: 0, lockMove: false, lockAbility: false }, // Cast Time 없음, 즉시 적용
    R: { eventTime: 0.435, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  darius: {
    W: { eventTime: 0, recovery: 0, lockMove: false, lockAbility: false }, // Cast Time 없음(강화 평타로 위임)
    E: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    R: { eventTime: 0.3667, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  sett: {
    W: { eventTime: 0.75, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    // E: Cast 0.25초(판정) + 공식 데이터에 명시된 추가 0.25초 이동/공격 불가.
    // "판정은 끝났는데 왜 아직 다른 모션으로 못 넘어가는가"의 정확한 예시.
    E: { eventTime: 0.25, recovery: 0.25, lockMove: true, lockAbility: false },
  },
  mordekaiser: {
    // Q: 문서에 "0.5초 시전이 끝나는 시점의 위치에서 발동 → 시작 위치와
    // 최종 피해 위치가 다를 수 있다"고 나와 있지만, 이 뷰어의 액션
    // 시스템은 "캐스트 중 이동 허용"이 아니라 "이동 명령 = 캐스트 전체
    // 취소" 이분법만 지원한다(cancelToMove:true로 두면 Q가 아예 씹혀서
    // 오히려 문서 의도와 더 멀어짐). 그래서 이동은 잠그되, 데미지 판정
    // 시점의 위치 참조 자체는 onFire 콜백이 setTimeout 실행 시점에 실시간
    // this.root.position을 읽으므로 "발동 시점 위치 기준" 요구사항은
    // 이미 정확히 만족한다(캐스트 시작 시점 위치를 스냅샷해두지 않음).
    Q: { eventTime: 0.5, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    W: { eventTime: 0, recovery: 0, lockMove: false, lockAbility: false },
    // E: CAST_THEN_DELAYED_EVENT - Cast Time 0.25초와 별개로 실제 효과는
    // 0.5초 후에 발생(문서: "Cast Time과 실제 Effect Delay를 구분"). 예전엔 이벤트 시점까지 전부 잠갔다.
    // 9차 수정(PC 위키 + 여러 출처: 시전 0.25초, 그 뒤 0.5초에 판정): 시전 0.25초만 잠그고, 실제 효과(0.5초 지연)는 onFire에서 별도 타이머로 처리한다(controller_casting 참고).
    E: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    R: { eventTime: 0.5, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  vex: { 
    // 참고: 벡스 Q/W/E/R은 이제 vex.js 전용 구현이 시전 시간을 직접 처리한다(아래 값은 공용 경로용 기록).
    Q: { eventTime: 0.15, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true }, // PC 위키 0.15(예전 0.25)
    W: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: false, lockAbility: true }, // PC 위키 0.25, 시전 중 이동 가능
    E: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true }, // PC 위키 0.25(예전 1)
  },
  // 요네 R(운명봉인): 공식 Cast Time 0.75초 - 시전이 끝나는 시점에 넉다운/기절
  // 판정이 발생하고, 그 직후(0.05초) 블링크 -> 추가 0.3초 후 돌풍(당김+
  // 에어본)이 순차적으로 이어진다(세부 순차 처리는 yone.js의 onFire 콜백
  // 안에서 setTimeout 체인으로 구현 - 이 표는 "캐스트 자체"의 길이/이동
  // 잠금 여부만 담당). Q/W는 공식 수치가 야스오와 동일한 공속비례 공식이라
  // yone.js 쪽 전용 헬퍼(_yoneQCooldown 등)에서 직접 계산하므로 여기 별도
  // 항목을 두지 않는다(야스오도 이 표에 없음 - 동일한 이유).
  yone: {
    R: { eventTime: 0.75, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  // 바루스 E(화살비)/R(속박의 사슬): bin mCastTime 그대로(둘 다 약 0.242초).
  // R 등록은 부수 효과로 hasRChannel도 false로 고정한다(아래 applyFixed
  // 참고) - 이 GLB에 "Channel"/"Channel_Wndup" 클립이 있어도 실제 바루스
  // R은 윈드업->채널 3단계가 아니라 즉시 발사형이므로 3단계 채널 로직이
  // 적용되면 안 된다.
  varus: {
    E: { eventTime: 0.242, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    R: { eventTime: 0.242, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  // 애쉬 W(일제 사격)/E(매 날리기)/R(마법의 수정화살): 정확한 공식 Cast
  // Time을 확인하지 못해(README 참고) champion_data.js의 castTimeSec
  // 근사값을 그대로 사용한다. R 등록은 부수 효과로 hasRChannel도 false로
  // 고정한다 - 이 GLB에 "Channel"/"Channel_Wndup" 클립이 있어도 실제
  // 애쉬 R은 윈드업->채널 3단계가 아니라 짧은 단일 캐스트형이므로 3단계
  // 채널 로직이 걸리면 안 된다(바루스 R과 동일한 이유).
  // 38차: 람머스 GLB에 Channel/Channel_Wndup 클립이 있지만 R은 채널형이 아닌 도약 - R을 등록해 자동 채널 추정(hasRChannel)을 끈다.
  // 실제 시전은 rammus.js가 직접 처리한다(아래 값은 공용 경로용 기록 - 시전 시간 미확인, 즉시 도약으로 처리).
  rammus: {
    R: { eventTime: 0, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  // 47차: 럭스 GLB에도 Channel 클립이 있지만 R은 1초 시전 뒤 섬광(채널형 아님) - 실제 시전은 lux.js.
  lux: {
    R: { eventTime: 1, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
  },
  ashe: {
    W: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    E: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true },
    R: { eventTime: 0.25, recovery: ENGINE_BUFFER, lockMove: true, lockAbility: true }, // PC 위키 0.25(예전 0.5)
  },
};

// buildActionData()가 만든 애니메이션-길이 기반 기본값 위에, 공식 Cast
// Time 데이터가 있는 슬롯만 정확한 수치로 덮어쓴다. 데이터가 없는
// 챔피언/슬롯은 기존 애니메이션-유도 방식 그대로 유지된다(예: 다리우스
// Q처럼 공식 Cast Time이 "없음"이라고만 나와있고 정확한 Recovery가
// 공개되지 않은 경우 - 임의 수치를 "공식"인 것처럼 넣지 않는다).
function applySkillTimingDatabase(data, championId) {
  const table = championId ? SKILL_TIMING_DATABASE[championId] : null;
  if (!table) return;
  const applyFixed = (key, t) => {
    if (!data[key] || !t) return;
    data[key].startup = t.eventTime;
    data[key].recovery = t.recovery;
    data[key].cancelable = true;
    data[key].cancelToMove = !t.lockMove;
    data[key].cancelToSpell = !t.lockAbility;
  };
  if (table.Q) ['qLeft', 'qRight', 'qForward', 'qBack'].forEach((k) => applyFixed(k, table.Q));
  if (table.W) applyFixed('w', table.W);
  if (table.E) { applyFixed('e1', table.E); applyFixed('e2', table.E); }
  if (table.R) {
    applyFixed('rCast', table.R);
    data.hasRChannel = false; // 공식 단일 Cast Time이 있으므로 windup->channel->cast 3단계 추정 대신 단일 CAST_TO_EVENT로 고정
  }
}

// 챔피언 크기 표(CHAMPION_UNIT_SIZE_LOL·getChampionUnitSize)는 00_global_constants.js에 있다(25차).
// 모델 크기 배율(GLB 원본 크기에 곱함) = 원작 크기(GLB × 100 × skinScale, LoL 단위)를 월드로 바꾼 값.
// 예전엔 챔피언별로 눈대중 배율(가렌 1.37, 마스터 이 1.66, 다리우스 1.10, 세트 1.14, 나머지 1.0)이었다.
function resolveModelScaleMultiplier(championId) {
  return getChampionUnitSize(championId).skinScale * lolRangeToWorld(100);
}

// 파일명/노드명 등에서 이 표를 찾으면 championAbilityDatabase의 키로 정규화한다.
// 한글 챔피언명 별칭도 여기서 함께 처리한다(추가 수정사항 5).
const CHAMPION_ALIASES = {
  yasuo: 'yasuo', '야스오': 'yasuo',
  yone: 'yone', '요네': 'yone',
  'kindred':'kindred', '킨드레드':'kindred', 'lamb':'kindred', 'wolf':'kindred', 'lambandwolf':'kindred',
  'ahri':'ahri', '아리':'ahri',
  'garen':'garen', '가렌':'garen',
  'nautilus':'nautilus', '노틸러스':'nautilus',
  'rammus':'rammus', '람머스':'rammus',
  'lux':'lux', '럭스':'lux',
  'blitzcrank':'blitzcrank', '블리츠크랭크':'blitzcrank',
  'leesin':'leesin', '리신':'leesin',
  'masteryi':'masteryi', '마스터이':'masteryi',
  'mel':'mel', '멜':'mel',
  'vex':'vex', '벡스':'vex',
  'mordekaiser':'mordekaiser', '모데카이저':'mordekaiser',
  'sett':'sett', '세트':'sett',
  'darius':'darius', '다리우스':'darius',
  'renekton':'renekton', '레넥톤':'renekton', 'renektonbase':'renekton',
  'nilah':'nilah', '닐라':'nilah',
  'chogath':'chogath', '초가스':'chogath', 'chogat':'chogath',
  'ezreal':'ezreal', '이즈리얼':'ezreal',
  'varus':'varus', '바루스':'varus',
  'ashe':'ashe', '애쉬':'ashe',
};

function normalizeChampionToken(s) {
  return String(s || '').toLowerCase().replace(/\.(glb|gltf)$/i, '').replace(/\(\d+\)/g, '').replace(/[_\-\s0-9.]+/g, '').trim();
}

// 추가 수정사항 5: 파일명 -> metadata -> node/skeleton 이름 -> animation 이름
// -> (실패 시) 사용자 수동 선택 순서로 챔피언을 식별한다.
function identifyChampionId(fileName, gltf) {
  const candidates = [];
  if (fileName) candidates.push(normalizeChampionToken(fileName));
  const extras = (gltf.asset && gltf.asset.extras) || (gltf.scene && gltf.scene.userData) || {};
  if (extras && extras.champion) candidates.push(normalizeChampionToken(extras.champion));
  if (gltf.scene) {
    gltf.scene.traverse((o) => { if (o.name) candidates.push(normalizeChampionToken(o.name)); });
  }
  (gltf.animations || []).forEach((c) => candidates.push(normalizeChampionToken(c.name)));

  for (const raw of candidates) {
    if (!raw) continue;
    if (CHAMPION_ALIASES[raw]) return CHAMPION_ALIASES[raw];
  }
  for (const raw of candidates) {
    if (!raw) continue;
    for (const [alias, id] of Object.entries(CHAMPION_ALIASES)) {
      if (raw.includes(alias)) return id;
    }
  }
  return null;
}

// 추가 수정사항 8-3순위: "Q, Spell1, Ability1, Skill1, Cast_Q, Q_Cast, Q_Animation"
// 같은 정확한 스킬명 패턴 (챔피언 DB보다는 아래, 점수 기반 추론보다는 위의 우선순위).
function exactSkillNamePatterns(roleLetter) {
  const L = roleLetter.toUpperCase();
  const idx = { Q:1, W:2, E:3, R:4 }[L];
  return [
    new RegExp(`^${L}$`, 'i'),
    new RegExp(`^${L}[_ ]`, 'i'),
    new RegExp(`[_ ]${L}$`, 'i'),
    new RegExp(`^cast[_ ]?${L}$`, 'i'),
    new RegExp(`^${L}[_ ]?cast$`, 'i'),
    new RegExp(`^${L}[_ ]?animation$`, 'i'),
    new RegExp(`^ability[_ ]?${idx}$`, 'i'),
    new RegExp(`^skill[_ ]?${idx}$`, 'i'),
  ];
}

