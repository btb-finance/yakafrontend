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

// New Tokens
export const WBTC: Token = {
    address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    decimals: 8,
    logoURI: '/logo/wbtc.jpg',
};

// Coinbase Wrapped BTC (Hyperlane bridged from Base)
export const cbBTC: Token = {
    address: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    decimals: 8,
    logoURI: '/logo/cbbtc.png',
};

// Coinbase Wrapped ADA (Hyperlane bridged from Base)
export const cbADA: Token = {
    address: '0x8f7EF7758Db151450a3134d406Ad2D80F3D956f6',
    symbol: 'cbADA',
    name: 'Coinbase Wrapped ADA',
    decimals: 6,
    logoURI: '/logo/cbada_32.png',
};

// Solana (Hyperlane bridged from Base)
export const SOL: Token = {
    address: '0x1Ab9D96a351c56e408f5478AC664E76AE9B71B93',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: '/logo/solana_64.png',
};

// Coinbase Wrapped XRP (Hyperlane bridged from Base)
export const cbXRP: Token = {
    address: '0xBc57Df70D982587F3134317b128e4C88ABE1C7A7',
    symbol: 'cbXRP',
    name: 'Coinbase Wrapped XRP',
    decimals: 6,
    logoURI: '/logo/cbxrp_32.png',
};

// Sui Universal (Hyperlane bridged from Base)
export const uSUI: Token = {
    address: '0x78465cffcc7335937d48cCd9A0Ad6bCe2dfDAfD1',
    symbol: 'uSUI',
    name: 'Sui (Universal)',
    decimals: 18,
    logoURI: '/logo/usui_32.png',
};

// ChainLink Token (Hyperlane bridged from Base)
export const LINK: Token = {
    address: '0xB2E37Ecb157d41C114a0656979b4f2aFD9671263',
    symbol: 'LINK',
    name: 'ChainLink Token',
    decimals: 18,
    logoURI: '/logo/chainlink_ofc_32.svg',
};

export const USDT0: Token = {
    address: '0x9151434b16b9763660705744891fA906F660EcC5',
    symbol: 'USDT0',
    name: 'USDT0 (Stargate)',
    decimals: 6,
    logoURI: '/logo/usdt0.png',
};

export const WILSON: Token = {
    address: '0x962aae191622498bca205c1c1b73e59ac7d295f2',
    symbol: 'WILSON',
    name: 'Wilson',
    decimals: 6,
    logoURI: '/logo/wilson.png',
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
    WBTC,
    WETH,
    cbBTC,
    cbADA,
    SOL,
    cbXRP,
    uSUI,
    LINK,
    USDT0,
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
    WILSON,
];

// Token addresses for quick lookup
export const TOKEN_ADDRESSES = {
    SEI: SEI.address,
    WSEI: WSEI.address,
    WIND: WIND.address,
    YAKA: WIND.address, // Legacy alias
    USDC: USDC.address,
    WBTC: WBTC.address,
    WETH: WETH.address,
    cbBTC: cbBTC.address,
    cbADA: cbADA.address,
    SOL: SOL.address,
    cbXRP: cbXRP.address,
    uSUI: uSUI.address,
    LINK: LINK.address,
    USDT0: USDT0.address,
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
    WILSON: WILSON.address,
} as const;

