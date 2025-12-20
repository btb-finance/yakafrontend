// Script to fetch all gauges from pool factories and Voter contract
const VOTER_ADDRESS = '0xe0Ec2B044fCFABF673df4c21C15Ac90fEa2A1d99';
const V2_POOL_FACTORY = '0x16D9D5a7E268bD079e67221fda6C5A6719669F8f';
const CL_POOL_FACTORY = '0x0aeEAf8d3bb4a9466e6AC8985F5173ddB42Ec081';
const RPC_URL = 'https://evm-rpc.sei-apis.com';

// Known tokens for lookup
const KNOWN_TOKENS = {
    '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7': { symbol: 'WSEI', decimals: 18 },
    '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392': { symbol: 'USDC', decimals: 6 },
    '0x188e342cdedd8fdf84d765eb59b7433d30f5484d': { symbol: 'WIND', decimals: 18 },
    '0x0000000000000000000000000000000000000000': { symbol: 'SEI', decimals: 18 },
    '0xb75d0b03c06a926e488e2659df1a861f860bd3d1': { symbol: 'USDT', decimals: 6 },
    '0x0555e30da8f98308edb960aa94c0db47230d2b9c': { symbol: 'WBTC', decimals: 8 },
    '0x9151434b16b9763660705744891fa906f660ecc5': { symbol: 'USDT', decimals: 6 },
    '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1': { symbol: 'USDC.n', decimals: 6 },
    '0x0a526e425809aea71eb279d24ae22dee6c92a4fe': { symbol: 'DRG', decimals: 18 },
    '0x95597eb8d227a7c4b4f5e807a815c5178ee6dbe1': { symbol: 'MILLI', decimals: 6 },
    '0x58e11d8ed38a2061361e90916540c5c32281a380': { symbol: 'GGC', decimals: 18 },
    '0xc18b6a15fb0ceaf5eb18696eefcb5bc7b9107149': { symbol: 'POPO', decimals: 18 },
    '0xf9bdbf259ece5ae17e29bf92eb7abd7b8b465db9': { symbol: 'Frog', decimals: 18 },
    '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598': { symbol: 'SEIYAN', decimals: 6 },
    '0xdf3d7dd2848f491645974215474c566e79f2e538': { symbol: 'S8N', decimals: 18 },
    '0xf63980e3818607c0797e994cfd34c1c592968469': { symbol: 'SUPERSEIZ', decimals: 18 },
    '0x443ac9f358226f5f48f2cd10bc0121e7a6176323': { symbol: 'BAT', decimals: 18 },
    '0x888888b7ae1b196e4dfd25c992c9ad13358f0e24': { symbol: 'YKP', decimals: 18 },
    '0x888d81e3ea5e8362b5f69188cbcf34fa8da4b888': { symbol: 'LARRY', decimals: 18 },
    '0x160345fc359604fc6e70e3c5facbde5f7a9342d8': { symbol: 'WETH', decimals: 18 },
};

async function rpcCall(to, data) {
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to, data }, 'latest'],
            id: 1
        })
    });
    const result = await response.json();
    return result.result || '0x';
}

async function batchRpcCall(calls) {
    const batch = calls.map((call, i) => ({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: call.to, data: call.data }, 'latest'],
        id: i + 1
    }));

    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
    });

    const results = await response.json();
    return Array.isArray(results)
        ? results.sort((a, b) => a.id - b.id).map(r => r.result || '0x')
        : [results.result || '0x'];
}

function getSymbol(addr) {
    const info = KNOWN_TOKENS[addr.toLowerCase()];
    return info ? info.symbol : 'UNKNOWN';
}

