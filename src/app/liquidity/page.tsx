'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits, Address, maxUint256, formatUnits } from 'viem';
import Link from 'next/link';
import { Token, DEFAULT_TOKEN_LIST, SEI, WSEI, USDC } from '@/config/tokens';
import { CL_CONTRACTS, V2_CONTRACTS, COMMON } from '@/config/contracts';
import { TokenSelector } from '@/components/common/TokenSelector';
import { useLiquidity, usePool } from '@/hooks/useLiquidity';
import { useTokenBalance } from '@/hooks/useToken';
import { useCLPositions, useV2Positions } from '@/hooks/usePositions';
import { NFT_POSITION_MANAGER_ABI, ERC20_ABI, CL_FACTORY_ABI } from '@/config/abis';

type Tab = 'add' | 'positions';
type PoolType = 'v2' | 'cl';

export default function LiquidityPage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<Tab>('add');
    const [poolType, setPoolType] = useState<PoolType>('v2');

    // Add liquidity state
    const [tokenA, setTokenA] = useState<Token | undefined>(SEI);
    const [tokenB, setTokenB] = useState<Token | undefined>(USDC);
    const [amountA, setAmountA] = useState('');
    const [amountB, setAmountB] = useState('');
    const [stable, setStable] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState<'A' | 'B' | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    // CL specific state
    const [tickSpacing, setTickSpacing] = useState(100); // Default tick spacing
    const [priceLower, setPriceLower] = useState('');
    const [priceUpper, setPriceUpper] = useState('');

    // Hooks
    const { addLiquidity, isLoading, error } = useLiquidity();
    const { balance: balanceA } = useTokenBalance(tokenA);
    const { balance: balanceB } = useTokenBalance(tokenB);
    const { poolAddress, exists: poolExists } = usePool(tokenA, tokenB, stable);
    const { positions: clPositions, refetch: refetchCL } = useCLPositions();
    const { positions: v2Positions, refetch: refetchV2 } = useV2Positions();

    const { writeContractAsync } = useWriteContract();

    // Handle V2 liquidity add
    const handleAddLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB) return;

        const result = await addLiquidity(tokenA, tokenB, amountA, amountB, stable);

        if (result) {
            setTxHash(result.hash);
            setAmountA('');
            setAmountB('');
            refetchV2();
        }
    };

    // Handle CL liquidity add
    const handleAddCLLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB || !address) return;

        try {
            // For CL pools, we need to use WSEI instead of native SEI
            const actualTokenA = tokenA.isNative ? WSEI : tokenA;
            const actualTokenB = tokenB.isNative ? WSEI : tokenB;

            // Sort tokens by address (token0 < token1)
            const isAFirst = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase();
            const token0 = isAFirst ? actualTokenA : actualTokenB;
            const token1 = isAFirst ? actualTokenB : actualTokenA;
            const amount0 = isAFirst ? amountA : amountB;
            const amount1 = isAFirst ? amountB : amountA;
            const amount0Wei = parseUnits(amount0, token0.decimals);
            const amount1Wei = parseUnits(amount1, token1.decimals);

            // Calculate tick values (full range for the selected tick spacing)
            const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing;
            const tickLower = -maxTick;
            const tickUpper = maxTick;

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Check if pool exists by calling CLFactory.getPool
            // We'll make a raw eth_call to check
            const poolCheckData = `0x79a4dc41${token0.address.slice(2).padStart(64, '0')}${token1.address.slice(2).padStart(64, '0')}${(tickSpacing >= 0 ? tickSpacing.toString(16) : (0xFFFFFFFF + tickSpacing + 1).toString(16)).padStart(64, '0')}`;

            let poolExists = false;
            try {
                const poolResult = await (window as any).ethereum?.request({
                    method: 'eth_call',
                    params: [{
                        to: CL_CONTRACTS.CLFactory,
                        data: poolCheckData
                    }, 'latest']
                });
                // If result is not zero address, pool exists
                poolExists = poolResult && poolResult !== '0x0000000000000000000000000000000000000000000000000000000000000000';
            } catch {
                // If check fails, assume pool doesn't exist
                poolExists = false;
            }

            // If pool exists, use sqrtPriceX96 = 0 (skip createPool)
            // If pool doesn't exist, calculate sqrtPriceX96 from amounts to create it
            let sqrtPriceX96 = BigInt(0);
            if (!poolExists) {
                const price = Number(amount1Wei) / Number(amount0Wei);
                const sqrtPrice = Math.sqrt(price);
                // 2^96 = 79228162514264337593543950336
                sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * 79228162514264337593543950336));
            }

            // Mint position (will create pool if sqrtPriceX96 != 0 and pool doesn't exist)
            const hash = await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'mint',
                args: [{
                    token0: token0.address as Address,
                    token1: token1.address as Address,
                    tickSpacing,
                    tickLower,
                    tickUpper,
                    amount0Desired: amount0Wei,
                    amount1Desired: amount1Wei,
                    amount0Min: BigInt(0),
                    amount1Min: BigInt(0),
                    recipient: address,
                    deadline,
                    sqrtPriceX96,
                }],
            });

            setTxHash(hash);
            setAmountA('');
            setAmountB('');
            refetchCL();
        } catch (err: any) {
            console.error('CL mint error:', err);
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
                        My Positions ({v2Positions.length + clPositions.length})
                    </button>
                </div>
            </div>

            {/* Add Liquidity Tab */}
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
                                    href={`https://seitrace.com/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                >
                                    View on SeiTrace
                                </a>
                            </div>
                        )}

                        {/* Pool Type Selection */}
                        <div className="mb-6">
                            <label className="text-sm text-gray-400 mb-2 block">Pool Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setPoolType('v2')}
                                    className={`p-3 rounded-xl text-center transition ${poolType === 'v2'
                                        ? 'bg-primary/10 border border-primary/30 text-white'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="font-semibold">V2 Pool</div>
                                    <div className="text-xs text-gray-400">Classic AMM</div>
                                </button>
                                <button
                                    onClick={() => setPoolType('cl')}
                                    className={`p-3 rounded-xl text-center transition ${poolType === 'cl'
                                        ? 'bg-secondary/10 border border-secondary/30 text-white'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="font-semibold">CL Pool</div>
                                    <div className="text-xs text-gray-400">Concentrated</div>
                                </button>
                            </div>
                        </div>

                        {/* V2 Stable/Volatile Toggle */}
                        {poolType === 'v2' && (
                            <div className="mb-6">
                                <label className="text-sm text-gray-400 mb-2 block">Pool Curve</label>
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
                        )}

                        {/* CL Tick Spacing */}
                        {poolType === 'cl' && (
                            <div className="mb-6">
                                <label className="text-sm text-gray-400 mb-2 block">Fee Tier</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { spacing: 1, fee: '0.01%' },
                                        { spacing: 50, fee: '0.05%' },
                                        { spacing: 100, fee: '0.30%' },
                                    ].map(({ spacing, fee }) => (
                                        <button
                                            key={spacing}
                                            onClick={() => setTickSpacing(spacing)}
                                            className={`p-2 rounded-lg text-center text-sm transition ${tickSpacing === spacing
                                                ? 'bg-secondary/10 border border-secondary/30 text-white'
                                                : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            {fee}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

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
                                    <button onClick={() => setSelectorOpen('A')} className="token-select">
                                        {tokenA ? <span className="font-semibold">{tokenA.symbol}</span> : <span className="text-primary">Select</span>}
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
                                    <button onClick={() => setSelectorOpen('B')} className="token-select">
                                        {tokenB ? <span className="font-semibold">{tokenB.symbol}</span> : <span className="text-primary">Select</span>}
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
                                    <span>{tokenA.symbol}/{tokenB.symbol}</span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-gray-400">Type</span>
                                    <span>{poolType === 'cl' ? 'Concentrated' : stable ? 'Stable' : 'Volatile'}</span>
                                </div>
                            </div>
                        )}

                        {/* Action Button */}
                        <motion.button
                            onClick={poolType === 'cl' ? handleAddCLLiquidity : handleAddLiquidity}
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
                                `Add ${poolType === 'cl' ? 'CL' : 'V2'} Liquidity`
                            )}
                        </motion.button>
                    </div>
                </motion.div>
            )}

            {/* Positions Tab */}
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
                    ) : v2Positions.length === 0 && clPositions.length === 0 ? (
                        <div className="glass-card p-12 text-center">
                            <h3 className="text-xl font-semibold mb-2">No Positions Found</h3>
                            <p className="text-gray-400 mb-6">
                                You don't have any LP positions yet.
                            </p>
                            <button onClick={() => setActiveTab('add')} className="btn-primary">
                                Add Liquidity
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* V2 Positions */}
                            {v2Positions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">V2 Positions</h3>
                                    <div className="space-y-3">
                                        {v2Positions.map((pos, i) => (
                                            <div key={i} className="glass-card p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                                                                ?
                                                            </div>
                                                            <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-sm font-bold absolute -right-2 top-0 border-2 border-bg-primary">
                                                                ?
                                                            </div>
                                                        </div>
                                                        <div className="ml-2">
                                                            <div className="font-semibold text-sm">
                                                                Pool ({pos.stable ? 'Stable' : 'Volatile'})
                                                            </div>
                                                            <div className="text-xs text-gray-400 font-mono">
                                                                {pos.poolAddress.slice(0, 10)}...
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-semibold text-sm">
                                                            {formatUnits(pos.lpBalance, 18).slice(0, 10)} LP
                                                        </div>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                                            V2
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* CL Positions */}
                            {clPositions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-4 mt-6">Concentrated Positions</h3>
                                    <div className="space-y-3">
                                        {clPositions.map((pos, i) => (
                                            <div key={i} className="glass-card p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-sm font-bold">
                                                                ?
                                                            </div>
                                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold absolute -right-2 top-0 border-2 border-bg-primary">
                                                                ?
                                                            </div>
                                                        </div>
                                                        <div className="ml-2">
                                                            <div className="font-semibold text-sm">
                                                                NFT #{pos.tokenId.toString()}
                                                            </div>
                                                            <div className="text-xs text-gray-400">
                                                                Tick: {pos.tickLower} → {pos.tickUpper}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-semibold text-sm">
                                                            {pos.liquidity.toString().slice(0, 8)}...
                                                        </div>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary">
                                                            CL
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
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
                        // For CL pools, replace SEI with WSEI
                        if (poolType === 'cl' && token.isNative) {
                            setTokenA(WSEI);
                        } else {
                            setTokenA(token);
                        }
                    } else {
                        if (poolType === 'cl' && token.isNative) {
                            setTokenB(WSEI);
                        } else {
                            setTokenB(token);
                        }
                    }
                    setSelectorOpen(null);
                }}
                selectedToken={selectorOpen === 'A' ? tokenA : tokenB}
                excludeToken={selectorOpen === 'A' ? tokenB : tokenA}
            />
        </div>
    );
}
