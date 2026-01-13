'use client';

import { useState, useCallback, useRef, TouchEvent } from 'react';
import { haptic } from '@/hooks/useHaptic';

interface UsePullToRefreshOptions {
    onRefresh: () => Promise<void>;
    threshold?: number; // minimum pull distance to trigger refresh
}

interface UsePullToRefreshReturn {
    isPulling: boolean;
    isRefreshing: boolean;
    pullProgress: number; // 0 to 1, how far user has pulled
    handlers: {
        onTouchStart: (e: TouchEvent) => void;
        onTouchMove: (e: TouchEvent) => void;
        onTouchEnd: () => void;
    };
}

/**
 * Pull-to-refresh hook for mobile
 * Attach handlers to the scrollable container
 */
export function usePullToRefresh({
    onRefresh,
    threshold = 80,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
    const [isPulling, setIsPulling] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);

    const startY = useRef(0);
    const isAtTop = useRef(true);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        // Only enable pull-to-refresh when at top of scroll
        const target = e.currentTarget as HTMLElement;
        isAtTop.current = target.scrollTop <= 0;

        if (isAtTop.current && !isRefreshing) {
            startY.current = e.touches[0].clientY;
            setIsPulling(true);
        }
    }, [isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isPulling || isRefreshing || !isAtTop.current) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY.current;

        // Only pull down, not up
        if (diff > 0) {
            // Resistance factor - harder to pull as you go
            const resistance = 0.5;
            const actualPull = diff * resistance;
            setPullDistance(Math.min(actualPull, threshold * 1.5));

            // Light haptic when reaching threshold
            if (actualPull >= threshold && pullDistance < threshold) {
                haptic('medium');
            }
        }
    }, [isPulling, isRefreshing, threshold, pullDistance]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling) return;

        if (pullDistance >= threshold && !isRefreshing) {
            setIsRefreshing(true);
            haptic('success');

            try {
                await onRefresh();
            } catch (error) {
                console.error('Refresh failed:', error);
                haptic('error');
            } finally {
                setIsRefreshing(false);
            }
        }

        setPullDistance(0);
        setIsPulling(false);
    }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh]);

    return {
        isPulling,
        isRefreshing,
        pullProgress: Math.min(pullDistance / threshold, 1),
        handlers: {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
        },
    };
}
