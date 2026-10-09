/* ============================================================
   4. GLOBAL SYSTEM INSTANCES
   ============================================================ */
const vfx = new VFXSystem(scene);
// 사용자가 제공한 NilahVFXManager_v2를 이 프로젝트의 THREE.Scene에 연결한다.
// 기존 vfx(VFXSystem)와 완전히 별개로 동작하며, nilah.js의 Q/W/E/R 시전
// 함수에서 playQLoL/playWLoL/playELoL/playRLoL을 직접 호출한다.
const nilahVfx2 = new NilahVFXManagerV2(scene);
const projectiles = new ProjectileSystem(scene, vfx);
const targetRing = new TargetRing(scene);
const rangeIndicators = new RangeIndicatorSystem(scene);
const rangeIndicatorCheckboxEl = document.getElementById('rangeIndicatorCheckbox');
if (rangeIndicatorCheckboxEl) rangeIndicatorCheckboxEl.addEventListener('change', () => rangeIndicators.setVisible(rangeIndicatorCheckboxEl.checked));
// 시야 시스템(전장의 안개) - 범용 인스턴스 하나를 여기서 만들어 animate()
// 루프(champion_glb_loader.js)에서 매 프레임 update()를 호출한다. 다른
// 전역 시스템(vfx/projectiles/rangeIndicators)과 동일한 패턴.
const visionSystem = new VisionSystem(scene);
const visionSystemCheckboxEl = document.getElementById('visionSystemCheckbox');
if (visionSystemCheckboxEl) visionSystemCheckboxEl.addEventListener('change', () => visionSystem.setEnabled(visionSystemCheckboxEl.checked));
// 상점(요청 "상점 시스템 싹다 구현해줘") - 아이템이 계속 늘어나면서
// 한 줄짜리 목록으로는 더 이상 관리가 안 돼서, item_data.js의
// ITEM_CATEGORIES를 기준으로 탭(시작 아이템/소모품/기본 아이템/신발)을
// 나눠 그린다. 구매 버튼은 item_system.js의 buyItem()을 호출만 하고,
// 기지 구역/골드/인벤토리 칸/신발 교체 판정은 전부 그 안에서 처리한다
// (실패 시 콘솔 경고로 조용히 무시). 아이템 설명은 title(hover 툴팁)로
// 보여준다 - 수치는 ITEM_DATA 그 자체에서 뽑아내므로 아이템이 추가돼도
// 이 함수를 따로 고칠 필요가 없다.
function _itemStatsSummary(item) {
  const parts = [];
  const s = item.stats || {};
  if (s.attackDamage) parts.push(`공격력 +${s.attackDamage}`);
  if (s.abilityPower) parts.push(`주문력 +${s.abilityPower}`);
  if (s.maxHp) parts.push(`체력 +${s.maxHp}`);
  if (s.mana) parts.push(`마나 +${s.mana}`);
  if (s.armor) parts.push(`방어력 +${s.armor}`);
  if (s.magicResist) parts.push(`마법저항력 +${s.magicResist}`);
  if (s.attackSpeedPercent) parts.push(`공격 속도 +${Math.round(s.attackSpeedPercent * 100)}%`);
  if (s.critChance) parts.push(`치명타 확률 +${Math.round(s.critChance * 100)}%`);
  if (s.abilityHaste) parts.push(`스킬 가속 +${s.abilityHaste}`);
  if (s.hpRegenPercent) parts.push(`기본 체력 재생 +${Math.round(s.hpRegenPercent * 100)}%`);
  if (s.mpRegenPercent) parts.push(`기본 마나 재생 +${Math.round(s.mpRegenPercent * 100)}%`);
  if (s.moveSpeed) parts.push(`이동 속도 +${s.moveSpeed}`);
  if (s.moveSpeedPercent) parts.push(`이동 속도 +${Math.round(s.moveSpeedPercent * 100)}%`);
  if (s.magicPenFlat) parts.push(`마법 관통력 +${s.magicPenFlat}`);
  if (item.armorPenFlat) parts.push(`물리 관통력 +${item.armorPenFlat}`);
  if (item.allDamageVampPercent) parts.push(`모든 피해 흡혈 +${(item.allDamageVampPercent * 100).toFixed(1)}%`);
  if (item.minionBonusDamage) parts.push(`도움의 손길(미니언 평타 시 +${item.minionBonusDamage} 피해)`);
  if (item.onHitHeal) parts.push(`적중 시 체력 +${item.onHitHeal} 회복`);
  if (item.slowResistPercent) parts.push(`둔화 저항 +${Math.round(item.slowResistPercent * 100)}%`);
  if (item.tenacityPercent) parts.push(`강인함 +${Math.round(item.tenacityPercent * 100)}%`);
  if (item.consumable) parts.push(`사용 시 ${item.consumable.healDurationSec}초에 걸쳐 체력 ${item.consumable.healAmount} 회복`);
  if (item.maxCharges && item.trinket) parts.push(`충전량 ${item.maxCharges}회`);
  if (item.maxStack) parts.push(`최대 ${item.maxStack}개 중첩`);
  // 서사급 아이템 1차분 패시브 요약.
  if (item.grievousOnHitPassive) parts.push(`고통스러운 상처(챔피언 물리 피해 시 ${Math.round(item.grievousOnHitPassive.percent * 100)}% 그리버스 ${item.grievousOnHitPassive.durationSec}초)`);
  if (item.physicalVampPercent) parts.push(`생명력 흡수 +${Math.round(item.physicalVampPercent * 100)}%`);
  if (item.armorPenPercent) parts.push(`방어구 관통력 +${Math.round(item.armorPenPercent * 100)}%`);
  if (item.manaOnDamagePercent) parts.push(`챔피언에게 피해를 입히면 피해량의 ${Math.round(item.manaOnDamagePercent * 100)}%만큼 마나 회복`);
  if (item.cleavePassive) parts.push(`쪼개기(평타 시 주변에 근거리 ${Math.round(item.cleavePassive.meleePercent * 100)}%｜원거리 ${Math.round(item.cleavePassive.rangedPercent * 100)}% 물리 피해)`);
  if (item.activeAbility) parts.push(`사용 시 "${item.activeAbility.nameKo}": 주변 적에게 공격력 ${Math.round(item.activeAbility.percentAD * 100)}% 물리 피해(재사용 대기시간 ${item.activeAbility.cooldownSec}초)`);
  if (item.spellbladePassive) parts.push(`주문 검: 스킬 사용 후 다음 평타에 공격력 ${Math.round(item.spellbladePassive.bonusAdPercent * 100)}% 추가 물리 피해(자체 재사용 대기시간 ${item.spellbladePassive.procCooldownSec}초)`);
  if (item.burnOnDamagePassive) parts.push(`발화(피해 시 ${item.burnOnDamagePassive.durationSec}초간 매초 ${item.burnOnDamagePassive.dmgPerSec}(몬스터 ${item.burnOnDamagePassive.monsterDmgPerSec}) 마법 고정 피해)`);
  // 버그 수정(QA 요청 "효과가 제대로 적용되게 해줘"): 아래 패시브들은
  // item_system.js에 실제로 구현/테스트까지 돼 있었지만, 이 함수가 각
  // 라운드마다 새로 추가된 설명을 전부 따라가지 못해 상점 툴팁에 전혀
  // 나타나지 않고 있었다(스탯 뒤에 아무 설명도 없으면 "효과가 적용 안
  // 된다"고 오해하기 쉽다) - 실제 로직은 그대로 두고 설명만 보강한다.
  if (item.manaRegenPassive) { const p = item.manaRegenPassive; parts.push(`흡수(매초 마나 ${p.baseManaPerSec} 회복, 전투 중 ${p.combatWindowSec}초간 매초 ${p.combatManaPerSec}로 증가, 마나가 없으면 대신 체력 ${Math.round(p.noManaHpRegenPercent * 100)}% 회복)`); }
  if (item.regenPassive) { const p = item.regenPassive; parts.push(`인내의 집중력(평시 ${p.tickSec}초마다 체력 ${p.hpPerTick} 회복)`); }
  if (item.champDamageRegen) { const p = item.champDamageRegen; parts.push(`인내의 집중력(전투 중 피격 후 ${p.durationSec}초 동안 최대 근접 ${p.meleeMaxHp}｜원거리 ${p.rangedMaxHp} 체력 회복)`); }
  if (item.harvestPassive) { const p = item.harvestPassive; parts.push(`수확(미니언 처치 시 골드 ${p.minionGoldPerKill}, 최대 ${p.minionGoldCap}까지 누적 시 ${p.bonusGoldAtCap} 추가 지급)`); }
  if (item.gloryPassive) { const p = item.gloryPassive; parts.push(`영광(챔피언 처치 관여 시 중첩당 주문력 +${p.apPerStack}, 최대 ${p.maxStacks}중첩, 사망 시 ${p.deathLossStacks}중첩 소실)`); }
  if (item.manaCirculationPassive) { const p = item.manaCirculationPassive; parts.push(`마나순환(적중 시 최대 마나 +${p.maxManaPerHit}｜챔피언 +${p.maxManaPerChampionHit}, 누적 최대 ${p.maxManaCap}, 충전 ${p.maxCharges}회/${p.rechargeSec}초)`); }
  if (item.slaughterPassive) { const p = item.slaughterPassive; parts.push(`학살(챔피언 처치 관여 시 중첩당 흡혈 +${(p.vampPerStack * 100).toFixed(1)}%, 최대 ${p.maxStacks}중첩)`); }
  if (item.manaSpentToHealPercent) parts.push(`영원(스킬 사용 시 소모 마나의 ${Math.round(item.manaSpentToHealPercent * 100)}%만큼 체력 회복, 초당 최대 ${item.manaSpentHealCapPerSec} HP)`);
  if (item.carryoverMoveSpeedOnUpgrade) parts.push(`다른 신발로 바꿔도 이동 속도 +${item.carryoverMoveSpeedOnUpgrade} 효과 유지`);
  // 제어 와드 + 영약 3종 - "남은 소모 아이템" 요청으로 추가.
  if (item.wardPlacement) { const p = item.wardPlacement; parts.push(`사용 시 시야 ${p.visionRadius}의 와드 설치(설치 사정거리 ${p.placeRange}, 최대 ${item.maxStack}개 소지)`); }
  if (item.elixirEffect) {
    const e = item.elixirEffect;
    parts.push(`${e.durationSec}초 지속(다른 영약을 마시면 기존 효과 소멸)`);
    if (e.maxHp) parts.push(`체력 +${e.maxHp}`);
    if (e.attackDamage) parts.push(`공격력 +${e.attackDamage}`);
    if (e.abilityPower) parts.push(`주문력 +${e.abilityPower}`);
    if (e.mpRegenPercent) parts.push(`기본 마나 재생 +${Math.round(e.mpRegenPercent * 100)}%`);
    if (e.tenacityPercent) parts.push(`강인함 +${Math.round(e.tenacityPercent * 100)}%`);
    if (e.onHitFlatDamage) parts.push(`챔피언·포탑에 피해 시 고정 피해 +${e.onHitFlatDamage}(챔피언 대상 재사용대기시간 ${e.onHitChampionIcdSec}초)`);
    if (e.championPhysicalVampPercent) parts.push(`챔피언 대상 물리 피해 흡혈 +${Math.round(e.championPhysicalVampPercent * 100)}%`);
  }
  // 전설급 2차분(삼위일체~지배자의 피갑옷) 패시브 설명.
  if (item.onHitMoveSpeedFlatPassive) { const p = item.onHitMoveSpeedFlatPassive; parts.push(`가속(기본 공격 시 ${p.durationSec}초간 이동 속도 +${p.amount})`); }
  if (item.onHitFlatPhysicalPassive) parts.push(`독침(기본 공격 시 고정 물리 피해 +${item.onHitFlatPhysicalPassive})`);
  if (item.onHitFlatMagicDamage) parts.push(`쪼기(기본 공격 시 고정 마법 피해 +${item.onHitFlatMagicDamage})`);
  if (item.mistsEdgePassive) { const p = item.mistsEdgePassive; parts.push(`안개의 검(기본 공격 시 적 현재 체력의 근접${Math.round(p.meleePercentCurrentHp * 100)}%｜원거리${Math.round(p.rangedPercentCurrentHp * 100)}% 추가 물리 피해, 미니언·정글 몬스터는 최대 ${p.nonChampionCap})`); }
  if (item.scurryingStrikePassive) { const p = item.scurryingStrikePassive; parts.push(`할퀴는 그림자(챔피언 ${p.hitsNeeded}회 기본 공격 시 ${Math.round(p.slowPercent * 100)}% 둔화 ${p.slowDurationSec}초, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.everRisingMoonPassive) { const p = item.everRisingMoonPassive; parts.push(`늘 떠오르는 달(${p.windowSec}초 내 별개의 공격/스킬 2회 시 최대 체력 근접${Math.round(p.meleeMaxHpPercent * 100)}%｜원거리${Math.round(p.rangedMaxHpPercent * 100)}% 피해 + 보호막, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.aweBonusAdPercentOfMana) parts.push(`경탄(최대 마나의 ${Math.round(item.aweBonusAdPercentOfMana * 100)}%만큼 추가 공격력)`);
  if (item.shockPassive) { const p = item.shockPassive; parts.push(`충격(기본 공격 시 마나 ${Math.round(p.onHitManaPercent * 1000) / 10}% 추가 물리, 챔피언 대상 스킬 피해 시 근접 마나${Math.round(p.onAbilityHitMeleeManaPercent * 100)}%｜원거리${Math.round(p.onAbilityHitRangedManaPercent * 100)}% 추가 물리)`); }
  if (item.transformsInto) parts.push(`최대 마나에 도달하면 ${(ITEM_DATA[item.transformsInto] && ITEM_DATA[item.transformsInto].nameKo) || item.transformsInto}(으)로 변신`);
  if (item.lifelinePassive) { const p = item.lifelinePassive; parts.push(`생명선(마법 피해로 체력이 ${Math.round(p.hpThresholdPercent * 100)}% 밑으로 떨어질 만큼이면 ${p.shieldDurationSec}초 보호막, 재사용대기시간 ${p.icdSec}초, 발동 후 ${p.omnivampDurationSec}초간 모든 피해 흡혈 +${Math.round(p.omnivampPercentAfterTrigger * 100)}%)`); }
  if (item.focusedWillPassive) { const p = item.focusedWillPassive; parts.push(`집중된 의지(피해를 입히면 ${p.durationSec}초간 스택당 피해량 +${Math.round(p.percentPerStack * 100)}%, 최대 ${p.maxStacks}중첩)`); }
  if (item.captainPassive) { const p = item.captainPassive; parts.push(`선장(챔피언·에픽 몬스터 대상 ${p.hitsNeeded}번째 기본 공격마다 추가 물리 피해, 구조물 대상은 배율 증가)`); }
  if (item.carvePassive) { const p = item.carvePassive; parts.push(`깎아내기(챔피언 물리 피해 시 ${p.durationSec}초간 방어력 -${Math.round(p.shredPerStack * 100)}%, 최대 ${p.maxStacks}중첩)`); }
  if (item.ragePassive) { const p = item.ragePassive; parts.push(`열정(물리 피해를 입히면 ${p.durationSec}초간 이동 속도 근접+${p.meleeAmount}｜원거리+${p.rangedAmount})`); }
  if (item.lightshieldStrikePassive) { const p = item.lightshieldStrikePassive; parts.push(`라이트쉴드 타격(챔피언별 ${p.icdPerTargetSec}초마다 첫 기본 공격 시 근접 기본공격력${Math.round(p.meleeBaseAdPercent * 100)}%｜원거리${Math.round(p.rangedBaseAdPercent * 100)}% + 잃은 체력 ${Math.round(p.missingHpHealPercent * 100)}%만큼 체력 회복)`); }
  if (item.tyrannyPassive) parts.push(`폭정(추가 체력의 ${(item.tyrannyPassive.bonusHpToAdPercent * 100).toFixed(1)}%만큼 추가 공격력)`);
  if (item.vengeancePassive) { const p = item.vengeancePassive; parts.push(`응징(잃은 체력에 비례해 공격력 최대 ${Math.round(p.maxAdPercent * 100)}% 증가, 체력 ${Math.round(p.maxAtHpPercent * 100)}%에서 최대치 도달)`); }
  if (item.recipe && item.recipe.length) {
    const counts = {};
    for (const id of item.recipe) counts[id] = (counts[id] || 0) + 1;
    const compNames = Object.entries(counts).map(([id, n]) => `${(ITEM_DATA[id] && ITEM_DATA[id].nameKo) || id}${n > 1 ? ' x' + n : ''}`);
    parts.push(`하위템: ${compNames.join(', ')}`);
  }
  return parts.join(' · ');
}

let _shopActiveCategory = (typeof ITEM_CATEGORIES !== 'undefined' && ITEM_CATEGORIES[0]) ? ITEM_CATEGORIES[0].id : null;
// 요청("상점에 아이템 선택하면 오른쪽에 띄워주는 상점 시스템") - 실제 LoL
// 상점처럼 아이템 이름을 클릭하면 #shopDetailPanel(오른쪽 패널)에 전체
// 효과 설명 + 조합 재료/상위 아이템 경로를 보여준다. 선택 상태는 다른
// 탭으로 옮겨도 그대로 유지된다(골드가 바뀌어 renderShopPanel()이 다시
// 그려질 때도 마찬가지) - 하위템/상위템 링크를 눌러 다른 탭의 아이템으로
// 자연스럽게 넘어갈 수 있어야 하므로, 탭 전환만으로 선택을 지우지 않는다.
let _shopSelectedItemId = null;
function _showItemDetail(itemId) {
  const item = typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[itemId] : null;
  const panel = document.getElementById('shopDetailPanel');
  if (!item || !panel) return;
  _shopSelectedItemId = itemId;
  if (typeof renderShopPanel === 'function') renderShopPanel(); // 선택한 행에 'selected' 강조 반영
  panel.classList.add('show');
  const canBuild = item.recipe && item.recipe.length && controller && typeof hasComponents === 'function' && hasComponents(controller, item.recipe);
  const payCost = canBuild ? combineCost(item) : item.cost;
  document.getElementById('shopDetailTitle').textContent = item.nameKo;
  document.getElementById('shopDetailCost').textContent = item.trinket
    ? '기본 장착 (구매 불필요)'
    : `${canBuild ? '조합 ' : ''}${payCost}원${item.priceGuessed ? ' * (가격은 원문 누락으로 실제 LoL 가격 사용)' : ''}`;
  document.getElementById('shopDetailDesc').textContent = _itemStatsSummary(item) || '(추가 효과 없음)';

  const recipeSection = document.getElementById('shopDetailRecipeSection');
  const recipeList = document.getElementById('shopDetailRecipeList');
  recipeList.innerHTML = '';
  if (item.recipe && item.recipe.length) {
    recipeSection.style.display = '';
    const counts = {};
    for (const id of item.recipe) counts[id] = (counts[id] || 0) + 1;
    for (const [id, n] of Object.entries(counts)) {
      const comp = ITEM_DATA[id];
      if (!comp) continue;
      const row = document.createElement('div');
      const link = document.createElement('span');
      link.className = 'detailLink';
      link.textContent = `${comp.nameKo}${n > 1 ? ' x' + n : ''} (${comp.cost}원)`;
      link.addEventListener('click', () => _showItemDetail(id));
      row.appendChild(link);
      recipeList.appendChild(row);
    }
  } else {
    recipeSection.style.display = 'none';
  }

  // 역방향 조회("이 아이템을 하위템으로 쓰는 상위 아이템") - ITEM_DATA를
  // 매번 스캔하지만(추가 자료구조 없음) 42종 규모에서는 비용이 무시할
  // 수준이고, 아이템이 늘어도 자동으로 정확하다(수동 목록을 따로 관리할
  // 필요가 없다).
  const buildsSection = document.getElementById('shopDetailBuildsIntoSection');
  const buildsList = document.getElementById('shopDetailBuildsIntoList');
  buildsList.innerHTML = '';
  const buildsInto = (typeof ITEM_ORDER !== 'undefined' ? ITEM_ORDER : Object.keys(ITEM_DATA))
    .filter((id) => ITEM_DATA[id].recipe && ITEM_DATA[id].recipe.includes(itemId));
  if (buildsInto.length) {
    buildsSection.style.display = '';
    for (const id of buildsInto) {
      const d = ITEM_DATA[id];
      const row = document.createElement('div');
      const link = document.createElement('span');
      link.className = 'detailLink';
      link.textContent = `${d.nameKo} (${d.cost}원)`;
      link.addEventListener('click', () => _showItemDetail(id));
      row.appendChild(link);
      buildsList.appendChild(row);
    }
  } else {
    buildsSection.style.display = 'none';
  }
}
function renderShopPanel() {
  const tabsEl = document.getElementById('shopCategoryTabs');
  const listEl = document.getElementById('shopItemList');
  if (!tabsEl || !listEl || typeof ITEM_CATEGORIES === 'undefined') return;
  tabsEl.innerHTML = '';
  for (const cat of ITEM_CATEGORIES) {
    const btn = document.createElement('button');
    btn.textContent = cat.nameKo;
    btn.classList.toggle('active', cat.id === _shopActiveCategory);
    btn.addEventListener('click', () => { _shopActiveCategory = cat.id; renderShopPanel(); });
    tabsEl.appendChild(btn);
  }
  listEl.innerHTML = '';
  const cat = ITEM_CATEGORIES.find((c) => c.id === _shopActiveCategory) || ITEM_CATEGORIES[0];
  if (!cat) return;
  for (const itemId of cat.items) {
    const item = ITEM_DATA[itemId];
    if (!item) continue;
    // 조합(하위템을 전부 갖고 있으면 그 차액만, 아니면 완제품 전체 가격)
    // - 버튼 라벨/가격 표시를 실제 지불할 금액 기준으로 보여준다.
    const canBuild = item.recipe && item.recipe.length && controller && typeof hasComponents === 'function' && hasComponents(controller, item.recipe);
    const payCost = canBuild ? combineCost(item) : item.cost;
    const row = document.createElement('div');
    row.className = 'shopItemRow';
    if (controller && (controller.gold || 0) < payCost) row.classList.add('unaffordable');
    if (itemId === _shopSelectedItemId) row.classList.add('selected');
    const nameEl = document.createElement('span');
    nameEl.className = 'shopItemName clickable';
    nameEl.textContent = `${item.nameKo} (${canBuild ? '조합 ' : ''}${payCost}${item.priceGuessed ? '*' : ''})`;
    nameEl.title = _itemStatsSummary(item) + (item.priceGuessed ? ' · *가격은 원문 누락으로 실제 LoL 가격 사용' : '');
    nameEl.addEventListener('click', () => _showItemDetail(itemId));
    const btn = document.createElement('button');
    const alreadyWorn = item.isBoots && controller && controller.boots && controller.boots.id === itemId;
    // 버그 수정(QA 요청): "unaffordable"(이름 회색 처리)만 하고 버튼 자체는
    // 계속 눌러지는 상태였다 - 클릭해도 buyItem()이 조용히 console.warn만
    // 찍고 아무 일도 안 일어나니 "눌렀는데 효과가 안 적용된다"로 보일 수
    // 있었다. 골드가 부족하면 버튼도 함께 비활성화해서 클릭 가능 여부와
    // 회색 표시가 항상 일치하게 한다.
    const cannotAfford = controller && (controller.gold || 0) < payCost;
    btn.textContent = alreadyWorn ? '장착됨' : canBuild ? '조합' : (item.isBoots ? '착용' : '구매');
    btn.disabled = !!alreadyWorn || !!cannotAfford;
    btn.title = nameEl.title;
    btn.addEventListener('click', () => { if (typeof buildOrBuyItem === 'function' && controller) buildOrBuyItem(controller, itemId); });
    row.appendChild(nameEl);
    row.appendChild(btn);
    listEl.appendChild(row);
  }
}
renderShopPanel();
// 인벤토리 슬롯 표시 - buyItem/sellItem/useItem이 아이템을 바꿀 때마다
// 호출하는 이벤트 기반 갱신 함수(updateGoldDisplay()와 동일한 원칙, 매
// 프레임 아님). 소비 아이템(체력/충전형 물약)은 클릭하면 판매 대신
// 사용되고, 중첩/충전 수를 작은 배지로 함께 표시한다.
function updateItemUI(ctrl) {
  _updateTrinketUI(ctrl);
  _updateBootsUI(ctrl);
  if (typeof renderShopPanel === 'function') renderShopPanel(); // 골드/보유 신발이 바뀌면 상점의 "구매 가능 여부" 표시도 함께 갱신
  const row = document.getElementById('inventoryRow');
  if (!row) return;
  row.innerHTML = '';
  const items = (ctrl && ctrl.items) || [];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    const slot = items[i];
    const data = slot && typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[slot.id] : null;
    if (data) {
      const usable = !!(data.consumable || data.activeAbility || data.wardPlacement || data.elixirEffect);
      el.className = 'invSlot' + (usable ? ' usable' : '');
      el.textContent = data.nameKo.slice(-2); // "도란의 검" -> "검"처럼 구분 글자만 표시
      const badgeValue = typeof slot.charges === 'number' ? `${slot.charges}/${data.maxCharges}` : (slot.count > 1 ? slot.count : '');
      if (badgeValue) {
        const badge = document.createElement('span');
        badge.className = 'invBadge';
        badge.textContent = badgeValue;
        el.appendChild(badge);
      }
      el.title = usable
        ? `${data.nameKo} (${i + 1}번 키 또는 클릭: 사용)`
        : `${data.nameKo} (클릭: 판매, 구매가의 70% 환급)`;
      el.addEventListener('click', () => {
        if (usable) { if (typeof useItem === 'function') useItem(ctrl, i); }
        else if (typeof sellItem === 'function') sellItem(ctrl, i);
      });
    } else {
      el.className = 'invSlot empty';
    }
    row.appendChild(el);
  }
}
// 트린켓(투명 와드) 전용 슬롯 - 6칸 인벤토리와 별개로 표시한다. 클릭으로도
// 설치할 수 있게 해뒀다(실제로는 T키로 마우스 위치에 바로 꽂는 쪽이
// 기본 조작법이지만, 클릭 한 번으로도 되게 해 UI만 보고도 쓸 수 있게 함 -
// 이 경우 현재 조준 중인 지면 좌표가 없으므로 플레이어 바로 앞에 꽂는다).
function _updateTrinketUI(ctrl) {
  const row = document.getElementById('trinketSlotRow');
  if (!row) return;
  row.innerHTML = '';
  const trinket = ctrl && ctrl.trinket;
  const data = trinket && typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[trinket.id] : null;
  if (!data) return;
  const el = document.createElement('div');
  el.className = 'invSlot usable';
  el.textContent = data.nameKo.slice(-2);
  const badge = document.createElement('span');
  badge.className = 'invBadge';
  badge.textContent = `${trinket.charges}/${data.maxCharges}`;
  el.appendChild(badge);
  el.title = `${data.nameKo} (T키: 마우스 위치에 설치)`;
  el.addEventListener('click', () => {
    if (typeof placeWard !== 'function' || !ctrl) return;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ctrl.root.quaternion);
    placeWard(ctrl, ctrl.root.position.clone().add(forward.multiplyScalar(lolRangeToWorld(300))));
  });
  row.appendChild(el);
  const label = document.createElement('span');
  label.style.fontSize = '10px'; label.style.color = '#999';
  label.textContent = data.nameKo;
  row.appendChild(label);
}
// 신발 전용 슬롯 - 트린켓과 동일한 구조(6칸 인벤토리와 별개). 클릭하면
// 판매(70%)된다 - 다른 신발로 "교체"하고 싶을 때는 상점 신발 탭에서
// 원하는 신발의 "착용" 버튼을 바로 누르면 된다(buyBoots가 기존 신발을
// 자동으로 전액 환급 처리).
function _updateBootsUI(ctrl) {
  const row = document.getElementById('bootsSlotRow');
  if (!row) return;
  row.innerHTML = '';
  const boots = ctrl && ctrl.boots;
  const data = boots && typeof ITEM_DATA !== 'undefined' ? ITEM_DATA[boots.id] : null;
  if (!data) {
    const empty = document.createElement('div');
    empty.className = 'invSlot empty';
    row.appendChild(empty);
    const label = document.createElement('span');
    label.style.fontSize = '10px'; label.style.color = '#999';
    label.textContent = '미착용';
    row.appendChild(label);
    return;
  }
  const el = document.createElement('div');
  el.className = 'invSlot';
  el.textContent = data.nameKo.slice(-2);
  el.title = `${data.nameKo} (클릭: 판매, 구매가의 70% 환급)`;
  el.addEventListener('click', () => { if (typeof sellBoots === 'function') sellBoots(ctrl); });
  row.appendChild(el);
  const label = document.createElement('span');
  label.style.fontSize = '10px'; label.style.color = '#999';
  label.textContent = data.nameKo;
  row.appendChild(label);
}
var controller = null;
let championRoot = null;
let currentChampion = null; // { fileName, resolver, actionData, boundsRadius }
let modelScaleMultiplier = 1.0; // scaleButtons(0.8/1.0/1.2) 수동 미리보기 배율 - 챔피언 고정 Multiplier 위에 곱해지는 별도의 사용자 조작 값
let championBaseScaleMultiplier = 1.0; // 현재 로드된 챔피언의 MODEL_SCALE_MULTIPLIERS 고정값(원본 크기에 곱해짐)

