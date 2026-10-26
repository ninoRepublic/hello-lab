<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// ===== 对象 =====
const stage = ref(null)
let scene, camera, renderer, labelRenderer, controls, clock
let animId = null
const planetMeshes = []
let starsGroup, rocketGroup

// ===== 数据（玩具乐园比例，全部在相机 FOV 内清晰可见） =====
// FOV 40°，相机距离 260，最远轨道 110 → 行星在屏幕上占 50-120px
const SUN_R = 35

const planets = reactive([
  { name: '水星', color: 0xb8b0a8, size: 5.5, orbit: 30, period: 0.24, emoji: '☿️', desc: '最小最快的行星！', angle: Math.random() * Math.PI * 2 },
  { name: '金星', color: 0xf0d090, size: 8.0, orbit: 48, period: 0.62, emoji: '♀️', desc: '夜空中最亮的星星~', angle: Math.random() * Math.PI * 2 },
  { name: '地球', color: 0x5cb4ff, size: 9.0, orbit: 66, period: 1.0,  emoji: '🌍', desc: '我们的家！蓝色水球🌊', angle: Math.random() * Math.PI * 2, hasMoon: true },
  { name: '火星', color: 0xf06848, size: 6.8, orbit: 82, period: 1.88, emoji: '🔴', desc: '红色的星球！', angle: Math.random() * Math.PI * 2 },
  { name: '木星', color: 0xf0b870, size: 22.0, orbit: 115, period: 11.86, emoji: '♃', desc: '最大的行星！条纹好多！', angle: Math.random() * Math.PI * 2 },
  { name: '土星', color: 0xf0dc90, size: 18.5, orbit: 148, period: 29.46, emoji: '🪐', desc: '有漂亮光环！', angle: Math.random() * Math.PI * 2, hasRing: true },
  { name: '天王星', color: 0xa8ecee, size: 12.0, orbit: 178, period: 84.0,  emoji: '♅', desc: '躺着转的冰蓝行星！', angle: Math.random() * Math.PI * 2 },
  { name: '海王星', color: 0x4a90f0, size: 11.0, orbit: 208, period: 164.8, emoji: '♆', desc: '最远的深蓝色星球！', angle: Math.random() * Math.PI * 2 }
])
const MAX_ORBIT = 208

// ===== UI 状态 =====
const speed = ref(1)
const speedLabel = computed(() => speed.value.toFixed(1) + 'x')
const selected = ref(null)
const cardVisible = computed(() => selected.value !== null)
const rocketT = reactive({ active: false, t: 0 })

// ===== 音效 =====
let audioCtx = null
function ding() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.connect(g); g.connect(audioCtx.destination); o.type = 'sine'
    o.frequency.setValueAtTime(880, audioCtx.currentTime)
    o.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1)
    g.gain.setValueAtTime(0.22, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
    o.start(); o.stop(audioCtx.currentTime + 0.3)
  } catch (e) {}
}

// ===== 太阳纹理 =====
function sunTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 126)
  g.addColorStop(0.0, '#ffffff')
  g.addColorStop(0.15, '#fff5a0')
  g.addColorStop(0.4, '#ffd444')
  g.addColorStop(0.7, '#ff8833')
  g.addColorStop(1.0, '#aa3300')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ===== 初始化 =====
function init() {
  const W = stage.value.clientWidth, H = stage.value.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05010f)

  // 相机：FOV 40° 聚焦看清楚，距离刚好容纳所有星球
  camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 2000)
  const d = MAX_ORBIT * 1.6 + 35  // ≈ 368
  camera.position.set(d * 0.65, d * 0.5, d * 0.65)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(W, H)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  stage.value.appendChild(renderer.domElement)

  // CSS2D labels
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(W, H)
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;'
  stage.value.appendChild(labelRenderer.domElement)

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 80
  controls.maxDistance = 700
  controls.target.set(0, 0, 0)

  // 灯光：太阳点光 + 天空半球 + 环境光
  const pl = new THREE.PointLight(0xfff5cc, 3.5, 0, 2)
  scene.add(pl)
  scene.add(new THREE.HemisphereLight(0x3a4ca0, 0x0e0722, 0.55))
  scene.add(new THREE.AmbientLight(0x10182a, 0.35))

  clock = new THREE.Clock()
  build()
}

