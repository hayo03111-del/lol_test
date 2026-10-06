/* ============================================================
   0-A. ANIMATION ROLE RESOLVER
   ------------------------------------------------------------
   Takes the raw AnimationClip[] from whatever GLB was loaded and
   scores every clip name against a set of role patterns (IDLE,
   MOVE, ATTACK, Q, W, E, R, ...). The clip with the highest score
   for a role wins; ties/near-ties are all kept (sorted) so a role
   can hold multiple clips (e.g. Attack1/Attack2/Attack3 combo).
   This never throws on a "wrong" GLB -- worst case a role simply
   comes back empty and the caller falls back gracefully (추가
   수정사항 8/18), and everything can still be corrected by hand
   from the "애니메이션 역할 매핑" panel (추가 수정사항 9/27).
   ============================================================ */
// 요청(실제 5개 챔피언 glb 검증 결과 반영): 기존 \bword\b 스타일 패턴은
// "밑줄/숫자가 단어 바로 옆에 붙은" 실제 라이엇 클립명(Idle1_Base,
// Spell3_0, Spell1_A, masteryi_2013_crit.anm, respawn_part1.anm 등)에서
// \b(단어 경계) 판정이 깨져 아예 매칭 실패하는 사례가 다수 발견됐다
// (가렌 idle/W/E/R/respawn, 세트 Q/R, 마스터 이 idle/crit/recall, 모데
// 카이저 respawn이 전부 이 문제였음). \b가 필요한 엄격한 패턴은 "정확히
// 이 이름일 때 더 높은 점수"용으로 남기고, 그 아래에 경계 없이 부분
// 문자열만 확인하는 관대한 패턴을 점수를 낮춰 추가해 실제 이름 어디에
// 있든 최소한 인식은 되도록 했다(점수는 항상 최댓값을 취하므로 관대한
// 패턴을 추가해도 기존의 더 정확한 매칭 우선순위는 그대로 유지된다).
const ROLE_DEFS = [
  // idle/move: "밑줄 바로 옆" 문제뿐 아니라 "Idle1_Base"처럼 숫자가 idle과
  // base 사이에 끼어드는 경우까지 있어 \d*를 허용했고, Haste/Fast/Slow/
  // Homeguard 같은 버프 전용 이동 변형이 기본 Run/Walk보다 먼저 뽑히지
  // 않도록 "_base" 접미사 패턴에 가장 높은 점수를 줬다(실측: 가렌/세트
  // 둘 다 Run_Base가 있는데도 haste 패턴 점수가 더 높아서 Run_Haste가
  // 기본 이동 클립으로 잘못 뽑히고 있었음).
  { role:'idle',    patterns:[[/idle\d*[_ ]?loop/i,120],[/idle\d*[_ ]?base/i,115],[/idle[_ ]?in/i,90],[/\bidle\b/i,100],[/idle/i,95],[/\bstand\b/i,70],[/\bbase\b/i,35]] },
  { role:'move',    patterns:[[/run\d*[_ ]?base/i,115],[/walk\d*[_ ]?base/i,115],[/\brun\b/i,100],[/\bwalk\b/i,90],[/\bjog\b/i,85],[/\bsprint\b/i,80],[/\bmove\b/i,70],[/locomotion/i,70],[/run/i,65],[/walk/i,60],[/haste/i,50]] },
  { role:'attack',  patterns:[[/basic[_ ]?attack/i,110],[/auto[_ ]?attack/i,105],[/\baa\b/i,90],[/attack[_ ]?\d*/i,100],[/\bswing\b/i,65],[/\bshoot\b/i,65],[/\bfire\b/i,50]] },
  { role:'crit',    patterns:[[/\bcrit(ical)?\b/i,105],[/crit/i,100]] },
  // 마스터 이 패시브(2연속 공격) 4타 전용 클립(masteryi_2013_passive.anm 등).
  // "GLB 패시브 4타 연동" 요청 문서 1/2/17절 - 인덱스로 추측하지 않고 반드시
  // 이름으로 찾는다. 없는 챔피언은 그냥 빈 배열로 남고(에러 없음), 4타는
  // 기존처럼 attack1/2 애니메이션을 그대로 사용한다(폴백).
  { role:'passive', patterns:[[/\bpassive\b/i,105],[/passive/i,100]] },
  { role:'q',       patterns:[[/^spell1$/i,115],[/spell[_ ]?1\b/i,110],[/spell[_ ]?1/i,100],[/ability[_ ]?1\b/i,100],[/cast[_ ]?1\b/i,95],[/skill[_ ]?1\b/i,90],[/^q[_ ]/i,80],[/[_ ]q$/i,75],[/^q$/i,80]] },
  { role:'w',       patterns:[[/^spell2$/i,115],[/spell[_ ]?2\b/i,110],[/spell[_ ]?2/i,100],[/ability[_ ]?2\b/i,100],[/cast[_ ]?2\b/i,95],[/skill[_ ]?2\b/i,90],[/^w[_ ]/i,80],[/[_ ]w$/i,75],[/^w$/i,80]] },
  { role:'e',       patterns:[[/^spell3$/i,115],[/spell[_ ]?3\b/i,110],[/spell[_ ]?3/i,100],[/ability[_ ]?3\b/i,100],[/cast[_ ]?3\b/i,95],[/skill[_ ]?3\b/i,90],[/^e[_ ]/i,80],[/[_ ]e$/i,75],[/^e$/i,80]] },
  { role:'r',       patterns:[[/\bultimate\b/i,115],[/\bult\b/i,105],[/^spell4$/i,115],[/spell[_ ]?4\b/i,110],[/spell[_ ]?4/i,100],[/ability[_ ]?4\b/i,100],[/cast[_ ]?4\b/i,95],[/skill[_ ]?4\b/i,90],[/^r[_ ]/i,80],[/[_ ]r$/i,75],[/^r$/i,80]] },
  { role:'channel', patterns:[[/\bchannel\b/i,100],[/wind[_ ]?up/i,95],[/wndup/i,95]] },
  { role:'recall',  patterns:[[/\brecall\b/i,110],[/recall/i,100],[/\bteleport\b/i,70],[/\bback\b/i,35]] },
  { role:'death',   patterns:[[/\bdeath\b/i,110],[/\bdie\b/i,100]] },
  { role:'respawn', patterns:[[/\brespawn\b/i,110],[/respawn/i,100],[/\brevive\b/i,100]] },
  { role:'taunt',   patterns:[[/\btaunt\b/i,105],[/taunt/i,100]] },
  { role:'joke',    patterns:[[/\bjoke\b/i,105],[/joke/i,100]] },
  { role:'laugh',   patterns:[[/\blaugh\b/i,105],[/laugh/i,100]] },
  { role:'dance',   patterns:[[/\bdance\b/i,105],[/dance/i,100]] },
];

