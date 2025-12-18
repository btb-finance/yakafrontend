'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { useVeYAKA, LOCK_DURATIONS } from '@/hooks/useVeYAKA';
import { useTokenBalance } from '@/hooks/useToken';
import { useVoter } from '@/hooks/useVoter';
import { YAKA } from '@/config/tokens';
import { Tooltip } from '@/components/common/Tooltip';
import { InfoCard, EmptyState } from '@/components/common/InfoCard';
import { LockVoteEarnSteps } from '@/components/common/StepIndicator';

export default function VotePage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'lock' | 'vote' | 'rewards'>('lock');

    // Lock state
    const [lockAmount, setLockAmount] = useState('');
    const [lockDuration, setLockDuration] = useState<keyof typeof LOCK_DURATIONS>('1Y');
    const [txHash, setTxHash] = useState<string | null>(null);

    // Vote state
    const [selectedVeNFT, setSelectedVeNFT] = useState<bigint | null>(null);
    const [voteWeights, setVoteWeights] = useState<Record<string, number>>({});
    const [isVoting, setIsVoting] = useState(false);

    // Hooks
    const {
        positions,
        veNFTCount,
        createLock,
        increaseAmount,
        extendLock,
        withdraw,
        claimRebases,
        isLoading,
        error,
        refetch,
    } = useVeYAKA();

    const {
        gauges,
        totalWeight,
        poolCount,
        isLoading: isLoadingGauges,
        error: voterError,
        vote: castVote,
        resetVotes,
        refetch: refetchGauges,
    } = useVoter();

    const { balance: yakaBalance, formatted: formattedYakaBalance } = useTokenBalance(YAKA);

    // Auto-select first veNFT when positions load
    useEffect(() => {
        if (positions.length > 0 && selectedVeNFT === null) {
            setSelectedVeNFT(positions[0].tokenId);
        }
    }, [positions, selectedVeNFT]);

    // Calculate estimated voting power
    const estimatedVotingPower = lockAmount && parseFloat(lockAmount) > 0
        ? (parseFloat(lockAmount) * LOCK_DURATIONS[lockDuration] / LOCK_DURATIONS['4Y']).toFixed(4)
        : '0';

    // Calculate unlock date
    const unlockDate = new Date(Date.now() + LOCK_DURATIONS[lockDuration] * 1000);

    // Calculate total claimable
    const totalClaimable = positions.reduce((acc, p) => acc + p.claimable, BigInt(0));

    // Calculate total vote weight
    const totalVoteWeight = Object.values(voteWeights).reduce((acc, w) => acc + w, 0);

    // Determine current step for step indicator
    const getCurrentStep = () => {
        if (positions.length === 0) return 0; // Lock step
        if (gauges.length > 0) return 1; // Vote step
        return 2; // Earn step
    };

    const handleCreateLock = async () => {
        if (!lockAmount || parseFloat(lockAmount) <= 0) return;
        const result = await createLock(lockAmount, LOCK_DURATIONS[lockDuration]);
        if (result) {
            setTxHash(result.hash);
            setLockAmount('');
        }
    };

    const handleWithdraw = async (tokenId: bigint) => {
        const result = await withdraw(tokenId);
        if (result) setTxHash(result.hash);
    };

    const handleClaimRebases = async (tokenId: bigint) => {
        const result = await claimRebases(tokenId);
        if (result) setTxHash(result.hash);
    };

    const handleVote = async () => {
        if (!selectedVeNFT || totalVoteWeight === 0) return;
        setIsVoting(true);
        const poolVotes = Object.entries(voteWeights)
            .filter(([_, weight]) => weight > 0)
            .map(([pool, weight]) => ({ pool: pool as Address, weight }));

        const result = await castVote(selectedVeNFT, poolVotes);
        if (result) {
            setTxHash(result.hash);
            setVoteWeights({});
        }
        setIsVoting(false);
    };

    const handleResetVotes = async () => {
        if (!selectedVeNFT) return;
        setIsVoting(true);
        const result = await resetVotes(selectedVeNFT);
        if (result) setTxHash(result.hash);
        setIsVoting(false);
    };

    const updateVoteWeight = (pool: string, weight: number) => {
        setVoteWeights(prev => ({
            ...prev,
            [pool]: Math.max(0, weight),
        }));
    };

    const tabConfig = [
        { key: 'lock' as const, label: 'Lock YAKA', icon: '🔐', description: 'Get voting power' },
        { key: 'vote' as const, label: 'Vote', icon: '🗳️', description: 'Choose pools' },
        { key: 'rewards' as const, label: 'Rewards', icon: '💰', description: 'Claim earnings' },
    ];

    return (
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Vote</span> & Earn
                </h1>
                <p className="text-gray-400 max-w-xl mx-auto">
                    Lock your YAKA tokens to get voting power. Vote for pools to direct weekly rewards, and earn your share of fees and bonuses!
                </p>
            </motion.div>

            {/* Visual Step Flow */}
            <motion.div
                className="mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <div className="glass-card p-6">
                    <LockVoteEarnSteps currentStep={getCurrentStep()} />
                </div>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
                <motion.div
                    className="glass-card p-5 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="text-xs text-gray-400 mb-2">Your YAKA Balance</div>
                    <div className="text-2xl font-bold">{formattedYakaBalance || '0'}</div>
                </motion.div>
                <motion.div
                    className="glass-card p-5 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <div className="text-xs text-gray-400 mb-2">
                        <Tooltip content="Voting Power NFTs represent your locked YAKA and give you the right to vote on pool rewards">
                            Your Voting NFTs
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold">{veNFTCount}</div>
                </motion.div>
                <motion.div
                    className="glass-card p-5 text-center bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="text-xs text-gray-400 mb-2">
                        <Tooltip content="Rebase rewards compensate you for token inflation, keeping your voting power strong">
                            Claimable Rewards
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                        {formatUnits(totalClaimable, 18).slice(0, 8)} <span className="text-sm">YAKA</span>
                    </div>
                </motion.div>
            </div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
                <div className="glass p-1.5 rounded-2xl inline-flex gap-1">
                    {tabConfig.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-5 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${activeTab === tab.key
                                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <span className="text-lg">{tab.icon}</span>
                            <span className="hidden md:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-md mx-auto text-center flex items-center gap-2 justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Success Display */}
            {txHash && (
                <motion.div
                    className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm max-w-md mx-auto text-center"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                >
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Transaction submitted!
                    </div>
                    <a href={`https://seitrace.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline text-sm">
                        View on SeiTrace →
                    </a>
                </motion.div>
            )}

            {/* Lock Tab */}
            {activeTab === 'lock' && (
                <motion.div className="max-w-lg mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-2">Lock YAKA to Get Voting Power</h2>
                        <p className="text-sm text-gray-400 mb-6">
                            The longer you lock, the more voting power you receive. Locked tokens earn rewards automatically!
                        </p>

                        {/* YAKA Amount */}
                        <div className="mb-5">
                            <label className="text-sm text-gray-400 mb-2 block">Amount to Lock</label>
                            <div className="token-input-row">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-gray-400">Available: {formattedYakaBalance || '0'} YAKA</span>
                                    <button
                                        onClick={() => setLockAmount(formattedYakaBalance || '0')}
                                        className="text-sm text-primary hover:text-primary/80 font-medium"
                                    >
                                        MAX
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={lockAmount}
                                    onChange={(e) => setLockAmount(e.target.value)}
                                    placeholder="0.0"
                                    className="w-full bg-transparent text-2xl font-medium outline-none placeholder-gray-600"
                                />
                            </div>
                        </div>

                        {/* Lock Duration */}
                        <div className="mb-6">
                            <label className="text-sm text-gray-400 mb-3 block">Lock Duration</label>
                            <div className="grid grid-cols-7 gap-2">
                                {(Object.keys(LOCK_DURATIONS) as Array<keyof typeof LOCK_DURATIONS>).map((duration) => (
                                    <button
                                        key={duration}
                                        onClick={() => setLockDuration(duration)}
                                        className={`py-3 rounded-xl text-sm font-medium transition-all ${lockDuration === duration
                                            ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                                            : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                            }`}
                                    >
                                        {duration}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Longer locks = more voting power (up to 4x multiplier)
                            </p>
                        </div>

                        {/* Preview Box */}
                        <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 mb-6">
                            <h4 className="text-sm font-medium text-gray-300 mb-4">What You&apos;ll Get</h4>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Voting Power</span>
                                    <span className="font-semibold text-primary">{estimatedVotingPower} veYAKA</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Unlock Date</span>
                                    <span>{unlockDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Power Multiplier</span>
                                    <span className="text-green-400 font-medium">{(LOCK_DURATIONS[lockDuration] / LOCK_DURATIONS['4Y'] * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>

                        <motion.button
                            onClick={handleCreateLock}
                            disabled={!isConnected || isLoading || !lockAmount || parseFloat(lockAmount) <= 0}
                            className="w-full btn-gradient py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                        >
                            {isLoading ? 'Creating Lock...' : !isConnected ? 'Connect Wallet' : 'Lock YAKA & Get Voting Power'}
                        </motion.button>
                    </div>

                    {/* Existing Positions */}
                    {positions.length > 0 && (
                        <div className="glass-card p-6 mt-6">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <span className="icon-container icon-container-sm">🎫</span>
                                Your Voting Power NFTs
                            </h3>
                            <div className="space-y-3">
                                {positions.map((position) => {
                                    const isExpired = position.end < BigInt(Math.floor(Date.now() / 1000)) && !position.isPermanent;
                                    const endDate = new Date(Number(position.end) * 1000);

                                    return (
                                        <div key={position.tokenId.toString()} className="p-4 rounded-xl bg-white/5 border border-white/10">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="text-sm text-gray-400 mb-1">veYAKA #{position.tokenId.toString()}</div>
                                                    <div className="text-xl font-bold">{parseFloat(formatUnits(position.amount, 18)).toFixed(2)} YAKA</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {position.isPermanent ? (
                                                            <span className="text-primary">∞ Permanent Lock</span>
                                                        ) : isExpired ? (
                                                            <span className="text-yellow-400">🔓 Unlocked</span>
                                                        ) : (
                                                            <>Unlocks {endDate.toLocaleDateString()}</>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm text-gray-400 mb-1">Voting Power</div>
                                                    <div className="text-lg font-bold text-primary">{parseFloat(formatUnits(position.votingPower, 18)).toFixed(2)}</div>
                                                    {isExpired && (
                                                        <button
                                                            onClick={() => handleWithdraw(position.tokenId)}
                                                            className="mt-2 text-xs px-3 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                                                        >
                                                            Withdraw
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Vote Tab */}
            {activeTab === 'vote' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    {!isConnected ? (
                        <EmptyState
                            icon="🔗"
                            title="Connect Your Wallet"
                            description="Connect your wallet to vote on pool rewards"
                        />
                    ) : gauges.length === 0 ? (
                        <EmptyState
                            icon="🗳️"
                            title="No Pools Available"
                            description="No pools with reward distribution found yet. Check back soon!"
                        />
                    ) : (
                        <>
                            {/* Banner for users without veNFT */}
                            {positions.length === 0 && (
                                <div className="max-w-4xl mx-auto mb-6 p-4 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30">
                                    <div className="flex items-center justify-between flex-wrap gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">🔐</span>
                                            <div>
                                                <p className="font-semibold">Lock YAKA to Vote</p>
                                                <p className="text-sm text-gray-400">You need voting power to participate in gauge voting</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('lock')}
                                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90"
                                        >
                                            Lock YAKA
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* NFT Selector - only show if user has positions */}
                            {positions.length > 0 && (
                                <div className="glass-card p-5 mb-6 max-w-4xl mx-auto">
                                    <label className="text-sm text-gray-400 mb-3 block">Select Voting NFT to Use</label>
                                    <div className="flex gap-3 flex-wrap">
                                        {positions.map((pos) => (
                                            <button
                                                key={pos.tokenId.toString()}
                                                onClick={() => setSelectedVeNFT(pos.tokenId)}
                                                className={`px-4 py-3 rounded-xl text-sm transition-all ${selectedVeNFT === pos.tokenId
                                                    ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                                                    }`}
                                            >
                                                <div className="font-semibold">NFT #{pos.tokenId.toString()}</div>
                                                <div className="text-xs opacity-80">
                                                    {parseFloat(formatUnits(pos.votingPower, 18)).toFixed(2)} voting power
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pools List - always visible */}
                            <div className="glass-card overflow-hidden max-w-4xl mx-auto">
                                <div className="p-5 border-b border-white/5 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-lg font-semibold">Pool Vote Weights</h2>
                                        <p className="text-sm text-gray-400">
                                            {positions.length > 0
                                                ? "Allocate your voting power to pools. They'll receive weekly YAKA rewards!"
                                                : "See how votes are distributed across pools. Lock YAKA to participate!"}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm">
                                        <div className="text-gray-400">Total Votes</div>
                                        <div className="font-semibold text-lg">{parseFloat(formatUnits(totalWeight, 18)).toLocaleString()}</div>
                                    </div>
                                </div>

                                {/* Table Header */}
                                <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-white/5 text-sm text-gray-400 font-medium">
                                    <div className="col-span-3">Pool</div>
                                    <div className="col-span-2 text-center">Incentives</div>
                                    <div className="col-span-2 text-right">Current Share</div>
                                    <div className="col-span-2 text-right">Total Votes</div>
                                    <div className="col-span-3 text-center">{positions.length > 0 ? 'Your Vote %' : 'Status'}</div>
                                </div>

                                {/* Loading State */}
                                {isLoadingGauges && (
                                    <div className="p-8 text-center text-gray-400">
                                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                        Loading pools...
                                    </div>
                                )}

                                {/* Pools */}
                                {gauges.map((gauge, index) => (
                                    <motion.div
                                        key={gauge.pool}
                                        className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                    >
                                        {/* Pool Info */}
                                        <div className="md:col-span-3 flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold">
                                                    {gauge.symbol0[0]}
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-sm font-bold absolute left-5 top-0 border-2 border-[var(--bg-primary)]">
                                                    {gauge.symbol1[0]}
                                                </div>
                                            </div>
                                            <div className="ml-3 flex-1">
                                                <span className="font-semibold">{gauge.symbol0}/{gauge.symbol1}</span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${gauge.poolType === 'CL' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-primary/20 text-primary'}`}>
                                                        {gauge.poolType}
                                                    </span>
                                                    {!gauge.isAlive && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Incentives / Rewards Column */}
                                        <div className="md:col-span-2 flex items-center justify-center">
                                            {gauge.rewardTokens && gauge.rewardTokens.length > 0 ? (
                                                <div className="flex flex-wrap gap-1 justify-center">
                                                    {gauge.rewardTokens.map((reward, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="text-xs px-2 py-1 rounded-lg bg-green-500/20 text-green-400 font-medium"
                                                            title={`${formatUnits(reward.amount, reward.decimals)} ${reward.symbol}`}
                                                        >
                                                            {parseFloat(formatUnits(reward.amount, reward.decimals)).toFixed(reward.decimals > 6 ? 2 : 4)} {reward.symbol}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-500">-</span>
                                            )}
                                        </div>

                                        {/* Current Share */}
                                        <div className="hidden md:flex md:col-span-2 items-center justify-end text-right">
                                            <span className={`apr-badge ${gauge.weightPercent > 10 ? 'apr-badge-high' : gauge.weightPercent > 2 ? 'apr-badge-medium' : 'apr-badge-low'}`}>
                                                {gauge.weightPercent.toFixed(2)}%
                                            </span>
                                        </div>

                                        {/* Total Votes */}
                                        <div className="hidden md:flex md:col-span-2 items-center justify-end text-right text-gray-400 text-sm">
                                            {parseFloat(formatUnits(gauge.weight, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </div>

                                        {/* Vote Input or Status */}
                                        <div className="md:col-span-3 flex items-center justify-between md:justify-center gap-2">
                                            {positions.length > 0 ? (
                                                <>
                                                    <div className="flex gap-1">
                                                        {[100, 50, 25].map((pct) => (
                                                            <button
                                                                key={pct}
                                                                onClick={() => updateVoteWeight(gauge.pool, pct)}
                                                                disabled={!selectedVeNFT || !gauge.isAlive}
                                                                className={`px-2.5 py-1.5 text-xs rounded-lg transition ${voteWeights[gauge.pool] === pct
                                                                    ? 'bg-primary text-white'
                                                                    : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                                                            >
                                                                {pct}%
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={voteWeights[gauge.pool] || ''}
                                                        onChange={(e) => updateVoteWeight(gauge.pool, parseInt(e.target.value) || 0)}
                                                        disabled={!selectedVeNFT || !gauge.isAlive}
                                                        className="w-16 p-2 rounded-lg bg-white/5 text-center text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                                                    />
                                                </>
                                            ) : (
                                                <span className={`text-xs px-3 py-1.5 rounded-lg ${gauge.isAlive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                    {gauge.isAlive ? '✓ Active' : '✗ Inactive'}
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Vote Summary - only show if user has positions and has allocated votes */}
                            {positions.length > 0 && totalVoteWeight > 0 && (
                                <motion.div
                                    className="max-w-4xl mx-auto mt-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-300">Total Vote Weight Allocated</span>
                                        <span className="font-bold text-lg">{totalVoteWeight}%</span>
                                    </div>
                                    {totalVoteWeight > 100 && (
                                        <p className="text-xs text-yellow-400 mt-2">⚠️ Total exceeds 100%. Votes will be proportionally adjusted.</p>
                                    )}
                                </motion.div>
                            )}

                            {/* Submit Vote - only show if user has positions */}
                            {positions.length > 0 && (
                                <div className="max-w-4xl mx-auto mt-6 flex gap-4 justify-end">
                                    {selectedVeNFT && (
                                        <button
                                            onClick={handleResetVotes}
                                            disabled={isVoting}
                                            className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition disabled:opacity-50 font-medium"
                                        >
                                            Reset My Votes
                                        </button>
                                    )}
                                    <motion.button
                                        onClick={handleVote}
                                        disabled={!selectedVeNFT || totalVoteWeight === 0 || isVoting}
                                        className="btn-gradient px-8 disabled:opacity-50"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        {isVoting ? 'Submitting...' : 'Cast Votes'}
                                    </motion.button>
                                </div>
                            )}
                        </>
                    )}
                </motion.div>
            )}

            {/* Rewards Tab */}
            {activeTab === 'rewards' && (
                <motion.div className="max-w-lg mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    {!isConnected ? (
                        <EmptyState
                            icon="🔗"
                            title="Connect Your Wallet"
                            description="Connect your wallet to view and claim your rewards"
                        />
                    ) : positions.length === 0 ? (
                        <EmptyState
                            icon="💰"
                            title="No Rewards Yet"
                            description="Lock YAKA and vote to start earning rewards. Voters receive a share of trading fees from the pools they vote for!"
                            action={{
                                label: 'Start Earning',
                                onClick: () => setActiveTab('lock')
                            }}
                        />
                    ) : (
                        <div className="glass-card p-6">
                            <h2 className="text-lg font-semibold mb-2">Your Claimable Rewards</h2>
                            <p className="text-sm text-gray-400 mb-6">
                                <Tooltip content="Rebase rewards protect your voting power from dilution as new tokens are minted">
                                    Rebase rewards
                                </Tooltip>
                                {' '}accumulate over time. Claim them to add to your locked amount!
                            </p>
                            <div className="space-y-4">
                                {positions.map((position) => (
                                    <div key={position.tokenId.toString()} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div>
                                            <div className="text-sm text-gray-400">veYAKA #{position.tokenId.toString()}</div>
                                            <div className="text-xl font-bold text-green-400">
                                                {parseFloat(formatUnits(position.claimable, 18)).toFixed(4)} YAKA
                                            </div>
                                        </div>
                                        <motion.button
                                            onClick={() => handleClaimRebases(position.tokenId)}
                                            disabled={isLoading || position.claimable === BigInt(0)}
                                            className="px-5 py-3 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 font-medium hover:from-green-500/30 hover:to-emerald-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            Claim
                                        </motion.button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Benefits Section */}
            <motion.div
                className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <InfoCard
                    icon="🗳️"
                    title="Direct Pool Rewards"
                    description="Your votes decide which pools get weekly YAKA rewards. Vote for productive pools to grow the ecosystem!"
                />
                <InfoCard
                    icon="💰"
                    title="Earn Trading Fees"
                    description="Voters receive a share of trading fees from the pools they vote for. More volume = more earnings!"
                    variant="success"
                />
                <InfoCard
                    icon="🎁"
                    title="Get Bonus Rewards"
                    description="Some projects offer bonus rewards to voters who support their pools. Check back regularly for new opportunities!"
                />
            </motion.div>
        </div>
    );
}
