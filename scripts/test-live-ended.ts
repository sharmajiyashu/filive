import 'reflect-metadata';
import dotenv from 'dotenv';
import dns from 'node:dns';
import mongoose from 'mongoose';
import express from 'express';
import { io as ioClient } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';
import Container from 'typedi';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {
  // ignore
}

dotenv.config();

import config from '../src/config';
import { CONSTANTS } from '../src/config/constants';
import appLoader from '../src/api/loaders';
import socketLoader from '../src/api/loaders/socket';
import socketDI from '../src/api/loaders/diSocket';
import { LiveStreamService } from '../src/services/app/LiveStreamService';
import User from '../src/models/User';
import LiveStream from '../src/models/LiveStream';

function generateToken(userId: string, role: string): string {
  const payload = { userId, role };
  const secret = config.auth.secret;
  const options: jwt.SignOptions = {
    expiresIn: CONSTANTS.JWT_ACCESS_EXPIRY
  };
  return jwt.sign(payload, secret, options) as string;
}

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('Connected to database.');

  // Find or create dummy host and viewer
  let host = await User.findOne({ email: 'test_host@example.com' });
  if (!host) {
    host = await User.create({
      name: 'Test Host',
      email: 'test_host@example.com',
      mobile: '1111111111',
      userRole: 'user',
    });
  }

  let viewer = await User.findOne({ email: 'test_viewer@example.com' });
  if (!viewer) {
    viewer = await User.create({
      name: 'Test Viewer',
      email: 'test_viewer@example.com',
      mobile: '2222222222',
      userRole: 'user',
    });
  }

  console.log(`Host ID: ${host._id}, Viewer ID: ${viewer._id}`);

  // Create an active live stream for the host
  const channelName = `live_test_${Date.now()}`;
  
  // Clean up any old active streams for host
  await LiveStream.updateMany({ hostId: host._id, status: 'live' }, { status: 'ended' });

  const liveStream = await LiveStream.create({
    hostId: host._id,
    channelName,
    title: 'Test Live Stream',
    status: 'live',
    token: 'agora_test_token',
    viewerCount: 0,
    viewers: [],
    startedAt: new Date()
  });
  console.log(`Created active LiveStream: ${channelName}`);

  // Start express server programmatically on a test port
  const port = 5055;
  const app = express();
  await appLoader(app);

  const httpServer = app.listen(port, () => {
    console.log(`Test server listening on port ${port}`);
  });

  const ioServer = socketLoader(httpServer);
  await socketDI(ioServer);

  // Generate tokens
  const viewerToken = generateToken(viewer._id.toString(), viewer.userRole);

  console.log('Connecting viewer socket client...');
  const socket = ioClient(`http://localhost:${port}`, {
    auth: {
      token: viewerToken
    },
    transports: ['websocket']
  });

  let eventReceived = false;

  socket.on('connect', () => {
    console.log(`Viewer connected to socket with ID: ${socket.id}`);
    
    // Join the live stream
    console.log(`Viewer joining live stream room for channel: ${channelName}`);
    socket.emit('join_live', { channelName });
    
    // Listen for viewer_joined
    socket.on('viewer_joined', (data) => {
      console.log('Viewer joined event received by client:', data);
      
      // Now that the viewer has joined, host ends the stream
      setTimeout(async () => {
        console.log('Ending live stream from host...');
        const liveStreamService = Container.get(LiveStreamService);
        try {
          await liveStreamService.endLiveStream(host!._id.toString(), channelName);
          console.log('endLiveStream executed successfully.');
        } catch (err: any) {
          console.error('Error in endLiveStream:', err.message);
        }
      }, 1000);
    });

    // Listen for live_ended
    socket.on('live_ended', (data) => {
      console.log('🎉 SUCCESS! Client received live_ended event:', data);
      eventReceived = true;
      cleanup();
    });
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    cleanup();
  });

  function cleanup() {
    console.log('Cleaning up...');
    socket.disconnect();
    httpServer.close(async () => {
      console.log('HTTP Server closed.');
      // Clean up test data
      await LiveStream.deleteOne({ _id: liveStream._id });
      await mongoose.disconnect();
      console.log('Database disconnected. Exiting.');
      process.exit(eventReceived ? 0 : 1);
    });
  }

  // Timeout fallback
  setTimeout(() => {
    if (!eventReceived) {
      console.error('❌ FAILED! Timeout waiting for live_ended event.');
      cleanup();
    }
  }, 10000);
}

run().catch((err) => {
  console.error('Error running test:', err);
  process.exit(1);
});
