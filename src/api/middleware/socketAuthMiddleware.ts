import { Socket } from 'socket.io';
// import Container from 'typedi';
// import { AuthService } from '../../services/authService/AuthService';
import AppLogger from '../loaders/logger';
import { AuthenticationService } from '../../services/common/AuthenticationService';
import Container from 'typedi';

export interface AuthenticatedSocket extends Socket {
    userId?: string;
    user?: {
        id: string;
        email: string;
        fullName: string;
        profileImage?: string;
    };
}

export default async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    try {
        const token =
            socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return next(new Error('Unauthorized'));
        }
        const authService = Container.get(AuthenticationService);
        const user = await authService.verifyToken(token);
        if (!user) {
            return next(new Error('Invalid authentication token'));
        }
        // socket.userId = user.id;
        // socket.user = {
        //     id: user.id,
        //     email: user.email,
        //     fullName: user.fullName || '',
        //     profileImage: user.profileImage || ''
        // };
        AppLogger.info(`Socket authenticated for user: ${user.id}`);
        next();
    } catch (error) {
        AppLogger.error('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
    }
};
