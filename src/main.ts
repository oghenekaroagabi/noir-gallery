import './style.css'
import { Gallery, type SeedArtwork } from './gallery/Gallery'
import { UI } from './ui/UI'
import { invoke } from '@tauri-apps/api/core'

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

if (window.__NOIR) window.__NOIR.moduleLoaded = true

/** Paint the current step on the loader AND append it to a log file (best effort). */
function paint(msg: string): void {
  if (window.__NOIR) window.__NOIR.last = msg
  if (typeof window.__noirPaint === 'function') {
    window.__noirPaint(msg)
  } else {
    const el = document.getElementById('loadMsg')
    if (el) el.textContent = msg
  }
  try {
    invoke('log_startup', { msg }).catch(() => {})
  } catch {
    /* ignore */
  }
}

async function init(): Promise<void> {
  paint('1/9 · creating 3D gallery (WebGL)')
  const stage = document.getElementById('stage')!
  const gallery = new Gallery(stage)

  paint('2/9 · wiring interface')
  const ui = new UI(gallery, () => {
    ui.hideLoader()
    ui.showHint()
  })

  paint('3/9 · calling check_first_run')
  const status = await invoke<{ is_first_run: boolean; library_path: string | null }>('check_first_run')
  paint('4/9 · check_first_run → ' + JSON.stringify(status))

  if (status.is_first_run || !status.library_path) {
    ui.showLoader()
    await runFirstRun(ui, gallery)
  } else {
    ui.showLoader()
    await loadGallery(ui, gallery, status.library_path)
  }
}

async function runFirstRun(ui: UI, gallery: Gallery): Promise<void> {
  paint('5/9 · opening folder picker')
  const folder = await invoke<string | null>('pick_library_folder')
  paint('6/9 · folder = ' + String(folder))
  if (!folder) {
    ui.showError('Please choose a library folder')
    return
  }

  await invoke('complete_first_run', { libraryPath: folder })
  paint('7/9 · setup saved')

  const seeds = await invoke<SeedArtwork[]>('get_seed_artworks')
  paint('8/9 · importing ' + seeds.length + ' seeds')
  await invoke('import_seed_artworks', { libraryPath: folder })

  await gallery.loadSeedArtworks(seeds, folder)
  paint('9/9 · ready')
  ui.hideLoader()
  ui.showHint()
}

async function loadGallery(ui: UI, gallery: Gallery, libraryPath: string): Promise<void> {
  const seeds = await invoke<SeedArtwork[]>('get_seed_artworks')
  paint('5/9 · loading ' + seeds.length + ' artworks')
  await gallery.loadSeedArtworks(seeds, libraryPath)

  const saved = await invoke<ArtworkMetadata[]>('load_artwork_metadata')
  if (saved.length > 0) {
    paint('6/9 · restoring ' + saved.length + ' uploads')
    await gallery.loadUploadedArtworks(saved)
  }
  paint('9/9 · ready')
  ui.hideLoader()
  ui.showHint()
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    invoke<boolean>('toggle_fullscreen')
  }
})

window.addEventListener('focus', () => document.dispatchEvent(new CustomEvent('gallery:focus')))
window.addEventListener('blur', () => document.dispatchEvent(new CustomEvent('gallery:blur')))

init().catch((err) => {
  const msg = err && err.stack ? String(err.stack) : String(err)
  paint('❌ init failed: ' + msg)
})
