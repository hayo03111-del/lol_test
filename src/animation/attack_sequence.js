/* ============================================================
   0-A1c. ATTACK SEQUENCE (요청: 평타 모션 순서를 별도 데이터로 관리)
   ------------------------------------------------------------
   버그 수정(핵심 원인): 지금까지 모든 챔피언의 평타 콤보가 무조건
   ['attack1','attack2','attack3'] 3칸을 순환했다(comboIndex % 3). 그런데
   마스터 이/세트는 실제로 좌/우 2종류 모션만 존재하는 챔피언이다 - 3칸
   순환을 2상태 좌우 교대에 억지로 씌우면, 인덱스가 0,1,2,0,1,2...로
   돌 때 "2번(마지막 칸) 다음에 다시 0번(첫 칸)"으로 넘어가는 경계에서
   같은 쪽 모션이 두 번 연속 나온다(0,1,2 | 0,1,2 - 2번과 다음 0번이
   실제로는 같은 애니메이션을 가리키는 경우 연속 재생됨). 이 테이블에
   등록된 챔피언은 실제 모델에 존재하는 개수만큼만 순환한다 - 존재하지
   않는 애니메이션을 새로 만들지 않고, 실제 clip 개수에 맞춘다(요청 13).
   ============================================================ */
const ATTACK_SEQUENCE_OVERRIDES = {
  yasuo: ['attack1', 'attack2', 'attack3', 'attack4'],
  yone: ['attack1', 'attack2', 'attack3', 'attack4'], // 요네도 Attack1~4 4종 실존(야스오와 동일 명명 규칙)
  masteryi: ['attack1', 'attack2'], // 좌검격/우검격 2종류만 존재
  sett: ['attack1', 'attack2'], // 왼손/오른손 2종류만 존재
  leesin: ['attack1', 'attack2', 'attack3', 'attack4'], // 리 신 평타 4종 반복
  nilah: ['attack1', 'attack2'],
  // 버그 수정(사용자 제보 "다리우스/가렌 평타가 같은 모션 2번 연속으로
  // 나간다"): 문서 3-2/5-2절 둘 다 "Idle → Attack1 → Attack2 → Attack1 …"
  // 이라고 명시한다 - 실제로는 Attack1/Attack2 딱 2종류뿐이고 Attack3는
  // 존재하지 않는다. 그런데 이 테이블에 등록되지 않은 챔피언은 위 주석이
  // 설명하는 옛 버그 그대로 무조건 3칸(attack1/2/3)을 순환했고,
  // buildActionData()의 3슬롯 채우기 로직이 존재하지 않는 attack3 자리를
  // attackVariants[0](=attack1과 동일한 클립)으로 채워 넣었다 - 그 결과
  // comboIndex가 1(attack2)→2(attack3=attack1과 동일 클립)→3(attack1)으로
  // 넘어가는 경계에서 "attack3=attack1, 다음 attack1"이 되어 같은 애니메이션이
  // 두 번 연속 재생됐다. masteryi/sett와 동일한 방식으로 실제 존재하는
  // 클립 수(2개)만큼만 순환하도록 등록한다.
  garen: ['attack1', 'attack2'],
  darius: ['attack1', 'attack2'],
  // 이즈리얼: 실제 존재하는 평타 클립은 Attack1a/Attack2a 2종류뿐이다(위
  // buildActionData()의 이즈리얼 attackVariants 강제 고정 주석 참고) -
  // 등록하지 않으면 기본 3칸(attack1~3)이 채워지면서 없는 "3번째 평타"
  // 자리에 중복 클립이 잘못 들어간다.
  ezreal: ['attack1', 'attack2'],
  // 버그 수정(전체 시스템 감사 - "평타 Attack1/2 순서가 꼬임" 재확인):
  // action_timing.js의 buildActionData()에서 아리의 실제 평타 클립을
  // Attack1/Attack2 2종류로 이미 고정해뒀지만(이전 세션), 정작 몇 칸을
  // 순환할지 정하는 이 테이블에는 아리를 등록하지 않아서 여전히 기본값
  // 3칸(attack1/2/3)으로 순환하고 있었다 - 존재하지 않는 attack3 자리가
  // attackVariants[0](=Attack1)로 채워져, comboIndex가 1(attack2)->
  // 2(attack3=Attack1)->3(attack1=Attack1)로 넘어가는 경계에서 Attack1이
  // 두 번 연속 재생되는, 가렌/다리우스/이즈리얼과 완전히 동일한 유형의
  // 버그가 아리에게도 남아있었다. 실제 존재하는 클립 수(2개)만큼만
  // 순환하도록 등록.
  ahri: ['attack1', 'attack2'],
  // 바루스: 실제 존재하는 평타 클립은 Attack1/Attack2 2종류뿐이다(위
  // action_timing.js의 바루스 attackVariants 강제 고정 주석 참고).
  varus: ['attack1', 'attack2'],
  // 애쉬: 실제 존재하는 평타 클립도 Attack1/Attack2 2종류뿐이다(위
  // action_timing.js의 애쉬 attackVariants 강제 고정 주석 참고) - 등록하지
  // 않으면 존재하지 않는 "3번째 평타" 자리에 중복 클립이 들어가는, 다른
  // 챔피언들과 동일한 유형의 버그가 생긴다.
  ashe: ['attack1', 'attack2'],
  nautilus: ['attack1', 'attack2', 'attack3'],
  rammus: ['attack1', 'attack2'], // 38차: 실제 GLB 평타 2개(+Crit)
};
// 시퀀스 배열에서의 위치를 챔피언 고유의 "손/방향" 의미로 변환한다.
// 새 챔피언이 추가되면 이 매핑만 확장하면 된다 - 애니메이션 선택 로직
// 자체는 건드릴 필요가 없다.
const ATTACK_HAND_LABELS = {
  masteryi: ['LEFT_SLASH', 'RIGHT_SLASH'],
  sett: ['LEFT', 'RIGHT'],
};
// 요청("치명타는 왼손/오른손 교대와 무관하게 별도 크리티컬 모션으로 대체돼야
// 하는 챔피언 vs 교대 순서를 유지해야 하는 챔피언 구분"): 위
// ATTACK_SEQUENCE_OVERRIDES는 순전히 "실제 존재하는 평타 클립 개수"만
// 나타내는 테이블이지 "치명타가 시퀀스를 끊어도 되는가"와는 별개 질문이다.
// 마스터 이/세트는 문서상 "치명타가 터져도 여전히 좌우 교대 그대로"라
// 별도 Crit 포즈가 없어야 하지만(critBreaksSequence:false), 가렌/다리우스는
// 문서 3-2/5-2절에 "치명타 발생 시 → Crit로 대체"라고 명시돼 있어 정반대로
// 별도 Crit 포즈가 있어야 한다(critBreaksSequence:true 유지). 이전에는
// critBreaksSequence를 ATTACK_SEQUENCE_OVERRIDES 등록 여부로만 판단해서,
// 가렌/다리우스를 위 테이블에 추가하면 그 부작용으로 이 둘의 Crit 포즈까지
// 함께 꺼지는 회귀가 생길 뻔했다 - 그래서 이 둘을 완전히 분리된 별도
// 테이블로 관리한다.
// 버그 수정("평타가 Attack1,2,3이 한 대로 이어진다"): 닐라는 원작에서도
// 크리티컬이 떠도 평소 좌우 교대 스윙(attack1<->attack2) 그대로 나가고,
// 크리티컬은 오직 피해 배율일 뿐 별도 애니메이션이 없다. 그런데 이
// 예외 목록에 닐라가 빠져 있어서, 크리티컬이 뜰 때마다(닐라는 치명타
// 확률이 낮지 않은 챔피언) attack1/attack2와 전혀 안 어울리는 'crit'
// 전용 포즈(GLB의 Crita/Critb/Critc 등, attack1/2와 무관하게 아무거나
// 첫 번째로 찾은 클립)가 불쑥 끼어들어 "제3의 이상한 동작"처럼 보였다.
// 정정: 이전엔 크리티컬 포즈가 범용 점수 매칭에 맡겨져 있어서 아무 클립이나
// 잡힐 수 있었기 때문에 닐라를 이 예외에 넣어 크리티컬이 시퀀스를 끊지
// 못하게 막았었다. 이제 buildActionData에서 실제 GLB의 Crita/Critb/Critc를
// 명시적으로 고정했으므로(위 참고), 닐라도 다른 크리티컬 챔피언(가렌/
// 다리우스)과 동일하게 정식 크리티컬 포즈가 정확히 나오는 게 맞다 - 그래서
// 다시 이 예외 목록에서 뺀다.
const CRIT_PRESERVES_SEQUENCE = new Set(['masteryi', 'sett', 'yasuo']);
function getAttackSequenceNames(championId) {
  return ATTACK_SEQUENCE_OVERRIDES[championId] || ['attack1', 'attack2', 'attack3'];
}

