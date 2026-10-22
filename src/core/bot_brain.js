/* bot_brain.js — 95차: 적 챔피언 AI(두뇌)
 *
 * 봇은 플레이어와 똑같은 CharacterController다. 두뇌는 플레이어가 누르는 것과 같은 명령만 내린다
 * (moveTo·selectTarget·castAbility·castSummonerSpell·levelUpSkill·buildOrBuyItem) - 규칙 판정은 모두 기존 코드가 한다.
 * 판정은 봇 입장(withCombatActor)에서 돈다: 봇이 쓰는 스킬의 "적"은 플레이어 팀이다(01_hit_detection.js getAllEnemyUnits).
 *
 * 행동(생각 주기마다 하나):
 *  - 후퇴: 체력이 낮거나(난이도별 기준) 상대 포탑이 나를 노리면 아군 쪽으로 물러난다. 칼바람 나락은 우물 회복이 없어서
 *    아군 포탑 뒤에서 체력이 돌아올 때까지(재생·회복 유물) 기다린다. 아주 낮으면 점멸로 도망친다.
 *  - 교전: 상대 챔피언이 교전 거리 안에 보이면(봇 팀 시야) 스킬 → 평타. 상대 포탑 아래로는 쫓아 들어가지 않는다
 *    (상대가 빈사이고 내가 건강하면 예외).
 *  - 라인: 아군 미니언 무리 바로 뒤에 서서 막타(평타 한 방이면 죽는 미니언)를 친다. 아군 미니언이 포탑을 치고 있으면 포탑도 친다.
 *    아군 미니언이 없으면 아군 맨 앞 포탑 근처에서 기다린다. 맵·구조물이 없는 연습 공간에서는 상대 챔피언을 찾아간다.
 *  - 레벨 업마다 스킬 포인트를 R > Q > E > W 순서로 찍고, 죽어 있거나 기지에 있을 때 역할별 추천 아이템을 산다.
 *
 * 스킬 사용: skill_aim_system.js의 조준 정의(SKILL_AIM - 종류·사거리)를 그대로 읽는다. 대상 지정은 대상에게, 직선·지점 스킬은
 * 상대의 이동을 조금 앞질러(난이도별) 겨누고, 돌진은 평타 사거리 밖의 상대에게 붙을 때 쓴다. 바루스 Q는 충전 후 놓는다.
 * 난이도: easy(생각 0.45초·스킬 50%·막타 안 함) / normal(0.25초·85%) / hard(0.12초·100%·예측 사격).
 */
const BOT_DIFFICULTY = {
  easy: { thinkSec: 0.45, reactSec: 0.6, skillChance: 0.5, lead: 0, lastHit: false, retreatPct: 0.2, engageExtraLol: 250, diveHpPct: 1.1 },
  normal: { thinkSec: 0.25, reactSec: 0.35, skillChance: 0.85, lead: 0.5, lastHit: true, retreatPct: 0.3, engageExtraLol: 400, diveHpPct: 0.25 },
  hard: { thinkSec: 0.12, reactSec: 0.15, skillChance: 1, lead: 1, lastHit: true, retreatPct: 0.32, engageExtraLol: 550, diveHpPct: 0.35 },
};
const BOT_SKILL_ORDER = ['Q', 'E', 'W'];
const BOT_LEVEL_ORDER = ['R', 'Q', 'E', 'W'];
const BOT_SAFE_RECOVER_PCT = 0.7; // 후퇴 뒤 이만큼 회복하면 다시 라인으로
// 직선·지점 스킬의 대략적인 탄속(LoL 단위/초) - 예측 사격용. 스킬 데이터에 speed가 있으면 그것을 쓴다.
const BOT_DEFAULT_SKILL_SPEED_LOL = 1600;

function _botW(lol) { return lolRangeToWorld(lol || 0); }
function _botPos(u) { return getWorldPosition(u); }
function _botDist(a, b) { return getHorizontalDistance(_botPos(a), _botPos(b)); }
// 평타 사거리(월드, 가장자리 기준이라 시전자 반경을 더한다).
function botAttackRangeWorld(bot) { return ((bot.stats && bot.stats.attackRange) || _botW(150)) + (getCollisionRadius(bot) || 0); }
function _botEnemyTeam(team) { return team === 'RED' ? 'BLUE' : 'RED'; }

