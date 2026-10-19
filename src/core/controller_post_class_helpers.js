/* ============================================================
   2. UI HELPERS
   ============================================================ */
function updateStateLabel(s) { document.getElementById('stateLabel').textContent = s; }
// 최적화(문서 4-21/22절 "DOM 갱신을 매 프레임 하지 마라") - updateBars()는
// regen(dt)을 통해 매 프레임(초당 ~60번) 호출된다. 예전에는 호출될 때마다
// document.getElementById()를 6번씩 다시 조회하고, 실제로 화면에 보이는
// 값이 안 바뀌었어도(예: HP/MP가 가득 차서 정지 상태) style.width/
// textContent를 매번 다시 썼다 - 둘 다 불필요한 DOM 작업이다. 엘리먼트는
// 한 번만 조회해서 캐싱하고, 마지막으로 실제로 그린 문자열과 비교해서
// 달라졌을 때만 DOM에 쓴다.
const _hudEls = {
  hpFill: document.getElementById('hpFill'), hpText: document.getElementById('hpText'),
  shieldFill: document.getElementById('shieldFill'),
  mpFill: document.getElementById('mpFill'), mpText: document.getElementById('mpText'),
  resourceLabel: document.getElementById('resourceLabel'),
};
const _hudLast = { hpPct: '', hpText: '', shieldLeft: '', shieldWidth: '', shieldDisplay: '', mpFlow: null, mpWidth: '', mpText: '', label: '', worldHpPct: '', worldHpText: '', worldResourceWidth: '', worldResourceDisplay: '', worldResourceMode: '' };
function updateBars(ch) {
  const hpPct = `${(ch.hp / ch.maxHp) * 100}%`;
  if (_hudLast.hpPct !== hpPct) { _hudEls.hpFill.style.width = hpPct; _hudLast.hpPct = hpPct; }
  // 28차: 최대 체력이 소수(레벨 성장)일 때 소수점까지 나오던 것을 정수로 표시한다.
  const hpText = `${Math.ceil(ch.hp)}/${Math.round(ch.maxHp)}${ch.shield > 0 ? ` (+${Math.ceil(ch.shield)} 보호막)` : ''}`;
  if (_hudLast.hpText !== hpText) { _hudEls.hpText.textContent = hpText; _hudLast.hpText = hpText; }
  // 요청("챔피언한테도 hp바를 만들어줘") - 머리 위 월드 공간 체력바도
  // HUD와 동시에 갱신한다. 실제 LoL처럼 체력 비율에 따라 초록→노랑→빨강.
  // 요청 21/22(문서 4절) 원칙 그대로: 값이 실제로 바뀌었을 때만 DOM에 쓴다.
  if (ch.healthBarLabelDiv) {
    // 67차: 머리 위 바는 원작식 공용 바(champion_healthbar.js)가 그린다 - 체력 색은 바뀌지 않고(내 챔피언 초록), 보호막 흰 구간·
    // 100/1000 눈금·피해 잔상·레벨 칸·자원 바. 자원: 마나 챔피언은 MP, 마나가 없는 챔피언은 특수 자원(레넥톤 분노 / 세트 투지 /
    // 야스오 기류), 둘 다 없으면 숨김.
    let resourcePct = 0, resourceMode = 'hidden';
    if (ch.championId === 'renekton') {
      resourcePct = Math.max(0, Math.min(100, ch._renekton?.rage || 0)); resourceMode = 'rage';
    } else if (ch.championId === 'sett') {
      const cd = ch._champData ? ch._champData() : null;
      const maxFlow = cd ? ch.maxHp * (cd.W.gritMaxHpPercent / 100) : 0;
      const flow = (ch._sett && ch._sett.grit) || 0;
      resourcePct = maxFlow ? Math.max(0, Math.min(100, flow / maxFlow * 100)) : 0;
      resourceMode = maxFlow > 0 ? 'flow' : 'hidden';
    } else if (ch.championId === 'yasuo') {
      resourcePct = Math.max(0, Math.min(100, ch._yasuo ? ch._yasuo.flow : 0)); resourceMode = 'flow';
    } else if (Number(ch.maxMp) > 0) {
      resourcePct = Math.max(0, Math.min(100, (ch.mp / ch.maxMp) * 100)); resourceMode = 'mana';
    }
    updateChampBar(ch.healthBarLabelDiv, { hp: ch.hp, maxHp: ch.maxHp, shield: Math.max(0, ch.shield || 0), level: ch.champLevel ?? ch.level ?? 1, resPct: Math.round(resourcePct * 10) / 10, resMode: resourceMode });
  }
  // 요청: 보호막이 계산은 정상인데 화면에 아무 표시가 없어 "작동 안 하는
  // 것처럼" 보였다 - HP 바 뒤에 이어 붙는 빗금 무늬 세그먼트로 실제 보호막
  // 수치를 그대로 보여준다(최대체력 대비 %로 폭 계산).
  if (_hudEls.shieldFill) {
    const hpPctNum = (ch.hp / ch.maxHp) * 100;
    const shieldPct = ch.maxHp ? Math.max(0, Math.min(100 - hpPctNum, (ch.shield || 0) / ch.maxHp * 100)) : 0;
    const shieldLeft = `${hpPctNum}%`, shieldWidth = `${shieldPct}%`, shieldDisplay = shieldPct > 0.1 ? 'block' : 'none';
    if (_hudLast.shieldLeft !== shieldLeft) { _hudEls.shieldFill.style.left = shieldLeft; _hudLast.shieldLeft = shieldLeft; }
    if (_hudLast.shieldWidth !== shieldWidth) { _hudEls.shieldFill.style.width = shieldWidth; _hudLast.shieldWidth = shieldWidth; }
    if (_hudLast.shieldDisplay !== shieldDisplay) { _hudEls.shieldFill.style.display = shieldDisplay; _hudLast.shieldDisplay = shieldDisplay; }
  }
  // 요청(세트 패시브 문서 1/7/26.3): 세트는 마나가 없어(maxMp=0) 마나바
  // 자리에 0/0(NaN)이 그대로 표시되는 버그가 있었다. 세트일 때는 이 자리에
  // 마나 대신 투지(FLOW) 게이지를 표시한다 - 새 UI를 따로 만들지 않고
  // 기존 mp 바 자리를 재사용한다(요청 1 "기존 마나바 자리에 표시").
  const { mpFill, mpText, resourceLabel } = _hudEls;
  if (ch.championId === 'renekton') {
    if (_hudLast.mpFlow !== true) { mpFill.classList.add('flow'); _hudLast.mpFlow = true; }
    const rage = Math.max(0, Math.min(100, ch._renekton?.rage || 0));
    const mpWidth = `${rage}%`;
    if (_hudLast.mpWidth !== mpWidth) { mpFill.style.width = mpWidth; _hudLast.mpWidth = mpWidth; }
    const mpTextStr = `${Math.floor(rage)}/100`;
    if (_hudLast.mpText !== mpTextStr) { mpText.textContent = mpTextStr; _hudLast.mpText = mpTextStr; }
    if (resourceLabel && _hudLast.label !== 'RAGE') { resourceLabel.textContent = 'RAGE'; _hudLast.label = 'RAGE'; }
  } else if (ch.championId === 'sett') {
    if (_hudLast.mpFlow !== true) { mpFill.classList.add('flow'); _hudLast.mpFlow = true; }
    const cd = ch._champData ? ch._champData() : null;
    const maxFlow = cd ? ch.maxHp * (cd.W.gritMaxHpPercent / 100) : 0;
    const flow = (ch._sett && ch._sett.grit) || 0;
    const mpWidth = maxFlow ? `${(flow / maxFlow) * 100}%` : '0%';
    if (_hudLast.mpWidth !== mpWidth) { mpFill.style.width = mpWidth; _hudLast.mpWidth = mpWidth; }
    const mpTextStr = `${Math.round(flow)}/${Math.round(maxFlow)}`;
    if (_hudLast.mpText !== mpTextStr) { mpText.textContent = mpTextStr; _hudLast.mpText = mpTextStr; }
    if (resourceLabel && _hudLast.label !== 'FLOW') { resourceLabel.textContent = 'FLOW'; _hudLast.label = 'FLOW'; }
  } else if (ch.championId === 'yasuo') {
    if (_hudLast.mpFlow !== true) { mpFill.classList.add('flow'); _hudLast.mpFlow = true; }
    const flow = ch._yasuo ? ch._yasuo.flow : 0;
    const mpWidth = `${Math.max(0, Math.min(100, flow))}%`;
    if (_hudLast.mpWidth !== mpWidth) { mpFill.style.width = mpWidth; _hudLast.mpWidth = mpWidth; }
    const mpTextStr = `${Math.floor(flow)}/100`;
    if (_hudLast.mpText !== mpTextStr) { mpText.textContent = mpTextStr; _hudLast.mpText = mpTextStr; }
    if (resourceLabel && _hudLast.label !== 'FLOW') { resourceLabel.textContent = 'FLOW'; _hudLast.label = 'FLOW'; }
  } else {
    if (_hudLast.mpFlow !== false) { mpFill.classList.remove('flow'); _hudLast.mpFlow = false; }
    const mpWidth = `${(ch.mp / ch.maxMp) * 100}%`;
    if (_hudLast.mpWidth !== mpWidth) { mpFill.style.width = mpWidth; _hudLast.mpWidth = mpWidth; }
    const mpTextStr = `${Math.ceil(ch.mp)}/${ch.maxMp}`;
    if (_hudLast.mpText !== mpTextStr) { mpText.textContent = mpTextStr; _hudLast.mpText = mpTextStr; }
    if (resourceLabel && _hudLast.label !== 'MP') { resourceLabel.textContent = 'MP'; _hudLast.label = 'MP'; }
  }
}
function updateSkillUI(cooldowns) {
  for (const key of ['Q','W','E','R']) {
    const slot = document.getElementById('slot' + key);
    let cdEl = slot.querySelector('.cd');
    let chargesEl = slot.querySelector('.charges');
    // 버그 수정("E 쿨타임이 안 보인다" / "충전 횟수를 보이게 해줘"): 닐라 E는
    // 일반 단일 쿨다운이 아니라 "충전(2회)" 시스템이라, 실제 게임 로직은
    // this.cooldowns.E를 아예 쓰지 않고 항상 0으로 고정해둔다(_nilahCastE
    // 참고 - 충전 횟수/재충전 타이머가 별도로 가용 여부를 관리한다). 그래서
    // 이 공용 쿨다운 표시 루프만 보면 E는 "쿨다운 0 = 항상 준비 완료"로
    // 보였고, 다음 충전까지 얼마나 남았는지/충전이 몇 개 남았는지 전혀
    // 표시되지 않았다. 닐라 E일 때만 별도로 처리한다.
    if (key === 'E' && typeof controller !== 'undefined' && controller && controller.championId === 'nilah' && controller._nilah) {
      const n = controller._nilah;
      const maxCharges = controller._nilahData().E.maxCharges;
      const now = performance.now();
      const nextReadyAt = n.eRechargeAt.length ? Math.min(...n.eRechargeAt) : 0;
      const remaining = nextReadyAt > now ? (nextReadyAt - now) / 1000 : 0;
      if (!chargesEl) { chargesEl = document.createElement('div'); chargesEl.className = 'charges'; slot.appendChild(chargesEl); }
      chargesEl.textContent = `${n.eCharges}/${maxCharges}`;
      if (n.eCharges < maxCharges && remaining > 0) {
        if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd'; slot.appendChild(cdEl); }
        applySkillCooldownSweep(cdEl, 'E', remaining); // 51차: 원작처럼 시계 방향으로 걷히는 덮개
      } else if (cdEl) {
        cdEl.remove();
      }
      slot.classList.toggle('ready', n.eCharges > 0);
      slot.classList.remove('empowered');
      continue;
    }
    if (chargesEl) chargesEl.remove(); // 충전 배지는 닐라 E 전용 - 다른 슬롯/챔피언에는 남기지 않는다
    // 애쉬 Q(궁사의 집중): 쿨다운/마나가 항상 0이라(실제 제약은 4중첩
    // 확보) 아래 범용 쿨다운 표시만으로는 항상 "사용 가능"으로 보인다 -
    // 실제 집중 스택(0~4)을 그대로 배지로 보여주고, 4중첩을 채웠을 때만
    // 'ready'로 표시한다(닐라 E의 충전 배지와 동일한 .charges 요소 재사용).
    if (key === 'Q' && typeof controller !== 'undefined' && controller && controller.championId === 'ashe' && controller._ashe) {
      const maxStacks = (controller._champData().Q.maxStacks) || 4;
      const stacks = controller._ashe.focusStacks || 0;
      let stacksEl = document.createElement('div');
      stacksEl.className = 'charges';
      stacksEl.textContent = `${stacks}/${maxStacks}`;
      slot.appendChild(stacksEl);
      slot.classList.toggle('ready', stacks >= maxStacks);
      slot.classList.toggle('empowered', !!(performance.now() < (controller._ashe.qActiveUntil || 0)));
      continue;
    }
    const remaining = cooldowns[key];
    // 51차: 재시전 창(리 신 Q2·아리 R·럭스 E 등)이 열려 있으면 원작처럼 칸을 밝게(사용 가능) 두고 테두리 고리로 남은 시간을 보여 준다.
    // 강화 단계(야스오·요네 Q3 - keepCd)는 재사용 대기시간 덮개를 그대로 보여 준다.
    const recast = (typeof applySkillRecastUI === 'function' && typeof controller !== 'undefined' && controller) ? applySkillRecastUI(slot, key, controller) : null;
    if (remaining > 0 && !(recast && !recast.keepCd)) {
      if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd'; slot.appendChild(cdEl); }
      if (typeof applySkillCooldownSweep === 'function') applySkillCooldownSweep(cdEl, key, remaining);
      else cdEl.textContent = remaining >= 1 ? Math.ceil(remaining) : remaining.toFixed(1);
      slot.classList.remove('ready');
    } else {
      if (cdEl) cdEl.remove();
      slot.classList.add('ready');
    }
    if (typeof controller !== 'undefined' && controller && controller.championId === 'renekton' && ['Q','W','E'].includes(key)) {
      const empowered = (controller._renekton?.rage || 0) >= 50;
      slot.classList.toggle('empowered', empowered);
    } else slot.classList.remove('empowered');
  }
}

