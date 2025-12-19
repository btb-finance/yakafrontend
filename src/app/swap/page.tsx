'use client';

import { motion } from 'framer-motion';
import { SwapInterface } from '@/components/swap/SwapInterface';

export default function SwapPage() {
    return (
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Swap</span> Tokens
                </h1>
                <p className="text-gray-400 max-w-lg mx-auto">
                    Trade tokens instantly with low slippage using Wind Swap V2 and Slipstream pools.
                </p>
            </motion.div>

            {/* Swap Interface */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <SwapInterface />
            </motion.div>
        </div>
    );
}
