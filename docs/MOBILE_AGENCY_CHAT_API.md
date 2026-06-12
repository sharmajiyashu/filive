# Filive Mobile API — Agency, Host & Chat Integration

**Version:** 1.0  
**Base URL (Production):** `https://filive.vercel.app/v1/api`  
**Base URL (Local):** `http://localhost:{PORT}/v1/api`  
**Swagger:** `{BASE_URL}/api-docs/app`

---

## Authentication

All endpoints below require:

```http
Authorization: Bearer <JWT_TOKEN>
```

**Standard response wrapper:**

```json
{
  "success": true,
  "message": "Human readable message",
  "data": { ... }
}
```

**Error response:**

```json
{
  "success": false,
  "message": "Error description"
}
```

---

## 1. Profile — Agency flags (IMPORTANT)

Use these fields from **`GET /app/profile`** and **`POST /app/profile`** (update response).

| Field | When `true` | UI action |
|-------|-------------|-----------|
| `isAgencyHost` | User **created** the agency (owner) | Show **Agency Dashboard / Create Agency management** |
| `agency` | Only when `isAgencyHost === true` | Full agency object — use for owner screens |
| `isBecomeHost` | User **joined as host** (become-host / verification code / accepted invite) | Show **Become Host** status (simple) |
| `becomeHostMessage` | When `isBecomeHost === true` | Simple text e.g. `"You are a host under Agency Name."` |

**Rules for mobile UI:**

- **Agency owner** → `isAgencyHost: true`, `agency: { full object }`, `isBecomeHost: false`
- **Joined host** → `isBecomeHost: true`, `becomeHostMessage: "..."`, `agency: null`, `isAgencyHost: false`
- **Normal user** → all false / null

**Profile also returns defaults** for missing fields (`name` → `"User"`, empty `bio`, etc.).

**Example — agency owner:**

```json
{
  "isAgencyHost": true,
  "isBecomeHost": false,
  "becomeHostMessage": null,
  "agency": {
    "_id": "...",
    "name": "My Agency",
    "mobile": "...",
    "email": "",
    "isVerified": true,
    "status": "approved",
    "countryId": { ... }
  }
}
```

**Example — joined host:**

```json
{
  "isAgencyHost": false,
  "isBecomeHost": true,
  "becomeHostMessage": "You are a host under My Agency.",
  "agency": null
}
```

---

## 2. Agency owner flow

### 2.1 Create agency

```http
POST /app/agencies/create
```

**Body:**

```json
{
  "name": "Agency Name",
  "countryId": "mongo_country_id",
  "mobile": "9876543210",
  "email": "optional@email.com",
  "description": "Optional description"
}
```

| Field | Required |
|-------|----------|
| name | Yes |
| countryId | Yes |
| mobile | Yes |
| email | **No** (optional) |
| description | No |

**Response:**

```json
{
  "agencyId": "...",
  "message": "OTP sent to mobile number"
}
```

### 2.2 Verify agency OTP

```http
POST /app/agencies/verify
```

```json
{
  "agencyId": "...",
  "otp": "1234"
}
```

### 2.3 Agency commission dashboard

```http
GET /app/agencies/dashboard
```

**Auth:** Agency owner only. Primary endpoint for the commission dashboard screen.

**Response `data`:**

```json
{
  "totalHosts": 20,
  "activeHosts": 12,
  "totalHostEarnings": 2000000,
  "currentCommissionRate": 15,
  "pendingCommission": 300000,
  "thisWeekCommission": 300000,
  "lastSettlementDate": "2026-06-02T10:00:00.000Z",
  "nextSettlementDate": "2026-06-09T00:00:00.000Z",
  "isFrozen": false,
  "isCommissionHeld": false
}
```

**Full commission docs:** [MOBILE_AGENCY_COMMISSION_API.md](./MOBILE_AGENCY_COMMISSION_API.md)

### 2.4 My agency (profile + commission)

```http
GET /app/agencies/my
```

**Response includes `commissionDetails`:**

