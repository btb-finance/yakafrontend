'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useWriteContract } from '@/hooks/useWriteContract';
import { parseUnits, Address } from 'viem';
import { V2_CONTRACTS } from '@/config/contracts';
import { VOTING_ESCROW_ABI, REWARDS_DISTRIBUTOR_ABI, ERC20_ABI } from '@/config/abis';
import { usePoolData } from '@/providers/PoolDataProvider';

// Lock duration presets in seconds
export const LOCK_DURATIONS = {
    '1W': 7 * 24 * 60 * 60,
    '1M': 30 * 24 * 60 * 60,
    '3M': 90 * 24 * 60 * 60,
    '6M': 180 * 24 * 60 * 60,
    '1Y': 365 * 24 * 60 * 60,
    '2Y': 730 * 24 * 60 * 60,
    '4Y': 1460 * 24 * 60 * 60, // Max lock
} as const;

export interface VeWINDPosition {
    tokenId: bigint;
    amount: bigint;
    end: bigint;
    isPermanent: boolean;
    votingPower: bigint;
    claimable: bigint;
    hasVoted: boolean;
}

export function useVeWIND() {
    const { address } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Use prefetched veNFT data from global provider instead of fetching locally
    const { veNFTs, veNFTsLoading, refetchVeNFTs } = usePoolData();

    // Map provider VeNFT data to VeWINDPosition format
    const positions: VeWINDPosition[] = veNFTs.map(nft => ({
        tokenId: nft.tokenId,
        amount: nft.amount,
        end: nft.end,
        isPermanent: nft.isPermanent,
        votingPower: nft.votingPower,
        claimable: nft.claimable,
        hasVoted: nft.hasVoted,
    }));

    const { writeContractAsync } = useWriteContract();

    // Create new lock
    const createLock = useCallback(async (amount: string, durationSeconds: number) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const amountWei = parseUnits(amount, 18);

            // Approve WIND
            await writeContractAsync({
                address: V2_CONTRACTS.YAKA as Address,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [V2_CONTRACTS.VotingEscrow as Address, amountWei],
            });

            // Create lock
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'createLock',
                args: [amountWei, BigInt(durationSeconds)],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Create lock error:', err);
            setError(err.message || 'Failed to create lock');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Increase lock amount
    const increaseAmount = useCallback(async (tokenId: bigint, amount: string) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const amountWei = parseUnits(amount, 18);

            // Approve WIND
            await writeContractAsync({
                address: V2_CONTRACTS.YAKA as Address,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [V2_CONTRACTS.VotingEscrow as Address, amountWei],
            });

            // Increase amount
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'increaseAmount',
                args: [tokenId, amountWei],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Increase amount error:', err);
            setError(err.message || 'Failed to increase amount');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Extend lock duration
    const extendLock = useCallback(async (tokenId: bigint, durationSeconds: number) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'increaseUnlockTime',
                args: [tokenId, BigInt(durationSeconds)],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Extend lock error:', err);
            setError(err.message || 'Failed to extend lock');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Withdraw expired lock
    const withdraw = useCallback(async (tokenId: bigint) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'withdraw',
                args: [tokenId],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Withdraw error:', err);
            setError(err.message || 'Failed to withdraw');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Claim rebases
    const claimRebases = useCallback(async (tokenId: bigint) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.RewardsDistributor as Address,
                abi: REWARDS_DISTRIBUTOR_ABI,
                functionName: 'claim',
                args: [tokenId],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Claim rebases error:', err);
            setError(err.message || 'Failed to claim rebases');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Merge two veNFTs (from -> to)
    const merge = useCallback(async (fromTokenId: bigint, toTokenId: bigint) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'merge',
                args: [fromTokenId, toTokenId],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Merge error:', err);
            setError(err.message || 'Failed to merge veNFTs');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Lock permanently for maximum voting power
    const lockPermanent = useCallback(async (tokenId: bigint) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'lockPermanent',
                args: [tokenId],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Lock permanent error:', err);
            setError(err.message || 'Failed to lock permanently');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Unlock permanent lock (converts back to 4 year time-lock)
    const unlockPermanent = useCallback(async (tokenId: bigint) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: VOTING_ESCROW_ABI,
                functionName: 'unlockPermanent',
                args: [tokenId],
            });

            setIsLoading(false);
            refetchVeNFTs();
            return { hash };
        } catch (err: any) {
            console.error('Unlock permanent error:', err);
            setError(err.message || 'Failed to unlock permanent lock');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchVeNFTs]);

    // Delegate veNFT for ProtocolGovernor voting
    // This delegates the veNFT's voting power to itself so it can vote on governance proposals
    const delegateForGovernance = useCallback(async (tokenId: bigint) => {
        if (!address) {
            setError('Wallet not connected');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            // delegate(delegator, delegatee) - delegating to self for governance voting
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.VotingEscrow as Address,
                abi: [...VOTING_ESCROW_ABI, {
                    name: 'delegate',
                    type: 'function',
                    stateMutability: 'nonpayable',
                    inputs: [
                        { name: 'delegator', type: 'uint256' },
                        { name: 'delegatee', type: 'uint256' },
                    ],
                    outputs: [],
                }],
                functionName: 'delegate',
                args: [tokenId, tokenId], // Delegate to self
            });

            setIsLoading(false);
            return { hash };
        } catch (err: any) {
            console.error('Delegate error:', err);
            setError(err.message || 'Failed to delegate for governance');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync]);

    return {
        positions,
        veNFTCount: veNFTs.length,
        createLock,
        increaseAmount,
        extendLock,
        withdraw,
        claimRebases,
        merge,
        lockPermanent,
        unlockPermanent,
        delegateForGovernance,
        isLoading: isLoading || veNFTsLoading,
        error,
        refetch: refetchVeNFTs,
    };
}
