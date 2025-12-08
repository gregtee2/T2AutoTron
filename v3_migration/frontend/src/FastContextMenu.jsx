// ============================================================================
// FastContextMenu.jsx - High-performance custom context menu
// Replaces sluggish rete-context-menu-plugin with vanilla DOM for speed
// ============================================================================

import React, { useEffect, useRef, useCallback, useState } from 'react';
import './FastContextMenu.css';

export function FastContextMenu({ 
    visible, 
    position, 
    items, 
    onClose, 
    onSelect 
}) {
    const menuRef = useRef(null);
    const [activeSubmenu, setActiveSubmenu] = useState(null);
    const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
    const hoverTimeoutRef = useRef(null);
    const leaveTimeoutRef = useRef(null);

    // Close menu on outside click
    useEffect(() => {
        if (!visible) return;

        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKeyDown);
        
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [visible, onClose]);

    // Clear timeouts on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
        };
    }, []);

    const handleItemMouseEnter = useCallback((e, item, index) => {
        // Clear any pending leave timeout
        if (leaveTimeoutRef.current) {
            clearTimeout(leaveTimeoutRef.current);
            leaveTimeoutRef.current = null;
        }

        if (item.subitems && item.subitems.length > 0) {
            // Show submenu immediately for responsiveness
            const rect = e.currentTarget.getBoundingClientRect();
            setSubmenuPosition({
                x: rect.right - 2,
                y: rect.top
            });
            setActiveSubmenu(index);
        } else {
            // Clear submenu when hovering non-submenu item
            setActiveSubmenu(null);
        }
    }, []);

    const handleItemMouseLeave = useCallback(() => {
        // Small delay before closing to allow mouse to move to submenu
        leaveTimeoutRef.current = setTimeout(() => {
            setActiveSubmenu(null);
        }, 150);
    }, []);

    const handleSubmenuMouseEnter = useCallback(() => {
        // Cancel the close timeout when entering submenu
        if (leaveTimeoutRef.current) {
            clearTimeout(leaveTimeoutRef.current);
            leaveTimeoutRef.current = null;
        }
    }, []);

    const handleSubmenuMouseLeave = useCallback(() => {
        // Close submenu when leaving
        leaveTimeoutRef.current = setTimeout(() => {
            setActiveSubmenu(null);
        }, 100);
    }, []);

    const handleItemClick = useCallback((item) => {
        if (item.subitems && item.subitems.length > 0) {
            // Category click - do nothing (handled by hover)
            return;
        }
        onSelect(item);
        onClose();
    }, [onSelect, onClose]);

    if (!visible) return null;

    // Adjust position to keep menu on screen
    const adjustedPosition = { ...position };
    if (typeof window !== 'undefined') {
        const menuWidth = 200;
        const menuHeight = items.length * 36;
        
        if (position.x + menuWidth > window.innerWidth) {
            adjustedPosition.x = window.innerWidth - menuWidth - 10;
        }
        if (position.y + menuHeight > window.innerHeight) {
            adjustedPosition.y = Math.max(10, window.innerHeight - menuHeight - 10);
        }
    }

    return (
        <div 
            ref={menuRef}
            className="fast-context-menu"
            style={{
                left: adjustedPosition.x,
                top: adjustedPosition.y
            }}
        >
            {items.map((item, index) => (
                <div
                    key={item.label || index}
                    className={`fast-menu-item ${item.subitems ? 'has-submenu' : ''} ${activeSubmenu === index ? 'active' : ''}`}
                    onMouseEnter={(e) => handleItemMouseEnter(e, item, index)}
                    onMouseLeave={handleItemMouseLeave}
                    onClick={() => handleItemClick(item)}
                >
                    <span className="menu-label">{item.label}</span>
                    {item.subitems && <span className="submenu-arrow">▶</span>}
                    
                    {/* Submenu */}
                    {activeSubmenu === index && item.subitems && (
                        <div 
                            className="fast-submenu"
                            style={{
                                left: '100%',
                                top: 0
                            }}
                            onMouseEnter={handleSubmenuMouseEnter}
                            onMouseLeave={handleSubmenuMouseLeave}
                        >
                            {item.subitems.map((subitem, subIndex) => (
                                <div
                                    key={subitem.label || subIndex}
                                    className="fast-menu-item"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleItemClick(subitem);
                                    }}
                                >
                                    <span className="menu-label">{subitem.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// Hook to manage context menu state
export function useContextMenu() {
    const [menuState, setMenuState] = useState({
        visible: false,
        position: { x: 0, y: 0 },
        items: [],
        context: null
    });

    const showMenu = useCallback((position, items, context = null) => {
        setMenuState({
            visible: true,
            position,
            items,
            context
        });
    }, []);

    const hideMenu = useCallback(() => {
        setMenuState(prev => ({ ...prev, visible: false }));
    }, []);

    return {
        menuState,
        showMenu,
        hideMenu
    };
}
