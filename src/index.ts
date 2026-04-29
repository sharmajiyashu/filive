import 'reflect-metadata';
import { Express } from 'express';
import express from 'express';
import dns from 'node:dns';
import config from './config';

// Fix for ECONNREFUSED / DNS resolution issues in Node 18+ on some networks
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore if this fails due to environment restrictions
}
import AppLogger from './api/loaders/logger';
import appLoader from './api/loaders';
import socketLoader from './api/loaders/socket';
import socketDI from './api/loaders/diSocket';

process.on('unhandledRejection', (reason) => {
  AppLogger.error({ name: 'UnhandledRejection', reason });
});

async function startServer() {
  const app: Express = express();
  await appLoader(app);

  return app.listen(config.port, () => {
    AppLogger.info(`👌 Server Listening on Port: ${config.port}
        **********************************
                Filive API
        **********************************
        DB Connection: MongoDB Atlas
        **********************************
        `);

  });
}

startServer()
  .then(async httpServer => {
    const socket = socketLoader(httpServer);
    await socketDI(socket);
  })
  .catch(e => {
    AppLogger.error(`Server Failed to Start because${e.stack}`);
  });