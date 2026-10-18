/* ============================================================
   아리(Ahri) 전투 로직
   ------------------------------------------------------------
   다른 챔피언들(야스오/이즈리얼 등)과 동일한 패턴 - CharacterController.
   prototype 확장으로 챔피언 전용 메서드를 분리하고, character_controller.js
   의 _castQ/_castW/_castE/_dispatchCast/update() 최상단에서 championId ===
   'ahri'이면 이 파일의 커스텀 캐스트/틱 함수로 곧장 위임한다(공용 Controller
   코드를 직접 뒤섞지 않는다는 이 프로젝트의 원칙 그대로).

   참고: CHAMPION_DATA.ahri(champion_data.js)는 사용자가 제공한 실제 게임
   데이터 파일(ahri.bin/ahri.bin.json)로 검증한 수치다 - 데이터 해석 방식
   (캐스트 오브젝트 vs 실제 피해를 적용하는 하위 미사일 오브젝트 구분 등)은
   그 파일 상단 주석 참고. 실제 GLB(사용자 업로드본, 55클립) 검증 결과는
   champion_ability_database.js의 ahri 항목 주석 참고.

   Q(현혹의 구슬)/R(혼령 질주)는 이 뷰어의 다른 스킬들처럼 즉시 판정되는
   단발 투사체가 아니라, 한 번 시전하면 여러 프레임에 걸쳐 스스로 진행하는
   상태를 갖는다 - 요네 R 회오리/이즈리얼 R 관통 광선과 동일하게 매 프레임
   훅(_ahriUpdate)에서 계속 갱신되는 커스텀 트래블 패턴을 재사용한다.
   ============================================================ */

// 패시브(정기 흡수): 미니언/몬스터를 MaxStacks(9)번 처치할 때마다 체력을
// 회복한다(MinionHeal 공식). 적 챔피언 처치에 관여하면 스택과 무관하게
// 즉시 더 큰 체력을 회복한다(ChampionHeal 공식) - 두 훅 모두 공용 파일의
// 최소한의 championId 게이트(exp_level_system.js killMinion / 00_global_
// constants.js applyDamage의 처형 판정)에서 호출된다(이즈리얼 W 표식 폭발이
// applyDamage 경로에 한 줄만 걸어둔 것과 동일한 원칙).
CharacterController.prototype._ahriOnMinionKill = function() {
  const p = this._champData() && this._champData().passive;
  if (!p) return;
  this._ahri.passiveStacks = (this._ahri.passiveStacks || 0) + 1;
  if (this._ahri.passiveStacks < (p.maxStacks || 9)) return;
  this._ahri.passiveStacks = 0;
  const heal = growLinear(p.minionHealBase, p.minionHealGrowth, this.champLevel || 1) + p.minionHealApRatio * (this.stats.abilityPower || 0);
  // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소) - 챔피언 전용 회복
  // 경로에도 공용 아이템 경로와 동일하게 적용한다(getHealReceivedMultiplier 참고).
  this.hp = Math.min(this.maxHp, this.hp + heal * getHealReceivedMultiplier(this));
  updateBars(this);
  // 버그 수정(레퍼런스 영상 ability_0103_P1.webm 픽셀 대조): 기존 색상
  // (0x8fffb0, 녹색 계열)은 실제 정기 흡수 VFX와 다르다 - 실측 결과 밝은
  // 시안/화이트 계열(#d0fdff 부근)이었다.
  vfx.spawn('ahriOrbHit', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xbdf7ff });
  debugSkillHit('Ahri Passive (정기 흡수 - 미니언 처치 회복)', this);
};
CharacterController.prototype._ahriOnChampionTakedown = function(target) {
  const p = this._champData() && this._champData().passive;
  if (p) {
    const heal = growLinear(p.championHealBase, p.championHealGrowth, this.champLevel || 1) + p.championHealApRatio * (this.stats.abilityPower || 0);
    // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소).
    this.hp = Math.min(this.maxHp, this.hp + heal * getHealReceivedMultiplier(this));
    updateBars(this);
    // 버그 수정(레퍼런스 영상 대조): 실제 영상은 챔피언 처치 관여 시 정기를
    // "빨아들이는" 이펙트가 대상 위치에도 나타난다(아리 쪽 이펙트 하나만
    // 있던 기존 구현과 달리, 대상→아리 방향으로 정기를 흡수하는 연출).
    // target이 넘어오면 대상 위치에도 같은 시안 계열 이펙트를 추가로 띄운다.
    if (target) vfx.spawn('ahriOrbHit', getWorldPosition(target)?.clone() || target.mesh?.position?.clone() || this.root.position.clone(), undefined, { color: 0xbdf7ff });
    vfx.spawn('ahriOrbHit', this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xbdf7ff });
    debugSkillHit('Ahri Passive (정기 흡수 - 챔피언 처치 관여 회복)', this);
  }
  // R(혼령 질주) 처치 관여 재사용 - 지금 R이 쿨다운 중이면(=이미 최소 1번
  // 사용한 상태) 돌진 재사용 횟수를 1 회복하고(최대 3회까지 중첩) 재시전
  // 창을 늘린다. 공식 설명("스킬 재사용의 지속 시간을 최대 10초 늘리고")
  // 그대로 - 매번 새 15초짜리 창으로 초기화하는 게 아니라, 지금 남아있는
  // 창에 최대 10초를 더 얹는 개념이다.
  const r = this._champData() && this._champData().R;
  if (r && this.cooldowns.R > 0) {
    this._ahri.rCharges = Math.min(r.maxCasts || 3, (this._ahri.rCharges || 0) + (r.resetCastsOnTakedown || 1));
    const extendMs = (r.recastWindowExtendOnTakedown || 10) * 1000;
    this._ahri.rReadyUntil = Math.max(this._ahri.rReadyUntil || 0, performance.now()) + extendMs;
    console.log('[Ahri R] 챔피언 처치 관여 - 돌진 재사용 횟수 회복 + 재시전 창 10초 연장');
  }
};

