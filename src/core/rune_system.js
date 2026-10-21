/* ============================================================
   룬 시스템 - 52차
   ------------------------------------------------------------
   룬 페이지: 주 빌드(핵심 룬 + 3줄) + 보조 빌드(서로 다른 줄 2개) + 능력치 파편 3줄. 목록·이름·짧은 설명은 rune_meta.js
   (Data Dragon ko_KR - tools/fetch_rune_data.py), 효과는 여기 RUNE_EFFECTS. 페이지는 로비에서 고르고 브라우저에 저장한다.

   효과 연결(아이템 시스템과 같은 지점): recomputeStats() 앞 runeComputeStatic(정적 능력치), itemSystemTick → runeTick,
   itemOnDamageDealt → runeOnDamageDealt, itemOnBasicAttackHit → runeOnBasicAttackHit, itemOnTakeDamage → runeOnTakeDamage,
   itemOnChampionTakedown → runeOnTakedown, itemOnSlowOrImmobilize → runeOnImpair, itemOnMinionKillByPlayer → runeOnMinionKill.
   룬이 주는 피해는 isItemEffect로 넣어 룬·아이템 효과가 다시 터지지 않게 한다.

   수치는 원작 설명과 위키 기억값 기반 근사(레벨 비례는 1~18 선형) - 정확한 패치 수치가 아니다(추정).
   이 연습장에 없는 시스템(와드·골드·소환사 주문 교체·지형 등)에 기대는 룬은 impl:false - 고를 수는 있지만 효과가 없다.
   ============================================================ */
const RUNE_STORAGE_KEY = 'lolsim.runePage.v1';
// 적응형 능력치가 주문력으로 가는 챔피언(아이템 추가 공격력·주문력이 같을 때) - 원작은 챔피언마다 기본값이 있다.
const RUNE_ADAPTIVE_AP_CHAMPS = new Set(['ahri', 'lux', 'vex', 'mordekaiser', 'chogath']);
const RUNE_SHARD_EFFECTS = {
  adaptive: { adaptive: 9 }, as: { asPercent: 0.10 }, ah: { ah: 8 }, ms: { msPercent: 0.02 },
  hpScale: { hpScale: [10, 180] }, hp: { hp: 65 }, tenacity: { tenacity: 0.15, slowResist: 0.15 }, // 83차: V25.22부터 강인함·둔화 저항 각 15%
};
// 효과를 구현한 룬(키). 나머지는 고를 수는 있어도 효과 없음(툴팁에 표시).
const RUNE_IMPLEMENTED = new Set([
  'Electrocute', 'DarkHarvest', 'HailOfBlades', 'PressTheAttack', 'LethalTempo', 'FleetFootwork', 'Conqueror', 'GraspOfTheUndying',
  'Aftershock', 'SummonAery', 'ArcaneComet', 'PhaseRush', 'FirstStrike',
  'CheapShot', 'TasteOfBlood', 'UltimateHunter', 'AbsorbLife', 'Triumph', 'PresenceOfMind', 'LegendAlacrity', 'LegendHaste',
  'LegendBloodline', 'CoupDeGrace', 'CutDown', 'LastStand', 'Conditioning', 'SecondWind', 'BonePlating', 'Overgrowth', 'Revitalize',
  'Unflinching', 'NullifyingOrb', 'ManaflowBand', 'Transcendence', 'Celerity', 'AbsoluteFocus', 'Scorch', 'GatheringStorm',
]);
const RUNE_DEFAULT_PAGES = {
  fighter: { primary: 8000, keystone: 8010, rows: [9111, 9104, 8299], secondary: 8400, secondaryRunes: [8444, 8242], shards: ['adaptive', 'adaptive', 'hpScale'] },
  mage: { primary: 8100, keystone: 8112, rows: [8139, 8140, 8106], secondary: 8200, secondaryRunes: [8210, 8237], shards: ['adaptive', 'adaptive', 'hpScale'] },
  marksman: { primary: 8000, keystone: 8008, rows: [8009, 9104, 8014], secondary: 8400, secondaryRunes: [8473, 8242], shards: ['as', 'adaptive', 'hpScale'] },
};
const RUNE_DEFAULT_ROLE = { ahri: 'mage', lux: 'mage', vex: 'mage', ezreal: 'marksman', ashe: 'marksman', varus: 'marksman' };

