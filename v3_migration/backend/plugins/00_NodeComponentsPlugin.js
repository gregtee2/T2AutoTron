// ============================================================================
// 00_NodeComponentsPlugin.js - Shared component patterns for T2AutoTron nodes
// This file MUST be loaded AFTER 00_SharedControlsPlugin.js and 00_BaseNodePlugin.js
// Exposes window.T2Components for use by all node plugins
// ============================================================================

(function() {
    // Debug: console.log("[NodeComponentsPlugin] Loading shared...");

    // Dependency check
    if (!window.React || !window.RefComponent) {
        console.error("[NodeComponentsPlugin] Missing dependencies: React or RefComponent not found");
        return;
    }

    const React = window.React;
    const RefComponent = window.RefComponent;

    // Get theme from T2Controls if available
    const THEME = window.T2Controls?.THEME || {
        primary: '#00f3ff',
        primaryRgba: (alpha) => `rgba(0, 243, 255, ${alpha})`,
        background: '#0a0f14',
        backgroundAlt: 'rgba(0, 20, 30, 0.6)',
        text: '#e0f7fa',
        border: 'rgba(0, 243, 255, 0.3)'
    };

    // =========================================================================
    // SOCKET RENDERING HELPERS
    // =========================================================================

    /**
     * Create a socket reference element for Rete
     */
    function createSocketRef(emit, socket, nodeId, side, key) {
        return React.createElement(RefComponent, {
            key: `socket-${key}`,
            init: ref => emit({ 
                type: "render", 
                data: { type: "socket", element: ref, payload: socket, nodeId, side, key } 
            }),
            unmount: ref => emit({ type: "unmount", data: { element: ref } })
        });
    }

    /**
     * Create a control reference element for Rete
     */
    function createControlRef(emit, control, key) {
        return React.createElement(RefComponent, {
            key: `control-${key}`,
            init: ref => emit({ 
                type: "render", 
                data: { type: "control", element: ref, payload: control } 
            }),
            unmount: ref => emit({ type: "unmount", data: { element: ref } })
        });
    }

    // =========================================================================
    // INPUT ROW COMPONENT
    // =========================================================================
    function InputRow({ inputKey, input, emit, nodeId, style = {} }) {
        return React.createElement('div', { 
            key: inputKey, 
            className: 'socket-row input-row',
            style: { display: 'flex', alignItems: 'center', marginBottom: '4px', ...style }
        }, [
            createSocketRef(emit, input.socket, nodeId, 'input', inputKey),
            React.createElement('span', { 
                key: 'label',
                style: { marginLeft: '10px', fontSize: '12px', color: '#ccc' } 
            }, input.label || inputKey)
        ]);
    }

    // =========================================================================
    // OUTPUT ROW COMPONENT
    // =========================================================================
    function OutputRow({ outputKey, output, emit, nodeId, style = {} }) {
        return React.createElement('div', { 
            key: outputKey, 
            className: 'socket-row output-row',
            style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '4px', ...style }
        }, [
            React.createElement('span', { 
                key: 'label',
                style: { marginRight: '10px', fontSize: '12px', color: '#ccc' } 
            }, output.label || outputKey),
            createSocketRef(emit, output.socket, nodeId, 'output', outputKey)
        ]);
    }

    // =========================================================================
    // STANDARD NODE LAYOUT COMPONENT
    // Creates a consistent node structure with header, inputs, controls, outputs
    // =========================================================================
    function StandardNodeLayout({ 
        data, 
        emit, 
        title,
        headerColor = THEME.primary,
        headerBg = THEME.primaryRgba(0.1),
        children,
        className = 'standard-node',
        style = {}
    }) {
        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});
        const controls = Object.entries(data.controls || {});

        return React.createElement('div', { 
            className,
            style: {
                background: 'linear-gradient(180deg, rgba(10,20,30,0.95) 0%, rgba(5,15,25,0.98) 100%)',
                border: `1px solid ${THEME.border}`,
                borderRadius: '8px',
                minWidth: '160px',
                ...style
            }
        }, [
            // Header
            React.createElement('div', { 
                key: 'header',
                className: 'header',
                style: {
                    background: headerBg,
                    borderBottom: `1px solid ${THEME.border}`,
                    padding: '8px 12px',
                    borderRadius: '7px 7px 0 0',
                    color: headerColor,
                    fontWeight: '600',
                    fontSize: '13px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }
            }, title || data.label),

            // Inputs
            inputs.length > 0 && React.createElement('div', { 
                key: 'inputs',
                className: 'io-container inputs',
                style: { padding: '8px 10px' }
            }, inputs.map(([key, input]) => 
                React.createElement(InputRow, { 
                    key, 
                    inputKey: key, 
                    input, 
                    emit, 
                    nodeId: data.id 
                })
            )),

            // Controls (rendered via Rete)
            controls.length > 0 && React.createElement('div', { 
                key: 'controls',
                className: 'controls',
                style: { padding: '4px 10px', borderTop: `1px solid ${THEME.border}` }
            }, controls.map(([key, control]) => 
                createControlRef(emit, control, key)
            )),

            // Custom children (for custom content between controls and outputs)
            children,

            // Outputs
            outputs.length > 0 && React.createElement('div', { 
                key: 'outputs',
                className: 'io-container outputs',
                style: { padding: '8px 10px', borderTop: `1px solid ${THEME.border}` }
            }, outputs.map(([key, output]) => 
                React.createElement(OutputRow, { 
                    key, 
                    outputKey: key, 
                    output, 
                    emit, 
                    nodeId: data.id 
                })
            ))
        ]);
    }

    // =========================================================================
    // SIMPLE NODE COMPONENT FACTORY
    // Creates a basic node component with inputs, controls, and outputs
    // =========================================================================
    function createSimpleNodeComponent(options = {}) {
        const {
            headerColor = THEME.primary,
            headerBg = THEME.primaryRgba(0.1),
            className = 'simple-node'
        } = options;

        return function SimpleNodeComponent({ data, emit }) {
            return React.createElement(StandardNodeLayout, {
                data,
                emit,
                headerColor,
                headerBg,
                className
            });
        };
    }

    // =========================================================================
    // TRON-STYLED VALUE DISPLAY
    // =========================================================================
    function ValueDisplay({ value, label, style = {} }) {
        let displayValue = 'No Data';
        
        if (value !== undefined && value !== null) {
            if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
            } else {
                displayValue = String(value);
            }
        }

        return React.createElement('div', {
            className: 'value-display',
            style: {
                padding: '8px 12px',
                background: THEME.backgroundAlt,
                border: `1px solid ${THEME.border}`,
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: THEME.text,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                ...style
            }
        }, [
            label && React.createElement('div', { 
                key: 'label',
                style: { fontSize: '10px', color: THEME.primary, marginBottom: '4px', textTransform: 'uppercase' }
            }, label),
            React.createElement('div', { key: 'value' }, displayValue)
        ]);
    }

    // =========================================================================
    // STATUS BADGE COMPONENT
    // =========================================================================
    function StatusBadge({ active, activeText = 'ON', inactiveText = 'OFF', activeColor = '#00ff88', inactiveColor = '#ff4444' }) {
        const isActive = !!active;
        const color = isActive ? activeColor : inactiveColor;

        return React.createElement('div', {
            className: 'status-badge',
            style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: `${color}20`,
                border: `1px solid ${color}`,
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '600',
                color: color,
                textTransform: 'uppercase'
            }
        }, [
            React.createElement('div', {
                key: 'indicator',
                style: {
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: color,
                    boxShadow: isActive ? `0 0 8px ${color}` : 'none'
                }
            }),
            React.createElement('span', { key: 'text' }, isActive ? activeText : inactiveText)
        ]);
    }

    // =========================================================================
    // SECTION HEADER COMPONENT
    // =========================================================================
    function SectionHeader({ title, style = {} }) {
        return React.createElement('div', {
            className: 'section-header',
            style: {
                fontSize: '10px',
                fontWeight: '600',
                color: THEME.primary,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginTop: '12px',
                marginBottom: '6px',
                paddingBottom: '4px',
                borderBottom: `1px solid ${THEME.border}`,
                ...style
            }
        }, title);
    }

    // =========================================================================
    // SLIDER WITH LABEL COMPONENT
    // =========================================================================
    function LabeledSlider({ 
        label, 
        value, 
        min = 0, 
        max = 100, 
        step = 1, 
        onChange, 
        displayValue,
        disabled = false 
    }) {
        return React.createElement('div', {
            className: 'labeled-slider',
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '8px'
            }
        }, [
            React.createElement('span', {
                key: 'label',
                style: { 
                    fontSize: '11px', 
                    color: THEME.text, 
                    minWidth: '60px' 
                }
            }, label),
            React.createElement('input', {
                key: 'slider',
                type: 'range',
                min, max, step,
                value,
                disabled,
                onChange: (e) => onChange(Number(e.target.value)),
                onPointerDown: (e) => e.stopPropagation(),
                style: {
                    flex: 1,
                    accentColor: THEME.primary
                }
            }),
            React.createElement('span', {
                key: 'value',
                style: { 
                    fontSize: '11px', 
                    color: THEME.primary, 
                    minWidth: '40px',
                    textAlign: 'right',
                    fontFamily: 'monospace'
                }
            }, displayValue !== undefined ? displayValue : value)
        ]);
    }

    // =========================================================================
    // EXPOSE TO WINDOW
    // =========================================================================
    window.T2Components = {
        // Socket/Control helpers
        createSocketRef,
        createControlRef,

        // Row components
        InputRow,
        OutputRow,

        // Layout components
        StandardNodeLayout,
        createSimpleNodeComponent,

        // UI components
        ValueDisplay,
        StatusBadge,
        SectionHeader,
        LabeledSlider,

        // Theme reference
        THEME
    };

    // console.log("[NodeComponentsPlugin] Registered window.T2Components with", Object.keys(window.T2Components).length, "exports");
})();
