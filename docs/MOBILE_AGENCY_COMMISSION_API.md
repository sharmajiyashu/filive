# Filive Mobile API — Agency Commission Dashboard

**Version:** 1.0  
**Base URL (Production):** `https://filive.vercel.app/v1/api`  
**Base URL (Local):** `http://localhost:{PORT}/v1/api`  
**Swagger:** `{BASE_URL}/api-docs/app` → tags **Agencies**, **Coins**

**Related docs:** [Agency, Host & Chat Integration](./MOBILE_AGENCY_CHAT_API.md)

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

## Overview

Agency commission is calculated from **verified host earnings** (beans) across all hosts under the agency. Commission is **not paid instantly** — it accumulates in **Pending Commission** and is settled **weekly (every Monday)** into the agency owner's normal **beans** wallet.

```
Gifts → Host verified earnings → Commission % applied → Pending Commission
                                                              ↓
                                              Monday settlement
                                                              ↓
                                         Owner beans balance (wallet)
```

**Who can access commission APIs?**

| User | Access |
|------|--------|
| Agency owner (`isAgencyHost: true`) | Full dashboard + commission |
| Joined host (`isBecomeHost: true`) | No commission APIs |
| Normal user | No access |

Check role from profile:

```http
GET /app/profile
```

| Field | When true | UI action |
|-------|-----------|-----------|
| `isAgencyHost` | User created the agency | Show Agency Dashboard |
| `agency` | Owner only | Agency object for owner screens |
| `isBecomeHost` | User joined as host | Show simple host status only |
| `becomeHostMessage` | Joined host | e.g. `"You are a host under Agency Name."` |

---

## Commission rate slabs (reference)

Rates are admin-configurable. Default tiers:

| Total weekly host earnings (beans) | Commission % |
|-----------------------------------|--------------|
| 0 – 500,000 | 5% |
| 500,001 – 1,000,000 | 10% |
| 1,000,001 – 2,000,000 | 15% |
| 2,000,001+ | 20% |

The active rate is returned as `currentCommissionRate` in API responses. Display that value — no separate mobile endpoint is needed.

**Formula:**

```
thisWeekCommission = totalHostEarnings × (currentCommissionRate / 100)
```

**Example:** 2,000,000 beans at 15% → **300,000 beans** pending commission.

---

## 1. Agency Commission Dashboard (PRIMARY)

Use this endpoint for the **Agency Dashboard** screen.

```http
GET /app/agencies/dashboard
```

**Auth:** Agency owner only

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

### Field mapping (UI labels)

| API field | UI label | Description |
|-----------|----------|-------------|
| `totalHosts` | Total Hosts | All accepted hosts registered under the agency |
| `activeHosts` | Active Hosts | Hosts who generated valid earnings this settlement week |
| `totalHostEarnings` | Total Host Earnings | Sum of verified host earnings (beans) this week |
| `currentCommissionRate` | Current Commission Rate | Active % from slab or admin settings |
| `pendingCommission` | Pending Commission | Earned commission not yet settled to wallet |
| `thisWeekCommission` | This Week Commission | Total commission for the current week |
| `lastSettlementDate` | Last Settlement Date | Date of the previous settlement |
| `nextSettlementDate` | Next Settlement Date | Next scheduled settlement (Monday) |
| `isFrozen` | — | `true` = agency account frozen by admin |
| `isCommissionHeld` | — | `true` = commission on hold, will not settle |

### Status banners

| Condition | Suggested UI |
|-----------|--------------|
| `isFrozen === true` | Show "Account Frozen" banner; disable commission actions |
| `isCommissionHeld === true` | Show "Commission On Hold" banner; pending still visible |

---

## 2. My agency (profile + extended commission)

```http
GET /app/agencies/my
```

**Auth:** Agency owner only

Returns full agency object plus `commissionDetails` (dashboard fields + 30-day history).

**Response (abbreviated):**

```json
{
  "_id": "agency_mongo_id",
  "name": "My Agency",
  "mobile": "9876543210",
  "email": "agency@email.com",
  "description": "...",
  "isVerified": true,
  "status": "approved",
  "commissionRate": 10,
  "useAgencyCommissionRate": false,
  "pendingCommission": 300000,
  "thisWeekHostEarnings": 2000000,
  "thisWeekCommission": 300000,
  "lastSettlementDate": "2026-06-02T10:00:00.000Z",
  "nextSettlementDate": "2026-06-09T00:00:00.000Z",
  "isFrozen": false,
  "isCommissionHeld": false,
  "countryId": { },
  "creatorId": { },
  "commissionDetails": {
    "totalHosts": 20,
    "activeHosts": 12,
    "totalHostEarnings": 2000000,
    "currentCommissionRate": 15,
    "pendingCommission": 300000,
    "thisWeekCommission": 300000,
    "lastSettlementDate": "2026-06-02T10:00:00.000Z",
    "nextSettlementDate": "2026-06-09T00:00:00.000Z",
    "isFrozen": false,
    "isCommissionHeld": false,
    "commissionRate": 15,
    "last30DaysCommission": 850000,
    "totalEarnings": 2000000,
    "myCommission": 300000,
    "last30DaysEarnings": 5500000
  }
}
```

### `commissionDetails` fields

