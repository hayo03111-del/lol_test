/* ============================================================
   CharacterController - 기본 공격·스킬 비용·재생(평타 명중 훅, 공격 오버라이드, 스윙, 쿨다운/재생)
   ------------------------------------------------------------
   character_controller.js의 클래스 본문에서 분리한 메서드들이다(동작 동일).
   챔피언 파일들과 같은 방식으로 CharacterController.prototype에 붙인다 -
   빌드 순서상 character_controller.js 바로 뒤에 로드된다.
   ============================================================ */

// 버그 수정(전 챔피언 공통): this.bonusAD는 원래 "다리우스 과다출혈
// 만중첩 임시 버프"만을 위한 필드인데(기본값 0, 오직 다리우스 empower
// 중에만 값이 들어감), 여러 챔피언의 스킬 데미지 공식이 이 필드를
// "현재 추가 공격력(bonus AD)" 대신으로 잘못 참조하고 있었다. 다리우스가
// 아닌 챔피언은 이 필드가 항상 0이라, "+X 추가 공격력" 항이 실제로는
// 게임 내내 0으로 계산되고 있었다(레벨업으로 공격력이 올라도 전혀
// 반영 안 됨). 실제 추가 공격력은 "현재 총 공격력 - 1레벨 기본 공격력"
// 이고, 여기에 다리우스의 임시 empower 보너스가 있으면 더해준다.
// 기본 공격 치명타 판정 - 원작처럼 의사 난수(PRD)로 굴린다(prdConstant 참고).
CharacterController.prototype._rollBasicAttackCrit = function() {
    // 40차: 악마사냥꾼의 화살(폭격 개시) - 남은 강화 평타면 치명타 확정. 원래도 치명타였으면 'natural'(15% 추가 고정 피해),
    // 강제로 만든 치명타면 'forced'(치명타 피해 80%) - 이번 스윙의 공격 결과(attackResult)가 _itemBarrageSwing을 읽는다.
    const barrage = typeof itemBarrageTakeSwing === 'function' ? itemBarrageTakeSwing(this) : null;
    const natural = this._rollNaturalCrit();
    this._itemBarrageSwing = barrage ? { kind: natural ? 'natural' : 'forced', p: barrage } : null;
    return natural || !!barrage;
};
// 평타 결과에 붙은 아이템 추가 고정 피해(폭격 개시)를 명중 순간에 준다. 준 피해를 돌려준다.
CharacterController.prototype._applyItemExtraTrue = function(target, attackResult) {
    if (!attackResult.itemExtraTrue || !target || target.hp <= 0) return 0;
    return applyDamage(target, { rawDamage: attackResult.itemExtraTrue, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, source: this, isItemEffect: true }) || 0;
};
CharacterController.prototype._rollNaturalCrit = function() {
    const p = Math.max(0, Math.min(1, this.stats.critChance || 0));
    if (p <= 0) return false;
    if (p >= 1) return true;
    this._critPrdN = (this._critPrdN || 0) + 1;
    const crit = Math.random() < prdConstant(p) * this._critPrdN;
    if (crit) this._critPrdN = 0;
    return crit;
};

// "추가 공격 속도"(LoL 규칙: 레벨 성장분 + 버프/아이템). 가렌 E 회전 수, 야스오/요네 Q
// 쿨다운/시전 시간 등 "추가 공속 비례" 스킬이 공용으로 쓴다.
CharacterController.prototype._totalBonusAttackSpeed = function() {
    return Math.max(0, this.stats.levelBonusAttackSpeed || 0) + Math.max(0, this.stats.bonusAttackSpeedPercent || 0);
};

CharacterController.prototype._getBonusAD = function() {
    const cd = this._champData();
    // 주의: this.bonusAD (다리우스 녹서스의 힘 등)는 recomputeStats()가 이미
    // this.stats.attackDamage에 합산해뒀다 - 여기서 또 더하면 이중 계산이라
    // stats.attackDamage 하나만 기준으로 계산한다.
    // 버그 수정(원작 규칙): "추가 공격력"에는 레벨 성장 공격력이 들어가지 않는다.
    // 예전엔 1레벨 기본 공격력만 빼서 레벨이 오를수록 성장분까지 추가 공격력으로
    // 셌다(18레벨이면 챔피언에 따라 +40~80). 현재 레벨의 기본 공격력을 뺀다.
    const levelBase = (this.championId && typeof computeChampionStats === 'function')
      ? computeChampionStats(this.championId, this.champLevel || 1) : null;
    const baseAd = levelBase ? levelBase.attackDamage : (cd ? cd.stats.ad : 0);
    return Math.max(0, (this.stats.attackDamage || 0) - baseAd);
};

// 슬롯의 마나/쿨타임을 CHAMPION_DATA(있으면)+현재 스킬레벨 기준으로 계산.
CharacterController.prototype._skillCostFor = function(slot) {
    const cd = this._champData();
    if (!cd || !cd[slot]) return null;
    const data = cd[slot];
    const lvl = Math.max(1, this.skillLevels[slot] || 1);
    let mana = 0;
    if (data.mana != null) mana = skillVal(data.mana, lvl);
    else if (data.manaByLevel) mana = skillVal(data.manaByLevel, lvl);
    else if (data.manaFlat != null) mana = data.manaFlat; // 예: 마스터 이 W(명상) - 시전 즉시 소모하는 고정분. 초당 추가 소모는 채널 틱에서 별도 처리.
    const cdSec = skillVal(data.cooldown, lvl);
    return { mana: mana || 0, cd: cdSec };
};
// 스킬 포인트를 아직 배우지 않았으면(레벨 0) 캐스트를 막고, 그 외에는
// 마나/쿨다운을 확인 후 실제로 차감한다. CHAMPION_DATA가 없는 챔피언은
// 기존 SKILL_COST 전역 상수로 자연스럽게 폴백한다(기존 기능 유지).
// 버그 수정("마나 부족하면 모션이 기본으로 돌아간다"): 지금까지는
// "평타 중 스킬 입력 -> 무조건 평타부터 취소 -> 그 다음에야 마나/쿨다운
// 확인"이라, 마나가 부족하면 스킬은 안 나가는데 이미 취소해버린 평타
// 모션은 되돌릴 수 없었다(그 자리에서 캐릭터가 아무 동작도 안 하는
// "기본" 상태로 보임). 이 헬퍼는 _payCost와 완전히 같은 조건을 확인
//하되 마나/쿨다운을 실제로 차감하지 않는다 - "취소해도 되는지"를
// 먼저 물어보기 위한 순수 조회용이다.
CharacterController.prototype._canAffordAbility = function(slot) {
    if (this.championId && CHAMPION_DATA[this.championId] && (this.skillLevels[slot] || 0) < 1) return false;
    const custom = this._skillCostFor(slot);
    const cost = custom || SKILL_COST[slot];
    if (this.cooldowns[slot] > 0) return false;
    if (this.mp < cost.mana) return false;
    return true;
};

CharacterController.prototype._payCost = function(slot, free) {
    if (!free && this.championId && CHAMPION_DATA[this.championId] && (this.skillLevels[slot] || 0) < 1) {
      const msg = `${slot} - 아직 스킬 포인트를 투자하지 않음 (레벨 패널에서 ${slot} 옆 '+' 버튼 먼저)`;
      console.log(`[SKILL BLOCKED] ${this.championId} ${msg}`);
      showSkillToast(msg);
      return false;
    }
    const custom = this._skillCostFor(slot);
    const cost = custom || SKILL_COST[slot];
    if (!free) {
      if (this.cooldowns[slot] > 0) {
        const msg = `${slot} - 쿨다운 ${this.cooldowns[slot].toFixed(1)}s 남음`;
        console.log(`[SKILL BLOCKED] ${msg}`); showSkillToast(msg);
        return false;
      }
      if (this.mp < cost.mana) {
        const msg = `${slot} - 마나 부족 (${this.mp.toFixed(0)}/${cost.mana})`;
        console.log(`[SKILL BLOCKED] ${msg}`); showSkillToast(msg);
        return false;
      }
      this.mp -= cost.mana; this.cooldowns[slot] = typeof abilityHasteCooldown === 'function' ? abilityHasteCooldown(this, cost.cd, slot) : cost.cd;
      if (cost.mana > 0 && typeof itemOnManaSpent === 'function') itemOnManaSpent(this, cost.mana);
      updateBars(this);
    }
    return true;
};

