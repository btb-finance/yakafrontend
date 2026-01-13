'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { motion } from 'framer-motion';
import { useAutoSwitchToSei } from '@/hooks/useAutoSwitchToSei';

const navLinks = [
    { href: '/swap', label: 'Swap' },
    { href: '/pools', label: 'Pools' },
    { href: '/bridge', label: 'Bridge' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/vote', label: 'Vote' },
];

export function Header() {
    const pathname = usePathname();

    // Auto-switch back to Sei when leaving the bridge page
    useAutoSwitchToSei();

    return (
        <header className="fixed top-0 left-0 right-0 z-50">
            <div className="glass-header">
                <div className="container mx-auto px-3 md:px-6 py-2 md:py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo - text hidden on mobile */}
                        <Link href="/" className="flex items-center gap-2 md:gap-3">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-transform">
                                <img src="/logo.png" alt="Wind Swap" className="w-full h-full object-contain" />
                            </div>
                            <span className="hidden sm:inline text-lg md:text-xl font-bold gradient-text">Wind Swap</span>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-2">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`nav-link ${isActive ? 'nav-link-active' : ''}`}
                                    >
                                        {link.label}
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeNav"
                                                className="absolute inset-0 bg-primary/10 rounded-lg -z-10"
                                            />
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Wallet Connect */}
                        <WalletConnect />
                    </div>
                </div>
            </div>
        </header>
    );
}
