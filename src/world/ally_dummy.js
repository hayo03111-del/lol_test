/* ============================================================
   아군 더미(연습용 아군 챔피언) - 적 허수아비(dummy_enemy.js)와 같은 모양을
   파란색으로 만든다. 로직은 core/ally_system.js에 있다.
   - 공격하지 않고 움직이지 않는다(적 허수아비와 같은 연습용 표적).
   - 회복이 눈에 보이도록 체력 절반으로 생성된다.
   - 레벨은 설치 시점 플레이어 레벨을 따른다(강철의 솔라리 팬던트처럼
     "아군 레벨 비례" 효과용).
   ============================================================ */
function createAllyDummy(position) {
  const DUMMY_SCALE = 1.75;
  const dummyHeight = BASE_UNIT * 1.1 * DUMMY_SCALE;
  const bodyRadius = lolRangeToWorld(65); // 25차: 원작 허수아비 판정 반경 65(PC 위키 - 대부분의 챔피언과 같음). 예전 0.24×1.75 월드 = 약 49 LoL 유닛
  const bodyLength = Math.max(0.1, dummyHeight - bodyRadius * 2);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyRadius, bodyLength, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3b62a8, roughness: 0.7 }));
  body.position.y = dummyHeight / 2;
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  group.position.copy(position);
  scene.add(group);
  group.add(createBlobShadow(bodyRadius * 2.2));

  const labelDiv = typeof makeChampBarDiv === 'function' ? makeChampBarDiv('ally', '아군 더미') : document.createElement('div'); // 67차: 원작식 공용 챔피언 바(아군 = 파랑)
  const label = new CSS2DObject(labelDiv);
  label.position.set(0, dummyHeight + 0.15, 0);
  group.add(label);

  const maxHp = 1000;
  const ally = {
    mesh: group, body, labelDiv, label, labelHeight: dummyHeight + 0.15,
    hp: maxHp * 0.5, maxHp, shield: 0, shieldEntries: [], statusEffects: [],
    radius: bodyRadius, collisionRadius: bodyRadius, collisionHeight: dummyHeight, selectionRadius: bodyRadius * 1.3,
    armor: 30, magicResist: 30,
    isTrainingDummy: true, isChampion: true, isAlly: true,
    team: PLAYER_TEAM,
    champLevel: (typeof controller !== 'undefined' && controller && controller.champLevel) || 1,
    itemHealingReceivedBonusPercent: 0, itemShieldReceivedBonusPercent: 0,
  };
  ally.onTick = () => updateAllyDummyLabel(ally);
  updateAllyDummyLabel(ally);
  return ally;
}

function updateAllyDummyLabel(a) {
  if (!a || !a.labelDiv) return;
  if (typeof updateChampBar === 'function') updateChampBar(a.labelDiv, { hp: a.hp, maxHp: a.maxHp, shield: a.shield || 0, level: a.champLevel || 1 });
}

function placeAllyAt(point) {
  const a = createAllyDummy(new THREE.Vector3(point.x, 0, point.z));
  placedAllies.push(a);
  console.log(`[아군 더미 설치] 위치: (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) - 현재 아군 더미 ${placedAllies.length}개`);
}

function clearPlacedAllies() {
  for (const a of placedAllies) {
    if (a.labelDiv && a.labelDiv.parentNode) a.labelDiv.parentNode.removeChild(a.labelDiv);
    if (a.mesh) scene.remove(a.mesh);
  }
  placedAllies.length = 0;
}