// 기본 공격이 실제로 명중했을 때 공통 진입점. overrideId는 이번 스윙이
// attackOverride였다면 그 슬롯 id('Q'=가렌 결정타 강화평타, 'W'=다리우스
// 마비의 일격 강화평타)이고, 일반 평타면 null이다.
CharacterController.prototype._onBasicAttackHit = function(target, overrideId, wouldKill, attackHand, isCritical) {
    if (!target) return;
    // 아이템 패시브 "도움의 손길"(도란의 반지/방패/투구 공용) - 미니언
    // 기본 공격 시 고정 추가 물리 피해. applyDamageToMinion()이 이미
    // 기본 공격 피해를 적용한 "뒤"이므로 여기서는 보너스 피해만 별도로
    // 더해 넣는다(챔피언 전용 로직과 무관한 범용 훅).
    if (target.isMinion && this.itemMinionBonusDamage > 0) {
      applyDamageToMinion(target, { rawDamage: this.itemMinionBonusDamage, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1 }, true);
    }
    // 아이템 패시브 "수확"(수확의 낫) - 기본 공격 적중 시 고정 체력 회복.
    // 대상 종류(챔피언/더미/미니언/포탑)를 가리지 않는 실제 아이템 설명과
    // 동일하게 범용으로 적용한다.
    if (this.itemOnHitHeal > 0) this.hp = Math.min(this.maxHp, this.hp + this.itemOnHitHeal);
    // 아이템 패시브(광휘의 검/티아맷) - 평타 적중 공용 훅. 둘 다
    // item_system.js의 전용 함수가 "보유 여부"부터 직접 확인하므로 여기선
    // 무조건 호출만 한다(들고 있지 않으면 즉시 return).
    if (typeof itemOnBasicAttackHit === 'function') itemOnBasicAttackHit(this, target, isCritical);
    // 애쉬 패시브(서리 화살): 기본 공격마다 대상을 둔화시킨다(치명타면
    // 더 강한 둔화로 대체). Q(궁사의 집중)의 다발 공격(_asheFireFlurry)은
    // 다중 대상이라 이 단일 대상 훅을 거치지 않고 자체적으로 처리한다.
    if (this.championId === 'ashe') this._asheOnBasicAttackHit(target, isCritical);
    if (this.championId === 'nautilus') this._nautilusOnBasicAttackHit(target);
    if (this.championId === 'nilah') this._nilahOnBasicAttackHit(target, target._lastDamageTakenAmount || 0, wouldKill);
    if (this.championId === 'renekton') this._renektonOnBasicAttackHit(target);
    if (this.championId === 'lux') this._luxOnBasicAttackHit(target); // 47차: 광채 표식 터뜨리기
    // 아리: 여우불의 "아리가 공격한 적" 우선순위 판정에 쓸 마지막 평타
    // 대상/시각을 기록한다(공식 설명 "3초 내 마지막 평타 대상"과 동일).
    if (this.championId === 'ahri' && this._ahri) { this._ahri.lastAttackTarget = target; this._ahri.lastAttackAt = performance.now(); }
    // 이즈리얼: 기본 공격이 W(정수의 흐름) 표식 대상을 맞히면 표식이 터진다
    // (마나 환불은 스킬로 터뜨렸을 때만이므로 여기선 abilityManaCost 없이 호출).
    if (this.championId === 'ezreal') this._ezrealDetonateMark(target, 'attack');
    // 바루스: 기본 공격마다 패시브(살아있는 복수) 램프 갱신 + W(오한의
    // 화살통) 추가 마법 피해/오한 적용.
    if (this.championId === 'varus') this._varusOnBasicAttackHit(target);
    if (this.championId === 'vex') this._vexOnBasicAttackHit(target);

    if (this.championId === 'garen' && overrideId === 'Q') { this._garenQOnHit(target); this._consumeAttackOverrideOnConfirmedHit('Q'); }
    if (this.championId === 'darius') {
      this._dariusApplyBleed(target);
      if (overrideId === 'W') { this._dariusWOnHit(target); this._consumeAttackOverrideOnConfirmedHit('W'); }
    }
    if (this.championId === 'sett') this._settOnBasicAttackHit(target, attackHand);
    if (this.championId === 'masteryi') {
      // 평타 자체로 챔피언을 처치해도 R 패시브(기본 스킬 쿨감 70%)/R 연장이 발동해야 한다(예전엔 누락).
      if (wouldKill) this._masteryiOnKill(target, { type: 'BASIC_ATTACK' });
      this._masteryiOnBasicAttackHit(target);
      // 요청 2/3: HIT가 방금 확정됐으니, 그 이전에 눌러뒀던 W 예약이
      // 있으면 지금(가능한 가장 이른 시점 - RECOVERY 시작 전)) 즉시
      // 소비한다. 판정이 이미 끝난 뒤이므로 명캔 조건("판정 이후에만
      // 캔슬 가능")을 정확히 만족한다.
      if (this._masteryi.pendingWAfterHit) {
        this._masteryi.pendingWAfterHit = false;
        console.log('[Master Yi W] HIT 확정 - 예약된 W 발동');
        this._clearActionTimers();
        this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
        this._dispatchCast('W', null, false);
      }
    }
    if (this.championId === 'mordekaiser') {
      const cd = this._champData();
      // 패시브: 기본 공격에 주문력 40% 추가 마법 피해(이 데모는 AP 아이템이 없어 0으로 기여).
      const bonus = cd.passive.apRatio * this.stats.abilityPower;
      const aaDealt = target._lastDamageTakenAmount != null ? target._lastDamageTakenAmount : this.stats.attackDamage;
      let bonusDealt = 0;
      if (bonus > 0 && !target.isTurret) bonusDealt = applyDamage(target, { rawDamage: bonus, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent, source: this }) || 0;
      this._mordeOnDealtHit(target, aaDealt + bonusDealt); // 실제 입힌 피해 기준
    }
    if (this.championId === 'chogath') {
      this._chogathEOnHit(target); // E 활성화 중이면 이 평타에 가시 피해 추가
      if (wouldKill) this._chogathOnKill(target); // 패시브(육식)는 평타로 처치해도 발동
    }
    if (this.championId === 'leesin') this._leesinOnBasicAttackHit(target);
};

// ---------------- 가렌 ----------------













// ---------------- 다리우스 ----------------








// 버그 수정: 예전에는 this.currentTarget을 그대로 썼는데, 다리우스 E(포획)는
// 실제로는 직선 스킬샷(Skill Shot)이라 조준 방향에 실제로 걸린 대상을
// 밖(_castE)에서 findFirstInLine()으로 찾아 target 인자로 넘겨받는다.





// ---------------- 세트 ----------------
// 패시브(투기장의 투지): 왼손/오른손을 번갈아 사용, 오른손이 추가 물리피해.
// 버그 수정: 예전엔 이 함수가 애니메이션 선택(comboIndex)과 완전히 독립된
// 자기만의 _sett.punchSide 카운터를 따로 토글했다 - 치명타/Q 강화평타처럼
// comboIndex가 그대로인 스윙에서도 이 카운터는 계속 넘어가서, "실제 재생된
// 애니메이션(왼손 모션)"과 "적용된 피해(오른손 보너스)"가 서로 어긋날 수
// 있었다. 이제 스윙이 시작되는 순간 단 한 번 확정된 attackHand(요청 7의
// AttackInstance 개념)를 그대로 받아서만 판단한다 - 별도로 추측/토글하지
// 않는다. attackHand가 null(치명타/스킬 강화 평타처럼 좌우 시퀀스 밖의
// 스윙)이면 오른손 보너스는 적용하지 않는다(기획안에 없는 규칙을 새로
// 만들지 않음).


// 잃은 체력 5%당 추가 체력 재생(레벨 구간별 수치).
// 요청 7: "다음 평타 입력이 들어왔을 때만 확인하지 말고 게임 업데이트
// 루프에서도 세트 패시브 상태를 관리하라" - 이전엔 스윙을 실제로
// 시작하려는 순간에만(지연 평가) 타임아웃을 확인했다. 결과(실제 다음
// 공격이 항상 올바른 손으로 나가는 것)는 동일하지만, 공격을 멈추고
// 가만히 있는 동안에는 comboIndex가 "아직 RIGHT 차례"인 것처럼 보일 수
// 있었다. 이제 매 프레임 여기서도 동일한 조건을 확인해서 유휴 상태에서도
// 즉시 LEFT로 스냅한다(_beginAttackSwing의 검사와 완전히 동일한 조건 -
// 계산식을 중복 관리하지 않기 위해 동일한 소스 데이터만 참조).








// 패시브(투기장의 투지): 실제로 HP를 깎은 피해량만큼 투지(FLOW)가
// 쌓인다(최대 체력의 50%까지). 4초간 추가 피해가 없으면 감소 시작.
// 버그 수정(요청: "전체 Grit을 하나의 값으로 감소시키지 마라"): 예전엔
// 투지 전체를 "마지막 피해 시점" 하나만 기준으로 한꺼번에 감소시켰다.
// 이제 각 피해로 생긴 투지를 별도 항목(entry: {amount, gainedAt})으로
// 기록해서, A 피해로 생긴 투지와 1초 뒤 B 피해로 생긴 투지가 서로 다른
// 시점부터 독립적으로 감소를 시작하게 한다.






// 요청 14/26: W 보호막(투지 자원과는 완전히 독립된 값)을 3초에 걸쳐
// 프레임 기반으로 선형 감소시킨다. 전투 중 흡수로 이미 줄어든 상태라면
// 그 값에서 계속 줄어들 뿐, 공식으로 되돌리지 않는다.


// 세트 W(강펀치) - 문서 9~15절: 전방 사다리꼴 판정. 중앙 직선(고정 폭)에
// 걸린 대상은 투지 비례 고정 피해(방어력 무시), 그 옆 사다리꼴 영역에
// 걸린 대상은 투지 비례 물리 피해(방어력 적용) - 같은 대상이 두 피해를
// 동시에 받지 않는다(요청 15). origin/forward는 캐스트 시작 시점에
// 고정된 값을 그대로 받는다(요청 16 "방향 고정").


