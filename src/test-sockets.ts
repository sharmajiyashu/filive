import mongoose from 'mongoose';
import { io } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';
import config from './config';
import User from './models/User';

// Helper to generate a valid token
function generateToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, config.auth.secret, { expiresIn: '1h' });
}

// Ensure your server is running before executing this script!
const SERVER_URL = 'http://localhost:5000'; // Change this if your server is on a different port

async function testCallSockets() {
    console.log("Connecting to database to fetch test users...");
    await mongoose.connect(config.database.mongo.uri);

    // Find two distinct users who have calling enabled
    const users = await User.find({ userRole: 'user' }).limit(2);
    if (users.length < 2) {
        console.error("Need at least 2 users in the database to test calls!");
        process.exit(1);
    }

    const caller = users[0];
    const receiver = users[1];

    // Give caller some coins so the call succeeds
    caller.coins = 50000;
    await caller.save();

    console.log(`\n🔹 Test Caller: ${caller.name} (${caller._id})`);
    console.log(`🔹 Test Receiver: ${receiver.name} (${receiver._id})\n`);

    const callerToken = generateToken(caller._id.toString(), caller.userRole);
    const receiverToken = generateToken(receiver._id.toString(), receiver.userRole);

    const callerSocket = io(SERVER_URL, { auth: { token: callerToken } });
    const receiverSocket = io(SERVER_URL, { auth: { token: receiverToken } });

    await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for connection

    // Setup Listeners for Caller
    callerSocket.on('call_initiated', (data) => console.log('🟢 [Caller] Received call_initiated!'));
    callerSocket.on('call_accepted', (data) => console.log('🟢 [Caller] Received call_accepted!'));
    callerSocket.on('call_rejected', (data) => console.log('🟢 [Caller] Received call_rejected!'));
    callerSocket.on('call_cancelled', (data) => console.log('🟢 [Caller] Received call_cancelled!'));
    callerSocket.on('call_ended', (data) => console.log('🟢 [Caller] Received call_ended!'));
    callerSocket.on('call_missed', (data) => console.log('🟢 [Caller] Received call_missed!'));
    callerSocket.on('error_message', (data) => console.error('🔴 [Caller] ERROR:', data));

    // Setup Listeners for Receiver
    receiverSocket.on('incoming_call', (data) => console.log('🔵 [Receiver] Received incoming_call!'));
    receiverSocket.on('call_accepted', (data) => console.log('🔵 [Receiver] Received call_accepted!'));
    receiverSocket.on('call_cancelled', (data) => console.log('🔵 [Receiver] Received call_cancelled!'));
    receiverSocket.on('call_ended', (data) => console.log('🔵 [Receiver] Received call_ended!'));
    receiverSocket.on('call_missed', (data) => console.log('🔵 [Receiver] Received call_missed!'));
    receiverSocket.on('error_message', (data) => console.error('🔴 [Receiver] ERROR:', data));

    // ---- TEST SCENARIO 1: CALLER CANCELS BEFORE PICKUP ----
    console.log("\n=======================================================");
    console.log("🧪 SCENARIO 1: CALLER CANCELS THE CALL BEFORE RECEIVER ANSWERS");
    console.log("=======================================================");
    callerSocket.emit('initiate_call', { receiverId: receiver._id.toString(), callType: 'video' });

    await new Promise((resolve) => {
        let currentCallId = "";
        callerSocket.once('call_initiated', (data) => {
            currentCallId = data._id;
            console.log(`\n--> Caller is now cancelling the call (callId: ${currentCallId})...`);
            setTimeout(() => {
                callerSocket.emit('end_call', { callId: currentCallId });
            }, 1000);
        });

        // Wait for both to receive cancel
        setTimeout(resolve, 3000);
    });

    // ---- TEST SCENARIO 2: RECEIVER REJECTS THE CALL ----
    console.log("\n=======================================================");
    console.log("🧪 SCENARIO 2: RECEIVER DECLINES THE CALL");
    console.log("=======================================================");
    callerSocket.emit('initiate_call', { receiverId: receiver._id.toString(), callType: 'video' });

    await new Promise((resolve) => {
        receiverSocket.once('incoming_call', (data) => {
            const currentCallId = data.callId;
            console.log(`\n--> Receiver is now rejecting the call (callId: ${currentCallId})...`);
            setTimeout(() => {
                receiverSocket.emit('reject_call', { callId: currentCallId });
            }, 1000);
        });

        setTimeout(resolve, 3000);
    });

    // ---- TEST SCENARIO 3: CALL ACCEPTED THEN ENDED ----
    console.log("\n=======================================================");
    console.log("🧪 SCENARIO 3: CALL ACCEPTED, THEN ENDED NORMALLY");
    console.log("=======================================================");
    callerSocket.emit('initiate_call', { receiverId: receiver._id.toString(), callType: 'video' });

    await new Promise((resolve) => {
        receiverSocket.once('incoming_call', (data) => {
            const currentCallId = data.callId;
            console.log(`\n--> Receiver is now accepting the call (callId: ${currentCallId})...`);
            setTimeout(() => {
                receiverSocket.emit('accept_call', { callId: currentCallId });

                // End call after 2 seconds
                setTimeout(() => {
                    console.log(`\n--> Caller is now ending the active call (callId: ${currentCallId})...`);
                    callerSocket.emit('end_call', { callId: currentCallId });
                }, 2000);

            }, 500);
        });

        setTimeout(resolve, 4000);
    });

    // ---- TEST SCENARIO 4: AUTO-CUT TIMEOUT ----
    console.log("\n=======================================================");
    console.log("🧪 SCENARIO 4: AUTO-CUT (NO ONE ANSWERS FOR 45 SECONDS)");
    console.log("=======================================================");
    callerSocket.emit('initiate_call', { receiverId: receiver._id.toString(), callType: 'video' });
    console.log("\n--> Waiting 46 seconds for the timeout to fire... (Please wait)");

    await new Promise((resolve) => setTimeout(resolve, 47000));

    console.log("\n✅ ALL TESTS COMPLETED!");
    process.exit(0);
}

testCallSockets().catch(console.error);
