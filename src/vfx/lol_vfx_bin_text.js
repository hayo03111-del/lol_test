/* lol_vfx_bin_text.js — 89차: 원작 bin 데이터 읽기
 * 게임 파일의 skinN.bin을 사람이 읽을 수 있게 바꾼 두 형식을 같은 JS 객체로 읽는다.
 *  1) ritobin 텍스트(#PROP_text, `이름: 종류 = 값` 줄) - LtMAO·ritobin으로 변환한 .py/.txt
 *  2) CommunityDragon의 .bin.json - 객체에 "__type"이 붙은 JSON
 * 결과: 클래스 객체는 { __type: '클래스명', 필드: 값 }, 빈 pointer는 null, list/list2는 배열, option은 값 하나나 null,
 * map은 일반 객체(키는 문자열), vec2/3/4·rgba·mtx44는 숫자 배열, hash/link/file은 문자열.
 * 문법은 ritobin(moonshadow565/ritobin)의 bin_io_text_read.cpp와 같다: 공백·탭, 줄바꿈 또는 쉼표가 구분자, #부터 줄 끝은 주석.
 */
const LOL_BIN_PRIMITIVE_TYPES = new Set(['none', 'bool', 'i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64', 'f32', 'vec2', 'vec3', 'vec4', 'mtx44', 'rgba', 'string', 'hash', 'file', 'link', 'flag']);
const LOL_BIN_CONTAINER_TYPES = new Set(['list', 'list2', 'option', 'map', 'pointer', 'embed']);

class LolBinTextReader {
  constructor(text) { this.s = text; this.i = 0; }
  fail(msg) {
    const before = this.s.slice(0, this.i), line = before.split('\n').length, col = this.i - before.lastIndexOf('\n');
    throw new Error(`ritobin 텍스트 ${line}행 ${col}열: ${msg} (근처: ${JSON.stringify(this.s.slice(this.i, this.i + 40))})`);
  }
  eof() { return this.i >= this.s.length; }
  skipSpace() { while (!this.eof() && ' \t\r'.includes(this.s[this.i])) this.i++; }
  // 빈 줄·주석을 건너뛰고, 줄바꿈을 하나라도 지났으면 true
  skipNewlines() {
    let comment = false, nl = false;
    while (!this.eof()) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\r') this.i++;
      else if (c === '\n') { comment = false; nl = true; this.i++; }
      else if (c === '#') { comment = true; this.i++; }
      else if (comment) this.i++;
      else break;
    }
    return nl;
  }
  symbol(ch) { this.skipSpace(); if (this.s[this.i] === ch) { this.i++; return true; } return false; }
  expect(ch) { if (!this.symbol(ch)) this.fail(`'${ch}'가 와야 한다`); }
  word() {
    this.skipSpace();
    const b = this.i;
    while (!this.eof() && /[A-Za-z0-9_+\-.]/.test(this.s[this.i])) this.i++;
    return this.s.slice(b, this.i);
  }
  string() {
    this.skipSpace();
    const q = this.s[this.i];
    if (q !== '"' && q !== "'") return null;
    this.i++;
    let out = '';
    while (!this.eof()) {
      const c = this.s[this.i++];
      if (c === q) return out;
      if (c === '\\') {
        const e = this.s[this.i++];
        if (e === 'n') out += '\n'; else if (e === 't') out += '\t'; else if (e === 'r') out += '\r'; else if (e === '0') out += '\0';
        else if (e === 'x') { out += String.fromCharCode(parseInt(this.s.substr(this.i, 2), 16)); this.i += 2; }
        else if (e === 'u') { out += String.fromCharCode(parseInt(this.s.substr(this.i, 4), 16)); this.i += 4; }
        else out += e;
      } else out += c;
    }
    this.fail('따옴표가 닫히지 않았다');
  }
  // 종류: "f32", "list[pointer]", "map[hash,embed]", "option[f32]"
  type() {
    const name = this.word().toLowerCase();
    if (!LOL_BIN_PRIMITIVE_TYPES.has(name) && !LOL_BIN_CONTAINER_TYPES.has(name)) this.fail(`모르는 종류 '${name}'`);
    if (name === 'list' || name === 'list2' || name === 'option') { this.expect('['); const v = this.word().toLowerCase(); this.expect(']'); return { name, value: v }; }
    if (name === 'map') { this.expect('['); const k = this.word().toLowerCase(); this.expect(','); const v = this.word().toLowerCase(); this.expect(']'); return { name, key: k, value: v }; }
    return { name };
  }
  number() {
    const w = this.word();
    if (w === '') this.fail('숫자가 와야 한다');
    const n = /^[-+]?0x/i.test(w) ? parseInt(w, 16) : Number(w);
    if (!Number.isFinite(n) && !/^[-+]?(inf|nan)/i.test(w)) this.fail(`숫자가 아니다: ${w}`);
    return Number.isFinite(n) ? n : (/nan/i.test(w) ? NaN : (w.startsWith('-') ? -Infinity : Infinity));
  }
  numberArray(count) {
    this.expect('{'); this.skipNewlines();
    const arr = [];
    for (let k = 0; k < count; k++) {
      arr.push(this.number());
      this.skipSpace();
      if (this.s[this.i] === ',') this.i++;
      this.skipNewlines();
    }
    this.expect('}');
    return arr;
  }
  hashLike() {
    const s = this.string();
    if (s !== null) return s;
    const w = this.word();
    if (!/^0x[0-9a-f]+$/i.test(w)) this.fail(`해시는 따옴표 문자열이나 0x16진수여야 한다: ${w}`);
    return w.toLowerCase();
  }
  // { 항목들 } - 항목 사이는 줄바꿈이나 쉼표
  items(readItem) {
    this.expect('{'); this.skipNewlines();
    const out = [];
    if (this.symbol('}')) return out;
    for (;;) {
      out.push(readItem());
      if (this.symbol('}')) return out;
      const nl = this.skipNewlines();
      const comma = this.symbol(',');
      if (comma) this.skipNewlines();
      if (this.symbol('}')) return out;
      if (!nl && !comma) this.fail('항목 사이에 줄바꿈이나 쉼표가 와야 한다');
    }
  }
  fields() {
    const obj = {};
    for (const [k, v] of this.items(() => { const key = this.word() || this.hashLike(); this.expect(':'); const t = this.type(); this.expect('='); return [key, this.value(t)]; })) obj[k] = v;
    return obj;
  }
  value(t) {
    switch (t.name) {
      case 'none': this.word(); return null;
      case 'bool': case 'flag': { const w = this.word(); if (w !== 'true' && w !== 'false') this.fail(`true/false가 와야 한다: ${w}`); return w === 'true'; }
      case 'i8': case 'u8': case 'i16': case 'u16': case 'i32': case 'u32': case 'i64': case 'u64': case 'f32': return this.number();
      case 'vec2': return this.numberArray(2);
      case 'vec3': return this.numberArray(3);
      case 'vec4': return this.numberArray(4);
      case 'rgba': return this.numberArray(4);
      case 'mtx44': return this.numberArray(16);
      case 'string': { const s = this.string(); if (s === null) this.fail('문자열이 와야 한다'); return s; }
      case 'hash': case 'file': case 'link': return this.hashLike();
      case 'list': case 'list2': return this.items(() => this.value({ name: t.value }));
      case 'option': { const arr = this.items(() => this.value({ name: t.value })); return arr.length ? arr[0] : null; }
      case 'map': { const obj = {}; for (const [k, v] of this.items(() => { const key = this.value({ name: t.key }); this.expect('='); return [String(key), this.value({ name: t.value })]; })) obj[k] = v; return obj; }
      case 'pointer': case 'embed': {
        const name = this.word() || this.hashLike();
        if (t.name === 'pointer' && name === 'null') return null;
        const obj = this.fields();
        return Object.assign({ __type: name }, obj);
      }
      default: this.fail(`처리하지 못하는 종류 ${t.name}`);
    }
  }
  document() {
    const root = {};
    this.skipNewlines();
    while (!this.eof()) {
      const key = this.word() || this.hashLike();
      this.expect(':'); const t = this.type(); this.expect('=');
      root[key] = this.value(t);
      if (!this.skipNewlines() && !this.eof()) this.fail('최상위 항목 뒤에 줄바꿈이 와야 한다');
    }
    return root;
  }
}

