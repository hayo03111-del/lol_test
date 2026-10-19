/* ============================================================
   71차: 새 아이템 49종의 효과(item_data.js의 "71차" 묶음)
   ------------------------------------------------------------
   item_system.js의 훅(능력치 합산·매 프레임·피해 줌/받음·기본 공격 적중·궁극기·아군 회복·처치·사용)에서
   한 줄씩 이 파일의 함수를 부른다. 기존 아이템과 같은 필드(regenPassive·spellbladePassive·activeAbility·
   nullifyPassive·grievousOnHitPassive·manaCirculationPassive 등)를 쓰는 효과는 기존 처리 그대로 돌고,
   여기서는 새 필드만 처리한다.
   - 시간 버프는 상태이상(AS_BUFF·MS_BUFF·TENACITY 등)으로 걸거나, 상태이상 종류가 없는 능력치
     (주문력·스킬 가속·마법 저항력·최대 체력)는 ctrl._itemExtraBuffs에 두고 능력치 합산 때 더한다.
   - 아이템 효과 피해는 isItemEffect로 넣는다(그 피해가 다시 불사르기 등을 켜지 않게 한다). 구조물은 뺀다.
   ============================================================ */
const ITEM_EXTRA_CC_TYPES = ['STUN', 'ROOT', 'SLOW', 'SILENCE', 'CHARM', 'FEAR', 'TAUNT', 'SUPPRESSION'];

function _ixSlots(ctrl, field) {
  const out = [];
  for (const s of (ctrl && ctrl.items) || []) { const it = ITEM_DATA[s.id]; if (it && it[field]) out.push(it); }
  return out;
}
function _ixFirst(ctrl, field) { const l = _ixSlots(ctrl, field); return l.length ? l[0] : null; }
function _ixNow() { return performance.now(); }
function _ixPos(u) { return u && u.root ? u.root.position : (typeof getWorldPosition === 'function' ? getWorldPosition(u) : null); }
function _ixIsEnemyChampionSource(ctrl, src) { return !!src && src !== ctrl && (typeof src.championId === 'string' || !!src.isChampion) && !src.isAlly; }
function _ixEnemiesNear(pos, lolRadius, { championsOnly = false, exclude = null } = {}) {
  if (!pos || typeof findEnemiesInRadius !== 'function') return [];
  return findEnemiesInRadius(pos, lolRadius).map((h) => h.unit)
    .filter((u) => u && u.hp > 0 && u !== exclude && !_itemIsStructure(u) && (!championsOnly || u.isChampion));
}
function _ixDamage(ctrl, unit, raw, type, extra = {}) {
  if (!(raw > 0) || !unit || unit.hp <= 0) return;
  applyDamage(unit, { rawDamage: raw, damageType: type, isCritical: false, critMultiplier: 1, source: ctrl, isItemEffect: true, isAbility: false, ...extra });
}
function _ixBonusHp(ctrl) { return (ctrl.itemBonusMaxHp || 0) + (ctrl.bonusMaxHp || 0); }
function _ixHealSelf(ctrl, amount) {
  if (!(amount > 0) || !(ctrl.hp > 0)) return;
  const mult = typeof getHealReceivedMultiplier === 'function' ? getHealReceivedMultiplier(ctrl) : 1;
  ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + amount * mult);
}
function _ixBuff(ctrl, key, durationSec, stats) {
  ctrl._itemExtraBuffs = ctrl._itemExtraBuffs || {};
  ctrl._itemExtraBuffs[key] = { until: _ixNow() + durationSec * 1000, stats };
  recomputeItemStats(ctrl);
}
function _ixCooldownReady(ctrl, item, sec) {
  ctrl._itemActiveCooldownUntil = ctrl._itemActiveCooldownUntil || {};
  const now = _ixNow(), readyAt = ctrl._itemActiveCooldownUntil[item.id] || 0;
  if (now < readyAt) { itemWarn(`${item.nameKo} 재사용 대기 ${Math.ceil((readyAt - now) / 1000)}초`); return false; }
  ctrl._itemActiveCooldownUntil[item.id] = now + sec * 1000;
  return true;
}
function _ixRemoveCc(unit, keepKnockup = true) {
  if (!unit || !Array.isArray(unit.statusEffects)) return 0;
  const before = unit.statusEffects.length;
  unit.statusEffects = unit.statusEffects.filter((e) => !(ITEM_EXTRA_CC_TYPES.includes(e.type) || (!keepKnockup && e.type === 'KNOCKUP')));
  return before - unit.statusEffects.length;
}
function _ixToast(msg) { if (typeof showSkillToast === 'function') showSkillToast(msg); }

