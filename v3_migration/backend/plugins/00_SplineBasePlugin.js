/**
 * 00_SplineBasePlugin.js
 * 
 * Base spline/curve infrastructure for T2AutoTron
 * Provides reusable curve editor component and interpolation math
 * 
 * Usage in other plugins:
 *   const { SplineEditor, evaluate, createDefaultCurve } = window.T2Spline;
 * 
 * @author T2AutoTron
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('[T2Spline] React not found');
        return;
    }

    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;

    // =========================================================================
    // CURVE MATH - Interpolation algorithms
    // =========================================================================

    /**
     * Linear interpolation between two values
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Clamp value between min and max
     */
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Evaluate cubic bezier curve at parameter t
     * p0, p1, p2, p3 are control points
     */
    function cubicBezier(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
    }

    /**
     * Catmull-Rom spline interpolation
     * Gives smooth curves through all control points
     */
    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    /**
     * Find the segment index for a given x value in sorted points
     */
    function findSegment(points, x) {
        for (let i = 0; i < points.length - 1; i++) {
            if (x >= points[i].x && x <= points[i + 1].x) {
                return i;
            }
        }
        return points.length - 2;
    }

    /**
     * Evaluate curve at x position
     * @param {Array} points - Array of {x, y} control points (sorted by x)
     * @param {number} x - Input value (0-1)
     * @param {string} interpolation - 'linear', 'bezier', 'catmull-rom', 'step'
     * @returns {number} - Output value (0-1 typically, can exceed for gain)
     */
    function evaluate(points, x, interpolation = 'catmull-rom') {
        if (!points || points.length === 0) return x;
        if (points.length === 1) return points[0].y;

        // Clamp x to curve bounds
        x = clamp(x, 0, 1);

        // Find which segment we're in
        const segIdx = findSegment(points, x);
        const p1 = points[segIdx];
        const p2 = points[segIdx + 1];

        // Calculate local t parameter within segment
        const segmentWidth = p2.x - p1.x;
        if (segmentWidth === 0) return p1.y;
        const t = (x - p1.x) / segmentWidth;

        switch (interpolation) {
            case 'linear':
                return lerp(p1.y, p2.y, t);

            case 'step':
                return t < 0.5 ? p1.y : p2.y;

            case 'bezier':
                // Use bezier handles if available, otherwise auto-calculate
                const h1 = p1.handleOut || { x: p1.x + segmentWidth * 0.33, y: p1.y };
                const h2 = p2.handleIn || { x: p2.x - segmentWidth * 0.33, y: p2.y };
                // Approximate - solve for t given x, then get y
                // For simplicity, use y interpolation with bezier easing
                return cubicBezier(p1.y, h1.y, h2.y, p2.y, t);

            case 'catmull-rom':
            default:
                // Get neighboring points for smooth interpolation
                const p0 = points[Math.max(0, segIdx - 1)];
                const p3 = points[Math.min(points.length - 1, segIdx + 2)];
                return catmullRom(p0.y, p1.y, p2.y, p3.y, t);
        }
    }

    /**
     * Create a default linear curve (diagonal line)
     * @param {number} numPoints - Number of initial points (default 2)
     * @returns {Array} - Array of control points
     */
    function createDefaultCurve(numPoints = 2) {
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            points.push({ x: t, y: t, id: `p${i}` });
        }
        return points;
    }

    /**
     * Create a flat curve at specified y value
     */
    function createFlatCurve(yValue = 0.5) {
        return [
            { x: 0, y: yValue, id: 'p0' },
            { x: 1, y: yValue, id: 'p1' }
        ];
    }

    /**
     * Create common preset curves
     */
    const curvePresets = {
        linear: () => createDefaultCurve(2),
        flat: () => createFlatCurve(0.5),
        sCurve: () => [
            { x: 0, y: 0, id: 'p0' },
            { x: 0.25, y: 0.1, id: 'p1' },
            { x: 0.75, y: 0.9, id: 'p2' },
            { x: 1, y: 1, id: 'p3' }
        ],
        easeIn: () => [
            { x: 0, y: 0, id: 'p0' },
            { x: 0.5, y: 0.1, id: 'p1' },
            { x: 1, y: 1, id: 'p2' }
        ],
        easeOut: () => [
            { x: 0, y: 0, id: 'p0' },
            { x: 0.5, y: 0.9, id: 'p1' },
            { x: 1, y: 1, id: 'p2' }
        ],
        easeInOut: () => [
            { x: 0, y: 0, id: 'p0' },
            { x: 0.3, y: 0.05, id: 'p1' },
            { x: 0.7, y: 0.95, id: 'p2' },
            { x: 1, y: 1, id: 'p3' }
        ],
        bump: () => [
            { x: 0, y: 0, id: 'p0' },
            { x: 0.5, y: 1, id: 'p1' },
            { x: 1, y: 0, id: 'p2' }
        ],
        dip: () => [
            { x: 0, y: 1, id: 'p0' },
            { x: 0.5, y: 0, id: 'p1' },
            { x: 1, y: 1, id: 'p2' }
        ]
    };

    /**
     * Serialize curve for storage
     */
    function serializeCurve(points) {
        return JSON.stringify(points);
    }

    /**
     * Deserialize curve from storage
     */
    function deserializeCurve(data) {
        try {
            if (typeof data === 'string') {
                return JSON.parse(data);
            }
            return data;
        } catch (e) {
            console.error('[T2Spline] Failed to deserialize curve:', e);
            return createDefaultCurve();
        }
    }

    // =========================================================================
    // SPLINE EDITOR COMPONENT - Interactive curve editor
    // =========================================================================

    /**
     * SplineEditor - Interactive curve editor component
     * 
     * Props:
     *   points: Array of {x, y} control points
     *   onChange: Callback when points change
     *   width: Canvas width (default 200)
     *   height: Canvas height (default 150)
     *   interpolation: 'linear', 'bezier', 'catmull-rom', 'step'
     *   gridLines: Number of grid divisions (default 4)
     *   showGrid: Show grid lines (default true)
     *   showLabels: Show axis labels (default false)
     *   curveColor: Color of the curve line
     *   pointColor: Color of control points
     *   backgroundColor: Background color
     *   gradientBackground: Optional hue/spectrum gradient
     *   minY: Minimum Y value (default 0)
     *   maxY: Maximum Y value (default 1)
     *   lockEndpoints: Prevent moving first/last X position
     */
    function SplineEditor(props) {
        const {
            points = createDefaultCurve(),
            onChange,
            width = 200,
            height = 150,
            interpolation = 'catmull-rom',
            gridLines = 4,
            showGrid = true,
            showLabels = false,
            curveColor = '#00ff88',
            pointColor = '#ffffff',
            backgroundColor = '#1a1a2e',
            gradientBackground = null,
            minY = 0,
            maxY = 1,
            lockEndpoints = true,
            readOnly = false,
            playheadPosition = null,  // 0-1 position, null = no playhead
            playheadColor = '#ff6600'
        } = props;

        const canvasRef = useRef(null);
        const draggingRef = useRef(null);  // Use ref for dragging state to avoid stale closures
        const [hovered, setHovered] = useState(null);
        const [, forceUpdate] = useState(0);  // Force re-render for visual feedback

        const POINT_RADIUS = 8;
        const PADDING = 12;

        // Convert normalized coordinates to canvas coordinates
        const toCanvasX = (x) => PADDING + x * (width - 2 * PADDING);
        const toCanvasY = (y) => height - PADDING - ((y - minY) / (maxY - minY)) * (height - 2 * PADDING);
        const toCanvas = (x, y) => ({ x: toCanvasX(x), y: toCanvasY(y) });

        // Convert canvas coordinates to normalized coordinates  
        const fromCanvasX = (cx) => clamp((cx - PADDING) / (width - 2 * PADDING), 0, 1);
        const fromCanvasY = (cy) => clamp(minY + (1 - (cy - PADDING) / (height - 2 * PADDING)) * (maxY - minY), minY, maxY);
        const fromCanvas = (cx, cy) => ({ x: fromCanvasX(cx), y: fromCanvasY(cy) });

        // Get mouse position relative to canvas
        const getMousePos = (e) => {
            const canvas = canvasRef.current;
            if (!canvas) return { x: 0, y: 0 };
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        // Find point near canvas position
        const findPointAt = (cx, cy) => {
            for (let i = 0; i < points.length; i++) {
                const cp = toCanvas(points[i].x, points[i].y);
                const dist = Math.sqrt((cp.x - cx) ** 2 + (cp.y - cy) ** 2);
                if (dist < POINT_RADIUS + 6) {
                    return i;
                }
            }
            return -1;
        };

        // Draw the curve
        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);

            // Background
            if (gradientBackground === 'hue') {
                const grad = ctx.createLinearGradient(PADDING, 0, width - PADDING, 0);
                for (let i = 0; i <= 10; i++) {
                    const hue = (i / 10) * 360;
                    grad.addColorStop(i / 10, `hsl(${hue}, 70%, 30%)`);
                }
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = backgroundColor;
            }
            ctx.fillRect(0, 0, width, height);

            // Grid
            if (showGrid) {
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1;
                
                for (let i = 0; i <= gridLines; i++) {
                    const t = i / gridLines;
                    
                    const vx = PADDING + t * (width - 2 * PADDING);
                    ctx.beginPath();
                    ctx.moveTo(vx, PADDING);
                    ctx.lineTo(vx, height - PADDING);
                    ctx.stroke();
                    
                    const hy = PADDING + t * (height - 2 * PADDING);
                    ctx.beginPath();
                    ctx.moveTo(PADDING, hy);
                    ctx.lineTo(width - PADDING, hy);
                    ctx.stroke();
                }

                // Center/unity line
                const unityY = toCanvasY(1.0);
                if (unityY > PADDING && unityY < height - PADDING) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(PADDING, unityY);
                    ctx.lineTo(width - PADDING, unityY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Draw curve
            ctx.strokeStyle = curveColor;
            ctx.lineWidth = 2;
            ctx.beginPath();

            const steps = width - 2 * PADDING;
            for (let i = 0; i <= steps; i++) {
                const x = i / steps;
                const y = evaluate(points, x, interpolation);
                const cx = toCanvasX(x);
                const cy = toCanvasY(y);
                
                if (i === 0) {
                    ctx.moveTo(cx, cy);
                } else {
                    ctx.lineTo(cx, cy);
                }
            }
            ctx.stroke();

            // Draw control points
            points.forEach((point, idx) => {
                const cp = toCanvas(point.x, point.y);
                
                // Point shadow
                ctx.beginPath();
                ctx.arc(cp.x, cp.y, POINT_RADIUS + 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fill();

                // Point fill
                ctx.beginPath();
                ctx.arc(cp.x, cp.y, POINT_RADIUS, 0, Math.PI * 2);
                const isDragging = draggingRef.current === idx;
                const isHovered = hovered === idx;
                ctx.fillStyle = isDragging ? '#ff6600' : (isHovered ? '#ffff00' : pointColor);
                ctx.fill();

                // Point border
                ctx.strokeStyle = isDragging ? '#ff0000' : curveColor;
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // Draw playhead indicator
            if (playheadPosition !== null && playheadPosition !== undefined) {
                const playX = toCanvasX(clamp(playheadPosition, 0, 1));
                
                // Vertical line
                ctx.beginPath();
                ctx.moveTo(playX, PADDING);
                ctx.lineTo(playX, height - PADDING);
                ctx.strokeStyle = playheadColor;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Current value dot on curve
                const currentY = evaluate(points, playheadPosition, interpolation);
                const dotPos = toCanvas(playheadPosition, currentY);
                
                ctx.beginPath();
                ctx.arc(dotPos.x, dotPos.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = playheadColor;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Labels
            if (showLabels) {
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '10px monospace';
                ctx.fillText('0', PADDING, height - 2);
                ctx.fillText('1', width - PADDING - 6, height - 2);
                ctx.fillText(maxY.toFixed(1), 2, PADDING + 4);
                ctx.fillText(minY.toFixed(1), 2, height - PADDING);
            }

        }, [points, width, height, interpolation, gridLines, showGrid, 
            curveColor, pointColor, backgroundColor, gradientBackground,
            minY, maxY, hovered, showLabels, playheadPosition, playheadColor]);

        // Pointer down - start drag or add point
        const handlePointerDown = (e) => {
            if (readOnly) return;
            
            e.stopPropagation();
            e.preventDefault();
            
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            const pos = getMousePos(e);
            const pointIdx = findPointAt(pos.x, pos.y);
            
            if (pointIdx >= 0) {
                // Start dragging
                draggingRef.current = pointIdx;
                canvas.setPointerCapture(e.pointerId);
                forceUpdate(n => n + 1);
            }
        };

        // Pointer move - drag point or hover
        const handlePointerMove = (e) => {
            const pos = getMousePos(e);
            
            if (draggingRef.current !== null) {
                e.stopPropagation();
                e.preventDefault();
                
                const normalized = fromCanvas(pos.x, pos.y);
                const newPoints = points.map((p, i) => {
                    if (i !== draggingRef.current) return p;
                    
                    let newX = normalized.x;
                    let newY = normalized.y;
                    
                    // Constrain endpoints X position
                    if (lockEndpoints && (i === 0 || i === points.length - 1)) {
                        newX = p.x;  // Keep original X
                    } else {
                        // Constrain X between neighbors
                        const minX = i > 0 ? points[i - 1].x + 0.02 : 0;
                        const maxXVal = i < points.length - 1 ? points[i + 1].x - 0.02 : 1;
                        newX = clamp(newX, minX, maxXVal);
                    }
                    
                    return { ...p, x: newX, y: newY };
                });
                
                onChange && onChange(newPoints);
            } else {
                // Hover detection
                const pointIdx = findPointAt(pos.x, pos.y);
                setHovered(pointIdx >= 0 ? pointIdx : null);
            }
        };

        // Pointer up - end drag
        const handlePointerUp = (e) => {
            if (draggingRef.current !== null) {
                e.stopPropagation();
                const canvas = canvasRef.current;
                if (canvas) {
                    canvas.releasePointerCapture(e.pointerId);
                }
                draggingRef.current = null;
                forceUpdate(n => n + 1);
            }
        };

        // Double click - add point
        const handleDoubleClick = (e) => {
            if (readOnly) return;
            
            e.stopPropagation();
            e.preventDefault();
            
            const pos = getMousePos(e);
            
            // Don't add if clicking on existing point
            if (findPointAt(pos.x, pos.y) >= 0) return;
            
            const normalized = fromCanvas(pos.x, pos.y);
            const newPoint = { 
                x: normalized.x, 
                y: normalized.y, 
                id: `p${Date.now()}` 
            };
            
            // Insert in sorted order by x
            const newPoints = [...points, newPoint].sort((a, b) => a.x - b.x);
            onChange && onChange(newPoints);
        };

        // Right click - delete point
        const handleContextMenu = (e) => {
            if (readOnly) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const pos = getMousePos(e);
            const pointIdx = findPointAt(pos.x, pos.y);
            
            // Don't delete endpoints or if only 2 points
            if (pointIdx > 0 && pointIdx < points.length - 1 && points.length > 2) {
                const newPoints = points.filter((_, i) => i !== pointIdx);
                onChange && onChange(newPoints);
            }
        };

        return React.createElement('canvas', {
            ref: canvasRef,
            width: width,
            height: height,
            style: {
                borderRadius: '4px',
                cursor: draggingRef.current !== null ? 'grabbing' : (hovered !== null ? 'grab' : 'crosshair'),
                display: 'block',
                touchAction: 'none'  // Prevent touch scrolling
            },
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerLeave: (e) => {
                setHovered(null);
                if (draggingRef.current !== null) {
                    handlePointerUp(e);
                }
            },
            onDoubleClick: handleDoubleClick,
            onContextMenu: handleContextMenu
        });
    }

    // =========================================================================
    // MULTI-CHANNEL SPLINE EDITOR - For RGB/HSL curves
    // =========================================================================

    /**
     * MultiChannelSplineEditor - Multiple curves with channel selection
     * 
     * Props:
     *   channels: Object with channel names as keys and point arrays as values
     *   activeChannel: Currently selected channel name
     *   onChannelChange: Callback when active channel changes
     *   onChange: Callback when any channel's points change
     *   channelColors: Object mapping channel names to colors
     *   ... (inherits SplineEditor props)
     */
    function MultiChannelSplineEditor(props) {
        const {
            channels = { master: createDefaultCurve() },
            activeChannel = 'master',
            onChannelChange,
            onChange,
            channelColors = {
                master: '#ffffff',
                red: '#ff4444',
                green: '#44ff44',
                blue: '#4444ff',
                hue: '#ff00ff',
                sat: '#ffff00',
                lum: '#888888'
            },
            width = 200,
            height = 150,
            ...editorProps
        } = props;

        const channelNames = Object.keys(channels);

        const handlePointsChange = useCallback((newPoints) => {
            const newChannels = { ...channels, [activeChannel]: newPoints };
            onChange && onChange(newChannels, activeChannel);
        }, [channels, activeChannel, onChange]);

        return React.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '4px' }
        }, [
            // Channel selector tabs
            React.createElement('div', {
                key: 'tabs',
                style: {
                    display: 'flex',
                    gap: '2px',
                    fontSize: '10px'
                }
            }, channelNames.map(name => 
                React.createElement('button', {
                    key: name,
                    onClick: (e) => {
                        e.stopPropagation();
                        onChannelChange && onChannelChange(name);
                    },
                    onPointerDown: (e) => e.stopPropagation(),
                    style: {
                        padding: '2px 6px',
                        border: 'none',
                        borderRadius: '3px',
                        background: activeChannel === name ? channelColors[name] || '#666' : '#333',
                        color: activeChannel === name ? '#000' : '#aaa',
                        cursor: 'pointer',
                        fontWeight: activeChannel === name ? 'bold' : 'normal'
                    }
                }, name)
            )),
            
            // Curve editor
            React.createElement(SplineEditor, {
                key: 'editor',
                points: channels[activeChannel] || createDefaultCurve(),
                onChange: handlePointsChange,
                curveColor: channelColors[activeChannel] || '#00ff88',
                width,
                height,
                ...editorProps
            })
        ]);
    }

    // =========================================================================
    // PRESET DROPDOWN COMPONENT
    // =========================================================================

    function PresetDropdown(props) {
        const { onSelect, currentPreset = 'custom' } = props;

        return React.createElement('select', {
            value: currentPreset,
            onChange: (e) => {
                e.stopPropagation();
                const preset = e.target.value;
                if (curvePresets[preset]) {
                    onSelect && onSelect(curvePresets[preset](), preset);
                }
            },
            onPointerDown: (e) => e.stopPropagation(),
            style: {
                padding: '2px 4px',
                fontSize: '10px',
                background: '#333',
                color: '#ddd',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer'
            }
        }, [
            React.createElement('option', { key: 'custom', value: 'custom', disabled: true }, 'Presets...'),
            ...Object.keys(curvePresets).map(name =>
                React.createElement('option', { key: name, value: name }, 
                    name.replace(/([A-Z])/g, ' $1').trim()
                )
            )
        ]);
    }

    // =========================================================================
    // EXPORT TO WINDOW
    // =========================================================================

    window.T2Spline = {
        // Core functions
        evaluate,
        createDefaultCurve,
        createFlatCurve,
        serializeCurve,
        deserializeCurve,
        curvePresets,
        
        // Math utilities
        lerp,
        clamp,
        cubicBezier,
        catmullRom,
        
        // Components
        SplineEditor,
        MultiChannelSplineEditor,
        PresetDropdown
    };

    console.log('[T2Spline] Spline base plugin loaded - window.T2Spline available');

})();