// 세트 E(안면강타) - 요청 전면 재작성: 세트 기준 "왼쪽"과 "오른쪽"을 각각
// 독립적으로 판정한다(leftTarget/rightTarget). 각 방향에 유효한 대상이
// 있으면 그 대상에게 데미지+실제 끌어오기를 적용하고, 왼쪽/오른쪽이
// "둘 다" 있을 때만 두 대상 모두에게 기절을 추가로 건다 - 맞은 인원수가
// 아니라 "양쪽에 각각 있는가"로만 판정한다(한쪽에 2명이어도 기절 없음).


// ---- 세트 R(대미 장식): 잡기 → 제압 → 공중 캐리 → 착지 충격 시퀀스 ----
// 버그 수정(전면 재구현): 예전엔 즉발 데미지 하나뿐이었다 - 실제로 대상을
// 붙잡지도, 들어올리지도, 함께 이동하지도 않았다. 이제 R을 자체 상태
// 머신(_sett.rSeq)으로 관리하고, update(dt)에서 매 프레임 진행시킨다
// (Master Yi 알파스트라이크와 동일하게 setTimeout 난발 대신 dt 누적 방식).
// 제압 상태는 새 CC 타입을 만들지 않고 기존 STUN을 그대로 재사용한다
// (isStunned()가 이미 더미의 반격/이동 등 모든 곳에서 확인되고 있음).



// 매 프레임 R 시퀀스를 진행시킨다. update(dt)에서 호출된다.



// 착지 충격(요청 11/12/13): 착지 지점 기준 실제 범위 판정(findEnemiesInRadius
// 재사용, 새 판정 안 만듦)으로 피해를 준다 - currentTarget 하나가 아니라
// 그 범위 안의 모든 유닛(다른 설치된 더미 포함)에게 적용된다.



// 요청 14/18: 정상 상태로 정확히 반환 - 제압 해제, 위치 제어권 반환,
// 세트 자신의 행동 잠금 해제. R 착지 이후 CC(둔화)는 _settRImpact에서
// 이미 걸어둔 상태이므로 여기서는 건드리지 않는다.





// ---------------- 모데카이저 ----------------






// W: 첫 사용 = 축적된 피해를 보호막으로 전환. 재시전(recastClips가 있을 때만
// _castW가 이 메서드 대신 재시전 분기를 타므로, 여기는 "첫 사용"만 담당).
// 버그 수정: 기존 공용 recastClips 분기는 재시전 판정을 canStartNewAction()
// (즉 currentActionKey/currentPhase가 전부 비어있는지)에 의존했는데,
// 모데카이저 W는 entryChain(여러 클립을 순서대로 강제 재생)이 딸려 있어
// 그 애니메이션 체인이 끝나지 않거나 clip을 못 찾으면 currentActionKey가
// 계속 남아있게 되고, 그러면 재시전 분기가 "canStartNewAction()===false"에
// 걸려 영원히 트리거되지 않는다(재시전을 눌러도 처음부터 다시 시전되는
// 것처럼 보임). 게임플레이 판정(보호막이 떠 있는가?)을 애니메이션 상태와
// 완전히 분리해서, 시간 기반 플래그(_morde.wShieldActiveUntil) 하나로만
// 재시전 여부를 결정한다 - 애니메이션은 있으면 재생하고 없어도 무관하다.




// W 재시전: 남은 보호막의 일정 비율만큼 체력 회복 후 보호막 제거.




// R(죽음의 세계) - 명세 1/7/8/20~28절: R은 단발성 스탯 훔치기 스킬이
// 아니라 "대상을 확정하고, 지속시간 동안 독립된 결투 상태를 유지하다가,
// 대상/자신의 사망 또는 지속시간 만료 중 먼저 오는 조건에 정확히 한 번
// 종료되는" 상태 머신이어야 한다. 예전에는 스탯 훔치기(장갑/마저)만
// 구현돼 있었고, 그마저도 단일 setTimeout(r.duration) 하나로만 되돌려서
// 대상이 지속시간 전에 죽거나 모데카이저 자신이 죽어도 그 타이머가 그대로
// 남아있었다(문서 15/16절 "대상/자신 사망 시 즉시 종료" 위반, 21절
// "중복 modifier 방지"도 재시전 방지 장치가 전혀 없어 이론상 깨질 수
// 있었다). 이제 _morde.isInDeathRealm을 단일 진실 공급원으로 삼아
// _mordeUpdateR(dt, 매 프레임 tick)와 _die()가 동일한 종료 함수
// _mordeEndDeathRealm()을 공유하도록 정리한다.


// R 종료 - 지속시간 만료/대상 사망/모데카이저 자신 사망 중 어느 경로로
// 들어오든 이 함수 하나가 정리를 전담한다(명세 22절 "일반 아이템/룬/기본
// 스탯을 잘못 제거하지 마라" - bonusArmor/bonusMr에 정확히 저장해뒀던
// stolenArmor/stolenMr 값만 되돌리고 그 외 필드는 손대지 않는다). 이미
// 종료된 상태에서 또 호출되어도(예: 대상 사망과 지속시간 만료가 같은
// 프레임에 겹치는 경우) isInDeathRealm 가드 덕분에 중복 실행되지 않는다.


// 매 프레임 tick(세트 R의 _settUpdateR(dt)와 동일한 패턴) - 지속시간 만료와
// 대상 사망을 여기서 감지한다(명세 14/15/17절). 모데카이저 자신의 사망은
// _die()에서 별도로 즉시 처리한다(명세 16절 - 프레임을 기다리지 않고
// 그 자리에서 바로 종료).



// ---------------- 마스터 이 ----------------
// 패시브(2연속 공격): 4번째 기본 공격마다 즉시 추가 타격(치명타 적용 가능,
// 적중 시 효과도 발동)이 나간다. 또한 기본 공격마다 Q 쿨다운을 1초 감소.


// GLB에 실제 masteryi_2013_passive.anm이 있으면(=data.passive.clips가
// 비어있지 않으면) 다음 평타 한 번의 애니메이션만 그 클립으로 바꾼다.
// 없는 GLB(폴백)라면 조용히 아무것도 하지 않고 기존 attack1/2 순환이
// 그대로 이어진다 - 콘솔 에러 없음(문서 섹션 4/17 "추측해서 대체 애니메이션을
// 만들지 않는다").


// R(최후의 전사) 기본 지속 효과: "챔피언 처치 관여 시 기본 스킬(Q/W/E) 남은
// 쿨다운 70% 감소" - R을 켜지 않았어도 항상 작동하는 상시 패시브다. R이
// 활성 상태일 때 처치하면 추가로 지속시간이 7초 늘어난다.
//
// 버그 수정(Q 쿨다운 비정상 감소 문서 BUG B): 이전에는 target을 전혀
// 받지 않아서 "누구를 처치했는가"를 확인할 방법이 없었다 - 그 결과 Q로
// 학습용 허수아비의 체력을 0 밑으로 떨어뜨리기만 해도(더미는 실제로는
// 안 죽고 2% 바닥에서 멈추지만, wouldKill 자체는 그 이전에 이미 true로
// 확정됨) 챔피언 처치 관여 취급을 받아 Q/W/E가 70% 감소해버렸다. 이제
// target을 받아 실제로 챔피언급 유닛인지 확인하고, 아니면(학습용
// 허수아비 등) 아무 것도 하지 않는다 - "Q라서 막는다"가 아니라 "처치
// 대상이 챔피언이 아니라서 막는다"가 정확한 규칙이다(일반 평타로
// 죽여도 마찬가지로 막혀야 한다).






/* ================================================================
   Alpha Strike (일격필살) - 상태 기반 구현
   ----------------------------------------------------------------
   상태: CAST -> TARGETING -> MARKING(최대 4타) -> REAPPEAR -> DONE
   매 프레임 update(dt) 안에서 _masteryiUpdateAlphaStrike(dt)로 진행된다
   (setTimeout 체인이 아니라 게임 tick 기반 - 요청 문서 1 섹션 5). 실제
   로직상 위치(this.root.position)는 각 타격 대상으로 즉시 이동시키고,
   화면 연출(잔상/참격)만 VFX로 따로 그려서 "로직 위치와 렌더링 위치를
   분리"한다(섹션 7).
   ================================================================ */




// 최초 대상(primaryTarget) 결정 - 이미 currentTarget이 사거리 안의 유효한
// 적이면 그것을, 아니면 사거리 안에서 가장 가까운 유효한 적을 찾는다.



// 추가 대상 탐색(섹션 3/4) - primaryTarget(또는 마지막 이동 지점) 주변에서
// 아직 맞지 않은 적을 거리순으로 우선 선택하고, 유효한 새 대상이 없으면
// (완전 랜덤이 아니라) 이미 맞은 대상 중 가장 가까운 쪽을 다시 선택한다 -
// "다른 대상이 없으면 같은 적을 연속 공격"(원작 그대로).






// 피해 계산 - 기본/치명타를 완전히 별도 함수로 분리(섹션 10/12). hitIndex
// 0(첫 타격/표식)은 100% 값, 1~3(추가 타격)은 ALPHA_STRIKE 반복 배율
// (extraHitPercent, 라이브 25%)이 적용된다.







