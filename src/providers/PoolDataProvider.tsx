'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { formatUnits, Address } from 'viem';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';

// ============================================
// Types
// ============================================
interface TokenInfo {
    address: Address;
    symbol: string;
    decimals: number;
}

interface PoolData {
    address: Address;
    token0: TokenInfo;
    token1: TokenInfo;
    poolType: 'V2' | 'CL';
    stable?: boolean;
    tickSpacing?: number;
    reserve0: string;
    reserve1: string;
    tvl: string;
    rewardRate?: bigint;
}

// Gauge/Voting Types
export interface RewardToken {
    address: Address;
    symbol: string;
    amount: bigint;
    decimals: number;
}

export interface GaugeInfo {
    pool: Address;
    gauge: Address;
    token0: Address;
    token1: Address;
    symbol0: string;
    symbol1: string;
    poolType: 'V2' | 'CL';
    isStable: boolean;
    weight: bigint;
    weightPercent: number;
    isAlive: boolean;
    feeReward: Address;
    bribeReward: Address;
    rewardTokens: RewardToken[];
}

interface PoolDataContextType {
    v2Pools: PoolData[];
    clPools: PoolData[];
    allPools: PoolData[];
    tokenInfoMap: Map<string, TokenInfo>;
    poolRewards: Map<string, bigint>;
    // Gauge/Voting data
    gauges: GaugeInfo[];
    totalVoteWeight: bigint;
    gaugesLoading: boolean;
    isLoading: boolean;
    refetch: () => void;
    getTokenInfo: (address: string) => TokenInfo | undefined;
}

const PoolDataContext = createContext<PoolDataContextType | undefined>(undefined);

// Known token symbols and decimals
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
    '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7': { symbol: 'WSEI', decimals: 18 },
    '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392': { symbol: 'USDC', decimals: 6 },
    '0x188e342cdedd8fdf84d765eb59b7433d30f5484d': { symbol: 'WIND', decimals: 18 },
    '0x0000000000000000000000000000000000000000': { symbol: 'SEI', decimals: 18 },
    '0xb75d0b03c06a926e488e2659df1a861f860bd3d1': { symbol: 'USDT', decimals: 6 },
    '0x0555e30da8f98308edb960aa94c0db47230d2b9c': { symbol: 'WBTC', decimals: 8 },
    '0x9151434b16b9763660705744891fa906f660ecc5': { symbol: 'USDT', decimals: 6 },
    '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1': { symbol: 'USDC.n', decimals: 6 },
    '0x0a526e425809aea71eb279d24ae22dee6c92a4fe': { symbol: 'DRG', decimals: 18 },
    '0x95597eb8d227a7c4b4f5e807a815c5178ee6dbe1': { symbol: 'MILLI', decimals: 6 },
    '0x58e11d8ed38a2061361e90916540c5c32281a380': { symbol: 'GGC', decimals: 18 },
    '0xc18b6a15fb0ceaf5eb18696eefcb5bc7b9107149': { symbol: 'POPO', decimals: 18 },
    '0xf9bdbf259ece5ae17e29bf92eb7abd7b8b465db9': { symbol: 'Frog', decimals: 18 },
    '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598': { symbol: 'SEIYAN', decimals: 6 },
    '0xdf3d7dd2848f491645974215474c566e79f2e538': { symbol: 'S8N', decimals: 18 },
    '0xf63980e3818607c0797e994cfd34c1c592968469': { symbol: 'SUPERSEIZ', decimals: 18 },
    '0x443ac9f358226f5f48f2cd10bc0121e7a6176323': { symbol: 'BAT', decimals: 18 },
    '0x888888b7ae1b196e4dfd25c992c9ad13358f0e24': { symbol: 'YKP', decimals: 18 },
    '0x888d81e3ea5e8362b5f69188cbcf34fa8da4b888': { symbol: 'LARRY', decimals: 18 },
    '0x160345fc359604fc6e70e3c5facbde5f7a9342d8': { symbol: 'WETH', decimals: 18 },
};

// ============================================
// Batch RPC Helper
// ============================================
async function batchRpcCall(calls: { to: string; data: string }[]): Promise<string[]> {
    const batch = calls.map((call, i) => ({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: call.to, data: call.data }, 'latest'],
        id: i + 1
    }));

    const response = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
    });

    const results = await response.json();
    return Array.isArray(results)
        ? results.sort((a: any, b: any) => a.id - b.id).map((r: any) => r.result || '0x')
        : [results.result || '0x'];
}

