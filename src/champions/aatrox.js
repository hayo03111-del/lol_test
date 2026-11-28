/* ============================================================
   아트록스(Aatrox) 전투 로직 - 107차
   ------------------------------------------------------------
   쉔·그웬과 같은 패턴 - CharacterController.prototype 확장. 수치는 전부 champion_data.js의 aatrox 항목
   (리그 오브 레전드 위키 Aatrox 문서). 상태는 둘로 나눈다:
     this._aatrox   - 평범한 값만(온라인 대전에서 그대로 보낸다 - NET_CHAMP_STATE_KEY). 시각 필드는 …At/…Until.
     this._aatroxFx - 씬 메시·대상 참조(보내지 않는다)

   원작 규칙(위키) 그대로:
   - 패시브(사신 태세): 재사용 대기시간(22~10초, 고정)이 끝나면 다음 기본 공격이 사거리 +50, 대상 최대 체력 4~10% 추가 마법 피해
     (구조물 제외), 준 추가 피해만큼 회복(미니언 25%). 강화 평타 동작은 GLB의 Passive_Attack.
     적 챔피언에게 평타·스킬을 맞히면 남은 재사용 대기시간 2초 감소(Q 강타 지점 4초).
   - Q(다르킨의 검): 3번까지(사이 고정 1초, 4초 안에 다시 쓰지 않으면 끝). 0.6초 시전 뒤 판정 - 시전 방향은 고정, 위치는 시전
     끝의 아트록스. 1타 625×180 직사각형(먼 끝 강타), 2타 뒤 100 ~ 앞 475 사다리꼴(폭 300 → 500, 먼 끝 강타), 3타 앞 200 중심 원
     300(가운데 180 강타). 피해 10~70 + 총 공격력 60~90%, 2·3타 +25%·+50%, 강타 지점 ×1.75 + 0.25초 공중에 뜸.
     미니언에게 55~70%. 재사용 대기시간은 마지막 시전부터 돈다. 시전 중 E는 쓸 수 있고 다른 스킬은 막힌다.
   - W(지옥사슬): 0.25초 뒤 825 직선(폭 160, 속도 1800) 첫 적에게 물리 피해 30~70 + 총 공격력 40%(미니언 2배), 1.5초 둔화.
     챔피언이면 1.5초 사슬 - 끝까지 영역 안에 있으면 같은 피해를 한 번 더 주고 가운데로 끌어온다.
   - E(파멸의 돌진): 기본 지속 - 챔피언에게 준 피해(지속 피해 제외)의 16%(+추가 체력 100당 1.3%) 회복.
     사용 - 75~300 돌진(속도 800), 평타 초기화, Q·W·R 도중에도 쓰며 그 스킬을 끊지 않는다.
   - R(세계의 종결자): 10초 동안 공격력 +20~40%, 크기 +5%, 유체화, 받는 회복 +50~100%, 추가 이동 속도 60~100%(0.25초마다
     남은 값의 10%씩 감소). 주변 600 적 미니언 3초 공포(둔화가 99%까지 점점). 챔피언 처치 관여마다 5초 연장(최대 10초), 다시 해방.
   원작과 다른 점(명시): Q 1·2타 강타 지점 깊이(먼 끝 150)와 W 영역 반경(300)·끌어오는 시간(0.3초)은 위키·게임 데이터
   (CommunityDragon)에 없어 추정. 기본 Q·W 시전 동작(Spell1·Spell2)이 GLB에 없어 Q는 변신판 휘두르기(Q1~3_Ult)를 쓰고 W는 동작 없이 시전한다.
   ============================================================ */

