class HSVModifierNode extends LiteGraph.LGraphNode {
  constructor() {
    super();
    this.title = this.properties?.selectedHsvBuffer ? this.properties.selectedHsvBuffer : "HSV Modifier"; // Initialize title based on selectedHsvBuffer
    this.size = [450, 710];
    this.properties = {
      hueShift: 0,
      saturationScale: 1.0,
      brightnessScale: 254,
      lastHsvInfo: null,
      presets: [],
      selectedPreset: -1,
      lastHueShift: 0,
      enabled: true,
      selectedBuffer: null,
      selectedHsvBuffer: null,
      targetDotColor: null,
      useLegacyHsvBufferBehavior: false,
      autoDisableSliders: true
    };
    this.sliders = {};
    this.numberInputs = {};
    this.transition = { active: false, startColor: null, endColor: null, progress: 0 };
    this.mode = LiteGraph.ALWAYS;
    this.defaultTitleColor = "#4e4e4e";
    this.enabledTitleColor = "#00FF00";
    this.title_color = this.properties.enabled ? this.enabledTitleColor : this.defaultTitleColor;
    this.setupWidgets();
    this.setupInputsOutputs();
    this.bindMethods();
    this.updateSize();
  }
  bindMethods() {
    this.onExecute = this.onExecute.bind(this);
    this.onResize = this.onResize.bind(this);
    this.updateSize = this.updateSize.bind(this);
    this.onDrawForeground = this.onDrawForeground.bind(this);
    this.hsvToRgb = this.hsvToRgb.bind(this);
    this.rgbToHsv = this.rgbToHsv.bind(this);
    this.updateColorSwatch = this.updateColorSwatch.bind(this);
    this.updateInputDisplay = this.updateInputDisplay.bind(this);
    this.updateOutputDisplay = this.updateOutputDisplay.bind(this);
    this.modifyHSV = this.modifyHSV.bind(this);
  }

