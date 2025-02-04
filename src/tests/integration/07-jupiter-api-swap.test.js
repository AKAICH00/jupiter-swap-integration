import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { loadTestEnv } from '../utils/test-env.js';
import * as spl from '@solana/spl-token';
import logger from '../../utils/logger.js';
import {
  JupiterApiError,
  JUPITER_ERROR_CODES,
  JUPITER_ERROR_MESSAGES
} from '../../utils/errors/jupiter.errors.js';
import JupiterSwapService from '../../services/jupiter/jupiter-swap.service.js';
import config from '../../config/env.js';
import { getHeliusRpcUrl } from '../utils/test-env.js';
import { JUPITER_CONFIG, JUPITER_ENDPOINTS, RPC_CONFIG } from '../../config/constants.js';

// Set test environment
process.env.NODE_ENV = 'test';

// Load environment variables first
loadTestEnv();

// Ensure we're using test configuration
logger.info('Test configuration loaded', {
  network: process.env.NETWORK,
  rpcUrl: getHeliusRpcUrl(),
  jupiterApiUrl: process.env.JUPITER_API_URL
});

// Configure RPC endpoints with proper URLs including API keys
RPC_CONFIG.ENDPOINTS.MAINNET = [
    'https://mainnet.helius-rpc.com/?api-key=0e82fae2-264b-4d1e-899d-c74784909950',
    'https://api.mainnet-beta.solana.com'
];

describe('Jupiter API Direct Swap Tests', () => {
    let connection;
    let fundedWallet;
    let jupiterSwapService;
    // Mainnet USDC mint address
    const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    const TEST_AMOUNT_SOL = 0.01; // Test with a smaller amount (0.01 SOL)
    const DELAY_BETWEEN_TESTS = 5000; // Increased to 5 seconds
    const DELAY_BETWEEN_OPERATIONS = 2000; // 2 second delay between operations
    
    // Cache for token accounts
    let tokenAccounts = {
        usdc: null,
        sol: null
    };

    beforeAll(async () => {
        try {
            // Initialize Jupiter Swap Service with proper configuration
            jupiterSwapService = new JupiterSwapService(
                'https://quote-api.jup.ag/v6',
                'https://mainnet.helius-rpc.com/?api-key=0e82fae2-264b-4d1e-899d-c74784909950',
                'mainnet'
            );
            
            // Use the mainnet wallet
            const privateKeyArray = new Uint8Array([81,27,225,43,14,9,214,248,170,57,248,163,149,6,223,40,119,46,111,255,51,135,142,154,214,218,182,165,132,99,100,207,170,192,154,53,157,37,156,192,238,253,195,28,22,211,141,155,216,130,72,176,170,117,116,226,189,176,158,98,97,34,23,3]);
            fundedWallet = Keypair.fromSecretKey(privateKeyArray);
            logger.info('Using mainnet wallet:', { publicKey: fundedWallet.publicKey.toString() });
            
            // Initialize connection from swap service
            connection = jupiterSwapService.connection;
            
            // Verify connection
            const version = await connection.getVersion();
            logger.info('Connected to Solana', { version });
            
        } catch (error) {
            logger.error('Error in test setup:', error);
            throw error;
        }
    });

    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    test('should verify Jupiter API connection', async () => {
        try {
            // Create a minimal swap transaction to test connection
            const swapTransaction = await jupiterSwapService.createSwapTransaction(
                fundedWallet.publicKey,
                SOL_MINT,
                USDC_MINT,
                '20000000', // 0.02 SOL in lamports
                50,
                true // Force legacy transaction
            );
            
            expect(swapTransaction).toBeDefined();
            expect(swapTransaction.swapTransaction).toBeDefined();
            logger.info('Jupiter API connection verified');
        } catch (error) {
            if (error.message.includes('429')) {
                logger.warn('Rate limit hit during API test');
                return;
            }
            throw error;
        }
        
        await sleep(DELAY_BETWEEN_TESTS);
    }, 30000);

    test('should verify wallet balances before swap', async () => {
        try {
            // Check SOL balance
            const solBalance = await connection.getBalance(fundedWallet.publicKey);
            const solBalanceInSol = solBalance / 1e9;
            
            // Check USDC balance
            const usdcBalance = await jupiterSwapService.getTokenBalance(
                fundedWallet.publicKey,
                USDC_MINT
            );
            
            logger.info('Initial balances', {
                sol: solBalanceInSol,
                usdc: usdcBalance
            });
            
            // Ensure we have enough SOL for the test
            expect(solBalanceInSol).toBeGreaterThan(TEST_AMOUNT_SOL * 2);
            
        } catch (error) {
            logger.error('Balance check failed', error);
            throw error;
        }
        
        await sleep(DELAY_BETWEEN_TESTS);
    }, 30000);

    test('should execute and verify SOL to USDC swap', async () => {
        try {
            // Get initial balances in one batch using Promise.all
            const [initialSolBalance, initialUsdcBalance] = await Promise.all([
                connection.getBalance(fundedWallet.publicKey),
                jupiterSwapService.getTokenBalance(
                    fundedWallet.publicKey,
                    USDC_MINT
                )
            ]);
            
            logger.info('Initial balances before swap', {
                sol: initialSolBalance / 1e9,
                usdc: initialUsdcBalance
            });
            
            await sleep(DELAY_BETWEEN_OPERATIONS);
            
            // Create swap transaction
            const amount = TEST_AMOUNT_SOL * 1e9; // Convert to lamports
            const swapTransaction = await jupiterSwapService.createSwapTransaction(
                fundedWallet.publicKey,
                SOL_MINT,
                USDC_MINT,
                amount.toString(),
                50,
                true // Force legacy transaction
            );
            
            await sleep(DELAY_BETWEEN_OPERATIONS);
            
            // Get latest blockhash right before executing
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            
            // Execute the swap
            const signature = await jupiterSwapService.executeSwap(
                fundedWallet,
                swapTransaction.swapTransaction
            );
            
            logger.info('Swap transaction submitted', { signature });
            
            // Wait for confirmation with a shorter timeout
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight
            }, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }
            
            await sleep(DELAY_BETWEEN_OPERATIONS);
            
            // Get final balances in one batch
            const [finalSolBalance, finalUsdcBalance] = await Promise.all([
                connection.getBalance(fundedWallet.publicKey),
                jupiterSwapService.getTokenBalance(
                    fundedWallet.publicKey,
                    USDC_MINT
                )
            ]);
            
            logger.info('Final balances after swap', {
                sol: finalSolBalance / 1e9,
                usdc: finalUsdcBalance,
                solChange: (finalSolBalance - initialSolBalance) / 1e9,
                usdcChange: finalUsdcBalance - initialUsdcBalance
            });
            
            // Verify balance changes
            expect(finalSolBalance).toBeLessThan(initialSolBalance);
            expect(finalUsdcBalance).toBeGreaterThan(initialUsdcBalance);
            
        } catch (error) {
            if (error.message.includes('429')) {
                logger.warn('Rate limit hit during swap test, waiting before retry');
                await sleep(DELAY_BETWEEN_TESTS);
                return;
            }
            logger.error('Swap test failed', { error });
            throw error;
        }
        
        await sleep(DELAY_BETWEEN_TESTS);
    }, 120000); // Increased timeout to 120 seconds
});