/* ============================================================
   노틸러스(Nautilus) 전투 로직
   ------------------------------------------------------------
   애쉬/바루스와 같은 패턴 - CharacterController.prototype 확장으로 챔피언
   전용 메서드를 두고, character_controller.js의 _onBasicAttackHit/
   _dispatchCast/_die()/update()에서 championId === 'nautilus'면 여기로
   위임한다. 수치는 전부 champion_data.js의 nautilus 항목에서 읽는다(출처와
   미확인 표시도 그쪽 주석 참고).

   이 데모에 맞춘 해석(명시):
   - Q의 "지형"은 맵 경계(HOWLING_ABYSS_MAP.isInsidePlayableArea)와
     구조물(포탑/억제기/넥서스)이다 - 이 맵에는 그 외의 벽이 없다.
   - Q 명중 시 "짧은 기절"은 서로 끌려가는 시간 동안의 기절로 표현했다
     (별도의 기절 수치를 만들지 않음).
   - W 보호막은 엔진의 단일 보호막 풀(this.shield)에 더해지며, 남은 W
     보호막만큼을 따로 추적해 지속시간이 끝나면 그만큼만 걷어낸다.
   ============================================================ */

CharacterController.prototype._nautilusIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};

CharacterController.prototype._nautilusDir = function(mouseWorldPoint) {
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  return dir.normalize();
};

CharacterController.prototype._nautilusFinishAction = function(key) {
  if (this.currentActionKey !== key) return;
  this.currentActionKey = null; this.currentPhase = null;
  this._resumeAfterAction();
};

/* ---------------------------------------------------------------
   패시브 - 강력한 일격 / W 적중 시 추가 피해
   --------------------------------------------------------------- */

CharacterController.prototype._nautilusOnBasicAttackHit = function(target) {
  if (!target || target.hp <= 0 || target.isStructure) return;
  const cd = this._champData();
  const now = performance.now();
  const p = cd.passive;
  const readyAt = this._nautilus.passiveReadyAt.get(target) || 0;
  if (now >= readyAt) {
    this._nautilus.passiveReadyAt.set(target, now + p.sameTargetCooldownSec * 1000);
    const lvl = this.champLevel || 1;
    const dmg = p.bonusDamageAtLevel1 + (p.bonusDamageAtLevel18 - p.bonusDamageAtLevel1) * (Math.min(18, Math.max(1, lvl)) - 1) / 17;
    applyDamage(target, { rawDamage: dmg, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this, isBasicAttack: true });
    applyStatus(target, { id: 'nautilusPassive_root', type: 'ROOT', duration: valueByBreakpoints(p.rootByLevel, lvl), value: 1, source: this });
    debugSkillHit('Nautilus 패시브(강력한 일격)', target);
  }
  if (this._nautilusWActive()) this._nautilusApplyWOnHit(target);
};

// 실제 노틸러스.glb의 'Passive' 클립(강력한 일격 전용 내려찍기 모션)을, 이번
// 스윙이 패시브를 터뜨릴 스윙일 때(대상별 6초 쿨다운이 끝난 상태)만 평타 모션으로
// 쓴다. 우선순위 20 - W(Attack4, 10)보다 높다(champion_ability_database.js 주석의
// "패시브가 W보다 우선" 규칙). 실제 피해/속박은 그대로 _nautilusOnBasicAttackHit이 판정.
CharacterController.prototype._nautilusArmPassiveAnim = function(target) {
  const db = this._championAbilityDbEntry();
  const clip = db && db.passiveAttackClip;
  const ready = target && !target.isStructure && performance.now() >= (this._nautilus.passiveReadyAt.get(target) || 0);
  if (clip && ready && typeof this.findAnimation === 'function' && this.findAnimation(clip)) {
    this.registerAttackOverride({ id: 'nautilusPassive', clips: [clip], priority: 20, oneShot: true, uses: 1 });
  } else {
    this.clearAttackOverride('nautilusPassive');
  }
};

