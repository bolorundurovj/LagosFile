# LagosFile

[![GitHub Release](https://img.shields.io/github/v/release/bolorundurovj/LagosFile?sort=semver&style=flat-square)](https://github.com/bolorundurovj/LagosFile/releases/latest)
[![GitHub Downloads](https://img.shields.io/github/downloads/bolorundurovj/LagosFile/total?style=flat-square)](https://github.com/bolorundurovj/LagosFile/releases)
[![CI](https://github.com/bolorundurovj/LagosFile/actions/workflows/ci.yml/badge.svg)](https://github.com/bolorundurovj/LagosFile/actions/workflows/ci.yml)
[![SonarCloud Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=bolorundurovj_LagosFile&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=bolorundurovj_LagosFile)
[![SonarCloud Coverage](https://sonarcloud.io/api/project_badges/measure?project=bolorundurovj_LagosFile&metric=coverage)](https://sonarcloud.io/summary/new_code?id=bolorundurovj_LagosFile)
[![License](https://img.shields.io/github/license/bolorundurovj/LagosFile?style=flat-square)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/bolorundurovj/LagosFile?style=flat-square)](https://github.com/bolorundurovj/LagosFile/stargazers)

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

[LagosFile for LIRS](extension/README.md) is a companion browser extension that auto-fills the LIRS e-Tax portal from your confirmed filing data. See the [extension README](extension/README.md) for installation and usage instructions.

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
