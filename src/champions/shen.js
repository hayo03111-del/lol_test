/* ============================================================
   쉔(Shen) 전투 로직 - 105차
   ------------------------------------------------------------
   람머스·리 신과 같은 패턴 - CharacterController.prototype 확장. 수치는 전부 champion_data.js의 shen 항목
   (리그 오브 레전드 위키 Shen 문서, 마지막 변경 V26.22). 상태는 둘로 나눈다:
     this._shen   - 평범한 값만(온라인 대전에서 참가자에게 그대로 보낸다 - NET_CHAMP_STATE_KEY)
     this._shenFx - 씬 메시(영혼의 검 표시) - 보내지 않는다(검 메시는 netMirror로 참가자 화면에 복제)

   원작 규칙(위키) 그대로:
   - 영혼의 검: 쉔과 함께 생기고, 쉔이 죽으면 사라졌다가 부활하면 곁에 다시. 단결된 의지로 순간 이동하면 함께 온다.
     GLB에 없어 단순한 도형으로 표시만 한다. 그 밖의 이펙트는 만들지 않았다(요청).
   - 패시브(기 보호막): "스킬 효과가 끝나면" 보호막 - Q는 검이 도착할 때, W는 영역이 사라질 때, E는 돌진이 끝날 때,
     R은 정신 집중이 끝날 때. 스킬이 다른 챔피언에게 영향을 주면(Q·E: 적 챔피언 적중, W: 아군 챔피언이 영역에 닿음,
     R: 집중 완료) 재사용 대기시간이 4~8.25초 줄어든다.
   - Q(황혼의 습격): 검이 쉔을 따라가며 날아온다(속도 2000→5000). 지나간 적 챔피언은 2초 둔화. 검이 도착하면 다음 평타 3회
     (8초 안)가 사거리 +75·최대 체력 비례 추가 마법 피해(구조물에는 고정 피해만). 검이 적 챔피언을 맞혔으면 강화 + 공속 50%.
     강화 평타는 GLB의 Spell1_Attack1~3 동작. Q 피해로 기력 회복(한 번 시전에 한 번).
   - W(영혼의 피난처): 검 둘레 350에 영역 - 2초 뒤(또는 쉔·아군 챔피언이 들어오면) 1.75초 동안, 안의 쉔·아군 챔피언에게
     오는 포탑이 아닌 기본 공격을 막는다. 활성 중에 Q로 검을 옮기면 영역도 따라간다.
   - E(그림자 돌진): 300~600 지점으로 돌진(속도 800 + 이동 속도), 지나간 적 챔피언에게 물리 피해·1.5초 도발, 끝 지점 반경 150도
     판정. 맞히면 기력 회복(한 번).
   - R(단결된 의지): 아군 챔피언(아군 허수아비 포함)에게 시전 즉시 5초 보호막(잃은 체력에 따라 최대 +60%) → 3초 정신 집중 뒤
     그 아군 곁(가장 가까운 적 챔피언 쪽 175)으로 검과 함께 순간 이동. 집중이 끊겨도 보호막은 남는다. 아군이 없으면 못 쓴다.
   원작과 다른 점(명시): Q 둔화는 "쉔에게서 멀어질 때만"이 아니라 항상. 검이 너무 멀면 쉔 곁으로 옮겨 오는 거리는 공개되지 않아 2000으로 추정.
   ============================================================ */

