/* ============================================================
   SUMMONER SPELLS (소환사 주문 - 36차)
   ------------------------------------------------------------
   요청("스펠칸과 스펠을 적용해줘") - 하단 HUD에 소환사 주문 두 칸(D·F - 원작 기본 키)을 두고, 이 맵(칼바람 나락)에서
   쓰는 주문 9종을 넣는다: 점멸·회복·유체화·방어막·탈진·점화·정화·총명·표식. 순간이동·강타는 칼바람에서 못 쓰는
   주문이라 뺐다(Data Dragon modes에 ARAM이 없음).

   수치 출처(웹 문서를 직접 읽을 수 없는 환경이라 확인 수준을 같이 적는다):
   - Data Dragon 16.20.1 summoner.json(GitHub 미러): 모든 주문의 재사용 대기시간·사거리, 점멸 거리 400,
     총명 50%/25%, 표식 피해 10+5×레벨·재사용 3초·돌진 시 재사용 대기시간 25% 감소.
   - 검색 결과(패치 노트·위키 요약): 점화 70~475(25.9), 정화 강인함 75% 3초(14.10), 탈진 둔화 40%(14.10),
     방어막 120~480(14.10), 회복 80~318 + 이동 속도 30% 1초.
   - 확인 못 함(추정값 - 원작과 다를 수 있음, estimated:true): 유체화 이동 속도 24~48%·10초, 방어막 지속 2.5초,
     탈진 피해 감소 35%·지속 2.5초, 점화 고통스러운 상처 40%, 표식 눈덩이 속도·폭·돌진 속도.
   레벨 구간 수치는 1→18레벨 직선 보간이다(원작 공식이 직선이 아닐 수 있다).
   ============================================================ */
const SUMMONER_SPELL_DATA = {
  flash: { ddKey: 'SummonerFlash', nameKo: '점멸', cooldown: 300, distance: 400,
    descKo: '커서 방향으로 400 거리를 순간이동합니다.' },
  heal: { ddKey: 'SummonerHeal', nameKo: '회복', cooldown: 240, range: 875, healMin: 80, healMax: 318, msPercent: 0.30, msDurationSec: 1,
    descKo: '자신과 커서에 가장 가까운 아군 챔피언의 체력을 80~318(레벨 비례) 회복하고 1초 동안 이동 속도를 30% 올립니다.' },
  ghost: { ddKey: 'SummonerHaste', nameKo: '유체화', cooldown: 240, msMin: 0.24, msMax: 0.48, durationSec: 10, estimated: true,
    descKo: '10초 동안 이동 속도가 24~48%(레벨 비례) 오르고 유닛과 충돌하지 않습니다.' },
  barrier: { ddKey: 'SummonerBarrier', nameKo: '방어막', cooldown: 180, shieldMin: 120, shieldMax: 480, durationSec: 2.5, estimated: true,
    descKo: '2.5초 동안 120~480(레벨 비례)의 피해를 흡수하는 보호막을 얻습니다.' },
  exhaust: { ddKey: 'SummonerExhaust', nameKo: '탈진', cooldown: 240, range: 650, slowPercent: 0.40, damageReduction: 0.35, durationSec: 2.5, estimated: true, targeted: true,
    descKo: '대상 적 챔피언을 2.5초 동안 40% 둔화시키고 그동안 입히는 피해를 35% 줄입니다.' },
  ignite: { ddKey: 'SummonerDot', nameKo: '점화', cooldown: 180, range: 600, dmgMin: 70, dmgMax: 475, durationSec: 5, grievousPercent: 0.40, targeted: true,
    descKo: '대상 적 챔피언에게 5초에 걸쳐 70~475(레벨 비례) 고정 피해를 입히고 고통스러운 상처를 남기며 위치를 드러냅니다.' },
  cleanse: { ddKey: 'SummonerBoost', nameKo: '정화', cooldown: 240, tenacity: 0.75, durationSec: 3,
    descKo: '모든 군중 제어(제압·공중에 뜸 제외)와 소환사 주문 해로운 효과를 없애고 3초 동안 강인함 75%를 얻습니다.' },
  clarity: { ddKey: 'SummonerMana', nameKo: '총명', cooldown: 240, range: 600, selfPercent: 0.50, allyPercent: 0.25,
    descKo: '최대 마나의 50%를 회복하고 주변 아군은 최대 마나의 25%를 회복합니다(마나를 쓰는 챔피언만).' },
  mark: { ddKey: 'SummonerSnowball', nameKo: '표식', cooldown: 80, range: 1600, baseDamage: 10, damagePerLevel: 5, recastSec: 3, dashCdrPercent: 0.25,
    missileSpeed: 1300, halfWidth: 40, dashSpeed: 1500, estimated: true,
    descKo: '직선으로 눈덩이를 던져 처음 맞은 적에게 10+5×레벨 고정 피해와 표식을 남깁니다. 3초 안에 다시 쓰면 표식 대상에게 돌진해 같은 피해를 입히고 재사용 대기시간이 25% 줄어듭니다.' },
};
const SUMMONER_SPELL_ORDER = ['flash', 'heal', 'ghost', 'barrier', 'exhaust', 'ignite', 'cleanse', 'clarity', 'mark'];
const SUMMONER_SLOTS = ['D', 'F'];
// 정화가 지우는 군중 제어(제압·공중에 뜸 제외 - 원작).
const CLEANSE_TYPES = new Set(['STUN', 'ROOT', 'SLOW', 'SILENCE', 'CHARM', 'FEAR', 'TAUNT']);

