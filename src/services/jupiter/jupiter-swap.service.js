import fetch from 'cross-fetch';
import { Transaction, PublicKey, VersionedTransaction, AddressLookupTableAccount } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccount, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import BaseSwapService from '../trading/base-swap.service.js';
import config from '../../config/env.js';
import { getHeliusRpcUrl } from '../../tests/utils/test-env.js';
import {
  ERROR_MESSAGES,
  TRADING_DEFAULTS,
  JUPITER_CONFIG,
  TRANSACTION_CONFIG,
  JUPITER_ENDPOINTS
} from '../../config/constants.js';
import {
  JupiterApiError,
  JUPITER_ERROR_CODES,
  JUPITER_ERROR_MESSAGES
} from '../../utils/errors/jupiter.errors.js';
import logger from '../../utils/logger.js';
import axios from 'axios';
import { Connection } from '@solana/web3.js';
import { SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TransactionInstruction } from '@solana/web3.js';

// Token program IDs
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

class JupiterSwapService extends BaseSwapService {
  constructor(apiUrl, rpcUrl, network) {
    super({
      provider: 'jupiter',
      rpcUrl,
      network
    });
    
    this.apiUrl = apiUrl;
    this.logger = logger;
    this.currentSwapParams = null;

    // Use the imported program IDs directly
    this.tokenProgramId = TOKEN_PROGRAM_ID;
    this.associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID;

    this.logger.info('Jupiter Swap Service initialized', {
      apiUrl,
      rpcUrl,
      network
    });
  }

  logSwap(message, context = {}) {
    this.logger.info(`[jupiter] ${message}`, {
      ...context,
      provider: 'jupiter',
      network: this.network,
      timestamp: new Date().toISOString()
    });
  }

  logDebug(message, context = {}) {
    this.logger.debug(`[jupiter] ${message}`, {
      ...context,
      provider: 'jupiter',
      network: this.network,
      timestamp: new Date().toISOString()
    });
  }

  logError(message, context = {}) {
    this.logger.error(`[jupiter] ${message}`, {
      ...context,
      provider: 'jupiter',
      network: this.network,
      timestamp: new Date().toISOString()
    });
  }

  async getQuote(inputMint, outputMint, amount, slippageBps) {
    const quoteUrl = new URL(`${this.apiUrl}/quote`);
    quoteUrl.searchParams.append('inputMint', inputMint);
    quoteUrl.searchParams.append('outputMint', outputMint);
    quoteUrl.searchParams.append('amount', amount);
    quoteUrl.searchParams.append('slippageBps', slippageBps);
    quoteUrl.searchParams.append('onlyDirectRoutes', 'true');
    quoteUrl.searchParams.append('platformFeeBps', '0');
    quoteUrl.searchParams.append('maxAccounts', '8');

    this.logDebug('Jupiter quote request', { url: quoteUrl.toString() });

    const response = await axios.get(quoteUrl.toString());
    return response.data;
  }

  /**
   * Create a swap transaction using Jupiter API
   * @param {string} userPublicKey - User's public key
   * @param {string} inputMint - Input token mint address
   * @param {string} outputMint - Output token mint address
   * @param {string} amount - Amount of input token (as string)
   * @param {number} slippageBps - Slippage tolerance in basis points
   * @param {boolean} useLegacyTransaction - Whether to use legacy transaction format
   * @returns {Promise<Object>} - Swap transaction response
   */
  async createSwapTransaction(userPublicKey, inputMint, outputMint, amount, slippageBps, useLegacyTransaction = false) {
    try {
      // Store the current swap parameters for potential retries
      this.currentSwapParams = {
        userPublicKey,
        inputMint,
        outputMint,
        amount,
        slippageBps
      };

      this.logSwap('Creating swap transaction', {
        userPublicKey: userPublicKey.toString(),
        inputMint,
        outputMint,
        amount,
        slippageBps
      });

      // Get quote
      const quoteResponse = await this.getQuote(inputMint, outputMint, amount, slippageBps);
      this.logDebug('Jupiter quote response', { quote: quoteResponse });

      // Get swap transaction
      const swapRequestBody = {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapUnwrapSOL: JUPITER_CONFIG.TOKEN_VALIDATION.WRAP_UNWRAP_SOL,
        asLegacyTransaction: !JUPITER_CONFIG.PROGRAM_IDS[this.network.toUpperCase()].VERSIONED_TRANSACTION,
        devnet: this.network === 'devnet',
        computeUnitPriceMicroLamports: JUPITER_CONFIG.TRANSACTION_OPTIONS.PRIORITY_FEE_BPS
      };

      this.logDebug('Jupiter swap request', {
        url: `${this.apiUrl}/swap`,
        body: swapRequestBody
      });

      const swapResponse = await axios.post(`${this.apiUrl}/swap`, swapRequestBody);

      this.logSwap('Swap transaction created', {
        userPublicKey: userPublicKey.toString(),
        inputMint,
        outputMint,
        amount,
        response: swapResponse.data
      });

      return swapResponse.data;
    } catch (error) {
      this.logSwap('Failed to create swap transaction', {
        error: error.message || 'Unknown error',
        userPublicKey: userPublicKey.toString()
      });
      throw error;
    }
  }

