'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { formatUnits, Address } from 'viem';
import Link from 'next/link';
import { useVeYAKA, LOCK_DURATIONS } from '@/hooks/useVeYAKA';
import { useTokenBalance } from '@/hooks/useToken';
import { useVoter } from '@/hooks/useVoter';
import { WIND, DEFAULT_TOKEN_LIST } from '@/config/tokens';
import { V2_CONTRACTS } from '@/config/contracts';
import { Tooltip } from '@/components/common/Tooltip';
import { InfoCard, EmptyState } from '@/components/common/InfoCard';
import { LockVoteEarnSteps } from '@/components/common/StepIndicator';

// Helper to get token logo from global token list
const getTokenLogo = (addr: string): string | undefined => {
    const token = DEFAULT_TOKEN_LIST.find(t => t.address.toLowerCase() === addr.toLowerCase());
    return token?.logoURI;
};

// Minter ABI for epoch info
const MINTER_ABI = [
    {
        inputs: [],
        name: 'activePeriod',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'epochCount',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Voter ABI for distribute (permissionless!)
const VOTER_DISTRIBUTE_ABI = [
    {
        inputs: [{ name: '_start', type: 'uint256' }, { name: '_finish', type: 'uint256' }],
        name: 'distribute',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'length',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

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

    // Lock management state
    const [managingNFT, setManagingNFT] = useState<bigint | null>(null);
    const [increaseAmountValue, setIncreaseAmountValue] = useState('');
    const [extendDuration, setExtendDuration] = useState<keyof typeof LOCK_DURATIONS>('4Y');
    const [mergeTarget, setMergeTarget] = useState<bigint | null>(null);

    // Hooks
    const {
        positions,
        veNFTCount,
        createLock,
        increaseAmount,
        extendLock,
        withdraw,
        claimRebases,
        merge,
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

    // Read epoch info from Minter
    const { data: activePeriod } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'activePeriod',
    });

    const { data: epochCount } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'epochCount',
    });

    // Calculate epoch times
    const epochStartDate = activePeriod ? new Date(Number(activePeriod) * 1000) : null;
    const epochEndDate = activePeriod ? new Date((Number(activePeriod) + 7 * 24 * 60 * 60) * 1000) : null;
    const timeUntilNextEpoch = activePeriod ? Math.max(0, Number(activePeriod) + 7 * 24 * 60 * 60 - Math.floor(Date.now() / 1000)) : 0;
    const daysRemaining = Math.floor(timeUntilNextEpoch / 86400);
    const hoursRemaining = Math.floor((timeUntilNextEpoch % 86400) / 3600);
    const epochHasEnded = timeUntilNextEpoch === 0;

    // Read voter pool count for distribute
    const { data: voterPoolCount } = useReadContract({
        address: V2_CONTRACTS.Voter as Address,
        abi: VOTER_DISTRIBUTE_ABI,
        functionName: 'length',
    });

    // Distribute state
    const [isDistributing, setIsDistributing] = useState(false);
    const { writeContractAsync } = useWriteContract();

    // Handle distribute rewards (anyone can call this!)
    const handleDistributeRewards = async () => {
        if (!voterPoolCount || Number(voterPoolCount) === 0) return;
        setIsDistributing(true);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_DISTRIBUTE_ABI,
                functionName: 'distribute',
                args: [BigInt(0), voterPoolCount],
            });
            setTxHash(hash);
        } catch (err: any) {
            console.error('Distribute failed:', err);
        }
        setIsDistributing(false);
    };

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

    const handleIncreaseAmount = async (tokenId: bigint) => {
        if (!increaseAmountValue || parseFloat(increaseAmountValue) <= 0) return;
        const result = await increaseAmount(tokenId, increaseAmountValue);
        if (result) {
            setTxHash(result.hash);
            setIncreaseAmountValue('');
            setManagingNFT(null);
        }
    };

    const handleExtendLock = async (tokenId: bigint) => {
        const result = await extendLock(tokenId, LOCK_DURATIONS[extendDuration]);
        if (result) {
            setTxHash(result.hash);
            setManagingNFT(null);
        }
    };

    const handleMaxLock = async (tokenId: bigint) => {
        // Max lock is 4 years
        const result = await extendLock(tokenId, LOCK_DURATIONS['4Y']);
        if (result) {
            setTxHash(result.hash);
        }
    };

    const handleMerge = async (fromTokenId: bigint, toTokenId: bigint) => {
        const result = await merge(fromTokenId, toTokenId);
        if (result) {
            setTxHash(result.hash);
            setMergeTarget(null);
            setManagingNFT(null);
        }
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

            {/* Epoch Info Banner */}
            <motion.div
                className={`mb-4 p-3 rounded-xl border ${epochHasEnded
                    ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20'
                    : 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-500/20'}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="text-xl">{epochHasEnded ? '🎉' : '📅'}</div>
                        <div>
                            <div className="text-xs text-gray-400">Current Epoch</div>
                            <div className={`font-bold ${epochHasEnded ? 'text-green-400' : 'text-blue-400'}`}>
                                Epoch {epochCount !== undefined ? epochCount.toString() : '...'}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <div className="text-center hidden sm:block">
                            <div className="text-gray-400">Started</div>
                            <div className="font-medium text-white">
                                {epochStartDate ? epochStartDate.toLocaleDateString() : '...'}
                            </div>
                        </div>
                        <div className="text-center hidden sm:block">
                            <div className="text-gray-400">Ends</div>
                            <div className="font-medium text-white">
                                {epochEndDate ? epochEndDate.toLocaleDateString() : '...'}
                            </div>
                        </div>
                        {epochHasEnded ? (
                            <button
                                onClick={handleDistributeRewards}
                                disabled={isDistributing || !voterPoolCount || Number(voterPoolCount) === 0}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDistributing ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Distributing...
                                    </>
                                ) : (
                                    <>💰 Distribute Rewards</>
                                )}
                            </button>
                        ) : (
                            <div className="text-center px-3 py-1 rounded-lg bg-blue-500/20">
                                <div className="text-gray-400">Time Left</div>
                                <div className="font-bold text-blue-400">
                                    {daysRemaining}d {hoursRemaining}h
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {epochHasEnded && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-gray-400">
                        ✨ Epoch ended! Anyone can trigger reward distribution to send fees to voters.
                    </div>
                )}
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

            {/* Tabs - Prominent Buttons */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {tabConfig.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 min-w-0 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 border-2 flex items-center justify-center gap-2 ${activeTab === tab.key
                            ? 'bg-gradient-to-r from-primary to-secondary text-white border-primary shadow-lg shadow-primary/30'
                            : 'bg-white/5 text-gray-300 border-white/10 hover:border-primary/50 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <span className="text-base">{tab.icon}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.key === 'lock' ? 'Lock' : tab.key === 'vote' ? 'Vote' : 'Earn'}</span>
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
                            <div className="grid grid-cols-4 gap-2">
                                {(['1M', '6M', '1Y', '4Y'] as const).map((duration) => (
                                    <button
                                        key={duration}
                                        onClick={() => setLockDuration(duration)}
                                        className={`py-3 px-2 rounded-xl text-sm font-bold transition-all duration-200 border-2 ${lockDuration === duration
                                            ? 'bg-gradient-to-r from-primary to-secondary text-white border-primary shadow-lg shadow-primary/30 scale-105'
                                            : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10 hover:border-primary/50 hover:text-white'
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
                            <div className="space-y-3">
                                {positions.map((position) => {
                                    const isExpired = position.end < BigInt(Math.floor(Date.now() / 1000)) && !position.isPermanent;
                                    const endDate = new Date(Number(position.end) * 1000);
                                    const isManaging = managingNFT === position.tokenId;

                                    return (
                                        <div key={position.tokenId.toString()} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                            {/* Position Info */}
                                            <div className="flex justify-between items-center">
                                                <div className="min-w-0">
                                                    <div className="text-xs text-gray-400">#{position.tokenId.toString()}</div>
                                                    <div className="font-bold text-sm">{parseFloat(formatUnits(position.amount, 18)).toLocaleString()} WIND</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-sm text-primary">{parseFloat(formatUnits(position.votingPower, 18)).toLocaleString()} veWIND</div>
                                                    <div className="text-[10px] text-gray-400">
                                                        {position.isPermanent ? '∞ Permanent' : isExpired ? '🔓 Unlocked' : endDate.toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Buttons - show for non-expired locks */}
                                            {!isExpired && (
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        onClick={() => setManagingNFT(isManaging ? null : position.tokenId)}
                                                        className={`flex-1 py-1.5 text-[10px] rounded transition ${isManaging ? 'bg-primary text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                                                    >
                                                        {isManaging ? '✕ Close' : '⚙️ Manage'}
                                                    </button>
                                                    {!position.isPermanent && (
                                                        <button
                                                            onClick={() => handleMaxLock(position.tokenId)}
                                                            disabled={isLoading}
                                                            className="flex-1 py-1.5 text-[10px] rounded bg-gradient-to-r from-primary/20 to-secondary/20 text-primary hover:from-primary/30 hover:to-secondary/30 transition disabled:opacity-50"
                                                        >
                                                            🔒 Max Lock (4Y)
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Management Panel */}
                                            {isManaging && !isExpired && (
                                                <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                                                    {/* Increase Amount - available for all locks */}
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 mb-1 block">Add More WIND</label>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                                                                <input
                                                                    type="text"
                                                                    value={increaseAmountValue}
                                                                    onChange={(e) => setIncreaseAmountValue(e.target.value)}
                                                                    placeholder="0.0"
                                                                    className="flex-1 min-w-0 bg-transparent text-sm font-bold outline-none placeholder-gray-600"
                                                                />
                                                                <button
                                                                    onClick={() => setIncreaseAmountValue(formattedYakaBalance || '0')}
                                                                    className="px-2 py-0.5 text-[8px] font-medium rounded bg-white/10 hover:bg-white/20 text-primary"
                                                                >
                                                                    MAX
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => handleIncreaseAmount(position.tokenId)}
                                                                disabled={isLoading || !increaseAmountValue || parseFloat(increaseAmountValue) <= 0}
                                                                className="px-3 py-2 text-[10px] font-medium rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50"
                                                            >
                                                                + Add
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Extend Lock - only for non-permanent locks */}
                                                    {!position.isPermanent && (
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 mb-1 block">Extend Lock Duration</label>
                                                            <div className="flex gap-2">
                                                                <div className="flex-1 grid grid-cols-4 gap-1">
                                                                    {(['1M', '3M', '1Y', '4Y'] as const).map((duration) => (
                                                                        <button
                                                                            key={duration}
                                                                            onClick={() => setExtendDuration(duration)}
                                                                            className={`py-1 rounded text-[10px] font-medium transition ${extendDuration === duration
                                                                                ? 'bg-primary text-white'
                                                                                : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                                                }`}
                                                                        >
                                                                            {duration}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                <button
                                                                    onClick={() => handleExtendLock(position.tokenId)}
                                                                    disabled={isLoading}
                                                                    className="px-3 py-2 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
                                                                >
                                                                    Extend
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Info for permanent locks */}
                                                    {position.isPermanent && (
                                                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                                            <span>✨</span>
                                                            <span>Permanent lock - maximum voting power forever!</span>
                                                        </div>
                                                    )}

                                                    {/* Merge - Only show if user has more than 1 veNFT */}
                                                    {positions.length > 1 && !position.isPermanent && (
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 mb-1 block">Merge with another veNFT</label>
                                                            <div className="flex gap-2 flex-wrap">
                                                                {positions
                                                                    .filter(p => p.tokenId !== position.tokenId && !p.isPermanent)
                                                                    .map(p => (
                                                                        <button
                                                                            key={p.tokenId.toString()}
                                                                            onClick={() => setMergeTarget(mergeTarget === p.tokenId ? null : p.tokenId)}
                                                                            className={`px-2 py-1 text-[10px] rounded transition ${mergeTarget === p.tokenId
                                                                                ? 'bg-purple-500 text-white'
                                                                                : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                                                }`}
                                                                        >
                                                                            #{p.tokenId.toString()} ({parseFloat(formatUnits(p.amount, 18)).toLocaleString()} WIND)
                                                                        </button>
                                                                    ))}
                                                            </div>
                                                            {mergeTarget && (
                                                                <button
                                                                    onClick={() => handleMerge(mergeTarget, position.tokenId)}
                                                                    disabled={isLoading}
                                                                    className="w-full mt-2 py-2 text-[10px] font-medium rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition disabled:opacity-50"
                                                                >
                                                                    🔀 Merge #{mergeTarget.toString()} → #{position.tokenId.toString()}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}



                                            {/* Withdraw Button for Expired */}
                                            {isExpired && (
                                                <button
                                                    onClick={() => handleWithdraw(position.tokenId)}
                                                    className="w-full mt-2 py-2 text-xs rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 font-medium"
                                                >
                                                    🔓 Withdraw WIND
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
                                    {/* Sort: Active gauges (with gauge address) first, then by isAlive */}
                                    {[...gauges].sort((a, b) => {
                                        // First priority: has gauge address
                                        if (a.gauge && !b.gauge) return -1;
                                        if (!a.gauge && b.gauge) return 1;
                                        // Second priority: isAlive
                                        if (a.isAlive && !b.isAlive) return -1;
                                        if (!a.isAlive && b.isAlive) return 1;
                                        return 0;
                                    }).map((gauge) => (
                                        <div key={gauge.pool} className="p-2 sm:p-3">
                                            {/* Row 1: Pool info + share */}
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="relative w-10 h-6 flex-shrink-0">
                                                        {getTokenLogo(gauge.token0) ? (
                                                            <img src={getTokenLogo(gauge.token0)} alt={gauge.symbol0} className="absolute left-0 w-6 h-6 rounded-full border border-[var(--bg-primary)]" />
                                                        ) : (
                                                            <div className="absolute left-0 w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">
                                                                {gauge.symbol0.slice(0, 2)}
                                                            </div>
                                                        )}
                                                        {getTokenLogo(gauge.token1) ? (
                                                            <img src={getTokenLogo(gauge.token1)} alt={gauge.symbol1} className="absolute left-3 w-6 h-6 rounded-full border border-[var(--bg-primary)]" />
                                                        ) : (
                                                            <div className="absolute left-3 w-6 h-6 rounded-full bg-secondary/30 flex items-center justify-center text-[10px] font-bold border border-[var(--bg-primary)]">
                                                                {gauge.symbol1.slice(0, 2)}
                                                            </div>
                                                        )}
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
                                                {!gauge.gauge ? (
                                                    /* No gauge exists yet - show Coming Soon */
                                                    <span className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-400 flex items-center gap-1">
                                                        🚧 Voting Coming Soon
                                                    </span>
                                                ) : positions.length > 0 ? (
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
