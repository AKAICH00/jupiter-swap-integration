import dotenv from 'dotenv';
import { validateConfig } from './validation.js';

// Load environment variables
dotenv.config();

// Define required environment variables
const requiredEnvVars = [
    'HELIUS_RPC_URL',
    'HELIUS_API_KEY',
    'LOG_LEVEL',
    'REDIS_URL',
    'REDIS_TOKEN'
];

// Configuration object
const config = {
    network: 'mainnet', // Always mainnet for production
    port: parseInt(process.env.PORT || '3000', 10),
    rpc: {
        mainnet: process.env.HELIUS_RPC_URL
    },
    jupiter: {
        apiUrl: 'https://quote-api.jup.ag/v6',
        rpcUrl: process.env.HELIUS_RPC_URL
    },
    helius: {
        apiKey: process.env.HELIUS_API_KEY
    },
    upstash: {
        redis: {
            url: process.env.REDIS_URL,
            token: process.env.REDIS_TOKEN
        }
    },
    market: {
        updateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '30000', 10),
        priceChangeThreshold: parseFloat(process.env.PRICE_CHANGE_THRESHOLD || '0.02'),
        volumeThreshold: parseInt(process.env.VOLUME_THRESHOLD || '1000000', 10),
        minSignalInterval: parseInt(process.env.MIN_SIGNAL_INTERVAL || '300000', 10)
    }
};

// Validate configuration
const isTestEnvironment = process.env.NODE_ENV === 'test';
validateConfig(config, isTestEnvironment ? requiredEnvVars : [...requiredEnvVars]);

export default config;