CharacterController.prototype._aatroxIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};
CharacterController.prototype._aatroxLevelLerp = function(at1, at18) {
  const lvl = Math.max(1, Math.min(18, this.champLevel || 1));
  return at1 + (at18 - at1) * (lvl - 1) / 17;
};
CharacterController.prototype._aatroxAimDir = function(mouseWorldPoint) {
  const dir = mouseWorldPoint
    ? new THREE.Vector3(mouseWorldPoint.x - this.root.position.x, 0, mouseWorldPoint.z - this.root.position.z)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion).setY(0);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1).applyQuaternion(this.root.quaternion).setY(0);
  return dir.normalize();
};
CharacterController.prototype._aatroxHealSelf = function(amount) {
  if (!(amount > 0) || !(this.hp > 0)) return;
  this.hp = Math.min(this.maxHp, this.hp + amount * (typeof getHealReceivedMultiplier === 'function' ? getHealReceivedMultiplier(this) : 1));
  updateBars(this);
};
CharacterController.prototype._aatroxBonusHp = function() {
  const base = (typeof computeChampionStats === 'function' && computeChampionStats('aatrox', this.champLevel || 1)?.maxHp) || CHAMPION_DATA.aatrox.stats.hp;
  return Math.max(0, (this.maxHp || 0) - base);
};
CharacterController.prototype._aatroxSpellTarget = function(u) {
  return !!u && u.hp > 0 && !u.isStructure && !u.isWard && !u.isUntargetable && !(typeof canRealmInteract === 'function' && !canRealmInteract(this, u));
};

/* ---------------- 패시브 - 사신 태세 ---------------- */
CharacterController.prototype._aatroxPassiveReady = function() {
  return !!this._aatrox && performance.now() >= (this._aatrox.passiveReadyAt || 0);
};
CharacterController.prototype._aatroxRangeBonusLol = function() {
  return this._aatroxPassiveReady() ? this._champData().passive.bonusRange : 0;
};
// 적 챔피언을 맞히면 남은 재사용 대기시간을 줄인다(강타 지점이면 두 배)
CharacterController.prototype._aatroxPassiveReduce = function(sweetspot = false) {
  const s = this._aatrox, p = this._champData().passive, now = performance.now();
  if (!s || !(s.passiveReadyAt > now)) return;
  s.passiveReadyAt = Math.max(now, s.passiveReadyAt - (sweetspot ? p.cdReduceSweetspotSec : p.cdReduceOnHitSec) * 1000);
};
// 강화 평타 동작(Passive_Attack) - 준비되면 다음 평타 하나를 그 동작으로(우선순위가 R 변신 평타보다 높다)
CharacterController.prototype._aatroxSyncPassiveOverride = function() {
  const ready = this._aatroxPassiveReady() && this._aatroxIsAlive();
  const has = (this.attackOverrides || []).some((o) => o.id === 'aatroxP');
  if (ready && !has) {
    const db = this._championAbilityDbEntry(), clip = db && db.passiveAttackClip;
    if (clip && this.findAnimation && this.findAnimation(clip)) this.registerAttackOverride({ id: 'aatroxP', clips: [clip], priority: 20, oneShot: true, uses: 1 });
    else this._aatrox.passiveNoClip = true;
  } else if (!ready && has) this.clearAttackOverride('aatroxP');
};
// controller_combat.js _onBasicAttackHit()에서. overrideId === 'aatroxP'면 이번 평타가 강화 평타(스윙을 시작할 때 준비돼 있었다 - 위키:
// 평타 준비 동작 도중 준비된 패시브는 그 평타에 쓰이지 않는다).
CharacterController.prototype._aatroxOnBasicAttackHit = function(target, overrideId) {
  const s = this._aatrox;
  if (!s || !target || target.isWard) return;
  if (target.isChampion) this._aatroxPassiveReduce(false);
  const empowered = overrideId === 'aatroxP' || (s.passiveNoClip && this._aatroxPassiveReady());
  if (!empowered) return;
  if (target.isStructure) { this.clearAttackOverride('aatroxP'); return; } // 구조물에는 터지지 않는다 - 다음 평타에 다시 준비
  const p = this._champData().passive;
  if (target.hp > 0) {
    const raw = (target.maxHp || 0) * this._aatroxLevelLerp(p.maxHpPercentAt1, p.maxHpPercentAt18) / 100;
    const dealt = applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isBasicAttack: true, isOnHitBonus: true, isAbility: false, source: this }) || 0;
    this._aatroxHealSelf(dealt * (target.isMinion ? p.minionHealRatio : 1));
    if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(target).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.8, 0)), undefined, { color: 0xff3a2a });
  }
  s.passiveReadyAt = performance.now() + this._aatroxLevelLerp(p.cooldownAt1, p.cooldownAt18) * 1000; // 고정 재사용 대기시간(스킬 가속 무관)
  this.clearAttackOverride('aatroxP');
};
// 공용 피해 진입점(applyDamage)에서: E 기본 지속 - 챔피언에게 준 피해(지속 피해 제외)의 16%(+추가 체력 100당 1.3%) 회복
function aatroxOnDamageDealt(source, target, dealt, result) {
  if (!source || source.championId !== 'aatrox' || !source._aatrox || !target || !target.isChampion || target === source) return;
  if (!(dealt > 0) || (result && result.isStatusTick) || !(source.hp > 0)) return;
  if (!((source.skillLevels && source.skillLevels.E) >= 1)) return;
  const e = CHAMPION_DATA.aatrox.E;
  source._aatroxHealSelf(dealt * (e.healPercent + e.healPercentPer100BonusHp * source._aatroxBonusHp() / 100) / 100);
}
// 받는 회복 배율(getHealReceivedMultiplier)에 곱한다 - R 중 회복 +50~100%
function aatroxHealAmp(unit) {
  const s = unit && unit.championId === 'aatrox' && unit._aatrox;
  if (!s || !((s.rUntil || 0) > performance.now())) return 0;
  return skillVal(CHAMPION_DATA.aatrox.R.healAmpPercentByLevel, s.rLvl || 1) / 100;
}

