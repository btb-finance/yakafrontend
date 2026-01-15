'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useBridge } from '@/hooks/useBridge';

export function BridgeInterface() {
    const { isConnected } = useAccount();
    const {
        direction,
        setDirection,
        selectedToken,
        setSelectedToken,
        availableTokens,
        sourceChain,
        destChain,
        balance,
        gasQuote,
        checkNeedsApproval,
        isLoading,
        isApproving,
        isBridging,
        error,
        txHash,
        approve,
        bridge,
    } = useBridge();

    const [amount, setAmount] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [showTokenSelect, setShowTokenSelect] = useState(false);

    const handleDirectionSwitch = () => {
        setDirection(direction === 'base-to-sei' ? 'sei-to-base' : 'base-to-sei');
        setAmount('');
    };

    const handleMax = () => {
        setAmount(balance);
    };

    const needsApproval = checkNeedsApproval(amount);

    const handleBridge = async () => {
        if (!amount || parseFloat(amount) <= 0) return;

        if (needsApproval) {
            await approve(amount);
        } else {
            await bridge(amount);
            if (!error) {
                setShowSuccess(true);
                setAmount('');
                setTimeout(() => setShowSuccess(false), 15000);
            }
        }
    };

    const isInsufficientBalance = parseFloat(amount) > parseFloat(balance);
    const canBridge = isConnected && amount && parseFloat(amount) > 0 && !isInsufficientBalance;

    return (
        <div className="swap-card max-w-md mx-auto">
            {/* Header - Compact like Swap */}
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-bold">Bridge</h2>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary/20 text-primary">
                    via Hyperlane
                </span>
            </div>

            {/* Error Display - Compact */}
            {error && (
                <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    {error.includes('User rejected') || error.includes('user rejected')
                        ? 'Transaction cancelled'
                        : error.length > 50
                            ? error.slice(0, 50) + '...'
                            : error}
                </div>
            )}

            {/* Success Display */}
            {showSuccess && txHash && (
                <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
                    <div className="font-medium mb-1">Bridge submitted!</div>
                    <a
                        href={`https://explorer.hyperlane.xyz/?search=${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        Track on Hyperlane →
                    </a>
                </div>
            )}

            {/* Source Chain - Token Input */}
            <div className="token-input-row">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">You pay</span>
                    <div className="flex items-center gap-2">
                        <img
                            src={sourceChain.logoURI}
                            alt={sourceChain.name}
                            className="w-4 h-4 rounded-full"
                        />
                        <span className="text-sm text-gray-400">{sourceChain.name}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={amount}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (/^\d*\.?\d*$/.test(val)) {
                                setAmount(val);
                            }
                        }}
                        placeholder="0.0"
                        className="flex-1 min-w-0 bg-transparent text-xl md:text-2xl font-medium outline-none placeholder-gray-600"
                    />
                    <motion.button
                        onClick={() => setShowTokenSelect(!showTokenSelect)}
                        className="token-select"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                            <img
                                src={selectedToken.logoURI}
                                alt={selectedToken.symbol}
                                className="w-5 h-5 rounded-full"
                            />
                        </div>
                        <span>{selectedToken.symbol}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </motion.button>
                </div>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-400">
                        Balance: {parseFloat(balance).toFixed(selectedToken.decimals > 6 ? 8 : 6)}
                        <button
                            onClick={handleMax}
                            className="ml-2 text-primary hover:text-primary/80 font-medium"
                        >
                            MAX
                        </button>
                    </span>
                    {isInsufficientBalance && (
                        <span className="text-xs text-red-400">Insufficient balance</span>
                    )}
                </div>
            </div>

            {/* Token Dropdown */}
            {showTokenSelect && (
                <div className="mt-2 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-xl p-2 z-50">
                    {availableTokens.map((token) => (
                        <button
                            key={token.symbol}
                            onClick={() => {
                                setSelectedToken(token);
                                setShowTokenSelect(false);
                                setAmount('');
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--glass-hover)] transition ${token.symbol === selectedToken.symbol ? 'bg-[var(--glass-bg)]' : ''
                                }`}
                        >
                            <img
                                src={token.logoURI}
                                alt={token.symbol}
                                className="w-8 h-8 rounded-full"
                            />
                            <div className="text-left">
                                <div className="font-medium">{token.symbol}</div>
                                <div className="text-xs text-gray-500">{token.name}</div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Swap Direction Button */}
            <div className="relative h-0 flex items-center justify-center z-10">
                <motion.button
                    onClick={handleDirectionSwitch}
                    className="swap-arrow-btn"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                </motion.button>
            </div>

            {/* Destination Chain - Token Output */}
            <div className="token-input-row">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">You receive</span>
                    <div className="flex items-center gap-2">
                        <img
                            src={destChain.logoURI}
                            alt={destChain.name}
                            className="w-4 h-4 rounded-full"
                        />
                        <span className="text-sm text-gray-400">{destChain.name}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="flex-1 text-xl md:text-2xl font-medium text-gray-500">
                        {amount || '0.0'}
                    </span>
                    <div className="token-select opacity-60">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                            <img
                                src={selectedToken.logoURI}
                                alt={selectedToken.symbol}
                                className="w-5 h-5 rounded-full"
                            />
                        </div>
                        <span>{selectedToken.symbol}</span>
                    </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                    1:1 bridge rate (no slippage)
                </div>
            </div>

            {/* Rate Info - Compact */}
            <div className="mt-3 p-2 rounded-lg bg-white/5 text-xs space-y-1">
                <div className="flex justify-between">
                    <span className="text-gray-400">Interchain Gas</span>
                    <span>~{parseFloat(gasQuote).toFixed(6)} {sourceChain.nativeCurrency}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Est. Time</span>
                    <span>~1-5 minutes</span>
                </div>
            </div>

            {/* Bridge Button */}
            <button
                onClick={handleBridge}
                disabled={!canBridge || isApproving || isBridging || isLoading}
                className="w-full btn-primary py-4 text-base mt-4 disabled:opacity-50"
            >
                {!isConnected
                    ? 'Connect Wallet'
                    : isLoading
                        ? 'Loading...'
                        : isApproving
                            ? 'Approving...'
                            : isBridging
                                ? 'Bridging...'
                                : isInsufficientBalance
                                    ? 'Insufficient Balance'
                                    : needsApproval
                                        ? `Approve ${selectedToken.symbol}`
                                        : `Bridge to ${destChain.name}`}
            </button>

            <div className="mt-3 text-center text-[10px] text-gray-500">
                Powered by <a href="https://hyperlane.xyz" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Hyperlane</a>
            </div>
        </div>
    );
}
