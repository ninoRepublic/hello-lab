<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// ===== 核心对象 =====
const stage = ref(null)
let scene, camera, renderer, labelRenderer, controls, clock
let animationId = null
const planetMeshes = []
let sunMesh, starsGroup, rocketGroup
let sunPulse = 0

// ===== 数据（比例重新设计，FOV 60°，相机距离 ≈ 300） =====
// 星球尺寸比之前大 2-3x，轨道重新分层，保证相机视野内清晰可见
const SUN = { radius: 28 }

const planets = reactive([
  { name: '水星', color: 0xc8c0b8, emissive: 0x222222, size: 3.0, orbit: 50,  period: 0.24, emoji: '☿️', desc: '最小最快的行星，一年只有88天！', angle: Math.random() * Math.PI * 2 },
  { name: '金星', color: 0xf0d090, emissive: 0x331a00, size: 4.5, orbit: 72,  period: 0.62, emoji: '♀️', desc: '夜空中最亮的星星~', angle: Math.random() * Math.PI * 2 },
  { name: '地球', color: 0x5cb4ff, emissive: 0x002244, size: 5.0, orbit: 94,  period: 1.0,  emoji: '🌍', desc: '这是我们的家！蓝色的水球🌊', angle: Math.random() * Math.PI * 2, hasMoon: true },
  { name: '火星', color: 0xf06848, emissive: 0x441100, size: 3.8, orbit: 116, period: 1.88, emoji: '🔴', desc: '红色的星球！', angle: Math.random() * Math.PI * 2 },
  { name: '木星', color: 0xf0b870, emissive: 0x331a00, size: 11.0, orbit: 152, period: 11.86, emoji: '♃', desc: '最大的行星！', angle: Math.random() * Math.PI * 2 },
  { name: '土星', color: 0xf0dc90, emissive: 0x332200, size: 9.2, orbit: 190, period: 29.46, emoji: '🪐', desc: '有漂亮光环！', angle: Math.random() * Math.PI * 2, hasRing: true },
  { name: '天王星', color: 0xa8ecee, emissive: 0x003333, size: 6.8, orbit: 226, period: 84.0,  emoji: '♅', desc: '躺着转的冰蓝行星！', angle: Math.random() * Math.PI * 2 },
  { name: '海王星', color: 0x4a90f0, emissive: 0x001144, size: 6.3, orbit: 262, period: 164.8, emoji: '♆', desc: '最远的深蓝色星球！', angle: Math.random() * Math.PI * 2 }
])
const MAX_ORBIT = 262

// ===== UI 状态 =====
const speedMultiplier = ref(1)
const speedLabel = computed(() => speedMultiplier.value.toFixed(1) + 'x')
const selectedPlanet = ref(null)
const cardVisible = computed(() => selectedPlanet.value !== null)
const rocketState = reactive({ active: false, t: 0 })

// ===== 音效 =====
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
  } catch (e) {}
}

// ===== Canvas 工具：画径向渐变纹理 =====
function makeSunTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d').createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0.00, '#ffffff')
  g.addColorStop(0.12, '#fff0a0')
  g.addColorStop(0.35, '#ffcc22')
  g.addColorStop(0.65, '#ff8822')
  g.addColorStop(0.90, '#cc3300')
  g.addColorStop(1.00, '#551100')
  c.getContext('2d').fillStyle = g
  c.getContext('2d').beginPath(); c.getContext('2d').arc(128, 128, 126, 0, Math.PI * 2); c.getContext('2d').fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ===== 初始化 =====
function initThree() {
  const W = stage.value.clientWidth
  const H = stage.value.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05010f)
  scene.fog = null

  // 相机：FOV 60° 广角，距离 MAX_ORBIT × 1.9 保证全部可见
  camera = new THREE.PerspectiveCamera(60, W / H, 0.5, 2000)
  const camDist = MAX_ORBIT * 1.9 + 40
  camera.position.set(camDist * 0.6, camDist * 0.55, camDist * 0.6)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(W, H)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  stage.value.appendChild(renderer.domElement)

  // CSS2D（星球标签）
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(W, H)
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;'
  stage.value.appendChild(labelRenderer.domElement)

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 80
  controls.maxDistance = 900
  controls.target.set(0, 0, 0)

  // 光源：太阳点光 + 半球光 + 弱环境光
  const pl = new THREE.PointLight(0xfff2c0, 3.0, 0, 2)
  pl.position.set(0, 0, 0)
  scene.add(pl)
  const hemi = new THREE.HemisphereLight(0x334488, 0x110822, 0.45)
  scene.add(hemi)
  scene.add(new THREE.AmbientLight(0x111522, 0.3))

  clock = new THREE.Clock()
  build()
}