// CommunityDragon JSON: 클래스 객체는 "__type"을 이미 갖고 있고, 해시 키는 "{1234abcd}" 꼴일 수 있다 - "0x1234abcd"로 맞춘다.
function lolBinNormalizeJson(v) {
  if (Array.isArray(v)) return v.map(lolBinNormalizeJson);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      const m = /^\{([0-9a-f]{8})\}$/i.exec(k);
      o[m ? '0x' + m[1].toLowerCase() : k] = lolBinNormalizeJson(val);
    }
    return o;
  }
  if (typeof v === 'string') { const m = /^\{([0-9a-f]{8})\}$/i.exec(v); return m ? '0x' + m[1].toLowerCase() : v; }
  return v;
}

// 텍스트든 JSON이든 받아서 { entries: { 경로: 객체 } } 모양으로 돌려준다.
function lolBinParse(textOrObject) {
  let root;
  if (typeof textOrObject === 'string') {
    const t = textOrObject.replace(/^﻿/, '');
    const head = t.trimStart();
    if (head.startsWith('{') || head.startsWith('[')) root = lolBinNormalizeJson(JSON.parse(t));
    else root = new LolBinTextReader(t).document();
  } else root = lolBinNormalizeJson(textOrObject);
  // ritobin 텍스트는 entries 아래에, CommunityDragon JSON은 최상위에 항목이 있다.
  const entries = root.entries && typeof root.entries === 'object' && !root.entries.__type ? root.entries : root;
  return { root, entries };
}

// 항목 중 VfxSystemDefinitionData만 이름(particleName·경로 끝·경로 전체)으로 찾을 수 있게 모은다.
function lolBinCollectVfxSystems(parsed) {
  const map = {};
  for (const [path, obj] of Object.entries(parsed.entries)) {
    if (!obj || obj.__type !== 'VfxSystemDefinitionData') continue;
    map[path] = obj;
    const last = path.split('/').pop();
    if (last && !(last in map)) map[last] = obj;
    if (obj.particleName && !(obj.particleName in map)) map[obj.particleName] = obj;
  }
  return map;
}
