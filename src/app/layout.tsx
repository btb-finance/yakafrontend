import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/WagmiProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
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
