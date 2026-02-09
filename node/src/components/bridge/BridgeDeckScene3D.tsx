"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import {
  BRIDGE_WIDE_SHOT,
  formatBridgeTelemetry,
  getBridgeCameraShot,
  getBridgeStationAnchors,
  getBridgeStationOrder,
  interpolateBridgeCameraPose,
  type BridgeCameraPose,
  type BridgeSceneCommsEntry,
  type BridgeMissionStats,
  type BridgeSceneStationSummary,
  type BridgeSceneSystem,
  type BridgeSceneWorkItem,
} from "@/lib/bridge/scene-model"

interface BridgeDeckScene3DProps {
  operatorLabel: string
  stardate: string
  missionStats: BridgeMissionStats
  systems: BridgeSceneSystem[]
  workItems: BridgeSceneWorkItem[]
  stations: BridgeSceneStationSummary[]
  commsFeed: BridgeSceneCommsEntry[]
  lastEventAt: number | null
  selectedStationKey: BridgeStationKey | null
  onStationSelect?: (stationKey: BridgeStationKey) => void
}

interface StationVisual {
  ringMaterial: THREE.MeshBasicMaterial
  holoMaterial: THREE.MeshToonMaterial
  labelContext: CanvasRenderingContext2D | null
  labelTexture: THREE.CanvasTexture
  screenContext: CanvasRenderingContext2D | null
  screenTexture: THREE.CanvasTexture
  screenWidth: number
  screenHeight: number
}

interface WarpStreakLayer {
  mesh: THREE.LineSegments
  positions: Float32Array
  speeds: Float32Array
  lengths: Float32Array
  positionAttribute: THREE.BufferAttribute
  spreadX: number
  spreadY: number
  zMin: number
  zMax: number
  baseLength: number
  lengthVariance: number
  baseSpeed: number
  speedVariance: number
}

const STATION_ORDER = getBridgeStationOrder()
const STATION_ANCHORS = getBridgeStationAnchors()

const STATION_ACCENT_COLORS: Record<BridgeStationKey, number> = {
  xo: 0x22d3ee,
  ops: 0x38bdf8,
  eng: 0xf59e0b,
  sec: 0xf43f5e,
  med: 0x34d399,
  cou: 0xa3e635,
}

const LIGHT_PALETTE = {
  background: 0xd7dde8,
  fog: 0xd0d7e1,
  ambient: 0xecfeff,
  keyLight: 0xffffff,
  rimLight: 0x7dd3fc,
  fillLight: 0x38bdf8,
  outline: 0x0f172a,
  floorMain: 0x7788a3,
  floorInset: 0x4f607a,
  trim: 0x1e293b,
  wall: 0x5b6b84,
  wallDark: 0x384660,
  console: 0x5d6d87,
  viewportFrame: 0x1f2d46,
  starsFar: 0xffffff,
  starsNear: 0xfef3c7,
  nebulaA: 0x60a5fa,
  nebulaB: 0x22d3ee,
  planet: 0x1d4ed8,
  planetAtmosphere: 0x7dd3fc,
}

const DARK_PALETTE = {
  background: 0x020617,
  fog: 0x020617,
  ambient: 0x94a3b8,
  keyLight: 0xe2e8f0,
  rimLight: 0x22d3ee,
  fillLight: 0x0ea5e9,
  outline: 0x020617,
  floorMain: 0x334155,
  floorInset: 0x1e293b,
  trim: 0x0f172a,
  wall: 0x1e293b,
  wallDark: 0x0f172a,
  console: 0x1f2d46,
  viewportFrame: 0x020617,
  starsFar: 0xe2e8f0,
  starsNear: 0xfef08a,
  nebulaA: 0x818cf8,
  nebulaB: 0x22d3ee,
  planet: 0x1d4ed8,
  planetAtmosphere: 0x67e8f9,
}

function normalizeStationKey(value: BridgeStationKey | null | undefined): BridgeStationKey {
  if (value && STATION_ORDER.includes(value)) {
    return value
  }
  return "xo"
}

function createToonGradientTexture() {
  const data = new Uint8Array([
    16, 20, 28, 255,
    64, 78, 102, 255,
    135, 160, 194, 255,
    220, 236, 255, 255,
  ])
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat)
  texture.needsUpdate = true
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

function createNebulaTexture(innerColor: string, outerColor: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext("2d")
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 20, 128, 128, 128)
    gradient.addColorStop(0, innerColor)
    gradient.addColorStop(0.35, "rgba(255,255,255,0.14)")
    gradient.addColorStop(1, outerColor)
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createCanvasTexture(width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  return {
    context,
    texture,
    width,
    height,
  }
}

