/* ============================================================
   요네(Yone) 전용 CharacterController 확장
   ------------------------------------------------------------
   출처: LoL 공식 위키(wiki.leagueoflegends.com/en-us/Yone, 최종 수정
   V26.10 시점 확인) + 나무위키(요네 문서) 수치를 그대로 반영한다.
   창작(임의 수치/임의 메커니즘 추가) 대신 고증을 우선한다는 원칙에
   따라, 공개 자료에 정확한 수치가 없는 부분(예: W 레벨별 미니언/몬스터
   피해 하한선의 2~17레벨 중간 계단값, R 세부 판정 타이밍의 프레임 단위
   보정)은 임의로 지어내지 않고 위키가 실제로 공개한 두 끝 값(1레벨/
   18레벨, 또는 시작/최대 공속 지점)만 사용해 선형 보간하거나, 끝단
   값만 사용한다 - 각 지점에 주석으로 근사/보간임을 명시한다.

   야스오와 "완전히 동일하다"고 나무위키가 명시한 부분(치명타 계수,
   공격속도 비례 쿨감 1.67%당 1%)은 그 관계식을 재사용하되, 요네에게
   없는 요소(이동 누적형 Flow 보호막 패시브)는 이식하지 않는다.
   ============================================================ */

/* ---------------- 공통 유틸 ---------------- */

// 스킬레벨 배열에서 값을 꺼낸다(야스오 파일의 _yasuoLevelValue와 동일 개념 -
// 파일 분리 후에도 서로 다른 프로토타입 메서드라 이름 충돌 없음).
CharacterController.prototype._yoneLevelValue = function(arr, lvl) {
  if (!Array.isArray(arr)) return arr;
  return arr[Math.max(1, Math.min(arr.length, lvl)) - 1];
};

// 공식 위키가 "공격 속도 비례"라고만 밝히고 정확한 곡선을 공개하지
// 않은 4개 수치(Q/W의 쿨다운·시전시간)를 위해, 나무위키가 명시적으로
// 확인해준 유일한 정량 관계(필멸의 검: 공속 1.67%당 쿨다운 1% 감소)를
// 기준점으로 삼아 하나의 "공속 초과분 -> 감소 비율" 곡선을 공유한다.
// REF_CAP_BONUS_AS는 그 관계식으로 필멸의 검 쿨다운이 위키에 공개된
// 하한(4 -> 1.33, 66.75% 감소)에 도달하는 보너스 공격속도(fraction)를
// 역산한 값이다: 66.75 * 1.67 = 111.5% 보너스 공격속도.
// 다른 3개(Q 시전시간, W 쿨다운/시전시간)는 정확한 관계식이 공개돼
// 있지 않으므로, 같은 기준점(REF_CAP_BONUS_AS)에서 각자의 공개된
// 하한에 도달하도록 선형 보간한다 - "정확한 공식"이 아니라 "공개된
// 양 끝 값을 유지하는 보간"임을 분명히 한다.
const YONE_REF_CAP_BONUS_AS = 1.115;
CharacterController.prototype._yoneASReduction = function(maxReductionFraction) {
  const bonusAS = this._totalBonusAttackSpeed(); // 레벨 성장분 포함(원작의 "추가 공격 속도")
  return Math.min(maxReductionFraction, (bonusAS / YONE_REF_CAP_BONUS_AS) * maxReductionFraction);
};
// 필멸의 검(Q): Cooldown 4 -> 1.33, Cast Time 0.35 -> 0.175 (공식 위키)
// 버그 수정: Q는 champion_data 주석에 적힌 요네.bin 관계식(추가 공속 1%당 쿨다운 0.6%,
// 최대 66.67% / 시전 시간 0.41667%, 최대 50%)이 있는데도 "양 끝값 보간"을 쓰고 있었다.
// 추가 공속에는 레벨 성장분도 포함한다(_totalBonusAttackSpeed - 야스오와 같은 식).
CharacterController.prototype._yoneQCooldown = function() {
  const q = this._champData().Q;
  const bonusPct = this._totalBonusAttackSpeed() * 100;
  return this._yoneLevelValue(q.cooldown, this.skillLevels.Q || 1) * (1 - Math.min(0.6667, bonusPct * 0.6 / 100));
};
CharacterController.prototype._yoneQCastTime = function() {
  const q = this._champData().Q;
  const bonusPct = this._totalBonusAttackSpeed() * 100;
  return this._yoneLevelValue(q.castTime, this.skillLevels.Q || 1) * (1 - Math.min(0.5, bonusPct * 0.41667 / 100));
};
// 영혼 가르기(W): Cooldown 14 -> 6, Cast Time 0.5 -> 0.19 (공식 위키)
CharacterController.prototype._yoneWCooldown = function() {
  return 14 * (1 - this._yoneASReduction(1 - 6 / 14));
};
CharacterController.prototype._yoneWCastTime = function() {
  return 0.5 * (1 - this._yoneASReduction(1 - 0.19 / 0.5));
};

// W의 미니언 최소 피해/몬스터 최대 피해 캡(요네.bin 정확한 챔피언 레벨별
// 계단/선형 공식 그대로 재현 - 위키 프로즈의 "40-490"/"150-340"은 양 끝
// 값만 담은 부정확한 요약이었다).
CharacterController.prototype._yoneWMinDamageVsMinion = function() {
  const w = this._champData().W;
  const bp = w.minDamageVsMinionBreakpoints;
  const level = Math.max(1, Math.min(18, this.champLevel || 1));
  let v = bp.level1;
  for (let l = 2; l <= level; l++) {
    const step = [...bp.steps].reverse().find((s) => l >= s.fromLevel);
    v += step ? step.perLevel : 0;
  }
  return v;
};
CharacterController.prototype._yoneWMaxDamageVsMonster = function() {
  const w = this._champData().W;
  const level = Math.max(1, Math.min(18, this.champLevel || 1));
  return w.maxDamageVsMonsterBase + w.maxDamageVsMonsterPerLevel * (level - 1);
};

// 아이템 시스템이 없는 이 뷰어에서 "보너스 공격력"은 레벨 기본 공격력을
// 초과하는 몫으로 근사한다(this.bonusAD 임시 버프까지 포함). R/W처럼
// 공식 수치가 "보너스 AD" 계수인 항목에 사용한다.
CharacterController.prototype._yoneBonusAD = function() { return this._getBonusAD(); }; // 공용 "추가 공격력"(레벨 성장 제외)

/* ---------------- 패시브: 사냥꾼의 길 ---------------- */

// 치명타 피해 배율(요네.bin 실데이터 기준 190%, 무한의 검 보유 시 217% -
// 이 데모에는 아이템 시스템이 없어 항상 기본값만 사용한다).
// 버그 수정: 예전 190%는 "기본 치명타 200%" 시절 bin 값(200%×0.95)이었다. 현재 PC는 기본
// 치명타 175%이고 요네는 치명타 피해 10% 감소(V14.20 이후) → 175%×0.9 = 157.5%.
// 91차: 무한의 대검 포함 총 치명타 배율 (1.75 + 대검) × 보정(0.95) - calculateDamage의 평타 경로와 같은 식.
CharacterController.prototype._yoneCritMultiplier = function() {
  const mod = this.stats.critDamageModifier || 1;
  return ((this.stats.critMultiplier || 1.75) / mod + (this.itemBonusCritDamagePercent || 0)) * mod;
};
// 치명타 확률 2배/초과분 추가 공격력은 recomputeStats()의 공용 "의지" 처리(야스오와 공유).
// Steel and Spirit: 평타가 강철 검(물리)/아자카나의 검(물리 50%+마법
// 50%)을 번갈아 사용한다. azakanaNext가 true면 "이번" 스윙이 아자카나의
// 검 차례라는 뜻 - character_controller.js의 온힛 처리부에서 읽기만
// 하고(_yoneIsAzakanaSwing), 실제 토글은 스윙이 발생하는 시점에 한 번만
// (_yoneAdvanceSwordState) 수행한다.
CharacterController.prototype._yoneIsAzakanaSwing = function() {
  return !!(this._yone && this._yone.azakanaNext);
};
CharacterController.prototype._yoneAdvanceSwordState = function() {
  if (!this._yone) return;
  this._yone.azakanaNext = !this._yone.azakanaNext;
};
// 아자카나의 검 평타: 물리 50% + 마법 50%를 "동시" 두 개의 별도 피해
// 인스턴스로 적용한다(위키: "두 개의 동시 피해 인스턴스로 처리되며,
// 물리 피해가 먼저 적용된다"). 두 인스턴스 모두 이번 스윙의 치명타
// 여부/배율을 그대로 적용한다(위키: "두 인스턴스 모두 기본 피해로
// 취급되어 치명타/생명력 흡수가 자연스럽게 적용된다").
CharacterController.prototype._yoneApplyAlternatingAttackDamage = function(target, attackResult) {
  const half = attackResult.rawDamage * 0.5;
  let dealt = applyDamage(target, { ...attackResult, rawDamage: half, damageType: DAMAGE_TYPE.PHYSICAL }) || 0;
  if (!target || target.hp > 0) {
    dealt += applyDamage(target, { ...attackResult, rawDamage: half, damageType: DAMAGE_TYPE.MAGICAL }) || 0;
  }
  this._yoneRecordMark(target, dealt);
  return dealt;
};

