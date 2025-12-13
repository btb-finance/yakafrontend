'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { V2_CONTRACTS } from '@/config/contracts';
import { POOL_FACTORY_ABI, POOL_ABI, ERC20_ABI } from '@/config/abis';

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

            newPools.push({
                address: validPoolAddresses[i],
                token0: { address: token0Result.result as Address, ...token0Info },
                token1: { address: token1Result.result as Address, ...token1Info },
                stable: stableResult.result as boolean,
                reserve0,
                reserve1,
                tvl,
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

    return (
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Pool</span> Explorer
                </h1>
                <p className="text-gray-400 max-w-lg mx-auto">
                    Discover pools and find the best opportunities. {poolCount ? `${Number(poolCount)} pools available.` : ''}
                </p>
            </motion.div>

            {/* Filters */}
            <motion.div
                className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
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

                {/* Search */}
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search pools..."
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-primary w-48"
                />
            </motion.div>

            {/* Pools Table */}
            <motion.div
                className="glass-card overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 text-sm text-gray-400 font-medium">
                    <div className="col-span-4">Pool</div>
                    <div className="col-span-2 text-center">Type</div>
                    <div className="col-span-2 text-right">Reserve 0</div>
                    <div className="col-span-2 text-right">Reserve 1</div>
                    <div className="col-span-2 text-center">Action</div>
                </div>

                {/* Table Body */}
                {filteredPools.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        {pools.length === 0 ? 'Loading pools...' : 'No pools found'}
                    </div>
                ) : (
                    filteredPools.map((pool, index) => (
                        <motion.div
                            key={pool.address}
                            className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition items-center"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + index * 0.05 }}
                        >
                            {/* Pool */}
                            <div className="col-span-4 flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                                        {pool.token0.symbol[0]}
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-sm font-bold absolute -right-2 top-0 border-2 border-bg-primary">
                                        {pool.token1.symbol[0]}
                                    </div>
                                </div>
                                <div className="ml-2">
                                    <div className="font-semibold">
                                        {pool.token0.symbol}/{pool.token1.symbol}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {pool.stable ? 'Stable' : 'Volatile'}
                                    </div>
                                </div>
                            </div>

                            {/* Type */}
                            <div className="col-span-2 text-center">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                    V2
                                </span>
                            </div>

                            {/* Reserve 0 */}
                            <div className="col-span-2 text-right text-sm">
                                {parseFloat(pool.reserve0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {pool.token0.symbol}
                            </div>

                            {/* Reserve 1 */}
                            <div className="col-span-2 text-right text-sm">
                                {parseFloat(pool.reserve1).toLocaleString(undefined, { maximumFractionDigits: 2 })} {pool.token1.symbol}
                            </div>

                            {/* Action */}
                            <div className="col-span-2 text-center">
                                <Link href="/liquidity">
                                    <button className="btn-secondary py-1.5 px-3 text-sm">
                                        Deposit
                                    </button>
                                </Link>
                            </div>
                        </motion.div>
                    ))
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
                    <p className="text-sm text-gray-400 mb-1">Total Pools</p>
                    <p className="text-2xl font-bold">{poolCount ? Number(poolCount).toLocaleString() : '--'}</p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400 mb-1">Displayed</p>
                    <p className="text-2xl font-bold">{filteredPools.length}</p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400 mb-1">Network</p>
                    <p className="text-2xl font-bold">Sei Mainnet</p>
                </div>
            </motion.div>
        </div>
    );
}
