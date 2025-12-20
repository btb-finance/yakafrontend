'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits, Address, formatUnits } from 'viem';
import { Token, DEFAULT_TOKEN_LIST, SEI, WSEI, USDC } from '@/config/tokens';
import { CL_CONTRACTS, V2_CONTRACTS } from '@/config/contracts';
import { TokenSelector } from '@/components/common/TokenSelector';
import { useLiquidity } from '@/hooks/useLiquidity';
import { useTokenBalance } from '@/hooks/useToken';
import { NFT_POSITION_MANAGER_ABI, ERC20_ABI } from '@/config/abis';

type PoolType = 'v2' | 'cl';
type TxStep = 'idle' | 'approving0' | 'approving1' | 'minting' | 'done' | 'error';

interface PoolConfig {
    token0?: Token;
    token1?: Token;
    poolType: PoolType;
    tickSpacing?: number;
    stable?: boolean;
}

interface AddLiquidityModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialPool?: PoolConfig;
}

// Mobile-optimized styles
const mobileStyles = {
    overlay: "fixed inset-0 z-50 flex items-end sm:items-center justify-center",
    modal: "relative z-10 w-full sm:max-w-lg max-h-[95vh] sm:max-h-[85vh] overflow-hidden bg-[#0d0d14] sm:rounded-2xl rounded-t-3xl border border-white/10 shadow-2xl flex flex-col",
    header: "sticky top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5 border-b border-white/10 bg-[#0d0d14]/95 backdrop-blur-sm",
    scrollArea: "flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 space-y-5",
    footer: "sticky bottom-0 z-20 px-4 py-4 sm:px-6 sm:py-5 border-t border-white/10 bg-[#0d0d14]/95 backdrop-blur-sm",
};

