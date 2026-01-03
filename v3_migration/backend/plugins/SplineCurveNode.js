/**
 * SplineCurveNode.js
 * 
 * Spline curve for mapping values through a curve shape.
 * Works like Timeline Color node but outputs numeric values instead of colors.
 * Uses the same CSS styling as Timeline Color (cgn-* classes).
 * 
 * Modes:
 *   - Time of Day: Uses current time (X axis = hours, Y axis = output value)
 *   - Timer: Runs a timer from 0 to duration, outputs Y value
 *   - Numerical: Maps an input value through the curve
 * 
 * Perfect for volume automation, brightness schedules, or any value that should
 * follow a custom curve over time.
 * 
 * @author T2AutoTron
 * @version 2.1.0
 */

(function() {
    'use strict';

    // Wait for dependencies
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[SplineCurveNode] Missing dependencies, retrying...');
        setTimeout(arguments.callee, 100);
        return;
    }

    // Wait for spline base
    if (!window.T2Spline) {
        console.warn('[SplineCurveNode] Waiting for T2Spline...');
        setTimeout(arguments.callee, 100);
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const { SplineEditor, PresetDropdown, evaluate, createDefaultCurve } = window.T2Spline;
    const el = React.createElement;
    const RefComponent = window.RefComponent;

    // =========================================================================
    // NODE CLASS
    // =========================================================================

    class SplineCurveNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super('Spline Value');
            this.changeCallback = changeCallback;

            // Properties - matching Timeline Color pattern
            this.properties = {
                points: createDefaultCurve(),
                interpolation: 'catmull-rom',
                
                // Mode: 'time', 'timer', 'numerical'
                rangeMode: 'time',
                
                // Numerical mode
                startValue: 0,
                endValue: 100,
                
                // Time of Day mode settings (12-hour format like Timeline Color)
                startTimeHours: 8,
                startTimeMinutes: 0,
                startTimePeriod: 'AM',
                endTimeHours: 6,
                endTimeMinutes: 0,
                endTimePeriod: 'PM',
                
                // Timer mode settings
                timerDurationValue: 60,
                timerUnit: 'seconds',
                timerLoopMode: 'none',
                
                // Output scaling
                outputMin: 0,
                outputMax: 100,
                outputInteger: true,
                outputStepInterval: 1, // seconds
                
                // State
                position: 0,
                isInRange: false,
                outputValue: 0,
                
                // Editor size
                editorWidth: 300,
                editorHeight: 180,
                
                // UI state
                collapsed: false,
                previewMode: false,
                previewPosition: 0
            };
            
            // Timer state
            this.timerStart = null;
            this.pingPongDirection = 1;
            this.lastOutputTime = 0;
            this.lastOutputValue = null;

            // Sockets
            this.addInput('value', new ClassicPreset.Input(window.sockets.number, 'VALUE'));
            this.addInput('trigger', new ClassicPreset.Input(window.sockets.boolean, 'TRIGGER'));
            this.addInput('timerDuration', new ClassicPreset.Input(window.sockets.number, 'TIMER DURATION'));
            this.addInput('startTime', new ClassicPreset.Input(window.sockets.any, 'START TIME'));
            this.addInput('endTime', new ClassicPreset.Input(window.sockets.any, 'END TIME'));
            
            this.addOutput('value', new ClassicPreset.Output(window.sockets.number, 'Value'));
        }

        /**
         * Parse time input string (HH:MM, HH:MM AM/PM, etc.)
         */
        parseTimeInput(timeStr) {
            if (!timeStr || typeof timeStr !== 'string') return null;
            
            // Handle "HH:MM AM/PM" format
            const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (match12) {
                let hours = parseInt(match12[1], 10);
                const minutes = parseInt(match12[2], 10);
                const period = match12[3]?.toUpperCase() || (hours >= 12 ? 'PM' : 'AM');
                
                // Convert to 12-hour format if needed
                if (hours > 12) {
                    hours -= 12;
                } else if (hours === 0) {
                    hours = 12;
                }
                
                return { hours, minutes, period };
            }
            return null;
        }

        /**
         * Convert 12-hour time to decimal hours (0-24)
         */
        to24Hour(hours, minutes, period) {
            let h = parseInt(hours, 10);
            const m = parseInt(minutes, 10);
            if (period === 'PM' && h < 12) h += 12;
            if (period === 'AM' && h === 12) h = 0;
            return h + m / 60;
        }

        /**
         * Get current position based on mode
         */
        calculatePosition(inputs) {
            const mode = this.properties.rangeMode;
            
            if (mode === 'numerical') {
                // Use input value
                const inputVal = inputs.value?.[0];
                if (inputVal !== undefined && inputVal !== null) {
                    const start = this.properties.startValue;
                    const end = this.properties.endValue;
                    const range = end - start;
                    if (range === 0) return { position: 0, isInRange: true };
                    const pos = (inputVal - start) / range;
                    return { position: Math.max(0, Math.min(1, pos)), isInRange: true };
                }
                return { position: 0, isInRange: false };
                
            } else if (mode === 'time') {
                // Time of day mode
                let startH = this.properties.startTimeHours;
                let startM = this.properties.startTimeMinutes;
                let startP = this.properties.startTimePeriod;
                let endH = this.properties.endTimeHours;
                let endM = this.properties.endTimeMinutes;
                let endP = this.properties.endTimePeriod;
                
                // Check for socket overrides
                if (inputs.startTime?.[0]) {
                    const parsed = this.parseTimeInput(inputs.startTime[0]);
                    if (parsed) { startH = parsed.hours; startM = parsed.minutes; startP = parsed.period; }
                }
                if (inputs.endTime?.[0]) {
                    const parsed = this.parseTimeInput(inputs.endTime[0]);
                    if (parsed) { endH = parsed.hours; endM = parsed.minutes; endP = parsed.period; }
                }
                
                const now = new Date();
                const currentHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
                
                let startDecimal = this.to24Hour(startH, startM, startP);
                let endDecimal = this.to24Hour(endH, endM, endP);
                
                // Handle overnight spans
                let isInRange, position;
                if (endDecimal <= startDecimal) {
                    // Overnight span (e.g., 10 PM to 6 AM)
                    endDecimal += 24;
                    const adjustedCurrent = currentHour < startDecimal ? currentHour + 24 : currentHour;
                    isInRange = adjustedCurrent >= startDecimal && adjustedCurrent <= endDecimal;
                    position = (adjustedCurrent - startDecimal) / (endDecimal - startDecimal);
                } else {
                    // Normal span
                    isInRange = currentHour >= startDecimal && currentHour <= endDecimal;
                    position = (currentHour - startDecimal) / (endDecimal - startDecimal);
                }
                
                return { position: Math.max(0, Math.min(1, position)), isInRange };
                
            } else if (mode === 'timer') {
                // Timer mode
                const trigger = inputs.trigger?.[0];
                
                // Handle trigger
                if (trigger && !this.timerStart) {
                    this.timerStart = Date.now();
                    this.pingPongDirection = 1;
                }
                
                if (!this.timerStart) {
                    return { position: 0, isInRange: false };
                }
                
                // Override duration from socket if provided
                let duration = this.properties.timerDurationValue;
                if (inputs.timerDuration?.[0] !== undefined) {
                    duration = inputs.timerDuration[0];
                }
                
                const unit = this.properties.timerUnit;
                const unitMultiplier = unit === 'hours' ? 3600000 : unit === 'minutes' ? 60000 : 1000;
                const durationMs = duration * unitMultiplier;
                const elapsed = Date.now() - this.timerStart;
                const loopMode = this.properties.timerLoopMode;
                
                let position;
                if (elapsed >= durationMs) {
                    if (loopMode === 'loop') {
                        this.timerStart = Date.now();
                        this.pingPongDirection = 1;
                        position = 0;
                    } else if (loopMode === 'ping-pong') {
                        this.pingPongDirection *= -1;
                        this.timerStart = Date.now();
                        position = this.pingPongDirection === 1 ? 0 : 1;
                    } else {
                        position = 1;
                    }
                } else {
                    const rawPosition = elapsed / durationMs;
                    position = this.pingPongDirection === 1 ? rawPosition : 1 - rawPosition;
                }
                
                return { position: Math.max(0, Math.min(1, position)), isInRange: true };
            }
            
            return { position: 0, isInRange: false };
        }

        /**
         * Reset timer
         */
        resetTimer() {
            this.timerStart = null;
            this.pingPongDirection = 1;
            this.properties.position = 0;
            if (this.changeCallback) this.changeCallback();
        }

        /**
         * Process data through the curve
         */
        data(inputs) {
            // Preview mode overrides actual position
            if (this.properties.previewMode) {
                const curveValue = evaluate(this.properties.points, this.properties.previewPosition, this.properties.interpolation);
                const output = this.properties.outputMin + curveValue * (this.properties.outputMax - this.properties.outputMin);
                const finalOutput = this.properties.outputInteger ? Math.round(output) : output;
                this.properties.outputValue = finalOutput;
                return { value: finalOutput };
            }
            
            const { position, isInRange } = this.calculatePosition(inputs);
            this.properties.position = position;
            this.properties.isInRange = isInRange;
            
            // Evaluate curve at position
            const curveValue = evaluate(this.properties.points, position, this.properties.interpolation);
            
            // Scale to output range
            let output = this.properties.outputMin + curveValue * (this.properties.outputMax - this.properties.outputMin);
            if (this.properties.outputInteger) {
                output = Math.round(output);
            }
            
            this.properties.outputValue = output;

            // Throttle output
            const stepInterval = (this.properties.outputStepInterval || 1) * 1000;
            const now = Date.now();
            const timeSinceLastOutput = now - this.lastOutputTime;
            
            if (timeSinceLastOutput >= stepInterval || this.lastOutputValue === null) {
                this.lastOutputTime = now;
                this.lastOutputValue = output;
                return { value: output };
            }
            
            return { value: this.lastOutputValue };
        }

        serialize() {
            return {
                points: this.properties.points,
                interpolation: this.properties.interpolation,
                rangeMode: this.properties.rangeMode,
                startValue: this.properties.startValue,
                endValue: this.properties.endValue,
                startTimeHours: this.properties.startTimeHours,
                startTimeMinutes: this.properties.startTimeMinutes,
                startTimePeriod: this.properties.startTimePeriod,
                endTimeHours: this.properties.endTimeHours,
                endTimeMinutes: this.properties.endTimeMinutes,
                endTimePeriod: this.properties.endTimePeriod,
                timerDurationValue: this.properties.timerDurationValue,
                timerUnit: this.properties.timerUnit,
                timerLoopMode: this.properties.timerLoopMode,
                outputMin: this.properties.outputMin,
                outputMax: this.properties.outputMax,
                outputInteger: this.properties.outputInteger,
                outputStepInterval: this.properties.outputStepInterval,
                editorWidth: this.properties.editorWidth,
                editorHeight: this.properties.editorHeight,
                collapsed: this.properties.collapsed
            };
        }

        restore(state) {
            const data = state.properties || state;
            
            if (data.points) this.properties.points = data.points;
            if (data.interpolation) this.properties.interpolation = data.interpolation;
            if (data.rangeMode) this.properties.rangeMode = data.rangeMode;
            if (data.startValue !== undefined) this.properties.startValue = data.startValue;
            if (data.endValue !== undefined) this.properties.endValue = data.endValue;
            if (data.startTimeHours !== undefined) this.properties.startTimeHours = data.startTimeHours;
            if (data.startTimeMinutes !== undefined) this.properties.startTimeMinutes = data.startTimeMinutes;
            if (data.startTimePeriod) this.properties.startTimePeriod = data.startTimePeriod;
            if (data.endTimeHours !== undefined) this.properties.endTimeHours = data.endTimeHours;
            if (data.endTimeMinutes !== undefined) this.properties.endTimeMinutes = data.endTimeMinutes;
            if (data.endTimePeriod) this.properties.endTimePeriod = data.endTimePeriod;
            if (data.timerDurationValue !== undefined) this.properties.timerDurationValue = data.timerDurationValue;
            if (data.timerUnit) this.properties.timerUnit = data.timerUnit;
            if (data.timerLoopMode) this.properties.timerLoopMode = data.timerLoopMode;
            if (data.outputMin !== undefined) this.properties.outputMin = data.outputMin;
            if (data.outputMax !== undefined) this.properties.outputMax = data.outputMax;
            if (data.outputInteger !== undefined) this.properties.outputInteger = data.outputInteger;
            if (data.outputStepInterval !== undefined) this.properties.outputStepInterval = data.outputStepInterval;
            if (data.editorWidth) this.properties.editorWidth = data.editorWidth;
            if (data.editorHeight) this.properties.editorHeight = data.editorHeight;
            if (data.collapsed !== undefined) this.properties.collapsed = data.collapsed;
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // =========================================================================
    // REACT COMPONENT
    // =========================================================================

    function SplineCurveNodeComponent({ data, emit }) {
        const [points, setPoints] = useState(data.properties.points);
        const [collapsed, setCollapsed] = useState(data.properties.collapsed || false);
        const [rangeMode, setRangeMode] = useState(data.properties.rangeMode);
        const [startValue, setStartValue] = useState(data.properties.startValue);
        const [endValue, setEndValue] = useState(data.properties.endValue);
        const [startTimeHours, setStartTimeHours] = useState(data.properties.startTimeHours);
        const [startTimeMinutes, setStartTimeMinutes] = useState(data.properties.startTimeMinutes);
        const [startTimePeriod, setStartTimePeriod] = useState(data.properties.startTimePeriod);
        const [endTimeHours, setEndTimeHours] = useState(data.properties.endTimeHours);
        const [endTimeMinutes, setEndTimeMinutes] = useState(data.properties.endTimeMinutes);
        const [endTimePeriod, setEndTimePeriod] = useState(data.properties.endTimePeriod);
        const [timerDuration, setTimerDuration] = useState(data.properties.timerDurationValue);
        const [timerUnit, setTimerUnit] = useState(data.properties.timerUnit);
        const [timerLoopMode, setTimerLoopMode] = useState(data.properties.timerLoopMode || 'none');
        const [outputMin, setOutputMin] = useState(data.properties.outputMin);
        const [outputMax, setOutputMax] = useState(data.properties.outputMax);
        const [outputInteger, setOutputInteger] = useState(data.properties.outputInteger);
        const [outputStepInterval, setOutputStepInterval] = useState(data.properties.outputStepInterval || 1);
        const [editorWidth, setEditorWidth] = useState(data.properties.editorWidth);
        const [editorHeight, setEditorHeight] = useState(data.properties.editorHeight);
        const [position, setPosition] = useState(data.properties.position);
        const [isInRange, setIsInRange] = useState(data.properties.isInRange);
        const [outputValue, setOutputValue] = useState(data.properties.outputValue);
        const [previewMode, setPreviewMode] = useState(data.properties.previewMode || false);
        const [previewPosition, setPreviewPosition] = useState(data.properties.previewPosition || 0);
        const [inputStartTime, setInputStartTime] = useState(null);
        const [inputEndTime, setInputEndTime] = useState(null);
        
        const lastUIValuesRef = useRef({});

        // Periodic UI sync
        useEffect(() => {
            const interval = setInterval(() => {
                const newPos = data.properties.position || 0;
                const newRange = data.properties.isInRange || false;
                const newOutput = data.properties.outputValue || 0;
                
                const last = lastUIValuesRef.current;
                
                if (Math.abs(newPos - (last.pos || 0)) > 0.001) {
                    setPosition(newPos);
                    last.pos = newPos;
                }
                if (newRange !== last.range) {
                    setIsInRange(newRange);
                    last.range = newRange;
                }
                if (Math.abs(newOutput - (last.output || 0)) > 0.1) {
                    setOutputValue(newOutput);
                    last.output = newOutput;
                }
            }, 200);
            return () => clearInterval(interval);
        }, [data]);

        // Engine update interval
        useEffect(() => {
            const stepIntervalMs = (data.properties.outputStepInterval || 1) * 1000;
            const effectiveInterval = Math.max(500, stepIntervalMs);
            
            const engineInterval = setInterval(() => {
                const mode = data.properties.rangeMode;
                const inRange = data.properties.isInRange;
                const timerRunning = mode === 'timer' && data.timerStart;
                const timeActive = mode === 'time' && inRange;
                const preview = data.properties.previewMode;
                
                if (timerRunning || timeActive || preview) {
                    if (data.changeCallback) data.changeCallback();
                }
            }, effectiveInterval);
            
            return () => clearInterval(engineInterval);
        }, [data]);

        const triggerUpdate = useCallback(() => {
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        const handleCurveChange = useCallback((newPoints) => {
            data.properties.points = newPoints;
            setPoints(newPoints);
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handleCollapseToggle = useCallback(() => {
            const newCollapsed = !collapsed;
            data.properties.collapsed = newCollapsed;
            setCollapsed(newCollapsed);
        }, [collapsed, data]);

        const handleRangeModeChange = useCallback((e) => {
            const newMode = e.target.value;
            data.properties.rangeMode = newMode;
            setRangeMode(newMode);
            if (newMode !== 'timer') {
                data.resetTimer();
            }
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handleReset = useCallback(() => {
            data.resetTimer();
            data.properties.previewMode = false;
            data.properties.previewPosition = 0;
            setPreviewMode(false);
            setPreviewPosition(0);
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handlePreviewModeToggle = useCallback(() => {
            const newMode = !previewMode;
            data.properties.previewMode = newMode;
            setPreviewMode(newMode);
            if (!newMode) {
                data.properties.previewPosition = 0;
                setPreviewPosition(0);
            }
            triggerUpdate();
        }, [previewMode, data, triggerUpdate]);

        const stopPropagation = (e) => e.stopPropagation();

        // Resize handler (matches Timeline Color)
        const handleResizeStart = useCallback((e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = editorWidth;
            const startHeight = editorHeight;
            const pointerId = e.pointerId;

            const getScale = () => {
                let el = target;
                while (el && el !== document.body) {
                    const transform = window.getComputedStyle(el).transform;
                    if (transform && transform !== 'none') {
                        const matrix = new DOMMatrix(transform);
                        if (matrix.a !== 1) return matrix.a;
                    }
                    el = el.parentElement;
                }
                return 1;
            };
            const scale = getScale();

            const handleMove = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                moveEvent.preventDefault();
                moveEvent.stopPropagation();

                const deltaX = (moveEvent.clientX - startX) / scale;
                const deltaY = (moveEvent.clientY - startY) / scale;

                const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
                const newHeight = Math.max(120, Math.min(400, startHeight + deltaY));

                setEditorWidth(newWidth);
                setEditorHeight(newHeight);
                data.properties.editorWidth = newWidth;
                data.properties.editorHeight = newHeight;
            };

            const handleUp = (upEvent) => {
                if (upEvent.pointerId !== pointerId) return;
                target.releasePointerCapture(pointerId);
                target.removeEventListener('pointermove', handleMove);
                target.removeEventListener('pointerup', handleUp);
                target.removeEventListener('pointercancel', handleUp);
                triggerUpdate();
            };

            target.addEventListener('pointermove', handleMove);
            target.addEventListener('pointerup', handleUp);
            target.addEventListener('pointercancel', handleUp);
        }, [editorWidth, editorHeight, data, triggerUpdate]);

        // Get inputs and outputs for socket rendering
        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        // Slider fill gradient helper (matches Timeline Color)
        const getSliderStyle = (value, min, max) => {
            const percent = ((value - min) / (max - min)) * 100;
            return {
                background: `linear-gradient(90deg, 
                    rgba(0, 243, 255, 0.5) 0%, 
                    rgba(0, 243, 255, 0.4) ${percent}%, 
                    rgba(0, 243, 255, 0.15) ${percent}%)`
            };
        };

        const selectStyle = {
            padding: '4px 8px',
            fontSize: '11px',
            background: '#333',
            color: '#ddd',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer'
        };

        const sliderRowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px'
        };

        const sliderLabelStyle = {
            fontSize: '10px',
            color: '#aaa',
            minWidth: '80px'
        };

        // Display position (preview or actual)
        const displayPosition = previewMode ? previewPosition : position;
        const displayOutput = data.properties.outputInteger 
            ? Math.round(outputValue) 
            : outputValue?.toFixed(2);

        // Calculate time axis label
        const getTimeAxisLabel = () => {
            if (rangeMode === 'time') {
                const formatTime = (h, m, p) => `${h}:${String(m).padStart(2, '0')}${p}`;
                return `${formatTime(startTimeHours, startTimeMinutes, startTimePeriod)} — ${formatTime(endTimeHours, endTimeMinutes, endTimePeriod)}`;
            } else if (rangeMode === 'timer') {
                const unitLabel = timerUnit === 'hours' ? 'hr' : timerUnit === 'minutes' ? 'min' : 'sec';
                return `0 — ${timerDuration} ${unitLabel}`;
            } else {
                return `${startValue} — ${endValue}`;
            }
        };

        // Node width = editor width + padding
        const nodeWidth = editorWidth + 30;

        return el('div', { 
            className: `color-gradient-node ${isInRange ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`,
            style: { width: nodeWidth + 'px' }
        }, [
            // Header
            el('div', { key: 'header', className: 'cgn-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                el('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                    el('span', { 
                        key: 'collapse',
                        className: 'cgn-collapse-toggle',
                        onClick: handleCollapseToggle,
                        onPointerDown: stopPropagation,
                        style: { 
                            cursor: 'pointer', 
                            fontSize: '10px',
                            transition: 'transform 0.2s',
                            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                            display: 'inline-block'
                        }
                    }, '▼'),
                    el('div', { key: 'title', className: 'cgn-title' }, [
                        el('span', { key: 'icon', style: { marginRight: '6px' } }, '📈'),
                        'Spline Value'
                    ])
                ]),
                el('span', { 
                    key: 'status',
                    className: 'cgn-status',
                    style: isInRange ? { color: '#00ff88' } : {}
                }, isInRange ? 'Active' : 'Idle')
            ]),

            // Socket IO Container
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

            // Collapsible content
            !collapsed && el('div', { key: 'collapsible-content' }, [
                el('div', { key: 'controls', className: 'cgn-controls', onPointerDown: (e) => { const t = e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'BUTTON') e.stopPropagation(); } }, [
                    
                    // Range Mode selector with Reset button
                    el('div', { key: 'rangeSection', className: 'cgn-section' }, [
                        el('div', { key: 'modeHeader', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                            el('div', { key: 'modeLabel', className: 'cgn-section-header', style: { marginBottom: 0 } }, 'RANGE MODE'),
                            el('button', {
                                key: 'reset',
                                onClick: handleReset,
                                onPointerDown: stopPropagation,
                                title: 'Reset playhead to start position',
                                style: {
                                    background: '#444',
                                    border: '1px solid #666',
                                    borderRadius: '3px',
                                    color: '#fff',
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    cursor: 'pointer'
                                }
                            }, '⟲ Reset')
                        ]),
                        el('select', {
                            key: 'select',
                            value: rangeMode,
                            onChange: handleRangeModeChange,
                            onPointerDown: stopPropagation,
                            style: { ...selectStyle, width: '100%', marginBottom: '8px', marginTop: '4px' }
                        }, [
                            el('option', { key: 'numerical', value: 'numerical' }, 'Numerical'),
                            el('option', { key: 'time', value: 'time' }, 'Time of Day'),
                            el('option', { key: 'timer', value: 'timer' }, 'Timer')
                        ])
                    ]),

                    // Mode-specific controls
                    rangeMode === 'numerical' && el('div', { key: 'numControls' }, [
                        el('div', { key: 'startRow', style: { ...sliderRowStyle, gap: '8px' } }, [
                            el('span', { key: 'label', style: { ...sliderLabelStyle, minWidth: '50px' } }, 'Start:'),
                            el('input', {
                                key: 'input',
                                type: 'number',
                                step: 'any',
                                value: startValue,
                                onChange: (e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setStartValue(val);
                                    data.properties.startValue = val;
                                    triggerUpdate();
                                },
                                onPointerDown: stopPropagation,
                                style: { flex: 1, background: '#1a1a2e', border: '1px solid #444', borderRadius: '4px', color: '#fff', padding: '4px 8px', fontSize: '12px', width: '80px' }
                            })
                        ]),
                        el('div', { key: 'endRow', style: { ...sliderRowStyle, gap: '8px' } }, [
                            el('span', { key: 'label', style: { ...sliderLabelStyle, minWidth: '50px' } }, 'End:'),
                            el('input', {
                                key: 'input',
                                type: 'number',
                                step: 'any',
                                value: endValue,
                                onChange: (e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setEndValue(val);
                                    data.properties.endValue = val;
                                    triggerUpdate();
                                },
                                onPointerDown: stopPropagation,
                                style: { flex: 1, background: '#1a1a2e', border: '1px solid #444', borderRadius: '4px', color: '#fff', padding: '4px 8px', fontSize: '12px', width: '80px' }
                            })
                        ])
                    ]),

                    rangeMode === 'time' && el('div', { key: 'timeControls' }, [
                        inputStartTime 
                            ? el('div', { key: 'startOverride', style: { ...sliderRowStyle, background: 'rgba(0,150,255,0.15)', padding: '4px', borderRadius: '4px' } }, 
                                el('span', { style: { color: '#0af', fontSize: '11px' } }, `Start (INPUT): ${inputStartTime}`)
                              )
                            : [
                                el('div', { key: 'startHours', style: sliderRowStyle }, [
                                    el('span', { key: 'label', style: sliderLabelStyle }, `Start Hr: ${startTimeHours}`),
                                    el('input', {
                                        key: 'slider', type: 'range', min: 1, max: 12, value: startTimeHours,
                                        onChange: (e) => { const v = parseInt(e.target.value); setStartTimeHours(v); data.properties.startTimeHours = v; triggerUpdate(); },
                                        onPointerDown: stopPropagation,
                                        className: 'cgn-slider',
                                        style: { flex: 1, ...getSliderStyle(startTimeHours, 1, 12) }
                                    })
                                ]),
                                el('div', { key: 'startMins', style: sliderRowStyle }, [
                                    el('span', { key: 'label', style: sliderLabelStyle }, `Start Min: ${String(startTimeMinutes).padStart(2, '0')}`),
                                    el('input', {
                                        key: 'slider', type: 'range', min: 0, max: 59, value: startTimeMinutes,
                                        onChange: (e) => { const v = parseInt(e.target.value); setStartTimeMinutes(v); data.properties.startTimeMinutes = v; triggerUpdate(); },
                                        onPointerDown: stopPropagation,
                                        className: 'cgn-slider',
                                        style: { flex: 1, ...getSliderStyle(startTimeMinutes, 0, 59) }
                                    })
                                ]),
                                el('div', { key: 'startPeriod', style: sliderRowStyle }, [
                                    el('span', { key: 'label', style: sliderLabelStyle }, 'Start Period:'),
                                    el('select', {
                                        key: 'select', value: startTimePeriod,
                                        onChange: (e) => { setStartTimePeriod(e.target.value); data.properties.startTimePeriod = e.target.value; triggerUpdate(); },
                                        onPointerDown: stopPropagation,
                                        style: selectStyle
                                    }, [
                                        el('option', { key: 'am', value: 'AM' }, 'AM'),
                                        el('option', { key: 'pm', value: 'PM' }, 'PM')
                                    ])
                                ])
                            ],
                        el('div', { key: 'divider', style: { borderTop: '1px solid rgba(255,255,255,0.1)', margin: '6px 0' } }),
                        inputEndTime
                            ? el('div', { key: 'endOverride', style: { ...sliderRowStyle, background: 'rgba(0,150,255,0.15)', padding: '4px', borderRadius: '4px' } }, 
                                el('span', { style: { color: '#0af', fontSize: '11px' } }, `End (INPUT): ${inputEndTime}`)
                              )
                            : [
                                el('div', { key: 'endHours', style: sliderRowStyle }, [
                                    el('span', { key: 'label', style: sliderLabelStyle }, `End Hr: ${endTimeHours}`),
                                    el('input', {
                                        key: 'slider', type: 'range', min: 1, max: 12, value: endTimeHours,
                                        onChange: (e) => { const v = parseInt(e.target.value); setEndTimeHours(v); data.properties.endTimeHours = v; triggerUpdate(); },
                                        onPointerDown: stopPropagation,
                                        className: 'cgn-slider',
                                        style: { flex: 1, ...getSliderStyle(endTimeHours, 1, 12) }
                                    })
                                ]),
                                el('div', { key: 'endMins', style: sliderRowStyle }, [
                                    el('span', { key: 'label', style: sliderLabelStyle }, `End Min: ${String(endTimeMinutes).padStart(2, '0')}`),
                                    el('input', {
                                        key: 'slider', type: 'range', min: 0, max: 59, value: endTimeMinutes,
                                        onChange: (e) => { const v = parseInt(e.target.value); setEndTimeMinutes(v); data.properties.endTimeMinutes = v; triggerUpdate(); },
                                        onPointerDown: stopPropagation,
                                        className: 'cgn-slider',
                                        style: { flex: 1, ...getSliderStyle(endTimeMinutes, 0, 59) }
                                    })
                                ]),
                                el('div', { key: 'endPeriod', style: sliderRowStyle }, [
                                    el('span', { key: 'label', style: sliderLabelStyle }, 'End Period:'),
                                    el('select', {
                                        key: 'select', value: endTimePeriod,
                                        onChange: (e) => { setEndTimePeriod(e.target.value); data.properties.endTimePeriod = e.target.value; triggerUpdate(); },
                                        onPointerDown: stopPropagation,
                                        style: selectStyle
                                    }, [
                                        el('option', { key: 'am', value: 'AM' }, 'AM'),
                                        el('option', { key: 'pm', value: 'PM' }, 'PM')
                                    ])
                                ])
                            ]
                    ]),

                    rangeMode === 'timer' && el('div', { key: 'timerControls' }, [
                        el('div', { key: 'durationRow', style: sliderRowStyle }, [
                            el('span', { key: 'label', style: sliderLabelStyle }, `Duration: ${timerDuration}`),
                            el('input', {
                                key: 'slider', type: 'range', min: 1, max: 120, value: timerDuration,
                                onChange: (e) => { const val = parseInt(e.target.value, 10); setTimerDuration(val); data.properties.timerDurationValue = val; triggerUpdate(); },
                                onPointerDown: stopPropagation,
                                className: 'cgn-slider',
                                style: { flex: 1, ...getSliderStyle(timerDuration, 1, 120) }
                            })
                        ]),
                        el('div', { key: 'unitRow', style: sliderRowStyle }, [
                            el('span', { key: 'label', style: sliderLabelStyle }, 'Unit:'),
                            el('select', {
                                key: 'select', value: timerUnit,
                                onChange: (e) => { setTimerUnit(e.target.value); data.properties.timerUnit = e.target.value; triggerUpdate(); },
                                onPointerDown: stopPropagation,
                                style: selectStyle
                            }, [
                                el('option', { key: 'sec', value: 'seconds' }, 'Seconds'),
                                el('option', { key: 'min', value: 'minutes' }, 'Minutes'),
                                el('option', { key: 'hr', value: 'hours' }, 'Hours')
                            ])
                        ]),
                        el('div', { key: 'loopRow', style: sliderRowStyle }, [
                            el('span', { key: 'label', style: sliderLabelStyle }, 'Loop Mode:'),
                            el('select', {
                                key: 'select', value: timerLoopMode,
                                onChange: (e) => { setTimerLoopMode(e.target.value); data.properties.timerLoopMode = e.target.value; triggerUpdate(); },
                                onPointerDown: stopPropagation,
                                style: selectStyle
                            }, [
                                el('option', { key: 'none', value: 'none' }, 'Once'),
                                el('option', { key: 'loop', value: 'loop' }, 'Loop'),
                                el('option', { key: 'pingpong', value: 'ping-pong' }, 'Ping-Pong')
                            ])
                        ])
                    ]),

                    // Step interval slider
                    el('div', { key: 'stepRow', style: sliderRowStyle }, [
                        el('span', { key: 'label', style: sliderLabelStyle }, `Step: ${outputStepInterval}s`),
                        el('input', {
                            key: 'slider', type: 'range', min: 1, max: 30, value: outputStepInterval,
                            onChange: (e) => { const val = parseInt(e.target.value, 10); setOutputStepInterval(val); data.properties.outputStepInterval = val; triggerUpdate(); },
                            onPointerDown: stopPropagation,
                            className: 'cgn-slider',
                            style: { flex: 1, ...getSliderStyle(outputStepInterval, 1, 30) }
                        })
                    ]),

                    // Output range
                    el('div', { key: 'outputSection', className: 'cgn-section', style: { marginTop: '8px' } }, [
                        el('div', { key: 'header', className: 'cgn-section-header' }, 'OUTPUT'),
                        el('div', { key: 'row', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
                            el('input', {
                                key: 'min', type: 'number', value: outputMin,
                                onChange: (e) => { const val = parseFloat(e.target.value) || 0; setOutputMin(val); data.properties.outputMin = val; triggerUpdate(); },
                                onPointerDown: stopPropagation,
                                style: { width: '60px', background: '#1a1a2e', border: '1px solid #444', borderRadius: '4px', color: '#fff', padding: '4px', fontSize: '11px', textAlign: 'center' }
                            }),
                            el('span', { key: 'sep', style: { color: '#666' } }, '—'),
                            el('input', {
                                key: 'max', type: 'number', value: outputMax,
                                onChange: (e) => { const val = parseFloat(e.target.value) || 100; setOutputMax(val); data.properties.outputMax = val; triggerUpdate(); },
                                onPointerDown: stopPropagation,
                                style: { width: '60px', background: '#1a1a2e', border: '1px solid #444', borderRadius: '4px', color: '#fff', padding: '4px', fontSize: '11px', textAlign: 'center' }
                            }),
                            el('label', { key: 'intLabel', style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#888' } }, [
                                el('input', {
                                    key: 'check', type: 'checkbox', checked: outputInteger,
                                    onChange: (e) => { setOutputInteger(e.target.checked); data.properties.outputInteger = e.target.checked; triggerUpdate(); },
                                    onPointerDown: stopPropagation
                                }),
                                'Int'
                            ])
                        ])
                    ]),

                    // Presets
                    el('div', { key: 'presets', style: { marginTop: '8px', marginBottom: '8px' } }, [
                        el(PresetDropdown, {
                            key: 'preset-dropdown',
                            onSelect: (newPoints) => {
                                data.properties.points = newPoints;
                                setPoints(newPoints);
                                triggerUpdate();
                            }
                        })
                    ])
                ]),

                // Spline Editor
                el('div', { key: 'editor-container', style: { position: 'relative' } }, [
                    // Y-axis label
                    el('div', { 
                        key: 'y-label',
                        style: { 
                            position: 'absolute',
                            left: '-5px',
                            top: '50%',
                            transform: 'rotate(-90deg) translateX(-50%)',
                            fontSize: '9px',
                            color: '#666',
                            whiteSpace: 'nowrap',
                            transformOrigin: '0 0'
                        }
                    }, `${outputMin} — ${outputMax}`),
                    
                    el('div', { key: 'editor', style: { marginLeft: '15px' } }, [
                        el(SplineEditor, {
                            key: 'spline',
                            points: points,
                            onChange: handleCurveChange,
                            interpolation: data.properties.interpolation,
                            width: editorWidth - 15,
                            height: editorHeight,
                            curveColor: '#00f3ff',
                            pointColor: '#ffffff',
                            backgroundColor: '#0d0d1a',
                            gridLines: 4,
                            showGrid: true,
                            playheadPosition: displayPosition,
                            playheadColor: '#ff6600'
                        })
                    ]),
                    
                    // X-axis label
                    el('div', { 
                        key: 'x-label',
                        style: { textAlign: 'center', fontSize: '9px', color: '#666', marginTop: '2px', marginLeft: '15px' }
                    }, getTimeAxisLabel())
                ]),

                // Preview mode toggle
                el('div', { key: 'preview-row', style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', marginBottom: '6px' } }, [
                    el('input', {
                        key: 'checkbox', type: 'checkbox', checked: previewMode,
                        onChange: handlePreviewModeToggle,
                        onPointerDown: stopPropagation
                    }),
                    el('span', { key: 'label', style: { fontSize: '10px', color: '#888' } }, '🔵 Preview Mode')
                ]),

                // Current value display bar
                el('div', { 
                    key: 'value-bar',
                    style: {
                        background: 'rgba(0, 243, 255, 0.1)',
                        border: '1px solid rgba(0, 243, 255, 0.3)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }
                }, [
                    el('span', { key: 'pos', style: { fontSize: '11px', color: '#888' } }, 
                        `Position: ${(displayPosition * 100).toFixed(1)}%`
                    ),
                    el('span', { 
                        key: 'value',
                        style: { fontSize: '20px', fontWeight: 'bold', color: '#00f3ff' }
                    }, displayOutput || 0),
                    el('span', { 
                        key: 'status',
                        style: {
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            background: isInRange ? 'rgba(0, 255, 136, 0.2)' : 'rgba(128, 128, 128, 0.2)',
                            color: isInRange ? '#00ff88' : '#888'
                        }
                    }, isInRange ? 'ACTIVE' : 'IDLE')
                ]),
                
                // Resize handle (bottom right)
                el('div', {
                    key: 'resize-handle',
                    style: {
                        position: 'absolute',
                        bottom: '2px',
                        right: '2px',
                        width: '14px',
                        height: '14px',
                        cursor: 'nwse-resize',
                        opacity: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: '#888'
                    },
                    onPointerDown: handleResizeStart,
                    title: 'Drag to resize'
                }, '⤡')
            ])
        ]);
    }

    // =========================================================================
    // REGISTER NODE
    // =========================================================================

    if (window.nodeRegistry) {
        window.nodeRegistry.register('SplineCurveNode', {
            label: 'Spline Value',
            category: 'Utility',
            nodeClass: SplineCurveNode,
            component: SplineCurveNodeComponent,
            factory: (cb) => new SplineCurveNode(cb)
        });
        console.log('[SplineCurveNode] Registered successfully');
    } else {
        console.error('[SplineCurveNode] nodeRegistry not found');
    }

})();
