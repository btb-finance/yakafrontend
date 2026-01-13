'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useReadContract } from 'wagmi';
import { useWriteContract } from '@/hooks/useWriteContract';
import { Address } from 'viem';
import { V2_CONTRACTS, CL_CONTRACTS } from '@/config/contracts';
import { DEFAULT_TOKEN_LIST, Token } from '@/config/tokens';
import { getPrimaryRpc } from '@/utils/rpc';

// Admin ABIs
const VOTER_ABI = [
    {
        inputs: [{ name: '_token', type: 'address' }, { name: '_bool', type: 'bool' }],
        name: 'whitelistToken',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_tokenId', type: 'uint256' }, { name: '_bool', type: 'bool' }],
        name: 'whitelistNFT',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_poolFactory', type: 'address' }, { name: '_pool', type: 'address' }],
        name: 'createGauge',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_token', type: 'address' }],
        name: 'isWhitelistedToken',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'governor',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_gauge', type: 'address' }],
        name: 'killGauge',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: '_pool', type: 'address' }],
        name: 'gauges',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'length',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: '_start', type: 'uint256' }, { name: '_finish', type: 'uint256' }],
        name: 'distribute',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

const FACTORY_REGISTRY_ABI = [
    {
        inputs: [
            { name: 'poolFactory', type: 'address' },
            { name: 'votingRewardsFactory', type: 'address' },
            { name: 'gaugeFactory', type: 'address' },
        ],
        name: 'approve',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'poolFactory', type: 'address' }],
        name: 'unapprove',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'owner',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'poolFactory', type: 'address' }],
        name: 'isPoolFactoryApproved',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