// 봇 팀이 지금 볼 수 있는가(시야 시스템이 꺼져 있으면 항상 보임).
function botCanSee(bot, unit) {
  if (typeof visionSystem === 'undefined' || !visionSystem || !visionSystem.enabled || typeof visionSystem.isVisibleTo !== 'function') return true;
  return visionSystem.isVisibleTo(bot.team, unit);
}
// 상대 팀 챔피언(살아 있고 대상 지정 가능, 봇 팀에게 보임) - 가까운 순.
function botEnemyChampions(bot) {
  return listChampionUnits()
    .filter((c) => c && c !== bot && c.team !== bot.team && isChampionAlive(c) && !c.isUntargetable && botCanSee(bot, c)
      && (typeof canRealmInteract !== 'function' || canRealmInteract(bot, c)))
    .sort((a, b) => _botDist(bot, a) - _botDist(bot, b));
}
// 봇의 평타 한 방 대략 피해(방어력 반영) - 막타 판단용.
function botEstimateAutoDamage(bot, target) {
  const ad = (bot.stats && bot.stats.attackDamage) || 0;
  const armor = Math.max(0, target.armor || 0);
  return ad * (100 / (100 + armor));
}
// 라인 진행도: 우리 분수 → 상대 분수 축에 투영한 거리(월드). 맵이 없으면 null.
function botLaneAxis(team) {
  if (typeof getTeamSpawnPosition !== 'function' || typeof howlingAbyssMap === 'undefined' || !howlingAbyssMap) return null;
  const a = getTeamSpawnPosition(team), b = getTeamSpawnPosition(_botEnemyTeam(team));
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const len = dir.length();
  if (len < 1e-6) return null;
  return { origin: a, dir: dir.multiplyScalar(1 / len), len };
}
function botLaneProgress(axis, pos) { return (pos.x - axis.origin.x) * axis.dir.x + (pos.z - axis.origin.z) * axis.dir.z; }
function botLanePoint(axis, progress, lateral = 0) {
  const p = axis.origin.clone().addScaledVector(axis.dir, progress);
  p.x += -axis.dir.z * lateral; p.z += axis.dir.x * lateral;
  return p;
}
// 상대 팀의 살아 있는 포탑 중 이 위치를 사거리에 두는 것(포탑 사거리 + 여유).
function botEnemyTurretCovering(bot, pos, extraLol = 0) {
  if (typeof turrets === 'undefined') return null;
  const r = _botW(TURRET_ATTACK_RANGE_LOL + extraLol);
  for (const t of turrets) {
    if (!t || t.destroyed || t.team === bot.team || !t.isStructure) continue;
    if (getHorizontalDistance(getWorldPosition(t), pos) <= r) return t;
  }
  return null;
}
// 이 포탑 사거리 안에 아군(봇 팀) 미니언이 있는가 - 있으면 포탑이 미니언을 먼저 친다.
function botAlliedMinionsUnderTurret(bot, turret) {
  if (typeof minions === 'undefined') return 0;
  const r = _botW(TURRET_ATTACK_RANGE_LOL);
  let n = 0;
  for (const m of minions) if (m && !m.isDead && m.team === bot.team && getHorizontalDistance(m.mesh.position, getWorldPosition(turret)) <= r) n++;
  return n;
}

