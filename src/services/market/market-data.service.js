import JupiterSwapService from '../jupiter/jupiter-swap.service.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';

class MarketDataService {
    constructor() {
        this.jupiterService = new JupiterSwapService(
            env.jupiter.apiUrl,
            env.network === 'devnet' ? env.rpc.devnet : env.rpc.mainnet,
            env.network
        );
        this.priceHistory = new Map(); // Simple in-memory storage for MVP
        this.updateInterval = env.market.updateInterval;
        this.monitoringActive = false;
        this.intervalId = null;
    }

    async start() {
        if (this.monitoringActive) {
            logger.warn('Market data monitoring is already active');
            return;
        }

        logger.info('Starting market data monitoring', {
            updateInterval: this.updateInterval,
            network: env.network
        });

        this.monitoringActive = true;
        await this.updatePrices(); // Initial update
        this.intervalId = setInterval(async () => {
            try {
                await this.updatePrices();
                await this.cleanOldData();
            } catch (error) {
                logger.error('Error in market data monitoring:', error);
            }
        }, this.updateInterval);
    }

    async stop() {
        if (!this.monitoringActive) return;
        
        logger.info('Stopping market data monitoring');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.monitoringActive = false;
    }

    async updatePrices() {
        try {
            // Get SOL/USDC price with 1% slippage
            const quote = await this.jupiterService.getQuote(
                'So11111111111111111111111111111111111111112', // SOL
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                '1000000000', // 1 SOL
                100 // 1% slippage
            );

            const timestamp = Date.now();
            const priceData = {
                price: quote.outAmount,
                timestamp,
                priceImpactPct: quote.priceImpactPct
            };

            this.priceHistory.set(timestamp, priceData);
            logger.debug('Updated price data:', {
                price: priceData.price / 1000000, // Convert to USDC for logging
                timestamp: new Date(timestamp).toISOString(),
                priceImpact: priceData.priceImpactPct
            });

            return priceData;
        } catch (error) {
            logger.error('Failed to update prices:', error);
            throw error;
        }
    }

    cleanOldData() {
        const oneHourAgo = Date.now() - 3600000; // Keep last hour of data for MVP
        let deletedCount = 0;

        for (const [timestamp] of this.priceHistory) {
            if (timestamp < oneHourAgo) {
                this.priceHistory.delete(timestamp);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            logger.debug(`Cleaned ${deletedCount} old price records`);
        }
    }

    getPriceHistory() {
        return Array.from(this.priceHistory.values())
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    getLatestPrice() {
        const prices = this.getPriceHistory();
        return prices[prices.length - 1];
    }

    isActive() {
        return this.monitoringActive;
    }
}

export default MarketDataService;