// Extracted from CharacterController: _mordeOnDealtHit
// 패시브(암흑 탄생) 중첩 + W(불멸) 잠재 보호막 저장. dealt는 실제로 입힌 피해(방어 적용 후).
// PC 위키: 중첩은 "적 챔피언/대형 몬스터를 평타·기본 스킬로 맞힐 때마다" 1, 4초 지속(적중 시 갱신), 최대 3.
// 3중첩이면 오라 활성(중첩이 유지되는 동안). 버그 수정: 예전엔 미니언까지 중첩이 쌓였고 중첩이 만료되지 않아
// 한 번 3이 되면 이후 적중마다 오라가 켜졌다. 잠재 보호막은 "방어 적용 후 입힌 피해의 45%(챔피언 아닌 대상은
// 25% 효율)" - 예전엔 방어 적용 전 피해로 저장했고, 미니언에게도 챔피언 비율이 들어갔다.
CharacterController.prototype._mordeOnDealtHit = function(target, dealt, opts = {}) {
    const cd = this._champData();
    if (!cd || this.championId !== 'mordekaiser' || !target) return;
    const p = cd.passive;
    const now = performance.now();
    if (!opts.fromUltimate && (target.isChampion || target.isEpicMonster || target.isLargeMonster)) {
      if (now >= (this._morde.stacksExpireAt || 0)) this._morde.hitStacks = 0;
      this._morde.hitStacks = Math.min(p.hitsForAura, (this._morde.hitStacks || 0) + 1);
      this._morde.stacksExpireAt = now + (p.stackDuration || 4) * 1000;
      if (this._morde.hitStacks >= p.hitsForAura) {
        this._morde.auraExpiresAt = this._morde.stacksExpireAt;
        this._morde.auraCenter = target;
      }
    }
    const w = cd.W;
    const bankPercent = target.isChampion ? w.dealtDamageBankPercent : w.dealtDamageBankPercent * (w.nonChampionBankPercent / 100);
    const cap = this.maxHp * (w.maxShieldMaxHpPercent / 100);
    this._morde.dealtBank = Math.min(cap, (this._morde.dealtBank || 0) + Math.max(0, dealt || 0) * (bankPercent / 100));
};

// Extracted from CharacterController: _mordePassiveAuraTick
CharacterController.prototype._mordePassiveAuraTick = function(dt) { 
    const cd = this._champData();
    if (!cd || this.championId !== 'mordekaiser') return;
    const p = cd.passive;
    if (performance.now() >= this._morde.auraExpiresAt) return;
    this._morde._auraAccum = (this._morde._auraAccum || 0) + dt;
    const tick = p.auraTickSec || 1;
    // 대상 최대 체력 1%→5%(레벨 비례, 선형 보간 - 곡선 미공개).
    const lvT = Math.min(1, Math.max(0, (this.champLevel - 1) / 17));
    const hpPct = p.auraTargetMaxHpPercentAtLevel1 + (p.auraTargetMaxHpPercentAtLevel18 - p.auraTargetMaxHpPercentAtLevel1) * lvT;
    while (this._morde._auraAccum >= tick) {
      this._morde._auraAccum -= tick;
      const hits = findEnemiesInRadius(this.root.position, p.auraRange);
      for (const h of hits) {
        const dmgPerSec = p.auraDamagePerSec + p.auraApRatio * this.stats.abilityPower + (h.unit.maxHp || 0) * (hpPct / 100);
        applyDamage(h.unit, { rawDamage: dmgPerSec * tick, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent, source: this });
      }
    }
    // % 이동 속도 증가는 서로 더해진다(공용 규칙) - 예전 Math.max는 다른 버프와 겹치면 오라가 무시됐다.
    this.stats.percentMoveSpeedBonus += valueByBreakpoints(p.auraMoveSpeedByLevel, this.champLevel) / 100;
  
};

