/* ============================================================
   0-A0X. STATUS EFFECT SYSTEM (공통 - 기획안 8절 CC/버프/디버프/보호막 기준)
   ------------------------------------------------------------
   CharacterController(플레이어)와 dummy enemy 양쪽 모두에 동일하게
   붙을 수 있는 범용 시스템. 유닛 객체에 statusEffects 배열과 shield
   숫자 필드만 있으면 동작한다(없으면 최초 사용 시 자동 생성).
   ============================================================ */
// 요청 14/15: CC 시작/종료를 콘솔에서 확인할 수 있게 한다. 더미/플레이어
// 어느 쪽이든 동일하게 동작(범용 StatusEffect 시스템 그대로 재사용).
// 요청(CC 시스템 확장): KNOCKUP(에어본 - 리 신 R, 초가스 Q 등)과
// SUPPRESSION(제압 - 세트 R 등, 통상적으로 "저지불가/무적 챔피언에게도
// 반드시 적용되는 강한 CC"라는 의미가 STUN과 다름)을 별도 타입으로
// 추가한다. 둘 다 행동 차단 효과는 STUN과 동일하게 취급하되(아래
// isStunned에서 함께 인식), 향후 "이 CC가 정확히 어떤 종류인지" 구분이
// 필요한 로직(예: 특정 면역 효과가 KNOCKUP만 막는다 등)을 붙일 수 있는
// 확장 지점을 만든다.
// 아리 E(매혹) 추가: CHARM은 STUN/ROOT처럼 행동을 완전히 막으면서, 그 위에
// "대상이 시전자 쪽으로 걸어간다"는 강제 이동까지 더해진 CC다(아래
// isStunned/tickStatusEffects 참고 - KNOCKUP의 강제 Y좌표 이동과 동일한
// 방식으로 강제 XZ좌표 이동을 처리한다).
// MR_SHRED(악의 "증오안개" - 마법 저항력 감소) - ARMOR_SHRED와 완전히
// 동일한 성격(강인함 지속시간 감소 대상에는 포함 안 됨)의 마법저항력 버전.
function getTenacity(target) {
  if (!target) return 0;
  let keep = (1 - Math.max(0, Math.min(1, target.itemTenacityPercent || 0))) * (1 - Math.max(0, Math.min(1, target.runeTenacity || 0))); // 52차: 룬(강인함 파편·불굴의 의지)
  const now = performance.now();
  for (const e of (target.statusEffects || [])) {
    if (e.type === 'TENACITY' && (!e.expiresAt || e.expiresAt > now)) keep *= 1 - Math.max(0, Math.min(1, e.value || 0));
  }
  return 1 - keep;
}
const CC_TYPES = new Set(['STUN', 'ROOT', 'SLOW', 'SILENCE', 'ARMOR_SHRED', 'MR_SHRED', 'KNOCKUP', 'SUPPRESSION', 'CHARM', 'FEAR', 'TAUNT']); // TAUNT: 도발(38차 람머스 E)
function unitLabel(u) {
  if (typeof dummy !== 'undefined' && u === dummy) return '더미 타겟';
  if (typeof controller !== 'undefined' && u === controller) return controller.championId || '플레이어';
  return '유닛';
}
function ensureStatusHost(u) {
  if (!u) return u;
  if (!u.statusEffects) u.statusEffects = [];
  if (u.shield == null) u.shield = 0;
  return u;
}
// effect: { id, type, duration(sec), value, damageType, totalDamage, tickInterval, source }
// type: SLOW / STUN / SILENCE / ROOT / ARMOR_SHRED / MR_SHRED / DOT / AD_BUFF / MS_BUFF / DAMAGE_REDUCTION / VULNERABLE
function applyStatus(target, effect) {
  // 94차: 지속시간이 없거나 0 이하·NaN인 효과는 걸지 않는다(무한은 허용). 예전엔 NaN 공중에 뜸이 대상 높이를 영영 NaN으로 만들었고,
  // 0초 효과도 군중 제어 훅(가렌 패시브 초기화·아이템 발동)을 실행했다.
  if (!effect || !(effect.duration > 0)) { if (effect) console.warn('[STATUS] 잘못된 지속시간 - 무시', effect.id, effect.type, effect.duration); return null; }
  ensureStatusHost(target);
  // 요청 7/8/34: 세트 R 시퀀스 진행 중(캐스트~착지 완료)에는 세트 자신이
  // Unstoppable(저지불가) 상태다 - 새 CC 면역 시스템을 따로 만들지 않고,
  // CC 계열 상태이상(STUN/ROOT/SLOW/SILENCE/ARMOR_SHRED)이 "세트 자신"에게
  // 걸리려는 시점에 이 공용 applyStatus() 진입점 하나에서 걸러낸다. R이
  // 붙잡은 "대상"에게 거는 제압(STUN)은 target이 세트 자신이 아니라
  // 붙잡힌 상대이므로 전혀 영향받지 않는다(요청 8: "저지불가는 세트에게만
  // 적용, 주변 적은 정상 CC 상태 유지").
  if (CC_TYPES.has(effect.type) && typeof controller !== 'undefined' && target === controller && controller._sett && controller._sett.rSeq) {
    console.log(`[CC BLOCKED - UNSTOPPABLE] ${effect.type} 무시됨 (세트 R 진행 중)`);
    return null;
  }
  // 구조물(포탑·억제기·넥서스)은 군중 제어에 걸리지 않는다(원작) - 광역 CC가 포탑을 기절시키거나 둔화시키던 문제 방지.
  if (target && target.isStructure && CC_TYPES.has(effect.type) && effect.type !== 'ARMOR_SHRED' && effect.type !== 'MR_SHRED' && effect.type !== 'ARMOR_SHRED_FLAT') return null;
  const now = performance.now();
  // 마스터 이 R(최후의 전사): 지속 중 둔화 면역(원작). 시전 시 기존 둔화는 _masteryiCastR이 제거한다.
  if (effect.type === 'SLOW' && target && target.championId === 'masteryi' && target._masteryi && (target._masteryi.rActiveUntil || 0) > now) {
    return null;
  }
  // 아이템 패시브(헤르메스의 발걸음 - 강인함/신속의 장화 - 둔화 저항)를
  // 이 공용 진입점 한 곳에서 처리한다 - 어떤 챔피언이 걸든, 어떤 스킬이
  // 걸든 전부 자동으로 적용된다(개별 스킬 코드를 손댈 필요 없음, 요청
  // 20-C/처형 시스템과 동일한 원칙). 강인함은 "기절/속박/침묵/매혹" 같은
  // 행동 불가 CC의 지속시간을 깎는다 - 원문 그대로 공중에 뜸(KNOCKUP)/
  // 제압(SUPPRESSION)에는 적용하지 않는다. 둔화 저항은 지속시간이 아니라
  // 세기(value) 자체를 깎는다(실제 "둔화 저항"의 의미와 동일).
  let effDuration = effect.duration;
  let effValue = effect.value;
  // 강인함은 아이템(itemTenacityPercent)과 스킬 버프(TENACITY 상태 - 가렌 W 등)를
  // 원작과 같이 곱연산으로 합친다: 최종 = 1 - (1-a)(1-b).
  const tenacity = getTenacity(target);
  // PC 위키(Tenacity): 에어본·수면·근시·경직(정지)·제압을 뺀 모든 군중 제어 지속시간을 줄인다 - 둔화 포함.
  // 예전엔 둔화가 빠져 있었다.
  // 94차: 자기 자신에게 건 효과(바루스 Q 충전 중 둔화 등)는 강인함·둔화 저항을 받지 않는다(적이 건 군중 제어가 아니다).
  const selfApplied = !!effect.source && effect.source === target;
  if (tenacity > 0 && !selfApplied && ['STUN', 'ROOT', 'SILENCE', 'CHARM', 'FEAR', 'SLOW', 'TAUNT'].includes(effect.type)) {
    // 83차: PC 위키(Tenacity) - 강인함으로 0.3초 미만까지 줄지는 않는다(원래 0.3초보다 짧으면 그대로).
    effDuration = Math.max(Math.min(effDuration, 0.3), effDuration * (1 - tenacity));
  }
  // 둔화 저항: 아이템·룬 출처끼리 곱연산(83차, 예전엔 아이템 합만).
  const slowResist = target ? 1 - (1 - Math.max(0, Math.min(1, target.itemSlowResistPercent || 0))) * (1 - Math.max(0, Math.min(1, target.runeSlowResist || 0))) : 0;
  if (slowResist > 0 && effect.type === 'SLOW' && !selfApplied) {
    effValue = effValue * (1 - slowResist);
  }
  const rec = { ...effect, duration: effDuration, value: effValue, expiresAt: now + Math.max(0, effDuration) * 1000, _tickAccum: 0 };
  if (effect.type === 'KNOCKUP') {
    // 27차: 이미 떠 있는 대상을 다시 띄우면(야스오 Q3 → R 등) 처음 바닥 높이를 유지한다. 예전엔 지금(공중) 높이를
    // 바닥으로 기억해서, 공중 상태가 끝나도 그 높이에 계속 떠 있었다.
    const base = target._yasuoAirborne ? target._yasuoAirborne.baseY : (target.mesh?.position?.y ?? 0);
    // 83차: 남은 공중 시간이 새 에어본보다 길면 그대로 둔다(짧은 에어본이 겹치면 상태는 남았는데 일찍 착지하던 문제).
    const prev = target._yasuoAirborne, prevLeft = prev ? Math.max(0, prev.duration - prev.elapsed) : 0;
    if (!(prev && prevLeft >= effect.duration)) target._yasuoAirborne = { baseY: base, elapsed: 0, duration: Math.max(0.05, effect.duration), height: effect.airborneHeight ?? 1.6 };
  }
  const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
  // 버그 수정: 같은 지속 피해(DOT)를 다시 걸면 틱 진행도(_tickAccum)가 0으로 초기화돼, 다시
  // 거는 간격이 틱 간격보다 짧으면(다리우스가 공속 1 이상으로 계속 평타 → 출혈 갱신) 출혈이
  // 한 번도 들어가지 않았다. 진행 중이던 틱 시간을 이어받는다(지속시간/총 피해는 새 값).
  if (idx >= 0 && rec.type === 'DOT' && target.statusEffects[idx].type === 'DOT' && target.statusEffects[idx].expiresAt > now) {
    rec._tickAccum = target.statusEffects[idx]._tickAccum || 0;
  }
  if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
  // 94차: 전투 기록(디버그 패널 전투 로그·gameSession.events()) - 행동 제한 계열만(지속 피해·버프까지 남기면 기록이 금방 밀린다).
  if ((CC_TYPES.has(effect.type) || effect.type === 'STASIS') && typeof emitGameEvent === 'function') emitGameEvent('status', { targetId: _evId(target), sourceId: _evId(effect.source || null), statusType: effect.type, statusId: effect.id, durationSec: Math.round(effDuration * 1000) / 1000 });
  if (CC_TYPES.has(effect.type)) {
    console.log(`[CC]\nTarget: ${unitLabel(target)}\nType: ${effect.type}\nDuration: ${effDuration}`); // 강인함 적용 후 실제 지속시간(디버깅 혼동 방지)
    refreshUnitCcTags(target);
    // 버그 수정(가렌 패시브 "끈질긴 방어자" - 곧 추가될 멀티플레이 대비):
    // passiveState에 lastEnemySkillHitAt 필드가 이미 선언돼 있었지만
    // (생성자 참고) 실제로 이 값을 갱신하는 코드가 파일 어디에도 없었다 -
    // 패시브 자체 설명("피해를 입지 않거나 적 스킬에 맞지 않으면")이 요구하는
    // "피해가 0이어도 적 스킬(CC)에 맞으면 무피해 타이머가 리셋된다"는
    // 조건이 아예 반영되지 않고 있었다. 이 데모는 지금까지 허수아비가
    // 플레이어에게 스킬을 걸 일이 없어 드러나지 않았지만, 실제 상대 챔피언이
    // 생기는 멀티플레이에서는 반드시 필요하다. CC 계열 상태이상은 이
    // 공용 진입점(applyStatus) 하나만 거치므로 여기 한 곳에서만 갱신하면
    // 충분하다(이 코드베이스의 자기 자신 대상 applyStatus 호출은 전부
    // MS_BUFF/DAMAGE_REDUCTION 등 비-CC 타입이라, "target에 CC_TYPES가
    // 걸린다"는 곧 "외부에서 걸어온 적대적 효과"와 동일하게 취급해도 안전
    // 하다 - 새로운 "누가 걸었는가" 필드를 따로 만들지 않고 기존 CC_TYPES
    // 분류만 재사용). target.passiveState가 있는 경우(=실제 CharacterController,
    // 더미 등 단순 유닛 객체는 passiveState가 없으므로 자동으로 제외됨)에만
    // 갱신한다.
    // PC 위키: "적 챔피언 스킬·소환사 주문에 맞으면" - 걸어온 쪽이 챔피언(또는 출처 미상)일 때만.
    if (target.passiveState && (!effect.source || effect.source.isChampion) && effect.source !== target) target.passiveState.lastEnemySkillHitAt = now;
  }
  // 태양의 썰매(썰매 질주)/밴들파이프(팡파르)/제국의명령(명령) - "적
  // 챔피언을 둔화 또는 이동 불가 상태로 만들면" 발동하는 공용 훅. 모든
  // CC 적용이 결국 이 진입점 하나를 거치므로, 여기 한 줄만 추가하면
  // 어떤 챔피언의 어떤 스킬로 걸든(이 데모는 사실상 플레이어 하나뿐이지만)
  // 자동으로 맞물린다. SLOW/STUN/ROOT/KNOCKUP/SUPPRESSION/CHARM만 "둔화
  // 또는 이동 불가"로 친다(SILENCE/ARMOR_SHRED/MR_SHRED는 이동을 막지
  // 않으므로 제외). target/effect.type을 함께 넘겨서, 제국의명령처럼
  // "이동 불가"만(둔화 제외) 가려 쓰거나 "걸린 대상"을 표식해야 하는
  // 패시브도 이 훅 하나로 처리한다.
  if (target.isChampion && ['SLOW', 'STUN', 'ROOT', 'KNOCKUP', 'SUPPRESSION', 'CHARM', 'FEAR', 'TAUNT'].includes(effect.type)
      && typeof itemOnSlowOrImmobilize === 'function') {
    const attacker = effect.source || (typeof controller !== 'undefined' ? controller : null);
    if (attacker && attacker !== target) itemOnSlowOrImmobilize(attacker, target, effect.type);
  }
  return rec;
}
function clearStatus(target, id) {
  if (!target || !target.statusEffects) return;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== id);
}
function hasStatus(target, type) {
  if (!target || !target.statusEffects) return false;
  const now = performance.now();
  return target.statusEffects.some((e) => e.type === type && e.expiresAt > now);
}
function getStatus(target, id) {
  if (!target || !target.statusEffects) return null;
  const now = performance.now();
  return target.statusEffects.find((e) => e.id === id && e.expiresAt > now) || null;
}
function getSlowPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) {
    if (e.type !== 'SLOW' || e.expiresAt <= now) continue;
    // decayLinear - "N% 둔화가 M초에 걸쳐 감소"(노틸러스 E 등). MS_BUFF와 동일한 방식.
    const val = (e.decayLinear && e.duration > 0) ? e.value * Math.max(0, Math.min(1, ((e.expiresAt - now) / 1000) / e.duration)) : e.value;
    v = Math.max(v, val);
  }
  return v;
}
function getArmorShredPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  // PC 위키(Stacking/Armor penetration): 서로 다른 출처의 % 방어력 감소는 곱연산(20% + 30% = 44%). 같은 출처는
  // applyStatus가 같은 id로 갱신하므로 한 번만 들어간다. 예전엔 가장 큰 값 하나만 적용했다.
  let keep = 1;
  for (const e of target.statusEffects) if (e.type === 'ARMOR_SHRED' && e.expiresAt > now) keep *= 1 - Math.max(0, Math.min(1, e.value));
  v = 1 - keep;
  return v;
}
// 83차: 고정 방어력 감소(ARMOR_SHRED_FLAT) - 원작 저항 계산의 첫 단계. 서로 다른 출처끼리 더해지고 방어력을 음수로도 만든다.
function getArmorShredFlat(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'ARMOR_SHRED_FLAT' && e.expiresAt > now) v += e.value;
  return v;
}
// ARMOR_SHRED(getArmorShredPercent)와 달리 이건 퍼센트가 아니라 고정
// 마법저항력 감소량이다(악의 "증오안개" - 마법 저항력 10 감소, 퍼센트
// 아님) - 이름에 Percent를 쓰지 않아 호출부에서 헷갈리지 않게 한다.
function getMrShredFlat(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  // PC 위키: 고정 저항 감소는 서로 다른 출처끼리 더해진다(예전엔 가장 큰 값만).
  for (const e of target.statusEffects) if (e.type === 'MR_SHRED' && e.expiresAt > now) v += e.value;
  return v;
}
// 피의 노래(약점 노출) - "받는 피해량 증가"는 기존 DAMAGE_REDUCTION(감소)과
// 정반대 방향의 효과라 별도 타입으로 둔다. getDamageReductionPercent처럼
// "가장 센 값 하나만 적용"이 아니라 실제 LoL처럼 여러 출처가 있으면
// 합연산으로 누적된다(지금은 이 아이템 하나뿐이라 차이는 없지만, 나중에
// 다른 "취약" 효과가 추가될 가능성을 열어둔다).
function getVulnerablePercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'VULNERABLE' && e.expiresAt > now) v += e.value;
  return v;
}
// 피해 감소 합산(원작): 서로 다른 출처는 곱연산 1-(1-a)(1-b). 단 같은 스킬의 여러 단계(drGroup -
// 예: 마스터 이 명상 70%→45%)는 그룹 안에서 최대값만. halfVsTurret 효과는 포탑 피해에 절반만.
// 버그 수정: 예전엔 모든 출처 중 최대값 하나만 적용해, 가렌 W와 다른 감소 효과가 겹치지 않았다.
function _combineDamageReduction(target, types, source) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  const byGroup = new Map();
  for (const e of target.statusEffects) {
    if (!types.includes(e.type) || e.expiresAt <= now) continue;
    let v = Math.max(0, Math.min(1, e.value || 0));
    if (e.halfVsTurret && source && source.isTurret) v *= 0.5;
    const key = e.drGroup || e.id || e.type;
    byGroup.set(key, Math.max(byGroup.get(key) || 0, v));
  }
  let keep = 1;
  for (const v of byGroup.values()) keep *= 1 - v;
  return 1 - keep;
}
function getDamageReductionPercent(target, source = null) {
  return _combineDamageReduction(target, ['DAMAGE_REDUCTION'], source);
}
function getMagicDamageReductionPercent(target, source = null) {
  return Math.max(0, Math.min(1, _combineDamageReduction(target, ['MAGIC_DAMAGE_REDUCTION', 'DAMAGE_REDUCTION'], source)));
}
function getMoveSpeedBuffPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) {
    if (e.type !== 'MS_BUFF' || e.expiresAt <= now) continue;
    let val = e.value;
    // 선형 감쇠 옵션(decayLinear) - "N%만큼 증가했다가 M초에 걸쳐 원래대로
    // 돌아온다"는 효과(아리 W 등)는 지속시간 내내 고정값이 아니라 남은
    // 시간 비율만큼 줄어든다.
    if (e.decayLinear && e.duration > 0) {
      const remainingSec = (e.expiresAt - now) / 1000;
      val = e.value * Math.max(0, Math.min(1, remainingSec / e.duration));
    }
    // 버그 수정: 서로 다른 % 이동 속도 증가는 원작에서 "더해진다"(예: 가렌 Q 35% + 다른
    // 버프). 예전엔 가장 큰 것 하나만 적용됐다. 같은 버프 재적용은 같은 id라 중복되지 않는다.
    v += val;
  }
  return v;
}
// 전설급 아이템(삼위일체 "가속"/칠흑의양날도끼 "열정" 등)의 "기본 공격/피해를
// 입히면 N초 동안 이동 속도 +X(퍼센트가 아니라 LoL 원본 고정 수치)" 효과용.
// MS_BUFF(퍼센트)와 완전히 별개 타입이다 - stats.flatMoveSpeedBonus는
// character_controller.js에 이미 선언만 돼 있고 지금까지 아무도 채워 넣지
// 않던 필드였다(getFinalMoveSpeed()는 처음부터 이 필드를 읽고 있었다).
function getFlatMoveSpeedBuff(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'MS_BUFF_FLAT' && e.expiresAt > now) v += e.value; // 83차: 고정 이동 속도 증가는 서로 더해진다(원작)
  return v;
}
// 바루스 E(화살비) - "고통스러운 상처"(자가 회복/재생 약화). 범용 상태이상
// 하나(GRIEVOUS)로 표현해서, 이후 다른 챔피언의 회복 감소 효과도 동일한
// 타입을 재사용할 수 있게 한다. 이 데모는 챔피언 간 실제 회복량을 감소
// 시키는 공용 applyHeal() 진입점이 따로 없어(각 챔피언이 각자 회복 계산을
// 직접 처리) 이 헬퍼를 실제로 소비하는 곳은 아직 없다 - 상태이상 자체는
// 정확히 걸리고 CC 태그로도 표시되므로, 추후 개별 챔피언 회복 로직에서
// 이 값을 곱하기만 하면 바로 연결된다(수치 임의 발명 방지 원칙에 따라
// 지금 존재하지 않는 회복 파이프라인을 새로 만들지는 않는다).
function getGrievousPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'GRIEVOUS' && e.expiresAt > now) v = Math.max(v, e.value);
  return v;
}
// 공용 "받는 체력 회복" 배율 - 정령의형상(무한한 활력, itemHealingReceivedBonusPercent)
// 같은 증폭과 그리버스(getGrievousPercent) 같은 감소를 한 곳에서 묶어서
// 반환한다. 두 효과는 서로 독립된 곱셈 인자라 순서는 상관없다(이미
// item_system.js/character_controller.js의 공용 재생 경로가 똑같은 두
// 값을 따로 곱하고 있었는데, 챔피언별 자체 회복 스킬(아리/세트 등)에는
// 그리버스만 연결하고 itemHealingReceivedBonusPercent는 빠뜨리기 쉬운
// 구조라 - 새 회복 지점을 추가할 때 이 함수 하나만 곱하면 둘 다 자동으로
// 챙기게 한다).
function getHealReceivedMultiplier(target) {
  if (!target) return 1;
  // 83차: 칼바람 챔피언별 치유 보정(이 연습장에서 챔피언이 받는 치유는 전부 자기 치유라 받는 쪽에 곱한다).
  const bal = typeof getAramBalance === 'function' ? getAramBalance(target) : null;
  return (1 + (target.itemHealingReceivedBonusPercent || 0)) * (1 - getGrievousPercent(target)) * (1 + ((bal && bal.healing) || 0));
}
// 받는 보호막 배율(정령의형상/월석재생기 등의 "보호막 효과 증가") - 아이템
// 보호막은 이미 이 필드를 곱하고 있었다. 챔피언 스킬 보호막도 같은 배율을 쓴다.
function getShieldReceivedMultiplier(target) {
  if (!target) return 1;
  const bal = typeof getAramBalance === 'function' ? getAramBalance(target) : null; // 83차: 칼바람 보호막 보정
  return (1 + (target.itemShieldReceivedBonusPercent || 0)) * (1 + ((bal && bal.shielding) || 0));
}
function getAttackSpeedBuffPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  // 버그 수정: 서로 다른 공격 속도 버프(마스터 이 R, 애쉬 Q, 이즈리얼 패시브,
  // 아이템 중첩 등)는 원작에서 "더해진다". 예전엔 Math.max로 가장 큰 것 하나만
  // 적용돼, 예컨대 마스터 이 R 중에는 아이템 공속 버프가 통째로 무시됐다.
  // 같은 버프의 재적용은 applyStatus가 같은 id를 덮어쓰므로 중복 합산되지 않는다.
  for (const e of target.statusEffects) if ((e.type === 'MASTERYI_R_AS' || e.type === 'AS_BUFF') && e.expiresAt > now) v += e.value;
  // 91차: 칼바람 공격 속도 보정(야스오·요네 +2.5%) - 추가 공격 속도로 더한다.
  const bal = typeof getAramBalance === 'function' ? getAramBalance(target) : null;
  if (bal && bal.attackSpeed) v += bal.attackSpeed;
  return v;
}
// 83차: 공격 속도 감소(AS_REDUCTION - 얼어붙은 심장 혹한의 포옹 등) = 총 공격 속도 × Π(1 - 감소). 출처끼리 곱연산(위키 Cripple).
function getAttackSpeedReductionMultiplier(target) {
  if (!target || !target.statusEffects) return 1;
  const now = performance.now();
  let keep = 1;
  for (const e of target.statusEffects) if (e.type === 'AS_REDUCTION' && e.expiresAt > now) keep *= 1 - Math.max(0, Math.min(1, e.value));
  return keep;
}