// 기능 구현: 매혹(E)에 적중된 대상은 3초간 "아리의 스킬 피해"를 20% 더
// 받는다(공식 설명). 평타는 제외 대상이라 Q/W/R의 스킬 피해 계산 지점
// 세 곳에서만 이 헬퍼를 거친다 - 대상에게 'ahriCharmVuln' 상태(E 명중
// 시에만 부여, CC와 별개로 고정 3초)가 살아있으면 그 배율만큼 곱해서
// 반환한다.
CharacterController.prototype._ahriCharmVulnMultiplier = function(target) {
  const s = getStatus(target, 'ahriCharmVuln');
  return s ? 1 + (s.value || 0) : 1;
};

// Q(현혹의 구슬): 구슬을 던졌다가 되돌려 받는다. 나갈 때 마법 피해, 돌아올
// 때 고정(진정한) 피해 - 이 캐스트 함수는 시전(비용/모션/초기 상태)만
// 맡고, 실제 왕복 이동/판정은 _ahriTickQTravel(매 프레임, _ahriUpdate에서
// 호출)이 담당한다(판정과 캐스트를 분리하는 이 프로젝트의 원칙 그대로).
CharacterController.prototype._ahriCastQ = function(mouseWorldPoint, free = false) {
  if (isSilenced(this)) return;
  const q = this._champData().Q;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('Q', free)) return;
  // 버그 수정(회귀): 마우스는 "방향"만 결정해야 하는데, 예전 구현은
  // `rawDist`(아리~클릭 지점 거리)를 그대로 실제 이동 거리(outDist)로
  // 써서 가까이 클릭할수록 Q가 짧게 나갔다. 실제 LoL의 직선 스킬샷은
  // 전부 이 방식이 아니다 - 방향만 클릭으로 정하고, 거리는 항상 최대
  // 사거리(900)를 그대로 쓴다(벽 등으로 막히는 경우는 이 프로젝트에
  // 지형 충돌이 없어 고려하지 않는다).
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'ahriQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);

  // 버그 수정(리소스 누수): 새 Q를 시작하기 전에 이전 Q가 아직 왕복
  // 중이었다면(예: 헤이스트 등으로 쿨다운이 왕복 시간보다 짧아지는 경우)
  // 반드시 먼저 정리한다 - 그냥 this._ahri.qTravel을 덮어쓰면 이전
  // orbMesh의 참조를 잃어버려 scene에 영구히 남는다.
  // 발사(시전 시간 끝) 뒤 남은 모션은 이동으로 끊을 수 있는 후딜(RECOVERY)이다 - 기다리던 이동이 곧바로 이어진다.
  // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 즉시 발사됐다. PC 위키 시전 시간 0.25초 뒤 발사, 그 전에 끊기면 취소.
  const __fire = () => {
  if (this._ahri.qTravel) this._ahriEndQTravel();

  const worldRange = lolRangeToWorld(q.range);
  const outDist = worldRange;
  const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
  const halfWidth = lolRangeToWorld(q.width || 100) * 0.5;

  // 구슬 자체는 왕복하는 동안 계속 화면에 보여야 하는 지속 오브젝트라,
  // 매번 새로 스폰/소멸하는 vfx 풀 대신 직접 만든 스프라이트 하나를
  // qTravel 상태에 들고 다니며 매 프레임 위치만 갱신한다(닐라/요네 champion
  // 파일들이 scene.add()를 직접 쓰는 것과 동일한 방식).
  // 버그 수정(레퍼런스 영상 ability_0103_Q1.webm 픽셀 대조): 기존 색상
  // (0xff6fd8, 핑크/마젠타 - "클래식 아리 오브"를 가정한 색)은 실제 이
  // 레퍼런스 영상과 다르다. 실측 결과 구슬 궤적은 밝은 시안(#91feff 부근)
  // 이었다. E(매혹)는 반대로 실측에서도 핑크 계열(#e8a1ef)로 확인되어
  // 그대로 둔다 - Q/W/R/패시브만 시안/화이트 계열로 정정.
  const mat = new THREE.SpriteMaterial({
    map: (typeof VFX_TEXTURES !== 'undefined' ? VFX_TEXTURES.qPoint : null),
    color: 0x7ff5ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const orbMesh = new THREE.Sprite(mat);
  orbMesh.scale.setScalar(0.5);
  orbMesh.position.copy(origin);
  scene.add(orbMesh);

  this._ahri.qTravel = {
    phase: 'out', dir: dir.clone(), pos: origin.clone(), outDist, traveled: 0,
    // 나갈 때는 위키 SPEED 표기(1550) 그대로 정속 이동, 돌아올 때만
    // 60에서 2600까지 가속한다(returnSpeed/returnMaxSpeed/returnAccel).
    speed: lolRangeToWorld(q.outSpeed || 1550), halfWidth, hitSet: new Set(),
    level: Math.max(1, this.skillLevels.Q || 1), orbMesh, elapsed: 0,
  };
  vfx.spawn('ahriOrbHit', origin.clone(), undefined, { color: 0x7ff5ff });

  };
  const __castTimer = this._champTimeout(() => { if (this.currentActionKey === 'ahriQ') { __fire(); if (this.currentActionKey === 'ahriQ') { this.currentPhase = 'RECOVERY'; this.phaseCancelable = true; } } }, (q.castTimeSec != null ? q.castTimeSec : 0.25) * 1000);
  this._actionTimers.push(__castTimer);

  const clip = this.findAnimation('Spell1');
  this.playFirstAvailable(['Spell1'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const dur = clip ? clip.duration : 0.3;
  const recTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'ahriQ') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, dur * 1000);
  this._actionTimers.push(recTimer);
};

// 선분(이전 위치 -> 현재 위치)과 점 사이의 최단 거리(XZ 평면, 높이 무시).
// Q/E처럼 한 프레임에 크게 이동하는 고속 판정에서 "현재 위치 원형 판정"
// 만으로는 그 사이 지나친 대상을 놓칠 수 있어(터널링) 선분 기준으로 확인한다.
function _ahriPointToSegmentDistanceXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const abLenSq = abx * abx + abz * abz;
  let t = abLenSq > 1e-8 ? ((px - ax) * abx + (pz - az) * abz) / abLenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t, cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

// Q 왕복 중 대상 판정 - 이전 프레임 위치(travel.prevPos)부터 이번 프레임
// 위치(travel.pos)까지의 이동 선분을 기준으로 판정한다(버그 수정: 기존
// "현재 위치만 원형 판정"은 Q가 고속으로 이동할 때(특히 돌아올 때 최대
// 2600까지 가속) 프레임 사이에 적을 그냥 지나쳐버리는 터널링이 가능했다).
// leg별로 hitSet을 따로 둬서, 같은 적이 나갈 때/돌아올 때 각각 한 번씩
// (최대 2회) 맞을 수 있게 한다.
CharacterController.prototype._ahriQCheckHits = function(travel, q, leg) {
  const lvl = travel.level;
  const prev = travel.prevPos || travel.pos;
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || travel.hitSet.has(u)) continue;
    const p = getWorldPosition(u);
    if (!p) continue;
    const dist = _ahriPointToSegmentDistanceXZ(p.x, p.z, prev.x, prev.z, travel.pos.x, travel.pos.z);
    if (dist > travel.halfWidth + getCollisionRadius(u)) continue;
    travel.hitSet.add(u);
    // 나갈 때/돌아올 때 피해량과 AP 계수는 완전히 동일하다(damageByLevel/apRatio
    // 공용) - 피해 속성만 마법(out)/고정(back)으로 갈린다.
    const raw = (skillVal(q.damageByLevel, lvl) + (q.apRatio || 0) * (this.stats.abilityPower || 0)) * this._ahriCharmVulnMultiplier(u);
    const dtype = leg === 'out' ? DAMAGE_TYPE.MAGICAL : DAMAGE_TYPE.TRUE;
    applyDamage(u, { rawDamage: raw, damageType: dtype, isCritical: false, critMultiplier: 1, source: this });
    vfx.spawn('ahriOrbHit', getWorldPosition(u)?.clone() || u.mesh.position.clone(), undefined, { color: 0x7ff5ff });
    debugSkillHit(`Ahri Q (${leg === 'out' ? '나갈 때 - 마법 피해' : '돌아올 때 - 고정 피해'})`, u);
  }
};
CharacterController.prototype._ahriEndQTravel = function() {
  const travel = this._ahri.qTravel;
  if (travel && travel.orbMesh) {
    scene.remove(travel.orbMesh);
    if (travel.orbMesh.material) travel.orbMesh.material.dispose();
  }
  this._ahri.qTravel = null;
};
CharacterController.prototype._ahriTickQTravel = function(dt) {
  const travel = this._ahri.qTravel;
  if (!travel) return;
  const q = this._champData() && this._champData().Q;
  if (!q) { this._ahriEndQTravel(); return; }
  travel.prevPos = travel.pos.clone();

  if (travel.phase === 'out') {
    // 나갈 때는 위키 SPEED(1550) 그대로 정속 - 감속하지 않는다.
    travel.speed = lolRangeToWorld(q.outSpeed || 1550);
    const remaining = Math.max(0, travel.outDist - travel.traveled);
    const step = Math.min(remaining, travel.speed * dt);
    travel.pos.addScaledVector(travel.dir, step);
    travel.traveled += step;
    this._ahriQCheckHits(travel, q, 'out');
    if (travel.traveled >= travel.outDist - 1e-4) {
      travel.phase = 'back';
      travel.hitSet = new Set();
      travel.speed = lolRangeToWorld(q.returnSpeed || 60);
    }
  } else {
    travel.speed = Math.min(lolRangeToWorld(q.returnMaxSpeed || 2600), travel.speed + lolRangeToWorld(q.returnAccel || 1900) * dt);
    // 돌아올 때는 고정 지점이 아니라 "지금 이 순간의 아리"를 향해 호밍한다
    // (실제 정기 흡수 구슬처럼, 시전자가 그 사이 움직였으면 그 위치로 따라온다).
    const homePos = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    const toHome = new THREE.Vector3().subVectors(homePos, travel.pos);
    const dist = toHome.length();
    const step = Math.min(dist, travel.speed * dt);
    if (dist > 1e-4) travel.pos.addScaledVector(toHome.normalize(), step);
    this._ahriQCheckHits(travel, q, 'back');
    travel.elapsed = (travel.elapsed || 0) + dt;
    if (dist - step <= lolRangeToWorld(40) || travel.elapsed > 5) { this._ahriEndQTravel(); return; }
  }
  if (travel.orbMesh) travel.orbMesh.position.copy(travel.pos);
};

