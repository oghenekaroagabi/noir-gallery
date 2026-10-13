import './style.css'
import { Gallery, type SeedArtwork } from './gallery/Gallery'
import { UI } from './ui/UI'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    __NOIR?: { moduleLoaded: boolean; last: string }
    __noirPaint?: (msg: string) => void
  }
}

interface ArtworkMetadata {
  id: string
  title: string
  artist: string
  year: string
  desc: string
  filename: string
  uploaded: boolean
}

let gallery: Gallery | null = null

if (window.__NOIR) window.__NOIR.moduleLoaded = true

/** Append to the startup log file (invisible, used for debugging). */
function paint(msg: string): void {
  if (window.__NOIR) window.__NOIR.last = msg
  try {
    invoke('log_startup', { msg }).catch(() => {})
  } catch {
    /* ignore */
  }
}

async function init(): Promise<void> {
  paint('creating 3D gallery (WebGL)')
  const stage = document.getElementById('stage')!
  gallery = new Gallery(stage)

  paint('wiring interface')
  const ui = new UI(gallery, () => {
    ui.hideLoader()
    ui.showHint()
  })

  paint('calling check_first_run')
  const status = await invoke<{ is_first_run: boolean; library_path: string | null }>('check_first_run')

  if (status.is_first_run || !status.library_path) {
    ui.showLoader()
    await runFirstRun(ui, gallery)
  } else {
    ui.showLoader()
    await loadGallery(ui, gallery, status.library_path)
  }

  await premiumReveal(ui)
}

async function runFirstRun(ui: UI, gallery: Gallery): Promise<void> {
  paint('opening folder picker')
  const folder = await invoke<string | null>('pick_library_folder')
  if (!folder) {
    ui.showError('Please choose a library folder')
    return
  }

  await invoke('complete_first_run', { libraryPath: folder })
  paint('setup saved')

  const seeds = await invoke<SeedArtwork[]>('get_seed_artworks')
  paint('importing ' + seeds.length + ' seeds')
  await invoke('import_seed_artworks', { libraryPath: folder })

  await gallery.loadSeedArtworks(seeds, folder)
  paint('ready')
}

async function loadGallery(ui: UI, gallery: Gallery, libraryPath: string): Promise<void> {
  const seeds = await invoke<SeedArtwork[]>('get_seed_artworks')
  paint('loading ' + seeds.length + ' artworks')
  await gallery.loadSeedArtworks(seeds, libraryPath)

  const saved = await invoke<ArtworkMetadata[]>('load_artwork_metadata')
  if (saved.length > 0) {
    paint('restoring ' + saved.length + ' uploads')
    await gallery.loadUploadedArtworks(saved)
  }
  paint('ready')
}

/** Premium reveal: deliberate "hanging" pause before the gallery appears. */
async function premiumReveal(ui: UI): Promise<void> {
  paint('hanging the collection')
  await new Promise((r) => setTimeout(r, 4000))
  ui.hideLoader()
  ui.showHint()
  // Reveal the chrome only once the gallery is live — prevents the
  // pre-splash flash of titlebar/topbar/tools on launch.
  document.body.classList.add('ready')
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Disable refresh (F5 / Ctrl+R) — a desktop app shouldn't reload like a browser
  if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r')) {
    e.preventDefault()
    return
  }
  // Escape: close the artwork modal first; if none open, exit fullscreen
  if (e.key === 'Escape') {
    const modalOpen = document.getElementById('modal')?.classList.contains('show')
    if (!modalOpen && document.body.classList.contains('fs')) {
      e.preventDefault()
      gallery?.toggleFullscreen()
    }
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    invoke<boolean>('toggle_fullscreen')
  }
  // Zoom shortcuts: Ctrl++ / Ctrl+- (and Ctrl+= / Ctrl+-)
  if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '=')) {
    e.preventDefault()
    gallery.zoomIn()
  }
  if ((e.metaKey || e.ctrlKey) && e.key === '-') {
    e.preventDefault()
    gallery.zoomOut()
  }
})

// Frameless window controls
const appWindow = getCurrentWindow()
document.getElementById('tb-min')?.addEventListener('click', () => appWindow.minimize())
document.getElementById('tb-close')?.addEventListener('click', () => appWindow.close())

// Maximize button toggles between □ (maximize) and ❐ (restore)
const maxBtn = document.getElementById('tb-max')
const setMaxIcon = async () => {
  if (!maxBtn) return
  const maxed = await appWindow.isMaximized()
  maxBtn.innerHTML = maxed
    ? '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>'
    : '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>'
}
document.getElementById('tb-max')?.addEventListener('click', async () => {
  const maxed = await appWindow.isMaximized()
  if (maxed) {
    // Restore drops to the smallest window we can have, not the default size
    await appWindow.unmaximize()
    await appWindow.setSize(new LogicalSize(1000, 700))
  } else {
    await appWindow.maximize()
  }
})
setMaxIcon()
  // Use listen with tauri://resize event (fallback if .on doesn't exist)
  if (typeof appWindow.on === 'function') {
    appWindow.on('resize', setMaxIcon)
  } else {
    appWindow.listen('tauri://resize', setMaxIcon)
  }

// Zoom buttons
document.getElementById('zoomInBtn')?.addEventListener('click', () => gallery.zoomIn())
document.getElementById('zoomOutBtn')?.addEventListener('click', () => gallery.zoomOut())

// Manual pinch-to-zoom: track two-finger touch and dolly the camera
let pinchStartDistance = 0
document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    pinchStartDistance = Math.hypot(dx, dy)
  }
}, { passive: true })

document.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchStartDistance > 0) {
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const currentDistance = Math.hypot(dx, dy)
    const factor = currentDistance / pinchStartDistance
    if (factor > 1) {
      gallery.zoomIn()
    } else if (factor < 1) {
      gallery.zoomOut()
    }
    pinchStartDistance = currentDistance
  }
}, { passive: false })

document.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) {
    pinchStartDistance = 0
  }
}, { passive: true })

window.addEventListener('focus', () => document.dispatchEvent(new CustomEvent('gallery:focus')))
window.addEventListener('blur', () => document.dispatchEvent(new CustomEvent('gallery:blur')))

init().catch((err) => {
  const msg = err && err.stack ? String(err.stack) : String(err)
  paint('❌ init failed: ' + msg)
})
