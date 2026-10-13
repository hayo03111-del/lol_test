/* ============================================================
   ATTACK IMPACT TIMING (평타 타격 모션 ↔ 실제 피해 시점 맞추기)
   ------------------------------------------------------------
   피해는 공격 속도로 정한 선딜(windup) 끝에 들어간다. 예전엔 평타 클립 전체를 공격 간격에 맞춰 늘이거나 줄여
   재생해서(재생 속도 = 클립 길이 ÷ 공격 간격), 클립 안에서 실제로 무기가 닿는 장면이 그 시점과 따로 놀았다.
   특히 리 신·요네·아리는 평타 클립이 0.33초 남짓이라, 1.5초 간격에 늘여 재생하면 휘두르는 장면이 피해보다
   1초 넘게 늦게 나왔다.

   이제 클립 안의 "실제 타격 시각"(초)을 구해, 재생 속도 = 타격 시각 ÷ 선딜 로 맞춘다 - 타격 장면이 정확히
   피해 시점에 온다. 타격 시각을 구하는 방법은 챔피언별로, 실제 GLB 클립을 프레임 단위로 렌더링해 눈으로
   확인한 결과에 따라 고른다(24차 측정, docs/KNOWN_LIMITATIONS.md 24차):
   - peak:  무기/손 계열 뼈(가장 많이 움직이는 것)의 속도가 가장 빠른 시각.
   - reach: 그 뼈가 몸 중심에서 수평으로 가장 멀리 뻗은 시각.
   - fit:   클립 전체를 공격 간격에 맞추는 예전 방식(노틸러스는 이쪽이 실제 타격 장면과 맞았다).
   - base:  원작 기본 선딜 시각(선딜% ÷ 기본 공속) - 공격 속도에 비례해서만 빨라지게 재생한다. 위 측정으로
            확정하지 못한 챔피언의 기본값.
   자동 측정값이 클립 길이에 비해 말이 안 되면(너무 이르거나 끝 프레임) base로 돌아간다.
   ============================================================ */
const ATTACK_IMPACT_METHOD = {
  garen: 'peak', darius: 'peak', leesin: 'peak', yasuo: 'peak', yone: 'peak', mordekaiser: 'peak',
  renekton: 'peak', chogath: 'peak', ahri: 'peak', ezreal: 'reach', nautilus: 'fit',
  // masteryi·sett·vex·ashe·varus(·nilah는 별도 연속 평타 경로): base
};

// 클립 하나의 무기 뼈 궤적에서 peak/reach 시각을 잰다(클립마다 한 번, 결과는 clip.userData에 보관).
function measureAttackClipImpact(model, clip, liveMixer = null) {
  if (!model || !clip || typeof THREE === 'undefined') return null;
  clip.userData = clip.userData || {};
  if (clip.userData.impact) return clip.userData.impact;
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  if (!bones.length) return null;
  const isWeapon = (n) => /weapon|sword|blade|mace|arrow|bow|cannon|hand|fist|knuckle|claw|axe|whip|glove|spear/i.test(n)
    && !/finger|thumb|pinky|index|ring|middle|scarf|cape|cloth|hair/i.test(n);
  const pool = bones.filter((b) => isWeapon(b.name));
  const use = pool.length ? pool : bones;
  const mixer = new THREE.AnimationMixer(model);
  const act = mixer.clipAction(clip); act.play();
  const N = 90, dt = clip.duration / N, tracks = use.map(() => []);
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt); model.updateMatrixWorld(true);
    inv.copy(model.matrixWorld).invert();
    use.forEach((b, k) => { b.getWorldPosition(v); tracks[k].push(v.clone().applyMatrix4(inv)); });
  }
  act.stop(); mixer.uncacheRoot(model);
  if (liveMixer) liveMixer.update(0); // 측정하느라 바뀐 자세를 지금 재생 중인 애니메이션으로 되돌린다
  let bi = 0, bl = -1;
  tracks.forEach((a, k) => { let L = 0; for (let i = 2; i < a.length - 1; i++) L += a[i].distanceTo(a[i - 1]); if (L > bl) { bl = L; bi = k; } });
  const a = tracks[bi];
  let pk = -1, pi = 0, rk = -1, ri = 0;
  for (let i = 2; i < a.length - 1; i++) { const sp = a[i].distanceTo(a[i - 1]); if (sp > pk) { pk = sp; pi = i; } }
  for (let i = 1; i < a.length - 1; i++) { const d = Math.hypot(a[i].x, a[i].z); if (d > rk) { rk = d; ri = i; } }
  clip.userData.impact = { peak: pi * dt, reach: ri * dt, bone: use[bi].name };
  return clip.userData.impact;
}

// 평타 재생 속도. windup = 이번 스윙 선딜(초), interval = 공격 간격(초).
function attackClipTimeScale(ctrl, clip, windup, interval) {
  if (!clip || !(clip.duration > 0)) return 1;
  const clampTs = (x) => THREE.MathUtils.clamp(x, 0.4, 3.0);
  const method = ATTACK_IMPACT_METHOD[ctrl && ctrl.championId] || 'base';
  if (method === 'fit') return clampTs(clip.duration / interval);
  const st = ctrl && ctrl.stats;
  const baseImpact = st && st.windupPercent && st.baseAttackSpeed ? st.windupPercent / st.baseAttackSpeed : windup;
  let impact = baseImpact;
  if (method === 'peak' || method === 'reach') {
    const m = measureAttackClipImpact(ctrl.model, clip, ctrl.mixer);
    const t = m ? m[method] : null;
    // 클립 시작 직후나 마지막 프레임 근처면 측정 실패로 보고 base로 돌아간다.
    if (t != null && t > Math.min(0.05, clip.duration * 0.15) && t < clip.duration - 0.02) impact = t;
  }
  return clampTs(Math.min(impact, clip.duration) / Math.max(1e-3, windup));
}

// 챔피언을 불러올 때 평타 클립들을 미리 재 둔다(첫 평타에서 측정 비용·자세 튐이 없게).
function precomputeAttackImpacts(ctrl) {
  if (!ctrl || !ctrl.actionData || !ATTACK_IMPACT_METHOD[ctrl.championId]) return;
  for (const [key, data] of Object.entries(ctrl.actionData)) {
    if (!/^(attack|crit)/i.test(key) || !data || !data.clips) continue;
    const clip = ctrl.resolveClip(data.clips);
    if (clip) measureAttackClipImpact(ctrl.model, clip, null);
  }
  if (ctrl.mixer) ctrl.mixer.update(0);
}
