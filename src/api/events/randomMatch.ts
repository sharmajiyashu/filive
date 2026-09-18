import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { RandomMatchService, RandomCallType } from '../../services/app/RandomMatchService';
import Container from 'typedi';
import AppLogger from '../loaders/logger';
import { emitSocketError, emitSocketSuccess } from '../../utils/socketResponse';

export default (socket: AuthenticatedSocket, io: Server) => {
  const randomMatchService = Container.get(RandomMatchService);

  if (!socket.user) {
    return;
  }

  const userId = socket.user.id;

  socket.on('join_random_match', async (data: { callType: RandomCallType }, callback?: any) => {
    AppLogger.info(`[Socket Event: join_random_match] userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const rawType = (data?.callType as any)?.toString()?.trim()?.toLowerCase();
      const callType: RandomCallType =
        rawType === 'voice' || rawType === 'audio'
          ? 'voice'
          : rawType === 'video'
          ? 'video'
          : ('' as any);

      if (!callType) {
        emitSocketError(
          socket,
          'join_random_match',
          'callType must be voice, audio, or video',
          'Validation failed',
          'INVALID_CALL_TYPE',
          callback
        );
        return;
      }

      await randomMatchService.joinRandomMatch(userId, callType, socket.id, io);
      AppLogger.info(`[Socket Event: join_random_match] Queued. userId=${userId}, callType=${callType}`);

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'join_random_match', data: { callType } });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: join_random_match] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'join_random_match', error, 'Failed to join random match', undefined, callback);
    }
  });

  socket.on('leave_random_match', async (data?: any, callback?: any) => {
    AppLogger.info(`[Socket Event: leave_random_match] userId=${userId}`);
    try {
      const left = randomMatchService.leaveRandomMatch(userId, io);
      if (!left) {
        socket.emit('random_match_left', {
          callType: null,
          success: true,
          type: 'random_match_left'
        });
      }
      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'leave_random_match' });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: leave_random_match] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'leave_random_match', error, 'Failed to leave random match', undefined, callback);
    }
  });

  socket.on(
    'set_random_call_available',
    async (data: { available: boolean; callTypes?: (RandomCallType | 'audio')[] }, callback?: any) => {
      AppLogger.info(
        `[Socket Event: set_random_call_available] userId=${userId}, data=${JSON.stringify(data)}`
      );
      try {
        if (typeof data?.available !== 'boolean') {
          emitSocketError(
            socket,
            'set_random_call_available',
            'available (boolean) is required',
            'Validation failed',
            'VALIDATION_FAILED',
            callback
          );
          return;
        }

        const normalizedTypes: RandomCallType[] | undefined = data.callTypes
          ? (data.callTypes
              .map((t) => (t === 'audio' ? 'voice' : t))
              .filter((t): t is RandomCallType => t === 'voice' || t === 'video'))
          : undefined;

        await randomMatchService.setHostAvailability(
          userId,
          data.available,
          normalizedTypes,
          socket.id,
          io
        );

        if (typeof callback === 'function') {
          callback({ success: true, type: 'SUCCESS', event: 'set_random_call_available' });
        }
      } catch (error: any) {
        AppLogger.error(
          `[Socket Event: set_random_call_available] Error for user ${userId}: ${error.message}`
        );
        emitSocketError(
          socket,
          'set_random_call_available',
          error,
          'Failed to update random call availability',
          undefined,
          callback
        );
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
