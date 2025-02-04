/**
 * System-wide constants
 */

// API Endpoints
export const JUPITER_ENDPOINTS = {
  PRICE_API: 'https://price.jup.ag/v6/price',
  QUOTE_API: 'https://quote-api.jup.ag/v6/quote',
  SWAP_API: 'https://quote-api.jup.ag/v6/swap',
  DEVNET_API: 'https://quote-api.jup.ag/v6'
};

// RPC Configuration
export const RPC_CONFIG = {
  ENDPOINTS: {
    TESTNET: [
      process.env.HELIUS_RPC_URL,
      'https://api.testnet.solana.com'
    ],
    MAINNET: [
      process.env.HELIUS_RPC_URL,
      'https://api.mainnet-beta.solana.com',
      'https://ssc-dao.genesysgo.net'
    ]
  },
  RETRY_OPTIONS: {
    MAX_RETRIES: 3,
    BACKOFF_MS: 1000,
    RATE_LIMIT_WAIT: 1000
  }
};

// Transaction confirmation settings
export const TRANSACTION_CONFIG = {
  CONFIRMATION_COMMITMENT: 'confirmed',
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // milliseconds
  PREFLIGHT_COMMITMENT: 'processed'
};

// Default trading parameters
export const TRADING_DEFAULTS = {
  SLIPPAGE_BPS: 50, // 0.5% default slippage
  MIN_SOL_BALANCE: 0.05, // Minimum SOL to keep for fees
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  MIN_SWAP_AMOUNT_USD: 0.01, // Minimum swap amount in USD
  MAX_SWAP_AMOUNT_USD: 100000, // Maximum swap amount in USD
  MIN_PRICE_IMPACT_BPS: 1000 // 10% maximum price impact
};

// Jupiter specific settings
export const JUPITER_CONFIG = {
  ROUTE_OPTIMIZATION: {
    ONLY_DIRECT_ROUTES: true, // Force direct routes on testnet
    EXACT_OUT: false,
    MIN_INTERMEDIATE_TOKENS: 0,
    MAX_INTERMEDIATE_TOKENS: 0, // No intermediate tokens on testnet
    MAX_ACCOUNTS: 8 // Reduced account limit for testnet
  },
  TOKEN_VALIDATION: {
    CHECK_TOKEN_ACCOUNT: true,
    AUTO_CREATE_TOKEN_ACCOUNT: true,
    WRAP_UNWRAP_SOL: true,
    VERIFY_TOKEN_ACCOUNTS: true // New setting to enforce verification
  },
  TRANSACTION_OPTIONS: {
    SKIP_PREFLIGHT: true, // Skip preflight for faster execution
    MAX_RETRIES_ON_RATE_LIMIT: 3,
    PRIORITY_FEE_BPS: 0, // No priority fee on testnet
    COMPUTE_UNIT_LIMIT: 200000, // Lower compute limit for testnet
    COMPUTE_UNIT_PRICE: 0 // No compute price on testnet
  },
  PROGRAM_IDS: {
    MAINNET: {
      JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      TOKEN_LEDGER: 'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo',
      VERSIONED_TRANSACTION: true,
      TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
    },
    TESTNET: {
      JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      TOKEN_LEDGER: 'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo',
      VERSIONED_TRANSACTION: false, // Use legacy transactions on testnet
      TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
    }
  }
};

// Error messages
export const ERROR_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Insufficient balance for trade',
  PRICE_FETCH_FAILED: 'Failed to fetch price from Jupiter',
  QUOTE_FETCH_FAILED: 'Failed to fetch quote from Jupiter',
  SWAP_EXECUTION_FAILED: 'Failed to execute swap',
  INVALID_MINT: 'Invalid token mint address',
  TRANSACTION_FAILED: 'Transaction failed',
  RPC_ERROR: 'RPC connection error',
  PROGRAM_NOT_FOUND: 'Program not found on the current network',
  ALT_NOT_FOUND: 'Address lookup table not found'
};

// Logging levels
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// Rate limiting
export const RATE_LIMITS = {
  MAX_REQUESTS_PER_MINUTE: 60,
  BURST_SIZE: 10
};