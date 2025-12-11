import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import './Toast.css';

// Toast Context for global access
const ToastContext = createContext(null);

// Toast types with icons and colors
const TOAST_CONFIG = {
    success: { icon: '✓', className: 'toast-success' },
    error: { icon: '✕', className: 'toast-error' },
    warning: { icon: '⚠', className: 'toast-warning' },
    info: { icon: 'ℹ', className: 'toast-info' }
};

// Individual Toast component
function ToastItem({ id, type, message, duration, onRemove, action, actionLabel }) {
    const [isExiting, setIsExiting] = useState(false);
    const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                setIsExiting(true);
                setTimeout(() => onRemove(id), 300); // Wait for exit animation
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [id, duration, onRemove]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => onRemove(id), 300);
    };

    const handleAction = () => {
        if (action) {
            action();
        }
        handleClose();
    };

    return (
        <div className={`toast ${config.className} ${isExiting ? 'toast-exit' : ''}`}>
            <span className="toast-icon">{config.icon}</span>
            <span className="toast-message">{message}</span>
            {action && actionLabel && (
                <button className="toast-action" onClick={handleAction}>{actionLabel}</button>
            )}
            <button className="toast-close" onClick={handleClose}>×</button>
        </div>
    );
}

// Toast Container component
export function ToastContainer({ children }) {
    const [toasts, setToasts] = useState([]);
    let toastId = 0;

    const addToast = useCallback((type, message, options = {}) => {
        const id = ++toastId;
        const duration = typeof options === 'number' ? options : (options.duration ?? 4000);
        const action = typeof options === 'object' ? options.action : null;
        const actionLabel = typeof options === 'object' ? options.actionLabel : null;
        setToasts(prev => [...prev, { id, type, message, duration, action, actionLabel }]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Convenience methods
    const toast = {
        success: (msg, options) => addToast('success', msg, options),
        error: (msg, options) => addToast('error', msg, typeof options === 'number' ? options : { duration: 6000, ...options }), // Errors stay longer
        warning: (msg, options) => addToast('warning', msg, options),
        info: (msg, options) => addToast('info', msg, options),
        dismiss: removeToast,
        dismissAll: () => setToasts([])
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <ToastItem
                        key={t.id}
                        id={t.id}
                        type={t.type}
                        message={t.message}
                        duration={t.duration}
                        onRemove={removeToast}
                        action={t.action}
                        actionLabel={t.actionLabel}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// Hook to use toast anywhere
export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        // Debug: console.warn('useToast must be used within a ToastContainer');
        // Return a no-op version to prevent crashes
        return {
            success: () => {},
            error: () => {},
            warning: () => {},
            info: () => {},
            dismiss: () => {},
            dismissAll: () => {}
        };
    }
    return context;
}

// Global toast accessor for plugins (set by ToastExposer component)
let globalToast = null;

export function ToastExposer() {
    const toast = useToast();
    useEffect(() => {
        globalToast = toast;
        if (typeof window !== 'undefined') {
            window.T2Toast = toast;
        }
        return () => {
            globalToast = null;
            if (typeof window !== 'undefined') {
                window.T2Toast = null;
            }
        };
    }, [toast]);
    return null;
}

// Get global toast (for use outside React)
export function getToast() {
    return globalToast;
}

// Also expose globally for plugins
if (typeof window !== 'undefined') {
    window.T2Toast = null; // Will be set when context is available
}

export default ToastContainer;