// W(여우불): 짧은 이동 속도 증가 후 여우불 3개를 소환한다. 여우불은 주변
// 적을 자동으로 추적/공격한다(별도 조준 불필요 - SelfAoe 타입).
CharacterController.prototype._ahriCastW = function(mouseWorldPoint, free = false) {
  if (isSilenced(this)) return;
  const w = this._champData().W;
  if (!this._payCost('W', free)) return;
  // PC 위키: 시전 시간 없음. 예전엔 W 클립 길이(약 1.33초) 동안 'ahriW' 액션으로 이동·평타·스킬을 모두 막고,
  // 진행 중이던 평타도 끊었다. 이제 행동을 막지 않고, 모션은 다른 행동이 없을 때만 보여 준다.
  const showClip = !this.currentActionKey && this.state !== STATE.MOVE;

  // 버그 수정(공식 설명 "이동 속도가 40% 증가했다가 2초에 걸쳐 원래대로
  // 돌아옵니다") - 기존에는 지속시간 내내 40%를 고정 유지하다 만료 순간
  // 뚝 끊기는 형태였다. decayLinear로 지속시간 동안 서서히 0%까지 줄어들게
  // 고쳤다.
  applyStatus(this, { id: 'ahriWSpeed', type: 'MS_BUFF', duration: w.moveSpeedDuration || 2, value: (w.moveSpeedPercent || 0) / 100, decayLinear: true });
  vfx.spawn('ahriFoxfireCast', this.root.position.clone());

  const lvl = Math.max(1, this.skillLevels.W || 1);
  const orbitRadius = lolRangeToWorld(w.orbitRadius || 150);
  const now = performance.now();
  // 버그 수정("W는 한 번 쓸 때마다 3대만 때려야 함"): 예전 구현은 여우불
  // 하나가 FlameDuration(2.5초) 동안 SecondaryDelay(0.4초)마다 계속
  // 재사격해서, 한 번의 W로 최대 18회(3개 x 최대 6발)까지 때릴 수 있었다.
  // 실제로는 위키/나무위키 모두 "여우불은 지속/광역 피해가 아니라 단일
  // 판정"이라고 명시하고, "한 번의 W로 단일 대상에게 줄 수 있는 최대
  // 피해량은 표기 수치의 1.8배"(=100%+40%+40%, 즉 여우불 3개가 각각
  // 정확히 한 번씩만 명중)라고 확인된다. 그래서 여우불마다 딱 한 번만
  // 발사하고 그 즉시 소멸하도록 바꾸고, 같은 캐스트에서 이미 한 번
  // 맞은 대상을 여우불들끼리 공유(hitTargetsThisCast)해서 2번째/3번째
  // 여우불이 같은 대상을 맞히면 RepeatDamageMod(40%)를 적용한다.
  const hitTargetsThisCast = new Set();
  for (let i = 0; i < 3; i++) this._ahri.foxfires.push(this._ahriSpawnFoxfire(i, orbitRadius, lvl, now, w, hitTargetsThisCast));
  debugSkillHit('Ahri W (여우불 소환)', this);

  if (showClip) {
    const clip = this.findAnimation('Spell2');
    this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
    const dur = clip ? clip.duration : 0.3;
    this._champTimeout(() => {
      if (!this.currentActionKey && this.state !== STATE.MOVE && this.currentClipKey === 'Spell2') this._returnToLocomotion();
    }, dur * 1000);
  }
};
CharacterController.prototype._ahriSpawnFoxfire = function(index, orbitRadius, lvl, startTime, w, hitTargetsThisCast) {
  // 버그 수정(레퍼런스 영상 ability_0103_W1.webm 픽셀 대조): 기존 핑크
  // (0xff5fd0)가 아니라 실측 시안 계열(#96fefa 부근).
  const mat = new THREE.SpriteMaterial({
    map: (typeof VFX_TEXTURES !== 'undefined' ? VFX_TEXTURES.hit : null),
    color: 0x7ff5ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.34);
  scene.add(sprite);
  return {
    sprite, angleOffset: (index / 3) * Math.PI * 2, orbitRadius, level: lvl,
    spawnedAt: startTime, priorityShotAt: startTime + (w.initialDelay || 0.25) * 1000,
    fallbackShotAt: startTime + (w.secondaryDelay || 0.4) * 1000,
    expiresAt: startTime + (w.flameDuration || 2.5) * 1000, fired: false, target: null,
    hitTargetsThisCast,
  };
};
CharacterController.prototype._ahriClearFoxfires = function() {
  for (const f of this._ahri.foxfires) { if (f && f.sprite) { scene.remove(f.sprite); if (f.sprite.material) f.sprite.material.dispose(); } }
  this._ahri.foxfires = [];
};
// 매 프레임 여우불 궤도 이동 + 단발 사격 판정. 위키 설명 그대로: "0.25초
// 후 우선순위 대상(매혹 걸린 적 > 챔피언 > 이 피해로 죽는 미니언 > 3초 내
// 마지막 평타 대상)을 조준하거나, 0.4초 후에는 그냥 사거리 내 가장 가까운
// 보이는 적을 조준"한다 - 이건 "0.25초마다/0.4초마다 반복 발사"가 아니라
// 여우불 하나당 "정확히 한 번" 발사하는 타이밍 규칙이다(나무위키: "여우불은
// 지속/광역 피해 판정이 아닌 단일 스킬 피해 판정"). 그래서 각 여우불은
// 발사하면 그 즉시 사라지고(최대 3회/캐스트), 우선순위 대상이 없으면
// 0.4초 시점에 가장 가까운 적으로 폴백, 그때도 없으면 FlameDuration 만료 시
// 아무 피해 없이 소멸(fizzle)한다.
CharacterController.prototype._ahriTickFoxfires = function(dt) {
  const fires = this._ahri.foxfires;
  if (!fires.length) return;
  const w = this._champData() && this._champData().W;
  if (!w) { this._ahriClearFoxfires(); return; }
  const now = performance.now();
  const ORBIT_ANGULAR_SPEED = 2.6; // 라디안/초 - 순수 시각 연출(실제 판정에는 영향 없음)
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i];
    if (f.fired || now >= f.expiresAt) { scene.remove(f.sprite); if (f.sprite.material) f.sprite.material.dispose(); fires.splice(i, 1); continue; }
    const t = (now - f.spawnedAt) / 1000;
    const angle = f.angleOffset + t * ORBIT_ANGULAR_SPEED;
    const pos = this.root.position.clone().add(new THREE.Vector3(Math.cos(angle) * f.orbitRadius, BASE_UNIT * 0.75, Math.sin(angle) * f.orbitRadius));
    f.sprite.position.copy(pos);
    // 우선순위 조준(0.25초) - 공식 설명 "매혹에 적중한 챔피언, 아리가
    // 공격한 적, 이외 챔피언 순으로 공격" 그대로: 1) 매혹 걸린 챔피언,
    // 2) 아리의 마지막 평타 대상(3초 이내), 3) 그 외 사거리 내 챔피언.
    // 사거리 수정(공식 wiki 확인: "Each missile of Fox-Fire has its own
    // shorter non-priority range" - 우선순위 탐색은 더 넓은 범위,
    // "비우선순위"(그냥 가장 가까운 적으로 대체하는 폴백)만 더 짧은
    // 범위를 쓴다는 뜻이다): 우선순위 탐색 3종(매혹/마지막 평타 대상/
    // 챔피언)은 bonusAcquisitionRange(725)를, 아래 폴백은 acquisitionRange
    // (550, 상대적으로 짧은 "비우선순위" 사거리)를 쓴다 - 단순히 725로
    // 전부 바꾸지 않고 실제로 두 사거리를 구분해서 각자 맞는 자리에 적용.
    if (now >= f.priorityShotAt && now < f.fallbackShotAt) {
      const priorityRange = lolRangeToWorld(w.bonusAcquisitionRange || w.acquisitionRange || 550);
      const inRange = (u) => u.hp > 0 && getHorizontalDistance(getWorldPosition(u), this.root.position) <= priorityRange;
      const charmed = getAllEnemyUnits().find((u) => inRange(u) && hasStatus(u, 'CHARM'));
      if (charmed) { this._ahriFireFoxfireAt(f, charmed); continue; }
      const lastAtk = this._ahri.lastAttackTarget;
      if (lastAtk && lastAtk.hp > 0 && (performance.now() - (this._ahri.lastAttackAt || 0)) <= 3000 && inRange(lastAtk)) {
        this._ahriFireFoxfireAt(f, lastAtk); continue;
      }
      const otherChamp = getAllEnemyUnits().find((u) => inRange(u) && u.isChampion);
      if (otherChamp) { this._ahriFireFoxfireAt(f, otherChamp); continue; }
    }
    // 폴백 조준(0.4초) - 위 우선순위 대상이 전혀 없으면 사거리 내 가장
    // 가까운 적(미니언 포함)으로 대체. 이건 "비우선순위" 탐색이라 더
    // 짧은 acquisitionRange(550)만 쓴다.
    if (now >= f.fallbackShotAt) {
      const acquireRange = lolRangeToWorld(w.acquisitionRange || 550);
      let best = null, bestD = Infinity;
      for (const u of getAllEnemyUnits()) {
        if (u.hp <= 0) continue;
        const d = getHorizontalDistance(getWorldPosition(u), this.root.position);
        if (d <= acquireRange && d < bestD) { bestD = d; best = u; }
      }
      if (best) { this._ahriFireFoxfireAt(f, best); continue; }
      // 사거리 내 대상이 전혀 없으면 이 프레임엔 대기 - FlameDuration 만료
      // 시 위 조건에서 자동으로 소멸 처리된다.
    }
  }
};
CharacterController.prototype._ahriFireFoxfireAt = function(f, target) {
  const w = this._champData() && this._champData().W;
  if (!w) return;
  f.fired = true;
  let raw = skillVal(w.damageByLevel, f.level) + (w.apRatio || 0) * (this.stats.abilityPower || 0);
  // 같은 W 캐스트에서 이미 다른 여우불이 맞힌 대상이면 RepeatDamageMod(40%)만 적용.
  if (f.hitTargetsThisCast.has(target)) raw *= (w.repeatDamageMod != null ? w.repeatDamageMod : 1);
  else f.hitTargetsThisCast.add(target);
  if (target.isMinion && target.maxHp > 0 && (target.hp / target.maxHp) <= (w.minionBonusThresholdPercent || 20) / 100) {
    raw *= (w.minionBonusMultiplier != null ? w.minionBonusMultiplier : 1);
  }
  raw *= this._ahriCharmVulnMultiplier(target);
  applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
  vfx.spawn('hit', getWorldPosition(target)?.clone() || f.sprite.position.clone(), undefined, { color: 0x7ff5ff });
  debugSkillHit('Ahri W (여우불 공격)', target);
};

