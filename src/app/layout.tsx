import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/providers/ClientProviders";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MainContent } from "@/components/layout/MainContent";


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
        <ClientProviders>
          {/* Background Effects */}
          <div className="bg-orb bg-orb-primary" />
          <div className="bg-orb bg-orb-secondary" />

          {/* Header - hidden on mobile when connected */}
          <Header />

          {/* Main Content - dynamic padding based on connection */}
          <MainContent>{children}</MainContent>

          {/* Mobile Bottom Navigation */}
          <MobileBottomNav />

          {/* Footer - hidden on mobile since we have bottom nav */}
          <div className="hidden md:block">
            <Footer />
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
