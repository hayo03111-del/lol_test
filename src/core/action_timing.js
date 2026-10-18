/* ============================================================
   0-B. ACTION TIMING DERIVATION
   RECOVERY 기본값을 비례 계산한다("fireTime = duration * ratio").
   Idle/Move는 반복 재생이라 타이밍이 필요 없으므로 대상이 아니다.
   ============================================================ */
function deriveActionTiming(clip, { fireRatio = 0.4, minStartup = 0.08, minRecovery = 0.12 } = {}) {
  if (!clip) return { startup: 0.15, recovery: 0.3, duration: 0.45 };
  const duration = Math.max(0.15, clip.duration);
  const startup = Math.max(minStartup, duration * fireRatio);
  const recovery = Math.max(minRecovery, duration - startup);
  return { startup, recovery, duration };
}

// 추가 수정사항 16: 모든 액션은 movementLock/spellLock 대신 동일한
// { clips, startup, recovery, cancelable(=cancelToMove), cancelToSpell }
// 데이터 구조로 행동 가능 여부가 결정된다 - 챔피언마다 로직을 새로
// 짜는 게 아니라 이 데이터 테이블만 바뀐다.
function buildActionData(resolver, abilityResolver) {
  const data = {};

  const attackNames = resolver.namesFor('attack');
  let attackVariants = attackNames.length ? attackNames : resolver.namesFor('idle');
  if (abilityResolver.championId === 'yasuo') { attackVariants = ['Attack1','Attack2','Attack3','Attack4'].filter(n => resolver.clipByName(n)); }
  // 버그 수정("평타 모션이 한 개만 나온다"): 요네도 GLB에 Attack1~Attack4가
  // 실제로 존재하지만(야스오와 완전히 동일한 명명 규칙), 범용 "attack" 역할
  // 자동 채점(namesFor('attack'))은 이름에 "attack"이 들어가는 클립이면
  // 전부(Attack1_ToIdle, Yone_Attacks_Fast01~04.anm, Yone_Attack03_toIdle01.anm
  // 등 20개 가까이) 같은 점수로 한데 묶어버린다. 이 목록은 GLB 안의 원래
  // 등장 순서로 정렬되는데, 요네 GLB에서는 하필 "Attack2"가 "Attack1"보다
  // 먼저 나와서 attackVariants[0]이 Attack1이 아니라 Attack2가 되고, 게다가
  // ATTACK_SEQUENCE_OVERRIDES에 등록되지 않았을 때 기본값이 3칸(attack1~3)
  // 뿐이라 Attack4는 순환에서 아예 빠진다 - 그 결과가 "모션이 한 개만
  // 반복되는 것처럼 보이는" 증상이었다. 야스오와 동일하게 정확한 4개
  // 클립명만 명시적으로 골라 쓴다.
  if (abilityResolver.championId === 'yone') {
    attackVariants = ['Attack1','Attack2','Attack3','Attack4'].filter(n => resolver.clipByName(n));
    // 46차: 자동 채점이 이동/대기 목록에 전환 클립(…toWalk, …toRun, …toIdle 등 20여 개)까지 넣어서, 전환 클립이 한 번
    // 재생되면 이동 루프가 "이미 이동 클립 재생 중"으로 보고 끝난 전환 클립(마지막 프레임 고정)을 계속 보여 줬다
    // (Q 쓰고 이동하면 Yone_Spell1A_toWalk01이 이동 내내 유지). 실제 반복 클립만 쓴다 - 전환 클립은 각 스킬이 1회성으로 재생.
    const mv = ['Run_Base', 'Yone_Run01.anm'].filter((n) => resolver.clipByName(n));
    if (mv.length) data.move = { clips: mv };
    if (resolver.clipByName('Idle1_Base')) data.idle = { clips: ['Idle1_Base'] };
  }
  // 리 신: 사용자가 지정한 Attack1~Attack4를 순서대로 반복한다.
  if (abilityResolver.championId === 'nilah') {
    const ndb = championAbilityDatabase.nilah;
    (ndb.attackAnimationNames || []).forEach((name, i) => { const key = `attack${i+1}`; if (resolver.clipByName(name) && data[key]) data[key].clips=[name]; });
    if (resolver.clipByName(ndb.idleAnimationNames?.[0])) data.idle={clips:[ndb.idleAnimationNames[0]]};
    if (resolver.clipByName(ndb.moveAnimationNames?.[0])) data.move={clips:[ndb.moveAnimationNames[0]]};
  }
  // 노틸러스(실제 노틸러스.glb 확인): 평타 클립은 Attack1~3이고 Attack4는 W(타이탄의
  // 분노) 전용 오버라이드 클립이다. 자동 채점은 GLB 순서대로 Attack4를 1번 평타로
  // 골랐다 - DB에 적힌 평타 3종만 쓴다.
  if (abilityResolver.championId === 'nautilus') {
    const names = (championAbilityDatabase.nautilus.attackAnimationNames || []).filter((n) => resolver.clipByName(n));
    if (names.length) attackVariants = names;
  }
  if (abilityResolver.championId === 'leesin') {
    const leeAttackNames = championAbilityDatabase.leesin.attackAnimationNames || [];
    const existing = leeAttackNames.filter((n) => resolver.clipByName(n));
    if (existing.length) attackVariants = existing;
  }
  // 버그 수정("이즈리얼 평타 모션이 이상하다" - 대조 결과): 실제
  // ezreal.glb에는 champion_ability_database.js가 이미 확인해둔 진짜 평타
  // 클립(Attack1a/Attack2a) 외에도 "Ezreal_Attack4.anm"/"ezreal_Attack2.anm"
  // 같은 이름이 다른 중복/여분 클립이 더 들어있다. 범용 "attack" 역할
  // 자동 채점은 이름에 "attack숫자"가 들어가면 전부 동점(100점)으로 묶는데,
  // 이 챔피언은 ATTACK_SEQUENCE_OVERRIDES에도 등록돼 있지 않아 기본값인
  // attack1~3(3칸)이 채워지면서, 실제로는 존재하지 않아야 할 "3번째 평타"
  // 자리에 저 중복 클립("Ezreal_Attack4.anm")이 그대로 들어가 버렸다(요네와
  // 동일한 유형의 버그 - 위 요네 주석 참고). 이미 검증된 등록값
  // (attackAnimationNames: ['Attack1a','Attack2a'])을 그대로 강제해서
  // 진짜 2종류만 번갈아 나가게 한다(ATTACK_SEQUENCE_OVERRIDES 쪽 등록은
  // attack_sequence.js에서 함께 처리).
  if (abilityResolver.championId === 'ezreal') {
    const ezAttackNames = championAbilityDatabase.ezreal.attackAnimationNames || [];
    const existing = ezAttackNames.filter((n) => resolver.clipByName(n));
    if (existing.length) attackVariants = existing;
  }
  // 버그 수정("평타모션도 살짝 이상함" - 실제 아리.glb로 대조): 요네/이즈리얼과
  // 완전히 동일한 유형의 버그다. 실제 아리.glb에는 "Attack1"/"Attack2" 외에도
  // "Attack1_ToIdle"/"Attack2_ToIdle"/"Attack1_Torun"/"Attack2_Torun"(공격 후
  // 정지/이동으로 넘어가는 전환용 스텁 클립)까지 이름에 "attack숫자"가 들어가
  // 범용 "attack" 역할 자동 채점에서 전부 동점(100점)으로 묶인다. GLB 안의
  // 등장 순서로 정렬되면 Attack1_ToIdle(index 14)이 Attack1/Attack2보다도
  // 먼저 나오는 경우까지 있어, 실제 평타 순환에 "전환 포즈"가 완전한 스윙인
  // 것처럼 섞여 들어가고 있었다. champion_ability_database.js에 이미 등록된
  // 진짜 평타 2종(Attack1/Attack2)만 번갈아 나가도록 고정한다.
  if (abilityResolver.championId === 'ahri') {
    const ahriAttackNames = championAbilityDatabase.ahri.attackAnimationNames || [];
    const existing = ahriAttackNames.filter((n) => resolver.clipByName(n));
    if (existing.length) attackVariants = existing;
  }
  // 바루스 평타는 실제로 Attack1/Attack2 2종류뿐이다(bin의 basicAttack/
  // extraAttacks가 각각 50% 확률로 서로를 대체 - VarusBasicAttack/
  // VarusBasicAttack2). 등록하지 않으면 기본 3칸(attack1~3) 채우기 로직이
  // 존재하지 않는 "3번째 평타" 자리에 중복 클립을 넣어 같은 모션이 두 번
  // 연속 재생되는, 다른 챔피언들과 동일한 유형의 버그가 생긴다.
  if (abilityResolver.championId === 'varus') {
    const vAttackNames = championAbilityDatabase.varus.attackAnimationNames || [];
    const existing = vAttackNames.filter((n) => resolver.clipByName(n));
    if (existing.length) attackVariants = existing;
  }
  // 애쉬 평타도 실제로는 Attack1/Attack2 2종류뿐이다(실제 애쉬.glb 24클립
  // 확인) - 등록하지 않으면 요네/이즈리얼/아리/바루스와 동일한 유형의
  // "존재하지 않는 3번째 평타" 버그가 생긴다.
  if (abilityResolver.championId === 'ashe') {
    const asheAttackNames = championAbilityDatabase.ashe.attackAnimationNames || [];
    const existing = asheAttackNames.filter((n) => resolver.clipByName(n));
    if (existing.length) attackVariants = existing;
  }
  // 버그 수정(실제 GLB로 직접 확인함 - 1차 수정에서 실수했던 부분을
  // duration까지 확인하고 정정함): 범용 "attack" 역할 매칭은 이름에
  // "attack1"/"attack2"가 들어간 클립을 전부 같은 점수(100점)로 채점하고
  // 동점자는 GLB 파일 안의 원래 등장 순서로 정렬한다. 실제 세트 GLB에서는
  // "Attack2_Hit"가 "Attack1_Hit"보다 배열상 먼저 나와서, attack1(왼손)
  // 자리에 "Attack2_Hit"가, attack2(오른손) 자리에 "Attack1_Hit"가 뽑히고
  // 있었다 - 이건 진짜 버그(좌우가 뒤바뀜)다.
  // 단, 처음엔 "_Hit는 타격 순간만 담은 짧은 클립일 것"이라고 이름만 보고
  // 추측해서 Attack1_Start/Attack2_Start로 바꿨는데, 실제 duration을
  // 확인해보니 그 추측이 틀렸다: Attack1_Start/Attack2_Start는 0.3초밖에
  // 안 되는 아주 짧은 전환용 스텁이고, 오히려 Attack1_Hit/Attack2_Hit가
  // 2.3초 이상으로 훨씬 길어서 (이 시스템은 timeScale로 클립을 실제
  // 공격 속도에 맞춰 압축하므로) 전체 스윙(윈드업~타격~회수)을 담은
  // 진짜 애니메이션일 가능성이 훨씬 높다. 그래서 클립 자체는 원래
  // 선택되던 Hit 계열을 그대로 쓰고, 손 순서(좌우)만 정확히 고정한다.
  // 버그 수정(명시적 지시): 세트 기본 평타는 왼손=Attack2_hit,
  // 오른손=Spell1_B다(요청 문서 2/6/10/19/20절 전부 일관되게 명시 -
  // "왼손에서 Spell1_A 금지", "오른손에서 Attack2_hit 금지"). GLB 클립
  // 이름의 숫자(Attack1/Attack2)가 실제 왼손/오른손과 반드시 일치하는
  // 건 아니므로, 이름 패턴으로 추측하지 않고 사용자가 확인해준 매핑을
  // 그대로 고정한다.
  const leftClip = abilityResolver.championId === 'sett' ? resolver.clipByName('Attack2_Hit') : resolver.clipByName('Attack1_Hit');
  const leftClipName = abilityResolver.championId === 'sett' ? 'Attack2_Hit' : 'Attack1_Hit';
  const rightClipQMatch = abilityResolver.championId === 'sett' ? resolver.clipByName('Spell1_B') : null;
  const rightClip = rightClipQMatch || resolver.clipByName('Attack2_Hit');
  if (leftClip && rightClip) {
    const rightClipName = rightClipQMatch ? 'Spell1_B' : 'Attack2_Hit';
    const rest = attackVariants.filter((n) => n !== leftClipName && n !== rightClipName);
    attackVariants = [leftClipName, rightClipName, ...rest];
    console.log(`[ANIMATION] 세트 왼손/오른손 매핑 적용: ${leftClipName}(왼손) / ${rightClipName}(오른손)`);
  }
  const attackKeys = getAttackSequenceNames(abilityResolver.championId);
  attackKeys.forEach((key, i) => {
    const primary = attackVariants[i] || attackVariants[0];
    const clip = resolver.clipByName(primary);
    const timing = deriveActionTiming(clip, { fireRatio: 0.45 });
    // 요청("평타는 왼손모션 딱 하나, 오른손(=Q 오른손) 딱 하나로 해줘"):
    // 세트는 손마다 정확히 클립 1개만 쓴다 - 폴백 후보 목록을 붙이지
    // 않는다(다른 애니메이션으로 몰래 대체될 여지를 없앤다). 다른
    // 챔피언은 기존처럼 폴백 후보 목록을 그대로 유지한다(영향 없음).
    const clipsForKey = (abilityResolver.championId === 'sett' && (key === 'attack1' || key === 'attack2'))
      ? [primary]
      : [primary, ...attackVariants.filter(n => n !== primary)];
    data[key] = { clips: clipsForKey, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: true, dmg: 10 };
  });
  // 요청("세트 왼손/오른손 실제 모션 이름을 찾아줘"): 최종적으로 attack1/2
  // 슬롯에 실제로 배정된 클립명을 콘솔에 남긴다.
  if (abilityResolver.championId === 'sett') {
    console.log('[ANIMATION] 세트 평타 클립 발견 개수:', attackVariants.length, attackVariants);
    console.log(`[ANIMATION] 세트 왼손(attack1) 실제 클립명 = "${attackVariants[0] || '(없음 - idle로 폴백됨)'}"`);
    console.log(`[ANIMATION] 세트 오른손(attack2) 실제 클립명 = "${attackVariants[1] || '(없음 - attack1과 동일 클립 재사용)'}"`);
  }
  {
    const critNames = resolver.namesFor('crit').length ? resolver.namesFor('crit') : attackVariants;
    const clip = resolver.clipByName(critNames[0]);
    const timing = deriveActionTiming(clip, { fireRatio: 0.5 });
    data.crit = { clips: critNames, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: true, dmg: 24 };
  }

  // 패시브(2연속 공격) 4타 전용 클립 - 'passive' 역할이 비어 있으면(대부분의
  // 챔피언) clips:[]로 남고, _masteryiArmPassiveAttack()이 이를 확인해
  // 조용히 기존 attack1/2 순환으로 폴백한다(요청 문서 2 섹션 4/17 원칙:
  // "없으면 인덱스로 추측하지 말고 그냥 이름 검색 결과를 그대로 믿는다").
  {
    const passiveNames = resolver.namesFor('passive');
    const clip = passiveNames.length ? resolver.clipByName(passiveNames[0]) : null;
    const timing = deriveActionTiming(clip, { fireRatio: 0.45 });
    data.passive = { clips: passiveNames, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: true, dmg: 10 };
  }

  // Q/W/E/R은 이제 순수 점수 기반 resolver가 아니라 ChampionAbilityResolver
  // (챔피언 DB 1~2순위 -> 정확 패턴 3순위 -> 점수 추론 4~5순위 -> 수동 6순위)의
  // 결과를 사용한다. 방향별 변형도 abilityResolver를 통해서만 조회한다.
  const mkDirectional = (dirKey, dmg) => {
    // Mordekaiser Q는 방향별 본체 모션이 없다. GLB에 존재하는
    // Spell1_Torun_* 계열은 Q 본체가 아니라 Q 종료 후 이동 전환(exit) 클립이다.
    // 따라서 Q 시전 자체는 항상 실제 Q 본체인 Spell1만 사용한다.
    if (abilityResolver.championId === 'mordekaiser') {
      const fixedName = 'Spell1';
      const clip = resolver.clipByName(fixedName);
      const timing = deriveActionTiming(clip, { fireRatio: 0.35 });
      return { clips: [fixedName], timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: false, dmg };
    }
    const names = abilityResolver.directionalNamesFor('q', dirKey);
    const clip = resolver.clipByName(names[0]);
    const timing = deriveActionTiming(clip, { fireRatio: 0.35 });
    return { clips: names, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: false, dmg };
  };
  data.qLeft = mkDirectional('left', 18);
  data.qRight = mkDirectional('right', 18);
  data.qForward = mkDirectional('forward', 18);
  data.qBack = mkDirectional('back', 18);

  {
    const names = abilityResolver.namesFor('w');
    const clip = resolver.clipByName(names[0]);
    const timing = deriveActionTiming(clip, { fireRatio: 0.5 });
    data.w = { clips: names, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: false, buffDuration: 5.0 };
  }

  {
    const eNames = abilityResolver.namesFor('e');
    const clip1 = resolver.clipByName(eNames[0]);
    const t1 = deriveActionTiming(clip1, { fireRatio: 0.4 });
    data.e1 = { clips: eNames, timeScale: 1.0, ...t1, cancelable: true, cancelToMove: true, cancelToSpell: false, dmg: 14 };
    if (eNames.length > 1) {
      const clip2 = resolver.clipByName(eNames[1]);
      const t2 = deriveActionTiming(clip2, { fireRatio: 0.4 });
      data.e2 = { clips: [eNames[1], ...eNames.filter(n => n !== eNames[1])], timeScale: 1.0, ...t2, cancelable: true, cancelToMove: true, cancelToSpell: false, dmg: 20 };
    } else {
      data.e2 = { ...data.e1, dmg: 20 };
    }
  }

  // R: windup->channel->cast 3단계는 'channel' 역할(범용 애니메이션 스코어러
  // 담당, 챔피언 DB와 무관)과 abilityResolver가 고른 'r' 클립이 모두 있을 때만
  // 사용한다. 못 찾으면 R도 Q/E와 동일하게 단일 STARTUP->FIRE->RECOVERY로 축소.
  const channelNames = resolver.namesFor('channel');
  const rNames = abilityResolver.namesFor('r');
  data.hasRChannel = channelNames.length > 0 && rNames.length > 0;
  if (data.hasRChannel) {
    const windupClip = resolver.clipByName(channelNames[0]);
    const wd = windupClip ? Math.max(0.2, windupClip.duration * 0.4) : 0.6;
    const cd = windupClip ? Math.max(0.4, windupClip.duration * 0.6) : 1.3;
    data.rWindup = { clips: channelNames, timeScale: 1.0, duration: wd };
    data.rChannel = { clips: channelNames, timeScale: 1.0, duration: cd };
  }
  {
    const clip = resolver.clipByName(rNames[0]);
    const timing = deriveActionTiming(clip, { fireRatio: 0.25 });
    data.rCast = { clips: rNames.length ? rNames : resolver.namesFor('idle'), timeScale: 1.0, ...timing, cancelable: false, cancelToMove: false, cancelToSpell: false, dmg: 60 };
  }

  if (abilityResolver.championId === 'leesin') {
    const leeDb = championAbilityDatabase.leesin;
    const idleClip = (leeDb.idleAnimationNames || []).find((n) => resolver.clipByName(n));
    if (idleClip) data.idle = { clips: [idleClip] };
    // Attack1~4는 위의 attackKeys에 의해 순서대로 생성되며, 여기서 실제 GLB
    // 클립명이 잘못 추론되지 않도록 명시된 이름을 다시 고정한다.
    (leeDb.attackAnimationNames || []).forEach((name, i) => {
      const key = `attack${i + 1}`;
      if (resolver.clipByName(name) && data[key]) data[key].clips = [name];
    });
  }

  // 모션 구체화(닐라): 이 GLB에는 실제로 크리티컬 전용 클립(Crita/Critb/
  // Critc)과 Q 강화 상태(_nilahQActive) 전용 평타 클립(Attack1_Emp_A/B/C,
  // Attack2_Emp_A/B/C)이 전부 존재하는데, 지금까지는 둘 다 전혀 쓰이지
  // 않고 있었다(크리티컬은 범용 점수 매칭에 맡겨져 있었고, Q 강화 중에도
  // 그냥 평소 Attack1a/Attack2a만 재생됨). 실제로 존재하는 클립만
  // 명시적으로 고정한다 - 없는 이름을 지어내지 않는다.
  if (abilityResolver.championId === 'nilah') {
    const critClips = ['Crita', 'Critb', 'Critc'].filter(n => resolver.clipByName(n));
    if (critClips.length) {
      const clip = resolver.clipByName(critClips[0]);
      const timing = deriveActionTiming(clip, { fireRatio: 0.5 });
      data.crit = { clips: critClips, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: true, dmg: 24 };
    }
    const emp1Clips = ['Attack1_Emp_A', 'Attack1_Emp_B', 'Attack1_Emp_C'].filter(n => resolver.clipByName(n));
    const emp2Clips = ['Attack2_Emp_A', 'Attack2_Emp_B', 'Attack2_Emp_C'].filter(n => resolver.clipByName(n));
    if (emp1Clips.length) {
      const timing = deriveActionTiming(resolver.clipByName(emp1Clips[0]), { fireRatio: 0.45 });
      data.attack1Emp = { clips: emp1Clips, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: true, dmg: 10 };
    }
    if (emp2Clips.length) {
      const timing = deriveActionTiming(resolver.clipByName(emp2Clips[0]), { fireRatio: 0.45 });
      data.attack2Emp = { clips: emp2Clips, timeScale: 1.0, ...timing, cancelable: true, cancelToMove: true, cancelToSpell: true, dmg: 10 };
    }
  }

  // 버그 수정("이즈리얼 이동 모션이 이상하다"): 실제 ezreal.glb에는
  // Idle_Base/Run_Normal이라는 정확한 클립이 있고 champion_ability_database.js
  // 에도 이미 그렇게 등록돼 있는데, 지금까지 idle/move 클립은 여기서 이
  // 등록을 전혀 참조하지 않고 범용 점수 매칭(resolver.namesFor)에만
  // 맡겨져 있었다. 문제는 이 GLB에 "run"이 들어간 클립이 8개나 더 있다는
  // 것(Run_To_Idle/Run_Haste/Spell1_To_Run/Spell2_To_Run/Spell4_To_Run/
  // Spell3_Exit_Run/Spell3_Exit_NoTarget_Run) - 전부 밑줄로 이어진 이름이라
  // \brun\b(단어 경계) 패턴은 매칭되지 않고(밑줄도 \w라 경계가 안 생김),
  // 대신 훨씬 낮은 점수의 느슨한 /run/i 패턴(65점)에서 전부 동점으로
  // 걸린다. 동점일 때 정렬은 원래 GLB 클립 순서를 그대로 유지하는데,
  // 하필 "Run_To_Idle"(달리기->정지 전환용 스텁 클립)이 "Run_Normal"보다
  // GLB 안에서 더 먼저 등장해서 그게 그대로 "이동 애니메이션"으로
  // 뽑히고 있었다 - 전환 클립을 반복 재생하니 이동 모션이 뚝뚝 끊기거나
  // 이상하게 보이는 게 당연했다. 나머지 챔피언들(닐라 등)과 동일한 패턴으로
  // championAbilityDatabase에 이미 검증된 이름을 그대로 고정한다.
  if (abilityResolver.championId === 'ezreal') {
    const edb = championAbilityDatabase.ezreal;
    if (resolver.clipByName(edb.idleAnimationNames?.[0])) data.idle = { clips: [edb.idleAnimationNames[0]] };
    if (resolver.clipByName(edb.moveAnimationNames?.[0])) data.move = { clips: [edb.moveAnimationNames[0]] };
  }

  // 버그 수정("정지 모션을 바꿔야함" - 실제 아리.glb로 대조): 범용 "idle"
  // 역할 자동 채점은 이름에 "idle"이 들어간 클립을 전부 동점(95점)으로
  // 묶는데, 실제 아리.glb에는 진짜 유휴 루프(Idle1)뿐 아니라
  // "Attack1_ToIdle"/"Attack2_ToIdle"(공격 후 정지로 돌아오는 전환용 원샷
  // 클립)/"Idle_In"(달리다 멈출 때 전환용)/"Idle_Var2"/"Idle_var3"(감정표현용
  // 변형)까지 전부 이름에 "idle"이 들어가 동점으로 묶인다. GLB 안의 등장
  // 순서로 정렬되면 "Attack1_ToIdle"(index 14)이 진짜 유휴 루프인
  // "Idle1"(index 51)보다 훨씬 먼저 나와서, 서 있을 때 반복 재생되는
  // 애니메이션이 "공격 후 정지 전환 포즈"가 되어버리는 게 원인이었다.
  // champion_ability_database.js에 이미 등록된 진짜 유휴 루프(Idle1)로 고정.
  if (abilityResolver.championId === 'ahri') {
    const adb = championAbilityDatabase.ahri;
    if (resolver.clipByName(adb.idleAnimationNames?.[0])) data.idle = { clips: [adb.idleAnimationNames[0]] };
    if (resolver.clipByName(adb.moveAnimationNames?.[0])) data.move = { clips: [adb.moveAnimationNames[0]] };
  }

  // 버그 수정(실제 바루스.glb로 확인): 범용 "idle" 역할 자동 채점은
  // 이름에 "idle"이 들어간 클립을 전부 동점으로 묶는데, 이 GLB에는 진짜
  // 유휴 루프(varus_idle1.anm) 외에도 감정표현용 변형(varus_idle2~4.anm)
  // 까지 전부 걸린다 - 아리/이즈리얼과 동일한 유형의 버그를 예방하기 위해
  // 미리 idle1로 고정한다. 이동 클립도 "Run"/"Run2" 2종류가 있어(용도
  // 구분 자료 없음) 기본 이동 루프로는 "Run"을 고정한다.
  if (abilityResolver.championId === 'varus') {
    const vdb = championAbilityDatabase.varus;
    if (resolver.clipByName(vdb.idleAnimationNames?.[0])) data.idle = { clips: [vdb.idleAnimationNames[0]] };
    if (resolver.clipByName(vdb.moveAnimationNames?.[0])) data.move = { clips: [vdb.moveAnimationNames[0]] };
  }

  // 애쉬 정지 모션 - 범용 "idle" 역할 자동 채점은 이름에 "idle"이 들어간
  // 클립(Idle1~Idle5)을 전부 동점으로 묶는다. 실제 유휴 루프(Idle1)로
  // 고정한다(Idle2~5는 감정표현 변형으로 추정 - 아리/바루스와 동일한
  // 유형의 잠재 버그를 미리 예방). 이동 클립도 "Run"/"Run2"/"Run3" 3종류가
  // 있어(용도 구분 자료 없음) 기본 이동 루프로 "Run"을 고정한다.
  if (abilityResolver.championId === 'ashe') {
    const adb = championAbilityDatabase.ashe;
    if (resolver.clipByName(adb.idleAnimationNames?.[0])) data.idle = { clips: [adb.idleAnimationNames[0]] };
    if (resolver.clipByName(adb.moveAnimationNames?.[0])) data.move = { clips: [adb.moveAnimationNames[0]] };
  }

  // 야스오 정지 모션은 사용자가 지정한 Idle1_Raw를 고정 사용한다(요청 9:
  // Idle1_IN_Raw는 절대 일반 Idle로 쓰지 않는다).
  // 자동 idle 점수 매칭으로 다른 Idle 클립이 선택되지 않도록 한다.
  if (abilityResolver.championId === 'yasuo' && resolver.clipByName('Idle1_Raw')) {
    data.idle = { clips: ['Idle1_Raw'] };
  } else {
    data.idle = data.idle || { clips: resolver.namesFor('idle') };
  }
  // 버그 수정: 아래 줄이 항상 무조건 data.move를 새로 만들어 덮어써서,
  // 바로 위(이즈리얼)나 파일 위쪽(닐라)에서 이미 정확하게 고정해 둔
  // data.move가 매번 범용 점수 매칭 결과로 도로 바뀌고 있었다. idle과
  // 동일하게 "이미 고정된 값이 있으면 그대로 둔다"로 통일한다.
  data.move = data.move || { clips: resolver.namesFor('move') };
  data.recall = { clips: resolver.namesFor('recall').length ? resolver.namesFor('recall') : resolver.namesFor('idle') };
  data.death = { clips: resolver.namesFor('death').length ? resolver.namesFor('death') : resolver.namesFor('idle') };
  data.respawn = { clips: resolver.namesFor('respawn').length ? resolver.namesFor('respawn') : resolver.namesFor('idle') };

  applySkillTimingDatabase(data, abilityResolver.championId);

  return data;
}

