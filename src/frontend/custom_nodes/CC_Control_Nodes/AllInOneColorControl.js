// custom_nodes/AllInOneColorControl.js
// ALL-IN-ONE COLOR CONTROL – FULL SERIALIZATION + DRAG-ONLY + CUT-PASTE SAFE
class AllInOneColorNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
    this.title = "All-in-One Color Control";
    this.resizable = true;
    this.draggable = true;
    this.size = [520, 720];

    this.properties = {
      red: 128, green: 128, blue: 128,
      virtualRed: 128, virtualGreen: 128, virtualBlue: 128,
      hueShift: 10, saturation: 20, brightness: 128,
      colorTemp: 4150, whiteAdjust: 4000,
      transitionTime: 0, enableAutoTrigger: false, autoInterval: 5000,
      showPalette: true
    };

    this.lastUpdate = 0;
    this.debounceTimer = null;
    this.autoTimer = null;
    this.sliders = {};
    this.palette = ["#FF0000","#FFA500","#FFFF00","#00FF00","#0000FF","#00FFFF","#800080","#FFFFFF"];
    this.mouseOverBox = null;
    this.isDragging = false;

    this.bindMethods();
    this.buildUI();
    this.syncAllSliders();
    this.updateColorSwatch();
    this.loadFromStorage();
  }

  bindMethods() {
    [
      "updateHSVFromRGB","updateColorTempFromRGB",
      "updateRGBFromHueSat","updateRGBFromBrightness","updateRGBFromTemp",
      "updateWhiteAdjustFromTemp","debounceSend","sendHSV","updateColorSwatch",
      "resetAll","pasteHSV","togglePalette","startAuto","stopAuto",
      "onMouseDown","onMouseUp","onMouseMove","onDrawForeground","onExecute",
      "onResize","onRemoved","syncAllSliders","handlePaletteClick"
    ].forEach(m => this[m] = this[m].bind(this));
  }

  // -------------------------------------------------------------------------
  // SERIALIZATION – SAVE & LOAD EVERYTHING (CORRECT WAY)
  // -------------------------------------------------------------------------
  serialize() {
    const data = super.serialize();
    data.properties = { ...this.properties };
    return data;
  }

  configure(data) {
    super.configure(data);
    if (data.properties) {
      this.properties = { ...this.properties, ...data.properties };
    }

    // Rebuild UI from saved state
    this.widgets = [];
    this.buildUI();

    // Sync sliders & visuals
    this.syncAllSliders();
    this.updateColorSwatch();

    // Restart auto trigger
    if (this.properties.enableAutoTrigger) {
      this.startAuto();
    }
  }

  // -------------------------------------------------------------------------
  // UI BUILD – DRAG-ONLY
  // -------------------------------------------------------------------------
  buildUI() {
    this.addWidget("text", "RGB", null, null).disabled = true;
    ["red","green","blue"].forEach(ch => {
      this.sliders[ch] = this.addWidget("slider", ch.charAt(0).toUpperCase() + ch.slice(1),
        this.properties[ch], v => {
          this.properties[ch] = Math.round(v);
          this.properties[`virtual${ch.charAt(0).toUpperCase() + ch.slice(1)}`] = v;
          this.updateHSVFromRGB();
          this.updateColorTempFromRGB();
          this.updateColorSwatch();
          this.debounceSend();
        }, {min:0, max:255, precision: 0});
    });
    this.addWidget("separator");

    this.addWidget("text", "HSV", null, null).disabled = true;
    this.sliders.hueShift = this.addWidget("slider","Hue Shift",
      this.properties.hueShift, v => {
        this.properties.hueShift = Math.round(v);
        this.updateRGBFromHueSat();
        this.updateColorTempFromRGB();
        this.updateColorSwatch();
        this.debounceSend();
      }, {min:0, max:360, step:1, precision: 0});
    this.sliders.saturation = this.addWidget("slider","Saturation",
      this.properties.saturation, v => {
        this.properties.saturation = Math.round(v);
        this.updateRGBFromHueSat();
        this.updateColorTempFromRGB();
        this.updateColorSwatch();
        this.debounceSend();
      }, {min:0, max:100, step:1, precision: 0});
    this.sliders.brightness = this.addWidget("slider","Intensity",
      this.properties.brightness, v => {
        this.properties.brightness = Math.round(v);
        this.updateRGBFromBrightness();
        this.updateColorSwatch();
        this.debounceSend();
      }, {min:0, max:255, step:1, precision: 0});
    this.addWidget("separator");

    this.addWidget("text", "Color Temperature", null, null).disabled = true;
    this.sliders.colorTemp = this.addWidget("slider","Color Temp (K)",
      this.properties.colorTemp, v => {
        this.properties.colorTemp = Math.round(v);
        this.updateRGBFromTemp();
        this.updateWhiteAdjustFromTemp();
        this.updateColorSwatch();
        this.debounceSend();
      }, {min:1800, max:6500, step:50, precision: 0});
    this.sliders.whiteAdjust = this.addWidget("slider","White Adjust (K)",
      this.properties.whiteAdjust, v => {
        this.properties.whiteAdjust = Math.round(v);
        const hsv = this.kelvinToHSV(v);
        this.properties.hueShift = hsv.hue;
        this.properties.saturation = hsv.saturation;
        this.sliders.hueShift.value = hsv.hue;
        this.sliders.saturation.value = hsv.saturation;
        this.updateRGBFromHueSat();
        this.updateColorTempFromRGB();
        this.updateColorSwatch();
        this.debounceSend();
      }, {min:1800, max:7500, step:100, precision: 0});
    this.addWidget("separator");

    this.addWidget("text", "Transition & Auto", null, null).disabled = true;
    this.transitionSlider = this.addWidget("slider","Transition (ms)",
      this.properties.transitionTime, v => {
        this.properties.transitionTime = Math.round(v);
        this.debounceSend();
      }, {min:0, max:5000, step:100, precision: 0});
    this.addWidget("toggle","Auto Trigger",this.properties.enableAutoTrigger, v => {
      this.properties.enableAutoTrigger = v;
      v ? this.startAuto() : this.stopAuto();
    });
    this.addWidget("number","Interval (s)",this.properties.autoInterval/1000, v => {
      this.properties.autoInterval = Math.max(1000, Math.min(30000, Math.round(v*1000)));
      if (this.properties.enableAutoTrigger) { this.stopAuto(); this.startAuto(); }
    }, {min:1, max:30, step:1});
    this.addWidget("separator");

    this.addWidget("text", "Palette & Actions", null, null).disabled = true;
    this.addWidget("toggle","Show Palette",this.properties.showPalette, v => {
      this.properties.showPalette = v;
      this.togglePalette();
    });
    this.addWidget("button","Reset","Reset",this.resetAll);
    this.addWidget("button","Paste HSV","Paste HSV",this.pasteHSV);
    this.addInput("HSV In","hsv_info");
    this.addInput("Scene HSV","hsv_info");
    this.addOutput("HSV Info","hsv_info");
  }

  // -------------------------------------------------------------------------
  // SYNC & UPDATE HELPERS
  // -------------------------------------------------------------------------
  syncAllSliders() {
    ["red","green","blue"].forEach(ch => {
      if (this.sliders[ch]) this.sliders[ch].value = this.properties[ch];
    });
    if (this.sliders.hueShift) this.sliders.hueShift.value = this.properties.hueShift;
    if (this.sliders.saturation) this.sliders.saturation.value = this.properties.saturation;
    if (this.sliders.brightness) this.sliders.brightness.value = this.properties.brightness;
    if (this.sliders.colorTemp) this.sliders.colorTemp.value = this.properties.colorTemp;
    if (this.sliders.whiteAdjust) this.sliders.whiteAdjust.value = this.properties.whiteAdjust;
    if (this.transitionSlider) this.transitionSlider.value = this.properties.transitionTime;
  }

  updateHSVFromRGB() {
    const {hue, sat, val} = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
    this.properties.hueShift = Math.round(hue * 360);
    this.properties.saturation = Math.round(sat * 100);
    this.properties.brightness = Math.round(val * 255);
    if (this.sliders.hueShift) this.sliders.hueShift.value = this.properties.hueShift;
    if (this.sliders.saturation) this.sliders.saturation.value = this.properties.saturation;
    if (this.sliders.brightness) this.sliders.brightness.value = this.properties.brightness;
  }

  updateRGBFromHueSat() {
    const v = this.properties.brightness / 255;
    const [r, g, b] = this.hsvToRgb(this.properties.hueShift / 360, this.properties.saturation / 100, v);
    this.properties.red = Math.round(r);
    this.properties.green = Math.round(g);
    this.properties.blue = Math.round(b);
    this.properties.virtualRed = this.properties.red;
    this.properties.virtualGreen = this.properties.green;
    this.properties.virtualBlue = this.properties.blue;
    this.sliders.red.value = this.properties.red;
    this.sliders.green.value = this.properties.green;
    this.sliders.blue.value = this.properties.blue;
    this.updateColorTempFromRGB();
    this.updateColorSwatch();
  }

  updateRGBFromBrightness() {
    const v = this.properties.brightness / 255;
    const {hue, sat} = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
    const [r, g, b] = this.hsvToRgb(hue, sat, v);
    this.properties.red = Math.round(r);
    this.properties.green = Math.round(g);
    this.properties.blue = Math.round(b);
    this.properties.virtualRed = this.properties.red;
    this.properties.virtualGreen = this.properties.green;
    this.properties.virtualBlue = this.properties.blue;
    this.sliders.red.value = this.properties.red;
    this.sliders.green.value = this.properties.green;
    this.sliders.blue.value = this.properties.blue;
    this.updateColorSwatch();
  }

  updateColorTempFromRGB() {
    const r = this.properties.virtualRed, b = this.properties.virtualBlue;
    const warmth = r - b;
    let temp = 4150;
    if (warmth > 50) temp = this.interpolate(warmth, 50, 255, 3000, 1800);
    else if (warmth < -50) temp = this.interpolate(warmth, -255, -50, 6500, 5000);
    temp = Math.round(temp); temp = Math.max(1800, Math.min(6500, temp));
    this.properties.colorTemp = temp;
    if (this.sliders.colorTemp) this.sliders.colorTemp.value = temp;
  }

  kelvinToRGB(kelvin) {
    kelvin = Math.max(1000, Math.min(40000, kelvin));
    const t = kelvin / 100;
    let r, g, b;
    if (t <= 66) r = 255;
    else { r = t - 60; r = 329.698727446 * Math.pow(r, -0.1332047592); r = Math.max(0, Math.min(255, r)); }
    if (t <= 66) { g = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    g = Math.max(0, Math.min(255, g));
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else { b = 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
    b = Math.max(0, Math.min(255, b));
    return {r: Math.round(r), g: Math.round(g), b: Math.round(b)};
  }

  updateRGBFromTemp() {
    const target = this.kelvinToRGB(this.properties.colorTemp);
    const {hue, sat} = this.rgbToHsv(target.r, target.g, target.b);
    const v = this.properties.brightness / 255;
    const [r, g, b] = this.hsvToRgb(hue, sat, v);
    this.properties.red = Math.round(r);
    this.properties.green = Math.round(g);
    this.properties.blue = Math.round(b);
    this.properties.virtualRed = this.properties.red;
    this.properties.virtualGreen = this.properties.green;
    this.properties.virtualBlue = this.properties.blue;
    this.sliders.red.value = this.properties.red;
    this.sliders.green.value = this.properties.green;
    this.sliders.blue.value = this.properties.blue;
    this.properties.hueShift = Math.round(hue * 360);
    this.properties.saturation = Math.round(sat * 100);
    this.sliders.hueShift.value = this.properties.hueShift;
    this.sliders.saturation.value = this.properties.saturation;
    this.updateColorSwatch();
  }

  updateWhiteAdjustFromTemp() {
    this.properties.whiteAdjust = this.properties.colorTemp;
    if (this.sliders.whiteAdjust) this.sliders.whiteAdjust.value = this.properties.whiteAdjust;
  }

  debounceSend() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.sendHSV(), 150);
  }

  sendHSV() {
    const info = {
      hue: this.properties.hueShift / 360,
      saturation: this.properties.saturation / 100,
      brightness: this.properties.brightness,
      transition: this.properties.transitionTime,
      colorTemp: this.properties.colorTemp
    };
    this.setOutputData(0, info);
    this.lastUpdate = Date.now();
    this.saveToStorage();
  }

  resetAll() {
    Object.assign(this.properties, {
      red:128, green:128, blue:128,
      virtualRed:128, virtualGreen:128, virtualBlue:128,
      hueShift:10, saturation:20, brightness:128,
      colorTemp:4150, whiteAdjust:4000,
      transitionTime:0, enableAutoTrigger:false, autoInterval:5000
    });
    this.syncAllSliders();
    this.updateColorSwatch();
    this.sendHSV();
  }

  async pasteHSV() {
    try {
      const txt = await navigator.clipboard.readText();
      const data = JSON.parse(txt);
      if (typeof data.hue === "number" && typeof data.saturation === "number" && typeof data.brightness === "number") {
        this.properties.hueShift = Math.round(data.hue * 360);
        this.properties.saturation = Math.round(data.saturation * 100);
        this.properties.brightness = Math.round(data.brightness);
        this.updateRGBFromHueSat();
        this.updateColorTempFromRGB();
        this.updateColorSwatch();
        this.sendHSV();
      } else throw "";
    } catch { alert("Invalid HSV JSON in clipboard"); }
  }

  togglePalette() { this.onResize(); }
  startAuto() { this.autoTimer = setInterval(() => this.sendHSV(), this.properties.autoInterval); }
  stopAuto() { if (this.autoTimer) clearInterval(this.autoTimer); this.autoTimer = null; }

  onExecute() {
    const scene = this.getInputData(1);
    if (scene) { this.setOutputData(0, scene); return; }
    const inp = this.getInputData(0);
    if (inp) {
      this.properties.hueShift = Math.round(inp.hue * 360);
      this.properties.saturation = Math.round(inp.saturation * 100);
      this.properties.brightness = Math.round(inp.brightness);
      this.properties.transitionTime = inp.transition ?? 0;
      this.updateRGBFromHueSat();
      this.updateColorTempFromRGB();
      this.updateColorSwatch();
    }
    if (!this.properties.enableAutoTrigger) this.sendHSV();
  }

  updateColorSwatch() {
    const rgb = this.hsvToRgb(
      this.properties.hueShift / 360,
      this.properties.saturation / 100,
      this.properties.brightness / 255
    );
    this.boxcolor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  onDrawForeground(ctx) {
    if (this.flags.collapsed) return;
    const totalH = this.size[1];
    const swatchH = 70, gradH = 30, paletteH = 50;
    const bottomY = totalH - 20;
    const swatchY = bottomY - swatchH - 10;
    ctx.fillStyle = this.boxcolor;
    ctx.fillRect(20, swatchY, this.size[0] - 40, swatchH);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.strokeRect(20, swatchY, this.size[0] - 40, swatchH);
    ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`${this.properties.colorTemp}K`, this.size[0]/2, swatchY + swatchH + 20);

    const gradY = swatchY - gradH - 15;
    const gradW = this.size[0] - 40;
    const grad = ctx.createLinearGradient(20, 0, gradW + 20, 0);
    for (let i = 0; i <= 1; i += 0.05) {
      const k = 1800 + i * (6500 - 1800);
      const {r,g,b} = this.kelvinToRGB(k);
      grad.addColorStop(i, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = grad; ctx.fillRect(20, gradY, gradW, gradH);
    ctx.strokeStyle = "#fff"; ctx.strokeRect(20, gradY, gradW, gradH);
    const pos = (this.properties.colorTemp - 1800) / (6500 - 1800);
    const mx = 20 + pos * gradW;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(mx, gradY - 6);
    ctx.lineTo(mx - 6, gradY); ctx.lineTo(mx + 6, gradY); ctx.fill();

    if (this.properties.showPalette) {
      const paletteY = gradY - paletteH - 15;
      const box = 36, gap = 8, startX = 20;
      this.palette.forEach((col, i) => {
        const x = startX + i * (box + gap);
        ctx.fillStyle = col; ctx.fillRect(x, paletteY, box, box);
        if (this.mouseOverBox === i) {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
          ctx.strokeRect(x - 2, paletteY - 2, box + 4, box + 4);
        }
      });
    }
  }

  onMouseDown(e, [x, y]) {
    if (this.isDragging) return;
    this.isDragging = true;
    if (this.properties.showPalette) {
      const totalH = this.size[1];
      const paletteY = totalH - 20 - 70 - 10 - 30 - 15 - 50 - 15;
      const box = 36, gap = 8, startX = 20;
      for (let i = 0; i < this.palette.length; i++) {
        const col = this.palette[i];
        const bx = startX + i * (box + gap);
        if (x > bx && x < bx + box && y > paletteY && y < paletteY + box) {
          this.handlePaletteClick(col);
          return;
        }
      }
    }
  }

  onMouseUp() { this.isDragging = false; }

  onMouseMove(e, [x, y]) {
    if (!this.properties.showPalette || this.isDragging) return;
    const totalH = this.size[1];
    const paletteY = totalH - 20 - 70 - 10 - 30 - 15 - 50 - 15;
    const box = 36, gap = 8, startX = 20;
    let hover = null;
    this.palette.forEach((_, i) => {
      const bx = startX + i * (box + gap);
      if (x > bx && x < bx + box && y > paletteY && y < paletteY + box) hover = i;
    });
    if (hover !== this.mouseOverBox) {
      this.mouseOverBox = hover;
      this.setDirtyCanvas(true);
    }
  }

  handlePaletteClick(col) {
    const rgb = this.hexToRgb(col);
    const {hue, sat} = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
    const v = this.properties.brightness / 255;
    const [r, g, b] = this.hsvToRgb(hue, sat, v);
    this.properties.red = Math.round(r);
    this.properties.green = Math.round(g);
    this.properties.blue = Math.round(b);
    this.properties.virtualRed = this.properties.red;
    this.properties.virtualGreen = this.properties.green;
    this.properties.virtualBlue = this.properties.blue;
    this.updateHSVFromRGB();
    this.updateColorTempFromRGB();
    this.syncAllSliders();
    this.updateColorSwatch();
    this.sendHSV();
  }

  interpolate(v, minV, maxV, start, end) {
    return start + ((v - minV) / (maxV - minV)) * (end - start);
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return {hue: h, sat: s, val: max};
  }

  hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  kelvinToHSV(k) {
    const {r,g,b} = this.kelvinToRGB(k);
    const {hue, sat} = this.rgbToHsv(r,g,b);
    return { hue: Math.round(hue * 360), saturation: Math.round(sat * 100) };
  }

  hexToRgb(hex) {
    const s = hex.replace("#", "");
    return {
      r: parseInt(s.substr(0, 2), 16),
      g: parseInt(s.substr(2, 2), 16),
      b: parseInt(s.substr(4, 2), 16)
    };
  }

  saveToStorage() {
    const key = `allinone_color_${this.id}`;
    localStorage.setItem(key, JSON.stringify(this.properties));
  }

  loadFromStorage() {
    const key = `allinone_color_${this.id}`;
    const data = localStorage.getItem(key);
    if (data) {
      Object.assign(this.properties, JSON.parse(data));
      this.syncAllSliders();
      this.updateColorSwatch();
    }
  }

  onResize() {
    this.size[0] = Math.max(520, this.size[0]);
    this.size[1] = Math.max(900, this.size[1]);
  }

  onRemoved() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.stopAuto();
  }
}

// Register
LiteGraph.registerNodeType("CC_Control_Nodes/all_in_one_color", AllInOneColorNode);