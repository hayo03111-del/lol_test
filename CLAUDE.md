# 작업 규칙

- 사이트(https://hayo03111-del.github.io/lol_test/)는 `main` 브랜치에서 서비스된다. 변경은 항상 사이트에 바로 반영돼야 한다:
  작업 브랜치에 푸시하면 `.github/workflows/sync-pages.yml`이 `main`을 자동으로 맞춘다. 워크플로가 실패하면
  `git push origin <작업 브랜치>:main`으로 직접 맞춘다(빨리 감기만, 강제 푸시 금지).
- 소스는 `src/`, 빌드: `python3 tools/build.py && python3 tools/embed_runtime.py && python3 tools/check_build.py`.
  `index.html`에 빌드 결과가 들어가므로 소스를 고친 뒤 반드시 빌드까지 해서 커밋한다.
- 테스트: `node tests/run_all.js`. 브라우저 점검: `tools/e2e_glb/*.js`(THREE_DIR, E2E_HIDE_MAP=1).
- 각 차수의 변경은 README.md 끝에 "## N차: ..." 절로 기록한다.
