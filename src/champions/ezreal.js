/* ============================================================
   이즈리얼(Ezreal) 전투 로직
   ------------------------------------------------------------
   다른 챔피언들(야스오/요네/벡스 등)과 동일한 패턴 - CharacterController.
   prototype 확장으로 챔피언 전용 메서드를 분리하고, character_controller.js
   의 _castQ/_castW/_castE/_dispatchCast 최상단에서 championId === 'ezreal'
   이면 이 파일의 커스텀 캐스트 함수로 곧장 위임한다(공용 Controller 코드를
   직접 뒤섞지 않는다는 이 프로젝트의 원칙 그대로).

   이즈리얼은 이 뷰어의 기존 근접 챔피언들과 달리 전부 "마우스 방향 직선
   스킬샷" 타입이라, 방향별(qLeft/qRight/qForward/qBack) 캐스트 클립
   분기가 필요한 일반 폴백 경로 대신 처음부터 끝까지 전용 함수로 작성했다.

   참고: CHAMPION_DATA.ezreal(champion_data.js)는 사용자가 제공한 실제
   게임 데이터 파일(ezreal.bin/ezreal.bin.json)로 검증한 수치다 - 데이터
   해석 방식(배열 인덱싱 규칙 등)은 그 파일 상단 주석 참고.
   ============================================================ */

// 패시브(치솟는 마력): Q/W/E/R 스킬이 적을 적중시킬 때마다 공격속도 중첩을
// 얻는다(최대 5중첩, 적중마다 지속시간 갱신). 상태이상 시스템의 범용
// AS_BUFF 타입 하나(단일 id)로 표현해서, 매 프레임 이미 돌고 있는
// this.stats.bonusAttackSpeedPercent = getAttackSpeedBuffPercent(this)가
// 자동으로 반영한다(새 버프 시스템을 만들지 않고 기존 경로 재사용).
CharacterController.prototype._ezrealGainPassiveStack = function() {
  const p = this._champData().passive;
  const cur = getStatus(this, 'ezrealRSF');
  const stacks = Math.min(p.maxStacks, (cur && cur.stacks || 0) + 1);
  const rec = applyStatus(this, { id: 'ezrealRSF', type: 'AS_BUFF', duration: p.duration, value: stacks * (p.perStackPercent / 100) });
  if (rec) rec.stacks = stacks;
};