function _summonerLevelValue(ctrl, min, max) {
  const lvl = Math.max(1, Math.min(18, (ctrl && ctrl.champLevel) || 1));
  return min + (max - min) * (lvl - 1) / 17;
}
function ensureSummoners(ctrl) {
  if (!ctrl) return null;
  if (!ctrl.summoners) ctrl.summoners = { D: { id: 'flash', readyAt: 0 }, F: { id: 'heal', readyAt: 0 } };
  return ctrl.summoners;
}
function summonerRemainingSec(ctrl, slot) {
  const s = ensureSummoners(ctrl)[slot];
  return s ? Math.max(0, (s.readyAt - performance.now()) / 1000) : 0;
}
// 슬롯 주문 바꾸기 - 이미 다른 칸에 있는 주문이면 두 칸을 서로 바꾼다(원작처럼 같은 주문 두 개는 못 든다).
// 연습장이라 바꾼 칸은 바로 쓸 수 있다.
function setSummonerSpell(ctrl, slot, id) {
  const s = ensureSummoners(ctrl);
  if (!s || !SUMMONER_SPELL_DATA[id] || !s[slot]) return false;
  const other = SUMMONER_SLOTS.find((k) => k !== slot && s[k].id === id);
  if (other) { const tmp = s[slot]; s[slot] = s[other]; s[other] = tmp; }
  else s[slot] = { id, readyAt: 0 };
  if (ctrl._summonerMark && s[slot].id !== 'mark' && !SUMMONER_SLOTS.some((k) => s[k].id === 'mark')) ctrl._summonerMark = null;
  if (typeof updateSummonerUI === 'function') updateSummonerUI(ctrl, true);
  return true;
}
function _summonerFail(msg) { if (typeof showSkillToast === 'function') showSkillToast(msg); return false; }
function _summonerTargetAt(ctrl, pointerClient, rangeLol) {
  // 커서 아래 적 챔피언 → 없으면 지금 공격 대상(챔피언일 때). 사거리 밖이면 null + 이유.
  let t = null;
  if (pointerClient && typeof getEnemyHit === 'function') { const h = getEnemyHit(pointerClient.x, pointerClient.y); if (h && h.isChampion) t = h; }
  if (!t && ctrl.currentTarget && ctrl.currentTarget.isChampion && ctrl.currentTarget.hp > 0) t = ctrl.currentTarget;
  if (!t) return { target: null, reason: '대상 적 챔피언이 없습니다(커서를 적 챔피언 위에)' };
  if (typeof isInRange === 'function' && !isInRange(ctrl, t, rangeLol)) return { target: null, reason: '사거리 밖입니다' };
  return { target: t, reason: null };
}

