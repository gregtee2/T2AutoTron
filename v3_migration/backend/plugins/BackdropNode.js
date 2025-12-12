(function() {
    // Debug: console.log("[BackdropNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent) {
        console.error("[BackdropNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const { HelpIcon } = window.T2Controls || {};

    // -------------------------------------------------------------------------
    // TOOLTIPS
    // -------------------------------------------------------------------------
    const tooltips = {
        node: "Visual grouping box for organizing nodes.\n\nDrag to position, resize from corner handle.\n\nDouble-click title to rename.",
        lock: "🔒 LOCK: Prevents moving/dragging the backdrop.\n\nWhen locked:\n• Backdrop stays in place\n• Nodes inside can still be selected/moved\n• Click through backdrop to select nodes\n\n🔓 UNLOCK: Allows moving the backdrop.",
        title: "Double-click to rename this group.",
        fontSize: "Title font size (8-72px).",
        color: "Click to choose backdrop color.\n\nPresets or custom hex color.",
        resize: "Drag to resize the backdrop."
    };

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // COLOR PALETTE - Expanded with more options
    // -------------------------------------------------------------------------
    const COLOR_PALETTE = [
        // Blues
        { name: 'Blue', value: 'rgba(30, 60, 120, 0.4)', border: '#3366cc' },
        { name: 'Navy', value: 'rgba(20, 30, 80, 0.4)', border: '#2244aa' },
        { name: 'Sky', value: 'rgba(40, 100, 160, 0.4)', border: '#4499dd' },
        // Greens
        { name: 'Green', value: 'rgba(30, 100, 50, 0.4)', border: '#33cc66' },
        { name: 'Forest', value: 'rgba(20, 70, 40, 0.4)', border: '#228844' },
        { name: 'Lime', value: 'rgba(80, 140, 40, 0.4)', border: '#88cc33' },
        // Purples
        { name: 'Purple', value: 'rgba(80, 40, 120, 0.4)', border: '#9966cc' },
        { name: 'Violet', value: 'rgba(100, 50, 150, 0.4)', border: '#aa55dd' },
        { name: 'Indigo', value: 'rgba(60, 40, 100, 0.4)', border: '#6644aa' },
        // Reds/Pinks
        { name: 'Red', value: 'rgba(120, 40, 40, 0.4)', border: '#cc4444' },
        { name: 'Crimson', value: 'rgba(140, 30, 50, 0.4)', border: '#dd3355' },
        { name: 'Pink', value: 'rgba(150, 60, 100, 0.4)', border: '#dd6699' },
        // Oranges/Yellows
        { name: 'Orange', value: 'rgba(140, 80, 20, 0.4)', border: '#cc8833' },
        { name: 'Amber', value: 'rgba(160, 120, 20, 0.4)', border: '#ddaa22' },
        { name: 'Gold', value: 'rgba(180, 150, 40, 0.4)', border: '#ccbb44' },
        // Teals/Cyans
        { name: 'Cyan', value: 'rgba(20, 100, 120, 0.4)', border: '#33aacc' },
        { name: 'Teal', value: 'rgba(30, 100, 100, 0.4)', border: '#33aaaa' },
        { name: 'Aqua', value: 'rgba(40, 140, 140, 0.4)', border: '#44cccc' },
        // Neutrals
        { name: 'Gray', value: 'rgba(60, 60, 60, 0.4)', border: '#888888' },
        { name: 'Slate', value: 'rgba(50, 55, 65, 0.4)', border: '#667788' },
        { name: 'Charcoal', value: 'rgba(35, 35, 40, 0.4)', border: '#555566' },
    ];

    // Helper to create RGBA values from hex color
    function hexToRgba(hex, alpha = 0.4) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class BackdropNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Backdrop");
            
            this.width = 400;
            this.height = 300;
            this.changeCallback = changeCallback;
            
            this.properties = {
                title: "Group",
                colorIndex: 0,
                customColor: null,  // Custom hex color (overrides colorIndex when set)
                fontSize: 16,
                width: 400,
                height: 300,
                capturedNodes: [],
                locked: false
            };
        }

        data(inputs) {
            return {};
        }

        serialize() {
            return { ...this.properties };
        }

        deserialize(data) {
            if (data.title !== undefined) this.properties.title = data.title;
            if (data.colorIndex !== undefined) this.properties.colorIndex = data.colorIndex;
            if (data.customColor !== undefined) this.properties.customColor = data.customColor;
            if (data.fontSize !== undefined) this.properties.fontSize = data.fontSize;
            if (data.width !== undefined) this.properties.width = data.width;
            if (data.height !== undefined) this.properties.height = data.height;
            if (data.capturedNodes !== undefined) this.properties.capturedNodes = data.capturedNodes;
            if (data.locked !== undefined) this.properties.locked = data.locked;
            
            this.width = this.properties.width;
            this.height = this.properties.height;
        }

        restore(state) {
            if (state.properties) {
                this.deserialize(state.properties);
            }
            
            // Update wrapper pointer-events after restore
            if (this.properties.locked && window.updateBackdropLockState) {
                // Delay to ensure node is rendered
                setTimeout(() => {
                    window.updateBackdropLockState(this.id, this.properties.locked);
                }, 100);
            }
        }

        containsPoint(x, y, backdropPosition) {
            const bx = backdropPosition.x;
            const by = backdropPosition.y;
            return x >= bx && x <= bx + this.properties.width &&
                   y >= by && y <= by + this.properties.height;
        }

        containsNode(nodePosition, nodeWidth, nodeHeight, backdropPosition) {
            const nodeCenterX = nodePosition.x + nodeWidth / 2;
            const nodeCenterY = nodePosition.y + nodeHeight / 2;
            return this.containsPoint(nodeCenterX, nodeCenterY, backdropPosition);
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function BackdropNodeComponent({ data, emit }) {
        const [title, setTitle] = useState(data.properties.title);
        const [colorIndex, setColorIndex] = useState(data.properties.colorIndex);
        const [customColor, setCustomColor] = useState(data.properties.customColor);
        const [dimensions, setDimensions] = useState({
            width: data.properties.width,
            height: data.properties.height
        });
        const [isEditing, setIsEditing] = useState(false);
        const [showColorPicker, setShowColorPicker] = useState(false);
        const [fontSize, setFontSize] = useState(data.properties.fontSize || 16);
        const [isLocked, setIsLocked] = useState(data.properties.locked || false);
        const inputRef = useRef(null);
        const colorPickerRef = useRef(null);
        const colorBtnRef = useRef(null);

        // Determine current color - custom overrides preset
        const currentColor = customColor 
            ? { name: 'Custom', value: hexToRgba(customColor, 0.4), border: customColor }
            : (COLOR_PALETTE[colorIndex] || COLOR_PALETTE[0]);

        useEffect(() => {
            if (isEditing && inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
            }
        }, [isEditing]);

        // Close color picker when clicking outside (but not on the button itself)
        useEffect(() => {
            if (!showColorPicker) return;
            
            // Small delay to prevent the opening click from closing it
            const timeoutId = setTimeout(() => {
                const handleClickOutside = (e) => {
                    // Don't close if clicking on the color button or inside the picker
                    if (colorBtnRef.current && colorBtnRef.current.contains(e.target)) return;
                    if (colorPickerRef.current && colorPickerRef.current.contains(e.target)) return;
                    setShowColorPicker(false);
                };
                document.addEventListener('pointerdown', handleClickOutside);
                // Store for cleanup
                colorPickerRef.current._cleanup = () => {
                    document.removeEventListener('pointerdown', handleClickOutside);
                };
            }, 50);
            
            return () => {
                clearTimeout(timeoutId);
                if (colorPickerRef.current?._cleanup) {
                    colorPickerRef.current._cleanup();
                }
            };
        }, [showColorPicker]);

        useEffect(() => {
            data.changeCallback = () => {
                setTitle(data.properties.title);
                setColorIndex(data.properties.colorIndex);
                setCustomColor(data.properties.customColor);
                setFontSize(data.properties.fontSize || 16);
                setIsLocked(data.properties.locked || false);
                setDimensions({
                    width: data.properties.width,
                    height: data.properties.height
                });
            };
            return () => { data.changeCallback = null; };
        }, [data]);

        const handleLockToggle = (e) => {
            e.stopPropagation();
            const newLocked = !isLocked;
            setIsLocked(newLocked);
            data.properties.locked = newLocked;
            
            // Update the Rete wrapper element's pointer-events
            if (window.updateBackdropLockState) {
                window.updateBackdropLockState(data.id, newLocked);
            }
            
            if (data.changeCallback) data.changeCallback();
        };

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
            setCustomColor(null);  // Clear custom color when selecting preset
            data.properties.colorIndex = index;
            data.properties.customColor = null;
            setShowColorPicker(false);
            if (data.changeCallback) data.changeCallback();
        };

        const handleCustomColorChange = (e) => {
            const hex = e.target.value;
            setCustomColor(hex);
            data.properties.customColor = hex;
            // Don't close picker - let user adjust
            if (data.changeCallback) data.changeCallback();
        };

        const handleFontSizeChange = (e) => {
            const value = e.target.value;
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
            if (fontSize === '' || fontSize < 8) {
                setFontSize(16);
                data.properties.fontSize = 16;
            }
            if (data.changeCallback) data.changeCallback();
        };

        const handleResizeStart = (e) => {
            e.stopPropagation();
            e.preventDefault();

            // Pointer-capture is required for reliable resizing, but if cleanup is missed
            // (lost focus, browser/Electron quirks), it can leave the editor in a stuck state.
            // So we add multiple redundant cleanup paths.
            try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = dimensions.width;
            const startHeight = dimensions.height;
            const pointerId = e.pointerId;
            const target = e.target;

            let isResizing = true;

            const cleanup = () => {
                if (!isResizing) return;
                isResizing = false;
                try { target.releasePointerCapture(pointerId); } catch (err) {}
                try { target.removeEventListener('pointermove', handlePointerMove); } catch (err) {}
                try { target.removeEventListener('pointerup', handlePointerUp); } catch (err) {}
                try { target.removeEventListener('pointercancel', handlePointerUp); } catch (err) {}
                try { target.removeEventListener('lostpointercapture', handleLostPointerCapture); } catch (err) {}
                try { window.removeEventListener('blur', handleWindowBlur); } catch (err) {}
                try { document.removeEventListener('visibilitychange', handleVisibilityChange); } catch (err) {}
                if (data.changeCallback) data.changeCallback();
            };

            const getCanvasScale = () => {
                let el = target;
                while (el && el !== document.body) {
                    const style = window.getComputedStyle(el);
                    const transform = style.transform;
                    if (transform && transform !== 'none') {
                        const matrix = new DOMMatrix(transform);
                        if (matrix.a !== 1 || matrix.d !== 1) {
                            return matrix.a;
                        }
                    }
                    el = el.parentElement;
                }
                return 1;
            };

            const scale = getCanvasScale();

            const handlePointerMove = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                moveEvent.preventDefault();
                moveEvent.stopPropagation();
                
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
                try {
                    upEvent.preventDefault();
                    upEvent.stopPropagation();
                } catch (err) {}
                cleanup();
            };

            const handleLostPointerCapture = (capEvent) => {
                if (capEvent.pointerId !== pointerId) return;
                cleanup();
            };

            const handleWindowBlur = () => cleanup();
            const handleVisibilityChange = () => {
                if (document.hidden) cleanup();
            };

            target.addEventListener('pointermove', handlePointerMove);
            target.addEventListener('pointerup', handlePointerUp);
            target.addEventListener('pointercancel', handlePointerUp);
            target.addEventListener('lostpointercapture', handleLostPointerCapture);
            window.addEventListener('blur', handleWindowBlur);
            document.addEventListener('visibilitychange', handleVisibilityChange);
        };

        return React.createElement('div', {
            className: `backdrop-node ${isLocked ? 'backdrop-locked' : ''}`,
            style: {
                width: dimensions.width,
                height: dimensions.height,
                backgroundColor: currentColor.value,
                borderColor: currentColor.border,
                pointerEvents: isLocked ? 'none' : 'auto'
            }
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                className: 'backdrop-header',
                style: { backgroundColor: currentColor.border, pointerEvents: 'auto' }
            }, [
                // Lock button (first in header)
                React.createElement('button', {
                    key: 'lockBtn',
                    className: `backdrop-lock-btn ${isLocked ? 'locked' : ''}`,
                    onClick: handleLockToggle,
                    onPointerDown: (e) => e.stopPropagation(),
                    title: isLocked 
                        ? 'LOCKED: Backdrop cannot be moved. Nodes inside can still be selected. Click to unlock.' 
                        : 'UNLOCKED: Backdrop can be moved by dragging. Click to lock in place.',
                    style: { pointerEvents: 'auto' }
                }, isLocked ? '🔒' : '🔓'),
                isEditing
                    ? React.createElement('input', {
                        key: 'input',
                        ref: inputRef,
                        type: 'text',
                        className: 'backdrop-title-input',
                        value: title,
                        onChange: handleTitleChange,
                        onBlur: handleTitleBlur,
                        onKeyDown: handleTitleKeyDown,
                        onPointerDown: (e) => e.stopPropagation(),
                        style: { fontSize: `${fontSize}px` }
                    })
                    : React.createElement('span', {
                        key: 'title',
                        className: 'backdrop-title',
                        onDoubleClick: (e) => { e.stopPropagation(); setIsEditing(true); },
                        onPointerDown: (e) => e.stopPropagation(),
                        style: { cursor: 'text', padding: '2px 8px', fontSize: `${fontSize}px` },
                        title: 'Double-click to rename this group'
                    }, title),
                
                React.createElement('input', {
                    key: 'fontSize',
                    type: 'number',
                    className: 'backdrop-font-input',
                    value: fontSize,
                    onChange: handleFontSizeChange,
                    onBlur: handleFontSizeBlur,
                    onPointerDown: (e) => e.stopPropagation(),
                    onClick: (e) => e.stopPropagation(),
                    min: 8,
                    max: 72,
                    title: 'Font size (8-72)'
                }),
                
                React.createElement('button', {
                    key: 'colorBtn',
                    ref: colorBtnRef,
                    className: 'backdrop-color-btn',
                    onClick: (e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); },
                    onPointerDown: (e) => e.stopPropagation(),
                    title: 'Change backdrop color - choose from presets or pick a custom color',
                    style: { pointerEvents: 'auto' }
                }, '🎨')
            ]),

            // Color Picker
            showColorPicker && React.createElement('div', {
                key: 'colorPicker',
                ref: colorPickerRef,
                className: 'backdrop-color-picker',
                onPointerDown: (e) => e.stopPropagation()
            }, [
                // Header with close button
                React.createElement('div', {
                    key: 'pickerHeader',
                    className: 'color-picker-header'
                }, [
                    React.createElement('span', { key: 'title' }, 'Choose Color'),
                    React.createElement('button', {
                        key: 'closeBtn',
                        className: 'color-picker-close',
                        onClick: () => setShowColorPicker(false),
                        title: 'Close'
                    }, '✕')
                ]),
                
                // Preset color swatches
                React.createElement('div', {
                    key: 'swatches',
                    className: 'color-swatches'
                }, COLOR_PALETTE.map((color, index) =>
                    React.createElement('div', {
                        key: index,
                        className: `color-swatch ${!customColor && index === colorIndex ? 'selected' : ''}`,
                        style: { backgroundColor: color.border },
                        onClick: () => handleColorSelect(index),
                        title: color.name
                    })
                )),
                
                // Custom color picker row
                React.createElement('div', {
                    key: 'customRow',
                    className: 'custom-color-row'
                }, [
                    React.createElement('span', {
                        key: 'label',
                        className: 'custom-color-label'
                    }, 'Custom:'),
                    React.createElement('input', {
                        key: 'picker',
                        type: 'color',
                        className: 'custom-color-input',
                        value: customColor || currentColor.border,
                        onChange: handleCustomColorChange,
                        onPointerDown: (e) => e.stopPropagation(),
                        title: 'Pick a custom color'
                    }),
                    // Done button for custom color
                    React.createElement('button', {
                        key: 'doneBtn',
                        className: 'color-picker-done',
                        onClick: () => setShowColorPicker(false),
                        title: 'Apply custom color'
                    }, '✓')
                ])
            ]),

            // Content
            React.createElement('div', { key: 'content', className: 'backdrop-content' },
                data.properties.capturedNodes.length > 0 && React.createElement('div', {
                    key: 'count',
                    className: 'backdrop-node-count'
                }, `${data.properties.capturedNodes.length} node(s)`)
            ),

            // Resize Handle
            React.createElement('div', {
                key: 'resize',
                className: 'backdrop-resize-handle',
                onPointerDown: handleResizeStart,
                title: 'Drag to resize backdrop'
            })
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    window.nodeRegistry.register('BackdropNode', {
        label: "Backdrop",
        category: "Utility",
        nodeClass: BackdropNode,
        component: BackdropNodeComponent,
        factory: (cb) => new BackdropNode(cb),
        isBackdrop: true
    });

    // console.log("[BackdropNode] Registered");
})();
