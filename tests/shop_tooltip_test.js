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

const context = vm.createContext({ console });
const itemDataSrc = fs.readFileSync(path.join(ROOT, 'src/champions/item_data.js'), 'utf8');
const fnSrc = fs.readFileSync('/tmp/claude-0/-home-user-league-of-legend/af6c8ae1-1b36-5685-9781-aa103d4d0aa5/scratchpad/_itemStatsSummary_extracted.js', 'utf8');
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
