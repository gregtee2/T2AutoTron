/**
 * SplineHueCurveNode.js
 * 
 * Hue-based curve editor - adjust values based on input hue
 * Similar to Nuke's HueCorrect or DaVinci's Hue vs Sat/Lum curves
 * 
 * Uses: window.T2Spline from 00_SplineBasePlugin.js
 * 
 * Inputs:
 *   - hue: Hue value (0-1 or 0-360)
 *   - value: Base value to modify (optional)
 * 
 * Outputs:
 *   - multiplier: Curve value at input hue (for multiplication)
 *   - output: Input value * multiplier
 * 
 * Use case: Selectively boost/reduce saturation, brightness, etc. by hue range
 * Example: Reduce green saturation while boosting orange warmth
 * 
 * @author T2AutoTron
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Wait for dependencies
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[SplineHueCurveNode] Missing dependencies, retrying...');
        setTimeout(arguments.callee, 100);
        return;
    }

    // Wait for spline base
    if (!window.T2Spline) {
        console.warn('[SplineHueCurveNode] Waiting for T2Spline...');
        setTimeout(arguments.callee, 100);
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const { SplineEditor, evaluate, createFlatCurve } = window.T2Spline;

    // =========================================================================
    // NODE CLASS
    // =========================================================================

    class SplineHueCurveNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super('Hue Curve');
            this.changeCallback = changeCallback;

            // Properties - flat curve at 1.0 (no change) by default
            this.properties = {
                points: createFlatCurve(1.0),
                interpolation: 'catmull-rom',
                hueInputMode: 'normalized', // 'normalized' (0-1) or 'degrees' (0-360)
                outputMode: 'multiplier',    // 'multiplier' or 'absolute'
                lastHue: 0,
                lastMultiplier: 1,
                editorWidth: 260,
                editorHeight: 140
            };

            // Sockets
            this.addInput('hue', new ClassicPreset.Input(window.sockets.number, 'Hue'));
            this.addInput('value', new ClassicPreset.Input(window.sockets.number, 'Value'));
            this.addOutput('multiplier', new ClassicPreset.Output(window.sockets.number, 'Multiplier'));
            this.addOutput('output', new ClassicPreset.Output(window.sockets.number, 'Output'));
        }

        /**
         * Process hue through the curve
         */
        data(inputs) {
            // Get hue input
            let hue = 0;
            if (inputs.hue && inputs.hue.length > 0) {
                hue = inputs.hue[0];
            }

            // Get value input (default 1.0)
            let value = 1;
            if (inputs.value && inputs.value.length > 0) {
                value = inputs.value[0];
            }

            // Normalize hue to 0-1
            const { hueInputMode, points, interpolation } = this.properties;
            let normalizedHue = hue;
            if (hueInputMode === 'degrees') {
                normalizedHue = (hue % 360) / 360;
            }
            normalizedHue = ((normalizedHue % 1) + 1) % 1; // Wrap to 0-1

            // Evaluate curve
            const multiplier = evaluate(points, normalizedHue, interpolation);

            // Calculate output
            const output = value * multiplier;

            // Store for display
            this.properties.lastHue = hue;
            this.properties.lastMultiplier = multiplier;

            if (this.changeCallback) this.changeCallback();

            return { 
                multiplier,
                output
            };
        }

        serialize() {
            return {
                points: this.properties.points,
                interpolation: this.properties.interpolation,
                hueInputMode: this.properties.hueInputMode,
                editorWidth: this.properties.editorWidth,
                editorHeight: this.properties.editorHeight
            };
        }

        restore(state) {
            if (state.points) this.properties.points = state.points;
            if (state.interpolation) this.properties.interpolation = state.interpolation;
            if (state.hueInputMode) this.properties.hueInputMode = state.hueInputMode;
            if (state.editorWidth !== undefined) this.properties.editorWidth = state.editorWidth;
            if (state.editorHeight !== undefined) this.properties.editorHeight = state.editorHeight;
        }
    }

    // =========================================================================
    // REACT COMPONENT
    // =========================================================================

    function SplineHueCurveNodeComponent({ data, emit }) {
        const [points, setPoints] = useState(data.properties.points);
        const [interpolation, setInterpolation] = useState(data.properties.interpolation);
        const [hueInputMode, setHueInputMode] = useState(data.properties.hueInputMode);
        const [lastHue, setLastHue] = useState(data.properties.lastHue);
        const [lastMultiplier, setLastMultiplier] = useState(data.properties.lastMultiplier);
        const [editorWidth, setEditorWidth] = useState(data.properties.editorWidth || 260);
        const [editorHeight, setEditorHeight] = useState(data.properties.editorHeight || 140);

        // Sync with node data
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setPoints([...data.properties.points]);
                setInterpolation(data.properties.interpolation);
                setHueInputMode(data.properties.hueInputMode);
                setLastHue(data.properties.lastHue);
                setLastMultiplier(data.properties.lastMultiplier);
                setEditorWidth(data.properties.editorWidth || 260);
                setEditorHeight(data.properties.editorHeight || 140);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        // Handle curve changes
        const handleCurveChange = useCallback((newPoints) => {
            data.properties.points = newPoints;
            setPoints(newPoints);
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        // Handle mode changes
        const handleHueModeChange = useCallback((e) => {
            const mode = e.target.value;
            data.properties.hueInputMode = mode;
            setHueInputMode(mode);
        }, [data]);

        // Reset curve to flat
        const handleReset = useCallback((e) => {
            e.stopPropagation();
            const flatCurve = createFlatCurve(1.0);
            data.properties.points = flatCurve;
            setPoints(flatCurve);
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        // Handle resize
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

                const newWidth = Math.max(180, Math.min(600, startWidth + deltaX));
                const newHeight = Math.max(80, Math.min(400, startHeight + deltaY));

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
                if (data.changeCallback) data.changeCallback();
            };

            target.addEventListener('pointermove', handleMove);
            target.addEventListener('pointerup', handleUp);
            target.addEventListener('pointercancel', handleUp);
        }, [editorWidth, editorHeight, data]);

        // Styles
        const containerStyle = {
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)',
            borderRadius: '8px',
            padding: '8px',
            minWidth: '200px',
            fontFamily: 'Arial, sans-serif',
            color: '#e0e0e0',
            position: 'relative'
        };

        const headerStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            paddingBottom: '6px',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
        };

        const titleStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 'bold'
        };

        const controlsRowStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
            gap: '4px'
        };

        const selectStyle = {
            padding: '2px 4px',
            fontSize: '10px',
            background: '#333',
            color: '#ddd',
            border: '1px solid #555',
            borderRadius: '3px',
            cursor: 'pointer'
        };

        const buttonStyle = {
            padding: '2px 6px',
            fontSize: '10px',
            background: '#444',
            color: '#ddd',
            border: '1px solid #555',
            borderRadius: '3px',
            cursor: 'pointer'
        };

        const valueDisplayStyle = {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: '#888',
            marginTop: '6px',
            padding: '4px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '4px'
        };

        // Hue color indicator
        const hueColor = `hsl(${lastHue * (hueInputMode === 'degrees' ? 1 : 360)}, 70%, 50%)`;

        return React.createElement('div', { style: containerStyle }, [
            // Header
            React.createElement('div', { key: 'header', style: headerStyle }, [
                React.createElement('div', { key: 'title', style: titleStyle }, [
                    React.createElement('span', { key: 'icon' }, '🌈'),
                    'Hue Curve'
                ]),
                React.createElement('button', {
                    key: 'reset',
                    onClick: handleReset,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: buttonStyle,
                    title: 'Reset to flat curve'
                }, '↺ Reset')
            ]),

            // Controls row
            React.createElement('div', { key: 'controls', style: controlsRowStyle }, [
                React.createElement('select', {
                    key: 'hueMode',
                    value: hueInputMode,
                    onChange: handleHueModeChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: selectStyle
                }, [
                    React.createElement('option', { key: 'norm', value: 'normalized' }, 'Hue 0-1'),
                    React.createElement('option', { key: 'deg', value: 'degrees' }, 'Hue 0-360°')
                ]),
                
                // Current hue color indicator
                React.createElement('div', {
                    key: 'hueIndicator',
                    style: {
                        width: '20px',
                        height: '14px',
                        background: hueColor,
                        borderRadius: '3px',
                        border: '1px solid #555'
                    },
                    title: `Current hue: ${lastHue.toFixed(2)}`
                })
            ]),

            // Curve editor with hue gradient background
            React.createElement('div', { 
                key: 'editor',
                style: { display: 'flex', justifyContent: 'center' }
            }, [
                React.createElement(SplineEditor, {
                    key: 'spline',
                    points: points,
                    onChange: handleCurveChange,
                    interpolation: interpolation,
                    width: editorWidth,
                    height: editorHeight,
                    curveColor: '#ffffff',
                    pointColor: '#ffffff',
                    gradientBackground: 'hue',
                    gridLines: 6,
                    showGrid: true,
                    minY: 0,
                    maxY: 2,  // Allow boost up to 2x
                    lockEndpoints: false  // Allow any hue mapping
                })
            ]),

            // Y-axis labels
            React.createElement('div', { 
                key: 'yLabels',
                style: { 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    fontSize: '9px',
                    color: '#666',
                    padding: '0 4px'
                }
            }, [
                React.createElement('span', { key: 'min' }, '0'),
                React.createElement('span', { key: 'half' }, '1.0'),
                React.createElement('span', { key: 'max' }, '2.0')
            ]),

            // Value display
            React.createElement('div', { key: 'values', style: valueDisplayStyle }, [
                React.createElement('span', { key: 'hue' }, `Hue: ${lastHue.toFixed(2)}`),
                React.createElement('span', { key: 'arrow' }, '→'),
                React.createElement('span', { 
                    key: 'mult',
                    style: { 
                        color: lastMultiplier > 1 ? '#4f4' : lastMultiplier < 1 ? '#f44' : '#888'
                    }
                }, `×${lastMultiplier.toFixed(2)}`)
            ]),

            // Instructions
            React.createElement('div', { 
                key: 'help',
                style: { 
                    fontSize: '9px', 
                    color: '#666', 
                    marginTop: '4px',
                    textAlign: 'center'
                }
            }, 'Dbl-click: add • Right-click: remove • 1.0 = no change'),

            // Resize handle
            React.createElement('div', {
                key: 'resize',
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
        ]);
    }

    // =========================================================================
    // REGISTER NODE
    // =========================================================================

    if (window.nodeRegistry) {
        window.nodeRegistry.register('SplineHueCurveNode', {
            label: 'Hue Curve',
            category: 'Color',
            nodeClass: SplineHueCurveNode,
            component: SplineHueCurveNodeComponent,
            factory: (cb) => new SplineHueCurveNode(cb)
        });
        console.log('[SplineHueCurveNode] Registered successfully');
    } else {
        console.error('[SplineHueCurveNode] nodeRegistry not found');
    }

})();
