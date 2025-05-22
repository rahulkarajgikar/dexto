/**
 * Example usage of the new WebUI management system
 * This file demonstrates both the backward-compatible API and the new advanced API
 */

import { WebUIManager, startNextJsWebServer } from './index.js';

// Example 1: Backward-compatible usage (simple)
export async function exampleSimpleUsage() {
    console.log('Starting WebUI with simple API...');

    const success = await startNextJsWebServer(
        'http://localhost:3001', // API URL
        3000, // Frontend port
        'http://localhost:3000' // Frontend URL
    );

    if (success) {
        console.log('✅ WebUI started successfully');
    } else {
        console.log('❌ Failed to start WebUI');
    }

    return success;
}

// Example 2: Advanced usage with WebUIManager (recommended for new code)
export async function exampleAdvancedUsage() {
    console.log('Starting WebUI with advanced API...');

    const webUIManager = new WebUIManager();

    // Start the WebUI with custom configuration
    const result = await webUIManager.start({
        apiUrl: 'http://localhost:3001',
        frontPort: 3000,
        frontUrl: 'http://localhost:3000',
        timeout: 15000, // Custom timeout of 15 seconds
    });

    if (result.success) {
        console.log('✅ WebUI started successfully');
        console.log('Process ID:', result.process?.pid);

        // Check if it's still running
        console.log('Is running:', webUIManager.isRunning());

        // Later, when you want to stop it:
        // await webUIManager.stop();

        return true;
    } else {
        console.log('❌ Failed to start WebUI:', result.error);
        return false;
    }
}

// Example 3: Error handling and graceful shutdown
export async function exampleWithErrorHandling() {
    const webUIManager = new WebUIManager();

    try {
        console.log('Starting WebUI with error handling...');

        const result = await webUIManager.start({
            apiUrl: 'http://localhost:3001',
            frontPort: 3000,
            frontUrl: 'http://localhost:3000',
        });

        if (!result.success) {
            throw new Error(`WebUI startup failed: ${result.error}`);
        }

        console.log('✅ WebUI started successfully');

        // Set up graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Received SIGINT, shutting down WebUI...');
            await webUIManager.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('Received SIGTERM, shutting down WebUI...');
            await webUIManager.stop();
            process.exit(0);
        });

        return true;
    } catch (error) {
        console.error('Error starting WebUI:', error);

        // Ensure cleanup even if startup failed
        if (webUIManager.isRunning()) {
            await webUIManager.stop();
        }

        return false;
    }
}

// Example 4: Custom configuration for different environments
export async function exampleEnvironmentSpecific(
    environment: 'development' | 'staging' | 'production'
) {
    const webUIManager = new WebUIManager();

    // Different configurations based on environment
    const configs = {
        development: {
            apiUrl: 'http://localhost:3001',
            frontPort: 3000,
            frontUrl: 'http://localhost:3000',
            timeout: 10000,
        },
        staging: {
            apiUrl: 'http://staging-api.example.com',
            frontPort: 3000,
            frontUrl: 'http://staging.example.com',
            timeout: 20000,
        },
        production: {
            apiUrl: 'http://api.example.com',
            frontPort: 3000,
            frontUrl: 'http://example.com',
            timeout: 30000,
        },
    };

    const config = configs[environment];
    console.log(`Starting WebUI for ${environment} environment...`);

    const result = await webUIManager.start(config);

    if (result.success) {
        console.log(`✅ WebUI started for ${environment}`);
        console.log(`Frontend: ${config.frontUrl}`);
        console.log(`API: ${config.apiUrl}`);
    } else {
        console.log(`❌ Failed to start WebUI for ${environment}:`, result.error);
    }

    return result.success;
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Running WebUI management examples...\n');

    // Run the simple example
    await exampleSimpleUsage();

    console.log('\n---\n');

    // Run the advanced example
    await exampleAdvancedUsage();
}
