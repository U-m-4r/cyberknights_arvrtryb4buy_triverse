# backend/ — TRIVERSE Firebase Backend

**Owner: Dhruv**

---

## Your Responsibilities

You own the entire server-side infrastructure. Your job is to:

1. **Initialize Firebase** project and configure hosting + functions
2. **Write Cloud Functions** that expose HTTP endpoints the frontend calls
3. **Manage Firestore** — store and retrieve cached product + price data
4. **Configure CORS** so the frontend (on localhost or `.web.app`) can call your functions
5. **Handle rate limiting** — prevent abuse of the scraping functions
6. **Deploy** to Firebase Hosting and Cloud Functions

You do NOT handle UI, scraping logic, or AR. You call Shoaib's data-service functions and wrap them in Firebase infrastructure.

---

## Cloud Functions You Own

### `POST /extractProduct`
- **Input**: `{ "url": "https://www.amazon.in/dp/XXXXXX" }`
- **What it does**:
  1. Check Firestore `products` collection for a cached result for this URL
  2. If cache is fresh (< 24h), return it immediately
  3. If not, call `extractProduct(url)` from `data-service/extractor.js`
  4. Save result to Firestore with a `fetchedAt` timestamp
  5. Return the product JSON to the frontend
- **Output**: Product JSON (see `data-service/README.md` for shape)
- **Error**: `{ "error": "message" }` with appropriate HTTP status code

### `GET /getPrices`
- **Input**: Query param `?productName=Wakefit+Orthopaedic+Sofa`
- **What it does**:
  1. Check Firestore `prices` collection for a cached result
  2. If cache is fresh (< 1h), return it
  3. If not, call `getPrices(productName)` from `data-service/priceCompare.js`
  4. Cache result in Firestore
  5. Return prices array
- **Output**: Array of price objects (see `data-service/README.md` for shape)

---

## How to Run Locally (Firebase Emulator)

### First-time Setup
```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Log in
firebase login

# Initialize project (inside backend/)
firebase use YOUR_PROJECT_ID

# Install function dependencies
cd functions && npm install
```

### Run Emulator
```bash
# From backend/ directory
firebase emulators:start

# Emulator URLs (default):
# Functions:  http://127.0.0.1:5001
# Firestore:  http://127.0.0.1:8080
# Hosting:    http://127.0.0.1:5000
# Emulator UI: http://127.0.0.1:4000
```

### Test a Function
```bash
# Test extractProduct (POST)
curl -X POST http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/extractProduct \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.in/dp/B08XYZ123"}'

# Test getPrices (GET)
curl "http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/getPrices?productName=Wakefit+Sofa"
```

---

## How to Deploy

```bash
# Deploy everything (hosting + functions)
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

---

## Firestore Data Structure

```
products/                        ← collection
  {urlHash}/                     ← document ID = MD5 hash of the product URL
    name: string
    platform: string
    originalPrice: number
    currency: string
    imageUrl: string
    category: string
    dimensions: { raw, lengthCm, widthCm, heightCm }
    glbUrl: string
    productUrl: string
    fetchedAt: Timestamp

prices/                          ← collection
  {productNameHash}/             ← document ID = MD5 hash of product name
    results: Array<{ platform, price_inr, url, in_stock }>
    fetchedAt: Timestamp
```

---

## Environment Variables

Never hardcode secrets. Use Firebase environment config:
```bash
# Set config values
firebase functions:config:set somekey.value="VALUE"

# Access in functions/index.js
const config = functions.config();
const value = config.somekey.value;
```

For local emulator, create `functions/.env` (already in `.gitignore`):
```
SOME_API_KEY=your_key_here
```

---

## CORS Policy

Your functions must allow requests from:
- `http://localhost` and `http://127.0.0.1` (local dev)
- `https://YOUR_PROJECT_ID.web.app` (production hosting)

See `functions/index.js` for the CORS setup using the `cors` npm package.

---

## Files You Own

| File | Purpose |
|------|---------|
| `firebase.json` | Firebase project configuration (hosting + functions) |
| `functions/index.js` | Cloud Function definitions |
| `functions/package.json` | Node.js dependencies for functions |
