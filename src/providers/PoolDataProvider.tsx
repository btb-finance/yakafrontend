'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { formatUnits, Address } from 'viem';
import { useAccount } from 'wagmi';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';
import { DEFAULT_TOKEN_LIST, WSEI } from '@/config/tokens';
import { RPC_ENDPOINTS, getSecondaryRpc, getPrimaryRpc } from '@/utils/rpc';
import { useWindPrice as useWindPriceHook } from '@/hooks/useWindPrice';

// Goldsky Subgraph URL for pool data (v2.0.0 with user data)
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmjlh2t5mylhg01tm7t545rgk/subgraphs/windswap-cl/2.0.0/gn';

// DexScreener API for accurate 24h volume data
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/pairs/seiv2';
const DEXSCREENER_CACHE_KEY = 'windswap_dexscreener_volumes';
const DEXSCREENER_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Load cached DexScreener volumes
function loadCachedDexScreenerVolumes(): Map<string, number> | null {
    try {
        const cached = localStorage.getItem(DEXSCREENER_CACHE_KEY);
        if (!cached) return null;

        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp > DEXSCREENER_CACHE_TTL) {
            console.log('[DexScreener] Cache expired, will fetch fresh data');
            return null;
        }

        console.log(`[DexScreener] 📦 Loaded cached volume data (${Object.keys(data).length} pools)`);
        return new Map(Object.entries(data));
    } catch {
        return null;
    }
}

// Save DexScreener volumes to cache
function saveDexScreenerVolumes(volumeMap: Map<string, number>): void {
    try {
        const data: Record<string, number> = {};
        volumeMap.forEach((vol, addr) => { data[addr] = vol; });
        localStorage.setItem(DEXSCREENER_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch {
        // Ignore storage errors
    }
}

// DexScreener pool data interface
interface DexScreenerPoolData {
    volume24h: number;
    tvlUsd: number;
    reserve0: number; // base token
    reserve1: number; // quote token
    priceUsd: number; // base token price in USD
    baseTokenSymbol: string;
    quoteTokenSymbol: string;
}

// Fetch pool data from DexScreener for multiple pools (with caching)
async function fetchDexScreenerData(poolAddresses: string[]): Promise<Map<string, DexScreenerPoolData>> {
    // Try cache first
    // Always fetch fresh data (cache is just for volume backup)

    const dataMap = new Map<string, DexScreenerPoolData>();
    if (poolAddresses.length === 0) return dataMap;

    try {
        // DexScreener allows multiple addresses comma-separated (max 30)
        const addresses = poolAddresses.slice(0, 30).join(',');
        const response = await fetch(`${DEXSCREENER_API}/${addresses}`);
        const data = await response.json();

        if (data.pairs && Array.isArray(data.pairs)) {
            for (const pair of data.pairs) {
                const addr = pair.pairAddress?.toLowerCase();
                if (addr) {
                    dataMap.set(addr, {
                        volume24h: pair.volume?.h24 || 0,
                        tvlUsd: pair.liquidity?.usd || 0,
                        reserve0: pair.liquidity?.base || 0,
                        reserve1: pair.liquidity?.quote || 0,
                        priceUsd: parseFloat(pair.priceUsd || '0'),
                        baseTokenSymbol: pair.baseToken?.symbol || '',
                        quoteTokenSymbol: pair.quoteToken?.symbol || '',
                    });
                }
            }
        }

        // Save volume to cache (for backwards compatibility)
        if (dataMap.size > 0) {
            const volumeMap = new Map<string, number>();
            dataMap.forEach((d, addr) => volumeMap.set(addr, d.volume24h));
            saveDexScreenerVolumes(volumeMap);
        }

        console.log(`[DexScreener] ✅ Got data for ${dataMap.size} pools (volume + TVL + reserves)`);
    } catch (err) {
        console.warn('[DexScreener] Failed to fetch data:', err);
    }

    return dataMap;
}


// Fetch pools from subgraph
async function fetchPoolsFromSubgraph(): Promise<{
    pools: Array<{
        id: string;
        token0: { id: string; symbol: string; decimals: number };
        token1: { id: string; symbol: string; decimals: number };
        tickSpacing: number;
        totalValueLockedUSD: string;
        volumeUSD: string;
    }>;
} | null> {
    try {
        const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `{
                    pools(first: 100, orderBy: totalValueLockedUSD, orderDirection: desc) {
                        id
                        token0 { id symbol decimals }
                        token1 { id symbol decimals }
                        tickSpacing
                        totalValueLockedUSD
                        volumeUSD
                    }
                }`
            }),
        });
        const json = await response.json();
        if (json.errors) {
            console.warn('[Subgraph] Query errors:', json.errors);
            return null;
        }
        return json.data;
    } catch (err) {
        console.warn('[Subgraph] Fetch error:', err);
        return null;
    }
}

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
    volume24h?: string; // 24h volume from DexScreener
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

