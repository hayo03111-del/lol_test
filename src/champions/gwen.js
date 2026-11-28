/* ============================================================
   그웬(Gwen) 전투 로직 - 107차
   ------------------------------------------------------------
   쉔·럭스와 같은 패턴 - CharacterController.prototype 확장. 수치는 전부 champion_data.js의 gwen 항목
   (리그 오브 레전드 위키 Gwen 문서). 상태는 둘로 나눈다:
     this._gwen   - 평범한 값만(온라인 대전에서 참가자에게 그대로 보낸다 - NET_CHAMP_STATE_KEY). 시각 필드는 …At/…Until.
     this._gwenFx - 씬 메시·투사체·Set(보내지 않는다 - 안개 메시는 netMirror로 복제)

   원작 규칙(위키) 그대로:
   - 패시브(가위 난도질): 기본 공격 적중·Q 가운데·R 바늘이 대상 최대 체력 1%(+주문력 100당 0.6%) 추가 마법 피해.
     챔피언에게 준 그 피해의 67%만큼 회복(한 번에 12~40 + 주문력 7%까지). 체력 40% 미만 미니언에게 8~30 추가. 구조물 제외.
   - Q(싹둑싹둑!): 평타 적중마다 가위질 중첩(최대 4, 6초). 0.5초 동안 최소 2번(첫 0.13초·마지막 0.5초) + 중첩마다 1번 더 자른다.
     범위는 사다리꼴(뒤 50 ~ 앞 465, 폭 75 → 360) ∩ 원(뒤 50 중심, 515) 또는 그웬 몸. 가운데(폭 25)는 피해의 50%가 고정 피해 +
     패시브. 미니언에게 80%, 체력 20% 미만 미니언은 첫 타에 처치.
   - W(신성한 안개): 4초 동안 반경 480 안개. 안의 그웬은 유체화·방어력·마법 저항력 22~30(+주문력 7%) 증가, 안개 밖의 적
     (포탑 제외)에게 대상으로 지정되지 않는다(피해도 받지 않는다). 0.5초 뒤 한 번 다시 써서 안개를 부를 수 있고, 처음으로
     안개를 떠나려 하면 저절로 다시 쓴다(안개는 그웬 너머 75로 속도 2000). 그다음 안개를 떠나면 효과가 끝난다(Data Dragon 설명).
     재사용 대기시간은 효과가 끝난 뒤 돈다.
   - E(돌격가위): 350 지점으로 돌진(평타 초기화), 4초 동안 평타 공속 30~80%·사거리 +75·적중 시 15(+주문력 20%) 마법 피해.
     첫 적중이 재사용 대기시간 25~65%를 돌려준다. 다른 스킬 도중에도 쓰며 그 스킬을 끊지 않는다(Q 가위질은 그대로).
   - R(바느질): 1·3·5개 바늘(8초 안에 2번 재시전, 사이 1초). 바늘은 뒤 100에서 1350 날아가며 지나간 적 모두에게 피해 + 패시브,
     첫 바늘은 1.5초 둔화 40~60%, 같은 시전의 다음 바늘은 15~25%. 폭은 날아가며 240 → 30. 시전 중에도 움직일 수 있다.
   원작과 다른 점(명시): E 돌진 속도(800)는 위키에 없어 CommunityDragon 게임 데이터 값. 안개가 멀리 떨어지면 순간 이동하는
   거리(1000)도 추정. 안개 밖에서 이미 날아오던 미니언 투사체도 막는다(원작은 미니언 투사체는 맞는다).
   ============================================================ */

