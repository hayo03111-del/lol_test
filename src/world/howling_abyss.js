/* ============================================================
   HOWLING ABYSS MAP (칼바람 나락 1라인 맵)
   ------------------------------------------------------------
   요청 문서(CommunityDragon howling_abyss kitpiece 이름 참고) 기준.
   기존 GROUND/조명/카메라/스킬/이동 시스템은 그대로 두고, 그 위에
   새로운 맵 지형만 추가한다(요청 1 "기존 게임플레이 코드를 삭제/재작성
   하지 마라").
   중요한 설계 결정 - 포탑/넥서스 중복 생성 방지: 이 문서는 "아직 실제
   Nexus/Turret gameplay가 없다면 placeholder를 만들어도 된다"고 명시
   하는데, 이 프로젝트에는 이미 진짜 GLB 모델 + HP + 전투 AI를 가진
   포탑/억제기타입/쌍둥이/우물/넥서스 시스템이 구현돼 있다(앞선 턴
   참고). 그래서:
   - 레드 진영 포탑/넥서스 자리 = 기존 turrets[]/nexusBuilding을 이
     맵의 좌표계로 재배치해서 그대로 쓴다(bootstrapChampion의 스폰
     좌표만 이 파일 하단에서 교체 - 새 포탑 시스템을 또 만들지 않음).
   - 블루 진영 쪽은 대응하는 실제 게임로직이 이 프로젝트에 아예 없으므로
     (단일 진영 설계) 문서가 명시적으로 허용한 대로 순수 시각적
     placeholder만 놓는다.
   ============================================================ */
const HA_MAP_CONFIG = {
  // 요청("맵 너비를 좀만 늘려줘") - 18 -> 21로 소폭 확장. 절벽 안쪽/바깥쪽
  // 벽도 같은 여유(+1.5)만큼 밀어냈다(길만 넓어지고 절벽까지의 여백
  // 비율은 그대로 유지).
  laneMinX: -10.5, laneMaxX: 10.5,
  cliffInnerX: 13, cliffOuterX: 24.5,
  // 요청("그리드 맵을 넓혀서 맵끝까지 갈 수 있게 하고 기지 안에 들어갈
  // 수 있게") - 예전엔 laneMaxZ(102)가 우물(redBaseZ=106.5)보다도
  // 안쪽에서 끊겨 있어서, 실제로 플레이어가 걸어서 우물/기지까지 아예
  // 도달할 수 없었다(clampPosition이 laneMinZ/MaxZ로 이동 범위를 막음).
  // redBaseZ보다 더 바깥까지(여유 6.5) 갈 수 있도록 라인 길이 자체를
  // 늘렸다 - 바닥 타일/그리드/화로 배치 등도 전부 이 값에서 파생되므로
  // (createHowlingAbyssMap 참고) 기지 구역까지 자연스럽게 함께 넓어진다.
  // 요청(실제 칼바람 나락 미니맵 사진 대조) - 구조물 좌표(아래 blueBaseZ
  // 등)는 전혀 건드리지 않는다. 사진을 보면 실제 맵 길이가 지금보다
  // 조금 더 길어서(우물 뒤로도 여백이 있음), laneMinZ/MaxZ만 구조물보다
  // 더 바깥까지(113 -> 125) 늘렸다 - 이동 범위/바닥/그리드/화로 배치가
  // 전부 이 값에서 파생되므로 챔피언도 그만큼 더 갈 수 있게 자동으로
  // 맞춰진다(clampPosition 참고).
  // 25차(원작 이동 격자 대조): 걸을 수 있는 끝이 원작은 가운데에서 ±약 8,115 LoL(LeagueSandbox Map12 AIPath.aimesh_ngrid
  // - 블루 -8,167 / 레드 +8,062)인데 이 맵은 ±125(약 9,105)까지 갔다. 8,115 LoL = 111.4(줄이기 전 단위, 1 = 72.84 LoL).
  // 맵 배율(HA_MAP_SCALE)은 아래처럼 고정 길이(HA_MAP_SPAN_UNITS)로 정하므로 이 값을 바꿔도 맵 크기는 그대로다.
  // 74차: 다리 방향 길이를 HA_LENGTH_SCALE배로 늘린다(사용자 요청 "맵 좀 더 길게").
  laneMinZ: -111.4 * 1.3, laneMaxZ: 111.4 * 1.3,
  blueBaseZ: -106.5 * 1.3, redBaseZ: 106.5 * 1.3,
  blueNexusZ: -94.5 * 1.3, redNexusZ: 94.5 * 1.3,
  blueTurretZ: -66 * 1.3, redTurretZ: 66 * 1.3,
};
// 74차: 맵을 다리 방향으로만 늘리는 배율(폭·구조물 크기·사거리는 그대로). 원작 좌표의 다리 방향 성분, 이동 격자 모양의
// 넓어지는 자리, 이동 끝(laneMinZ/MaxZ), 부쉬 위치가 전부 이 배율을 따른다 - 포탑 사이·넥서스까지 거리가 30% 길어진다.
const HA_LENGTH_SCALE = 1.3;

