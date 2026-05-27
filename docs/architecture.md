# LagosFile - Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Desktop App (Tauri)                       │
│                                                                  │
│  ┌──────────────────────────────┐   ┌──────────────────────┐   │
│  │     Angular 19 Frontend      │   │    Rust / Tauri       │   │
│  │  (WebView, no Node access)   │◄──►  Backend (lib.rs)     │   │
│  │                              │   │                       │   │
│  │  core/services/              │   │  commands/            │   │
│  │    TauriService   (invoke)   │   │    auth.rs            │   │
│  │    FilingService             │   │    filing.rs          │   │
│  │    LIRSService               │   │    lirs.rs   ─────────┼──►│ HTTP :19876
│  │    FxService                 │   │    export.rs          │   │
│  │    ConfigService             │   │    fx.rs              │   │
│  │                              │   │    config.rs          │   │
│  │  features/                   │   │    document.rs        │   │
│  │    dashboard/                │   │                       │   │
│  │    filing-wizard/            │   │  db/  (rusqlite)      │   │
│  │    filing-history/           │   │    lagosfile.db       │   │
│  │    configuration/            │   │    (encrypted)        │   │
│  └──────────────────────────────┘   └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                         HTTP 127.0.0.1:19876
                         GET /filings  (array)
                         GET /filing   (primary)
                                │
          ┌─────────────────────▼──────────────────────┐
          │        Browser Extension (Chrome / Firefox)  │
          │                                              │
          │  popup.html/js  - filing picker UI            │
          │  content-script.js - Shadow DOM panel        │
          │  background.js  - storage relay              │
          │                                              │
          │  Injected into: etax.lirs.gov.ng             │
          └──────────────────────────────────────────────┘
```

---

## Layer Breakdown

### 1. Angular Frontend

The UI is a standard Angular 19 SPA rendered inside Tauri's WebView. All communication with the Rust backend goes through `TauriService`, which wraps `@tauri-apps/api/core.invoke`.

**Key conventions:**
- All components are standalone (no NgModules)
- Services use the `inject()` function
- Routing is defined in `app.routes.ts`; guards (`pin-lock`, `profile`) protect all routes until the user is authenticated
- The design system uses SCSS custom properties (CSS variables) defined in `styles/tokens.scss`; components never hard-code colours or spacing

**Feature modules:**

| Module | Route | Purpose |
|---|---|---|
| `pin-entry` | `/unlock` | PIN entry on app open; derives encryption key |
| `setup` | `/setup` | First-launch profile creation and PIN setup |
| `dashboard` | `/` | Overview, deadline countdown, filing summary |
| `filing-wizard` | `/filing/new` | Four-step new filing flow |
| `filing-history` | `/filings` | All filings, exports, amendments |
| `configuration` | `/config` | Tax band and rate editor |
| `settings` | `/settings` | Profile edit, backup/restore, theme |

---

### 2. Tauri / Rust Backend

The backend is a Tauri 2 application whose entry point is `src-tauri/src/lib.rs`. All callable functions are registered via `tauri::generate_handler!` and invoked from the frontend as async calls.

**Command modules:**

| Module | Responsibility |
|---|---|
| `commands/auth.rs` | PIN setup/verify, key derivation, lock/unlock, recovery, backup/restore |
| `commands/filing.rs` | CRUD for filings, income entries, allowances, reliefs; tax computation |
| `commands/lirs.rs` | LIRS HTTP bridge (see below) |
| `commands/export.rs` | PDF, CSV, JSON export; `open_file` shell command |
| `commands/fx.rs` | FX rate resolution waterfall, cache management |
| `commands/config.rs` | Tax configuration CRUD, import/export |
| `commands/document.rs` | Document attachment copy, list, delete |
| `commands/profile.rs` | Taxpayer profile create/read/update |

**Data flow for a typical command:**

```
Angular service.invoke('command_name', { ...args })
  → Tauri IPC bridge
    → commands/X.rs handler
      → db/  (AppState Mutex<AppDb>)
        → rusqlite → encrypted SQLite
      ← Result<T, String>
  ← Promise<T>
