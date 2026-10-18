"""
빌드 산출물 동기화 검증 스크립트.

이 프로젝트는 src/*.js(개발 중 실제로 고치는 소스)와 index.html 안의
<script id="embedded-runtime"> 블록(사용자가 실제로 여는, 번들이 통째로
박혀 있는 사본) 두 개를 항상 일치시켜야 한다(README/embed_runtime.py
주석 참고 - file:// 로 열 때 크롬이 로컬 ES 모듈을 별도 스크립트로 로드
못 하는 CORS 제약 때문에 어쩔 수 없이 인라인으로 박아 넣는 구조다).

지금까지 이 동기화는 "tools/build.py && tools/embed_runtime.py를 잊지
않고 둘 다 실행했겠지"라는 사람의 기억에만 의존했다 - 실수로 build만
하고 embed를 빼먹으면 겉보기엔 정상(에러도 안 나고 git diff도 생김)이지만
실제로 열리는 index.html은 옛날 코드 그대로인 조용한 실패가 난다.
이 스크립트는 그 상태를 기계적으로 잡아낸다:

  1. src/build_manifest.json이 존재하고 유효한 JSON이며, 나열된 모든
     소스 파일이 실제로 디스크에 있는지
  2. src/runtime_imports.js가 존재하는지
  3. dist/runtime.js가 존재하고 `node --check`로 문법이 깨끗한지
  4. index.html에 <script id="embedded-runtime" type="module"> 태그가
     정확히 1개만 있는지(0개=깨짐, 2개 이상=중복 삽입 버그)
  5. 그 블록의 내용이 dist/runtime.js와 "개행 문자 차이만 빼고" 완전히
     같은지(embed_runtime.py를 실행하는 걸 잊었는지 감지하는 핵심 체크)
  6. import map(<script type="importmap">)과 "three" 매핑이 있는지
  7. 런타임이 매달리는 핵심 DOM 컨테이너(canvas-container 등)가 있는지

실패하면 사람이 읽을 수 있는 이유와 함께 0이 아닌 종료 코드를 반환한다
(CI나 커밋 전 훅에서 그대로 게이트로 쓸 수 있도록).

사용법: python3 tools/check_build.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

errors = []
warnings = []


def fail(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


# 1. build_manifest.json
manifest_path = ROOT / "src" / "build_manifest.json"
manifest_parts = []
if not manifest_path.exists():
    fail(f"없음: {manifest_path.relative_to(ROOT)}")
else:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_parts = manifest.get("parts", [])
        if not manifest_parts:
            fail("build_manifest.json의 'parts' 목록이 비어 있습니다")
        for rel in manifest_parts:
            if not (ROOT / rel).exists():
                fail(f"build_manifest.json이 가리키는 파일이 없습니다: {rel}")
    except json.JSONDecodeError as e:
        fail(f"build_manifest.json이 올바른 JSON이 아닙니다: {e}")

# 2. runtime_imports.js
imports_path = ROOT / "src" / "runtime_imports.js"
if not imports_path.exists():
    fail(f"없음: {imports_path.relative_to(ROOT)}")

# 3. dist/runtime.js 존재 + 문법 검사
dist_path = ROOT / "dist" / "runtime.js"
dist_code = None
if not dist_path.exists():
    fail(f"없음: {dist_path.relative_to(ROOT)} - tools/build.py를 실행했는지 확인하세요")
else:
    dist_code = dist_path.read_text(encoding="utf-8")
    try:
        subprocess.run(
            ["node", "--check", str(dist_path)],
            check=True, capture_output=True, text=True,
        )
    except FileNotFoundError:
        warn("node 실행 파일을 찾을 수 없어 dist/runtime.js 문법 검사를 건너뜁니다")
    except subprocess.CalledProcessError as e:
        fail(f"dist/runtime.js 문법 오류:\n{e.stderr}")

# 4~6. index.html
index_path = ROOT / "index.html"
if not index_path.exists():
    fail(f"없음: {index_path.relative_to(ROOT)}")
else:
    html = index_path.read_text(encoding="utf-8")

    # 실제 태그만 세기 위해 '<script ... type="module" ...>' 형태만 매칭한다
    # (파일 안의 주석에 이 문자열이 텍스트로 언급될 수 있어 단순 substring
    # count는 오탐을 낸다).
    module_tags = re.findall(r'<script\b[^>]*\btype="module"[^>]*>', html)
    embedded_tags = [t for t in module_tags if 'id="embedded-runtime"' in t]
    if len(embedded_tags) == 0:
        fail('index.html에 <script id="embedded-runtime" type="module"> 태그가 없습니다')
    elif len(embedded_tags) > 1:
        fail(f'index.html에 embedded-runtime 태그가 {len(embedded_tags)}개 있습니다(1개여야 함 - 중복 삽입 의심)')
    else:
        start_tag = '<script id="embedded-runtime" type="module">'
        end_tag = "</script>\n</body>"
        start_idx = html.find(start_tag)
        end_idx = html.find(end_tag)
        if start_idx == -1 or end_idx == -1:
            fail("embedded-runtime 블록의 시작/끝을 찾지 못했습니다(index.html 구조 변경 의심)")
        elif dist_code is not None:
            embedded_code = html[start_idx + len(start_tag):end_idx]
            # 개행 문자 차이(앞뒤 공백, CRLF 등)는 무시하고 내용만 비교한다.
            norm_embedded = embedded_code.strip().replace("\r\n", "\n")
            norm_dist = dist_code.strip().replace("\r\n", "\n")
            if norm_embedded != norm_dist:
                fail(
                    "index.html의 embedded-runtime 블록이 dist/runtime.js와 다릅니다 - "
                    "tools/build.py 실행 후 tools/embed_runtime.py를 실행하는 것을 잊지 않았는지 확인하세요"
                )

    if '<script type="importmap">' not in html:
        fail("index.html에 <script type=\"importmap\"> 블록이 없습니다")
    elif '"three"' not in html:
        warn('import map에 "three" 매핑이 보이지 않습니다(이름이 바뀌었을 수 있음)')

    required_containers = ["canvas-container", "shopOverlay", "shopGrid", "shopDetail", "hudItems", "scoreboardOverlay", "scoreboardPanel", "spellBar", "spellPicker", "hud"]
    for cid in required_containers:
        if f'id="{cid}"' not in html:
            fail(f"index.html에 필수 DOM 컨테이너가 없습니다: #{cid}")

print(f"검사한 manifest 소스 파일: {len(manifest_parts)}개")
for w in warnings:
    print(f"[경고] {w}")

if errors:
    print(f"\n{len(errors)}개 문제 발견:")
    for e in errors:
        print(f"  - {e}")
    print("\nBUILD CHECK: FAIL")
    sys.exit(1)

print("\nBUILD CHECK: PASS")
sys.exit(0)