// 슬롯(D/F) 주문 시전. mousePoint: 커서 아래 지면 좌표, pointerClient: 화면 좌표(대상 지정 주문용).
function castSummonerSpell(ctrl, slot, mousePoint, pointerClient) {
  const s = ensureSummoners(ctrl);
  if (!s || !s[slot]) return false;
  const id = s[slot].id, d = SUMMONER_SPELL_DATA[id];
  if (!d) return false;
  if (ctrl.hp <= 0 || ctrl.state === STATE.DEAD || ctrl.state === STATE.RESPAWN) return false;
  const now = performance.now();
  const markRecast = id === 'mark' && ctrl._summonerMark && now < ctrl._summonerMark.expiresAt && ctrl._summonerMark.target && ctrl._summonerMark.target.hp > 0;
  if (!markRecast && now < s[slot].readyAt) return _summonerFail(`${d.nameKo} - 재사용 대기시간 ${Math.ceil((s[slot].readyAt - now) / 1000)}초`);
  // 기절 등 행동 불가 중에는 정화만 쓸 수 있다. 속박 중에는 점멸·표식 돌진을 못 쓴다(이동 주문).
  if (id !== 'cleanse' && typeof isCrowdControlled === 'function' && isCrowdControlled(ctrl)) return _summonerFail(`${d.nameKo} - 행동 불가 상태`);
  if ((id === 'flash' || markRecast) && typeof isRooted === 'function' && isRooted(ctrl)) return _summonerFail(`${d.nameKo} - 속박 상태`);
  if ((id === 'flash' || markRecast) && ctrl._dashState) return _summonerFail(`${d.nameKo} - 돌진 중`);
  let ok = false;
  switch (id) {
    case 'flash': ok = _summonerFlash(ctrl, d, mousePoint); break;
    case 'heal': ok = _summonerHeal(ctrl, d, mousePoint); break;
    case 'ghost': applyStatus(ctrl, { id: 'summonerGhost', type: 'MS_BUFF', duration: d.durationSec, value: _summonerLevelValue(ctrl, d.msMin, d.msMax) }); ok = true; break;
    case 'barrier':
      addShield(ctrl, 'summonerBarrier', _summonerLevelValue(ctrl, d.shieldMin, d.shieldMax) * getShieldReceivedMultiplier(ctrl), d.durationSec);
      if (typeof vfx !== 'undefined') vfx.groundShockwave(ctrl.root.position.clone(), BASE_UNIT * 0.9, 0xffe08a, 0.4);
      ok = true; break;
    case 'exhaust': ok = _summonerExhaust(ctrl, d, pointerClient); break;
    case 'ignite': ok = _summonerIgnite(ctrl, d, pointerClient); break;
    case 'cleanse': _summonerCleanse(ctrl, d); ok = true; break;
    case 'clarity': ok = _summonerClarity(ctrl, d); break;
    case 'mark': ok = markRecast ? _summonerMarkDash(ctrl, d, slot) : _summonerMarkThrow(ctrl, d, mousePoint); break;
  }
  if (!ok) return false;
  // 원작: 소환사 주문을 쓰면 귀환이 끊긴다.
  if (ctrl.state === STATE.RECALL && typeof ctrl.cancelRecall === 'function') { ctrl.cancelRecall(); ctrl.setState(STATE.IDLE); if (typeof ctrl._returnToLocomotion === 'function') ctrl._returnToLocomotion(); }
  if (!markRecast) s[slot].readyAt = now + d.cooldown * 1000;
  if (typeof updateBars === 'function') updateBars(ctrl);
  updateSummonerUI(ctrl, true);
  return true;
}

