'use client';

import { useWriteContract as useWagmiWriteContract } from 'wagmi';
import { useWalletModal } from '@/providers/WalletModalContext';
import { useCallback } from 'react';

/**
 * Enhanced useWriteContract hook that automatically tracks wallet modal state.
 * This wraps wagmi's useWriteContract to automatically disable the mobile
 * navigation when a wallet popup is expected.
 */
export function useWriteContract() {
    const wagmiResult = useWagmiWriteContract();
    const { openWalletModal, closeWalletModal } = useWalletModal();

    // Wrap writeContractAsync to track wallet modal state
    // Using 'any' cast to preserve wagmi's complex generic signature
    const wrappedWriteContractAsync = useCallback(
        async (params: any) => {
            openWalletModal();
            try {
                const result = await wagmiResult.writeContractAsync(params);
                return result;
            } finally {
                closeWalletModal();
            }
        },
        [wagmiResult.writeContractAsync, openWalletModal, closeWalletModal]
    ) as typeof wagmiResult.writeContractAsync;

    return {
        ...wagmiResult,
        writeContractAsync: wrappedWriteContractAsync,
    };
}