CharacterController.prototype._gwenIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};
CharacterController.prototype._gwenLevelLerp = function(at1, at18) {
  const lvl = Math.max(1, Math.min(18, this.champLevel || 1));
  return at1 + (at18 - at1) * (lvl - 1) / 17;
};
CharacterController.prototype._gwenAimDir = function(mouseWorldPoint) {
  const dir = mouseWorldPoint
    ? new THREE.Vector3(mouseWorldPoint.x - this.root.position.x, 0, mouseWorldPoint.z - this.root.position.z)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion).setY(0);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1).applyQuaternion(this.root.quaternion).setY(0);
  return dir.normalize();
};
CharacterController.prototype._gwenHealSelf = function(amount) {
  if (!(amount > 0) || !(this.hp > 0)) return;
  this.hp = Math.min(this.maxHp, this.hp + amount * (typeof getHealReceivedMultiplier === 'function' ? getHealReceivedMultiplier(this) : 1));
  updateBars(this);
};
CharacterController.prototype._gwenSpellTarget = function(u) {
  return !!u && u.hp > 0 && !u.isStructure && !u.isWard && !u.isUntargetable && !(typeof canRealmInteract === 'function' && !canRealmInteract(this, u));
};

/* ---------------- 패시브 - 가위 난도질 ---------------- */
// fromAttack: 기본 공격 적중(평타 추가 피해로 분류) / 아니면 스킬(Q 가운데·R 바늘)
CharacterController.prototype._gwenPassiveProc = function(target, fromAttack) {
  if (!target || !(target.hp > 0) || target.isStructure || target.isWard) return 0;
  const p = this._champData().passive, ap = this.stats.abilityPower || 0;
  let raw = (target.maxHp || 0) * (p.maxHpPercent + p.maxHpPercentPer100Ap * ap / 100) / 100;
  if (target.isMinion && target.hp < (target.maxHp || 0) * p.minionLowHpThreshold) raw += this._gwenLevelLerp(p.minionBonusAt1, p.minionBonusAt18);
  const dealt = applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1,
    isBasicAttack: !!fromAttack, isOnHitBonus: !!fromAttack, isAbility: !fromAttack, source: this }) || 0;
  if (target.isChampion && dealt > 0) {
    const cap = this._gwenLevelLerp(p.healCapAt1, p.healCapAt18) + p.healCapApRatio * ap;
    this._gwenHealSelf(Math.min(cap, dealt * p.healPercentVsChampions / 100));
  }
  return dealt;
};
// controller_combat.js _onBasicAttackHit()에서: 가위질 중첩 + 패시브 + E 강화 평타
CharacterController.prototype._gwenOnBasicAttackHit = function(target) {
  const s = this._gwen;
  if (!s || !target || target.isWard) return;
  const now = performance.now(), d = this._champData();
  if (!target.isStructure) {
    s.snips = Math.min(d.Q.maxStacks, ((s.snipsUntil || 0) > now ? s.snips : 0) + 1);
    s.snipsUntil = now + d.Q.stackDurationSec * 1000;
    this._gwenPassiveProc(target, true);
  }
  if ((s.eUntil || 0) > now && target.hp > 0 && !target.isStructure) {
    applyDamage(target, { rawDamage: d.E.onHitDamage + d.E.onHitApRatio * (this.stats.abilityPower || 0), damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isBasicAttack: true, isOnHitBonus: true, isAbility: false, source: this });
  }
  if ((s.eUntil || 0) > now && s.eRefundPending) { // 지속 시간 안의 첫 적중이 E 재사용 대기시간을 돌려준다
    s.eRefundPending = false;
    const total = (this._gwenFx && this._gwenFx.eCdTotal) || 0;
    if (this.cooldowns.E > 0 && total > 0) this.cooldowns.E = Math.max(0, this.cooldowns.E - total * skillVal(d.E.cdRefundPercentByLevel, s.eLvl || 1) / 100);
  }
};

