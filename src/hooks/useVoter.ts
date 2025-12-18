'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';

// Voter ABI
const VOTER_ABI = [
    {
        inputs: [],
        name: 'length',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'index', type: 'uint256' }],
        name: 'pools',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'pool', type: 'address' }],
        name: 'gauges',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'pool', type: 'address' }],
        name: 'weights',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalWeight',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'gauge', type: 'address' }],
        name: 'isAlive',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'gauge', type: 'address' }],
        name: 'gaugeToFees',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'gauge', type: 'address' }],
        name: 'gaugeToBribe',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: '_tokenId', type: 'uint256' },
            { name: '_poolVote', type: 'address[]' },
            { name: '_weights', type: 'uint256[]' },
        ],
        name: 'vote',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }],
        name: 'reset',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'pool', type: 'address' },
        ],
        name: 'votes',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'usedWeights',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'lastVoted',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Pool ABI (for getting token info)
const POOL_ABI = [
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
] as const;

const ERC20_ABI = [
    {
        inputs: [],
        name: 'symbol',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Known token symbols and decimals
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
    '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7': { symbol: 'WSEI', decimals: 18 },
    '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392': { symbol: 'USDC', decimals: 6 },
    '0xd7b207b7c2c8fc32f7ab448d73cfb6be212f0dcf': { symbol: 'YAKA', decimals: 18 },
    '0x0000000000000000000000000000000000000000': { symbol: 'SEI', decimals: 18 },
    '0xb75d0b03c06a926e488e2659df1a861f860bd3d1': { symbol: 'USDT', decimals: 6 },
};

// Helper to get token symbol (backwards compatible)
const getTokenSymbol = (address: string): string => {
    return KNOWN_TOKENS[address.toLowerCase()]?.symbol || address.slice(0, 6);
};

export interface RewardToken {
    address: Address;
    symbol: string;
    amount: bigint;
    decimals: number;
}

export interface GaugeInfo {
    pool: Address;
    gauge: Address;
    token0: Address;
    token1: Address;
    symbol0: string;
    symbol1: string;
    poolType: 'V2' | 'CL';
    isStable: boolean;
    weight: bigint;
    weightPercent: number;
    isAlive: boolean;
    feeReward: Address;
    bribeReward: Address;
    rewardTokens: RewardToken[];
}

export function useVoter() {
    const { address, isConnected } = useAccount();
    const [gauges, setGauges] = useState<GaugeInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Get pool count
    const { data: poolCount, refetch: refetchPoolCount } = useReadContract({
        address: V2_CONTRACTS.Voter as Address,
        abi: VOTER_ABI,
        functionName: 'length',
    });

    // Get total weight
    const { data: totalWeight, refetch: refetchTotalWeight } = useReadContract({
        address: V2_CONTRACTS.Voter as Address,
        abi: VOTER_ABI,
        functionName: 'totalWeight',
    });

    // Fetch all pools and their info
    const fetchPools = useCallback(async () => {
        if (!poolCount || poolCount === BigInt(0)) {
            setGauges([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const poolDataList: GaugeInfo[] = [];
            const count = Number(poolCount);
            const totalW = totalWeight || BigInt(1);

            for (let i = 0; i < count; i++) {
                try {
                    // Fetch pool address using pools(uint256) - selector 0xac4afa38
                    const poolRes = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.Voter,
                                data: `0xac4afa38${i.toString(16).padStart(64, '0')}`, // pools(uint256)
                            }, 'latest'],
                        }),
                    });
                    const poolData = await poolRes.json();
                    const pool = ('0x' + poolData.result.slice(-40)) as Address;

                    // Fetch gauge
                    const gaugeRes = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 2,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.Voter,
                                data: `0xb9a09fd5${pool.slice(2).padStart(64, '0')}`, // gauges(address)
                            }, 'latest'],
                        }),
                    });
                    const gaugeData = await gaugeRes.json();
                    const gauge = ('0x' + gaugeData.result.slice(-40)) as Address;

                    // Fetch weight  
                    const weightRes = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 3,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.Voter,
                                data: `0xa7cac846${pool.slice(2).padStart(64, '0')}`, // weights(address)
                            }, 'latest'],
                        }),
                    });
                    const weightData = await weightRes.json();
                    const weight = BigInt(weightData.result || '0x0');

                    // Fetch token0, token1
                    const token0Res = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 4,
                            method: 'eth_call',
                            params: [{ to: pool, data: '0x0dfe1681' }, 'latest'], // token0()
                        }),
                    });
                    const token0Data = await token0Res.json();
                    const token0 = ('0x' + token0Data.result.slice(-40)) as Address;

                    const token1Res = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 5,
                            method: 'eth_call',
                            params: [{ to: pool, data: '0xd21220a7' }, 'latest'], // token1()
                        }),
                    });
                    const token1Data = await token1Res.json();
                    const token1 = ('0x' + token1Data.result.slice(-40)) as Address;

                    // Check if CL pool (has tickSpacing) or V2 (has stable)
                    let poolType: 'V2' | 'CL' = 'V2';
                    let isStable = false;
                    try {
                        const tickRes = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 6,
                                method: 'eth_call',
                                params: [{ to: pool, data: '0xd0c93a7c' }, 'latest'], // tickSpacing()
                            }),
                        });
                        const tickData = await tickRes.json();
                        if (tickData.result && !tickData.error) {
                            poolType = 'CL';
                        }
                    } catch {
                        // Not CL pool
                    }

                    if (poolType === 'V2') {
                        try {
                            const stableRes = await fetch('https://evm-rpc.sei-apis.com', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    jsonrpc: '2.0',
                                    id: 7,
                                    method: 'eth_call',
                                    params: [{ to: pool, data: '0x22be3de1' }, 'latest'], // stable()
                                }),
                            });
                            const stableData = await stableRes.json();
                            isStable = stableData.result === '0x0000000000000000000000000000000000000000000000000000000000000001';
                        } catch {
                            isStable = false;
                        }
                    }

                    // Get symbols using helper
                    const symbol0 = getTokenSymbol(token0);
                    const symbol1 = getTokenSymbol(token1);

                    // Check if alive - isAlive(address) selector 0x1703e5f9
                    const aliveRes = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 8,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.Voter,
                                data: `0x1703e5f9${gauge.slice(2).padStart(64, '0')}`, // isAlive(address)
                            }, 'latest'],
                        }),
                    });
                    const aliveData = await aliveRes.json();
                    const isAlive = aliveData.result === '0x0000000000000000000000000000000000000000000000000000000000000001';

                    // Get fee and bribe rewards - gaugeToFees(address) selector 0xc4f08165
                    let feeReward: Address = '0x0000000000000000000000000000000000000000';
                    let bribeReward: Address = '0x0000000000000000000000000000000000000000';

                    try {
                        const feeRes = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 9,
                                method: 'eth_call',
                                params: [{
                                    to: V2_CONTRACTS.Voter,
                                    data: `0xc4f08165${gauge.slice(2).padStart(64, '0')}`, // gaugeToFees(address)
                                }, 'latest'],
                            }),
                        });
                        const feeData = await feeRes.json();
                        if (feeData.result) {
                            feeReward = ('0x' + feeData.result.slice(-40)) as Address;
                        }
                    } catch {
                        // Ignore fee reward fetch errors
                    }

                    try {
                        const bribeRes = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 10,
                                method: 'eth_call',
                                params: [{
                                    to: V2_CONTRACTS.Voter,
                                    data: `0x929c8dcd${gauge.slice(2).padStart(64, '0')}`, // gaugeToBribe(address)
                                }, 'latest'],
                            }),
                        });
                        const bribeData = await bribeRes.json();
                        if (bribeData.result) {
                            bribeReward = ('0x' + bribeData.result.slice(-40)) as Address;
                        }
                    } catch {
                        // Ignore bribe reward fetch errors
                    }

                    // Fetch reward tokens from bribe contract
                    const rewardTokens: RewardToken[] = [];
                    if (bribeReward !== '0x0000000000000000000000000000000000000000') {
                        try {
                            // Get rewards list length - rewardsListLength() selector 0xe5748213
                            const lengthRes = await fetch('https://evm-rpc.sei-apis.com', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    jsonrpc: '2.0', id: 11,
                                    method: 'eth_call',
                                    params: [{ to: bribeReward, data: '0xe5748213' }, 'latest'],
                                }),
                            }).then(r => r.json());

                            const rewardsLength = lengthRes.result ? parseInt(lengthRes.result, 16) : 0;

                            // Current epoch start (Thursday 00:00 UTC)
                            const WEEK = 604800;
                            const currentEpoch = Math.floor(Date.now() / 1000 / WEEK) * WEEK;

                            // Fetch each reward token and its amount
                            for (let r = 0; r < Math.min(rewardsLength, 5); r++) {
                                // rewards(uint256) selector 0xf301af42
                                const tokenRes = await fetch('https://evm-rpc.sei-apis.com', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        jsonrpc: '2.0', id: 12,
                                        method: 'eth_call',
                                        params: [{ to: bribeReward, data: `0xf301af42${r.toString(16).padStart(64, '0')}` }, 'latest'],
                                    }),
                                }).then(res => res.json());

                                if (!tokenRes.result) continue;
                                const rewardTokenAddr = ('0x' + tokenRes.result.slice(-40)) as Address;
                                if (rewardTokenAddr === '0x0000000000000000000000000000000000000000') continue;

                                // Get token balance in bribe contract - balanceOf(address) on the token
                                const balRes = await fetch('https://evm-rpc.sei-apis.com', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        jsonrpc: '2.0', id: 13,
                                        method: 'eth_call',
                                        params: [{
                                            to: rewardTokenAddr,
                                            data: `0x70a08231${bribeReward.slice(2).padStart(64, '0')}`
                                        }, 'latest'],
                                    }),
                                }).then(res => res.json());

                                const balance = balRes.result ? BigInt(balRes.result) : BigInt(0);
                                if (balance > BigInt(0)) {
                                    const tokenInfo = KNOWN_TOKENS[rewardTokenAddr.toLowerCase()] || { symbol: rewardTokenAddr.slice(0, 6), decimals: 18 };
                                    rewardTokens.push({
                                        address: rewardTokenAddr,
                                        symbol: tokenInfo.symbol,
                                        amount: balance,
                                        decimals: tokenInfo.decimals,
                                    });
                                }
                            }
                        } catch (e) {
                            console.error('Error fetching bribe rewards:', e);
                        }
                    }

                    const weightPercent = totalW > BigInt(0)
                        ? Number((weight * BigInt(10000)) / totalW) / 100
                        : 0;

                    poolDataList.push({
                        pool,
                        gauge,
                        token0,
                        token1,
                        symbol0,
                        symbol1,
                        poolType,
                        isStable,
                        weight,
                        weightPercent,
                        isAlive,
                        feeReward,
                        bribeReward,
                        rewardTokens,
                    });
                } catch (err) {
                    console.error(`Error fetching pool ${i}:`, err);
                }
            }

            setGauges(poolDataList);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch pools');
        }
        setIsLoading(false);
    }, [poolCount, totalWeight]);

    // Fetch on load
    useEffect(() => {
        fetchPools();
    }, [fetchPools]);

    // Vote function
    const vote = async (tokenId: bigint, poolVotes: { pool: Address; weight: number }[]) => {
        if (!address || poolVotes.length === 0) return;

        setError(null);
        try {
            const pools = poolVotes.map(v => v.pool);
            const weights = poolVotes.map(v => BigInt(v.weight));

            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'vote',
                args: [tokenId, pools, weights],
            });

            await refetchPoolCount();
            await refetchTotalWeight();
            await fetchPools();

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Vote failed');
            return null;
        }
    };

    // Reset votes
    const resetVotes = async (tokenId: bigint) => {
        if (!address) return;

        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'reset',
                args: [tokenId],
            });

            await refetchPoolCount();
            await refetchTotalWeight();
            await fetchPools();

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Reset failed');
            return null;
        }
    };

    return {
        gauges,
        totalWeight: totalWeight || BigInt(0),
        poolCount: Number(poolCount || 0),
        isLoading,
        error,
        vote,
        resetVotes,
        refetch: fetchPools,
    };
}
