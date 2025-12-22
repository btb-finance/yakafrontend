// Token List for Wind Swap DEX on Sei

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
    logoURI: '/logo/WSEI.png',
    isNative: true,
};

// Wrapped SEI
export const WSEI: Token = {
    address: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
    symbol: 'WSEI',
    name: 'Wrapped SEI',
    decimals: 18,
    logoURI: '/logo/WSEI.png',
};

// WIND Protocol Token
export const WIND: Token = {
    address: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
    symbol: 'WIND',
    name: 'Wind Swap',
    decimals: 18,
    logoURI: '/logo.png',
};

// Legacy alias for backwards compatibility
export const YAKA = WIND;

// Common stablecoins and tokens on Sei
export const USDC: Token = {
    address: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: '/logo/USDCoin.svg',
};

export const USDT: Token = {
    address: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: '/logo/usdt0.png',
};

// New Tokens
export const WBTC: Token = {
    address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    decimals: 8,
    logoURI: '/logo/wbtc.jpg',
};

export const USDCT: Token = {
    address: '0x9151434b16b9763660705744891fA906F660EcC5',
    symbol: 'USDT',
    name: 'Tether USD (Bridged)',
    decimals: 6,
    logoURI: '/logo/usdt0.png',
};

export const USDCN: Token = {
    address: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
    symbol: 'USDC.n',
    name: 'USD Coin (Noble)',
    decimals: 6,
    logoURI: '/logo/USDCoin.svg',
};

export const DRG: Token = {
    address: '0x0a526e425809aEA71eb279d24ae22Dee6C92A4Fe',
    symbol: 'DRG',
    name: 'Dragonswap',
    decimals: 18,
    logoURI: '/logo/DRG.png',
};

export const MILLI: Token = {
    address: '0x95597eb8d227a7c4b4f5e807a815c5178ee6dbe1',
    symbol: 'MILLI',
    name: 'MILLI',
    decimals: 6,
    logoURI: '/logo/MILLI.png',
};

export const GGC: Token = {
    address: '0x58e11d8ed38a2061361e90916540c5c32281a380',
    symbol: 'GGC',
    name: 'GGC',
    decimals: 18,
};

export const POPO: Token = {
    address: '0xc18b6a15fb0ceaf5eb18696eefcb5bc7b9107149',
    symbol: 'POPO',
    name: 'POPO',
    decimals: 18,
};

export const FROG: Token = {
    address: '0xf9bdbf259ece5ae17e29bf92eb7abd7b8b465db9',
    symbol: 'Frog',
    name: 'Frog',
    decimals: 18,
    logoURI: '/logo/FROG.png',
};

export const SEIYAN: Token = {
    address: '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598',
    symbol: 'SEIYAN',
    name: 'SEIYAN',
    decimals: 6,
    logoURI: '/logo/seiyan.jpg',
};

export const S8N: Token = {
    address: '0xdf3d7dd2848f491645974215474c566e79f2e538',
    symbol: 'S8N',
    name: 'S8N',
    decimals: 18,
};

export const SUPERSEIZ: Token = {
    address: '0xf63980e3818607c0797e994cfd34c1c592968469',
    symbol: 'SUPERSEIZ',
    name: 'SUPERSEIZ',
    decimals: 18,
};

export const BAT: Token = {
    address: '0x443ac9f358226f5f48f2cd10bc0121e7a6176323',
    symbol: 'BAT',
    name: 'BAT',
    decimals: 18,
};

export const YKP: Token = {
    address: '0x888888B7aE1b196E4DfD25c992c9ad13358F0e24',
    symbol: 'YKP',
    name: 'YAKAPIE',
    decimals: 18,
};

export const LARRY: Token = {
    address: '0x888d81e3ea5E8362B5f69188CBCF34Fa8da4b888',
    symbol: 'LARRY',
    name: 'LARRY',
    decimals: 18,
};

export const WETH: Token = {
    address: '0x160345fc359604fc6e70e3c5facbde5f7a9342d8',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: '/logo/WrappedEther(Wormhole).png',
};

// Default token list
export const DEFAULT_TOKEN_LIST: Token[] = [
    SEI,
    WSEI,
    WIND,
    USDC,
    USDT,
    WBTC,
    WETH,
    USDCT,
    USDCN,
    DRG,
    MILLI,
    GGC,
    POPO,
    FROG,
    SEIYAN,
    S8N,
    SUPERSEIZ,
    BAT,
    YKP,
    LARRY,
];

// Token addresses for quick lookup
export const TOKEN_ADDRESSES = {
    SEI: SEI.address,
    WSEI: WSEI.address,
    WIND: WIND.address,
    YAKA: WIND.address, // Legacy alias
    USDC: USDC.address,
    USDT: USDT.address,
    WBTC: WBTC.address,
    WETH: WETH.address,
    USDCT: USDCT.address,
    USDCN: USDCN.address,
    DRG: DRG.address,
    MILLI: MILLI.address,
    GGC: GGC.address,
    POPO: POPO.address,
    FROG: FROG.address,
    SEIYAN: SEIYAN.address,
    S8N: S8N.address,
    SUPERSEIZ: SUPERSEIZ.address,
    BAT: BAT.address,
    YKP: YKP.address,
    LARRY: LARRY.address,
} as const;

