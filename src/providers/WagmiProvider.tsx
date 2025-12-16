'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http } from 'wagmi';
import { RainbowKitProvider, darkTheme, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sei } from '@/config/chains';
import '@rainbow-me/rainbowkit/styles.css';

// Use getDefaultConfig for WalletConnect support on mobile
const config = getDefaultConfig({
    appName: 'YAKA Finance',
    projectId: 'ecd20f8c23408a4397afc0f5466eb6b6', // WalletConnect Cloud Project ID
    chains: [sei],
    transports: {
        [sei.id]: http('https://evm-rpc.sei-apis.com'),
    },
    ssr: true,
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