// Q(신비의 사격): 직선 스킬샷, 처음 적중한 대상에게 물리 피해 + 다른 세
// 스킬의 재사용 대기시간 1초 감소.
CharacterController.prototype._ezrealCastQ = function(mouseWorldPoint, free = false) {
  if (isSilenced(this)) return;
  const q = this._champData().Q;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('Q', free)) return;
  this.faceDirectionInstant(dir); const __aim = this._captureAim(mouseWorldPoint); // 96차: 시전 시간 중 점멸하면 새 위치 → 원래 조준점
  this._clearActionTimers();
  this.currentActionKey = 'ezrealQ'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.Q_CAST);

  // 발사(시전 시간 끝) 뒤 남은 모션은 이동으로 끊을 수 있는 후딜(RECOVERY)이다 - 기다리던 이동이 곧바로 이어진다.
  // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 즉시 발사됐다. PC 위키 시전 시간 0.25초 뒤 발사하고, 그 전에 다른 행동으로 끊기면 원작처럼 취소된다.
  const __fire = () => { __aim.apply(dir);
  const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
  const halfWidth = lolRangeToWorld(q.width || 60) * 0.5;
  // 정정(사용자가 올려준 실제 CommunityDragon Q 텍스처 적용): 기존 단색
  // 원 플레이스홀더('q' 케이스) 대신, 실제 텍스처 기반 궤적 이펙트
  // ('ezrealQ' - _ezrealQTrail, nilah_vfx_assets_and_runtime.js)를 쓴다.
  // 45차: 피할 수 있는 직선 스킬샷 - 궤적은 투사체를 따라가다 맞거나 사거리 끝에서 사라진다.
  const worldRange = lolRangeToWorld(q.range);

  const lvl = Math.max(1, this.skillLevels.Q || 1);
  const raw = skillVal(q.damageByLevel, lvl) + (q.totalAdRatio || 0) * this.stats.attackDamage + (q.apRatio || 0) * (this.stats.abilityPower || 0);
  const qProj = projectiles.spawn({
    from: origin, speed: lolRangeToWorld(q.missileSpeed || 2000), damage: 0,
    color: 0x8fe3ff, realmId: this.realmId,
    line: { dir, maxDist: worldRange, halfWidth, onMiss: () => debugSkillMiss('Ezreal Q', 'no target in line') },
    onHit: (t) => {
      applyDamage(t, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
      // 91차: 원작 Q는 적중 시 효과를 적용하고 주문 검(광휘의 검 계열)도 발동한다(룬의 평타 효과는 제외).
      if (typeof itemOnBasicAttackHit === 'function' && t.hp > 0) itemOnBasicAttackHit(this, t, false, { fromAbility: true, allowSpellblade: true });
      vfx.spawn('ezrealQHit', getWorldPosition(t)?.clone() || t.mesh.position.clone());
      debugSkillHit('Ezreal Q', t);
      this._ezrealGainPassiveStack();
      // Q가 W 표식 대상을 맞히면 표식이 함께 터진다(스킬로 터뜨린 경우 - 이 Q의 마나 소모량 + 60 환불).
      this._ezrealDetonateMark(t, 'ability', skillVal(q.mana, lvl));
      if (q.cdrOnHitSeconds) {
        // 나무위키 이즈리얼 문서: "신비한 화살 자체도 효과를 받으니" - Q 적중
        // 시 W/E/R뿐 아니라 Q 자신의 남은 재사용 대기시간도 함께 감소한다.
        this.cooldowns.Q = Math.max(0, this.cooldowns.Q - q.cdrOnHitSeconds);
        this.cooldowns.W = Math.max(0, this.cooldowns.W - q.cdrOnHitSeconds);
        this.cooldowns.E = Math.max(0, this.cooldowns.E - q.cdrOnHitSeconds);
        this.cooldowns.R = Math.max(0, this.cooldowns.R - q.cdrOnHitSeconds);
        updateBars(this);
      }
    },
  });
  vfx.spawn('ezrealQ', this.root.position.clone(), dir, { range: worldRange, speed: lolRangeToWorld(q.missileSpeed || 2000), follow: qProj });

  };
  const __castTimer = this._champTimeout(() => { if (this.currentActionKey === 'ezrealQ') { __fire(); if (this.currentActionKey === 'ezrealQ') { this.currentPhase = 'RECOVERY'; this.phaseCancelable = true; if (this.pendingMove || this.targetPos) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); } } } }, (q.castTimeSec != null ? q.castTimeSec : 0.25) * 1000); // 28차: W와 같이 이동 중이면 발사 직후 이동 재개
  this._actionTimers.push(__castTimer);

  const clip = this.findAnimation('Spell1');
  this.playFirstAvailable(['Spell1'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const dur = clip ? clip.duration : 0.35;
  const recTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'ezrealQ') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, dur * 1000);
  this._actionTimers.push(recTimer);
};

