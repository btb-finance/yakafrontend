'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { formatUnits, Address } from 'viem';
import { usePoolData } from '@/providers/PoolDataProvider';
import { Tooltip } from '@/components/common/Tooltip';
import { EmptyState } from '@/components/common/InfoCard';

// Lazy load AddLiquidityModal - only loads when user opens it
const AddLiquidityModal = dynamic(
    () => import('@/components/pools/AddLiquidityModal').then(mod => mod.AddLiquidityModal),
    { ssr: false }
);
import { Token, SEI, WSEI } from '@/config/tokens';
import { getTokenByAddress } from '@/utils/tokens';
import { formatTVL } from '@/utils/format';
import { calculatePoolAPR, formatAPR } from '@/utils/aprCalculator';

type PoolType = 'all' | 'v2' | 'cl';
type Category = 'all' | 'stable' | 'wind' | 'btc' | 'eth' | 'other';
type SortBy = 'default' | 'tvl' | 'apr';

// Fee tier mapping for CL pools (from CLFactory contract)
const FEE_TIERS: Record<number, string> = {
    1: '0.005%',     // Stables
    50: '0.02%',     // Correlated pairs
    100: '0.045%',   // Standard pairs
    200: '0.25%',    // Medium volatility
    2000: '1%',      // High volatility
};

// Pool config for modal
interface PoolConfig {
    token0?: Token;
    token1?: Token;
    poolType: 'v2' | 'cl';
    tickSpacing?: number;
    stable?: boolean;
}

// Helper to find token by address - use SEI for WSEI in UI
const findTokenForUI = (addr: string): Token | undefined => {
    const token = getTokenByAddress(addr);
    // Show SEI for WSEI in UI for better UX
    if (token?.symbol === 'WSEI') return SEI;
    return token || undefined;
};