// 온힛(섹션 13/14) - Q의 각 타격은 basicAttack()을 호출하지 않고 이 전용
// 의사-공격 경로로 On-Hit 소스와 연동된다. 이 데모에 실제로 구현된
// On-Hit 소스는 E(우주류 검술)의 고정 피해뿐이라 그것을 75% 계수로 적용한다
// - 아이템 On-Hit(Kraken Slayer 등)이 나중에 추가되면 이 함수 한 곳만
// 확장하면 된다.



// 한 번의 타격을 실제로 적용한다. delayApply가 true면(첫 타격/표식만
// 해당) 즉시 데미지를 넣지 않고 alpha.markDamagePending에 함수로
// 저장해뒀다가 스킬 종료 시점(_masteryiFinishAlphaStrike)에 실행한다 -
// 기존에 문서화된 "표식 피해는 시전이 끝났을 때 들어간다" 규칙을 그대로
// 유지.
//
// 버그 수정(Q 쿨다운 비정상 감소 문서 BUG A/전체 원칙): 이 함수는
// _onBasicAttackHit()/_masteryiOnBasicAttackHit()를 그 어떤 경로로도
// 호출하지 않는다 - Q의 각 타격은 "4번의 기본 공격"이 아니라 "Q 전용
// 이벤트"다. 그래서 Q 타격 자체는 Q 쿨다운(basicAttackCdrSec)도, 패시브
// attackCount도 절대 건드리지 않는다(아래 콘솔 로그로 매 타격마다 Q CD/
// Passive Count가 실제로 변하지 않는 것을 바로 확인할 수 있다).



// 재등장 위치(재등장 알고리즘 문서 전체) - Q 종료 "직전"(여기, 스킬 종료
// 시점)에만 계산한다. 미리 몇 프레임 전에 계산해서 저장해두지 않는다
// (문서 섹션 18 "특히 최종 위치를 미리 몇 프레임 전에 계산해 저장해두지
// 마라"). 순서: 유효성 검사 -> 현재(최신) 위치 -> 추적 가능 거리 확인 ->
// 선택 방향 유무 -> 75(스케일 근사) 거리 -> 벽/맵 경계 보정 -> 최종 확정.



// Q 시전 시작(섹션 2) - 쿨다운/마나/행동 가능 여부를 확인하고 상태
// 머신을 초기화한다. 이 시점부터 finishAlphaStrike()가 끝날 때까지
// Q가 위치/행동을 전담하며, 일반 이동/전투 로직은(moveTo의 STARTUP/ACTIVE
// 가드, canStartNewAction 등 기존 인프라) 이 상태를 절대 덮어쓰지 않는다.



// Q 진행 중 E/R처럼 durationSec 기반 status로 관리되는 버프의 만료 시각을
// 뒤로 밀어준다(섹션 15/26) - "밀어주기" 방식: 시작 시각만 기록해두고,
// 실제로 미는 것은 Q가 끝나는 시점(_masteryiResumeBuffsAfterAlphaStrike)에
// 한 번에 처리한다. Q 진행 시간이 프레임마다 유동적이라 시작~종료 사이의
// 실제 경과 시간(performance.now() 기준)을 그대로 사용한다.



// Q 종료 시점에 호출 - Q가 진행되는 동안 흘러버린 시간만큼 E(masteryiE)/
// R(masteryiR_as, masteryiR_ms) 상태이상의 만료 시각과 R 관련 내부
// 타임스탬프(rActiveUntil, subStates.R)를 그대로 뒤로 밀어서 "Q 시전
// 시간만큼 E/R이 소모되지 않고 그대로 유지"되게 한다(섹션 15/19/26).



// 매 프레임 진행(섹션 5) - setTimeout 체인 대신 dt 누적으로 CAST ->
// MARKING(최대 4타) -> REAPPEAR 순서를 그대로 진행한다.



// 다음 타격 대상을 찾아 마킹하고, 로직상 위치를 그 대상 쪽으로 즉시
// 옮긴다(섹션 7 - 로직 위치는 순간 이동, 화면 연출은 잔상 VFX로 별도
// 처리). 대상이 전혀 없으면(전멸 등) 이번 스텝은 조용히 건너뛴다(피해
// 없음). 대상을 찾았는지 여부를 boolean으로 반환한다 - 호출부가 "주 대상
// 비대상 + 대체 대상 전무" 상황에서 Q를 조기 종료할지 판단하는 데 쓴다
// (재등장 알고리즘 문서 섹션 13).



// Q 종료(섹션 19, 모델 비가시화 문서 섹션 7/8/13) - 재등장 위치를 먼저
// 확정하고, 그 다음 위치를 실제로 옮기고, 그 다음에야 모델을 다시 보이게
// 한다("위치 확정 -> 모델 표시" 순서. 반대로 하면 한 프레임 동안 잘못된
// 위치에 모델이 나타날 수 있다). 그 뒤에야 비대상 해제/상태 복귀/대기
// 이동 재개 순서로 처리한다.



// 강제 취소(예: 사망/GLB 교체 등 예외 상황) - 진행 중이던 markDamagePending을
// 폐기하고 비대상 상태와 모델 가시성을 확실히 복구한다(모델 비가시화
// 문서 섹션 13/14 "예외 종료도 반드시 복구"). 정상 종료 경로
// (_masteryiFinishAlphaStrike)와 별개로, 상태가 꼬였을 때 안전하게
// 빠져나오기 위한 안전망이다.



// Q 진행 중 우클릭 방향 재지정(섹션 25, 재등장 알고리즘 문서 섹션 4~7) -
// 재등장 방향만 갱신하고, 일반 이동 명령(moveTo)은 실행하지 않는다.
// 여러 번 클릭해도 큐에 쌓지 않고 마지막 유효 입력만 남긴다(그냥
// 덮어쓰므로 자연히 "마지막 값"이 된다). canSelectExitDirection이 이미
// 잠긴 뒤(재등장 계산 시작 이후)의 입력은 무시한다.



// W(명상) 중에는 E(우주류 검술)/R(최후의 전사)의 남은 지속시간이 소모되지 않는다.
// 시작 시 남은 시간을 저장하고, W가 끝날 때 같은 양만큼 만료 시각을 뒤로 민다.

















// 버그 수정("W 명상 마나 감소 안 됨") - CHAMPION_DATA.masteryi.W.manaPercentMaxPerSec
// 필드가 정의만 돼 있고 실제로 읽는 코드가 어디에도 없었다(요청 문서
// 그대로 - "정확히 초당 비용이 감소하도록"). update(dt)에서 매 프레임
// 호출되며, frameCount가 아니라 dt(실제 경과 초)를 그대로 곱해서
// 차감하므로 FPS가 30/60/120 어느 쪽이든 초당 실제 소모량이 동일하다.
// mp -= (maxMp * manaPercentMaxPerSec/100) * dt 형태로 요청 그대로 구현.


// E = INSTANT_WEAPON_BUFF. 캐릭터 발동 애니메이션이 없고(문서 그대로),
// ACTION_STATE를 전혀 건드리지 않는다 - 지금 Idle이면 Idle 그대로, 이동
// 중이면 Run 그대로, 심지어 다른 스킬의 RECOVERY 구간 중이어도 그대로
// 유지된 채 상태 효과만 즉시 켜진다. 실제 강화는 _onBasicAttackHit()이
// hasStatus(this,'MASTERYI_E')를 확인해서 "같은 평타 애니메이션 + 다른
// 피해 계산"으로 처리한다(ANIMATION과 GAMEPLAY DAMAGE를 분리).





// ---------------- 초가스 ----------------
// "처치" 관련 효과(패시브 육식, R 포식 스택)를 모든 데미지 소스에서
// 공통으로 판정하기 위한 훅. wouldKill(=명중 직전 hp <= dmg)일 때 호출한다.








// 활성화 후 다음 3회 기본 공격에 실제로 붙는 가시 피해 - _onBasicAttackHit에서 호출.







// ---------------- 리 신 애니메이션 ----------------









// 리 신 E/R 모션 잠금: 애니메이션이 재생되는 동안 이동 입력을 받지 않는다.
// 모션 종료 시에만 일반 로코모션으로 복귀한다. 별도 메시지는 띄우지 않는다.



// ---------------- 리 신 ----------------
// 패시브(질풍격): Q/W/E/R 중 아무거나 사용하면 다음 2회 평타 공격속도
// +40%, 1타/2타에 각각 기력을 회복한다. 실제 지속시간이 아니라 "다음
// 2회 타격"으로 소모되는 버프라 duration은 안전장치용 상한(8초)만 두고,
// passiveHitsLeft 카운터로 실제 소모를 관리한다.




// Q 1타(음파): 직선 스킬샷. 적중 시 표식을 남기고 3초 안에 재시전 가능.


// W 1타(방호): 아군/와드에게 돌진 - 이 데모에는 아군이 없어 실제 돌진/보호막
// 대상이 없다(문서에 없는 수치를 만들어 넣지 않기 위해 셀프 캐스트로
// 대체하지 않음). 대신 재시전 창만 정상적으로 연다.


// E 1타(폭풍): 자기중심 범위 마법피해 + 시야. 적중한 대상 전부를 기억해뒀다가
// E 2타(무력화)에서 그 대상들에게만 둔화를 건다.


