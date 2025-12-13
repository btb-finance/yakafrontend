'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { Token, DEFAULT_TOKEN_LIST, SEI, USDC } from '@/config/tokens';
import { TokenSelector } from '@/components/common/TokenSelector';
import { useLiquidity, usePool } from '@/hooks/useLiquidity';
import { useTokenBalance } from '@/hooks/useToken';

type Tab = 'add' | 'positions';

export default function LiquidityPage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<Tab>('add');

    // Add liquidity state
    const [tokenA, setTokenA] = useState<Token | undefined>(SEI);
    const [tokenB, setTokenB] = useState<Token | undefined>(USDC);
    const [amountA, setAmountA] = useState('');
    const [amountB, setAmountB] = useState('');
    const [stable, setStable] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState<'A' | 'B' | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    // Hooks
    const { addLiquidity, isLoading, error } = useLiquidity();
    const { balance: balanceA } = useTokenBalance(tokenA);
    const { balance: balanceB } = useTokenBalance(tokenB);
    const { poolAddress, exists: poolExists } = usePool(tokenA, tokenB, stable);

    const handleAddLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB) return;

        const result = await addLiquidity(tokenA, tokenB, amountA, amountB, stable);

        if (result) {
            setTxHash(result.hash);
            setAmountA('');
            setAmountB('');
        }
    };

    const canAdd = isConnected &&
        tokenA &&
        tokenB &&
        amountA &&
        amountB &&
        parseFloat(amountA) > 0 &&
        parseFloat(amountB) > 0;

    return (
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Liquidity</span> Management
                </h1>
                <p className="text-gray-400 max-w-lg mx-auto">
                    Provide liquidity to earn trading fees and YAKA emissions.
                </p>
            </motion.div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
                <div className="glass p-1 rounded-xl inline-flex">
                    <button
                        onClick={() => setActiveTab('add')}
                        className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'add'
                                ? 'bg-primary text-white'
                                : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Add Liquidity
                    </button>
                    <button
                        onClick={() => setActiveTab('positions')}
                        className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'positions'
                                ? 'bg-primary text-white'
                                : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        My Positions
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeTab === 'add' && (
                <motion.div
                    className="max-w-md mx-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-6">Add Liquidity</h2>

                        {/* Error Display */}
                        {error && (
                            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Success Display */}
                        {txHash && (
                            <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                                Liquidity added!{' '}
                                <a
                                    href={`https://seiscan.io/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                >
                                    View on SeiScan
                                </a>
                            </div>
                        )}

                        {/* Pool Type (Stable/Volatile) */}
                        <div className="mb-6">
                            <label className="text-sm text-gray-400 mb-2 block">Pool Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setStable(false)}
                                    className={`p-3 rounded-xl text-center transition ${!stable
                                            ? 'bg-primary/10 border border-primary/30 text-white'
                                            : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                        }`}
                                >
                                    Volatile
                                </button>
                                <button
                                    onClick={() => setStable(true)}
                                    className={`p-3 rounded-xl text-center transition ${stable
                                            ? 'bg-primary/10 border border-primary/30 text-white'
                                            : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                        }`}
                                >
                                    Stable
                                </button>
                            </div>
                        </div>

                        {/* Token A */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-gray-400">Token A</label>
                                <span className="text-sm text-gray-400">
                                    Balance: {balanceA ? parseFloat(balanceA).toFixed(4) : '--'}
                                </span>
                            </div>
                            <div className="token-input-row">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        value={amountA}
                                        onChange={(e) => setAmountA(e.target.value)}
                                        placeholder="0.0"
                                        className="flex-1 bg-transparent text-2xl font-medium outline-none placeholder-gray-600"
                                    />
                                    <button
                                        onClick={() => setSelectorOpen('A')}
                                        className="token-select"
                                    >
                                        {tokenA ? (
                                            <>
                                                <span className="font-semibold">{tokenA.symbol}</span>
                                            </>
                                        ) : (
                                            <span className="text-primary">Select</span>
                                        )}
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Plus Icon */}
                        <div className="flex justify-center my-2">
                            <div className="p-2 rounded-lg bg-white/5">
                                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                        </div>

                        {/* Token B */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-gray-400">Token B</label>
                                <span className="text-sm text-gray-400">
                                    Balance: {balanceB ? parseFloat(balanceB).toFixed(4) : '--'}
                                </span>
                            </div>
                            <div className="token-input-row">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        value={amountB}
                                        onChange={(e) => setAmountB(e.target.value)}
                                        placeholder="0.0"
                                        className="flex-1 bg-transparent text-2xl font-medium outline-none placeholder-gray-600"
                                    />
                                    <button
                                        onClick={() => setSelectorOpen('B')}
                                        className="token-select"
                                    >
                                        {tokenB ? (
                                            <>
                                                <span className="font-semibold">{tokenB.symbol}</span>
                                            </>
                                        ) : (
                                            <span className="text-primary">Select</span>
                                        )}
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Pool Info */}
                        {tokenA && tokenB && (
                            <div className="mb-6 p-3 rounded-xl bg-white/5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Pool</span>
                                    <span>{tokenA.symbol}/{tokenB.symbol} ({stable ? 'Stable' : 'Volatile'})</span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-gray-400">Status</span>
                                    <span className={poolExists ? 'text-green-400' : 'text-yellow-400'}>
                                        {poolExists ? 'Pool Exists' : 'New Pool'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Action Button */}
                        <motion.button
                            onClick={handleAddLiquidity}
                            disabled={!canAdd || isLoading}
                            className="w-full btn-primary py-4"
                            whileHover={canAdd ? { scale: 1.01 } : {}}
                            whileTap={canAdd ? { scale: 0.99 } : {}}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Adding Liquidity...
                                </span>
                            ) : !isConnected ? (
                                'Connect Wallet'
                            ) : !tokenA || !tokenB ? (
                                'Select Tokens'
                            ) : !amountA || !amountB ? (
                                'Enter Amounts'
                            ) : (
                                'Add Liquidity'
                            )}
                        </motion.button>
                    </div>
                </motion.div>
            )}

            {activeTab === 'positions' && (
                <motion.div
                    className="max-w-4xl mx-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    {!isConnected ? (
                        <div className="glass-card p-12 text-center">
                            <h3 className="text-xl font-semibold mb-2">Connect Wallet</h3>
                            <p className="text-gray-400 mb-6">Connect your wallet to view your positions</p>
                        </div>
                    ) : (
                        <div className="glass-card p-12 text-center">
                            <h3 className="text-xl font-semibold mb-2">Your Positions</h3>
                            <p className="text-gray-400 mb-6">
                                Your LP positions will appear here once you add liquidity.
                            </p>
                            <button
                                onClick={() => setActiveTab('add')}
                                className="btn-primary"
                            >
                                Add Liquidity
                            </button>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Token Selector Modal */}
            <TokenSelector
                isOpen={selectorOpen !== null}
                onClose={() => setSelectorOpen(null)}
                onSelect={(token) => {
                    if (selectorOpen === 'A') {
                        setTokenA(token);
                    } else {
                        setTokenB(token);
                    }
                    setSelectorOpen(null);
                }}
                selectedToken={selectorOpen === 'A' ? tokenA : tokenB}
                excludeToken={selectorOpen === 'A' ? tokenB : tokenA}
            />

            {/* Info Cards */}
            <motion.div
                className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-3">Volatile Pools</h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Standard AMM pools using the x*y=k formula. Best for uncorrelated assets with price volatility.
                    </p>
                    <ul className="text-sm text-gray-400 space-y-1">
                        <li>• Standard constant product formula</li>
                        <li>• Higher fees (typically 0.3%)</li>
                        <li>• Ideal for SEI/USDC, TOKEN/SEI pairs</li>
                    </ul>
                </div>

                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-3">Stable Pools</h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Optimized pools for correlated assets with minimal price deviation.
                    </p>
                    <ul className="text-sm text-gray-400 space-y-1">
                        <li>• Stable swap curve (x³y + y³x = k)</li>
                        <li>• Lower fees and slippage</li>
                        <li>• Ideal for USDC/USDT, stablecoins</li>
                    </ul>
                </div>
            </motion.div>
        </div>
    );
}
