(function() {
    console.log("[TimeRangeNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets) {
        console.error("[TimeRangeNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;

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

    // -------------------------------------------------------------------------
    // CONTROLS
    // -------------------------------------------------------------------------
    class SliderControl extends ClassicPreset.Control {
        constructor(label, initialValue, onChange, options = {}) {
            super();
            this.label = label;
            this.value = initialValue;
            this.onChange = onChange;
            this.options = options; // min, max
        }
    }

    function SliderControlComponent({ data }) {
        const [value, setValue] = useState(data.value);

        useEffect(() => {
            setValue(data.value);
        }, [data.value]);

        const handleChange = (e) => {
            const val = Number(e.target.value);
            setValue(val);
            data.value = val;
            if (data.onChange) data.onChange(val);
        };

        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '6px' } }, [
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#ccc' } }, [
                React.createElement('span', { key: 'label' }, data.label),
                React.createElement('span', { key: 'val' }, value)
            ]),
            React.createElement('input', {
                type: 'range',
                value: value,
                onChange: handleChange,
                min: data.options.min,
                max: data.options.max,
                step: 1,
                onPointerDown: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                style: { width: '100%', cursor: 'pointer' }
            })
        ]);
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class TimeRangeNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Time Range");
            this.changeCallback = changeCallback;
            this.width = 280;
            this.uiUpdateCallback = null;

            this.properties = {
                startHour: 19,
                startMinute: 0,
                endHour: 21,
                endMinute: 0
            };

            this.addOutput("in_range", new ClassicPreset.Output(sockets.boolean || new ClassicPreset.Socket('boolean'), "In Range"));

            const update = () => {
                if (this.changeCallback) this.changeCallback();
                if (this.uiUpdateCallback) this.uiUpdateCallback();
            };

            this.addControl("start_h", new SliderControl("Start Hour", 19, (v) => { this.properties.startHour = v; update(); }, { min: 0, max: 23 }));
            this.addControl("start_m", new SliderControl("Start Minute", 0, (v) => { this.properties.startMinute = v; update(); }, { min: 0, max: 59 }));
            this.addControl("end_h", new SliderControl("End Hour", 21, (v) => { this.properties.endHour = v; update(); }, { min: 0, max: 23 }));
            this.addControl("end_m", new SliderControl("End Minute", 0, (v) => { this.properties.endMinute = v; update(); }, { min: 0, max: 59 }));
        }

        data() {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            const startMinutes = this.properties.startHour * 60 + this.properties.startMinute;
            const endMinutes = this.properties.endHour * 60 + this.properties.endMinute;

            let inRange = false;
            if (startMinutes < endMinutes) {
                inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
            } else if (startMinutes > endMinutes) {
                // Crosses midnight
                inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
            } else {
                // Start == End, assume full day
                inRange = true;
            }

            return {
                in_range: inRange
            };
        }

        restore(state) {
            if (state.properties) {
                this.properties = { ...this.properties, ...state.properties };
            }
            this.controls.start_h.value = this.properties.startHour;
            this.controls.start_m.value = this.properties.startMinute;
            this.controls.end_h.value = this.properties.endHour;
            this.controls.end_m.value = this.properties.endMinute;
            
            if (this.uiUpdateCallback) this.uiUpdateCallback();
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function TimeRangeNodeComponent({ data, emit }) {
        const outputs = Object.entries(data.outputs);
        // We filter out controls we want to render manually
        const controls = Object.entries(data.controls);
        
        const [, forceUpdate] = useState(0);

        useEffect(() => {
            data.uiUpdateCallback = () => forceUpdate(n => n + 1);
            return () => { data.uiUpdateCallback = null; };
        }, [data]);

        const startH = data.controls.start_h ? data.controls.start_h.value : 0;
        const startM = data.controls.start_m ? data.controls.start_m.value : 0;
        const endH = data.controls.end_h ? data.controls.end_h.value : 0;
        const endM = data.controls.end_m ? data.controls.end_m.value : 0;

        const startLabel = formatAmPm(startH, startM);
        const endLabel = formatAmPm(endH, endM);

        return React.createElement('div', { className: 'logic-node' }, [
            React.createElement('div', { key: 'header', className: 'header' }, data.label),
            
            React.createElement('div', { 
                key: 'display',
                style: { 
                    padding: '10px', 
                    textAlign: 'center', 
                    color: '#4fc3f7', 
                    fontWeight: 'bold',
                    fontSize: '14px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.2)'
                } 
            }, `${startLabel} - ${endLabel}`),

            React.createElement('div', { key: 'controls', className: 'controls' }, 
                controls.map(([key, control]) => {
                    // Check if it's our SliderControl
                    if (control instanceof SliderControl) {
                        return React.createElement(SliderControlComponent, { key: key, data: control });
                    }
                    // Fallback for other controls (if any)
                    return React.createElement(RefComponent, {
                        key: key,
                        init: ref => emit({ type: "render", data: { type: "control", element: ref, payload: control } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    });
                })
            ),

            React.createElement('div', { key: 'outputs', className: 'io-container' }, 
                outputs.map(([key, output]) => React.createElement('div', { key: key, className: 'socket-row', style: { justifyContent: 'flex-end' } }, [
                    React.createElement('span', { key: 'label', style: { marginRight: '10px', fontSize: '12px' } }, output.label),
                    React.createElement(RefComponent, {
                        key: 'socket',
                        init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                        unmount: ref => emit({ type: "unmount", data: { element: ref } })
                    })
                ]))
            )
        ]);
    }

    window.nodeRegistry.register('TimeRangeNode', {
        label: "Time Range",
        category: "Logic",
        nodeClass: TimeRangeNode,
        factory: (cb) => new TimeRangeNode(cb),
        component: TimeRangeNodeComponent
    });

    console.log("[TimeRangeNode] Registered");
})();
