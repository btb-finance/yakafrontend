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

/**
 * Calculate APR for a pool based on emissions and TVL
 */
export function calculatePoolAPR(
    rewardRatePerSecond: bigint,
    windPriceUsd: number,
    tvlUsd: number
): number {
    if (tvlUsd <= 0) return 0;

    // Convert reward rate from wei to WIND
    const rewardsPerSecond = Number(rewardRatePerSecond) / 1e18;

    // Annual rewards in WIND
    const annualRewardsWind = rewardsPerSecond * 60 * 60 * 24 * 365;

    // Annual rewards in USD
    const annualRewardsUsd = annualRewardsWind * windPriceUsd;

    // APR = (annual rewards / TVL) * 100
    const apr = (annualRewardsUsd / tvlUsd) * 100;

    return apr;
}

/**
 * Calculate range-adjusted APR for CL positions
 * Narrower ranges earn proportionally more rewards per dollar
 * 
 * The "capital efficiency multiplier" is based on how concentrated the liquidity is.
 * For a full-range position: multiplier ≈ 1x
 * For a ±10% range: multiplier ≈ 5x
 * For a ±2% range: multiplier ≈ 25x
 * 
 * Formula: multiplier = sqrt(fullRangeWidth / userRangeWidth)
 * where fullRangeWidth spans the valid tick range
 * 
 * @param baseAPR - The pool's base APR (full-range equivalent)
 * @param priceLower - User's lower price bound
 * @param priceUpper - User's upper price bound  
 * @param currentPrice - Current pool price
 * @returns Adjusted APR (higher for tighter ranges), or null if range is invalid
 */
export function calculateRangeAdjustedAPR(
    baseAPR: number,
    priceLower: number,
    priceUpper: number,
    currentPrice: number
): number | null {
    if (baseAPR <= 0 || priceLower <= 0 || priceUpper <= 0 || currentPrice <= 0) {
        return null;
    }
    if (priceLower >= priceUpper) {
        return null;
    }

    // Check if current price is within range (position is in-range)
    const isInRange = currentPrice >= priceLower && currentPrice <= priceUpper;
    if (!isInRange) {
        // Out-of-range positions don't earn trading fees but still earn WIND rewards
        // They earn based on liquidity density at the range, similar calculation
    }

    // Calculate the range width as a ratio of current price
    const rangeWidth = (priceUpper - priceLower) / currentPrice;

    // A "full range" in realistic terms is about 100x in each direction
    // But for practical APR boost calculation, we use a reference width
    // Reference: ±100% range (0.5x to 2x current) = width of 1.5
    const referenceWidth = 1.5;

    // Capital efficiency multiplier - how much more concentrated vs reference
    // Using sqrt to dampen extreme multipliers
    const rawMultiplier = referenceWidth / rangeWidth;

    // Cap the multiplier at reasonable bounds (1x - 100x)
    const multiplier = Math.max(1, Math.min(rawMultiplier, 100));

    return baseAPR * multiplier;
}
