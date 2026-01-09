'use client';

import { useState, useEffect } from 'react';
import { getPrimaryRpc } from '@/utils/rpc';

// Pool addresses for price discovery
const WIND_USDC_POOL = '0x576fc1F102c6Bb3F0A2bc87fF01fB652b883dFe0'; // WIND/USDC
const USDC_WSEI_POOL = '0x587b82b8ed109D8587a58f9476a8d4268Ae945B1'; // USDC/WSEI

/**
 * Helper to decode tick from slot0 response
 */
function decodeTickFromSlot0(result: string): number | null {
    if (!result || result === '0x' || result.length < 130) return null;

    const tickSlot = result.slice(66, 130);
    const lastSix = tickSlot.slice(-6);
    let tick = parseInt(lastSix, 16);

    // Handle negative tick (signed int24)
    if (tick > 0x7fffff) {
        tick = tick - 0x1000000;
    }

    return tick;
}

/**
 * Hook to get WIND and SEI prices in USD from DEX pools
 */
export function useWindPrice() {
    const [windPrice, setWindPrice] = useState<number>(0.005); // Default fallback
    const [seiPrice, setSeiPrice] = useState<number>(0.35); // Default fallback
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchPrices = async () => {
            try {
                // Batch fetch both pools' slot0
                const response = await fetch(getPrimaryRpc(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([
                        { jsonrpc: '2.0', method: 'eth_call', params: [{ to: WIND_USDC_POOL, data: '0x3850c7bd' }, 'latest'], id: 1 },
                        { jsonrpc: '2.0', method: 'eth_call', params: [{ to: USDC_WSEI_POOL, data: '0x3850c7bd' }, 'latest'], id: 2 },
                    ]),
                });

                const results = await response.json();

                // Parse WIND price from WIND/USDC pool
                // WIND is token0 (18 decimals), USDC is token1 (6 decimals)
                if (results[0]?.result) {
                    const tick = decodeTickFromSlot0(results[0].result);
                    if (tick !== null) {
                        // price = 1.0001^tick * 10^(18-6) = 1.0001^tick * 10^12
                        const rawPrice = Math.pow(1.0001, tick);
                        const price = rawPrice * Math.pow(10, 12);
                        if (price > 0 && price < 1000) {
                            setWindPrice(price);
                        }
                    }
                }

                // Parse SEI price from USDC/WSEI pool
                // USDC is token0 (6 decimals), WSEI is token1 (18 decimals)
                if (results[1]?.result) {
                    const tick = decodeTickFromSlot0(results[1].result);
                    if (tick !== null) {
                        // raw price = 1.0001^tick = WSEI per USDC (raw units)
                        const rawPrice = Math.pow(1.0001, tick);
                        // Adjust for decimals: WSEI per USDC = rawPrice * 10^(6-18)
                        const wseiPerUsdc = rawPrice * Math.pow(10, -12);
                        // SEI price in USD = 1 / wseiPerUsdc
                        const price = 1 / wseiPerUsdc;
                        if (price > 0 && price < 100) {
                            setSeiPrice(price);
                        }
                    }
                }
            } catch (err) {
                console.error('[useWindPrice] Error fetching prices:', err);
            }
            setIsLoading(false);
        };

        fetchPrices();

        // Refresh prices every 60 seconds
        const interval = setInterval(fetchPrices, 60000);
        return () => clearInterval(interval);
    }, []);

    return { windPrice, seiPrice, isLoading };
}

// APR calculation functions have been moved to src/utils/aprCalculator.ts
// Use the centralized calculator for all APR calculations:
// - calculatePoolAPR(rewardRate, windPrice, tvl, tickSpacing?)
// - calculateBaseAPR(rewardRate, windPrice, tvl)
// - calculateRangeAdjustedAPR(baseAPR, tickLower, tickUpper, currentTick)
// - formatAPR(apr)