// 요청 8: "현재 레벨 / 현재 경험치 / 다음 레벨 필요 경험치 / 게이지 /
// 남은 스킬 포인트"를 체력바 근처에 표시한다. 값이 바뀔 때만 DOM에 쓰는
// 기존 updateBars() dirty-check 패턴을 그대로 따른다.
const _expUiLast = { levelText: '', pct: '', spText: '' };
function updateExpUI(champion) {
  if (!champion) return;
  const levelEl = document.getElementById('levelText');
  const fillEl = document.getElementById('xpFill');
  const spEl = document.getElementById('skillPointText');
  if (!levelEl || !fillEl) return;
  const maxed = champion.champLevel >= EXP_MAX_LEVEL;
  const levelText = `Lv.${champion.champLevel}`;
  if (_expUiLast.levelText !== levelText) { levelEl.textContent = levelText; _expUiLast.levelText = levelText; }
  const required = maxed ? 1 : getExpRequired(champion.champLevel);
  const pctNum = maxed ? 100 : Math.min(100, ((champion.currentExp || 0) / required) * 100);
  const pct = `${pctNum}%`;
  if (_expUiLast.pct !== pct) { fillEl.style.width = pct; _expUiLast.pct = pct; }
  fillEl.title = maxed ? 'MAX LEVEL' : `${Math.floor(champion.currentExp || 0)} / ${required}`;
  const sp = champion.skillPoints || 0;
  const spText = sp > 0 ? `+${sp}` : '';
  if (spEl && _expUiLast.spText !== spText) { spEl.textContent = spText; _expUiLast.spText = spText; }
  _updateSkillLevelUpButtons(champion);
}
// 34차: 스킬 포인트가 있으면 올릴 수 있는 스킬 칸 위에 레벨 업 버튼을 띄운다(원작처럼 - 키는 Ctrl+Q/W/E/R).
// levelUpSkill()과 같은 조건(최대 랭크, R은 레벨 11/16 제한)을 그대로 따진다.
function _updateSkillLevelUpButtons(champion) {
  const sp = champion.skillPoints || 0;
  for (const key of ['Q', 'W', 'E', 'R']) {
    const slot = document.getElementById('slot' + key);
    if (!slot) continue;
    const cur = (champion.skillLevels && champion.skillLevels[key]) || 0;
    const cap = key === 'R' ? 3 : 5;
    const gate = key === 'R' ? R_RANK_LEVEL_GATE[cur + 1] : null;
    const can = sp > 0 && cur < cap && !(gate && champion.champLevel < gate);
    let btn = slot.querySelector('.lvlUp');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'lvlUp';
      btn.textContent = '+'; // 56차: 원작처럼 칸 위의 작은 + 표시(예전 '▲ 레벨 업' 띠는 아이콘을 가렸다)
      btn.title = `Ctrl+${key}: ${key} 스킬 레벨 업`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof controller !== 'undefined' && controller && controller.levelUpSkill(key) && typeof renderLevelPanel === 'function') renderLevelPanel();
      });
      slot.appendChild(btn);
    }
    btn.style.display = can ? '' : 'none';
    // 랭크 표시(원작 스킬 칸 아래 점) - 칸마다 최대 랭크만큼.
    let pips = slot.querySelector('.rankPips');
    if (!pips) { pips = document.createElement('div'); pips.className = 'rankPips'; slot.appendChild(pips); }
    const sig = `${cur}/${cap}`;
    if (pips.dataset.sig !== sig) { pips.dataset.sig = sig; pips.innerHTML = Array.from({ length: cap }, (_, i) => `<span${i < cur ? ' class="on"' : ''}></span>`).join(''); }
  }
}
// 요청 8: "레벨업 시 시각적인 레벨업 효과... 화면을 가리지 않게 짧고
// 깔끔하게" - 텍스트 하나가 잠깐 떴다 사라지는 정도로 제한한다.
let _levelUpFxTimer = null;
function showLevelUpEffect(champion) {
  const el = document.getElementById('levelUpFx');
  if (!el) return;
  el.textContent = `LEVEL UP! Lv.${champion.champLevel}`;
  el.classList.add('show');
  clearTimeout(_levelUpFxTimer);
  _levelUpFxTimer = setTimeout(() => el.classList.remove('show'), 1100);
}

