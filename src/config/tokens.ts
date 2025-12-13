// Token List for YAKA DEX on Sei

export interface Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
    isNative?: boolean;
}

// Native SEI (represented as zero address in some contexts)
export const SEI: Token = {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'SEI',
    name: 'Sei',
    decimals: 18,
    logoURI: '/tokens/sei.svg',
    isNative: true,
};

// Wrapped SEI
export const WSEI: Token = {
    address: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
    symbol: 'WSEI',
    name: 'Wrapped SEI',
    decimals: 18,
    logoURI: '/tokens/sei.svg',
};

// YAKA Protocol Token
export const YAKA: Token = {
    address: '0xD7b207B7C2c8Fc32F7aB448d73cfb6BE212F0DCf',
    symbol: 'YAKA',
    name: 'YAKA',
    decimals: 18,
    logoURI: '/tokens/yaka.svg',
};

// Common stablecoins and tokens on Sei
export const USDC: Token = {
    address: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: '/tokens/usdc.svg',
};

export const USDT: Token = {
    address: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: '/tokens/usdt.svg',
};

// Default token list
export const DEFAULT_TOKEN_LIST: Token[] = [
    SEI,
    WSEI,
    YAKA,
    USDC,
    USDT,
];

// Token addresses for quick lookup
export const TOKEN_ADDRESSES = {
    SEI: SEI.address,
    WSEI: WSEI.address,
    YAKA: YAKA.address,
    USDC: USDC.address,
    USDT: USDT.address,
} as const;
