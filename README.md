# LagosFile

**LagosFile** is an offline-first desktop application for Lagos-based individual taxpayers filing Direct Assessment returns under the Nigeria Tax Act (NTA) 2025. It guides you through income entry, capital allowances, deductions, and a full tax computation, then helps you file directly on the LIRS e-Tax portal via a companion browser extension.

Built with **Angular 19** and **Tauri 2** (Rust backend). Your data never leaves your machine.

---

## Features

- **PIN-protected encrypted database** - SQLite encrypted at rest; your PIN derives the key
- **Four-step filing wizard** - Income -> Capital Allowances -> Deductions & Reliefs -> Review & Confirm
- **NTA 2025 computation engine** - Progressive tax bands, minimum tax, CGT exemptions, rent relief
- **Foreign income with FX conversion** - Automatic CBN-rate waterfall (API -> cache -> manual)
- **Filing history & amendments** - Immutable confirmed filings; amendments create new linked records
- **Export engine** - PDF computation statement, CSV line-item export, JSON full record
- **LIRS portal integration** - Browser extension auto-fills the e-Tax portal from your computed filing
- **Document attachments** - Attach PDFs/images to income entries and relief claims (100 MB limit)
- **Backup & restore** - Encrypted database backup with full restore support
- **Configurable tax parameters** - Edit bands, rates, and caps in-app without a software release
- **Year-over-year tax chart** - Dashboard chart showing tax liability across filing years
- **Light / dark / system theming**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 19 (standalone components, Angular Material) |
| Backend / Shell | Tauri 2 (Rust) |
| Database | SQLite (via `rusqlite`, encrypted) |
| Styling | SCSS with CSS custom properties design tokens |
| Extension | Chrome MV3 / Firefox MV2 |
| Build | `ng build` + `tauri build` |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri CLI](https://tauri.app/start/prerequisites/) - `cargo install tauri-cli`
- A [Tauri system dependency](https://tauri.app/start/prerequisites/) for your OS (WebView2 on Windows, webkit2gtk on Linux)

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/bolorundurovj/LagosFile.git
cd LagosFile

# 2. Install Node dependencies
npm install

# 3. Run in development (hot-reload Angular + Tauri window)
npm run tauri:dev
```

### Production build

```bash
npm run tauri:build
```

The installer is output to `src-tauri/target/release/bundle/`.

---

## Browser Extension

The **LagosFile for LIRS** extension auto-populates the LIRS e-Tax portal with your confirmed filing data. It runs alongside the desktop app via a local HTTP bridge on port `19876`.

### Install (development)

**Chrome / Edge**
1. Pack the extension: `npm run pack:ext:chrome`
2. Go to `chrome://extensions` → Enable Developer Mode → Load unpacked → select `extension/chrome/`

**Firefox**
1. Pack the extension: `npm run pack:ext:firefox`
2. Go to `about:debugging` → This Firefox → Load Temporary Add-on → select `dist-ext/firefox-lagosfile-lirs.xpi`

### How it works

1. Open a confirmed filing in LagosFile and click **File with LIRS**
2. The app starts the local bridge and opens the LIRS e-Tax portal in your browser
3. The extension injects a floating panel into the portal page
4. Select the filing from the picker and use the per-tab fill buttons to auto-populate each form section

---

## Project Structure

```
lagosfile/
├── src/                        # Angular application
│   └── app/
│       ├── core/               # Services, models, guards
│       ├── features/           # Page-level feature modules
│       └── shared/             # Reusable components
├── src-tauri/                  # Rust / Tauri backend
│   └── src/
│       ├── commands/           # Tauri command handlers
│       ├── db/                 # Database layer
│       ├── models/             # Shared Rust structs
│       └── services/           # Business logic
├── extension/
│   ├── chrome/                 # Chrome MV3 extension source
│   ├── firefox/                # Firefox MV2 extension source
│   └── shared/                 # Shared extension utilities
├── docs/                       # Architecture and design docs
└── scripts/                    # Build and packaging scripts
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Angular dev server only (no Tauri) |
| `npm run tauri:dev` | Full app in dev mode (Angular + Tauri) |
| `npm run tauri:build` | Production build with installer |
| `npm test` | Angular unit tests |
| `npm run pack:ext` | Pack both Chrome and Firefox extensions |
| `npm run pack:ext:chrome` | Pack Chrome extension only |
| `npm run pack:ext:firefox` | Pack Firefox extension only |

---

## Documentation

- [Architecture overview](docs/architecture.md)
- [Design system](docs/design.md)
- [Requirements](docs/requirements.md)
- [LIRS extension plan](docs/lirs-extension-plan.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

---

## License

See [LICENSE](LICENSE).
