'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits, pad } from 'viem';
import { BRIDGE_TOKENS, BRIDGE_CHAINS, HYPERLANE_DOMAIN_IDS, WARP_ROUTE_ABI, ERC20_ABI, BridgeToken } from '@/config/bridge';

export type BridgeDirection = 'base-to-sei' | 'sei-to-base';

interface UseBridgeReturn {
    direction: BridgeDirection;
    setDirection: (dir: BridgeDirection) => void;
    selectedToken: BridgeToken;
    setSelectedToken: (token: BridgeToken) => void;
    availableTokens: BridgeToken[];
    sourceChain: typeof BRIDGE_CHAINS.base | typeof BRIDGE_CHAINS.sei;
    destChain: typeof BRIDGE_CHAINS.base | typeof BRIDGE_CHAINS.sei;
    balance: string;
    gasQuote: string;
    checkNeedsApproval: (amount: string) => boolean;
    isLoading: boolean;
    isApproving: boolean;
    isBridging: boolean;
    error: string | null;
    txHash: string | null;
    approve: (amount: string) => Promise<void>;
    bridge: (amount: string) => Promise<void>;
    refetch: () => Promise<void>;
}

export function useBridge(): UseBridgeReturn {
    const { address, chainId } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { switchChain } = useSwitchChain();

    const [direction, setDirection] = useState<BridgeDirection>('base-to-sei');
    const [selectedToken, setSelectedToken] = useState<BridgeToken>(BRIDGE_TOKENS[0]);
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

    // Get token addresses based on direction
    const getTokenAddresses = useCallback(() => {
        if (direction === 'base-to-sei') {
            return {
                collateral: selectedToken.base.collateral,
                warpRoute: selectedToken.base.warpRoute,
            };
        } else {
            return {
                collateral: selectedToken.sei.synthetic, // Burning synthetic on Sei
                warpRoute: selectedToken.sei.warpRoute,
            };
        }
    }, [direction, selectedToken]);

    // Only needs approval on Base (collateral), not on Sei (burn from self)
    const needsApprovalCheck = direction === 'base-to-sei';

    const fetchData = useCallback(async () => {
        if (!address) return;
        setIsLoading(true);
        setError(null);

        try {
            const { createPublicClient, http } = await import('viem');
            const { base, sei } = await import('viem/chains');

            const sourceClient = createPublicClient({
                chain: direction === 'base-to-sei' ? base : sei,
                transport: http(sourceChain.rpcUrl),
            });

            const { collateral, warpRoute } = getTokenAddresses();

            // Get balance
            const balanceResult = await sourceClient.readContract({
                address: collateral as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [address],
            }) as bigint;
            setBalance(formatUnits(balanceResult, selectedToken.decimals));

            // Get gas quote
            const gasQuoteResult = await sourceClient.readContract({
                address: warpRoute as `0x${string}`,
                abi: WARP_ROUTE_ABI,
                functionName: 'quoteGasPayment',
                args: [destDomainId],
            }) as bigint;
            setGasQuote(formatUnits(gasQuoteResult, 18));

            // Get allowance (only for Base)
            if (needsApprovalCheck) {
                const allowanceResult = await sourceClient.readContract({
                    address: collateral as `0x${string}`,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [address, warpRoute as `0x${string}`],
                }) as bigint;
                setAllowance(allowanceResult);
            } else {
                setAllowance(BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'));
            }
        } catch (err) {
            console.error('Error fetching bridge data:', err);
            setError('Failed to fetch data');
        } finally {
            setIsLoading(false);
        }
    }, [address, direction, sourceChain, destDomainId, selectedToken, getTokenAddresses, needsApprovalCheck]);

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

    const approve = useCallback(async (amount: string) => {
        if (!walletClient || !address) return;

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
            const { collateral, warpRoute } = getTokenAddresses();
            const amountWei = parseUnits(amount, selectedToken.decimals);

            const hash = await walletClient.writeContract({
                chain: sourceClientChain,
                address: collateral as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [
                    warpRoute as `0x${string}`,
                    amountWei,
                ],
            });

            const sourceClient = createPublicClient({
                chain: sourceClientChain,
                transport: http(sourceChain.rpcUrl),
            });
            await sourceClient.waitForTransactionReceipt({ hash });

            await fetchData();
        } catch (err: unknown) {
            console.error('Approval error:', err);
            setError(err instanceof Error ? err.message : 'Approval failed');
        } finally {
            setIsApproving(false);
        }
    }, [walletClient, address, chainId, sourceChain, direction, switchChain, fetchData, getTokenAddresses, selectedToken.decimals]);

    const bridge = useCallback(async (amount: string) => {
        if (!walletClient || !address) return;

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
            const { warpRoute } = getTokenAddresses();
            const amountWei = parseUnits(amount, selectedToken.decimals);
            const gasQuoteWei = parseUnits(gasQuote, 18);

            const recipientBytes32 = pad(address, { size: 32 });

            const hash = await walletClient.writeContract({
                chain: sourceClientChain,
                address: warpRoute as `0x${string}`,
                abi: WARP_ROUTE_ABI,
                functionName: 'transferRemote',
                args: [destDomainId, recipientBytes32, amountWei],
                value: gasQuoteWei,
            });

            setTxHash(hash);

            const sourceClient = createPublicClient({
                chain: sourceClientChain,
                transport: http(sourceChain.rpcUrl),
            });
            await sourceClient.waitForTransactionReceipt({ hash });

            await fetchData();
        } catch (err: unknown) {
            console.error('Bridge error:', err);
            setError(err instanceof Error ? err.message : 'Bridge failed');
        } finally {
            setIsBridging(false);
        }
    }, [walletClient, address, chainId, sourceChain, destDomainId, gasQuote, direction, switchChain, fetchData, getTokenAddresses, selectedToken.decimals]);

    const checkNeedsApproval = useCallback((amount: string) => {
        if (!needsApprovalCheck) return false;
        try {
            const amountWei = parseUnits(amount || '0', selectedToken.decimals);
            return amountWei > BigInt(0) && allowance < amountWei;
        } catch {
            return false;
        }
    }, [needsApprovalCheck, selectedToken.decimals, allowance]);

    return {
        direction,
        setDirection,
        selectedToken,
        setSelectedToken,
        availableTokens: BRIDGE_TOKENS,
        sourceChain,
        destChain,
        balance,
        gasQuote,
        checkNeedsApproval,
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