// 스킬 하나를 지금 대상에게 쓸지 정한다 - { slot, point, target, kind } 또는 null. 순수 판단(명령은 내리지 않음).
function botPlanSkill(bot, slot, target, opts = {}) {
  if (!target || !bot.skillLevels || !(bot.skillLevels[slot] > 0)) return null;
  if ((bot.cooldowns && bot.cooldowns[slot]) > 0) return null;
  if (typeof skillAimSpec !== 'function') return null;
  const spec = skillAimSpec(bot.championId, slot);
  if (!spec) return null;
  const cd = bot._champData ? bot._champData() : null;
  const d = (cd && cd[slot]) || {};
  const tp = _botPos(target);
  const dist = _botDist(bot, target);
  const tr = getCollisionRadius(target) || 0;
  const aaRange = botAttackRangeWorld(bot);
  const instant = typeof skillAimIsInstant === 'function' && skillAimIsInstant(bot, slot);
  const lead = opts.lead || 0;
  const vel = opts.targetVel || null;
  const predict = (rangeW) => {
    if (!vel || !lead) return tp.clone();
    const speedW = _botW(d.speed || d.missileSpeed || BOT_DEFAULT_SKILL_SPEED_LOL);
    const t = Math.min(1, dist / Math.max(1e-6, speedW)) * lead;
    const p = tp.clone().addScaledVector(vel, t);
    const from = bot.root.position;
    const off = new THREE.Vector3(p.x - from.x, 0, p.z - from.z);
    if (rangeW && off.length() > rangeW) off.setLength(rangeW);
    return new THREE.Vector3(from.x + off.x, 0, from.z + off.z);
  };
  if (instant) {
    // 즉시 시전(자기 강화·자기 주변 범위·재시전): 상대가 가까울 때만. 범위가 데이터에 없으면 평타 사거리 + 150.
    const r = _botW(d.radius || d.range || d.aoeRadius || 0) || (aaRange + _botW(150));
    if (dist > r + tr) return null;
    return { slot, point: tp.clone(), target, kind: 'instant' };
  }
  const aim = typeof computeSkillAim === 'function' ? computeSkillAim(bot, slot, tp) : null;
  const rangeW = aim && aim.rangeWorld ? aim.rangeWorld : _botW(d.range || 0);
  switch (spec.type) {
    case 'unit':
      if (dist > rangeW + tr) return null;
      return { slot, point: tp.clone(), target, kind: 'unit' };
    case 'dash': case 'blink':
      // 돌진: 평타 사거리 밖의 상대에게 붙을 때(사거리 + 평타 사거리 안).
      if (opts.noGapClose || dist <= aaRange + tr || dist > rangeW + aaRange) return null;
      return { slot, point: tp.clone(), target, kind: 'dash' };
    case 'charge': {
      const maxR = _botW(d.maxRange || d.range || 0);
      if (dist > maxR + tr) return null;
      return { slot, point: predict(maxR), target, kind: 'charge', chargeSec: Math.min(1.5, (d.rangeChargeDuration || 1.5) * Math.min(1, dist / Math.max(1e-6, maxR)) + 0.15) };
    }
    case 'ally': case 'wall':
      return null; // 아군 대상(리 신 W)·바람 장막은 봇이 쓰지 않는다
    default: {
      // line / lineToPoint / circleAt / cone / trapezoid / rectAtPoint / selfAim
      const reach = rangeW + tr + (spec.type === 'circleAt' ? _botW(d.radius || 0) : 0);
      if (!(rangeW > 0) || dist > reach) return null;
      return { slot, point: predict(rangeW), target, kind: spec.type };
    }
  }
}

