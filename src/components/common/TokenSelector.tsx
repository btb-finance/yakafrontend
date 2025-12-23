'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Token, DEFAULT_TOKEN_LIST } from '@/config/tokens';
import { useUserBalances } from '@/providers/UserBalanceProvider';
import { getPrimaryRpc } from '@/utils/rpc';

interface TokenSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (token: Token) => void;
    selectedToken?: Token;
    excludeToken?: Token;
}

// Helper to check if string is a valid Ethereum address
const isValidAddress = (value: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
};

// Fetch token info from chain
async function fetchTokenInfo(address: string): Promise<Token | null> {
    try {
        // Prepare calldata for symbol(), name(), decimals()
        const symbolSelector = '0x95d89b41';
        const nameSelector = '0x06fdde03';
        const decimalsSelector = '0x313ce567';

        const [symbolResult, nameResult, decimalsResult] = await Promise.all([
            fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{ to: address, data: symbolSelector }, 'latest'],
                    id: 1,
                }),
            }).then(r => r.json()),
            fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{ to: address, data: nameSelector }, 'latest'],
                    id: 2,
                }),
            }).then(r => r.json()),
            fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{ to: address, data: decimalsSelector }, 'latest'],
                    id: 3,
                }),
            }).then(r => r.json()),
        ]);

        // Decode string results (skip first 64 chars for offset, next 64 for length, rest is data)
        const decodeString = (hex: string): string => {
            if (!hex || hex === '0x' || hex.length < 130) return '';
            try {
                const lengthHex = hex.slice(66, 130);
                const length = parseInt(lengthHex, 16);
                const dataHex = hex.slice(130, 130 + length * 2);
                return Buffer.from(dataHex, 'hex').toString('utf8').replace(/\0/g, '').trim();
            } catch {
                return '';
            }
        };

        const symbol = decodeString(symbolResult.result);
        const name = decodeString(nameResult.result);
        const decimals = decimalsResult.result ? parseInt(decimalsResult.result, 16) : 18;

        if (!symbol) return null;

        return {
            address: address as `0x${string}`,
            symbol,
            name: name || symbol,
            decimals,
        };
    } catch (error) {
        console.error('Error fetching token info:', error);
        return null;
    }
}

