'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { V2_CONTRACTS } from '@/config/contracts';
import { POOL_FACTORY_ABI, POOL_ABI, ERC20_ABI } from '@/config/abis';
import { Tooltip } from '@/components/common/Tooltip';
import { EmptyState } from '@/components/common/InfoCard';

type PoolType = 'all' | 'v2' | 'cl';
type SortBy = 'tvl' | 'apr' | 'volume';

interface PoolData {
    address: Address;
    token0: { address: Address; symbol: string; decimals: number };
    token1: { address: Address; symbol: string; decimals: number };
    stable: boolean;
    reserve0: string;
    reserve1: string;
    tvl: string;
    estimatedApr?: number;
}

export default function PoolsPage() {
    const [poolType, setPoolType] = useState<PoolType>('all');
    const [sortBy, setSortBy] = useState<SortBy>('tvl');
    const [search, setSearch] = useState('');
    const [pools, setPools] = useState<PoolData[]>([]);

    // Get total number of pools
    const { data: poolCount } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'allPoolsLength',
    });

    // Get first 10 pool addresses (for demo)
    const poolIndexes = poolCount ? Array.from({ length: Math.min(Number(poolCount), 10) }, (_, i) => i) : [];

    const { data: poolAddresses } = useReadContracts({
        contracts: poolIndexes.map((index) => ({
            address: V2_CONTRACTS.PoolFactory as Address,
            abi: POOL_FACTORY_ABI,
            functionName: 'allPools',
            args: [BigInt(index)],
        })),
        query: {
            enabled: poolIndexes.length > 0,
        },
    });

    // Get pool details for each address
    const validPoolAddresses = (poolAddresses?.filter(p => p.status === 'success').map(p => p.result as unknown as Address) || []);

    const { data: poolDetails } = useReadContracts({
        contracts: validPoolAddresses.flatMap((addr) => [
            { address: addr, abi: POOL_ABI, functionName: 'token0' },
            { address: addr, abi: POOL_ABI, functionName: 'token1' },
            { address: addr, abi: POOL_ABI, functionName: 'stable' },
            { address: addr, abi: POOL_ABI, functionName: 'getReserves' },
        ]),
        query: {
            enabled: validPoolAddresses.length > 0,
        },
    });

    // Get token symbols
    const tokenAddresses = poolDetails
        ?.filter((_, i) => i % 4 === 0 || i % 4 === 1)
        .filter(d => d.status === 'success')
        .map(d => d.result as Address) || [];

    const uniqueTokens = [...new Set(tokenAddresses)];

    const { data: tokenSymbols } = useReadContracts({
        contracts: uniqueTokens.flatMap((addr) => [
            { address: addr, abi: ERC20_ABI, functionName: 'symbol' },
            { address: addr, abi: ERC20_ABI, functionName: 'decimals' },
        ]),
        query: {
            enabled: uniqueTokens.length > 0,
        },
    });

    // Build token info map
    const tokenInfoMap = new Map<string, { symbol: string; decimals: number }>();
    if (tokenSymbols) {
        uniqueTokens.forEach((addr, i) => {
            const symbolResult = tokenSymbols[i * 2];
            const decimalsResult = tokenSymbols[i * 2 + 1];
            if (symbolResult?.status === 'success' && decimalsResult?.status === 'success') {
                tokenInfoMap.set(addr.toLowerCase(), {
                    symbol: symbolResult.result as string,
                    decimals: Number(decimalsResult.result),
                });
            }
        });
    }

    // Build pools data
    useEffect(() => {
        if (!poolDetails || !validPoolAddresses.length || tokenInfoMap.size === 0) return;

        const newPools: PoolData[] = [];

        for (let i = 0; i < validPoolAddresses.length; i++) {
            const token0Result = poolDetails[i * 4];
            const token1Result = poolDetails[i * 4 + 1];
            const stableResult = poolDetails[i * 4 + 2];
            const reservesResult = poolDetails[i * 4 + 3];

            if (
                token0Result?.status !== 'success' ||
                token1Result?.status !== 'success' ||
                stableResult?.status !== 'success' ||
                reservesResult?.status !== 'success'
            ) continue;

            const token0Addr = (token0Result.result as Address).toLowerCase();
            const token1Addr = (token1Result.result as Address).toLowerCase();
            const token0Info = tokenInfoMap.get(token0Addr);
            const token1Info = tokenInfoMap.get(token1Addr);

            if (!token0Info || !token1Info) continue;

            const reserves = reservesResult.result as [bigint, bigint, bigint];
            const reserve0 = formatUnits(reserves[0], token0Info.decimals);
            const reserve1 = formatUnits(reserves[1], token1Info.decimals);

            // Estimate TVL (simplified - would need price feeds for accurate TVL)
            const tvl = (parseFloat(reserve0) + parseFloat(reserve1)).toFixed(2);

            // Estimate APR (mock data - would come from actual fee data)
            const estimatedApr = Math.random() * 50 + 5; // 5-55% mock APR

            newPools.push({
                address: validPoolAddresses[i],
                token0: { address: token0Result.result as Address, ...token0Info },
                token1: { address: token1Result.result as Address, ...token1Info },
                stable: stableResult.result as boolean,
                reserve0,
                reserve1,
                tvl,
                estimatedApr,
            });
        }

        setPools(newPools);
    }, [poolDetails, validPoolAddresses, tokenInfoMap.size]);

    const filteredPools = pools.filter((pool) => {
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
        if (sortBy === 'apr') return (b.estimatedApr || 0) - (a.estimatedApr || 0);
        return 0;
    });

    // APR badge helper
    const getAprBadge = (apr?: number) => {
        if (!apr) return { class: 'apr-badge-low', label: '--' };
        if (apr >= 30) return { class: 'apr-badge-high', label: `${apr.toFixed(1)}%` };
        if (apr >= 10) return { class: 'apr-badge-medium', label: `${apr.toFixed(1)}%` };
        return { class: 'apr-badge-low', label: `${apr.toFixed(1)}%` };
    };

    // Format TVL nicely
    const formatTVL = (tvl: string) => {
        const num = parseFloat(tvl);
        if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
        if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
        return `$${num.toFixed(2)}`;
    };

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
                    Discover trading pools and find the best opportunities to earn. {poolCount ? `${Number(poolCount)} pools available for you to explore.` : ''}
                </p>
            </motion.div>

            {/* Filters Row */}
            <motion.div
                className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="flex gap-4 items-center">
                    {/* Pool Type Toggle */}
                    <div className="glass p-1 rounded-xl inline-flex">
                        {(['all', 'v2'] as PoolType[]).map((type) => (
                            <button
                                key={type}
                                onClick={() => setPoolType(type)}
                                className={`px-4 py-2 rounded-lg font-medium transition text-sm ${poolType === type
                                    ? 'bg-primary text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {type === 'all' ? 'All Pools' : 'V2 Pools'}
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
                        <option value="apr">Sort by APR</option>
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
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 p-5 border-b border-white/5 text-sm text-gray-400 font-medium">
                    <div className="col-span-4">Pool</div>
                    <div className="col-span-2 text-center">
                        <Tooltip content="Annual Percentage Rate - your estimated yearly earnings">
                            APR
                        </Tooltip>
                    </div>
                    <div className="col-span-2 text-right">TVL</div>
                    <div className="col-span-2 text-right">My Deposit</div>
                    <div className="col-span-2 text-center">Action</div>
                </div>

                {/* Table Body */}
                {sortedPools.length === 0 ? (
                    <div className="p-12">
                        {pools.length === 0 ? (
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
                        const aprBadge = getAprBadge(pool.estimatedApr);
                        return (
                            <motion.div
                                key={pool.address}
                                className="grid grid-cols-12 gap-4 p-5 border-b border-white/5 hover:bg-white/5 transition items-center"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + index * 0.03 }}
                            >
                                {/* Pool */}
                                <div className="col-span-4 flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold">
                                            {pool.token0.symbol[0]}
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-sm font-bold absolute left-6 top-0 border-2 border-[var(--bg-primary)]">
                                            {pool.token1.symbol[0]}
                                        </div>
                                    </div>
                                    <div className="ml-4">
                                        <div className="font-semibold text-lg">
                                            {pool.token0.symbol}/{pool.token1.symbol}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${pool.stable ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                {pool.stable ? '🔷 Stable' : '🔶 Volatile'}
                                            </span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                                V2
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* APR */}
                                <div className="col-span-2 text-center">
                                    <span className={`apr-badge ${aprBadge.class}`}>
                                        {aprBadge.label}
                                    </span>
                                </div>

                                {/* TVL */}
                                <div className="col-span-2 text-right">
                                    <div className="font-semibold">{formatTVL(pool.tvl)}</div>
                                    <div className="text-xs text-gray-500">Total Value</div>
                                </div>

                                {/* My Deposit */}
                                <div className="col-span-2 text-right text-gray-400">
                                    <span className="text-sm">--</span>
                                </div>

                                {/* Action */}
                                <div className="col-span-2 text-center">
                                    <Link href="/liquidity">
                                        <motion.button
                                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 text-primary font-medium hover:from-primary/30 hover:to-secondary/30 transition-all text-sm"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            Add Liquidity
                                        </motion.button>
                                    </Link>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </motion.div>

            {/* Stats Summary */}
            <motion.div
                className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="icon-container icon-container-sm">📊</div>
                        <div>
                            <p className="text-sm text-gray-400 mb-0.5">Total Pools</p>
                            <p className="text-2xl font-bold">{poolCount ? Number(poolCount).toLocaleString() : '--'}</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>✓</div>
                        <div>
                            <p className="text-sm text-gray-400 mb-0.5">Showing</p>
                            <p className="text-2xl font-bold">{sortedPools.length} pools</p>
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center gap-3">
                        <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>⛓️</div>
                        <div>
                            <p className="text-sm text-gray-400 mb-0.5">Network</p>
                            <p className="text-2xl font-bold">Sei Mainnet</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