class BotBrain {
  constructor(bot, opts = {}) {
    this.bot = bot;
    this.difficulty = BOT_DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    this.cfg = BOT_DIFFICULTY[this.difficulty];
    this.mode = 'LANE';
    this.acc = Math.random() * this.cfg.thinkSec;
    this.seenAt = new Map(); // 상대를 처음 본 시각(반응 시간)
    this.lastTargetPos = null; this.targetVel = new THREE.Vector3();
    this.charge = null;
    this.nextCastAt = 0;
    this.lateral = (Math.random() - 0.5) * 2; // 라인에서 서는 옆 위치(-1~1)
    this.lastOrder = '';
    this.retreatSince = 0;
    this.slotBackoff = {}; // 시전했는데 재사용 대기가 안 걸린 스킬(대상별 쿨다운·중첩 부족 등) - 잠시 다시 시도하지 않는다
    this.lastAttempt = null;
  }
  setDifficulty(name) { if (BOT_DIFFICULTY[name]) { this.difficulty = name; this.cfg = BOT_DIFFICULTY[name]; } }
  tick(dt) {
    const b = this.bot;
    if (typeof gameEnded !== 'undefined' && gameEnded) return;
    this._spendSkillPoints();
    if (!isChampionAlive(b)) { this.mode = 'DEAD'; this._shop(); return; }
    if (this.mode === 'DEAD') { this.mode = 'LANE'; this._shop(); }
    if (typeof isPositionInBaseZone === 'function' && isPositionInBaseZone(b.root.position, b.team)) this._shop(); // 기지에 있으면 산다(1초에 한 번)
    this._tickCharge();
    this.acc += dt;
    if (this.acc < this.cfg.thinkSec) return;
    const step = this.acc; this.acc = 0;
    this.think(step);
  }
  _now() { return performance.now(); }
  _order(tag, fn) { this.lastOrder = tag; return fn(); }
  think(step) {
    const b = this.bot, cfg = this.cfg, now = this._now();
    const enemies = botEnemyChampions(b);
    for (const e of enemies) if (!this.seenAt.has(e)) this.seenAt.set(e, now);
    for (const k of [...this.seenAt.keys()]) if (!enemies.includes(k)) this.seenAt.delete(k);
    const target = enemies[0] || null;
    if (target) {
      const p = _botPos(target);
      if (this.lastTargetPos && step > 0) this.targetVel.set((p.x - this.lastTargetPos.x) / step, 0, (p.z - this.lastTargetPos.z) / step);
      this.lastTargetPos = p.clone();
    } else this.lastTargetPos = null;
    const hpPct = b.hp / Math.max(1, b.maxHp);
    const axis = botLaneAxis(b.team);
    const turretOnMe = typeof turrets !== 'undefined' ? turrets.find((t) => t && !t.destroyed && t.team !== b.team && t.attackTarget === b) : null;

    // 후퇴 판단
    if (this.mode !== 'RETREAT' && (hpPct < cfg.retreatPct || (turretOnMe && (!target || hpPct < 0.6)))) { this.mode = 'RETREAT'; this.retreatSince = now; }
    if (this.mode === 'RETREAT') {
      const safeEnough = hpPct >= BOT_SAFE_RECOVER_PCT || (!turretOnMe && hpPct >= cfg.retreatPct + 0.15 && (!target || _botDist(b, target) > _botW(1400)));
      if (safeEnough && !turretOnMe) this.mode = 'LANE';
      else return this._retreat(target, hpPct, axis, turretOnMe);
    }
    // 교전 판단
    if (target && this._shouldEngage(target, hpPct, axis)) { this.mode = 'FIGHT'; return this._fight(target); }
    this.mode = 'LANE';
    return this._lane(axis, target);
  }
  _engageRangeW() {
    const b = this.bot;
    let r = botAttackRangeWorld(b);
    for (const s of ['Q', 'W', 'E', 'R']) {
      const aim = typeof computeSkillAim === 'function' && typeof skillAimSpec === 'function' && skillAimSpec(b.championId, s) ? computeSkillAim(b, s, null) : null;
      if (aim && aim.rangeWorld && aim.rangeWorld < _botW(1300)) r = Math.max(r, aim.rangeWorld);
    }
    return r + _botW(this.cfg.engageExtraLol);
  }
  _shouldEngage(target, hpPct, axis) {
    const b = this.bot;
    if (this._now() - (this.seenAt.get(target) || 0) < this.cfg.reactSec * 1000) return false; // 반응 시간
    if (_botDist(b, target) > this._engageRangeW()) return false;
    // 상대 포탑 아래로는 들어가지 않는다(상대가 빈사이고 내가 건강하거나, 아군 미니언이 포탑을 맞고 있으면 예외).
    const tTurret = botEnemyTurretCovering(b, _botPos(target), 50);
    if (tTurret) {
      const targetLow = target.hp / Math.max(1, target.maxHp) < this.cfg.diveHpPct && hpPct > 0.6;
      if (!targetLow && botAlliedMinionsUnderTurret(b, tTurret) < 2) return false;
    }
    // 내가 훨씬 불리하면(체력 비율이 크게 낮으면) 싸우지 않는다.
    const tPct = target.hp / Math.max(1, target.maxHp);
    if (hpPct < 0.5 && tPct > hpPct + 0.35) return false;
    return true;
  }
  _fight(target) {
    const b = this.bot, cfg = this.cfg, now = this._now();
    const la = this.lastAttempt;
    if (la && now - la.at > 300) {
      if (!((b.cooldowns && b.cooldowns[la.slot]) > 0) && !(b._varus && b._varus.qCharge)) this.slotBackoff[la.slot] = now + 2000;
      this.lastAttempt = null;
    }
    if (now >= this.nextCastAt && !this.charge && Math.random() < cfg.skillChance) {
      const order = [...BOT_SKILL_ORDER];
      const tPct = target.hp / Math.max(1, target.maxHp);
      if (tPct < 0.55 || b.hp / Math.max(1, b.maxHp) < 0.45) order.unshift('R'); // 궁극기는 마무리·위기 때
      for (const slot of order) {
        if ((this.slotBackoff[slot] || 0) > now) continue;
        if (this.lastAttempt && this.lastAttempt.slot === slot) continue; // 결과를 보기 전(300ms)에는 같은 스킬을 다시 누르지 않는다(96차 - 예전엔 계속 덮어써 헛시도 방지가 안 걸렸다)
        const plan = botPlanSkill(b, slot, target, { lead: cfg.lead, targetVel: this.targetVel });
        if (!plan) continue;
        this.nextCastAt = now + cfg.reactSec * 500;
        return this._cast(plan);
      }
    }
    if (b.currentTarget !== target || !b.attackOrderActive) {
      return this._order('attack', () => { b.attackOrderActive = true; return b.selectTarget(target); });
    }
    return null;
  }
  _cast(plan) {
    const b = this.bot;
    this.lastAttempt = { slot: plan.slot, at: this._now() };
    if (plan.kind === 'unit') b.currentTarget = plan.target;
    if (plan.kind === 'charge') {
      const ok = this._order('cast' + plan.slot, () => b.castAbility(plan.slot, plan.point));
      this.charge = { slot: plan.slot, target: plan.target, releaseAt: this._now() + plan.chargeSec * 1000 };
      return ok;
    }
    return this._order('cast' + plan.slot, () => b.castAbility(plan.slot, plan.point));
  }
  // 충전형(바루스 Q): 충전을 시작했으면 정한 시간 뒤 대상 쪽으로 놓는다.
  _tickCharge() {
    const c = this.charge, b = this.bot;
    if (!c) return;
    const charging = b._varus && b._varus.qCharge;
    if (!charging && this._now() > c.releaseAt + 300) { this.charge = null; return; }
    if (charging && this._now() >= c.releaseAt) {
      const t = c.target && isChampionAlive(c.target) ? _botPos(c.target).clone() : b.root.position.clone().add(new THREE.Vector3(0, 0, 1));
      this.charge = null;
      this._order('release' + c.slot, () => b.castAbility(c.slot, t));
    }
  }
  _retreat(target, hpPct, axis, turretOnMe) {
    const b = this.bot;
    // 아주 위험하면 점멸로 도망친다.
    if (target && hpPct < 0.15 && _botDist(b, target) < _botW(500) && b.summoners) {
      const slot = Object.keys(b.summoners).find((k) => b.summoners[k] && b.summoners[k].id === 'flash' && !(b.summoners[k].readyAt > this._now()));
      if (slot && typeof castSummonerSpell === 'function') {
        const home = typeof getTeamSpawnPosition === 'function' ? getTeamSpawnPosition(b.team) : b.root.position.clone();
        castSummonerSpell(b, slot, home, null);
      }
    }
    let dest;
    if (axis) {
      // 아군 포탑(가장 앞 것) 뒤쪽으로. 없으면 분수.
      const own = (typeof turrets !== 'undefined' ? turrets : []).filter((t) => t && !t.destroyed && t.team === b.team && t.isStructure);
      const progs = own.map((t) => botLaneProgress(axis, getWorldPosition(t)));
      const front = progs.length ? Math.max(...progs) : 0;
      dest = botLanePoint(axis, Math.max(0, front - _botW(500)), this.lateral * _botW(120));
    } else {
      const away = target ? new THREE.Vector3().subVectors(b.root.position, _botPos(target)).setY(0) : new THREE.Vector3(0, 0, 1);
      if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
      dest = b.root.position.clone().addScaledVector(away.normalize(), _botW(800));
    }
    if (getHorizontalDistance(b.root.position, dest) > _botW(60)) return this._move('retreat', dest);
    return null;
  }
  // 곧장 가는 길이 구조물(포탑·억제기·넥서스)을 지나면 그 옆으로 먼저 간다 - 이동은 직선이라 구조물에 막혀 멈췄다(길찾기 없음).
  _detour(from, dest) {
    const structs = [...(typeof turrets !== 'undefined' ? turrets : []), ...(typeof inhibitorBuildings !== 'undefined' ? inhibitorBuildings : []), ...(typeof nexusBuildings !== 'undefined' ? nexusBuildings : [])]
      .filter((t) => t && t.isStructure);
    const me = getCollisionRadius(this.bot) || 0, margin = _botW(60);
    const dx = dest.x - from.x, dz = dest.z - from.z, len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) return dest;
    let best = null;
    for (const t of structs) {
      const c = getWorldPosition(t), r = (getCollisionRadius(t) || 0) + me + margin;
      const u = ((c.x - from.x) * dx + (c.z - from.z) * dz) / len2;
      if (u <= 0 || u >= 1) continue;
      const px = from.x + dx * u, pz = from.z + dz * u;
      const d = Math.hypot(px - c.x, pz - c.z);
      if (d >= r || (best && u >= best.u)) continue;
      // 길이 구조물 중심의 어느 쪽을 지나는지에 따라 그쪽 옆으로(중심을 지나면 길의 왼쪽).
      let nx = px - c.x, nz = pz - c.z;
      if (Math.hypot(nx, nz) < 1e-6) { const l = Math.sqrt(len2); nx = -dz / l; nz = dx / l; }
      const nl = Math.hypot(nx, nz);
      best = { u, p: new THREE.Vector3(c.x + nx / nl * (r + margin), 0, c.z + nz / nl * (r + margin)) };
    }
    return best ? best.p : dest;
  }
  _move(tag, dest) {
    const b = this.bot;
    dest = this._detour(b.root.position, dest);
    if (b.targetPos && getHorizontalDistance(b.targetPos, dest) < _botW(40) && b.state === STATE.MOVE) return null; // 같은 곳으로 이미 가는 중
    b.attackOrderActive = false; b.currentTarget = null;
    return this._order(tag, () => b.moveTo(dest));
  }
  _lane(axis, target) {
    const b = this.bot, cfg = this.cfg;
    if (!axis) {
      // 맵이 없는 연습 공간: 상대 챔피언에게 다가간다.
      if (target) return this._move('seek', _botPos(target).clone());
      return null;
    }
    const allies = (typeof minions !== 'undefined' ? minions : []).filter((m) => m && !m.isDead && m.team === b.team);
    const foes = (typeof minions !== 'undefined' ? minions : []).filter((m) => m && !m.isDead && m.team !== b.team && botCanSee(b, m));
    const aa = botAttackRangeWorld(b);
    // 막타: 평타 한 방이면 죽는 미니언(가까운 것부터).
    if (cfg.lastHit) {
      const lh = foes.filter((m) => _botDist(b, m) <= aa + _botW(350) && m.hp <= botEstimateAutoDamage(b, m) * 1.05
        && !botEnemyTurretCovering(b, m.mesh.position, -50))
        .sort((x, y) => _botDist(b, x) - _botDist(b, y))[0];
      if (lh) { if (b.currentTarget !== lh) return this._order('lasthit', () => { b.attackOrderActive = true; return b.selectTarget(lh); }); return null; }
    }
    // 아군 미니언이 포탑을 치고 있으면 포탑도 친다.
    const turretUnderAttack = (typeof turrets !== 'undefined' ? turrets : []).find((t) => t && !t.destroyed && t.team !== b.team && t.isStructure
      && !(typeof isStructureProtected === 'function' && isStructureProtected(t)) && botAlliedMinionsUnderTurret(b, t) >= 2);
    if (turretUnderAttack && !target) {
      if (b.currentTarget !== turretUnderAttack) return this._order('siege', () => { b.attackOrderActive = true; return b.selectTarget(turretUnderAttack); });
      return null;
    }
    // 미니언끼리 싸우는 중이면 상대 미니언을 친다(체력이 낮은 것 - 쉬움은 안 함).
    if (foes.length && allies.length && this.difficulty !== 'easy') {
      const near = foes.filter((m) => _botDist(b, m) <= aa + _botW(150) && !botEnemyTurretCovering(b, m.mesh.position, 0));
      if (near.length) {
        const pick = near.sort((x, y) => x.hp - y.hp)[0];
        if (b.currentTarget !== pick) return this._order('push', () => { b.attackOrderActive = true; return b.selectTarget(pick); });
        return null;
      }
    }
    // 서 있을 곳: 아군 미니언 맨 앞 바로 뒤. 아군 미니언이 없으면 아군 맨 앞 포탑 근처.
    // (새 웨이브가 아직 아군 맨 앞 포탑에 오지 않았으면 포탑 옆에서 기다린다 - 기지까지 되돌아가지 않게.)
    const own = (typeof turrets !== 'undefined' ? turrets : []).filter((t) => t && !t.destroyed && t.team === b.team && t.isStructure);
    const turretFront = own.length ? Math.max(...own.map((t) => botLaneProgress(axis, getWorldPosition(t)))) - _botW(150) : axis.len * 0.3;
    const front = allies.length ? Math.max(Math.max(...allies.map((m) => botLaneProgress(axis, m.mesh.position))) - _botW(220), turretFront - _botW(450)) : turretFront;
    let dest = botLanePoint(axis, front, this.lateral * _botW(150));
    // 상대 포탑 사거리 안이고 아군 미니언이 그 포탑을 맞고 있지 않으면 사거리 밖으로 물러선다.
    const cover = botEnemyTurretCovering(b, dest, 80);
    if (cover && botAlliedMinionsUnderTurret(b, cover) < 2) {
      const tp = botLaneProgress(axis, getWorldPosition(cover));
      dest = botLanePoint(axis, tp - _botW(TURRET_ATTACK_RANGE_LOL + 200), this.lateral * _botW(150));
    }
    if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) dest = howlingAbyssMap.clampPosition(dest);
    if (getHorizontalDistance(b.root.position, dest) > _botW(90)) return this._move('lane', dest);
    if (b.state === STATE.MOVE && !b.currentTarget) return null;
    return null;
  }
  _spendSkillPoints() {
    const b = this.bot;
    let guard = 4;
    while ((b.skillPoints || 0) > 0 && guard-- > 0) {
      const before = b.skillPoints;
      for (const s of BOT_LEVEL_ORDER) { if (typeof b.levelUpSkill === 'function' && b.levelUpSkill(s)) break; }
      if (b.skillPoints === before) break;
    }
  }
  // 죽어 있거나 기지에 있을 때 역할별 추천 아이템을 산다(신발 → 핵심 순서, 모자라면 재료부터).
  _shop() {
    const b = this.bot;
    if (typeof buildOrBuyItem !== 'function' || typeof SHOP_RECOMMENDED === 'undefined' || typeof ITEM_DATA === 'undefined') return;
    if ((this._shopAt || 0) > this._now()) return;
    this._shopAt = this._now() + 1000;
    const role = typeof _shopRole === 'function' ? _shopRole(b) : 'fighter';
    const rec = SHOP_RECOMMENDED[role] || SHOP_RECOMMENDED.fighter;
    const owned = new Set([...(b.items || []).filter(Boolean).map((s) => s.id), b.boots && b.boots.id].filter(Boolean));
    const wants = [];
    if (!b.boots || !b.boots.id || b.boots.id === 'boots') wants.push(rec.boots[0]);
    for (const id of rec.core) if (!owned.has(id)) wants.push(id);
    for (const id of wants.slice(0, 2)) {
      if (!ITEM_DATA[id]) continue;
      if (this._tryBuy(id, 3)) return;
    }
  }
  _tryBuy(id, depth) {
    const b = this.bot, it = ITEM_DATA[id];
    if (!it || depth < 0) return false;
    const goldBefore = b.gold || 0;
    if ((it.cost || 0) <= goldBefore) {
      buildOrBuyItem(b, id);
      if ((b.gold || 0) < goldBefore) return true;
    }
    for (const part of (it.recipe || [])) if (this._tryBuy(part, depth - 1)) return true;
    return false;
  }
}
