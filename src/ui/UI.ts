import type { Gallery, Artwork } from '../gallery/Gallery'
import { invoke } from '@tauri-apps/api/core'

export class UI {
  private gallery: Gallery
  private onFirstRunComplete: () => void
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private hintTimer: ReturnType<typeof setTimeout> | null = null
  private currentFocusArtwork: Artwork | null = null

  private loader: HTMLElement
  private loadMsg: HTMLElement
  private modeSeg: HTMLElement
  private uploadBtn: HTMLElement
  private capBtn: HTMLElement
  private shufBtn: HTMLElement
  private fsBtn: HTMLElement
  private mood: HTMLInputElement
  private hint: HTMLElement
  private backdrop: HTMLElement
  private modal: HTMLElement
  private mImg: HTMLImageElement
  private mTitle: HTMLElement
  private mMeta: HTMLElement
  private mDesc: HTMLElement
  private mClose: HTMLElement
  private mPrev: HTMLElement
  private mNext: HTMLElement
  private toastEl: HTMLElement

  constructor(gallery: Gallery, onFirstRunComplete: () => void) {
    this.gallery = gallery
    this.onFirstRunComplete = onFirstRunComplete

    this.loader = document.getElementById('loader')!
    this.loadMsg = document.getElementById('loadMsg')!
    this.modeSeg = document.getElementById('modeSeg')!
    this.uploadBtn = document.getElementById('uploadBtn')!
    this.capBtn = document.getElementById('capBtn')!
    this.shufBtn = document.getElementById('shufBtn')!
    this.fsBtn = document.getElementById('fsBtn')!
    this.mood = document.getElementById('mood') as HTMLInputElement
    this.hint = document.getElementById('hint')!
    this.backdrop = document.getElementById('backdrop')!
    this.modal = document.getElementById('modal')!
    this.mImg = document.getElementById('mImg') as HTMLImageElement
    this.mTitle = document.getElementById('mTitle')!
    this.mMeta = document.getElementById('mMeta')!
    this.mDesc = document.getElementById('mDesc')!
    this.mClose = document.getElementById('mClose')!
    this.mPrev = document.getElementById('mPrev')!
    this.mNext = document.getElementById('mNext')!
    this.toastEl = document.getElementById('toast')!

    this.attachEvents()
    this.gallery.setFocusCallback((a) => this.fillModal(a))
    this.gallery.setFocusCloseCallback(() => this.hideFocusModal())
  }

  private attachEvents(): void {
    this.modeSeg.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button')
      if (!btn) return
      this.gallery.setMode(btn.dataset.mode as 'ring' | 'wall' | 'grid')
      this.modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn))
    })

    this.uploadBtn.addEventListener('click', () => this.handleUpload())
    this.capBtn.addEventListener('click', () => this.handleCapture())
    this.shufBtn.addEventListener('click', () => {
      this.gallery.shuffle()
      this.toast('Collection rearranged')
    })
    this.fsBtn.addEventListener('click', () => this.gallery.toggleFullscreen())
    this.mood.addEventListener('input', () => {
      this.gallery.setMood(Number(this.mood.value) / 100)
    })

    this.mClose.addEventListener('click', () => this.gallery.closeFocusModal())
    this.backdrop.addEventListener('click', () => this.gallery.closeFocusModal())
    this.mPrev.addEventListener('click', () => this.gallery.stepPrev())
    this.mNext.addEventListener('click', () => this.gallery.stepNext())

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.gallery.closeFocusModal()
      if (e.key === 'ArrowRight') this.gallery.stepNext()
      if (e.key === 'ArrowLeft') this.gallery.stepPrev()
    })

    // Hide hint on first pointer down
    document.addEventListener('pointerdown', () => {
      this.hint.classList.add('hide')
    }, { once: true })
  }

  private async handleUpload(): Promise<void> {
    try {
      const files = await invoke<string[]>('open_image_files')
      if (!files || files.length === 0) return
      for (const filePath of files) {
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown'
        const destPath = await invoke<string>('copy_image_to_app_data', { srcPath: filePath, filename: fileName })
        await invoke('save_artwork_metadata', {
          metadata: {
            id: crypto.randomUUID(),
            title: fileName.replace(/\.[^.]+$/, ''),
            artist: 'You',
            year: String(new Date().getFullYear()),
            desc: 'A recent acquisition for the collection — uploaded from your personal library and hung instantly.',
            filename: destPath,
            uploaded: true,
          },
        })
        await this.gallery.addUploadedArtwork({
          title: fileName.replace(/\.[^.]+$/, ''),
          artist: 'You',
          year: String(new Date().getFullYear()),
          desc: 'A recent acquisition for the collection.',
          src: destPath,
        })
      }
      this.toast('Artwork hung in the gallery')
    } catch (err) {
      console.error(err)
      this.toast('Upload failed')
    }
  }

  private async handleCapture(): Promise<void> {
    try {
      const dataUrl = await this.gallery.captureView()
      await invoke('save_image', { dataUrl })
      this.toast('View saved to your device')
    } catch (err) {
      console.error(err)
      this.toast('Could not save view')
    }
  }

  private fillModal(a: Artwork): void {
    this.currentFocusArtwork = a
    this.mImg.src = a.src
    this.mTitle.textContent = a.title
    this.mMeta.textContent = `${a.artist}  ·  ${a.year}${a.uploaded ? '  ·  Private Collection' : ''}`
    this.mDesc.textContent = a.desc
    this.backdrop.classList.add('show')
    this.modal.classList.add('show')
  }

  private hideFocusModal(): void {
    this.backdrop.classList.remove('show')
    this.modal.classList.remove('show')
    this.currentFocusArtwork = null
  }

  hideLoader(): void {
    this.loader.classList.add('done')
    // Clear inline overrides that the startup error-reporter may have set,
    // so the `.done` class (opacity:0) can actually take effect.
    this.loader.style.removeProperty('opacity')
    this.loader.style.removeProperty('pointer-events')
    this.loader.style.removeProperty('display')
  }

  showLoader(): void {
    this.loader.classList.remove('done')
  }

  updateLoaderMessage(msg: string): void {
    this.loadMsg.textContent = msg
  }

  showError(msg: string): void {
    this.toast(msg)
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg
    this.toastEl.classList.add('show')
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2600)
  }

  showHint(): void {
    this.hint.classList.remove('hide')
    if (this.hintTimer) clearTimeout(this.hintTimer)
    this.hintTimer = setTimeout(() => this.hint.classList.add('hide'), 5000)
  }
}