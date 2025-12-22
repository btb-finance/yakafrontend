// Wind Swap Contract Addresses - Sei Mainnet
// All contracts verified on SeiScan

// ============================================
// V2 Core Contracts
// ============================================
export const V2_CONTRACTS = {
    // Protocol Token (WIND)
    WIND: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421',
    YAKA: '0x80B56cF09c18e642DC04d94b8AD25Bb5605c1421', // Legacy alias

    // Core Voting Escrow
    VotingEscrow: '0x9312A9702c3F0105246e12874c4A0EdC6aD07593',

    // Router for V2 swaps and liquidity
    Router: '0x5f401E565ed095eeC0EFAf1970E4B60ba5aa8995',

    // Voter for gauge voting
    Voter: '0x4B7e64A935aEAc6f1837a57bdA329c797Fa2aD22',

    // Token minter
    Minter: '0xD56369432BBb4F40143f8C930D96c83c10c68aEE',

    // V2 Pool Factory
    PoolFactory: '0xeE6476aa1B912f7c3Ab45b73990f26B840c42069',

    // Pool implementation
    Pool: '0x41B5fD249039e4ab492227dB014DDbA79c2a1B92',

    // Rewards distributor for veNFT rebases
    RewardsDistributor: '0x2ac111A4647708781f797F0a8794b0aEC43ED854',

    // Factory registry
    FactoryRegistry: '0x168df826C17d245187f74bD67008aE623e4496f9',

    // Gauge Factory
    GaugeFactory: '0x5137eF6b4FB51E482aafDFE4B82E2618f6DE499a',

    // Voting Rewards Factory
    VotingRewardsFactory: '0xD121d8f547F15ca30ECfC928D8313a6E49921f67',

    // Managed Rewards Factory
    ManagedRewardsFactory: '0x425b61141356F2Ae2d9710FD7fA6718f0D3De958',

    // VeArt Proxy for NFT art
    VeArtProxy: '0x7292f11B204D5B3fB0CC7D10E0C10a26540359D5',

    // Airdrop Distributor
    AirdropDistributor: '0x9726ec2930C452594f1FAccA5112a8B57790A5A4',

    // Forwarder
    Forwarder: '0x2EB4C1f3Dd12947dF49f5e7E399B4250d4640692',

    // Governance
    ProtocolGovernor: '0x70123139AAe07Ce9d7734E92Cd1D658d6d9Ce3d2',
    EpochGovernor: '0x8Fc6107ba0b72cd72ad840Ab0Bcce94b30262b44',
} as const;

// ============================================
// V2 Libraries
// ============================================
export const V2_LIBRARIES = {
    PerlinNoise: '0xa1FB21086A696CdBF40D20fbEF7F5b4fC5091398',
    Trig: '0x53A64478C875B521d4fc7A9AdA3f7269137f7F80',
    BalanceLogicLibrary: '0x7ae7DF0efA84607606e830Bbd9181327b7Cd77c4',
    DelegationLogicLibrary: '0x1b3A8866763f4144b5f574166573BfC5352A6812',
} as const;

// ============================================
// Slipstream (Concentrated Liquidity) Contracts
// ============================================
export const CL_CONTRACTS = {
    // CL Factory for creating pools
    CLFactory: '0xA0E081764Ed601074C1B370eb117413145F5e8Cc',

    // CL Pool implementation
    CLPool: '0x4aDA3B73188649D7af11eb00464E789220077800',

    // CL Gauge Factory
    CLGaugeFactory: '0xbb24DA8eDAD6324a6f58485702588eFF08b3Cd64',

    // CL Gauge implementation
    CLGauge: '0xb24D93B3f9C48E05879B1Be77e88489950E16982',

    // Swap Router for CL swaps
    SwapRouter: '0x960cDB8A41FC53eD72750F6b5E81DEAEBADCF818',

    // NFT Position Manager for CL positions
    NonfungiblePositionManager: '0x0e98B82C5FAec199DfAFe2b151d51d40522e7f35',

    // Token Position Descriptor (NFT metadata)
    NonfungibleTokenPositionDescriptor: '0xe4C6586B13EebB8a8d05A35e147784b0Fa7F077e',

    // Quoter for getting swap quotes
    QuoterV2: '0x4A42169A43c148674708622583682dA668B8b43D',

    // Mixed Route Quoter (supports V2 + CL routes)
    MixedRouteQuoterV1: '0xCC4Af1C94AfC5eA71Fee618A880c271E0416F9a4',

    // Sugar Helper for data aggregation
    SugarHelper: '0x1057B7121E75E3df8fb78aA8bdD71d78a850Cf6B',

    // Custom Swap Fee Module
    CustomSwapFeeModule: '0xa63203F534539e85175B813db14C4a701FDE0a15',

    // Custom Unstaked Fee Module
    CustomUnstakedFeeModule: '0x4D464AaE5AA2cE4012c32daF8B58C952dA731463',

    // NFT Descriptor Library
    NFTDescriptor: '0x30D2CcF8Bf963Ce8D8905c8Eac8Bfff0De805024',

    // NFT SVG Library
    NFTSVG: '0x974bbfc2DE0EfEd83A950fcB323c429d29c288F3',
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