/* ---------------- Q - 싹둑싹둑! ---------------- */
// 판정: 사다리꼴(뒤 backOffset ~ 앞 length-backOffset, 폭 nearWidth → farWidth) ∩ 원(뒤 backOffset 중심, circleRadius), 또는 그웬 몸.
// 가운데(폭 centerWidth 직사각형)에 닿으면 center. 대상의 판정 반경만큼 여유(가장자리 판정).
CharacterController.prototype._gwenQHits = function(origin, dir) {
  const q = this._champData().Q, out = [];
  const back = q.backOffset, front = q.length - q.backOffset;
  const cx = origin.x - dir.x * lolRangeToWorld(back), cz = origin.z - dir.z * lolRangeToWorld(back);
  const myR = getCollisionRadius(this);
  for (const u of getAllEnemyUnits()) {
    if (!this._gwenSpellTarget(u)) continue;
    const p = getWorldPosition(u); if (!p) continue;
    const r = getCollisionRadius(u), rL = worldDistanceToLol(r);
    const dx = p.x - origin.x, dz = p.z - origin.z;
    const along = worldDistanceToLol(dx * dir.x + dz * dir.z);
    const lateral = worldDistanceToLol(Math.abs(-dx * dir.z + dz * dir.x));
    const inLength = along >= -back - rL && along <= front + rL;
    const t = Math.max(0, Math.min(1, (along + back) / q.length));
    const inTrap = inLength && lateral <= (q.nearWidth + (q.farWidth - q.nearWidth) * t) / 2 + rL;
    const inCircle = Math.hypot(p.x - cx, p.z - cz) <= lolRangeToWorld(q.circleRadius) + r;
    const inBody = Math.hypot(dx, dz) <= myR + r;
    if (!((inTrap && inCircle) || inBody)) continue;
    out.push({ unit: u, center: inLength && lateral <= q.centerWidth / 2 + rL });
  }
  return out;
};
CharacterController.prototype._gwenCastQ = function(mouseWorldPoint, free = false) {
  if (!this._gwenIsAlive() || isSilenced(this) || isCrowdControlled(this) || this._gwen.q) return;
  const q = this._champData().Q;
  const dir = this._gwenAimDir(mouseWorldPoint);
  if (!this._payCost('Q', free)) return;
  const s = this._gwen, now = performance.now();
  const stacks = (s.snipsUntil || 0) > now ? (s.snips || 0) : 0;
  s.snips = 0; s.snipsUntil = 0;
  const cast = { serial: (this._gwenFx.qSerial = (this._gwenFx.qSerial || 0) + 1), dirX: dir.x, dirZ: dir.z, lvl: Math.max(1, this.skillLevels.Q || 1), stacks };
  s.q = cast;
  this._gwenFx.qMinionHit = new Set(); // 미니언 처치 판정은 "첫 피해"에서만
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.targetPos = null; this.isChasing = false;
  this.currentActionKey = 'gwenQ'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);
  this.playFirstAvailable(['Spell1_0'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  // 가위질 시각: 첫 0.13초, 중첩 수만큼 0.45·0.4·0.35·0.23초, 마지막(강한 가위질)은 시전 끝.
  const times = [q.firstSnipSec, ...q.bonusSnipTimesSec.slice(0, stacks)].sort((a, b) => a - b);
  for (const t of times) this._champTimeout(() => this._gwenQSnip(cast, false), t * 1000);
  const fin = this._champTimeout(() => {
    this._gwenQSnip(cast, true);
    if (this._gwen && this._gwen.q === cast) this._gwen.q = null;
    if (this.currentActionKey !== 'gwenQ') return;
    this.currentPhase = 'RECOVERY'; this.phaseCancelable = true;
    if (this._dashState) { this.currentActionKey = 'gwenE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false; return; } // Q 도중 쓴 E 돌진이 아직 진행 중
    if (this.pendingMove || this.pendingCast || this.attackOrderActive) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, q.castTimeSec * 1000);
  this._actionTimers.push(fin);
  const clip = this.findAnimation('Spell1_0');
  const done = this._champTimeout(() => {
    if (this.currentActionKey === 'gwenQ') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, Math.max(q.castTimeSec + 0.05, Math.min(1.0, clip ? clip.duration : 0.8)) * 1000);
  this._actionTimers.push(done);
  debugSkillHit('Gwen Q(싹둑싹둑!)', this, { stacks, snips: times.length + 1 });
};
CharacterController.prototype._gwenQSnip = function(cast, final) {
  if (this.championId !== 'gwen' || !this._gwenIsAlive() || !this._gwen || this._gwen.q !== cast || this.currentActionKey !== 'gwenQ') return; // 기절 등으로 끊기면 남은 가위질은 없다
  const q = this._champData().Q, ap = this.stats.abilityPower || 0;
  const raw = final ? skillVal(q.finalDamageByLevel, cast.lvl) + q.finalApRatio * ap : skillVal(q.snipDamageByLevel, cast.lvl) + q.snipApRatio * ap;
  const dir = new THREE.Vector3(cast.dirX, 0, cast.dirZ);
  const minionHit = this._gwenFx.qMinionHit || (this._gwenFx.qMinionHit = new Set());
  for (const { unit: u, center } of this._gwenQHits(this.root.position, dir)) {
    if (u.isMinion && !minionHit.has(u)) {
      minionHit.add(u);
      if (u.hp < (u.maxHp || 0) * q.minionExecuteThreshold) { // 체력 20% 미만 미니언은 첫 피해에 처치(위키)
        applyDamage(u, { rawDamage: (u.maxHp || 1000) * 10, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, isAbility: true, isAoE: true, source: this });
        continue;
      }
    }
    const dmg = raw * (u.isMinion ? q.minionDamageMultiplier : 1);
    const trueShare = center ? dmg * q.trueDamageConversion : 0;
    applyDamage(u, { rawDamage: dmg - trueShare, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isAbility: true, isAoE: true, source: this });
    if (center && u.hp > 0) {
      applyDamage(u, { rawDamage: trueShare, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, isAbility: true, isAoE: true, source: this });
      this._gwenPassiveProc(u, false);
    }
  }
  if (typeof vfx !== 'undefined') {
    const at = this.root.position.clone().addScaledVector(dir, lolRangeToWorld(final ? 300 : 220)).add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    vfx.spawn('hit', at, undefined, { color: final ? 0xd9f4ff : 0x9fdcff });
  }
};

/* ---------------- W - 신성한 안개 ---------------- */
function gwenMistActive(gwen) {
  const z = gwen && gwen._gwen && gwen._gwen.mist;
  return !!z && gwen.hp > 0 && performance.now() < (z.activeUntil || 0);
}
// 그웬이 자기 안개 안에 있는가(안개가 그웬에게 날아가는 중이면 안에 있는 것으로 친다)
function gwenInsideMist(gwen) {
  if (!gwenMistActive(gwen)) return false;
  const z = gwen._gwen.mist, p = getWorldPosition(gwen);
  return !!z.moveTo || Math.hypot(p.x - z.x, p.z - z.z) <= lolRangeToWorld(CHAMPION_DATA.gwen.W.radius);
}
// observer(적)가 안개 밖에 있어서 그웬을 대상으로 지정할 수 없는가 - 포탑·구조물은 예외(위키)
function gwenMistHides(target, observer) {
  if (!target || target.championId !== 'gwen' || !observer || observer === target) return false;
  if (observer.isTurret || observer.isStructure) return false;
  if (observer.team && target.team && observer.team === target.team) return false;
  if (!gwenInsideMist(target)) return false;
  const op = getWorldPosition(observer); if (!op) return false;
  const z = target._gwen.mist;
  return Math.hypot(op.x - z.x, op.z - z.z) > lolRangeToWorld(CHAMPION_DATA.gwen.W.radius);
}
// 공용 피해 진입점(applyDamage)에서: 안개 안의 그웬은 안개 밖 적의 피해를 받지 않는다(이미 걸린 지속 피해는 들어간다)
function gwenMistBlocksDamage(target, result) {
  if (!target || target.championId !== 'gwen' || !result || result.isStatusTick) return false;
  const src = typeof resolveDamageSource === 'function' ? resolveDamageSource(result.source, target) : result.source;
  return !!src && gwenMistHides(target, src);
}
CharacterController.prototype._gwenMistResist = function() {
  const s = this._gwen;
  if (!s || !s.wInside) return 0;
  const w = this._champData().W;
  return skillVal(w.bonusResistByLevel, Math.max(1, (s.mist && s.mist.lvl) || this.skillLevels.W || 1)) + w.bonusResistApRatio * (this.stats.abilityPower || 0);
};
CharacterController.prototype._gwenCastW = function(mouseWorldPoint, free = false) {
  if (!this._gwenIsAlive()) return;
  const s = this._gwen, w = this._champData().W, now = performance.now();
  if (s.mist && gwenMistActive(this)) { // 재사용: 안개를 부른다(한 번, 0.5초 뒤부터)
    if (s.mist.recastUsed) { showSkillToast('W - 안개는 이미 한 번 불렀습니다'); return; }
    if (now < (s.mist.recastAt || 0)) return;
    this._gwenRecastW(this.root.position);
    return;
  }
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('W', free)) return;
  const lvl = Math.max(1, this.skillLevels.W || 1);
  this.cooldowns.W = 0; // 재사용 대기시간은 효과가 끝난 뒤(위키 cdstart post-effect)
  const p = this.root.position;
  s.mist = { x: p.x, z: p.z, lvl, activeUntil: now + w.durationSec * 1000, recastAt: now + w.recastDelaySec * 1000, recastUsed: false, moveTo: null, cdSec: free ? 0 : skillVal(w.cooldown, lvl) };
  if (!this.currentActionKey && !this._dashState) this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: false });
  this._gwenTickMist(0);
  debugSkillHit('Gwen W(신성한 안개)', this, { radius: w.radius });
};
// 안개를 point 너머 75로 부른다(원작 - 옛 중심에서 point를 지나는 직선 위)
CharacterController.prototype._gwenRecastW = function(point) {
  const z = this._gwen && this._gwen.mist;
  if (!z || z.recastUsed) return false;
  const w = this._champData().W;
  const dx = point.x - z.x, dz = point.z - z.z, d = Math.hypot(dx, dz), over = lolRangeToWorld(w.recastOvershoot);
  z.moveTo = d > 1e-6 ? { x: point.x + dx / d * over, z: point.z + dz / d * over } : { x: point.x, z: point.z };
  z.recastUsed = true;
  return true;
};
CharacterController.prototype._gwenEndMist = function() {
  const s = this._gwen; if (!s || !s.mist) return;
  const z = s.mist; s.mist = null;
  if (z.cdSec > 0) this.cooldowns.W = abilityHasteCooldown(this, z.cdSec, 'W');
  clearStatus(this, 'gwenW_ghost');
  if (s.wInside) { s.wInside = false; if (typeof this.recomputeStats === 'function') this.recomputeStats(); }
};
CharacterController.prototype._gwenEnsureMistMesh = function() {
  const fx = this._gwenFx;
  if (fx.mist || typeof scene === 'undefined') return fx.mist || null;
  const r = lolRangeToWorld(CHAMPION_DATA.gwen.W.radius);
  const g = new THREE.Group(); g.name = 'gwenHallowedMist';
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; g.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.96, r, 64), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; g.add(ring);
  scene.add(g);
  fx.mist = g;
  return g;
};
CharacterController.prototype._gwenTickMist = function(dt) {
  const s = this._gwen, w = this._champData().W, now = performance.now();
  const z = s.mist;
  if (z && (!this._gwenIsAlive() || now >= z.activeUntil)) { this._gwenEndMist(); return this._gwenTickMist(dt); }
  if (!z) {
    if (s.wInside) { s.wInside = false; if (typeof this.recomputeStats === 'function') this.recomputeStats(); }
    if (this._gwenFx.mist) this._gwenFx.mist.visible = false;
    return;
  }
  if (z.moveTo) { // 안개가 그웬 쪽으로(속도 2000, 너무 멀면 순간 이동)
    const dx = z.moveTo.x - z.x, dz = z.moveTo.z - z.z, d = Math.hypot(dx, dz), step = lolRangeToWorld(w.mistSpeed) * dt;
    if (d <= step || d > lolRangeToWorld(w.teleportBeyond)) { z.x = z.moveTo.x; z.z = z.moveTo.z; z.moveTo = null; }
    else { z.x += dx / d * step; z.z += dz / d * step; }
  }
  const me = this.root.position;
  const inside = Math.hypot(me.x - z.x, me.z - z.z) <= lolRangeToWorld(w.radius);
  if (!inside && !z.moveTo) {
    if (!z.recastUsed) this._gwenRecastW(me); // 처음으로 안개를 떠나려 하면 저절로 다시 쓴다
    else { this._gwenEndMist(); return this._gwenTickMist(dt); } // 그다음에 떠나면 효과가 끝난다
  }
  const covered = gwenInsideMist(this);
  if (covered) applyStatus(this, { id: 'gwenW_ghost', type: 'GHOST', duration: 0.25, value: 1, source: this });
  if (covered !== !!s.wInside) { s.wInside = covered; if (typeof this.recomputeStats === 'function') this.recomputeStats(); }
  const mesh = this._gwenEnsureMistMesh();
  if (mesh) {
    mesh.position.set(z.x, me.y + 0.03, z.z);
    mesh.visible = true;
    if (typeof netMirror === 'function') netMirror(mesh);
  }
};

