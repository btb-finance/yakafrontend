'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { formatUnits, Address } from 'viem';
import { useAccount } from 'wagmi';
import { DEFAULT_TOKEN_LIST, Token } from '@/config/tokens';
import { getPrimaryRpc } from '@/utils/rpc';

// ============================================
// Types
// ============================================
interface TokenBalance {
    token: Token;
    balance: bigint;
    formatted: string;
}

interface UserBalanceContextType {
    balances: Map<string, TokenBalance>;
    getBalance: (address: string) => TokenBalance | undefined;
    sortedTokens: Token[]; // Tokens sorted by balance (highest first)
    isLoading: boolean;
    refetch: () => void;
}

const UserBalanceContext = createContext<UserBalanceContextType | undefined>(undefined);

// ============================================
// Batch RPC Helper
// ============================================
async function batchRpcCall(calls: { to: string; data: string }[]): Promise<string[]> {
    if (calls.length === 0) return [];

    const batch = calls.map((call, i) => ({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: call.to, data: call.data }, 'latest'],
        id: i + 1
    }));

    const response = await fetch(getPrimaryRpc(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
    });

    const results = await response.json();
    return Array.isArray(results)
        ? results.sort((a: any, b: any) => a.id - b.id).map((r: any) => r.result || '0x')
        : [results.result || '0x'];
}

// ============================================
// Provider Component
// ============================================
export function UserBalanceProvider({ children }: { children: ReactNode }) {
    const { address, isConnected } = useAccount();
    const [balances, setBalances] = useState<Map<string, TokenBalance>>(new Map());
    const [sortedTokens, setSortedTokens] = useState<Token[]>(DEFAULT_TOKEN_LIST);
    const [isLoading, setIsLoading] = useState(false);

    const fetchBalances = useCallback(async () => {
        if (!address || !isConnected) {
            setBalances(new Map());
            setSortedTokens(DEFAULT_TOKEN_LIST);
            return;
        }

        setIsLoading(true);
        try {
            const addressPadded = address.slice(2).toLowerCase().padStart(64, '0');

            // Get native SEI balance
            const nativeBalanceRes = await fetch(getPrimaryRpc(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                    id: 1
                })
            });
            const nativeData = await nativeBalanceRes.json();
            const nativeBalance = nativeData.result ? BigInt(nativeData.result) : BigInt(0);

            // Fetch balances for all ERC20 tokens
            const erc20Tokens = DEFAULT_TOKEN_LIST.filter(t => !t.isNative);
            const balanceCalls = erc20Tokens.map(token => ({
                to: token.address,
                data: `0x70a08231${addressPadded}` // balanceOf(address)
            }));

            const balanceResults = await batchRpcCall(balanceCalls);

            // Build balance map
            const newBalances = new Map<string, TokenBalance>();

            // Add native SEI balance
            const seiToken = DEFAULT_TOKEN_LIST.find(t => t.isNative);
            if (seiToken) {
                newBalances.set(seiToken.address.toLowerCase(), {
                    token: seiToken,
                    balance: nativeBalance,
                    formatted: formatUnits(nativeBalance, seiToken.decimals),
                });
            }

            // Add ERC20 balances
            erc20Tokens.forEach((token, i) => {
                const balance = balanceResults[i] !== '0x' && balanceResults[i].length > 2
                    ? BigInt(balanceResults[i])
                    : BigInt(0);
                newBalances.set(token.address.toLowerCase(), {
                    token,
                    balance,
                    formatted: formatUnits(balance, token.decimals),
                });
            });

            setBalances(newBalances);

            // Sort tokens: those with balance first, then alphabetically
            const sorted = [...DEFAULT_TOKEN_LIST].sort((a, b) => {
                const balA = newBalances.get(a.address.toLowerCase())?.balance || BigInt(0);
                const balB = newBalances.get(b.address.toLowerCase())?.balance || BigInt(0);

                if (balA > BigInt(0) && balB === BigInt(0)) return -1;
                if (balB > BigInt(0) && balA === BigInt(0)) return 1;
                if (balA > BigInt(0) && balB > BigInt(0)) {
                    // Both have balance - sort by relative value (higher first)
                    return balB > balA ? 1 : -1;
                }
                return 0; // Keep original order for tokens without balance
            });

            setSortedTokens(sorted);
        } catch (err) {
            console.error('[UserBalanceProvider] Error fetching balances:', err);
        }
        setIsLoading(false);
    }, [address, isConnected]);

    // Fetch on wallet connect/change
    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    // Auto-refresh every 15s when connected
    useEffect(() => {
        if (!isConnected) return;
        const interval = setInterval(fetchBalances, 15000);
        return () => clearInterval(interval);
    }, [isConnected, fetchBalances]);

    const getBalance = useCallback((tokenAddress: string) => {
        return balances.get(tokenAddress.toLowerCase());
    }, [balances]);

    const value: UserBalanceContextType = {
        balances,
        getBalance,
        sortedTokens,
        isLoading,
        refetch: fetchBalances,
    };

    return (
        <UserBalanceContext.Provider value={value}>
            {children}
        </UserBalanceContext.Provider>
    );
}

// ============================================
// Hook
// ============================================
export function useUserBalances() {
    const context = useContext(UserBalanceContext);
    if (!context) {
        throw new Error('useUserBalances must be used within UserBalanceProvider');
    }
    return context;
}