// ---------- 능력치 합산(recomputeItemStats의 applyOne 루프 뒤) ----------
function itemExtraAfterStats(ctrl) {
  const items = ((ctrl && ctrl.items) || []).map((s) => ITEM_DATA[s.id]).filter(Boolean);
  for (const it of items) {
    // 혹한의 손길(경탄): 아이템 마나의 15%만큼 체력.
    if (it.aweBonusHpPercentOfMana) ctrl.itemBonusMaxHp += (ctrl.itemBonusMana || 0) * it.aweBonusHpPercentOfMana;
    // 새벽심장(태초의 빛): 기본 마나 재생 100%마다 체력 회복·보호막 2%, 주문력 10.
    if (it.firstLightPassive) {
      const units = Math.max(0, ctrl.itemBonusMpRegenPercent || 0);
      ctrl.itemBonusAP += units * it.firstLightPassive.apPerFullRegen;
      ctrl.itemHealingReceivedBonusPercent += units * it.firstLightPassive.healShieldPerFullRegen;
      ctrl.itemShieldReceivedBonusPercent += units * it.firstLightPassive.healShieldPerFullRegen;
    }
    // 아트마의 심판(큰손): 추가 체력에 비례해 치명타 확률(최대 30%).
    if (it.bigHandsPassive) ctrl.itemBonusCritChance += Math.min(it.bigHandsPassive.maxCrit, _ixBonusHp(ctrl) * it.bigHandsPassive.critPerBonusHp);
  }
  const now = _ixNow();
  for (const [k, b] of Object.entries(ctrl._itemExtraBuffs || {})) {
    if (b.until <= now) continue;
    const s = b.stats || {};
    ctrl.itemBonusAP += s.abilityPower || 0;
    ctrl.itemBonusAbilityHaste += s.abilityHaste || 0;
    ctrl.itemBonusMr += s.magicResist || 0;
    ctrl.itemBonusMaxHp += s.maxHp || 0;
    ctrl.itemBonusMoveSpeedPercent += s.moveSpeedPercent || 0;
    void k;
  }
}

// ---------- 사용 아이템 ----------
function itemExtraIsUsable(item) {
  return !!(item && (item.cleanseActive || item.soulAnchorActive || item.interventionActive || item.vowActive || item.purifyActive
    || item.humilityActive || item.manaRealizeActive || item.noEffectConsumable));
}
// 처리했으면 true/false, 이 파일 담당이 아니면 undefined.
function itemExtraUse(ctrl, slotIndex, item) {
  const now = _ixNow();
  if (item.noEffectConsumable) { // 카파 주스
    const slot = ctrl.items[slotIndex];
    slot.count = (slot.count || 1) - 1;
    if (slot.count <= 0) ctrl.items.splice(slotIndex, 1);
    _ixToast(`${item.nameKo}: 아무 효과가 없습니다.`);
    if (typeof updateItemUI === 'function') updateItemUI(ctrl);
    return true;
  }
  if (item.soulAnchorActive) { // 생명선 / 망령 해적검 - 영혼의 닻(다시 쓰면 바로 돌아감)
    const a = ctrl._itemSoulAnchor;
    if (a && a.returnAt > now) { _ixAnchorReturn(ctrl); return true; }
    if (!_ixCooldownReady(ctrl, item, item.soulAnchorActive.cooldownSec)) return false;
    ctrl._itemSoulAnchor = { pos: ctrl.root.position.clone(), returnAt: now + item.soulAnchorActive.returnSec * 1000 };
    _ixToast(`${item.soulAnchorActive.nameKo}: ${item.soulAnchorActive.returnSec}초 뒤 이 자리로 돌아옵니다`);
    return true;
  }
  if (item.cleanseActive) { // 수은 장식띠 / 헤르메스의 시미터
    const p = item.cleanseActive;
    if (!_ixCooldownReady(ctrl, item, p.cooldownSec)) return false;
    const n = _ixRemoveCc(ctrl);
    if (p.moveSpeedPercent) applyStatus(ctrl, { id: 'itemMercurialMs', type: 'MS_BUFF', duration: p.moveSpeedSec, value: p.moveSpeedPercent, decayLinear: true });
    _ixToast(`${p.nameKo}: 군중 제어 ${n}개 제거`);
    return true;
  }
  if (item.humilityActive) { // 란두인의 예언 - 억제
    const p = item.humilityActive;
    if (!_ixCooldownReady(ctrl, item, p.cooldownSec)) return false;
    for (const u of _ixEnemiesNear(ctrl.root.position, p.radius)) applyStatus(u, { id: 'itemRanduinSlow', type: 'SLOW', duration: p.durationSec, value: p.slowPercent, source: ctrl });
    return true;
  }
  if (item.purifyActive) { // 미카엘의 축복 - 가장 가까운 아군 정화 + 회복
    const p = item.purifyActive;
    const ally = typeof findAlliesInRadius === 'function' ? findAlliesInRadius(ctrl.root.position, p.range, { exclude: [ctrl] })[0] : null;
    if (!ally) { itemWarn('주변에 대상 아군이 없습니다.'); return false; }
    if (!_ixCooldownReady(ctrl, item, p.cooldownSec)) return false;
    _ixRemoveCc(ally.unit);
    healAlly(ctrl, ally.unit, _itemScaleByLevel(ctrl, p.healMin, p.healMax, 1, 18));
    return true;
  }
  if (item.vowActive) { // 기사의 맹세 - 가장 가까운 아군을 보호 대상으로
    const p = item.vowActive;
    const ally = typeof findAlliesInRadius === 'function' ? findAlliesInRadius(ctrl.root.position, p.range, { exclude: [ctrl] })[0] : null;
    if (!ally) { itemWarn('주변에 대상 아군이 없습니다.'); return false; }
    if (!_ixCooldownReady(ctrl, item, p.cooldownSec)) return false;
    ctrl._itemVowAlly = ally.unit;
    _ixToast(`${p.nameKo}: 아군을 보호합니다`);
    return true;
  }
  if (item.interventionActive) { // 구원 - 마우스 위치(없으면 제자리)에 2.5초 뒤 회복 + 적 챔피언 고정 피해
    const p = item.interventionActive;
    if (!_ixCooldownReady(ctrl, item, p.cooldownSec)) return false;
    const pos = (typeof lastGroundPoint !== 'undefined' && lastGroundPoint) ? lastGroundPoint.clone() : ctrl.root.position.clone();
    ctrl._itemRedemption = { at: now + p.delaySec * 1000, pos, p };
    if (typeof spawnRangeRingAt === 'function') spawnRangeRingAt(pos, p.radius, p.delaySec);
    return true;
  }
  if (item.manaRealizeActive) { // 실체화 장비 - 마나 실현
    const p = item.manaRealizeActive;
    if (!_ixCooldownReady(ctrl, item, p.cooldownSec)) return false;
    ctrl._itemManaRealizeUntil = now + p.durationSec * 1000;
    _ixToast(`${p.nameKo}: ${p.durationSec}초 동안 스킬 강화`);
    return true;
  }
  return undefined;
}
function _ixAnchorReturn(ctrl) {
  const a = ctrl._itemSoulAnchor;
  if (!a) return;
  ctrl._itemSoulAnchor = null;
  if (!(ctrl.hp > 0)) return;
  ctrl.root.position.x = a.pos.x; ctrl.root.position.z = a.pos.z;
  ctrl.targetPos = null;
  if (typeof ctrl.setState === 'function' && ctrl.state === 'MOVE') ctrl.setState('IDLE');
}