/* ---------------- E(영혼해방) 표식 기록 공용 헬퍼 ---------------- */
// 정신체(Spirit Form) 상태에서 챔피언에게 입힌 피해의 일부(레벨별
// markPercentByLevel%)를 표식으로 저장했다가, 복귀(재시전) 시 고정
// 피해로 한꺼번에 터뜨린다. 정확한 "피해 감소 적용 후" 수치를
// 얻을 별도 반환값이 이 엔진의 applyDamage에는 없으므로, 여기서는
// 전달된 원본(raw) 피해량 기준으로 근사한다 - 주석으로 근사임을 명시.
// 표식(마크) 아이콘 텍스처 - 위키/영상에서 확인되는 붉은 삼각형 표식을
// generateGlowTexture()와 동일한 캔버스 절차 생성 방식으로 만든다. 모듈
// 전역에서 한 번만 생성해 모든 표식 스프라이트가 같은 텍스처를 공유한다.
let _yoneMarkTexture = null;
function _yoneGetMarkTexture() {
  if (_yoneMarkTexture) return _yoneMarkTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.4, 'rgba(255,30,30,0.95)');
  grad.addColorStop(1, 'rgba(255,0,0,0)');
  // 위쪽을 향한 뾰족한 삼각형(위키/실제 영상에서 확인되는 표식 아이콘 모양).
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.36);
  ctx.lineTo(size * 0.30, size * 0.28);
  ctx.lineTo(-size * 0.30, size * 0.28);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  _yoneMarkTexture = tex;
  return tex;
}
// 표식이 걸린 대상 머리 위에 붉은 삼각형 스프라이트를 띄운다(실제 영상
// ability_0777_E1.webm 확인 - 표식 대상 위에 이 아이콘이 떠 있다). 대상당
// 스프라이트 하나만 만들고, 이미 있으면 재사용한다(중첩 피해로 표식량이
// 늘어도 아이콘은 하나만 유지 - 크기만 살짝 키워 강조).
CharacterController.prototype._yoneEnsureMarkIndicator = function(target) {
  const spirit = this._yone && this._yone.eSpirit;
  if (!spirit) return;
  if (!spirit.markIndicators) spirit.markIndicators = new Map();
  const key = target.id || target.uuid || target;
  if (spirit.markIndicators.has(key)) return;
  const mat = new THREE.SpriteMaterial({ map: _yoneGetMarkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.5, 0.5, 1);
  scene.add(sprite);
  spirit.markIndicators.set(key, sprite);
};
// 매 프레임(_yoneUpdateESpirit에서 호출) 표식 대상들의 머리 위로 스프라이트
// 위치를 갱신한다. 대상이 죽었거나 더 이상 존재하지 않으면 정리한다.
CharacterController.prototype._yoneUpdateMarkIndicators = function() {
  const spirit = this._yone && this._yone.eSpirit;
  if (!spirit || !spirit.markIndicators || !spirit.markIndicators.size) return;
  for (const [key, sprite] of spirit.markIndicators) {
    const target = spirit.markTargets.get(key);
    if (!target || target.hp <= 0) { this._yoneRemoveMarkIndicator(key); continue; }
    const p = getWorldPosition(target);
    const height = (target.labelHeight != null ? target.labelHeight : BASE_UNIT * 1.8) + 0.6;
    sprite.position.set(p.x, height, p.z);
  }
};
CharacterController.prototype._yoneRemoveMarkIndicator = function(key) {
  const spirit = this._yone && this._yone.eSpirit;
  if (!spirit || !spirit.markIndicators) return;
  const sprite = spirit.markIndicators.get(key);
  if (sprite) { if (sprite.parent) sprite.parent.remove(sprite); sprite.material.dispose(); }
  spirit.markIndicators.delete(key);
};
CharacterController.prototype._yoneClearAllMarkIndicators = function() {
  const spirit = this._yone && this._yone.eSpirit;
  if (!spirit || !spirit.markIndicators) return;
  for (const key of [...spirit.markIndicators.keys()]) this._yoneRemoveMarkIndicator(key);
};

CharacterController.prototype._yoneRecordMark = function(target, rawDamageDealt) {
  const spirit = this._yone && this._yone.eSpirit;
  if (!spirit || !target || rawDamageDealt <= 0) return;
  // 원작: 정신체 동안 "적 챔피언"에게 입힌 피해만 표식으로 저장(몬스터/미니언/구조물 제외).
  // 넘겨받는 값은 방어력/마저 적용 "후" 실제 피해(applyDamage 반환값) - 예전엔 적용 전 원본 피해였다.
  if (!target.isChampion) return;
  const e = this._champData().E;
  const lvl = Math.max(1, Math.min(5, this.skillLevels.E || 1));
  const pct = this._yoneLevelValue(e.markPercentByLevel, lvl) / 100;
  const key = target.id || target.uuid || target;
  const prev = spirit.marks.get(key) || 0;
  spirit.marks.set(key, prev + rawDamageDealt * pct);
  spirit.markTargets.set(key, target);
  this._yoneEnsureMarkIndicator(target);
};

/* ---------------- Q: 필멸의 검 ---------------- */

CharacterController.prototype._yoneQStackTick = function() {
  if (this._yone.qStacks > 0 && performance.now() > this._yone.qStackExpiresAt) {
    this._yone.qStacks = 0; this._yone.qStackExpiresAt = 0;
  }
};

// 첫 번째로 맞은 대상에게는 평타 취급 피해(온힛/치명타 적용), 그
// 뒤로 같은 선/돌풍에 걸린 대상들에게는 나머지 광역 피해를 적용한다
// (위키: "첫 대상=기본 피해, 나머지=광역 피해" - 정확한 광역 피해
// 하향폭은 공개되어 있지 않아 동일한 수치를 사용한다).
// 크리티컬 공식(요네.bin YoneQ.TotalDamageCrit 그대로 재현):
// raw = BaseDamage + AD * ADRatio * critMultiplier. 이전에는 이 값을
// champion_data에 critTotalAdRatio(=ADRatio*critMultiplier)로 미리
// 상수화해뒀지만, 그러면 패시브 critDamage가 나중에 조정될 때마다
// 이 상수도 손으로 다시 계산해야 한다 - bin이 보여준 원본 계산식
// 그대로 매번 동적으로 곱하는 편이 실제 게임 계산 구조와 더 가깝고
// 유지보수도 쉽다.
CharacterController.prototype._yoneApplyQHit = function(target, { empowered = false } = {}) {
  const q = this._champData().Q;
  const lvl = Math.max(1, Math.min(5, this.skillLevels.Q || 1));
  const base = this._yoneLevelValue(q.damageByLevel, lvl);
  // 버그 수정: 예전엔 치명타 확률을 항상 100%로 고정하고 Q도 무조건 치명타였다.
  // 이제 패시브 "의지"(치명타 확률 2배, recomputeStats)로 계산된 확률대로 굴린다.
  const crit = this._yoneQCritRoll != null ? this._yoneQCritRoll : (Math.random() < (this.stats.critChance || 0));
  // 무한의 대검 보너스를 AD 계수 부분에만 반영한다(예전엔 isCritical로 넘겨 기본 피해까지 곱해졌다).
  const critMult = this._yoneCritMultiplier();
  const ratio = crit ? q.totalAdRatio * critMult : q.totalAdRatio;
  const raw = base + this.stats.attackDamage * ratio;
  const dealt = applyDamage(target, { rawDamage: raw, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true, source: this }) || 0;
  // 적중 시 효과(야스오 Q와 같은 규칙): 한 번의 Q에서 처음 맞은 대상에게만, 주문검 발동은 제외.
  if (!this._yoneQHitConsumed) {
    this._yoneQHitConsumed = true;
    if (typeof itemOnBasicAttackHit === 'function' && target.hp > 0) itemOnBasicAttackHit(this, target, crit, { fromAbility: true });
  }
  if (empowered) applyStatus(target, { id: 'yoneQKnockup', type: 'KNOCKUP', duration: q.knockupDuration, value: 1 });
  this._yoneRecordMark(target, dealt);
  return raw;
};

// 버그 수정: 원작 Q는 폭 80의 직선이다(예전엔 반각 6도 부채꼴 - 가까이선 너무 좁고
// 멀리선 넓었다).
CharacterController.prototype._yoneFindQTargets = function(dir, lolRange) {
  const q = this._champData().Q;
  return findEnemiesInLine(this.root.position, dir, lolRange, q.width || 80).filter((u) => u && u.hp > 0);
};

// 2중첩(폭풍 구름) 상태에서 발동하는 강화 필멸의 검: 요네 본체는 고정
// 거리(dashRange=450)만 돌진하지만, 돌풍은 같은 방향으로 계속 나아가
// 총 missileRange(950)까지 판정한다(요네.bin: YoneQ.Q3MaxDistance=450,
// YoneQ3Missile.castRange=950 - 서로 다른 두 값임을 확인). 본체 돌진이
// 끝난 뒤에도 돌풍 판정은 계속되도록, 이동 애니메이션(본체)과 히트박스
// 전진(돌풍)을 별도 진행률로 관리한다.
CharacterController.prototype._yoneStartEmpoweredQ = function(dir) {
  const q = this._champData().Q;
  const forward = dir.clone().setY(0);
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1); else forward.normalize();
  const origin = this.root.position.clone();
  const bodyDist = lolRangeToWorld(q.dashRange || 450);
  const missileDist = lolRangeToWorld(q.missileRange || 950);
  const speed = lolRangeToWorld(q.dashSpeed || 1500);
  this._yone.qDashTravel = {
    dir: forward,
    origin: origin.clone(),
    bodyStart: origin.clone(),
    bodyEnd: origin.clone().addScaledVector(forward, bodyDist),
    bodyDuration: Math.max(0.05, bodyDist / speed),
    bodyElapsed: 0,
    missileDist,
    missileDuration: Math.max(0.05, missileDist / speed),
    missileElapsed: 0,
    hitSet: new Set(),
    critRoll: Math.random() < (this.stats.critChance || 0),
  };
  this._yoneQHitConsumed = false;
  // 중첩은 돌진을 "시작"할 때 소모 - 예전엔 돌풍이 끝까지 간 뒤 0으로 돌려, 그 사이(공속이
  // 높으면 쿨다운 1.33초) Q를 다시 쓰면 강화 Q가 또 나갔다.
  this._yone.qStacks = 0; this._yone.qStackExpiresAt = 0;
  if (typeof window !== 'undefined' && window.yoneSetQStacks) window.yoneSetQStacks(0);
  vfx.spawn('q', origin.clone().addScaledVector(forward, 1.2), forward, { tornado: true, size: 1.25 });
};

