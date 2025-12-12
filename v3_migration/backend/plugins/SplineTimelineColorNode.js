/**
 * SplineTimelineColorNode.js
 * 
 * Time-based color output node with spline control
 * Based on ColorGradientNode input/socket patterns
 * 
 * Features:
 * - Vertical playhead showing current time position
 * - HSV output at current time
 * - Custom color gradient background (user-definable sliders)
 * - Multiple range modes: Numerical, Time, Timer
 * - Brightness controlled by curve (top=bright, bottom=dark)
 * 
 * @author T2AutoTron
 * @version 2.0.0
 */

(function() {
    'use strict';

    // Wait for dependencies
    if (!window.Rete || !window.React || !window.sockets) {
        console.warn('[SplineTimelineColorNode] Missing dependencies, retrying...');
        setTimeout(arguments.callee, 100);
        return;
    }

    if (!window.T2Spline) {
        console.warn('[SplineTimelineColorNode] Waiting for T2Spline...');
        setTimeout(arguments.callee, 100);
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useCallback, useRef } = React;
    const { evaluate, createDefaultCurve, clamp } = window.T2Spline;
    const RefComponent = window.RefComponent;
    const el = React.createElement;

    // Socket types
    const numberSocket = window.sockets.number;
    const booleanSocket = window.sockets.boolean;
    const stringSocket = new ClassicPreset.Socket("string");
    const hsvInfoSocket = new ClassicPreset.Socket("hsv_info");

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

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

    // =========================================================================
    // CUSTOM TIMELINE SPLINE EDITOR WITH PLAYHEAD
    // =========================================================================

    function TimelineSplineEditor(props) {
        const {
            points = createDefaultCurve(),
            saturationPoints = null,  // Second curve for saturation
            onChange,
            onSaturationChange = null,  // Callback for saturation curve changes
            editMode = 'brightness',  // 'brightness' or 'saturation'
            width = 280,
            height = 160,
            interpolation = 'catmull-rom',
            playheadPosition = 0,
            colorStops = null,
            showPlayhead = true,
            curveColor = '#ffffff',
            saturationCurveColor = '#ff66ff',  // Pink/magenta for saturation curve
            pointColor = '#ffffff',
            readOnly = false,
            minY = 0,
            maxY = 1,
            // Range mode props for axis labels
            rangeMode = 'numerical',
            startValue = 0,
            endValue = 100,
            startTimeHours = 6,
            startTimeMinutes = 0,
            startTimePeriod = 'AM',
            endTimeHours = 10,
            endTimeMinutes = 0,
            endTimePeriod = 'PM',
            timerDuration = 30,
            timerUnit = 'seconds',
            // Input override times (from sockets)
            inputStartTime = null,
            inputEndTime = null,
            // Preview mode
            previewMode = false,
            onPreviewPositionChange = null,
            // Callback for hovered/dragged point color
            onPointColorChange = null
        } = props;

        const canvasRef = useRef(null);
        const containerRef = useRef(null);
        const draggingRef = useRef(null);
        const playheadDraggingRef = useRef(false);
        const [hovered, setHovered] = useState(null);
        const [, forceUpdate] = useState(0);
        const [redrawCounter, setRedrawCounter] = useState(0);

        // ResizeObserver to handle canvas redraw when node is moved/resized
        useEffect(() => {
            const container = containerRef.current;
            if (!container) return;
            
            const resizeObserver = new ResizeObserver(() => {
                // Force canvas redraw when container size changes
                setRedrawCounter(c => c + 1);
            });
            
            resizeObserver.observe(container);
            
            // Track transform changes on the node element to handle dragging
            const nodeElement = container.closest('.node');
            let lastTransform = '';
            let isTracking = false;
            let animationFrameId = null;
            
            const checkTransform = () => {
                if (!isTracking || !nodeElement) return;
                
                const currentTransform = getComputedStyle(nodeElement).transform;
                if (currentTransform !== lastTransform) {
                    lastTransform = currentTransform;
                    // Force redraw after transform change
                    setRedrawCounter(c => c + 1);
                }
                animationFrameId = requestAnimationFrame(checkTransform);
            };
            
            const startTracking = () => {
                isTracking = true;
                lastTransform = nodeElement ? getComputedStyle(nodeElement).transform : '';
                checkTransform();
            };
            
            const stopTracking = () => {
                isTracking = false;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                // One final redraw after drag ends
                setRedrawCounter(c => c + 1);
            };
            
            // Listen for mouse events on the document to detect node dragging
            document.addEventListener('mousedown', startTracking);
            document.addEventListener('mouseup', stopTracking);
            document.addEventListener('pointerdown', startTracking);
            document.addEventListener('pointerup', stopTracking);
            
            return () => {
                resizeObserver.disconnect();
                document.removeEventListener('mousedown', startTracking);
                document.removeEventListener('mouseup', stopTracking);
                document.removeEventListener('pointerdown', startTracking);
                document.removeEventListener('pointerup', stopTracking);
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
            };
        }, []);

        const POINT_RADIUS = 8;
        const PADDING = 12;

        const toCanvasX = (x) => PADDING + x * (width - 2 * PADDING);
        const toCanvasY = (y) => height - PADDING - ((y - minY) / (maxY - minY)) * (height - 2 * PADDING);
        const toCanvas = (x, y) => ({ x: toCanvasX(x), y: toCanvasY(y) });
        const fromCanvasX = (cx) => clamp((cx - PADDING) / (width - 2 * PADDING), 0, 1);
        const fromCanvasY = (cy) => clamp(minY + (1 - (cy - PADDING) / (height - 2 * PADDING)) * (maxY - minY), minY, maxY);
        const fromCanvas = (cx, cy) => ({ x: fromCanvasX(cx), y: fromCanvasY(cy) });

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

        const findPointAt = (cx, cy) => {
            // Use active curve based on edit mode
            const activePoints = editMode === 'saturation' ? saturationPoints : points;
            if (!activePoints) return -1;
            for (let i = 0; i < activePoints.length; i++) {
                const cp = toCanvas(activePoints[i].x, activePoints[i].y);
                const dist = Math.sqrt((cp.x - cx) ** 2 + (cp.y - cy) ** 2);
                if (dist < POINT_RADIUS + 6) return i;
            }
            return -1;
        };

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);

            const drawAreaLeft = PADDING;
            const drawAreaRight = width - PADDING;
            const drawAreaTop = PADDING;
            const drawAreaBottom = height - PADDING;
            const drawWidth = drawAreaRight - drawAreaLeft;
            const drawHeight = drawAreaBottom - drawAreaTop;

            // Helper: Convert hue to RGB (for legacy hue-only stops)
            const hueToRgb = (hue) => {
                const h = hue / 360;
                const s = 0.8;
                const l = 0.5;
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                return {
                    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
                    g: Math.round(hue2rgb(p, q, h) * 255),
                    b: Math.round(hue2rgb(p, q, h - 1/3) * 255)
                };
            };

            // Color interpolation in RGB space - no more going through the wheel!
            const getColorAtPosition = (position) => {
                if (colorStops && colorStops.length >= 2) {
                    const sortedStops = [...colorStops].sort((a, b) => a.position - b.position);
                    
                    // Handle edges
                    if (position <= sortedStops[0].position) {
                        const rgb = sortedStops[0].rgb || hueToRgb(sortedStops[0].hue);
                        return rgb;
                    }
                    if (position >= sortedStops[sortedStops.length - 1].position) {
                        const rgb = sortedStops[sortedStops.length - 1].rgb || hueToRgb(sortedStops[sortedStops.length - 1].hue);
                        return rgb;
                    }
                    
                    // Find and interpolate between two stops in RGB space
                    for (let i = 0; i < sortedStops.length - 1; i++) {
                        if (position >= sortedStops[i].position && position <= sortedStops[i + 1].position) {
                            const t = (position - sortedStops[i].position) / (sortedStops[i + 1].position - sortedStops[i].position);
                            
                            const rgb1 = sortedStops[i].rgb || hueToRgb(sortedStops[i].hue);
                            const rgb2 = sortedStops[i + 1].rgb || hueToRgb(sortedStops[i + 1].hue);
                            
                            // Linear RGB interpolation - direct path, no color wheel!
                            return {
                                r: Math.round(rgb1.r + t * (rgb2.r - rgb1.r)),
                                g: Math.round(rgb1.g + t * (rgb2.g - rgb1.g)),
                                b: Math.round(rgb1.b + t * (rgb2.b - rgb1.b))
                            };
                        }
                    }
                    const rgb = sortedStops[sortedStops.length - 1].rgb || hueToRgb(sortedStops[sortedStops.length - 1].hue);
                    return rgb;
                }
                // Default: rainbow spectrum (hue-based)
                return hueToRgb(position * 360);
            };

            // Draw color gradient background with brightness gradient
            const steps = drawWidth;
            for (let i = 0; i < steps; i++) {
                const x = i / steps;
                const rgb = getColorAtPosition(x);
                
                const grad = ctx.createLinearGradient(0, drawAreaTop, 0, drawAreaBottom);
                // Top = full brightness, bottom = dark
                grad.addColorStop(0, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
                grad.addColorStop(0.5, `rgb(${Math.round(rgb.r * 0.5)}, ${Math.round(rgb.g * 0.5)}, ${Math.round(rgb.b * 0.5)})`);
                grad.addColorStop(1, `rgb(${Math.round(rgb.r * 0.1)}, ${Math.round(rgb.g * 0.1)}, ${Math.round(rgb.b * 0.1)})`);
                
                ctx.fillStyle = grad;
                ctx.fillRect(drawAreaLeft + i, drawAreaTop, 2, drawHeight);
            }

            // Grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const t = i / 4;
                const vx = drawAreaLeft + t * drawWidth;
                ctx.beginPath();
                ctx.moveTo(vx, drawAreaTop);
                ctx.lineTo(vx, drawAreaBottom);
                ctx.stroke();
                const hy = drawAreaTop + t * drawHeight;
                ctx.beginPath();
                ctx.moveTo(drawAreaLeft, hy);
                ctx.lineTo(drawAreaRight, hy);
                ctx.stroke();
            }

            // Draw saturation curve first (behind brightness curve)
            if (saturationPoints && saturationPoints.length >= 2) {
                ctx.strokeStyle = editMode === 'saturation' ? saturationCurveColor : 'rgba(255, 102, 255, 0.4)';
                ctx.lineWidth = editMode === 'saturation' ? 2.5 : 1.5;
                ctx.setLineDash(editMode === 'saturation' ? [] : [4, 4]);
                ctx.shadowColor = 'rgba(255,102,255,0.3)';
                ctx.shadowBlur = editMode === 'saturation' ? 3 : 0;
                ctx.beginPath();
                for (let i = 0; i <= drawWidth; i++) {
                    const x = i / drawWidth;
                    const y = evaluate(saturationPoints, x, interpolation);
                    const cx = toCanvasX(x);
                    const cy = toCanvasY(y);
                    if (i === 0) ctx.moveTo(cx, cy);
                    else ctx.lineTo(cx, cy);
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;
            }

            // Draw brightness curve
            ctx.strokeStyle = editMode === 'brightness' ? curveColor : 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = editMode === 'brightness' ? 2.5 : 1.5;
            ctx.setLineDash(editMode === 'brightness' ? [] : [4, 4]);
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = editMode === 'brightness' ? 3 : 0;
            ctx.beginPath();
            for (let i = 0; i <= drawWidth; i++) {
                const x = i / drawWidth;
                const y = evaluate(points, x, interpolation);
                const cx = toCanvasX(x);
                const cy = toCanvasY(y);
                if (i === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            // Draw playhead
            if (showPlayhead) {
                const playX = toCanvasX(clamp(playheadPosition, 0, 1));
                
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2;
                ctx.shadowColor = 'rgba(255,255,0,0.5)';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.moveTo(playX, drawAreaTop);
                ctx.lineTo(playX, drawAreaBottom);
                ctx.stroke();
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#ffff00';
                ctx.beginPath();
                ctx.moveTo(playX, drawAreaTop - 2);
                ctx.lineTo(playX - 6, drawAreaTop - 10);
                ctx.lineTo(playX + 6, drawAreaTop - 10);
                ctx.closePath();
                ctx.fill();

                const currentY = evaluate(points, playheadPosition, interpolation);
                const dotPos = toCanvas(playheadPosition, currentY);
                ctx.beginPath();
                ctx.arc(dotPos.x, dotPos.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffff00';
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Draw control points for active curve based on edit mode
            const activePoints = editMode === 'saturation' ? saturationPoints : points;
            const activeCurveColor = editMode === 'saturation' ? saturationCurveColor : curveColor;
            
            if (activePoints) {
                activePoints.forEach((point, idx) => {
                    const cp = toCanvas(point.x, point.y);
                    
                    ctx.beginPath();
                    ctx.arc(cp.x, cp.y, POINT_RADIUS + 2, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(cp.x, cp.y, POINT_RADIUS, 0, Math.PI * 2);
                    const isDragging = draggingRef.current === idx;
                    const isHovered = hovered === idx;
                    ctx.fillStyle = isDragging ? '#ff6600' : (isHovered ? '#ffff00' : (editMode === 'saturation' ? '#ff66ff' : pointColor));
                    ctx.fill();
                    ctx.strokeStyle = isDragging ? '#ff0000' : activeCurveColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
            }

            // Y-axis labels
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('254', PADDING - 2, drawAreaTop + 4);
            ctx.fillText('0', PADDING - 2, drawAreaBottom);
            
            // X-axis labels based on range mode
            ctx.textAlign = 'center';
            if (rangeMode === 'time') {
                // Parse start and end times
                let startHrs, startMins, startPd, endHrs, endMins, endPd;
                
                // Use input times if available, otherwise use slider values
                if (inputStartTime) {
                    const parsed = parseTimeInput(inputStartTime);
                    if (parsed) {
                        startHrs = parsed.hours;
                        startMins = parsed.minutes;
                        startPd = parsed.period;
                    } else {
                        startHrs = startTimeHours;
                        startMins = startTimeMinutes;
                        startPd = startTimePeriod;
                    }
                } else {
                    startHrs = startTimeHours;
                    startMins = startTimeMinutes;
                    startPd = startTimePeriod;
                }
                
                if (inputEndTime) {
                    const parsed = parseTimeInput(inputEndTime);
                    if (parsed) {
                        endHrs = parsed.hours;
                        endMins = parsed.minutes;
                        endPd = parsed.period;
                    } else {
                        endHrs = endTimeHours;
                        endMins = endTimeMinutes;
                        endPd = endTimePeriod;
                    }
                } else {
                    endHrs = endTimeHours;
                    endMins = endTimeMinutes;
                    endPd = endTimePeriod;
                }
                
                // Convert to 24-hour format for calculations
                const to24Hr = (h, m, p) => {
                    let hr = parseInt(h, 10);
                    if (p === 'PM' && hr < 12) hr += 12;
                    if (p === 'AM' && hr === 12) hr = 0;
                    return hr * 60 + parseInt(m, 10);
                };
                
                // Convert back to 12-hour format for display
                const to12Hr = (totalMins) => {
                    let hr = Math.floor(totalMins / 60) % 24;
                    const min = totalMins % 60;
                    const pd = hr >= 12 ? 'PM' : 'AM';
                    if (hr === 0) hr = 12;
                    else if (hr > 12) hr -= 12;
                    return { hr, min, pd };
                };
                
                const startTotal = to24Hr(startHrs, startMins, startPd);
                let endTotal = to24Hr(endHrs, endMins, endPd);
                
                // Handle overnight spans (end time is before start time)
                if (endTotal <= startTotal) {
                    endTotal += 24 * 60;  // Add 24 hours
                }
                
                const totalSpan = endTotal - startTotal;
                
                // Draw scale background area for time labels
                ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
                ctx.fillRect(drawAreaLeft - 5, drawAreaBottom + 2, drawWidth + 10, 14);
                
                // Draw start and end labels with better styling
                ctx.fillStyle = '#c9d1d9';
                ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textBaseline = 'middle';
                const startLabel = `${startHrs}:${String(startMins).padStart(2, '0')}${startPd}`;
                const endLabel = `${endHrs}:${String(endMins).padStart(2, '0')}${endPd}`;
                ctx.fillText(startLabel, drawAreaLeft, height - 6);
                ctx.fillText(endLabel, drawAreaRight, height - 6);
                
                // Draw intermediate time markers (every 30 min or hour depending on span)
                const interval = totalSpan > 6 * 60 ? 60 : 30;  // Use 60 min for spans > 6 hours
                
                // Find first marker after start
                let firstMarker = Math.ceil(startTotal / interval) * interval;
                if (firstMarker === startTotal) firstMarker += interval;
                
                ctx.font = '500 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.fillStyle = 'rgba(201, 209, 217, 0.7)';
                
                for (let markerMins = firstMarker; markerMins < endTotal; markerMins += interval) {
                    const t = (markerMins - startTotal) / totalSpan;
                    if (t <= 0.08 || t >= 0.92) continue;  // Skip if too close to edges
                    
                    const x = drawAreaLeft + t * drawWidth;
                    const { hr, min, pd } = to12Hr(markerMins % (24 * 60));
                    
                    // Draw tick mark
                    ctx.strokeStyle = 'rgba(160, 174, 192, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x, drawAreaBottom);
                    ctx.lineTo(x, drawAreaBottom + 5);
                    ctx.stroke();
                    
                    // Draw time label (short format)
                    const label = min === 0 ? `${hr}${pd}` : `${hr}:${String(min).padStart(2, '0')}`;
                    ctx.fillText(label, x, height - 6);
                }
            } else if (rangeMode === 'timer') {
                // Draw scale background for timer mode
                ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
                ctx.fillRect(drawAreaLeft - 5, drawAreaBottom + 2, drawWidth + 10, 14);
                
                ctx.fillStyle = '#c9d1d9';
                ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textBaseline = 'middle';
                
                const unitAbbrev = timerUnit === 'seconds' ? 's' : (timerUnit === 'minutes' ? 'm' : 'h');
                ctx.fillText('0', drawAreaLeft, height - 6);
                ctx.fillText(`${timerDuration}${unitAbbrev}`, drawAreaRight, height - 6);
            } else {
                // Numerical mode - Draw scale background
                ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
                ctx.fillRect(drawAreaLeft - 5, drawAreaBottom + 2, drawWidth + 10, 14);
                
                ctx.fillStyle = '#c9d1d9';
                ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textBaseline = 'middle';
                
                ctx.fillText(String(startValue), drawAreaLeft, height - 6);
                ctx.fillText(String(endValue), drawAreaRight, height - 6);
            }

        // Use JSON.stringify for colorStops and saturationPoints to detect deep changes
        }, [points, JSON.stringify(saturationPoints), editMode, width, height, interpolation, playheadPosition, JSON.stringify(colorStops), 
            curveColor, saturationCurveColor, pointColor, hovered, showPlayhead, minY, maxY,
            rangeMode, startValue, endValue, startTimeHours, startTimeMinutes, startTimePeriod,
            endTimeHours, endTimeMinutes, endTimePeriod, timerDuration, timerUnit,
            inputStartTime, inputEndTime, previewMode, redrawCounter]);

        const handlePointerDown = (e) => {
            if (readOnly && !previewMode) return;
            e.stopPropagation();
            e.preventDefault();
            
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            const pos = getMousePos(e);
            const pointIdx = findPointAt(pos.x, pos.y);
            
            // In preview mode, clicking anywhere drags the playhead
            if (previewMode && pointIdx < 0) {
                playheadDraggingRef.current = true;
                canvas.setPointerCapture(e.pointerId);
                // Immediately update preview position
                const normalized = fromCanvasX(pos.x);
                onPreviewPositionChange && onPreviewPositionChange(clamp(normalized, 0, 1));
                forceUpdate(n => n + 1);
                return;
            }
            
            if (pointIdx >= 0 && !readOnly) {
                draggingRef.current = pointIdx;
                canvas.setPointerCapture(e.pointerId);
                // Notify about the point being dragged - send its X position for color lookup
                const activePoints = editMode === 'saturation' ? saturationPoints : points;
                if (onPointColorChange && activePoints) {
                    onPointColorChange(activePoints[pointIdx].x);
                }
                forceUpdate(n => n + 1);
            }
        };

        const handlePointerMove = (e) => {
            const pos = getMousePos(e);
            
            // Handle playhead dragging in preview mode
            if (playheadDraggingRef.current) {
                e.stopPropagation();
                e.preventDefault();
                const normalized = fromCanvasX(pos.x);
                onPreviewPositionChange && onPreviewPositionChange(clamp(normalized, 0, 1));
                return;
            }
            
            if (draggingRef.current !== null) {
                e.stopPropagation();
                e.preventDefault();
                
                // Use active curve based on edit mode
                const activePoints = editMode === 'saturation' ? saturationPoints : points;
                const activeOnChange = editMode === 'saturation' ? onSaturationChange : onChange;
                
                if (!activePoints) return;
                
                const normalized = fromCanvas(pos.x, pos.y);
                const newPoints = activePoints.map((p, i) => {
                    if (i !== draggingRef.current) return p;
                    
                    let newX = normalized.x;
                    let newY = normalized.y;
                    
                    if (i === 0 || i === activePoints.length - 1) {
                        newX = p.x;
                    } else {
                        const minX = i > 0 ? activePoints[i - 1].x + 0.02 : 0;
                        const maxXVal = i < activePoints.length - 1 ? activePoints[i + 1].x - 0.02 : 1;
                        newX = clamp(newX, minX, maxXVal);
                    }
                    
                    return { ...p, x: newX, y: newY };
                });
                
                // Notify about point color at dragged position
                if (onPointColorChange) {
                    onPointColorChange(newPoints[draggingRef.current].x);
                }
                
                activeOnChange && activeOnChange(newPoints);
            } else {
                const pointIdx = findPointAt(pos.x, pos.y);
                setHovered(pointIdx >= 0 ? pointIdx : null);
                // When hovering over a point, show its color
                const activePoints = editMode === 'saturation' ? saturationPoints : points;
                if (pointIdx >= 0 && onPointColorChange && activePoints) {
                    onPointColorChange(activePoints[pointIdx].x);
                }
            }
        };

        const handlePointerUp = (e) => {
            if (playheadDraggingRef.current) {
                e.stopPropagation();
                const canvas = canvasRef.current;
                if (canvas) canvas.releasePointerCapture(e.pointerId);
                playheadDraggingRef.current = false;
                forceUpdate(n => n + 1);
                return;
            }
            if (draggingRef.current !== null) {
                e.stopPropagation();
                const canvas = canvasRef.current;
                if (canvas) canvas.releasePointerCapture(e.pointerId);
                draggingRef.current = null;
                // Clear point color when done dragging
                if (onPointColorChange) {
                    onPointColorChange(null);
                }
                forceUpdate(n => n + 1);
            }
        };

        const handleDoubleClick = (e) => {
            if (readOnly) return;
            e.stopPropagation();
            e.preventDefault();
            
            const pos = getMousePos(e);
            if (findPointAt(pos.x, pos.y) >= 0) return;
            
            // Add point to active curve based on edit mode
            const activePoints = editMode === 'saturation' ? saturationPoints : points;
            const activeOnChange = editMode === 'saturation' ? onSaturationChange : onChange;
            
            if (!activePoints) return;
            
            const normalized = fromCanvas(pos.x, pos.y);
            const newPoint = { x: normalized.x, y: normalized.y, id: `p${Date.now()}` };
            const newPoints = [...activePoints, newPoint].sort((a, b) => a.x - b.x);
            activeOnChange && activeOnChange(newPoints);
        };

        const handleContextMenu = (e) => {
            if (readOnly) return;
            e.preventDefault();
            e.stopPropagation();
            
            // Delete from active curve based on edit mode
            const activePoints = editMode === 'saturation' ? saturationPoints : points;
            const activeOnChange = editMode === 'saturation' ? onSaturationChange : onChange;
            
            if (!activePoints) return;
            
            const pos = getMousePos(e);
            const pointIdx = findPointAt(pos.x, pos.y);
            
            if (pointIdx > 0 && pointIdx < activePoints.length - 1 && activePoints.length > 2) {
                const newPoints = activePoints.filter((_, i) => i !== pointIdx);
                activeOnChange && activeOnChange(newPoints);
            }
        };

        return el('div', {
            ref: containerRef,
            style: { display: 'block', width: width + 'px', height: height + 'px' }
        }, 
            el('canvas', {
                ref: canvasRef,
                width: width,
                height: height,
                style: {
                    borderRadius: '4px',
                    cursor: playheadDraggingRef.current ? 'ew-resize' : 
                            (draggingRef.current !== null ? 'grabbing' : 
                            (previewMode ? 'ew-resize' : 
                            (hovered !== null ? 'grab' : 'crosshair'))),
                    display: 'block',
                    touchAction: 'none'
                },
                onPointerDown: handlePointerDown,
                onPointerMove: handlePointerMove,
                onPointerUp: handlePointerUp,
                onPointerLeave: (e) => { 
                    setHovered(null); 
                    if (onPointColorChange) onPointColorChange(null);
                    if (draggingRef.current !== null || playheadDraggingRef.current) handlePointerUp(e); 
                },
                onDoubleClick: handleDoubleClick,
                onContextMenu: handleContextMenu
            })
        );
    }

    // =========================================================================
    // COLOR STOP EDITOR WITH SLIDERS
    // =========================================================================

    function ColorStopEditor(props) {
        const { colorStops, onChange, width = 280 } = props;

        const addStop = () => {
            // Add new stop with RGB (gray by default, in the middle)
            const newStops = [...colorStops, { position: 0.5, rgb: { r: 128, g: 128, b: 128 } }]
                .sort((a, b) => a.position - b.position);
            onChange(newStops);
        };

        const updateStop = (index, field, value) => {
            const newStops = colorStops.map((stop, i) => 
                i === index ? { ...stop, [field]: parseFloat(value) } : stop
            );
            if (field === 'position') {
                newStops.sort((a, b) => a.position - b.position);
            }
            onChange(newStops);
        };

        const removeStop = (index) => {
            if (colorStops.length > 2) {
                onChange(colorStops.filter((_, i) => i !== index));
            }
        };

        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
            padding: '4px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '4px'
        };

        const sliderContainerStyle = {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            gap: '2px'
        };

        const sliderLabelStyle = {
            fontSize: '9px',
            color: '#888',
            display: 'flex',
            justifyContent: 'space-between'
        };

        const sliderStyle = {
            width: '100%',
            height: '6px',
            cursor: 'pointer'
        };

        const colorSwatchStyle = (stop) => {
            // Use RGB if available, otherwise convert from hue
            let bgColor;
            if (stop.rgb) {
                bgColor = `rgb(${stop.rgb.r}, ${stop.rgb.g}, ${stop.rgb.b})`;
            } else {
                bgColor = `hsl(${stop.hue}, 80%, 50%)`;
            }
            return {
                width: '36px',
                height: '36px',
                background: bgColor,
                borderRadius: '4px',
                border: '2px solid rgba(255,255,255,0.3)',
                flexShrink: 0,
                position: 'relative',
                cursor: 'pointer',
                overflow: 'hidden'
            };
        };

        // Convert RGB to hex for color picker
        const rgbToHex = (rgb) => {
            if (!rgb) return '#cc6600';
            return '#' + [rgb.r, rgb.g, rgb.b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
        };

        // Convert hex to RGB
        const hexToRgb = (hex) => ({
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        });

        // Convert hue to RGB (for legacy/fallback)
        const hueToRgb = (hue) => {
            const h = hue / 360;
            const s = 0.8;
            const l = 0.5;
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            return {
                r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
                g: Math.round(hue2rgb(p, q, h) * 255),
                b: Math.round(hue2rgb(p, q, h - 1/3) * 255)
            };
        };

        // Get display hex for a stop
        const getStopHex = (stop) => {
            if (stop.rgb) return rgbToHex(stop.rgb);
            return rgbToHex(hueToRgb(stop.hue));
        };

        // Update stop with new RGB color
        const updateStopColor = (index, hex) => {
            const rgb = hexToRgb(hex);
            const newStops = colorStops.map((stop, i) => 
                i === index ? { ...stop, rgb: rgb } : stop
            );
            onChange(newStops);
        };

        return el('div', {
            style: { 
                background: 'rgba(0,0,0,0.3)', 
                padding: '8px', 
                borderRadius: '6px',
                marginTop: '6px'
            },
            onPointerDown: (e) => e.stopPropagation()
        }, [
            el('div', { 
                key: 'title', 
                style: { fontSize: '10px', fontWeight: 'bold', marginBottom: '6px', color: '#aaa' } 
            }, 'Color Stops'),
            
            ...colorStops.map((stop, idx) => 
                el('div', { key: idx, style: rowStyle }, [
                    // Color swatch with embedded color picker
                    el('div', { 
                        key: 'swatchContainer', 
                        style: colorSwatchStyle(stop),
                        title: `Click to pick color`
                    }, [
                        el('input', {
                            key: 'colorPicker',
                            type: 'color',
                            value: getStopHex(stop),
                            onChange: (e) => updateStopColor(idx, e.target.value),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                opacity: 0,
                                cursor: 'pointer',
                                border: 'none',
                                padding: 0
                            }
                        })
                    ]),
                    
                    // Position slider only (color is set via color picker)
                    el('div', { key: 'sliders', style: sliderContainerStyle }, [
                        el('div', { key: 'posRow', style: sliderLabelStyle }, [
                            el('span', { key: 'label' }, 'Position'),
                            el('span', { key: 'val' }, `${(stop.position * 100).toFixed(0)}%`)
                        ]),
                        el('input', {
                            key: 'posSlider',
                            type: 'range',
                            min: 0,
                            max: 1,
                            step: 0.01,
                            value: stop.position,
                            onChange: (e) => updateStop(idx, 'position', e.target.value),
                            onPointerDown: (e) => e.stopPropagation(),
                            style: sliderStyle
                        }),
                        // Show RGB values
                        el('div', { key: 'rgbInfo', style: { fontSize: '9px', color: '#888', marginTop: '2px' } },
                            stop.rgb 
                                ? `RGB(${stop.rgb.r}, ${stop.rgb.g}, ${stop.rgb.b})`
                                : `Hue: ${Math.round(stop.hue)}°`
                        )
                    ]),
                    
                    // Remove button
                    colorStops.length > 2 && el('button', {
                        key: 'remove',
                        onClick: (e) => { e.stopPropagation(); removeStop(idx); },
                        onPointerDown: (e) => e.stopPropagation(),
                        style: { 
                            padding: '4px 8px', 
                            fontSize: '12px', 
                            background: '#533', 
                            color: '#faa',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            flexShrink: 0
                        }
                    }, '×')
                ])
            ),
            
            el('button', {
                key: 'add',
                onClick: (e) => { e.stopPropagation(); addStop(); },
                onPointerDown: (e) => e.stopPropagation(),
                style: {
                    marginTop: '6px',
                    padding: '4px 12px',
                    fontSize: '10px',
                    background: '#353',
                    color: '#afa',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    width: '100%'
                }
            }, '+ Add Color Stop')
        ]);
    }

    // =========================================================================
    // NODE CLASS
    // =========================================================================

    class SplineTimelineColorNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super('Timeline Color');
            this.changeCallback = changeCallback;
            this.width = 420;
            this.height = 500;

            this.properties = {
                points: createDefaultCurve(),  // Brightness curve
                saturationPoints: createDefaultCurve().map(p => ({ ...p, y: 1 })),  // Saturation curve (default to 1.0 = full saturation)
                interpolation: 'catmull-rom',
                editMode: 'brightness',  // 'brightness' or 'saturation' - which curve is being edited
                collapsed: false,  // Node collapsed state
                
                // Range mode (like ColorGradientNode)
                rangeMode: 'numerical',  // 'numerical', 'time', 'timer'
                
                // Numerical mode
                startValue: 0,
                endValue: 100,
                
                // Time mode
                startTimeHours: 8,
                startTimeMinutes: 0,
                startTimePeriod: 'AM',
                endTimeHours: 6,
                endTimeMinutes: 0,
                endTimePeriod: 'PM',
                
                // Timer mode
                timerDurationValue: 1,
                timerUnit: 'hours',
                
                // Color settings
                colorMode: 'rainbow',
                colorStops: [
                    { position: 0, rgb: { r: 255, g: 100, b: 0 } },   // Orange
                    { position: 1, rgb: { r: 0, g: 100, b: 255 } }    // Blue
                ],
                
                // Editor settings
                editorWidth: 360,
                editorHeight: 180,
                showColorEditor: false,
                
                // Preview mode
                previewMode: false,
                previewPosition: 0,
                
                // Runtime
                position: 0,
                isInRange: false,
                outputHue: 0,
                outputSaturation: 1,
                outputBrightness: 254,
                outputRgb: { r: 128, g: 128, b: 128 }
            };

            // Timer state
            this.timerStart = null;

            // Sockets - matching ColorGradientNode pattern
            this.addInput('value', new ClassicPreset.Input(numberSocket, 'Value'));
            this.addInput('trigger', new ClassicPreset.Input(booleanSocket, 'Trigger'));
            this.addInput('timerDuration', new ClassicPreset.Input(numberSocket, 'Timer Duration'));
            this.addInput('startTime', new ClassicPreset.Input(stringSocket, 'Start Time'));
            this.addInput('endTime', new ClassicPreset.Input(stringSocket, 'End Time'));
            
            this.addOutput('hsvInfo', new ClassicPreset.Output(hsvInfoSocket, 'HSV Info'));
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
            this.properties.isInRange = false;

            // Use preview/playhead position if previewMode is enabled
            if (this.properties.previewMode && typeof this.properties.previewPosition === 'number') {
                position = clamp(this.properties.previewPosition, 0, 1);
                this.properties.isInRange = true;
            } else {
                // Calculate position based on range mode
                if (this.properties.rangeMode === 'numerical') {
                    if (inputValue !== undefined) {
                        const startVal = this.properties.startValue;
                        const endVal = this.properties.endValue;
                        const clamped = Math.max(startVal, Math.min(endVal, inputValue));
                        position = (clamped - startVal) / (endVal - startVal);
                        this.properties.isInRange = true;
                    } else {
                        // No input - use position 0 (start of gradient)
                        // Still output valid color, just mark as not in range
                        position = 0;
                        this.properties.isInRange = false;
                    }
                } else if (this.properties.rangeMode === 'time') {
                    let startProps = { 
                        hours: this.properties.startTimeHours, 
                        minutes: this.properties.startTimeMinutes, 
                        period: this.properties.startTimePeriod 
                    };
                    let endProps = { 
                        hours: this.properties.endTimeHours, 
                        minutes: this.properties.endTimeMinutes, 
                        period: this.properties.endTimePeriod 
                    };

                    // Track input overrides
                    this.inputStartTime = null;
                    this.inputEndTime = null;

                    if (startTimeInput) {
                        const parsed = parseTimeInput(startTimeInput);
                        if (parsed) {
                            startProps = parsed;
                            this.inputStartTime = startTimeInput;
                        }
                    }
                    if (endTimeInput) {
                        const parsed = parseTimeInput(endTimeInput);
                        if (parsed) {
                            endProps = parsed;
                            this.inputEndTime = endTimeInput;
                        }
                    }

                    const startTime = parseTimeString(startProps.hours, startProps.minutes, startProps.period);
                    let endTime = parseTimeString(endProps.hours, endProps.minutes, endProps.period);
                    // If times can't be parsed, use position 0
                    if (!startTime || !endTime) {
                        position = 0;
                        this.properties.isInRange = false;
                    } else {
                        let startMs = startTime ? startTime.getTime() : 0;
                        let endMs = endTime ? endTime.getTime() : 1;
                        if (endMs <= startMs) {
                            endTime && endTime.setDate(endTime.getDate() + 1);
                            endMs = endTime ? endTime.getTime() : 1;
                        }

                        if (currentMs >= startMs && currentMs <= endMs) {
                            position = (currentMs - startMs) / (endMs - startMs);
                            this.properties.isInRange = true;
                        } else if (currentMs > endMs) {
                            position = 1;
                        } else if (this.properties.previewMode) {
                            position = clamp(this.properties.previewPosition || 0, 0, 1);
                            this.properties.isInRange = true;
                        } else {
                            position = 0;
                        }
                    }
                } else if (this.properties.rangeMode === 'timer') {
                    if (trigger && !this.timerStart) {
                        this.timerStart = now.getTime();
                    }
                    
                    // If no timer started, use position 0
                    if (!this.timerStart) {
                        position = 0;
                        this.properties.isInRange = false;
                    } else if (trigger === false) {
                        // Timer stopped - use position 0
                        this.timerStart = null;
                        position = 0;
                        this.properties.isInRange = false;
                    } else {
                        let unitMultiplier;
                        switch (this.properties.timerUnit) {
                            case 'hours': unitMultiplier = 3600000; break;
                            case 'minutes': unitMultiplier = 60000; break;
                            default: unitMultiplier = 1000; break;
                        }

                        const timerDuration = (timerDurationInput !== undefined && !isNaN(timerDurationInput) && timerDurationInput > 0)
                            ? timerDurationInput
                            : this.properties.timerDurationValue;

                        const durationMs = timerDuration * unitMultiplier;
                        const elapsed = this.timerStart ? now.getTime() - this.timerStart : 0;

                        if (elapsed >= durationMs) {
                            position = 1;
                            this.properties.isInRange = true;
                            if (trigger === true) {
                                this.timerStart = now.getTime();
                            } else {
                                this.timerStart = null;
                            }
                        } else if (this.properties.previewMode) {
                            position = clamp(this.properties.previewPosition || 0, 0, 1);
                            this.properties.isInRange = true;
                        } else {
                            position = elapsed / durationMs;
                            this.properties.isInRange = true;
                        }
                    }
                }

                position = clamp(position, 0, 1);
            }
            this.properties.position = position;

            // Calculate outputs
            const curveValue = evaluate(this.properties.points, position, this.properties.interpolation);
            const brightness = Math.round(clamp(curveValue, 0, 1) * 254);

            // Calculate saturation from saturation curve
            const saturationCurveValue = this.properties.saturationPoints 
                ? evaluate(this.properties.saturationPoints, position, this.properties.interpolation)
                : 1;
            const saturation = clamp(saturationCurveValue, 0, 1);

            // Helper to convert hue to RGB
            const hueToRgb = (hue) => {
                const h = hue / 360;
                const s = 0.8, l = 0.5;
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1; if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                return { r: Math.round(hue2rgb(p, q, h + 1/3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1/3) * 255) };
            };


            // Use shared ColorUtils for RGB to HSV conversion
            const rgbToHsv = (r, g, b) => {
                if (window.ColorUtils && typeof window.ColorUtils.rgbToHsv === 'function') {
                    return window.ColorUtils.rgbToHsv(r, g, b);
                }
                // fallback (should not happen)
                r /= 255; g /= 255; b /= 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
                const s = max === 0 ? 0 : d / max;
                let h = 0;
                if (max !== min) {
                    switch (max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }
                return { hue: h, sat: s, val: max };
            };

            // Calculate color from position - RGB interpolation for custom mode
            let rgb, hue;
            const colorStops = this.properties.colorStops || [];
            if (this.properties.colorMode === 'custom' && Array.isArray(colorStops) && colorStops.length >= 2) {
                const stops = [...colorStops].sort((a, b) => a.position - b.position);
                // Handle edges
                if (position <= stops[0].position) {
                    rgb = stops[0].rgb || hueToRgb(stops[0].hue || 0);
                } else if (position >= stops[stops.length - 1].position) {
                    rgb = stops[stops.length - 1].rgb || hueToRgb(stops[stops.length - 1].hue || 0);
                } else {
                    // Find and interpolate between stops in RGB space
                    for (let i = 0; i < stops.length - 1; i++) {
                        if (position >= stops[i].position && position <= stops[i + 1].position) {
                            const t = (position - stops[i].position) / (stops[i + 1].position - stops[i].position);
                            const rgb1 = stops[i].rgb || hueToRgb(stops[i].hue || 0);
                            const rgb2 = stops[i + 1].rgb || hueToRgb(stops[i + 1].hue || 0);
                            // Linear RGB interpolation
                            rgb = {
                                r: Math.round(rgb1.r + t * (rgb2.r - rgb1.r)),
                                g: Math.round(rgb1.g + t * (rgb2.g - rgb1.g)),
                                b: Math.round(rgb1.b + t * (rgb2.b - rgb1.b))
                            };
                            break;
                        }
                    }
                    if (!rgb) {
                        rgb = stops[stops.length - 1].rgb || hueToRgb(stops[stops.length - 1].hue || 0);
                    }
                }
            } else {
                // Rainbow mode - hue from position
                hue = position;
                rgb = hueToRgb(position * 360);
            }

            // Always compute HSV from RGB for consistent output
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

            // Apply saturation curve to the HSV saturation
            // The saturation curve modifies the base saturation from the color
            const finalSaturation = hsv.sat * saturation;

            // Scale RGB by brightness (curve value) to match All-in-One Color node behavior
            // Also apply saturation reduction by desaturating towards gray
            const brightnessScale = brightness / 255;
            
            // Desaturate RGB based on saturation curve
            const gray = (rgb.r + rgb.g + rgb.b) / 3;
            const desaturatedRgb = {
                r: Math.round((rgb.r * saturation + gray * (1 - saturation)) * brightnessScale),
                g: Math.round((rgb.g * saturation + gray * (1 - saturation)) * brightnessScale),
                b: Math.round((rgb.b * saturation + gray * (1 - saturation)) * brightnessScale)
            };

            this.properties.outputHue = hsv.hue;
            this.properties.outputSaturation = finalSaturation;
            this.properties.outputBrightness = brightness;
            this.properties.outputRgb = desaturatedRgb;

            // NOTE: Do NOT call changeCallback() here - it causes engine.reset() to be called
            // mid-fetch, which cancels remaining node fetches. The React component will
            // sync via its own changeCallback mechanism after data() returns.

            // Output structure matches All-in-One Color node
            // hue: 0-1, saturation: 0-1, brightness: 0-255
            const output = {
                hsvInfo: {
                    hue: hsv.hue,
                    saturation: finalSaturation,
                    brightness: brightness,
                    rgb: desaturatedRgb
                }
            };

            return output;
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
                colorMode: this.properties.colorMode,
                colorStops: this.properties.colorStops,
                editorWidth: this.properties.editorWidth,
                editorHeight: this.properties.editorHeight,
                saturationPoints: this.properties.saturationPoints,
                editMode: this.properties.editMode,
                collapsed: this.properties.collapsed,
                showColorEditor: this.properties.showColorEditor,
                previewMode: this.properties.previewMode,
                previewPosition: this.properties.previewPosition
            };
        }

        restore(state) {
            // Handle both nested (from copy/paste) and flat (from save/load) data structures
            const data = state.properties || state;
            
            // IMPORTANT: Always restore previewMode first to ensure data() works correctly
            if (data.previewMode !== undefined) {
                this.properties.previewMode = data.previewMode;
            }
            if (data.previewPosition !== undefined) {
                this.properties.previewPosition = data.previewPosition;
            }
            
            if (data.points) this.properties.points = data.points;
            if (data.saturationPoints) this.properties.saturationPoints = data.saturationPoints;
            if (data.interpolation) this.properties.interpolation = data.interpolation;
            if (data.editMode) this.properties.editMode = data.editMode;
            if (data.collapsed !== undefined) this.properties.collapsed = data.collapsed;
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
            if (data.colorMode) this.properties.colorMode = data.colorMode;
            if (data.colorStops) this.properties.colorStops = data.colorStops;
            if (data.editorWidth) this.properties.editorWidth = data.editorWidth;
            if (data.editorHeight) this.properties.editorHeight = data.editorHeight;
            // Restore UI and preview state
            if (data.showColorEditor !== undefined) this.properties.showColorEditor = data.showColorEditor;
            if (data.previewMode !== undefined) this.properties.previewMode = data.previewMode;
            if (data.previewPosition !== undefined) this.properties.previewPosition = data.previewPosition;
            
            // Trigger changeCallback to sync React component state
            if (this.changeCallback) {
                setTimeout(() => this.changeCallback(), 0);
            }
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

    function SplineTimelineColorNodeComponent({ data, emit }) {
        const [points, setPoints] = useState(data.properties.points);
        const [saturationPoints, setSaturationPoints] = useState(data.properties.saturationPoints);
        const [editMode, setEditMode] = useState(data.properties.editMode || 'brightness');
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
        const [colorMode, setColorMode] = useState(data.properties.colorMode);
        const [colorStops, setColorStops] = useState(data.properties.colorStops);
        const [showColorEditor, setShowColorEditor] = useState(data.properties.showColorEditor);
        const [editorWidth, setEditorWidth] = useState(data.properties.editorWidth);
        const [editorHeight, setEditorHeight] = useState(data.properties.editorHeight);
        const [position, setPosition] = useState(data.properties.position);
        const [isInRange, setIsInRange] = useState(data.properties.isInRange);
        const [outputHue, setOutputHue] = useState(data.properties.outputHue);
        const [outputSaturation, setOutputSaturation] = useState(data.properties.outputSaturation || 1);
        const [outputBrightness, setOutputBrightness] = useState(data.properties.outputBrightness);
        const [outputRgb, setOutputRgb] = useState(data.properties.outputRgb || { r: 128, g: 128, b: 128 });
        const [inputStartTime, setInputStartTime] = useState(null);
        const [inputEndTime, setInputEndTime] = useState(null);
        

        // Preview mode state
        const initialPreviewMode = data.properties.previewMode || false;
        const [previewMode, setPreviewModeState] = useState(initialPreviewMode);
        const [previewPosition, setPreviewPositionState] = useState(data.properties.previewPosition || 0);
        const [hoveredPointColor, setHoveredPointColor] = useState(null);

        // Helper to update previewMode and trigger node update
        const setPreviewMode = (val) => {
            setPreviewModeState(val);
            data.properties.previewMode = val;
            triggerUpdate();
            if (emit) emit({ type: 'process' });
        };
        // Helper to update previewPosition and trigger node update
        const setPreviewPosition = (val) => {
            setPreviewPositionState(val);
            data.properties.previewPosition = val;
            triggerUpdate();
            if (emit) emit({ type: 'process' });
        };

        // Sync all React state from node properties (critical for restore after copy/paste/load)
        const syncFromProperties = useCallback(() => {
            setPoints([...data.properties.points]);
            setSaturationPoints([...(data.properties.saturationPoints || [])]);
            setEditMode(data.properties.editMode || 'brightness');
            setCollapsed(data.properties.collapsed || false);
            setRangeMode(data.properties.rangeMode);
            setStartValue(data.properties.startValue);
            setEndValue(data.properties.endValue);
            setStartTimeHours(data.properties.startTimeHours);
            setStartTimeMinutes(data.properties.startTimeMinutes);
            setStartTimePeriod(data.properties.startTimePeriod);
            setEndTimeHours(data.properties.endTimeHours);
            setEndTimeMinutes(data.properties.endTimeMinutes);
            setEndTimePeriod(data.properties.endTimePeriod);
            setTimerDuration(data.properties.timerDurationValue);
            setTimerUnit(data.properties.timerUnit);
            setColorMode(data.properties.colorMode);
            setColorStops(data.properties.colorStops);
            setShowColorEditor(data.properties.showColorEditor || false);
            setEditorWidth(data.properties.editorWidth);
            setEditorHeight(data.properties.editorHeight);
            setPosition(data.properties.position || 0);
            setIsInRange(data.properties.isInRange || false);
            setOutputHue(data.properties.outputHue || 0);
            setOutputSaturation(data.properties.outputSaturation || 1);
            setOutputBrightness(data.properties.outputBrightness || 0);
            setOutputRgb(data.properties.outputRgb || { r: 128, g: 128, b: 128 });
            setPreviewModeState(data.properties.previewMode || false);
            setPreviewPositionState(data.properties.previewPosition || 0);
            setInputStartTime(data.inputStartTime || null);
            setInputEndTime(data.inputEndTime || null);
        }, [data]);

        // Initial sync on mount - critical for restoring state after copy/paste/load
        useEffect(() => {
            syncFromProperties();
        }, []);  // eslint-disable-line react-hooks/exhaustive-deps

        // Sync with node data via changeCallback
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                syncFromProperties();
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data, syncFromProperties]);

        // Periodic update for runtime state
        useEffect(() => {
            const interval = setInterval(() => {
                setPosition(data.properties.position || 0);
                setIsInRange(data.properties.isInRange || false);
                setOutputHue(data.properties.outputHue || 0);
                setOutputSaturation(data.properties.outputSaturation || 1);
                setOutputBrightness(data.properties.outputBrightness || 0);
                setOutputRgb(data.properties.outputRgb || { r: 128, g: 128, b: 128 });
                setInputStartTime(data.inputStartTime || null);
                setInputEndTime(data.inputEndTime || null);
            }, 500);
            return () => clearInterval(interval);
        }, [data]);

        const triggerUpdate = useCallback(() => {
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        const handleCurveChange = useCallback((newPoints) => {
            data.properties.points = newPoints;
            setPoints(newPoints);
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handleSaturationCurveChange = useCallback((newPoints) => {
            data.properties.saturationPoints = newPoints;
            setSaturationPoints(newPoints);
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handleEditModeChange = useCallback((mode) => {
            data.properties.editMode = mode;
            setEditMode(mode);
        }, [data]);

        const handleCollapseToggle = useCallback(() => {
            const newCollapsed = !collapsed;
            data.properties.collapsed = newCollapsed;
            setCollapsed(newCollapsed);
        }, [data, collapsed]);

        const handleRangeModeChange = useCallback((e) => {
            const mode = e.target.value;
            data.properties.rangeMode = mode;
            data.timerStart = null;
            setRangeMode(mode);
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handleColorModeChange = useCallback((e) => {
            const mode = e.target.value;
            data.properties.colorMode = mode;
            setColorMode(mode);
            triggerUpdate();
        }, [data, triggerUpdate]);

        const handleColorStopsChange = useCallback((newStops) => {
            data.properties.colorStops = newStops;
            setColorStops(newStops);
            triggerUpdate();
        }, [data, triggerUpdate]);

        // Resize handler
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

        // Helper to get color at a given position (for hover/drag preview)
        const getColorAtPosition = useCallback((pos) => {
            if (colorMode !== 'custom' || !colorStops || colorStops.length < 2) {
                // Rainbow mode - convert position to hue
                const hue = pos * 360;
                return { 
                    r: Math.round(255 * Math.max(0, Math.min(1, Math.abs((hue / 60) % 6 - 3) - 1))),
                    g: Math.round(255 * Math.max(0, Math.min(1, 2 - Math.abs((hue / 60) % 6 - 2)))),
                    b: Math.round(255 * Math.max(0, Math.min(1, 2 - Math.abs((hue / 60) % 6 - 4))))
                };
            }
            
            // Custom color stops - RGB interpolation
            const sorted = [...colorStops].sort((a, b) => a.position - b.position);
            if (pos <= sorted[0].position) return { r: sorted[0].r, g: sorted[0].g, b: sorted[0].b };
            if (pos >= sorted[sorted.length - 1].position) {
                const last = sorted[sorted.length - 1];
                return { r: last.r, g: last.g, b: last.b };
            }
            
            for (let i = 0; i < sorted.length - 1; i++) {
                if (pos >= sorted[i].position && pos <= sorted[i + 1].position) {
                    const t = (pos - sorted[i].position) / (sorted[i + 1].position - sorted[i].position);
                    return {
                        r: Math.round(sorted[i].r + t * (sorted[i + 1].r - sorted[i].r)),
                        g: Math.round(sorted[i].g + t * (sorted[i + 1].g - sorted[i].g)),
                        b: Math.round(sorted[i].b + t * (sorted[i + 1].b - sorted[i].b))
                    };
                }
            }
            return { r: 128, g: 128, b: 128 };
        }, [colorMode, colorStops]);

        // Handle point color change from TimelineSplineEditor
        const handlePointColorChange = useCallback((xPosition) => {
            if (xPosition === null) {
                setHoveredPointColor(null);
            } else {
                const rgb = getColorAtPosition(xPosition);
                setHoveredPointColor(rgb);
            }
        }, [getColorAtPosition]);

        // Handle preview position change
        const handlePreviewPositionChange = useCallback((pos) => {
            setPreviewPosition(pos);
            // Calculate the color at this position
            const rgb = getColorAtPosition(pos);
            setHoveredPointColor(rgb);
        }, [getColorAtPosition]);

        // Current color preview - use hovered color if available, else output RGB
        const briScale = outputBrightness / 254;
        const displayRgb = hoveredPointColor || outputRgb;
        const displayBriScale = previewMode && hoveredPointColor 
            ? evaluate(points, previewPosition, 'catmull-rom')
            : briScale;
        const currentColor = displayRgb 
            ? `rgb(${Math.round(displayRgb.r * displayBriScale)}, ${Math.round(displayRgb.g * displayBriScale)}, ${Math.round(displayRgb.b * displayBriScale)})`
            : `hsl(${outputHue}, 80%, ${30 + briScale * 40}%)`;

        // Position to display (preview or actual)
        const displayPosition = previewMode ? previewPosition : position;

        // Calculate current time string when in time mode
        const getCurrentTimeString = () => {
            if (rangeMode !== 'time') return null;
            
            // Get start/end times (use socket inputs if available)
            let startHrs, startMins, startPd, endHrs, endMins, endPd;
            
            if (inputStartTime) {
                const parsed = parseTimeInput(inputStartTime);
                if (parsed) {
                    startHrs = parsed.hours;
                    startMins = parsed.minutes;
                    startPd = parsed.period;
                } else {
                    startHrs = startTimeHours;
                    startMins = startTimeMinutes;
                    startPd = startTimePeriod;
                }
            } else {
                startHrs = startTimeHours;
                startMins = startTimeMinutes;
                startPd = startTimePeriod;
            }
            
            if (inputEndTime) {
                const parsed = parseTimeInput(inputEndTime);
                if (parsed) {
                    endHrs = parsed.hours;
                    endMins = parsed.minutes;
                    endPd = parsed.period;
                } else {
                    endHrs = endTimeHours;
                    endMins = endTimeMinutes;
                    endPd = endTimePeriod;
                }
            } else {
                endHrs = endTimeHours;
                endMins = endTimeMinutes;
                endPd = endTimePeriod;
            }
            
            // Convert to 24-hour format for calculations
            const to24Hr = (h, m, p) => {
                let hr = parseInt(h, 10);
                if (p === 'PM' && hr < 12) hr += 12;
                if (p === 'AM' && hr === 12) hr = 0;
                return hr * 60 + parseInt(m, 10);
            };
            
            // Convert back to 12-hour format for display
            const to12Hr = (totalMins) => {
                let hr = Math.floor(totalMins / 60) % 24;
                const min = totalMins % 60;
                const pd = hr >= 12 ? 'PM' : 'AM';
                if (hr === 0) hr = 12;
                else if (hr > 12) hr -= 12;
                return `${hr}:${String(min).padStart(2, '0')} ${pd}`;
            };
            
            const startTotal = to24Hr(startHrs, startMins, startPd);
            let endTotal = to24Hr(endHrs, endMins, endPd);
            
            // Handle overnight spans
            if (endTotal <= startTotal) {
                endTotal += 24 * 60;
            }
            
            const currentMins = startTotal + displayPosition * (endTotal - startTotal);
            return to12Hr(Math.round(currentMins) % (24 * 60));
        };
        
        const currentTimeString = getCurrentTimeString();

        // Stop pointer events from propagating to canvas (enables slider/dropdown interaction)
        const stopPropagation = (e) => e.stopPropagation();

        // Get inputs and outputs for socket rendering
        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        // Slider fill gradient helper (matches ColorGradientNode cgn-slider style)
        const getSliderStyle = (value, min, max) => {
            const percent = ((value - min) / (max - min)) * 100;
            return {
                background: `linear-gradient(90deg, 
                    rgba(0, 243, 255, 0.5) 0%, 
                    rgba(0, 243, 255, 0.4) ${percent}%, 
                    rgba(0, 243, 255, 0.15) ${percent}%)`
            };
        };

        // Inline styles for custom elements that don't have CSS classes
        const selectStyle = {
            padding: '4px 8px',
            fontSize: '11px',
            background: '#333',
            color: '#ddd',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer'
        };

        // Slider row styles (used by mode-specific controls)
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

        // Additional inline styles for elements not yet converted to CSS classes
        const sectionStyle = {
            marginBottom: '8px'
        };

        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            fontSize: '11px',
            marginBottom: '4px'
        };

        const labelStyle = {
            color: '#aaa',
            fontSize: '10px'
        };

        // Node width = editor width + padding (30px for 15px padding on each side)
        const nodeWidth = editorWidth + 30;

        return el('div', { 
            className: `color-gradient-node ${isInRange ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`,
            style: { width: nodeWidth + 'px' }
        }, [
            // Header - using cgn-header class with collapse toggle
            el('div', { key: 'header', className: 'cgn-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                el('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                    // Collapse toggle triangle
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
                        el('span', { key: 'icon', style: { marginRight: '6px' } }, '🎨'),
                        'Timeline Color'
                    ])
                ]),
                el('span', { 
                    key: 'status',
                    className: 'cgn-status',
                    style: isInRange ? { color: '#00ff88' } : {}
                }, isInRange ? 'Active' : 'Idle')
            ]),

            // Socket IO Container - using cgn-io-container class (always visible for connections)
            el('div', { key: 'io', className: 'cgn-io-container' }, [
                // Inputs
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
                // Outputs
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
                // Controls section - using cgn-controls class
                el('div', { key: 'controls', className: 'cgn-controls', onPointerDown: stopPropagation }, [
                    // Range Mode selector
                    el('div', { key: 'rangeSection', className: 'cgn-section' }, [
                        el('div', { key: 'modeRow', className: 'cgn-section-header' }, 'Range Mode'),
                        el('select', {
                            key: 'select',
                            value: rangeMode,
                            onChange: handleRangeModeChange,
                            onPointerDown: stopPropagation,
                            style: { ...selectStyle, width: '100%', marginBottom: '8px' }
                        }, [
                            el('option', { key: 'numerical', value: 'numerical' }, 'Numerical'),
                            el('option', { key: 'time', value: 'time' }, 'Time of Day'),
                            el('option', { key: 'timer', value: 'timer' }, 'Timer')
                        ])
                    ]),

                // Mode-specific controls
                rangeMode === 'numerical' && el('div', { key: 'numControls' }, [
                    // Start Value slider
                    el('div', { key: 'startRow', style: sliderRowStyle }, [
                        el('span', { key: 'label', style: sliderLabelStyle }, `Start: ${startValue}`),
                        el('input', {
                            key: 'slider',
                            type: 'range',
                            min: 0,
                            max: 100,
                            value: startValue,
                            onChange: (e) => {
                                const val = parseInt(e.target.value, 10);
                                setStartValue(val);
                                data.properties.startValue = val;
                                triggerUpdate();
                            },
                            onPointerDown: stopPropagation,
                            className: 'cgn-slider',
                            style: { flex: 1, ...getSliderStyle(startValue, 0, 100) }
                        })
                    ]),
                    // End Value slider
                    el('div', { key: 'endRow', style: sliderRowStyle }, [
                        el('span', { key: 'label', style: sliderLabelStyle }, `End: ${endValue}`),
                        el('input', {
                            key: 'slider',
                            type: 'range',
                            min: 0,
                            max: 100,
                            value: endValue,
                            onChange: (e) => {
                                const val = parseInt(e.target.value, 10);
                                setEndValue(val);
                                data.properties.endValue = val;
                                triggerUpdate();
                            },
                            onPointerDown: stopPropagation,
                            className: 'cgn-slider',
                            style: { flex: 1, ...getSliderStyle(endValue, 0, 100) }
                        })
                    ])
                ]),

                rangeMode === 'time' && el('div', { key: 'timeControls' }, [
                    // Start time - with input override support
                    inputStartTime 
                        ? el('div', { key: 'startOverride', style: { ...sliderRowStyle, background: 'rgba(0,150,255,0.15)', padding: '4px', borderRadius: '4px' } }, 
                            el('span', { style: { color: '#0af', fontSize: '11px' } }, `Start (INPUT): ${inputStartTime}`)
                          )
                        : [
                            // Start Hours slider
                            el('div', { key: 'startHours', style: sliderRowStyle }, [
                                el('span', { key: 'label', style: sliderLabelStyle }, `Start Hr: ${startTimeHours}`),
                                el('input', {
                                    key: 'slider',
                                    type: 'range',
                                    min: 1,
                                    max: 12,
                                    value: startTimeHours,
                                    onChange: (e) => { const v = parseInt(e.target.value); setStartTimeHours(v); data.properties.startTimeHours = v; triggerUpdate(); },
                                    onPointerDown: stopPropagation,
                                    className: 'cgn-slider',
                                    style: { flex: 1, ...getSliderStyle(startTimeHours, 1, 12) }
                                })
                            ]),
                            // Start Minutes slider
                            el('div', { key: 'startMins', style: sliderRowStyle }, [
                                el('span', { key: 'label', style: sliderLabelStyle }, `Start Min: ${String(startTimeMinutes).padStart(2, '0')}`),
                                el('input', {
                                    key: 'slider',
                                    type: 'range',
                                    min: 0,
                                    max: 59,
                                    value: startTimeMinutes,
                                    onChange: (e) => { const v = parseInt(e.target.value); setStartTimeMinutes(v); data.properties.startTimeMinutes = v; triggerUpdate(); },
                                    onPointerDown: stopPropagation,
                                    className: 'cgn-slider',
                                    style: { flex: 1, ...getSliderStyle(startTimeMinutes, 0, 59) }
                                })
                            ]),
                            // Start Period select
                            el('div', { key: 'startPeriod', style: sliderRowStyle }, [
                                el('span', { key: 'label', style: sliderLabelStyle }, 'Start Period:'),
                                el('select', {
                                    key: 'select',
                                    value: startTimePeriod,
                                    onChange: (e) => { setStartTimePeriod(e.target.value); data.properties.startTimePeriod = e.target.value; triggerUpdate(); },
                                    onPointerDown: stopPropagation,
                                    style: selectStyle
                                }, [
                                    el('option', { key: 'am', value: 'AM' }, 'AM'),
                                    el('option', { key: 'pm', value: 'PM' }, 'PM')
                                ])
                            ])
                        ],
                    // Divider
                    el('div', { key: 'divider', style: { borderTop: '1px solid rgba(255,255,255,0.1)', margin: '6px 0' } }),
                    // End time - with input override support
                    inputEndTime
                        ? el('div', { key: 'endOverride', style: { ...sliderRowStyle, background: 'rgba(0,150,255,0.15)', padding: '4px', borderRadius: '4px' } }, 
                            el('span', { style: { color: '#0af', fontSize: '11px' } }, `End (INPUT): ${inputEndTime}`)
                          )
                        : [
                            // End Hours slider
                            el('div', { key: 'endHours', style: sliderRowStyle }, [
                                el('span', { key: 'label', style: sliderLabelStyle }, `End Hr: ${endTimeHours}`),
                                el('input', {
                                    key: 'slider',
                                    type: 'range',
                                    min: 1,
                                    max: 12,
                                    value: endTimeHours,
                                    onChange: (e) => { const v = parseInt(e.target.value); setEndTimeHours(v); data.properties.endTimeHours = v; triggerUpdate(); },
                                    onPointerDown: stopPropagation,
                                    className: 'cgn-slider',
                                    style: { flex: 1, ...getSliderStyle(endTimeHours, 1, 12) }
                                })
                            ]),
                            // End Minutes slider
                            el('div', { key: 'endMins', style: sliderRowStyle }, [
                                el('span', { key: 'label', style: sliderLabelStyle }, `End Min: ${String(endTimeMinutes).padStart(2, '0')}`),
                                el('input', {
                                    key: 'slider',
                                    type: 'range',
                                    min: 0,
                                    max: 59,
                                    value: endTimeMinutes,
                                    onChange: (e) => { const v = parseInt(e.target.value); setEndTimeMinutes(v); data.properties.endTimeMinutes = v; triggerUpdate(); },
                                    onPointerDown: stopPropagation,
                                    className: 'cgn-slider',
                                    style: { flex: 1, ...getSliderStyle(endTimeMinutes, 0, 59) }
                                })
                            ]),
                            // End Period select
                            el('div', { key: 'endPeriod', style: sliderRowStyle }, [
                                el('span', { key: 'label', style: sliderLabelStyle }, 'End Period:'),
                                el('select', {
                                    key: 'select',
                                    value: endTimePeriod,
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
                    // Duration slider
                    el('div', { key: 'durationRow', style: sliderRowStyle }, [
                        el('span', { key: 'label', style: sliderLabelStyle }, `Duration: ${timerDuration}`),
                        el('input', {
                            key: 'slider',
                            type: 'range',
                            min: 1,
                            max: 120,
                            value: timerDuration,
                            onChange: (e) => {
                                const val = parseInt(e.target.value, 10);
                                setTimerDuration(val);
                                data.properties.timerDurationValue = val;
                                triggerUpdate();
                            },
                            onPointerDown: stopPropagation,
                            className: 'cgn-slider',
                            style: { flex: 1, ...getSliderStyle(timerDuration, 1, 120) }
                        })
                    ]),
                    // Unit selector
                    el('div', { key: 'unitRow', style: sliderRowStyle }, [
                        el('span', { key: 'label', style: sliderLabelStyle }, 'Unit:'),
                        el('select', {
                            key: 'select',
                            value: timerUnit,
                            onChange: (e) => {
                                setTimerUnit(e.target.value);
                                data.properties.timerUnit = e.target.value;
                                triggerUpdate();
                            },
                            onPointerDown: stopPropagation,
                            style: selectStyle
                        }, [
                            el('option', { key: 'sec', value: 'seconds' }, 'Seconds'),
                            el('option', { key: 'min', value: 'minutes' }, 'Minutes'),
                            el('option', { key: 'hr', value: 'hours' }, 'Hours')
                        ])
                    ])
                ])
            ]),

            // Color Mode
            el('div', { key: 'colorSection', style: sectionStyle, onPointerDown: stopPropagation }, [
                el('div', { key: 'colorRow', style: rowStyle }, [
                    el('span', { key: 'label', style: labelStyle }, 'Colors:'),
                    el('select', {
                        key: 'mode',
                        value: colorMode,
                        onChange: handleColorModeChange,
                        onPointerDown: stopPropagation,
                        style: selectStyle
                    }, [
                        el('option', { key: 'rainbow', value: 'rainbow' }, 'Rainbow'),
                        el('option', { key: 'custom', value: 'custom' }, 'Custom')
                    ]),
                    
                    colorMode === 'custom' && el('button', {
                        key: 'editColors',
                        onClick: (e) => {
                            e.stopPropagation();
                            data.properties.showColorEditor = !showColorEditor;
                            setShowColorEditor(!showColorEditor);
                        },
                        onPointerDown: stopPropagation,
                        style: { ...selectStyle, background: showColorEditor ? '#446' : '#333' }
                    }, showColorEditor ? 'Hide' : 'Edit')
                ]),

                colorMode === 'custom' && showColorEditor && el(ColorStopEditor, {
                    key: 'colorEditor',
                    colorStops: colorStops,
                    onChange: handleColorStopsChange,
                    width: editorWidth
                })
            ]),

            // Curve edit mode toggle
            el('div', {
                key: 'curveMode',
                style: {
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '4px',
                    marginTop: '8px',
                    marginBottom: '4px'
                }
            }, [
                el('button', {
                    key: 'brightness',
                    onClick: () => handleEditModeChange('brightness'),
                    onPointerDown: stopPropagation,
                    style: {
                        padding: '4px 12px',
                        fontSize: '10px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: editMode === 'brightness' ? '#fff' : '#444',
                        color: editMode === 'brightness' ? '#000' : '#aaa',
                        fontWeight: editMode === 'brightness' ? '600' : '400'
                    }
                }, '☀ Brightness'),
                el('button', {
                    key: 'saturation',
                    onClick: () => handleEditModeChange('saturation'),
                    onPointerDown: stopPropagation,
                    style: {
                        padding: '4px 12px',
                        fontSize: '10px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: editMode === 'saturation' ? '#ff66ff' : '#444',
                        color: editMode === 'saturation' ? '#000' : '#aaa',
                        fontWeight: editMode === 'saturation' ? '600' : '400'
                    }
                }, '◐ Saturation')
            ]),

            // Timeline spline editor
            el('div', { 
                key: 'editor',
                style: { display: 'flex', justifyContent: 'center', marginTop: '8px' }
            }, [
                el(TimelineSplineEditor, {
                    key: 'timeline',
                    points: points,
                    saturationPoints: saturationPoints,
                    onChange: handleCurveChange,
                    onSaturationChange: handleSaturationCurveChange,
                    editMode: editMode,
                    playheadPosition: previewMode ? previewPosition : position,
                    colorStops: colorMode === 'custom' ? colorStops : null,
                    width: editorWidth,
                    height: editorHeight,
                    minY: 0,
                    maxY: 1,
                    showPlayhead: true,
                    // Pass range mode props for X-axis labels
                    rangeMode: rangeMode,
                    startValue: startValue,
                    endValue: endValue,
                    startTimeHours: startTimeHours,
                    startTimeMinutes: startTimeMinutes,
                    startTimePeriod: startTimePeriod,
                    endTimeHours: endTimeHours,
                    endTimeMinutes: endTimeMinutes,
                    endTimePeriod: endTimePeriod,
                    timerDuration: timerDuration,
                    timerUnit: timerUnit,
                    // Input time overrides from sockets
                    inputStartTime: inputStartTime,
                    inputEndTime: inputEndTime,
                    // Preview mode
                    previewMode: previewMode,
                    onPreviewPositionChange: setPreviewPosition,
                    onPointColorChange: handlePointColorChange
                })
            ]),

            // Preview mode toggle
            el('div', { 
                key: 'previewToggle',
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '6px'
                },
                onPointerDown: stopPropagation
            }, [
                el('label', { 
                    key: 'label',
                    style: { 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        fontSize: '11px',
                        color: previewMode ? '#0f8' : '#888',
                        cursor: 'pointer'
                    }
                }, [
                    el('input', {
                        key: 'checkbox',
                        type: 'checkbox',
                        checked: previewMode,
                        onChange: (e) => setPreviewMode(e.target.checked),
                        style: { cursor: 'pointer' }
                    }),
                    '🔍 Preview Mode',
                    previewMode && el('span', { 
                        key: 'hint', 
                        style: { fontSize: '9px', color: '#666' } 
                    }, '(drag playhead to preview)')
                ])
            ]),

            // Current color output preview
            el('div', { 
                key: 'preview', 
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px',
                    background: previewMode || hoveredPointColor ? 'rgba(0,100,50,0.2)' : 'rgba(0,0,0,0.3)',
                    borderRadius: '6px',
                    marginTop: '8px',
                    border: previewMode || hoveredPointColor ? '1px solid rgba(0,255,100,0.3)' : '1px solid transparent'
                }
            }, [
                el('div', { 
                    key: 'swatch', 
                    style: {
                        width: '50px',
                        height: '36px',
                        borderRadius: '4px',
                        background: currentColor,
                        border: '2px solid rgba(255,255,255,0.3)'
                    }
                }),
                el('div', { key: 'values', style: { fontSize: '11px', lineHeight: '1.5' } }, [
                    currentTimeString 
                        ? el('div', { key: 'time' }, `Time: ${currentTimeString}${previewMode ? ' (preview)' : ''}`)
                        : el('div', { key: 'pos' }, `Position: ${(displayPosition * 100).toFixed(0)}%${previewMode ? ' (preview)' : ''}`),
                    el('div', { key: 'rgb' }, `RGB: ${Math.round(displayRgb.r * displayBriScale)}, ${Math.round(displayRgb.g * displayBriScale)}, ${Math.round(displayRgb.b * displayBriScale)}`),
                    el('div', { key: 'b' }, `Brightness: ${previewMode ? Math.round(displayBriScale * 254) : outputBrightness}`),
                    el('div', { key: 's' }, `Saturation: ${Math.round(outputSaturation * 100)}%`)
                ])
            ]),

            // Instructions
            el('div', { 
                key: 'help',
                style: { fontSize: '9px', color: '#666', marginTop: '6px', textAlign: 'center' }
            }, 'Curve = brightness/saturation • Double-click to add points • Right-click to delete')
            ]),  // End of collapsible content

            // Resize handle (always visible)
            el('div', {
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
        window.nodeRegistry.register('SplineTimelineColorNode', {
            label: 'Timeline Color',
            category: 'Color',
            nodeClass: SplineTimelineColorNode,
            component: SplineTimelineColorNodeComponent,
            factory: (cb) => new SplineTimelineColorNode(cb)
        });
        console.log('[SplineTimelineColorNode] Registered successfully');
    } else {
        console.error('[SplineTimelineColorNode] nodeRegistry not found');
    }

})();