// ============================================
// Provider Component
// ============================================
export function PoolDataProvider({ children }: { children: ReactNode }) {
    const [v2Pools, setV2Pools] = useState<PoolData[]>([]);
    const [clPools, setClPools] = useState<PoolData[]>([]);
    const [tokenInfoMap, setTokenInfoMap] = useState<Map<string, TokenInfo>>(new Map());
    const [poolRewards, setPoolRewards] = useState<Map<string, bigint>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    // Gauge/Voting state
    const [gauges, setGauges] = useState<GaugeInfo[]>([]);
    const [totalVoteWeight, setTotalVoteWeight] = useState<bigint>(BigInt(0));
    const [gaugesLoading, setGaugesLoading] = useState(true);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        setGaugesLoading(true);
        try {
            // Step 1: Get pool counts
            const countCalls = [
                { to: V2_CONTRACTS.PoolFactory, data: '0xefde4e64' }, // allPoolsLength()
                { to: CL_CONTRACTS.CLFactory, data: '0xefde4e64' },
            ];
            const [v2CountHex, clCountHex] = await batchRpcCall(countCalls);
            const v2Count = Math.min(parseInt(v2CountHex, 16) || 0, 30);
            const clCount = Math.min(parseInt(clCountHex, 16) || 0, 30);

            // Step 2: Get pool addresses
            const addressCalls: { to: string; data: string }[] = [];
            for (let i = 0; i < v2Count; i++) {
                addressCalls.push({
                    to: V2_CONTRACTS.PoolFactory,
                    data: `0x41d1de97${i.toString(16).padStart(64, '0')}` // allPools(uint256)
                });
            }
            for (let i = 0; i < clCount; i++) {
                addressCalls.push({
                    to: CL_CONTRACTS.CLFactory,
                    data: `0x41d1de97${i.toString(16).padStart(64, '0')}`
                });
            }

            const addressResults = await batchRpcCall(addressCalls);
            const v2Addresses = addressResults.slice(0, v2Count)
                .map(r => r.length >= 42 ? `0x${r.slice(-40)}` as Address : null)
                .filter((addr): addr is Address => addr !== null && addr !== '0x0000000000000000000000000000000000000000');
            const clAddresses = addressResults.slice(v2Count)
                .map(r => r.length >= 42 ? `0x${r.slice(-40)}` as Address : null)
                .filter((addr): addr is Address => addr !== null && addr !== '0x0000000000000000000000000000000000000000');

            // Step 3: Get pool details (token0, token1, stable/tickSpacing, reserves/liquidity)
            const detailCalls: { to: string; data: string }[] = [];

            // V2 pools: token0, token1, stable, getReserves
            for (const addr of v2Addresses) {
                detailCalls.push({ to: addr, data: '0x0dfe1681' }); // token0()
                detailCalls.push({ to: addr, data: '0xd21220a7' }); // token1()
                detailCalls.push({ to: addr, data: '0x22be3de1' }); // stable()
                detailCalls.push({ to: addr, data: '0x0902f1ac' }); // getReserves()
            }

            // CL pools: token0, token1, tickSpacing, liquidity
            for (const addr of clAddresses) {
                detailCalls.push({ to: addr, data: '0x0dfe1681' }); // token0()
                detailCalls.push({ to: addr, data: '0xd21220a7' }); // token1()
                detailCalls.push({ to: addr, data: '0xd0c93a7c' }); // tickSpacing()
                detailCalls.push({ to: addr, data: '0x1a686502' }); // liquidity()
            }

            const detailResults = await batchRpcCall(detailCalls);

            // Parse V2 pool details
            const v2Details: { addr: Address; token0: Address; token1: Address; stable: boolean; reserve0: bigint; reserve1: bigint }[] = [];
            for (let i = 0; i < v2Addresses.length; i++) {
                const base = i * 4;
                v2Details.push({
                    addr: v2Addresses[i],
                    token0: `0x${detailResults[base].slice(-40)}` as Address,
                    token1: `0x${detailResults[base + 1].slice(-40)}` as Address,
                    stable: detailResults[base + 2] !== '0x' && parseInt(detailResults[base + 2], 16) === 1,
                    reserve0: detailResults[base + 3].length >= 66 ? BigInt('0x' + detailResults[base + 3].slice(2, 66)) : BigInt(0),
                    reserve1: detailResults[base + 3].length >= 130 ? BigInt('0x' + detailResults[base + 3].slice(66, 130)) : BigInt(0),
                });
            }

            // Parse CL pool details
            const clOffset = v2Addresses.length * 4;
            const clDetails: { addr: Address; token0: Address; token1: Address; tickSpacing: number; liquidity: bigint }[] = [];
            for (let i = 0; i < clAddresses.length; i++) {
                const base = clOffset + i * 4;
                clDetails.push({
                    addr: clAddresses[i],
                    token0: `0x${detailResults[base].slice(-40)}` as Address,
                    token1: `0x${detailResults[base + 1].slice(-40)}` as Address,
                    tickSpacing: parseInt(detailResults[base + 2], 16) || 0,
                    liquidity: detailResults[base + 3] !== '0x' ? BigInt(detailResults[base + 3]) : BigInt(0),
                });
            }

            // Step 4: Get unique token addresses and fetch their info
            const allTokens = new Set<string>();
            v2Details.forEach(p => { allTokens.add(p.token0.toLowerCase()); allTokens.add(p.token1.toLowerCase()); });
            clDetails.forEach(p => { allTokens.add(p.token0.toLowerCase()); allTokens.add(p.token1.toLowerCase()); });

            const tokenCalls: { to: string; data: string }[] = [];
            const tokenAddresses = [...allTokens];
            for (const addr of tokenAddresses) {
                tokenCalls.push({ to: addr, data: '0x95d89b41' }); // symbol()
                tokenCalls.push({ to: addr, data: '0x313ce567' }); // decimals()
            }

            const tokenResults = await batchRpcCall(tokenCalls);
            const newTokenMap = new Map<string, TokenInfo>();

            for (let i = 0; i < tokenAddresses.length; i++) {
                const symbolHex = tokenResults[i * 2];
                const decimalsHex = tokenResults[i * 2 + 1];

                let symbol = 'UNKNOWN';
                try {
                    if (symbolHex && symbolHex.length > 2) {
                        const hex = symbolHex.slice(2);
                        if (hex.length >= 128) {
                            const len = parseInt(hex.slice(64, 128), 16);
                            symbol = Buffer.from(hex.slice(128, 128 + len * 2), 'hex').toString('utf8');
                        }
                    }
                } catch { }

                const decimals = decimalsHex ? parseInt(decimalsHex, 16) || 18 : 18;

                newTokenMap.set(tokenAddresses[i].toLowerCase(), {
                    address: tokenAddresses[i] as Address,
                    symbol,
                    decimals,
                });
            }

            setTokenInfoMap(newTokenMap);

            // Build final pool data
            const newV2Pools: PoolData[] = v2Details.map(p => {
                const t0 = newTokenMap.get(p.token0.toLowerCase());
                const t1 = newTokenMap.get(p.token1.toLowerCase());
                const r0 = t0 ? formatUnits(p.reserve0, t0.decimals) : '0';
                const r1 = t1 ? formatUnits(p.reserve1, t1.decimals) : '0';
                return {
                    address: p.addr,
                    token0: t0 || { address: p.token0, symbol: 'UNK', decimals: 18 },
                    token1: t1 || { address: p.token1, symbol: 'UNK', decimals: 18 },
                    poolType: 'V2' as const,
                    stable: p.stable,
                    reserve0: r0,
                    reserve1: r1,
                    tvl: (parseFloat(r0) + parseFloat(r1)).toFixed(2),
                };
            });

            const newClPools: PoolData[] = clDetails.map(p => {
                const t0 = newTokenMap.get(p.token0.toLowerCase());
                const t1 = newTokenMap.get(p.token1.toLowerCase());
                return {
                    address: p.addr,
                    token0: t0 || { address: p.token0, symbol: 'UNK', decimals: 18 },
                    token1: t1 || { address: p.token1, symbol: 'UNK', decimals: 18 },
                    poolType: 'CL' as const,
                    tickSpacing: p.tickSpacing,
                    reserve0: '0',
                    reserve1: '0',
                    tvl: p.liquidity > BigInt(0) ? (Number(p.liquidity) / 1e18).toFixed(2) : '0',
                };
            });

            setV2Pools(newV2Pools);
            setClPools(newClPools);

            // Step 5: Fetch reward rates for pools with gauges
            const allPoolAddrs = [...v2Addresses, ...clAddresses];
            const gaugeCalls = allPoolAddrs.map(addr => ({
                to: V2_CONTRACTS.Voter,
                data: `0xb9a09fd5${addr.slice(2).padStart(64, '0')}` // gauges(address)
            }));

            const gaugeResults = await batchRpcCall(gaugeCalls);
            const gaugeAddresses = gaugeResults.map(r => r !== '0x' && r !== '0x' + '0'.repeat(64) ? `0x${r.slice(-40)}` : null);

            const rewardCalls = gaugeAddresses
                .map((g, i) => g ? { to: g, data: '0x7b0a47ee', poolAddr: allPoolAddrs[i] } : null)
                .filter((c): c is { to: string; data: string; poolAddr: Address } => c !== null);

            if (rewardCalls.length > 0) {
                const rewardResults = await batchRpcCall(rewardCalls);
                const newRewards = new Map<string, bigint>();
                rewardCalls.forEach((call, i) => {
                    const rate = rewardResults[i] !== '0x' ? BigInt(rewardResults[i]) : BigInt(0);
                    if (rate > BigInt(0)) {
                        newRewards.set(call.poolAddr.toLowerCase(), rate);
                    }
                });
                setPoolRewards(newRewards);
            }

            setIsLoading(false);

            // ============================================
            // Step 6: Fetch Gauge/Voting Data (for /vote page)
            // ============================================
            await fetchGaugeData(newTokenMap);

        } catch (err) {
            console.error('[PoolDataProvider] Fetch error:', err);
            setIsLoading(false);
            setGaugesLoading(false);
        }
    }, []);

    // Fetch gauge data using static GAUGE_LIST + live weights
    const fetchGaugeData = useCallback(async (_tokenMap: Map<string, TokenInfo>) => {
        try {
            // Import static gauge config
            const { GAUGE_LIST } = await import('@/config/gauges');

            // Get total weight and individual weights from Voter
            const weightCalls: { to: string; data: string }[] = [
                { to: V2_CONTRACTS.Voter, data: '0x96c82e57' }, // totalWeight()
            ];

            // Add weight call for each gauge's pool
            for (const g of GAUGE_LIST) {
                const poolPadded = g.pool.slice(2).padStart(64, '0');
                weightCalls.push({ to: V2_CONTRACTS.Voter, data: `0xa7cac846${poolPadded}` }); // weights(pool)
            }

            const weightResults = await batchRpcCall(weightCalls);
            const totalWeight = weightResults[0] !== '0x' ? BigInt(weightResults[0]) : BigInt(0);
            setTotalVoteWeight(totalWeight);

            // Build gauge list from static config with live weights
            const gaugeList: GaugeInfo[] = GAUGE_LIST.map((g, i) => {
                const weight = weightResults[i + 1] !== '0x' ? BigInt(weightResults[i + 1]) : BigInt(0);
                const weightPercent = totalWeight > BigInt(0)
                    ? Number((weight * BigInt(10000)) / totalWeight) / 100
                    : 0;

                return {
                    pool: g.pool as Address,
                    gauge: g.gauge as Address,
                    token0: g.token0 as Address,
                    token1: g.token1 as Address,
                    symbol0: g.symbol0,
                    symbol1: g.symbol1,
                    poolType: g.type,
                    isStable: false,
                    weight,
                    weightPercent,
                    isAlive: g.isAlive,
                    feeReward: '0x0000000000000000000000000000000000000000' as Address,
                    bribeReward: '0x0000000000000000000000000000000000000000' as Address,
                    rewardTokens: [],
                };
            });

            setGauges(gaugeList);
        } catch (err) {
            console.error('[PoolDataProvider] Gauge fetch error:', err);
        }
        setGaugesLoading(false);
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Auto-refresh every 30s
    useEffect(() => {
        const interval = setInterval(fetchAllData, 30000);
        return () => clearInterval(interval);
    }, [fetchAllData]);

    const getTokenInfo = useCallback((address: string) => {
        return tokenInfoMap.get(address.toLowerCase());
    }, [tokenInfoMap]);

    const value: PoolDataContextType = {
        v2Pools,
        clPools,
        allPools: [...v2Pools, ...clPools],
        tokenInfoMap,
        poolRewards,
        gauges,
        totalVoteWeight,
        gaugesLoading,
        isLoading,
        refetch: fetchAllData,
        getTokenInfo,
    };

    return (
        <PoolDataContext.Provider value={value}>
            {children}
        </PoolDataContext.Provider>
    );
}

// ============================================
// Hook
// ============================================
export function usePoolData() {
    const context = useContext(PoolDataContext);
    if (!context) {
        throw new Error('usePoolData must be used within PoolDataProvider');
    }
    return context;
}
