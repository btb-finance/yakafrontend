'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { Token, SEI, USDC, WSEI } from '@/config/tokens';
import { V2_CONTRACTS } from '@/config/contracts';
import { ROUTER_ABI } from '@/config/abis';
import { TokenInput } from './TokenInput';
import { SwapSettings } from './SwapSettings';
import { useSwap } from '@/hooks/useSwap';
import { useSwapV3 } from '@/hooks/useSwapV3';
import { useTokenBalance } from '@/hooks/useToken';

interface Route {
    from: Address;
    to: Address;
    stable: boolean;
    factory: Address;
}

interface BestRoute {
    type: 'v2' | 'v3';
    amountOut: string;
    tickSpacing?: number;
    feeLabel: string;
    stable?: boolean;
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

    // Hooks
    const { executeSwap, isLoading: isLoadingV2, error: errorV2 } = useSwap();
    const { getQuoteV3, executeSwapV3, isLoading: isLoadingV3, error: errorV3 } = useSwapV3();
    const { formatted: formattedBalanceIn } = useTokenBalance(tokenIn);
    const { formatted: formattedBalanceOut } = useTokenBalance(tokenOut);

    const isLoading = isLoadingV2 || isLoadingV3;
    const error = errorV2 || errorV3;

    // Get actual token addresses (use WSEI for native SEI)
    const actualTokenIn = tokenIn?.isNative ? WSEI : tokenIn;
    const actualTokenOut = tokenOut?.isNative ? WSEI : tokenOut;

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

                // === Get V3 Quote (auto-detects best pool) ===
                const v3Quote = await getQuoteV3(tokenIn, tokenOut, amountIn);
                if (v3Quote && v3Quote.poolExists && parseFloat(v3Quote.amountOut) > 0) {
                    const feeMap: Record<number, string> = { 1: '0.01%', 50: '0.05%', 100: '0.05%', 200: '0.30%', 2000: '1.00%' };
                    routes.push({
                        type: 'v3',
                        amountOut: v3Quote.amountOut,
                        tickSpacing: v3Quote.tickSpacing,
                        feeLabel: `V3 ${feeMap[v3Quote.tickSpacing] || ''}`,
                    });
                }

                // === V2 Volatile Quote ===
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

                // === V2 Stable Quote ===
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
    }, [tokenIn, tokenOut, amountIn, actualTokenOut, v2VolatileQuote, v2StableQuote, getQuoteV3]);

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
        } else {
            if (!bestRoute.tickSpacing) return;
            result = await executeSwapV3(
                tokenIn,
                tokenOut,
                amountIn,
                amountOutMin,
                bestRoute.tickSpacing,
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
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Swap</h2>
                <div className="flex items-center gap-2">
                    {/* Best Route Badge */}
                    {bestRoute && (
                        <span className={`px-2 py-1 text-xs rounded-lg ${bestRoute.type === 'v3'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-primary/20 text-primary'
                            }`}>
                            Best: {bestRoute.feeLabel}
                        </span>
                    )}
                    {noRouteFound && (
                        <span className="px-2 py-1 text-xs rounded-lg bg-red-500/20 text-red-400">
                            No Route
                        </span>
                    )}
                    {isQuoting && (
                        <span className="px-2 py-1 text-xs rounded-lg bg-white/10 text-gray-400">
                            Finding best...
                        </span>
                    )}
                    <SwapSettings
                        slippage={slippage}
                        deadline={deadline}
                        onSlippageChange={setSlippage}
                        onDeadlineChange={setDeadline}
                    />
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Success Display */}
            {txHash && (
                <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                    Transaction submitted!{' '}
                    <a
                        href={`https://seiscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        View on SeiScan
                    </a>
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

            {/* Rate Info */}
            {rate && tokenIn && tokenOut && (
                <div className="mt-4 p-3 rounded-xl bg-white/5">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Rate</span>
                        <span>
                            1 {tokenIn.symbol} = {rate} {tokenOut.symbol}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Route</span>
                        <span className={bestRoute?.type === 'v3' ? 'text-green-400' : 'text-primary'}>
                            {bestRoute?.feeLabel || '--'}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Min. received</span>
                        <span>{amountOutMin} {tokenOut.symbol}</span>
                    </div>
                </div>
            )}

            {/* Swap Button */}
            <motion.button
                onClick={handleSwap}
                disabled={!canSwap || isLoading}
                className="w-full btn-primary py-4 mt-6 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={canSwap ? { scale: 1.01 } : {}}
                whileTap={canSwap ? { scale: 0.99 } : {}}
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
            </motion.button>

            {/* Footer */}
            <div className="mt-4 text-center text-xs text-gray-500">
                Powered by YAKA Smart Router (V2 + V3)
            </div>
        </div>
    );
}