/* ---------------- Q - 다르킨의 검 ---------------- */
// stage(1~3)의 판정. 반환: [{ unit, sweet }]. 1·2타는 대상 판정 반경까지(가장자리), 3타와 강타 지점은 대상 중심(위키).
CharacterController.prototype._aatroxQHits = function(stage, origin, dir) {
  const q = this._champData().Q, out = [];
  for (const u of getAllEnemyUnits()) {
    if (!this._aatroxSpellTarget(u)) continue;
    const p = getWorldPosition(u); if (!p) continue;
    const rL = worldDistanceToLol(getCollisionRadius(u));
    const dx = p.x - origin.x, dz = p.z - origin.z;
    const along = worldDistanceToLol(dx * dir.x + dz * dir.z), lateral = worldDistanceToLol(Math.abs(-dx * dir.z + dz * dir.x));
    if (stage === 1) {
      const a = q.q1;
      if (along < -rL || along > a.length + rL || lateral > a.width / 2 + rL) continue;
      out.push({ unit: u, sweet: along >= a.sweetFrom && along <= a.sweetTo && lateral <= a.sweetWidth / 2 }); // 강타 지점은 대상 중심(위키)
    } else if (stage === 2) {
      const a = q.q2, total = a.back + a.front;
      const halfAt = (al) => (a.backWidth + (a.frontWidth - a.backWidth) * Math.max(0, Math.min(1, (al + a.back) / total))) / 2;
      if (along < -a.back - rL || along > a.front + rL || lateral > halfAt(along) + rL) continue;
      const sf = Math.max(0, Math.min(1, (along - a.sweetFrom) / (a.sweetTo - a.sweetFrom)));
      out.push({ unit: u, sweet: along >= a.sweetFrom && along <= a.sweetTo && lateral <= (a.sweetWidthFrom + (a.sweetWidthTo - a.sweetWidthFrom) * sf) / 2 });
    } else {
      const a = q.q3;
      const cx = origin.x + dir.x * lolRangeToWorld(a.offset), cz = origin.z + dir.z * lolRangeToWorld(a.offset);
      const d = worldDistanceToLol(Math.hypot(p.x - cx, p.z - cz));
      if (d > a.radius) continue;
      out.push({ unit: u, sweet: d <= a.sweetRadius });
    }
  }
  return out;
};
CharacterController.prototype._aatroxQCooldownTotal = function(cdSec) {
  return cdSec > 0 ? abilityHasteCooldown(this, cdSec, 'Q') : 0;
};
CharacterController.prototype._aatroxCastQ = function(mouseWorldPoint, free = false) {
  if (!this._aatroxIsAlive() || isSilenced(this) || isCrowdControlled(this)) return;
  const s = this._aatrox, q = this._champData().Q, now = performance.now();
  if (s.qCast) return;
  let stage;
  if (s.q && now < (s.q.windowUntil || 0)) {
    if (now < (s.q.nextAt || 0)) return; // 재시전 사이 고정 1초
    stage = s.q.stage;
  } else {
    if (!this._payCost('Q', free)) return;
    this.cooldowns.Q = 0; // 재사용 대기시간은 마지막 시전부터(아래)
    s.q = { stage: 1, lvl: Math.max(1, this.skillLevels.Q || 1), windowUntil: 0, nextAt: 0, lastCastAt: 0, cdSec: free ? 0 : skillVal(q.cooldown, Math.max(1, this.skillLevels.Q || 1)) };
    stage = 1;
  }
  const dir = this._aatroxAimDir(mouseWorldPoint);
  const lvl = s.q.lvl;
  s.q.lastCastAt = now; s.q.nextAt = now + q.recastLockoutSec * 1000; s.q.windowUntil = now + q.recastWindowSec * 1000;
  s.q.stage = stage + 1;
  if (stage >= 3) { // 마지막 시전 - 재사용 대기시간 시작
    this.cooldowns.Q = this._aatroxQCooldownTotal(s.q.cdSec);
    s.q = null;
  }
  const cast = { stage, dirX: dir.x, dirZ: dir.z, lvl };
  s.qCast = cast;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.targetPos = null; this.isChasing = false;
  this.currentActionKey = 'aatroxQ'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);
  const db = this._championAbilityDbEntry();
  const clipName = db && db.Q && db.Q.castClips ? db.Q.castClips[stage - 1] : null;
  const clip = clipName ? this.findAnimation(clipName) : null;
  if (clip) {
    this.playFirstAvailable([clipName], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
    const impact = db.Q.impactSec && db.Q.impactSec[stage - 1]; // 검이 땅에 닿는 클립 시각 → 판정 시각(0.6초)에 맞춘다
    if (this.currentAction && impact) this.currentAction.timeScale = impact / q.castTimeSec;
  }
  const fire = this._champTimeout(() => {
    if (!this._aatrox || this._aatrox.qCast !== cast) return;
    this._aatrox.qCast = null;
    if (this.currentActionKey !== 'aatroxQ' || !this._aatroxIsAlive()) return;
    this._aatroxResolveQ(cast);
    this.currentPhase = 'RECOVERY'; this.phaseCancelable = true;
    if (this._dashState) return; // 시전 중 쓴 E 돌진이 끝나며 마무리
    if (this.pendingMove || this.pendingCast || this.attackOrderActive) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, q.castTimeSec * 1000);
  this._actionTimers.push(fire);
  const done = this._champTimeout(() => {
    if (this.currentActionKey === 'aatroxQ' && !this._dashState) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, (q.castTimeSec + 0.35) * 1000);
  this._actionTimers.push(done);
  debugSkillHit(`Aatrox Q(다르킨의 검) ${stage}타`, this, {});
};
CharacterController.prototype._aatroxResolveQ = function(cast) {
  const q = this._champData().Q;
  const dir = new THREE.Vector3(cast.dirX, 0, cast.dirZ);
  const ad = this.stats.attackDamage || 0;
  const base = (skillVal(q.damageByLevel, cast.lvl) + skillVal(q.adRatioByLevel, cast.lvl) * ad) * (1 + q.castDamageStep * (cast.stage - 1));
  const minionPct = valueByBreakpoints(q.minionDamagePercent, this.champLevel || 1) / 100;
  let champHit = false, champSweet = false;
  for (const { unit: u, sweet } of this._aatroxQHits(cast.stage, this.root.position, dir)) {
    const raw = base * (sweet ? q.sweetspotMultiplier : 1) * (u.isMinion ? minionPct : 1);
    applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true, isAoE: true, source: this });
    if (sweet && u.hp > 0) applyStatus(u, { id: 'aatroxQ_knockup', type: 'KNOCKUP', duration: q.knockupSec, value: 1, source: this });
    if (u.isChampion) { champHit = true; if (sweet) champSweet = true; }
  }
  if (champHit) this._aatroxPassiveReduce(champSweet);
  if (typeof vfx !== 'undefined') {
    const reach = cast.stage === 1 ? q.q1.length - 80 : cast.stage === 2 ? q.q2.front - 80 : q.q3.offset;
    vfx.spawn('hit', this.root.position.clone().addScaledVector(dir, lolRangeToWorld(reach)).add(new THREE.Vector3(0, BASE_UNIT * 0.3, 0)), undefined, { color: 0xff4a30 });
  }
};