// ===== 构建 =====
function build() {
  // --- 太阳 ---
  const sunTex = makeSunTexture()
  const sunMat = new THREE.MeshBasicMaterial({ map: sunTex })
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius, 64, 64), sunMat)
  scene.add(sunMesh)

  // 三层光晕（BackSide 球壳，颜色从内到外：暖橙→金黄→淡粉）
  ;[
    { r: 1.35, c: 0xff6600, o: 0.45 },
    { r: 1.85, c: 0xffaa44, o: 0.28 },
    { r: 2.80, c: 0xff88cc, o: 0.14 }
  ].forEach(g => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius * g.r, 32, 32),
      new THREE.MeshBasicMaterial({ color: g.c, transparent: true, opacity: g.o, side: THREE.BackSide, depthWrite: false }))
    scene.add(m)
  })

  // --- 轨道线（用 Line 画完美圆环，比 RingGeometry 干净） ---
  for (const p of planets) {
    const pts = []
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: 0x99ccff, transparent: true, opacity: 0.55 })
    scene.add(new THREE.Line(geo, mat))
  }

  // --- 行星 ---
  for (const p of planets) {
    const geo = new THREE.SphereGeometry(p.size, 48, 48)
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      emissive: p.emissive,
      emissiveIntensity: 0.6,
      roughness: 0.6,
      metalness: 0.05
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData.planet = p
    scene.add(mesh)

    // 边缘辉光（半透明 BackSide 小球壳）
    const glowMat = new THREE.MeshBasicMaterial({
      color: p.color, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false
    })
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(p.size * 1.15, 32, 32), glowMat))

    // 土星环
    if (p.hasRing) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.5, p.size * 2.6, 64),
        new THREE.MeshBasicMaterial({ color: 0xf0d880, side: THREE.DoubleSide, transparent: true, opacity: 0.88, depthWrite: false })
      )
      ring.rotation.x = Math.PI / 2.2
      mesh.add(ring)
    }

    // 月球
    if (p.hasMoon) {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xeeeecc, roughness: 0.85 })
      )
      moon.position.set(p.size + 3.5, 0, 0)
      mesh.add(moon)
      p._moon = moon
    }

    // 名称标签
    const d = document.createElement('div')
    d.textContent = p.name
    d.style.cssText = 'color:#ffe89a;font-size:15px;font-weight:700;text-shadow:0 0 8px rgba(0,0,0,0.95);pointer-events:none;'
    const label = new CSS2DObject(d)
    label.position.set(0, p.size + 2.8, 0)
    mesh.add(label)

    planetMeshes.push(mesh)
  }

  // --- 星空（球壳 + 呼吸动画） ---
  const starCount = 900
  const starGeo = new THREE.BufferGeometry()
  const pos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const r = 500 + Math.random() * 200
    const t = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    pos[i*3]   = r * Math.sin(ph) * Math.cos(t)
    pos[i*3+1] = r * Math.cos(ph)
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(t)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  starsGroup = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xccddff, size: 1.3, sizeAttenuation: true,
    transparent: true, opacity: 0.55, depthWrite: false
  }))
  scene.add(starsGroup)

  // --- 火箭 ---
  rocketGroup = buildRocket()
  rocketGroup.visible = false
  scene.add(rocketGroup)
}

function buildRocket() {
  const g = new THREE.Group()
  const bodyM = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
  const redM  = new THREE.MeshStandardMaterial({ color: 0xe55a3a, metalness: 0.2, roughness: 0.5 })
  const flM   = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 })
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 20), bodyM))
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 20), redM)
  nose.position.y = 2.45; g.add(nose)
  const finPts = [new THREE.Vector3(0,-1.6,0), new THREE.Vector3(-1.2,-2.6,0), new THREE.Vector3(0,-2.2,0)]
  const finGeo = new THREE.BufferGeometry().setFromPoints(finPts)
  for (const ang of [0, Math.PI/2, Math.PI, Math.PI*1.5]) {
    const fin = new THREE.Mesh(finGeo, redM); fin.rotation.y = ang; g.add(fin)
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 16), flM)
  flame.position.y = -2.5; flame.name = 'flame'; g.add(flame)
  return g
}

// ===== 动画 =====
function animate() {
  animationId = requestAnimationFrame(animate)
  const d = clock.getDelta()
  sunPulse += d

  // 太阳脉动光晕（简单点：mesh 稍微呼吸）
  sunMesh.scale.setScalar(1 + Math.sin(sunPulse * 2) * 0.02)

  // 星空缓慢旋转 + 呼吸
  starsGroup.rotation.y += d * 0.008
  const starMat = starsGroup.material
  starMat.opacity = 0.5 + Math.sin(sunPulse * 0.7) * 0.1

  // 行星公转
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]
    p.angle += (1 / p.period) * d * 0.5 * speedMultiplier.value
    const mesh = planetMeshes[i]
    mesh.position.x = Math.cos(p.angle) * p.orbit
    mesh.position.z = Math.sin(p.angle) * p.orbit
    mesh.rotation.y += d * 0.25
    // 月球绕地球
    if (p._moon) {
      const mAng = clock.elapsedTime * 2.5 * speedMultiplier.value
      p._moon.position.set(Math.cos(mAng) * (p.size + 3.5), 0, Math.sin(mAng) * (p.size + 3.5))
    }
  }

  // 火箭
  if (rocketState.active) updateRocket()

  controls.update()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

