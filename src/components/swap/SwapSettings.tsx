'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface SwapSettingsProps {
    slippage: number;
    deadline: number;
    onSlippageChange: (slippage: number) => void;
    onDeadlineChange: (deadline: number) => void;
}

export function SwapSettings({
    slippage,
    deadline,
    onSlippageChange,
    onDeadlineChange,
}: SwapSettingsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [customSlippage, setCustomSlippage] = useState('');

    const slippagePresets = [0.5, 1.0, 3.0];

    const handleCustomSlippage = (value: string) => {
        setCustomSlippage(value);
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0 && num <= 50) {
            onSlippageChange(num);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-lg hover:bg-white/5 transition"
                title="Settings"
            >
                <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
            </button>

            {isOpen && (
                <motion.div
                    className="absolute right-0 top-12 w-72 glass-card p-4 z-50"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Settings</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 rounded hover:bg-white/5"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Slippage Tolerance */}
                    <div className="mb-4">
                        <label className="text-sm text-gray-400 mb-2 block">
                            Slippage Tolerance
                        </label>
                        <div className="flex gap-2">
                            {slippagePresets.map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => {
                                        onSlippageChange(preset);
                                        setCustomSlippage('');
                                    }}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${slippage === preset && !customSlippage
                                        ? 'bg-primary text-white'
                                        : 'bg-white/5 hover:bg-white/10'
                                        }`}
                                >
                                    {preset}%
                                </button>
                            ))}
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={customSlippage}
                                    onChange={(e) => handleCustomSlippage(e.target.value)}
                                    placeholder="Custom"
                                    className="w-full py-2 px-3 rounded-lg bg-white/5 text-sm text-center outline-none focus:ring-1 focus:ring-primary"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                                    %
                                </span>
                            </div>
                        </div>
                        {slippage > 5 && (
                            <p className="text-xs text-warning mt-2">
                                High slippage: Transaction may be frontrun
                            </p>
                        )}
                    </div>

                    {/* Transaction Deadline */}
                    <div>
                        <label className="text-sm text-gray-400 mb-2 block">
                            Transaction Deadline
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={deadline}
                                onChange={(e) => onDeadlineChange(parseInt(e.target.value) || 30)}
                                min={1}
                                max={60}
                                className="flex-1 py-2 px-3 rounded-lg bg-white/5 text-sm outline-none focus:ring-1 focus:ring-primary"
                            />
                            <span className="text-sm text-gray-400">minutes</span>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