// R(용의 분노): 타겟 락 궁극기. 피해 + 넉백(실제 좌표 이동) + 에어본.
// 넉백 도중 다른 적과 충돌하는 추가 피해는 이 데모에 대상이 하나뿐이라
// 구현하지 않는다(섹션 18 "임의 판정 추가 금지").



// 활성 오버라이드 하나를 실제로 "소비"한다 - 클립 목록(시퀀스면 다음
// 인덱스 클립을 앞에 붙임) 확정, oneShot이면 잔여 사용 횟수 차감 후
// 0이 되면 등록 해제 + 애니메이션 전용 서브 상태(clearSubState)도 함께
// 정리한다. beatsCrit 분기와 일반 오버라이드 분기가 완전히 동일한 소비
// 로직을 쓰므로 한 곳으로 모았다(중복 제거).
CharacterController.prototype._consumeAttackOverride = function(override, handHint = null) {
    const overrideId = override.id;
    const key = `attackOverride:${override.id}`; // 'attack'으로 시작 -> _onActionRecoveryComplete가 콤보 재교전 로직을 그대로 적용
    let overrideClips = override.clips;
    if (override.sequenceClips && override.sequenceClips.length) {
      // 버그 수정(요청: "Q에는 패시브가 적용되지 않는다"의 연장선): 예전엔
      // useIndex 순서(항상 0번째→1번째)로만 클립을 뽑아서, 세트가 실제로
      // 오른손 차례일 때 Q를 써도 무조건 Spell1_A(왼손용으로 설계된 클립)가
      // 먼저 나갔다 - "실제 손"과 "재생되는 모션"이 어긋날 수 있었다.
      // handHint(호출부에서 미리 계산해온, 지금이 실제로 왼손/오른손 중
      // 어느 차례인지)가 있고 시퀀스가 정확히 2개(왼손용/오른손용)라면,
      // useIndex 진행 순서 대신 handHint에 맞는 클립을 직접 골라 애니메이션과
      // 손 라벨이 항상 일치하게 한다. handHint가 없는 다른 챔피언/스킬의
      // 오버라이드는 기존 useIndex 순서 그대로 동작한다(영향 없음).
      const labels = ATTACK_HAND_LABELS[this.championId];
      let seqName;
      if (handHint && labels && override.sequenceClips.length === labels.length) {
        const handIdx = labels.indexOf(handHint);
        seqName = override.sequenceClips[handIdx >= 0 ? handIdx : Math.min(override.useIndex, override.sequenceClips.length - 1)];
      } else {
        seqName = override.sequenceClips[Math.min(override.useIndex, override.sequenceClips.length - 1)];
      }
      overrideClips = [seqName, ...override.clips];
      override.useIndex++;
    }
    // 버그 수정(모션 타이밍 측정): cancelToMove/cancelToSpell이 빠져 있어 강화 평타(가렌 Q·다리우스 W 등)의
    // 후딜(공격속도 기준, 가렌 기본 약 1.2초) 동안 이동·스킬 입력이 대기열에만 쌓였다. 일반 평타와 같게 취소를 허용한다.
    const attackData = { clips: overrideClips, cancelable: true, cancelToMove: true, cancelToSpell: true };
    // 버그 수정(QA - "가렌 Q 강화 기본 공격 소비 시점"): 문서는 "Q 소모 =
    // 실제 HIT 성공 시점"이라고 명시하는데, 이 지점(_beginAttackSwing이
    // 스윙을 "시작"하는 순간)은 아직 HIT 판정 이전(Windup)이다 - 여기서
    // 바로 소모하면 사거리 이탈/대상 소멸로 실제로는 맞지 않은 스윙에도
    // 효과가 사라지는 버그가 된다. 세트 Q처럼 "스윙을 시작한 것 자체가
    // 소비 조건"인 다른 오버라이드는 기존과 동일하게 여기서 즉시 소모하고,
    // 가렌 Q는 예외로 두어 실제 소모를 _onBasicAttackHit()의 HIT 확정
    // 시점(_consumeAttackOverrideOnConfirmedHit, 아래)으로 미룬다 - 스윙이
    // 끝내 HIT에 도달하지 못하면(_onBasicAttackHit 자체가 호출되지 않음)
    // 애초에 깎지 않았으므로 되돌릴 필요 없이 자연히 다음 스윙에 다시 쓸 수
    // 있다.
    // 버그 수정(전투 시스템 보완 점검 - 가렌 Q와 완전히 동일한 패턴):
    // 다리우스 W(처단) 역시 champion_ability_database.js에 attackOverrideMode:
    // 'oneShot'/uses:1로 등록되는 "다음 평타 1회 강화"라서 가렌 Q와 똑같이
    // 스윙 시작 시점에 소모되면, Q/E/R로 스윙이 캔슬되거나(스킬이 평타를
    // 끊는 우선순위 규칙) 대상이 사거리를 벗어나 실제 HIT(_dariusWOnHit -
    // 추가 피해/슬로우/처치 시 쿨다운·마나 환급)가 한 번도 발동되지 못한
    // 채로 W가 허비된다 - 가렌 Q와 동일하게 소모를 HIT 확정 시점
    // (_consumeAttackOverrideOnConfirmedHit, 아래)으로 미룬다.
    const deferToConfirmedHit = (this.championId === 'garen' && overrideId === 'Q')
      || (this.championId === 'darius' && overrideId === 'W');
    if (override.oneShot && !deferToConfirmedHit) {
      override.usesRemaining -= 1;
      if (override.usesRemaining <= 0) {
        this.clearAttackOverride(override.id);
        // 오버라이드가 실제로 소진되는 이 시점에 애니메이션 전용 서브
        // 상태도 함께 꺼서 Run_Spell1이 소모 시점과 맞물려 사라지게 한다.
        this.clearSubState(override.id);
      }
    }
    return { overrideId, key, attackData };
};

// 가렌 Q/다리우스 W 공용 - 위 _consumeAttackOverride가 미뤄둔 소모를
// _onBasicAttackHit()이 실제 적중을 확정한 시점에 수행한다. 이 함수가
// 호출된다는 것 자체가 이번 스윙이 명중했다는 뜻이므로(미스/대상 소실
// 시에는 _onBasicAttackHit 자체가 호출되지 않는다), 한 번의 명중
// 이벤트당 정확히 한 번만 소모된다. 두 챔피언이 완전히 동일한 패턴이라
// (코드 정리) 오버라이드 id만 받는 공용 함수 하나로 합쳤다 - 호출부와
// 동작은 그대로다.
CharacterController.prototype._consumeAttackOverrideOnConfirmedHit = function(overrideId) {
    const override = this.attackOverrides.find((o) => o.id === overrideId);
    if (!override) return; // 이미 소모돼 등록 해제됐거나(이론상 도달 불가) 애초에 없음
    override.usesRemaining -= 1;
    if (override.usesRemaining <= 0) {
      this.clearAttackOverride(overrideId);
      this.clearSubState(overrideId);
    }
};

// 26차: 구조물(포탑·억제기·넥서스)을 친 평타의 강화 평타 처리. 예전엔 구조물 피해만 주고 적중 처리를 건너뛰어
// 가렌 Q·다리우스 W 강화 평타가 소모되지 않았다 - 포탑을 칠 때마다 계속 강화 평타 모션으로 나갔다.
// 원작(PC 위키): 가렌 Q 추가 피해는 포탑에도 들어가고, 다리우스 W도 대상이 "적·구조물"이다. 침묵·둔화·처치 환급은
// 구조물과 무관하므로 넣지 않는다.
CharacterController.prototype._onStructureBasicAttackHit = function(target, overrideId, applyFn) {
    if (!overrideId || !target) return;
    const cd = this._champData(); if (!cd) return;
    let bonus = 0;
    if (this.championId === 'garen' && overrideId === 'Q') {
      const q = cd.Q, lvl = Math.max(1, this.skillLevels.Q || 1);
      bonus = skillVal(q.damageByLevel, lvl) + q.adRatio * this.stats.attackDamage;
    } else if (this.championId === 'darius' && overrideId === 'W') {
      bonus = this.stats.attackDamage * skillVal(cd.W.bonusAdRatioByLevel, Math.max(1, this.skillLevels.W || 1));
    } else return;
    if (bonus > 0 && applyFn) applyFn(target, { rawDamage: bonus, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, armorPenPercent: this.armorPenPercent || 0, source: this });
    this._consumeAttackOverrideOnConfirmedHit(overrideId);
};

