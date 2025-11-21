// custom_nodes/CustomColorControlNode.js
// RESIZABLE + BEAUTIFUL + ALL SLIDERS UPDATE COLOR TEMP
class CustomColorNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
    this.title = "Custom Color Control";
    this.resizable = true;
    this.size = [560, 480];
    this.properties = {
      red: 128,
      green: 128,
      blue: 128,
      colorTemp: 4150,
      hue: 0.5,
      saturation: 0,
      brightness: 128,
      lastColorTemp: 4150,
      virtualRed: 128,
      virtualGreen: 128,
      virtualBlue: 128
    };
    this.lastUpdateTime = 0;

    // Bind methods
    this.updateLuminanceFromRGB = this.updateLuminanceFromRGB.bind(this);
    this.updateHSVFromRGB = this.updateHSVFromRGB.bind(this);
    this.updateColorTempFromRGB = this.updateColorTempFromRGB.bind(this);
    this.updateRGBSliders = this.updateRGBSliders.bind(this);
    this.resetSliders = this.resetSliders.bind(this);
    this.adjustRGBFromLuminance = this.adjustRGBFromLuminance.bind(this);
    this.adjustColorTempOffset = this.adjustColorTempOffset.bind(this);
    this.adjustHueRotation = this.adjustHueRotation.bind(this);

    this.buildUI();
    this.updateColor();
    this.loadFromLocalStorage();
  }

  buildUI() {
    // === GROUP: RGB ===
    this.addWidget("text", "RGB", "", null).disabled = true;
    this.redSlider = this.addWidget("slider", "Red", this.properties.red, (v) => {
      this.properties.red = v;
      this.properties.virtualRed = v;
      this.updateLuminanceFromRGB();
      this.updateHSVFromRGB();
      this.updateColorTempFromRGB();
      this.updateColor();
    }, { min: 0, max: 255 });

    this.greenSlider = this.addWidget("slider", "Green", this.properties.green, (v) => {
      this.properties.green = v;
      this.properties.virtualGreen = v;
      this.updateLuminanceFromRGB();
      this.updateHSVFromRGB();
      this.updateColorTempFromRGB();
      this.updateColor();
    }, { min: 0, max: 255 });

    this.blueSlider = this.addWidget("slider", "Blue", this.properties.blue, (v) => {
      this.properties.blue = v;
      this.properties.virtualBlue = v;
      this.updateLuminanceFromRGB();
      this.updateHSVFromRGB();
      this.updateColorTempFromRGB();
      this.updateColor();
    }, { min: 0, max: 255 });

    // === GROUP: Color Temp & Hue ===
    this.addWidget("text", "Color Temp & Hue", "", null).disabled = true;
    this.colorTempSlider = this.addWidget("slider", "Color Temp", this.properties.colorTemp, (v) => {
      this.properties.colorTemp = v;
      this.adjustColorTempOffset(v);
      this.updateColor();
    }, { min: 1800, max: 6500 });

    this.hueSlider = this.addWidget("slider", "Hue", this.properties.hue, (v) => {
      this.properties.hue = v;
      this.adjustHueRotation(v);
      this.updateColorTempFromRGB();   // ← Hue now updates Color Temp
      this.updateColor();
    }, { min: 0, max: 1, step: 0.01 });

    // === GROUP: Luminance ===
    this.addWidget("text", "Luminance", "", null).disabled = true;
    this.luminanceSlider = this.addWidget("slider", "Luminance", this.properties.brightness, (v) => {
      this.adjustRGBFromLuminance(v);
      this.updateHSVFromRGB();
      this.updateColor();
    }, { min: 0, max: 255 });

    // === DISPLAY + BUTTONS ===
    this.rgbDisplay = this.addWidget("text", "RGB", "R: 128, G: 128, B: 128", null);
    this.addWidget("button", "Reset", "Reset", () => this.resetSliders());
    this.addOutput("HSV Info", "hsv_info");
  }

  // === PERSISTENCE ===
  loadFromLocalStorage() {
    const key = `custom_color_node_${this.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      Object.assign(this.properties, JSON.parse(stored));
      this.updateRGBSliders();
      this.updateColor();
    }
  }

  saveToLocalStorage() {
    const key = `custom_color_node_${this.id}`;
    localStorage.setItem(key, JSON.stringify(this.properties));
  }

  onPropertyChanged() {
    this.saveToLocalStorage();
    this.updateColor();
  }

  // === COLOR LOGIC ===
  updateLuminanceFromRGB() {
    const avg = (this.properties.red + this.properties.green + this.properties.blue) / 3;
    this.properties.brightness = avg;
    this.luminanceSlider.value = avg;
  }

  updateHSVFromRGB() {
    const { hue, saturation } = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
    this.properties.hue = hue;
    this.properties.saturation = saturation;
    this.hueSlider.value = hue;
  }

  updateColorTempFromRGB() {
    const r = this.properties.virtualRed;
    const b = this.properties.virtualBlue;
    const warmth = r - b;
    let temp;

    if (warmth > 50) {
      temp = this.interpolate(warmth, 50, 255, 3000, 1800);
    } else if (warmth < -50) {
      temp = this.interpolate(warmth, -255, -50, 6500, 5000);
    } else {
      temp = 4150;
    }

    temp = Math.round(temp);
    temp = Math.min(6500, Math.max(1800, temp));

    this.properties.colorTemp = temp;
    this.colorTempSlider.value = temp;
  }

  adjustColorTempOffset(tempValue) {
    const redTarget = this.interpolate(tempValue, 1800, 6500, 255, 0);
    const blueTarget = this.interpolate(tempValue, 1800, 6500, 0, 255);
    const redOffset = redTarget - this.properties.virtualRed;
    const blueOffset = blueTarget - this.properties.virtualBlue;

    this.properties.virtualRed += redOffset * 0.3;
    this.properties.virtualBlue += blueOffset * 0.3;

    this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
    this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));

    this.updateRGBSliders();
    this.updateHSVFromRGB();
  }

  adjustHueRotation(hueValue) {
    const { saturation, brightness } = this.rgbToHsv(this.properties.red, this.properties.green, this.properties.blue);
    const [r, g, b] = this.hsvToRgb(hueValue, saturation, brightness);
    this.properties.red = r;
    this.properties.green = g;
    this.properties.blue = b;
    this.properties.virtualRed = r;
    this.properties.virtualGreen = g;
    this.properties.virtualBlue = b;
    this.updateRGBSliders();
    this.updateLuminanceFromRGB();
  }

  adjustRGBFromLuminance(luminance) {
    const diff = luminance - this.properties.brightness;
    this.properties.virtualRed += diff;
    this.properties.virtualGreen += diff;
    this.properties.virtualBlue += diff;

    this.properties.red = Math.min(255, Math.max(0, this.properties.virtualRed));
    this.properties.green = Math.min(255, Math.max(0, this.properties.virtualGreen));
    this.properties.blue = Math.min(255, Math.max(0, this.properties.virtualBlue));
    this.properties.brightness = luminance;

    this.updateRGBSliders();
  }

  resetSliders() {
    Object.assign(this.properties, {
      red: 128, green: 128, blue: 128,
      virtualRed: 128, virtualGreen: 128, virtualBlue: 128,
      colorTemp: 4150, hue: 0.5, saturation: 0, brightness: 128, lastColorTemp: 4150
    });
    this.updateRGBSliders();
    this.updateColorTempFromRGB();
    this.updateColor();
  }

  updateRGBSliders() {
    this.redSlider.value = this.properties.red;
    this.greenSlider.value = this.properties.green;
    this.blueSlider.value = this.properties.blue;
    this.colorTempSlider.value = this.properties.colorTemp;
    this.hueSlider.value = this.properties.hue;
    this.luminanceSlider.value = this.properties.brightness;
  }

  updateColor() {
    const r = this.properties.red;
    const g = this.properties.green;
    const b = this.properties.blue;
    this.boxcolor = `rgb(${r}, ${g}, ${b})`;
    this.rgbDisplay.value = `R: ${r}, G: ${g}, B: ${b}, L: ${Math.round(this.properties.brightness)}`;
    this.setOutputData(0, {
      hue: this.properties.hue,
      saturation: this.properties.saturation,
      brightness: this.properties.brightness
    });
    this.lastUpdateTime = Date.now();
  }

  // === MATH ===
  interpolate(value, minVal, maxVal, start, end) {
    return start + ((value - minVal) / (maxVal - minVal)) * (end - start);
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
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
    return { hue: h, saturation: s, brightness: max };
  }

  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // === DRAWING ===
  onDrawForeground(ctx) {
    const barH = 28;
    const now = Date.now();
    const ago = Math.round((now - this.lastUpdateTime) / 1000);

    // Status bar
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(0, 0, this.size[0], barH);
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Custom Color", this.size[0] / 2, 20);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#ccc";
    ctx.textAlign = "right";
    ctx.fillText(`${ago}s ago`, this.size[0] - 15, 20);

    if (ago < 2) {
      const alpha = Math.max(0, 1 - ago / 2);
      ctx.fillStyle = `rgba(46, 204, 113, ${alpha * 0.5})`;
      ctx.fillRect(0, 0, this.size[0], barH);
    }

    // Live color preview
    const previewY = this.size[1] - 80;
    ctx.fillStyle = this.boxcolor;
    ctx.fillRect(20, previewY, this.size[0] - 40, 60);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, previewY, this.size[0] - 40, 60);
  }

  onExecute() {
    this.updateColor();
  }

  onResize() {
    this.size[1] = Math.max(480, this.size[1]);
  }
}

LiteGraph.registerNodeType("CC_Control_Nodes/color_control", CustomColorNode);