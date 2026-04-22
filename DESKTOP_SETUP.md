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
- Workflow, GitHub Release'a `.exe`, `.msi`, updater metadata dosyalarini yukler.

## 7) Auto Update Kurulumu (Onemli)

Uygulama ici otomatik guncelleme icin Tauri updater imzasi gerekir.

### Gerekli GitHub Secrets

Repo -> Settings -> Secrets and variables -> Actions:

- `TAURI_PRIVATE_KEY`
- `TAURI_KEY_PASSWORD`

Private key olusturmak icin (lokal):

```powershell
cd C:\Users\bayra\Unimak_Saha_Takip\frontend
npx tauri signer generate -w ~/.tauri/unimak.key
```

Bu komut private key ve public key uretir.

- Private key icerigini `TAURI_PRIVATE_KEY` secret olarak ekle.
- Komutta belirledigin sifreyi `TAURI_KEY_PASSWORD` olarak ekle.

### Public key

Desktop updater plugin'i icin public key degerini CI ortaminda build-time env olarak ver:

- `TAURI_UPDATER_PUBLIC_KEY` (workflow env veya local build env)

Istege bagli endpoint override:

- `TAURI_UPDATER_ENDPOINT`
  - Varsayilan: `https://github.com/miko98/Unimak_Saha_Takip/releases/latest/download/latest.json`
