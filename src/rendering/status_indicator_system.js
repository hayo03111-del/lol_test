/* ============================================================
   STATUS INDICATORS (25차 요청 "각 스킬에 따라서 추가적인 이팩트가 필요하거든? (예를 들면 요네와 야스오의 Q나 마이의
   패시브가 차는게 뜨는 표시) 실제 롤게임에서 어떻게 표현하는지 보고 그에 맞춰서 해줘")
   ------------------------------------------------------------
   원작 HUD가 상태를 보여 주는 네 가지 방식을 그대로 따른다(그림은 원작 아이콘을 쓰지 않고 직접 그린다 - 원작
   아이콘·이펙트 파일은 이 저장소에 넣지 않았다):
   1) 버프 바: 체력 바 위에 내 버프·디버프 아이콘이 줄지어 뜨고, 오른쪽 아래에 중첩 수, 아이콘 위에 남은 시간이
      시계 방향으로 줄어드는 그림자가 덮인다. 다 차서 다음 공격이 강화되면 테두리가 빛난다.
   2) 스킬 아이콘 변화: 야스오·요네 Q가 2중첩이면 Q 칸이 3타(회오리·돌진)로 바뀌고, 남은 시간 동안 칸 테두리가
      줄어든다. 리 신 Q 표식이 있으면 Q 칸이 2타(공명의 일격)로 바뀐다.
   3) 대상 머리 위 표식: 다리우스 출혈 5중첩 특수 표식(26차), 바루스 역병(1~3), 벡스 우울, 리 신 Q 음파, 이즈리얼 W 정기 표식을
      허수아비 체력 바 위에 띄운다.
   4) 내 챔피언 발밑 "준비됨" 효과: 야스오·요네 Q3, 마스터 이 이중 타격, 다리우스 녹서스의 힘, 모데카이저 패시브
      오라, 벡스 파멸이 준비되면 발밑에 도는 고리를 띄운다.
   상태 값은 각 챔피언 코드가 이미 들고 있는 것(_yasuo.qStacks 등)을 읽기만 한다 - 게임 규칙은 바꾸지 않는다.
   원작 화면을 영상으로 직접 대조하지 못했다(이 환경에서 영상·위키 접속 불가) - 표시 위치·색은 원작 HUD의 일반
   규칙을 따른 근사다(docs/KNOWN_LIMITATIONS.md 25차).
   ============================================================ */
const STATUS_TYPE_LABEL = {
  SLOW: ['둔화', 'debuff'], STUN: ['기절', 'debuff'], ROOT: ['속박', 'debuff'], SILENCE: ['침묵', 'debuff'], KNOCKUP: ['에어본', 'debuff'],
  ARMOR_SHRED: ['방깎', 'debuff'], MR_SHRED: ['마저깎', 'debuff'], DOT: ['지속피해', 'debuff'], FEAR: ['공포', 'debuff'], CHARM: ['매혹', 'debuff'],
  AS_BUFF: ['공속', 'buff'], MS_BUFF: ['이속', 'buff'], DAMAGE_REDUCTION: ['피해감소', 'buff'], TENACITY: ['강인함', 'buff'],
  GHOST: ['유체화', 'buff'], NILAH_GHOST: ['유체화', 'buff'], MASTERYI_R_AS: ['공속', 'buff'], LEESIN_W_VAMP: ['흡혈', 'buff'],
};
// 챔피언 전용 상태 id의 이름(위 종류 이름보다 우선)
const STATUS_ID_LABEL = {
  garenQ_ms: '결정타', garenW_dr: '용기', garenW_tenacity: '용기', ezrealRSF: '마력', leesinPassive_as: '연타', leesinW_vamp: '철갑',
};
const INDICATOR_HIDDEN_TYPES = new Set(['BLIGHT', 'SHIELD', 'MARK']);

