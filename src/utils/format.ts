// Centralized formatting utilities
// Provides consistent number and currency formatting across the application

/**
 * Format USD values with appropriate suffixes (K, M, B)
 * @param value - The numeric value to format
 * @param options - Formatting options
 */
export function formatUSD(
    value: number | string,
    options: {
        showZeroAs?: string;
        showSmallAs?: string;
        prefix?: string;
    } = {}
): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    const prefix = options.prefix ?? '$';

    if (isNaN(num) || num === 0) return options.showZeroAs ?? `${prefix}0`;

    if (num >= 1_000_000_000) return `${prefix}${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${prefix}${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${prefix}${(num / 1_000).toFixed(2)}K`;
    if (num >= 1) return `${prefix}${num.toFixed(2)}`;
    if (num > 0) return options.showSmallAs ?? `${prefix}${num.toFixed(4)}`;

    return `${prefix}0`;
}

/**
 * Format TVL with special handling for pools
 * @param tvl - TVL value as string or number
 * @param poolType - Optional pool type for context-specific fallback
 */
export function formatTVL(tvl: string | number, poolType?: 'CL' | 'V2'): string {
    const num = typeof tvl === 'string' ? parseFloat(tvl) : tvl;

    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    if (num >= 1) return `$${num.toFixed(2)}`;
    if (num > 0) return `$${num.toFixed(4)}`;
    if (poolType === 'CL') return 'New Pool';
    return 'Low';
}

/**
 * Format token amounts with appropriate precision
 * @param amount - The amount to format
 * @param decimals - Optional decimal places (default auto)
 */
export function formatAmount(amount: number | string, decimals?: number): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(num) || num === 0) return '0';

    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    if (num >= 1) return decimals !== undefined ? num.toFixed(decimals) : num.toFixed(2);
    if (num >= 0.0001) return num.toFixed(4);
    return num.toExponential(2);
}

/**
 * Format price with appropriate precision based on magnitude
 * @param price - The price to format
 */
export function formatPrice(price: number): string {
    if (price === 0) return '0';
    if (price < 0.0001) return price.toExponential(2);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(3);
    if (price < 10_000) return price.toFixed(2);
    return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Format large numbers with locale-aware separators
 * @param value - The value to format
 * @param maxDecimals - Maximum decimal places (default 0)
 */
export function formatNumber(value: number | string, maxDecimals: number = 0): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

/**
 * Format percentage values
 * @param value - The percentage value (0.5 = 0.5%, not 50%)
 * @param decimals - Decimal places (default 2)
 */
export function formatPercent(value: number, decimals: number = 2): string {
    if (isNaN(value)) return '0%';
    return `${value.toFixed(decimals)}%`;
}

/**
 * Format balance with smart precision
 * Shows more decimals for small amounts, less for large
 */
export function formatBalance(balance: number): string {
    if (balance === 0) return '0';
    if (balance >= 1000) return balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (balance >= 1) return balance.toFixed(4);
    if (balance >= 0.0001) return balance.toFixed(6);
    return balance.toExponential(2);
}

/**
 * Shorten address for display
 * @param address - The full address
 * @param chars - Characters to show at start/end (default 4)
 */
export function shortenAddress(address: string, chars: number = 4): string {
    if (!address) return '';
    if (address.length <= chars * 2 + 2) return address;
    return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