```json
{
  "_id": "...",
  "name": "My Agency",
  "commissionRate": 10,
  "pendingCommission": 300000,
  "thisWeekHostEarnings": 2000000,
  "thisWeekCommission": 300000,
  "commissionDetails": {
    "totalHosts": 20,
    "activeHosts": 12,
    "totalHostEarnings": 2000000,
    "currentCommissionRate": 15,
    "pendingCommission": 300000,
    "thisWeekCommission": 300000,
    "lastSettlementDate": "2026-06-02T10:00:00.000Z",
    "nextSettlementDate": "2026-06-09T00:00:00.000Z",
    "commissionRate": 15,
    "last30DaysCommission": 850000,
    "totalEarnings": 2000000,
    "myCommission": 300000,
    "last30DaysEarnings": 5500000
  }
}
```

### 2.5 Agency details by ID

```http
GET /app/agencies/{agencyId}
```

If **caller is agency owner**, response also includes `commissionDetails` (same structure as above).

---

## 3. Become host flow (user joins agency)

### 3.1 Verify agency owner ID (before join)

```http
GET /app/agencies/verify-agency-user/{numericUserId}
```

Example: `GET /app/agencies/verify-agency-user/100001`

**Response:**

```json
{
  "hasAgency": true,
  "user": { "id", "userId", "name", "profileImage" },
  "agency": { ... },
  "isVerified": true,
  "isApproved": true
}
```

### 3.2 Join by owner numeric user ID (recommended)

```http
POST /app/agencies/join-by-user-id
```

```json
{
  "agencyUserId": 100001
}
```

Agency must be **verified** and **approved**.

### 3.3 Become host (flexible ID)

```http
POST /app/agencies/become-host
```

```json
{
  "agentId": "100001"
}
```

`agentId` can be: agency MongoDB `_id`, owner MongoDB `_id`, or owner **numeric userId**.

### 3.4 Join by agency MongoDB ID

```http
POST /app/agencies/{agencyId}/join
```

**All join APIs return:**

```json
{
  "id": "host_request_id",
  "status": "ACCEPTED",
  "isBecomeHost": true,
  "becomeHostMessage": "You have successfully joined Agency Name as a host."
}
```

After join → refresh profile → `isBecomeHost: true`, **no** `agency` object.

---

## 4. Add host flow (agency owner → user via chat)

### Step 1 — Check user before invite

```http
POST /app/agencies/verify-user/{numericUserId}
```

**Body (recommended):**

```json
{
  "agencyId": "agency_mongo_id"
}
```

**Response:**

```json
{
  "id": "...",
  "userId": 100002,
  "name": "User Name",
  "profileImage": { "url": "..." },
  "countryId": "country_mongo_id",
  "country": {
    "_id": "...",
    "name": "India",
    "code": "IN",
    "flag": "https://...",
    "currencySymbol": "₹",
    "currencyCode": "INR"
  },
  "level": {
    "_id": "...",
    "levelNumber": 5,
    "name": "Gold",
    "minCoins": 1000,
    "maxCoins": 5000,
    "color": "#FFD700",
    "image": { "url": "..." },
    "levelRange": "1-5"
  },
  "levelInfo": {
    "level": { ... },
    "currentLevel": { ... },
    "nextLevel": { ... },
    "progressPercentage": 45.5
  },
  "richLevelInfo": { ... },
  "charmLevel": { ... },
  "charmLevelInfo": { ... },
  "agency": { ... },
  "hostStatus": {
    "canInvite": true,
    "isAlreadyHost": false,
    "isPending": false,
    "message": "User can be invited as host"
  }
}
```

**This API only checks — it does NOT add the host.**

### Step 2 — Send host invite

```http
POST /app/agencies/{agencyId}/add-host
```

```json
{
  "targetUserId": 100002,
  "verificationCode": "HOST123"
}
```

| Rule | Detail |
|------|--------|
| `targetUserId` | Numeric app user ID |
| `verificationCode` | Must match user's `hostVerificationCode` |
| Both must match | Otherwise error: `Invalid user ID or host verification code` |

**What happens:**

1. User-to-user **chat is created** (or existing chat used)
2. Target user gets chat message `type: agency_host_invite`
3. Agency admin gets system message in same chat: `"Host invitation sent to User (ID: xxx). Waiting for their response."`
4. `AgencyHost` record created with `status: PENDING`

**Response:**

```json
{
  "id": "request_id",
  "status": "PENDING",
  "chatId": "...",
  "messageId": "...",
  "message": { ... agency_host_invite message ... },
  "adminMessage": "Host invitation sent to ..."
}
```

---

## 5. Host invite — user side (chat)

### 5.1 Chat list

```http
GET /app/chats?page=1&limit=20
```