// W(정수의 흐름): 직선으로 정수 구체를 발사한다. 챔피언·에픽 몬스터·포탑·
// 억제기·넥서스에만 반응하고 미니언/일반 몬스터는 그냥 통과한다(그래서
// 전용 타겟 탐색 함수 _ezrealWCanHit 필터를 쓴다 - 일반 findFirstInLine은
// 모든 유닛을 대상으로 하므로 그대로 쓰면 안 된다). 처음 맞은 대상에게는
// 즉시 피해 없이 4초 표식만 남기고, 그 표식은 이후 기본 공격이나 다른
// 스킬(Q/E/R)이 적중했을 때 폭발하며 실제 피해를 준다 - _ezrealDetonateMark
// 참고. (정정: 예전 버전은 이 스킬이 즉시 피해를 주는 것으로 되어 있었는데,
// 나무위키/커뮤니티드래곤 실제 명세와 다른 잘못된 구현이었다.)
CharacterController.prototype._ezrealCastW = function(mouseWorldPoint, free = false) {
  if (isSilenced(this)) return;
  const w = this._champData().W;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('W', free)) return;
  this.faceDirectionInstant(dir); const __aim = this._captureAim(mouseWorldPoint); // 96차: 시전 시간 중 점멸하면 새 위치 → 원래 조준점
  this._clearActionTimers();
  this.currentActionKey = 'ezrealW'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.W_CAST);

  // 버그 수정(타이밍 측정으로 발견): 예전엔 시전 즉시 발사됐다. PC 위키 시전 시간 0.25초 뒤 발사하고, 그 전에 다른 행동으로 끊기면 원작처럼 취소된다.
  const __fire = () => { __aim.apply(dir);
  const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
  const halfWidth = lolRangeToWorld(w.width || 60) * 0.5;
  // 정정(레퍼런스 영상 ability_0081_W1.webm 프레임 대조): 실제 정수의 흐름
  // 구체는 하늘색/시안 계열 광선이다(피격 지점에 남는 표식 링만 골드색 -
  // 아래 표식 vfx는 그대로 골드 유지). 예전엔 이 둘이 뒤바뀌어서 구체
  // 자체가 골드로 나가고 있었다.
  vfx.spawn('w', origin.clone().addScaledVector(dir, 1.0), dir);

  // 45차: 피할 수 있는 직선 스킬샷 - 미니언 등은 통과하고 챔피언·구조물에만 반응(_ezrealWCanHit). 속도는 데이터(위키 1700).
  projectiles.spawn({
    from: origin, speed: lolRangeToWorld(w.missileSpeed || 1700), damage: 0,
    color: 0xbdf6ff, realmId: this.realmId,
    line: { dir, maxDist: lolRangeToWorld(w.range), halfWidth, filter: (u) => this._ezrealWCanHit(u),
      onMiss: () => debugSkillMiss('Ezreal W', 'no valid target in line (챔피언/포탑/억제기/넥서스만 반응)') },
    onHit: (t) => {
      // 표식만 남긴다 - 이 시점엔 피해가 없다(폭발은 _ezrealDetonateMark에서).
      // vfx 시스템엔 별도 'mark' 이펙트가 없으므로 W 고유 색상의 'hit'
      // 버스트로 대체해 "표식이 붙었다"는 것을 시각적으로 구분한다.
      vfx.spawn('hit', getWorldPosition(t)?.clone() || t.mesh.position.clone(), undefined, { color: 0xffd27a });
      debugSkillHit('Ezreal W (mark)', t);
      this._ezrealGainPassiveStack();
      this._ezreal.markTarget = t;
      this._ezreal.markExpiresAt = performance.now() + (w.markDuration || 4) * 1000;
      this._ezreal.markWLevel = Math.max(1, this.skillLevels.W || 1);
    },
  });

  };
  // 28차(요청 "W 쓸 때 멈출 때가 있음"): 발사 뒤 남은 모션은 후딜이라, 이동 중에 썼거나 시전 중 이동 명령을 넣었으면
  // 원작처럼 발사 직후 곧바로 이동을 이어 간다. 예전엔 RECOVERY로만 바꾸고 클립이 끝날 때까지 서 있었다.
  const __castTimer = this._champTimeout(() => { if (this.currentActionKey === 'ezrealW') { __fire(); if (this.currentActionKey === 'ezrealW') { this.currentPhase = 'RECOVERY'; this.phaseCancelable = true; if (this.pendingMove || this.targetPos) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); } } } }, (w.castTimeSec != null ? w.castTimeSec : 0.25) * 1000);
  this._actionTimers.push(__castTimer);

  const clip = this.findAnimation('Spell2');
  this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const dur = clip ? clip.duration : 0.4;
  const recTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'ezrealW') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, dur * 1000);
  this._actionTimers.push(recTimer);
};

