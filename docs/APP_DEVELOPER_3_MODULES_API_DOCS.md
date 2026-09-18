# Filive Backend — Mobile App Developer API & Socket Documentation

This document covers the **3 updated modules** implemented in the backend:
1. **Live Stream vs Party Room Separation** (REST APIs)
2. **Random Call Online Matchmaking Flow & Events** (Socket.IO)
3. **Standardized Socket Error & Success Response Structure** (Socket.IO)

---

# Module 1: Live Stream vs. Party Room Separation

### Problem Solved
Previously, party rooms appeared inside the Live Stream list on the mobile app, and hosts running a party room were incorrectly flagged as live streaming. Now, **Live Streams and Party Rooms are completely separated**.

---

### 1.1 Get Active Room List (Live Stream / Party Room)

- **Method**: `GET`
- **Path**: `/v1/api/app/room/list`
- **Headers**:
  ```http
  Authorization: Bearer <JWT_TOKEN>
  ```
- **Query Parameters**:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | Integer | No | `1` | Page number |
| `limit` | Integer | No | `10` | Records per page |
| `country` | String | No | - | Country name, code, or countryId filter |
| `roomType` | String | No | **`livestream`** | **`livestream`**: Returns **only** live streams (default).<br>**`party_room`**: Returns **only** party rooms.<br>**`all`**: Returns both. |

#### Example 1: Fetch Live Streams (for Live Stream Screen / Tab)
```http
GET /v1/api/app/room/list?page=1&limit=10
```
*(No `roomType` needed, defaults strictly to `livestream`! Party rooms will never appear here).*

#### Example 2: Fetch Party Rooms (for Party Room Screen / Tab)
```http
GET /v1/api/app/room/list?roomType=party_room&page=1&limit=10
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "streams": [
      {
        "_id": "66f1234567890abcdef12345",
        "roomId": 10002345,
        "channelName": "live_user_123_1726650000",
        "title": "Welcome to my Live Stream!",
        "status": "live",
        "roomType": "livestream",
        "viewerCount": 15,
        "hostId": {
          "_id": "66f0000000000abcdef00001",
          "userId": 100012,
          "name": "Sophia",
          "profileImage": { "url": "https://..." }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "Active live streams fetched successfully"
}
```

---

### 1.2 Get Active Room Details for Host

- **Method**: `GET`
- **Path**: `/v1/api/app/room/active`
- **Query Parameters**:

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `roomType` | String | No | - | Filter by `livestream` or `party_room` if host has an active room of that type. |

---

### 1.3 Followed Rooms List

- **Method**: `GET`
- **Path**: `/v1/api/app/room/followed-list`
- **Query Parameters**: `page`, `limit`, and optional `roomType` (`livestream`, `party_room`, `all`).

---

### 1.4 User Profile Separation

In profile responses (`GET /v1/api/app/user/profile` and `GET /v1/api/app/user/profile/:userId`):
- `isLive`: `true` **only** if the user is currently hosting an active **live stream**.
- `liveStream`: Contains the active live stream object (or `null`).
- `partyRoom` / `activePartyRoom`: Contains the active party room object (or `null`).

---

# Module 2: Random Call Online Matchmaking Flow & Events

### How Random Call Works
1. When two users (e.g. User A and User B) tap **Random Audio/Video Call**, both emit `join_random_match`.
2. The backend places the user into the queue and immediately searches:
   - **Priority 1**: Explicitly registered available hosts (`set_random_call_available`).
   - **Priority 2**: **Another online user waiting in the queue** (`callerQueues`).
   - **Priority 3**: **Online female hosts** currently connected to the app via socket who have voice/video calling enabled on their profile.
3. Once matched, the call is created with status `accepted` (instant connection, no ring screen needed).
4. Both users receive the `random_match_found` socket event with their unique Agora token and channel ID, and join the Agora channel immediately.

---

### 2.1 Socket Events Reference

