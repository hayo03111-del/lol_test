/* ============================================================
   럭스(Lux) 전투 로직 - 47차
   ------------------------------------------------------------
   사용자가 만든 럭스 확장(별도 HTML에 붙여 넣은 코드 + 임베드 GLB)을 저장소 구조로 옮기며 다시 짰다. 수치는 전부
   champion_data.js의 lux 항목(출처·추정 표시도 그쪽 주석).

   - 패시브(광채): 공격 스킬에 맞은 적에게 6초 표식. 기본 공격·R이 표식을 터뜨려 추가 마법 피해.
   - Q(빛의 속박): 피할 수 있는 직선 스킬샷(투사체 line 모드, maxHits 2) - 처음 맞은 둘에게 피해 + 속박.
   - W(프리즘 보호막): 지팡이가 사거리 끝까지 갔다가 럭스에게 돌아온다. 지나가며 닿은 아군(과 럭스)에게 갈 때·올 때 각각 보호막.
   - E(광휘의 특이점): 지정 위치(최대 1100)로 날아가 반경 310 영역을 만든다 - 안의 적 둔화. 다시 누르거나 5초가 지나면 터져
     피해 + 1초 추가 둔화. 날아가는 중에 다시 누르면 도착하자마자 터진다.
     (사용자 확장의 E 문제: 매 프레임 바닥 원을 새로 만들어 깜빡이고 무거웠다, 조준 표시 값이 함수가 아닌 숫자라 표시가 안 맞았다,
      재사용이 시전 게이트·마나 검사에 막힐 수 있었다 - 영역·투사체 메시를 하나씩 만들어 옮기고, 재사용은 게이트 없이 바로 처리한다.)
   - R(최후의 섬광): 1초 시전 뒤 3400 직선 전체에 피해. 맞은 적의 표식을 먼저 터뜨리고 새 표식을 남긴다.
   ============================================================ */

CharacterController.prototype._luxIsAlive = function() {
  return this.hp > 0 && this.state !== STATE.DEAD && this.state !== STATE.RESPAWN;
};
CharacterController.prototype._luxAimDir = function(mouseWorldPoint) {
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1).applyQuaternion(this.root.quaternion);
  return dir.setY(0).normalize();
};
CharacterController.prototype._luxSpellDamage = function(u, raw, isUltimate = false) {
  if (!u || u.hp <= 0 || u.isStructure) return 0;
  return applyDamage(u, { isUltimate, rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this }) || 0;
};

/* ---------------- 패시브 - 광채 ---------------- */
CharacterController.prototype._luxMark = function(u) {
  if (!u || u.hp <= 0 || u.isStructure) return;
  this._lux.marks.set(u, performance.now() + this._champData().passive.durationSec * 1000);
};
// 표식이 있으면 터뜨린다(추가 마법 피해). 기본 공격 적중과 R에서 부른다.
CharacterController.prototype._luxDetonateMark = function(u) {
  const until = this._lux.marks.get(u);
  if (until == null) return false;
  this._lux.marks.delete(u);
  if (until <= performance.now() || !u || u.hp <= 0) return false;
  const p = this._champData().passive;
  const lvl = Math.max(1, Math.min(18, this.champLevel || 1));
  this._luxSpellDamage(u, p.base + p.perLevel * lvl + p.apRatio * (this.stats.abilityPower || 0));
  if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(u).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.8, 0)), undefined, { color: 0xfff1a8 });
  return true;
};
CharacterController.prototype._luxOnBasicAttackHit = function(target) { this._luxDetonateMark(target); };

