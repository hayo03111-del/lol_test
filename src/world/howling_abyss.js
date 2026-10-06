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
  laneMinZ: -125, laneMaxZ: 125,
  blueBaseZ: -106.5, redBaseZ: 106.5,
  blueNexusZ: -94.5, redNexusZ: 94.5,
  blueTurretZ: -66, redTurretZ: 66,
};

function createHowlingAbyssMap(scene) {
  const cfg = HA_MAP_CONFIG;
  const group = new THREE.Group();
  const bridgeLen = cfg.laneMaxZ - cfg.laneMinZ;
  const bridgeWidth = cfg.laneMaxX - cfg.laneMinX; // 14
  // 요청("각 끝 쪽 부분의 넓이를 늘려줘") - 실제 칼바람 나락처럼 기지
  // 근처는 다리보다 넓은 개활지여야 한다. 각 끝(기지)에서 안쪽으로
  // WIDEN_ZONE_DEPTH만큼은 폭이 점점 넓어지다가 기지에서 최대
  // WIDEN_EXTRA_X만큼 더 넓어진다. 벽/난간/체인/바닥 타일/이동 범위
  // (clampPosition) 전부 이 하나의 함수를 공유해서 서로 어긋나지 않는다.
  // 요청("끝쪽 넓이가 2배정도 넓고... 구조물은 건드리지 말고") - 사진을
  // 보면 기지 쪽 폭이 다리 폭의 대략 2배 정도다. WIDEN_EXTRA_X를 6 -> 10.5로
  // 늘려서 맨 끝 폭(10.5+10.5=21 반폭, 즉 전체 폭 42)이 다리 폭(21)의
  // 약 2배가 되게 했다. WIDEN_ZONE_DEPTH는 라인 길이가 늘어난 만큼(+12)
  // 같이 늘려서, 구조물 좌표는 그대로 둔 채(요청) 넓어지는 구간이 시작되는
  // 지점(포탑/억제기 근처)은 예전과 똑같이 유지하고 끝만 새 경계까지 늘렸다.
  // 요청("끝쪽은 이런 구조야" - 손그림 첨부) - 완만하게 벌어지는 곡선이
  // 아니라, 좁은 다리가 이어지다가 한 지점에서 각진 사각형 방(플라자)으로
  // 갑자기 넓어지는 구조다(그림에서 벽이 직각으로 꺾임). WIDEN_ZONE_DEPTH
  // 안쪽은 전부 최대폭을 쓰고, 문턱(DOORWAY_TRANSITION) 몇 유닛 안에서만
  // 짧게 보간해 완전히 끊겨 보이지(z-fighting) 않게 한다 - 나머지는 각진
  // 사각형 방처럼 보인다.
  const WIDEN_ZONE_DEPTH = 42;
  const WIDEN_EXTRA_X = 10.5;
  const DOORWAY_TRANSITION = 3;
  function widenExtraForZ(z) {
    const distFromEnd = Math.min(cfg.laneMaxZ - z, z - cfg.laneMinZ);
    if (distFromEnd >= WIDEN_ZONE_DEPTH) return 0;
    if (distFromEnd <= WIDEN_ZONE_DEPTH - DOORWAY_TRANSITION) return WIDEN_EXTRA_X; // 문턱을 넘으면 곧바로 최대폭(사각형 방)
    const t = (WIDEN_ZONE_DEPTH - distFromEnd) / DOORWAY_TRANSITION; // 문턱 근처 몇 유닛만 짧게 보간
    return t * WIDEN_EXTRA_X;
  }
  const ASSET = 'https://raw.communitydragon.org/latest/game/assets/maps/kitpieces/howling_abyss/textures/';
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  const texCache = new Map();
  function tex(name, rx=1, ry=1) {
    const key=name+'|'+rx+'|'+ry;
    if(texCache.has(key)) return texCache.get(key);
    const t=loader.load(ASSET+name,undefined,undefined,e=>console.warn('Howling Abyss texture:',name,e));
    t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(rx,ry); t.colorSpace=THREE.SRGBColorSpace;
    if(typeof renderer!=='undefined' && renderer.capabilities) t.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    texCache.set(key,t); return t;
  }
  function mat(name,opt={}) {
    return new THREE.MeshStandardMaterial({map:tex(name,opt.rx??1,opt.ry??1),color:opt.color??0xffffff,
      roughness:opt.roughness??.88,metalness:opt.metalness??0,transparent:!!opt.transparent,
      opacity:opt.opacity??1,alphaTest:opt.alphaTest??0,side:opt.side??THREE.FrontSide});
  }
  function colorMat(c,r=.85,m=0,e=0,ei=0){return new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,emissive:e,emissiveIntensity:ei});}
  function add(geo,ma,pos=[0,0,0],rot=[0,0,0],scale=null,parent=group){
    if(!pos)pos=[0,0,0]; if(!rot)rot=[0,0,0];
    const o=new THREE.Mesh(geo,ma); o.position.set(...pos); o.rotation.set(...rot); if(scale)o.scale.set(...scale);
    o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
  }
  function segmentBetween(a,b,r=.05,ma=colorMat(0x27343a,.6,.45)){
    const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(.5), d=new THREE.Vector3().subVectors(b,a), len=d.length();
    const o=add(new THREE.CylinderGeometry(r,r,len,6),ma,mid);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); o.castShadow=false; return o;
  }

  // ============================================================
  // 1) BRIDGE FLOOR: IMAGE-TILED, NOT MODELED.
  // ------------------------------------------------------------
  // The playable bridge surface is intentionally a single flat plane.
  // The real CommunityDragon lane-ground texture is copied/repeated across
  // the UVs so the floor reads like a continuous game-map texture rather
  // than a collection of 3D stone slabs.
  // ============================================================
  // Dark structural underside: never visible from the normal gameplay view,
  // but prevents the bridge from looking paper-thin from low camera angles.
  add(new THREE.BoxGeometry(bridgeWidth+1.8,1.5,bridgeLen+2),colorMat(0x15242c,.98),[0,-.7,0]);

  // MAIN IMAGE FLOOR — one plane, tiled texture.
  const floorTexture = tex('structure_lane_ground.png', 3.65, 17.8);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(3.65,17.8);
  floorTexture.offset.set(0,0);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTexture,
    color: 0xffffff,
    roughness: .92,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(bridgeWidth-.06, bridgeLen-.06, 1, 1),
    floorMaterial
  );
  floorMesh.rotation.x = -Math.PI/2;
  floorMesh.position.set(0,.39,0);
  floorMesh.receiveShadow = true;
  floorMesh.castShadow = false;
  floorMesh.name = 'HA_IMAGE_TILED_BRIDGE_FLOOR';
  group.add(floorMesh);

  // A second transparent image layer gives the floor a light frost/snow pass.
  // It is also tiled rather than modeled.
  const snowTexture = tex('basesnow.png', 3.4, 17.0);
  const snowMaterial = new THREE.MeshStandardMaterial({
    map: snowTexture,
    transparent: true,
    opacity: .22,
    roughness: 1,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const snowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(bridgeWidth-.12, bridgeLen-.12, 1, 1),
    snowMaterial
  );
  snowFloor.rotation.x = -Math.PI/2;
  snowFloor.position.set(0,.405,0);
  snowFloor.receiveShadow = false;
  snowFloor.castShadow = false;
  snowFloor.name = 'HA_IMAGE_TILED_SNOW_OVERLAY';
  group.add(snowFloor);

  // 요청("각 끝 쪽 부분의 넓이를 늘려줘") - 위 벽/난간이 기지 근처에서
  // 바깥으로 벌어진 만큼, 그 자리를 실제로 밟고 다닐 수 있게 바닥도
  // 같이 넓힌다. 정확한 곡선(smoothstep) 모양 대신 그 구간을 넉넉히
  // 덮는 사각형 패치 4장(양쪽 끝 × 좌우)만 추가한다 - 걸어보면 이음매가
  // 살짝 보일 수 있지만 "밟을 바닥이 없는" 문제보다 훨씬 낫다.
  for (const endZ of [cfg.laneMinZ, cfg.laneMaxZ]) {
    const dir = endZ > 0 ? -1 : 1; // 기지 쪽에서 라인 중앙 방향
    const patchCenterZ = endZ + dir * WIDEN_ZONE_DEPTH / 2;
    for (const side of [-1, 1]) {
      const patchCenterX = side * (bridgeWidth / 2 + WIDEN_EXTRA_X / 2);
      const flarePatch = new THREE.Mesh(new THREE.PlaneGeometry(WIDEN_EXTRA_X, WIDEN_ZONE_DEPTH, 1, 1), floorMaterial);
      flarePatch.rotation.x = -Math.PI / 2;
      flarePatch.position.set(patchCenterX, .39, patchCenterZ);
      flarePatch.receiveShadow = true;
      group.add(flarePatch);
      const flareSnow = new THREE.Mesh(new THREE.PlaneGeometry(WIDEN_EXTRA_X, WIDEN_ZONE_DEPTH, 1, 1), snowMaterial);
      flareSnow.rotation.x = -Math.PI / 2;
      flareSnow.position.set(patchCenterX, .405, patchCenterZ);
      group.add(flareSnow);
      // 구조용 슬랩(아래에서 봤을 때 빈 공간이 안 보이게)도 같이 늘린다.
      add(new THREE.BoxGeometry(WIDEN_EXTRA_X, 1.5, WIDEN_ZONE_DEPTH), colorMat(0x15242c, .98), [patchCenterX, -.7, patchCenterZ]);
    }
  }

  // 중앙의 얼음 문양/깨진 빛 타일.
  for(let z=cfg.laneMinZ+7;z<cfg.laneMaxZ;z+=10.5){
    const s=add(new THREE.PlaneGeometry(1.25,2.4),mat('prop_bridge_keystone.png',{rx:1,ry:1,roughness:.55,transparent:true,opacity:.72}),[0,.445,z],[-Math.PI/2,0,0]); s.castShadow=false;
    add(new THREE.TorusGeometry(.45,.035,6,20),colorMat(0x9feaff,.28,0,0x46cfff,.55),[0,.47,z],[Math.PI/2,0,0]).castShadow=false;
  }

  // ============================================================
  // 2) SIDE PARAPETS: segmented walls, towers, chains, wood braces.
  // ============================================================
  const wallA=mat('structure_lane_walls.png',{rx:1.2,ry:1.5,roughness:.86});
  const wallB=mat('structure_lane_walls2.png',{rx:1.2,ry:1.5,roughness:.86});
  const snowWall=mat('prop_icecliff_snowtransition.png',{rx:1,ry:1.4,roughness:.96});
  const wood=mat('prop_woodbeams.png',{rx:1,ry:1.1,roughness:.76});
  const chain=mat('prop_chainlink.png',{roughness:.42,metalness:.5,transparent:true,alphaTest:.08,side:THREE.DoubleSide});
  for(const side of [-1,1]){
    // segmented parapet rather than one long wall
    for(let i=0;i<17;i++){
      const z=cfg.laneMinZ+2+i*((bridgeLen-4)/16);
      const flare=widenExtraForZ(z); // 요청("끝 쪽 넓이 늘리기") - 기지 근처일수록 바깥으로 벌어짐
      const x=side*(10.75+flare);
      const postX=side*(10.92+flare);
      const w=1.8+(i%3===0?.35:0);
      add(new THREE.BoxGeometry(1.0,1.25,w),side<0?wallA:wallB,[x,.68,z]);
      add(new THREE.BoxGeometry(1.15,.16,w+.08),snowWall,[x,1.34,z]);
      // stone post/cap
      add(new THREE.CylinderGeometry(.36,.44,2.15,8),wood,[postX,1.08,z]);
      add(new THREE.CylinderGeometry(.52,.52,.16,8),mat('prop_chain_base_plate.png',{roughness:.65,metalness:.25}),[postX,.16,z]);
    }
    // three hanging chain lines, with actual chain texture used as alpha material
    for(const y of [1.0,1.7,2.28]){
      for(let i=0;i<16;i++){
        const z0=cfg.laneMinZ+2+i*((bridgeLen-4)/16),z1=cfg.laneMinZ+2+(i+1)*((bridgeLen-4)/16);
        const postX0=side*(10.92+widenExtraForZ(z0)),postX1=side*(10.92+widenExtraForZ(z1));
        segmentBetween(new THREE.Vector3(postX0,y,z0),new THREE.Vector3(postX1,y,z1),.045,chain);
      }
    }
  }

  // Underside: crossing beams + hanging chains are visible from the game's elevated camera.
  for(let i=0;i<13;i++){
    const z=cfg.laneMinZ+3+i*((bridgeLen-6)/12);
    add(new THREE.BoxGeometry(1.0,.72,1.0),wood,[0,-1.15,z],[0,0,0]);
    add(new THREE.BoxGeometry(15,.48,.58),wood,[0,-1.55,z],[0,0,0]);
    for(const side of [-1,1]) add(new THREE.BoxGeometry(.5,4.8,.5),wood,[side*5.7,-3.35,z],[0,side*.15,side*.08]);
  }

  // ============================================================
  // 3) OUTSIDE-BRIDGE PLACEHOLDERS (TEMPORARY)
  //    다리 자체의 디테일은 유지하고, 다리 밖의 절벽/기지/장식은
  //    추후 실제 kitpiece 모델로 교체하기 쉽도록 단순한 임시 구조물로 둔다.
  // ============================================================
  const abyssMat = colorMat(0x07141d, .98, 0);
  const iceRockMat = colorMat(0x263d4b, .93, .02);
  const iceSnowMat = colorMat(0x6f8fa0, .9, 0);
  const darkStoneMat = colorMat(0x18262f, .96, .05);

  // 깊은 어비스 바닥 - 고정 길이(190) 대신 실제 다리 길이에 맞춰 계산한다
  // (맵을 길게 늘렸는데 이 바닥판만 예전 길이로 고정돼 있으면 다리 양쪽
  // 끝에서 바닥이 끊겨 보인다).
  add(new THREE.PlaneGeometry(90,bridgeLen+40), abyssMat, [0,-11,0], [-Math.PI/2,0,0]);

  // 다리 바로 바깥에는 낮고 넓은 임시 얼음 절벽 덩어리만 배치한다.
  // 버그 수정("끝쪽에 관통되는 벽... 치우고") - 이 장식 바위들이 예전
  // 좁은 라인 폭(±10.5) 기준으로만 배치돼 있어서, 기지 근처가 넓어진
  // 지금은 오히려 새로 넓어진 플라자 "안쪽"에 파묻혀 플레이어가 그대로
  // 뚫고 지나다니는 것처럼 보였다. 벽과 똑같이 widenExtraForZ()를 더해서
  // 넓어진 구간에서는 바위도 같이 바깥으로 밀려나게 한다.
  for(const side of [-1,1]){
    for(let i=0;i<18;i++){
      const z=cfg.laneMinZ-5+i*((bridgeLen+10)/17);
      const x=side*(13.1+widenExtraForZ(z)+(i%3)*1.25);
      const h=2.8+(i%4)*1.15;
      add(new THREE.CylinderGeometry(1.7+(i%3)*.3,2.5+(i%2)*.45,h,7,1),iceRockMat,
        [x,h*.38,z],[0,(i%5)*.18,0],[1,.9+(i%3)*.12,1.15]);
      add(new THREE.ConeGeometry(1.5+(i%2)*.25,1.6+(i%3)*.35,7),iceSnowMat,
        [x, h+0.15, z],[Math.PI,0.15*(i%3),0],[1,.75,1]);
    }

    // 먼 쪽에 더 큰 실루엣을 만들어 빈 공간을 막는다.
    for(let i=0;i<8;i++){
      const z=cfg.laneMinZ-12+i*((bridgeLen+24)/7);
      const x=side*(19.0+widenExtraForZ(z)+(i%2)*2.2);
      add(new THREE.IcosahedronGeometry(3.2+(i%3)*.8,1),darkStoneMat,
        [x,-.4+(i%3)*.35,z],[.1*i,.25*i,.08*i],[1.1,1.4+(i%2)*.35,1.2]);
    }
  }

  // 절벽 가장자리의 임시 눈 띠
  for(const side of [-1,1]){
    add(new THREE.BoxGeometry(2.0,1.4,bridgeLen+8),iceSnowMat,[side*12.5,.35,0]);
  }

  // ============================================================
  // 4) CENTRAL KEYSTONE - 요청에 따라 제거함(맵 중앙의 돌+크리스탈 조형).
  // ============================================================

  // ============================================================
  // 5) OUTSIDE-BRIDGE BASE PLACEHOLDERS (TEMPORARY)
  //    실제 포탑/억제기/넥서스 시스템과 충돌하지 않도록
  //    맵 장식용의 단순한 플랫폼만 만든다.
  // ============================================================
  // ============================================================
  // 5) BASE UNDERLAY
  // ------------------------------------------------------------
  // 기존의 거대한 직사각형 본진 성벽은 제거했다.
  // 실제 Howling Abyss 스크린샷처럼 본진은 '다리에서 자연스럽게 이어지는
  // 넓은 얼음 플랫폼 + 주변의 불규칙한 절벽'으로 표현한다.
  // ============================================================
  function buildBase(z,sign,team){
    const teamColor = team==='blue' ? 0x43cfff : 0xff5365;
    // ========================================================
    // BASE LAYOUT — revised to the user's latest sketch.
    // Bridge -> twin turrets -> nexus zone -> NEXUS -> well/shop -> end wall.
    // The center/right plaza stays open; there is no pointless enclosure.
    // ========================================================
    const baseGround = mat('structure_base_ground.png',{rx:1.75,ry:1.75,roughness:.95});
    const baseSnow = mat('basesnow.png',{rx:1.8,ry:1.8,roughness:1,transparent:true,opacity:.14,side:THREE.DoubleSide});
    const baseWallMats = [
      mat('structure_base_wall_d.png',{rx:1.0,ry:1.0,roughness:.92,side:THREE.DoubleSide}),
      mat('structure_base_wall_e.png',{rx:1.0,ry:1.0,roughness:.92,side:THREE.DoubleSide}),
      mat('structure_base_wall_f.png',{rx:1.0,ry:1.0,roughness:.92,side:THREE.DoubleSide}),
      mat('structure_base_wall_g.png',{rx:1.0,ry:1.0,roughness:.92,side:THREE.DoubleSide})
    ];
    const iceCliffM = mat('prop_icecliff_h.png',{rx:1.0,ry:1.0,roughness:.96});
    const iceSnowM = mat('prop_icecliff_snowtransition.png',{rx:1.0,ry:1.0,roughness:.95,transparent:true,alphaTest:.04,side:THREE.DoubleSide});
    const iceChunkM = mat('prop_ice_chunksa.png',{rx:1.0,ry:1.0,roughness:.95});
    const icicleM = mat('prop_icicles_c.png',{rx:1.0,ry:1.0,roughness:.9,transparent:true,alphaTest:.06,side:THREE.DoubleSide});
    const shopM = mat('props_sw_shop_ice_frame.png',{rx:1,ry:1,roughness:.82,transparent:true,alphaTest:.04,side:THREE.DoubleSide});
    const statueBaseM = mat('statue_base.png',{rx:1,ry:1,roughness:.74,transparent:true,alphaTest:.04,side:THREE.DoubleSide});

    // 1) Open base floor. It expands from the bridge, with no side walls.
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(42,48,1,1),baseGround);
    plaza.rotation.x=-Math.PI/2;
    plaza.position.set(0,.415,z+sign*1.0);
    plaza.receiveShadow=true;
    group.add(plaza);
    const snowLayer = new THREE.Mesh(new THREE.PlaneGeometry(41.8,47.8,1,1),baseSnow);
    snowLayer.rotation.x=-Math.PI/2;
    snowLayer.position.set(0,.426,z+sign*1.0);
    group.add(snowLayer);

    // 2) Narrow-to-wide transition from the bridge.
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(31.5,16,1,1),baseGround);
    throat.rotation.x=-Math.PI/2;
    throat.position.set(0,.418,z-sign*15.5);
    group.add(throat);

    // 3) Twin turret zone — real gameplay turrets occupy the two pads.
    const turretZoneZ = z-sign*22.5;
    const turretPad = new THREE.Mesh(new THREE.PlaneGeometry(30,11,1,1),baseGround);
    turretPad.rotation.x=-Math.PI/2;
    turretPad.position.set(0,.422,turretZoneZ);
    group.add(turretPad);
    for(const x of [-3.0,3.0]){
      const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.05,2.3,.18,20),baseGround);
      pad.position.set(x,.51,turretZoneZ);
      group.add(pad);
    }

    // 4) Open nexus approach zone between twin turrets and the Nexus.
    const nexusApproachZ = z-sign*9.0;
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(34,17,1,1),baseGround);
    approach.rotation.x=-Math.PI/2;
    approach.position.set(0,.423,nexusApproachZ);
    group.add(approach);

    // 5) NEXUS: the round area from the sketch is now the actual Nexus location.
    const nexusZ = z + sign*3.5; // RED +Z / BLUE -Z, in front of the rear facilities
    const nexusPad = new THREE.Mesh(new THREE.CylinderGeometry(6.2,6.7,.30,32),baseGround);
    nexusPad.position.set(0,.52,nexusZ);
    nexusPad.receiveShadow=true;
    group.add(nexusPad);
    const nexusRing = new THREE.Mesh(
      new THREE.RingGeometry(4.15,4.45,40),
      new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:.35,roughness:.5,transparent:true,opacity:.62,side:THREE.DoubleSide})
    );
    nexusRing.rotation.x=-Math.PI/2;
    nexusRing.position.set(0,.68,nexusZ);
    group.add(nexusRing);

    // 6) REAR FACILITIES: well in the center, shop on the left, right side empty.
    const wellZ = z + sign*10.0;
    const wellPad = new THREE.Mesh(new THREE.CylinderGeometry(5.0,5.45,.25,32),baseGround);
    wellPad.position.set(0,.50,wellZ);
    group.add(wellPad);
    const wellRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.05,.20,8,40),
      new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:.42,roughness:.55,transparent:true,opacity:.78})
    );
    wellRing.rotation.x=Math.PI/2;
    wellRing.position.set(0,.66,wellZ);
    group.add(wellRing);
    const wellCore = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15,2.5,.42,20),
      new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:.8,roughness:.25,metalness:.1,transparent:true,opacity:.92})
    );
    wellCore.position.set(0,.78,wellZ);
    group.add(wellCore);

    const shopZ = wellZ;
    const shopG = new THREE.Group();
    shopG.position.set(-9.2,.42,shopZ);
    const shopBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.8,.34,10),statueBaseM);
    shopG.add(shopBase);
    const shopFrame = new THREE.Mesh(new THREE.CylinderGeometry(2.35,2.35,2.5,8),shopM);
    shopFrame.position.y=1.25;
    shopG.add(shopFrame);
    const shopGlow = new THREE.Mesh(new THREE.OctahedronGeometry(.58,1),new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:.9,roughness:.22}));
    shopGlow.position.y=2.72;
    shopG.add(shopGlow);
    shopG.userData.type='shop_visual';
    shopG.userData.team=team;
    group.add(shopG);

    // 7) Nexus obelisk: behind the Nexus and behind the well, just before the end wall.
    const obeliskZ = z + sign*14.0;
    const obelisk = new THREE.Group();
    obelisk.position.set(0,.42,obeliskZ);
    const obBase = new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.8,.5,12),statueBaseM);
    obelisk.add(obBase);
    const obBody = new THREE.Mesh(new THREE.ConeGeometry(.82,2.8,6),iceChunkM);
    obBody.position.y=1.55;
    obelisk.add(obBody);
    const obGlow = new THREE.Mesh(new THREE.OctahedronGeometry(.62,1),new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:1.0,roughness:.2}));
    obGlow.position.y=3.0;
    obelisk.add(obGlow);
    obelisk.userData.type='nexus_obelisk';
    obelisk.userData.team=team;
    group.add(obelisk);

    // 7) End wall: close the very end of the map with actual Howling Abyss base-wall textures.
    // It is only at the far rear edge; the play area in front stays completely open.
    const wallZ = z + sign*17.0;
    const wallW = 41.5, wallH = 7.0;
    const wallPieces = 4;
    for(let i=0;i<wallPieces;i++){
      const x = -wallW/2 + (i+.5)*(wallW/wallPieces);
      const pieceW = wallW/wallPieces + .12;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(pieceW,wallH,1,1),baseWallMats[i]);
      wall.position.set(x,wallH*.5,wallZ);
      wall.rotation.y = sign>0 ? 0 : Math.PI;
      wall.receiveShadow=true;
      wall.castShadow=true;
      group.add(wall);
    }
    // Low wall footing + irregular ice to blend the wall into the map instead of a floating rectangle.
    const wallFoot = new THREE.Mesh(new THREE.BoxGeometry(wallW+.8,1.0,1.3),mat('structure_base_lower_wall.png',{rx:1,ry:1,roughness:.95}));
    wallFoot.position.set(0,.45,wallZ-sign*.45);
    group.add(wallFoot);
    for(const side of [-1,1]){
      for(let i=0;i<5;i++){
        const x=side*(10.5+i*2.0);
        const h=2.0+(i%3)*.7;
        add(new THREE.ConeGeometry(.8+(i%2)*.25, h, 7),iceChunkM,
          [x,.55+h*.5,wallZ-sign*(.4+(i%2)*.25)],[Math.PI,0,.08*side]);
        if(i%2===0){
          add(new THREE.ConeGeometry(.42,.95,7),icicleM,
            [x-side*.45,h+1.1,wallZ-sign*.1],[Math.PI,0,.1*side]);
        }
      }
    }

    // 8) Natural side cliffs stay outside the playable plaza — no artificial side walls.
    for(const side of [-1,1]){
      for(let i=0;i<8;i++){
        const x=side*(22.5+i*1.0);
        const zz=z-sign*(15-i*2.4);
        const h=2.5+(i%4)*.8;
        add(new THREE.DodecahedronGeometry(1.55+(i%3)*.38,1),i%2?iceCliffM:iceSnowM,
          [x,h*.35,zz],[.03*i,.15*i*side,0],[1.35,1.0+h*.2,1.12]);
      }
    }
    // Rear corners: use cliff + snow transition to make the end wall feel embedded in the ice.
    for(const side of [-1,1]){
      for(let i=0;i<4;i++){
        const x=side*(13.5+i*2.1);
        const zz=wallZ-sign*(1.0+i*.65);
        add(new THREE.ConeGeometry(1.0+(i%2)*.25,2.0+(i%3)*.45,7),iceCliffM,
          [x,1.0+(i%3)*.4,zz],[Math.PI,0,.1*side]);
      }
    }
  }
  // 버그 수정(사용자 지적 "넥서스 뒤에 파란색 원들... 다 지워줘") - buildBase()
  // 는 예전(초기) 기지 장식 함수인데, 이후 더 다듬어진 addBaseEndDetail()
  // (아래에서 호출)이 사실상 같은 자리에 같은 종류(넥서스/우물 바닥+링)를
  // 또 그리고 있었다 - 둘 다 호출되다 보니 넥서스/우물 주변에 원형 장식이
  // 두 겹으로 겹쳐 보였다. buildBase() 호출을 제거해서 addBaseEndDetail()
  // 하나만 남긴다(함수 정의 자체는 다른 곳에서 참조하지 않아 안전하게
  // 죽은 코드로 남겨둔다 - 호출만 없어지면 더 이상 그려지지 않는다).

  // ============================================================
  // 6) ICONIC PROPS: braziers, shops, chains and small ice chunks.
  // ============================================================
  function brazier(x,z){
    const g=new THREE.Group();group.add(g);g.position.set(x,0,z);
    add(new THREE.CylinderGeometry(.66,.84,.44,10),mat('prop_brazier_2.png',{roughness:.5,metalness:.3}),[0,1.08,0],[0,0,0],null,g);
    add(new THREE.CylinderGeometry(.13,.17,1.1,8),colorMat(0x364149,.55,.35),[0,.55,0],[0,0,0],null,g);
    add(new THREE.ConeGeometry(.3,.76,10),colorMat(0xff9a42,.3,0,0xff4a12,2.0),[0,1.7,0],[0,0,0],null,g);
    // 최적화(문서 4-8절): 다리를 따라 최대 18개까지 배치되는 화로마다
    // 실시간 PointLight를 하나씩 켜면(예전 방식) 포워드 렌더러가 모든
    // 조명을 픽셀마다 계산하는 이 프로젝트 구조상 광원 개수가 그대로
    // 셰이더 비용에 곱해진다. 불꽃 콘 메시의 emissive(주황색, 강도 2.0)
    // 만으로도 "빛나는 화로"처럼 충분히 보이므로 실제 광원은 만들지 않는다.
  }
  for(let z=cfg.laneMinZ+5;z<cfg.laneMaxZ-4;z+=15.5){brazier(-7.75,z);brazier(7.75,z);}

  function shop(x,z){
    // 임시 상점: 추후 실제 shop kitpiece로 교체
    const g=new THREE.Group();group.add(g);g.position.set(x,0,z);
    add(new THREE.CylinderGeometry(2.0,2.35,.3,10),darkStoneMat,[0,.15,0],null,null,g);
    add(new THREE.ConeGeometry(2.25,1.35,8),iceRockMat,[0,1.15,0],null,null,g);
    add(new THREE.OctahedronGeometry(.38,1),colorMat(0x9bdfff,.2,0,0x55cfff,.8),[0,1.45,0]);
  }
  // Blue-side visual placeholders. Red gameplay structures are created later and remain untouched.
  function nexusPlaceholder(team,z){
    const g=new THREE.Group();
    const c=team==='blue'?0x49cfff:0xff5968;
    add(new THREE.CylinderGeometry(2.7,3,.5,18),colorMat(0x2f4854,.55,.2),[0,.45,z],[0,0,0],null,g);
    add(new THREE.TorusGeometry(2.35,.27,10,36),colorMat(c,.2,0,c,.9),[0,.78,z],[Math.PI/2,0,0],null,g);
    add(new THREE.OctahedronGeometry(1.55,1),colorMat(c,.15,0,c,1.15),[0,2.45,z],[0,.3,0],null,g);
    g.userData.type='nexus';g.userData.team=team;group.add(g);return g;
  }

  // ============================================================
  // 5-A) HIGH-DETAIL BASE END ZONES
  // ------------------------------------------------------------
  // CommunityDragon의 실제 Howling Abyss 기지용 텍스처를 이용해
  // 다리 끝부분을 단순한 원형 플랫폼이 아니라 넓은 얼음 요새/광장처럼
  // 보이게 만든다. 게임플레이 오브젝트와 겹치지 않는 순수 시각 레이어.
  // ============================================================
  // ============================================================
  // 5-A) REFERENCE-MATCHED BASE PLAZA
  // ------------------------------------------------------------
  // 사용자가 제공한 Howling Abyss 이미지를 기준으로 재구성.
  //
  // 핵심:
  // 1. 기존의 거대한 직선형 본진 벽을 전부 제거했다.
  // 2. 다리 -> 넓어지는 얼음 광장 -> 본진 구조물 순으로 자연스럽게 이어진다.
  // 3. 광장 가장자리는 직사각형 성벽이 아니라 불규칙한 얼음/암석 절벽이다.
  // 4. CommunityDragon의 실제 HA 텍스처를 평면/저폴리 구조물에 적용한다.
  // ============================================================
  // ============================================================
  // 5-A) OPEN BASE PLAZA — REFERENCE / SKETCH MATCH
  // ------------------------------------------------------------
  // 본진은 성벽으로 둘러싸인 요새가 아니다.
  // 다리 -> 넓은 개방형 얼음 광장 -> 넥서스 구역 순으로 이어진다.
  // 양옆/후방은 플레이 공간을 막는 벽 대신 낮고 불규칙한 얼음 절벽으로만
  // 처리한다. CommunityDragon Howling Abyss 텍스처를 적극적으로 사용한다.
  // ============================================================
  function addBaseEndDetail(baseZ, sign, team){
    const teamColor = team==='blue' ? 0x43cfff : 0xff5365;
    const baseGround = mat('structure_base_ground.png',{rx:2.2,ry:2.2,roughness:.96});
    const snow = mat('basesnow.png',{rx:2.1,ry:2.1,roughness:1,transparent:true,opacity:.16});
    const iceCliff = mat('prop_icecliff_h.png',{rx:1.0,ry:1.15,roughness:.96});
    const iceCliffF = mat('prop_icecliff_f.png',{rx:1.0,ry:1.0,roughness:.96});
    const iceChunks = mat('prop_ice_chunksa.png',{rx:1.0,ry:1.0,roughness:.95});
    const icicles = mat('prop_icicles_c.png',{rx:1.0,ry:1.0,roughness:.9,transparent:true,alphaTest:.06,side:THREE.DoubleSide});
    const shopMat = mat('props_sw_shop_ice_frame.png',{rx:1,ry:1,roughness:.82,transparent:true,alphaTest:.04,side:THREE.DoubleSide});
    const statueBaseMat = mat('statue_base.png',{rx:1,ry:1,roughness:.74,transparent:true,alphaTest:.04,side:THREE.DoubleSide});

    // ========================================================
    // BASE LAYOUT — exactly the requested open-plan shape.
    // From the bridge inward:
    //   twin turrets -> nexus zone -> well/shop -> nexus/obelisk.
    // The right side is intentionally left open and empty.
    // No enclosing base wall, no giant gate, no decorative barrier.
    // ========================================================

    // 1) Broad open base floor. It widens immediately after the bridge.
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(42,46,1,1),baseGround);
    plaza.rotation.x=-Math.PI/2;
    plaza.position.set(0,.415,baseZ+sign*0.5);
    plaza.receiveShadow=true;
    group.add(plaza);
    const plazaSnow = new THREE.Mesh(new THREE.PlaneGeometry(41.9,45.9,1,1),snow);
    plazaSnow.rotation.x=-Math.PI/2;
    plazaSnow.position.set(0,.425,baseZ+sign*0.5);
    group.add(plazaSnow);

    // 2) Short transition from the narrow bridge into the wide base.
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(31.5,15.5,1,1),baseGround);
    throat.rotation.x=-Math.PI/2;
    throat.position.set(0,.418,baseZ-sign*16.5);
    throat.receiveShadow=true;
    group.add(throat);

    // 3) Twin-turret zone: visually marked, but left open for real turret objects.
    const turretZoneZ = baseZ-sign*22.5;
    const turretPad = new THREE.Mesh(new THREE.PlaneGeometry(28,10,1,1),baseGround);
    turretPad.rotation.x=-Math.PI/2;
    turretPad.position.set(0,.422,turretZoneZ);
    group.add(turretPad);
    for(const x of [-3.0,3.0]){
      const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.0,2.25,.18,20),baseGround);
      pad.position.set(x,.51,turretZoneZ);
      group.add(pad);
    }

    // 4) Nexus-zone floor between twin turrets and the fountain/well.
    const nexusZoneZ = baseZ-sign*12.0;
    const nexusZone = new THREE.Mesh(new THREE.PlaneGeometry(34,12,1,1),baseGround);
    nexusZone.rotation.x=-Math.PI/2;
    nexusZone.position.set(0,.423,nexusZoneZ);
    group.add(nexusZone);
    // 버그 수정(사용자 지적 "파란색 원들... 우물 원 하나만 남기고 지워줘") -
    // 여기 있던 zoneRune(넥서스 구역 장식 링)을 제거했다. 우물 원(wellRing)
    // 하나만 "우물을 표시하는 원"으로 남긴다.

    // 5) WELL / FOUNTAIN: centered, between the nexus and twin-turret zone.
    // Gameplay fountain turret is moved to the same coordinate elsewhere.
    const wellZ = baseZ-sign*5.0;
    const wellPad = new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.6,.24,28),baseGround);
    wellPad.position.set(0,.49,wellZ);
    wellPad.receiveShadow=true;
    group.add(wellPad);
    const wellRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.3,.19,8,36),
      new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:.32,roughness:.6,transparent:true,opacity:.72})
    );
    wellRing.rotation.x=Math.PI/2;
    wellRing.position.set(0,.64,wellZ);
    group.add(wellRing);

    // 6) SHOP: only on the LEFT side. The RIGHT side remains intentionally empty.
    const shopZ = wellZ;
    const shopG=new THREE.Group();
    shopG.position.set(-10.0,.42,shopZ);
    const shopBase=new THREE.Mesh(new THREE.CylinderGeometry(2.45,2.75,.34,10),statueBaseMat);
    shopG.add(shopBase);
    const shopFrame=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.25,2.35,8),shopMat);
    shopFrame.position.y=1.2;
    shopG.add(shopFrame);
    const shopCrystal=new THREE.Mesh(new THREE.OctahedronGeometry(.52,1),new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:.85,roughness:.25}));
    shopCrystal.position.y=2.62;
    shopG.add(shopCrystal);
    shopG.userData.type='shop_visual';
    shopG.userData.team=team;
    group.add(shopG);

    // 7) REAR NEXUS PLATFORM + NEXUS + OBELISK.
    // This is the far end of the base, beyond the well, exactly like the sketch.
    const nexusZ = baseZ + sign*7.0;
    const nexusPad = new THREE.Mesh(new THREE.CylinderGeometry(7.0,7.6,.26,28),baseGround);
    nexusPad.position.set(0,.52,nexusZ);
    nexusPad.receiveShadow=true;
    group.add(nexusPad);

    // The real Nexus gameplay object is created later at HA_MAP_CONFIG.*NexusZ.
    // 버그 수정(사용자 지적 "파란색 원들... 우물 원 하나만 남기고 지워줘") -
    // 여기 있던 nexusHalo(넥서스 후광 링)도 제거했다.

    // Obelisk sits behind the Nexus, at the farthest playable end.
    const obeliskZ = baseZ + sign*15.5;
    const obelisk = new THREE.Group();
    obelisk.position.set(0,.42,obeliskZ);
    const obBase = new THREE.Mesh(new THREE.CylinderGeometry(1.65,1.95,.55,12),statueBaseMat);
    obelisk.add(obBase);
    const obBody = new THREE.Mesh(new THREE.ConeGeometry(.95,3.25,6),iceChunks);
    obBody.position.y=1.72;
    obelisk.add(obBody);
    const obGlow = new THREE.Mesh(new THREE.OctahedronGeometry(.74,1),new THREE.MeshStandardMaterial({color:teamColor,emissive:teamColor,emissiveIntensity:1.0,roughness:.2,metalness:.05}));
    obGlow.position.y=3.3;
    obelisk.add(obGlow);
    obelisk.userData.type='nexus_obelisk';
    obelisk.userData.team=team;
    group.add(obelisk);

    // 8) Keep the entire right side empty. No decorative counterpart to the shop.
    // Only natural cliff formations remain OUTSIDE the playable width.

    // 9) Natural ice cliffs beyond the playable area. These are not walls and do not
    // block the open base. They stay outside ±21 so the player sees a deep abyss.
    for(const side of [-1,1]){
      for(let i=0;i<9;i++){
        const x=side*(22.8+i*1.05+(i%2)*.55);
        const z=baseZ-sign*(16.0-i*2.7);
        const h=2.6+(i%4)*.85;
        const rockMat=i%3===0?iceCliffF:(i%3===1?iceCliff:iceChunks);
        add(new THREE.DodecahedronGeometry(1.55+(i%3)*.42,1),rockMat,
          [x,h*.36,z],[.04*i,.18*i*side,0],[1.35,1.0+h*.2,1.12]);
        if(i%2===0){
          add(new THREE.ConeGeometry(.7+(i%3)*.16,1.65+(i%2)*.45,7),icicles,
            [x-side*.38,h+1.0,z+sign*.55],[Math.PI,0,.12*side]);
        }
      }
    }

    // 10) Rear natural ice formations only. No straight rear wall.
    for(const side of [-1,1]){
      for(let i=0;i<6;i++){
        const x=side*(10.5+i*2.0);
        const z=baseZ+sign*(18.0+(i%2)*1.8);
        const h=2.1+(i%3)*.85;
        add(new THREE.IcosahedronGeometry(1.45+(i%2)*.4,1),i%2?iceCliff:iceCliffF,
          [x,h*.35,z],[0,.25*i,0],[1.25,1.0+h*.18,1.15]);
      }
    }

    // Small natural ice chunks near the perimeter only. Keep the central/right
    // play area clear for the player, minions, shop and fountain.
    for(let i=0;i<8;i++){
      const side=i%2?-1:1;
      const x=side*(14.5+(i%4)*1.45);
      const z=baseZ-sign*(2+(i%4)*4.2);
      add(new THREE.ConeGeometry(.35+(i%3)*.12,1.0+(i%4)*.28,6),iceChunks,
        [x,.8,z],[Math.PI,0,.1*i]);
    }
  }
  addBaseEndDetail(cfg.blueBaseZ,-1,'blue');
  addBaseEndDetail(cfg.redBaseZ,1,'red');

  function turretPlaceholder(team,z){
    const g=new THREE.Group(),c=team==='blue'?0x50d7ff:0xff626b;
    add(new THREE.CylinderGeometry(1.0,1.3,3.8,12),colorMat(team==='blue'?0x315b73:0x703d45,.55,.15),[0,1.9,z],[0,0,0],null,g);
    add(new THREE.ConeGeometry(1.08,1.55,12),mat('ha_ap_hero_tower2.png',{roughness:.68}),[0,4.55,z]);
    add(new THREE.OctahedronGeometry(.44,1),colorMat(c,.15,0,c,1.1),[0,5.5,z]);
    g.userData.type='turret';g.userData.team=team;g.userData.hp=1000;group.add(g);return g;
  }

  // Snow and ice motes.
  // 임시(경량) 처리: 파티클 수를 대폭 줄이고, 프레임당 BufferAttribute
  // getX/getY/setXYZ 호출(함수 오버헤드) 대신 Float32Array를 직접 읽고
  // 쓰도록 바꿔서 최적화함. 매 프레임 Math.sin 호출도 절반으로 줄임
  // (한 프레임 걸러 위상만 갱신). 눈이 내리는 느낌 자체는 동일하게 유지.
  const snowCount=420,geo=new THREE.BufferGeometry(),positions=new Float32Array(snowCount*3),vel=new Float32Array(snowCount),phase=new Float32Array(snowCount),wob=new Float32Array(snowCount);
  for(let i=0;i<snowCount;i++){positions[i*3]=(Math.random()-.5)*38;positions[i*3+1]=Math.random()*25;positions[i*3+2]=cfg.laneMinZ-15+Math.random()*(bridgeLen+30);vel[i]=1+Math.random()*2.1;phase[i]=Math.random()*Math.PI*2;}
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const snow=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:.065,transparent:true,opacity:.68,depthWrite:false,sizeAttenuation:true}));
  snow.frustumCulled=false;group.add(snow);
  let snowFrameToggle=false;
  function updateSnow(dt,focusPos){
    const cx=focusPos?.x??0,cz=focusPos?.z??0;
    snowFrameToggle=!snowFrameToggle;
    for(let i=0;i<snowCount;i++){
      const idx=i*3;
      let y=positions[idx+1]-vel[i]*dt;
      if(snowFrameToggle){phase[i]+=dt*1.3;wob[i]=Math.sin(phase[i])*.13;}
      let x=positions[idx]+wob[i]*dt-.12*dt;
      let z=positions[idx+2]-.025*dt;
      if(y<0){y=19+Math.random()*7;x=cx+(Math.random()-.5)*38;z=cz+(Math.random()-.5)*55;}
      positions[idx]=x;positions[idx+1]=y;positions[idx+2]=z;
    }
    geo.attributes.position.needsUpdate=true;
  }

  // ============================================================
  // 7) ATMOSPHERE: blue fog, cold key light, warm fire contrast.
  // ------------------------------------------------------------
  // 최적화(문서 4-8절 "Ambient + 기본 Directional Light 정도로 끝내라"):
  // 예전에는 여기서 새 HemisphereLight + DirectionalLight 2개(moon/fill)를
  // 씬에 추가로 얹어서, 기존 베이스 조명(hemi/dirLight)과 합쳐 총 5개의
  // 실시간 광원이 동시에 켜져 있었다 - Three.js 기본(non-clustered) 포워드
  // 렌더러는 모든 조명을 픽셀마다 전부 계산하므로 저사양 GPU에 특히
  // 비싸다. 새 광원을 추가하는 대신 이미 있는 hemi/dirLight의 색상만
  // 얼음 맵 분위기(차가운 키라이트)로 바꿔서 재사용한다 - 광원 개수는
  // 시작부터 끝까지 hemisphere 1개 + directional 1개, 총 2개로 고정된다.
  scene.fog=new THREE.FogExp2(0x587082,.0102);
  scene.background=new THREE.Color(0x3f596b);
  hemi.color.setHex(0xc8ebff); hemi.groundColor.setHex(0x101d26); hemi.intensity=0.72;
  dirLight.color.setHex(0xd8efff); dirLight.intensity=0.82; dirLight.position.set(-26,38,-22);

  scene.add(group);
  const pathBlueToRed=[],pathRedToBlue=[];
  for(let i=0;i<11;i++){const z=cfg.laneMinZ+6+(i/10)*(bridgeLen-12);pathBlueToRed.push(new THREE.Vector3(0,.02,z));}
  for(let i=pathBlueToRed.length-1;i>=0;i--)pathRedToBlue.push(pathBlueToRed[i].clone());
  // 요청("각 끝 쪽 부분의 넓이를 늘려줘") - 이동 가능 범위도 벽/바닥과
  // 똑같이 widenExtraForZ()를 그대로 재사용해서 기지 근처에서 더 넓게
  // 걸어다닐 수 있게 한다(서로 다른 값을 쓰면 벽은 넓어졌는데 못 걸어가거나,
  // 반대로 바닥 없는 곳을 걸어가는 불일치가 생긴다).
  function clampPosition(p){const maxX=cfg.laneMaxX+widenExtraForZ(p.z);p.x=THREE.MathUtils.clamp(p.x,-maxX,maxX);p.z=THREE.MathUtils.clamp(p.z,cfg.laneMinZ,cfg.laneMaxZ);return p;}
  function isInsidePlayableArea(p){const maxX=cfg.laneMaxX+widenExtraForZ(p.z);return p.x>=-maxX&&p.x<=maxX&&p.z>=cfg.laneMinZ&&p.z<=cfg.laneMaxZ;}
  return {group,laneMinX:cfg.laneMinX,laneMaxX:cfg.laneMaxX,laneMinZ:cfg.laneMinZ,laneMaxZ:cfg.laneMaxZ,
    spawnBlue:new THREE.Vector3(0,0,cfg.blueBaseZ+10),spawnRed:new THREE.Vector3(0,0,cfg.redBaseZ-10),
    blueNexus:null,redNexus:null,blueTurret:null,redTurret:null,
    pathBlueToRed,pathRedToBlue,clampPosition,isInsidePlayableArea,updateSnow};
}
// 칼바람 나락 맵 제거: ARAM 지형/절벽/장식/눈/맵 그룹을 생성하지 않는다.
const howlingAbyssMap={group:null,laneMinX:-140,laneMaxX:140,laneMinZ:-140,laneMaxZ:140,spawnBlue:new THREE.Vector3(0,0,0),spawnRed:new THREE.Vector3(0,0,0),blueNexus:null,redNexus:null,blueTurret:null,redTurret:null,pathBlueToRed:[],pathRedToBlue:[],clampPosition(p){p.x=THREE.MathUtils.clamp(p.x,-140,140);p.z=THREE.MathUtils.clamp(p.z,-140,140);return p;},isInsidePlayableArea(p){return p.x>=-140&&p.x<=140&&p.z>=-140&&p.z<=140;},updateSnow(){}};
window.HOWLING_ABYSS_MAP=howlingAbyssMap;

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
smallTreeLayout.forEach(([x, z, hr, rr, c]) => addTree(x, z, hr, rr, c));
bigTreeLayout.forEach(([x, z, hr, rr, c]) => addTree(x, z, hr, rr, c));
rockLayout.forEach(([x, z, hr, rr, c]) => addRock(x, z, hr, rr, c));
bushLayout.forEach(([x, z, hr, rr, c]) => addBush(x, z, hr, rr, c));

