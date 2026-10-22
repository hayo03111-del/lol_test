/* enemy_bot.js — 95차: 적 챔피언 봇(만들기·매 프레임 갱신·지우기)
 *
 * 봇은 플레이어와 같은 CharacterController + 같은 챔피언 코드다(bootstrapChampion과 같은 순서로 GLB를 세운다).
 * 다른 점: team = RED, isBot = true, 머리 위 바는 적(빨강), 화면 HUD·대상 표시·알림은 건드리지 않는다(updateBars 등이
 * isBot/isBotActing을 본다). 매 프레임 봇 입장(withCombatActor)에서 두뇌(BotBrain) → 컨트롤러 update 순서로 돈다.
 * 게임 초기화·챔피언 교체 때도 남아 있고(초기화는 처음 상태로 되살림), "적 챔피언 AI 전부 제거"로 지운다.
 */
// enemyBots 배열은 00_global_constants.js에 있다(메인 루프가 이 파일보다 먼저 돌기 시작한다).
const _botGlbCache = new Map();
function _botFetchGlb(id) {
  if (!_botGlbCache.has(id)) {
    _botGlbCache.set(id, fetch(CHAMPION_MODEL_DIR + id + '.glb').then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.arrayBuffer(); })
      .catch((e) => { _botGlbCache.delete(id); throw e; }));
  }
  return _botGlbCache.get(id);
}
function _botChampionName(id) {
  const row = CHAMPION_MODEL_LIBRARY.find(([k]) => k === id);
  return row ? row[1] : id;
}
// 적 챔피언 봇을 만든다. opts: { difficulty: 'easy'|'normal'|'hard', team, position, level }
async function spawnEnemyBot(championId, opts = {}) {
  if (!CHAMPION_MODEL_LIBRARY.some(([k]) => k === championId)) throw new Error('모르는 챔피언: ' + championId);
  const buf = await _botFetchGlb(championId);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.slice(0), '', res, rej));
  return _buildEnemyBot(gltf, championId, opts);
}
function _buildEnemyBot(gltf, championId, opts) {
  const model = gltf.scene;
  if (championId === 'nilah') ensureNilahWeaponRig(model);
  alignModelOrigin(model);
  const originCorrection = MODEL_ORIGIN_CORRECTION[championId];
  if (originCorrection) { model.position.x += originCorrection.x; model.position.z += originCorrection.z; }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const scaleWrapper = new THREE.Group();
  scaleWrapper.add(model);
  scaleWrapper.scale.setScalar(resolveModelScaleMultiplier(championId));
  const root = new THREE.Group();
  root.add(scaleWrapper);
  scene.add(root);
  const resolver = new AnimationRoleResolver(gltf.animations || []);
  const abilityResolver = new ChampionAbilityResolver(resolver, championId);
  const actionData = buildActionData(resolver, abilityResolver);
  const box = new THREE.Box3().setFromObject(model);
  const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
  root.add(createBlobShadow(sphere.radius * 0.9));
  const team = opts.team || ENEMY_TEAM;
  const hpDiv = makeChampBarDiv(team === PLAYER_TEAM ? 'ally' : 'enemy', _botChampionName(championId)); // 96차: 아군 봇은 파랑 바
  const hpLabel3d = new CSS2DObject(hpDiv);
  hpLabel3d.position.set(0, (isFinite(box.max.y) ? box.max.y : BASE_UNIT * 1.8) + 2.55, 0);
  root.add(hpLabel3d);

  const bot = new CharacterController(root, model, resolver, actionData);
  bot.isBot = true; // 생성 직후 - 아래 초기화가 플레이어 화면을 건드리지 않게
  bot.team = team;
  bot.botDifficulty = opts.difficulty || 'normal';
  if (championId === 'nilah') attachNilahWeaponRig(bot, model);
  bot.healthBarLabelDiv = hpDiv;
  bot.skillAnimStore = new SkillAnimationSequenceStore(championId);
  bot.abilityResolver = abilityResolver;
  bot.modelHeight = isFinite(box.max.y) ? Math.max(1, box.max.y) : 1.8; // 클릭 선택 높이
  withCombatActor(bot, () => {
    bot.applyChampionData(championId);
    if (typeof precomputeAttackImpacts === 'function') precomputeAttackImpacts(bot);
    if (championId === 'renekton' && bot.findAnimation('Idle1')) bot.playFirstAvailable(['Idle1'], { loop: THREE.LoopRepeat, fade: 0 });
    else if (championId === 'yasuo' && bot.findAnimation('Idle1_Raw')) bot.playFirstAvailable(['Idle1_Raw'], { loop: THREE.LoopRepeat, fade: 0 });
    else bot.playFirstAvailable(actionData.idle.clips, { fade: 0 });
  });
  const groundDrop = groundModelOnIdlePose(bot);
  if (groundDrop) hpLabel3d.position.y -= groundDrop;
  bot._hpLabel3d = hpLabel3d; bot._hpLabelBaseY = hpLabel3d.position.y;
  bot._scaleWrapper = scaleWrapper; bot._sizeScale = 1; bot._sizeMods = {};
  _botResetForGame(bot, opts);
  bot.brain = new BotBrain(bot, { difficulty: bot.botDifficulty });
  enemyBots.push(bot);
  if (typeof entityId === 'function') entityId(bot);
  updateBars(bot);
  return bot;
}
// 게임 시작 상태(칼바람: 3레벨·1400골드, 상대 분수) - 처음 만들 때와 게임 초기화 때.
function _botResetForGame(bot, opts = {}) {
  const level = opts.level || ((typeof howlingAbyssStructuresSpawned !== 'undefined' && howlingAbyssStructuresSpawned) ? 3 : bot.champLevel || 1);
  bot.champLevel = Math.max(1, Math.min(18, level)); bot.currentExp = 0; bot.skillPoints = 0;
  bot.items = []; bot.gold = 0; bot._startingGoldGiven = false; bot.score = { kills: 0, deaths: 0, assists: 0, cs: 0 }; bot._bounty = 0;
  if (typeof grantStartingGold === 'function' && typeof howlingAbyssStructuresSpawned !== 'undefined' && howlingAbyssStructuresSpawned) grantStartingGold(bot);
  if (typeof recomputeItemStats === 'function') recomputeItemStats(bot);
  bot.recomputeStats(); bot.hp = bot.maxHp; bot.mp = bot.maxMp;
  const p = opts.position ? opts.position.clone() : (typeof getTeamSpawnPosition === 'function' && typeof howlingAbyssMap !== 'undefined' && howlingAbyssMap
    ? getTeamSpawnPosition(bot.team) : new THREE.Vector3(0, 0, -10));
  bot.root.position.copy(p);
  bot.targetPos = null; bot.currentTarget = null; bot.attackOrderActive = false;
  bot.setState(STATE.IDLE);
  if (bot.brain) bot.brain.mode = 'LANE';
}
function updateEnemyBots(dt) {
  for (const b of enemyBots) {
    if (!b || b._removed) continue;
    withCombatActor(b, () => {
      try { if (b.brain) b.brain.tick(dt); } catch (e) { console.error('[BOT AI]', b.championId, e); }
      b.update(dt);
      if (typeof b._tickSizeScale === 'function') b._tickSizeScale(dt);
    });
  }
}
function removeEnemyBot(bot) {
  const i = enemyBots.indexOf(bot);
  if (i < 0) return false;
  enemyBots.splice(i, 1);
  bot._removed = true;
  withCombatActor(bot, () => {
    try { bot._teardownChampionRuntime(); } catch (e) { console.error('[BOT] 정리', e); }
    bot._clearPending(); bot._clearActionTimers();
    if (bot.mixer) bot.mixer.stopAllAction();
  });
  if (typeof clearStatusesFromSource === 'function' && typeof listEntities === 'function') clearStatusesFromSource(bot, listEntities());
  if (typeof controller !== 'undefined' && controller && controller.currentTarget === bot) { controller.currentTarget = null; controller.attackOrderActive = false; if (typeof targetRing !== 'undefined') targetRing.clear(); }
  bot.hp = 0;
  if (bot.root) {
    bot.root.traverse((o) => { if (o.isCSS2DObject && o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element); });
    if (bot.root.parent) bot.root.parent.remove(bot.root);
  }
  return true;
}
function clearEnemyBots() { for (const b of [...enemyBots]) removeEnemyBot(b); }