/* ---------------- 시전 공통 ---------------- */
// 시전 시간 동안 잠그고(clip 재생) fire()를 부른 뒤, 남은 모션은 이동으로 끊을 수 있는 후딜(이즈리얼과 같은 처리).
CharacterController.prototype._luxBeginCast = function(slot, dir, castTimeSec, fire) {
  const key = 'lux' + slot;
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.targetPos = null; this.isChasing = false;
  this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE[slot + '_CAST']);
  const clipName = 'Spell' + { Q: 1, W: 2, E: 3, R: 4 }[slot];
  const clip = this.findAnimation(clipName);
  this.playFirstAvailable([clipName], { loop: THREE.LoopOnce, fade: 0.06, clampWhenFinished: true });
  const fireTimer = this._champTimeout(() => {
    if (this.currentActionKey !== key || !this._luxIsAlive()) return;
    this.currentPhase = 'ACTIVE';
    fire();
    if (this.currentActionKey !== key) return;
    this.currentPhase = 'RECOVERY'; this.phaseCancelable = true;
    if (this.pendingMove || this.pendingCast) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, castTimeSec * 1000);
  this._actionTimers.push(fireTimer);
  const doneTimer = this._champTimeout(() => {
    if (this.currentActionKey === key) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, Math.max(castTimeSec + 0.05, clip ? clip.duration : castTimeSec + 0.3) * 1000);
  this._actionTimers.push(doneTimer);
};
CharacterController.prototype._luxCastGate = function(slot) {
  return this._luxIsAlive() && !isSilenced(this) && !isCrowdControlled(this);
};
// 빛 구체 메시(Q 구체·W 지팡이·E 특이점) - 하나 만들어 옮기고 끝나면 지운다.
CharacterController.prototype._luxMakeOrb = function(color, size) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(BASE_UNIT * size, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  if (typeof scene !== 'undefined') scene.add(m);
  return m;
};
CharacterController.prototype._luxDisposeMesh = function(m) {
  if (!m) return;
  if (m.parent) m.parent.remove(m);
  m.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
};

/* ---------------- Q - 빛의 속박 ---------------- */
CharacterController.prototype._luxCastQ = function(mouseWorldPoint, free = false) {
  if (!this._luxCastGate('Q')) return;
  const q = this._champData().Q;
  const dir = this._luxAimDir(mouseWorldPoint);
  if (!this._payCost('Q', free)) return;
  const lvl = Math.max(1, this.skillLevels.Q || 1);
  this._luxBeginCast('Q', dir, q.castTimeSec, () => {
    const from = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.7, 0));
    const raw = skillVal(q.damageByLevel, lvl) + q.apRatio * (this.stats.abilityPower || 0);
    const orb = this._luxMakeOrb(0xfff0a0, 0.16);
    const proj = projectiles.spawn({
      from, speed: lolRangeToWorld(q.missileSpeed), color: 0xfff0a0, realmId: this.realmId, hidden: true,
      line: { dir, maxDist: lolRangeToWorld(q.range), halfWidth: lolRangeToWorld(q.width) * 0.5, maxHits: q.maxTargets || 2,
        filter: (u) => !u.isStructure, onMiss: () => debugSkillMiss('Lux Q(빛의 속박)', '맞은 대상 없음') },
      onHit: (u) => {
        if (this.championId !== 'lux') return;
        this._luxSpellDamage(u, raw);
        if (u.hp > 0) {
          applyStatus(u, { id: 'luxQ_root', type: 'ROOT', duration: q.rootDurationSec, value: 1, source: this });
          this._luxMark(u);
        }
        debugSkillHit('Lux Q(빛의 속박)', u);
      },
    });
    this._lux.orbs.push({ mesh: orb, proj });
  });
};

