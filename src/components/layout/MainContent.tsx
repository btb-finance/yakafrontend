'use client';

/**
 * Main content wrapper with proper padding for header and bottom nav
 */
export function MainContent({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex-1 pt-14 md:pt-24 pb-14 md:pb-16">
            {children}
        </main>
    );
}
