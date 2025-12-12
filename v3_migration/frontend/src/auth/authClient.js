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

export const authFetch = async (input, init = {}) => {
  const pin = getStoredPin();
  if (!pin) return fetch(input, init);

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || undefined);
  headers.set('X-APP-PIN', pin);

  return fetch(input, { ...init, headers });
};
