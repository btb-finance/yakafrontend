/**
 * Uniswap V3 Concentrated Liquidity Math
 * 
 * Simplified implementation using floating-point math for UI calculations.
 * This avoids the complexity of Q96 fixed-point math for the UI layer
 * while maintaining accuracy for user-facing amounts.
 * 
 * For the actual on-chain operations, the contract handles the precise math.
 */

// Tick bounds from TickMath.sol
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

/**
 * Convert a human-readable price to a tick, aligned to tick spacing
 * 
 * @param price - Human readable price (tokenB per tokenA in UI terms)
 * @param token0Decimals - Decimals of token0 (lower address)
 * @param token1Decimals - Decimals of token1 (higher address)
 * @param tickSpacing - The tick spacing of the pool
 * @param isToken0Base - Whether token0 is the base token in the UI price
 * @returns Tick aligned to tick spacing
 */
export function priceToTick(
    price: number,
    token0Decimals: number,
    token1Decimals: number,
    tickSpacing: number,
    isToken0Base: boolean = true
): number {
    if (price <= 0) return 0;

    // If token0 is base, price is token1/token0 which is what the pool uses
    // If token1 is base, price is token0/token1, so we need to invert
    const poolPrice = isToken0Base ? price : 1 / price;

    // Adjust for decimal difference to get the raw price used in tick calculation
    // Pool price = (amount1 in wei) / (amount0 in wei)
    // raw_price = UI_price * 10^(token1Decimals) / 10^(token0Decimals)
    const adjustedPrice = poolPrice * Math.pow(10, token1Decimals - token0Decimals);

    // Calculate tick: tick = log(price) / log(1.0001)
    const rawTick = Math.log(adjustedPrice) / Math.log(1.0001);

    // Round to nearest tick spacing
    return Math.round(rawTick / tickSpacing) * tickSpacing;
}

/**
 * Convert a tick to a human-readable price
 * 
 * @param tick - The tick value
 * @param token0Decimals - Decimals of token0 (lower address)
 * @param token1Decimals - Decimals of token1 (higher address)
 * @param isToken0Base - Whether token0 is the base token in the UI price
 * @returns Human readable price
 */
export function tickToPrice(
    tick: number,
    token0Decimals: number,
    token1Decimals: number,
    isToken0Base: boolean = true
): number {
    // raw_price = 1.0001^tick
    const rawPrice = Math.pow(1.0001, tick);

    // Convert back to UI price by adjusting for decimals
    const adjustedPrice = rawPrice * Math.pow(10, token0Decimals - token1Decimals);

    // Invert if token1 is base
    return isToken0Base ? adjustedPrice : 1 / adjustedPrice;
}

// ============================================================================
// SIMPLE LIQUIDITY AMOUNT CALCULATIONS FOR UI
// These use floating-point math which is sufficient for UI display
// ============================================================================

export interface RangePosition {
    currentPrice: number;   // Price in UI terms (tokenB per tokenA as displayed)
    priceLower: number;     // Lower price bound in UI terms
    priceUpper: number;     // Upper price bound in UI terms
    token0Decimals: number;
    token1Decimals: number;
    tickSpacing: number;
}

/**
 * Determine which tokens are required for a position given the price range
 * 
 * @param currentPrice - Current pool price
 * @param priceLower - Lower bound of range
 * @param priceUpper - Upper bound of range
 * @returns Object indicating which tokens are needed
 */
export function getRequiredTokens(
    currentPrice: number,
    priceLower: number,
    priceUpper: number
): { needsToken0: boolean; needsToken1: boolean; isSingleSided: boolean } {
    // Ensure lower < upper
    const [lower, upper] = priceLower < priceUpper
        ? [priceLower, priceUpper]
        : [priceUpper, priceLower];

    if (currentPrice <= lower) {
        // Price below range - only token0 needed (waiting for price to rise)
        return { needsToken0: true, needsToken1: false, isSingleSided: true };
    } else if (currentPrice >= upper) {
        // Price above range - only token1 needed (waiting for price to fall)
        return { needsToken0: false, needsToken1: true, isSingleSided: true };
    } else {
        // Price within range - both tokens needed
        return { needsToken0: true, needsToken1: true, isSingleSided: false };
    }
}

