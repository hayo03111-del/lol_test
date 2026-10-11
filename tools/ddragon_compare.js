// champion_data.js의 기본 스탯/쿨다운/비용/사거리를 라이엇 공식 Data Dragon(PC 최신판)과
// 대조한다. 사용법:
//   node tools/ddragon_compare.js <ddragon json 폴더>
// 폴더에는 Data Dragon의 data/en_US/champion/<Name>.json 파일들을 넣는다(예: GitHub 미러
// https://raw.githubusercontent.com/InFinity54/LoL_DDragon/master/latest/data/en_US/champion/Garen.json).
// 주의: Data Dragon은 최근 버전에서 attackdamageperlevel을 0으로 내보내는 알려진 문제가
// 있어 레벨당 공격력은 비교하지 않는다. 스킬 피해량/계수는 Data Dragon에 들어 있지 않다.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/ddragon_compare.js <folder>'); process.exit(1); }
const ctx = {}; vm.createContext(ctx);
vm.runInContext('function lolRangeToWorld(x){return x;}\n' + fs.readFileSync(path.join(__dirname, '../src/champions/champion_data.js'), 'utf8') + ';this.C=CHAMPION_DATA;', ctx);
const ids = { Garen: 'garen', Darius: 'darius', MasterYi: 'masteryi', LeeSin: 'leesin', Nautilus: 'nautilus', Yasuo: 'yasuo', Yone: 'yone',
  Sett: 'sett', Mordekaiser: 'mordekaiser', Renekton: 'renekton', Nilah: 'nilah', Chogath: 'chogath', Vex: 'vex', Ezreal: 'ezreal', Ahri: 'ahri', Varus: 'varus', Ashe: 'ashe' };
const map = { hp: 'hp', hpperlevel: 'hpGrowth', movespeed: 'moveSpeed', armor: 'armor', armorperlevel: 'armorGrowth', spellblock: 'mr', spellblockperlevel: 'mrGrowth', attackrange: 'range', hpregen: 'hpRegen', hpregenperlevel: 'hpRegenGrowth', mpregen: 'manaRegen', mpregenperlevel: 'manaRegenGrowth', attackdamage: 'ad', attackspeedperlevel: 'attackSpeedGrowthPercent', attackspeed: 'attackSpeed', mp: 'mana', mpperlevel: 'manaGrowth' };
let diffs = 0;
for (const [dd, id] of Object.entries(ids)) {
  const file = path.join(dir, dd + '.json');
  if (!fs.existsSync(file) || !ctx.C[id]) continue;
  const d = JSON.parse(fs.readFileSync(file))['data'][dd]; const c = ctx.C[id];
  for (const [k, ck] of Object.entries(map)) { if (d.stats[k] !== c.stats[ck]) { diffs++; console.log(id, 'stat', ck, 'data=', c.stats[ck], 'ddragon=', d.stats[k]); } }
  d.spells.forEach((s, i) => {
    const o = c['QWER'[i]]; if (!o) return;
    const cdArr = Array.isArray(o.cooldown) ? o.cooldown : Array(s.maxrank).fill(o.cooldown);
    if (JSON.stringify(cdArr.map(Number)) !== JSON.stringify(s.cooldown)) { diffs++; console.log(id, 'QWER'[i], 'cooldown data=', JSON.stringify(o.cooldown), 'ddragon=', s.cooldownBurn); }
    // 비용: Data Dragon costBurn(예: "50" 또는 "70/75/80/85/90"). 마나 없는 챔피언(costType이 기력/분노 등)도 그대로 비교.
    if (o.mana != null || o.energy != null) {
      const cost = o.mana != null ? o.mana : o.energy;
      const costArr = Array.isArray(cost) ? cost : Array(s.maxrank).fill(cost);
      if (JSON.stringify(costArr.map(Number)) !== JSON.stringify(s.cost)) { diffs++; console.log(id, 'QWER'[i], 'cost data=', JSON.stringify(cost), 'ddragon=', s.costBurn); }
    }
    // 사거리: 25000(전역)/자기 중심 스킬 등은 표기 방식이 달라 정보로만 출력.
    if (o.range != null && s.range && s.range[0] < 25000) {
      const rArr = Array.isArray(o.range) ? o.range : Array(s.maxrank).fill(o.range);
      if (JSON.stringify(rArr.map(Number)) !== JSON.stringify(s.range)) { diffs++; console.log(id, 'QWER'[i], 'range data=', JSON.stringify(o.range), 'ddragon=', s.rangeBurn, '(사거리 표기는 스킬마다 기준이 달라 참고용)'); }
    }
  });
}
console.log(diffs ? `${diffs} differences` : 'no differences');
