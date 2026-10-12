/* ============================================================
   바루스(Varus) 전투 로직
   ------------------------------------------------------------
   다른 챔피언들(이즈리얼/아리 등)과 동일한 패턴 - CharacterController.
   prototype 확장으로 챔피언 전용 메서드를 분리하고, character_controller.js
   의 _dispatchCast/castAbility/_onBasicAttackHit/moveTo/_die()/update()
   최상단·해당 지점에서 championId === 'varus'면 이 파일의 커스텀 함수로
   위임한다(공용 Controller 코드를 직접 뒤섞지 않는다는 이 프로젝트의
   원칙 그대로).

   참고: CHAMPION_DATA.varus(champion_data.js)는 사용자가 제공한 실제
   게임 데이터 파일(varus.bin/varus.bin.json)로 검증한 수치다 - 데이터
   해석 방식(배열 인덱싱 규칙 등)은 그 파일 상단 주석 참고. 이 세션은
   네트워크 정책상 실시간 위키 대조가 불가능했다(이즈리얼 최초 버전과
   동일한 제약 - champion_data.js 상단 주석 참고).

   구현 범위상 단순화한 부분(전부 데이터를 지어내지 않고 명시적으로
   근사한 것 - 섹션 3/18 원칙):
   - Q 충전 중 조준 방향은 충전을 시작한 순간에 고정된다(다른 스킬샷들도
     캐스트 중 마우스를 계속 추적하지 않는 이 프로젝트의 기존 관례를
     그대로 따름 - 이동 자체는 실시간으로 가능하다).
   - E(화살비)가 만드는 "저주받은 땅"은 지속되는 별도 지면 오브젝트가
     아니라, 착탄 시점에 범위 안에 있던 대상에게 슬로우/고통스러운 상처를
     즉시 그 지속시간만큼 건다(이 프로젝트에 모데카이저 죽음의 세계 같은
     전용 지속 지면 시스템이 없는 챔피언들과 동일한 근사 - Chogath/
     Mordekaiser의 지점형 스킬과 같은 수준).
   - "고통스러운 상처"(GRIEVOUS - 자가 회복/재생 약화)는 상태이상으로는
     정확히 걸리지만, 이 프로젝트에 챔피언 간 회복량을 실제로 깎는 공용
     applyHeal() 진입점이 없어(각 챔피언이 각자 회복 로직을 직접 계산)
     아직 실제로 회복량을 줄이는 곳은 없다(01_status_effect_system.js의
     getGrievousPercent 주석 참고 - 새 회복 파이프라인을 지어내지 않는다).
   - 패시브(살아있는 복수)의 AP 전환분(AStoAPChampion/Minion)은 이 데모에
     주문력 아이템 시스템이 없어(항상 abilityPower=0) 다른 챔피언들과
     동일한 원칙대로 실제 로직을 추가하지 않았다 - AD 전환분만 반영한다.
   ============================================================ */

// 오한(Blight) 표식을 갱신한다 - 최대 3중첩, 중첩마다 지속시간(6초) 갱신.
CharacterController.prototype._varusApplyBlight = function(target) {
  if (!target) return;
  const w = this._champData().W;
  const cur = getStatus(target, 'varusBlight');
  const stacks = Math.min(w.maxStacks || 3, (cur && cur.stacks || 0) + 1);
  const rec = applyStatus(target, { id: 'varusBlight', type: 'BLIGHT', duration: w.stackDuration || 6, value: 0, source: this });
  if (rec) rec.stacks = stacks;
};

