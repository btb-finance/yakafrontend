'use client';

import { useAccount, useBalance, useReadContract } from 'wagmi';
import { formatUnits, Address } from 'viem';
import { ERC20_ABI } from '@/config/abis';
import { Token } from '@/config/tokens';

export function useTokenBalance(token: Token | undefined) {
    const { address } = useAccount();

    // For native SEI
    const { data: nativeBalance, refetch: refetchNative } = useBalance({
        address: address,
        query: {
            enabled: !!address && !!token?.isNative,
        },
    });

    // For ERC20 tokens
    const { data: tokenBalance, refetch: refetchToken } = useReadContract({
        address: token?.address as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address && !!token && !token.isNative,
        },
    });

    const balance = token?.isNative
        ? nativeBalance ? formatUnits(nativeBalance.value, nativeBalance.decimals) : undefined
        : tokenBalance
            ? formatUnits(tokenBalance as bigint, token?.decimals || 18)
            : undefined;

    const refetch = () => {
        if (token?.isNative) {
            refetchNative();
        } else {
            refetchToken();
        }
    };

    return {
        balance,
        raw: balance || '0', // Full precision for MAX button
        formatted: balance ? parseFloat(balance).toFixed(4) : '--',
        refetch,
    };
}

export function useTokenAllowance(
    token: Token | undefined,
    spender: Address | undefined
) {
    const { address } = useAccount();

    const { data: allowance, refetch } = useReadContract({
        address: token?.address as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: address && spender ? [address, spender] : undefined,
        query: {
            enabled: !!address && !!token && !!spender && !token.isNative,
        },
    });

    return {
        allowance: allowance as bigint | undefined,
        refetch,
    };
}
