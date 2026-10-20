// QA(체크리스트 4): 아이템 구매·판매·되돌리기 후 골드·능력치 정확성. 상점 내부 함수는 index.html을 가로채 노출한다.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const startServer = require('./server.js');
(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.route('**/index.html', async (route) => {
    const res = await route.fetch(); let html = await res.text();
    const i = html.indexOf('<script id="embedded-runtime" type="module">'); const j = html.indexOf('</script>', i);
    html = html.slice(0, j) + ';window.__qa = { shopUndo, _shopBuy, _shopSell, setSel: (v) => { _shopSelectedSlot = v; }, get stack() { return _shopUndoStack; }, sellItem, sellBoots, buildOrBuyItem, buyItem, ITEM_DATA, computeChampionStats, setShopOpen, renderShopPanel, combineCost, getTeamSpawnPosition, PLAYER_TEAM, isPositionInBaseZone, useItem };' + html.slice(j);
    await route.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html' } });
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2e && window.__qa, null, { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('libraryChampSelect'); s.value = 'garen'; s.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.controller && window.controller.championId === 'garen', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const Q = window.__qa, c = window.controller, D = Q.ITEM_DATA, out = {};
    const toBase = () => { const p = Q.getTeamSpawnPosition(Q.PLAYER_TEAM); c.root.position.copy(p); };
    const reset = (gold = 20000) => { toBase(); c.items = []; c.boots = null; c._itemBootsExtraMoveSpeedLol = 0; c.gold = gold; window.recomputeItemStats(c); c.hp = c.maxHp; c.mp = c.maxMp; Q.stack.length = 0; };
    const snap = () => ({ ad: +c.stats.attackDamage.toFixed(3), ap: +(c.stats.abilityPower ?? c.abilityPower ?? 0).toFixed?.(3), maxHp: +c.maxHp.toFixed(3), hp: +c.hp.toFixed(3), maxMp: +c.maxMp.toFixed(3), armor: +(c.stats.armor ?? 0).toFixed(3), mr: +(c.stats.magicResist ?? 0).toFixed(3), as: +window.getFinalAttackSpeed(c.stats).toFixed(4), crit: +(c.stats.critChance || 0).toFixed(3), haste: c.itemBonusAbilityHaste, ms: +window.getFinalMoveSpeed(c.stats).toFixed(3), gold: c.gold, items: (c.items || []).map((s) => s.id + 'x' + s.count).join(','), boots: c.boots && c.boots.id });
    Q.setShopOpen(true);
    // 1) 기본 대비 증가량 = 아이템 스탯 합
    reset(); const base = snap();
    for (const id of ['longSword', 'rubyCrystal', 'clothArmor', 'negatronCloak', 'amplifyingTome', 'dagger', 'cloakOfAgility', 'sapphireCrystal']) if (D[id]) Q._shopBuy(id);
    const after = snap();
    const sum = (k) => (c.items || []).reduce((s, sl) => s + ((D[sl.id].stats || {})[k] || 0), 0);
    out.statsDelta = { ad: [+(after.ad - base.ad).toFixed(3), sum('attackDamage')], maxHp: [+(after.maxHp - base.maxHp).toFixed(3), sum('maxHp')], armor: [+(after.armor - base.armor).toFixed(3), sum('armor')], mr: [+(after.mr - base.mr).toFixed(3), sum('magicResist')], mana: [+(after.maxMp - base.maxMp).toFixed(3), sum('mana')], crit: [after.crit - base.crit, sum('critChance')], items: after.items };
    out.goldAfterBuys = [20000 - after.gold, (c.items || []).reduce((s, sl) => s + D[sl.id].cost, 0)];
    // 2) 판매 70%, 3번 연속 되돌리기 후 원상태
    const g0 = c.gold; Q.setSel(0); Q._shopSell(); out.sellLongSword = [c.gold - g0, Math.floor(D.longSword.cost * 0.7)];
    Q.shopUndo(); const u1 = snap(); out.undoSell = { gold: [u1.gold, g0], items: u1.items === after.items, ad: [u1.ad, after.ad] };
    let undos = 0; while (Q.stack.length) { Q.shopUndo(); undos++; } const u2 = snap();
    out.undoAll = { undos, gold: [u2.gold, base.gold], items: u2.items, statsEqualBase: ['ad', 'maxHp', 'armor', 'mr', 'maxMp', 'as', 'crit', 'ms'].every((k) => Math.abs(u2[k] - base[k]) < 1e-6) };
    // 3) 조합: 재료 전부 있음 → 차액, 재료 일부만 → 원작은 가진 재료 값만큼 깎아 준다
    reset(); Q._shopBuy('longSword'); Q._shopBuy('dagger'); Q._shopBuy('longSword');
    const gB = c.gold; Q._shopBuy('phageAxe'); out.buildFull = { paid: gB - c.gold, expected: Q.combineCost(D.phageAxe), items: snap().items };
    reset(); Q._shopBuy('longSword');
    const gP = c.gold; Q._shopBuy('phageAxe'); out.buildPartial = { paid: gP - c.gold, originalRule: D.phageAxe.cost - D.longSword.cost, items: snap().items };
    // 4) 신발: 2단계 → 다른 2단계 교체 비용
    reset(); Q._shopBuy('berserkersGreaves'); const gS = c.gold; const swapOk = Q._shopBuy('sorcerersShoes');
    out.bootsSwapT2toT2 = { allowed: swapOk, netCost: gS - c.gold, note: '원작: 2단계 신발은 하나만(다른 2단계는 못 산다) - 팔면 70%' };
    reset(); Q._shopBuy('boots'); const gT = c.gold; Q._shopBuy('berserkersGreaves'); out.bootsUpgrade = { paid: gT - c.gold, expected: D.berserkersGreaves.cost - D.boots.cost };
    // 5) 판매 비율(원작: 시작 아이템·물약·와드 40%, 그 외 70%)
    reset(); const sellOf = (id) => { reset(); Q._shopBuy(id); const g = c.gold; Q.setSel(0); Q._shopSell(); return c.gold - g; };
    out.sellRatios = Object.fromEntries(['doransBlade', 'darkSeal', 'healthPotion', 'tearOfGoddess', 'longSword'].filter((id) => D[id]).map((id) => [id, { got: sellOf(id), cost: D[id].cost, ratio: +(sellOf(id) / D[id].cost).toFixed(2) }]));
    // 6) 되돌리기와 그 사이 골드 수입 / 물약 사용 / 체력
    reset(); Q._shopBuy('longSword'); c.gold += 100; Q.shopUndo(); out.undoKeepsIncome = { gold: c.gold, expected: 20100 };
    reset(); Q._shopBuy('healthPotion'); c.hp = c.maxHp * 0.5; const slotIdx = c.items.findIndex((s) => s.id === 'healthPotion'); Q.useItem(c, slotIdx); const usedCount = (c.items[slotIdx] || { count: 0 }).count; Q.shopUndo();
    out.undoAfterUse = { potionUsedThenRefunded: c.gold === 20000, goldAfterUndo: c.gold, itemsAfter: snap().items, countAfterUse: usedCount };
    reset(); c.hp = c.maxHp * 0.5; const hpBefore = c.hp; Q._shopBuy('rubyCrystal'); const hpBought = c.hp; Q.shopUndo(); out.undoHp = { hpBefore: +hpBefore.toFixed(1), afterBuy: +hpBought.toFixed(1), afterUndo: +c.hp.toFixed(1), maxHp: +c.maxHp.toFixed(1) };
    reset(); c.hp = c.maxHp * 0.5; const hb2 = c.hp; Q._shopBuy('rubyCrystal'); Q.setSel(0); Q._shopSell(); out.sellHp = { hpBefore: +hb2.toFixed(1), afterBuySell: +c.hp.toFixed(1), goldLost: 20000 - c.gold };
    // 7) 기지 밖: 구매·판매·되돌리기
    reset(); Q._shopBuy('longSword'); c.root.position.set(0, 0, 0); const inBase = Q.isPositionInBaseZone(c.root.position, Q.PLAYER_TEAM);
    Q.renderShopPanel(true); out.leaveBaseClearsUndo = { inBase, stackLen: Q.stack.length };
    const gOut = c.gold; Q.setSel(0); Q._shopSell(); out.sellOutsideBase = { inBase, sold: c.gold !== gOut, apiSell: (() => { reset(); Q._shopBuy('longSword'); c.root.position.set(0, 0, 0); return Q.sellItem(c, 0); })() };
    // 상점 닫힌 채 기지 밖으로 나갔다 오면?
    reset(); Q._shopBuy('longSword'); Q.setShopOpen(false); c.root.position.set(0, 0, 0); c.gold += 0; toBase(); Q.setShopOpen(true); out.undoAfterLeavingWithShopClosed = { stackLen: Q.stack.length };
    // 8) 죽은 상태: 기지 밖에서도 구매
    reset(); c.root.position.set(0, 0, 0); c.hp = 0; c.state = 'DEAD'; const okDead = Q._shopBuy('longSword'); out.buyWhileDead = { ok: okDead, items: snap().items };
    c.hp = c.maxHp; c.state = 'IDLE';
    // 9) 유일·전설 중복·가득 찬 인벤토리
    reset(); Q._shopBuy('tearOfGoddess'); out.uniqueTear = { second: Q._shopBuy('tearOfGoddess') };
    reset(); for (let i = 0; i < 6; i++) Q._shopBuy('longSword'); out.fullInv = { seventh: Q._shopBuy('longSword'), buildWithFull: Q._shopBuy('phageAxe') /* 재료(롱소드2+단검)가 없어 직접 구매 → 막혀야 */ };
    reset(); Q._shopBuy('infinityEdge'); out.legendaryDup = { second: Q._shopBuy('infinityEdge') };
    // 10) 강철심장 크기·중첩 판매 시 제거
    reset(); Q._shopBuy('heartsteel'); c._itemHeartsteelPermanentHpGain = 300; window.recomputeItemStats(c); const hsHp = c.maxHp; const sz = c._itemHeartsteelScale;
    Q.setSel(0); Q._shopSell(); window.recomputeItemStats(c);
    out.heartsteelSell = { maxHpWith: +hsHp.toFixed(1), maxHpAfterSell: +c.maxHp.toFixed(1), scaleWith: sz, scaleAfter: c._itemHeartsteelScale, sizeMods: JSON.stringify(c._sizeMods || null) };
    // 11) 반복 되돌리기/재구매에서 중복 적용 없는지
    reset(); const b0 = snap(); for (let k = 0; k < 5; k++) { Q._shopBuy('bfSword'); Q.shopUndo(); } const b1 = snap();
    out.repeatBuyUndo = { equal: ['ad', 'maxHp', 'gold', 'crit'].every((k) => b0[k] === b1[k]), b0: [b0.ad, b0.gold], b1: [b1.ad, b1.gold] };
    // 12) 다른 챔피언 바꾸면 되돌리기 기록
    return out;
  });
  console.log(JSON.stringify({ r, errors }, null, 1));
  await browser.close(); srv.close();
})();
