import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

// Dynamic import with SSR disabled to prevent WalletConnect's idb-keyval
// from accessing indexedDB during server-side rendering in serverless environments
const Providers = dynamic(
  () => import("@/providers/WagmiProvider").then(mod => mod.Providers),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#0a0b0d] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wind Swap | DEX on Sei",
  description: "The premier AMM and ve-tokenomics DEX on Sei Network. Swap, provide liquidity, and earn rewards with WIND.",
  keywords: ["DEX", "Sei", "AMM", "DeFi", "Wind Swap", "WIND", "ve-tokenomics", "concentrated liquidity"],
  metadataBase: new URL("https://windswap.org"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WindSwap",
  },
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Wind Swap | DEX on Sei',
    description: 'The premier AMM and ve-tokenomics DEX on Sei Network. Swap, provide liquidity, and earn rewards.',
    type: 'website',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary',
    title: 'Wind Swap | DEX on Sei',
    description: 'The premier AMM and ve-tokenomics DEX on Sei Network.',
    images: ['/logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#00d4ff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
        <Providers>
          {/* Background Effects */}
          <div className="bg-orb bg-orb-primary" />
          <div className="bg-orb bg-orb-secondary" />

          {/* Header */}
          <Header />

          {/* Main Content */}
          <main className="flex-1 pt-24 pb-16">
            {children}
          </main>

          {/* Footer */}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