CharacterController.prototype._shenIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};
CharacterController.prototype._shenLevelLerp = function(at1, at18) {
  const lvl = Math.max(1, Math.min(18, this.champLevel || 1));
  return at1 + (at18 - at1) * (lvl - 1) / 17;
};
CharacterController.prototype._shenBonusHp = function() {
  return Math.max(0, (this.maxHp || 0) - ((typeof computeChampionStats === 'function' && computeChampionStats('shen', this.champLevel || 1)?.maxHp) || CHAMPION_DATA.shen.stats.hp));
};
// 기력으로 내는 비용 - 스킬 포인트·재사용 대기시간·기력을 확인하고 뺀다(_payCost와 같지만 "기력" 표시, 여신의 눈물 충전 없음).
CharacterController.prototype._shenPay = function(slot, free) {
  if (free) return true;
  if ((this.skillLevels[slot] || 0) < 1) { showSkillToast(`${slot} - 아직 스킬 포인트를 투자하지 않음`); return false; }
  if (this.cooldowns[slot] > 0) { showSkillToast(`${slot} - 쿨다운 ${this.cooldowns[slot].toFixed(1)}s 남음`); return false; }
  const d = this._champData()[slot], lvl = this.skillLevels[slot] || 1;
  const cost = skillVal(d.energy || 0, lvl);
  if (this.mp < cost) { showSkillToast(`${slot} - 기력 부족 (${this.mp.toFixed(0)}/${cost})`); return false; }
  this.mp -= cost;
  this.cooldowns[slot] = abilityHasteCooldown(this, skillVal(d.cooldown, lvl), slot);
  updateBars(this);
  return true;
};
CharacterController.prototype._shenRestoreEnergy = function() {
  this.mp = Math.min(this.maxMp || 0, this.mp + valueByBreakpoints(this._champData().E.energyRestoreByLevel, this.champLevel || 1));
  updateBars(this);
};

/* ---------------- 영혼의 검 ---------------- */
CharacterController.prototype._shenBladePos = function() {
  const b = this._shen && this._shen.blade;
  return b ? new THREE.Vector3(b.x, this.root.position.y, b.z) : this.root.position.clone();
};
CharacterController.prototype._shenParkBladeBeside = function() {
  if (!this._shen || !this.root) return;
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion).multiplyScalar(lolRangeToWorld(70));
  this._shen.blade = { x: this.root.position.x + side.x, z: this.root.position.z + side.z };
};
CharacterController.prototype._shenEnsureBladeMesh = function() {
  if (!this._shenFx) this._shenFx = {};
  if (this._shenFx.blade || typeof scene === 'undefined') return this._shenFx.blade;
  const len = lolRangeToWorld(150), w = lolRangeToWorld(12);
  const g = new THREE.Group(); g.name = 'shenSpiritBlade';
  const glow = new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.85, depthWrite: false });
  const core = new THREE.MeshBasicMaterial({ color: 0xe8f7ff, transparent: true, opacity: 0.95, depthWrite: false });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(w, len, w * 0.35), glow); blade.position.y = len * 0.5; g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(w * 3.2, w * 0.6, w * 0.6), core); guard.position.y = len * 0.02; g.add(guard);
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, len * 0.22, w * 0.6), core); hilt.position.y = -len * 0.1; g.add(hilt);
  g.rotation.z = Math.PI; // 칼끝이 아래
  const holder = new THREE.Group(); holder.add(g);
  scene.add(holder);
  this._shenFx.blade = holder;
  return holder;
};
CharacterController.prototype._shenTickBlade = function(dt) {
  const s = this._shen;
  if (!(this.hp > 0) || this.state === STATE.DEAD || this.state === STATE.RESPAWN) { // 죽어 있는 동안은 사라지고, 부활하면 쉔 곁에서 다시
    s.blade = null; s.recall = null;
    if (this._shenFx && this._shenFx.blade) this._shenFx.blade.visible = false;
    return;
  }
  if (!s.blade) this._shenParkBladeBeside();
  const q = this._champData().Q;
  // 너무 멀어지면(위키: 거리 미공개 - 2000 추정) 검이 쉔 곁으로 옮겨 온다. 귀환·순간 이동 뒤에도 이 규칙으로 따라온다.
  if (!s.recall && Math.hypot(s.blade.x - this.root.position.x, s.blade.z - this.root.position.z) > lolRangeToWorld(this._champData().passive.bladeLeashRange)) this._shenParkBladeBeside();
  // 날아오는 중: 쉔(움직여도 따라간다)에게 곧장, 점점 빨라진다 - 지나간 구간에 닿은 적 챔피언을 한 번씩
  if (s.recall) {
    s.recall.speed = Math.min(q.bladeSpeedMax, (s.recall.speed || q.bladeSpeedMin) + q.bladeAccel * dt);
    const from = new THREE.Vector3(s.blade.x, 0, s.blade.z);
    const to = new THREE.Vector3(this.root.position.x, 0, this.root.position.z);
    const d = from.distanceTo(to), step = lolRangeToWorld(s.recall.speed) * dt;
    const arrived = d <= step + lolRangeToWorld(20);
    const next = arrived ? to.clone() : from.clone().addScaledVector(to.clone().sub(from).normalize(), step);
    for (const u of this._shenSegmentHits(from, next, q.bladeHalfWidth)) {
      if (!u.isChampion || s.recall.hit.includes(u)) continue;
      s.recall.hit.push(u);
      this._shenBladeHit(u);
    }
    s.blade.x = next.x; s.blade.z = next.z;
    if (arrived) this._shenBladeArrived();
  }
  const mesh = this._shenEnsureBladeMesh();
  if (mesh) {
    s.bob = (s.bob || 0) + dt;
    mesh.position.set(s.blade.x, this.root.position.y + lolRangeToWorld(70) + Math.sin(s.bob * 2.2) * lolRangeToWorld(8), s.blade.z);
    mesh.rotation.y += dt * (s.recall ? 9 : 0.8);
    mesh.visible = true;
    if (typeof netMirror === 'function') netMirror(mesh);
  }
};
// 선분 a→b(폭 halfWidthLol)에 닿은 살아 있는 적(구조물·와드 제외)
CharacterController.prototype._shenSegmentHits = function(a, b, halfWidthLol) {
  const out = [];
  const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || u.isStructure || u.isWard || u.isUntargetable) continue;
    if (typeof canRealmInteract === 'function' && !canRealmInteract(this, u)) continue;
    const p = getWorldPosition(u); if (!p) continue;
    let t = L2 > 1e-9 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + abx * t), dz = p.z - (a.z + abz * t);
    if (Math.hypot(dx, dz) <= lolRangeToWorld(halfWidthLol) + (typeof getCollisionRadius === 'function' ? getCollisionRadius(u) : 0)) out.push(u);
  }
  return out;
};

