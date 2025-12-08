import React from 'react';
import './KeyboardShortcutsModal.css';

const shortcuts = [
    { category: 'Selection & Editing', items: [
        { keys: ['Delete', 'Backspace'], action: 'Delete selected nodes' },
        { keys: ['Ctrl', 'C'], action: 'Copy selected nodes' },
        { keys: ['Ctrl', 'V'], action: 'Paste nodes at cursor' },
        { keys: ['Ctrl', 'Z'], action: 'Undo last delete' },
        { keys: ['Ctrl', 'A'], action: 'Select all nodes' },
        { keys: ['Shift', 'Click'], action: 'Add to selection' },
        { keys: ['Drag'], action: 'Lasso select multiple nodes' },
    ]},
    { category: 'Navigation', items: [
        { keys: ['Scroll'], action: 'Zoom in/out' },
        { keys: ['Middle-click', 'Drag'], action: 'Pan canvas' },
        { keys: ['Home'], action: 'Reset viewport to origin' },
        { keys: ['F5'], action: 'Reset editor view (fix frozen pan)' },
        { keys: ['Escape'], action: 'Cancel/reset drag state' },
    ]},
    { category: 'Node Operations', items: [
        { keys: ['Right-click'], action: 'Open context menu' },
        { keys: ['Right-click node'], action: 'Node context menu' },
        { keys: ['Double-click'], action: 'Edit node properties (where available)' },
    ]},
    { category: 'Graph Management', items: [
        { keys: ['?'], action: 'Show this help dialog' },
    ]},
];

export function KeyboardShortcutsModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="shortcuts-modal-overlay" onClick={handleOverlayClick}>
            <div className="shortcuts-modal">
                <div className="shortcuts-modal-header">
                    <h2>⌨️ Keyboard Shortcuts</h2>
                    <button className="shortcuts-close-btn" onClick={onClose}>×</button>
                </div>
                <div className="shortcuts-modal-body">
                    {shortcuts.map((section, sIdx) => (
                        <div key={sIdx} className="shortcuts-section">
                            <h3>{section.category}</h3>
                            <div className="shortcuts-list">
                                {section.items.map((item, iIdx) => (
                                    <div key={iIdx} className="shortcut-row">
                                        <div className="shortcut-keys">
                                            {item.keys.map((key, kIdx) => (
                                                <React.Fragment key={kIdx}>
                                                    <kbd>{key}</kbd>
                                                    {kIdx < item.keys.length - 1 && <span className="key-separator">+</span>}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        <div className="shortcut-action">{item.action}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="shortcuts-modal-footer">
                    <p>Press <kbd>?</kbd> anytime to show this dialog</p>
                </div>
            </div>
        </div>
    );
}