/* ---------------- W - 지옥사슬 ---------------- */
CharacterController.prototype._aatroxCastW = function(mouseWorldPoint, free = false) {
  if (!this._aatroxIsAlive() || isSilenced(this) || isCrowdControlled(this)) return;
  const w = this._champData().W;
  const dir = this._aatroxAimDir(mouseWorldPoint);
  if (!this._payCost('W', free)) return;
  const lvl = Math.max(1, this.skillLevels.W || 1);
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.targetPos = null; this.isChasing = false;
  this.currentActionKey = 'aatroxW'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.W_CAST);
  this.playFirstAvailable(['Spike_Test'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true }); // 108차: 검을 땅에 꽂는 자세(원작 W)
  const fire = this._champTimeout(() => {
    if (this.currentActionKey !== 'aatroxW' || !this._aatroxIsAlive()) return;
    this.currentPhase = 'RECOVERY'; this.phaseCancelable = true;
    const from = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    projectiles.spawn({
      from, speed: lolRangeToWorld(w.missileSpeed), color: 0xc0392b, realmId: this.realmId,
      line: { dir, maxDist: lolRangeToWorld(w.range), halfWidth: lolRangeToWorld(w.width) * 0.5, filter: (u) => this._aatroxSpellTarget(u),
        onMiss: () => debugSkillMiss('Aatrox W(지옥사슬)', '맞은 대상 없음') },
      onHit: (u) => { if (this.championId === 'aatrox') this._aatroxChainHit(u, lvl); },
    });
    if (!this._dashState) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, w.castTimeSec * 1000);
  this._actionTimers.push(fire);
};
CharacterController.prototype._aatroxWDamage = function(u, lvl) {
  const w = this._champData().W;
  const raw = (skillVal(w.damageByLevel, lvl) + w.adRatio * (this.stats.attackDamage || 0)) * (u.isMinion ? w.minionMultiplier : 1);
  applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true, source: this });
};
CharacterController.prototype._aatroxChainHit = function(u, lvl) {
  if (!u || !(u.hp > 0)) return;
  const w = this._champData().W;
  this._aatroxWDamage(u, lvl);
  if (!(u.hp > 0)) return;
  applyStatus(u, { id: 'aatroxW_slow', type: 'SLOW', duration: w.slowDurationSec, value: skillVal(w.slowPercentByLevel, lvl) / 100, source: this });
  if (!u.isChampion) return;
  this._aatroxPassiveReduce(false);
  const p = getWorldPosition(u);
  this._aatrox.w = { x: p.x, z: p.z, lvl, untilAt: performance.now() + w.tetherSec * 1000 };
  this._aatroxFx.wTarget = u;
  if (typeof visionSystem !== 'undefined' && visionSystem && typeof visionSystem.grantVision === 'function') visionSystem.grantVision(p.clone(), 300, w.tetherSec); // 사슬 동안 드러난다
  debugSkillHit('Aatrox W(지옥사슬) 사슬', u, {});
};
CharacterController.prototype._aatroxTickChain = function() {
  const s = this._aatrox, fx = this._aatroxFx, w = this._champData().W;
  const t = fx.wTarget;
  if (!s.w || !t || !(t.hp > 0) || t.isDead || !this._aatroxIsAlive()) { s.w = null; fx.wTarget = null; this._aatroxSetChainMesh(null); return; }
  const p = getWorldPosition(t);
  this._aatroxSetChainMesh(p);
  if (performance.now() < s.w.untilAt) return;
  const anchor = new THREE.Vector3(s.w.x, p.y, s.w.z), lvl = s.w.lvl;
  s.w = null; fx.wTarget = null; this._aatroxSetChainMesh(null);
  if (getHorizontalDistance(p, anchor) > lolRangeToWorld(w.zoneRadius)) { debugSkillMiss('Aatrox W(지옥사슬)', '사슬을 끊고 빠져나감'); return; }
  this._aatroxWDamage(t, lvl);
  if (!(t.hp > 0) || !t.mesh) return;
  // 가운데로 끌어온다(위키: 원래 자리보다 아트록스 쪽으로 조금 - 50 추정)
  const toMe = new THREE.Vector3(this.root.position.x - anchor.x, 0, this.root.position.z - anchor.z);
  if (toMe.lengthSq() > 1e-6) anchor.addScaledVector(toMe.normalize(), Math.min(lolRangeToWorld(50), toMe.length()));
  t._pullState = { from: t.mesh.position.clone(), to: new THREE.Vector3(anchor.x, t.mesh.position.y, anchor.z), duration: w.pullSec, elapsed: 0 };
  debugSkillHit('Aatrox W(지옥사슬) 끌어오기', t, {});
};
CharacterController.prototype._aatroxSetChainMesh = function(targetPos) {
  const fx = this._aatroxFx;
  if (!targetPos) { if (fx.chain) fx.chain.visible = false; return; }
  if (typeof scene === 'undefined') return;
  if (!fx.chain) {
    const g = new THREE.Group(); g.name = 'aatroxInfernalChain';
    const r = lolRangeToWorld(CHAMPION_DATA.aatrox.W.zoneRadius);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.93, r, 48), new THREE.MeshBasicMaterial({ color: 0xb3241a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    const link = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x7a120c, transparent: true, opacity: 0.85, depthWrite: false }));
    link.name = 'link'; g.add(link);
    scene.add(g); fx.chain = g;
  }
  const s = this._aatrox.w; if (!s) return;
  const g = fx.chain, link = g.getObjectByName('link');
  g.position.set(s.x, targetPos.y + 0.03, s.z);
  const dx = targetPos.x - s.x, dz = targetPos.z - s.z, len = Math.max(1e-3, Math.hypot(dx, dz)), th = lolRangeToWorld(10);
  link.scale.set(th, th, len);
  link.position.set(dx / 2, BASE_UNIT * 0.3, dz / 2);
  link.rotation.set(0, Math.atan2(dx, dz), 0);
  g.visible = true;
  if (typeof netMirror === 'function') netMirror(g);
};

