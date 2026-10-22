/* ============================================================
   4. GLOBAL SYSTEM INSTANCES
   ============================================================ */
const vfx = new VFXSystem(scene);
// 사용자가 제공한 NilahVFXManager_v2를 이 프로젝트의 THREE.Scene에 연결한다.
// 기존 vfx(VFXSystem)와 완전히 별개로 동작하며, nilah.js의 Q/W/E/R 시전
// 함수에서 playQLoL/playWLoL/playELoL/playRLoL을 직접 호출한다.
const nilahVfx2 = new NilahVFXManagerV2(scene);
// 89차: 원작 파티클 엔진(src/vfx) - 게임 파일의 VfxSystemDefinitionData를 그대로 재생한다. lolVfx.register(skin0.bin 텍스트/JSON) 후 lolVfx.spawn(이름, { attach }).
const lolVfx = new LolVfxManager(scene, {});
if (typeof window !== 'undefined') window.lolVfx = lolVfx;
const projectiles = new ProjectileSystem(scene, vfx);
const targetRing = new TargetRing(scene);
const rangeIndicators = new RangeIndicatorSystem(scene);
const rangeIndicatorCheckboxEl = document.getElementById('rangeIndicatorCheckbox');
if (rangeIndicatorCheckboxEl) rangeIndicatorCheckboxEl.addEventListener('change', () => rangeIndicators.setVisible(rangeIndicatorCheckboxEl.checked));
// 스킬 조준(skill_aim_system.js): 시전 방식(일반/표시기 사용 빠른/빠른) 선택은 설정 패널, 매 프레임 갱신은 animate().
const skillAim = new SkillAimSystem(scene);
const castModeSelectEl = document.getElementById('castModeSelect');
if (castModeSelectEl) { castModeSelectEl.value = skillAim.mode; castModeSelectEl.addEventListener('change', () => { skillAim.setMode(castModeSelectEl.value); castModeSelectEl.blur(); }); }
// 시야 시스템(전장의 안개) - 범용 인스턴스 하나를 여기서 만들어 animate()
// 루프(champion_glb_loader.js)에서 매 프레임 update()를 호출한다. 다른
// 전역 시스템(vfx/projectiles/rangeIndicators)과 동일한 패턴.
const visionSystem = new VisionSystem(scene);
const visionSystemCheckboxEl = document.getElementById('visionSystemCheckbox');
if (visionSystemCheckboxEl) visionSystemCheckboxEl.addEventListener('change', () => visionSystem.setEnabled(visionSystemCheckboxEl.checked));
// 스킬 예고 표시(아군·적군 모두에게 보이는 지면 연출 - skill_telegraph_system.js).
const skillTelegraphs = new SkillTelegraphSystem(scene);
// 부쉬(brush_system.js): 기본 두 곳 + 설치 모드(N)로 클릭한 자리에 추가.
const brushSystem = new BrushSystem(scene);
brushSystem.addDefaultLayout();
// 와드(32차, ward_system.js): 체력·팀·은신·시야를 가진 유닛. animate()에서 매 프레임 update().
const wardSystem = new WardSystem(scene);
// 연습용 적 와드 설치 모드: 켜고 좌클릭하면 그 자리에 빨강 팀 와드를 놓는다(원작에는 없는 연습 도구).
let enemyWardPlaceMode = false;
const enemyWardPlaceCheckboxEl = document.getElementById('enemyWardPlaceCheckbox');
const enemyWardTypeSelectEl = document.getElementById('enemyWardTypeSelect');
function setEnemyWardPlaceMode(v) {
  enemyWardPlaceMode = v;
  if (enemyWardPlaceCheckboxEl) enemyWardPlaceCheckboxEl.checked = v;
  renderer.domElement.style.cursor = v ? 'crosshair' : '';
}
if (enemyWardPlaceCheckboxEl) enemyWardPlaceCheckboxEl.addEventListener('change', () => setEnemyWardPlaceMode(enemyWardPlaceCheckboxEl.checked));
const clearWardsBtnEl = document.getElementById('clearWardsBtn');
if (clearWardsBtnEl) clearWardsBtnEl.addEventListener('click', () => wardSystem.clear());
// 37차: 연습용 골드 지급(설정 패널) - 누를 때마다 골드 +10000.
const addGoldBtnEl = document.getElementById('addGoldBtn');
if (addGoldBtnEl) addGoldBtnEl.addEventListener('click', () => { if (!controller) return; controller.gold = (controller.gold || 0) + 10000; updateGoldDisplay(); });
// 59차: 첫 웨이브(1:05)를 기다리지 않고 양 팀 웨이브를 바로 부른다(연습용). 정기 웨이브 시계는 그대로 간다.
const spawnWaveBtnEl = document.getElementById('spawnWaveBtn');
if (spawnWaveBtnEl) spawnWaveBtnEl.addEventListener('click', () => { if (typeof howlingAbyssStructuresSpawned !== 'undefined' && !howlingAbyssStructuresSpawned) return; const t = getTurretGameTimeSec(); spawnMinionWave('BLUE', t); spawnMinionWave('RED', t); });
function placeEnemyWardAt(point) {
  const type = enemyWardTypeSelectEl && enemyWardTypeSelectEl.value === 'control' ? 'control' : 'stealth';
  const data = type === 'stealth' ? ITEM_DATA.stealthWard : null;
  wardSystem.place(null, type, point, { team: ENEMY_TEAM, durationSec: data ? data.wardDurationLateSec : Infinity });
}
let brushPlaceMode = false;
const brushPlaceCheckboxEl = document.getElementById('brushPlaceCheckbox');
function setBrushPlaceMode(v) {
  brushPlaceMode = v;
  if (v) { if (typeof setDummyPlaceMode === 'function' && dummyPlaceMode) setDummyPlaceMode(false); if (typeof setAllyPlaceMode === 'function' && allyPlaceMode) setAllyPlaceMode(false); }
  if (brushPlaceCheckboxEl) brushPlaceCheckboxEl.checked = v;
  renderer.domElement.style.cursor = v ? 'crosshair' : '';
}
if (brushPlaceCheckboxEl) brushPlaceCheckboxEl.addEventListener('change', () => setBrushPlaceMode(brushPlaceCheckboxEl.checked));
const clearBrushesBtnEl = document.getElementById('clearBrushesBtn');
if (clearBrushesBtnEl) clearBrushesBtnEl.addEventListener('click', () => brushSystem.clear());
// "적 팀 시야로 보기": 화면을 빨강 팀이 보는 그대로 그린다(판정은 그대로 플레이어 팀 시야).
const enemyViewCheckboxEl = document.getElementById('enemyVisionViewCheckbox');
if (enemyViewCheckboxEl) enemyViewCheckboxEl.addEventListener('change', () => visionSystem.setViewTeam(enemyViewCheckboxEl.checked ? ENEMY_TEAM : PLAYER_TEAM));
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
  // 유일 아이템(QA 요청) - 티아맷/히드라류, 여신의 눈물/마나무네/무라마나처럼
  // 같은 계열을 하나만 보유할 수 있는 아이템임을 상점 설명 맨 앞에 표시한다.
  if (item.uniqueGroup) parts.push('유일 아이템(같은 계열 하나만 보유 가능)');
  const extraDesc = item.descKo || []; // 71차: 새 아이템 효과 줄(능력치 줄 뒤에 붙인다)
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
  if (item.magicPenPercent) parts.push(`마법 관통력 +${Math.round(item.magicPenPercent * 100)}%`);
  if (item.manaOnDamagePercent) parts.push(`챔피언에게 피해를 입히면 피해량의 ${Math.round(item.manaOnDamagePercent * 100)}%만큼 마나 회복`);
  if (item.cleavePassive) parts.push(`쪼개기(평타 시 주변에 근거리 ${Math.round(item.cleavePassive.meleePercent * 100)}%｜원거리 ${Math.round(item.cleavePassive.rangedPercent * 100)}% 물리 피해)`);
  if (item.activeAbility) parts.push(`사용 시 "${item.activeAbility.nameKo}": 주변 적에게 공격력 ${Math.round(item.activeAbility.percentAD * 100)}% 물리 피해(재사용 대기시간 ${item.activeAbility.cooldownSec}초)`);
  if (item.spellbladePassive) {
    const sp = item.spellbladePassive;
    const critPart = sp.bonusPerCritChance ? ` + 치명타확률 ${sp.bonusPerCritChance}` : '';
    const apPart = sp.bonusApPercent ? ` + 주문력${Math.round(sp.bonusApPercent * 100)}%` : '';
    const manaPart = (sp.manaAdPercent || sp.manaPerCritChance) ? `, 마나 (공격력${Math.round((sp.manaAdPercent || 0) * 100)}%${sp.manaPerCritChance ? ' + 치명타확률 ' + sp.manaPerCritChance : ''}) 획득` : '';
    const dmgLabel = sp.damageType === 'MAGICAL' ? '마법' : '물리';
    const extraPart = sp.extraProc ? ' + 적중 시 효과 1회 추가 적용' : '';
    const healPart = (sp.healApPercent || sp.healBonusHpPercent) ? `, 체력 (주문력${Math.round((sp.healApPercent || 0) * 100)}%+추가체력${Math.round((sp.healBonusHpPercent || 0) * 100)}%) 회복` : '';
    const asPart = sp.attackSpeedWhileReadyPercent ? `, 주문 검 사용 가능 시 공격속도 +${Math.round(sp.attackSpeedWhileReadyPercent * 100)}%` : '';
    const ewPart = sp.exposeWeaknessPassive ? `, 챔피언 적중 시 ${sp.exposeWeaknessPassive.durationSec}초간 받는 피해 근접${Math.round(sp.exposeWeaknessPassive.meleePercent * 100)}%｜원거리${Math.round(sp.exposeWeaknessPassive.rangedPercent * 100)}% 증가(약점 노출)` : '';
    parts.push(`주문 검: 스킬 사용 후 다음 평타에 ("기본" 공격력${Math.round(sp.bonusAdPercent * 100)}%${apPart}${critPart}) 추가 ${dmgLabel} 피해${extraPart}${manaPart}${healPart}${asPart}${ewPart}(자체 재사용 대기시간 ${sp.procCooldownSec}초)`);
  }
  if (item.onHitMagicDamagePassive) { const p = item.onHitMagicDamagePassive; parts.push(`이케시아의 이빨(기본 공격 시 온히트 마법 피해 +${p.flat}+주문력${Math.round(p.apPercent * 100)}%)`); }
  if (item.squallPassive) { const p = item.squallPassive; parts.push(`폭풍 약탈자(${p.windowSec}초 내 챔피언 최대 체력의 ${Math.round(p.hpThresholdPercent * 100)}%에 해당하는 피해를 입히면 질풍 적용, 대상별 재사용대기시간 ${p.icdSec}초)`); }
  if (item.galePassive) { const p = item.galePassive; parts.push(`질풍(${p.delaySec}초 후 ${p.baseDmg}+주문력${Math.round(p.apPercent * 100)}% 마법 피해, 가격 전 대상 사망 시 즉시 범위 폭발)`); }
  if (item.cinderbloomPassive) { const p = item.cinderbloomPassive; parts.push(`잿덩이꽃(체력 ${Math.round(p.hpThresholdPercent * 100)}% 이하인 적에게 마법·고정 피해 시 +${Math.round(p.bonusPercent * 100)}% 추가 피해, 치명타 피해량 효과 적용)`); }
  if (item.noxiousBladeActive) { const p = item.noxiousBladeActive; parts.push(`사용 시 "${p.nameKo}": 선택한 적 챔피언에게 ${p.minDmg}~${p.maxDmg}(레벨비례)+주문력${Math.round(p.apPercent * 100)}% 마법 피해 + ${p.slowDurationSec}초간 ${Math.round(p.slowPercent * 100)}% 둔화, 재사용 대기시간 ${p.cooldownSec}초`); }
  // 전설급 4차분(정수약탈자~도미닉 경의 인사) 패시브 설명.
  if (item.executePassive) parts.push(`죽음(체력이 ${Math.round(item.executePassive.hpThresholdPercent * 100)}% 밑으로 떨어질 만큼의 피해를 입히면 처형)`);
  if (item.taxPassive) parts.push(`세금(챔피언 처치 시 추가로 ${item.taxPassive.goldOnTakedown}골드)`);
  if (item.magnifyPassive) parts.push(`확대(기본 공격 시 거리 비례 최대 ${Math.round(item.magnifyPassive.maxBonusPercent * 100)}% 추가 물리 피해, ${item.magnifyPassive.maxDistanceLol} 거리에서 최대)`);
  if (item.arcaneFocusPassive) { const p = item.arcaneFocusPassive; parts.push(`비전 조준(피해를 입힌 챔피언이 ${p.windowSec}초 안에 사망하면 ${p.bonusDurationSec}초 동안 사거리+${p.bonusRangeLol})`); }
  if (item.permanentCritPassive) { const p = item.permanentCritPassive; parts.push(`연습이 치명타를 낳는다(공격 시 치명타확률 영구 근접+${(p.meleeCritPerHit * 100).toFixed(1)}%｜원거리+${(p.rangedCritPerHit * 100).toFixed(1)}%, 최대 ${Math.round(p.maxCritChance * 100)}%)`); }
  if (item.marksmanshipActivePassive) { const p = item.marksmanshipActivePassive; parts.push(`명중(적 챔피언 공격 시 ${p.buffDurationSec}초간 공격속도+${Math.round(p.attackSpeedBonusPercent * 100)}%, 재사용대기시간 ${p.icdSec}초, 기본 공격 시 ${p.cdrPerAttackSec}초｜치명타 적중 시 추가 ${p.cdrPerCritSec}초 감소)`); }
  if (item.markmanshipPassive) { const p = item.markmanshipPassive; parts.push(`명중(챔피언에게 피해를 입히면 고정 마법 피해+${p.bonusMagicDamage}, 재사용대기시간 ${p.icdSec}초, 기본 공격 시 ${p.cdrPerAttackSec}초 감소)`); }
  if (item.boltsPassive) { const p = item.boltsPassive; parts.push(`벼락(${p.hitsNeeded}번째 기본 공격마다 대상이 잃은 체력 비례 추가 물리 피해, 근접${p.meleeMin}~${p.meleeMax}｜원거리${p.rangedMin}~${p.rangedMax}, ${p.levelMin}~${p.levelMax}레벨 구간 성장)`); }
  if (item.chargePassive) { const p = item.chargePassive; parts.push(`충전 상태(이동하거나 공격하면 충전, 충전 상태로 공격 시${p.bonusMagicDamage ? ' 마법 피해+' + p.bonusMagicDamage : ''}${p.msBuffPercent ? ', 이동속도+' + Math.round(p.msBuffPercent * 100) + '%(' + p.msBuffDurationSec + '초)' : ''}${p.bonusRangePercent ? ', 사거리+' + Math.round(p.bonusRangePercent * 100) + '%(최대 ' + p.bonusRangeCapLol + '유닛)' : ''})`); }
  // 버그 수정(QA - "버그/미구현 확인"): skillChargePassive는 지금까지
  // item_data.js에 빈 객체({})로만 있고 로직(item_system.js가 's.id ===
  // "stormsurge"'로 직접 확인)과 설명(이 함수) 둘 다 이 필드를 전혀
  // 읽지 않았다 - 아래 창공(skywardPassive) 설명만 보면 "충전 상태"가
  // 어떻게 생기는지 전혀 알 수 없었다(트리거 조건 자체가 설명에서
  // 통째로 빠져 있었음).
  if (item.skillChargePassive) parts.push('전류 자극(챔피언에게 스킬로 피해를 입히면 충전 상태 준비)');
  if (item.ghostingPassive) parts.push('유체화(이동 시 미니언·챔피언과 충돌하지 않음 - 이 데모는 유닛 충돌 자체가 없어 실질적인 차이는 없음)');
  if (item.enlightenmentPassive) parts.push(`깨달음(기본 공격 시 기본 스킬의 남은 재사용 대기시간 ${Math.round(item.enlightenmentPassive.cdrPercentOfRemaining * 100)}% 감소)`);
  if (item.giantSlayerPassive) { const p = item.giantSlayerPassive; parts.push(`거인 학살자(대상의 추가 체력에 비례해 챔피언 대상 최대 ${Math.round(p.maxBonusPercent * 100)}% 추가 피해, 추가 체력 ${p.maxAtBonusHp}에서 최대)`); }
  // 전설급 5차분(필멸자의 운명~세릴다의 원한) 패시브 설명.
  if (item.lifelinePassive && item.lifelinePassive.levelScaledShield) { const p = item.lifelinePassive; parts.push(`생명선(피해 종류 무관 - 체력이 ${Math.round(p.hpThresholdPercent * 100)}% 밑으로 떨어질 만큼이면 ${p.shieldDurationSec}초간 근접${p.meleeShieldMin}~${p.meleeShieldMax}｜원거리${p.rangedShieldMin}~${p.rangedShieldMax}(레벨비례) 보호막, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.critDamagePercent) parts.push(`치명타 피해량 +${Math.round(item.critDamagePercent * 100)}%`);
  if (item.onHitHybridPassive) { const p = item.onHitHybridPassive; parts.push(`그림자(기본 공격 시 ${p.flat}(+추가공격력${Math.round(p.bonusAdPercent * 100)}%+주문력${Math.round(p.apPercent * 100)}%) 온히트 마법 피해)`); }
  if (item.lightDarkPassive) { const p = item.lightDarkPassive; parts.push(`빛과 어둠(챔피언 상대 기본 공격마다 번갈아 - 빛: 방어력·마법저항력 ${p.lightArmorMrMin}~${p.lightArmorMrMax}(레벨비례)×최대 ${p.maxStacks}중첩, 어둠: 방어구·마법 관통력 ${Math.round(p.darkPenPercentPerStack * 100)}%×최대 ${p.maxStacks}중첩, ${p.durationSec}초 지속)`); }
  if (item.ragingBlowsPassive) { const p = item.ragingBlowsPassive; parts.push(`들끓는 일격(기본 공격 시 공격속도 +${Math.round(p.asPerStack * 100)}%, 최대 ${p.maxStacks}중첩, 최대 중첩 시 ${p.doubleProcHitsNeeded}번째 기본 공격마다 적중 시 효과 2회)`); }
  if (item.overhealShieldPassive) { const p = item.overhealShieldPassive; parts.push(`영액의 보호막(생명력 회복으로 최대 체력을 초과하는 회복분을 보호막으로 전환, 최대 ${p.minShield}~${p.maxShield}(${p.levelMin}~${p.levelMax}레벨))`); }
  if (item.outOfCombatMsPassive) { const p = item.outOfCombatMsPassive; parts.push(`출몰(전투 이탈 시 이동속도 근접+${p.meleeAmount}｜원거리+${p.rangedAmount})`); }
  if (item.ghostStepActive) { const p = item.ghostStepActive; parts.push(`사용 시 "${p.nameKo}": 근접${p.meleeDurationSec}초｜원거리${p.rangedDurationSec}초간 이동속도 근접+${Math.round(p.meleeMsPercent * 100)}%｜원거리+${Math.round(p.rangedMsPercent * 100)}% + 유체화, 재사용 대기시간 ${p.cooldownSec}초`); }
  if (item.skywardPassive) { const p = item.skywardPassive; parts.push(`창공(충전 상태로 공격 시 ${p.durationSec}초간 물리 관통력 근접+${p.meleeArmorPenFlat}｜원거리+${p.rangedArmorPenFlat} + 대상 현재 체력 근접${Math.round(p.meleeCurrentHpPercent * 100)}%｜원거리${Math.round(p.rangedCurrentHpPercent * 100)}% 추가 물리 피해, 비챔피언 최대 ${p.nonChampionCap})`); }
  if (item.renownPassive) { const p = item.renownPassive; parts.push(`명성(피해를 입힌 챔피언이 ${p.windowSec}초 안에 죽으면 ${p.durationSec}초간 공격력 +${p.baseAD}, 처치마다 +${p.adPerKill} 추가)`); }
  if (item.shapedChargePassive) { const p = item.shapedChargePassive; parts.push(`성형작약(챔피언에게 스킬로 피해 시 추가로 ${p.meleeFlat}(+물리 관통력×${Math.round(p.meleeArmorPenPercentOfStat * 100)}%)｜원거리 ${p.rangedFlat}(+물리 관통력×${Math.round(p.rangedArmorPenPercentOfStat * 100)}%)의 고정 피해, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.sabotagePassive) { const p = item.sabotagePassive; parts.push(`파괴 공작(처치 관여 시 ${p.durationSec}초간 보유 - 포탑 대상 다음 기본 공격 시 ${p.dotDurationSec}초에 걸쳐 근접${p.meleeFlat}(+물리 관통력×${Math.round(p.meleeArmorPenPercentOfStat * 100)}%)｜원거리${p.rangedFlat}(+물리 관통력×${Math.round(p.rangedArmorPenPercentOfStat * 100)}%)의 고정 피해)`); }
  if (item.frostPassive) { const p = item.frostPassive; parts.push(`매서운 추위(스킬로 체력 ${Math.round(p.hpThresholdPercent * 100)}% 이하인 적에게 피해 시 ${p.slowDurationSec}초간 ${Math.round(p.slowPercent * 100)}% 둔화)`); }
  if (item.burnOnDamagePassive && item.burnOnDamagePassive.dmgPerSec != null) parts.push(`발화(피해 시 ${item.burnOnDamagePassive.durationSec}초간 매초 ${item.burnOnDamagePassive.dmgPerSec}(몬스터 ${item.burnOnDamagePassive.monsterDmgPerSec}) 마법 고정 피해)`);
  if (item.burnOnDamagePassive && item.burnOnDamagePassive.baseDmgPerSec != null) { const p = item.burnOnDamagePassive; parts.push(`악의의 불길(피해 시 ${p.durationSec}초간 매초 ${p.baseDmgPerSec}+주문력${Math.round(p.apPercentPerSec * 100)}% 마법 피해, 몬스터 매초 +${p.monsterBonusPerSec} 추가)`); }
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
  if (item.soulboundMsPassive) { const p = item.soulboundMsPassive; parts.push(`${p.stackThreshold}중첩 이상일 때 이동 속도 +${Math.round(p.moveSpeedPercent * 100)}%`); }
  if (item.manaCirculationPassive) { const p = item.manaCirculationPassive; parts.push(`마나순환(적중 시 최대 마나 +${p.maxManaPerHit}｜챔피언 +${p.maxManaPerChampionHit}, 누적 최대 ${p.maxManaCap}, 충전 ${p.maxCharges}회/${p.rechargeSec}초)`); }
  if (item.slaughterPassive) { const p = item.slaughterPassive; parts.push(`학살(챔피언 처치 관여 시 중첩당 흡혈 +${(p.vampPerStack * 100).toFixed(1)}%, 최대 ${p.maxStacks}중첩)`); }
  if (item.manaSpentToHealPercent) parts.push(`영원(스킬 사용 시 소모 마나의 ${Math.round(item.manaSpentToHealPercent * 100)}%만큼 체력 회복, 초당 최대 ${item.manaSpentHealCapPerSec} HP)`);
  if (item.carryoverMoveSpeedOnUpgrade) parts.push(`다른 신발로 바꿔도 이동 속도 +${item.carryoverMoveSpeedOnUpgrade} 효과 유지`);
  // 제어 와드 + 영약 3종 - "남은 소모 아이템" 요청으로 추가.
  // 버그 수정(QA - "서포터 아이템" 점검): 기존에는 maxStack 기반 제어
  // 와드(제어 와드 아이템 자체)만 염두에 두고 item.maxStack을 그대로
  // 박아 넣었는데, 세계의 결실 계열(충전 기반 - maxCharges)은 maxStack이
  // 없어 상점 설명에 "최대 undefined개 소지"로 표시되고 있었다.
  if (item.wardPlacement) { const p = item.wardPlacement; const qty = item.maxStack || item.maxCharges; parts.push(`사용 시 시야 ${p.visionRadius}의 와드 설치(설치 사정거리 ${p.placeRange}${qty ? `, 최대 ${qty}개 소지` : ''})`); }
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
  if (item.lifelinePassive && item.lifelinePassive.omnivampPercentAfterTrigger) { const p = item.lifelinePassive; parts.push(`생명선(마법 피해로 체력이 ${Math.round(p.hpThresholdPercent * 100)}% 밑으로 떨어질 만큼이면 ${p.shieldDurationSec}초 보호막, 재사용대기시간 ${p.icdSec}초, 발동 후 ${p.omnivampDurationSec}초간 모든 피해 흡혈 +${Math.round(p.omnivampPercentAfterTrigger * 100)}%)`); }
  // 전설급 3차분(거대한히드라~수호천사) 패시브 설명.
  if (item.lifelinePassive && item.lifelinePassive.bonusHpShieldPercent) { const p = item.lifelinePassive; parts.push(`생명선(피해 종류 무관 - 체력이 ${Math.round(p.hpThresholdPercent * 100)}% 밑으로 떨어질 만큼이면 추가 체력의 ${Math.round(p.bonusHpShieldPercent * 100)}% 보호막, ${p.shieldDecaySec}초에 걸쳐 점차 감소, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.bonusAdPercentOfBaseAd) parts.push(`잡아채는 발톱(기본 공격력의 ${Math.round(item.bonusAdPercentOfBaseAd * 100)}%만큼 추가 공격력)`);
  if (item.cleaveMaxHpPassive) { const p = item.cleaveMaxHpPassive; parts.push(`쪼개기(기본 공격 시 자신의 최대 체력 근접${Math.round(p.meleeTargetPercent * 100)}%｜원거리${(p.rangedTargetPercent * 100).toFixed(1)}% 물리 피해 + 주변 적에게 근접${Math.round(p.meleeSplashPercent * 100)}%｜원거리${(p.rangedSplashPercent * 100).toFixed(1)}%, 구조물 제외)`); }
  if (item.empoweredCleaveActive) { const p = item.empoweredCleaveActive; parts.push(`사용 시 "${p.nameKo}": 다음 쪼개기 1회 강화(근접+${Math.round(p.meleeTargetBonusPercent * 100)}%/주변+${Math.round(p.meleeSplashBonusPercent * 100)}%, 재사용 대기시간 ${p.cooldownSec}초)`); }
  if (item.shockwaveActive) { const p = item.shockwaveActive; parts.push(`사용 시 "${p.nameKo}": 주변 적에게 공격력 근접${Math.round(p.meleePercentAD * 100)}%｜원거리${Math.round(p.rangedPercentAD * 100)}% 물리 피해 + ${Math.round(p.slowPercent * 100)}% 둔화 ${p.slowDurationSec}초 + 맞은 챔피언당 이동속도 +${Math.round(p.msPerChampionHitPercent * 100)}%(${p.msDurationSec}초에 걸쳐 감소), 재사용 대기시간 ${p.cooldownSec}초`); }
  if (item.ignorePainPassive) { const p = item.ignorePainPassive; parts.push(`고통 무시(받는 피해의 근접${Math.round(p.meleeDeferPercent * 100)}%｜원거리${Math.round(p.rangedDeferPercent * 100)}%를 ${p.deferDurationSec}초에 걸쳐 나눠 받음)`); }
  if (item.defiancePassive) { const p = item.defiancePassive; parts.push(`반항(피해를 입힌 챔피언이 ${p.windowSec}초 안에 죽으면 지연 피해 소멸 + 추가 공격력 ${Math.round(p.healBonusAdPercent * 100)}%만큼 ${p.healDurationSec}초에 걸쳐 회복)`); }
  if (item.revivePassive) { const p = item.revivePassive; parts.push(`환생(치명적 피해를 받아도 쓰러지지 않고 ${p.stasisDurationSec}초간 무적+대상 지정 불가 후 체력 ${Math.round(p.healHpPercent * 100)}%｜마나 ${Math.round(p.healMpPercent * 100)}%로 부활, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.focusedWillPassive) { const p = item.focusedWillPassive; parts.push(`집중된 의지(피해를 입히면 ${p.durationSec}초간 스택당 피해량 +${Math.round(p.percentPerStack * 100)}%, 최대 ${p.maxStacks}중첩)`); }
  if (item.captainPassive) { const p = item.captainPassive; parts.push(`선장(챔피언·에픽 몬스터 대상 ${p.hitsNeeded}번째 기본 공격마다 추가 물리 피해, 구조물 대상은 배율 증가)`); }
  if (item.carvePassive) { const p = item.carvePassive; parts.push(`깎아내기(챔피언 물리 피해 시 ${p.durationSec}초간 방어력 -${Math.round(p.shredPerStack * 100)}%, 최대 ${p.maxStacks}중첩)`); }
  if (item.ragePassive) { const p = item.ragePassive; parts.push(`열정(물리 피해를 입히면 ${p.durationSec}초간 이동 속도 근접+${p.meleeAmount}｜원거리+${p.rangedAmount})`); }
  if (item.lightshieldStrikePassive) { const p = item.lightshieldStrikePassive; parts.push(`라이트쉴드 타격(챔피언별 ${p.icdPerTargetSec}초마다 첫 기본 공격 시 근접 기본공격력${Math.round(p.meleeBaseAdPercent * 100)}%｜원거리${Math.round(p.rangedBaseAdPercent * 100)}% + 잃은 체력 ${Math.round(p.missingHpHealPercent * 100)}%만큼 체력 회복)`); }
  if (item.tyrannyPassive) parts.push(`폭정(추가 체력의 ${(item.tyrannyPassive.bonusHpToAdPercent * 100).toFixed(1)}%만큼 추가 공격력)`);
  if (item.vengeancePassive) { const p = item.vengeancePassive; parts.push(`응징(잃은 체력에 비례해 공격력 최대 ${Math.round(p.maxAdPercent * 100)}% 증가, 체력 ${Math.round(p.maxAtHpPercent * 100)}%에서 최대치 도달)`); }
  // 전설급 7차분(영겁의지팡이~균열생성기) 패시브 설명.
  if (item.enlightenPassive) { const p = item.enlightenPassive; parts.push(`깨우치기(레벨 업 시 ${p.durationSec}초에 걸쳐 최대 마나의 ${Math.round(p.manaPercentOverTime * 100)}% 회복)`); }
  if (item.procOnChampionDamagePassive) { const p = item.procOnChampionDamagePassive; parts.push(`자극(챔피언에게 피해를 입히면 고정 마법 피해 +${p.flatMagicDamage}, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.timelessPassive) { const p = item.timelessPassive; parts.push(`불멸의 시간(${p.intervalSec}초마다 체력+${p.hpPerStack}/마나+${p.manaPerStack}/주문력+${p.apPerStack}, 최대 ${p.maxStacks}중첩, 최대 중첩 도달 시 레벨 +1)`); }
  if (item.aweBonusApPercentOfMana) parts.push(`경탄(최대 마나의 ${Math.round(item.aweBonusApPercentOfMana * 100)}%만큼 추가 주문력)`);
  if (item.lifelinePassive && item.lifelinePassive.manaPercentShield) { const p = item.lifelinePassive; parts.push(`생명선(피해 종류 무관 - 체력이 ${Math.round(p.hpThresholdPercent * 100)}% 밑으로 떨어질 만큼이면 ${p.shieldDurationSec}초간 최대 마나의 ${Math.round(p.shieldManaPercent * 100)}% 보호막, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.ultimateHasteFlat) parts.push(`궁극기 가속 +${item.ultimateHasteFlat}`);
  if (item.hatefogPassive) { const p = item.hatefogPassive; parts.push(`증오안개(궁극기로 챔피언에게 피해 시 ${p.durationSec}초간 지면을 불태워 매초 ${p.dmgPerSec}+주문력${Math.round(p.apPercentPerSec * 100)}% 마법 피해 + 마법저항력 -${p.mrShred}, 최대 반경 ${p.maxRadius})`); }
  if (item.blackfirePassive) parts.push(`어둠불꽃(불타는 적 하나당 총 주문력 +${Math.round(item.blackfirePassive.apPercentPerStack * 100)}%)`);
  if (item.ludensEchoPassive) { const p = item.ludensEchoPassive; parts.push(`메아리(스킬로 피해 시 대상에게 ${p.baseDmg}+주문력${Math.round(p.apPercent * 100)}% 기준 추가 마법 피해, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.rocketbeltActive) { const p = item.rocketbeltActive; parts.push(`사용 시 "${p.nameKo}": 주변 적에게 ${p.baseDmg}+주문력${Math.round(p.apPercent * 100)}% 마법 피해, 재사용 대기시간 ${p.cooldownSec}초`); }
  if (item.frostOnDamagePassive) { const p = item.frostOnDamagePassive; parts.push(`서리(피해 시 ${p.slowDurationSec}초간 ${Math.round(p.slowPercent * 100)}% 둔화)`); }
  if (item.burnPercentMaxHpPassive) { const p = item.burnPercentMaxHpPassive; parts.push(`고통(피해 시 ${p.durationSec}초간 매초 최대 체력의 ${Math.round(p.percentOfMaxHpPerSec * 100)}% 마법 피해)`); }
  if (item.combatRampPassive) {
    const p = item.combatRampPassive;
    let s = `전투 중 누적 추가 피해(챔피언 상대 매초 +${Math.round(p.percentPerSec * 100)}%, 최대 ${Math.round(p.maxPercent * 100)}%`;
    if (p.onMaxVamp) s += `, 최대치 도달 시 모든 피해 흡혈 근접+${Math.round(p.onMaxVamp.meleePercent * 100)}%｜원거리+${Math.round(p.onMaxVamp.rangedPercent * 100)}%`;
    s += ')';
    parts.push(s);
  }
  if (item.dancePassive) { const p = item.dancePassive; parts.push(`마법의 춤(적 챔피언에게 마법·고정 피해 시 ${p.durationSec}초간 이동 속도 +${p.msFlat})`); }
  if (item.apPercentOfBonusHp) parts.push(`공허의 마력(추가 체력의 ${Math.round(item.apPercentOfBonusHp * 100)}%만큼 추가 주문력)`);
  // 전설급 9차분(벤시의장막~해신작쇼) 패시브 설명.
  if (item.nullifyPassive) { const p = item.nullifyPassive; parts.push(`무효화(적의 다음 피해 1회를 완전히 차단하는 방어막, 재사용대기시간 ${p.icdSec}초${p.resetOnChampionDamage ? ' - 챔피언에게 피해를 입히면 재사용대기시간 초기화' : ''})`); }
  if (item.stasisActive) { const p = item.stasisActive; parts.push(`사용 시 "${p.nameKo}": ${p.durationSec}초간 경직(무적+대상 지정 불가, 이동 불가)${p.maxUses ? `, 최대 ${p.maxUses}회만 사용 가능` : `, 재사용 대기시간 ${p.cooldownSec}초`}`); }
  if (item.totalApMultiplierPercent) parts.push(`신비한 작품(총 주문력 +${Math.round(item.totalApMultiplierPercent * 100)}%)`);
  if (item.apSourceWiki) parts.push('(주문력 수치는 원문 누락으로 실제 LoL 수치 사용)');
  if (item.passiveSourceWiki) parts.push('(고유 패시브는 원문 누락으로 실제 LoL 수치 사용)');
  if (item.giantAbsorbPassive) { const p = item.giantAbsorbPassive; parts.push(`거인의 흡수(${p.rangeLol} 사거리 내 챔피언 상대 ${p.chargeSec}초 충전, 충전된 공격 시 ${p.flatDmg}+체력${Math.round(p.bonusHpPercent * 100)}% 추가 물리 피해 + 그 피해의 ${Math.round(p.maxHpGainPercent * 100)}%만큼 영구 최대 체력 획득, 대상별 재사용대기시간 ${p.icdSec}초)`); }
  if (item.titanicPassive) { const p = item.titanicPassive; parts.push(`거인(최대 체력 ${p.hpPerScaleStep}당 크기 +${Math.round(p.scalePercentPerStep * 100)}%, 최대 +${Math.round(p.maxScalePercent * 100)}%)`); }
  if (item.warmogsHeartPassive) { const p = item.warmogsHeartPassive; parts.push(`워모그의 심장(추가 체력 ${p.bonusHpThreshold} 이상일 때, 챔피언에게 ${p.champOutOfCombatSec}초｜그 외 ${p.nonChampOutOfCombatSec}초 동안 피해를 입지 않으면 초당 ${Math.round(p.percentPerSec * 100)}% 체력 회복)`); }
  if (item.agonyPassive) { const p = item.agonyPassive; parts.push(`고뇌(챔피언과 전투 중일 때 ${p.intervalSec}초마다 주변 적 챔피언에게 추가 체력 ${Math.round(p.bonusHpPercent * 100)}% 마법 피해 + 입힌 피해의 ${Math.round(p.healPercentOfDamage * 100)}%만큼 체력 회복)`); }
  if (item.healingReceivedBonusPercent) parts.push(`무한한 활력(자신이 받는 체력 회복·보호막 효과 +${Math.round(item.healingReceivedBonusPercent * 100)}%)`);
  if (item.voidbornResiliencePassive) { const p = item.voidbornResiliencePassive; parts.push(`공허 태생의 저항력(챔피언과 ${p.combatDurationSec}초 이상 전투 시 전투가 끝날 때까지 추가 방어력·마법저항력 +${Math.round(p.bonusPercent * 100)}%)`); }
  // 서포터 아이템(세계지도집 퀘스트 라인) 패시브 설명.
  if (item.questPassive) { const p = item.questPassive; parts.push(`퀘스트: 이 아이템으로 골드 ${p.goldThreshold}를 모으면 ${(ITEM_DATA[p.transformsInto] && ITEM_DATA[p.transformsInto].nameKo) || p.transformsInto}(으)로 변신`); }
  if (item.spoilsOfWarPassive) { const p = item.spoilsOfWarPassive; parts.push(`재물 공유(챔피언·구조물에 피해를 입히면 근접+${p.meleeDamageGold}｜원거리+${p.rangedDamageGold}골드, 체력 ${Math.round(p.minionHpThresholdMelee * 100)}%(근접)｜${Math.round(p.minionHpThresholdRanged * 100)}%(원거리) 이하 미니언 처형 시 +${p.minionGold}골드 - 최대 ${p.maxCharges}회 충전/${p.rechargeSec}초, 게임 시작 ${p.firstChargeDelaySec}초 후 첫 충전)`); }
  if (item.goldPerIntervalPassive) { const p = item.goldPerIntervalPassive; parts.push(`${p.intervalSec}초마다 골드 +${p.gold}`); }
  if (item.voidBurstPassive) { const p = item.voidBurstPassive; parts.push(`공허 폭발(챔피언에게 스킬로 피해를 입히면 주변 적에게 ${p.baseDmg}+주문력${Math.round(p.apPercent * 100)}%+최대체력${Math.round(p.maxHpPercent * 100)}% 마법 피해(비챔피언 최대체력 항 ${p.monsterMaxHpBonusCap} 캡), 재사용대기시간 ${p.icdSec}초)`); }
  if (item.ccTriggerPassive) { const p = item.ccTriggerPassive; parts.push(`썰매 질주(적 챔피언에게 둔화·행동 불가 효과를 걸면 체력 ${p.minHeal}~${p.maxHeal}(레벨비례) 회복 + ${p.msDurationSec}초간 이동속도 +${Math.round(p.msPercent * 100)}%, 재사용대기시간 ${p.icdSec}초)`); }
  if (item.mountainsBlessingPassive) { const p = item.mountainsBlessingPassive; parts.push(`산의 축복(챔피언에게 피해를 받으면 ${p.durationSec}초간 받는 피해 근접${Math.round(p.meleePercent * 100)}%｜원거리${Math.round(p.rangedPercent * 100)}% 감소, 보호막이 만료되면 주변에 ${p.slowDurationSec}초간 ${Math.round(p.slowPercent * 100)}% 둔화 충격파)`); }
  // 전설급 최종분(슈렐리아의군가~제국의명령 - 원문 전체 마지막 배치) 패시브 설명.
  if (item.faminePassive) { const p = item.faminePassive; parts.push(`기아(추가 공격력 비례 스킬 가속 +${p.flatAbilityHaste}+추가공격력 근접${Math.round(p.meleeBonusAdPercent * 100)}%｜원거리${Math.round(p.rangedBonusAdPercent * 100)}%)`); }
  if (item.feastPassive) { const p = item.feastPassive; parts.push(`포식(피해를 입힌 챔피언이 ${p.windowSec}초 안에 죽으면 ${p.durationSec}초간 전능 흡혈 +${Math.round(p.omnivampPercent * 100)}%)`); }
  if (item.teamMoveSpeedActive) { const p = item.teamMoveSpeedActive; parts.push(`사용 시 "${p.nameKo}": ${p.durationSec}초간 이동 속도 +${Math.round(p.msPercent * 100)}%, 재사용 대기시간 ${p.cooldownSec}초`); }
  if (item.healAndShieldPowerPassive) { const p = item.healAndShieldPowerPassive; parts.push(`별빛 은총(자신에게 돌아오는 회복·보호막 효과 회복+${Math.round(p.healPercent * 100)}%｜보호막+${Math.round(p.shieldPercent * 100)}% 증가 - 아군이 없을 때의 자기 대상 적용으로 근사)`); }
  if (item.fanfarePassive) { const p = item.fanfarePassive; parts.push(`팡파르(적 챔피언을 둔화·이동 불가 상태로 만들면 근접${p.meleeDurationSec}초｜원거리${p.rangedDurationSec}초간 이동 속도 +${p.msFlat} + 공격 속도 근접+${Math.round(p.meleeAsPercent * 100)}%｜원거리+${Math.round(p.rangedAsPercent * 100)}%)`); }
  if (item.commandPassive) { const p = item.commandPassive; parts.push(`명령(적 챔피언을 이동 불가 상태로 만들면 ${p.durationSec}초간 취약 표식 - 받는 피해 +${Math.round(p.vulnerablePercent * 100)}%, 중첩 없이 지속시간만 연장)`); }
  // 40차: 가시(덤불 조끼·가시 갑옷), 폭격 개시(악마사냥꾼의 화살).
  if (item.thornsPassive) { const p = item.thornsPassive; parts.push(`가시(기본 공격에 맞으면 공격자에게 ${p.flatDamage}${p.bonusArmorRatio ? `+추가 방어력 ${Math.round(p.bonusArmorRatio * 100)}%` : ''} 마법 피해, 챔피언이면 ${p.grievousSec}초 동안 ${Math.round(p.grievousPercent * 100)}% 고통스러운 상처)`); }
  if (item.openingBarragePassive) { const p = item.openingBarragePassive; parts.push(`폭격 개시(궁극기 사용 후 ${p.durationSec}초 동안 다음 ${p.attacks}회 기본 공격: 공격 속도 +${Math.round(p.attackSpeedPercent * 100)}%, 치명타(일반 치명타 피해의 ${Math.round(p.critDamageFactor * 100)}%) - 원래 치명타였으면 대신 ${Math.round(p.onNaturalCritTruePercent * 100)}% 추가 고정 피해)`); }
  if (item.recipe && item.recipe.length) {
    const counts = {};
    for (const id of item.recipe) counts[id] = (counts[id] || 0) + 1;
    const compNames = Object.entries(counts).map(([id, n]) => `${(ITEM_DATA[id] && ITEM_DATA[id].nameKo) || id}${n > 1 ? ' x' + n : ''}`);
    parts.push(`하위템: ${compNames.join(', ')}`);
  }
  parts.push(...extraDesc);
  return parts.join(' · ');
}

// 33차: 상점 창(목록·상세·구매)은 shop_ui.js로 옮겼다. 여기는 하단 HUD의 보유 아이템 칸만 그린다.
// 사용 가능한 아이템인지 - useItem()이 실제로 분기하는 필드 전부를 확인한다(하나라도 빠지면 클릭 시 사용 대신 판매되는 버그).
function _itemIsUsable(data) {
  const usable = !!(
    data.consumable || data.activeAbility || data.wardPlacement || data.elixirEffect
    || data.empoweredCleaveActive || data.shockwaveActive || data.ghostStepActive
    || data.rocketbeltActive || data.teamMoveSpeedActive || data.noxiousBladeActive || data.stasisActive || data.devotionActive
    || (typeof itemExtraIsUsable === 'function' && itemExtraIsUsable(data))
  );
  return usable;
}
// 93차: 소환사 주문 입력 → 명령. 대상 지정 주문(탈진·점화)이 쓸 "커서 아래 적 챔피언"을 여기서(화면 좌표로) 골라 ID로 담는다.
function submitSummonerFromInput(slot, point, pointerClient) {
  if (!controller || typeof castSummonerSpell !== 'function') return { ok: false };
  let targetId = null;
  if (pointerClient && typeof getEnemyHit === 'function') { const h = getEnemyHit(pointerClient.x, pointerClient.y); if (h && h.isChampion) targetId = entityId(h); }
  return submitPlayerCommand({ type: 'summoner', slot, point: point ? toCommandPoint(point) : null, targetId });
}
// 63차: 숫자키·HUD 클릭·상점 더블클릭 공용 - 언제나 "지금" 조작 중인 챔피언(controller)으로 쓰고, 성공하면 그 칸을 번쩍인다.
// 93차: 게임 규칙 처리는 명령(submitPlayerCommand → LocalSession → useItem)으로. 목표 좌표는 지금 커서 지면 좌표를 명령에 담는다.
function useItemFromInput(slotIndex, opts = {}) {
  if (!controller || typeof useItem !== 'function') return false;
  const cmd = { type: 'useItem', slot: slotIndex };
  if (opts.placeAhead) cmd.placeAhead = true;
  else if (typeof lastGroundPoint !== 'undefined' && lastGroundPoint) cmd.point = toCommandPoint(lastGroundPoint);
  const ok = !!submitPlayerCommand(cmd).outcome;
  if (ok) {
    const el = document.querySelectorAll('#hudItems .hud-item-grid .hud-item')[slotIndex];
    if (el) { el.classList.remove('used'); void el.offsetWidth; el.classList.add('used'); }
  }
  return ok;
}
// 63차: 액티브 아이템 재사용 대기 - HUD 칸 위에 스킬 칸과 같은 회전 그림자 + 남은 초. 매 프레임 불리지만 바뀐 칸만 건드린다.
function _itemCooldownTotalSec(item) {
  for (const k in item) { const v = item[k]; if (v && typeof v === 'object' && typeof v.cooldownSec === 'number') return v.cooldownSec; }
  return null;
}
function tickHudItemCooldowns(ctrl) {
  if (!ctrl || typeof ITEM_DATA === 'undefined') return;
  const cells = document.querySelectorAll('#hudItems .hud-item-grid .hud-item');
  const until = ctrl._itemActiveCooldownUntil || {};
  const now = performance.now();
  cells.forEach((el, i) => {
    const slot = ctrl.items && ctrl.items[i];
    const item = slot && ITEM_DATA[slot.id];
    const readyAt = item ? (until[item.id] || 0) : 0;
    let cd = el.querySelector('.item-cd');
    if (!item || readyAt <= now) { if (cd) cd.remove(); return; }
    const total = (_itemCooldownTotalSec(item) || 1) * 1000;
    const frac = Math.max(0, Math.min(1, (readyAt - now) / total));
    if (!cd) { cd = document.createElement('div'); cd.className = 'item-cd'; el.appendChild(cd); }
    cd.style.background = `conic-gradient(rgba(0,0,0,0.72) ${frac * 360}deg, transparent 0)`;
    const sec = (readyAt - now) / 1000;
    const txt = sec >= 1 ? String(Math.ceil(sec)) : sec.toFixed(1);
    if (cd.textContent !== txt) cd.textContent = txt;
  });
}
// 하단 HUD 아이템 칸 - buyItem/sellItem/useItem이 아이템을 바꿀 때마다 호출하는 이벤트 기반 갱신 함수
// (updateGoldDisplay()와 같은 원칙, 매 프레임 아님). 칸 배치는 원작과 같다: 1·2·3 / 5·6·7 + 장신구(4).
// 사용 아이템은 클릭(또는 숫자키)으로 사용하고, 나머지는 클릭하면 상점이 열리며 그 칸이 선택된다(판매는 상점에서).
function updateItemUI(ctrl) {
  if (ctrl && ctrl.isBot) return; if (typeof isBotActing === 'function' && isBotActing()) return; // 95차: 적 챔피언 봇 차례에는 플레이어 화면을 건드리지 않는다
  if (typeof renderShopPanel === 'function') renderShopPanel(); // 골드/보유 아이템이 바뀌면 상점 창도 함께 갱신
  const box = document.getElementById('hudItems');
  if (!box || typeof ITEM_DATA === 'undefined') return;
  const items = (ctrl && ctrl.items) || [];
  const slotHtml = (key, data, badge, extraCls) => `<div class="hud-item${data ? '' : ' empty'}${extraCls || ''}"><span class="key">${key}</span>${data ? _shopIconHtml(data) : ''}${badge !== '' && badge != null ? `<span class="badge">${badge}</span>` : ''}</div>`;
  let grid = '';
  for (let i = 0; i < 6; i++) {
    const slot = items[i];
    const data = slot ? ITEM_DATA[slot.id] : null;
    const badge = data ? (typeof slot.charges === 'number' ? `${slot.charges}/${data.maxCharges}` : (slot.count > 1 ? slot.count : '')) : '';
    grid += slotHtml(ITEM_SLOT_KEYS[i], data, badge, data && _itemIsUsable(data) ? ' usable' : '');
  }
  const trinket = ctrl && ctrl.trinket;
  const tData = trinket ? ITEM_DATA[trinket.id] : null;
  const bData = ctrl && ctrl.boots ? ITEM_DATA[ctrl.boots.id] : null;
  box.innerHTML = `<div class="hud-item-grid">${grid}</div>`
    + `<div class="hud-item-side">${slotHtml('4', tData, tData ? `${trinket.charges}/${tData.maxCharges}` : '', ' usable trinket')}${slotHtml('신발', bData, '', ' boots')}</div>`;
  const cells = box.querySelectorAll('.hud-item-grid .hud-item');
  cells.forEach((el, i) => {
    const slot = items[i];
    const data = slot ? ITEM_DATA[slot.id] : null;
    if (!data) return;
    const usable = _itemIsUsable(data);
    el.title = usable ? `${data.nameKo} (${ITEM_SLOT_KEYS[i]}키 또는 클릭: 사용)` : `${data.nameKo} (클릭: 상점에서 보기·판매)`;
    el.addEventListener('click', () => {
      if (usable) { useItemFromInput(i, { placeAhead: true }); return; }
      if (typeof setShopOpen === 'function') { setShopOpen(true); _shopSelectedSlot = i; _shopSelectedItemId = slot.id; renderShopPanel(true); }
    });
  });
  // 장신구(투명 와드): 클릭으로도 설치 - 조준 중인 지면 좌표가 없으므로 플레이어 바로 앞에 놓는다(기본 조작은 4키 = 마우스 위치).
  const tEl = box.querySelector('.hud-item.trinket');
  if (tEl && tData) {
    tEl.title = `${tData.nameKo} (4키: 마우스 위치에 설치 · 클릭: 앞에 설치)`;
    tEl.addEventListener('click', () => {
      if (typeof placeWard !== 'function' || !ctrl) return;
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ctrl.root.quaternion);
      submitPlayerCommand({ type: 'placeWard', point: toCommandPoint(ctrl.root.position.clone().add(forward.multiplyScalar(lolRangeToWorld(300)))) });
    });
  }
  const bEl = box.querySelector('.hud-item.boots');
  if (bEl) {
    bEl.title = bData ? `${bData.nameKo} (클릭: 상점에서 보기·판매)` : '신발 칸 (상점 신발 분류에서 구매)';
    bEl.addEventListener('click', () => {
      if (typeof setShopOpen !== 'function') return;
      setShopOpen(true);
      if (bData) { _shopSelectedSlot = 'boots'; _shopSelectedItemId = ctrl.boots.id; renderShopPanel(true); }
    });
  }
}
var controller = null;
let championRoot = null;
let currentChampion = null; // { fileName, resolver, actionData, boundsRadius }
let modelScaleMultiplier = 1.0; // scaleButtons(0.8/1.0/1.2) 수동 미리보기 배율 - 챔피언 고정 Multiplier 위에 곱해지는 별도의 사용자 조작 값
let championBaseScaleMultiplier = 1.0; // 현재 로드된 챔피언의 고정 크기 배율(resolveModelScaleMultiplier - 원작 스킨 배율 기준, 25차)

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
function getEnemyHit(clientX, clientY, { includeWards = false } = {}) {
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
  // 32차: 평타 대상 고르기(좌클릭·커서)에서만 보이는 적 와드도 후보로 넣는다 - 스킬 조준은 와드를 고르지 않는다.
  if (includeWards && typeof wardSystem !== 'undefined' && wardSystem) candidates.push(...wardSystem.targetableFor((controller && controller.team) || PLAYER_TEAM));
  if (!candidates.length) return null;
  // 64차: 원작식 선택 판정 - 유닛마다 발밑~머리 높이의 "선택 원기둥"(반경 selectionRadius)을 화면에 투영하고, 커서가 그
  // 안에 들어온 유닛 중 가장 가운데에 가까운 것을 고른다. 예전엔 ① 정밀 판정(레이캐스트)이 u.body만 비재귀로 봐서, 61차부터
  // 모델을 담는 그룹이 된 미니언 body에는 한 번도 맞지 않았고 ② 대신 쓰던 예비 판정은 "발밑 한 점에서 38픽셀"이라 미니언 몸통을
  // 누르면 빗나가 공격 대신 이동이 됐다(미니언 때리기가 어려웠던 원인).
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  let best = null, bestScore = Infinity;
  for (const u of candidates) {
    const feet = getWorldPosition(u);
    if (!feet || isBehindCamera(feet)) continue;
    const h = getUnitSelectionHeight(u);
    const r = Math.max(u.selectionRadius || 0, getCollisionRadius(u) || 0, 0.15);
    // 카메라 앞뒤 범위(NDC z -1~1) 밖이면 투영 좌표가 뒤집혀 화면을 가로지르는 엉뚱한 선분이 된다 - 그런 대상은 뺀다
    // (카메라 뒤 멀리 있는 넥서스 포탑이 화면 가운데 클릭에 잡히던 문제).
    const na = feet.clone().project(camera), nb = feet.clone().add(new THREE.Vector3(0, h, 0)).project(camera);
    if (Math.abs(na.z) > 1 || Math.abs(nb.z) > 1) continue;
    if ((Math.abs(na.x) > 1.3 || Math.abs(na.y) > 1.3) && (Math.abs(nb.x) > 1.3 || Math.abs(nb.y) > 1.3)) continue;
    const a = { x: (na.x * 0.5 + 0.5) * window.innerWidth, y: (-na.y * 0.5 + 0.5) * window.innerHeight };
    const b = { x: (nb.x * 0.5 + 0.5) * window.innerWidth, y: (-nb.y * 0.5 + 0.5) * window.innerHeight };
    const edge = worldToScreenPx(feet.clone().addScaledVector(right, r));
    const radiusPx = Math.max(u.isWard ? 16 : 12, Math.hypot(edge.x - a.x, edge.y - a.y));
    // 커서와 선분(발밑~머리) 사이 거리
    const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
    const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((clientX - a.x) * vx + (clientY - a.y) * vy) / len2)) : 0;
    const d = Math.hypot(clientX - (a.x + vx * t), clientY - (a.y + vy * t));
    if (d > radiusPx) continue;
    // 겹치면 미니언·챔피언·와드를 구조물보다 먼저(원작도 포탑 앞 미니언을 누르면 미니언이 잡힌다).
    const score = d / radiusPx + (u.isStructure ? 1 : 0);
    if (score < bestScore) { bestScore = score; best = u; }
  }
  return best;
}
// 선택 원기둥 높이(월드) - 미니언은 실제 모델 키, 포탑·억제기·넥서스는 이름표 높이, 챔피언·허수아비는 몸 높이.
function getUnitSelectionHeight(u) {
  if (u.modelHeight) return u.modelHeight;
  if (u.isStructure && u.labelHeight) return Math.max(1, u.labelHeight - 0.4);
  if (u.collisionHeight) return u.collisionHeight;
  if (u.isWard) return 0.5;
  return 1.6;
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
    d.destroyed = true; // 치운 허수아비는 "부활하지 않는다" - 모데카이저 R이 훔친 능력치를 부활까지 들고 있지 않게 한다
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

// 아군 더미 설치(아군이 필요한 아이템/스킬 효과 테스트용 - ally_system.js 참고).
// 적 더미 설치 모드와 동시에 켜지지 않는다.
let allyPlaceMode = false;
const allyPlaceCheckboxEl = document.getElementById('allyPlaceCheckbox');
function setAllyPlaceMode(v) {
  allyPlaceMode = v;
  if (v && dummyPlaceMode) { setDummyPlaceMode(false); if (dummyPlaceCheckboxEl) dummyPlaceCheckboxEl.checked = false; }
  if (allyPlaceCheckboxEl) allyPlaceCheckboxEl.checked = v;
  renderer.domElement.style.cursor = v ? 'crosshair' : '';
}
if (allyPlaceCheckboxEl) allyPlaceCheckboxEl.addEventListener('change', () => setAllyPlaceMode(allyPlaceCheckboxEl.checked));
const clearAlliesBtnEl = document.getElementById('clearAlliesBtn');
if (clearAlliesBtnEl) clearAlliesBtnEl.addEventListener('click', clearPlacedAllies);
const damageAlliesBtnEl = document.getElementById('damageAlliesBtn');
if (damageAlliesBtnEl) damageAlliesBtnEl.addEventListener('click', () => {
  const raw = Number(document.getElementById('dummyDamageInput')?.value);
  if (!Number.isFinite(raw) || raw <= 0) { console.log('[아군 더미 피해 테스트] 올바른 양수를 입력하세요'); return; }
  const type = document.getElementById('dummyDamageType')?.value || DAMAGE_TYPE.PHYSICAL;
  for (const a of placedAllies) if (a.hp > 0) applyDamage(a, { rawDamage: raw, damageType: type, isCritical: false, critMultiplier: 1 });
  console.log(`[아군 더미 피해 테스트] 아군 더미 ${placedAllies.length}개에 ${raw}(${type})`);
});

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
      if (typeof updateChampBar === 'function' && target.labelDiv.classList.contains('champBar')) updateChampBar(target.labelDiv, { hp: target.hp, maxHp: target.maxHp, shield: target.shield || 0, level: target.champLevel || 1 });
      target.labelDiv.style.opacity = '1';
    }
    console.log(`[더미 회복] ${unitLabel(target)} 체력을 ${target.maxHp}으로 전부 회복`);
  });
}

// 64차 공격 이동(A키): 누르면 다음 좌클릭이 공격 이동 명령이 된다(커서가 조준 십자로 바뀐다). 우클릭·Esc로 취소.
let attackMoveArmed = false;
const ATTACK_MOVE_PICK_RADIUS_LOL = 400;
function findAttackMoveTarget(point) {
  let best = null, bestD = Infinity;
  for (const u of getTargetableEnemyUnits()) {
    if (!u || u.hp <= 0 || u.isWard || u.isUntargetable) continue;
    if (u.isStructure && typeof isStructureProtected === 'function' && isStructureProtected(u)) continue;
    const d = getHorizontalDistance(point, getWorldPosition(u)) - getCollisionRadius(u);
    if (d <= lolRangeToWorld(ATTACK_MOVE_PICK_RADIUS_LOL) && d < bestD) { bestD = d; best = u; }
  }
  return best;
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (paused || !controller) return;
  // 조준 중(일반 시전): 좌클릭 = 그 자리로 시전, 우클릭 = 조준 취소(아래 이동 명령은 그대로 처리).
  if (skillAim.aiming) {
    if (e.button === 0) {
      const p = getGroundPoint(e.clientX, e.clientY) || lastGroundPoint;
      const slot = skillAim.slot; skillAim.cancel();
      skillAim.cast(controller, slot, p, { x: e.clientX, y: e.clientY }); // (skill_aim_system.js가 cast 명령을 만든다)
      return;
    }
    if (e.button === 2) skillAim.cancel();
  }
  if (e.button === 2) {
    const groundPoint = getGroundPoint(e.clientX, e.clientY);
    if (!groundPoint) return;
    // Alpha Strike 진행 중 우클릭(요청 문서 1 섹션 25): 재등장 방향만
    // 갱신하고, 일반 이동 명령(controller.moveTo)은 실행하지 않는다 -
    // "Q 상태 + 우클릭 -> 재등장 위치 변경, 이동 명령은 실행 안 함".
    // 93차: 이 규칙은 move 명령 처리(LocalSession)로 옮겼다 - 여기서는 이동 표시만 건너뛴다.
    if (controller._masteryi && controller._masteryi.alpha) {
      submitPlayerCommand({ type: 'move', point: toCommandPoint(groundPoint) });
      return;
    }
    // 64차: 원작처럼 우클릭한 자리에 적(미니언·챔피언·구조물·와드)이 있으면 이동이 아니라 공격 명령이다. 예전엔 우클릭이 항상
    // 그 땅으로 걷기만 해서, 미니언을 우클릭하면 때리지 않고 미니언 쪽으로 걸어가기만 했다.
    attackMoveArmed = false;
    const enemyUnderCursor = getEnemyHit(e.clientX, e.clientY, { includeWards: true });
    // 83차: "챔피언만 공격"(` 누르고 있기) 중에는 챔피언이 아닌 대상을 우클릭해도 그 자리로 이동만 한다.
    if (enemyUnderCursor && (!window.__championsOnlyHeld || enemyUnderCursor.isChampion)) { submitPlayerCommand({ type: 'attack', targetId: entityId(enemyUnderCursor) }); return; }
    spawnMoveMarker(groundPoint); submitPlayerCommand({ type: 'move', point: toCommandPoint(groundPoint) });
  } else if (e.button === 0) {
    // 64차 공격 이동(원작 A + 좌클릭): 커서 아래 적, 없으면 클릭 지점에서 가장 가까운 적(400 안)을 공격하고, 없으면 그 자리로 이동.
    if (attackMoveArmed) {
      attackMoveArmed = false;
      const p = getGroundPoint(e.clientX, e.clientY) || lastGroundPoint;
      // 83차(원작): 커서 바로 아래 적을 찍으면 그 적, 아니면 사거리 안에서 내 챔피언(옵션: 커서)에 가장 가까운 적. 없으면 그 자리로
      // 걸어가며 계속 살핀다(공격 이동 유지). ` 키를 누르고 있으면 챔피언만.
      const champsOnly = !!window.__championsOnlyHeld;
      const under = getEnemyHit(e.clientX, e.clientY, { includeWards: true });
      if (under && (!champsOnly || under.isChampion)) { submitPlayerCommand({ type: 'attack', targetId: entityId(under), fromAttackMove: true }); return; }
      if (p) { spawnMoveMarker(p); submitPlayerCommand({ type: 'attackMove', point: toCommandPoint(p), championsOnly: champsOnly, cursorPoint: (typeof optionsState !== 'undefined' && optionsState.attackMoveOnCursor) ? toCommandPoint(p) : null }); }
      return;
    }
    if (dummyPlaceMode) {
      const groundPoint = getGroundPoint(e.clientX, e.clientY);
      if (groundPoint) placeDummyAt(groundPoint);
      return;
    }
    if (allyPlaceMode) {
      const groundPoint = getGroundPoint(e.clientX, e.clientY);
      if (groundPoint) placeAllyAt(groundPoint);
      return;
    }
    if (brushPlaceMode) {
      const groundPoint = getGroundPoint(e.clientX, e.clientY);
      if (groundPoint) brushSystem.addBrush({ x: groundPoint.x, z: groundPoint.z });
      return;
    }
    if (enemyWardPlaceMode) {
      const groundPoint = getGroundPoint(e.clientX, e.clientY);
      if (groundPoint) placeEnemyWardAt(groundPoint);
      return;
    }
    const enemyHit = getEnemyHit(e.clientX, e.clientY, { includeWards: true });
    if (enemyHit) submitPlayerCommand({ type: 'attack', targetId: entityId(enemyHit) });
    else { submitPlayerCommand({ type: 'clearTarget' }); targetRing.clear(); }
  }
});

// 요청("지정 쉽게 해줘") - 클릭하기 전에 커서를 바꿔서 지금 무엇을
// 지정하게 될지 미리 보여준다(관대한 클릭 판정과 동일한 getEnemyHit을
// 그대로 재사용 - 새 판정 시스템을 따로 만들지 않음). 마우스가 멈춰
// 있을 때는 값이 안 바뀌므로 매 프레임이 아니라 실제 mousemove 이벤트가
// 있을 때만 계산되고, 후보 수도 최대 수십 개 수준이라 비용이 거의 없다.
renderer.domElement.addEventListener('pointermove', (e) => {
  if (paused || !controller || dummyPlaceMode || allyPlaceMode || brushPlaceMode || enemyWardPlaceMode || skillAim.aiming || attackMoveArmed) { renderer.domElement.style.cursor = (brushPlaceMode || enemyWardPlaceMode || skillAim.aiming || attackMoveArmed) ? 'crosshair' : ''; return; }
  const enemyHit = getEnemyHit(e.clientX, e.clientY, { includeWards: true });
  renderer.domElement.style.cursor = enemyHit ? 'pointer' : '';
});

window.addEventListener('keydown', (e) => {
  // 33차: 상점 검색칸 등 입력칸에 타이핑하는 중에는 게임 단축키를 쓰지 않는다(Esc만 상점을 닫는다).
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
  if (typing) { if (e.code === 'Escape' && typeof isShopOpen === 'function' && isShopOpen()) setShopOpen(false); else if (e.code === 'Escape' && typeof isOptionsOpen === 'function' && isOptionsOpen()) setOptionsOpen(false); return; }
  // 상점(P - 원작 기본 키)은 챔피언을 불러오기 전에도 열어 볼 수 있다.
  if (e.code === 'KeyP' && !e.repeat) { if (typeof toggleShop === 'function') toggleShop(); return; }
  // 34차 스코어보드: Tab 누르고 있기 / O 켜고 끄기(원작 기본 키). Tab의 브라우저 포커스 이동은 막는다.
  if (e.code === 'Tab') { e.preventDefault(); if (typeof setScoreboardHeld === 'function') setScoreboardHeld(true); return; }
  if (e.code === 'KeyO' && !e.repeat && !e.ctrlKey) { if (typeof toggleScoreboard === 'function') toggleScoreboard(); return; }
  if (e.code === 'Escape' && typeof isShopOpen === 'function' && isShopOpen()) { setShopOpen(false); return; }
  // 72차: Esc = 원작식 설정 창(열려 있으면 닫기). 일시정지는 Pause 키나 설정 창 버튼.
  if (e.code === 'Escape' && typeof isOptionsOpen === 'function' && isOptionsOpen()) { setOptionsOpen(false); return; }
  if (e.code === 'Pause') { togglePause(); if (typeof setOptionsOpen === 'function' && isOptionsOpen()) setOptionsOpen(true); return; }
  if (!controller) { if (e.code === 'Escape' && typeof setOptionsOpen === 'function') setOptionsOpen(true); return; }
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
  if (e.code === 'Escape') { if (attackMoveArmed) { attackMoveArmed = false; renderer.domElement.style.cursor = ''; return; } if (skillAim.aiming) { skillAim.cancel(); return; } if (typeof setOptionsOpen === 'function') setOptionsOpen(true); else togglePause(); return; }
  // 34차: 원작 카메라 키 - Y 고정 켜기/끄기, Space(누르고 있기)·F1 내 챔피언으로.
  if (e.code === 'KeyY' && !e.repeat) { if (typeof toggleCameraLock === 'function') toggleCameraLock(); return; }
  if (e.code === 'Space' || e.code === 'F1') { e.preventDefault(); cameraRig.centerHeld = true; return; }
  // 연습장 전용(원작에 없는 기능) 키는 원작 키와 겹치지 않게 F6~F9로 모았다.
  if (e.code === 'F9') { e.preventDefault(); debugPanelVisible = !debugPanelVisible; return; }
  if ((e.code === 'F6' || e.code === 'F7' || e.code === 'F8') && typeof netMatchActive === 'function' && netMatchActive()) { e.preventDefault(); return; } // 98차: 대전 중 연습 설치 모드 잠금
  if (e.code === 'KeyV') { rangeIndicators.toggle(); const cb = document.getElementById('rangeIndicatorCheckbox'); if (cb) cb.checked = rangeIndicators.visible; return; }
  if (e.code === 'F6') { e.preventDefault(); if (allyPlaceMode) setAllyPlaceMode(false); setDummyPlaceMode(!dummyPlaceMode); if (dummyPlaceCheckboxEl) dummyPlaceCheckboxEl.checked = dummyPlaceMode; return; }
  if (e.code === 'F7') { e.preventDefault(); setAllyPlaceMode(!allyPlaceMode); return; }
  if (e.code === 'F8') { e.preventDefault(); setBrushPlaceMode(!brushPlaceMode); return; }
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
  // 34차: Ctrl+Q/W/E/R = 스킬 레벨 업(원작 기본 키). 스킬을 쓰지 않는다.
  // (Ctrl+W는 브라우저가 탭 닫기로 먼저 가져갈 수 있다 - 그때는 스킬 칸 위 레벨 업 버튼을 누르면 된다.)
  if (e.ctrlKey && ['KeyQ', 'KeyW', 'KeyE', 'KeyR'].includes(e.code)) {
    e.preventDefault();
    if (submitPlayerCommand({ type: 'levelUpSkill', slot: e.code.slice(3) }).outcome && typeof renderLevelPanel === 'function') renderLevelPanel();
    return;
  }
  switch (e.code) {
    case 'KeyQ': onSkillKeyDown('Q', e.code, mousePoint); break;
    case 'KeyW': onSkillKeyDown('W', e.code, mousePoint); break;
    case 'KeyE': onSkillKeyDown('E', e.code, mousePoint); break;
    // 버그 수정("이즈리얼 궁이 마우스 커서 쪽으로 안 나간다"): 이 R
    // 키 핸들러가 다른 스킬(Q/W/E)과 달리 mousePoint를 아예 넘기지 않고
    // controller.castAbility('R')만 호출했다 - 가렌/다리우스/세트/모데카이저/
    // 닐라처럼 방향이 필요 없는 R에는 원래 문제가 없었지만, 요네·이즈리얼처럼
    // 마우스 방향이 그대로 필요한 직선 R(_yoneCastR/_ezrealCastR)에는
    // mouseWorldPoint 자체가 undefined로 들어가 항상 기본 방향(정면)으로만
    // 나갔다. Q/W/E와 동일하게 mousePoint를 넘기도록 통일한다 - 방향이
    // 필요 없는 챔피언들의 _castR(free)/_nilahCastR 등은 애초에 두 번째
    // 인자를 받지 않으므로 영향이 없다.
    // (R도 Q/W/E와 같은 조준 경로 - onSkillKeyDown)
    case 'KeyR': onSkillKeyDown('R', e.code, mousePoint); break;
    case 'KeyB': submitPlayerCommand({ type: 'recall' }); break;
    case 'KeyA': attackMoveArmed = true; renderer.domElement.style.cursor = 'crosshair'; requestAnimationFrame(() => { if (attackMoveArmed) renderer.domElement.style.cursor = 'crosshair'; }); break; // 64차 공격 이동 (90차: 위 커서 숨김 복원이 크로스헤어를 덮어써 안 보이던 것 수정)
    // 36차: 소환사 주문(원작 기본 키 D/F).
    case 'KeyD': submitSummonerFromInput('D', mousePoint, lastPointerClient); break;
    case 'KeyF': submitSummonerFromInput('F', mousePoint, lastPointerClient); break;
    // 정지(원작 기본 키 S) - 이동·공격 명령을 멈추고 그 자리에 선다(제자리로 이동 = 정지, _commitMove 참고).
    case 'KeyS': submitPlayerCommand({ type: 'stop' }); break;
    // 아이템 사용 - 원작 키 배치(1·2·3·5·6·7 = 인벤토리 6칸, 4 = 장신구). 사용 불가 아이템(스탯
    // 아이템)이면 useItem() 내부에서 콘솔 경고만 내고 조용히 무시된다.
    // 63차: 숫자패드(Numpad1~7)도 같은 칸 - 예전엔 위쪽 숫자 줄(Digit)만 받아서 숫자패드로는 아이템이 쓰이지 않았다.
    case 'Digit1': case 'Numpad1': useItemFromInput(0); break;
    case 'Digit2': case 'Numpad2': useItemFromInput(1); break;
    case 'Digit3': case 'Numpad3': useItemFromInput(2); break;
    case 'Digit5': case 'Numpad5': useItemFromInput(3); break;
    case 'Digit6': case 'Numpad6': useItemFromInput(4); break;
    case 'Digit7': case 'Numpad7': useItemFromInput(5); break;
    case 'Numpad4':
    // 장신구(투명 와드) - 원작 기본 키 4. 현재 마우스 위치에 놓는다(설치 사거리 밖이면 사거리까지 걸어가서 놓는다 - 원작).
    case 'Digit4': submitPlayerCommand({ type: 'placeWard', point: toCommandPoint(mousePoint) }); break;
  }
});

let lastGroundPoint = null;
let lastPointerClient = null; // 조준 중 커서 아래 대상(getEnemyHit)을 고르는 데 쓴다
window.addEventListener('pointermove', (e) => { lastPointerClient = { x: e.clientX, y: e.clientY }; const p = getGroundPoint(e.clientX, e.clientY); if (p) lastGroundPoint = p; });

// 스킬 키 입력(skill_aim_system.js 머리말의 세 가지 시전 방식).
// - 조준이 필요 없는 스킬(자기 강화 등)과 빠른 시전은 키를 누르는 즉시 시전한다.
// - 바루스 Q(충전)는 방식과 무관하게 누르면 충전 시작, 떼면 발사(원작 "누르고 있다가 놓으면 발사").
// - 표시기 사용 빠른 시전: 누르는 동안 조준, 떼면 시전(onSkillKeyUp).
// - 일반 시전: 논타겟 스킬은 누르는 즉시 커서 방향으로(75차). 대상 지정 스킬은 커서 아래 대상이 있으면 바로, 없으면 조준 →
//   좌클릭으로 시전(pointerdown), 우클릭·Esc 취소. 다른 스킬 키를 누르면 그 스킬로 조준을 바꾼다.
function onSkillKeyDown(slot, code, mousePoint) {
  const spec = skillAimSpec(controller.championId, slot);
  if (spec && spec.type === 'charge' && !skillAimIsInstant(controller, slot)) {
    const charging = controller._varus && controller._varus.qCharge;
    submitPlayerCommand({ type: 'cast', slot, point: toCommandPoint(mousePoint) });
    if (!charging && controller._varus && controller._varus.qCharge) skillAim.begin(slot, code, controller); else skillAim.cancel();
    return;
  }
  // 75차: 일반 시전에서도 논타겟 스킬(직선·지점·범위·돌진 등 - 대상 지정이 아닌 모든 스킬)은 클릭 없이 키를 누르는 즉시 커서 방향으로
  // 나간다(사용자 요청). 대상 지정 스킬은 커서 아래에 대상이 있으면 바로, 없으면 지금처럼 조준 표시 → 대상 클릭.
  const targeted = spec && (spec.type === 'unit' || spec.type === 'ally');
  const targetUnderCursor = targeted && skillAim.pickUnit(controller, slot, mousePoint, lastPointerClient);
  if (skillAim.mode === 'quick' || skillAimIsInstant(controller, slot) || (skillAim.mode === 'normal' && (!targeted || targetUnderCursor))) {
    if (skillAim.aiming && skillAim.mode === 'normal') skillAim.cancel();
    skillAim.cast(controller, slot, mousePoint, lastPointerClient);
    return;
  }
  // 쿨다운·마나 부족이면 조준하지 않고 원래 시전 경로로 넘겨 그쪽의 안내(토스트 등)를 그대로 쓴다.
  if (typeof controller._canAffordAbility === 'function' && !controller._canAffordAbility(slot)) { skillAim.cancel(); submitPlayerCommand({ type: 'cast', slot, point: toCommandPoint(mousePoint) }); return; }
  skillAim.begin(slot, code, controller);
}
function onSkillKeyUp(code) {
  if (!controller || !skillAim.aiming || skillAim.heldKey !== code) return;
  const slot = skillAim.slot;
  const spec = skillAimSpec(controller.championId, slot);
  const p = lastGroundPoint || controller.root.position.clone();
  if (spec && spec.type === 'charge') {
    skillAim.cancel();
    // 100차: 온라인 참가자 - 충전 상태는 방장 쪽에 있어 늦게 온다. 이번 키 누름으로 충전을 시작했으면(_netChargeSlot) 바로 발사 명령을 보낸다.
    const guestCharging = typeof netGuestMode !== 'undefined' && netGuestMode && controller._netChargeSlot === slot;
    if ((controller._varus && controller._varus.qCharge) || guestCharging) submitPlayerCommand({ type: 'cast', slot, point: toCommandPoint(p) });
    controller._netChargeSlot = null;
    return;
  }
  if (skillAim.mode !== 'indicator') return; // 일반 시전은 클릭으로 시전
  skillAim.cancel();
  skillAim.cast(controller, slot, p, lastPointerClient);
}
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab' && typeof setScoreboardHeld === 'function') setScoreboardHeld(false);
  if (e.code === 'Space' || e.code === 'F1') cameraRig.centerHeld = false;
  if (!paused) onSkillKeyUp(e.code);
});
// 90차(QA): 창 포커스를 잃으면 눌린 키를 모두 뗀 것으로 본다(포커스 밖에서 뗀 키의 keyup은 오지 않는다).
// 예전엔 표시기 모드 조준만 풀어서 일반 모드 조준·공격 이동 대기·바루스 Q 충전이 남았다(돌아와 첫 클릭이 공격 이동, Q 충전이 몇 초 뒤 저절로 발사).
window.addEventListener('blur', () => {
  if (skillAim.aiming && skillAim.heldKey) onSkillKeyUp(skillAim.heldKey); // 충전형(바루스 Q)은 키를 뗀 것처럼 발사
  if (skillAim.aiming) skillAim.cancel();
  if (controller && controller._varus && controller._varus.qCharge && !paused) submitPlayerCommand({ type: 'cast', slot: 'Q', point: toCommandPoint(lastGroundPoint || controller.root.position) }); // 표시기 모드 충전
  if (attackMoveArmed) { attackMoveArmed = false; renderer.domElement.style.cursor = ''; }
  cameraRig.centerHeld = false;
});

function togglePause(force) {
  // 98차: 온라인 대전 중에는 일시정지할 수 없다(대전 코드가 카운트다운에만 force로 쓴다).
  if (!force && typeof netMatchActive === 'function' && netMatchActive()) { if (typeof showSkillToast === 'function') showSkillToast('온라인 대전 중에는 일시정지할 수 없습니다'); return; }
  paused = !paused;
  if (typeof gameClockSetPaused === 'function') gameClockSetPaused(paused); // 95차: 상태 효과·재사용 대기·스킬 타이머도 멈춘다
  document.getElementById('pauseOverlay').classList.toggle('show', paused);
  clock.getDelta();
}


// 83차: "챔피언만 공격" - 원작 기본 키 `(누르고 있는 동안). 우클릭·공격 이동이 챔피언만 노린다.
window.__championsOnlyHeld = false;
window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') window.__championsOnlyHeld = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Backquote') window.__championsOnlyHeld = false; });
window.addEventListener('blur', () => { window.__championsOnlyHeld = false; });
