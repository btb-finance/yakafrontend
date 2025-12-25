'use client';

import { useCallback, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, Address, maxUint256 } from 'viem';
import { V2_CONTRACTS, CL_CONTRACTS, COMMON } from '@/config/contracts';
import { ROUTER_ABI, ERC20_ABI } from '@/config/abis';
import { Token } from '@/config/tokens';

interface Route {
    from: Address;
    to: Address;
    stable: boolean;
    factory: Address;
}

export function useSwap() {
    const { address, isConnected } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Get quote for swap
    const getQuote = useCallback(
        async (
            tokenIn: Token,
            tokenOut: Token,
            amountIn: string,
            stable: boolean = false
        ): Promise<{ amountOut: string; route: Route[] } | null> => {
            try {
                if (!amountIn || parseFloat(amountIn) === 0) return null;

                const amountInWei = parseUnits(amountIn, tokenIn.decimals);
                const route: Route[] = [
                    {
                        from: tokenIn.address as Address,
                        to: tokenOut.address as Address,
                        stable,
                        factory: V2_CONTRACTS.PoolFactory as Address,
                    },
                ];

                // We'll calculate this on the frontend for now
                // In production, you'd call the contract
                return {
                    amountOut: (parseFloat(amountIn) * 0.997).toFixed(tokenOut.decimals), // Simulated
                    route,
                };
            } catch (err) {
                console.error('Quote error:', err);
                return null;
            }
        },
        []
    );

    // Check and approve token
    const approveToken = useCallback(
        async (token: Token, amount: bigint, spender: Address): Promise<boolean> => {
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

    // Execute swap
    const executeSwap = useCallback(
        async (
            tokenIn: Token,
            tokenOut: Token,
            amountIn: string,
            amountOutMin: string,
            stable: boolean = false,
            deadline: number = 30 // minutes
        ): Promise<{ hash: string } | null> => {
            if (!address || !isConnected) {
                setError('Wallet not connected');
                return null;
            }

            setIsLoading(true);
            setError(null);

            try {
                const amountInWei = parseUnits(amountIn, tokenIn.decimals);
                const amountOutMinWei = parseUnits(amountOutMin, tokenOut.decimals);
                const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + deadline * 60);

                const route: Route[] = [
                    {
                        from: tokenIn.address as Address,
                        to: tokenOut.address as Address,
                        stable,
                        factory: V2_CONTRACTS.PoolFactory as Address,
                    },
                ];

                // Check if tokenIn is native SEI
                const isNativeIn = tokenIn.isNative;
                const isNativeOut = tokenOut.isNative;

                let hash: `0x${string}`;

                if (isNativeIn) {
                    // Swap SEI for Token
                    const wethRoute: Route[] = [
                        {
                            from: COMMON.WSEI as Address,
                            to: tokenOut.address as Address,
                            stable,
                            factory: V2_CONTRACTS.PoolFactory as Address,
                        },
                    ];

                    hash = await writeContractAsync({
                        address: V2_CONTRACTS.Router as Address,
                        abi: ROUTER_ABI,
                        functionName: 'swapExactETHForTokens',
                        args: [amountOutMinWei, wethRoute as readonly { from: Address; to: Address; stable: boolean; factory: Address; }[], address, deadlineTimestamp],
                        value: amountInWei,
                    });
                } else if (isNativeOut) {
                    // Swap Token for SEI
                    const wethRoute: Route[] = [
                        {
                            from: tokenIn.address as Address,
                            to: COMMON.WSEI as Address,
                            stable,
                            factory: V2_CONTRACTS.PoolFactory as Address,
                        },
                    ];
                    // NOTE: Approval is handled by SwapInterface before calling this function

                    hash = await writeContractAsync({
                        address: V2_CONTRACTS.Router as Address,
                        abi: ROUTER_ABI,
                        functionName: 'swapExactTokensForETH',
                        args: [amountInWei, amountOutMinWei, wethRoute as readonly { from: Address; to: Address; stable: boolean; factory: Address; }[], address, deadlineTimestamp],
                    });
                } else {
                    // NOTE: Approval is handled by SwapInterface before calling this function

                    hash = await writeContractAsync({
                        address: V2_CONTRACTS.Router as Address,
                        abi: ROUTER_ABI,
                        functionName: 'swapExactTokensForTokens',
                        args: [amountInWei, amountOutMinWei, route as readonly { from: Address; to: Address; stable: boolean; factory: Address; }[], address, deadlineTimestamp],
                    });
                }

                return { hash };
            } catch (err: any) {
                console.error('Swap error:', err);
                setError(err.message || 'Swap failed');
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [address, isConnected, writeContractAsync, approveToken]
    );

    return {
        getQuote,
        executeSwap,
        approveToken,
        isLoading,
        error,
    };
}