CharacterController.prototype._yoneTickEmpoweredQ = function(dt) {
  const travel = this._yone && this._yone.qDashTravel;
  if (!travel) return;
  // 본체 이동(450에서 정지)
  if (travel.bodyElapsed < travel.bodyDuration) {
    travel.bodyElapsed = Math.min(travel.bodyDuration, travel.bodyElapsed + Math.max(0, dt));
    const bt = travel.bodyElapsed / travel.bodyDuration;
    this.root.position.lerpVectors(travel.bodyStart, travel.bodyEnd, bt);
  }
  // 돌풍 판정(950까지 계속 전진 - 본체보다 더 오래/멀리 간다)
  travel.missileElapsed = Math.min(travel.missileDuration, travel.missileElapsed + Math.max(0, dt));
  const mt = travel.missileElapsed / travel.missileDuration;
  const missileHeadDist = travel.missileDist * mt;
  const q = this._champData().Q;
  const bodyHalfWidth = lolRangeToWorld(q.dashAoEWidth || 100) * 0.5;
  const missileHalfWidth = lolRangeToWorld(q.missileWidth || 160) * 0.5;
  const bodyReach = travel.bodyElapsed / travel.bodyDuration * lolRangeToWorld(q.dashRange || 450);
  for (const u of getAllEnemyUnits()) {
    if (!u || u.hp <= 0 || travel.hitSet.has(u)) continue;
    const p = getWorldPosition(u);
    const toUnit = new THREE.Vector3(p.x - travel.origin.x, 0, p.z - travel.origin.z);
    const along = toUnit.dot(travel.dir);
    const ur = getCollisionRadius(u) || 0;
    // 45차: 길이 방향 여유는 대상 반경만큼(R과 같은 규칙). 예전엔 고정 1(월드 ≈ LoL 115)이라 뒤·끝 너머 115까지 맞았다.
    if (along < -ur || along > Math.max(bodyReach, missileHeadDist) + ur) continue;
    // 본체 판정 폭 안이면 dashAoEWidth, 그 너머(돌풍만 도달한 구간)면 missileWidth 적용.
    const halfWidth = along <= bodyReach + ur ? bodyHalfWidth : missileHalfWidth;
    const lateral = Math.sqrt(Math.max(0, toUnit.lengthSq() - along * along));
    if (lateral > halfWidth + (getCollisionRadius(u) || 0)) continue;
    travel.hitSet.add(u);
    this._yoneQCritRoll = travel.critRoll;
    this._yoneApplyQHit(u, { empowered: true });
    this._yoneQCritRoll = null;
  }
  if (travel.missileElapsed >= travel.missileDuration - 1e-4) {
    this._yone.qDashTravel = null;
  }
};