  /**
   * Execute a swap transaction
   * @param {Object} wallet - Wallet to sign transaction
   * @param {string} swapTransaction - Swap transaction in base64 format
   * @returns {Promise<string>} Transaction signature
   */
  async executeSwap(wallet, swapTransaction) {
    try {
      this.logSwap('Executing swap', {
        wallet: wallet.publicKey.toString()
      });

      // Store the current transaction parameters
      if (!this.currentSwapParams) {
        this.logSwap('No current swap parameters found', {
          wallet: wallet.publicKey.toString()
        });
        throw new Error('No current swap parameters found');
      }
      
      // Verify token accounts before executing swap
      const { inputAccount, outputAccount } = await this.verifyTokenAccounts(
        wallet,
        this.currentSwapParams.inputMint,
        this.currentSwapParams.outputMint
      );
      if (!inputAccount || !outputAccount) {
        this.logSwap('Token account verification failed', { wallet: wallet.publicKey.toString() });
        throw new Error('Missing token accounts for swap');
      }

      // Deserialize the transaction
      const serializedTransaction = Buffer.from(swapTransaction, 'base64');
      let tx;
      
      try {
        // Try to deserialize as a versioned transaction first
        tx = VersionedTransaction.deserialize(serializedTransaction);
      } catch (error) {
        try {
          // If that fails, try as a legacy transaction
          tx = Transaction.from(serializedTransaction);
        } catch (error) {
          this.logSwap('Failed to deserialize transaction', {
            error: error.message,
            wallet: wallet.publicKey.toString()
          });
          throw error;
        }
      }

      // Get the latest blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
        TRANSACTION_CONFIG.CONFIRMATION_COMMITMENT
      );

      // Handle versioned vs legacy transactions differently
      if (tx instanceof VersionedTransaction) {
        // For versioned transactions, we need to sign directly
        tx.sign([wallet]);
      } else {
        // For legacy transactions, set the blockhash and fee payer
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;

        // Sign the transaction
        if (wallet.signTransaction) {
          await wallet.signTransaction(tx);
        } else {
          tx.sign(wallet);
        }
      }

      // Serialize and send the transaction
      const rawTransaction = tx.serialize();
      const signature = await this.connection.sendRawTransaction(rawTransaction, {
        skipPreflight: JUPITER_CONFIG.TRANSACTION_OPTIONS.SKIP_PREFLIGHT,
        preflightCommitment: TRANSACTION_CONFIG.CONFIRMATION_COMMITMENT,
        maxRetries: TRANSACTION_CONFIG.MAX_RETRIES
      });

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight
        },
        TRANSACTION_CONFIG.CONFIRMATION_COMMITMENT
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      this.logSwap('Swap executed successfully', {
        signature,
        wallet: wallet.publicKey.toString()
      });

