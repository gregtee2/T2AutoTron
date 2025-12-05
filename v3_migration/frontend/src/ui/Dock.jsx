import React, { useState, useEffect, useRef } from 'react';
import './Dock.css';

export function Dock({ onSave, onLoad, onClear, onExport, onImport }) {
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('dock-position');
        return saved ? JSON.parse(saved) : { x: 20, y: 20 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [graphExpanded, setGraphExpanded] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const dockRef = useRef(null);
    const fileInputRef = useRef(null);

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Format date and time
    const formatDateTime = () => {
        const options = { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        };
        return currentTime.toLocaleDateString('en-US', options);
    };

    useEffect(() => {
        localStorage.setItem('dock-position', JSON.stringify(position));
    }, [position]);

    const handleMouseDown = (e) => {
        if (e.target.closest('.dock-header')) {
            setIsDragging(true);
            setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, dragOffset]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    onImport(json);
                } catch (err) {
                    console.error('Failed to parse JSON:', err);
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
        // Reset input value to allow selecting the same file again
        e.target.value = '';
    };

    return (
        <div
            ref={dockRef}
            className="dock-container"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'default'
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="dock-header" style={{ cursor: 'grab' }}>
                <span className="dock-title">⚙️ Control Panel</span>
                <span className="dock-datetime">{formatDateTime()}</span>
            </div>

            {/* Graph Tools Section */}
            <div className="dock-section">
                <div
                    className="dock-section-header"
                    onClick={() => setGraphExpanded(!graphExpanded)}
                >
                    <span>{graphExpanded ? '▼' : '▶'} Graph Tools</span>
                </div>
                {graphExpanded && (
                    <div className="dock-section-content">
                        <button onClick={onSave} className="dock-btn">💾 Save</button>
                        <button onClick={onLoad} className="dock-btn">↻ Load Last</button>
                        <button onClick={handleImportClick} className="dock-btn">📂 Import File</button>
                        <button onClick={onClear} className="dock-btn">🗑️ Clear</button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