/**
 * Calculate the amount of token1 needed given an amount of token0
 * Uses the standard Uniswap V3 math with floating-point for simplicity
 * 
 * Formula: For a position within the range,
 * L = amount0 * sqrt(P) * sqrt(Pb) / (sqrt(Pb) - sqrt(P))
 * amount1 = L * (sqrt(P) - sqrt(Pa))
 * 
 * @param amount0 - Amount of token0 (human readable)
 * @param position - Position details
 * @returns Amount of token1 needed (human readable)
 */
export function calculateAmount1FromAmount0(
    amount0: number,
    position: RangePosition
): number {
    if (amount0 <= 0) return 0;

    const { currentPrice, priceLower, priceUpper } = position;

    // Ensure lower < upper
    const [lower, upper] = priceLower < priceUpper
        ? [priceLower, priceUpper]
        : [priceUpper, priceLower];

    // Check if single-sided
    if (currentPrice <= lower) {
        // Only token0 needed, token1 = 0
        return 0;
    }
    if (currentPrice >= upper) {
        // Only token1 needed, token0 should be 0 so this case shouldn't happen
        return 0;
    }

    // Current price is within range
    const sqrtPriceCurrent = Math.sqrt(currentPrice);
    const sqrtPriceLower = Math.sqrt(lower);
    const sqrtPriceUpper = Math.sqrt(upper);

    // Calculate liquidity from amount0
    // L = amount0 * sqrt(P) * sqrt(Pb) / (sqrt(Pb) - sqrt(P))
    const liquidity = amount0 * (sqrtPriceCurrent * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceCurrent);

    // Calculate amount1 from liquidity
    // amount1 = L * (sqrt(P) - sqrt(Pa))
    const amount1 = liquidity * (sqrtPriceCurrent - sqrtPriceLower);

    return amount1;
}

/**
 * Calculate the amount of token0 needed given an amount of token1
 * 
 * Formula: For a position within the range,
 * L = amount1 / (sqrt(P) - sqrt(Pa))
 * amount0 = L * (sqrt(Pb) - sqrt(P)) / (sqrt(P) * sqrt(Pb))
 * 
 * @param amount1 - Amount of token1 (human readable)
 * @param position - Position details
 * @returns Amount of token0 needed (human readable)
 */
export function calculateAmount0FromAmount1(
    amount1: number,
    position: RangePosition
): number {
    if (amount1 <= 0) return 0;

    const { currentPrice, priceLower, priceUpper } = position;

    // Ensure lower < upper
    const [lower, upper] = priceLower < priceUpper
        ? [priceLower, priceUpper]
        : [priceUpper, priceLower];

    // Check if single-sided
    if (currentPrice >= upper) {
        // Only token1 needed, token0 = 0
        return 0;
    }
    if (currentPrice <= lower) {
        // Only token0 needed, token1 should be 0 so this case shouldn't happen
        return 0;
    }

    // Current price is within range
    const sqrtPriceCurrent = Math.sqrt(currentPrice);
    const sqrtPriceLower = Math.sqrt(lower);
    const sqrtPriceUpper = Math.sqrt(upper);

    // Calculate liquidity from amount1
    // L = amount1 / (sqrt(P) - sqrt(Pa))
    const liquidity = amount1 / (sqrtPriceCurrent - sqrtPriceLower);

    // Calculate amount0 from liquidity
    // amount0 = L * (sqrt(Pb) - sqrt(P)) / (sqrt(P) * sqrt(Pb))
    const amount0 = liquidity * (sqrtPriceUpper - sqrtPriceCurrent) / (sqrtPriceCurrent * sqrtPriceUpper);

    return amount0;
}

export interface PositionAmounts {
    amount0: number;
    amount1: number;
}

/**
 * Calculate the optimal amounts for a position given one input amount
 * This is the main function to use from the UI
 * 
 * @param inputAmount - The amount user entered (human readable)
 * @param inputIsToken0 - Whether the input is token0 or token1
 * @param position - Position details
 * @returns Calculated amounts for both tokens (human readable)
 */
