// Bridge Configuration for Hyperlane Warp Routes
// Base <-> Sei

export interface BridgeToken {
    symbol: string;
    name: string;
    decimals: number;
    logoURI: string;
    base: {
        collateral: string; // Native token on Base
        warpRoute: string;  // Warp route contract on Base
    };
    sei: {
        synthetic: string;  // Synthetic token on Sei (same as warpRoute)
        warpRoute: string;  // Warp route contract on Sei
    };
}

export const BRIDGE_TOKENS: BridgeToken[] = [
    {
        symbol: 'cbBTC',
        name: 'Coinbase Wrapped BTC',
        decimals: 8,
        logoURI: '/logo/cbbtc.png',
        base: {
            collateral: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
            warpRoute: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
        },
        sei: {
            synthetic: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
            warpRoute: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
        },
    },
    {
        symbol: 'cbADA',
        name: 'Coinbase Wrapped ADA',
        decimals: 6,
        logoURI: '/logo/cbada_32.png',
        base: {
            collateral: '0xcbADA732173e39521CDBE8bf59a6Dc85A9fc7b8c',
            warpRoute: '0x7fFccBA2804Eaa808B0CC6aDd250b17505154114',
        },
        sei: {
            synthetic: '0x8f7EF7758Db151450a3134d406Ad2D80F3D956f6',
            warpRoute: '0x8f7EF7758Db151450a3134d406Ad2D80F3D956f6',
        },
    },
    {
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        logoURI: '/logo/solana_64.png',
        base: {
            collateral: '0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82',
            warpRoute: '0x6EE42B185fD26f673Ca5A10d88AdC4a584e2F008',
        },
        sei: {
            synthetic: '0x1Ab9D96a351c56e408f5478AC664E76AE9B71B93',
            warpRoute: '0x1Ab9D96a351c56e408f5478AC664E76AE9B71B93',
        },
    },
    {
        symbol: 'cbXRP',
        name: 'Coinbase Wrapped XRP',
        decimals: 6,
        logoURI: '/logo/cbxrp_32.png',
        base: {
            collateral: '0xcb585250f852C6c6bf90434AB21A00f02833a4af',
            warpRoute: '0xda78C9FB120cbDcB9B00b39e3eA904466966D243',
        },
        sei: {
            synthetic: '0xBc57Df70D982587F3134317b128e4C88ABE1C7A7',
            warpRoute: '0xBc57Df70D982587F3134317b128e4C88ABE1C7A7',
        },
    },
    {
        symbol: 'uSUI',
        name: 'Sui (Universal)',
        decimals: 18,
        logoURI: '/logo/usui_32.png',
        base: {
            collateral: '0xb0505e5a99abd03d94a1169e638B78EDfEd26ea4',
            warpRoute: '0x94176F99F6E46fE36687dBd072B7aFAf8465bDa6',
        },
        sei: {
            synthetic: '0x78465cffcc7335937d48cCd9A0Ad6bCe2dfDAfD1',
            warpRoute: '0x78465cffcc7335937d48cCd9A0Ad6bCe2dfDAfD1',
        },
    },
    {
        symbol: 'LINK',
        name: 'ChainLink Token',
        decimals: 18,
        logoURI: '/logo/chainlink_ofc_32.svg',
        base: {
            collateral: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
            warpRoute: '0x5a8e5d7CC5C4685c948a88356e4dEF833e495E3D',
        },
        sei: {
            synthetic: '0xB2E37Ecb157d41C114a0656979b4f2aFD9671263',
            warpRoute: '0xB2E37Ecb157d41C114a0656979b4f2aFD9671263',
        },
    },
];

export const BRIDGE_CHAINS = {
    base: {
        chainId: 8453,
        name: 'Base',
        rpcUrl: 'https://mainnet.base.org',
        hyperlaneMailbox: '0xeA87ae93Fa0019a82A727bfd3eBd1cFCa8f64f1D',
        explorer: 'https://basescan.org',
        logoURI: '/logo/base.svg',
        nativeCurrency: 'ETH',
    },
    sei: {
        chainId: 1329,
        name: 'Sei',
        rpcUrl: 'https://evm-rpc.sei-apis.com',
        hyperlaneMailbox: '0x2f2aFaE1139Ce54feFC03593FeE8AB2aDF4a85A7',
        explorer: 'https://seiscan.io',
        logoURI: '/logo/WSEI.png',
        nativeCurrency: 'SEI',
    },
} as const;

export const HYPERLANE_DOMAIN_IDS = {
    base: 8453,
    sei: 1329,
} as const;

// Warp Route ABI (only needed functions)
export const WARP_ROUTE_ABI = [
    {
        name: 'transferRemote',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'destination', type: 'uint32' },
            { name: 'recipient', type: 'bytes32' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: 'messageId', type: 'bytes32' }],
    },
    {
        name: 'quoteGasPayment',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'destination', type: 'uint32' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

// ERC20 ABI for approval
export const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;