const debugPanelEl = document.getElementById('debugPanel');
let debugPanelVisible = true; // 요청 24: 토글 가능한 개발자용 디버그 패널

// STARTUP/ACTIVE/RECOVERY라는 내부 phase 이름은 그대로 두되(기존 구조 유지),
// 디버그 패널에는 요청서에서 쓰인 WINDUP/RELEASE/RECOVERY 용어로 보여준다.
function phaseDisplayLabel(phase) {
  return { STARTUP: 'WINDUP', ACTIVE: 'RELEASE', RECOVERY: 'RECOVERY', CHANNEL: 'CHANNEL' }[phase] || '-';
}
function stateDisplayLabel(ctrl) {
  if (ctrl.state === STATE.MOVE && ctrl.isChasing) return 'MOVE (CHASE)';
  return ctrl.state;
}

function updateDebugPanel() {
  if (!debugPanelVisible) { debugPanelEl.style.display = 'none'; return; }
  debugPanelEl.style.display = 'block';
  if (!controller) { debugPanelEl.textContent = 'GLB를 불러오면 여기에 상태가 표시됩니다. (F9: 패널 토글)'; return; }
  const targetName = controller.currentTarget ? (controller.currentTarget.hp > 0 ? '더미 타겟' : '(사망)') : '-';
  const action = controller.currentAction;
  const animTime = action ? `${action.time.toFixed(2)}/${action.getClip().duration.toFixed(2)}` : '-';

  const s = controller.stats;
  const finalMoveSpeed = getFinalMoveSpeed(s);
  const finalAtkSpeed = getFinalAttackSpeed(s);
  const atkInterval = getAttackInterval(s);
  const windup = getWindupDuration(s);
  const recovery = getRecoveryDuration(s);

  debugPanelEl.innerHTML =
`<span class="k">State</span>      : ${stateDisplayLabel(controller)}
<span class="k">Action</span>     : ${controller.currentActionKey ?? '-'}
<span class="k">Animation</span>  : ${controller.currentClipKey ?? '-'}
<span class="k">Anim Time</span>  : ${animTime}
<span class="k">Phase</span>      : ${phaseDisplayLabel(controller.currentPhase)}
<span class="k">Cancelable</span> : ${controller.phaseCancelable}
<span class="k">Target</span>     : ${targetName}
<span class="k">Combo</span>      : ${controller.comboIndex}
<span class="k">Gold</span>       : ${controller.gold || 0}
--- stats (F9 toggle) ---
<span class="k">MoveSpeed</span>  : ${finalMoveSpeed.toFixed(2)}
<span class="k">AtkDamage</span>  : ${s.attackDamage.toFixed(1)}
<span class="k">AtkSpeed</span>   : ${finalAtkSpeed.toFixed(2)}/s
<span class="k">AtkInterval</span>: ${atkInterval.toFixed(2)}s
<span class="k">AtkRange</span>   : ${s.attackRange.toFixed(2)}
<span class="k">Windup</span>     : ${windup.toFixed(2)}s
<span class="k">Recovery</span>   : ${recovery.toFixed(2)}s
<span class="k">Armor</span>      : ${s.armor.toFixed(0)}
<span class="k">MagicResist</span>: ${s.magicResist.toFixed(0)}
<span class="k">CritChance</span> : ${(s.critChance * 100).toFixed(0)}%
${distanceDebugText(controller)}
${masterYiDebugText(controller)}
${projectileDebugText()}`;
}