/* ---------------- 패시브 - 기 보호막 ---------------- */
// 스킬 효과가 끝날 때 부른다. affected = 그 스킬이 다른 챔피언에게 영향을 줬나(재사용 대기시간 감소).
CharacterController.prototype._shenKiBarrier = function(affected = false) {
  const s = this._shen, p = this._champData().passive, now = performance.now();
  if (affected) this._shenKiReduce();
  if (now < (s.kiReadyAt || 0)) return;
  const amount = (this._shenLevelLerp(p.shieldAt1, p.shieldAt18) + p.bonusHpRatio * this._shenBonusHp()) * (typeof getShieldReceivedMultiplier === 'function' ? getShieldReceivedMultiplier(this) : 1);
  addShield(this, 'shenKiBarrier', amount, p.durationSec);
  s.kiReadyAt = now + p.cooldownSec * 1000;
};

// 재사용 대기시간 감소(돌고 있을 때만) - Q·E는 적 챔피언을 맞히는 순간, W·R은 효과가 끝날 때(위키)
CharacterController.prototype._shenKiReduce = function() {
  const s = this._shen, p = this._champData().passive, now = performance.now();
  if (s.kiReadyAt > now) s.kiReadyAt = Math.max(now, s.kiReadyAt - this._shenLevelLerp(p.cdReduceAt1, p.cdReduceAt18) * 1000);
};

