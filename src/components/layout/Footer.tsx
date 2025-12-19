import Link from 'next/link';

export function Footer() {
    return (
        <footer className="border-t border-white/5 mt-auto">
            <div className="container mx-auto px-6 py-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Brand */}
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden">
                            <img src="/logo.png" alt="Wind Swap" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-lg font-bold gradient-text">Wind Swap</span>
                    </Link>

                    {/* Copyright */}
                    <p className="text-sm text-gray-500">
                        © 2024 Wind Swap. Built on Sei.
                    </p>
                </div>
            </div>
        </footer>
    );
}
