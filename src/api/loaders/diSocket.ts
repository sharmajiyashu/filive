import { Container } from 'typedi';
import { Server } from 'socket.io';
import AppLogger from './logger';

export default async (socket: Server): Promise<void> => {
    Container.set('socket', socket);
    AppLogger.info('✌️ Socket Added to DI Container');
};