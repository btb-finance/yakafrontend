'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface WalletModalContextType {
    /**
     * Indicates if a wallet modal/popup is expected to be open
     * (approval, signing, transaction confirmation)
     */
    isWalletModalOpen: boolean;
    /**
     * Call when initiating a wallet action (before writeContract, signMessage, etc.)
     */
    openWalletModal: () => void;
    /**
     * Call when wallet action completes or is cancelled
     */
    closeWalletModal: () => void;
}

const WalletModalContext = createContext<WalletModalContextType | undefined>(undefined);

export function WalletModalProvider({ children }: { children: ReactNode }) {
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

    const openWalletModal = useCallback(() => {
        setIsWalletModalOpen(true);
    }, []);

    const closeWalletModal = useCallback(() => {
        setIsWalletModalOpen(false);
    }, []);

    return (
        <WalletModalContext.Provider value={{ isWalletModalOpen, openWalletModal, closeWalletModal }}>
            {children}
        </WalletModalContext.Provider>
    );
}

export function useWalletModal() {
    const context = useContext(WalletModalContext);
    if (!context) {
        throw new Error('useWalletModal must be used within a WalletModalProvider');
    }
    return context;
}
