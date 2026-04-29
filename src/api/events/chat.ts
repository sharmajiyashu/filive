import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import Container from 'typedi';
import AppLogger from '../loaders/logger';

interface ChatMessageData {
    chatId: number;
    message: string;
}

interface JoinChatData {
    chatId: number;
}

interface TypingData {
    chatId: number;
    isTyping: boolean;
}

export default (socket: AuthenticatedSocket, io: Server) => {


    if (!socket.user) {
        socket.disconnect();
        return;
    }

    const userId = Number(socket.user.id); 

    

    socket.on('disconnect', () => {
        AppLogger.info('Socket disconnected:', socket.id);
    });
};
