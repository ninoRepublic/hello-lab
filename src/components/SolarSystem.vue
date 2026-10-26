<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// ===== Three.js 核心 =====
const stage = ref(null)
let scene, camera, renderer, labelRenderer, controls
let animationId = null
let clock

// 场景内对象
const planetMeshes = []
let sunMesh, sunLight, moonMesh, rocketGroup
let starsGroup

// ===== 行星数据（3D 单位，人为分层，保证在视野内） =====
// 轨道半径是 Three.js 世界单位，相机距离 ~250，FOV 50
const SUN_DATA = { radius: 12, color: 0xffcc33 }

const planets = reactive([
  { name: '水星', color: 0xb0a8a0, size: 1.2, orbit: 22, period: 0.24, emoji: '☿️', desc: '最小最快的行星，一年只有88天！', angle: Math.random() * Math.PI * 2 },
  { name: '金星', color: 0xe8c875, size: 1.8, orbit: 32, period: 0.62, emoji: '♀️', desc: '夜空中最亮的星星，傍晚就能看到它~', angle: Math.random() * Math.PI * 2 },
  { name: '地球', color: 0x4aa3ff, size: 2.0, orbit: 42, period: 1.0,  emoji: '🌍', desc: '这是我们的家！蓝色的水球🌊', angle: Math.random() * Math.PI * 2, hasMoon: true },
  { name: '火星', color: 0xe55a3a, size: 1.5, orbit: 52, period: 1.88, emoji: '🔴', desc: '红色的星球，上面有最高的山！', angle: Math.random() * Math.PI * 2 },
  { name: '木星', color: 0xe8a85c, size: 4.5, orbit: 72, period: 11.86, emoji: '♃', desc: '最大的行星，条纹好多，还有个大红斑！', angle: Math.random() * Math.PI * 2 },
  { name: '土星', color: 0xe8d088, size: 3.8, orbit: 92, period: 29.46, emoji: '🪐', desc: '有漂亮光环的行星！最特别的那个✨', angle: Math.random() * Math.PI * 2, hasRing: true },
  { name: '天王星', color: 0x9ce0e8, size: 2.8, orbit: 110, period: 84.0,  emoji: '♅', desc: '躺着转的冰蓝行星，好Q哦！', angle: Math.random() * Math.PI * 2 },
  { name: '海王星', color: 0x3a7ae0, size: 2.6, orbit: 128, period: 164.8, emoji: '♆', desc: '最远的行星，深蓝色好漂亮！', angle: Math.random() * Math.PI * 2 }
])

// 最远轨道半径，用于保证可见
const MAX_ORBIT = 128

// ===== 响应式 UI 状态 =====
const speedMultiplier = ref(1)
const speedLabel = computed(() => speedMultiplier.value.toFixed(1) + 'x')
const selectedPlanet = ref(null)
const cardVisible = computed(() => selectedPlanet.value !== null)

// 火箭
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
  } catch (e) { /* 静默 */ }
}

// ===== Three.js 初始化 =====
function initThree() {
  const container = stage.value
  const W = container.clientWidth
  const H = container.clientHeight

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05010f)

  // Camera（透视投影，距离够远保证所有星球在视野内）
  camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000)
  const camDist = MAX_ORBIT * 2.2 + 30 // 相机距离 ≈ 292，远大于最远轨道
  camera.position.set(camDist * 0.55, camDist * 0.5, camDist * 0.55) // 斜角俯视
  camera.lookAt(0, 0, 0)

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(W, H)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  // CSS2D Renderer（用于星球名称标签）
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(W, H)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.top = '0'
  labelRenderer.domElement.style.left = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(labelRenderer.domElement)

  // OrbitControls — 鼠标拖拽旋转视角，滚轮缩放
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 40        // 最近能缩到多近
  controls.maxDistance = 600      // 最远能拉到多远
  controls.maxPolarAngle = Math.PI // 允许从下往上看
  controls.autoRotate = false
  controls.target.set(0, 0, 0)

  // 光源
  sunLight = new THREE.PointLight(0xffffff, 2.5, 0, 0) // 点光源（太阳发光）
  sunLight.position.set(0, 0, 0)
  scene.add(sunLight)
  scene.add(new THREE.AmbientLight(0x404060, 0.35)) // 弱环境光，背光面不会全黑

  clock = new THREE.Clock()

  buildScene()
}