// 내 챔피언의 전용 중첩·준비 상태(버프 바 아이콘). remain/total 단위는 초.
function championStatusEntries(c, now) {
  const out = [], sec = (ms) => Math.max(0, (ms - now) / 1000);
  const d = (typeof c._champData === 'function') ? c._champData() : null;
  switch (c.championId) {
    case 'yasuo': {
      const y = c._yasuo; if (!y) break;
      if (y.qStacks > 0 && y.qStackExpiresAt > now) out.push({ key: 'yasuoQ', label: '폭풍', stacks: y.qStacks, max: 2, remain: sec(y.qStackExpiresAt), ready: y.qStacks >= 2, color: '#7fd6ff' });
      if (y.eStacks > 0 && y.eStacksExpiresAt > now) out.push({ key: 'yasuoE', label: '질풍', stacks: y.eStacks, max: 4, remain: sec(y.eStacksExpiresAt), color: '#9fe3ff' });
      break;
    }
    case 'yone': {
      const y = c._yone; if (!y) break;
      if (y.qStacks > 0 && y.qStackExpiresAt > now) out.push({ key: 'yoneQ', label: '폭풍', stacks: y.qStacks, max: 2, remain: sec(y.qStackExpiresAt), ready: y.qStacks >= 2, color: '#8fb8ff' });
      break;
    }
    case 'masteryi': {
      const m = c._masteryi; if (!m) break;
      const n = (d && d.passive && d.passive.everyNAttacks) || 4;
      const st = (m.attackCount || 0) % n;
      if (st > 0) out.push({ key: 'yiP', label: '이중', stacks: st, max: n - 1, ready: st >= n - 1, color: '#f2c14e' });
      break;
    }
    case 'leesin': {
      const l = c._leesin, as = typeof getStatus === 'function' ? getStatus(c, 'leesinPassive_as') : null;
      if (l && l.passiveHitsLeft > 0) out.push({ key: 'leeP', statusId: 'leesinPassive_as', label: '연타', stacks: l.passiveHitsLeft, max: 2, remain: as && as.expiresAt > now ? sec(as.expiresAt) : null, total: as ? as.duration : null, color: '#ffd36b' });
      break;
    }
    case 'ashe': {
      const a = c._ashe; if (!a) break;
      if (a.focusStacks > 0) out.push({ key: 'asheF', label: '집중', stacks: a.focusStacks, max: 4, remain: a.focusExpiresAt > now ? sec(a.focusExpiresAt) : null, ready: a.focusStacks >= 4, color: '#9fdcff' });
      if (a.qActiveUntil > now) out.push({ key: 'asheQ', label: '다발', remain: sec(a.qActiveUntil), color: '#bfe9ff', ready: true });
      break;
    }
    case 'mordekaiser': {
      const m = c._morde; if (!m) break;
      if (m.auraExpiresAt > now) out.push({ key: 'mordeP', label: '어둠', remain: sec(m.auraExpiresAt), ready: true, color: '#7dff9a' });
      else if (m.hitStacks > 0 && (m.stacksExpireAt || 0) > now) out.push({ key: 'mordeP', label: '어둠', stacks: m.hitStacks, max: 3, remain: sec(m.stacksExpireAt), color: '#7dff9a' });
      break;
    }
    case 'darius': {
      const x = c._darius; if (x && x.empoweredUntil > now) out.push({ key: 'dariusM', label: '녹서스', remain: sec(x.empoweredUntil), ready: true, color: '#ff5a4a' });
      break;
    }
    case 'chogath': {
      const x = c._chogath; if (x && x.predationStacks > 0) out.push({ key: 'choR', label: '포식', stacks: x.predationStacks, color: '#b48cff' });
      break;
    }
    case 'garen': {
      if (c._garenCourageStacks > 0) out.push({ key: 'garenW', label: '용기', stacks: c._garenCourageStacks, color: '#ffd36b' });
      break;
    }
    case 'ahri': {
      const a = c._ahri; if (!a) break;
      if (a.passiveStacks > 0) out.push({ key: 'ahriP', label: '정기', stacks: a.passiveStacks, max: (d && d.passive && d.passive.maxStacks) || 9, color: '#ff9fd6' });
      if (a.rCharges > 0 && a.rReadyUntil > now) out.push({ key: 'ahriR', label: '질주', stacks: a.rCharges, max: 3, remain: sec(a.rReadyUntil), ready: true, color: '#ff9fd6' });
      break;
    }
    case 'vex': {
      const v = c._vex; if (!v) break;
      if (now >= (v.doomReadyAt || 0)) out.push({ key: 'vexP', label: '파멸', ready: true, color: '#b277ff' });
      else out.push({ key: 'vexP', label: '파멸', remain: sec(v.doomReadyAt), color: '#6c4a99', cooldown: true });
      break;
    }
    case 'varus': {
      const v = c._varus; if (v && v.lv && v.lv.until > now) out.push({ key: 'varusP', label: '복수', remain: sec(v.lv.until), color: '#c27bff' });
      break;
    }
    default: break;
  }
  return out;
}

