'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { Address, formatUnits } from 'viem';
import Link from 'next/link';
import { CL_CONTRACTS, V2_CONTRACTS } from '@/config/contracts';
import { DEFAULT_TOKEN_LIST, WSEI, USDC, Token } from '@/config/tokens';
import { useCLPositions, useV2Positions } from '@/hooks/usePositions';
import { NFT_POSITION_MANAGER_ABI, ERC20_ABI } from '@/config/abis';
import { usePoolData } from '@/providers/PoolDataProvider';

// VotingEscrow ABI for veNFT data
const VOTING_ESCROW_ABI = [
    {
        inputs: [{ name: 'owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
        name: 'tokenOfOwnerByIndex',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'locked',
        outputs: [{ name: 'amount', type: 'int128' }, { name: 'end', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'balanceOfNFT',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// CL Gauge ABI for staking/claiming
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
] as const;

interface VeNFT {
    tokenId: bigint;
    lockedAmount: bigint;
    lockEnd: bigint;
    votingPower: bigint;
}

interface StakedPosition {
    tokenId: bigint;
    gaugeAddress: string;
    poolAddress: string;
    token0: string;
    token1: string;
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
    tickSpacing: number;
    liquidity: bigint;
    pendingRewards: bigint;
    rewardRate: bigint;
}

// Get token info from known token list
const getTokenInfo = (addr: string) => {
    const token = DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === addr.toLowerCase());
    return { symbol: token?.symbol || addr.slice(0, 10) + '...', decimals: token?.decimals || 18 };
};

// Get token logo from known token list
const getTokenLogo = (addr: string): string | undefined => {
    const token = DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === addr.toLowerCase());
    return token?.logoURI;
};

export default function PortfolioPage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'staked' | 'locks' | 'rewards'>('overview');
    const [veNFTs, setVeNFTs] = useState<VeNFT[]>([]);
    const [stakedPositions, setStakedPositions] = useState<StakedPosition[]>([]);
    const [loadingVeNFTs, setLoadingVeNFTs] = useState(true);
    const [loadingStaked, setLoadingStaked] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Use global pool data for token info (instant!)
    const { getTokenInfo: getGlobalTokenInfo, isLoading: globalLoading } = usePoolData();

    // Shadow outer getTokenInfo - uses global data first, then fallback to token list
    const getTokenInfo = (addr: string) => {
        const globalInfo = getGlobalTokenInfo(addr);
        if (globalInfo) {
            return { symbol: globalInfo.symbol, decimals: globalInfo.decimals };
        }
        // Fallback to local token list
        const token = DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === addr.toLowerCase());
        return { symbol: token?.symbol || addr.slice(0, 10) + '...', decimals: token?.decimals || 18 };
    };

    // Increase liquidity modal state
    const [showIncreaseLiquidityModal, setShowIncreaseLiquidityModal] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<typeof clPositions[0] | null>(null);
    const [amount0ToAdd, setAmount0ToAdd] = useState('');
    const [amount1ToAdd, setAmount1ToAdd] = useState('');
    const [balance0, setBalance0] = useState<string>('0');
    const [balance1, setBalance1] = useState<string>('0');

    // Contract write hook
    const { writeContractAsync } = useWriteContract();

    // Get CL and V2 positions
    const { positions: clPositions, positionCount: clCount, isLoading: clLoading, refetch: refetchCL } = useCLPositions();
    const { positions: v2Positions } = useV2Positions();

    // Fetch balances and pool price when modal opens
    const [currentTick, setCurrentTick] = useState<number | null>(null);

    useEffect(() => {
        const fetchBalancesAndPrice = async () => {
            if (!address || !selectedPosition || !showIncreaseLiquidityModal) {
                setBalance0('0');
                setBalance1('0');
                setCurrentTick(null);
                return;
            }



            try {
                const balanceSelector = '0x70a08231';
                const addressPadded = address.slice(2).toLowerCase().padStart(64, '0');

                // Fetch balances and pool slot0 (for current tick)
                const slot0Selector = '0x3850c7bd'; // slot0()

                console.log('Fetching for position tokens:', selectedPosition.token0, selectedPosition.token1);

                const [bal0Response, bal1Response, slot0Response] = await Promise.all([
                    fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_call',
                            params: [{ to: selectedPosition.token0, data: `${balanceSelector}${addressPadded}` }, 'latest'],
                            id: 1,
                        }),
                    }).then(r => r.json()),
                    fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_call',
                            params: [{ to: selectedPosition.token1, data: `${balanceSelector}${addressPadded}` }, 'latest'],
                            id: 2,
                        }),
                    }).then(r => r.json()),
                    // Fetch pool address and slot0
                    (async () => {
                        // Get pool address from CLFactory
                        const t0 = selectedPosition.token0.toLowerCase();
                        const t1 = selectedPosition.token1.toLowerCase();
                        const [token0, token1] = t0 < t1 ? [t0, t1] : [t1, t0];
                        const tickSpacing = selectedPosition.tickSpacing || 100;

                        const getPoolSelector = '0x28af8d0b';
                        const token0Padded = token0.slice(2).padStart(64, '0');
                        const token1Padded = token1.slice(2).padStart(64, '0');
                        const tickPadded = tickSpacing.toString(16).padStart(64, '0');

                        const poolRes = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                method: 'eth_call',
                                params: [{ to: CL_CONTRACTS.CLFactory, data: `${getPoolSelector}${token0Padded}${token1Padded}${tickPadded}` }, 'latest'],
                                id: 3,
                            }),
                        }).then(r => r.json());

                        if (poolRes.result && poolRes.result !== '0x' + '0'.repeat(64)) {
                            const poolAddress = '0x' + poolRes.result.slice(-40);
                            const slot0Res = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    jsonrpc: '2.0',
                                    method: 'eth_call',
                                    params: [{ to: poolAddress, data: slot0Selector }, 'latest'],
                                    id: 4,
                                }),
                            }).then(r => r.json());
                            return slot0Res;
                        }
                        console.error('Pool not found for', { token0, token1, tickSpacing });
                        return null;
                    })(),
                ]);

                const t0 = getTokenInfo(selectedPosition.token0);
                const t1 = getTokenInfo(selectedPosition.token1);
                const isToken0WSEI = selectedPosition.token0.toLowerCase() === WSEI.address.toLowerCase();
                const isToken1WSEI = selectedPosition.token1.toLowerCase() === WSEI.address.toLowerCase();

                console.log('Balance responses:', bal0Response, bal1Response);

                // For WSEI, fetch native SEI balance instead
                if (isToken0WSEI) {
                    const nativeBal = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_getBalance',
                            params: [address, 'latest'],
                            id: 10,
                        }),
                    }).then(r => r.json());
                    if (nativeBal.result) {
                        const nativeWei = BigInt(nativeBal.result);
                        setBalance0((Number(nativeWei) / 1e18).toFixed(6));
                    }
                } else if (bal0Response.result && bal0Response.result !== '0x') {
                    const bal0Wei = BigInt(bal0Response.result);
                    setBalance0((Number(bal0Wei) / (10 ** t0.decimals)).toFixed(6));
                }

                if (isToken1WSEI) {
                    const nativeBal = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_getBalance',
                            params: [address, 'latest'],
                            id: 11,
                        }),
                    }).then(r => r.json());
                    if (nativeBal.result) {
                        const nativeWei = BigInt(nativeBal.result);
                        setBalance1((Number(nativeWei) / 1e18).toFixed(6));
                    }
                } else if (bal1Response.result && bal1Response.result !== '0x') {
                    const bal1Wei = BigInt(bal1Response.result);
                    setBalance1((Number(bal1Wei) / (10 ** t1.decimals)).toFixed(6));
                }

                // Parse slot0 to get current tick
                if (slot0Response?.result && slot0Response.result.length >= 130) {
                    const tickSlot = slot0Response.result.slice(66, 130);
                    const tickHex = tickSlot.slice(-6);
                    const tickBigInt = BigInt('0x' + tickHex);
                    const tick = tickBigInt > BigInt(0x7FFFFF) ? Number(tickBigInt) - 0x1000000 : Number(tickBigInt);
                    setCurrentTick(tick);
                }
            } catch (err) {
                console.error('Error fetching balances:', err);
            }
        };

        fetchBalancesAndPrice();
    }, [address, selectedPosition, showIncreaseLiquidityModal]);

    // Calculate required amount1 based on amount0 input and position tick range
    const calculateAmount1FromAmount0 = (amount0: string): string => {
        // Note: currentTick can be 0 which is valid, so use explicit null check
        if (!selectedPosition || currentTick === null || !amount0 || parseFloat(amount0) === 0) return '';

        const tickLower = selectedPosition.tickLower;
        const tickUpper = selectedPosition.tickUpper;
        const t0 = getTokenInfo(selectedPosition.token0);
        const t1 = getTokenInfo(selectedPosition.token1);

        // For CL, we use the current price to calculate the ratio
        // price = 1.0001^tick (in token1/token0 raw units)
        // Need to adjust for decimals: actual_price = raw_price * 10^(t0.decimals - t1.decimals)
        const rawPrice = Math.pow(1.0001, currentTick);
        const actualPrice = rawPrice * Math.pow(10, t0.decimals - t1.decimals);

        console.log('calculateAmount1FromAmount0:', { currentTick, rawPrice, actualPrice, t0decimals: t0.decimals, t1decimals: t1.decimals });

        if (currentTick < tickLower) {
            // Position is below range, only token0 needed
            return '0';
        } else if (currentTick > tickUpper) {
            // Position is above range, only token1 needed - can't compute from amount0
            return '';
        } else {
            // In range - use simple price conversion
            // amount1 = amount0 * price
            const amount1 = parseFloat(amount0) * actualPrice;
            console.log('Calculated amount1:', amount1);
            return amount1.toFixed(6);
        }
    };

    // Calculate required amount0 based on amount1 input
    const calculateAmount0FromAmount1 = (amount1: string): string => {
        // Note: currentTick can be 0 which is valid, so use explicit null check
        if (!selectedPosition || currentTick === null || !amount1 || parseFloat(amount1) === 0) return '';

        const tickLower = selectedPosition.tickLower;
        const tickUpper = selectedPosition.tickUpper;
        const t0 = getTokenInfo(selectedPosition.token0);
        const t1 = getTokenInfo(selectedPosition.token1);

        // price = 1.0001^tick (in token1/token0 raw units)
        // actual_price = raw_price * 10^(t0.decimals - t1.decimals)
        const rawPrice = Math.pow(1.0001, currentTick);
        const actualPrice = rawPrice * Math.pow(10, t0.decimals - t1.decimals);

        if (currentTick < tickLower) {
            // Only token0 needed - can't compute from amount1
            return '';
        } else if (currentTick > tickUpper) {
            // Only token1 needed
            return '0';
        } else {
            // In range - use simple price conversion
            // amount0 = amount1 / price
            if (actualPrice === 0) return '';
            const amount0 = parseFloat(amount1) / actualPrice;
            return amount0.toFixed(6);
        }
    };

    // Handle amount0 change and auto-calculate amount1
    const handleAmount0Change = (value: string) => {
        setAmount0ToAdd(value);
        const calculated = calculateAmount1FromAmount0(value);
        if (calculated) setAmount1ToAdd(calculated);
    };

    // Handle amount1 change and auto-calculate amount0
    const handleAmount1Change = (value: string) => {
        setAmount1ToAdd(value);
        const calculated = calculateAmount0FromAmount1(value);
        if (calculated) setAmount0ToAdd(calculated);
    };

    // Fetch veNFT data
    useEffect(() => {
        const fetchVeNFTs = async () => {
            if (!address) {
                setVeNFTs([]);
                setLoadingVeNFTs(false);
                return;
            }

            setLoadingVeNFTs(true);
            const nfts: VeNFT[] = [];

            try {
                // Get veNFT count
                const countResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: V2_CONTRACTS.VotingEscrow,
                            data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());

                const count = countResult.result ? parseInt(countResult.result, 16) : 0;

                for (let i = 0; i < count; i++) {
                    // Get tokenId at index using ownerToNFTokenIdList (0x8bf9d84c)
                    const tokenIdResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.VotingEscrow,
                                data: `0x8bf9d84c${address.slice(2).toLowerCase().padStart(64, '0')}${i.toString(16).padStart(64, '0')}`
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    if (!tokenIdResult.result) continue;
                    const tokenId = BigInt(tokenIdResult.result);

                    // Get locked data using locked(uint256) - selector 0xb45a3c0e
                    const lockedResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.VotingEscrow,
                                data: `0xb45a3c0e${tokenId.toString(16).padStart(64, '0')}`
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    // Get voting power using balanceOfNFT(uint256) - selector 0xe7e242d4
                    const vpResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.VotingEscrow,
                                data: `0xe7e242d4${tokenId.toString(16).padStart(64, '0')}`
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    if (lockedResult.result) {
                        const data = lockedResult.result.slice(2);
                        const lockedAmount = BigInt('0x' + data.slice(0, 64));
                        const lockEnd = BigInt('0x' + data.slice(64, 128));
                        const votingPower = vpResult.result ? BigInt(vpResult.result) : BigInt(0);

                        nfts.push({ tokenId, lockedAmount, lockEnd, votingPower });
                    }
                }
            } catch (err) {
                console.error('Error fetching veNFTs:', err);
            }

            setVeNFTs(nfts);
            setLoadingVeNFTs(false);
        };

        fetchVeNFTs();
    }, [address]);

    // Fetch staked positions and pending rewards
    useEffect(() => {
        const fetchStakedPositions = async () => {
            if (!address) {
                setStakedPositions([]);
                setLoadingStaked(false);
                return;
            }

            setLoadingStaked(true);
            const positions: StakedPosition[] = [];

            try {
                // Step 1: Get all CL pools from CLFactory
                const poolCountResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: CL_CONTRACTS.CLFactory,
                            data: '0xefde4e64' // allPoolsLength()
                        }, 'latest']
                    })
                }).then(r => r.json());

                const poolCount = poolCountResult.result ? parseInt(poolCountResult.result, 16) : 0;
                console.log('[Portfolio] Total CL pools:', poolCount);

                // Step 2: Get all pool addresses
                const clPools: string[] = [];
                for (let i = 0; i < Math.min(poolCount, 50); i++) {
                    const poolResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: CL_CONTRACTS.CLFactory,
                                data: `0x41d1de97${i.toString(16).padStart(64, '0')}` // allPools(uint256)
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    if (poolResult.result) {
                        const poolAddr = '0x' + poolResult.result.slice(26);
                        if (poolAddr !== '0x0000000000000000000000000000000000000000') {
                            clPools.push(poolAddr);
                        }
                    }
                }
                console.log('[Portfolio] CL pools found:', clPools);

                // Step 3: Check each pool for a gauge and staked positions
                for (const poolAddress of clPools) {
                    // Get gauge address for pool from Voter
                    const gaugeResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.Voter,
                                data: `0xb9a09fd5${poolAddress.slice(2).toLowerCase().padStart(64, '0')}` // gauges(address)
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    const gaugeAddr = '0x' + gaugeResult.result?.slice(26);
                    if (!gaugeAddr || gaugeAddr === '0x0000000000000000000000000000000000000000') {
                        continue;
                    }

                    console.log('[Portfolio] Found gauge for pool:', poolAddress, '->', gaugeAddr);

                    // Get staked token IDs for this user
                    const stakedResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: gaugeAddr,
                                data: `0x4b937763${address.slice(2).toLowerCase().padStart(64, '0')}` // stakedValues(address)
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    if (!stakedResult.result || stakedResult.result === '0x' || stakedResult.result.length < 130) {
                        continue;
                    }

                    // Parse the array of token IDs
                    const data = stakedResult.result.slice(2);
                    const offset = parseInt(data.slice(0, 64), 16);
                    const length = parseInt(data.slice(64, 128), 16);

                    console.log('[Portfolio] User has', length, 'staked positions in gauge', gaugeAddr);

                    for (let j = 0; j < length; j++) {
                        const tokenIdHex = data.slice(128 + j * 64, 128 + (j + 1) * 64);
                        const tokenId = BigInt('0x' + tokenIdHex);

                        // Get pending rewards using earned(address,uint256) which simulates reward growth
                        // Selector: 0x3e491d47 = earned(address,uint256)
                        const rewardsResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: gaugeAddr,
                                    data: `0x3e491d47${address.slice(2).toLowerCase().padStart(64, '0')}${tokenId.toString(16).padStart(64, '0')}`
                                }, 'latest']
                            })
                        }).then(r => r.json());

                        // Get reward rate
                        const rateResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: gaugeAddr,
                                    data: '0x7b0a47ee' // rewardRate()
                                }, 'latest']
                            })
                        }).then(r => r.json());

                        // Get position data from NFT manager
                        const positionResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: CL_CONTRACTS.NonfungiblePositionManager,
                                    data: `0x99fbab88${tokenId.toString(16).padStart(64, '0')}`
                                }, 'latest']
                            })
                        }).then(r => r.json());

                        let token0 = '', token1 = '', tickSpacing = 0, liquidity = BigInt(0);
                        let token0Symbol = 'Token0', token1Symbol = 'Token1';
                        let token0Decimals = 18, token1Decimals = 18;

                        if (positionResult.result && positionResult.result.length > 130) {
                            const posData = positionResult.result.slice(2);
                            // positions() returns:
                            // Slot 0 (0-64): nonce (uint96)
                            // Slot 1 (64-128): operator (address) - last 40 chars
                            // Slot 2 (128-192): token0 (address) - last 40 chars
                            // Slot 3 (192-256): token1 (address) - last 40 chars
                            // Slot 4 (256-320): tickSpacing (int24)
                            // Slot 5 (320-384): tickLower (int24)
                            // Slot 6 (384-448): tickUpper (int24)
                            // Slot 7 (448-512): liquidity (uint128)
                            token0 = '0x' + posData.slice(128 + 24, 192); // slot 2, last 40 chars
                            token1 = '0x' + posData.slice(192 + 24, 256); // slot 3, last 40 chars

                            // Parse tickSpacing (int24) - needs to handle signed integers
                            const tickSpacingRaw = BigInt('0x' + posData.slice(256, 320));
                            tickSpacing = tickSpacingRaw > BigInt(8388607)
                                ? Number(tickSpacingRaw - BigInt(2) ** BigInt(256))
                                : Number(tickSpacingRaw);

                            liquidity = BigInt('0x' + posData.slice(448, 512)); // slot 7

                            // Get token symbols
                            const t0Info = getTokenInfo(token0);
                            const t1Info = getTokenInfo(token1);
                            token0Symbol = t0Info.symbol;
                            token1Symbol = t1Info.symbol;
                            token0Decimals = t0Info.decimals;
                            token1Decimals = t1Info.decimals;
                        }

                        positions.push({
                            tokenId,
                            gaugeAddress: gaugeAddr,
                            poolAddress: poolAddress,
                            token0,
                            token1,
                            token0Symbol,
                            token1Symbol,
                            token0Decimals,
                            token1Decimals,
                            tickSpacing,
                            liquidity,
                            pendingRewards: rewardsResult.result ? BigInt(rewardsResult.result) : BigInt(0),
                            rewardRate: rateResult.result ? BigInt(rateResult.result) : BigInt(0),
                        });
                    }
                }
            } catch (err) {
                console.error('Error fetching staked positions:', err);
            }

            setStakedPositions(positions);
            setLoadingStaked(false);
        };

        fetchStakedPositions();
    }, [address]);

    // Calculate totals
    const totalLockedYaka = veNFTs.reduce((sum, nft) => sum + nft.lockedAmount, BigInt(0));
    const totalVotingPower = veNFTs.reduce((sum, nft) => sum + nft.votingPower, BigInt(0));
    const totalPendingRewards = stakedPositions.reduce((sum, pos) => sum + pos.pendingRewards, BigInt(0));
    const totalUncollectedFees = clPositions.reduce((sum, pos) => sum + pos.tokensOwed0 + pos.tokensOwed1, BigInt(0));

    // Refetch staked positions
    const refetchStakedPositions = () => {
        // Trigger re-fetch by resetting loading state (useEffect will handle it)
        setLoadingStaked(true);
    };

    // Collect fees from CL position
    const handleCollectFees = async (position: typeof clPositions[0]) => {
        if (!address) return;
        setActionLoading(true);
        try {
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
            alert('Fees collected successfully!');
            refetchCL();
        } catch (err) {
            console.error('Collect fees error:', err);
            alert('Failed to collect fees. Check console for details.');
        }
        setActionLoading(false);
    };

    // Remove liquidity from CL position
    const handleRemoveLiquidity = async (position: typeof clPositions[0]) => {
        if (!address || position.liquidity <= BigInt(0)) return;
        setActionLoading(true);
        try {
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Decrease liquidity
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

            // Then collect
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

            alert('Liquidity removed successfully!');
            refetchCL();
        } catch (err) {
            console.error('Remove liquidity error:', err);
            alert('Failed to remove liquidity. Check console for details.');
        }
        setActionLoading(false);
    };

    // Stake CL position in gauge
    const handleStakePosition = async (position: typeof clPositions[0]) => {
        if (!address) return;
        setActionLoading(true);
        try {
            // Get pool address from CLFactory
            const getPoolSelector = '0x28af8d0b';
            const token0Padded = position.token0.slice(2).toLowerCase().padStart(64, '0');
            const token1Padded = position.token1.slice(2).toLowerCase().padStart(64, '0');
            const tickSpacingHex = position.tickSpacing >= 0
                ? position.tickSpacing.toString(16).padStart(64, '0')
                : (BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') + BigInt(position.tickSpacing) + BigInt(1)).toString(16);

            const poolResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'eth_call',
                    params: [{ to: CL_CONTRACTS.CLFactory, data: `${getPoolSelector}${token0Padded}${token1Padded}${tickSpacingHex}` }, 'latest'],
                    id: 1
                })
            }).then(r => r.json());

            if (!poolResult.result || poolResult.result === '0x' + '0'.repeat(64)) {
                alert('Pool not found for this position.');
                setActionLoading(false);
                return;
            }

            const poolAddress = '0x' + poolResult.result.slice(-40);

            // Get gauge address from Voter
            const gaugeResult = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'eth_call',
                    params: [{ to: V2_CONTRACTS.Voter, data: `0xb9a09fd5${poolAddress.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest'],
                    id: 1
                })
            }).then(r => r.json());

            if (!gaugeResult.result || gaugeResult.result === '0x' + '0'.repeat(64)) {
                alert('No gauge found for this pool. It may not be gauged yet.');
                setActionLoading(false);
                return;
            }

            const gaugeAddress = '0x' + gaugeResult.result.slice(-40);

            // Approve NFT to gauge
            await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: [{ inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], name: 'approve', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
                functionName: 'approve',
                args: [gaugeAddress as Address, position.tokenId],
            });

            // Deposit to gauge
            await writeContractAsync({
                address: gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'deposit',
                args: [position.tokenId],
            });

            alert('Position staked successfully! You will now earn WIND rewards.');
            refetchCL();
        } catch (err) {
            console.error('Stake position error:', err);
            alert('Failed to stake position. Check console for details.');
        }
        setActionLoading(false);
    };

    // Unstake position from gauge
    const handleUnstakePosition = async (pos: StakedPosition) => {
        if (!address) return;
        setActionLoading(true);
        try {
            await writeContractAsync({
                address: pos.gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'withdraw',
                args: [pos.tokenId],
            });

            alert('Position unstaked successfully!');
            setStakedPositions(prev => prev.filter(p => p.tokenId !== pos.tokenId));
            refetchCL();
        } catch (err) {
            console.error('Unstake position error:', err);
            alert('Failed to unstake position. Check console for details.');
        }
        setActionLoading(false);
    };

    // Claim WIND rewards from gauge
    const handleClaimRewards = async (pos: StakedPosition) => {
        if (!address) return;
        setActionLoading(true);
        try {
            await writeContractAsync({
                address: pos.gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'getReward',
                args: [pos.tokenId],
            });

            alert('Rewards claimed successfully!');
            // Update pending rewards to 0 for this position
            setStakedPositions(prev => prev.map(p =>
                p.tokenId === pos.tokenId ? { ...p, pendingRewards: BigInt(0) } : p
            ));
        } catch (err) {
            console.error('Claim rewards error:', err);
            alert('Failed to claim rewards. Check console for details.');
        }
        setActionLoading(false);
    };

    // Claim all rewards from all staked positions
    const handleClaimAllRewards = async () => {
        if (!address || stakedPositions.length === 0) return;
        setActionLoading(true);
        try {
            for (const pos of stakedPositions) {
                if (pos.pendingRewards > BigInt(0)) {
                    await writeContractAsync({
                        address: pos.gaugeAddress as Address,
                        abi: CL_GAUGE_ABI,
                        functionName: 'getReward',
                        args: [pos.tokenId],
                    });
                }
            }
            alert('All rewards claimed successfully!');
            setStakedPositions(prev => prev.map(p => ({ ...p, pendingRewards: BigInt(0) })));
        } catch (err) {
            console.error('Claim all rewards error:', err);
            alert('Failed to claim all rewards. Check console for details.');
        }
        setActionLoading(false);
    };

    // Open increase liquidity modal
    const openIncreaseLiquidityModal = (position: typeof clPositions[0]) => {
        setSelectedPosition(position);
        setAmount0ToAdd('');
        setAmount1ToAdd('');
        setShowIncreaseLiquidityModal(true);
    };

    // Increase liquidity for CL position
    const handleIncreaseLiquidity = async () => {
        // Prevent multiple submissions
        if (actionLoading) {
            console.log('Action already in progress, skipping');
            return;
        }

        if (!address || !selectedPosition || (!amount0ToAdd && !amount1ToAdd)) return;
        setActionLoading(true);
        try {
            const t0 = getTokenInfo(selectedPosition.token0);
            const t1 = getTokenInfo(selectedPosition.token1);
            const amount0Desired = amount0ToAdd ? BigInt(Math.floor(parseFloat(amount0ToAdd) * (10 ** t0.decimals))) : BigInt(0);
            const amount1Desired = amount1ToAdd ? BigInt(Math.floor(parseFloat(amount1ToAdd) * (10 ** t1.decimals))) : BigInt(0);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Check if either token is WSEI (for native value handling)
            const isToken0WSEI = selectedPosition.token0.toLowerCase() === WSEI.address.toLowerCase();
            const isToken1WSEI = selectedPosition.token1.toLowerCase() === WSEI.address.toLowerCase();

            // Calculate native value if using WSEI
            let nativeValue = BigInt(0);
            if (isToken0WSEI && amount0Desired > BigInt(0)) {
                nativeValue = amount0Desired;
            } else if (isToken1WSEI && amount1Desired > BigInt(0)) {
                nativeValue = amount1Desired;
            }

            // Helper to check allowance
            const checkAllowance = async (tokenAddr: string, amount: bigint): Promise<boolean> => {
                const result = await fetch('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8', {
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

            // Approve token0 if needed (skip for WSEI when using native)
            if (amount0Desired > BigInt(0) && !(isToken0WSEI && nativeValue > BigInt(0))) {
                const hasAllowance = await checkAllowance(selectedPosition.token0, amount0Desired);
                if (!hasAllowance) {
                    await writeContractAsync({
                        address: selectedPosition.token0 as Address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount0Desired],
                    });
                }
            }

            // Approve token1 if needed (skip for WSEI when using native)
            if (amount1Desired > BigInt(0) && !(isToken1WSEI && nativeValue > BigInt(0))) {
                const hasAllowance = await checkAllowance(selectedPosition.token1, amount1Desired);
                if (!hasAllowance) {
                    await writeContractAsync({
                        address: selectedPosition.token1 as Address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount1Desired],
                    });
                }
            }

            // Call increaseLiquidity
            await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'increaseLiquidity',
                args: [{
                    tokenId: selectedPosition.tokenId,
                    amount0Desired,
                    amount1Desired,
                    amount0Min: BigInt(0),
                    amount1Min: BigInt(0),
                    deadline,
                }],
                value: nativeValue,
            });

            alert('Liquidity increased successfully!');
            setShowIncreaseLiquidityModal(false);
            setSelectedPosition(null);
            refetchCL();
        } catch (err) {
            console.error('Increase liquidity error:', err);
            alert('Failed to increase liquidity. Check console for details.');
        }
        setActionLoading(false);
    };

    if (!isConnected) {
        return (
            <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
                <div className="glass-card max-w-md mx-auto p-8 md:p-12 text-center">
                    <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-3 md:mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-2xl md:text-3xl">👛</span>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold mb-2">Connect Wallet</h2>
                    <p className="text-sm md:text-base text-gray-400">Connect your wallet to view your portfolio</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-3 sm:px-6 py-4">
            {/* Header - Compact inline */}
            <motion.div
                className="flex items-center justify-between gap-3 mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold">
                        <span className="gradient-text">Portfolio</span>
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-400">
                        {clPositions.length + v2Positions.length} positions · {veNFTs.length} locks
                    </p>
                </div>
                {totalPendingRewards > BigInt(0) && (
                    <div className="text-right">
                        <div className="text-xs text-gray-400">Claimable</div>
                        <div className="text-sm sm:text-base font-bold text-green-400">
                            {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(2)} WIND
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Tabs - Compact */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
                {(['overview', 'positions', 'staked', 'locks', 'rewards'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${activeTab === tab
                            ? 'bg-primary text-white'
                            : 'text-gray-400 hover:text-white bg-white/5'
                            }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Overview Tab - Compact summary */}
            {activeTab === 'overview' && (
                <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="glass-card p-3">
                            <div className="text-[10px] text-gray-400">LP Positions</div>
                            <div className="text-lg font-bold gradient-text">{clPositions.length + v2Positions.length}</div>
                            <div className="text-[10px] text-gray-500">{clPositions.length} CL · {v2Positions.length} V2</div>
                        </div>
                        <div className="glass-card p-3">
                            <div className="text-[10px] text-gray-400">Staked</div>
                            <div className="text-lg font-bold text-yellow-400">{stakedPositions.length}</div>
                            <div className="text-[10px] text-gray-500">earning rewards</div>
                        </div>
                        <div className="glass-card p-3">
                            <div className="text-[10px] text-gray-400">Locked WIND</div>
                            <div className="text-lg font-bold text-primary">
                                {parseFloat(formatUnits(totalLockedYaka, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-[10px] text-gray-500">{veNFTs.length} veNFT{veNFTs.length !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="glass-card p-3">
                            <div className="text-[10px] text-gray-400">Claimable</div>
                            <div className="text-lg font-bold text-green-400">
                                {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-gray-500">WIND rewards</div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    {totalPendingRewards > BigInt(0) && (
                        <button
                            onClick={handleClaimAllRewards}
                            disabled={actionLoading}
                            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-500 text-white disabled:opacity-50"
                        >
                            {actionLoading ? 'Claiming...' : `Claim ${parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)} WIND`}
                        </button>
                    )}

                    {/* Recent Positions Preview */}
                    {clPositions.length > 0 && (
                        <div className="glass-card p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium">Recent Positions</span>
                                <button onClick={() => setActiveTab('positions')} className="text-[10px] text-primary">View All →</button>
                            </div>
                            <div className="space-y-1.5">
                                {clPositions.slice(0, 3).map((pos, i) => {
                                    const t0 = getTokenInfo(pos.token0);
                                    const t1 = getTokenInfo(pos.token1);
                                    return (
                                        <div key={i} className="flex items-center justify-between p-2 rounded bg-white/5 text-xs">
                                            <span className="font-medium">{t0.symbol}/{t1.symbol}</span>
                                            <span className="text-gray-400">#{pos.tokenId.toString()}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Staked Positions Preview */}
                    {stakedPositions.length > 0 && (
                        <div className="glass-card p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium">Staked Positions</span>
                                <button onClick={() => setActiveTab('staked')} className="text-[10px] text-primary">View All →</button>
                            </div>
                            <div className="space-y-1.5">
                                {stakedPositions.slice(0, 3).map((pos, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded bg-yellow-500/10 text-xs">
                                        <span className="font-medium">{pos.token0Symbol}/{pos.token1Symbol}</span>
                                        <span className="text-green-400">{parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(4)} WIND</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Locks Preview */}
                    {veNFTs.length > 0 && (
                        <div className="glass-card p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium">Your Locks</span>
                                <button onClick={() => setActiveTab('locks')} className="text-[10px] text-primary">View All →</button>
                            </div>
                            <div className="space-y-1.5">
                                {veNFTs.slice(0, 2).map((nft, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded bg-white/5 text-xs">
                                        <span className="font-medium">veNFT #{nft.tokenId.toString()}</span>
                                        <span className="text-primary">{parseFloat(formatUnits(nft.votingPower, 18)).toFixed(0)} veWIND</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}


            {/* Positions Tab */}
            {activeTab === 'positions' && (
                <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="glass-card p-6">
                        <h3 className="font-semibold mb-4">All LP Positions</h3>

                        {/* CL Positions */}
                        {clPositions.length > 0 && (
                            <div className="mb-6">
                                <h4 className="text-sm text-gray-400 mb-3">Concentrated Liquidity (V3)</h4>
                                <div className="space-y-3">
                                    {clPositions.map((pos, i) => {
                                        const t0 = getTokenInfo(pos.token0);
                                        const t1 = getTokenInfo(pos.token1);
                                        const feeMap: Record<number, string> = { 1: '0.009%', 10: '0.045%', 80: '0.25%', 2000: '1%' };
                                        return (
                                            <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative w-12 h-7 flex-shrink-0">
                                                            {getTokenLogo(pos.token0) ? (
                                                                <img src={getTokenLogo(pos.token0)} alt={t0.symbol} className="absolute left-0 w-7 h-7 rounded-full border border-[var(--bg-primary)]" />
                                                            ) : (
                                                                <div className="absolute left-0 w-7 h-7 rounded-full bg-secondary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">{t0.symbol.slice(0, 2)}</div>
                                                            )}
                                                            {getTokenLogo(pos.token1) ? (
                                                                <img src={getTokenLogo(pos.token1)} alt={t1.symbol} className="absolute left-4 w-7 h-7 rounded-full border border-[var(--bg-primary)]" />
                                                            ) : (
                                                                <div className="absolute left-4 w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">{t1.symbol.slice(0, 2)}</div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-sm truncate">{t0.symbol}/{t1.symbol}</div>
                                                            <div className="text-[10px] text-gray-400">#{pos.tokenId.toString()} · {feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`}</div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">CL</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <div className="text-xs text-gray-400">Status</div>
                                                        <div className="font-medium text-green-400">✓ Active</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-gray-400">Uncollected Fees</div>
                                                        <div className="font-medium text-green-400">
                                                            {parseFloat(formatUnits(pos.tokensOwed0, t0.decimals)).toFixed(6)} {t0.symbol}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Action Buttons */}
                                                <div className="flex gap-2 mt-4 pt-3 border-t border-white/10">
                                                    <button
                                                        onClick={() => openIncreaseLiquidityModal(pos)}
                                                        disabled={actionLoading}
                                                        className="flex-1 py-2 px-3 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50"
                                                    >
                                                        {actionLoading ? '...' : '+ Increase'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleCollectFees(pos)}
                                                        disabled={actionLoading || (pos.tokensOwed0 <= BigInt(0) && pos.tokensOwed1 <= BigInt(0))}
                                                        className="flex-1 py-2 px-3 text-xs rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition disabled:opacity-50"
                                                    >
                                                        {actionLoading ? '...' : 'Collect'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveLiquidity(pos)}
                                                        disabled={actionLoading || pos.liquidity <= BigInt(0)}
                                                        className="flex-1 py-2 px-3 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                                                    >
                                                        {actionLoading ? '...' : 'Remove'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleStakePosition(pos)}
                                                        disabled={actionLoading}
                                                        className="flex-1 py-2 px-3 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50"
                                                    >
                                                        {actionLoading ? '...' : 'Stake'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* V2 Positions */}
                        {v2Positions.length > 0 && (
                            <div>
                                <h4 className="text-sm text-gray-400 mb-3">V2 Pools</h4>
                                <div className="space-y-3">
                                    {v2Positions.map((pos, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-semibold">{pos.stable ? 'Stable' : 'Volatile'} Pool</div>
                                                    <div className="text-xs text-gray-400">{pos.poolAddress.slice(0, 10)}...</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-medium">{parseFloat(formatUnits(pos.lpBalance, 18)).toFixed(8)} LP</div>
                                                    <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">V2</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {clPositions.length === 0 && v2Positions.length === 0 && (
                            <div className="text-center py-12">
                                <p className="text-gray-400 mb-4">No LP positions found</p>
                                <Link href="/pools" className="btn-primary px-6 py-2 rounded-lg">Add Liquidity</Link>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Staked Tab */}
            {activeTab === 'staked' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Staked Positions List */}
                    <div className="glass-card p-3 sm:p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm">Your Staked NFTs</h3>
                            {stakedPositions.length > 0 && (
                                <span className="text-xs text-green-400">
                                    {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)} WIND pending
                                </span>
                            )}
                        </div>
                        {loadingStaked ? (
                            <div className="text-center py-8 text-gray-400">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                Loading...
                            </div>
                        ) : stakedPositions.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-400 text-sm mb-3">No staked positions</p>
                                <Link href="/pools" className="btn-primary px-4 py-2 text-sm rounded-lg">Stake LP</Link>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stakedPositions.map((pos, i) => {
                                    const feeMap: Record<number, string> = { 1: '0.009%', 10: '0.045%', 80: '0.25%', 2000: '1%' };
                                    const dailyRewards = Number(formatUnits(pos.rewardRate, 18)) * 86400;

                                    return (
                                        <div key={i} className="p-3 rounded-xl bg-gradient-to-r from-yellow-500/5 to-orange-500/5 border border-yellow-500/20">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="relative w-12 h-7 flex-shrink-0">
                                                        {getTokenLogo(pos.token0) ? (
                                                            <img src={getTokenLogo(pos.token0)} alt={pos.token0Symbol} className="absolute left-0 w-7 h-7 rounded-full border border-[var(--bg-primary)]" />
                                                        ) : (
                                                            <div className="absolute left-0 w-7 h-7 rounded-full bg-secondary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">
                                                                {pos.token0Symbol.slice(0, 2)}
                                                            </div>
                                                        )}
                                                        {getTokenLogo(pos.token1) ? (
                                                            <img src={getTokenLogo(pos.token1)} alt={pos.token1Symbol} className="absolute left-4 w-7 h-7 rounded-full border border-[var(--bg-primary)]" />
                                                        ) : (
                                                            <div className="absolute left-4 w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">
                                                                {pos.token1Symbol.slice(0, 2)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-sm truncate">{pos.token0Symbol}/{pos.token1Symbol}</div>
                                                        <div className="text-[10px] text-gray-400">
                                                            #{pos.tokenId.toString()} · {feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">
                                                    Staked
                                                </span>
                                            </div>

                                            {/* Inline info */}
                                            <div className="flex items-center justify-between text-xs mb-2 px-1">
                                                <span className="text-green-400 font-medium">
                                                    {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(4)} WIND
                                                </span>
                                                <span className="text-gray-400">
                                                    ~{dailyRewards.toFixed(2)}/day
                                                </span>
                                            </div>

                                            {/* Action Buttons - Compact */}
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => handleClaimRewards(pos)}
                                                    disabled={actionLoading || pos.pendingRewards <= BigInt(0)}
                                                    className="flex-1 py-1.5 text-[10px] rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50 font-medium"
                                                >
                                                    Claim
                                                </button>
                                                <button
                                                    onClick={() => handleUnstakePosition(pos)}
                                                    disabled={actionLoading}
                                                    className="flex-1 py-1.5 text-[10px] rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition disabled:opacity-50 font-medium"
                                                >
                                                    Unstake
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Locks Tab */}
            {activeTab === 'locks' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="glass-card p-3 sm:p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm">Your veNFT Locks</h3>
                            <Link href="/vote" className="text-[10px] text-primary font-medium">
                                Lock More →
                            </Link>
                        </div>
                        {loadingVeNFTs ? (
                            <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
                        ) : veNFTs.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-gray-400 text-sm mb-3">No WIND locked yet</p>
                                <Link href="/vote" className="btn-primary px-4 py-2 text-xs rounded-lg">Lock WIND</Link>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {veNFTs.map((nft, i) => {
                                    const lockEndDate = new Date(Number(nft.lockEnd) * 1000);
                                    const isPermanent = Number(nft.lockEnd) === 0 || Number(nft.lockEnd) > Date.now() / 1000 + 3600 * 24 * 365 * 3;
                                    return (
                                        <div key={i} className="p-3 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="font-semibold text-sm">veNFT #{nft.tokenId.toString()}</div>
                                                {isPermanent && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Permanent</span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <div>
                                                    <span className="text-gray-400">Locked: </span>
                                                    <span className="font-medium">{parseFloat(formatUnits(nft.lockedAmount, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })} WIND</span>
                                                </div>
                                                <div className="text-primary font-medium">
                                                    {parseFloat(formatUnits(nft.votingPower, 18)).toFixed(0)} veWIND
                                                </div>
                                            </div>
                                            {!isPermanent && (
                                                <div className="text-[10px] text-gray-400 mt-1">
                                                    Unlocks {lockEndDate.toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {/* Manage on Vote Page */}
                                <Link
                                    href="/vote"
                                    className="block w-full py-2 text-center text-xs text-primary hover:bg-primary/10 rounded-lg transition"
                                >
                                    Manage Locks on Vote Page →
                                </Link>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Rewards Tab */}
            {activeTab === 'rewards' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="glass-card p-3 sm:p-4">
                        {/* Header with Claim All */}
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <div className="text-xl sm:text-2xl font-bold text-green-400">
                                    {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)} WIND
                                </div>
                                <div className="text-[10px] text-gray-400">
                                    From {stakedPositions.length} position{stakedPositions.length !== 1 ? 's' : ''}
                                </div>
                            </div>
                            <button
                                onClick={handleClaimAllRewards}
                                disabled={actionLoading || totalPendingRewards <= BigInt(0)}
                                className="px-3 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white disabled:opacity-50"
                            >
                                {actionLoading ? '...' : 'Claim All'}
                            </button>
                        </div>

                        {/* Rewards List */}
                        {loadingStaked ? (
                            <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
                        ) : stakedPositions.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-gray-400 text-sm mb-2">No staked positions</p>
                                <Link href="/pools" className="btn-primary px-4 py-2 text-xs rounded-lg">Stake LP</Link>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {stakedPositions.map((pos, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                                        <div className="min-w-0">
                                            <div className="font-medium text-sm truncate">{pos.token0Symbol}/{pos.token1Symbol}</div>
                                            <div className="text-[10px] text-gray-400">#{pos.tokenId.toString()}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-green-400">
                                                {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(4)}
                                            </span>
                                            <button
                                                onClick={() => handleClaimRewards(pos)}
                                                disabled={actionLoading || pos.pendingRewards <= BigInt(0)}
                                                className="px-2 py-1 text-[10px] rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50"
                                            >
                                                Claim
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Increase Liquidity Modal - Compact Mobile Style */}
            {showIncreaseLiquidityModal && selectedPosition && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div
                        className="w-full sm:max-w-md bg-[#0d0d14] sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-auto"
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-[#0d0d14] z-10 px-4 py-3 border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold">Increase Liquidity</h3>
                                <button
                                    onClick={() => setShowIncreaseLiquidityModal(false)}
                                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
                                >✕</button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-3">
                            {/* Position Info - Compact */}
                            <div className="p-2 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="relative w-8 h-5 flex-shrink-0">
                                            {getTokenLogo(selectedPosition.token0) ? (
                                                <img src={getTokenLogo(selectedPosition.token0)} alt={getTokenInfo(selectedPosition.token0).symbol} className="absolute left-0 w-5 h-5 rounded-full border border-[var(--bg-primary)]" />
                                            ) : (
                                                <div className="absolute left-0 w-5 h-5 rounded-full bg-secondary/30 flex items-center justify-center text-[8px] font-bold border border-[var(--bg-primary)]">
                                                    {getTokenInfo(selectedPosition.token0).symbol.slice(0, 2)}
                                                </div>
                                            )}
                                            {getTokenLogo(selectedPosition.token1) ? (
                                                <img src={getTokenLogo(selectedPosition.token1)} alt={getTokenInfo(selectedPosition.token1).symbol} className="absolute left-3 w-5 h-5 rounded-full border border-[var(--bg-primary)]" />
                                            ) : (
                                                <div className="absolute left-3 w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[8px] font-bold border border-[var(--bg-primary)]">
                                                    {getTokenInfo(selectedPosition.token1).symbol.slice(0, 2)}
                                                </div>
                                            )}
                                        </div>
                                        <span className="font-semibold text-xs truncate">
                                            {getTokenInfo(selectedPosition.token0).symbol}/{getTokenInfo(selectedPosition.token1).symbol}
                                        </span>
                                        <span className="text-[10px] text-gray-400">#{selectedPosition.tokenId.toString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Token Inputs - Compact */}
                            <div className="space-y-0.5">
                                {/* Token 0 */}
                                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs text-gray-400">
                                            {selectedPosition.token0.toLowerCase() === WSEI.address.toLowerCase() ? 'SEI' : getTokenInfo(selectedPosition.token0).symbol}
                                        </label>
                                        <span className="text-[10px] text-gray-400">
                                            Bal: {balance0}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={amount0ToAdd}
                                            onChange={(e) => handleAmount0Change(e.target.value)}
                                            placeholder="0.0"
                                            className="flex-1 min-w-0 bg-transparent text-xl font-bold outline-none placeholder-gray-600"
                                        />
                                        <div className="flex items-center gap-1.5 py-1.5 px-2 bg-white/10 rounded-lg flex-shrink-0">
                                            {getTokenLogo(selectedPosition.token0) ? (
                                                <img src={getTokenLogo(selectedPosition.token0)} alt={getTokenInfo(selectedPosition.token0).symbol} className="w-5 h-5 rounded-full" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-secondary/30 flex items-center justify-center text-[10px] font-bold">
                                                    {getTokenInfo(selectedPosition.token0).symbol.slice(0, 2)}
                                                </div>
                                            )}
                                            <span className="font-semibold text-sm">{getTokenInfo(selectedPosition.token0).symbol}</span>
                                        </div>
                                    </div>
                                    {/* Quick percentage buttons */}
                                    {balance0 && parseFloat(balance0) > 0 && (
                                        <div className="flex gap-1 mt-2">
                                            {[25, 50, 75, 100].map(pct => (
                                                <button
                                                    key={pct}
                                                    onClick={() => handleAmount0Change((parseFloat(balance0) * pct / 100).toFixed(6))}
                                                    className="flex-1 py-1 text-[10px] font-medium rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                >
                                                    {pct === 100 ? 'MAX' : `${pct}%`}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Token 1 */}
                                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs text-gray-400">
                                            {selectedPosition.token1.toLowerCase() === WSEI.address.toLowerCase() ? 'SEI' : getTokenInfo(selectedPosition.token1).symbol} (auto)
                                        </label>
                                        <span className="text-[10px] text-gray-400">
                                            Bal: {balance1}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={amount1ToAdd}
                                            placeholder="Auto-calculated"
                                            className="flex-1 min-w-0 bg-transparent text-xl font-bold outline-none placeholder-gray-600 text-gray-400"
                                            readOnly
                                        />
                                        <div className="flex items-center gap-1.5 py-1.5 px-2 bg-white/10 rounded-lg flex-shrink-0">
                                            {getTokenLogo(selectedPosition.token1) ? (
                                                <img src={getTokenLogo(selectedPosition.token1)} alt={getTokenInfo(selectedPosition.token1).symbol} className="w-5 h-5 rounded-full" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold">
                                                    {getTokenInfo(selectedPosition.token1).symbol.slice(0, 2)}
                                                </div>
                                            )}
                                            <span className="font-semibold text-sm">{getTokenInfo(selectedPosition.token1).symbol}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="sticky bottom-0 bg-[#0d0d14] p-4 pt-2 border-t border-white/10">
                            <button
                                onClick={handleIncreaseLiquidity}
                                disabled={actionLoading || (!amount0ToAdd && !amount1ToAdd)}
                                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-xl ${!actionLoading && (amount0ToAdd || amount1ToAdd)
                                    ? 'bg-gradient-to-r from-primary via-purple-500 to-secondary text-white shadow-primary/30 hover:shadow-2xl active:scale-[0.98]'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                {actionLoading ? (
                                    <span className="flex items-center justify-center gap-3">
                                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Adding...
                                    </span>
                                ) : (!amount0ToAdd && !amount1ToAdd) ? (
                                    'Enter Amount'
                                ) : (
                                    '✨ Add Liquidity'
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

