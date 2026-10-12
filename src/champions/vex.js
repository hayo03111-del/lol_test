// Extracted from CharacterController: _vexClearRRecast
CharacterController.prototype._vexClearRRecast = function() { 
    if (!this._vex) return;
    this._vex.recastTarget = null;
    this._vex.recastReadyUntil = 0;
    this._vex.dashActive = false;
    this._vex.dashStart = null;
    this._vex.dashEnd = null;
    this._vex.dashT = 0;
    this._vex.dashDuration = 0.28;
  
};

// Extracted from CharacterController: _vexCastR
CharacterController.prototype._vexCastR = function(free = false) { 
    const cd = this._champData();
    const rd = cd && cd.R;
    if (!rd) return;
    const lvl = Math.max(1, Math.min(3, this.skillLevels.R || 1));
    const now = performance.now();

    // 2차 그림자 파동: 1차 적중 대상에게 실제로 돌진한다. 재시전은 추가 마나/쿨다운을 지불하지 않는다.
    if (!free && this._vex.recastTarget && now < this._vex.recastReadyUntil) {
      const target = this._vex.recastTarget;
      if (!target || target.hp <= 0 || target.isDead || target.destroyed) {
        this._vexClearRRecast();
        return;
      }
      this._clearActionTimers();
      const start = this.root.position.clone();
      const end = getWorldPosition(target)?.clone() || target.mesh.position.clone();
      const dir = new THREE.Vector3().subVectors(end, start); dir.y = 0;
      if (dir.lengthSq() > 1e-6) this.faceDirectionInstant(dir.normalize());
      this._vex.dashActive = true;
      this._vex.dashStart = start;
      this._vex.dashEnd = end;
      this._vex.dashT = 0;
      this._vex.dashDuration = 0.28;
      this.currentActionKey = 'vexRRecast';
      this.currentPhase = 'ACTIVE';
      this.setState(STATE.R_CAST);
      this.playFirstAvailable(['Spell4_Dash', 'Spell4_Attack', 'Spell4'], { loop: THREE.LoopOnce, fade: 0.08 });
      const hitTimer = setTimeout(() => {
        if (!this._vex.dashActive) return;
        const t = this._vex.recastTarget;
        if (t && t.hp > 0 && !t.isDead && !t.destroyed) {
          const raw = skillVal(rd.recastDamageByLevel, lvl) + (rd.recastApRatio || 0) * (this.stats.abilityPower || 0);
          applyDamage(t, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical:false, critMultiplier:1 });
          vfx.spawn('r', this.root.position.clone());
          debugSkillHit('Vex R Recast', t);
          if (t.hp <= 0) {
            this.cooldowns.R = 0;
            this._vexClearRRecast();
          } else {
            this._vexClearRRecast();
          }
        } else this._vexClearRRecast();
        this.currentActionKey = null; this.currentPhase = null;
        this._resumeAfterAction();
      }, this._vex.dashDuration * 1000);
      this._actionTimers.push(hitTimer);
      return;
    }

    // 1차 그림자 파동: 현재 선택된 대상을 향해 투사체를 발사한다.
    if (!this.currentTarget || this.currentTarget.hp <= 0) { debugSkillMiss('Vex R', 'no currentTarget selected'); return; }
    const range = skillVal(rd.range, lvl);
    if (!free && !isInRange(this, this.currentTarget, range)) { debugSkillMiss('Vex R', `out of range (${range})`); return; }
    if (!this._payCost('R', free)) return;
    this._clearActionTimers();
    this.currentActionKey = 'vexRCast'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
    this.setState(STATE.R_CAST);
    const target = this.currentTarget;
    const raw = skillVal(rd.damageByLevel, lvl) + (rd.apRatio || 0) * (this.stats.abilityPower || 0);
    // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 즉시 발사 - PC 위키 시전 0.25초 뒤 발사.
    const fireTimer = setTimeout(() => {
    if (this.currentActionKey !== 'vexRCast' || !target || target.hp <= 0) return;
    const from = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.65, 0));
    projectiles.spawn({
      from,
      target,
      speed: 32,
      damage: raw,
      color: 0x8b5cf6,
      realmId: 'main',
      onHit: (hitTarget) => {
        if (!hitTarget || hitTarget.hp <= 0) return;
        applyDamage(hitTarget, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical:false, critMultiplier:1 });
        vfx.spawn('r', getWorldPosition(hitTarget) || hitTarget.mesh.position.clone());
        debugSkillHit('Vex R', hitTarget);
        if (hitTarget.hp > 0) {
          this._vex.recastTarget = hitTarget;
          this._vex.recastReadyUntil = performance.now() + 4000;
        } else if (rd.resetOnKill) {
          this.cooldowns.R = 0;
          this._vexClearRRecast();
        }
      }
    });
    }, (rd.castTimeSec || 0.25) * 1000);
    this._actionTimers.push(fireTimer);
    // 버그 수정: GLB에 'Spell4' 클립이 없어 R 모션이 재생되지 않았다(실제 클립은 Spell4_Cast/Spell4_Dash/Spell4_Attack).
    this.playFirstAvailable(['Spell4_Cast', 'Spell4'], { loop: THREE.LoopOnce, fade: 0.08 });
    const recTimer = setTimeout(() => {
      if (this.currentActionKey === 'vexRCast') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
    }, ((rd.castTimeSec || 0.25) + 0.05) * 1000);
    this._actionTimers.push(recTimer);
  
};

