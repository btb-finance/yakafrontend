'use client';
import { getPrimaryRpc } from '@/utils/rpc';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { Token, WSEI } from '@/config/tokens';
import { CL_CONTRACTS } from '@/config/contracts';
import { SWAP_ROUTER_ABI, ERC20_ABI } from '@/config/abis';

// CL tick spacings from CLFactory contract
const TICK_SPACINGS = [1, 50, 100, 200, 2000] as const;

interface SwapQuoteV3 {
    amountOut: string;
    gasEstimate: bigint;
    sqrtPriceX96After: bigint;
    tickSpacing: number;
    poolExists: boolean;
}

interface BestQuote extends SwapQuoteV3 {
    allQuotes: SwapQuoteV3[];
}

export function useSwapV3() {
    const { address } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Check if a pool exists for given token pair and tick spacing
    const checkPoolExists = useCallback(async (
        tokenIn: string,
        tokenOut: string,
        tickSpacing: number
    ): Promise<boolean> => {
        try {
            // Sort tokens
            const [token0, token1] = tokenIn.toLowerCase() < tokenOut.toLowerCase()
                ? [tokenIn, tokenOut]
                : [tokenOut, tokenIn];

            // Call CLFactory.getPool
            const response = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: CL_CONTRACTS.CLFactory,
                        data: encodeGetPoolCall(token0, token1, tickSpacing)
                    }, 'latest'],
                    id: 1
                })
            });

            const result = await response.json();
            const poolAddress = result.result;

            // If pool address is not zero, pool exists
            return poolAddress && poolAddress !== '0x' + '0'.repeat(64);
        } catch {
            return false;
        }
    }, []);

    // Get quote for specific tick spacing - directly call quoter (faster than checking pool first)
    const getQuoteForTickSpacing = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        tickSpacing: number
    ): Promise<SwapQuoteV3 | null> => {
        if (!amountIn || parseFloat(amountIn) <= 0) return null;

        try {
            const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
            const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;
            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);

            // Call quoter directly - it will fail if pool doesn't exist (faster than checking first)
            const response = await fetch(getPrimaryRpc(), {
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

            if (result.result && result.result !== '0x' && result.result.length > 66) {
                const decoded = decodeQuoterResult(result.result);
                if (decoded.amountOut > BigInt(0)) {
                    return {
                        amountOut: formatUnits(decoded.amountOut, actualTokenOut.decimals),
                        gasEstimate: decoded.gasEstimate,
                        sqrtPriceX96After: decoded.sqrtPriceX96After,
                        tickSpacing,
                        poolExists: true,
                    };
                }
            }

            return null;
        } catch {
            return null;
        }
    }, []);

    // Get best quote across all tick spacings (AUTO mode)
    const getQuoteV3 = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        tickSpacing?: number // Optional - if not provided, finds best
    ): Promise<BestQuote | null> => {
        if (!amountIn || parseFloat(amountIn) <= 0) return null;

        try {
            // If specific tick spacing provided, only check that one
            if (tickSpacing !== undefined) {
                const quote = await getQuoteForTickSpacing(tokenIn, tokenOut, amountIn, tickSpacing);
                if (quote && quote.poolExists && parseFloat(quote.amountOut) > 0) {
                    return { ...quote, allQuotes: [quote] };
                }
                return null;
            }

            // Try all tick spacings in parallel
            const quotePromises = TICK_SPACINGS.map(ts =>
                getQuoteForTickSpacing(tokenIn, tokenOut, amountIn, ts)
            );

            const allQuotes = (await Promise.all(quotePromises)).filter(
                (q): q is SwapQuoteV3 => q !== null && q.poolExists && parseFloat(q.amountOut) > 0
            );

            if (allQuotes.length === 0) {
                return null;
            }

            // Find the best quote (highest amountOut)
            const bestQuote = allQuotes.reduce((best, current) =>
                parseFloat(current.amountOut) > parseFloat(best.amountOut) ? current : best
            );

            return { ...bestQuote, allQuotes };
        } catch (err) {
            console.error('V3 quote error:', err);
            return null;
        }
    }, [getQuoteForTickSpacing]);

    // Execute V3 swap
    const executeSwapV3 = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        amountOutMin: string,
        tickSpacing: number, // Required - from quote
        slippage: number = 0.5
    ) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
            const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;

            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);
            // amountOutMin is already slippage-adjusted from SwapInterface
            const amountOutMinimum = parseUnits(amountOutMin, actualTokenOut.decimals);

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

    // Execute multi-hop V3 swap via intermediate token
    const executeMultiHopSwapV3 = useCallback(async (
        tokenIn: Token,
        intermediate: Token,
        tokenOut: Token,
        amountIn: string,
        amountOutMin: string,
        slippage: number = 0.5
    ) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
            const actualIntermediate = intermediate.isNative ? WSEI : intermediate;
            const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;

            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);

            // amountOutMin is already slippage-adjusted from SwapInterface, but for multi-hop
            // we add a small additional buffer (0.5%) since prices can move between the two swaps
            const minOut = parseUnits(amountOutMin, actualTokenOut.decimals);
            // Apply a small additional buffer for multi-hop (0.5% more tolerance)
            const multiHopBuffer = (minOut * BigInt(50)) / BigInt(10000); // 0.5%
            const amountOutMinimum = minOut - multiHopBuffer;

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Find tick spacings for both legs
            let tickSpacing1 = 0;
            let tickSpacing2 = 0;

            // Check first leg pools
            for (const ts of TICK_SPACINGS) {
                if (await checkPoolExists(actualTokenIn.address, actualIntermediate.address, ts)) {
                    tickSpacing1 = ts;
                    break;
                }
            }
            // Check second leg pools
            for (const ts of TICK_SPACINGS) {
                if (await checkPoolExists(actualIntermediate.address, actualTokenOut.address, ts)) {
                    tickSpacing2 = ts;
                    break;
                }
            }

            if (!tickSpacing1 || !tickSpacing2) {
                setError('No multi-hop route available');
                setIsLoading(false);
                return null;
            }

            // Encode path: tokenIn(20) + tickSpacing1(3) + intermediate(20) + tickSpacing2(3) + tokenOut(20)
            const encodeTickSpacing = (ts: number): string => {
                // Convert to signed int24 hex (3 bytes)
                const hex = ts >= 0
                    ? ts.toString(16).padStart(6, '0')
                    : ((1 << 24) + ts).toString(16);
                return hex;
            };

            const path = '0x' +
                actualTokenIn.address.slice(2).toLowerCase() +
                encodeTickSpacing(tickSpacing1) +
                actualIntermediate.address.slice(2).toLowerCase() +
                encodeTickSpacing(tickSpacing2) +
                actualTokenOut.address.slice(2).toLowerCase();

            // Approve if not native
            if (!tokenIn.isNative) {
                await writeContractAsync({
                    address: actualTokenIn.address as Address,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [CL_CONTRACTS.SwapRouter as Address, amountInWei],
                });
            }

            // Execute multi-hop swap using exactInput
            const hash = await writeContractAsync({
                address: CL_CONTRACTS.SwapRouter as Address,
                abi: [
                    {
                        inputs: [{
                            components: [
                                { name: 'path', type: 'bytes' },
                                { name: 'recipient', type: 'address' },
                                { name: 'deadline', type: 'uint256' },
                                { name: 'amountIn', type: 'uint256' },
                                { name: 'amountOutMinimum', type: 'uint256' },
                            ],
                            name: 'params',
                            type: 'tuple',
                        }],
                        name: 'exactInput',
                        outputs: [{ name: 'amountOut', type: 'uint256' }],
                        stateMutability: 'payable',
                        type: 'function',
                    }
                ],
                functionName: 'exactInput',
                args: [{
                    path: path as `0x${string}`,
                    recipient: address,
                    deadline,
                    amountIn: amountInWei,
                    amountOutMinimum,
                }],
                value: tokenIn.isNative ? amountInWei : undefined,
            });

            setTxHash(hash);
            setIsLoading(false);
            return { hash };
        } catch (err: any) {
            console.error('Multi-hop V3 swap error:', err);
            setError(err.message || 'Multi-hop swap failed');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, checkPoolExists]);

    return {
        getQuoteV3,
        executeSwapV3,
        executeMultiHopSwapV3,
        checkPoolExists,
        isLoading,
        error,
        txHash,
        TICK_SPACINGS,
    };
}

