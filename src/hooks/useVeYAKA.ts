'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useReadContracts } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { V2_CONTRACTS } from '@/config/contracts';
import { VOTING_ESCROW_ABI, REWARDS_DISTRIBUTOR_ABI, ERC20_ABI } from '@/config/abis';

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

export interface VeYAKAPosition {
    tokenId: bigint;
    amount: bigint;
    end: bigint;
    isPermanent: boolean;
    votingPower: bigint;
    claimable: bigint;
}

export function useVeYAKA() {
    const { address } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [positions, setPositions] = useState<VeYAKAPosition[]>([]);

    const { writeContractAsync } = useWriteContract();

    // Fetch user's veNFT count
    const { data: balanceData, refetch: refetchBalance } = useReadContracts({
        contracts: address ? [{
            address: V2_CONTRACTS.VotingEscrow as Address,
            abi: VOTING_ESCROW_ABI,
            functionName: 'balanceOf',
            args: [address],
        }] : [],
    });

    const veNFTCount = balanceData?.[0]?.result as bigint | undefined;

    // Fetch positions when count changes
    useEffect(() => {
        const fetchPositions = async () => {
            if (!address || !veNFTCount || veNFTCount === BigInt(0)) {
                setPositions([]);
                return;
            }

            try {
                const positionPromises: Promise<VeYAKAPosition>[] = [];

                for (let i = 0; i < Number(veNFTCount); i++) {
                    positionPromises.push(fetchPosition(address, i));
                }

                const fetchedPositions = await Promise.all(positionPromises);
                setPositions(fetchedPositions.filter(p => p.tokenId > BigInt(0)));
            } catch (err) {
                console.error('Error fetching veYAKA positions:', err);
            }
        };

        fetchPositions();
    }, [address, veNFTCount]);

    // Fetch single position
    const fetchPosition = async (owner: Address, index: number): Promise<VeYAKAPosition> => {
        const rpcUrl = 'https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8';

        // Get tokenId from index using ownerToNFTokenIdList(address,uint256)
        const tokenIdData = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: V2_CONTRACTS.VotingEscrow,
                    data: `0x8bf9d84c${owner.slice(2).padStart(64, '0')}${index.toString(16).padStart(64, '0')}`
                }, 'latest'],
                id: 1
            })
        }).then(r => r.json());

        const tokenId = BigInt(tokenIdData.result || '0');
        if (tokenId === BigInt(0)) {
            return { tokenId: BigInt(0), amount: BigInt(0), end: BigInt(0), isPermanent: false, votingPower: BigInt(0), claimable: BigInt(0) };
        }

        // Get locked balance
        const lockedData = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: V2_CONTRACTS.VotingEscrow,
                    data: `0xb45a3c0e${tokenId.toString(16).padStart(64, '0')}`
                }, 'latest'],
                id: 2
            })
        }).then(r => r.json());

        // Get voting power - balanceOfNFT(uint256) selector 0xe7e242d4
        const votingPowerData = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: V2_CONTRACTS.VotingEscrow,
                    data: `0xe7e242d4${tokenId.toString(16).padStart(64, '0')}`
                }, 'latest'],
                id: 3
            })
        }).then(r => r.json());

        // Get claimable rebases - claimable(uint256) selector 0xd1d58b25
        const claimableData = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                    to: V2_CONTRACTS.RewardsDistributor,
                    data: `0xd1d58b25${tokenId.toString(16).padStart(64, '0')}`
                }, 'latest'],
                id: 4
            })
        }).then(r => r.json());

        // Decode locked tuple (int128 amount, uint256 end, bool isPermanent)
        const lockedHex = lockedData.result?.slice(2) || '';
        const amount = BigInt('0x' + (lockedHex.slice(0, 64) || '0'));
        const end = BigInt('0x' + (lockedHex.slice(64, 128) || '0'));
        const isPermanent = (lockedHex.slice(128, 192) || '0') !== '0'.repeat(64);

        const votingPower = BigInt(votingPowerData.result || '0');
        const claimable = BigInt(claimableData.result || '0');

        return { tokenId, amount, end, isPermanent, votingPower, claimable };
    };

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

            // Approve YAKA
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
            refetchBalance();
            return { hash };
        } catch (err: any) {
            console.error('Create lock error:', err);
            setError(err.message || 'Failed to create lock');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchBalance]);

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

            // Approve YAKA
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
            refetchBalance();
            return { hash };
        } catch (err: any) {
            console.error('Increase amount error:', err);
            setError(err.message || 'Failed to increase amount');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchBalance]);

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
            refetchBalance();
            return { hash };
        } catch (err: any) {
            console.error('Extend lock error:', err);
            setError(err.message || 'Failed to extend lock');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchBalance]);

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
            refetchBalance();
            return { hash };
        } catch (err: any) {
            console.error('Withdraw error:', err);
            setError(err.message || 'Failed to withdraw');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchBalance]);

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
            refetchBalance();
            return { hash };
        } catch (err: any) {
            console.error('Claim rebases error:', err);
            setError(err.message || 'Failed to claim rebases');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchBalance]);

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
            refetchBalance();
            return { hash };
        } catch (err: any) {
            console.error('Merge error:', err);
            setError(err.message || 'Failed to merge veNFTs');
            setIsLoading(false);
            return null;
        }
    }, [address, writeContractAsync, refetchBalance]);

    return {
        positions,
        veNFTCount: veNFTCount ? Number(veNFTCount) : 0,
        createLock,
        increaseAmount,
        extendLock,
        withdraw,
        claimRebases,
        merge,
        isLoading,
        error,
        refetch: refetchBalance,
    };
}
