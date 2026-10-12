// 보호막 인스턴스 모델(src/core/shield_system.js) 단위 테스트 - 원작 규칙: 출처별 인스턴스, 서로 다른 보호막은 합산,
// 같은 출처 재적용은 교체, 피해는 먼저 끝나는 보호막부터 흡수, 지속시간 만료·선형 감소(지연 가능).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let now = 1000;
const ctx = vm.createContext({ performance: { now: () => now }, console, Math, Infinity, Object, Array });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/shield_system.js'), 'utf8') + '\nthis.api = { addShield, removeShield, getShieldById, capShield, clearShields, tickShields, absorbShieldDamage };', ctx);
const S = ctx.api;
let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('ok: ' + m); } else { fail++; console.log('FAIL: ' + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
{
  const u = { shield: 0 };
  S.addShield(u, 'garenW', 100, 0.75);
  S.addShield(u, 'itemMaw', 200, 5);
  assert(near(u.shield, 300), '서로 다른 보호막은 합산');
  S.addShield(u, 'garenW', 50, 0.75);
  assert(near(u.shield, 250), '같은 출처 재적용은 교체(중첩 안 함)');
  const left = S.absorbShieldDamage(u, 80);
  assert(left === 0 && near(S.getShieldById(u, 'garenW'), 0) && near(S.getShieldById(u, 'itemMaw'), 170), '피해는 먼저 끝나는 보호막(가렌 W 0.75초)부터 흡수');
  now += 6000; S.tickShields(u, 0.016);
  assert(near(u.shield, 0), '지속시간이 끝나면 사라짐');
}
{
  const u = { shield: 0 }; now = 1000;
  S.addShield(u, 'settW', 300, 3, { decay: true, decayDelaySec: 0.75 });
  now += 500; S.tickShields(u, 0.5);
  assert(near(u.shield, 300), '감소 지연(0.75초) 동안은 그대로');
  now += 1000; S.tickShields(u, 1.0);
  assert(u.shield < 300 && near(u.shield, 300 - 300 / 2.25 * 1.0), '지연 뒤 남은 2.25초에 걸쳐 선형 감소');
  S.addShield(u, 'other', 40, null);
  S.capShield(u, 'settW', 10);
  assert(near(u.shield, 50), '상한은 해당 출처 몫에만 적용(다른 보호막 유지)');
  assert(near(S.removeShield(u, 'settW'), 10) && near(u.shield, 40), '출처별 제거는 그 몫만 반환·제거');
  assert(near(S.absorbShieldDamage(u, 100), 60) && near(u.shield, 0), '보호막을 넘는 피해는 남은 양을 돌려줌');
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('SOME CHECKS FAILED'); process.exit(1); } else console.log('ALL CHECKS PASSED');
