'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http } from 'wagmi';
import {
    RainbowKitProvider,
    darkTheme,
    getDefaultConfig,
    connectorsForWallets
} from '@rainbow-me/rainbowkit';
import {
    injectedWallet,
    metaMaskWallet,
    coinbaseWallet,
    walletConnectWallet,
    trustWallet,
    safepalWallet,
    okxWallet,
    bitgetWallet,
    rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { sei } from '@/config/chains';
import '@rainbow-me/rainbowkit/styles.css';

const projectId = 'ecd20f8c23408a4397afc0f5466eb6b6';

// Configure wallet connectors with explicit in-app browser support
const connectors = connectorsForWallets(
    [
        {
            groupName: 'Popular',
            wallets: [
                injectedWallet,      // Auto-detects any injected wallet (in-app browsers)
                metaMaskWallet,
                trustWallet,
                safepalWallet,
                okxWallet,
                coinbaseWallet,
            ],
        },
        {
            groupName: 'More',
            wallets: [
                walletConnectWallet,
                rainbowWallet,
                bitgetWallet,
            ],
        },
    ],
    {
        appName: 'YAKA Finance',
        projectId,
    }
);

const config = getDefaultConfig({
    appName: 'YAKA Finance',
    projectId,
    chains: [sei],
    transports: {
        [sei.id]: http('https://evm-rpc.sei-apis.com'),
    },
    ssr: true,
    wallets: [
        {
            groupName: 'Popular',
            wallets: [
                injectedWallet,
                metaMaskWallet,
                trustWallet,
                safepalWallet,
                okxWallet,
                coinbaseWallet,
            ],
        },
        {
            groupName: 'More',
            wallets: [
                walletConnectWallet,
                rainbowWallet,
                bitgetWallet,
            ],
        },
    ],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={darkTheme({
                        accentColor: '#6366f1',
                        accentColorForeground: 'white',
                        borderRadius: 'medium',
                        fontStack: 'system',
                        overlayBlur: 'small',
                    })}
                    modalSize="compact"
                >
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
