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
import { getPrimaryRpc } from '@/utils/rpc';

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
    const [tickSpacing, setTickSpacing] = useState(initialPool?.tickSpacing || 200);
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

    // Auto-detect stablecoin pairs and set appropriate tick spacing
    useEffect(() => {
        if (!isOpen || !tokenA || !tokenB || poolType !== 'cl') return;
        // If it's a pre-configured pool with tickSpacing already set, don't override
        if (initialPool?.tickSpacing) return;

        // List of stablecoin symbols
        const STABLES = ['USDC', 'USDT', 'USDC.n', 'DAI', 'FRAX', 'LUSD', 'BUSD'];
        const isAStable = STABLES.includes(tokenA.symbol.toUpperCase());
        const isBStable = STABLES.includes(tokenB.symbol.toUpperCase());

        // If both are stablecoins, use 0.02% (tick spacing 50)
        if (isAStable && isBStable) {
            setTickSpacing(50);
        } else {
            // Otherwise default to 0.25% (tick spacing 200)
            setTickSpacing(200);
        }
    }, [isOpen, tokenA, tokenB, poolType, initialPool]);

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
                // Step 1: Get pool address
                const getPoolSelector = '28af8d0b';
                const token0Padded = token0.address.slice(2).toLowerCase().padStart(64, '0');
                const token1Padded = token1.address.slice(2).toLowerCase().padStart(64, '0');
                const tickHex = tickSpacing.toString(16).padStart(64, '0');
                const getPoolData = `0x${getPoolSelector}${token0Padded}${token1Padded}${tickHex}`;

                const poolResponse = await fetch(getPrimaryRpc(), {
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

                // Step 2: Fetch slot0 for price - now immediately after getting pool address
                const slot0Selector = '3850c7bd';
                const slot0Response = await fetch(getPrimaryRpc(), {
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
                if (sqrtPriceX96 === BigInt(0)) {
                    // Pool exists but has no price set (not initialized)
                    setClPoolPrice(null);
                    return;
                }

                const Q96 = BigInt(2) ** BigInt(96);
                const priceRaw = Number(sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** token0.decimals)) / Number(Q96 * Q96 * BigInt(10 ** token1.decimals));
                const price = actualTokenA.address.toLowerCase() === token0.address.toLowerCase()
                    ? priceRaw
                    : 1 / priceRaw;

                setClPoolPrice(price);

                // Auto-set default range to ±10% when pool price loads
                if (!priceLower && !priceUpper) {
                    setPriceLower((price * 0.9).toFixed(6));
                    setPriceUpper((price * 1.1).toFixed(6));
                }
            } catch (err) {
                console.error('Error fetching CL pool price:', err);
                setClPoolPrice(null);
                setClPoolAddress(null);
            }
        };

        fetchPoolPrice();
    }, [tokenA, tokenB, tickSpacing, poolType]);

    // Determine if range is one-sided based on current price
    const currentPrice = clPoolPrice ?? (initialPrice ? parseFloat(initialPrice) : null);
    const pLower = priceLower ? parseFloat(priceLower) : 0;
    const pUpper = priceUpper ? parseFloat(priceUpper) : Infinity;

    // For single-sided LP, determine which side
    const isRangeAboveCurrent = currentPrice !== null && pLower > 0 && currentPrice <= pLower;
    const isRangeBelowCurrent = currentPrice !== null && pUpper > 0 && pUpper !== Infinity && currentPrice >= pUpper;
    const isSingleSided = isRangeAboveCurrent || isRangeBelowCurrent;

    // Determine which token is token0 and token1 (for correct single-sided logic)
    const actualTokenA = tokenA?.isNative ? WSEI : tokenA;
    const actualTokenB = tokenB?.isNative ? WSEI : tokenB;
    const isAToken0 = actualTokenA && actualTokenB ?
        actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase() : true;

    // CORRECT Uniswap V3 CL Math:
    // When range is ABOVE current (current tick < tickLower): deposit token0 ONLY
    // When range is BELOW current (current tick > tickUpper): deposit token1 ONLY
    // In UI terms:
    // - if A is token0 and range is above: deposit A (token0), B should be 0
    // - if A is token0 and range is below: deposit B (token1), A should be 0
    // - if A is token1 and range is above: deposit B (token0), A should be 0
    // - if A is token1 and range is below: deposit A (token1), B should be 0
    const depositTokenAForOneSided = (isRangeAboveCurrent && isAToken0) || (isRangeBelowCurrent && !isAToken0);
    const depositTokenBForOneSided = (isRangeAboveCurrent && !isAToken0) || (isRangeBelowCurrent && isAToken0);

    // Auto-calculate Token B amount for CL (when user enters Token A)
    useEffect(() => {
        if (poolType !== 'cl' || !currentPrice || !amountA || parseFloat(amountA) <= 0) {
            return;
        }

        // If this is an "Above Current" single-sided position where we should deposit B
        // then A should be auto-set to 0, not the other way around
        if (isRangeAboveCurrent) {
            // Don't auto-calc B from A when A should be 0
            // Instead, if user entered A, clear it and let them know to use B
            return;
        }

        if (pLower <= 0 && pUpper === Infinity) {
            const amtA = parseFloat(amountA);
            const amtB = amtA * currentPrice;
            setAmountB(amtB.toFixed(6));
            return;
        }

        if (pLower <= 0 || pUpper <= 0 || pLower >= pUpper) {
            return;
        }

        const sqrtPriceLower = Math.sqrt(pLower);
        const sqrtPriceUpper = Math.sqrt(pUpper);
        const sqrtPriceCurrent = Math.sqrt(currentPrice);
        const amtA = parseFloat(amountA);

        if (isRangeBelowCurrent) {
            // Range is below current - only deposit token0 (A if A is token0, B if A is token1)
            // If A is token0, B should be 0
            if (isAToken0) {
                setAmountB('0');
            }
        } else {
            // Normal range (contains current price)
            const L = amtA * (sqrtPriceCurrent * sqrtPriceUpper) / (sqrtPriceUpper - sqrtPriceCurrent);
            const amtB = L * (sqrtPriceCurrent - sqrtPriceLower);
            setAmountB(amtB.toFixed(6));
        }
    }, [poolType, clPoolPrice, initialPrice, amountA, priceLower, priceUpper, isAToken0, isRangeAboveCurrent, isRangeBelowCurrent]);

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
        // Prevent multiple submissions
        if (txProgress !== 'idle' && txProgress !== 'done' && txProgress !== 'error') {
            console.log('Transaction already in progress, skipping');
            return;
        }

        if (!tokenA || !tokenB || !address) {
            return;
        }

        // For CL single-sided LP, one amount can be 0 or empty
        const amtA = parseFloat(amountA || '0');
        const amtB = parseFloat(amountB || '0');

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

        // Set state to block re-entry
        setTxProgress('approving0');
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
                const poolResult = await fetch(getPrimaryRpc(), {
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
                const result = await fetch(getPrimaryRpc(), {
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

    // Check if we're in the middle of a CL transaction
    const isCLInProgress = txProgress !== 'idle' && txProgress !== 'done' && txProgress !== 'error';

    const canAdd = isConnected &&
        tokenA &&
        tokenB &&
        (poolType === 'cl'
            ? (parseFloat(amountA || '0') > 0 || parseFloat(amountB || '0') > 0) // CL allows single-sided
            : (amountA && parseFloat(amountA) > 0 && parseFloat(amountB || '0') > 0)) && // V2 needs both
        !isCLInProgress;

    const poolExists = clPoolPrice !== null;

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

                                {/* Pool Info + Price - combined single row */}
                                {isPoolPreConfigured && (
                                    <div className="p-2 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="flex -space-x-1 flex-shrink-0">
                                                    {tokenA?.logoURI && (
                                                        <img src={tokenA.logoURI} alt="" className="w-5 h-5 rounded-full border border-[#0d0d14]" />
                                                    )}
                                                    {tokenB?.logoURI && (
                                                        <img src={tokenB.logoURI} alt="" className="w-5 h-5 rounded-full border border-[#0d0d14]" />
                                                    )}
                                                </div>
                                                <span className="font-semibold text-xs truncate">{tokenA?.symbol}/{tokenB?.symbol}</span>
                                                <span className="text-[10px] text-gray-400 flex-shrink-0">
                                                    {poolType === 'cl' ? ({ 1: '0.005%', 10: '0.05%', 50: '0.02%', 80: '0.30%', 100: '0.045%', 200: '0.25%', 2000: '1%' }[tickSpacing] || `${tickSpacing}ts`) : (stable ? 'S' : 'V')}
                                                </span>
                                            </div>
                                            {poolType === 'cl' && clPoolPrice && (
                                                <div className="text-[10px] text-gray-400 flex-shrink-0">
                                                    <span className="text-green-400">●</span> 1={clPoolPrice.toFixed(4)}
                                                </div>
                                            )}
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
                                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                            {[
                                                { spacing: 1, fee: '0.005%', best: 'Stables' },
                                                { spacing: 50, fee: '0.02%', best: 'Correlated' },
                                                { spacing: 100, fee: '0.045%', best: 'Standard' },
                                                { spacing: 200, fee: '0.25%', best: 'Medium' },
                                                { spacing: 2000, fee: '1%', best: 'Exotic' },
                                            ].map(({ spacing, fee, best }) => (
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
                                    <div className="space-y-3">
                                        {/* New Pool - Initial Price Input (only if no pool exists) */}
                                        {!poolExists && (
                                            <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-yellow-400 text-xs">⚠️ New Pool</span>
                                                    <div className="flex-1 flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1">
                                                        <span className="text-gray-400 text-xs">1 {tokenA?.symbol} =</span>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={initialPrice}
                                                            onChange={(e) => setInitialPrice(e.target.value)}
                                                            placeholder="0.0"
                                                            className="flex-1 min-w-0 bg-transparent text-sm font-bold text-center outline-none placeholder-gray-600"
                                                        />
                                                        <span className="text-gray-400 text-xs">{tokenB?.symbol}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Range Strategy Selection - Compact */}
                                        <div>
                                            <div className="text-xs text-gray-400 mb-2 font-medium">Range</div>
                                            {(() => {
                                                // Calculate current range percentage
                                                const rangePercent = currentPrice && priceLower && priceUpper
                                                    ? Math.round(((parseFloat(priceUpper) - currentPrice) / currentPrice) * 100)
                                                    : null;
                                                const isFullRange = !priceLower && !priceUpper;

                                                // Stablecoin pools use tickSpacing 1 (0.005%) or 50 (0.02%)
                                                const isStablecoinPool = tickSpacing === 1 || tickSpacing === 50;

                                                // Different presets based on pool type
                                                const presets = isStablecoinPool
                                                    ? [0.5, 1, 2] // Tight ranges for stablecoins
                                                    : [2, 10, 50]; // Wider ranges for volatile

                                                return (
                                                    <div className="grid grid-cols-4 gap-1.5">
                                                        <button
                                                            onClick={() => { setPriceLower(''); setPriceUpper(''); }}
                                                            className={`py-2 px-1 rounded-lg text-center transition-all active:scale-[0.98] ${isFullRange
                                                                ? 'bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/50'
                                                                : 'bg-white/5 hover:bg-white/10 border border-white/10'}`}
                                                        >
                                                            <div className="text-xs font-bold">Full</div>
                                                        </button>
                                                        {presets.map(pct => {
                                                            const isActive = rangePercent !== null && Math.abs(rangePercent - pct) < 0.5;
                                                            return (
                                                                <button
                                                                    key={pct}
                                                                    onClick={() => setPresetRange(pct)}
                                                                    disabled={!currentPrice}
                                                                    className={`py-2 px-1 rounded-lg text-center transition-all active:scale-[0.98] ${isActive
                                                                        ? 'bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/50'
                                                                        : currentPrice
                                                                            ? 'bg-white/5 hover:bg-white/10 border border-white/10'
                                                                            : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
                                                                >
                                                                    <div className="text-xs font-bold">±{pct}%</div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}

                                            {/* Single-Sided LP Presets */}
                                            {currentPrice && tokenA && tokenB && (() => {
                                                // Determine sorted token order for correct labeling
                                                const actualTokenA = tokenA.isNative ? WSEI : tokenA;
                                                const actualTokenB = tokenB.isNative ? WSEI : tokenB;
                                                const isAToken0 = actualTokenA.address.toLowerCase() < actualTokenB.address.toLowerCase();
                                                // CORRECT Uniswap V3 CL Math:
                                                // When range is ABOVE current: deposit token0 (lower sorted address)
                                                // When range is BELOW current: deposit token1 (higher sorted address)
                                                const aboveToken = isAToken0 ? tokenA : tokenB; // token0
                                                const belowToken = isAToken0 ? tokenB : tokenA; // token1

                                                return (
                                                    <div className="mt-3">
                                                        <div className="text-[10px] text-gray-500 mb-1.5 flex items-center gap-1">
                                                            <span>🎯</span> One-Sided LP (Advanced)
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    // Set range above current price - only deposit token0
                                                                    const lower = currentPrice * 1.0045; // +0.45% from current
                                                                    const upper = currentPrice * 1.10;  // +10% from current
                                                                    setPriceLower(lower.toFixed(6));
                                                                    setPriceUpper(upper.toFixed(6));
                                                                    // Clear amounts - Above means deposit token0 (aboveToken)
                                                                    if (isAToken0) {
                                                                        // A is token0, deposit A
                                                                        setAmountA('');
                                                                        setAmountB('0');
                                                                    } else {
                                                                        // B is token0, deposit B
                                                                        setAmountA('0');
                                                                        setAmountB('');
                                                                    }
                                                                }}
                                                                className="py-2.5 px-2 rounded-lg text-center transition-all active:scale-[0.98] bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 hover:border-green-500/50"
                                                            >
                                                                <div className="text-xs font-bold text-green-400">↑ Above Current</div>
                                                                <div className="text-[9px] text-gray-500 mt-0.5">Only {aboveToken.symbol}</div>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    // Set range below current price - only deposit token1
                                                                    const lower = currentPrice * 0.90;  // -10% from current
                                                                    const upper = currentPrice * 0.9955; // -0.45% from current
                                                                    setPriceLower(lower.toFixed(6));
                                                                    setPriceUpper(upper.toFixed(6));
                                                                    // Clear amounts - Below means deposit token1 (belowToken)
                                                                    if (isAToken0) {
                                                                        // A is token0, B is token1, deposit B
                                                                        setAmountA('0');
                                                                        setAmountB('');
                                                                    } else {
                                                                        // B is token0, A is token1, deposit A
                                                                        setAmountA('');
                                                                        setAmountB('0');
                                                                    }
                                                                }}
                                                                className="py-2.5 px-2 rounded-lg text-center transition-all active:scale-[0.98] bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/30 hover:border-red-500/50"
                                                            >
                                                                <div className="text-xs font-bold text-red-400">↓ Below Current</div>
                                                                <div className="text-[9px] text-gray-500 mt-0.5">Only {belowToken.symbol}</div>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Visual Price Range Display with Draggable Slider */}
                                        {(priceLower || priceUpper) && currentPrice && (
                                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-xs text-gray-400 font-medium">Your Range</span>
                                                    <span className="text-xs text-primary">
                                                        {priceLower && priceUpper ?
                                                            `±${(((parseFloat(priceUpper) - currentPrice) / currentPrice) * 100).toFixed(0)}%`
                                                            : 'Custom'}
                                                    </span>
                                                </div>

                                                {/* Draggable Range Slider */}
                                                <div className="relative h-10 mb-4">
                                                    {/* Track background */}
                                                    <div className="absolute top-1/2 left-0 right-0 h-2 bg-white/10 rounded-full -translate-y-1/2" />

                                                    {/* Active range (colored part) */}
                                                    {(() => {
                                                        const lower = parseFloat(priceLower || '0');
                                                        const upper = parseFloat(priceUpper || String(currentPrice * 2));
                                                        const minRange = currentPrice * 0.1;
                                                        const maxRange = currentPrice * 3;
                                                        const leftPercent = Math.max(0, Math.min(100, ((lower - minRange) / (maxRange - minRange)) * 100));
                                                        const rightPercent = Math.max(0, Math.min(100, ((upper - minRange) / (maxRange - minRange)) * 100));
                                                        return (
                                                            <div
                                                                className="absolute top-1/2 h-2 bg-gradient-to-r from-primary via-green-400 to-secondary rounded-full -translate-y-1/2"
                                                                style={{ left: `${leftPercent}%`, right: `${100 - rightPercent}%` }}
                                                            />
                                                        );
                                                    })()}

                                                    {/* Current price marker */}
                                                    {(() => {
                                                        const minRange = currentPrice * 0.1;
                                                        const maxRange = currentPrice * 3;
                                                        const currentPercent = Math.max(0, Math.min(100, ((currentPrice - minRange) / (maxRange - minRange)) * 100));
                                                        return (
                                                            <div
                                                                className="absolute top-1/2 w-1 h-4 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10"
                                                                style={{ left: `${currentPercent}%` }}
                                                            >
                                                                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-gray-400 whitespace-nowrap">
                                                                    Current
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Lower bound thumb (draggable) */}
                                                    <input
                                                        type="range"
                                                        min={currentPrice * 0.1}
                                                        max={currentPrice * 3}
                                                        step={currentPrice * 0.01}
                                                        value={parseFloat(priceLower || String(currentPrice * 0.5))}
                                                        onChange={(e) => setPriceLower(parseFloat(e.target.value).toFixed(6))}
                                                        className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-red-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-grab z-20"
                                                    />

                                                    {/* Upper bound thumb (draggable) */}
                                                    <input
                                                        type="range"
                                                        min={currentPrice * 0.1}
                                                        max={currentPrice * 3}
                                                        step={currentPrice * 0.01}
                                                        value={parseFloat(priceUpper || String(currentPrice * 1.5))}
                                                        onChange={(e) => setPriceUpper(parseFloat(e.target.value).toFixed(6))}
                                                        className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-grab z-20"
                                                    />
                                                </div>

                                                {/* Min/Max with +/- buttons and percentage */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="text-center">
                                                        <div className="flex items-center justify-center gap-2 mb-1">
                                                            <span className="text-xs text-red-400">Min Price</span>
                                                            {priceLower && currentPrice && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                                                                    {(((parseFloat(priceLower) - currentPrice) / currentPrice) * 100).toFixed(1)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => setPriceLower((parseFloat(priceLower || '0') * 0.95).toFixed(6))}
                                                                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
                                                            >−</button>
                                                            <span className="font-bold text-lg min-w-[80px]">
                                                                {priceLower ? parseFloat(priceLower).toFixed(4) : '0'}
                                                            </span>
                                                            <button
                                                                onClick={() => setPriceLower((parseFloat(priceLower || '0') * 1.05).toFixed(6))}
                                                                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
                                                            >+</button>
                                                        </div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="flex items-center justify-center gap-2 mb-1">
                                                            <span className="text-xs text-green-400">Max Price</span>
                                                            {priceUpper && currentPrice && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                                                                    +{(((parseFloat(priceUpper) - currentPrice) / currentPrice) * 100).toFixed(1)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => setPriceUpper((parseFloat(priceUpper || '999999') * 0.95).toFixed(6))}
                                                                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
                                                            >−</button>
                                                            <span className="font-bold text-lg min-w-[80px]">
                                                                {priceUpper ? parseFloat(priceUpper).toFixed(4) : '∞'}
                                                            </span>
                                                            <button
                                                                onClick={() => setPriceUpper((parseFloat(priceUpper || '1') * 1.05).toFixed(6))}
                                                                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
                                                            >+</button>
                                                        </div>
                                                    </div>
                                                </div>

                                            </div>
                                        )}

                                    </div>
                                )}

                                <div className="space-y-0.5">
                                    {/* Token A */}
                                    <div className={`p-3 rounded-lg border ${depositTokenAForOneSided ? 'bg-green-500/5 border-green-500/30' : depositTokenBForOneSided ? 'bg-white/5 border-white/10' : 'bg-white/5 border-white/10'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs text-gray-400">
                                                {depositTokenAForOneSided ? (
                                                    <span className="text-green-400">✓ You Deposit</span>
                                                ) : depositTokenBForOneSided ? (
                                                    <span className="text-gray-500">Not needed (0)</span>
                                                ) : 'You Deposit'}
                                            </label>
                                            <span className="text-[10px] text-gray-400">
                                                Bal: {balanceA ? parseFloat(balanceA).toFixed(4) : '--'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={amountA}
                                                onChange={(e) => !depositTokenBForOneSided && setAmountA(e.target.value)}
                                                readOnly={depositTokenBForOneSided}
                                                placeholder={depositTokenBForOneSided ? '0' : '0.0'}
                                                className={`flex-1 min-w-0 bg-transparent text-xl font-bold outline-none placeholder-gray-600 ${depositTokenBForOneSided ? 'text-gray-400' : ''}`}
                                            />
                                            <button
                                                onClick={() => setSelectorOpen('A')}
                                                className="flex items-center gap-1.5 py-1.5 px-2 bg-white/10 hover:bg-white/15 rounded-lg transition-colors flex-shrink-0"
                                            >
                                                {tokenA && tokenA.logoURI && (
                                                    <img src={tokenA.logoURI} alt="" className="w-5 h-5 rounded-full" />
                                                )}
                                                <span className="font-semibold text-sm">{tokenA?.symbol || 'Select'}</span>
                                            </button>
                                        </div>
                                        {/* Quick percentage buttons - only show when it's the deposit token */}
                                        {balanceA && parseFloat(balanceA) > 0 && !depositTokenBForOneSided && (
                                            <div className="flex gap-1 mt-2">
                                                {[25, 50, 75, 100].map(pct => (
                                                    <button
                                                        key={pct}
                                                        onClick={() => setAmountA((parseFloat(balanceA) * pct / 100).toFixed(6))}
                                                        className="flex-1 py-1 text-[10px] font-medium rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                    >
                                                        {pct === 100 ? 'MAX' : `${pct}%`}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>



                                    {/* Token B */}
                                    <div className={`p-3 rounded-lg border ${depositTokenBForOneSided ? 'bg-green-500/5 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs text-gray-400">
                                                {depositTokenBForOneSided ? (
                                                    <span className="text-green-400">✓ You Deposit</span>
                                                ) : poolType === 'cl' ? (
                                                    depositTokenAForOneSided ? <span className="text-gray-500">Not needed (0)</span> : 'Auto-calc'
                                                ) : 'You Deposit'}
                                            </label>
                                            <button
                                                onClick={() => balanceB && (poolType !== 'cl' || depositTokenBForOneSided) && setAmountB(balanceB)}
                                                className="text-[10px] text-gray-400 hover:text-primary transition-colors"
                                            >
                                                Bal: {balanceB ? parseFloat(balanceB).toFixed(4) : '--'}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={amountB}
                                                onChange={(e) => (poolType !== 'cl' || depositTokenBForOneSided) && setAmountB(e.target.value)}
                                                readOnly={poolType === 'cl' && !depositTokenBForOneSided}
                                                placeholder={poolType === 'cl' ? (depositTokenBForOneSided ? '0.0' : 'Auto') : '0.0'}
                                                className={`flex-1 min-w-0 bg-transparent text-xl font-bold outline-none placeholder-gray-600 ${poolType === 'cl' && !depositTokenBForOneSided ? 'text-gray-400' : ''}`}
                                            />
                                            <button
                                                onClick={() => setSelectorOpen('B')}
                                                className="flex items-center gap-1.5 py-1.5 px-2 bg-white/10 hover:bg-white/15 rounded-lg transition-colors flex-shrink-0"
                                            >
                                                {tokenB && tokenB.logoURI && (
                                                    <img src={tokenB.logoURI} alt="" className="w-5 h-5 rounded-full" />
                                                )}
                                                <span className="font-semibold text-sm">{tokenB?.symbol || 'Select'}</span>
                                            </button>
                                        </div>
                                        {/* Quick percentage buttons - only show when it's the deposit token */}
                                        {balanceB && parseFloat(balanceB) > 0 && depositTokenBForOneSided && (
                                            <div className="flex gap-1 mt-2">
                                                {[25, 50, 75, 100].map(pct => (
                                                    <button
                                                        key={pct}
                                                        onClick={() => setAmountB((parseFloat(balanceB) * pct / 100).toFixed(6))}
                                                        className="flex-1 py-1 text-[10px] font-medium rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                    >
                                                        {pct === 100 ? 'MAX' : `${pct}%`}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
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
                                    disabled={!canAdd || isLoading || isCLInProgress}
                                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-xl ${canAdd && !isLoading && !isCLInProgress
                                        ? 'bg-gradient-to-r from-primary via-purple-500 to-secondary text-white shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 active:scale-[0.98]'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                        }`}
                                    whileTap={canAdd ? { scale: 0.98 } : {}}
                                >
                                    {isLoading || isCLInProgress ? (
                                        <span className="flex items-center justify-center gap-3">
                                            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Adding Liquidity...
                                        </span>
                                    ) : !isConnected ? (
                                        '🔗 Connect Wallet'
                                    ) : !tokenA || !tokenB ? (
                                        'Select Tokens'
                                    ) : !amountA || (parseFloat(amountA) <= 0 && parseFloat(amountB || '0') <= 0) ? (
                                        'Enter Amount'
                                    ) : (
                                        <>✨ Add Liquidity</>
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
