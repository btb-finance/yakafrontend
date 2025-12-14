'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { motion } from 'framer-motion';

const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/swap', label: 'Swap' },
    { href: '/liquidity', label: 'Liquidity' },
    { href: '/pools', label: 'Pools' },
    { href: '/vote', label: 'Vote' },
];

export function Header() {
    const pathname = usePathname();

    return (
        <header className="fixed top-0 left-0 right-0 z-50">
            <div className="glass-header">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3">
                            <motion.div
                                className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <span className="text-white font-bold text-lg">Y</span>
                            </motion.div>
                            <span className="text-xl font-bold gradient-text">YAKA</span>
                        </Link>

                        {/* Navigation */}
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
