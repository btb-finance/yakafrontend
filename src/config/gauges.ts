// Generated at 2025-12-23
// Total CL pools: 14 from CLFactory 0xA0E081764Ed601074C1B370eb117413145F5e8Cc
// Note: None of these pools have gauges yet - gauges need to be created separately

export interface GaugeConfig {
    pool: string;
    gauge: string;
    token0: string;
    token1: string;
    symbol0: string;
    symbol1: string;
    type: 'V2' | 'CL';
    tickSpacing?: number;
    isAlive: boolean;
}

export const GAUGE_LIST: GaugeConfig[] = [
    {
        pool: '0x587b82b8ed109D8587a58f9476a8d4268Ae945B1',
        gauge: '', // No gauge created yet
        token0: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'USDC',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x3C2567b15FD9133Cf9101E043C58e2B444aF900b',
        gauge: '', // No gauge created yet
        token0: '0x9151434b16b9763660705744891fA906F660EcC5',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'USDT',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 50,
        isAlive: true,
    },
    {
        pool: '0xa37a4eF4DA4Ff2D52591c0BC1fc691e5A7AbA84D',
        gauge: '', // No gauge created yet
        token0: '0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'SEIYAN',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x0aeb4016e61987c48F63e9e03Df79f0f0b54eb5c',
        gauge: '', // No gauge created yet
        token0: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'USDC.n',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 50,
        isAlive: true,
    },
    {
        pool: '0xf7096967560799237D2Dd3C9d44921AAD1e6075f',
        gauge: '', // No gauge created yet
        token0: '0x0a526e425809aEA71eb279d24ae22Dee6C92A4Fe',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'DRG',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x1C97a574b5bBDcbc70A0223e8e6DBBb0479c0570',
        gauge: '', // No gauge created yet
        token0: '0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'WETH',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0xe61E2285b0357CA5dB6aaA32730b67104D706577',
        gauge: '', // No gauge created yet
        token0: '0x95597EB8D227a7c4B4f5E807a815C5178eE6dBE1',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'MILLI',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x1ce594847170251ac141c8b3A083719d3D4E16D2',
        gauge: '', // No gauge created yet
        token0: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        token1: '0xF9BDbF259eCe5ae17e29BF92EB7ABd7B8b465Db9',
        symbol0: 'USDC',
        symbol1: 'Frog',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x32DdABD3564eBf1A645b3B781Fc3024828864d55',
        gauge: '', // No gauge created yet
        token0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'WBTC',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x576fc1F102c6Bb3F0A2bc87fF01fB652b883dFe0',
        gauge: '', // No gauge created yet
        token0: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'WIND',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
    {
        pool: '0xc7035A2Ef7C685Fc853475744623A0F164541b69',
        gauge: '', // No gauge created yet
        token0: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'WIND',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
    {
        pool: '0x5F1EBd6f602D4F1B2563d7Ad9e83f84882c70295',
        gauge: '', // No gauge created yet
        token0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
        token1: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        symbol0: 'WBTC',
        symbol1: 'WIND',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
    {
        pool: '0x16722405Bb17412B84C1ad9280D41bcED322FcAB',
        gauge: '', // No gauge created yet
        token0: '0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8',
        token1: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        symbol0: 'WETH',
        symbol1: 'WIND',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x56F3Eb077bE328660Dbc29C61568Baf50489bD3a',
        gauge: '', // No gauge created yet
        token0: '0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598',
        token1: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        symbol0: 'SEIYAN',
        symbol1: 'WIND',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
];