// ===== 构建场景：太阳、轨道、行星、星空 =====
function buildScene() {
  // --- 太阳 ---
  const sunGeo = new THREE.SphereGeometry(SUN_DATA.radius, 48, 48)
  const sunMat = new THREE.MeshBasicMaterial({ color: SUN_DATA.color })
  sunMesh = new THREE.Mesh(sunGeo, sunMat)
  scene.add(sunMesh)

  // 太阳光晕（更大的半透明球）
  const haloGeo = new THREE.SphereGeometry(SUN_DATA.radius * 1.5, 32, 32)
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.25, side: THREE.BackSide })
  scene.add(new THREE.Mesh(haloGeo, haloMat))

  // --- 轨道线（虚线环） ---
  for (const p of planets) {
    const orbitGeo = new THREE.RingGeometry(p.orbit - 0.08, p.orbit + 0.08, 128)
    const orbitMat = new THREE.MeshBasicMaterial({ color: 0x8888aa, side: THREE.DoubleSide, transparent: true, opacity: 0.25 })
    const ring = new THREE.Mesh(orbitGeo, orbitMat)
    ring.rotation.x = Math.PI / 2
    scene.add(ring)
  }

  // --- 行星 ---
  for (const p of planets) {
    const geo = new THREE.SphereGeometry(p.size, 48, 48)
    const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7, metalness: 0.1 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData = { planet: p }
    scene.add(mesh)

    // 土星环
    if (p.hasRing) {
      const ringGeo = new THREE.RingGeometry(p.size * 1.5, p.size * 2.2, 64)
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xe0c880, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2.2
      mesh.add(ring)
    }

    // 月球（地球子对象）
    if (p.hasMoon) {
      const moonGeo = new THREE.SphereGeometry(0.5, 24, 24)
      const moonMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.9 })
      moonMesh = new THREE.Mesh(moonGeo, moonMat)
      moonMesh.position.set(p.orbit * 0 + 5, 0, p.orbit * 0 + 5)
      mesh.add(moonMesh)
      // 在 planet 上存月球子对象引用，后面手动更新位置
      p._moonParent = mesh
    }

    // 星球名称标签（CSS2D）
    const labelDiv = document.createElement('div')
    labelDiv.textContent = p.name
    labelDiv.style.cssText = 'color:#ffd36b;font-size:12px;font-weight:600;text-shadow:0 0 6px rgba(0,0,0,0.8);pointer-events:none;'
    const label = new CSS2DObject(labelDiv)
    label.position.set(0, p.size + 1.5, 0)
    mesh.add(label)

    planetMeshes.push(mesh)
  }

  // --- 星空（球壳粒子） ---
  const starCount = 4000
  const starGeo = new THREE.BufferGeometry()
  const positions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const r = 450 + Math.random() * 200 // 分布在 450-650 半径的球壳上
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta)
    positions[i*3+1] = r * Math.cos(phi)
    positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.85 })
  starsGroup = new THREE.Points(starGeo, starMat)
  scene.add(starsGroup)

  // --- 火箭（初始不可见） ---
  rocketGroup = buildRocket()
  rocketGroup.visible = false
  scene.add(rocketGroup)
}

// 构建 3D 火箭模型
function buildRocket() {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
  const redMat  = new THREE.MeshStandardMaterial({ color: 0xe55a3a, metalness: 0.2, roughness: 0.5 })
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x4aa3ff, metalness: 0.1, roughness: 0.2 })

  // 机身（胶囊形 = 圆柱 + 圆锥头）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 20), bodyMat)
  group.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 20), redMat)
  nose.position.y = 2.45
  group.add(nose)
  // 尾翼
  const finGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.6, 0),
    new THREE.Vector3(-1.2, -2.6, 0),
    new THREE.Vector3(0, -2.2, 0)
  ])
  for (const angle of [0, Math.PI/2, Math.PI, Math.PI*1.5]) {
    const fin = new THREE.Mesh(finGeo, redMat)
    fin.rotation.y = angle
    group.add(fin)
  }
  // 窗户
  const window = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), blueMat)
  window.position.set(0, 0.5, 0.81)
  group.add(window)

  // 尾焰（用粒子/简单圆锥代替，发射时再处理）
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.8, 16),
    new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85 })
  )
  flame.position.y = -2.5
  flame.name = 'flame'
  group.add(flame)

  return group
}

// ===== 动画循环 =====
function animate() {
  animationId = requestAnimationFrame(animate)
  const delta = clock.getDelta()

  // 太阳自转
  sunMesh.rotation.y += delta * 0.15

  // 星空缓慢旋转
  starsGroup.rotation.y += delta * 0.005

  // 行星公转
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]
    p.angle += (1 / p.period) * delta * 0.5 * speedMultiplier.value
    const mesh = planetMeshes[i]
    mesh.position.x = Math.cos(p.angle) * p.orbit
    mesh.position.z = Math.sin(p.angle) * p.orbit
    mesh.rotation.y += delta * 0.3
  }

  // 月球绕地球手动更新
  const earthIdx = 2
  const earthMesh = planetMeshes[earthIdx]
  if (planets[earthIdx]._moonParent) {
    const moon = planets[earthIdx]._moonParent.children.find(c => c.geometry?.type === 'SphereGeometry' && c.geometry.parameters.radius === 0.5)
    if (moon) {
      const moonAngle = clock.elapsedTime * 2 * speedMultiplier.value
      moon.position.x = Math.cos(moonAngle) * 5
      moon.position.z = Math.sin(moonAngle) * 5
    }
  }

  // 火箭
  if (rocketState.active) updateRocket(delta)

  controls.update()
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