/* ============================================================
   5. INPUT HANDLING
   ============================================================ */
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

function getGroundPoint(clientX, clientY) {
  mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObject(ground, false);
  return hits.length ? hits[0].point : null;
}
// 요청("미니언도 지정 가능하게 하고 지정 쉽게 해줘") - 미니언은 몸집이
// 작고 계속 움직여서 실제 메쉬를 픽셀 단위로 정확히 클릭하기 어렵다.
// 정밀 레이캐스트가 빗나가면 화면 좌표 기준 "가장 가까운 후보"를 관대한
// 반경 안에서 대신 골라주는 폴백을 추가한다(흔히 쓰는 RTS/AOS 관대한
// 클릭 판정 방식). 겹쳐 있을 때는 정밀 레이캐스트가 여전히 우선이라
// "뒤에 있는 큰 포탑을 클릭했는데 작은 미니언이 잡히는" 문제는 없다.
const ENEMY_CLICK_RADIUS_PX = 26;         // 기본 관대한 클릭 허용 반경(픽셀)
const ENEMY_CLICK_RADIUS_MINION_PX = 38;  // 미니언은 더 작고 빨리 움직이므로 더 넉넉하게
function isBehindCamera(worldPos) {
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const toPoint = new THREE.Vector3().subVectors(worldPos, camera.position);
  return camDir.dot(toPoint) <= 0;
}
function worldToScreenPx(worldPos) {
  const v = worldPos.clone().project(camera); // clone 필수 - project()는 벡터를 제자리에서 바꿔버려서, 원본(유닛 실제 좌표)에 그대로 쓰면 유닛이 순간이동한다
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
function getEnemyHit(clientX, clientY) {
  // getAllEnemyUnits()가 이제 RED 진영 포탑/억제기/넥서스/미니언을 전부
  // 포함하므로(요청 20절 - 기본 공격/스킬 대상에 미니언·구조물 포함) 여기서
  // 따로 배열을 또 합칠 필요가 없다(중복 후보 방지). 우물(기지)은
  // isUntargetable이라 getAllEnemyUnits() 자체에서 이미 제외된다(요청 6/43).
  // BLUE(플레이어 자신의 진영)는 애초에 getAllEnemyUnits()에 들어가지
  // 않으므로 실수로 아군을 클릭해 공격하는 일도 자동으로 방지된다.
  // 시야 시스템 연동: 지금 실제로 보이는 적만 클릭 대상 후보로 삼는다
  // (getAllEnemyUnits()가 아니라 getTargetableEnemyUnits()를 쓴다 -
  // 01_hit_detection.js 참고). 시스템이 꺼져 있으면 기존과 완전히 동일하게
  // 동작한다.
  const candidates = getTargetableEnemyUnits();
  if (!candidates.length) return null;
  mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const bodies = candidates.map((u) => u.body);
  const hits = raycaster.intersectObjects(bodies, false);
  if (hits.length) {
    const exact = candidates.find((u) => u.body === hits[0].object);
    if (exact) return exact;
  }
  // 정밀 레이캐스트가 빗나갔을 때의 관대한 폴백.
  let best = null, bestDist = Infinity;
  for (const u of candidates) {
    const p = getWorldPosition(u);
    if (!p || isBehindCamera(p)) continue;
    const screen = worldToScreenPx(p);
    const dist = Math.hypot(screen.x - clientX, screen.y - clientY);
    const radiusPx = u.isMinion ? ENEMY_CLICK_RADIUS_MINION_PX : ENEMY_CLICK_RADIUS_PX;
    if (dist <= radiusPx && dist < bestDist) { bestDist = dist; best = u; }
  }
  return best;
}

let paused = false;
window.addEventListener('contextmenu', (e) => e.preventDefault());

// 요청: 사용자가 직접 허수아비를 설치할 수 있게 한다. createDummyEnemy()를
// 그대로 재사용하므로(새 더미 시스템을 따로 만들지 않음) Visual/Hitbox/
// isTrainingDummy(죽지 않음)/CC 전부 기본 더미와 완전히 동일하게 동작한다.
function placeDummyAt(point) {
  const d = createDummyEnemy(new THREE.Vector3(point.x, 0, point.z));
  placedDummies.push(d);
  console.log(`[더미 설치] 위치: (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) - 현재 설치된 허수아비 ${placedDummies.length}개`);
}
function removeDummyVisual(d) {
  if (!d) return;
  // CSS2DObject는 Scene에서 remove()해도 실제 DOM 노드가 즉시 제거된다고
  // 보장하지 않는다. GLB 교체처럼 renderer가 다음 프레임을 그리기 전에
  // 씬을 갈아끼우는 경우 이전 더미 HP바가 화면에 고아 DOM으로 남을 수 있다.
  if (d.labelDiv?.parentNode) d.labelDiv.parentNode.removeChild(d.labelDiv);
  if (d.mesh) scene.remove(d.mesh);
  if (controller && controller.currentTarget === d) {
    controller.currentTarget = null;
    targetRing.clear();
  }
}

function clearPlacedDummies() {
  for (const d of placedDummies) {
    if (controller && controller._morde && controller._morde.isInDeathRealm && controller._morde.rTarget === d) {
      d.hp = 0;
    }
    if (controller && controller._sett && controller._sett.rSeq && controller._sett.rSeq.target === d) {
      d.hp = 0;
    }
    removeDummyVisual(d);
  }
  placedDummies = [];
}
function setDummyPlaceMode(v) {
  dummyPlaceMode = v;
  renderer.domElement.style.cursor = v ? 'crosshair' : '';
}
const dummyPlaceCheckboxEl = document.getElementById('dummyPlaceCheckbox');
if (dummyPlaceCheckboxEl) dummyPlaceCheckboxEl.addEventListener('change', () => setDummyPlaceMode(dummyPlaceCheckboxEl.checked));
const clearDummiesBtnEl = document.getElementById('clearDummiesBtn');
if (clearDummiesBtnEl) clearDummiesBtnEl.addEventListener('click', clearPlacedDummies);

// 요청: 허수아비에 숫자로 데미지를 테스트할 수 있는 기능. 새 피해 계산을
// 만들지 않고 기존 applyDamage() 파이프라인을 그대로 재사용한다 - 그래야
// 방어력/마법저항력/방어구 관통 등 실제 스킬과 동일한 계산 결과를 확인할
// 수 있다(임의의 숫자를 곧바로 HP에서 빼는 방식이 아님).
function getDamageTestTarget() {
  // 현재 선택된 대상이 더미(기본/설치 더미 전부 isTrainingDummy)라면 그걸
  // 우선 사용하고, 없으면 기본 더미로 폴백한다 - 설치한 여러 더미 중
  // 원하는 것을 클릭으로 골라 테스트할 수 있게 한다.
  if (controller && controller.currentTarget && controller.currentTarget.isTrainingDummy && controller.currentTarget.hp > 0) return controller.currentTarget;
  if (typeof dummy !== 'undefined' && dummy && dummy.hp > 0) return dummy;
  return null;
}
const dummyDamageInputEl = document.getElementById('dummyDamageInput');
const dummyDamageTypeEl = document.getElementById('dummyDamageType');
const applyDummyDamageBtnEl = document.getElementById('applyDummyDamageBtn');
const healDummyBtnEl = document.getElementById('healDummyBtn');
function applyTestDamage() {
  const target = getDamageTestTarget();
  if (!target) { console.log('[더미 데미지 테스트] 대상 없음 - 더미를 배치하거나 클릭으로 선택하세요'); return; }
  const raw = Number(dummyDamageInputEl.value);
  if (!Number.isFinite(raw) || raw <= 0) { console.log('[더미 데미지 테스트] 올바른 양수를 입력하세요'); return; }
  const damageType = dummyDamageTypeEl.value;
  const before = target.hp;
  const applied = applyDamage(target, { rawDamage: raw, damageType, isCritical: false, critMultiplier: 1 });
  console.log(`[더미 데미지 테스트] 입력 ${raw}(${damageType}) -> 실제 적용 ${applied.toFixed(1)} (방어력/저항력 반영) | HP ${before.toFixed(1)} -> ${target.hp.toFixed(1)}`);
}
if (applyDummyDamageBtnEl) applyDummyDamageBtnEl.addEventListener('click', applyTestDamage);
if (dummyDamageInputEl) dummyDamageInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyTestDamage(); });
if (healDummyBtnEl) {
  healDummyBtnEl.addEventListener('click', () => {
    const target = getDamageTestTarget();
    if (!target) { console.log('[더미 회복] 대상 없음'); return; }
    target.hp = target.maxHp;
    if (target.labelDiv) {
      const bar = target.labelDiv.querySelector('.hpBarInner');
      if (bar) {
        bar.style.width = '100%';
        if (target.labelDiv.classList.contains('champion')) bar.style.background = 'linear-gradient(180deg,#6fe06a,#2f9e2f)';
      }
      target.labelDiv.style.opacity = '1';
    }
    console.log(`[더미 회복] ${unitLabel(target)} 체력을 ${target.maxHp}으로 전부 회복`);
  });
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (paused || !controller) return;
  if (e.button === 2) {
    const groundPoint = getGroundPoint(e.clientX, e.clientY);
    if (!groundPoint) return;
    // Alpha Strike 진행 중 우클릭(요청 문서 1 섹션 25): 재등장 방향만
    // 갱신하고, 일반 이동 명령(controller.moveTo)은 실행하지 않는다 -
    // "Q 상태 + 우클릭 -> 재등장 위치 변경, 이동 명령은 실행 안 함".
    if (controller._masteryi && controller._masteryi.alpha) {
      controller._masteryiSetAlphaStrikeReemergeDirection(groundPoint);
      return;
    }
    spawnMoveMarker(groundPoint); controller.moveTo(groundPoint);
  } else if (e.button === 0) {
    if (dummyPlaceMode) {
      const groundPoint = getGroundPoint(e.clientX, e.clientY);
      if (groundPoint) placeDummyAt(groundPoint);
      return;
    }
    const enemyHit = getEnemyHit(e.clientX, e.clientY);
    if (enemyHit) controller.selectTarget(enemyHit);
    else { controller.currentTarget = null; targetRing.clear(); }
  }
});

