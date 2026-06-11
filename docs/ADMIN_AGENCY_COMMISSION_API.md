# Filive Admin API — Agency Commission Management

**Version:** 1.0  
**Base URL (Production):** `https://filive.vercel.app/v1/api`  
**Base URL (Local):** `http://localhost:{PORT}/v1/api`  
**Swagger:** `{BASE_URL}/api-docs/admin`

**Related docs:** [Mobile Agency Commission API](./MOBILE_AGENCY_COMMISSION_API.md)

---

## Authentication

All endpoints require admin JWT:

```http
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Standard response wrapper:**

```json
{
  "success": true,
  "message": "Human readable message",
  "data": { ... }
}
```

---

## Overview

Admin can manage:

- Commission slabs (tiered rates by host earnings)
- Global commission settings
- Agency-specific commission overrides
- Manual / bulk settlement
- Hold commission or freeze agency
- Commission logs and settlement history

**Base path:** `/admin/agency-commission`

---

## 1. Commission slabs

### List slabs

```http
GET /admin/agency-commission/slabs
```

**Response `data`:** array of slabs

```json
[
  {
    "_id": "...",
    "minEarnings": 0,
    "maxEarnings": 500000,
    "percentage": 5,
    "isActive": true,
    "sortOrder": 1,
    "createdAt": "...",
    "updatedAt": "..."
  },
  {
    "_id": "...",
    "minEarnings": 2000001,
    "maxEarnings": null,
    "percentage": 20,
    "isActive": true,
    "sortOrder": 4
  }
]
```

### Create slab

```http
POST /admin/agency-commission/slabs
```

**Body:**

```json
{
  "minEarnings": 0,
  "maxEarnings": 500000,
  "percentage": 5,
  "isActive": true,
  "sortOrder": 1
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `minEarnings` | Yes | Lower bound (beans) |
| `maxEarnings` | No | Upper bound; `null` = unlimited |
| `percentage` | Yes | 0–100 |
| `isActive` | No | Default `true` |
| `sortOrder` | No | Display / evaluation order |

### Update slab

```http
PUT /admin/agency-commission/slabs/{slabId}
```

**Body:** any of the create fields (partial update)

### Delete slab

```http
DELETE /admin/agency-commission/slabs/{slabId}
```

---

## 2. Global commission settings

### Get settings

```http
GET /admin/agency-commission/settings
```

**Response `data`:**

```json
{
  "globalCommissionRate": 10,
  "useCommissionSlabs": true,
  "autoSettlementEnabled": true,
  "settlementDay": 1
}
```

| Field | Description |
|-------|-------------|
| `globalCommissionRate` | Flat % when slabs disabled |
| `useCommissionSlabs` | Use tiered slabs based on weekly earnings |
| `autoSettlementEnabled` | Auto-settle on settlement day |
| `settlementDay` | `0` = Sunday, `1` = Monday, etc. |

### Update settings

```http
PUT /admin/agency-commission/settings
```

**Body (all optional):**

```json
{
  "globalCommissionRate": 10,
  "useCommissionSlabs": true,
  "autoSettlementEnabled": true,
  "settlementDay": 1
}
```

---

## 3. Agency-specific commission

### Set agency commission rate

Overrides slab system when `useAgencyCommissionRate` is true.

```http
PUT /admin/agency-commission/agencies/{agencyId}/rate
```

**Body:**

```json
{
  "commissionRate": 12,
  "useAgencyCommissionRate": true
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `commissionRate` | Yes | 0–100 |
| `useAgencyCommissionRate` | No | Default `true`; set `false` to revert to slabs/global |

---

## 4. Hold & freeze

### Hold commission

Prevents settlement; earnings may still accrue but commission won't pay out.

```http
PUT /admin/agency-commission/agencies/{agencyId}/hold
```

**Body:**

```json
{
  "hold": true
}
```

Set `"hold": false` to release.

### Freeze agency

Blocks commission generation and settlement.

```http
PUT /admin/agency-commission/agencies/{agencyId}/freeze
```

**Body:**

```json
{
  "freeze": true
}
```

Set `"freeze": false` to unfreeze.

---

## 5. Manual settlement

### Settle one agency

```http
POST /admin/agency-commission/settle
```

**Body:**

```json
{
  "agencyId": "agency_mongo_id"
}
```

**Response `data` (success):**

```json
{
  "settled": true,
  "amount": 300000,
  "message": "300000 beans transferred to agency owner balance",
  "settlement": {
    "_id": "...",
    "agencyId": "...",
    "amount": 300000,
    "commissionRate": 15,
    "hostEarningsTotal": 2000000,
    "type": "manual",
    "status": "completed"
  }
}
```

### Settle all eligible agencies

```http
POST /admin/agency-commission/settle
```

**Body:** `{}` (omit `agencyId`)

**Response `data`:**

```json
{
  "settledCount": 3,
  "results": [
    {
      "agencyId": "...",
      "settled": true,
      "amount": 25000,
      "message": "25000 beans transferred to agency owner balance"
    },
    {
      "agencyId": "...",
      "settled": false,
      "amount": 0,
      "message": "No pending commission to settle"
    }
  ]
}
```

Settlement credits the agency owner's **beans** balance and resets `pendingCommission` to `0`.

---

## 6. Commission logs

```http
GET /admin/agency-commission/agencies/{agencyId}/logs?page=1&limit=20
```

**Query params:**

| Param | Description |
|-------|-------------|
| `page` | Page number (default 1) |
| `limit` | Per page (default 20) |
| `type` | Filter: `accrual`, `settlement`, `reversal`, `adjustment` |
| `status` | Filter: `pending`, `settled`, `held`, `reversed` |

**Response:**

```json
{
  "data": [
    {
      "_id": "...",
      "agencyId": "...",
      "hostUserId": { "name": "Host", "userId": 100045 },
      "amount": 7500,
      "commissionRate": 15,
      "hostEarningsAmount": 50000,
      "type": "accrual",
      "status": "pending",
      "cycleStart": "2026-06-02T00:00:00.000Z",
      "description": "Commission accrual from host earning of 50000 beans at 15%",
      "createdAt": "..."
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

## 7. Settlement history

```http
GET /admin/agency-commission/agencies/{agencyId}/settlements?page=1&limit=20
```

**Response:**

```json
{
  "data": [
    {
      "_id": "...",
      "agencyId": "...",
      "ownerUserId": { "name": "Owner", "userId": 100001 },
      "amount": 300000,
      "commissionRate": 15,
      "hostEarningsTotal": 2000000,
      "periodStart": "2026-06-02T00:00:00.000Z",
      "periodEnd": "2026-06-09T00:05:00.000Z",
      "type": "auto",
      "status": "completed",
      "createdAt": "..."
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

## 8. Agency list & approval (existing)

Agency approval and listing use the existing admin agencies API:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/agencies` | List agencies (filter by status, search) |
| GET | `/admin/agencies/{id}` | Agency details |
| PUT | `/admin/agencies/{id}/status` | Approve / reject agency |

**Approve body:**

```json
{
  "status": "approved"
}
```

---

## 9. Endpoint summary

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | GET | `/admin/agency-commission/slabs` | List commission slabs |
| 2 | POST | `/admin/agency-commission/slabs` | Create slab |
| 3 | PUT | `/admin/agency-commission/slabs/{id}` | Update slab |
| 4 | DELETE | `/admin/agency-commission/slabs/{id}` | Delete slab |
| 5 | GET | `/admin/agency-commission/settings` | Get global settings |
| 6 | PUT | `/admin/agency-commission/settings` | Update global settings |
| 7 | PUT | `/admin/agency-commission/agencies/{id}/rate` | Agency-specific % |
| 8 | PUT | `/admin/agency-commission/agencies/{id}/hold` | Hold / release commission |
| 9 | PUT | `/admin/agency-commission/agencies/{id}/freeze` | Freeze / unfreeze agency |
| 10 | POST | `/admin/agency-commission/settle` | Manual settlement |
| 11 | GET | `/admin/agency-commission/agencies/{id}/logs` | Commission logs |
| 12 | GET | `/admin/agency-commission/agencies/{id}/settlements` | Settlement history |
| 13 | GET | `/admin/agencies` | List agencies |
| 14 | PUT | `/admin/agencies/{id}/status` | Approve / reject |

---

## 10. Default seeded slabs

Run `npm run db:seed` to seed defaults:

| Host earnings (beans) | Rate |
|-----------------------|------|
| 0 – 500,000 | 5% |
| 500,001 – 1,000,000 | 10% |
| 1,000,001 – 2,000,000 | 15% |
| 2,000,001+ | 20% |

---

## 11. cURL examples

```bash
# List slabs
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  https://filive.vercel.app/v1/api/admin/agency-commission/slabs

# Update settings
curl -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"autoSettlementEnabled":true,"useCommissionSlabs":true}' \
  https://filive.vercel.app/v1/api/admin/agency-commission/settings

# Manual settle one agency
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"agencyId":"<AGENCY_ID>"}' \
  https://filive.vercel.app/v1/api/admin/agency-commission/settle
```

---

**Live schema:** `{BASE_URL}/api-docs/admin`
