/* ============================================================
   WARD SYSTEM (와드 - 32차)
   ------------------------------------------------------------
   예전 와드는 바닥에 놓인 작은 초록 원뿔 + 임시 시야(grantVision)뿐이었다. 체력도 팀도 없어서 때릴 수 없었고,
   은신·설치 개수 제한·제어 와드의 무력화도 없었다. 원작(PC, 소환사의 협곡 규칙) 와드를 "유닛"으로 다시 만든다.

   원작 규칙(PC 위키 Ward / Stealth Ward / Control Ward):
   - 와드는 팀에 속한 유닛이고 시야 900을 준다. 부쉬 안에 놓으면 그 부쉬 안을 본다(시야 공급원 규칙 그대로).
   - 투명 와드: 체력 3, 은신(상대는 드러내기 없이는 못 본다). 플레이어 한 명당 동시에 3개까지 - 4번째를 놓으면
     가장 오래된 것이 사라진다.
   - 제어 와드: 체력 4, 은신하지 않는다(상대 시야에 들어오면 보인다). 파괴될 때까지 유지. 플레이어 한 명당 1개까지.
     반경 900 안의 상대 투명 와드를 드러내고 무력화한다(무력화된 와드는 시야를 주지 못한다).
   - 기본 공격 1회 = 체력 1(공격력·치명타·적중 시 효과와 무관). 스킬로는 피해를 입지 않는다.
   - 설치 사거리 밖을 찍으면 사거리까지 걸어가서 놓는다(사거리 안이면 행동을 끊지 않고 즉시 놓인다).
   - 기절 등 행동 불가 상태에서는 놓을 수 없다.
   범위상 생략(지어내지 않음): 와드 처치 골드·경험치(수치 확인 못함), 와드 자체 판정 반경(아래 WARD_SELECT_RADIUS_LOL은
   클릭·사거리 계산용 추정값), 모델·이펙트(원본 파일이 없어 직접 만든 모양 - 연출값).
   칼바람 나락(이 맵의 원작)에는 와드가 없다 - 연습용으로 소환사의 협곡 규칙을 쓴다.
   ============================================================ */
const WARD_TYPES = {
  stealth: { maxHp: 3, visionRadius: 900, stealthed: true, revealRadius: 0, limitPerOwner: 3, eye: 0xd8ff5a, trim: 0xb89a4e },
  control: { maxHp: 4, visionRadius: 900, stealthed: false, revealRadius: 900, limitPerOwner: 1, eye: 0xff3fa6, trim: 0x8a2c66 },
};
const WARD_SELECT_RADIUS_LOL = 25; // 추정값: 공격 사거리·클릭 판정에 쓰는 반경(원작 수치 미확인)
const WARD_TEAM_COLOR = { ally: 0x3fa3ff, enemy: 0xff4a4a };

class WardSystem {
  constructor(scene) {
    this.scene = scene;
    this.wards = [];
    this._glowTex = {};
  }

  _glow(hex) {
    if (!this._glowTex[hex] && typeof generateGlowTexture === 'function') this._glowTex[hex] = generateGlowTexture(hex);
    return this._glowTex[hex] || null;
  }