export function calculateOptimalAmounts(
    inputAmount: number,
    inputIsToken0: boolean,
    position: RangePosition
): PositionAmounts {
    const { currentPrice, priceLower, priceUpper } = position;

    const required = getRequiredTokens(currentPrice, priceLower, priceUpper);

    if (inputIsToken0) {
        if (!required.needsToken0) {
            // Token0 not needed for this range (price above range)
            return { amount0: 0, amount1: 0 };
        }

        if (required.isSingleSided && required.needsToken0) {
            // Only token0 needed (price below range)
            return { amount0: inputAmount, amount1: 0 };
        }

        // Both tokens needed - calculate amount1 from amount0
        const amount1 = calculateAmount1FromAmount0(inputAmount, position);
        return { amount0: inputAmount, amount1 };
    } else {
        if (!required.needsToken1) {
            // Token1 not needed for this range (price below range)
            return { amount0: 0, amount1: 0 };
        }

        if (required.isSingleSided && required.needsToken1) {
            // Only token1 needed (price above range)
            return { amount0: 0, amount1: inputAmount };
        }

        // Both tokens needed - calculate amount0 from amount1
        const amount0 = calculateAmount0FromAmount1(inputAmount, position);
        return { amount0, amount1: inputAmount };
    }
}

/**
 * Format a number to a specified number of decimal places
 * Removes trailing zeros
 * 
 * @param value - The number to format
 * @param displayDecimals - Number of decimals to show (default 6)
 * @returns Formatted string
 */
export function formatAmount(value: number, displayDecimals: number = 6): string {
    if (!isFinite(value) || isNaN(value)) return '0';

    // Use toFixed for consistent rounding
    const fixed = value.toFixed(displayDecimals);

    // Remove trailing zeros after decimal point
    const trimmed = fixed.replace(/\.?0+$/, '');

    return trimmed || '0';
}

// ============================================================================
// LEGACY EXPORTS FOR COMPATIBILITY
// These maintain the old interface but use the simpler calculations
// ============================================================================

/**
 * Parse a human-readable amount to wei
 * 
 * @param amount - Human readable amount
 * @param decimals - Token decimals
 * @returns Amount in wei as BigInt
 */
export function parseToWei(amount: string | number, decimals: number): bigint {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    if (!amountStr || amountStr === '') return BigInt(0);

    // Handle scientific notation
    const numValue = parseFloat(amountStr);
    if (!isFinite(numValue) || isNaN(numValue)) return BigInt(0);

    // Convert to fixed notation to avoid issues with very small numbers
    const fixedStr = numValue.toFixed(decimals);

    const [integerPart = '0', fractionalPart = ''] = fixedStr.split('.');
    const paddedFractional = (fractionalPart + '0'.repeat(decimals)).slice(0, decimals);

    // Handle potential negative zero
    const cleanInteger = integerPart === '-0' ? '0' : integerPart;

    try {
        return BigInt(cleanInteger + paddedFractional);
    } catch {
        return BigInt(0);
    }
}

/**
 * Format a BigInt wei value to a human-readable string
 * 
 * @param wei - Amount in wei
 * @param decimals - Token decimals
 * @param displayDecimals - Number of decimals to show (default 6)
 * @returns Formatted string
 */
export function formatFromWei(wei: bigint, decimals: number, displayDecimals: number = 6): string {
    if (wei === BigInt(0)) return '0';

    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = wei / divisor;
    const fractionalPart = wei % divisor;

    // Handle negative numbers
    const isNegative = wei < BigInt(0);
    const absIntegerPart = isNegative ? -integerPart : integerPart;
    const absFractionalPart = isNegative ? -fractionalPart : fractionalPart;

    // Pad fractional part to full decimals
    let fractionalStr = absFractionalPart.toString().padStart(decimals, '0');
    // Trim to displayDecimals
    fractionalStr = fractionalStr.slice(0, displayDecimals);
    // Remove trailing zeros
    fractionalStr = fractionalStr.replace(/0+$/, '');

    const sign = isNegative ? '-' : '';

    if (fractionalStr.length === 0) {
        return sign + absIntegerPart.toString();
    }

    return `${sign}${absIntegerPart}.${fractionalStr}`;
}

// ============================================================================
// ADVANCED TICK MATH (Q96 Fixed Point)
// These are kept for potential future use but UI should use simpler versions
// ============================================================================

// Q96 = 2^96 - the fixed-point scaling factor for sqrtPriceX96
const Q96 = BigInt(2) ** BigInt(96);

// Min/max sqrt ratios from TickMath.sol
export const MIN_SQRT_RATIO = BigInt('4295128739');
export const MAX_SQRT_RATIO = BigInt('1461446703485210103287273052203988822378723970342');

