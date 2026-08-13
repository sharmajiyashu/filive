# Filive Mobile API — Random Home Call Auto-Connect

**Version:** 1.0  
**Product rules:** Caller → random **Female** host · Match = **instant Agora connect** (no ring / no accept)  
**Base URL (Production):** `https://filive.vercel.app`  
**Socket path:** same origin as REST (`/v1/api` is REST only; Socket.IO connects to host root)

---

## Overview

Home screen Audio / Video tabs auto-connect the user to a random available female host.

| Role | What they do |
|------|----------------|
| **Caller** (home Audio/Video) | `join_random_match` → wait → `random_match_found` → join Agora |
| **Host** (female, call-enabled) | `set_random_call_available` → on match get `random_match_found` → join Agora immediately |

Directed 1:1 calls (`initiate_call` / `accept_call` / ring UI) are **unchanged**. Random matches skip ring and start as `accepted`.

Billing / end / gifts reuse existing call sockets (`end_call`, `send_gift_in_call`).

---

## 1. Socket connect

```javascript
import { io } from 'socket.io-client';

const socket = io('https://filive.vercel.app', {
  transports: ['websocket', 'polling'],
  auth: { token: '<JWT_TOKEN>' },
});

socket.on('connect', () => {
  // Auto-joins room: user_{mongoUserId}
});

socket.on('error_message', (message) => {
  // Show toast / handle errors
  console.error(message);
});
```

---

## 2. Caller flow (Home → Audio / Video)

### 2.1 Enter search

When user opens **Audio** or **Video** on home (or taps Connect):

```javascript
socket.emit('join_random_match', { callType: 'voice' }); // or 'video'
```

| Field | Type | Required |
|-------|------|----------|
| `callType` | `'voice' \| 'video'` | Yes |

### 2.2 Searching

```javascript
socket.on('random_match_searching', (data) => {
  // data = { callType, timeoutMs }  // timeoutMs = 60000
  showSearchingUI(data.callType);
});
```

### 2.3 Match found → join Agora (no accept step)

```javascript
socket.on('random_match_found', (data) => {
  /*
  {
    callId,
    callType,          // 'voice' | 'video'
    roomId,            // Agora channel name e.g. call_<id>
    agoraAppId,
    agoraToken,        // THIS user's token
    matchType: 'random',
    startedAt,
    role: 'caller',    // or 'host' on host device
    peer: {
      id, name, profileImage,
      voiceCallPrice, videoCallPrice
    }
  }
  */
  openCallScreen(data);
  joinAgora({
    appId: data.agoraAppId,
    channel: data.roomId,
    token: data.agoraToken,
    uid: 0, // backend issues wildcard UID 0 tokens
  });
});
```

### 2.4 Timeout (no host in 60s)

```javascript
socket.on('random_match_timeout', (data) => {
  // data = { callType, reason: 'no_host_found' }
  showNoHostsUI(data.callType); // offer Retry → emit join_random_match again
});
```

### 2.5 Leave / cancel search

When user leaves home, switches tab away, or taps Cancel:

```javascript
socket.emit('leave_random_match', {});
```

```javascript
socket.on('random_match_left', (data) => {
  // data = { callType } or { callType: null } if was not searching
  hideSearchingUI();
});
```

### 2.6 Caller checklist

1. Socket connected with JWT  
2. Home Audio/Video → `join_random_match`  
3. Show searching on `random_match_searching`  
4. On `random_match_found` → call UI + Agora join  
5. Leave home / cancel → `leave_random_match`  
6. On `random_match_timeout` → retry UI  
7. Hang up → existing `end_call` `{ callId }`

---

## 3. Host flow (availability)

Hosts must **opt in** to receive random auto-connects. Only **Female** users with the matching call type enabled on profile can opt in.

### 3.1 Go available

```javascript
socket.emit('set_random_call_available', {
  available: true,
  callTypes: ['voice', 'video'], // optional; default both if omitted
});
```

```javascript
socket.on('random_call_availability_updated', (data) => {
  // data = { available: true, callTypes: ['voice', 'video'] }
  updateHostAvailableUI(data);
});
```

### 3.2 Incoming random match (auto — no Accept button)

Same event as caller:

```javascript
socket.on('random_match_found', (data) => {
  // data.role === 'host'
  // DO NOT show accept/reject ring UI
  openCallScreen(data);
  joinAgora({
    appId: data.agoraAppId,
    channel: data.roomId,
    token: data.agoraToken,
    uid: 0,
  });
});
```

### 3.3 Go unavailable

Call when host toggles off, leaves available screen, or backgrounds (recommended):

