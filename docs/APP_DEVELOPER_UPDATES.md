# Filive — App Developer Updates (Short)

**Share this with mobile team**  
**Base URL:** `https://filive.vercel.app/v1/api`  
**Auth:** `Authorization: Bearer <JWT_TOKEN>`

---

## 1. Kya naya add hua? (Summary)

| Feature | Status |
|---------|--------|
| Agency Commission Dashboard | ✅ New API |
| Agency owner commission stats | ✅ Updated `/my` response |
| Weekly settlement → owner beans wallet | ✅ Backend ready |
| Add host user check — country & level | ✅ Fixed response |
| Store buy multiple quantity | ✅ `quantity` param added |
| Commission slabs + settings | ✅ Seeded in DB |

---

## 2. Naye / Updated Mobile APIs

### A) Agency Commission Dashboard (NEW)

```http
GET /app/agencies/dashboard
```

**Owner only** (`isAgencyHost: true`)

| Field | UI Label |
|-------|----------|
| `totalHosts` | Total Hosts |
| `activeHosts` | Active Hosts |
| `totalHostEarnings` | Total Host Earnings (this week) |
| `currentCommissionRate` | Current Commission % |
| `pendingCommission` | Pending Commission |
| `thisWeekCommission` | This Week Commission |
| `lastSettlementDate` | Last Settlement |
| `nextSettlementDate` | Next Settlement (Monday) |
| `isFrozen` | Account frozen banner |
| `isCommissionHeld` | Commission on hold banner |

---

### B) My Agency — commissionDetails updated

```http
GET /app/agencies/my
```

Ab `commissionDetails` mein dashboard fields + 30-day history:

```json
"commissionDetails": {
  "totalHosts": 20,
  "activeHosts": 12,
  "totalHostEarnings": 2000000,
  "currentCommissionRate": 15,
  "pendingCommission": 300000,
  "thisWeekCommission": 300000,
  "lastSettlementDate": "...",
  "nextSettlementDate": "...",
  "last30DaysEarnings": 5500000,
  "last30DaysCommission": 850000
}
```

---

### C) Owner Beans Wallet (settlement ke baad)

```http
GET /app/coins/wallet
```

```json
{ "coins": 5000, "beans": 325000 }
```

Settlement history:

```http
GET /app/coins/history
```

Filter: `type === "agency_commission"`

---

### D) Coin Seller — User Check (FIXED)

```http
GET /app/coin-seller/check-user/{numericUserId}
```

**Ab ye fields aati hain:** `country`, `countryId`, `level`, `levelInfo`, `richLevelInfo`, `charmLevel`, `charmLevelInfo`

---

### E) Add Host — User Check (FIXED)

```http
POST /app/agencies/verify-user/{numericUserId}
```

**Body:**
```json
{ "agencyId": "agency_mongo_id" }
```

**Ab ye fields properly aati hain:**

| Field | Type |
|-------|------|
| `country` | Full country object |
| `countryId` | Country ID |
| `level` | Current rich level object |
| `levelInfo` | currentLevel + nextLevel + progressPercentage |
| `richLevelInfo` | Same as levelInfo |
| `charmLevel` | Current charm level |
| `charmLevelInfo` | Charm level details |
| `hostStatus.canInvite` | Can send invite? |

---

### F) Store Purchase — Multiple Buy (UPDATED)

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

**Response:** Same frame purchases now **stack validity** into one inventory row.

```json
{
  "quantity": 3,
  "totalCoinsSpent": 300,
  "items": [ { "expiresAt": "...", "remainingDays": 3 } ],
  "item": { "expiresAt": "...", "remainingDays": 3 },
  "expiresAt": "...",
  "remainingMs": 259200000,
  "remainingDays": 3
}
```

8 x 1-day frame = **1 entry, ~8 days remaining** (not 8 separate 23-hour timers).

---

## 4. Ranking / Comments / Block / Video Match (UPDATED)

### Rankings
`GET /app/rankings?type=rich|charm&period=daily|weekly|monthly|alltime&country=IN|all`

- Rich score = gift coins **sent**
- Charm score = gift coins **received**
- `country` / `countryId` / `countryCode` filter; omit = current user's country; `all` = worldwide
- Each row: `score`, `user.name`, `user.profileImage`, `user.country`, `user.level`, `user.charmLevel`, `richLevelInfo`, `charmLevelInfo`

### Comments
`POST /app/stories/:id/comment`

```json
{ "content": "Thanks!", "parentCommentId": "optional_parent_id" }
```

Response now includes populated `user` / `userId` and `replyToUser`.

`GET /app/stories/:id/comments` returns top-level comments with nested `replies[]`.

