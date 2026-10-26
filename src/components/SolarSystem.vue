<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'

// ===== Canvas 引用 =====
const stage = ref(null)
let ctx = null
let rafId = null
let dpr = 1
let W = 0, H = 0, CX = 0, CY = 0, scale = 1
const MAX_ORBIT_RADIUS = 460

// ===== 行星数据 =====
const SUN = { radius: 40, color: '#ffcc33' }

const planets = reactive([
  { name: '水星', color: '#b0a8a0', size: 7,  orbit: 85,  period: 0.24, emoji: '☿️', desc: '最小最快的行星，一年只有88天！', angle: 0, _x: 0, _y: 0, _r: 0 },
  { name: '金星', color: '#e8c875', size: 11, orbit: 125, period: 0.62, emoji: '♀️', desc: '夜空中最亮的星星，傍晚就能看到它~', angle: 0, _x: 0, _y: 0, _r: 0 },
  { name: '地球', color: '#4aa3ff', size: 12, orbit: 165, period: 1.0,  emoji: '🌍', desc: '这是我们的家！蓝色的水球🌊', angle: 0, _x: 0, _y: 0, _r: 0 },
  { name: '火星', color: '#e55a3a', size: 9,  orbit: 205, period: 1.88, emoji: '🔴', desc: '红色的星球，上面有最高的山！', angle: 0, _x: 0, _y: 0, _r: 0 },
  { name: '木星', color: '#e8a85c', size: 26, orbit: 275, period: 11.86, emoji: '♃', desc: '最大的行星，条纹好多，还有个大红斑！', angle: 0, _x: 0, _y: 0, _r: 0 },
  { name: '土星', color: '#e8d088', size: 22, orbit: 345, period: 29.46, emoji: '🪐', desc: '有漂亮光环的行星！最特别的那个✨', angle: 0, _x: 0, _y: 0, _r: 0, hasRing: true },
  { name: '天王星', color: '#9ce0e8', size: 16, orbit: 400, period: 84.0,  emoji: '♅', desc: '躺着转的冰蓝行星，好Q哦！', angle: 0, _x: 0, _y: 0, _r: 0 },
  { name: '海王星', color: '#3a7ae0', size: 15, orbit: 455, period: 164.8, emoji: '♆', desc: '最远的行星，深蓝色好漂亮！', angle: 0, _x: 0, _y: 0, _r: 0 }
])

// 月球（绕地球）
const moon = reactive({ distance: 22, size: 3, angle: 0, speed: 12 })

// ===== 星空 =====
const stars = []
function initStars() {
  stars.length = 0
  const count = Math.floor((W * H) / 6000)
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.3,
      alpha: Math.random(),
      alphaDir: Math.random() > 0.5 ? 1 : -1,
      speed: Math.random() * 0.02 + 0.005
    })
  }
}

// ===== 状态（响应式） =====
const speedMultiplier = ref(1)
const speedLabel = computed(() => speedMultiplier.value.toFixed(1) + 'x')

// 信息卡片
const selectedPlanet = ref(null)
const cardVisible = computed(() => selectedPlanet.value !== null)

// 火箭
const rocket = reactive({ active: false, t: 0, peakOffset: 0 })

// 太阳脉动
let sunPulse = 0

// ===== 颜色辅助 =====
function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + percent)
  const g = Math.min(255, ((num >> 8) & 0xff) + percent)
  const b = Math.min(255, (num & 0xff) + percent)
  return `rgb(${r},${g},${b})`
}

