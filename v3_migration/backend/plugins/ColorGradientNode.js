(function() {
    console.log("[ColorGradientNode] Loading plugin...");

    if (!window.Rete || !window.React || !window.RefComponent || !window.sockets || !window.ColorUtils) {
        console.error("[ColorGradientNode] Missing dependencies");
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef, useCallback } = React;
    const RefComponent = window.RefComponent;
    const sockets = window.sockets;
    const ColorUtils = window.ColorUtils;
    const el = React.createElement;

    // -------------------------------------------------------------------------
    // CSS INJECTION
    // -------------------------------------------------------------------------
    const styleId = 'color-gradient-node-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
/* ColorGradientNode.css - Premium Modern Design */

/* ===== CSS Variables for consistent theming ===== */
.color-gradient-node {
    --cgn-bg-primary: #0f1419;
    --cgn-bg-secondary: #1a1f2e;
    --cgn-bg-tertiary: #252d3d;
    --cgn-bg-glass: rgba(30, 41, 59, 0.7);
    
    --cgn-border-subtle: rgba(99, 179, 237, 0.15);
    --cgn-border-normal: rgba(99, 179, 237, 0.25);
    --cgn-border-accent: rgba(99, 179, 237, 0.5);
    
    --cgn-text-primary: #f1f5f9;
    --cgn-text-secondary: #94a3b8;
    --cgn-text-muted: #64748b;
    
    --cgn-accent-blue: #3b82f6;
    --cgn-accent-cyan: #06b6d4;
    --cgn-accent-green: #10b981;
    --cgn-accent-orange: #f59e0b;
    --cgn-accent-purple: #8b5cf6;
    
    --cgn-glow-blue: rgba(59, 130, 246, 0.4);
    --cgn-glow-green: rgba(16, 185, 129, 0.4);
    
    --cgn-radius-sm: 6px;
    --cgn-radius-md: 10px;
    --cgn-radius-lg: 14px;
    
    --cgn-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
    --cgn-shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
    --cgn-shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.5);
    --cgn-shadow-glow: 0 0 30px rgba(59, 130, 246, 0.2);
}

/* ===== Main Container ===== */
.color-gradient-node {
    background: linear-gradient(145deg, var(--cgn-bg-primary) 0%, var(--cgn-bg-secondary) 100%);
    border: 1px solid var(--cgn-border-normal);
    border-radius: var(--cgn-radius-lg);
    padding: 16px;
    min-width: 420px;
    font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--cgn-text-primary);
    box-shadow: var(--cgn-shadow-lg), var(--cgn-shadow-glow);
    backdrop-filter: blur(10px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

/* Subtle animated gradient overlay */
.color-gradient-node::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, 
        var(--cgn-accent-blue), 
        var(--cgn-accent-cyan), 
        var(--cgn-accent-purple),
        var(--cgn-accent-blue)
    );
    background-size: 200% 100%;
    animation: cgn-shimmer 3s linear infinite;
    opacity: 0.7;
}

@keyframes cgn-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.color-gradient-node:hover {
    border-color: var(--cgn-border-accent);
    box-shadow: var(--cgn-shadow-lg), 0 0 40px rgba(59, 130, 246, 0.3);
}

.color-gradient-node.active {
    border-color: var(--cgn-accent-green);
    box-shadow: var(--cgn-shadow-lg), 0 0 40px var(--cgn-glow-green);
}

.color-gradient-node.active::before {
    background: linear-gradient(90deg, 
        var(--cgn-accent-green), 
        var(--cgn-accent-cyan), 
        var(--cgn-accent-green)
    );
}

.color-gradient-node.collapsed {
    min-width: 240px;
}

/* ===== Header ===== */
.cgn-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--cgn-border-subtle);
}

.cgn-collapse-toggle {
    cursor: pointer;
    font-size: 10px;
    user-select: none;
    color: var(--cgn-text-secondary);
    padding: 6px 8px;
    background: var(--cgn-bg-tertiary);
    border-radius: var(--cgn-radius-sm);
    transition: all 0.2s ease;
    border: 1px solid transparent;
}

.cgn-collapse-toggle:hover {
    color: var(--cgn-accent-cyan);
    background: rgba(6, 182, 212, 0.1);
    border-color: rgba(6, 182, 212, 0.3);
    transform: scale(1.05);
}

.cgn-title {
    font-size: 13px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--cgn-accent-cyan), var(--cgn-accent-blue));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    flex: 1;
}

.color-gradient-node.collapsed .cgn-title {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
}

/* ===== Socket IO Container ===== */
.cgn-io-container {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--cgn-border-subtle);
}

.cgn-inputs,
.cgn-outputs {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.cgn-socket-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    transition: all 0.2s ease;
}

.cgn-socket-row:hover .cgn-socket-label {
    color: var(--cgn-text-primary);
}

.cgn-socket-row-right {
    justify-content: flex-end;
}

.cgn-socket-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--cgn-text-secondary);
    letter-spacing: 0.3px;
    transition: color 0.2s ease;
}

/* ===== Status Section (always visible) ===== */
.cgn-status-section {
    background: var(--cgn-bg-glass);
    border: 1px solid var(--cgn-border-subtle);
    border-radius: var(--cgn-radius-md);
    padding: 12px;
    margin-bottom: 12px;
    backdrop-filter: blur(8px);
}

/* ===== Form Controls ===== */
.cgn-controls {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.cgn-section {
    margin-bottom: 12px;
}

.cgn-label {
    display: flex;
    align-items: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--cgn-text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
}

/* ===== Premium Select Dropdowns ===== */
.cgn-select {
    width: 100%;
    padding: 10px 14px;
    background: linear-gradient(145deg, var(--cgn-bg-tertiary), var(--cgn-bg-secondary));
    border: 1px solid var(--cgn-border-normal);
    border-radius: var(--cgn-radius-sm);
    color: var(--cgn-text-primary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
}

.cgn-select:hover {
    border-color: var(--cgn-accent-cyan);
    box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.cgn-select:focus {
    outline: none;
    border-color: var(--cgn-accent-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2), 0 0 20px rgba(59, 130, 246, 0.1);
}

.cgn-select option {
    background: var(--cgn-bg-secondary);
    color: var(--cgn-text-primary);
    padding: 8px;
}

/* ===== Tron-Style Sliders (matching AllInOneColorNode) ===== */
.cgn-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: rgba(0, 243, 255, 0.2);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    transition: background 0.2s;
    border: none;
}

.cgn-slider:hover {
    background: rgba(0, 243, 255, 0.3);
}

/* Webkit (Chrome, Safari, Edge) */
.cgn-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #0a0f14;
    border: 2px solid #00f3ff;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(0, 243, 255, 0.5);
    transition: all 0.2s ease;
    margin-top: -5px;
}

.cgn-slider::-webkit-slider-thumb:hover {
    background: #00f3ff;
    box-shadow: 0 0 12px rgba(0, 243, 255, 0.8);
    transform: scale(1.1);
}

.cgn-slider::-webkit-slider-thumb:active {
    background: #00f3ff;
    box-shadow: 0 0 16px rgba(0, 243, 255, 1);
    transform: scale(1.15);
}

/* Firefox */
.cgn-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #0a0f14;
    border: 2px solid #00f3ff;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(0, 243, 255, 0.5);
    transition: all 0.2s ease;
}

.cgn-slider::-moz-range-thumb:hover {
    background: #00f3ff;
    box-shadow: 0 0 12px rgba(0, 243, 255, 0.8);
}