function _summonerFlash(ctrl, d, mousePoint) {
  const from = ctrl.root.position.clone();
  const dir = mousePoint ? new THREE.Vector3(mousePoint.x - from.x, 0, mousePoint.z - from.z) : new THREE.Vector3(0, 0, 1).applyQuaternion(ctrl.root.quaternion);
  const len = dir.length();
  if (len < 1e-4) dir.set(0, 0, 1).applyQuaternion(ctrl.root.quaternion); else dir.multiplyScalar(1 / len);
  const dist = Math.min(len || Infinity, lolRangeToWorld(d.distance));
  let to = from.clone().addScaledVector(dir, dist);
  // 벽 너머·맵 밖이면 걸을 수 있는 가장 가까운 곳으로(죽음의 세계 안이면 그 경계도 지킨다).
  if (typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap && howlingAbyssMap.clampPosition) to = howlingAbyssMap.clampPosition(to);
  if (ctrl.realmId && ctrl.realmId !== 'main' && typeof clampToDeathRealm === 'function' && typeof getDeathRealm === 'function') to = clampToDeathRealm(to, getDeathRealm(ctrl.realmId), ctrl.pathingRadius ?? ctrl.collisionRadius ?? 0);
  to.y = from.y;
  ctrl.root.position.copy(to);
  ctrl.faceDirectionInstant(dir);
  if (typeof vfx !== 'undefined') {
    vfx.groundShockwave(from, BASE_UNIT * 0.7, 0xfff3a0, 0.35);
    vfx.groundShockwave(to, BASE_UNIT * 0.7, 0xfff3a0, 0.35);
  }
  return true;
}
function _summonerHeal(ctrl, d, mousePoint) {
  const amount = _summonerLevelValue(ctrl, d.healMin, d.healMax);
  ctrl.hp = Math.min(ctrl.maxHp, ctrl.hp + amount * getHealReceivedMultiplier(ctrl));
  applyStatus(ctrl, { id: 'summonerHealMs', type: 'MS_BUFF', duration: d.msDurationSec, value: d.msPercent });
  if (typeof vfx !== 'undefined') vfx.groundShockwave(ctrl.root.position.clone(), BASE_UNIT * 0.9, 0x7dffa0, 0.45);
  // 커서에 가장 가까운 사거리 안 아군 챔피언(이 연습장에선 아군 더미) 하나.
  if (typeof placedAllies !== 'undefined' && placedAllies.length) {
    const ref = mousePoint || ctrl.root.position;
    let best = null, bestD = Infinity;
    for (const a of placedAllies) {
      if (!a || a.hp <= 0) continue;
      const p = getWorldPosition(a);
      if (!isInRange(ctrl, a, d.range)) continue; // 45차: 대상 가장자리 기준(다른 대상 지정과 같은 규칙)
      const dd = getHorizontalDistance(p, ref);
      if (dd < bestD) { bestD = dd; best = a; }
    }
    if (best) {
      if (typeof healAlly === 'function') healAlly(ctrl, best, amount);
      applyStatus(best, { id: 'summonerHealMs', type: 'MS_BUFF', duration: d.msDurationSec, value: d.msPercent, source: ctrl });
    }
  }
  return true;
}
function _summonerExhaust(ctrl, d, pointerClient) {
  const { target, reason } = _summonerTargetAt(ctrl, pointerClient, d.range);
  if (!target) return _summonerFail(`탈진 - ${reason}`);
  applyStatus(target, { id: 'summonerExhaustSlow', type: 'SLOW', duration: d.durationSec, value: d.slowPercent, source: ctrl, summonerDebuff: true });
  applyStatus(target, { id: 'summonerExhaust', type: 'EXHAUSTED', duration: d.durationSec, value: d.damageReduction, source: ctrl, summonerDebuff: true });
  if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(target).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0x9a8cff });
  return true;
}
function _summonerIgnite(ctrl, d, pointerClient) {
  const { target, reason } = _summonerTargetAt(ctrl, pointerClient, d.range);
  if (!target) return _summonerFail(`점화 - ${reason}`);
  const total = _summonerLevelValue(ctrl, d.dmgMin, d.dmgMax);
  applyStatus(target, { id: 'summonerIgnite', type: 'DOT', duration: d.durationSec, totalDamage: total, damageType: DAMAGE_TYPE.TRUE, tickInterval: 1.0, source: ctrl, summonerDebuff: true });
  applyStatus(target, { id: 'summonerIgniteGrievous', type: 'GRIEVOUS', duration: d.durationSec, value: d.grievousPercent, source: ctrl, summonerDebuff: true });
  if (typeof visionSystem !== 'undefined' && visionSystem && visionSystem.revealUnit) visionSystem.revealUnit(target, d.durationSec, ctrl.team || PLAYER_TEAM);
  if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(target).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xff7a2a });
  return true;
}
function _summonerCleanse(ctrl, d) {
  const now = performance.now();
  ctrl.statusEffects = (ctrl.statusEffects || []).filter((e) => !(e.expiresAt > now && (CLEANSE_TYPES.has(e.type) || (e.summonerDebuff && e.source !== ctrl))));
  if (typeof refreshUnitCcTags === 'function') refreshUnitCcTags(ctrl);
  applyStatus(ctrl, { id: 'summonerCleanseTenacity', type: 'TENACITY', duration: d.durationSec, value: d.tenacity });
  if (typeof vfx !== 'undefined') vfx.groundShockwave(ctrl.root.position.clone(), BASE_UNIT * 0.9, 0xbfefff, 0.4);
}
function _summonerUsesMana(ctrl) {
  const cd = typeof CHAMPION_DATA !== 'undefined' ? CHAMPION_DATA[ctrl.championId] : null;
  return !!(cd && cd.stats && cd.stats.mana > 0 && ctrl.championId !== 'leesin'); // 리 신은 기력(mp 칸을 같이 씀)
}
function _summonerClarity(ctrl, d) {
  if (!_summonerUsesMana(ctrl)) return _summonerFail('총명 - 마나를 쓰지 않는 챔피언입니다');
  ctrl.mp = Math.min(ctrl.maxMp, ctrl.mp + ctrl.maxMp * d.selfPercent);
  if (typeof placedAllies !== 'undefined') {
    for (const a of placedAllies) {
      if (!a || a.hp <= 0 || !(a.maxMp > 0)) continue;
      if (isInRange(ctrl, a, d.range)) a.mp = Math.min(a.maxMp, (a.mp || 0) + a.maxMp * d.allyPercent);
    }
  }
  if (typeof vfx !== 'undefined') vfx.groundShockwave(ctrl.root.position.clone(), BASE_UNIT * 0.9, 0x6fb6ff, 0.45);
  return true;
}
// 표식 1: 눈덩이 - 45차: 피할 수 있는 직선 스킬샷(투사체 시스템의 line 모드). 눈덩이 모양은 그 투사체를 따라간다.
// 예전엔 던지는 순간 직선 위 첫 대상을 정해 두고, 눈덩이가 도착하면 대상이 어디로 갔든 맞았다.
const _summonerSnowballs = [];
function _summonerMarkThrow(ctrl, d, mousePoint) {
  const origin = ctrl.root.position.clone();
  const dir = mousePoint ? new THREE.Vector3(mousePoint.x - origin.x, 0, mousePoint.z - origin.z) : new THREE.Vector3(0, 0, 1).applyQuaternion(ctrl.root.quaternion);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1).applyQuaternion(ctrl.root.quaternion); else dir.normalize();
  ctrl.faceDirectionInstant(dir);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BASE_UNIT * 0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
  mesh.position.copy(origin).setY(origin.y + BASE_UNIT * 0.6);
  if (typeof scene !== 'undefined') scene.add(mesh);
  const b = { ctrl, d, mesh, proj: null };
  b.proj = projectiles.spawn({
    from: mesh.position.clone(), speed: lolRangeToWorld(d.missileSpeed), color: 0xf4fbff, realmId: ctrl.realmId, hidden: true,
    line: { dir, maxDist: lolRangeToWorld(d.range), halfWidth: lolRangeToWorld(d.halfWidth), filter: (u) => !u.isStructure },
    onHit: (u) => _summonerSnowballLand(b, u),
  });
  _summonerSnowballs.push(b);
  return true;
}
function _summonerSnowballLand(b, hit) {
  const { ctrl, d } = b;
  if (!hit || hit.hp <= 0 || hit.destroyed || hit.isDead) return;
  applyDamage(hit, { rawDamage: d.baseDamage + d.damagePerLevel * (ctrl.champLevel || 1), damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, source: ctrl });
  if (hit.hp <= 0) return;
  ctrl._summonerMark = { target: hit, expiresAt: performance.now() + d.recastSec * 1000 };
  if (typeof visionSystem !== 'undefined' && visionSystem && visionSystem.revealUnit) visionSystem.revealUnit(hit, d.recastSec, ctrl.team || PLAYER_TEAM);
  if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(hit).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xe8f6ff });
  updateSummonerUI(ctrl, true);
}
// 표식 2: 돌진 - 리 신 Q2와 같은 "따라가는 돌진"(_dashState.follow)으로 대상에게 닿을 때까지 간다. 닿으면 같은 피해.
// 돌진하면 재사용 대기시간이 25% 줄어든다(Data Dragon e4).
function _summonerMarkDash(ctrl, d, slot) {
  const m = ctrl._summonerMark;
  const target = m.target;
  ctrl._summonerMark = null;
  const s = ensureSummoners(ctrl)[slot];
  s.readyAt -= d.cooldown * d.dashCdrPercent * 1000;
  const pos = ctrl.root.position, tp = getWorldPosition(target);
  const dir = new THREE.Vector3(tp.x - pos.x, 0, tp.z - pos.z);
  if (dir.lengthSq() > 1e-8) { dir.normalize(); ctrl.faceDirectionInstant(dir); }
  if (typeof ctrl._clearActionTimers === 'function') ctrl._clearActionTimers();
  ctrl.currentActionKey = 'summonerMarkDash'; ctrl.currentPhase = 'ACTIVE'; ctrl.phaseCancelable = false;
  ctrl.currentTarget = null; ctrl.targetPos = null; ctrl.isChasing = false;
  ctrl.setState(STATE.MOVE);
  ctrl.playFirstAvailable(ctrl._moveClips(), { loop: THREE.LoopRepeat, fade: 0.1 });
  const stopDist = (ctrl.collisionRadius || BASE_UNIT * 0.3) * 2;
  const finish = () => {
    if (ctrl.currentActionKey === 'summonerMarkDash') { ctrl.currentActionKey = null; ctrl.currentPhase = null; ctrl.phaseCancelable = false; }
    if (target && target.hp > 0 && !target.destroyed && !target.isDead && getHorizontalDistance(getWorldPosition(target), ctrl.root.position) <= stopDist + BASE_UNIT * 0.6) {
      applyDamage(target, { rawDamage: d.baseDamage + d.damagePerLevel * (ctrl.champLevel || 1), damageType: DAMAGE_TYPE.TRUE, isCritical: false, critMultiplier: 1, source: ctrl });
      if (typeof vfx !== 'undefined') vfx.spawn('hit', getWorldPosition(target).clone().add(new THREE.Vector3(0, BASE_UNIT * 0.9, 0)), undefined, { color: 0xe8f6ff });
    }
    if (ctrl.state === STATE.MOVE && !ctrl.targetPos) ctrl.setState(STATE.IDLE);
    if (typeof ctrl._resumeAfterAction === 'function') ctrl._resumeAfterAction(); else if (typeof ctrl._returnToLocomotion === 'function') ctrl._returnToLocomotion();
  };
  ctrl._dashState = {
    from: pos.clone(), to: pos.clone(), duration: 4, elapsed: 0, faceDir: dir.clone(),
    follow: { target, speed: lolRangeToWorld(d.dashSpeed), stopDist, lastTargetPos: getWorldPosition(target).clone() },
    onArrive: finish,
  };
  return true;
}
// 매 프레임: 날아가는 눈덩이 이동·착탄, 표식 만료.
function summonerSpellTick(dt) {
  for (let i = _summonerSnowballs.length - 1; i >= 0; i--) {
    const b = _summonerSnowballs[i];
    if (!b.proj.done) { b.mesh.position.set(b.proj.mesh.position.x, b.mesh.position.y, b.proj.mesh.position.z); continue; }
    if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
    b.mesh.geometry.dispose(); b.mesh.material.dispose();
    _summonerSnowballs.splice(i, 1);
  }
  const ctrl = typeof controller !== 'undefined' ? controller : null;
  if (ctrl && ctrl._summonerMark && (performance.now() >= ctrl._summonerMark.expiresAt || !(ctrl._summonerMark.target && ctrl._summonerMark.target.hp > 0))) {
    ctrl._summonerMark = null;
    updateSummonerUI(ctrl, true);
  }
}
// 탈진(EXHAUSTED)이 걸린 공격자가 입히는 피해 감소율 - calculateDamage()가 마지막에 곱한다.
function getOutgoingDamageReductionPercent(source) {
  if (!source || !source.statusEffects) return 0;
  const now = performance.now();
  let v = 0;
  for (const e of source.statusEffects) if (e.type === 'EXHAUSTED' && e.expiresAt > now) v = Math.max(v, e.value || 0);
  return Math.min(1, v);
}

