(function() {
    // Debug: console.log("[DayOfWeekComparisonNode] Loading plugin...");

    // =========================================================================
    // CSS is now loaded from node-styles.css via index.css
    // Uses shared styles: .hsv-node-tron, .hsv-slider-container, .hsv-range-input, etc.
    // =========================================================================

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[DayOfWeekComparisonNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    const DAY_NAMES = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class DayOfWeekComparisonNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Day of Week Comparison");
            this.width = 380;
            this.changeCallback = changeCallback;

            this.properties = {
                mode: "single",      // "single", "range", or "all"
                singleDay: 1,        // Monday (0=Sunday, 1=Monday, etc.)
                startDay: 1,         // Monday
                endDay: 5,           // Friday
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
                console.log(`[DayOfWeekComparisonNode] ${message}`);
            }
        }

        data() {
            const now = new Date();
            const currentDayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, etc.

            let isInRange = false;
            switch (this.properties.mode) {
                case "all":
                    isInRange = true;
                    break;
                case "single":
                    isInRange = (currentDayOfWeek === this.properties.singleDay);
                    break;
                case "range":
                    let s = this.properties.startDay;
                    let e = this.properties.endDay;
                    if (s > e) [s, e] = [e, s];
                    isInRange = (currentDayOfWeek >= s && currentDayOfWeek <= e);
                    break;
            }

            this.log(`MODE=${this.properties.mode.toUpperCase()}, Current=${DAY_NAMES[currentDayOfWeek]}, Result=${isInRange}`);

            return { isInRange };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                mode: this.properties.mode,
                singleDay: this.properties.singleDay,
                startDay: this.properties.startDay,
                endDay: this.properties.endDay,
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
    // MODE SELECTOR COMPONENT
    // -------------------------------------------------------------------------
    const ModeSelector = ({ value, onChange }) => {
        const modes = ["single", "range", "all"];
        
        return React.createElement('div', { 
            style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                marginBottom: '12px'
            } 
        }, [
            React.createElement('span', { 
                key: 'label', 
                style: { fontSize: '11px', color: 'rgba(167, 255, 235, 0.7)', width: '80px' } 
            }, 'Mode'),
            React.createElement('button', {
                key: 'prev',
                onClick: () => {
                    const idx = modes.indexOf(value);
                    const newIdx = idx === 0 ? modes.length - 1 : idx - 1;
                    onChange(modes[newIdx]);
                },
                onPointerDown: (e) => e.stopPropagation(),
                className: 'hsv-btn',
                style: { padding: '4px 8px', fontSize: '12px' }
            }, '◀'),
            React.createElement('span', { 
                key: 'value',
                style: { 
                    flex: 1, 
                    textAlign: 'center', 
                    fontSize: '12px',
                    color: '#00ffc8',
                    textTransform: 'capitalize'
                }
            }, value),
            React.createElement('button', {
                key: 'next',
                onClick: () => {
                    const idx = modes.indexOf(value);
                    const newIdx = idx === modes.length - 1 ? 0 : idx + 1;
                    onChange(modes[newIdx]);
                },
                onPointerDown: (e) => e.stopPropagation(),
                className: 'hsv-btn',
                style: { padding: '4px 8px', fontSize: '12px' }
            }, '▶')
        ]);
    };

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function DayOfWeekComparisonNodeComponent({ data, emit }) {
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
        const currentDayOfWeek = now.getDay();

        let isInRange = false;
        let statusText = "";
        
        switch (state.mode) {
            case "all":
                isInRange = true;
                statusText = "All Week: Always True";
                break;
            case "single":
                isInRange = (currentDayOfWeek === state.singleDay);
                statusText = `Single Day: ${DAY_NAMES[state.singleDay]}`;
                break;
            case "range":
                let s = state.startDay;
                let e = state.endDay;
                if (s > e) [s, e] = [e, s];
                isInRange = (currentDayOfWeek >= s && currentDayOfWeek <= e);
                statusText = `Range: ${DAY_NAMES[state.startDay]} - ${DAY_NAMES[state.endDay]}`;
                break;
        }

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
                // Mode selector
                React.createElement(ModeSelector, {
                    key: 'mode',
                    value: state.mode,
                    onChange: (v) => updateState({ mode: v })
                }),

                // Single Day Mode
                state.mode === 'single' && React.createElement('div', { key: 'single' }, [
                    React.createElement('div', { key: 'section', className: 'hsv-section-header' }, 'Single Day'),
                    React.createElement(Slider, {
                        key: 'singleDay',
                        label: 'Day',
                        value: state.singleDay,
                        min: 0, max: 6,
                        displayValue: DAY_NAMES[state.singleDay],
                        onChange: (v) => updateState({ singleDay: v })
                    })
                ]),

                // Range Mode
                state.mode === 'range' && React.createElement('div', { key: 'range' }, [
                    React.createElement('div', { key: 'startSection', className: 'hsv-section-header' }, 'Start Day'),
                    React.createElement(Slider, {
                        key: 'startDay',
                        label: 'Day',
                        value: state.startDay,
                        min: 0, max: 6,
                        displayValue: DAY_NAMES[state.startDay],
                        onChange: (v) => updateState({ startDay: v })
                    }),
                    React.createElement('div', { key: 'endSection', className: 'hsv-section-header', style: { marginTop: '12px' } }, 'End Day'),
                    React.createElement(Slider, {
                        key: 'endDay',
                        label: 'Day',
                        value: state.endDay,
                        min: 0, max: 6,
                        displayValue: DAY_NAMES[state.endDay],
                        onChange: (v) => updateState({ endDay: v })
                    })
                ]),

                // All mode - just show info
                state.mode === 'all' && React.createElement('div', { 
                    key: 'all',
                    style: { 
                        padding: '12px', 
                        textAlign: 'center', 
                        color: 'rgba(0, 255, 200, 0.7)',
                        fontSize: '12px'
                    }
                }, 'Matches every day of the week'),

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
                React.createElement('span', { key: 'text' }, statusText),
                React.createElement('span', { key: 'today', style: { marginLeft: '10px', opacity: 0.7 } }, 
                    `(Today: ${DAY_NAMES[currentDayOfWeek]})`
                )
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('DayOfWeekComparisonNode', {
        label: "Day of Week Comparison",
        category: "Logic",
        nodeClass: DayOfWeekComparisonNode,
        factory: (cb) => new DayOfWeekComparisonNode(cb),
        component: DayOfWeekComparisonNodeComponent
    });

    console.log("[DayOfWeekComparisonNode] Registered");
})();
