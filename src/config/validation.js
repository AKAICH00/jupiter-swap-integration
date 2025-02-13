class ConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigurationError';
    }
}

function validateConfig(config, requiredVars) {
    const missingVars = [];
    const testMode = process.env.NODE_ENV === 'test';

    // For MVP, we only require these variables
    const mvpRequiredVars = [
        'HELIUS_RPC_URL',
        'HELIUS_API_KEY',
        'LOG_LEVEL',
        'REDIS_URL',
        'REDIS_TOKEN'
    ];

    // Use MVP required vars if in test mode or if explicitly testing market analysis
    const varsToCheck = testMode || process.env.MARKET_ANALYSIS_TEST === 'true' 
        ? mvpRequiredVars 
        : requiredVars;

    varsToCheck.forEach(varName => {
        let value;
        
        // Handle nested properties
        if (varName.includes('.')) {
            const parts = varName.split('.');
            value = parts.reduce((obj, part) => obj?.[part], config);
        } else {
            value = process.env[varName];
        }

        if (value === undefined || value === null || value === '') {
            missingVars.push(varName);
        }
    });

    if (missingVars.length > 0) {
        throw new ConfigurationError(`Missing required environment variables: ${missingVars.join(' ')}`);
    }
}

export { validateConfig, ConfigurationError };