/* ============================================================
   0-D. VFX SYSTEM (챔피언과 무관하게 동일하게 재사용)
   ============================================================ */

/* ============================================================
   NILAH OFFICIAL SOURCE VFX TEXTURES
   CommunityDragon mirrors Riot game assets. Quartz's documented
   workflow ports vfxsystems and their textures from League BIN/WAD
   data; this browser build uses the original Nilah particle textures
   directly rather than synthetic Three.js-only artwork.

   변경(하요가 실제 원본 파티클 PNG 파일들을 직접 올려줌 - "E먼저"
   요청): 원격 CommunityDragon URL은 경로가 정확한지 검증할 수 없고
   (텍스처 로드 실패 진단 코드를 이전에 추가해둔 이유), 네트워크
   상태에도 좌우된다. 실제 파일을 받은 카테고리(E)부터 하나씩
   `assets/nilah/` 로컬 경로로 교체한다 - 아직 못 받은 Q/W/R/평타
   카테고리는 원격 URL을 그대로 유지하고, 받는 대로 이어서 교체한다.
   ============================================================ */
const NILAH_VFX_BASE_URL = 'https://raw.communitydragon.org/pbe/game/assets/characters/nilah/skins/base/particles/';
const NILAH_VFX_LOCAL_BASE_URL = 'assets/nilah/';
const NILAH_OFFICIAL_VFX_URLS = {
  // 평타/강화평타: 하요가 실제로 올려준 파일 그대로 로컬 연결.
  baSwipe1: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_ba_swipe_01__1_.png',
  baSwipe2: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_ba_swipe_02__1_.png',
  baSplash: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_ba_linearsplashes_02__1_.png',
  baSplashDissolve: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_ba_linearsplashes_02_dissolve__1_.png',
  baCritTar: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_ba_crit_tar__1_.png',
  baWhiteRgb: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_ba_white_rgb__1_.png',
  armAlpha: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_arm_alpha.png',
  armAlpha2: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_arm_alpha2.png',
  sheathGlow: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_i_sheath_spark_glow.png',
  lightSparks: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_light_sparks.png',
  // Q: 전용 swipe 파일이 아직 없어서 qShield(실제 Q 전용 파일)만 로컬,
  // 나머지는 물결/물방울 테마 로컬 대체 파일로 연결 - 색 틴트도 함께
  // 넣어서(아래 _nilahQSlash) 텍스처 로드 성공 여부와 무관하게 항상
  // 올바른 색으로 보이게 한다.
  qSwipe: NILAH_VFX_LOCAL_BASE_URL+'common_waterspike32.png',
  qSwipe1: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_droplet_rotate_mult.png',
  qSwipe2: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_watercrescent_2x2.png',
  qWater: NILAH_VFX_LOCAL_BASE_URL+'common_blurdrops_water.png',
  qBeamMult: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_glow2.png',
  qShield: NILAH_VFX_LOCAL_BASE_URL+'color_nilah_q_shield.png',
  // W: 전용 halo 파일이 아직 없어서 windwall_dust/windblast만 로컬,
  // 나머지도 로컬 대체 파일로 연결.
  wHalo: NILAH_VFX_LOCAL_BASE_URL+'color_nilah_w_windwall_dust.png',
  wMult: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_mult_windblast_2.png',
  wSand: NILAH_VFX_LOCAL_BASE_URL+'color_nilah_w_windwall_dust.png',
  wSpark: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_p_stardustmote.png',
  wWater: NILAH_VFX_LOCAL_BASE_URL+'common_waterdots.png',
  wWind: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_mult_windblast_2.png',
  // E: 실제 원본 파일 전부 로컬 연결 완료.
  eRing: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_dash_ring.png',
  eWake: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_dash_wake_ground.png',
  eSub: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_dash_sub.png',
  eSplash: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_dash_tar_splash.png',
  eWater: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_wateradd_01.png',
  eWave: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_q_wave_mask.png',
  eCrescent: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_watercrescent_2x2.png',
  eJelly: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_jellyfish01.png',
  eTornado: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_e_tonado.png',
  // R: 실제 원본 파일 전부 로컬 연결 완료 (r_glow 계열은 실제로
  // r_glow_03/r_glow_distort만 받았고 plain r_glow는 아직 없어서
  // r_glow_03으로 통일).
  rRing: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_blastring.png',
  rSwipe: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_cascircle_swirl_scroll_dark_mask.png',
  rGlow: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_glow_03.png',
  rGlow3: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_glow_03.png',
  rFlash: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_flash.png',
  rRipple: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_gradientv.png',
  rSplash: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_blastring2.png',
  rOrbit: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_energystreaksadd.png',
  rSword: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_alphaslice_1.png',
  rEnergy: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_buf_shock.png',
  rConeHit: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_cone_hit.png',
  rEinstein: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_r_einstein_01_mult.png',
  // 패시브(영원한 기쁨): 실제 원본 파일 로컬 연결.
  shieldAura: NILAH_VFX_LOCAL_BASE_URL+'aura_self.png',
  pAlpha: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_p_alphaslice_1.png',
  pBlob: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_p_blobbies03.png',
  pBlobEro: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_p_blobbies03ero.png',
  pStardust: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_p_stardustmote.png',
  pParticles: NILAH_VFX_LOCAL_BASE_URL+'nilah_base_particles_1_57.png'
};

const NILAH_LEAGUE_VFX_MANIFEST = {
  BA: { systems:['ba_swipe_01','ba_swipe_02','ba_linearsplashes_02'], textures:['baSwipe1','baSwipe2','baSplash'], mode:'billboard_emitters' },
  Q: { systems:['q_swipe','q_swipe1','q_swipe2','q_water','q_beam_mult'], textures:['qSwipe','qSwipe1','qSwipe2','qWater','qBeamMult'], mode:'billboard_emitters' },
  W: { systems:['w_halo','w_mult','w_waterthreads','w_sparkle'], textures:['wHalo','wMult','wWater','wSpark'], mode:'persistent_emitters' },
  E: { systems:['e_dash_ring','e_dash_wake_ground','e_dash_sub','e_dash_tar_splash'], textures:['eRing','eWake','eSub','eSplash'], mode:'trail_emitters' },
  R: { systems:['r_swipe_mult','r_ringmult','r_splash_ring','r_puddle_ripples','r_glow','r_flash','r_orbit'], textures:['rSwipe','rRing','rSplash','rRipple','rGlow','rFlash','rOrbit'], mode:'multi_phase_emitters' }
};
const NILAH_SOURCE_TEX={};
const _nilahTexLoader=new THREE.TextureLoader();
// 버그 수정(콘솔 로그 확인 - "Access to image ... blocked by CORS policy ...
// Cross origin requests are only supported for protocol schemes: chrome,
// chrome-extension, ..."): three.js의 Loader는 생성자에서 기본으로
// crossOrigin='anonymous'를 설정한다. 이 프로젝트를 file://로 직접 열면
// (하요 환경 - Chromebook에서 zip을 풀지 않고 그대로 열어보는 경우도 있음)
// 브라우저가 "같은 폴더의 로컬 이미지"조차 CORS 요청으로 취급해 전부
// 차단해버린다(원격 CDN이 아니라 이미 zip 안에 들어있는 assets/nilah/*.png
// 로컬 파일인데도). crossOrigin을 명시적으로 undefined로 되돌리면
// three.js가 <img>에 crossorigin 속성 자체를 아예 안 붙여서, 로컬 file://
// 환경에서도 같은 폴더 이미지가 정상 로드된다(원격 서버로 서빙할 때도
// 같은 오리진이면 동일하게 문제 없음 - crossOrigin 속성이 필요한 경우는
// "다른 도메인"의 이미지를 <canvas>에서 픽셀 단위로 읽어야 할 때뿐인데,
// 이 프로젝트는 그런 용도로 쓰지 않는다).
_nilahTexLoader.crossOrigin = undefined;
// 버그 수정("영상처럼 완벽하게" 검증 중 발견): THREE.TextureLoader.load()는
// URL이 깨져 있어도(404 등) 동기적으로 예외를 던지지 않고, 실패를
// onLoad/onError 콜백으로만 비동기 통지한다. 기존 try/catch는 이 실패를
// 절대 못 잡는 구조였다 - 그래서 CDragon 텍스처 경로가 틀려도 콘솔에
// 아무 경고 없이 조용히 "빈 흰색 사각형"만 남는 상태였다. onLoad/onError를
// 실제로 연결해서, 실패한 텍스처 키를 명확히 콘솔에 남기고
// NILAH_VFX_TEX_STATUS로 성공/실패 여부를 조회할 수 있게 한다 - 판정/전투
// 로직과는 무관한 순수 진단/표시용 코드다.
const NILAH_VFX_TEX_STATUS = {};
function loadNilahSourceTextures(){
  for(const [key,url] of Object.entries(NILAH_OFFICIAL_VFX_URLS)){
    NILAH_VFX_TEX_STATUS[key] = 'loading';
    try{
      const tex=_nilahTexLoader.load(
        url,
        () => { NILAH_VFX_TEX_STATUS[key]='ok'; },
        undefined,
        (err) => { NILAH_VFX_TEX_STATUS[key]='failed'; console.warn('[NILAH VFX] 텍스처 로드 실패(공식 CDragon 경로 확인 필요):', key, url, err); }
      );
      tex.colorSpace=THREE.SRGBColorSpace;
      NILAH_SOURCE_TEX[key]=tex;
    }catch(e){ NILAH_VFX_TEX_STATUS[key]='failed'; console.warn('[NILAH VFX]',key,e); }
  }
  // 3초 뒤 한 번, 아직도 'loading'(=요청이 걸린 채 응답이 없음) 상태인
  // 텍스처가 있으면 그것도 눈에 띄게 남긴다 - 네트워크 차단/CORS 등으로
  // onLoad도 onError도 안 불리는 경우까지 포함해서 진단할 수 있게 한다.
  setTimeout(() => {
    const stuck = Object.entries(NILAH_VFX_TEX_STATUS).filter(([,v]) => v === 'loading').map(([k]) => k);
    if (stuck.length) console.warn('[NILAH VFX] 3초 경과 후에도 응답 없는 텍스처(네트워크/CORS 의심):', stuck);
  }, 3000);
}
loadNilahSourceTextures();

