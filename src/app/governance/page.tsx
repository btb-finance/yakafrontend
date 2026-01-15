'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { formatUnits, Address } from 'viem';
import { useGovernance, ProposalState, PROPOSAL_STATE_LABELS } from '@/hooks/useGovernance';
import { useVeWIND } from '@/hooks/useVeWIND';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';
import { DEFAULT_TOKEN_LIST } from '@/config/tokens';
import { GAUGE_LIST } from '@/config/gauges';

type ProposalType = 'whitelist' | 'gauge' | 'setGovernor';

export default function GovernancePage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'proposals' | 'create'>('proposals');
    const [txHash, setTxHash] = useState<string | null>(null);

    // Create proposal form state
    const [proposalType, setProposalType] = useState<ProposalType>('whitelist');
    const [tokenAddress, setTokenAddress] = useState('');
    const [poolAddress, setPoolAddress] = useState('');
    const [newGovernorAddress, setNewGovernorAddress] = useState('');
    const [proposalDescription, setProposalDescription] = useState('');

    const {
        proposals,
        isLoading,
        error,
        proposalThreshold,
        votingDelay,
        votingPeriod,
        proposeWhitelistToken,
        proposeCreateGauge,
        proposeSetGovernor,
        castVote,
        executeProposal,
    } = useGovernance();

    const { positions, delegateForGovernance, isLoading: veLoading } = useVeWIND();
    const hasVotingPower = positions.length > 0;
    const totalVotingPower = positions.reduce((acc, p) => acc + p.votingPower, BigInt(0));
    const hasPermanentLock = positions.some(p => p.isPermanent);

    // Delegate handler - delegates the first permanent veNFT to itself
    const handleDelegate = async () => {
        const permanentPosition = positions.find(p => p.isPermanent);
        if (!permanentPosition) {
            alert('You need a permanent lock veNFT to delegate for governance voting');
            return;
        }

        const confirmed = confirm(
            `This will delegate veNFT #${permanentPosition.tokenId} to itself for governance voting.\n\n` +
            `This is REQUIRED to vote on ProtocolGovernor proposals.\n\n` +
            `Continue?`
        );

        if (!confirmed) return;

        const result = await delegateForGovernance(permanentPosition.tokenId);
        if (result) {
            setTxHash(result.hash);
            alert('Delegation successful! You can now vote on governance proposals.');
        }
    };

    // Handle create proposal
    const handleCreateProposal = async () => {
        if (!proposalDescription) return;

        // Get first permanent veNFT tokenId for proposing
        const permanentPosition = positions.find(p => p.isPermanent);
        if (!permanentPosition) {
            alert('You need a permanent lock veNFT to create proposals');
            return;
        }
        const tokenId = permanentPosition.tokenId;

        let result;
        if (proposalType === 'whitelist') {
            if (!tokenAddress) return;
            result = await proposeWhitelistToken(
                tokenId,
                tokenAddress as Address,
                proposalDescription
            );
        } else if (proposalType === 'setGovernor') {
            // Transfer governor role to specified address (or connected wallet as fallback)
            const targetGovernor = newGovernorAddress || address;
            if (!targetGovernor) {
                alert('Please enter a governor address or connect your wallet');
                return;
            }
            result = await proposeSetGovernor(
                tokenId,
                targetGovernor as Address,
                proposalDescription
            );
        } else {
            if (!poolAddress) return;

            // Auto-detect factory from pool by calling pool.factory()
            try {
                const response = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: poolAddress, data: '0xc45a0155' }, 'latest'], // factory() selector
                        id: 1
                    })
                });
                const factoryResult = await response.json();

                if (!factoryResult.result || factoryResult.result === '0x') {
                    alert('Could not detect pool factory. Is this a valid pool address?');
                    return;
                }

                const poolFactory = ('0x' + factoryResult.result.slice(-40)) as Address;
                console.log('Auto-detected factory:', poolFactory);

                result = await proposeCreateGauge(
                    tokenId,
                    poolFactory,
                    poolAddress as Address,
                    proposalDescription
                );
            } catch (e) {
                console.error('Failed to detect factory:', e);
                alert('Failed to detect pool factory');
                return;
            }
        }

        if (result) {
            setTxHash(result.hash);
            setTokenAddress('');
            setPoolAddress('');
            setProposalDescription('');
        }
    };

    // Quick select token
    const selectToken = (addr: string) => {
        setTokenAddress(addr);
    };

    return (
        <div className="container mx-auto px-3 sm:px-6 py-4">
            {/* Header */}
            <motion.div
                className="mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-xl sm:text-2xl font-bold">
                    <span className="gradient-text">Governance</span>
                </h1>
                <p className="text-xs sm:text-sm text-gray-400">
                    Propose and vote on protocol changes
                </p>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="glass-card p-2 sm:p-3 text-center">
                    <div className="text-[10px] text-gray-400">Your Voting Power</div>
                    <div className="text-sm sm:text-lg font-bold">
                        {parseFloat(formatUnits(totalVotingPower, 18)).toFixed(2)}
                    </div>
                </div>
                <div className="glass-card p-2 sm:p-3 text-center">
                    <div className="text-[10px] text-gray-400">Proposal Threshold</div>
                    <div className="text-sm sm:text-lg font-bold">
                        {proposalThreshold ? parseFloat(formatUnits(proposalThreshold, 18)).toFixed(0) : '...'}
                    </div>
                </div>
                <div className="glass-card p-2 sm:p-3 text-center">
                    <div className="text-[10px] text-gray-400">Voting Period</div>
                    <div className="text-sm sm:text-lg font-bold">
                        {votingPeriod ? `${Number(votingPeriod) / 86400}d` : '...'}
                    </div>
                </div>
            </div>

            {/* Delegate for Governance Button - Only show for permanent lock holders */}
            {hasPermanentLock && (
                <div className="mb-4 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h4 className="font-semibold text-purple-400 text-sm">Enable Governance Voting</h4>
                            <p className="text-xs text-gray-400">
                                Delegate your veNFT to vote on ProtocolGovernor proposals
                            </p>
                        </div>
                        <button
                            onClick={handleDelegate}
                            disabled={veLoading}
                            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition disabled:opacity-50 whitespace-nowrap"
                        >
                            {veLoading ? '...' : 'Delegate'}
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setActiveTab('proposals')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all border-2 ${activeTab === 'proposals'
                        ? 'bg-gradient-to-r from-primary to-secondary text-white border-primary shadow-lg shadow-primary/30'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:border-primary/50'
                        }`}
                >
                    📋 Proposals
                </button>
                <button
                    onClick={() => setActiveTab('create')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all border-2 ${activeTab === 'create'
                        ? 'bg-gradient-to-r from-primary to-secondary text-white border-primary shadow-lg shadow-primary/30'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:border-primary/50'
                        }`}
                >
                    ✏️ Create
                </button>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Success Display */}
            {txHash && (
                <motion.div
                    className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Transaction submitted!
                    </div>
                    <a href={`https://seiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline text-sm">
                        View on SeiScan →
                    </a>
                </motion.div>
            )}

            {/* Proposals Tab */}
            {activeTab === 'proposals' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {isLoading ? (
                        <div className="glass-card p-6 text-center">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-gray-400 text-sm">Loading proposals...</p>
                        </div>
                    ) : proposals.length === 0 ? (
                        <div className="glass-card p-6 text-center">
                            <div className="text-4xl mb-4">📋</div>
                            <h3 className="text-lg font-semibold mb-2">No Proposals Yet</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Be the first to create a governance proposal.
                            </p>
                            <button
                                onClick={() => setActiveTab('create')}
                                className="px-6 py-2 rounded-lg bg-primary text-white font-medium text-sm"
                            >
                                Create Proposal
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {proposals.map((proposal) => {
                                const stateColors: Record<ProposalState, string> = {
                                    [ProposalState.Pending]: 'bg-yellow-500/20 text-yellow-400',
                                    [ProposalState.Active]: 'bg-blue-500/20 text-blue-400',
                                    [ProposalState.Canceled]: 'bg-gray-500/20 text-gray-400',
                                    [ProposalState.Defeated]: 'bg-red-500/20 text-red-400',
                                    [ProposalState.Succeeded]: 'bg-green-500/20 text-green-400',
                                    [ProposalState.Queued]: 'bg-purple-500/20 text-purple-400',
                                    [ProposalState.Expired]: 'bg-gray-500/20 text-gray-400',
                                    [ProposalState.Executed]: 'bg-green-500/20 text-green-400',
                                };

                                const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
                                const forPercent = totalVotes > BigInt(0) ? Number(proposal.forVotes * BigInt(100) / totalVotes) : 0;
                                const againstPercent = totalVotes > BigInt(0) ? Number(proposal.againstVotes * BigInt(100) / totalVotes) : 0;

                                return (
                                    <div key={proposal.id.toString()} className="glass-card p-4">
                                        {/* Header */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs text-gray-500">#{proposal.id.toString().slice(0, 8)}...</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${stateColors[proposal.state]}`}>
                                                        {PROPOSAL_STATE_LABELS[proposal.state]}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium line-clamp-2">{proposal.description}</p>
                                            </div>
                                        </div>

                                        {/* Vote Progress */}
                                        <div className="mb-3">
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-green-400">For: {forPercent}%</span>
                                                <span className="text-red-400">Against: {againstPercent}%</span>
                                            </div>
                                            <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
                                                <div className="bg-green-500 h-full" style={{ width: `${forPercent}%` }} />
                                                <div className="bg-red-500 h-full" style={{ width: `${againstPercent}%` }} />
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                Total: {parseFloat(formatUnits(totalVotes, 18)).toLocaleString()} votes
                                            </div>
                                        </div>

                                        {/* Vote Buttons - only for Active proposals */}
                                        {proposal.state === ProposalState.Active && hasVotingPower && hasPermanentLock && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        const perm = positions.find(p => p.isPermanent);
                                                        if (perm) castVote(proposal.id, perm.tokenId, 1);
                                                    }}
                                                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
                                                >
                                                    👍 For
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const perm = positions.find(p => p.isPermanent);
                                                        if (perm) castVote(proposal.id, perm.tokenId, 0);
                                                    }}
                                                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                                                >
                                                    👎 Against
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const perm = positions.find(p => p.isPermanent);
                                                        if (perm) castVote(proposal.id, perm.tokenId, 2);
                                                    }}
                                                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition"
                                                >
                                                    🤷 Abstain
                                                </button>
                                            </div>
                                        )}

                                        {/* Execute Button - only for Succeeded proposals */}
                                        {proposal.state === ProposalState.Succeeded && (
                                            <button
                                                onClick={() => executeProposal(
                                                    proposal.targets,
                                                    proposal.values,
                                                    proposal.calldatas,
                                                    proposal.description
                                                )}
                                                className="w-full py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 transition"
                                            >
                                                ✅ Execute Proposal
                                            </button>
                                        )}

                                        {/* Proposer info */}
                                        <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-gray-500">
                                            Proposed by: {proposal.proposer.slice(0, 6)}...{proposal.proposer.slice(-4)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Info about governance */}
                    <div className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <h4 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                            <span>ℹ️</span> How Governance Works
                        </h4>
                        <ul className="text-sm text-gray-300 space-y-1">
                            <li>• <strong>Propose:</strong> Create a proposal to whitelist tokens or create gauges</li>
                            <li>• <strong>Vote:</strong> veWIND holders vote For, Against, or Abstain</li>
                            <li>• <strong>Execute:</strong> After passing, anyone can execute the proposal</li>
                            <li>• <strong>Timelock:</strong> ~7 days from proposal to execution</li>
                        </ul>
                    </div>
                </motion.div>
            )}

            {/* Create Tab */}
            {activeTab === 'create' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {!isConnected ? (
                        <div className="glass-card p-6 text-center">
                            <h3 className="text-lg font-semibold mb-2">Connect Wallet</h3>
                            <p className="text-gray-400 text-sm">
                                Connect your wallet to create proposals
                            </p>
                        </div>
                    ) : !hasVotingPower ? (
                        <div className="glass-card p-6 text-center">
                            <div className="text-4xl mb-4"></div>
                            <h3 className="text-lg font-semibold mb-2">Lock WIND to Propose</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                You need veWIND to create governance proposals
                            </p>
                            <a
                                href="/vote"
                                className="inline-block px-6 py-2 rounded-lg bg-primary text-white font-medium text-sm"
                            >
                                Lock WIND →
                            </a>
                        </div>
                    ) : (
                        <div className="glass-card p-4 sm:p-6">
                            <h3 className="text-lg font-semibold mb-4">Create Proposal</h3>

                            {/* Proposal Type */}
                            <div className="mb-4">
                                <label className="text-sm text-gray-400 mb-2 block">Proposal Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => setProposalType('whitelist')}
                                        className={`p-3 rounded-xl text-center transition ${proposalType === 'whitelist'
                                            ? 'bg-primary/20 border border-primary/50 text-white'
                                            : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="text-2xl mb-1">🪙</div>
                                        <div className="text-xs font-medium">Whitelist Token</div>
                                    </button>
                                    <button
                                        onClick={() => setProposalType('gauge')}
                                        className={`p-3 rounded-xl text-center transition ${proposalType === 'gauge'
                                            ? 'bg-primary/20 border border-primary/50 text-white'
                                            : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="text-2xl mb-1">📊</div>
                                        <div className="text-xs font-medium">Create Gauge</div>
                                    </button>
                                    <button
                                        onClick={() => setProposalType('setGovernor')}
                                        className={`p-3 rounded-xl text-center transition ${proposalType === 'setGovernor'
                                            ? 'bg-red-500/20 border border-red-500/50 text-white'
                                            : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="text-2xl mb-1">👑</div>
                                        <div className="text-xs font-medium">Transfer Governor</div>
                                    </button>
                                </div>
                            </div>

                            {/* Whitelist Token Form */}
                            {proposalType === 'whitelist' && (
                                <div className="mb-4">
                                    <label className="text-sm text-gray-400 mb-2 block">Token Address</label>

                                    {/* Quick Select */}
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {DEFAULT_TOKEN_LIST.map((token) => (
                                            <button
                                                key={token.symbol}
                                                onClick={() => selectToken(token.address)}
                                                className={`px-2 py-1 text-xs rounded-lg transition ${tokenAddress === token.address
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                    }`}
                                            >
                                                {token.symbol}
                                            </button>
                                        ))}
                                    </div>

                                    <input
                                        type="text"
                                        value={tokenAddress}
                                        onChange={(e) => setTokenAddress(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                    />
                                </div>
                            )}

                            {/* Create Gauge Form */}
                            {proposalType === 'gauge' && (
                                <div className="mb-4">
                                    <label className="text-sm text-gray-400 mb-2 block">Pool Address</label>

                                    {/* Quick Select Pools */}
                                    <div className="flex flex-wrap gap-1 mb-2 max-h-32 overflow-y-auto">
                                        {GAUGE_LIST.filter(g => !g.gauge).map((pool) => (
                                            <button
                                                key={pool.pool}
                                                onClick={() => setPoolAddress(pool.pool)}
                                                className={`px-2 py-1 text-xs rounded-lg transition ${poolAddress === pool.pool
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                    }`}
                                            >
                                                {pool.symbol0}/{pool.symbol1}
                                            </button>
                                        ))}
                                    </div>

                                    <input
                                        type="text"
                                        value={poolAddress}
                                        onChange={(e) => setPoolAddress(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Only pools without gauges shown above. Enter pool address to create a gauge for it.
                                    </p>
                                </div>
                            )}

                            {/* Transfer Governor Form */}
                            {proposalType === 'setGovernor' && (
                                <div className="mb-4">
                                    <label className="text-sm text-gray-400 mb-2 block">New Governor Address</label>

                                    {/* Quick Select */}
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        <button
                                            onClick={() => setNewGovernorAddress(address || '')}
                                            className={`px-2 py-1 text-xs rounded-lg transition ${newGovernorAddress === address
                                                ? 'bg-primary text-white'
                                                : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                }`}
                                        >
                                            My Wallet
                                        </button>
                                        <button
                                            onClick={() => setNewGovernorAddress('0x467B2e016DC9cb492141E23303B2D00dEB0a5159')}
                                            className={`px-2 py-1 text-xs rounded-lg transition ${newGovernorAddress === '0x467B2e016DC9cb492141E23303B2D00dEB0a5159'
                                                ? 'bg-primary text-white'
                                                : 'bg-white/5 hover:bg-white/10 text-gray-400'
                                                }`}
                                        >
                                            Safe Wallet
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        value={newGovernorAddress}
                                        onChange={(e) => setNewGovernorAddress(e.target.value)}
                                        placeholder="0x... (leave empty to use connected wallet)"
                                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                    />

                                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                        <p className="text-xs text-gray-400">
                                            Warning: This will transfer Voter control to:
                                        </p>
                                        <code className="text-xs text-green-400 block mt-1 break-all">
                                            {newGovernorAddress || address || 'No address specified'}
                                        </code>
                                    </div>
                                </div>
                            )}

                            {/* Description */}
                            <div className="mb-4">
                                <label className="text-sm text-gray-400 mb-2 block">Description</label>
                                <textarea
                                    value={proposalDescription}
                                    onChange={(e) => setProposalDescription(e.target.value)}
                                    placeholder="Describe your proposal..."
                                    rows={3}
                                    className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-sm resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleCreateProposal}
                                disabled={
                                    isLoading ||
                                    !proposalDescription ||
                                    (proposalType === 'whitelist' ? !tokenAddress : !poolAddress)
                                }
                                className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-primary to-secondary text-white disabled:opacity-50"
                            >
                                {isLoading ? 'Creating...' : 'Create Proposal'}
                            </button>

                            {/* Info */}
                            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                <p className="text-xs text-yellow-400">
                                    Creating a proposal requires {proposalThreshold ? formatUnits(proposalThreshold, 18) : '...'} veWIND voting power.
                                    After creation, the proposal enters a voting period of ~{votingPeriod ? Number(votingPeriod) / 86400 : '...'} days.
                                </p>
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
}
