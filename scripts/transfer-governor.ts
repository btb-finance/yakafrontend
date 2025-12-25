// Script to transfer Voter governor role from ProtocolGovernor to your wallet
// Run with: bun run scripts/transfer-governor.ts

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sei } from '../src/config/chains';

const VOTER_ADDRESS = '0x4B7e64A935aEAc6f1837a57bdA329c797Fa2aD22';
const NEW_GOVERNOR = '0xF7D62712f4650720477481015d052c451E7192c7'; // Your wallet

const VOTER_ABI = parseAbi([
    'function setGovernor(address _governor) external',
    'function governor() view returns (address)',
    'function emergencyCouncil() view returns (address)',
]);

async function main() {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error('Set PRIVATE_KEY env variable');
        process.exit(1);
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log('Using account:', account.address);

    const publicClient = createPublicClient({
        chain: sei,
        transport: http('https://sei-evm-rpc.stakeme.pro'),
    });

    const walletClient = createWalletClient({
        account,
        chain: sei,
        transport: http('https://sei-evm-rpc.stakeme.pro'),
    });

    // Check current governor
    const currentGovernor = await publicClient.readContract({
        address: VOTER_ADDRESS,
        abi: VOTER_ABI,
        functionName: 'governor',
    });
    console.log('Current governor:', currentGovernor);

    // Check emergency council
    const emergencyCouncil = await publicClient.readContract({
        address: VOTER_ADDRESS,
        abi: VOTER_ABI,
        functionName: 'emergencyCouncil',
    });
    console.log('Emergency council:', emergencyCouncil);

    if (emergencyCouncil.toLowerCase() !== account.address.toLowerCase()) {
        console.error('You are not the emergency council!');
        process.exit(1);
    }

    if (currentGovernor.toLowerCase() === NEW_GOVERNOR.toLowerCase()) {
        console.log('Governor is already set to your wallet!');
        return;
    }

    console.log('\nTransferring governor to:', NEW_GOVERNOR);

    const hash = await walletClient.writeContract({
        address: VOTER_ADDRESS,
        abi: VOTER_ABI,
        functionName: 'setGovernor',
        args: [NEW_GOVERNOR],
    });

    console.log('Transaction hash:', hash);
    console.log('Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Transaction confirmed in block:', receipt.blockNumber);

    // Verify
    const newGovernor = await publicClient.readContract({
        address: VOTER_ADDRESS,
        abi: VOTER_ABI,
        functionName: 'governor',
    });
    console.log('\n✅ New governor:', newGovernor);
}

main().catch(console.error);
