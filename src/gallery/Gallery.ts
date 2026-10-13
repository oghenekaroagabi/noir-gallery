import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'

export type Mode = 'ring' | 'wall' | 'grid'

export interface Artwork {
  id: string
  title: string
  artist: string
  year: string
  desc: string
  src: string
  texture: THREE.Texture | null
  aspect: number
  group: THREE.Group | null
  plane: THREE.Mesh | null
  basePos: THREE.Vector3
  baseQuat: THREE.Quaternion
  phase: number
  uploaded: boolean
}

export interface SeedArtwork {
  title: string
  artist: string
  year: string
  desc: string
  filename: string
}

export interface ArtworkMetadata {
  id: string
  title: string
  artist: string
  year: string
  desc: string
  filename: string
  uploaded: boolean
}

export class Gallery {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private composer: THREE.EffectComposer | null = null
  private bloomPass: THREE.UnrealBloomPass | null = null
  private controls: OrbitControls
  private artworks: Artwork[] = []
  private pickMeshes: THREE.Mesh[] = []
  private mode: Mode = 'ring'
  private focused: Artwork | null = null
  private tween: any = null
  private clock: THREE.Clock
  private dust: THREE.Points | null = null
  private wallGroup: THREE.Group
  private ambient: THREE.AmbientLight
  private keySpot: THREE.SpotLight
  private fillSpot: THREE.SpotLight
  private raycaster: THREE.Raycaster
  private pointer: THREE.Vector2
  private container: HTMLElement
  private onFocus: ((artwork: Artwork) => void) | null = null
  private onFocusClose: (() => void) | null = null
  private autoRotateEnabled = true

