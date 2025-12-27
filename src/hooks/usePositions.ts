'use client';

import { useAccount, useReadContract } from 'wagmi';
import { Address, formatUnits } from 'viem';
import { CL_CONTRACTS, V2_CONTRACTS } from '@/config/contracts';
import { NFT_POSITION_MANAGER_ABI, ERC20_ABI, POOL_FACTORY_ABI, POOL_ABI } from '@/config/abis';
import { useState, useEffect, useCallback } from 'react';
import { getPrimaryRpc } from '@/utils/rpc';

export interface CLPosition {
    tokenId: bigint;
    token0: Address;
    token1: Address;
    tickSpacing: number;
    tickLower: number;
    tickUpper: number;
    liquidity: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
    token0Symbol?: string;
    token1Symbol?: string;
}

export interface V2Position {
    poolAddress: Address;
    token0: Address;
    token1: Address;
    stable: boolean;
    lpBalance: bigint;
}

// ============================================
// SUBGRAPH-BASED POSITION FETCHING (FAST!)
// ============================================

import { useUserPositions, SubgraphPosition } from './useSubgraph';

/**
 * Hook that fetches CL positions from subgraph (much faster than RPC!)
 * Returns positions in the same format as useCLPositions for easy migration
 */
export function useCLPositionsFromSubgraph() {
    const { address } = useAccount();
    const { positions: subgraphPositions, isLoading, error, refetch } = useUserPositions(address);

    // Convert subgraph positions to CLPosition format
    const positions: CLPosition[] = subgraphPositions
        .filter(p => BigInt(p.liquidity) > BigInt(0)) // Only active positions
        .map((p: SubgraphPosition) => ({
            tokenId: BigInt(p.tokenId),
            token0: p.pool.token0.id as Address,
            token1: p.pool.token1.id as Address,
            tickSpacing: p.pool.tickSpacing,
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidity: BigInt(p.liquidity),
            // Subgraph doesn't have real-time pending fees, set to 0
            // User can still collect fees - actual amounts calculated on-chain
            tokensOwed0: BigInt(0),
            tokensOwed1: BigInt(0),
            token0Symbol: p.pool.token0.symbol,
            token1Symbol: p.pool.token1.symbol,
        }));

    return {
        positions,
        positionCount: positions.length,
        isLoading,
        error,
        refetch,
    };
}

