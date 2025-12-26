'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SwapInterface } from '@/components/swap/SwapInterface';
import { findTokenByAddress } from '@/hooks/useTokenPage';

// Component that reads URL params and passes to SwapInterface
function SwapWithParams() {
    const searchParams = useSearchParams();

    // Read token addresses from URL params
    const tokenInAddress = searchParams.get('tokenIn');
    const tokenOutAddress = searchParams.get('tokenOut');

    // Look up tokens
    const initialTokenIn = tokenInAddress ? findTokenByAddress(tokenInAddress) : undefined;
    const initialTokenOut = tokenOutAddress ? findTokenByAddress(tokenOutAddress) : undefined;

    return (
        <SwapInterface
            initialTokenIn={initialTokenIn || undefined}
            initialTokenOut={initialTokenOut || undefined}
        />
    );
}

export default function SwapPage() {
    return (
        <div className="container mx-auto px-3 sm:px-6 py-4">
            {/* Swap Interface - Full width on mobile */}
            <Suspense fallback={
                <div className="swap-card max-w-md mx-auto p-8 text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
            }>
                <SwapWithParams />
            </Suspense>
        </div>
    );
}
