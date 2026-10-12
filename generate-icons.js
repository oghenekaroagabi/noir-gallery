import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseDir = path.resolve(__dirname)

const inputPath = path.join(baseDir, 'src-tauri', 'icons', 'icon-1024.png')
const outputDir = path.join(baseDir, 'src-tauri', 'icons')

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: '256x256.png', size: 256 },
  { name: '512x512.png', size: 512 },
]

async function generate() {
  try {
    const image = sharp(inputPath)
    const metadata = await image.metadata()
    console.log(`Source: ${metadata.width}x${metadata.height}`)

    for (const { name, size } of sizes) {
      const outputPath = path.join(outputDir, name)
      await sharp(inputPath)
        .resize(size, size, { fit: 'contain', background: { r: 8, g: 8, b: 12, alpha: 1 } })
        .png()
        .toFile(outputPath)
      console.log(`Generated: ${name} (${size}x${size})`)
    }

    // Generate .ico (Windows) - multiple sizes in one file
    await sharp(inputPath)
      .resize(256, 256, { fit: 'contain', background: { r: 8, g: 8, b: 12, alpha: 1 } })
      .toFile(path.join(outputDir, 'icon.ico'))
    console.log('Generated: icon.ico')

    // Generate .icns (macOS) - placeholder
    await sharp(inputPath)
      .resize(1024, 1024, { fit: 'contain', background: { r: 8, g: 8, b: 12, alpha: 1 } })
      .toFile(path.join(outputDir, 'icon.icns'))
    console.log('Generated: icon.icns (placeholder - run iconutil on macOS for proper .icns)')

    console.log('\nDone! Update tauri.conf.json if needed.')
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  }
}

generate()