// Q 사거리 보강 문서 섹션 17/18: Q Cast Range(600)와 재등장 거리(75 계열)를
// 서로 다른 개념으로 명확히 분리해서 디버그 패널에 함께 표시한다. 표시
// 대상은 currentTarget이 있으면 그것을, 없으면 사거리 무관하게 가장 가까운
// 적을 후보로 써서 "지금 Q를 쓰면 맞는지"를 미리 확인할 수 있게 한다.
function masterYiQRangeDebugText(ctrl, cd) {
  if (!cd || !cd.Q) return '';
  const range = cd.Q.range;
  let candidate = (ctrl.currentTarget && ctrl.currentTarget.hp > 0) ? ctrl.currentTarget : null;
  if (!candidate) {
    const hits = findEnemiesInRadius(ctrl.root.position, Infinity);
    let nearest = null;
    for (const h of hits) { if (!nearest || h.distance < nearest.distance) nearest = h; }
    candidate = nearest ? nearest.unit : null;
  }
  if (!candidate) {
    return `<span class="k">Q Cast Range</span>: ${range} (대상 없음)`;
  }
  const center = getHorizontalDistanceOf(ctrl, candidate);
  const eff = getEffectiveDistance(ctrl, candidate);
  // isInRange()(중심 → 대상 가장자리: 중심 거리 <= 사거리 + 대상 반경)를 그대로
  // 재사용한다 - 별도 Q 전용 판정 함수를 새로 만들지 않는다(문서 4/19절).
  const inRange = isInRange(ctrl, candidate, range);
  return `<span class="k">Q Cast Range</span>: ${range}
<span class="k">Q Center Dist</span>: ${center.toFixed(1)}
<span class="k">Q Effective Dist</span>: ${eff.toFixed(1)}
<span class="k">Q In Range</span>  : ${inRange ? 'YES' : 'NO'}`;
}