function runeFind(id) {
  if (typeof RUNE_TREES === 'undefined') return null;
  for (const t of RUNE_TREES) for (let i = 0; i < t.slots.length; i++) for (const r of t.slots[i]) if (r.id === id) return { tree: t, row: i, rune: r };
  return null;
}
function runeTree(id) { return typeof RUNE_TREES !== 'undefined' ? RUNE_TREES.find((t) => t.id === id) || null : null; }
function runeDefaultPage(championId) { return JSON.parse(JSON.stringify(RUNE_DEFAULT_PAGES[RUNE_DEFAULT_ROLE[championId] || 'fighter'])); }
// 페이지가 규칙에 맞는지(주/보조 다른 빌드, 핵심 룬 0줄, 주 빌드 1~3줄 한 개씩, 보조는 1~3줄 중 서로 다른 두 줄).
function runeValidatePage(p) {
  if (!p || typeof RUNE_TREES === 'undefined') return false;
  const pt = runeTree(p.primary), st = runeTree(p.secondary);
  if (!pt || !st || pt === st) return false;
  const k = runeFind(p.keystone); if (!k || k.tree !== pt || k.row !== 0) return false;
  if (!Array.isArray(p.rows) || p.rows.length !== 3) return false;
  for (let i = 0; i < 3; i++) { const f = runeFind(p.rows[i]); if (!f || f.tree !== pt || f.row !== i + 1) return false; }
  if (!Array.isArray(p.secondaryRunes) || p.secondaryRunes.length !== 2) return false;
  const rows = p.secondaryRunes.map((id) => { const f = runeFind(id); return f && f.tree === st && f.row >= 1 ? f.row : -1; });
  if (rows.includes(-1) || rows[0] === rows[1]) return false;
  return Array.isArray(p.shards) && p.shards.length === 3 && p.shards.every((s, i) => RUNE_SHARD_ROWS[i].some((x) => x.key === s));
}
// 챔피언마다 따로 저장(원작 룬 페이지처럼 챔피언에 맞춰 고른다).
function _runeSavedMap() { try { return JSON.parse(localStorage.getItem(RUNE_STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function runeLoadSavedPage(championId) { const p = _runeSavedMap()[championId]; return runeValidatePage(p) ? p : null; }
function runeSavePage(championId, p) {
  try { const m = _runeSavedMap(); m[championId] = p; localStorage.setItem(RUNE_STORAGE_KEY, JSON.stringify(m)); } catch (e) { /* 저장 불가 환경 */ }
}
function runePageFor(championId) { return runeLoadSavedPage(championId) || runeDefaultPage(championId); }
function runeSetPage(ctrl, page) {
  if (!ctrl || !runeValidatePage(page)) return false;
  ctrl.runePage = JSON.parse(JSON.stringify(page));
  runeResetState(ctrl);
  if (typeof ctrl.recomputeStats === 'function') ctrl.recomputeStats();
  return true;
}
function runeHas(ctrl, key) {
  const p = ctrl && ctrl.runePage; if (!p) return false;
  const ids = [p.keystone, ...(p.rows || []), ...(p.secondaryRunes || [])];
  return ids.some((id) => { const f = runeFind(id); return f && f.rune.key === key; });
}
function runeResetState(ctrl) {
  ctrl._rune = {
    hits: new Map(), cds: {}, conquerorStacks: 0, conquerorUntil: 0, tempoStacks: 0, tempoUntil: 0, hailLeft: 0, hailUntil: 0,
    ptaTarget: null, ptaCount: 0, ptaAt: 0, exposed: new Map(), fleetEnergy: 100, lastPos: null, combatSince: 0, lastChampCombatAt: 0,
    graspReady: false, aftershockUntil: 0, aftershockArmor: 0, aftershockMr: 0, phaseUntil: 0, firstStrikeUntil: 0,
    legend: 0, ultHunter: 0, harvestSouls: 0, boneLeft: 0, boneUntil: 0, secondWindUntil: 0, graspHp: 0, minionKills: 0,
    manaflow: 0, dynAD: 0, dynAP: 0, dynMsPercent: 0, dynAsPercent: 0,
  };
}
function runeLevelLerp(ctrl, a, b) { const l = Math.max(1, Math.min(18, (ctrl && ctrl.champLevel) || 1)); return a + (b - a) * (l - 1) / 17; }
function runeAdaptiveIsAP(ctrl) {
  const ap = (ctrl.itemBonusAP || 0) + (ctrl.bonusAP || 0), ad = (ctrl.itemBonusAD || 0) + (ctrl.bonusAD || 0);
  if (ap !== ad) return ap > ad;
  return RUNE_ADAPTIVE_AP_CHAMPS.has(ctrl.championId);
}
function runeIsRanged(ctrl) { return typeof isRangedAttacker === 'function' && isRangedAttacker(ctrl); }
function runeBonusAD(ctrl) { return (ctrl.itemBonusAD || 0) + (ctrl.bonusAD || 0) + (ctrl.runeAD || 0); }
// 룬 피해(적응형): 추가 공격력이 크면 물리, 아니면 마법. isItemEffect로 넣어 다른 룬·아이템이 다시 터지지 않게 한다.
function runeDeal(ctrl, target, raw, type = null) {
  if (!target || target.hp <= 0 || !(raw > 0)) return 0;
  const damageType = type || (runeAdaptiveIsAP(ctrl) ? DAMAGE_TYPE.MAGICAL : DAMAGE_TYPE.PHYSICAL);
  return applyDamage(target, { rawDamage: raw, damageType, isCritical: false, critMultiplier: 1, source: ctrl, isItemEffect: true, isRuneEffect: true }) || 0;
}
function runeHeal(ctrl, amount) {
  if (!(amount > 0)) return;
  const mult = typeof getHealReceivedMultiplier === 'function' ? getHealReceivedMultiplier(ctrl) : 1;
  ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + amount * mult * (runeHas(ctrl, 'Revitalize') ? 1.05 : 1));
  if (typeof updateBars === 'function') updateBars(ctrl);
}
function runeCdReady(ctrl, key) { return !(ctrl._rune.cds[key] > performance.now()); }
function runeSetCd(ctrl, key, sec) { ctrl._rune.cds[key] = performance.now() + sec * 1000; }
function runeFx(target, color) {
  if (typeof vfx !== 'undefined' && target && typeof getWorldPosition === 'function') {
    const p = getWorldPosition(target); if (p) vfx.spawn('hit', p.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color });
  }
}

/* ---------------- 정적 능력치(recomputeStats 앞) ---------------- */
function runeComputeStatic(ctrl) {
  if (!ctrl) return;
  if (!ctrl._rune) runeResetState(ctrl);
  const p = ctrl.runePage;
  let adaptive = 0, asPct = 0, ah = 0, msPct = 0, hp = 0, ten = 0, slowRes = 0, armor = 0, mr = 0, vamp = 0, mana = 0, ultAh = 0;
  if (p) {
    for (const key of p.shards || []) {
      const e = RUNE_SHARD_EFFECTS[key] || {};
      adaptive += e.adaptive || 0; asPct += e.asPercent || 0; ah += e.ah || 0; msPct += e.msPercent || 0; hp += e.hp || 0; ten = 1 - (1 - ten) * (1 - (e.tenacity || 0)); slowRes = 1 - (1 - slowRes) * (1 - (e.slowResist || 0)); /* 83차: 곱연산 */
      if (e.hpScale) hp += runeLevelLerp(ctrl, e.hpScale[0], e.hpScale[1]);
    }
    const r = ctrl._rune, lvl = ctrl.champLevel || 1;
    const legend = Math.min(10, r.legend || 0);
    if (runeHas(ctrl, 'LegendAlacrity')) asPct += 0.03 + 0.015 * legend;
    if (runeHas(ctrl, 'LegendHaste')) ah += 1.5 * legend;
    if (runeHas(ctrl, 'LegendBloodline')) { vamp += 0.0035 * Math.min(15, (r.legend || 0) * 1.5); if ((r.legend || 0) >= 10) hp += 85; }
    if (runeHas(ctrl, 'UltimateHunter')) ultAh += 6 + 5 * Math.min(5, r.ultHunter || 0);
    if (runeHas(ctrl, 'Transcendence')) ah += (lvl >= 5 ? 5 : 0) + (lvl >= 8 ? 5 : 0);
    if (runeHas(ctrl, 'Celerity')) msPct += 0.01;
    if (runeHas(ctrl, 'Unflinching')) { ten = 1 - (1 - ten) * 0.9; slowRes = 1 - (1 - slowRes) * 0.9; } // 83차: 강인함과 둔화 저항 둘 다
    if (runeHas(ctrl, 'Conditioning') && runeGameMinutes() >= 12) { armor += 8; mr += 8; }
    if (runeHas(ctrl, 'Overgrowth')) hp += 3 * Math.floor((r.minionKills || 0) / 8);
    if (runeHas(ctrl, 'GraspOfTheUndying')) hp += r.graspHp || 0;
    if (runeHas(ctrl, 'ManaflowBand')) mana += r.manaflow || 0;
    if (runeHas(ctrl, 'GatheringStorm')) adaptive += [0, 8, 24, 48, 80, 120][Math.min(5, Math.floor(runeGameMinutes() / 10))];
    adaptive += r.dynAdaptive || 0;
    armor += r.aftershockArmor || 0; mr += r.aftershockMr || 0;
  }
  const isAP = runeAdaptiveIsAP(ctrl);
  ctrl.runeAD = isAP ? 0 : adaptive * 0.6;
  ctrl.runeAP = isAP ? adaptive : 0;
  ctrl.runeAttackSpeedPercent = asPct; ctrl.runeAbilityHaste = ah; ctrl.runeUltimateHaste = ultAh; ctrl.runeMsPercent = msPct;
  ctrl.runeMaxHp = hp; ctrl.runeTenacity = ten; ctrl.runeSlowResist = slowRes; ctrl.runeArmor = armor; ctrl.runeMr = mr; ctrl.runePhysicalVamp = vamp; ctrl.runeMana = mana;
}
function runeGameMinutes() {
  const s = typeof getTurretGameTimeSec === 'function' ? getTurretGameTimeSec() : 0;
  return (s || 0) / 60;
}
// 동적 적응형(정복자 중첩·절대 집중) - 바뀌면 스탯을 다시 계산한다.
function _runeSetDynAdaptive(ctrl, v) {
  const r = ctrl._rune; if (Math.abs((r.dynAdaptive || 0) - v) < 0.01) return;
  r.dynAdaptive = v; ctrl.recomputeStats();
}

/* ---------------- 매 프레임 ---------------- */
function runeTick(ctrl, dt) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune) return;
  const r = ctrl._rune, now = performance.now();
  // 기민한 발놀림 충전: 이동 거리(LoL 24당 1)
  if (ctrl.root) {
    const p = ctrl.root.position;
    if (r.lastPos) { const d = Math.hypot(p.x - r.lastPos.x, p.z - r.lastPos.z); if (d < 5) r.fleetEnergy = Math.min(100, r.fleetEnergy + worldDistanceToLol(d) / 24); }
    r.lastPos = { x: p.x, z: p.z };
  }
  // 착취의 손아귀: 챔피언과 전투 4초 지속 → 다음 평타 강화
  if (runeHas(ctrl, 'GraspOfTheUndying')) {
    const inCombat = now - r.lastChampCombatAt < 4000;
    if (!inCombat) r.combatSince = 0;
    else if (!r.combatSince) r.combatSince = now;
    if (inCombat && now - r.combatSince >= 4000) r.graspReady = true;
  }
  let dyn = 0;
  if (r.conquerorUntil <= now && r.conquerorStacks) r.conquerorStacks = 0;
  if (runeHas(ctrl, 'Conqueror')) dyn += r.conquerorStacks * runeLevelLerp(ctrl, 1.8, 4);
  if (runeHas(ctrl, 'AbsoluteFocus') && ctrl.hp / Math.max(1, ctrl.maxHp) > 0.7) dyn += runeLevelLerp(ctrl, 3, 30);
  _runeSetDynAdaptive(ctrl, dyn);
  if (r.tempoUntil <= now) r.tempoStacks = 0;
  if (r.hailUntil <= now) r.hailLeft = 0;
  const hailAs = r.hailLeft > 0 ? (runeIsRanged(ctrl) ? 0.8 : 1.1) : 0;
  const tempoAs = r.tempoStacks * (runeIsRanged(ctrl) ? 0.04 : 0.06);
  r.dynAsPercent = hailAs + tempoAs;
  r.dynMsPercent = r.phaseUntil > now ? (runeIsRanged(ctrl) ? runeLevelLerp(ctrl, 0.15, 0.4) : runeLevelLerp(ctrl, 0.3, 0.6)) : (r.fleetMsUntil > now ? 0.2 : 0);
  // 여진 끝: 폭발
  if (r.aftershockUntil && now >= r.aftershockUntil) {
    r.aftershockUntil = 0; r.aftershockArmor = 0; r.aftershockMr = 0; ctrl.recomputeStats();
    const raw = runeLevelLerp(ctrl, 25, 120) + 0.08 * Math.max(0, ctrl.maxHp - (computeChampionStats(ctrl.championId, ctrl.champLevel)?.maxHp || ctrl.maxHp));
    for (const { unit } of findEnemiesInRadius(ctrl.root.position, 300)) if (unit && !unit.isStructure) runeDeal(ctrl, unit, raw, DAMAGE_TYPE.MAGICAL);
    if (typeof vfx !== 'undefined') vfx.groundShockwave(ctrl.root.position.clone(), lolRangeToWorld(300), 0x7fc8ff, 0.4);
  }
  // 재생의 바람: 챔피언에게 피해를 입은 뒤 10초간 잃은 체력의 3% 회복
  if (r.secondWindUntil > now) runeHeal(ctrl, (ctrl.maxHp - ctrl.hp) * 0.03 / 10 * dt);
  // 노출(집중 공격) 만료
  for (const [u, t] of r.exposed) if (t <= now) r.exposed.delete(u);
}
// 공격 속도·이동 속도(동적) 합계 - character_controller 매 프레임 스탯 갱신에서 더한다.
function runeAttackSpeedBonus(ctrl) { return (ctrl && ((ctrl.runeAttackSpeedPercent || 0) + ((ctrl._rune && ctrl._rune.dynAsPercent) || 0))) || 0; }
function runeMoveSpeedBonus(ctrl) { return (ctrl && ((ctrl.runeMsPercent || 0) + ((ctrl._rune && ctrl._rune.dynMsPercent) || 0))) || 0; }

