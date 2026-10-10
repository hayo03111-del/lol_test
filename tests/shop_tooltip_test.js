// Verifies the QA fix to _itemStatsSummary() (src/core/global_system_instances.js):
// before this round, several fully-implemented item passives (Dark Seal's
// Glory, Cull's Harvest, Doran's Ring/Shield regen, Tear of Goddess mana
// circulation, Boots of Greed's Slaughter, Catalyst's mana-spent heal,
// Slightly Magical Boots' carryover) were completely invisible in the shop
// tooltip even though the backend logic worked - a player had no way to see
// what these items actually did beyond their flat stat lines.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

// 버그 수정(QA - "버그/미구현 확인"): 이 테스트는 원래 _itemStatsSummary()를
// global_system_instances.js에서 손으로 복사해 둔 스냅샷 파일(세션
// 스크래치패드의 절대 경로, /tmp/claude-0/.../_itemStatsSummary_extracted.js)을
// 읽고 있었다 - 두 가지 문제가 있었다: (1) 그 경로는 이 세션의 임시
// 디렉터리라 다른 체크아웃/세션에서는 파일 자체가 없어 테스트가 ENOENT로
// 깨졌고, (2) 설사 파일이 있어도 그 스냅샷은 parts.push() 67줄짜리 아주
// 오래된 버전(현재 실제 함수는 148줄)이라 최근 라운드에서 추가된 거의
// 모든 아이템 설명을 전혀 검증하지 못하는 죽은 테스트였다. 이제 실제
// 소스(global_system_instances.js)에서 함수 본문을 직접 중괄호 매칭으로
// 잘라내 쓴다 - 이 파일 전체를 그냥 실행하지 않는 이유는 최상위에
// `new VFXSystem(scene)` 같은 부수효과 코드가 있어 DOM/THREE 전체를
// 스텁해야 하기 때문이다(_itemStatsSummary 자신은 ITEM_DATA만 참조하는
// 순수 함수라 이렇게 분리해도 동작이 완전히 동일하다).
function extractFunctionSource(fileSrc, signature) {
  const start = fileSrc.indexOf(signature);
  if (start === -1) throw new Error(`함수 시그니처를 찾지 못했습니다: ${signature}`);
  let depth = 0, end = -1;
  for (let i = start; i < fileSrc.length; i++) {
    if (fileSrc[i] === '{') depth++;
    else if (fileSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error(`함수의 닫는 중괄호를 찾지 못했습니다: ${signature}`);
  return fileSrc.slice(start, end);
}

const context = vm.createContext({ console });
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const giSrc = fs.readFileSync(path.join(ROOT, 'src/core/global_system_instances.js'), 'utf8');
const fnSrc = extractFunctionSource(giSrc, 'function _itemStatsSummary(item) {');
vm.runInContext(itemDataSrc + '\n' + fnSrc + `
this.ITEM_DATA = ITEM_DATA;
this._itemStatsSummary = _itemStatsSummary;
`, context);
const { ITEM_DATA, _itemStatsSummary } = context;

const cases = [
  ['darkSeal', /영광/, 'Dark Seal tooltip mentions its Glory (영광) stacking passive'],
  ['cull', /수확/, "Cull's tooltip mentions its Harvest (수확) gold passive"],
  ['doransRing', /흡수/, "Doran's Ring tooltip mentions its mana regen (흡수) passive"],
  ['doransShield', /인내의 집중력/, "Doran's Shield tooltip mentions its regen (인내의 집중력) passive"],
  ['tearOfGoddess', /마나순환/, "Tear of Goddess tooltip mentions its mana circulation (마나순환) passive"],
  ['bootsOfGreed', /학살/, "Boots of Greed tooltip mentions its Slaughter (학살) stacking vamp passive"],
  ['catalystOfAeons', /영원/, "Catalyst of Aeons tooltip mentions its mana-spent heal (영원) sub-passive"],
  ['slightlyMagicalBoots', /이동 속도.*유지/, "Slightly Magical Boots tooltip mentions the move-speed-carries-over-on-upgrade mechanic"],
  ['embersOfFate', /몬스터/, "Embers of Fate tooltip mentions the stronger monster(minion) burn damage"],
  // 전설급 2차분(삼위일체~지배자의 피갑옷) 툴팁 점검.
  ['trinityForce', /주문 검/, 'Trinity Force tooltip mentions its spellblade passive'],
  ['trinityForce', /가속/, 'Trinity Force tooltip mentions its on-hit move speed (가속) passive'],
  ['bladeOfTheRuinedKing', /안개의 검/, "Blade of the Ruined King tooltip mentions Mist's Edge"],
  ['bladeOfTheRuinedKing', /할퀴는 그림자/, 'Blade of the Ruined King tooltip mentions Scurrying Strike'],
  ['eclipse', /늘 떠오르는 달/, 'Eclipse tooltip mentions Ever Rising Moon'],
  ['manamune', /경탄/, 'Manamune tooltip mentions Awe'],
  ['manamune', /변신/, 'Manamune tooltip mentions it transforms into Muramana'],
  ['muramana', /충격/, 'Muramana tooltip mentions Shock'],
  ['maw', /생명선/, 'Maw of Malmortius tooltip mentions Lifeline'],
  ['shojinSpear', /집중된 의지/, "Spear of Shojin tooltip mentions Focused Will"],
  ['hullbreaker', /선장/, 'Hullbreaker tooltip mentions Captain passive'],
  ['blackCleaver', /깎아내기/, 'Black Cleaver tooltip mentions Carve (armor shred)'],
  ['blackCleaver', /열정/, 'Black Cleaver tooltip mentions Rage (move speed)'],
  ['divineSunderer', /라이트쉴드 타격/, 'Divine Sunderer tooltip mentions Lightshield Strike'],
  ['overlordsBloodmail', /폭정/, "Overlord's Bloodmail tooltip mentions Tyranny"],
  ['overlordsBloodmail', /응징/, "Overlord's Bloodmail tooltip mentions Vengeance"],
];
for (const [id, pattern, msg] of cases) {
  const summary = _itemStatsSummary(ITEM_DATA[id]);
  assert(pattern.test(summary), msg + ` (got: "${summary}")`);
}

// Regression: previously-working descriptions must still be present (no accidental removal).
const executioner = _itemStatsSummary(ITEM_DATA.executionersCalling);
assert(/그리버스/.test(executioner), "Executioner's Calling still mentions grievous wounds (no regression)");
const tiamatSummary = _itemStatsSummary(ITEM_DATA.tiamat);
assert(/쪼개기/.test(tiamatSummary) && /초승달/.test(tiamatSummary), 'Tiamat still mentions both cleave and its active ability (no regression)');

console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