```javascript
socket.emit('set_random_call_available', { available: false });
```

Socket **disconnect** also clears availability and search queue server-side.

### 3.4 Host checklist

1. Profile: `gender: Female`, `enableVoiceCall` / `enableVideoCall` as needed  
2. Free to take calls → `set_random_call_available { available: true, callTypes }`  
3. On `random_match_found` → open call UI immediately + Agora  
4. Toggle off / leave → `available: false`  
5. Hang up → `end_call`

---

## 4. End call & gifts (unchanged)

### End

```javascript
socket.emit('end_call', { callId: '<callId>' });

socket.on('call_ended', (call) => {
  leaveAgora();
  closeCallScreen(call);
});
```

### Gift during call

```javascript
socket.emit('send_gift_in_call', {
  callId: '<callId>',
  giftId: '<giftId>',
  quantity: 1,
});

socket.on('gift_sent_in_call', (payload) => {
  playGiftAnimation(payload);
});
```

---

## 5. Event reference

### Client → Server

| Event | Payload | Who |
|-------|---------|-----|
| `join_random_match` | `{ callType: 'voice' \| 'video' }` | Caller |
| `leave_random_match` | `{}` | Caller |
| `set_random_call_available` | `{ available: boolean, callTypes?: ('voice'\|'video')[] }` | Host |
| `end_call` | `{ callId }` | Either (existing) |
| `send_gift_in_call` | `{ callId, giftId, quantity? }` | Either (existing) |

### Server → Client

| Event | Payload | When |
|-------|---------|------|
| `random_match_searching` | `{ callType, timeoutMs }` | Search started |
| `random_match_found` | see §2.3 | Instant match (both sides) |
| `random_match_timeout` | `{ callType, reason: 'no_host_found' }` | 60s no host |
| `random_match_left` | `{ callType }` | Left queue |
| `random_call_availability_updated` | `{ available, callTypes }` | Host toggle ack |
| `call_ended` | call object | After `end_call` |
| `gift_sent_in_call` | gift payload | In-call gift |
| `error_message` | `string` | Validation / business errors |

---

## 6. Common `error_message` strings

| Message | Meaning | UI |
|---------|---------|----|
| `callType must be voice or video` | Bad payload | Fix client |
| `You are already searching for a random match` | Double join | Ignore or leave first |
| `You are already in another call` | Busy | Stay on active call |
| `Insufficient coins to start call...` | Low balance | Recharge screen |
| `Only female hosts can enable random call availability` | Non-female host | Hide host toggle |
| `Enable voice/video calling on your profile...` | Flags off | Profile settings |
| `Turn off random call availability before searching as a caller` | Host tried to search | Turn off availability |
| `Leave random match search before becoming available as a host` | Caller tried host mode | Leave search first |
| `User is busy on another call` | Host busy race | Keep searching |

---

## 7. Sequence (happy path)

```text
Caller                         Server                         Host
  |                              |                              |
  |-- join_random_match -------->|                              |
  |<- random_match_searching ----|                              |
  |                              |<- set_random_call_available --|
  |                              |-- random_call_availability ->|
  |                              |   (match + create Call       |
  |                              |    status=accepted + tokens) |
  |<- random_match_found --------|-- random_match_found ------->|
  |-- join Agora --------------->|<--------- join Agora --------|
  |                              |                              |
  |-- end_call ----------------->|-- call_ended --------------->|
  |<- call_ended ----------------|                              |
```

If host is already available when caller joins, match happens immediately (no wait for host emit).

---

## 8. Implementation notes (Android / iOS)

1. **Do not** use `incoming_call` / `accept_call` / `reject_call` for random matches. Those remain for directed calls only.  
2. After `random_match_found`, both sides treat the session as already accepted.  
3. Agora: channel = `roomId`, token = `agoraToken`, appId = `agoraAppId`, UID `0`.  
4. Voice vs video: mute local video for `callType === 'voice'`.  
5. On app kill / socket disconnect, server clears queue + host availability — host must opt in again on next launch.  
6. After a matched call ends, host must call `set_random_call_available { available: true }` again to receive the next random caller.  
7. Caller coins are validated against the matched host’s per-minute rate before connect; billing still runs on `end_call` (per started minute + platform fee).  
8. `matchType: 'random'` is stored on the call for analytics; history APIs return the same call objects as directed calls.

---

## 9. Quick test script

```javascript
// Host device (female, enableVoiceCall/enableVideoCall true)
socket.emit('set_random_call_available', { available: true, callTypes: ['voice', 'video'] });

// Caller device
socket.emit('join_random_match', { callType: 'voice' });

// Both should receive random_match_found within seconds if both connected
```
