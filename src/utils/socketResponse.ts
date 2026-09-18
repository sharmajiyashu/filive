import { Socket } from 'socket.io';
import AppLogger from '../api/loaders/logger';

export type SocketErrorType =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'FORBIDDEN'
  | 'BUSY'
  | 'BUSINESS_ERROR'
  | 'INTERNAL_ERROR';

export interface ISocketErrorPayload {
  success: false;
  type: SocketErrorType;
  event: string;
  code: string;
  message: string;
  error: string; // for backward compatibility with clients checking .error
  details?: any;
}

export interface ISocketSuccessPayload<T = any> {
  success: true;
  type: 'SUCCESS';
  event: string;
  data: T;
  message: string;
  [key: string]: any;
}

function inferErrorCodeAndType(message: string, customCode?: string): { type: SocketErrorType; code: string } {
  if (customCode) {
    let type: SocketErrorType = 'BUSINESS_ERROR';
    if (customCode.includes('VALIDATION') || customCode.includes('REQUIRED') || customCode.includes('INVALID')) {
      type = 'VALIDATION_ERROR';
    } else if (customCode.includes('COIN') || customCode.includes('BALANCE')) {
      type = 'INSUFFICIENT_BALANCE';
    } else if (customCode.includes('NOT_FOUND')) {
      type = 'NOT_FOUND';
    } else if (customCode.includes('BLOCKED') || customCode.includes('BANNED') || customCode.includes('FORBIDDEN')) {
      type = 'FORBIDDEN';
    } else if (customCode.includes('BUSY')) {
      type = 'BUSY';
    }
    return { type, code: customCode };
  }

  const lower = message.toLowerCase();

  if (lower.includes('required') || lower.includes('must be') || lower.includes('invalid format')) {
    return { type: 'VALIDATION_ERROR', code: 'VALIDATION_FAILED' };
  }
  if (lower.includes('insufficient') || lower.includes('not enough coin') || lower.includes('need at least')) {
    return { type: 'INSUFFICIENT_BALANCE', code: 'INSUFFICIENT_COINS' };
  }
  if (lower.includes('not found') || lower.includes('does not exist')) {
    return { type: 'NOT_FOUND', code: 'RESOURCE_NOT_FOUND' };
  }
  if (lower.includes('blocked') || lower.includes('banned') || lower.includes('restricted') || lower.includes('not allowed')) {
    return { type: 'FORBIDDEN', code: 'ACTION_FORBIDDEN' };
  }
  if (lower.includes('busy') || lower.includes('another call')) {
    return { type: 'BUSY', code: 'USER_BUSY' };
  }
  if (lower.includes('auth') || lower.includes('unauthorized') || lower.includes('token')) {
    return { type: 'AUTHENTICATION_ERROR', code: 'UNAUTHORIZED' };
  }

  return { type: 'BUSINESS_ERROR', code: 'OPERATION_FAILED' };
}

/**
 * Emit a structured error payload across standard socket error channels
 */
export function emitSocketError(
  socket: Socket,
  event: string,
  error: any,
  defaultMessage: string = 'Operation failed',
  code?: string,
  ackCallback?: (res: any) => void
): ISocketErrorPayload {
  const message =
    typeof error === 'string'
      ? error
      : error?.message || defaultMessage;

  const { type, code: resolvedCode } = inferErrorCodeAndType(message, code);

  const payload: ISocketErrorPayload = {
    success: false,
    type,
    event,
    code: resolvedCode,
    message,
    error: message,
    details: error && typeof error === 'object' && error.details ? error.details : undefined
  };

  AppLogger.warn(`[Socket Error] event="${event}", code="${resolvedCode}", type="${type}", message="${message}"`);

  // 1. Standard error_message listener with full payload
  socket.emit('error_message', payload);

  // 2. Global socket_error listener
  socket.emit('socket_error', payload);

  // 3. Event-specific error listener e.g. join_live_error
  socket.emit(`${event}_error`, payload);

  // 4. Acknowledgement callback if provided
  if (typeof ackCallback === 'function') {
    try {
      ackCallback(payload);
    } catch (e: any) {
      AppLogger.error(`[Socket Error] Error in ackCallback: ${e?.message}`);
    }
  }

  return payload;
}

/**
 * Emit a structured success payload to socket
 */
export function emitSocketSuccess<T = any>(
  socket: Socket,
  event: string,
  data: T,
  message: string = 'Success',
  ackCallback?: (res: any) => void
): ISocketSuccessPayload<T> {
  const baseData = data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  const payload: ISocketSuccessPayload<T> = {
    ...baseData,
    success: true,
    type: 'SUCCESS',
    event,
    data,
    message
  };

  socket.emit(event, payload);

  if (typeof ackCallback === 'function') {
    try {
      ackCallback(payload);
    } catch (e: any) {
      AppLogger.error(`[Socket Success] Error in ackCallback: ${e?.message}`);
    }
  }

  return payload;
}