// 요청("지정 쉽게 해줘") - 클릭하기 전에 커서를 바꿔서 지금 무엇을
// 지정하게 될지 미리 보여준다(관대한 클릭 판정과 동일한 getEnemyHit을
// 그대로 재사용 - 새 판정 시스템을 따로 만들지 않음). 마우스가 멈춰
// 있을 때는 값이 안 바뀌므로 매 프레임이 아니라 실제 mousemove 이벤트가
// 있을 때만 계산되고, 후보 수도 최대 수십 개 수준이라 비용이 거의 없다.
renderer.domElement.addEventListener('pointermove', (e) => {
  if (paused || !controller || dummyPlaceMode) { renderer.domElement.style.cursor = ''; return; }
  const enemyHit = getEnemyHit(e.clientX, e.clientY);
  renderer.domElement.style.cursor = enemyHit ? 'pointer' : '';
});

window.addEventListener('keydown', (e) => {
  if (!controller) return;
  // 버그 수정("스킬 쓰면 마우스 커서가 사라진다"): 이 앱 자체는 커서를
  // 숨기는 코드가 없다 - 이건 브라우저가 키보드 입력이 들어오면 마우스
  // 커서를 잠깐 자동으로 숨기는 동작(특히 크롬 계열) 때문이다. Q/W/E/R
  // 스킬을 전부 키보드로 쓰니까 스킬을 쓸 때마다 이 현상이 발생했다.
  // 키 입력이 들어올 때마다 커서 스타일을 강제로 다시 지정해서 브라우저의
  // 자동 숨김을 무력화한다 - renderer.domElement에 이미 있던 커서 값을
  // 그대로 재적용할 뿐이라 다른 커서 로직(크로스헤어/포인터 등)과
  // 충돌하지 않는다.
  const canvasEl = renderer.domElement;
  const keepCursor = canvasEl.style.cursor;
  canvasEl.style.cursor = 'none';
  requestAnimationFrame(() => { canvasEl.style.cursor = keepCursor; });
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'F1') { e.preventDefault(); debugPanelVisible = !debugPanelVisible; return; }
  if (e.code === 'KeyV') { rangeIndicators.toggle(); const cb = document.getElementById('rangeIndicatorCheckbox'); if (cb) cb.checked = rangeIndicators.visible; return; }
  if (e.code === 'KeyP') { setDummyPlaceMode(!dummyPlaceMode); if (dummyPlaceCheckboxEl) dummyPlaceCheckboxEl.checked = dummyPlaceMode; return; }
  if (paused) return;
  // 버그 수정(핵심 - "마스터 이 W 모션이 반복된다"의 진짜 원인): 이
  // 리스너에 OS 키 반복(long-press) 방지 처리가 전혀 없었다. 키를 누르고
  // 있으면 브라우저가 짧은 간격으로 keydown을 계속 재발생시키는데(e.repeat
  // === true), 그때마다 castAbility('W')가 다시 호출됐다. "이미 명상
  // 중이면 W를 또 누르는 것 = 즉시 취소"로 만들어둔 로직과 맞물려서,
  // W를 누르고 있기만 해도 시작→취소→시작→취소가 수십 밀리초 간격으로
  // 반복돼 정확히 "모션이 반복되는" 것처럼 보였다. Q/E/R도 키를 누르고
  // 있으면 계속 재시전되는 같은 문제가 있었다 - e.repeat 하나로 전부
  // 막는다(각 스킬 로직은 전혀 건드리지 않음).
  if (e.repeat) return;
  const mousePoint = lastGroundPoint || controller.root.position.clone();
  switch (e.code) {
    case 'KeyQ': controller.castAbility('Q', mousePoint); break;
    case 'KeyW': controller.castAbility('W', mousePoint); break;
    case 'KeyE': controller.castAbility('E', mousePoint); break;
    // 버그 수정("이즈리얼 궁이 마우스 커서 쪽으로 안 나간다"): 이 R
    // 키 핸들러가 다른 스킬(Q/W/E)과 달리 mousePoint를 아예 넘기지 않고
    // controller.castAbility('R')만 호출했다 - 가렌/다리우스/세트/모데카이저/
    // 닐라처럼 방향이 필요 없는 R에는 원래 문제가 없었지만, 요네·이즈리얼처럼
    // 마우스 방향이 그대로 필요한 직선 R(_yoneCastR/_ezrealCastR)에는
    // mouseWorldPoint 자체가 undefined로 들어가 항상 기본 방향(정면)으로만
    // 나갔다. Q/W/E와 동일하게 mousePoint를 넘기도록 통일한다 - 방향이
    // 필요 없는 챔피언들의 _castR(free)/_nilahCastR 등은 애초에 두 번째
    // 인자를 받지 않으므로 영향이 없다.
    case 'KeyR': controller.castAbility('R', mousePoint); break;
    case 'KeyB': controller.startRecall(); break;
    case 'Space': if (dummy && dummy.hp > 0) controller.selectTarget(dummy); break;
    // 아이템 사용(실제 LoL과 동일한 숫자키 1~6 인벤토리 단축키) - 사용
    // 불가 아이템(스탯 아이템)이면 useItem() 내부에서 콘솔 경고만 내고
    // 조용히 무시된다.
    case 'Digit1': if (typeof useItem === 'function') useItem(controller, 0); break;
    case 'Digit2': if (typeof useItem === 'function') useItem(controller, 1); break;
    case 'Digit3': if (typeof useItem === 'function') useItem(controller, 2); break;
    case 'Digit4': if (typeof useItem === 'function') useItem(controller, 3); break;
    case 'Digit5': if (typeof useItem === 'function') useItem(controller, 4); break;
    case 'Digit6': if (typeof useItem === 'function') useItem(controller, 5); break;
    // 트린켓(투명 와드) - 실제 LoL의 트린켓 키(기본 Y)와 겹치지 않게
    // 이 프로젝트에서 안 쓰던 T를 쓴다. Q/W/E/R과 동일하게 현재 마우스
    // 월드 좌표에 즉시 시전한다(설치 사정거리를 넘으면 placeWard()
    // 내부에서 그 방향 최대 거리로 clamp).
    case 'KeyT': if (typeof placeWard === 'function') placeWard(controller, mousePoint); break;
  }
});

let lastGroundPoint = null;
window.addEventListener('pointermove', (e) => { const p = getGroundPoint(e.clientX, e.clientY); if (p) lastGroundPoint = p; });

function togglePause() {
  paused = !paused;
  document.getElementById('pauseOverlay').classList.toggle('show', paused);
  clock.getDelta();
}

