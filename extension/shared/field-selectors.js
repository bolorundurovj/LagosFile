/**
 * Find an input by its `name` attribute (most stable selector).
 * @param {string} pattern - Substring to match in the name attribute.
 * @returns {HTMLElement|null}
 */
function byName(pattern) {
  return document.querySelector(`[name*="${pattern}"]`) || null;
}

/**
 * Find an element by `aria-label` or `aria-labelledby`.
 * @param {string} labelText - Substring to match.
 * @returns {HTMLElement|null}
 */
function byAriaLabel(labelText) {
  return document.querySelector(
    `[aria-label*="${labelText}"], [aria-labelledby*="${labelText}"]`
  ) || null;
}

/**
 * Find a form field by its associated label text.
 * Scans <label> elements, checks `for` attribute, sibling input,
 * and nested inputs within the label's parent.
 * @param {string} labelText - Substring to match in label text.
 * @param {string} [elementType='input'] - HTML tag to look for.
 * @returns {HTMLElement|null}
 */
function byLabelText(labelText, elementType = 'input') {
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
      // Check `for` attribute
      const forId = label.getAttribute('for');
      if (forId) {
        const el = document.querySelector(`#${CSS.escape(forId)}`);
        if (el) return el;
      }
      // Check next sibling
      const sibling = label.nextElementSibling;
      if (sibling && sibling.tagName === elementType.toUpperCase()) return sibling;
      // Check nested input
      const nested = label.parentElement?.querySelector(elementType);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Find a select dropdown by its associated label text.
 * @param {string} labelText - Substring to match in label text.
 * @returns {HTMLSelectElement|null}
 */
function selectByLabelText(labelText) {
  const label = [...document.querySelectorAll('label')].find(
    (l) => l.textContent.trim().toLowerCase().includes(labelText.toLowerCase())
  );
  if (!label) return null;

  let select = null;
  const forId = label.getAttribute('for');
  if (forId) {
    select = document.querySelector(`#${CSS.escape(forId)}`);
  }
  if (!select) {
    select =
      label.closest('div')?.querySelector('select') ||
      (label.nextElementSibling?.tagName === 'SELECT' ? label.nextElementSibling : null);
  }
  return select;
}

/**
 * Set a select dropdown to a specific option value.
 * @param {HTMLSelectElement} select - The select element.
 * @param {string} optionValue - Value to match (by value or text content).
 * @returns {boolean}
 */
function setSelectValue(select, optionValue) {
  if (!select) return false;
  const option = [...select.options].find(
    (o) =>
      o.value === optionValue ||
      o.textContent.toLowerCase().includes(optionValue.toLowerCase())
  );
  if (!option) return false;

  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  select.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Wait for a selector to appear in the DOM (for SPA navigation).
 * @param {string} selector
 * @param {number} [timeout=10000]
 * @returns {Promise<Element|null>}
 */
function waitForSelector(selector, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 200);
    }
    check();
  });
}

// Expose to global scope for content script use
if (typeof window !== 'undefined') {
  window.__lirsSelectors = { byName, byAriaLabel, byLabelText, selectByLabelText, setSelectValue, waitForSelector };
}