/* ---------------- 피해를 줄 때 ---------------- */
function runeOnDamageDealt(ctrl, target, finalDmg, damageType, meta) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune || !target || !(finalDmg > 0)) return;
  if (meta && (meta.isItemEffect || meta.isRuneEffect)) return;
  const r = ctrl._rune, now = performance.now(), champ = !!target.isChampion;
  if (meta && meta.isOnHitBonus) return; // 90차: 같은 기본 공격의 적중 효과 추가 피해(세트 오른손·이 E)는 공격을 한 번 더 한 것으로 세지 않는다
  const isAttack = !!(meta && meta.isBasicAttack), isTick = !!(meta && meta.isStatusTick);
  if (champ) {
    if (!r.lastChampCombatAt || now - r.lastChampCombatAt > 3000) {
      if (runeHas(ctrl, 'FirstStrike') && runeCdReady(ctrl, 'FirstStrike')) { r.firstStrikeUntil = now + 3000; runeSetCd(ctrl, 'FirstStrike', 25); runeFx(target, 0xffd76b); }
    }
    r.lastChampCombatAt = now;
  }
  // 피해 증폭류(실제 피해의 % 추가 고정 피해로 근사)
  let amp = 0;
  if (r.firstStrikeUntil > now && champ) amp += 0.07;
  if (r.exposed.has(target)) amp += 0.08;
  const thp = target.maxHp ? target.hp / target.maxHp : 1;
  if (runeHas(ctrl, 'CoupDeGrace') && thp < 0.4) amp += 0.08;
  if (runeHas(ctrl, 'CutDown') && target.maxHp > ctrl.maxHp * 1.1) amp += Math.min(0.15, 0.05 + 0.1 * Math.min(1, (target.maxHp / ctrl.maxHp - 1.1) / 0.9));
  if (runeHas(ctrl, 'LastStand')) { const myHp = ctrl.hp / Math.max(1, ctrl.maxHp); if (myHp < 0.6) amp += 0.05 + 0.06 * Math.min(1, (0.6 - myHp) / 0.3); }
  if (amp > 0) runeDeal(ctrl, target, finalDmg * amp, DAMAGE_TYPE.TRUE);
  if (!champ || isTick) return;
  // 개별 적중 기록(감전·폭풍전사의 포효 - 같은 순간 여러 번은 1회)
  let list = r.hits.get(target) || [];
  list = list.filter((h) => now - h.t < 4000);
  if (!list.length || now - list[list.length - 1].t > 60) list.push({ t: now, attack: isAttack });
  r.hits.set(target, list);
  const in3 = list.filter((h) => now - h.t < 3000).length;
  if (runeHas(ctrl, 'Electrocute') && in3 >= 3 && runeCdReady(ctrl, 'Electrocute')) {
    runeSetCd(ctrl, 'Electrocute', runeLevelLerp(ctrl, 25, 20));
    runeDeal(ctrl, target, runeLevelLerp(ctrl, 30, 220) + 0.1 * runeBonusAD(ctrl) + 0.05 * (ctrl.stats.abilityPower || 0));
    runeFx(target, 0xff3355); r.hits.set(target, []);
  }
  if (runeHas(ctrl, 'PhaseRush') && list.length >= 3 && runeCdReady(ctrl, 'PhaseRush')) { runeSetCd(ctrl, 'PhaseRush', 15); r.phaseUntil = now + 3000; r.hits.set(target, []); }
  if (runeHas(ctrl, 'DarkHarvest') && runeCdReady(ctrl, 'DarkHarvest') && target.hp > 0 && thp < 0.5) {
    runeSetCd(ctrl, 'DarkHarvest', 25);
    runeDeal(ctrl, target, runeLevelLerp(ctrl, 20, 60) + 5 * r.harvestSouls + 0.1 * runeBonusAD(ctrl) + 0.05 * (ctrl.stats.abilityPower || 0));
    r.harvestSouls += 1; runeFx(target, 0xb02a3a);
  }
  if (runeHas(ctrl, 'SummonAery') && runeCdReady(ctrl, 'SummonAery')) {
    runeSetCd(ctrl, 'SummonAery', 2);
    runeDeal(ctrl, target, runeLevelLerp(ctrl, 10, 50) + 0.1 * runeBonusAD(ctrl) + 0.05 * (ctrl.stats.abilityPower || 0));
  }
  if (!isAttack && runeHas(ctrl, 'ArcaneComet') && runeCdReady(ctrl, 'ArcaneComet')) {
    runeSetCd(ctrl, 'ArcaneComet', runeLevelLerp(ctrl, 20, 8));
    const raw = runeLevelLerp(ctrl, 30, 100) + 0.35 * runeBonusAD(ctrl) + 0.2 * (ctrl.stats.abilityPower || 0);
    setTimeout(() => { if (target.hp > 0) { runeDeal(ctrl, target, raw); runeFx(target, 0xc58cff); } }, 750);
  }
  if (runeHas(ctrl, 'Conqueror')) {
    r.conquerorStacks = Math.min(12, r.conquerorStacks + (isAttack ? (runeIsRanged(ctrl) ? 1 : 2) : 2));
    r.conquerorUntil = now + 5000;
    if (r.conquerorStacks >= 12) runeHeal(ctrl, finalDmg * (runeIsRanged(ctrl) ? 0.05 : 0.08));
  }
  if (runeHas(ctrl, 'CheapShot') && runeCdReady(ctrl, 'CheapShot') && (target.statusEffects || []).some((e) => ['SLOW', 'STUN', 'ROOT', 'KNOCKUP', 'CHARM', 'FEAR', 'TAUNT', 'SUPPRESSION'].includes(e.type))) {
    runeSetCd(ctrl, 'CheapShot', 4); runeDeal(ctrl, target, runeLevelLerp(ctrl, 10, 45), DAMAGE_TYPE.TRUE);
  }
  if (runeHas(ctrl, 'TasteOfBlood') && runeCdReady(ctrl, 'TasteOfBlood')) {
    runeSetCd(ctrl, 'TasteOfBlood', 20); runeHeal(ctrl, runeLevelLerp(ctrl, 16, 40) + 0.1 * runeBonusAD(ctrl) + 0.05 * (ctrl.stats.abilityPower || 0));
  }
  if (!isAttack && runeHas(ctrl, 'Scorch') && runeCdReady(ctrl, 'Scorch')) {
    runeSetCd(ctrl, 'Scorch', 10);
    const raw = runeLevelLerp(ctrl, 20, 40);
    setTimeout(() => { if (target.hp > 0) runeDeal(ctrl, target, raw, DAMAGE_TYPE.MAGICAL); }, 1000);
  }
  if (!isAttack && runeHas(ctrl, 'ManaflowBand') && runeCdReady(ctrl, 'ManaflowBand') && (ctrl.maxMp || 0) > 0 && (r.manaflow || 0) < 250) {
    runeSetCd(ctrl, 'ManaflowBand', 15); r.manaflow = Math.min(250, (r.manaflow || 0) + 25); ctrl.recomputeStats();
  }
}