/* ---------------- E - 돌격가위 ---------------- */
CharacterController.prototype._gwenRangeBonusLol = function() {
  const s = this._gwen;
  return s && (s.eUntil || 0) > performance.now() ? this._champData().E.bonusRange : 0;
};
CharacterController.prototype._gwenCastE = function(mouseWorldPoint, free = false) {
  if (!this._gwenIsAlive() || isCrowdControlled(this) || isRooted(this) || this._dashState) return;
  const e = this._champData().E, s = this._gwen;
  const from = this.root.position.clone();
  const dir = this._gwenAimDir(mouseWorldPoint);
  const want = mouseWorldPoint ? Math.hypot(mouseWorldPoint.x - from.x, mouseWorldPoint.z - from.z) : lolRangeToWorld(e.range);
  if (!this._payCost('E', free)) return;
  const lvl = Math.max(1, this.skillLevels.E || 1);
  this._gwenFx.eCdTotal = this.cooldowns.E || 0;
  // 기본 공격 도중이면 그 공격은 끊는다(Q·R 같은 스킬은 끊지 않는다 - 위키)
  const inAttack = !!this.currentActionKey && (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit');
  if (inAttack) { this._clearActionTimers(); this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false; }
  const travel = Math.min(lolRangeToWorld(e.range), want); // 최소 거리 없음, 사거리 밖이면 최대
  let to = from.clone().addScaledVector(dir, travel);
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) to = howlingAbyssMap.clampPosition(to);
  to.y = from.y;
  // 안개 안에서 돌진해 밖으로 나가면 안개가 돌진 끝 지점으로 온다(위키)
  if (s.mist && gwenMistActive(this) && !s.mist.recastUsed && Math.hypot(to.x - s.mist.x, to.z - s.mist.z) > lolRangeToWorld(this._champData().W.radius)) this._gwenRecastW(to);
  this.faceDirectionInstant(dir);
  if (typeof this.resetAttackTimer === 'function') this.resetAttackTimer(); // 평타 초기화
  const duringQ = this.currentActionKey === 'gwenQ';
  if (!duringQ) {
    this._clearActionTimers();
    this.currentActionKey = 'gwenE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
    this.targetPos = null; this.isChasing = false;
    this.setState(STATE.E_CAST);
    this.playFirstAvailable(['Spell3_Dash'], { loop: THREE.LoopOnce, fade: 0.04, clampWhenFinished: true });
  }
  const dist = worldDistanceToLol(getHorizontalDistance(from, to));
  this._dashState = { from, to, duration: Math.max(0.05, dist / e.dashSpeed), elapsed: 0, faceDir: dir.clone(),
    onArrive: () => {
      if (this.championId !== 'gwen' || !this._gwen) return;
      const now = performance.now();
      this._gwen.eUntil = now + e.buffDurationSec * 1000; this._gwen.eLvl = lvl; this._gwen.eRefundPending = true;
      applyStatus(this, { id: 'gwenE_as', type: 'AS_BUFF', duration: e.buffDurationSec, value: skillVal(e.bonusAttackSpeedPercentByLevel, lvl) / 100, source: this });
      if (this.currentActionKey === 'gwenE') {
        this.currentActionKey = null; this.currentPhase = null; this.setState(STATE.IDLE);
        const moving = !!(this.pendingMove || this.targetPos);
        this.playFirstAvailable([moving ? 'Spell3_to_Run.anm' : 'Spell3_Into_IDLE'], { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
        this._resumeAfterAction();
      }
    } };
  debugSkillHit('Gwen E(돌격가위)', this, { dist: Math.round(dist) });
};

/* ---------------- R - 바느질 ---------------- */
CharacterController.prototype._gwenCastR = function(mouseWorldPoint, free = false) {
  if (!this._gwenIsAlive() || isSilenced(this) || isCrowdControlled(this)) return;
  const s = this._gwen, rd = this._champData().R, now = performance.now();
  const dir = this._gwenAimDir(mouseWorldPoint);
  if (s.r && now < (s.r.windowUntil || 0) && s.r.casts < 3) { // 재시전(비용 없음, 사이 고정 1초)
    if (now < (s.r.nextAt || 0)) return;
    s.r.casts += 1;
    s.r.windowUntil = now + rd.recastWindowSec * 1000;
    s.r.nextAt = now + rd.recastLockoutSec * 1000;
    const idx = s.r.casts - 1, lvl = s.r.lvl;
    if (s.r.casts >= 3) s.r = null;
    this._gwenFireR(idx, dir, lvl);
    return;
  }
  if (!this._payCost('R', free)) return;
  const lvl = Math.max(1, this.skillLevels.R || 1);
  s.r = { casts: 1, lvl, windowUntil: now + rd.recastWindowSec * 1000, nextAt: now + rd.recastLockoutSec * 1000 };
  this._gwenFireR(0, dir, lvl);
};
// idx번째 시전(0·1·2): 시전 0.25초 시점의 그웬 위치(뒤 100)에서 정해진 시각마다 바늘을 같은 직선으로 날린다.
CharacterController.prototype._gwenFireR = function(idx, dir, lvl) {
  const rd = this._champData().R;
  if (!this.currentActionKey && !this._dashState && !this.targetPos) this.playFirstAvailable([idx === 0 ? 'Spell4_0' : 'Spell4.anm'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: false });
  this.faceDirectionInstant(dir);
  const slowed = new Set(); // 이 시전에서 이미 첫 둔화를 받은 대상
  const delays = rd.needleDelaysSec[idx] || rd.needleDelaysSec[0];
  let origin = null;
  for (const delay of delays) {
    this._champTimeout(() => {
      if (this.championId !== 'gwen' || !this._gwenIsAlive()) return; // 시전 도중 죽으면 남은 바늘은 나가지 않는다(위키)
      if (!origin) origin = this.root.position.clone().addScaledVector(dir, -lolRangeToWorld(rd.backOffset)).add(new THREE.Vector3(0, BASE_UNIT * 0.7, 0));
      this._gwenSpawnNeedle(origin, dir, lvl, slowed);
    }, delay * 1000);
  }
  debugSkillHit(`Gwen R(바느질) ${idx + 1}번째`, this, { needles: delays.length });
};
CharacterController.prototype._gwenSpawnNeedle = function(origin, dir, lvl, slowed) {
  const rd = this._champData().R;
  const proj = projectiles.spawn({
    from: origin.clone(), speed: lolRangeToWorld(rd.missileSpeed), color: 0xcfeaff, realmId: this.realmId,
    line: { dir: dir.clone(), maxDist: lolRangeToWorld(rd.range), halfWidth: lolRangeToWorld(rd.width) * 0.5, pierce: true,
      filter: (u) => this._gwenSpellTarget(u) },
    onHit: (u) => {
      if (this.championId !== 'gwen' || !u || !(u.hp > 0)) return;
      const raw = skillVal(rd.damageByLevel, lvl) + rd.apRatio * (this.stats.abilityPower || 0);
      applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isAbility: true, isUltimate: true, source: this });
      if (u.hp > 0) this._gwenPassiveProc(u, false);
      if (u.hp > 0) {
        if (!slowed.has(u)) { slowed.add(u); applyStatus(u, { id: 'gwenR_slow', type: 'SLOW', duration: rd.slowDurationSec, value: skillVal(rd.slowPercentByLevel, lvl) / 100, source: this }); }
        else applyStatus(u, { id: 'gwenR_slow2', type: 'SLOW', duration: rd.slowDurationSec, value: skillVal(rd.subsequentSlowPercentByLevel, lvl) / 100, source: this });
      }
    },
  });
  this._gwenFx.needles.push(proj);
};
// 바늘 폭은 0.5초 날아갈 때마다 140씩 준다(240 → 30, 위키) - 매 프레임 투사체 판정 폭을 줄인다.
CharacterController.prototype._gwenTickNeedles = function() {
  const rd = this._champData().R, list = this._gwenFx.needles;
  const perLol = 140 / (rd.missileSpeed * 0.5);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (!p || p.done || !p.line) { list.splice(i, 1); continue; }
    const widthLol = Math.max(rd.widthEnd, rd.width - perLol * worldDistanceToLol(p.line.traveled || 0));
    p.line.halfWidth = lolRangeToWorld(widthLol) * 0.5;
  }
};

