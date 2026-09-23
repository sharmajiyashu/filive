import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { CallService } from '../../services/app/CallService';
import { GiftService } from '../../services/app/GiftService';
import { RandomMatchService } from '../../services/app/RandomMatchService';
import Container from 'typedi';
import AppLogger from '../loaders/logger';
import { emitSocketError } from '../../utils/socketResponse';

const callTimeouts = new Map<string, NodeJS.Timeout>();

function registerCallTimeout(callId: string, handler: () => void, durationMs: number) {
  // Always clear any existing timeout for this call first
  clearCallTimeout(callId);
  const timeoutId = setTimeout(handler, durationMs);
  callTimeouts.set(callId, timeoutId);
  AppLogger.info(`[Call Timeout Registered] callId=${callId}, timeoutMs=${durationMs}, activeTimers=${callTimeouts.size}`);
}

function clearCallTimeout(callId: string) {
  // Normalize the callId just in case
  const key = callId?.toString()?.trim();
  const timeoutId = callTimeouts.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    callTimeouts.delete(key);
    AppLogger.info(`[Call Timeout Cleared] callId=${key}, remainingTimers=${callTimeouts.size}`);
  } else {
    AppLogger.info(`[Call Timeout NOT FOUND] callId=${key}, activeTimers=${callTimeouts.size}`);
  }
}

