// ============================================================================
// FastContextMenu.jsx - High-performance custom context menu
// Replaces sluggish rete-context-menu-plugin with vanilla DOM for speed
// ============================================================================

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import './FastContextMenu.css';

export function FastContextMenu({ 
    visible, 
    position, 
    items, 
    onClose, 
    onSelect 
}) {
    const menuRef = useRef(null);
    const searchInputRef = useRef(null);
    const [activeSubmenu, setActiveSubmenu] = useState(null);
    const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const hoverTimeoutRef = useRef(null);
    const leaveTimeoutRef = useRef(null);

    // Reset search when menu closes/opens
    useEffect(() => {
        if (visible) {
            setSearchQuery('');
            setActiveSubmenu(null);
            // Focus search input after a brief delay for DOM to render
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        }
    }, [visible]);

    // Filter items based on search query
    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) {
            return items; // No search - return original category structure
        }
        
        const query = searchQuery.toLowerCase();
        const matchingItems = [];
        
        // Flatten and search all subitems
        for (const category of items) {
            if (category.subitems) {
                for (const subitem of category.subitems) {
                    if (subitem.label && subitem.label.toLowerCase().includes(query)) {
                        matchingItems.push({
                            ...subitem,
                            categoryHint: category.label // Show which category it's from
                        });
                    }
                }
            } else if (category.label && category.label.toLowerCase().includes(query)) {
                matchingItems.push(category);
            }
        }
        
        return matchingItems;
    }, [items, searchQuery]);

    // Check if we're in search mode (showing flat results)
    const isSearchMode = searchQuery.trim().length > 0;

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
        const menuWidth = 220;
        const menuHeight = Math.min(filteredItems.length * 36 + 50, 400); // Account for search bar
        
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
            {/* Search Input */}
            <div className="fast-menu-search">
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search nodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredItems.length === 1) {
                            // Auto-select if only one result
                            const item = filteredItems[0];
                            if (!item.subitems) {
                                handleItemClick(item);
                            }
                        }
                        e.stopPropagation();
                    }}
                />
                {searchQuery && (
                    <span 
                        className="search-clear"
                        onClick={(e) => { e.stopPropagation(); setSearchQuery(''); searchInputRef.current?.focus(); }}
                    >
                        ✕
                    </span>
                )}
            </div>

            {/* Results container */}
            <div className="fast-menu-results">
                {filteredItems.length === 0 ? (
                    <div className="fast-menu-empty">No nodes found</div>
                ) : isSearchMode ? (
                    /* Search mode - flat list of matching nodes */
                    filteredItems.map((item, index) => (
                        <div
                            key={item.label || index}
                            className="fast-menu-item search-result"
                            onClick={() => handleItemClick(item)}
                        >
                            <span className="menu-label">{item.label}</span>
                            {item.categoryHint && (
                                <span className="category-hint">{item.categoryHint}</span>
                            )}
                        </div>
                    ))
                ) : (
                    /* Normal mode - categories with submenus */
                    filteredItems.map((item, index) => (
                        <div
                            key={item.label || index}
                            className={`fast-menu-item ${item.subitems ? 'has-submenu' : ''} ${activeSubmenu === index ? 'active' : ''}`}
                            onMouseEnter={(e) => handleItemMouseEnter(e, item, index)}
                            onMouseLeave={handleItemMouseLeave}
                            onClick={() => handleItemClick(item)}
                        >
                            {item.icon && <span className="menu-icon">{item.icon}</span>}
                            <span className="menu-label">{item.label}</span>
                            {item.subitems && <span className="submenu-arrow">▶</span>}
                            
                            {/* Submenu */}
                            {activeSubmenu === index && item.subitems && (
                                <div 
                                    className="fast-submenu"
                                    onMouseEnter={handleSubmenuMouseEnter}
                                    onMouseLeave={handleSubmenuMouseLeave}
                                >
                                    {item.subitems.map((subitem, subIndex) => (
                                        <div
                                            key={subitem.label || subIndex}
                                            className="fast-menu-item"
                                            title={subitem.description || ''}
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
                    ))
                )}
            </div>
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