.cgn-slider::-moz-range-track {
    width: 100%;
    height: 4px;
    background: rgba(0, 243, 255, 0.2);
    border-radius: 2px;
}

/* ===== HSV Groups ===== */
.cgn-hsv-group {
    padding: 10px 12px;
    background: linear-gradient(145deg, var(--cgn-bg-glass), transparent);
    border-radius: var(--cgn-radius-sm);
    border: 1px solid var(--cgn-border-subtle);
    margin-bottom: 6px;
    transition: all 0.2s ease;
}

.cgn-hsv-group:hover {
    border-color: var(--cgn-border-normal);
    background: var(--cgn-bg-glass);
}

/* Hue slider - rainbow gradient */
.cgn-hsv-group:first-of-type .cgn-slider,
.cgn-section:has(.cgn-label:contains("Hue")) .cgn-slider {
    background: linear-gradient(to right, 
        hsl(0, 100%, 50%), 
        hsl(60, 100%, 50%), 
        hsl(120, 100%, 50%), 
        hsl(180, 100%, 50%), 
        hsl(240, 100%, 50%), 
        hsl(300, 100%, 50%), 
        hsl(360, 100%, 50%)
    ) !important;
}

/* ===== Number Inputs ===== */
.cgn-number-input {
    width: 100%;
    padding: 10px 14px;
    background: var(--cgn-bg-tertiary);
    border: 1px solid var(--cgn-border-normal);
    border-radius: var(--cgn-radius-sm);
    color: var(--cgn-text-primary);
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    transition: all 0.2s ease;
}

.cgn-number-input:focus {
    outline: none;
    border-color: var(--cgn-accent-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

/* ===== Time Inputs ===== */
.cgn-time-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cgn-time-inputs {
    display: flex;
    align-items: center;
    gap: 6px;
}

.cgn-time-inputs span {
    color: var(--cgn-text-muted);
    font-weight: 700;
    font-size: 14px;
}

.cgn-time-input {
    width: 54px;
    padding: 8px 10px;
    background: var(--cgn-bg-tertiary);
    border: 1px solid var(--cgn-border-normal);
    border-radius: var(--cgn-radius-sm);
    color: var(--cgn-text-primary);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    font-family: 'SF Mono', 'Fira Code', monospace;
    transition: all 0.2s ease;
}

.cgn-time-input:focus {
    outline: none;
    border-color: var(--cgn-accent-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.cgn-period-select {
    padding: 8px 12px;
    background: var(--cgn-bg-tertiary);
    border: 1px solid var(--cgn-border-normal);
    border-radius: var(--cgn-radius-sm);
    color: var(--cgn-text-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.cgn-period-select:hover {
    border-color: var(--cgn-accent-cyan);
}

/* ===== Toggle / Checkbox ===== */
.cgn-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--cgn-bg-glass);
    border-radius: var(--cgn-radius-sm);
    border: 1px solid var(--cgn-border-subtle);
}

.cgn-toggle-row .cgn-label {
    margin-bottom: 0;
}

/* Custom Toggle Switch */
.cgn-checkbox {
    appearance: none;
    width: 44px;
    height: 24px;
    background: var(--cgn-bg-primary);
    border: 2px solid var(--cgn-border-normal);
    border-radius: 12px;
    cursor: pointer;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.cgn-checkbox::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--cgn-text-secondary);
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.cgn-checkbox:checked {
    background: linear-gradient(135deg, var(--cgn-accent-green), var(--cgn-accent-cyan));
    border-color: var(--cgn-accent-green);
}

.cgn-checkbox:checked::before {
    left: 22px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

.cgn-checkbox:hover {
    border-color: var(--cgn-accent-cyan);
}

/* ===== Gradient Container ===== */
.cgn-gradient-container {
    margin: 8px 0;
    padding: 4px;
    background: var(--cgn-bg-primary);
    border-radius: var(--cgn-radius-md);
    border: 1px solid var(--cgn-border-normal);
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3);
}

.cgn-gradient-canvas {
    width: 100%;
    height: 28px;
    border-radius: var(--cgn-radius-sm);
    display: block;
}

/* ===== Color Swatch ===== */
.cgn-swatch-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    background: var(--cgn-bg-glass);
    border-radius: var(--cgn-radius-sm);
    border: 1px solid var(--cgn-border-subtle);
    margin: 8px 0;
}

.cgn-current-color {
    width: 44px;
    height: 44px;
    border-radius: var(--cgn-radius-sm);
    border: 2px solid rgba(255, 255, 255, 0.2);
    box-shadow: 
        inset 0 2px 4px rgba(0, 0, 0, 0.2),
        0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
}

.cgn-swatch-row:hover .cgn-current-color {
    transform: scale(1.05);
    box-shadow: 
        inset 0 2px 4px rgba(0, 0, 0, 0.2),
        0 6px 20px rgba(0, 0, 0, 0.4);
}

.cgn-status {
    font-size: 12px;
    font-weight: 600;
    color: var(--cgn-text-secondary);
    letter-spacing: 0.3px;
}

.color-gradient-node.active .cgn-status {
    color: var(--cgn-accent-green);
    text-shadow: 0 0 10px var(--cgn-glow-green);
}

/* ===== Tooltips ===== */
.cgn-tooltip {
    position: relative;
    cursor: help;
}

.cgn-tooltip::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%) translateY(5px);
    background: linear-gradient(145deg, var(--cgn-bg-secondary), var(--cgn-bg-primary));
    color: var(--cgn-text-primary);
    padding: 12px 16px;
    border-radius: var(--cgn-radius-md);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.5;
    white-space: normal;
    width: max-content;
    max-width: 260px;
    box-shadow: var(--cgn-shadow-md), 0 0 20px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--cgn-border-normal);
    opacity: 0;
    visibility: hidden;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1000;
    pointer-events: none;
}

.cgn-tooltip::before {
    content: '';
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    border: 8px solid transparent;
    border-top-color: var(--cgn-border-normal);
    opacity: 0;
    visibility: hidden;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1001;
}

.cgn-tooltip:hover::after {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
}

.cgn-tooltip:hover::before {
    opacity: 1;
    visibility: visible;
}

/* ===== Info Icon ===== */
.cgn-info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 8px;
    background: linear-gradient(135deg, var(--cgn-accent-blue), var(--cgn-accent-purple));
    border-radius: 50%;
    font-size: 10px;
    font-weight: 700;
    color: #ffffff;
    cursor: help;
    vertical-align: middle;
    flex-shrink: 0;
    transition: all 0.2s ease;
    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}

.cgn-tooltip:hover .cgn-info-icon {
    background: linear-gradient(135deg, var(--cgn-accent-cyan), var(--cgn-accent-blue));
    transform: scale(1.1);
    box-shadow: 0 2px 10px rgba(6, 182, 212, 0.5);
}

/* ===== Section Groups (Ghosted States) ===== */
.cgn-section-group {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 12px;
    background: var(--cgn-bg-glass);
    border-radius: var(--cgn-radius-md);
    border: 1px solid var(--cgn-border-subtle);
    margin-bottom: 12px;
}

.cgn-section-group.ghosted {
    opacity: 0.3;
    filter: grayscale(0.7) blur(0.5px);
    pointer-events: none;
    transform: scale(0.98);
}

.cgn-section-group.ghosted .cgn-label {
    color: var(--cgn-text-muted);
}

