"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import * as THREE from "three"
import { computeCoinPose } from "./coinPose"

declare global {
  interface Window {
    __owzCoinCapture?: {
      ready: boolean
      setProgress: (progress: number) => void
    }
  }
}

export type CoinToss3DHandle = {
  toss: () => void
}

export interface CoinToss3DProps {
  src?: string
  size?: number
  durationMs?: number
  autoPlay?: boolean
  loop?: boolean
  interactive?: boolean
  spins?: number
  arcHeight?: number
  wobble?: number
  capture?: boolean
  className?: string
  onComplete?: () => void
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

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function smoothstep(t: number) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function hasAnyTransparency(pixels: Uint8ClampedArray) {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 250) {
      return true
    }
  }
  return false
}

function buildPixelDecalCanvas(image: HTMLImageElement) {
  const targetSize = 256
  const pixelBase = 64

  const srcWidth = Math.max(1, image.naturalWidth || image.width || 1)
  const srcHeight = Math.max(1, image.naturalHeight || image.height || 1)

  const srcCanvas = document.createElement("canvas")
  srcCanvas.width = srcWidth
  srcCanvas.height = srcHeight

  const srcContext = srcCanvas.getContext("2d", { willReadFrequently: true })
  if (!srcContext) {
    throw new Error("canvas 2d unavailable")
  }

  srcContext.clearRect(0, 0, srcWidth, srcHeight)
  srcContext.drawImage(image, 0, 0, srcWidth, srcHeight)

  const srcImageData = srcContext.getImageData(0, 0, srcWidth, srcHeight)
  const srcPixels = srcImageData.data
  const transparency = hasAnyTransparency(srcPixels)

  const outImageData = srcContext.createImageData(srcWidth, srcHeight)
  const outPixels = outImageData.data

  const keyR = srcPixels[0] ?? 0
  const keyG = srcPixels[1] ?? 0
  const keyB = srcPixels[2] ?? 0
  const threshold = 26

  for (let i = 0; i < srcPixels.length; i += 4) {
    const r = srcPixels[i] ?? 0
    const g = srcPixels[i + 1] ?? 0
    const b = srcPixels[i + 2] ?? 0
    const a = srcPixels[i + 3] ?? 255

    let nextAlpha = a
    if (!transparency) {
      const dr = r - keyR
      const dg = g - keyG
      const db = b - keyB
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      nextAlpha = dist <= threshold ? 0 : 255
    }

    outPixels[i] = r
    outPixels[i + 1] = g
    outPixels[i + 2] = b
    outPixels[i + 3] = nextAlpha
  }

  const processedCanvas = document.createElement("canvas")
  processedCanvas.width = srcWidth
  processedCanvas.height = srcHeight
  const processedContext = processedCanvas.getContext("2d")
  if (!processedContext) {
    throw new Error("canvas 2d unavailable")
  }
  processedContext.putImageData(outImageData, 0, 0)

  const pixelCanvas = document.createElement("canvas")
  pixelCanvas.width = pixelBase
  pixelCanvas.height = pixelBase
  const pixelContext = pixelCanvas.getContext("2d")
  if (!pixelContext) {
    throw new Error("canvas 2d unavailable")
  }

  pixelContext.clearRect(0, 0, pixelBase, pixelBase)
  pixelContext.imageSmoothingEnabled = false

  const scale = Math.min(pixelBase / srcWidth, pixelBase / srcHeight)
  const drawWidth = srcWidth * scale
  const drawHeight = srcHeight * scale
  const dx = (pixelBase - drawWidth) / 2
  const dy = (pixelBase - drawHeight) / 2

  pixelContext.drawImage(processedCanvas, dx, dy, drawWidth, drawHeight)

  const outCanvas = document.createElement("canvas")
  outCanvas.width = targetSize
  outCanvas.height = targetSize
  const outContext = outCanvas.getContext("2d")
  if (!outContext) {
    throw new Error("canvas 2d unavailable")
  }

  outContext.clearRect(0, 0, targetSize, targetSize)
  outContext.imageSmoothingEnabled = false
  outContext.drawImage(pixelCanvas, 0, 0, targetSize, targetSize)

  return outCanvas
}