const SKILL_HITBOX_SHAPE = {
  garen: { E: { type: 'circle' } }, // 자기중심 회전 베기(findEnemiesInRadius)
  darius: {
    Q: { type: 'circle' }, // 자기중심 범위(findEnemiesInRadius)
    E: { type: 'line', halfWidthWorld: BASE_UNIT * 0.6 }, // 직선 스킬샷(findFirstInLine)
  },
  sett: {
    E: { type: 'circle' }, // 좌우 판정용 범위 탐색(findEnemiesInRadius) - 형태 자체는 원
    W: { type: 'trapezoid' }, // isPointInsideSettWTrapezoid와 동일한 사다리꼴(centerHalfWidth/endHalfWidth는 CHAMPION_DATA에서 직접 읽음)
  },
  mordekaiser: { Q: { type: 'circle' }, E: { type: 'circle' } }, // 지점형 범위(반경은 캐스트 가능 거리로 근사 표시)
  chogath: {
    Q: { type: 'circle' }, // 지점형 범위
    W: { type: 'cone' }, // 부채꼴(findEnemiesInRadius의 forward/maxAngleDeg)
  },
  leesin: {
    Q: { type: 'line', halfWidthWorld: BASE_UNIT * 0.6 }, // 직선 스킬샷(findFirstInLine)
    E: { type: 'circle' }, // 자기중심 범위
  },
  masteryi: { Q: { type: 'circle' } }, // 주변 탐색 범위(findEnemiesInRadius)
  nilah: { Q: { type: 'cone' }, E: { type: 'line', halfWidthWorld: BASE_UNIT * 0.28 }, R: { type: 'circle' } },
  // 바루스 Q(꿰뚫는 화살)/R(속박의 사슬)은 둘 다 직선 스킬샷이다 - 실제
  // 판정 폭(mLineWidth, LoL 원본 단위)을 그대로 world로 변환해서 쓴다.
  varus: {
    Q: { type: 'line', halfWidthWorld: lolRangeToWorld(75) * 0.5 },
    R: { type: 'line', halfWidthWorld: lolRangeToWorld(450) * 0.5 },
  },
  // 애쉬 W(일제 사격)는 부채꼴로 퍼지는 다중 화살이라 원이 아니라 콘(cone)
  // 형태로 그린다(champion_data.js의 ashe.W.coneAngleDeg와 동일한 값).
  // R(마법의 수정화살)은 화살이므로 직선(line) 실루엣으로 그린다 - 다만
  // 사거리가 "글로벌"(20000)이라 그대로 그리면 지나치게 길어지므로, 아래
  // RangeIndicatorSystem.update()의 애쉬 R 전용 분기가 표시용 사거리만
  // 맵 크기에 맞춰 클램프한다(실제 판정 사거리 자체는 그대로 20000).
  ashe: {
    W: { type: 'cone', angleDeg: 46 },
    R: { type: 'line', halfWidthWorld: lolRangeToWorld(130) * 0.5 },
  },
  // 노틸러스 Q(닻줄 견인) - 직선 스킬샷(champion_data.js의 nautilus.Q.width).
  nautilus: {
    Q: { type: 'line', halfWidthWorld: lolRangeToWorld(180) * 0.5 },
  },
};
// 세트 W처럼 형태 자체가 챔피언 고유 파라미터(centerHalfWidth 등)를 쓰는
// 경우, CHAMPION_DATA에서 직접 읽어와 shape 파라미터를 채운다.
function resolveShapeParams(championId, slot, cd) {
  const shape = (SKILL_HITBOX_SHAPE[championId] && SKILL_HITBOX_SHAPE[championId][slot]) || { type: 'circle' };
  if (championId === 'sett' && slot === 'W' && cd && cd.W) {
    return { type: 'trapezoid', centerHalfWidth: cd.W.centerHalfWidth, endHalfWidth: cd.W.endHalfWidth };
  }
  if (championId === 'chogath' && slot === 'W' && cd && cd.W) {
    return { type: 'cone', angleDeg: cd.W.coneAngleDeg };
  }
  return shape;
}
// 2D Shape(로컬 XY, +Y=전방)를 만들어 XZ 평면으로 눕힌 뒤(rotateX(-90도)),
// 로컬 +Z가 "전방"이 되도록 한다 - 이후 update()에서 이 로컬 +Z를 실제
// facing 방향으로 회전시키기만 하면 된다.
function buildRangeShapeGeometry(desc, worldRange) {
  const shape = new THREE.Shape();
  if (desc.type === 'line') {
    const hw = desc.halfWidthWorld;
    shape.moveTo(-hw, 0); shape.lineTo(-hw, worldRange); shape.lineTo(hw, worldRange); shape.lineTo(hw, 0); shape.closePath();
  } else if (desc.type === 'cone') {
    const half = THREE.MathUtils.degToRad((desc.angleDeg || 60) / 2);
    shape.moveTo(0, 0);
    const segs = 24;
    for (let i = 0; i <= segs; i++) {
      const a = -half + (2 * half) * (i / segs);
      shape.lineTo(Math.sin(a) * worldRange, Math.cos(a) * worldRange);
    }
    shape.closePath();
  } else if (desc.type === 'trapezoid') {
    const cw = lolRangeToWorld(desc.centerHalfWidth || 0), ew = lolRangeToWorld(desc.endHalfWidth || 0);
    shape.moveTo(-cw, 0); shape.lineTo(-ew, worldRange); shape.lineTo(ew, worldRange); shape.lineTo(cw, 0); shape.closePath();
  } else {
    return null; // circle은 기존 RingGeometry로 처리(호출부에서 분기)
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}
class RangeIndicatorSystem {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    // slot: [색상, 두께(선폭)]. 기본 공격은 흰색, Q/W/E/R은 라이엇 UI 관례에
    // 가깝게 파랑/초록/주황/보라로 구분한다.
    this.specs = {
      attack: { color: 0xffffff, opacity: 0.35 },
      Q: { color: 0x4aa3ff, opacity: 0.35 },
      W: { color: 0x4aff8a, opacity: 0.35 },
      E: { color: 0xffb84a, opacity: 0.35 },
      R: { color: 0xd24aff, opacity: 0.4 },
    };
    this.rings = {};
    this.shapeMeshes = {}; // 원이 아닌 슬롯(line/cone/trapezoid)용 - 매 프레임 geometry를 교체한다
    this.centerLaneMesh = null; // 세트 W 전용: 고정폭 중앙(True Damage) 차선을 별도 강조 표시
    for (const [key, spec] of Object.entries(this.specs)) {
      const geo = new THREE.RingGeometry(1, 1.03, 64); // 반경은 매 프레임 rescale로 갱신(아래)
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.rings[key] = mesh;

      const shapeMat = new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity * 0.55, side: THREE.DoubleSide, depthWrite: false });
      const shapeMesh = new THREE.Mesh(new THREE.BufferGeometry(), shapeMat);
      shapeMesh.visible = false;
      shapeMesh.renderOrder = 1;
      scene.add(shapeMesh);
      this.shapeMeshes[key] = shapeMesh;
    }
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    this.centerLaneMesh = new THREE.Mesh(new THREE.BufferGeometry(), laneMat);
    this.centerLaneMesh.visible = false;
    this.centerLaneMesh.renderOrder = 2;
    scene.add(this.centerLaneMesh);
  }
  setVisible(v) {
    this.visible = v;
    if (!v) {
      for (const m of Object.values(this.rings)) m.visible = false;
      for (const m of Object.values(this.shapeMeshes)) m.visible = false;
      this.centerLaneMesh.visible = false;
    }
  }
  toggle() { this.setVisible(!this.visible); }
  // ctrl: CharacterController. 실제 사거리는 여기서 계산하지 않고 이미 있는
  // 값(this.stats.attackRange / CHAMPION_DATA[...].range)을 그대로 읽는다.
  update(ctrl) {
    if (!this.visible || !ctrl || !ctrl.root) {
      for (const m of Object.values(this.rings)) if (m.visible) m.visible = false;
      for (const m of Object.values(this.shapeMeshes)) if (m.visible) m.visible = false;
      this.centerLaneMesh.visible = false;
      return;
    }
    const pos = ctrl.root.position;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ctrl.root.quaternion);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    const setCircle = (key, radius) => {
      const mesh = this.rings[key];
      if (radius == null || radius <= 0) { mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.set(pos.x, 0.02, pos.z);
      mesh.scale.setScalar(radius);
    };
    const setShape = (key, desc, radius) => {
      const mesh = this.shapeMeshes[key];
      if (radius == null || radius <= 0 || !desc) { mesh.visible = false; return; }
      const geo = buildRangeShapeGeometry(desc, radius);
      if (!geo) { mesh.visible = false; return; }
      mesh.geometry.dispose();
      mesh.geometry = geo;
      mesh.position.set(pos.x, 0.021, pos.z);
      mesh.quaternion.copy(quat);
      mesh.visible = true;
    };
    // 44차: 원작 사거리 표시는 "사거리 + 자기 크기(gameplay 반경)" - 평타 판정(isInAttackRange)이 가장자리 대 가장자리라
    // 예전 링(자기 중심에서 사거리만)은 실제로 닿는 거리보다 자기 반경만큼 작았다(대상 반경만큼은 원작도 링 밖에서 닿는다).
    setCircle('attack', ctrl.stats ? ctrl.stats.attackRange + getCollisionRadius(ctrl) : null);
    const cd = ctrl._champData ? ctrl._champData() : null;
    this.centerLaneMesh.visible = false;
    for (const slot of ['Q', 'W', 'E', 'R']) {
      let range = null;
      if (ctrl.championId === 'ashe' && slot === 'R' && cd && cd.R) {
        // 애쉬 R은 실제 사거리가 "글로벌"(20000)이라 그대로 표시하면 화면
        // 밖까지 화살이 그려진다 - 판정용 사거리(cd.R.range)는 그대로 두고,
        // 표시만 이 맵의 실제 이동 가능 거리에 맞춰 클램프한다.
        range = Math.min(cd.R.range || 20000, 12000);
      } else if (cd && cd[slot]) {
        const data = cd[slot];
        const lvl = Math.max(1, (ctrl.skillLevels && ctrl.skillLevels[slot]) || 1);
        // range/range1/rangeBase(+rangePerStack) 등 챔피언마다 다른 필드명을
        // 전부 최선을 다해 해석한다 - 못 찾으면 그냥 표시하지 않는다.
        if (data.range != null) range = skillVal(data.range, lvl);
        else if (data.range1 != null) range = data.range1;
        else if (data.radius != null) range = data.radius; // 자기중심 범위 스킬(노틸러스 E 등)
        else if (data.rangeBase != null) range = data.rangeBase + (data.rangePerStack || 0) * ((ctrl._chogath && ctrl._chogath.predationStacks) || 0);
        else if (data.rangeMax != null) range = data.rangeMax;
      }
      const worldRange = range == null ? null : lolRangeToWorld(range);
      const shapeDesc = ctrl.championId ? resolveShapeParams(ctrl.championId, slot, cd) : { type: 'circle' };
      if (shapeDesc.type === 'circle') {
        setCircle(slot, worldRange);
        this.shapeMeshes[slot].visible = false;
      } else {
        setShape(slot, shapeDesc, worldRange);
        this.rings[slot].visible = false;
        // 세트 W: 고정폭 중앙 차선(True Damage 영역)을 별도 흰 띠로 강조
        if (shapeDesc.type === 'trapezoid' && ctrl.championId === 'sett' && slot === 'W' && worldRange) {
          const cw = lolRangeToWorld(shapeDesc.centerHalfWidth || 0);
          const laneGeo = buildRangeShapeGeometry({ type: 'line', halfWidthWorld: cw }, worldRange);
          this.centerLaneMesh.geometry.dispose();
          this.centerLaneMesh.geometry = laneGeo;
          this.centerLaneMesh.position.set(pos.x, 0.022, pos.z);
          this.centerLaneMesh.quaternion.copy(quat);
          this.centerLaneMesh.visible = true;
        }
      }
    }
  }
}

