'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';
import { POOL_FACTORY_ABI, POOL_ABI, ERC20_ABI } from '@/config/abis';
import { Tooltip } from '@/components/common/Tooltip';
import { EmptyState } from '@/components/common/InfoCard';

// CL Factory ABI
const CL_FACTORY_ABI = [
    {
        inputs: [],
        name: 'allPoolsLength',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '', type: 'uint256' }],
        name: 'allPools',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// CL Pool ABI
const CL_POOL_ABI = [
    {
        inputs: [],
        name: 'token0',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'token1',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'tickSpacing',
        outputs: [{ name: '', type: 'int24' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'liquidity',
        outputs: [{ name: '', type: 'uint128' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

type PoolType = 'all' | 'v2' | 'cl';
type SortBy = 'tvl' | 'apr';

interface PoolData {
    address: Address;
    token0: { address: Address; symbol: string; decimals: number };
    token1: { address: Address; symbol: string; decimals: number };
    poolType: 'V2' | 'CL';
    stable?: boolean;
    tickSpacing?: number;
    reserve0: string;
    reserve1: string;
    tvl: string;
    estimatedApr?: number;
}

// Fee tier mapping for CL pools
const FEE_TIERS: Record<number, string> = {
    1: '0.01%',
    50: '0.05%',
    100: '0.05%',
    200: '0.30%',
};

export default function PoolsPage() {
    const [poolType, setPoolType] = useState<PoolType>('all');
    const [sortBy, setSortBy] = useState<SortBy>('tvl');
    const [search, setSearch] = useState('');
    const [v2Pools, setV2Pools] = useState<PoolData[]>([]);
    const [clPools, setClPools] = useState<PoolData[]>([]);

    // ============================================
    // V2 POOLS
    // ============================================
    const { data: v2PoolCount } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'allPoolsLength',
    });

    const v2PoolIndexes = v2PoolCount ? Array.from({ length: Math.min(Number(v2PoolCount), 20) }, (_, i) => i) : [];

    const { data: v2PoolAddresses } = useReadContracts({
        contracts: v2PoolIndexes.map((index) => ({
            address: V2_CONTRACTS.PoolFactory as Address,
            abi: POOL_FACTORY_ABI,
            functionName: 'allPools',
            args: [BigInt(index)],
        })),
        query: { enabled: v2PoolIndexes.length > 0 },
    });

    const validV2PoolAddresses = (v2PoolAddresses?.filter(p => p.status === 'success').map(p => p.result as unknown as Address) || []);

    const { data: v2PoolDetails } = useReadContracts({
        contracts: validV2PoolAddresses.flatMap((addr) => [
            { address: addr, abi: POOL_ABI, functionName: 'token0' },
            { address: addr, abi: POOL_ABI, functionName: 'token1' },
            { address: addr, abi: POOL_ABI, functionName: 'stable' },
            { address: addr, abi: POOL_ABI, functionName: 'getReserves' },
        ]),
        query: { enabled: validV2PoolAddresses.length > 0 },
    });

    // ============================================
    // CL POOLS
    // ============================================
    const { data: clPoolCount } = useReadContract({
        address: CL_CONTRACTS.CLFactory as Address,
        abi: CL_FACTORY_ABI,
        functionName: 'allPoolsLength',
    });

    const clPoolIndexes = clPoolCount ? Array.from({ length: Math.min(Number(clPoolCount), 20) }, (_, i) => i) : [];

    const { data: clPoolAddresses } = useReadContracts({
        contracts: clPoolIndexes.map((index) => ({
            address: CL_CONTRACTS.CLFactory as Address,
            abi: CL_FACTORY_ABI,
            functionName: 'allPools',
            args: [BigInt(index)],
        })),
        query: { enabled: clPoolIndexes.length > 0 },
    });

    const validClPoolAddresses = (clPoolAddresses?.filter(p => p.status === 'success').map(p => p.result as unknown as Address) || []);

    const { data: clPoolDetails } = useReadContracts({
        contracts: validClPoolAddresses.flatMap((addr) => [
            { address: addr, abi: CL_POOL_ABI, functionName: 'token0' },
            { address: addr, abi: CL_POOL_ABI, functionName: 'token1' },
            { address: addr, abi: CL_POOL_ABI, functionName: 'tickSpacing' },
            { address: addr, abi: CL_POOL_ABI, functionName: 'liquidity' },
        ]),
        query: { enabled: validClPoolAddresses.length > 0 },
    });

    // ============================================
    // TOKEN INFO
    // ============================================
    const allTokenAddresses = [
        ...(v2PoolDetails?.filter((_, i) => i % 4 === 0 || i % 4 === 1).filter(d => d.status === 'success').map(d => d.result as Address) || []),
        ...(clPoolDetails?.filter((_, i) => i % 4 === 0 || i % 4 === 1).filter(d => d.status === 'success').map(d => d.result as Address) || []),
    ];

    const uniqueTokens = [...new Set(allTokenAddresses)];

    const { data: tokenSymbols } = useReadContracts({
        contracts: uniqueTokens.flatMap((addr) => [
            { address: addr, abi: ERC20_ABI, functionName: 'symbol' },
            { address: addr, abi: ERC20_ABI, functionName: 'decimals' },
        ]),
        query: { enabled: uniqueTokens.length > 0 },
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

    // Build V2 pools data
    useEffect(() => {
        if (!v2PoolDetails || !validV2PoolAddresses.length || tokenInfoMap.size === 0) return;

        const newPools: PoolData[] = [];

        for (let i = 0; i < validV2PoolAddresses.length; i++) {
            const token0Result = v2PoolDetails[i * 4];
            const token1Result = v2PoolDetails[i * 4 + 1];
            const stableResult = v2PoolDetails[i * 4 + 2];
            const reservesResult = v2PoolDetails[i * 4 + 3];

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
            const tvl = (parseFloat(reserve0) + parseFloat(reserve1)).toFixed(2);

            newPools.push({
                address: validV2PoolAddresses[i],
                token0: { address: token0Result.result as Address, ...token0Info },
                token1: { address: token1Result.result as Address, ...token1Info },
                poolType: 'V2',
                stable: stableResult.result as boolean,
                reserve0,
                reserve1,
                tvl,
            });
        }

        setV2Pools(newPools);
    }, [v2PoolDetails, validV2PoolAddresses.length, tokenInfoMap.size]);

    // Build CL pools data
    useEffect(() => {
        if (!clPoolDetails || !validClPoolAddresses.length || tokenInfoMap.size === 0) return;

        const newPools: PoolData[] = [];

        for (let i = 0; i < validClPoolAddresses.length; i++) {
            const token0Result = clPoolDetails[i * 4];
            const token1Result = clPoolDetails[i * 4 + 1];
            const tickSpacingResult = clPoolDetails[i * 4 + 2];
            const liquidityResult = clPoolDetails[i * 4 + 3];

            if (
                token0Result?.status !== 'success' ||
                token1Result?.status !== 'success' ||
                tickSpacingResult?.status !== 'success'
            ) continue;

            const token0Addr = (token0Result.result as Address).toLowerCase();
            const token1Addr = (token1Result.result as Address).toLowerCase();
            const token0Info = tokenInfoMap.get(token0Addr);
            const token1Info = tokenInfoMap.get(token1Addr);

            if (!token0Info || !token1Info) continue;

            const tickSpacing = Number(tickSpacingResult.result);
            const liquidity = liquidityResult?.status === 'success' ? BigInt(liquidityResult.result as bigint) : BigInt(0);

            // Estimate TVL from liquidity (simplified)
            const tvl = (Number(liquidity) / 1e18).toFixed(2);

            newPools.push({
                address: validClPoolAddresses[i],
                token0: { address: token0Result.result as Address, ...token0Info },
                token1: { address: token1Result.result as Address, ...token1Info },
                poolType: 'CL',
                tickSpacing,
                reserve0: '0',
                reserve1: '0',
                tvl,
            });
        }

        setClPools(newPools);
    }, [clPoolDetails, validClPoolAddresses.length, tokenInfoMap.size]);

    // Combine and filter pools
    const allPools = [...v2Pools, ...clPools];

    const filteredPools = allPools.filter((pool) => {
        // Filter by pool type
        if (poolType === 'v2' && pool.poolType !== 'V2') return false;
        if (poolType === 'cl' && pool.poolType !== 'CL') return false;

        // Filter by search
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
    const formatTVL = (tvl: string) => {
        const num = parseFloat(tvl);
        if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
        if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
        if (num > 0) return `$${num.toFixed(2)}`;
        return '--';
    };

    const totalPoolCount = (v2PoolCount ? Number(v2PoolCount) : 0) + (clPoolCount ? Number(clPoolCount) : 0);

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
                    <p className="text-2xl font-bold">{v2PoolCount ? Number(v2PoolCount) : '--'}</p>
                </div>
                <div className="stat-card text-center bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20">
                    <p className="text-sm text-gray-400 mb-1">V3 (Concentrated)</p>
                    <p className="text-2xl font-bold text-cyan-400">{clPoolCount ? Number(clPoolCount) : '--'}</p>
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
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 p-5 border-b border-white/5 text-sm text-gray-400 font-medium">
                    <div className="col-span-5">Pool</div>
                    <div className="col-span-2 text-center">Type</div>
                    <div className="col-span-2 text-right">TVL</div>
                    <div className="col-span-3 text-center">Action</div>
                </div>

                {/* Table Body */}
                {sortedPools.length === 0 ? (
                    <div className="p-12">
                        {allPools.length === 0 ? (
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
                            className="grid grid-cols-12 gap-4 p-5 border-b border-white/5 hover:bg-white/5 transition items-center"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + index * 0.02 }}
                        >
                            {/* Pool */}
                            <div className="col-span-5 flex items-center gap-3">
                                <div className="relative">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${pool.poolType === 'CL'
                                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                                        : 'bg-gradient-to-br from-primary to-secondary'
                                        }`}>
                                        {pool.token0.symbol[0]}
                                    </div>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold absolute left-6 top-0 border-2 border-[var(--bg-primary)] ${pool.poolType === 'CL'
                                        ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                                        : 'bg-gradient-to-br from-secondary to-accent'
                                        }`}>
                                        {pool.token1.symbol[0]}
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <div className="font-semibold text-lg">
                                        {pool.token0.symbol}/{pool.token1.symbol}
                                    </div>
                                    {pool.poolType === 'CL' && pool.tickSpacing && (
                                        <div className="text-xs text-cyan-400">
                                            {getFeeTier(pool.tickSpacing)} fee
                                        </div>
                                    )}
                                    {pool.poolType === 'V2' && (
                                        <div className="text-xs text-gray-500">
                                            {pool.stable ? 'Stable' : 'Volatile'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Type */}
                            <div className="col-span-2 text-center">
                                <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${pool.poolType === 'CL'
                                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                                    : 'bg-primary/20 text-primary border border-primary/30'
                                    }`}>
                                    {pool.poolType === 'CL' ? '⚡ V3' : '💧 V2'}
                                </span>
                            </div>

                            {/* TVL */}
                            <div className="col-span-2 text-right">
                                <div className="font-semibold">{formatTVL(pool.tvl)}</div>
                            </div>

                            {/* Action */}
                            <div className="col-span-3 text-center">
                                <Link href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&type=${pool.poolType.toLowerCase()}${pool.poolType === 'CL' && pool.tickSpacing ? `&tickSpacing=${pool.tickSpacing}` : ''}${pool.poolType === 'V2' ? `&stable=${pool.stable}` : ''}`}>
                                    <motion.button
                                        className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${pool.poolType === 'CL'
                                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30'
                                            : 'bg-gradient-to-r from-primary/20 to-secondary/20 text-primary hover:from-primary/30 hover:to-secondary/30'
                                            }`}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        Add Liquidity
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
