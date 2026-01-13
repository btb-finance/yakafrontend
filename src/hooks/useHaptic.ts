'use client';

/**
 * Haptic feedback utilities for mobile devices
 * Uses the Vibration API which is supported in most wallet mobile browsers
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

const patterns: Record<HapticPattern, number | number[]> = {
    light: 10,      // Quick light tap
    medium: 25,     // Standard button press
    heavy: 50,      // Strong feedback
    success: [10, 50, 10], // Double tap for success
    error: [50, 30, 50],   // Pattern for error
    warning: [25, 25],     // Double tap warning
};

/**
 * Trigger haptic feedback
 * Gracefully degrades if Vibration API not supported
 */
export function haptic(pattern: HapticPattern = 'light'): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(patterns[pattern]);
        } catch {
            // Silently fail if vibration not supported
        }
    }
}

/**
 * Hook for haptic feedback
 */
export function useHaptic() {
    return {
        light: () => haptic('light'),
        medium: () => haptic('medium'),
        heavy: () => haptic('heavy'),
        success: () => haptic('success'),
        error: () => haptic('error'),
        warning: () => haptic('warning'),
        haptic,
    };
}