// ===== 构建 =====
function build() {
  // --- 太阳（纹理 + 三层彩色光晕） ---
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_R, 64, 64),
    new THREE.MeshBasicMaterial({ map: sunTex() })
  )
  scene.add(sun)
  planetMeshes.sun = sun // 让它可以选（可选，先跳过点击）

  // 三层光晕 BackSide
  ;[
    { s: 1.30, c: 0xff5500, o: 0.50 },
    { s: 1.75, c: 0xff9944, o: 0.30 },
    { s: 2.60, c: 0xffaa88, o: 0.15 }
  ].forEach(g => {
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R * g.s, 32, 32),
      new THREE.MeshBasicMaterial({ color: g.c, transparent: true, opacity: g.o, side: THREE.BackSide, depthWrite: false })
    ))
  })

  // --- 轨道线（Line 画干净的圆） ---
  for (const p of planets) {
    const pts = []
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit))
    }
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.45 })
    ))
  }

  // --- 行星 ---
  for (const p of planets) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 48, 48),
      new THREE.MeshStandardMaterial({
        color: p.color,
        emissive: p.color,          // 星球本身微发光
        emissiveIntensity: 0.15,
        roughness: 0.55,
        metalness: 0.05
      })
    )
    mesh.userData.planet = p
    scene.add(mesh)

    // 星球外沿柔和光晕（BackSide 小球壳）
    mesh.add(new THREE.Mesh(
      new THREE.SphereGeometry(p.size * 1.22, 32, 32),
      new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false })
    ))

    // 土星环
    if (p.hasRing) {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.5, p.size * 2.7, 64),
        new THREE.MeshBasicMaterial({ color: 0xf0d880, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
      )
      r.rotation.x = Math.PI / 2.2
      mesh.add(r)
    }

    // 月球
    if (p.hasMoon) {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xeeeecc, roughness: 0.85 })
      )
      moon.position.set(p.size + 5, 0, 0)
      mesh.add(moon)
      p._moon = moon
    }

    // 名称标签
    const d = document.createElement('div')
    d.textContent = p.name
    d.style.cssText = 'color:#ffe89a;font-size:16px;font-weight:700;text-shadow:0 0 8px rgba(0,0,0,0.95);pointer-events:none;'
    const label = new CSS2DObject(d)
    label.position.set(0, p.size + 3.5, 0)
    mesh.add(label)

    planetMeshes.push(mesh)
  }

  // --- 星空（简洁、不抢眼） ---
  const starCount = 1200
  const pos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const r = 450 + Math.random() * 250
    const t = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    pos[i*3]   = r * Math.sin(ph) * Math.cos(t)
    pos[i*3+1] = r * Math.cos(ph)
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(t)
  }
  starsGroup = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ color: 0xbbd0ff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false })
  )
  scene.add(starsGroup)

  // --- 火箭 ---
  rocketGroup = buildRocket()
  rocketGroup.visible = false
  scene.add(rocketGroup)
}

function buildRocket() {
  const g = new THREE.Group()
  const w = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
  const r = new THREE.MeshStandardMaterial({ color: 0xe55a3a, metalness: 0.2, roughness: 0.5 })
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 20), w))
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 20), r)
  nose.position.y = 2.45; g.add(nose)
  const fl = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.8, 16),
    new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 })
  )
  fl.position.y = -2.5; fl.name = 'flame'; g.add(fl)
  return g
}

