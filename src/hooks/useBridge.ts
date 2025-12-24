'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits, pad } from 'viem';
import { BRIDGE_CHAINS, HYPERLANE_DOMAIN_IDS, WARP_ROUTE_ABI, ERC20_ABI } from '@/config/bridge';

export type BridgeDirection = 'base-to-sei' | 'sei-to-base';

interface UseBridgeReturn {
    direction: BridgeDirection;
    setDirection: (dir: BridgeDirection) => void;
    sourceChain: typeof BRIDGE_CHAINS.base | typeof BRIDGE_CHAINS.sei;
    destChain: typeof BRIDGE_CHAINS.base | typeof BRIDGE_CHAINS.sei;
    balance: string;
    gasQuote: string;
    needsApproval: boolean;
    isLoading: boolean;
    isApproving: boolean;
    isBridging: boolean;
    error: string | null;
    txHash: string | null;
    approve: () => Promise<void>;
    bridge: (amount: string) => Promise<void>;
    refetch: () => Promise<void>;
}

export function useBridge(): UseBridgeReturn {
    const { address, chainId } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { switchChain } = useSwitchChain();

    const [direction, setDirection] = useState<BridgeDirection>('base-to-sei');
    const [balance, setBalance] = useState('0');
    const [gasQuote, setGasQuote] = useState('0');
    const [allowance, setAllowance] = useState(BigInt(0));
    const [isLoading, setIsLoading] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isBridging, setIsBridging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    const sourceChain = direction === 'base-to-sei' ? BRIDGE_CHAINS.base : BRIDGE_CHAINS.sei;
    const destChain = direction === 'base-to-sei' ? BRIDGE_CHAINS.sei : BRIDGE_CHAINS.base;
    const destDomainId = direction === 'base-to-sei' ? HYPERLANE_DOMAIN_IDS.sei : HYPERLANE_DOMAIN_IDS.base;

    // Only needs approval on Base (collateral), not on Sei (burn from self)
    const needsApproval = direction === 'base-to-sei';

    const fetchData = useCallback(async () => {
        if (!address) return;
        setIsLoading(true);
        setError(null);

        try {
            // Fetch balance from source chain
            const { createPublicClient, http } = await import('viem');
            const { base, sei } = await import('viem/chains');

            const sourceClient = createPublicClient({
                chain: direction === 'base-to-sei' ? base : sei,
                transport: http(sourceChain.rpcUrl),
            });

            // Get balance
            const balanceResult = await sourceClient.readContract({
                address: sourceChain.cbBTC as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [address],
            }) as bigint;
            setBalance(formatUnits(balanceResult, 8));

            // Get gas quote
            const gasQuoteResult = await sourceClient.readContract({
                address: sourceChain.warpRoute as `0x${string}`,
                abi: WARP_ROUTE_ABI,
                functionName: 'quoteGasPayment',
                args: [destDomainId],
            }) as bigint;
            setGasQuote(formatUnits(gasQuoteResult, 18));

            // Get allowance (only for Base)
            if (direction === 'base-to-sei') {
                const allowanceResult = await sourceClient.readContract({
                    address: sourceChain.cbBTC as `0x${string}`,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [address, sourceChain.warpRoute as `0x${string}`],
                }) as bigint;
                setAllowance(allowanceResult);
            }
        } catch (err) {
            console.error('Error fetching bridge data:', err);
            setError('Failed to fetch data');
        } finally {
            setIsLoading(false);
        }
    }, [address, direction, sourceChain, destDomainId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-switch chain when direction changes
    useEffect(() => {
        const doSwitch = async () => {
            if (chainId && chainId !== sourceChain.chainId && switchChain) {
                try {
                    await switchChain({ chainId: sourceChain.chainId });
                } catch (e) {
                    console.error('Auto chain switch failed:', e);
                }
            }
        };
        doSwitch();
    }, [direction, sourceChain.chainId, chainId, switchChain]);

    const approve = useCallback(async () => {
        if (!walletClient || !address) return;

        // Check if on correct chain - prompt switch if needed
        if (chainId !== sourceChain.chainId) {
            try {
                await switchChain({ chainId: sourceChain.chainId });
            } catch (e) {
                console.error('Chain switch failed:', e);
            }
            return;
        }

        setIsApproving(true);
        setError(null);

        try {
            const { createPublicClient, http } = await import('viem');
            const { base, sei } = await import('viem/chains');

            const sourceClientChain = direction === 'base-to-sei' ? base : sei;

            const hash = await walletClient.writeContract({
                chain: sourceClientChain,
                address: sourceChain.cbBTC as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [
                    sourceChain.warpRoute as `0x${string}`,
                    BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
                ],
            });

            // Wait for confirmation using source chain client
            const sourceClient = createPublicClient({
                chain: sourceClientChain,
                transport: http(sourceChain.rpcUrl),
            });
            await sourceClient.waitForTransactionReceipt({ hash });

            // Refetch allowance
            await fetchData();
        } catch (err: unknown) {
            console.error('Approval error:', err);
            setError(err instanceof Error ? err.message : 'Approval failed');
        } finally {
            setIsApproving(false);
        }
    }, [walletClient, address, chainId, sourceChain, direction, switchChain, fetchData]);

    const bridge = useCallback(async (amount: string) => {
        if (!walletClient || !address) return;

        // Check if on correct chain - prompt switch if needed
        if (chainId !== sourceChain.chainId) {
            try {
                await switchChain({ chainId: sourceChain.chainId });
            } catch (e) {
                console.error('Chain switch failed:', e);
            }
            return;
        }

        setIsBridging(true);
        setError(null);
        setTxHash(null);

        try {
            const { createPublicClient, http } = await import('viem');
            const { base, sei } = await import('viem/chains');

            const sourceClientChain = direction === 'base-to-sei' ? base : sei;
            const amountWei = parseUnits(amount, 8);
            const gasQuoteWei = parseUnits(gasQuote, 18);

            // Convert address to bytes32
            const recipientBytes32 = pad(address, { size: 32 });

            const hash = await walletClient.writeContract({
                chain: sourceClientChain,
                address: sourceChain.warpRoute as `0x${string}`,
                abi: WARP_ROUTE_ABI,
                functionName: 'transferRemote',
                args: [destDomainId, recipientBytes32, amountWei],
                value: gasQuoteWei,
            });

            setTxHash(hash);

            // Wait for confirmation using source chain client
            const sourceClient = createPublicClient({
                chain: sourceClientChain,
                transport: http(sourceChain.rpcUrl),
            });
            await sourceClient.waitForTransactionReceipt({ hash });

            // Refetch balance
            await fetchData();
        } catch (err: unknown) {
            console.error('Bridge error:', err);
            setError(err instanceof Error ? err.message : 'Bridge failed');
        } finally {
            setIsBridging(false);
        }
    }, [walletClient, address, chainId, sourceChain, destDomainId, gasQuote, direction, switchChain, fetchData]);

    const hasEnoughAllowance = (amount: string) => {
        if (!needsApproval) return true;
        try {
            const amountWei = parseUnits(amount || '0', 8);
            return allowance >= amountWei;
        } catch {
            return false;
        }
    };

    return {
        direction,
        setDirection,
        sourceChain,
        destChain,
        balance,
        gasQuote,
        needsApproval: needsApproval && !hasEnoughAllowance(balance),
        isLoading,
        isApproving,
        isBridging,
        error,
        txHash,
        approve,
        bridge,
        refetch: fetchData,
    };
}
