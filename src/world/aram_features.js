/* ============================================================
   74차: 최신 칼바람 나락 맵 장치 - 회복 유물(Health Relic)과 서리 관문(Frost Gate, 협곡의 마법공학 관문에 해당)
   ------------------------------------------------------------
   출처(2026년 확인, LoL 위키 Health Relic 문서를 인용한 공략 글들 - 위키 자체는 이 환경에서 열리지 않았다):
   - 회복 유물: 양 팀 2개씩 모두 4개, 다리 아래쪽(가까운) 벽 옆. "바깥 유물"은 외곽 포탑 앞(다리 가운데 쪽), "안쪽 유물"은
     외곽 포탑과 억제기 포탑 사이. 처음 등장 바깥 1:45, 안쪽 2:30. 먹은 챔피언은 잃은 체력·마나의 8%를 바로 회복하고,
     약 2.5초 뒤 그 자리에 빛줄기가 떨어져 850 범위 안 아군 챔피언이 잃은 체력·마나의 16%를 회복한다. 빛줄기 90초 뒤 다시 생긴다.
   - 서리 관문: 각 팀 넥서스 옆. 게임 시작부터 자기 외곽 포탑으로 이어지고, 외곽 포탑이 부서지면 억제기 포탑으로 이어진다.
     기지 → 다리 방향 한쪽으로만 간다(반대로는 못 온다).
   이 맵은 "아래쪽"을 +x로 둔다(brush_system.js 칼바람 부쉬 배치와 같은 약속). 관문의 정확한 자리·이동 시간·재사용 대기는
   자료가 없어 근사값이다(ARAM_GATE_*).
   ============================================================ */
const ARAM_RELIC_PICKUP_LOL = 150;      // 이 거리 안(챔피언 충돌 반경 더해서)으로 들어오면 먹는다(근사)
const ARAM_RELIC_BEAM_DELAY_SEC = 2.5;
const ARAM_RELIC_BEAM_RADIUS_LOL = 850;
const ARAM_RELIC_RESPAWN_SEC = 90;
const ARAM_RELIC_INSTANT_PCT = 0.08;
const ARAM_RELIC_BEAM_PCT = 0.16;
const ARAM_GATE_RADIUS_LOL = 170;        // 관문 발판 반경(근사)
const ARAM_GATE_TRAVEL_SEC = 0.9;        // 관문 이동 시간(근사)
const ARAM_GATE_LOCKOUT_SEC = 3;         // 같은 챔피언이 다시 타기까지(연속 발동 방지, 근사)
const ARAM_GATE_EXIT_BEHIND_LOL = 350;   // 도착 지점: 이어진 포탑에서 자기 기지 쪽으로 이만큼 뒤

const aramRelics = [];
const aramGates = [];
let aramFeaturesBuilt = false;

function _aramMat(color, intensity = 1, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .35, ...extra });
}
function _aramChampions() {
  const list = [];
  if (typeof listChampionUnits === 'function') list.push(...listChampionUnits().filter((c) => c && c.root && c.state !== STATE.DEAD)); // 95차: 적 챔피언 봇도
  else if (typeof controller !== 'undefined' && controller && controller.root) list.push(controller);
  if (typeof placedAllies !== 'undefined') list.push(...placedAllies);
  return list.filter((u) => u && u.hp > 0);
}
function _aramPos(u) { return u.root ? u.root.position : getWorldPosition(u); }
function _aramHealMissing(u, pct) {
  if (!u || !(u.hp > 0)) return;
  const mult = typeof getHealReceivedMultiplier === 'function' ? getHealReceivedMultiplier(u) : 1;
  u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - u.hp) * pct * mult);
  if (typeof u.mp === 'number' && u.maxMp > 0) u.mp = Math.min(u.maxMp, u.mp + (u.maxMp - u.mp) * pct);
}