/* ---------------- 기본 공격 적중 ---------------- */
function runeOnBasicAttackHit(ctrl, target) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune || !target) return;
  const r = ctrl._rune, now = performance.now(), champ = !!target.isChampion;
  r.fleetEnergy = Math.min(100, r.fleetEnergy + 6);
  if (runeHas(ctrl, 'FleetFootwork') && r.fleetEnergy >= 100) {
    r.fleetEnergy = 0;
    runeHeal(ctrl, (runeLevelLerp(ctrl, 10, 100) + 0.1 * runeBonusAD(ctrl) + 0.05 * (ctrl.stats.abilityPower || 0)) * (target.isMinion ? 0.6 : 1));
    r.fleetMsUntil = now + 1000; runeFx(ctrl, 0x9cff7a);
  }
  if (!champ) return;
  if (runeHas(ctrl, 'HailOfBlades')) {
    if (r.hailLeft > 0) r.hailLeft -= 1;
    else if (runeCdReady(ctrl, 'HailOfBlades')) { runeSetCd(ctrl, 'HailOfBlades', 12); r.hailLeft = 2; r.hailUntil = now + 3000; }
  }
  if (runeHas(ctrl, 'LethalTempo')) { r.tempoStacks = Math.min(6, r.tempoStacks + 1); r.tempoUntil = now + 6000; }
  if (runeHas(ctrl, 'PressTheAttack')) {
    if (r.ptaTarget !== target || now - r.ptaAt > 4000) { r.ptaTarget = target; r.ptaCount = 0; }
    r.ptaCount += 1; r.ptaAt = now;
    if (r.ptaCount >= 3 && runeCdReady(ctrl, 'PressTheAttack')) {
      r.ptaCount = 0; runeSetCd(ctrl, 'PressTheAttack', 6);
      runeDeal(ctrl, target, runeLevelLerp(ctrl, 40, 160));
      r.exposed.set(target, now + 5000); runeFx(target, 0xffc04a);
    }
  }
  if (runeHas(ctrl, 'GraspOfTheUndying') && r.graspReady) {
    r.graspReady = false; r.combatSince = now;
    const ranged = runeIsRanged(ctrl);
    runeDeal(ctrl, target, ctrl.maxHp * (ranged ? 0.014 : 0.035), DAMAGE_TYPE.MAGICAL);
    runeHeal(ctrl, ctrl.maxHp * (ranged ? 0.0052 : 0.013));
    r.graspHp = (r.graspHp || 0) + (ranged ? 2 : 5); ctrl.recomputeStats(); runeFx(target, 0x7dffa0);
  }
}

