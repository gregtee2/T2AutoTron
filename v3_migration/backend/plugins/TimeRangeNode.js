(function() {
    // Debug: console.log("[TimeRangeNode] Loading plugin...");

    // =========================================================================
    // CSS is now loaded from node-styles.css via index.css
    // Uses shared styles: .hsv-node-tron, .hsv-slider-container, .hsv-range-input, etc.
    // =========================================================================

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[TimeRangeNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const { HelpIcon } = window.T2Controls || {};

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Outputs TRUE when current time is within the specified range.\n\nSupports overnight ranges (e.g., 10 PM to 6 AM).\n\nUpdates continuously in real-time.",
        outputs: {
            isInRange: "TRUE if current time is within range.\nFALSE otherwise."
        },
        controls: {
            start: "Start time of the active window (24-hour format).",
            end: "End time of the active window.\n\nCan be earlier than start for overnight ranges."
        }
    };

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------
    function formatAmPm(hour24, minute) {
        const ampm = hour24 < 12 ? "AM" : "PM";
        let hour12 = hour24 % 12;
        if (hour12 === 0) hour12 = 12;
        const minuteStr = minute < 10 ? `0${minute}` : `${minute}`;
        return `${hour12}:${minuteStr} ${ampm}`;
    }

    function timeToMinutes(h, m) {
        return (h * 60) + m;
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class TimeRangeNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Time Range (Continuous)");
            this.width = 380;
            this.changeCallback = changeCallback;

            this.properties = {
                startHour: 19,
                startMinute: 0,
                endHour: 21,
                endMinute: 0,
                debug: false
            };

            // Output
            this.addOutput("isInRange", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "IsInRange"
            ));
        }

        log(message) {
            if (this.properties.debug) {
                console.log(`[TimeRangeNode] ${message}`);
            }
        }

        data() {
            const now = new Date();
            const currentMinutes = timeToMinutes(now.getHours(), now.getMinutes());
            const startMinutes = timeToMinutes(this.properties.startHour, this.properties.startMinute);
            const endMinutes = timeToMinutes(this.properties.endHour, this.properties.endMinute);

            let isInRange = false;
            if (startMinutes < endMinutes) {
                // Normal case (e.g., 08:00 to 18:00)
                isInRange = (currentMinutes >= startMinutes) && (currentMinutes < endMinutes);
            } else if (startMinutes > endMinutes) {
                // Cross midnight (e.g., 22:00 to 02:00 next day)
                isInRange = (currentMinutes >= startMinutes) || (currentMinutes < endMinutes);
            } else {
                // Same start/end => entire day
                isInRange = true;
            }

            this.log(`hour=${now.getHours()}:${now.getMinutes()}, range=[${this.properties.startHour}:${this.properties.startMinute}, ${this.properties.endHour}:${this.properties.endMinute}), inRange=${isInRange}`);

            return { isInRange };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                startHour: this.properties.startHour,
                startMinute: this.properties.startMinute,
                endHour: this.properties.endHour,
                endMinute: this.properties.endMinute,
                debug: this.properties.debug
            };
        }

        toJSON() {
            return {
                id: this.id,
                label: this.label,
                properties: this.serialize()
            };
        }
    }

    // -------------------------------------------------------------------------
    // SHARED SLIDER COMPONENT (reuses HSV slider styles)
    // -------------------------------------------------------------------------
    const Slider = ({ label, value, min, max, onChange, step = 1, displayValue }) => {
        return React.createElement('div', { className: 'hsv-slider-container' }, [
            React.createElement('span', { key: 'label', className: 'hsv-slider-label' }, label),
            React.createElement('input', {
                key: 'input',
                type: 'range',
                min, max, step,
                value,
                onChange: (e) => onChange(Number(e.target.value)),
                onPointerDown: (e) => e.stopPropagation(),
                className: 'hsv-range-input'
            }),
            React.createElement('span', { key: 'val', className: 'hsv-slider-value' }, displayValue !== undefined ? displayValue : value)
        ]);
    };

    // -------------------------------------------------------------------------
    // CHECKBOX COMPONENT (reuses HSV checkbox styles)
    // -------------------------------------------------------------------------
    const Checkbox = ({ label, checked, onChange }) => {
        return React.createElement('label', { className: 'hsv-checkbox-container' }, [
            React.createElement('input', {
                key: 'input',
                type: 'checkbox',
                checked,
                onChange: (e) => onChange(e.target.checked),
                onPointerDown: (e) => e.stopPropagation(),
                className: 'hsv-checkbox'
            }),
            React.createElement('span', { key: 'label' }, label)
        ]);
    };

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function TimeRangeNodeComponent({ data, emit }) {
        const [state, setState] = useState({ ...data.properties });
        const lastUpdateRef = useRef(0);
        const timeoutRef = useRef(null);

        const triggerEngineUpdate = useCallback(() => {
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        const updateState = (updates) => {
            const newState = { ...state, ...updates };
            setState(newState);
            Object.assign(data.properties, newState);

            const now = Date.now();
            const limit = 50;
            if (now - lastUpdateRef.current >= limit) {
                triggerEngineUpdate();
                lastUpdateRef.current = now;
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    triggerEngineUpdate();
                    lastUpdateRef.current = Date.now();
                }, limit - (now - lastUpdateRef.current));
            }
        };

        useEffect(() => {
            return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
        }, []);

        // Calculate current status
        const now = new Date();
        const currentMinutes = timeToMinutes(now.getHours(), now.getMinutes());
        const startMinutes = timeToMinutes(state.startHour, state.startMinute);
        const endMinutes = timeToMinutes(state.endHour, state.endMinute);

        let isInRange = false;
        if (startMinutes < endMinutes) {
            isInRange = (currentMinutes >= startMinutes) && (currentMinutes < endMinutes);
        } else if (startMinutes > endMinutes) {
            isInRange = (currentMinutes >= startMinutes) || (currentMinutes < endMinutes);
        } else {
            isInRange = true;
        }

        const startLabel = formatAmPm(state.startHour, state.startMinute);
        const endLabel = formatAmPm(state.endHour, state.endMinute);
        const statusText = `${startLabel} to ${endLabel}`;

        const outputs = Object.entries(data.outputs);

        return React.createElement('div', { className: 'hsv-node-tron' }, [
            // Header with output socket on the right
            React.createElement('div', { 
                key: 'header', 
                className: 'hsv-node-header',
                style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
            }, [
                React.createElement('div', { key: 'title', className: 'hsv-node-title' }, data.label),
                outputs.map(([key, output]) => 
                    React.createElement('div', { 
                        key, 
                        style: { display: 'flex', alignItems: 'center', gap: '8px' }
                    }, [
                        React.createElement('span', { 
                            key: 'label',
                            style: { fontSize: '11px', color: 'rgba(0, 255, 200, 0.7)' }
                        }, output.label),
                        React.createElement(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })
                    ])
                )
            ]),

            // Controls container
            React.createElement('div', { key: 'controls', className: 'ha-controls-container' }, [
                // Start Time
                React.createElement('div', { key: 'startSection', className: 'hsv-section-header' }, 'Start Time'),
                React.createElement(Slider, {
                    key: 'startHour',
                    label: 'Hour',
                    value: state.startHour,
                    min: 0, max: 23,
                    onChange: (v) => updateState({ startHour: v })
                }),
                React.createElement(Slider, {
                    key: 'startMinute',
                    label: 'Minute',
                    value: state.startMinute,
                    min: 0, max: 59,
                    displayValue: state.startMinute < 10 ? `0${state.startMinute}` : state.startMinute,
                    onChange: (v) => updateState({ startMinute: v })
                }),

                // End Time
                React.createElement('div', { key: 'endSection', className: 'hsv-section-header', style: { marginTop: '12px' } }, 'End Time'),
                React.createElement(Slider, {
                    key: 'endHour',
                    label: 'Hour',
                    value: state.endHour,
                    min: 0, max: 23,
                    onChange: (v) => updateState({ endHour: v })
                }),
                React.createElement(Slider, {
                    key: 'endMinute',
                    label: 'Minute',
                    value: state.endMinute,
                    min: 0, max: 59,
                    displayValue: state.endMinute < 10 ? `0${state.endMinute}` : state.endMinute,
                    onChange: (v) => updateState({ endMinute: v })
                }),

                // Debug toggle
                React.createElement('div', { key: 'debug', style: { marginTop: '12px', borderTop: '1px solid rgba(0, 255, 200, 0.1)', paddingTop: '8px' } },
                    React.createElement(Checkbox, {
                        label: 'Debug Logging',
                        checked: state.debug,
                        onChange: (v) => updateState({ debug: v })
                    })
                )
            ]),

            // Status display
            React.createElement('div', {
                key: 'status',
                className: 'ha-node-status',
                style: {
                    padding: '10px 15px',
                    background: isInRange ? 'rgba(0, 255, 100, 0.15)' : 'rgba(255, 100, 100, 0.15)',
                    borderTop: '1px solid rgba(0, 255, 200, 0.2)',
                    textAlign: 'center',
                    fontSize: '12px'
                }
            }, [
                React.createElement('span', { key: 'icon', style: { marginRight: '8px' } }, isInRange ? '✅' : '❌'),
                React.createElement('span', { key: 'text' }, `Time Range: ${statusText}`)
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('TimeRangeNode', {
        label: "Time Range (Continuous)",
        category: "Logic",
        nodeClass: TimeRangeNode,
        factory: (cb) => new TimeRangeNode(cb),
        component: TimeRangeNodeComponent
    });

    // console.log("[TimeRangeNode] Registered");
})();