// 오한 표식을 터뜨린다. Q/E/R이 명중시키거나 W를 직접 눌렀을 때 호출된다.
// viaQ면 잃은 체력 비례 추가 마법 피해 + 충전량에 비례한 추가 재사용
// 대기시간 감소가 함께 붙는다(bin VarusWMaxChargeHPDamage/
// CDRPerBlightStack + cdrMaxBonusPercentFromCharge). 실제로 터뜨린
// 경우에만 true를 반환한다(표식이 없으면 아무 일도 일어나지 않음).
CharacterController.prototype._varusDetonateBlight = function(target, { viaQ = false, chargeFraction = 0 } = {}) {
  if (!target || target.hp <= 0) return false;
  const rec = getStatus(target, 'varusBlight');
  const stacks = rec ? Math.min(3, rec.stacks || 0) : 0;
  if (stacks <= 0) return false;
  const w = this._champData().W;
  const wLvl = Math.max(1, this.skillLevels.W || 1);
  const targetMaxHp = (target.maxHp != null ? target.maxHp : (target.stats && target.stats.maxHp)) || 0;
  // 중첩당 대상 최대 체력 3~5%(+주문력 100당 1.3%). Q로 터뜨리면 충전량에 따라 최대 50% 증가(PC 위키).
  // 버그 수정: 예전엔 Q로 터뜨릴 때마다 잃은 체력 비례 피해를 더했다 - 그건 W를 "사용"한 뒤의 다음 Q 효과다.
  const perStackPercent = skillVal(w.detonatePercentMaxHpByLevel, wLvl) + 1.3 * ((this.stats.abilityPower || 0) / 100);
  let raw = (perStackPercent / 100) * stacks * targetMaxHp;
  if (viaQ) raw *= 1 + ((w.qConsumeMaxChargeMultiplier || 1.5) - 1) * chargeFraction;
  applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
  vfx.spawn('hit', getWorldPosition(target)?.clone() || target.mesh.position.clone(), undefined, { color: 0x8fd6ff });
  debugSkillHit('Varus W (오한 소모)', target, { stacks, viaQ });
  clearStatus(target, 'varusBlight');

  let cdrPercent = (w.cdrPerStackPercent || 13) * stacks;
  if (viaQ) cdrPercent *= 1 + ((w.cdrMaxBonusPercentFromCharge || 0) / 100) * chargeFraction;
  cdrPercent = Math.min(100, cdrPercent);
  if (cdrPercent > 0) {
    const cd = this._champData();
    for (const slot of ['Q', 'E', 'R']) {
      if (!(this.cooldowns[slot] > 0)) continue;
      const lvl = Math.max(1, this.skillLevels[slot] || 1);
      const fullCd = cd[slot] && cd[slot].cooldown != null ? skillVal(cd[slot].cooldown, lvl) : 0;
      this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - fullCd * (cdrPercent / 100));
    }
    updateBars(this);
  }
  return true;
};

// 기본 공격 명중 공통 훅(_onBasicAttackHit) - 패시브(살아있는 복수) 램프
// 갱신 + W(오한의 화살통) 추가 마법 피해/오한 적용. W는 스킬 포인트를
// 투자해야만(bin VarusWOnHitDamage의 랭크0 sentinel=-1) 발동한다.
CharacterController.prototype._varusOnBasicAttackHit = function(target) {
  if (!target) return;
  if ((this.skillLevels.W || 0) >= 1) {
    const w = this._champData().W;
    const wLvl = Math.max(1, this.skillLevels.W);
    // 적중 시 추가 마법 피해: 4~40 + 주문력 25%(PC 위키 V26.12/V26.03).
    const raw = skillVal(w.onHitDamageByLevel, wLvl) + (w.onHitApRatio || 0) * (this.stats.abilityPower || 0);
    applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    vfx.spawn('hit', getWorldPosition(target)?.clone() || target.mesh.position.clone(), undefined, { color: 0x8fd6ff });
    this._varusApplyBlight(target);
  }
};

// 패시브(살아있는 복수): 유닛 처치 → 공속 10/15/20%, 챔피언 처치 관여 → 30%(지속 5/7/9/11초).
// 챔피언 관여로 얻은 강화 상태는 챔피언 관여로만 갱신된다(유닛 처치가 덮어쓰지 않음).
CharacterController.prototype._varusOnKill = function(target, isChampionTakedown) {
  if (this.championId !== 'varus') return;
  const p = this._champData().passive;
  const lv = this._varus.lv;
  const now = performance.now();
  const durMs = valueByBreakpoints(p.durationByLevel, this.champLevel) * 1000;
  if (isChampionTakedown) {
    lv.takedown = true; lv.asPercent = p.takedownAsPercent; lv.adRatio = p.takedownAdPerBonusAsPercent; lv.until = now + durMs;
  } else if (!(lv.takedown && now < lv.until)) {
    lv.takedown = false; lv.asPercent = valueByBreakpoints(p.killAsByLevel, this.champLevel); lv.adRatio = p.killAdPerBonusAsPercent; lv.until = now + durMs;
  }
  applyStatus(this, { id: 'varusLivingVengeance', type: 'AS_BUFF', duration: (lv.until - now) / 1000, value: lv.asPercent / 100 });
};

