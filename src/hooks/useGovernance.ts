'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi';
import { Address, encodeFunctionData, keccak256, toBytes, parseUnits } from 'viem';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';

// Governor states
export enum ProposalState {
    Pending = 0,
    Active = 1,
    Canceled = 2,
    Defeated = 3,
    Succeeded = 4,
    Queued = 5,
    Expired = 6,
    Executed = 7,
}

export const PROPOSAL_STATE_LABELS: Record<ProposalState, string> = {
    [ProposalState.Pending]: 'Pending',
    [ProposalState.Active]: 'Active',
    [ProposalState.Canceled]: 'Canceled',
    [ProposalState.Defeated]: 'Defeated',
    [ProposalState.Succeeded]: 'Succeeded',
    [ProposalState.Queued]: 'Queued',
    [ProposalState.Expired]: 'Expired',
    [ProposalState.Executed]: 'Executed',
};

export interface Proposal {
    id: bigint;
    proposer: Address;
    description: string;
    state: ProposalState;
    forVotes: bigint;
    againstVotes: bigint;
    abstainVotes: bigint;
    startBlock: bigint;
    endBlock: bigint;
    targets: Address[];
    values: bigint[];
    calldatas: `0x${string}`[];
}

// VetoGovernor ABI (requires tokenId for propose and castVote)
const GOVERNOR_ABI = [
    {
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'targets', type: 'address[]' },
            { name: 'values', type: 'uint256[]' },
            { name: 'calldatas', type: 'bytes[]' },
            { name: 'description', type: 'string' },
        ],
        name: 'propose',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'proposalId', type: 'uint256' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'support', type: 'uint8' },
        ],
        name: 'castVote',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'targets', type: 'address[]' },
            { name: 'values', type: 'uint256[]' },
            { name: 'calldatas', type: 'bytes[]' },
            { name: 'descriptionHash', type: 'bytes32' },
        ],
        name: 'execute',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [{ name: 'proposalId', type: 'uint256' }],
        name: 'state',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'proposalId', type: 'uint256' }],
        name: 'proposalVotes',
        outputs: [
            { name: 'againstVotes', type: 'uint256' },
            { name: 'forVotes', type: 'uint256' },
            { name: 'abstainVotes', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'proposalThreshold',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'votingDelay',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'votingPeriod',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'proposalId', type: 'uint256' }, { name: 'account', type: 'address' }],
        name: 'hasVoted',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// Voter ABI for creating governance actions
