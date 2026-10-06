"""
index.html은 file:// 로 열었을 때 크롬이 로컬 ES 모듈(dist/runtime.js)을
별도 스크립트로 로드하지 못하는 CORS 제약을 피하기 위해, 실제 실행되는
런타임 코드를 <script id="embedded-runtime" type="module"> 블록 안에
"그대로 붙여넣은" 상태로 들고 있다.

문제: 지금까지 src/ 파일을 고치고 tools/build.py로 dist/runtime.js만
다시 만들었는데, 정작 하요가 실제로 여는 index.html 안의 embedded-runtime은
예전 스냅샷 그대로였다 - 그래서 "바뀐 게 하나도 없다"는 게 당연한 결과였다.
이 스크립트는 방금 새로 빌드한 dist/runtime.js 내용을 index.html의
embedded-runtime 블록 안으로 다시 심어서, 두 사본이 항상 일치하게 만든다.

사용법: tools/build.py 실행 직후 이 스크립트를 실행한다.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
index_path = ROOT / "index.html"
runtime_path = ROOT / "dist" / "runtime.js"

html = index_path.read_text(encoding="utf-8")
runtime_code = runtime_path.read_text(encoding="utf-8")

START_TAG = '<script id="embedded-runtime" type="module">'
END_TAG = "</script>\n</body>"

start_idx = html.find(START_TAG)
end_idx = html.find(END_TAG)
if start_idx == -1 or end_idx == -1:
    raise SystemExit("embedded-runtime 블록을 찾지 못했습니다 - index.html 구조가 바뀌었는지 확인 필요")

content_start = start_idx + len(START_TAG)
new_html = html[:content_start] + "\n" + runtime_code + html[end_idx:]

index_path.write_text(new_html, encoding="utf-8")
print(f"embedded-runtime 갱신 완료: {len(runtime_code)} chars 삽입, index.html 총 {len(new_html)} chars")
