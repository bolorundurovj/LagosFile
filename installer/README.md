# Custom installer (PolyInstall) — BETA

This folder adds an **optional, experimental** custom Windows install experience on
top of the standard release. It wraps the already-built Tauri binary in a guided
[PolyInstall](https://github.com/bolorundurowb/PolyInstall) wizard:

```
welcome  ->  EULA  ->  choose location  ->  install  ->  finish
```

plus Start Menu and Desktop shortcuts, and proper **Add/Remove Programs**
registration with a real `Uninstall.exe`.

It does **not** replace the native `.msi` / NSIS installer produced by the main
release pipeline. It ships as an extra asset named
`LagosFile-<version>-custom-setup-beta.exe`.

## Why "beta"

This is here so we can try a nicer install flow and decide whether it is worth
keeping. It is deliberately isolated and **non-blocking**: if the build fails it
never fails a release, and removing it is a two-step delete (see below).

## Files

- `lagosfile.polyinstall.yaml` — the installer manifest (Windows x64).
- `payload/branding/wordmark.svg` — logo shown in the wizard header.
- `payload/LICENSE.txt` — EULA text shown in the wizard (refreshed from the root
  `LICENSE` during CI; the committed copy is just a fallback for local builds).

The matching CI workflow lives at
`.github/workflows/release-custom-installer.yml`.

## How it runs in CI

The workflow triggers on:

- **push to `feat/new-installer`** — builds the installer and uploads it as a
  workflow **artifact only** (no GitHub Release is created or modified). This is
  how you test it on the branch without cutting a tag.
- **a version tag** (`vX.Y.Z` / `vX.Y.Z-*`) — also **attaches** the setup `.exe`
  to that release.
- **manual dispatch** — on demand.

## Build locally (Windows)

```bash
# 1. Build the app binary (skips native bundlers)
npm run tauri -- build --no-bundle

# 2. Get PolyInstall (win-x64) from its releases and put polyinstall.exe on PATH
#    https://github.com/bolorundurowb/PolyInstall/releases

# 3. Stage the license and build the installer
cp LICENSE installer/payload/LICENSE.txt
set LAGOSFILE_VERSION=1.1.1   # or: export LAGOSFILE_VERSION=1.1.1 (bash)
polyinstall build installer/lagosfile.polyinstall.yaml --base .
```

The setup `.exe` lands in `dist-installer/` (git-ignored).

## Notes / knobs

- **Per-user vs all-users**: the manifest uses `install_scope: user` (no UAC
  prompt, installs under the user profile). Switch to `machine` for an all-users
  install under Program Files + HKLM (requires elevation).
- **Unsigned**: like the native installers, this build is unsigned, so Windows
  SmartScreen will warn on first run until the project earns reputation or a
  signing certificate is configured (`build.signing` in the manifest).
- **PolyInstall version**: pinned to `v2.0.0` in the workflow. Bump both the
  action ref and the `version` input together when upgrading.

## To drop the experiment entirely

1. Delete this `installer/` folder.
2. Delete `.github/workflows/release-custom-installer.yml`.

Optionally remove the `dist-installer/` and `installer/polyinstall*` lines from
the root `.gitignore`. Nothing else in the repo depends on any of this.