export function AddLiquidityModal({ isOpen, onClose, initialPool }: AddLiquidityModalProps) {
    const { isConnected, address } = useAccount();
    const [poolType, setPoolType] = useState<PoolType>(initialPool?.poolType || 'v2');

    // Token state
    const [tokenA, setTokenA] = useState<Token | undefined>(initialPool?.token0 || SEI);
    const [tokenB, setTokenB] = useState<Token | undefined>(initialPool?.token1 || USDC);
    const [amountA, setAmountA] = useState('');
    const [amountB, setAmountB] = useState('');
    const [stable, setStable] = useState(initialPool?.stable || false);
    const [selectorOpen, setSelectorOpen] = useState<'A' | 'B' | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    // CL specific state
    const [tickSpacing, setTickSpacing] = useState(initialPool?.tickSpacing || 80);
    const [priceLower, setPriceLower] = useState('');
    const [priceUpper, setPriceUpper] = useState('');
    const [clPoolPrice, setClPoolPrice] = useState<number | null>(null);
    const [clPoolAddress, setClPoolAddress] = useState<string | null>(null);
    const [initialPrice, setInitialPrice] = useState('');

    // Transaction state
    const [txProgress, setTxProgress] = useState<TxStep>('idle');
    const [txError, setTxError] = useState<string | null>(null);

    // Hooks
    const { addLiquidity, isLoading, error } = useLiquidity();
    const { balance: balanceA } = useTokenBalance(tokenA);
    const { balance: balanceB } = useTokenBalance(tokenB);
    const { writeContractAsync } = useWriteContract();

    // Initialize from pool config when modal opens
    useEffect(() => {
        if (isOpen && initialPool) {
            if (initialPool.token0) setTokenA(initialPool.token0);
            if (initialPool.token1) setTokenB(initialPool.token1);
            setPoolType(initialPool.poolType);
            if (initialPool.tickSpacing) setTickSpacing(initialPool.tickSpacing);
            if (initialPool.stable !== undefined) setStable(initialPool.stable);
        }
    }, [isOpen, initialPool]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setAmountA('');
            setAmountB('');
            setPriceLower('');
            setPriceUpper('');
            setInitialPrice('');
            setTxProgress('idle');
            setTxError(null);
            setTxHash(null);
        }
    }, [isOpen]);

    // Fetch CL pool price when tokens or tickSpacing change
    useEffect(() => {
        const fetchPoolPrice = async () => {
            if (!tokenA || !tokenB || poolType !== 'cl') {
                setClPoolPrice(null);
                setClPoolAddress(null);
                return;
            }

            const actualTokenA = tokenA.isNative ? WSEI : tokenA;
            const actualTokenB = tokenB.isNative ? WSEI : tokenB;

            const [token0, token1] = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase()
                ? [actualTokenA, actualTokenB]
                : [actualTokenB, actualTokenA];

            try {
                const getPoolSelector = '28af8d0b';
                const token0Padded = token0.address.slice(2).toLowerCase().padStart(64, '0');
                const token1Padded = token1.address.slice(2).toLowerCase().padStart(64, '0');
                const tickHex = tickSpacing.toString(16).padStart(64, '0');
                const getPoolData = `0x${getPoolSelector}${token0Padded}${token1Padded}${tickHex}`;

                const poolResponse = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: CL_CONTRACTS.CLFactory, data: getPoolData }, 'latest'],
                        id: 1,
                    }),
                });

                const poolResult = await poolResponse.json();
                if (!poolResult.result || poolResult.result === '0x' + '0'.repeat(64)) {
                    setClPoolPrice(null);
                    setClPoolAddress(null);
                    return;
                }

                const pool = '0x' + poolResult.result.slice(-40);
                setClPoolAddress(pool);

                const slot0Selector = '3850c7bd';
                const slot0Response = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: pool, data: `0x${slot0Selector}` }, 'latest'],
                        id: 2,
                    }),
                });

                const slot0Result = await slot0Response.json();
                if (!slot0Result.result || slot0Result.result === '0x') {
                    setClPoolPrice(null);
                    return;
                }

                const sqrtPriceX96 = BigInt('0x' + slot0Result.result.slice(2, 66));
                const Q96 = BigInt(2) ** BigInt(96);
                const priceRaw = Number(sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** token0.decimals)) / Number(Q96 * Q96 * BigInt(10 ** token1.decimals));
                const price = actualTokenA.address.toLowerCase() === token0.address.toLowerCase()
                    ? priceRaw
                    : 1 / priceRaw;

                setClPoolPrice(price);
            } catch (err) {
                console.error('Error fetching CL pool price:', err);
                setClPoolPrice(null);
                setClPoolAddress(null);
            }
        };

        fetchPoolPrice();
    }, [tokenA, tokenB, tickSpacing, poolType]);

    // Auto-calculate Token B amount for CL
    useEffect(() => {
        const currentPrice = clPoolPrice ?? (initialPrice ? parseFloat(initialPrice) : null);

        if (poolType !== 'cl' || !currentPrice || !amountA || parseFloat(amountA) <= 0) {
            return;
        }

        const pLower = priceLower ? parseFloat(priceLower) : 0;
        const pUpper = priceUpper ? parseFloat(priceUpper) : Infinity;
        const pCurrent = currentPrice;

        if (pLower <= 0 && pUpper === Infinity) {
            const amtA = parseFloat(amountA);
            const amtB = amtA * pCurrent;
            setAmountB(amtB.toFixed(6));
            return;
        }

        if (pLower <= 0 || pUpper <= 0 || pLower >= pUpper) {
            return;
        }

        const sqrtPriceLower = Math.sqrt(pLower);
        const sqrtPriceUpper = Math.sqrt(pUpper);
        const sqrtPriceCurrent = Math.sqrt(pCurrent);
        const amtA = parseFloat(amountA);

        if (pCurrent <= pLower) {
            setAmountB('0');
        } else if (pCurrent >= pUpper) {
            setAmountB('0');
        } else {
            const L = amtA * (sqrtPriceCurrent * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceCurrent);
            const amtB = L * (sqrtPriceCurrent - sqrtPriceLower);
            setAmountB(amtB.toFixed(6));
        }
    }, [poolType, clPoolPrice, initialPrice, amountA, priceLower, priceUpper]);

    // Handle V2 liquidity add
    const handleAddLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB) return;

        const result = await addLiquidity(tokenA, tokenB, amountA, amountB, stable);

        if (result) {
            setTxHash(result.hash);
            setAmountA('');
            setAmountB('');
            setTxProgress('done');
        }
    };

    // Handle CL liquidity add
    const handleAddCLLiquidity = async () => {
        if (!tokenA || !tokenB || !amountA || !amountB || !address) {
            return;
        }

        const amtA = parseFloat(amountA);
        const amtB = parseFloat(amountB);

        // For CL, single-sided liquidity is allowed when price range is outside current price
        // At least one amount must be positive
        if (isNaN(amtA) || isNaN(amtB) || (amtA <= 0 && amtB <= 0)) {
            alert('Please enter a valid amount for at least one token');
            return;
        }

        if (!clPoolPrice && (!initialPrice || parseFloat(initialPrice) <= 0)) {
            alert('Please set the initial price for this new pool');
            return;
        }

        setTxProgress('idle');
        setTxError(null);

        try {
            const actualTokenA = tokenA.isNative ? WSEI : tokenA;
            const actualTokenB = tokenB.isNative ? WSEI : tokenB;

            const isAFirst = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase();
            const token0 = isAFirst ? actualTokenA : actualTokenB;
            const token1 = isAFirst ? actualTokenB : actualTokenA;
            const amount0 = isAFirst ? amountA : amountB;
            const amount1 = isAFirst ? amountB : amountA;
            // Handle 0 amounts gracefully
            const amount0Wei = amount0 && parseFloat(amount0) > 0 ? parseUnits(amount0, token0.decimals) : BigInt(0);
            const amount1Wei = amount1 && parseFloat(amount1) > 0 ? parseUnits(amount1, token1.decimals) : BigInt(0);

            const priceToTick = (userPrice: number, spacing: number): number => {
                if (userPrice <= 0) return 0;

                let rawPrice: number;

                if (isAFirst) {
                    rawPrice = userPrice * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                } else {
                    rawPrice = (1 / userPrice) * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                }

                const tick = Math.floor(Math.log(rawPrice) / Math.log(1.0001));
                return Math.round(tick / spacing) * spacing;
            };

            let tickLower: number;
            let tickUpper: number;

            if (priceLower && priceUpper && parseFloat(priceLower) > 0 && parseFloat(priceUpper) > 0) {
                tickLower = priceToTick(parseFloat(priceLower), tickSpacing);
                tickUpper = priceToTick(parseFloat(priceUpper), tickSpacing);
                if (tickLower > tickUpper) {
                    [tickLower, tickUpper] = [tickUpper, tickLower];
                }
            } else {
                const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing;
                tickLower = -maxTick;
                tickUpper = maxTick;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

            // Check if pool exists
            const tickSpacingHex = tickSpacing >= 0
                ? tickSpacing.toString(16).padStart(64, '0')
                : (BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') + BigInt(tickSpacing) + BigInt(1)).toString(16);
            const poolCheckData = `0x28af8d0b${token0.address.slice(2).padStart(64, '0')}${token1.address.slice(2).padStart(64, '0')}${tickSpacingHex}`;

            let poolExists = false;
            try {
                const poolResult = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_call',
                        params: [{ to: CL_CONTRACTS.CLFactory, data: poolCheckData }, 'latest'],
                        id: 1
                    })
                }).then(r => r.json());

                poolExists = poolResult.result && poolResult.result !== '0x0000000000000000000000000000000000000000000000000000000000000000';
            } catch (err) {
                poolExists = false;
            }

            let sqrtPriceX96 = BigInt(0);
            if (!poolExists) {
                // New pool - calculate sqrtPriceX96 from initial price
                let rawPrice: number;

                if (initialPrice && parseFloat(initialPrice) > 0) {
                    const userPrice = parseFloat(initialPrice);
                    if (isAFirst) {
                        rawPrice = userPrice * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                    } else {
                        rawPrice = (1 / userPrice) * Math.pow(10, token1.decimals) / Math.pow(10, token0.decimals);
                    }
                } else {
                    rawPrice = Number(amount1Wei) / Number(amount0Wei);
                }

                const Q96 = BigInt(2) ** BigInt(96);
                const sqrtPriceFloat = Math.sqrt(rawPrice);
                const sqrtPriceScaled = sqrtPriceFloat * Number(Q96);
                sqrtPriceX96 = BigInt(Math.floor(sqrtPriceScaled));
            }
            // For existing pools, sqrtPriceX96 stays as 0 - the contract ignores it

            // Approve tokens
            const checkAllowance = async (tokenAddr: string, amount: bigint): Promise<boolean> => {
                const result = await fetch('https://evm-rpc.sei-apis.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_call',
                        params: [{
                            to: tokenAddr,
                            data: `0xdd62ed3e${address!.slice(2).toLowerCase().padStart(64, '0')}${CL_CONTRACTS.NonfungiblePositionManager.slice(2).toLowerCase().padStart(64, '0')}`
                        }, 'latest']
                    })
                }).then(r => r.json());
                const allowance = result.result ? BigInt(result.result) : BigInt(0);
                return allowance >= amount;
            };

            // Approve token0 if needed
            const token0IsNative = (tokenA.isNative && token0.address.toLowerCase() === WSEI.address.toLowerCase()) ||
                (tokenB.isNative && token0.address.toLowerCase() === WSEI.address.toLowerCase());
            if (!token0IsNative) {
                const hasAllowance = await checkAllowance(token0.address, amount0Wei);
                if (!hasAllowance) {
                    setTxProgress('approving0');
                    await writeContractAsync({
                        address: token0.address as Address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount0Wei],
                    });
                }
            }

            // Approve token1 if needed
            const token1IsNative = (tokenA.isNative && token1.address.toLowerCase() === WSEI.address.toLowerCase()) ||
                (tokenB.isNative && token1.address.toLowerCase() === WSEI.address.toLowerCase());
            if (!token1IsNative) {
                const hasAllowance = await checkAllowance(token1.address, amount1Wei);
                if (!hasAllowance) {
                    setTxProgress('approving1');
                    await writeContractAsync({
                        address: token1.address as Address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [CL_CONTRACTS.NonfungiblePositionManager as Address, amount1Wei],
                    });
                }
            }

            // Calculate native value - simple check for native tokens
            let nativeValue = BigInt(0);
            if (tokenA.isNative || tokenB.isNative) {
                if (token0.address.toLowerCase() === WSEI.address.toLowerCase()) {
                    nativeValue = amount0Wei;
                } else if (token1.address.toLowerCase() === WSEI.address.toLowerCase()) {
                    nativeValue = amount1Wei;
                }
            }

            // For CL, use 0 for min amounts since the ratio is already calculated from price range
            // This prevents reverts from rounding issues in the contract
            const amount0Min = BigInt(0);
            const amount1Min = BigInt(0);

            console.log('CL Mint params:', {
                token0: token0.address,
                token1: token1.address,
                tickSpacing,
                tickLower,
                tickUpper,
                amount0Desired: amount0Wei.toString(),
                amount1Desired: amount1Wei.toString(),
                amount0Min: amount0Min.toString(),
                amount1Min: amount1Min.toString(),
                sqrtPriceX96: sqrtPriceX96.toString(),
                poolExists,
                nativeValue: nativeValue.toString(),
            });

            setTxProgress('minting');
            const hash = await writeContractAsync({
                address: CL_CONTRACTS.NonfungiblePositionManager as Address,
                abi: NFT_POSITION_MANAGER_ABI,
                functionName: 'mint',
                args: [{
                    token0: token0.address as Address,
                    token1: token1.address as Address,
                    tickSpacing,
                    tickLower,
                    tickUpper,
                    amount0Desired: amount0Wei,
                    amount1Desired: amount1Wei,
                    amount0Min,
                    amount1Min,
                    recipient: address,
                    deadline,
                    sqrtPriceX96,
                }],
                value: nativeValue,
            });

            setTxHash(hash);
            setAmountA('');
            setAmountB('');
            setTxProgress('done');
        } catch (err: any) {
            console.error('CL mint error:', err);
            setTxProgress('error');
            setTxError(err?.message || 'Transaction failed');
        }
    };

    const setPresetRange = (percent: number) => {
        const currentPrice = clPoolPrice ?? (initialPrice ? parseFloat(initialPrice) : null);
        if (currentPrice) {
            setPriceLower((currentPrice * (1 - percent / 100)).toFixed(6));
            setPriceUpper((currentPrice * (1 + percent / 100)).toFixed(6));
        }
    };

    const canAdd = isConnected &&
        tokenA &&
        tokenB &&
        amountA &&
        amountB &&
        parseFloat(amountA) > 0 &&
        parseFloat(amountB) > 0;

    const poolExists = clPoolPrice !== null;
    const currentPrice = clPoolPrice ?? (initialPrice ? parseFloat(initialPrice) : null);

    // Check if pool config is pre-defined (clicking Add LP on existing pool)
    const isPoolPreConfigured = !!(initialPool?.token0 && initialPool?.token1);

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="modal-backdrop"
                        className={mobileStyles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                            onClick={onClose}
                        />

                        {/* Modal - Bottom sheet on mobile, centered on desktop */}
                        <motion.div
                            key="modal-content"
                            className={mobileStyles.modal}
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        >
                            {/* Sticky Header */}
                            <div className={mobileStyles.header}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-bold">Add Liquidity</h2>
                                        <p className="text-xs text-gray-400 hidden sm:block">Deposit tokens to earn fees</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Scrollable Content Area */}
                            <div className={mobileStyles.scrollArea}>
                                {/* Error Display */}
                                {error && (
                                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                                        <div className="flex items-start gap-3">
                                            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <span className="text-red-400 text-xs">!</span>
                                            </div>
                                            <p className="text-red-400 text-sm">{error}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Success Display */}
                                {txHash && txProgress === 'done' && (
                                    <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-green-400 font-medium">Liquidity Added!</p>
                                                <a
                                                    href={`https://seitrace.com/tx/${txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-green-400/70 underline truncate block"
                                                >
                                                    View on SeiTrace →
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Pre-configured Pool Info Badge - shown when clicking Add LP on existing pool */}
                                {isPoolPreConfigured && (
                                    <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="flex -space-x-2">
                                                    {tokenA?.logoURI && (
                                                        <img src={tokenA.logoURI} alt="" className="w-8 h-8 rounded-full border-2 border-[#0d0d14]" />
                                                    )}
                                                    {tokenB?.logoURI && (
                                                        <img src={tokenB.logoURI} alt="" className="w-8 h-8 rounded-full border-2 border-[#0d0d14]" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-semibold">{tokenA?.symbol}/{tokenB?.symbol}</div>
                                                    <div className="text-xs text-gray-400">
                                                        {poolType === 'cl' ? (
                                                            <>Concentrated • {tickSpacing === 1 ? '0.009%' : tickSpacing === 10 ? '0.045%' : tickSpacing === 80 ? '0.25%' : '1%'} fee</>
                                                        ) : (
                                                            <>{stable ? 'Stable' : 'Volatile'} V2 Pool</>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${poolType === 'cl' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
                                                {poolType === 'cl' ? '⚡ CL' : '💧 V2'}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Pool Type Selection - only show when creating new pool */}
                                {!isPoolPreConfigured && (
                                    <div>
                                        <label className="text-sm text-gray-400 mb-3 block font-medium">Pool Type</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setPoolType('v2')}
                                                className={`p-4 rounded-xl text-center transition-all active:scale-[0.98] ${poolType === 'v2'
                                                    ? 'bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/50 shadow-lg shadow-primary/10'
                                                    : 'bg-white/5 border border-white/10 hover:bg-white/8'
                                                    }`}
                                            >
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                                                    <span className="text-2xl">💧</span>
                                                </div>
                                                <div className="font-semibold mb-1">Classic V2</div>
                                                <div className="text-xs text-gray-400">Simple 50/50</div>
                                            </button>
                                            <button
                                                onClick={() => setPoolType('cl')}
                                                className={`p-4 rounded-xl text-center transition-all active:scale-[0.98] ${poolType === 'cl'
                                                    ? 'bg-gradient-to-br from-secondary/20 to-cyan-500/10 border-2 border-secondary/50 shadow-lg shadow-secondary/10'
                                                    : 'bg-white/5 border border-white/10 hover:bg-white/8'
                                                    }`}
                                            >
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
                                                    <span className="text-2xl">⚡</span>
                                                </div>
                                                <div className="font-semibold mb-1">Concentrated</div>
                                                <div className="text-xs text-gray-400">Higher yields</div>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* V2 Stable/Volatile Toggle - only show when creating new V2 pool */}
                                {poolType === 'v2' && !isPoolPreConfigured && (
                                    <div>
                                        <label className="text-sm text-gray-400 mb-3 block font-medium">Pool Curve</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setStable(false)}
                                                className={`py-4 px-4 rounded-xl text-center font-medium transition-all active:scale-[0.98] ${!stable
                                                    ? 'bg-primary/15 border-2 border-primary/40 text-white'
                                                    : 'bg-white/5 border border-white/10 hover:bg-white/8 text-gray-300'
                                                    }`}
                                            >
                                                <span className="block text-lg mb-1">📈</span>
                                                Volatile
                                            </button>
                                            <button
                                                onClick={() => setStable(true)}
                                                className={`py-4 px-4 rounded-xl text-center font-medium transition-all active:scale-[0.98] ${stable
                                                    ? 'bg-primary/15 border-2 border-primary/40 text-white'
                                                    : 'bg-white/5 border border-white/10 hover:bg-white/8 text-gray-300'
                                                    }`}
                                            >
                                                <span className="block text-lg mb-1">💎</span>
                                                Stable
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* CL Fee Tier - only show when creating new CL pool */}
                                {poolType === 'cl' && !isPoolPreConfigured && (
                                    <div>
                                        <label className="text-sm text-gray-400 mb-3 block font-medium">Fee Tier</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {[
                                                { spacing: 1, fee: '0.009%', label: 'Lowest', best: 'Stables' },
                                                { spacing: 10, fee: '0.045%', label: 'Low', best: 'Most pairs' },
                                                { spacing: 80, fee: '0.25%', label: 'Medium', best: 'Popular' },
                                                { spacing: 2000, fee: '1%', label: 'High', best: 'Exotic' },
                                            ].map(({ spacing, fee, label, best }) => (
                                                <button
                                                    key={spacing}
                                                    onClick={() => setTickSpacing(spacing)}
                                                    className={`p-3 sm:p-2 rounded-xl text-center transition-all active:scale-[0.98] ${tickSpacing === spacing
                                                        ? 'bg-secondary/15 border-2 border-secondary/40 text-white'
                                                        : 'bg-white/5 border border-white/10 hover:bg-white/8'
                                                        }`}
                                                >
                                                    <div className="text-base sm:text-sm font-bold">{fee}</div>
                                                    <div className="text-xs text-gray-400 mt-1 hidden sm:block">{best}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* CL Price Range */}
                                {poolType === 'cl' && (
                                    <div className="space-y-4">
                                        {/* Current Price Display or Initial Price Input */}
                                        <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                            {poolExists ? (
                                                <div className="text-center">
                                                    <div className="text-xs text-gray-400 mb-2 flex items-center justify-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                                                        Current Pool Price
                                                    </div>
                                                    <div className="text-xl sm:text-2xl font-bold">
                                                        {tokenA && tokenB && currentPrice ? (
                                                            <>
                                                                <span className="text-gray-400 text-base font-normal">1 {tokenA.symbol} = </span>
                                                                <span className="text-primary">{currentPrice.toFixed(4)}</span>
                                                                <span className="text-gray-400 text-base font-normal"> {tokenB.symbol}</span>
                                                            </>
                                                        ) : 'Select tokens'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-yellow-400 text-lg">⚠️</span>
                                                        <span className="text-sm text-yellow-400 font-medium">New Pool - Set Initial Price</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                                                        <span className="text-gray-400 text-sm whitespace-nowrap">1 {tokenA?.symbol || '?'} =</span>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={initialPrice}
                                                            onChange={(e) => setInitialPrice(e.target.value)}
                                                            placeholder="0.0"
                                                            className="flex-1 min-w-0 bg-transparent text-xl font-bold text-center outline-none placeholder-gray-600"
                                                        />
                                                        <span className="text-gray-400 text-sm whitespace-nowrap">{tokenB?.symbol || '?'}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Preset Range Buttons - scrollable on mobile */}
                                        <div>
                                            <div className="text-xs text-gray-400 mb-2 font-medium">Quick Range</div>
                                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                                                <button
                                                    onClick={() => { setPriceLower(''); setPriceUpper(''); }}
                                                    className={`flex-shrink-0 py-3 px-4 text-sm rounded-xl transition-all font-medium active:scale-[0.98] ${!priceLower && !priceUpper
                                                        ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                                                        : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10'}`}
                                                >
                                                    Full Range
                                                </button>
                                                {[5, 10, 25, 50].map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => setPresetRange(p)}
                                                        disabled={!currentPrice}
                                                        className={`flex-shrink-0 py-3 px-4 text-sm rounded-xl transition-all font-medium active:scale-[0.98] ${currentPrice
                                                            ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                                            : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
                                                    >
                                                        ±{p}%
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Min/Max Price Inputs */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/5 to-orange-500/5 border border-red-500/20">
                                                <div className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
                                                    <span>↓</span> Min Price
                                                </div>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={priceLower}
                                                    onChange={(e) => setPriceLower(e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-transparent text-xl sm:text-2xl font-bold text-center outline-none placeholder-gray-600"
                                                />
                                                <div className="text-xs text-gray-500 text-center mt-1">
                                                    {tokenB?.symbol || 'B'}/{tokenA?.symbol || 'A'}
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/5 to-emerald-500/5 border border-green-500/20">
                                                <div className="text-xs text-green-400 font-medium mb-2 flex items-center gap-1">
                                                    <span>↑</span> Max Price
                                                </div>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={priceUpper}
                                                    onChange={(e) => setPriceUpper(e.target.value)}
                                                    placeholder="∞"
                                                    className="w-full bg-transparent text-xl sm:text-2xl font-bold text-center outline-none placeholder-gray-600"
                                                />
                                                <div className="text-xs text-gray-500 text-center mt-1">
                                                    {tokenB?.symbol || 'B'}/{tokenA?.symbol || 'A'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Token Inputs Section */}
                                <div className="space-y-3">
                                    {/* Token A */}
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm text-gray-400 font-medium">You Deposit</label>
                                            <button
                                                onClick={() => balanceA && setAmountA(balanceA)}
                                                className="text-xs text-gray-400 hover:text-primary transition-colors"
                                            >
                                                Balance: <span className="font-medium">{balanceA ? parseFloat(balanceA).toFixed(4) : '--'}</span>
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={amountA}
                                                onChange={(e) => setAmountA(e.target.value)}
                                                placeholder="0.0"
                                                className="flex-1 min-w-0 bg-transparent text-2xl sm:text-3xl font-bold outline-none placeholder-gray-600"
                                            />
                                            <button
                                                onClick={() => setSelectorOpen('A')}
                                                className="flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-4 bg-white/10 hover:bg-white/15 rounded-xl transition-colors flex-shrink-0"
                                            >
                                                {tokenA && tokenA.logoURI && (
                                                    <img src={tokenA.logoURI} alt="" className="w-6 h-6 rounded-full" />
                                                )}
                                                <span className="font-semibold">{tokenA?.symbol || 'Select'}</span>
                                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Plus Divider */}
                                    <div className="flex justify-center -my-1.5 relative z-10">
                                        <div className="w-10 h-10 rounded-xl bg-[#1a1a24] border border-white/10 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Token B */}
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm text-gray-400 font-medium">
                                                {poolType === 'cl' ? 'Auto-calculated' : 'You Deposit'}
                                            </label>
                                            <button
                                                onClick={() => balanceB && poolType !== 'cl' && setAmountB(balanceB)}
                                                className="text-xs text-gray-400 hover:text-primary transition-colors"
                                            >
                                                Balance: <span className="font-medium">{balanceB ? parseFloat(balanceB).toFixed(4) : '--'}</span>
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={amountB}
                                                onChange={(e) => poolType !== 'cl' && setAmountB(e.target.value)}
                                                readOnly={poolType === 'cl'}
                                                placeholder={poolType === 'cl' ? 'Enter amount above' : '0.0'}
                                                className={`flex-1 min-w-0 bg-transparent text-2xl sm:text-3xl font-bold outline-none placeholder-gray-600 ${poolType === 'cl' ? 'text-gray-400' : ''}`}
                                            />
                                            <button
                                                onClick={() => setSelectorOpen('B')}
                                                className="flex items-center gap-2 py-2 px-3 sm:py-2.5 sm:px-4 bg-white/10 hover:bg-white/15 rounded-xl transition-colors flex-shrink-0"
                                            >
                                                {tokenB && tokenB.logoURI && (
                                                    <img src={tokenB.logoURI} alt="" className="w-6 h-6 rounded-full" />
                                                )}
                                                <span className="font-semibold">{tokenB?.symbol || 'Select'}</span>
                                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Transaction Progress */}
                                {txProgress !== 'idle' && txProgress !== 'done' && (
                                    <div className={`p-4 rounded-xl ${txProgress === 'error' ? 'bg-red-500/10 border border-red-500/30' : 'bg-primary/10 border border-primary/30'}`}>
                                        <div className="flex items-center gap-3">
                                            {txProgress === 'error' ? (
                                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-red-400 text-lg">✕</span>
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-medium">
                                                    {txProgress === 'approving0' && 'Approving Token 1...'}
                                                    {txProgress === 'approving1' && 'Approving Token 2...'}
                                                    {txProgress === 'minting' && 'Creating Position...'}
                                                    {txProgress === 'error' && 'Transaction Failed'}
                                                </p>
                                                {txError && (
                                                    <p className="text-sm text-red-400 mt-1">{txError}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sticky Footer with Action Button */}
                            <div className={mobileStyles.footer}>
                                <motion.button
                                    onClick={poolType === 'cl' ? handleAddCLLiquidity : handleAddLiquidity}
                                    disabled={!canAdd || isLoading}
                                    className="w-full py-4 sm:py-5 rounded-xl font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
                                    whileTap={canAdd ? { scale: 0.98 } : {}}
                                >
                                    {isLoading ? (
                                        <span className="flex items-center justify-center gap-3">
                                            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Adding Liquidity...
                                        </span>
                                    ) : !isConnected ? (
                                        'Connect Wallet'
                                    ) : !tokenA || !tokenB ? (
                                        'Select Tokens'
                                    ) : !amountA || !amountB ? (
                                        'Enter Amounts'
                                    ) : (
                                        <>Add {poolType === 'cl' ? 'Concentrated' : 'V2'} Liquidity</>
                                    )}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Token Selector */}
            <TokenSelector
                isOpen={selectorOpen !== null}
                onClose={() => setSelectorOpen(null)}
                onSelect={(token) => {
                    if (selectorOpen === 'A') setTokenA(token);
                    else setTokenB(token);
                    setSelectorOpen(null);
                }}
                selectedToken={selectorOpen === 'A' ? tokenA : tokenB}
                excludeToken={selectorOpen === 'A' ? tokenB : tokenA}
            />
        </>
    );
}
