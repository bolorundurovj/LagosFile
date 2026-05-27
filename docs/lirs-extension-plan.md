# LIRS e-Tax Browser Extension — Implementation Plan

## Overview

LagosFile supplements its local tax filing workflow with browser extensions (Chrome and Firefox) that auto-populate Form A on the LIRS e-Tax portal (`etax.lirs.gov.ng`). Because LIRS exposes no public REST API for individual Form A submissions, the extension uses DOM manipulation via content scripts to read computed filing data from LagosFile and inject it into the portal's form fields.

The extension operates as a semi-automated assistant — it pre-fills fields and provides copy-to-clipboard support, but the user always reviews and submits directly on the LIRS portal. This keeps the taxpayer in full control of their submission.

---

## 1. Architecture

### 1.1 System Diagram

```
LagosFile (Tauri)                  Browser Extension
┌──────────────────┐               ┌────────────────────┐
│ ComputationEngine│               │  Background Script  │
│        │         │   write JSON  │        │           │
│        ▼         │──────────────►│  Content Script    │
│  pending_filing   │               │        │           │
│  .json           │               │        ▼           │
└──────────────────┘               └────────┬───────────┘
                                            │
                                            ▼
                                 ┌────────────────────┐
                                 │ LIRS e-Tax Portal   │
                                 │ etax.lirs.gov.ng    │
                                 └────────────────────┘
```

### 1.2 Components

| Component | Platform | Purpose |
|---|---|---|
| LagosFile App | Tauri (Rust) | Computes tax, stores filing data, writes shared JSON |
| Chrome Extension | JS/Manifest V3 | Reads filing data, injects into LIRS portal |
| Firefox Extension | JS/Manifest V2 | Same as Chrome, Firefox-compatible APIs |
| Shared Filing JSON | File system | Intermediate store: ~/LagosFile/pending_filing.json |
| Local HTTP Server | Rust (Axum) | Optional fast-path alternative to file reads |

### 1.3 Data Flow

1. User completes filing in LagosFile, clicks "File with LIRS"
2. LagosFile opens browser to `https://etax.lirs.gov.ng/filing/annual-returns`
3. LagosFile writes computed filing data to `~/LagosFile/pending_filing.json`
4. User logs into portal manually (extension cannot bypass reCAPTCHA)
5. On Form A page load, content script detects route and reads pending_filing.json
6. Content script injects values into form fields using framework-aware DOM manipulation
7. User reviews and submits on the portal
8. User returns to LagosFile and clicks "Mark as Submitted"

---

## 2. Extension Specification