/* ---------------- W - 프리즘 보호막 ---------------- */
CharacterController.prototype._luxCastW = function(mouseWorldPoint, free = false) {
  if (!this._luxCastGate('W')) return;
  const w = this._champData().W;
  const dir = this._luxAimDir(mouseWorldPoint);
  if (!this._payCost('W', free)) return;
  const lvl = Math.max(1, this.skillLevels.W || 1);
  this._luxBeginCast('W', dir, w.castTimeSec, () => {
    const origin = this.root.position.clone();
    const id = ++this._lux.serial;
    const wand = { id, lvl, origin, dir: dir.clone(), pos: origin.clone(), leg: 0, hit: new Set(), maxDist: lolRangeToWorld(w.range), mesh: this._luxMakeOrb(0xa8f0ff, 0.13) };
    this._luxShieldUnit(this, wand); // 던지는 순간 럭스 자신도 받는다
    wand.hit.add(this);
    this._lux.wands.push(wand);
  });
};
CharacterController.prototype._luxShieldUnit = function(u, wand) {
  const w = this._champData().W;
  const amount = (skillVal(w.shieldByLevel, wand.lvl) + w.shieldApRatio * (this.stats.abilityPower || 0)) * getShieldReceivedMultiplier(u);
  addShield(u, `luxW:${wand.id}:${wand.leg}`, amount, w.shieldDurationSec); // 갈 때·올 때 보호막은 따로 쌓인다
  updateBars(u);
  if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(u).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xbff4ff });
};
CharacterController.prototype._luxTickWands = function(dt) {
  const w = this._champData().W;
  const speed = lolRangeToWorld(w.missileSpeed), halfW = lolRangeToWorld(w.width) * 0.5;
  for (let i = this._lux.wands.length - 1; i >= 0; i--) {
    const wand = this._lux.wands[i];
    const prev = wand.pos.clone();
    if (wand.leg === 0) {
      const traveled = Math.min(wand.maxDist, prev.distanceTo(wand.origin) + speed * dt);
      wand.pos.copy(wand.origin).addScaledVector(wand.dir, traveled);
      if (traveled >= wand.maxDist - 1e-6) { wand.leg = 1; wand.hit.clear(); }
    } else {
      const to = this.root.position.clone().setY(prev.y);
      const d = to.clone().sub(prev); const len = d.length();
      if (len <= speed * dt + 1e-6) wand.pos.copy(to); else wand.pos.addScaledVector(d.divideScalar(len), speed * dt);
    }
    // 이번 프레임에 지나간 선분에 닿은 아군(죽음의 세계 등 상호작용 불가 대상 제외 - getAllyChampions가 걸러 줌)
    const seg = wand.pos.clone().sub(prev).setY(0); const segLen = seg.length(); if (segLen > 0) seg.divideScalar(segLen);
    for (const a of [this, ...getAllyChampions(this)]) {
      if (!a || a.hp <= 0 || wand.hit.has(a)) continue;
      const p = getWorldPosition(a); if (!p) continue;
      const v = new THREE.Vector3(p.x - prev.x, 0, p.z - prev.z);
      const along = segLen > 0 ? Math.max(0, Math.min(segLen, v.dot(seg))) : 0;
      const dist = v.addScaledVector(seg, -along).length();
      if (dist > halfW + getCollisionRadius(a)) continue;
      wand.hit.add(a);
      this._luxShieldUnit(a, wand);
    }
    wand.mesh.position.set(wand.pos.x, BASE_UNIT * 0.8, wand.pos.z);
    if (wand.leg === 1 && wand.pos.distanceTo(this.root.position.clone().setY(wand.pos.y)) < 1e-4) {
      if (!wand.hit.has(this)) this._luxShieldUnit(this, wand); // 돌아와 럭스에게 닿으면 한 번 더
      this._luxDisposeMesh(wand.mesh);
      this._lux.wands.splice(i, 1);
    }
  }
};

