// ── Shared Utilities ──────────────────────────────────────

/**
 * Detect which step/route the user is on within the LIRS portal.
 * @returns {'income'|'accommodation'|'deductions'|'documents'|'login'|'dashboard'|'other'}
 */
function detectRoute() {
  const url = window.location.pathname + window.location.hash;
  const urlLower = url.toLowerCase();

  if (urlLower.includes('/login') || urlLower.includes('/signin')) return 'login';
  if (urlLower.includes('/dashboard')) return 'dashboard';

  if (urlLower.includes('tax-calculator') || urlLower.includes('assessments') || urlLower.includes('annual-returns')) {
    // Check which step is visible by looking for specific field markers
    const stepMarkers = {
      income:       document.querySelector('[name*="salary"]') || document.querySelector('label[for*="salary"]'),
      accommodation: document.querySelector('[name*="accommodation"]') || document.querySelector('[aria-label*="Accommodation"]'),
      deductions:   document.querySelector('[name*="pension"]') || document.querySelector('[aria-label*="Pension"]'),
      documents:    document.querySelector('input[type="file"]'),
    };

    for (const [step, el] of Object.entries(stepMarkers)) {
      if (el) return step;
    }
    return 'income'; // default to first step
  }

  return 'other';
}

/**
 * Show a floating notification on the page.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} [type='info']
 * @param {number} [duration=5000]
 */
function showNotification(message, type = 'info', duration = 5000) {
  // Remove any existing notification
  const existing = document.getElementById('__lagosfile_notification');
  if (existing) existing.remove();

  const colors = {
    info:    { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    success: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    error:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    warning: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  };

  const style = colors[type] || colors.info;

  const el = document.createElement('div');
  el.id = '__lagosfile_notification';
  Object.assign(el.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '999999',
    padding: '12px 20px',
    borderRadius: '8px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    maxWidth: '400px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    background: style.bg,
    color: style.text,
    border: `1px solid ${style.border}`,
    transition: 'opacity 0.3s ease',
    opacity: '1',
  });
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/**
 * Log to the extension's internal log and optionally to console.
 * @param {string} level
 * @param {string} message
 * @param {object} [data]
 */
function extensionLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, data: data || null };
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['errorLog'], (result) => {
      const log = result.errorLog || [];
      log.push(entry);
      // Keep last 100 entries
      if (log.length > 100) log.shift();
      chrome.storage.local.set({ errorLog: log });
    });
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[LagosFile] ${message}`, data || '');
}

/**
 * Format a number as Nigerian Naira.
 * @param {number} n
 * @returns {string}
 */
function formatNaira(n) {
  if (n == null || isNaN(n)) return '₦0.00';
  const parts = Math.abs(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return `₦${parts[0]}.${parts[1]}`;
}

/**
 * Copy text to clipboard and optionally show a notification.
 * @param {string} text
 * @param {string} [label]
 */
function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification(label ? `Copied: ${label}` : 'Copied to clipboard', 'success', 2000);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showNotification(label ? `Copied: ${label}` : 'Copied to clipboard', 'success', 2000);
  });
}

if (typeof window !== 'undefined') {
  window.__lirsUtils = { detectRoute, showNotification, extensionLog, formatNaira, copyToClipboard };
}
