import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import AppLogger from './logger';
import events from '../events';
import socketAuthMiddleware from '../middleware/socketAuthMiddleware';

export default (httpServer: HttpServer): Server => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling'],
        maxHttpBufferSize: 1e8,
        pingTimeout: 60000,
        pingInterval: 25000
    });
    io.use(socketAuthMiddleware);
    AppLogger.info(`✌️ Socket Loaded`);

    events(io);

    io.on('connection', (socket: Socket) => {
        AppLogger.info(`New connection: ${socket.id}`);
        socket.on('error', (error: Error) => {
            AppLogger.info('Socket error:', error);
        });
        socket.on('disconnect', (reason: string, description?: string) => {
            AppLogger.info('User disconnected:', socket.id, reason, description);
        });
    });

    return io;
};
