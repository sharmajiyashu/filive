# Razorpay Recharge Wallet API Documentation for Mobile App Developer

**Base URL**: `https://your-api-domain.com/api` (or `http://localhost:3000/api`)  
**Authentication**: Headers me `Authorization: Bearer <user_jwt_token>` required hai.

---

## 📌 Overview Flow (Flow Kaise Kaam Karega)

1. **Step 1: Packages List Fetch**:
   - App user screen par available Coin Packages show karne ke liye `GET /api/app/coins/packages` call karein.
2. **Step 2: Create Razorpay Order**:
   - Jab user kisi Package (e.g. `packageId`) par click/select karke pay par click karta hai, App backend ko `POST /api/app/coins/razorpay/create-order` request bhejega.
   - Backend Razorpay se Order ID (`orderId`), amount, currency aur keyId generate karke App ko return karega.
3. **Step 3: Open Razorpay Checkout (SDK in App)**:
   - App Razorpay Native SDK / Plugin (Flutter `razorpay_flutter` ya React Native `react-native-razorpay`) launch karega backend se mile parameters (`keyId`, `orderId`, `amount`, `currency`) ke sath.
4. **Step 4: Verify Payment & Add Coins**:
   - Payment success hone par Razorpay SDK response me `razorpay_order_id`, `razorpay_payment_id`, aur `razorpay_signature` deta hai.
   - App in parameters ko backend API `POST /api/app/coins/razorpay/verify-payment` me submit karega.
   - Backend cryptographic HMAC signature verify karega aur successfully user account me Coins credit kar ke updated wallet balance return karega.

---

## 🚀 API Endpoints Detail

### 1️⃣ Get Coin Packages
- **Endpoint**: `GET /api/app/coins/packages`
- **Headers**:
  ```http
  Authorization: Bearer <JWT_TOKEN>
  ```
- **Response Sample (200 OK)**:
  ```json
  {
    "status": 200,
    "success": true,
    "message": "Packages fetched successfully",
    "data": [
      {
        "_id": "66a01b2c4512e9a710123456",
        "name": "100 Coins Package",
        "coins": 100,
        "price": 99,
        "localPrice": 99,
        "currencyCode": "INR",
        "currencySymbol": "₹"
      }
    ]
  }
  ```

---

### 2️⃣ Create Razorpay Order
- **Endpoint**: `POST /api/app/coins/razorpay/create-order`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <JWT_TOKEN>
  ```
- **Request Body**:
  ```json
  {
    "packageId": "66a01b2c4512e9a710123456"
  }
  ```
- **Response Sample (200 OK)**:
  ```json
  {
    "status": 200,
    "success": true,
    "message": "Razorpay order created successfully",
    "data": {
      "orderId": "order_Px192abcDEF456",
      "amount": 9900,
      "currency": "INR",
      "package": {
        "id": "66a01b2c4512e9a710123456",
        "name": "100 Coins Package",
        "coins": 100,
        "price": 99
      },
      "keyId": "rzp_test_YOUR_KEY_ID",
      "user": {
        "name": "Rahul Sharma",
        "email": "user@example.com",
        "phone": "+919876543210"
      }
    }
  }
  ```

---

### 3️⃣ Verify Payment & Credit Wallet
- **Endpoint**: `POST /api/app/coins/razorpay/verify-payment`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <JWT_TOKEN>
  ```
- **Request Body**:
  ```json
  {
    "packageId": "66a01b2c4512e9a710123456",
    "razorpayOrderId": "order_Px192abcDEF456",
    "razorpayPaymentId": "pay_Px199xyzGHI789",
    "razorpaySignature": "495fa04e172bc9776d6541f5a5e3782976d8b9e602710bbef42a0b123456789a"
  }
  ```
- **Response Sample (200 OK)**:
  ```json
  {
    "status": 200,
    "success": true,
    "message": "Payment verified successfully",
    "data": {
      "success": true,
      "message": "Payment verified and coins added successfully",
      "transactionId": "pay_Px199xyzGHI789",
      "orderId": "order_Px192abcDEF456",
      "addedCoins": 100,
      "currentCoins": 1500,
      "history": {
        "_id": "66a9876543210123456789ab",
        "userId": "66a000000000000000000001",
        "amount": 100,
        "type": "recharge",
        "description": "Recharged with 100 Coins Package via Razorpay",
        "transactionId": "pay_Px199xyzGHI789",
        "createdAt": "2026-07-29T12:00:00.000Z"
      }
    }
  }
  ```

---

## 📱 Mobile App Code Integration Example (Flutter / React Native)

### Flutter Example:
```dart
import 'package:razorpay_flutter/razorpay_flutter.dart';

Razorpay _razorpay = Razorpay();

void startPayment(Map<String, dynamic> orderData, String packageId) {
  var options = {
    'key': orderData['keyId'],
    'amount': orderData['amount'], // in paise
    'name': 'FiLive Recharge',
    'description': orderData['package']['name'],
    'order_id': orderData['orderId'],
    'prefill': {
      'contact': orderData['user']['phone'],
      'email': orderData['user']['email']
    }
  };

  _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse response) {
    // Call verify-payment API
    verifyPaymentOnBackend(
      packageId: packageId,
      orderId: response.orderId!,
      paymentId: response.paymentId!,
      signature: response.signature!,
    );
  });

  _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse response) {
    // Handle Payment Error
    print("Payment Error: ${response.message}");
  });

  _razorpay.open(options);
}
```

---

## ⚙️ Environment Configuration Required on Server `.env`

Make sure your server `.env` contains:
```env
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
```
