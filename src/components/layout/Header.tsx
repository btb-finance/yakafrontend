'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { motion, AnimatePresence } from 'framer-motion';
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Auto-switch back to Sei when leaving the bridge page
    useAutoSwitchToSei();

    return (
        <header className="fixed top-0 left-0 right-0 z-50">
            <div className="glass-header">
                <div className="container mx-auto px-4 md:px-6 py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2 md:gap-3">
                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-transform">
                                <img src="/logo.png" alt="Wind Swap" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-lg md:text-xl font-bold gradient-text">Wind Swap</span>
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

                        {/* Right side: Wallet + Mobile Menu */}
                        <div className="flex items-center gap-2">
                            <WalletConnect />

                            {/* Mobile Hamburger Button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-2 rounded-lg hover:bg-white/10 transition"
                                aria-label="Toggle menu"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {mobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Drawer */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm md:hidden"
                            onClick={() => setMobileMenuOpen(false)}
                        />

                        {/* Menu Panel */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-64 bg-[var(--bg-secondary)] border-l border-white/10 md:hidden"
                        >
                            <div className="p-6 pt-20">
                                <nav className="flex flex-col gap-2">
                                    {navLinks.map((link) => {
                                        const isActive = pathname === link.href;
                                        return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className={`px-4 py-3 rounded-xl font-medium transition-all ${isActive
                                                    ? 'bg-gradient-to-r from-primary to-secondary text-white'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                                    }`}
                                            >
                                                {link.label}
                                            </Link>
                                        );
                                    })}
                                </nav>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </header>
    );
}
