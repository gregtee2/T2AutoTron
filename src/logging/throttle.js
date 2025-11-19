src/logging/throttle.js

const lastLogged = new Map();
const THROTTLE_MS = 5 * 60 * 1000;

module.exports = {
  throttleLog: (key, callback) => {
    const now = Date.now();
    const last = lastLogged.get(key) || 0;
    if (now - last >= THROTTLE_MS) {
      lastLogged.set(key, now);
      callback();
    }
  },
};