// 매 프레임: 강화 중이면 "추가 공격 속도(%)의 11%/33%"만큼 공격력(bonusAD).
CharacterController.prototype._varusLvTick = function(dt) {
  const lv = this._varus.lv;
  const now = performance.now();
  if (!lv.until || now >= lv.until) {
    if (lv.until) { lv.until = 0; lv.takedown = false; lv.asPercent = 0; lv.adRatio = 0; }
    if (this.bonusAD) this.bonusAD = 0;
    return;
  }
  const bonusAsPercent = ((this.stats.levelBonusAttackSpeed || 0) + (this.stats.bonusAttackSpeedPercent || 0)) * 100;
  this.bonusAD = Math.max(0, bonusAsPercent) * (lv.adRatio || 0);
};

// Q(꿰뚫는 화살): 홀드-충전 스킬샷. 이미 충전 중일 때 다시 호출되면(재입력
// = 원작의 릴리즈) _varusReleaseQ()로 위임한다 - 실제 진입 분기는
// castAbility()에 있다(character_controller.js, currentActionKey===
// 'varusQCharge' 검사). 여기는 "새로 충전을 시작하는" 경로만 담당한다.
CharacterController.prototype._varusCastQ = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (this._varus.qCharge) { this._varusReleaseQ(); return; }
  const q = this._champData().Q;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('Q', free)) return;
  // 원작: 충전 중에도 (20% 느려진 채) 움직인다 - 이동 중에 시작했으면 그 목적지로 계속 간다.
  const keepMove = (this.state === STATE.MOVE && this.targetPos && !this.isChasing) ? this.targetPos.clone() : null;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'varusQCharge'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);
  this._varus.qCharge = { dir: dir.clone(), startedAt: performance.now(), free, manaPaid: free ? 0 : skillVal(q.mana, Math.max(1, this.skillLevels.Q || 1)) };
  this.playFirstAvailable(['Spell1_Idle', 'Spell1'], { loop: THREE.LoopRepeat, fade: 0.05 });
  applyStatus(this, { id: 'varusQ_chargeSlow', type: 'SLOW', duration: q.maxHoldSec || 4, value: (q.chargeSelfSlowPercent || 20) / 100, source: this });
  if (keepMove) { this.targetPos = keepMove; this.setState(STATE.MOVE); }

  // PC 위키: 최대 4초까지 충전을 유지할 수 있고, 그 안에 발사하지 않으면 취소되며 마나 50%를 돌려받는다.
  // 버그 수정: 예전엔 충전 1.25초가 되면 자동 발사했다(원작에 없는 동작).
  const holdTimer = this._champTimeout(() => {
    if (this.currentActionKey !== 'varusQCharge' || !this._varus.qCharge) return;
    const charge = this._varus.qCharge; this._varus.qCharge = null;
    clearStatus(this, 'varusQ_chargeSlow');
    this.mp = Math.min(this.maxMp, this.mp + (charge.manaPaid || 0) * (q.holdTimeoutManaRefundPercent || 50) / 100);
    updateBars(this);
    this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false;
    if (this.state !== STATE.MOVE) this._resumeAfterAction();
  }, (q.maxHoldSec || 4) * 1000);
  this._actionTimers.push(holdTimer);
};