/* ============================================================
   EZREAL Q VFX (실제 텍스처 - 사용자가 올려준
   ezreal_q_fully_standalone.html에 Base64로 내장돼 있던 CommunityDragon
   원본 텍스처 3장을 그대로 추출해 assets/ezreal/ 로 저장한 것). 나무위키
   프레임 대조(ability_0081_Q1.webm)로 확인한 시안색 궤적 + 흰색 코어 +
   임팩트 스파크를 실제 원본 텍스처로 재현한다 - 기존 qPoint(단색 원)
   플레이스홀더 대신 이 3장을 쓴다.
   ============================================================ */
const EZREAL_VFX_LOCAL_BASE_URL = 'assets/ezreal/';
const EZREAL_Q_VFX_URLS = {
  qTrail: EZREAL_VFX_LOCAL_BASE_URL + 'ezreal_q_trail.png',
  qCore:  EZREAL_VFX_LOCAL_BASE_URL + 'ezreal_q_core.png',
  qHit:   EZREAL_VFX_LOCAL_BASE_URL + 'ezreal_q_hit.png',
};
const EZREAL_Q_TEX = {};
function loadEzrealQTextures() {
  // 닐라 텍스처 로더와 동일한 이유로 crossOrigin을 명시적으로 해제한다
  // (file://로 직접 열었을 때 같은 폴더의 로컬 이미지까지 CORS로 막히는
  // 문제 방지 - 위 _nilahTexLoader 주석 참고).
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = undefined;
  for (const [key, url] of Object.entries(EZREAL_Q_VFX_URLS)) {
    try {
      const tex = loader.load(url, undefined, undefined,
        (err) => console.warn('[EZREAL Q VFX] 텍스처 로드 실패:', key, url, err));
      tex.colorSpace = THREE.SRGBColorSpace;
      EZREAL_Q_TEX[key] = tex;
    } catch (e) { console.warn('[EZREAL Q VFX]', key, e); }
  }
}
loadEzrealQTextures();

class VFXSystem {
  constructor(scene) {
    this.scene = scene; this.active = [];
    // Phase 2 요청 11/20 "VFX 객체 Pooling" / "매 명중마다 geometry·texture
    // 생성 금지" - 기존 _makeSprite()는 spawn()마다 새 SpriteMaterial을
    // 만들고, dispose()는 scene.remove()만 하고 material.dispose()가 없어서
    // 계속 누적됐다(요청 20 "dispose 누락을 피한다"). basicAttack/hit/q/e/
    // death가 전부 이 _makeSprite() 하나를 공유하므로(특히 basicAttack/hit는
    // 모든 평타·Projectile 명중마다 호출 - Phase 2에서 포탑까지 연결되며
    // 빈도가 크게 늘어남), 여기 한 곳만 풀로 바꾸면 다섯 종류 이펙트가
    // 전부 함께 해결된다. 텍스처(VFX_TEXTURES)는 원래도 전역 공유라 그대로
    // 두고 material.map/color만 매번 바꿔 재사용한다.
    this._spritePool = [];
  }

