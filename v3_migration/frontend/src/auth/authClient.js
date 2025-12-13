const PIN_STORAGE_KEY = 't2app-pin';
const PIN_REMEMBER_KEY = 't2app-pin-remember';

const safeStorageGet = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (storage, key, value) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeStorageRemove = (storage, key) => {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const getPinRememberPreference = () => safeStorageGet(localStorage, PIN_REMEMBER_KEY) === 'true';

export const getStoredPin = () => {
  const remember = getPinRememberPreference();
  const storage = remember ? localStorage : sessionStorage;
  const pin = safeStorageGet(storage, PIN_STORAGE_KEY);
  return (pin || '').trim() || null;
};

export const clearStoredPin = () => {
  safeStorageRemove(sessionStorage, PIN_STORAGE_KEY);
  safeStorageRemove(localStorage, PIN_STORAGE_KEY);
  safeStorageRemove(localStorage, PIN_REMEMBER_KEY);
  window.dispatchEvent(new CustomEvent('t2-pin-changed', { detail: { hasPin: false } }));
};

export const setStoredPin = (pin, { remember } = {}) => {
  const normalizedPin = (pin || '').toString().trim();
  const shouldRemember = typeof remember === 'boolean' ? remember : getPinRememberPreference();

  if (!normalizedPin) {
    clearStoredPin();
    if (typeof remember === 'boolean') {
      safeStorageSet(localStorage, PIN_REMEMBER_KEY, remember ? 'true' : 'false');
    }
    return;
  }

  safeStorageSet(localStorage, PIN_REMEMBER_KEY, shouldRemember ? 'true' : 'false');

  if (shouldRemember) {
    safeStorageSet(localStorage, PIN_STORAGE_KEY, normalizedPin);
    safeStorageRemove(sessionStorage, PIN_STORAGE_KEY);
  } else {
    safeStorageSet(sessionStorage, PIN_STORAGE_KEY, normalizedPin);
    safeStorageRemove(localStorage, PIN_STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent('t2-pin-changed', { detail: { hasPin: true } }));
};

import { apiUrl } from '../utils/apiBase';

// Re-export apiUrl for convenience
export { apiUrl };

// Simple fetch wrapper that handles ingress base path (no auth)
export const apiFetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? apiUrl(input) : input;
  return fetch(url, init);
};

export const authFetch = async (input, init = {}) => {
  const pin = getStoredPin();
  // Wrap URL with apiUrl for HA ingress compatibility
  const url = typeof input === 'string' ? apiUrl(input) : input;
  
  if (!pin) return fetch(url, init);

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || undefined);
  headers.set('X-APP-PIN', pin);

  return fetch(url, { ...init, headers });
};