export interface StakedPosition {
    tokenId: bigint;
    gaugeAddress: string;
    poolAddress: string;
    token0: string;
    token1: string;
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
    tickSpacing: number;
    tickLower: number;
    tickUpper: number;
    currentTick: number;
    liquidity: bigint;
    pendingRewards: bigint;
    rewardRate: bigint;
}

export interface VeNFT {
    tokenId: bigint;
    amount: bigint;          // locked amount (renamed from lockedAmount for consistency)
    end: bigint;             // lock end timestamp
    isPermanent: boolean;    // permanent lock flag
    votingPower: bigint;
    claimable: bigint;       // claimable rebases
}

interface PoolDataContextType {
    v2Pools: PoolData[];
    clPools: PoolData[];
    allPools: PoolData[];
    tokenInfoMap: Map<string, TokenInfo>;
    poolRewards: Map<string, bigint>;
    // Prices for APR calculation (loaded with priority pool)
    windPrice: number;
    seiPrice: number;
    // Gauge/Voting data
    gauges: GaugeInfo[];
    totalVoteWeight: bigint;
    gaugesLoading: boolean;
    // Staked positions (prefetched for portfolio)
    stakedPositions: StakedPosition[];
    stakedLoading: boolean;
    refetchStaked: () => void;
    // VeNFT data (prefetched for portfolio and vote)
    veNFTs: VeNFT[];
    veNFTsLoading: boolean;
    refetchVeNFTs: () => void;
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

// Priority pool address - WIND/WSEI pool loads first with its APR
const PRIORITY_POOL = '0xc7035A2Ef7C685Fc853475744623A0F164541b69'.toLowerCase();
const PRIORITY_GAUGE = '0x65e450a9E7735c3991b1495C772aeDb33A1A91Cb'.toLowerCase();



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

    // Use secondary RPC for batch calls, fallback to primary on retry
    const rpcs = [getSecondaryRpc(), getPrimaryRpc()];

    for (let attempt = 0; attempt <= retries; attempt++) {
        const rpcUrl = rpcs[Math.min(attempt, rpcs.length - 1)];
        try {
            const response = await fetch(rpcUrl, {
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
                await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
                continue;
            }
            console.warn('[batchRpcCall] All retries failed:', err);
            return calls.map(() => '0x');
        }
    }
    return calls.map(() => '0x');
}

// ============================================
// Provider Component
// ============================================
const CACHE_KEY = 'windswap_pool_cache';
const CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour

// Helper to load from localStorage
function loadCachedPools(): { clPools: PoolData[]; v2Pools: PoolData[]; timestamp: number } | null {
    if (typeof window === 'undefined') return null;
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            // Check if cache is still valid (less than 1 hour old)
            if (Date.now() - data.timestamp < CACHE_EXPIRY) {
                console.log('[PoolDataProvider] ⚡ Loading from cache');
                return data;
            }
        }
    } catch (e) {
        console.warn('[PoolDataProvider] Cache read error');
    }
    return null;
}

// Helper to save to localStorage
function saveCachePools(clPools: PoolData[], v2Pools: PoolData[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            clPools,
            v2Pools,
            timestamp: Date.now()
        }));
        console.log('[PoolDataProvider] 💾 Saved to cache');
    } catch (e) {
        console.warn('[PoolDataProvider] Cache write error');
    }
}

