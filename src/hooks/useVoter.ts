'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { Address } from 'viem';
import { V2_CONTRACTS } from '@/config/contracts';
import { usePoolData, GaugeInfo, RewardToken } from '@/providers/PoolDataProvider';

// Re-export types for backward compatibility
export type { GaugeInfo, RewardToken };

// Voter ABI (only what we need for write operations)
const VOTER_ABI = [
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
] as const;

export function useVoter() {
    const { address, isConnected } = useAccount();
    const [error, setError] = useState<string | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Get gauge data from global provider (instant!)
    const { gauges, totalVoteWeight, gaugesLoading, refetch } = usePoolData();

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

            // Refetch global data after voting
            await refetch();

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

            // Refetch global data after reset
            await refetch();

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Reset failed');
            return null;
        }
    };

    return {
        gauges,
        totalWeight: totalVoteWeight,
        poolCount: gauges.length,
        isLoading: gaugesLoading,
        error,
        vote,
        resetVotes,
        refetch,
    };
}
