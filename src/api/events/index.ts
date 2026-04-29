import { Server } from 'socket.io';
import AppLogger from '../loaders/logger';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import chat from './chat';

export default (io: Server): void => {
    io.on('connection', (socket: AuthenticatedSocket) => {
        chat(socket, io);
    });
    AppLogger.info('✌️ Socket Events Loaded');
};
