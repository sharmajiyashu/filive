import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { CallService } from '../../services/app/CallService';
import { GiftService } from '../../services/app/GiftService';
import { RandomMatchService } from '../../services/app/RandomMatchService';
import Container from 'typedi';
import AppLogger from '../loaders/logger';

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
  socket.on('initiate_call', async (data: { receiverId: string; callType: 'voice' | 'video' }) => {
    AppLogger.info(`[Socket Event: initiate_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { receiverId, callType } = data;
      if (!receiverId || !callType) {
        socket.emit('error_message', 'receiverId and callType are required');
        return;
      }

      const call = await callService.initiateCall(userId, receiverId, callType);

      // Notify caller that call is successfully initiated
      socket.emit('call_initiated', call);

      const callerUser = call.callerId as any;

      // Notify receiver about incoming call request
      io.to(`user_${receiverId}`).emit('incoming_call', {
        callId: call._id,
        caller: {
          id: callerUser?._id || socket.user?.id,
          name: callerUser?.name || socket.user?.fullName,
          profileImage: callerUser?.profileImage || null,
        },
        callType,
        roomId: call.roomId,
      });

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

            // Notify both caller and receiver that call missed due to timeout/no-answer
            io.to(`user_${callerObj._id.toString()}`).emit('call_missed', {
              callId: timedOutCall._id,
              reason: 'timeout',
              call: timedOutCall
            });
            io.to(`user_${receiverObj._id.toString()}`).emit('call_missed', {
              callId: timedOutCall._id,
              reason: 'timeout',
              call: timedOutCall
            });
          } else {
            AppLogger.info(`[Call Timeout] Call already handled (accepted/rejected/ended). callId=${callIdStr}`);
          }
        } catch (err: any) {
          AppLogger.error(`[Call Timeout Error] callId=${callIdStr}: ${err.message}`);
        } finally {
          callTimeouts.delete(callIdStr);
        }
      }, 45000);

      AppLogger.info(`[Socket Event: initiate_call] Call initiated. ID=${call._id}, roomId=${call.roomId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: initiate_call] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to initiate call');
    }
  });

  // 2. Accept Incoming Call
  socket.on('accept_call', async (data: { callId: string }) => {
    AppLogger.info(`[Socket Event: accept_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId } = data;
      if (!callId) {
        socket.emit('error_message', 'callId is required');
        return;
      }

      clearCallTimeout(callId.toString().trim());

      const call = await callService.acceptCall(userId, callId);

      // Notify both parties that the call has been accepted and send the Zego token/roomId
      io.to(`user_${call.callerId._id}`).emit('call_accepted', call);
      io.to(`user_${call.receiverId._id}`).emit('call_accepted', call);

      AppLogger.info(`[Socket Event: accept_call] Call accepted. ID=${callId}, roomId=${call.roomId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: accept_call] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to accept call');
    }
  });

  // 3. Reject Incoming Call
  socket.on('reject_call', async (data: { callId: string }) => {
    AppLogger.info(`[Socket Event: reject_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId } = data;
      if (!callId) {
        socket.emit('error_message', 'callId is required');
        return;
      }

      clearCallTimeout(callId.toString().trim());

      const call = await callService.rejectCall(userId, callId);

      const callerId = (call.callerId as any)._id?.toString() || call.callerId.toString();
      const receiverId = (call.receiverId as any)._id?.toString() || call.receiverId.toString();

      // Notify both caller and receiver that call was rejected
      io.to(`user_${callerId}`).emit('call_rejected', { callId: call._id, call });
      io.to(`user_${receiverId}`).emit('call_rejected', { callId: call._id, call });

      AppLogger.info(`[Socket Event: reject_call] Call rejected. ID=${callId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: reject_call] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to reject call');
    }
  });

  // 4. End Call
  socket.on('end_call', async (data: { callId: string }) => {
    AppLogger.info(`[Socket Event: end_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId } = data;
      if (!callId) {
        socket.emit('error_message', 'callId is required');
        return;
      }

      clearCallTimeout(callId.toString().trim());

      const call = await callService.endCall(userId, callId);

      // If caller cancelled before receiver answered → emit call_cancelled to receiver
      if (call.status === 'cancelled') {
        socket.emit('call_cancelled', { callId: call._id, call });
        io.to(`user_${call.receiverId.toString()}`).emit('call_cancelled', { callId: call._id, call });
        AppLogger.info(`[Socket Event: end_call] Call cancelled by caller. ID=${callId}`);
      } else if (call.status === 'rejected') {
        // Receiver dismissed the incoming call via end_call
        socket.emit('call_ended', call);
        io.to(`user_${call.callerId.toString()}`).emit('call_ended', call);
        AppLogger.info(`[Socket Event: end_call] Call ended (rejected by receiver via end_call). ID=${callId}`);
      } else {
        // Active call ended normally — notify both parties
        io.to(`user_${(call.callerId as any)._id || call.callerId}`).emit('call_ended', call);
        io.to(`user_${(call.receiverId as any)._id || call.receiverId}`).emit('call_ended', call);
        AppLogger.info(`[Socket Event: end_call] Call ended. ID=${callId}, duration=${call.duration}s`);

        const randomMatchService = Container.get(RandomMatchService);
        const callerId = (call.callerId as any)?._id?.toString?.() || call.callerId?.toString?.();
        const receiverId = (call.receiverId as any)?._id?.toString?.() || call.receiverId?.toString?.();
        if (callerId) await randomMatchService.restoreHostIfNeeded(callerId, io);
        if (receiverId) await randomMatchService.restoreHostIfNeeded(receiverId, io);
      }
    } catch (error: any) {
      AppLogger.error(`[Socket Event: end_call] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to end call');
    }
  });

  // 5. Send Gift inside Call context
  socket.on('send_gift_in_call', async (data: { callId: string; giftId: string; quantity?: number }) => {
    AppLogger.info(`[Socket Event: send_gift_in_call] Entered. userId=${userId}, data=${JSON.stringify(data)}`);
    try {
      const { callId, giftId, quantity } = data;
      if (!callId || !giftId) {
        socket.emit('error_message', 'callId and giftId are required');
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
        callId,
        sender: result.sender,
        receiver: result.receiver,
        gift: result.gift,
        quantity: result.quantity,
        createdAt: new Date()
      };

      io.to(`user_${call.callerId._id}`).emit('gift_sent_in_call', payload);
      io.to(`user_${call.receiverId._id}`).emit('gift_sent_in_call', payload);

      AppLogger.info(`[Socket Event: send_gift_in_call] Gift sent successfully in callId=${callId}`);
    } catch (error: any) {
      AppLogger.error(`[Socket Event: send_gift_in_call] Error for user ${userId}: ${error.message}`);
      socket.emit('error_message', error.message || 'Failed to send gift in call');
    }
  });
};
