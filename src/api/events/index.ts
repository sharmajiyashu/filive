import { Server } from 'socket.io';
import AppLogger from '../loaders/logger';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import chat from './chat';
import live from './live';
import call from './call';
import randomMatch from './randomMatch';

import User from '../../models/User';
import UserOnlineSession from '../../models/UserOnlineSession';

export default (io: Server): void => {
    io.on('connection', (socket: AuthenticatedSocket) => {
        if (socket.userId != null) {
            socket.join(`user_${socket.userId}`);
            User.findByIdAndUpdate(socket.userId, {
                isOnline: true,
                lastLoginAt: new Date(),
                lastActiveAt: new Date()
            }).catch((err) => {
                AppLogger.warn(`Failed to update online status for connected user ${socket.userId}: ${err.message}`);
            });

            // Broadcast online status to all connected clients
            io.emit('user_status_changed', {
                userId: socket.userId.toString(),
                isOnline: true,
                status: 'online'
            });

            // Start or refresh online session without double-counting
            UserOnlineSession.findOne({ userId: socket.userId, isClosed: false })
                .then((existingSession) => {
                    if (!existingSession) {
                        return UserOnlineSession.create({
                            userId: socket.userId,
                            startTime: new Date(),
                            lastHeartbeat: new Date(),
                            durationSeconds: 0,
                            isClosed: false,
                        });
                    } else {
                        existingSession.lastHeartbeat = new Date();
                        return existingSession.save();
                    }
                })
                .catch((err) => {
                    AppLogger.warn(`Failed to track online session for user ${socket.userId}: ${err.message}`);
                });

            // Heartbeat listener to keep session alive and prevent stale timeouts
            socket.on('heartbeat', async () => {
                try {
                    const now = new Date();
                    await Promise.all([
                        User.findByIdAndUpdate(socket.userId, { lastActiveAt: now, isOnline: true }),
                        UserOnlineSession.updateOne(
                            { userId: socket.userId, isClosed: false },
                            { $set: { lastHeartbeat: now } }
                        ),
                    ]);
                } catch (e: any) {
                    // Ignore heartbeat update errors
                }
            });

            socket.on('disconnect', () => {
                const uid = socket.userId;
                setTimeout(async () => {
                    try {
                        const userRoom = io.sockets.adapter.rooms.get(`user_${uid}`);
                        if (!userRoom || userRoom.size === 0) {
                            const now = new Date();
                            await User.findByIdAndUpdate(uid, { isOnline: false, lastActiveAt: now });
                            io.emit('user_status_changed', { userId: uid, isOnline: false, status: 'offline' });

                            // Close active unclosed online sessions
                            const openSessions = await UserOnlineSession.find({ userId: uid, isClosed: false });
                            for (const session of openSessions) {
                                const duration = Math.max(0, Math.round((now.getTime() - session.startTime.getTime()) / 1000));
                                session.endTime = now;
                                session.durationSeconds = duration;
                                session.isClosed = true;
                                await session.save();
                            }

                            // Issue 7 & 8: Auto-cleanup active calls and live streams when host/user disconnects
                            if (uid) {
                                try {
                                    const { Container } = await import('typedi');
                                    const { CallService } = await import('../../services/app/CallService');
                                    const callService = Container.get(CallService);
                                    await callService.endUserActiveCalls(uid, 'disconnected');
                                } catch (_) {}

                                try {
                                    const mongoose = await import('mongoose');
                                    const Room = mongoose.default.model('Room');
                                    const activeLiveRoom = await Room.findOne({ hostId: uid, status: 'live', roomType: 'livestream' });
                                    if (activeLiveRoom) {
                                        const { Container } = await import('typedi');
                                        const { LiveStreamService } = await import('../../services/app/LiveStreamService');
                                        const liveStreamService = Container.get(LiveStreamService);
                                        await liveStreamService.endLiveStream(uid, activeLiveRoom.channelName);
                                    }
                                } catch (_) {}
                            }
                        }
                    } catch (e: any) {
                        AppLogger.warn(`Failed to update offline status for user ${uid}: ${e.message}`);
                    }
                }, 1500);
            });
        }
        chat(socket, io);
        live(socket, io);
        call(socket, io);
        randomMatch(socket, io);
    });
    AppLogger.info('✌️ Socket Events Loaded');
};
