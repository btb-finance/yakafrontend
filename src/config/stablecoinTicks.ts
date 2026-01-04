// Stablecoin tick configuration for concentrated liquidity pools
// This file defines default tick ranges for stablecoin pairs to optimize liquidity provision

/**
 * For stablecoins that should trade 1:1 (like USDC/USDT, USDC/USDC.n):
 * - Tick 0 = price ratio of 1.0000 (exactly 1:1)
 * - Each tick represents ~0.01% price movement
 * - Tick spacing of 50 = 0.5% per tick step
 * 
 * Current on-chain data:
 * - USDC/USDT0 pool (0x3C2567b15FD9133Cf9101E043C58e2B444aF900b): tick = -5, spacing = 50
 * - USDC/USDC.n pool (0x0aeb4016e61987c48F63e9e03Df79f0f0b54eb5c): tick = 0, spacing = 50
 */

// Stablecoin token addresses (6 decimal stablecoins)
export const STABLECOIN_ADDRESSES = [
    '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392', // USDC
    '0x9151434b16b9763660705744891fA906F660EcC5', // USDT0
    '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1', // USDC.n (Noble)
] as const;

export const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'USDT0', 'USDC.n', 'DAI', 'FRAX', 'LUSD', 'USDS'] as const;

// Check if a token is a stablecoin
export function isStablecoin(addressOrSymbol: string): boolean {
    const lower = addressOrSymbol.toLowerCase();
    return (
        STABLECOIN_ADDRESSES.some(addr => addr.toLowerCase() === lower) ||
        STABLECOIN_SYMBOLS.some(sym => sym.toLowerCase() === lower)
    );
}

// Check if pair is stablecoin-stablecoin
export function isStablecoinPair(token0: string, token1: string): boolean {
    return isStablecoin(token0) && isStablecoin(token1);
}

/**
 * Default tick ranges for stablecoin pairs
 * Using very tight ranges because stablecoins should maintain 1:1 peg
 */
export const STABLECOIN_TICK_CONFIG = {
    // Central tick for 1:1 price ratio
    CENTER_TICK: 0,

    // Default tick spacing for stablecoin pools (matches on-chain config)
    TICK_SPACING: 50,

    // Default price range for stablecoins (tight since they should be 1:1)
    // ±0.2% from center = 0.998 to 1.002 (stays in range better)
    DEFAULT_LOWER_TICK: -200, // ~0.998 price
    DEFAULT_UPPER_TICK: 200,  // ~1.002 price

    // Tight range for providing liquidity (±0.05%)
    TIGHT_LOWER_TICK: -50,  // ~0.995 price
    TIGHT_UPPER_TICK: 50,   // ~1.005 price

    // Wide range (for less active management)
    WIDE_LOWER_TICK: -500,  // ~0.95 price
    WIDE_UPPER_TICK: 500,   // ~1.05 price
} as const;

/**
 * Price range presets for stablecoin liquidity
 */
export const STABLECOIN_RANGE_PRESETS = {
    // Ultra-tight: for maximum capital efficiency on pegged pairs
    ultra_tight: {
        label: 'Ultra Tight (±0.05%)',
        tickLower: -50,
        tickUpper: 50,
        description: 'Maximum efficiency, requires frequent rebalancing',
    },
    // Tight: good balance of efficiency and stability
    tight: {
        label: 'Tight (±0.1%)',
        tickLower: -100,
        tickUpper: 100,
        description: 'High efficiency with less maintenance',
    },
    // Medium: safer option for stablecoins
    medium: {
        label: 'Medium (±0.5%)',
        tickLower: -500,
        tickUpper: 500,
        description: 'Safe range for most stablecoin pairs',
    },
    // Wide: handles larger depegging events
    wide: {
        label: 'Wide (±1%)',
        tickLower: -1000,
        tickUpper: 1000,
        description: 'Handles moderate depeg events',
    },
} as const;

/**
 * Get default tick range for a stablecoin pair
 * @param tickSpacing The pool's tick spacing
 * @returns Object with tickLower and tickUpper aligned to tick spacing
 */
export function getStablecoinDefaultTicks(tickSpacing: number = 50): { tickLower: number; tickUpper: number } {
    // Use tight range by default
    const config = STABLECOIN_RANGE_PRESETS.tight;

    // Align to tick spacing
    const tickLower = Math.floor(config.tickLower / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil(config.tickUpper / tickSpacing) * tickSpacing;

    return { tickLower, tickUpper };
}

/**
 * Get price range preset for stablecoin pair
 */
export function getStablecoinPreset(preset: keyof typeof STABLECOIN_RANGE_PRESETS, tickSpacing: number = 50) {
    const config = STABLECOIN_RANGE_PRESETS[preset];

    // Align to tick spacing
    const tickLower = Math.floor(config.tickLower / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil(config.tickUpper / tickSpacing) * tickSpacing;

    return {
        ...config,
        tickLower,
        tickUpper,
    };
}

/**
 * Convert tick to price for stablecoins (assumes same decimals)
 * Formula: price = 1.0001^tick
 */
export function tickToStablecoinPrice(tick: number): number {
    return Math.pow(1.0001, tick);
}

/**
 * Convert price to tick for stablecoins
 * Formula: tick = log(price) / log(1.0001)
 */
export function stablecoinPriceToTick(price: number): number {
    return Math.round(Math.log(price) / Math.log(1.0001));
}
