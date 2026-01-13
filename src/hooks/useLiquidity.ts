'use client';

import { useCallback, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { useWriteContract } from '@/hooks/useWriteContract';
import { parseUnits, formatUnits, Address, maxUint256 } from 'viem';
import { V2_CONTRACTS, COMMON } from '@/config/contracts';
import { ROUTER_ABI, ERC20_ABI, POOL_FACTORY_ABI } from '@/config/abis';
import { Token } from '@/config/tokens';

export function useLiquidity() {
    const { address, isConnected } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Approve token for router
    const approveToken = useCallback(
        async (token: Token, spender: Address): Promise<boolean> => {
            if (!address) return false;

            try {
                const hash = await writeContractAsync({
                    address: token.address as Address,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [spender, maxUint256],
                });

                return !!hash;
            } catch (err) {
                console.error('Approve error:', err);
                return false;
            }
        },
        [address, writeContractAsync]
    );

    // Add liquidity (token/token)
    const addLiquidity = useCallback(
        async (
            tokenA: Token,
            tokenB: Token,
            amountA: string,
            amountB: string,
            stable: boolean,
            slippage: number = 0.5,
            deadline: number = 30
        ): Promise<{ hash: string } | null> => {
            if (!address || !isConnected) {
                setError('Wallet not connected');
                return null;
            }

            setIsLoading(true);
            setError(null);

            try {
                const amountAWei = parseUnits(amountA, tokenA.decimals);
                const amountBWei = parseUnits(amountB, tokenB.decimals);
                const amountAMin = parseUnits(
                    (parseFloat(amountA) * (1 - slippage / 100)).toFixed(tokenA.decimals),
                    tokenA.decimals
                );
                const amountBMin = parseUnits(
                    (parseFloat(amountB) * (1 - slippage / 100)).toFixed(tokenB.decimals),
                    tokenB.decimals
                );
                const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + deadline * 60);

                const isNativeA = tokenA.isNative;
                const isNativeB = tokenB.isNative;

                let hash: `0x${string}`;

                if (isNativeA || isNativeB) {
                    // One token is native SEI
                    const token = isNativeA ? tokenB : tokenA;
                    const amountToken = isNativeA ? amountBWei : amountAWei;
                    const amountETH = isNativeA ? amountAWei : amountBWei;
                    const amountTokenMin = isNativeA ? amountBMin : amountAMin;
                    const amountETHMin = isNativeA ? amountAMin : amountBMin;

                    // Approve the non-native token
                    await approveToken(token, V2_CONTRACTS.Router as Address);

                    hash = await writeContractAsync({
                        address: V2_CONTRACTS.Router as Address,
                        abi: ROUTER_ABI,
                        functionName: 'addLiquidityETH',
                        args: [
                            token.address as Address,
                            stable,
                            amountToken,
                            amountTokenMin,
                            amountETHMin,
                            address,
                            deadlineTimestamp,
                        ],
                        value: amountETH,
                    });
                } else {
                    // Both tokens are ERC20
                    // Approve both tokens
                    await approveToken(tokenA, V2_CONTRACTS.Router as Address);
                    await approveToken(tokenB, V2_CONTRACTS.Router as Address);

                    hash = await writeContractAsync({
                        address: V2_CONTRACTS.Router as Address,
                        abi: ROUTER_ABI,
                        functionName: 'addLiquidity',
                        args: [
                            tokenA.address as Address,
                            tokenB.address as Address,
                            stable,
                            amountAWei,
                            amountBWei,
                            amountAMin,
                            amountBMin,
                            address,
                            deadlineTimestamp,
                        ],
                    });
                }

                return { hash };
            } catch (err: any) {
                console.error('Add liquidity error:', err);
                setError(err.message || 'Failed to add liquidity');
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [address, isConnected, writeContractAsync, approveToken]
    );

    // Remove liquidity
    const removeLiquidity = useCallback(
        async (
            tokenA: Token,
            tokenB: Token,
            liquidity: string,
            stable: boolean,
            slippage: number = 0.5,
            deadline: number = 30
        ): Promise<{ hash: string } | null> => {
            if (!address || !isConnected) {
                setError('Wallet not connected');
                return null;
            }

            setIsLoading(true);
            setError(null);

            try {
                const liquidityWei = parseUnits(liquidity, 18);
                const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + deadline * 60);

                // Get pool address to approve LP token
                // For now, we'll use 0 as min amounts (should calculate properly)
                const amountAMin = BigInt(0);
                const amountBMin = BigInt(0);

                const hash = await writeContractAsync({
                    address: V2_CONTRACTS.Router as Address,
                    abi: ROUTER_ABI,
                    functionName: 'removeLiquidity',
                    args: [
                        tokenA.address as Address,
                        tokenB.address as Address,
                        stable,
                        liquidityWei,
                        amountAMin,
                        amountBMin,
                        address,
                        deadlineTimestamp,
                    ],
                });

                return { hash };
            } catch (err: any) {
                console.error('Remove liquidity error:', err);
                setError(err.message || 'Failed to remove liquidity');
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [address, isConnected, writeContractAsync]
    );

    return {
        addLiquidity,
        removeLiquidity,
        approveToken,
        isLoading,
        error,
    };
}

// Hook to get pool address
export function usePool(tokenA: Token | undefined, tokenB: Token | undefined, stable: boolean) {
    const { data: poolAddress } = useReadContract({
        address: V2_CONTRACTS.PoolFactory as Address,
        abi: POOL_FACTORY_ABI,
        functionName: 'getPool',
        args: tokenA && tokenB
            ? [tokenA.address as Address, tokenB.address as Address, stable]
            : undefined,
        query: {
            enabled: !!tokenA && !!tokenB,
        },
    });

    return {
        poolAddress: poolAddress as Address | undefined,
        exists: poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000',
    };
}
