// BackdropNode.jsx - A grouping/frame node for organizing other nodes
import "../sockets.js";
import React, { useState, useEffect, useRef } from "react";
import { ClassicPreset } from "rete";
import "./BackdropNode.css";

// Predefined color palette
const COLOR_PALETTE = [
    { name: 'Blue', value: 'rgba(30, 60, 120, 0.4)', border: '#3366cc' },
    { name: 'Green', value: 'rgba(30, 100, 50, 0.4)', border: '#33cc66' },
    { name: 'Purple', value: 'rgba(80, 40, 120, 0.4)', border: '#9966cc' },
    { name: 'Red', value: 'rgba(120, 40, 40, 0.4)', border: '#cc4444' },
    { name: 'Orange', value: 'rgba(140, 80, 20, 0.4)', border: '#cc8833' },
    { name: 'Cyan', value: 'rgba(20, 100, 120, 0.4)', border: '#33aacc' },
    { name: 'Gray', value: 'rgba(60, 60, 60, 0.4)', border: '#888888' },
];

export class BackdropNode extends ClassicPreset.Node {
    constructor(changeCallback) {
        super("Backdrop");
        
        // Backdrop-specific dimensions (larger than normal nodes)
        this.width = 400;
        this.height = 300;
        
        this.changeCallback = changeCallback;
        
        // Backdrop properties
        this.properties = {
            title: "Group",
            colorIndex: 0,  // Index into COLOR_PALETTE
            fontSize: 16,   // Font size in pixels
            width: 400,
            height: 300,
            capturedNodes: []  // Array of node IDs that are "inside" this backdrop
        };
        
        // No inputs or outputs - this is purely visual/organizational
    }

    // Backdrops don't process data
    data(inputs) {
        return {};
    }

    // Serialize for saving
    serialize() {
        return {
            ...this.properties
        };
    }

    // Deserialize when loading
    deserialize(data) {
        if (data.title !== undefined) this.properties.title = data.title;
        if (data.colorIndex !== undefined) this.properties.colorIndex = data.colorIndex;
        if (data.fontSize !== undefined) this.properties.fontSize = data.fontSize;
        if (data.width !== undefined) this.properties.width = data.width;
        if (data.height !== undefined) this.properties.height = data.height;
        if (data.capturedNodes !== undefined) this.properties.capturedNodes = data.capturedNodes;
        
        this.width = this.properties.width;
        this.height = this.properties.height;
    }

    // Check if a point is inside the backdrop
    containsPoint(x, y, backdropPosition) {
        const bx = backdropPosition.x;
        const by = backdropPosition.y;
        return x >= bx && x <= bx + this.properties.width &&
               y >= by && y <= by + this.properties.height;
    }

    // Check if a node is inside the backdrop
    containsNode(nodePosition, nodeWidth, nodeHeight, backdropPosition) {
        const nodeCenterX = nodePosition.x + nodeWidth / 2;
        const nodeCenterY = nodePosition.y + nodeHeight / 2;
        return this.containsPoint(nodeCenterX, nodeCenterY, backdropPosition);
    }
}

