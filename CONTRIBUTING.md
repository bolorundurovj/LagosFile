# Contributing to LagosFile

Thank you for taking an interest in contributing. This guide covers how to set up a development environment, how the codebase is structured, and the conventions we follow for branches, commits, and pull requests.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Running the App](#running-the-app)
4. [Building the Browser Extension](#building-the-browser-extension)
5. [Branch Strategy](#branch-strategy)
6. [Commit Conventions](#commit-conventions)
7. [Pull Request Process](#pull-request-process)
8. [Code Style](#code-style)
9. [Testing](#testing)

---

## Development Setup

### Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later (comes with Node 20)
- **Rust** stable toolchain - install via [rustup](https://rustup.rs/)
- **Tauri system dependencies** for your OS - follow the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### First-time setup

```bash
git clone https://github.com/bolorundurovj/LagosFile.git
cd LagosFile
npm install
```

Rust dependencies are resolved automatically by Cargo when you first run `tauri dev` or `tauri build`.

---

## Project Structure

```
lagosfile/
├── src/                        # Angular 19 frontend
│   └── app/
│       ├── core/
│       │   ├── models/         # TypeScript interfaces and types
│       │   ├── services/       # Angular services (Tauri bridge, LIRS, FX, etc.)
│       │   └── guards/         # Route guards (pin-lock, profile)
│       ├── features/           # One directory per page/feature
│       │   ├── dashboard/
│       │   ├── filing-wizard/
│       │   ├── filing-history/
│       │   ├── configuration/
│       │   └── ...
│       └── shared/             # Reusable components, pipes, directives
├── src-tauri/
│   └── src/
│       ├── commands/           # Tauri #[tauri::command] handlers
│       │   ├── auth.rs
│       │   ├── filing.rs
│       │   ├── lirs.rs         # LIRS HTTP bridge
│       │   ├── export.rs
│       │   └── ...
│       ├── db/                 # Database connection and migrations
│       ├── models/             # Shared Rust structs (serde)
│       └── services/           # Pure Rust business logic
├── extension/
│   ├── chrome/                 # Chrome MV3 source
│   ├── firefox/                # Firefox MV2 source
│   └── shared/                 # Shared utilities (synced to both)
├── docs/                       # Markdown documentation
└── scripts/
    └── pack-extensions.mjs     # Extension packaging script
```

---

## Running the App

### Full app (Angular + Tauri)

```bash
npm run tauri:dev
```

This starts the Angular dev server and opens a Tauri window pointed at it. The Rust backend compiles on first run; subsequent starts are faster.

### Angular only (no Tauri window)

```bash
npm start
```

Useful for UI-only work. Tauri commands will not be available.

### Angular unit tests

```bash
npm test
```

---

## Building the Browser Extension

The extension source lives in `extension/chrome/` and `extension/firefox/`. Changes to `extension/shared/` must be manually synced (or run the pack script which handles it).

```bash
# Pack both
npm run pack:ext

# Pack Chrome only → dist-ext/chrome-lagosfile-lirs.zip
npm run pack:ext:chrome

# Pack Firefox only → dist-ext/firefox-lagosfile-lirs.xpi
npm run pack:ext:firefox
```

> **Note:** `dist-ext/` is gitignored. Do not commit built extension packages.

### Loading unpacked in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `extension/chrome/`

### Loading in Firefox

1. Go to `about:debugging` → This Firefox
2. Click **Load Temporary Add-on**
3. Select any file inside `extension/firefox/` (e.g. `manifest.json`)

---

## Branch Strategy

| Branch pattern | Purpose |
|---|---|
| `master` | Stable, release-ready code |
| `feat/<short-description>` | New features |
| `fix/<short-description>` | Bug fixes |
| `chore/<short-description>` | Tooling, deps, refactors with no user-facing change |
| `docs/<short-description>` | Documentation-only changes |

Keep branches short-lived. Open a PR into `master` when the work is ready for review.

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <short summary>

[optional body, use multiple -m flags in Windows cmd]

[optional footer]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `chore` | Build, tooling, dependency update |
| `docs` | Documentation only |
| `refactor` | Code restructure with no behaviour change |
| `test` | Adding or fixing tests |
| `perf` | Performance improvement |

### Scopes (optional but helpful)

`app`, `ext`, `tauri`, `db`, `lirs`, `export`, `fx`, `auth`, `config`

### Examples

```bash
git commit -m "feat(lirs): inject floating panel into LIRS portal page"
git commit -m "fix(ext): expand WHT label variants to match portal DOM"
git commit -m "chore: update gitignore to exclude dist-ext/"
git commit -m "docs: add architecture overview"
```

### Multiline commit messages on Windows cmd

Use multiple `-m` flags; each becomes a paragraph in the commit body:

```bat
git commit -m "feat(lirs): implement multi-filing bridge" -m "- Serves /filings array at port 19876" -m "- Extension picker shows all confirmed filings"
```

---

## Pull Request Process

1. Make sure `npm run tauri:dev` builds and runs without errors
2. Run `npm test` and confirm all tests pass
3. Open a PR against `master` with a clear title following the commit convention
4. Include a short description of what changed and why
5. Link any relevant issue or task

PRs that only touch documentation or the extension do not need a full Tauri build verification, but Angular must still compile cleanly (`npm run build`).

---

## Code Style

### Angular / TypeScript

- Standalone components only (no NgModules)
- `inject()` function over constructor injection
- `async/await` over raw Promise chains
- Avoid `any`; use the models in `src/app/core/models/`
- Component selectors prefixed with `lf-` (e.g. `lf-filing-card`)

### Rust

- Run `cargo fmt` before committing
- Use `thiserror` for error types; avoid `unwrap()` in command handlers
- All Tauri commands return `Result<T, String>`; map errors to human-readable messages
- Struct field names use `snake_case` in Rust and are serialized to `camelCase` for the frontend via `#[serde(rename_all = "camelCase")]`

### Extension

- No build step; plain ES2020 JavaScript
- All panel UI lives inside a Shadow DOM root to prevent style leakage
- Label matching uses the `byLabel` helper in `content-script.js`; add new variants to the `MAPPINGS` object rather than duplicating logic

---

## Testing

Angular unit tests use **Jasmine + Karma**:

```bash
npm test
```

There are currently no Rust unit tests, but Tauri command handlers should be tested via the Angular service layer using mocked `TauriService` responses.

When adding a new Tauri command:
1. Add the `#[tauri::command]` function in `src-tauri/src/commands/`
2. Register it in `src-tauri/src/lib.rs` → `invoke_handler`
3. Add the corresponding method to the Angular service in `src/app/core/services/`
