'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '@/hooks/useHaptic';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType, duration?: number) => void;
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const toastStyles: Record<ToastType, string> = {
    success: 'bg-green-500/90 border-green-400/50',
    error: 'bg-red-500/90 border-red-400/50',
    warning: 'bg-yellow-500/90 border-yellow-400/50',
    info: 'bg-primary/90 border-primary/50',
};

const toastIcons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback(
        (message: string, type: ToastType = 'info', duration: number = 3000) => {
            const id = `${Date.now()}-${Math.random()}`;

            // Haptic feedback based on type
            if (type === 'success') haptic('success');
            else if (type === 'error') haptic('error');
            else if (type === 'warning') haptic('warning');
            else haptic('light');

            setToasts((prev) => [...prev, { id, message, type, duration }]);

            if (duration > 0) {
                setTimeout(() => removeToast(id), duration);
            }
        },
        [removeToast]
    );

    const contextValue: ToastContextType = {
        toast: addToast,
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
    };

    return (
        <ToastContext.Provider value={contextValue}>
            {children}

            {/* Toast Container - fixed at top for mobile */}
            <div className="fixed top-16 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: -50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                            className={`pointer-events-auto max-w-sm w-full px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg ${toastStyles[toast.type]}`}
                            onClick={() => removeToast(toast.id)}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-white text-lg font-bold">
                                    {toastIcons[toast.type]}
                                </span>
                                <span className="text-white text-sm font-medium flex-1">
                                    {toast.message}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextType {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