// Extracted from CharacterController: _mordeQOnCast
CharacterController.prototype._mordeQOnCast = function(origin, dir) { 
    const cd = this._champData(); if (!cd) return;
    const q = cd.Q;
    const lvl = Math.max(1, this.skillLevels.Q || 1);
    // 전방 판정(사거리 625) - 79차: 원작처럼 시작 폭 90에서 끝 폭 150으로 넓어지는 사다리꼴.
    const wStart = q.widthStart ?? (q.width || 150), wEnd = q.widthEnd ?? (q.width || 150);
    const qRange = lolRangeToWorld(q.range);
    const hits = findEnemiesInLine(origin, dir, q.range, Math.max(wStart, wEnd)).filter((unit) => {
      const p = getWorldPosition(unit);
      const dx = p.x - origin.x, dz = p.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      const lateral = Math.abs(dx * -dir.z + dz * dir.x);
      const t = Math.max(0, Math.min(1, along / Math.max(qRange, 1e-6)));
      return lateral <= lolRangeToWorld(wStart + (wEnd - wStart) * t) * 0.5 + getCollisionRadius(unit);
    }).map((unit) => ({ unit }));
    if (!hits.length) { debugSkillMiss('Mordekaiser Q', 'no target in impact area'); return; }
    const isSingle = hits.length === 1;
    // 챔피언 레벨(스킬 레벨과 별개) 보너스 고정 피해 - 10레벨부터 매
    // 레벨 +5, 18레벨에 45로 최대. base와 함께 더해서 단일 대상 배율에도
    // 같이 곱해지도록 한다(요청에서 준 "최대 마법피해"의 +67.5=45×1.5와
    // 정확히 일치하려면 반드시 배율 적용 전에 더해야 한다).
    const lb = q.levelBonusDamage;
    const levelBonus = (lb && this.champLevel >= lb.startLevel)
      ? Math.min(lb.maxLevel - lb.startLevel + 1, this.champLevel - lb.startLevel + 1) * lb.perLevel
      : 0;
    for (const h of hits) {
      let dmg = skillVal(q.damageByLevel, lvl) + q.bonusAdRatio * this._getBonusAD() + q.apRatio * this.stats.abilityPower + levelBonus;
      if (isSingle) dmg *= 1 + skillVal(q.singleTargetBonusPercentByLevel, lvl) / 100;
      const dealtQ = applyDamage(h.unit, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent, source: this }) || 0;
      this._mordeOnDealtHit(h.unit, dealtQ);
    }
    debugSkillHit('Mordekaiser Q', hits[0].unit, { count: hits.length, levelBonus });
  
};

// Extracted from CharacterController: _mordeCastW
CharacterController.prototype._mordeCastW = function(free) { 
    if (isSilenced(this)) return;
    if (isCrowdControlled(this)) return;
    const cd = this._champData(); const w = cd.W;
    const now = performance.now();
    if (now < (this._morde.wShieldActiveUntil || 0)) {
      // PC 위키(Template:Data_Mordekaiser/Indestructible): 첫 시전 0.5초 뒤부터 재시전 가능(예전엔 즉시 재시전 가능했다).
      if (now < (this._morde.wRecastReadyAt || 0)) return;
      // 재시전(2타): 남은 보호막을 즉시 회복으로 전환.
      this._mordeWOnRecast();
      this._morde.wShieldActiveUntil = 0;
      vfx.spawn('w', this.root.position.clone());
      // 요청: 모데카이저 W는 모션 없이 효과만 발동한다 - 캐릭터 애니메이션을
      // 재생하지 않는다(이펙트/게임로직은 그대로 유지).
      debugSkillHit('Mordekaiser W (재시전 - 회복)', this);
      return;
    }
    if (!this._payCost('W', free)) return;
    this._mordeWOnCast();
    this._morde.wShieldActiveUntil = now + w.shieldDecayDuration * 1000;
    this._morde.wRecastReadyAt = now + (w.recastMinDelaySec ?? 0.5) * 1000;
    vfx.spawn('w', this.root.position.clone());
    // 요청: 모데카이저 W는 모션 없이 효과만 발동한다 - 캐릭터 애니메이션을
    // 재생하지 않는다(보호막 전환 등 게임로직은 그대로 유지).
    debugSkillHit('Mordekaiser W (보호막 전환)', this);
  
};