// 연습 도구 패널: 챔피언·난이도를 골라 추가 / 전부 제거.
(function setupEnemyBotUI() {
  const sel = document.getElementById('enemyBotChampSelect');
  const diff = document.getElementById('enemyBotDifficulty');
  const teamSel = document.getElementById('enemyBotTeam');
  const add = document.getElementById('spawnEnemyBotBtn');
  const clr = document.getElementById('clearEnemyBotsBtn');
  if (sel) for (const [id, name] of CHAMPION_MODEL_LIBRARY) { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o); }
  if (add) add.addEventListener('click', () => {
    const id = sel && sel.value ? sel.value : 'garen';
    add.disabled = true;
    const team = teamSel && teamSel.value === 'BLUE' ? 'BLUE' : 'RED';
    spawnEnemyBot(id, { difficulty: diff ? diff.value : 'normal', team })
      .then(() => { if (typeof showSkillToast === 'function') showSkillToast(`${team === 'BLUE' ? '아군' : '적'} 챔피언 AI 추가: ${_botChampionName(id)}`); })
      .catch((e) => { if (typeof showSkillToast === 'function') showSkillToast(`적 챔피언을 불러오지 못했어요 (${e.message || e})`); })
      .finally(() => { add.disabled = false; });
  });
  if (clr) clr.addEventListener('click', () => clearEnemyBots());
  if (diff) diff.addEventListener('change', () => { for (const b of enemyBots) if (b.brain) b.brain.setDifficulty(diff.value); });
})();
