const fs = require('fs');
const path = require('path');

// The color math lives inside the node's React component, so load just those functions.
function loadColorMath() {
  const src = fs.readFileSync(path.join(__dirname, '../plugins/AllInOneColorNode.js'), 'utf8');
  const extract = (name) => {
    const start = src.indexOf(`const ${name} = `);
    const end = src.indexOf('\n        };', start);
    if (start < 0 || end < 0) throw new Error(`Could not find ${name}`);
    return src.slice(start, end + 11);
  };
  const body = ['calculateRGBFromTMI', 'calculateTMIFromRGB', 'kelvinToRGB'].map(extract).join('\n');
  return new Function(`${body}\nreturn { calculateRGBFromTMI, calculateTMIFromRGB, kelvinToRGB };`)();
}

describe('All-in-One Color math', () => {
  const { calculateRGBFromTMI, calculateTMIFromRGB, kelvinToRGB } = loadColorMath();

  test('RGB round-trips exactly through Temperature/Tint at any brightness', () => {
    for (const rgb of [[255, 0, 0], [180, 140, 100], [30, 90, 170], [128, 128, 128], [200, 120, 40], [12, 7, 3]]) {
      const tmi = calculateTMIFromRGB(...rgb);
      const back = calculateRGBFromTMI(tmi.temp, tmi.tint, tmi.sat, tmi.bri);
      expect([back.r, back.g, back.b]).toEqual(rgb);
    }
  });

  test('Kelvin color scaled to the current brightness keeps that brightness', () => {
    for (const kelvin of [2000, 2700, 5500, 9000]) {
      const full = kelvinToRGB(kelvin);
      const balance = calculateTMIFromRGB(full.r, full.g, full.b);
      const dimmed = calculateRGBFromTMI(balance.temp, balance.tint, balance.sat, 100);
      expect(calculateTMIFromRGB(dimmed.r, dimmed.g, dimmed.b).bri).toBe(100);
    }
  });
});