.cgn-section-group.ghosted .cgn-slider {
    cursor: not-allowed;
}

.cgn-section-group.ghosted .cgn-select {
    cursor: not-allowed;
}

/* ===== Section Headers ===== */
.cgn-section-header {
    font-size: 10px;
    font-weight: 700;
    color: var(--cgn-accent-cyan);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--cgn-border-subtle);
    display: flex;
    align-items: center;
}

.cgn-section-group.ghosted .cgn-section-header {
    color: var(--cgn-text-muted);
    border-bottom-color: transparent;
}

/* ===== Input Override Styling ===== */
.cgn-section-group.cgn-input-override {
    opacity: 0.5;
    pointer-events: none;
    border-color: var(--cgn-accent-green);
}

.cgn-section-group.cgn-input-override .cgn-section-header {
    color: var(--cgn-accent-green);
}

.cgn-override-notice {
    font-size: 9px;
    font-weight: 500;
    color: var(--cgn-accent-green);
    margin-left: 10px;
    text-transform: none;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    background: rgba(16, 185, 129, 0.15);
    border-radius: 4px;
}

/* ===== Time Display Panel ===== */
.cgn-time-display {
    padding: 12px 14px;
    background: linear-gradient(145deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2));
    border-radius: var(--cgn-radius-sm);
    border: 1px solid var(--cgn-border-subtle);
    margin-top: 8px;
}

.cgn-time-display-row {
    font-size: 12px;
    font-weight: 500;
    color: var(--cgn-text-primary);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    font-family: 'SF Mono', 'Fira Code', monospace;
}

.cgn-time-display-row:last-child {
    margin-bottom: 0;
}

/* ===== Time Source Badges ===== */
.cgn-input-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--cgn-accent-green), var(--cgn-accent-cyan));
    color: #000;
    font-size: 8px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    margin-right: 10px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.cgn-local-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--cgn-bg-tertiary);
    color: var(--cgn-text-secondary);
    font-size: 8px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    margin-right: 10px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    border: 1px solid var(--cgn-border-subtle);
}

.cgn-time-from-input {
    color: var(--cgn-accent-green);
}

/* ===== Scrollbar Styling ===== */
.color-gradient-node::-webkit-scrollbar {
    width: 8px;
}

.color-gradient-node::-webkit-scrollbar-track {
    background: var(--cgn-bg-primary);
    border-radius: 4px;
}

.color-gradient-node::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, var(--cgn-accent-blue), var(--cgn-accent-purple));
    border-radius: 4px;
    border: 2px solid var(--cgn-bg-primary);
}

.color-gradient-node::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, var(--cgn-accent-cyan), var(--cgn-accent-blue));
}

/* ===== Focus Visible States for Accessibility ===== */
.cgn-select:focus-visible,
.cgn-slider:focus-visible,
.cgn-checkbox:focus-visible,
.cgn-number-input:focus-visible,
.cgn-time-input:focus-visible {
    outline: 2px solid var(--cgn-accent-cyan);
    outline-offset: 2px;
}

/* ===== Animations ===== */
@keyframes cgn-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

.color-gradient-node.active .cgn-current-color {
    animation: cgn-pulse 2s ease-in-out infinite;
}

/* ===== Spin Button Styling ===== */
.color-gradient-node input[type="number"]::-webkit-inner-spin-button,
.color-gradient-node input[type="number"]::-webkit-outer-spin-button {
    opacity: 1;
    background: var(--cgn-bg-tertiary);
    border-radius: 4px;
}