// 요네는 GLB에 스킬별 "전용 종료 전환 클립"이 굉장히 많다(닐라와 동일한
// 패턴 - 한 상황에 여러 모션이 순서대로 이어짐). 스킬의 실제 판정/피해
// 타이밍은 건드리지 않고, RECOVERY 종료 후 곧장 Idle/Run으로 크로스페이드
// 하는 대신 "지금 이동 중인가"에 맞는 전용 전환 클립을 한 번 재생한 뒤에
// _resumeAfterAction()으로 넘긴다. 해당 클립이 이 GLB에 없으면(예: 일반
// 필멸의 검은 Idle 전환 클립이 따로 없음) 그냥 즉시 onDone을 호출해
// 기존 동작과 동일하게 동작한다 - 에러 없이 항상 안전하게 폴백된다.
// 46차: lockSec(초)를 주면 정지 상태 전환 클립을 재생하더라도 행동 잠금은 그 시간 뒤에 풀린다(강화 Q: 돌진이 끝나는 순간).
// 예전엔 전환 클립(Spell1C_ToIdle 2.57초)이 끝날 때까지 'yoneQ'로 잠겨 다른 행동을 못 했다. 잠금이 풀린 뒤에도 할 일이
// 없으면 전환 클립은 연출로 계속 재생되고(onDone(true) - 조용히 해제), 끝나면 대기 모션으로 돌아간다.
CharacterController.prototype._yonePlayExitTransition = function(idleClipNames, moveClipNames, onDone, lockSec = null) {
  const moving = !!(this.targetPos || this.pendingMove);
  const candidates = (moving ? moveClipNames : idleClipNames) || [];
  const clip = this.resolveClip(candidates);
  if (clip && moving) {
    // 이동 중이면 전환 클립(…toWalk/…toRun)을 재생하면서 "곧바로" 이동을 잇는다. 버그 수정: 예전엔 이 클립
    // (최대 약 1.3초)이 끝날 때까지 제자리에 서 있다가 움직였다(측정: Q 후 1.7초 뒤 이동). 클립은 이동 중 전환
    // 클립으로 등록해 이동 루프가 덮어쓰지 않게 하고, 끝나면 일반 이동 루프로 넘어간다.
    this.playFirstAvailable(candidates, { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
    this._beginTransientMoveClip(clip.name);
    // 46차: 전환 클립(최대 2.57초)을 끝까지 보여 주면 달리는 동안 걷기 전환 자세가 길게 남는다 - 0.45초만 보여 주고
    // 이동 루프로 넘긴다(이동 루프가 페이드로 자연스럽게 이어 받는다).
    this._champTimeout(() => {
      this._endTransientMoveClip(clip.name);
      if (this.currentClipKey === clip.name && !this.currentActionKey && this.state === STATE.MOVE) this.playFirstAvailable(this._moveClips(), { loop: THREE.LoopRepeat, fade: 0.2 });
    }, Math.min(0.45, Math.max(0, clip.duration - 0.1)) * 1000);
    onDone();
    return;
  }
  if (clip) {
    if (this.sequencePlayer && this.sequencePlayer.isPlaying) this.sequencePlayer.stop(); // 강화 Q 3연쇄의 마지막 클립이 전환 클립을 덮지 않게
    this.playFirstAvailable(candidates, { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
    const lockMs = Math.max(0, lockSec != null ? Math.min(lockSec, clip.duration - 0.03) : clip.duration - 0.03) * 1000;
    const t = this._champTimeout(() => {
      const busy = !!(this.pendingMove || this.pendingCast || this.targetPos || (this.currentTarget && this.currentTarget.hp > 0));
      onDone(!busy);
      if (busy) return;
      this._champTimeout(() => {
        if (this.currentClipKey === clip.name && !this.currentActionKey && this.state === STATE.IDLE) this._returnToLocomotion();
      }, Math.max(0, clip.duration * 1000 - lockMs));
    }, lockMs);
    this._actionTimers.push(t);
  } else {
    onDone();
  }
};

CharacterController.prototype._yoneCastQ = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  // 버그 수정: 예전엔 skillLevels를 강제로 1 이상으로 덮어써, 스킬 포인트를 찍지 않은
  // 스킬도 _payCost()의 "아직 배우지 않음" 검사를 통과했다(Q/W/E/R 공통).
  if (!this._payCost('Q', free)) return;
  this._yoneQStackTick();
  const q = this._champData().Q;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  this.faceDirectionInstant(dir);

  const empoweredNow = this._yone.qStacks >= (q.maxStacks || 2);
  const castTime = this._yoneQCastTime();
  const key = 'yoneQ';
  this.currentActionKey = key; this.currentPhase = null;

  if (empoweredNow) {
    const clips = ['Spell1C_In', 'Spell1C_Dash', 'Spell1C_Out'].filter((n) => this.findAnimation(n));
    this.setState(STATE.Q_CAST);
    this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
    // 버그 수정("Q 모션이 끊긴다"): 이 3연쇄 클립(In+Dash+Out)의 실제 재생
    // 시간 합은 castTime(공속에 따라 0.35~0.175초)보다 훨씬 길다. 예전에는
    // 1배속 그대로 재생하면서 castTime이 지나면 곧장 다음 단계(RECOVERY +
    // 종료 전환)로 넘어가버려서, 애니메이션이 채 끝나기도 전에 다른 클립으로
    // 크로스페이드되며 중간에 뚝 끊기는 것처럼 보였다. 이제 3개 클립의
    // 실제 길이 합을 castTime에 맞춰 압축하는 timeScale을 계산해서 넣는다 -
    // 애니메이션이 정확히 castTime 시점에 자연스럽게 끝나도록.
    const naturalTotal = clips.reduce((sum, n) => sum + (this.findAnimation(n)?.duration || 0), 0);
    const q3TimeScale = (naturalTotal > 0 && castTime > 0) ? THREE.MathUtils.clamp(naturalTotal / castTime, 0.3, 4.0) : 1.0;
    if (clips.length) {
      this.sequencePlayer.play({ steps: clips.map((n) => ({ animation: n, clipStart: 0, clipEnd: this.findAnimation(n).duration, timeScale: q3TimeScale })) });
    } else {
      this.playFirstAvailable(['Spell1_Dash', 'Yone_Spell1_A_01.anm'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true, timeScale: q3TimeScale });
    }
    const timer = this._champTimeout(() => {
      if (this.currentActionKey !== key) return;
      this.currentPhase = 'ACTIVE';
      this._yoneStartEmpoweredQ(dir);
      this.currentPhase = 'RECOVERY';
      // 강화 필멸의 검 종료 전환: 이동 중이면 Spell1C_ToWalk_0(방향 미세
      // 조정 없이 항상 존재하는 정면 버전을 기본으로 사용 - 좌/우 회전
      // 버전(_90/_-90)은 실제 회전각 판정까지는 이 범위에서 구현하지
      // 않는다), 정지 중이면 Spell1C_ToIdle.
      const doneEmpowered = (quiet) => {
        if (this.currentActionKey !== key) return;
        this.currentActionKey = null; this.currentPhase = null;
        if (quiet) { if (this.state === STATE.Q_CAST) this.setState(STATE.IDLE); } else this._resumeAfterAction();
      };
      const travel = this._yone.qDashTravel;
      this._yonePlayExitTransition(['Spell1C_ToIdle'], ['Spell1C_ToWalk_0', 'Spell1C_ToWalk_90', 'Spell1C_ToWalk_-90'], doneEmpowered, travel ? travel.bodyDuration : 0.3);
    }, Math.max(0, castTime) * 1000);
    this._actionTimers.push(timer);
    if (!free) this.cooldowns.Q = abilityHasteCooldown(this, this._yoneQCooldown());
    return;
  }

  // 일반 필멸의 검(1/2타 찌르기)
  const animName = (this._yone.qAnimToggle = !this._yone.qAnimToggle) ? 'Yone_Spell1_A_02.anm' : 'Yone_Spell1_A_01.anm';
  this.setState(STATE.Q_CAST);
  this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  // 위와 동일한 이유로 timeScale을 계산해 넣는다(일반 찌르기 클립도
  // castTime보다 자연 길이가 길어서 그대로 두면 중간에 끊겨 보였다).
  const qMainClip = this.findAnimation(animName) || this.findAnimation('Yone_Spell1_A_01.anm');
  const qMainTimeScale = (qMainClip && qMainClip.duration > 0 && castTime > 0) ? THREE.MathUtils.clamp(qMainClip.duration / castTime, 0.3, 4.0) : 1.0;
  this.playFirstAvailable([animName, 'Yone_Spell1_A_01.anm'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true, timeScale: qMainTimeScale });
  const timer = this._champTimeout(() => {
    if (this.currentActionKey !== key) return;
    this.currentPhase = 'ACTIVE';
    const targets = this._yoneFindQTargets(dir, q.range);
    if (targets.length) {
      targets.sort((a, b) => this.root.position.distanceToSquared(getWorldPosition(a)) - this.root.position.distanceToSquared(getWorldPosition(b)));
      this._yoneQCritRoll = Math.random() < (this.stats.critChance || 0);
      this._yoneQHitConsumed = false;
      targets.forEach((t) => this._yoneApplyQHit(t, { empowered: false }));
      this._yoneQCritRoll = null;
      this._yone.qStacks = Math.min(q.maxStacks || 2, this._yone.qStacks + 1);
      this._yone.qStackExpiresAt = performance.now() + (q.stackDuration || 6) * 1000;
      if (window.yoneSetQStacks) window.yoneSetQStacks(this._yone.qStacks);
      vfx.spawn('q', this.root.position.clone().addScaledVector(dir, 1.0), dir);
      debugSkillHit('Yone Q', targets[0]);
    } else {
      debugSkillMiss('Q', '사거리 내 대상 없음');
    }
    this.currentPhase = 'RECOVERY';
    // 일반 필멸의 검 종료 전환: 이동 중이면 Yone_Spell1A_toWalk01.anm으로
    // 자연스럽게 걷기와 이어붙인다(GLB에 Idle 전용 전환 클립은 따로
    // 없어서 정지 상태는 기존처럼 즉시 크로스페이드).
    const doneNormalQ = () => { if (this.currentActionKey === key) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); } };
    this._yonePlayExitTransition([], ['Yone_Spell1A_toWalk01.anm'], doneNormalQ);
  }, Math.max(0, castTime) * 1000);
  this._actionTimers.push(timer);
  if (!free) this.cooldowns.Q = abilityHasteCooldown(this, this._yoneQCooldown());
};

/* ---------------- W: 영혼 가르기 ---------------- */

CharacterController.prototype._yoneCastW = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('W', free)) return;
  const wLevel = Math.max(1, Math.min(5, Number(this.skillLevels.W) || 1));
  const w = this._champData().W;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  this.faceDirectionInstant(dir);
  const castTime = this._yoneWCastTime();
  const key = 'yoneW';
  this.setState(STATE.W_CAST);
  this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  this.playFirstAvailable(['Spell2'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true, timeScale: (() => { const c = this.findAnimation('Spell2'); return (c && c.duration > 0 && castTime > 0) ? THREE.MathUtils.clamp(c.duration / castTime, 0.3, 4.0) : 1.0; })() });
  const timer = this._champTimeout(() => {
    if (this.currentActionKey !== key) return;
    this.currentPhase = 'ACTIVE';
    // 27차: 판정 부채꼴(사거리·각도)을 바닥에 잠깐 그린다 - 예전엔 맞혔을 때만 작은 반짝임이 있어 범위가 보이지 않았다.
    if (typeof vfx.groundShapeFlash === 'function') vfx.groundShapeFlash(this.root.position, dir, { kind: 'cone', range: lolRangeToWorld(w.range), angleDeg: w.angleDeg || 80 }, 0x9fc8ff, 0.4);
    const targets = findEnemiesInRadius(this.root.position, w.range, { forward: dir, maxAngleDeg: (w.angleDeg || 80) / 2 })
      .map((h) => h.unit).filter((u) => u && u.hp > 0);
    let championHits = 0;
    for (const t of targets) {
      const base = this._yoneLevelValue(w.totalMixedDamageByLevel, wLevel);
      const hpRatio = this._yoneLevelValue(w.maxHpRatioByLevel, wLevel) / 100;
      let total = base + (t.maxHp || 0) * hpRatio;
      // 미니언 최소 피해 하한 / 몬스터 최대 피해 상한(요네.bin 챔피언
      // 레벨 기준 계단·선형 공식) - 챔피언 대상에는 적용되지 않는다.
      if (t.isMinion) total = Math.max(total, this._yoneWMinDamageVsMinion());
      else if (t.isMonster) total = Math.min(total, this._yoneWMaxDamageVsMonster());
      const half = total * 0.5;
      let dealtW = applyDamage(t, { rawDamage: half, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true, source: this }) || 0;
      if (t.hp > 0) dealtW += applyDamage(t, { rawDamage: half, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isAbility: true, source: this }) || 0;
      this._yoneRecordMark(t, dealtW);
      // 버그 수정: 예전엔 미니언/포탑만 빼서 몬스터까지 "챔피언 적중"으로 셌다.
      if (t.isChampion) championHits++;
    }
    if (targets.length) {
      // 보호막: 기본값(챔피언 레벨 기준 40->90 선형, 요네.bin WShield 실데이터) + 보너스 AD 65%,
      // 첫 챔피언 적중 시 +100%, 이후 챔피언 1명당 +50%.
      const base = growLinear(w.shieldBase, w.shieldGrowth, this.champLevel || 1) + this._yoneBonusAD() * w.shieldBonusAdRatio;
      let mult = 1;
      if (championHits >= 1) mult += 1.0;
      if (championHits >= 2) mult += 0.5 * (championHits - 1);
      // 보호막 인스턴스(1.5초, 재시전은 교체, 다른 보호막과 합산).
      const wAmt = base * mult * getShieldReceivedMultiplier(this);
      addShield(this, 'yoneW', wAmt, w.shieldDuration || 1.5);
      updateBars(this);
      vfx.spawn('w', this.root.position.clone());
      debugSkillHit('Yone W', targets[0]);
    } else {
      debugSkillMiss('W', '사거리 내 대상 없음');
    }
    // 버그 수정(타이밍 측정으로 발견): 예전엔 판정 뒤 1.47초짜리 복귀 모션(Spell2_ToIdle)이 끝날 때까지 행동이
    // 잠겨 있었다(시전 후 총 약 2초). 원작은 시전 시간이 끝나면 바로 움직일 수 있다 - 잠금은 즉시 풀고,
    // 이동/공격/시전 입력이 없을 때만 복귀 모션을 끝까지 보여준다(이동 중이면 Spell2_ToRun 대신 바로 이동).
    this.currentActionKey = null; this.currentPhase = null;
    if (this.targetPos || this.pendingMove || this.pendingCast || (this.currentTarget && this.currentTarget.hp > 0 && this.attackOrderActive)) {
      this._resumeAfterAction();
    } else {
      const tail = this.resolveClip(['Spell2_ToIdle']);
      if (tail) {
        this.playFirstAvailable(['Spell2_ToIdle'], { loop: THREE.LoopOnce, fade: 0.08, clampWhenFinished: true });
        const t2 = this._champTimeout(() => { if (!this.currentActionKey && this.currentClipKey === tail.name) this._resumeAfterAction(); }, Math.max(0, tail.duration - 0.03) * 1000);
        this._actionTimers.push(t2);
      } else this._resumeAfterAction();
    }
  }, Math.max(0, castTime) * 1000);
  this._actionTimers.push(timer);
  if (!free) this.cooldowns.W = abilityHasteCooldown(this, this._yoneWCooldown());
};

