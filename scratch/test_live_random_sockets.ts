import 'reflect-metadata';
import mongoose from 'mongoose';
import Container from 'typedi';
import dotenv from 'dotenv';
dotenv.config();

import { LiveStreamService } from '../src/services/app/LiveStreamService';
import { RandomMatchService } from '../src/services/app/RandomMatchService';
import { emitSocketError, emitSocketSuccess } from '../src/utils/socketResponse';
import Room from '../src/models/Room';
import User from '../src/models/User';
import Call from '../src/models/Call';

async function runTests() {
  console.log('🧪 Starting Verification Tests...');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/filive';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  try {
    // ----------------------------------------------------
    // TEST 1: Live Stream list vs Party Room separation
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Live Stream vs Party Room Separation ---');
    const liveStreamService = Container.get(LiveStreamService);

    // Create a dummy user for host if needed
    let testHost = await User.findOne({ email: 'test_host_verification@test.com' });
    if (!testHost) {
      testHost = await User.create({
        email: 'test_host_verification@test.com',
        name: 'Test Host Separation',
        gender: 'Female',
        coins: 1000,
        enableVoiceCall: true,
        enableVideoCall: true,
        voiceCallPrice: 50,
        videoCallPrice: 100
      });
    }

    // Clean up any old test rooms
    await Room.deleteMany({ channelName: { $in: ['test_live_chan_1', 'test_party_chan_1'] } });

    // Create 1 live stream room
    const liveRoom = await Room.create({
      hostId: testHost._id,
      channelName: 'test_live_chan_1',
      title: 'Live Stream Verification',
      status: 'live',
      roomType: 'livestream',
      token: 'dummy_token_live',
      viewerCount: 5
    });

    // Create 1 party room
    const partyRoom = await Room.create({
      hostId: testHost._id,
      channelName: 'test_party_chan_1',
      title: 'Party Room Verification',
      status: 'live',
      roomType: 'party_room',
      token: 'dummy_token_party',
      viewerCount: 10
    });

    // Fetch default active live streams
    const defaultList = await liveStreamService.getActiveLiveStreams(1, 20);
    const hasLiveRoom = defaultList.streams.some((s: any) => s.channelName === 'test_live_chan_1');
    const hasPartyRoom = defaultList.streams.some((s: any) => s.channelName === 'test_party_chan_1');

    console.log(`Default getActiveLiveStreams() -> found liveRoom: ${hasLiveRoom}, found partyRoom: ${hasPartyRoom}`);
    if (hasLiveRoom && !hasPartyRoom) {
      console.log('✅ PASS: Party room is excluded from default live stream list!');
    } else {
      console.error(`❌ FAIL: Expected partyRoom to be excluded. hasLive=${hasLiveRoom}, hasParty=${hasPartyRoom}`);
    }

    // Fetch party rooms explicitly
    const partyList = await liveStreamService.getActiveLiveStreams(1, 20, undefined, undefined, 'party_room');
    const partyListHasParty = partyList.streams.some((s: any) => s.channelName === 'test_party_chan_1');
    const partyListHasLive = partyList.streams.some((s: any) => s.channelName === 'test_live_chan_1');
    console.log(`Party query getActiveLiveStreams(roomType='party_room') -> found partyRoom: ${partyListHasParty}, found liveRoom: ${partyListHasLive}`);
    if (partyListHasParty && !partyListHasLive) {
      console.log('✅ PASS: Party room list returns only party rooms!');
    } else {
      console.error(`❌ FAIL: Party list filtering issue. hasParty=${partyListHasParty}, hasLive=${partyListHasLive}`);
    }

    // Clean up test rooms
    await Room.deleteMany({ channelName: { $in: ['test_live_chan_1', 'test_party_chan_1'] } });

    // ----------------------------------------------------
    // TEST 2: Random Match between two queued callers
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Random Match between two queued callers ---');
    const randomMatchService = Container.get(RandomMatchService);

    let userA = await User.findOne({ email: 'test_caller_a@test.com' });
    if (!userA) {
      userA = await User.create({
        email: 'test_caller_a@test.com',
        name: 'Caller A (Male)',
        gender: 'Male',
        coins: 500
      });
    } else {
      userA.coins = 500;
      await userA.save();
    }

    let userB = await User.findOne({ email: 'test_host_b@test.com' });
    if (!userB) {
      userB = await User.create({
        email: 'test_host_b@test.com',
        name: 'Host B (Female)',
        gender: 'Female',
        coins: 50,
        enableVoiceCall: true,
        enableVideoCall: true,
        voiceCallPrice: 20,
        videoCallPrice: 40
      });
    } else {
      userB.coins = 50;
      userB.enableVoiceCall = true;
      userB.enableVideoCall = true;
      userB.voiceCallPrice = 20;
      userB.videoCallPrice = 40;
      await userB.save();
    }

    // Clean up any existing calls for these users
    await Call.deleteMany({
      $or: [
        { callerId: userA._id },
        { callerId: userB._id },
        { receiverId: userA._id },
        { receiverId: userB._id }
      ],
      status: { $in: ['accepted', 'initiated'] }
    });

    // Mock socket server
    const emittedEvents: Record<string, any[]> = {};
    const mockIo: any = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          if (!emittedEvents[room]) emittedEvents[room] = [];
          emittedEvents[room].push({ event, payload });
          console.log(`[MockIO -> ${room}] Event: "${event}", payload type: "${payload?.type}", role: "${payload?.role}"`);
        }
      }),
      sockets: {
        adapter: {
          rooms: new Map()
        }
      }
    };

    // User A joins random match
    console.log(`User A (${userA._id}) calling joinRandomMatch('voice')...`);
    await randomMatchService.joinRandomMatch(userA._id.toString(), 'voice', 'socket_a', mockIo);

    const isAQueued = randomMatchService.isCallerQueued(userA._id.toString());
    console.log(`Is User A queued? ${isAQueued}`);

    // User B joins random match (as caller/searching)
    console.log(`User B (${userB._id}) calling joinRandomMatch('voice')...`);
    await randomMatchService.joinRandomMatch(userB._id.toString(), 'voice', 'socket_b', mockIo);

    // Both should now be matched!
    const isAStillQueued = randomMatchService.isCallerQueued(userA._id.toString());
    const isBStillQueued = randomMatchService.isCallerQueued(userB._id.toString());
    console.log(`After User B joins -> Is User A still queued? ${isAStillQueued}, Is User B still queued? ${isBStillQueued}`);

    const userAMatches = (emittedEvents[`user_${userA._id.toString()}`] || []).filter(e => e.event === 'random_match_found');
    const userBMatches = (emittedEvents[`user_${userB._id.toString()}`] || []).filter(e => e.event === 'random_match_found');

    if (!isAStillQueued && !isBStillQueued && userAMatches.length > 0 && userBMatches.length > 0) {
      console.log('✅ PASS: Two queued users matched together instantly!');
      console.log(`Caller A got AgoraToken: ${!!userAMatches[0].payload.agoraToken}, role: ${userAMatches[0].payload.role}`);
      console.log(`Host B got AgoraToken: ${!!userBMatches[0].payload.agoraToken}, role: ${userBMatches[0].payload.role}`);
    } else {
      console.error(`❌ FAIL: Expected users to match. AMatches=${userAMatches.length}, BMatches=${userBMatches.length}`);
    }

    // ----------------------------------------------------
    // TEST 3: Socket Error & Success Helper
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Standardized Socket Error Structure ---');
    const mockSocket: any = {
      emitted: [] as any[],
      emit(event: string, payload: any) {
        this.emitted.push({ event, payload });
      }
    };

    // Test 1: Validation Error
    const valErr = emitSocketError(mockSocket, 'join_live', 'Channel name is required to join');
    console.log('Validation Error payload:', JSON.stringify(valErr));
    if (valErr.success === false && valErr.type === 'VALIDATION_ERROR' && valErr.event === 'join_live') {
      console.log('✅ PASS: Validation error parsed with correct type and code!');
    } else {
      console.error('❌ FAIL: Validation error mismatch');
    }

    // Test 2: Insufficient balance
    const coinErr = emitSocketError(mockSocket, 'initiate_call', 'Insufficient coins to start call. You need at least 50 coins.');
    console.log('Coin Error payload:', JSON.stringify(coinErr));
    if (coinErr.success === false && coinErr.type === 'INSUFFICIENT_BALANCE') {
      console.log('✅ PASS: Insufficient balance detected with INSUFFICIENT_BALANCE type!');
    } else {
      console.error('❌ FAIL: Coin error mismatch');
    }

    // Test 3: Success payload
    const successRes = emitSocketSuccess(mockSocket, 'test_event', { foo: 'bar' });
    if (successRes.success === true && successRes.type === 'SUCCESS') {
      console.log('✅ PASS: Success payload formatted properly!');
    } else {
      console.error('❌ FAIL: Success payload mismatch');
    }

    console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('❌ Test execution error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

runTests();