CharacterController.prototype._nautilusApplyWOnHit = function(target) {
  const w = this._champData().W;
  const lvl = Math.max(1, this.skillLevels.W || 1);
  const total = skillVal(w.onHitDamageByLevel, lvl) + w.onHitApRatio * (this.stats.abilityPower || 0);
  const center = getWorldPosition(target);
  const units = [target];
  for (const u of getAllEnemyUnits()) {
    if (!u || u === target || u.hp <= 0 || u.isStructure) continue;
    if (isInCircle(u, center, lolRangeToWorld(w.splashRadius))) units.push(u);
  }
  for (const u of units) {
    applyStatus(u, { id: 'nautilusW_dot', type: 'DOT', duration: w.onHitDotDurationSec, tickInterval: 0.5, totalDamage: total, damageType: DAMAGE_TYPE.MAGICAL, source: this });
  }
};

/* ---------------------------------------------------------------
   Q - 닻줄 견인
   --------------------------------------------------------------- */

CharacterController.prototype._nautilusCastQ = function(mouseWorldPoint, free = false) {
  if (!this._nautilusIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (this._nautilus.qTravel || this._nautilus.qPull) return;
  const q = this._champData().Q;
  const dir = this._nautilusDir(mouseWorldPoint);
  if (!this._payCost('Q', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'nautilusQ'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);
  this.playFirstAvailable(['Spell1'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  this._nautilus.qPending = { dir: dir.clone(), remainingFireSec: q.castTimeSec, free };
};

CharacterController.prototype._nautilusFireQ = function(p) {
  const q = this._champData().Q;
  this.currentPhase = 'ACTIVE';
  this._nautilusPlayQClip('travelClip', true);
  this._nautilus.qTravel = {
    dir: p.dir.clone(), pos: this.root.position.clone(), origin: this.root.position.clone(),
    maxDist: lolRangeToWorld(q.range), halfWidth: lolRangeToWorld(q.width) * 0.5,
    speed: lolRangeToWorld(q.missileSpeed), traveled: 0, free: p.free,
  };
};

CharacterController.prototype._nautilusIsTerrain = function(pos) {
  const map = (typeof window !== 'undefined' && window.HOWLING_ABYSS_MAP) || null;
  return !!(map && typeof map.isInsidePlayableArea === 'function' && !map.isInsidePlayableArea(pos));
};

CharacterController.prototype._nautilusTickQTravel = function(dt) {
  const t = this._nautilus.qTravel;
  if (!t) return;
  const step = Math.min(Math.max(0, t.maxDist - t.traveled), t.speed * dt);
  const prevTraveled = t.traveled;
  t.pos.addScaledVector(t.dir, step);
  t.traveled += step;
  // 29차: 예전엔 닻 대신 매 프레임 '맞음' 스프라이트를 찍어 잔상이 남았다 - 이제 닻·닻줄을 _nautilusUpdateChain()이 그린다.

  // 26차(판정 수정): 이번 프레임에 닻이 지나간 구간(직전 위치 → 지금 위치)을 폭(halfWidth)만큼 쓸고, 그 안에 든 대상 중
  // 경로상 가장 앞의 대상을 맞힌다. 예전엔 지금 위치 주변 원 안에 든 대상을 목록 순서대로 골라서
  // (1) 발사 직후 노틸러스 뒤·옆에 붙어 있던 대상이 맞았고 (2) 한 프레임에 둘이 걸리면 앞의 대상이 아닌 쪽이 맞을 수 있었다.
  // 발사 지점보다 뒤(중심이 진행 방향 반대쪽)에 있는 대상은 맞지 않는다.
  let best = null;
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0) continue;
    const up = getWorldPosition(u); if (!up) continue;
    const r = getCollisionRadius(u);
    const rel = new THREE.Vector3(up.x - t.origin.x, 0, up.z - t.origin.z);
    const along = rel.dot(t.dir);
    if (along < 0 || along < prevTraveled - r || along > t.traveled + r) continue;
    const lateral = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
    if (lateral > t.halfWidth + r) continue;
    const contact = Math.max(0, along - r); // 닻이 이 대상에 처음 닿는 진행 거리
    if (!best || contact < best.contact) best = { u, contact };
  }
  // 지형은 대상보다 앞에서 닿았을 때만(대상이 지형보다 앞이면 대상이 먼저 맞는다)
  if (this._nautilusIsTerrain(t.pos) && (!best || best.contact > t.traveled - step * 0.5)) { this._nautilus.qTravel = null; this._nautilusQHitTerrain(t); return; }
  if (best) {
    this._nautilus.qTravel = null;
    t.pos.copy(t.origin).addScaledVector(t.dir, Math.min(t.traveled, best.contact)); // 닿은 지점
    if (best.u.isStructure) this._nautilusQHitTerrain(t);
    else this._nautilusQHitUnit(best.u);
    return;
  }
  if (t.traveled >= t.maxDist - 1e-4) {
    this._nautilus.qTravel = null;
    debugSkillMiss('Nautilus Q(닻줄 견인)', '사거리 끝까지 아무것도 맞히지 못함');
    this._nautilusFinishAction('nautilusQ');
  }
};

// 지형(맵 경계/구조물) 명중 - 노틸러스만 그 지점으로 끌려가고, 재사용
// 대기시간과 마나 50%를 돌려받는다.
CharacterController.prototype._nautilusQHitTerrain = function(t) {
  const q = this._champData().Q;
  const refund = (q.terrainRefundPercent || 0) / 100;
  if (!t.free) {
    this.cooldowns.Q = Math.max(0, (this.cooldowns.Q || 0) * (1 - refund));
    const cost = this._skillCostFor('Q');
    if (cost) this.mp = Math.min(this.maxMp, this.mp + cost.mana * refund);
    updateBars(this);
  }
  const anchor = t.pos.clone().addScaledVector(t.dir, -(this.pathingRadius ?? this.collisionRadius)); // 26차: 지형 앞은 지형 충돌 반경만큼
  const map = (typeof window !== 'undefined' && window.HOWLING_ABYSS_MAP) || null;
  if (map && typeof map.clampPosition === 'function') map.clampPosition(anchor);
  anchor.y = this.root.position.y;
  this._nautilusStartPull(anchor, null);
  debugSkillHit('Nautilus Q(닻줄 견인 - 지형)', this, { refundPercent: q.terrainRefundPercent });
};

// 적 명중 - 피해 + 서로를 향해 끌려가 중간 지점에서 만난다. 끌려가는 동안
// 대상은 기절 상태다.
CharacterController.prototype._nautilusQHitUnit = function(unit) {
  const q = this._champData().Q;
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const raw = skillVal(q.damageByLevel, lvl) + q.apRatio * (this.stats.abilityPower || 0);
  applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
  const from = this.root.position.clone();
  const unitPos = getWorldPosition(unit).clone();
  const dir = new THREE.Vector3().subVectors(unitPos, from).setY(0);
  const dist = dir.length();
  if (dist > 1e-6) dir.divideScalar(dist); else dir.set(0, 0, 1);
  // 26차: 둘 사이 빈 거리(중심 거리 − 두 반경)를 반씩 나눠 서로 다가가 몸이 닿는 곳에서 만난다. 예전엔 중심 거리의
  // 절반 지점에서 각자 반경만큼 물러난 곳으로 보내서, 이미 붙어 있을 때(빈 거리 ≤ 0)는 노틸러스가 뒤로 밀리고 대상이
  // 반대쪽으로 밀려났다.
  const gap = Math.max(0, dist - this.collisionRadius - getCollisionRadius(unit));
  const selfTo = from.clone().addScaledVector(dir, gap * 0.5);
  const unitTo = unitPos.clone().addScaledVector(dir, -gap * 0.5);
  selfTo.y = from.y;
  // 28차(요청 "끌어갈 때 원작과 다른 느낌"): PC 위키 Template:Data Nautilus/Dredge Line - 적을 맞히면 대상을 0.9초에 걸쳐
  // 끌어오고 노틸러스도 같은 0.9초 동안 대상 쪽으로 돌진하며, 대상은 1초 기절한다. 예전엔 닻 속도(2000)로 거리에 비례해
  // 끌려가(보통 0.2초대) 너무 빨랐고, 기절도 끌려가는 시간만큼만 걸렸다.
  // 30차(요청 "Q가 체감상 너무 느림"): 0.9초를 거리와 무관하게 고정하면 가까운 대상일수록 기어가듯 느렸다(300 거리면
  // 각자 약 77유닛을 0.9초에). 위키의 0.9초를 "최대 사거리(1150)로 맞혔을 때 걸리는 시간"으로 해석해(추정) 끌려가는
  // 속도를 거기서 계산해 고정한다 - 최대 사거리면 0.9초, 가까울수록 빨리 끝난다. 기절은 그대로 1초.
  const maxHalfGap = Math.max(1e-3, (lolRangeToWorld(q.range) - this.collisionRadius - getCollisionRadius(unit)) * 0.5);
  const pullSpeed = maxHalfGap / (q.pullDurationSec != null ? q.pullDurationSec : 0.9);
  const pullSec = Math.max(0.05, (gap * 0.5) / pullSpeed);
  const duration = this._nautilusStartPull(selfTo, unit, pullSec);
  if (unit.mesh && !unit.isStructure) {
    unitTo.y = unit.mesh.position.y;
    unit._pullState = { from: unit.mesh.position.clone(), to: unitTo, duration, elapsed: 0 };
  }
  applyStatus(unit, { id: 'nautilusQ_stun', type: 'STUN', duration: q.stunDurationSec != null ? q.stunDurationSec : 1, value: 1, source: this });
  vfx.spawn('hit', unitPos, undefined, { color: 0x6fa8c8 });
  debugSkillHit('Nautilus Q(닻줄 견인)', unit, { dmg: raw.toFixed(1) });
};

// 노틸러스 자신의 돌진 - 적 명중은 고정 0.9초, 지형 명중은 닻줄 속도(missileSpeed)로 끌려간다. 반환값은 이동 시간.
CharacterController.prototype._nautilusStartPull = function(to, unit, fixedSec = null) {
  const q = this._champData().Q;
  const from = this.root.position.clone();
  const dist = new THREE.Vector3().subVectors(to, from).setY(0).length();
  const duration = fixedSec != null ? fixedSec : Math.max(0.05, dist / lolRangeToWorld(q.missileSpeed)); // 지형 명중은 속도 기준(위키에 시간 없음)
  const faceDir = new THREE.Vector3().subVectors(to, from).setY(0);
  this._dashState = { from, to: to.clone(), duration, elapsed: 0, faceDir: faceDir.lengthSq() > 1e-8 ? faceDir.normalize() : null };
  this._nautilus.qPull = { remainingSec: duration, unit, anchor: unit ? null : to.clone() };
  this._nautilusPlayQClip('pullClip', false);
  return duration;
};

// Q 단계별 모션(champion_ability_database.js의 nautilus.Q.travelClip/pullClip) -
// 모델에 그 클립이 없으면 아무것도 바꾸지 않는다.
CharacterController.prototype._nautilusPlayQClip = function(field, loop) {
  const db = this._championAbilityDbEntry();
  const name = db && db.Q && db.Q[field];
  if (!name || typeof this.findAnimation !== 'function' || !this.findAnimation(name)) return;
  this.playFirstAvailable([name], { loop: loop ? THREE.LoopRepeat : THREE.LoopOnce, fade: 0.08, clampWhenFinished: !loop });
};

/* ---------------------------------------------------------------
   W - 타이탄의 분노
   --------------------------------------------------------------- */

CharacterController.prototype._nautilusWActive = function() {
  return !!(this._nautilus && this._nautilus.wUntil && performance.now() < this._nautilus.wUntil && this._nautilus.wShieldRemaining > 0);
};

CharacterController.prototype._nautilusCastW = function(free = false) {
  if (!this._nautilusIsAlive()) return;
  if (isSilenced(this)) return;
  const w = this._champData().W;
  if (!this._payCost('W', free)) return;
  const lvl = Math.max(1, this.skillLevels.W || 1);
  const amount = (skillVal(w.shieldByLevel, lvl) + this.maxHp * skillVal(w.shieldMaxHpPercentByLevel, lvl) / 100) * getShieldReceivedMultiplier(this);
  // 보호막 인스턴스(재시전은 교체). W 강화 평타는 이 보호막이 남아 있는 동안만 유지된다.
  addShield(this, 'nautilusW', amount, w.durationSec);
  this._nautilus.wShieldRemaining = amount;
  this._nautilus.wUntil = performance.now() + w.durationSec * 1000;
  this._activateAttackOverrideFromDb('W', w.durationSec);
  vfx.spawn('w', this.root.position.clone());
  updateBars(this);
  debugSkillHit('Nautilus W(타이탄의 분노)', this, { shield: amount.toFixed(1) });
};

CharacterController.prototype._nautilusEndW = function(expired) {
  removeShield(this, 'nautilusW');
  this._nautilus.wShieldRemaining = 0;
  this._nautilus.wUntil = 0;
  this.clearAttackOverride('W');
  updateBars(this);
};

// 보호막 풀이 피해로 줄어든 만큼 W 잔량도 줄인다(W 보호막이 먼저 소모된다고
// 본다). 0이 되거나 지속시간이 끝나면 W가 끝난다.
CharacterController.prototype._nautilusTickW = function() {
  const n = this._nautilus;
  if (!n.wUntil) return;
  n.wShieldRemaining = getShieldById(this, 'nautilusW'); // 피해로 깎인 W 몫(인스턴스 모델이 정확히 추적)
  if (n.wShieldRemaining <= 0) { this._nautilusEndW(false); return; }
  if (performance.now() >= n.wUntil) this._nautilusEndW(true);
};

/* ---------------------------------------------------------------
   E - 역류
   --------------------------------------------------------------- */

CharacterController.prototype._nautilusCastE = function(free = false) {
  if (!this._nautilusIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const e = this._champData().E;
  if (!this._payCost('E', free)) return;
  // PC 위키: 시전 시간 0.25초(시전이 끝나는 시점의 위치에서 폭발). 예전엔 시전 즉시 첫 폭발이 나갔다.
  this._clearActionTimers();
  this.currentActionKey = 'nautilusE'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.E_CAST);
  this.playFirstAvailable(['Spell3'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  this._nautilus.eSeq = { remaining: e.explosionCount, elapsed: 0, fired: 0, castSec: e.castTimeSec || 0, hitCounts: new Map(), lvl: Math.max(1, this.skillLevels.E || 1) };
  this._nautilusTickE(0);
};

CharacterController.prototype._nautilusExplodeE = function(seq) {
  const e = this._champData().E;
  const base = skillVal(e.damageByLevel, seq.lvl) + e.apRatio * (this.stats.abilityPower || 0);
  vfx.spawn('e', this.root.position.clone());
  // 80차: 파동마다 고리(0~350 / 215~465 / 350~590) - 바로 옆 대상은 첫 파동만 맞는다.
  const ring = (e.waveRings && e.waveRings[Math.min(seq.fired, e.waveRings.length - 1)]) || [0, e.radius];
  const hits = findEnemiesInRadius(this.root.position, ring[1])
    .filter((h) => h.distance + getCollisionRadius(h.unit) >= lolRangeToWorld(ring[0]));
  for (const { unit } of hits) {
    if (!unit || unit.hp <= 0 || unit.isStructure) continue;
    const n = seq.hitCounts.get(unit) || 0;
    const mult = n === 0 ? 1 : (e.subsequentDamagePercent / 100);
    seq.hitCounts.set(unit, n + 1);
    applyDamage(unit, { rawDamage: base * mult, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(unit, { id: 'nautilusE_slow', type: 'SLOW', duration: e.slowDecaySec, value: skillVal(e.slowPercentByLevel, seq.lvl) / 100, decayLinear: true, source: this });
  }
  if (!hits.length) debugSkillMiss('Nautilus E(역류)', '범위 내 대상 없음');
};

CharacterController.prototype._nautilusTickE = function(dt) {
  const seq = this._nautilus.eSeq;
  if (!seq) return;
  const e = this._champData().E;
  seq.elapsed += dt;
  const offsetAt = (i) => seq.castSec + (e.explosionOffsetsSec ? e.explosionOffsetsSec[i] : i * e.explosionIntervalSec);
  while (seq.remaining > 0 && seq.elapsed + 1e-9 >= offsetAt(seq.fired)) {
    if (seq.fired === 0) this._nautilusFinishAction('nautilusE'); // 시전 시간 종료 = 행동 잠금 해제
    this._nautilusExplodeE(seq);
    seq.remaining -= 1; seq.fired += 1;
  }
  if (seq.remaining <= 0) this._nautilus.eSeq = null;
};

/* ---------------------------------------------------------------
   R - 폭뢰
   --------------------------------------------------------------- */

CharacterController.prototype._nautilusCastR = function(free = false) {
  if (!this._nautilusIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const r = this._champData().R;
  const target = this.currentTarget;
  if (!target || target.hp <= 0 || !target.isChampion) { debugSkillMiss('Nautilus R(폭뢰)', '적 챔피언 대상 필요'); return; }
  if (!isInRange(this, target, r.range)) { debugSkillMiss('Nautilus R(폭뢰)', 'out of range'); return; }
  if (!this._payCost('R', free)) return;
  const dir = new THREE.Vector3().subVectors(getWorldPosition(target), this.root.position).setY(0);
  if (dir.lengthSq() > 1e-6) this.faceDirectionInstant(dir.normalize());
  this._clearActionTimers();
  this.currentActionKey = 'nautilusR'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.R_CAST);
  this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  this._nautilus.rPending = { target, remainingFireSec: r.castTimeSec, lvl: Math.max(1, this.skillLevels.R || 1) };
};

CharacterController.prototype._nautilusFireR = function(p) {
  this._nautilus.rTravel = { target: p.target, pos: this.root.position.clone(), lvl: p.lvl, pathHit: new Set() };
  this._nautilusFinishAction('nautilusR');
};

// 충격파는 대상을 끝까지 쫓아간다(유도형). 지나가는 길의 적은 한 번씩
// 피해 + 에어본, 대상에 도착하면 폭발(피해 + 에어본/기절).
CharacterController.prototype._nautilusTickRTravel = function(dt) {
  const t = this._nautilus.rTravel;
  if (!t) return;
  const r = this._champData().R;
  const target = t.target;
  if (!target || target.hp <= 0) { this._nautilus.rTravel = null; debugSkillMiss('Nautilus R(폭뢰)', '대상 소실'); return; }
  const goal = getWorldPosition(target);
  const toGoal = new THREE.Vector3().subVectors(goal, t.pos).setY(0);
  const dist = toGoal.length();
  // 충격파는 처음엔 느리다가 점점 빨라진다(PC 위키: 275 + 초당 466.67 가속).
  t.elapsed = (t.elapsed || 0) + dt;
  const speedLol = r.shockwaveSpeed + (r.shockwaveAccelPerSec || 0) * t.elapsed;
  const step = lolRangeToWorld(speedLol) * dt;
  if (dist > 1e-6) t.pos.addScaledVector(toGoal.divideScalar(dist), Math.min(step, dist));
  vfx.spawn('hit', t.pos.clone(), undefined, { color: 0x3f7fa8 });

  const pathRaw = skillVal(r.pathDamageByLevel, t.lvl) + r.pathApRatio * (this.stats.abilityPower || 0);
  // 경로 폭발(PC 위키): 0.264초마다 그 순간 충격파 위치에서 반경 225. 한 대상은 한 번만 맞는다.
  t.eruptAccum = (t.eruptAccum == null ? r.pathEruptionIntervalSec : t.eruptAccum) + dt;
  const erupt = t.eruptAccum >= (r.pathEruptionIntervalSec || 0.264);
  if (erupt) t.eruptAccum -= (r.pathEruptionIntervalSec || 0.264);
  for (const u of (erupt ? getAllEnemyUnits() : [])) {
    if (!u || u === target || u.hp <= 0 || u.isStructure || t.pathHit.has(u)) continue;
    if (!isInCircle(u, t.pos, lolRangeToWorld(r.pathEruptionRadius || 225))) continue;
    t.pathHit.add(u);
    applyDamage(u, { rawDamage: pathRaw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(u, { id: 'nautilusR_pathKnockup', type: 'KNOCKUP', duration: r.pathKnockupSec, value: 1, source: this });
    debugSkillHit('Nautilus R(폭뢰 - 경로)', u);
  }

  if (isInCircle(target, t.pos, BASE_UNIT * 0.2) || dist <= step) {
    this._nautilus.rTravel = null;
    const raw = skillVal(r.damageByLevel, t.lvl) + r.apRatio * (this.stats.abilityPower || 0);
    applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(target, { id: 'nautilusR_knockup', type: 'KNOCKUP', duration: skillVal(r.stunByLevel, t.lvl), value: 1, source: this });
    vfx.spawn('r', goal.clone());
    debugSkillHit('Nautilus R(폭뢰)', target, { dmg: raw.toFixed(1) });
  }
};

/* ---------------------------------------------------------------
   매 프레임 훅
   --------------------------------------------------------------- */

CharacterController.prototype._nautilusUpdate = function(dt) {
  if (this.championId !== 'nautilus' || !this._nautilus) return;
  const n = this._nautilus;

  if (n.qPending) {
    n.qPending.remainingFireSec -= dt;
    if (n.qPending.remainingFireSec <= 0) {
      const p = n.qPending; n.qPending = null;
      if (this.currentActionKey === 'nautilusQ') this._nautilusFireQ(p);
    }
  }
  this._nautilusTickQTravel(dt);
  if (n.qPull) {
    n.qPull.remainingSec -= dt;
    if (n.qPull.remainingSec <= 0) { n.qPull = null; this._nautilusFinishAction('nautilusQ'); }
  }
  this._nautilusUpdateChain();

  this._nautilusTickW();
  this._nautilusTickE(dt);

  if (n.rPending) {
    n.rPending.remainingFireSec -= dt;
    if (n.rPending.remainingFireSec <= 0) {
      const p = n.rPending; n.rPending = null;
      if (this.currentActionKey === 'nautilusR') this._nautilusFireR(p);
    }
  }
  this._nautilusTickRTravel(dt);
};

CharacterController.prototype._nautilusReset = function() {
  if (this._nautilus && this._nautilus.wShieldRemaining > 0) this.shield = Math.max(0, (this.shield || 0) - this._nautilus.wShieldRemaining);
  this._nautilus = {
    passiveReadyAt: new Map(),
    qPending: null, qTravel: null, qPull: null,
    wUntil: 0, wShieldRemaining: 0, wShieldSeen: 0,
    eSeq: null, rPending: null, rTravel: null,
  };
};

// 29차: 닻줄 견인 표시 - 닻이 날아가는 동안은 노틸러스 → 닻, 적을 끌어오는 동안은 노틸러스 → 대상(지형이면 → 박힌
// 지점)까지 닻줄과 닻을 그린다. 예전엔 비행 중 '맞음' 스프라이트만 찍히고 끌려가는 동안은 아무 표시가 없어, 0.9초 동안
// 이유 없이 미끄러지는 것처럼 보였다. 색·굵기는 연출값. 정리는 공용 VFX 목록이 맡는다(교체·종료 시 자동 제거).
CharacterController.prototype._nautilusUpdateChain = function() {
  const n = this._nautilus;
  let end = null;
  if (n.qTravel) end = n.qTravel.pos;
  else if (n.qPull) end = n.qPull.unit ? getWorldPosition(n.qPull.unit) : n.qPull.anchor;
  if (!end) { n.qChain = null; return; }
  let ch = n.qChain;
  if (!ch) {
    if (typeof scene === 'undefined' || !scene || typeof vfx === 'undefined' || !vfx || !vfx.active || typeof THREE.CylinderGeometry !== 'function') return;
    const group = new THREE.Group();
    const lineGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); lineGeo.rotateX(Math.PI / 2); lineGeo.translate(0, 0, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7f9aa8, transparent: true, opacity: 0.9, depthWrite: false });
    const line = new THREE.Mesh(lineGeo, mat);
    const anchor = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x9fb6c2 }));
    group.add(line, anchor); scene.add(group);
    ch = n.qChain = { group, line, anchor };
    const owner = this;
    const entry = { life: 30, maxLife: 30, tag: 'nautilusChain',
      update: () => { if (!owner._nautilus || owner._nautilus.qChain !== ch || (typeof controller !== 'undefined' && controller !== owner)) entry.life = 0; },
      dispose: () => { if (group.parent) group.parent.remove(group); line.geometry.dispose(); mat.dispose(); anchor.geometry.dispose(); anchor.material.dispose(); if (owner._nautilus && owner._nautilus.qChain === ch) owner._nautilus.qChain = null; } };
    vfx.active.push(entry);
  }
  const h = BASE_UNIT * 0.55;
  const from = new THREE.Vector3(this.root.position.x, this.root.position.y + h, this.root.position.z);
  const to = new THREE.Vector3(end.x, (end.y || 0) + h, end.z);
  const len = Math.max(1e-3, from.distanceTo(to));
  const thick = lolRangeToWorld(6);
  ch.line.position.copy(from); ch.line.scale.set(thick, thick, len); ch.line.lookAt(to);
  ch.anchor.position.copy(to); ch.anchor.scale.setScalar(lolRangeToWorld(22));
};