/* ---------------- E: 영혼해방 - 육체/영혼 분리 시각효과 ---------------- */

// 남겨진 육체(husk): 지금 모델을 SkeletonUtils.clone으로 복제해 별도
// AnimationMixer로 "고정 애니메이션"(Idle) 하나만 반복 재생시키고, 실제
// 이동/전투 로직과는 완전히 분리된 순수 장식용 오브젝트로 scene에 직접
// 붙인다(this.root를 공유하면 정신체가 움직일 때 같이 끌려가 버린다).
CharacterController.prototype._yoneSpawnBodyHusk = function(position, quaternion) {
  if (!this.model) return null;
  const clone = cloneSkeleton(this.model);
  clone.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.85;
        m.depthWrite = false;
        // 색감 보정(요네 E 실제 영상 확인): 어두운 암적색이 아니라 훨씬
        // 채도 높은 선명한 진홍색 발광에 가깝다 - color를 살짝만 어둡게
        // 섞고 emissive를 강하게 줘서 "빛나는 붉은 실루엣" 느낌을 낸다.
        if (m.color) m.color.lerp(new THREE.Color(0x330000), 0.35);
        if ('emissive' in m) { m.emissive = new THREE.Color(0xff1a1a); m.emissiveIntensity = 2.2; }
      });
    }
  });
  const scaleWrapper = new THREE.Group();
  const srcScale = (this.model.parent && this.model.parent.scale) || new THREE.Vector3(1, 1, 1);
  scaleWrapper.scale.copy(srcScale);
  scaleWrapper.add(clone);
  const outer = new THREE.Group();
  outer.add(scaleWrapper);
  outer.position.copy(position);
  outer.quaternion.copy(quaternion);
  scene.add(outer);
  const mixer = new THREE.AnimationMixer(clone);
  // 실제 영상 확인(ability_0777_E1.webm): 남겨진 육체는 별도 Idle 루프가
  // 아니라 "시전 순간에 하던 동작 그대로 멈춘" 모습에 훨씬 가깝다(예:
  // 검을 치켜든 채 정지). 지금 재생 중이던 클립을 그대로 복제 믹서에
  // 물려서 같은 시각(time)으로 맞춘 뒤 즉시 paused=true로 고정한다 -
  // 새 애니메이션을 만들지 않고 "그 순간의 프레임"만 그대로 재사용.
  let frozen = false;
  if (this.currentAction && this.currentAction.getClip) {
    const currentClip = this.currentAction.getClip();
    if (currentClip) {
      const action = mixer.clipAction(currentClip);
      action.time = this.currentAction.time || 0;
      action.play();
      mixer.update(0);
      action.paused = true;
      frozen = true;
    }
  }
  if (!frozen) {
    const idleClip = this.findAnimation('Idle1_Raw') || this.findAnimation('Idle1_Base') || (this.actionData.idle && this.actionData.idle.clips.map((n) => this.findAnimation(n)).find(Boolean));
    if (idleClip) { const action = mixer.clipAction(idleClip); action.play(); }
  }
  // 남겨진 육체가 서 있는 자리를 알아보기 쉽게 어두운 원형 표시를 바닥에 깐다.
  const ringGeo = new THREE.RingGeometry(0.55, 0.85, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1a0000, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  outer.add(ring);
  return { outer, mixer, ring, frozen };
};

