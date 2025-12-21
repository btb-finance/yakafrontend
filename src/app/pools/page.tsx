'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatUnits, Address } from 'viem';
import { usePoolData } from '@/providers/PoolDataProvider';
import { Tooltip } from '@/components/common/Tooltip';
import { EmptyState } from '@/components/common/InfoCard';
import { AddLiquidityModal } from '@/components/pools/AddLiquidityModal';
import { Token, DEFAULT_TOKEN_LIST, SEI, WSEI } from '@/config/tokens';

type PoolType = 'all' | 'v2' | 'cl';
type SortBy = 'tvl' | 'apr';

// Fee tier mapping for CL pools
const FEE_TIERS: Record<number, string> = {
    1: '0.009%',
    10: '0.045%',
    80: '0.25%',
    2000: '1%',
};

// Pool config for modal
interface PoolConfig {
    token0?: Token;
    token1?: Token;
    poolType: 'v2' | 'cl';
    tickSpacing?: number;
    stable?: boolean;
}

// Helper to find token by address
const findTokenByAddress = (addr: string): Token | undefined => {
    const lowerAddr = addr.toLowerCase();
    if (lowerAddr === WSEI.address.toLowerCase()) {
        return SEI; // Use SEI for native token UI
    }
    return DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === lowerAddr);
};

export default function PoolsPage() {
    const [poolType, setPoolType] = useState<PoolType>('all');
    const [sortBy, setSortBy] = useState<SortBy>('tvl');
    const [search, setSearch] = useState('');

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedPool, setSelectedPool] = useState<PoolConfig | undefined>(undefined);

    // Use globally prefetched pool data - instant load!
    const { v2Pools, clPools, allPools, poolRewards, isLoading } = usePoolData();

    // Open modal for a specific pool
    const openAddLiquidityModal = (pool: typeof allPools[0]) => {
        const token0 = findTokenByAddress(pool.token0.address);
        const token1 = findTokenByAddress(pool.token1.address);
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

    // Filter pools
    const filteredPools = allPools.filter((pool) => {
        if (poolType === 'v2' && pool.poolType !== 'V2') return false;
        if (poolType === 'cl' && pool.poolType !== 'CL') return false;

        if (search) {
            const searchLower = search.toLowerCase();
            return (
                pool.token0.symbol.toLowerCase().includes(searchLower) ||
                pool.token1.symbol.toLowerCase().includes(searchLower)
            );
        }
        return true;
    });

    // Sort pools
    const sortedPools = [...filteredPools].sort((a, b) => {
        if (sortBy === 'tvl') return parseFloat(b.tvl) - parseFloat(a.tvl);
        return 0;
    });

    // Get fee tier string for CL pools
    const getFeeTier = (tickSpacing?: number) => {
        if (!tickSpacing) return '';
        return FEE_TIERS[tickSpacing] || `${tickSpacing}ts`;
    };

    // Format TVL nicely
    const formatTVL = (tvl: string, poolType?: string) => {
        const num = parseFloat(tvl);
        if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
        if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
        if (num >= 1) return `$${num.toFixed(2)}`;
        if (num > 0) return `$${num.toFixed(4)}`;
        if (poolType === 'CL') return 'New Pool';
        return 'Low';
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

                    {/* Sort - hidden on mobile */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                        className="hidden sm:block px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-primary cursor-pointer"
                    >
                        <option value="tvl">Sort by TVL</option>
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
                    sortedPools.map((pool, index) => (
                        <motion.div
                            key={pool.address}
                            className="flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-3 md:p-5 border-b border-white/5 hover:bg-white/5 transition"
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
                                    <div className="font-semibold text-sm md:text-lg truncate">
                                        {pool.token0.symbol}/{pool.token1.symbol}
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
                                    </div>
                                </div>
                            </div>

                            {/* Desktop: APR */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                <span className="text-sm font-medium text-gray-500">—</span>
                            </div>

                            {/* Desktop: 24h Volume */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                <span className="text-sm font-medium text-gray-500">—</span>
                            </div>

                            {/* Desktop: TVL (Token Amounts) */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-end">
                                <div className="text-right text-sm">
                                    {parseFloat(pool.reserve0) > 0 || parseFloat(pool.reserve1) > 0 ? (
                                        <>
                                            <div className="font-semibold">{pool.reserve0} {pool.token0.symbol}</div>
                                            <div className="text-gray-400">{pool.reserve1} {pool.token1.symbol}</div>
                                        </>
                                    ) : (
                                        <span className="text-gray-500">New Pool</span>
                                    )}
                                </div>
                            </div>

                            {/* Mobile: Stats + Action Row */}
                            <div className="flex md:hidden items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-[10px] min-w-0 flex-1">
                                    {/* TVL */}
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{pool.reserve0} {pool.token0.symbol}</div>
                                        <div className="text-gray-400 truncate">{pool.reserve1} {pool.token1.symbol}</div>
                                    </div>
                                </div>
                                {/* APR & Vol badges */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">APR —</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Vol —</span>
                                </div>
                                <button
                                    onClick={() => openAddLiquidityModal(pool)}
                                    className="px-3 py-2 rounded-lg font-bold text-xs flex-shrink-0 bg-gradient-to-r from-cyan-500 to-blue-500 text-white"
                                >
                                    +LP
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
                    ))
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
