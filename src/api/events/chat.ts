import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuthMiddleware';
import { ChatService } from '../../services/app/ChatService';
import { ChatMessageService } from '../../services/app/ChatMessageService';
import Container from 'typedi';
import AppLogger from '../loaders/logger';
import { emitSocketError } from '../../utils/socketResponse';

interface Base64Attachment {
    data?: string; // base64 string (can be data URL or raw base64)
    files?: string; // Alternative property name for base64 data URL
}

interface ChatMessageData {
    chatId?: string;
    targetUserId?: string; // Added for Instag style direct messaging
    message?: string;
    replyToId?: string; // Added for reply functionality
    attachments?: Express.Multer.File[] | Base64Attachment[];
}

interface JoinChatData {
    chatId: string;
}

interface TypingData {
    chatId: string;
    isTyping: boolean;
}

export default (socket: AuthenticatedSocket, io: Server) => {
    const chatService = Container.get(ChatService);
    const chatMessageService = Container.get(ChatMessageService);

    if (!socket.user) {
        socket.disconnect();
        return;
    }

    const userId = socket.user.id;

    AppLogger.info('Socket connected:', socket.id, 'User:', userId);

    // Join room for a chat session
    socket.on('join_chat', async (data: JoinChatData, callback?: any) => {
        if (!data?.chatId) {
            emitSocketError(socket, 'join_chat', 'chatId is required', 'Validation failed', 'CHAT_ID_REQUIRED', callback);
            return;
        }
        socket.join(`chat_${data.chatId}`);
        AppLogger.info(`User ${userId} joined chat_${data.chatId}`);
        try {
            // Automatically mark chat messages as read when user joins the chat
            await chatMessageService.markChatAsRead(userId, data.chatId);
            socket.to(`chat_${data.chatId}`).emit('chat_read_update', {
                chatId: data.chatId,
                userId: userId,
                success: true
            });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'join_chat', data: { chatId: data.chatId } });
            }
        } catch (error: any) {
            AppLogger.error(`Error marking chat read on join for user ${userId}:`, error);
        }
    });

    // Retrieve user's inbox / chat threads
    socket.on('get_chats', async (data: { page?: number; limit?: number; filter?: 'online' | 'frequent' | 'follow'; search?: string }, callback?: any) => {
        try {
            const page = Number(data?.page ?? 1);
            const limit = Number(data?.limit ?? 20);
            const chats = await chatService.getUserChats(userId, page, limit, data?.filter, data?.search);
            socket.emit('user_chats', { success: true, type: 'user_chats', chats });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'get_chats', data: chats });
            }
        } catch (error: any) {
            emitSocketError(socket, 'get_chats', error, 'Failed to load chats', undefined, callback);
        }
    });

    // Create a new chat session (private or group)
    socket.on('create_chat', async (data: { type: 'private' | 'group'; name?: string; participants: string[]; mediaId?: string }, callback?: any) => {
        try {
            let chat;
            if (data?.type === 'private') {
                if (!data.participants || data.participants.length === 0) {
                    emitSocketError(socket, 'create_chat', 'Private chat requires a target participant', 'Validation failed', 'TARGET_PARTICIPANT_REQUIRED', callback);
                    return;
                }
                const targetUserId = data.participants[0];
                chat = await chatService.getOrCreateSingleChat(userId, targetUserId);
            } else {
                if (!data?.name) {
                    emitSocketError(socket, 'create_chat', 'Group name is required', 'Validation failed', 'GROUP_NAME_REQUIRED', callback);
                    return;
                }
                chat = await chatService.createChat(userId, {
                    name: data.name,
                    type: 'group',
                    participants: data.participants,
                    mediaId: data.mediaId
                });
            }

            if (!chat) {
                emitSocketError(socket, 'create_chat', 'Failed to create or retrieve chat', 'Operation failed', 'CHAT_CREATION_FAILED', callback);
                return;
            }

            // Join room for the creator socket
            socket.join(`chat_${chat._id}`);

            const payload = { success: true, type: 'chat_created', chat };
            // Emit to creator
            socket.emit('chat_created', payload);

            // Notify all participants who are online (they will be in user_${participantId} room)
            const allParticipants = [userId, ...data.participants];
            for (const participantId of allParticipants) {
                io.to(`user_${participantId}`).emit('chat_created', payload);
            }

            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'create_chat', data: chat });
            }
        } catch (error: any) {
            emitSocketError(socket, 'create_chat', error, 'Chat creation failed', undefined, callback);
        }
    });

    // Send a message
    socket.on('send_message', async (data: ChatMessageData, callback?: any) => {
        try {
            let chatId = data?.chatId;

            // Handle Instag style message sending directly with targetUserId
            if (!chatId && data?.targetUserId) {
                const chat = await chatService.getOrCreateSingleChat(userId, data.targetUserId);
                if (!chat) {
                    emitSocketError(socket, 'send_message', 'Failed to start chat with the user', 'Operation failed', 'CHAT_NOT_FOUND', callback);
                    return;
                }
                chatId = chat._id.toString();

                // Make sure sender joins the new room
                socket.join(`chat_${chatId}`);

                // Notify both users about the newly active chat
                const chatCreatedPayload = { success: true, type: 'chat_created', chat };
                io.to(`user_${userId}`).emit('chat_created', chatCreatedPayload);
                io.to(`user_${data.targetUserId}`).emit('chat_created', chatCreatedPayload);
            }

            if (!chatId) {
                emitSocketError(socket, 'send_message', 'chatId or targetUserId is required', 'Validation failed', 'CHAT_ID_REQUIRED', callback);
                return;
            }

            let convertedAttachments: Express.Multer.File[] | undefined;
            if (data.attachments && data.attachments.length > 0) {
                convertedAttachments = data.attachments.map(att => {
                    if ('buffer' in att && 'mimetype' in att && att.mimetype) {
                        return att as Express.Multer.File;
                    }
                    if ('data' in att || 'files' in att) {
                        return convertBase64ToMulterFile(att as Base64Attachment);
                    }
                    throw new Error('Invalid attachment format');
                });
            }

            const savedMessage = await chatMessageService.createMessage(
                userId,
                {
                    chatId: chatId,
                    message: data.message,
                    replyToId: data.replyToId
                },
                convertedAttachments
            );

            // Broadcast the new message to the room
            const messageData = savedMessage && (savedMessage as any).toObject ? (savedMessage as any).toObject() : savedMessage;
            const messagePayload = { success: true, type: 'new_message', ...messageData };
            io.to(`chat_${chatId}`).emit('new_message', messagePayload);

            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'send_message', data: savedMessage });
            }
        } catch (error: any) {
            emitSocketError(socket, 'send_message', error, 'Message send failed', undefined, callback);
        }
    });

    // Retrieve conversation history
    socket.on(
        'get_messages',
        async (data: { chatId: string; page?: number; limit?: number }, callback?: any) => {
            try {
                const page = Number(data?.page ?? 1);
                const limit = Number(data?.limit ?? 50);

                if (!data?.chatId) {
                    emitSocketError(socket, 'get_messages', 'chatId is required', 'Validation failed', 'CHAT_ID_REQUIRED', callback);
                    return;
                }

                const messages = await chatMessageService.getConversation(
                    userId,
                    data.chatId,
                    page,
                    limit
                );

                socket.emit('chat_messages', { success: true, type: 'chat_messages', ...messages });
                if (typeof callback === 'function') {
                    callback({ success: true, type: 'SUCCESS', event: 'get_messages', data: messages });
                }
            } catch (error: any) {
                emitSocketError(socket, 'get_messages', error, 'Failed to load messages', undefined, callback);
            }
        }
    );

    // Handle user typing
    socket.on('typing', (data: TypingData) => {
        if (!data?.chatId) return;
        socket.to(`chat_${data.chatId}`).emit('user_typing', {
            userId,
            isTyping: data.isTyping
        });
    });

    // Mark single message as seen
    socket.on('message_seen', async (data: { chatId: string; messageId: string }) => {
        if (!data?.chatId || !data?.messageId) return;
        try {
            await chatMessageService.markAsRead(userId, data.messageId);
            socket.to(`chat_${data.chatId}`).emit('seen_update', {
                userId,
                messageId: data.messageId
            });
        } catch (error: any) {
            AppLogger.error(`Error marking message ${data.messageId} as read:`, error);
        }
    });

    // Mark whole chat as read
    socket.on('mark_chat_read', async (data: { chatId: string }, callback?: any) => {
        if (!data?.chatId) {
            emitSocketError(socket, 'mark_chat_read', 'chatId is required', 'Validation failed', 'CHAT_ID_REQUIRED', callback);
            return;
        }
        try {
            await chatMessageService.markChatAsRead(userId, data.chatId);
            socket.to(`chat_${data.chatId}`).emit('chat_read_update', {
                chatId: data.chatId,
                userId: userId
            });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'mark_chat_read' });
            }
        } catch (error: any) {
            emitSocketError(socket, 'mark_chat_read', error, 'Failed to mark chat as read', undefined, callback);
        }
    });

    // Add reaction (e.g. like) to a message
    socket.on('add_reaction', async (data: { chatId: string; messageId: string; reaction: string }, callback?: any) => {
        if (!data?.chatId || !data?.messageId || !data?.reaction) {
            emitSocketError(socket, 'add_reaction', 'chatId, messageId, and reaction are required', 'Validation failed', 'VALIDATION_FAILED', callback);
            return;
        }
        try {
            await chatMessageService.addReaction(userId, data.messageId, data.reaction);
            io.to(`chat_${data.chatId}`).emit('reaction_updated', {
                messageId: data.messageId,
                userId,
                reaction: data.reaction,
                action: 'add',
                success: true
            });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'add_reaction' });
            }
        } catch (error: any) {
            emitSocketError(socket, 'add_reaction', error, 'Failed to add reaction', undefined, callback);
        }
    });

    // Remove reaction from a message
    socket.on('remove_reaction', async (data: { chatId: string; messageId: string; reaction: string }, callback?: any) => {
        if (!data?.chatId || !data?.messageId || !data?.reaction) {
            emitSocketError(socket, 'remove_reaction', 'chatId, messageId, and reaction are required', 'Validation failed', 'VALIDATION_FAILED', callback);
            return;
        }
        try {
            await chatMessageService.removeReaction(userId, data.messageId, data.reaction);
            io.to(`chat_${data.chatId}`).emit('reaction_updated', {
                messageId: data.messageId,
                userId,
                reaction: data.reaction,
                action: 'remove',
                success: true
            });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'remove_reaction' });
            }
        } catch (error: any) {
            emitSocketError(socket, 'remove_reaction', error, 'Failed to remove reaction', undefined, callback);
        }
    });

    // Helper like event (defaults to Red Heart emoji)
    socket.on('like_message', async (data: { chatId: string; messageId: string }, callback?: any) => {
        if (!data?.chatId || !data?.messageId) {
            emitSocketError(socket, 'like_message', 'chatId and messageId are required', 'Validation failed', 'VALIDATION_FAILED', callback);
            return;
        }
        try {
            const reaction = '❤️';
            await chatMessageService.addReaction(userId, data.messageId, reaction);
            io.to(`chat_${data.chatId}`).emit('reaction_updated', {
                messageId: data.messageId,
                userId,
                reaction,
                action: 'add',
                success: true
            });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'like_message' });
            }
        } catch (error: any) {
            emitSocketError(socket, 'like_message', error, 'Failed to like message', undefined, callback);
        }
    });

    // Helper unlike event (defaults to Red Heart emoji removal)
    socket.on('unlike_message', async (data: { chatId: string; messageId: string }, callback?: any) => {
        if (!data?.chatId || !data?.messageId) {
            emitSocketError(socket, 'unlike_message', 'chatId and messageId are required', 'Validation failed', 'VALIDATION_FAILED', callback);
            return;
        }
        try {
            const reaction = '❤️';
            await chatMessageService.removeReaction(userId, data.messageId, reaction);
            io.to(`chat_${data.chatId}`).emit('reaction_updated', {
                messageId: data.messageId,
                userId,
                reaction,
                action: 'remove',
                success: true
            });
            if (typeof callback === 'function') {
                callback({ success: true, type: 'SUCCESS', event: 'unlike_message' });
            }
        } catch (error: any) {
            emitSocketError(socket, 'unlike_message', error, 'Failed to unlike message', undefined, callback);
        }
    });

    socket.on('disconnect', () => {
        AppLogger.info('Socket disconnected:', socket.id);
    });
};