// ---------- 매 프레임 ----------
function itemExtraTick(ctrl, dt) {
  if (!ctrl) return;
  const now = _ixNow();
  // 끝난 시간 버프 정리
  const buffs = ctrl._itemExtraBuffs;
  if (buffs) {
    let changed = false;
    for (const k of Object.keys(buffs)) if (buffs[k].until <= now) { delete buffs[k]; changed = true; }
    if (changed) recomputeItemStats(ctrl);
  }
  if (ctrl._itemSoulAnchor && ctrl._itemSoulAnchor.returnAt <= now) _ixAnchorReturn(ctrl);
  // 구원 착지
  const red = ctrl._itemRedemption;
  if (red && red.at <= now) {
    ctrl._itemRedemption = null;
    const heal = _itemScaleByLevel(ctrl, red.p.healMin, red.p.healMax, 1, 18);
    const rWorld = lolRangeToWorld(red.p.radius);
    if (getHorizontalDistance(ctrl.root.position, red.pos) <= rWorld) _ixHealSelf(ctrl, heal);
    if (typeof findAlliesInRadius === 'function') for (const { unit } of findAlliesInRadius(red.pos, red.p.radius, { exclude: [ctrl] })) healAlly(ctrl, unit, heal);
    for (const u of _ixEnemiesNear(red.pos, red.p.radius, { championsOnly: true })) _ixDamage(ctrl, u, (u.maxHp || 0) * red.p.enemyMaxHpTruePercent, DAMAGE_TYPE.TRUE);
  }
  if (!ctrl.items || !ctrl.items.length) return;
  // 실체화 장비: 강화 중 기본 스킬 재사용 대기시간이 30% 더 빨리 흐른다
  if ((ctrl._itemManaRealizeUntil || 0) > now && ctrl.cooldowns) {
    const p = _ixFirst(ctrl, 'manaRealizeActive');
    if (p) for (const k of ['Q', 'W', 'E']) if (ctrl.cooldowns[k] > 0) ctrl.cooldowns[k] = Math.max(0, ctrl.cooldowns[k] - dt * p.manaRealizeActive.cooldownTickBonus);
  }
  // 원칙의 원형낫: R 재사용 대기시간 전체 길이를 기억(처치 시 일부 돌려받음)
  if (ctrl.cooldowns) {
    const r = ctrl.cooldowns.R || 0;
    if (r <= 0) ctrl._itemAxiomRTotal = 0; else if (r > (ctrl._itemAxiomRTotal || 0)) ctrl._itemAxiomRTotal = r;
  }
  // 불사르기(바미의 불씨·태양불꽃 방패·공허한 광휘): 켜져 있는 동안 1초마다 주변 적에게 마법 피해
  const imm = _ixSlots(ctrl, 'immolatePassive').map((it) => it.immolatePassive).sort((a, b) => b.baseDps - a.baseDps)[0];
  if (imm && (ctrl._itemImmolateUntil || 0) > now) {
    ctrl._itemImmolateAcc = (ctrl._itemImmolateAcc || 0) + dt;
    while (ctrl._itemImmolateAcc >= 1) {
      ctrl._itemImmolateAcc -= 1;
      const dps = imm.baseDps + _ixBonusHp(ctrl) * imm.bonusHpDps;
      for (const u of _ixEnemiesNear(ctrl.root.position, imm.radius)) _ixDamage(ctrl, u, dps * (u.isMinion ? imm.minionMult : 1), DAMAGE_TYPE.MAGICAL);
    }
  } else ctrl._itemImmolateAcc = 0;
  // 지크의 융합: 궁극기 뒤 폭풍(1초마다 피해 + 둔화)
  const storm = ctrl._itemZekeStorm;
  if (storm && storm.until > now) {
    storm.acc += dt;
    while (storm.acc >= 1) {
      storm.acc -= 1;
      for (const u of _ixEnemiesNear(ctrl.root.position, storm.p.radius, { championsOnly: true })) {
        _ixDamage(ctrl, u, storm.p.dps, DAMAGE_TYPE.MAGICAL);
        applyStatus(u, { id: 'itemZekeSlow', type: 'SLOW', duration: 1.0, value: storm.p.slowPercent, source: ctrl });
      }
    }
  } else if (storm) ctrl._itemZekeStorm = null;
  // 오라(심연의 가면: 주변 적 챔피언이 받는 마법 피해 증가 / 얼어붙은 심장: 주변 챔피언 공격 속도 감소)
  ctrl._itemAuraAcc = (ctrl._itemAuraAcc || 0) + dt;
  if (ctrl._itemAuraAcc >= 0.25) {
    ctrl._itemAuraAcc = 0;
    const mask = _ixFirst(ctrl, 'unmakeAura');
    if (mask) for (const u of _ixEnemiesNear(ctrl.root.position, mask.unmakeAura.radius, { championsOnly: true })) applyStatus(u, { id: 'itemUnmake', type: 'MAGIC_VULNERABLE', duration: 0.5, value: mask.unmakeAura.magicDamageTakenPercent, source: ctrl });
    const heart = _ixFirst(ctrl, 'wintersCaressAura');
    if (heart) for (const u of _ixEnemiesNear(ctrl.root.position, heart.wintersCaressAura.radius, { championsOnly: true })) applyStatus(u, { id: 'itemWintersCaress', type: 'AS_REDUCTION', duration: 0.5, value: heart.wintersCaressAura.attackSpeedReductionPercent, source: ctrl });
  }
  // 망자의 갑옷: 움직이면 탄력이 쌓여 추가 이동 속도(최대 20)
  const dmp = _ixFirst(ctrl, 'shipwreckerPassive');
  if (dmp) {
    const p = dmp.shipwreckerPassive;
    const moving = ctrl.state === 'MOVE' || ctrl.state === 'CHASE';
    ctrl._itemMomentum = Math.max(0, Math.min(1, (ctrl._itemMomentum || 0) + (moving ? dt / p.buildSec : -dt / p.buildSec)));
    if (ctrl._itemMomentum > 0.01) applyStatus(ctrl, { id: 'itemShipwreckerMs', type: 'MS_BUFF_FLAT', duration: 0.25, value: p.maxMsFlat * ctrl._itemMomentum });
  } else ctrl._itemMomentum = 0;
  // 스태틱의 단검: 시간이 지나면 충전
  const shiv = _ixFirst(ctrl, 'electrosparkPassive');
  if (shiv) ctrl._itemShivCharge = Math.min(shiv.electrosparkPassive.chargeTimeSec, (ctrl._itemShivCharge || 0) + dt);
  // 케이닉 루컨: 15초 동안 마법 피해를 안 받으면 마법 보호막
  const rook = _ixFirst(ctrl, 'magebanePassive');
  if (rook) {
    if (!(ctrl._itemRookernShield > 0) && now - (ctrl._itemLastMagicTakenAt || -1e9) >= rook.magebanePassive.outOfMagicSec * 1000) {
      ctrl._itemRookernShield = (ctrl.maxHp || 0) * rook.magebanePassive.maxHpPercent;
    }
  } else ctrl._itemRookernShield = 0;
}

