import './style.css'
import { Gallery, type SeedArtwork } from './gallery/Gallery'
import { UI } from './ui/UI'
import { invoke } from '@tauri-apps/api/core'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

async function init() {
  const stage = document.getElementById('stage')!
  const gallery = new Gallery(stage)

  const ui = new UI(gallery, () => {
    ui.hideLoader()
    ui.showHint()
  })

  try {
    const status = await invoke<{ is_first_run: boolean; library_path: string | null }>('check_first_run')

    if (status.is_first_run || !status.library_path) {
      ui.showLoader()
      ui.updateLoaderMessage('Welcome to NOIR — let's set up your gallery')
      // Show first-run modal in index.html — UI will handle it
      // For now, trigger the flow:
      await runFirstRun(ui, gallery)
    } else {
      ui.showLoader()
      await loadGallery(ui, gallery, status.library_path)
    }
  } catch (err) {
    console.error('Init failed:', err)
    ui.showError('Failed to initialize gallery')
  }
}

async function runFirstRun(ui: UI, gallery: Gallery): Promise<void> {
  try {
    // 1. Pick library folder
    const folder = await invoke<string | null>('pick_library_folder')
    if (!folder) {
      ui.showError('Please choose a library folder')
      return
    }

    // 2. Complete first run + import seeds
    await invoke('complete_first_run', { libraryPath: folder })
    const seeds = await invoke<SeedArtwork[]>('get_seed_artworks')
    await invoke('import_seed_artworks', { libraryPath: folder })

    // 3. Load into gallery
    await gallery.loadSeedArtworks(seeds, folder)
    ui.hideLoader()
    ui.showHint()
  } catch (err) {
    console.error('First run failed:', err)
    ui.showError('Setup failed — please restart')
  }
}

async function loadGallery(ui: UI, gallery: Gallery, libraryPath: string): Promise<void> {
  try {
    const seeds = await invoke<SeedArtwork[]>('get_seed_artworks')
    await gallery.loadSeedArtworks(seeds, libraryPath)

    const saved = await invoke<ArtworkMetadata[]>('load_artwork_metadata')
    if (saved.length > 0) {
      await gallery.loadUploadedArtworks(saved)
    }
    ui.hideLoader()
    ui.showHint()
  } catch (err) {
    console.error('Load failed:', err)
    ui.showError('Failed to load gallery')
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    invoke<boolean>('toggle_fullscreen')
  }
})

window.addEventListener('focus', () => document.dispatchEvent(new CustomEvent('gallery:focus')))
window.addEventListener('blur', () => document.dispatchEvent(new CustomEvent('gallery:blur')))

init()