/* ---------------- E - 광휘의 특이점 ---------------- */
CharacterController.prototype._luxCastE = function(mouseWorldPoint, free = false) {
  const z = this._lux.zone;
  if (z) { // 재사용: 비용·시전 시간 없이 터뜨린다(날아가는 중이면 도착하자마자)
    if (z.ready) this._luxDetonateE(); else z.detonateOnArrival = true;
    return;
  }
  if (!this._luxCastGate('E')) return;
  const e = this._champData().E;
  const dir = this._luxAimDir(mouseWorldPoint);
  const maxW = lolRangeToWorld(e.range);
  const dist = mouseWorldPoint ? Math.min(maxW, new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0).length()) : maxW;
  if (!this._payCost('E', free)) return;
  const lvl = Math.max(1, this.skillLevels.E || 1);
  this._luxBeginCast('E', dir, e.castTimeSec, () => {
    const from = this.root.position.clone();
    const end = from.clone().addScaledVector(dir, dist);
    if (typeof constrainUnitPosition === 'function') constrainUnitPosition(this, end);
    this._lux.zone = {
      from, end, pos: from.clone(), lvl, ap: this.stats.abilityPower || 0, ready: false, expiresAt: Infinity, detonateOnArrival: false,
      orb: this._luxMakeOrb(0xffe58a, 0.2), area: null,
    };
  });
};
CharacterController.prototype._luxMakeZoneMesh = function(center, radiusWorld) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radiusWorld, 48), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(radiusWorld * 0.94, radiusWorld, 64), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = ring.rotation.x = -Math.PI / 2;
  g.add(disc, ring);
  g.position.set(center.x, 0.06, center.z);
  if (typeof scene !== 'undefined') scene.add(g);
  return g;
};
CharacterController.prototype._luxTickZone = function(dt) {
  const z = this._lux.zone;
  if (!z) return;
  const e = this._champData().E;
  if (!z.ready) {
    const total = z.from.distanceTo(z.end);
    const traveled = Math.min(total, z.pos.distanceTo(z.from) + lolRangeToWorld(e.missileSpeed) * dt);
    if (total > 1e-6) z.pos.copy(z.from).lerp(z.end, traveled / total); else z.pos.copy(z.end);
    z.orb.position.set(z.pos.x, BASE_UNIT * 0.6, z.pos.z);
    if (traveled >= total - 1e-6) {
      z.ready = true;
      z.expiresAt = performance.now() + e.zoneDurationSec * 1000;
      z.area = this._luxMakeZoneMesh(z.end, lolRangeToWorld(e.radius));
      z.orb.position.set(z.end.x, BASE_UNIT * 0.35, z.end.z);
      if (z.detonateOnArrival) { this._luxDetonateE(); return; }
    }
    return;
  }
  // 영역 안 적 둔화(머무는 동안 갱신) - 원작처럼 영역 크기는 일정, 테두리만 살짝 숨쉬듯 밝기 변화
  const slow = skillVal(e.slowPercentByLevel, z.lvl) / 100;
  for (const { unit } of findEnemiesInRadius(z.end, e.radius)) {
    if (!unit || unit.isStructure || !canRealmInteract(this, unit)) continue;
    applyStatus(unit, { id: 'luxE_slow', type: 'SLOW', duration: 0.25, value: slow, source: this });
  }
  if (z.area) z.area.children[1].material.opacity = 0.55 + 0.2 * Math.sin(performance.now() / 160);
  if (performance.now() >= z.expiresAt) this._luxDetonateE();
};
CharacterController.prototype._luxDetonateE = function() {
  const z = this._lux.zone;
  if (!z || !z.ready) return;
  this._lux.zone = null;
  const e = this._champData().E;
  const raw = skillVal(e.damageByLevel, z.lvl) + e.apRatio * z.ap;
  const slow = skillVal(e.slowPercentByLevel, z.lvl) / 100;
  let hits = 0;
  for (const { unit } of findEnemiesInRadius(z.end, e.radius)) {
    if (!unit || unit.isStructure || !canRealmInteract(this, unit)) continue;
    this._luxSpellDamage(unit, raw);
    if (unit.hp > 0) {
      applyStatus(unit, { id: 'luxE_slow', type: 'SLOW', duration: e.slowLingerSec, value: slow, source: this });
      this._luxMark(unit);
    }
    hits++;
  }
  this._luxDisposeMesh(z.orb); this._luxDisposeMesh(z.area);
  if (typeof vfx !== 'undefined') vfx.groundShockwave(z.end.clone(), lolRangeToWorld(e.radius), 0xffe066, 0.4);
  debugSkillHit('Lux E(광휘의 특이점) 폭발', this, { hits });
};