// Hook to fetch CL positions from NonfungiblePositionManager
export function useCLPositions() {
    const { address } = useAccount();
    const [positions, setPositions] = useState<CLPosition[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Get number of positions
    const { data: positionCount, refetch: refetchCount } = useReadContract({
        address: CL_CONTRACTS.NonfungiblePositionManager as Address,
        abi: NFT_POSITION_MANAGER_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });

    const count = positionCount ? Number(positionCount) : 0;

    // Fetch all position details
    const fetchPositions = useCallback(async () => {
        if (!address || count === 0) {
            setPositions([]);
            return;
        }

        setIsLoading(true);

        try {
            const positionPromises: Promise<CLPosition | null>[] = [];

            for (let i = 0; i < count; i++) {
                positionPromises.push(fetchPositionByIndex(address, i));
            }

            const results = await Promise.all(positionPromises);
            // Filter out null positions AND positions with 0 liquidity (dead/empty positions)
            const validPositions = results.filter((p): p is CLPosition =>
                p !== null && p.liquidity > BigInt(0)
            );
            setPositions(validPositions);

            // If we didn't get all positions, retry missing ones after a delay
            if (validPositions.length < count) {
                console.log(`[usePositions] Got ${validPositions.length}/${count} positions (some may have 0 liquidity), retrying missing...`);
                const fetchedIds = new Set(validPositions.map(p => p.tokenId.toString()));

                // Retry after 3 seconds
                setTimeout(async () => {
                    const retryPromises: Promise<CLPosition | null>[] = [];
                    for (let i = 0; i < count; i++) {
                        retryPromises.push(fetchPositionByIndex(address, i));
                    }
                    const retryResults = await Promise.all(retryPromises);
                    // Also filter for liquidity > 0 on retry
                    const newPositions = retryResults.filter((p): p is CLPosition =>
                        p !== null && p.liquidity > BigInt(0) && !fetchedIds.has(p.tokenId.toString())
                    );
                    if (newPositions.length > 0) {
                        console.log(`[usePositions] ✅ Recovered ${newPositions.length} more positions`);
                        setPositions(prev => [...prev, ...newPositions]);
                    }
                }, 3000);
            }
        } catch (err) {
            console.error('Error fetching CL positions:', err);
            setPositions([]);
        }

        setIsLoading(false);
    }, [address, count]);

    useEffect(() => {
        fetchPositions();
    }, [fetchPositions]);

    const refetch = () => {
        refetchCount();
        fetchPositions();
    };

    return {
        positions,
        positionCount: count,
        isLoading,
        refetch,
    };
}

// Encode collect(CollectParams) call - used to simulate fee collection
// CollectParams: { tokenId, recipient, amount0Max, amount1Max }
function encodeCollect(tokenId: bigint, recipient: string): string {
    // collect((uint256,address,uint128,uint128))
    const selector = 'fc6f7865'; // cast sig "collect((uint256,address,uint128,uint128))"
    const tokenIdHex = tokenId.toString(16).padStart(64, '0');
    const recipientPadded = recipient.slice(2).toLowerCase().padStart(64, '0');
    // MAX_UINT128 for both amount0Max and amount1Max
    const maxUint128 = 'ffffffffffffffffffffffffffffffff'.padStart(64, '0');

    // The struct is encoded as: offset (32 bytes) + tokenId + recipient + amount0Max + amount1Max
    // But for a simple tuple param, we encode inline
    return `0x${selector}${tokenIdHex}${recipientPadded}${maxUint128}${maxUint128}`;
}

// Decode collect() result - returns (uint256 amount0, uint256 amount1)
function decodeCollectResult(data: string): { amount0: bigint; amount1: bigint } {
    const hex = data.slice(2);
    if (hex.length < 128) {
        return { amount0: BigInt(0), amount1: BigInt(0) };
    }
    const amount0 = BigInt('0x' + hex.slice(0, 64));
    const amount1 = BigInt('0x' + hex.slice(64, 128));
    return { amount0, amount1 };
}

// Fetch a single position by owner index (with retry logic)
async function fetchPositionByIndex(owner: string, index: number, retries = 3): Promise<CLPosition | null> {
    const rpcUrl = getPrimaryRpc();

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // 1. Get tokenId at index using tokenOfOwnerByIndex
            const tokenIdResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: CL_CONTRACTS.NonfungiblePositionManager,
                        data: encodeTokenOfOwnerByIndex(owner, index),
                    }, 'latest'],
                    id: 1,
                }),
            });

            const tokenIdResult = await tokenIdResponse.json();
            if (!tokenIdResult.result || tokenIdResult.result === '0x') {
                return null;
            }

            const tokenId = BigInt(tokenIdResult.result);

            // 2. Get position data using positions(tokenId)
            const positionResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: CL_CONTRACTS.NonfungiblePositionManager,
                        data: encodePositions(tokenId),
                    }, 'latest'],
                    id: 2,
                }),
            });

            const positionResult = await positionResponse.json();
            if (!positionResult.result || positionResult.result === '0x') {
                return null;
            }

            const decoded = decodePositionResult(positionResult.result);

            // Skip collect() simulation for positions with 0 liquidity (dead positions)
            // These won't have any fees and we'll filter them out anyway
            if (decoded.liquidity === BigInt(0)) {
                return {
                    tokenId,
                    ...decoded,
                };
            }

            // 3. Simulate collect() to get REAL uncollected fees
            // The positions() call only returns tokensOwed that were credited at last interaction,
            // NOT the fees that have accrued since then. We need to simulate collect() to get the real values.
            let realTokensOwed0 = decoded.tokensOwed0;
            let realTokensOwed1 = decoded.tokensOwed1;

            try {
                const collectResponse = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{
                            to: CL_CONTRACTS.NonfungiblePositionManager,
                            from: owner, // Simulate as the owner
                            data: encodeCollect(tokenId, owner),
                        }, 'latest'],
                        id: 3,
                    }),
                });

                const collectResult = await collectResponse.json();
                if (collectResult.result && collectResult.result !== '0x' && collectResult.result.length >= 130) {
                    const { amount0, amount1 } = decodeCollectResult(collectResult.result);
                    realTokensOwed0 = amount0;
                    realTokensOwed1 = amount1;
                }
            } catch (collectErr) {
                // If collect simulation fails, fall back to positions() values
                console.warn(`[usePositions] Could not simulate collect for position ${tokenId}:`, collectErr);
            }

            return {
                tokenId,
                ...decoded,
                tokensOwed0: realTokensOwed0,
                tokensOwed1: realTokensOwed1,
            };
        } catch (err) {
            if (attempt < retries) {
                // Wait before retry with exponential backoff
                await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
                console.log(`[usePositions] Retrying position ${index} (attempt ${attempt + 2}/${retries + 1})`);
                continue;
            }
            console.error(`Error fetching position at index ${index} after ${retries + 1} attempts:`, err);
            return null;
        }
    }
    return null;
}

// Encode tokenOfOwnerByIndex(address,uint256)
function encodeTokenOfOwnerByIndex(owner: string, index: number): string {
    const selector = '2f745c59'; // cast sig "tokenOfOwnerByIndex(address,uint256)"
    const ownerPadded = owner.slice(2).toLowerCase().padStart(64, '0');
    const indexHex = index.toString(16).padStart(64, '0');
    return `0x${selector}${ownerPadded}${indexHex}`;
}

// Encode positions(uint256)
function encodePositions(tokenId: bigint): string {
    const selector = '99fbab88'; // cast sig "positions(uint256)"
    const tokenIdHex = tokenId.toString(16).padStart(64, '0');
    return `0x${selector}${tokenIdHex}`;
}