### 2.1 Chrome Manifest (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "LagosFile for LIRS",
  "version": "1.0.0",
  "description": "Auto-populate LIRS Form A from LagosFile computed tax data",
  "permissions": ["storage", "activeTab", "nativeMessaging"],
  "host_permissions": ["https://etax.lirs.gov.ng/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png" }
  },
  "content_scripts": [{
    "matches": ["https://etax.lirs.gov.ng/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }],
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "128": "icons/128.png"
  }
}
```

### 2.2 Firefox Manifest (Manifest V2)

```json
{
  "manifest_version": 2,
  "name": "LagosFile for LIRS",
  "version": "1.0.0",
  "description": "Auto-populate LIRS Form A from LagosFile computed tax data",
  "permissions": ["nativeMessaging", "activeTab", "storage", "https://etax.lirs.gov.ng/*"],
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "browser_action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png" }
  },
  "content_scripts": [{
    "matches": ["https://etax.lirs.gov.ng/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }],
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "128": "icons/128.png"
  }
}
```

### 2.3 Shared Filing JSON Schema

Written by LagosFile to `~/LagosFile/pending_filing.json`:

```json
{
  "filingId": "uuid-v4",
  "taxpayer": {
    "fullName": "John Doe",
    "tin": "1234567890123",
    "payerId": "N-1234567"
  },
  "yearOfAssessment": 2025,
  "filingReference": "LIRS/REF/2025/00001",
  "income": {
    "employment": 5500000,
    "business": 1200000,
    "rental": 600000,
    "dividend": 0,
    "interest": 45000,
    "capitalGain": 0,
    "digitalAsset": 0,
    "royalty": 0,
    "prize": 0,
    "other": 0,
    "foreignIncome": {
      "totalUsd": 24000,
      "currency": "USD",
      "fxRateUsed": 1550,
      "fxRateSource": "CBN Override",
      "nairaEquivalent": 37200000
    }
  },
  "accommodation": {
    "type": "rent",
    "ownership": "tenant",
    "rentPaid": 2400000,
    "rentPaidByEmployer": 0,
    "dateStarted": "2025-01-01",
    "dateEnd": "2025-12-31"
  },
  "deductions": {
    "pension": 440000,
    "nhf": 137500,
    "nhis": 75000,
    "lifeAssurance": 0,
    "rentReliefApplied": 480000
  },
  "computation": {
    "totalGrossIncome": 7360000,
    "totalCapitalAllowances": 0,
    "chargeableIncome": 6238500,
    "graduatedTax": 983955,
    "whtCredits": 0,
    "netTaxPayable": 983955,
    "minimumTax": 73600,
    "finalTaxPayable": 983955,
    "configVersion": "NTA2025-v1.0"
  },
  "documents": {
    "payslip": "~/LagosFile/documents/TIN/2025/income/payslip.pdf",
    "rentReceipt": "~/LagosFile/documents/TIN/2025/deductions/rent_receipt.pdf"
  },
  "generatedAt": "2026-01-15T10:30:00Z"
}
```

---

## 3. Content Script — Field Injection Logic

### 3.1 Route Detection

```javascript
const detectRoute = () => {
  const url = window.location.pathname + window.location.hash;

  if (url.includes('/filing/annual-returns')) {
    const stepMarkers = {
      income:    document.querySelector('[name*="salary"]') || document.querySelector('label[for*="salary"]'),
      housing:    document.querySelector('[name*="accommodation"]') || document.querySelector('[aria-label*="Accommodation"]'),
      exemptions: document.querySelector('[name*="pension"]') || document.querySelector('[aria-label*="Pension"]'),
      documents:  document.querySelector('input[type="file"]'),
    };

    for (const [step, el] of Object.entries(stepMarkers)) {
      if (el) return step;
    }
    return 'income'; // default to first step
  }

  if (url.includes('/login')) return 'login';
  if (url.includes('/dashboard')) return 'dashboard';
  return 'other';
};
```

### 3.2 Selector Strategy

DO NOT use #id selectors — LIRS uses dynamic framework-generated IDs. Priority cascade:

1. `name` attribute (most stable)
2. `aria-label` or `aria-labelledby`
3. Label text + sibling input traversal
4. Data-testid attributes
5. XPath as last resort

```javascript
const byLabelText = (labelText, elementType = 'input') => {
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
      const forId = label.getAttribute('for');
      if (forId) {
        const el = document.querySelector(`#${forId}`);
        if (el) return el;
      }
      const sibling = label.nextElementSibling;
      if (sibling?.tagName === elementType.toUpperCase()) return sibling;
      const nested = label.parentElement?.querySelector(elementType);
      if (nested) return nested;
    }
  }
  return null;
};

const byAriaLabel = (labelText) =>
  document.querySelector(`[aria-label*="${labelText}"],[aria-labelledby*="${labelText}"]`);

const byName = (namePattern) =>
  document.querySelector(`[name*="${namePattern}"]`);
```

### 3.3 Framework-Aware Value Injection

Standard `input.value = 'x'` does NOT trigger React/Angular change detection. Use this sequence every time:

```javascript
const setFieldValue = (inputElement, value) => {
  const cleanValue = String(value).replace(/,/g, '').trim();
  inputElement.focus();

  // Step 1: Set raw value
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(inputElement, cleanValue);

  // Step 2: Dispatch standard DOM events
  inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  inputElement.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  // Step 3: React fiber — access __reactFiber or __reactInternalInstance
  const reactKeys = Object.keys(inputElement).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  if (reactKeys) {
    const fiber = inputElement[reactKeys];
    const props = fiber?.memoizedProps;
    if (props?.onChange) {
      const syntheticEvent = new Event('input', { bubbles: true, composed: true });
      syntheticEvent.nativeEvent = syntheticEvent;
      props.onChange(syntheticEvent);
    }
  }

  // Step 4: Angular — trigger via valueAccessor
  const ngControl = inputElement['ngControl'];
  if (ngControl?.valueAccessor?.setValue) {
    ngControl.valueAccessor.setValue(cleanValue);
  }
};
```

### 3.4 Dropdown (Select) Handling

```javascript
const selectByLabelText = (labelText, optionValue) => {
  const label = [...document.querySelectorAll('label')]
    .find(l => l.textContent.trim().toLowerCase().includes(labelText.toLowerCase()));
  if (!label) return false;

  let select = label.getAttribute('for')
    ? document.querySelector(`#${label.getAttribute('for')}`)
    : null;
  if (!select) {
    select = label.closest('div')?.querySelector('select') ||
             (label.nextElementSibling?.tagName === 'SELECT' ? label.nextElementSibling : null);
  }
  if (!select) return false;

  const option = [...select.options].find(o =>
    o.value === optionValue ||
    o.textContent.toLowerCase().includes(optionValue.toLowerCase())
  );
  if (!option) return false;

  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};
