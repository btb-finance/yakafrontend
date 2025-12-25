'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http } from 'wagmi';
import {
    RainbowKitProvider,
    darkTheme,
    getDefaultConfig,
} from '@rainbow-me/rainbowkit';
import {
    metaMaskWallet,
    coinbaseWallet,
    walletConnectWallet,
    trustWallet,
    okxWallet,
    bitgetWallet,
    rainbowWallet,
    rabbyWallet,
    phantomWallet,
    braveWallet,
    safeWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { sei } from '@/config/chains';
import { base } from 'viem/chains';
import { PoolDataProvider } from '@/providers/PoolDataProvider';
import { UserBalanceProvider } from '@/providers/UserBalanceProvider';
import '@rainbow-me/rainbowkit/styles.css';

const projectId = 'ecd20f8c23408a4397afc0f5466eb6b6';

const config = getDefaultConfig({
    appName: 'Wind Swap',
    projectId,
    chains: [sei, base],
    transports: {
        [sei.id]: http('https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8'),
        [base.id]: http('https://mainnet.base.org'),
    },
    ssr: true,
    // Disable auto-detection to prevent wallet conflicts
    multiInjectedProviderDiscovery: false,
    wallets: [
        {
            groupName: 'Popular',
            wallets: [
                rabbyWallet,         // Rabby first - explicit selection
                metaMaskWallet,      // MetaMask explicit
                coinbaseWallet,
                trustWallet,
                phantomWallet,
            ],
        },
        {
            groupName: 'More',
            wallets: [
                okxWallet,
                braveWallet,
                walletConnectWallet,
                rainbowWallet,
                bitgetWallet,
                safeWallet,
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
                    <PoolDataProvider>
                        <UserBalanceProvider>
                            {children}
                        </UserBalanceProvider>
                    </PoolDataProvider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}