/* ---------------- E - 파멸의 돌진 ---------------- */
CharacterController.prototype._aatroxCastE = function(mouseWorldPoint, free = false) {
  if (!this._aatroxIsAlive() || isCrowdControlled(this) || isRooted(this) || this._dashState) return;
  const e = this._champData().E;
  const from = this.root.position.clone();
  const dir = this._aatroxAimDir(mouseWorldPoint);
  const want = mouseWorldPoint ? Math.hypot(mouseWorldPoint.x - from.x, mouseWorldPoint.z - from.z) : lolRangeToWorld(e.range);
  if (!this._payCost('E', free)) return;
  const inAttack = !!this.currentActionKey && (this.currentActionKey.startsWith('attack') || this.currentActionKey === 'crit');
  if (inAttack) { this._clearActionTimers(); this.currentActionKey = null; this.currentPhase = null; this.phaseCancelable = false; }
  const travel = Math.max(lolRangeToWorld(e.rangeMin), Math.min(lolRangeToWorld(e.range), want)); // 75~300, 밖이면 최대
  let to = from.clone().addScaledVector(dir, travel);
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) to = howlingAbyssMap.clampPosition(to);
  to.y = from.y;
  if (typeof this.resetAttackTimer === 'function') this.resetAttackTimer(); // 평타 초기화
  const keep = this.currentActionKey === 'aatroxQ' || this.currentActionKey === 'aatroxW'; // 시전 중인 스킬은 끊지 않는다
  if (!keep) {
    this._clearActionTimers();
    this.currentActionKey = 'aatroxE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
    this.targetPos = null; this.isChasing = false;
    this.setState(STATE.E_CAST);
  }
  if (!keep || this.currentActionKey === 'aatroxW') {
    const ult = (this._aatrox.rUntil || 0) > performance.now();
    this.playFirstAvailable(ult ? ['Spell3_ULT', 'Spell3'] : ['Spell3'], { loop: THREE.LoopOnce, fade: 0.04, clampWhenFinished: true });
  }
  if (!keep) this.faceDirectionInstant(dir);
  const dist = worldDistanceToLol(getHorizontalDistance(from, to));
  this._dashState = { from, to, duration: Math.max(0.05, dist / e.dashSpeed), elapsed: 0, faceDir: keep ? null : dir.clone(),
    onArrive: () => {
      if (this.currentActionKey === 'aatroxE' || ((this.currentActionKey === 'aatroxQ' || this.currentActionKey === 'aatroxW') && this.currentPhase === 'RECOVERY')) {
        this.currentActionKey = null; this.currentPhase = null; this.setState(STATE.IDLE); this._resumeAfterAction();
      }
    } };
  debugSkillHit('Aatrox E(파멸의 돌진)', this, { dist: Math.round(dist) });
};