// ---------- 피해를 받을 때(보호막 흡수 전) ----------
function itemExtraOnTakeDamage(ctrl, remaining, damageType, source, meta) {
  if (!ctrl || !(remaining > 0)) return remaining;
  meta = meta || {};
  const now = _ixNow();
  const fromChamp = _ixIsEnemyChampionSource(ctrl, source);
  const fromEnemy = !!source && source !== ctrl && !source.isAlly;
  if (fromEnemy) ctrl._itemLastCombatAt = now;
  // 불사르기: 피해를 받으면 켜진다
  if (fromEnemy && !meta.isItemEffect && _ixFirst(ctrl, 'immolatePassive')) ctrl._itemImmolateUntil = now + 3000;
  // 란두인의 예언(저항): 치명타 피해 30% 감소
  if (meta.isCritical) { const r = _ixFirst(ctrl, 'critDamageTakenReduction'); if (r) remaining *= 1 - r.critDamageTakenReduction; }
  // 파수꾼의 갑옷·얼어붙은 심장(견고): 기본 공격 피해 감소(구조물 제외)
  if (meta.isBasicAttack && !(source && _itemIsStructure(source))) {
    let best = 0;
    for (const it of _ixSlots(ctrl, 'rockSolidPassive')) {
      const p = it.rockSolidPassive;
      best = Math.max(best, Math.min(remaining * p.maxPercent, p.flat + p.perThousandHp * (ctrl.maxHp || 0) / 1000));
    }
    remaining = Math.max(0, remaining - best);
  }
  // 수호자의 뿔피리(불굴의 의지): 적 챔피언 피해 15 감소(지속 피해는 25%)
  if (fromChamp) {
    const horn = _ixFirst(ctrl, 'flatChampDamageBlock');
    if (horn) remaining = Math.max(0, remaining - horn.flatChampDamageBlock.flat * (meta.isStatusTick ? horn.flatChampDamageBlock.dotFactor : 1));
  }
  if (damageType === DAMAGE_TYPE.MAGICAL) {
    // 케이닉 루컨: 마법 보호막이 마법 피해를 먼저 흡수
    if (ctrl._itemRookernShield > 0) {
      const take = Math.min(ctrl._itemRookernShield, remaining);
      ctrl._itemRookernShield -= take; remaining -= take;
    }
    ctrl._itemLastMagicTakenAt = now;
    // 대자연의 힘(굳건함): 챔피언에게 마법 피해 8회 → 마법 저항력 70 + 이동 속도 6%
    const fon = _ixFirst(ctrl, 'steadfastPassive');
    if (fon && fromChamp && now - (ctrl._itemSteadfastLastAt || 0) >= fon.steadfastPassive.perHitIcdSec * 1000) {
      const p = fon.steadfastPassive;
      if (now - (ctrl._itemSteadfastLastAt || 0) > p.stackSec * 1000) ctrl._itemSteadfastStacks = 0;
      ctrl._itemSteadfastLastAt = now;
      ctrl._itemSteadfastStacks = (ctrl._itemSteadfastStacks || 0) + 1;
      if (ctrl._itemSteadfastStacks >= p.stacksNeeded) {
        ctrl._itemSteadfastStacks = 0;
        _ixBuff(ctrl, 'steadfast', p.stackSec, { magicResist: p.bonusMr, moveSpeedPercent: p.bonusMsPercent });
      }
    }
  }
  // 원형질 안전벨트(생명선): 체력이 30% 아래로 떨어질 만큼 맞으면 최대 체력 + 회복 + 이동 속도 + 강인함
  const proto = _ixFirst(ctrl, 'protoLifelinePassive');
  if (proto && (ctrl._itemProtoIcdUntil || 0) <= now) {
    const p = proto.protoLifelinePassive;
    const hpAfter = (ctrl.hp || 0) - Math.max(0, remaining - (ctrl.shield || 0));
    if (hpAfter < (ctrl.maxHp || 0) * p.hpThresholdPercent) {
      ctrl._itemProtoIcdUntil = now + p.icdSec * 1000;
      const bonus = _itemScaleByLevel(ctrl, p.bonusHpMin, p.bonusHpMax, 1, 18);
      _ixBuff(ctrl, 'protoplasm', p.durationSec, { maxHp: bonus });
      ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + bonus); // 늘어난 최대 체력만큼 현재 체력도
      const total = p.healBase + _ixBonusHp(ctrl) * p.healBonusHpPercent;
      ctrl._itemActiveHeals = ctrl._itemActiveHeals || [];
      ctrl._itemActiveHeals.push({ perSec: total / p.durationSec, remainingSec: p.durationSec });
      applyStatus(ctrl, { id: 'itemProtoMs', type: 'MS_BUFF', duration: p.durationSec, value: p.moveSpeedPercent });
      applyStatus(ctrl, { id: 'itemProtoTenacity', type: 'TENACITY', duration: p.durationSec, value: p.tenacityPercent });
      console.log('[ITEM] 원형질 안전벨트 - 생명선 발동');
    }
  }
  return remaining;
}

