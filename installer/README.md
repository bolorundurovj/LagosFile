# Windows installer (PolyInstall)

This folder builds the guided Windows installer shipped with every release. It
wraps the Tauri binary in a [PolyInstall](https://github.com/bolorundurowb/PolyInstall)
wizard:

```
welcome  ->  EULA  ->  choose location  ->  install  ->  finish
```

plus Start Menu and Desktop shortcuts, and **Add/Remove Programs** registration
with a real `Uninstall.exe`.

It ships alongside the native `.msi` / NSIS installers as
`LagosFile-<version>-windows-x64-installer.exe`.

## Files

- `lagosfile.polyinstall.yaml` — the installer manifest (Windows x64).
- `payload/branding/wordmark.svg` — logo shown in the wizard header.
- `payload/LICENSE.txt` — EULA text shown in the wizard (refreshed from the root
  `LICENSE` during CI; the committed copy is just a fallback for local builds).

## How it runs in CI

The `build-installer` job in `.github/workflows/release.yml` runs on every version
tag (`vX.Y.Z` / `vX.Y.Z-*`) and on manual dispatch. Its output is published with
the rest of the release assets once all build jobs succeed.

## Build locally (Windows)

```bash
# 1. Build the app binary (skips native bundlers)
npm run tauri -- build --no-bundle

# 2. Get PolyInstall (win-x64) from its releases and put polyinstall.exe on PATH
#    https://github.com/bolorundurowb/PolyInstall/releases

# 3. Stage the license and build the installer
cp LICENSE installer/payload/LICENSE.txt
set LAGOSFILE_VERSION=1.2.0   # or: export LAGOSFILE_VERSION=1.2.0 (bash)
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
- **PolyInstall version**: pinned to `v2.0.0` in `release.yml`. Bump both the
  action ref and the `version` input together when upgrading.