// Extracted from CharacterController: _vexUpdateR
CharacterController.prototype._vexUpdateR = function(dt) { 
    if (this.championId === 'vex') { this._vexTickQ(dt); this._vexTickE(dt); this._vexTickWShield(); }
    if (!this._vex || !this._vex.dashActive) {
      if (this._vex && this._vex.recastReadyUntil && performance.now() >= this._vex.recastReadyUntil) this._vexClearRRecast();
      return;
    }
    this._vex.dashT += dt / Math.max(0.01, this._vex.dashDuration);
    const t = Math.min(1, this._vex.dashT);
    this.root.position.lerpVectors(this._vex.dashStart, this._vex.dashEnd, t);
    if (t >= 1) this._vex.dashActive = false;
  
};



// ---------------- 벡스 Q/W/E (예전엔 전용 구현 없이 공용 대체 경로가 선택 대상에게 고정 피해만 줬다) ----------------
CharacterController.prototype._vexAimDir = function(mouseWorldPoint) {
  const dir = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  return dir.normalize();
};

// Q(오싹한 미사일): 시전 0.15초 뒤 파동 발사. 속도 600으로 500 유닛 → 3200으로 가속, 폭 360 → 160, 관통.
CharacterController.prototype._vexCastQ = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this.canStartNewAction()) return;
  const q = this._champData().Q;
  const dir = this._vexAimDir(mouseWorldPoint);
  if (!this._payCost('Q', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'vexQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);
  this.playFirstAvailable(['Spell1_Base'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const castMs = (q.castTimeSec != null ? q.castTimeSec : 0.15) * 1000;
  const fire = setTimeout(() => {
    if (this.currentActionKey !== 'vexQ') return;
    this._vex.qTravel = { origin: this.root.position.clone(), dir: dir.clone(), traveled: 0, hitSet: new Set(), lvl };
    vfx.spawn('q', this.root.position.clone(), dir);
    this.currentActionKey = null; this.currentPhase = null;
    this._resumeAfterAction();
  }, castMs);
  this._actionTimers.push(fire);
};

CharacterController.prototype._vexTickQ = function(dt) {
  const t = this._vex && this._vex.qTravel;
  if (!t) return;
  const q = this._champData().Q;
  const accelAt = lolRangeToWorld(q.accelerationDistance || 500);
  const speed = lolRangeToWorld(t.traveled < accelAt ? (q.speed1 || 600) : (q.speed2 || 3200));
  const maxDist = lolRangeToWorld(q.range || 1200);
  t.traveled = Math.min(maxDist, t.traveled + speed * dt);
  const width = t.traveled < accelAt ? (q.width || 360) : (q.widthAfterAccel || q.width || 160);
  const half = lolRangeToWorld(width) * 0.5;
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || t.hitSet.has(u)) continue;
    const p = getWorldPosition(u); if (!p) continue;
    const v = new THREE.Vector3(p.x - t.origin.x, 0, p.z - t.origin.z);
    const along = v.dot(t.dir); const r = getCollisionRadius(u);
    if (along < -r || along > t.traveled + r) continue;
    const lateral = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
    if (lateral > half + r) continue;
    t.hitSet.add(u);
    const raw = skillVal(q.damageByLevel, t.lvl) + (q.apRatio || 0) * (this.stats.abilityPower || 0);
    applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    vfx.spawn('hit', p.clone(), undefined, { color: 0x8b5cf6 });
    debugSkillHit('Vex Q', u);
  }
  if (t.traveled >= maxDist - 1e-6) this._vex.qTravel = null;
};

// W(거리 두기): 시전 0.25초(이동 가능) 뒤 보호막 50~150(+주문력 75%, 2.5초) + 반경 475 마법 피해.
CharacterController.prototype._vexCastW = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const w = this._champData().W;
  if (!this._payCost('W', free)) return;
  this.playFirstAvailable([this.targetPos ? 'Spell2_Moving' : 'Spell2_BASE', 'Spell2_BASE'], { loop: THREE.LoopOnce, fade: 0.06 });
  const lvl = Math.max(1, this.skillLevels.W || 1);
  const t = setTimeout(() => {
    if (this.championId !== 'vex' || this.hp <= 0) return;
    const shield = (skillVal(w.shieldByLevel, lvl) + (w.shieldApRatio || 0) * (this.stats.abilityPower || 0)) * getShieldReceivedMultiplier(this);
    this.shield = (this.shield || 0) + shield;
    this._vex.wShield = { amount: shield, expiresAt: performance.now() + (w.shieldDuration || 2.5) * 1000 };
    vfx.spawn('w', this.root.position.clone());
    const raw = skillVal(w.damageByLevel, lvl) + (w.apRatio || 0) * (this.stats.abilityPower || 0);
    for (const h of findEnemiesInRadius(this.root.position, w.range || 475)) {
      applyDamage(h.unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
      debugSkillHit('Vex W', h.unit);
    }
    updateBars(this);
  }, (w.castTimeSec != null ? w.castTimeSec : 0.25) * 1000);
  void t; // 시전 중 이동 가능 - 행동 잠금/타이머 취소 대상이 아니다
};

CharacterController.prototype._vexTickWShield = function() {
  const s = this._vex && this._vex.wShield;
  if (!s || performance.now() < s.expiresAt) return;
  this.shield = Math.max(0, (this.shield || 0) - Math.min(this.shield || 0, s.amount)); // 남은 W 몫만 제거
  this._vex.wShield = null;
  updateBars(this);
};

// E(커지는 안개): 시전 0.25초 뒤 지정 지점(최대 800)으로 발사, 착탄 시 반경 200~300(거리 비례) 마법 피해 + 2초 둔화.
CharacterController.prototype._vexCastE = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this.canStartNewAction()) return;
  const e = this._champData().E;
  const dir = this._vexAimDir(mouseWorldPoint);
  const maxWorld = lolRangeToWorld(e.range || 800);
  const rawDist = mouseWorldPoint ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0).length() : maxWorld;
  const dist = Math.min(rawDist, maxWorld);
  if (!this._payCost('E', free)) return;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'vexE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.E_CAST);
  this.playFirstAvailable(['Spell3_0'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  const lvl = Math.max(1, this.skillLevels.E || 1);
  const fire = setTimeout(() => {
    if (this.currentActionKey !== 'vexE') return;
    const from = this.root.position.clone();
    const to = from.clone().addScaledVector(dir, dist);
    const frac = maxWorld > 0 ? dist / maxWorld : 1;
    const radius = (e.radiusMin || 200) + ((e.radiusMax || 300) - (e.radiusMin || 200)) * frac;
    this._vex.eTravel = { from, to, total: dist, traveled: 0, radius, lvl };
    vfx.spawn('e', from.clone(), dir);
    this.currentActionKey = null; this.currentPhase = null;
    this._resumeAfterAction();
  }, (e.castTimeSec != null ? e.castTimeSec : 0.25) * 1000);
  this._actionTimers.push(fire);
};

CharacterController.prototype._vexTickE = function(dt) {
  const t = this._vex && this._vex.eTravel;
  if (!t) return;
  const e = this._champData().E;
  t.traveled = Math.min(t.total, t.traveled + lolRangeToWorld(e.missileSpeed || 1300) * dt);
  if (t.traveled < t.total - 1e-6) return;
  this._vex.eTravel = null;
  const raw = skillVal(e.damageByLevel, t.lvl) + (e.apRatio || 0) * (this.stats.abilityPower || 0);
  const slow = skillVal(e.slowPercentByLevel, t.lvl) / 100;
  vfx.spawn('hit', t.to.clone(), undefined, { color: 0x8b5cf6 });
  for (const h of findEnemiesInRadius(t.to, t.radius)) {
    applyDamage(h.unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(h.unit, { id: 'vexE_slow', type: 'SLOW', duration: e.slowDuration || 2, value: slow, source: this });
    debugSkillHit('Vex E', h.unit);
  }
};