function drawScanBackdrop(context: CanvasRenderingContext2D, width: number, height: number, accent: string, time: number) {
  context.clearRect(0, 0, width, height)

  const gradient = context.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, "rgba(2, 6, 23, 0.95)")
  gradient.addColorStop(1, "rgba(15, 23, 42, 0.92)")
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  context.strokeStyle = "rgba(148, 163, 184, 0.14)"
  context.lineWidth = 1
  for (let row = 0; row < height; row += 24) {
    context.beginPath()
    context.moveTo(0, row)
    context.lineTo(width, row)
    context.stroke()
  }

  const sweepX = ((time * 90) % (width + 220)) - 110
  const sweep = context.createLinearGradient(sweepX - 60, 0, sweepX + 60, 0)
  sweep.addColorStop(0, "rgba(34, 211, 238, 0)")
  sweep.addColorStop(0.5, "rgba(34, 211, 238, 0.16)")
  sweep.addColorStop(1, "rgba(34, 211, 238, 0)")
  context.fillStyle = sweep
  context.fillRect(0, 0, width, height)

  context.strokeStyle = accent
  context.globalAlpha = 0.4
  context.lineWidth = 2
  context.strokeRect(10, 10, width - 20, height - 20)
  context.globalAlpha = 1
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  lines: string[],
  options: {
    title: string
    accent: string
    width: number
    height: number
    time: number
  },
) {
  drawScanBackdrop(context, options.width, options.height, options.accent, options.time)

  context.font = "700 32px 'JetBrains Mono', monospace"
  context.fillStyle = options.accent
  context.fillText(options.title, 24, 46)

  context.font = "500 22px 'JetBrains Mono', monospace"
  context.fillStyle = "rgba(226, 232, 240, 0.94)"
  lines.forEach((line, index) => {
    context.fillText(line, 24, 86 + index * 30)
  })

  context.fillStyle = "rgba(34, 211, 238, 0.75)"
  context.beginPath()
  context.arc(options.width - 26, 26, 7, 0, Math.PI * 2)
  context.fill()
}

function withFallbackLines(lines: string[] | undefined, fallback: string) {
  if (!lines || lines.length === 0) {
    return [fallback]
  }
  return lines
}

function drawMainScreen(
  context: CanvasRenderingContext2D,
  options: {
    title: string
    lines: string[]
    width: number
    height: number
    time: number
  },
) {
  drawTextBlock(context, withFallbackLines(options.lines, "BRIDGE CORE STANDBY"), {
    title: options.title || "BRIDGE CORE",
    accent: "rgba(34,211,238,0.92)",
    width: options.width,
    height: options.height,
    time: options.time,
  })
}

function drawSystemsScreen(
  context: CanvasRenderingContext2D,
  options: {
    title: string
    lines: string[]
    width: number
    height: number
    time: number
  },
) {
  drawTextBlock(context, withFallbackLines(options.lines, "NO LIVE SYSTEMS"), {
    title: options.title || "SYSTEMS GRID",
    accent: "rgba(245,158,11,0.95)",
    width: options.width,
    height: options.height,
    time: options.time,
  })
}

function drawQueueScreen(
  context: CanvasRenderingContext2D,
  options: {
    title: string
    lines: string[]
    width: number
    height: number
    time: number
  },
) {
  drawTextBlock(context, withFallbackLines(options.lines, "QUEUE CLEAR"), {
    title: options.title || "WORK QUEUE",
    accent: "rgba(56,189,248,0.95)",
    width: options.width,
    height: options.height,
    time: options.time,
  })
}

function drawStationScreen(
  context: CanvasRenderingContext2D,
  options: {
    title: string
    lines: string[]
    accent: string
    width: number
    height: number
    time: number
  },
) {
  drawTextBlock(context, withFallbackLines(options.lines, "NO STATION DATA"), {
    title: options.title || "STATION",
    accent: options.accent,
    width: options.width,
    height: options.height,
    time: options.time,
  })
}

function drawTicker(
  context: CanvasRenderingContext2D,
  options: {
    line: string
    width: number
    height: number
    time: number
  },
) {
  const line = options.line || "NO COMMS"
  context.clearRect(0, 0, options.width, options.height)

  const background = context.createLinearGradient(0, 0, options.width, 0)
  background.addColorStop(0, "rgba(2, 6, 23, 0.92)")
  background.addColorStop(0.5, "rgba(15, 23, 42, 0.92)")
  background.addColorStop(1, "rgba(2, 6, 23, 0.92)")
  context.fillStyle = background
  context.fillRect(0, 0, options.width, options.height)

  const sweepX = ((options.time * 120) % (options.width + 160)) - 80
  const sweep = context.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0)
  sweep.addColorStop(0, "rgba(34,211,238,0)")
  sweep.addColorStop(0.5, "rgba(34,211,238,0.2)")
  sweep.addColorStop(1, "rgba(34,211,238,0)")
  context.fillStyle = sweep
  context.fillRect(0, 0, options.width, options.height)

  context.strokeStyle = "rgba(34,211,238,0.48)"
  context.lineWidth = 2
  context.strokeRect(2, 2, options.width - 4, options.height - 4)

  context.font = "700 20px 'JetBrains Mono', monospace"
  context.fillStyle = "rgba(226,232,240,0.96)"
  context.textAlign = "left"
  context.textBaseline = "middle"
  context.fillText(line, 14, options.height / 2 + 1)
}

function drawPlaceholderLabel(
  context: CanvasRenderingContext2D,
  callsign: string,
  active: boolean,
  width: number,
  height: number,
) {
  context.clearRect(0, 0, width, height)
  context.fillStyle = active ? "rgba(34, 211, 238, 0.95)" : "rgba(148, 163, 184, 0.82)"
  context.fillRect(0, 0, width, height)
  context.strokeStyle = active ? "rgba(6, 182, 212, 1)" : "rgba(51, 65, 85, 0.8)"
  context.lineWidth = 3
  context.strokeRect(1.5, 1.5, width - 3, height - 3)
  context.font = "700 28px 'JetBrains Mono', monospace"
  context.fillStyle = active ? "rgba(2, 6, 23, 0.96)" : "rgba(15, 23, 42, 0.94)"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(callsign, width / 2, height / 2 + 1)
}

