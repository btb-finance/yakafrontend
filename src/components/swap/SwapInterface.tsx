'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { Token, SEI, USDC } from '@/config/tokens';
import { V2_CONTRACTS } from '@/config/contracts';
import { ROUTER_ABI } from '@/config/abis';
import { TokenInput } from './TokenInput';
import { SwapSettings } from './SwapSettings';
import { useSwap } from '@/hooks/useSwap';
import { useTokenBalance } from '@/hooks/useToken';

interface Route {
    from: Address;
    to: Address;
    stable: boolean;
    factory: Address;
}

export function SwapInterface() {
    const { isConnected, address } = useAccount();

    // Token state
    const [tokenIn, setTokenIn] = useState<Token | undefined>(SEI);
    const [tokenOut, setTokenOut] = useState<Token | undefined>(USDC);
    const [amountIn, setAmountIn] = useState('');
    const [amountOut, setAmountOut] = useState('');
    const [stable, setStable] = useState(false);

    // Settings state
    const [slippage, setSlippage] = useState(0.5);
    const [deadline, setDeadline] = useState(30);

    // UI state
    const [txHash, setTxHash] = useState<string | null>(null);

    // Hooks
    const { executeSwap, isLoading, error } = useSwap();
    const { balance: balanceIn, formatted: formattedBalanceIn } = useTokenBalance(tokenIn);
    const { balance: balanceOut, formatted: formattedBalanceOut } = useTokenBalance(tokenOut);

    // Build route for quote
    const route: Route[] = tokenIn && tokenOut ? [
        {
            from: (tokenIn.isNative ? '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7' : tokenIn.address) as Address,
            to: (tokenOut.isNative ? '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7' : tokenOut.address) as Address,
            stable,
            factory: V2_CONTRACTS.PoolFactory as Address,
        },
    ] : [];

    // Get quote from router
    const { data: quoteData, refetch: refetchQuote } = useReadContract({
        address: V2_CONTRACTS.Router as Address,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: amountIn && tokenIn && parseFloat(amountIn) > 0
            ? [parseUnits(amountIn, tokenIn.decimals), route]
            : undefined,
        query: {
            enabled: !!tokenIn && !!tokenOut && !!amountIn && parseFloat(amountIn) > 0,
        },
    });

    // Update amountOut when quote changes
    useEffect(() => {
        if (quoteData && tokenOut && Array.isArray(quoteData) && quoteData.length > 1) {
            const outAmount = formatUnits(quoteData[quoteData.length - 1] as bigint, tokenOut.decimals);
            setAmountOut(outAmount);
        } else if (!amountIn || parseFloat(amountIn) === 0) {
            setAmountOut('');
        }
    }, [quoteData, tokenOut, amountIn]);

    // Swap tokens
    const handleSwapTokens = useCallback(() => {
        setTokenIn(tokenOut);
        setTokenOut(tokenIn);
        setAmountIn(amountOut);
        setAmountOut(amountIn);
    }, [tokenIn, tokenOut, amountIn, amountOut]);

    // Handle amount changes
    const handleAmountInChange = (amount: string) => {
        setAmountIn(amount);
        // Quote will be fetched automatically via useReadContract
    };

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
        amountOut &&
        parseFloat(amountOut) > 0;

    // Calculate price impact
    const priceImpact = amountIn && amountOut && parseFloat(amountIn) > 0
        ? '< 0.5%' // TODO: Calculate real price impact
        : '--';

    // Calculate rate
    const rate = amountIn && amountOut && parseFloat(amountIn) > 0
        ? (parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)
        : null;

    const handleSwap = async () => {
        if (!canSwap || !tokenIn || !tokenOut) return;

        const result = await executeSwap(
            tokenIn,
            tokenOut,
            amountIn,
            amountOutMin,
            stable,
            deadline
        );

        if (result) {
            setTxHash(result.hash);
            setAmountIn('');
            setAmountOut('');
        }
    };

    return (
        <div className="swap-card max-w-md mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Swap</h2>
                <div className="flex items-center gap-2">
                    {/* Stable/Volatile Toggle */}
                    <button
                        onClick={() => setStable(!stable)}
                        className={`px-3 py-1 text-xs rounded-lg transition ${stable ? 'bg-primary text-white' : 'bg-white/5 text-gray-400'
                            }`}
                    >
                        {stable ? 'Stable' : 'Volatile'}
                    </button>
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

            {/* Input Token */}
            <TokenInput
                label="You Pay"
                token={tokenIn}
                amount={amountIn}
                onAmountChange={handleAmountInChange}
                onTokenSelect={setTokenIn}
                excludeToken={tokenOut}
                showMaxButton={true}
                balance={formattedBalanceIn}
            />

            {/* Swap Direction Button */}
            <div className="flex justify-center -my-2 relative z-10">
                <motion.button
                    onClick={handleSwapTokens}
                    className="p-3 rounded-xl bg-bg-secondary border border-glass-border hover:bg-white/5 transition group"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <svg
                        className="w-5 h-5 text-gray-400 group-hover:text-white transition transform group-hover:rotate-180 duration-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                        />
                    </svg>
                </motion.button>
            </div>

            {/* Output Token */}
            <TokenInput
                label="You Receive"
                token={tokenOut}
                amount={amountOut}
                onAmountChange={setAmountOut}
                onTokenSelect={setTokenOut}
                excludeToken={tokenIn}
                disabled={true}
                balance={formattedBalanceOut}
            />

            {/* Rate Display */}
            {rate && tokenIn && tokenOut && (
                <div className="mt-4 p-3 rounded-xl bg-white/5">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Rate</span>
                        <span>
                            1 {tokenIn.symbol} = {rate} {tokenOut.symbol}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Price Impact</span>
                        <span className="text-green-400">{priceImpact}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Min. Received</span>
                        <span>{parseFloat(amountOutMin).toFixed(4)} {tokenOut.symbol}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Slippage</span>
                        <span>{slippage}%</span>
                    </div>
                </div>
            )}

            {/* Swap Button */}
            <motion.button
                onClick={handleSwap}
                disabled={!canSwap || isLoading}
                className="w-full btn-primary mt-6 py-4 text-lg"
                whileHover={canSwap && !isLoading ? { scale: 1.01 } : {}}
                whileTap={canSwap && !isLoading ? { scale: 0.99 } : {}}
            >
                {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        Swapping...
                    </span>
                ) : !isConnected ? (
                    'Connect Wallet'
                ) : !tokenIn || !tokenOut ? (
                    'Select Tokens'
                ) : !amountIn || parseFloat(amountIn) <= 0 ? (
                    'Enter Amount'
                ) : !amountOut || parseFloat(amountOut) <= 0 ? (
                    'Insufficient Liquidity'
                ) : (
                    `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`
                )}
            </motion.button>

            {/* Powered by */}
            <div className="mt-4 text-center text-xs text-gray-500">
                Powered by YAKA V2 Router
            </div>
        </div>
    );
}
