// 93차(온라인 1:1 준비) 세션 계층 테스트 - 엔티티 ID, 게임 이벤트, 상태 스냅샷, 입력 명령/LocalSession.
// 실제 src/session/*.js와 00_global_constants.js(getWorldPosition·STATE)를 vm으로 불러오고, 게임 함수(moveTo·castAbility 등)는
// 호출 기록만 남기는 가짜로 바꿔 "명령이 어떤 기존 함수로 어떤 인자와 함께 넘어가는가"를 확인한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }

let now = 50000;
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  applyQuaternion(q) { const a = (q && q.yaw) || 0; const x = this.x, z = this.z; this.x = x * Math.cos(a) + z * Math.sin(a); this.z = -x * Math.sin(a) + z * Math.cos(a); return this; }
}
const calls = [];
const stubs = {
  performance: { now: () => now }, console,
  THREE: { Vector3 },
  ITEM_DATA: { longSword: { nameKo: '롱소드' } },
  getTurretGameTimeSec: () => 12.5,
  getFinalAttackSpeed: () => 0.7, getFinalMoveSpeed: () => 3.4, worldDistanceToLol: (v) => v * 100,
  castSummonerSpell: (c, slot, point, pc, opts) => { calls.push(['summoner', slot, point, pc, opts]); return true; },
  useItem: (c, slot, opts) => { calls.push(['useItem', slot, opts]); return true; },
  placeWard: (c, p) => { calls.push(['placeWard', p]); return true; },
  buildOrBuyItem: (c, id) => { calls.push(['buy', id]); return true; },
  sellItem: (c, slot) => { calls.push(['sell', slot]); return true; },
  sellBoots: (c) => { calls.push(['sellBoots']); return true; },
};
const context = vm.createContext(stubs);
const src = ['src/core/00_global_constants.js', 'src/session/entity_registry.js', 'src/session/game_events.js', 'src/session/game_snapshot.js', 'src/session/game_commands.js']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
vm.runInContext(`
class CharacterController {
  moveTo(p) { _calls.push(['moveTo', p]); return true; }
  selectTarget(t) { _calls.push(['selectTarget', t]); return true; }
  attackMoveTo(p, o) { _calls.push(['attackMoveTo', p, o]); return true; }
  castAbility(s, p) { _calls.push(['castAbility', s, p, this.currentTarget]); return undefined; }
  levelUpSkill(s) { _calls.push(['levelUpSkill', s]); return true; }
  startRecall() { _calls.push(['recall']); return true; }
}
` + src + `
this.api = { CharacterController, entityId, entityKind, listEntities, findEntityById, emitGameEvent, onGameEvent, recentGameEvents, buildGameSnapshot,
  validateCommand, submitPlayerCommand, LocalSession, get gameSession() { return gameSession; }, toCommandPoint, STATE,
  setWorld: (w) => { controller = w.controller; dummy = w.dummy; placedDummies = w.placedDummies; minions = w.minions; turrets = w.turrets; gameEnded = false; } };
`, Object.assign(context, { _calls: calls }));
const api = context.api;

// --- 가짜 월드 ---
const c = new api.CharacterController();
Object.assign(c, {
  championId: 'garen', team: 'BLUE', isChampion: true, root: { position: new Vector3(1, 0, 2), quaternion: { yaw: Math.PI / 2 } },
  hp: 500, maxHp: 620, mp: 0, maxMp: 0, champLevel: 3, state: api.STATE.IDLE, cooldowns: { Q: 2.5, W: 0, E: 0, R: 0 },
  stats: { attackDamage: 70, abilityPower: 0, armor: 36, magicResist: 32, critChance: 0 },
  statusEffects: [{ id: 'garenQ_ms', type: 'MS_BUFF', expiresAt: now + 1500, value: 0.35, source: null }, { id: 'old', type: 'SLOW', expiresAt: now - 1 }],
  gold: 1400, items: [{ id: 'longSword', count: 1 }], boots: null, trinket: { id: 'stealthWard', charges: 2 },
  skillLevels: { Q: 1, W: 1, E: 1, R: 0 }, skillPoints: 0, currentExp: 30,
  summoners: { D: { id: 'flash', readyAt: now + 2000 }, F: { id: 'heal', readyAt: 0 } },
});
const dum = { isTrainingDummy: true, isChampion: true, team: 'RED', hp: 300, maxHp: 300, mesh: { position: new Vector3(5, 0, 5), quaternion: { yaw: 0 } } };
const minion = { isMinion: true, team: 'RED', hp: 400, maxHp: 450, type: 'melee', minionType: 'melee', mesh: { position: new Vector3(8, 0, 1), quaternion: { yaw: 0 } }, body: { quaternion: { yaw: Math.PI } } };
const well = { isTurret: true, isUntargetable: true, team: 'RED', hp: Infinity, maxHp: Infinity, type: 'nexusWell', mesh: { position: new Vector3(0, 0, 90), quaternion: { yaw: 0 } } };
api.setWorld({ controller: c, dummy: dum, placedDummies: [], minions: [minion], turrets: [well] });

