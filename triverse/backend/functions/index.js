/**
 * backend/functions/index.js — TRIVERSE Firebase Cloud Functions
 * OWNER: Dhruv
 *
 * RESPONSIBILITIES:
 *   - Expose HTTP endpoints the frontend calls
 *   - Call data-service functions (Shoaib's code)
 *   - Cache results in Firestore
 *   - Handle CORS, errors, and rate limiting
 *
 * INSTALL DEPENDENCIES (from backend/functions/ directory):
 *   npm install firebase-functions firebase-admin cors
 *
 * RUN LOCALLY:
 *   cd backend && firebase emulators:start
 *
 * ENDPOINTS EXPOSED:
 *   POST  /extractProduct  — extracts product data from a URL
 *   GET   /getPrices       — fetches price comparison for a product name
 *
 * ENDPOINT BASE URL (local):
 *   http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/
 *
 * TEST WITH CURL:
 *   curl -X POST http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/extractProduct \
 *     -H "Content-Type: application/json" \
 *     -d '{"url":"https://www.amazon.in/dp/B08XYZ"}'
 */

// ---------------------------------------------------------------------------
// IMPORTS
// ---------------------------------------------------------------------------
const { onRequest } = require('firebase-functions/v2/https');
const admin         = require('firebase-admin');
const cors          = require('cors');

// Data-service modules (Shoaib's code)
// Dhruv: adjust the path if the data-service directory moves.
// These paths are relative to functions/ — using ../../ to go up to triverse/
const { extractProduct: extractProductData } = require('../../data-service/extractor.js');
const { getPrices: getPricesData }           = require('../../data-service/priceCompare.js');

// Shared config — for collection names, cache TTL, and Firebase config
const {
  FIRESTORE_COLLECTIONS,
  CACHE_TTL_MS,
} = require('../../shared/config.js');


// ---------------------------------------------------------------------------
// FIREBASE ADMIN INIT
// ---------------------------------------------------------------------------
/**
 * admin.initializeApp() sets up the Firebase Admin SDK.
 * In Cloud Functions environment, this auto-detects credentials.
 * In the local emulator, it uses the emulator automatically.
 * Dhruv: call this ONCE — calling it multiple times throws an error.
 */
admin.initializeApp();

const db = admin.firestore(); // Firestore database reference


// ---------------------------------------------------------------------------
// CORS CONFIGURATION
// ---------------------------------------------------------------------------
/**
 * corsHandler wraps each function to allow cross-origin requests.
 * Allowed origins: localhost (dev) and your .web.app domain (prod).
 * Dhruv: update the allowedOrigins array when your Firebase Hosting domain is known.
 */