// 요청 문서 1 섹션 30 / 문서 2 섹션 14: Alpha Strike 진행 상태와 패시브
// 4타 카운터를 개발 중 확인할 수 있는 디버그 텍스트. 마스터 이가 아니거나
// GLB에 챔피언 데이터가 없으면 빈 문자열(패널에서 조용히 생략).
// Phase 2 요청 19 "Debug" - Projectiles/Hits/Misses 카운터. 디버그 패널이
// 이미 100ms 스로틀(_debugPanelAccumMs)로 갱신되므로 여기서 추가 연산을
// 더 아낄 필요는 없다(요청 "디버그가 꺼져 있을 때 추가 연산이 과도하지
// 않도록" - 애초에 updateDebugPanel() 자체가 debugPanelVisible=false면
// 맨 위에서 즉시 return하므로 이 함수 호출까지 가지도 않는다).
function projectileDebugText() {
  const p = (typeof projectiles !== 'undefined') ? projectiles : null;
  if (!p) return '';
  return `--- projectiles ---
<span class="k">Projectiles</span>: ${p.projectiles.length}
<span class="k">Hits</span>      : ${p.totalHits || 0}
<span class="k">Misses</span>    : ${p.totalMisses || 0}`;
}
function masterYiDebugText(ctrl) {
  if (!ctrl || ctrl.championId !== 'masteryi' || !ctrl._masteryi) return '';
  const cd = ctrl._champData ? ctrl._champData() : null;
  const everyN = (cd && cd.passive && cd.passive.everyNAttacks) || 4;
  const stackNow = (ctrl._masteryi.attackCount || 0) % everyN;
  const dots = Array.from({ length: everyN }, (_, i) => (i < stackNow ? '●' : '○')).join('');
  const nextIsPassive = stackNow === everyN - 1 ? 'PASSIVE(4th)' : 'normal';
  const alpha = ctrl._masteryi.alpha;
  let alphaLines;
  if (!alpha) {
    alphaLines = `<span class="k">Q State</span>     : IDLE`;
  } else {
    const marked = alpha.markedTargets.filter(Boolean).map(unitLabel).join(', ') || '-';
    const primary = alpha.primaryTarget ? unitLabel(alpha.primaryTarget) : '-';
    const fmtVec = (v) => v ? `(${v.x.toFixed(1)}, ${v.z.toFixed(1)})` : '-';
    const dbg = alpha.debug || {};
    // Q 사거리 보강 문서 섹션 7/18: Primary Target Follow Distance -
    // Q 시작 당시 위치(primaryTargetInitialPosition) 대비 지금까지 실제로
    // 얼마나 이동했는지. maxPrimaryTargetFollowDistance(LoL 2000)는
    // castRange(600)와 전혀 다른 별개의 값이다(문서 9절 "숫자를 혼동하지 마라").
    const primaryValid = ctrl._masteryiIsValidAlphaTarget(alpha.primaryTarget);
    const followDist = (primaryValid && alpha.primaryTargetInitialPosition)
      ? getHorizontalDistance(alpha.primaryTargetInitialPosition, getWorldPosition(alpha.primaryTarget))
      : null;
    const maxFollowWorld = alpha.q.maxPrimaryTargetFollowDistance != null ? lolRangeToWorld(alpha.q.maxPrimaryTargetFollowDistance) : Infinity;
    alphaLines =
`<span class="k">Q State</span>     : ${alpha.phase} (hit ${alpha.hitIndex}/${alpha.maxHits})
<span class="k">Model Visible</span>: ${ctrl.model ? ctrl.model.visible : '-'}
<span class="k">Q Primary</span>   : ${primary}
<span class="k">Q Marked</span>    : ${marked}
<span class="k">Untargetable</span>: ${ctrl.isUntargetable}
<span class="k">Q Reemerge Dir</span>: ${alpha.reemergeDirection ? '지정됨(우클릭)' : '기본값'} (${alpha.canSelectExitDirection ? '선택 가능' : '잠김'})
<span class="k">Target Follow</span>: ${alpha.primaryTargetFollowLost ? 'LOST' : 'OK'}
<span class="k">Follow Distance</span>: World ${followDist != null ? followDist.toFixed(2) : '-'} / Max World ${maxFollowWorld === Infinity ? '∞' : maxFollowWorld.toFixed(2)} (LoL ${alpha.q.maxPrimaryTargetFollowDistance})
<span class="k">Reappear Distance</span>: LoL ${alpha.q.reappearDistance || 75} / World ${lolRangeToWorld(alpha.q.reappearDistance || 75).toFixed(2)}
<span class="k">RAW Reappear</span>: ${fmtVec(dbg.raw)}
<span class="k">SAFE Reappear</span>: ${fmtVec(dbg.safe)}
<span class="k">Collision Fix</span>: ${dbg.collisionCorrected ? 'YES' : '-'}
<span class="k">Used Fallback</span>: ${dbg.usedFallback ? 'YES' : '-'}`;
  }
  return `--- [Master Yi Debug] (F9) ---
<span class="k">Passive</span>    : ${dots} (${stackNow}/${everyN}, next=${nextIsPassive})
<span class="k">E (Wuju)</span>   : ${hasStatus(ctrl, 'MASTERYI_E') ? 'ACTIVE' : '-'}
<span class="k">R (Highlander)</span>: ${ctrl.isSubStateActive('R') ? 'ACTIVE' : '-'}
<span class="k">W (Meditate)</span>: ${ctrl.currentActionKey === 'masteryiW' ? `MEDITATING (초당 ${(ctrl._masteryi.wManaDrainPerSec || 0).toFixed(1)} 마나 소모)` : '-'}
${masterYiQRangeDebugText(ctrl, cd)}
${alphaLines}`;
}

