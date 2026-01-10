'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { Address, parseUnits } from 'viem';
import { V2_CONTRACTS } from '@/config/contracts';
import { usePoolData, GaugeInfo, RewardToken } from '@/providers/PoolDataProvider';
import { VOTER_EXTENDED_ABI, BRIBE_VOTING_REWARD_ABI, ERC20_ABI } from '@/config/abis';
import { getPrimaryRpc } from '@/utils/rpc';

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

export interface VoteInfo {
    pool: string;
    weight: bigint;
}

export function useVoter() {
    const { address, isConnected } = useAccount();
    const [error, setError] = useState<string | null>(null);
    const [existingVotes, setExistingVotes] = useState<Record<string, bigint>>({});
    const [lastVotedTimestamp, setLastVotedTimestamp] = useState<bigint | null>(null);

    const { writeContractAsync } = useWriteContract();

    // Get gauge data from global provider (instant!)
    const { gauges, totalVoteWeight, gaugesLoading, refetch } = usePoolData();

    // Fetch existing votes for a veNFT across all pools
    const fetchExistingVotes = useCallback(async (tokenId: bigint) => {
        if (!tokenId || gauges.length === 0) return;

        console.log('Fetching existing votes for tokenId:', tokenId.toString(), 'gauges:', gauges.length);

        try {
            // votes(uint256,address) selector = 0xd23254b4
            const calls: Array<{
                jsonrpc: '2.0';
                method: 'eth_call';
                params: [{ to: string; data: string }, 'latest'];
                id: string | number;
            }> = gauges.map(gauge => ({
                jsonrpc: '2.0' as const,
                method: 'eth_call' as const,
                params: [{
                    to: V2_CONTRACTS.Voter,
                    data: `0xd23254b4${tokenId.toString(16).padStart(64, '0')}${gauge.pool.slice(2).toLowerCase().padStart(64, '0')}`
                }, 'latest' as const],
                id: gauge.pool,
            }));

            // lastVoted(uint256) selector = 0xf3594be0
            calls.push({
                jsonrpc: '2.0' as const,
                method: 'eth_call' as const,
                params: [{
                    to: V2_CONTRACTS.Voter,
                    data: `0xf3594be0${tokenId.toString(16).padStart(64, '0')}`
                }, 'latest' as const],
                id: 'lastVoted',
            });

            const response = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(calls),
            });

            const results = await response.json();
            console.log('Vote fetch results:', results);

            const votesMap: Record<string, bigint> = {};
            for (const result of results) {
                if (result.id === 'lastVoted') {
                    if (result.result && result.result !== '0x') {
                        setLastVotedTimestamp(BigInt(result.result));
                        console.log('Last voted timestamp:', BigInt(result.result).toString());
                    }
                } else if (result.result && result.result !== '0x' && result.result !== '0x' + '0'.repeat(64)) {
                    votesMap[result.id.toLowerCase()] = BigInt(result.result);
                    console.log('Found vote for pool:', result.id, 'weight:', BigInt(result.result).toString());
                }
            }

            console.log('Final votesMap:', votesMap);
            setExistingVotes(votesMap);
        } catch (err) {
            console.error('Error fetching existing votes:', err);
        }
    }, [gauges]);

    // Check if veNFT has voted this epoch
    const hasVotedThisEpoch = useCallback((tokenId: bigint): boolean => {
        if (!lastVotedTimestamp) return false;
        // Epoch is 7 days, starts on Thursday 00:00 UTC
        const WEEK = BigInt(7 * 24 * 60 * 60);
        const currentEpochStart = (BigInt(Math.floor(Date.now() / 1000)) / WEEK) * WEEK;
        return lastVotedTimestamp >= currentEpochStart;
    }, [lastVotedTimestamp]);

    // Get bribe contract address for a gauge
    const getBribeAddress = useCallback(async (gaugeAddress: string): Promise<string | null> => {
        try {
            const response = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: V2_CONTRACTS.Voter,
                        data: `0x929c8dcd${gaugeAddress.slice(2).padStart(64, '0')}`
                    }, 'latest'],
                    id: 1,
                }),
            });
            const result = await response.json();
            if (result.result && result.result !== '0x' && result.result !== '0x' + '0'.repeat(64)) {
                return '0x' + result.result.slice(-40);
            }
            return null;
        } catch (err) {
            console.error('Error getting bribe address:', err);
            return null;
        }
    }, []);

    // Add incentive (bribe) to a pool
    const addIncentive = useCallback(async (
        poolAddress: string,
        tokenAddress: string,
        amount: string,
        tokenDecimals: number
    ) => {
        setError(null);
        try {
            // Get gauge address for pool
            const gaugeResponse = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: V2_CONTRACTS.Voter,
                        data: `0xb9a09fd5${poolAddress.slice(2).padStart(64, '0')}`
                    }, 'latest'],
                    id: 1,
                }),
            });
            const gaugeResult = await gaugeResponse.json();
            if (!gaugeResult.result || gaugeResult.result === '0x' + '0'.repeat(64)) {
                throw new Error('No gauge found for this pool');
            }
            const gaugeAddress = '0x' + gaugeResult.result.slice(-40);

            // Get bribe address
            const bribeAddress = await getBribeAddress(gaugeAddress);
            if (!bribeAddress) {
                throw new Error('No bribe contract found for this gauge');
            }

            const amountWei = parseUnits(amount, tokenDecimals);

            // First approve the bribe contract to spend tokens
            await writeContractAsync({
                address: tokenAddress as Address,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [bribeAddress as Address, amountWei],
            });

            // Then add the incentive
            const hash = await writeContractAsync({
                address: bribeAddress as Address,
                abi: BRIBE_VOTING_REWARD_ABI,
                functionName: 'notifyRewardAmount',
                args: [tokenAddress as Address, amountWei],
            });

            // Refetch gauge data
            await refetch();

            return { hash };
        } catch (err: any) {
            setError(err.message || 'Failed to add incentive');
            return null;
        }
    }, [writeContractAsync, getBribeAddress, refetch]);

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
            // Refetch existing votes
            await fetchExistingVotes(tokenId);

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
            // Clear existing votes
            setExistingVotes({});
            setLastVotedTimestamp(null);

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
        // New functions
        existingVotes,
        lastVotedTimestamp,
        fetchExistingVotes,
        hasVotedThisEpoch,
        addIncentive,
        getBribeAddress,
    };
}

