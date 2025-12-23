'use client';

import { useState, useCallback } from 'react';
import { parseUnits, formatUnits } from 'viem';
import { Token, WSEI, USDC } from '@/config/tokens';
import { CL_CONTRACTS } from '@/config/contracts';
import { getPrimaryRpc } from '@/utils/rpc';

// Common intermediate tokens for routing
const INTERMEDIATE_TOKENS = [WSEI, USDC];

// CL tick spacings from CLFactory contract
const TICK_SPACINGS = [1, 50, 100, 200, 2000] as const;

interface RouteQuote {
    amountOut: string;
    path: string[];
    routeType: 'direct' | 'multi-hop';
    via?: string;
    intermediate?: Token;
    gasEstimate?: bigint;
    tickSpacing1?: number;
    tickSpacing2?: number;
}

interface BatchQuoteRequest {
    path: `0x${string}`;
    amountIn: bigint;
    outputDecimals: number;
    routeType: 'direct' | 'multi-hop';
    tokenIn: Token;
    tokenOut: Token;
    intermediate?: Token;
    tickSpacing1: number;
    tickSpacing2?: number;
}

export function useMixedRouteQuoter() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Encode path for V3: token + tickSpacing (3 bytes) + token
    const encodePath = (tokens: string[], tickSpacings: number[]): `0x${string}` => {
        let path = tokens[0].slice(2).toLowerCase();
        for (let i = 0; i < tickSpacings.length; i++) {
            const ts = tickSpacings[i];
            const tsHex = ts >= 0
                ? ts.toString(16).padStart(6, '0')
                : ((1 << 24) + ts).toString(16);
            path += tsHex + tokens[i + 1].slice(2).toLowerCase();
        }
        return `0x${path}` as `0x${string}`;
    };

    // Encode quoteExactInput call data
    const encodeQuoteData = (path: `0x${string}`, amountIn: bigint): string => {
        const selector = 'cdca1753'; // quoteExactInput(bytes,uint256)
        const pathHex = path.slice(2);
        const pathOffset = '0000000000000000000000000000000000000000000000000000000000000040';
        const amountInHex = amountIn.toString(16).padStart(64, '0');
        const pathLength = (pathHex.length / 2).toString(16).padStart(64, '0');
        const pathPadded = pathHex.padEnd(Math.ceil(pathHex.length / 64) * 64, '0');
        return `0x${selector}${pathOffset}${amountInHex}${pathLength}${pathPadded}`;
    };

    // BATCH all quotes in a SINGLE HTTP request!
    const batchQuote = useCallback(async (requests: BatchQuoteRequest[]): Promise<(RouteQuote | null)[]> => {
        if (requests.length === 0) return [];

        // Build batch JSON-RPC request
        const batchBody = requests.map((req, i) => ({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: CL_CONTRACTS.MixedRouteQuoterV1, data: encodeQuoteData(req.path, req.amountIn) }, 'latest'],
            id: i + 1
        }));

        try {
            const response = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchBody)
            });

            const results = await response.json();

            // Parse results - they come back as array in same order
            return requests.map((req, i) => {
                const result = Array.isArray(results)
                    ? results.find((r: any) => r.id === i + 1)
                    : results;

                if (!result?.result || result.result === '0x' || result.result.length < 66) {
                    return null;
                }

                try {
                    const hex = result.result.slice(2);
                    const amountOut = BigInt('0x' + hex.slice(0, 64));

                    if (amountOut <= BigInt(0)) return null;

                    return {
                        amountOut: formatUnits(amountOut, req.outputDecimals),
                        path: req.routeType === 'direct'
                            ? [req.tokenIn.symbol, req.tokenOut.symbol]
                            : [req.tokenIn.symbol, req.intermediate!.symbol, req.tokenOut.symbol],
                        routeType: req.routeType,
                        via: req.intermediate?.symbol,
                        intermediate: req.intermediate,
                        tickSpacing1: req.tickSpacing1,
                        tickSpacing2: req.tickSpacing2,
                    };
                } catch {
                    return null;
                }
            });
        } catch {
            return requests.map(() => null);
        }
    }, []);

    // Find the best route - ALL quotes in ONE HTTP request!
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
            const actualTokenIn = tokenIn.isNative ? WSEI : tokenIn;
            const actualTokenOut = tokenOut.isNative ? WSEI : tokenOut;
            const amountInWei = parseUnits(amountIn, actualTokenIn.decimals);

            // Build ALL quote requests
            const requests: BatchQuoteRequest[] = [];

            // Direct routes (2 tick spacings)
            for (const ts of TICK_SPACINGS) {
                requests.push({
                    path: encodePath([actualTokenIn.address, actualTokenOut.address], [ts]),
                    amountIn: amountInWei,
                    outputDecimals: actualTokenOut.decimals,
                    routeType: 'direct',
                    tokenIn,
                    tokenOut,
                    tickSpacing1: ts,
                });
            }

            // Multi-hop routes (2 intermediates × 2×2 tick spacing combos = 8)
            for (const intermediate of INTERMEDIATE_TOKENS) {
                const actualIntermediate = intermediate.isNative ? WSEI : intermediate;

                // Skip if intermediate same as input/output
                if (actualIntermediate.address.toLowerCase() === actualTokenIn.address.toLowerCase() ||
                    actualIntermediate.address.toLowerCase() === actualTokenOut.address.toLowerCase()) {
                    continue;
                }

                for (const ts1 of TICK_SPACINGS) {
                    for (const ts2 of TICK_SPACINGS) {
                        requests.push({
                            path: encodePath(
                                [actualTokenIn.address, actualIntermediate.address, actualTokenOut.address],
                                [ts1, ts2]
                            ),
                            amountIn: amountInWei,
                            outputDecimals: actualTokenOut.decimals,
                            routeType: 'multi-hop',
                            tokenIn,
                            tokenOut,
                            intermediate,
                            tickSpacing1: ts1,
                            tickSpacing2: ts2,
                        });
                    }
                }
            }

            // Execute ALL quotes in ONE HTTP request!
            const results = await batchQuote(requests);

            // Find best result
            const validQuotes = results.filter((r): r is RouteQuote => r !== null);

            if (validQuotes.length === 0) {
                setIsLoading(false);
                return null;
            }

            const best = validQuotes.reduce((a, b) =>
                parseFloat(a.amountOut) > parseFloat(b.amountOut) ? a : b
            );

            setIsLoading(false);
            return best;
        } catch (err: any) {
            setError(err.message || 'Quote failed');
            setIsLoading(false);
            return null;
        }
    }, [batchQuote]);

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
