'use client';

import { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
    content: string | ReactNode;
    children: ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    const positionStyles = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };

    const arrowStyles = {
        top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--bg-tertiary)]',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--bg-tertiary)]',
        left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--bg-tertiary)]',
        right: 'right-full top-1/2 -translate-y-1/2 border-r-[var(--bg-tertiary)]',
    };

    return (
        <span
            className="relative inline-flex"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            <span className="border-b border-dotted border-gray-500 cursor-help">
                {children}
            </span>
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        className={`absolute z-50 ${positionStyles[position]}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                    >
                        <div className="px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--glass-border)] shadow-lg text-sm text-gray-300 max-w-xs">
                            {content}
                        </div>
                        <div
                            className={`absolute w-0 h-0 border-4 border-transparent ${arrowStyles[position]}`}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </span>
    );
}

// Shorthand for common DeFi terms
export function DeFiTerm({ term, explanation }: { term: string; explanation: string }) {
    return (
        <Tooltip content={explanation}>
            {term}
        </Tooltip>
    );
}