// 94차: 유닛의 전투 상태(상태 효과·공중에 뜸·끌려가기·보호막)를 모두 지운다 - 게임 초기화에서 허수아비·아군에게 쓴다.
// 예전엔 초기화 뒤에도 허수아비에 걸린 출혈·점화가 계속 틱했고, 공중에 뜬 높이·끌려가는 중인 상태가 남았다.
function clearUnitCombatState(u) {
  if (!u) return;
  if (u._yasuoAirborne && u.mesh && u.mesh.position) u.mesh.position.y = u._yasuoAirborne.baseY;
  u._yasuoAirborne = null; u._pullState = null;
  if (Array.isArray(u.statusEffects)) u.statusEffects.length = 0;
  if (typeof clearShields === 'function') clearShields(u);
  if (typeof refreshUnitCcTags === 'function') refreshUnitCcTags(u);
}
// 94차: 챔피언을 바꿀 때 그 컨트롤러가 다른 유닛에게 건 상태 효과를 지운다 - 예전엔 람머스 도발·아리 매혹이 남아 허수아비가
// 새 챔피언 쪽으로 계속 걸어왔다(같은 컨트롤러 객체를 재사용하므로 source가 그대로였다).
function clearStatusesFromSource(source, units) {
  if (!source || !units) return;
  for (const u of units) {
    if (!u || u === source || !Array.isArray(u.statusEffects)) continue;
    const before = u.statusEffects.length;
    for (let i = u.statusEffects.length - 1; i >= 0; i--) if (u.statusEffects[i].source === source) u.statusEffects.splice(i, 1);
    if (u.statusEffects.length !== before && typeof refreshUnitCcTags === 'function') refreshUnitCcTags(u);
  }
}