function buildAramFeatures() {
  if (aramFeaturesBuilt || typeof howlingAbyssMap === 'undefined' || !howlingAbyssMap || !howlingAbyssMap.group) return false;
  aramFeaturesBuilt = true;
  const map = howlingAbyssMap;
  const edgeX = (z) => map.clampPosition(new THREE.Vector3(1e6, 0, z)).x; // 아래쪽 벽(+x) 안쪽 끝
  for (const team of ['BLUE', 'RED']) {
    const s = HA_STRUCTURES_LOL[team];
    const outerZ = haLolToWorld(s.outer).z, gapZ = haTurretGapZ(team);
    // 바깥 유물: 외곽 포탑과 다리 가운데 사이 / 안쪽 유물: 외곽~억제기 포탑 사이(그 자리 부쉬보다 조금 외곽 포탑 쪽)
    const spots = [{ kind: 'outer', z: outerZ * 0.55, firstSec: 105 }, { kind: 'inner', z: gapZ + (outerZ - gapZ) * 0.35, firstSec: 150 }];
    for (const sp of spots) {
      const x = edgeX(sp.z) - lolRangeToWorld(170);
      const pos = new THREE.Vector3(x, 0, sp.z);
      const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
      const pad = new THREE.Mesh(new THREE.RingGeometry(lolRangeToWorld(70), lolRangeToWorld(95), 32), _aramMat(0x7be08a, .5, { transparent: true, opacity: .55, side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = .03; g.add(pad);
      const orb = new THREE.Group(); orb.position.y = lolRangeToWorld(110); g.add(orb);
      orb.add(new THREE.Mesh(new THREE.OctahedronGeometry(lolRangeToWorld(40), 0), _aramMat(0x9dffb0, 1.4)));
      const cross = _aramMat(0xffffff, 1.2);
      orb.add(new THREE.Mesh(new THREE.BoxGeometry(lolRangeToWorld(14), lolRangeToWorld(48), lolRangeToWorld(14)), cross));
      orb.add(new THREE.Mesh(new THREE.BoxGeometry(lolRangeToWorld(48), lolRangeToWorld(14), lolRangeToWorld(14)), cross));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(lolRangeToWorld(ARAM_RELIC_BEAM_RADIUS_LOL), lolRangeToWorld(ARAM_RELIC_BEAM_RADIUS_LOL), .05, 48, 1, true),
        _aramMat(0x9dffb0, .8, { transparent: true, opacity: .0, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = .05; g.add(beam);
      aramRelics.push({ team, kind: sp.kind, pos, group: g, orb, beam, nextSpawnAt: sp.firstSec, firstSec: sp.firstSec, active: false, beamAt: null, picker: null, pickedTeam: null });
    }
    // 서리 관문: 넥서스 옆(아래쪽 +x), 넥서스 가장자리 바로 바깥
    const nexus = haLolToWorld(s.nexus), sign = team === 'RED' ? -1 : 1; // 다리 쪽 방향
    const gp = new THREE.Vector3(nexus.x + lolRangeToWorld(HA_STRUCTURE_RADIUS_LOL.nexus + 420), 0, nexus.z + sign * lolRangeToWorld(150));
    map.clampPosition(gp);
    const color = team === 'BLUE' ? 0x5fd2ff : 0xff6a7a;
    const g = new THREE.Group(); g.position.copy(gp); scene.add(g);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(lolRangeToWorld(ARAM_GATE_RADIUS_LOL), 40), _aramMat(color, .9, { transparent: true, opacity: .45, side: THREE.DoubleSide }));
    disk.rotation.x = -Math.PI / 2; disk.position.y = .04; g.add(disk);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(lolRangeToWorld(ARAM_GATE_RADIUS_LOL), lolRangeToWorld(16), 8, 40, Math.PI), _aramMat(0xcfeeff, .6));
    arch.rotation.y = Math.PI / 2; g.add(arch);
    const swirl = new THREE.Mesh(new THREE.RingGeometry(lolRangeToWorld(40), lolRangeToWorld(ARAM_GATE_RADIUS_LOL - 20), 6), _aramMat(color, 1.2, { transparent: true, opacity: .5, side: THREE.DoubleSide }));
    swirl.rotation.x = -Math.PI / 2; swirl.position.y = .06; g.add(swirl);
    aramGates.push({ team, pos: gp, group: g, swirl, sign, lastUse: new WeakMap() });
  }
  return true;
}

// 관문이 지금 이어진 포탑: 외곽 포탑 → (부서지면) 억제기 포탑 → (둘 다 부서지면) 닫힘
function aramGateTarget(team) {
  if (typeof turrets === 'undefined') return null;
  const alive = (type) => turrets.find((t) => t.team === team && t.type === type && !t.destroyed);
  return alive(TURRET_TYPE.OUTER1) || alive(TURRET_TYPE.INHIBITOR) || null;
}
function aramGateExit(gate) {
  const t = aramGateTarget(gate.team);
  if (!t) return null;
  const p = t.mesh.position.clone(); p.y = 0;
  p.z -= gate.sign * lolRangeToWorld(ARAM_GATE_EXIT_BEHIND_LOL);
  return howlingAbyssMap.clampPosition(p);
}

// 94차: 게임 초기화 때 회복 유물을 처음 상태로(예전엔 이전 판의 활성·다음 등장 시각이 남아 초기화 직후 4개가 모두 떠 있었다).
function resetAramRelics() {
  for (const r of aramRelics) {
    r.active = false; r.beamAt = null; r._beamDone = false; r.picker = null; r.pickedTeam = null;
    r.nextSpawnAt = r.firstSec; r.orb.visible = false; r.beam.material.opacity = 0;
  }
}
function updateAramFeatures(dt) {
  if (!aramFeaturesBuilt && !buildAramFeatures()) return;
  const gameSec = typeof getTurretGameTimeSec === 'function' ? getTurretGameTimeSec() : 0;
  const now = performance.now();
  const champs = _aramChampions();
  for (const r of aramRelics) {
    if (!r.active && r.beamAt == null && gameSec >= r.nextSpawnAt) r.active = true;
    r.orb.visible = r.active;
    if (r.active) {
      r.orb.position.y = lolRangeToWorld(110) + Math.sin(now / 400) * lolRangeToWorld(12);
      r.orb.rotation.y += dt * 1.6;
      const reach = lolRangeToWorld(ARAM_RELIC_PICKUP_LOL);
      const picker = champs.find((u) => getHorizontalDistance(_aramPos(u), r.pos) <= reach + (getCollisionRadius(u) || 0));
      if (picker) {
        r.active = false; r.picker = picker; r.pickedTeam = picker.team || PLAYER_TEAM;
        _aramHealMissing(picker, ARAM_RELIC_INSTANT_PCT);
        r.beamAt = gameSec + ARAM_RELIC_BEAM_DELAY_SEC;
        if (picker === (typeof controller !== 'undefined' ? controller : null) && typeof showSkillToast === 'function') showSkillToast('회복 유물: 잃은 체력·마나 8% 회복 - 잠시 뒤 주변 아군에게 빛줄기');
      }
    }
    // 빛줄기: 떨어지기 전엔 바닥 원이 차오르고, 떨어지면 범위 안 아군을 회복
    if (r.beamAt != null) {
      const left = r.beamAt - gameSec;
      r.beam.material.opacity = left > 0 ? .12 + .25 * (1 - left / ARAM_RELIC_BEAM_DELAY_SEC) : Math.max(0, .6 + left * 1.5);
      r.beam.scale.y = 1;
      if (left <= 0 && !r._beamDone) {
        r._beamDone = true;
        const rad = lolRangeToWorld(ARAM_RELIC_BEAM_RADIUS_LOL);
        for (const u of champs) if ((u.team || PLAYER_TEAM) === r.pickedTeam && getHorizontalDistance(_aramPos(u), r.pos) <= rad + (getCollisionRadius(u) || 0)) _aramHealMissing(u, ARAM_RELIC_BEAM_PCT);
        r.nextSpawnAt = r.beamAt + ARAM_RELIC_RESPAWN_SEC;
      }
      if (left < -0.4) { r.beamAt = null; r._beamDone = false; r.beam.material.opacity = 0; }
    }
  }
  for (const gate of aramGates) {
    const exit = aramGateExit(gate);
    gate.group.visible = true;
    gate.swirl.rotation.z += dt * (exit ? 1.8 : 0.2);
    gate.swirl.material.opacity = exit ? .5 : .12;
    if (!exit) continue;
    const reach = lolRangeToWorld(ARAM_GATE_RADIUS_LOL);
    for (const u of champs) {
      if (u !== controller || u._dashState || u.state === 'DEAD') continue; // 지금은 직접 조작하는 챔피언만 탄다
      // 원작처럼 관문을 "찍어서"(우클릭 이동 목표가 관문 안) 들어갈 때만 탄다 - 그냥 옆을 지나가면 타지 않는다.
      if (u.targetPos && getHorizontalDistance(u.targetPos, gate.pos) <= reach) u._aramGateIntent = gate;
      else if (u.targetPos) u._aramGateIntent = null;
      if (u._aramGateIntent !== gate) continue;
      const last = gate.lastUse.get(u) || 0;
      if (now - last < ARAM_GATE_LOCKOUT_SEC * 1000) continue;
      if (getHorizontalDistance(_aramPos(u), gate.pos) > reach) continue;
      u._aramGateIntent = null;
      gate.lastUse.set(u, now);
      const from = u.root.position.clone();
      const dir = exit.clone().sub(from); dir.y = 0;
      u._dashState = { from, to: exit.clone(), duration: ARAM_GATE_TRAVEL_SEC, elapsed: 0, faceDir: dir.lengthSq() > 1e-6 ? dir.normalize() : null };
      u.targetPos = null;
      if (typeof showSkillToast === 'function') showSkillToast('서리 관문');
    }
  }
}
