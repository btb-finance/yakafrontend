'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { Address, formatUnits } from 'viem';
import Link from 'next/link';
import { CL_CONTRACTS, V2_CONTRACTS } from '@/config/contracts';
import { Tooltip } from '@/components/common/Tooltip';
import { InfoCard, EmptyState } from '@/components/common/InfoCard';

// CLGauge ABI for staking operations
const CL_GAUGE_ABI = [
    {
        inputs: [{ name: 'depositor', type: 'address' }],
        name: 'stakedValues',
        outputs: [{ name: '', type: 'uint256[]' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'depositor', type: 'address' }],
        name: 'stakedLength',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        name: 'rewards',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'rewardRate',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'rewardToken',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
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
        inputs: [{ name: 'account', type: 'address' }],
        name: 'getReward',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'pool',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

interface StakedPosition {
    tokenId: bigint;
    gaugeAddress: string;
    poolAddress: string;
    token0: string;
    token1: string;
    token0Symbol: string;
    token1Symbol: string;
    tickSpacing: number;
    liquidity: bigint;
    rewards: bigint;
    rewardRate: bigint;
}

// Known token symbols
const TOKEN_SYMBOLS: Record<string, string> = {
    '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7': 'WSEI',
    '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392': 'USDC',
    '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1': 'USDC',
    '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598': 'YAKA',
};

// Known pools with gauges
const KNOWN_POOLS = [
    '0x98daf006cb4c338d9c527ec54e0cee3308ccff47', // USDC/WSEI 0.05%
    '0x6957f330590654856BBaE2762b0c2F0E7A124eD8', // USDC/WSEI 0.30%
];

export default function StakePage() {
    const { isConnected, address } = useAccount();
    const [stakedPositions, setStakedPositions] = useState<StakedPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const { writeContractAsync } = useWriteContract();

    // Fetch staked positions
    useEffect(() => {
        const fetchStakedPositions = async () => {
            if (!address) {
                setStakedPositions([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            const positions: StakedPosition[] = [];

            try {
                // Check each known pool for a gauge
                for (const poolAddress of KNOWN_POOLS) {
                    // Get gauge address for pool
                    const gaugeResult = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_call',
                            params: [{
                                to: V2_CONTRACTS.Voter,
                                data: `0xb9a09fd5${poolAddress.slice(2).toLowerCase().padStart(64, '0')}`
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    const gaugeAddress = '0x' + gaugeResult.result?.slice(26);
                    if (!gaugeAddress || gaugeAddress === '0x0000000000000000000000000000000000000000') continue;

                    // Get staked token IDs for this user
                    const stakedResult = await fetch('https://evm-rpc.sei-apis.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_call',
                            params: [{
                                to: gaugeAddress,
                                data: `0x17e710a8${address.slice(2).toLowerCase().padStart(64, '0')}` // stakedValues(address)
                            }, 'latest']
                        })
                    }).then(r => r.json());

                    if (!stakedResult.result || stakedResult.result === '0x') continue;

                    // Parse the array of token IDs
                    const data = stakedResult.result.slice(2);
                    const offset = parseInt(data.slice(0, 64), 16);
                    const length = parseInt(data.slice(64, 128), 16);

                    for (let i = 0; i < length; i++) {
                        const tokenIdHex = data.slice(128 + i * 64, 128 + (i + 1) * 64);
                        const tokenId = BigInt('0x' + tokenIdHex);

                        // Get position details
                        const positionResult = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: CL_CONTRACTS.NonfungiblePositionManager,
                                    data: `0x99fbab88${tokenId.toString(16).padStart(64, '0')}` // positions(uint256)
                                }, 'latest']
                            })
                        }).then(r => r.json());

                        if (!positionResult.result) continue;

                        const posData = positionResult.result.slice(2);
                        const token0 = '0x' + posData.slice(64 + 24, 128);
                        const token1 = '0x' + posData.slice(128 + 24, 192);
                        const tickSpacing = parseInt(posData.slice(192, 256), 16);
                        const liquidityHex = posData.slice(320, 384);
                        const liquidity = BigInt('0x' + liquidityHex);

                        // Get rewards for this token
                        const rewardsResult = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: gaugeAddress,
                                    data: `0x0fb5a6b4${tokenId.toString(16).padStart(64, '0')}` // rewards(uint256)
                                }, 'latest']
                            })
                        }).then(r => r.json());

                        const rewards = rewardsResult.result ? BigInt(rewardsResult.result) : BigInt(0);

                        // Get reward rate
                        const rateResult = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: gaugeAddress,
                                    data: '0x7b0a47ee' // rewardRate()
                                }, 'latest']
                            })
                        }).then(r => r.json());

                        const rewardRate = rateResult.result ? BigInt(rateResult.result) : BigInt(0);

                        positions.push({
                            tokenId,
                            gaugeAddress,
                            poolAddress,
                            token0,
                            token1,
                            token0Symbol: TOKEN_SYMBOLS[token0.toLowerCase()] || token0.slice(0, 8),
                            token1Symbol: TOKEN_SYMBOLS[token1.toLowerCase()] || token1.slice(0, 8),
                            tickSpacing,
                            liquidity,
                            rewards,
                            rewardRate,
                        });
                    }
                }
            } catch (err) {
                console.error('Error fetching staked positions:', err);
            }

            setStakedPositions(positions);
            setLoading(false);
        };

        fetchStakedPositions();
    }, [address]);

    // Claim rewards
    const handleClaimRewards = async (gaugeAddress: string) => {
        if (!address) return;
        setActionLoading('claim-' + gaugeAddress);
        try {
            const hash = await writeContractAsync({
                address: gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'getReward',
                args: [address],
            });
            setTxHash(hash);
        } catch (err) {
            console.error('Claim rewards error:', err);
        }
        setActionLoading(null);
    };

    // Withdraw (unstake) position
    const handleWithdraw = async (gaugeAddress: string, tokenId: bigint) => {
        setActionLoading('withdraw-' + tokenId.toString());
        try {
            const hash = await writeContractAsync({
                address: gaugeAddress as Address,
                abi: CL_GAUGE_ABI,
                functionName: 'withdraw',
                args: [tokenId],
            });
            setTxHash(hash);
            // Refresh positions
            setStakedPositions(prev => prev.filter(p => p.tokenId !== tokenId));
        } catch (err) {
            console.error('Withdraw error:', err);
        }
        setActionLoading(null);
    };

    // Format reward rate to daily rewards
    const formatDailyRewards = (rate: bigint) => {
        if (rate === BigInt(0)) return '0';
        const daily = rate * BigInt(86400);
        return parseFloat(formatUnits(daily, 18)).toFixed(2);
    };

    // Calculate total rewards
    const totalRewards = stakedPositions.reduce((sum, p) => sum + p.rewards, BigInt(0));
    const formattedTotalRewards = parseFloat(formatUnits(totalRewards, 18)).toFixed(4);

    const feeMap: Record<number, string> = { 1: '0.01%', 50: '0.05%', 80: '0.25%', 100: '0.05%', 200: '0.30%' };

    return (
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Earn</span> Rewards
                </h1>
                <p className="text-gray-400 max-w-xl mx-auto">
                    Stake your liquidity positions to earn YAKA tokens. The more you stake, the more you earn!
                </p>
            </motion.div>

            {/* How It Works - Visual Flow */}
            <motion.div
                className="mb-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="glass-card p-6">
                    <h3 className="text-center text-sm font-medium text-gray-400 mb-6">How Staking Works</h3>
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <div className="icon-container icon-container-sm">💧</div>
                            <div>
                                <div className="text-sm font-medium">Add Liquidity</div>
                                <div className="text-xs text-gray-500">Get LP positions</div>
                            </div>
                        </div>
                        <div className="w-12 h-0.5 bg-gradient-to-r from-primary to-secondary hidden md:block" />
                        <div className="flex items-center gap-3">
                            <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>📥</div>
                            <div>
                                <div className="text-sm font-medium">Stake Positions</div>
                                <div className="text-xs text-gray-500">In reward pools</div>
                            </div>
                        </div>
                        <div className="w-12 h-0.5 bg-gradient-to-r from-primary to-secondary hidden md:block" />
                        <div className="flex items-center gap-3">
                            <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}>💰</div>
                            <div>
                                <div className="text-sm font-medium">Earn YAKA</div>
                                <div className="text-xs text-gray-500">Claim anytime</div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* TX Hash Display */}
            {txHash && (
                <motion.div
                    className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                >
                    <div className="flex items-center gap-2 text-green-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-medium">Transaction submitted!</span>
                    </div>
                    <a
                        href={`https://seitrace.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-500 text-sm break-all hover:underline mt-1 block"
                    >
                        View on SeiTrace →
                    </a>
                </motion.div>
            )}

            {!isConnected ? (
                <EmptyState
                    icon="🔗"
                    title="Connect Your Wallet"
                    description="Connect your wallet to view and manage your staked positions"
                />
            ) : loading ? (
                <div className="text-center py-20">
                    <div className="inline-flex items-center gap-3 text-gray-400">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Loading your positions...
                    </div>
                </div>
            ) : stakedPositions.length === 0 ? (
                <EmptyState
                    icon="📊"
                    title="No Staked Positions"
                    description="Add liquidity to a pool first, then stake your position here to start earning YAKA rewards"
                    action={{
                        label: 'Add Liquidity',
                        onClick: () => window.location.href = '/liquidity'
                    }}
                />
            ) : (
                <div className="space-y-6">
                    {/* Rewards Summary */}
                    <motion.div
                        className="glass-card p-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-4 rounded-xl bg-white/5">
                                <div className="text-xs text-gray-400 mb-2">Staked Positions</div>
                                <div className="text-3xl font-bold text-white">{stakedPositions.length}</div>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                <div className="text-xs text-gray-400 mb-2">Total Rewards Earned</div>
                                <div className="text-3xl font-bold text-green-400">{formattedTotalRewards}</div>
                                <div className="text-xs text-green-500">YAKA</div>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-white/5">
                                <div className="text-xs text-gray-400 mb-2">
                                    <Tooltip content="Reward pools distribute YAKA tokens to stakers based on voting power">
                                        Active Reward Pools
                                    </Tooltip>
                                </div>
                                <div className="text-3xl font-bold text-white">
                                    {new Set(stakedPositions.map(p => p.gaugeAddress)).size}
                                </div>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-white/5">
                                <div className="text-xs text-gray-400 mb-2">Daily YAKA Rate</div>
                                <div className="text-3xl font-bold text-primary">
                                    {formatDailyRewards(stakedPositions[0]?.rewardRate || BigInt(0))}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Staked Positions List */}
                    <motion.div
                        className="glass-card p-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <span className="icon-container icon-container-sm">📊</span>
                            Your Staked Positions
                        </h2>
                        <div className="space-y-4">
                            {stakedPositions.map((pos, i) => (
                                <motion.div
                                    key={i}
                                    className="p-5 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                        <div className="flex items-center gap-4">
                                            {/* Token Pair Icons */}
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-bold text-white">
                                                    {pos.token0Symbol[0]}
                                                </div>
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center font-bold text-white absolute left-6 top-0 border-2 border-[var(--bg-primary)]">
                                                    {pos.token1Symbol[0]}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="font-semibold text-lg">
                                                    {pos.token0Symbol}/{pos.token1Symbol}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                                                        {feeMap[pos.tickSpacing] || `${pos.tickSpacing}ts`} Fee
                                                    </span>
                                                    <span className="text-gray-500">Position #{pos.tokenId.toString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Rewards Display */}
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <div className="text-xs text-gray-400 mb-1">Pending Rewards</div>
                                                <div className="reward-badge">
                                                    <span className="text-lg font-bold">{parseFloat(formatUnits(pos.rewards, 18)).toFixed(4)}</span>
                                                    <span>YAKA</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 pt-4 border-t border-white/5">
                                        <motion.button
                                            onClick={() => handleClaimRewards(pos.gaugeAddress)}
                                            disabled={pos.rewards === BigInt(0) || !!actionLoading}
                                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 font-medium disabled:opacity-50 hover:from-green-500/30 hover:to-emerald-500/30 transition-all flex items-center justify-center gap-2"
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                        >
                                            {actionLoading === 'claim-' + pos.gaugeAddress ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                                    Claiming...
                                                </>
                                            ) : (
                                                <>
                                                    💰 Claim Rewards
                                                </>
                                            )}
                                        </motion.button>
                                        <motion.button
                                            onClick={() => handleWithdraw(pos.gaugeAddress, pos.tokenId)}
                                            disabled={!!actionLoading}
                                            className="flex-1 py-3 rounded-xl bg-white/5 text-gray-300 font-medium disabled:opacity-50 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                        >
                                            {actionLoading === 'withdraw-' + pos.tokenId.toString() ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                                    Unstaking...
                                                </>
                                            ) : (
                                                <>
                                                    📤 Unstake Position
                                                </>
                                            )}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Helpful Info */}
                    <motion.div
                        className="grid grid-cols-1 md:grid-cols-3 gap-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <InfoCard
                            icon="💡"
                            title="Rewards Accumulate"
                            description="Your YAKA rewards grow every block. Claim whenever you want - there's no deadline!"
                        />
                        <InfoCard
                            icon="🗳️"
                            title="Powered by Votes"
                            description="Reward rates depend on how veYAKA holders vote. Popular pools get more rewards."
                            variant="default"
                        />
                        <InfoCard
                            icon="📈"
                            title="Keep Earning Fees"
                            description="Staked positions still earn trading fees! You get rewards on top of fee earnings."
                            variant="success"
                        />
                    </motion.div>
                </div>
            )}
        </div>
    );
}
