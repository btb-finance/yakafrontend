'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Token } from '@/config/tokens';
import { TokenSelector } from '@/components/common/TokenSelector';

interface TokenInputProps {
    label: string;
    token?: Token;
    amount: string;
    onAmountChange: (amount: string) => void;
    onTokenSelect: (token: Token) => void;
    excludeToken?: Token;
    disabled?: boolean;
    showMaxButton?: boolean;
    balance?: string;
    rawBalance?: string; // Full precision for MAX button
    usdValue?: string;
}

export function TokenInput({
    label,
    token,
    amount,
    onAmountChange,
    onTokenSelect,
    excludeToken,
    disabled = false,
    showMaxButton = false,
    balance = '--',
    rawBalance,
    usdValue,
}: TokenInputProps) {
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Only allow numbers and decimals
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            onAmountChange(value);
        }
    };

    const handleMax = () => {
        // Use rawBalance (full precision) if available, fallback to balance
        const maxValue = rawBalance || balance;
        if (maxValue && maxValue !== '--' && maxValue !== '0') {
            onAmountChange(maxValue);
        }
    };

    return (
        <>
            <div className="token-input-row">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">{label}</span>
                    <span className="text-sm text-gray-400">
                        Balance: {balance}
                        {showMaxButton && balance !== '--' && (
                            <button
                                onClick={handleMax}
                                className="ml-2 text-primary hover:text-primary/80 font-medium"
                            >
                                MAX
                            </button>
                        )}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={handleAmountChange}
                        placeholder="0.0"
                        disabled={disabled}
                        className="flex-1 min-w-0 bg-transparent text-xl md:text-2xl font-medium outline-none placeholder-gray-600"
                    />

                    <motion.button
                        onClick={() => setIsSelectorOpen(true)}
                        className="token-select"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {token ? (
                            <>
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                                    {token.logoURI ? (
                                        <img
                                            src={token.logoURI}
                                            alt={token.symbol}
                                            className="w-5 h-5 rounded-full"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <span className="text-xs font-bold">{token.symbol[0]}</span>
                                    )}
                                </div>
                                <span>{token.symbol}</span>
                            </>
                        ) : (
                            <span className="text-primary">Select</span>
                        )}
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                    </motion.button>
                </div>

                {usdValue && (
                    <div className="mt-2 text-sm text-gray-500">≈ ${usdValue}</div>
                )}
            </div>

            <TokenSelector
                isOpen={isSelectorOpen}
                onClose={() => setIsSelectorOpen(false)}
                onSelect={onTokenSelect}
                selectedToken={token}
                excludeToken={excludeToken}
            />
        </>
    );
}