  // 모델(연출값 - 원본 모델 파일이 없어 직접 만든 모양): 원작 와드처럼 돌 받침 위 나무 토템 끝에 빛나는 눈이 달려 있고,
  // 눈을 잎 모양 받침 세 장이 감싼다. 제어 와드는 더 굵고 눈이 분홍 수정이며 고리가 돈다. 바닥에 팀 색 고리.
  // 키는 챔피언(약 1.8)의 절반 정도(원작 화면 비율을 눈으로 맞춘 값).
  _buildMesh(ward) {
    const cfg = WARD_TYPES[ward.wardType];
    const L = lolRangeToWorld;
    const control = ward.wardType === 'control';
    const H = BASE_UNIT * (control ? 0.95 : 0.9);
    const group = new THREE.Group();
    group.position.copy(ward.position);
    const parts = new THREE.Group(); // 설치 시 튀어 오르는 연출용(그림자·고리는 제외)
    group.add(parts);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.85, transparent: true });
    const wood = new THREE.MeshStandardMaterial({ color: control ? 0x4a2a3e : 0x5a4330, roughness: 0.8, transparent: true });
    const trim = new THREE.MeshStandardMaterial({ color: cfg.trim, roughness: 0.35, metalness: 0.7, emissive: cfg.trim, emissiveIntensity: 0.25, transparent: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.17, H * 0.23, H * 0.1, 7), stone);
    base.position.y = H * 0.05;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(H * (control ? 0.075 : 0.06), H * (control ? 0.12 : 0.1), H * 0.62, 6), wood);
    pole.position.y = H * 0.1 + H * 0.31;
    const eyeY = H * 0.82;
    const cradle = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.12, H * 0.07, H * 0.1, 6), trim);
    cradle.position.y = eyeY - H * 0.12;
    parts.add(base, pole, cradle);
    // 잎 모양 받침 세 장(눈을 감싸는 날개).
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(H * 0.07, H * 0.32, 4), trim);
      const a = (i / 3) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * H * 0.13, eyeY + H * 0.02, Math.sin(a) * H * 0.13);
      leaf.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      parts.add(leaf);
    }
    let ring = null;
    if (control) {
      ring = new THREE.Mesh(new THREE.TorusGeometry(H * 0.2, H * 0.018, 6, 24), trim);
      ring.position.y = eyeY;
      ring.rotation.x = Math.PI / 2.4;
      parts.add(ring);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: cfg.eye, transparent: true });
    const eye = new THREE.Mesh(control ? new THREE.OctahedronGeometry(H * 0.13, 0) : new THREE.SphereGeometry(H * 0.11, 14, 12), eyeMat);
    eye.position.y = eyeY;
    parts.add(eye);
    let glow = null;
    const tex = this._glow(cfg.eye);
    if (tex) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cfg.eye, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
      glow.scale.setScalar(H * 0.75);
      glow.position.y = eyeY;
      parts.add(glow);
    }
    const myTeam = (typeof controller !== 'undefined' && controller && controller.team) || PLAYER_TEAM;
    const teamHex = ward.team === myTeam ? WARD_TEAM_COLOR.ally : WARD_TEAM_COLOR.enemy;
    const groundRing = new THREE.Mesh(new THREE.RingGeometry(L(WARD_SELECT_RADIUS_LOL) * 1.1, L(WARD_SELECT_RADIUS_LOL) * 1.45, 32),
      new THREE.MeshBasicMaterial({ color: teamHex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.02;
    group.add(groundRing);
    if (typeof createBlobShadow === 'function') group.add(createBlobShadow(H * 0.4));
    // 클릭 판정용 보이지 않는 몸통(레이캐스트 대상).
    const body = new THREE.Mesh(new THREE.CylinderGeometry(L(WARD_SELECT_RADIUS_LOL) * 1.3, L(WARD_SELECT_RADIUS_LOL) * 1.3, H, 8), new THREE.MeshBasicMaterial({ visible: false }));
    body.position.y = H / 2;
    group.add(body);
    // 체력 칸(최대 체력만큼) + 남은 시간 막대(시간 제한 와드만). 숫자는 쓰지 않는다(28차 체력바 원칙).
    const labelDiv = document.createElement('div');
    labelDiv.className = 'wardBar';
    labelDiv.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;';
    const pips = document.createElement('div');
    pips.style.cssText = 'display:flex;gap:1px;padding:1px;background:#0b0b0f;border:1px solid #000;border-radius:1px;';
    const pipEls = [];
    for (let i = 0; i < ward.maxHp; i++) {
      const p = document.createElement('div');
      p.style.cssText = `width:7px;height:5px;background:#${teamHex.toString(16).padStart(6, '0')};`;
      pips.appendChild(p); pipEls.push(p);
    }
    labelDiv.appendChild(pips);
    let timeEl = null;
    if (Number.isFinite(ward.expiresAt)) {
      const outer = document.createElement('div');
      outer.style.cssText = `width:${ward.maxHp * 8 + 1}px;height:2px;background:#111;`;
      timeEl = document.createElement('div');
      timeEl.style.cssText = 'width:100%;height:100%;background:#d8d8d8;';
      outer.appendChild(timeEl); labelDiv.appendChild(outer);
    }
    let label = null;
    if (typeof CSS2DObject !== 'undefined') {
      label = new CSS2DObject(labelDiv);
      label.position.set(0, H + 0.12, 0);
      group.add(label);
    }
    this.scene.add(group);
    Object.assign(ward, {
      mesh: group, body, labelDiv, label, _parts: parts, _eye: eye, _glow: glow, _eyeMat: eyeMat, _ring: ring,
      _mats: [stone, wood, trim, eyeMat], _pipEls: pipEls, _timeEl: timeEl, _teamHex: teamHex, _height: H,
    });
  }

  // 와드 설치. owner: 설치한 챔피언(없으면 개수 제한 없음 - 연습용 적 와드). 반환: 와드 객체.
  place(owner, type, position, opts = {}) {
    const cfg = WARD_TYPES[type];
    if (!cfg || !position) return null;
    const team = opts.team || (owner && owner.team) || PLAYER_TEAM;
    // 원작: 같은 종류의 개수 제한을 넘으면 가장 오래된 것부터 사라진다.
    if (owner && cfg.limitPerOwner) {
      const mine = this.wards.filter((w) => w.owner === owner && w.wardType === type && !w.destroyed).sort((a, b) => a.createdAt - b.createdAt);
      while (mine.length >= cfg.limitPerOwner) this.destroy(mine.shift(), 'limit');
    }
    const now = performance.now();
    const pos = position.clone(); pos.y = 0;
    const maxHp = opts.maxHp || cfg.maxHp;
    const ward = {
      isWard: true, wardType: type, team, owner: owner || null, position: pos, createdAt: now,
      expiresAt: Number.isFinite(opts.durationSec) ? now + opts.durationSec * 1000 : Infinity,
      hp: maxHp, maxHp, destroyed: false, collisionRadius: lolRangeToWorld(WARD_SELECT_RADIUS_LOL),
      visionRadius: opts.visionRadius || cfg.visionRadius,
      _visionSource: { position: pos, lolRadius: opts.visionRadius || cfg.visionRadius, revealsBrush: false },
      _spawnT: 0, _hitFlash: 0,
    };
    this._buildMesh(ward);
    this.wards.push(ward);
    this._syncOwner(owner);
    return ward;
  }

  destroy(ward, reason = 'killed') {
    if (!ward || ward.destroyed) return;
    ward.destroyed = true; ward.hp = 0; ward._destroyReason = reason;
    if (ward.labelDiv && ward.labelDiv.parentNode) ward.labelDiv.parentNode.removeChild(ward.labelDiv);
    if (ward.mesh) this.scene.remove(ward.mesh);
    if (reason === 'killed' && typeof vfx !== 'undefined' && vfx && typeof vfx.groundShockwave === 'function') {
      vfx.groundShockwave(ward.position, lolRangeToWorld(60), WARD_TYPES[ward.wardType].eye, 0.3);
    }
    if (typeof controller !== 'undefined' && controller && controller.currentTarget === ward) {
      controller.currentTarget = null;
      if (typeof targetRing !== 'undefined') targetRing.clear();
    }
    this.wards = this.wards.filter((w) => w !== ward);
    this._syncOwner(ward.owner);
  }

  clear(filter = null) { for (const w of [...this.wards]) if (!filter || filter(w)) this.destroy(w, 'cleared'); }

  // 리 신 W 등 기존 코드가 읽는 owner._placedWards(자기 와드 목록)를 맞춘다.
  _syncOwner(owner) {
    if (!owner) return;
    owner._placedWards = this.wards.filter((w) => w.owner === owner && !w.destroyed);
  }

  // 기본 공격 명중: 체력 1 감소(원작 - 공격력·치명타 무관).
  hitWard(ward, attacker) {
    if (!ward || ward.destroyed || ward.hp <= 0) return false;
    if (attacker && attacker.team && attacker.team === ward.team) return false;
    ward.hp = Math.max(0, ward.hp - 1);
    ward._hitFlash = 0.15;
    if (ward.hp <= 0) this.destroy(ward, 'killed');
    else this._refreshBar(ward);
    return true;
  }

  wardsOfTeam(team) { return this.wards.filter((w) => !w.destroyed && w.team === team); }

  // 투명 와드가 상대 제어 와드 반경 안이면 드러나고 무력화된다.
  _enemyControlWardCovering(ward) {
    if (ward.wardType !== 'stealth') return null;
    for (const c of this.wards) {
      if (c.destroyed || c.team === ward.team || !WARD_TYPES[c.wardType].revealRadius) continue;
      if (getHorizontalDistance(c.position, ward.position) <= lolRangeToWorld(WARD_TYPES[c.wardType].revealRadius)) return c;
    }
    return null;
  }
  isDisabled(ward) { return !!this._enemyControlWardCovering(ward); }

  // team이 이 와드를 볼 수 있는가(같은 팀은 항상). 은신 와드는 드러내기(상대 제어 와드·드러내기 효과)가 있어야 보인다.
  isVisibleTo(team, ward) {
    if (!ward || ward.destroyed) return false;
    if (ward.team === team) return true;
    if (typeof visionSystem === 'undefined' || !visionSystem || !visionSystem.enabled) return true;
    if (WARD_TYPES[ward.wardType].stealthed) {
      const revealedByWard = !!this._enemyControlWardCovering(ward);
      const revealedByEffect = (visionSystem.reveals || []).some((r) => r.unit === ward && r.team === team && r.expiresAt > performance.now());
      if (!revealedByWard && !revealedByEffect) return false;
    }
    return visionSystem.isPointVisibleTo(team, ward.position);
  }

  // team이 공격 대상으로 고를 수 있는 상대 와드.
  targetableFor(team) { return this.wards.filter((w) => !w.destroyed && w.team !== team && this.isVisibleTo(team, w)); }

  // 시야 공급원(vision_system.js _collectSources). 무력화된 와드는 시야를 주지 못한다.
  visionSources(team) {
    const out = [];
    for (const w of this.wards) if (!w.destroyed && w.team === team && !this.isDisabled(w)) out.push(w._visionSource);
    return out;
  }

  _refreshBar(ward) {
    if (!ward._pipEls) return;
    const lost = '#2a2a2a', on = `#${ward._teamHex.toString(16).padStart(6, '0')}`;
    ward._pipEls.forEach((p, i) => { p.style.background = i < ward.hp ? on : lost; });
  }

  update(dt) {
    const now = performance.now();
    for (const w of [...this.wards]) if (now >= w.expiresAt) this.destroy(w, 'expired');
    const viewTeam = (typeof visionSystem !== 'undefined' && visionSystem) ? visionSystem.viewTeam : PLAYER_TEAM;
    for (const w of this.wards) {
      // 설치 연출(0.25초 튀어 오름) · 눈 흔들림 · 맞았을 때 번쩍임 - 연출값.
      w._spawnT = Math.min(1, w._spawnT + dt / 0.25);
      const s = w._spawnT < 1 ? (1 - Math.pow(1 - w._spawnT, 3)) * (1 + 0.18 * Math.sin(w._spawnT * Math.PI)) : 1;
      w._parts.scale.setScalar(Math.max(0.01, s));
      const t = (now - w.createdAt) / 1000;
      w._eye.position.y = w._height * (0.82 + 0.015 * Math.sin(t * 2.4));
      if (w._ring) w._ring.rotation.z = t * 1.2;
      w._eye.rotation.y = t * (w.wardType === 'control' ? 1.6 : 0.6);
      if (w._glow) { w._glow.position.y = w._eye.position.y; w._glow.material.opacity = 0.7 + 0.15 * Math.sin(t * 3.1); }
      if (w._hitFlash > 0) { w._hitFlash = Math.max(0, w._hitFlash - dt); w._eyeMat.color.setHex(w._hitFlash > 0 ? 0xffffff : WARD_TYPES[w.wardType].eye); }
      if (w._timeEl && Number.isFinite(w.expiresAt)) w._timeEl.style.width = `${Math.max(0, (w.expiresAt - now) / (w.expiresAt - w.createdAt)) * 100}%`;
      // 화면 표시: 보는 팀에게 안 보이는 상대 와드는 숨긴다. 상대 제어 와드에 무력화된 자기 와드는 흐리게 그린다.
      const visible = this.isVisibleTo(viewTeam, w);
      if (w.mesh.visible !== visible) { w.mesh.visible = visible; if (w.labelDiv) w.labelDiv.style.display = visible ? '' : 'none'; }
      if (visible) {
        const own = w.team === viewTeam;
        const disabled = this.isDisabled(w);
        const op = own && disabled ? 0.4 : 1;
        if (w._opacity !== op) { w._opacity = op; for (const m of w._mats) m.opacity = op; if (w._glow) w._glow.visible = !disabled; }
      }
    }
  }

  /* ---------------- 설치 명령(사거리 밖이면 걸어가서 놓기) ---------------- */
  // ctrl: 플레이어 챔피언, point: 찍은 지점, rangeLol: 설치 사거리, placeFn(finalPos): 실제로 놓는 함수(충전 소모 포함).
  order(ctrl, point, rangeLol, placeFn) {
    if (!ctrl || !point) return false;
    if (ctrl.state === STATE.DEAD || ctrl.state === STATE.RESPAWN || ctrl.hp <= 0) return false;
    if (isCrowdControlled(ctrl)) return false;
    let target = point.clone(); target.y = 0;
    if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap) target = howlingAbyssMap.clampPosition(target); // 벽·맵 밖이면 가까운 걸을 수 있는 곳
    const dist = getHorizontalDistance(ctrl.root.position, target);
    if (dist <= lolRangeToWorld(rangeLol)) { ctrl._wardOrder = null; return placeFn(target); }
    ctrl.moveTo(target.clone());
    if (ctrl.state !== STATE.MOVE) return false; // 지금은 걸을 수 없다(시전 잠금 등)
    ctrl._wardOrder = { target, rangeLol, placeFn }; // moveTo가 지운 뒤에 건다(이동·공격·스킬 명령이 오면 취소)
    return true;
  }

  updateOrder(ctrl) {
    const o = ctrl && ctrl._wardOrder;
    if (!o) return;
    if (ctrl.state === STATE.DEAD || ctrl.hp <= 0 || ctrl.state !== STATE.MOVE) { ctrl._wardOrder = null; return; }
    if (getHorizontalDistance(ctrl.root.position, o.target) > lolRangeToWorld(o.rangeLol)) return;
    ctrl._wardOrder = null;
    if (isCrowdControlled(ctrl)) return;
    o.placeFn(o.target);
    ctrl.moveTo(ctrl.root.position.clone()); // 놓으면 멈춘다
    ctrl._wardOrder = null;
  }
}