// 요청 19: [Distance Debug] 패널. Range/Distance 시스템의 실제 값을
// F9 디버그 패널에서 바로 확인할 수 있게 한다 - 더미가 없으면 생략.
function distanceDebugText(ctrl) {
  if (typeof dummy === 'undefined' || !dummy) return '';
  const center = getHorizontalDistanceOf(ctrl, dummy);
  const eff = getEffectiveDistance(ctrl, dummy);
  const cd = ctrl._champData ? ctrl._champData() : null;
  const rangeOf = (slot) => {
    if (!cd || !cd[slot]) return null;
    const data = cd[slot];
    const lvl = Math.max(1, (ctrl.skillLevels && ctrl.skillLevels[slot]) || 1);
    if (data.range != null) return skillVal(data.range, lvl);
    if (data.range1 != null) return data.range1;
    if (data.rangeBase != null) return data.rangeBase + (data.rangePerStack || 0) * ((ctrl._chogath && ctrl._chogath.predationStacks) || 0);
    if (data.rangeMax != null) return data.rangeMax;
    return null;
  };
  // 버그 수정: castable()이 world-scale Effective Distance를 LoL 원본
  // range와 그대로 비교하고 있었다(실제 판정 함수 isInRange는 내부에서
  // lolRangeToWorld로 변환하는데, 디버그 표시만 변환 없이 비교해 실제
  // 판정과 디버그 값이 어긋날 수 있었다) - 여기도 동일하게 변환해서
  // "화면에 보이는 디버그 값 = 실제 판정에 쓰이는 값"이 되게 한다.
  const castable = (slot) => {
    const r = rangeOf(slot);
    if (r == null) return '-';
    return isInRange(ctrl, dummy, r) ? 'YES' : 'NO';
  };
  const attackLolRange = worldDistanceToLol(ctrl.stats ? ctrl.stats.attackRange : 0);
  const rangeLine = (label, slot) => {
    const lol = rangeOf(slot);
    if (lol == null) return `<span class="k">${label} Range</span>  : -`;
    return `<span class="k">${label} Range</span>  : LoL ${lol} / World ${lolRangeToWorld(lol).toFixed(2)} → ${castable(slot)}`;
  };
  return `--- [World Distance Debug] (F9) ---
<span class="k">World Scale</span>   : 1 LoL unit = ${WORLD_DISTANCE_SCALE.toFixed(4)} world unit
<span class="k">Player Radius</span>  : ${(ctrl.collisionRadius || 0).toFixed(2)}
<span class="k">Dummy Radius</span>   : ${(dummy.collisionRadius || dummy.radius || 0).toFixed(2)}
<span class="k">Center Dist</span>    : ${center.toFixed(2)} (LoL ${worldDistanceToLol(center).toFixed(0)})
<span class="k">Effective Dist</span>: ${eff.toFixed(2)} (LoL ${worldDistanceToLol(eff).toFixed(0)})
<span class="k">Attack Range</span>   : LoL ${attackLolRange.toFixed(0)} / World ${(ctrl.stats ? ctrl.stats.attackRange : 0).toFixed(2)} → ${isInAttackRange(ctrl, dummy) ? 'YES' : 'NO'}
${rangeLine('Q', 'Q')}
${rangeLine('W', 'W')}
${rangeLine('E', 'E')}
${rangeLine('R', 'R')}`;
}