// ---------- 피해를 줄 때 ----------
function itemExtraOnDamageDealt(ctrl, target, finalDmg, damageType, meta) {
  if (!ctrl || !target || !ctrl.items || !ctrl.items.length) return;
  meta = meta || {};
  const now = _ixNow();
  const isStructure = _itemIsStructure(target);
  const prevCombatAt = ctrl._itemLastCombatAt || -1e9;
  if (!isStructure) ctrl._itemLastCombatAt = now;
  // 불사르기: 피해를 입히면 켜진다(자기 피해로는 다시 켜지지 않게 아이템 효과 피해는 뺀다)
  if (!meta.isItemEffect && !isStructure && _ixFirst(ctrl, 'immolatePassive')) ctrl._itemImmolateUntil = now + 3000;
  if (target.isChampion && finalDmg > 0) {
    // 망각의 구·모렐로노미콘: 마법 피해에 고통스러운 상처
    const orb = _ixFirst(ctrl, 'magicGrievousPassive');
    if (orb && damageType === DAMAGE_TYPE.MAGICAL) applyStatus(target, { id: 'itemGrievousWounds', type: 'GRIEVOUS', duration: orb.magicGrievousPassive.durationSec, value: orb.magicGrievousPassive.percent, source: ctrl, isItemEffect: true });
    // 핏빛 저주(썩은 부식): 스킬·지속 효과 마법 피해마다 마법 저항력 7.5% 감소(4회 중첩)
    const curse = _ixFirst(ctrl, 'decayingRotPassive');
    if (curse && damageType === DAMAGE_TYPE.MAGICAL && !meta.isBasicAttack) {
      const p = curse.decayingRotPassive;
      const fresh = (target._itemRotUntil || 0) > now;
      target._itemRotStacks = Math.min(p.maxStacks, (fresh ? target._itemRotStacks || 0 : 0) + 1);
      target._itemRotUntil = now + p.durationSec * 1000;
      const baseMr = (target.magicResist ?? (target.stats && target.stats.magicResist)) || 0;
      applyStatus(target, { id: 'itemBloodletterRot', type: 'MR_SHRED', duration: p.durationSec, value: Math.max(0, baseMr) * p.mrPercentPerStack * target._itemRotStacks, source: ctrl });
    }
    // 독사의 송곳니(보호막 파괴자): 대상 보호막 감소(대상마다 3초에 한 번)
    const fang = _ixFirst(ctrl, 'shieldReaverPassive');
    if (fang && (target._itemReavedUntil || 0) <= now && Array.isArray(target.shieldEntries) && target.shieldEntries.length) {
      const p = fang.shieldReaverPassive;
      const cut = _itemIsMelee(ctrl) ? p.meleePercent : p.rangedPercent;
      for (const e of target.shieldEntries) e.amount *= 1 - cut;
      target._itemReavedUntil = now + p.durationSec * 1000;
      if (typeof recomputeShield === 'function') recomputeShield(target); else if (typeof _allyRecomputeShield === 'function') _allyRecomputeShield(target);
    }
    // 헬리아의 메아리(영혼 흡수): 챔피언 피해의 30%를 영혼 충전으로
    const helia = _ixFirst(ctrl, 'soulSiphonPassive');
    if (helia && !meta.isItemEffect) ctrl._itemSoulCharge = Math.min(helia.soulSiphonPassive.maxCharge, (ctrl._itemSoulCharge || 0) + finalDmg * helia.soulSiphonPassive.chargePercent);
    // 그림자 검(밤의 추적자): 3초 동안 전투하지 않았으면 다음 기본 공격에 추가 고정 피해
    const glaive = _ixFirst(ctrl, 'nightstalkerPassive');
    if (glaive && meta.isBasicAttack && now - prevCombatAt >= glaive.nightstalkerPassive.unseenSec * 1000) {
      const p = glaive.nightstalkerPassive;
      _ixDamage(ctrl, target, p.trueDamage + p.lethalityRatio * (ctrl.itemBonusArmorPenFlat || 0), DAMAGE_TYPE.TRUE);
    }
  }
  // 공허한 광휘(황폐): 적을 처치하면 그 자리에 마법 피해
  const hollow = _ixFirst(ctrl, 'desolatePassive');
  if (hollow && target.isMinion && !target._itemDesolated && (target.hp <= 0 || target.hp <= finalDmg)) {
    target._itemDesolated = true;
    const p = hollow.desolatePassive;
    const pos = _ixPos(target);
    for (const u of _ixEnemiesNear(pos, p.radius, { exclude: target })) _ixDamage(ctrl, u, p.base + _ixBonusHp(ctrl) * p.bonusHpRatio, DAMAGE_TYPE.MAGICAL);
  }
}

