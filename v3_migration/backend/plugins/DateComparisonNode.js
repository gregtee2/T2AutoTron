(function() {
    // Debug: console.log("[DateComparisonNode] Loading plugin...");

    // =========================================================================
    // CSS is now loaded from node-styles.css via index.css
    // Uses shared styles: .hsv-node-tron, .hsv-slider-container, .hsv-range-input, etc.
    // =========================================================================

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[DateComparisonNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class DateComparisonNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Date Comparison");
            this.width = 380;
            this.changeCallback = changeCallback;

            this.properties = {
                useRange: false,
                month: 4,
                day: 17,
                startMonth: 4,
                startDay: 10,
                endMonth: 4,
                endDay: 20,
                debug: false
            };

            // Output
            this.addOutput("isInRange", new ClassicPreset.Output(
                sockets.boolean || new ClassicPreset.Socket('boolean'),
                "Is In Range"
            ));
        }

        log(message) {
            if (this.properties.debug) {
                console.log(`[DateComparisonNode] ${message}`);
            }
        }

        data() {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentDay = now.getDate();

            let isInRange = false;

            if (!this.properties.useRange) {
                isInRange = (
                    currentMonth === this.properties.month &&
                    currentDay === this.properties.day
                );
                this.log(`SINGLE DATE: Wanted=${this.properties.month}/${this.properties.day}, Current=${currentMonth}/${currentDay}, Result=${isInRange}`);
            } else {
                const currentYear = now.getFullYear();

                let startDate = new Date(currentYear, this.properties.startMonth - 1, this.properties.startDay);
                let endDate = new Date(currentYear, this.properties.endMonth - 1, this.properties.endDay);

                if (startDate > endDate) {
                    [startDate, endDate] = [endDate, startDate];
                }

                const todayMidnight = new Date(currentYear, currentMonth - 1, currentDay);
                isInRange = (todayMidnight >= startDate && todayMidnight <= endDate);

                this.log(`RANGE: Start=${this.properties.startMonth}/${this.properties.startDay}, End=${this.properties.endMonth}/${this.properties.endDay}, Current=${currentMonth}/${currentDay}, Result=${isInRange}`);
            }

            return { isInRange };
        }

        restore(state) {
            if (state.properties) {
                Object.assign(this.properties, state.properties);
            }
        }

        serialize() {
            return {
                useRange: this.properties.useRange,
                month: this.properties.month,
                day: this.properties.day,
                startMonth: this.properties.startMonth,
                startDay: this.properties.startDay,
                endMonth: this.properties.endMonth,
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
            React.createElement('span', { key: 'val', className: 'hsv-slider-value' }, displayValue || value)
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
    function DateComparisonNodeComponent({ data, emit }) {
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

        // Calculate current match status
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        let isInRange = false;
        let statusText = "";

        if (!state.useRange) {
            isInRange = (currentMonth === state.month && currentDay === state.day);
            statusText = `${MONTH_NAMES[state.month - 1]} ${state.day}`;
        } else {
            const currentYear = now.getFullYear();
            let startDate = new Date(currentYear, state.startMonth - 1, state.startDay);
            let endDate = new Date(currentYear, state.endMonth - 1, state.endDay);
            if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
            const todayMidnight = new Date(currentYear, currentMonth - 1, currentDay);
            isInRange = (todayMidnight >= startDate && todayMidnight <= endDate);
            statusText = `${MONTH_NAMES[state.startMonth - 1]} ${state.startDay} → ${MONTH_NAMES[state.endMonth - 1]} ${state.endDay}`;
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
                // Output socket in header
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
                // Mode toggle
                React.createElement('div', { key: 'mode', style: { marginBottom: '12px' } },
                    React.createElement(Checkbox, {
                        label: 'Use Date Range',
                        checked: state.useRange,
                        onChange: (v) => updateState({ useRange: v })
                    })
                ),

                // Single Date Mode
                !state.useRange && React.createElement('div', { key: 'single' }, [
                    React.createElement('div', { key: 'section', className: 'hsv-section-header' }, 'Single Date'),
                    React.createElement(Slider, {
                        key: 'month',
                        label: 'Month',
                        value: state.month,
                        min: 1, max: 12,
                        displayValue: MONTH_NAMES[state.month - 1],
                        onChange: (v) => updateState({ month: v })
                    }),
                    React.createElement(Slider, {
                        key: 'day',
                        label: 'Day',
                        value: state.day,
                        min: 1, max: 31,
                        onChange: (v) => updateState({ day: v })
                    })
                ]),

                // Range Mode
                state.useRange && React.createElement('div', { key: 'range' }, [
                    React.createElement('div', { key: 'startSection', className: 'hsv-section-header' }, 'Start Date'),
                    React.createElement(Slider, {
                        key: 'startMonth',
                        label: 'Month',
                        value: state.startMonth,
                        min: 1, max: 12,
                        displayValue: MONTH_NAMES[state.startMonth - 1],
                        onChange: (v) => updateState({ startMonth: v })
                    }),
                    React.createElement(Slider, {
                        key: 'startDay',
                        label: 'Day',
                        value: state.startDay,
                        min: 1, max: 31,
                        onChange: (v) => updateState({ startDay: v })
                    }),
                    React.createElement('div', { key: 'endSection', className: 'hsv-section-header', style: { marginTop: '12px' } }, 'End Date'),
                    React.createElement(Slider, {
                        key: 'endMonth',
                        label: 'Month',
                        value: state.endMonth,
                        min: 1, max: 12,
                        displayValue: MONTH_NAMES[state.endMonth - 1],
                        onChange: (v) => updateState({ endMonth: v })
                    }),
                    React.createElement(Slider, {
                        key: 'endDay',
                        label: 'Day',
                        value: state.endDay,
                        min: 1, max: 31,
                        onChange: (v) => updateState({ endDay: v })
                    })
                ]),

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
                    `(Today: ${MONTH_NAMES[currentMonth - 1]} ${currentDay})`
                )
            ])
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('DateComparisonNode', {
        label: "Date Comparison",
        category: "Logic",
        nodeClass: DateComparisonNode,
        factory: (cb) => new DateComparisonNode(cb),
        component: DateComparisonNodeComponent
    });

    console.log("[DateComparisonNode] Registered");
})();
