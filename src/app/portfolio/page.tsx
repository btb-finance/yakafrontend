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

export default function PortfolioPage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'staked' | 'locks' | 'rewards'>('overview');
    const [veNFTs, setVeNFTs] = useState<VeNFT[]>([]);
    const [stakedPositions, setStakedPositions] = useState<StakedPosition[]>([]);
    const [loadingVeNFTs, setLoadingVeNFTs] = useState(true);
    const [loadingStaked, setLoadingStaked] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

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

                const [bal0Response, bal1Response, slot0Response] = await Promise.all([
                    fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_call',
                            params: [{ to: selectedPosition.token0, data: `${balanceSelector}${addressPadded}` }, 'latest'],
                            id: 1,
                        }),
                    }).then(r => r.json()),
                    fetch('https://evm-rpc.sei-apis.com', {
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

                        const poolRes = await fetch('https://evm-rpc.sei-apis.com', {
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
                            const slot0Res = await fetch('https://evm-rpc.sei-apis.com', {
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
                        return null;
                    })(),
                ]);

                const t0 = getTokenInfo(selectedPosition.token0);
                const t1 = getTokenInfo(selectedPosition.token1);

                if (bal0Response.result) {
                    const bal0Wei = BigInt(bal0Response.result);
                    setBalance0((Number(bal0Wei) / (10 ** t0.decimals)).toFixed(6));
                }
                if (bal1Response.result) {
                    const bal1Wei = BigInt(bal1Response.result);
                    setBalance1((Number(bal1Wei) / (10 ** t1.decimals)).toFixed(6));
                }

                // Parse slot0 to get current tick
                if (slot0Response?.result && slot0Response.result.length >= 130) {
                    // slot0 returns: sqrtPriceX96 (uint160), tick (int24), ...
                    // tick is at bytes 20-22 (from position 64 to 70)
                    const tickHex = slot0Response.result.slice(66, 130);
                    const tickBigInt = BigInt('0x' + tickHex);
                    // Convert to signed int24
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
        if (!selectedPosition || !currentTick || !amount0 || parseFloat(amount0) === 0) return '';

        const tickLower = selectedPosition.tickLower;
        const tickUpper = selectedPosition.tickUpper;
        const t0 = getTokenInfo(selectedPosition.token0);
        const t1 = getTokenInfo(selectedPosition.token1);

        // Calculate price ratio at current tick
        const sqrtPriceCurrent = Math.pow(1.0001, currentTick / 2);
        const sqrtPriceLower = Math.pow(1.0001, tickLower / 2);
        const sqrtPriceUpper = Math.pow(1.0001, tickUpper / 2);

        // Adjust for decimals
        const decimalAdjust = Math.pow(10, t1.decimals - t0.decimals);

        // Calculate the ratio of token1 to token0 for this position
        // For in-range positions: amount1 = amount0 * (sqrtP - sqrtPa) / (1/sqrtP - 1/sqrtPb)
        if (currentTick < tickLower) {
            // Position is below range, only token0 needed
            return '0';
        } else if (currentTick > tickUpper) {
            // Position is above range, only token1 needed - can't compute from amount0
            return '';
        } else {
            // In range
            const numerator = sqrtPriceCurrent - sqrtPriceLower;
            const denominator = (1 / sqrtPriceCurrent) - (1 / sqrtPriceUpper);
            if (denominator === 0) return '';
            const ratio = numerator / denominator * decimalAdjust;
            const amount1 = parseFloat(amount0) * ratio;
            return amount1.toFixed(6);
        }
    };

    // Calculate required amount0 based on amount1 input
    const calculateAmount0FromAmount1 = (amount1: string): string => {
        if (!selectedPosition || !currentTick || !amount1 || parseFloat(amount1) === 0) return '';

        const tickLower = selectedPosition.tickLower;
        const tickUpper = selectedPosition.tickUpper;
        const t0 = getTokenInfo(selectedPosition.token0);
        const t1 = getTokenInfo(selectedPosition.token1);

        const sqrtPriceCurrent = Math.pow(1.0001, currentTick / 2);
        const sqrtPriceLower = Math.pow(1.0001, tickLower / 2);
        const sqrtPriceUpper = Math.pow(1.0001, tickUpper / 2);

        const decimalAdjust = Math.pow(10, t1.decimals - t0.decimals);

        if (currentTick < tickLower) {
            // Only token0 needed - can't compute from amount1
            return '';
        } else if (currentTick > tickUpper) {
            // Only token1 needed
            return '0';
        } else {
            const numerator = sqrtPriceCurrent - sqrtPriceLower;
            const denominator = (1 / sqrtPriceCurrent) - (1 / sqrtPriceUpper);
            if (numerator === 0) return '';
            const ratio = denominator / numerator / decimalAdjust;
            const amount0 = parseFloat(amount1) * ratio;
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
                const countResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                    // Get tokenId at index
                    const tokenIdResult = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.VotingEscrow,
                                data: `0x2f745c59${address.slice(2).toLowerCase().padStart(64, '0')}${i.toString(16).padStart(64, '0')}`
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    if (!tokenIdResult.result) continue;
                    const tokenId = BigInt(tokenIdResult.result);

                    // Get locked data
                    const lockedResult = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.VotingEscrow,
                                data: `0xf32ddc50${tokenId.toString(16).padStart(64, '0')}`
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    // Get voting power
                    const vpResult = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.VotingEscrow,
                                data: `0xf1127ed8${tokenId.toString(16).padStart(64, '0')}`
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
                const poolCountResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                    const poolResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                    const gaugeResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                    const stakedResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                        const rewardsResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                        const rateResult = await fetch('https://evm-rpc.sei-apis.com', {
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
                        const positionResult = await fetch('https://evm-rpc.sei-apis.com', {
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

            const poolResult = await fetch('https://evm-rpc.sei-apis.com', {
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
            const gaugeResult = await fetch('https://evm-rpc.sei-apis.com', {
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
        if (!address || !selectedPosition || (!amount0ToAdd && !amount1ToAdd)) return;
        setActionLoading(true);
        try {
            const t0 = getTokenInfo(selectedPosition.token0);
            const t1 = getTokenInfo(selectedPosition.token1);
            const amount0Desired = amount0ToAdd ? BigInt(Math.floor(parseFloat(amount0ToAdd) * (10 ** t0.decimals))) : BigInt(0);
            const amount1Desired = amount1ToAdd ? BigInt(Math.floor(parseFloat(amount1ToAdd) * (10 ** t1.decimals))) : BigInt(0);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Approve token0 if needed
            if (amount0Desired > BigInt(0)) {
                await writeContractAsync({
                    address: selectedPosition.token0 as Address,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount0Desired],
                });
            }

            // Approve token1 if needed
            if (amount1Desired > BigInt(0)) {
                await writeContractAsync({
                    address: selectedPosition.token1 as Address,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount1Desired],
                });
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
        <div className="container mx-auto px-4 md:px-6 py-4 md:py-8">
            {/* Header */}
            <motion.div
                className="text-center mb-6 md:mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-2xl md:text-4xl font-bold mb-1 md:mb-2">
                    <span className="gradient-text">My Portfolio</span>
                </h1>
                <p className="text-sm md:text-base text-gray-400">
                    Track your LP positions, locked WIND, and rewards
                </p>
            </motion.div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-6 md:mb-8">
                <motion.div
                    className="glass-card p-3 md:p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="text-xs text-gray-400 mb-1">LP Positions</div>
                    <div className="text-xl md:text-2xl font-bold gradient-text">{clPositions.length + v2Positions.length}</div>
                    <div className="text-xs text-gray-500 mt-0.5 md:mt-1">{clPositions.length} CL · {v2Positions.length} V2</div>
                </motion.div>

                <motion.div
                    className="glass-card p-3 md:p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="text-xs text-gray-400 mb-1">Locked WIND</div>
                    <div className="text-xl md:text-2xl font-bold text-primary">
                        {parseFloat(formatUnits(totalLockedYaka, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 md:mt-1">{veNFTs.length} veNFT{veNFTs.length !== 1 ? 's' : ''}</div>
                </motion.div>

                <motion.div
                    className="glass-card p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="text-xs text-gray-400 mb-1">Pending Rewards</div>
                    <div className="text-2xl font-bold text-green-400">
                        {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">WIND to claim</div>
                </motion.div>

                <motion.div
                    className="glass-card p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <div className="text-xs text-gray-400 mb-1">Voting Power</div>
                    <div className="text-2xl font-bold text-secondary">
                        {parseFloat(formatUnits(totalVotingPower, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">veWIND</div>
                </motion.div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-white/10 pb-2 overflow-x-auto">
                {(['overview', 'positions', 'staked', 'locks', 'rewards'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeTab === tab
                            ? 'bg-primary text-white'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {tab === 'overview' && '📊 '}
                        {tab === 'positions' && '💧 '}
                        {tab === 'staked' && '⚡ '}
                        {tab === 'locks' && '🔒 '}
                        {tab === 'rewards' && '🎁 '}
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Recent Positions */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Recent LP Positions</h3>
                            <Link href="/liquidity" className="text-sm text-primary hover:underline">View All →</Link>
                        </div>
                        {clLoading ? (
                            <div className="text-center py-8 text-gray-400">Loading positions...</div>
                        ) : clPositions.length === 0 && v2Positions.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-400 mb-4">No LP positions yet</p>
                                <Link href="/liquidity" className="btn-primary px-6 py-2 rounded-lg">Add Liquidity</Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {clPositions.slice(0, 3).map((pos, i) => {
                                    const t0 = getTokenInfo(pos.token0);
                                    const t1 = getTokenInfo(pos.token1);
                                    return (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="flex -space-x-2">
                                                    <div className="w-8 h-8 rounded-full bg-secondary/30 flex items-center justify-center text-xs font-bold">{t0.symbol.slice(0, 2)}</div>
                                                    <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold">{t1.symbol.slice(0, 2)}</div>
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">{t0.symbol}/{t1.symbol}</div>
                                                    <div className="text-xs text-gray-400">Position #{pos.tokenId.toString()}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs px-2 py-1 rounded-full bg-secondary/20 text-secondary">CL</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Locks Overview */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Locked WIND (veNFTs)</h3>
                            <Link href="/vote" className="text-sm text-primary hover:underline">Manage Locks →</Link>
                        </div>
                        {loadingVeNFTs ? (
                            <div className="text-center py-8 text-gray-400">Loading locks...</div>
                        ) : veNFTs.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-400 mb-4">No locked WIND</p>
                                <Link href="/vote" className="btn-primary px-6 py-2 rounded-lg">Lock WIND</Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {veNFTs.slice(0, 3).map((nft, i) => {
                                    const lockEndDate = new Date(Number(nft.lockEnd) * 1000);
                                    const isPermanent = Number(nft.lockEnd) === 0 || Number(nft.lockEnd) > Date.now() / 1000 + 3600 * 24 * 365 * 3;
                                    return (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                                            <div>
                                                <div className="font-medium text-sm">veNFT #{nft.tokenId.toString()}</div>
                                                <div className="text-xs text-gray-400">
                                                    {parseFloat(formatUnits(nft.lockedAmount, 18)).toLocaleString()} WIND locked
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-primary">
                                                    {parseFloat(formatUnits(nft.votingPower, 18)).toFixed(2)} veWIND
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    {isPermanent ? 'Permanent Lock' : `Unlocks ${lockEndDate.toLocaleDateString()}`}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pending Rewards */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Pending Rewards</h3>
                            <Link href="/liquidity" className="text-sm text-primary hover:underline">Manage Positions →</Link>
                        </div>
                        {loadingStaked ? (
                            <div className="text-center py-8 text-gray-400">Loading rewards...</div>
                        ) : stakedPositions.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-400 mb-4">No staked positions</p>
                                <Link href="/liquidity" className="btn-primary px-6 py-2 rounded-lg">Stake LP</Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {stakedPositions.slice(0, 3).map((pos, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                                        <div>
                                            <div className="font-medium text-sm">{pos.token0Symbol}/{pos.token1Symbol}</div>
                                            <div className="text-xs text-gray-400">Staked #{pos.tokenId.toString()}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-green-400">
                                                {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(4)} WIND
                                            </div>
                                            <div className="text-xs text-gray-400">pending</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
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
                                            <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex -space-x-2">
                                                            <div className="w-10 h-10 rounded-full bg-secondary/30 flex items-center justify-center text-sm font-bold">{t0.symbol.slice(0, 2)}</div>
                                                            <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center text-sm font-bold">{t1.symbol.slice(0, 2)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold">{t0.symbol}/{t1.symbol}</div>
                                                            <div className="text-xs text-gray-400">#{pos.tokenId.toString()} · Fee: {feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`}</div>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs px-2 py-1 rounded-full bg-secondary/20 text-secondary">CL</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <div className="text-xs text-gray-400">Liquidity</div>
                                                        <div className="font-medium">{Number(pos.liquidity).toLocaleString()}</div>
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
                                <Link href="/liquidity" className="btn-primary px-6 py-2 rounded-lg">Add Liquidity</Link>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Staked Tab */}
            {activeTab === 'staked' && (
                <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Summary Card */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Staked LP Positions</h3>
                            <Link href="/liquidity" className="text-sm text-primary hover:underline">Manage Stakes →</Link>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                                <div className="text-xs text-gray-400 mb-1">Total Staked</div>
                                <div className="text-2xl font-bold gradient-text">{stakedPositions.length}</div>
                                <div className="text-xs text-gray-500">NFT Positions</div>
                            </div>
                            <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                <div className="text-xs text-gray-400 mb-1">Total Pending</div>
                                <div className="text-xl font-bold text-green-400">
                                    {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)}
                                </div>
                                <div className="text-xs text-gray-500">WIND rewards</div>
                            </div>
                            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                                <div className="text-xs text-gray-400 mb-1">Active Gauges</div>
                                <div className="text-xl font-bold text-blue-400">
                                    {new Set(stakedPositions.map(p => p.gaugeAddress)).size}
                                </div>
                                <div className="text-xs text-gray-500">earning rewards</div>
                            </div>
                        </div>
                    </div>

                    {/* Staked Positions List */}
                    <div className="glass-card p-6">
                        <h3 className="font-semibold mb-4">Your Staked NFTs</h3>
                        {loadingStaked ? (
                            <div className="text-center py-12 text-gray-400">
                                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                Loading staked positions...
                            </div>
                        ) : stakedPositions.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
                                    <span className="text-4xl">⚡</span>
                                </div>
                                <p className="text-gray-400 mb-2">No staked positions</p>
                                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                                    Stake your LP positions to earn WIND emissions
                                </p>
                                <Link href="/liquidity" className="btn-primary px-6 py-3 rounded-lg">View Your Positions</Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stakedPositions.map((pos, i) => {
                                    const feeMap: Record<number, string> = { 1: '0.009%', 10: '0.045%', 80: '0.25%', 2000: '1%' };
                                    const dailyRewards = Number(formatUnits(pos.rewardRate, 18)) * 86400;

                                    return (
                                        <div key={i} className="p-5 rounded-xl bg-gradient-to-r from-yellow-500/5 to-orange-500/5 border border-yellow-500/20">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex -space-x-3">
                                                        <div className="w-12 h-12 rounded-full bg-secondary/30 flex items-center justify-center text-sm font-bold border-2 border-bg-primary">
                                                            {pos.token0Symbol.slice(0, 2)}
                                                        </div>
                                                        <div className="w-12 h-12 rounded-full bg-primary/30 flex items-center justify-center text-sm font-bold border-2 border-bg-primary">
                                                            {pos.token1Symbol.slice(0, 2)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-lg">{pos.token0Symbol}/{pos.token1Symbol}</div>
                                                        <div className="text-sm text-gray-400">
                                                            NFT #{pos.tokenId.toString()} · {feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-xs px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">
                                                    ⚡ Staked
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="p-3 rounded-lg bg-white/5">
                                                    <div className="text-xs text-gray-400 mb-1">Liquidity</div>
                                                    <div className="font-semibold">{Number(pos.liquidity).toLocaleString()}</div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5">
                                                    <div className="text-xs text-gray-400 mb-1">Pending Rewards</div>
                                                    <div className="font-semibold text-green-400">
                                                        {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(6)} WIND
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5">
                                                    <div className="text-xs text-gray-400 mb-1">Est. Daily</div>
                                                    <div className="font-semibold text-blue-400">
                                                        ~{dailyRewards.toFixed(4)} WIND
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5">
                                                    <div className="text-xs text-gray-400 mb-1">Gauge</div>
                                                    <div className="font-mono text-xs truncate">
                                                        {pos.gaugeAddress.slice(0, 8)}...{pos.gaugeAddress.slice(-6)}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Action Buttons */}
                                            <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                                                <button
                                                    onClick={() => handleClaimRewards(pos)}
                                                    disabled={actionLoading || pos.pendingRewards <= BigInt(0)}
                                                    className="flex-1 py-2.5 px-4 text-sm rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50 font-medium"
                                                >
                                                    {actionLoading ? '...' : `Claim ${parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(4)} WIND`}
                                                </button>
                                                <button
                                                    onClick={() => handleUnstakePosition(pos)}
                                                    disabled={actionLoading}
                                                    className="flex-1 py-2.5 px-4 text-sm rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition disabled:opacity-50 font-medium"
                                                >
                                                    {actionLoading ? '...' : 'Unstake'}
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
                <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <h3 className="font-semibold mb-4">veNFT Locks</h3>
                    {loadingVeNFTs ? (
                        <div className="text-center py-12 text-gray-400">Loading locks...</div>
                    ) : veNFTs.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-4xl">🔒</span>
                            </div>
                            <p className="text-gray-400 mb-4">No WIND locked yet</p>
                            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                                Lock WIND to get veWIND voting power and earn protocol revenue
                            </p>
                            <Link href="/vote" className="btn-primary px-6 py-3 rounded-lg">Lock WIND</Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {veNFTs.map((nft, i) => {
                                const lockEndDate = new Date(Number(nft.lockEnd) * 1000);
                                const isPermanent = Number(nft.lockEnd) === 0 || Number(nft.lockEnd) > Date.now() / 1000 + 3600 * 24 * 365 * 3;
                                return (
                                    <div key={i} className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="font-semibold">veNFT #{nft.tokenId.toString()}</div>
                                            {isPermanent && (
                                                <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">Permanent</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <div className="text-xs text-gray-400">Locked Amount</div>
                                                <div className="font-medium">{parseFloat(formatUnits(nft.lockedAmount, 18)).toLocaleString()} WIND</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400">Voting Power</div>
                                                <div className="font-medium text-primary">{parseFloat(formatUnits(nft.votingPower, 18)).toFixed(2)} veWIND</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400">Unlock Date</div>
                                                <div className="font-medium">{isPermanent ? '∞ Permanent' : lockEndDate.toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Rewards Tab */}
            {activeTab === 'rewards' && (
                <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Total Pending */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Total Pending Rewards</h3>
                            <button
                                onClick={handleClaimAllRewards}
                                disabled={actionLoading || totalPendingRewards <= BigInt(0)}
                                className="btn-primary px-4 py-2 text-sm rounded-lg disabled:opacity-50"
                            >
                                {actionLoading ? 'Claiming...' : 'Claim All'}
                            </button>
                        </div>
                        <div className="text-4xl font-bold gradient-text mb-2">
                            {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)} WIND
                        </div>
                        <div className="text-sm text-gray-400">
                            From {stakedPositions.length} staked position{stakedPositions.length !== 1 ? 's' : ''}
                        </div>
                    </div>

                    {/* By Position */}
                    <div className="glass-card p-6">
                        <h3 className="font-semibold mb-4">Rewards by Position</h3>
                        {loadingStaked ? (
                            <div className="text-center py-8 text-gray-400">Loading rewards...</div>
                        ) : stakedPositions.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-400 mb-4">No staked positions earning rewards</p>
                                <p className="text-sm text-gray-500 mb-6">Stake your LP positions to start earning WIND</p>
                                <Link href="/liquidity" className="btn-primary px-6 py-2 rounded-lg">View Positions</Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {stakedPositions.map((pos, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                                        <div>
                                            <div className="font-medium">{pos.token0Symbol}/{pos.token1Symbol}</div>
                                            <div className="text-xs text-gray-400">
                                                Position #{pos.tokenId.toString()} · Gauge: {pos.gaugeAddress.slice(0, 8)}...
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="font-semibold text-green-400">
                                                    {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(6)} WIND
                                                </div>
                                                <div className="text-xs text-gray-400">pending</div>
                                            </div>
                                            <button
                                                onClick={() => handleClaimRewards(pos)}
                                                disabled={actionLoading || pos.pendingRewards <= BigInt(0)}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50"
                                            >
                                                {actionLoading ? '...' : 'Claim'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Increase Liquidity Modal */}
            {showIncreaseLiquidityModal && selectedPosition && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div
                        className="glass-card p-6 max-w-md w-full mx-4"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">Increase Liquidity</h3>
                            <button
                                onClick={() => setShowIncreaseLiquidityModal(false)}
                                className="text-gray-400 hover:text-white"
                            >✕</button>
                        </div>

                        <div className="p-4 rounded-lg bg-white/5 mb-6">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="flex -space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-secondary/30 flex items-center justify-center text-xs font-bold">
                                        {getTokenInfo(selectedPosition.token0).symbol.slice(0, 2)}
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold">
                                        {getTokenInfo(selectedPosition.token1).symbol.slice(0, 2)}
                                    </div>
                                </div>
                                <div>
                                    <div className="font-semibold">
                                        {getTokenInfo(selectedPosition.token0).symbol}/{getTokenInfo(selectedPosition.token1).symbol}
                                    </div>
                                    <div className="text-xs text-gray-400">Position #{selectedPosition.tokenId.toString()}</div>
                                </div>
                            </div>
                            <div className="text-sm text-gray-400">
                                Current Liquidity: {Number(selectedPosition.liquidity).toLocaleString()}
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm text-gray-400">
                                    {getTokenInfo(selectedPosition.token0).symbol} Amount
                                </label>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500">Balance: {balance0}</span>
                                    <button
                                        onClick={() => handleAmount0Change(balance0)}
                                        className="text-primary hover:text-primary/80 font-medium"
                                    >MAX</button>
                                </div>
                            </div>
                            <input
                                type="number"
                                value={amount0ToAdd}
                                onChange={(e) => handleAmount0Change(e.target.value)}
                                placeholder="0.0"
                                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 focus:border-primary/50 outline-none"
                            />
                        </div>

                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm text-gray-400">
                                    {getTokenInfo(selectedPosition.token1).symbol} Amount
                                </label>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500">Balance: {balance1}</span>
                                    <button
                                        onClick={() => handleAmount1Change(balance1)}
                                        className="text-primary hover:text-primary/80 font-medium"
                                    >MAX</button>
                                </div>
                            </div>
                            <input
                                type="number"
                                value={amount1ToAdd}
                                onChange={(e) => handleAmount1Change(e.target.value)}
                                placeholder="0.0"
                                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 focus:border-primary/50 outline-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowIncreaseLiquidityModal(false)}
                                className="flex-1 py-3 rounded-lg border border-white/20 hover:bg-white/5 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleIncreaseLiquidity}
                                disabled={actionLoading || (!amount0ToAdd && !amount1ToAdd)}
                                className="flex-1 py-3 rounded-lg btn-primary disabled:opacity-50"
                            >
                                {actionLoading ? 'Adding...' : 'Add Liquidity'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

