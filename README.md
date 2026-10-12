# NOIR · Obsidian Art Gallery

A 3D art gallery desktop app built with Tauri + Three.js.

## Cloud-First Development

This project is designed for **GitHub Codespaces** — no local Rust/Tauri toolchain needed.

### Quick Start

1. **Open in Codespaces**: Click the green **Code** button → **Create codespace on main**
2. **Wait for setup** (~3-5 min): Node deps + Rust + Tauri system libs install automatically
3. **Start dev server**: `npm run tauri:dev`
4. **Preview**: Vite dev server runs on port 1420 (auto-forwarded)

### Building Releases

Push a tag to trigger GitHub Actions:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds `.exe` (NSIS) + `.msi` and creates a **draft Release** with download links.

## Project Structure

```
noir-gallery/
├── src/                    # Frontend (Vite + TypeScript + Three.js)
│   ├── main.ts
│   ├── style.css
│   ├── gallery/Gallery.ts  # Three.js scene, modes, animation
│   └── ui/UI.ts            # Modal, toast, hints, upload
├── src-tauri/              # Backend (Rust)
│   ├── src/commands.rs     # Tauri commands
│   ├── assets/seed/        # Bundled seed artworks
│   └── icons/              # App icons
├── .devcontainer/          # Codespaces config
└── .github/workflows/      # CI/CD
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server only |
| `npm run tauri:dev` | Full Tauri dev (requires Rust) |
| `npm run build` | Build frontend |
| `npm run tauri:build` | Build production bundle |

## Seed Artworks

1. The Starry Night — Vincent van Gogh (1889)
2. Mona Lisa — Leonardo da Vinci (c. 1503–1506)
3. Girl with a Pearl Earring — Johannes Vermeer (c. 1665)
4. The Great Wave off Kanagawa — Katsushika Hokusai (c. 1831)