// ===== 绘制 =====
function drawStars() {
  for (const s of stars) {
    s.alpha += s.alphaDir * s.speed
    if (s.alpha > 1) { s.alpha = 1; s.alphaDir = -1 }
    if (s.alpha < 0.2) { s.alpha = 0.2; s.alphaDir = 1 }
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`
    ctx.fill()
  }
}

function drawSun() {
  sunPulse += 0.03
  const pulseSize = Math.sin(sunPulse) * 3
  const glow1 = ctx.createRadialGradient(CX, CY, SUN.radius * scale, CX, CY, (SUN.radius + 50) * scale)
  glow1.addColorStop(0, 'rgba(255,200,60,0.45)')
  glow1.addColorStop(1, 'rgba(255,200,60,0)')
  ctx.fillStyle = glow1
  ctx.beginPath()
  ctx.arc(CX, CY, (SUN.radius + 50) * scale + pulseSize, 0, Math.PI * 2)
  ctx.fill()

  const sunGrad = ctx.createRadialGradient(CX - 8 * scale, CY - 8 * scale, 0, CX, CY, SUN.radius * scale)
  sunGrad.addColorStop(0, '#fff4a0')
  sunGrad.addColorStop(0.5, '#ffcc33')
  sunGrad.addColorStop(1, '#ff8a22')
  ctx.beginPath()
  ctx.arc(CX, CY, SUN.radius * scale + pulseSize * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = sunGrad
  ctx.fill()
}

function drawOrbits() {
  ctx.save()
  ctx.setLineDash([3, 6])
  for (const p of planets) {
    ctx.beginPath()
    ctx.arc(CX, CY, p.orbit * scale, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

function drawPlanet(p) {
  const x = CX + Math.cos(p.angle) * p.orbit * scale
  const y = CY + Math.sin(p.angle) * p.orbit * scale
  const r = p.size * scale

  // 土星环
  if (p.hasRing) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, 0.35)
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(230,210,150,0.6)'
    ctx.lineWidth = r * 0.25
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, r * 2.0, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(230,210,150,0.35)'
    ctx.lineWidth = r * 0.12
    ctx.stroke()
    ctx.restore()
  }

  // 本体
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
  grad.addColorStop(0, lightenColor(p.color, 40))
  grad.addColorStop(1, p.color)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // 高光
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fill()

  // 地球的月球
  if (p.name === '地球') {
    const mx = x + Math.cos(moon.angle) * moon.distance * scale
    const my = y + Math.sin(moon.angle) * moon.distance * scale
    ctx.beginPath()
    ctx.arc(mx, my, moon.size * scale, 0, Math.PI * 2)
    ctx.fillStyle = '#d8d4cc'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(mx - moon.size * scale * 0.3, my - moon.size * scale * 0.3, moon.size * scale * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fill()
  }

  p._x = x; p._y = y; p._r = r
}

function drawRocket() {
  if (!rocket.active) return
  rocket.t += 0.012
  if (rocket.t >= 1) { rocket.active = false; return }

  const t = rocket.t
  const startX = CX, startY = H - 30
  const endX = CX + (t - 0.5) * W * 0.6
  const endY = -40
  const controlX = CX + rocket.peakOffset
  const controlY = H * 0.15
  const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX
  const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * endY
  const angle = Math.atan2(endY - startY, endX - startX)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const flameLen = 10 + Math.sin(Date.now() * 0.03) * 4
  ctx.fillStyle = '#ff9a3a'
  ctx.beginPath()
  ctx.moveTo(-8, 0); ctx.lineTo(-8 - flameLen, -4); ctx.lineTo(-8 - flameLen * 1.5, 0); ctx.lineTo(-8 - flameLen, 4); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffdd55'
  ctx.beginPath()
  ctx.moveTo(-8, 0); ctx.lineTo(-8 - flameLen * 0.6, -2); ctx.lineTo(-8 - flameLen * 0.9, 0); ctx.lineTo(-8 - flameLen * 0.6, 2); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-8, -5, 20, 10)
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(6, -5); ctx.lineTo(6, 5); ctx.closePath(); ctx.fillStyle = '#e55a3a'; ctx.fill()
  ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#4aa3ff'; ctx.fill()
  ctx.fillStyle = '#e55a3a'
  ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-13, -10); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(-13, 10); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill()
  ctx.restore()
}

// ===== 主动画 =====
function animate() {
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0a0520'); bg.addColorStop(0.5, '#05010f'); bg.addColorStop(1, '#0a0520')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  drawStars()
  drawOrbits()
  drawSun()

  for (const p of planets) {
    p.angle += (1 / p.period) * 0.008 * speedMultiplier.value
    drawPlanet(p)
  }
  moon.angle += (moon.speed / planets[2].period) * 0.008 * speedMultiplier.value
  drawRocket()

  rafId = requestAnimationFrame(animate)
}

// ===== 尺寸 =====
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = window.innerWidth; H = window.innerHeight
  stage.value.width = W * dpr
  stage.value.height = H * dpr
  stage.value.style.width = W + 'px'
  stage.value.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  CX = W / 2; CY = H / 2
  scale = Math.min(W, H) / (MAX_ORBIT_RADIUS + 60)
  initStars()
}

// ===== 交互 =====
function getTapPos(e) {
  const rect = stage.value.getBoundingClientRect()
  const t = e.touches ? e.touches[0] : e
  return { x: t.clientX - rect.left, y: t.clientY - rect.top }
}

function onCanvasTap(e) {
  e.preventDefault?.()
  const { x, y } = getTapPos(e)
  // 从外向内检测
  for (let i = planets.length - 1; i >= 0; i--) {
    const p = planets[i]
    if (!p._x) continue
    if (Math.hypot(x - p._x, y - p._y) < p._r + 12) {
      playDing()
      selectedPlanet.value = p
      return
    }
  }
  selectedPlanet.value = null
}

function closeCard() { selectedPlanet.value = null }

function onSpeedInput(e) {
  speedMultiplier.value = parseFloat(e.target.value)
}

function launchRocket() {
  rocket.active = true
  rocket.t = 0
  rocket.peakOffset = Math.random() * 60 + 40
  playDing()
}

function reset() {
  planets.forEach(p => { p.angle = Math.random() * Math.PI * 2 })
  moon.angle = 0
  speedMultiplier.value = 1
  rocket.active = false
  selectedPlanet.value = null
  // 同步滑块
  const slider = document.querySelector('#speedSlider')
  if (slider) slider.value = 1
}

// 快捷按钮
function selectChip(idx) {
  playDing()
  selectedPlanet.value = planets[idx]
}

// ===== 音效（Web Audio API） =====
let audioCtx = null
function playDing() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
    osc.start(); osc.stop(audioCtx.currentTime + 0.3)
  } catch (e) { /* 静默 */ }
}

// ===== 生命周期 =====
onMounted(() => {
  ctx = stage.value.getContext('2d')
  resize()
  planets.forEach(p => { p.angle = Math.random() * Math.PI * 2 })
  animate()
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <div class="solar-system">
    <!-- 标题 -->
    <header class="title-bar">
      <h1>🪐 宝贝的太阳系</h1>
      <p class="subtitle">点一点星球，转一转看看！</p>
    </header>

    <!-- Canvas -->
    <canvas ref="stage" @click="onCanvasTap" @touchstart="onCanvasTap"></canvas>

    <!-- 控制面板 -->
    <aside class="controls">
      <div class="control-group">
        <label for="speedSlider">⏩ 公转速度</label>
        <input id="speedSlider" type="range" min="0" max="5" step="0.1" :value="speedMultiplier" @input="onSpeedInput" />
        <span class="speed-label">{{ speedLabel }}</span>
      </div>
      <button class="big-btn" @click="launchRocket">🚀 发射火箭</button>
      <button class="big-btn" @click="reset">🔄 重置</button>
    </aside>

    <!-- 信息卡片 -->
    <Transition name="card">
      <div v-if="cardVisible" class="info-card">
        <div class="info-icon">{{ selectedPlanet.emoji }}</div>
        <h2>{{ selectedPlanet.name }}</h2>
        <p>{{ selectedPlanet.desc }}</p>
        <button class="info-close" @click="closeCard">✖️</button>
      </div>
    </Transition>

    <!-- 底部快捷按钮 -->
    <nav class="planet-chips">
      <button
        v-for="(p, i) in planets"
        :key="p.name"
        class="chip"
        :class="{ highlight: selectedPlanet?.name === p.name }"
        @click="selectChip(i)"
      >{{ p.emoji }} {{ p.name }}</button>
    </nav>
  </div>
</template>

<style scoped>
.solar-system { position: fixed; inset: 0; width: 100%; height: 100%; }
.title-bar { position: fixed; top: 0; left: 0; right: 0; padding: 14px 20px 6px; text-align: center; z-index: 10; pointer-events: none; }
.title-bar h1 { font-size: 1.6rem; font-weight: 700; background: linear-gradient(90deg, #ffd36b, #ff8ad4, #7ad1ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.title-bar .subtitle { font-size: 0.8rem; color: #aaa; margin-top: 2px; }
.controls { position: fixed; top: 70px; right: 14px; display: flex; flex-direction: column; gap: 10px; z-index: 10; }
.control-group { background: rgba(255,255,255,0.08); backdrop-filter: blur(8px); border-radius: 16px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
.control-group label { font-size: 0.8rem; color: #ddd; }
.control-group input[type=range] { -webkit-appearance: none; width: 140px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #ffd36b, #ff8ad4); outline: none; }
.control-group input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; cursor: pointer; box-shadow: 0 0 8px rgba(255,180,100,0.6); }
.control-group .speed-label { font-size: 0.8rem; color: #ffd36b; text-align: right; }
.big-btn { padding: 10px 18px; font-size: 0.9rem; font-weight: 600; border: none; border-radius: 20px; cursor: pointer; background: linear-gradient(135deg, #ffd36b, #ff8ad4); color: #2a1055; box-shadow: 0 4px 14px rgba(255,140,180,0.4); transition: transform 0.15s; }
.big-btn:active { transform: scale(0.92); }
.info-card { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(30,10,60,0.92); backdrop-filter: blur(16px); border-radius: 24px; padding: 26px 30px; text-align: center; z-index: 20; min-width: 240px; max-width: 80vw; box-shadow: 0 10px 40px rgba(120,60,255,0.5); border: 2px solid rgba(255,211,107,0.5); }
.info-card .info-icon { font-size: 3.2rem; margin-bottom: 8px; }
.info-card h2 { font-size: 1.3rem; background: linear-gradient(90deg, #ffd36b, #ff8ad4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
.info-card p { font-size: 0.95rem; color: #ddd; line-height: 1.5; }
.info-card .info-close { position: absolute; top: 10px; right: 12px; width: 28px; height: 28px; border: none; border-radius: 50%; background: rgba(255,255,255,0.15); color: #fff; font-size: 0.9rem; cursor: pointer; }
.card-enter-active, .card-leave-active { transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s; }
.card-enter-from, .card-leave-to { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
.planet-chips { position: fixed; bottom: 16px; left: 0; right: 0; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; padding: 0 14px; z-index: 10; }
.planet-chips .chip { padding: 6px 14px; font-size: 0.75rem; border-radius: 16px; border: none; cursor: pointer; background: rgba(255,255,255,0.1); color: #fff; backdrop-filter: blur(6px); transition: all 0.15s; }
.planet-chips .chip:active { transform: scale(0.92); }
.planet-chips .chip.highlight { background: rgba(255,211,107,0.5); color: #2a1055; }
@media (max-width: 600px) {
  .title-bar h1 { font-size: 1.3rem; }
  .controls { top: 62px; right: 8px; gap: 8px; }
  .control-group input[type=range] { width: 100px; }
  .big-btn { padding: 8px 14px; font-size: 0.8rem; }
}
</style>