async function main() {
    console.log('Fetching pools from factories...');

    // Get pool counts
    const v2CountHex = await rpcCall(V2_POOL_FACTORY, '0xefde4e64'); // allPoolsLength()
    const clCountHex = await rpcCall(CL_POOL_FACTORY, '0xefde4e64'); // allPoolsLength()

    const v2Count = parseInt(v2CountHex, 16) || 0;
    const clCount = parseInt(clCountHex, 16) || 0;

    console.log(`Found ${v2Count} V2 pools, ${clCount} CL pools`);

    // Get all pool addresses
    const addressCalls = [];
    for (let i = 0; i < v2Count; i++) {
        addressCalls.push({
            to: V2_POOL_FACTORY,
            data: `0x41d1de97${i.toString(16).padStart(64, '0')}` // allPools(uint256)
        });
    }
    for (let i = 0; i < clCount; i++) {
        addressCalls.push({
            to: CL_POOL_FACTORY,
            data: `0x41d1de97${i.toString(16).padStart(64, '0')}` // allPools(uint256)
        });
    }

    const addressResults = await batchRpcCall(addressCalls);
    const v2Pools = addressResults.slice(0, v2Count).map(r => `0x${r.slice(-40)}`);
    const clPools = addressResults.slice(v2Count).map(r => `0x${r.slice(-40)}`);

    const allPools = [
        ...v2Pools.map(p => ({ addr: p, type: 'V2' })),
        ...clPools.map(p => ({ addr: p, type: 'CL' }))
    ];

    console.log(`Total pools: ${allPools.length}`);

    // For each pool, check if it has a gauge
    const gauges = [];

    for (const pool of allPools) {
        const poolPadded = pool.addr.slice(2).padStart(64, '0');

        // Get gauge, token0, token1
        const [gaugeHex, token0Hex, token1Hex] = await batchRpcCall([
            { to: VOTER_ADDRESS, data: `0xb9a09fd5${poolPadded}` }, // gauges(pool)
            { to: pool.addr, data: '0x0dfe1681' }, // token0()
            { to: pool.addr, data: '0xd21220a7' }, // token1()
        ]);

        const gauge = `0x${gaugeHex.slice(-40)}`;

        // Skip pools without gauges
        if (gauge === '0x0000000000000000000000000000000000000000') continue;

        const token0 = `0x${token0Hex.slice(-40)}`;
        const token1 = `0x${token1Hex.slice(-40)}`;
        const symbol0 = getSymbol(token0);
        const symbol1 = getSymbol(token1);

        // Check isAlive
        const gaugePadded = gauge.slice(2).padStart(64, '0');
        const isAliveHex = await rpcCall(VOTER_ADDRESS, `0x1703e5f9${gaugePadded}`);
        const isAlive = isAliveHex !== '0x' && isAliveHex !== '0x0' &&
            isAliveHex !== '0x0000000000000000000000000000000000000000000000000000000000000000';

        gauges.push({
            pool: pool.addr,
            gauge,
            token0,
            token1,
            symbol0,
            symbol1,
            type: pool.type,
            isAlive
        });

        console.log(`${symbol0}/${symbol1} (${pool.type}) - Gauge: ${gauge.slice(0, 10)}... - ${isAlive ? 'Active' : 'Inactive'}`);
    }

    console.log('\n\n// =====================================');
    console.log('// Copy this to src/config/gauges.ts');
    console.log('// =====================================\n');

    console.log(`// Generated at ${new Date().toISOString()}`);
    console.log(`// Total gauges: ${gauges.length}\n`);
    console.log('export interface GaugeConfig {');
    console.log('  pool: string;');
    console.log('  gauge: string;');
    console.log('  token0: string;');
    console.log('  token1: string;');
    console.log('  symbol0: string;');
    console.log('  symbol1: string;');
    console.log('  type: \'V2\' | \'CL\';');
    console.log('  isAlive: boolean;');
    console.log('}\n');
    console.log('export const GAUGE_LIST: GaugeConfig[] = [');
    for (const g of gauges) {
        console.log(`  {`);
        console.log(`    pool: '${g.pool}',`);
        console.log(`    gauge: '${g.gauge}',`);
        console.log(`    token0: '${g.token0}',`);
        console.log(`    token1: '${g.token1}',`);
        console.log(`    symbol0: '${g.symbol0}',`);
        console.log(`    symbol1: '${g.symbol1}',`);
        console.log(`    type: '${g.type}',`);
        console.log(`    isAlive: ${g.isAlive},`);
        console.log(`  },`);
    }
    console.log('];');
}

main().catch(console.error);