async function loadPixelDecalTexture(src: string) {
  const canvas = await loadPixelDecalCanvas(src)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

async function loadPixelDecalCanvas(src: string) {
  const image = new Image()
  image.decoding = "async"
  image.src = src

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`))
  })

  return buildPixelDecalCanvas(image)
}

export const CoinToss3D = forwardRef<CoinToss3DHandle, CoinToss3DProps>(function CoinToss3D(
  {
    src = "/brand/coin-mark.png",
    size = 240,
    durationMs = 1600,
    autoPlay = false,
    loop = false,
    interactive = true,
    spins,
    arcHeight,
    wobble,
    capture = false,
    className,
    onComplete,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onCompleteRef = useRef(onComplete)
  const loopRef = useRef(loop)
  const durationRef = useRef(durationMs)
  const captureRef = useRef(capture)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [canRender3d, setCanRender3d] = useState(true)

  const tossRef = useRef<(() => void) | null>(null)
  useImperativeHandle(ref, () => ({
    toss: () => tossRef.current?.(),
  }))

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    loopRef.current = loop
  }, [loop])

  useEffect(() => {
    durationRef.current = durationMs
  }, [durationMs])

  useEffect(() => {
    captureRef.current = capture
  }, [capture])

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

    const captureMode = captureRef.current
    const fixedSize = 480

    if (!isWebGlAvailable()) {
      if (!captureMode) {
        setCanRender3d(false)
        return
      }

      // Playwright's headless Chromium often has WebGL disabled; keep capture mode working by
      // rendering a deterministic 2D fallback into a canvas.
      setCanRender3d(true)

      const canvas = document.createElement("canvas")
      canvas.width = fixedSize
      canvas.height = fixedSize
      canvas.className = "h-full w-full"
      canvas.style.pointerEvents = "none"
      container.appendChild(canvas)

      const context = canvas.getContext("2d")
      if (!context) {
        setCanRender3d(false)
        return
      }

      let cancelled = false
      let decal: HTMLCanvasElement | null = null

      const background = "#07070e"
      const centerX = fixedSize / 2
      const baseY = fixedSize / 2 + 18
      const radius = 150
      const yScale = 80

      const render2d = (progress: number) => {
        const pose = computeCoinPose(clamp01(progress), { spins, arcHeight, wobble })
        context.clearRect(0, 0, fixedSize, fixedSize)
        context.fillStyle = background
        context.fillRect(0, 0, fixedSize, fixedSize)

        // Shadow.
        context.save()
        context.globalAlpha = pose.shadow.opacity
        context.fillStyle = "#000"
        context.beginPath()
        context.ellipse(
          centerX,
          baseY + radius * 0.96,
          radius * 0.95 * pose.shadow.scale,
          radius * 0.28 * pose.shadow.scale,
          0,
          0,
          Math.PI * 2,
        )
        context.fill()
        context.restore()

        const coinY = baseY - pose.position.y * yScale
        const flip = Math.cos(pose.rotation.x)
        const faceScale = Math.max(0.08, Math.abs(flip))
        const edgeHint = 1 - faceScale

        context.save()
        context.translate(centerX, coinY)
        context.rotate(pose.rotation.z)

        // Face fill.
        const faceGradient = context.createRadialGradient(-radius * 0.25, -radius * 0.35, radius * 0.12, 0, 0, radius)
        faceGradient.addColorStop(0, "rgba(255, 248, 220, 0.96)")
        faceGradient.addColorStop(0.55, "rgba(212, 175, 55, 0.94)")
        faceGradient.addColorStop(1, "rgba(120, 84, 18, 0.98)")
        context.fillStyle = faceGradient
        context.strokeStyle = "rgba(11, 11, 11, 0.8)"
        context.lineWidth = 6

        context.beginPath()
        context.ellipse(0, 0, radius, radius * faceScale, 0, 0, Math.PI * 2)
        context.fill()
        context.stroke()

        // Edge hint when nearly sideways.
        if (edgeHint > 0.65) {
          context.save()
          context.globalAlpha = Math.min(0.55, edgeHint)
          const edgeGradient = context.createLinearGradient(-radius, 0, radius, 0)
          edgeGradient.addColorStop(0, "rgba(10, 10, 14, 0.9)")
          edgeGradient.addColorStop(0.5, "rgba(255, 242, 199, 0.55)")
          edgeGradient.addColorStop(1, "rgba(10, 10, 14, 0.9)")
          context.fillStyle = edgeGradient
          context.fillRect(-radius, -(radius * 0.08), radius * 2, radius * 0.16)
          context.restore()
        }

        // Decal (pixelated) clipped to face.
        if (decal) {
          const decalSize = radius * 1.34
          context.save()
          context.beginPath()
          context.ellipse(0, 0, radius * 0.86, radius * 0.86 * faceScale, 0, 0, Math.PI * 2)
          context.clip()
          context.globalAlpha = 0.96
          context.imageSmoothingEnabled = false
          context.drawImage(decal, -decalSize / 2, -decalSize / 2, decalSize, decalSize)
          context.restore()
        }

        context.restore()
      }

      window.__owzCoinCapture = {
        ready: false,
        setProgress: (progress: number) => render2d(progress),
      }

      render2d(0)

      void loadPixelDecalCanvas(src)
        .then((nextDecal) => {
          if (cancelled) return
          decal = nextDecal
          render2d(0)
          if (window.__owzCoinCapture) {
            window.__owzCoinCapture.ready = true
          }
        })
        .catch((error) => {
          console.error("Coin toss capture decal failed:", error)
          if (window.__owzCoinCapture) {
            window.__owzCoinCapture.ready = true
          }
        })

      return () => {
        cancelled = true
        if (window.__owzCoinCapture) {
          delete window.__owzCoinCapture
        }
        canvas.remove()
      }
    }

    setCanRender3d(true)

    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: !captureMode,
        powerPreference: "high-performance",
      })
    } catch (error) {
      console.error("Coin toss renderer init failed:", error)
      setCanRender3d(false)
      return
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(captureMode ? 1 : Math.min(window.devicePixelRatio || 1, 2))

    const initialWidth = captureMode ? fixedSize : Math.max(1, container.clientWidth)
    const initialHeight = captureMode ? fixedSize : Math.max(1, container.clientHeight)
    renderer.setSize(initialWidth, initialHeight)

    renderer.domElement.className = "h-full w-full"
    renderer.domElement.style.pointerEvents = interactive ? "auto" : "none"
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    if (captureMode) {
      scene.background = new THREE.Color(0x07070e)
    }

    const camera = new THREE.PerspectiveCamera(35, initialWidth / initialHeight, 0.1, 100)
    camera.position.set(0, 1.15, 4.1)
    camera.lookAt(new THREE.Vector3(0, 0, 0))

    const ambient = new THREE.AmbientLight(0xffffff, 0.85)
    scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 1.0)
    key.position.set(2, 4, 3)
    scene.add(key)

    const rim = new THREE.DirectionalLight(0x22d3ee, 0.55)
    rim.position.set(-3, 1.5, 2)
    scene.add(rim)

    const coin = new THREE.Group()
    scene.add(coin)

    const edgeMat = trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.85,
        roughness: 0.28,
      }),
    )

    const faceMat = trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf0d98c,
        metalness: 0.65,
        roughness: 0.35,
      }),
    )

    const cylinder = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(1, 1, 0.22, 64)), [
      edgeMat,
      faceMat,
      faceMat,
    ])
    coin.add(cylinder)

    const decalMaterial = trackMaterial(
      new THREE.MeshBasicMaterial({
        transparent: true,
        alphaTest: 0.15,
      }),
    ) as THREE.MeshBasicMaterial

    const decalPlaneGeo = trackGeometry(new THREE.PlaneGeometry(1.55, 1.55))
    const topDecal = new THREE.Mesh(decalPlaneGeo, decalMaterial)
    topDecal.position.y = 0.22 / 2 + 0.002
    topDecal.rotation.x = -Math.PI / 2
    coin.add(topDecal)

    const bottomDecal = new THREE.Mesh(decalPlaneGeo, decalMaterial)
    bottomDecal.position.y = -(0.22 / 2 + 0.002)
    bottomDecal.rotation.x = Math.PI / 2
    coin.add(bottomDecal)

    const shadowMat = trackMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.22,
      }),
    ) as THREE.MeshBasicMaterial
    const shadow = new THREE.Mesh(trackGeometry(new THREE.CircleGeometry(1.25, 48)), shadowMat)
    shadow.position.set(0, -1.2, 0)
    shadow.rotation.x = -Math.PI / 2
    scene.add(shadow)

    const baseYaw = Math.PI * 0.18
    const applyPose = (progress: number) => {
      const pose = computeCoinPose(clamp01(progress), { spins, arcHeight, wobble })
      coin.position.set(pose.position.x, pose.position.y, pose.position.z)
      coin.rotation.set(pose.rotation.x, baseYaw + pose.rotation.y, pose.rotation.z)
      shadow.scale.set(pose.shadow.scale, pose.shadow.scale, 1)
      shadowMat.opacity = pose.shadow.opacity
      renderer.render(scene, camera)
    }

    let disposeCancelled = false

    if (captureMode) {
      window.__owzCoinCapture = {
        ready: false,
        setProgress: (progress: number) => applyPose(progress),
      }
    }

    applyPose(0)

    void loadPixelDecalTexture(src)
      .then((texture) => {
        if (disposeCancelled) {
          texture.dispose()
          return
        }
        decalMaterial.map = trackTexture(texture)
        decalMaterial.needsUpdate = true
        applyPose(0)

        if (captureMode && window.__owzCoinCapture) {
          window.__owzCoinCapture.ready = true
        }
      })
      .catch((error) => {
        console.error("Coin toss decal texture failed:", error)
        // Keep the coin renderable even if the decal fails; capture mode should still unblock.
        if (captureMode && window.__owzCoinCapture) {
          window.__owzCoinCapture.ready = true
        }
      })

    let raf: number | null = null
    let playing = false
    let startAt = 0
    let tiltStartAt = 0

    const stop = () => {
      if (raf != null) {
        cancelAnimationFrame(raf)
        raf = null
      }
      playing = false
    }

    const runReducedMotion = () => {
      stop()
      playing = true
      tiltStartAt = performance.now()

      const baseRim = 0.55
      const step = () => {
        if (disposeCancelled) return
        const now = performance.now()
        const t = clamp01((now - tiltStartAt) / 250)
        const pulse = Math.sin(Math.PI * t)
        coin.position.set(0, 0, 0)
        coin.rotation.set(0, baseYaw, pulse * 0.22)
        coin.scale.setScalar(1 + pulse * 0.05)
        shadow.scale.set(1.05 - pulse * 0.04, 1.05 - pulse * 0.04, 1)
        shadowMat.opacity = 0.22
        rim.intensity = baseRim + pulse * 0.35
        renderer.render(scene, camera)

        if (t < 1) {
          raf = requestAnimationFrame(step)
        } else {
          rim.intensity = baseRim
          coin.scale.setScalar(1)
          playing = false
          onCompleteRef.current?.()
        }
      }

      raf = requestAnimationFrame(step)
    }

    const runToss = () => {
      stop()
      playing = true
      startAt = performance.now()

      const step = () => {
        if (disposeCancelled) return
        const now = performance.now()
        const duration = Math.max(1, durationRef.current)
        const t = clamp01((now - startAt) / duration)
        applyPose(t)

        if (t < 1) {
          raf = requestAnimationFrame(step)
          return
        }

        if (loopRef.current) {
          startAt = performance.now()
          raf = requestAnimationFrame(step)
          return
        }

        playing = false
        onCompleteRef.current?.()
      }

      raf = requestAnimationFrame(step)
    }

    tossRef.current = () => {
      if (captureRef.current) return
      if (playing) {
        stop()
      }
      if (prefersReducedMotion) {
        runReducedMotion()
      } else {
        runToss()
      }
    }

    const clickHandler = () => {
      if (!interactive) return
      tossRef.current?.()
    }

    container.addEventListener("click", clickHandler)

    let resizeObserver: ResizeObserver | null = null
    if (!captureMode) {
      resizeObserver = new ResizeObserver(() => {
        const width = Math.max(1, container.clientWidth)
        const height = Math.max(1, container.clientHeight)
        renderer.setSize(width, height)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        applyPose(0)
      })
      resizeObserver.observe(container)
    }

    if (!captureMode && autoPlay) {
      // Defer to next tick so the first paint lands before the toss.
      queueMicrotask(() => tossRef.current?.())
    }

    return () => {
      disposeCancelled = true
      stop()

      container.removeEventListener("click", clickHandler)
      resizeObserver?.disconnect()

      if (captureMode && window.__owzCoinCapture) {
        delete window.__owzCoinCapture
      }

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
  }, [arcHeight, autoPlay, capture, interactive, prefersReducedMotion, spins, src, wobble])

  if (!canRender3d) {
    return (
      <img
        src={src}
        alt="Coin mark"
        width={size}
        height={size}
        draggable={false}
        className={className}
        style={{ imageRendering: "pixelated", pointerEvents: interactive ? "auto" : "none" }}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: capture ? 480 : size,
        height: capture ? 480 : size,
      }}
    />
  )
})