/**
 * Calculates sqrt(1.0001^tick) * 2^96
 * Equivalent to TickMath.getSqrtRatioAtTick()
 * 
 * @param tick - The tick value
 * @returns sqrtPriceX96 as BigInt
 */
export function getSqrtRatioAtTick(tick: number): bigint {
    const absTick = Math.abs(tick);
    if (absTick > MAX_TICK) {
        throw new Error(`Tick ${tick} out of bounds`);
    }

    // Use the same bit manipulation as Solidity for precision
    let ratio = (absTick & 0x1) !== 0
        ? BigInt('0xfffcb933bd6fad37aa2d162d1a594001')
        : BigInt('0x100000000000000000000000000000000');

    if ((absTick & 0x2) !== 0) ratio = (ratio * BigInt('0xfff97272373d413259a46990580e213a')) >> BigInt(128);
    if ((absTick & 0x4) !== 0) ratio = (ratio * BigInt('0xfff2e50f5f656932ef12357cf3c7fdcc')) >> BigInt(128);
    if ((absTick & 0x8) !== 0) ratio = (ratio * BigInt('0xffe5caca7e10e4e61c3624eaa0941cd0')) >> BigInt(128);
    if ((absTick & 0x10) !== 0) ratio = (ratio * BigInt('0xffcb9843d60f6159c9db58835c926644')) >> BigInt(128);
    if ((absTick & 0x20) !== 0) ratio = (ratio * BigInt('0xff973b41fa98c081472e6896dfb254c0')) >> BigInt(128);
    if ((absTick & 0x40) !== 0) ratio = (ratio * BigInt('0xff2ea16466c96a3843ec78b326b52861')) >> BigInt(128);
    if ((absTick & 0x80) !== 0) ratio = (ratio * BigInt('0xfe5dee046a99a2a811c461f1969c3053')) >> BigInt(128);
    if ((absTick & 0x100) !== 0) ratio = (ratio * BigInt('0xfcbe86c7900a88aedcffc83b479aa3a4')) >> BigInt(128);
    if ((absTick & 0x200) !== 0) ratio = (ratio * BigInt('0xf987a7253ac413176f2b074cf7815e54')) >> BigInt(128);
    if ((absTick & 0x400) !== 0) ratio = (ratio * BigInt('0xf3392b0822b70005940c7a398e4b70f3')) >> BigInt(128);
    if ((absTick & 0x800) !== 0) ratio = (ratio * BigInt('0xe7159475a2c29b7443b29c7fa6e889d9')) >> BigInt(128);
    if ((absTick & 0x1000) !== 0) ratio = (ratio * BigInt('0xd097f3bdfd2022b8845ad8f792aa5825')) >> BigInt(128);
    if ((absTick & 0x2000) !== 0) ratio = (ratio * BigInt('0xa9f746462d870fdf8a65dc1f90e061e5')) >> BigInt(128);
    if ((absTick & 0x4000) !== 0) ratio = (ratio * BigInt('0x70d869a156d2a1b890bb3df62baf32f7')) >> BigInt(128);
    if ((absTick & 0x8000) !== 0) ratio = (ratio * BigInt('0x31be135f97d08fd981231505542fcfa6')) >> BigInt(128);
    if ((absTick & 0x10000) !== 0) ratio = (ratio * BigInt('0x9aa508b5b7a84e1c677de54f3e99bc9')) >> BigInt(128);
    if ((absTick & 0x20000) !== 0) ratio = (ratio * BigInt('0x5d6af8dedb81196699c329225ee604')) >> BigInt(128);
    if ((absTick & 0x40000) !== 0) ratio = (ratio * BigInt('0x2216e584f5fa1ea926041bedfe98')) >> BigInt(128);
    if ((absTick & 0x80000) !== 0) ratio = (ratio * BigInt('0x48a170391f7dc42444e8fa2')) >> BigInt(128);

    if (tick > 0) {
        const maxUint256 = (BigInt(1) << BigInt(256)) - BigInt(1);
        ratio = maxUint256 / ratio;
    }

    // Convert from Q128.128 to Q64.96, rounding up
    const remainder = ratio % (BigInt(1) << BigInt(32));
    const sqrtPriceX96 = (ratio >> BigInt(32)) + (remainder === BigInt(0) ? BigInt(0) : BigInt(1));

    return sqrtPriceX96;
}