// W가 반응하는 대상 - 원작 정수의 흐름처럼 미니언/일반 몬스터는 통과하고 챔피언(이 뷰어에선 더미)·포탑·억제기·넥서스에만
// 반응한다(에픽 몬스터는 이 뷰어에 별도 시스템이 없어 제외). 직선 스킬샷 투사체의 filter로 쓴다(45차).
CharacterController.prototype._ezrealWCanHit = function(u) {
  return !!u && !u.isMinion && !!(u.isChampion || u.isTurret || u.isInhibitor || u.isNexus);
};

// W 표식 폭발. by: 'attack'(기본 공격) | 'ability'(Q/E/R). 스킬로 터뜨렸을
// 때만(abilityManaCost가 주어졌을 때만) 그 스킬의 마나 소모량 + 60을
// 환불한다(나무위키: "스킬로 터뜨릴 경우 해당 스킬로 소모한 마나 + 60만큼
// 마나를 회복한다" - 기본 공격 적중에는 마나 환불이 없다).
CharacterController.prototype._ezrealDetonateMark = function(target, by, abilityManaCost) {
  if (!this._ezreal || !this._ezreal.markTarget || this._ezreal.markTarget !== target) return false;
  if (performance.now() > this._ezreal.markExpiresAt) { this._ezreal.markTarget = null; this._ezreal.markExpiresAt = 0; return false; }
  const w = this._champData().W;
  const lvl = this._ezreal.markWLevel || Math.max(1, this.skillLevels.W || 1);
  const raw = skillVal(w.damageByLevel, lvl) + (w.bonusAdRatio || 0) * this._getBonusAD() + (w.apRatio || 0) * (this.stats.abilityPower || 0);
  // 91차: 구조물에 붙은 표식도 피해를 준다(원작 - 포탑 철거용). 예전엔 공용 진입점이 스킬 피해라며 막았다.
  const onStructure = !!(target.isTurret || target.isInhibitor || target.isNexus);
  applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this, canDamageStructures: onStructure });
  vfx.spawn('hit', getWorldPosition(target)?.clone() || target.mesh.position.clone());
  debugSkillHit('Ezreal W (detonate)', target, { by });
  if (by === 'ability' && abilityManaCost != null) {
    this.mp = Math.min(this.maxMp, this.mp + abilityManaCost + (w.manaRefundOnDetonate || 60));
    updateBars(this);
  }
  this._ezreal.markTarget = null;
  this._ezreal.markExpiresAt = 0;
  return true;
};