// Extracted from CharacterController: _mordeWOnCast
CharacterController.prototype._mordeWOnCast = function() { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const banked = this._morde.dealtBank || 0;
    const shieldAmt = THREE.MathUtils.clamp(banked, this.maxHp * (w.minShieldMaxHpPercent / 100), this.maxHp * (w.maxShieldMaxHpPercent / 100)) * getShieldReceivedMultiplier(this);
    // 보호막 인스턴스: 4초에 걸쳐 0까지 선형 감소, 다른 보호막과 합산, W 몫은 인스턴스가 정확히 추적.
    // (예전엔 감소 틱이 this.shield를 덮어써 피해로 깎인 보호막이 되살아나고 다른 보호막을 지웠다.)
    addShield(this, 'mordeW', shieldAmt, w.shieldDecayDuration, { decay: true });
    this._morde.dealtBank = 0;
    this._morde.shieldStartAmount = shieldAmt;
  
};

// Extracted from CharacterController: _mordeWOnRecast
CharacterController.prototype._mordeWOnRecast = function() { 
    const cd = this._champData(); if (!cd) return;
    const w = cd.W;
    const lvl = Math.max(1, this.skillLevels.W || 1);
    const wPortion = removeShield(this, 'mordeW'); // W 보호막 남은 몫만 회복으로 전환(제거)
    const heal = wPortion * (skillVal(w.recastHealPercentByLevel, lvl) / 100);
    // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소) - 보호막을 체력으로
    // "전환"하는 것도 결과적으로는 체력 회복이라 적용 대상이다(보호막
    // 자체의 생성/소멸은 영향받지 않는다 - 전환된 "이후"의 체력 회복량만 달라진다).
    this.hp = Math.min(this.maxHp, this.hp + heal * getHealReceivedMultiplier(this));
    updateBars(this);
  
};

// Extracted from CharacterController: _mordeEOnCast
// 죽음의 손아귀 판정: 지정 지점(사거리 700 이내)에서 모데카이저 쪽으로 길이 800·폭 200 직사각형.
CharacterController.prototype._mordeEAreaHits = function(origin, dir, dist) {
    const e = this._champData().E;
    const lenWorld = lolRangeToWorld(e.areaLength || 800);
    const half = lolRangeToWorld(e.areaWidth || 200) * 0.5;
    const out = [];
    for (const u of getTargetableEnemyUnits()) {
      const p = getWorldPosition(u); if (!p) continue;
      const r = getCollisionRadius(u);
      const v = new THREE.Vector3(p.x - origin.x, 0, p.z - origin.z);
      const along = v.dot(dir);
      // 81차: PC 위키 사거리 "700 / 900" - 지정 사거리 700, 손아귀 끝은 지정 지점보다 200 더 나가 최대 900까지 닿는다.
      const far = dist + lolRangeToWorld(e.areaFarExtra || 0);
      if (along > far + r || along < far - lenWorld - r) continue;
      const lateral = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
      if (lateral <= half + r) out.push(u);
    }
    return out;
};

CharacterController.prototype._mordeEOnCast = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const e = cd.E;
    const lvl = Math.max(1, this.skillLevels.E || 1);
    if (!target || target.hp <= 0) { debugSkillMiss('Mordekaiser E', 'no target in range'); return; }
    const from = target.mesh.position.clone();
    const dir = new THREE.Vector3().subVectors(this.root.position, from); dir.y = 0;
    const gap = dir.length();
    // PC 위키: 250 유닛 끌어당김(모데카이저를 지나치지 않게 충돌 반경까지만). 예전엔 거리의 60%(120~250)로 근사했다.
    const pullDist = gap > 0.05 ? Math.min(lolRangeToWorld(e.pullDistance || 250), Math.max(0, gap - this.collisionRadius - getCollisionRadius(target))) : 0;
    if (gap > 0.05) dir.normalize();
    const to = from.clone().addScaledVector(dir, pullDist);
    target._pullState = { from, to, duration: 0.4, elapsed: 0 };
    const dmg = skillVal(e.damageByLevel, lvl) + e.apRatio * this.stats.abilityPower;
    const dealt = applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, magicPenPercent: this.magicPenPercent, source: this }) || 0;
    this._mordeOnDealtHit(target, dealt);
    debugSkillHit('Mordekaiser E', target);
};