export default (socket: AuthenticatedSocket, io: Server) => {
  const callService = Container.get(CallService);
  const giftService = Container.get(GiftService);

  if (!socket.user) {
    return;
  }

  const userId = socket.user.id;

  // 1. Initiate a Call Request
  socket.on('initiate_call', async (data: { receiverId: string; callType: 'voice' | 'video' }, callback?: any) => {
    AppLogger.info(`[Socket Event: initiate_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { receiverId, callType } = data || {};
      if (!receiverId || !callType) {
        emitSocketError(socket, 'initiate_call', 'receiverId and callType are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      const call = await callService.initiateCall(userId, receiverId, callType);
      const callerPayload = { ...(await callService.buildCallScreenPayload(call, userId)), success: true, type: 'call_initiated' };
      const hostPayload = { ...(await callService.buildCallScreenPayload(call, receiverId)), success: true, type: 'incoming_call' };

      socket.emit('call_initiated', callerPayload);
      io.to(`user_${receiverId}`).emit('incoming_call', hostPayload);

      // Start a 45-second auto-cut timeout for the call
      const callIdStr = call._id.toString().trim();
      registerCallTimeout(callIdStr, async () => {
        try {
          AppLogger.info(`[Call Timeout Fired] callId=${callIdStr}`);
          const timedOutCall = await callService.handleCallTimeout(callIdStr);
          if (timedOutCall) {
            const callerObj = timedOutCall.callerId as any;
            const receiverObj = timedOutCall.receiverId as any;

            AppLogger.info(`[Call Timeout] Emitting call_missed to caller=${callerObj._id} and receiver=${receiverObj._id}`);

            const missedPayload = {
              success: false,
              type: 'call_missed',
              callId: timedOutCall._id,
              reason: 'timeout',
              call: timedOutCall
            };

            io.to(`user_${callerObj._id.toString()}`).emit('call_missed', missedPayload);
            io.to(`user_${receiverObj._id.toString()}`).emit('call_missed', missedPayload);
          } else {
            AppLogger.info(`[Call Timeout] Call already handled (accepted/rejected/ended). callId=${callIdStr}`);
          }
        } catch (err: any) {
          AppLogger.error(`[Call Timeout Error] callId=${callIdStr}: ${err.message}`);
        } finally {
          callTimeouts.delete(callIdStr);
        }
      }, 45000);

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'initiate_call', data: callerPayload });
      }

      AppLogger.info(`[Socket Event: initiate_call] Call initiated. ID=${call._id}, roomId=${call.roomId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: initiate_call] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'initiate_call', error, 'Failed to initiate call', undefined, callback);
    }
  });

  // 2. Accept Incoming Call
  socket.on('accept_call', async (data: { callId: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: accept_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId } = data || {};
      if (!callId) {
        emitSocketError(socket, 'accept_call', 'callId is required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      clearCallTimeout(callId.toString().trim());

      const call = await callService.acceptCall(userId, callId);
      const callerId = call.callerId._id.toString();
      const receiverId = call.receiverId._id.toString();
      const callerPayload = { ...(await callService.buildCallScreenPayload(call, callerId)), success: true, type: 'call_accepted' };
      const hostPayload = { ...(await callService.buildCallScreenPayload(call, receiverId)), success: true, type: 'call_accepted' };

      io.to(`user_${callerId}`).emit('call_accepted', callerPayload);
      io.to(`user_${receiverId}`).emit('call_accepted', hostPayload);

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'accept_call', data: hostPayload });
      }

      AppLogger.info(`[Socket Event: accept_call] Call accepted. ID=${callId}, roomId=${call.roomId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: accept_call] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'accept_call', error, 'Failed to accept call', undefined, callback);
    }
  });

  // 3. Reject Incoming Call
  socket.on('reject_call', async (data: { callId: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: reject_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId } = data || {};
      if (!callId) {
        emitSocketError(socket, 'reject_call', 'callId is required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      clearCallTimeout(callId.toString().trim());

      const call = await callService.rejectCall(userId, callId);

      const callerId = (call.callerId as any)._id?.toString() || call.callerId.toString();
      const receiverId = (call.receiverId as any)._id?.toString() || call.receiverId.toString();
      const callerSummary = { ...(await callService.buildAfterCallSummary(call, callerId)), success: true, type: 'call_rejected' };
      const hostSummary = { ...(await callService.buildAfterCallSummary(call, receiverId)), success: true, type: 'call_rejected' };

      io.to(`user_${callerId}`).emit('call_rejected', callerSummary);
      io.to(`user_${receiverId}`).emit('call_rejected', hostSummary);

      if (typeof callback === 'function') {
        const viewerSummary = userId === callerId ? callerSummary : hostSummary;
        callback({ success: true, type: 'SUCCESS', event: 'reject_call', data: viewerSummary });
      }

      AppLogger.info(`[Socket Event: reject_call] Call rejected. ID=${callId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: reject_call] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'reject_call', error, 'Failed to reject call', undefined, callback);
    }
  });

  // 4. End Call
  socket.on('end_call', async (data: { callId: string }, callback?: any) => {
    AppLogger.info(`[Socket Event: end_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId } = data || {};
      if (!callId) {
        emitSocketError(socket, 'end_call', 'callId is required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      clearCallTimeout(callId.toString().trim());

      const call = await callService.endCall(userId, callId);
      const callerId = (call.callerId as any)?._id?.toString?.() || call.callerId?.toString?.();
      const receiverId = (call.receiverId as any)?._id?.toString?.() || call.receiverId?.toString?.();
      const callerSummary = { ...(await callService.buildAfterCallSummary(call, callerId)), success: true };
      const hostSummary = { ...(await callService.buildAfterCallSummary(call, receiverId)), success: true };

      if (call.status === 'cancelled') {
        callerSummary.type = 'call_cancelled';
        hostSummary.type = 'call_cancelled';
        socket.emit('call_cancelled', callerSummary);
        io.to(`user_${receiverId}`).emit('call_cancelled', hostSummary);
        AppLogger.info(`[Socket Event: end_call] Call cancelled by caller. ID=${callId}`);
      } else if (call.status === 'rejected') {
        callerSummary.type = 'call_ended';
        hostSummary.type = 'call_ended';
        socket.emit('call_ended', hostSummary);
        io.to(`user_${callerId}`).emit('call_ended', callerSummary);
        AppLogger.info(`[Socket Event: end_call] Call ended (rejected by receiver via end_call). ID=${callId}`);
      } else {
        callerSummary.type = 'call_ended';
        hostSummary.type = 'call_ended';
        io.to(`user_${callerId}`).emit('call_ended', callerSummary);
        io.to(`user_${receiverId}`).emit('call_ended', hostSummary);
        AppLogger.info(`[Socket Event: end_call] Call ended. ID=${callId}, duration=${call.duration}s`);

        const randomMatchService = Container.get(RandomMatchService);
        if (callerId) await randomMatchService.restoreHostIfNeeded(callerId, io);
        if (receiverId) await randomMatchService.restoreHostIfNeeded(receiverId, io);
      }

      if (typeof callback === 'function') {
        const viewerSummary = userId === callerId ? callerSummary : hostSummary;
        callback({ success: true, type: 'SUCCESS', event: 'end_call', data: viewerSummary });
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: end_call] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'end_call', error, 'Failed to end call', undefined, callback);
    }
  });

  // 5. Send Gift inside Call context
  socket.on('send_gift_in_call', async (data: { callId: string; giftId: string; quantity?: number }, callback?: any) => {
    AppLogger.info(`[Socket Event: send_gift_in_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId, giftId, quantity } = data || {};
      if (!callId || !giftId) {
        emitSocketError(socket, 'send_gift_in_call', 'callId and giftId are required', 'Validation failed', 'VALIDATION_FAILED', callback);
        return;
      }

      // 1. Fetch Call details
      const call = await callService.getCallDetails(userId, callId);

      // 2. Identify sender & receiver in this call
      const actualSenderId = userId;
      const actualReceiverId = call.callerId._id.toString() === userId
        ? call.receiverId._id.toString()
        : call.callerId._id.toString();

      const contextType = call.callType === 'voice' ? 'audio_call' : 'video_call';
      const parsedQuantity = quantity ? Number(quantity) : 1;

      // 3. Call GiftService to process transactions
      const result = await giftService.sendGift(
        actualSenderId,
        call.roomId,
        giftId,
        actualReceiverId,
        contextType,
        parsedQuantity
      );

      // 4. Emit event to both caller and receiver in call
      const payload = {
        success: true,
        type: 'gift_sent_in_call',
        callId,
        sender: result.sender,
        receiver: result.receiver,
        gift: result.gift,
        quantity: result.quantity,
        createdAt: new Date()
      };

      io.to(`user_${call.callerId._id}`).emit('gift_sent_in_call', payload);
      io.to(`user_${call.receiverId._id}`).emit('gift_sent_in_call', payload);

      if (typeof callback === 'function') {
        callback({ success: true, type: 'SUCCESS', event: 'send_gift_in_call', data: payload });
      }

      AppLogger.info(`[Socket Event: send_gift_in_call] Gift sent successfully in callId=${callId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: send_gift_in_call] Error for user ${userId}: ${error.message}`);
      emitSocketError(socket, 'send_gift_in_call', error, 'Failed to send gift in call', undefined, callback);
    }
  });
};