// 스킬 칸 바뀜(원작: 같은 키의 다음 단계 스킬로 아이콘이 바뀐다)
function championSlotStates(c, now) {
  const s = {}, sec = (ms) => Math.max(0, (ms - now) / 1000);
  // 52차: 야스오·요네 Q3는 글자 대신 칸 그림이 바뀐다(hud_stats_ui.js applySkillRecastUI - assets/champion_icons/<id>/Q2.png).
  // 55차: 리 신 Q2도 글자 대신 칸 그림(Q2.png - 사용자가 준 원작 그림)이 바뀐다.
  return s;
}

// 대상 머리 위 표식(내 챔피언이 그 대상에게 남긴 것)
function unitMarkEntries(c, unit, now) {
  const out = [];
  if (!c || !unit) return out;
  // 26차 요청: 다리우스 출혈은 중첩 수를 보이지 않고, 5중첩이 되면(녹서스의 힘 발동 - 이후 평타·스킬은 바로 5중첩)
  // 대상 체력 바 위에 특수 표식만 띄운다.
  if (c.championId === 'darius' && c._darius) {
    const rec = c._darius.stacksOnTarget.get(unit);
    if (rec && rec.stacks >= 5 && (!rec.expiresAt || rec.expiresAt > now)) out.push({ kind: 'emblem', color: '#ff2a1f' });
  }
  if (c.championId === 'varus') {
    const rec = typeof getStatus === 'function' ? getStatus(unit, 'varusBlight') : null;
    if (rec && rec.stacks > 0 && rec.expiresAt > now) out.push({ kind: 'pips', n: rec.stacks, max: 3, color: '#b45cff', glyph: '◆', full: rec.stacks >= 3 });
  }
  if (c.championId === 'vex' && c._vex && (c._vex.gloom.get(unit) || 0) > now) out.push({ kind: 'tag', text: '우울', color: '#9b6bff' });
  // 27차: 야스오 질풍검 같은 대상 재사용 대기(원작 10/9/8/7/6초) - 남은 초를 띄운다.
  if (c.championId === 'yasuo' && c._yasuoETargetLockLeft) { const left = c._yasuoETargetLockLeft(unit); if (left > 0) out.push({ kind: 'tag', text: `E ${Math.ceil(left)}`, color: '#9aa7b4' }); }
  if (c.championId === 'leesin' && c._leesin && c._leesin.qMarkTarget === unit && c._leesin.qMarkExpiresAt > now) out.push({ kind: 'tag', text: '음파', color: '#ffd36b' });
  if (c.championId === 'ezreal' && c._ezreal && c._ezreal.markTarget === unit && c._ezreal.markExpiresAt > now) out.push({ kind: 'tag', text: '정기', color: '#ffcf5a' });
  return out;
}

