'use client';

import { useState, useCallback } from 'react';
import { parseUnits, formatUnits, Address, encodePacked, encodeAbiParameters, parseAbiParameters } from 'viem';
import { Token, WSEI, USDC, USDCN, SEI } from '@/config/tokens';
import { CL_CONTRACTS, V2_CONTRACTS } from '@/config/contracts';

// Common intermediate tokens for routing
const INTERMEDIATE_TOKENS = [
    WSEI,
    USDC,
    USDCN,
];

// Tick spacings actually used (1, 10, 80 are most common)
const TICK_SPACINGS = [1, 10, 80] as const;

interface RouteQuote {
    amountOut: string;
    path: string[];  // Token symbols for display
    routeType: 'direct' | 'multi-hop';
    via?: string;    // Intermediate token symbol if multi-hop
    intermediate?: Token; // Intermediate token object for execution
    gasEstimate?: bigint;
}

export function useMixedRouteQuoter() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Quote a direct V3 swap
    const quoteDirectV3 = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string
    ): Promise<RouteQuote | null> => {
        const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
        const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;

        if (!amountIn || parseFloat(amountIn) <= 0) return null;

        try {
            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);

            // Try all tick spacings in parallel and find best
            const quotePromises = TICK_SPACINGS.map(tickSpacing =>
                callQuoterV3Single(
                    actualTokenIn.address,
                    actualTokenOut.address,
                    amountInWei,
                    tickSpacing
                )
            );
            const results = await Promise.all(quotePromises);
            const validResult = results.find(r => r && r.amountOut > BigInt(0));

            if (validResult) {
                return {
                    amountOut: formatUnits(validResult.amountOut, actualTokenOut.decimals),
                    path: [tokenIn.symbol, tokenOut.symbol],
                    routeType: 'direct',
                    gasEstimate: validResult.gasEstimate,
                };
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    // Quote a multi-hop V3 swap through intermediate token
    const quoteMultiHopV3 = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        intermediate: Token
    ): Promise<RouteQuote | null> => {
        const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
        const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;
        const actualIntermediate = intermediate.isNative ? WSEI : intermediate;

        // Skip if intermediate is same as input or output
        if (actualIntermediate.address.toLowerCase() === actualTokenIn.address.toLowerCase() ||
            actualIntermediate.address.toLowerCase() === actualTokenOut.address.toLowerCase()) {
            return null;
        }

        if (!amountIn || parseFloat(amountIn) <= 0) return null;

        try {
            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);

            // First leg: tokenIn -> intermediate (try all tick spacings in parallel)
            const firstLegPromises = TICK_SPACINGS.map(tickSpacing =>
                callQuoterV3Single(
                    actualTokenIn.address,
                    actualIntermediate.address,
                    amountInWei,
                    tickSpacing
                )
            );
            const firstLegResults = await Promise.all(firstLegPromises);
            const validFirstLeg = firstLegResults.find(r => r && r.amountOut > BigInt(0));

            if (!validFirstLeg) return null;
            const firstLegOut = validFirstLeg.amountOut;

            // Second leg: intermediate -> tokenOut (try all tick spacings in parallel)
            const secondLegPromises = TICK_SPACINGS.map(tickSpacing =>
                callQuoterV3Single(
                    actualIntermediate.address,
                    actualTokenOut.address,
                    firstLegOut,
                    tickSpacing
                )
            );
            const secondLegResults = await Promise.all(secondLegPromises);
            const validSecondLeg = secondLegResults.find(r => r && r.amountOut > BigInt(0));

            if (validSecondLeg) {
                return {
                    amountOut: formatUnits(validSecondLeg.amountOut, actualTokenOut.decimals),
                    path: [tokenIn.symbol, intermediate.symbol, tokenOut.symbol],
                    routeType: 'multi-hop',
                    via: intermediate.symbol,
                    intermediate: intermediate, // Include the token object for execution
                    gasEstimate: validSecondLeg.gasEstimate,
                };
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    // Find the best route (direct or multi-hop)
    const findBestRoute = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string
    ): Promise<RouteQuote | null> => {
        if (!tokenIn || !tokenOut || !amountIn || parseFloat(amountIn) <= 0) {
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Run ALL routes in parallel for maximum speed
            const [directQuote, ...multiHopQuotes] = await Promise.all([
                // Direct route
                quoteDirectV3(tokenIn, tokenOut, amountIn),
                // Multi-hop routes through intermediates (all in parallel)
                ...INTERMEDIATE_TOKENS.map(intermediate =>
                    quoteMultiHopV3(tokenIn, tokenOut, amountIn, intermediate)
                )
            ]);

            const quotes: RouteQuote[] = [];
            if (directQuote) quotes.push(directQuote);
            multiHopQuotes.forEach(q => { if (q) quotes.push(q); });

            if (quotes.length === 0) {
                setIsLoading(false);
                return null;
            }

            // Find best quote (highest amountOut)
            const best = quotes.reduce((a, b) =>
                parseFloat(a.amountOut) > parseFloat(b.amountOut) ? a : b
            );

            setIsLoading(false);
            return best;
        } catch (err: any) {
            setError(err.message || 'Quote failed');
            setIsLoading(false);
            return null;
        }
    }, [quoteDirectV3, quoteMultiHopV3]);

    // Helper to get intermediate token by symbol
    const getIntermediateToken = useCallback((symbol: string): Token | undefined => {
        return INTERMEDIATE_TOKENS.find(t => t.symbol === symbol);
    }, []);

    return {
        findBestRoute,
        getIntermediateToken,
        INTERMEDIATE_TOKENS,
        isLoading,
        error,
    };
}

// Helper: Call QuoterV2.quoteExactInputSingle for V3
async function callQuoterV3Single(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    tickSpacing: number
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
    try {
        // Encode QuoterV2.quoteExactInputSingle call
        // Function selector: 0x9e7defe6
        const selector = '9e7defe6';
        const tokenInPadded = tokenIn.slice(2).padStart(64, '0');
        const tokenOutPadded = tokenOut.slice(2).padStart(64, '0');
        const amountInHex = amountIn.toString(16).padStart(64, '0');
        const tickHex = tickSpacing >= 0
            ? tickSpacing.toString(16).padStart(64, '0')
            : (BigInt(2) ** BigInt(256) + BigInt(tickSpacing)).toString(16);
        const sqrtPriceLimitHex = '0'.padStart(64, '0');

        const data = `0x${selector}${tokenInPadded}${tokenOutPadded}${amountInHex}${tickHex}${sqrtPriceLimitHex}`;

        console.log(`[Quoter] ${tokenIn.slice(0, 10)}→${tokenOut.slice(0, 10)} ts=${tickSpacing}`);

        const response = await fetch('https://evm-rpc.sei-apis.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{ to: CL_CONTRACTS.QuoterV2, data }, 'latest'],
                id: 1
            })
        });

        const result = await response.json();
        console.log(`[Quoter] Result for ts=${tickSpacing}:`, result.result?.slice(0, 70) || result.error);

        if (result.result && result.result !== '0x' && result.result.length > 2) {
            const hex = result.result.slice(2);
            const amountOut = BigInt('0x' + hex.slice(0, 64));
            console.log(`[Quoter] amountOut=${amountOut.toString()}`);
            const gasEstimate = hex.length >= 256 ? BigInt('0x' + hex.slice(192, 256)) : BigInt(0);
            return { amountOut, gasEstimate };
        }
        return null;
    } catch (err) {
        console.error('[Quoter] Error:', err);
        return null;
    }
}
