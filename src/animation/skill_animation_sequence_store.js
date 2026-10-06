/* ============================================================
   0-A2. SKILL ANIMATION SEQUENCE STORE
   ------------------------------------------------------------
   "스킬 키 하나 = 애니메이션 하나"였던 기존 제한을 제거하기 위한 데이터
   저장소. Q/W/E/R 각각에 사용자가 원하는 개수만큼(0개 포함) 애니메이션
   Step({animation, startTime, endTime})을 순서대로 등록할 수 있다.
   특정 챔피언/애니메이션 이름을 절대 하드코딩하지 않는다 -- 챔피언별로
   이 저장소 인스턴스만 새로 만들면(championId만 바뀌면) 그대로 재사용된다.
   각 슬롯이 빈 배열이면(기본값) 기존의 자동/단일 클립 매핑(ChampionAbilityResolver
   기반 _castQ/_castW/_castE/_castR)으로 자연스럽게 폴백된다.
   ============================================================ */
class SkillAnimationSequenceStore {
  constructor(championId) {
    this.championId = championId || null;
    this.sequences = { Q: [], W: [], E: [], R: [] };
    this._loadFromStorage();
  }

  get(slot) { return this.sequences[slot] || []; }
  has(slot) { return (this.sequences[slot] || []).length > 0; }

  addStep(slot, step) {
    this.sequences[slot] = [...(this.sequences[slot] || []), step];
    this._saveToStorage();
  }
  removeStep(slot, index) {
    const arr = this.sequences[slot];
    if (!arr || index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    this._saveToStorage();
  }
  updateStep(slot, index, patch) {
    const arr = this.sequences[slot];
    if (!arr || !arr[index]) return;
    Object.assign(arr[index], patch);
    this._saveToStorage();
  }
  // dir: -1(위로) / +1(아래로). 화면에 보이는 순서 = 실제 실행 순서이므로,
  // 배열 자체의 순서를 바로 바꾼다 -- 렌더링은 항상 이 배열을 그대로 읽는다.
  moveStep(slot, index, dir) {
    const arr = this.sequences[slot];
    if (!arr) return;
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    this._saveToStorage();
  }

  _storageKey() { return `championSkillAnimSequences:${this.championId || '__unknown__'}`; }
  _loadFromStorage() {
    if (!this.championId) return;
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      for (const slot of ['Q', 'W', 'E', 'R']) {
        if (Array.isArray(parsed?.[slot])) this.sequences[slot] = parsed[slot];
      }
    } catch (e) { console.warn('[Storage] 스킬 애니메이션 시퀀스 불러오기 실패', e); }
  }
  _saveToStorage() {
    if (!this.championId) return;
    try { localStorage.setItem(this._storageKey(), JSON.stringify(this.sequences)); }
    catch (e) { console.warn('[Storage] 스킬 애니메이션 시퀀스 저장 실패', e); }
  }
}