```

---

## 4. Field Mappings

### 4.1 Step 1 — Income Declaration

| Target Label | Selector Strategy | Data Source | Notes |
|---|---|---|---|
| Salary / Gross Income | byName('salary') or byLabelText('salary') | income.employment | Strip commas |
| Trade / Business Income | byName('business') or byLabelText('business') | income.business | |
| Rental Income | byName('rental') or byLabelText('rental') | income.rental | |
| Dividend Income | byName('dividend') or byLabelText('dividend') | income.dividend | |
| Interest Income | byName('interest') or byLabelText('interest') | income.interest | |
| Capital Gains | byName('capital') or byLabelText('capital gain') | income.capitalGain | |
| Digital Asset | byName('digital') or byLabelText('digital asset') | income.digitalAsset | |
| Royalty | byName('royalty') or byLabelText('royalty') | income.royalty | |
| Other Income | byName('other') or byLabelText('other') | income.other | |
| Foreign Currency Amount | byName('foreign') or byLabelText('foreign') | income.foreignIncome.totalUsd | |
| Exchange Rate | byName('fxrate') or byLabelText('exchange rate') | income.foreignIncome.fxRateUsed | |

### 4.2 Step 2 — Accommodation & Housing

| Target Label | Selector Strategy | Data Source | Notes |
|---|---|---|---|
| Accommodation Type | selectByLabelText + "Rent" or "Owner" | accommodation.type | |
| Ownership Type | selectByLabelText + "Tenant" or "Landlord" | accommodation.ownership | |
| Rent Paid | byName('rentPaid') or byLabelText('rent paid') | accommodation.rentPaid | No commas |
| Rent Paid By Employer | byName('employerRent') or byLabelText('employer') | accommodation.rentPaidByEmployer | Usually 0 |
| Date Started | byName('dateStart') or byLabelText('start date') | accommodation.dateStarted | YYYY-MM-DD |
| Date Ended | byName('dateEnd') or byLabelText('end date') | accommodation.dateEnd | YYYY-MM-DD |

### 4.3 Step 3 — Exemptions & Deductions

| Target Label | Selector Strategy | Data Source | Notes |
|---|---|---|---|
| Pension Contribution | byName('pension') or byLabelText('pension') | deductions.pension | Employee's 8% |
| NHF Contribution | byName('nhf') or byLabelText('national housing fund') | deductions.nhf | 2.5% of gross |
| NHIS Contribution | byName('nhis') or byLabelText('health insurance') | deductions.nhis | |
| Life Assurance | byName('life') or byLabelText('life assurance') | deductions.lifeAssurance | |

### 4.4 Step 4 — Document Uploads

Extension does NOT auto-upload. Provides checklist with links to open document folders. Manual upload is the primary UX.

---

## 5. Login Automation

### 5.1 Payer ID Prefix

```javascript
const formatPayerId = (tin, entityType = 'individual') => {
  const prefix = entityType === 'individual' ? 'N-' : 'C-';
  if (tin.startsWith('N-') || tin.startsWith('C-')) return tin;
  return `${prefix}${tin}`;
};
```

### 5.2 Login Flow

1. Inject formatted Payer ID and password
2. STOP — reCAPTCHA blocks full automation
3. Show notification: "Please complete the CAPTCHA, then click the LagosFile icon to continue"
4. Listen for redirect to /dashboard as resume signal

```javascript
const handleLogin = (filingData) => {
  const payerIdInput = byName('payerId') || byLabelText('payer id');
  const passwordInput = byName('password') || byLabelText('password');

  if (!payerIdInput || !passwordInput) {
    return { success: false, reason: 'login_fields_not_found' };
  }

  setFieldValue(payerIdInput, formatPayerId(filingData.taxpayer.tin, 'individual'));
  setFieldValue(passwordInput, filingData.taxpayer.pin || '');

  showNotification('Please complete the CAPTCHA challenge, then click the LagosFile icon to continue.');
  return { success: false, reason: 'captcha_required', nextAction: 'wait_for_dashboard' };
};
```

### 5.3 reCAPTCHA Handling

- Extension CANNOT solve reCAPTCHA — it is intentionally unsolvable by bots
- Pause after injecting credentials
- Wait for user to complete CAPTCHA manually
- `waitForNavigation('/dashboard')` resumes auto-fill on successful login

---

## 6. Background Script

```javascript
let currentFiling = null;
let captchaCompleted = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_FILING_DATA') {
    currentFiling = msg.data;
    chrome.storage.local.set({ filingData: msg.data });
    sendResponse({ success: true });
  }
  if (msg.type === 'GET_FILING_DATA') {
    sendResponse(currentFiling || null);
  }
  if (msg.type === 'CAPTCHA_COMPLETE') {
    captchaCompleted = true;
    sendResponse({ success: true });
  }
  if (msg.type === 'RESET') {
    currentFiling = null;
    captchaCompleted = false;
    sendResponse({ success: true });
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.url.includes('/dashboard')) {
    captchaCompleted = true;
    chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
  }
});
```

---

## 7. Popup UI

Shows filing status, YOA, step checklist, copy buttons, and error log. One-click copy for each field group. "Open Folder" for documents step. Refresh and Reset buttons.

---

## 8. LagosFile Integration

### 8.1 Tauri Command — Open LIRS Portal

```rust
#[tauri::command]
pub async fn open_lirs_portal(app: AppHandle) -> Result<(), String> {
    write_pending_filing().await?;
    open::that("https://etax.lirs.gov.ng/filing/annual-returns").map_err(|e| e.to_string())?;
    Ok(())
}

