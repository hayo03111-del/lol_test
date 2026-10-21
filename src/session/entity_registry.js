/* entity_registry.js — 93차(온라인 1:1 준비): 엔티티 고유 ID
 * 지금까지는 유닛을 객체 참조로만 구분했다(id 필드 없음). 명령·스냅샷·이벤트가 유닛을 "숫자 ID"로 가리킬 수 있게,
 * 기존 객체를 건드리지 않고(필드 추가·생성 함수 수정 없음) 처음 조회할 때 ID를 붙이는 WeakMap 레지스트리를 둔다.
 *  - entityId(unit): 그 유닛의 ID(처음이면 새로 발급). 같은 객체는 항상 같은 ID, 지워진 유닛의 ID는 재사용하지 않는다.
 *  - entityKind(unit): 'champion' | 'dummy' | 'allyDummy' | 'minion' | 'turret' | 'inhibitor' | 'nexus' | 'ward' | 'unknown'
 *  - listEntities(): 지금 월드에 있는 유닛 전부(기존 전역 배열을 읽기만 한다 - 새 목록을 따로 저장하지 않는다).
 *  - findEntityById(id): ID → 유닛(없으면 null).
 * 서버 권위 구조로 갈 때는 생성 함수(createMinion 등)에서 ID를 발급하고 객체 참조 대신 ID를 저장하는 쪽으로 옮긴다(README 93차).
 */
// var + 초기값 없음: 파일 순서와 무관하게 쓸 수 있게 처음 부를 때 만든다(초기값을 두면 이 줄이 늦게 실행될 때 번호가 되감긴다).
var _entityIds;
var _entityNextId;
function entityId(unit) {
  if (!unit || (typeof unit !== 'object' && typeof unit !== 'function')) return null;
  if (!_entityIds) { _entityIds = new WeakMap(); _entityNextId = 1; }
  let id = _entityIds.get(unit);
  if (id == null) { id = _entityNextId++; _entityIds.set(unit, id); }
  return id;
}
function entityKind(unit) {
  if (!unit) return 'unknown';
  if (typeof CharacterController !== 'undefined' && unit instanceof CharacterController) return 'champion';
  if (unit.isWard) return 'ward';
  if (unit.isMinion) return 'minion';
  if (unit.isTurret) return 'turret';
  if (unit.isInhibitor) return 'inhibitor';
  if (unit.isNexus) return 'nexus';
  if (unit.isAlly) return 'allyDummy';
  if (unit.isTrainingDummy || unit.isChampion) return 'dummy';
  return 'unknown';
}
// 기존 전역 배열들을 순서대로 모은다(중복 제거). 죽은 미니언·파괴된 와드는 목록에서 빠진다(기존 배열 규칙 그대로).
function listEntities() {
  const out = [], seen = new Set();
  const add = (u) => { if (u && !seen.has(u)) { seen.add(u); out.push(u); } };
  if (typeof controller !== 'undefined') add(controller);
  if (typeof dummy !== 'undefined') add(dummy);
  if (typeof placedDummies !== 'undefined' && placedDummies) placedDummies.forEach(add);
  if (typeof placedAllies !== 'undefined' && placedAllies) placedAllies.forEach(add);
  if (typeof minions !== 'undefined' && minions) minions.forEach(add);
  if (typeof turrets !== 'undefined' && turrets) turrets.forEach(add);
  if (typeof inhibitorBuildings !== 'undefined' && inhibitorBuildings) inhibitorBuildings.forEach(add);
  if (typeof nexusBuildings !== 'undefined' && nexusBuildings) nexusBuildings.forEach(add);
  if (typeof wardSystem !== 'undefined' && wardSystem && wardSystem.wards) wardSystem.wards.forEach((w) => { if (!w.destroyed) add(w); });
  return out;
}
function findEntityById(id) {
  if (id == null) return null;
  for (const u of listEntities()) if (entityId(u) === id) return u;
  return null;
}
