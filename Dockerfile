# 104차 전용 게임 서버(server/game_server.js) - Playwright 공식 이미지(Node + Chromium 포함) 위에서 돈다.
# 빌드·실행: docker build -t lolsim . && docker run -p 8787:8787 lolsim   → http://localhost:8787/ (게임과 서버가 같은 주소)
# Render·Fly.io·Oracle Cloud 등에 올리는 법은 README "104차 - 배포".
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY server/package.json server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY . .
ENV PORT=8787 MAX_ROOMS=2 NODE_ENV=production
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/game_server.js"]
