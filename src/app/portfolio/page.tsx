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

// Token symbols map
const TOKEN_SYMBOLS: Record<string, string> = {
    '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7': 'WSEI',
    '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392': 'USDC',
    '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1': 'USDC',
    '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598': 'YAKA',
    '0xd7b207b7c2c8fc32f7ab448d73cfb6be212f0dcf': 'YAKA',
    '0xb75d0b03c06a926e488e2659df1a861f860bd3d1': 'USDT',
};

export default function PortfolioPage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'staked' | 'locks' | 'rewards'>('overview');
    const [veNFTs, setVeNFTs] = useState<VeNFT[]>([]);
    const [stakedPositions, setStakedPositions] = useState<StakedPosition[]>([]);
    const [loadingVeNFTs, setLoadingVeNFTs] = useState(true);
    const [loadingStaked, setLoadingStaked] = useState(true);

    // Get CL and V2 positions
    const { positions: clPositions, positionCount: clCount, isLoading: clLoading } = useCLPositions();
    const { positions: v2Positions } = useV2Positions();

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
                                data: `0x17e710a8${address.slice(2).toLowerCase().padStart(64, '0')}` // stakedValues(address)
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

                        // Get pending rewards
                        const rewardsResult = await fetch('https://evm-rpc.sei-apis.com', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0', id: 1,
                                method: 'eth_call',
                                params: [{
                                    to: gaugeAddr,
                                    data: `0x0fb5a6b4${tokenId.toString(16).padStart(64, '0')}`
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
                            // Match stake page offsets: slot layout for positions()
                            token0 = '0x' + posData.slice(64 + 24, 128); // slot 1, last 40 chars
                            token1 = '0x' + posData.slice(128 + 24, 192); // slot 2, last 40 chars
                            tickSpacing = parseInt(posData.slice(192, 256), 16);
                            liquidity = BigInt('0x' + posData.slice(320, 384));

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

    const getTokenInfo = (addr: string) => {
        const token = DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === addr.toLowerCase());
        return { symbol: token?.symbol || addr.slice(0, 6), decimals: token?.decimals || 18 };
    };

    if (!isConnected) {
        return (
            <div className="container mx-auto px-6 py-20">
                <div className="glass-card max-w-md mx-auto p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-3xl">👛</span>
                    </div>
                    <h2 className="text-xl font-bold mb-2">Connect Wallet</h2>
                    <p className="text-gray-400">Connect your wallet to view your portfolio</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 py-8">
            {/* Header */}
            <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-2">
                    <span className="gradient-text">My Portfolio</span>
                </h1>
                <p className="text-gray-400">
                    Track your LP positions, locked YAKA, and rewards
                </p>
            </motion.div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <motion.div
                    className="glass-card p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="text-xs text-gray-400 mb-1">LP Positions</div>
                    <div className="text-2xl font-bold gradient-text">{clPositions.length + v2Positions.length}</div>
                    <div className="text-xs text-gray-500 mt-1">{clPositions.length} CL · {v2Positions.length} V2</div>
                </motion.div>

                <motion.div
                    className="glass-card p-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="text-xs text-gray-400 mb-1">Locked YAKA</div>
                    <div className="text-2xl font-bold text-primary">
                        {parseFloat(formatUnits(totalLockedYaka, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{veNFTs.length} veNFT{veNFTs.length !== 1 ? 's' : ''}</div>
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
                    <div className="text-xs text-gray-500 mt-1">YAKA to claim</div>
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
                    <div className="text-xs text-gray-500 mt-1">veYAKA</div>
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
                            <h3 className="font-semibold">Locked YAKA (veNFTs)</h3>
                            <Link href="/vote" className="text-sm text-primary hover:underline">Manage Locks →</Link>
                        </div>
                        {loadingVeNFTs ? (
                            <div className="text-center py-8 text-gray-400">Loading locks...</div>
                        ) : veNFTs.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-400 mb-4">No locked YAKA</p>
                                <Link href="/vote" className="btn-primary px-6 py-2 rounded-lg">Lock YAKA</Link>
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
                                                    {parseFloat(formatUnits(nft.lockedAmount, 18)).toLocaleString()} YAKA locked
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-primary">
                                                    {parseFloat(formatUnits(nft.votingPower, 18)).toFixed(2)} veYAKA
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
                            <Link href="/stake" className="text-sm text-primary hover:underline">Claim All →</Link>
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
                                                {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(4)} YAKA
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
                                        const feeMap: Record<number, string> = { 1: '0.01%', 50: '0.05%', 80: '0.25%', 100: '0.05%', 200: '0.30%' };
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
                            <Link href="/stake" className="text-sm text-primary hover:underline">Manage Stakes →</Link>
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
                                <div className="text-xs text-gray-500">YAKA rewards</div>
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
                                    Stake your LP positions to earn YAKA emissions
                                </p>
                                <Link href="/liquidity" className="btn-primary px-6 py-3 rounded-lg">View Your Positions</Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stakedPositions.map((pos, i) => {
                                    const feeMap: Record<number, string> = { 1: '0.01%', 50: '0.05%', 80: '0.25%', 100: '0.05%', 200: '0.30%' };
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
                                                        {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(6)} YAKA
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5">
                                                    <div className="text-xs text-gray-400 mb-1">Est. Daily</div>
                                                    <div className="font-semibold text-blue-400">
                                                        ~{dailyRewards.toFixed(4)} YAKA
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5">
                                                    <div className="text-xs text-gray-400 mb-1">Gauge</div>
                                                    <div className="font-mono text-xs truncate">
                                                        {pos.gaugeAddress.slice(0, 8)}...{pos.gaugeAddress.slice(-6)}
                                                    </div>
                                                </div>
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
                            <p className="text-gray-400 mb-4">No YAKA locked yet</p>
                            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                                Lock YAKA to get veYAKA voting power and earn protocol revenue
                            </p>
                            <Link href="/vote" className="btn-primary px-6 py-3 rounded-lg">Lock YAKA</Link>
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
                                                <div className="font-medium">{parseFloat(formatUnits(nft.lockedAmount, 18)).toLocaleString()} YAKA</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400">Voting Power</div>
                                                <div className="font-medium text-primary">{parseFloat(formatUnits(nft.votingPower, 18)).toFixed(2)} veYAKA</div>
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
                            <Link href="/stake" className="btn-primary px-4 py-2 text-sm rounded-lg">Claim All</Link>
                        </div>
                        <div className="text-4xl font-bold gradient-text mb-2">
                            {parseFloat(formatUnits(totalPendingRewards, 18)).toFixed(4)} YAKA
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
                                <p className="text-sm text-gray-500 mb-6">Stake your LP positions to start earning YAKA</p>
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
                                        <div className="text-right">
                                            <div className="font-semibold text-green-400">
                                                {parseFloat(formatUnits(pos.pendingRewards, 18)).toFixed(6)} YAKA
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
        </div>
    );
}
