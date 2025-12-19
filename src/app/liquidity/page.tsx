'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits, Address, maxUint256, formatUnits } from 'viem';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Token, DEFAULT_TOKEN_LIST, SEI, WSEI, USDC } from '@/config/tokens';
import { CL_CONTRACTS, V2_CONTRACTS, COMMON } from '@/config/contracts';
import { TokenSelector } from '@/components/common/TokenSelector';
import { useLiquidity, usePool } from '@/hooks/useLiquidity';
import { useTokenBalance } from '@/hooks/useToken';
import { useCLPositions, useV2Positions } from '@/hooks/usePositions';
import { NFT_POSITION_MANAGER_ABI, ERC20_ABI, CL_FACTORY_ABI } from '@/config/abis';

// CL Gauge ABI for staking
const CL_GAUGE_ABI = [
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'deposit',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'withdraw',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'getReward',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'account', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
        name: 'earned',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'depositor', type: 'address' }],
        name: 'stakedValues',
        outputs: [{ name: '', type: 'uint256[]' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

type Tab = 'add' | 'positions';
type PoolType = 'v2' | 'cl';

// Wrapper component for Suspense boundary (required for useSearchParams)
export default function LiquidityPage() {
    return (
        <Suspense fallback={<div className="container mx-auto px-4 md:px-6 text-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>}>
            <LiquidityPageContent />
        </Suspense>
    );
}

function LiquidityPageContent() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<Tab>('add');
    const [poolType, setPoolType] = useState<PoolType>('v2');

    // Add liquidity state
    const [tokenA, setTokenA] = useState<Token | undefined>(SEI);
    const [tokenB, setTokenB] = useState<Token | undefined>(USDC);
    const [amountA, setAmountA] = useState('');
    const [amountB, setAmountB] = useState('');
    const [stable, setStable] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState<'A' | 'B' | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [showStakePrompt, setShowStakePrompt] = useState(false);
    const [newlyMintedTokenId, setNewlyMintedTokenId] = useState<bigint | null>(null);

    // CL specific state
    const [tickSpacing, setTickSpacing] = useState(80); // Default tick spacing (0.25%)
    const [priceLower, setPriceLower] = useState('');
    const [priceUpper, setPriceUpper] = useState('');
    const [clPoolPrice, setClPoolPrice] = useState<number | null>(null);
    const [clPoolAddress, setClPoolAddress] = useState<string | null>(null);
    const [initialPrice, setInitialPrice] = useState(''); // For new pool creation

    // Transaction progress state
    type TxStep = 'idle' | 'approving0' | 'approving1' | 'minting' | 'done' | 'error';
    const [txProgress, setTxProgress] = useState<TxStep>('idle');
    const [txError, setTxError] = useState<string | null>(null);

    // Hooks
    const { addLiquidity, isLoading, error } = useLiquidity();
    const { balance: balanceA } = useTokenBalance(tokenA);
    const { balance: balanceB } = useTokenBalance(tokenB);
    const { poolAddress, exists: poolExists } = usePool(tokenA, tokenB, stable);
    const { positions: clPositions, refetch: refetchCL } = useCLPositions();
    const { positions: v2Positions, refetch: refetchV2 } = useV2Positions();

    // Track staked CL positions (positions that are in gauges)
    interface StakedCLPosition {
        tokenId: bigint;
        gaugeAddress: string;
        poolAddress: string;
        token0: string;
        token1: string;
        tickSpacing: number;
        tickLower: number;
        tickUpper: number;
        liquidity: bigint;
    }
    const [stakedCLPositions, setStakedCLPositions] = useState<StakedCLPosition[]>([]);
    const [stakedTokenIds, setStakedTokenIds] = useState<Set<string>>(new Set());

    const { writeContractAsync } = useWriteContract();

    // URL params for deep linking from pools page
    const searchParams = useSearchParams();

    // Read URL params and pre-fill form on mount
    useEffect(() => {
        const token0Addr = searchParams.get('token0');
        const token1Addr = searchParams.get('token1');
        const type = searchParams.get('type');
        const tickSpacingParam = searchParams.get('tickSpacing');
        const stableParam = searchParams.get('stable');

        if (token0Addr && token1Addr) {
            // Find tokens by address - check DEFAULT_TOKEN_LIST first, then WSEI for native
            const findToken = (addr: string): Token | undefined => {
                const lowerAddr = addr.toLowerCase();
                // Check if it's WSEI (for native SEI)
                if (lowerAddr === WSEI.address.toLowerCase()) {
                    return SEI; // Use SEI for native token UI
                }
                return DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === lowerAddr);
            };

            const foundToken0 = findToken(token0Addr);
            const foundToken1 = findToken(token1Addr);

            if (foundToken0) setTokenA(foundToken0);
            if (foundToken1) setTokenB(foundToken1);

            console.log('Pre-filled from URL params:', { token0Addr, token1Addr, foundToken0, foundToken1 });
        }

        if (type === 'cl') {
            setPoolType('cl');
            if (tickSpacingParam) {
                setTickSpacing(parseInt(tickSpacingParam));
            }
        } else if (type === 'v2') {
            setPoolType('v2');
            if (stableParam === 'true') {
                setStable(true);
            }
        }
    }, [searchParams]);

    // Fetch CL pool price when tokens or tickSpacing change
    useEffect(() => {
        const fetchPoolPrice = async () => {
            if (!tokenA || !tokenB || poolType !== 'cl') {
                setClPoolPrice(null);
                setClPoolAddress(null);
                return;
            }

            const actualTokenA = tokenA.isNative ? WSEI : tokenA;
            const actualTokenB = tokenB.isNative ? WSEI : tokenB;

            // Sort tokens
            const [token0, token1] = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase()
                ? [actualTokenA, actualTokenB]
                : [actualTokenB, actualTokenA];

            try {
                // 1. Get pool address from CLFactory
                const getPoolSelector = '28af8d0b';
                const token0Padded = token0.address.slice(2).toLowerCase().padStart(64, '0');
                const token1Padded = token1.address.slice(2).toLowerCase().padStart(64, '0');
                const tickHex = tickSpacing.toString(16).padStart(64, '0');
                const getPoolData = `0x${getPoolSelector}${token0Padded}${token1Padded}${tickHex}`;

                const poolResponse = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: CL_CONTRACTS.CLFactory, data: getPoolData }, 'latest'],
                        id: 1,
                    }),
                });

                const poolResult = await poolResponse.json();
                if (!poolResult.result || poolResult.result === '0x' + '0'.repeat(64)) {
                    setClPoolPrice(null);
                    setClPoolAddress(null);
                    return;
                }

                const pool = '0x' + poolResult.result.slice(-40);
                setClPoolAddress(pool);

                // 2. Get slot0 from pool to get sqrtPriceX96
                const slot0Selector = '3850c7bd'; // cast sig "slot0()"
                const slot0Response = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: pool, data: `0x${slot0Selector}` }, 'latest'],
                        id: 2,
                    }),
                });

                const slot0Result = await slot0Response.json();
                if (!slot0Result.result || slot0Result.result === '0x') {
                    setClPoolPrice(null);
                    return;
                }

                // Decode sqrtPriceX96 from first 32 bytes
                const sqrtPriceX96 = BigInt('0x' + slot0Result.result.slice(2, 66));

                // Price = (sqrtPriceX96 / 2^96)^2
                // Adjust for decimals
                const Q96 = BigInt(2) ** BigInt(96);
                const priceRaw = Number(sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** token0.decimals)) / Number(Q96 * Q96 * BigInt(10 ** token1.decimals));

                // If tokenA is not token0, invert the price
                const price = actualTokenA.address.toLowerCase() === token0.address.toLowerCase()
                    ? priceRaw
                    : 1 / priceRaw;

                setClPoolPrice(price);
            } catch (err) {
                console.error('Error fetching CL pool price:', err);
                setClPoolPrice(null);
                setClPoolAddress(null);
            }
        };

        fetchPoolPrice();
    }, [tokenA, tokenB, tickSpacing, poolType]);

    // Auto-calculate Token B amount when Token A amount or price range changes (CL only)
    useEffect(() => {
        // Use clPoolPrice if available, otherwise use initialPrice for new pools
        const currentPrice = clPoolPrice ?? (initialPrice ? parseFloat(initialPrice) : null);

        if (poolType !== 'cl' || !currentPrice || !amountA || parseFloat(amountA) <= 0) {
            return;
        }

        // Get price range
        const pLower = priceLower ? parseFloat(priceLower) : 0;
        const pUpper = priceUpper ? parseFloat(priceUpper) : Infinity;
        const pCurrent = currentPrice;

        console.log('CL Auto-calculation:', { pCurrent, pLower, pUpper, amountA });

        if (pLower <= 0 && pUpper === Infinity) {
            // Full range - use 50/50 split based on current price
            const amtA = parseFloat(amountA);
            const amtB = amtA * pCurrent;
            console.log('Full range - calculated amountB:', amtB);
            setAmountB(amtB.toFixed(6));
            return;
        }

        if (pLower <= 0 || pUpper <= 0 || pLower >= pUpper) {
            return;
        }

        // Calculate token amounts for concentrated liquidity position
        // Formula based on Uniswap v3 whitepaper
        const sqrtPriceLower = Math.sqrt(pLower);
        const sqrtPriceUpper = Math.sqrt(pUpper);
        const sqrtPriceCurrent = Math.sqrt(pCurrent);

        const amtA = parseFloat(amountA);

        if (pCurrent <= pLower) {
            // Price is below range - all token A, no token B needed
            console.log('Price below range - no token B needed');
            setAmountB('0');
        } else if (pCurrent >= pUpper) {
            // Price is above range - all token B, but user entered A which doesn't make sense
            // In this case, they can't add A to this range
            console.log('Price above range - cannot add token A');
            setAmountB('0');
        } else {
            // Price is in range - calculate token B based on liquidity math
            // L = amountA * (sqrtP * sqrtPu) / (sqrtPu - sqrtP)
            // amountB = L * (sqrtP - sqrtPl)
            const L = amtA * (sqrtPriceCurrent * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceCurrent);
            const amtB = L * (sqrtPriceCurrent - sqrtPriceLower);
            console.log('In range - calculated amountB:', amtB);
            setAmountB(amtB.toFixed(6));
        }
    }, [poolType, clPoolPrice, initialPrice, amountA, priceLower, priceUpper]);

    // CL Position Actions State
    const [selectedCLPosition, setSelectedCLPosition] = useState<typeof clPositions[0] | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch staked CL positions from gauges (includes full position details)
    // OPTIMIZED: Uses parallel RPC calls instead of sequential loops
    useEffect(() => {
        const fetchStakedPositions = async () => {
            if (!address) {
                setStakedTokenIds(new Set());
                setStakedCLPositions([]);
                return;
            }

            const staked = new Set<string>();
            const stakedPositions: StakedCLPosition[] = [];

            try {
                // Helper for RPC calls
                const rpcCall = async (to: string, data: string) => {
                    const response = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{ to, data }, 'latest']
                        })
                    });
                    return response.json();
                };

                // 1. Get pool count
                const poolCountResult = await rpcCall(CL_CONTRACTS.CLFactory, '0xefde4e64');
                const poolCount = poolCountResult.result ? parseInt(poolCountResult.result, 16) : 0;
                const maxPools = Math.min(poolCount, 30); // Limit to 30 pools

                if (maxPools === 0) {
                    setStakedTokenIds(new Set());
                    setStakedCLPositions([]);
                    return;
                }

                // 2. Fetch all pool addresses in parallel
                const poolPromises = Array.from({ length: maxPools }, (_, i) =>
                    rpcCall(CL_CONTRACTS.CLFactory, `0x41d1de97${i.toString(16).padStart(64, '0')}`)
                );
                const poolResults = await Promise.all(poolPromises);

                const poolAddresses = poolResults
                    .map(r => r.result ? '0x' + r.result.slice(26) : null)
                    .filter((addr): addr is string => addr !== null && addr !== '0x0000000000000000000000000000000000000000');

                // 3. Fetch all gauges in parallel
                const gaugePromises = poolAddresses.map(poolAddr =>
                    rpcCall(V2_CONTRACTS.Voter, `0xb9a09fd5${poolAddr.slice(2).toLowerCase().padStart(64, '0')}`)
                );
                const gaugeResults = await Promise.all(gaugePromises);

                // Build pool-to-gauge mapping
                const poolsWithGauges: Array<{ pool: string; gauge: string }> = [];
                gaugeResults.forEach((r, i) => {
                    const gaugeAddr = r.result ? '0x' + r.result.slice(26) : null;
                    if (gaugeAddr && gaugeAddr !== '0x0000000000000000000000000000000000000000') {
                        poolsWithGauges.push({ pool: poolAddresses[i], gauge: gaugeAddr });
                    }
                });

                // 4. Fetch staked values for user from all gauges in parallel
                const stakedPromises = poolsWithGauges.map(({ gauge }) =>
                    rpcCall(gauge, `0x4b937763${address.slice(2).toLowerCase().padStart(64, '0')}`)
                );
                const stakedResults = await Promise.all(stakedPromises);

                // Collect all token IDs that need position lookups
                const tokenIdsToFetch: Array<{ tokenId: bigint; gaugeAddr: string; poolAddr: string }> = [];

                stakedResults.forEach((r, i) => {
                    if (!r.result || r.result === '0x' || r.result.length < 130) return;

                    const data = r.result.slice(2);
                    const length = parseInt(data.slice(64, 128), 16);
                    const { pool, gauge } = poolsWithGauges[i];

                    for (let j = 0; j < length; j++) {
                        const tokenIdHex = data.slice(128 + j * 64, 128 + (j + 1) * 64);
                        const tokenId = BigInt('0x' + tokenIdHex);
                        staked.add(tokenId.toString());
                        tokenIdsToFetch.push({ tokenId, gaugeAddr: gauge, poolAddr: pool });
                    }
                });

                // 5. Fetch all position details in parallel
                if (tokenIdsToFetch.length > 0) {
                    const positionPromises = tokenIdsToFetch.map(({ tokenId }) =>
                        rpcCall(CL_CONTRACTS.NonfungiblePositionManager, `0x99fbab88${tokenId.toString(16).padStart(64, '0')}`)
                    );
                    const positionResults = await Promise.all(positionPromises);

                    const parseSignedInt24 = (hex64: string): number => {
                        const val = BigInt('0x' + hex64);
                        if (val > BigInt(0x7fffff)) {
                            return Number(val - BigInt(0x1000000));
                        }
                        return Number(val);
                    };

                    positionResults.forEach((r, i) => {
                        if (!r.result) return;

                        const posData = r.result.slice(2);
                        const token0 = '0x' + posData.slice(128 + 24, 192);
                        const token1 = '0x' + posData.slice(192 + 24, 256);
                        const tickSpacing = parseSignedInt24(posData.slice(256, 320));
                        const tickLower = parseSignedInt24(posData.slice(320, 384));
                        const tickUpper = parseSignedInt24(posData.slice(384, 448));
                        const liquidity = BigInt('0x' + posData.slice(448, 512));

                        const { tokenId, gaugeAddr, poolAddr } = tokenIdsToFetch[i];
                        stakedPositions.push({
                            tokenId,
                            gaugeAddress: gaugeAddr,
                            poolAddress: poolAddr,
                            token0,
                            token1,
                            tickSpacing,
                            tickLower,
                            tickUpper,
                            liquidity,
                        });
                    });
                }
            } catch (err) {
                console.error('Error fetching staked positions:', err);
            }

            console.log('[Liquidity] Staked positions:', stakedPositions.length);
            setStakedTokenIds(staked);
            setStakedCLPositions(stakedPositions);
        };

        fetchStakedPositions();
    }, [address]);
    const handleCollectFees = async (position: typeof clPositions[0]) => {
        if (!address) return;
        setActionLoading(true);
        try {
            const maxUint128 = BigInt('340282366920938463463374607431768211455'); // 2^128 - 1
            await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'collect',
                args: [{
                    tokenId: position.tokenId,
                    recipient: address,
                    amount0Max: maxUint128,
                    amount1Max: maxUint128,
                }],
            });
            refetchCL();
        } catch (err) {
            console.error('Collect fees error:', err);
        }
        setActionLoading(false);
    };

    // Remove all liquidity from CL position
    const handleRemoveCLLiquidity = async (position: typeof clPositions[0]) => {
        if (!address || position.liquidity <= BigInt(0)) return;
        setActionLoading(true);
        try {
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // First decrease liquidity
            await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'decreaseLiquidity',
                args: [{
                    tokenId: position.tokenId,
                    liquidity: position.liquidity,
                    amount0Min: BigInt(0),
                    amount1Min: BigInt(0),
                    deadline,
                }],
            });

            // Then collect the tokens
            const maxUint128 = BigInt('340282366920938463463374607431768211455');
            await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'collect',
                args: [{
                    tokenId: position.tokenId,
                    recipient: address,
                    amount0Max: maxUint128,
                    amount1Max: maxUint128,
                }],
            });

            refetchCL();
        } catch (err) {
            console.error('Remove CL liquidity error:', err);
        }
        setActionLoading(false);
    };

    // Stake CL position in gauge to earn WIND rewards
    const handleStakeCL = async (position: typeof clPositions[0]) => {
        if (!address) return;
        setActionLoading(true);
        try {
            // First get the pool address from CLFactory.getPool(token0, token1, tickSpacing)
            const getPoolSelector = '0x28af8d0b';
            const token0Padded = position.token0.slice(2).toLowerCase().padStart(64, '0');
            const token1Padded = position.token1.slice(2).toLowerCase().padStart(64, '0');
            const tickSpacingHex = position.tickSpacing >= 0
                ? position.tickSpacing.toString(16).padStart(64, '0')
                : (BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') + BigInt(position.tickSpacing) + BigInt(1)).toString(16);

            const poolResult = await fetch('https://evm-rpc.sei-apis.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{ to: CL_CONTRACTS.CLFactory, data: `${getPoolSelector}${token0Padded}${token1Padded}${tickSpacingHex}` }, 'latest'],
                    id: 1
                })
            }).then(r => r.json());

            if (!poolResult.result || poolResult.result === '0x' + '0'.repeat(64)) {
                console.error('Pool not found');
                alert('Pool not found for this position.');
                setActionLoading(false);
                return;
            }

            const poolAddress = '0x' + poolResult.result.slice(-40);
            console.log('Found pool:', poolAddress);

            // Get gauge address from Voter contract
            // gauges(address) selector = 0xb9a09fd5
            const gaugeSelector = '0xb9a09fd5';
            const poolPadded = poolAddress.slice(2).toLowerCase().padStart(64, '0');

            const gaugeResult = await fetch('https://evm-rpc.sei-apis.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{ to: V2_CONTRACTS.Voter, data: `${gaugeSelector}${poolPadded}` }, 'latest'],
                    id: 1
                })
            }).then(r => r.json());

            console.log('Gauge lookup result:', gaugeResult);

            if (!gaugeResult.result || gaugeResult.result === '0x' + '0'.repeat(64)) {
                console.error('No gauge found for this pool');
                alert('No gauge found for this pool. It may not be gauged yet.');
                setActionLoading(false);
                return;
            }

            const gaugeAddress = '0x' + gaugeResult.result.slice(-40);
            console.log('Found gauge:', gaugeAddress, 'for pool:', poolAddress);

            // First approve the NFT to the gauge
            await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: [
                    {
                        inputs: [
                            { name: 'to', type: 'address' },
                            { name: 'tokenId', type: 'uint256' }
                        ],
                        name: 'approve',
                        outputs: [],
                        stateMutability: 'nonpayable',
                        type: 'function',
                    }
                ],
                functionName: 'approve',
                args: [gaugeAddress as Address, position.tokenId],
            });

            console.log('NFT approved, now staking...');

            // Then deposit to the gauge
            await writeContractAsync({
                address: gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'deposit',
                args: [position.tokenId],
            });

            console.log('Position staked successfully!');
            alert('Position staked successfully! You will now earn WIND rewards.');
            refetchCL();
        } catch (err) {
            console.error('Stake CL position error:', err);
            alert('Failed to stake position. Check console for details.');
        }
        setActionLoading(false);
    };

    // Unstake CL position from gauge
    const handleUnstakeCL = async (stakedPos: StakedCLPosition) => {
        if (!address) return;
        setActionLoading(true);
        try {
            // Withdraw from the gauge
            await writeContractAsync({
                address: stakedPos.gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'withdraw',
                args: [stakedPos.tokenId],
            });

            console.log('Position unstaked successfully!');
            alert('Position unstaked successfully! It is now back in your wallet.');

            // Refresh both owned and staked positions
            refetchCL();
            // Trigger a re-fetch of staked positions by simulating address change
            setStakedCLPositions(prev => prev.filter(p => p.tokenId !== stakedPos.tokenId));
            setStakedTokenIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(stakedPos.tokenId.toString());
                return newSet;
            });
        } catch (err) {
            console.error('Unstake CL position error:', err);
            alert('Failed to unstake position. Check console for details.');
        }
        setActionLoading(false);
    };

    // Handle V2 liquidity add
    const handleAddLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB) return;

        const result = await addLiquidity(tokenA, tokenB, amountA, amountB, stable);

        if (result) {
            setTxHash(result.hash);
            setAmountA('');
            setAmountB('');
            refetchV2();
        }
    };

    // Handle CL liquidity add
    const handleAddCLLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB || !address) {
            console.error('Missing required fields:', { tokenA: !!tokenA, tokenB: !!tokenB, amountA, amountB, address });
            return;
        }

        // Validate amounts are valid numbers
        const amtA = parseFloat(amountA);
        const amtB = parseFloat(amountB);
        if (isNaN(amtA) || isNaN(amtB) || amtA <= 0 || amtB <= 0) {
            console.error('Invalid amounts:', { amountA, amountB, parsedA: amtA, parsedB: amtB });
            alert('Please enter valid amounts for both tokens');
            return;
        }

        // For new pools, require initialPrice
        if (!clPoolPrice && (!initialPrice || parseFloat(initialPrice) <= 0)) {
            console.error('New pool requires initial price');
            alert('Please set the initial price for this new pool');
            return;
        }

        console.log('CL Liquidity Add - tokens:', {
            tokenA: { symbol: tokenA.symbol, isNative: tokenA.isNative, address: tokenA.address },
            tokenB: { symbol: tokenB.symbol, isNative: tokenB.isNative, address: tokenB.address },
            amountA, amountB,
            clPoolPrice,
            initialPrice
        });

        setTxProgress('idle');
        setTxError(null);

        try {
            // For CL pools, we need to use WSEI instead of native SEI
            const actualTokenA = tokenA.isNative ? WSEI : tokenA;
            const actualTokenB = tokenB.isNative ? WSEI : tokenB;

            // Sort tokens by address (token0 < token1)
            const isAFirst = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase();
            const token0 = isAFirst ? actualTokenA : actualTokenB;
            const token1 = isAFirst ? actualTokenB : actualTokenA;
            const amount0 = isAFirst ? amountA : amountB;
            const amount1 = isAFirst ? amountB : amountA;
            const amount0Wei = parseUnits(amount0, token0.decimals);
            const amount1Wei = parseUnits(amount1, token1.decimals);

            // Helper: Convert user price to tick (accounting for token decimals)
            // User enters price as "tokenB per tokenA" (e.g., 0.1 USDC per SEI)
            // Pool stores price as token1/token0 in raw terms (wei amounts)
            const priceToTick = (userPrice: number, spacing: number): number => {
                if (userPrice <= 0) return 0;

                // Pool price = token1_wei / token0_wei
                // If user entered X USDC per SEI, and SEI is token1, USDC is token0:
                //   User price = USDC/SEI = token0/token1 = 1/poolPrice
                //   So poolPrice = 1/X = SEI/USDC = token1/token0
                //   Raw price = poolPrice * 10^token1.decimals / 10^token0.decimals

                const isAFirst = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase();
                let rawPrice: number;

                if (isAFirst) {
                    // tokenA is token0, tokenB is token1
                    // User price = tokenB/tokenA = token1/token0 = pool price (already correct)
                    rawPrice = userPrice * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                } else {
                    // tokenA is token1, tokenB is token0
                    // User price = tokenB/tokenA = token0/token1 = 1/poolPrice
                    // So poolPrice = 1/userPrice
                    rawPrice = (1 / userPrice) * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                }

                console.log('priceToTick:', { userPrice, isAFirst, rawPrice, tick: Math.floor(Math.log(rawPrice) / Math.log(1.0001)) });

                const tick = Math.floor(Math.log(rawPrice) / Math.log(1.0001));
                return Math.round(tick / spacing) * spacing;
            };

            // Calculate tick values
            let tickLower: number;
            let tickUpper: number;

            if (priceLower && priceUpper && parseFloat(priceLower) > 0 && parseFloat(priceUpper) > 0) {
                // Custom price range
                tickLower = priceToTick(parseFloat(priceLower), tickSpacing);
                tickUpper = priceToTick(parseFloat(priceUpper), tickSpacing);
                console.log('Calculated ticks:', { tickLower, tickUpper });
                // Ensure tickLower < tickUpper
                if (tickLower > tickUpper) {
                    [tickLower, tickUpper] = [tickUpper, tickLower];
                }
            } else {
                // Full range
                const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing;
                tickLower = -maxTick;
                tickUpper = maxTick;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Check if pool exists by calling CLFactory.getPool(address,address,int24)
            // Selector: 0x28af8d0b
            const tickSpacingHex = tickSpacing >= 0
                ? tickSpacing.toString(16).padStart(64, '0')
                : (BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') + BigInt(tickSpacing) + BigInt(1)).toString(16);
            const poolCheckData = `0x28af8d0b${token0.address.slice(2).padStart(64, '0')}${token1.address.slice(2).padStart(64, '0')}${tickSpacingHex}`;

            console.log('Pool check data:', poolCheckData);

            let poolExists = false;
            try {
                const poolResult = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: CL_CONTRACTS.CLFactory, data: poolCheckData }, 'latest'],
                        id: 1
                    })
                }).then(r => r.json());

                console.log('Pool check result:', poolResult);
                // If result is not zero address, pool exists
                poolExists = poolResult.result && poolResult.result !== '0x0000000000000000000000000000000000000000000000000000000000000000';
                console.log('Pool exists:', poolExists);
            } catch (err) {
                console.error('Pool check error:', err);
                // If check fails, assume pool doesn't exist
                poolExists = false;
            }

            // If pool exists, use sqrtPriceX96 = 0 (skip createPool)
            // If pool doesn't exist, calculate sqrtPriceX96 from initialPrice to create it
            let sqrtPriceX96 = BigInt(0);
            if (!poolExists) {
                // Use initialPrice if set, otherwise calculate from amounts
                // initialPrice is entered as "tokenB per tokenA" (e.g., 10 USDC per SEI)

                let rawPrice: number; // price in terms of token1/token0 in raw wei

                if (initialPrice && parseFloat(initialPrice) > 0) {
                    const userPrice = parseFloat(initialPrice);

                    // User enters: X tokenB per 1 tokenA
                    // We need: token1_wei / token0_wei for the pool

                    if (isAFirst) {
                        // tokenA = token0, tokenB = token1
                        // User price = tokenB/tokenA = token1/token0 (correct direction)
                        // But need to adjust for decimals:
                        // rawPrice = userPrice * 10^token1.decimals / 10^token0.decimals
                        rawPrice = userPrice * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                    } else {
                        // tokenA = token1, tokenB = token0
                        // User price = tokenB/tokenA = token0/token1 = 1/poolPrice
                        // So poolPrice = 1/userPrice
                        rawPrice = (1 / userPrice) * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                    }
                } else {
                    // Fall back to amounts ratio (already in wei)
                    rawPrice = Number(amount1Wei) / Number(amount0Wei);
                }

                console.log('Price calculation:', {
                    initialPrice,
                    isAFirst,
                    token0Symbol: token0.symbol,
                    token0Decimals: token0.decimals,
                    token1Symbol: token1.symbol,
                    token1Decimals: token1.decimals,
                    rawPrice,
                });

                // sqrtPriceX96 = sqrt(rawPrice) * 2^96
                // Use BigInt math to avoid precision loss
                const Q96 = BigInt(2) ** BigInt(96);
                const sqrtPriceFloat = Math.sqrt(rawPrice);

                // To maintain precision, multiply first then convert to BigInt
                // sqrtPriceX96 = sqrtPrice * 2^96
                // Since sqrtPriceFloat can be very small or very large, we need to be careful
                // Use string parsing for large numbers to avoid JS number precision issues
                const sqrtPriceScaled = sqrtPriceFloat * Number(Q96);
                sqrtPriceX96 = BigInt(Math.floor(sqrtPriceScaled));

                console.log('Creating new pool with:', {
                    sqrtPriceX96: sqrtPriceX96.toString(),
                    sqrtPriceFloat,
                    rawPrice,
                    expectedPrice: (Number(sqrtPriceX96) / Number(Q96)) ** 2,
                });
            } else {
                console.log('Pool exists, skipping creation (sqrtPriceX96=0)');
            }

            // Approve tokens for CL mint
            // For CL, we always use WSEI (actualTokenA/B), so approve based on sorted token order
            // Helper to check allowance
            const checkAllowance = async (tokenAddr: string, amount: bigint): Promise<boolean> => {
                const result = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: tokenAddr,
                            data: `0xdd62ed3e${address!.slice(2).toLowerCase().padStart(64, '0')}${CL_CONTRACTS.NonfungiblePositionManager.slice(2).toLowerCase().padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());
                const allowance = result.result ? BigInt(result.result) : BigInt(0);
                return allowance >= amount;
            };

            // If token0 is not WSEI (being sent as native), approve it
            if (token0.address.toLowerCase() !== WSEI.address.toLowerCase() || !tokenA.isNative && !tokenB.isNative) {
                // Check if token0 is an ERC20 that needs approval (not native SEI being wrapped)
                const token0IsNative = (tokenA.isNative && token0.address.toLowerCase() === WSEI.address.toLowerCase()) ||
                    (tokenB.isNative && token0.address.toLowerCase() === WSEI.address.toLowerCase());
                if (!token0IsNative) {
                    const hasAllowance = await checkAllowance(token0.address, amount0Wei);
                    if (!hasAllowance) {
                        console.log('Approving token0:', token0.symbol, 'amount:', amount0Wei.toString());
                        setTxProgress('approving0');
                        await writeContractAsync({
                            address: token0.address as Address,
                            abi: ERC20_ABI,
                            functionName: 'approve',
                            args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount0Wei],
                        });
                    } else {
                        console.log('Token0 already approved:', token0.symbol);
                    }
                }
            }

            // Approve token1 if it's not native SEI
            const token1IsNative = (tokenA.isNative && token1.address.toLowerCase() === WSEI.address.toLowerCase()) ||
                (tokenB.isNative && token1.address.toLowerCase() === WSEI.address.toLowerCase());
            if (!token1IsNative) {
                const hasAllowance = await checkAllowance(token1.address, amount1Wei);
                if (!hasAllowance) {
                    console.log('Approving token1:', token1.symbol, 'amount:', amount1Wei.toString());
                    setTxProgress('approving1');
                    await writeContractAsync({
                        address: token1.address as Address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount1Wei],
                    });
                } else {
                    console.log('Token1 already approved:', token1.symbol);
                }
            }

            // Calculate native SEI value to send (if any token is native)
            // When sending native value, the contract auto-wraps to WSEI
            let nativeValue = BigInt(0);

            console.log('Token isNative check:', {
                tokenAIsNative: tokenA.isNative,
                tokenBIsNative: tokenB.isNative,
                token0Addr: token0.address.toLowerCase(),
                token1Addr: token1.address.toLowerCase(),
                WSEIAddr: WSEI.address.toLowerCase(),
                amount0Wei: amount0Wei.toString(),
                amount1Wei: amount1Wei.toString()
            });

            if (tokenA.isNative || tokenB.isNative) {
                // Find which sorted token (token0 or token1) is WSEI
                if (token0.address.toLowerCase() === WSEI.address.toLowerCase()) {
                    nativeValue = amount0Wei;
                    console.log('Native value from token0 (WSEI):', nativeValue.toString());
                } else if (token1.address.toLowerCase() === WSEI.address.toLowerCase()) {
                    nativeValue = amount1Wei;
                    console.log('Native value from token1 (WSEI):', nativeValue.toString());
                }
            }

            console.log('Final native value to send:', nativeValue.toString());

            // Mint position with slippage protection
            // The contract calculates optimal liquidity from amounts and refunds any excess via refundETH()
            // Using 0.5% slippage to protect against price movements between quote and execution
            const slippageBps = BigInt(50); // 0.5% = 50 basis points
            const amount0Min = amount0Wei * (BigInt(10000) - slippageBps) / BigInt(10000);
            const amount1Min = amount1Wei * (BigInt(10000) - slippageBps) / BigInt(10000);

            console.log('Mint params:', {
                amount0Wei: amount0Wei.toString(),
                amount1Wei: amount1Wei.toString(),
                amount0Min: amount0Min.toString(),
                amount1Min: amount1Min.toString(),
                slippagePercent: '0.5%',
                tickLower, tickUpper,
                nativeValue: nativeValue.toString(),
                sqrtPriceX96: sqrtPriceX96.toString()
            });

            // Log the exact transaction we're about to send
            const txRequest = {
                address: CL_CONTRACTS.NonfungiblePositionManager,
                functionName: 'mint',
                value: nativeValue.toString(),
                valueHex: '0x' + nativeValue.toString(16),
                args: {
                    token0: token0.address,
                    token1: token1.address,
                    tickSpacing,
                    tickLower,
                    tickUpper,
                    amount0Desired: amount0Wei.toString(),
                    amount1Desired: amount1Wei.toString(),
                    amount0Min: amount0Min.toString(),
                    amount1Min: amount1Min.toString(),
                    sqrtPriceX96: sqrtPriceX96.toString()
                }
            };
            console.log('FULL TX REQUEST:', JSON.stringify(txRequest, null, 2));

            setTxProgress('minting');
            const hash = await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'mint',
                args: [{
                    token0: token0.address as Address,
                    token1: token1.address as Address,
                    tickSpacing,
                    tickLower,
                    tickUpper,
                    amount0Desired: amount0Wei,
                    amount1Desired: amount1Wei,
                    amount0Min,
                    amount1Min,
                    recipient: address,
                    deadline,
                    sqrtPriceX96,
                }],
                value: nativeValue,
            });

            setTxHash(hash);
            setAmountA('');
            setAmountB('');

            // Show stake prompt after successful mint
            setShowStakePrompt(true);
            setTxProgress('done');

            // Refetch positions to get the new one
            setTimeout(() => {
                refetchCL();
            }, 2000); // Wait for tx to confirm
        } catch (err: any) {
            console.error('CL mint error:', err);
            setTxProgress('error');
            setTxError(err?.message || 'Transaction failed');
        }
    };

    const canAdd = isConnected &&
        tokenA &&
        tokenB &&
        amountA &&
        amountB &&
        parseFloat(amountA) > 0 &&
        parseFloat(amountB) > 0;

    return (
        <div className="container mx-auto px-4 md:px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-6 md:mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4">
                    <span className="gradient-text">Provide</span> Liquidity
                </h1>
                <p className="text-sm md:text-base text-gray-400 max-w-xl mx-auto px-2">
                    Deposit tokens into pools to earn trading fees. More volume = more earnings!
                </p>
            </motion.div>

            {/* Tabs */}
            <div className="flex justify-center mb-6 md:mb-8">
                <div className="glass p-1 rounded-xl inline-flex">
                    <button
                        onClick={() => setActiveTab('add')}
                        className={`px-4 md:px-6 py-2 rounded-lg text-sm md:text-base font-medium transition ${activeTab === 'add'
                            ? 'bg-primary text-white'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Add Liquidity
                    </button>
                    <button
                        onClick={() => setActiveTab('positions')}
                        className={`px-4 md:px-6 py-2 rounded-lg text-sm md:text-base font-medium transition ${activeTab === 'positions'
                            ? 'bg-primary text-white'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <span className="hidden sm:inline">My Positions</span>
                        <span className="sm:hidden">Positions</span>
                        <span className="ml-1">({v2Positions.length + clPositions.length + stakedCLPositions.length})</span>
                    </button>
                </div>
            </div>

            {/* Add Liquidity Tab */}
            {activeTab === 'add' && (
                <motion.div
                    className="max-w-md mx-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-6">Add Liquidity</h2>

                        {/* Error Display */}
                        {error && (
                            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Success Display */}
                        {txHash && (
                            <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                                Liquidity added!{' '}
                                <a
                                    href={`https://seitrace.com/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                >
                                    View on SeiTrace
                                </a>
                            </div>
                        )}

                        {/* Pool Type Selection */}
                        <div className="mb-6">
                            <label className="text-sm text-gray-400 mb-3 block">Choose Pool Type</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                                <button
                                    onClick={() => setPoolType('v2')}
                                    className={`p-4 rounded-xl text-left transition-all ${poolType === 'v2'
                                        ? 'bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/40 shadow-lg shadow-primary/10'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">💧</span>
                                        <span className="font-semibold">Classic</span>
                                    </div>
                                    <div className="text-xs text-gray-400">Simple 50/50 split. Set it and forget it!</div>
                                    <div className="text-xs text-primary mt-2 font-medium">Best for beginners</div>
                                </button>
                                <button
                                    onClick={() => setPoolType('cl')}
                                    className={`p-4 rounded-xl text-left transition-all ${poolType === 'cl'
                                        ? 'bg-gradient-to-br from-secondary/20 to-cyan-500/10 border-2 border-secondary/40 shadow-lg shadow-secondary/10'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">⚡</span>
                                        <span className="font-semibold">Concentrated</span>
                                    </div>
                                    <div className="text-xs text-gray-400">Focus liquidity in a price range for higher returns</div>
                                    <div className="text-xs text-secondary mt-2 font-medium">Higher yields</div>
                                </button>
                            </div>
                        </div>

                        {/* V2 Stable/Volatile Toggle */}
                        {poolType === 'v2' && (
                            <div className="mb-6">
                                <label className="text-sm text-gray-400 mb-2 block">Pool Curve</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setStable(false)}
                                        className={`p-3 rounded-xl text-center transition ${!stable
                                            ? 'bg-primary/10 border border-primary/30 text-white'
                                            : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                            }`}
                                    >
                                        Volatile
                                    </button>
                                    <button
                                        onClick={() => setStable(true)}
                                        className={`p-3 rounded-xl text-center transition ${stable
                                            ? 'bg-primary/10 border border-primary/30 text-white'
                                            : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                            }`}
                                    >
                                        Stable
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* CL Tick Spacing */}
                        {poolType === 'cl' && (
                            <div className="mb-6">
                                <label className="text-sm text-gray-400 mb-2 block">Fee Tier</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[
                                        { spacing: 1, fee: '0.009%' },
                                        { spacing: 10, fee: '0.045%' },
                                        { spacing: 80, fee: '0.25%' },
                                        { spacing: 2000, fee: '1%' },
                                    ].map(({ spacing, fee }) => (
                                        <button
                                            key={spacing}
                                            onClick={() => setTickSpacing(spacing)}
                                            className={`p-2 rounded-lg text-center text-sm transition ${tickSpacing === spacing
                                                ? 'bg-secondary/10 border border-secondary/30 text-white'
                                                : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            {fee}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* CL Price Range - Uniswap Style */}
                        {poolType === 'cl' && (() => {
                            // Use pool price if available, otherwise use initial price input
                            const currentPrice = clPoolPrice !== null
                                ? clPoolPrice
                                : (initialPrice ? parseFloat(initialPrice) : null);

                            const setPresetRange = (percent: number) => {
                                if (currentPrice) {
                                    setPriceLower((currentPrice * (1 - percent / 100)).toFixed(6));
                                    setPriceUpper((currentPrice * (1 + percent / 100)).toFixed(6));
                                }
                            };

                            // Check if pool exists
                            const poolExists = clPoolPrice !== null;

                            return (
                                <div className="mb-6">
                                    {/* Current Price Display or Initial Price Input */}
                                    <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                        {poolExists ? (
                                            <>
                                                <div className="text-xs text-gray-400 mb-1">
                                                    <span className="text-green-400">● Pool Price (from existing pool)</span>
                                                </div>
                                                <div className="text-lg font-semibold">
                                                    {tokenA && tokenB && currentPrice ? (
                                                        <>1 {tokenA.symbol} = <span className="text-primary">{currentPrice.toFixed(6)}</span> {tokenB.symbol}</>
                                                    ) : 'Select tokens'}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {tokenA && tokenB && `${tokenB.symbol} per ${tokenA.symbol}`}
                                                    {clPoolAddress && <span className="ml-2 text-gray-600">Pool: {clPoolAddress.slice(0, 10)}...</span>}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-xs text-yellow-400 mb-2">
                                                    ⚠ No pool exists - set initial price to create
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-400 text-sm">1 {tokenA?.symbol || 'Token A'} =</span>
                                                    <input
                                                        type="number"
                                                        value={initialPrice}
                                                        onChange={(e) => setInitialPrice(e.target.value)}
                                                        placeholder="0.0"
                                                        className="flex-1 p-2 rounded-lg bg-white/10 border border-white/20 text-lg font-semibold text-center"
                                                    />
                                                    <span className="text-gray-400 text-sm">{tokenB?.symbol || 'Token B'}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-2">
                                                    Enter the starting price for this new pool
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Preset Range Buttons */}
                                    <div className="mb-6">
                                        <div className="text-xs text-gray-400 mb-2">Quick Range Presets</div>
                                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                            <button
                                                onClick={() => { setPriceLower(''); setPriceUpper(''); }}
                                                className={`py-3 text-sm rounded-xl transition font-medium ${!priceLower && !priceUpper
                                                    ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20'
                                                    : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10'}`}
                                            >
                                                Full
                                            </button>
                                            <button
                                                onClick={() => setPresetRange(5)}
                                                disabled={!currentPrice}
                                                className={`py-3 text-sm rounded-xl transition font-medium ${currentPrice
                                                    ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
                                            >
                                                ±5%
                                            </button>
                                            <button
                                                onClick={() => setPresetRange(10)}
                                                disabled={!currentPrice}
                                                className={`py-3 text-sm rounded-xl transition font-medium ${currentPrice
                                                    ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
                                            >
                                                ±10%
                                            </button>
                                            <button
                                                onClick={() => setPresetRange(25)}
                                                disabled={!currentPrice}
                                                className={`py-3 text-sm rounded-xl transition font-medium ${currentPrice
                                                    ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
                                            >
                                                ±25%
                                            </button>
                                            <button
                                                onClick={() => setPresetRange(50)}
                                                disabled={!currentPrice}
                                                className={`py-3 text-sm rounded-xl transition font-medium ${currentPrice
                                                    ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
                                            >
                                                ±50%
                                            </button>
                                        </div>
                                    </div>

                                    {/* Min/Max Price Inputs - Improved */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Min Price */}
                                        <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/5 to-orange-500/5 border border-red-500/20">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs text-red-400 font-medium uppercase tracking-wide">Min Price</span>
                                                <span className="text-xs text-gray-500">{tokenB?.symbol}/{tokenA?.symbol}</span>
                                            </div>

                                            {/* Main Input */}
                                            <input
                                                type="number"
                                                value={priceLower}
                                                onChange={(e) => setPriceLower(e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-transparent text-2xl font-bold text-center outline-none placeholder-gray-600 mb-3"
                                            />

                                            {/* Step Buttons */}
                                            <div className="grid grid-cols-3 gap-1">
                                                <button
                                                    onClick={() => setPriceLower(prev => (parseFloat(prev || String(currentPrice || 1)) * 0.99).toFixed(6))}
                                                    className="py-2 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition font-medium"
                                                >
                                                    -1%
                                                </button>
                                                <button
                                                    onClick={() => setPriceLower(prev => (parseFloat(prev || String(currentPrice || 1)) * 0.95).toFixed(6))}
                                                    className="py-2 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition font-medium"
                                                >
                                                    -5%
                                                </button>
                                                <button
                                                    onClick={() => setPriceLower(prev => (parseFloat(prev || String(currentPrice || 1)) * 0.90).toFixed(6))}
                                                    className="py-2 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition font-medium"
                                                >
                                                    -10%
                                                </button>
                                            </div>

                                            {/* Set to Current Button */}
                                            {currentPrice && (
                                                <button
                                                    onClick={() => setPriceLower(currentPrice.toFixed(6))}
                                                    className="w-full mt-2 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition"
                                                >
                                                    Set to Current ({currentPrice.toFixed(4)})
                                                </button>
                                            )}
                                        </div>

                                        {/* Max Price */}
                                        <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/5 to-emerald-500/5 border border-green-500/20">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs text-green-400 font-medium uppercase tracking-wide">Max Price</span>
                                                <span className="text-xs text-gray-500">{tokenB?.symbol}/{tokenA?.symbol}</span>
                                            </div>

                                            {/* Main Input */}
                                            <input
                                                type="number"
                                                value={priceUpper}
                                                onChange={(e) => setPriceUpper(e.target.value)}
                                                placeholder="∞"
                                                className="w-full bg-transparent text-2xl font-bold text-center outline-none placeholder-gray-600 mb-3"
                                            />

                                            {/* Step Buttons */}
                                            <div className="grid grid-cols-3 gap-1">
                                                <button
                                                    onClick={() => setPriceUpper(prev => (parseFloat(prev || String(currentPrice || 1)) * 1.01).toFixed(6))}
                                                    className="py-2 text-xs rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition font-medium"
                                                >
                                                    +1%
                                                </button>
                                                <button
                                                    onClick={() => setPriceUpper(prev => (parseFloat(prev || String(currentPrice || 1)) * 1.05).toFixed(6))}
                                                    className="py-2 text-xs rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition font-medium"
                                                >
                                                    +5%
                                                </button>
                                                <button
                                                    onClick={() => setPriceUpper(prev => (parseFloat(prev || String(currentPrice || 1)) * 1.10).toFixed(6))}
                                                    className="py-2 text-xs rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition font-medium"
                                                >
                                                    +10%
                                                </button>
                                            </div>

                                            {/* Set to Current Button */}
                                            {currentPrice && (
                                                <button
                                                    onClick={() => setPriceUpper(currentPrice.toFixed(6))}
                                                    className="w-full mt-2 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition"
                                                >
                                                    Set to Current ({currentPrice.toFixed(4)})
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Range Summary */}
                                    {(priceLower || priceUpper) && (
                                        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-400">Your Position Range:</span>
                                                <span className="font-medium">
                                                    <span className="text-red-400">{priceLower || '0'}</span>
                                                    <span className="text-gray-500 mx-2">→</span>
                                                    <span className="text-green-400">{priceUpper || '∞'}</span>
                                                </span>
                                            </div>
                                            {currentPrice && priceLower && priceUpper && (
                                                <div className="mt-2 text-xs text-gray-500 text-center">
                                                    {parseFloat(priceLower) <= currentPrice && parseFloat(priceUpper) >= currentPrice
                                                        ? '✅ Current price is within range - position will be active'
                                                        : '⚠️ Current price is outside range - position will not earn fees'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                        {/* Token A */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-gray-400">Token A</label>
                                <span className="text-sm text-gray-400">
                                    Balance: {balanceA ? parseFloat(balanceA).toFixed(4) : '--'}
                                </span>
                            </div>
                            <div className="token-input-row">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={amountA}
                                        onChange={(e) => setAmountA(e.target.value)}
                                        placeholder="0.0"
                                        className="flex-1 min-w-0 bg-transparent text-xl md:text-2xl font-medium outline-none placeholder-gray-600"
                                    />
                                    <button onClick={() => setSelectorOpen('A')} className="token-select">
                                        {tokenA ? <span className="font-semibold">{tokenA.symbol}</span> : <span className="text-primary">Select</span>}
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Plus Icon */}
                        <div className="flex justify-center my-2">
                            <div className="p-2 rounded-lg bg-white/5">
                                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                        </div>

                        {/* Token B */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-gray-400">
                                    Token B
                                    {poolType === 'cl' && (
                                        <span className="ml-2 text-xs text-primary">(auto-calculated)</span>
                                    )}
                                </label>
                                <span className="text-sm text-gray-400">
                                    Balance: {balanceB ? parseFloat(balanceB).toFixed(4) : '--'}
                                </span>
                            </div>
                            <div className="token-input-row">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={amountB}
                                        onChange={(e) => poolType !== 'cl' && setAmountB(e.target.value)}
                                        readOnly={poolType === 'cl'}
                                        placeholder={poolType === 'cl' ? 'Enter Token A first' : '0.0'}
                                        className={`flex-1 min-w-0 bg-transparent text-xl md:text-2xl font-medium outline-none placeholder-gray-600 ${poolType === 'cl' ? 'cursor-not-allowed text-gray-400' : ''}`}
                                    />
                                    <button onClick={() => setSelectorOpen('B')} className="token-select">
                                        {tokenB ? <span className="font-semibold">{tokenB.symbol}</span> : <span className="text-primary">Select</span>}
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Pool Info */}
                        {tokenA && tokenB && (
                            <div className="mb-6 p-3 rounded-xl bg-white/5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Pool</span>
                                    <span>{tokenA.symbol}/{tokenB.symbol}</span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-gray-400">Type</span>
                                    <span>{poolType === 'cl' ? 'Concentrated' : stable ? 'Stable' : 'Volatile'}</span>
                                </div>
                            </div>
                        )}

                        {/* Transaction Progress */}
                        {txProgress !== 'idle' && (
                            <div className={`mb-6 p-4 rounded-xl ${txProgress === 'error' ? 'bg-red-500/10 border border-red-500/30' : txProgress === 'done' ? 'bg-green-500/10 border border-green-500/30' : 'bg-primary/10 border border-primary/30'}`}>
                                <div className="flex items-center gap-3 mb-2">
                                    {txProgress === 'done' ? (
                                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</div>
                                    ) : txProgress === 'error' ? (
                                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">✕</div>
                                    ) : (
                                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    )}
                                    <span className="font-medium">
                                        {txProgress === 'approving0' && 'Approving Token 1...'}
                                        {txProgress === 'approving1' && 'Approving Token 2...'}
                                        {txProgress === 'minting' && 'Creating Position...'}
                                        {txProgress === 'done' && 'Position Created Successfully!'}
                                        {txProgress === 'error' && 'Transaction Failed'}
                                    </span>
                                </div>
                                {txProgress !== 'done' && txProgress !== 'error' && (
                                    <div className="flex gap-2 mt-3">
                                        <div className={`flex-1 h-1.5 rounded-full ${txProgress === 'approving0' || txProgress === 'approving1' || txProgress === 'minting' ? 'bg-primary' : 'bg-white/10'}`} />
                                        <div className={`flex-1 h-1.5 rounded-full ${txProgress === 'approving1' || txProgress === 'minting' ? 'bg-primary' : 'bg-white/10'}`} />
                                        <div className={`flex-1 h-1.5 rounded-full ${txProgress === 'minting' ? 'bg-primary' : 'bg-white/10'}`} />
                                    </div>
                                )}
                                {txError && (
                                    <p className="text-sm text-red-400 mt-2">{txError}</p>
                                )}
                            </div>
                        )}

                        {/* Action Button */}
                        <motion.button
                            onClick={poolType === 'cl' ? handleAddCLLiquidity : handleAddLiquidity}
                            disabled={!canAdd || isLoading}
                            className="w-full btn-primary py-4"
                            whileHover={canAdd ? { scale: 1.01 } : {}}
                            whileTap={canAdd ? { scale: 0.99 } : {}}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Adding Liquidity...
                                </span>
                            ) : !isConnected ? (
                                'Connect Wallet'
                            ) : !tokenA || !tokenB ? (
                                'Select Tokens'
                            ) : !amountA || !amountB ? (
                                'Enter Amounts'
                            ) : (
                                `Add ${poolType === 'cl' ? 'CL' : 'V2'} Liquidity`
                            )}
                        </motion.button>
                    </div>
                </motion.div>
            )}

            {/* Positions Tab */}
            {activeTab === 'positions' && (
                <motion.div
                    className="max-w-4xl mx-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    {!isConnected ? (
                        <div className="glass-card p-12 text-center">
                            <h3 className="text-xl font-semibold mb-2">Connect Wallet</h3>
                            <p className="text-gray-400 mb-6">Connect your wallet to view your positions</p>
                        </div>
                    ) : v2Positions.length === 0 && clPositions.length === 0 && stakedCLPositions.length === 0 ? (
                        <div className="glass-card p-12 text-center">
                            <h3 className="text-xl font-semibold mb-2">No Positions Found</h3>
                            <p className="text-gray-400 mb-6">
                                You don't have any LP positions yet.
                            </p>
                            <button onClick={() => setActiveTab('add')} className="btn-primary">
                                Add Liquidity
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* V2 Positions */}
                            {v2Positions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">V2 Positions</h3>
                                    <div className="space-y-3">
                                        {v2Positions.map((pos, i) => {
                                            // Get token symbols from known tokens
                                            const getSymbol = (addr: string) => {
                                                const tokens = DEFAULT_TOKEN_LIST;
                                                const token = tokens.find(t => t.address.toLowerCase() === addr.toLowerCase());
                                                return token?.symbol || addr.slice(0, 6);
                                            };
                                            const symbol0 = getSymbol(pos.token0);
                                            const symbol1 = getSymbol(pos.token1);

                                            return (
                                                <div key={i} className="glass-card p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                                                                    {symbol0.slice(0, 2)}
                                                                </div>
                                                                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-bold absolute -right-2 top-0 border-2 border-bg-primary">
                                                                    {symbol1.slice(0, 2)}
                                                                </div>
                                                            </div>
                                                            <div className="ml-2">
                                                                <div className="font-semibold text-sm">
                                                                    {symbol0}/{symbol1}
                                                                </div>
                                                                <div className="text-xs text-gray-400">
                                                                    {pos.stable ? 'Stable' : 'Volatile'} • {pos.poolAddress.slice(0, 10)}...
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-semibold text-sm">
                                                                {parseFloat(formatUnits(pos.lpBalance, 18)).toFixed(8)} LP
                                                            </div>
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                                                V2
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                                                        <button
                                                            onClick={() => {
                                                                // V2 remove liquidity requires Router - placeholder for now
                                                                alert('V2 remove liquidity coming soon!');
                                                            }}
                                                            className="flex-1 py-2 px-3 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                                                        >
                                                            Remove
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setActiveTab('add');
                                                                setPoolType('v2');
                                                            }}
                                                            className="flex-1 py-2 px-3 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition"
                                                        >
                                                            Add More
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* CL Positions */}
                            {clPositions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-4 mt-6">Concentrated Positions</h3>
                                    <div className="space-y-3">
                                        {clPositions.map((pos, i) => {
                                            // Get token symbols and decimals
                                            const getTokenInfo = (addr: string) => {
                                                const tokens = DEFAULT_TOKEN_LIST;
                                                const token = tokens.find(t => t.address.toLowerCase() === addr.toLowerCase());
                                                return { symbol: token?.symbol || addr.slice(0, 6), decimals: token?.decimals || 18 };
                                            };
                                            const token0Info = getTokenInfo(pos.token0);
                                            const token1Info = getTokenInfo(pos.token1);
                                            const symbol0 = token0Info.symbol;
                                            const symbol1 = token1Info.symbol;

                                            // Convert ticks to prices with decimal adjustment
                                            // In Uniswap V3, price = 1.0001^tick represents token1/token0 in smallest units
                                            // To get human-readable price, we need to adjust for decimals
                                            const decimalAdjustment = Math.pow(10, token0Info.decimals - token1Info.decimals);
                                            const tickToPrice = (tick: number) => {
                                                const rawPrice = Math.pow(1.0001, tick);
                                                return rawPrice * decimalAdjustment;
                                            };

                                            const priceLower = tickToPrice(pos.tickLower);
                                            const priceUpper = tickToPrice(pos.tickUpper);

                                            // Check if in range (simplified - would need current tick from pool)
                                            const isFullRange = pos.tickLower <= -887200 || pos.tickUpper >= 887200;

                                            // Fee tier from tickSpacing
                                            const feeMap: Record<number, string> = { 1: '0.009%', 10: '0.045%', 80: '0.25%', 2000: '1%' };
                                            const feeTier = feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`;

                                            // Format price for display
                                            const formatPrice = (price: number) => {
                                                if (price < 0.0001) return price.toExponential(2);
                                                if (price < 1) return price.toFixed(6);
                                                if (price < 1000) return price.toFixed(4);
                                                if (price < 1000000) return price.toFixed(2);
                                                return price.toExponential(2);
                                            };

                                            return (
                                                <div key={i} className="glass-card p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-bold">
                                                                    {symbol0.slice(0, 2)}
                                                                </div>
                                                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold absolute -right-2 top-0 border-2 border-bg-primary">
                                                                    {symbol1.slice(0, 2)}
                                                                </div>
                                                            </div>
                                                            <div className="ml-2">
                                                                <div className="font-semibold text-sm">
                                                                    {symbol0}/{symbol1} • #{pos.tokenId.toString()}
                                                                </div>
                                                                <div className="text-xs text-gray-400">
                                                                    Fee: {feeTier}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono text-xs text-gray-400">
                                                                Liquidity
                                                            </div>
                                                            <div className="font-semibold text-sm">
                                                                {Number(pos.liquidity).toLocaleString()}
                                                            </div>
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary">
                                                                CL
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Price Range */}
                                                    <div className="p-3 rounded-lg bg-white/5 mb-3">
                                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                            <span>Price Range ({symbol1}/{symbol0})</span>
                                                            {isFullRange && <span className="text-primary">Full Range</span>}
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-center">
                                                                <div className="text-xs text-gray-500">Min</div>
                                                                <div className="font-semibold text-sm">
                                                                    {isFullRange ? '0' : formatPrice(priceLower)}
                                                                </div>
                                                            </div>
                                                            <div className="text-gray-600">↔</div>
                                                            <div className="text-center">
                                                                <div className="text-xs text-gray-500">Max</div>
                                                                <div className="font-semibold text-sm">
                                                                    {isFullRange ? '∞' : formatPrice(priceUpper)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Uncollected Fees */}
                                                    {(pos.tokensOwed0 > BigInt(0) || pos.tokensOwed1 > BigInt(0)) && (
                                                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-3">
                                                            <div className="text-xs text-green-400 mb-1">Uncollected Fees</div>
                                                            <div className="text-sm">
                                                                {pos.tokensOwed0 > BigInt(0) && <span>{parseFloat(formatUnits(pos.tokensOwed0, token0Info.decimals)).toFixed(6)} {symbol0}</span>}
                                                                {pos.tokensOwed0 > BigInt(0) && pos.tokensOwed1 > BigInt(0) && ' + '}
                                                                {pos.tokensOwed1 > BigInt(0) && <span>{parseFloat(formatUnits(pos.tokensOwed1, token1Info.decimals)).toFixed(6)} {symbol1}</span>}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Actions */}
                                                    <div className="flex gap-2 pt-3 border-t border-white/10">
                                                        <button
                                                            onClick={() => handleCollectFees(pos)}
                                                            disabled={actionLoading}
                                                            className="flex-1 py-2 px-3 text-xs rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition disabled:opacity-50"
                                                        >
                                                            {actionLoading ? '...' : 'Collect Fees'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                // Set token amounts for the position and switch to add tab
                                                                setActiveTab('add');
                                                                setPoolType('cl');
                                                            }}
                                                            className="flex-1 py-2 px-3 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition"
                                                        >
                                                            Increase
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveCLLiquidity(pos)}
                                                            disabled={actionLoading || pos.liquidity <= BigInt(0)}
                                                            className="flex-1 py-2 px-3 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                                                        >
                                                            {actionLoading ? '...' : 'Remove'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleStakeCL(pos)}
                                                            disabled={actionLoading || stakedTokenIds.has(pos.tokenId.toString())}
                                                            className={`flex-1 py-2 px-3 text-xs rounded-lg transition disabled:opacity-50 ${stakedTokenIds.has(pos.tokenId.toString())
                                                                ? 'bg-green-500/20 text-green-400 cursor-default'
                                                                : 'bg-primary/10 text-primary hover:bg-primary/20'
                                                                }`}
                                                        >
                                                            {actionLoading ? '...' : stakedTokenIds.has(pos.tokenId.toString()) ? '✓ Staked' : 'Stake'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Staked CL Positions */}
                            {stakedCLPositions.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-4 mt-6 flex items-center gap-2">
                                        <span className="text-green-400">⚡</span> Staked Positions
                                        <span className="text-xs font-normal text-green-400 px-2 py-0.5 rounded-full bg-green-500/20">
                                            Earning WIND
                                        </span>
                                    </h3>
                                    <div className="space-y-3">
                                        {stakedCLPositions.map((pos, i) => {
                                            // Get token symbols from known tokens
                                            const getTokenInfo = (addr: string) => {
                                                const tokens = DEFAULT_TOKEN_LIST;
                                                const token = tokens.find(t => t.address.toLowerCase() === addr.toLowerCase());
                                                return { symbol: token?.symbol || addr.slice(0, 6), decimals: token?.decimals || 18 };
                                            };
                                            const token0Info = getTokenInfo(pos.token0);
                                            const token1Info = getTokenInfo(pos.token1);
                                            const symbol0 = token0Info.symbol;
                                            const symbol1 = token1Info.symbol;

                                            // Convert ticks to prices
                                            const decimalAdjustment = Math.pow(10, token0Info.decimals - token1Info.decimals);
                                            const tickToPrice = (tick: number) => {
                                                const rawPrice = Math.pow(1.0001, tick);
                                                return rawPrice * decimalAdjustment;
                                            };

                                            const priceLower = tickToPrice(pos.tickLower);
                                            const priceUpper = tickToPrice(pos.tickUpper);
                                            const isFullRange = pos.tickLower <= -887200 || pos.tickUpper >= 887200;

                                            const feeMap: Record<number, string> = { 1: '0.009%', 10: '0.045%', 80: '0.25%', 2000: '1%' };
                                            const feeTier = feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`;

                                            const formatPrice = (price: number) => {
                                                if (price < 0.0001) return price.toExponential(2);
                                                if (price < 1) return price.toFixed(6);
                                                if (price < 1000) return price.toFixed(4);
                                                if (price < 1000000) return price.toFixed(2);
                                                return price.toExponential(2);
                                            };

                                            return (
                                                <div key={i} className="glass-card p-4 border-2 border-green-500/30">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-bold">
                                                                    {symbol0.slice(0, 2)}
                                                                </div>
                                                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold absolute -right-2 top-0 border-2 border-bg-primary">
                                                                    {symbol1.slice(0, 2)}
                                                                </div>
                                                            </div>
                                                            <div className="ml-2">
                                                                <div className="font-semibold text-sm flex items-center gap-2">
                                                                    {symbol0}/{symbol1} • #{pos.tokenId.toString()}
                                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                                                        ✓ Staked
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-gray-400">
                                                                    Fee: {feeTier}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono text-xs text-gray-400">
                                                                Liquidity
                                                            </div>
                                                            <div className="font-semibold text-sm">
                                                                {Number(pos.liquidity).toLocaleString()}
                                                            </div>
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary">
                                                                CL
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Price Range */}
                                                    <div className="p-3 rounded-lg bg-white/5 mb-3">
                                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                            <span>Price Range ({symbol1}/{symbol0})</span>
                                                            {isFullRange && <span className="text-primary">Full Range</span>}
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-center">
                                                                <div className="text-xs text-gray-500">Min</div>
                                                                <div className="font-semibold text-sm">
                                                                    {isFullRange ? '0' : formatPrice(priceLower)}
                                                                </div>
                                                            </div>
                                                            <div className="text-gray-600">↔</div>
                                                            <div className="text-center">
                                                                <div className="text-xs text-gray-500">Max</div>
                                                                <div className="font-semibold text-sm">
                                                                    {isFullRange ? '∞' : formatPrice(priceUpper)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Staking Info */}
                                                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-3">
                                                        <div className="text-xs text-green-400 flex items-center gap-2">
                                                            <span>🔥</span> Earning WIND rewards
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            Visit <a href="/portfolio" className="text-primary hover:underline">Portfolio</a> to view all rewards
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex gap-2 pt-3 border-t border-white/10">
                                                        <a href="/portfolio" className="flex-1">
                                                            <button className="w-full py-2 px-3 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition">
                                                                View Rewards
                                                            </button>
                                                        </a>
                                                        <button
                                                            onClick={() => handleUnstakeCL(pos)}
                                                            disabled={actionLoading}
                                                            className="flex-1 py-2 px-3 text-xs rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition disabled:opacity-50"
                                                        >
                                                            {actionLoading ? '...' : 'Unstake'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Token Selector Modal */}
            <TokenSelector
                isOpen={selectorOpen !== null}
                onClose={() => setSelectorOpen(null)}
                onSelect={(token) => {
                    if (selectorOpen === 'A') {
                        // For CL pools, replace SEI with WSEI
                        if (poolType === 'cl' && token.isNative) {
                            setTokenA(WSEI);
                        } else {
                            setTokenA(token);
                        }
                    } else {
                        if (poolType === 'cl' && token.isNative) {
                            setTokenB(WSEI);
                        } else {
                            setTokenB(token);
                        }
                    }
                    setSelectorOpen(null);
                }}
                selectedToken={selectorOpen === 'A' ? tokenA : tokenB}
                excludeToken={selectorOpen === 'A' ? tokenB : tokenA}
            />

            {/* Stake Prompt Modal - appears after successful LP mint */}
            {showStakePrompt && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <motion.div
                        className="glass-card p-6 max-w-md w-full"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                <span className="text-3xl">✅</span>
                            </div>
                            <h3 className="text-xl font-bold mb-2">Liquidity Added Successfully!</h3>
                            <p className="text-gray-400 text-sm">
                                Your position has been created. <span className="text-primary font-semibold">Stake it now</span> to earn WIND emissions!
                            </p>
                        </div>

                        <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-6">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-2xl">🔥</span>
                                <span className="font-semibold">Why Stake?</span>
                            </div>
                            <ul className="text-sm text-gray-300 space-y-1 ml-9">
                                <li>• Earn WIND token rewards</li>
                                <li>• Boost gauge voting power</li>
                                <li>• Maximize your LP returns</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowStakePrompt(false);
                                    setActiveTab('positions');
                                }}
                                className="w-full py-3 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-semibold hover:opacity-90 transition"
                            >
                                🎯 Go to Positions & Stake
                            </button>
                            <button
                                onClick={() => setShowStakePrompt(false)}
                                className="w-full py-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition text-sm"
                            >
                                Skip for now
                            </button>
                        </div>

                        {txHash && (
                            <div className="mt-4 pt-4 border-t border-white/10 text-center">
                                <a
                                    href={`https://seitrace.com/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline"
                                >
                                    View transaction →
                                </a>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </div>
    );
}
