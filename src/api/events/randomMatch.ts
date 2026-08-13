import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { RandomMatchService, RandomCallType } from '../../services/app/RandomMatchService';
import Container from 'typedi';
import AppLogger from '../loaders/logger';

export default (socket: AuthenticatedSocket, io: Server) => {
  const randomMatchService = Container.get(RandomMatchService);

  if (!socket.user) {
    return;
  }

  const userId = socket.user.id;

  socket.on('join_random_match', async (data: { callType: RandomCallType }) => {
    AppLogger.info(`[Socket Event: join_random_match] userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const callType = data?.callType;
      if (!callType || (callType !== 'voice' && callType !== 'video')) {
        socket.emit('error_message', 'callType must be voice or video');
        return;
      }

      await randomMatchService.joinRandomMatch(userId, callType, socket.id, io);
      AppLogger.info(`[Socket Event: join_random_match] Queued. userId=${userId}, callType=${callType}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: join_random_match] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to join random match');
    }
  });

  socket.on('leave_random_match', async () => {
    AppLogger.info(`[Socket Event: leave_random_match] userId=${userId}`);
    try {
      const left = randomMatchService.leaveRandomMatch(userId, io);
      if (!left) {
        socket.emit('random_match_left', { callType: null });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_random_match] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to leave random match');
    }
  });

  socket.on(
    'set_random_call_available',
    async (data: { available: boolean; callTypes?: RandomCallType[] }) => {
      AppLogger.info(
        `[Socket Event: set_random_call_available] userId=${userId}, data=${JSON.stringify(data)}`
      );
      try {
        if (typeof data?.available !== 'boolean') {
          socket.emit('error_message', 'available (boolean) is required');
          return;
        }

        await randomMatchService.setHostAvailability(
          userId,
          data.available,
          data.callTypes,
          socket.id,
          io
        );
      } catch (error: any) {
        AppLogger.error(
          `[Socket Event: set_random_call_available] Error for user ${userId}: ${error.message}`
        );
        socket.emit('error_message', error.message || 'Failed to update random call availability');
      }
    }
  );

  socket.on('disconnect', () => {
    try {
      randomMatchService.handleDisconnect(userId);
      AppLogger.info(`[Socket Event: randomMatch disconnect cleanup] userId=${userId}`);
    } catch (error: any) {
      AppLogger.error(
        `[Socket Event: randomMatch disconnect] Error for user ${userId}: ${error.message}`
      );
    }
  });
};