| Field | Description |
|-------|-------------|
| `totalHosts` | Same as dashboard |
| `activeHosts` | Same as dashboard |
| `totalHostEarnings` | Current week verified host earnings |
| `currentCommissionRate` | Active commission % |
| `pendingCommission` | Unsettled commission |
| `thisWeekCommission` | Commission earned this week |
| `lastSettlementDate` | Previous settlement date |
| `nextSettlementDate` | Next settlement date |
| `commissionRate` | Alias of `currentCommissionRate` (backward compatible) |
| `myCommission` | Alias of `thisWeekCommission` |
| `totalEarnings` | Alias of `totalHostEarnings` |
| `last30DaysEarnings` | Verified host earnings in last 30 days |
| `last30DaysCommission` | Settled commission paid in last 30 days |

**Recommendation:** Use `GET /app/agencies/dashboard` for the dashboard screen; use `/my` for agency profile/settings.

---

## 3. Agency details by ID

```http
GET /app/agencies/{agencyId}
```

If the **caller is the agency owner**, the response includes the same `commissionDetails` object as `GET /app/agencies/my`.

---

## 4. Owner beans wallet (after settlement)

Commission is credited to the agency owner's **normal beans balance** — no separate agency wallet.

```http
GET /app/coins/wallet
```

**Response:**

```json
{
  "coins": 5000,
  "beans": 325000
}
```

Refresh on dashboard open, pull-to-refresh, and after Monday settlement.

---

## 5. Settlement history (coin history)

After weekly settlement, entries appear in coin history with type `agency_commission`.

```http
GET /app/coins/history?page=1&limit=20
```

**Example entry:**

```json
{
  "data": [
    {
      "_id": "...",
      "amount": 300000,
      "type": "agency_commission",
      "description": "Agency commission settlement (auto)",
      "createdAt": "2026-06-09T00:05:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

Use this for a "Settlement History" or "Commission Received" list on the owner profile.

---

## 6. Agency hosts (dashboard support)

```http
GET /app/agencies/{agencyId}/hosts?page=1&limit=10
```

**Auth:** Agency owner only (`agencyId` = `_id` from `GET /app/agencies/my`)

**Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 10 | Items per page |

**Response:**

```json
{
  "data": [
    {
      "id": "host_request_id",
      "agencyId": "...",
      "status": "ACCEPTED",
      "requestedBy": "AGENCY",
      "isOpened": true,
      "isVerified": true,
      "createdAt": "2026-05-01T08:00:00.000Z",
      "user": {
        "id": "...",
        "userId": 100045,
        "name": "Host Name",
        "profileImage": { },
        "email": "host@email.com",
        "mobile": "9876543210",
        "isPremium": false,
        "richLevelInfo": { },
        "charmLevelInfo": { }
      }
    }
  ],
  "total": 20,
  "page": 1,
  "limit": 10,
  "totalPages": 2
}
```

---

## 7. Recommended screen flow

```
GET /app/profile
    └── isAgencyHost === true?
            └── Agency Dashboard Screen
                    ├── GET /app/agencies/dashboard      → stat cards
                    ├── GET /app/agencies/{id}/hosts       → host list tab
                    ├── GET /app/coins/wallet              → beans balance header
                    └── GET /app/coins/history             → settlement history
```

**When to refresh:**

- On dashboard open
- Pull-to-refresh
- After Monday (settlement day)
- Returning from host management screens

---

## 8. Settlement behaviour (backend)

| Step | What happens |
|------|--------------|
| 1 | Hosts receive gifts; verified earnings accumulate |
| 2 | Commission % applied from slab (or admin override) |
| 3 | `pendingCommission` and `thisWeekCommission` update in real time |
| 4 | Every **Monday**, pending commission transfers to owner `beans` |
| 5 | `pendingCommission` resets to `0`; new week cycle starts |

Commission does **not** generate from: refunded recharges, chargebacks, suspicious gifts, self-gifting, cancelled payments, or blocked users. Only verified gift transactions count.

---

## 9. Endpoint summary

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | GET | `/app/profile` | Check `isAgencyHost` / role |
| 2 | GET | `/app/agencies/dashboard` | **Commission dashboard stats** |
| 3 | GET | `/app/agencies/my` | Agency profile + `commissionDetails` |
| 4 | GET | `/app/agencies/{agencyId}` | Agency details (owner gets commission) |
| 5 | GET | `/app/coins/wallet` | Owner beans balance |
| 6 | GET | `/app/coins/history` | Settlement history (`agency_commission`) |
| 7 | GET | `/app/agencies/{agencyId}/hosts` | Paginated host list |

For create agency, OTP, become host, chat invites, and host management see [MOBILE_AGENCY_CHAT_API.md](./MOBILE_AGENCY_CHAT_API.md).

---

## 10. Common errors

| Message | Cause | UI action |
|---------|-------|-----------|
| `Agency not found for this user` | Caller is not an agency owner | Hide dashboard |
| `Unauthorized or agency not found` | Wrong `agencyId` or not owner | Show error |
| `isFrozen: true` in response | Admin froze agency | Show frozen banner |
| `isCommissionHeld: true` in response | Admin held commission | Show hold banner |

---

## 11. cURL examples

```bash
# Commission dashboard
curl -H "Authorization: Bearer <TOKEN>" \
  https://filive.vercel.app/v1/api/app/agencies/dashboard

# My agency with commissionDetails
curl -H "Authorization: Bearer <TOKEN>" \
  https://filive.vercel.app/v1/api/app/agencies/my

# Beans wallet
curl -H "Authorization: Bearer <TOKEN>" \
  https://filive.vercel.app/v1/api/app/coins/wallet

# Settlement history
curl -H "Authorization: Bearer <TOKEN>" \
  "https://filive.vercel.app/v1/api/app/coins/history?page=1&limit=20"
```

---

**Questions / live schema:** Open `{BASE_URL}/api-docs/app` → tags **Agencies** and **Coins**.