// ---------- 기본 공격 적중(item_system.js itemOnBasicAttackHit 맨 앞 - 주문 검이 아직 무장된 상태) ----------
function itemExtraOnBasicAttackHit(ctrl, target, isCritical, opts = {}) {
  if (!ctrl || !target || !ctrl.items || !ctrl.items.length) return;
  const now = _ixNow();
  const targetPos = _ixPos(target);
  // 얼어붙은 건틀릿: 주문 검 발동 때 대상 주변 둔화(서리 영역)
  if (ctrl._itemSheenArmed && !opts.fromAbility) {
    const sb = typeof _itemSpellbladeSlot === 'function' ? _itemSpellbladeSlot(ctrl) : null;
    const it = sb && ITEM_DATA[sb.id];
    if (it && it.frostFieldOnSpellblade) {
      const p = it.frostFieldOnSpellblade;
      for (const u of _ixEnemiesNear(targetPos, p.radius)) applyStatus(u, { id: 'itemFrostField', type: 'SLOW', duration: p.durationSec, value: p.slowPercent, source: ctrl });
    }
  }
  if (_itemIsStructure(target)) return;
  // 불경한 히드라·굶주린 히드라(쪼개기)
  const hydra = _ixFirst(ctrl, 'extraCleavePassive');
  if (hydra) {
    const p = hydra.extraCleavePassive;
    const raw = (_itemIsMelee(ctrl) ? p.meleePercent : p.rangedPercent) * (ctrl.stats.attackDamage || 0);
    for (const u of _ixEnemiesNear(targetPos, p.radius, { exclude: target })) _ixDamage(ctrl, u, raw, DAMAGE_TYPE.PHYSICAL);
  }
  // 루난의 허리케인(바람의 분노): 원거리 챔피언 기본 공격 시 근처 적 2명에게 추가 탄환
  const runaan = _ixFirst(ctrl, 'windsFuryPassive');
  if (runaan && !opts.fromAbility && (!runaan.windsFuryPassive.rangedOnly || _itemIsRanged(ctrl))) {
    const p = runaan.windsFuryPassive;
    const list = _ixEnemiesNear(targetPos, p.range, { exclude: target })
      .sort((a, b) => getHorizontalDistance(_ixPos(a), targetPos) - getHorizontalDistance(_ixPos(b), targetPos)).slice(0, p.bolts);
    for (const u of list) _ixDamage(ctrl, u, p.adPercent * (ctrl.stats.attackDamage || 0), DAMAGE_TYPE.PHYSICAL);
  }
  // 불타는 향로(축성): 켜져 있으면 적중 시 마법 피해
  if ((ctrl._itemCenserUntil || 0) > now) {
    const c = _ixFirst(ctrl, 'consecratePassive');
    if (c) _ixDamage(ctrl, target, c.consecratePassive.onHitMagic, DAMAGE_TYPE.MAGICAL);
  }
  // 망자의 갑옷: 탄력만큼 추가 물리 피해, 탄력 소모
  const dmp = _ixFirst(ctrl, 'shipwreckerPassive');
  if (dmp && (ctrl._itemMomentum || 0) > 0.05) {
    const p = dmp.shipwreckerPassive;
    const baseStats = (ctrl.championId && typeof computeChampionStats === 'function') ? computeChampionStats(ctrl.championId, ctrl.champLevel) : null;
    const baseAd = baseStats ? baseStats.attackDamage : (ctrl.stats.attackDamage || 0);
    _ixDamage(ctrl, target, ctrl._itemMomentum * (p.bonusDamage + p.baseAdPercent * baseAd), DAMAGE_TYPE.PHYSICAL);
    ctrl._itemMomentum = 0;
    clearStatus(ctrl, 'itemShipwreckerMs');
  }
  // 스태틱의 단검: 충전 상태면 연쇄 번개(대상 + 주변 적 최대 4명), 기본 공격마다 충전이 더 쌓인다
  const shiv = _ixFirst(ctrl, 'electrosparkPassive');
  if (shiv) {
    const p = shiv.electrosparkPassive;
    if ((ctrl._itemShivCharge || 0) >= p.chargeTimeSec) {
      ctrl._itemShivCharge = 0;
      const dmg = p.damage + p.apRatio * ((ctrl.stats && ctrl.stats.abilityPower) || 0);
      const chain = [target, ..._ixEnemiesNear(targetPos, p.radius, { exclude: target })].slice(0, p.bounces);
      for (const u of chain) _ixDamage(ctrl, u, dmg * (u.isMinion ? p.minionMult : 1), DAMAGE_TYPE.MAGICAL);
    } else ctrl._itemShivCharge = Math.min(p.chargeTimeSec, (ctrl._itemShivCharge || 0) + p.attackChargeSec);
  }
}

