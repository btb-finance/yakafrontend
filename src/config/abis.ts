// Minimal ABIs for WindSwap contracts
// These contain only the functions needed for the frontend

export const ERC20_ABI = [
    {
        inputs: [{ name: 'owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'symbol',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'name',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// V2 Router ABI
export const ROUTER_ABI = [
    // Read functions
    {
        inputs: [],
        name: 'defaultFactory',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'weth',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            {
                components: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'stable', type: 'bool' },
                    { name: 'factory', type: 'address' },
                ],
                name: 'routes',
                type: 'tuple[]',
            },
        ],
        name: 'getAmountsOut',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'stable', type: 'bool' },
            { name: '_factory', type: 'address' },
        ],
        name: 'getReserves',
        outputs: [
            { name: 'reserveA', type: 'uint256' },
            { name: 'reserveB', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    // Swap functions
    {
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMin', type: 'uint256' },
            {
                components: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'stable', type: 'bool' },
                    { name: 'factory', type: 'address' },
                ],
                name: 'routes',
                type: 'tuple[]',
            },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'swapExactTokensForTokens',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'amountOutMin', type: 'uint256' },
            {
                components: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'stable', type: 'bool' },
                    { name: 'factory', type: 'address' },
                ],
                name: 'routes',
                type: 'tuple[]',
            },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'swapExactETHForTokens',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMin', type: 'uint256' },
            {
                components: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'stable', type: 'bool' },
                    { name: 'factory', type: 'address' },
                ],
                name: 'routes',
                type: 'tuple[]',
            },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'swapExactTokensForETH',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Add Liquidity
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'stable', type: 'bool' },
            { name: 'amountADesired', type: 'uint256' },
            { name: 'amountBDesired', type: 'uint256' },
            { name: 'amountAMin', type: 'uint256' },
            { name: 'amountBMin', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'addLiquidity',
        outputs: [
            { name: 'amountA', type: 'uint256' },
            { name: 'amountB', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'stable', type: 'bool' },
            { name: 'amountTokenDesired', type: 'uint256' },
            { name: 'amountTokenMin', type: 'uint256' },
            { name: 'amountETHMin', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'addLiquidityETH',
        outputs: [
            { name: 'amountToken', type: 'uint256' },
            { name: 'amountETH', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
        ],
        stateMutability: 'payable',
        type: 'function',
    },
    // Remove Liquidity
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'stable', type: 'bool' },
            { name: 'liquidity', type: 'uint256' },
            { name: 'amountAMin', type: 'uint256' },
            { name: 'amountBMin', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        name: 'removeLiquidity',
        outputs: [
            { name: 'amountA', type: 'uint256' },
            { name: 'amountB', type: 'uint256' },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'stable', type: 'bool' },
            { name: '_factory', type: 'address' },
            { name: 'amountADesired', type: 'uint256' },
            { name: 'amountBDesired', type: 'uint256' },
        ],
        name: 'quoteAddLiquidity',
        outputs: [
            { name: 'amountA', type: 'uint256' },
            { name: 'amountB', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// CL SwapRouter ABI (Slipstream)
export const CL_SWAP_ROUTER_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'tickSpacing', type: 'int24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'exactInput',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
    },
] as const;

// QuoterV2 ABI for getting swap quotes
export const QUOTER_V2_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'tickSpacing', type: 'int24' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'quoteExactInputSingle',
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'sqrtPriceX96After', type: 'uint160' },
            { name: 'initializedTicksCrossed', type: 'uint32' },
            { name: 'gasEstimate', type: 'uint256' },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

// Pool Factory ABI
export const POOL_FACTORY_ABI = [
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'stable', type: 'bool' },
        ],
        name: 'getPool',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'allPoolsLength',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'index', type: 'uint256' }],
        name: 'allPools',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// CL Factory ABI (Slipstream)