// Extracted from CharacterController: _mordeROnHit
// 죽음의 세계(PC 위키 Realm of Death, V26.15 기준):
// - 대상 적 챔피언과 함께 7초 동안 죽음의 세계로 들어간다. 둘 다 제자리에 남고, 일반 맵 위에 반경 1200
//   경기장이 생긴다(경계 통과 불가). 바깥 유닛과는 서로 보거나 상호작용할 수 없고 위치만 보인다.
// - 대상의 현재 능력치 10%를 훔친다: 체력(최대 체력), 공격력, 주문력, 공격 속도, 방어력, 마법 저항.
//   모데카이저는 최대 체력을 얻을 때 현재 체력 비율을 유지한다. 대상 체력이 훔칠 양보다 적으면 1이 된다.
//   크기는 모데카이저 자신 크기의 +10%, 대상 자신 크기의 -10%로 약 0.25초 동안 바뀐다.
// - 둘 중 하나가 죽으면 일찍 끝난다. 대상이 안에서 죽으면 훔친 능력치를 대상이 부활할 때까지 유지한다.
CharacterController.prototype._mordeROnHit = function(target) { 
    const cd = this._champData(); if (!cd) return;
    const r = cd.R;
    // 재진입 방지(이미 죽음의 세계 안이면 새로 만들지 않는다 - 훔친 능력치가 두 번 쌓이지 않게).
    if (this._morde.isInDeathRealm) return;
    // 이전 R로 대상이 죽어 아직 들고 있던 능력치가 있으면 새 R 전에 정리한다(같은 능력치가 겹치지 않게).
    if (this._morde.rKept) this._mordeReleaseSteal('recast');
    const pct = (r.statStealPercent || 10) / 100;
    const tStats = target.stats || null; // 챔피언 컨트롤러면 stats, 허수아비면 자기 필드
    const read = (statKey, fieldKey) => (tStats && typeof tStats[statKey] === 'number') ? tStats[statKey] : (typeof target[fieldKey] === 'number' ? target[fieldKey] : 0);
    const targetAs = tStats ? getFinalAttackSpeed(tStats) : (target.attackSpeed || 0);
    const steal = {
      armor: read('armor', 'armor') * pct,
      mr: read('magicResist', 'magicResist') * pct,
      maxHp: (target.maxHp || 0) * pct,
      ad: read('attackDamage', 'attackDamage') * pct,
      ap: read('abilityPower', 'abilityPower') * pct,
      asFlat: targetAs * pct,
    };
    // 모데카이저가 얻는 공격 속도는 "고정 공속"이라 추가 공속 비율로 바꿔 넣는다(총 공속 = 기본 + 계수 × 추가).
    const myRatio = this.stats.attackSpeedRatio || this.stats.baseAttackSpeed || 0.625;
    steal.asBonus = steal.asFlat / myRatio;
    // 대상에게서 뺀다(허수아비는 자기 필드를 직접 깎는다 - 챔피언 대상이면 그쪽 bonus 필드).
    this._mordeApplyStealToTarget(target, steal, -1);
    const prevTargetHp = target.hp;
    target.maxHp = Math.max(1, (target.maxHp || 0) - steal.maxHp);
    target.hp = Math.max(1, Math.min(target.maxHp, (prevTargetHp || 0) - steal.maxHp));
    // 모데카이저에게 더한다(현재 체력 비율 유지).
    this._mordeApplyStealToSelf(steal, +1);
    this._morde.isInDeathRealm = true;
    this._morde.rTarget = target;
    this._morde.rEndsAt = performance.now() + r.duration * 1000;
    this._morde.rSteal = steal;
    this._morde.rStolenArmor = steal.armor; // 예전 필드 이름 호환(디버그 표시 등)
    this._morde.rStolenMr = steal.mr;
    // ---- 죽음의 세계(제자리 경기장) ----
    const realmId = `deathRealm_${++_mordeRealmCounter}`;
    const realm = createDeathRealm(realmId, this, target, r.range, r.realmRadius);
    this._morde.realmId = realmId;
    this.realmId = realmId;
    target.realmId = realmId;
    showDeathRealmBoundary(realm.center, realm.radius);
    activateDeathRealmAtmosphere();
    this._mordeGhostOutsiders();
    this._mordeStartSizeAnim(target, 1.1, 0.9);
    console.log('[MORDE R] Death Realm 진입', { target: unitLabel(target), durationSec: r.duration, realmId, steal });
};