// E(비전 이동): 지정 위치로 즉시 블링크 후, 가장 가까운 적(정기 방출 표식
// 대상 우선)에게 유도탄을 쏴 마법 피해를 입힌다. 블링크 방향에 따라
// Spell3_0/90/-90/180 클립 중 하나를 고른다(방향 판정은 faceDirectionInstant로
// 새로 정면을 돌리기 *전*, 기존 정면 기준 상대 방향 - character_controller.js
// 일반 _castQ의 qLeft/qRight/qForward/qBack 판정과 동일한 관례).
CharacterController.prototype._ezrealCastE = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const e = this._champData().E;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  const rawDist = mouseWorldPoint ? dir.length() : 0; // 45차: 커서가 없으면 최대 사거리(예전엔 단위 벡터 길이 1 = 아주 짧은 거리)
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('E', free)) return;

  const localDir = dir.clone().applyQuaternion(this.root.quaternion.clone().invert());
  let clipName = 'Spell3_0';
  if (Math.abs(localDir.x) > Math.abs(localDir.z)) clipName = localDir.x > 0 ? 'Spell3_90' : 'Spell3_-90';
  else if (localDir.z < 0) clipName = 'Spell3_180';

  const worldRange = lolRangeToWorld(e.range);
  const dist = Math.min(rawDist || worldRange, worldRange);
  const blinkOffset = dir.clone().multiplyScalar(dist); // 시전 중 밀려나도 시전 끝 위치 기준으로 순간이동(PC 위키)

  this._clearActionTimers();
  this.currentActionKey = 'ezrealE'; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  this.setState(STATE.E_CAST);
  this.targetPos = null; this.isChasing = false;

  this.faceDirectionInstant(dir);
  this.playFirstAvailable([clipName, 'Spell3_0'], { loop: THREE.LoopOnce, fade: 0.04, clampWhenFinished: true });
  // 버그 수정: 예전엔 즉시 순간이동했다 - PC 위키 시전 시간 0.25초 뒤 순간이동 + 유도탄.
  const __fire = () => {
  const blinkPos = this.root.position.clone().add(blinkOffset);
  // 28차: 벽·맵 밖을 찍으면 그 안으로 들어가 갇히지 않게 가장 가까운 이동 가능 지점으로 당긴다(죽음의 세계 경계 포함).
  if (typeof constrainUnitPosition === 'function') constrainUnitPosition(this, blinkPos);
  this.root.position.copy(blinkPos);
  vfx.spawn('e', blinkPos.clone());

  const boltRange = lolRangeToWorld(e.boltRange || (e.range * 2));
  let best = null; let bestScore = Infinity;
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0) continue;
    const d = getHorizontalDistance(getWorldPosition(u), this.root.position);
    if (d > boltRange) continue;
    const prioritized = this._ezreal.markTarget === u && performance.now() < this._ezreal.markExpiresAt;
    const score = prioritized ? d - 1e6 : d;
    if (score < bestScore) { bestScore = score; best = u; }
  }
  if (best) {
    const lvl = Math.max(1, this.skillLevels.E || 1);
    const raw = skillVal(e.damageByLevel, lvl) + (e.bonusAdRatio || 0) * this._getBonusAD() + (e.apRatio || 0) * (this.stats.abilityPower || 0);
    const from = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    projectiles.spawn({
      from, target: best, speed: lolRangeToWorld(2000), damage: 0, // 80차: 유도탄 속도 2600 → 2000(PC 위키)
      // 정정(레퍼런스 영상 ability_0081_E1.webm 프레임 대조): 실제 비전
      // 이동 유도탄은 금색/노란색 화살이다(예전엔 시안색으로 잘못 나갔음 -
      // W와 색이 서로 뒤바뀌어 있던 것과 같은 원인으로 보인다).
      color: 0xfff08a, realmId: this.realmId,
      onHit: (t) => {
        applyDamage(t, { rawDamage: raw, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, source: this });
        vfx.spawn('hit', getWorldPosition(t)?.clone() || t.mesh.position.clone());
        debugSkillHit('Ezreal E', t);
        this._ezrealGainPassiveStack();
        // E 유도탄이 W 표식 대상을 맞히면 표식도 함께 터진다(이 E의 마나 소모량 + 60 환불).
        this._ezrealDetonateMark(t, 'ability', e.mana);
      },
    });
  } else {
    debugSkillMiss('Ezreal E', 'no target in bolt range');
  }

  };
  const __castTimer = this._champTimeout(() => { if (this.currentActionKey === 'ezrealE') __fire(); }, (e.castTimeSec != null ? e.castTimeSec : 0.25) * 1000);
  this._actionTimers.push(__castTimer);

  const clip = this.findAnimation(clipName) || this.findAnimation('Spell3_0');
  const dur = clip ? clip.duration : 0.5;
  const recTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'ezrealE') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, dur * 1000);
  this._actionTimers.push(recTimer);
};