function updateRocket() {
  const d = clock.getDelta()
  rocketState.t += d * 0.55
  if (rocketState.t >= 1) { rocketState.active = false; rocketGroup.visible = false; return }
  const t = rocketState.t
  const r = 45 + t * 220
  const ang = t * Math.PI * 2.5
  rocketGroup.position.set(Math.cos(ang) * r, 12 + Math.sin(t * Math.PI) * 18, Math.sin(ang) * r)
  rocketGroup.lookAt(0, 12, 0); rocketGroup.visible = true
  const flame = rocketGroup.getObjectByName('flame')
  if (flame) { flame.scale.y = 1 + Math.sin(Date.now() * 0.03) * 0.35; flame.material.opacity = 0.75 + Math.sin(Date.now() * 0.02) * 0.2 }
}

// ===== 点击检测 =====
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
function onTap(e) {
  const rect = renderer.domElement.getBoundingClientRect()
  const cx = e.clientX ?? e.touches?.[0]?.clientX
  const cy = e.clientY ?? e.touches?.[0]?.clientY
  if (cx == null) return
  pointer.x = ((cx - rect.left) / rect.width) * 2 - 1
  pointer.y = -((cy - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(planetMeshes, false)
  if (hits.length > 0) { playDing(); selectedPlanet.value = hits[0].object.userData.planet }
  else selectedPlanet.value = null
}

// ===== UI 事件 =====
function closeCard() { selectedPlanet.value = null }
function selectChip(idx) { playDing(); selectedPlanet.value = planets[idx] }
function onSpeedInput(e) { speedMultiplier.value = parseFloat(e.target.value) }
function launchRocket() { rocketState.active = true; rocketState.t = 0; playDing() }

function reset() {
  planets.forEach(p => { p.angle = Math.random() * Math.PI * 2 })
  speedMultiplier.value = 1; rocketState.active = false; selectedPlanet.value = null
  const cd = MAX_ORBIT * 1.9 + 40
  camera.position.set(cd * 0.6, cd * 0.55, cd * 0.6)
  controls.target.set(0, 0, 0); controls.update()
  const slider = document.querySelector('#speedSlider')
  if (slider) slider.value = 1
}

// ===== 自适应 =====
function resize() {
  const W = stage.value.clientWidth, H = stage.value.clientHeight
  camera.aspect = W / H; camera.updateProjectionMatrix()
  renderer.setSize(W, H); labelRenderer.setSize(W, H)
}

// ===== 生命周期 =====
onMounted(() => {
  initThree(); animate()
  window.addEventListener('resize', resize)
  renderer.domElement.addEventListener('click', onTap)
})
onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resize)
  renderer?.domElement.removeEventListener('click', onTap)
  controls?.dispose(); renderer?.dispose()
})
</script>

<template>
  <div class="solar-system">
    <header class="title-bar">
      <h1>🪐 宝贝的太阳系</h1>
      <p class="subtitle">按住旋转 · 滚轮缩放 · 点星球看介绍</p>
    </header>

    <div ref="stage" class="stage"></div>

    <aside class="controls">
      <div class="control-group">
        <label for="speedSlider">⏩ 公转速度</label>
        <input id="speedSlider" type="range" min="0" max="5" step="0.1" :value="speedMultiplier" @input="onSpeedInput" />
        <span class="speed-label">{{ speedLabel }}</span>
      </div>
      <button class="big-btn" @click="launchRocket">🚀 发射火箭</button>
      <button class="big-btn" @click="reset">🔄 重置视角</button>
    </aside>

    <Transition name="card">
      <div v-if="cardVisible" class="info-card">
        <div class="info-icon">{{ selectedPlanet.emoji }}</div>
        <h2>{{ selectedPlanet.name }}</h2>
        <p>{{ selectedPlanet.desc }}</p>
        <button class="info-close" @click="closeCard">✖️</button>
      </div>
    </Transition>

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
.stage { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.stage:active { cursor: grabbing; }
.title-bar { position: fixed; top: 0; left: 0; right: 0; padding: 14px 20px 6px; text-align: center; z-index: 10; pointer-events: none; }
.title-bar h1 { font-size: 1.55rem; font-weight: 700; background: linear-gradient(90deg, #ffd36b, #ff8ad4, #7ad1ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.title-bar .subtitle { font-size: 0.78rem; color: #aaa; margin-top: 2px; }
.controls { position: fixed; top: 70px; right: 14px; display: flex; flex-direction: column; gap: 10px; z-index: 10; }
.control-group { background: rgba(255,255,255,0.08); backdrop-filter: blur(10px); border-radius: 16px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
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
