'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { haptic } from '@/hooks/useHaptic';

// SVG Icons as components
const SwapIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
);

const PoolsIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
);

const PortfolioIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
);

const BridgeIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
);

const VoteIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

// Nav items with Portfolio in center (elevated like mobile apps)
const navItems = [
    { href: '/swap', label: 'Swap', Icon: SwapIcon },
    { href: '/pools', label: 'Pools', Icon: PoolsIcon },
    { href: '/portfolio', label: 'Portfolio', Icon: PortfolioIcon, isMain: true },
    { href: '/bridge', label: 'Bridge', Icon: BridgeIcon },
    { href: '/vote', label: 'Vote', Icon: VoteIcon },
];

/**
 * Mobile bottom navigation bar - fixed at bottom like native apps
 * Portfolio is elevated in the center like main action in mobile apps
 * Only visible on mobile (< md breakpoint)
 */
export function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
            <div className="flex items-end justify-around px-2 py-1.5">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.Icon;

                    // Elevated center button (Portfolio)
                    if (item.isMain) {
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => haptic('medium')}
                                className="relative flex flex-col items-center justify-center flex-1 -mt-3"
                            >
                                <div
                                    className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${isActive
                                        ? 'bg-gradient-to-r from-primary to-secondary scale-110'
                                        : 'bg-gradient-to-r from-primary/80 to-secondary/80 active:scale-95'
                                        }`}
                                >
                                    <Icon className="w-5 h-5 text-white" />
                                </div>
                            </Link>
                        );
                    }

                    // Regular nav items
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => haptic('light')}
                            className="relative flex items-center justify-center flex-1 py-2 group"
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="bottomNavActive"
                                    className="absolute inset-2 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg"
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <Icon
                                className={`w-5 h-5 transition-all ${isActive ? 'text-primary scale-110' : 'text-gray-500 group-active:scale-90'
                                    }`}
                            />
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