export const CL_FACTORY_ABI = [
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'tickSpacing', type: 'int24' },
        ],
        name: 'getPool',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Pool ABI
export const POOL_ABI = [
    {
        inputs: [],
        name: 'token0',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'token1',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'stable',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getReserves',
        outputs: [
            { name: '_reserve0', type: 'uint256' },
            { name: '_reserve1', type: 'uint256' },
            { name: '_blockTimestampLast', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalSupply',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// WETH ABI
export const WETH_ABI = [
    {
        inputs: [],
        name: 'deposit',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [{ name: 'amount', type: 'uint256' }],
        name: 'withdraw',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    ...ERC20_ABI,
] as const;

// NonfungiblePositionManager ABI (Slipstream CL)
export const NFT_POSITION_MANAGER_ABI = [
    // ERC721 functions
    {
        inputs: [{ name: 'owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'index', type: 'uint256' },
        ],
        name: 'tokenOfOwnerByIndex',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    // Position info
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'positions',
        outputs: [
            { name: 'nonce', type: 'uint96' },
            { name: 'operator', type: 'address' },
            { name: 'token0', type: 'address' },
            { name: 'token1', type: 'address' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'tickLower', type: 'int24' },
            { name: 'tickUpper', type: 'int24' },
            { name: 'liquidity', type: 'uint128' },
            { name: 'feeGrowthInside0LastX128', type: 'uint256' },
            { name: 'feeGrowthInside1LastX128', type: 'uint256' },
            { name: 'tokensOwed0', type: 'uint128' },
            { name: 'tokensOwed1', type: 'uint128' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    // Mint new position
    {
        inputs: [
            {
                components: [
                    { name: 'token0', type: 'address' },
                    { name: 'token1', type: 'address' },
                    { name: 'tickSpacing', type: 'int24' },
                    { name: 'tickLower', type: 'int24' },
                    { name: 'tickUpper', type: 'int24' },
                    { name: 'amount0Desired', type: 'uint256' },
                    { name: 'amount1Desired', type: 'uint256' },
                    { name: 'amount0Min', type: 'uint256' },
                    { name: 'amount1Min', type: 'uint256' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'sqrtPriceX96', type: 'uint160' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'mint',
        outputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'liquidity', type: 'uint128' },
            { name: 'amount0', type: 'uint256' },
            { name: 'amount1', type: 'uint256' },
        ],
        stateMutability: 'payable',
        type: 'function',
    },
    // Increase liquidity
    {
        inputs: [
            {
                components: [
                    { name: 'tokenId', type: 'uint256' },
                    { name: 'amount0Desired', type: 'uint256' },
                    { name: 'amount1Desired', type: 'uint256' },
                    { name: 'amount0Min', type: 'uint256' },
                    { name: 'amount1Min', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'increaseLiquidity',
        outputs: [
            { name: 'liquidity', type: 'uint128' },
            { name: 'amount0', type: 'uint256' },
            { name: 'amount1', type: 'uint256' },
        ],
        stateMutability: 'payable',
        type: 'function',
    },
    // Decrease liquidity
    {
        inputs: [
            {
                components: [
                    { name: 'tokenId', type: 'uint256' },
                    { name: 'liquidity', type: 'uint128' },
                    { name: 'amount0Min', type: 'uint256' },
                    { name: 'amount1Min', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'decreaseLiquidity',
        outputs: [
            { name: 'amount0', type: 'uint256' },
            { name: 'amount1', type: 'uint256' },
        ],
        stateMutability: 'payable',
        type: 'function',
    },
    // Collect fees
    {
        inputs: [
            {
                components: [
                    { name: 'tokenId', type: 'uint256' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amount0Max', type: 'uint128' },
                    { name: 'amount1Max', type: 'uint128' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'collect',
        outputs: [
            { name: 'amount0', type: 'uint256' },
            { name: 'amount1', type: 'uint256' },
        ],
        stateMutability: 'payable',
        type: 'function',
    },
] as const;

// V3 SwapRouter ABI (CL Swaps)
export const SWAP_ROUTER_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'tickSpacing', type: 'int24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
    },
    // Multicall for batching swap + unwrap
    {
        inputs: [{ name: 'data', type: 'bytes[]' }],
        name: 'multicall',
        outputs: [{ name: 'results', type: 'bytes[]' }],
        stateMutability: 'payable',
        type: 'function',
    },
    // Unwrap WSEI to native SEI
    {
        inputs: [
            { name: 'amountMinimum', type: 'uint256' },
            { name: 'recipient', type: 'address' },
        ],
        name: 'unwrapWETH9',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    // ExactInput for multi-hop swaps
    {
        inputs: [
            {
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'exactInput',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
    },
] as const;

// VotingEscrow ABI (veWIND locking)
export const VOTING_ESCROW_ABI = [
    // View functions
    {
        inputs: [{ name: 'owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'locked',
        outputs: [
            {
                components: [
                    { name: 'amount', type: 'int128' },
                    { name: 'end', type: 'uint256' },
                    { name: 'isPermanent', type: 'bool' },
                ],
                name: '',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'balanceOfNFT',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: '_owner', type: 'address' },
            { name: '_index', type: 'uint256' },
        ],
        name: 'ownerToNFTokenIdList',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'ownerOf',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'voted',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    // Write functions
    {
        inputs: [
            { name: '_value', type: 'uint256' },
            { name: '_lockDuration', type: 'uint256' },
        ],
        name: 'createLock',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: '_tokenId', type: 'uint256' },
            { name: '_value', type: 'uint256' },
        ],
        name: 'increaseAmount',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: '_tokenId', type: 'uint256' },
            { name: '_lockDuration', type: 'uint256' },
        ],
        name: 'increaseUnlockTime',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'withdraw',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'lockPermanent',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'unlockPermanent',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: '_from', type: 'uint256' },
            { name: '_to', type: 'uint256' },
        ],
        name: 'merge',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;


// RewardsDistributor ABI (veNFT rebases)
export const REWARDS_DISTRIBUTOR_ABI = [
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'claimable',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'claim',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

// SugarHelper ABI - On-chain liquidity math helper
export const SUGAR_HELPER_ABI = [
    {
        inputs: [
            { name: 'amount0', type: 'uint256' },
            { name: 'pool', type: 'address' },
            { name: 'sqrtRatioX96', type: 'uint160' },
            { name: 'tickLow', type: 'int24' },
            { name: 'tickHigh', type: 'int24' },
        ],
        name: 'estimateAmount1',
        outputs: [{ name: 'amount1', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'amount1', type: 'uint256' },
            { name: 'pool', type: 'address' },
            { name: 'sqrtRatioX96', type: 'uint160' },
            { name: 'tickLow', type: 'int24' },
            { name: 'tickHigh', type: 'int24' },
        ],
        name: 'estimateAmount0',
        outputs: [{ name: 'amount0', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tick', type: 'int24' }],
        name: 'getSqrtRatioAtTick',
        outputs: [{ name: 'sqrtRatioX96', type: 'uint160' }],
        stateMutability: 'pure',
        type: 'function',
    },
] as const;

// Extended Voter ABI for reading vote data
export const VOTER_EXTENDED_ABI = [
    {
        inputs: [
            { name: '_tokenId', type: 'uint256' },
            { name: '_pool', type: 'address' },
        ],
        name: 'votes',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'lastVoted',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_gauge', type: 'address' }],
        name: 'gaugeToBribe',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_pool', type: 'address' }],
        name: 'gauges',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_token', type: 'address' }],
        name: 'isWhitelistedToken',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Bribe Voting Reward ABI for adding incentives
export const BRIBE_VOTING_REWARD_ABI = [
    {
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'notifyRewardAmount',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'rewardsListLength',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'index', type: 'uint256' }],
        name: 'rewards',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;
