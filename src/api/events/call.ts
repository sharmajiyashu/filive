import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { CallService } from '../../services/app/CallService';
import { GiftService } from '../../services/app/GiftService';
import Container from 'typedi';
import AppLogger from '../loaders/logger';

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

      const call = await callService.rejectCall(userId, callId);

      // Notify caller that call was rejected
      io.to(`user_${call.callerId}`).emit('call_rejected', { callId: call._id });

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

      const call = await callService.endCall(userId, callId);

      // Notify both parties that the call has ended
      io.to(`user_${call.callerId._id}`).emit('call_ended', call);
      io.to(`user_${call.receiverId._id}`).emit('call_ended', call);

      AppLogger.info(`[Socket Event: end_call] Call ended. ID=${callId}, duration=${call.duration}s`);
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