const corsHandler = cors({
  origin: [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    // Dhruv: add your Firebase Hosting URL here:
    // 'https://YOUR_PROJECT_ID.web.app',
    // 'https://YOUR_PROJECT_ID.firebaseapp.com',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});


// ---------------------------------------------------------------------------
// UTILITY: Firestore Caching
// ---------------------------------------------------------------------------

/**
 * getCachedDoc(collection, docId, ttlMs)
 *
 * Fetches a Firestore document and checks if it's within the TTL.
 * Returns the cached data if fresh, or null if expired/missing.
 *
 * Dhruv: use this in both Cloud Functions to avoid re-scraping.
 *
 * @param {string} collection - Firestore collection name (from FIRESTORE_COLLECTIONS)
 * @param {string} docId      - Document ID (usually a hash of the URL or product name)
 * @param {number} ttlMs      - Time-to-live in milliseconds (from CACHE_TTL_MS)
 * @returns {Promise<Object|null>} - Cached data or null
 */
async function getCachedDoc(collection, docId, ttlMs) {
  // Dhruv: implement Firestore cache check here
  //
  // const docRef = db.collection(collection).doc(docId);
  // const snap = await docRef.get();
  // if (!snap.exists) return null;
  // const data = snap.data();
  // const age = Date.now() - data.fetchedAt.toMillis();
  // if (age > ttlMs) return null;  // Expired
  // return data;
}

/**
 * setCachedDoc(collection, docId, data)
 *
 * Writes data to Firestore with a server timestamp.
 * Dhruv: call this after a successful scrape to cache the result.
 *
 * @param {string} collection
 * @param {string} docId
 * @param {Object} data
 */
async function setCachedDoc(collection, docId, data) {
  // Dhruv: implement Firestore write here
  //
  // const docRef = db.collection(collection).doc(docId);
  // await docRef.set({
  //   ...data,
  //   fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
  // });
}

/**
 * hashString(str)
 *
 * Creates a simple hash from a string for use as a Firestore document ID.
 * Firestore document IDs cannot contain '/', so we hash the URL/product name.
 *
 * Dhruv: use the `crypto` built-in (Node.js 18 includes it natively).
 *
 * @param {string} str
 * @returns {string} - A hex hash string safe for Firestore doc IDs
 */
function hashString(str) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(str).digest('hex');
}


// ---------------------------------------------------------------------------
// CLOUD FUNCTION 1: extractProduct
// ---------------------------------------------------------------------------

/**
 * extractProduct — POST /extractProduct
 *
 * PURPOSE:
 *   Accepts a product URL, checks Firestore cache, calls Shoaib's extractor
 *   if not cached, saves to Firestore, and returns the product JSON.
 *
 * REQUEST BODY (JSON):
 *   { "url": "https://www.amazon.in/dp/XXXXXX" }
 *
 * RESPONSE (200 OK):
 *   { product JSON object } — see data-service/README.md for shape
 *
 * RESPONSE (400 Bad Request):
 *   { "error": "URL is required" }
 *
 * RESPONSE (422 Unprocessable Entity):
 *   { "error": "Unsupported platform. Use Amazon.in or Flipkart.com" }
 *
 * RESPONSE (500 Internal Server Error):
 *   { "error": "Failed to extract product", "details": "..." }
 *
 * WHAT TO IMPLEMENT (Dhruv — fill in the try block):
 *   1. Wrap response in corsHandler
 *   2. Handle OPTIONS preflight: if req.method === 'OPTIONS', res.status(204).send('')
 *   3. Validate: only allow POST method
 *   4. Parse req.body.url — return 400 if missing
 *   5. Generate docId = hashString(url)
 *   6. Check cache: const cached = await getCachedDoc(FIRESTORE_COLLECTIONS.products, docId, CACHE_TTL_MS.product)
 *   7. If cached, return res.json(cached)
 *   8. Else: call extractProductData(url)
 *   9. Save: await setCachedDoc(FIRESTORE_COLLECTIONS.products, docId, product)
 *  10. Return res.json(product)
 *
 * RUNTIME OPTIONS:
 *   timeoutSeconds: 30  — scraping can be slow; give it enough time
 *   memory: '256MiB'    — default, fine for scraping
 *   region: 'asia-south1' — Mumbai region for lower latency in India
 */
exports.extractProduct = onRequest(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'asia-south1', // Mumbai — closest to Indian users
  },
  async (req, res) => {
    corsHandler(req, res, async () => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      try {
        // Dhruv: implement the function body here following the steps above

        // PLACEHOLDER — returns empty product so emulator doesn't crash
        res.status(200).json({
          message: 'extractProduct stub — Dhruv: implement this function',
          receivedUrl: req.body?.url || null,
        });

      } catch (error) {
        console.error('[extractProduct] Error:', error);
        res.status(500).json({
          error: 'Failed to extract product',
          details: error.message,
        });
      }
    });
  }
);


// ---------------------------------------------------------------------------
// CLOUD FUNCTION 2: getPrices
// ---------------------------------------------------------------------------

/**
 * getPrices — GET /getPrices?productName=...
 *
 * PURPOSE:
 *   Accepts a product name, checks Firestore cache, calls Shoaib's priceCompare
 *   if not cached, saves to Firestore, and returns the prices array.
 *
 * QUERY PARAMETER:
 *   productName — URL-encoded product name
 *   Example: /getPrices?productName=Wakefit+Orthopaedic+Sofa
 *
 * RESPONSE (200 OK):
 *   [ array of price objects ] — see data-service/README.md for shape
 *
 * RESPONSE (400 Bad Request):
 *   { "error": "productName query parameter is required" }
 *
 * RESPONSE (500 Internal Server Error):
 *   { "error": "Failed to fetch prices", "details": "..." }
 *
 * WHAT TO IMPLEMENT (Dhruv — fill in the try block):
 *   1. Wrap response in corsHandler
 *   2. Handle OPTIONS preflight
 *   3. Parse req.query.productName — return 400 if missing
 *   4. Generate docId = hashString(productName)
 *   5. Check cache: const cached = await getCachedDoc(FIRESTORE_COLLECTIONS.prices, docId, CACHE_TTL_MS.prices)
 *   6. If cached, return res.json(cached.results)
 *   7. Else: call getPricesData(productName)
 *   8. Save: await setCachedDoc(FIRESTORE_COLLECTIONS.prices, docId, { results: prices })
 *   9. Return res.json(prices)
 *
 * RUNTIME OPTIONS:
 *   timeoutSeconds: 30  — price comparison queries multiple platforms
 *   region: 'asia-south1'
 */
exports.getPrices = onRequest(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'asia-south1',
  },
  async (req, res) => {
    corsHandler(req, res, async () => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      try {
        // Dhruv: implement the function body here following the steps above

        // PLACEHOLDER — returns empty array so emulator doesn't crash
        res.status(200).json({
          message: 'getPrices stub — Dhruv: implement this function',
          receivedProductName: req.query?.productName || null,
          prices: [],
        });

      } catch (error) {
        console.error('[getPrices] Error:', error);
        res.status(500).json({
          error: 'Failed to fetch prices',
          details: error.message,
        });
      }
    });
  }
);
