'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { formatUnits, Address } from 'viem';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';
import { DEFAULT_TOKEN_LIST, WSEI } from '@/config/tokens';

// ============================================
// Types
// ============================================
interface TokenInfo {
    address: Address;
    symbol: string;
    decimals: number;
    logoURI?: string;
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

// Build KNOWN_TOKENS from the global DEFAULT_TOKEN_LIST - single source of truth!
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; logoURI?: string }> = {};
for (const token of DEFAULT_TOKEN_LIST) {
    // Use lowercase address as key for easy lookup
    KNOWN_TOKENS[token.address.toLowerCase()] = {
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
    };
}
// Also add WSEI explicitly (some pools use WSEI address directly)
KNOWN_TOKENS[WSEI.address.toLowerCase()] = {
    symbol: WSEI.symbol,
    decimals: WSEI.decimals,
    logoURI: WSEI.logoURI,
};

// ============================================
// Batch RPC Helper with retry and chunking
// ============================================
async function batchRpcCall(calls: { to: string; data: string }[], retries = 2): Promise<string[]> {
    // Split into smaller chunks to avoid rate limits (10 calls per batch)
    const CHUNK_SIZE = 10;

    if (calls.length > CHUNK_SIZE) {
        const results: string[] = [];
        for (let i = 0; i < calls.length; i += CHUNK_SIZE) {
            const chunk = calls.slice(i, i + CHUNK_SIZE);
            const chunkResults = await batchRpcCall(chunk, retries);
            results.push(...chunkResults);
        }
        return results;
    }

    const batch = calls.map((call, i) => ({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: call.to, data: call.data }, 'latest'],
        id: i + 1
    }));

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch)
            });

            const results = await response.json();
            return Array.isArray(results)
                ? results.sort((a: any, b: any) => a.id - b.id).map((r: any) => r.result || '0x')
                : [results.result || '0x'];
        } catch (err) {
            if (attempt < retries) {
                // Wait before retry (100ms * attempt)
                await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
                continue;
            }
            console.warn('[batchRpcCall] All retries failed:', err);
            return calls.map(() => '0x'); // Return empty results on complete failure
        }
    }
    return calls.map(() => '0x');
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
            // Step 0: Instant load from static GAUGE_LIST for fast display
            try {
                const { GAUGE_LIST } = await import('@/config/gauges');

                // Build quick pool list from gauges for instant display
                const quickClPools: PoolData[] = GAUGE_LIST.map(g => {
                    const known0 = KNOWN_TOKENS[g.token0.toLowerCase()];
                    const known1 = KNOWN_TOKENS[g.token1.toLowerCase()];
                    return {
                        address: g.pool as Address,
                        token0: {
                            address: g.token0 as Address,
                            symbol: known0?.symbol || g.symbol0,
                            decimals: known0?.decimals || 18,
                            logoURI: known0?.logoURI,
                        },
                        token1: {
                            address: g.token1 as Address,
                            symbol: known1?.symbol || g.symbol1,
                            decimals: known1?.decimals || 18,
                            logoURI: known1?.logoURI,
                        },
                        poolType: g.type,
                        stable: false,
                        tickSpacing: g.tickSpacing,
                        reserve0: '0',
                        reserve1: '0',
                        tvl: '0',
                    };
                });

                // Set pools immediately for fast display
                if (quickClPools.length > 0) {
                    setClPools(quickClPools.filter(p => p.poolType === 'CL'));
                    setV2Pools(quickClPools.filter(p => p.poolType === 'V2'));
                    setIsLoading(false); // Show pools immediately!
                }
            } catch (e) {
                console.warn('[PoolDataProvider] Could not load GAUGE_LIST for quick display');
            }

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

                // Get logoURI from KNOWN_TOKENS if available
                const knownToken = KNOWN_TOKENS[tokenAddresses[i].toLowerCase()];

                newTokenMap.set(tokenAddresses[i].toLowerCase(), {
                    address: tokenAddresses[i] as Address,
                    symbol: knownToken?.symbol || symbol, // Prefer known symbol
                    decimals: knownToken?.decimals || decimals,
                    logoURI: knownToken?.logoURI, // Add logo from global token list
                });
            }

            setTokenInfoMap(newTokenMap);

            // Build final pool data
            const newV2Pools: PoolData[] = v2Details.map(p => {
                const t0 = newTokenMap.get(p.token0.toLowerCase());
                const t1 = newTokenMap.get(p.token1.toLowerCase());
                const r0 = t0 ? formatUnits(p.reserve0, t0.decimals) : '0';
                const r1 = t1 ? formatUnits(p.reserve1, t1.decimals) : '0';
                const known0 = KNOWN_TOKENS[p.token0.toLowerCase()];
                const known1 = KNOWN_TOKENS[p.token1.toLowerCase()];
                return {
                    address: p.addr,
                    token0: t0 || (known0 ? { address: p.token0, ...known0 } : { address: p.token0, symbol: 'UNK', decimals: 18 }),
                    token1: t1 || (known1 ? { address: p.token1, ...known1 } : { address: p.token1, symbol: 'UNK', decimals: 18 }),
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
                const known0 = KNOWN_TOKENS[p.token0.toLowerCase()];
                const known1 = KNOWN_TOKENS[p.token1.toLowerCase()];
                return {
                    address: p.addr,
                    token0: t0 || (known0 ? { address: p.token0, ...known0 } : { address: p.token0, symbol: 'UNK', decimals: 18 }),
                    token1: t1 || (known1 ? { address: p.token1, ...known1 } : { address: p.token1, symbol: 'UNK', decimals: 18 }),
                    poolType: 'CL' as const,
                    tickSpacing: p.tickSpacing,
                    reserve0: '0',
                    reserve1: '0',
                    tvl: p.liquidity > BigInt(0) ? (Number(p.liquidity) / 1e18).toFixed(2) : '0',
                };
            });

            // Fetch token balances for GAUGE_LIST pools (NOT factory pools - to avoid mismatch)
            // Get the same pool list we're displaying
            let gaugePoolsForBalance: { pool: string; token0: string; token1: string }[] = [];
            try {
                const { GAUGE_LIST } = await import('@/config/gauges');
                gaugePoolsForBalance = GAUGE_LIST.map(g => ({ pool: g.pool, token0: g.token0, token1: g.token1 }));
            } catch (e) {
                console.warn('[PoolDataProvider] Could not load GAUGE_LIST for balance fetch');
            }

            // Progressive loading: fetch each pool independently and update UI immediately
            // This way users see data as it arrives, not waiting for all pools
            const fetchPoolBalance = async (poolInfo: { pool: string; token0: string; token1: string }, retries = 2) => {
                for (let attempt = 0; attempt <= retries; attempt++) {
                    try {
                        const poolPadded = poolInfo.pool.slice(2).toLowerCase().padStart(64, '0');
                        const response = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify([
                                { jsonrpc: '2.0', method: 'eth_call', params: [{ to: poolInfo.token0, data: `0x70a08231${poolPadded}` }, 'latest'], id: 1 },
                                { jsonrpc: '2.0', method: 'eth_call', params: [{ to: poolInfo.token1, data: `0x70a08231${poolPadded}` }, 'latest'], id: 2 }
                            ])
                        });

                        const results = await response.json();
                        if (!Array.isArray(results) || results.length < 2) throw new Error('Invalid response');

                        const balance0 = results[0]?.result && results[0].result !== '0x' ? BigInt(results[0].result) : BigInt(0);
                        const balance1 = results[1]?.result && results[1].result !== '0x' ? BigInt(results[1].result) : BigInt(0);

                        const decimals0 = KNOWN_TOKENS[poolInfo.token0.toLowerCase()]?.decimals || 18;
                        const decimals1 = KNOWN_TOKENS[poolInfo.token1.toLowerCase()]?.decimals || 18;

                        const val0 = Number(balance0) / Math.pow(10, decimals0);
                        const val1 = Number(balance1) / Math.pow(10, decimals1);

                        const reserve0 = val0 > 1000 ? val0.toFixed(0) : val0.toFixed(2);
                        const reserve1 = val1 > 1000 ? val1.toFixed(0) : val1.toFixed(2);
                        const tvl = (val0 + val1).toFixed(2);

                        // Update this specific pool immediately
                        setClPools(prev => prev.map(pool =>
                            pool.address.toLowerCase() === poolInfo.pool.toLowerCase()
                                ? { ...pool, reserve0, reserve1, tvl }
                                : pool
                        ));
                        return; // Success - exit retry loop
                    } catch (err) {
                        if (attempt < retries) {
                            await new Promise(r => setTimeout(r, 200 * (attempt + 1))); // Wait before retry
                            continue;
                        }
                        console.warn(`[PoolDataProvider] Failed to fetch balance for ${poolInfo.pool} after ${retries} retries`);
                    }
                }
            };

            // Fire all pool balance fetches in parallel - each updates UI as it completes
            // Don't await - let them run independently
            gaugePoolsForBalance.forEach(p => fetchPoolBalance(p));

            // Update V2 pools with reserve data (from v2Details which is correct since no V2 pools in GAUGE_LIST)
            const v2ReservesMap = new Map<string, { reserve0: bigint; reserve1: bigint }>();
            v2Details.forEach(p => v2ReservesMap.set(p.addr.toLowerCase(), { reserve0: p.reserve0, reserve1: p.reserve1 }));
            setV2Pools(prev => prev.map(pool => {
                const reserves = v2ReservesMap.get(pool.address.toLowerCase());
                if (reserves) {
                    const r0 = Number(reserves.reserve0) / 1e18;
                    const r1 = Number(reserves.reserve1) / 1e18;
                    return { ...pool, reserve0: r0.toString(), reserve1: r1.toString(), tvl: (r0 + r1).toFixed(2) };
                }
                return pool;
            }));

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

    // Fetch gauge data using static GAUGE_LIST + live weights + fee rewards
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

            // Step 2: Get FeesVotingReward addresses for each gauge
            const feeRewardCalls = GAUGE_LIST.map(g => ({
                to: V2_CONTRACTS.Voter,
                data: `0xc4f08165${g.gauge.slice(2).padStart(64, '0')}` // gaugeToFees(address)
            }));

            const feeRewardResults = await batchRpcCall(feeRewardCalls);
            const feeRewardAddresses = feeRewardResults.map(r =>
                r !== '0x' && r !== '0x' + '0'.repeat(64) ? `0x${r.slice(-40)}` : null
            );

            // Step 3: Calculate current epoch start (Thursday 00:00 UTC)
            const EPOCH_DURATION = 604800; // 7 days in seconds
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const epochStart = Math.floor(currentTimestamp / EPOCH_DURATION) * EPOCH_DURATION;
            const epochStartHex = epochStart.toString(16).padStart(64, '0');

            // Step 4: For each fee reward contract, get the reward amounts for token0 and token1
            const feeAmountCalls: { to: string; data: string; gaugeIdx: number; tokenAddr: string; symbol: string; decimals: number }[] = [];

            for (let i = 0; i < GAUGE_LIST.length; i++) {
                const feeRewardAddr = feeRewardAddresses[i];
                if (!feeRewardAddr) continue;

                const g = GAUGE_LIST[i];
                const token0Padded = g.token0.slice(2).padStart(64, '0');
                const token1Padded = g.token1.slice(2).padStart(64, '0');
                const known0 = KNOWN_TOKENS[g.token0.toLowerCase()];
                const known1 = KNOWN_TOKENS[g.token1.toLowerCase()];

                // tokenRewardsPerEpoch(token, epochStart) - selector: 0x51c4f989
                feeAmountCalls.push({
                    to: feeRewardAddr,
                    data: `0x51c4f989${token0Padded}${epochStartHex}`,
                    gaugeIdx: i,
                    tokenAddr: g.token0,
                    symbol: known0?.symbol || g.symbol0,
                    decimals: known0?.decimals || 18,
                });
                feeAmountCalls.push({
                    to: feeRewardAddr,
                    data: `0x51c4f989${token1Padded}${epochStartHex}`,
                    gaugeIdx: i,
                    tokenAddr: g.token1,
                    symbol: known1?.symbol || g.symbol1,
                    decimals: known1?.decimals || 18,
                });
            }

            // Fetch fee amounts
            const feeAmounts: Map<number, RewardToken[]> = new Map();
            if (feeAmountCalls.length > 0) {
                const feeResults = await batchRpcCall(feeAmountCalls.map(c => ({ to: c.to, data: c.data })));

                for (let i = 0; i < feeAmountCalls.length; i++) {
                    const call = feeAmountCalls[i];
                    const amount = feeResults[i] !== '0x' ? BigInt(feeResults[i]) : BigInt(0);

                    if (amount > BigInt(0)) {
                        const existing = feeAmounts.get(call.gaugeIdx) || [];
                        existing.push({
                            address: call.tokenAddr as Address,
                            symbol: call.symbol,
                            amount,
                            decimals: call.decimals,
                        });
                        feeAmounts.set(call.gaugeIdx, existing);
                    }
                }
            }

            // Build gauge list from static config with live weights and fee rewards
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
                    feeReward: (feeRewardAddresses[i] || '0x0000000000000000000000000000000000000000') as Address,
                    bribeReward: '0x0000000000000000000000000000000000000000' as Address,
                    rewardTokens: feeAmounts.get(i) || [],
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

    // Auto-refresh every 10 minutes (only if page is still open)
    useEffect(() => {
        const TEN_MINUTES = 10 * 60 * 1000;
        const interval = setInterval(fetchAllData, TEN_MINUTES);
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
