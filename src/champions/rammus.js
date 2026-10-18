/* ============================================================
   람머스(Rammus) 전투 로직 - 38차
   ------------------------------------------------------------
   노틸러스와 같은 패턴 - CharacterController.prototype 확장. 수치는 전부 champion_data.js의 rammus 항목
   (출처·추정 표시도 그쪽 주석).

   이 데모에 맞춘 해석(명시):
   - Q(대회전): 구르는 동안에도 우클릭으로 방향을 바꾼다(원작). 적을 우클릭하면 공격 대신 그쪽으로 굴러간다.
     적(챔피언·미니언)에 닿으면 멈추고 반경 250에 피해·넉백·기절·둔화. 재사용 대기시간은 구르기가 끝난 뒤부터 돈다.
     구르는 모습: Spell1로 몸을 만 뒤 팔다리를 다 집어넣은 지점에서 멈춰 그 공 자세를 실제 이동 거리만큼 앞으로 굴린다
     (GLB에 굴림 반복 클립이 없음 - 39·40차).
   - W(몸 말아 웅크리기): 평타로 람머스를 때린 적(포탑 제외)에게 마법 피해를 돌려준다. W를 쓰면 구르기가 끝난다(원작).
   - E(광란의 도발): 도발된 대상은 행동 불가 + 람머스에게 걸어온다(이 연습장의 적은 평타를 하지 않아 "람머스를 공격"을
     "람머스에게 다가감"으로 표현 - 아리 매혹과 같은 이동 처리, 감속 없음).
   - R(지진 폭격): 지점으로 뛰어올라 착지 - 피해·둔화, 이어서 여진 3회(둔화만). 구르는 중에 쓰면 중앙 적이 공중에 뜨고
     대회전 피해를 추가로 받는다. 사거리는 기본 + 추가 이동 속도(추정 공식).
   ============================================================ */

CharacterController.prototype._rammusIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};
CharacterController.prototype._rammusLevelLerp = function(at1, at18) {
  const lvl = Math.max(1, Math.min(18, this.champLevel || 1));
  return at1 + (at18 - at1) * (lvl - 1) / 17;
};

/* ---------------- 패시브 - 가시박힌 껍질 ---------------- */
// 총 방어력·총 마법 저항력의 15%를 추가 공격력으로. 방어력이 바뀔 때(레벨·아이템·W)만 스탯을 다시 계산한다.
CharacterController.prototype._rammusTickPassive = function() {
  const p = this._champData().passive;
  const want = (this.stats.armor || 0) * p.armorToAdPercent / 100 + (this.stats.magicResist || 0) * p.mrToAdPercent / 100;
  if (Math.abs(want - (this.bonusAD || 0)) > 0.01) { this.bonusAD = want; this.recomputeStats(); }
};