  constructor(container: HTMLElement) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.scene.fog = new THREE.Fog(0x1a1a2e, 16, 42)

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200)
    this.camera.position.set(0, 3.2, 13.5)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMappingExposure = 1.15
    container.appendChild(this.renderer.domElement)

    // Post-processing
    try {
      this.composer = new THREE.EffectComposer(this.renderer)
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera))
      this.bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.55, 0.8
      )
      this.composer.addPass(this.bloomPass)
      this.composer.addPass(new THREE.OutputPass())
    } catch {
      this.composer = null
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.rotateSpeed = 0.55
    this.controls.minDistance = 3.5
    this.controls.maxDistance = 26
    this.controls.maxPolarAngle = Math.PI * 0.52
    this.controls.target.set(0, 1.8, 0)
    this.controls.autoRotateSpeed = 0.55

    // Lights
    this.ambient = new THREE.AmbientLight(0x33333f, 1.8)
    this.scene.add(this.ambient)

    this.keySpot = new THREE.SpotLight(0xfff2d0, 2.5, 60, Math.PI / 5, 0.45, 1.2)
    this.keySpot.position.set(8, 14, 6)
    this.keySpot.castShadow = true
    this.keySpot.shadow.mapSize.set(1024, 1024)
    this.scene.add(this.keySpot)

    this.fillSpot = new THREE.SpotLight(0xc9a227, 1.2, 60, Math.PI / 4, 0.6, 1.4)
    this.fillSpot.position.set(-10, 10, -6)
    this.scene.add(this.fillSpot)

    const rim = new THREE.PointLight(0x4a5a8a, 0.5, 40)
    rim.position.set(0, 6, -12)
    this.scene.add(rim)

    const hemi = new THREE.HemisphereLight(0x8a8fa8, 0x1a1a22, 0.6)
    this.scene.add(hemi)

    // Floor
    this.buildFloor()

    // Gold dust
    this.buildDust()

    // Walls
    this.wallGroup = new THREE.Group()
    this.buildWalls()
    this.wallGroup.visible = false
    this.scene.add(this.wallGroup)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.clock = new THREE.Clock()

    // Events
    window.addEventListener('resize', this.onResize.bind(this))
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this))
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp.bind(this))

    this.animate()
  }

  private buildFloor(): void {
    try {
      const mirror = new THREE.Reflector(new THREE.CircleGeometry(24, 64), {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 1024,
        color: 0x15151c,
      })
      mirror.rotation.x = -Math.PI / 2
      mirror.position.y = -0.02
      this.scene.add(mirror)
    } catch {}

    const tint = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({
        color: 0x08080c,
        transparent: true,
        opacity: 0.62,
        roughness: 0.35,
        metalness: 0.6,
      })
    )
    tint.rotation.x = -Math.PI / 2
    tint.position.y = 0.0
    tint.receiveShadow = true
    this.scene.add(tint)

    ;[6, 12, 18, 23.6].forEach((r) => {
      const g = new THREE.RingGeometry(r, r + 0.03, 128)
      const m = new THREE.MeshBasicMaterial({
        color: 0xc9a227,
        transparent: true,
        opacity: r > 20 ? 0.5 : 0.12,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(g, m)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.012
      this.scene.add(mesh)
    })
  }

  private buildDust(): void {
    const N = 320
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const ang = Math.random() * Math.PI * 2
      const rad = 3 + Math.random() * 17
      pos[i * 3] = Math.cos(ang) * rad
      pos[i * 3 + 1] = 0.3 + Math.random() * 7.5
      pos[i * 3 + 2] = Math.sin(ang) * rad
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xe8c766,
      size: 0.055,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.dust = new THREE.Points(geo, mat)
    this.scene.add(this.dust)
  }

  private buildWalls(): void {
    ;[-1, 1].forEach((side) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(30, 7, 0.35),
        new THREE.MeshStandardMaterial({
          map: this.wallTexture(),
          color: 0xffffff,
          roughness: 0.55,
          metalness: 0.12,
        })
      )
      wall.position.set(0, 3.5, side * 6.4)
      wall.receiveShadow = true
      this.wallGroup.add(wall)

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(30, 0.1, 0.42),
        new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.98, roughness: 0.15 })
      )
      strip.position.set(0, 0.6, side * 6.4)
      this.wallGroup.add(strip)

      // Wall-wash light: gentle shaping on the cream wall so it reads as a
      // lit surface with soft falloff, not a flat bright slab.
      const wash = new THREE.PointLight(0xbfc6e0, 0.7, 34, 2)
      wash.position.set(0, 5.2, side * 2.6)
      this.wallGroup.add(wash)
    })
  }

  private hashStr(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i)
      h |= 0
    }
    return Math.abs(h)
  }

  private fallbackTexture(title: string, artist: string): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 640
    const x = c.getContext('2d')!
    const hues = [
      [26, 32, 64],
      [46, 26, 58],
      [210, 30, 42],
      [160, 24, 50],
      [350, 30, 46],
    ]
    const h = hues[this.hashStr(title) % hues.length]
    const g = x.createLinearGradient(0, 0, 512, 640)
    g.addColorStop(0, `hsl(${h[0]},${h[1]}%,${h[2] + 8}%)`)
    g.addColorStop(1, `hsl(${(h[0] + 40) % 360},${h[1]}%,${Math.max(10, h[2] - 18)}%)`)
    x.fillStyle = g
    x.fillRect(0, 0, 512, 640)
    x.globalAlpha = 0.25
    for (let i = 0; i < 5; i++) {
      x.beginPath()
      x.arc(120 + i * 80, 140 + ((i * 97) % 220), 90 + i * 22, 0, Math.PI * 2)
      x.strokeStyle = `hsl(${(h[0] + 180) % 360},60%,70%)`
      x.lineWidth = 3
      x.stroke()
    }
    x.globalAlpha = 1
    x.fillStyle = 'rgba(232,199,102,.9)'
    x.font = '600 34px Georgia'
    x.textAlign = 'center'
    x.fillText(title.toUpperCase().slice(0, 22), 256, 560)
    x.fillStyle = 'rgba(255,255,255,.55)'
    x.font = 'italic 24px Georgia'
    x.fillText(artist, 256, 600)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }

  private prepTexture(t: THREE.Texture): THREE.Texture {
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    t.needsUpdate = true
    return t
  }

  /** Cream gallery wall: vertical gradient, brighter at the picture rail. */
  private wallTexture(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 256
    const x = c.getContext('2d')!
    // Dark at the top (ceiling), warming toward the rail at the bottom
    const g = x.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0.0, '#8f887a')
    g.addColorStop(0.35, '#b3aa9a')
    g.addColorStop(0.82, '#ddd4c4')
    g.addColorStop(1.0, '#e8e0d0')
    x.fillStyle = g
    x.fillRect(0, 0, 8, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = THREE.RepeatWrapping
    return t
  }

  /** Art-deco sunburst pattern for the mat backing behind each artwork. */
  private backingTexture(): THREE.Texture {
    const S = 512
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    const x = c.getContext('2d')!

    // Warm bone base with a soft radial sheen
    x.fillStyle = '#d8cdb8'
    x.fillRect(0, 0, S, S)
    const g = x.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.75)
    g.addColorStop(0, 'rgba(255,250,238,0.85)')
    g.addColorStop(1, 'rgba(150,138,116,0.35)')
    x.fillStyle = g
    x.fillRect(0, 0, S, S)

    // Art-deco sunburst: radiating lines from the centre
    const cx = S / 2
    const cy = S / 2
    x.strokeStyle = 'rgba(201,162,39,0.30)'
    x.lineWidth = 2
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      x.beginPath()
      x.moveTo(cx, cy)
      x.lineTo(cx + Math.cos(a) * S, cy + Math.sin(a) * S)
      x.stroke()
    }

    // Two concentric deco rings
    x.strokeStyle = 'rgba(201,162,39,0.45)'
    x.lineWidth = 4
    x.beginPath(); x.arc(cx, cy, S * 0.26, 0, Math.PI * 2); x.stroke()
    x.lineWidth = 2
    x.beginPath(); x.arc(cx, cy, S * 0.33, 0, Math.PI * 2); x.stroke()

    // Small radiating ticks on the outer ring
    x.strokeStyle = 'rgba(201,162,39,0.35)'
    x.lineWidth = 2
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const r0 = S * 0.36
      const r1 = S * 0.41
      x.beginPath()
      x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      x.stroke()
    }

    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  private plaqueTexture(title: string): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const x = c.getContext('2d')!
    x.fillStyle = '#0c0c11'
    x.fillRect(0, 0, 512, 96)
    x.strokeStyle = 'rgba(201,162,39,.7)'
    x.lineWidth = 3
    x.strokeRect(6, 6, 500, 84)
    x.fillStyle = '#e8c766'
    x.font = '600 34px Georgia'
    x.textAlign = 'center'
    x.fillText(title.length > 26 ? title.slice(0, 25) + '…' : title, 256, 58)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  private buildArtworkObj(a: Artwork): void {
    const group = new THREE.Group()
    const w = 2.2 * a.aspect
    const h = 2.2
    const f = 0.13
    const d = 0.12

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.98, roughness: 0.15 })
    const darkMat = new THREE.MeshStandardMaterial({
      map: this.backingTexture(),
      color: 0xd8cdb8,
      roughness: 0.55,
      metalness: 0.25,
    })

    const bar = (bw: number, bh: number, px: number, py: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), goldMat)
      m.position.set(px, py, 0)
      m.castShadow = true
      group.add(m)
    }

    bar(w + 2 * f, f, 0, h / 2 + f / 2)
    bar(w + 2 * f, f, 0, -h / 2 - f / 2)
    bar(f, h, -w / 2 - f / 2, 0)
    bar(f, h, w / 2 + f / 2, 0)

    const mat = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04), darkMat)
    mat.position.z = -0.045
    group.add(mat)

    const artMat = new THREE.MeshStandardMaterial({ map: a.texture, roughness: 0.5, metalness: 0.05 })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat)
    plane.position.z = 0.001
    plane.userData.artId = a.id
    plane.castShadow = true
    group.add(plane)

    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.24),
      new THREE.MeshStandardMaterial({ map: this.plaqueTexture(a.title), roughness: 0.5, metalness: 0.3 })
    )
    plaque.position.set(0, -h / 2 - f - 0.32, 0.01)
    group.add(plaque)

    a.group = group
    a.plane = plane
    this.scene.add(group)
    this.pickMeshes.push(plane)
  }

  async loadSeedArtworks(seeds: SeedArtwork[], libraryPath: string): Promise<void> {
    const base = libraryPath.replace(/\\/g, '/')
    for (const s of seeds) {
      const src = convertFileSrc(`${base}/artworks/${s.filename}`)
      const a: Artwork = {
        id: crypto.randomUUID(),
        title: s.title,
        artist: s.artist,
        year: s.year,
        desc: s.desc,
        src,
        texture: null,
        aspect: 0.8,
        group: null,
        plane: null,
        basePos: new THREE.Vector3(),
        baseQuat: new THREE.Quaternion(),
        phase: Math.random() * Math.PI * 2,
        uploaded: false,
      }
      this.artworks.push(a)
      const texLoader = new THREE.TextureLoader()
      texLoader.load(
        src,
        (tex) => {
          a.texture = this.prepTexture(tex)
          if (tex.image?.width) {
            a.aspect = Math.min(1.5, Math.max(0.62, tex.image.width / tex.image.height))
          }
          this.buildArtworkObj(a)
          this.layout()
        },
        undefined,
        () => {
          a.texture = this.fallbackTexture(a.title, a.artist)
          this.buildArtworkObj(a)
          this.layout()
        }
      )
    }
  }

  async loadUploadedArtworks(metas: ArtworkMetadata[]): Promise<void> {
    for (const m of metas) {
      const a: Artwork = {
        id: m.id,
        title: m.title,
        artist: m.artist,
        year: m.year,
        desc: m.desc,
        src: convertFileSrc(m.filename),
        texture: null,
        aspect: 0.8,
        group: null,
        plane: null,
        basePos: new THREE.Vector3(),
        baseQuat: new THREE.Quaternion(),
        phase: Math.random() * Math.PI * 2,
        uploaded: m.uploaded,
      }
      this.artworks.push(a)
      const texLoader = new THREE.TextureLoader()
      texLoader.load(
        a.src,
        (tex) => {
          a.texture = this.prepTexture(tex)
          if (tex.image?.width) {
            a.aspect = Math.min(1.5, Math.max(0.62, tex.image.width / tex.image.height))
          }
          this.buildArtworkObj(a)
          this.layout()
        },
        undefined,
        () => {
          a.texture = this.fallbackTexture(a.title, a.artist)
          this.buildArtworkObj(a)
          this.layout()
        }
      )
    }
  }

  async addUploadedArtwork(data: { title: string; artist: string; year: string; desc: string; src: string }): Promise<void> {
    const a: Artwork = {
      id: crypto.randomUUID(),
      title: data.title,
      artist: data.artist,
      year: data.year,
      desc: data.desc,
      src: convertFileSrc(data.src),
      texture: null,
      aspect: 0.8,
      group: null,
      plane: null,
      basePos: new THREE.Vector3(),
      baseQuat: new THREE.Quaternion(),
      phase: Math.random() * Math.PI * 2,
      uploaded: true,
    }
    this.artworks.push(a)
    const texLoader = new THREE.TextureLoader()
    texLoader.load(
      a.src,
      (tex) => {
        a.texture = this.prepTexture(tex)
        if (tex.image?.width) {
          a.aspect = Math.min(1.5, Math.max(0.62, tex.image.width / tex.image.height))
        }
        this.buildArtworkObj(a)
        this.layout()
      },
      undefined,
      () => {
        a.texture = this.fallbackTexture(a.title, a.artist)
        this.buildArtworkObj(a)
        this.layout()
      }
    )
  }

  setMode(mode: Mode): void {
    if (this.focused) this.closeFocus(true)
    this.mode = mode
    this.layout()
    // Tween the camera to a composed framing for this mode so entering
    // Gallery Wall always opens on a centred, symmetrical view.
    this.tweenCameraTo(this.viewForMode(mode))
  }

  /** The camera/target framing each mode should settle into. */
  private viewForMode(mode: Mode): { cam: THREE.Vector3; target: THREE.Vector3 } {
    if (mode === 'wall') {
      // Inside the corridor (walls sit at z = ±6.4), angled down its length
      return {
        cam: new THREE.Vector3(12, 3.2, 3.5),
        target: new THREE.Vector3(-6, 2.3, 0),
      }
    }
    return {
      cam: new THREE.Vector3(0, 3.2, 13.5),
      target: new THREE.Vector3(0, 1.8, 0),
    }
  }

  /** Smoothly move the camera + orbit target to a framing. */
  private tweenCameraTo(view: { cam: THREE.Vector3; target: THREE.Vector3 }): void {
    if (this.focused) return
    this.tween = {
      t: 0,
      dur: 1.4,
      fromCam: this.camera.position.clone(),
      fromTgt: this.controls.target.clone(),
      toCam: view.cam,
      toTgt: view.target,
      onDone: null,
    }
  }

  setMood(v: number): void {
    this.keySpot.intensity = 0.4 + v * 3.0
    this.fillSpot.intensity = 0.25 + v * 1.5
    this.ambient.intensity = 0.7 + v * 1.6
    if (this.bloomPass) this.bloomPass.strength = 0.15 + v * 0.5
    if (this.dust) this.dust.material.opacity = 0.25 + v * 0.45
    // Tie background + fog to mood so the whole room brightens/dims together
    // v=0 -> 1.2 (dark). v=0.5 -> 3.0 (default = old max). v=1 -> 4.8 (brighter)
    const bg = new THREE.Color(0x1a1a2e).multiplyScalar(1.2 + v * 3.6)
    this.scene.background = bg
    if (this.scene.fog) this.scene.fog.color.copy(bg)
  }

  shuffle(): void {
    for (let i = this.artworks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = this.artworks[i]
      this.artworks[i] = this.artworks[j]
      this.artworks[j] = tmp
    }
    this.artworks.forEach((a, k) => {
      a.id = String(k)
      a.phase = Math.random() * Math.PI * 2
      if (a.plane) a.plane.userData.artId = String(k)
      if (a.group) a.group.userData.artId = String(k)
    })
    if (this.focused) this.closeFocus(true)
    this.layout()
  }

  async toggleFullscreen(): Promise<void> {
    const nowFs = await invoke<boolean>('toggle_fullscreen')
    // Hide all chrome in fullscreen for a pure, immersive canvas
    document.body.classList.toggle('fs', nowFs)
  }

  zoomIn(): void {
    this.dollyCamera(0.8)
  }

  zoomOut(): void {
    this.dollyCamera(1.25)
  }

  private dollyCamera(factor: number): void {
    const cam = this.camera
    const tgt = this.controls.target
    const dir = cam.position.clone().sub(tgt)
    const len = dir.length() * factor
    const clamped = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, len))
    dir.setLength(clamped)
    cam.position.copy(tgt.clone().add(dir))
    this.controls.update()
  }

  captureView(): Promise<string> {
    return new Promise((resolve) => {
      this.renderer.render(this.scene, this.camera)
      const dataUrl = this.renderer.domElement.toDataURL('image/png')
      resolve(dataUrl)
    })
  }

  getCurrentArtwork(): Artwork | null {
    return this.focused
  }

  getNextArtwork(): Artwork | null {
    if (!this.focused || this.artworks.length === 0) return null
    const i = this.artworks.indexOf(this.focused)
    return this.artworks[(i + 1) % this.artworks.length]
  }

  getPrevArtwork(): Artwork | null {
    if (!this.focused || this.artworks.length === 0) return null
    const i = this.artworks.indexOf(this.focused)
    return this.artworks[(i - 1 + this.artworks.length) % this.artworks.length]
  }

  setFocusCallback(cb: (artwork: Artwork) => void): void {
    this.onFocus = cb
  }

  setFocusCloseCallback(cb: () => void): void {
    this.onFocusClose = cb
  }

  onWindowFocus(): void {
    this.autoRotateEnabled = true
  }

  onWindowBlur(): void {
    this.autoRotateEnabled = false
  }

  private layout(): void {
    const n = this.artworks.length
    if (n === 0) return
    for (let i = 0; i < n; i++) {
      const a = this.artworks[i]
      if (this.mode === 'ring') {
        const r = Math.max(6.4, n * 1.35)
        const ang = (i / n) * Math.PI * 2
        a.basePos = new THREE.Vector3(Math.sin(ang) * r, 2.1, Math.cos(ang) * r)
        a.baseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0))
      } else if (this.mode === 'wall') {
        const nA = Math.ceil(n / 2)
        const nB = Math.floor(n / 2)
        const idx = i
        if (idx < nA) {
          a.basePos = new THREE.Vector3((idx - (nA - 1) / 2) * 3.6, 2.3, -6.05)
          a.baseQuat = new THREE.Quaternion()
        } else {
          a.basePos = new THREE.Vector3((idx - nA - (nB - 1) / 2) * 3.6, 2.3, 6.05)
          a.baseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))
        }
      } else {
        const cols = Math.ceil(Math.sqrt(n))
        const col = i % cols
        const row = Math.floor(i / cols)
        const zd = (this.seeded01(i * 3 + 1) * 2 - 1) * 3.2
        a.basePos = new THREE.Vector3(
          (col - (cols - 1) / 2) * 3.5,
          2.4 + ((Math.ceil(n / cols) - 1) / 2 - row) * 3.1,
          zd
        )
        a.baseQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, (this.seeded01(i * 7 + 2) - 0.5) * 0.7, 0)
        )
      }
    }
    this.wallGroup.visible = this.mode === 'wall'
  }

  private seeded01(i: number): number {
    const v = Math.sin(i * 127.1 + 311.7) * 43758.5453
    return v - Math.floor(v)
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  private frameTarget(a: Artwork): { target: THREE.Vector3; cam: THREE.Vector3 } {
    const pos = a.group!.position.clone()
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(a.group!.quaternion)
    const dist = 4.7
    return {
      target: pos.clone().add(new THREE.Vector3(0, 0.1, 0)),
      cam: pos.clone().add(normal.multiplyScalar(dist)).add(new THREE.Vector3(0, 0.35, 0)),
    }
  }

  private focusArtwork(a: Artwork): void {
    if (this.tween || !a.group) return
    this.focused = a
    this.controls.enabled = false
    this.controls.autoRotate = false
    const f = this.frameTarget(a)
    this.tween = {
      t: 0,
      dur: 1.25,
      fromCam: this.camera.position.clone(),
      fromTgt: this.controls.target.clone(),
      toCam: f.cam,
      toTgt: f.target,
      onDone: () => {
        if (this.onFocus) this.onFocus(a)
      },
    }
  }

  private closeFocus(instant: boolean): void {
    if (!this.focused) return
    this.focused = null
    if (instant) {
      this.controls.enabled = true
      if (this.onFocusClose) this.onFocusClose()
      return
    }
    this.tween = {
      t: 0,
      dur: 1.1,
      fromCam: this.camera.position.clone(),
      fromTgt: this.controls.target.clone(),
      toCam: new THREE.Vector3(0, 3.2, 13.5),
      toTgt: new THREE.Vector3(0, 1.8, 0),
      onDone: () => {
        this.controls.enabled = true
        if (this.onFocusClose) this.onFocusClose()
      },
    }
  }

  private stepFocus(dir: number): void {
    if (!this.focused) return
    const i = this.artworks.indexOf(this.focused)
    const next = this.artworks[(i + dir + this.artworks.length) % this.artworks.length]
    if (!next.group) return
    this.focused = next
    const f = this.frameTarget(next)
    this.tween = {
      t: 0,
      dur: 0.9,
      fromCam: this.camera.position.clone(),
      fromTgt: this.controls.target.clone(),
      toCam: f.cam,
      toTgt: f.target,
      onDone: () => {
        if (this.onFocus) this.onFocus(next)
      },
    }
  }

  stepNext(): void {
    this.stepFocus(1)
  }

  stepPrev(): void {
    this.stepFocus(-1)
  }

  closeFocusModal(): void {
    this.closeFocus(false)
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.focused && !this.tween) {
      this.renderer.domElement.dataset.downX = String(e.clientX)
      this.renderer.domElement.dataset.downY = String(e.clientY)
      this.renderer.domElement.dataset.downT = String(performance.now())
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const dx = e.clientX - Number(this.renderer.domElement.dataset.downX || 0)
    const dy = e.clientY - Number(this.renderer.domElement.dataset.downY || 0)
    if (Math.sqrt(dx * dx + dy * dy) > 8 || performance.now() - Number(this.renderer.domElement.dataset.downT || 0) > 500) return
    if (this.focused || this.tween) return
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.pickMeshes)
    if (hits.length) {
      const a = this.artworks.find((x) => x.id === hits[0].object.userData.artId)
      if (a && a.group) this.focusArtwork(a)
    }
  }

  private onResize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    if (this.composer) this.composer.setSize(w, h)
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this))
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime

    if (this.tween) {
      this.tween.t += dt / this.tween.dur
      const k = this.easeInOut(Math.min(this.tween.t, 1))
      this.camera.position.lerpVectors(this.tween.fromCam, this.tween.toCam, k)
      this.controls.target.lerpVectors(this.tween.fromTgt, this.tween.toTgt, k)
      if (this.tween.t >= 1) {
        const cb = this.tween.onDone
        this.tween = null
        if (cb) cb()
      }
    }

    const lerpK = 1 - Math.exp(-3.2 * dt)
    for (const a of this.artworks) {
      if (!a.group || !a.basePos) continue
      const tp = a.basePos.clone()
      if (this.mode === 'grid') {
        tp.y += Math.sin(t * 0.8 + a.phase) * 0.22
        tp.z += Math.cos(t * 0.6 + a.phase) * 0.28
      } else if (this.mode === 'ring') {
        tp.y += Math.sin(t * 0.5 + a.phase) * 0.08
      }
      a.group.position.lerp(tp, lerpK)
      a.group.quaternion.slerp(a.baseQuat, lerpK)
    }

    if (this.dust) {
      this.dust.rotation.y = t * 0.018
      this.dust.position.y = Math.sin(t * 0.25) * 0.25
    }

    this.controls.autoRotate = this.mode === 'ring' && !this.focused && !this.tween && this.autoRotateEnabled
    this.controls.update()
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }
}