/* ---------------- R - 세계의 종결자 ---------------- */
CharacterController.prototype._aatroxCastR = function(mouseWorldPoint, free = false) {
  if (!this._aatroxIsAlive() || isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('R', free)) return;
  const r = this._champData().R, lvl = Math.max(1, this.skillLevels.R || 1);
  if (!this.currentActionKey && !this._dashState && !this.targetPos) this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: false });
  this._champTimeout(() => { // 0.25초 시전(움직일 수 있다) - 끝난 자리에서 해방
    if (this.championId !== 'aatrox' || !this._aatroxIsAlive()) return;
    const s = this._aatrox, now = performance.now();
    s.rLvl = lvl; s.rUntil = now + r.durationSec * 1000;
    this._aatroxUnleash();
    this.setSubState('R', r.durationSec);
    const db = this._championAbilityDbEntry();
    const clips = ((db && db.R && db.R.ultAttackClips) || []).filter((c) => this.findAnimation(c));
    if (clips.length) this.registerAttackOverride({ id: 'aatroxR', clips: [clips[0]], sequenceClips: clips, priority: 5, oneShot: false, durationSec: r.durationSec });
    if (typeof setUnitSizeMod === 'function') setUnitSizeMod(this, 'aatroxR', 1 + r.sizeBonus);
    if (typeof this.recomputeStats === 'function') this.recomputeStats(); // 공격력 +%
    debugSkillHit('Aatrox R(세계의 종결자)', this, { lvl });
  }, r.castTimeSec * 1000);
};
// 해방: 추가 이동 속도 다시 최대로 + 주변 적 미니언 공포
CharacterController.prototype._aatroxUnleash = function() {
  const s = this._aatrox, r = this._champData().R, now = performance.now();
  s.rMsAt = now;
  const start = now, me = this;
  for (const u of getAllEnemyUnits()) {
    if (!u || !u.isMinion || !(u.hp > 0) || !isInCircle(u, this.root.position, lolRangeToWorld(r.fearRadius))) continue;
    applyStatus(u, { id: 'aatroxR_fear', type: 'FEAR', duration: r.fearSec, value: 1, source: me,
      fearSlowAt: () => Math.min(r.fearMaxSlow, r.fearMaxSlow * (performance.now() - start) / (r.fearSec * 1000)) });
  }
};
CharacterController.prototype._aatroxRAdPercent = function() {
  const s = this._aatrox;
  return s && (s.rUntil || 0) > performance.now() ? skillVal(this._champData().R.bonusAdPercentByLevel, s.rLvl || 1) : 0;
};
CharacterController.prototype._aatroxEndR = function() {
  const s = this._aatrox; if (!s) return;
  const was = (s.rUntil || 0) > 0;
  s.rUntil = 0; s.rMsAt = 0;
  this.clearSubState('R');
  this.clearAttackOverride('aatroxR');
  clearStatus(this, 'aatroxR_ms'); clearStatus(this, 'aatroxR_ghost');
  if (typeof setUnitSizeMod === 'function') setUnitSizeMod(this, 'aatroxR', 1);
  if (was && typeof this.recomputeStats === 'function') this.recomputeStats();
  if (was && !this.currentActionKey && this.state !== STATE.DEAD && typeof this._returnToLocomotion === 'function') this._returnToLocomotion();
};
CharacterController.prototype._aatroxTickR = function() {
  const s = this._aatrox, r = this._champData().R, now = performance.now();
  if (!s.rUntil) return;
  if (now >= s.rUntil || !this._aatroxIsAlive()) { this._aatroxEndR(); return; }
  // 추가 이동 속도: 0.25초마다 남은 값의 10%씩 줄어든다
  const ticks = Math.floor((now - (s.rMsAt || now)) / (r.msDecayTickSec * 1000));
  const ms = skillVal(r.bonusMsPercentByLevel, s.rLvl || 1) / 100 * Math.pow(1 - r.msDecayPerTick, ticks);
  applyStatus(this, { id: 'aatroxR_ms', type: 'MS_BUFF', duration: 0.3, value: ms, source: this });
  applyStatus(this, { id: 'aatroxR_ghost', type: 'GHOST', duration: 0.3, value: 1, source: this });
  this.setSubState('R', (s.rUntil - now) / 1000);
};
// 챔피언 처치 관여(reward_system.js rewardChampionKill에서): R 지속 시간 5초 연장(처음 길이까지) + 다시 해방
function aatroxOnTakedown(ctrl) {
  const s = ctrl && ctrl.championId === 'aatrox' && ctrl._aatrox;
  const now = performance.now();
  if (!s || !((s.rUntil || 0) > now)) return;
  const r = CHAMPION_DATA.aatrox.R;
  s.rUntil = Math.min(now + r.durationSec * 1000, s.rUntil + r.takedownExtendSec * 1000);
  const ov = (ctrl.attackOverrides || []).find((o) => o.id === 'aatroxR');
  if (ov) ov.expiresAt = s.rUntil;
  ctrl._asActor ? ctrl._asActor(() => ctrl._aatroxUnleash()) : ctrl._aatroxUnleash();
}