/* ---------------- Q - 대회전 ---------------- */
CharacterController.prototype._rammusCastQ = function(mouseWorldPoint, free = false) {
  if (!this._rammusIsAlive()) return;
  const r = this._rammus;
  const q = this._champData().Q;
  if (r.roll) { // 재사용: 1초 뒤부터 일찍 끝낸다
    if (r.roll.elapsed >= q.recastLockSec) this._rammusEndRoll('recast');
    return;
  }
  if (r.jump) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('Q', free)) return;
  const cd = this.cooldowns.Q;
  this.cooldowns.Q = 0; // 재사용 대기시간은 구르기가 끝난 뒤부터(_rammusEndRoll)
  // 진행 중이던 평타는 끊는다(구르는 동안 평타 불가).
  if (this.currentActionKey && /^(attack|crit)/i.test(String(this.currentActionKey))) {
    this._clearActionTimers(); this.currentActionKey = null; this.currentPhase = null;
  }
  r.roll = { elapsed: 0, cd: free ? 0 : cd };
  applyStatus(this, { id: 'rammusQ_ms', type: 'MS_BUFF', duration: q.rollDurationSec + 0.5, value: 0 });
  const clip = this._rammusRollClip();
  this._beginTransientMoveClip(clip);
  this.playFirstAvailable([clip], { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true }); // 몸을 마는 모습(공 자세에서 멈춤 - _rammusHoldBallPose)
  this._rammusBeginBallSpin();
  if (this.currentTarget && this.currentTarget.hp > 0) this._tryEngageTarget(); // 대상이 있으면 그쪽으로 굴러간다
  debugSkillHit('Rammus Q(대회전) 시작', this);
};
CharacterController.prototype._rammusTickRoll = function(dt) {
  const roll = this._rammus.roll;
  if (!roll) return;
  const q = this._champData().Q;
  roll.elapsed += dt;
  // 이동 속도: 초당 일정 비율씩 늘어 최대치까지(레벨 비례).
  const rate = this._rammusLevelLerp(q.msPercentPerSecAt1, q.msPercentPerSecAt18);
  const cap = this._rammusLevelLerp(q.msPercentCapAt1, q.msPercentCapAt18);
  const ms = getStatus(this, 'rammusQ_ms');
  if (ms) ms.value = Math.min(cap, rate * roll.elapsed) / 100;
  this._rammusHoldBallPose();
  this._rammusTickBallSpin(dt);
  // 적과 충돌(구조물·와드 제외) → 멈추고 폭발.
  const pos = this.root.position;
  for (const u of getTargetableEnemyUnits()) {
    if (!u || u.hp <= 0 || u.isStructure || u.isWard || u.isDead) continue;
    if (typeof canRealmInteract === 'function' && !canRealmInteract(this, u)) continue;
    const up = getWorldPosition(u); if (!up) continue;
    if (Math.hypot(up.x - pos.x, up.z - pos.z) <= (this.collisionRadius || 0) + getCollisionRadius(u) + lolRangeToWorld(10)) {
      this._rammusQImpact();
      return;
    }
  }
  if (roll.elapsed >= q.rollDurationSec) this._rammusEndRoll('timeout');
};
CharacterController.prototype._rammusQImpact = function() {
  const q = this._champData().Q;
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const raw = skillVal(q.damageByLevel, lvl) + q.apRatio * (this.stats.abilityPower || 0);
  const center = this.root.position.clone();
  const hits = findEnemiesInRadius(center, q.impactRadius);
  for (const { unit } of hits) {
    if (!unit || unit.hp <= 0 || unit.isStructure || unit.isWard) continue;
    applyDamage(unit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    if (unit.hp <= 0) continue;
    applyStatus(unit, { id: 'rammusQ_stun', type: 'STUN', duration: q.stunSec, value: 1, source: this });
    applyStatus(unit, { id: 'rammusQ_slow', type: 'SLOW', duration: q.slowDurationSec, value: skillVal(q.slowPercentByLevel, lvl) / 100, source: this });
    const up = getWorldPosition(unit);
    if (unit.mesh && up) {
      const away = new THREE.Vector3(up.x - center.x, 0, up.z - center.z);
      if (away.lengthSq() < 1e-8) away.set(0, 0, 1).applyQuaternion(this.root.quaternion); else away.normalize();
      const to = unit.mesh.position.clone().addScaledVector(away, lolRangeToWorld(q.knockbackDistance));
      to.y = unit.mesh.position.y;
      unit._pullState = { from: unit.mesh.position.clone(), to, duration: q.knockbackSec, elapsed: 0 };
    }
  }
  if (typeof vfx !== 'undefined') vfx.groundShockwave(center, lolRangeToWorld(q.impactRadius), 0xd9a45a, 0.45);
  debugSkillHit('Rammus Q(대회전) 충돌', this, { hits: hits.length, dmg: raw.toFixed(1) });
  // 원작: 충돌하면 그 자리에서 멈춘다.
  this.targetPos = null; this.isChasing = false;
  this._rammusEndRoll('impact');
};
CharacterController.prototype._rammusEndRoll = function(reason) {
  const roll = this._rammus.roll;
  if (!roll) return;
  this._rammus.roll = null;
  clearStatus(this, 'rammusQ_ms');
  this._endTransientMoveClip(this._rammusRollClip());
  this._rammusEndBallSpin();
  if (roll.cd > 0) this.cooldowns.Q = roll.cd;
  if (!this.currentActionKey) {
    if (this.state === STATE.MOVE && this.targetPos) this.playFirstAvailable(this._moveClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
    else { if (this.state === STATE.MOVE) this.setState(STATE.IDLE); this._returnToLocomotion(); }
  }
  debugSkillHit(`Rammus Q(대회전) 종료 - ${reason}`, this);
};
CharacterController.prototype._rammusRolling = function() { return !!(this._rammus && this._rammus.roll); };
CharacterController.prototype._rammusRollClip = function() {
  const db = this._championAbilityDbEntry();
  const name = db && db.Q && db.Q.rollClip;
  return name && this.findAnimation(name) ? name : 'Spell1';
};
// 공 자세 유지: 몸을 마는 클립이 rollHoldAt 지점에 오면 거기서 멈춘다. 다른 모션(이동·기절 등)으로 바뀌었으면 몸 마는 모습을
// 다시 보여 주지 않고 곧장 공 자세로 되돌린다.
CharacterController.prototype._rammusHoldBallPose = function() {
  const roll = this._rammus.roll;
  const clip = this._rammusRollClip();
  const db = this._championAbilityDbEntry();
  const holdAt = (db && db.Q && db.Q.rollHoldAt != null) ? db.Q.rollHoldAt : 1;
  if (this.currentActionKey) return;
  if (this.currentClipKey !== clip || !this.currentAction) {
    this.playFirstAvailable([clip], { loop: THREE.LoopOnce, fade: 0.1, clampWhenFinished: true });
    if (this.currentAction && roll.held) { this.currentAction.time = this.currentAction.getClip().duration * holdAt; this.currentAction.paused = true; }
    return;
  }
  const a = this.currentAction, holdTime = a.getClip().duration * holdAt;
  if (a.time >= holdTime - 1e-4 || roll.held) { a.time = holdTime; a.paused = true; roll.held = true; }
};
// 공 굴리기: 공 자세가 잡히면(_rammusHoldBallPose) 실제 메시 정점으로 공 중심을 재고, 모델 크기 래퍼(scaleWrapper)를
// 그 중심에 둔 회전축(pivot) 아래로 옮긴 뒤 이동한 거리 / 반지름만큼 앞으로 돌린다. 가시 달린 공이라 완전한 구가 아니어서,
// 회전 각도마다 "중심 → 가장 낮은 점" 거리를 미리 재 두고(32칸) 매 프레임 그만큼 띄워 가장 낮은 점이 항상 지면에 닿게 한다
// (예전: 모델 원점을 축으로 돌려 공이 땅에 박혔다 떴다 했다). root는 이동 방향을 바라보므로 회전축의 로컬 X축 둘레로 + 회전이면
// 윗면이 앞(+Z)으로 넘어간다.
const RAMMUS_SPIN_SAMPLES = 32;
CharacterController.prototype._rammusBeginBallSpin = function() {
  if (!this._rammus.spin) this._rammus.spinPending = true;
};
CharacterController.prototype._rammusCalibrateBallSpin = function() {
  const r = this._rammus;
  r.spinPending = false;
  const wrapper = this.model && this.model.parent;
  if (r.spin || !wrapper || wrapper.parent !== this.root) return;
  // root 기준 좌표로 메시 정점(뼈대 변형 적용)을 모은다.
  this.root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
  const pts = [], v = new THREE.Vector3();
  this.model.traverse((o) => {
    if (!o.isSkinnedMesh || typeof o.applyBoneTransform !== 'function') return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(toRoot); pts.push(v.y, v.z, v.x); }
  });
  if (!pts.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); minZ = Math.min(minZ, pts[i + 1]); maxZ = Math.max(maxZ, pts[i + 1]); minX = Math.min(minX, pts[i + 2]); maxX = Math.max(maxX, pts[i + 2]); }
  const c = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  // 각도 θ로 X축 둘레를 돌렸을 때 중심에서 가장 낮은 점까지의 거리. y' = y·cosθ - z·sinθ.
  const lowest = new Float32Array(RAMMUS_SPIN_SAMPLES);
  for (let k = 0; k < RAMMUS_SPIN_SAMPLES; k++) {
    const th = (k / RAMMUS_SPIN_SAMPLES) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
    let m = 0;
    for (let i = 0; i < pts.length; i += 3) { const y = (pts[i] - c.y) * cs - (pts[i + 1] - c.z) * sn; if (-y > m) m = -y; }
    lowest[k] = m;
  }
  const radius = Math.max(1e-3, lowest.reduce((a, x) => a + x, 0) / RAMMUS_SPIN_SAMPLES); // 굴림 속도용 평균 반지름
  const pivot = new THREE.Group();
  pivot.position.set(c.x, c.y, c.z); // 지금 공이 있는 높이에서 시작해 지면으로 내려앉는다(_rammusTickBallSpin)
  this.root.add(pivot);
  const basePos = wrapper.position.clone();
  pivot.add(wrapper);
  wrapper.position.set(basePos.x - c.x, basePos.y - c.y, basePos.z - c.z);
  r.spin = { pivot, wrapper, basePos, radius, lowest, angle: 0, yCur: c.y, last: this.root.position.clone() };
};
CharacterController.prototype._rammusTickBallSpin = function(dt = 0) {
  const r = this._rammus;
  if (r.spinPending && r.roll && (r.roll.held || r.roll.elapsed >= 1.5)) this._rammusCalibrateBallSpin(); // 공 자세가 잡힌 뒤에 잰다
  const sp = r.spin;
  if (!sp) return;
  const p = this.root.position;
  const moved = Math.hypot(p.x - sp.last.x, p.z - sp.last.z);
  sp.last.copy(p);
  if (moved > 0 && moved < sp.radius * 20) sp.angle = (sp.angle + moved / sp.radius) % (Math.PI * 2); // 순간이동(점멸 등)은 굴리지 않는다
  sp.pivot.rotation.x = sp.angle;
  const f = (sp.angle / (Math.PI * 2)) * RAMMUS_SPIN_SAMPLES, k0 = Math.floor(f) % RAMMUS_SPIN_SAMPLES, k1 = (k0 + 1) % RAMMUS_SPIN_SAMPLES, t = f - Math.floor(f);
  const groundY = sp.lowest[k0] * (1 - t) + sp.lowest[k1] * t; // 가장 낮은 점이 지면에 닿는 높이
  // 몸을 말며 뛰어오른 높이에서 지면까지는 순간 이동 없이 내려앉게 한다.
  sp.yCur += (groundY - sp.yCur) * Math.min(1, dt * 14);
  sp.pivot.position.y = sp.yCur;
};
CharacterController.prototype._rammusEndBallSpin = function() {
  if (this._rammus) this._rammus.spinPending = false;
  const sp = this._rammus && this._rammus.spin;
  if (!sp) return;
  this._rammus.spin = null;
  this.root.add(sp.wrapper);
  sp.wrapper.position.copy(sp.basePos);
  if (sp.pivot.parent) sp.pivot.parent.remove(sp.pivot);
};

