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
CharacterController.prototype._vexCastR = function(mouseWorldPoint, free = false) { 
    const cd = this._champData();
    const rd = cd && cd.R;
    if (!rd) return;
    // 31차(전 챔피언 시전 조건 점검으로 발견): 침묵·군중 제어 중에도 R(1차·재시전)이 나가고 마나·쿨다운까지 소모됐다.
    if (isSilenced(this) || isCrowdControlled(this)) return;
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
      const tp = getWorldPosition(target)?.clone() || target.mesh.position.clone();
      const dir = new THREE.Vector3().subVectors(tp, start); dir.y = 0;
      if (dir.lengthSq() > 1e-6) this.faceDirectionInstant(dir.normalize());
      // 대상 중심이 아니라 두 유닛 충돌 반경만큼 앞에서 멈춘다(예전엔 대상과 겹쳤다).
      const end = tp.clone().addScaledVector(dir, -(getCollisionRadius(target) + (this.collisionRadius || 0)));
      end.y = start.y;
      this._vex.dashActive = true;
      this._vex.dashStart = start;
      this._vex.dashEnd = end;
      this._vex.dashT = 0;
      // 28차: 돌진 시간은 거리 ÷ 돌진 속도 2200(PC 위키 Template:Data Vex/Shadow Surge 속도 1600 • 2200). 예전엔 거리와 무관하게 0.28초.
      this._vex.dashDuration = Math.max(0.05, start.distanceTo(end) / lolRangeToWorld(rd.dashSpeed || 2200));
      this.currentActionKey = 'vexRRecast';
      this.currentPhase = 'ACTIVE';
      this.setState(STATE.R_CAST);
      this.playFirstAvailable(['Spell4_Dash', 'Spell4_Attack', 'Spell4'], { loop: THREE.LoopOnce, fade: 0.08 });
      const hitTimer = this._champTimeout(() => {
        // 버그 수정(실제 게임 기제 점검): 예전엔 "아직 돌진 중인가(dashActive)"를 확인했는데, 매 프레임 갱신이 같은
        // 0.28초 시점에 먼저 dashActive를 끄면 이 타이머가 그냥 끝나 재시전 피해가 안 들어가고 행동 키도 남았다.
        if (this.currentActionKey !== 'vexRRecast') return;
        this._vex.dashActive = false;
        if (this._vex.dashEnd) this.root.position.copy(this._vex.dashEnd);
        const t = this._vex.recastTarget;
        if (t && t.hp > 0 && !t.isDead && !t.destroyed) {
          const raw = skillVal(rd.recastDamageByLevel, lvl) + (rd.recastApRatio || 0) * (this.stats.abilityPower || 0);
          applyDamage(t, { isUltimate: true, rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical:false, critMultiplier:1, source: this });
          this._vexWatchRReset(t);
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

    // 1차 그림자 파동 - 28차: 원작처럼 방향 지정 스킬샷이다(예전엔 선택한 대상에게만 쏘는 지정 스킬이었다).
    // 커서 방향으로 사거리 2000/2500/3000, 폭 260, 속도 1600의 투사체를 쏘아 경로상 처음 닿는 적 챔피언을
    // 맞힌다(PC 위키 Template:Data Vex/Shadow Surge).
    const range = skillVal(rd.range, lvl);
    const dir = this._vexAimDir(mouseWorldPoint);
    if (!this._payCost('R', free)) return;
    this.faceDirectionInstant(dir);
    this._clearActionTimers();
    this.currentActionKey = 'vexRCast'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
    this.setState(STATE.R_CAST);
    const raw = skillVal(rd.damageByLevel, lvl) + (rd.apRatio || 0) * (this.stats.abilityPower || 0);
    // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 즉시 발사 - PC 위키 시전 0.25초 뒤 발사.
    const fireTimer = this._champTimeout(() => {
    if (this.currentActionKey !== 'vexRCast') return;
    const from = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.65, 0));
    // 45차: 피할 수 있는 직선 스킬샷(처음 닿는 적 챔피언) - 예전엔 발사 순간 대상을 정해 끝까지 따라갔다.
    projectiles.spawn({
      from,
      line: { dir, maxDist: lolRangeToWorld(range), halfWidth: lolRangeToWorld(rd.width || 260) * 0.5, filter: (u) => !!u.isChampion,
        onMiss: () => debugSkillMiss('Vex R', 'no champion in line') },
      speed: lolRangeToWorld(rd.missileSpeed || 1600),
      damage: 0,
      color: 0x8b5cf6,
      realmId: this.realmId,
      onHit: (hitTarget) => {
        if (!hitTarget || hitTarget.hp <= 0) return;
        applyDamage(hitTarget, { isUltimate: true, rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical:false, critMultiplier:1, source: this });
        this._vexWatchRReset(hitTarget);
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
    const recTimer = this._champTimeout(() => {
      if (this.currentActionKey === 'vexRCast') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
    }, ((rd.castTimeSec || 0.25) + 0.05) * 1000);
    this._actionTimers.push(recTimer);
  
};

// Extracted from CharacterController: _vexUpdateR
// 91차(PC 위키, 26.13): R 피해를 입은 챔피언이 8초 안에 죽으면 R 재사용 대기시간 초기화(예전엔 R 피해로 바로 죽인 경우만).
CharacterController.prototype._vexWatchRReset = function(t) {
  if (!t || !t.isChampion) return;
  const rd = this._champData().R;
  if (!rd.resetOnKill) return;
  this._vex.rResetWatch = { target: t, until: performance.now() + (rd.resetWindowSec || 8) * 1000 };
};
CharacterController.prototype._vexTickRResetWatch = function() {
  const w = this._vex && this._vex.rResetWatch;
  if (!w) return;
  if (performance.now() > w.until) { this._vex.rResetWatch = null; return; }
  const t = w.target;
  if (t && (t.hp <= 0 || t.isDead || (typeof STATE !== 'undefined' && t.state === STATE.DEAD))) {
    this._vex.rResetWatch = null;
    this.cooldowns.R = 0;
    if (!this._vex.dashActive) this._vexClearRRecast();
  }
};
CharacterController.prototype._vexUpdateR = function(dt) { 
    if (this.championId === 'vex') { this._vexTickQ(dt); this._vexTickE(dt); this._vexTickWShield(); this._vexTickRResetWatch(); }
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
  const doom = this._vexConsumeDoom();
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'vexQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);
  this.playFirstAvailable(['Spell1_Base'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const castMs = (q.castTimeSec != null ? q.castTimeSec : 0.15) * 1000;
  const fire = this._champTimeout(() => {
    if (this.currentActionKey !== 'vexQ') return;
    this._vex.qTravel = { origin: this.root.position.clone(), dir: dir.clone(), traveled: 0, hitSet: new Set(), lvl, doom };
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
  const prev = t.traveled;
  t.traveled = Math.min(maxDist, t.traveled + speed * dt);
  const width = t.traveled < accelAt ? (q.width || 360) : (q.widthAfterAccel || q.width || 160);
  const half = lolRangeToWorld(width) * 0.5;
  // 28차: 파동이 실제로 있는 자리(사거리·속도·폭이 판정과 같은 값)를 보여 준다. 예전엔 범용 'q' 이펙트가
  // 판정과 다른 거리·속도로 그려져 사거리가 이상해 보였다. 파동 두께(진행 방향)는 연출값.
  this._vexUpdateQWave(t, half);
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || t.hitSet.has(u)) continue;
    const p = getWorldPosition(u); if (!p) continue;
    const v = new THREE.Vector3(p.x - t.origin.x, 0, p.z - t.origin.z);
    const along = v.dot(t.dir); const r = getCollisionRadius(u);
    // 이번 프레임에 파동이 지나간 구간만 본다(예전엔 시작점부터 파동 앞까지 전체를 매 프레임 다시 봤다).
    if (along < prev - r || along > t.traveled + r) continue;
    const lateral = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
    if (lateral > half + r) continue;
    t.hitSet.add(u);
    const raw = skillVal(q.damageByLevel, t.lvl) + (q.apRatio || 0) * (this.stats.abilityPower || 0);
    applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    this._vexOnAbilityHit(u, t.doom);
    vfx.spawn('hit', p.clone(), undefined, { color: 0x8b5cf6 });
    debugSkillHit('Vex Q', u);
  }
  if (t.traveled >= maxDist - 1e-6) { this._vexUpdateQWave(null); this._vex.qTravel = null; }
};

// 28차: Q 파동 표시(지면 위 반투명 띠). t=null이면 지운다.
CharacterController.prototype._vexUpdateQWave = function(t, half) {
  let m = this._vex.qWaveMesh;
  if (!t) { this._vex.qWaveMesh = null; return; } // 실제 정리는 아래 vfx 항목이 한다
  if (!m) {
    if (typeof scene === 'undefined' || !scene || typeof THREE.PlaneGeometry !== 'function' || typeof vfx === 'undefined' || !vfx || !vfx.active) return; // 표시 전용(헤드리스 테스트 등에선 생략)
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9b6bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 4; scene.add(m); this._vex.qWaveMesh = m;
    // 정리는 공용 VFX 목록이 맡는다 - 파동이 끝났거나(qWaveMesh가 바뀜) 챔피언을 바꿔 이 컨트롤러가 더 이상 갱신되지
    // 않으면(controller !== this) 다음 프레임에 지운다. 예전엔 교체 도중이면 띠가 장면에 남았다.
    const owner = this;
    const entry = { life: 30, maxLife: 30, tag: 'vexQWave',
      update: () => { if (!owner._vex || owner._vex.qWaveMesh !== m || (typeof controller !== 'undefined' && controller !== owner)) entry.life = 0; },
      dispose: () => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); if (owner._vex && owner._vex.qWaveMesh === m) owner._vex.qWaveMesh = null; } };
    vfx.active.push(entry);
  }
  const thick = lolRangeToWorld(90);
  m.scale.set(half * 2, 1, thick);
  m.position.set(t.origin.x + t.dir.x * (t.traveled - thick / 2), 0.08, t.origin.z + t.dir.z * (t.traveled - thick / 2));
  m.rotation.y = Math.atan2(t.dir.x, t.dir.z);
};

// W(거리 두기): 시전 0.25초(이동 가능) 뒤 보호막 50~150(+주문력 75%, 2.5초) + 반경 475 마법 피해.
CharacterController.prototype._vexCastW = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const w = this._champData().W;
  if (!this._payCost('W', free)) return;
  const doom = this._vexConsumeDoom();
  this.playFirstAvailable([this.targetPos ? 'Spell2_Moving' : 'Spell2_BASE', 'Spell2_BASE'], { loop: THREE.LoopOnce, fade: 0.06 });
  const lvl = Math.max(1, this.skillLevels.W || 1);
  const t = this._champTimeout(() => {
    if (this.championId !== 'vex' || this.hp <= 0) return;
    const shield = (skillVal(w.shieldByLevel, lvl) + (w.shieldApRatio || 0) * (this.stats.abilityPower || 0)) * getShieldReceivedMultiplier(this);
    addShield(this, 'vexW', shield, w.shieldDuration || 2.5); // 보호막 인스턴스(만료 자동)
    this._vex.wShield = { amount: shield, expiresAt: performance.now() + (w.shieldDuration || 2.5) * 1000 };
    vfx.spawn('w', this.root.position.clone());
    const raw = skillVal(w.damageByLevel, lvl) + (w.apRatio || 0) * (this.stats.abilityPower || 0);
    // 81차: PC 위키 - 반경 475, 돌진 중인 적에게는 550.
    const dashR = w.dashingRange || w.range || 475, nowW = performance.now();
    const isDashing = (u) => !!(u && (u._dashState || u.isDashing || (u._lastDashAt && nowW - u._lastDashAt <= (w.dashWindowMs || 400))));
    const wHits = findEnemiesInRadius(this.root.position, dashR)
      .filter((h) => isDashing(h.unit) || h.distance <= lolRangeToWorld(w.range || 475) + getCollisionRadius(h.unit));
    for (const h of wHits) {
      applyDamage(h.unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
      this._vexOnAbilityHit(h.unit, doom);
      debugSkillHit('Vex W', h.unit);
    }
    updateBars(this);
  }, (w.castTimeSec != null ? w.castTimeSec : 0.25) * 1000);
  void t; // 시전 중 이동 가능 - 행동 잠금/타이머 취소 대상이 아니다
};

CharacterController.prototype._vexTickWShield = function() {
  const s = this._vex && this._vex.wShield;
  if (!s || performance.now() < s.expiresAt) return;
  removeShield(this, 'vexW'); // 만료 시점에 남은 W 몫만 제거
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
  const doom = this._vexConsumeDoom();
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'vexE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.E_CAST);
  this.playFirstAvailable(['Spell3_0'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  const lvl = Math.max(1, this.skillLevels.E || 1);
  const fire = this._champTimeout(() => {
    if (this.currentActionKey !== 'vexE') return;
    const from = this.root.position.clone();
    const to = from.clone().addScaledVector(dir, dist);
    const frac = maxWorld > 0 ? dist / maxWorld : 1;
    const radius = (e.radiusMin || 200) + ((e.radiusMax || 300) - (e.radiusMin || 200)) * frac;
    this._vex.eTravel = { from, to, total: dist, traveled: 0, radius, lvl, doom };
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
  const raw = skillVal(e.damageByLevel, t.lvl) + (e.apRatioByLevel ? skillVal(e.apRatioByLevel, t.lvl) : (e.apRatio || 0)) * (this.stats.abilityPower || 0);
  const slow = skillVal(e.slowPercentByLevel, t.lvl) / 100;
  vfx.spawn('hit', t.to.clone(), undefined, { color: 0x8b5cf6 });
  for (const h of findEnemiesInRadius(t.to, t.radius)) {
    applyDamage(h.unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(h.unit, { id: 'vexE_slow', type: 'SLOW', duration: e.slowDuration || 2, value: slow, source: this });
    this._vexOnAbilityHit(h.unit, t.doom);
    const pd = this._vexPassive();
    if (h.unit.hp <= 0) this._vexRefundDoom(h.unit.isChampion ? pd.eKillRefundChampionPercent : pd.eKillRefundNonChampionPercent);
    else this._vexMarkGloom(h.unit); // E 적중 대상에 우울 표식(기존 표식은 바로 위에서 먼저 소모)
    debugSkillHit('Vex E', h.unit);
  }
};

/* ---------------------------------------------------------------
   패시브 - 파멸과 우울(Doom 'n Gloom)
   --------------------------------------------------------------- */
CharacterController.prototype._vexPassive = function() { return this._champData().passive; };

CharacterController.prototype._vexDoomReady = function() {
  return !!this._vex && performance.now() >= (this._vex.doomReadyAt || 0);
};

// 기본 스킬 시전 시점에 파멸을 소모한다(대기시간은 시전 시 시작 - 위키). 준비돼 있었으면 true.
CharacterController.prototype._vexConsumeDoom = function() {
  if (!this._vexDoomReady()) return false;
  const cdMs = valueByBreakpoints(this._vexPassive().doomCooldownByLevel, this.champLevel || 1) * 1000; // 정적: 스킬 가속 무관
  this._vex.doomReadyAt = performance.now() + cdMs;
  this._vex.doomTotalMs = cdMs;
  return true;
};

// 파멸 남은 대기시간을 전체의 pct%만큼 줄인다.
CharacterController.prototype._vexRefundDoom = function(pct) {
  if (!this._vex || !pct) return;
  const now = performance.now();
  if (this._vex.doomReadyAt <= now) return;
  this._vex.doomReadyAt = Math.max(now, this._vex.doomReadyAt - (this._vex.doomTotalMs || 0) * pct / 100);
};

CharacterController.prototype._vexMarkGloom = function(unit) {
  if (!unit || unit.hp <= 0) return;
  this._vex.gloom.set(unit, performance.now() + this._vexPassive().gloomDuration * 1000);
};

// 우울 표식이 있으면 소모: 추가 마법 피해 + 파멸 대기시간 환급(챔피언 25%, 그 외 10%·피해 감소).
CharacterController.prototype._vexConsumeGloom = function(unit) {
  const until = this._vex && this._vex.gloom.get(unit);
  if (!until) return false;
  this._vex.gloom.delete(unit);
  if (until <= performance.now() || !unit || unit.hp <= 0) return false;
  const p = this._vexPassive();
  let raw = growStat(p.gloomDamageBase, p.gloomDamageGrowth, this.champLevel || 1) + p.gloomApRatio * (this.stats.abilityPower || 0);
  if (!unit.isChampion) raw *= valueByBreakpoints(p.gloomNonChampionPercentByLevel, this.champLevel || 1) / 100;
  applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
  this._vexRefundDoom(unit.isChampion ? p.gloomRefundChampionPercent : p.gloomRefundNonChampionPercent);
  debugSkillHit('Vex 패시브(우울 소모)', unit);
  return true;
};

CharacterController.prototype._vexApplyFear = function(unit) {
  if (!unit || unit.hp <= 0) return;
  const p = this._vexPassive();
  const full = lolRangeToWorld(p.fearSlowFullDistance || 800);
  const fearSlowAt = (dist) => p.fearSlowMin + (p.fearSlowMax - p.fearSlowMin) * Math.min(1, Math.max(0, dist / full));
  applyStatus(unit, { id: 'vexDoomFear', type: 'FEAR', duration: valueByBreakpoints(p.fearDurationByLevel, this.champLevel || 1), value: 1, source: this, fearSlowAt });
  debugSkillHit('Vex 패시브(파멸 공포)', unit);
};

// 기본 스킬 적중 공통: 우울 소모 → 파멸이 실린 시전이면 공포.
CharacterController.prototype._vexOnAbilityHit = function(unit, doom) {
  this._vexConsumeGloom(unit);
  if (doom) this._vexApplyFear(unit);
};

CharacterController.prototype._vexOnBasicAttackHit = function(target) { this._vexConsumeGloom(target); };

// 적이 돌진·점멸했을 때 호출하는 훅(반경 1600 안의 적 챔피언·몬스터에 우울 표식).
// 현재 데모의 적(허수아비·미니언)은 돌진하지 않아 호출부가 없다 - 적 돌진이 생기면 여기로 알린다.
function vexNotifyEnemyDash(unit) {
  const c = typeof controller !== 'undefined' ? controller : null;
  if (unit) unit._lastDashAt = performance.now(); // 81차: 벡스 W가 돌진 중인 적에게 넓은 반경(550)을 쓰기 위한 표시
  if (!c || c.championId !== 'vex' || !c._vex || !unit || unit.hp <= 0) return;
  if (!(unit.isChampion || unit.isMonster)) return;
  const p = getWorldPosition(unit); if (!p) return;
  const d = Math.hypot(p.x - c.root.position.x, p.z - c.root.position.z);
  if (d <= lolRangeToWorld(c._vexPassive().gloomRadius)) c._vexMarkGloom(unit);
}

// 28차: 벡스 R 직선 판정 - 경로상 처음 닿는(가장 가까운) 적 챔피언(미니언·몬스터는 통과).
