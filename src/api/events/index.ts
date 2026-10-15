import { Server } from 'socket.io';
import AppLogger from '../loaders/logger';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import chat from './chat';
import live from './live';
import call from './call';
import randomMatch from './randomMatch';

import User from '../../models/User';

export default (io: Server): void => {
    io.on('connection', (socket: AuthenticatedSocket) => {
        if (socket.userId != null) {
            socket.join(`user_${socket.userId}`);
            User.findByIdAndUpdate(socket.userId, { lastLoginAt: new Date() }).catch((err) => {
                AppLogger.warn(`Failed to update lastLoginAt for connected user ${socket.userId}: ${err.message}`);
            });
        }
        chat(socket, io);
        live(socket, io);
        call(socket, io);
        randomMatch(socket, io);
    });
    AppLogger.info('✌️ Socket Events Loaded');
};
