import { Server } from 'socket.io';
import AppLogger from '../loaders/logger';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import chat from './chat';
import live from './live';

export default (io: Server): void => {
    io.on('connection', (socket: AuthenticatedSocket) => {
        if (socket.userId != null) {
            socket.join(`user_${socket.userId}`);
        }
        chat(socket, io);
        live(socket, io);
    });
    AppLogger.info('✌️ Socket Events Loaded');
};