/* ---------------- 매 프레임 / 정리 ---------------- */
CharacterController.prototype._aatroxUpdate = function(dt) {
  if (this.championId !== 'aatrox' || !this._aatrox) return;
  const s = this._aatrox, now = performance.now();
  if (s.q && now >= (s.q.windowUntil || 0)) { // 재시전 창이 지나면 마지막 시전부터 센 재사용 대기시간
    const total = this._aatroxQCooldownTotal(s.q.cdSec);
    this.cooldowns.Q = Math.max(0, total - (now - s.q.lastCastAt) / 1000);
    s.q = null;
  }
  if (s.qCast && this.currentActionKey !== 'aatroxQ') s.qCast = null; // 끊긴 Q
  this._aatroxSyncPassiveOverride();
  this._aatroxTickChain();
  this._aatroxTickR();
};
CharacterController.prototype._aatroxOnDeath = function() {
  if (!this._aatrox) return;
  const s = this._aatrox, now = performance.now();
  if (s.q) { this.cooldowns.Q = Math.max(0, this._aatroxQCooldownTotal(s.q.cdSec) - (now - s.q.lastCastAt) / 1000); s.q = null; }
  s.qCast = null; s.w = null; this._aatroxFx.wTarget = null; this._aatroxSetChainMesh(null);
  this._aatroxEndR();
  this.clearAttackOverride('aatroxP');
};
CharacterController.prototype._aatroxReset = function() {
  const fx = this._aatroxFx;
  if (fx && fx.chain) {
    if (fx.chain.parent) fx.chain.parent.remove(fx.chain);
    fx.chain.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  if (typeof setUnitSizeMod === 'function' && this._sizeMods && this._sizeMods.aatroxR) setUnitSizeMod(this, 'aatroxR', 1);
  this._aatroxFx = { chain: null, wTarget: null };
  this._aatrox = { passiveReadyAt: 0, passiveNoClip: false, q: null, qCast: null, w: null, rUntil: 0, rLvl: 1, rMsAt: 0 };
  if (typeof this.clearAttackOverride === 'function') { this.clearAttackOverride('aatroxP'); this.clearAttackOverride('aatroxR'); }
};