function convertBase64ToMulterFile(attachment: Base64Attachment): Express.Multer.File {
    const base64String = attachment.data || attachment.files || '';

    let base64Data: string;
    let mimetype: string;

    if (base64String.startsWith('data:')) {
        const parts = base64String.split(',');
        const header = parts[0];
        base64Data = parts[1] || base64String;

        const mimeMatch = header.match(/data:([^;]+)/);
        mimetype = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    } else {
        base64Data = base64String;
        const buffer = Buffer.from(base64Data, 'base64');
        mimetype = detectMimeTypeFromBuffer(buffer);
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const extension = getExtensionFromMimeType(mimetype);
    const filename = `file_${Date.now()}.${extension}`;

    return {
        fieldname: 'media',
        originalname: filename,
        encoding: '7bit',
        mimetype: mimetype,
        buffer: buffer,
        size: buffer.length
    } as Express.Multer.File;
}

function detectMimeTypeFromBuffer(buffer: Buffer): string {
    if (buffer.length >= 4) {
        if (
            buffer[0] === 0x25 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x44 &&
            buffer[3] === 0x46
        ) {
            return 'application/pdf';
        }
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            return 'image/jpeg';
        }
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
            return 'image/png';
        }
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
            return 'image/gif';
        }
        if (
            buffer.length >= 12 &&
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP'
        ) {
            return 'image/webp';
        }
        if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
            return 'video/mp4';
        }
        if (
            buffer.length >= 12 &&
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'AVI '
        ) {
            return 'video/avi';
        }
    }
    return 'application/octet-stream';
}

function getExtensionFromMimeType(mimetype: string): string {
    const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/avi': 'avi',
        'video/mov': 'mov',
        'video/wmv': 'wmv',
        'video/flv': 'flv',
        'video/webm': 'webm',
        'application/pdf': 'pdf'
    };
    return mimeToExt[mimetype] || 'bin';
}