CharacterController.prototype._yoneRemoveBodyHusk = function(husk) {
  if (!husk) return;
  if (husk.outer.parent) husk.outer.parent.remove(husk.outer);
  husk.outer.traverse((o) => {
    if (o.isMesh) {
      if (o.geometry && o.geometry !== husk.ring?.geometry) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m && m.dispose && m.dispose());
    }
  });
};

// 정신체(요네 본체) 자신을 반투명 붉은색으로 물들인다/원복한다. 원본
// material 속성을 저장해뒀다가 그대로 되돌린다(새 재질을 만들지 않고
// 값만 바꿔서 - 다른 시스템이 참조 중인 material 객체 자체는 유지).
CharacterController.prototype._yoneSetSpiritTint = function(active) {
  if (!this.model) return;
  if (active) {
    if (this._yone.spiritTintUndo) return; // 이미 적용됨
    const undo = [];
    this.model.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          undo.push({
            mat: m,
            color: m.color ? m.color.clone() : null,
            opacity: m.opacity,
            transparent: m.transparent,
            emissive: ('emissive' in m && m.emissive) ? m.emissive.clone() : null,
            emissiveIntensity: m.emissiveIntensity,
          });
          if (m.color) m.color.lerp(new THREE.Color(0x330000), 0.35);
          m.transparent = true;
          m.opacity = Math.max(m.opacity ?? 1, 0.85);
          if ('emissive' in m) { m.emissive = new THREE.Color(0xff1a1a); m.emissiveIntensity = 2.0; }
        });
      }
    });
    this._yone.spiritTintUndo = undo;
  } else {
    const undo = this._yone.spiritTintUndo;
    if (!undo) return;
    undo.forEach((u) => {
      if (u.color) u.mat.color.copy(u.color);
      u.mat.opacity = u.opacity;
      u.mat.transparent = u.transparent;
      if (u.emissive && 'emissive' in u.mat) { u.mat.emissive.copy(u.emissive); u.mat.emissiveIntensity = u.emissiveIntensity; }
    });
    this._yone.spiritTintUndo = null;
  }
};

// 육체<->영혼을 잇는 반투명 붉은 리본(bin/영상 참고 - 실제 사거리/폭
// 수치가 공개되어 있지 않은 순수 장식 효과라 임의의 얇은 평면으로
// 근사한다). 매 프레임 두 지점 사이 위치/길이/방향을 갱신한다.
CharacterController.prototype._yoneUpdateSpiritBeam = function(fromPos, toPos) {
  let beam = this._yone.spiritBeam;
  if (!beam) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    beam = new THREE.Mesh(geo, mat);
    beam.rotation.x = -Math.PI / 2;
    scene.add(beam);
    this._yone.spiritBeam = beam;
  }
  const mid = fromPos.clone().add(toPos).multiplyScalar(0.5);
  mid.y = Math.max(fromPos.y, toPos.y) + 0.05;
  const dist = fromPos.distanceTo(toPos);
  beam.position.copy(mid);
  beam.scale.set(0.45, Math.max(0.001, dist), 1);
  const angle = Math.atan2(toPos.x - fromPos.x, toPos.z - fromPos.z);
  beam.rotation.z = 0;
  beam.rotation.y = angle;
};

CharacterController.prototype._yoneRemoveSpiritBeam = function() {
  const beam = this._yone.spiritBeam;
  if (!beam) return;
  if (beam.parent) beam.parent.remove(beam);
  beam.geometry.dispose(); beam.material.dispose();
  this._yone.spiritBeam = null;
};

// 정신체 상태와 관련된 모든 장식 오브젝트(육체 husk/리본/틴트)를 한 번에
// 정리한다 - 정상 복귀(재시전/자동 만료) 및 챔피언 교체·사망 등 비정상
// 종료 양쪽에서 공용으로 호출된다.
CharacterController.prototype._yoneCleanupSpiritVisuals = function() {
  const spirit = this._yone && this._yone.eSpirit;
  if (spirit && spirit.husk) this._yoneRemoveBodyHusk(spirit.husk);
  this._yoneClearAllMarkIndicators();
  this._yoneRemoveSpiritBeam();
  this._yoneSetSpiritTint(false);
};

/* ---------------- E: 영혼해방 ---------------- */

