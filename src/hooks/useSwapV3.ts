'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { Token, WSEI } from '@/config/tokens';
import { CL_CONTRACTS } from '@/config/contracts';
import { SWAP_ROUTER_ABI, QUOTER_V2_ABI, ERC20_ABI } from '@/config/abis';

interface SwapQuoteV3 {
    amountOut: string;
    gasEstimate: bigint;
    sqrtPriceX96After: bigint;
}

export function useSwapV3() {
    const { address } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Get quote from QuoterV2
    const getQuoteV3 = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        tickSpacing: number = 100
    ): Promise<SwapQuoteV3 | null> => {
        if (!amountIn || parseFloat(amountIn) <= 0) return null;

        try {
            // For V3, use WSEI instead of native SEI
            const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
            const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;

            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);

            // Call quoter via eth_call (QuoterV2 reverts with data)
            const response = await fetch('https://evm-rpc.sei-apis.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: CL_CONTRACTS.QuoterV2,
                        data: encodeQuoterCall(
                            actualTokenIn.address,
                            actualTokenOut.address,
                            amountInWei,
                            tickSpacing
                        )
                    }, 'latest'],
                    id: 1
                })
            });

            const result = await response.json();

            if (result.result && result.result !== '0x') {
                // Decode the result
                const decoded = decodeQuoterResult(result.result);
                return {
                    amountOut: formatUnits(decoded.amountOut, actualTokenOut.decimals),
                    gasEstimate: decoded.gasEstimate,
                    sqrtPriceX96After: decoded.sqrtPriceX96After
                };
            }

            return null;
        } catch (err) {
            console.error('V3 quote error:', err);
            return null;
        }
    }, []);

    // Execute V3 swap
    const executeSwapV3 = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        amountOutMin: string,
        tickSpacing: number = 100,
        slippage: number = 0.5
    ) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            // For V3, use WSEI instead of native SEI
            const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
            const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;

            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);
            const minOut = parseUnits(amountOutMin, actualTokenOut.decimals);
            const slippageAmount = (minOut * BigInt(Math.floor(slippage * 100))) / BigInt(10000);
            const amountOutMinimum = minOut - slippageAmount;

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Approve if not native
            if (!tokenIn.isNative) {
                await writeContractAsync({
                    address: actualTokenIn.address as Address,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [CL_CONTRACTS.SwapRouter as Address, amountInWei],
                });
            }

            // Execute swap
            const hash = await writeContractAsync({
                address: CL_CONTRACTS.SwapRouter as Address,
                abi: SWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: actualTokenIn.address as Address,
                    tokenOut: actualTokenOut.address as Address,
                    tickSpacing,
                    recipient: address,
                    deadline,
                    amountIn: amountInWei,
                    amountOutMinimum,
                    sqrtPriceLimitX96: BigInt(0),
                }],
                value: tokenIn.isNative ? amountInWei : undefined,
            });

            setTxHash(hash);
            setIsLoading(false);
            return { hash };
        } catch (err: any) {
            console.error('V3 swap error:', err);
            setError(err.message || 'Swap failed');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync]);

    return {
        getQuoteV3,
        executeSwapV3,
        isLoading,
        error,
        txHash,
    };
}

// Helper: Encode QuoterV2.quoteExactInputSingle call
function encodeQuoterCall(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    tickSpacing: number
): string {
    // Function selector for quoteExactInputSingle
    const selector = 'c6a5026a'; // keccak256("quoteExactInputSingle((address,address,uint256,int24,uint160))")

    // Encode tuple: (tokenIn, tokenOut, amountIn, tickSpacing, sqrtPriceLimitX96)
    const tokenInPadded = tokenIn.slice(2).padStart(64, '0');
    const tokenOutPadded = tokenOut.slice(2).padStart(64, '0');
    const amountInHex = amountIn.toString(16).padStart(64, '0');
    const tickSpacingHex = (tickSpacing >= 0 ? tickSpacing : 0xFFFFFFFF + tickSpacing + 1).toString(16).padStart(64, '0');
    const sqrtPriceLimitHex = '0'.padStart(64, '0');

    return `0x${selector}${'0'.padStart(64, '0').slice(0, 62)}20${tokenInPadded}${tokenOutPadded}${amountInHex}${tickSpacingHex}${sqrtPriceLimitHex}`;
}

// Helper: Decode QuoterV2 result
function decodeQuoterResult(data: string): { amountOut: bigint; sqrtPriceX96After: bigint; gasEstimate: bigint } {
    // Remove 0x prefix
    const hex = data.slice(2);

    // Each value is 32 bytes (64 hex chars)
    const amountOut = BigInt('0x' + hex.slice(0, 64));
    const sqrtPriceX96After = BigInt('0x' + hex.slice(64, 128));
    // Skip initializedTicksCrossed (128-192)
    const gasEstimate = BigInt('0x' + hex.slice(192, 256));

    return { amountOut, sqrtPriceX96After, gasEstimate };
}