| Event Name | Direction | Payload | Description |
|---|---|---|---|
| `join_random_match` | Client → Server | `{ callType: 'voice' \| 'audio' \| 'video' }` | Start searching for a random match |
| `random_match_searching` | Server → Client | `{ success: true, type: 'random_match_searching', callType, timeoutMs: 60000 }` | Acknowledges search has started (show radar/searching UI) |
| `random_match_found` | Server → Client | *(See payload below)* | Match found! Open call screen and join Agora channel |
| `leave_random_match` | Client → Server | `{}` | User clicked Cancel / left screen |
| `random_match_left` | Server → Client | `{ success: true, type: 'random_match_left', callType }` | Confirms search cancelled |
| `random_match_timeout` | Server → Client | `{ success: false, type: 'random_match_timeout', callType, reason: 'no_host_found' }` | 60 seconds elapsed without finding a match (show retry button) |
| `set_random_call_available` | Client → Server | `{ available: boolean, callTypes?: ['voice', 'video'] }` | (Optional for female hosts) Opt into auto-receiving random calls |
| `end_call` | Client → Server | `{ callId: string }` | End call |
| `call_ended` | Server → Client | After-call summary payload | Call ended |

---

### 2.2 Client Implementation Example

#### Step 1: User Taps "Random Call"
```javascript
// Accepts 'voice', 'audio', or 'video'
socket.emit('join_random_match', { callType: 'video' });
```

#### Step 2: Listen for Searching Status
```javascript
socket.on('random_match_searching', (data) => {
  // data: { success: true, type: 'random_match_searching', callType: 'video', timeoutMs: 60000 }
  showSearchingRadar(data.timeoutMs);
});
```

#### Step 3: Listen for Match Found (Instant Agora Connect)
```javascript
socket.on('random_match_found', (data) => {
  /*
  data contains:
  {
    success: true,
    type: "random_match_found",
    callId: "66f34567...",
    displayCallId: "Call #4F2B8A",
    roomId: "call_66f34567...",      // <-- Agora Channel Name
    callType: "video",                // or "voice"
    status: "accepted",
    role: "caller",                   // "caller" or "host"
    viewerWallet: "coins",            // "coins" for caller, "beans" for host
    agoraAppId: "...",
    agoraToken: "...",                // <-- Token for THIS user
    caller: { id, userId, name, profileImage },
    receiver: { id, userId, name, profileImage },
    peer: { id, userId, name, profileImage }, // <-- The other user
    currentCallPrice: 0               // coins per minute
  }
  */

  // 1. Hide searching UI
  hideSearchingRadar();

  // 2. Open Call Screen
  navigateToCallScreen(data);

  // 3. Join Agora Channel
  agoraEngine.joinChannel({
    token: data.agoraToken,
    channelId: data.roomId,
    uid: 0 // Wildcard UID 0
  });
});
```

#### Step 4: Cancel / Leave Search
```javascript
// If user presses back or cancel:
socket.emit('leave_random_match', {});

socket.on('random_match_left', (data) => {
  hideSearchingRadar();
});
```

#### Step 5: Search Timeout (60 Seconds)
```javascript
socket.on('random_match_timeout', (data) => {
  // data: { success: false, type: 'random_match_timeout', reason: 'no_host_found', callType: 'video' }
  hideSearchingRadar();
  showToast("No users found at the moment. Please try again!");
  showRetryButton();
});
```

---

# Module 3: Standardized Socket Error & Success Structure

### Problem Solved
Previously, socket errors were sent as plain strings or generic messages like `"something went wrong"` without any error code, event name, or indication of what actually failed.

Now, **all socket error events return a structured, typed object with explicit error codes**.

---

### 3.1 Standard Error Payload Format

Every socket error emits the following JSON structure:

```json
{
  "success": false,
  "type": "VALIDATION_ERROR",
  "event": "join_live",
  "code": "CHANNEL_NAME_REQUIRED",
  "message": "Channel name is required to join",
  "error": "Channel name is required to join",
  "details": null
}
```

#### Field Explanations:
- `success`: Always `false` for errors.
- `type`: High-level error classification:
  - `VALIDATION_ERROR`: Required parameters missing or wrong data type.
  - `INSUFFICIENT_BALANCE`: User does not have enough coins/beans.
  - `NOT_FOUND`: Target room, call, game, gift, or user does not exist.
  - `FORBIDDEN`: User is blocked, banned, or lacks permission.
  - `BUSY`: Target user or current user is already in another call.
  - `AUTHENTICATION_ERROR`: Token invalid or expired.
  - `BUSINESS_ERROR`: Generic business logic failure.
- `event`: The exact socket event name that triggered the error (e.g., `initiate_call`, `join_room`, `send_gift`).
- `code`: Machine-readable constant string to handle UI logic (e.g., show "Recharge Coins" modal on `INSUFFICIENT_COINS`).
- `message`: Human-readable explanation of why the action failed.
- `error`: Same as `message` (provided so existing code using `data.error` or `data.message` continues working without breaking).

