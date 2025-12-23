'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { parseUnits, formatUnits, Address, maxUint256 } from 'viem';
import { Token, SEI, USDC, WSEI } from '@/config/tokens';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';
import { ROUTER_ABI, ERC20_ABI } from '@/config/abis';
import { TokenInput } from './TokenInput';
import { SwapSettings } from './SwapSettings';
import { useSwap } from '@/hooks/useSwap';
import { useSwapV3 } from '@/hooks/useSwapV3';
import { useTokenBalance } from '@/hooks/useToken';
import { useMixedRouteQuoter } from '@/hooks/useMixedRouteQuoter';

interface Route {
    from: Address;
    to: Address;
    stable: boolean;
    factory: Address;
}

interface BestRoute {
    type: 'v2' | 'v3' | 'multi-hop';
    amountOut: string;
    tickSpacing?: number;
    feeLabel: string;
    stable?: boolean;
    via?: string; // Intermediate token symbol for multi-hop
    intermediate?: Token; // Intermediate token object for multi-hop execution
}

export function SwapInterface() {
    const { isConnected, address } = useAccount();

    // Token state
    const [tokenIn, setTokenIn] = useState<Token | undefined>(SEI);
    const [tokenOut, setTokenOut] = useState<Token | undefined>(USDC);
    const [amountIn, setAmountIn] = useState('');
    const [amountOut, setAmountOut] = useState('');

    // Best route (auto-detected)
    const [bestRoute, setBestRoute] = useState<BestRoute | null>(null);
    const [isQuoting, setIsQuoting] = useState(false);
    const [noRouteFound, setNoRouteFound] = useState(false);

    // Settings state
    const [slippage, setSlippage] = useState(0.5);
    const [deadline, setDeadline] = useState(30);

    // UI state
    const [txHash, setTxHash] = useState<string | null>(null);
    const [isApproving, setIsApproving] = useState(false);

    // Hooks
    const { executeSwap, isLoading: isLoadingV2, error: errorV2 } = useSwap();
    const { getQuoteV3, executeSwapV3, executeMultiHopSwapV3, isLoading: isLoadingV3, error: errorV3 } = useSwapV3();
    const { findBestRoute: findMultiHopRoute, getIntermediateToken } = useMixedRouteQuoter();
    const { formatted: formattedBalanceIn } = useTokenBalance(tokenIn);
    const { formatted: formattedBalanceOut } = useTokenBalance(tokenOut);
    const { writeContractAsync } = useWriteContract();

    const isLoading = isLoadingV2 || isLoadingV3;
    const error = errorV2 || errorV3;

    // Get actual token addresses (use WSEI for native SEI)
    const actualTokenIn = tokenIn?.isNative ? WSEI : tokenIn;
    const actualTokenOut = tokenOut?.isNative ? WSEI : tokenOut;

    // Calculate amountInWei for allowance check
    const amountInWei = actualTokenIn && amountIn && parseFloat(amountIn) > 0
        ? parseUnits(amountIn, actualTokenIn.decimals)
        : BigInt(0);

    // ===== Pre-check allowance for BOTH routers =====
    const { data: allowanceV2, refetch: refetchAllowanceV2 } = useReadContract({
        address: actualTokenIn?.address as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: address && actualTokenIn ? [address, V2_CONTRACTS.Router as Address] : undefined,
        query: {
            enabled: !!address && !!actualTokenIn && !tokenIn?.isNative,
        },
    });

    const { data: allowanceV3, refetch: refetchAllowanceV3 } = useReadContract({
        address: actualTokenIn?.address as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: address && actualTokenIn ? [address, CL_CONTRACTS.SwapRouter as Address] : undefined,
        query: {
            enabled: !!address && !!actualTokenIn && !tokenIn?.isNative,
        },
    });

    // Determine which router to use based on best route type
    const routerToApprove = bestRoute?.type === 'v2'
        ? V2_CONTRACTS.Router
        : CL_CONTRACTS.SwapRouter;

    // Get the relevant allowance based on best route
    const currentAllowance = bestRoute?.type === 'v2' ? allowanceV2 : allowanceV3;

    // Check if approval is needed for the CURRENT best route
    const needsApproval = !tokenIn?.isNative &&
        amountInWei > BigInt(0) &&
        bestRoute !== null && // Only check approval when we have a route
        (currentAllowance === undefined || (currentAllowance as bigint) < amountInWei);

    // Handle approve and then swap
    const handleApprove = async () => {
        if (!actualTokenIn || !address || !bestRoute) return;

        setIsApproving(true);
        try {
            await writeContractAsync({
                address: actualTokenIn.address as Address,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [routerToApprove as Address, maxUint256],
            });

            // Wait a bit for the chain to process, then refetch the correct allowance
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Refetch the appropriate allowance based on route type
            if (bestRoute.type === 'v2') {
                await refetchAllowanceV2();
            } else {
                await refetchAllowanceV3();
            }

        } catch (err) {
            console.error('Approve error:', err);
        }
        setIsApproving(false);
    };

    // ===== V2 Volatile Quote (using wagmi hook) =====
    const v2VolatileRoute: Route[] = actualTokenIn && actualTokenOut ? [{
        from: actualTokenIn.address as Address,
        to: actualTokenOut.address as Address,
        stable: false,
        factory: V2_CONTRACTS.PoolFactory as Address,
    }] : [];

    const { data: v2VolatileQuote } = useReadContract({
        address: V2_CONTRACTS.Router as Address,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: amountIn && actualTokenIn && parseFloat(amountIn) > 0
            ? [parseUnits(amountIn, actualTokenIn.decimals), v2VolatileRoute]
            : undefined,
        query: {
            enabled: !!actualTokenIn && !!actualTokenOut && !!amountIn && parseFloat(amountIn) > 0,
        },
    });

    // ===== V2 Stable Quote (using wagmi hook) =====
    const v2StableRoute: Route[] = actualTokenIn && actualTokenOut ? [{
        from: actualTokenIn.address as Address,
        to: actualTokenOut.address as Address,
        stable: true,
        factory: V2_CONTRACTS.PoolFactory as Address,
    }] : [];

    const { data: v2StableQuote } = useReadContract({
        address: V2_CONTRACTS.Router as Address,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: amountIn && actualTokenIn && parseFloat(amountIn) > 0
            ? [parseUnits(amountIn, actualTokenIn.decimals), v2StableRoute]
            : undefined,
        query: {
            enabled: !!actualTokenIn && !!actualTokenOut && !!amountIn && parseFloat(amountIn) > 0,
        },
    });

    // ===== Find Best Route (V2 + V3) =====
    useEffect(() => {
        const findBestRoute = async () => {
            if (!tokenIn || !tokenOut || !amountIn || parseFloat(amountIn) <= 0 || !actualTokenOut) {
                setBestRoute(null);
                setAmountOut('');
                setNoRouteFound(false);
                return;
            }

            setIsQuoting(true);
            setNoRouteFound(false);

            try {
                const routes: BestRoute[] = [];

                // === Get best V3 route (direct or multi-hop) - SINGLE call handles both ===
                const v3Route = await findMultiHopRoute(tokenIn, tokenOut, amountIn);

                if (v3Route && parseFloat(v3Route.amountOut) > 0) {
                    const feeMap: Record<number, string> = { 1: '0.005%', 10: '0.05%', 50: '0.02%', 80: '0.30%', 100: '0.045%', 200: '0.25%', 2000: '1%' };
                    if (v3Route.routeType === 'direct') {
                        routes.push({
                            type: 'v3',
                            amountOut: v3Route.amountOut,
                            tickSpacing: v3Route.tickSpacing1,
                            feeLabel: `V3 ${feeMap[v3Route.tickSpacing1 || 10] || ''}`,
                        });
                    } else if (v3Route.routeType === 'multi-hop' && v3Route.intermediate) {
                        routes.push({
                            type: 'multi-hop',
                            amountOut: v3Route.amountOut,
                            feeLabel: v3Route.via ? `via ${v3Route.via}` : 'Multi-hop',
                            via: v3Route.via,
                            intermediate: v3Route.intermediate,
                        });
                    }
                }

                // === V2 Volatile Quote (instant - already fetched by wagmi hook) ===
                if (v2VolatileQuote && Array.isArray(v2VolatileQuote) && v2VolatileQuote.length > 1) {
                    const outAmount = formatUnits(v2VolatileQuote[v2VolatileQuote.length - 1] as bigint, actualTokenOut.decimals);
                    if (parseFloat(outAmount) > 0) {
                        routes.push({
                            type: 'v2',
                            amountOut: outAmount,
                            stable: false,
                            feeLabel: 'V2 Volatile',
                        });
                    }
                }

                // === V2 Stable Quote (instant - already fetched by wagmi hook) ===
                if (v2StableQuote && Array.isArray(v2StableQuote) && v2StableQuote.length > 1) {
                    const outAmount = formatUnits(v2StableQuote[v2StableQuote.length - 1] as bigint, actualTokenOut.decimals);
                    if (parseFloat(outAmount) > 0) {
                        routes.push({
                            type: 'v2',
                            amountOut: outAmount,
                            stable: true,
                            feeLabel: 'V2 Stable',
                        });
                    }
                }

                // Find best route
                if (routes.length > 0) {
                    const best = routes.reduce((a, b) =>
                        parseFloat(a.amountOut) > parseFloat(b.amountOut) ? a : b
                    );
                    setBestRoute(best);
                    setAmountOut(best.amountOut);
                } else {
                    setBestRoute(null);
                    setAmountOut('');
                    setNoRouteFound(true);
                }
            } catch (err) {
                console.error('Quote error:', err);
                setBestRoute(null);
                setNoRouteFound(true);
            }

            setIsQuoting(false);
        };

        const debounce = setTimeout(findBestRoute, 300);
        return () => clearTimeout(debounce);
    }, [tokenIn, tokenOut, amountIn, actualTokenOut, v2VolatileQuote, v2StableQuote, findMultiHopRoute]);

    // Swap tokens
    const handleSwapTokens = useCallback(() => {
        setTokenIn(tokenOut);
        setTokenOut(tokenIn);
        setAmountIn(amountOut);
        setAmountOut(amountIn);
        setBestRoute(null);
    }, [tokenIn, tokenOut, amountIn, amountOut]);

    // Calculate min amount out with slippage
    const amountOutMin = amountOut
        ? (parseFloat(amountOut) * (1 - slippage / 100)).toFixed(6)
        : '0';

    // Check if swap is valid
    const canSwap = isConnected &&
        tokenIn &&
        tokenOut &&
        amountIn &&
        parseFloat(amountIn) > 0 &&
        bestRoute &&
        parseFloat(bestRoute.amountOut) > 0;

    // Calculate rate
    const rate = amountIn && amountOut && parseFloat(amountIn) > 0
        ? (parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)
        : null;

    const handleSwap = async () => {
        if (!canSwap || !tokenIn || !tokenOut || !bestRoute) return;

        let result;
        if (bestRoute.type === 'v2') {
            result = await executeSwap(
                tokenIn,
                tokenOut,
                amountIn,
                amountOutMin,
                bestRoute.stable || false,
                deadline
            );
        } else if (bestRoute.type === 'v3') {
            if (!bestRoute.tickSpacing) return;
            result = await executeSwapV3(
                tokenIn,
                tokenOut,
                amountIn,
                amountOutMin,
                bestRoute.tickSpacing,
                slippage
            );
        } else if (bestRoute.type === 'multi-hop') {
            // Multi-hop route - execute via intermediate token
            if (!bestRoute.intermediate) {
                console.error('Multi-hop route missing intermediate token');
                return;
            }
            result = await executeMultiHopSwapV3(
                tokenIn,
                bestRoute.intermediate,
                tokenOut,
                amountIn,
                amountOutMin,
                slippage
            );
        }

        if (result) {
            setTxHash(result.hash);
            setAmountIn('');
            setAmountOut('');
            setBestRoute(null);
        }
    };

    return (
        <div className="swap-card max-w-md mx-auto">
            {/* Header - Compact */}
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-bold">Swap</h2>
                <div className="flex items-center gap-1">
                    {bestRoute && (
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${bestRoute.type === 'v3' || bestRoute.type === 'multi-hop'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-primary/20 text-primary'
                            }`}>
                            {bestRoute.feeLabel}
                        </span>
                    )}
                    {noRouteFound && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400">No Route</span>
                    )}
                    {isQuoting && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-gray-400">...</span>
                    )}
                    <SwapSettings
                        slippage={slippage}
                        deadline={deadline}
                        onSlippageChange={setSlippage}
                        onDeadlineChange={setDeadline}
                    />
                </div>
            </div>

            {/* Error Display - Compact */}
            {error && (
                <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    {error.includes('User rejected') || error.includes('user rejected')
                        ? 'Transaction cancelled'
                        : error.includes('insufficient')
                            ? 'Insufficient balance'
                            : error.length > 50
                                ? error.slice(0, 50) + '...'
                                : error}
                </div>
            )}

            {/* Success Display */}
            {txHash && (
                <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
                    Success! <a href={`https://seitrace.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View →</a>
                </div>
            )}

            {/* Token In */}
            <TokenInput
                label="You pay"
                token={tokenIn}
                amount={amountIn}
                balance={formattedBalanceIn}
                onAmountChange={setAmountIn}
                onTokenSelect={setTokenIn}
                showMaxButton
            />

            {/* Swap Direction Button */}
            <div className="relative h-0 flex items-center justify-center z-10">
                <motion.button
                    onClick={handleSwapTokens}
                    className="swap-arrow-btn"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                </motion.button>
            </div>

            {/* Token Out */}
            <TokenInput
                label="You receive"
                token={tokenOut}
                amount={amountOut}
                balance={formattedBalanceOut}
                onAmountChange={() => { }}
                onTokenSelect={setTokenOut}
                disabled
            />

            {/* Rate Info - Compact */}
            {rate && tokenIn && tokenOut && (
                <div className="mt-3 p-2 rounded-lg bg-white/5 text-xs space-y-1">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Rate</span>
                        <span>1 {tokenIn.symbol} = {parseFloat(rate).toFixed(4)} {tokenOut.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Min. received</span>
                        <span>{parseFloat(amountOutMin).toFixed(4)} {tokenOut.symbol}</span>
                    </div>
                </div>
            )}

            {/* Approve/Swap Button */}
            {needsApproval && canSwap ? (
                <button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="w-full btn-primary py-4 text-base mt-4 disabled:opacity-50"
                >
                    {isApproving ? 'Approving...' : `Approve ${tokenIn?.symbol}`}
                </button>
            ) : (
                <button
                    onClick={handleSwap}
                    disabled={!canSwap || isLoading}
                    className="w-full btn-primary py-4 text-base mt-4 disabled:opacity-50"
                >
                    {isLoading
                        ? 'Swapping...'
                        : !isConnected
                            ? 'Connect Wallet'
                            : noRouteFound
                                ? 'No Route Found'
                                : !amountIn
                                    ? 'Enter Amount'
                                    : 'Swap'}
                </button>
            )}

            <div className="mt-3 text-center text-[10px] text-gray-500">
                Auto-routes via V2 + V3 pools
            </div>
        </div>
    );
}