// --- 엔티티 ID ---
const idC = api.entityId(c), idD = api.entityId(dum), idM = api.entityId(minion);
assert(Number.isInteger(idC) && idC !== idD && idD !== idM, 'entityId: 유닛마다 다른 정수 ID');
assert(api.entityId(c) === idC && api.entityId(minion) === idM, 'entityId: 같은 유닛은 언제나 같은 ID');
assert(api.findEntityById(idM) === minion && api.findEntityById(99999) === null, 'findEntityById: ID → 유닛, 없으면 null');
assert(api.entityKind(c) === 'champion' && api.entityKind(dum) === 'dummy' && api.entityKind(minion) === 'minion' && api.entityKind(well) === 'turret', 'entityKind: 종류 구분');
assert(api.listEntities().length === 4, 'listEntities: 기존 전역 배열에서 모은다(컨트롤러·허수아비·미니언·구조물)');

// --- 스냅샷 ---
const snap = api.buildGameSnapshot();
const round = JSON.parse(JSON.stringify(snap));
assert(JSON.stringify(round) === JSON.stringify(snap), '스냅샷: JSON으로 바꿔도 내용이 그대로(직렬화 가능)');
const plain = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) ? v.every(plain) : (v.constructor && v.constructor.name === 'Object' && Object.values(v).every(plain)));
assert(plain(snap), '스냅샷: 평범한 객체·배열·숫자·문자열만(Vector3·클래스 인스턴스 없음)');
const sc = snap.entities.find((e) => e.id === idC);
assert(sc && sc.kind === 'champion' && sc.pos.x === 1 && sc.pos.z === 2 && sc.hp === 500 && sc.maxHp === 620 && sc.cooldowns.Q === 2.5, '스냅샷: 챔피언 위치·체력·쿨다운');
assert(Math.abs(sc.yaw - Math.PI / 2) < 1e-3, '스냅샷: 바라보는 방향(yaw)');
assert(sc.statusEffects.length === 1 && sc.statusEffects[0].remainingMs === 1500, '스냅샷: 남은 상태 효과만, 남은 시간(ms)');
assert(snap.entities.find((e) => e.kind === 'turret').hp === null, '스냅샷: 무한 체력(우물)은 null');
assert(snap.players[0].gold === 1400 && snap.players[0].items[0].itemId === 'longSword' && snap.players[0].summoners.D.readyInMs === 2000, '스냅샷: 플레이어 골드·아이템·소환사 주문');
assert(snap.gameTimeSec === 12.5 && snap.v === 1, '스냅샷: 버전·게임 시간');

// --- 명령 형식 검사 ---
const V = api.validateCommand;
assert(V({ type: 'teleport' }) && V(null) && V({ type: 'move' }) && V({ type: 'move', point: { x: NaN, z: 0 } }), '검사: 모르는 명령·좌표 없음·NaN 좌표 거부');
assert(V({ type: 'cast', slot: 'X' }) && V({ type: 'summoner', slot: 'Q' }) && V({ type: 'useItem', slot: 6 }) && V({ type: 'sellItem', slot: 'hat' }), '검사: 잘못된 칸 거부');
assert(V({ type: 'buyItem', itemId: 'notAnItem' }) && V({ type: 'attack' }) && V({ type: 'attack', targetId: '3' }), '검사: 없는 아이템·대상 없는 공격·문자열 대상 ID 거부');
assert(!V({ type: 'cast', slot: 'Q' }) && !V({ type: 'move', point: { x: 1, z: 2 } }) && !V({ type: 'sellItem', slot: 'boots' }), '검사: 올바른 명령 통과(시전 좌표는 선택)');

