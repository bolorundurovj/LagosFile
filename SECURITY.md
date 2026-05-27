# Security Policy

## Overview

LagosFile stores sensitive personal tax data locally on your device. This document describes the security model, data storage locations, and how to report a vulnerability.

---

## Encryption Model

### Database encryption

LagosFile uses a **PIN-derived encryption key** to protect all stored data.

- The SQLite database is encrypted at rest using a key derived from your PIN
- The key is held in memory only while the app is unlocked; it is never written to disk
- Locking the app (`Lock` action or closing the window) clears the in-memory key
- An incorrect PIN produces no usable key; the database cannot be read

### What is encrypted

Everything stored in the SQLite database is encrypted, including:

- Taxpayer profile (name, TIN, address, contact details)
- All filing records, income entries, capital allowances, and relief entries
- Computed tax values and filing references
- FX rate cache
- Tax configuration records
- PIN verification hash and recovery question answers

### What is NOT encrypted

- Attached documents (PDF, images) stored on the filesystem are stored as plain files at `~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/`. If you need filesystem-level encryption for these files, use your OS's built-in disk encryption (BitLocker, FileVault, LUKS).
- Application logs: avoid including sensitive values in log output.

### PIN recovery

Security question answers are hashed before storage. Recovery answers are never stored in plaintext. The recovery flow re-derives a new encryption key and re-encrypts the database.

---

## Data Storage Locations

| Data | Location |
|---|---|
| Encrypted database | `~/LagosFile/lagosfile.db` (platform app data dir) |
| Attached documents | `~/LagosFile/documents/<TIN>/<YOA>/<entry_id>/` |
| Database backup | User-selected path via save dialog |
| Extension storage | Chrome/Firefox local extension storage (filing references only, no PII) |

LagosFile is **fully offline**. No personal data is transmitted to any server. The only outbound network requests are:

- FX rate API calls (currency + date only, no personal data)
- The LIRS e-Tax portal (opened in your browser; LagosFile does not proxy or intercept this traffic)

---

## Local HTTP Bridge

When you click **File with LIRS**, LagosFile starts a temporary HTTP server on `127.0.0.1:19876`. This bridge:

- Binds to loopback only; not accessible from other machines on your network
- Serves filing data for the browser extension to read
- Shuts down when the LIRS portal session ends

The bridge exposes computed filing values (income totals, tax figures) to `localhost`. It does not expose raw database content or your PIN.

---

## Browser Extension

The **LagosFile for LIRS** extension communicates only with `127.0.0.1:19876` and the LIRS e-Tax portal domains (`etax.lirs.gov.ng`, `etax.lirs.net`). It does not send data to any third-party service.

The extension injects a Shadow DOM panel into the LIRS portal page. It does not read or modify any data on that page other than filling the tax form fields with your pre-computed values.

---

## Responsible Disclosure

If you discover a security vulnerability in LagosFile, please report it privately rather than opening a public issue.

**Contact:** [bolorundurovb@gmail.com](mailto:bolorundurovb@gmail.com)

Please include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional)

We will acknowledge your report within 5 business days and aim to release a fix within 30 days for confirmed vulnerabilities.

---

## Recommendations for Users

- **Use a strong PIN** - LagosFile does not enforce a minimum PIN length, but a longer PIN significantly increases key strength.
- **Back up your database** regularly using the built-in Backup feature. Store the backup in a location separate from your device.
- **Enable OS disk encryption** (BitLocker, FileVault, LUKS) to protect attached documents and the database file against physical device access.
- **Do not share your backup file** - it is encrypted, but the PIN is the only protection.
- **Keep the app updated** - security fixes will be noted in the changelog.