/* ---------------- Q - 황혼의 습격 ---------------- */
CharacterController.prototype._shenCastQ = function(mouseWorldPoint, free = false) {
  if (!this._shenIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this) || this._shen.r) return;
  if (!this._shenPay('Q', free)) return;
  const s = this._shen;
  if (!s.blade) this._shenParkBladeBeside();
  s.recall = { hit: [], champHit: false, speed: 0, lvl: Math.max(1, this.skillLevels.Q || 1) };
  if (!this.currentActionKey && !this._dashState) this.playFirstAvailable(['Spell1'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: false });
  debugSkillHit('Shen Q(황혼의 습격)', this, { from: this._shenBladePos() });
};
CharacterController.prototype._shenBladeHit = function(u) {
  const q = this._champData().Q, s = this._shen;
  applyStatus(u, { id: 'shenQ_slow', type: 'SLOW', duration: q.slowDurationSec, value: skillVal(q.slowPercentByLevel, s.recall.lvl) / 100, source: this });
  if (!s.recall.champHit) this._shenKiReduce(); // 적 챔피언을 맞히는 순간
  s.recall.champHit = true;
};
// 검이 도착: 다음 평타 3회 강화(검이 적 챔피언을 맞혔으면 더 강하게 + 공속), 기 보호막
CharacterController.prototype._shenBladeArrived = function() {
  const q = this._champData().Q, s = this._shen, rc = s.recall;
  s.recall = null;
  this._shenParkBladeBeside();
  s.qAttacks = q.attacks; s.qEmpowered = !!rc.champHit; s.qUntil = performance.now() + q.durationSec * 1000; s.qLvl = rc.lvl; s.qEnergyGiven = false;
  const db = this._championAbilityDbEntry();
  const clips = (db && db.Q && db.Q.empoweredAttackClips || []).filter((c) => this.findAnimation && this.findAnimation(c));
  if (clips.length) this.registerAttackOverride({ id: 'shenQ', clips: [clips[0]], sequenceClips: clips, priority: 10, oneShot: true, uses: q.attacks, durationSec: q.durationSec });
  if (s.qEmpowered) applyStatus(this, { id: 'shenQ_as', type: 'MASTERYI_R_AS', duration: q.durationSec, value: q.empoweredAttackSpeedPercent / 100 });
  if (typeof this.recomputeStats === 'function') this.recomputeStats(); // 사거리 +75
  this._shenKiBarrier(false); // 감소는 맞힐 때 이미 했다
};
CharacterController.prototype._shenQRangeBonusLol = function() {
  const s = this._shen;
  return s && s.qAttacks > 0 && performance.now() <= (s.qUntil || 0) ? this._champData().Q.bonusRange : 0;
};
// controller_combat.js _onBasicAttackHit()에서: 강화 평타면 추가 마법 피해(구조물에는 고정 피해만)
CharacterController.prototype._shenOnBasicAttackHit = function(target) {
  const s = this._shen;
  if (!s || !(s.qAttacks > 0) || performance.now() > (s.qUntil || 0) || !target || target.hp <= 0 || target.isWard) return;
  const q = this._champData().Q, lvl = s.qLvl || 1, ap = this.stats.abilityPower || 0;
  const pct = s.qEmpowered ? skillVal(q.empoweredMaxHpPercentByLevel, lvl) + q.empoweredMaxHpPercentPer100Ap * ap / 100
    : skillVal(q.maxHpPercentByLevel, lvl) + q.maxHpPercentPer100Ap * ap / 100;
  const flat = this._shenLevelLerp(q.flatAt1, q.flatAt18);
  const raw = flat + (target.isStructure ? 0 : (target.maxHp || 0) * pct / 100);
  applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isBasicAttack: true, isOnHitBonus: true, isAbility: false, source: this });
  if (!s.qEnergyGiven) { s.qEnergyGiven = true; this._shenRestoreEnergy(); } // Q 피해로 기력 회복(한 번 시전에 한 번 - 해석)
  s.qAttacks -= 1;
  if (s.qAttacks <= 0) this._shenEndQ();
};
CharacterController.prototype._shenEndQ = function() {
  const s = this._shen; if (!s) return;
  const had = s.qAttacks > 0 || s.qUntil > 0;
  s.qAttacks = 0; s.qEmpowered = false; s.qUntil = 0;
  this.clearAttackOverride('shenQ');
  if (typeof clearStatus === 'function') clearStatus(this, 'shenQ_as');
  if (had && typeof this.recomputeStats === 'function') this.recomputeStats();
};