// 원작 크기 맞춤(19차 요청 "실제 맵과 챔피언의 크기를 비교하여 여기 크기도 맞춰줘"): 챔피언 사거리·이동속도는
// WORLD_DISTANCE_SCALE로 LoL 단위와 정확히 맞춰져 있는데, 맵은 손으로 늘린 값이라 원작보다 1.6배쯤 길었다
// (끝에서 끝 250 월드 = 약 28,900 LoL 유닛). 원작 칼바람 나락 좌표 범위는 x -28~12849, y -19~12858
// (Riot 매치 타임라인 좌표 범위 - HextechDocs "Map data" 정리, 비공식 문서)이고 다리는 이 정사각형의 대각선으로
// 놓인다. 그래서 맵 전체 길이를 대각선 길이(12,877 x √2 ≈ 18,211)에 맞춰 맵 전체를 똑같은 비율로 줄인다.
// 대각선은 맵 끝 모서리까지 포함한 상한값이라, 실제 다리는 이보다 조금 짧을 수 있다(근사).
// 아래 HA_MAP_CONFIG와 맵 안의 모든 모양 수치는 "줄이기 전" 단위이고, 맵 그룹 전체에 HA_MAP_SCALE을 곱한다.
const HA_REAL_MAP_SPAN_LOL = 12877; // 12849 - (-28)
const HA_FLOOR_TOP_LOCAL = 0.405; // 다리 눈 바닥(snowFloor) 윗면 높이(줄이기 전 단위)
const HA_MAP_SPAN_UNITS = 250; // 19차에 대각선 18,211 LoL에 맞춘 맵 길이(줄이기 전 단위) - 25차부터 이동 끝(laneMaxZ)과 분리
const HA_MAP_SCALE = lolRangeToWorld(HA_REAL_MAP_SPAN_LOL * Math.SQRT2) / HA_MAP_SPAN_UNITS;
// 원작 이동 가능 영역 모양(25차, LoL 단위 - 가운데에서 다리 방향 거리 기준). LeagueSandbox-Default
// AIMesh/Map12/AIPath.aimesh_ngrid(패치 4.20 무렵 원작 이동 격자, 50유닛 칸 248×240)에서 걸을 수 있는 칸을 단면마다 잰 값:
//   다리 폭 약 1,450~1,525(이 맵 1,530 그대로), 4,050~4,500에서 넓어져 폭 약 2,900(가운데 기준 ±1,450),
//   6,600부터 좁아져 7,500에서 약 1,300, 끝 약 8,115. 원작은 좌우가 조금 비대칭인데(우물 쪽이 한쪽으로 치우침)
//   이 맵은 좌우 대칭으로 근사했다. 12.23 패치 등 그 뒤 지형 변경은 반영되지 않았다.
const HA_WALK_SHAPE_LOL = { widenStart: 4050, widenFull: 4500, baseHalf: 1450, taperStart: 6600, taperEnd: 7550 };

// 원작 구조물 좌표(20차 요청 "포탑이랑 넥서스도 원작 위치에 배치해줘") - LoL 단위, 게임 맵 좌표 (x, z).
// 출처: LeagueSandbox-Default(github.com/LeagueSandbox/LeagueSandbox-Default, 오픈소스 LoL 서버 에뮬레이터용으로 게임
// 파일에서 뽑은 맵 데이터)의 Maps/Map12/Scene/*.sco.json "CentralPoint". 같은 폴더의 __LevelSize_(-28.43~12849.10,
// -19.03~12858.50)가 위 HA_REAL_MAP_SPAN_LOL의 좌표 범위와 정확히 같아 같은 원본임을 확인했다. 예전 클라이언트(4.20 무렵)
// 데이터라 그 뒤 패치로 바뀐 자리가 있으면 반영되지 않았다.
// 종류: LeagueSandbox Map12 LevelScriptObjects.cs의 번호 규칙(1·8 외곽, 2·7 억제기 포탑, 3·4·9·10 넥서스 포탑, Shrine 분수)
// + PC 위키 Howling Abyss "가운데부터 외곽 포탑 → 억제기 포탑 → 억제기 → 넥서스 포탑 2개 → 넥서스". 4포탑 구성에 없는
// Turret_T1_C_05 / Turret_T2_C_05(번호 5)는 넣지 않았다.
const HA_LEVEL_CENTER_LOL = [6410.333, 6419.734]; // __LevelSize_ 중심
const HA_STRUCTURES_LOL = {
  BLUE: { // Order(T1)
    outer: [4943.478, 4929.819],          // Turret_T1_C_08
    inhibTurret: [3809.061, 3829.052],    // Turret_T1_C_07
    inhibitor: [3128.512, 3171.512],      // Barracks_T1_C1
    nexusTurrets: [[2493.232, 2101.181], [2036.657, 2552.681]], // Turret_T1_C_09, Turret_T1_C_010
    nexus: [1849.299, 1962.817],          // HQ_T1
    fountain: [648.091, 764.227],         // Turret_OrderTurretShrine
    shop: [491.802, 1949.296],            // OrderShop01
  },
  RED: { // Chaos(T2)
    outer: [7879.103, 7774.802],          // Turret_T2_L_01
    inhibTurret: [9017.631, 8871.361],    // Turret_T2_L_02
    inhibitor: [9699.402, 9515.826],      // Barracks_T2_C1
    nexusTurrets: [[10785.178, 10117.587], [10325.223, 10608.198]], // Turret_T2_L_03, Turret_T2_L_04
    nexus: [10916.881, 10708.572],        // HQ_T2
    fountain: [12168.727, 11913.289],     // Turret_ChaosTurretShrine
    shop: [11065.5, 12306.484],           // ChaosShop01
  },
};
// 원작 충돌 반경(LoL 단위): 포탑 88.4(LeagueSandbox-Default Stats/ARAM*Turret* GameplayCollisionRadius), 넥서스 353·억제기
// 214(LeagueSandbox Map12 LevelScriptObjects.cs CreateNexus/CreateInhibitor 인자).
const HA_STRUCTURE_RADIUS_LOL = { turret: 88.4, nexus: 353, inhibitor: 214 };
// 챔피언 출현(리스폰) 지점(25차 요청 "레드 블루 팀 진영에 따라 리스폰지역을 각 우물로") - LeagueSandbox-Default
// Maps/Map12/Scene/__Spawn_T1·__Spawn_T2.sco.json의 CentralPoint(LoL 단위, 게임 좌표 x, z). 분수(우물) 포탑 바로 앞,
// 우물 발판 안이다.
const HA_SPAWN_LOL = { BLUE: [936.9515, 1060.61426], RED: [11860.0889, 11596.1572] };
// 게임 좌표 → 이 월드. 원작은 다리가 대각선(파랑 왼쪽 아래 → 빨강 오른쪽 위)이고 이 맵은 z축(파랑 -z → 빨강 +z)이다.
// 다리 방향 성분이 z, 그에 수직인 성분이 x다. 미니맵의 다리 위쪽(왼쪽 위)이 -x다 - 원작 상점이 -x로 와서 이 맵의
// 상점 자리(왼쪽)와 맞는다.
function haLolToWorld(xz) {
  const dx = xz[0] - HA_LEVEL_CENTER_LOL[0], dz = xz[1] - HA_LEVEL_CENTER_LOL[1];
  return new THREE.Vector3(-lolRangeToWorld((dz - dx) / Math.SQRT2), 0, lolRangeToWorld((dx + dz) / Math.SQRT2) * HA_LENGTH_SCALE);
}
// 외곽 포탑과 억제기 포탑 사이 한가운데의 z(월드) - 부쉬 배치용.
function haTurretGapZ(team) {
  const t = HA_STRUCTURES_LOL[team];
  return (haLolToWorld(t.outer).z + haLolToWorld(t.inhibTurret).z) / 2;
}