CharacterController.prototype._beginAttackSwing = function() {
    if (this.championId === 'renekton') return this._renektonBeginAttackSwing();
    // 마스터 이 명상 중 공격 입력 = W 즉시 종료 + E/R 지속시간 복구 + 즉시 평타.
    if (this.championId === 'masteryi' && this.currentActionKey === 'masteryiW') {
      this._clearActionTimers();
      this._masteryiEndMeditate('attack');
    }
    const target = this.currentTarget;
    if (!target || target.hp <= 0) { this.currentTarget = null; return; }
    // 버그 수정(원작 규칙): 침묵은 스킬만 막고 기본 공격은 막지 않는다(예전 기획안 8절의
    // "침묵 중 평타 불가"는 원작과 달라 제거).
    if (isCrowdControlled(this)) return; // 기절/속박 중에도 마찬가지
    const dirToTarget = new THREE.Vector3().subVectors(target.mesh.position, this.root.position);
    dirToTarget.y = 0; dirToTarget.normalize();

    // 치명타는 이 스윙을 시작하는 시점에 한 번만 굴리고, 그 결과를 그대로
    // RELEASE 콜백까지 들고 가서 투사체에 실어 보낸다(같은 공격 인스턴스의
    // 결과가 명중 시점에 바뀌지 않도록 - 요청 17). 이 willCrit은 오직 "이번
    // 스윙(1타)"의 치명타 여부다 - 마스터 이 패시브의 2타(즉시 보너스 타격,
    // _masteryiOnBasicAttackHit)는 별도로 자기 자신의 치명타를 독립적으로
    // 굴린다. 즉 1타/2타는 이미 서로 다른 주사위를 굴려 각자의 치명타 여부와
    // 피해량을 정확히 계산한다 - 여기서 바뀌는 것은 "어떤 애니메이션을
    // 보여주는가"뿐이다.
    const willCrit = this._rollBasicAttackCrit();
    const barrageSwing = this._itemBarrageSwing; this._itemBarrageSwing = null; // 40차: 폭격 개시(이번 스윙)
    // 요청(다리우스/노틸러스형): 치명타가 기본적으로 최우선("치명타는 이 큐와
    // 무관하게 최우선"), 그 다음이 활성 오버라이드 중 priority가 가장
    // 높은 것, 마지막이 평소의 attack1/2/3 콤보 순환이다. 단, 마스터 이
    // 패시브 4타처럼 beatsCrit:true로 등록된 오버라이드는 예외적으로 치명타
    // 애니메이션보다 먼저 소비된다(요청: "패시브 공격일 때는 크리티컬이어도
    // 패시브 애니메이션을 내보낸다") - 실제 피해 계산(willCrit)에는 전혀
    // 영향을 주지 않고 오직 재생되는 클립만 바뀐다. 오버라이드가 적용된
    // 스윙은 comboIndex를 건드리지 않는다(콤보는 그대로 유지된 채 중간에
    // 한 번 끼워넣어지는 개념).
    if (this.championId === 'nautilus') this._nautilusArmPassiveAnim(target);
    const override = this._pickAttackOverride();
    let key, attackData, overrideId = null, attackHand = null;
    // 버그 수정(요청: "세트 Q에는 패시브가 적용되지 않고 있다"): override를
    // 소비하는 두 분기(beatsCrit / 일반 override) 모두 지금까지
    // attackHand를 전혀 설정하지 않았다 - null로 남아있었다. 그 결과
    // Q로 강화된 평타(Spell1_A/B)가 실제로 왼손/오른손 중 어느 쪽
    // 차례였는지 알 수 없어서, 오른손 차례에 Q 강화 평타가 나가도
    // 패시브의 오른손 추가 피해(_settOnBasicAttackHit의 attackHand
    // ==='RIGHT' 분기)가 전혀 적용되지 않고 있었다. comboIndex는 override
    // 소비 시 건드리지 않는다는 기존 원칙(중간에 끼워넣는 개념)은 그대로
    // 유지하면서, "지금 이 자리가 원래 왼손/오른손 중 어느 차례였는지"만
    // 미리 계산해서 attackHand에 기록한다 - 실제 comboIndex 증가는 여전히
    // 일반 콤보 분기에서만 일어난다.
    const overrideAttackHand = (() => {
      const labels = ATTACK_HAND_LABELS[this.championId];
      if (!labels) return null;
      const idx = this.championId === 'sett'
        ? (this._settAttackStep % 2)
        : (this.comboIndex % getAttackSequenceNames(this.championId).length);
      return labels[idx] || null;
    })();
    // 요청 견고성 보강: 왼손/오른손처럼 엄격한 좌우 교대가 있는 챔피언은
    // 치명타가 터져도 별도의 'crit' 포즈로 바뀌면 안 된다(실제 LoL에서도
    // 치명타는 애니메이션이 아니라 피해 배율일 뿐 - 세트가 치명타를 내도
    // 여전히 왼손/오른손 펀치 그대로 나간다). 이 조건이 없으면 크리티컬
    // 확률이 0이 아닌 순간(예: 아이템 시스템이 나중에 추가되는 경우) 다시
    // 같은 버그(치명타 스윙이 comboIndex를 건너뛰어 좌우 순서가 밀림)가
    // 재발할 수 있다.
    // 버그 수정(가렌/다리우스를 ATTACK_SEQUENCE_OVERRIDES에 추가하면서 분리):
    // 예전엔 이 플래그를 "ATTACK_SEQUENCE_OVERRIDES에 등록됐는가"로만
    // 판단했다 - 그런데 그 테이블은 원래 "실제 존재하는 평타 클립 개수"만
    // 나타내는 용도였다. 가렌/다리우스를 그 테이블에 추가(평타 중복 재생
    // 버그 수정)하면서 그대로 뒀다면, 문서 3-2/5-2절이 요구하는 "치명타 시
    // 별도 Crit 포즈"까지 부작용으로 함께 꺼졌을 것이다. 이제
    // CRIT_PRESERVES_SEQUENCE(마스터 이/세트 전용)만 별도로 확인한다.
    const critBreaksSequence = !CRIT_PRESERVES_SEQUENCE.has(this.championId);
    if (override && override.beatsCrit) {
      ({ overrideId, key, attackData } = this._consumeAttackOverride(override, overrideAttackHand));
      attackHand = overrideAttackHand;
    } else if (willCrit && critBreaksSequence) {
      key = 'crit';
      attackData = this.actionData.crit;
    } else if (override) {
      ({ overrideId, key, attackData } = this._consumeAttackOverride(override, overrideAttackHand));
      attackHand = overrideAttackHand;
    } else {
      // 버그 수정(핵심): 예전엔 챔피언과 무관하게 무조건 3칸(attack1/2/3)을
      // 순환했다. 좌우 2종류 모션만 있는 챔피언(마스터 이/세트)에게 억지로
      // 3칸을 씌우면 순환 경계에서 같은 쪽이 두 번 연속 나왔다. 이제 실제
      // 존재하는 모션 개수(ATTACK_SEQUENCE_OVERRIDES)만큼만 순환한다.
      const seqNames = getAttackSequenceNames(this.championId);
      // 세트 패시브 "왼손 이후 2초 타임아웃"은 이제 매 프레임
      // _settPassiveTimeoutTick()에서도 관리되지만(요청 7 "업데이트 루프에서도
      // 확인"), 그 프레임과 이 스윙 사이에 아주 근소한 시간차가 있을 수
      // 있으므로 스윙 시작 직전에도 동일한 함수를 한 번 더 호출해 확정한다
      // - 조건식을 두 곳에 따로 적어 어긋나지 않도록 단일 함수만 재사용한다.
      this._settPassiveTimeoutTick();
      const idx = this.comboIndex % seqNames.length;
      key = seqNames[idx];
      attackData = this.actionData[key];
      // 사용자 확인: 원본 롤에서 Attack1a/1b/1c(그리고 강화판 Emp_A/B/C)는
      // "교체용 변형 클립"이 아니라 실제로 한 번의 평타를 이루는 3단
      // 연속 모션이다. 이전에 "매번 하나만 순환 재생"으로 바꿨던 건 잘못된
      // 판단이었다 - 다시 3단을 이어붙여 재생하는 방식으로 되돌린다.
      if (this.championId === 'nilah') {
        const empowered = this._nilahQActive();
        const nilahSequence = key === 'attack1'
          ? (empowered ? ['Attack1_Emp_A', 'Attack1_Emp_B', 'Attack1_Emp_C'] : ['Attack1a', 'Attack1b.anm', 'Attack1c'])
          : (key === 'attack2' ? (empowered ? ['Attack2_Emp_A', 'Attack2_Emp_B', 'Attack2_Emp_C'] : ['Attack2a', 'Attack2b.anm', 'Attack2c']) : null);
        const hasSequence = Array.isArray(nilahSequence) && nilahSequence.every(name => !!this.findAnimation(name));
        if (hasSequence) {
          const seqTiming = nilahSequence
            .map(name => this.findAnimation(name))
            .reduce((sum, clip) => sum + (clip?.duration || 0), 0);
          // 모션 수정("평타가 여전히 이상하다"): 애니메이션은 이제 3단
          // 전체(약 0.5~0.8초)를 재생하는데, 타격 판정 타이밍(startup/
          // recovery)은 여전히 첫 번째 클립 하나만 보고 계산된 예전 값을
          // 그대로 물려받고 있었다 - 그러면 실제로는 칼날이 1단(전체의
          // 1/3도 안 되는 지점)에서만 휘둘러졌을 때 이미 데미지가 터지고,
          // 그 뒤로도 2단/3단이 계속 재생되는 동안은 이미 다음 판정을
          // 기다리는 상태가 되어 애니메이션과 타격 체감이 어긋났다.
          // deriveActionTiming을 3단 전체 길이 기준으로 다시 호출해서
          // startup/recovery를 시퀀스 전체 비율에 맞게 재계산한다.
          const seqRatioTiming = deriveActionTiming({ duration: seqTiming }, { fireRatio: 0.45 });
          attackData = {
            ...attackData,
            animationSequenceClips: nilahSequence,
            clips: [nilahSequence[0]],
            sequenceNaturalDuration: seqTiming,
            startup: seqRatioTiming.startup,
            recovery: seqRatioTiming.recovery,
          };
        } else if (empowered) {
          const empKey = key === 'attack1' ? 'attack1Emp' : (key === 'attack2' ? 'attack2Emp' : null);
          if (empKey && this.actionData[empKey]) attackData = this.actionData[empKey];
        }
      }
      // 이 스윙이 실제로 "몇 번째 자리"인지(attackHand)를 여기서 단 한 번
      // 확정해서 끝까지 들고 간다(요청 7 "AttackInstance에 사용한 모션을
      // 기록") - 이후 온힛 로직(세트 패시브 등)이 별도로 손 상태를 다시
      // 추측/토글하지 않고 이 값을 그대로 쓴다(요청 10 "게임 로직 순서 ≠
      // 실제 애니메이션" 불일치 방지).
      const labels = ATTACK_HAND_LABELS[this.championId];
      if (labels) attackHand = labels[idx];
      this.comboIndex++;
    }

    // 버그 수정(요청): "오른손 공속이 8배"가 아니라 "공격 선딜레이(windup)가
    // 8분의 1로 감소"하는 것이었다. 예전엔 windup과 recovery를 전부 8로
    // 나눠서 스윙 전체 시간이 1/8이 됐는데, 실제로는 선딜레이만 줄어들고
    // recovery(후딜레이)는 왼손과 동일한 정상 값을 그대로 유지해야 한다.
    const baseInterval = getAttackInterval(this.stats);
    const baseWindup = Math.min(baseInterval, getWindupDuration(this.stats)); // 챔피언별 선딜%/보정치(PC 위키)
    const baseRecovery = Math.max(0, baseInterval - baseWindup);
    let windup = baseWindup;
    const recovery = baseRecovery; // 오른손이어도 recovery는 그대로 - 선딜레이만 줄어든다
    if (this.championId === 'sett' && attackHand === 'RIGHT') {
      const p = this._champData() && this._champData().passive;
      const mult = (p && p.rightHandAttackSpeedMultiplier) || 1;
      windup = baseWindup / mult;
    }
    const attackInterval = windup + recovery; // 이번 스윙의 실제 유효 시간(로그/timeScale 계산용)

    // 요청 21: 지정된 형식 그대로 콘솔 로그를 남긴다 - Q 강화 스윙인지
    // (overrideId==='Q') 여부에 따라 [SETT AA]/[SETT Q-AA] 접두어를 구분한다.
    if (this.championId === 'sett' && attackHand) {
      const tag = overrideId === 'Q' ? '[SETT Q-AA]' : '[SETT AA]';
      console.log(`${tag} HAND = ${attackHand}`);
      console.log(`${tag} ANIMATION = ${key}`);
      console.log(`${tag} ATTACK SPEED = ${attackHand === 'RIGHT' ? 'WINDUP × 1/8 (recovery 동일)' : 'NORMAL'}`);
    }

    // 가능하면 실제 GLB 애니메이션 길이를 windup+recovery(attackInterval)에
    // 맞춰 재생 속도(timeScale)를 보정해서, Release 시점이 시각적으로도
    // 자연스럽게 맞아떨어지도록 한다(요청 11 단서 조항).
    // 24차: 클립 전체를 간격에 맞추지 않고, 클립 안의 실제 타격 장면이 피해 시점(선딜 끝)에 오도록 재생 속도를 정한다
    // (attack_impact.js - 챔피언별로 실제 GLB 프레임을 렌더링해 확인한 측정 방식).
    // 강화 평타(가렌 Q·세트 Q·다리우스 W 등 스킬 클립으로 치는 평타)는 클립 구조가 일반 평타와 달라 타격 장면 측정이
    // 맞지 않는다 - 예전처럼 클립 전체를 공격 간격에 맞춘다.
    const clip = this.resolveClip(attackData.clips);
    const plainAttack = /^(attack|crit)/i.test(key) && !/override/i.test(key);
    let timeScale = !clip ? 1.0 : (plainAttack ? attackClipTimeScale(this, clip, windup, attackInterval)
      : THREE.MathUtils.clamp(clip.duration / attackInterval, 0.4, 3.0));
    // 25차: 준비/타격 두 클립으로 나뉜 평타(세트·벡스의 Attack1_Start → Attack1_Hit). _Hit 클립은 맞는 순간의 자세에서
    // 시작한다(실제 GLB 프레임 확인) - 예전엔 _Hit만 처음부터 재생해서 공격을 시작하자마자 이미 주먹·손을 뻗어 있었다.
    // 원작 구조대로 선딜 동안 _Start를 재생해 선딜 끝에 정확히 끝내고, 피해 순간(onFire)에 _Hit로 넘긴다.
    const startHit = plainAttack ? attackStartHitPair(this, clip) : null;
    let hitClip = null;
    if (startHit) {
      hitClip = startHit.hit;
      attackData = { ...attackData, clips: [startHit.start.name] };
      timeScale = THREE.MathUtils.clamp(startHit.start.duration / Math.max(1e-3, windup), 0.4, 3.0);
    }

    this.runAction(key, STATE.ATTACK, {
      faceDir: dirToTarget,
      startupOverride: windup,
      recoveryOverride: recovery,
      timeScaleOverride: timeScale,
      dataOverride: attackData,
      animationSequenceClips: attackData.animationSequenceClips || null,
      onFire: () => {
        if (hitClip) this.crossFadeToClip(hitClip, { loop: THREE.LoopOnce, clampWhenFinished: true, fade: 0.05, timeScale: attackHitClipTimeScale(this, windup) });
        // 죽음의 세계: 서로 다른 세계의 대상은 때릴 수 없다(스윙 도중 한쪽이 들어가도 명중 취소).
        if (typeof canRealmInteract === 'function' && !canRealmInteract(this, target)) return;
        if (typeof brushSystem !== 'undefined') brushSystem.onActionFromBrush(this); // 부쉬 안에서 평타를 치면 잠깐 드러남
        const originPos = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.75, 0)).addScaledVector(dirToTarget, 0.35);
        // 32차: 와드는 기본 공격 1회에 체력 1(공격력·치명타·적중 시 효과 없음 - 원작). 원거리는 투사체가 닿을 때.
        if (target.isWard) {
          vfx.spawn('basicAttack', originPos, dirToTarget);
          if (isRangedAttacker(this)) projectiles.spawn({ from: originPos, target, speed: basicAttackMissileSpeedWorld(this), color: 0xdff0ff, realmId: this.realmId, onHit: (t) => wardSystem.hitWard(t, this) });
          else wardSystem.hitWard(target, this);
          return;
        }
        // 요네 패시브(사냥꾼의 길 - Steel and Spirit): 평타가 강철 검/아자카나의
        // 검을 번갈아 사용하며, 아자카나의 검 차례일 때만 물리 50%+마법 50%로
        // 나뉜다. 이번 스윙이 그 차례인지 먼저 확정하고(_yoneIsAzakanaSwing),
        // 실제 명중 처리 시점에 한 번만 다음 차례로 넘긴다(_yoneAdvanceSwordState) -
        // 온힛 판정과 무관하게 "스윙이 실제로 발생"할 때 토글해야 하므로 여기서.
        const yoneAzakana = this.championId === 'yone' && this._yoneIsAzakanaSwing();
        if (this.championId === 'yone') this._yoneAdvanceSwordState();
        // 애쉬 Q(궁사의 집중) 다발 공격: 최대 집중을 소모해 Q를 사용한 뒤
        // 나가는 "첫" 기본 공격은 평범한 단일 대상 공격이 아니라, 6발의
        // 화살로 갈라져 여러 대상에게 나뉘어 명중하는 다발 공격이다. 이
        // 스윙은 다중 대상이라 아래의 단일 대상 attackResult/투사체 경로와
        // _onBasicAttackHit()을 전혀 거치지 않고 완전히 분리된 전용 함수
        // (_asheFireFlurry)로 처리한다(요네 아자카나 분기와 동일한 위치의
        // "이번 스윙이 특수한가" 확인).
        // 버그 수정: 예전엔 Q 후 "첫 평타 1번"만 다발 공격이었다 - 원작은 Q 지속시간(6초) 동안의 모든
        // 평타가 다발 공격(첫 다발만 화살 1발 추가).
        if (this.championId === 'ashe' && this._ashe && performance.now() < (this._ashe.qActiveUntil || 0)) {
          const isFirst = !!this._ashe.flurryPending;
          this._ashe.flurryPending = false;
          vfx.spawn('basicAttack', originPos, dirToTarget);
          this._asheFireFlurry(target, originPos, dirToTarget, willCrit, isFirst);
          return;
        }
        const attackResult = {
          // 애쉬 서리 화살: 치명타는 추가 피해 없음(둔화만 강화), 대신 모든 평타가 치명타 확률 비례 추가 피해.
          rawDamage: this.championId === 'ashe' ? this.stats.attackDamage * this._asheBasicAttackDamageMultiplier() : this.stats.attackDamage,
          damageType: DAMAGE_TYPE.PHYSICAL,
          isCritical: this.championId === 'ashe' ? false : willCrit,
          critMultiplier: this.championId === 'ashe' ? 1 : this.stats.critMultiplier,
          armorPenPercent: this.armorPenPercent || 0,
          // 야스오 R 이후 15초: "치명타" 공격만 추가 방어력 일부 무시(예전엔 치명타가 아니어도 적용).
          bonusArmorIgnorePercent: (this.championId === 'yasuo' && willCrit && this._yasuo.rArmorBuffUntil > performance.now()) ? this._champData().R.armorIgnoreBonusPercent : 0,
          yoneAzakana,
          isBasicAttack: true,
        };
        // 40차: 폭격 개시 - 강제 치명타는 치명타 피해 80%, 원래 치명타였으면 15% 추가 고정 피해(명중 시 따로 - _applyItemExtraTrue).
        if (barrageSwing && attackResult.isCritical) {
          if (barrageSwing.kind === 'forced') attackResult.critMultiplier = 1 + (attackResult.critMultiplier - 1) * barrageSwing.p.critDamageFactor;
          else attackResult.itemExtraTrue = attackResult.rawDamage * attackResult.critMultiplier * barrageSwing.p.onNaturalCritTruePercent;
        }
        vfx.spawn('basicAttack', originPos, dirToTarget);
        // 버그 수정: 지금까지 모든 챔피언의 평타가 예외 없이 물리 투사체를
        // 발사했다 - 근접 챔피언(가렌/다리우스/세트/모데카이저/마스터
        // 이/초가스/리 신 등 사거리 125~175 전부)도 킨드레드 같은 원거리
        // 챔피언과 똑같이 화살이 날아가는 것처럼 보였다. 사거리 300을
        // 기준으로 근접/원거리를 나눠서, 근접은 투사체 이동 없이 그 자리에서
        // 즉시 명중 처리한다(실제 LoL도 근접 평타는 판정이 즉시 발생한다).
        // 새 데이터를 추가하지 않고 이미 있는 stats.attackRange 하나로만
        // 판단한다.
        const isRangedAutoAttack = isRangedAttacker(this);
        if (isRangedAutoAttack) {
          projectiles.spawn({
            from: originPos, target, speed: basicAttackMissileSpeedWorld(this),
            color: willCrit ? 0xffdf6b : 0xdff0ff,
            realmId: this.realmId, // Phase 2 요청 17 - 발사 시점 realm 스냅샷(모데카이저 R 등으로 비행 중 target의 realm이 바뀌면 명중 취소)
            onHit: (t) => {
              // 요청(칼바람 포탑 - 평타로 공격 가능해야 함): 포탑은 세트
              // 패시브/평타 콤보/치명타 처리와 완전히 무관한 별도 구조물이라
              // (요청 문서 11절) 일반 챔피언/더미 피해 경로(applyDamage +
              // _onBasicAttackHit)로 보내지 않고 전용 함수로 분리한다 -
              // applyDamageToTurret()이 방패/이중갑옷/요새화를 전부 처리한다.
              if (t.isTurret) { applyDamageToTurret(t, attackResult, { isRanged: true, source: this }); this._onStructureBasicAttackHit(t, overrideId, (u, r) => applyDamageToTurret(u, r, { isRanged: true, source: this })); return; }
              if (hasStatus(t, 'NILAH_W_DODGE')) { console.log('[NILAH W] 기본 공격 회피'); return; }
              if (t.isMinion) {
                const wouldKill = t.hp > 0 && t.hp <= calculateDamage({ ...attackResult, target: t });
                applyDamageToMinion(t, attackResult, true);
                this._onBasicAttackHit(t, overrideId, wouldKill, attackHand, willCrit);
                return;
              }
              if (t.isInhibitor) { applyDamageToInhibitor(t, attackResult); this._onStructureBasicAttackHit(t, overrideId, applyDamageToInhibitor); return; }
              if (t.isNexus) { applyDamageToNexus(t, attackResult); this._onStructureBasicAttackHit(t, overrideId, applyDamageToNexus); return; }
              const hpB = t.hp, flB = isFlooredTrainingDummy(t); const dealtR = (applyDamage(t, attackResult) || 0) + this._applyItemExtraTrue(t, attackResult);
              const wouldKill = !flB && hpB > 0 && hpB <= dealtR; // 실제 입힌 피해(방어력·치명타 반영) 기준 처치 판정
              this._onBasicAttackHit(t, overrideId, wouldKill, null, willCrit);
            },
          });
        } else if (target.hp > 0) {
          if (target.isTurret) {
            const ranged = isRangedAttacker(this);
            applyDamageToTurret(target, attackResult, { isRanged: ranged, source: this });
            this._onStructureBasicAttackHit(target, overrideId, (u, r) => applyDamageToTurret(u, r, { isRanged: ranged, source: this }));
            return;
          }
          if (hasStatus(target, 'NILAH_W_DODGE')) { console.log('[NILAH W] 기본 공격 회피'); return; }
          if (target.isMinion) {
            const wouldKill = target.hp > 0 && target.hp <= calculateDamage({ ...attackResult, target });
            applyDamageToMinion(target, attackResult, true);
            this._onBasicAttackHit(target, overrideId, wouldKill, attackHand, willCrit);
            return;
          }
          if (target.isInhibitor) { applyDamageToInhibitor(target, attackResult); this._onStructureBasicAttackHit(target, overrideId, applyDamageToInhibitor); return; }
          if (target.isNexus) { applyDamageToNexus(target, attackResult); this._onStructureBasicAttackHit(target, overrideId, applyDamageToNexus); return; }
          // 처치 판정(버그 수정): 예전엔 방어력·치명타 적용 "전" 원본 공격력으로 판정해, 방어력이 높으면
          // 처치가 아닌데도 처치로, 치명타로 처치했는데도 처치 아님으로 판정됐다. 실제 피해 기준으로 바꿈.
          const hpBeforeAA = target.hp, flooredAA = isFlooredTrainingDummy(target);
          if (attackResult.yoneAzakana) {
            const dealtAz = this._yoneApplyAlternatingAttackDamage(target, attackResult) || 0;
            const wouldKill = !flooredAA && hpBeforeAA > 0 && hpBeforeAA <= dealtAz;
            this._onBasicAttackHit(target, overrideId, wouldKill, attackHand, willCrit);
          } else {
            const dealtAA = (applyDamage(target, attackResult) || 0) + this._applyItemExtraTrue(target, attackResult);
            const wouldKill = !flooredAA && hpBeforeAA > 0 && hpBeforeAA <= (dealtAA || 0);
            // 요네 정신체(E) 중에는 강철 검(일반) 평타 피해도 표식에 쌓인다 - 예전엔 아자카나
            // 평타만 기록돼 일반 평타 피해가 표식에서 빠졌다.
            if (this.championId === 'yone') this._yoneRecordMark(target, dealtAA || 0);
            this._onBasicAttackHit(target, overrideId, wouldKill, attackHand, willCrit);
          }
        }
      },
    });
};

