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
  const bodyRadius = BASE_UNIT * 0.24 * DUMMY_SCALE;
  const bodyLength = Math.max(0.1, dummyHeight - bodyRadius * 2);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyRadius, bodyLength, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3b62a8, roughness: 0.7 }));
  body.position.y = dummyHeight / 2;
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  group.position.copy(position);
  scene.add(group);
  group.add(createBlobShadow(bodyRadius * 2.2));

  const labelDiv = document.createElement('div');
  labelDiv.className = 'champion';
  labelDiv.innerHTML = `<div class="champName">아군 더미</div><div class="hpBarOuter" style="position:relative;"><div class="hpBarInner"></div><div class="hpBarShield" style="position:absolute;top:0;height:100%;background:#e8e8e8;opacity:0.85;"></div></div>`;
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
  const total = Math.max(a.maxHp, a.hp + (a.shield || 0));
  const hpBar = a.labelDiv.querySelector('.hpBarInner');
  const shieldBar = a.labelDiv.querySelector('.hpBarShield');
  if (hpBar) { hpBar.style.width = (a.hp / total * 100) + '%'; hpBar.style.background = 'linear-gradient(180deg,#6fb7ff,#2f6fbe)'; }
  if (shieldBar) { shieldBar.style.left = (a.hp / total * 100) + '%'; shieldBar.style.width = ((a.shield || 0) / total * 100) + '%'; }
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