---

### 3.2 Error Channels Emitted

For maximum developer flexibility, the backend emits errors to **three** channels:

1. **Global `error_message`** (existing standard channel):
   ```javascript
   socket.on('error_message', (err) => {
     console.log(err.code);    // e.g. "INSUFFICIENT_COINS"
     console.log(err.message); // e.g. "Insufficient coins to start call"
     if (err.type === 'INSUFFICIENT_BALANCE') {
       openRechargeWalletModal();
     } else {
       showToast(err.message);
     }
   });
   ```

2. **Global `socket_error`**:
   ```javascript
   socket.on('socket_error', (err) => {
     // Identical structured error payload
   });
   ```

3. **Event-Specific Error Channel (`<event_name>_error`)**:
   ```javascript
   // Listen only for errors on a specific action:
   socket.on('join_random_match_error', (err) => { ... });
   socket.on('initiate_call_error', (err) => { ... });
   socket.on('send_gift_error', (err) => { ... });
   ```

4. **Acknowledgement Callbacks**:
   If your client sends an ack callback, the backend returns the structured error/success payload directly:
   ```javascript
   socket.emit('join_random_match', { callType: 'video' }, (response) => {
     if (!response.success) {
       console.error("Error Code:", response.code);
       console.error("Message:", response.message);
     }
   });
   ```

---

### 3.3 Error Codes Directory for Mobile App

| Event | Code | Type | Meaning / UI Recommendation |
|---|---|---|---|
| `join_random_match` | `INVALID_CALL_TYPE` | `VALIDATION_ERROR` | `callType` must be voice, audio, or video |
| `join_random_match` | `ALREADY_SEARCHING` | `BUSINESS_ERROR` | User is already in the search queue |
| `join_random_match` | `USER_BUSY` | `BUSY` | User is already in another active call |
| `join_random_match` | `INSUFFICIENT_COINS` | `INSUFFICIENT_BALANCE` | Not enough coins; prompt user to recharge |
| `initiate_call` | `VALIDATION_FAILED` | `VALIDATION_ERROR` | `receiverId` or `callType` missing |
| `initiate_call` | `INSUFFICIENT_COINS` | `INSUFFICIENT_BALANCE` | User has fewer coins than the host's per-minute rate |
| `initiate_call` | `USER_BUSY` | `BUSY` | Either caller or receiver is on another call |
| `initiate_call` | `ACTION_FORBIDDEN` | `FORBIDDEN` | Caller or receiver has blocked the other user |
| `accept_call` | `CALL_NOT_FOUND` | `NOT_FOUND` | Call expired, was cancelled, or does not exist |
| `join_room` / `join_live` | `CHANNEL_NAME_REQUIRED` | `VALIDATION_ERROR` | Missing channelName |
| `join_room` / `join_live` | `USER_BLOCKED_FROM_ROOM` | `FORBIDDEN` | User has been blocked/kicked from this room |
| `room_comment` | `USER_BLOCKED_FROM_ROOM` | `FORBIDDEN` | Host has muted or blocked user from commenting |
| `send_gift` / `send_gift_in_call` | `GIFT_ID_REQUIRED` | `VALIDATION_ERROR` | Missing giftId |
| `send_gift` / `send_gift_in_call` | `INSUFFICIENT_COINS` | `INSUFFICIENT_BALANCE` | Coins insufficient to purchase gift |
| `join_seat` | `SEAT_LOCKED` | `FORBIDDEN` | The target party room seat is locked by the host |
| `join_seat` | `SEAT_OCCUPIED` | `BUSINESS_ERROR` | Another user took the seat |
| `start_game` | `GAME_NOT_FOUND` | `NOT_FOUND` | Invalid gameId |

---

### Summary Checklist for Mobile Developers

1. **Live Stream Screen**: Call `GET /v1/api/app/room/list` without parameters or with `?roomType=livestream`.
2. **Party Room Screen**: Call `GET /v1/api/app/room/list?roomType=party_room`.
3. **Random Call**:
   - Emit `join_random_match` `{ callType: 'video' }` (or `'voice'`).
   - Listen to `random_match_searching` to show radar.
   - Listen to `random_match_found` to open the call screen and connect to Agora with `agoraToken` and `roomId`.
4. **Socket Error Handling**: Check `err.code` and `err.type` in `socket.on('error_message')` to display accurate toasts or trigger recharge modals automatically.