const CL_FACTORY_ABI = [
    {
        inputs: [{ name: 'tickSpacing', type: 'int24' }, { name: 'fee', type: 'uint24' }],
        name: 'enableTickSpacing',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'owner',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'tickSpacing', type: 'int24' },
            { name: 'fee', type: 'uint24' },
        ],
        name: 'enableTickSpacing',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'tickSpacing', type: 'int24' }],
        name: 'tickSpacingToFee',
        outputs: [{ name: '', type: 'uint24' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

const MINTER_ABI = [
    {
        inputs: [],
        name: 'weekly',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'activePeriod',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'epochCount',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'tailEmissionRate',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'teamRate',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'initialized',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'team',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'updatePeriod',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

type AdminTab = 'tokens' | 'gauges' | 'factories' | 'config';

export default function AdminPage() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<AdminTab>('tokens');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [tokenAddress, setTokenAddress] = useState('');
    const [whitelistAction, setWhitelistAction] = useState<'whitelist' | 'unwhitelist'>('whitelist');
    const [nftId, setNftId] = useState('');
    const [poolAddress, setPoolAddress] = useState('');
    const [gaugeAddress, setGaugeAddress] = useState('');
    const [factoryType, setFactoryType] = useState<'v2' | 'cl'>('v2');
    const [newPoolFactory, setNewPoolFactory] = useState('');
    const [newVotingRewardsFactory, setNewVotingRewardsFactory] = useState('');
    const [newGaugeFactory, setNewGaugeFactory] = useState('');
    // Fee tier state
    const [newTickSpacing, setNewTickSpacing] = useState('80');
    const [newFee, setNewFee] = useState('2500'); // 0.25% = 2500

    const { writeContractAsync } = useWriteContract();

    // Read contract info
    const { data: voterGovernor } = useReadContract({
        address: V2_CONTRACTS.Voter as Address,
        abi: VOTER_ABI,
        functionName: 'governor',
    });

    const { data: registryOwner } = useReadContract({
        address: V2_CONTRACTS.FactoryRegistry as Address,
        abi: FACTORY_REGISTRY_ABI,
        functionName: 'owner',
    });

    const { data: clFactoryOwner } = useReadContract({
        address: CL_CONTRACTS.CLFactory as Address,
        abi: CL_FACTORY_ABI,
        functionName: 'owner',
    });

    // Get number of pools to distribute
    const { data: voterPoolsLength } = useReadContract({
        address: V2_CONTRACTS.Voter as Address,
        abi: VOTER_ABI,
        functionName: 'length',
    });

    // Check if factories are approved
    const { data: isV2FactoryApproved, refetch: refetchV2Approval } = useReadContract({
        address: V2_CONTRACTS.FactoryRegistry as Address,
        abi: FACTORY_REGISTRY_ABI,
        functionName: 'isPoolFactoryApproved',
        args: [V2_CONTRACTS.PoolFactory as Address],
    });

    const { data: isCLFactoryApproved, refetch: refetchCLApproval } = useReadContract({
        address: V2_CONTRACTS.FactoryRegistry as Address,
        abi: FACTORY_REGISTRY_ABI,
        functionName: 'isPoolFactoryApproved',
        args: [CL_CONTRACTS.CLFactory as Address],
    });

    // Check if token is whitelisted
    const { data: isTokenWhitelisted, refetch: refetchWhitelist } = useReadContract({
        address: V2_CONTRACTS.Voter as Address,
        abi: VOTER_ABI,
        functionName: 'isWhitelistedToken',
        args: [tokenAddress as Address],
        query: {
            enabled: tokenAddress.length === 42 && tokenAddress.startsWith('0x'),
        },
    });

    // Minter data for weekly epoch info
    const { data: weeklyEmissions } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'weekly',
    });

    const { data: activePeriod } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'activePeriod',
    });

    const { data: epochCount } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'epochCount',
    });

    const { data: tailEmissionRate } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'tailEmissionRate',
    });

    const { data: teamRate } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'teamRate',
    });

    const { data: minterInitialized } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'initialized',
    });

    const { data: minterTeam } = useReadContract({
        address: V2_CONTRACTS.Minter as Address,
        abi: MINTER_ABI,
        functionName: 'team',
    });

    // Helper to format epoch times
    const formatEpochTime = (timestamp: bigint | undefined) => {
        if (!timestamp) return 'Loading...';
        const date = new Date(Number(timestamp) * 1000);
        return date.toLocaleString();
    };

    const getNextEpochTime = (activePeriod: bigint | undefined) => {
        if (!activePeriod) return 'Loading...';
        const nextEpoch = Number(activePeriod) + (7 * 24 * 60 * 60); // +1 week
        const date = new Date(nextEpoch * 1000);
        return date.toLocaleString();
    };

    const getTimeUntilNextEpoch = (activePeriod: bigint | undefined) => {
        if (!activePeriod) return 'Loading...';
        const nextEpoch = Number(activePeriod) + (7 * 24 * 60 * 60);
        const now = Math.floor(Date.now() / 1000);
        const diff = nextEpoch - now;
        if (diff <= 0) return 'Epoch ended - ready for update!';
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    };

    // Handle updatePeriod call
    const handleUpdatePeriod = async () => {
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Minter as Address,
                abi: MINTER_ABI,
                functionName: 'updatePeriod',
            });
            setTxHash(hash);
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    // Handle distribute call - triggers fee claims for all gauges
    const handleDistribute = async () => {
        if (!voterPoolsLength) return;
        setError(null);
        try {
            const poolCount = Number(voterPoolsLength);
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'distribute',
                args: [BigInt(0), BigInt(poolCount)],
            });
            setTxHash(hash);
        } catch (err: any) {
            setError(err.message || 'Distribute failed');
        }
    };

    // Handlers
    const handleWhitelistToken = async () => {
        if (!tokenAddress) return;
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'whitelistToken',
                args: [tokenAddress as Address, whitelistAction === 'whitelist'],
            });
            setTxHash(hash);
            refetchWhitelist();
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    const handleWhitelistNFT = async () => {
        if (!nftId) return;
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'whitelistNFT',
                args: [BigInt(nftId), whitelistAction === 'whitelist'],
            });
            setTxHash(hash);
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    const handleCreateGauge = async () => {
        if (!poolAddress) return;
        setError(null);
        try {
            // Auto-detect the pool's factory by calling pool.factory()
            // This ensures we use the correct factory (CLFactory vs PoolFactory)
            const factoryResult = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{ to: poolAddress, data: '0xc45a0155' }, 'latest'], // factory() selector
                    id: 1
                })
            }).then(r => r.json());

            if (!factoryResult.result || factoryResult.result === '0x') {
                setError('Could not detect pool factory. Is this a valid pool address?');
                return;
            }

            const poolFactory = '0x' + factoryResult.result.slice(-40);
            console.log('Auto-detected pool factory:', poolFactory);

            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'createGauge',
                args: [poolFactory as Address, poolAddress as Address],
            });
            setTxHash(hash);
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    // Lookup gauge for a pool
    const handleLookupGauge = async () => {
        if (!poolAddress) return;
        setError(null);
        try {
            const gaugeResult = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_call',
                    params: [{
                        to: V2_CONTRACTS.Voter,
                        data: '0xb9a09fd5' + poolAddress.slice(2).toLowerCase().padStart(64, '0')
                    }, 'latest'],
                    id: 1
                })
            }).then(r => r.json());

            if (gaugeResult.result && gaugeResult.result !== '0x' + '0'.repeat(64)) {
                const foundGauge = '0x' + gaugeResult.result.slice(-40);
                setGaugeAddress(foundGauge);
                console.log('Found gauge:', foundGauge);
            } else {
                setError('No gauge found for this pool');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to lookup gauge');
        }
    };

    // Kill a gauge (remove it)
    const handleKillGauge = async () => {
        if (!gaugeAddress) return;
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.Voter as Address,
                abi: VOTER_ABI,
                functionName: 'killGauge',
                args: [gaugeAddress as Address],
            });
            setTxHash(hash);
            setGaugeAddress('');
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    // Enable a new fee tier in CLFactory
    const handleEnableTickSpacing = async () => {
        if (!newTickSpacing || !newFee) return;
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: CL_CONTRACTS.CLFactory as Address,
                abi: CL_FACTORY_ABI,
                functionName: 'enableTickSpacing',
                args: [parseInt(newTickSpacing), parseInt(newFee)],
            });
            setTxHash(hash);
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    const handleApproveFactory = async () => {
        if (!newPoolFactory || !newVotingRewardsFactory || !newGaugeFactory) return;
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.FactoryRegistry as Address,
                abi: FACTORY_REGISTRY_ABI,
                functionName: 'approve',
                args: [
                    newPoolFactory as Address,
                    newVotingRewardsFactory as Address,
                    newGaugeFactory as Address,
                ],
            });
            setTxHash(hash);
            refetchV2Approval();
            refetchCLApproval();
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    // One-click approve CL factories
    const handleApproveCLFactories = async () => {
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: V2_CONTRACTS.FactoryRegistry as Address,
                abi: FACTORY_REGISTRY_ABI,
                functionName: 'approve',
                args: [
                    CL_CONTRACTS.CLFactory as Address,
                    V2_CONTRACTS.VotingRewardsFactory as Address,
                    CL_CONTRACTS.CLGaugeFactory as Address,
                ],
            });
            setTxHash(hash);
            refetchCLApproval();
        } catch (err: any) {
            setError(err.message || 'Transaction failed');
        }
    };

    const selectToken = (token: Token) => {
        setTokenAddress(token.address);
    };

    return (
        <div className="container mx-auto px-6 py-8">
            {/* Header */}
            <motion.div
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-4xl font-bold mb-4">
                    <span className="gradient-text">Admin Dashboard</span>
                </h1>
                <p className="text-gray-400 max-w-2xl mx-auto">
                    Protocol administration for WIND Finance. Whitelist tokens, create gauges, and manage factories.
                </p>
            </motion.div>

            {/* Connection Check */}
            {!isConnected ? (
                <div className="glass-card p-12 text-center max-w-xl mx-auto">
                    <h3 className="text-xl font-semibold mb-2">Connect Wallet</h3>
                    <p className="text-gray-400">Connect your wallet to access admin functions</p>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto">
                    {/* Contract Info */}
                    <div className="glass-card p-4 mb-6">
                        <h3 className="font-semibold mb-3">Contract Permissions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-gray-400 text-xs mb-1">Voter Governor</div>
                                <div className="font-mono text-xs truncate">
                                    {voterGovernor ? voterGovernor.slice(0, 10) + '...' : 'Loading...'}
                                </div>
                                {address?.toLowerCase() === voterGovernor?.toLowerCase() && (
                                    <span className="text-xs text-green-400">✓ You are governor</span>
                                )}
                            </div>
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-gray-400 text-xs mb-1">Registry Owner</div>
                                <div className="font-mono text-xs truncate">
                                    {registryOwner ? registryOwner.slice(0, 10) + '...' : 'Loading...'}
                                </div>
                                {address?.toLowerCase() === registryOwner?.toLowerCase() && (
                                    <span className="text-xs text-green-400">✓ You are owner</span>
                                )}
                            </div>
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-gray-400 text-xs mb-1">CL Factory Owner</div>
                                <div className="font-mono text-xs truncate">
                                    {clFactoryOwner ? clFactoryOwner.slice(0, 10) + '...' : 'Loading...'}
                                </div>
                                {address?.toLowerCase() === clFactoryOwner?.toLowerCase() && (
                                    <span className="text-xs text-green-400">✓ You are owner</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6">
                        {(['tokens', 'gauges', 'factories', 'config'] as AdminTab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Error/Success Display */}
                    {error && (
                        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                    {txHash && (
                        <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                            Transaction sent: <a href={`https://seiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">{txHash.slice(0, 20)}...</a>
                        </div>
                    )}

                    {/* Tokens Tab */}
                    {activeTab === 'tokens' && (
                        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {/* Whitelist Token */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">Whitelist Token</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Whitelisted tokens can be used in pools and receive gauge votes.
                                </p>

                                {/* Quick Select */}
                                <div className="mb-4">
                                    <label className="text-sm text-gray-400 mb-2 block">Quick Select</label>
                                    <div className="flex flex-wrap gap-2">
                                        {DEFAULT_TOKEN_LIST.map((token) => (
                                            <button
                                                key={token.symbol}
                                                onClick={() => selectToken(token)}
                                                className={`px-3 py-1 text-sm rounded-lg transition ${tokenAddress === token.address
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/5 hover:bg-white/10'
                                                    }`}
                                            >
                                                {token.symbol}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-gray-400 mb-2 block">Token Address</label>
                                        <input
                                            type="text"
                                            value={tokenAddress}
                                            onChange={(e) => setTokenAddress(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                        />
                                        {tokenAddress && isTokenWhitelisted !== undefined && (
                                            <div className={`text-xs mt-1 ${isTokenWhitelisted ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {isTokenWhitelisted ? '✓ Already whitelisted' : '⚠ Not whitelisted'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setWhitelistAction('whitelist')}
                                            className={`flex-1 py-2 rounded-lg text-sm transition ${whitelistAction === 'whitelist'
                                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                : 'bg-white/5 text-gray-400'
                                                }`}
                                        >
                                            Whitelist
                                        </button>
                                        <button
                                            onClick={() => setWhitelistAction('unwhitelist')}
                                            className={`flex-1 py-2 rounded-lg text-sm transition ${whitelistAction === 'unwhitelist'
                                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                : 'bg-white/5 text-gray-400'
                                                }`}
                                        >
                                            Unwhitelist
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleWhitelistToken}
                                        disabled={!tokenAddress}
                                        className="w-full py-3 rounded-lg bg-primary text-white font-medium disabled:opacity-50"
                                    >
                                        {whitelistAction === 'whitelist' ? 'Whitelist Token' : 'Remove from Whitelist'}
                                    </button>
                                </div>
                            </div>

                            {/* Whitelist NFT */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">Whitelist veNFT</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Allow specific veNFT to vote on gauges (for managed NFTs).
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-gray-400 mb-2 block">veNFT Token ID</label>
                                        <input
                                            type="number"
                                            value={nftId}
                                            onChange={(e) => setNftId(e.target.value)}
                                            placeholder="1"
                                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={handleWhitelistNFT}
                                        disabled={!nftId}
                                        className="w-full py-3 rounded-lg bg-primary text-white font-medium disabled:opacity-50"
                                    >
                                        {whitelistAction === 'whitelist' ? 'Whitelist NFT' : 'Remove from Whitelist'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Gauges Tab */}
                    {activeTab === 'gauges' && (
                        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {/* Factory Approval Status */}
                            <div className="glass-card p-4">
                                <h3 className="font-semibold mb-3">Factory Approval Status</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className={`p-3 rounded-lg ${isV2FactoryApproved ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                        <div className="text-gray-400 text-xs mb-1">V2 PoolFactory</div>
                                        <div className={`font-medium ${isV2FactoryApproved ? 'text-green-400' : 'text-red-400'}`}>
                                            {isV2FactoryApproved ? '✓ Approved' : '✗ Not Approved'}
                                        </div>
                                    </div>
                                    <div className={`p-3 rounded-lg ${isCLFactoryApproved ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                        <div className="text-gray-400 text-xs mb-1">CL Factory</div>
                                        <div className={`font-medium ${isCLFactoryApproved ? 'text-green-400' : 'text-red-400'}`}>
                                            {isCLFactoryApproved ? '✓ Approved' : '✗ Not Approved'}
                                        </div>
                                    </div>
                                </div>
                                {!isCLFactoryApproved && (
                                    <button
                                        onClick={handleApproveCLFactories}
                                        className="w-full mt-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition text-sm font-medium"
                                    >
                                        🔓 Approve CL Factory Set (One-Click)
                                    </button>
                                )}
                            </div>

                            {/* Create Gauge */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">Create Gauge</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Create a gauge for a pool. Factory is auto-detected from the pool address.
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-gray-400 mb-2 block">Pool Address</label>
                                        <input
                                            type="text"
                                            value={poolAddress}
                                            onChange={(e) => setPoolAddress(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                        />
                                    </div>
                                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
                                        ℹ️ Factory will be auto-detected by calling pool.factory()
                                    </div>
                                    <button
                                        onClick={handleCreateGauge}
                                        disabled={!poolAddress}
                                        className="w-full py-3 rounded-lg bg-primary text-white font-medium disabled:opacity-50"
                                    >
                                        Create Gauge
                                    </button>
                                </div>
                            </div>

                            {/* Claim Pool Fees */}
                            <div className="glass-card p-6 bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
                                <h3 className="text-lg font-semibold mb-2 text-green-400">💰 Claim Pool Fees</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Push accumulated trading fees from all pools to the voting reward contracts.
                                    This makes fees claimable by voters on the Vote page.
                                </p>
                                <div className="p-4 rounded-lg bg-white/5 mb-4">
                                    <h4 className="text-sm font-medium mb-2">How it works:</h4>
                                    <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                                        <li>Trading fees accumulate in each pool from swaps</li>
                                        <li>Click &quot;Distribute Fees&quot; to claim from all pools</li>
                                        <li>Fees are sent to FeesVotingReward contracts</li>
                                        <li>Voters can then claim their share on the Vote page</li>
                                    </ol>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 mb-4">
                                    <span className="text-sm text-gray-400">Active Gauges</span>
                                    <span className="font-bold">{voterPoolsLength?.toString() || '0'}</span>
                                </div>
                                <button
                                    onClick={handleDistribute}
                                    disabled={!voterPoolsLength || Number(voterPoolsLength) === 0}
                                    className="w-full py-3 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 font-medium hover:from-green-500/30 hover:to-emerald-500/30 transition disabled:opacity-50"
                                >
                                    🚀 Distribute Fees to All Gauges
                                </button>
                            </div>

                            {/* Kill Gauge */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4 text-red-400">Kill Gauge</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Kill (disable) a gauge that was created incorrectly. Use with caution!
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-gray-400 mb-2 block">Pool Address (to lookup gauge)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={poolAddress}
                                                onChange={(e) => setPoolAddress(e.target.value)}
                                                placeholder="0x..."
                                                className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                            />
                                            <button
                                                onClick={handleLookupGauge}
                                                disabled={!poolAddress}
                                                className="px-4 py-2 rounded-lg bg-white/10 text-gray-200 disabled:opacity-50"
                                            >
                                                Lookup
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-400 mb-2 block">Gauge Address</label>
                                        <input
                                            type="text"
                                            value={gaugeAddress}
                                            onChange={(e) => setGaugeAddress(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                        />
                                    </div>
                                    {gaugeAddress && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                                            ⚠️ Killing a gauge is irreversible! Make sure this is the correct gauge.
                                        </div>
                                    )}
                                    <button
                                        onClick={handleKillGauge}
                                        disabled={!gaugeAddress}
                                        className="w-full py-3 rounded-lg bg-red-500/20 text-red-400 font-medium disabled:opacity-50 hover:bg-red-500/30"
                                    >
                                        Kill Gauge
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Factories Tab */}
                    {activeTab === 'factories' && (
                        <motion.div className="glass-card p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h3 className="text-lg font-semibold mb-4">Approve Factory Set</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Approve a set of factories (pool, voting rewards, gauge) for creating new pools with gauges.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-gray-400 mb-2 block">Pool Factory</label>
                                    <input
                                        type="text"
                                        value={newPoolFactory}
                                        onChange={(e) => setNewPoolFactory(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={() => setNewPoolFactory(V2_CONTRACTS.PoolFactory)}
                                            className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                                        >
                                            V2 Factory
                                        </button>
                                        <button
                                            onClick={() => setNewPoolFactory(CL_CONTRACTS.CLFactory)}
                                            className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                                        >
                                            CL Factory
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 mb-2 block">Voting Rewards Factory</label>
                                    <input
                                        type="text"
                                        value={newVotingRewardsFactory}
                                        onChange={(e) => setNewVotingRewardsFactory(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                    />
                                    <button
                                        onClick={() => setNewVotingRewardsFactory(V2_CONTRACTS.VotingRewardsFactory)}
                                        className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 mt-2"
                                    >
                                        Use Default
                                    </button>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 mb-2 block">Gauge Factory</label>
                                    <input
                                        type="text"
                                        value={newGaugeFactory}
                                        onChange={(e) => setNewGaugeFactory(e.target.value)}
                                        placeholder="0x..."
                                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={() => setNewGaugeFactory(V2_CONTRACTS.GaugeFactory)}
                                            className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                                        >
                                            V2 Gauge
                                        </button>
                                        <button
                                            onClick={() => setNewGaugeFactory(CL_CONTRACTS.CLGaugeFactory)}
                                            className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                                        >
                                            CL Gauge
                                        </button>
                                    </div>
                                </div>
                                <button
                                    onClick={handleApproveFactory}
                                    disabled={!newPoolFactory || !newVotingRewardsFactory || !newGaugeFactory}
                                    className="w-full py-3 rounded-lg bg-primary text-white font-medium disabled:opacity-50"
                                >
                                    Approve Factory Set
                                </button>
                            </div>

                            {/* Enable Fee Tier */}
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <h3 className="text-lg font-semibold mb-4">Enable CL Fee Tier</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Enable a new fee tier for CL pools. Fee is in basis points (2500 = 0.25%).
                                </p>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm text-gray-400 mb-2 block">Tick Spacing</label>
                                            <input
                                                type="number"
                                                value={newTickSpacing}
                                                onChange={(e) => setNewTickSpacing(e.target.value)}
                                                placeholder="80"
                                                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm text-gray-400 mb-2 block">Fee (basis points)</label>
                                            <input
                                                type="number"
                                                value={newFee}
                                                onChange={(e) => setNewFee(e.target.value)}
                                                placeholder="2500"
                                                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
                                        <div className="text-blue-400">
                                            {newFee ? `Fee: ${(parseInt(newFee) / 10000).toFixed(4)}%` : 'Enter fee amount'}
                                        </div>
                                        <div className="text-gray-400 text-xs mt-1">
                                            Formula: bps ÷ 10000 = fee % | 90=0.009%, 450=0.045%, 2500=0.25%, 10000=1%
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleEnableTickSpacing}
                                        disabled={!newTickSpacing || !newFee}
                                        className="w-full py-3 rounded-lg bg-secondary text-white font-medium disabled:opacity-50"
                                    >
                                        Enable Fee Tier
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Config Tab */}
                    {activeTab === 'config' && (
                        <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {/* Epoch/Emissions Info */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">📅 Weekly Epoch Info</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                                        <div className="text-xs text-gray-400 mb-1">Current Epoch</div>
                                        <div className="text-2xl font-bold gradient-text">
                                            {epochCount !== undefined ? epochCount.toString() : 'Loading...'}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                        <div className="text-xs text-gray-400 mb-1">Weekly Emissions</div>
                                        <div className="text-xl font-bold text-green-400">
                                            {weeklyEmissions !== undefined
                                                ? `${(Number(weeklyEmissions) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })} WIND`
                                                : 'Loading...'}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                                        <div className="text-xs text-gray-400 mb-1">Time Until Next Epoch</div>
                                        <div className="text-xl font-bold text-blue-400">
                                            {getTimeUntilNextEpoch(activePeriod)}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                                        <div className="text-xs text-gray-400 mb-1">Minter Status</div>
                                        <div className={`text-xl font-bold ${minterInitialized ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {minterInitialized !== undefined
                                                ? (minterInitialized ? '✓ Initialized' : '⚠ Not Initialized')
                                                : 'Loading...'}
                                        </div>
                                    </div>
                                </div>

                                {/* Epoch Times */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Epoch Start (activePeriod)</div>
                                        <div className="font-medium">{formatEpochTime(activePeriod)}</div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Epoch End / Next Epoch</div>
                                        <div className="font-medium">{getNextEpochTime(activePeriod)}</div>
                                    </div>
                                </div>

                                {/* Rates */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Team Rate</div>
                                        <div className="font-medium text-primary">
                                            {teamRate !== undefined ? `${(Number(teamRate) / 100).toFixed(2)}%` : 'Loading...'}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Tail Emission Rate</div>
                                        <div className="font-medium text-secondary">
                                            {tailEmissionRate !== undefined ? `${(Number(tailEmissionRate) / 100).toFixed(2)}%` : 'Loading...'}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Minter Team</div>
                                        <div className="font-mono text-xs truncate">
                                            {minterTeam ? `${minterTeam.slice(0, 10)}...${minterTeam.slice(-6)}` : 'Loading...'}
                                        </div>
                                        {address?.toLowerCase() === minterTeam?.toLowerCase() && (
                                            <span className="text-xs text-green-400">✓ You are team</span>
                                        )}
                                    </div>
                                </div>

                                {/* Update Period Button */}
                                <div className="border-t border-white/10 pt-4">
                                    <p className="text-sm text-gray-400 mb-3">
                                        Call <code className="bg-white/10 px-1 rounded">updatePeriod()</code> to mint emissions for the new week.
                                        Anyone can call this once the epoch ends.
                                    </p>
                                    <button
                                        onClick={handleUpdatePeriod}
                                        className="w-full py-3 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition"
                                    >
                                        🔄 Update Period (Mint Emissions)
                                    </button>
                                </div>
                            </div>

                            {/* Distribute Rewards Section */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">💰 Distribute Rewards</h3>
                                <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 mb-4">
                                    <div className="text-sm text-gray-300 mb-2 font-medium">What this does:</div>
                                    <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside">
                                        <li>Sends weekly WIND emissions to all gauge contracts</li>
                                        <li>Claims LP trading fees from pools and sends them to voters</li>
                                        <li>Must be called weekly after each epoch ends</li>
                                    </ul>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Active Gauges</div>
                                        <div className="text-xl font-bold text-primary">
                                            {voterPoolsLength !== undefined ? voterPoolsLength.toString() : 'Loading...'}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-xs text-gray-400 mb-1">Weekly WIND</div>
                                        <div className="text-xl font-bold text-green-400">
                                            {weeklyEmissions !== undefined
                                                ? `${(Number(weeklyEmissions) / 1e18 / 1000).toFixed(0)}K`
                                                : '...'}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400 mb-4">
                                    <div className="font-medium mb-1">📋 How LP Fees Flow to Voters:</div>
                                    <div className="text-xs text-gray-400 space-y-1">
                                        <div>1. Pool collects trading fees (0.009-1.00%)</div>
                                        <div>2. <code className="bg-white/10 px-1 rounded">distribute()</code> calls each gauge</div>
                                        <div>3. Gauges claim fees from pools → send to FeesVotingReward</div>
                                        <div>4. Voters can claim fee rewards proportional to their votes</div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleDistribute}
                                    disabled={!voterPoolsLength}
                                    className="w-full py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium hover:opacity-90 transition disabled:opacity-50"
                                >
                                    💰 Distribute Rewards to All Gauges ({voterPoolsLength?.toString() || '0'} pools)
                                </button>
                            </div>

                            {/* Tick Spacing & Fee Tier Reference */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">📊 Tick Spacing & Fee Tier Reference</h3>

                                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 mb-4">
                                    <div className="text-sm text-gray-300 mb-2 font-medium">How it works:</div>
                                    <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
                                        <li><strong>Tick Spacing</strong> = precision of price points in the pool</li>
                                        <li><strong>Smaller</strong> spacing = more precise, better for stablecoins</li>
                                        <li><strong>Larger</strong> spacing = fewer ticks, better for volatile pairs</li>
                                        <li><strong>Fee (bps)</strong> = basis points, 100 bps = 1%</li>
                                    </ul>
                                </div>

                                <div className="text-sm font-medium text-primary mb-3">🏆 Competitive Fee Tiers (Beat Competitors!)</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-white/10">
                                                <th className="text-left py-2 px-2 text-gray-400">Use Case</th>
                                                <th className="text-center py-2 px-2 text-gray-400">Tick Spacing</th>
                                                <th className="text-center py-2 px-2 text-gray-400">Fee (bps)</th>
                                                <th className="text-center py-2 px-2 text-gray-400">Fee %</th>
                                                <th className="text-center py-2 px-2 text-gray-400">Competitor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-b border-white/5 bg-green-500/5">
                                                <td className="py-2 px-2 text-green-400 font-medium">Stablecoins (USDC/USDT)</td>
                                                <td className="text-center py-2 px-2 font-mono">1</td>
                                                <td className="text-center py-2 px-2 font-mono text-green-400">90</td>
                                                <td className="text-center py-2 px-2 text-green-400 font-bold">0.009%</td>
                                                <td className="text-center py-2 px-2 text-gray-500">vs 0.01%</td>
                                            </tr>
                                            <tr className="border-b border-white/5 bg-green-500/5">
                                                <td className="py-2 px-2 text-green-400 font-medium">Correlated (ETH/WETH)</td>
                                                <td className="text-center py-2 px-2 font-mono">10</td>
                                                <td className="text-center py-2 px-2 font-mono text-green-400">450</td>
                                                <td className="text-center py-2 px-2 text-green-400 font-bold">0.045%</td>
                                                <td className="text-center py-2 px-2 text-gray-500">vs 0.05%</td>
                                            </tr>
                                            <tr className="border-b border-white/5 bg-green-500/5">
                                                <td className="py-2 px-2 text-green-400 font-medium">Standard Pairs</td>
                                                <td className="text-center py-2 px-2 font-mono">80</td>
                                                <td className="text-center py-2 px-2 font-mono text-green-400">2500</td>
                                                <td className="text-center py-2 px-2 text-green-400 font-bold">0.25%</td>
                                                <td className="text-center py-2 px-2 text-gray-500">vs 0.30%</td>
                                            </tr>
                                            <tr className="border-b border-white/5">
                                                <td className="py-2 px-2">High Volatility / Exotic</td>
                                                <td className="text-center py-2 px-2 font-mono">2000</td>
                                                <td className="text-center py-2 px-2 font-mono">10000</td>
                                                <td className="text-center py-2 px-2">1.00%</td>
                                                <td className="text-center py-2 px-2 text-gray-500">standard</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                    <div className="text-sm text-yellow-400 font-medium mb-2">⚠️ Important Notes:</div>
                                    <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                                        <li>Tick spacing must be divisible into 887272 (max tick)</li>
                                        <li>Common valid spacings: 1, 2, 5, 10, 20, 50, 60, 100, 200, 500, 1000, 2000</li>
                                        <li>Lower fees attract more volume but less revenue per trade</li>
                                        <li>Match tick spacing to expected price movement frequency</li>
                                    </ul>
                                </div>

                                <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
                                    <div className="text-sm text-primary font-medium mb-2">🚀 Quick Add Competitive Tiers:</div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => { setNewTickSpacing('1'); setNewFee('90'); }}
                                            className="px-3 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 transition"
                                        >
                                            0.009% (ts=1)
                                        </button>
                                        <button
                                            onClick={() => { setNewTickSpacing('10'); setNewFee('450'); }}
                                            className="px-3 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 transition"
                                        >
                                            0.045% (ts=10)
                                        </button>
                                        <button
                                            onClick={() => { setNewTickSpacing('80'); setNewFee('2500'); }}
                                            className="px-3 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 transition"
                                        >
                                            0.25% (ts=80)
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Click to populate the "Enable CL Fee Tier" form in the Factories tab
                                    </p>
                                </div>
                            </div>

                            {/* Contract Addresses */}
                            <div className="glass-card p-6">
                                <h3 className="text-lg font-semibold mb-4">Contract Addresses</h3>
                                <div className="space-y-3 text-sm">
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-gray-400 text-xs mb-1">V2 Contracts</div>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            {Object.entries(V2_CONTRACTS).map(([name, addr]) => (
                                                <div key={name} className="flex justify-between">
                                                    <span className="text-gray-400">{name}</span>
                                                    <span className="font-mono text-xs">{addr.slice(0, 10)}...</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-white/5">
                                        <div className="text-gray-400 text-xs mb-1">CL (Slipstream) Contracts</div>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            {Object.entries(CL_CONTRACTS).map(([name, addr]) => (
                                                <div key={name} className="flex justify-between">
                                                    <span className="text-gray-400">{name}</span>
                                                    <span className="font-mono text-xs">{addr.slice(0, 10)}...</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    );
}
