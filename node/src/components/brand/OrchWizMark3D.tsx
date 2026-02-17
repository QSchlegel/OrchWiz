"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export type OrchWizMark3DProps = {
  size: number
  className?: string
  spinEnabled?: boolean
  spinEveryMs?: { min: number; max: number }
  spinDurationMs?: number
  thicknessRatio?: number
  textureSrc?: string
  onReady?: () => void
  onError?: (error: unknown) => void
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function smoothstep(t: number) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function isWebGlAvailable() {
  if (typeof window === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export function OrchWizMark3D({
  size,
  className,
  spinEnabled = true,
  spinEveryMs = { min: 12_000, max: 20_000 },
  spinDurationMs = 1100,
  thicknessRatio = 0.14,
  // Prefer the SVG for the decal so the mark is properly cut out (transparent background).
  textureSrc = "/brand/orchwiz-mark.svg",
  onReady,
  onError,
}: OrchWizMark3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onReadyRef = useRef<OrchWizMark3DProps["onReady"]>(onReady)
  const onErrorRef = useRef<OrchWizMark3DProps["onError"]>(onError)
  const controlsRef = useRef<{
    schedule: () => void
    stop: () => void
    isReady: () => boolean
  } | null>(null)
  const readyRef = useRef(false)
  const spinEnabledRef = useRef(spinEnabled)
  const spinEveryRef = useRef(spinEveryMs)
  const spinDurationRef = useRef(spinDurationMs)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    spinEnabledRef.current = spinEnabled
  }, [spinEnabled])

  useEffect(() => {
    spinEveryRef.current = spinEveryMs
  }, [spinEveryMs])

  useEffect(() => {
    spinDurationRef.current = spinDurationMs
  }, [spinDurationMs])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!isWebGlAvailable()) {
      onErrorRef.current?.(new Error("WebGL unavailable"))
      return
    }

    readyRef.current = false

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

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      })
    } catch (error) {
      onErrorRef.current?.(error)
      return
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(size, size)

    renderer.domElement.className = "h-full w-full"
    renderer.domElement.style.pointerEvents = "none"
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(0, 0.55, 4.2)
    camera.lookAt(new THREE.Vector3(0, 0, 0))

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))

    const key = new THREE.DirectionalLight(0xffffff, 1.05)
    key.position.set(2.5, 3.8, 3.2)
    scene.add(key)

    const rim = new THREE.DirectionalLight(0x22d3ee, 0.65)
    rim.position.set(-3.2, 1.4, 2.2)
    scene.add(rim)

    const fill = new THREE.DirectionalLight(0x8b5cf6, 0.25)
    fill.position.set(0.6, -1.8, 3.6)
    scene.add(fill)

    // Separate spin + tilt groups so the Y-axis spin stays stable and doesn't inherit tilt.
    const spinGroup = new THREE.Group()
    scene.add(spinGroup)
    const tiltGroup = new THREE.Group()
    spinGroup.add(tiltGroup)

    const depth = Math.max(0.02, 2 * thicknessRatio)
    const bevelThickness = depth * 0.25
    const bevelSize = depth * 0.18

    const diamond = new THREE.Shape()
    diamond.moveTo(0, 1)
    diamond.lineTo(1, 0)
    diamond.lineTo(0, -1)
    diamond.lineTo(-1, 0)
    diamond.lineTo(0, 1)

    const badgeGeo = trackGeometry(
      new THREE.ExtrudeGeometry(diamond, {
        depth,
        bevelEnabled: true,
        bevelThickness,
        bevelSize,
        bevelSegments: 3,
        curveSegments: 1,
      }),
    )
    badgeGeo.center()
    badgeGeo.computeBoundingBox()

    const zMax = badgeGeo.boundingBox?.max.z ?? depth / 2

    const badgeMat = trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.45,
        roughness: 0.38,
        emissive: 0x020617,
        emissiveIntensity: 0.08,
      }),
    )
    const badgeMesh = new THREE.Mesh(badgeGeo, badgeMat)
    tiltGroup.add(badgeMesh)

    const decalMat = trackMaterial(
      new THREE.MeshBasicMaterial({
        transparent: true,
        // Lower threshold keeps the anti-aliased SVG edges smooth while still discarding fully transparent pixels.
        alphaTest: 0.02,
        depthWrite: false,
      }),
    ) as THREE.MeshBasicMaterial

    const planeGeo = trackGeometry(new THREE.PlaneGeometry(2.15, 2.15))
    const frontPlane = new THREE.Mesh(planeGeo, decalMat)
    frontPlane.position.z = zMax + 0.003
    tiltGroup.add(frontPlane)

    const backPlane = new THREE.Mesh(planeGeo, decalMat)
    backPlane.position.z = -(zMax + 0.003)
    backPlane.rotation.y = Math.PI
    tiltGroup.add(backPlane)

    // Base pose so the thickness reads even at rest.
    const baseX = 0.12
    const baseY = -0.22
    const baseZ = -0.14
    spinGroup.rotation.y = baseY
    tiltGroup.rotation.set(baseX, 0, baseZ)

    const render = () => renderer.render(scene, camera)

    let disposed = false
    let raf: number | null = null
    let spinTimeout: number | null = null
    let spinning = false
    let spinStartAt = 0

    const stopRaf = () => {
      if (raf != null) {
        cancelAnimationFrame(raf)
        raf = null
      }
    }

    const clearSpinTimeout = () => {
      if (spinTimeout != null) {
        window.clearTimeout(spinTimeout)
        spinTimeout = null
      }
    }

    const scheduleNextSpin = (initial: boolean) => {
      clearSpinTimeout()

      if (!readyRef.current) return
      if (!spinEnabledRef.current) return
      if (document.hidden) return

      const range = spinEveryRef.current
      const delayMs = initial ? randomBetween(900, 1800) : randomBetween(range.min, range.max)

      spinTimeout = window.setTimeout(() => startSpin(), delayMs)
    }

    const startSpin = () => {
      if (disposed) return
      if (!spinEnabledRef.current) return
      if (document.hidden) return

      clearSpinTimeout()
      stopRaf()

      spinning = true
      spinStartAt = performance.now()
      const duration = Math.max(1, spinDurationRef.current)

      const step = () => {
        if (disposed) return
        const t = clamp01((performance.now() - spinStartAt) / duration)
        // On the final frame, snap exactly to the resting pose so there is no tiny "wrap" discontinuity.
        if (t >= 1) {
          spinning = false
          spinGroup.rotation.y = baseY
          render()
          scheduleNextSpin(false)
          return
        }

        const e = smoothstep(t)
        spinGroup.rotation.y = baseY + e * Math.PI * 2
        render()

        raf = requestAnimationFrame(step)
      }

      raf = requestAnimationFrame(step)
    }

    const stopSpins = () => {
      clearSpinTimeout()
      stopRaf()
      spinning = false
      spinGroup.rotation.y = baseY
      render()
    }

    controlsRef.current = {
      schedule: () => scheduleNextSpin(true),
      stop: () => stopSpins(),
      isReady: () => readyRef.current,
    }

    // Keep the renderer aligned when the size changes via responsive state.
    // This avoids needing a ResizeObserver for a fixed-size container.
    renderer.setSize(size, size)
    camera.aspect = 1
    camera.updateProjectionMatrix()

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopSpins()
        return
      }

      if (spinEnabledRef.current) {
        if (!spinning) {
          scheduleNextSpin(true)
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)

    let textureLoaded = false
    const loader = new THREE.TextureLoader()
    loader.load(
      textureSrc,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }

        texture.colorSpace = THREE.SRGBColorSpace
        decalMat.map = trackTexture(texture)
        decalMat.needsUpdate = true
        textureLoaded = true
        readyRef.current = true
        render()
        onReadyRef.current?.()
        scheduleNextSpin(true)
      },
      undefined,
      (error) => {
        console.error("OrchWizMark3D texture load failed:", error)
        onErrorRef.current?.(error)
        render()
      },
    )

    render()

    // If the texture takes too long or fails, keep the fallback visible. But still render the body.
    const readyTimeout = window.setTimeout(() => {
      if (disposed) return
      if (!textureLoaded) {
        onErrorRef.current?.(new Error("OrchWizMark3D texture load timeout"))
      }
    }, 4000)

    return () => {
      disposed = true
      window.clearTimeout(readyTimeout)
      stopSpins()
      controlsRef.current = null
      document.removeEventListener("visibilitychange", onVisibilityChange)

      renderer.domElement.remove()
      renderer.dispose()

      for (const material of disposableMaterials) {
        material.dispose()
      }
      for (const geometry of disposableGeometries) {
        geometry.dispose()
      }
      for (const texture of disposableTextures) {
        texture.dispose()
      }
    }
  }, [size, textureSrc, thicknessRatio])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (!controls.isReady()) return

    if (spinEnabled) {
      controls.schedule()
    } else {
      controls.stop()
    }
  }, [spinEnabled])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: size,
        height: size,
      }}
    />
  )
}