export function PoolDataProvider({ children }: { children: ReactNode }) {
    const { address } = useAccount();
    const [v2Pools, setV2Pools] = useState<PoolData[]>([]);
    const [clPools, setClPools] = useState<PoolData[]>([]);
    const [tokenInfoMap, setTokenInfoMap] = useState<Map<string, TokenInfo>>(new Map());
    const [poolRewards, setPoolRewards] = useState<Map<string, bigint>>(new Map());
    const [windPrice, setWindPrice] = useState<number>(0.005); // Default fallback
    const [seiPrice, setSeiPrice] = useState<number>(0.35); // Default fallback
    const [isLoading, setIsLoading] = useState(true);

    // Use the on-chain price hook as primary source
    const { windPrice: onChainWindPrice, seiPrice: onChainSeiPrice } = useWindPriceHook();

    // Sync on-chain prices to local state (only if they're valid)
    useEffect(() => {
        if (onChainWindPrice > 0) {
            setWindPrice(onChainWindPrice);
            console.log(`[PoolDataProvider] 💰 WIND price from on-chain: $${onChainWindPrice.toFixed(6)}`);
        }
        if (onChainSeiPrice > 0) {
            setSeiPrice(onChainSeiPrice);
            console.log(`[PoolDataProvider] 💰 SEI price from on-chain: $${onChainSeiPrice.toFixed(4)}`);
        }
    }, [onChainWindPrice, onChainSeiPrice]);

    // Gauge/Voting state
    const [gauges, setGauges] = useState<GaugeInfo[]>([]);
    const [totalVoteWeight, setTotalVoteWeight] = useState<bigint>(BigInt(0));
    const [gaugesLoading, setGaugesLoading] = useState(true);

    // Staked positions state (prefetched for portfolio)
    const [stakedPositions, setStakedPositions] = useState<StakedPosition[]>([]);
    const [stakedLoading, setStakedLoading] = useState(true);

    // VeNFT state (prefetched for portfolio and vote)
    const [veNFTs, setVeNFTs] = useState<VeNFT[]>([]);
    const [veNFTsLoading, setVeNFTsLoading] = useState(true);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        setGaugesLoading(true);
        try {
            // Step 0: Try loading from localStorage cache FIRST (instant!)
            const cached = loadCachedPools();
            if (cached && cached.clPools.length > 0) {
                setClPools(cached.clPools);
                setV2Pools(cached.v2Pools);
                setIsLoading(false); // Show cached data immediately!
                console.log(`[PoolDataProvider] ⚡ Loaded ${cached.clPools.length} pools from cache`);
            }

            // Step 1: Try fetching from SUBGRAPH (primary source - all pools!)
            console.log('[PoolDataProvider] 🔍 Fetching pools from subgraph...');
            const subgraphData = await fetchPoolsFromSubgraph();

            if (subgraphData && subgraphData.pools.length > 0) {
                console.log(`[PoolDataProvider] ✅ Got ${subgraphData.pools.length} pools from subgraph`);

                // Convert subgraph pools to PoolData format
                const subgraphPools: PoolData[] = subgraphData.pools.map(p => {
                    const known0 = KNOWN_TOKENS[p.token0.id.toLowerCase()];
                    const known1 = KNOWN_TOKENS[p.token1.id.toLowerCase()];

                    // Parse TVL (subgraph gives us USD value directly)
                    const tvl = parseFloat(p.totalValueLockedUSD || '0');

                    return {
                        address: p.id as Address,
                        token0: {
                            address: p.token0.id as Address,
                            symbol: known0?.symbol || p.token0.symbol,
                            decimals: known0?.decimals || p.token0.decimals,
                            logoURI: known0?.logoURI,
                        },
                        token1: {
                            address: p.token1.id as Address,
                            symbol: known1?.symbol || p.token1.symbol,
                            decimals: known1?.decimals || p.token1.decimals,
                            logoURI: known1?.logoURI,
                        },
                        poolType: 'CL' as const,
                        stable: false,
                        tickSpacing: p.tickSpacing,
                        reserve0: '0', // Subgraph doesn't give individual reserves
                        reserve1: '0',
                        tvl: tvl > 0 ? tvl.toFixed(2) : '0',
                    };
                });

                // Sort pools to put priority pool FIRST for immediate display
                subgraphPools.sort((a, b) => {
                    const aIsPriority = a.address.toLowerCase() === PRIORITY_POOL;
                    const bIsPriority = b.address.toLowerCase() === PRIORITY_POOL;
                    if (aIsPriority && !bIsPriority) return -1;
                    if (bIsPriority && !aIsPriority) return 1;
                    return 0;
                });

                // Set pools from subgraph (for immediate display - priority pool first!)
                setClPools(subgraphPools);
                setIsLoading(false);
                console.log(`[PoolDataProvider] 📊 Showing ${subgraphPools.length} pools from subgraph (priority pool first)`);

                // Fetch volume + TVL + PRICES from DexScreener (non-blocking) - replaces ALL RPC fetching!
                const poolAddresses = subgraphPools.map(p => p.address);
                fetchDexScreenerData(poolAddresses).then((dataMap: Map<string, DexScreenerPoolData>) => {
                    if (dataMap.size > 0) {
                        let detectedWindPrice = 0;
                        let detectedSeiPrice = 0;

                        // First, get SEI price from USDC/WSEI pool
                        const usdcWseiPool = '0x587b82b8ed109d8587a58f9476a8d4268ae945b1'.toLowerCase();
                        const usdcWseiData = dataMap.get(usdcWseiPool);
                        if (usdcWseiData && usdcWseiData.reserve0 > 0 && usdcWseiData.reserve1 > 0) {
                            // USDC is token0, WSEI is token1
                            // SEI price = USDC reserve / WSEI reserve (since USDC = $1)
                            detectedSeiPrice = usdcWseiData.reserve0 / usdcWseiData.reserve1;
                            if (detectedSeiPrice > 0 && detectedSeiPrice < 100) {
                                setSeiPrice(detectedSeiPrice);
                                console.log(`[DexScreener] ⚡ SEI price: $${detectedSeiPrice.toFixed(4)}`);
                            }
                        }

                        // Try to get WIND price from WIND/USDC pool first (most reliable)
                        const windUsdcPool = '0x576fc1f102c6bb3f0a2bc87ff01fb652b883dfe0'.toLowerCase();
                        const windUsdcData = dataMap.get(windUsdcPool);
                        if (windUsdcData) {
                            // First try priceUsd from DexScreener
                            if (windUsdcData.priceUsd > 0) {
                                detectedWindPrice = windUsdcData.priceUsd;
                            } else if (windUsdcData.reserve0 > 0 && windUsdcData.reserve1 > 0) {
                                // WIND is token0, USDC is token1
                                // WIND price = USDC reserve / WIND reserve
                                detectedWindPrice = windUsdcData.reserve1 / windUsdcData.reserve0;
                            }
                        }

                        // If still no WIND price, try WIND/WSEI pool
                        if (detectedWindPrice <= 0) {
                            const windWseiData = dataMap.get(PRIORITY_POOL);
                            if (windWseiData) {
                                if (windWseiData.priceUsd > 0) {
                                    detectedWindPrice = windWseiData.priceUsd;
                                } else if (windWseiData.reserve0 > 0 && windWseiData.reserve1 > 0 && detectedSeiPrice > 0) {
                                    // WIND is token0, WSEI is token1
                                    // WIND in WSEI = WSEI reserve / WIND reserve
                                    // WIND in USD = (WSEI reserve / WIND reserve) * seiPrice
                                    const windInWsei = windWseiData.reserve1 / windWseiData.reserve0;
                                    detectedWindPrice = windInWsei * detectedSeiPrice;
                                }
                            }
                        }

                        if (detectedWindPrice > 0 && detectedWindPrice < 1000) {
                            setWindPrice(detectedWindPrice);
                            console.log(`[DexScreener] ⚡ WIND price: $${detectedWindPrice.toFixed(6)}`);
                        } else {
                            console.warn(`[DexScreener] ⚠️ Could not detect WIND price, APR may be wrong`);
                        }

                        // Update pool data
                        setClPools(prev => prev.map(pool => {
                            const dexData = dataMap.get(pool.address.toLowerCase());
                            if (!dexData) return pool;
                            return {
                                ...pool,
                                volume24h: dexData.volume24h.toFixed(2),
                                tvl: dexData.tvlUsd > 0 ? dexData.tvlUsd.toFixed(2) : pool.tvl,
                                reserve0: dexData.reserve0 > 0 ? dexData.reserve0.toString() : pool.reserve0,
                                reserve1: dexData.reserve1 > 0 ? dexData.reserve1.toString() : pool.reserve1,
                            };
                        }));
                        console.log(`[PoolDataProvider] 📈 Updated ${dataMap.size} pools with DexScreener data`);
                    }
                });

                // Build token map from subgraph data
                const newTokenMap = new Map<string, TokenInfo>();
                subgraphPools.forEach(p => {
                    newTokenMap.set(p.token0.address.toLowerCase(), p.token0);
                    newTokenMap.set(p.token1.address.toLowerCase(), p.token1);
                });
                setTokenInfoMap(newTokenMap);

                // ⚡ PRIORITY: Fetch WIND/WSEI pool balance + APR + PRICES IMMEDIATELY (don't await)
                const priorityPool = subgraphPools.find(p => p.address.toLowerCase() === PRIORITY_POOL);
                const priorityFetchPromise = priorityPool ? (async () => {
                    console.log('[PoolDataProvider] ⚡ Priority loading WIND/WSEI APR...');
                    try {
                        // Only fetch reward rate (prices come from DexScreener now!)
                        const priorityCalls = [
                            { to: PRIORITY_GAUGE, data: '0x7b0a47ee' }, // rewardRate()
                        ];
                        const [rewardRateHex] = await batchRpcCall(priorityCalls);

                        // Update reward rate for priority pool
                        const rewardRate = rewardRateHex !== '0x' ? BigInt(rewardRateHex) : BigInt(0);
                        if (rewardRate > BigInt(0)) {
                            setPoolRewards(prev => new Map(prev).set(PRIORITY_POOL, rewardRate));
                            console.log(`[PoolDataProvider] ⚡ WIND/WSEI APR loaded: ${formatUnits(rewardRate, 18)}/sec`);
                        }
                    } catch (err) {
                        console.warn('[PoolDataProvider] Priority pool fetch error:', err);
                    }
                })() : Promise.resolve();

                // Start priority fetch immediately (non-blocking)
                priorityFetchPromise.catch(() => { }); // Handle silently


                // Fetch ALL gauge reward rates (not just priority pool)
                try {
                    const { GAUGE_LIST } = await import('@/config/gauges');
                    const gaugesWithAddress = GAUGE_LIST.filter(g => g.gauge && g.gauge.length > 0);

                    // Batch fetch all reward rates
                    const rewardCalls = gaugesWithAddress.map(g => ({
                        to: g.gauge,
                        data: '0x7b0a47ee', // rewardRate()
                        pool: g.pool.toLowerCase(),
                        token0: g.token0.toLowerCase(),
                        token1: g.token1.toLowerCase(),
                        tickSpacing: g.tickSpacing || 0
                    }));

                    if (rewardCalls.length > 0) {
                        const rewardResults = await batchRpcCall(rewardCalls.map(c => ({ to: c.to, data: c.data })));
                        const newRewards = new Map<string, bigint>();

                        // Build token pair + tickSpacing to reward rate mapping
                        // Key: token0-token1-tickSpacing (tokens sorted alphabetically)
                        const pairRewardMap = new Map<string, bigint>();

                        // Log all reward rates for debugging
                        const { GAUGE_LIST } = await import('@/config/gauges');

                        rewardCalls.forEach((call, i) => {
                            const rate = rewardResults[i] !== '0x' ? BigInt(rewardResults[i]) : BigInt(0);
                            const gaugeInfo = GAUGE_LIST.find(g => g.gauge?.toLowerCase() === call.to.toLowerCase());
                            const pairName = gaugeInfo ? `${gaugeInfo.symbol0}/${gaugeInfo.symbol1}` : call.pool;

                            // Log ALL rates for debugging
                            const ratePerDay = Number(rate) / 1e18 * 86400;
                            if (rate === BigInt(0)) {
                                console.log(`[Gauge] ⚠️ ${pairName} (ts:${call.tickSpacing}): 0 reward rate`);
                            } else {
                                console.log(`[Gauge] ✅ ${pairName} (ts:${call.tickSpacing}): ${ratePerDay.toFixed(2)} WIND/day`);
                            }

                            if (rate > BigInt(0)) {
                                // Key by GAUGE_LIST pool address
                                newRewards.set(call.pool, rate);

                                // Also key by token pair + tickSpacing (for subgraph pool address matching)
                                const sortedTokens = [call.token0, call.token1].sort();
                                const pairKey = `${sortedTokens[0]}-${sortedTokens[1]}-${call.tickSpacing}`;
                                pairRewardMap.set(pairKey, rate);
                            }
                        });

                        // Also add rewards for subgraph pools that match by token pair + tickSpacing
                        let matchedCount = 0;
                        let unmatchedPools: string[] = [];

                        subgraphPools.forEach(pool => {
                            const t0 = pool.token0.address.toLowerCase();
                            const t1 = pool.token1.address.toLowerCase();
                            const sortedTokens = [t0, t1].sort();
                            const pairKey = `${sortedTokens[0]}-${sortedTokens[1]}-${pool.tickSpacing || 0}`;
                            const rate = pairRewardMap.get(pairKey);
                            if (rate && rate > BigInt(0)) {
                                newRewards.set(pool.address.toLowerCase(), rate);
                                matchedCount++;
                            } else {
                                // Check if there's a rate for same tokens but different tickSpacing
                                let foundAlternate = false;
                                pairRewardMap.forEach((altRate, altKey) => {
                                    if (altKey.startsWith(`${sortedTokens[0]}-${sortedTokens[1]}-`) && !foundAlternate) {
                                        foundAlternate = true;
                                        const altTickSpacing = altKey.split('-')[2];
                                        console.log(`[Match] ⚠️ ${pool.token0.symbol}/${pool.token1.symbol}: subgraph ts=${pool.tickSpacing}, gauge ts=${altTickSpacing}`);
                                        // Use the alternate rate
                                        newRewards.set(pool.address.toLowerCase(), altRate);
                                        matchedCount++;
                                    }
                                });
                                if (!foundAlternate) {
                                    unmatchedPools.push(`${pool.token0.symbol}/${pool.token1.symbol}`);
                                }
                            }
                        });

                        if (unmatchedPools.length > 0) {
                            console.log(`[Match] ❌ No gauge found for: ${unmatchedPools.join(', ')}`);
                        }

                        if (newRewards.size > 0) {
                            setPoolRewards(newRewards);
                            console.log(`[PoolDataProvider] 🎉 Loaded ${newRewards.size} gauge reward rates (matched ${matchedCount} subgraph pools)`);
                        }
                    }
                } catch (err) {
                    console.warn('[PoolDataProvider] Failed to fetch gauge reward rates:', err);
                }


                // Fetch gauge data for voting (in parallel with priority fetch)
                await fetchGaugeData(newTokenMap);

                // TVL and reserves are now fetched from DexScreener (above), no RPC needed!
                saveCachePools(subgraphPools, []);

                return; // Done!
            } else {
                // Subgraph failed or empty - fall back to GAUGE_LIST
                console.log('[PoolDataProvider] ⚠️ Subgraph empty/failed, using GAUGE_LIST');

                if (!cached || cached.clPools.length === 0) {
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

                        // Set pools immediately for fast display (preserve volume24h)
                        if (quickClPools.length > 0) {
                            setClPools(prev => {
                                const volumeMap = new Map(prev.map(p => [p.address.toLowerCase(), p.volume24h]));
                                return quickClPools.filter(p => p.poolType === 'CL').map(pool => ({
                                    ...pool,
                                    volume24h: volumeMap.get(pool.address.toLowerCase()) || pool.volume24h
                                }));
                            });
                            setV2Pools(quickClPools.filter(p => p.poolType === 'V2'));
                            setIsLoading(false); // Show pools immediately!

                            // Fetch volume + TVL from DexScreener for GAUGE_LIST pools
                            const clPoolAddresses = quickClPools.filter(p => p.poolType === 'CL').map(p => p.address);
                            fetchDexScreenerData(clPoolAddresses).then((dataMap: Map<string, DexScreenerPoolData>) => {
                                if (dataMap.size > 0) {
                                    setClPools(prev => prev.map(pool => {
                                        const dexData = dataMap.get(pool.address.toLowerCase());
                                        if (!dexData) return pool;
                                        return {
                                            ...pool,
                                            volume24h: dexData.volume24h.toFixed(2),
                                            tvl: dexData.tvlUsd > 0 ? dexData.tvlUsd.toFixed(2) : pool.tvl,
                                            reserve0: dexData.reserve0 > 0 ? dexData.reserve0.toString() : pool.reserve0,
                                            reserve1: dexData.reserve1 > 0 ? dexData.reserve1.toString() : pool.reserve1,
                                        };
                                    }));
                                    console.log(`[PoolDataProvider] 📈 Updated GAUGE_LIST pools with DexScreener data`);
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('[PoolDataProvider] Could not load GAUGE_LIST for quick display');
                    }
                }
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

            // TVL and reserves now come from DexScreener - no RPC balance fetching needed!
            // Save to cache after pools are set
            setClPools(currentPools => {
                saveCachePools(currentPools, v2Pools);
                return currentPools;
            });

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

            // Step 2: Get FeesVotingReward addresses directly from each gauge
            // Works for both V2 and CL gauges - they have feesVotingReward() getter
            // Skip pools without gauges
            const gaugesWithAddress = GAUGE_LIST.map((g, i) => ({ ...g, idx: i })).filter(g => g.gauge && g.gauge.length > 0);

            const feeRewardCalls = gaugesWithAddress.map(g => ({
                to: g.gauge,
                data: '0x0fe2f711', // feesVotingReward() selector
                idx: g.idx
            }));

            let feeRewardAddresses: (string | null)[] = GAUGE_LIST.map(() => null);
            if (feeRewardCalls.length > 0) {
                const feeRewardResults = await batchRpcCall(feeRewardCalls.map(c => ({ to: c.to, data: c.data })));
                feeRewardCalls.forEach((call, i) => {
                    const result = feeRewardResults[i];
                    feeRewardAddresses[call.idx] = result !== '0x' && result !== '0x' + '0'.repeat(64) ? `0x${result.slice(-40)}` : null;
                });
            }

            console.log('[PoolDataProvider] Fee reward addresses:', feeRewardAddresses.filter(a => a !== null));

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

                // tokenRewardsPerEpoch(token, epochStart) - selector: 0x92777b29
                feeAmountCalls.push({
                    to: feeRewardAddr,
                    data: `0x92777b29${token0Padded}${epochStartHex}`,
                    gaugeIdx: i,
                    tokenAddr: g.token0,
                    symbol: known0?.symbol || g.symbol0,
                    decimals: known0?.decimals || 18,
                });
                feeAmountCalls.push({
                    to: feeRewardAddr,
                    data: `0x92777b29${token1Padded}${epochStartHex}`,
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

    // Removed: Retry logic for RPC balance fetching - DexScreener provides TVL now

    // Auto-refresh every 10 minutes (only if page is still open)
    useEffect(() => {
        const TEN_MINUTES = 10 * 60 * 1000;
        const interval = setInterval(fetchAllData, TEN_MINUTES);
        return () => clearInterval(interval);
    }, [fetchAllData]);

    const getTokenInfo = useCallback((address: string) => {
        return tokenInfoMap.get(address.toLowerCase());
    }, [tokenInfoMap]);

    // Fetch staked positions for current user
    const fetchStakedPositions = useCallback(async () => {
        if (!address) {
            setStakedPositions([]);
            setStakedLoading(false);
            return;
        }

        setStakedLoading(true);
        const positions: StakedPosition[] = [];

        try {
            const { GAUGE_LIST } = await import('@/config/gauges');

            // Only check gauges that have gauge addresses
            const gaugesWithAddress = GAUGE_LIST.filter(g => g.gauge && g.gauge !== '');

            for (const g of gaugesWithAddress) {
                // Get staked token IDs for this user
                const stakedResult = await fetch(getPrimaryRpc(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: g.gauge,
                            data: `0x4b937763${address.slice(2).toLowerCase().padStart(64, '0')}` // stakedValues(address)
                        }, 'latest']
                    })
                }).then(r => r.json());

                if (!stakedResult.result || stakedResult.result === '0x') continue;

                // Check if result is an empty array
                if (stakedResult.result.length <= 130) {
                    const data = stakedResult.result.slice(2);
                    const length = parseInt(data.slice(64, 128), 16) || 0;
                    if (length === 0) continue;
                }

                // Parse the array of token IDs
                const data = stakedResult.result.slice(2);
                const length = parseInt(data.slice(64, 128), 16);

                for (let j = 0; j < length; j++) {
                    const tokenIdHex = data.slice(128 + j * 64, 128 + (j + 1) * 64);
                    const tokenId = BigInt('0x' + tokenIdHex);

                    // Fetch position details and pending rewards in parallel
                    const [positionResult, rewardsResult, slot0Result] = await Promise.all([
                        // positions(tokenId) on NonfungiblePositionManager
                        fetch(getPrimaryRpc(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: CL_CONTRACTS.NonfungiblePositionManager,
                                    data: `0x99fbab88${tokenId.toString(16).padStart(64, '0')}` // positions(uint256)
                                }, 'latest']
                            })
                        }).then(r => r.json()),
                        // earned(address, tokenId) on gauge
                        fetch(getPrimaryRpc(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: g.gauge,
                                    data: `0x3e491d47${address.slice(2).toLowerCase().padStart(64, '0')}${tokenId.toString(16).padStart(64, '0')}`
                                }, 'latest']
                            })
                        }).then(r => r.json()),
                        // slot0() on pool to get current tick
                        fetch(getPrimaryRpc(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: g.pool,
                                    data: '0x3850c7bd' // slot0()
                                }, 'latest']
                            })
                        }).then(r => r.json()),
                    ]);

                    // Parse position data:
                    // positions(tokenId) returns: (nonce, operator, token0, token1, tickSpacing, tickLower, tickUpper, liquidity, ...)
                    let liquidity = BigInt(0);
                    let tickLower = 0;
                    let tickUpper = 0;

                    if (positionResult.result && positionResult.result.length >= 514) {
                        const posData = positionResult.result.slice(2);
                        // tickLower is at slot 5 (320-384 hex chars)
                        // int24 is only 3 bytes (6 hex chars), take last 6 chars
                        const tickLowerHex = posData.slice(320, 384).slice(-6);
                        const tickLowerVal = parseInt(tickLowerHex, 16);
                        tickLower = tickLowerVal > 0x7fffff ? tickLowerVal - 0x1000000 : tickLowerVal;

                        // tickUpper is at slot 6 (384-448 hex chars)
                        const tickUpperHex = posData.slice(384, 448).slice(-6);
                        const tickUpperVal = parseInt(tickUpperHex, 16);
                        tickUpper = tickUpperVal > 0x7fffff ? tickUpperVal - 0x1000000 : tickUpperVal;

                        // liquidity is at slot 7 (448-512 hex chars)
                        const liquidityHex = posData.slice(448, 512);
                        liquidity = BigInt('0x' + liquidityHex);
                    }

                    // Parse current tick from slot0
                    // slot0 returns: sqrtPriceX96 (32 bytes), tick (32 bytes), ...
                    let currentTick = 0;
                    if (slot0Result.result && slot0Result.result.length >= 130) {
                        const tickSlot = slot0Result.result.slice(66, 130);
                        const tickHex = tickSlot.slice(-6);
                        const tickVal = parseInt(tickHex, 16);
                        currentTick = tickVal > 0x7fffff ? tickVal - 0x1000000 : tickVal;
                    }

                    const known0 = KNOWN_TOKENS[g.token0.toLowerCase()];
                    const known1 = KNOWN_TOKENS[g.token1.toLowerCase()];

                    positions.push({
                        tokenId,
                        gaugeAddress: g.gauge,
                        poolAddress: g.pool,
                        token0: g.token0,
                        token1: g.token1,
                        token0Symbol: known0?.symbol || g.symbol0,
                        token1Symbol: known1?.symbol || g.symbol1,
                        token0Decimals: known0?.decimals || 18,
                        token1Decimals: known1?.decimals || 18,
                        tickSpacing: g.tickSpacing || 0,
                        tickLower,
                        tickUpper,
                        currentTick,
                        liquidity,
                        pendingRewards: rewardsResult.result ? BigInt(rewardsResult.result) : BigInt(0),
                        rewardRate: BigInt(0),
                    });
                }
            }
        } catch (err) {
            console.error('[PoolDataProvider] Error fetching staked positions:', err);
        }

        setStakedPositions(positions);
        setStakedLoading(false);
    }, [address]);

    // Fetch staked positions when address changes
    useEffect(() => {
        fetchStakedPositions();
    }, [fetchStakedPositions]);

    // Fetch veNFT data for current user
    const fetchVeNFTs = useCallback(async () => {
        if (!address) {
            setVeNFTs([]);
            setVeNFTsLoading(false);
            return;
        }

        setVeNFTsLoading(true);
        const nfts: VeNFT[] = [];

        try {
            // Get veNFT count
            const countResult = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'eth_call',
                    params: [{
                        to: V2_CONTRACTS.VotingEscrow,
                        data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`
                    }, 'latest']
                })
            }).then(r => r.json());

            const count = countResult.result ? parseInt(countResult.result, 16) : 0;

            for (let i = 0; i < count; i++) {
                // Get tokenId at index using ownerToNFTokenIdList (0x8bf9d84c)
                const tokenIdResult = await fetch(getPrimaryRpc(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: V2_CONTRACTS.VotingEscrow,
                            data: `0x8bf9d84c${address.slice(2).toLowerCase().padStart(64, '0')}${i.toString(16).padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());

                if (!tokenIdResult.result) continue;
                const tokenId = BigInt(tokenIdResult.result);

                // Get locked data using locked(uint256) - selector 0xb45a3c0e
                const lockedResult = await fetch(getPrimaryRpc(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: V2_CONTRACTS.VotingEscrow,
                            data: `0xb45a3c0e${tokenId.toString(16).padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());

                // Get voting power using balanceOfNFT(uint256) - selector 0xe7e242d4
                const vpResult = await fetch(getPrimaryRpc(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: V2_CONTRACTS.VotingEscrow,
                            data: `0xe7e242d4${tokenId.toString(16).padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());

                // Get claimable rebases - claimable(uint256) selector 0xd1d58b25
                const claimableResult = await fetch(getPrimaryRpc(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: V2_CONTRACTS.RewardsDistributor,
                            data: `0xd1d58b25${tokenId.toString(16).padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());

                if (lockedResult.result) {
                    const data = lockedResult.result.slice(2);
                    const amount = BigInt('0x' + data.slice(0, 64));
                    const end = BigInt('0x' + data.slice(64, 128));
                    const isPermanent = (data.slice(128, 192) || '0') !== '0'.repeat(64);
                    const votingPower = vpResult.result ? BigInt(vpResult.result) : BigInt(0);
                    const claimable = claimableResult.result ? BigInt(claimableResult.result) : BigInt(0);

                    nfts.push({ tokenId, amount, end, isPermanent, votingPower, claimable });
                }
            }
        } catch (err) {
            console.error('[PoolDataProvider] Error fetching veNFTs:', err);
        }

        setVeNFTs(nfts);
        setVeNFTsLoading(false);
    }, [address]);

    // Fetch veNFTs when address changes
    useEffect(() => {
        fetchVeNFTs();
    }, [fetchVeNFTs]);

    const value: PoolDataContextType = {
        v2Pools,
        clPools,
        allPools: [...v2Pools, ...clPools],
        tokenInfoMap,
        poolRewards,
        windPrice,
        seiPrice,
        gauges,
        totalVoteWeight,
        gaugesLoading,
        stakedPositions,
        stakedLoading,
        refetchStaked: fetchStakedPositions,
        veNFTs,
        veNFTsLoading,
        refetchVeNFTs: fetchVeNFTs,
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