/* ---------------- 매 프레임 / 정리 ---------------- */
CharacterController.prototype._gwenUpdate = function(dt) {
  if (this.championId !== 'gwen' || !this._gwen) return;
  const s = this._gwen, now = performance.now();
  if (s.snips > 0 && (s.snipsUntil || 0) <= now) { s.snips = 0; s.snipsUntil = 0; }
  if (s.eUntil && s.eUntil <= now) { s.eUntil = 0; s.eRefundPending = false; }
  if (s.r && now >= (s.r.windowUntil || 0)) s.r = null;
  if (s.q && this.currentActionKey !== 'gwenQ') s.q = null; // 끊긴 Q가 다음 Q를 막지 않게
  this._gwenTickMist(dt);
  this._gwenTickNeedles();
};
CharacterController.prototype._gwenOnDeath = function() {
  if (!this._gwen) return;
  this._gwenEndMist();
  const s = this._gwen;
  s.q = null; s.r = null; s.snips = 0; s.snipsUntil = 0; s.eUntil = 0; s.eRefundPending = false;
  if (this._gwenFx.mist) this._gwenFx.mist.visible = false;
};
CharacterController.prototype._gwenReset = function() {
  const fx = this._gwenFx;
  if (fx && fx.mist) {
    if (fx.mist.parent) fx.mist.parent.remove(fx.mist);
    fx.mist.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  this._gwenFx = { mist: null, needles: [], qMinionHit: null, eCdTotal: 0, qSerial: 0 };
  this._gwen = { snips: 0, snipsUntil: 0, q: null, mist: null, wInside: false, eUntil: 0, eLvl: 1, eRefundPending: false, r: null };
};
