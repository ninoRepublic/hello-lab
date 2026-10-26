// ===== 画布初始化 =====
const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, CX = 0, CY = 0, scale = 1;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CX = W / 2;
  CY = H / 2;
  // 自适应：让最外层轨道在屏幕内
  scale = Math.min(W, H) / (MAX_ORBIT_RADIUS + 60);
}

// ===== 行星数据（卡通化 + 人为轨道分层，不按真实AU比例） =====
const SUN = { radius: 40, color: '#ffcc33' };
const MAX_ORBIT_RADIUS = 460; // 最外层海王星轨道，用于计算 scale

const PLANETS = [
  { name: '水星', color: '#b0a8a0', size: 7,  orbit: 85,  period: 0.24, emoji: '☿️', desc: '最小最快的行星，一年只有88天！' },
  { name: '金星', color: '#e8c875', size: 11, orbit: 125, period: 0.62, emoji: '♀️', desc: '夜空中最亮的星星，傍晚就能看到它~' },
  { name: '地球', color: '#4aa3ff', size: 12, orbit: 165, period: 1.0,  emoji: '🌍', desc: '这是我们的家！蓝色的水球🌊' },
  { name: '火星', color: '#e55a3a', size: 9,  orbit: 205, period: 1.88, emoji: '🔴', desc: '红色的星球，上面有最高的山！' },
  { name: '木星', color: '#e8a85c', size: 26, orbit: 275, period: 11.86, emoji: '♃', desc: '最大的行星，条纹好多，还有个大红斑！' },
  { name: '土星', color: '#e8d088', size: 22, orbit: 345, period: 29.46, emoji: '🪐', desc: '有漂亮光环的行星！最特别的那个✨', hasRing: true },
  { name: '天王星', color: '#9ce0e8', size: 16, orbit: 400, period: 84.0,  emoji: '♅', desc: '躺着转的冰蓝行星，好Q哦！' },
  { name: '海王星', color: '#3a7ae0', size: 15, orbit: 455, period: 164.8, emoji: '♆', desc: '最远的行星，深蓝色好漂亮！' }
];

// 初始化行星角度（随机，好看）
PLANETS.forEach(p => { p.angle = Math.random() * Math.PI * 2; });

// 月球（绕地球）
const MOON = { distance: 22, size: 3, angle: 0, speed: 12 }; // 一年绕地球12圈

// ===== 星空背景（一次性生成，只改 alpha 做闪烁） =====
const STARS = [];
function initStars() {
  STARS.length = 0;
  const count = Math.floor((W * H) / 6000); // 每6000像素一个星
  for (let i = 0; i < count; i++) {
    STARS.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.3,
      alpha: Math.random(),
      alphaDir: Math.random() > 0.5 ? 1 : -1,
      speed: Math.random() * 0.02 + 0.005
    });
  }
}

function drawStars() {
  for (const s of STARS) {
    s.alpha += s.alphaDir * s.speed;
    if (s.alpha > 1) { s.alpha = 1; s.alphaDir = -1; }
    if (s.alpha < 0.2) { s.alpha = 0.2; s.alphaDir = 1; }
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.fill();
  }
}