// --- LocalSession 연결 ---
const S = (cmd) => api.submitPlayerCommand(cmd);
calls.length = 0;
let r = S({ type: 'move', point: { x: 3, y: 0, z: 4 }, hp: 99999, gold: 99999 });
assert(r.ok && calls[0][0] === 'moveTo' && calls[0][1].x === 3 && calls[0][1].z === 4 && calls[0][1] instanceof Vector3, 'move → moveTo(Vector3)');
assert(c.hp === 500 && c.gold === 1400, '명령 안의 체력·골드 값은 읽지 않는다');
c._masteryi = { alpha: {} }; c._masteryiSetAlphaStrikeReemergeDirection = (p) => calls.push(['reemerge', p]);
calls.length = 0; S({ type: 'move', point: { x: 1, z: 1 } });
assert(calls[0][0] === 'reemerge' && calls.length === 1, 'move: 마스터 이 Q 중이면 재등장 방향만(이동 안 함 - 기존 규칙)');
delete c._masteryi;
calls.length = 0; S({ type: 'stop' });
assert(calls[0][0] === 'moveTo' && calls[0][1].x === 1 && calls[0][1].z === 2 && calls[0][1] !== c.root.position, 'stop → 제자리로 moveTo(복사본)');
calls.length = 0; c._attackMoveDest = { x: 1 }; S({ type: 'attack', targetId: idM, fromAttackMove: true });
assert(calls[0][0] === 'selectTarget' && calls[0][1] === minion && c._attackMoveDest === null, 'attack → selectTarget(ID로 찾은 유닛), 공격 이동 목적지 해제');
r = S({ type: 'attack', targetId: 424242 });
assert(!r.ok && r.reason, 'attack: 없는 대상 ID는 거부');
calls.length = 0; S({ type: 'cast', slot: 'Q', point: { x: 2, y: 0, z: 2 }, targetId: idD });
assert(calls[0][0] === 'castAbility' && calls[0][1] === 'Q' && calls[0][3] === dum && c.currentTarget === dum, 'cast: 대상 ID를 현재 대상으로 삼고 castAbility');
calls.length = 0; S({ type: 'cast', slot: 'R' });
assert(calls[0][0] === 'castAbility' && calls[0][2] === null, 'cast: 좌표가 없으면 null(바라보는 방향 - 기존 규칙)');
S({ type: 'clearTarget' });
assert(c.currentTarget === null, 'clearTarget → 대상 해제');
calls.length = 0; S({ type: 'summoner', slot: 'F', point: { x: 1, z: 1 }, targetId: idD });
assert(calls[0][0] === 'summoner' && calls[0][1] === 'F' && calls[0][3] === null && calls[0][4].target === dum, 'summoner → castSummonerSpell(화면 좌표 없이, 대상은 opts.target)');
calls.length = 0; S({ type: 'useItem', slot: 0, point: { x: 7, z: 7 } });
assert(calls[0][0] === 'useItem' && calls[0][1] === 0 && calls[0][2].point.x === 7, 'useItem → useItem(opts.point)');
calls.length = 0; S({ type: 'buyItem', itemId: 'longSword' }); S({ type: 'sellItem', slot: 'boots' }); S({ type: 'sellItem', slot: 2 }); S({ type: 'placeWard', point: { x: 1, z: 1 } });
assert(calls.map((x) => x[0]).join(',') === 'buy,sellBoots,sell,placeWard', '상점·와드 명령 → buildOrBuyItem·sellBoots·sellItem·placeWard');
calls.length = 0; S({ type: 'levelUpSkill', slot: 'R' }); S({ type: 'recall' }); S({ type: 'attackMove', point: { x: 1, z: 1 }, championsOnly: true, cursorPoint: { x: 2, z: 2 } });
assert(calls[0][1] === 'R' && calls[1][0] === 'recall' && calls[2][0] === 'attackMoveTo' && calls[2][2].championsOnly === true && calls[2][2].cursorPoint.x === 2, '레벨 업·귀환·공격 이동');

// --- 이벤트·틱 ---
const sess = api.gameSession;
const t0 = sess.tick;
sess.advance(0.016); sess.advance(0); sess.advance(0.016);
assert(sess.tick === t0 + 2 && Math.abs(sess.simTimeSec - 0.032) < 1e-9, 'advance: dt > 0일 때만 틱·시뮬레이션 시간 진행');
const evs = api.recentGameEvents(0);
const cr = evs.filter((e) => e.type === 'commandResult');
assert(cr.length >= 15 && cr.some((e) => e.ok === false && e.reason), '명령마다 commandResult 이벤트(거부 이유 포함)');
let got = null; const off = api.onGameEvent('damage', (e) => { got = e; throw new Error('구독자 오류'); });
const ev = api.emitGameEvent('damage', { targetId: idD, amount: 12 });
assert(got && got.targetId === idD && ev.tick === sess.tick && ev.seq > 0, 'emitGameEvent: 구독자에게 전달, 틱·번호가 붙는다(구독자 예외는 삼킨다)');
off();
assert(JSON.parse(JSON.stringify(api.recentGameEvents(0))).length === api.recentGameEvents(0).length, '이벤트: 직렬화 가능');
sess.reset();
assert(sess.tick === 0 && sess.simTimeSec === 0 && api.recentGameEvents(0).some((e) => e.type === 'gameReset'), 'reset: 틱·시간 처음으로 + gameReset 이벤트');