// 발밑 "준비됨" 고리: 색과 이름
function championReadyAura(c, now) {
  if (c.championId === 'yasuo' && c._yasuo && c._yasuo.qStacks >= 2 && c._yasuo.qStackExpiresAt > now) return { color: 0x7fd6ff, spin: 5 };
  if (c.championId === 'yone' && c._yone && c._yone.qStacks >= 2 && c._yone.qStackExpiresAt > now) return { color: 0x8fb8ff, spin: 5 };
  if (c.championId === 'masteryi' && c._masteryi) {
    const d = c._champData(), n = (d && d.passive && d.passive.everyNAttacks) || 4;
    if ((c._masteryi.attackCount || 0) % n === n - 1) return { color: 0xf2c14e, spin: 3 };
  }
  if (c.championId === 'darius' && c._darius && c._darius.empoweredUntil > now) return { color: 0xff3b2e, spin: 2 };
  if (c.championId === 'mordekaiser' && c._morde && c._morde.auraExpiresAt > now) return { color: 0x6dff8e, spin: 1.5 };
  if (c.championId === 'vex' && c._vex && now >= (c._vex.doomReadyAt || 0)) return { color: 0xa36bff, spin: 1.2 };
  return null;
}

// 다리우스 출혈 5중첩 표식: 핏방울 안에 도끼날 두 개를 교차한 모양(직접 그린 그림 - 원작 이펙트 파일이 아니다).
const DARIUS_BLEED_EMBLEM_SVG = `<svg class="emblem" viewBox="0 0 32 32" aria-label="출혈 5중첩">
  <path d="M16 2 C16 2 5 14.5 5 21 a11 11 0 0 0 22 0 C27 14.5 16 2 16 2 Z" fill="#7a0d0a" stroke="#ff3b2e" stroke-width="1.6"/>
  <path d="M10.5 26 L21 13 M21.5 26 L11 13" stroke="#ffd2c9" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M19 11.2 l4.2 -1.3 -1.2 4.3 Z M13 11.2 l-4.2 -1.3 1.2 4.3 Z" fill="#ffd2c9"/>
</svg>`;

