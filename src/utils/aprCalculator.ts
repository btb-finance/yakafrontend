/**
 * APR Calculator for WindSwap Pools
 * 
 * Centralized APR calculation logic with proper Uniswap V3 concentration math.
 * All APR calculations should use this file as the single source of truth.
 */

// Uniswap V3 tick bounds
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const FULL_RANGE_TICKS = MAX_TICK - MIN_TICK; // 1,774,544 ticks

/**
 * Calculate base APR for a pool based on emissions and TVL
 * This is the "full-range equivalent" APR before any concentration multiplier
 * 
 * @param rewardRatePerSecond - WIND reward rate in wei per second
 * @param windPriceUsd - Current WIND price in USD
 * @param tvlUsd - Pool TVL in USD
 * @returns Base APR as a percentage (e.g., 100 = 100%)
 */
export function calculateBaseAPR(
    rewardRatePerSecond: bigint,
    windPriceUsd: number,
    tvlUsd: number
): number {
    if (tvlUsd <= 0 || windPriceUsd <= 0) return 0;

    // Convert reward rate from wei to WIND
    const rewardsPerSecond = Number(rewardRatePerSecond) / 1e18;

    // Annual rewards in WIND (seconds per year = 31,536,000)
    const annualRewardsWind = rewardsPerSecond * 60 * 60 * 24 * 365;

    // Annual rewards in USD
    const annualRewardsUsd = annualRewardsWind * windPriceUsd;

    // APR = (annual rewards / TVL) * 100
    return (annualRewardsUsd / tvlUsd) * 100;
}

/**
 * Calculate concentration multiplier for a given tick spacing
 * 
 * In Uniswap V3, a narrower range = higher concentration = more rewards per $
 * The multiplier represents how much more concentrated a 1-tick-width position is
 * compared to a full-range position.
 * 
 * Formula: multiplier = sqrt(fullRangeTicks / positionTicks)
 * 
 * For display on pools page, we assume a "typical" position width of 1 tick spacing unit.
 * 
 * @param tickSpacing - The pool's tick spacing (1, 50, 100, 200, 2000)
 * @returns Concentration multiplier
 */
export function getConcentrationMultiplier(tickSpacing: number): number {
    if (!tickSpacing || tickSpacing <= 0) return 1;

    // Position width in ticks = tickSpacing (assuming 1-tick-spacing-unit position)
    // Using sqrt for more realistic multiplier that doesn't explode unrealistically
    const rawMultiplier = Math.sqrt(FULL_RANGE_TICKS / tickSpacing);

    // Cap at reasonable bounds (1x - 500x) to prevent display issues
    return Math.max(1, Math.min(rawMultiplier, 500));
}

/**
 * Calculate displayed APR for a CL pool on the pools page
 * Shows the APR for a typical 1-tick-spacing-width position
 * 
 * @param rewardRatePerSecond - WIND reward rate in wei per second
 * @param windPriceUsd - Current WIND price in USD
 * @param tvlUsd - Pool TVL in USD
 * @param tickSpacing - Pool's tick spacing (for CL pools)
 * @returns APR as a percentage, accounting for concentration
 */
export function calculatePoolAPR(
    rewardRatePerSecond: bigint,
    windPriceUsd: number,
    tvlUsd: number,
    tickSpacing?: number
): number {
    const baseAPR = calculateBaseAPR(rewardRatePerSecond, windPriceUsd, tvlUsd);

    // For CL pools, apply concentration multiplier based on tick spacing
    if (tickSpacing && tickSpacing > 0) {
        const multiplier = getConcentrationMultiplier(tickSpacing);
        return baseAPR * multiplier;
    }

    return baseAPR;
}

/**
 * Calculate range-adjusted APR for a specific user position
 * Used in AddLiquidityModal to show estimated APR for user's selected range
 * 
 * @param baseAPR - The pool's base APR (full-range equivalent)
 * @param tickLower - Position's lower tick
 * @param tickUpper - Position's upper tick
 * @param currentTick - Current pool tick
 * @returns Adjusted APR for the position's range
 */
export function calculateRangeAdjustedAPR(
    baseAPR: number,
    tickLower: number,
    tickUpper: number,
    currentTick: number
): number | null {
    if (baseAPR <= 0) return null;
    if (tickLower >= tickUpper) return null;

    const positionWidth = tickUpper - tickLower;
    if (positionWidth <= 0) return null;

    // Only positions in-range earn rewards effectively
    // Out-of-range positions still earn based on their liquidity density
    const isInRange = currentTick >= tickLower && currentTick < tickUpper;

    // Calculate multiplier based on position width vs full range
    const rawMultiplier = Math.sqrt(FULL_RANGE_TICKS / positionWidth);
    const multiplier = Math.max(1, Math.min(rawMultiplier, 1000));

    // Out-of-range positions get half the APR boost (they earn when price returns)
    const effectiveMultiplier = isInRange ? multiplier : multiplier * 0.5;

    return baseAPR * effectiveMultiplier;
}

/**
 * Format APR for display
 * 
 * @param apr - APR as a percentage
 * @returns Formatted string like "123%", "1.2K%", "12.5K%"
 */
export function formatAPR(apr: number): string {
    if (apr <= 0) return '—';
    if (apr >= 10000) return `${(apr / 1000).toFixed(0)}K%`;
    if (apr >= 1000) return `${(apr / 1000).toFixed(1)}K%`;
    if (apr >= 100) return `${apr.toFixed(0)}%`;
    if (apr >= 1) return `${apr.toFixed(1)}%`;
    return `${apr.toFixed(2)}%`;
}