export default function PoolsPage() {
    const [poolType, setPoolType] = useState<PoolType>('all');
    const [category, setCategory] = useState<Category>('all');
    const [sortBy, setSortBy] = useState<SortBy>('default');
    const [search, setSearch] = useState('');

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedPool, setSelectedPool] = useState<PoolConfig | undefined>(undefined);

    // Use globally prefetched pool data - instant load!
    const { v2Pools, clPools, allPools, poolRewards, windPrice, seiPrice, isLoading } = usePoolData();

    // Calculate APR for a pool (uses concentration multiplier based on tick spacing)
    const getPoolAPR = (pool: typeof allPools[0]): number | null => {
        const rewardRate = poolRewards.get(pool.address.toLowerCase());

        if (!rewardRate || rewardRate === BigInt(0)) return null;

        const s0 = pool.token0.symbol.toUpperCase();
        const s1 = pool.token1.symbol.toUpperCase();

        // PREFER pool.tvl from DexScreener/subgraph - it's more reliable
        // Reserve-based calculation has token order mismatch issues
        let tvlUsd = parseFloat(pool.tvl) || 0;

        // Only fall back to reserves if TVL is not available
        if (tvlUsd <= 0) {
            const r0 = parseFloat(pool.reserve0) || 0;
            const r1 = parseFloat(pool.reserve1) || 0;

            const d0 = pool.token0.decimals || 18;
            const d1 = pool.token1.decimals || 18;
            const adj0 = r0 > 1e12 ? r0 / Math.pow(10, d0) : r0;
            const adj1 = r1 > 1e12 ? r1 / Math.pow(10, d1) : r1;

            // Calculate value of each token
            const getTokenValue = (symbol: string, amount: number): number => {
                if (symbol === 'USDC' || symbol === 'USDT' || symbol === 'USDT0' || symbol === 'USDC.N') return amount;
                if (symbol === 'WSEI' || symbol === 'SEI') return amount * seiPrice;
                if (symbol === 'WIND') return amount * windPrice;
                if (symbol.includes('BTC') || symbol.includes('WBTC')) return amount * 95000;
                if (symbol.includes('ETH') || symbol.includes('WETH')) return amount * 3500;
                return amount * seiPrice;
            };

            tvlUsd = getTokenValue(s0, adj0) + getTokenValue(s1, adj1);
        }

        // For pools with rewards but no TVL data, use minimum $1 to show very high APR
        // Better to show "1000K%+" than "—" when rewards are active
        if (tvlUsd <= 0) tvlUsd = 1;

        return calculatePoolAPR(rewardRate, windPrice, tvlUsd, pool.tickSpacing);
    };


    // Open modal for a specific pool
    const openAddLiquidityModal = (pool: typeof allPools[0]) => {
        const token0 = findTokenForUI(pool.token0.address);
        const token1 = findTokenForUI(pool.token1.address);
        setSelectedPool({
            token0,
            token1,
            poolType: pool.poolType === 'CL' ? 'cl' : 'v2',
            tickSpacing: pool.tickSpacing,
            stable: pool.stable,
        });
        setModalOpen(true);
    };

    // Open modal for new pool creation
    const openCreatePoolModal = () => {
        setSelectedPool(undefined);
        setModalOpen(true);
    };


    // Format weekly WIND rewards
    const formatWeeklyRewards = (poolAddress: string) => {
        const rewardRate = poolRewards.get(poolAddress.toLowerCase());
        if (!rewardRate || rewardRate === BigInt(0)) return null;

        // rewardRate is WIND per second, convert to per week (7 * 24 * 60 * 60 = 604800)
        const weeklyRewards = rewardRate * BigInt(604800);
        const weeklyFloat = parseFloat(formatUnits(weeklyRewards, 18));

        if (weeklyFloat >= 1000000) return `${(weeklyFloat / 1000000).toFixed(1)}M`;
        if (weeklyFloat >= 1000) return `${(weeklyFloat / 1000).toFixed(0)}K`;
        if (weeklyFloat >= 1) return weeklyFloat.toFixed(0);
        return weeklyFloat.toFixed(2);
    };

    // Helper to check if pool is in a category
    const isStablePool = (pool: typeof allPools[0]) => {
        const symbols = [pool.token0.symbol, pool.token1.symbol].map(s => s.toUpperCase());
        return symbols.includes('USDC') && (symbols.includes('USDT') || symbols.includes('USDC.N'));
    };
    const isWindPool = (pool: typeof allPools[0]) => {
        return pool.token0.symbol.toUpperCase() === 'WIND' || pool.token1.symbol.toUpperCase() === 'WIND';
    };
    const isBtcPool = (pool: typeof allPools[0]) => {
        return pool.token0.symbol.toUpperCase().includes('BTC') || pool.token1.symbol.toUpperCase().includes('BTC');
    };
    const isEthPool = (pool: typeof allPools[0]) => {
        return pool.token0.symbol.toUpperCase().includes('ETH') || pool.token1.symbol.toUpperCase().includes('ETH');
    };

    // Filter pools
    const filteredPools = allPools.filter((pool) => {
        if (poolType === 'v2' && pool.poolType !== 'V2') return false;
        if (poolType === 'cl' && pool.poolType !== 'CL') return false;

        // Category filter
        if (category === 'stable' && !isStablePool(pool)) return false;
        if (category === 'wind' && !isWindPool(pool)) return false;
        if (category === 'btc' && !isBtcPool(pool)) return false;
        if (category === 'eth' && !isEthPool(pool)) return false;
        if (category === 'other' && (isStablePool(pool) || isWindPool(pool) || isBtcPool(pool) || isEthPool(pool))) return false;

        if (search) {
            const searchLower = search.toLowerCase();
            return (
                pool.token0.symbol.toLowerCase().includes(searchLower) ||
                pool.token1.symbol.toLowerCase().includes(searchLower)
            );
        }
        return true;
    });

    // Sort pools - WIND/WSEI always first, then by volume by default!
    const sortedPools = [...filteredPools].sort((a, b) => {
        // Helper to check if pool is WIND/WSEI
        const isWindWsei = (pool: typeof allPools[0]) =>
            (pool.token0.symbol.toUpperCase() === 'WIND' && pool.token1.symbol.toUpperCase() === 'WSEI') ||
            (pool.token0.symbol.toUpperCase() === 'WSEI' && pool.token1.symbol.toUpperCase() === 'WIND');

        // WIND/WSEI always first
        if (isWindWsei(a) && !isWindWsei(b)) return -1;
        if (!isWindWsei(a) && isWindWsei(b)) return 1;

        if (sortBy === 'tvl') return parseFloat(b.tvl) - parseFloat(a.tvl);

        // Default: sort by 24h volume (highest first)
        const volA = parseFloat(a.volume24h || '0');
        const volB = parseFloat(b.volume24h || '0');
        return volB - volA;
    });

    // Get fee tier string for CL pools
    const getFeeTier = (tickSpacing?: number) => {
        if (!tickSpacing) return '';
        return FEE_TIERS[tickSpacing] || `${tickSpacing}ts`;
    };

    const totalPoolCount = v2Pools.length + clPools.length;

    return (
        <div className="container mx-auto px-3 sm:px-6">
            {/* Page Header - Compact for mobile */}
            <motion.div
                className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 sm:mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-2xl sm:text-3xl font-bold">
                    <span className="gradient-text">Pools</span>
                    <span className="text-sm sm:text-base font-normal text-gray-400 ml-2">
                        {totalPoolCount > 0 && `(${totalPoolCount})`}
                    </span>
                </h1>
                <motion.button
                    onClick={openCreatePoolModal}
                    className="btn-primary px-4 py-2 text-sm font-medium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    + New Pool
                </motion.button>
            </motion.div>

            {/* Filters Row - Compact */}
            <motion.div
                className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
            >
                <div className="flex gap-2 items-center">
                    {/* Pool Type Toggle - Compact */}
                    <div className="glass p-0.5 sm:p-1 rounded-lg inline-flex flex-1 sm:flex-none">
                        {[
                            { key: 'all' as PoolType, label: 'All' },
                            { key: 'v2' as PoolType, label: 'V2' },
                            { key: 'cl' as PoolType, label: 'V3' },
                        ].map((type) => (
                            <button
                                key={type.key}
                                onClick={() => setPoolType(type.key)}
                                className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-medium transition text-xs sm:text-sm ${poolType === type.key
                                    ? type.key === 'cl'
                                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                        : 'bg-primary text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    {/* Sort & Category - Combined Dropdown */}
                    <select
                        value={category === 'all' ? sortBy : `cat_${category}`}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val.startsWith('cat_')) {
                                setCategory(val.replace('cat_', '') as Category);
                                setSortBy('default');
                            } else {
                                setCategory('all');
                                setSortBy(val as SortBy);
                            }
                        }}
                        className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm outline-none focus:border-primary cursor-pointer"
                    >
                        <optgroup label="Sort">
                            <option value="default">Default Order</option>
                            <option value="tvl">Sort by TVL</option>
                        </optgroup>
                        <optgroup label="Category">
                            <option value="cat_stable">💎 Stable Pairs</option>
                            <option value="cat_wind">🌀 WIND Pairs</option>
                            <option value="cat_btc">₿ BTC Pairs</option>
                            <option value="cat_eth">Ξ ETH Pairs</option>
                            <option value="cat_other">Other Pairs</option>
                        </optgroup>
                    </select>
                </div>

                {/* Search - full width on mobile */}
                <div className="relative w-full sm:w-auto">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full sm:w-48 pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm outline-none focus:border-primary"
                    />
                </div>
            </motion.div>


            {/* Pools Table */}
            <motion.div
                className="glass-card overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                {/* Table Header - Desktop only */}
                <div className="hidden md:grid grid-cols-12 gap-4 p-5 border-b border-white/5 text-sm text-gray-400 font-medium">
                    <div className="col-span-4">Pool</div>
                    <div className="col-span-2 text-center">APR</div>
                    <div className="col-span-2 text-center">24h Vol</div>
                    <div className="col-span-2 text-right">TVL</div>
                    <div className="col-span-2 text-center">Action</div>
                </div>

                {/* Table Body */}
                {sortedPools.length === 0 ? (
                    <div className="p-12">
                        {isLoading ? (
                            <div className="text-center">
                                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                <p className="text-gray-400">Loading pools...</p>
                            </div>
                        ) : (
                            <EmptyState
                                icon="🔍"
                                title="No pools found"
                                description="Try a different search term or clear filters"
                            />
                        )}
                    </div>
                ) : (
                    sortedPools.map((pool, index) => {
                        // Check if this is the featured WIND/WSEI pool
                        const isWindWsei = (pool.token0.symbol.toUpperCase() === 'WIND' && pool.token1.symbol.toUpperCase() === 'WSEI') ||
                            (pool.token0.symbol.toUpperCase() === 'WSEI' && pool.token1.symbol.toUpperCase() === 'WIND');

                        return (
                            <motion.div
                                key={pool.address}
                                className={`flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-3 md:p-5 border-b transition ${isWindWsei
                                    ? 'border-2 border-green-500/50 bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-transparent rounded-xl my-1'
                                    : 'border-white/5 hover:bg-white/5'
                                    }`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + index * 0.02 }}
                            >
                                {/* Pool Info */}
                                <div className="md:col-span-4 flex items-center gap-2">
                                    <div className="relative flex-shrink-0">
                                        {pool.token0.logoURI ? (
                                            <img src={pool.token0.logoURI} alt={pool.token0.symbol} className="w-7 h-7 md:w-10 md:h-10 rounded-full" />
                                        ) : (
                                            <div className={`w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-bold ${pool.poolType === 'CL'
                                                ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                                                : 'bg-gradient-to-br from-primary to-secondary'
                                                }`}>
                                                {pool.token0.symbol[0]}
                                            </div>
                                        )}
                                        {pool.token1.logoURI ? (
                                            <img src={pool.token1.logoURI} alt={pool.token1.symbol} className="w-7 h-7 md:w-10 md:h-10 rounded-full absolute left-4 md:left-6 top-0 border-2 border-[var(--bg-primary)]" />
                                        ) : (
                                            <div className={`w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-bold absolute left-4 md:left-6 top-0 border-2 border-[var(--bg-primary)] ${pool.poolType === 'CL'
                                                ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                                                : 'bg-gradient-to-br from-secondary to-accent'
                                                }`}>
                                                {pool.token1.symbol[0]}
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-4 md:ml-4 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm md:text-lg truncate">
                                                {pool.token0.symbol}/{pool.token1.symbol}
                                            </span>
                                            {/* Mobile APR inline with pool name */}
                                            {(() => {
                                                const apr = getPoolAPR(pool);
                                                if (apr !== null && apr > 0) {
                                                    return <span className="md:hidden text-xs font-bold px-2 py-1 rounded-lg bg-gradient-to-r from-green-500/30 to-emerald-500/30 text-green-300 border border-green-500/40 shadow-[0_0_8px_rgba(34,197,94,0.3)]">🔥 APR {formatAPR(apr)}</span>;
                                                }
                                                return null;
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] md:text-xs">
                                            {pool.poolType === 'CL' && pool.tickSpacing && (
                                                <span className="text-cyan-400">
                                                    {getFeeTier(pool.tickSpacing)}
                                                </span>
                                            )}
                                            {pool.poolType === 'V2' && (
                                                <span className="text-gray-500">
                                                    {pool.stable ? 'Stable' : 'Volatile'}
                                                </span>
                                            )}
                                            {/* Rewards badge for WIND/WSEI */}
                                            {isWindWsei && (
                                                <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold animate-pulse">
                                                    ⭐ Rewards Live
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Desktop: APR */}
                                <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                    {(() => {
                                        const apr = getPoolAPR(pool);
                                        if (apr !== null && apr > 0) {
                                            return (
                                                <span className="text-sm font-semibold text-green-400">
                                                    {formatAPR(apr)}
                                                </span>
                                            );
                                        }
                                        return <span className="text-sm font-medium text-gray-500">—</span>;
                                    })()}
                                </div>

                                {/* Desktop: 24h Volume (from DexScreener) */}
                                <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                    {pool.volume24h && parseFloat(pool.volume24h) > 0.01 ? (
                                        <span className="text-sm font-medium">
                                            ${parseFloat(pool.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </span>
                                    ) : (
                                        <span className="text-sm font-medium text-gray-500">—</span>
                                    )}
                                </div>

                                {/* Desktop: TVL (USD) */}
                                <div className="hidden md:flex md:col-span-2 items-center justify-end">
                                    <div className="text-right text-sm">
                                        {parseFloat(pool.tvl) > 0 ? (
                                            <div className="font-semibold">
                                                ${parseFloat(pool.tvl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </div>
                                        ) : (
                                            <span className="text-gray-500">New Pool</span>
                                        )}
                                    </div>
                                </div>

                                {/* Mobile: Stats + Action Row */}
                                <div className="flex md:hidden items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 text-[10px] min-w-0 flex-1">
                                        {/* TVL in USD */}
                                        <div className="min-w-0">
                                            <div className="text-[9px] text-gray-500">TVL</div>
                                            <div className="font-semibold">
                                                {parseFloat(pool.tvl) > 0
                                                    ? `$${parseFloat(pool.tvl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                                    : 'New'
                                                }
                                            </div>
                                        </div>
                                        {/* 24h Volume */}
                                        {pool.volume24h && parseFloat(pool.volume24h) > 0.01 && (
                                            <div className="flex-shrink-0">
                                                <div className="text-[9px] text-gray-500">24h Vol</div>
                                                <div className="font-semibold text-blue-400">${parseFloat(pool.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => openAddLiquidityModal(pool)}
                                        className="px-3 py-2 rounded-lg font-bold text-xs flex-shrink-0 bg-gradient-to-r from-cyan-500 to-blue-500 text-white whitespace-nowrap"
                                    >
                                        Add LP
                                    </button>
                                </div>

                                {/* Desktop: Action */}
                                <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                    <motion.button
                                        onClick={() => openAddLiquidityModal(pool)}
                                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${pool.poolType === 'CL'
                                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30'
                                            : 'bg-gradient-to-r from-primary/20 to-secondary/20 text-primary hover:from-primary/30 hover:to-secondary/30'
                                            }`}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        + Add LP
                                    </motion.button>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </motion.div>

            {/* Add Liquidity Modal */}
            <AddLiquidityModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                initialPool={selectedPool}
            />
        </div>
    );
}