```

**State:** A single `AppState` struct is managed by Tauri and shared across all commands via `tauri::State`. It holds:
- `db: Mutex<Option<AppDb>>` - the database connection (None when locked)
- `key: Mutex<Option<[u8; 32]>>` - the in-memory encryption key (None when locked)

---

### 3. LIRS HTTP Bridge

When the user clicks **File with LIRS**, `commands/lirs.rs` starts a lightweight HTTP server on `127.0.0.1:19876`. This bridge is the communication channel between the desktop app and the browser extension.

**Endpoints:**

| Endpoint | Response |
|---|---|
| `GET /filings` | JSON array of all confirmed `PendingFiling` objects |
| `GET /filing` | JSON object - the primary (selected) `PendingFiling` |

The `PendingFiling` struct is a flattened, serialization-friendly projection of the filing data that maps directly to LIRS form field names. It includes nested objects for `taxpayer`, `income`, `accommodation`, `deductions`, and `computation`.

The bridge binds to loopback only and is not accessible from other machines. It runs for the duration of the LIRS portal session.

---

### 4. Browser Extension

The extension has three source files per browser (Chrome MV3 / Firefox MV2):

**`content-script.js`** - The core of the extension. Injected into `etax.lirs.gov.ng` at `document_idle`.
- Creates a Shadow DOM host element attached to `document.body`
- The panel is fully isolated from the LIRS page's CSS via Shadow DOM
- Fetches `/filings` from the local bridge on load
- Presents a filing picker; once a filing is selected, per-tab fill buttons are shown
- `injectStep(tabKey)` iterates the `MAPPINGS` for that tab and calls `setFieldValue` on matching elements
- `byLabel()` searches the DOM using multiple strategies: `<label>`, `<mat-label>`, table cells (`td`/`th`), text nodes inside `div`/`span`, and `aria-label`/`placeholder` attributes
- `setFieldValue()` dispatches native `InputEvent` and triggers Angular's internal `_onChange` / `control.setValue` via `__ngContext__`

**`popup.html/js`** - Standard browser action popup.
- Four states: `loading`, `pick` (filing selector), `fill` (tab buttons), `offline`
- Fetches `/filings` from the bridge; falls back to `chrome.storage.local` cache

**`background.js`** - Service worker (Chrome) / background script (Firefox).
- Caches `filingsData` and `filingData` in `chrome.storage.local`
- Relays `INJECT_STEP` messages from the popup to the content script

**Extension ↔ Bridge communication:**

```
content-script.js
  fetch('http://127.0.0.1:19876/filings')
    ← PendingFiling[]

popup.js
  fetch('http://127.0.0.1:19876/filings')
    ← PendingFiling[]
  chrome.runtime.sendMessage({ type: 'INJECT_STEP', step, data })
    → background.js
      → chrome.tabs.sendMessage → content-script.js
```

---

## Database Schema (summary)

| Table | Purpose |
|---|---|
| `profile` | Single taxpayer profile row |
| `filings` | One row per filing; tracks status (Draft/Confirmed/Submitted) |
| `income_entries` | Income line items linked to a filing |
| `capital_allowances` | Asset allowance entries linked to a filing |
| `relief_entries` | Deduction/relief entries linked to a filing |
| `documents` | Document attachment metadata (path, size, type) |
| `fx_cache` | Cached FX rate lookups |
| `tax_configs` | Versioned tax configuration records |

All tables are encrypted at rest via the PIN-derived key.

---

## Key Design Decisions

**Why Tauri instead of Electron?** Tauri produces significantly smaller bundles, uses the OS WebView (no bundled Chromium), and gives us a memory-safe Rust backend for the security-critical encryption layer.

**Why a local HTTP bridge instead of native messaging?** Native messaging requires a host app registration that is OS-specific and complex to distribute. A loopback HTTP server works identically on Windows, macOS, and Linux with no installation step beyond the extension itself.

**Why Shadow DOM for the extension panel?** The LIRS e-Tax portal is an Angular SPA. Opening the browser extension popup as a separate window changes the active tab focus, which causes Angular to re-initialize the route, resetting any partially filled form. Injecting the panel as a Shadow DOM element inside the tab avoids any focus change.

**Why immutable confirmed filings?** Tax records are legal documents. Once a filing is confirmed, it should be a true record of what was computed and filed. Amendments create a new linked record; the original is never modified.
