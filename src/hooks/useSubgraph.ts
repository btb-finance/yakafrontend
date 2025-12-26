'use client';

import { useState, useEffect, useCallback } from 'react';

// Goldsky GraphQL endpoint (v2.0.0 with user data)
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmjlh2t5mylhg01tm7t545rgk/subgraphs/windswap-cl/2.0.0/gn';

// Types matching subgraph schema
export interface SubgraphToken {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
}

export interface SubgraphPool {
    id: string;
    token0: SubgraphToken;
    token1: SubgraphToken;
    tickSpacing: number;
    liquidity: string;
    totalValueLockedToken0: string;
    totalValueLockedToken1: string;
    totalValueLockedUSD: string;
    volumeToken0: string;
    volumeToken1: string;
    volumeUSD: string;
    feesUSD: string;
    txCount: string;
    createdAtTimestamp: string;
}

export interface SubgraphSwap {
    id: string;
    pool: { id: string };
    sender: string;
    recipient: string;
    amount0: string;
    amount1: string;
    amountUSD: string;
    timestamp: string;
}

export interface SubgraphProtocol {
    totalVolumeUSD: string;
    totalTVLUSD: string;
    totalPools: string;
    totalSwaps: string;
}

export interface SubgraphPoolDayData {
    id: string;
    pool: { id: string };
    date: number;
    volumeUSD: string;
    tvlUSD: string;
    txCount: string;
}

interface UseSubgraphResult {
    pools: SubgraphPool[];
    protocol: SubgraphProtocol | null;
    recentSwaps: SubgraphSwap[];
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

// GraphQL query for pools
const POOLS_QUERY = `
    query GetPools($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: String!) {
        pools(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
            id
            token0 {
                id
                symbol
                name
                decimals
            }
            token1 {
                id
                symbol
                name
                decimals
            }
            tickSpacing
            liquidity
            totalValueLockedToken0
            totalValueLockedToken1
            totalValueLockedUSD
            volumeToken0
            volumeToken1
            volumeUSD
            feesUSD
            txCount
            createdAtTimestamp
        }
        protocol(id: "windswap") {
            totalVolumeUSD
            totalTVLUSD
            totalPools
            totalSwaps
        }
    }
`;

const RECENT_SWAPS_QUERY = `
    query GetRecentSwaps($first: Int!) {
        swaps(first: $first, orderBy: timestamp, orderDirection: desc) {
            id
            pool { id }
            sender
            recipient
            amount0
            amount1
            amountUSD
            timestamp
        }
    }
`;

async function fetchGraphQL<T>(query: string, variables: Record<string, any>): Promise<T> {
    const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    const json = await response.json();

    if (json.errors) {
        throw new Error(json.errors[0]?.message || 'GraphQL error');
    }

    return json.data;
}

/**
 * Hook to fetch all pools from the WindSwap subgraph
 */
export function useSubgraph(): UseSubgraphResult {
    const [pools, setPools] = useState<SubgraphPool[]>([]);
    const [protocol, setProtocol] = useState<SubgraphProtocol | null>(null);
    const [recentSwaps, setRecentSwaps] = useState<SubgraphSwap[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch pools
            const poolsData = await fetchGraphQL<{
                pools: SubgraphPool[];
                protocol: SubgraphProtocol | null;
            }>(POOLS_QUERY, {
                first: 100,
                skip: 0,
                orderBy: 'totalValueLockedUSD',
                orderDirection: 'desc',
            });

            setPools(poolsData.pools || []);
            setProtocol(poolsData.protocol);

            // Fetch recent swaps
            const swapsData = await fetchGraphQL<{ swaps: SubgraphSwap[] }>(RECENT_SWAPS_QUERY, {
                first: 20,
            });

            setRecentSwaps(swapsData.swaps || []);
        } catch (err) {
            console.error('[useSubgraph] Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch subgraph data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        // Refresh every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    return {
        pools,
        protocol,
        recentSwaps,
        isLoading,
        error,
        refetch: fetchData,
    };
}

/**
 * Hook to fetch pool day data for charts
 */
export function usePoolDayData(poolId: string) {
    const [dayData, setDayData] = useState<SubgraphPoolDayData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!poolId) return;

        const fetchDayData = async () => {
            try {
                const data = await fetchGraphQL<{ poolDayDatas: SubgraphPoolDayData[] }>(
                    `query GetPoolDayData($poolId: String!) {
                        poolDayDatas(first: 30, where: { pool: $poolId }, orderBy: date, orderDirection: desc) {
                            id
                            pool { id }
                            date
                            volumeUSD
                            tvlUSD
                            txCount
                        }
                    }`,
                    { poolId }
                );
                setDayData(data.poolDayDatas || []);
            } catch (err) {
                console.error('[usePoolDayData] Error:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDayData();
    }, [poolId]);

    return { dayData, isLoading };
}

// Export the subgraph URL for direct use
export { SUBGRAPH_URL };