export function BackdropNodeComponent({ data, emit }) {
    const [title, setTitle] = useState(data.properties.title);
    const [colorIndex, setColorIndex] = useState(data.properties.colorIndex);
    const [dimensions, setDimensions] = useState({
        width: data.properties.width,
        height: data.properties.height
    });
    const [isEditing, setIsEditing] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [fontSize, setFontSize] = useState(data.properties.fontSize || 16);
    const inputRef = useRef(null);
    const resizeRef = useRef(null);
    const nodeRef = useRef(null);

    const currentColor = COLOR_PALETTE[colorIndex] || COLOR_PALETTE[0];

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        data.changeCallback = () => {
            setTitle(data.properties.title);
            setColorIndex(data.properties.colorIndex);
            setFontSize(data.properties.fontSize || 16);
            setDimensions({
                width: data.properties.width,
                height: data.properties.height
            });
        };
        return () => {
            data.changeCallback = null;
        };
    }, [data]);

    const handleTitleChange = (e) => {
        setTitle(e.target.value);
        data.properties.title = e.target.value;
    };

    const handleTitleBlur = () => {
        setIsEditing(false);
        if (data.changeCallback) data.changeCallback();
    };

    const handleTitleKeyDown = (e) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            if (data.changeCallback) data.changeCallback();
        }
        if (e.key === 'Escape') {
            setTitle(data.properties.title);
            setIsEditing(false);
        }
    };

    const handleColorSelect = (index) => {
        setColorIndex(index);
        data.properties.colorIndex = index;
        setShowColorPicker(false);
        if (data.changeCallback) data.changeCallback();
    };

    const handleFontSizeChange = (e) => {
        const value = e.target.value;
        // Allow empty string while typing
        if (value === '') {
            setFontSize('');
            return;
        }
        const size = parseInt(value, 10);
        if (!isNaN(size) && size > 0 && size <= 72) {
            setFontSize(size);
            data.properties.fontSize = size;
        }
    };

    const handleFontSizeBlur = () => {
        // Ensure we have a valid value on blur
        if (fontSize === '' || fontSize < 8) {
            setFontSize(16);
            data.properties.fontSize = 16;
        }
        if (data.changeCallback) data.changeCallback();
    };

    // Handle resize drag using pointer capture for reliable release
    const handleResizeStart = (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Capture the pointer to ensure we get all events
        e.target.setPointerCapture(e.pointerId);
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = dimensions.width;
        const startHeight = dimensions.height;
        const pointerId = e.pointerId;
        const target = e.target;

        // Get the current zoom scale by traversing up to find transformed parent
        const getCanvasScale = () => {
            // Walk up the DOM tree from the resize handle to find the scaled container
            let el = target;
            while (el && el !== document.body) {
                const style = window.getComputedStyle(el);
                const transform = style.transform;
                if (transform && transform !== 'none') {
                    const matrix = new DOMMatrix(transform);
                    // Check if this has a meaningful scale (not just 1)
                    if (matrix.a !== 1 || matrix.d !== 1) {
                        console.log('[Backdrop] Found scale on:', el.className, 'scale:', matrix.a);
                        return matrix.a;
                    }
                }
                el = el.parentElement;
            }
            return 1;
        };

        // Get scale once at start - it shouldn't change during resize
        const scale = getCanvasScale();
        console.log('[Backdrop] Resize started, final scale:', scale);

        const handlePointerMove = (moveEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            
            // Account for canvas zoom scale
            const deltaX = (moveEvent.clientX - startX) / scale;
            const deltaY = (moveEvent.clientY - startY) / scale;
            
            const newWidth = Math.max(200, startWidth + deltaX);
            const newHeight = Math.max(150, startHeight + deltaY);
            
            setDimensions({ width: newWidth, height: newHeight });
            data.properties.width = newWidth;
            data.properties.height = newHeight;
            data.width = newWidth;
            data.height = newHeight;
        };

        const handlePointerUp = (upEvent) => {
            if (upEvent.pointerId !== pointerId) return;
            upEvent.preventDefault();
            upEvent.stopPropagation();
            
            // Release pointer capture
            target.releasePointerCapture(pointerId);
            
            target.removeEventListener('pointermove', handlePointerMove);
            target.removeEventListener('pointerup', handlePointerUp);
            target.removeEventListener('pointercancel', handlePointerUp);
            
            if (data.changeCallback) data.changeCallback();
        };

        target.addEventListener('pointermove', handlePointerMove);
        target.addEventListener('pointerup', handlePointerUp);
        target.addEventListener('pointercancel', handlePointerUp);
    };

    return (
        <div 
            className="backdrop-node"
            style={{
                width: dimensions.width,
                height: dimensions.height,
                backgroundColor: currentColor.value,
                borderColor: currentColor.border
            }}
        >
            {/* Header bar */}
            <div 
                className="backdrop-header"
                style={{ backgroundColor: currentColor.border }}
            >
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        className="backdrop-title-input"
                        value={title}
                        onChange={handleTitleChange}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ fontSize: `${fontSize}px` }}
                    />
                ) : (
                    <span 
                        className="backdrop-title"
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ cursor: 'text', padding: '2px 8px', fontSize: `${fontSize}px` }}
                    >
                        {title}
                    </span>
                )}
                
                {/* Font size input */}
                <input
                    type="number"
                    className="backdrop-font-input"
                    value={fontSize}
                    onChange={handleFontSizeChange}
                    onBlur={handleFontSizeBlur}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    min="8"
                    max="72"
                    title="Font size (8-72)"
                />
                
                {/* Color picker button */}
                <button 
                    className="backdrop-color-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowColorPicker(!showColorPicker);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Change color"
                >
                    🎨
                </button>
            </div>

            {/* Color picker dropdown */}
            {showColorPicker && (
                <div 
                    className="backdrop-color-picker"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {COLOR_PALETTE.map((color, index) => (
                        <div
                            key={index}
                            className={`color-swatch ${index === colorIndex ? 'selected' : ''}`}
                            style={{ backgroundColor: color.border }}
                            onClick={() => handleColorSelect(index)}
                            title={color.name}
                        />
                    ))}
                </div>
            )}

            {/* Content area - empty, just for grouping */}
            <div className="backdrop-content">
                {data.properties.capturedNodes.length > 0 && (
                    <div className="backdrop-node-count">
                        {data.properties.capturedNodes.length} node(s)
                    </div>
                )}
            </div>

            {/* Resize handle */}
            <div 
                ref={resizeRef}
                className="backdrop-resize-handle"
                onPointerDown={handleResizeStart}
            />
        </div>
    );
}
