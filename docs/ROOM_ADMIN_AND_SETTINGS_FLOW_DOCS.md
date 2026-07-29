# Room Settings, Admin & Share Flow API Documentation

**Base URL**: `https://your-api-domain.com/api` (or `http://localhost:3000/api`)  
**Authentication**: Headers me `Authorization: Bearer <user_jwt_token>` required hai.

---

## 📌 1. Room Admin Management (Make & Remove Admin)

Jab kisi Party Room me Host kisi joined user ko Admin banana chahta hai ya Admin role se hatana chahta hai, to is API ka use hoga.

- **Endpoint**: `POST /api/app/room/admin`
- **Security**: Bearer JWT (Host Only)
- **Request Body**:
  ```json
  {
    "channelName": "live_66a000000000000000000001_1722240000",
    "targetUserId": "1000284759", // Mongo _id YA 10-digit numeric userId dono support karta hai
    "isAdmin": true // true = Admin Banana, false = Admin se Hatana
  }
  ```

- **Validation & Verification Flow**:
  1. Room verify karta hai ki active hai ya nahi.
  2. Verify karta hai ki request bhejnewala **Host** hai ya nahi.
  3. **Verification Check**: Verify karta hai ki `targetUserId` user is room me **Joined List / Active Viewers** me moujood hai ya nahi. Agar user room me join nahi hai to error exception aayegi.
  4. Room Setting me `admins` list update karke Socket.io (`user_made_admin`) event real-time room me emit kar deta hai.

- **Response Sample (200 OK)**:
  ```json
  {
    "status": 200,
    "success": true,
    "message": "Admin status updated",
    "data": {
      "_id": "66a111111111111111111111",
      "hostId": "66a000000000000000000001",
      "maxSeats": 4,
      "admins": [
        {
          "_id": "66a000000000000000000002",
          "userId": 1000284759,
          "name": "Rahul Sharma",
          "profileImage": {
            "url": "https://example.com/profile.jpg"
          }
        }
      ],
      "announcement": "Welcome to my Party Room!",
      "muteAllSeats": false
    }
  }
  ```

---

## 📌 2. Get Room Settings (Includes Room Admins Data)

Room ki saari settings (Admin list, Theme, Max Seats, Mute Status, etc.) get karne ke liye:

- **Endpoint**: `GET /api/app/room/settings`
- **Security**: Bearer JWT
- **Response Sample (200 OK)**:
  ```json
  {
    "status": 200,
    "success": true,
    "message": "Room settings fetched successfully",
    "data": {
      "_id": "66a111111111111111111111",
      "hostId": "66a000000000000000000001",
      "maxSeats": 4,
      "admins": [
        {
          "_id": "66a000000000000000000002",
          "userId": 1000284759,
          "name": "Rahul Sharma",
          "gender": "Male",
          "profileImage": {
            "url": "https://example.com/profile.jpg"
          }
        }
      ],
      "roomTheme": {
        "_id": "66a222222222222222222222",
        "name": "Neon Party",
        "media": { "url": "https://example.com/theme.jpg" }
      },
      "announcement": "Welcome all!",
      "muteAllSeats": false,
      "roomType": "party_room",
      "partyRoomOption": "live"
    }
  }
  ```

---

## 📌 3. Update Room Settings

Room settings update karne ke liye:

- **Endpoint**: `POST /api/app/room/settings`
- **Security**: Bearer JWT (Host/Admin)
- **Request Body**:
  ```json
  {
    "maxSeats": 8,
    "announcement": "Updated announcement text",
    "muteAllSeats": false
  }
  ```

---

## 📌 4. Room Share & Join Flow

App me Room Share karne par Deep Link / Share URL format:
`https://filive.app/room/join?channelName={channelName}&hostId={hostId}`

Jab doosra user app me deep-link se open karke join karta hai:

- **Endpoint**: `POST /api/app/room/join`
- **Request Body**:
  ```json
  {
    "channelName": "live_66a000000000000000000001_1722240000"
  }
  ```
- **Join Result**:
  - User room ke `joinedUsers` aur `viewers` list me add ho jata hai.
  - User ab admin banne ke liye eligible ho jata hai (kyunki wo active joined user ban chuka hai).
