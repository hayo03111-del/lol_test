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
const CC_TYPES = new Set(['STUN', 'ROOT', 'SLOW', 'SILENCE', 'ARMOR_SHRED', 'KNOCKUP', 'SUPPRESSION', 'CHARM']);
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
// type: SLOW / STUN / SILENCE / ROOT / ARMOR_SHRED / DOT / AD_BUFF / MS_BUFF / DAMAGE_REDUCTION
function applyStatus(target, effect) {
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
  const now = performance.now();
  const rec = { ...effect, expiresAt: now + Math.max(0, effect.duration) * 1000, _tickAccum: 0 };
  if (effect.type === 'KNOCKUP') {
    const base = target.mesh?.position?.y ?? 0;
    target._yasuoAirborne = { baseY: base, elapsed: 0, duration: Math.max(0.05, effect.duration), height: effect.airborneHeight ?? 1.6 };
  }
  const idx = target.statusEffects.findIndex((e) => e.id === effect.id);
  if (idx >= 0) target.statusEffects[idx] = rec; else target.statusEffects.push(rec);
  if (CC_TYPES.has(effect.type)) {
    console.log(`[CC]\nTarget: ${unitLabel(target)}\nType: ${effect.type}\nDuration: ${effect.duration}`);
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
    if (target.passiveState) target.passiveState.lastEnemySkillHitAt = now;
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
  for (const e of target.statusEffects) if (e.type === 'SLOW' && e.expiresAt > now) v = Math.max(v, e.value);
  return v;
}
function getArmorShredPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'ARMOR_SHRED' && e.expiresAt > now) v = Math.max(v, e.value);
  return v;
}
function getDamageReductionPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'DAMAGE_REDUCTION' && e.expiresAt > now) v = Math.max(v, e.value);
  return v;
}
function getMagicDamageReductionPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if ((e.type === 'MAGIC_DAMAGE_REDUCTION' || e.type === 'DAMAGE_REDUCTION') && e.expiresAt > now) v = Math.max(v, e.value);
  return Math.max(0, Math.min(1, v));
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
    v = Math.max(v, val);
  }
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
function getAttackSpeedBuffPercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of target.statusEffects) if ((e.type === 'MASTERYI_R_AS' || e.type === 'AS_BUFF') && e.expiresAt > now) v = Math.max(v, e.value);
  return v;
}