// ===== 画太阳（中心 + 光晕 + 脉动） =====
let sunPulse = 0;
function drawSun() {
  sunPulse += 0.03;
  const pulseSize = Math.sin(sunPulse) * 3;

  // 外光晕（三层渐变）
  const glow1 = ctx.createRadialGradient(CX, CY, SUN.radius * scale, CX, CY, (SUN.radius + 50) * scale);
  glow1.addColorStop(0, 'rgba(255,200,60,0.45)');
  glow1.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = glow1;
  ctx.beginPath();
  ctx.arc(CX, CY, (SUN.radius + 50) * scale + pulseSize, 0, Math.PI * 2);
  ctx.fill();

  // 太阳本体
  const sunGrad = ctx.createRadialGradient(CX - 8 * scale, CY - 8 * scale, 0, CX, CY, SUN.radius * scale);
  sunGrad.addColorStop(0, '#fff4a0');
  sunGrad.addColorStop(0.5, '#ffcc33');
  sunGrad.addColorStop(1, '#ff8a22');
  ctx.beginPath();
  ctx.arc(CX, CY, SUN.radius * scale + pulseSize * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = sunGrad;
  ctx.fill();
}

// ===== 画轨道（淡灰虚线） =====
function drawOrbits() {
  ctx.save();
  ctx.setLineDash([3, 6]);
  for (const p of PLANETS) {
    ctx.beginPath();
    ctx.arc(CX, CY, p.orbit * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// ===== 画行星 =====
function drawPlanet(p) {
  const x = CX + Math.cos(p.angle) * p.orbit * scale;
  const y = CY + Math.sin(p.angle) * p.orbit * scale;
  const r = p.size * scale;

  // 土星环（在土星本体下方绘制部分）
  if (p.hasRing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(230,210,150,0.6)';
    ctx.lineWidth = r * 0.25;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(230,210,150,0.35)';
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
    ctx.restore();
  }

  // 本体（卡通圆 + 高光）
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  grad.addColorStop(0, lightenColor(p.color, 40));
  grad.addColorStop(1, p.color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // 高光
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();

  // 地球的月球
  if (p.name === '地球') {
    const mx = x + Math.cos(MOON.angle) * MOON.distance * scale;
    const my = y + Math.sin(MOON.angle) * MOON.distance * scale;
    ctx.beginPath();
    ctx.arc(mx, my, MOON.size * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#d8d4cc';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx - MOON.size * scale * 0.3, my - MOON.size * scale * 0.3, MOON.size * scale * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  }

  // 保存坐标用于点击检测
  p._x = x; p._y = y; p._r = r;
}

// 让颜色变亮（用于高光）
function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + percent);
  const g = Math.min(255, ((num >> 8) & 0xff) + percent);
  const b = Math.min(255, (num & 0xff) + percent);
  return `rgb(${r},${g},${b})`;
}

// ===== 火箭发射 =====
const rocket = { active: false, progress: 0, duration: 120, startX: 0, startY: 0, peakOffset: 0 };
function launchRocket() {
  rocket.active = true;
  rocket.progress = 0;
  rocket.startX = CX;
  rocket.startY = H - 30;
  rocket.peakOffset = Math.random() * 60 + 40; // 弧顶偏移
}

function drawRocket() {
  if (!rocket.active) return;
  rocket.progress += 0.012;
  if (rocket.progress >= 1) { rocket.active = false; return; }

  const t = rocket.progress;
  // 用贝塞尔曲线近似：起点→弧顶→终点(飞出屏幕)
  const endX = CX + (t - 0.5) * W * 0.6;
  const endY = -40;
  const controlX = CX + rocket.peakOffset;
  const controlY = H * 0.15;
  const x = (1 - t) * (1 - t) * rocket.startX + 2 * (1 - t) * t * controlX + t * t * endX;
  const y = (1 - t) * (1 - t) * rocket.startY + 2 * (1 - t) * t * controlY + t * t * endY;
  const angle = Math.atan2(endY - rocket.startY, endX - rocket.startX);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 尾焰
  const flameLen = 10 + Math.sin(Date.now() * 0.03) * 4;
  ctx.fillStyle = '#ff9a3a';
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-8 - flameLen, -4);
  ctx.lineTo(-8 - flameLen * 1.5, 0);
  ctx.lineTo(-8 - flameLen, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffdd55';
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-8 - flameLen * 0.6, -2);
  ctx.lineTo(-8 - flameLen * 0.9, 0);
  ctx.lineTo(-8 - flameLen * 0.6, 2);
  ctx.closePath();
  ctx.fill();

  // 火箭主体
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-8, -5, 20, 10);
  // 火箭头
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(6, -5);
  ctx.lineTo(6, 5);
  ctx.closePath();
  ctx.fillStyle = '#e55a3a';
  ctx.fill();
  // 窗户
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#4aa3ff';
  ctx.fill();
  // 尾翼
  ctx.fillStyle = '#e55a3a';
  ctx.beginPath();
  ctx.moveTo(-8, -5);
  ctx.lineTo(-13, -10);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 5);
  ctx.lineTo(-13, 10);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ===== 主动画循环 =====
let speedMultiplier = 1;
function animate() {
  // 清屏 + 背景渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0520');
  bg.addColorStop(0.5, '#05010f');
  bg.addColorStop(1, '#0a0520');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawStars();
  drawOrbits();
  drawSun();

  // 更新 + 画行星
  for (const p of PLANETS) {
    p.angle += (1 / p.period) * 0.008 * speedMultiplier; // 周期越小转越快
    drawPlanet(p);
  }

  // 更新月球
  MOON.angle += (MOON.speed / PLANETS[2].period) * 0.008 * speedMultiplier;

  drawRocket();

  requestAnimationFrame(animate);
}

// ===== 交互：点击行星 =====
const infoCard = document.querySelector('#infoCard');
const infoName = document.querySelector('#infoName');
const infoDesc = document.querySelector('#infoDesc');
const infoIcon = document.querySelector('#infoIcon');
const planetChips = document.querySelector('#planetChips');

function showPlanetInfo(p) {
  infoIcon.textContent = p.emoji;
  infoName.textContent = p.name;
  infoDesc.textContent = p.desc;
  infoCard.classList.remove('hidden');
  requestAnimationFrame(() => infoCard.classList.add('show'));
  // 更新 chip 高亮
  document.querySelectorAll('.chip').forEach((el, i) => {
    el.classList.toggle('highlight', PLANETS[i] === p);
  });
}

function hidePlanetInfo() {
  infoCard.classList.remove('show');
  setTimeout(() => infoCard.classList.add('hidden'), 250);
  document.querySelectorAll('.chip').forEach(el => el.classList.remove('highlight'));
}

function handleTap(e) {
  // 如果是点击卡片关闭按钮，让按钮自己处理
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX || e.touches?.[0]?.clientX;
  const clientY = e.clientY || e.touches?.[0]?.clientY;
  if (clientX == null) return;
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  // 检测点击到哪个行星（从外向内检查，避免大行星遮挡小行星）
  for (let i = PLANETS.length - 1; i >= 0; i--) {
    const p = PLANETS[i];
    if (p._x == null) continue;
    const dx = x - p._x;
    const dy = y - p._y;
    if (Math.sqrt(dx * dx + dy * dy) < p._r + 12) {
      showPlanetInfo(p);
      return;
    }
  }
  // 点空白 = 关闭卡片
  hidePlanetInfo();
}

canvas.addEventListener('click', handleTap);
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleTap(e);
}, { passive: false });

document.querySelector('#infoClose').addEventListener('click', hidePlanetInfo);

// ===== 速度滑块 =====
const speedSlider = document.querySelector('#speedSlider');
const speedValue = document.querySelector('#speedValue');
speedSlider.addEventListener('input', (e) => {
  speedMultiplier = parseFloat(e.target.value);
  speedValue.textContent = speedMultiplier.toFixed(1) + 'x';
});

// ===== 火箭按钮 =====
document.querySelector('#btnRocket').addEventListener('click', launchRocket);

// ===== 重置按钮 =====
document.querySelector('#btnReset').addEventListener('click', () => {
  PLANETS.forEach(p => { p.angle = Math.random() * Math.PI * 2; });
  MOON.angle = 0;
  speedSlider.value = 1;
  speedMultiplier = 1;
  speedValue.textContent = '1x';
  rocket.active = false;
  hidePlanetInfo();
});

// ===== 底部行星快捷按钮 =====
function buildChips() {
  planetChips.innerHTML = PLANETS.map((p, i) =>
    `<button class="chip" data-idx="${i}">${p.emoji} ${p.name}</button>`
  ).join('');
  planetChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const idx = parseInt(chip.dataset.idx);
    showPlanetInfo(PLANETS[idx]);
  });
}

// ===== 启动 =====
window.addEventListener('resize', () => { resize(); initStars(); });
resize();
initStars();
buildChips();
animate();

// ===== 轻敲音效（Web Audio API，无需外部文件） =====
let audioCtx = null;
function playDing() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) { /* 静默忽略 */ }
}
canvas.addEventListener('click', playDing);
document.querySelector('#btnRocket').addEventListener('click', playDing);