/* ---------------- HUD(D/F 칸 + 주문 고르기) ---------------- */
let _summonerUiSig = '';
let _summonerPickerSlot = null;
function _summonerIconHtml(id, cls) {
  const d = SUMMONER_SPELL_DATA[id];
  if (!d) return '';
  return `<div class="spell-icon-img ${cls || ''}"><span>${d.nameKo.slice(0, 2)}</span><img src="assets/spells/${id}.png" alt="" draggable="false" onerror="this.remove()"></div>`;
}
function _summonerTitle(id) {
  const d = SUMMONER_SPELL_DATA[id];
  return d ? `${d.nameKo} (재사용 대기시간 ${d.cooldown}초)\n${d.descKo}${d.estimated ? '\n* 일부 수치는 확인하지 못한 추정값' : ''}` : '';
}
// 칸 그리기. 재사용 대기시간 숫자는 매 프레임이 아니라 0.1초 단위로 바뀔 때만 다시 쓴다.
function updateSummonerUI(ctrl, force) {
  const bar = document.getElementById('spellBar');
  if (!bar || !ctrl) return;
  const s = ensureSummoners(ctrl);
  const now = performance.now();
  const markReady = ctrl._summonerMark && now < ctrl._summonerMark.expiresAt;
  const parts = SUMMONER_SLOTS.map((k) => {
    const r = Math.max(0, (s[k].readyAt - now) / 1000);
    return `${k}:${s[k].id}:${r > 0 ? (r >= 1 ? Math.ceil(r) : r.toFixed(1)) : 0}:${s[k].id === 'mark' && markReady ? 'M' : ''}`;
  });
  const sig = parts.join('|');
  if (!force && sig === _summonerUiSig) return;
  _summonerUiSig = sig;
  for (const k of SUMMONER_SLOTS) {
    const el = document.getElementById('spellSlot' + k);
    if (!el) continue;
    const id = s[k].id;
    const r = Math.max(0, (s[k].readyAt - now) / 1000);
    const recast = id === 'mark' && markReady;
    if (el.dataset.spell !== id) {
      el.dataset.spell = id;
      el.innerHTML = `${_summonerIconHtml(id)}<span class="key">${k}</span><div class="cd"></div>`;
      el.title = `${k}: ${_summonerTitle(id)}`;
    }
    const cd = el.querySelector('.cd');
    const showCd = r > 0 && !recast;
    cd.style.display = showCd ? '' : 'none';
    if (showCd) cd.textContent = r >= 1 ? Math.ceil(r) : r.toFixed(1);
    el.classList.toggle('ready', !showCd);
    el.classList.toggle('recast', !!recast);
  }
}
function _renderSummonerPicker() {
  const box = document.getElementById('spellPicker');
  if (!box) return;
  const ctrl = typeof controller !== 'undefined' ? controller : null;
  if (_summonerPickerSlot == null || !ctrl) { box.classList.remove('show'); return; }
  const s = ensureSummoners(ctrl);
  let html = `<div class="sp-head"><span>${_summonerPickerSlot} 칸 주문 고르기</span><div class="sp-tabs">${SUMMONER_SLOTS.map((k) => `<button class="sp-tab${k === _summonerPickerSlot ? ' active' : ''}" data-slot="${k}">${k}</button>`).join('')}</div><button class="sp-close" data-close="1">✕</button></div><div class="sp-grid">`;
  for (const id of SUMMONER_SPELL_ORDER) {
    const d = SUMMONER_SPELL_DATA[id];
    const inSlot = SUMMONER_SLOTS.find((k) => s[k].id === id);
    html += `<button class="sp-item${inSlot === _summonerPickerSlot ? ' current' : ''}" data-spell="${id}" title="${_summonerTitle(id).replace(/"/g, '&quot;')}">${_summonerIconHtml(id)}<b>${d.nameKo}</b><small>${inSlot ? inSlot + ' 칸' : d.cooldown + '초'}</small></button>`;
  }
  html += '</div><div class="sp-desc" id="spellPickerDesc">주문에 마우스를 올리면 설명이 나옵니다. 다른 칸에 있는 주문을 고르면 두 칸이 서로 바뀝니다.</div>';
  box.innerHTML = html;
  box.classList.add('show');
}
function openSummonerPicker(slot) { _summonerPickerSlot = _summonerPickerSlot === slot ? null : slot; _renderSummonerPicker(); }
function closeSummonerPicker() { _summonerPickerSlot = null; _renderSummonerPicker(); }

