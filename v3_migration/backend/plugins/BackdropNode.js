(function() {
    console.log("[BackdropNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent) {
        console.error("[BackdropNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;

    // -------------------------------------------------------------------------
    // CSS is now loaded from node-styles.css via index.css
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // COLOR PALETTE
    // -------------------------------------------------------------------------
    const COLOR_PALETTE = [
        { name: 'Blue', value: 'rgba(30, 60, 120, 0.4)', border: '#3366cc' },
        { name: 'Green', value: 'rgba(30, 100, 50, 0.4)', border: '#33cc66' },
        { name: 'Purple', value: 'rgba(80, 40, 120, 0.4)', border: '#9966cc' },
        { name: 'Red', value: 'rgba(120, 40, 40, 0.4)', border: '#cc4444' },
        { name: 'Orange', value: 'rgba(140, 80, 20, 0.4)', border: '#cc8833' },
        { name: 'Cyan', value: 'rgba(20, 100, 120, 0.4)', border: '#33aacc' },
        { name: 'Gray', value: 'rgba(60, 60, 60, 0.4)', border: '#888888' },
    ];

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
        const [dimensions, setDimensions] = useState({
            width: data.properties.width,
            height: data.properties.height
        });
        const [isEditing, setIsEditing] = useState(false);
        const [showColorPicker, setShowColorPicker] = useState(false);
        const [fontSize, setFontSize] = useState(data.properties.fontSize || 16);
        const [isLocked, setIsLocked] = useState(data.properties.locked || false);
        const inputRef = useRef(null);

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
            data.properties.colorIndex = index;
            setShowColorPicker(false);
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
            
            e.target.setPointerCapture(e.pointerId);
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = dimensions.width;
            const startHeight = dimensions.height;
            const pointerId = e.pointerId;
            const target = e.target;

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
                upEvent.preventDefault();
                upEvent.stopPropagation();
                
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
                    title: isLocked ? 'Unlock group (allow moving)' : 'Lock group (prevent moving)',
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
                        style: { cursor: 'text', padding: '2px 8px', fontSize: `${fontSize}px` }
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
                    className: 'backdrop-color-btn',
                    onClick: (e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); },
                    onPointerDown: (e) => e.stopPropagation(),
                    title: 'Change color',
                    style: { pointerEvents: 'auto' }
                }, '🎨')
            ]),

            // Color Picker
            showColorPicker && React.createElement('div', {
                key: 'colorPicker',
                className: 'backdrop-color-picker',
                onPointerDown: (e) => e.stopPropagation()
            }, COLOR_PALETTE.map((color, index) =>
                React.createElement('div', {
                    key: index,
                    className: `color-swatch ${index === colorIndex ? 'selected' : ''}`,
                    style: { backgroundColor: color.border },
                    onClick: () => handleColorSelect(index),
                    title: color.name
                })
            )),

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
                onPointerDown: handleResizeStart
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

    console.log("[BackdropNode] Registered");
})();