  _acquireSprite(texture, color, size, position) {
    let sprite = this._spritePool.pop();
    if (!sprite) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      sprite = new THREE.Sprite(mat);
    }
    sprite.material.map = texture;
    sprite.material.color.set(color);
    sprite.material.opacity = 1;
    sprite.scale.setScalar(size);
    sprite.position.copy(position);
    this.scene.add(sprite);
    return sprite;
  }
  _releaseSprite(sprite) {
    this.scene.remove(sprite);
    this._spritePool.push(sprite); // dispose() 대신 재사용
  }

  _makeSprite(texture, color, size, position) { return this._acquireSprite(texture, color, size, position); }

  spawn(name, position, direction = new THREE.Vector3(0,0,1), options = {}) {
    try {
      switch (name) {
        case 'basicAttack': this._basicAttackFlash(position, direction); break;
        case 'hit': this._hitBurst(position, options.color ?? 0xffffff); break;
        case 'q':
          if (options && options.tornado) this._yasuoTornado(position, direction, options);
          else if (options && options.projectile) this._qProjectile(position, direction, options);
          else if (typeof this._radialBurst === 'function') this._radialBurst(position, VFX_TEXTURES.qPoint, 0x8fe3ff, 1.6);
          break;
        case 'w': this._groundAura(position, VFX_TEXTURES.wAura, 0xffd27a); break;
        case 'e': if (typeof this._radialBurst === 'function') this._radialBurst(position, VFX_TEXTURES.eMark, 0xff5b5b, 1.4); break;
        case 'r': this._ultimateBurst(position); break;
        case 'death': if (typeof this._radialBurst === 'function') this._radialBurst(position, VFX_TEXTURES.death, 0x777777, 2.2); break;
        case 'nilahBA': this._nilahBASwipeFx(position, direction, options); break;
        case 'nilahQ': this._nilahQSlash(position, direction, options); break;
        case 'nilahW': return this._nilahWMist(position, options);
        case 'nilahE': this._nilahEDashTrail(position, direction, options); break;
        case 'nilahRtick': this._nilahRSpin(position, options); break;
        case 'nilahRfinal': this._nilahRFinal(position, options); break;
        case 'nilahHeal': this._nilahHealFx(position, options); break;
        case 'nilahShield': this._nilahShieldFx(position, options); break;
        case 'ezrealQ': this._ezrealQTrail(position, direction, options); break;
        case 'ezrealQHit': this._ezrealQHitFx(position, options); break;
        case 'ezrealRBow': this._ezrealRBow(position, direction, options); break;
        case 'ahriOrbHit': this._radialBurst(position, VFX_TEXTURES.hit, options.color ?? 0xff6fd8, 0.5); break;
        case 'ahriCharm': this._ahriCharmProjectile(position, direction, options); break;
        case 'ahriFoxfireCast': this._groundAura(position, VFX_TEXTURES.hit, 0xff8fe0); break;
        default: break;
      }
    } catch (err) {
      console.warn('[VFX FAIL-SOFT]', name, err);
      return null;
    }
  }

  _radialBurst(position, texture, color = 0xffffff, size = 1.0) {
    const sprite = this._makeSprite(texture, color, size, position.clone());
    const life = 0.18;
    this.active.push({
      sprite,
      life,
      maxLife: life,
      update: (t) => {
        const fade = 1 - t;
        sprite.material.opacity = fade;
        sprite.scale.setScalar(size * (0.85 + t * 0.55));
      },
      dispose: () => this._releaseSprite(sprite),
    });
    return sprite;
  }
  _basicAttackFlash(position, direction) {
    const pos = position.clone().addScaledVector(direction, 0.3);
    const sprite = this._makeSprite(VFX_TEXTURES.flashSharp, 0xffe9a8, 0.5, pos);
    this.active.push({ sprite, life: 0.12, maxLife: 0.12,
      update: (t) => { sprite.material.opacity = 1 - t; sprite.scale.setScalar(0.5 + t * 0.4); },
      dispose: () => this._releaseSprite(sprite) });
  }
  _hitBurst(position, color) {
    const sprite = this._makeSprite(VFX_TEXTURES.hit, color, 0.45, position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0)));
    this.active.push({ sprite, life: 0.22, maxLife: 0.22,
      update: (t) => { sprite.material.opacity = 1 - t; sprite.scale.setScalar(0.45 + t * 0.9); },
      dispose: () => this._releaseSprite(sprite) });
  }
  // 리 신 Q(음파) 전용: 시전 위치에서 마우스 커서가 가리키는 지점을 향해
  // 실제로 이동하는 투사체처럼 보이게 한다. 판정은 _leesinCastQ에서 수행하고,
  // 이 함수는 시각 효과만 담당한다(스킬 판정과 렌더링을 분리).
  _qProjectile(position, direction, options = {}) {
    const dir = (direction ? direction.clone() : new THREE.Vector3(0, 0, 1)).setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    else dir.normalize();
    // 적중 대상이 있으면 그 지점까지만 이동하고 즉시 사라진다.
    // impactDistance가 없으면 기존처럼 최대 사거리까지 이동한다.
    const range = Math.max(0.5, Number(options.range) || 12);
    const travelDistance = Math.min(range, Math.max(0.05, Number.isFinite(Number(options.impactDistance)) ? Number(options.impactDistance) : range));
    const speed = Math.max(1, Number(options.speed) || 24);
    const start = position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.65, 0));
    const sprite = this._makeSprite(VFX_TEXTURES.qPoint, 0x8fe3ff, 0.78, start);
    const total = travelDistance / speed;
    this.active.push({
      sprite,
      life: total,
      maxLife: total,
      update: (t) => {
        const traveled = Math.min(travelDistance, speed * (total * t));
        sprite.position.copy(start).addScaledVector(dir, traveled);
        sprite.material.opacity = t < 0.85 ? 1 : (1 - t) / 0.15;
        sprite.scale.setScalar(0.78 + Math.sin(t * Math.PI) * 0.16);
      },
      dispose: () => this._releaseSprite(sprite)
    });
  }
  // 이즈리얼 Q(신비의 사격) 전용 - 사용자가 올려준 실제 CommunityDragon
  // 원본 텍스처(trail/core)로 시전 지점에서 목표 지점까지 실제로 날아가는
  // 궤적을 그린다(리 신 Q _qProjectile과 동일한 "시간에 따라 위치 보간"
  // 패턴 재사용 - 판정은 ezreal.js의 findFirstInLine이 그대로 담당하고
  // 여기는 순수 시각효과만). 스프라이트는 항상 카메라를 향하므로, 이
  // 프로젝트의 고정 아이소메트릭 카메라 기준으로 material.rotation을
  // 직선 방향에 맞춰 돌려서 옆에서도 "실제로 그 방향을 향한 궤적처럼"
  // 보이게 한다(기존 코드베이스에서 sprite.material.rotation을 쓰는
  // 관례와 동일).
  _ezrealQTrail(position, direction, options = {}) {
    const dir = (direction ? direction.clone() : new THREE.Vector3(0, 0, 1)).setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); else dir.normalize();
    const range = Math.max(0.5, Number(options.range) || 12);
    const travelDistance = Math.min(range, Math.max(0.05, Number.isFinite(Number(options.impactDistance)) ? Number(options.impactDistance) : range));
    const speed = Math.max(1, Number(options.speed) || 30);
    const start = position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.6, 0));
    const angle = Math.atan2(dir.x, dir.z);

    const trail = this._makeSprite(EZREAL_Q_TEX.qTrail, 0xbdf6ff, 1.0, start.clone());
    trail.material.rotation = angle;
    // 정정(레퍼런스 영상 ability_0081_Q1.webm 실측): 이 프로젝트의 BASE_UNIT(1.0)이
    // "챔피언 모델 키 = 1.0 world unit" 기준이므로, 영상에서 캐릭터 키 대비
    // 궤적 길이·굵기를 픽셀로 직접 재서 그 비율을 그대로 적용했다(길이 ≈
    // 캐릭터 키와 거의 같음 ≈0.95~1.0, 굵기 ≈ 키의 0.15 정도로 가늘고 긴
    // 형태 - 이전 값(1.7 x 0.42)은 실측보다 훨씬 크고 뭉툭했다).
    trail.scale.set(0.95, 0.15, 1);
    const core = this._makeSprite(EZREAL_Q_TEX.qCore, 0xeaffff, 0.28, start.clone());

    const total = travelDistance / speed;
    this.active.push({
      sprite: trail,
      life: total,
      maxLife: total,
      update: (t) => {
        const traveled = Math.min(travelDistance, speed * (total * t));
        const pos = start.clone().addScaledVector(dir, traveled);
        trail.position.copy(pos);
        core.position.copy(pos);
        const fade = t < 0.8 ? 1 : (1 - t) / 0.2;
        trail.material.opacity = fade;
        core.material.opacity = fade;
        core.scale.setScalar(0.26 + Math.sin(t * Math.PI) * 0.07);
      },
      dispose: () => { this._releaseSprite(trail); this._releaseSprite(core); },
    });
  }
  // 신비의 사격 적중 이펙트(실제 원본 spark 텍스처) - 일반 _hitBurst 대신
  // 전용 텍스처로 대체한다. 크기도 위 궤적과 동일한 기준(캐릭터 키 =
  // BASE_UNIT 1.0)으로 실측 비례에 맞춰 축소했다.
  _ezrealQHitFx(position) {
    const pos = position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.55, 0));
    const sprite = this._makeSprite(EZREAL_Q_TEX.qHit, 0xffffff, 0.4, pos);
    this.active.push({
      sprite, life: 0.22, maxLife: 0.22,
      update: (t) => { sprite.material.opacity = 1 - t; sprite.scale.setScalar(0.4 + t * 0.6); sprite.material.rotation += 0.3; },
      dispose: () => this._releaseSprite(sprite),
    });
  }
  // 이즈리얼 R(정조준 일격) 시전 중 손 앞에 잠깐 맺히는 푸른빛 에너지
  // 활 - 레퍼런스 영상에서 확인한 실제 연출이지만 GLB에는 이 모양을
  // 담당하는 메시/본이 따로 없어(순수 VFX) three.js 기본 지오메트리로
  // 만든다(야스오 회오리 _yasuoTornado와 동일하게 절차적 지오메트리
  // 접근 - 외부 텍스처 없이 반투명 아크 + 시위 두 메시만으로 표현).
  // 시전 시작과 동시에 나타나 커지다가, 광선이 실제로 발사되는 시점
  // (duration = castTime)에 맞춰 사라진다.
  _ezrealRBow(position, direction = new THREE.Vector3(0, 0, 1), options = {}) {
    const dir = direction.clone().setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); else dir.normalize();
    const duration = Math.max(0.15, Number(options.duration) || 1.0);

    const group = new THREE.Group();
    // 활 몸체: 절반보다 조금 못 미치는 호(arc)의 토러스 - 앞쪽(+z, 진행
    // 방향)으로 활짝 벌어지도록 회전시킨다.
    const arcGeo = new THREE.TorusGeometry(0.42, 0.03, 8, 32, Math.PI * 0.9);
    const arcMat = new THREE.MeshBasicMaterial({
      color: 0x8fe3ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const bow = new THREE.Mesh(arcGeo, arcMat);
    bow.rotation.y = Math.PI / 2;
    bow.rotation.x = -Math.PI * 0.45;
    group.add(bow);
    // 활시위: 활의 양 끝을 잇는 얇고 팽팽한 선.
    const stringGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.78, 6);
    const stringMat = new THREE.MeshBasicMaterial({
      color: 0xeaffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const string = new THREE.Mesh(stringGeo, stringMat);
    string.rotation.z = Math.PI / 2;
    group.add(string);

    group.position.copy(position).add(new THREE.Vector3(0, BASE_UNIT * 0.75, 0)).addScaledVector(dir, 0.25);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(group);

    this.active.push({
      sprite: bow,
      life: duration,
      maxLife: duration,
      update: (t) => {
        // 0~0.3: 빠르게 나타나며 커짐 / 0.3~0.8: 유지 / 0.8~1.0: 발사 직전 급격히 페이드아웃.
        const growIn = Math.min(1, t / 0.3);
        const fadeOut = t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1;
        const fade = growIn * fadeOut;
        arcMat.opacity = 0.85 * fade;
        stringMat.opacity = 0.8 * fade;
        group.scale.setScalar(0.7 + growIn * 0.35);
      },
      dispose: () => { this.scene.remove(group); arcGeo.dispose(); arcMat.dispose(); stringGeo.dispose(); stringMat.dispose(); },
    });
  }
  // 아리 E(매혹) 전용 - 입맞춤 투사체가 실제로 목표 지점까지 날아가는 것처럼
  // 보이게 한다(판정은 ahri.js의 projectiles.spawn이 담당, 여기는 시각효과만).
  _ahriCharmProjectile(position, direction, options = {}) {
    const dir = (direction ? direction.clone() : new THREE.Vector3(0, 0, 1)).setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); else dir.normalize();
    const range = Math.max(0.5, Number(options.range) || 12);
    const travelDistance = Math.min(range, Math.max(0.05, Number.isFinite(Number(options.impactDistance)) ? Number(options.impactDistance) : range));
    const speed = Math.max(1, Number(options.speed) || 20);
    const start = position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.65, 0));
    const sprite = this._makeSprite(VFX_TEXTURES.eMark, 0xff5fc9, 0.4, start);
    const total = travelDistance / speed;
    this.active.push({
      sprite, life: total, maxLife: total,
      update: (t) => {
        const traveled = Math.min(travelDistance, speed * (total * t));
        sprite.position.copy(start).addScaledVector(dir, traveled);
        sprite.material.opacity = t < 0.85 ? 1 : (1 - t) / 0.15;
        sprite.scale.setScalar(0.4 + Math.sin(t * Math.PI) * 0.1);
      },
      dispose: () => this._releaseSprite(sprite),
    });
  }
  // 야스오 Q 3타 전용 회오리바람 VFX.
  // 외부 텍스처/GLB를 사용하지 않고 Three.js 기본 지오메트리만으로
  // 반투명한 회전 고리 + 상승하는 중심 소용돌이를 만들어 가볍게 표현한다.
  _yasuoTornado(position, direction = new THREE.Vector3(0,0,1), options = {}) {
    const dir = (direction || new THREE.Vector3(0,0,1)).clone().setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0,0,1);
    else dir.normalize();

    const group = new THREE.Group();
    const rings = [];
    const ringCount = 4;
    const baseScale = Math.max(0.8, Number(options.size) || 1.25);

    for (let i = 0; i < ringCount; i++) {
      const geo = new THREE.TorusGeometry(0.42, 0.055, 8, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xbfe9ff, transparent: true, opacity: 0.72,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const ring = new THREE.Mesh(geo, mat);
      const y = -0.45 + i * 0.30;
      const radiusScale = 0.55 + i * 0.18;
      ring.position.set(0, y, 0);
      ring.scale.set(radiusScale, 1, radiusScale);
      group.add(ring);
      rings.push({ mesh: ring, phase: i * 1.55, baseY: y, radiusScale });
    }

    // 중심 소용돌이: 아래가 좁고 위로 갈수록 넓어지는 투명 원뿔.
    const coneGeo = new THREE.ConeGeometry(0.34, 1.15, 18, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xdaf5ff, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      wireframe: true
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 0.05;
    cone.scale.set(0.9, 1, 0.9);
    group.add(cone);

    group.position.copy(position);
    group.position.y += BASE_UNIT * 0.42;
    // 기본 Q 방향을 향하도록 VFX 전체의 기준축을 맞춘다.
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir);
    this.scene.add(group);

    const life = 0.72;
    this.active.push({
      sprite: group,
      life,
      maxLife: life,
      update: (t) => {
        const fade = t < 0.68 ? 1 : (1 - t) / 0.32;
        group.position.y = position.y + BASE_UNIT * (0.42 + 0.22 * Math.sin(t * Math.PI));
        group.rotation.y += 0.18;
        cone.rotation.y -= 0.28;
        cone.scale.setScalar(0.9 + t * 0.75);

        for (const r of rings) {
          r.mesh.rotation.y += 0.28 + r.phase * 0.008;
          r.mesh.rotation.z = Math.sin(t * 5.5 + r.phase) * 0.35;
          r.mesh.position.y = r.baseY + Math.sin(t * 4.5 + r.phase) * 0.06;
          const pulse = 1 + Math.sin(t * 8 + r.phase) * 0.08;
          r.mesh.scale.set(
            r.radiusScale * pulse * (1 + t * 0.32),
            1,
            r.radiusScale * pulse * (1 + t * 0.32)
          );
          r.mesh.material.opacity = 0.72 * fade;
        }
        cone.material.opacity = 0.22 * fade;
        group.scale.setScalar(baseScale * (0.72 + t * 0.58));
      },
      dispose: () => {
        this.scene.remove(group);
        for (const r of rings) {
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
        }
        cone.geometry.dispose();
        cone.material.dispose();
      }
    });
  }

  /* ============================================================
     LEAGUE-STYLE NILAH VFX RUNTIME
     ------------------------------------------------------------
     This browser runtime is intentionally data-driven: the particle
     systems below use the real Nilah base-skin particle textures listed
     by CommunityDragon and reproduce the major League emitter concepts
     in Three.js (birth rate, lifetime, initial velocity/spread, size/
     opacity over life, rotation, gravity, child emitters and ground/
     billboard placement).

     Important limitation: League's proprietary client renderer/shader
     implementation is not embedded here, so this is a browser-side
     compatibility runtime, not a literal reuse of Riot's renderer.
     ============================================================ */
  _nilahEmitter(spec={}){
    const tex = spec.texture || null;
    const group = new THREE.Group();
    const origin = (spec.position ? spec.position.clone() : new THREE.Vector3());
    group.position.copy(origin);
    this.scene.add(group);
    const particles=[];
    const lifeMax=Math.max(0.08, Number(spec.duration ?? spec.lifetime ?? 0.35));
    const rate=Math.max(0, Number(spec.rate ?? 0));
    const maxParticles=Math.max(1, Math.floor(Number(spec.maxParticles ?? 24)));
    const size0=Number(spec.size ?? 1);
    const size1=Number(spec.sizeEnd ?? size0);
    const opacity0=Number(spec.opacity ?? 1);
    const opacity1=Number(spec.opacityEnd ?? 0);
    const speed=Number(spec.speed ?? 0);
    const spread=Number(spec.spread ?? 0);
    const gravity=spec.gravity instanceof THREE.Vector3 ? spec.gravity.clone() : new THREE.Vector3(0,Number(spec.gravity ?? 0),0);
    const rotSpeed=Number(spec.rotationSpeed ?? 0);
    const billboard=spec.billboard !== false;
    const parentScale=Number(spec.parentScale ?? 1);
    let spawnAccum=Number(spec.initialSpawn ?? 0);
    let elapsed=0;
    let firstBurst = spec.burst != null ? Math.max(0, Math.floor(spec.burst)) : 0;
    // 버그 수정(색상 틴트 누락): spec.color가 지금까지 완전히 무시되고
    // 있었다(항상 흰색 0xffffff 고정) - 실제 텍스처가 로드되면 텍스처
    // 자체의 색으로 보이니 크게 티가 안 났지만, 텍스처 로드가 실패하는
    // 경우(위 loadNilahSourceTextures 진단 참고) 색 정보가 전혀 없는
    // 흰 사각형만 남아 R의 초록→금색 전환, 패시브의 보라색 버블 등이
    // 전혀 표현되지 않았다. spec.color가 있으면 그대로 틴트로 사용한다.
    const tintColor = spec.color ?? 0xffffff;
    const makeParticle=()=>{
      if(particles.length>=maxParticles) return;
      const mat=new THREE.SpriteMaterial({map:tex||null,color:tintColor,transparent:true,opacity:opacity0,depthWrite:false,blending:spec.blending ?? THREE.AdditiveBlending});
      const sp=new THREE.Sprite(mat);
      sp.scale.setScalar(size0*parentScale*(0.85+Math.random()*0.3));
      const p=new THREE.Vector3();
      if(spec.ground) p.y=0.02+Math.random()*0.035; else p.y=(Math.random()-0.5)*Number(spec.spawnHeight ?? 0.2);
      if(spec.spawnRadius){ const a=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*spec.spawnRadius; p.x=Math.cos(a)*r; p.z=Math.sin(a)*r; }
      sp.position.copy(p);
      const dir=new THREE.Vector3(
        (Math.random()-0.5)*spread,
        (Math.random()-0.5)*spread,
        (Math.random()-0.5)*spread
      );
      if(spec.forward){ dir.add(spec.forward.clone().multiplyScalar(1 + (Math.random()-0.5)*spread)); }
      if(dir.lengthSq()<1e-8) dir.set(0,0,1);
      dir.normalize().multiplyScalar(speed*(0.75+Math.random()*0.5));
      particles.push({sp,age:0,life:Math.max(0.06, lifeMax*(0.82+Math.random()*0.36)),vel:dir,rot:(Math.random()*Math.PI*2)});
      group.add(sp);
    };
    for(let i=0;i<firstBurst;i++) makeParticle();
    const state={
      sprite:group, life: spec.runtimeLife===Infinity?Infinity:Math.max(0.02, Number(spec.runtimeLife ?? lifeMax)), maxLife:spec.runtimeLife===Infinity?Infinity:Math.max(0.02, Number(spec.runtimeLife ?? lifeMax)),
      age:0,
      update:(t,dt)=>{
        elapsed += dt;
        if(rate>0 && particles.length<maxParticles){ spawnAccum += rate*dt; while(spawnAccum>=1){spawnAccum-=1;makeParticle();} }
        for(let i=particles.length-1;i>=0;i--){
          const q=particles[i]; q.age+=dt; const u=Math.min(1,q.age/q.life);
          q.sp.position.addScaledVector(q.vel,dt); q.vel.addScaledVector(gravity,dt);
          q.sp.material.opacity=THREE.MathUtils.lerp(opacity0,opacity1,u);
          const s=THREE.MathUtils.lerp(size0,size1,u)*parentScale; q.sp.scale.setScalar(s*(0.9+0.1*Math.sin(u*Math.PI)));
          q.rot += rotSpeed*dt; q.sp.material.rotation=q.rot;
          if(q.age>=q.life){group.remove(q.sp);q.sp.material.dispose();particles.splice(i,1);}
        }
        if(spec.scaleOverLife){ const [a,b]=spec.scaleOverLife; group.scale.setScalar(THREE.MathUtils.lerp(a,b,Math.min(1,elapsed/lifeMax))); }
      },
      dispose:()=>{ for(const q of particles){group.remove(q.sp);q.sp.material.dispose();} particles.length=0; this.scene.remove(group); }
    };
    this.active.push(state);
    return state;
  }

  _nilahTrailEmitter(from,to,tex,life=0.35,size=0.8,opacity=0.35){
    if(!from||!to) return;
    const dir=new THREE.Vector3().subVectors(to,from);
    const dist=Math.max(0.1,dir.length()); dir.normalize();
    const steps=Math.max(3,Math.ceil(dist/0.18));
    for(let i=0;i<steps;i++){
      const t=steps===1?0:i/(steps-1);
      const p=from.clone().lerp(to,t);
      this._nilahEmitter({texture:tex,position:p,burst:1,rate:0,lifetime:life*(0.75+0.5*Math.random()),size:size*(0.75+0.35*Math.random()),sizeEnd:size*0.18,opacity,opacityEnd:0,speed:0,spread:0,rotationSpeed:(Math.random()-0.5)*2,runtimeLife:life*1.05});
    }
  }

  _officialSprite(tex,pos,size,life,updateFn){
    const mat=new THREE.SpriteMaterial({map:tex||null,color:0xffffff,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending});
    const sp=new THREE.Sprite(mat);sp.position.copy(pos);sp.scale.set(size,size,1);this.scene.add(sp);
    this.active.push({sprite:sp,life,maxLife:life,update:(t)=>updateFn&&updateFn(sp,t),dispose:()=>{this.scene.remove(sp);sp.material.dispose();}});return sp;
  }
  // 실제 확인된 평타 텍스처(사용자가 업로드해 직접 확인한 파일)로 만든
  // 이펙트 - 흰색/하늘색 계열의 스침 자국(swipe) 두 장과 가로로 긴
  // 물보라(linearsplashes)를 타격 방향으로 겹쳐서 재생한다.
  // 색상 틴트 추가(지난번 R/E/패시브만 고치고 이 함수는 빠뜨렸던 부분 -
  // "이펙트가 하나도 안 바뀌었다" 버그의 핵심 원인). 실제 평타는 흰색
  // 계열이 맞아서 색은 거의 그대로 두되, 텍스처 로드 실패 시 대비용으로
  // 명시적으로 지정한다.
  _nilahBASwipeFx(position, direction=new THREE.Vector3(0,0,1), options={}){
    const dir=direction.clone().setY(0); if(dir.lengthSq()<1e-8) dir.set(0,0,1); else dir.normalize();
    const p=position.clone().add(new THREE.Vector3(0,BASE_UNIT*0.55,0));
    const scale=Math.min(1.6, Math.max(0.6, Number(options.scale)||1));
    const tex1=NILAH_SOURCE_TEX.baSwipe1, tex2=NILAH_SOURCE_TEX.baSwipe2, splash=NILAH_SOURCE_TEX.baSplash;
    this._nilahEmitter({texture:tex1,position:p,burst:2,rate:0,lifetime:.22,size:.7*scale,sizeEnd:1.5*scale,opacity:.85,opacityEnd:0,speed:.1,spread:.06,rotationSpeed:1.6,color:0xeaf7ff});
    this._nilahEmitter({texture:tex2,position:p.clone().addScaledVector(dir,.12),burst:2,rate:0,lifetime:.2,size:.6*scale,sizeEnd:1.35*scale,opacity:.6,opacityEnd:0,speed:.15,spread:.08,rotationSpeed:-1.3,color:0xcfeeff});
    this._nilahEmitter({texture:splash,position:p.clone().addScaledVector(dir,.06),burst:1,rate:0,lifetime:.16,size:.9*scale,sizeEnd:1.6*scale,opacity:.5,opacityEnd:0,speed:0,spread:0,rotationSpeed:0,color:0xffffff});
  }
  // 색상 틴트 + 로컬 대체 텍스처 연결(핵심 수정 - Q는 가장 자주 쓰는
  // 스킬인데 지금까지 remote URL + 무색 틴트라 텍스처 로드가 실패하면
  // 사실상 아무것도 안 보이거나 밋밋한 흰 사각형만 보였다). 실제 영상
  // 관찰 기준 시안(cyan)~하양 계열로 지정.
  _nilahQSlash(position,direction=new THREE.Vector3(0,0,1),options={}){
    const dir=direction.clone().setY(0); if(dir.lengthSq()<1e-8) dir.set(0,0,1); else dir.normalize();
    const p=position.clone().add(new THREE.Vector3(0,BASE_UNIT*0.72,0));
    const tex1=NILAH_SOURCE_TEX.qSwipe, tex2=NILAH_SOURCE_TEX.qSwipe1, tex3=NILAH_SOURCE_TEX.qSwipe2, water=NILAH_SOURCE_TEX.qWater;
    this._nilahEmitter({texture:tex1,position:p,burst:3,rate:0,lifetime:.28,size:1.15,sizeEnd:2.35,opacity:.95,opacityEnd:0,speed:.15,spread:.08,rotationSpeed:1.8,color:0x9be8ff});
    this._nilahEmitter({texture:tex2,position:p.clone().addScaledVector(dir,.18),burst:2,rate:0,lifetime:.22,size:.95,sizeEnd:2.1,opacity:.68,opacityEnd:0,speed:.2,spread:.08,rotationSpeed:-1.4,color:0xd2ffff});
    this._nilahEmitter({texture:tex3,position:p.clone().addScaledVector(dir,.3),burst:2,rate:0,lifetime:.24,size:1.0,sizeEnd:2.3,opacity:.5,opacityEnd:0,speed:.25,spread:.1,rotationSpeed:1.1,color:0xbff2ff});
    this._nilahEmitter({texture:water,position:p.clone().addScaledVector(dir,.32),burst:4,rate:0,lifetime:.3,size:.65,sizeEnd:1.8,opacity:.42,opacityEnd:0,speed:1.1,spread:.28,gravity:-.15,rotationSpeed:2.3,color:0xcaf3ff});
    // 추가(사용자가 실제 파일로 확인해준 nilah_base_q_beam_mult.png):
    // 파란→초록 그라데이션의 세로 빛줄기 텍스처 - Q 적중 지점에서 위로
    // 짧게 솟아오르는 수직 광선 악센트로 사용한다(강화 상태 진입을
    // 알리는 포인트).
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.qBeamMult,position:p.clone().addScaledVector(dir,.2).add(new THREE.Vector3(0,BASE_UNIT*0.15,0)),burst:2,rate:0,lifetime:.34,size:.5,sizeEnd:.85,opacity:.6,opacityEnd:0,speed:.05,spread:.02,gravity:.5,rotationSpeed:0,color:0x9be8ff});
    if(options.ePath) this._nilahEmitter({texture:NILAH_SOURCE_TEX.eWave,position:p.clone().addScaledVector(dir,.5),burst:2,rate:3,lifetime:.42,size:.7,sizeEnd:2.4,opacity:.36,opacityEnd:0,speed:1.2,spread:.08,rotationSpeed:.2,maxParticles:5,color:0x8f7bff});
  }
  // 색상 틴트 + 로컬 대체 텍스처 연결(W도 Q와 동일한 이유로 수정).
  _nilahWMist(position,options={}){
    const duration=Math.max(.15,Number(options.duration)||2.25);
    const g=this._nilahEmitter({texture:NILAH_SOURCE_TEX.wHalo,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.55,0)),burst:3,rate:5,lifetime:.65,size:1.0,sizeEnd:1.9,opacity:.55,opacityEnd:.05,speed:.18,spread:.35,rotationSpeed:.5,maxParticles:12,runtimeLife:duration,color:0xbfe8ff});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.wMult,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.5,0)),burst:5,rate:4,lifetime:.5,size:.7,sizeEnd:1.5,opacity:.32,opacityEnd:0,speed:.4,spread:.5,rotationSpeed:-1.3,maxParticles:12,runtimeLife:duration,color:0xdff5ff});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.wWater,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.62,0)),burst:4,rate:5,lifetime:.45,size:.45,sizeEnd:1.15,opacity:.3,opacityEnd:0,speed:.55,spread:.6,rotationSpeed:2.1,maxParticles:14,runtimeLife:duration,color:0xcaf0ff});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.wSpark,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.7,0)),burst:2,rate:6,lifetime:.35,size:.22,sizeEnd:.06,opacity:.7,opacityEnd:0,speed:.8,spread:.9,gravity:-.3,rotationSpeed:3,maxParticles:10,runtimeLife:duration,color:0xffffff});
    return g;
  }
  // 색상 수정(영상 대조 결과 반영 - ability_0895_E1.webm 프레임 분석):
  // 실제 E 대시 트레일은 순수 하늘색이 아니라 보라빛이 도는
  // 청보라(인디고) 계열 물보라다 - 기존엔 색 틴트가 안 먹혀 흰색으로만
  // 보였던 부분을 실제 관찰 색(인디고 0x8f7bff, 밝은 라벤더 0xb9a8ff)으로
  // 지정한다.
  _nilahEDashTrail(position,direction,options={}){
    const dir=direction.clone().setY(0); if(dir.lengthSq()<1e-8) dir.set(0,0,1); else dir.normalize();
    const p=position.clone();
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.eRing,position:p.clone().add(new THREE.Vector3(0,.05,0)),burst:2,rate:0,lifetime:.2,size:.35,sizeEnd:1.7,opacity:.7,opacityEnd:0,speed:0,spread:.06,rotationSpeed:1.6,color:0x8f7bff});
    this._nilahTrailEmitter(p,p.clone().addScaledVector(dir,1.5),NILAH_SOURCE_TEX.eWake,.28,.75,.5);
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.eSub,position:p.clone().addScaledVector(dir,.25),burst:3,rate:0,lifetime:.18,size:.35,sizeEnd:1.6,opacity:.42,opacityEnd:0,speed:1.8,spread:.22,rotationSpeed:-2.2,color:0x9c8cff});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.eWater,position:p.clone().addScaledVector(dir,.4),burst:3,rate:0,lifetime:.28,size:.3,sizeEnd:1.5,opacity:.32,opacityEnd:0,speed:1.4,spread:.3,rotationSpeed:2.5,color:0xb9a8ff});
    if(options.to){const end=options.to.clone();this._nilahEmitter({texture:NILAH_SOURCE_TEX.eSplash,position:end.clone().add(new THREE.Vector3(0,.18,0)),burst:3,rate:0,lifetime:.26,size:.55,sizeEnd:1.55,opacity:.6,opacityEnd:0,speed:.5,spread:.75,rotationSpeed:2.5,color:0x8f7bff});}
  }
  // 색상 수정(영상 대조 결과 반영 - ability_0895_R1.webm 프레임 분석):
  // R은 명확히 2단계 색으로 나뉜다. 1단계(0~1초 휘두르기/틱)는
  // 연두~라임 계열 회전 소용돌이, 2단계(버스트+끌어당김)는 주황~금색
  // 곡선 촉수. 지금까지 색 틴트 자체가 적용되지 않아(위 _nilahEmitter
  // 버그 수정 참고) 텍스처가 못 뜨면 그냥 흰색으로만 보였다 - 실제
  // 영상에서 관찰한 색을 명시적으로 지정한다(라임그린 0xb6ff6e / 진한
  // 라임 0x9dfa4a, 골드 0xffcf7a / 진한 오렌지 0xff9d3f).
  _nilahRSpin(position,options={}){
    const p=position.clone().add(new THREE.Vector3(0,BASE_UNIT*.58,0));
    const tick=Number(options.tick)||0; const phase=tick*Math.PI/2;
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rSwipe,position:p,burst:3,rate:0,lifetime:.22,size:1.2,sizeEnd:2.2,opacity:.65,opacityEnd:0,speed:.15,spread:.07,rotationSpeed:2.2,color:0xb6ff6e});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rSword,position:p,burst:2,rate:0,lifetime:.2,size:.8,sizeEnd:1.7,opacity:.4,opacityEnd:0,speed:.2,spread:.1,rotationSpeed:-1.8,color:0xd4ffa0});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rOrbit,position:position.clone().add(new THREE.Vector3(0,.08,0)),burst:3,rate:0,lifetime:.26,size:.7,sizeEnd:1.6,opacity:.28,opacityEnd:0,speed:.35,spread:.65,rotationSpeed:2.6,color:0x9dfa4a});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rEnergy,position:p,burst:4,rate:0,lifetime:.28,size:.35,sizeEnd:1.2,opacity:.28,opacityEnd:0,speed:1.0,spread:.7,rotationSpeed:2.1,color:0xc7ff8a});
  }
  _nilahRFinal(position){
    const ground=position.clone().add(new THREE.Vector3(0,.05,0));
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rSplash,position:ground,burst:6,rate:0,lifetime:.72,size:1.1,sizeEnd:4.3,opacity:.75,opacityEnd:0,speed:.3,spread:.5,rotationSpeed:1.9,color:0xffcf7a});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rRing,position:ground,burst:3,rate:0,lifetime:.76,size:1.0,sizeEnd:4.0,opacity:.5,opacityEnd:0,speed:.1,spread:.05,rotationSpeed:-1.1,color:0xffb347});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rRipple,position:ground,burst:5,rate:0,lifetime:.85,size:1.2,sizeEnd:4.2,opacity:.34,opacityEnd:0,speed:.4,spread:.5,rotationSpeed:.5,color:0xffdca0});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rGlow,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.68,0)),burst:3,rate:0,lifetime:.5,size:.8,sizeEnd:2.8,opacity:.5,opacityEnd:0,speed:.3,spread:.4,rotationSpeed:.9,color:0xffcf7a});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rGlow3,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.74,0)),burst:2,rate:0,lifetime:.45,size:.7,sizeEnd:2.4,opacity:.38,opacityEnd:0,speed:.8,spread:.35,rotationSpeed:-1.3,color:0xff9d3f});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rFlash,position:position.clone().add(new THREE.Vector3(0,BASE_UNIT*.72,0)),burst:2,rate:0,lifetime:.18,size:.9,sizeEnd:3.0,opacity:.8,opacityEnd:0,speed:.2,spread:.15,color:0xfff0c8});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rOrbit,position:ground,burst:4,rate:0,lifetime:.65,size:.55,sizeEnd:1.9,opacity:.32,opacityEnd:0,speed:.7,spread:.85,rotationSpeed:3.1,color:0xffb347});
  }
  // 추가(빠져 있던 부분): 패시브 회복(크리티컬 시 자가 힐)에는 지금까지
  // 시각 피드백이 전혀 없었다 - 물방울이 위로 떠오르며 옅어지는 느낌으로,
  // 색은 녹색(회복 관례색)이 아니라 닐라의 물/빛 테마에 맞춰 옅은 청록으로.
  _nilahHealFx(position, options={}){
    const p=position.clone().add(new THREE.Vector3(0,BASE_UNIT*0.3,0));
    const scale=Math.min(1.6, Math.max(0.5, Number(options.amount)/40 || 0.7));
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.wWater,position:p,burst:4,rate:3,lifetime:.5,size:.3*scale,sizeEnd:.1,opacity:.55,opacityEnd:0,speed:.5,spread:.3,gravity:.35,rotationSpeed:1.2,maxParticles:8,runtimeLife:.4});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.wSpark,position:p,burst:3,rate:0,lifetime:.4,size:.18*scale,sizeEnd:.04,opacity:.6,opacityEnd:0,speed:.35,spread:.5,gravity:.25,rotationSpeed:2.0,maxParticles:6});
  }
  // 색상/형태 수정(영상 대조 결과 반영 - ability_0895_P1.webm 프레임 분석):
  // 실제 패시브(영원한 기쁨) 힐/실드 공유 이펙트는 또렷한 "보라색 반투명
  // 구체(버블)"가 닐라와 아군 사이에 생기고, 그 안에서 녹색 반짝이
  // 입자가 오간다 - 지금까지는 색 틴트가 아예 안 먹혀서(위 버그 수정
  // 참고) 밋밋한 흰색 파티클 몇 개로만 보였다. 색을 명시하는 것과
  // 별개로, 스프라이트 파티클만으로는 "버블(구체)"이라는 형태 자체가
  // 잘 안 산다 - 실제로 둥근 막처럼 보이는 반투명 SphereGeometry 메쉬를
  // 하나 추가해서, 텍스처 로드 성공/실패와 무관하게 항상 보라색 구체가
  // 보이도록 한다(전투 판정과 무관한 순수 표시용).
  _nilahShieldFx(position, options={}){
    const p=position.clone().add(new THREE.Vector3(0,BASE_UNIT*0.55,0));
    const duration=Math.max(.3, Number(options.duration)||4);
    const bubbleGeo=new THREE.SphereGeometry(BASE_UNIT*0.42,20,16);
    const bubbleMat=new THREE.MeshBasicMaterial({color:0xb98bff,map:NILAH_SOURCE_TEX.shieldAura||null,transparent:true,opacity:0.28,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const bubble=new THREE.Mesh(bubbleGeo,bubbleMat);
    bubble.position.copy(p);
    this.scene.add(bubble);
    const bubbleLife=Math.min(duration,1.4);
    this.active.push({sprite:bubble,life:bubbleLife,maxLife:bubbleLife,
      update:(t)=>{ bubble.material.opacity=0.28*(1-t*0.7); bubble.scale.setScalar(1+t*0.18); bubble.rotation.y+=0.015; },
      dispose:()=>{ this.scene.remove(bubble); bubble.geometry.dispose(); bubble.material.dispose(); }});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.wHalo,position:p,burst:2,rate:1,lifetime:.9,size:1.05,sizeEnd:1.35,opacity:.4,opacityEnd:.1,speed:.05,spread:.1,rotationSpeed:.6,maxParticles:4,runtimeLife:Math.min(duration,1.2),color:0xc9a8ff});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.rGlow,position:p,burst:1,rate:0,lifetime:.3,size:.9,sizeEnd:1.5,opacity:.5,opacityEnd:.15,speed:0,spread:0,rotationSpeed:0,color:0xb98bff});
    // 구체 안에서 오가는 녹색 반짝이 입자(영상에서 관찰된 디테일) -
    // 실제 원본 파일(p_stardustmote)로 교체.
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.pStardust,position:p,burst:5,rate:2,lifetime:.6,size:.16,sizeEnd:.04,opacity:.8,opacityEnd:0,speed:.4,spread:.7,rotationSpeed:2.4,maxParticles:8,runtimeLife:Math.min(duration,1.2),color:0x9dfa8a});
    this._nilahEmitter({texture:NILAH_SOURCE_TEX.pBlob,position:p,burst:2,rate:0,lifetime:.7,size:.5,sizeEnd:.9,opacity:.35,opacityEnd:0,speed:.15,spread:.3,rotationSpeed:.8,color:0xc9a8ff});
  }
  _groundAura(position, texture, color) {
    const ringGeo = new THREE.RingGeometry(0.01, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity:0.55, side:THREE.DoubleSide, blending:THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.copy(position); ring.position.y = 0.04;
    this.scene.add(ring);
    this.active.push({ sprite: ring, life: 0.9, maxLife: 0.9,
      update: (t) => { ring.material.opacity = 0.55 * (1 - t); ring.scale.setScalar(1 + t * 1.6); },
      // 요청 20 "dispose 누락을 피한다" - W 오라(초당 캐스트 빈도라 낮음)는
      // 풀링까지는 과함(요청 "매우 가볍게") 이라 생성 시점은 그대로 두고,
      // 제거 시 geometry/material은 확실히 해제한다.
      dispose: () => { this.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } });
  }
  // 레넥톤 강신(R) 지속 오라: 실제 마법 피해 반경을 바닥에 가볍게 표시한다.
  startRenektonRAura(positionProvider, radiusWorld) {
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9b6cff, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const innerGeo = new THREE.RingGeometry(0.12, 0.18, 48);
    innerGeo.rotateX(-Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xc7a8ff, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    const group = new THREE.Group();
    group.add(ring, inner);
    const p = typeof positionProvider === 'function' ? positionProvider() : positionProvider;
    if (p) group.position.copy(p);
    group.position.y = 0.055;
    const radius = Math.max(0.1, Number(radiusWorld) || 1);
    group.scale.setScalar(radius);
    this.scene.add(group);
    const fx = {
      sprite: group, life: Infinity, maxLife: Infinity, _renektonAura: true,
      update: () => {
        const pos = typeof positionProvider === 'function' ? positionProvider() : null;
        if (pos) { group.position.x = pos.x; group.position.z = pos.z; }
        const now = performance.now();
        const pulse = 1 + Math.sin(now * 0.004) * 0.025;
        group.scale.setScalar(radius * pulse);
        ring.material.opacity = 0.17 + (Math.sin(now * 0.005) + 1) * 0.025;
        inner.material.opacity = 0.10 + (Math.sin(now * 0.006) + 1) * 0.025;
      },
      dispose: () => {
        this.scene.remove(group);
        ring.geometry.dispose(); ring.material.dispose();
        inner.geometry.dispose(); inner.material.dispose();
      }
    };
    this.active.push(fx);
    return fx;
  }
  stopRenektonRAura(fx) {
    if (!fx) return;
    const i = this.active.indexOf(fx);
    if (i >= 0) { fx.dispose(); this.active.splice(i, 1); }
  }

  _ultimateBurst(position) {
    const ringGeo = new THREE.RingGeometry(0.05, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ map: VFX_TEXTURES.rRing, color:0xc9a4ff, transparent:true, opacity:0.9, side:THREE.DoubleSide, blending:THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position); ring.position.y = 0.05;
    this.scene.add(ring);
    const glow = this._makeSprite(VFX_TEXTURES.rGlow, 0xb98bff, 1.2, position.clone().add(new THREE.Vector3(0, BASE_UNIT * 0.85, 0)));
    this.active.push({ sprite: ring, life: 1.0, maxLife: 1.0,
      update: (t) => { ring.material.opacity = 0.9 * (1 - t); ring.scale.setScalar(1 + t * 5.5); },
      // R(궁극기)은 챔피언당 쿨다운이 길어 발동 빈도가 매우 낮으므로
      // (요청 "매우 가볍게" 원칙에서 풀링 우선순위가 낮음) 여기도 풀링
      // 대신 dispose를 확실히 호출하는 쪽을 택했다.
      dispose: () => { this.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } });
    this.active.push({ sprite: glow, life: 0.6, maxLife: 0.6,
      update: (t) => { glow.material.opacity = 1 - t; glow.scale.setScalar(1.2 + t * 1.8); },
      dispose: () => this._releaseSprite(glow) });
  }
  _sampleNilahWeaponRig(dt) {
    const c = globalThis.controller;
    if (!c || c.championId !== 'nilah' || !c._nilahWeaponRig) return;
    const rig = c._nilahWeaponRig;
    const active = !!(c.currentActionKey && (String(c.currentActionKey).startsWith('nilahQ') || String(c.currentActionKey).startsWith('nilahE') || String(c.currentActionKey).startsWith('nilahR')));
    rig.active = active;
    if (!active) { rig.trailSamples.length = 0; rig.lastTip = null; return; }
    rig.sampleClock += dt;
    if (rig.sampleClock < 1/60) return;
    rig.sampleClock = 0;
    const points=[];
    for (const node of [rig.bladeAEnd, rig.bladeBEnd]) {
      if (!node) continue;
      const v=new THREE.Vector3(); node.getWorldPosition(v); points.push(v);
    }
    if (!points.length) return;
    // 두 채찍 끝 중 현재 진행방향에 더 유효한 끝을 선택하기 위해 평균점을 사용한다.
    const tip=points.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/points.length);
    const prev=rig.lastTip;
    if (prev && tip.distanceToSquared(prev)<0.0004) return;
    rig.lastTip=tip.clone();
    rig.trailSamples.push({p:tip.clone(),t:performance.now()});
    while(rig.trailSamples.length>rig.maxSamples) rig.trailSamples.shift();
  }

  _updateNilahWeaponTrail() {
    const c = globalThis.controller;
    if (!c || c.championId !== 'nilah' || !c._nilahWeaponRig) return;
    const rig = c._nilahWeaponRig;
    const samples = (rig.trailSamples || []).map(x => x.p).filter(Boolean);
    if (!samples.length) { if (rig.trailRibbon) rig.trailRibbon.visible = false; return; }
    if (!rig.trailRibbon) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.MeshBasicMaterial({ map:NILAH_SOURCE_TEX.qSwipe, transparent:true, opacity:0.26, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled=false; this.scene.add(mesh); rig.trailRibbon=mesh;
    }
    const positions=[], uvs=[]; const widthBase=0.12;
    for(let i=0;i<samples.length;i++){
      const p=samples[i]; const prev=samples[Math.max(0,i-1)]; const next=samples[Math.min(samples.length-1,i+1)];
      const t=new THREE.Vector3().subVectors(next,prev).setY(0); if(t.lengthSq()<1e-8)t.set(1,0,0); else t.normalize();
      const side=new THREE.Vector3(-t.z,0,t.x);
      const age=i/(Math.max(1,samples.length-1)); const w=widthBase*(0.35+0.65*age);
      const a=p.clone().addScaledVector(side,w); const b=p.clone().addScaledVector(side,-w);
      positions.push(a.x,a.y+0.02,a.z,b.x,b.y+0.02,b.z);
      uvs.push(0,age,1,age);
    }
    const idx=[]; for(let i=0;i<samples.length-1;i++){const b=i*2; idx.push(b,b+1,b+2,b+2,b+1,b+3);}
    const g=rig.trailRibbon.geometry; g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    rig.trailRibbon.visible=samples.length>=2; rig.trailRibbon.material.opacity=0.10+0.22*(samples.length/Math.max(2,rig.maxSamples));
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      const t = 1 - Math.max(0, fx.life) / fx.maxLife;
      fx.update(t);
      if (fx.life <= 0) { fx.dispose(); this.active.splice(i, 1); }
    }
    this._sampleNilahWeaponRig(dt);
    this._updateNilahWeaponTrail();
  }
}