// R(정조준 사격): 집중 시전 후 맵을 가로지르는 광선을 발사, 경로의 모든
// 적을 관통(요네 R/야스오 Q3 회오리와 동일한 "매 프레임 진행" 패턴 재사용 -
// _ezrealTickRTravel/_ezrealUpdate 참고). 맞을수록 대상별 피해가 줄어들고
// 미니언/몬스터는 추가로 감소한다.
CharacterController.prototype._ezrealCastR = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  const r = this._champData().R;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  if (!this._payCost('R', free)) return;
  this.faceDirectionInstant(dir); const __aim = this._captureAim(mouseWorldPoint); // 96차: 시전 시간 중 점멸하면 새 위치 → 원래 조준점
  this._clearActionTimers();
  this.currentActionKey = 'ezrealR'; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.setState(STATE.R_CAST);

  const clip = this.findAnimation('Spell4');
  this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  const castTime = r.castTime || (clip ? clip.duration : 1);
  // 정정(사용자 확인 - 레퍼런스 영상 ability_0081_R1.webm 캐스팅 초반):
  // 정조준 일격 시전 중에는 손 앞에 푸른빛 에너지로 된 활 모양 이펙트가
  // 잠깐 나타났다가 광선이 발사되는 순간 사라진다. GLB에는 이 활에
  // 해당하는 별도 메시/본이 없어(순수 VFX 파티클) 이즈리얼 전용 절차적
  // 지오메트리로 재현한다 - _ezrealRBow, nilah_vfx_assets_and_runtime.js.
  vfx.spawn('ezrealRBow', this.root.position.clone(), dir, { duration: castTime });

  const fireTimer = this._champTimeout(() => { __aim.apply(dir);
    if (this.currentActionKey !== 'ezrealR') return;
    this.currentPhase = 'ACTIVE';
    const origin = this.root.position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    // 정정(레퍼런스 영상 ability_0081_R1.webm 프레임 대조): 발사 지점에
    // 챔피언 공용 궁극기 이펙트(_ultimateBurst - 자주색 원, 0xc9a4ff)만
    // 뜨고 있었는데, 실제 정조준 일격은 화면을 가로지르는 금색 광선이라
    // 색부터 잘못됐고(자주색은 다른 챔피언 궁 전용), 더 중요하게는 광선이
    // 실제로 진행하는 _ezrealTickRTravel 쪽에 이동 이펙트가 전혀 없어서
    // "발사 지점에서 원 하나 반짝이고 끝"으로 보였다 - 실제로는 광선
    // 자체가 눈에 보이며 화면을 가로질러야 한다. 발사 순간 금색 섬광은
    // 그대로 두되('hit' 재사용, 골드 컬러), 진행 궤적은 아래
    // _ezrealTickRTravel에서 매 틱 금색 잔상을 따라 찍어 시각화한다.
    vfx.spawn('hit', origin.clone(), undefined, { color: 0xfff08a });
    this._ezreal.rTravel = {
      dir: dir.clone(), pos: origin.clone(),
      maxDist: lolRangeToWorld(r.range || 20000),
      halfWidth: lolRangeToWorld(r.width || 160) * 0.5,
      speed: lolRangeToWorld(r.missileSpeed || 2000), // PC 위키: 속도 2000(예전 5000)
      traveled: 0, hitSet: new Set(), hitCount: 0, vfxAccum: 0,
    };
  }, castTime * 1000);
  this._actionTimers.push(fireTimer);

  const doneTimer = this._champTimeout(() => {
    if (this.currentActionKey === 'ezrealR') { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, (castTime + 0.15) * 1000);
  this._actionTimers.push(doneTimer);
};

// 매 프레임 R 광선 진행 - character_controller.js update()에서 무조건
// 호출된다(다른 챔피언일 때는 이 함수 첫 줄에서 즉시 return - 벡스 R
// 업데이트와 동일한 패턴).
CharacterController.prototype._ezrealTickRTravel = function(dt) {
  const travel = this._ezreal && this._ezreal.rTravel;
  if (!travel) return;
  const remaining = Math.max(0, travel.maxDist - travel.traveled);
  const step = Math.min(remaining, Math.max(0, travel.speed * dt));
  const segFrom = travel.pos.clone(); // 94차: 연속 판정(이번 프레임 구간)
  travel.pos.addScaledVector(travel.dir, step);
  travel.traveled += step;

  // 진행 중인 광선 궤적을 눈에 보이게 표시한다(레퍼런스 영상 - 화면을
  // 가로지르는 금색 궤적). 매 프레임 찍으면 너무 잦고 무거우므로 약
  // 0.05초 간격으로만 잔상을 남긴다.
  travel.vfxAccum = (travel.vfxAccum || 0) + dt;
  if (travel.vfxAccum >= 0.05) {
    travel.vfxAccum = 0;
    vfx.spawn('hit', travel.pos.clone(), undefined, { color: 0xfff08a });
  }

  const r = this._champData().R;
  const lvl = Math.max(1, this.skillLevels.R || 1);
  const baseDmg = skillVal(r.damageByLevel, lvl) + (r.bonusAdRatio || 0) * this._getBonusAD() + (r.apRatio || 0) * (this.stats.abilityPower || 0);
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || travel.hitSet.has(u)) continue;
    if (isInSweptCircle(u, segFrom, travel.pos, travel.halfWidth)) {
      travel.hitSet.add(u);
      // PC 판 정조준 일격은 맞힌 수에 따른 감소가 없다(미니언/일반 몬스터만 50%) - 예전 "대상마다 10% 감소"는 제거.
      travel.hitCount++;
      let dmg = baseDmg;
      // 버그 수정: u.isMonster는 이 뷰어에서 포탑/억제기/넥서스에도 true로
      // 설정돼 있어(구조물 자체를 표시하는 용도로 겹쳐 쓰임 - turret_system.js
      // 참고), 그대로 쓰면 정조준 일격이 구조물에도 미니언 감소 배율을
      // 잘못 적용하게 된다. 실제 정조준 일격은 미니언/일반 몬스터에게만
      // 감소된 피해를 주고 포탑/억제기/넥서스는 챔피언과 동일하게 정상
      // 피해를 받아야 하므로, 이 뷰어에 별도 몬스터 시스템이 없는 만큼
      // isMinion만으로 판정한다.
      if (u.isMinion) dmg *= (r.minionDamageMultiplier != null ? r.minionDamageMultiplier : 1);
      applyDamage(u, { isUltimate: true, rawDamage: dmg, damageType: r.damageType === 'MAGICAL' ? DAMAGE_TYPE.MAGICAL : DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, source: this });
      vfx.spawn('hit', getWorldPosition(u)?.clone() || u.mesh.position.clone());
      debugSkillHit('Ezreal R', u, { dmg: dmg.toFixed(1) });
      this._ezrealGainPassiveStack();
      // R이 W 표식 대상을 맞히면 표식도 함께 터진다(이 R의 마나 소모량 + 60 환불).
      this._ezrealDetonateMark(u, 'ability', r.mana);
    }
  }
  if (travel.traveled >= travel.maxDist - 1e-4) this._ezreal.rTravel = null;
};

// 챔피언 전용 매 프레임 훅 - character_controller.js update() 맨 끝에서
// 챔피언과 무관하게 항상 호출된다(this._vexUpdateR(dt)와 동일한 위치/관례).
CharacterController.prototype._ezrealUpdate = function(dt) {
  if (this.championId !== 'ezreal' || !this._ezreal) return;
  this._ezrealTickRTravel(dt);
  if (this._ezreal.markTarget && performance.now() > this._ezreal.markExpiresAt) {
    this._ezreal.markTarget = null; this._ezreal.markExpiresAt = 0;
  }
};