function createHowlingAbyssMap(scene) {
  // ============================================================
  // 73차: 맵 모양을 원작 칼바람 나락처럼 다시 만들었다(예전 "임시 구조물" 장식 전부 교체).
  // ------------------------------------------------------------
  // - 걸을 수 있는 땅(다리 + 양 기지)은 원작 이동 격자 모양(HA_WALK_SHAPE_LOL) 한 장의 바닥이다. 판석 무늬·눈 덮임은
  //   코드로 그린 텍스처(CanvasTexture)라 외부 텍스처 서버(CommunityDragon)가 막혀도 항상 보인다 - 서버에 닿으면
  //   원작 텍스처로 바꿔 끼운다.
  // - 다리 양옆: 눈 덮인 낮은 돌 난간이 바닥 외곽선을 그대로 따라가고, 일정 간격마다 굵은 기둥, 다리 가운데 양쪽엔
  //   거대한 프렐요드 수호자 석상. 난간 바깥은 눈 비탈이 심연(아래 깊은 어둠)으로 떨어지고, 바위·얼음 결정이 흩어져
  //   있다. 멀리는 산 능선 실루엣.
  // - 기지: 넥서스 단(둥근 돌 단), 넥서스 포탑 받침, 우물(팀 색으로 빛나는 문양 원), 상점, 맨 뒤 얼음 절벽 벽.
  // 게임플레이(이동 범위 clampPosition·구조물 좌표·출현 지점)는 바꾸지 않았다.
  // ============================================================
  const cfg = HA_MAP_CONFIG;
  const S = HA_MAP_SCALE;
  const group = new THREE.Group();
  group.scale.setScalar(S);
  group.position.y = -HA_FLOOR_TOP_LOCAL * S; // 바닥 윗면(줄이기 전 0.405)이 월드 높이 0
  const FLOOR_Y = HA_FLOOR_TOP_LOCAL;
  const LOL_PER_UNIT = 1 / (lolRangeToWorld(1) / S); // 줄이기 전 1단위 = 약 72.84 LoL
  const WIDEN_EXTRA_X = HA_WALK_SHAPE_LOL.baseHalf / LOL_PER_UNIT - cfg.laneMaxX;
  function widenExtraForZ(z) {
    const a = Math.abs(z) * LOL_PER_UNIT / HA_LENGTH_SCALE, W = HA_WALK_SHAPE_LOL; // 74차: 늘린 길이만큼 넓어지는 자리도 뒤로
    if (a < W.widenStart) return 0;
    if (a < W.widenFull) return WIDEN_EXTRA_X * (a - W.widenStart) / (W.widenFull - W.widenStart);
    if (a < W.taperStart) return WIDEN_EXTRA_X;
    if (a < W.taperEnd) return WIDEN_EXTRA_X * (1 - (a - W.taperStart) / (W.taperEnd - W.taperStart));
    return 0;
  }
  const halfW = (z) => cfg.laneMaxX + widenExtraForZ(z);
  // 결정적 난수(매번 같은 모양)
  let seed = 7331;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---------- 코드로 그리는 텍스처 ----------
  function canvasTex(size, draw, repeat = 1) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    if (typeof renderer !== 'undefined' && renderer.capabilities) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const blot = (g, x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  // 판석 바닥: 줄마다 길이가 다른 돌, 짙은 줄눈, 금, 가장자리에 쌓인 눈
  function flagstones(g, n, base, snowAmt) {
    g.fillStyle = '#2b333a'; g.fillRect(0, 0, n, n);
    const rows = 8, rh = n / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 60;
      while (x < n) {
        const w = 50 + rnd() * 70;
        const l = base[0] + (rnd() - .5) * 18, s2 = base[1] + (rnd() - .5) * 10;
        g.fillStyle = `hsl(${base[2]},${s2}%,${l}%)`;
        g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
        for (let k = 0; k < 6; k++) blot(g, x + rnd() * w, r * rh + rnd() * rh, 6 + rnd() * 14, 'rgba(0,0,0,A)', .08); // 얼룩
        g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.strokeRect(x + 2.5, r * rh + 2.5, w - 5, rh - 5); // 돌 모서리 밝게
        if (rnd() < .35) { g.strokeStyle = 'rgba(10,14,18,0.55)'; g.beginPath(); let cx = x + rnd() * w, cy = r * rh + 3; g.moveTo(cx, cy); for (let j = 0; j < 4; j++) { cx += (rnd() - .5) * 18; cy += rh / 4; g.lineTo(cx, cy); } g.stroke(); }
        x += w;
      }
    }
    for (let i = 0; i < 7 * snowAmt; i++) blot(g, rnd() * n, rnd() * n, 50 + rnd() * 90, 'rgba(225,238,248,A)', .35 + rnd() * .3); // 크고 옅은 눈 더미
    for (let r = 0; r < rows; r++) if (rnd() < .5) { g.fillStyle = 'rgba(230,240,248,0.28)'; g.fillRect(0, r * rh - 2, n, 4); } // 줄눈에 낀 눈
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * .12})`; g.fillRect(rnd() * n, rnd() * n, 2, 2); }
  }
  const laneTex = canvasTex(512, (g, n) => flagstones(g, n, [44, 9, 205], 1));
  const baseTex = canvasTex(512, (g, n) => flagstones(g, n, [48, 11, 210], 1.6));
  const wallTex = canvasTex(256, (g, n) => {
    g.fillStyle = '#1e262c'; g.fillRect(0, 0, n, n);
    for (let r = 0; r < 4; r++) for (let x = (r % 2) * -32; x < n; x += 64) { g.fillStyle = `hsl(205,8%,${30 + (rnd() - .5) * 10}%)`; g.fillRect(x + 2, r * 64 + 2, 60, 60); }
    for (let i = 0; i < 40; i++) blot(g, rnd() * n, rnd() * n, 8 + rnd() * 18, 'rgba(0,0,0,A)', .15);
  });
  const rockTex = canvasTex(256, (g, n) => {
    g.fillStyle = '#3a4954'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 160; i++) blot(g, rnd() * n, rnd() * n, 6 + rnd() * 30, rnd() < .5 ? 'rgba(10,18,26,A)' : 'rgba(150,175,195,A)', .18);
    g.strokeStyle = 'rgba(200,225,240,0.18)'; for (let i = 0; i < 30; i++) { g.beginPath(); const x = rnd() * n, y = rnd() * n; g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 60, y + rnd() * 40); g.stroke(); }
  });
  const snowTex = canvasTex(256, (g, n) => {
    g.fillStyle = '#dce8f1'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 120; i++) blot(g, rnd() * n, rnd() * n, 8 + rnd() * 28, rnd() < .5 ? 'rgba(160,190,215,A)' : 'rgba(255,255,255,A)', .25);
  });
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: .9, metalness: 0, ...o });
  laneTex.repeat.set(.55, .55); baseTex.repeat.set(.5, .5);
  const laneMat = std({ map: laneTex, color: 0xc4d0d8 });
  const baseMat = std({ map: baseTex, color: 0xc9d5dd });
  const wallMat = std({ map: wallTex, color: 0xb9c6cf, roughness: .85 });
  const rockMat = std({ map: rockTex, color: 0xb6c6d2, flatShading: true });
  const snowMat = std({ map: snowTex, color: 0xb9c9d6, roughness: 1 });
  const iceMat = std({ color: 0x9fd8f2, roughness: .25, metalness: .05, emissive: 0x2a6f99, emissiveIntensity: .35, transparent: true, opacity: .9, flatShading: true });
  const darkMat = std({ color: 0x101c25, roughness: 1 });
  // 74차: 원작 텍스처(CommunityDragon howling_abyss kitpiece 텍스처). 저장소에 받아 둔 사본(assets/maps/howling_abyss/,
  // tools/fetch_ha_textures.py)을 먼저 찾고, 없으면 CommunityDragon에서 바로 받는다. 둘 다 안 되면 위에서 코드로 그린 텍스처가
  // 그대로 남는다(어느 환경에서도 바닥·벽이 보인다).
  const HA_TEX_LOCAL = 'assets/maps/howling_abyss/';
  const HA_TEX_REMOTE = 'https://raw.communitydragon.org/latest/game/assets/maps/kitpieces/howling_abyss/textures/';
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  function useOriginal(material, name, repeat = 1) {
    const apply = (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace;
      if (typeof renderer !== 'undefined' && renderer.capabilities) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      material.map = t; if (!material.vertexColors) material.color.setHex(0xffffff); material.needsUpdate = true;
      material.userData.textureSource = t.image && t.image.src;
    };
    loader.load(HA_TEX_LOCAL + name, apply, undefined, () => loader.load(HA_TEX_REMOTE + name, apply, undefined, () => {}));
  }
  const pillarMat = std({ map: wallTex, color: 0xb0bdc6, roughness: .85 });
  const cliffMat = std({ map: rockTex, color: 0xa8b8c4, flatShading: true });
  useOriginal(laneMat, 'structure_lane_ground.png');
  useOriginal(baseMat, 'structure_base_ground.png');
  useOriginal(wallMat, 'structure_lane_walls.png');
  useOriginal(pillarMat, 'structure_lane_walls2.png');
  useOriginal(snowMat, 'basesnow.png');
  useOriginal(rockMat, 'prop_icecliff_h.png');
  useOriginal(cliffMat, 'prop_icecliff_f.png');
  useOriginal(iceMat, 'prop_ice_chunksa.png');
  // 지형 텍스처를 쓰는 재질 목록(점검용)
  const slopeMat = std({ vertexColors: true, flatShading: true, roughness: .95 });
  useOriginal(slopeMat, 'prop_icecliff_snowtransition.png');
  const HA_TEXTURED = { slopeMat, laneMat, baseMat, wallMat, pillarMat, snowMat, rockMat, cliffMat, iceMat };

  function mesh(geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scl = null, parent = group) {
    const o = new THREE.Mesh(geo, material); o.position.set(...pos); o.rotation.set(...rot); if (scl) o.scale.set(...scl);
    o.castShadow = false; o.receiveShadow = true; parent.add(o); return o;
  }
  // 월드 좌표 UV(텍스처가 늘어나지 않게) - 줄이기 전 6단위(약 440 LoL)마다 한 번 반복
  function worldUv(geo, tile = 6, axes = 'xy') {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (axes === 'xz' ? p.getX(i) : p.getX(i)) / tile, (axes === 'xz' ? p.getZ(i) : p.getY(i)) / tile);
    uv.needsUpdate = true; return geo;
  }

  // ---------- 1) 걸을 수 있는 바닥(다리 + 양 기지, 원작 이동 격자 외곽선) ----------
  const STEP = 1.0;
  const zs = []; for (let z = cfg.laneMinZ; z <= cfg.laneMaxZ + 1e-6; z += STEP) zs.push(Math.min(z, cfg.laneMaxZ));
  const outline = new THREE.Shape();
  zs.forEach((z, i) => (i ? outline.lineTo(halfW(z), -z) : outline.moveTo(halfW(z), -z)));
  for (let i = zs.length - 1; i >= 0; i--) outline.lineTo(-halfW(zs[i]), -zs[i]);
  const floorGeo = worldUv(new THREE.ShapeGeometry(outline, 1));
  // 기지 쪽(넓어지는 곳부터)은 기지 바닥 재질, 다리는 다리 재질 - 같은 외곽선을 둘로 나눈다
  const floor = mesh(floorGeo, laneMat, [0, FLOOR_Y, 0], [-Math.PI / 2, 0, 0]);
  floor.name = 'HA_FLOOR';
  for (const sign of [-1, 1]) {
    const z0 = HA_WALK_SHAPE_LOL.widenStart * HA_LENGTH_SCALE / LOL_PER_UNIT - 3, sh = new THREE.Shape(), pts = [];
    for (let z = z0; z <= cfg.laneMaxZ + 1e-6; z += STEP) pts.push([halfW(z), sign * Math.min(z, cfg.laneMaxZ)]);
    for (let i = pts.length - 1; i >= 0; i--) pts.push([-pts[i][0], pts[i][1]]);
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    mesh(worldUv(new THREE.ShapeGeometry(sh, 1)), baseMat, [0, FLOOR_Y + .004, 0], [-Math.PI / 2, 0, 0]);
  }
  // 바닥 아래 받침(옆에서 봤을 때 종잇장처럼 보이지 않게)
  mesh(new THREE.ExtrudeGeometry(outline, { depth: 2.2, bevelEnabled: false }), darkMat, [0, FLOOR_Y - 2.25, 0], [-Math.PI / 2, 0, 0]);

  // ---------- 2) 난간(외곽선을 따라가는 낮은 돌벽 + 눈 + 기둥) ----------
  const RAIL_OFF = .55, RAIL_H = 1.25, RAIL_T = .95;
  const railPts = (side) => zs.filter((_, i) => i % 2 === 0).map((z) => new THREE.Vector3(side * (halfW(z) + RAIL_OFF), 0, z));
  for (const side of [-1, 1]) {
    const pts = railPts(side);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b) + .05, mid = a.clone().add(b).multiplyScalar(.5);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      mesh(new THREE.BoxGeometry(RAIL_T, RAIL_H, len), wallMat, [mid.x, FLOOR_Y + RAIL_H / 2 - .05, mid.z], [0, yaw, 0]);
      mesh(new THREE.BoxGeometry(RAIL_T + .18, .22, len + .05), snowMat, [mid.x, FLOOR_Y + RAIL_H + .05, mid.z], [0, yaw, 0]);
      if (i % 6 === 0) { // 기둥
        const px = a.x + side * .1;
        mesh(new THREE.BoxGeometry(1.7, 2.6, 1.7), pillarMat, [px, FLOOR_Y + 1.25, a.z]);
        mesh(new THREE.ConeGeometry(1.35, 1.0, 4), snowMat, [px, FLOOR_Y + 3.05, a.z], [0, Math.PI / 4, 0]);
        mesh(new THREE.BoxGeometry(1.95, .3, 1.95), wallMat, [px, FLOOR_Y + .15, a.z]);
      }
    }
  }
  // 맨 뒤(우물 뒤) 막는 얼음 절벽 벽
  for (const sign of [-1, 1]) {
    // 이동 끝 바로 뒤에서 시작해 바깥으로(우물 발판을 덮지 않게 바위 안쪽 끝이 이동 끝 너머에 오도록)
    const zEnd = sign * (cfg.laneMaxZ + 3.2), w = halfW(cfg.laneMaxZ) + 4;
    for (let x = -w; x <= w; x += 2.2) {
      const h = 3.5 + rnd() * 3.5;
      mesh(new THREE.DodecahedronGeometry(1.8 + rnd() * .7, 0), cliffMat, [x, FLOOR_Y + h * .35, zEnd + sign * rnd() * 1.4], [rnd(), rnd() * 3, rnd()], [1.15, h / 2.4, .95]);
      if (rnd() < .5) mesh(new THREE.ConeGeometry(.5 + rnd() * .4, 2 + rnd() * 2.5, 5), iceMat, [x + rnd(), FLOOR_Y + 1, zEnd - sign * 1.6], [0, rnd() * 3, (rnd() - .5) * .4]);
    }
  }

  // ---------- 3) 난간 바깥: 눈 비탈 → 심연, 바위·얼음 결정 ----------
  const OUT = [0, 1.6, 4, 8, 14, 22, 32]; // 난간에서 바깥으로 거리
  const HGT = [1.0, .7, -.2, -2.4, -6.5, -12, -18];
  for (const side of [-1, 1]) {
    const cols = OUT.length, rowsZ = [];
    for (let z = cfg.laneMinZ - 4; z <= cfg.laneMaxZ + 4.01; z += 2) rowsZ.push(z);
    const pos = [], col = [], idx = [];
    rowsZ.forEach((z) => {
      const edge = halfW(THREE.MathUtils.clamp(z, cfg.laneMinZ, cfg.laneMaxZ)) + RAIL_OFF + .4;
      OUT.forEach((d, j) => {
        const n = (rnd() - .5) * (j ? 1.6 + j * .5 : 0);
        pos.push(side * (edge + d + (j ? (rnd() - .5) * 1.5 : 0)), FLOOR_Y + HGT[j] + n, z + (j > 1 ? (rnd() - .5) * 1.2 : 0));
        const t = j / (cols - 1), snow = Math.max(0, 1 - t * 1.5) * (.85 + rnd() * .15);
        col.push(.1 + .42 * snow, .15 + .45 * snow, .2 + .48 * snow);
      });
    });
    for (let r = 0; r < rowsZ.length - 1; r++) for (let j = 0; j < cols - 1; j++) {
      const a = r * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // 비탈 UV(월드 좌표) - 원작 눈 절벽 텍스처가 늘어나지 않게
    const uvs = []; for (let i = 0; i < pos.length; i += 3) uvs.push(pos[i + 2] / 8, pos[i + 1] / 8 + pos[i] / 8);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    mesh(g, slopeMat);
    // 비탈 위 바위(눈 모자)와 얼음 결정
    for (let z = cfg.laneMinZ; z <= cfg.laneMaxZ; z += 3.2) {
      const edge = halfW(z) + RAIL_OFF + 2.5 + rnd() * 7, h = 1.2 + rnd() * 2.8;
      const x = side * edge, y = FLOOR_Y + HGT[1] - (edge - halfW(z)) * .25;
      mesh(new THREE.DodecahedronGeometry(1 + rnd() * 1.2, 0), rockMat, [x, y, z + rnd() * 2], [rnd(), rnd() * 3, rnd()], [1.2, h / 2, 1]);
      mesh(new THREE.DodecahedronGeometry(.9 + rnd() * .8, 0), snowMat, [x, y + h * .45, z + rnd()], [rnd(), rnd() * 3, 0], [1.1, .35, 1]);
      if (rnd() < .45) { const ix = x + side * (1 + rnd() * 2); for (let k = 0; k < 3; k++) mesh(new THREE.ConeGeometry(.25 + rnd() * .3, 1.4 + rnd() * 2.2, 5), iceMat, [ix + (rnd() - .5), y + .4, z + (rnd() - .5) * 1.5], [(rnd() - .5) * .6, rnd() * 3, (rnd() - .5) * .6]); }
    }
  }
  // 다리 가운데 양쪽의 거대한 프렐요드 수호자 석상(원작 다리 옆 석상 실루엣을 단순화)
  for (const z of [-26 * HA_LENGTH_SCALE, 26 * HA_LENGTH_SCALE]) for (const side of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(side * (halfW(z) + 5.5), FLOOR_Y - .5, z); g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; group.add(g);
    mesh(new THREE.BoxGeometry(4.2, 1.2, 4.2), wallMat, [0, .6, 0], [0, 0, 0], null, g);
    mesh(new THREE.CylinderGeometry(1.2, 1.6, 5.5, 6), rockMat, [0, 3.9, 0], [0, 0, 0], null, g);
    mesh(new THREE.BoxGeometry(3.6, 1.2, 1.6), rockMat, [0, 6.2, 0], [0, 0, 0], null, g); // 어깨
    mesh(new THREE.DodecahedronGeometry(.95, 0), rockMat, [0, 7.4, 0], [0, 0, 0], null, g); // 머리
    mesh(new THREE.ConeGeometry(.35, 2.2, 4), rockMat, [-.75, 8.2, 0], [0, 0, .5], null, g); // 뿔
    mesh(new THREE.ConeGeometry(.35, 2.2, 4), rockMat, [.75, 8.2, 0], [0, 0, -.5], null, g);
    mesh(new THREE.CylinderGeometry(.18, .18, 8.5, 6), wallMat, [1.7, 4.8, .3], [0, 0, .05], null, g); // 창
    mesh(new THREE.ConeGeometry(.45, 1.4, 4), iceMat, [1.75, 9.6, .3], [0, 0, 0], null, g);
    mesh(new THREE.BoxGeometry(3.7, .35, 1.7), snowMat, [0, 6.95, 0], [0, 0, 0], null, g);
  }
  // 심연 바닥과 먼 산 능선
  mesh(new THREE.PlaneGeometry(260, 420 * HA_LENGTH_SCALE), std({ color: 0x050d14, roughness: 1 }), [0, -22, 0], [-Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
    const z = (-150 + i * 23 + rnd() * 10) * HA_LENGTH_SCALE, h = 22 + rnd() * 26;
    mesh(new THREE.ConeGeometry(14 + rnd() * 10, h, 5), std({ color: 0x1b2c39, roughness: 1, flatShading: true }), [side * (70 + rnd() * 30), -20 + h / 2, z], [0, rnd() * 3, 0]);
    mesh(new THREE.ConeGeometry(5 + rnd() * 3, h * .3, 5), snowMat, [side * (70 + rnd() * 30), -20 + h * .9, z], [0, rnd() * 3, 0]);
  }

  // ---------- 4) 기지: 넥서스 단·넥서스 포탑 받침·우물·상점 ----------
  for (const team of ['BLUE', 'RED']) {
    const real = HA_STRUCTURES_LOL[team];
    const teamColor = team === 'BLUE' ? 0x3fc4ff : 0xff4d5e;
    const local = (xz) => { const w = haLolToWorld(xz); return { x: w.x / S, z: w.z / S }; };
    const glow = (o = {}) => std({ color: teamColor, emissive: teamColor, emissiveIntensity: .9, roughness: .3, ...o });
    // 넥서스 단(두 겹 둥근 돌 단 + 팀 색 홈)
    const nx = local(real.nexus);
    mesh(worldUv(new THREE.CylinderGeometry(7.4, 8.0, .35, 40), 6, 'xz'), baseMat, [nx.x, FLOOR_Y + .02, nx.z]);
    mesh(new THREE.CylinderGeometry(5.6, 6.0, .3, 40), wallMat, [nx.x, FLOOR_Y + .3, nx.z]);
    mesh(new THREE.TorusGeometry(6.4, .12, 6, 48), glow({ emissiveIntensity: .5 }), [nx.x, FLOOR_Y + .22, nx.z], [Math.PI / 2, 0, 0]);
    // 넥서스 포탑 받침
    for (const tp of real.nexusTurrets.map(local)) {
      mesh(new THREE.CylinderGeometry(2.2, 2.5, .3, 8), wallMat, [tp.x, FLOOR_Y + .05, tp.z]);
      mesh(new THREE.TorusGeometry(2.35, .08, 4, 8), snowMat, [tp.x, FLOOR_Y + .22, tp.z], [Math.PI / 2, 0, 0]);
    }
    for (const key of ['outer', 'inhibTurret']) { const tp = local(real[key]); mesh(new THREE.CylinderGeometry(2.0, 2.3, .25, 8), wallMat, [tp.x, FLOOR_Y + .02, tp.z]); }
    const ih = local(real.inhibitor);
    mesh(new THREE.CylinderGeometry(3.6, 3.9, .25, 24), wallMat, [ih.x, FLOOR_Y + .02, ih.z]);
    // 우물: 빛나는 문양 원 + 발판(챔피언 출현 지점)
    const ft = local(real.fountain);
    mesh(new THREE.CylinderGeometry(6.0, 6.5, .3, 40), wallMat, [ft.x, FLOOR_Y + .0, ft.z]);
    mesh(new THREE.RingGeometry(4.6, 5.2, 48), glow({ transparent: true, opacity: .75, side: THREE.DoubleSide }), [ft.x, FLOOR_Y + .17, ft.z], [-Math.PI / 2, 0, 0]);
    mesh(new THREE.RingGeometry(2.6, 2.85, 6), glow({ transparent: true, opacity: .55, side: THREE.DoubleSide }), [ft.x, FLOOR_Y + .17, ft.z], [-Math.PI / 2, 0, 0]);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(new THREE.BoxGeometry(.6, 1.6, .6), wallMat, [ft.x + Math.cos(a) * 5.6, FLOOR_Y + .8, ft.z + Math.sin(a) * 5.6]); mesh(new THREE.OctahedronGeometry(.32, 0), glow(), [ft.x + Math.cos(a) * 5.6, FLOOR_Y + 1.9, ft.z + Math.sin(a) * 5.6]); }
    // 상점(프렐요드 상인 천막 대신 돌 단 + 얼음 진열대 + 팀 색 수정)
    const sp = local(real.shop);
    const shopG = new THREE.Group(); shopG.position.set(sp.x, FLOOR_Y, sp.z); group.add(shopG); shopG.userData.type = 'shop_visual';
    mesh(new THREE.CylinderGeometry(2.6, 2.9, .4, 10), wallMat, [0, .2, 0], [0, 0, 0], null, shopG);
    mesh(new THREE.BoxGeometry(3.2, 1.1, 1.2), rockMat, [0, .95, 0], [0, 0, 0], null, shopG);
    mesh(new THREE.BoxGeometry(3.4, .18, 1.4), snowMat, [0, 1.55, 0], [0, 0, 0], null, shopG);
    for (const x of [-1.3, 1.3]) mesh(new THREE.CylinderGeometry(.14, .14, 3, 6), wallMat, [x, 1.5, -.6], [0, 0, 0], null, shopG);
    mesh(new THREE.BoxGeometry(3.3, .1, 1.8), std({ color: team === 'BLUE' ? 0x1d3f66 : 0x6a1f2a, roughness: .9 }), [0, 3.0, -.2], [.25, 0, 0], null, shopG); // 팀 색 차양
    mesh(new THREE.OctahedronGeometry(.45, 0), glow(), [0, 2.2, 0], [0, 0, 0], null, shopG);
  }

  // ---------- 5) 눈 ----------
  const bridgeLen = cfg.laneMaxZ - cfg.laneMinZ;
  const snowCount = 520, sgeo = new THREE.BufferGeometry(), positions = new Float32Array(snowCount * 3), vel = new Float32Array(snowCount), phase = new Float32Array(snowCount), wob = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) { positions[i * 3] = (Math.random() - .5) * 38; positions[i * 3 + 1] = Math.random() * 25; positions[i * 3 + 2] = cfg.laneMinZ - 15 + Math.random() * (bridgeLen + 30); vel[i] = 1 + Math.random() * 2.1; phase[i] = Math.random() * Math.PI * 2; }
  sgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const snowPts = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: .07, transparent: true, opacity: .75, depthWrite: false, sizeAttenuation: true }));
  snowPts.frustumCulled = false; group.add(snowPts);
  let snowFrameToggle = false;
  function updateSnow(dt, focusPos) {
    const cx = (focusPos?.x ?? 0) / S, cz = (focusPos?.z ?? 0) / S;
    snowFrameToggle = !snowFrameToggle;
    for (let i = 0; i < snowCount; i++) {
      const k = i * 3;
      let y = positions[k + 1] - vel[i] * dt;
      if (snowFrameToggle) { phase[i] += dt * 1.3; wob[i] = Math.sin(phase[i]) * .13; }
      let x = positions[k] + wob[i] * dt - .12 * dt, z = positions[k + 2] - .025 * dt;
      if (y < 0) { y = 14 + Math.random() * 7; x = cx + (Math.random() - .5) * 30; z = cz + (Math.random() - .5) * 34; }
      positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
    }
    sgeo.attributes.position.needsUpdate = true;
  }

  // ---------- 6) 분위기: 차가운 달빛 + 푸른 안개(광원은 기존 2개 그대로) ----------
  scene.fog = new THREE.FogExp2(0x1d3446, .0085);
  scene.background = new THREE.Color(0x0e1f2c);
  hemi.color.setHex(0xd2ecff); hemi.groundColor.setHex(0x1a2a36); hemi.intensity = 0.95;
  dirLight.color.setHex(0xe4f2ff); dirLight.intensity = 1.05; dirLight.position.set(-26, 38, -22);

  scene.add(group);
  const pathBlueToRed = [], pathRedToBlue = [];
  for (let i = 0; i < 11; i++) { const z = cfg.laneMinZ + 6 + (i / 10) * (bridgeLen - 12); pathBlueToRed.push(new THREE.Vector3(0, .02, z * S)); }
  for (let i = pathBlueToRed.length - 1; i >= 0; i--) pathRedToBlue.push(pathBlueToRed[i].clone());
  // 이동 범위: 바닥 외곽선과 같은 widenExtraForZ()(판정은 월드 좌표 → 줄이기 전 단위).
  function clampPosition(p) { const maxX = (cfg.laneMaxX + widenExtraForZ(p.z / S)) * S; p.x = THREE.MathUtils.clamp(p.x, -maxX, maxX); p.z = THREE.MathUtils.clamp(p.z, cfg.laneMinZ * S, cfg.laneMaxZ * S); return p; }
  function isInsidePlayableArea(p) { const maxX = (cfg.laneMaxX + widenExtraForZ(p.z / S)) * S; return p.x >= -maxX && p.x <= maxX && p.z >= cfg.laneMinZ * S && p.z <= cfg.laneMaxZ * S; }
  return { group, scale: S, lengthScale: HA_LENGTH_SCALE, texturedMaterials: HA_TEXTURED, laneMinX: cfg.laneMinX * S, laneMaxX: cfg.laneMaxX * S, laneMinZ: cfg.laneMinZ * S, laneMaxZ: cfg.laneMaxZ * S,
    spawnBlue: haLolToWorld(HA_SPAWN_LOL.BLUE), spawnRed: haLolToWorld(HA_SPAWN_LOL.RED),
    blueNexus: null, redNexus: null, blueTurret: null, redTurret: null,
    pathBlueToRed, pathRedToBlue, clampPosition, isInsidePlayableArea, updateSnow };
}
// 칼바람 나락 맵(요청 "칼바람 나락 맵 다시 넣고"): 지형·절벽·장식·눈을 만든다. 생성에 실패하면(텍스처 서버 문제 등과 무관하게
// 코드 오류일 때) 예전처럼 맵 없는 연습장 경계로 돌아간다. 지형 텍스처는 코드로 그리고(73차), CommunityDragon에 닿으면
// 원작 텍스처로 바꿔 끼운다.
const HOWLING_ABYSS_ENABLED = true;
let howlingAbyssMap = null;
if (HOWLING_ABYSS_ENABLED) { try { howlingAbyssMap = createHowlingAbyssMap(scene); } catch (e) { console.warn('[MAP] 칼바람 나락 생성 실패 - 연습장으로 대체', e); howlingAbyssMap = null; } }
if (!howlingAbyssMap) howlingAbyssMap={group:null,laneMinX:-140,laneMaxX:140,laneMinZ:-140,laneMaxZ:140,spawnBlue:new THREE.Vector3(0,0,0),spawnRed:new THREE.Vector3(0,0,0),blueNexus:null,redNexus:null,blueTurret:null,redTurret:null,pathBlueToRed:[],pathRedToBlue:[],clampPosition(p){p.x=THREE.MathUtils.clamp(p.x,-140,140);p.z=THREE.MathUtils.clamp(p.z,-140,140);return p;},isInsidePlayableArea(p){return p.x>=-140&&p.x<=140&&p.z>=-140&&p.z<=140;},updateSnow(){}};
// 맵이 있으면 연습장 바닥은 숨긴다(다리 아래가 심연이어야 한다).
if (howlingAbyssMap.group && typeof ground !== 'undefined' && ground) ground.visible = false;
window.HOWLING_ABYSS_MAP=howlingAbyssMap;
// 팀별 리스폰·귀환 지점(25차). 맵이 없으면(연습장) 예전처럼 가운데(0,0,0).
function getTeamSpawnPosition(team) {
  const m = howlingAbyssMap;
  const p = team === 'RED' ? m.spawnRed : m.spawnBlue;
  return p ? p.clone() : new THREE.Vector3(0, 0, 0);
}

// 원작 구조물 배치(20차): 양 팀 외곽 포탑·억제기 포탑·억제기·넥서스 포탑 2개·넥서스·분수(우물)를 원작 좌표
// (HA_STRUCTURES_LOL)에 만든다. 구조물 오브젝트(createTurret 등, turret_system.js)는 챔피언 GLB 로더가 정의하는 자원
// (minionBuildingAssets)을 쓰므로 첫 챔피언 로드 때 한 번만 부른다 - 챔피언을 바꿔도 구조물은 그대로 남는다.
// 능력치는 기존 TURRET_DATA(사용자 제공 명세)를 그대로 쓴다 - 칼바람 전용 포탑 능력치는 이번 범위가 아니다.
let howlingAbyssStructuresSpawned = false;
function spawnHowlingAbyssStructures() {
  if (howlingAbyssStructuresSpawned || !howlingAbyssMap || !howlingAbyssMap.group) return false;
  howlingAbyssStructuresSpawned = true;
  if (typeof resetTurretGameClock === 'function') resetTurretGameClock();
  const R = HA_STRUCTURE_RADIUS_LOL;
  const asTurret = (t) => { t.radius = t.collisionRadius = lolRangeToWorld(R.turret); t.selectionRadius = t.radius * 1.3; return t; };
  for (const team of ['BLUE', 'RED']) {
    const s = HA_STRUCTURES_LOL[team];
    turrets.push(asTurret(createTurret(TURRET_TYPE.OUTER1, haLolToWorld(s.outer), team)));
    turrets.push(asTurret(createTurret(TURRET_TYPE.INHIBITOR, haLolToWorld(s.inhibTurret), team)));
    for (const nt of s.nexusTurrets) turrets.push(asTurret(createTurret(TURRET_TYPE.NEXUS_TWIN, haLolToWorld(nt), team)));
    turrets.push(createTurret(TURRET_TYPE.NEXUS_WELL, haLolToWorld(s.fountain), team));
    inhibitorBuildings.push(createInhibitorBuilding(haLolToWorld(s.inhibitor), team, lolRangeToWorld(R.inhibitor)));
    nexusBuildings.push(createNexusBuilding(haLolToWorld(s.nexus), team, lolRangeToWorld(R.nexus)));
  }
  return true;
}

function addTree(x, z, heightRatio, radiusRatio, color) {
  const h = heightRatio * BASE_UNIT, r = radiusRatio * BASE_UNIT;
  const geo = new THREE.CylinderGeometry(r, r * 1.15, h, 8);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:0.8 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}
function addBush(x, z, heightRatio, radiusRatio, color) {
  const h = heightRatio * BASE_UNIT, r = radiusRatio * BASE_UNIT;
  const geo = new THREE.SphereGeometry(r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0, z);
  m.scale.y = h / r;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}
function addRock(x, z, heightRatio, radiusRatio, color) {
  const h = heightRatio * BASE_UNIT, r = radiusRatio * BASE_UNIT;
  const geo = new THREE.DodecahedronGeometry(r, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:0.95, flatShading:true });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.scale.y = h / (r * 2);
  m.rotation.y = Math.random() * Math.PI;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}

const smallTreeLayout = [
  [-9, -6, 2.0, 0.55, 0x2f3d2c], [8, 5, 1.7, 0.6, 0x33422f], [-18, 10, 2.3, 0.5, 0x33422f],
  [-24, -18, 1.8, 0.65, 0x2f3d2c], [12, 26, 2.4, 0.5, 0x2f3d2c],
];
const bigTreeLayout = [
  [-6, 9, 3.4, 0.7, 0x2a3826], [16, -12, 3.0, 0.75, 0x2f3d2c], [22, 14, 3.8, 0.65, 0x2a3826],
  [30, -4, 3.2, 0.7, 0x33422f], [-14, -26, 2.8, 0.72, 0x2a3826], [-30, 4, 3.9, 0.6, 0x33422f],
  [4, -22, 2.6, 0.7, 0x2a3826],
];
const rockLayout = [
  [-3, -12, 0.9, 0.55, 0x555a5e], [11, 9, 1.3, 0.7, 0x4c5155], [-15, -4, 0.75, 0.5, 0x5a5f63],
  [19, -20, 1.1, 0.6, 0x4c5155],
];
const bushLayout = [
  [-2, 4, 0.7, 0.6, 0x3a4d34], [6, -3, 0.55, 0.5, 0x3f5238], [-8, -9, 0.65, 0.55, 0x3a4d34],
  [15, 4, 0.6, 0.5, 0x3f5238], [-12, 14, 0.7, 0.6, 0x3a4d34],
];
if (!howlingAbyssMap.group) smallTreeLayout.forEach(([x, z, hr, rr, c]) => addTree(x, z, hr, rr, c));
if (!howlingAbyssMap.group) bigTreeLayout.forEach(([x, z, hr, rr, c]) => addTree(x, z, hr, rr, c));
if (!howlingAbyssMap.group) rockLayout.forEach(([x, z, hr, rr, c]) => addRock(x, z, hr, rr, c));
if (!howlingAbyssMap.group) bushLayout.forEach(([x, z, hr, rr, c]) => addBush(x, z, hr, rr, c)); // 연습장 장식 - 맵의 실제 부쉬(brush_system.js)와 헷갈리지 않게 맵에서는 뺀다

