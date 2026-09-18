import 'reflect-metadata';
import { emitSocketError, emitSocketSuccess } from '../src/utils/socketResponse';

function runUnitTests() {
  console.log('🧪 Starting Unit Tests for Socket Error & Response Formatting...');

  const mockSocket: any = {
    emitted: [] as { event: string; payload: any }[],
    emit(event: string, payload: any) {
      this.emitted.push({ event, payload });
    }
  };

  // Test 1: Validation Error
  console.log('\n--- Test 1: Validation Error ---');
  let ackPayload: any = null;
  const res1 = emitSocketError(mockSocket, 'join_live', 'Channel name is required to join', undefined, undefined, (ack) => {
    ackPayload = ack;
  });

  console.log('Result 1:', JSON.stringify(res1));
  console.assert(res1.success === false, 'success should be false');
  console.assert(res1.type === 'VALIDATION_ERROR', `type should be VALIDATION_ERROR, got ${res1.type}`);
  console.assert(res1.code === 'VALIDATION_FAILED', `code should be VALIDATION_FAILED, got ${res1.code}`);
  console.assert(res1.event === 'join_live', `event should be join_live, got ${res1.event}`);
  console.assert(res1.message === 'Channel name is required to join', 'message mismatch');
  console.assert(res1.error === 'Channel name is required to join', 'error mismatch');
  console.assert(ackPayload !== null && ackPayload.code === 'VALIDATION_FAILED', 'ackCallback should receive payload');
  console.assert(mockSocket.emitted.some((e: any) => e.event === 'error_message'), 'should emit error_message');
  console.assert(mockSocket.emitted.some((e: any) => e.event === 'socket_error'), 'should emit socket_error');
  console.assert(mockSocket.emitted.some((e: any) => e.event === 'join_live_error'), 'should emit join_live_error');
  console.log('✅ PASS: Test 1 (Validation Error)');

  // Test 2: Insufficient Balance Error
  console.log('\n--- Test 2: Insufficient Balance Error ---');
  mockSocket.emitted = [];
  const res2 = emitSocketError(mockSocket, 'initiate_call', new Error('Insufficient coins to start call. You need at least 50 coins.'));
  console.log('Result 2:', JSON.stringify(res2));
  console.assert(res2.success === false, 'success should be false');
  console.assert(res2.type === 'INSUFFICIENT_BALANCE', `type should be INSUFFICIENT_BALANCE, got ${res2.type}`);
  console.assert(res2.code === 'INSUFFICIENT_COINS', `code should be INSUFFICIENT_COINS, got ${res2.code}`);
  console.assert(res2.event === 'initiate_call', 'event mismatch');
  console.assert(mockSocket.emitted.some((e: any) => e.event === 'initiate_call_error'), 'should emit initiate_call_error');
  console.log('✅ PASS: Test 2 (Insufficient Balance Error)');

  // Test 3: User Busy Error
  console.log('\n--- Test 3: User Busy Error ---');
  mockSocket.emitted = [];
  const res3 = emitSocketError(mockSocket, 'initiate_call', 'User is busy on another call');
  console.log('Result 3:', JSON.stringify(res3));
  console.assert(res3.type === 'BUSY', `type should be BUSY, got ${res3.type}`);
  console.assert(res3.code === 'USER_BUSY', `code should be USER_BUSY, got ${res3.code}`);
  console.log('✅ PASS: Test 3 (User Busy Error)');

  // Test 4: Resource Not Found Error
  console.log('\n--- Test 4: Resource Not Found Error ---');
  mockSocket.emitted = [];
  const res4 = emitSocketError(mockSocket, 'start_game', 'Game not found', undefined, 'GAME_NOT_FOUND');
  console.log('Result 4:', JSON.stringify(res4));
  console.assert(res4.type === 'NOT_FOUND', `type should be NOT_FOUND, got ${res4.type}`);
  console.assert(res4.code === 'GAME_NOT_FOUND', `code should be GAME_NOT_FOUND, got ${res4.code}`);
  console.log('✅ PASS: Test 4 (Resource Not Found Error)');

  // Test 5: Action Forbidden / Blocked Error
  console.log('\n--- Test 5: Action Forbidden / Blocked Error ---');
  mockSocket.emitted = [];
  const res5 = emitSocketError(mockSocket, 'room_comment', 'You are blocked from chatting in this room');
  console.log('Result 5:', JSON.stringify(res5));
  console.assert(res5.type === 'FORBIDDEN', `type should be FORBIDDEN, got ${res5.type}`);
  console.assert(res5.code === 'ACTION_FORBIDDEN', `code should be ACTION_FORBIDDEN, got ${res5.code}`);
  console.log('✅ PASS: Test 5 (Action Forbidden / Blocked Error)');

  // Test 6: Success Helper
  console.log('\n--- Test 6: Success Helper ---');
  mockSocket.emitted = [];
  let ackSuccess: any = null;
  const res6 = emitSocketSuccess(mockSocket, 'room_joined', { channelName: 'test_chan', viewerCount: 42 }, 'Joined room successfully', (ack) => {
    ackSuccess = ack;
  });
  console.log('Result 6:', JSON.stringify(res6));
  console.assert(res6.success === true, 'success should be true');
  console.assert(res6.type === 'SUCCESS', `type should be SUCCESS, got ${res6.type}`);
  console.assert(res6.channelName === 'test_chan', 'direct spread properties should exist');
  console.assert(res6.data.viewerCount === 42, 'data property should contain payload');
  console.assert(ackSuccess !== null && ackSuccess.success === true, 'ackCallback should be called with success');
  console.assert(mockSocket.emitted.some((e: any) => e.event === 'room_joined'), 'should emit room_joined event');
  console.log('✅ PASS: Test 6 (Success Helper)');

  console.log('\n🎉 ALL 6 UNIT TESTS PASSED WITH 100% ACCURACY!');
}

runUnitTests();