// ---------- 궁극기 사용 ----------
function itemExtraOnUltimateCast(ctrl) {
  if (!ctrl) return;
  const now = _ixNow();
  const zeke = _ixFirst(ctrl, 'frostfireStormPassive');
  if (zeke) ctrl._itemZekeStorm = { until: now + zeke.frostfireStormPassive.durationSec * 1000, acc: 1, p: zeke.frostfireStormPassive };
  const hex = _ixFirst(ctrl, 'overdrivePassive');
  if (hex && (ctrl._itemOverdriveReadyAt || 0) <= now) {
    const p = hex.overdrivePassive;
    ctrl._itemOverdriveReadyAt = now + p.cooldownSec * 1000;
    applyStatus(ctrl, { id: 'itemOverdriveAs', type: 'AS_BUFF', duration: p.durationSec, value: p.attackSpeedPercent });
    applyStatus(ctrl, { id: 'itemOverdriveMs', type: 'MS_BUFF', duration: p.durationSec, value: p.moveSpeedPercent });
  }
}

// ---------- 아군을 회복시키거나 보호막을 씌울 때 ----------
function itemExtraOnAllyHealOrShield(source, target, kind, amount) {
  if (!source || !source.items) return;
  const censer = _ixFirst(source, 'consecratePassive');
  if (censer) {
    const p = censer.consecratePassive;
    applyStatus(source, { id: 'itemCenserAs', type: 'AS_BUFF', duration: p.durationSec, value: p.attackSpeedPercent });
    source._itemCenserUntil = _ixNow() + p.durationSec * 1000;
  }
  const staff = _ixFirst(source, 'rapidsPassive');
  if (staff) _ixBuff(source, 'rapids', staff.rapidsPassive.durationSec, { abilityPower: staff.rapidsPassive.abilityPower, abilityHaste: staff.rapidsPassive.abilityHaste });
  // 헬리아의 메아리: 모은 영혼 충전을 모두 써서 그 아군을 회복
  if (_ixFirst(source, 'soulSiphonPassive') && (source._itemSoulCharge || 0) > 0 && typeof healAlly === 'function') {
    const amt = source._itemSoulCharge; source._itemSoulCharge = 0;
    healAlly(source, target, amt, { noItemHook: true });
  }
  void kind; void amount;
}

