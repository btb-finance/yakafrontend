// Wind Swap Contract Addresses - Sei Mainnet
// All contracts verified on SeiScan

// ============================================
// V2 Core Contracts
// ============================================
export const V2_CONTRACTS = {
    // Protocol Token (WIND)
    WIND: '0x188E342cdEDd8FdF84D765Eb59B7433D30F5484D',
    YAKA: '0x188E342cdEDd8FdF84D765Eb59B7433D30F5484D', // Legacy alias

    // Core Voting Escrow
    VotingEscrow: '0xE0d5DCB4D4Afc0f9Ab930616F4f18990ee17519b',

    // Router for V2 swaps and liquidity
    Router: '0x7D208C039e4dD152B4bb2570908E10D5193737f7',

    // Voter for gauge voting
    Voter: '0xe0Ec2B044fCFABF673df4c21C15Ac90fEa2A1d99',

    // Token minter
    Minter: '0xD761233979b7523172656007b7718C8c4BB8329e',

    // V2 Pool Factory
    PoolFactory: '0x16D9D5a7E268bD079e67221fda6C5A6719669F8f',

    // Pool implementation
    Pool: '0x1Ea24b7b6387520A73c23217995A73C1e4fbda46',

    // Rewards distributor for veNFT rebases
    RewardsDistributor: '0x74114c7F375F76CfB9Cff2a8B2EF6A9af23Be380',

    // Factory registry
    FactoryRegistry: '0xa403CA20e2D69Be9B160f134294563BCe03acDA9',

    // Gauge Factory
    GaugeFactory: '0xe831eF0378229258691dcD271288B7c18EEFc009',

    // Voting Rewards Factory
    VotingRewardsFactory: '0x3e7039B47a0b80370442324311eD9f13013eb928',

    // Managed Rewards Factory
    ManagedRewardsFactory: '0xdb75aa8Fa45D6443E9431e3161C7D028733E1341',

    // VeArt Proxy for NFT art
    VeArtProxy: '0x273dFfA4321575D443f988CEd423e275564D3627',

    // Airdrop Distributor
    AirdropDistributor: '0x4783060c04121a2953e5A04245F1D377ED744066',

    // Forwarder
    Forwarder: '0x9658272eea9E243Fa5b072fEAaA1CaDe29fa80dF',

    // Governance
    ProtocolGovernor: '0x68182459aBfFa6C0f8afC33A689801159BCA85EA',
    EpochGovernor: '0x6f988ECdca8b87c482D09301D6Ee2002Ce7009B9',
} as const;

// ============================================
// V2 Libraries
// ============================================
export const V2_LIBRARIES = {
    PerlinNoise: '0x23774e759f7C757a484E23C98ac8b9bcB620B4Cd',
    Trig: '0xE9b96ECE82A102de5fcA3E049F18a1714D2b2BE1',
    BalanceLogicLibrary: '0x15cc58F057a6683c94a98e394788AD09d7A943f4',
    DelegationLogicLibrary: '0x38bf0E610319072875aF751285077E074caDbD25',
} as const;

// ============================================
// Slipstream (Concentrated Liquidity) Contracts
// ============================================
export const CL_CONTRACTS = {
    // CL Factory for creating pools
    CLFactory: '0x0aeEAf8d3bb4a9466e6AC8985F5173ddB42Ec081',

    // CL Pool implementation
    CLPool: '0x1f595d057f11ae1a3637b1f36883FB04038b50e6',

    // CL Gauge Factory
    CLGaugeFactory: '0xEaAB66dC4DAcd6925033930753A850D6f50a7204',

    // CL Gauge implementation
    CLGauge: '0xBE796C4176d24ba9645C199D081dB6AB0f1002A4',

    // Swap Router for CL swaps
    SwapRouter: '0xDc77ecB025C7478469dAc8E6facB8cf5806B9277',

    // NFT Position Manager for CL positions
    NonfungiblePositionManager: '0x7850B615a1F0E26734c13EF936022241B28C7AAA',

    // Token Position Descriptor (NFT metadata)
    NonfungibleTokenPositionDescriptor: '0x9e4DF2287C14C4D621AEB37A12B0CA98883E8ECa',

    // Quoter for getting swap quotes
    QuoterV2: '0xEC98E8bFaA9375E2D588042F045aD028BaDC43CB',

    // Mixed Route Quoter (supports V2 + CL routes)
    MixedRouteQuoterV1: '0x476faE73abA86E6e300234235BD56Bd94913ce07',

    // Sugar Helper for data aggregation
    SugarHelper: '0x0447C16fFB1DC5826840A8A8EA830B5ac284f59f',

    // Custom Swap Fee Module
    CustomSwapFeeModule: '0x918D30a7F7E0A20708c2887f263f25cB6bAEdD03',

    // Custom Unstaked Fee Module
    CustomUnstakedFeeModule: '0x1a783c295Dd59383BcF657f2c57Ef85895bec117',

    // NFT Descriptor Library
    NFTDescriptor: '0x435A9BE1a4E1492Ad9055A3e580747E72219386D',

    // NFT SVG Library
    NFTSVG: '0x97C0a6ba35146E58D3d9d05b5e5B046a62531632',
} as const;

// ============================================
// Common Addresses
// ============================================
export const COMMON = {
    // Wrapped SEI
    WSEI: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',

    // Zero address
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
} as const;

// ============================================
// All Contracts Combined (for easy access)
// ============================================
export const ALL_CONTRACTS = {
    ...V2_CONTRACTS,
    ...V2_LIBRARIES,
    ...CL_CONTRACTS,
    ...COMMON,
} as const;
