/**
 * SplineCurveNode.js
 * 
 * Basic spline curve node - maps input values through an editable curve
 * 
 * Uses: window.T2Spline from 00_SplineBasePlugin.js
 * 
 * Inputs:
 *   - value: Number (0-1) to map through the curve
 * 
 * Outputs:
 *   - output: Mapped value based on curve shape
 * 
 * @author T2AutoTron
 * @version 1.0.0
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
    const { SplineEditor, PresetDropdown, evaluate, createDefaultCurve, serializeCurve, deserializeCurve } = window.T2Spline;

    // =========================================================================
    // NODE CLASS
    // =========================================================================

    class SplineCurveNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super('Spline Curve');
            this.changeCallback = changeCallback;

            // Properties
            this.properties = {
                points: createDefaultCurve(),
                interpolation: 'catmull-rom',
                inputMin: 0,
                inputMax: 1,
                outputMin: 0,
                outputMax: 1,
                lastInput: 0,
                lastOutput: 0,
                editorWidth: 240,
                editorHeight: 160
            };

            // Sockets
            this.addInput('value', new ClassicPreset.Input(window.sockets.number, 'Value'));
            this.addOutput('output', new ClassicPreset.Output(window.sockets.number, 'Output'));
        }

        /**
         * Process data through the curve
         */
        data(inputs) {
            // Get input value
            let inputValue = 0;
            if (inputs.value && inputs.value.length > 0) {
                inputValue = inputs.value[0];
            }

            // Normalize input to 0-1 range
            const { inputMin, inputMax, outputMin, outputMax, points, interpolation } = this.properties;
            const normalizedInput = (inputValue - inputMin) / (inputMax - inputMin);
            const clampedInput = Math.max(0, Math.min(1, normalizedInput));

            // Evaluate curve
            const curveOutput = evaluate(points, clampedInput, interpolation);

            // Scale output to desired range
            const output = outputMin + curveOutput * (outputMax - outputMin);

            // Store for display
            this.properties.lastInput = inputValue;
            this.properties.lastOutput = output;

            if (this.changeCallback) this.changeCallback();

            return { output };
        }

        /**
         * Serialize for save
         */
        serialize() {
            return {
                points: this.properties.points,
                interpolation: this.properties.interpolation,
                inputMin: this.properties.inputMin,
                inputMax: this.properties.inputMax,
                outputMin: this.properties.outputMin,
                outputMax: this.properties.outputMax,
                editorWidth: this.properties.editorWidth,
                editorHeight: this.properties.editorHeight
            };
        }

        /**
         * Restore from save
         */
        restore(state) {
            if (state.points) this.properties.points = state.points;
            if (state.interpolation) this.properties.interpolation = state.interpolation;
            if (state.inputMin !== undefined) this.properties.inputMin = state.inputMin;
            if (state.inputMax !== undefined) this.properties.inputMax = state.inputMax;
            if (state.outputMin !== undefined) this.properties.outputMin = state.outputMin;
            if (state.outputMax !== undefined) this.properties.outputMax = state.outputMax;
            if (state.editorWidth !== undefined) this.properties.editorWidth = state.editorWidth;
            if (state.editorHeight !== undefined) this.properties.editorHeight = state.editorHeight;
        }
    }

    // =========================================================================
    // REACT COMPONENT
    // =========================================================================

    function SplineCurveNodeComponent({ data, emit }) {
        const [points, setPoints] = useState(data.properties.points);
        const [interpolation, setInterpolation] = useState(data.properties.interpolation);
        const [lastInput, setLastInput] = useState(data.properties.lastInput);
        const [lastOutput, setLastOutput] = useState(data.properties.lastOutput);
        const [editorWidth, setEditorWidth] = useState(data.properties.editorWidth || 240);
        const [editorHeight, setEditorHeight] = useState(data.properties.editorHeight || 160);
        const resizeRef = useRef(null);

        // Sync with node data
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setPoints([...data.properties.points]);
                setInterpolation(data.properties.interpolation);
                setLastInput(data.properties.lastInput);
                setLastOutput(data.properties.lastOutput);
                setEditorWidth(data.properties.editorWidth || 240);
                setEditorHeight(data.properties.editorHeight || 160);
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

        // Handle preset selection
        const handlePresetSelect = useCallback((newPoints, presetName) => {
            data.properties.points = newPoints;
            setPoints(newPoints);
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        // Handle interpolation change
        const handleInterpolationChange = useCallback((e) => {
            const newInterp = e.target.value;
            data.properties.interpolation = newInterp;
            setInterpolation(newInterp);
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

            // Get canvas scale for proper delta calculation
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

                const newWidth = Math.max(160, Math.min(600, startWidth + deltaX));
                const newHeight = Math.max(100, Math.min(400, startHeight + deltaY));

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
            minWidth: '180px',
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

        const resizeHandleStyle = {
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
        };

        return React.createElement('div', { style: containerStyle }, [
            // Header
            React.createElement('div', { key: 'header', style: headerStyle }, [
                React.createElement('div', { key: 'title', style: titleStyle }, [
                    React.createElement('span', { key: 'icon' }, '📈'),
                    'Spline Curve'
                ])
            ]),

            // Controls row
            React.createElement('div', { key: 'controls', style: controlsRowStyle }, [
                // Interpolation selector
                React.createElement('select', {
                    key: 'interp',
                    value: interpolation,
                    onChange: handleInterpolationChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    style: selectStyle
                }, [
                    React.createElement('option', { key: 'cr', value: 'catmull-rom' }, 'Smooth'),
                    React.createElement('option', { key: 'lin', value: 'linear' }, 'Linear'),
                    React.createElement('option', { key: 'bez', value: 'bezier' }, 'Bezier'),
                    React.createElement('option', { key: 'step', value: 'step' }, 'Step')
                ]),

                // Presets dropdown
                React.createElement(PresetDropdown, {
                    key: 'presets',
                    onSelect: handlePresetSelect
                })
            ]),

            // Curve editor
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
                    curveColor: '#00ff88',
                    pointColor: '#ffffff',
                    backgroundColor: '#0d0d1a',
                    gridLines: 4,
                    showGrid: true
                })
            ]),

            // Value display
            React.createElement('div', { key: 'values', style: valueDisplayStyle }, [
                React.createElement('span', { key: 'in' }, `In: ${lastInput.toFixed(3)}`),
                React.createElement('span', { key: 'arrow' }, '→'),
                React.createElement('span', { key: 'out' }, `Out: ${lastOutput.toFixed(3)}`)
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
            }, 'Dbl-click: add • Right-click: remove • Drag corner: resize'),

            // Resize handle
            React.createElement('div', {
                key: 'resize',
                ref: resizeRef,
                style: resizeHandleStyle,
                onPointerDown: handleResizeStart,
                title: 'Drag to resize'
            }, '⤡')
        ]);
    }

    // =========================================================================
    // REGISTER NODE
    // =========================================================================

    if (window.nodeRegistry) {
        window.nodeRegistry.register('SplineCurveNode', {
            label: 'Spline Curve',
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
