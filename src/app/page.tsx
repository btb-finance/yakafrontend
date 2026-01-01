'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, Address } from 'viem';
import { V2_CONTRACTS } from '@/config/contracts';
import { POOL_FACTORY_ABI } from '@/config/abis';
import { FeatureCard } from '@/components/common/InfoCard';
import { LockVoteEarnSteps } from '@/components/common/StepIndicator';
import { useCLPositions, useV2Positions } from '@/hooks/usePositions';
import { useVeWIND } from '@/hooks/useVeWIND';

// Voter ABI for getting gauge count
const VOTER_ABI = [
  {
    inputs: [],
    name: 'length',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// VotingEscrow ABI for total supply
const VE_ABI = [
  {
    inputs: [],
    name: 'supply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function Home() {
  const { isConnected } = useAccount();

  // Fetch real on-chain data
  const { data: poolCount } = useReadContract({
    address: V2_CONTRACTS.PoolFactory as Address,
    abi: POOL_FACTORY_ABI,
    functionName: 'allPoolsLength',
  });

  const { data: gaugeCount } = useReadContract({
    address: V2_CONTRACTS.Voter as Address,
    abi: VOTER_ABI,
    functionName: 'length',
  });

  const { data: veSupply } = useReadContract({
    address: V2_CONTRACTS.VotingEscrow as Address,
    abi: VE_ABI,
    functionName: 'supply',
  });

  // Portfolio data hooks (only useful when connected)
  const { positions: clPositions, positionCount: clCount } = useCLPositions();
  const { positions: v2Positions } = useV2Positions();
  const { positions: vePositions, veNFTCount } = useVeWIND();

  // Format veSupply
  const formattedVeSupply = veSupply
    ? parseFloat(formatUnits(veSupply, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : '--';

  // Portfolio counts
  const totalLPPositions = (clCount || 0) + (v2Positions?.length || 0);
  const totalVeNFTs = veNFTCount || 0;

  const features = [
    {
      title: 'Trade Tokens',
      description: 'Swap any token with deep liquidity and minimal slippage.',
      href: '/swap',
    },
    {
      title: 'Provide Liquidity',
      description: 'Earn trading fees by depositing tokens into pools.',
      href: '/pools',
    },
    {
      title: 'Vote & Earn',
      description: 'Lock WIND to vote on pool rewards and earn your share.',
      href: '/vote',
    },
    {
      title: 'Portfolio',
      description: 'Track your positions, staked LP, and pending rewards.',
      href: '/portfolio',
    },
  ];

  return (
    <div className="container mx-auto px-4 md:px-6">
      {/* Hero Section */}
      <section className="py-8 md:py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex gap-3 justify-center mb-6 flex-wrap">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 text-sm font-medium">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <span>V3 Concentrated Liquidity</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-sm font-medium">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span>ve(3,3) Tokenomics</span>
            </div>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-4 md:mb-6">
            <span className="gradient-text">Wind Swap</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-4 md:mb-6 px-2">
            The Next-Gen DEX on Sei Network
          </p>
          <p className="text-sm md:text-lg text-gray-400 max-w-3xl mx-auto mb-6 md:mb-8 px-2">
            Trade with the best rates, earn rewards as a liquidity provider, and shape the protocol by voting on pool incentives.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/swap">
              <button className="btn-gradient text-lg px-8 py-4 hover:scale-[1.02] active:scale-[0.98] transition-transform">
                Start Trading
              </button>
            </Link>
            <Link href="/pools">
              <button className="btn-secondary text-lg px-8 py-4 hover:scale-[1.02] active:scale-[0.98] transition-transform">
                Provide Liquidity
              </button>
            </Link>
          </div>

          {/* veWIND Holder Congratulations Banner */}
          {isConnected && totalVeNFTs > 0 && (
            <motion.div
              className="mt-8 mx-auto max-w-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="p-4 md:p-6 rounded-2xl bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-teal-500/20 border border-green-500/40 shadow-lg shadow-green-500/10">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                    <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg md:text-xl font-bold text-green-400 mb-1">
                      🎉 Congratulations! You&apos;re a veWIND Holder!
                    </h3>
                    <p className="text-sm md:text-base text-gray-300">
                      You received the WIND airdrop! Keep voting to earn trading fees and rewards.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/vote" className="flex-1 min-w-[140px]">
                    <button className="w-full py-2.5 px-4 rounded-xl bg-green-500/20 border border-green-500/40 text-green-400 font-medium text-sm hover:bg-green-500/30 transition">
                      Vote Now →
                    </button>
                  </Link>
                  <Link href="/portfolio" className="flex-1 min-w-[140px]">
                    <button className="w-full py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-medium text-sm hover:bg-white/10 transition">
                      View veNFTs
                    </button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* Live Stats Section */}
      <section className="py-6 md:py-8">
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="stat-card text-center">
            <p className="text-xs md:text-sm text-gray-400 mb-1">Total Pools</p>
            <p className="text-xl md:text-3xl font-bold">{poolCount ? Number(poolCount).toLocaleString() : '--'}</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-xs md:text-sm text-gray-400 mb-1">Active Gauges</p>
            <p className="text-xl md:text-3xl font-bold">{gaugeCount ? Number(gaugeCount).toLocaleString() : '--'}</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-xs md:text-sm text-gray-400 mb-1">WIND Locked</p>
            <p className="text-xl md:text-3xl font-bold">{formattedVeSupply}</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-xs md:text-sm text-gray-400 mb-1">Network</p>
            <p className="text-xl md:text-3xl font-bold">Sei</p>
          </div>
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="py-8 md:py-12">
        <motion.div
          className="glass-card p-4 md:p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="text-center mb-6 md:mb-8">
            <h2 className="text-xl md:text-3xl font-bold mb-2 md:mb-3">
              How <span className="text-green-400">ve(3,3)</span> Works
            </h2>
            <p className="text-sm md:text-base text-gray-400">Lock, vote, and earn. It&apos;s that simple.</p>
          </div>

          <div className="hidden md:block max-w-2xl mx-auto mb-8">
            <LockVoteEarnSteps currentStep={-1} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 text-center">
            <div className="p-2 md:p-4">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-2 md:mb-4">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="font-semibold text-sm md:text-base mb-1 md:mb-2">Lock WIND</div>
              <div className="text-xs md:text-sm text-gray-400">Voting power grows with lock time</div>
            </div>
            <div className="p-2 md:p-4">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-2 md:mb-4">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="font-semibold text-sm md:text-base mb-1 md:mb-2">Vote for Pools</div>
              <div className="text-xs md:text-sm text-gray-400">Direct rewards to pools</div>
            </div>
            <div className="p-2 md:p-4">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center mx-auto mb-2 md:mb-4">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="font-semibold text-sm md:text-base mb-1 md:mb-2">Pools Grow</div>
              <div className="text-xs md:text-sm text-gray-400">Attract more liquidity</div>
            </div>
            <div className="p-2 md:p-4">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-2 md:mb-4">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="font-semibold text-sm md:text-base mb-1 md:mb-2">Earn Rewards</div>
              <div className="text-xs md:text-sm text-gray-400">Trading fees + incentives</div>
            </div>
          </div>

          <div className="mt-4 md:mt-8 p-3 md:p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 text-center">
            <span className="text-xs md:text-sm text-gray-300">
              <strong className="text-primary">The Flywheel:</strong> Good pools earn more → LPs join → Better trades
            </span>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-3xl font-bold text-center mb-4">Get Started</h2>
          <p className="text-gray-400 text-center max-w-xl mx-auto mb-10">
            Everything you need to trade, earn, and participate in Wind Swap governance.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.1 }}
            >
              <Link href={feature.href}>
                <div className="feature-card h-full cursor-pointer">
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-400 text-sm">{feature.description}</p>
                  <div className="mt-4 text-primary text-sm font-medium">
                    Get Started →
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* V2 vs V3 Comparison */}
      <section className="py-12">
        <motion.div
          className="glass-card p-8 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h2 className="text-2xl font-bold mb-2 text-center">Why Concentrated Liquidity?</h2>
          <p className="text-gray-400 text-center mb-8">V3 pools are up to 4000x more efficient than traditional AMMs</p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* V2 */}
            <div className="p-6 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gray-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Classic (V2)</h3>
                  <p className="text-sm text-gray-500">Simple and reliable</p>
                </div>
              </div>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">•</span>
                  Liquidity covers all prices equally
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">•</span>
                  Set and forget - no management needed
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">•</span>
                  Great for beginners
                </li>
              </ul>
            </div>

            {/* V3 */}
            <div className="p-6 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Concentrated (V3)</h3>
                  <p className="text-sm text-primary">Maximum efficiency</p>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Focus liquidity where trading happens</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Earn 10-100x more in trading fees</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Best for active liquidity providers</span>
                </li>
              </ul>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Quick Actions for connected users */}
      {isConnected && (
        <>
          <section className="py-12">
            <motion.div
              className="glass-card p-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <h2 className="text-2xl font-bold mb-6">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/swap">
                  <button className="w-full py-4 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 font-medium hover:from-primary/30 hover:to-secondary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                    Swap Tokens
                  </button>
                </Link>
                <Link href="/pools">
                  <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 font-medium hover:bg-white/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                    Manage Positions
                  </button>
                </Link>
                <Link href="/vote">
                  <button className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 font-medium hover:from-green-500/30 hover:to-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                    Vote & Earn
                  </button>
                </Link>
              </div>
            </motion.div>
          </section>

          {/* Portfolio Summary */}
          <section className="py-8">
            <motion.div
              className="glass-card p-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Your Portfolio</h2>
                  <p className="text-gray-400 text-sm">Track your positions and rewards</p>
                </div>
                <Link href="/portfolio">
                  <button className="btn-secondary px-4 py-2 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform">
                    View Full Portfolio →
                  </button>
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                  <div className="text-xs text-gray-400 mb-2">LP Positions</div>
                  <div className="text-2xl font-bold">{totalLPPositions || 0}</div>
                  <div className="text-xs text-gray-500">CL + V2</div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/20">
                  <div className="text-xs text-gray-400 mb-2">CL Positions</div>
                  <div className="text-2xl font-bold">{clCount || 0}</div>
                  <div className="text-xs text-gray-500">Concentrated</div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20">
                  <div className="text-xs text-gray-400 mb-2">V2 Positions</div>
                  <div className="text-2xl font-bold">{v2Positions?.length || 0}</div>
                  <div className="text-xs text-gray-500">Classic AMM</div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20">
                  <div className="text-xs text-gray-400 mb-2">veNFTs</div>
                  <div className="text-2xl font-bold">{totalVeNFTs}</div>
                  <div className="text-xs text-gray-500">Vote Power</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/pools" className="flex-1 min-w-[200px]">
                  <button className="w-full py-3 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition">
                    Add Liquidity
                  </button>
                </Link>
                <Link href="/portfolio" className="flex-1 min-w-[200px]">
                  <button className="w-full py-3 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition">
                    Manage Staking
                  </button>
                </Link>
                <Link href="/vote" className="flex-1 min-w-[200px]">
                  <button className="w-full py-3 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition">
                    Lock WIND
                  </button>
                </Link>
              </div>
            </motion.div>
          </section>
        </>
      )}

      {/* WIND Token Section */}
      <section className="py-12">
        <motion.div
          className="glass-card p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-primary/30">
                <img src="/logo.png" alt="WIND" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-1">WIND Token</h2>
                <p className="text-gray-400">
                  The governance token of Wind Swap. Lock to vote and earn.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <Link href="/swap">
                <button className="btn-gradient hover:scale-[1.02] active:scale-[0.98] transition-transform">
                  Get WIND
                </button>
              </Link>
              <Link href="/vote">
                <button className="btn-secondary hover:scale-[1.02] active:scale-[0.98] transition-transform">
                  Lock & Vote
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
