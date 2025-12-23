// Centralized RPC configuration for Sei network
// Multiple RPC endpoints for load balancing and redundancy

export const RPC_ENDPOINTS = {
    // Primary RPC with API key (high rate limit)
    primary: 'https://evm-rpc.sei-apis.com/?x-apikey=f9e3e8c8',
    // Secondary RPC (no rate limit, good for batch calls)
    secondary: 'https://sei-evm-rpc.stakeme.pro',
    // Fallback
    fallback: 'https://evm-rpc.sei-apis.com',
};

// Track which RPC to use next (round-robin)
let rpcIndex = 0;
const rpcList = [RPC_ENDPOINTS.primary, RPC_ENDPOINTS.secondary];

/**
 * Get the next RPC URL in round-robin fashion
 */
export function getNextRpc(): string {
    const rpc = rpcList[rpcIndex % rpcList.length];
    rpcIndex++;
    return rpc;
}

/**
 * Get primary RPC (for important calls that need reliability)
 */
export function getPrimaryRpc(): string {
    return RPC_ENDPOINTS.primary;
}

/**
 * Get secondary RPC (for batch/heavy calls to avoid rate limits)
 */
export function getSecondaryRpc(): string {
    return RPC_ENDPOINTS.secondary;
}

/**
 * Make an RPC call with automatic fallback
 */
export async function rpcCall<T = any>(
    method: string,
    params: any[],
    preferredRpc?: string
): Promise<T> {
    const endpoints = preferredRpc
        ? [preferredRpc, ...rpcList.filter(r => r !== preferredRpc)]
        : [getNextRpc(), ...rpcList];

    let lastError: Error | null = null;

    for (const rpc of endpoints) {
        try {
            const response = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method,
                    params,
                    id: 1,
                }),
            });

            const result = await response.json();
            if (result.error) {
                throw new Error(result.error.message || 'RPC error');
            }
            return result.result;
        } catch (err) {
            lastError = err as Error;
            continue;
        }
    }

    throw lastError || new Error('All RPC endpoints failed');
}

/**
 * Make batch RPC calls with automatic fallback
 */
export async function batchRpcCall(
    calls: Array<{ method: string; params: any[] }>,
    preferredRpc?: string
): Promise<any[]> {
    const rpc = preferredRpc || getSecondaryRpc(); // Use secondary for batch by default

    try {
        const response = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                calls.map((call, i) => ({
                    jsonrpc: '2.0',
                    method: call.method,
                    params: call.params,
                    id: i + 1,
                }))
            ),
        });

        const results = await response.json();
        if (Array.isArray(results)) {
            return results.map(r => r.result);
        }
        return [results.result];
    } catch (err) {
        // Fallback to primary RPC
        if (rpc !== RPC_ENDPOINTS.primary) {
            return batchRpcCall(calls, RPC_ENDPOINTS.primary);
        }
        throw err;
    }
}

/**
 * Simple eth_call helper with fallback
 */
export async function ethCall(to: string, data: string): Promise<string> {
    return rpcCall<string>('eth_call', [{ to, data }, 'latest']);
}