// E(매혹): 입맞춤 투사체를 발사한다. 적중한 적에게 마법 피해를 입히고
// 매혹시킨다 - 매혹된 적은 진행 중이던 이동기를 즉시 중단하고(01_hit_
// detection.js의 applyStatus 호출부 참고), 지속시간 동안 아리 쪽으로
// 걸어온다(01_hit_detection.js tickStatusEffects의 CHARM 분기가 담당).
CharacterController.prototype._ahriCastE = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const e = this._champData().E;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('E', free)) return;
  // alwaysSnapFacing(ahri.bin AhriE) - 다른 방향별 캐스트(가렌 E 등)와 달리
  // 언제나 조준 방향으로 즉시 정면을 돌린다.
  this.faceDirectionInstant(dir);
  this._clearActionTimers();
  this.currentActionKey = 'ahriE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.E_CAST);

  // 실제 아리.glb에는 "Spell3" 단일 클립이 아니라 절대 방향별 4종만 존재한다
  // (Spell3_North/Spell3_south/Spell3_east/Spell3_west - champion_ability_
  // database.js ahri 항목 주석 참고). 정확한 축 대응을 확인할 참고 영상이
  // 없어 화면 기준 상/하/좌/우를 그대로 north/south/east/west에 대응시킨
  // 근사치를 쓴다 - 판정에는 전혀 영향 없는 순수 시각 표현이다.
  let clipName = dir.z > 0 ? 'Spell3_North' : 'Spell3_south';
  if (Math.abs(dir.x) > Math.abs(dir.z)) clipName = dir.x > 0 ? 'Spell3_east' : 'Spell3_west';

  // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 즉시 발사됐다. PC 위키 시전 시간 0.25초 뒤 발사, 그 전에 끊기면 취소.
  const __fire = () => {
  const worldRange = lolRangeToWorld(e.range);
  const halfWidth = lolRangeToWorld(e.width || 60) * 0.5;
  const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.65, 0));

  // 버그 수정(진짜 스킬샷으로 재구현 - "E가 시전 순간 미리 고른 대상에게
  // 유도되는 문제"): 예전 구현은 시전 순간 findFirstInLine()으로 대상을
  // 하나 미리 확정해 공용 ProjectileSystem에 target으로 넘겼는데, 이
  // 시스템은 target이 있으면 매 프레임 그 대상의 "현재" 위치를 계속
  // 추적한다(_currentAimPoint) - 즉 대상이 피하려고 옆으로 이동해도
  // 계속 따라가는 유도탄이 되어버렸다. 실제 매혹은 고정된 직선을 따라
  // 날아가다가 그 경로에 실제로 걸리는 첫 대상만 맞히는 스킬샷이어야
  // 한다. 공용 ProjectileSystem(다른 챔피언들도 함께 쓴다)을 건드리는
  // 대신, Q(qTravel)와 동일한 패턴으로 아리 전용 진행 상태(eTravel)를
  // 만들어 완전히 독립적으로 판정한다.
  //
  // 터널링 방지(요청 6)도 이 방식이 자연스럽게 해결한다: 매 프레임
  // "시전 시점 고정 원점(origin)에서 지금까지 누적으로 이동한 거리"
  // 전체를 findFirstInLine()로 다시 검사하므로, 이번 프레임에 아무리
  // 멀리 이동해도 그 사이 구간이 이미 검사 범위(0~누적거리)에 포함되어
  // 있어 지나친 대상을 놓치지 않는다(한 프레임짜리 "현재 위치 점 판정"
  // 만 쓰던 방식과 달리, 매번 시작점부터 다시 훑기 때문에 "이전 위치"를
  // 따로 저장할 필요조차 없다).
  const mat = new THREE.SpriteMaterial({
    color: 0xff5fc9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.4);
  sprite.position.copy(origin);
  scene.add(sprite);

  this._ahri.eTravel = {
    origin: origin.clone(), dir: dir.clone(), traveled: 0, maxDist: worldRange,
    speed: lolRangeToWorld(e.speed || 1550), halfWidth, sprite,
    lvl: Math.max(1, this.skillLevels.E || 1),
  };

  };
  const __castTimer = this._champTimeout(() => { if (this.currentActionKey === 'ahriE') { __fire(); if (this.currentActionKey === 'ahriE') { this.currentPhase = 'RECOVERY'; this.phaseCancelable = true; } } }, (e.castTimeSec != null ? e.castTimeSec : 0.25) * 1000);
  this._actionTimers.push(__castTimer);

  const clip = this.findAnimation(clipName) || this.findAnimation('Spell3_south');
  this.playFirstAvailable([clipName, 'Spell3_south'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  // 버그 수정: 예전엔 2.77초짜리 클립이 끝날 때까지 행동이 잠겼다. 원작은 시전 시간(0.25초)이 끝나면
  // 바로 이동/공격할 수 있다 - 잠금은 시전 시간 + 0.1초(클립이 그보다 짧으면 클립 길이)만.
  const dur = Math.min(clip ? clip.duration : 0.35, (e.castTimeSec != null ? e.castTimeSec : 0.25) + 0.1);
  const recTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'ahriE') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, dur * 1000);
  this._actionTimers.push(recTimer);
};

