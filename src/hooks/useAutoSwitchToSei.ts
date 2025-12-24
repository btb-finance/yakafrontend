'use client';

import { useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePathname } from 'next/navigation';
import { sei } from 'viem/chains';

/**
 * Hook to auto-switch back to Sei network when leaving the bridge page.
 * Only the /bridge page uses Base network; all other pages require Sei.
 */
export function useAutoSwitchToSei() {
    const { chainId, isConnected } = useAccount();
    const { switchChain } = useSwitchChain();
    const pathname = usePathname();

    useEffect(() => {
        // Only auto-switch if:
        // 1. User is connected
        // 2. Not on the bridge page
        // 3. Currently on a non-Sei chain (e.g., Base)
        const isBridgePage = pathname === '/bridge';
        const isOnSei = chainId === sei.id;

        if (isConnected && !isBridgePage && !isOnSei && chainId !== undefined) {
            console.log('[useAutoSwitchToSei] Switching back to Sei from chain', chainId);
            try {
                switchChain({ chainId: sei.id });
            } catch (err) {
                console.warn('[useAutoSwitchToSei] Failed to auto-switch:', err);
            }
        }
    }, [pathname, chainId, isConnected, switchChain]);
}
