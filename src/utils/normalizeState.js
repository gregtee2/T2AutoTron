//src/utils/normalizeState.js

module.exports = (state) => {
  if (!state) return null;
  const { on, bri, hue, sat, ct, xy, brightness, saturation, colorTemp, offline, ip } = state;
  return {
    on: on ?? false,
    bri: bri ?? brightness ?? null,
    hue: hue ?? null,
    sat: sat ?? saturation ?? null,
    ct: ct ?? colorTemp ?? null,
    xy: xy ? [xy[0], xy[1]] : null,
    offline: offline ?? false,
    ip: ip ?? null,
  };
};