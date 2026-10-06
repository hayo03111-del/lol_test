/* ============================================================
   0-A3. CHAMPION ABILITY RESOLVER
   ------------------------------------------------------------
   AnimationRoleResolver(순수 이름/패턴 점수화) 위에 한 겹 더 얹어서
   Q/W/E/R 전용으로: 챔피언 DB(1~2순위) -> 정확한 스킬명 패턴(3순위)
   -> AnimationRoleResolver의 점수 기반 추론(4~5순위) 순서로 확정하고,
   각 결정에 confidence(신뢰도)와 source(근거)를 함께 기록한다
   (추가 수정사항 17). 사용자가 수동으로 재지정한 값은 항상 최우선
   이며 챔피언별로 localStorage에 저장/복원된다(추가 수정사항 18).
   ============================================================ */
class ChampionAbilityResolver {
  constructor(animResolver, championId) {
    this.anim = animResolver;
    this.championId = championId || null;
    this.overrides = {};        // role('q'..'r') -> 사용자가 강제 지정한 clip name
    this.overrideSource = {};   // role -> 'manual' when set via UI (vs restored from storage)
    this.picks = {};            // role -> { name, confidence(0~100), source }
    this._resolveAll();
    this._loadFromStorage();
  }

  _resolveAll() { for (const role of ['q', 'w', 'e', 'r']) this.picks[role] = this._resolveOne(role); }

  _resolveOne(role) {
    const roleKey = role.toUpperCase();
    const db = this.championId ? championAbilityDatabase[this.championId] : null;

    if (db && db[roleKey]) {
      for (const n of db[roleKey].animationNames || []) {
        if (this.anim.clipByName(n)) return { name: n, confidence: 100, source: 'db-exact' };
      }
      for (const pat of db[roleKey].animationPatterns || []) {
        const hit = this.anim.clips.find((c) => pat.test(c.name));
        if (hit) return { name: hit.name, confidence: 92, source: 'db-pattern' };
      }
    }

    for (const pat of exactSkillNamePatterns(roleKey)) {
      const hit = this.anim.clips.find((c) => pat.test(c.name));
      if (hit) return { name: hit.name, confidence: 85, source: 'name-pattern' };
    }

    const scored = this.anim.roles[role];
    if (scored && scored.length) {
      const top = scored[0];
      const usedFallback = !!this.anim.fallbackUsed[role];
      const base = Math.max(20, Math.min(78, Math.round((top.score / 120) * 78)));
      return { name: top.name, confidence: usedFallback ? Math.min(base, 35) : base, source: usedFallback ? 'fallback' : 'score' };
    }
    return { name: null, confidence: 0, source: 'none' };
  }

  namesFor(role) {
    const override = this.overrides[role];
    const pick = this.picks[role] || {};
    const rest = (this.anim.roles[role] || []).map((e) => e.name).filter((n) => n !== override && n !== pick.name);
    const chain = [];
    if (override) chain.push(override);
    if (pick.name && pick.name !== override) chain.push(pick.name);
    return [...chain, ...rest];
  }

  directionalNamesFor(role, dirKey) {
    if (this.overrides[role]) return this.namesFor(role); // 수동 지정 시 방향 자동인식보다 우선
    const dir = this.anim.directional[role];
    if (dir && dir[dirKey]) return [dir[dirKey], ...this.namesFor(role)];
    return this.namesFor(role);
  }

  confidenceFor(role) { return this.overrides[role] ? 100 : (this.picks[role]?.confidence ?? 0); }
  sourceFor(role) { return this.overrides[role] ? 'manual' : (this.picks[role]?.source ?? 'none'); }

  setOverride(role, clipName) {
    if (!clipName) delete this.overrides[role]; else this.overrides[role] = clipName;
    this._saveToStorage();
  }

  _storageKey() { return `championGlbMapping:${this.championId || '__unknown__'}`; }
  _loadFromStorage() {
    if (!this.championId) return;
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (raw) Object.assign(this.overrides, JSON.parse(raw));
    } catch (e) { console.warn('[Storage] 매핑 불러오기 실패', e); }
  }
  _saveToStorage() {
    if (!this.championId) return;
    try { localStorage.setItem(this._storageKey(), JSON.stringify(this.overrides)); }
    catch (e) { console.warn('[Storage] 매핑 저장 실패', e); }
  }
}