/* ---------------- W - 영혼의 피난처 ---------------- */
CharacterController.prototype._shenCastW = function(mouseWorldPoint, free = false) {
  if (!this._shenIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._shenPay('W', free)) return;
  const w = this._champData().W, now = performance.now();
  this._shen.zone = { primedUntil: now + w.primeSec * 1000, activeUntil: 0, team: this.team || PLAYER_TEAM, touchedAlly: false };
  this._shenTickZone(); // 쉔·아군이 이미 안에 있으면 바로 켜진다
  if (!this.currentActionKey && !this._dashState) this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: false });
  debugSkillHit('Shen W(영혼의 피난처)', this, { at: this._shenBladePos() });
};
// 영역 안의 아군 챔피언(쉔 포함)
CharacterController.prototype._shenZoneUnits = function() {
  const z = this._shen.zone; if (!z) return [];
  const c = this._shenBladePos(), r = lolRangeToWorld(this._champData().W.radius);
  const pool = [this, ...(typeof getAllyChampions === 'function' ? getAllyChampions(this) : [])];
  return pool.filter((u) => {
    if (!u || !(u.hp > 0) || (u.team || PLAYER_TEAM) !== z.team) return false;
    const p = getWorldPosition(u); return p && Math.hypot(p.x - c.x, p.z - c.z) <= r + (typeof getCollisionRadius === 'function' ? getCollisionRadius(u) : 0);
  });
};
CharacterController.prototype._shenTickZone = function() {
  const z = this._shen.zone; if (!z) return;
  const w = this._champData().W, now = performance.now();
  if (!z.activeUntil) {
    const inside = this._shenZoneUnits();
    if (inside.length || now >= z.primedUntil) z.activeUntil = now + w.durationSec * 1000; // 2초 뒤 또는 누가 들어오면
    else return;
  }
  if (!z.touchedAlly && this._shenZoneUnits().some((u) => u !== this)) z.touchedAlly = true;
  if (now >= z.activeUntil) { // 영역이 사라질 때 기 보호막
    this._shen.zone = null;
    this._shenKiBarrier(z.touchedAlly);
  }
};
CharacterController.prototype._shenZoneCovers = function(u) {
  const z = this._shen && this._shen.zone;
  if (!z || !z.activeUntil || performance.now() >= z.activeUntil) return false;
  return this._shenZoneUnits().includes(u);
};
// 공용 피해 진입점(applyDamage)에서: 쉔 W 영역 안의 쉔·아군 챔피언에게 오는 포탑이 아닌 기본 공격은 막는다.
function shenRefugeBlocks(target, result) {
  if (!target || !result || !result.isBasicAttack || result.isOnHitBonus || !(target.isChampion || target.isTrainingDummy)) return false;
  const src = result.source;
  if (src && (src.isTurret || src.isStructure)) return false; // 포탑 공격은 막지 않는다(위키)
  if (src && src.team && target.team && src.team === target.team) return false;
  for (const c of (typeof listChampionUnits === 'function' ? listChampionUnits() : [])) {
    if (c && c.championId === 'shen' && c._shen && c._shen.zone && c._shenZoneCovers(target)) return true;
  }
  return false;
}