/* ---------------- R - 최후의 섬광 ---------------- */
CharacterController.prototype._luxCastR = function(mouseWorldPoint, free = false) {
  if (!this._luxCastGate('R')) return;
  const r = this._champData().R;
  const dir = this._luxAimDir(mouseWorldPoint);
  if (!this._payCost('R', free)) return;
  const lvl = Math.max(1, this.skillLevels.R || 1);
  const lenW = lolRangeToWorld(r.range), widthW = lolRangeToWorld(r.width);
  // 1초 동안 발사 예고(얇은 선) - 끝나면 굵은 섬광
  if (typeof vfx !== 'undefined' && vfx.groundShapeFlash) vfx.groundShapeFlash(this.root.position.clone(), dir, { kind: 'line', length: lenW, width: widthW * 0.35, opacity: 0.35, hold: true }, 0xffc86b, r.castTimeSec);
  this._luxBeginCast('R', dir, r.castTimeSec, () => {
    const origin = this.root.position.clone();
    const raw = skillVal(r.damageByLevel, lvl) + r.apRatio * (this.stats.abilityPower || 0);
    const hits = typeof findEnemiesInLine === 'function' ? findEnemiesInLine(origin, dir, r.range, r.width) : [];
    for (const u of hits) {
      if (!u || u.hp <= 0 || u.isStructure || !canRealmInteract(this, u)) continue;
      this._luxDetonateMark(u); // 이전 표식을 먼저 터뜨리고
      this._luxSpellDamage(u, raw, true); // 83차: 궁극기(칼바람 원거리 감소 제외)
      if (u.hp > 0) {
        this._luxMark(u); // 새 표식을 남긴다
        if (typeof visionSystem !== 'undefined' && visionSystem && visionSystem.revealUnit) visionSystem.revealUnit(u, r.revealSec, this.team);
      }
    }
    if (typeof vfx !== 'undefined' && vfx.groundShapeFlash) vfx.groundShapeFlash(origin, dir, { kind: 'line', length: lenW, width: widthW }, 0xfff1b8, 0.4);
    debugSkillHit('Lux R(최후의 섬광)', this, { hits: hits.length });
  });
};

/* ---------------- 매 프레임 / 정리 ---------------- */
CharacterController.prototype._luxUpdate = function(dt) {
  if (this.championId !== 'lux' || !this._lux) return;
  const now = performance.now();
  for (const [u, t] of this._lux.marks) if (t <= now || !u || u.hp <= 0) this._lux.marks.delete(u);
  // Q 구체 모양: 투사체(line)를 따라가다 끝나면 지운다
  for (let i = this._lux.orbs.length - 1; i >= 0; i--) {
    const o = this._lux.orbs[i];
    if (!o.proj.done) { o.mesh.position.copy(o.proj.mesh.position); continue; }
    this._luxDisposeMesh(o.mesh); this._lux.orbs.splice(i, 1);
  }
  this._luxTickWands(dt);
  this._luxTickZone(dt);
};
CharacterController.prototype._luxReset = function() {
  const s = this._lux;
  if (s) {
    for (const o of s.orbs || []) this._luxDisposeMesh(o.mesh);
    for (const w of s.wands || []) this._luxDisposeMesh(w.mesh);
    if (s.zone) { this._luxDisposeMesh(s.zone.orb); this._luxDisposeMesh(s.zone.area); }
  }
  this._lux = { marks: new Map(), orbs: [], wands: [], zone: null, serial: 0 };
};