  // Exact same color math as AllInOneColorNode
  hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
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
    return { hue: h, saturation: s, brightness: max * 254 };
  }

  setupWidgets() {
    this.enableToggle = this.addWidget(
      "toggle",
      "Enabled",
      this.properties.enabled,
      (value) => {
        this.properties.enabled = value;
        this.title_color = this.properties.enabled ? this.enabledTitleColor : this.defaultTitleColor;
        this.updateSliderState();
        this.setDirtyCanvas(true);
      },
      { width: 100, tooltip: "Manually enable or disable the HSV modification" }
    );
    this.bufferWidget = this.addWidget(
      "combo",
      "Enable Buffer",
      this.properties.selectedBuffer || "None",
      (value) => {
        this.properties.selectedBuffer = value === "None" ? null : value;
        this.setDirtyCanvas(true);
        console.log(`[HSVModifierNode] Selected buffer: ${this.properties.selectedBuffer}`);
      },
      {
        values: () => {
          const buffers = Object.keys(SenderNode.sharedBuffer || {})
            .filter(key => key.startsWith("[Trigger]"))
            .sort();
          return buffers.length > 0 ? ["None", ...buffers] : ["None"];
        },
        width: 300,
        tooltip: "Select a [Trigger] buffer to control enabling the HSV modification. Only boolean buffers are shown."
      }
    );
    this.hsvBufferWidget = this.addWidget(
      "combo",
      "HSV Buffer",
      this.properties.selectedHsvBuffer || "None",
      (value) => {
        this.properties.selectedHsvBuffer = value === "None" ? null : value;
        this.title = this.properties.selectedHsvBuffer || "HSV Modifier";
        this.updateSliderState();
        this.setDirtyCanvas(true);
        console.log(`[HSVModifierNode] Selected HSV buffer: ${this.properties.selectedHsvBuffer}, Title updated to: ${this.title}`);
      },
      {
        values: () => {
          const buffers = Object.keys(SenderNode.sharedBuffer || {})
            .filter(key => key.startsWith("[HSV]"))
            .sort();
          return buffers.length > 0 ? ["None", ...buffers] : ["None"];
        },
        width: 300,
        tooltip: "Select an [HSV] buffer to override incoming HSV data. Only applies when the node is enabled."
      }
    );
    this.addWidget(
      "toggle",
      "Auto-Disable Sliders",
      this.properties.autoDisableSliders,
      (value) => {
        this.properties.autoDisableSliders = value;
        this.updateSliderState();
      },
      { width: 150, tooltip: "Automatically disable sliders when an HSV buffer is selected and the node is enabled" }
    );
    this.statusWidget = this.addWidget("text", "Status", "Idle", null, { readonly: true, width: 300 });
    this.inputDisplay = this.addWidget("text", "Input HSV", "H: 0, S: 0%, B: 0", null, { readonly: true, width: 420 });
    this.inputDisplay.tooltip = "Incoming HSV values: Hue (0-360), Saturation (0-100%), Brightness (0-254)";
    const slidersConfig = [
      { name: "Hue Shift", property: "hueShift", min: -360, max: 360, step: 1, default: 0, tooltip: "Shift the hue in degrees (-360 to 360)." },
      { name: "Saturation", property: "saturationScale", min: 0, max: 1, step: 0.01, default: 1.0, tooltip: "Set the saturation (0 to 1)." },
      { name: "Brightness", property: "brightnessScale", min: 0, max: 254, step: 1, default: 254, tooltip: "Set the brightness (0 to 254)." }
    ];
    slidersConfig.forEach(({ name, property, min, max, step, default: defaultValue, tooltip }) => {
      const slider = this.addWidget("slider", name, this.properties[property], (value) => {
        this.properties[property] = Number(value.toFixed(property === "saturationScale" ? 2 : 0));
        this.numberInputs[property].value = this.properties[property];
        this.updateColorSwatch();
        this.updateOutputDisplay();
        this.setDirtyCanvas(true);
      }, { min, max, step, width: 300 });
      slider.tooltip = tooltip;
      this.sliders[property] = slider;
      const numberInput = this.addWidget("number", "", this.properties[property], (value) => {
        this.properties[property] = Math.max(min, Math.min(max, value));
        this.sliders[property].value = this.properties[property];
        this.updateColorSwatch();
        this.updateOutputDisplay();
        this.setDirtyCanvas(true);
      }, { min, max, step, width: 80 });
      this.numberInputs[property] = numberInput;
      this.addWidget("button", "Reset", "R", () => {
        this.properties[property] = defaultValue;
        this.sliders[property].value = defaultValue;
        this.numberInputs[property].value = defaultValue;
        this.updateColorSwatch();
        this.updateOutputDisplay();
        this.setDirtyCanvas(true);
      }, { width: 40 });
    });
    this.outputDisplay = this.addWidget("text", "Output HSV", "H: 0, S: 0%, B: 0", null, { readonly: true, width: 420 });
    this.outputDisplay.tooltip = "Modified HSV values: Hue (0-360), Saturation (0-100%), Brightness (0-254)";
    this.addWidget("button", "Double Brightness", "2x B", () => {
      this.properties.brightnessScale = Math.min(254, this.properties.brightnessScale * 2);
      this.sliders.brightnessScale.value = this.properties.brightnessScale;
      this.numberInputs.brightnessScale.value = this.properties.brightnessScale;
      this.updateColorSwatch();
      this.updateOutputDisplay();
      this.setDirtyCanvas(true);
    }, { width: 100 });
    this.addWidget("button", "Invert Hue", "Inv H", () => {
      this.properties.hueShift = (this.properties.lastHueShift + 180) % 360;
      this.properties.lastHueShift = this.properties.hueShift;
      this.sliders.hueShift.value = this.properties.hueShift;
      this.numberInputs.hueShift.value = this.properties.hueShift;
      this.updateColorSwatch();
      this.updateOutputDisplay();
      this.setDirtyCanvas(true);
    }, { width: 100 });
    this.presetCombo = this.addWidget("combo", "Presets", "None", (value) => {
      const index = this.properties.presets.findIndex(p => p.name === value);
      if (index >= 0) {
        this.properties.hueShift = this.properties.presets[index].hueShift;
        this.properties.saturationScale = this.properties.presets[index].saturationScale;
        this.properties.brightnessScale = this.properties.presets[index].brightnessScale;
        this.properties.lastHueShift = this.properties.hueShift;
        this.sliders.hueShift.value = this.properties.hueShift;
        this.sliders.saturationScale.value = this.properties.saturationScale;
        this.sliders.brightnessScale.value = this.properties.brightnessScale;
        this.numberInputs.hueShift.value = this.properties.hueShift;
        this.numberInputs.saturationScale.value = this.properties.saturationScale;
        this.numberInputs.brightnessScale.value = this.properties.brightnessScale;
        this.updateColorSwatch();
        this.updateOutputDisplay();
        this.setDirtyCanvas(true);
      }
    }, { values: () => ["None", ...this.properties.presets.map(p => p.name)], width: 300 });
    this.addWidget("button", "Save Preset", "Save", () => {
      const name = prompt("Enter preset name:");
      if (name) {
        this.properties.presets.push({
          name,
          hueShift: this.properties.hueShift,
          saturationScale: this.properties.saturationScale,
          brightnessScale: this.properties.brightnessScale
        });
        this.presetCombo.options.values = ["None", ...this.properties.presets.map(p => p.name)];
        this.setDirtyCanvas(true);
      }
    }, { width: 100 });
    this.lockToggle = this.addWidget("toggle", "Lock Sliders", false, (value) => {
      Object.values(this.sliders).forEach(slider => slider.disabled = value);
      Object.values(this.numberInputs).forEach(input => input.disabled = value);
    }, { width: 100 });
    this.updateSliderState();
  }
  setupInputsOutputs() {
    this.addInput("HSV In", "hsv_info");
    this.addInput("Enable", "boolean");
    this.addOutput("HSV Out", "hsv_info");
  }
  updateSliderState() {
    const disableSliders = this.properties.enabled && this.properties.selectedHsvBuffer && this.properties.autoDisableSliders;
    Object.values(this.sliders).forEach(slider => slider.disabled = disableSliders);
    Object.values(this.numberInputs).forEach(input => input.disabled = disableSliders);
    this.setDirtyCanvas(true);
  }
  updateColorSwatch(hsvOverride = null) {
    const hsv = hsvOverride || this.properties.lastHsvInfo;
    if (!hsv) {
      this.boxcolor = "#333333";
      this.properties.targetDotColor = null;
      return;
    }
    const displayHsv = this.properties.enabled ? this.modifyHSV(hsv) : hsv;
    const rgb = this.hsvToRgb(displayHsv.hue, displayHsv.saturation, displayHsv.brightness / 254);
    const newColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    this.properties.targetDotColor = newColor;
    this.boxcolor = newColor;
    this.setDirtyCanvas(true);
  }
  updateInputDisplay(hsv) {
    if (!hsv) {
      this.inputDisplay.value = "H: 0, S: 0%, B: 0";
      return;
    }
    const hue = Math.round(hsv.hue * 360);
    const sat = Math.round(hsv.saturation * 100);
    const bri = Math.round(hsv.brightness);
    this.inputDisplay.value = `H: ${hue}, S: ${sat}%, B: ${bri}`;
  }
  updateOutputDisplay() {
    if (!this.properties.lastHsvInfo) {
      this.outputDisplay.value = "H: 0, S: 0%, B: 0";
      return;
    }
    const modifiedHSV = this.properties.enabled ? this.modifyHSV(this.properties.lastHsvInfo) : this.properties.lastHsvInfo;
    const hueOut = Math.round(modifiedHSV.hue * 360);
    const satOut = Math.round(modifiedHSV.saturation * 100);
    const briOut = Math.round(modifiedHSV.brightness);
    this.outputDisplay.value = `H: ${hueOut}, S: ${satOut}%, B: ${briOut}`;
  }
  modifyHSV(hsv) {
    if (!hsv) return { hue: 0, saturation: 0, brightness: 0 };
    if (this.properties.enabled && this.properties.selectedHsvBuffer && !this.properties.useLegacyHsvBufferBehavior) {
      const buffer = SenderNode.sharedBuffer || {};
      const hsvBufferData = buffer[this.properties.selectedHsvBuffer];
      if (hsvBufferData && typeof hsvBufferData === 'object' && 'hue' in hsvBufferData && 'saturation' in hsvBufferData && 'brightness' in hsvBufferData) {
        return {
          hue: hsvBufferData.hue,
          saturation: Math.max(0, Math.min(1, hsvBufferData.saturation)),
          brightness: Math.max(0, Math.min(254, hsvBufferData.brightness))
        };
      }
    }
    if (this.properties.enabled) {
      let hue = (hsv.hue * 360 + this.properties.hueShift) % 360;
      if (hue < 0) hue += 360;
      const saturation = Math.max(0, Math.min(1, this.properties.saturationScale));
      const brightness = Math.max(0, Math.min(254, this.properties.brightnessScale));
      return { hue: hue / 360, saturation, brightness };
    }
    return hsv;
  }
  onExecute() {
    const previousEnabled = this.properties.enabled;
    const previousHsvBuffer = this.properties.selectedHsvBuffer;
    const enableInput = this.getInputData(1);
    let enableSource = "Toggle";
    if (enableInput !== undefined) {
      this.properties.enabled = !!enableInput;
      enableSource = "Input";
      this.enableToggle.value = this.properties.enabled;
    } else {
      const bufferName = this.properties.selectedBuffer;
      const buffer = SenderNode.sharedBuffer || {};
      const bufferValue = buffer[bufferName];
      if (bufferName && bufferValue !== undefined && bufferValue !== null) {
        if (!bufferName.startsWith("[Trigger]")) {
          this.properties.selectedBuffer = null;
          this.bufferWidget.value = "None";
          this.statusWidget.value = `Invalid buffer: ${bufferName} (must be [Trigger])`;
          this.properties.enabled = this.enableToggle.value;
          enableSource = "Toggle";
          console.log(`[HSVModifierNode] Invalid buffer: ${bufferName}, resetting to None`);
        } else {
          this.properties.enabled = !!bufferValue;
          enableSource = "Buffer";
          this.enableToggle.value = this.properties.enabled;
        }
      } else {
        this.properties.enabled = this.enableToggle.value;
        enableSource = "Toggle";
        if (bufferName) {
          this.statusWidget.value = `Buffer '${bufferName}' not found`;
        }
      }
    }
    if (enableSource === "Input") {
      this.statusWidget.value = `Enabled via Input (${this.properties.enabled ? "Enabled" : "Disabled"})`;
    } else if (enableSource === "Buffer") {
      const bufferName = this.properties.selectedBuffer || "None";
      this.statusWidget.value = `Buffer: ${bufferName} (${this.properties.enabled ? "Enabled" : "Disabled"})`;
    } else {
      this.statusWidget.value = `Toggle (${this.properties.enabled ? "Enabled" : "Disabled"})`;
    }
    if (previousEnabled !== this.properties.enabled) {
      this.title_color = this.properties.enabled ? this.enabledTitleColor : this.defaultTitleColor;
      this.updateSliderState();
      this.setDirtyCanvas(true);
    }
    if (previousHsvBuffer !== this.properties.selectedHsvBuffer) {
      this.title = this.properties.selectedHsvBuffer || "HSV Modifier";
      this.setDirtyCanvas(true);
    }

    // AUTO-CONVERT RGB INPUT (the real bug fix!)
    const rawInput = this.getInputData(0);
    if (rawInput !== undefined) {
      if (rawInput.r !== undefined || rawInput.red !== undefined || Array.isArray(rawInput)) {
        const rgb = Array.isArray(rawInput) 
          ? rawInput 
          : [rawInput.r ?? rawInput.red ?? 0, rawInput.g ?? rawInput.green ?? 0, rawInput.b ?? rawInput.blue ?? 0];
        const hsv = this.rgbToHsv(rgb[0], rgb[1], rgb[2]);
        this.properties.lastHsvInfo = { hue: hsv.hue, saturation: hsv.saturation, brightness: hsv.brightness };
      } else {
        this.properties.lastHsvInfo = rawInput;
      }
    }

    if (this.properties.lastHsvInfo) {
      this.updateInputDisplay(this.properties.lastHsvInfo);
    }

    // DISABLED → FULL PASSTHROUGH
    if (!this.properties.enabled) {
      this.setOutputData(0, this.properties.lastHsvInfo);
      this.updateOutputDisplay();
      this.updateColorSwatch(this.properties.lastHsvInfo);
      this.statusWidget.value += " → Passthrough";
      this.boxcolor = this.defaultTitleColor;
      this.setDirtyCanvas(true);
      return;
    }

    // ENABLED → normal operation
    let hsvInput = this.properties.lastHsvInfo;

    if (this.properties.selectedHsvBuffer) {
      const buffer = SenderNode.sharedBuffer || {};
      const hsvBufferData = buffer[this.properties.selectedHsvBuffer];
      if (hsvBufferData && typeof hsvBufferData === 'object' && 'hue' in hsvBufferData && 'saturation' in hsvBufferData && 'brightness' in hsvBufferData) {
        hsvInput = hsvBufferData;
        this.statusWidget.value += ` (Using HSV Buffer: ${this.properties.selectedHsvBuffer})`;
      } else {
        this.statusWidget.value += ` (HSV Buffer '${this.properties.selectedHsvBuffer}' invalid)`;
      }
    }

    if (hsvInput) {
      this.properties.lastHsvInfo = hsvInput;
      const outputHSV = this.modifyHSV(hsvInput);
      this.setOutputData(0, outputHSV);
      this.updateOutputDisplay();
      this.updateColorSwatch(outputHSV);
    }

    // Pulsing effect when enabled
    if (this.properties.enabled && this.properties.targetDotColor) {
      const now = Date.now();
      const pulse = (Math.sin(now / 500) + 1) / 2;
      const match = this.properties.targetDotColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const dimFactor = 0.3 + 0.7 * pulse;
        this.boxcolor = `rgba(${r}, ${g}, ${b}, ${dimFactor})`;
      }
      this.setDirtyCanvas(true);
    } else if (!this.properties.enabled) {
      this.boxcolor = this.defaultTitleColor;
      this.setDirtyCanvas(true);
    }
  }
  onDrawForeground(ctx) {
    if (this.flags.collapsed) return;
    const widgetAreaHeight = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT;
    const reservedTop = 20;
    const reservedBottom = 210;
    const hueBarY = widgetAreaHeight + reservedTop + 105;
    const hueBarHeight = 20;
    const gradient = ctx.createLinearGradient(10, 0, this.size[0] - 20, 0);
    for (let i = 0; i <= 1; i += 0.1) {
      const rgb = this.hsvToRgb(i, 1, 1);
      gradient.addColorStop(i, `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(10, hueBarY, this.size[0] - 20, hueBarHeight);
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeRect(10, hueBarY, this.size[0] - 20, hueBarHeight);
    if (this.properties.lastHsvInfo) {
      const hue = (this.properties.lastHsvInfo.hue * 360 + (this.properties.enabled ? this.properties.hueShift : 0)) % 360;
      const huePos = 10 + ((hue < 0 ? hue + 360 : hue) / 360) * (this.size[0] - 20);
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.moveTo(huePos, hueBarY - 5);
      ctx.lineTo(huePos - 5, hueBarY);
      ctx.lineTo(huePos + 5, hueBarY);
      ctx.fill();
    }
    const swatchHeight = 20;
    const inputSwatchY = widgetAreaHeight + reservedTop + 135;
    if (this.properties.lastHsvInfo) {
      const inputRgb = this.hsvToRgb(this.properties.lastHsvInfo.hue, this.properties.lastHsvInfo.saturation, this.properties.lastHsvInfo.brightness / 254);
      ctx.fillStyle = `rgb(${inputRgb[0]}, ${inputRgb[1]}, ${inputRgb[2]})`;
      ctx.fillRect(10, inputSwatchY, this.size[0] - 20, swatchHeight);
      ctx.strokeStyle = "#FFFFFF";
      ctx.strokeRect(10, inputSwatchY, this.size[0] - 20, swatchHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "12px Arial";
      ctx.fillText("Input Color", 15, inputSwatchY + 15);
    }
    const modSwatchY = widgetAreaHeight + reservedTop + 165;
    if (this.properties.lastHsvInfo) {
      const modifiedHSV = this.properties.enabled ? this.modifyHSV(this.properties.lastHsvInfo) : this.properties.lastHsvInfo;
      const outputRgb = this.hsvToRgb(modifiedHSV.hue, modifiedHSV.saturation, modifiedHSV.brightness / 254);
      ctx.fillStyle = `rgb(${outputRgb[0]}, ${outputRgb[1]}, ${outputRgb[2]})`;
      ctx.fillRect(10, modSwatchY, this.size[0] - 20, swatchHeight);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      ctx.strokeRect(10, modSwatchY, this.size[0] - 20, swatchHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("Modified Color", 15, modSwatchY + 15);
    } else {
      ctx.fillStyle = 'black';
      ctx.fillRect(10, modSwatchY, this.size[0] - 20, swatchHeight);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      ctx.strokeRect(10, modSwatchY, this.size[0] - 20, swatchHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("Modified Color", 15, modSwatchY + 15);
    }
  }
  updateSize() {
    const widgetHeight = this.widgets.length * LiteGraph.NODE_WIDGET_HEIGHT;
    const reservedTop = 20;
    const reservedBottom = 220;
    this.size[1] = widgetHeight + reservedTop + reservedBottom;
    this.size[0] = Math.max(this.size[0], 450);
    this.setDirtyCanvas(true);
  }
  onResize() {
    this.updateSize();
  }
  serialize() {
    const data = super.serialize();
    data.version = "2.0";
    data.properties = {
      hueShift: this.properties.hueShift,
      saturationScale: this.properties.saturationScale,
      brightnessScale: this.properties.brightnessScale,
      lastHsvInfo: this.properties.lastHsvInfo,
      presets: this.properties.presets.slice(),
      selectedPreset: this.properties.selectedPreset,
      lastHueShift: this.properties.lastHueShift,
      enabled: this.properties.enabled,
      selectedBuffer: this.properties.selectedBuffer,
      selectedHsvBuffer: this.properties.selectedHsvBuffer,
      targetDotColor: this.properties.targetDotColor,
      useLegacyHsvBufferBehavior: this.properties.useLegacyHsvBufferBehavior,
      autoDisableSliders: this.properties.autoDisableSliders
    };
    data.title_color = this.title_color;
    data.title = this.title;
    return data;
  }
  configure(data) {
    super.configure(data);
    if (data.properties) {
      this.properties = { ...this.properties, ...data.properties };
      if (!data.version || data.version < "2.0") {
        this.properties.useLegacyHsvBufferBehavior = true;
        this.properties.autoDisableSliders = false;
        console.log("[HSVModifierNode] Loaded legacy graph; using compatibility mode for HSV buffer and slider behavior.");
      }
      if (this.properties.selectedBuffer && !this.properties.selectedBuffer.startsWith("[Trigger]")) {
        this.properties.selectedBuffer = null;
        console.log("[HSVModifierNode] Invalid buffer in configure, resetting to None");
      }
      if (this.properties.selectedHsvBuffer && !this.properties.selectedHsvBuffer.startsWith("[HSV]")) {
        this.properties.selectedHsvBuffer = null;
        console.log("[HSVModifierNode] Invalid HSV buffer in configure, resetting to None");
      }
      this.enableToggle.value = this.properties.enabled;
      this.bufferWidget.value = this.properties.selectedBuffer || "None";
      this.hsvBufferWidget.value = this.properties.selectedHsvBuffer || "None";
      this.sliders.hueShift.value = this.properties.hueShift;
      this.sliders.saturationScale.value = this.properties.saturationScale;
      this.sliders.brightnessScale.value = this.properties.brightnessScale;
      this.numberInputs.hueShift.value = this.properties.hueShift;
      this.numberInputs.saturationScale.value = this.properties.saturationScale;
      this.numberInputs.brightnessScale.value = this.properties.brightnessScale;
      this.presetCombo.options.values = ["None", ...this.properties.presets.map(p => p.name)];
      this.title = this.properties.selectedHsvBuffer || "HSV Modifier";
      this.updateColorSwatch();
      this.updateOutputDisplay();
      this.updateSliderState();
    }
    this.title_color = this.properties.enabled ? this.enabledTitleColor : this.defaultTitleColor;
    this.setDirtyCanvas(true);
  }
}
LiteGraph.registerNodeType("CC_Control_Nodes/hsv_modifier", HSVModifierNode);