function updateRocket(delta) {
  rocketState.t += delta * 0.6
  if (rocketState.t >= 1) {
    rocketState.active = false
    rocketGroup.visible = false
    return
  }
  const t = rocketState.t
  // 从相机前方飞入，绕太阳转一圈后飞出
  const r = 40 + t * 150
  const angle = t * Math.PI * 2 // 绕一圈
  rocketGroup.position.set(Math.cos(angle) * r, 10 + Math.sin(t * Math.PI) * 15, Math.sin(angle) * r)
  rocketGroup.lookAt(0, 10, 0) // 朝向太阳
  rocketGroup.visible = true
  // 尾焰脉动
  const flame = rocketGroup.getObjectByName('flame')
  if (flame) {
    flame.scale.y = 1 + Math.sin(Date.now() * 0.02) * 0.3
    flame.material.opacity = 0.7 + Math.sin(Date.now() * 0.015) * 0.2
  }
}

// ===== 交互：点击行星 =====
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function onPointerDown(e) {
  const rect = renderer.domElement.getBoundingClientRect()
  const clientX = e.clientX ?? (e.touches?.[0]?.clientX)
  const clientY = e.clientY ?? (e.touches?.[0]?.clientY)
  if (clientX == null) return
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(planetMeshes, false)
  if (hits.length > 0) {
    const p = hits[0].object.userData.planet
    playDing()
    selectedPlanet.value = p
  } else {
    selectedPlanet.value = null
  }
}

function closeCard() { selectedPlanet.value = null }
function selectChip(idx) { playDing(); selectedPlanet.value = planets[idx] }

function onSpeedInput(e) { speedMultiplier.value = parseFloat(e.target.value) }

function launchRocket() {
  rocketState.active = true
  rocketState.t = 0
  playDing()
}

function reset() {
  planets.forEach(p => { p.angle = Math.random() * Math.PI * 2 })
  speedMultiplier.value = 1
  rocketState.active = false
  selectedPlanet.value = null
  controls.target.set(0, 0, 0)
  const camDist = MAX_ORBIT * 2.2 + 30
  camera.position.set(camDist * 0.55, camDist * 0.5, camDist * 0.55)
  controls.update()
  const slider = document.querySelector('#speedSlider')
  if (slider) slider.value = 1
}

// ===== 尺寸自适应 =====
function resize() {
  const W = stage.value.clientWidth
  const H = stage.value.clientHeight
  camera.aspect = W / H
  camera.updateProjectionMatrix()
  renderer.setSize(W, H)
  labelRenderer.setSize(W, H)
}

// ===== 生命周期 =====
onMounted(() => {
  initThree()
  animate()
  window.addEventListener('resize', resize)
  renderer.domElement.addEventListener('click', onPointerDown)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resize)
  renderer?.domElement.removeEventListener('click', onPointerDown)
  controls?.dispose()
  renderer?.dispose()
})
</script>

<template>
  <div class="solar-system">
    <header class="title-bar">
      <h1>🪐 宝贝的太阳系（3D）</h1>
      <p class="subtitle">鼠标按住旋转视角 · 滚轮缩放 · 点星球看介绍</p>
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

    <div class="hint">🎯 鼠标左键拖拽旋转视角 · 右键平移 · 滚轮缩放</div>
  </div>
</template>

<style scoped>
.solar-system { position: fixed; inset: 0; width: 100%; height: 100%; }
.stage { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.stage:active { cursor: grabbing; }
.title-bar { position: fixed; top: 0; left: 0; right: 0; padding: 14px 20px 6px; text-align: center; z-index: 10; pointer-events: none; }
.title-bar h1 { font-size: 1.6rem; font-weight: 700; background: linear-gradient(90deg, #ffd36b, #ff8ad4, #7ad1ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.title-bar .subtitle { font-size: 0.78rem; color: #999; margin-top: 2px; }
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
.hint { position: fixed; bottom: 60px; right: 14px; font-size: 0.7rem; color: #666; z-index: 5; pointer-events: none; }
@media (max-width: 600px) {
  .title-bar h1 { font-size: 1.3rem; }
  .controls { top: 62px; right: 8px; gap: 8px; }
  .control-group input[type=range] { width: 100px; }
  .big-btn { padding: 8px 14px; font-size: 0.8rem; }
  .hint { display: none; }
}
</style>
