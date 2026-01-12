'use client';

import { useMemo } from 'react';
import { Address, isAddress, getAddress } from 'viem';
import { useReadContract } from 'wagmi';
import { Token, SEI, WSEI } from '@/config/tokens';
import { getTokenByAddress } from '@/utils/tokens';
import { GAUGE_LIST, GaugeConfig } from '@/config/gauges';
import { usePoolData } from '@/providers/PoolDataProvider';

// Minimal ERC20 ABI for fetching token info
const ERC20_ABI = [
    {
        name: 'name',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }],
    },
    {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'string' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint8' }],
    },
] as const;

export interface TokenPool {
    address: string;
    token0: Token;
    token1: Token;
    poolType: 'V2' | 'CL';
    tickSpacing?: number;
    tvl: string;
    hasGauge: boolean;
    gaugeAddress?: string;
}

export interface UseTokenPageResult {
    token: Token | null;
    isKnownToken: boolean;
    isLoading: boolean;
    error: string | null;
    pools: TokenPool[];
    isValidAddress: boolean;
}

/**
 * Hook for the /tokens/[address] page
 * Looks up token info and finds all pools containing that token
 */
export function useTokenPage(address: string | undefined): UseTokenPageResult {
    // Validate address format
    const isValidAddress = !!address && isAddress(address);
    const checksumAddr = isValidAddress ? getAddress(address) : undefined;

    // First, try to find token in our known list using centralized utility
    const knownToken = useMemo(() => {
        if (!checksumAddr) return null;
        return getTokenByAddress(checksumAddr);
    }, [checksumAddr]);

    const isKnownToken = knownToken !== null;

    // If token not in list, fetch from chain
    const { data: onChainName, isLoading: loadingName } = useReadContract({
        address: checksumAddr as Address,
        abi: ERC20_ABI,
        functionName: 'name',
        query: { enabled: isValidAddress && !knownToken },
    });

    const { data: onChainSymbol, isLoading: loadingSymbol } = useReadContract({
        address: checksumAddr as Address,
        abi: ERC20_ABI,
        functionName: 'symbol',
        query: { enabled: isValidAddress && !knownToken },
    });

    const { data: onChainDecimals, isLoading: loadingDecimals } = useReadContract({
        address: checksumAddr as Address,
        abi: ERC20_ABI,
        functionName: 'decimals',
        query: { enabled: isValidAddress && !knownToken },
    });

    const isLoading = !isValidAddress ? false : (!knownToken && (loadingName || loadingSymbol || loadingDecimals));

    // Build token object
    const token = useMemo(() => {
        if (!checksumAddr) return null;
        if (knownToken) return knownToken;

        // Build from on-chain data
        if (onChainName && onChainSymbol && onChainDecimals !== undefined) {
            return {
                address: checksumAddr,
                name: onChainName as string,
                symbol: onChainSymbol as string,
                decimals: Number(onChainDecimals),
            } as Token;
        }

        return null;
    }, [checksumAddr, knownToken, onChainName, onChainSymbol, onChainDecimals]);

    // Get pool data from provider
    const { allPools } = usePoolData();

    // Find all pools containing this token
    const pools = useMemo<TokenPool[]>(() => {
        if (!checksumAddr) return [];
        const lowerAddr = checksumAddr.toLowerCase();
        // Also check WSEI if searching for SEI
        const wseiAddr = WSEI.address.toLowerCase();
        const searchAddrs = lowerAddr === SEI.address.toLowerCase()
            ? [lowerAddr, wseiAddr]
            : [lowerAddr];

        const matchingPools: TokenPool[] = [];
        const seenPoolAddrs = new Set<string>();

        // Helper to find token by address - uses centralized utility
        const findToken = (addr: string, symbol?: string): Token => {
            const found = getTokenByAddress(addr);
            return found || { address: addr, symbol: symbol || '???', name: symbol || 'Unknown', decimals: 18 };
        };

        // First, search GAUGE_LIST (pools with configured gauges)
        for (const gauge of GAUGE_LIST) {
            const isToken0 = searchAddrs.includes(gauge.token0.toLowerCase());
            const isToken1 = searchAddrs.includes(gauge.token1.toLowerCase());

            if (isToken0 || isToken1) {
                const poolAddr = gauge.pool.toLowerCase();
                if (seenPoolAddrs.has(poolAddr)) continue;
                seenPoolAddrs.add(poolAddr);

                const token0 = findToken(gauge.token0, gauge.symbol0);
                const token1 = findToken(gauge.token1, gauge.symbol1);

                // Find TVL from pool data
                const poolData = allPools.find(p => p.address.toLowerCase() === poolAddr);
                const tvl = poolData?.tvl || '0';

                matchingPools.push({
                    address: gauge.pool,
                    token0,
                    token1,
                    poolType: gauge.type,
                    tickSpacing: gauge.tickSpacing,
                    tvl,
                    hasGauge: !!gauge.gauge,
                    gaugeAddress: gauge.gauge || undefined,
                });
            }
        }

        // Second, search allPools from PoolDataProvider (includes non-gauge pools)
        for (const pool of allPools) {
            const poolAddr = pool.address.toLowerCase();
            if (seenPoolAddrs.has(poolAddr)) continue;

            const t0Addr = pool.token0?.address?.toLowerCase() || '';
            const t1Addr = pool.token1?.address?.toLowerCase() || '';

            const isToken0 = searchAddrs.includes(t0Addr);
            const isToken1 = searchAddrs.includes(t1Addr);

            if (isToken0 || isToken1) {
                seenPoolAddrs.add(poolAddr);

                const token0 = findToken(pool.token0?.address || '', pool.token0?.symbol);
                const token1 = findToken(pool.token1?.address || '', pool.token1?.symbol);

                matchingPools.push({
                    address: pool.address,
                    token0,
                    token1,
                    poolType: pool.poolType === 'CL' ? 'CL' : 'V2',
                    tickSpacing: pool.tickSpacing,
                    tvl: pool.tvl || '0',
                    hasGauge: false,
                    gaugeAddress: undefined,
                });
            }
        }

        // Sort by TVL descending
        return matchingPools.sort((a, b) => parseFloat(b.tvl) - parseFloat(a.tvl));
    }, [checksumAddr, allPools]);

    // Determine error state
    const error = useMemo(() => {
        if (!address) return 'No token address provided';
        if (!isValidAddress) return 'Invalid token address';
        if (!isLoading && !token) return 'Token not found';
        return null;
    }, [address, isValidAddress, isLoading, token]);

    return {
        token,
        isKnownToken,
        isLoading,
        error,
        pools,
        isValidAddress,
    };
}

/**
 * Helper to find a token by address (for use outside the hook)
 * @deprecated Use getTokenByAddress from '@/utils/tokens' instead
 */
export function findTokenByAddress(address: string): Token | null {
    return getTokenByAddress(address);
}
