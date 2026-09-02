const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Multiple API Keys Parser (Comma separated)
const rawKeys = process.env.YOUTUBE_API_KEY || '';
const API_KEYS = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
let currentKeyIndex = 0;

// Helper: Active Key nikalna
function getActiveKey() {
  if (API_KEYS.length === 0) return null;
  return API_KEYS[currentKeyIndex % API_KEYS.length];
}

// Helper: Quota exhaust hone par agli key par shift karna
function rotateToNextKey() {
  if (API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.warn(`[API Switch] Shifting to next API key: Key Index ${currentKeyIndex}`);
  }
}

// 2. High-Performance In-Memory Cache (24 Hours TTL)
const searchCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Ghante

function getFromCache(query) {
  const cached = searchCache.get(query);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    searchCache.delete(query);
    return null;
  }
  return cached.data;
}

function saveToCache(query, data) {
  // Memory save rakhne ke liye agar cache 1000 se zyada ho jaye to purani entries saaf karna
  if (searchCache.size > 1000) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(query, {
    data: data,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

// 3. Search Endpoint with Multi-Key Failover + Cache
app.get('/api/search', async (req, res) => {
  try {
    const rawQuery = req.query.q ? req.query.q.trim() : 'Latest Bollywood Songs';
    const cacheKey = rawQuery.toLowerCase();

    // Step A: Pehle check karo memory me result hai ya nahi (0 API units kharch honge)
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      console.log(`[Cache Hit] Serving from memory: "${rawQuery}"`);
      return res.json(cachedData);
    }

    if (API_KEYS.length === 0) {
      return res.status(500).json({ error: 'Render par YOUTUBE_API_KEY set nahi hai.' });
    }

    // Step B: Agar cache me nahi hai, to API call karo (Retry system across all keys)
    let attempts = 0;
    let successData = null;
    let lastError = null;

    while (attempts < API_KEYS.length) {
      const activeKey = getActiveKey();
      const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(rawQuery)}&type=video&key=${activeKey}`;

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        // Agar quota limit hit hui (Status 403)
        if (response.status === 403) {
          console.warn(`[Quota Exceeded] Key index ${currentKeyIndex} is exhausted.`);
          rotateToNextKey();
          attempts++;
          continue;
        }

        if (!response.ok) {
          throw new Error(data.error ? data.error.message : 'YouTube API Error');
        }

        successData = data;
        break; // Success! Loop stop karo
      } catch (err) {
        lastError = err.message;
        rotateToNextKey();
        attempts++;
      }
    }

    // Agar saari keys try karne ke baad data mil gaya:
    if (successData) {
      saveToCache(cacheKey, successData); // Agli baar ke liye save kar lo
      return res.json(successData);
    }

    // Agar sabhi keys ka quota khatam ho gaya ho
    res.status(500).json({ 
      error: 'All YouTube API keys exhausted for today or invalid. ' + (lastError || '') 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Server Health Check & Stats
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Running',
    totalKeysConfigured: API_KEYS.length,
    activeKeyIndex: currentKeyIndex,
    cachedQueriesCount: searchCache.size
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 RAGAA Server Running on Port ${PORT} with ${API_KEYS.length} API Key(s)`);
});