/* ---------------- 피해를 받을 때 ---------------- */
function runeOnTakeDamage(ctrl, incoming, damageType, source, meta) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune || !(incoming > 0)) return incoming;
  const r = ctrl._rune, now = performance.now();
  const fromChamp = !!(source && source.isChampion && source !== ctrl);
  let dmg = incoming;
  if (fromChamp) {
    r.lastChampCombatAt = now;
    if (runeHas(ctrl, 'BonePlating')) {
      if (r.boneLeft > 0 && r.boneUntil > now) { dmg = Math.max(0, dmg - runeLevelLerp(ctrl, 30, 60)); r.boneLeft -= 1; }
      else if (runeCdReady(ctrl, 'BonePlating')) { runeSetCd(ctrl, 'BonePlating', 55); r.boneLeft = 3; r.boneUntil = now + 1500; }
    }
    if (runeHas(ctrl, 'SecondWind')) r.secondWindUntil = now + 10000;
  }
  if (runeHas(ctrl, 'NullifyingOrb') && damageType === DAMAGE_TYPE.MAGICAL && runeCdReady(ctrl, 'NullifyingOrb') && (ctrl.hp - dmg) / Math.max(1, ctrl.maxHp) < 0.3) {
    runeSetCd(ctrl, 'NullifyingOrb', 60);
    if (typeof addShield === 'function') addShield(ctrl, 'runeNullifyingOrb', runeLevelLerp(ctrl, 35, 110) + 0.14 * (ctrl.stats.abilityPower || 0) + 0.09 * runeBonusAD(ctrl), 4);
  }
  return dmg;
}

