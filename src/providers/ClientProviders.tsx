'use client';

import dynamic from 'next/dynamic';
import { ToastProvider } from '@/providers/ToastProvider';
import { WalletModalProvider } from '@/providers/WalletModalContext';

// Dynamic import with SSR disabled to prevent WalletConnect's idb-keyval
// from accessing indexedDB during server-side rendering in serverless environments
const Providers = dynamic(
    () => import('@/providers/WagmiProvider').then(mod => mod.Providers),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-screen bg-[#0a0b0d] flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        ),
    }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <WalletModalProvider>
                <ToastProvider>
                    {children}
                </ToastProvider>
            </WalletModalProvider>
        </Providers>
    );
}