export function TokenSelector({
    isOpen,
    onClose,
    onSelect,
    selectedToken,
    excludeToken,
}: TokenSelectorProps) {
    const [search, setSearch] = useState('');
    const [filteredTokens, setFilteredTokens] = useState(DEFAULT_TOKEN_LIST);
    const [customToken, setCustomToken] = useState<Token | null>(null);
    const [loadingCustom, setLoadingCustom] = useState(false);
    const [customError, setCustomError] = useState<string | null>(null);

    // Get global balances (sorted by balance)
    const { sortedTokens, getBalance } = useUserBalances();

    // Fetch custom token when valid address is entered
    const fetchCustomToken = useCallback(async (addr: string) => {
        if (!isValidAddress(addr)) {
            setCustomToken(null);
            setCustomError(null);
            return;
        }

        // Check if it's already in the list
        const existing = DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === addr.toLowerCase());
        if (existing) {
            setCustomToken(null);
            setCustomError(null);
            return;
        }

        setLoadingCustom(true);
        setCustomError(null);
        try {
            const token = await fetchTokenInfo(addr);
            if (token) {
                setCustomToken(token);
            } else {
                setCustomError('Could not fetch token info');
            }
        } catch {
            setCustomError('Failed to load token');
        }
        setLoadingCustom(false);
    }, []);

    useEffect(() => {
        // Use sortedTokens (tokens with balance first)
        const filtered = sortedTokens.filter((token) => {
            // Exclude the already selected token in the other input
            if (excludeToken && token.address === excludeToken.address) return false;

            // Filter by search
            if (search) {
                const searchLower = search.toLowerCase();
                return (
                    token.symbol.toLowerCase().includes(searchLower) ||
                    token.name.toLowerCase().includes(searchLower) ||
                    token.address.toLowerCase().includes(searchLower)
                );
            }
            return true;
        });
        setFilteredTokens(filtered);

        // Try to fetch custom token if search looks like an address
        if (isValidAddress(search)) {
            fetchCustomToken(search);
        } else {
            setCustomToken(null);
            setCustomError(null);
        }
    }, [search, excludeToken, fetchCustomToken, sortedTokens]);

    const handleSelect = (token: Token) => {
        onSelect(token);
        onClose();
        setSearch('');
        setCustomToken(null);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                {/* Backdrop */}
                <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                />

                {/* Modal */}
                <motion.div
                    className="relative w-full max-w-md mx-4"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                >
                    <div className="glass-card p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold">Select Token</h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/5 transition"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Search */}
                        <div className="mb-4">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name or paste address"
                                className="input-field text-base"
                            />
                        </div>

                        {/* Custom Token Import */}
                        {loadingCustom && (
                            <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20">
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    <span className="text-sm">Loading token info...</span>
                                </div>
                            </div>
                        )}

                        {customError && (
                            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                                <p className="text-sm text-red-400">{customError}</p>
                            </div>
                        )}

                        {customToken && (
                            <div className="mb-4 p-1 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30">
                                <button
                                    onClick={() => handleSelect(customToken)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500/30 to-orange-500/30 flex items-center justify-center">
                                        <span className="text-lg font-bold text-yellow-400">{customToken.symbol[0]}</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">{customToken.symbol}</p>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Import</span>
                                        </div>
                                        <p className="text-sm text-gray-400">{customToken.name}</p>
                                        <p className="text-xs text-gray-500 font-mono">{customToken.address.slice(0, 10)}...{customToken.address.slice(-8)}</p>
                                    </div>
                                </button>
                            </div>
                        )}

                        {/* Token List */}
                        <div
                            className="max-h-[50vh] md:max-h-72 overflow-y-scroll space-y-2 overscroll-contain"
                            style={{
                                WebkitOverflowScrolling: 'touch',
                                touchAction: 'pan-y',
                                overscrollBehavior: 'contain'
                            }}
                        >
                            {filteredTokens.length === 0 && !customToken ? (
                                <div className="text-center py-8 text-gray-400">
                                    {isValidAddress(search) ? 'Checking address...' : 'No tokens found'}
                                </div>
                            ) : (
                                filteredTokens.map((token) => (
                                    <button
                                        key={token.address}
                                        onClick={() => handleSelect(token)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition hover:bg-white/5 ${selectedToken?.address === token.address
                                            ? 'bg-primary/10 border border-primary/30'
                                            : ''
                                            }`}
                                    >
                                        {/* Token Icon */}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                                            {token.logoURI ? (
                                                <img
                                                    src={token.logoURI}
                                                    alt={token.symbol}
                                                    className="w-8 h-8 rounded-full"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <span className="text-lg font-bold">{token.symbol[0]}</span>
                                            )}
                                        </div>

                                        {/* Token Info */}
                                        <div className="flex-1 text-left">
                                            <p className="font-semibold">{token.symbol}</p>
                                            <p className="text-sm text-gray-400">{token.name}</p>
                                        </div>

                                        {/* Balance */}
                                        {(() => {
                                            const balanceInfo = getBalance(token.address);
                                            const bal = balanceInfo?.formatted || '0';
                                            const numBal = parseFloat(bal);
                                            return numBal > 0 ? (
                                                <p className="text-sm text-white font-medium">
                                                    {numBal > 1000 ? numBal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : numBal.toFixed(4)}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-500">0</p>
                                            );
                                        })()}
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Help Text */}
                        <div className="mt-4 pt-4 border-t border-white/5 text-center">
                            <p className="text-sm text-gray-400">
                                Paste a token contract address to import any ERC-20 token
                            </p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

