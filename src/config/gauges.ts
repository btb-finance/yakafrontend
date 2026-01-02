// Generated at 2026-01-02
// Total CL pools with gauges: 22
// Gauge addresses fetched directly from Voter contract 0x4B7e64A935aEAc6f1837a57bdA329c797Fa2aD22

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
    // ============================================
    // STABLE PAIRS
    // ============================================
    {
        pool: '0x3C2567b15FD9133Cf9101E043C58e2B444aF900b',
        gauge: '0xd92D5d66D974Cd3E2F0ba1006fB8c08B1109bf1f',
        token0: '0x9151434b16b9763660705744891fA906F660EcC5',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'USDT',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 50,
        isAlive: true,
    },
    {
        pool: '0x0aeb4016e61987c48F63e9e03Df79f0f0b54eb5c',
        gauge: '', // No gauge created yet
        token0: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'USDC.n',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 50,
        isAlive: true,
    },

    // ============================================
    // WIND PAIRS
    // ============================================
    {
        pool: '0xc7035A2Ef7C685Fc853475744623A0F164541b69',
        gauge: '0x65e450a9E7735c3991b1495C772aeDb33A1A91Cb',
        token0: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'WIND',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
    {
        pool: '0x576fc1F102c6Bb3F0A2bc87fF01fB652b883dFe0',
        gauge: '0x44A21C019f32Edf0C906B93b6A81fC37443A9DA2',
        token0: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'WIND',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
    {
        pool: '0x5F1EBd6f602D4F1B2563d7Ad9e83f84882c70295',
        gauge: '0x295FB1e842fD461B567853696e6867454a614Af7',
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
        gauge: '0xB7c287C0D8BED22cF9741bB5234a91aA636b196B',
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
        gauge: '0x3E127eb9Fe0B020F584df79d41e95645ed5Be35a',
        token0: '0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598',
        token1: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        symbol0: 'SEIYAN',
        symbol1: 'WIND',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },
    {
        pool: '0x731925f20307ecc02151345da13a830837fbe04e',
        gauge: '0x129551500A6D6d4e5b257AB1cD90e88E84f23Fc8',
        token0: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
        token1: '0x95597EB8D227a7c4B4f5E807a815C5178eE6dBE1',
        symbol0: 'WIND',
        symbol1: 'MILLI',
        type: 'CL',
        tickSpacing: 2000,
        isAlive: true,
    },

    // ============================================
    // BTC PAIRS
    // ============================================
    {
        pool: '0x32DdABD3564eBf1A645b3B781Fc3024828864d55',
        gauge: '0x39c4F53D4E71a9f692bfb9d266284d7Fc30Fa601',
        token0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'WBTC',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0xAF96Ad614322c6fc93295a639431ff5fe28d0582',
        gauge: '0x542C8096e8873D443c57a1F4588F3690Ec138e00',
        token0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
        token1: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
        symbol0: 'WBTC',
        symbol1: 'cbBTC',
        type: 'CL',
        tickSpacing: 50,
        isAlive: true,
    },

    // ============================================
    // ETH PAIRS
    // ============================================
    {
        pool: '0x1C97a574b5bBDcbc70A0223e8e6DBBb0479c0570',
        gauge: '0x2C85A7A148Fee5D27F7344B5bf9B57313f6C6745',
        token0: '0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'WETH',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },

    // ============================================
    // SEI / OTHER PAIRS
    // ============================================
    {
        pool: '0xcA6cC7db1f659EfdB09d97bFcA2620caa7ae7C08',
        gauge: '0x81E042B2e1B7bd2705E276bBF81729Bc3EB26749',
        token0: '0xBc57Df70D982587F3134317b128e4C88ABE1C7A7',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'cbXRP',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x84AFF1293553A5c926507cdc338715891f300ca3',
        gauge: '0xc87F3A55C636eF34fCDd720D85674A0ab78dA6b4',
        token0: '0x8f7EF7758Db151450a3134d406Ad2D80F3D956f6',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'cbADA',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x14943d20cA81e488B978BFc06cD221260e128513',
        gauge: '0xb2DD415F89CA66e4409c03b530270375EdED79B4',
        token0: '0x1Ab9D96a351c56e408f5478AC664E76AE9B71B93',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'SOL',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x44bbA208B4CecF6d35a4aDc00a2521B29Fd08c2D',
        gauge: '0xE25EdB7ec68885a0F90d28D2451848cA80463C4d',
        token0: '0xB2E37Ecb157d41C114a0656979b4f2aFD9671263',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'LINK',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x653F1f36Ae5B8Ec61AD59e2f9a45ef04ff7876F5',
        gauge: '0x16fBfFd8f81733Be2f2566B06919e495576953a8',
        token0: '0x78465cffcc7335937d48cCd9A0Ad6bCe2dfDAfD1',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'uSUI',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x587b82b8ed109D8587a58f9476a8d4268Ae945B1',
        gauge: '0xC33fBA7DDd1dDaE4b986359515A9678275D408Ce',
        token0: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'USDC',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0xa37a4eF4DA4Ff2D52591c0BC1fc691e5A7AbA84D',
        gauge: '0x0360FdD6A507bf8a2bf3E4f7B9678C3C3FFD9e54',
        token0: '0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'SEIYAN',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0xf7096967560799237D2Dd3C9d44921AAD1e6075f',
        gauge: '0xd0e45c2774ADc1d7D7Dd726f61D13721c219cB78',
        token0: '0x0a526e425809aEA71eb279d24ae22Dee6C92A4Fe',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'DRG',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0xe61E2285b0357CA5dB6aaA32730b67104D706577',
        gauge: '0x123A617A5F9220B4Ca6C1b0fd34A9f735d2882fF',
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
        gauge: '', // No gauge - Frog token not whitelisted
        token0: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        token1: '0xF9BDbF259eCe5ae17e29BF92EB7ABd7B8b465Db9',
        symbol0: 'USDC',
        symbol1: 'Frog',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0x273B12F21b98bD4AA8a5F3B8308680AE4F33bccB',
        gauge: '0xa65efF6eb042A3A3DB7Ef80A44509A53C3357c58',
        token0: '0x962aae191622498bca205c1c1b73e59ac7d295f2',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'WILSON',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },
    {
        pool: '0xff12A64F6146C5C7928891f2399b5f5a704C871F',
        gauge: '0xd11207BC61D2091a5844E22c1672C556DFeB0d14',
        token0: '0xd581C49dA047d9c33DCEfA345de629c84DE28B12',
        token1: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
        symbol0: 'cbBTC',
        symbol1: 'WSEI',
        type: 'CL',
        tickSpacing: 200,
        isAlive: true,
    },

    // ============================================
    // COMMUNITY / MEME PAIRS
    // ============================================
    {
        pool: '0x40ba47cb4b4b1462f4db2f3552a79eb31b96a8ec',
        gauge: '0xc022e1638030C89CCd2e54814dde94Cc9b091D89',
        token0: '0x888d81e3ea5e8362b5f69188cbcf34fa8da4b888',
        token1: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
        symbol0: 'LARRY',
        symbol1: 'USDC',
        type: 'CL',
        tickSpacing: 1,
        isAlive: true,
    },
];