class StatusIndicatorSystem {
  constructor() {
    this._bar = null; this._barSig = ''; this._totals = new Map(); this._slotSig = {}; this._markSig = new WeakMap();
    this._aura = null; this._auraOwner = null; this._auraColor = null;
  }
  _ensureDom() {
    if (this._bar || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'status-indicator-ui';
    style.textContent = `
      #buffBar { position:fixed; left:96px; bottom:124px; z-index:11; display:flex; gap:4px; pointer-events:none; max-width:420px; flex-wrap:wrap-reverse; }
      #buffBar .buff { position:relative; width:30px; height:30px; border:1px solid #5d6b78; background:#141c24; color:#e8eef4;
        font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; overflow:hidden; text-shadow:0 1px 2px #000; }
      #buffBar .buff.debuff { border-color:#c0473f; }
      #buffBar .buff.ready { border-color:#ffd36b; box-shadow:0 0 8px rgba(255,211,107,.8); }
      #buffBar .buff.cooldown { opacity:.6; }
      #buffBar .buff .sweep { position:absolute; inset:0; background:conic-gradient(rgba(0,0,0,.62) var(--gone), transparent 0); }
      #buffBar .buff .lbl { position:relative; z-index:1; letter-spacing:-.5px; }
      #buffBar .buff .stk { position:absolute; right:1px; bottom:0; z-index:2; font-size:11px; color:#fff; }
      #buffBar .buff .bar { position:absolute; left:0; bottom:0; height:3px; z-index:1; }
      .skillSlot .slotState { position:absolute; left:3px; bottom:13px; font-size:10px; line-height:1; font-weight:800; color:#ffe9a8; text-shadow:0 0 3px #000, 0 1px 2px #000; z-index:3; white-space:nowrap; }
      .skillSlot .slotState small { display:none; } /* 51차: 단계 이름은 툴팁으로 - 칸 가운데 재사용 대기시간 숫자와 겹치지 않게 작은 "Q2/Q3" 꼬리표만 */
      .skillSlot.stateNext { border-color:#ffd36b; box-shadow:0 0 12px rgba(255,211,107,.75); }
      .skillSlot .slotTimer { position:absolute; inset:-1px; z-index:2; pointer-events:none;
        background:conic-gradient(#ffd36b var(--left), transparent 0); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; padding:2px; }
      .unitMarks { display:flex; justify-content:center; gap:2px; margin-bottom:1px; font-size:11px; line-height:1; text-shadow:0 0 3px #000, 0 1px 1px #000; }
      .unitMarks .tag { padding:0 3px; border:1px solid currentColor; border-radius:2px; font-size:9px; background:rgba(0,0,0,.55); font-weight:700; }
      .unitMarks .pip.off { opacity:.25; }
      .unitMarks .pip.full { filter:drop-shadow(0 0 3px currentColor); }
      .unitMarks .emblem { width:30px; height:30px; margin-bottom:2px; filter:drop-shadow(0 0 4px #ff2a1f) drop-shadow(0 0 8px rgba(255,42,31,.6)); animation:dariusEmblem 0.9s ease-in-out infinite alternate; }
      @keyframes dariusEmblem { from { transform:scale(.92); } to { transform:scale(1.08); } }
    `;
    document.head.appendChild(style);
    this._bar = document.createElement('div');
    this._bar.id = 'buffBar';
    document.body.appendChild(this._bar);
  }

  _entriesFor(c, now) {
    const list = championStatusEntries(c, now);
    for (const s of c.statusEffects || []) {
      if (!s || s.expiresAt <= now || INDICATOR_HIDDEN_TYPES.has(s.type)) continue;
      if (list.some((e) => e.statusId === s.id)) continue;
      const t = STATUS_TYPE_LABEL[s.type];
      const label = STATUS_ID_LABEL[s.id] || (t && t[0]);
      if (!label) continue;
      list.push({ key: 's:' + s.id, statusId: s.id, label, stacks: s.stacks > 1 ? s.stacks : null, remain: (s.expiresAt - now) / 1000, total: s.duration, debuff: !!(t && t[1] === 'debuff') });
    }
    return list;
  }

  _renderBar(c, now) {
    const list = this._entriesFor(c, now);
    const parts = list.map((e) => {
      let total = e.total;
      if (e.remain != null && !total) {
        const prev = this._totals.get(e.key);
        total = (!prev || e.remain > prev + 0.05) ? e.remain : prev; // 갱신(시간이 늘어남)되면 그때 남은 시간을 전체로
        this._totals.set(e.key, total);
      }
      const gone = e.remain != null && total > 0 ? Math.min(1, Math.max(0, 1 - e.remain / total)) : 0;
      const cls = ['buff', e.debuff ? 'debuff' : '', e.ready ? 'ready' : '', e.cooldown ? 'cooldown' : ''].join(' ');
      const stk = e.stacks != null ? `<span class="stk">${e.stacks}</span>` : '';
      const bar = e.max ? `<span class="bar" style="width:${Math.round(100 * Math.min(1, e.stacks / e.max))}%;background:${e.color || '#9fdcff'}"></span>` : '';
      return `<div class="${cls}" data-key="${e.key}" style="${e.color ? `color:${e.color}` : ''}"><span class="sweep" style="--gone:${(gone * 360).toFixed(0)}deg"></span><span class="lbl">${e.label}</span>${stk}${bar}</div>`;
    });
    const sig = parts.join('');
    if (sig !== this._barSig) { this._bar.innerHTML = sig; this._barSig = sig; }
    for (const k of [...this._totals.keys()]) if (!list.some((e) => e.key === k)) this._totals.delete(k);
    return list;
  }

  _renderSlots(c, now) {
    const states = championSlotStates(c, now);
    for (const key of ['Q', 'W', 'E', 'R']) {
      const slot = document.getElementById('slot' + key);
      if (!slot) continue;
      const st = states[key];
      const sig = st ? `${st.text}|${Math.round((st.remain || 0) * 10)}` : '';
      if (this._slotSig[key] === sig) continue;
      this._slotSig[key] = sig;
      let lbl = slot.querySelector('.slotState');
      const oldTimer = slot.querySelector('.slotTimer'); if (oldTimer) oldTimer.remove(); // 51차: 남은 시간 고리는 hud_stats_ui.js의 재시전 고리(.recastRing)로 통일
      if (!st) { if (lbl) lbl.remove(); slot.classList.remove('stateNext'); continue; }
      if (!lbl) { lbl = document.createElement('div'); lbl.className = 'slotState'; slot.appendChild(lbl); }
      const [head, ...rest] = st.text.split(' ');
      lbl.innerHTML = `${head}<small>${rest.join(' ')}</small>`;
      lbl.title = st.text;
    }
  }

  _renderMarks(c, now) {
    const units = typeof getAllEnemyUnits === 'function' ? getAllEnemyUnits() : [];
    for (const u of units) {
      if (!u || !u.labelDiv || !u.isChampion) continue;
      const marks = unitMarkEntries(c, u, now);
      const sig = JSON.stringify(marks);
      if (this._markSig.get(u) === sig) continue;
      this._markSig.set(u, sig);
      let el = u.labelDiv.querySelector('.unitMarks');
      if (!marks.length) { if (el) el.remove(); continue; }
      if (!el) { el = document.createElement('div'); el.className = 'unitMarks'; u.labelDiv.insertBefore(el, u.labelDiv.firstChild); }
      el.innerHTML = marks.map((m) => m.kind === 'emblem' ? DARIUS_BLEED_EMBLEM_SVG : m.kind === 'tag'
        ? `<span class="tag" style="color:${m.color}">${m.text}</span>`
        : Array.from({ length: m.max }, (_, i) => `<span class="pip${i < m.n ? '' : ' off'}${m.full ? ' full' : ''}" style="color:${m.color}">${m.glyph}</span>`).join('')).join('');
    }
  }

  _renderAura(c, now, dt) {
    const want = championReadyAura(c, now);
    if (this._aura && (this._auraOwner !== c || !want || this._auraColor !== want.color)) {
      if (this._aura.parent) this._aura.parent.remove(this._aura);
      this._aura.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      this._aura = null; this._auraOwner = null; this._auraColor = null;
    }
    if (!want || !c.root) return;
    if (!this._aura) {
      const g = new THREE.Group();
      const r = Math.max(0.35, (c.collisionRadius || 0.5) * 1.15);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 40, 1, i * Math.PI * 2 / 3, Math.PI * 0.42),
          new THREE.MeshBasicMaterial({ color: want.color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; g.add(m);
      }
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 32),
        new THREE.MeshBasicMaterial({ color: want.color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; g.add(glow);
      g.position.y = 0.06; g.renderOrder = 3;
      c.root.add(g);
      this._aura = g; this._auraOwner = c; this._auraColor = want.color;
    }
    this._aura.rotation.y += (want.spin || 2) * dt;
    const pulse = 0.6 + 0.25 * Math.sin(now / 180);
    this._aura.children.forEach((m, i) => { if (i < 3) m.material.opacity = pulse; });
  }

  update(c, dt) {
    if (!c) return;
    this._ensureDom();
    if (!this._bar) return;
    const now = performance.now();
    // DOM은 초당 약 20번만 갱신한다(남은 시간 그림자는 이 정도면 충분히 부드럽다). 발밑 고리는 매 프레임.
    this._domAccum = (this._domAccum || 0) + (dt || 0);
    if (this._domAccum >= 0.05 || this._domOwner !== c) {
      this._domAccum = 0; this._domOwner = c;
      this._renderBar(c, now);
      this._renderSlots(c, now);
      this._renderMarks(c, now);
    }
    this._renderAura(c, now, dt || 0);
  }
}
const statusIndicators = new StatusIndicatorSystem();
