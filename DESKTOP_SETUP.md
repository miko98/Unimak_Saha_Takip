# Unimak Desktop (Tauri) Setup

Bu proje web frontend'i masaustu uygulama olarak Tauri ile paketler.

## 1) Gereksinimler (Windows)

- Node.js 20+
- Rust toolchain (stable)
- Visual Studio C++ Build Tools (Desktop development with C++)
- WebView2 Runtime (Windows 10/11'de genelde kurulu gelir)

## 2) Ilk Kurulum

```powershell
cd C:\Users\bayra\Unimak_Saha_Takip\frontend
npm install
```

## 3) Gelistirme Modu

```powershell
cd C:\Users\bayra\Unimak_Saha_Takip\frontend
npm run desktop:dev
```

Bu komut Vite + Tauri penceresini birlikte calistirir.

## 4) Installer Build Alma

```powershell
cd C:\Users\bayra\Unimak_Saha_Takip\frontend
npm run desktop:build
```

Cikti klasoru:

- `frontend/src-tauri/target/release/bundle/`

## 5) API Baglantisi

Desktop uygulama da web ile ayni backend'i kullanir:

- `frontend/src/config.js` -> `VITE_API_BASE_URL`

Production icin `.env` veya CI env ile Render backend URL'i verilmelidir.

## 6) CI Build

Desktop tag yayininda:

- Tag formati: `desktop-v*`
- Workflow: `.github/workflows/release-desktop.yml`
- Artifact: `desktop-windows-bundles`
