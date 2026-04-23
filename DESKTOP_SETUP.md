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

`tauri.conf.json` icinde `bundle.createUpdaterArtifacts: true` ve `plugins.updater.pubkey` dolu iken, Tauri v2 CLI imzali paket uretmek icin **private key** ortam degiskenini ister:

- `TAURI_SIGNING_PRIVATE_KEY` — private key dosyasinin **tam yolu** veya dosya **icerigi** (minisign)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — key olustururken verdigin sifre (varsa)

Ornek (PowerShell, once `npx tauri signer generate -w ...` ile key uret):

```powershell
cd C:\Users\bayra\Unimak_Saha_Takip\frontend
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\unimak.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "BurayaKeySifren"
npm run desktop:build
```

Sadece lokal deneme, imza/updater artifact istemiyorsan: `tauri.conf.json` icinde `bundle.createUpdaterArtifacts` degerini `false` yap (veya `plugins.updater.pubkey` bos birak ve public key ekleme).

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

- `TAURI_PRIVATE_KEY` (private key icerigi; workflow bunu `TAURI_SIGNING_PRIVATE_KEY` olarak da iletir)
- `TAURI_KEY_PASSWORD` (workflow `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` olarak da iletir)

Private key olusturmak icin (lokal):

```powershell
cd C:\Users\bayra\Unimak_Saha_Takip\frontend
npx tauri signer generate -w ~/.tauri/unimak.key
```

Bu komut private key ve public key uretir.

- Private key icerigini `TAURI_PRIVATE_KEY` secret olarak ekle.
- Komutta belirledigin sifreyi `TAURI_KEY_PASSWORD` olarak ekle.

### Public key (minisign format — cok onemli)

Tauri, updater public key'i **minisign `.pub` dosyasinin tam metni** olarak bekler: **iki satir**, ilki mutlaka `untrusted comment:` ile baslar. Sadece ikinci satirdaki base64'i yapistirmak **"Missing comment in public key"** hatasina yol acar.

GitHub Secret `TAURI_UPDATER_PUBLIC_KEY` degerine, `unimak.key.pub` dosyasinin **tamamini** yapistir (satir sonlari dahil).

Yerel `tauri.conf.json` kullanacaksan `plugins.updater.pubkey` alanina JSON string icinde satir sonlari icin `\n` kullan:

```json
"pubkey": "untrusted comment: minisign public key: ...\nRW..."
```

Istege bagli endpoint override:

- `TAURI_UPDATER_ENDPOINT`
  - Varsayilan: `https://github.com/miko98/Unimak_Saha_Takip/releases/latest/download/latest.json`