Each chat item may include:

```json
{
  "lastMessageType": "agency_host_invite",
  "agencyHostRequest": {
    "messageId": "...",
    "type": "agency_host_invite",
    "messageType": "agency_host_invite",
    "requestId": "...",
    "agencyId": "...",
    "agencyName": "Agency Name",
    "status": "PENDING",
    "flag": "pending",
    "isOpened": false,
    "isVerified": false,
    "text": "Agency Name has invited you to become a host..."
  }
}
```

Show badge/UI when `agencyHostRequest.status === "PENDING"`.

### 5.2 Chat messages

```http
GET /app/chats/{chatId}/messages?page=1&limit=50
```

**Agency host invite message:**

```json
{
  "_id": "...",
  "type": "agency_host_invite",
  "flag": "pending",
  "text": "Agency Name has invited you to become a host. Please accept or reject this request.",
  "metadata": {
    "type": "agency_host_invite",
    "agencyHostRequestId": "USE_THIS_FOR_APIS",
    "agencyId": "...",
    "agencyName": "Agency Name",
    "status": "PENDING",
    "flag": "pending",
    "isOpened": false,
    "isVerified": false
  }
}
```

**`flag` values:** `pending` | `accept` | `reject`  
On **reject** → message chat se delete ho jata hai.

### 5.3 User opened chat (optional tracking)

```http
POST /app/agencies/host-requests/{requestId}/open
```

Sets `isOpened: true` on request + message metadata.

### 5.4 User viewed agency details in invite (optional)

```http
POST /app/agencies/host-requests/{requestId}/verify-view
```

Sets `isVerified: true` and `isOpened: true`.

### 5.5 Get invite details

```http
GET /app/agencies/host-requests/{requestId}
```

Returns full invite + agency data + flags.

### 5.6 Pending invites list

```http
GET /app/agencies/host-requests/pending?page=1&limit=10
```

### 5.7 Accept or reject

```http
POST /app/agencies/host-requests/{requestId}/respond
```

```json
{
  "status": "ACCEPTED"
}
```

or

```json
{
  "status": "REJECTED"
}
```

| Action | Chat behavior |
|--------|----------------|
| **ACCEPT** | Invite message `metadata.status` → `ACCEPTED`, text updated. Socket: `message_updated` + `agency_host_invite_responded`. User becomes host. Refresh profile → `isBecomeHost: true`. |
| **REJECT** | Invite message **deleted from chat** (hard removed). Socket: `message_deleted` + `agency_host_invite_responded` + `agency_host_invite_deleted`. |
| **DELETE/CANCEL** | `DELETE /host-requests/{id}` — same socket events as reject. |

**Response includes:**

```json
{
  "id": "request_id",
  "status": "ACCEPTED",
  "inviteStatus": "ACCEPTED",
  "messageAction": "updated",
  "messageId": "...",
  "chatId": "...",
  "message": { ... updated invite message ... }
}
```

On **REJECT**: `messageAction: "deleted"`, `message: null`

---

## 6. Agency owner — host management

### 6.1 Active hosts (paginated)

```http
GET /app/agencies/{agencyId}/hosts?page=1&limit=10
```

**Each host `user` includes:**

- `profileImage` (full media object with `url`)
- `levelInfo`, `richLevelInfo`, `charmLevelInfo`

**Pagination response:**

```json
{
  "data": [ ... ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

### 6.2 Host add history (paginated)

```http
GET /app/agencies/{agencyId}/host-history?page=1&limit=10
```

All agency-initiated invites: PENDING, ACCEPTED, REJECTED.

### 6.3 Pending user join requests

```http
GET /app/agencies/{agencyId}/requests?page=1&limit=10
```

---

## 7. Store purchase (quantity)

```http
POST /app/store/purchase
```

```json
{
  "storeItemId": "mongo_id",
  "validityIndex": 0,
  "quantity": 3
}
```

| Field | Required | Default |
|-------|----------|---------|
| storeItemId | Yes | — |
| validityIndex | Yes | — |
| quantity | No | 1 |

**Response:**

```json
{
  "quantity": 3,
  "totalCoinsSpent": 300,
  "items": [ ... ],
  "item": { ... first purchased item ... }
}
```

---

## 8. Socket events (real-time)

### 8.1 Connect

```javascript
import { io } from 'socket.io-client';