/* ---------------- 레넥톤 ---------------- */







































CharacterController.prototype.consumeHoneyFruit = function() {
    if (this.championId !== 'renekton') return 0;
    return this._renektonGainRage(5);
};
/* ---------------- cooldown / mana ---------------- */
CharacterController.prototype.updateCooldowns = function(dt) {
    for (const k of Object.keys(this.cooldowns)) if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    updateSkillUI(this.cooldowns);
};
CharacterController.prototype.regen = function(dt) {
    // 버그 수정(전 챔피언 공통 - 닐라 실제 bin 데이터로 발견): hpRegen/mpRegen은
    // 리그 오브 레전드 표준 표기 그대로 "5초당" 수치로 저장되어 있는데
    // (닐라 실제 bin의 baseStaticHPRegenModifiable=1.2(초당)*5=6.0이 코드의
    // hpRegen:6과 정확히 일치해서 확인됨), 여기서는 그 값을 dt(초)에 그대로
    // 곱해서 실제로는 5배 더 빠르게 재생되고 있었다.
    // 아이템 패시브(요정의 부적/원기 회복의 구슬) - 기본 재생량에 곱해지는
    // 퍼센트 보너스. 기존 hpRegen/mpRegen 자체는 건드리지 않고(레벨업 시
    // computeChampionStats()가 다시 계산하는 기준값) 여기서만 곱한다.
    const mpRegenMult = 1 + (this.itemBonusMpRegenPercent || 0);
    // 정령의형상(무한한 활력) 증폭 + 그리버스 감소 - getHealReceivedMultiplier()
    // 공용 헬퍼 하나로 묶었다(챔피언 전용 회복 스킬들도 전부 이 헬퍼를 쓴다 -
    // 01_status_effect_system.js 참고). 전 챔피언 공통 기본 체력 재생이
    // 가장 핵심적인 회복 경로라 여기 연결한 게 가장 크다.
    const hpRegenMult = (1 + (this.itemBonusHpRegenPercent || 0)) * getHealReceivedMultiplier(this);
    this.mp = Math.min(this.maxMp, this.mp + dt * (this.mpRegen != null ? this.mpRegen : 4) * mpRegenMult / 5);
    if (this.hp > 0 && this.state !== STATE.DEAD) this.hp = Math.min(this.maxHp, this.hp + dt * (this.hpRegen || 0) * hpRegenMult / 5);
    updateBars(this);
};
