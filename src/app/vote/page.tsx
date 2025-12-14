'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { formatUnits, Address } from 'viem';
import { useVeYAKA, LOCK_DURATIONS } from '@/hooks/useVeYAKA';
import { useTokenBalance } from '@/hooks/useToken';
import { useVoter } from '@/hooks/useVoter';
import { YAKA } from '@/config/tokens';

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

    return (
        <div className="container mx-auto px-6">
            {/* Page Header */}
            <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Vote</span> & Earn
                </h1>
                <p className="text-gray-400 max-w-lg mx-auto">
                    Lock YAKA to receive veNFTs, vote on gauge emissions, and earn bribes + fees.
                </p>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mb-8 max-w-2xl mx-auto">
                <div className="glass-card p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Your YAKA</div>
                    <div className="text-lg font-semibold">{formattedYakaBalance || '0'}</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Your veYAKA NFTs</div>
                    <div className="text-lg font-semibold">{veNFTCount}</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Claimable Rebases</div>
                    <div className="text-lg font-semibold text-green-400">
                        {formatUnits(totalClaimable, 18).slice(0, 8)} YAKA
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
                <div className="glass p-1 rounded-xl inline-flex">
                    {(['lock', 'vote', 'rewards'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 rounded-lg font-medium transition capitalize ${activeTab === tab ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            {tab === 'lock' ? '🔒 Lock YAKA' : tab === 'vote' ? '🗳️ Vote' : '💰 Rewards'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-md mx-auto text-center">
                    {error}
                </div>
            )}

            {/* Success Display */}
            {txHash && (
                <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm max-w-md mx-auto text-center">
                    Transaction submitted!{' '}
                    <a href={`https://seiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">
                        View on SeiScan
                    </a>
                </div>
            )}

            {/* Lock Tab */}
            {activeTab === 'lock' && (
                <motion.div className="max-w-md mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-semibold mb-6">Create veNFT Lock</h2>

                        {/* YAKA Amount */}
                        <div className="mb-4">
                            <label className="text-sm text-gray-400 mb-2 block">YAKA Amount</label>
                            <div className="token-input-row">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-gray-400">Balance: {formattedYakaBalance || '0'} YAKA</span>
                                    <button
                                        onClick={() => setLockAmount(formattedYakaBalance || '0')}
                                        className="text-sm text-primary hover:text-primary/80"
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
                            <label className="text-sm text-gray-400 mb-2 block">Lock Duration</label>
                            <div className="grid grid-cols-7 gap-2">
                                {(Object.keys(LOCK_DURATIONS) as Array<keyof typeof LOCK_DURATIONS>).map((duration) => (
                                    <button
                                        key={duration}
                                        onClick={() => setLockDuration(duration)}
                                        className={`py-3 rounded-xl text-sm font-medium transition ${lockDuration === duration
                                            ? 'bg-primary text-white'
                                            : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                            }`}
                                    >
                                        {duration}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                Longer locks = more voting power (up to 4x)
                            </p>
                        </div>

                        {/* Voting Power Preview */}
                        <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 mb-6">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Voting Power</span>
                                <span className="font-semibold">{estimatedVotingPower} veYAKA</span>
                            </div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Lock Expires</span>
                                <span>{unlockDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Lock Multiplier</span>
                                <span>{(LOCK_DURATIONS[lockDuration] / LOCK_DURATIONS['4Y'] * 100).toFixed(0)}%</span>
                            </div>
                        </div>

                        <motion.button
                            onClick={handleCreateLock}
                            disabled={!isConnected || isLoading || !lockAmount || parseFloat(lockAmount) <= 0}
                            className="w-full btn-primary py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                        >
                            {isLoading ? 'Creating Lock...' : !isConnected ? 'Connect Wallet' : 'Create Lock'}
                        </motion.button>
                    </div>

                    {/* Existing Positions */}
                    {positions.length > 0 && (
                        <div className="glass-card p-6 mt-6">
                            <h3 className="text-lg font-semibold mb-4">Your veYAKA Positions</h3>
                            <div className="space-y-3">
                                {positions.map((position) => {
                                    const isExpired = position.end < BigInt(Math.floor(Date.now() / 1000)) && !position.isPermanent;
                                    const endDate = new Date(Number(position.end) * 1000);

                                    return (
                                        <div key={position.tokenId.toString()} className="p-3 rounded-xl bg-white/5 flex justify-between items-center">
                                            <div>
                                                <div className="text-sm text-gray-400">veYAKA #{position.tokenId.toString()}</div>
                                                <div className="font-semibold">{formatUnits(position.amount, 18).slice(0, 8)} YAKA</div>
                                                <div className="text-xs text-gray-500">
                                                    {position.isPermanent ? '∞ Permanent' : isExpired ? 'Expired' : `Unlocks ${endDate.toLocaleDateString()}`}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-primary font-medium">{formatUnits(position.votingPower, 18).slice(0, 6)} veYAKA</div>
                                                {isExpired && (
                                                    <button
                                                        onClick={() => handleWithdraw(position.tokenId)}
                                                        className="text-xs text-red-400 hover:text-red-300"
                                                    >
                                                        Withdraw
                                                    </button>
                                                )}
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
                        <div className="glass-card p-12 text-center max-w-md mx-auto">
                            <h3 className="text-xl font-semibold mb-2">Connect Wallet</h3>
                            <p className="text-gray-400 mb-6">Connect your wallet to vote on gauges</p>
                        </div>
                    ) : positions.length === 0 ? (
                        <div className="glass-card p-12 text-center max-w-md mx-auto">
                            <div className="text-4xl mb-4">🔓</div>
                            <h3 className="text-xl font-semibold mb-2">No veNFTs Found</h3>
                            <p className="text-gray-400 mb-6">Lock YAKA to receive veNFTs and vote</p>
                            <button onClick={() => setActiveTab('lock')} className="btn-primary">
                                Lock YAKA
                            </button>
                        </div>
                    ) : gauges.length === 0 ? (
                        <div className="glass-card p-12 text-center max-w-md mx-auto">
                            <div className="text-4xl mb-4">🗳️</div>
                            <h3 className="text-xl font-semibold mb-2">No Gauges Available</h3>
                            <p className="text-gray-400">No pools with gauges found yet</p>
                        </div>
                    ) : (
                        <>
                            {/* veNFT Selector */}
                            <div className="glass-card p-4 mb-6 max-w-4xl mx-auto">
                                <label className="text-sm text-gray-400 mb-2 block">Select veNFT to Vote With</label>
                                <div className="flex gap-2 flex-wrap">
                                    {positions.map((pos) => (
                                        <button
                                            key={pos.tokenId.toString()}
                                            onClick={() => setSelectedVeNFT(pos.tokenId)}
                                            className={`px-4 py-2 rounded-lg text-sm transition ${selectedVeNFT === pos.tokenId
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            veYAKA #{pos.tokenId.toString()}
                                            <span className="text-xs ml-1 opacity-70">
                                                ({formatUnits(pos.votingPower, 18).slice(0, 6)} power)
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Gauges List */}
                            <div className="glass-card overflow-hidden max-w-4xl mx-auto">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h2 className="text-lg font-semibold">Gauges ({gauges.length})</h2>
                                    <div className="text-sm text-gray-400">
                                        Total Weight: {formatUnits(totalWeight, 18).slice(0, 10)} veYAKA
                                    </div>
                                </div>

                                {/* Table Header */}
                                <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 text-sm text-gray-400 font-medium">
                                    <div className="col-span-4">Pool</div>
                                    <div className="col-span-2 text-right">Current %</div>
                                    <div className="col-span-3 text-right">Weight</div>
                                    <div className="col-span-3 text-center">Your Vote</div>
                                </div>

                                {/* Loading State */}
                                {isLoadingGauges && (
                                    <div className="p-8 text-center text-gray-400">Loading gauges...</div>
                                )}

                                {/* Gauges */}
                                {gauges.map((gauge, index) => (
                                    <motion.div
                                        key={gauge.pool}
                                        className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition items-center"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                    >
                                        <div className="col-span-4 flex items-center gap-2">
                                            <span className="font-semibold">{gauge.symbol0}/{gauge.symbol1}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${gauge.poolType === 'CL' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary'}`}>
                                                {gauge.poolType}
                                            </span>
                                            {!gauge.isAlive && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                                                    Killed
                                                </span>
                                            )}
                                        </div>
                                        <div className="col-span-2 text-right text-sm">
                                            {gauge.weightPercent.toFixed(2)}%
                                        </div>
                                        <div className="col-span-3 text-right text-gray-400 text-sm">
                                            {formatUnits(gauge.weight, 18).slice(0, 10)}
                                        </div>
                                        <div className="col-span-3 text-center">
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={voteWeights[gauge.pool] || ''}
                                                onChange={(e) => updateVoteWeight(gauge.pool, parseInt(e.target.value) || 0)}
                                                disabled={!selectedVeNFT || !gauge.isAlive}
                                                className="w-20 p-2 rounded-lg bg-white/5 text-center text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                                            />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Vote Summary */}
                            {totalVoteWeight > 0 && (
                                <div className="max-w-4xl mx-auto mt-4 p-4 rounded-xl bg-primary/10 border border-primary/30">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Total Vote Weight Allocated</span>
                                        <span className="font-semibold">{totalVoteWeight}</span>
                                    </div>
                                </div>
                            )}

                            {/* Submit Vote */}
                            <div className="max-w-4xl mx-auto mt-6 flex gap-4 justify-end">
                                {selectedVeNFT && (
                                    <button
                                        onClick={handleResetVotes}
                                        disabled={isVoting}
                                        className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition disabled:opacity-50"
                                    >
                                        Reset Votes
                                    </button>
                                )}
                                <button
                                    onClick={handleVote}
                                    disabled={!selectedVeNFT || totalVoteWeight === 0 || isVoting}
                                    className="btn-primary px-8 disabled:opacity-50"
                                >
                                    {isVoting ? 'Voting...' : 'Cast Votes'}
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            )}

            {/* Rewards Tab */}
            {activeTab === 'rewards' && (
                <motion.div className="max-w-md mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    {!isConnected ? (
                        <div className="glass-card p-12 text-center">
                            <h3 className="text-xl font-semibold mb-2">Connect Wallet</h3>
                            <p className="text-gray-400 mb-6">Connect your wallet to view and claim rewards</p>
                        </div>
                    ) : positions.length === 0 ? (
                        <div className="glass-card p-12 text-center">
                            <div className="text-4xl mb-4">💰</div>
                            <h3 className="text-xl font-semibold mb-2">No Positions</h3>
                            <p className="text-gray-400">Lock YAKA to start earning rewards</p>
                        </div>
                    ) : (
                        <div className="glass-card p-6">
                            <h2 className="text-lg font-semibold mb-4">Claimable Rebases</h2>
                            <div className="space-y-3">
                                {positions.map((position) => (
                                    <div key={position.tokenId.toString()} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                                        <div>
                                            <div className="text-sm text-gray-400">veYAKA #{position.tokenId.toString()}</div>
                                            <div className="font-semibold text-green-400">
                                                {formatUnits(position.claimable, 18).slice(0, 10)} YAKA
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleClaimRebases(position.tokenId)}
                                            disabled={isLoading || position.claimable === BigInt(0)}
                                            className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Info Section */}
            <motion.div
                className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="glass-card p-6 text-center">
                    <div className="text-3xl mb-3">🗳️</div>
                    <h3 className="font-semibold mb-2">Vote Power</h3>
                    <p className="text-sm text-gray-400">Lock YAKA for up to 4 years to maximize voting power</p>
                </div>
                <div className="glass-card p-6 text-center">
                    <div className="text-3xl mb-3">💰</div>
                    <h3 className="font-semibold mb-2">Earn Bribes</h3>
                    <p className="text-sm text-gray-400">Receive bribes from protocols incentivizing their pools</p>
                </div>
                <div className="glass-card p-6 text-center">
                    <div className="text-3xl mb-3">📊</div>
                    <h3 className="font-semibold mb-2">Share Fees</h3>
                    <p className="text-sm text-gray-400">Voters receive a share of trading fees from voted pools</p>
                </div>
            </motion.div>
        </div>
    );
}