// ---------- 챔피언 처치 관여 ----------
function itemExtraOnTakedown(ctrl) {
  if (!ctrl || !ctrl.items) return;
  const axiom = _ixFirst(ctrl, 'fluxPassive');
  if (axiom && ctrl.cooldowns && ctrl.cooldowns.R > 0) ctrl.cooldowns.R = Math.max(0, ctrl.cooldowns.R - (ctrl._itemAxiomRTotal || ctrl.cooldowns.R) * axiom.fluxPassive.refundPercent);
  const bloom = _ixFirst(ctrl, 'lifeFromDeathPassive');
  if (bloom) {
    const p = bloom.lifeFromDeathPassive;
    const heal = p.healBase + p.healApRatio * ((ctrl.stats && ctrl.stats.abilityPower) || 0);
    _ixHealSelf(ctrl, heal);
    if (typeof findAlliesInRadius === 'function') for (const { unit } of findAlliesInRadius(ctrl.root.position, p.radius, { exclude: [ctrl] })) healAlly(ctrl, unit, heal);
  }
}

// ---------- 마나를 쓸 때(실체화 장비: 강화 중 마나 100% 더 소모) ----------
function itemExtraOnManaSpent(ctrl, manaSpent) {
  if (!ctrl || (ctrl._itemManaRealizeUntil || 0) <= _ixNow()) return;
  const p = _ixFirst(ctrl, 'manaRealizeActive');
  if (p) ctrl.mp = Math.max(0, (ctrl.mp || 0) - manaSpent * (p.manaRealizeActive.manaCostMult - 1));
}

// ---------- 피해 계산(calculateDamage) ----------
// 실체화 장비 강화 중: 스킬 피해 증가(기본 공격 제외).
function getItemExtraOutgoingAmp(src, isBasicAttack) {
  if (!src || isBasicAttack || (src._itemManaRealizeUntil || 0) <= _ixNow()) return 0;
  const p = _ixFirst(src, 'manaRealizeActive');
  return p ? p.manaRealizeActive.damageAmpPercent : 0;
}
// 심연의 가면(파괴): 받는 마법 피해 증가(MAGIC_VULNERABLE).
function getMagicVulnerablePercent(target) {
  if (!target || !target.statusEffects) return 0;
  const now = _ixNow();
  let v = 0;
  for (const e of target.statusEffects) if (e.type === 'MAGIC_VULNERABLE' && e.expiresAt > now) v = Math.max(v, e.value);
  return v;
}

// ---------- 아군이 피해를 받을 때(기사의 맹세: 일부를 대신 받음) ----------
function itemExtraAllyIncoming(a, dmg) {
  const c = typeof controller !== 'undefined' ? controller : null;
  if (!c || c._itemVowAlly !== a || !(dmg > 0) || !(c.hp > 0)) return dmg;
  const vow = _ixFirst(c, 'vowActive');
  if (!vow) { c._itemVowAlly = null; return dmg; }
  const p = vow.vowActive;
  if (getHorizontalDistance(c.root.position, getWorldPosition(a)) > lolRangeToWorld(p.linkRadius)) return dmg;
  const part = dmg * p.redirectPercent;
  c.takeDamage(part, null, DAMAGE_TYPE.TRUE, { isItemEffect: true });
  return dmg - part;
}