const DIR_PATTERNS = {
  left:    /\bleft\b/i,
  right:   /\bright\b/i,
  forward: /\bforward\b|\bfwd\b/i,
  back:    /\bback(ward)?\b/i,
};

function scoreClipForRole(name, role) {
  const def = ROLE_DEFS.find(d => d.role === role);
  if (!def) return 0;
  let score = 0;
  for (const [re, pts] of def.patterns) if (re.test(name)) score = Math.max(score, pts);
  return score;
}

class AnimationRoleResolver {
  constructor(clips) {
    this.clips = clips || [];
    this.roles = {};        // role -> [{name, clip, duration, score}] sorted desc
    this.directional = {};  // role -> {left,right,forward,back} clip name
    this.overrides = {};    // role -> forced clip name (manual mapping wins over auto)
    this.fallbackUsed = {}; // role -> true if a generic keyword fallback had to be used
    this._analyze();
  }

  _analyze() {
    for (const def of ROLE_DEFS) {
      const scored = this.clips
        .map(c => ({ name: c.name, clip: c, duration: c.duration, score: scoreClipForRole(c.name, def.role) }))
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score);
      this.roles[def.role] = scored;
    }
    for (const role of ['q', 'w', 'e', 'r']) {
      const candidates = this.roles[role];
      if (!candidates.length) continue;
      const dir = {};
      for (const [key, re] of Object.entries(DIR_PATTERNS)) {
        const hit = candidates.find(c => re.test(c.name));
        if (hit) dir[key] = hit.name;
      }
      if (Object.keys(dir).length >= 2) this.directional[role] = dir;
    }
    this._applyFallbacks();
  }

  // 추가 수정사항 8/18: 역할을 못 찾으면 에러를 내지 않고 일반적인
  // ability/spell/cast/skill/action 이름 패턴으로 재검색하고, 그마저도
  // 없으면 idle로 대체한다. fallbackUsed에 기록해 UI에 경고를 띄운다.
  _applyFallbacks() {
    const genericAbility = [/\bability\b/i, /\bspell\b/i, /\bcast\b/i, /\baction\b/i, /\bskill\b/i];
    const usedNames = new Set();
    for (const role of Object.keys(this.roles)) for (const e of this.roles[role]) usedNames.add(e.name);

    for (const role of ['q', 'w', 'e', 'r']) {
      if (this.roles[role].length) continue;
      const pool = this.clips.filter(c => !usedNames.has(c.name) && genericAbility.some(re => re.test(c.name)));
      if (pool.length) {
        this.roles[role] = pool.map(c => ({ name: c.name, clip: c, duration: c.duration, score: 20 }));
        this.fallbackUsed[role] = true;
        pool.forEach(c => usedNames.add(c.name));
      }
    }
    if (!this.roles.attack.length) {
      const idle = this.roles.idle[0];
      if (idle) { this.roles.attack = [{ ...idle, score: 1 }]; this.fallbackUsed.attack = true; }
    }
    if (!this.roles.move.length) {
      const idle = this.roles.idle[0];
      if (idle) { this.roles.move = [{ ...idle, score: 1 }]; this.fallbackUsed.move = true; }
    }
  }

  namesFor(role) {
    const list = (this.roles[role] || []).map(e => e.name);
    const override = this.overrides[role];
    if (override) return [override, ...list.filter(n => n !== override)];
    return list;
  }

  directionalNamesFor(role, dirKey) {
    if (this.overrides[role]) return this.namesFor(role); // manual override wins outright
    const dir = this.directional[role];
    if (dir && dir[dirKey]) return [dir[dirKey], ...this.namesFor(role)];
    return this.namesFor(role);
  }

  bestName(role) {
    const names = this.namesFor(role);
    return names.length ? names[0] : null;
  }

  clipByName(name) { return this.clips.find(c => c.name === name) || null; }

  setOverride(role, clipName) {
    if (!clipName) delete this.overrides[role];
    else this.overrides[role] = clipName;
  }
}