/* ---------------- 처치·CC ---------------- */
function runeOnTakedown(ctrl) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune) return;
  const r = ctrl._rune;
  if (runeHas(ctrl, 'Triumph')) runeHeal(ctrl, (ctrl.maxHp - ctrl.hp) * 0.1);
  if (runeHas(ctrl, 'AbsorbLife')) runeHeal(ctrl, ctrl.maxHp * 0.05);
  if (runeHas(ctrl, 'PresenceOfMind') && (ctrl.maxMp || 0) > 0) ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + ctrl.maxMp * 0.15);
  if (runeHas(ctrl, 'UltimateHunter')) r.ultHunter = Math.min(5, (r.ultHunter || 0) + 1);
  if (runeHas(ctrl, 'Transcendence') && (ctrl.champLevel || 1) >= 11) for (const k of ['Q', 'W', 'E']) if (ctrl.cooldowns[k] > 0) ctrl.cooldowns[k] *= 0.8;
  r.legend = Math.min(15, (r.legend || 0) + 1);
  ctrl.recomputeStats();
}
function runeOnMinionKill(ctrl) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune) return;
  const r = ctrl._rune;
  r.minionKills = (r.minionKills || 0) + 1;
  const before = Math.floor((r.legend || 0));
  r.legend = Math.min(15, (r.legend || 0) + 0.25);
  if (Math.floor(r.legend) !== before || (runeHas(ctrl, 'Overgrowth') && r.minionKills % 8 === 0)) ctrl.recomputeStats();
}
function runeOnImpair(ctrl, target, effectType) {
  if (!ctrl || !ctrl.runePage || !ctrl._rune || !target || !target.isChampion) return;
  const r = ctrl._rune;
  if (effectType !== 'SLOW' && runeHas(ctrl, 'Aftershock') && runeCdReady(ctrl, 'Aftershock')) {
    runeSetCd(ctrl, 'Aftershock', 20);
    const base = computeChampionStats(ctrl.championId, ctrl.champLevel) || {};
    const cap = runeLevelLerp(ctrl, 80, 150);
    r.aftershockArmor = Math.min(cap, 35 + 0.8 * Math.max(0, (ctrl.stats.armor || 0) - (base.armor || 0)));
    r.aftershockMr = Math.min(cap, 35 + 0.8 * Math.max(0, (ctrl.stats.magicResist || 0) - (base.magicResist || 0)));
    r.aftershockUntil = performance.now() + 2500; ctrl.recomputeStats(); runeFx(ctrl, 0x7fc8ff);
  }
}