async fn write_pending_filing() -> Result<(), String> {
    let filing = get_current_filing_data().await?;
    let path = dirs::home_dir().unwrap().join("LagosFile").join("pending_filing.json");
    let json = serde_json::to_string_pretty(&filing).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}
```

### 8.2 Mark as Submitted

Already implemented in commands/filing.rs. Only allowed on Confirmed filings.

---

## 9. Cross-Browser Compatibility

| Concern | Chrome (MV3) | Firefox (MV2) |
|---|---|---|
| Background | Service Worker | Background Page |
| WebNavigation | chrome.webNavigation | browser.webNavigation |
| Manifest | host_permissions at top level | permissions includes URLs |
| File system | file:// blocked | file:// blocked |
| nativeMessaging | extern_connectNative | browser.runtime.sendNativeMessage |

Shared code lives in `shared/` directory. Build script copies into both chrome/ and firefox/ directories with browser-specific API calls injected.

Directory structure:
```
extension/
├── shared/
│   ├── field-selectors.js
│   ├── value-injector.js
│   ├── filing-schema.js
│   └── utils.js
├── chrome/
│   ├── manifest.json, background.js, content-script.js, popup.html, icons/
└── firefox/
    ├── manifest.json, background.js, content-script.js, popup.html, icons/
```

---

## 10. Error Handling

| Error | User Message | Recovery |
|---|---|---|
| login_fields_not_found | "Could not find LIRS login form" | Manual navigation |
| form_fields_not_found | "LIRS may have updated their portal" | Copy from popup |
| captcha_required | "Complete the CAPTCHA, then click extension icon" | Wait for user |
| file_attach_failed | "Please upload documents manually" | Open folder |

Graceful degradation: if injection fails, log error, show value in popup with copy button. Reference Panel use case is never blocked.

---

## 11. Distribution

### Chrome Web Store
- $5 one-time developer fee
- $5 annual fee
- 1-3 business day review

### Firefox AMO
- Unlisted: no review required
- Listed: ~1-2 week review
- Use `web-ext sign` for CLI signing

Both support beta channels for internal testing before public release.

---

## 12. Security

1. No credentials stored in extension — reads only from shared JSON with non-sensitive computed data
2. Payer ID derived from TIN at injection time — not stored
3. No network exfiltration — only requests to etax.lirs.gov.ng
4. CSP compliant — only injects values, never exfiltrates from portal
5. reCAPTCHA integrity — extension explicitly does not attempt to solve it