// 실제 발사 - 재입력(수동 릴리즈) 또는 최대 충전시간 도달(자동) 양쪽 모두
// 이 함수 하나로 들어온다. 충전 시간 비율(chargeFraction)에 따라 사거리는
// minRange~maxRange 사이로, 피해량은 minChargeDamageRatio~1.0 사이로 함께
// 늘어난다(bin ChargeMultiplierInverse=0.667을 "최소 충전 시 최대 충전
// 대비 66.7%"로 해석 - champion_data.js 상단 주석 참고).
CharacterController.prototype._varusReleaseQ = function() {
  const charge = this._varus.qCharge;
  if (!charge) return;
  this._varus.qCharge = null;
  clearStatus(this, 'varusQ_chargeSlow');
  const q = this._champData().Q;
  const dir = charge.dir;
  const heldMs = performance.now() - charge.startedAt;
  const chargeFraction = Math.max(0, Math.min(1, heldMs / ((q.chargeDuration || 1.25) * 1000))); // 피해·효과: 1.25초
  const rangeFraction = Math.max(0, Math.min(1, heldMs / ((q.rangeChargeDuration || 1.5) * 1000))); // 사거리: 1.5초(PC 위키)

  this._clearActionTimers();
  this.currentActionKey = 'varusQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;

  const lolRange = (q.minRange || 925) + ((q.maxRange || 1600) - (q.minRange || 925)) * rangeFraction;
  const chargeDamageMult = (q.minChargeDamageRatio || 0.667) + (1 - (q.minChargeDamageRatio || 0.667)) * chargeFraction;
  const halfWidth = lolRangeToWorld(q.width || 75) * 0.5;
  const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
  // 관통: 경로의 모든 적에게 피해, 맞힌 적마다 15%씩 감소(최소 33% - PC 위키 "적 수에 따라 0~67% 감소").
  const lineHits = findEnemiesInLine(this.root.position, dir, lolRange, q.width || 75)
    .map((u) => ({ u, d: getHorizontalDistance(getWorldPosition(u), this.root.position) }))
    .sort((a, b) => a.d - b.d);
  const hitUnit = lineHits.length ? lineHits[0].u : null;
  const worldRange = lolRangeToWorld(lolRange);
  let impactDistance = worldRange;
  if (hitUnit) {
    const hitPos = getWorldPosition(hitUnit);
    if (hitPos) impactDistance = getHorizontalDistance(hitPos, this.root.position);
  }
  const targetPoint = origin.clone().addScaledVector(dir, worldRange);

  const lvl = Math.max(1, this.skillLevels.Q || 1);
  // 최대 피해 80~360 + 추가 AD 120%(PC 위키), 충전 0%면 2/3.
  const dmgMax = skillVal(q.damageMaxByLevel, lvl) + (q.bonusAdRatioMax || 0) * this._getBonusAD();
  const raw = dmgMax * chargeDamageMult;
  const empowered = !!this._varus.wEmpowerQ;
  this._varus.wEmpowerQ = false;
  const w = this._champData().W;
  const wLvl = Math.max(1, this.skillLevels.W || 1);
  const resolveHit = (t, index) => {
    if (!t || t.hp <= 0) return;
    const mult = Math.max(0.33, 1 - 0.15 * index);
    applyDamage(t, { rawDamage: raw * mult, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
    if (empowered && t.hp > 0) {
      const tMax = (t.maxHp != null ? t.maxHp : (t.stats && t.stats.maxHp)) || 0;
      const missing = Math.max(0, tMax - t.hp);
      const pct = skillVal(w.qConsumeMissingHpPercentByLevel, wLvl) * (1 + ((w.qConsumeMaxChargeMultiplier || 1.5) - 1) * chargeFraction);
      applyDamage(t, { rawDamage: missing * pct / 100, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    }
    vfx.spawn('hit', getWorldPosition(t)?.clone() || t.mesh.position.clone(), undefined, { color: 0x8fd6ff });
    debugSkillHit('Varus Q', t, { chargeFraction: chargeFraction.toFixed(2), index, mult });
    this._varusDetonateBlight(t, { viaQ: true, chargeFraction });
  };
  const speedWorld = lolRangeToWorld(q.missileSpeed || 1500);
  lineHits.slice(1).forEach((h, k) => {
    const t = this._champTimeout(() => resolveHit(h.u, k + 1), (h.d / Math.max(1e-6, speedWorld)) * 1000);
    void t; // 발사된 화살은 바루스가 다른 행동을 해도 계속 날아가므로 _actionTimers에 넣지 않는다
  });

  projectiles.spawn({
    from: origin, target: hitUnit || null, targetPoint, speed: lolRangeToWorld(q.missileSpeed || 1500), damage: 0,
    color: 0x8fd6ff, realmId: this.realmId,
    onHit: (t) => {
      resolveHit(t, 0);
    },
  });
  if (!hitUnit) debugSkillMiss('Varus Q', `no target in line (충전 ${(chargeFraction * 100).toFixed(0)}%, 사거리 ${impactDistance.toFixed(1)})`);

  this.playFirstAvailable(['Spell1_Fire', 'Spell1'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const clip = this.findAnimation('Spell1_Fire') || this.findAnimation('Spell1');
  const dur = clip ? clip.duration : 0.35;
  const recTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'varusQ') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, dur * 1000);
  this._actionTimers.push(recTimer);
};

// W(오한의 화살통) - 능동 사용. 몸 애니메이션이 없는 순수 유틸 스킬이라
// (bin mAnimationName="") currentActionKey/현재 액션을 전혀 건드리지
// 않는다(가렌/모데카이저 W와 동일한 패턴 - 다른 어떤 행동 중에도 즉시
// 사용 가능). 사거리 내 오한이 남은 대상이 없으면 비용을 지불하지 않고
// 그대로 실패한다(빈 사용으로 40초 재사용 대기시간을 낭비하지 않음).
CharacterController.prototype._varusCastW = function(mouseWorldPoint, free = false) {
  if (isSilenced(this)) return;
  // 사용 효과(PC 위키): 다음 꿰뚫는 화살이 대상 잃은 체력의 6~14%(충전 시 최대 9~21%) 추가 마법 피해.
  // 버그 수정: 예전엔 W 사용이 "가까운 대상의 오한을 즉시 터뜨리기"로 구현돼 있었다(원작에 없는 효과).
  if (!this._payCost('W', free)) return;
  this._varus.wEmpowerQ = true;
  vfx.spawn('hit', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 1.2, 0)), undefined, { color: 0x8fd6ff });
  debugSkillHit('Varus W (다음 Q 강화)', this);
};

// E(화살비): 지정 지점 범위 공격. 착탄 시점에 범위 안의 적 전체에게 물리
// 피해 + 슬로우 + 고통스러운 상처(그리버스)를 건다(파일 상단 주석의
// "지속 지면 없이 착탄 시 즉시 적용" 단순화 참고). 다른 스킬처럼 명중
// 대상의 오한도 함께 터뜨린다(공식 설명 "바루스의 다른 스킬이 오한을
// 터뜨린다").
CharacterController.prototype._varusCastE = function(mouseWorldPoint, free = false) {
  if (isSilenced(this)) return;
  const e = this._champData().E;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  const rawDist = dir.length();
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('E', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'varusE'; this.currentPhase = 'STARTUP'; this.phaseCancelable = true;
  this.setState(STATE.E_CAST);

  const worldRange = lolRangeToWorld(e.range || 925);
  const dist = Math.min(rawDist || worldRange, worldRange);
  const targetPoint = this.root.position.clone().addScaledVector(dir, dist);

  this.playFirstAvailable(['Spell3'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const castTime = 0.242; // bin mCastTime(≈0.2419) - SKILL_TIMING_DATABASE.varus.E와 동일한 수치
  const fireTimer = this._champTimeout(() => {
    if (this.currentActionKey !== 'varusE') return;
    this.currentPhase = 'ACTIVE';
    vfx.spawn('hit', targetPoint.clone(), undefined, { color: 0xff9a4a });
    const lvl = Math.max(1, this.skillLevels.E || 1);
    const raw = skillVal(e.damageByLevel, lvl) + (e.bonusAdRatio || 0) * this._getBonusAD();
    const slowPct = skillVal(e.slowPercentByLevel, lvl) / 100;
    const worldRadius = lolRangeToWorld(e.radius || 300);
    let hitAny = false;
    for (const u of getAllEnemyUnits()) {
      if (!isInCircle(u, targetPoint, worldRadius)) continue;
      hitAny = true;
      applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
      applyStatus(u, { id: 'varusE_slow', type: 'SLOW', duration: e.zoneDuration || 4, value: slowPct, source: this });
      applyStatus(u, { id: 'varusE_grievous', type: 'GRIEVOUS', duration: e.grievousDuration || 0.5, value: (e.grievousPercent || 0) / 100, source: this });
      this._varusDetonateBlight(u, { viaQ: false, chargeFraction: 0 });
      vfx.spawn('hit', getWorldPosition(u)?.clone() || u.mesh.position.clone(), undefined, { color: 0xff9a4a });
      debugSkillHit('Varus E', u);
    }
    if (!hitAny) debugSkillMiss('Varus E', 'no target in area');
  }, castTime * 1000);
  this._actionTimers.push(fireTimer);

  const doneTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'varusE') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, (castTime + 0.15) * 1000);
  this._actionTimers.push(doneTimer);
};

// R(속박의 사슬): 직선 스킬샷. 처음 맞은 대상에게 마법 피해 + 속박, 이후
// 근처의 감염되지 않은 적 챔피언에게 일정 시간(spreadTimeWindow) 동안
// 주기적으로 퍼져나가며 동일하게 피해+속박을 건다(공식 설명 그대로 -
// 확산은 챔피언에게만 일어난다).
CharacterController.prototype._varusCastR = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const r = this._champData().R;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('R', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'varusR'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.R_CAST);
  this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });

  const castTime = 0.242; // bin mCastTime(≈0.2419) - SKILL_TIMING_DATABASE.varus.R와 동일한 수치
  const fireTimer = this._champTimeout(() => {
    if (this.currentActionKey !== 'varusR') return;
    this.currentPhase = 'ACTIVE';
    const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    const halfWidth = lolRangeToWorld(r.width || 450) * 0.5;
    const hitUnit = findFirstInLine(this.root.position, dir, r.range || 1300, halfWidth);
    const targetPoint = origin.clone().addScaledVector(dir, lolRangeToWorld(r.range || 1300));
    projectiles.spawn({
      from: origin, target: hitUnit || null, targetPoint, speed: lolRangeToWorld(r.missileSpeed || 1200), damage: 0,
      color: 0xb08cff, realmId: this.realmId,
      onHit: (t) => this._varusRHit(t, dir),
    });
    if (!hitUnit) debugSkillMiss('Varus R', 'no target in line');
  }, castTime * 1000);
  this._actionTimers.push(fireTimer);

  const doneTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'varusR') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, (castTime + 0.2) * 1000);
  this._actionTimers.push(doneTimer);
};