const VOTER_ABI = [
    {
        inputs: [{ name: '_token', type: 'address' }, { name: '_bool', type: 'bool' }],
        name: 'whitelistToken',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_poolFactory', type: 'address' }, { name: '_pool', type: 'address' }],
        name: 'createGauge',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_governor', type: 'address' }],
        name: 'setGovernor',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

export function useGovernance() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const { writeContractAsync, isPending } = useWriteContract();

    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Read governance params
    const { data: proposalThreshold } = useReadContract({
        address: V2_CONTRACTS.ProtocolGovernor as Address,
        abi: GOVERNOR_ABI,
        functionName: 'proposalThreshold',
    });

    const { data: votingDelay } = useReadContract({
        address: V2_CONTRACTS.ProtocolGovernor as Address,
        abi: GOVERNOR_ABI,
        functionName: 'votingDelay',
    });

    const { data: votingPeriod } = useReadContract({
        address: V2_CONTRACTS.ProtocolGovernor as Address,
        abi: GOVERNOR_ABI,
        functionName: 'votingPeriod',
    });

    // Fetch past proposals from events
    const fetchProposals = useCallback(async () => {
        if (!publicClient) return;

        setIsLoading(true);
        try {
            // Get current block and scan from first governance block to now
            const currentBlock = await publicClient.getBlockNumber();
            const PROPOSAL_START_BLOCK = BigInt(185318000); // First governance proposals
            const PROPOSAL_END_BLOCK = currentBlock;

            // Batch getLogs requests to avoid RPC limits (25k block max per request)
            const BATCH_SIZE = BigInt(25000);
            const allLogs: any[] = [];

            for (let from = PROPOSAL_START_BLOCK; from <= PROPOSAL_END_BLOCK; from += BATCH_SIZE) {
                const to = from + BATCH_SIZE - BigInt(1) > PROPOSAL_END_BLOCK
                    ? PROPOSAL_END_BLOCK
                    : from + BATCH_SIZE - BigInt(1);

                try {
                    const logs = await publicClient.getLogs({
                        address: V2_CONTRACTS.ProtocolGovernor as Address,
                        event: {
                            type: 'event',
                            name: 'ProposalCreated',
                            inputs: [
                                { indexed: false, name: 'proposalId', type: 'uint256' },
                                { indexed: false, name: 'proposer', type: 'address' },
                                { indexed: false, name: 'targets', type: 'address[]' },
                                { indexed: false, name: 'values', type: 'uint256[]' },
                                { indexed: false, name: 'signatures', type: 'string[]' },
                                { indexed: false, name: 'calldatas', type: 'bytes[]' },
                                { indexed: false, name: 'voteStart', type: 'uint256' },
                                { indexed: false, name: 'voteEnd', type: 'uint256' },
                                { indexed: false, name: 'description', type: 'string' },
                            ],
                        },
                        fromBlock: from,
                        toBlock: to,
                    });
                    allLogs.push(...logs);
                } catch (e) {
                    console.warn(`Failed to fetch logs from ${from} to ${to}:`, e);
                }
            }

            const logs = allLogs;

            // Parse and enrich proposals
            const parsedProposals: Proposal[] = [];

            for (const log of logs) {
                try {
                    const args = log.args as any;
                    const proposalId = args.proposalId as bigint;

                    // Get current state
                    const state = await publicClient.readContract({
                        address: V2_CONTRACTS.ProtocolGovernor as Address,
                        abi: GOVERNOR_ABI,
                        functionName: 'state',
                        args: [proposalId],
                    }) as number;

                    // Get votes
                    const [againstVotes, forVotes, abstainVotes] = await publicClient.readContract({
                        address: V2_CONTRACTS.ProtocolGovernor as Address,
                        abi: GOVERNOR_ABI,
                        functionName: 'proposalVotes',
                        args: [proposalId],
                    }) as [bigint, bigint, bigint];

                    parsedProposals.push({
                        id: proposalId,
                        proposer: args.proposer as Address,
                        description: args.description as string,
                        state: state as ProposalState,
                        forVotes,
                        againstVotes,
                        abstainVotes,
                        startBlock: args.voteStart as bigint,
                        endBlock: args.voteEnd as bigint,
                        targets: args.targets as Address[],
                        values: args.values as bigint[],
                        calldatas: args.calldatas as `0x${string}`[],
                    });
                } catch (e) {
                    console.error('Error parsing proposal:', e);
                }
            }

            // Sort by ID descending (newest first)
            parsedProposals.sort((a, b) => Number(b.id - a.id));
            setProposals(parsedProposals);
        } catch (err: any) {
            console.error('Error fetching proposals:', err);
            setError('Failed to fetch proposals');
        } finally {
            setIsLoading(false);
        }
    }, [publicClient]);

    // Fetch proposals on mount
    useEffect(() => {
        fetchProposals();
    }, [fetchProposals]);

    // Create proposal to whitelist a token
    const proposeWhitelistToken = useCallback(async (
        tokenId: bigint,
        tokenAddress: Address,
        description: string
    ) => {
        setError(null);
        try {
            const calldata = encodeFunctionData({
                abi: VOTER_ABI,
                functionName: 'whitelistToken',
                args: [tokenAddress, true],
            });

            const hash = await writeContractAsync({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'propose',
                args: [
                    tokenId,
                    [V2_CONTRACTS.Voter as Address],
                    [BigInt(0)],
                    [calldata],
                    description,
                ],
            });

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Failed to create proposal');
            return null;
        }
    }, [writeContractAsync]);

    // Create proposal to create a gauge
    const proposeCreateGauge = useCallback(async (
        tokenId: bigint,
        poolFactory: Address,
        poolAddress: Address,
        description: string
    ) => {
        setError(null);
        try {
            const calldata = encodeFunctionData({
                abi: VOTER_ABI,
                functionName: 'createGauge',
                args: [poolFactory, poolAddress],
            });

            const hash = await writeContractAsync({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'propose',
                args: [
                    tokenId,
                    [V2_CONTRACTS.Voter as Address],
                    [BigInt(0)],
                    [calldata],
                    description,
                ],
            });

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Failed to create proposal');
            return null;
        }
    }, [writeContractAsync]);

    // Create proposal to set new governor (transfer control back to your wallet)
    const proposeSetGovernor = useCallback(async (
        tokenId: bigint,
        newGovernor: Address,
        description: string
    ) => {
        setError(null);
        try {
            const calldata = encodeFunctionData({
                abi: VOTER_ABI,
                functionName: 'setGovernor',
                args: [newGovernor],
            });

            const hash = await writeContractAsync({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'propose',
                args: [
                    tokenId,
                    [V2_CONTRACTS.Voter as Address],
                    [BigInt(0)],
                    [calldata],
                    description,
                ],
            });

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Failed to create proposal');
            return null;
        }
    }, [writeContractAsync]);

    // Cast vote on a proposal
    const castVote = useCallback(async (proposalId: bigint, tokenId: bigint, support: 0 | 1 | 2) => {
        // 0 = Against, 1 = For, 2 = Abstain
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'castVote',
                args: [proposalId, tokenId, support],
            });

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Failed to cast vote');
            return null;
        }
    }, [writeContractAsync]);

    // Execute a passed proposal
    const executeProposal = useCallback(async (
        targets: Address[],
        values: bigint[],
        calldatas: `0x${string}`[],
        description: string
    ) => {
        setError(null);
        try {
            const descriptionHash = keccak256(toBytes(description));

            const hash = await writeContractAsync({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'execute',
                args: [targets, values, calldatas, descriptionHash],
            });

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Failed to execute proposal');
            return null;
        }
    }, [writeContractAsync]);

    // Check if user has voted on a proposal
    const checkHasVoted = useCallback(async (proposalId: bigint): Promise<boolean> => {
        if (!address || !publicClient) return false;

        try {
            const hasVoted = await publicClient.readContract({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'hasVoted',
                args: [proposalId, address],
            });
            return hasVoted;
        } catch {
            return false;
        }
    }, [address, publicClient]);

    // Get proposal state
    const getProposalState = useCallback(async (proposalId: bigint): Promise<ProposalState | null> => {
        if (!publicClient) return null;

        try {
            const state = await publicClient.readContract({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'state',
                args: [proposalId],
            });
            return state as ProposalState;
        } catch {
            return null;
        }
    }, [publicClient]);

    // Get proposal votes
    const getProposalVotes = useCallback(async (proposalId: bigint) => {
        if (!publicClient) return null;

        try {
            const [againstVotes, forVotes, abstainVotes] = await publicClient.readContract({
                address: V2_CONTRACTS.ProtocolGovernor as Address,
                abi: GOVERNOR_ABI,
                functionName: 'proposalVotes',
                args: [proposalId],
            });
            return { againstVotes, forVotes, abstainVotes };
        } catch {
            return null;
        }
    }, [publicClient]);

    return {
        proposals,
        isLoading: isLoading || isPending,
        error,
        proposalThreshold,
        votingDelay,
        votingPeriod,
        proposeWhitelistToken,
        proposeCreateGauge,
        proposeSetGovernor,
        castVote,
        executeProposal,
        checkHasVoted,
        getProposalState,
        getProposalVotes,
        refetchProposals: fetchProposals,
    };
}