// 최초 시전: 몸을 두고 방향으로 돌진 + 정신체 상태 진입. 재시전(또는
// 지속시간 만료 자동 재시전): 몸으로 복귀 + 표식 전부 고정(TRUE) 피해로 터뜨림.
CharacterController.prototype._yoneCastE = function(mouseWorldPoint, free = false) {
  if (this._yone.eSpirit) { this._yoneRecastE(); return; }
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('E', free)) return;
  const eLevel = Math.max(1, Math.min(5, Number(this.skillLevels.E) || 1));
  const e = this._champData().E;
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  this.faceDirectionInstant(dir);

  const bodyPos = this.root.position.clone();
  const bodyQuat = this.root.quaternion.clone();
  const dashDist = lolRangeToWorld(e.range);
  const dashDur = Math.max(0.05, dashDist / lolRangeToWorld(e.dashSpeed || 1200));
  const husk = this._yoneSpawnBodyHusk(bodyPos, bodyQuat);
  this._yoneSetSpiritTint(true);
  this._yone.eSpirit = {
    startedAt: performance.now(),
    duration: e.spiritFormDuration || 5,
    bodyPos, bodyQuat,
    dir: dir.clone(),
    marks: new Map(),
    markTargets: new Map(),
    travelStart: bodyPos.clone(),
    travelEnd: (() => { const p = bodyPos.clone().addScaledVector(dir, dashDist); if (typeof constrainUnitPosition === 'function') constrainUnitPosition(this, p); return p; })(), // 45차: 맵 경계 안으로(R과 같음)
    travelElapsed: 0,
    travelDuration: dashDur,
    recastLockedUntil: performance.now() + (e.recastMinDelay || 0.5) * 1000,
    husk,
  };
  // 버그 수정(원작 대조): 대상 지정 불가인 것은 "남겨진 몸"이고, 정신체(요네 본인)는
  // 평소처럼 맞는다. 예전엔 5초 내내 요네를 대상 지정 불가로 만들어 사실상 무적이었다.
  // 돌진(Spell3_Dash) -> 정신체 진입 포즈(Yone_Spell3_spiritIn.anm) 순서로
  // 이어 재생한다(닐라와 동일하게 한 상황에 여러 모션을 체인). 실제 이동
  // 보간은 _yoneUpdateESpirit(dt)가 별도로 매 프레임 처리하므로, 이 클립
  // 체인은 순수 시각 표현이고 이동을 막지 않는다. 진입 포즈가 끝난 뒤
  // 아직 정지 중이면 Spell3_SpiritIn_ToIdle로 자연스럽게 마무리한다.
  // 버그 수정("영혼이 달리는 모션이 안 된다"): 예전엔 이 체인을 재생하는
  // 동안 currentActionKey/state를 전혀 관리하지 않아서, 체인이 끝난 뒤에도
  // 엔진이 "지금 무슨 액션 중인지" 모르는 상태로 남아 정상적인 Run/Idle
  // 전환 로직이 아예 개입하지 못했다(정신체 상태로 남은 4~5초 내내 마지막
  // 재생 클립에 멈춰있거나 Idle만 반복됨). 이제 다른 스킬과 동일하게
  // currentActionKey를 잡았다가, 체인이 끝나면 반드시 비우고
  // _resumeAfterAction()을 호출해서 그 다음부터는 평범한 이동 로직(및
  // Run 애니메이션)이 정상적으로 이어받도록 한다.
  const spiritInKey = 'yoneESpiritIn';
  this.setState(STATE.E_CAST);
  this.currentActionKey = spiritInKey; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  const finishSpiritIn = () => {
    if (this.currentActionKey === spiritInKey) { this.currentActionKey = null; this.currentPhase = null; }
    this._resumeAfterAction();
  };
  // 버그 수정(9차 원작 대조): 예전엔 돌진 + 진입 포즈 + Spell3_SpiritIn_ToIdle(3.33초)이 끝날 때까지 잠가서
  // 정신체 5초 중 대부분을 이동·스킬(재시전 포함) 없이 보냈다. PC 위키: 최초 돌진은 시전 시간 없음 -
  // 조작 불가 구간은 돌진(300 / 1200 = 0.25초)뿐이다. 돌진이 끝나면 일반 대기/이동 모션이 이어받는다
  // (진입 포즈 뒤의 SpiritIn_ToIdle 전환은 이미 대기 모션으로 넘어간 뒤 다시 튀어 보여서 쓰지 않는다).
  const spiritInClips = ['Spell3_Dash', 'Yone_Spell3_spiritIn.anm'].filter((n) => this.findAnimation(n));
  if (spiritInClips.length) {
    this.sequencePlayer.play({
      steps: spiritInClips.map((n) => ({ animation: n, clipStart: 0, clipEnd: this.findAnimation(n).duration })),
      onComplete: () => {},
    });
  } else {
    this.playFirstAvailable(['Spell3_Dash'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  }
  const t = this._champTimeout(finishSpiritIn, Math.max(0.05, dashDur) * 1000);
  this._actionTimers.push(t);
  vfx.spawn('e', this.root.position.clone(), dir);
  if (!free) this.cooldowns.E = abilityHasteCooldown(this, this._yoneLevelValue(e.cooldown, eLevel));
};

CharacterController.prototype._yoneRecastE = function() {
  const spirit = this._yone.eSpirit;
  if (!spirit || spirit.recasting) return;
  if (performance.now() < spirit.recastLockedUntil) return; // 위키: 최초 시전 후 최소 0.5초 지나야 재시전 가능
  // PC 위키: 재시전 시전 시간 0.225초(그동안 이동 불가 효과 면역), 시전이 끝나면 육체로 돌아오며 표식이 터진다.
  // 예전엔 재시전 즉시 순간이동·표식 피해가 나고, 복귀 모션 전체(약 1.6초) 동안 행동을 막았다.
  spirit.recasting = true;
  const castSec = this._champData().E.recastCastTimeSec ?? 0.225;
  const eOutKey = 'yoneEOut';
  this._clearActionTimers();
  this.setState(STATE.E_CAST);
  this.currentActionKey = eOutKey; this.currentPhase = 'ACTIVE'; this.phaseCancelable = false;
  // 복귀(Spell3_Out) -> 마무리(Spell3_End1) -> 정지 상태면 Spell3_Out_toIdle. 잠금은 시전 시간까지만이고 남은 모션은 다음 행동이 덮어쓴다.
  const outClips = ['Spell3_Out', 'Spell3_End1'].filter((n) => this.findAnimation(n));
  if (outClips.length) {
    this.sequencePlayer.play({
      steps: outClips.map((n) => ({ animation: n, clipStart: 0, clipEnd: this.findAnimation(n).duration })),
      onComplete: () => { if (!this.currentActionKey && !this.targetPos && !this.pendingMove) this._yonePlayExitTransition(['Spell3_Out_toIdle'], [], () => {}); },
    });
  } else {
    this.playFirstAvailable(['Spell3_Out'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  }
  this._champTimeout(() => {
    if (this._yone.eSpirit !== spirit) return;
    this.root.position.copy(spirit.bodyPos);
    this.root.quaternion.copy(spirit.bodyQuat);
    vfx.spawn('e', this.root.position.clone());
    for (const [key, amount] of spirit.marks) {
      const target = spirit.markTargets.get(key);
      if (target && target.hp > 0 && amount > 0) {
        applyDamage(target, { rawDamage: amount, damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, source: this });
      }
    }
    this._yoneCleanupSpiritVisuals();
    this._yone.eSpirit = null;
    if (this.currentActionKey === eOutKey) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); }
  }, castSec * 1000);
};

// _yoneTick(dt)에서 매 프레임 호출된다: 돌진 이동 보간, 정신체 이동속도
// 램프(10%->30%, 5초 기준 선형), 육체<->영혼 연결 리본 갱신, 지속시간
// 만료 시 자동 재시전.
CharacterController.prototype._yoneUpdateESpirit = function(dt) {
  const spirit = this._yone && this._yone.eSpirit;
  if (!spirit) return;
  if (spirit.travelElapsed < spirit.travelDuration) {
    spirit.travelElapsed = Math.min(spirit.travelDuration, spirit.travelElapsed + Math.max(0, dt));
    const t = THREE.MathUtils.smoothstep(spirit.travelElapsed / spirit.travelDuration, 0, 1);
    this.root.position.lerpVectors(spirit.travelStart, spirit.travelEnd, t);
  }
  if (spirit.husk && spirit.husk.mixer && !spirit.husk.frozen) spirit.husk.mixer.update(dt);
  this._yoneUpdateSpiritBeam(spirit.bodyPos, this.root.position);
  this._yoneUpdateMarkIndicators();
  const e = this._champData().E;
  const elapsedSec = (performance.now() - spirit.startedAt) / 1000;
  const frac = Math.max(0, Math.min(1, elapsedSec / (spirit.duration || 5)));
  const msBonus = (e.moveSpeedBonusMin || 0.10) + ((e.moveSpeedBonusMax || 0.30) - (e.moveSpeedBonusMin || 0.10)) * frac;
  applyStatus(this, { id: 'yoneESpiritMS', type: 'MS_BUFF', duration: 0.3, value: msBonus });
  if (elapsedSec >= (spirit.duration || 5)) this._yoneRecastE();
};

/* ---------------- R: 운명봉인 ---------------- */

CharacterController.prototype._yoneCastR = function(mouseWorldPoint, free = false) {
  if (isSilenced(this) || isCrowdControlled(this)) return;
  if (!this._payCost('R', free)) return;
  const rLevel = Math.max(1, Math.min(3, Number(this.skillLevels.R) || 1));
  const r = this._champData().R;
  // 버그 수정("R이 마우스 커서 쪽으로 나가지 않는다"): 운명봉인은 직선
  // 스킬샷이라 우선 마우스 방향을 써야 한다. currentTarget은 마우스
  // 좌표가 없을 때(구버전 호출 경로 등)에 한해 보조 폴백으로만 쓴다.
  const dir = mouseWorldPoint
    ? new THREE.Vector3().subVectors(mouseWorldPoint, this.root.position).setY(0)
    : (this.currentTarget
      ? new THREE.Vector3().subVectors(getWorldPosition(this.currentTarget), this.root.position).setY(0)
      : new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion));
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  this.faceDirectionInstant(dir);

  const key = 'yoneR';
  this.setState(STATE.R_CAST);
  this.currentActionKey = key; this.currentPhase = 'STARTUP'; this.phaseCancelable = false;
  // 운명봉인 모션 체인(닐라와 동일한 패턴 - 캐스트 -> 마무리 -> 종료 전환을
  // 순서대로 이어붙인다): 시전 시점에 이동 중이었다면 이동용 마무리
  // 클립(Spell4_Out_Moving)과 Run 전환(Spell4_ToRun)을, 정지 중이었다면
  // 기본 마무리(Spell4_Out)와 Idle 전환(Spell4_ToIdle)을 사용한다. 이
  // 체인은 순수 시각 표현이며, 실제 행동 잠금 해제 타이밍(위키 공개:
  // 캐스트 후 0.45초 Lockout)은 아래 450ms 타이머가 그대로 담당한다 -
  // 애니메이션 폴리싱이 공식 게임플레이 타이밍을 늘리지 않는다.
  const movingAtCast = !!(this.targetPos || this.pendingMove);
  const outClip = (movingAtCast && this.findAnimation('Spell4_Out_Moving')) ? 'Spell4_Out_Moving' : 'Spell4_Out';
  const tailClip = movingAtCast ? 'Spell4_ToRun' : 'Spell4_ToIdle';
  const clips = ['Spell4', outClip, tailClip].filter((n) => this.findAnimation(n));
  if (clips.length) {
    this.sequencePlayer.play({ steps: clips.map((n) => ({ animation: n, clipStart: 0, clipEnd: this.findAnimation(n).duration })) });
  } else {
    this.playFirstAvailable(['Spell4'], { loop: THREE.LoopOnce, fade: 0.05, clampWhenFinished: true });
  }
  const origin = this.root.position.clone();
  const castTime = r.castTime || 0.75;
  const timer = this._champTimeout(() => {
    if (this.currentActionKey !== key) return;
    this.currentPhase = 'ACTIVE';
    // 1단계: 직선 범위(사거리/폭) 내 모든 적 넉다운+기절(위키: 1초).
    const halfWidth = lolRangeToWorld(r.width || 225) * 0.5;
    const lolRange = r.range || 1000;
    const worldRange = lolRangeToWorld(lolRange);
    const hits = [];
    for (const u of getAllEnemyUnits()) {
      if (!u || u.hp <= 0) continue;
      const p = getWorldPosition(u);
      const toUnit = new THREE.Vector3(p.x - origin.x, 0, p.z - origin.z);
      const along = toUnit.dot(dir), ur = getCollisionRadius(u) || 0;
      // 27차: 진행 방향 여유를 대상 판정 반경만큼만 준다. 예전엔 ±1 월드(약 115 LoL)를 줘서 요네 뒤쪽·사거리 끝 너머 대상도 맞았다.
      if (along < -ur || along > worldRange + ur) continue;
      const lateral = Math.sqrt(Math.max(0, toUnit.lengthSq() - along * along));
      if (lateral > halfWidth + ur) continue;
      hits.push({ unit: u, along });
    }
    hits.forEach((h) => applyStatus(h.unit, { id: 'yoneRStun', type: 'STUN', duration: r.stunDuration || 1, value: 1 }));
    // 피해는 베는 순간(1단계)에 들어간다 - 예전엔 0.3초 뒤 돌풍 때 들어갔다.
    const base = this._yoneLevelValue(r.totalMixedDamageByLevel, rLevel);
    const total = base + this._yoneBonusAD() * (r.bonusAdRatio || 0.8);
    hits.forEach((h) => {
      const t = h.unit;
      const half = total * 0.5;
      let dealtR = applyDamage(t, { isUltimate: true, rawDamage: half, damageType: DAMAGE_TYPE.PHYSICAL, isCritical: false, critMultiplier: 1, isAbility: true, source: this }) || 0;
      if (t.hp > 0) dealtR += applyDamage(t, { isUltimate: true, rawDamage: half, damageType: DAMAGE_TYPE.MAGICAL, isCritical: false, critMultiplier: 1, isAbility: true, source: this }) || 0;
      this._yoneRecordMark(t, dealtR);
    });
    // 2단계: 맞은 "적 챔피언" 중 가장 먼 대상 뒤 200(없으면 최대 사거리)으로 블링크.
    // 버그 수정: 예전엔 미니언까지 포함한 가장 먼 유닛 기준이었다.
    let blinkPos;
    const champHits = hits.filter((h) => h.unit.isChampion);
    if (champHits.length) {
      champHits.sort((a, b) => b.along - a.along);
      const furthest = champHits[0].along;
      blinkPos = origin.clone().addScaledVector(dir, Math.min(worldRange, furthest + lolRangeToWorld(r.blinkDistanceBehindTarget || 200)));
    } else {
      blinkPos = origin.clone().addScaledVector(dir, worldRange);
    }
    const map = (typeof window !== 'undefined' && window.HOWLING_ABYSS_MAP) || null;
    if (map && typeof map.clampPosition === 'function') map.clampPosition(blinkPos);
    this.root.position.copy(blinkPos);
    vfx.spawn('r', blinkPos.clone());
    // 27차: 벤 직선 판정(폭 r.width)을 바닥에 잠깐 그린다.
    if (typeof vfx.groundShapeFlash === 'function') vfx.groundShapeFlash(origin, dir, { kind: 'line', length: worldRange, width: halfWidth * 2 }, 0x8fb8ff, 0.5);
    // 3단계(PC 위키): 시전 종료 시점에 표식된 적을 블링크 지점 쪽으로 3000 속도로 끌어오고,
    // 끌려가는 순간 기절(1초)이 끝나며, 끌려간 "뒤"에 0.75초 공중에 뜬다. 예전엔 0.3초 뒤에
    // 모두를 블링크 지점 한 점으로 순간이동시키고 기절과 공중에 뜸을 겹쳐 걸었다.
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    hits.forEach((h, i) => {
      const t = h.unit;
      if (!t || t.hp <= 0 || !t.mesh || !t.mesh.position) return;
      const pullTarget = blinkPos.clone().addScaledVector(dir, -lolRangeToWorld(100))
        .addScaledVector(side, ((i % 3) - 1) * lolRangeToWorld(60));
      pullTarget.y = t.mesh.position.y;
      const dist = new THREE.Vector3().subVectors(pullTarget, t.mesh.position).setY(0).length();
      const pullSec = Math.max(0.05, dist / lolRangeToWorld(r.pullSpeed || 3000));
      if (typeof clearStatus === 'function') clearStatus(t, 'yoneRStun');
      t._pullState = { from: t.mesh.position.clone(), to: pullTarget, duration: pullSec, elapsed: 0 };
      const kt = this._champTimeout(() => {
        if (t.hp > 0) applyStatus(t, { id: 'yoneRKnockup', type: 'KNOCKUP', duration: (r.knockupDuration || 0.75), value: 1 });
      }, pullSec * 1000);
      void kt; // 요네가 다른 행동을 시작해도 이미 끌려가는 대상의 공중에 뜸은 취소되면 안 된다
    });
    if (hits.length) debugSkillHit('Yone R', hits[0].unit); else debugSkillMiss('R', '사거리 내 대상 없음');
    this.currentPhase = 'RECOVERY';
    const rec = this._champTimeout(() => { if (this.currentActionKey === key) { this.currentActionKey = null; this.currentPhase = null; this._resumeAfterAction(); } }, 450); // 위키: 시전 후 0.45초 행동 잠금(Lockout)
    this._actionTimers.push(rec);
  }, Math.max(0, castTime) * 1000);
  this._actionTimers.push(timer);
  if (!free) this.cooldowns.R = abilityHasteCooldown(this, this._yoneLevelValue(r.cooldown, rLevel));
};

/* ---------------- 매 프레임 tick ---------------- */

CharacterController.prototype._yoneTick = function(dt) {
  if (!this._yone) return;
  this._yoneQStackTick();
  this._yoneTickEmpoweredQ(dt);
  this._yoneUpdateESpirit(dt);
  // W 보호막 지속시간 만료 처리(다른 챔피언이 보호막을 다시 걸지 않았다면).
  if (false) { // 요네 W 보호막 만료는 보호막 인스턴스 모델(tickShields)이 처리한다.
  }
  // 치명타 확률/초과분 추가 공격력은 recomputeStats()의 공용 "의지" 처리로 옮겼다
  // (예전엔 매 프레임 치명타 확률 100% 강제 + 매 프레임 recomputeStats 호출).
};