// 대상 쪽 능력치 증감(sign=-1 훔침, +1 돌려줌). 최대 체력은 호출부가 따로 다룬다.
CharacterController.prototype._mordeApplyStealToTarget = function(target, steal, sign) {
    if (!target || !steal) return;
    if (target.stats && typeof target.recomputeStats === 'function') {
      // 챔피언 대상(이 데모에선 플레이어가 아닌 챔피언 컨트롤러가 없어 대비용)
      target.bonusArmor = (target.bonusArmor || 0) + sign * steal.armor;
      target.bonusMr = (target.bonusMr || 0) + sign * steal.mr;
      target.bonusAD = (target.bonusAD || 0) + sign * steal.ad;
      target.bonusAP = (target.bonusAP || 0) + sign * steal.ap;
      target.recomputeStats();
      return;
    }
    if (typeof target.armor === 'number') target.armor += sign * steal.armor;
    if (typeof target.magicResist === 'number') target.magicResist += sign * steal.mr;
    if (typeof target.attackDamage === 'number') target.attackDamage += sign * steal.ad;
    if (typeof target.abilityPower === 'number') target.abilityPower += sign * steal.ap;
    if (typeof target.attackSpeed === 'number') target.attackSpeed = Math.max(0.01, target.attackSpeed + sign * steal.asFlat);
};

// 모데카이저 쪽 능력치 증감. 최대 체력이 바뀌어도 현재 체력 비율을 유지한다(PC 위키).
CharacterController.prototype._mordeApplyStealToSelf = function(steal, sign) {
    if (!steal) return;
    const hpPct = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.bonusArmor = Math.max(0, (this.bonusArmor || 0) + sign * steal.armor);
    this.bonusMr = Math.max(0, (this.bonusMr || 0) + sign * steal.mr);
    this.bonusAD = Math.max(0, (this.bonusAD || 0) + sign * steal.ad);
    this.bonusAP = Math.max(0, (this.bonusAP || 0) + sign * steal.ap);
    this.bonusMaxHp = Math.max(0, (this.bonusMaxHp || 0) + sign * steal.maxHp);
    this._morde.rStolenAsBonus = Math.max(0, (this._morde.rStolenAsBonus || 0) + sign * steal.asBonus);
    this.recomputeStats();
    this.hp = Math.max(this.hp > 0 ? 1 : 0, Math.min(this.maxHp, hpPct * this.maxHp));
    updateBars(this);
};

// 바깥 유닛(적 미니언·포탑·다른 허수아비·아군)을 반투명 혼령으로 그린다. 새로 생긴 유닛도 매 프레임 확인한다.
CharacterController.prototype._mordeGhostOutsiders = function() {
    const target = this._morde.rTarget;
    for (const u of getAllEnemyUnits(true)) if (u !== target && !u.isStructure) ghostUnitForDeathRealm(u); // 구조물은 모든 세계에 존재 - 혼령으로 그리지 않는다
    if (typeof getAllyChampions === 'function') for (const a of getAllyChampions()) ghostUnitForDeathRealm(a);
};

// 크기 변화(약 0.25초에 걸쳐). 모데카이저는 root.scale, 허수아비는 mesh.scale.
CharacterController.prototype._mordeStartSizeAnim = function(target, selfTo, targetTo) {
    const cur = this._morde.rSize || { self: 1, target: 1, targetRef: null };
    this._morde.rSize = { selfFrom: cur.self, selfTo, targetFrom: cur.targetRef === target ? cur.target : 1, targetTo, targetRef: target, start: performance.now(), self: cur.self, target: cur.targetRef === target ? cur.target : 1 };
};
CharacterController.prototype._mordeTickSizeAnim = function() {
    const sz = this._morde.rSize;
    if (!sz) return;
    const k = Math.min(1, (performance.now() - sz.start) / 250);
    sz.self = sz.selfFrom + (sz.selfTo - sz.selfFrom) * k;
    sz.target = sz.targetFrom + (sz.targetTo - sz.targetFrom) * k;
    if (this.root && this.root.scale) this.root.scale.setScalar((this._itemHeartsteelScale || 1) * sz.self);
    const tr = sz.targetRef && (sz.targetRef.mesh || sz.targetRef.root);
    if (tr && tr.scale) tr.scale.setScalar(sz.target);
    if (k >= 1 && sz.selfTo === 1 && sz.targetTo === 1) this._morde.rSize = null;
};