// E 전용 진행 상태 종료 - 스프라이트 제거 + material dispose. Q의
// _ahriEndQTravel과 동일한 패턴(리소스 누수 없이 정리하는 단일 진입점).
CharacterController.prototype._ahriEndETravel = function() {
  const travel = this._ahri.eTravel;
  if (travel && travel.sprite) {
    scene.remove(travel.sprite);
    if (travel.sprite.material) travel.sprite.material.dispose();
  }
  this._ahri.eTravel = null;
};
// 매 프레임 E 이동 + 판정. 고정된 시전 시점 원점/방향에서 지금까지
// 누적으로 이동한 거리 전체를 findFirstInLine()으로 매번 다시 검사한다 -
// 그 경로에 실제로 걸리는 "첫 번째" 대상만 맞고, 첫 대상이 맞는 즉시
// 종료된다(매혹은 단일 대상 스킬샷). 사거리 끝까지 아무도 안 걸리면
// 빗나감으로 종료.
CharacterController.prototype._ahriTickETravel = function(dt) {
  const travel = this._ahri.eTravel;
  if (!travel) return;
  const e = this._champData() && this._champData().E;
  if (!e) { this._ahriEndETravel(); return; }

  const step = Math.min(travel.speed * dt, travel.maxDist - travel.traveled);
  travel.traveled += Math.max(0, step);
  const pos = travel.origin.clone().addScaledVector(travel.dir, travel.traveled);
  if (travel.sprite) travel.sprite.position.copy(pos);

  const traveledLolRange = worldDistanceToLol(travel.traveled);
  const hitUnit = findFirstInLine(travel.origin, travel.dir, traveledLolRange, travel.halfWidth);
  if (hitUnit) {
    const raw = skillVal(e.damageByLevel, travel.lvl) + (e.apRatio || 0) * (this.stats.abilityPower || 0);
    const charmDuration = skillVal(e.charmDurationByLevel, travel.lvl);
    applyDamage(hitUnit, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    applyStatus(hitUnit, { id: 'ahriCharm', type: 'CHARM', duration: charmDuration, value: 1, source: this });
    // 기능 구현(기존엔 데이터 필드만 있고 실제 로직이 빠져있었음): 공식
    // 설명 "매혹에 적중된 대상은 3초간 아리의 스킬 피해를 20% 더 받는다"
    // - 이동 제어(CHARM)와 지속시간이 다른 완전히 별개의 디버프라(매혹
    // 자체는 레벨별 1.2~1.8초, 이 증폭은 레벨 무관 고정 3초) 별도 상태
    // 이펙트로 분리해서 건다. Q/W/R의 _ahriCharmVulnMultiplier()가 이
    // 상태를 확인해 20%를 곱한다(평타는 제외 - "스킬 피해"만). 참고: E
    // 자기 자신의 이 피해(raw)에는 방금 건 디버프가 적용되지 않는다 -
    // 디버프가 존재하기 전에 이미 피해 계산이 끝났기 때문에(원인->결과
    // 순서상 자연스러운 동작이며, 실제 게임에서도 매혹 자체의 피해가
    // 매혹으로 인한 증폭을 받는다는 근거는 없다).
    if ((e.charmSkillDamageAmpPercent || 0) > 0) applyStatus(hitUnit, {
      id: 'ahriCharmVuln', type: 'AHRI_CHARM_VULN',
      duration: e.charmSkillDamageAmpDuration,
      value: e.charmSkillDamageAmpPercent / 100, source: this,
    });
    // 이동기를 즉시 중단시킨다(Trait_Ranged_StopsFirstHit + 매혹 CC) - 이
    // 뷰어의 적(더미/미니언)은 대시/블링크가 없어 사실상 항상 no-op이지만,
    // 향후 실제 챔피언을 상대할 때를 대비해 진행 중인 액션이 있으면 취소한다.
    if (hitUnit.currentActionKey && typeof hitUnit._clearActionTimers === 'function') {
      hitUnit._clearActionTimers();
      hitUnit.currentActionKey = null; hitUnit.currentPhase = null;
    }
    vfx.spawn('ahriOrbHit', getWorldPosition(hitUnit)?.clone() || hitUnit.mesh.position.clone(), undefined, { color: 0xff5fc9 });
    debugSkillHit('Ahri E (매혹)', hitUnit);
    this._ahriEndETravel();
    return;
  }
  if (travel.traveled >= travel.maxDist - 1e-4) {
    debugSkillMiss('Ahri E', 'no target in line');
    this._ahriEndETravel();
  }
};

// 기본 3회(RMaxCasts) 사용 가능 - 첫 시전에서만 실제 마나/쿨다운을
// 지불하고, 이후 재시전(남은 rCharges가 있고 rReadyUntil 이전)은 완전히
// 무료다. 일반 쿨다운 게이트를 우회하는 부분은 character_controller.js
// castAbility()의 벡스 R 재시전 분기 바로 아래에 있다.
CharacterController.prototype._ahriCastR = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const r = this._champData().R;
  const isRecast = this._ahri.rCharges > 0 && performance.now() < this._ahri.rReadyUntil;
  // 28차(요청 "아리 궁 연타 안 되게"): PC 위키 - 재시전 사이 1초 고정 대기(스킬 가속 영향 없음). 예전엔 대기 없이 연달아 나갔다.
  const lockLeft = ((this._ahri.rNextAllowedAt || 0) - performance.now()) / 1000;
  if (isRecast && lockLeft > 0) return;
  if (isRecast) {
    this._ahri.rCharges -= 1;
  } else {
    if (!this._payCost('R', free)) return;
    this._ahri.rCharges = (r.maxCasts || 3) - 1;
    this._ahri.rReadyUntil = performance.now() + (r.recastWindow || 15) * 1000;
  }

  this._ahri.rNextAllowedAt = performance.now() + (r.recastLockoutSec != null ? r.recastLockoutSec : 1) * 1000;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  const cursorDist = mouseWorldPoint ? dir.length() : Infinity;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  this.faceDirectionInstant(dir);

  this._clearActionTimers();
  this.currentActionKey = 'ahriR'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.R_CAST);
  this.targetPos = null; this.isChasing = false;

  // 46차: 원작처럼 "지정한 위치로" 돌진한다(사거리 500 - PC 위키 Template:Data Ahri/Spirit Rush). 커서가 가까우면 짧게 간다.
  // 예전엔 커서 거리와 무관하게 항상 500을 돌진했다.
  const dashWorldDist = Math.min(lolRangeToWorld(r.dashDistance || 500), cursorDist);
  const dashWorldSpeed = lolRangeToWorld(r.dashSpeed || 1200);
  const dashDuration = Math.max(0.05, dashWorldDist / Math.max(0.01, dashWorldSpeed)); // 짧은 돌진도 최소 0.05초
  const startPos = this.root.position.clone();
  const endPos = startPos.clone().addScaledVector(dir, dashWorldDist);
  if (typeof constrainUnitPosition === 'function') constrainUnitPosition(this, endPos); // 45차: 맵 밖·지형 너머로 돌진하지 않게(이즈리얼 E와 같은 처리)

  this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.04, clampWhenFinished: true });
  vfx.spawn('r', startPos.clone());

  // 버그 수정("R 피해 대상 위치가 잘못되어 있음" - 공식 설명 "Ahri dashes to
  // the target location and then fires essence bolts to up to 3 nearby
  // visible enemies" 확인): 돌진 "이후" 도착 지점 근처의 적에게 쏘는
  // 스킬인데, 기존 구현은 돌진 "시작" 위치(startPos) 기준으로 대상을
  // 찾고 있었다 - 그 결과 시작 지점에 있던 적은 아직 돌진이 도착하기도
  // 전에 맞고, 반대로 도착 지점 근처의 진짜 대상에게는 피해가 들어가지
  // 않는 경우가 생겼다. 탐색/피해 기준점을 착지 위치(endPos)로 바꾼다.
  const acquireRange = lolRangeToWorld(r.acquisitionRange || 600);
  const inRange = getAllEnemyUnits()
    .map((u) => ({ u, d: getHorizontalDistance(getWorldPosition(u), endPos) }))
    .filter((c) => c.d <= acquireRange);
  const champCandidates = inRange.filter((c) => c.u.isChampion || (!c.u.isMinion && !c.u.isMonster && !c.u.isStructure));
  const otherCandidates = inRange.filter((c) => !champCandidates.includes(c));
  const maxTargets = r.maxTargetsPerCast || 3;
  const candidates = champCandidates.sort((a, b) => a.d - b.d)
    .concat(otherCandidates.sort((a, b) => a.d - b.d))
    .slice(0, maxTargets);
  const lvl = Math.max(1, this.skillLevels.R || 1);
  const baseRaw = skillVal(r.damageByLevel, lvl) + (r.apRatio || 0) * (this.stats.abilityPower || 0);
  // 버그 수정(레퍼런스 영상 ability_0103_R1.webm 픽셀 대조): 기존 보라색
  // (0xb98bff)가 아니라 실측 화이트에 가까운 밝은 블루(#f4fefe 자체 발광,
  // 궤적은 #7695c3 부근) - 밝은 하늘색으로 정정.
  for (const { u } of candidates) {
    const raw = baseRaw * this._ahriCharmVulnMultiplier(u);
    applyDamage(u, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
    vfx.spawn('ahriOrbHit', getWorldPosition(u)?.clone() || u.mesh.position.clone(), undefined, { color: 0x9fd7ff });
    debugSkillHit('Ahri R (정기 탄환)', u);
  }
  if (!candidates.length) debugSkillMiss('Ahri R', 'no target in range');

  this._ahri.rDash = { start: startPos, end: endPos, elapsed: 0, duration: dashDuration };
};
// 매 프레임 R 돌진 이동 - 요네/이즈리얼 R의 매 프레임 진행 패턴과 동일한
// 위치에서 호출된다(_ahriUpdate). 돌진이 끝나면 남은 재사용 횟수가
// 있는지에 따라 대기 포즈(Spell4_Idle)로 들어가거나 즉시 이동/캐스트를
// 재개한다.
CharacterController.prototype._ahriTickRDash = function(dt) {
  const dash = this._ahri.rDash;
  if (!dash) return;
  dash.elapsed += dt;
  const t = Math.min(1, dash.elapsed / dash.duration);
  this.root.position.lerpVectors(dash.start, dash.end, t);
  if (t < 1) return;
  this._ahri.rDash = null;
  if (this.currentActionKey !== 'ahriR') return;
  const hasCharge = this._ahri.rCharges > 0 && performance.now() < this._ahri.rReadyUntil;
  if (hasCharge) {
    // 재시전 대기 상태 - currentActionKey는 그대로 둬서(재입력 시 castAbility의
    // 아리 R 재시전 분기가 곧바로 다시 _ahriCastR를 부른다) 다음 R 입력을
    // 즉시 이어받되, currentPhase는 비워 이동/평타 등 다른 행동은 허용한다.
    this.playFirstAvailable(['Spell4_Idle'], { loop: THREE.LoopRepeat, fade: 0.1 });
    this.currentPhase = null;
  } else {
    this.playFirstAvailable(['Spell4_toIdle', 'Spell4_toRun'], { loop: THREE.LoopOnce, fade: 0.15, clampWhenFinished: true });
    this.currentActionKey = null; this.currentPhase = null;
    this._resumeAfterAction();
  }
};

// 챔피언 전용 매 프레임 훅 - character_controller.js update() 맨 끝에서
// 챔피언과 무관하게 항상 호출된다(this._ezrealUpdate(dt)와 동일한 위치/관례).
CharacterController.prototype._ahriUpdate = function(dt) {
  if (this.championId !== 'ahri' || !this._ahri) return;
  this._ahriTickQTravel(dt);
  this._ahriTickETravel(dt);
  this._ahriTickFoxfires(dt);
  this._ahriTickRDash(dt);
  // R 재시전 창 만료 - 아직 대기 포즈에 머물러 있다면 자동으로 빠져나온다.
  if (this._ahri.rCharges > 0 && performance.now() > this._ahri.rReadyUntil) {
    this._ahri.rCharges = 0;
    if (this.currentActionKey === 'ahriR' && !this._ahri.rDash) {
      this.playFirstAvailable(['Spell4_toIdle', 'Spell4_toRun'], { loop: THREE.LoopOnce, fade: 0.15, clampWhenFinished: true });
      this.currentActionKey = null; this.currentPhase = null;
      this._resumeAfterAction();
    }
  }
};