function resolveStationFromObject(object: THREE.Object3D | null): BridgeStationKey | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const candidate = current.userData.stationKey
    if (typeof candidate === "string" && STATION_ORDER.includes(candidate as BridgeStationKey)) {
      return candidate as BridgeStationKey
    }
    current = current.parent
  }
  return null
}

function isWebGlAvailable() {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export function BridgeDeckScene3D({
  operatorLabel,
  stardate,
  missionStats,
  systems,
  workItems,
  stations,
  commsFeed,
  lastEventAt,
  selectedStationKey,
  onStationSelect,
}: BridgeDeckScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onStationSelectRef = useRef(onStationSelect)
  const selectedStationRef = useRef<BridgeStationKey>(normalizeStationKey(selectedStationKey))
  const sceneDataRef = useRef({
    operatorLabel,
    stardate,
    missionStats,
    systems,
    workItems,
    stations,
    commsFeed,
    lastEventAt,
  })

  const [isDark, setIsDark] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [sceneError, setSceneError] = useState<string | null>(null)

  const fallbackClassName = useMemo(
    () =>
      isDark
        ? "bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-cyan-100"
        : "bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200 text-slate-800",
    [isDark],
  )

  useEffect(() => {
    onStationSelectRef.current = onStationSelect
  }, [onStationSelect])

  useEffect(() => {
    selectedStationRef.current = normalizeStationKey(selectedStationKey)
  }, [selectedStationKey])

  useEffect(() => {
    sceneDataRef.current = {
      operatorLabel,
      stardate,
      missionStats,
      systems,
      workItems,
      stations,
      commsFeed,
      lastEventAt,
    }
  }, [operatorLabel, stardate, missionStats, systems, workItems, stations, commsFeed, lastEventAt])

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"))
    }

    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateMotion = () => setPrefersReducedMotion(mediaQuery.matches)
    updateMotion()
    mediaQuery.addEventListener("change", updateMotion)
    return () => mediaQuery.removeEventListener("change", updateMotion)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!isWebGlAvailable()) {
      setSceneError("WebGL unavailable. Showing static bridge backdrop.")
      return
    }

    setSceneError(null)

    const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE
    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      })
    } catch (error) {
      console.error("Bridge scene renderer init failed:", error)
      setSceneError("3D bridge renderer failed to initialize.")
      return
    }

    const dprCap = prefersReducedMotion ? 1.1 : window.innerWidth < 960 ? 1.4 : 2

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.domElement.className = "h-full w-full"
    renderer.domElement.style.pointerEvents = "auto"
    container.appendChild(renderer.domElement)

    let contextLost = false
    const onContextLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      setSceneError("3D bridge context lost. Reload to restore.")
    }
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, { passive: false })

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(palette.background)
    scene.fog = new THREE.Fog(palette.fog, 38, 280)

    const camera = new THREE.PerspectiveCamera(
      BRIDGE_WIDE_SHOT.fov,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      420,
    )

    const disposableTextures: THREE.Texture[] = []
    const disposableGeometries: THREE.BufferGeometry[] = []
    const disposableMaterials: THREE.Material[] = []

    const trackTexture = <T extends THREE.Texture>(texture: T) => {
      disposableTextures.push(texture)
      return texture
    }
    const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T) => {
      disposableGeometries.push(geometry)
      return geometry
    }
    const trackMaterial = <T extends THREE.Material>(material: T) => {
      disposableMaterials.push(material)
      return material
    }

    const toonGradient = trackTexture(createToonGradientTexture())

    const makeToonMaterial = (color: number, opacity = 1) =>
      trackMaterial(
        new THREE.MeshToonMaterial({
          color,
          gradientMap: toonGradient,
          transparent: opacity < 1,
          opacity,
        }),
      )

    const makeOutlinedMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      outlineColor: number,
      outlineScale = 1.03,
    ) => {
      const mesh = new THREE.Mesh(geometry, material)
      const outline = new THREE.Mesh(
        geometry,
        trackMaterial(
          new THREE.MeshBasicMaterial({
            color: outlineColor,
            side: THREE.BackSide,
          }),
        ),
      )
      outline.scale.setScalar(outlineScale)
      mesh.add(outline)
      return mesh
    }

    const ambient = new THREE.AmbientLight(palette.ambient, 0.8)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(palette.keyLight, 1.25)
    keyLight.position.set(12, 15, 10)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(palette.rimLight, 0.95)
    rimLight.position.set(-15, 10, -24)
    scene.add(rimLight)

    const fill = new THREE.PointLight(palette.fillLight, 0.7, 90, 2)
    fill.position.set(0, 5, 3)
    scene.add(fill)

    const roomGroup = new THREE.Group()
    scene.add(roomGroup)

    const floorMain = makeOutlinedMesh(
      trackGeometry(new THREE.CylinderGeometry(24, 28, 2.4, 32)),
      makeToonMaterial(palette.floorMain),
      palette.outline,
      1.02,
    )
    floorMain.position.set(0, -3.4, -8.8)
    roomGroup.add(floorMain)

    const floorUpper = makeOutlinedMesh(
      trackGeometry(new THREE.CylinderGeometry(14, 16.8, 1.2, 28)),
      makeToonMaterial(palette.floorInset),
      palette.outline,
      1.02,
    )
    floorUpper.position.set(0, -1.95, -8.8)
    roomGroup.add(floorUpper)

    const floorRing = makeOutlinedMesh(
      trackGeometry(new THREE.TorusGeometry(15.3, 0.3, 12, 52)),
      makeToonMaterial(palette.trim),
      palette.outline,
      1.03,
    )
    floorRing.rotation.x = Math.PI / 2
    floorRing.position.set(0, -1.3, -8.8)
    roomGroup.add(floorRing)

    const addBeam = (width: number, height: number, depth: number, x: number, y: number, z: number, dark = false) => {
      const beam = makeOutlinedMesh(
        trackGeometry(new THREE.BoxGeometry(width, height, depth)),
        makeToonMaterial(dark ? palette.wallDark : palette.wall),
        palette.outline,
        1.02,
      )
      beam.position.set(x, y, z)
      roomGroup.add(beam)
    }

    addBeam(39, 2.2, 1.2, 0, 9.2, -41)
    addBeam(39, 2.2, 1.2, 0, -0.2, -41, true)
    addBeam(2.4, 9.2, 1.2, -18.2, 4.45, -41)
    addBeam(2.4, 9.2, 1.2, 18.2, 4.45, -41)
    addBeam(2.4, 10.2, 1.4, -22, 2.8, -19)
    addBeam(2.4, 10.2, 1.4, 22, 2.8, -19)

    for (let index = 0; index < 5; index += 1) {
      const offset = -12 + index * 6
      const rib = makeOutlinedMesh(
        trackGeometry(new THREE.BoxGeometry(1.1, 1.2, 16)),
        makeToonMaterial(palette.wallDark),
        palette.outline,
        1.03,
      )
      rib.position.set(offset, 10.2, -26)
      rib.rotation.x = 0.12
      roomGroup.add(rib)
    }

    const viewportFrame = makeOutlinedMesh(
      trackGeometry(new THREE.BoxGeometry(29, 9.2, 1.4)),
      makeToonMaterial(palette.viewportFrame),
      palette.outline,
      1.025,
    )
    viewportFrame.position.set(0, 4.4, -39.8)
    roomGroup.add(viewportFrame)

    const viewportInner = makeOutlinedMesh(
      trackGeometry(new THREE.BoxGeometry(26.4, 6.6, 0.3)),
      makeToonMaterial(0x0f172a, 0.95),
      palette.outline,
      1.018,
    )
    viewportInner.position.set(0, 4.4, -39.1)
    roomGroup.add(viewportInner)

    const spaceGroup = new THREE.Group()
    spaceGroup.position.set(0, 4.6, -45)
    scene.add(spaceGroup)

    const compact = window.innerWidth < 960 || prefersReducedMotion
    const farStarCount = compact ? 1400 : 2900
    const nearStarCount = compact ? 220 : 460

    const farStarGeometry = trackGeometry(new THREE.BufferGeometry())
    const farStarPositions = new Float32Array(farStarCount * 3)
    for (let index = 0; index < farStarCount; index += 1) {
      const offset = index * 3
      farStarPositions[offset] = (Math.random() - 0.5) * 330
      farStarPositions[offset + 1] = (Math.random() - 0.5) * 170
      farStarPositions[offset + 2] = -Math.random() * 320
    }
    farStarGeometry.setAttribute("position", new THREE.BufferAttribute(farStarPositions, 3))

    const farStars = new THREE.Points(
      farStarGeometry,
      trackMaterial(
        new THREE.PointsMaterial({
          color: palette.starsFar,
          size: compact ? 0.28 : 0.34,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      ),
    )
    spaceGroup.add(farStars)

    const nearStarGeometry = trackGeometry(new THREE.BufferGeometry())
    const nearStarPositions = new Float32Array(nearStarCount * 3)
    for (let index = 0; index < nearStarCount; index += 1) {
      const offset = index * 3
      nearStarPositions[offset] = (Math.random() - 0.5) * 180
      nearStarPositions[offset + 1] = (Math.random() - 0.5) * 90
      nearStarPositions[offset + 2] = -Math.random() * 120
    }
    nearStarGeometry.setAttribute("position", new THREE.BufferAttribute(nearStarPositions, 3))

    const nearStars = new THREE.Points(
      nearStarGeometry,
      trackMaterial(
        new THREE.PointsMaterial({
          color: palette.starsNear,
          size: compact ? 0.45 : 0.55,
          transparent: true,
          opacity: 0.84,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      ),
    )
    spaceGroup.add(nearStars)

    const randomRange = (min: number, max: number) => min + Math.random() * (max - min)

    const createWarpLayer = (options: {
      count: number
      spreadX: number
      spreadY: number
      zMin: number
      zMax: number
      color: number
      opacity: number
      baseLength: number
      lengthVariance: number
      baseSpeed: number
      speedVariance: number
    }): WarpStreakLayer => {
      const geometry = trackGeometry(new THREE.BufferGeometry())
      const positions = new Float32Array(options.count * 6)
      const colors = new Float32Array(options.count * 6)
      const speeds = new Float32Array(options.count)
      const lengths = new Float32Array(options.count)
      const tint = new THREE.Color(options.color)

      for (let index = 0; index < options.count; index += 1) {
        const base = index * 6
        const x = randomRange(-options.spreadX * 0.5, options.spreadX * 0.5)
        const y = randomRange(-options.spreadY * 0.5, options.spreadY * 0.5)
        const z = randomRange(options.zMin, options.zMax)
        const length = options.baseLength + Math.random() * options.lengthVariance
        const speed = options.baseSpeed + Math.random() * options.speedVariance

        positions[base] = x
        positions[base + 1] = y
        positions[base + 2] = z
        positions[base + 3] = x
        positions[base + 4] = y
        positions[base + 5] = z - length

        lengths[index] = length
        speeds[index] = speed

        // Tail stays dim while the head carries brighter impulse.
        colors[base] = tint.r * 0.2
        colors[base + 1] = tint.g * 0.2
        colors[base + 2] = tint.b * 0.2
        colors[base + 3] = tint.r
        colors[base + 4] = tint.g
        colors[base + 5] = tint.b
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))

      const material = trackMaterial(
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: options.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      )

      const mesh = new THREE.LineSegments(geometry, material)
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      spaceGroup.add(mesh)

      return {
        mesh,
        positions,
        speeds,
        lengths,
        positionAttribute: geometry.getAttribute("position") as THREE.BufferAttribute,
        spreadX: options.spreadX,
        spreadY: options.spreadY,
        zMin: options.zMin,
        zMax: options.zMax,
        baseLength: options.baseLength,
        lengthVariance: options.lengthVariance,
        baseSpeed: options.baseSpeed,
        speedVariance: options.speedVariance,
      }
    }

    const resetWarpStreak = (layer: WarpStreakLayer, index: number) => {
      const base = index * 6
      const x = randomRange(-layer.spreadX * 0.5, layer.spreadX * 0.5)
      const y = randomRange(-layer.spreadY * 0.5, layer.spreadY * 0.5)
      const z = randomRange(layer.zMin, layer.zMax)
      const length = layer.baseLength + Math.random() * layer.lengthVariance
      const speed = layer.baseSpeed + Math.random() * layer.speedVariance

      layer.positions[base] = x
      layer.positions[base + 1] = y
      layer.positions[base + 2] = z
      layer.positions[base + 3] = x
      layer.positions[base + 4] = y
      layer.positions[base + 5] = z - length

      layer.lengths[index] = length
      layer.speeds[index] = speed
    }

    const warpFarLayer = createWarpLayer({
      count: compact ? 190 : 480,
      spreadX: compact ? 176 : 220,
      spreadY: compact ? 92 : 118,
      zMin: -340,
      zMax: -48,
      color: palette.starsFar,
      opacity: isDark ? 0.45 : 0.34,
      baseLength: compact ? 7.8 : 10.8,
      lengthVariance: compact ? 10.5 : 16.5,
      baseSpeed: compact ? 56 : 78,
      speedVariance: compact ? 34 : 52,
    })

    const warpNearLayer = createWarpLayer({
      count: compact ? 96 : 220,
      spreadX: compact ? 132 : 168,
      spreadY: compact ? 72 : 90,
      zMin: -220,
      zMax: -20,
      color: palette.starsNear,
      opacity: isDark ? 0.72 : 0.58,
      baseLength: compact ? 10.5 : 15.5,
      lengthVariance: compact ? 15.5 : 22.5,
      baseSpeed: compact ? 92 : 128,
      speedVariance: compact ? 52 : 70,
    })

    const nebulaAMaterial = trackMaterial(
      new THREE.SpriteMaterial({
        map: trackTexture(createNebulaTexture("rgba(129,140,248,0.58)", "rgba(56,189,248,0)")),
        color: palette.nebulaA,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const nebulaA = new THREE.Sprite(nebulaAMaterial)
    nebulaA.position.set(-45, 10, -175)
    nebulaA.scale.set(94, 56, 1)
    spaceGroup.add(nebulaA)

    const nebulaBMaterial = trackMaterial(
      new THREE.SpriteMaterial({
        map: trackTexture(createNebulaTexture("rgba(34,211,238,0.55)", "rgba(34,211,238,0)")),
        color: palette.nebulaB,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const nebulaB = new THREE.Sprite(nebulaBMaterial)
    nebulaB.position.set(48, -8, -145)
    nebulaB.scale.set(82, 46, 1)
    spaceGroup.add(nebulaB)

    const planet = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(11.2, 34, 34)), makeToonMaterial(palette.planet))
    planet.position.set(34, -13, -198)
    spaceGroup.add(planet)

    const atmosphere = new THREE.Mesh(
      trackGeometry(new THREE.SphereGeometry(12.2, 30, 30)),
      trackMaterial(
        new THREE.MeshBasicMaterial({
          color: palette.planetAtmosphere,
          transparent: true,
          opacity: 0.28,
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    )
    planet.add(atmosphere)

    const mainScreen = createCanvasTexture(1024, 512)
    const mainScreenMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: trackTexture(mainScreen.texture),
        transparent: false,
      }),
    )
    const mainScreenPlane = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(24.4, 5.8)), mainScreenMaterial)
    mainScreenPlane.position.set(0, 4.4, -38.8)
    roomGroup.add(mainScreenPlane)

    const systemsScreen = createCanvasTexture(768, 352)
    const systemsScreenMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: trackTexture(systemsScreen.texture),
        transparent: false,
      }),
    )
    const systemsScreenPlane = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(8.1, 3.75)), systemsScreenMaterial)
    systemsScreenPlane.position.set(-10.4, 4.0, -30.4)
    systemsScreenPlane.rotation.y = 0.4
    roomGroup.add(systemsScreenPlane)

    const queueScreen = createCanvasTexture(768, 352)
    const queueScreenMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: trackTexture(queueScreen.texture),
        transparent: false,
      }),
    )
    const queueScreenPlane = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(8.1, 3.75)), queueScreenMaterial)
    queueScreenPlane.position.set(10.4, 4.0, -30.4)
    queueScreenPlane.rotation.y = -0.4
    roomGroup.add(queueScreenPlane)

    const tickerScreen = createCanvasTexture(1024, 96)
    const tickerMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        map: trackTexture(tickerScreen.texture),
        transparent: false,
      }),
    )
    const tickerPlane = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(15.8, 0.92)), tickerMaterial)
    tickerPlane.position.set(0, 1.08, -5.2)
    tickerPlane.rotation.x = -0.12
    roomGroup.add(tickerPlane)

    const interactiveMeshes: THREE.Object3D[] = []
    const stationVisuals: Record<BridgeStationKey, StationVisual> = {
      xo: null as unknown as StationVisual,
      ops: null as unknown as StationVisual,
      eng: null as unknown as StationVisual,
      sec: null as unknown as StationVisual,
      med: null as unknown as StationVisual,
      cou: null as unknown as StationVisual,
    }

    const stationColorByKey: Record<BridgeStationKey, THREE.Color> = {
      xo: new THREE.Color(STATION_ACCENT_COLORS.xo),
      ops: new THREE.Color(STATION_ACCENT_COLORS.ops),
      eng: new THREE.Color(STATION_ACCENT_COLORS.eng),
      sec: new THREE.Color(STATION_ACCENT_COLORS.sec),
      med: new THREE.Color(STATION_ACCENT_COLORS.med),
      cou: new THREE.Color(STATION_ACCENT_COLORS.cou),
    }

    for (const stationKey of STATION_ORDER) {
      const anchor = STATION_ANCHORS[stationKey]
      const accent = stationColorByKey[stationKey]

      const stationConsole = makeOutlinedMesh(
        trackGeometry(new THREE.BoxGeometry(3.9, 1.7, 2.7)),
        makeToonMaterial(palette.console),
        palette.outline,
        1.03,
      )
      stationConsole.position.set(...anchor.position)
      stationConsole.rotation.y = anchor.rotationY
      roomGroup.add(stationConsole)

      const screen = createCanvasTexture(448, 192)
      const screenMaterial = trackMaterial(
        new THREE.MeshBasicMaterial({
          map: trackTexture(screen.texture),
          transparent: false,
        }),
      )
      const screenPlane = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(2.6, 1.08)), screenMaterial)
      screenPlane.position.set(0, 0.66, -1.36)
      screenPlane.rotation.x = -0.32
      stationConsole.add(screenPlane)

      const placeholderGroup = new THREE.Group()
      placeholderGroup.position.set(anchor.position[0], anchor.position[1] + 1.3, anchor.position[2] - 0.2)
      placeholderGroup.rotation.y = anchor.rotationY
      placeholderGroup.userData.stationKey = stationKey
      roomGroup.add(placeholderGroup)

      const pedestal = makeOutlinedMesh(
        trackGeometry(new THREE.CylinderGeometry(0.65, 0.8, 0.45, 14)),
        makeToonMaterial(palette.trim),
        palette.outline,
        1.03,
      )
      pedestal.userData.stationKey = stationKey
      placeholderGroup.add(pedestal)

      const holoMaterial = makeToonMaterial(accent.getHex(), 0.48)
      const holoBody = makeOutlinedMesh(
        trackGeometry(new THREE.CapsuleGeometry(0.24, 0.86, 6, 12)),
        holoMaterial,
        palette.outline,
        1.04,
      )
      holoBody.position.y = 0.76
      holoBody.userData.stationKey = stationKey
      placeholderGroup.add(holoBody)

      const ringMaterial = trackMaterial(
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      const ring = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.64, 0.08, 10, 40)), ringMaterial)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.1
      ring.userData.stationKey = stationKey
      placeholderGroup.add(ring)

      const labelCanvas = createCanvasTexture(320, 88)
      const labelMaterial = trackMaterial(
        new THREE.SpriteMaterial({
          map: trackTexture(labelCanvas.texture),
          transparent: true,
          depthWrite: false,
          depthTest: false,
        }),
      )
      const label = new THREE.Sprite(labelMaterial)
      label.position.set(0, 1.78, 0)
      label.scale.set(1.78, 0.48, 1)
      label.userData.stationKey = stationKey
      placeholderGroup.add(label)

      const hitArea = new THREE.Mesh(
        trackGeometry(new THREE.SphereGeometry(0.85, 14, 14)),
        trackMaterial(
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.001,
            depthWrite: false,
            color: 0xffffff,
          }),
        ),
      )
      hitArea.position.set(0, 0.74, 0)
      hitArea.userData.stationKey = stationKey
      placeholderGroup.add(hitArea)
      interactiveMeshes.push(hitArea)

      stationVisuals[stationKey] = {
        ringMaterial,
        holoMaterial,
        labelContext: labelCanvas.context,
        labelTexture: labelCanvas.texture,
        screenContext: screen.context,
        screenTexture: screen.texture,
        screenWidth: screen.width,
        screenHeight: screen.height,
      }
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hoveredStationKey: BridgeStationKey | null = null

    const pickStation = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const intersections = raycaster.intersectObjects(interactiveMeshes, false)
      const top = intersections[0]
      return resolveStationFromObject(top?.object || null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const stationKey = pickStation(event)
      hoveredStationKey = stationKey
      renderer.domElement.style.cursor = stationKey ? "pointer" : "default"
    }

    const handlePointerLeave = () => {
      hoveredStationKey = null
      renderer.domElement.style.cursor = "default"
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const stationKey = pickStation(event)
      if (stationKey) {
        onStationSelectRef.current?.(stationKey)
      }
    }

    renderer.domElement.addEventListener("pointermove", handlePointerMove)
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave)
    renderer.domElement.addEventListener("pointerdown", handlePointerDown)

    let currentPose: BridgeCameraPose = getBridgeCameraShot(selectedStationRef.current)
    let targetPose: BridgeCameraPose = getBridgeCameraShot(selectedStationRef.current)
    let activeShotKey = selectedStationRef.current

    camera.position.set(...currentPose.position)
    camera.lookAt(...currentPose.lookAt)
    camera.fov = currentPose.fov
    camera.updateProjectionMatrix()

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.max(1, entry.contentRect.width)
      const height = Math.max(1, entry.contentRect.height)
      const nextDprCap = prefersReducedMotion ? 1.1 : width < 960 ? 1.4 : 2
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, nextDprCap))
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    })
    resizeObserver.observe(container)

    const clock = new THREE.Clock()
    let animationFrame = 0
    let lastTelemetryPaint = -Infinity
    let lastTelemetrySignature = ""
    const telemetryHeartbeatSeconds = 1.1

    const renderFrame = () => {
      if (contextLost) {
        return
      }

      const delta = clock.getDelta()
      const elapsed = clock.elapsedTime
      const selectedKey = selectedStationRef.current

      if (selectedKey !== activeShotKey) {
        activeShotKey = selectedKey
        targetPose = getBridgeCameraShot(selectedKey)
      }

      if (prefersReducedMotion) {
        currentPose = targetPose
      } else {
        currentPose = interpolateBridgeCameraPose(currentPose, targetPose, delta, 8.8)
      }

      const idleScale = prefersReducedMotion ? 0 : 1
      const idleX = Math.sin(elapsed * 0.55) * 0.2 * idleScale
      const idleY = Math.sin(elapsed * 0.34) * 0.1 * idleScale
      const idleLookX = Math.sin(elapsed * 0.44) * 0.05 * idleScale

      camera.position.set(currentPose.position[0] + idleX, currentPose.position[1] + idleY, currentPose.position[2])
      camera.lookAt(currentPose.lookAt[0] + idleLookX, currentPose.lookAt[1], currentPose.lookAt[2])
      if (Math.abs(camera.fov - currentPose.fov) > 0.001) {
        camera.fov = currentPose.fov
        camera.updateProjectionMatrix()
      }

      const warpSpeedScale = prefersReducedMotion ? 0.1 : 1.75
      const advanceWarpLayer = (layer: WarpStreakLayer, multiplier: number) => {
        const travel = delta * warpSpeedScale * multiplier
        if (travel <= 0) {
          return
        }
        for (let index = 0; index < layer.speeds.length; index += 1) {
          const base = index * 6
          const step = layer.speeds[index] * travel
          layer.positions[base + 2] += step
          layer.positions[base + 5] += step

          if (layer.positions[base + 2] > 26) {
            resetWarpStreak(layer, index)
          }
        }
        layer.positionAttribute.needsUpdate = true
      }

      advanceWarpLayer(warpFarLayer, 1)
      advanceWarpLayer(warpNearLayer, 1.25)

      farStars.rotation.y += 0.00011 * (prefersReducedMotion ? 0.3 : 1)
      nearStars.rotation.y -= 0.00032 * (prefersReducedMotion ? 0.3 : 1)
      planet.rotation.y += 0.00105 * (prefersReducedMotion ? 0.4 : 1)
      nebulaAMaterial.opacity = 0.2 + Math.sin(elapsed * 0.18) * 0.03
      nebulaBMaterial.opacity = 0.16 + Math.cos(elapsed * 0.16) * 0.02

      for (const stationKey of STATION_ORDER) {
        const visual = stationVisuals[stationKey]
        const isActive = stationKey === selectedStationRef.current
        const isHovered = stationKey === hoveredStationKey

        visual.holoMaterial.color.copy(stationColorByKey[stationKey])
        visual.holoMaterial.opacity = isActive
          ? 0.72 + Math.sin(elapsed * 4.8) * 0.12
          : isHovered
            ? 0.5
            : 0.33

        visual.ringMaterial.color.copy(stationColorByKey[stationKey])
        visual.ringMaterial.opacity = isActive
          ? 0.86 + Math.sin(elapsed * 5.2) * 0.1
          : isHovered
            ? 0.56
            : 0.28
      }

      const sceneData = sceneDataRef.current
      const telemetrySignature = JSON.stringify({
        operatorLabel: sceneData.operatorLabel,
        stardate: sceneData.stardate,
        selectedStationKey: selectedStationRef.current,
        missionStats: sceneData.missionStats,
        systems: sceneData.systems,
        workItems: sceneData.workItems,
        stations: sceneData.stations.map((station) => ({
          stationKey: station.stationKey,
          callsign: station.callsign,
          status: station.status,
          load: Math.round(station.load ?? 0),
          focus: station.focus,
          queueDepth: station.queue?.length ?? 0,
          nextQueue: station.queue?.[0] || "",
        })),
        commsFeed: sceneData.commsFeed,
        lastEventAt: sceneData.lastEventAt,
      })

      if (
        telemetrySignature !== lastTelemetrySignature ||
        elapsed - lastTelemetryPaint >= telemetryHeartbeatSeconds
      ) {
        lastTelemetryPaint = elapsed
        lastTelemetrySignature = telemetrySignature

        const telemetry = formatBridgeTelemetry({
          operatorLabel: sceneData.operatorLabel,
          stardate: sceneData.stardate,
          missionStats: sceneData.missionStats,
          systems: sceneData.systems,
          workItems: sceneData.workItems,
          stations: sceneData.stations,
          selectedStationKey: selectedStationRef.current,
          commsFeed: sceneData.commsFeed,
          lastEventAt: sceneData.lastEventAt,
        })

        if (mainScreen.context) {
          drawMainScreen(mainScreen.context, {
            title: telemetry.mainScreen.title,
            lines: telemetry.mainScreen.lines,
            width: mainScreen.width,
            height: mainScreen.height,
            time: elapsed,
          })
          mainScreen.texture.needsUpdate = true
        }

        if (systemsScreen.context) {
          drawSystemsScreen(systemsScreen.context, {
            title: telemetry.systemsScreen.title,
            lines: telemetry.systemsScreen.lines,
            width: systemsScreen.width,
            height: systemsScreen.height,
            time: elapsed + 0.24,
          })
          systemsScreen.texture.needsUpdate = true
        }

        if (queueScreen.context) {
          drawQueueScreen(queueScreen.context, {
            title: telemetry.queueScreen.title,
            lines: telemetry.queueScreen.lines,
            width: queueScreen.width,
            height: queueScreen.height,
            time: elapsed + 0.42,
          })
          queueScreen.texture.needsUpdate = true
        }

        if (tickerScreen.context) {
          drawTicker(tickerScreen.context, {
            line: telemetry.tickerLine,
            width: tickerScreen.width,
            height: tickerScreen.height,
            time: elapsed,
          })
          tickerScreen.texture.needsUpdate = true
        }

        const stationByKey = new Map(sceneData.stations.map((station) => [station.stationKey, station]))

        for (const stationKey of STATION_ORDER) {
          const visual = stationVisuals[stationKey]
          const station = stationByKey.get(stationKey)
          const callsign = station?.callsign || stationKey.toUpperCase()
          const isActive = stationKey === selectedStationRef.current
          const accent = stationColorByKey[stationKey]
          const telemetryBlock = telemetry.stationScreens[stationKey]

          if (visual.screenContext) {
            drawStationScreen(visual.screenContext, {
              title: telemetryBlock.title,
              lines: telemetryBlock.lines,
              accent: `rgba(${Math.round(accent.r * 255)},${Math.round(accent.g * 255)},${Math.round(accent.b * 255)},0.9)`,
              width: visual.screenWidth,
              height: visual.screenHeight,
              time: elapsed + STATION_ORDER.indexOf(stationKey) * 0.5,
            })
            visual.screenTexture.needsUpdate = true
          }

          if (visual.labelContext) {
            drawPlaceholderLabel(visual.labelContext, callsign, isActive, 320, 88)
            visual.labelTexture.needsUpdate = true
          }
        }
      }

      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(renderFrame)
    }

    renderFrame()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()

      renderer.domElement.removeEventListener("webglcontextlost", onContextLost)
      renderer.domElement.removeEventListener("pointermove", handlePointerMove)
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave)
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown)

      for (const geometry of disposableGeometries) {
        geometry.dispose()
      }
      for (const material of disposableMaterials) {
        material.dispose()
      }
      for (const texture of disposableTextures) {
        texture.dispose()
      }

      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [isDark, prefersReducedMotion])

  return (
    <div ref={containerRef} className="absolute inset-0" aria-hidden>
      {sceneError && (
        <div className={`absolute inset-0 flex items-center justify-center p-6 text-sm font-medium ${fallbackClassName}`}>
          <div className="rounded-xl border border-cyan-300/30 bg-black/20 px-4 py-3 backdrop-blur-sm">{sceneError}</div>
        </div>
      )}
    </div>
  )
}