// 들고 있던(대상 사망으로 유지 중이던) 능력치를 내려놓는다.
CharacterController.prototype._mordeReleaseSteal = function(reason) {
    const kept = this._morde.rKept;
    if (!kept) return;
    this._mordeApplyStealToSelf(kept.steal, -1);
    this._morde.rKept = null;
    console.log('[MORDE R] 유지하던 능력치 반환', { reason });
};

// Extracted from CharacterController: _mordeEndDeathRealm
// 지속시간 만료/대상 사망/모데카이저 사망/챔피언 교체 중 어느 경로로 들어오든 이 함수 하나가 정리한다.
// 둘 다 그 자리에서 일반 세계로 돌아온다(원작 - 들어가기 전 위치로 되돌리지 않는다).
CharacterController.prototype._mordeEndDeathRealm = function(reason) { 
    if (!this._morde.isInDeathRealm) return;
    const target = this._morde.rTarget;
    const steal = this._morde.rSteal;
    const targetDied = !!(target && target.hp <= 0 && reason === 'target-death');
    if (targetDied) {
      // 대상이 안에서 죽음: 훔친 능력치를 대상이 부활할 때까지 유지(PC 위키).
      this._morde.rKept = { target, steal };
    } else {
      this._mordeApplyStealToSelf(steal, -1);
      if (target) {
        this._mordeApplyStealToTarget(target, steal, +1);
        // 최대 체력을 돌려준다. 현재 체력은 그대로 둔다(돌려줄 때 현재 체력도 회복하는지는 미확인).
        if (steal) target.maxHp = (target.maxHp || 0) + steal.maxHp;
      }
    }
    console.log('[MORDE R] Death Realm 종료', { reason });
    const realmId = this._morde.realmId;
    this.realmId = 'main';
    if (target) target.realmId = 'main';
    removeDeathRealm(realmId);
    hideDeathRealmBoundary();
    deactivateDeathRealmAtmosphere();
    clearDeathRealmGhosts();
    this._mordeStartSizeAnim(target, 1, 1);
    this._morde.isInDeathRealm = false;
    this._morde.rTarget = null;
    this._morde.rEndsAt = 0;
    this._morde.rSteal = null;
    this._morde.rStolenArmor = 0;
    this._morde.rStolenMr = 0;
    this._morde.realmId = null;
};

// Extracted from CharacterController: _mordeUpdateR
// 매 프레임: 크기 변화, 대상 사망/지속시간 만료 감지, 경계 유지(돌진·끌어당김도 경계에서 멈춤), 혼령 표시 갱신,
// 대상 사망으로 유지 중인 능력치는 대상이 부활(체력 > 0)하거나 치워지면 반환.
CharacterController.prototype._mordeUpdateR = function() { 
    this._mordeTickSizeAnim();
    if (this._morde.rKept) {
      const t = this._morde.rKept.target;
      if (!t || t.destroyed || t.hp > 0) this._mordeReleaseSteal(t && t.hp > 0 ? 'target-respawn' : 'target-removed');
    }
    if (!this._morde.isInDeathRealm) return;
    const target = this._morde.rTarget;
    if (!target || target.hp <= 0 || target.destroyed) { this._mordeEndDeathRealm('target-death'); return; }
    if (performance.now() >= this._morde.rEndsAt) { this._mordeEndDeathRealm('duration-expired'); return; }
    const realm = getDeathRealm(this._morde.realmId);
    if (realm) {
      clampToDeathRealm(this.root.position, realm, this.pathingRadius ?? this.collisionRadius ?? 0);
      const tp = target.mesh ? target.mesh.position : (target.root && target.root.position);
      if (tp) clampToDeathRealm(tp, realm, getCollisionRadius(target));
      if (target._pullState && target._pullState.to) clampToDeathRealm(target._pullState.to, realm, getCollisionRadius(target));
      if (this._dashState && this._dashState.to) clampToDeathRealm(this._dashState.to, realm, this.pathingRadius ?? this.collisionRadius ?? 0);
    }
    this._mordeGhostOutsiders();
};

