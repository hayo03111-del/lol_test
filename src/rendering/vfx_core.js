/* ============================================================
   0-C. PROCEDURAL VFX TEXTURES
   ============================================================ */
function generateGlowTexture(hexColor, hard = false) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(hexColor);
  const r = Math.floor(c.r * 255), g = Math.floor(c.g * 255), b = Math.floor(c.b * 255);
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  if (hard) {
    grad.addColorStop(0.0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  } else {
    grad.addColorStop(0.0, `rgba(255,255,255,0.95)`);
    grad.addColorStop(0.25, `rgba(${r},${g},${b},0.85)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function generateRingTexture(hexColor) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(hexColor);
  const r = Math.floor(c.r * 255), g = Math.floor(c.g * 255), b = Math.floor(c.b * 255);
  ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 10, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const VFX_TEXTURES = {
  flashSharp: generateGlowTexture(0xffe9a8, true),
  hit:        generateGlowTexture(0xffffff, true),
  qPoint:     generateGlowTexture(0x8fe3ff, true),
  wAura:      generateGlowTexture(0xffd27a, false),
  eMark:      generateGlowTexture(0xff5b5b, true),
  rRing:      generateRingTexture(0xc9a4ff),
  rGlow:      generateGlowTexture(0xb98bff, false),
  death:      generateGlowTexture(0x555555, false),
  target:     generateRingTexture(0xffffff),
};