/* ---------------- E - 그림자 돌진 ---------------- */
CharacterController.prototype._shenCastE = function(mouseWorldPoint, free = false) {
  if (!this._shenIsAlive()) return;
  if (isCrowdControlled(this) || isRooted(this) || this._shen.r || this._dashState) return;
  const e = this._champData().E;
  const from = this.root.position.clone();
  const dir = mouseWorldPoint ? new THREE.Vector3(mouseWorldPoint.x - from.x, 0, mouseWorldPoint.z - from.z) : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  let dist = dir.length();
  if (dist < 1e-4) { dir.set(0, 0, 1).applyQuaternion(this.root.quaternion); dist = 0; } else dir.multiplyScalar(1 / dist);
  if (!this._shenPay('E', free)) return;
  const travel = Math.max(lolRangeToWorld(e.rangeMin), Math.min(lolRangeToWorld(e.rangeMax), dist)); // 300~600(밖이면 최대)
  let to = from.clone().addScaledVector(dir, travel);
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) to = howlingAbyssMap.clampPosition(to);
  to.y = from.y;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'shenE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.targetPos = null; this.isChasing = false;
  this.setState(STATE.E_CAST);
  this.playFirstAvailable(['Spell3'], { loop: THREE.LoopOnce, fade: 0.04, clampWhenFinished: true });
  const lvl = Math.max(1, this.skillLevels.E || 1);
  const hit = new Set();
  let champHit = false;
  const strike = (u) => {
    if (hit.has(u) || !u.isChampion) return; // 챔피언(과 몬스터)만 - 이 맵에 몬스터는 없다
    hit.add(u);
    applyDamage(u, { rawDamage: skillVal(e.damageByLevel, lvl) + e.bonusHpRatio * this._shenBonusHp(), damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
    if (u.hp > 0) applyStatus(u, { id: 'shenE_taunt', type: 'TAUNT', duration: e.tauntSec, value: 1, source: this });
    if (!champHit) { champHit = true; this._shenRestoreEnergy(); this._shenKiReduce(); } // 기력 회복은 한 번만(위키), 패시브 감소는 맞히는 순간
  };
  const sweep = (a, b) => { for (const u of this._shenSegmentHits(a, b, e.halfWidth)) strike(u); };
  const msLol = worldDistanceToLol(getFinalMoveSpeed(this.stats));
  const speed = e.dashSpeedBase + e.dashSpeedMsRatio * msLol; // 800 + 이동 속도
  this._dashState = { from, to, duration: Math.max(0.05, worldDistanceToLol(getHorizontalDistance(from, to)) / speed), elapsed: 0, faceDir: dir.clone(), onTick: sweep,
    onArrive: () => {
      for (const u of getAllEnemyUnits()) if (u && u.hp > 0 && u.isChampion && isInCircle(u, this.root.position, lolRangeToWorld(e.endRadius))) strike(u); // 끝 지점 판정(반경 150)
      this._shenKiBarrier(false);
      if (this.currentActionKey === 'shenE') { this.currentActionKey = null; this.currentPhase = null; this.setState(STATE.IDLE); this._resumeAfterAction(); }
    } };
  debugSkillHit('Shen E(그림자 돌진)', this, { dist: worldDistanceToLol(travel), speed });
};

/* ---------------- R - 단결된 의지 ---------------- */
// 아군 챔피언(아군 허수아비 포함) 중 커서에 가장 가까운 하나(커서가 없으면 체력 비율이 가장 낮은 아군)
CharacterController.prototype._shenPickRTarget = function(mouseWorldPoint) {
  const allies = (typeof getAllyChampions === 'function' ? getAllyChampions(this) : []).filter((a) => a && a !== this && a.hp > 0);
  if (!allies.length) return null;
  if (mouseWorldPoint) return allies.reduce((best, a) => (!best || getHorizontalDistance(getWorldPosition(a), mouseWorldPoint) < getHorizontalDistance(getWorldPosition(best), mouseWorldPoint) ? a : best), null);
  return allies.reduce((best, a) => (!best || a.hp / (a.maxHp || 1) < best.hp / (best.maxHp || 1) ? a : best), null);
};
CharacterController.prototype._shenCastR = function(mouseWorldPoint, free = false) {
  if (!this._shenIsAlive()) return;
  if (isSilenced(this) || isCrowdControlled(this) || this._shen.r || this._dashState) return;
  const target = this._shenPickRTarget(mouseWorldPoint);
  if (!target) { showSkillToast('R - 보호할 아군 챔피언이 없습니다'); return; }
  if (!this._shenPay('R', free)) return;
  const rd = this._champData().R, lvl = Math.max(1, this.skillLevels.R || 1);
  const missing = Math.max(0, Math.min(1, 1 - target.hp / (target.maxHp || 1)));
  const amp = 1 + Math.min(rd.missingHpAmpMax, missing); // 잃은 체력에 따라 0~60%(잃은 체력 1%당 1%로 해석)
  const amount = (skillVal(rd.shieldByLevel, lvl) + rd.shieldBonusHpRatio * this._shenBonusHp() + rd.shieldApRatio * (this.stats.abilityPower || 0)) * amp
    * (typeof getShieldReceivedMultiplier === 'function' ? getShieldReceivedMultiplier(target) : 1);
  addShield(target, 'shenR', amount, rd.shieldDurationSec); // 시전 즉시(위키)
  const tp = getWorldPosition(target), face = new THREE.Vector3(tp.x - this.root.position.x, 0, tp.z - this.root.position.z);
  if (face.lengthSq() > 1e-6) this.faceDirectionInstant(face.normalize()); // 대상 쪽을 본다
  this._clearActionTimers();
  this.currentActionKey = 'shenR'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.targetPos = null; this.isChasing = false; this.currentTarget = null;
  this.setState(STATE.R_CAST);
  this.playFirstAvailable(['Spell4', 'Channel'], { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
  this._shen.r = { targetId: typeof entityId === 'function' ? entityId(target) : null, elapsed: 0 };
  this._shenRTarget = target;
  debugSkillHit('Shen R(단결된 의지)', target, { shield: Math.round(amount) });
};
CharacterController.prototype._shenTickR = function(dt) {
  const r = this._shen.r; if (!r) return;
  const rd = this._champData().R, t = this._shenRTarget;
  r.elapsed += dt;
  // 대상이 죽으면 취소(재사용 대기시간은 그대로), 행동 불가 CC면 끊긴다 - 보호막은 남는다
  if (!t || !(t.hp > 0) || t.state === STATE.DEAD || isCrowdControlled(this) || this.currentActionKey !== 'shenR') { this._shenEndR(false); return; }
  if (r.elapsed < rd.channelSec) return;
  // 순간 이동: 아군에게서 가장 가까운 적 챔피언(2000 안) 쪽으로 175, 적이 없으면 쉔이 있던 쪽으로
  const tp = getWorldPosition(t), me = this.root.position;
  let enemy = null, bd = lolRangeToWorld(rd.enemySearchRange);
  for (const u of getAllEnemyUnits()) {
    if (!u || !(u.hp > 0) || !u.isChampion) continue;
    const d = getHorizontalDistance(getWorldPosition(u), tp);
    if (d < bd) { bd = d; enemy = u; }
  }
  const toward = enemy ? new THREE.Vector3().subVectors(getWorldPosition(enemy), tp) : new THREE.Vector3(me.x - tp.x, 0, me.z - tp.z);
  toward.y = 0;
  if (toward.lengthSq() < 1e-6) toward.set(1, 0, 0);
  toward.normalize().multiplyScalar(lolRangeToWorld(rd.placeDistance));
  let to = new THREE.Vector3(tp.x + toward.x, me.y, tp.z + toward.z);
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) { to = howlingAbyssMap.clampPosition(to); to.y = me.y; }
  me.copy(to);
  this._shenParkBladeBeside(); // 검도 함께 온다
  if (typeof snapCameraTo === 'function' && this === (typeof controller !== 'undefined' ? controller : null)) snapCameraTo(me);
  this._shenEndR(true);
  this._shenKiBarrier(true); // 집중 완료 - 아군에게 영향을 줬다
};
CharacterController.prototype._shenEndR = function(done) {
  if (!this._shen || !this._shen.r) return;
  this._shen.r = null; this._shenRTarget = null;
  if (this.currentActionKey === 'shenR') { this.currentActionKey = null; this.currentPhase = null; this.setState(STATE.IDLE); this._resumeAfterAction(); }
  if (!done) debugSkillMiss('Shen R(단결된 의지)', '정신 집중이 끊김');
};

/* ---------------- 매 프레임 / 정리 ---------------- */
CharacterController.prototype._shenUpdate = function(dt) {
  if (this.championId !== 'shen' || !this._shen) return;
  this._shenTickBlade(dt);
  this._shenTickZone();
  const s = this._shen;
  if (s.qAttacks > 0 && performance.now() > (s.qUntil || 0)) this._shenEndQ();
  this._shenTickR(dt);
};
CharacterController.prototype._shenOnDeath = function() {
  if (!this._shen) return;
  this._shenEndQ();
  this._shenEndR(false);
  this._shen.recall = null;
  this._shen.zone = null;
};
CharacterController.prototype._shenReset = function() {
  const fx = this._shenFx;
  if (fx && fx.blade) {
    if (fx.blade.parent) fx.blade.parent.remove(fx.blade);
    fx.blade.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  this._shenFx = {};
  this._shenRTarget = null;
  this._shen = { blade: null, recall: null, zone: null, r: null, kiReadyAt: 0, qAttacks: 0, qEmpowered: false, qUntil: 0, qLvl: 1, qEnergyGiven: false, bob: 0 };
  if (typeof this.clearAttackOverride === 'function') this.clearAttackOverride('shenQ');
};
