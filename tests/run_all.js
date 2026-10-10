// 이 디렉터리(tests/)의 모든 Node vm 회귀 테스트 파일을 순서대로 실행하고
// 결과를 요약한다. 각 테스트 파일은 실제 src/ 소스를 fs.readFileSync +
// vm.runInContext로 로드해서(외부 의존성 - THREE.js/DOM/performance 등 -
// 만 스텁으로 대체) 진짜 프로덕션 코드를 검증하는 독립 실행형 스크립트다.
// 파일 하나가 실패(0이 아닌 종료 코드 또는 "FAIL:" 줄 출력)해도 나머지는
// 계속 실행하고, 마지막에 실패한 파일이 하나라도 있으면 전체 종료 코드를
// 1로 돌려준다(CI에서 그대로 성공/실패 판정에 쓸 수 있도록).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TESTS_DIR = __dirname;
const SELF = path.basename(__filename);

const files = fs.readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('.js') && f !== SELF)
  .sort();

if (files.length === 0) {
  console.error('tests/ 디렉터리에 실행할 테스트 파일이 없습니다.');
  process.exit(1);
}

let failCount = 0;
const results = [];

for (const file of files) {
  const fullPath = path.join(TESTS_DIR, file);
  let output = '';
  let exitCode = 0;
  try {
    output = execFileSync(process.execPath, [fullPath], { encoding: 'utf8' });
  } catch (err) {
    exitCode = err.status != null ? err.status : 1;
    output = (err.stdout || '') + (err.stderr || '');
  }
  const failLines = output.split('\n').filter((l) => l.startsWith('FAIL:'));
  const okCount = (output.match(/^ok: /gm) || []).length;
  const crashed = exitCode !== 0 && failLines.length === 0;
  const passed = exitCode === 0 && failLines.length === 0;

  results.push({ file, passed, okCount, failLines, crashed, exitCode });
  if (!passed) {
    failCount += 1;
    console.log(`\n[FAIL] ${file} (종료 코드 ${exitCode})`);
    if (crashed) {
      console.log(output.split('\n').slice(-15).join('\n'));
    } else {
      for (const l of failLines) console.log('  ' + l);
    }
  } else {
    console.log(`[ok]   ${file} (${okCount}개 assert 통과)`);
  }
}

const totalOk = results.reduce((a, r) => a + r.okCount, 0);
console.log('\n' + '='.repeat(60));
console.log(`테스트 파일: ${files.length}개 중 ${files.length - failCount}개 통과, ${failCount}개 실패`);
console.log(`총 assert 통과: ${totalOk}개`);
console.log(failCount === 0 ? 'ALL TEST FILES PASSED' : 'SOME TEST FILES FAILED');

process.exit(failCount === 0 ? 0 : 1);
