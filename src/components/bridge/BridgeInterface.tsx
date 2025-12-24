'use client';

import { useState } from 'react';
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
        needsApproval,
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

    const handleBridge = async () => {
        if (!amount || parseFloat(amount) <= 0) return;

        if (needsApproval) {
            await approve();
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
        <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold gradient-text mb-2">Bridge</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                    Transfer tokens between Base and Sei via Hyperlane
                </p>
            </div>

            {/* Bridge Card */}
            <div className="swap-card">
                {/* Source Chain */}
                <div className="token-input-row mb-2">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-[var(--text-muted)]">From</span>
                        <div className="flex items-center gap-2">
                            <img
                                src={sourceChain.logoURI}
                                alt={sourceChain.name}
                                className="w-5 h-5 rounded-full"
                            />
                            <span className="text-sm font-medium">{sourceChain.name}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                            className="flex-1 bg-transparent text-xl font-medium outline-none"
                        />
                        <button
                            onClick={handleMax}
                            className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] font-medium"
                        >
                            MAX
                        </button>
                        {/* Token Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setShowTokenSelect(!showTokenSelect)}
                                className="token-select"
                            >
                                <img
                                    src={selectedToken.logoURI}
                                    alt={selectedToken.symbol}
                                    className="w-6 h-6 rounded-full"
                                />
                                <span>{selectedToken.symbol}</span>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {showTokenSelect && (
                                <div className="absolute right-0 top-full mt-2 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-xl p-2 min-w-[180px] z-50">
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
                                                <div className="text-xs text-[var(--text-muted)]">{token.name}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-xs text-[var(--text-muted)]">
                        <span>Balance: {parseFloat(balance).toFixed(selectedToken.decimals > 6 ? 8 : 6)} {selectedToken.symbol}</span>
                        {isInsufficientBalance && (
                            <span className="text-[var(--error)]">Insufficient balance</span>
                        )}
                    </div>
                </div>

                {/* Switch Button */}
                <div className="flex justify-center -my-3 z-10 relative">
                    <button
                        onClick={handleDirectionSwitch}
                        className="swap-arrow-btn"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                    </button>
                </div>

                {/* Destination Chain */}
                <div className="token-input-row mt-2">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-[var(--text-muted)]">To</span>
                        <div className="flex items-center gap-2">
                            <img
                                src={destChain.logoURI}
                                alt={destChain.name}
                                className="w-5 h-5 rounded-full"
                            />
                            <span className="text-sm font-medium">{destChain.name}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex-1 text-xl font-medium text-[var(--text-secondary)]">
                            {amount || '0.0'}
                        </span>
                        <div className="token-select opacity-60">
                            <img
                                src={selectedToken.logoURI}
                                alt={selectedToken.symbol}
                                className="w-6 h-6 rounded-full"
                            />
                            <span>{selectedToken.symbol}</span>
                        </div>
                    </div>
                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                        You will receive: {amount || '0'} {selectedToken.symbol}
                    </div>
                </div>

                {/* Gas Info */}
                <div className="mt-4 p-3 bg-[var(--bg-secondary)] rounded-xl">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-[var(--text-muted)]">Interchain Gas Fee</span>
                        <span className="font-medium">
                            ~{parseFloat(gasQuote).toFixed(6)} {sourceChain.nativeCurrency}
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-1">
                        <span className="text-[var(--text-muted)]">Estimated Time</span>
                        <span className="font-medium">~1-5 minutes</span>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mt-4 p-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-xl text-sm text-[var(--error)]">
                        {error}
                    </div>
                )}

                {/* Success Display */}
                {showSuccess && txHash && (
                    <div className="mt-4 p-3 bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-xl">
                        <div className="text-sm text-[var(--success)] font-medium mb-2">
                            ✓ Bridge transaction submitted!
                        </div>
                        <div className="flex flex-col gap-1">
                            <a
                                href={`https://explorer.hyperlane.xyz/?search=${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
                            >
                                <span>🔗</span> Track on Hyperlane Explorer →
                            </a>
                            <a
                                href={`${sourceChain.explorer}/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[var(--text-muted)] hover:underline"
                            >
                                View on {sourceChain.name} Explorer →
                            </a>
                        </div>
                    </div>
                )}

                {/* Bridge Button */}
                <button
                    onClick={handleBridge}
                    disabled={!canBridge || isApproving || isBridging || isLoading}
                    className="btn-primary w-full mt-4 py-4 text-lg font-semibold"
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

                {/* Powered By */}
                <div className="mt-4 text-center text-xs text-[var(--text-muted)]">
                    Powered by <a href="https://hyperlane.xyz" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">Hyperlane</a>
                </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 info-card">
                <div className="flex items-start gap-3">
                    <span className="text-xl">🔐</span>
                    <div>
                        <div className="font-medium text-sm mb-1">Trustless Bridge</div>
                        <div className="text-xs text-[var(--text-secondary)]">
                            This bridge uses Hyperlane&apos;s permissionless messaging. Ownership has been renounced - no one can modify the bridge.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
