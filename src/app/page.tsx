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
import { useVeYAKA } from '@/hooks/useVeYAKA';

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
  const { positions: vePositions, veNFTCount } = useVeYAKA();

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
      icon: '🔄',
    },
    {
      title: 'Provide Liquidity',
      description: 'Earn trading fees by depositing tokens into pools.',
      href: '/liquidity',
      icon: '💧',
    },
    {
      title: 'Vote & Earn',
      description: 'Lock YAKA to vote on pool rewards and earn your share.',
      href: '/vote',
      icon: '🗳️',
    },
    {
      title: 'Portfolio',
      description: 'Track your positions, staked LP, and pending rewards.',
      href: '/portfolio',
      icon: '📊',
    },
  ];

  return (
    <div className="container mx-auto px-6">
      {/* Hero Section */}
      <section className="py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex gap-3 justify-center mb-6 flex-wrap">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 text-sm font-medium">
              <span className="text-primary">⚡</span>
              <span>V3 Concentrated Liquidity</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-sm font-medium">
              <span className="text-green-400">🔐</span>
              <span>ve(3,3) Tokenomics</span>
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="gradient-text">YAKA</span> Finance
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-6">
            The Next-Gen DEX on Sei Network
          </p>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto mb-8">
            Trade with the best rates, earn rewards as a liquidity provider, and shape the protocol by voting on pool incentives.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/swap">
              <motion.button
                className="btn-gradient text-lg px-8 py-4"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Start Trading
              </motion.button>
            </Link>
            <Link href="/liquidity">
              <motion.button
                className="btn-secondary text-lg px-8 py-4"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Provide Liquidity
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Live Stats Section */}
      <section className="py-8">
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="stat-card text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="icon-container icon-container-sm">📊</div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Total Pools</p>
            <p className="text-3xl font-bold">{poolCount ? Number(poolCount).toLocaleString() : '--'}</p>
          </div>
          <div className="stat-card text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>🗳️</div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Active Gauges</p>
            <p className="text-3xl font-bold">{gaugeCount ? Number(gaugeCount).toLocaleString() : '--'}</p>
          </div>
          <div className="stat-card text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}>🔐</div>
            </div>
            <p className="text-sm text-gray-400 mb-1">YAKA Locked</p>
            <p className="text-3xl font-bold">{formattedVeSupply}</p>
          </div>
          <div className="stat-card text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="icon-container icon-container-sm" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>⛓️</div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Network</p>
            <p className="text-3xl font-bold">Sei</p>
          </div>
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="py-12">
        <motion.div
          className="glass-card p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-3">
              How <span className="text-green-400">ve(3,3)</span> Works
            </h2>
            <p className="text-gray-400">Lock, vote, and earn. It&apos;s that simple.</p>
          </div>

          <div className="max-w-2xl mx-auto mb-8">
            <LockVoteEarnSteps currentStep={-1} />
          </div>

          <div className="grid md:grid-cols-4 gap-6 text-center">
            <div className="p-4">
              <div className="icon-container mx-auto mb-4">🔐</div>
              <div className="font-semibold mb-2">Lock YAKA</div>
              <div className="text-sm text-gray-400">Get voting power that grows with lock time</div>
            </div>
            <div className="p-4">
              <div className="icon-container icon-container-success mx-auto mb-4">🗳️</div>
              <div className="font-semibold mb-2">Vote for Pools</div>
              <div className="text-sm text-gray-400">Direct YAKA rewards to your favorite pools</div>
            </div>
            <div className="p-4">
              <div className="icon-container icon-container-warning mx-auto mb-4">📈</div>
              <div className="font-semibold mb-2">Pools Grow</div>
              <div className="text-sm text-gray-400">Voted pools attract more liquidity</div>
            </div>
            <div className="p-4">
              <div className="icon-container mx-auto mb-4" style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}>💰</div>
              <div className="font-semibold mb-2">Earn Rewards</div>
              <div className="text-sm text-gray-400">Get trading fees + bonus incentives</div>
            </div>
          </div>

          <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 text-center">
            <span className="text-sm text-gray-300">
              <strong className="text-primary">The Flywheel:</strong> Good pools earn more → LPs join → Better trades → Protocol grows 🚀
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
            Everything you need to trade, earn, and participate in YAKA governance.
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
                  <div className="icon-container mb-4" style={{ position: 'relative', zIndex: 1 }}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-2" style={{ position: 'relative', zIndex: 1 }}>{feature.title}</h3>
                  <p className="text-gray-400 text-sm" style={{ position: 'relative', zIndex: 1 }}>{feature.description}</p>
                  <div className="mt-4 text-primary text-sm font-medium" style={{ position: 'relative', zIndex: 1 }}>
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
                <div className="w-12 h-12 rounded-full bg-gray-500/20 flex items-center justify-center text-xl">
                  💧
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
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl">
                  ⚡
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
                  <motion.button
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 font-medium hover:from-primary/30 hover:to-secondary/30 transition-all flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    🔄 Swap Tokens
                  </motion.button>
                </Link>
                <Link href="/liquidity">
                  <motion.button
                    className="w-full py-4 rounded-xl bg-white/5 border border-white/10 font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    💧 Manage Positions
                  </motion.button>
                </Link>
                <Link href="/vote">
                  <motion.button
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 font-medium hover:from-green-500/30 hover:to-emerald-500/30 transition-all flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    🗳️ Vote & Earn
                  </motion.button>
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
                  <motion.button
                    className="btn-secondary px-4 py-2 text-sm"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View Full Portfolio →
                  </motion.button>
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-primary">💧</span>
                    <span className="text-xs text-gray-400">LP Positions</span>
                  </div>
                  <div className="text-2xl font-bold">{totalLPPositions || 0}</div>
                  <div className="text-xs text-gray-500">CL + V2</div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-400">⚡</span>
                    <span className="text-xs text-gray-400">CL Positions</span>
                  </div>
                  <div className="text-2xl font-bold">{clCount || 0}</div>
                  <div className="text-xs text-gray-500">Concentrated</div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-400">💧</span>
                    <span className="text-xs text-gray-400">V2 Positions</span>
                  </div>
                  <div className="text-2xl font-bold">{v2Positions?.length || 0}</div>
                  <div className="text-xs text-gray-500">Classic AMM</div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-secondary">🔐</span>
                    <span className="text-xs text-gray-400">veNFTs</span>
                  </div>
                  <div className="text-2xl font-bold">{totalVeNFTs}</div>
                  <div className="text-xs text-gray-500">Vote Power</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/liquidity" className="flex-1 min-w-[200px]">
                  <button className="w-full py-3 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition flex items-center justify-center gap-2">
                    💧 Add Liquidity
                  </button>
                </Link>
                <Link href="/liquidity" className="flex-1 min-w-[200px]">
                  <button className="w-full py-3 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition flex items-center justify-center gap-2">
                    ⚡ Manage Staking
                  </button>
                </Link>
                <Link href="/vote" className="flex-1 min-w-[200px]">
                  <button className="w-full py-3 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition flex items-center justify-center gap-2">
                    🔐 Lock YAKA
                  </button>
                </Link>
              </div>
            </motion.div>
          </section>
        </>
      )}

      {/* YAKA Token Section */}
      <section className="py-12">
        <motion.div
          className="glass-card p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-primary/30">
                Y
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-1">YAKA Token</h2>
                <p className="text-gray-400">
                  The governance token of YAKA Finance. Lock to vote and earn.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <Link href="/swap">
                <motion.button
                  className="btn-gradient"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Get YAKA
                </motion.button>
              </Link>
              <Link href="/vote">
                <motion.button
                  className="btn-secondary"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Lock & Vote
                </motion.button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

