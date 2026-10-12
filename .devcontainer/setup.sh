#!/bin/bash
set -e

echo "==> Installing Node.js dependencies..."
npm install

echo "==> Installing Rust targets..."
rustup target add x86_64-pc-windows-msvc
rustup target add x86_64-unknown-linux-gnu

echo "==> Installing system dependencies for Tauri..."
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential

echo "==> Installing cargo-tauri..."
cargo install tauri-cli --version ^2

echo "==> Setup complete! Run 'npm run tauri:dev' to start."