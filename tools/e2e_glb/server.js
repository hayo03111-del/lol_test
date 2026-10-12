// 헤드리스 브라우저 E2E용 로컬 서버 - index.html의 three.js importmap을 로컬 경로로 바꾸고,
// 테스트 전용 핸들(window.__e2e)을 주입한다(저장소 파일은 바꾸지 않음).
const http = require('http'), fs = require('fs'), path = require('path');
// three.js는 CDN 대신 로컬 npm 패키지에서 제공한다(npm pack three@0.160.0 후 압축 해제한 package 폴더).
const ROOT = require('path').resolve(__dirname, '../..'), VENDOR = process.env.THREE_DIR || __dirname + '/three/package';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.css': 'text/css' };
module.exports = () => new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    let file = p.startsWith('/vendor/three/') ? path.join(VENDOR, p.slice('/vendor/three/'.length)) : path.join(ROOT, p);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      if (p === '/index.html') data = Buffer.from(data.toString('utf8').replace('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', '/vendor/three/build/three.module.js').replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', '/vendor/three/examples/jsm/'));
      if (p === '/index.html') { const html = data.toString('utf8'); const i = html.indexOf('<script id="embedded-runtime" type="module">'); const j = html.indexOf('</script>', i); data = Buffer.from(html.slice(0, j) + ';window.__e2e = { get dummies(){ return dummy ? [dummy, ...placedDummies] : placedDummies; }, lolRangeToWorld, getWorldPosition, get THREE(){ return THREE; }, get projectiles(){ return projectiles; }, get vfx(){ return vfx; }, get scene(){ return scene; }, applyStatus }; window.getDeathRealmForE2E = (id) => getDeathRealm(id); window.__mapClamp = (p) => (typeof howlingAbyssMap !== typeof undefined && howlingAbyssMap ? howlingAbyssMap.clampPosition(p) : p);' + html.slice(j)); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  });
  srv.listen(0, '127.0.0.1', () => resolve(srv));
});
