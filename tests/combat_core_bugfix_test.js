// 전투 로직 핵심 버그 3건의 회귀 테스트(QA 지시서 1-1/1-2/1-3) - 지금까지
// 커밋된 자동화 테스트가 아이템 시스템에 치우쳐 있어(item_*_test.js 다수),
// 챔피언 전투 로직(세트 W/그리버스/가렌 Q)은 전혀 커버되지 않고 있었다.
// 이 파일은 character_controller.js + 챔피언 prototype 확장 파일들을 실제
// 그대로 로드하되, 무거운 생성자(GLB/AnimationMixer/VFX)는 호출하지 않고
// `Object.create(CharacterController.prototype)`로 뼈대만 만든 뒤 테스트에
// 필요한 필드만 채운다 - 이렇게 하면 실제 prototype 메서드(순수 게임
// 로직)를 그대로 검증하면서, 렌더링/애니메이션 의존성은 피할 수 있다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

let now = 1000000;
const stubs = {
  performance: { now: () => now },
  console,
  controller: null,
  PLAYER_TEAM: 'BLUE',
  ENEMY_TEAM: 'RED',
  DAMAGE_TYPE: { PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', TRUE: 'TRUE' },
  getArmorShredPercent: () => 0,
  getMagicDamageReductionPercent: () => 0,
  getMrShredFlat: () => 0,
  itemSystemTick: () => {},
  updateBars: () => {},
  updateSkillUI: () => {},
  refreshUnitCcTags: () => {},
  damageEnemy: (enemy, dmg) => { if (enemy) enemy.hp = Math.max(0, (enemy.hp || 0) - dmg); },
  // getAllEnemyUnits()(01_hit_detection.js)는 실제 게임에서 월드에 배치된
  // 적 목록을 이 전역 배열들에서 읽는다 - 세트 W처럼 "주변 적 전체"를
  // 스캔하는 로직을 테스트하려면 실제로 여기 채워 넣어야 한다.
  placedDummies: [],
  THREE: {
    Vector3: class Vector3 {
      constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
      clone(){return new Vector3(this.x,this.y,this.z);}
      set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
      copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
      add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
      sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
      subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
      multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
      setY(y){this.y=y;return this;}
      length(){return Math.hypot(this.x,this.y,this.z);}
      lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
      normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
      dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
      applyQuaternion(){return this;}
    },
  },
};
const context = vm.createContext(stubs);

const constSrc = fs.readFileSync(path.join(ROOT, 'src/core/00_global_constants.js'), 'utf8');
const statusSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_status_effect_system.js'), 'utf8');
const hitSrc = fs.readFileSync(path.join(ROOT, 'src/core/01_hit_detection.js'), 'utf8');
const champDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/champion_data.js'), 'utf8');
const ccSrc = fs.readFileSync(path.join(ROOT, 'src/core/character_controller.js'), 'utf8');
const settSrc = fs.readFileSync(path.join(ROOT, 'src/champions/sett.js'), 'utf8');
const garenSrc = fs.readFileSync(path.join(ROOT, 'src/champions/garen.js'), 'utf8');
const dariusSrc = fs.readFileSync(path.join(ROOT, 'src/champions/darius.js'), 'utf8');

vm.runInContext(constSrc + '\n' + statusSrc + '\n' + hitSrc + '\n' + champDataSrc + '\n' + ccSrc + '\n' + settSrc + '\n' + garenSrc + '\n' + dariusSrc + `
this.CharacterController = CharacterController;
this.CHAMPION_DATA = CHAMPION_DATA;
this.applyStatus = applyStatus;
this.getGrievousPercent = getGrievousPercent;
this.getAllEnemyUnits = getAllEnemyUnits;
this.isPointInsideSettWTrapezoid = isPointInsideSettWTrapezoid;
this.skillVal = skillVal;
this.lolRangeToWorld = lolRangeToWorld;
`, context);
const { CharacterController, CHAMPION_DATA, applyStatus, getGrievousPercent, lolRangeToWorld } = context;

// 실제 생성자(GLB/AnimationMixer 등)를 부르지 않고 prototype만 빌려 쓰는
// 최소 챔피언 인스턴스. 각 테스트가 필요한 필드만 덮어써서 쓴다.
function makeMinimalChamp(championId, overrides = {}) {
  const ctrl = Object.create(CharacterController.prototype);
  return Object.assign(ctrl, {
    championId,
    root: { position: new stubs.THREE.Vector3(0, 0, 0), quaternion: {} },
    hp: 2000, maxHp: 2000, mp: 1000, maxMp: 1000,
    shield: 0, statusEffects: [],
    champLevel: 9, skillLevels: { Q: 3, W: 3, E: 3, R: 1 },
    stats: { attackDamage: 100, abilityPower: 0, armor: 30, magicResist: 30, attackRange: 175, moveSpeed: 340, critChance: 0, critMultiplier: 2.0 },
    itemBonusAD: 0, bonusAD: 0,
    itemHealingReceivedBonusPercent: 0, itemShieldReceivedBonusPercent: 0,
    itemBonusHpRegenPercent: 0, itemBonusMpRegenPercent: 0,
    hpRegen: 10, mpRegen: 10,
    attackOverrides: [],
    subStates: {},
    passiveState: { lastDamageTakenAt: 0, lastEnemySkillHitAt: 0, lastPassiveHealAt: 0 },
    _sett: { punchSide: 'left', lastPunchAt: 0, qUsesRemaining: 0, grit: 0, gritEntries: [], rSeq: null, wShieldDecayPerSec: 0, wPendingSpent: 0 },
    state: 'IDLE',
    _getBonusAD() { return (this.itemBonusAD || 0) + (this.bonusAD || 0); },
  }, overrides);
}

function makeTarget(overrides = {}) {
  // 세트 W 사다리꼴 중앙(센터) 판정 안에 확실히 들어오도록, 원문 사거리
  // (790 LoL 유닛)의 절반 지점에 "전방 정면"으로 배치한다(lolRangeToWorld로
  // 실제 게임과 동일한 월드 좌표 스케일을 그대로 쓴다 - 임의 좌표 아님).
  const z = lolRangeToWorld(400);
  return Object.assign({
    isChampion: true, team: 'RED', hp: 1000, maxHp: 1000, armor: 0, magicResist: 0,
    statusEffects: [], root: { position: new stubs.THREE.Vector3(0, 0, z) },
    mesh: { position: new stubs.THREE.Vector3(0, 0, z) },
  }, overrides);
}

// ========================================================================
// 1-1. 세트 W 보호막 적용 타이밍
// ========================================================================
{
  const ctrl = makeMinimalChamp('sett');
  ctrl._sett.gritEntries = [{ amount: 300, gainedAt: now - 100 }];
  ctrl._sett.grit = 300;
  assert(ctrl.shield === 0, '세트 W: 시전 전에는 보호막이 0이다(사전 조건)');

  // 보호막 적용(시전 즉시 호출되는 부분)만 먼저 실행 - 피해 판정 함수
  // (_settWOnCast)는 아직 호출하지 않는다(실제 게임에서도 0.75초 뒤에야
  // 불린다).
  ctrl._settWApplyShield();
  assert(ctrl.shield === 300, `세트 W: 시전 "즉시" 소모한 투지(300) 전액이 보호막으로 적용된다(got ${ctrl.shield})`);
  assert(ctrl._settGritSum() === 0, '세트 W: 투지를 소모한 뒤 기록이 실제로 비워진다(gritEntries 배열 자체가 빔)');
  assert(ctrl._sett.wPendingSpent === 300, '세트 W: 소모한 투지 값이 0.75초 뒤 피해 판정을 위해 보존된다');

  // 보호막을 건 "이후"(실제 게임이라면 0.75초가 지나기 전) 투지가 다시
  // 쌓이거나 전투로 보호막이 깎여도, 저장해 둔 피해 계산용 수치(wPendingSpent)는
  // 바뀌지 않아야 한다(검증 조건: "투지 저장량과 피해량이 일관된다").
  ctrl._sett.gritEntries.push({ amount: 999, gainedAt: now });
  ctrl._sett.grit = ctrl._settGritSum();
  ctrl.shield = 50; // 전투로 보호막 일부 소모를 흉내
  assert(ctrl._sett.wPendingSpent === 300, '세트 W: 보호막 적용 이후 투지가 다시 쌓이거나 보호막이 깎여도 저장된 피해 계산용 수치는 변하지 않는다');

  // 0.75초 뒤 피해 판정(_settWOnCast) - 실제로 적까지 쓰러뜨려본다. 이
  // 시점에 _settGritSum()을 다시 부르면 이미 투지가 쌓인 상태(999)라
  // 잘못된 피해가 나올 수 있으므로, wPendingSpent(300)만 써야 한다.
  const target = makeTarget({ hp: 100000, maxHp: 100000 });
  stubs.placedDummies.push(target); // getAllEnemyUnits()가 전역 목록에서 읽으므로 등록해 둔다
  const before = target.hp;
  const origin = ctrl.root.position.clone();
  const forward = new stubs.THREE.Vector3(0, 0, 1);
  ctrl._settWOnCast(origin, forward);
  const w = CHAMPION_DATA.sett.W;
  const lvl = ctrl.skillLevels.W;
  const expectedDmg = skillValLocal(w.damageBaseByLevel, lvl) + 300 * (w.gritSpendPercent / 100) + w.bonusAdRatio * ctrl._getBonusAD();
  assert(Math.abs((before - target.hp) - expectedDmg) < 1e-6, `세트 W: 0.75초 뒤 피해 판정이 "시전 시점에 저장된" 투지(300)만 쓴다(총 공격력에 영향 없음) - got ${(before - target.hp).toFixed(1)}, 기대 ${expectedDmg.toFixed(1)}`);
}

function skillValLocal(byLevel, lvl) {
  // champion_data.js의 skillVal()과 동일한 "레벨별 배열에서 값 꺼내기" -
  // 테스트에서 기대값을 독립적으로 재계산하기 위한 로컬 복제(실제 게임
  // 수치를 임의로 바꾸지 않기 위해 champion_data.js의 원본 배열을 그대로
  // 읽는다 - 숫자 자체를 지어내지 않는다).
  if (!byLevel) return 0;
  const idx = Math.max(0, Math.min(byLevel.length - 1, lvl - 1));
  return byLevel[idx];
}

// ========================================================================
// 1-1 (계속) - 보호막 적용과 피해 판정이 서로 다른 프레임/다른 호출에서
// 일어나도(즉 "하나의 콜백에 묶이지 않음") 정상 동작하는지, 그리고 W를
// 반복 시전해도 타이머/상태가 중복되지 않는지.
// ========================================================================
{
  const ctrl = makeMinimalChamp('sett');
  ctrl._sett.gritEntries = [{ amount: 100, gainedAt: now }];
  ctrl._sett.grit = 100;
  ctrl._settWApplyShield();
  assert(ctrl.shield === 100, '세트 W 반복 시전 1회차: 보호막 100 적용');
  // 두 번째 시전(투지 50 추가 축적) - 첫 번째 피해 판정이 아직 안 불린
  // 상태에서 다시 시전해도(실제 게임의 재사용대기시간이 있지만, 함수
  // 자체의 안전성만 본다) 보호막 적용은 독립적으로 다시 동작해야 한다.
  ctrl._sett.gritEntries = [{ amount: 50, gainedAt: now }];
  ctrl._sett.grit = 50;
  ctrl._settWApplyShield();
  assert(ctrl.shield === 100, '세트 W 반복 시전 2회차: 새 투지(50)가 기존 보호막(100)보다 작으면 보호막은 줄어들지 않는다(Math.max 유지)');
  assert(ctrl._sett.wPendingSpent === 50, '세트 W 반복 시전 2회차: 두 번째 시전의 피해 계산용 수치는 이번에 소모한 양(50)으로 갱신된다');
}

// ========================================================================
// 1-2. 그리버스(GRIEVOUS) 치유 감소가 실제 회복 계산에 연결되는지
// ========================================================================
{
  const target = makeTarget({ isChampion: true });
  assert(getGrievousPercent(target) === 0, '그리버스: 상태이상이 없으면 0%');
  applyStatus(target, { id: 'testGrievous', type: 'GRIEVOUS', duration: 3.0, value: 0.4 });
  assert(Math.abs(getGrievousPercent(target) - 0.4) < 1e-9, '그리버스: 상태이상이 걸리면 그 값을 그대로 돌려준다');

  // 여러 번(다른 소스에서) 걸려도 "최댓값"만 적용된다(무한 중첩 방지,
  // 실제 LoL의 그리버스도 중첩되지 않고 더 강한 효과로 덮어쓴다).
  applyStatus(target, { id: 'testGrievous2', type: 'GRIEVOUS', duration: 3.0, value: 0.2 });
  assert(Math.abs(getGrievousPercent(target) - 0.4) < 1e-9, '그리버스: 약한 효과가 추가로 걸려도 이미 걸린 더 강한 효과(40%)가 유지된다(합연산 아님)');

  // 만료되면 0으로 돌아온다.
  now += 3100;
  assert(getGrievousPercent(target) === 0, '그리버스: 지속시간이 끝나면 0%로 돌아온다');
  now -= 3100;
}

// 챔피언 전용 회복 경로(세트 패시브 재생)에 그리버스가 실제로 곱해지는지.
{
  const ctrl = makeMinimalChamp('sett', { hp: 1000, maxHp: 2000 });
  const before = ctrl.hp;
  ctrl._settPassiveTick(1.0);
  const healNoGrievous = ctrl.hp - before;
  assert(healNoGrievous > 0, '세트 패시브 재생: 그리버스가 없으면 평소대로 회복한다(사전 조건)');

  const ctrl2 = makeMinimalChamp('sett', { hp: 1000, maxHp: 2000 });
  applyStatus(ctrl2, { id: 'testGrievousSelf', type: 'GRIEVOUS', duration: 10, value: 0.5 });
  const before2 = ctrl2.hp;
  ctrl2._settPassiveTick(1.0);
  const healWithGrievous = ctrl2.hp - before2;
  assert(Math.abs(healWithGrievous - healNoGrievous * 0.5) < 1e-6, `그리버스(50%): 세트 패시브 재생량이 정확히 절반으로 줄어든다(got ${healWithGrievous.toFixed(3)}, 기대 ${(healNoGrievous*0.5).toFixed(3)})`);

  // 그리버스가 만료되면 다시 정상 회복량으로 돌아온다("근접 재생량"은
  // 남은 체력 비율에 비례하므로, hp를 비교군과 똑같은 지점(1000)으로
  // 되돌려 둔 뒤 측정해야 "그리버스 유무"만의 차이를 정확히 비교할 수
  // 있다 - 그냥 이어서 틱하면 hp가 이미 올라 있어 재생량 자체가 달라진다).
  now += 10100;
  ctrl2.hp = 1000;
  const before3 = ctrl2.hp;
  ctrl2._settPassiveTick(1.0);
  const healAfterExpiry = ctrl2.hp - before3;
  assert(Math.abs(healAfterExpiry - healNoGrievous) < 1e-6, `그리버스 만료 후: 회복량이 정상치로 복구된다(got ${healAfterExpiry.toFixed(3)}, 기대 ${healNoGrievous.toFixed(3)})`);
  now -= 10100;

  // getHealReceivedMultiplier() 공용 헬퍼 도입 전에는 챔피언 전용 회복
  // 스킬(세트 패시브 등)에 정령의형상류 "받는 회복 증폭"
  // (itemHealingReceivedBonusPercent)이 전혀 연결돼 있지 않았다(그리버스
  // 감소만 연결돼 있어 증폭/감소가 비대칭이었다) - 이제 같은 헬퍼 하나로
  // 둘 다 자동으로 챙겨지는지, 그리고 두 효과가 동시에 걸려도 올바르게
  // 곱셈으로 합쳐지는지 확인한다.
  const ctrl3 = makeMinimalChamp('sett', { hp: 1000, maxHp: 2000, itemHealingReceivedBonusPercent: 0.25 });
  applyStatus(ctrl3, { id: 'testGrievousAndAmp', type: 'GRIEVOUS', duration: 10, value: 0.5 });
  const before4 = ctrl3.hp;
  ctrl3._settPassiveTick(1.0);
  const healWithBoth = ctrl3.hp - before4;
  // 증폭(+25%)과 감소(-50%)가 동시에 걸리면 125% * 50% = 62.5%가 적용된다.
  assert(Math.abs(healWithBoth - healNoGrievous * 1.25 * 0.5) < 1e-6, `정령의형상 증폭(+25%)과 그리버스(-50%)가 챔피언 전용 회복(세트 패시브)에도 동시에 정확히 곱해진다(got ${healWithBoth.toFixed(3)}, 기대 ${(healNoGrievous*1.25*0.5).toFixed(3)})`);
}

// 전 챔피언 공통 기본 체력 재생(character_controller.js의 regen())에도
// 연결돼 있는지 - 가장 핵심적인 공용 회복 경로.
{
  const ctrl = makeMinimalChamp('garen', { hp: 1000, maxHp: 2000, hpRegen: 20 });
  const before = ctrl.hp;
  ctrl.regen(1.0);
  const healNoGrievous = ctrl.hp - before;
  assert(healNoGrievous > 0, '기본 체력 재생: 그리버스가 없으면 평소대로 회복한다(사전 조건)');

  const ctrl2 = makeMinimalChamp('garen', { hp: 1000, maxHp: 2000, hpRegen: 20 });
  applyStatus(ctrl2, { id: 'testGrievousRegen', type: 'GRIEVOUS', duration: 10, value: 0.3 });
  const before2 = ctrl2.hp;
  ctrl2.regen(1.0);
  const healWithGrievous = ctrl2.hp - before2;
  assert(Math.abs(healWithGrievous - healNoGrievous * 0.7) < 1e-6, `그리버스(30%): 전 챔피언 공통 기본 체력 재생도 감소한다(got ${healWithGrievous.toFixed(3)}, 기대 ${(healNoGrievous*0.7).toFixed(3)})`);

  // 보호막은 그리버스의 영향을 받지 않는다(별개 시스템) - regen()은 mp도
  // 같이 처리하는데, 마나는 애초에 그리버스 대상이 아니다(실제 LoL과 동일).
  const ctrl3 = makeMinimalChamp('garen', { hp: 1000, maxHp: 2000, mp: 500, maxMp: 1000, mpRegen: 10 });
  applyStatus(ctrl3, { id: 'testGrievousMp', type: 'GRIEVOUS', duration: 10, value: 1.0 }); // 100% 치유 감소
  const mpBefore = ctrl3.mp;
  ctrl3.regen(1.0);
  assert(ctrl3.mp > mpBefore, '그리버스: 마나 재생에는 영향을 주지 않는다(체력 회복 전용 효과)');
}

// ========================================================================
// 1-3. 가렌 Q 강화 기본 공격 소비 시점
// ========================================================================
{
  // 가렌 Q 오버라이드를 실제 등록 함수(registerAttackOverride)로 등록해
  // 실제 운영 코드와 동일한 모양의 오버라이드 객체를 쓴다.
  const ctrl = makeMinimalChamp('garen');
  ctrl.registerAttackOverride({ id: 'Q', clips: ['Spell1'], priority: 10, oneShot: true, uses: 1 });
  let override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(!!override && override.usesRemaining === 1, '가렌 Q: 시전 직후 오버라이드가 1회분으로 등록된다(사전 조건)');

  // 스윙을 "시작"하는 시점에 해당하는 _consumeAttackOverride()만 호출한다
  // (실제 _beginAttackSwing이 이 함수를 부르는 지점과 동일) - 아직 명중
  // 여부를 모르는 시점이므로 가렌 Q는 여기서 소모되면 안 된다.
  ctrl._consumeAttackOverride(override, null);
  override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(!!override && override.usesRemaining === 1, '가렌 Q: 스윙을 "시작"한 것만으로는 소모되지 않는다(명중 전)');

  // 이번 스윙이 빗나간 경우(대상이 사라지는 등) - 실제 코드에서는
  // _onBasicAttackHit() 자체가 호출되지 않는다. 즉 아무것도 더 하지
  // 않아도 오버라이드가 그대로 남아 있어야 한다(검증 조건: "명중하지
  // 않았을 때 가렌 Q 효과가 유지된다").
  override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(!!override && override.usesRemaining === 1, '가렌 Q: 스윙이 빗나가면(HIT 콜백 자체가 안 불림) 효과가 그대로 유지된다');

  // 이제 실제로 명중했다고 가정하고 확정 소비 함수를 부른다(실제
  // _onBasicAttackHit()이 _garenQOnHit() 직후 호출하는 지점과 동일).
  ctrl._consumeAttackOverrideOnConfirmedHit('Q');
  override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(!override, '가렌 Q: 실제 적중이 확정되면 그 시점에 1회분이 소모되어(uses=1) 오버라이드가 해제된다');
}

// 가렌 Q의 실제 효과(피해+침묵)가 적중 시 정확히 걸리는지.
{
  const ctrl = makeMinimalChamp('garen');
  const target = makeTarget();
  const before = target.hp;
  ctrl._garenQOnHit(target);
  const q = CHAMPION_DATA.garen.Q;
  const lvl = ctrl.skillLevels.Q;
  const expectedDmg = skillValLocal(q.damageByLevel, lvl) + q.adRatio * ctrl.stats.attackDamage;
  assert(Math.abs((before - target.hp) - expectedDmg) < 1e-6, `가렌 Q: 적중 시 피해량이 정확하다(got ${(before-target.hp).toFixed(1)}, 기대 ${expectedDmg.toFixed(1)})`);
  const silence = target.statusEffects.find((e) => e.id === 'garenQ_silence');
  assert(!!silence && silence.type === 'SILENCE', '가렌 Q: 적중 시 침묵이 걸린다');
}

// 세트 Q 등 "공격 사용 자체가 소비 조건"인 다른 오버라이드는 기존처럼
// 스윙 시작 시점에 즉시 소모돼야 한다(가렌 Q만의 예외이지, 전체 소비
// 방식을 바꾼 게 아님을 확인).
{
  const ctrl = makeMinimalChamp('sett');
  ctrl.registerAttackOverride({ id: 'Q', clips: ['Spell1_A', 'Spell1_B'], priority: 10, oneShot: true, uses: 2 });
  let override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(override.usesRemaining === 2, '세트 Q: 2회분으로 등록된다(사전 조건)');
  ctrl._consumeAttackOverride(override, null);
  override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(!!override && override.usesRemaining === 1, '세트 Q: 가렌과 달리 스윙을 "시작"하는 즉시 1회분이 소모된다(기존 동작 유지)');
  ctrl._consumeAttackOverride(override, null);
  override = ctrl.attackOverrides.find((o) => o.id === 'Q');
  assert(!override, '세트 Q: 두 번째 소모로 완전히 해제된다');
}

// ========================================================================
// 1-4. 다리우스 W(마비의 일격) 강화 기본 공격 소비 시점 - 가렌 Q와 완전히
// 동일한 패턴의 버그(전투 시스템 보완 점검 중 발견): champion_ability_database.js
// 에 attackOverrideMode:'oneShot'/uses:1로 등록되는 "다음 평타 1회 강화"라서,
// 스킬이 평타를 끊는 우선순위 규칙으로 스윙이 캔슬되거나 대상이 사거리를
// 벗어나 실제 HIT에 도달하지 못하면 가렌 Q와 동일하게 허비될 수 있었다.
// ========================================================================
{
  const ctrl = makeMinimalChamp('darius');
  ctrl.registerAttackOverride({ id: 'W', clips: ['Spell2'], priority: 10, oneShot: true, uses: 1 });
  let override = ctrl.attackOverrides.find((o) => o.id === 'W');
  assert(!!override && override.usesRemaining === 1, '다리우스 W: 시전 직후 오버라이드가 1회분으로 등록된다(사전 조건)');

  // 스윙 "시작" 시점(_beginAttackSwing이 _consumeAttackOverride를 부르는
  // 지점과 동일) - 아직 명중 여부를 모르므로 소모되면 안 된다.
  ctrl._consumeAttackOverride(override, null);
  override = ctrl.attackOverrides.find((o) => o.id === 'W');
  assert(!!override && override.usesRemaining === 1, '다리우스 W: 스윙을 "시작"한 것만으로는 소모되지 않는다(명중 전)');

  // 스윙이 캔슬되거나 빗나가 _onBasicAttackHit() 자체가 호출되지 않는
  // 경우 - 오버라이드가 그대로 남아 다음 평타에 다시 쓸 수 있어야 한다.
  override = ctrl.attackOverrides.find((o) => o.id === 'W');
  assert(!!override && override.usesRemaining === 1, '다리우스 W: 스윙이 캔슬/빗나가면(HIT 콜백 자체가 안 불림) 효과가 그대로 유지된다');

  // 실제 명중이 확정된 시점(_onBasicAttackHit()이 _dariusWOnHit() 직후
  // 호출하는 지점과 동일).
  ctrl._consumeAttackOverrideOnConfirmedHit('W');
  override = ctrl.attackOverrides.find((o) => o.id === 'W');
  assert(!override, '다리우스 W: 실제 적중이 확정되면 그 시점에 1회분이 소모되어(uses=1) 오버라이드가 해제된다');
}

// 다리우스 W의 실제 효과(추가 피해+슬로우)가 적중 시 정확히 걸리는지.
{
  const ctrl = makeMinimalChamp('darius');
  const target = makeTarget();
  const before = target.hp;
  ctrl._dariusWOnHit(target);
  const w = CHAMPION_DATA.darius.W;
  const lvl = ctrl.skillLevels.W;
  const expectedDmg = ctrl.stats.attackDamage * skillValLocal(w.bonusAdRatioByLevel, lvl);
  assert(Math.abs((before - target.hp) - expectedDmg) < 1e-6, `다리우스 W: 적중 시 추가 피해량이 정확하다(got ${(before-target.hp).toFixed(1)}, 기대 ${expectedDmg.toFixed(1)})`);
  const slow = target.statusEffects.find((e) => e.id === 'dariusW_slow');
  assert(!!slow && slow.type === 'SLOW' && Math.abs(slow.value - w.slowPercent / 100) < 1e-9, '다리우스 W: 적중 시 슬로우가 정확한 수치로 걸린다');
}

// 챔피언 스킬 보호막에도 "보호막 효과 증가"(정령의형상 등)가 적용된다 -
// 아이템 보호막만 적용되던 비대칭 수정. 피해 계산용 투지 값은 그대로다.
{
  const ctrl = makeMinimalChamp('sett', { itemShieldReceivedBonusPercent: 0.25 });
  ctrl._sett.gritEntries = [{ amount: 300, gainedAt: now - 100 }];
  ctrl._sett.grit = 300;
  ctrl._settWApplyShield();
  assert(Math.abs(ctrl.shield - 375) < 1e-6, `세트 W: 보호막 효과 +25%가 적용된다(got ${ctrl.shield})`);
  assert(ctrl._sett.wPendingSpent === 300, '세트 W: 피해 계산용 소모 투지는 보호막 증가와 무관하게 300');
}

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
