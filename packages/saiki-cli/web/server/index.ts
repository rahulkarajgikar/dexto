import express from 'express';
import { logger } from '@saiki/logger';
import { resolvePackagePath, SaikiAgent } from '@saiki/core';
import type { AgentCard } from '@saiki/core';
import { initializeApi } from '../../api/server.js';
import os from 'os';

export async function startWebUI(
    agent: SaikiAgent,
    port = 3000,
    agentCardOverride?: Partial<AgentCard>
) {
    // Assuming initializeApi returns { app, server, wss, webSubscriber }
    const { app, server, wss, webSubscriber } = await initializeApi(agent, agentCardOverride);

    // Adjusted public path resolution for the web package structure
    // Serve from the 'public' directory adjacent to 'dist' after build
    const publicPath = resolvePackagePath('../public', true); // Points relative to dist/server
    logger.info(`Serving static files from: ${publicPath}`);
    app.use(express.static(publicPath));

    server.listen(port, '0.0.0.0', () => {
        const networkInterfaces = os.networkInterfaces();
        let localIp = 'localhost';
        Object.keys(networkInterfaces).forEach((ifaceName) => {
            networkInterfaces[ifaceName]?.forEach((iface) => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    return;
                }
            });
            if (localIp !== 'localhost') return;
        });

        logger.info(
            `WebUI server started successfully. Accessible at: http://localhost:${port} and http://${localIp}:${port} on your local network.`,
            null,
            'green'
        );
    });

    return { server, wss, webSubscriber };
}
