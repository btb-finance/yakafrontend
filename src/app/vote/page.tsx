'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { useVeYAKA, LOCK_DURATIONS } from '@/hooks/useVeYAKA';
import { useTokenBalance } from '@/hooks/useToken';
import { useVoter } from '@/hooks/useVoter';
import { WIND } from '@/config/tokens';
import { Tooltip } from '@/components/common/Tooltip';
import { InfoCard, EmptyState } from '@/components/common/InfoCard';
import { LockVoteEarnSteps } from '@/components/common/StepIndicator';

export default function VotePage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'lock' | 'vote' | 'rewards'>('lock');

    // Lock state
    const [lockAmount, setLockAmount] = useState('');
    const [lockDuration, setLockDuration] = useState<keyof typeof LOCK_DURATIONS>('4Y');
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

    const { balance: yakaBalance, formatted: formattedYakaBalance } = useTokenBalance(WIND);

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
        { key: 'lock' as const, label: 'Lock WIND', icon: '🔐', description: 'Get voting power' },
        { key: 'vote' as const, label: 'Vote', icon: '🗳️', description: 'Choose pools' },
        { key: 'rewards' as const, label: 'Rewards', icon: '💰', description: 'Claim earnings' },
    ];

    return (
        <div className="container mx-auto px-3 sm:px-6 py-4">
            {/* Page Header - Compact */}
            <motion.div
                className="mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-xl sm:text-2xl font-bold">
                    <span className="gradient-text">Vote</span> & Earn
                </h1>
                <p className="text-xs sm:text-sm text-gray-400">
                    Lock WIND → Vote → Earn rewards
                </p>
            </motion.div>

            {/* Visual Step Flow - hidden on mobile */}
            <motion.div
                className="hidden md:block mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <div className="glass-card p-6">
                    <LockVoteEarnSteps currentStep={getCurrentStep()} />
                </div>
            </motion.div>

            {/* Stats Row - Compact */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="glass-card p-2 sm:p-3 text-center">
                    <div className="text-[10px] text-gray-400">WIND Balance</div>
                    <div className="text-sm sm:text-lg font-bold">{formattedYakaBalance || '0'}</div>
                </div>
                <div className="glass-card p-2 sm:p-3 text-center">
                    <div className="text-[10px] text-gray-400">veNFTs</div>
                    <div className="text-sm sm:text-lg font-bold">{veNFTCount}</div>
                </div>
                <div className="glass-card p-2 sm:p-3 text-center bg-green-500/10">
                    <div className="text-[10px] text-gray-400">Claimable</div>
                    <div className="text-sm sm:text-lg font-bold text-green-400">
                        {parseFloat(formatUnits(totalClaimable, 18)).toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Tabs - Compact */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {tabConfig.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${activeTab === tab.key
                            ? 'bg-primary text-white'
                            : 'text-gray-400 hover:text-white bg-white/5'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
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
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="glass-card p-3 sm:p-4">
                        {/* Amount Input */}
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-400">Amount</label>
                                <span className="text-[10px] text-gray-400">Bal: {formattedYakaBalance || '0'}</span>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={lockAmount}
                                        onChange={(e) => setLockAmount(e.target.value)}
                                        placeholder="0.0"
                                        className="flex-1 min-w-0 bg-transparent text-xl font-bold outline-none placeholder-gray-600"
                                    />
                                    <button
                                        onClick={() => setLockAmount(formattedYakaBalance || '0')}
                                        className="px-2 py-1 text-[10px] font-medium rounded bg-white/10 hover:bg-white/20 text-primary"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Duration Selection */}
                        <div className="mb-3">
                            <label className="text-xs text-gray-400 mb-2 block">Lock Duration</label>
                            <div className="grid grid-cols-4 gap-1">
                                {(Object.keys(LOCK_DURATIONS) as Array<keyof typeof LOCK_DURATIONS>).slice(0, 4).map((duration) => (
                                    <button
                                        key={duration}
                                        onClick={() => setLockDuration(duration)}
                                        className={`py-2 rounded-lg text-xs font-medium transition ${lockDuration === duration
                                            ? 'bg-primary text-white'
                                            : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                            }`}
                                    >
                                        {duration}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-1 mt-1">
                                {(Object.keys(LOCK_DURATIONS) as Array<keyof typeof LOCK_DURATIONS>).slice(4).map((duration) => (
                                    <button
                                        key={duration}
                                        onClick={() => setLockDuration(duration)}
                                        className={`py-2 rounded-lg text-xs font-medium transition ${lockDuration === duration
                                            ? 'bg-primary text-white'
                                            : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                            }`}
                                    >
                                        {duration}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preview - Inline */}
                        <div className="flex items-center justify-between text-xs mb-3 p-2 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10">
                            <div>
                                <span className="text-gray-400">You get: </span>
                                <span className="font-bold text-primary">{estimatedVotingPower} veWIND</span>
                            </div>
                            <div className="text-gray-400">
                                Unlocks {unlockDate.toLocaleDateString()}
                            </div>
                        </div>

                        {/* Lock Button */}
                        <button
                            onClick={handleCreateLock}
                            disabled={!isConnected || isLoading || !lockAmount || parseFloat(lockAmount) <= 0}
                            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-primary to-secondary text-white disabled:opacity-50"
                        >
                            {isLoading ? 'Locking...' : !isConnected ? 'Connect Wallet' : 'Lock WIND'}
                        </button>
                    </div>

                    {/* Existing Positions */}
                    {positions.length > 0 && (
                        <div className="glass-card p-3 sm:p-4 mt-3">
                            <h3 className="text-sm font-semibold mb-2">Your veNFTs ({positions.length})</h3>
                            <div className="space-y-2">
                                {positions.map((position) => {
                                    const isExpired = position.end < BigInt(Math.floor(Date.now() / 1000)) && !position.isPermanent;
                                    const endDate = new Date(Number(position.end) * 1000);

                                    return (
                                        <div key={position.tokenId.toString()} className="p-2 rounded-lg bg-white/5 border border-white/10">
                                            <div className="flex justify-between items-center">
                                                <div className="min-w-0">
                                                    <div className="text-xs text-gray-400">#{position.tokenId.toString()}</div>
                                                    <div className="font-bold text-sm">{parseFloat(formatUnits(position.amount, 18)).toFixed(0)} WIND</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-sm text-primary">{parseFloat(formatUnits(position.votingPower, 18)).toFixed(0)} veWIND</div>
                                                    <div className="text-[10px] text-gray-400">
                                                        {position.isPermanent ? '∞ Permanent' : isExpired ? '🔓 Unlocked' : endDate.toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                            {isExpired && (
                                                <button
                                                    onClick={() => handleWithdraw(position.tokenId)}
                                                    className="w-full mt-2 py-1.5 text-[10px] rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                                                >
                                                    Withdraw
                                                </button>
                                            )}
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
                                <div className="mb-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-gray-300">Lock WIND to vote on pools</p>
                                        <button
                                            onClick={() => setActiveTab('lock')}
                                            className="px-3 py-1 text-[10px] rounded bg-primary text-white font-medium"
                                        >
                                            Lock
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* NFT Selector - only show if user has positions */}
                            {positions.length > 0 && (
                                <div className="glass-card p-3 mb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs text-gray-400">Voting with:</label>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        {positions.map((pos) => (
                                            <button
                                                key={pos.tokenId.toString()}
                                                onClick={() => setSelectedVeNFT(pos.tokenId)}
                                                className={`px-3 py-1.5 rounded-lg text-xs transition ${selectedVeNFT === pos.tokenId
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                    }`}
                                            >
                                                #{pos.tokenId.toString()} ({parseFloat(formatUnits(pos.votingPower, 18)).toFixed(0)} veWIND)
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pools List */}
                            <div className="glass-card overflow-hidden">
                                <div className="p-3 border-b border-white/5 flex justify-between items-center">
                                    <span className="font-semibold text-sm">Pools ({gauges.length})</span>
                                    <span className="text-xs text-gray-400">{parseFloat(formatUnits(totalWeight, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })} votes</span>
                                </div>

                                {/* Loading State */}
                                {isLoadingGauges && (
                                    <div className="p-6 text-center text-gray-400 text-sm">
                                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                        Loading...
                                    </div>
                                )}

                                {/* Pools - Compact Mobile Layout */}
                                <div className="divide-y divide-white/5">
                                    {gauges.map((gauge) => (
                                        <div key={gauge.pool} className="p-2 sm:p-3">
                                            {/* Row 1: Pool info + share */}
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="relative w-10 h-6 flex-shrink-0">
                                                        <div className="absolute left-0 w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">
                                                            {gauge.symbol0.slice(0, 2)}
                                                        </div>
                                                        <div className="absolute left-3 w-6 h-6 rounded-full bg-secondary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">
                                                            {gauge.symbol1.slice(0, 2)}
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-semibold text-sm truncate">{gauge.symbol0}/{gauge.symbol1}</span>
                                                            <span className={`text-[8px] px-1 py-0.5 rounded ${gauge.poolType === 'CL' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-primary/20 text-primary'}`}>
                                                                {gauge.poolType}
                                                            </span>
                                                            {!gauge.isAlive && (
                                                                <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">Off</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-xs font-bold text-primary">{gauge.weightPercent.toFixed(1)}%</div>
                                                    <div className="text-[10px] text-gray-400">{parseFloat(formatUnits(gauge.weight, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                                </div>
                                            </div>

                                            {/* Row 2: Vote controls or status */}
                                            <div className="flex items-center justify-between gap-2">
                                                {positions.length > 0 ? (
                                                    <>
                                                        <div className="flex gap-1">
                                                            {[100, 50, 25].map((pct) => (
                                                                <button
                                                                    key={pct}
                                                                    onClick={() => updateVoteWeight(gauge.pool, pct)}
                                                                    disabled={!selectedVeNFT || !gauge.isAlive}
                                                                    className={`px-2 py-1 text-[10px] rounded transition ${voteWeights[gauge.pool] === pct
                                                                        ? 'bg-primary text-white'
                                                                        : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                                        } disabled:opacity-40`}
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
                                                            className="w-14 py-1 px-2 rounded bg-white/5 text-center text-xs outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                                                        />
                                                    </>
                                                ) : (
                                                    <span className={`text-[10px] px-2 py-1 rounded ${gauge.isAlive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                        {gauge.isAlive ? '✓ Active' : '✗ Inactive'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Vote Summary + Submit - Compact */}
                            {positions.length > 0 && (
                                <div className="p-3 bg-primary/5 border-t border-primary/20">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs">
                                            <span className="text-gray-400">Allocated: </span>
                                            <span className={`font-bold ${totalVoteWeight > 100 ? 'text-yellow-400' : 'text-white'}`}>{totalVoteWeight}%</span>
                                            {totalVoteWeight > 100 && <span className="text-[10px] text-yellow-400 ml-1">⚠️</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            {selectedVeNFT && (
                                                <button
                                                    onClick={handleResetVotes}
                                                    disabled={isVoting}
                                                    className="px-3 py-1.5 text-[10px] rounded bg-white/10 hover:bg-white/20 transition disabled:opacity-50"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                            <button
                                                onClick={handleVote}
                                                disabled={!selectedVeNFT || totalVoteWeight === 0 || isVoting}
                                                className="px-4 py-1.5 text-xs font-bold rounded bg-gradient-to-r from-primary to-secondary text-white disabled:opacity-50"
                                            >
                                                {isVoting ? '...' : 'Vote'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </motion.div>
            )}

            {/* Rewards Tab */}
            {activeTab === 'rewards' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {!isConnected ? (
                        <div className="glass-card p-4 text-center">
                            <p className="text-sm text-gray-400">Connect wallet to view rewards</p>
                        </div>
                    ) : positions.length === 0 ? (
                        <div className="glass-card p-4 text-center">
                            <p className="text-gray-400 text-sm mb-3">No veNFTs - Lock WIND to earn rewards</p>
                            <button onClick={() => setActiveTab('lock')} className="btn-primary px-4 py-2 text-xs rounded-lg">Lock WIND</button>
                        </div>
                    ) : (
                        <div className="glass-card p-3 sm:p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold">Rebase Rewards</h3>
                                <span className="text-xs text-gray-400">Protects voting power</span>
                            </div>
                            <div className="space-y-2">
                                {positions.map((position) => (
                                    <div key={position.tokenId.toString()} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                                        <div className="min-w-0">
                                            <div className="text-xs text-gray-400">#{position.tokenId.toString()}</div>
                                            <div className="font-bold text-sm text-green-400">
                                                {parseFloat(formatUnits(position.claimable, 18)).toFixed(4)} WIND
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleClaimRebases(position.tokenId)}
                                            disabled={isLoading || position.claimable === BigInt(0)}
                                            className="px-3 py-1.5 text-[10px] font-medium rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-40"
                                        >
                                            Claim
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
}