// Decode positions() result
function decodePositionResult(data: string): Omit<CLPosition, 'tokenId'> {
    const hex = data.slice(2);

    // positions() returns:
    // uint96 nonce, address operator, address token0, address token1,
    // int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity,
    // uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128,
    // uint128 tokensOwed0, uint128 tokensOwed1

    // Each slot is 32 bytes (64 hex chars)
    // nonce + operator packed in slot 0-1
    const token0 = '0x' + hex.slice(128, 192).slice(-40);
    const token1 = '0x' + hex.slice(192, 256).slice(-40);

    // tickSpacing, tickLower, tickUpper
    const tickSpacing = parseSignedInt24(hex.slice(256, 320));
    const tickLower = parseSignedInt24(hex.slice(320, 384));
    const tickUpper = parseSignedInt24(hex.slice(384, 448));

    // liquidity (uint128)
    const liquidity = BigInt('0x' + hex.slice(448, 512));

    // Skip feeGrowthInside (slots 8-9)
    // tokensOwed0 and tokensOwed1 (uint128 each)
    const tokensOwed0 = BigInt('0x' + hex.slice(640, 704));
    const tokensOwed1 = BigInt('0x' + hex.slice(704, 768));

    return {
        token0: token0 as Address,
        token1: token1 as Address,
        tickSpacing,
        tickLower,
        tickUpper,
        liquidity,
        tokensOwed0,
        tokensOwed1,
    };
}

function parseSignedInt24(hex64: string): number {
    // int24 is only 3 bytes (6 hex chars), but ABI encoding pads to 32 bytes
    // For negative numbers, the value is sign-extended, so we only need the last 6 hex chars
    const lastSix = hex64.slice(-6);
    const val = parseInt(lastSix, 16);
    // Check if negative (high bit set in 24-bit value)
    if (val > 0x7fffff) {
        return val - 0x1000000;
    }
    return val;
}

// Hook to fetch V2 LP token balances
export function useV2Positions() {
    const { address } = useAccount();

    // Get all pools count
    const { data: poolCount } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'allPoolsLength',
    });

    const totalPools = poolCount ? Math.min(Number(poolCount), 20) : 0;

    // Get pool addresses - using individual reads to avoid the never[] type issue
    const { data: pool0 } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'allPools',
        args: [BigInt(0)],
        query: { enabled: totalPools > 0 },
    });

    const { data: pool1 } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'allPools',
        args: [BigInt(1)],
        query: { enabled: totalPools > 1 },
    });

    const { data: pool2 } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'allPools',
        args: [BigInt(2)],
        query: { enabled: totalPools > 2 },
    });

    const poolAddresses = [pool0, pool1, pool2].filter(Boolean) as Address[];

    // Get LP balances for first pool
    const { data: balance0, refetch: refetch0 } = useReadContract({
        address: pool0 as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address && !!pool0 },
    });

    const { data: balance1 } = useReadContract({
        address: pool1 as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address && !!pool1 },
    });

    const { data: balance2 } = useReadContract({
        address: pool2 as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address && !!pool2 },
    });

    // Get pool details for pools with balance
    const { data: pool0Token0 } = useReadContract({
        address: pool0 as Address,
        abi: POOL_ABI,
        functionName: 'token0',
        query: { enabled: !!pool0 && !!balance0 && balance0 > BigInt(0) },
    });

    const { data: pool0Token1 } = useReadContract({
        address: pool0 as Address,
        abi: POOL_ABI,
        functionName: 'token1',
        query: { enabled: !!pool0 && !!balance0 && balance0 > BigInt(0) },
    });

    const { data: pool0Stable } = useReadContract({
        address: pool0 as Address,
        abi: POOL_ABI,
        functionName: 'stable',
        query: { enabled: !!pool0 && !!balance0 && balance0 > BigInt(0) },
    });

    // Build positions array
    const v2Positions: V2Position[] = [];

    if (pool0 && balance0 && balance0 > BigInt(0) && pool0Token0 && pool0Token1) {
        v2Positions.push({
            poolAddress: pool0 as Address,
            token0: pool0Token0 as Address,
            token1: pool0Token1 as Address,
            stable: !!pool0Stable,
            lpBalance: balance0 as bigint,
        });
    }

    if (pool1 && balance1 && balance1 > BigInt(0)) {
        v2Positions.push({
            poolAddress: pool1 as Address,
            token0: '0x0000000000000000000000000000000000000000' as Address,
            token1: '0x0000000000000000000000000000000000000000' as Address,
            stable: false,
            lpBalance: balance1 as bigint,
        });
    }

    if (pool2 && balance2 && balance2 > BigInt(0)) {
        v2Positions.push({
            poolAddress: pool2 as Address,
            token0: '0x0000000000000000000000000000000000000000' as Address,
            token1: '0x0000000000000000000000000000000000000000' as Address,
            stable: false,
            lpBalance: balance2 as bigint,
        });
    }

    const refetch = () => {
        refetch0();
    };

    return {
        positions: v2Positions,
        totalPools,
        refetch,
    };
}
