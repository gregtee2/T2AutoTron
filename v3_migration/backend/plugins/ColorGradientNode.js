(function() {
    // Debug: console.log("[ColorGradientNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.ColorUtils) {
        console.error("[ColorGradientNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const ColorUtils = window.ColorUtils;
    const el = React.createElement;

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // HELPER FUNCTIONS
    // -------------------------------------------------------------------------
    
    const numberSocket = sockets.number;
    const booleanSocket = sockets.boolean;
    const stringSocket = new ClassicPreset.Socket("string");
    const hsvInfoSocket = new ClassicPreset.Socket("hsv_info");

    function parseTimeString(hours, minutes, period) {
        const now = new Date();
        let parsedHours = parseInt(hours, 10);
        const parsedMinutes = parseInt(minutes, 10);
        const isPM = period.toUpperCase() === "PM";
        if (isNaN(parsedHours) || isNaN(parsedMinutes)) return null;
        if (parsedHours < 1 || parsedHours > 12 || parsedMinutes < 0 || parsedMinutes > 59) return null;
        if (isPM && parsedHours < 12) parsedHours += 12;
        if (!isPM && parsedHours === 12) parsedHours = 0;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsedHours, parsedMinutes, 0);
    }

    function parseTimeInput(timeStr) {
        if (!timeStr || typeof timeStr !== "string") return null;
        timeStr = timeStr.trim().replace(/\s+/g, ' ');
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return null;
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3].toUpperCase();
        if (isNaN(hours) || isNaN(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
        return { hours, minutes, period };
    }

    const WEDGE_PRESETS = {
        'warm': { startHue: 0, startSat: 100, startBri: 100, endHue: 60, endSat: 80, endBri: 90 },
        'cool': { startHue: 180, startSat: 90, startBri: 90, endHue: 240, endSat: 80, endBri: 90 },
        'warm-to-cool': { startHue: 0, startSat: 100, startBri: 100, endHue: 240, endSat: 80, endBri: 90 }
    };

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class ColorGradientNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Stepped Color Gradient");
            this.changeCallback = changeCallback;
            this.width = 460;
            this.height = 680;

            // Inputs
            this.addInput("value", new ClassicPreset.Input(numberSocket, "Value"));
            this.addInput("trigger", new ClassicPreset.Input(booleanSocket, "Trigger"));
            this.addInput("timerDuration", new ClassicPreset.Input(numberSocket, "Timer Duration"));
            this.addInput("startTime", new ClassicPreset.Input(stringSocket, "Start Time"));
            this.addInput("endTime", new ClassicPreset.Input(stringSocket, "End Time"));

            // Output
            this.addOutput("hsvInfo", new ClassicPreset.Output(hsvInfoSocket, "HSV Info"));

            // Properties object for serialization (used by Editor.jsx save/load)
            this.properties = {
                colorMode: 'custom',
                predefinedWedge: 'warm-to-cool',
                startHue: 0,
                startSaturation: 100,
                startBrightness: 100,
                endHue: 240,
                endSaturation: 80,
                endBrightness: 90,
                rangeMode: 'numerical',
                startValue: 20,
                endValue: 30,
                startTimeHours: 10,
                startTimeMinutes: 0,
                startTimePeriod: 'AM',
                endTimeHours: 2,
                endTimeMinutes: 0,
                endTimePeriod: 'PM',
                timerDurationValue: 1,
                timerUnit: 'hours',
                timeSteps: 60,
                useBrightnessOverride: false,
                brightnessOverride: 254,
                debug: false
            };

            // Mirror properties to instance for component access
            this.syncFromProperties();

            // Runtime state (not serialized)
            this.timerStart = null;
            this.currentStep = 0;
            this.lastTimeStep = null;
            this.position = 0;
            this.isInRange = false;
            this.lastColor = null;
        }

        // Sync instance vars from properties
        syncFromProperties() {
            this.colorMode = this.properties.colorMode;
            this.predefinedWedge = this.properties.predefinedWedge;
            this.startHue = this.properties.startHue;
            this.startSaturation = this.properties.startSaturation;
            this.startBrightness = this.properties.startBrightness;
            this.endHue = this.properties.endHue;
            this.endSaturation = this.properties.endSaturation;
            this.endBrightness = this.properties.endBrightness;
            this.rangeMode = this.properties.rangeMode;
            this.startValue = this.properties.startValue;
            this.endValue = this.properties.endValue;
            this.startTimeHours = this.properties.startTimeHours;
            this.startTimeMinutes = this.properties.startTimeMinutes;
            this.startTimePeriod = this.properties.startTimePeriod;
            this.endTimeHours = this.properties.endTimeHours;
            this.endTimeMinutes = this.properties.endTimeMinutes;
            this.endTimePeriod = this.properties.endTimePeriod;
            this.timerDurationValue = this.properties.timerDurationValue;
            this.timerUnit = this.properties.timerUnit;
            this.timeSteps = this.properties.timeSteps;
            this.useBrightnessOverride = this.properties.useBrightnessOverride;
            this.brightnessOverride = this.properties.brightnessOverride;
            this.debug = this.properties.debug;
        }

        // Sync properties from instance vars (call after UI changes)
        syncToProperties() {
            this.properties.colorMode = this.colorMode;
            this.properties.predefinedWedge = this.predefinedWedge;
            this.properties.startHue = this.startHue;
            this.properties.startSaturation = this.startSaturation;
            this.properties.startBrightness = this.startBrightness;
            this.properties.endHue = this.endHue;
            this.properties.endSaturation = this.endSaturation;
            this.properties.endBrightness = this.endBrightness;
            this.properties.rangeMode = this.rangeMode;
            this.properties.startValue = this.startValue;
            this.properties.endValue = this.endValue;
            this.properties.startTimeHours = this.startTimeHours;
            this.properties.startTimeMinutes = this.startTimeMinutes;
            this.properties.startTimePeriod = this.startTimePeriod;
            this.properties.endTimeHours = this.endTimeHours;
            this.properties.endTimeMinutes = this.endTimeMinutes;
            this.properties.endTimePeriod = this.endTimePeriod;
            this.properties.timerDurationValue = this.timerDurationValue;
            this.properties.timerUnit = this.timerUnit;
            this.properties.timeSteps = this.timeSteps;
            this.properties.useBrightnessOverride = this.useBrightnessOverride;
            this.properties.brightnessOverride = this.brightnessOverride;
            this.properties.debug = this.debug;
        }

        // Called by Editor.jsx after loading graph
        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
                this.syncFromProperties();
                
                // Apply wedge preset if predefined mode
                if (this.colorMode === 'predefined' && WEDGE_PRESETS[this.predefinedWedge]) {
                    const preset = WEDGE_PRESETS[this.predefinedWedge];
                    this.startHue = preset.startHue;
                    this.startSaturation = preset.startSat;
                    this.startBrightness = preset.startBri;
                    this.endHue = preset.endHue;
                    this.endSaturation = preset.endSat;
                    this.endBrightness = preset.endBri;
                }
            }
        }

        data(inputs) {
            const inputValue = inputs.value?.[0];
            const trigger = inputs.trigger?.[0];
            const timerDurationInput = inputs.timerDuration?.[0];
            const startTimeInput = inputs.startTime?.[0];
            const endTimeInput = inputs.endTime?.[0];
            const now = new Date();
            const currentMs = now.getTime();

            let position = 0;
            this.isInRange = false;

            if (this.rangeMode === 'numerical') {
                if (inputValue === undefined) {
                    const fallbackValue = (this.startValue + this.endValue) / 2;
                    position = (fallbackValue - this.startValue) / (this.endValue - this.startValue);
                } else {
                    const clamped = Math.max(this.startValue, Math.min(this.endValue, inputValue));
                    position = (clamped - this.startValue) / (this.endValue - this.startValue);
                }
                this.isInRange = true;
            } else if (this.rangeMode === 'time') {
                let startProps = { hours: this.startTimeHours, minutes: this.startTimeMinutes, period: this.startTimePeriod };
                let endProps = { hours: this.endTimeHours, minutes: this.endTimeMinutes, period: this.endTimePeriod };

                // Track input overrides for UI display
                this.inputStartTime = null;
                this.inputEndTime = null;

                if (startTimeInput) {
                    const parsed = parseTimeInput(startTimeInput);
                    if (parsed) {
                        startProps = parsed;
                        this.inputStartTime = startTimeInput; // Store for UI display
                    }
                }
                if (endTimeInput) {
                    const parsed = parseTimeInput(endTimeInput);
                    if (parsed) {
                        endProps = parsed;
                        this.inputEndTime = endTimeInput; // Store for UI display
                    }
                }

                const startTime = parseTimeString(startProps.hours, startProps.minutes, startProps.period);
                let endTime = parseTimeString(endProps.hours, endProps.minutes, endProps.period);
                if (!startTime || !endTime) return { hsvInfo: null };

                let startMs = startTime.getTime();
                let endMs = endTime.getTime();
                if (endMs <= startMs) {
                    endTime.setDate(endTime.getDate() + 1);
                    endMs = endTime.getTime();
                }

                if (currentMs < startMs) {
                    position = 0;
                    this.isInRange = false;
                } else if (currentMs > endMs) {
                    position = 1;
                    this.isInRange = false;
                } else {
                    this.isInRange = true;
                    const totalSteps = Math.max(1, this.timeSteps);
                    const stepInterval = (endMs - startMs) / totalSteps;
                    const elapsedMs = currentMs - startMs;
                    const currentStep = Math.floor(elapsedMs / stepInterval);
                    position = currentStep / totalSteps;
                    this.lastTimeStep = currentStep;
                }
            } else if (this.rangeMode === 'timer') {
                if (trigger && !this.timerStart) {
                    this.timerStart = now.getTime();
                    this.currentStep = 0;
                }
                if (!this.timerStart) return { hsvInfo: null };
                if (trigger === false) {
                    this.timerStart = null;
                    this.currentStep = 0;
                    return { hsvInfo: null };
                }

                let unitMultiplier;
                switch (this.timerUnit) {
                    case 'hours': unitMultiplier = 3600000; break;
                    case 'minutes': unitMultiplier = 60000; break;
                    default: unitMultiplier = 1000; break;
                }

                const timerDuration = (timerDurationInput !== undefined && !isNaN(timerDurationInput) && timerDurationInput > 0)
                    ? timerDurationInput
                    : this.timerDurationValue;

                const durationMs = timerDuration * unitMultiplier;
                const elapsed = now.getTime() - this.timerStart;

                if (elapsed >= durationMs) {
                    position = 1;
                    this.isInRange = true;
                    if (trigger === true) {
                        this.timerStart = now.getTime();
                        this.currentStep = 0;
                    } else {
                        this.timerStart = null;
                        this.currentStep = 0;
                    }
                } else {
                    const totalSteps = Math.floor(timerDuration);
                    const stepSize = totalSteps > 0 ? 1 / totalSteps : 1;
                    position = this.currentStep * stepSize;
                    this.isInRange = true;
                    this.currentStep = Math.min(this.currentStep + 1, totalSteps);
                }
            }

            // Calculate HSV output (linear interpolation)
            if (this.isInRange || this.rangeMode === 'time') {
                const h = this.startHue + position * (this.endHue - this.startHue);
                const s = this.startSaturation + position * (this.endSaturation - this.startSaturation);
                const v = this.startBrightness + position * (this.endBrightness - this.startBrightness);
                const brightness = this.useBrightnessOverride ? this.brightnessOverride : v * 2.54;

                const rgb = ColorUtils.hsvToRgbDegrees(h, s, v);
                this.lastColor = rgb;
                this.position = position;

                return {
                    hsvInfo: {
                        hue: h / 360,
                        saturation: s / 100,
                        brightness: brightness,
                        hueStart: this.startHue,
                        hueEnd: this.endHue
                    }
                };
            }

            return { hsvInfo: null };
        }

        serialize() {
            return {
                colorMode: this.colorMode,
                predefinedWedge: this.predefinedWedge,
                startHue: this.startHue,
                startSaturation: this.startSaturation,
                startBrightness: this.startBrightness,
                endHue: this.endHue,
                endSaturation: this.endSaturation,
                endBrightness: this.endBrightness,
                rangeMode: this.rangeMode,
                startValue: this.startValue,
                endValue: this.endValue,
                startTimeHours: this.startTimeHours,
                startTimeMinutes: this.startTimeMinutes,
                startTimePeriod: this.startTimePeriod,
                endTimeHours: this.endTimeHours,
                endTimeMinutes: this.endTimeMinutes,
                endTimePeriod: this.endTimePeriod,
                timerDurationValue: this.timerDurationValue,
                timerUnit: this.timerUnit,
                timeSteps: this.timeSteps,
                useBrightnessOverride: this.useBrightnessOverride,
                brightnessOverride: this.brightnessOverride,
                debug: this.debug
            };
        }

        deserialize(data) {
            if (!data) return;
            if (data.colorMode !== undefined) this.colorMode = data.colorMode;
            if (data.predefinedWedge !== undefined) this.predefinedWedge = data.predefinedWedge;
            if (data.startHue !== undefined) this.startHue = data.startHue;
            if (data.startSaturation !== undefined) this.startSaturation = data.startSaturation;
            if (data.startBrightness !== undefined) this.startBrightness = data.startBrightness;
            if (data.endHue !== undefined) this.endHue = data.endHue;
            if (data.endSaturation !== undefined) this.endSaturation = data.endSaturation;
            if (data.endBrightness !== undefined) this.endBrightness = data.endBrightness;
            if (data.rangeMode !== undefined) this.rangeMode = data.rangeMode;
            if (data.startValue !== undefined) this.startValue = data.startValue;
            if (data.endValue !== undefined) this.endValue = data.endValue;
            if (data.startTimeHours !== undefined) this.startTimeHours = data.startTimeHours;
            if (data.startTimeMinutes !== undefined) this.startTimeMinutes = data.startTimeMinutes;
            if (data.startTimePeriod !== undefined) this.startTimePeriod = data.startTimePeriod;
            if (data.endTimeHours !== undefined) this.endTimeHours = data.endTimeHours;
            if (data.endTimeMinutes !== undefined) this.endTimeMinutes = data.endTimeMinutes;
            if (data.endTimePeriod !== undefined) this.endTimePeriod = data.endTimePeriod;
            if (data.timerDurationValue !== undefined) this.timerDurationValue = data.timerDurationValue;
            if (data.timerUnit !== undefined) this.timerUnit = data.timerUnit;
            if (data.timeSteps !== undefined) this.timeSteps = data.timeSteps;
            if (data.useBrightnessOverride !== undefined) this.useBrightnessOverride = data.useBrightnessOverride;
            if (data.brightnessOverride !== undefined) this.brightnessOverride = data.brightnessOverride;
            // Apply wedge preset if predefined mode
            if (this.colorMode === 'predefined' && WEDGE_PRESETS[this.predefinedWedge]) {
                const preset = WEDGE_PRESETS[this.predefinedWedge];
                this.startHue = preset.startHue;
                this.startSaturation = preset.startSat;
                this.startBrightness = preset.startBri;
                this.endHue = preset.endHue;
                this.endSaturation = preset.endSat;
                this.endBrightness = preset.endBri;
            }
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function ColorGradientNodeComponent({ data, emit }) {
        const [colorMode, setColorMode] = useState(data.colorMode);
        const [predefinedWedge, setPredefinedWedge] = useState(data.predefinedWedge);
        const [startHue, setStartHue] = useState(data.startHue);
        const [startSaturation, setStartSaturation] = useState(data.startSaturation);
        const [startBrightness, setStartBrightness] = useState(data.startBrightness);
        const [endHue, setEndHue] = useState(data.endHue);
        const [endSaturation, setEndSaturation] = useState(data.endSaturation);
        const [endBrightness, setEndBrightness] = useState(data.endBrightness);
        const [rangeMode, setRangeMode] = useState(data.rangeMode);
        const [startValue, setStartValue] = useState(data.startValue);
        const [endValue, setEndValue] = useState(data.endValue);
        const [startTimeHours, setStartTimeHours] = useState(data.startTimeHours);
        const [startTimeMinutes, setStartTimeMinutes] = useState(data.startTimeMinutes);
        const [startTimePeriod, setStartTimePeriod] = useState(data.startTimePeriod);
        const [endTimeHours, setEndTimeHours] = useState(data.endTimeHours);
        const [endTimeMinutes, setEndTimeMinutes] = useState(data.endTimeMinutes);
        const [endTimePeriod, setEndTimePeriod] = useState(data.endTimePeriod);
        const [timerDuration, setTimerDuration] = useState(data.timerDurationValue);
        const [timerUnit, setTimerUnit] = useState(data.timerUnit);
        const [timeSteps, setTimeSteps] = useState(data.timeSteps);
        const [useBrightnessOverride, setUseBrightnessOverride] = useState(data.useBrightnessOverride);
        const [brightnessOverride, setBrightnessOverride] = useState(data.brightnessOverride);
        const [position, setPosition] = useState(data.position || 0);
        const [isInRange, setIsInRange] = useState(data.isInRange || false);
        const [lastColor, setLastColor] = useState(data.lastColor);
        const [isCollapsed, setIsCollapsed] = useState(false);
        
        // Track input overrides for time values
        const [inputStartTime, setInputStartTime] = useState(null);
        const [inputEndTime, setInputEndTime] = useState(null);

        const gradientCanvasRef = useRef(null);

        // Sync from node on mount
        useEffect(() => {
            setColorMode(data.colorMode);
            setPredefinedWedge(data.predefinedWedge);
            setStartHue(data.startHue);
            setStartSaturation(data.startSaturation);
            setStartBrightness(data.startBrightness);
            setEndHue(data.endHue);
            setEndSaturation(data.endSaturation);
            setEndBrightness(data.endBrightness);
            setRangeMode(data.rangeMode);
            setStartValue(data.startValue);
            setEndValue(data.endValue);
            setStartTimeHours(data.startTimeHours);
            setStartTimeMinutes(data.startTimeMinutes);
            setStartTimePeriod(data.startTimePeriod);
            setEndTimeHours(data.endTimeHours);
            setEndTimeMinutes(data.endTimeMinutes);
            setEndTimePeriod(data.endTimePeriod);
            setTimerDuration(data.timerDurationValue);
            setTimerUnit(data.timerUnit);
            setTimeSteps(data.timeSteps);
            setUseBrightnessOverride(data.useBrightnessOverride);
            setBrightnessOverride(data.brightnessOverride);
        }, [data]);

        // Update gradient canvas
        useEffect(() => {
            const canvas = gradientCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            // High-DPI canvas setup for crisp text
            const dpr = window.devicePixelRatio || 1;
            const displayWidth = 400;
            const displayHeight = 50;
            
            // Set canvas size accounting for device pixel ratio
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            ctx.scale(dpr, dpr);
            
            const width = displayWidth;
            const height = displayHeight;
            const gradientHeight = 28; // Height of gradient bar
            const scaleHeight = 22; // Height for numbers and tick marks

            // Clear canvas
            ctx.clearRect(0, 0, width, height);

            // Draw gradient (linear interpolation)
            const steps = 100;
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const hue = startHue + t * (endHue - startHue);
                const sat = startSaturation + t * (endSaturation - startSaturation);
                const bri = startBrightness + t * (endBrightness - startBrightness);
                ctx.fillStyle = `hsl(${hue}, ${sat}%, ${Math.max(20, bri / 2)}%)`;
                ctx.fillRect((i / steps) * width, 0, width / steps + 1, gradientHeight);
            }

            // Draw scale background
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, gradientHeight, width, scaleHeight);

            // Draw tick marks and numbers based on range mode
            ctx.fillStyle = '#c9d1d9';
            ctx.strokeStyle = '#a0aec0';
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 1;

            // Helper to convert 24h time to display time
            const formatTime = (hours24, minutes) => {
                const h = hours24 % 12 || 12;
                const m = String(minutes).padStart(2, '0');
                const period = hours24 >= 12 ? 'PM' : 'AM';
                return `${h}:${m}${period}`;
            };

            // Helper to convert 12h time to 24h minutes from midnight
            const to24HourMinutes = (hours, minutes, period) => {
                let h = hours;
                if (period === 'PM' && h !== 12) h += 12;
                if (period === 'AM' && h === 12) h = 0;
                return h * 60 + minutes;
            };

            // Generate scale labels based on range mode
            const numTicks = 5; // Show 5 labels (start, 25%, 50%, 75%, end)
            const labelY = gradientHeight + scaleHeight / 2 + 2;
            
            if (rangeMode === 'time') {
                // Time mode: show times from start to end
                const startMins = to24HourMinutes(startTimeHours, startTimeMinutes, startTimePeriod);
                let endMins = to24HourMinutes(endTimeHours, endTimeMinutes, endTimePeriod);
                
                // Handle overnight (end time before start time)
                if (endMins <= startMins) {
                    endMins += 24 * 60;
                }
                
                for (let i = 0; i <= numTicks; i++) {
                    const x = (i / numTicks) * width;
                    const t = i / numTicks;
                    let mins = startMins + t * (endMins - startMins);
                    mins = mins % (24 * 60); // Wrap around midnight
                    const hours24 = Math.floor(mins / 60);
                    const minutes = Math.round(mins % 60);
                    
                    // Draw tick mark
                    ctx.beginPath();
                    ctx.moveTo(x, gradientHeight);
                    ctx.lineTo(x, gradientHeight + 5);
                    ctx.stroke();
                    
                    // Draw time label
                    const label = formatTime(hours24, minutes);
                    ctx.fillText(label, x, labelY);
                }
            } else if (rangeMode === 'timer') {
                // Timer mode: show 0 to duration with units
                const unitLabel = timerUnit === 'minutes' ? 'm' : (timerUnit === 'hours' ? 'h' : 's');
                const duration = timerDuration || 1;
                
                for (let i = 0; i <= numTicks; i++) {
                    const x = (i / numTicks) * width;
                    const t = i / numTicks;
                    const value = Math.round(t * duration * 10) / 10; // One decimal place
                    
                    // Draw tick mark
                    ctx.beginPath();
                    ctx.moveTo(x, gradientHeight);
                    ctx.lineTo(x, gradientHeight + 5);
                    ctx.stroke();
                    
                    // Draw value label
                    const label = `${value}${unitLabel}`;
                    ctx.fillText(label, x, labelY);
                }
            } else {
                // Numerical mode: show startValue to endValue
                const start = startValue !== undefined ? startValue : 0;
                const end = endValue !== undefined ? endValue : 100;
                
                for (let i = 0; i <= numTicks; i++) {
                    const x = (i / numTicks) * width;
                    const t = i / numTicks;
                    const value = Math.round(start + t * (end - start));
                    
                    // Draw tick mark
                    ctx.beginPath();
                    ctx.moveTo(x, gradientHeight);
                    ctx.lineTo(x, gradientHeight + 5);
                    ctx.stroke();
                    
                    // Draw value label
                    ctx.fillText(value.toString(), x, labelY);
                }
            }

            // Draw position indicator (triangle pointing up from scale into gradient)
            const markerX = Math.max(5, Math.min(width - 5, position * width));
            
            // Draw the tick line
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(markerX, 0);
            ctx.lineTo(markerX, gradientHeight + 8);
            ctx.stroke();

            // Draw triangle indicator at bottom
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.moveTo(markerX - 6, gradientHeight + scaleHeight);
            ctx.lineTo(markerX + 6, gradientHeight + scaleHeight);
            ctx.lineTo(markerX, gradientHeight + 8);
            ctx.closePath();
            ctx.fill();
        }, [startHue, startSaturation, startBrightness, endHue, endSaturation, endBrightness, position, isInRange, rangeMode, startValue, endValue, startTimeHours, startTimeMinutes, startTimePeriod, endTimeHours, endTimeMinutes, endTimePeriod, timerDuration, timerUnit]);

        // Periodic update for runtime state
        useEffect(() => {
            const interval = setInterval(() => {
                setPosition(data.position || 0);
                setIsInRange(data.isInRange || false);
                setLastColor(data.lastColor);
                
                // Track input time overrides from connected nodes
                setInputStartTime(data.inputStartTime || null);
                setInputEndTime(data.inputEndTime || null);
            }, 500);
            return () => clearInterval(interval);
        }, [data]);

        const triggerUpdate = useCallback(() => {
            // Sync instance vars to properties for serialization
            if (data.syncToProperties) data.syncToProperties();
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        const handleColorModeChange = (e) => {
            const val = e.target.value;
            setColorMode(val);
            data.colorMode = val;
            if (val === 'predefined' && WEDGE_PRESETS[predefinedWedge]) {
                const preset = WEDGE_PRESETS[predefinedWedge];
                data.startHue = preset.startHue;
                data.startSaturation = preset.startSat;
                data.startBrightness = preset.startBri;
                data.endHue = preset.endHue;
                data.endSaturation = preset.endSat;
                data.endBrightness = preset.endBri;
                setStartHue(preset.startHue);
                setStartSaturation(preset.startSat);
                setStartBrightness(preset.startBri);
                setEndHue(preset.endHue);
                setEndSaturation(preset.endSat);
                setEndBrightness(preset.endBri);
            }
            triggerUpdate();
        };

        const handleWedgeChange = (e) => {
            const val = e.target.value;
            setPredefinedWedge(val);
            data.predefinedWedge = val;
            if (colorMode === 'predefined' && WEDGE_PRESETS[val]) {
                const preset = WEDGE_PRESETS[val];
                data.startHue = preset.startHue;
                data.startSaturation = preset.startSat;
                data.startBrightness = preset.startBri;
                data.endHue = preset.endHue;
                data.endSaturation = preset.endSat;
                data.endBrightness = preset.endBri;
                setStartHue(preset.startHue);
                setStartSaturation(preset.startSat);
                setStartBrightness(preset.startBri);
                setEndHue(preset.endHue);
                setEndSaturation(preset.endSat);
                setEndBrightness(preset.endBri);
            }
            triggerUpdate();
        };

        const handleRangeModeChange = (e) => {
            const val = e.target.value;
            setRangeMode(val);
            data.rangeMode = val;
            data.timerStart = null;
            data.currentStep = 0;
            data.lastTimeStep = null;
            triggerUpdate();
        };

        const createSliderHandler = (setter, nodeProp) => (e) => {
            const val = parseInt(e.target.value, 10);
            setter(val);
            data[nodeProp] = val;
            triggerUpdate();
        };

        const createNumberHandler = (setter, nodeProp, min = 0) => (e) => {
            const val = Math.max(min, parseInt(e.target.value, 10) || 0);
            setter(val);
            data[nodeProp] = val;
            triggerUpdate();
        };

        // Helper to calculate slider fill gradient for Tron theme
        const getSliderStyle = (value, min, max, isHue = false) => {
            const percent = ((value - min) / (max - min)) * 100;
            if (isHue) {
                // Rainbow gradient for hue sliders
                return {
                    background: `linear-gradient(to right, 
                        hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), 
                        hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))`
                };
            }
            // Tron-style: cyan glow fill that transitions to darker
            return {
                background: `linear-gradient(90deg, 
                    rgba(0, 243, 255, 0.5) 0%, 
                    rgba(0, 243, 255, 0.4) ${percent}%, 
                    rgba(0, 243, 255, 0.15) ${percent}%)`
            };
        };

        const currentColorStyle = lastColor
            ? { backgroundColor: `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})` }
            : { backgroundColor: '#333' };

        // Stop pointer events from propagating to canvas (enables slider/dropdown interaction)
        const stopPropagation = (e) => e.stopPropagation();
        
        // Stop wheel events from propagating - allows scrolling in controls area without zooming canvas
        const stopWheelPropagation = (e) => e.stopPropagation();

        // Get inputs and outputs for socket rendering
        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        // RENDER_CONTENT_HERE
        return el('div', {
            className: `color-gradient-node ${isInRange ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`
        }, [
            // Header
            el('div', { key: 'header', className: 'cgn-header' }, [
                el('div', {
                    key: 'toggle',
                    className: 'cgn-collapse-toggle',
                    onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                }, isCollapsed ? "▶" : "▼"),
                el('div', { key: 'title', className: 'cgn-title' }, "Stepped Color Gradient")
            ]),

            // IO Container
            el('div', { key: 'io', className: 'cgn-io-container' }, [
                el('div', { key: 'inputs', className: 'cgn-inputs' }, 
                    inputs.map(([key, input]) => 
                        el('div', { key, className: 'cgn-socket-row' }, [
                            el(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: input.socket, nodeId: data.id, side: "input", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            }),
                            el('span', { key: 'label', className: 'cgn-socket-label' }, input.label)
                        ])
                    )
                ),
                el('div', { key: 'outputs', className: 'cgn-outputs' }, 
                    outputs.map(([key, output]) => 
                        el('div', { key, className: 'cgn-socket-row cgn-socket-row-right' }, [
                            el('span', { key: 'label', className: 'cgn-socket-label' }, output.label),
                            el(RefComponent, {
                                key: 'socket',
                                init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                                unmount: ref => emit({ type: "unmount", data: { element: ref } })
                            })
                        ])
                    )
                )
            ]),

            // Status Section
            el('div', { key: 'status', className: 'cgn-status-section', onPointerDown: stopPropagation }, [
                el('div', { key: 'gradient', className: 'cgn-gradient-container' }, 
                    el('canvas', { ref: gradientCanvasRef, className: 'cgn-gradient-canvas' })
                ),
                el('div', { key: 'swatch', className: 'cgn-swatch-row' }, [
                    el('div', { key: 'color', className: 'cgn-current-color', style: currentColorStyle }),
                    el('span', { key: 'text', className: 'cgn-status' }, isInRange ? 'In Range' : 'Outside Range')
                ]),
                el('div', { key: 'time', className: 'cgn-time-display' }, [
                    el('div', { key: 'start', className: `cgn-time-display-row ${inputStartTime ? 'cgn-time-from-input' : ''}` }, 
                        inputStartTime 
                            ? el('span', null, [el('span', { key: 'badge', className: 'cgn-input-badge' }, 'INPUT'), el('span', { key: 'text' }, ` Start: ${inputStartTime}`)])
                            : el('span', null, [el('span', { key: 'badge', className: 'cgn-local-badge' }, 'LOCAL'), el('span', { key: 'text' }, ` Start: ${startTimeHours}:${String(startTimeMinutes).padStart(2, '0')} ${startTimePeriod}`)])
                    ),
                    el('div', { key: 'end', className: `cgn-time-display-row ${inputEndTime ? 'cgn-time-from-input' : ''}` }, 
                        inputEndTime 
                            ? el('span', null, [el('span', { key: 'badge', className: 'cgn-input-badge' }, 'INPUT'), el('span', { key: 'text' }, ` End: ${inputEndTime}`)])
                            : el('span', null, [el('span', { key: 'badge', className: 'cgn-local-badge' }, 'LOCAL'), el('span', { key: 'text' }, ` End: ${endTimeHours}:${String(endTimeMinutes).padStart(2, '0')} ${endTimePeriod}`)])
                    )
                ])
            ]),

            // Controls
            !isCollapsed ? el('div', { key: 'controls', className: 'cgn-controls', onPointerDown: stopPropagation, onWheel: stopWheelPropagation }, [
                // Color Mode
                el('div', { key: 'colorMode', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Predefined: Choose from preset color ranges (Warm, Cool, etc). Custom: Define your own start and end HSV colors." }, [
                        el('span', { key: 'text' }, "Color Mode"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: colorMode, onChange: handleColorModeChange }, [
                        el('option', { key: 'predefined', value: 'predefined' }, 'Predefined'),
                        el('option', { key: 'custom', value: 'custom' }, 'Custom')
                    ])
                ]),

                // Range Mode
                el('div', { key: 'rangeMode', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Numerical: Map input value (0-100) to gradient. Time: Gradient follows clock time between start/end. Timer: Gradient progresses over a countdown duration." }, [
                        el('span', { key: 'text' }, "Range Mode"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: rangeMode, onChange: handleRangeModeChange }, [
                        el('option', { key: 'numerical', value: 'numerical' }, 'Numerical'),
                        el('option', { key: 'time', value: 'time' }, 'Time'),
                        el('option', { key: 'timer', value: 'timer' }, 'Timer')
                    ])
                ]),

                // Wedge Selection
                colorMode === 'predefined' ? el('div', { key: 'wedge', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Warm: Red to Yellow. Cool: Cyan to Blue. Warm-to-Cool: Full spectrum from red through green to blue." }, [
                        el('span', { key: 'text' }, "Wedge"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: predefinedWedge, onChange: handleWedgeChange }, [
                        el('option', { key: 'warm', value: 'warm' }, 'Warm'),
                        el('option', { key: 'cool', value: 'cool' }, 'Cool'),
                        el('option', { key: 'warm-to-cool', value: 'warm-to-cool' }, 'Warm to Cool')
                    ])
                ]) : null,

                // HSV Sliders
                colorMode === 'custom' ? [
                    el('div', { key: 'sh', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Start Hue: ${startHue}°`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 360, value: startHue, onChange: createSliderHandler(setStartHue, 'startHue'), className: 'cgn-slider', style: getSliderStyle(startHue, 0, 360, true) })
                    ]),
                    el('div', { key: 'ss', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Start Saturation: ${startSaturation}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: startSaturation, onChange: createSliderHandler(setStartSaturation, 'startSaturation'), className: 'cgn-slider', style: getSliderStyle(startSaturation, 0, 100) })
                    ]),
                    el('div', { key: 'sb', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Start Brightness: ${startBrightness}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: startBrightness, onChange: createSliderHandler(setStartBrightness, 'startBrightness'), className: 'cgn-slider', style: getSliderStyle(startBrightness, 0, 100) })
                    ]),
                    el('div', { key: 'eh', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `End Hue: ${endHue}°`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 360, value: endHue, onChange: createSliderHandler(setEndHue, 'endHue'), className: 'cgn-slider', style: getSliderStyle(endHue, 0, 360, true) })
                    ]),
                    el('div', { key: 'es', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `End Saturation: ${endSaturation}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: endSaturation, onChange: createSliderHandler(setEndSaturation, 'endSaturation'), className: 'cgn-slider', style: getSliderStyle(endSaturation, 0, 100) })
                    ]),
                    el('div', { key: 'eb', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `End Brightness: ${endBrightness}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: endBrightness, onChange: createSliderHandler(setEndBrightness, 'endBrightness'), className: 'cgn-slider', style: getSliderStyle(endBrightness, 0, 100) })
                    ])
                ] : null,

                // Numerical Range
                el('div', { key: 'numRange', className: `cgn-section-group ${rangeMode !== 'numerical' ? 'ghosted' : ''}` }, [
                    el('div', { key: 'header', className: 'cgn-section-header cgn-tooltip', 'data-tooltip': "Maps the input value to the gradient. When input equals Range Start, output is the start color. When input equals Range End, output is the end color." }, [
                        el('span', { key: 'text' }, "Numerical Range"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('div', { key: 'startSection', className: 'cgn-section' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Range Start: ${startValue}`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: startValue, onChange: createSliderHandler(setStartValue, 'startValue'), className: 'cgn-slider', style: getSliderStyle(startValue, 0, 100) })
                    ]),
                    el('div', { key: 'endSection', className: 'cgn-section' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Range End: ${endValue}`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: endValue, onChange: createSliderHandler(setEndValue, 'endValue'), className: 'cgn-slider', style: getSliderStyle(endValue, 0, 100) })
                    ])
                ]),

                // Time Range
                el('div', { key: 'timeRange', className: `cgn-section-group ${rangeMode !== 'time' ? 'ghosted' : ''} ${(inputStartTime || inputEndTime) ? 'cgn-input-override' : ''}` }, [
                    el('div', { key: 'header', className: 'cgn-section-header cgn-tooltip', 'data-tooltip': "Gradient follows real clock time. At Start Time, outputs start color. At End Time, outputs end color. Supports overnight ranges (e.g., 10PM to 6AM)." }, [
                        el('span', { key: 'text' }, "Time Range"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?"),
                        (inputStartTime || inputEndTime) ? el('span', { key: 'notice', className: 'cgn-override-notice' }, "(Using Input Values)") : null
                    ]),
                    el('div', { key: 'startHours', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Start Time Hours: ${startTimeHours}`),
                        el('input', { type: 'range', min: 1, max: 12, value: startTimeHours, onChange: createSliderHandler(setStartTimeHours, 'startTimeHours'), className: 'cgn-slider', style: getSliderStyle(startTimeHours, 1, 12) })
                    ]),
                    el('div', { key: 'startMinutes', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Start Time Minutes: ${startTimeMinutes}`),
                        el('input', { type: 'range', min: 0, max: 59, value: startTimeMinutes, onChange: createSliderHandler(setStartTimeMinutes, 'startTimeMinutes'), className: 'cgn-slider', style: getSliderStyle(startTimeMinutes, 0, 59) })
                    ]),
                    el('div', { key: 'startPeriod', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, "Start Time Period"),
                        el('select', { className: 'cgn-select', value: startTimePeriod, onChange: (e) => { setStartTimePeriod(e.target.value); data.startTimePeriod = e.target.value; triggerUpdate(); } }, [
                            el('option', { key: 'AM', value: 'AM' }, 'AM'),
                            el('option', { key: 'PM', value: 'PM' }, 'PM')
                        ])
                    ]),
                    el('div', { key: 'endHours', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `End Time Hours: ${endTimeHours}`),
                        el('input', { type: 'range', min: 1, max: 12, value: endTimeHours, onChange: createSliderHandler(setEndTimeHours, 'endTimeHours'), className: 'cgn-slider', style: getSliderStyle(endTimeHours, 1, 12) })
                    ]),
                    el('div', { key: 'endMinutes', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `End Time Minutes: ${endTimeMinutes}`),
                        el('input', { type: 'range', min: 0, max: 59, value: endTimeMinutes, onChange: createSliderHandler(setEndTimeMinutes, 'endTimeMinutes'), className: 'cgn-slider', style: getSliderStyle(endTimeMinutes, 0, 59) })
                    ]),
                    el('div', { key: 'endPeriod', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, "End Time Period"),
                        el('select', { className: 'cgn-select', value: endTimePeriod, onChange: (e) => { setEndTimePeriod(e.target.value); data.endTimePeriod = e.target.value; triggerUpdate(); } }, [
                            el('option', { key: 'AM', value: 'AM' }, 'AM'),
                            el('option', { key: 'PM', value: 'PM' }, 'PM')
                        ])
                    ])
                ]),

                // Timer Controls
                el('div', { key: 'timer', className: `cgn-section-group ${rangeMode !== 'timer' ? 'ghosted' : ''}` }, [
                    el('div', { key: 'header', className: 'cgn-section-header cgn-tooltip', 'data-tooltip': "Gradient progresses over time when triggered. Duration sets total time. Steps control how many discrete color changes occur during the countdown." }, [
                        el('span', { key: 'text' }, "Timer Settings"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('div', { key: 'duration', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Timer Duration: ${timerDuration}`),
                        el('input', { type: 'range', min: 1, max: 120, value: timerDuration, onChange: createSliderHandler(setTimerDuration, 'timerDurationValue'), className: 'cgn-slider', style: getSliderStyle(timerDuration, 1, 120) })
                    ]),
                    el('div', { key: 'unit', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, "Timer Unit"),
                        el('select', { className: 'cgn-select', value: timerUnit, onChange: (e) => { setTimerUnit(e.target.value); data.timerUnit = e.target.value; triggerUpdate(); } }, [
                            el('option', { key: 'seconds', value: 'seconds' }, 'Seconds'),
                            el('option', { key: 'minutes', value: 'minutes' }, 'Minutes'),
                            el('option', { key: 'hours', value: 'hours' }, 'Hours')
                        ])
                    ]),
                    el('div', { key: 'steps', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Time Steps: ${timeSteps}`),
                        el('input', { type: 'range', min: 1, max: 120, value: timeSteps, onChange: createSliderHandler(setTimeSteps, 'timeSteps'), className: 'cgn-slider', style: getSliderStyle(timeSteps, 1, 120) })
                    ])
                ]),

                // Brightness Override
                el('div', { key: 'briOverride', className: 'cgn-section cgn-toggle-row' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "When enabled, uses a fixed brightness value instead of the gradient's brightness. Useful for keeping consistent light levels while colors change." }, [
                        el('span', { key: 'text' }, "Override Brightness"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('input', { type: 'checkbox', checked: useBrightnessOverride, onChange: (e) => { setUseBrightnessOverride(e.target.checked); data.useBrightnessOverride = e.target.checked; triggerUpdate(); }, className: 'cgn-checkbox' })
                ]),
                useBrightnessOverride ? el('div', { key: 'briVal', className: 'cgn-section' }, [
                    el('label', { className: 'cgn-label' }, `Brightness: ${brightnessOverride}`),
                    el('input', { type: 'range', min: 0, max: 254, value: brightnessOverride, onChange: createSliderHandler(setBrightnessOverride, 'brightnessOverride'), className: 'cgn-slider', style: getSliderStyle(brightnessOverride, 0, 254) })
                ]) : null

            ]) : null
        ]);
    }

    window.nodeRegistry.register('ColorGradientNode', {
        label: "Stepped Color Gradient",
        category: "CC_Control_Nodes",
        nodeClass: ColorGradientNode,
        factory: (cb) => new ColorGradientNode(cb),
        component: ColorGradientNodeComponent
    });

    console.log("[ColorGradientNode] Registered");
})();
