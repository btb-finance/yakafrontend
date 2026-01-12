// Centralized token lookup utilities
// Provides O(1) lookups and consistent handling of WSEI/SEI edge cases

import { Token, DEFAULT_TOKEN_LIST, SEI, WSEI } from '@/config/tokens';

// Pre-built lookup map for O(1) lookups instead of O(n) array find
const TOKEN_MAP = new Map<string, Token>(
    DEFAULT_TOKEN_LIST.map(t => [t.address.toLowerCase(), t])
);

/**
 * Get token by address with O(1) lookup
 * Handles WSEI/SEI edge cases consistently
 */
export function getTokenByAddress(address: string): Token | null {
    if (!address) return null;
    const lowerAddr = address.toLowerCase();

    // Ensure WSEI and SEI are always found even if excluded from DEFAULT_TOKEN_LIST
    if (lowerAddr === WSEI.address.toLowerCase()) return WSEI;
    if (lowerAddr === SEI.address.toLowerCase()) return SEI;

    return TOKEN_MAP.get(lowerAddr) || null;
}

/**
 * Get token symbol for display, with fallback to truncated address
 */
export function getTokenSymbol(address: string): string {
    const token = getTokenByAddress(address);
    if (token) return token.symbol;
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown';
}

/**
 * Get token logo URI, with fallback
 */
export function getTokenLogo(address: string): string | undefined {
    return getTokenByAddress(address)?.logoURI;
}

/**
 * Get token decimals, default to 18 if unknown
 */
export function getTokenDecimals(address: string): number {
    return getTokenByAddress(address)?.decimals ?? 18;
}

/**
 * Check if address is a known token
 */
export function isKnownToken(address: string): boolean {
    return getTokenByAddress(address) !== null;
}

/**
 * Get display info for a token - combines common lookups
 */
export function getTokenDisplayInfo(address: string): {
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
    isNative: boolean;
} {
    const token = getTokenByAddress(address);
    if (token) {
        return {
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoURI: token.logoURI,
            isNative: token.isNative || false,
        };
    }
    return {
        symbol: address ? `${address.slice(0, 6)}...` : 'Unknown',
        name: 'Unknown Token',
        decimals: 18,
        logoURI: undefined,
        isNative: false,
    };
}