// R의 첫 명중 처리 + 확산 시작. 이후 spreadTimeWindow 동안 주기적으로
// (spreadTickInterval) 이미 감염된 대상들 주변 spreadRange 안의 아직
// 감염되지 않은 적 챔피언을 찾아 같은 피해/속박을 건다.
CharacterController.prototype._varusRHit = function(firstUnit, dir) {
  if (!firstUnit || firstUnit.hp <= 0) return;
  const r = this._champData().R;
  const lvl = Math.max(1, this.skillLevels.R || 1);
  const raw = skillVal(r.damageByLevel, lvl) + (r.apRatio || 0) * (this.stats.abilityPower || 0);
  const infected = new Set();
  const applyOne = (u) => {
    if (!u || u.hp <= 0 || infected.has(u)) return;
    infected.add(u);
    applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(u, { id: 'varusR_root', type: 'ROOT', duration: r.rootDuration || 2, value: 0, source: this });
    this._varusDetonateBlight(u, { viaQ: false, chargeFraction: 0 });
    vfx.spawn('hit', getWorldPosition(u)?.clone() || u.mesh.position.clone(), undefined, { color: 0xb08cff });
    debugSkillHit('Varus R', u);
  };
  applyOne(firstUnit);

  const spreadRangeWorld = lolRangeToWorld(r.spreadRange || 600);
  const tickMs = Math.max(50, (r.spreadTickInterval || 0.5) * 1000);
  const maxTicks = Math.max(1, Math.round((r.spreadTimeWindow || 1.75) / (r.spreadTickInterval || 0.5)));
  let ticks = 0;
  const spreadTimer = this._champInterval(() => {
    ticks++;
    let spreadHappened = false;
    for (const src of Array.from(infected)) {
      const srcPos = getWorldPosition(src);
      if (!srcPos) continue;
      for (const u of getAllEnemyUnits()) {
        if (infected.has(u) || u.hp <= 0) continue;
        if (u.isMinion || u.isTurret || u.isInhibitor || u.isNexus) continue; // 확산은 챔피언에게만
        if (getHorizontalDistance(getWorldPosition(u), srcPos) <= spreadRangeWorld) { applyOne(u); spreadHappened = true; }
      }
    }
    if (ticks >= maxTicks || !spreadHappened) clearInterval(spreadTimer);
  }, tickMs);
  // 확산은 다른 스킬을 써도 끊기지 않는다(원작). 예전엔 _actionTimers에 넣어 다음 시전의 _clearActionTimers()가 확산을 끊었다.
  // 챔피언 교체 때만 _champInterval이 정리한다.
  void spreadTimer;
};

// 챔피언 전용 매 프레임 훅 - character_controller.js update() 맨 끝에서
// 챔피언과 무관하게 항상 호출된다(_ezrealUpdate/_ahriUpdate와 동일한
// 위치/관례). 충전 중 하드 CC에 걸리면(원작은 완전 캔슬이지만, 이 엔진은
// "충전만 남고 아무것도 안 나가는" 고아 상태를 피하기 위해) 그 시점의
// 충전량으로 즉시 발사해 안전하게 정리한다.
CharacterController.prototype._varusUpdate = function(dt) {
  if (this.championId !== 'varus' || !this._varus) return;
  this._varusLvTick(dt);
  if (this._varus.qCharge && isCrowdControlled(this)) this._varusReleaseQ();
};