      return signature;
    } catch (error) {
      this.logSwap('Swap execution failed', {
        error: error.message || 'Unknown error',
        wallet: wallet.publicKey.toString()
      });
      throw error;
    }
  }

  /**
   * Verify token accounts exist for a swap and create them if needed
   * @param {Object} wallet - Wallet to check accounts for
   * @param {PublicKey} inputMint - Input token mint
   * @param {PublicKey} outputMint - Output token mint
   * @returns {Promise<Object>} Token account addresses
   */
  async verifyTokenAccounts(wallet, inputMint, outputMint) {
    try {
      // Convert strings to PublicKey if needed
      inputMint = inputMint instanceof PublicKey ? inputMint : new PublicKey(inputMint);
      outputMint = outputMint instanceof PublicKey ? outputMint : new PublicKey(outputMint);

      this.logDebug('Verifying token accounts', {
        wallet: wallet.publicKey.toString(),
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString()
      });

      // Get program IDs from config
      const tokenProgramId = new PublicKey(JUPITER_CONFIG.PROGRAM_IDS[this.network.toUpperCase()].TOKEN_PROGRAM);
      const associatedTokenProgramId = new PublicKey(JUPITER_CONFIG.PROGRAM_IDS[this.network.toUpperCase()].ASSOCIATED_TOKEN_PROGRAM);

      // Get associated token addresses
      const [inputAccountAddress, outputAccountAddress] = await Promise.all([
        getAssociatedTokenAddress(
          inputMint,
          wallet.publicKey,
          false,
          tokenProgramId,
          associatedTokenProgramId
        ),
        getAssociatedTokenAddress(
          outputMint,
          wallet.publicKey,
          false,
          tokenProgramId,
          associatedTokenProgramId
        )
      ]);

      this.logDebug('Associated token addresses', {
        inputAccount: inputAccountAddress.toString(),
        outputAccount: outputAccountAddress.toString()
      });

      // Get account info
      const [inputAccountInfo, outputAccountInfo] = await Promise.all([
        this.connection.getAccountInfo(inputAccountAddress),
        this.connection.getAccountInfo(outputAccountAddress)
      ]);

      // Create token accounts if they don't exist
      if (!inputAccountInfo && inputMint.toString() !== SOL_MINT.toString()) {
        this.logDebug('Creating input token account', {
          account: inputAccountAddress.toString()
        });
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            inputAccountAddress, // associatedToken
            wallet.publicKey, // owner
            inputMint, // mint
            tokenProgramId, // programId
            associatedTokenProgramId // associatedTokenProgramId
          )
        );
        
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        
        if (wallet.signTransaction) {
          await wallet.signTransaction(transaction);
        } else {
          transaction.sign(wallet);
        }
        
        await this.connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
      }

      if (!outputAccountInfo && outputMint.toString() !== SOL_MINT.toString()) {
        this.logDebug('Creating output token account', {
          account: outputAccountAddress.toString()
        });
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            outputAccountAddress, // associatedToken
            wallet.publicKey, // owner
            outputMint, // mint
            tokenProgramId, // programId
            associatedTokenProgramId // associatedTokenProgramId
          )
        );
        
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        
        if (wallet.signTransaction) {
          await wallet.signTransaction(transaction);
        } else {
          transaction.sign(wallet);
        }
        
        await this.connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
      }

      return {
        inputAccount: inputMint.toString() === SOL_MINT.toString() ? wallet.publicKey : inputAccountAddress,
        outputAccount: outputMint.toString() === SOL_MINT.toString() ? wallet.publicKey : outputAccountAddress
      };
    } catch (error) {
      this.logError('Failed to verify token accounts', {
        error: error.message || error,
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString()
      });
      throw error;
    }
  }

  /**
   * Verify a swap transaction with Jupiter-specific checks
   * @param {string} signature - Transaction signature
   * @param {Object} expectedChanges - Expected token balance changes
   * @returns {Promise<Object>} Verification result
   */
  async verifySwap(signature, expectedChanges) {
    try {
      const result = await super.verifySwap(signature, expectedChanges);
      
      // Add Jupiter-specific verification if needed
      // For example, checking specific program IDs or instruction data
      
      return result;
    } catch (error) {
      logger.error('Jupiter swap verification failed', {
        error,
        signature
      });
      throw error;
    }
  }
}

// Export the class instead of a singleton instance
export default JupiterSwapService;