// Helper: Encode CLFactory.getPool(token0, token1, tickSpacing) call
function encodeGetPoolCall(token0: string, token1: string, tickSpacing: number): string {
    // Function selector for getPool(address,address,int24) - verified via cast sig
    const selector = '28af8d0b';

    const token0Padded = token0.slice(2).toLowerCase().padStart(64, '0');
    const token1Padded = token1.slice(2).toLowerCase().padStart(64, '0');

    // Handle signed int24
    let tickHex: string;
    if (tickSpacing >= 0) {
        tickHex = tickSpacing.toString(16).padStart(64, '0');
    } else {
        const uint256Value = BigInt(2) ** BigInt(256) + BigInt(tickSpacing);
        tickHex = uint256Value.toString(16);
    }

    return `0x${selector}${token0Padded}${token1Padded}${tickHex}`;
}

// Helper: Encode QuoterV2.quoteExactInputSingle call
function encodeQuoterCall(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    tickSpacing: number
): string {
    // Function selector for quoteExactInputSingle((address,address,uint256,int24,uint160)) - verified via cast sig
    const selector = '9e7defe6';

    // Encode tuple: (tokenIn, tokenOut, amountIn, tickSpacing, sqrtPriceLimitX96)
    const tokenInPadded = tokenIn.slice(2).padStart(64, '0');
    const tokenOutPadded = tokenOut.slice(2).padStart(64, '0');
    const amountInHex = amountIn.toString(16).padStart(64, '0');

    // Handle signed int24
    let tickHex: string;
    if (tickSpacing >= 0) {
        tickHex = tickSpacing.toString(16).padStart(64, '0');
    } else {
        const uint256Value = BigInt(2) ** BigInt(256) + BigInt(tickSpacing);
        tickHex = uint256Value.toString(16);
    }

    const sqrtPriceLimitHex = '0'.padStart(64, '0');

    // Struct tuple encoding - just concatenate the fields directly after selector
    return `0x${selector}${tokenInPadded}${tokenOutPadded}${amountInHex}${tickHex}${sqrtPriceLimitHex}`;
}

// Helper: Decode QuoterV2 result
function decodeQuoterResult(data: string): { amountOut: bigint; sqrtPriceX96After: bigint; gasEstimate: bigint } {
    const hex = data.slice(2);

    const amountOut = BigInt('0x' + hex.slice(0, 64));
    const sqrtPriceX96After = BigInt('0x' + hex.slice(64, 128));
    const gasEstimate = BigInt('0x' + hex.slice(192, 256));

    return { amountOut, sqrtPriceX96After, gasEstimate };
}
