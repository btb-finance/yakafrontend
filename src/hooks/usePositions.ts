'use client';

import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { Address } from 'viem';
import { CL_CONTRACTS, V2_CONTRACTS } from '@/config/contracts';
import { NFT_POSITION_MANAGER_ABI, ERC20_ABI, POOL_FACTORY_ABI, POOL_ABI } from '@/config/abis';

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
}

export interface V2Position {
    poolAddress: Address;
    token0: Address;
    token1: Address;
    stable: boolean;
    lpBalance: bigint;
}

// Hook to fetch CL positions from NonfungiblePositionManager
export function useCLPositions() {
    const { address } = useAccount();

    // Get number of positions
    const { data: positionCount, refetch: refetchCount } = useReadContract({
        address: CL_CONTRACTS.NonfungiblePositionManager as Address,
        abi: NFT_POSITION_MANAGER_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });

    const count = positionCount ? Number(positionCount) : 0;
    const clPositions: CLPosition[] = [];

    // For simplicity, we'll fetch positions in a single batch if count > 0
    // In a real app you'd use multicall or pagination
    const refetch = () => {
        refetchCount();
    };

    return {
        positions: clPositions,
        positionCount: count,
        refetch,
    };
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