/* ---------------- W - 몸 말아 웅크리기 ---------------- */
CharacterController.prototype._rammusWActive = function() { return !!(this._rammus && this._rammus.wUntil && performance.now() < this._rammus.wUntil); };
CharacterController.prototype._rammusCastW = function(free = false) {
  if (!this._rammusIsAlive()) return;
  const r = this._rammus;
  const w = this._champData().W;
  if (this._rammusWActive()) { // 재사용: 일찍 끝내기
    if (performance.now() - r.wStartedAt >= w.recastLockSec * 1000) this._rammusEndW();
    return;
  }
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('W', free)) return;
  if (r.roll) this._rammusEndRoll('W'); // 원작: W를 쓰면 대회전이 끝난다
  const lvl = Math.max(1, this.skillLevels.W || 1);
  const armorNow = this.stats.armor || 0;
  r.wArmor = skillVal(w.bonusArmorByLevel, lvl) + armorNow * skillVal(w.armorPercentByLevel, lvl) / 100;
  r.wMr = skillVal(w.bonusMrByLevel, lvl);
  this.bonusArmor = (this.bonusArmor || 0) + r.wArmor;
  this.bonusMr = (this.bonusMr || 0) + r.wMr;
  r.wStartedAt = performance.now();
  r.wUntil = r.wStartedAt + w.durationSec * 1000;
  this.recomputeStats();
  // 웅크리는 모션(Spell2)은 한 번 - 끝나면 대기/달리기로 돌아간다(40차: 예전엔 마지막 프레임에 멈춘 채 다음 행동까지 굳어 있었다).
  if (!this.currentActionKey && this.state !== STATE.MOVE && this.findAnimation('Spell2')) {
    this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
    this._champTimeout(() => {
      if (this.championId !== 'rammus' || this.currentClipKey !== 'Spell2' || this.currentActionKey || this._rammusRolling()) return;
      if (this.state === STATE.MOVE && this.targetPos) this.playFirstAvailable(this._moveClips(), { loop: THREE.LoopRepeat, fade: 0.12 });
      else this._returnToLocomotion();
    }, Math.max(0.1, this.findAnimation('Spell2').duration - 0.08) * 1000);
  }
  if (typeof vfx !== 'undefined') vfx.groundShockwave(this.root.position.clone(), BASE_UNIT * 0.8, 0xc9b27a, 0.4);
  this._rammusShowWRing(true);
  debugSkillHit('Rammus W(몸 말아 웅크리기)', this, { armor: r.wArmor.toFixed(1), mr: r.wMr.toFixed(1) });
};
CharacterController.prototype._rammusEndW = function() {
  const r = this._rammus;
  if (!r || !r.wUntil) return;
  this.bonusArmor = Math.max(0, (this.bonusArmor || 0) - r.wArmor);
  this.bonusMr = Math.max(0, (this.bonusMr || 0) - r.wMr);
  r.wArmor = 0; r.wMr = 0; r.wUntil = 0;
  this.recomputeStats();
  this._rammusShowWRing(false);
};
// W가 켜져 있는 동안 발밑에 가시 고리(연출 - 색·크기는 연출값). 람머스를 따라다니도록 root에 붙인다.
CharacterController.prototype._rammusShowWRing = function(on) {
  const r = this._rammus;
  if (!on) { if (r.wRing) { if (r.wRing.parent) r.wRing.parent.remove(r.wRing); r.wRing.geometry.dispose(); r.wRing.material.dispose(); r.wRing = null; } return; }
  if (r.wRing || !this.root) return;
  const radius = (this.collisionRadius || BASE_UNIT * 0.5) * 1.6;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 40), new THREE.MeshBasicMaterial({ color: 0xd8b45a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  this.root.add(ring);
  r.wRing = ring;
};
// 평타로 람머스를 때린 적에게 반사 피해(포탑 제외 - 위키). controller_lifecycle.js takeDamage()에서 호출.
CharacterController.prototype._rammusOnTakeDamage = function(source, meta) {
  if (!this._rammusWActive() || !meta || !meta.isBasicAttack || !source || source === this || source.isTurret || source.isStructure || !(source.hp > 0)) return;
  const w = this._champData().W;
  const lvl = Math.max(1, this.skillLevels.W || 1);
  const bonusArmor = Math.max(0, (this.stats.armor || 0) - (this.stats.baseArmor || 0));
  applyDamage(source, { rawDamage: skillVal(w.returnDamageByLevel, lvl) + w.returnArmorRatio * bonusArmor, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
};

/* ---------------- E - 광란의 도발 ---------------- */
CharacterController.prototype._rammusCastE = function(free = false) {
  if (!this._rammusIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this) || this._rammus.jump) return;
  const e = this._champData().E;
  const target = this.currentTarget;
  if (!target || target.hp <= 0 || !target.isChampion) { debugSkillMiss('Rammus E(광란의 도발)', '적 챔피언 대상 필요'); return; }
  if (!isInRange(this, target, e.range)) { debugSkillMiss('Rammus E(광란의 도발)', 'out of range'); return; }
  if (!this._payCost('E', free)) return;
  const lvl = Math.max(1, this.skillLevels.E || 1);
  const dir = new THREE.Vector3().subVectors(getWorldPosition(target), this.root.position).setY(0);
  if (dir.lengthSq() > 1e-6) this.faceDirectionInstant(dir.normalize());
  applyStatus(target, { id: 'rammusE_taunt', type: 'TAUNT', duration: skillVal(e.tauntDurationByLevel, lvl), value: 1, source: this });
  if (!this._rammusRolling() && !this.currentActionKey) this.playFirstAvailable(['Spell3'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: false });
  vfx.spawn('hit', getWorldPosition(target).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xff6a3a });
  debugSkillHit('Rammus E(광란의 도발)', target);
};

/* ---------------- R - 지진 폭격 ---------------- */
CharacterController.prototype._rammusRRangeLol = function() {
  const r = this._champData().R;
  const baseMs = this._champData().stats.moveSpeed;
  const nowMs = typeof worldDistanceToLol === 'function' ? worldDistanceToLol(getFinalMoveSpeed(this.stats)) : baseMs;
  return r.rangeBase + r.rangeBonusMsRatio * Math.max(0, nowMs - baseMs);
};
CharacterController.prototype._rammusCastR = function(mouseWorldPoint, free = false) {
  if (!this._rammusIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this) || this._rammus.jump) return;
  const rd = this._champData().R;
  const from = this.root.position.clone();
  const dir = mouseWorldPoint ? new THREE.Vector3(mouseWorldPoint.x - from.x, 0, mouseWorldPoint.z - from.z) : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  const range = lolRangeToWorld(this._rammusRRangeLol()); // 사거리는 시전 순간(구르는 중이면 그 빠른 이동 속도) 기준
  let dist = dir.length();
  if (dist < 1e-4) { dir.set(0, 0, 1).applyQuaternion(this.root.quaternion); dist = 0; } else dir.multiplyScalar(1 / dist);
  if (!this._payCost('R', free)) return;
  let to = from.clone().addScaledVector(dir, Math.min(dist, range)); // 사거리 밖을 찍으면 최대 사거리 지점
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) to = howlingAbyssMap.clampPosition(to);
  to.y = from.y;
  const wasRolling = this._rammusRolling();
  if (wasRolling) this._rammusEndRoll('R');
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'rammusR'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.targetPos = null; this.isChasing = false;
  this.setState(STATE.R_CAST);
  const db = this._championAbilityDbEntry();
  const jumpClip = db && db.R && db.R.jumpClip;
  this.playFirstAvailable([jumpClip, 'Spell4'].filter(Boolean), { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  this._rammus.jump = { from, to, elapsed: 0, dur: rd.jumpSec, powerball: wasRolling, lvl: Math.max(1, this.skillLevels.R || 1) };
  debugSkillHit('Rammus R(지진 폭격) 도약', this, { powerball: wasRolling });
};
CharacterController.prototype._rammusTickJump = function(dt) {
  const j = this._rammus.jump;
  if (!j) return;
  j.elapsed += dt;
  const t = Math.min(1, j.elapsed / j.dur);
  const pos = this.root.position;
  pos.x = j.from.x + (j.to.x - j.from.x) * t;
  pos.z = j.from.z + (j.to.z - j.from.z) * t;
  pos.y = j.from.y + BASE_UNIT * 1.4 * 4 * t * (1 - t); // 포물선 도약(높이는 연출값)
  if (t < 1) return;
  pos.y = j.from.y;
  this._rammus.jump = null;
  this._rammusLand(j);
  if (this.currentActionKey === 'rammusR') { this.currentActionKey = null; this.currentPhase = null; this.setState(STATE.IDLE); this._resumeAfterAction(); }
};
CharacterController.prototype._rammusLand = function(j) {
  const rd = this._champData().R;
  const q = this._champData().Q;
  const center = this.root.position.clone();
  const raw = skillVal(rd.damageByLevel, j.lvl) + rd.apRatio * (this.stats.abilityPower || 0);
  const slow = skillVal(rd.slowPercentByLevel, j.lvl) / 100;
  const qLvl = Math.max(1, this.skillLevels.Q || 1);
  const qRaw = skillVal(q.damageByLevel, qLvl) + q.apRatio * (this.stats.abilityPower || 0);
  const units = getTargetableEnemyUnits().filter((u) => u && u.hp > 0 && !u.isWard && isInCircle(u, center, lolRangeToWorld(rd.radius)));
  for (const u of units) {
    if (typeof canRealmInteract === 'function' && !canRealmInteract(this, u)) continue;
    applyDamage(u, { rawDamage: raw * (u.isStructure ? rd.structureDamageMultiplier : 1), damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    if (u.isStructure || u.hp <= 0) continue;
    applyStatus(u, { id: 'rammusR_slow', type: 'SLOW', duration: rd.slowDurationSec, value: slow, source: this });
    if (j.powerball && isInCircle(u, center, lolRangeToWorld(rd.centerRadius))) {
      applyDamage(u, { rawDamage: qRaw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
      if (u.hp > 0) applyStatus(u, { id: 'rammusR_knockup', type: 'KNOCKUP', duration: rd.powerballKnockupSec, value: 1, source: this });
    }
  }
  if (typeof vfx !== 'undefined') {
    vfx.groundShockwave(center, lolRangeToWorld(rd.radius), 0xe0a050, 0.55);
    if (j.powerball) vfx.groundShockwave(center, lolRangeToWorld(rd.centerRadius), 0xfff0b0, 0.4);
  }
  // 여진: 남은 시간 동안 같은 자리에서 둔화를 다시 건다(25.12부터 피해 없음).
  this._rammus.aftershocks = { center, lvl: j.lvl, remaining: rd.aftershockCount, interval: rd.aftershockDurationSec / rd.aftershockCount, accum: 0 };
  debugSkillHit('Rammus R(지진 폭격) 착지', this, { hits: units.length, powerball: j.powerball });
};
CharacterController.prototype._rammusTickAftershocks = function(dt) {
  const a = this._rammus.aftershocks;
  if (!a) return;
  const rd = this._champData().R;
  a.accum += dt;
  while (a.remaining > 0 && a.accum >= a.interval) {
    a.accum -= a.interval; a.remaining -= 1;
    for (const u of getTargetableEnemyUnits()) {
      if (!u || u.hp <= 0 || u.isStructure || u.isWard || !isInCircle(u, a.center, lolRangeToWorld(rd.radius))) continue;
      applyStatus(u, { id: 'rammusR_slow', type: 'SLOW', duration: rd.slowDurationSec, value: skillVal(rd.slowPercentByLevel, a.lvl) / 100, source: this });
    }
    if (typeof vfx !== 'undefined') vfx.groundShockwave(a.center.clone(), lolRangeToWorld(rd.radius), 0xb8864a, 0.4);
  }
  if (a.remaining <= 0) this._rammus.aftershocks = null;
};

/* ---------------- 매 프레임 / 정리 ---------------- */
CharacterController.prototype._rammusUpdate = function(dt) {
  if (this.championId !== 'rammus' || !this._rammus) return;
  this._rammusTickPassive();
  this._rammusTickRoll(dt);
  if (this._rammus.wUntil && performance.now() >= this._rammus.wUntil) this._rammusEndW();
  this._rammusTickJump(dt);
  this._rammusTickAftershocks(dt);
};
CharacterController.prototype._rammusReset = function() {
  if (this._rammus) {
    if (this._rammus.roll) { this._rammus.roll.cd = this._rammus.roll.cd || 0; this._rammusEndRoll('reset'); }
    this._rammusEndW();
    if (this._rammus.jump) this.root.position.y = this._rammus.jump.from.y;
    this._rammusEndBallSpin();
  }
  this._rammus = { roll: null, wUntil: 0, wStartedAt: 0, wArmor: 0, wMr: 0, jump: null, aftershocks: null, spin: null };
};