`;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // HELPER FUNCTIONS
    // -------------------------------------------------------------------------
    
    const numberSocket = sockets.number;
    const booleanSocket = sockets.boolean;
    const stringSocket = new ClassicPreset.Socket("string");
    const hsvInfoSocket = new ClassicPreset.Socket("hsv_info");

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

    const WEDGE_PRESETS = {
        'warm': { startHue: 0, startSat: 100, startBri: 100, endHue: 60, endSat: 80, endBri: 90 },
        'cool': { startHue: 180, startSat: 90, startBri: 90, endHue: 240, endSat: 80, endBri: 90 },
        'warm-to-cool': { startHue: 0, startSat: 100, startBri: 100, endHue: 240, endSat: 80, endBri: 90 }
    };

    const EASING_FUNCTIONS = {
        'linear': (t) => t,
        'ease-in': (t) => t * t,
        'ease-out': (t) => t * (2 - t),
        'ease-in-out': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        'ease-in-cubic': (t) => t * t * t,
        'ease-out-cubic': (t) => (--t) * t * t + 1,
        'ease-in-out-cubic': (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
        'ease-in-quart': (t) => t * t * t * t,
        'ease-out-quart': (t) => 1 - (--t) * t * t * t,
        'ease-in-out-quart': (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
        'ease-in-expo': (t) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
        'ease-out-expo': (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
        'ease-in-out-expo': (t) => {
            if (t === 0) return 0;
            if (t === 1) return 1;
            if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
            return (2 - Math.pow(2, -20 * t + 10)) / 2;
        },
        'ease-in-back': (t) => { const c = 1.70158; return t * t * ((c + 1) * t - c); },
        'ease-out-back': (t) => { const c = 1.70158; return 1 + (--t) * t * ((c + 1) * t + c); },
    };

    function applyEasing(position, easingType) {
        const easingFn = EASING_FUNCTIONS[easingType] || EASING_FUNCTIONS['linear'];
        return easingFn(Math.max(0, Math.min(1, position)));
    }

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class ColorGradientNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Stepped Color Gradient");
            this.changeCallback = changeCallback;
            this.width = 460;
            this.height = 680;

            // Inputs
            this.addInput("value", new ClassicPreset.Input(numberSocket, "Value"));
            this.addInput("trigger", new ClassicPreset.Input(booleanSocket, "Trigger"));
            this.addInput("timerDuration", new ClassicPreset.Input(numberSocket, "Timer Duration"));
            this.addInput("startTime", new ClassicPreset.Input(stringSocket, "Start Time"));
            this.addInput("endTime", new ClassicPreset.Input(stringSocket, "End Time"));

            // Output
            this.addOutput("hsvInfo", new ClassicPreset.Output(hsvInfoSocket, "HSV Info"));

            // Node state/properties
            this.colorMode = 'custom';
            this.predefinedWedge = 'warm-to-cool';
            this.startHue = 0;
            this.startSaturation = 100;
            this.startBrightness = 100;
            this.endHue = 240;
            this.endSaturation = 80;
            this.endBrightness = 90;
            this.rangeMode = 'numerical';
            this.startValue = 20;
            this.endValue = 30;
            this.startTimeHours = 10;
            this.startTimeMinutes = 0;
            this.startTimePeriod = 'AM';
            this.endTimeHours = 2;
            this.endTimeMinutes = 0;
            this.endTimePeriod = 'PM';
            this.timerDurationValue = 1;
            this.timerUnit = 'hours';
            this.timeSteps = 60;
            this.useBrightnessOverride = false;
            this.brightnessOverride = 254;
            this.easingType = 'linear';
            this.gradientYPosition = 740;
            this.debug = false;
            this.enableReconnect = false;
            this.reconnectInterval = 600000;

            // Runtime state
            this.timerStart = null;
            this.currentStep = 0;
            this.lastTimeStep = null;
            this.position = 0;
            this.isInRange = false;
            this.lastColor = null;
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
            this.isInRange = false;

            if (this.rangeMode === 'numerical') {
                if (inputValue === undefined) {
                    const fallbackValue = (this.startValue + this.endValue) / 2;
                    position = (fallbackValue - this.startValue) / (this.endValue - this.startValue);
                } else {
                    const clamped = Math.max(this.startValue, Math.min(this.endValue, inputValue));
                    position = (clamped - this.startValue) / (this.endValue - this.startValue);
                }
                this.isInRange = true;
            } else if (this.rangeMode === 'time') {
                let startProps = { hours: this.startTimeHours, minutes: this.startTimeMinutes, period: this.startTimePeriod };
                let endProps = { hours: this.endTimeHours, minutes: this.endTimeMinutes, period: this.endTimePeriod };

                // Track input overrides for UI display
                this.inputStartTime = null;
                this.inputEndTime = null;

                if (startTimeInput) {
                    const parsed = parseTimeInput(startTimeInput);
                    if (parsed) {
                        startProps = parsed;
                        this.inputStartTime = startTimeInput; // Store for UI display
                    }
                }
                if (endTimeInput) {
                    const parsed = parseTimeInput(endTimeInput);
                    if (parsed) {
                        endProps = parsed;
                        this.inputEndTime = endTimeInput; // Store for UI display
                    }
                }

                const startTime = parseTimeString(startProps.hours, startProps.minutes, startProps.period);
                let endTime = parseTimeString(endProps.hours, endProps.minutes, endProps.period);
                if (!startTime || !endTime) return { hsvInfo: null };

                let startMs = startTime.getTime();
                let endMs = endTime.getTime();
                if (endMs <= startMs) {
                    endTime.setDate(endTime.getDate() + 1);
                    endMs = endTime.getTime();
                }

                if (currentMs < startMs) {
                    position = 0;
                    this.isInRange = false;
                } else if (currentMs > endMs) {
                    position = 1;
                    this.isInRange = false;
                } else {
                    this.isInRange = true;
                    const totalSteps = Math.max(1, this.timeSteps);
                    const stepInterval = (endMs - startMs) / totalSteps;
                    const elapsedMs = currentMs - startMs;
                    const currentStep = Math.floor(elapsedMs / stepInterval);
                    position = currentStep / totalSteps;
                    this.lastTimeStep = currentStep;
                }
            } else if (this.rangeMode === 'timer') {
                if (trigger && !this.timerStart) {
                    this.timerStart = now.getTime();
                    this.currentStep = 0;
                }
                if (!this.timerStart) return { hsvInfo: null };
                if (trigger === false) {
                    this.timerStart = null;
                    this.currentStep = 0;
                    return { hsvInfo: null };
                }

                let unitMultiplier;
                switch (this.timerUnit) {
                    case 'hours': unitMultiplier = 3600000; break;
                    case 'minutes': unitMultiplier = 60000; break;
                    default: unitMultiplier = 1000; break;
                }

                const timerDuration = (timerDurationInput !== undefined && !isNaN(timerDurationInput) && timerDurationInput > 0)
                    ? timerDurationInput
                    : this.timerDurationValue;

                const durationMs = timerDuration * unitMultiplier;
                const elapsed = now.getTime() - this.timerStart;

                if (elapsed >= durationMs) {
                    position = 1;
                    this.isInRange = true;
                    if (trigger === true) {
                        this.timerStart = now.getTime();
                        this.currentStep = 0;
                    } else {
                        this.timerStart = null;
                        this.currentStep = 0;
                    }
                } else {
                    const totalSteps = Math.floor(timerDuration);
                    const stepSize = totalSteps > 0 ? 1 / totalSteps : 1;
                    position = this.currentStep * stepSize;
                    this.isInRange = true;
                    this.currentStep = Math.min(this.currentStep + 1, totalSteps);
                }
            }

            // Calculate HSV output
            if (this.isInRange || this.rangeMode === 'time') {
                // Apply easing curve to position
                const easedPosition = applyEasing(position, this.easingType);
                
                const h = this.startHue + easedPosition * (this.endHue - this.startHue);
                const s = this.startSaturation + easedPosition * (this.endSaturation - this.startSaturation);
                const v = this.startBrightness + easedPosition * (this.endBrightness - this.startBrightness);
                const brightness = this.useBrightnessOverride ? this.brightnessOverride : v * 2.54;

                const rgb = ColorUtils.hsvToRgbDegrees(h, s, v);
                this.lastColor = rgb;
                this.position = position;

                return {
                    hsvInfo: {
                        hue: h / 360,
                        saturation: s / 100,
                        brightness: brightness,
                        hueStart: this.startHue,
                        hueEnd: this.endHue
                    }
                };
            }

            return { hsvInfo: null };
        }

        serialize() {
            return {
                colorMode: this.colorMode,
                predefinedWedge: this.predefinedWedge,
                startHue: this.startHue,
                startSaturation: this.startSaturation,
                startBrightness: this.startBrightness,
                endHue: this.endHue,
                endSaturation: this.endSaturation,
                endBrightness: this.endBrightness,
                rangeMode: this.rangeMode,
                startValue: this.startValue,
                endValue: this.endValue,
                startTimeHours: this.startTimeHours,
                startTimeMinutes: this.startTimeMinutes,
                startTimePeriod: this.startTimePeriod,
                endTimeHours: this.endTimeHours,
                endTimeMinutes: this.endTimeMinutes,
                endTimePeriod: this.endTimePeriod,
                timerDurationValue: this.timerDurationValue,
                timerUnit: this.timerUnit,
                timeSteps: this.timeSteps,
                useBrightnessOverride: this.useBrightnessOverride,
                brightnessOverride: this.brightnessOverride,
                easingType: this.easingType,
                gradientYPosition: this.gradientYPosition,
                debug: this.debug,
                enableReconnect: this.enableReconnect,
                reconnectInterval: this.reconnectInterval
            };
        }

        deserialize(data) {
            if (!data) return;
            if (data.colorMode !== undefined) this.colorMode = data.colorMode;
            if (data.predefinedWedge !== undefined) this.predefinedWedge = data.predefinedWedge;
            if (data.startHue !== undefined) this.startHue = data.startHue;
            if (data.startSaturation !== undefined) this.startSaturation = data.startSaturation;
            if (data.startBrightness !== undefined) this.startBrightness = data.startBrightness;
            if (data.endHue !== undefined) this.endHue = data.endHue;
            if (data.endSaturation !== undefined) this.endSaturation = data.endSaturation;
            if (data.endBrightness !== undefined) this.endBrightness = data.endBrightness;
            if (data.rangeMode !== undefined) this.rangeMode = data.rangeMode;
            if (data.startValue !== undefined) this.startValue = data.startValue;
            if (data.endValue !== undefined) this.endValue = data.endValue;
            if (data.startTimeHours !== undefined) this.startTimeHours = data.startTimeHours;
            if (data.startTimeMinutes !== undefined) this.startTimeMinutes = data.startTimeMinutes;
            if (data.startTimePeriod !== undefined) this.startTimePeriod = data.startTimePeriod;
            if (data.endTimeHours !== undefined) this.endTimeHours = data.endTimeHours;
            if (data.endTimeMinutes !== undefined) this.endTimeMinutes = data.endTimeMinutes;
            if (data.endTimePeriod !== undefined) this.endTimePeriod = data.endTimePeriod;
            if (data.timerDurationValue !== undefined) this.timerDurationValue = data.timerDurationValue;
            if (data.timerUnit !== undefined) this.timerUnit = data.timerUnit;
            if (data.timeSteps !== undefined) this.timeSteps = data.timeSteps;
            if (data.useBrightnessOverride !== undefined) this.useBrightnessOverride = data.useBrightnessOverride;
            if (data.brightnessOverride !== undefined) this.brightnessOverride = data.brightnessOverride;
            if (data.easingType !== undefined) this.easingType = data.easingType;
            // Apply wedge preset if predefined mode
            if (this.colorMode === 'predefined' && WEDGE_PRESETS[this.predefinedWedge]) {
                const preset = WEDGE_PRESETS[this.predefinedWedge];
                this.startHue = preset.startHue;
                this.startSaturation = preset.startSat;
                this.startBrightness = preset.startBri;
                this.endHue = preset.endHue;
                this.endSaturation = preset.endSat;
                this.endBrightness = preset.endBri;
            }
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function ColorGradientNodeComponent({ data, emit }) {
        const [colorMode, setColorMode] = useState(data.colorMode);
        const [predefinedWedge, setPredefinedWedge] = useState(data.predefinedWedge);
        const [startHue, setStartHue] = useState(data.startHue);
        const [startSaturation, setStartSaturation] = useState(data.startSaturation);
        const [startBrightness, setStartBrightness] = useState(data.startBrightness);
        const [endHue, setEndHue] = useState(data.endHue);
        const [endSaturation, setEndSaturation] = useState(data.endSaturation);
        const [endBrightness, setEndBrightness] = useState(data.endBrightness);
        const [rangeMode, setRangeMode] = useState(data.rangeMode);
        const [startValue, setStartValue] = useState(data.startValue);
        const [endValue, setEndValue] = useState(data.endValue);
        const [startTimeHours, setStartTimeHours] = useState(data.startTimeHours);
        const [startTimeMinutes, setStartTimeMinutes] = useState(data.startTimeMinutes);
        const [startTimePeriod, setStartTimePeriod] = useState(data.startTimePeriod);
        const [endTimeHours, setEndTimeHours] = useState(data.endTimeHours);
        const [endTimeMinutes, setEndTimeMinutes] = useState(data.endTimeMinutes);
        const [endTimePeriod, setEndTimePeriod] = useState(data.endTimePeriod);
        const [timerDuration, setTimerDuration] = useState(data.timerDurationValue);
        const [timerUnit, setTimerUnit] = useState(data.timerUnit);
        const [timeSteps, setTimeSteps] = useState(data.timeSteps);
        const [useBrightnessOverride, setUseBrightnessOverride] = useState(data.useBrightnessOverride);
        const [brightnessOverride, setBrightnessOverride] = useState(data.brightnessOverride);
        const [easingType, setEasingType] = useState(data.easingType || 'linear');
        const [position, setPosition] = useState(data.position || 0);
        const [isInRange, setIsInRange] = useState(data.isInRange || false);
        const [lastColor, setLastColor] = useState(data.lastColor);
        const [isCollapsed, setIsCollapsed] = useState(false);
        
        // Track input overrides for time values
        const [inputStartTime, setInputStartTime] = useState(null);
        const [inputEndTime, setInputEndTime] = useState(null);

        const gradientCanvasRef = useRef(null);

        // Sync from node on mount
        useEffect(() => {
            setColorMode(data.colorMode);
            setPredefinedWedge(data.predefinedWedge);
            setStartHue(data.startHue);
            setStartSaturation(data.startSaturation);
            setStartBrightness(data.startBrightness);
            setEndHue(data.endHue);
            setEndSaturation(data.endSaturation);
            setEndBrightness(data.endBrightness);
            setRangeMode(data.rangeMode);
            setStartValue(data.startValue);
            setEndValue(data.endValue);
            setStartTimeHours(data.startTimeHours);
            setStartTimeMinutes(data.startTimeMinutes);
            setStartTimePeriod(data.startTimePeriod);
            setEndTimeHours(data.endTimeHours);
            setEndTimeMinutes(data.endTimeMinutes);
            setEndTimePeriod(data.endTimePeriod);
            setTimerDuration(data.timerDurationValue);
            setTimerUnit(data.timerUnit);
            setTimeSteps(data.timeSteps);
            setUseBrightnessOverride(data.useBrightnessOverride);
            setBrightnessOverride(data.brightnessOverride);
            setEasingType(data.easingType || 'linear');
        }, [data]);

        // Update gradient canvas with easing visualization
        useEffect(() => {
            const canvas = gradientCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            // High-DPI canvas setup for crisp text
            const dpr = window.devicePixelRatio || 1;
            const displayWidth = 400;
            const displayHeight = 50;
            
            // Set canvas size accounting for device pixel ratio
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            ctx.scale(dpr, dpr);
            
            const width = displayWidth;
            const height = displayHeight;
            const gradientHeight = 28; // Height of gradient bar
            const scaleHeight = 22; // Height for numbers and tick marks

            // Clear canvas
            ctx.clearRect(0, 0, width, height);

            // Draw gradient with easing applied
            const steps = 100;
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const easedT = applyEasing(t, easingType);
                const hue = startHue + easedT * (endHue - startHue);
                const sat = startSaturation + easedT * (endSaturation - startSaturation);
                const bri = startBrightness + easedT * (endBrightness - startBrightness);
                ctx.fillStyle = `hsl(${hue}, ${sat}%, ${Math.max(20, bri / 2)}%)`;
                ctx.fillRect((i / steps) * width, 0, width / steps + 1, gradientHeight);
            }

            // Draw scale background
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, gradientHeight, width, scaleHeight);

            // Draw tick marks and numbers based on range mode
            ctx.fillStyle = '#c9d1d9';
            ctx.strokeStyle = '#a0aec0';
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 1;

            // Helper to convert 24h time to display time
            const formatTime = (hours24, minutes) => {
                const h = hours24 % 12 || 12;
                const m = String(minutes).padStart(2, '0');
                const period = hours24 >= 12 ? 'PM' : 'AM';
                return `${h}:${m}${period}`;
            };

            // Helper to convert 12h time to 24h minutes from midnight
            const to24HourMinutes = (hours, minutes, period) => {
                let h = hours;
                if (period === 'PM' && h !== 12) h += 12;
                if (period === 'AM' && h === 12) h = 0;
                return h * 60 + minutes;
            };

            // Generate scale labels based on range mode
            const numTicks = 5; // Show 5 labels (start, 25%, 50%, 75%, end)
            const labelY = gradientHeight + scaleHeight / 2 + 2;
            
            if (rangeMode === 'time') {
                // Time mode: show times from start to end
                const startMins = to24HourMinutes(startTimeHours, startTimeMinutes, startTimePeriod);
                let endMins = to24HourMinutes(endTimeHours, endTimeMinutes, endTimePeriod);
                
                // Handle overnight (end time before start time)
                if (endMins <= startMins) {
                    endMins += 24 * 60;
                }
                
                for (let i = 0; i <= numTicks; i++) {
                    const x = (i / numTicks) * width;
                    const t = i / numTicks;
                    let mins = startMins + t * (endMins - startMins);
                    mins = mins % (24 * 60); // Wrap around midnight
                    const hours24 = Math.floor(mins / 60);
                    const minutes = Math.round(mins % 60);
                    
                    // Draw tick mark
                    ctx.beginPath();
                    ctx.moveTo(x, gradientHeight);
                    ctx.lineTo(x, gradientHeight + 5);
                    ctx.stroke();
                    
                    // Draw time label
                    const label = formatTime(hours24, minutes);
                    ctx.fillText(label, x, labelY);
                }
            } else if (rangeMode === 'timer') {
                // Timer mode: show 0 to duration with units
                const unitLabel = timerUnit === 'minutes' ? 'm' : (timerUnit === 'hours' ? 'h' : 's');
                const duration = timerDuration || 1;
                
                for (let i = 0; i <= numTicks; i++) {
                    const x = (i / numTicks) * width;
                    const t = i / numTicks;
                    const value = Math.round(t * duration * 10) / 10; // One decimal place
                    
                    // Draw tick mark
                    ctx.beginPath();
                    ctx.moveTo(x, gradientHeight);
                    ctx.lineTo(x, gradientHeight + 5);
                    ctx.stroke();
                    
                    // Draw value label
                    const label = `${value}${unitLabel}`;
                    ctx.fillText(label, x, labelY);
                }
            } else {
                // Numerical mode: show startValue to endValue
                const start = startValue !== undefined ? startValue : 0;
                const end = endValue !== undefined ? endValue : 100;
                
                for (let i = 0; i <= numTicks; i++) {
                    const x = (i / numTicks) * width;
                    const t = i / numTicks;
                    const value = Math.round(start + t * (end - start));
                    
                    // Draw tick mark
                    ctx.beginPath();
                    ctx.moveTo(x, gradientHeight);
                    ctx.lineTo(x, gradientHeight + 5);
                    ctx.stroke();
                    
                    // Draw value label
                    ctx.fillText(value.toString(), x, labelY);
                }
            }

            // Draw position indicator (triangle pointing up from scale into gradient)
            const markerX = Math.max(5, Math.min(width - 5, position * width));
            
            // Draw the tick line
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(markerX, 0);
            ctx.lineTo(markerX, gradientHeight + 8);
            ctx.stroke();

            // Draw triangle indicator at bottom
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.moveTo(markerX - 6, gradientHeight + scaleHeight);
            ctx.lineTo(markerX + 6, gradientHeight + scaleHeight);
            ctx.lineTo(markerX, gradientHeight + 8);
            ctx.closePath();
            ctx.fill();
        }, [startHue, startSaturation, startBrightness, endHue, endSaturation, endBrightness, position, isInRange, easingType, rangeMode, startValue, endValue, startTimeHours, startTimeMinutes, startTimePeriod, endTimeHours, endTimeMinutes, endTimePeriod, timerDuration, timerUnit]);

        // Periodic update for runtime state
        useEffect(() => {
            const interval = setInterval(() => {
                setPosition(data.position || 0);
                setIsInRange(data.isInRange || false);
                setLastColor(data.lastColor);
                
                // Track input time overrides from connected nodes
                setInputStartTime(data.inputStartTime || null);
                setInputEndTime(data.inputEndTime || null);
            }, 500);
            return () => clearInterval(interval);
        }, [data]);

        const triggerUpdate = useCallback(() => {
            if (data.changeCallback) data.changeCallback();
        }, [data]);

        const handleColorModeChange = (e) => {
            const val = e.target.value;
            setColorMode(val);
            data.colorMode = val;
            if (val === 'predefined' && WEDGE_PRESETS[predefinedWedge]) {
                const preset = WEDGE_PRESETS[predefinedWedge];
                data.startHue = preset.startHue;
                data.startSaturation = preset.startSat;
                data.startBrightness = preset.startBri;
                data.endHue = preset.endHue;
                data.endSaturation = preset.endSat;
                data.endBrightness = preset.endBri;
                setStartHue(preset.startHue);
                setStartSaturation(preset.startSat);
                setStartBrightness(preset.startBri);
                setEndHue(preset.endHue);
                setEndSaturation(preset.endSat);
                setEndBrightness(preset.endBri);
            }
            triggerUpdate();
        };

        const handleWedgeChange = (e) => {
            const val = e.target.value;
            setPredefinedWedge(val);
            data.predefinedWedge = val;
            if (colorMode === 'predefined' && WEDGE_PRESETS[val]) {
                const preset = WEDGE_PRESETS[val];
                data.startHue = preset.startHue;
                data.startSaturation = preset.startSat;
                data.startBrightness = preset.startBri;
                data.endHue = preset.endHue;
                data.endSaturation = preset.endSat;
                data.endBrightness = preset.endBri;
                setStartHue(preset.startHue);
                setStartSaturation(preset.startSat);
                setStartBrightness(preset.startBri);
                setEndHue(preset.endHue);
                setEndSaturation(preset.endSat);
                setEndBrightness(preset.endBri);
            }
            triggerUpdate();
        };

        const handleRangeModeChange = (e) => {
            const val = e.target.value;
            setRangeMode(val);
            data.rangeMode = val;
            data.timerStart = null;
            data.currentStep = 0;
            data.lastTimeStep = null;
            triggerUpdate();
        };

        const createSliderHandler = (setter, nodeProp) => (e) => {
            const val = parseInt(e.target.value, 10);
            setter(val);
            data[nodeProp] = val;
            triggerUpdate();
        };

        const createNumberHandler = (setter, nodeProp, min = 0) => (e) => {
            const val = Math.max(min, parseInt(e.target.value, 10) || 0);
            setter(val);
            data[nodeProp] = val;
            triggerUpdate();
        };

        // Helper to calculate slider fill gradient for Tron theme
        const getSliderStyle = (value, min, max, isHue = false) => {
            const percent = ((value - min) / (max - min)) * 100;
            if (isHue) {
                // Rainbow gradient for hue sliders
                return {
                    background: `linear-gradient(to right, 
                        hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), 
                        hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))`
                };
            }
            // Tron-style: cyan glow fill that transitions to darker
            return {
                background: `linear-gradient(90deg, 
                    rgba(0, 243, 255, 0.5) 0%, 
                    rgba(0, 243, 255, 0.4) ${percent}%, 
                    rgba(0, 243, 255, 0.15) ${percent}%)`
            };
        };

        const currentColorStyle = lastColor
            ? { backgroundColor: `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})` }
            : { backgroundColor: '#333' };

        // Stop pointer events from propagating to canvas (enables slider/dropdown interaction)
        const stopPropagation = (e) => e.stopPropagation();

        // Get inputs and outputs for socket rendering
        const inputs = Object.entries(data.inputs || {});
        const outputs = Object.entries(data.outputs || {});

        // RENDER_CONTENT_HERE
        return el('div', {
            className: `color-gradient-node ${isInRange ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`
        }, [
            // Header
            el('div', { key: 'header', className: 'cgn-header' }, [
                el('div', {
                    key: 'toggle',
                    className: 'cgn-collapse-toggle',
                    onPointerDown: (e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }
                }, isCollapsed ? "▶" : "▼"),
                el('div', { key: 'title', className: 'cgn-title' }, "Stepped Color Gradient")
            ]),

            // IO Container
            el('div', { key: 'io', className: 'cgn-io-container' }, [
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

            // Status Section
            el('div', { key: 'status', className: 'cgn-status-section', onPointerDown: stopPropagation }, [
                el('div', { key: 'gradient', className: 'cgn-gradient-container' }, 
                    el('canvas', { ref: gradientCanvasRef, className: 'cgn-gradient-canvas' })
                ),
                el('div', { key: 'swatch', className: 'cgn-swatch-row' }, [
                    el('div', { key: 'color', className: 'cgn-current-color', style: currentColorStyle }),
                    el('span', { key: 'text', className: 'cgn-status' }, isInRange ? 'In Range' : 'Outside Range')
                ]),
                el('div', { key: 'time', className: 'cgn-time-display' }, [
                    el('div', { key: 'start', className: `cgn-time-display-row ${inputStartTime ? 'cgn-time-from-input' : ''}` }, 
                        inputStartTime 
                            ? el('span', null, [el('span', { key: 'badge', className: 'cgn-input-badge' }, 'INPUT'), el('span', { key: 'text' }, ` Start: ${inputStartTime}`)])
                            : el('span', null, [el('span', { key: 'badge', className: 'cgn-local-badge' }, 'LOCAL'), el('span', { key: 'text' }, ` Start: ${startTimeHours}:${String(startTimeMinutes).padStart(2, '0')} ${startTimePeriod}`)])
                    ),
                    el('div', { key: 'end', className: `cgn-time-display-row ${inputEndTime ? 'cgn-time-from-input' : ''}` }, 
                        inputEndTime 
                            ? el('span', null, [el('span', { key: 'badge', className: 'cgn-input-badge' }, 'INPUT'), el('span', { key: 'text' }, ` End: ${inputEndTime}`)])
                            : el('span', null, [el('span', { key: 'badge', className: 'cgn-local-badge' }, 'LOCAL'), el('span', { key: 'text' }, ` End: ${endTimeHours}:${String(endTimeMinutes).padStart(2, '0')} ${endTimePeriod}`)])
                    )
                ])
            ]),

            // Controls
            !isCollapsed ? el('div', { key: 'controls', className: 'cgn-controls', onPointerDown: stopPropagation }, [
                // Color Mode
                el('div', { key: 'colorMode', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Predefined: Choose from preset color ranges (Warm, Cool, etc). Custom: Define your own start and end HSV colors." }, [
                        el('span', { key: 'text' }, "Color Mode"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: colorMode, onChange: handleColorModeChange }, [
                        el('option', { key: 'predefined', value: 'predefined' }, 'Predefined'),
                        el('option', { key: 'custom', value: 'custom' }, 'Custom')
                    ])
                ]),

                // Range Mode
                el('div', { key: 'rangeMode', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Numerical: Map input value (0-100) to gradient. Time: Gradient follows clock time between start/end. Timer: Gradient progresses over a countdown duration." }, [
                        el('span', { key: 'text' }, "Range Mode"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: rangeMode, onChange: handleRangeModeChange }, [
                        el('option', { key: 'numerical', value: 'numerical' }, 'Numerical'),
                        el('option', { key: 'time', value: 'time' }, 'Time'),
                        el('option', { key: 'timer', value: 'timer' }, 'Timer')
                    ])
                ]),

                // Wedge Selection
                colorMode === 'predefined' ? el('div', { key: 'wedge', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Warm: Red to Yellow. Cool: Cyan to Blue. Warm-to-Cool: Full spectrum from red through green to blue." }, [
                        el('span', { key: 'text' }, "Wedge"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: predefinedWedge, onChange: handleWedgeChange }, [
                        el('option', { key: 'warm', value: 'warm' }, 'Warm'),
                        el('option', { key: 'cool', value: 'cool' }, 'Cool'),
                        el('option', { key: 'warm-to-cool', value: 'warm-to-cool' }, 'Warm to Cool')
                    ])
                ]) : null,

                // HSV Sliders
                colorMode === 'custom' ? [
                    el('div', { key: 'sh', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Start Hue: ${startHue}°`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 360, value: startHue, onChange: createSliderHandler(setStartHue, 'startHue'), className: 'cgn-slider', style: getSliderStyle(startHue, 0, 360, true) })
                    ]),
                    el('div', { key: 'ss', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Start Saturation: ${startSaturation}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: startSaturation, onChange: createSliderHandler(setStartSaturation, 'startSaturation'), className: 'cgn-slider', style: getSliderStyle(startSaturation, 0, 100) })
                    ]),
                    el('div', { key: 'sb', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Start Brightness: ${startBrightness}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: startBrightness, onChange: createSliderHandler(setStartBrightness, 'startBrightness'), className: 'cgn-slider', style: getSliderStyle(startBrightness, 0, 100) })
                    ]),
                    el('div', { key: 'eh', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `End Hue: ${endHue}°`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 360, value: endHue, onChange: createSliderHandler(setEndHue, 'endHue'), className: 'cgn-slider', style: getSliderStyle(endHue, 0, 360, true) })
                    ]),
                    el('div', { key: 'es', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `End Saturation: ${endSaturation}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: endSaturation, onChange: createSliderHandler(setEndSaturation, 'endSaturation'), className: 'cgn-slider', style: getSliderStyle(endSaturation, 0, 100) })
                    ]),
                    el('div', { key: 'eb', className: 'cgn-section cgn-hsv-group' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `End Brightness: ${endBrightness}%`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: endBrightness, onChange: createSliderHandler(setEndBrightness, 'endBrightness'), className: 'cgn-slider', style: getSliderStyle(endBrightness, 0, 100) })
                    ])
                ] : null,

                // Numerical Range
                el('div', { key: 'numRange', className: `cgn-section-group ${rangeMode !== 'numerical' ? 'ghosted' : ''}` }, [
                    el('div', { key: 'header', className: 'cgn-section-header cgn-tooltip', 'data-tooltip': "Maps the input value to the gradient. When input equals Range Start, output is the start color. When input equals Range End, output is the end color." }, [
                        el('span', { key: 'text' }, "Numerical Range"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('div', { key: 'startSection', className: 'cgn-section' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Range Start: ${startValue}`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: startValue, onChange: createSliderHandler(setStartValue, 'startValue'), className: 'cgn-slider', style: getSliderStyle(startValue, 0, 100) })
                    ]),
                    el('div', { key: 'endSection', className: 'cgn-section' }, [
                        el('label', { key: 'label', className: 'cgn-label' }, `Range End: ${endValue}`),
                        el('input', { key: 'input', type: 'range', min: 0, max: 100, value: endValue, onChange: createSliderHandler(setEndValue, 'endValue'), className: 'cgn-slider', style: getSliderStyle(endValue, 0, 100) })
                    ])
                ]),

                // Time Range
                el('div', { key: 'timeRange', className: `cgn-section-group ${rangeMode !== 'time' ? 'ghosted' : ''} ${(inputStartTime || inputEndTime) ? 'cgn-input-override' : ''}` }, [
                    el('div', { key: 'header', className: 'cgn-section-header cgn-tooltip', 'data-tooltip': "Gradient follows real clock time. At Start Time, outputs start color. At End Time, outputs end color. Supports overnight ranges (e.g., 10PM to 6AM)." }, [
                        el('span', { key: 'text' }, "Time Range"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?"),
                        (inputStartTime || inputEndTime) ? el('span', { key: 'notice', className: 'cgn-override-notice' }, "(Using Input Values)") : null
                    ]),
                    el('div', { key: 'startHours', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Start Time Hours: ${startTimeHours}`),
                        el('input', { type: 'range', min: 1, max: 12, value: startTimeHours, onChange: createSliderHandler(setStartTimeHours, 'startTimeHours'), className: 'cgn-slider', style: getSliderStyle(startTimeHours, 1, 12) })
                    ]),
                    el('div', { key: 'startMinutes', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Start Time Minutes: ${startTimeMinutes}`),
                        el('input', { type: 'range', min: 0, max: 59, value: startTimeMinutes, onChange: createSliderHandler(setStartTimeMinutes, 'startTimeMinutes'), className: 'cgn-slider', style: getSliderStyle(startTimeMinutes, 0, 59) })
                    ]),
                    el('div', { key: 'startPeriod', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, "Start Time Period"),
                        el('select', { className: 'cgn-select', value: startTimePeriod, onChange: (e) => { setStartTimePeriod(e.target.value); data.startTimePeriod = e.target.value; triggerUpdate(); } }, [
                            el('option', { key: 'AM', value: 'AM' }, 'AM'),
                            el('option', { key: 'PM', value: 'PM' }, 'PM')
                        ])
                    ]),
                    el('div', { key: 'endHours', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `End Time Hours: ${endTimeHours}`),
                        el('input', { type: 'range', min: 1, max: 12, value: endTimeHours, onChange: createSliderHandler(setEndTimeHours, 'endTimeHours'), className: 'cgn-slider', style: getSliderStyle(endTimeHours, 1, 12) })
                    ]),
                    el('div', { key: 'endMinutes', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `End Time Minutes: ${endTimeMinutes}`),
                        el('input', { type: 'range', min: 0, max: 59, value: endTimeMinutes, onChange: createSliderHandler(setEndTimeMinutes, 'endTimeMinutes'), className: 'cgn-slider', style: getSliderStyle(endTimeMinutes, 0, 59) })
                    ]),
                    el('div', { key: 'endPeriod', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, "End Time Period"),
                        el('select', { className: 'cgn-select', value: endTimePeriod, onChange: (e) => { setEndTimePeriod(e.target.value); data.endTimePeriod = e.target.value; triggerUpdate(); } }, [
                            el('option', { key: 'AM', value: 'AM' }, 'AM'),
                            el('option', { key: 'PM', value: 'PM' }, 'PM')
                        ])
                    ])
                ]),

                // Timer Controls
                el('div', { key: 'timer', className: `cgn-section-group ${rangeMode !== 'timer' ? 'ghosted' : ''}` }, [
                    el('div', { key: 'header', className: 'cgn-section-header cgn-tooltip', 'data-tooltip': "Gradient progresses over time when triggered. Duration sets total time. Steps control how many discrete color changes occur during the countdown." }, [
                        el('span', { key: 'text' }, "Timer Settings"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('div', { key: 'duration', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Timer Duration: ${timerDuration}`),
                        el('input', { type: 'range', min: 1, max: 120, value: timerDuration, onChange: createSliderHandler(setTimerDuration, 'timerDurationValue'), className: 'cgn-slider', style: getSliderStyle(timerDuration, 1, 120) })
                    ]),
                    el('div', { key: 'unit', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, "Timer Unit"),
                        el('select', { className: 'cgn-select', value: timerUnit, onChange: (e) => { setTimerUnit(e.target.value); data.timerUnit = e.target.value; triggerUpdate(); } }, [
                            el('option', { key: 'seconds', value: 'seconds' }, 'Seconds'),
                            el('option', { key: 'minutes', value: 'minutes' }, 'Minutes'),
                            el('option', { key: 'hours', value: 'hours' }, 'Hours')
                        ])
                    ]),
                    el('div', { key: 'steps', className: 'cgn-section' }, [
                        el('label', { className: 'cgn-label' }, `Time Steps: ${timeSteps}`),
                        el('input', { type: 'range', min: 1, max: 120, value: timeSteps, onChange: createSliderHandler(setTimeSteps, 'timeSteps'), className: 'cgn-slider', style: getSliderStyle(timeSteps, 1, 120) })
                    ])
                ]),

                // Easing Curve
                el('div', { key: 'easing', className: 'cgn-section' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "Controls how colors transition. Linear: constant rate. Ease-In: starts slow. Ease-Out: ends slow. Back: slight overshoot. Higher orders (Cubic, Quart, Expo) are more dramatic." }, [
                        el('span', { key: 'text' }, "Easing Curve"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('select', { key: 'select', className: 'cgn-select', value: easingType, onChange: (e) => { setEasingType(e.target.value); data.easingType = e.target.value; triggerUpdate(); } }, [
                        el('option', { key: 'linear', value: 'linear' }, 'Linear'),
                        el('option', { key: 'ease-in', value: 'ease-in' }, 'Ease In (Quad)'),
                        el('option', { key: 'ease-out', value: 'ease-out' }, 'Ease Out (Quad)'),
                        el('option', { key: 'ease-in-out', value: 'ease-in-out' }, 'Ease In-Out (Quad)'),
                        el('option', { key: 'ease-in-cubic', value: 'ease-in-cubic' }, 'Ease In (Cubic)'),
                        el('option', { key: 'ease-out-cubic', value: 'ease-out-cubic' }, 'Ease Out (Cubic)'),
                        el('option', { key: 'ease-in-out-cubic', value: 'ease-in-out-cubic' }, 'Ease In-Out (Cubic)'),
                        el('option', { key: 'ease-in-quart', value: 'ease-in-quart' }, 'Ease In (Quart)'),
                        el('option', { key: 'ease-out-quart', value: 'ease-out-quart' }, 'Ease Out (Quart)'),
                        el('option', { key: 'ease-in-out-quart', value: 'ease-in-out-quart' }, 'Ease In-Out (Quart)'),
                        el('option', { key: 'ease-in-expo', value: 'ease-in-expo' }, 'Ease In (Expo)'),
                        el('option', { key: 'ease-out-expo', value: 'ease-out-expo' }, 'Ease Out (Expo)'),
                        el('option', { key: 'ease-in-out-expo', value: 'ease-in-out-expo' }, 'Ease In-Out (Expo)'),
                        el('option', { key: 'ease-in-back', value: 'ease-in-back' }, 'Ease In (Back)'),
                        el('option', { key: 'ease-out-back', value: 'ease-out-back' }, 'Ease Out (Back)')
                    ])
                ]),

                // Brightness Override
                el('div', { key: 'briOverride', className: 'cgn-section cgn-toggle-row' }, [
                    el('label', { key: 'label', className: 'cgn-label cgn-tooltip', 'data-tooltip': "When enabled, uses a fixed brightness value instead of the gradient's brightness. Useful for keeping consistent light levels while colors change." }, [
                        el('span', { key: 'text' }, "Override Brightness"), el('span', { key: 'icon', className: 'cgn-info-icon' }, "?")
                    ]),
                    el('input', { type: 'checkbox', checked: useBrightnessOverride, onChange: (e) => { setUseBrightnessOverride(e.target.checked); data.useBrightnessOverride = e.target.checked; triggerUpdate(); }, className: 'cgn-checkbox' })
                ]),
                useBrightnessOverride ? el('div', { key: 'briVal', className: 'cgn-section' }, [
                    el('label', { className: 'cgn-label' }, `Brightness: ${brightnessOverride}`),
                    el('input', { type: 'range', min: 0, max: 254, value: brightnessOverride, onChange: createSliderHandler(setBrightnessOverride, 'brightnessOverride'), className: 'cgn-slider', style: getSliderStyle(brightnessOverride, 0, 254) })
                ]) : null

            ]) : null
        ]);
    }

    window.nodeRegistry.register('ColorGradientNode', {
        label: "Stepped Color Gradient",
        category: "CC_Control_Nodes",
        nodeClass: ColorGradientNode,
        factory: (cb) => new ColorGradientNode(cb),
        component: ColorGradientNodeComponent
    });

    console.log("[ColorGradientNode] Registered");
})();
