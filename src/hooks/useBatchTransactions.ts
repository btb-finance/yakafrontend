'use client';

import { useState, useCallback } from 'react';
import { useSendCalls } from 'wagmi';
import { encodeFunctionData, Address } from 'viem';
import { ERC20_ABI } from '@/config/abis';

interface Call {
    to: Address;
    data?: `0x${string}`;
    value?: bigint;
}

interface BatchResult {
    success: boolean;
    hash?: string;
    error?: string;
    usedBatching?: boolean;
}

/**
 * Hook for executing batch transactions using EIP-5792 (wallet_sendCalls)
 * Falls back to sequential transactions if wallet doesn't support batching
 * 
 * Works with MetaMask Smart Accounts, Coinbase Wallet, and other EIP-5792 wallets
 */
export function useBatchTransactions() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // EIP-5792 batch send calls
    const { sendCallsAsync } = useSendCalls();

    /**
     * Execute a batch of calls - tries EIP-5792 first
     * Returns { success: false, usedBatching: false } if wallet doesn't support it
     * The caller should then fall back to their own sequential approach
     */
    const executeBatch = useCallback(async (
        calls: Call[],
    ): Promise<BatchResult> => {
        setIsLoading(true);
        setError(null);

        // Try EIP-5792 batch
        try {
            const result = await sendCallsAsync({
                calls: calls.map(call => ({
                    to: call.to,
                    data: call.data,
                    value: call.value,
                })),
            });

            setIsLoading(false);
            return {
                success: true,
                hash: typeof result === 'string' ? result : result?.id,
                usedBatching: true,
            };

        } catch (batchError: any) {
            // EIP-5792 not supported - this is expected for most wallets
            console.log('EIP-5792 batch not available:', batchError.message);
            setIsLoading(false);
            return {
                success: false,
                error: 'Wallet does not support batch transactions',
                usedBatching: false,
            };
        }

    }, [sendCallsAsync]);

    /**
     * Helper: Encode an approve call
     */
    const encodeApproveCall = useCallback((
        tokenAddress: Address,
        spenderAddress: Address,
        amount: bigint
    ): Call => {
        return {
            to: tokenAddress,
            data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [spenderAddress, amount],
            }),
        };
    }, []);

    /**
     * Helper: Encode any contract call
     */
    const encodeContractCall = useCallback((
        contractAddress: Address,
        abi: any,
        functionName: string,
        args: any[],
        value?: bigint
    ): Call => {
        return {
            to: contractAddress,
            data: encodeFunctionData({
                abi,
                functionName,
                args,
            }),
            value,
        };
    }, []);

    return {
        executeBatch,
        encodeApproveCall,
        encodeContractCall,
        isLoading,
        error,
    };
}
