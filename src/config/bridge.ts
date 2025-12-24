// Bridge Configuration for cbBTC Hyperlane Warp Route
// Base <-> Sei

export const BRIDGE_CHAINS = {
    base: {
        chainId: 8453,
        name: 'Base',
        rpcUrl: 'https://mainnet.base.org',
        hyperlaneMailbox: '0xeA87ae93Fa0019a82A727bfd3eBd1cFCa8f64f1D',
        warpRoute: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
        cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', // Native cbBTC on Base
        explorer: 'https://basescan.org',
        logoURI: '/logo/base.png',
    },
    sei: {
        chainId: 1329,
        name: 'Sei',
        rpcUrl: 'https://evm-rpc.sei-apis.com',
        hyperlaneMailbox: '0x2f2aFaE1139Ce54feFC03593FeE8AB2aDF4a85A7',
        warpRoute: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
        cbBTC: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12', // Synthetic cbBTC on Sei
        explorer: 'https://seiscan.io',
        logoURI: '/logo/WSEI.png',
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
