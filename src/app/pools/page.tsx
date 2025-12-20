'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { usePoolData } from '@/providers/PoolDataProvider';
import { Tooltip } from '@/components/common/Tooltip';
import { EmptyState } from '@/components/common/InfoCard';

type PoolType = 'all' | 'v2' | 'cl';
type SortBy = 'tvl' | 'apr';

// Fee tier mapping for CL pools
const FEE_TIERS: Record<number, string> = {
    1: '0.009%',
    10: '0.045%',
    80: '0.25%',
    2000: '1%',
};

export default function PoolsPage() {
    const [poolType, setPoolType] = useState<PoolType>('all');
    const [sortBy, setSortBy] = useState<SortBy>('tvl');
    const [search, setSearch] = useState('');

    // Use globally prefetched pool data - instant load!
    const { v2Pools, clPools, allPools, poolRewards, isLoading } = usePoolData();

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
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Explore</span> Pools
                </h1>
                <p className="text-gray-400 max-w-xl mx-auto">
                    Discover trading pools and find the best opportunities to earn.
                    {totalPoolCount > 0 && ` ${totalPoolCount} pools available.`}
                </p>
            </motion.div>

            {/* Pool Type Stats */}
            <motion.div
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="stat-card text-center">
                    <p className="text-sm text-gray-400 mb-1">Total Pools</p>
                    <p className="text-2xl font-bold">{totalPoolCount || '--'}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-sm text-gray-400 mb-1">V2 (Classic)</p>
                    <p className="text-2xl font-bold">{v2Pools.length || '--'}</p>
                </div>
                <div className="stat-card text-center bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20">
                    <p className="text-sm text-gray-400 mb-1">V3 (Concentrated)</p>
                    <p className="text-2xl font-bold text-cyan-400">{clPools.length || '--'}</p>
                </div>
                <div className="stat-card text-center">
                    <p className="text-sm text-gray-400 mb-1">Network</p>
                    <p className="text-2xl font-bold">Sei</p>
                </div>
            </motion.div>

            {/* Filters Row */}
            <motion.div
                className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
            >
                <div className="flex gap-4 items-center flex-wrap">
                    {/* Pool Type Toggle */}
                    <div className="glass p-1 rounded-xl inline-flex">
                        {[
                            { key: 'all' as PoolType, label: 'All' },
                            { key: 'v2' as PoolType, label: 'V2' },
                            { key: 'cl' as PoolType, label: 'V3' },
                        ].map((type) => (
                            <button
                                key={type.key}
                                onClick={() => setPoolType(type.key)}
                                className={`px-4 py-2 rounded-lg font-medium transition text-sm ${poolType === type.key
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

                    {/* Sort Dropdown */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-primary cursor-pointer"
                    >
                        <option value="tvl">Sort by TVL</option>
                    </select>
                </div>

                {/* Search */}
                <div className="relative">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by token..."
                        className="pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-primary w-64"
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
                    <div className="col-span-2 text-center">Type</div>
                    <div className="col-span-2 text-center">Rewards</div>
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
                            className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 p-4 md:p-5 border-b border-white/5 hover:bg-white/5 transition"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + index * 0.02 }}
                        >
                            {/* Pool Info */}
                            <div className="md:col-span-4 flex items-center gap-3">
                                <div className="relative">
                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold ${pool.poolType === 'CL'
                                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                                        : 'bg-gradient-to-br from-primary to-secondary'
                                        }`}>
                                        {pool.token0.symbol[0]}
                                    </div>
                                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold absolute left-5 md:left-6 top-0 border-2 border-[var(--bg-primary)] ${pool.poolType === 'CL'
                                        ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                                        : 'bg-gradient-to-br from-secondary to-accent'
                                        }`}>
                                        {pool.token1.symbol[0]}
                                    </div>
                                </div>
                                <div className="ml-3 md:ml-4 flex-1">
                                    <div className="font-semibold text-base md:text-lg">
                                        {pool.token0.symbol}/{pool.token1.symbol}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {pool.poolType === 'CL' && pool.tickSpacing && (
                                            <span className="text-xs text-cyan-400">
                                                {getFeeTier(pool.tickSpacing)} fee
                                            </span>
                                        )}
                                        {pool.poolType === 'V2' && (
                                            <span className="text-xs text-gray-500">
                                                {pool.stable ? 'Stable' : 'Volatile'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Mobile: Type badge inline */}
                                <span className={`md:hidden text-xs px-2 py-1 rounded-full font-medium ${pool.poolType === 'CL'
                                    ? 'bg-cyan-500/20 text-cyan-400'
                                    : 'bg-primary/20 text-primary'
                                    }`}>
                                    {pool.poolType === 'CL' ? 'V3' : 'V2'}
                                </span>
                            </div>

                            {/* Desktop: Type */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${pool.poolType === 'CL'
                                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                                    : 'bg-primary/20 text-primary border border-primary/30'
                                    }`}>
                                    {pool.poolType === 'CL' ? '⚡ V3' : '💧 V2'}
                                </span>
                            </div>

                            {/* Desktop: Rewards */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                {(() => {
                                    const weeklyAmount = formatWeeklyRewards(pool.address);
                                    if (weeklyAmount) {
                                        return (
                                            <Tooltip content={`${weeklyAmount} WIND distributed per week`}>
                                                <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 border border-yellow-500/30 cursor-help">
                                                    🔥 {weeklyAmount}/wk
                                                </span>
                                            </Tooltip>
                                        );
                                    }
                                    return <span className="text-xs text-gray-500">—</span>;
                                })()}
                            </div>

                            {/* Desktop: TVL */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-end">
                                <div className="font-semibold">{formatTVL(pool.tvl, pool.poolType)}</div>
                            </div>

                            {/* Mobile: TVL + Action Row */}
                            <div className="flex md:hidden items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-500">TVL:</span>
                                    <span className="font-medium text-sm">{formatTVL(pool.tvl, pool.poolType)}</span>
                                    {formatWeeklyRewards(pool.address) && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                                            🔥 {formatWeeklyRewards(pool.address)}
                                        </span>
                                    )}
                                </div>
                                <Link href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&type=${pool.poolType.toLowerCase()}${pool.poolType === 'CL' && pool.tickSpacing ? `&tickSpacing=${pool.tickSpacing}` : ''}${pool.poolType === 'V2' ? `&stable=${pool.stable}` : ''}`}>
                                    <button className={`px-3 py-2 rounded-lg font-medium text-sm ${pool.poolType === 'CL'
                                        ? 'bg-cyan-500/20 text-cyan-400'
                                        : 'bg-primary/20 text-primary'
                                        }`}>
                                        + Add LP
                                    </button>
                                </Link>
                            </div>

                            {/* Desktop: Action */}
                            <div className="hidden md:flex md:col-span-2 items-center justify-center">
                                <Link href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&type=${pool.poolType.toLowerCase()}${pool.poolType === 'CL' && pool.tickSpacing ? `&tickSpacing=${pool.tickSpacing}` : ''}${pool.poolType === 'V2' ? `&stable=${pool.stable}` : ''}`}>
                                    <motion.button
                                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${pool.poolType === 'CL'
                                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30'
                                            : 'bg-gradient-to-r from-primary/20 to-secondary/20 text-primary hover:from-primary/30 hover:to-secondary/30'
                                            }`}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        + Add LP
                                    </motion.button>
                                </Link>
                            </div>
                        </motion.div>
                    ))
                )}
            </motion.div>
        </div>
    );
}