// ===== 动画 =====
let pulse = 0
function animate() {
  animId = requestAnimationFrame(animate)
  const d = clock.getDelta()
  pulse += d

  // 太阳呼吸
  planetMeshes.sun.scale.setScalar(1 + Math.sin(pulse * 1.8) * 0.025)
  // 星空缓慢转动 + 呼吸
  starsGroup.rotation.y += d * 0.01
  starsGroup.material.opacity = 0.45 + Math.sin(pulse * 0.6) * 0.1

  // 行星公转
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]
    p.angle += (1 / p.period) * d * 0.5 * speed.value
    const mesh = planetMeshes[i]
    mesh.position.x = Math.cos(p.angle) * p.orbit
    mesh.position.z = Math.sin(p.angle) * p.orbit
    mesh.rotation.y += d * 0.25
    if (p._moon) {
      const mAng = clock.elapsedTime * 2.5 * speed.value
      p._moon.position.set(Math.cos(mAng) * (p.size + 5), 0, Math.sin(mAng) * (p.size + 5))
    }
  }

  // 火箭
  if (rocketT.active) updateRocket(d)

  controls.update()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

function updateRocket(d) {
  rocketT.t += d * 0.5
  if (rocketT.t >= 1) { rocketT.active = false; rocketGroup.visible = false; return }
  const t = rocketT.t
  const r = 50 + t * 300
  const ang = t * Math.PI * 2.5
  rocketGroup.position.set(Math.cos(ang) * r, 15 + Math.sin(t * Math.PI) * 20, Math.sin(ang) * r)
  rocketGroup.lookAt(0, 15, 0); rocketGroup.visible = true
  const fl = rocketGroup.getObjectByName('flame')
  if (fl) { fl.scale.y = 1 + Math.sin(Date.now() * 0.03) * 0.35 }
}

// ===== 交互 =====
const rc = new THREE.Raycaster(), pt = new THREE.Vector2()
function onTap(e) {
  const rect = renderer.domElement.getBoundingClientRect()
  const cx = e.clientX ?? e.touches?.[0]?.clientX
  const cy = e.clientY ?? e.touches?.[0]?.clientY
  if (cx == null) return
  pt.x = ((cx - rect.left) / rect.width) * 2 - 1
  pt.y = -((cy - rect.top) / rect.height) * 2 + 1
  rc.setFromCamera(pt, camera)
  const hits = rc.intersectObjects(planetMeshes, false)
  // 跳过第一个（sun 用 .sun push 了）
  const realHits = hits.filter(h => h.object.userData.planet)
  if (realHits.length > 0) { ding(); selected.value = realHits[0].object.userData.planet }
  else selected.value = null
}

function closeCard() { selected.value = null }
function selectChip(i) { ding(); selected.value = planets[i] }
function onSpeedInput(e) { speed.value = parseFloat(e.target.value) }
function launchRocket() { rocketT.active = true; rocketT.t = 0; ding() }
function reset() {
  planets.forEach(p => { p.angle = Math.random() * Math.PI * 2 })
  speed.value = 1; rocketT.active = false; selected.value = null
  const d = MAX_ORBIT * 1.6 + 35
  camera.position.set(d * 0.65, d * 0.5, d * 0.65)
  controls.target.set(0, 0, 0); controls.update()
  const s = document.querySelector('#speedSlider')
  if (s) s.value = 1
}

// ===== 自适应 =====
function resize() {
  const W = stage.value.clientWidth, H = stage.value.clientHeight
  camera.aspect = W / H; camera.updateProjectionMatrix()
  renderer.setSize(W, H); labelRenderer.setSize(W, H)
}

// ===== 生命周期 =====
onMounted(() => {
  init(); animate()
  window.addEventListener('resize', resize)
  renderer.domElement.addEventListener('click', onTap)
})
onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  renderer?.domElement.removeEventListener('click', onTap)
  controls?.dispose(); renderer?.dispose()
})
</script>

