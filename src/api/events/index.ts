import { Server } from 'socket.io';
import AppLogger from '../loaders/logger';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import chat from './chat';

export default (io: Server): void => {
    io.on('connection', (socket: AuthenticatedSocket) => {
        if (socket.userId != null) {
            socket.join(`user_${socket.userId}`);
        }
        chat(socket, io);
    });
    AppLogger.info('✌️ Socket Events Loaded');
};
