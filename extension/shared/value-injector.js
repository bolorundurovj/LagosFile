// ── Framework-Aware Value Injection ────────────────────────
// Standard `input.value = 'x'` does NOT trigger React/Angular change
// detection. This module fires the correct synthetic events after
// setting the native value.

/**
 * Set a form field's value and fire all the events needed for
 * React (__reactFiber), Angular (ngControl), and native DOM
 * frameworks to register the change.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement} inputElement
 * @param {string|number} value
 */
function setFieldValue(inputElement, value) {
  if (!inputElement) return false;

  const cleanValue = String(value).replace(/,/g, '').trim();

  // Step 1: Focus the element
  inputElement.focus();

  // Step 2: Set raw value via native setter (bypasses React's synthetic value)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(inputElement, cleanValue);
  } else {
    inputElement.value = cleanValue;
  }

  // Step 3: Dispatch standard DOM events
  inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  inputElement.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  // Step 4: React fiber — trigger onChange via __reactFiber / __reactInternalInstance
  const reactKey = Object.keys(inputElement).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  if (reactKey) {
    const fiber = inputElement[reactKey];
    const props = fiber?.memoizedProps || fiber?.return?.memoizedProps;
    if (props?.onChange) {
      try {
        const syntheticEvent = new Event('input', { bubbles: true, composed: true });
        Object.defineProperty(syntheticEvent, 'target', { value: inputElement, writable: false });
        props.onChange(syntheticEvent);
      } catch (_) {
        // onChange threw — framework may still have registered the value
      }
    }
    // Also try stateNode for newer React versions
    if (fiber?.stateNode) {
      const instance = fiber.stateNode;
      if (instance?.onChange) {
        try {
          instance.onChange({ target: inputElement });
        } catch (_) {}
      }
    }
  }

  // Step 5: Angular — trigger via ngControl / valueAccessor
  const ngControl = inputElement['ngControl'] || inputElement['__ngContext__']?.ngControl;
  if (ngControl?.valueAccessor?.writeValue) {
    ngControl.valueAccessor.writeValue(cleanValue);
  } else if (ngControl?.valueAccessor?.setValue) {
    ngControl.valueAccessor.setValue(cleanValue);
  }

  // Step 6: Also try dispatching keyboard events (some frameworks listen for keyup)
  inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));

  // Step 7: Blur to trigger validation
  inputElement.dispatchEvent(new Event('blur', { bubbles: true }));

  return true;
}

/**
 * Inject a value into a field found by a selector function.
 * @param {Function} finderFn - A selector function like byName or byLabelText
 * @param {string|string[]} args - Arguments to pass to the finder function
 * @param {string|number} value - The value to inject
 * @returns {{ found: boolean, injected: boolean }}
 */
function injectField(finderFn, args, value) {
  const el = finderFn(...(Array.isArray(args) ? args : [args]));
  if (!el) return { found: false, injected: false };
  const injected = setFieldValue(el, value);
  return { found: true, injected };
}

/**
 * Inject a select/dropdown value.
 * @param {string} labelText - Label text to find the select.
 * @param {string} optionValue - Option value to select.
 * @returns {{ found: boolean, injected: boolean }}
 */
function injectSelect(labelText, optionValue) {
  const select = selectByLabelText(labelText);
  if (!select) return { found: false, injected: false };
  const injected = setSelectValue(select, optionValue);
  return { found: true, injected };
}

if (typeof window !== 'undefined') {
  window.__lirsInjector = { setFieldValue, injectField, injectSelect };
}