### Block / Blacklist
- `GET /app/users/blocked` — profile, `userId`, status, `canUnblock`
- `POST /app/users/unblock/:id` — unblock
- Message send is rejected both ways after block (`You are blocked by this user`)
- Chat details: `isBlocked`, `blockedByMe`, `blockedByOther`, `canSendMessage`, `blockMessage`

### Video Match card
- `GET /app/calls/hosts?callType=video` — online female hosts, shuffled for card rotate
- `GET /app/calls/available-hosts?callType=video`
- `GET /app/random-match/available-hosts?callType=video` — hosts currently opted into random match

---

## 3. Pehle se existing APIs (no change in URL)

Ye APIs pehle se hain — commission doc ke saath use karo:

| API | Purpose |
|-----|---------|
| `GET /app/profile` | `isAgencyHost`, `isBecomeHost`, `agency` flags |
| `POST /app/agencies/create` | Create agency |
| `POST /app/agencies/verify` | OTP verify |
| `POST /app/agencies/join-by-user-id` | User joins as host |
| `POST /app/agencies/{id}/add-host` | Owner invites host via chat |
| `GET /app/agencies/{id}/hosts` | Host list |
| `GET /app/chats` | Host invite in chat list |

Full flow: [MOBILE_AGENCY_CHAT_API.md](./MOBILE_AGENCY_CHAT_API.md)  
Commission detail: [MOBILE_AGENCY_COMMISSION_API.md](./MOBILE_AGENCY_COMMISSION_API.md)

---

## 4. DB Seed — kya data add hua?

Jab `npm run db:seed` chalaya, ye data database mein add/update hua:

### Commission Slabs (default tiers)

| Weekly Host Earnings (beans) | Commission % |
|------------------------------|--------------|
| 0 – 500,000 | 5% |
| 500,001 – 1,000,000 | 10% |
| 1,000,001 – 2,000,000 | 15% |
| 2,000,001+ | 20% |

### App Settings (admin configurable)

| Setting Key | Default Value | Meaning |
|-------------|---------------|---------|
| `agency_global_commission_rate` | 10 | Flat % jab slabs off hon |
| `agency_use_commission_slabs` | true | Slab system on |
| `agency_auto_settlement_enabled` | true | Auto Monday settlement |
| `agency_settlement_day` | 1 | Monday (0=Sunday) |

> Slabs sirf tab insert hote hain jab DB mein koi slab pehle se na ho.

---

## 5. Commission ka flow (mobile UI ke liye)

```
Host gifts receive → Backend counts verified earnings
        ↓
Commission % apply (slab ke hisab se)
        ↓
pendingCommission badhta hai (wallet mein NAHI jata)
        ↓
Har Monday → owner ke beans balance mein transfer
        ↓
pendingCommission = 0, naya week start
```

**Important:** Commission owner ke normal `beans` wallet mein jata hai — alag agency wallet nahi hai.

---

## 6. Mobile screens — kya banana hai?

| Screen | APIs use karo |
|--------|---------------|
| Agency Dashboard | `GET /dashboard` + `GET /coins/wallet` |
| Host List | `GET /agencies/{id}/hosts` |
| Settlement History | `GET /coins/history` (type: agency_commission) |
| Add Host — User Search | `POST /verify-user/{userId}` → country + level dikhao |
| Add Host — Send Invite | `POST /add-host` |
| Store Buy | `POST /store/purchase` with `quantity` |

---

## 7. Quick API index (sirf changes)

| # | Method | Endpoint | Change |
|---|--------|----------|--------|
| 1 | GET | `/app/agencies/dashboard` | **NEW** — commission dashboard |
| 2 | GET | `/app/agencies/my` | **UPDATED** — commissionDetails expanded |
| 3 | GET | `/app/coins/wallet` | Use for owner beans after settlement |
| 4 | GET | `/app/coins/history` | Settlement entries `agency_commission` |
| 5 | GET | `/app/coin-seller/check-user/{userId}` | **FIXED** — country + level objects |
| 6 | POST | `/app/agencies/verify-user/{userId}` | **FIXED** — country + level objects |
| 7 | POST | `/app/store/purchase` | **UPDATED** — `quantity` param |

---

## 8. Profile flags (yaad rakho)

```json
// Agency Owner
{ "isAgencyHost": true, "agency": { ... }, "isBecomeHost": false }

// Joined Host (no commission access)
{ "isAgencyHost": false, "isBecomeHost": true, "becomeHostMessage": "..." }

// Normal user
{ "isAgencyHost": false, "isBecomeHost": false }
```

---

**Swagger:** `{BASE_URL}/api-docs/app`  
**Questions:** Backend team / full docs in `docs/` folder