<template>
  <div class="solar-system">
    <header class="title-bar">
      <h1>🪐 宝贝的太阳系</h1>
      <p class="subtitle">按住拖拽旋转 · 滚轮缩放 · 点星球看介绍</p>
    </header>
    <div ref="stage" class="stage"></div>

    <aside class="controls">
      <div class="group">
        <label for="speedSlider">⏩ 公转速度</label>
        <input id="speedSlider" type="range" min="0" max="5" step="0.1" :value="speed" @input="onSpeedInput" />
        <span class="lbl">{{ speedLabel }}</span>
      </div>
      <button class="btn" @click="launchRocket">🚀 发射火箭</button>
      <button class="btn" @click="reset">🔄 重置视角</button>
    </aside>

    <Transition name="card">
      <div v-if="cardVisible" class="info-card">
        <div class="icon">{{ selected.emoji }}</div>
        <h2>{{ selected.name }}</h2>
        <p>{{ selected.desc }}</p>
        <button class="close" @click="closeCard">✖️</button>
      </div>
    </Transition>

    <nav class="chips">
      <button
        v-for="(p, i) in planets"
        :key="p.name"
        class="chip"
        :class="{ hl: selected?.name === p.name }"
        @click="selectChip(i)"
      >{{ p.emoji }} {{ p.name }}</button>
    </nav>
  </div>
</template>

<style scoped>
.solar-system { position: fixed; inset: 0; width: 100%; height: 100%; }
.stage { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.stage:active { cursor: grabbing; }
.title-bar { position: fixed; top: 0; left: 0; right: 0; padding: 14px 20px 6px; text-align: center; z-index: 10; pointer-events: none; }
.title-bar h1 { font-size: 1.55rem; font-weight: 700; background: linear-gradient(90deg, #ffd36b, #ff8ad4, #7ad1ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.title-bar .subtitle { font-size: 0.78rem; color: #999; margin-top: 2px; }
.controls { position: fixed; top: 70px; right: 14px; display: flex; flex-direction: column; gap: 10px; z-index: 10; }
.group { background: rgba(255,255,255,0.08); backdrop-filter: blur(10px); border-radius: 16px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
.group label { font-size: 0.8rem; color: #ddd; }
.group input[type=range] { -webkit-appearance: none; width: 140px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #ffd36b, #ff8ad4); outline: none; }
.group input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; cursor: pointer; box-shadow: 0 0 8px rgba(255,180,100,0.6); }
.group .lbl { font-size: 0.8rem; color: #ffd36b; text-align: right; }
.btn { padding: 10px 18px; font-size: 0.9rem; font-weight: 600; border: none; border-radius: 20px; cursor: pointer; background: linear-gradient(135deg, #ffd36b, #ff8ad4); color: #2a1055; box-shadow: 0 4px 14px rgba(255,140,180,0.4); transition: transform 0.15s; }
.btn:active { transform: scale(0.92); }
.info-card { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(30,10,60,0.92); backdrop-filter: blur(16px); border-radius: 24px; padding: 26px 30px; text-align: center; z-index: 20; min-width: 240px; max-width: 80vw; box-shadow: 0 10px 40px rgba(120,60,255,0.5); border: 2px solid rgba(255,211,107,0.5); }
.info-card .icon { font-size: 3.2rem; margin-bottom: 8px; }
.info-card h2 { font-size: 1.3rem; background: linear-gradient(90deg, #ffd36b, #ff8ad4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
.info-card p { font-size: 0.95rem; color: #ddd; line-height: 1.5; }
.info-card .close { position: absolute; top: 10px; right: 12px; width: 28px; height: 28px; border: none; border-radius: 50%; background: rgba(255,255,255,0.15); color: #fff; font-size: 0.9rem; cursor: pointer; }
.card-enter-active, .card-leave-active { transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s; }
.card-enter-from, .card-leave-to { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
.chips { position: fixed; bottom: 16px; left: 0; right: 0; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; padding: 0 14px; z-index: 10; }
.chips .chip { padding: 6px 14px; font-size: 0.75rem; border-radius: 16px; border: none; cursor: pointer; background: rgba(255,255,255,0.1); color: #fff; backdrop-filter: blur(6px); transition: all 0.15s; }
.chips .chip:active { transform: scale(0.92); }
.chips .chip.hl { background: rgba(255,211,107,0.5); color: #2a1055; }
@media (max-width: 600px) {
  .title-bar h1 { font-size: 1.3rem; }
  .controls { top: 62px; right: 8px; gap: 8px; }
  .group input[type=range] { width: 100px; }
  .btn { padding: 8px 14px; font-size: 0.8rem; }
}
</style>