const socket = io('https://filive.vercel.app', {
  transports: ['websocket', 'polling'],
  auth: { token: '<JWT_TOKEN>' },
});

socket.on('connect', () => {
  console.log('Socket connected');
  // User auto-joins room: user_{mongoUserId}
});
```

**Important:** Open chat screen par ye bhi emit karo:

```javascript
socket.emit('join_chat', { chatId: '<chat_mongo_id>' });
// User joins room: chat_{chatId}
```

---

### 8.2 `message_updated` listener (IMPORTANT)

Jab bhi message update ho (host invite accept, open, verify-view), ye event aata hai.

```javascript
socket.on('message_updated', (updatedMessage) => {
  // updatedMessage = full message object
  console.log('Message updated:', updatedMessage._id);

  if (updatedMessage.type === 'agency_host_invite') {
    const flag = updatedMessage.flag; // pending | accept | reject

    // Chat screen: list mein message replace karo
    updateMessageInChatList(updatedMessage.chatId, updatedMessage);

    if (flag === 'accept') {
      // Hide accept/reject buttons, show accepted UI
      hideInviteActions(updatedMessage._id);
    }
  }
});
```

**`message_updated` payload example (host invite accepted):**

```json
{
  "_id": "message_id",
  "chatId": "chat_id",
  "type": "agency_host_invite",
  "flag": "accept",
  "text": "You accepted the host invitation from Agency Name.",
  "metadata": {
    "type": "agency_host_invite",
    "status": "ACCEPTED",
    "flag": "accept",
    "agencyHostRequestId": "request_id",
    "agencyId": "...",
    "agencyName": "Agency Name",
    "isOpened": true,
    "isVerified": false
  },
  "senderId": { "name": "...", "profileImage": { "url": "..." } },
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Kab fire hota hai:**

| Action | API | `message_updated` |
|--------|-----|-------------------|
| User accept invite | `POST /host-requests/{id}/respond` `ACCEPTED` | Yes — `flag: accept` |
| User open invite | `POST /host-requests/{id}/open` | Yes — `isOpened: true` |
| User verify-view | `POST /host-requests/{id}/verify-view` | Yes — `isVerified: true` |
| User reject invite | `POST /host-requests/{id}/respond` `REJECTED` | No — use `message_deleted` |

---

### 8.3 `message_deleted` listener

Reject / delete par message chat se delete hota hai:

```javascript
socket.on('message_deleted', (payload) => {
  if (payload.type !== 'agency_host_invite') return;

  // payload = { messageId, _id, chatId, type, status, flag, requestId, reason, message }
  const messageId = payload.messageId || payload._id;
  removeMessageFromChatList(payload.chatId, messageId);
  clearAgencyHostRequestBadge(payload.chatId);
  removePendingInvite(payload.requestId);
});
```

**Important:** Reject API ke baad bhi API response se local UI update karo (socket backup ke liye):

```javascript
// POST /host-requests/{id}/respond with REJECTED
if (response.data.messageAction === 'deleted') {
  removeMessageFromChatList(response.data.chatId, response.data.messageId);
}
```

---

### 8.4 All socket events

| Event | When | Payload |
|-------|------|---------|
| `chat_created` | New chat (e.g. host invite) | Chat object |
| `new_message` | New message in chat | Message object |
| `message_updated` | Message changed (accept / open / verify) | **Full updated message** |
| `message_deleted` | Invite rejected/deleted (message removed) | `{ messageId, _id, chatId, type, flag, status, requestId, reason, message }` |
| `agency_host_invite_responded` | Accept, reject, or delete summary | `{ messageId, _id, chatId, type, flag, status, requestId, reason, message }` |
| `agency_host_invite_deleted` | Invite cancelled/deleted | `{ messageId, _id, chatId, type, flag, status, requestId, reason, message }` |

**Rooms you receive events on:**

| Room | How to join | Events |
|------|-------------|--------|
| `user_{mongoUserId}` | Auto on socket connect | All events |
| `chat_{chatId}` | `socket.emit('join_chat', { chatId })` | All events for that chat |

---

### 8.5 Flutter example (socket_io_client)

```dart
socket.on('message_updated', (data) {
  final message = Map<String, dynamic>.from(data);
  if (message['type'] == 'agency_host_invite') {
    chatController.updateMessage(message['chatId'], message);
    if (message['flag'] == 'accept') {
      chatController.hideInviteButtons(message['_id']);
    }
  }
});

socket.on('message_deleted', (data) {
  final payload = Map<String, dynamic>.from(data);
  if (payload['type'] != 'agency_host_invite') return;
  final messageId = payload['messageId'] ?? payload['_id'];
  chatController.removeMessage(payload['chatId'], messageId);
});

socket.on('agency_host_invite_deleted', (data) {
  final payload = Map<String, dynamic>.from(data);
  final messageId = payload['messageId'] ?? payload['_id'];
  chatController.removeMessage(payload['chatId'], messageId);
});
```

**Push notification data (FCM):**

```json
{
  "type": "agency_host_invite",
  "chatId": "...",
  "agencyHostRequestId": "...",
  "agencyId": "..."
}
```

---

## 9. Mobile UI flow diagrams

### Agency owner — add host

```
1. POST /verify-user/{userId} + agencyId  → show user, country, level, canInvite
2. If canInvite → POST /add-host         → invite sent
3. User accepts in chat                  → host appears in GET /hosts
```

### User — receive host invite

```
1. GET /chats                            → see agencyHostRequest on chat
2. Open chat → GET /chats/{id}/messages → see agency_host_invite message
3. POST /host-requests/{id}/open        → optional opened flag
4. POST /host-requests/{id}/verify-view → optional verified flag
5. POST /host-requests/{id}/respond     → ACCEPT or REJECT
6. GET /profile                         → if ACCEPT: isBecomeHost true
```

### User — become host (self join)

```
1. GET /verify-agency-user/{ownerUserId} → confirm agency exists
2. POST /join-by-user-id OR /become-host → join
3. GET /profile                          → isBecomeHost true, becomeHostMessage
```

---

## 10. Quick API index

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | GET | `/app/profile` | Profile + agency flags |
| 2 | POST | `/app/agencies/create` | Create agency |
| 3 | POST | `/app/agencies/verify` | Verify OTP |
| 4 | GET | `/app/agencies/dashboard` | Commission dashboard stats |
| 5 | GET | `/app/agencies/my` | Owner agency + commission |
| 6 | GET | `/app/agencies/{id}` | Agency details |
| 7 | GET | `/app/agencies/verify-agency-user/{userId}` | Verify owner has agency |
| 8 | POST | `/app/agencies/join-by-user-id` | Join as host |
| 9 | POST | `/app/agencies/become-host` | Join as host (flexible ID) |
| 10 | POST | `/app/agencies/{id}/join` | Join by agency ID |
| 11 | POST | `/app/agencies/verify-user/{userId}` | Check user for invite |
| 12 | POST | `/app/agencies/{id}/add-host` | Send host invite via chat |
| 13 | GET | `/app/agencies/{id}/hosts` | Active hosts (paginated) |
| 14 | GET | `/app/agencies/{id}/host-history` | Add host history |
| 15 | GET | `/app/agencies/host-requests/pending` | User pending invites |
| 16 | GET | `/app/agencies/host-requests/{id}` | Invite details |
| 17 | POST | `/app/agencies/host-requests/{id}/open` | Mark opened |
| 18 | POST | `/app/agencies/host-requests/{id}/verify-view` | Mark verified |
| 19 | POST | `/app/agencies/host-requests/{id}/respond` | Accept / Reject |
| 20 | GET | `/app/coins/wallet` | Owner beans balance |
| 21 | GET | `/app/coins/history` | Settlement history |
| 22 | GET | `/app/chats` | Chat list + agencyHostRequest |
| 23 | GET | `/app/chats/{chatId}/messages` | Messages incl. invites |
| 24 | POST | `/app/store/purchase` | Buy store item (quantity) |

---

## 11. Common errors

| Message | Cause |
|---------|-------|
| `Invalid user ID or host verification code` | Wrong userId + hostCode pair in add-host |
| `Host invite already pending for this user` | Duplicate add-host |
| `Host invite already responded` | Accept/reject called twice |
| `Unauthorized or agency not found` | Wrong agencyId or not owner |
| `Agency is not verified or approved yet` | join-by-user-id on unapproved agency |

---

**Commission docs:** [MOBILE_AGENCY_COMMISSION_API.md](./MOBILE_AGENCY_COMMISSION_API.md)

**Questions / Swagger:** Open `{BASE_URL}/api-docs/app` → tag **Agencies** and **Chats**.