(function initSummonerUi() {
  const bar = document.getElementById('spellBar');
  if (!bar) return;
  // 칸 클릭 = 시전(원작), 칸 아래 "주문 변경" = 고르기 창.
  for (const k of SUMMONER_SLOTS) {
    const el = document.getElementById('spellSlot' + k);
    if (el) el.addEventListener('click', () => { if (typeof controller !== 'undefined' && controller) castSummonerSpell(controller, k, typeof lastGroundPoint !== 'undefined' ? lastGroundPoint : null, null); });
  }
  const btn = document.getElementById('spellChangeBtn');
  if (btn) btn.addEventListener('click', () => openSummonerPicker(_summonerPickerSlot ? null : 'D'));
  const box = document.getElementById('spellPicker');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const ctrl = typeof controller !== 'undefined' ? controller : null;
    if (e.target.closest('[data-close]')) { closeSummonerPicker(); return; }
    const tab = e.target.closest('[data-slot]');
    if (tab) { _summonerPickerSlot = tab.dataset.slot; _renderSummonerPicker(); return; }
    const item = e.target.closest('[data-spell]');
    if (item && ctrl) { setSummonerSpell(ctrl, _summonerPickerSlot, item.dataset.spell); _renderSummonerPicker(); }
  });
  box.addEventListener('mouseover', (e) => {
    const item = e.target.closest('[data-spell]');
    const desc = document.getElementById('spellPickerDesc');
    if (item && desc) { const d = SUMMONER_SPELL_DATA[item.dataset.spell]; desc.textContent = `${d.nameKo} · ${d.cooldown}초 - ${d.descKo}${d.estimated ? ' (일부 수치 추정)' : ''}`; }
  });
})();
